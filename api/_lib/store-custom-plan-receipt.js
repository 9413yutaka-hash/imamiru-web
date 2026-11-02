// ==========================================================================
// STEP 54｜店舗カード月額100円(店舗プロフィールカスタマイズプラン)の領収書(代表正式決定 2026-11-02)
// ==========================================================================
// 既存の請求台帳(storeCustomPlanInvoices)と Stripe の PaymentIntent を照合し、支払いが成功した請求書にだけ
// 領収書を発行する。新しい請求の方式は作らない(Stripe へは GET /payment_intents/{id} で照会するだけ)。
//   発行の条件：ログイン中のメール確認済み店舗アカウントが、その請求書の請求先(billingAccountUid)／
//     台帳が支払い済み(status "paid"・paymentIntentStatus "succeeded"・paidAt あり・PaymentIntent の ID あり)／
//     環境と請求の種類が一致(Production は本番の請求 live・Preview 試験の請求書は不可、Production 以外はテスト test)／
//     Stripe の PaymentIntent が succeeded・金額(amount_received)・円・metadata の請求書IDが台帳と一致。
//     未払い・決済処理中・結果不明・失敗・照会できない時は発行しない(台帳の表示だけで支払い成功と推定しない)。
//   記録：storeCustomPlanReceipts/{請求書ID}(請求書1件に領収書1件。2回目以降は同じ領収書を返す＝重複発行しない)。
//     領収書番号・金額・支払日・発行日は発行の時に確定し、以後変えない(店舗名などの今の情報で書き換えない)。
//   宛名：発行の前に店主が入力(未入力は登録店舗名)。発行後の訂正は訂正の記録(訂正前・訂正後・日時・操作したアカウント)を
//     残して行う(最大20回)。金額・支払日・番号は変わらない。
//   返金：台帳の返金の記録(refundedAmountJpy・refundedAt)がある時は、領収書に返金済みであることを示す(元の記録は消さない)。
//   表示名は「マチナウ」(サービス名)。事業者の情報は特定商取引法に基づく表記(tokushoho.html)と同じ値を使う(試験で一致を確認)。
//     適格請求書発行事業者の登録番号は無い(未登録)ため表示せず、適格請求書ではないことを明記する。
//   退会の後も、領収書の記録は請求書・支払いの記録と同じく残す(store-account-deletion.js は消さない)。
// このファイルは Vercel Function ではない(api/moderate-submission.js から呼ばれる)。
// ==========================================================================

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  createHash
} from "node:crypto";

import {
  STORE_CUSTOM_PLAN_INVOICES_COLLECTION,
  readStripeChargeConfig,
  readStripeLiveChargeConfig
} from "./store-billing.js";

import {
  stripeRequest
} from "./imadake-monthly-charge.js";

import {
  requireVerifiedStoreUser
} from "./store-self-service.js";

import {
  ACCOUNT_DELETIONS_COLLECTION
} from "./account-deletion-state.js";

export const STORE_CUSTOM_PLAN_RECEIPTS_COLLECTION = "storeCustomPlanReceipts";
const STORE_ACCOUNTS_COLLECTION = "storeAccounts";

// 領収書の発行者の表示(代表決定：表示名は「マチナウ」)。事業者の情報は特定商取引法に基づく表記と同じ。
export const STORE_CUSTOM_PLAN_RECEIPT_ISSUER = Object.freeze({
  serviceName: "マチナウ",
  sellerName: "上田 豊",
  address: "沖縄県八重瀬町港川174",
  email: "9413yutaka@gmail.com"
});
export const STORE_CUSTOM_PLAN_RECEIPT_PURPOSE = "マチナウ 店舗プロフィールカスタマイズプラン利用料として";
export const STORE_CUSTOM_PLAN_RECEIPT_PAYMENT_METHOD = "クレジットカード決済";
export const STORE_CUSTOM_PLAN_RECEIPT_ADDRESSEE_MAX_LENGTH = 60;
export const STORE_CUSTOM_PLAN_RECEIPT_CORRECTION_MAX = 20;

const INVOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}_\d{4}-(0[1-9]|1[0-2])$/;
const PAYMENT_INTENT_ID_PATTERN = /^pi_[A-Za-z0-9_]{1,100}$/;

function nowOf(deps) {
  return deps && typeof deps.now === "function" ? deps.now() : Date.now();
}

function millisOf(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function sendError(response, status, reason, extra) {
  return response.status(status).json(Object.assign({ success: false, reason: reason }, extra || {}));
}

function readInvoiceId(body) {
  const id = body && typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
  return INVOICE_ID_PATTERN.test(id) ? id : "";
}

// 宛名：前後の空白を除き(改行・タブは半角の空白1つにする。全角の空白など入力の文字は変えない)、制御文字を含まない
// 60文字まで。空は「未入力」(null を返すのは不正な値)。
export function normalizeReceiptAddressee(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/[\t\n\r ]+/g, " ").trim();

  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || trimmed.length > STORE_CUSTOM_PLAN_RECEIPT_ADDRESSEE_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

// 領収書番号：請求書ID から決まる(同じ支払いで番号が変わらない)。例 MN-202611-1A2B3C4D。
export function storeCustomPlanReceiptNumber(invoiceId, month) {
  const digest = createHash("sha256").update("store-custom-plan-receipt:" + invoiceId).digest("hex").slice(0, 8).toUpperCase();
  return "MN-" + String(month || "").replace("-", "") + "-" + digest;
}

// 台帳から見た発行の可否(Stripe には照会しない)。{ ok } か { ok:false, reason, status }。
export function readReceiptLedgerState(invoice, env) {
  const production = !!env && env.VERCEL_ENV === "production";

  if (!invoice) {
    return { ok: false, reason: "invoice_not_found", status: 404 };
  }

  if (invoice.status !== "paid") {
    const reason = ["charging", "processing", "requires_action"].includes(invoice.status)
      ? "payment_processing"
      : ["needs_review", "charge_error"].includes(invoice.status)
        ? "payment_unconfirmed"
        : invoice.status === "payment_failed"
          ? "payment_failed"
          : "not_paid";
    return { ok: false, reason: reason, status: 409 };
  }

  if (
    invoice.paymentIntentStatus !== "succeeded" ||
    !PAYMENT_INTENT_ID_PATTERN.test(String(invoice.paymentIntentId || "")) ||
    millisOf(invoice.paidAt) <= 0 ||
    !Number.isInteger(invoice.amountJpy) ||
    invoice.amountJpy <= 0 ||
    invoice.chargeOutcomeUnknown === true
  ) {
    return { ok: false, reason: "payment_unconfirmed", status: 409 };
  }

  if (production ? invoice.chargeMode !== "live" || invoice.createdInPreview === true : invoice.chargeMode !== "test") {
    return { ok: false, reason: "environment_mismatch", status: 409 };
  }

  return { ok: true };
}

// Stripe の照会に使う設定。請求のスイッチとは無関係(照会だけ。支払い済みの領収書は請求を止めた後も出せる)。
function readReceiptStripeConfig(env) {
  const production = !!env && env.VERCEL_ENV === "production";
  return production ? readStripeLiveChargeConfig(env) : readStripeChargeConfig(env);
}

// Stripe の PaymentIntent が、台帳の請求書の支払い成功と一致するか。
export async function verifyReceiptPaymentWithStripe(invoiceId, invoice, deps) {
  const config = readReceiptStripeConfig(deps && deps.env);

  if (!config.ok) {
    return { ok: false, reason: "stripe_unavailable", status: 503 };
  }

  const fetched = await stripeRequest(config, deps, "GET", "/payment_intents/" + invoice.paymentIntentId, {}, null);

  if (!fetched || !fetched.ok || !fetched.data) {
    return { ok: false, reason: "stripe_unavailable", status: 503 };
  }

  const pi = fetched.data;
  const received = Number.isInteger(pi.amount_received) ? pi.amount_received : -1;
  const metadata = pi.metadata && typeof pi.metadata === "object" ? pi.metadata : {};

  if (
    pi.id !== invoice.paymentIntentId ||
    pi.status !== "succeeded" ||
    received !== invoice.amountJpy ||
    String(pi.currency || "").toLowerCase() !== "jpy" ||
    metadata.invoiceId !== invoiceId ||
    metadata.machinauProduct !== "store_custom_plan"
  ) {
    return { ok: false, reason: "payment_unconfirmed", status: 409 };
  }

  return { ok: true, amountJpy: received };
}

// 台帳の返金の記録(STEP 54-B：運営が Stripe に照会して記録したもの)。成立した返金だけを返金額に数える。
function readRefund(invoice) {
  const amount = Number.isInteger(invoice && invoice.refundedAmountJpy) ? invoice.refundedAmountJpy : 0;
  const pending = !!invoice && invoice.refundState === "pending";

  if (amount <= 0 && !pending) {
    return null;
  }

  return {
    amountJpy: amount,
    refundedAtMillis: millisOf(invoice.refundedAt),
    full: amount > 0 && amount >= (Number(invoice.amountJpy) || 0),
    pending: pending
  };
}

function describeReceipt(receipt, invoice) {
  const history = Array.isArray(receipt.addresseeHistory) ? receipt.addresseeHistory : [];

  return {
    receiptNumber: receipt.receiptNumber,
    invoiceId: receipt.invoiceId,
    storeId: receipt.storeId,
    month: receipt.month,
    amountJpy: receipt.amountJpy,
    currency: receipt.currency,
    taxIncluded: receipt.taxIncluded === true,
    paidAtMillis: millisOf(receipt.paidAt),
    issuedAtMillis: millisOf(receipt.issuedAt),
    addressee: receipt.addressee,
    purpose: receipt.purpose,
    paymentMethod: receipt.paymentMethod,
    issuer: receipt.issuer,
    corrections: history
      .filter(function(entry) { return entry && entry.kind === "corrected"; })
      .map(function(entry) { return { previous: entry.previous, addressee: entry.addressee, correctedAtMillis: millisOf(entry.at) }; }),
    refund: readRefund(invoice),
    testMode: receipt.chargeMode === "test"
  };
}

async function readStoreName(database, storeId) {
  const snapshot = await database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get();
  const account = snapshot.exists ? snapshot.data() || {} : {};
  return typeof account.storeName === "string" ? account.storeName.trim().slice(0, STORE_CUSTOM_PLAN_RECEIPT_ADDRESSEE_MAX_LENGTH) : "";
}

// 店主の請求書と領収書(請求先＝ログイン中のアカウントだけ。他のアカウント・他の店舗は区別せず not_found)。
async function readOwn(database, invoiceId, uid) {
  const [invoiceSnapshot, receiptSnapshot] = await Promise.all([
    database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(invoiceId).get(),
    database.collection(STORE_CUSTOM_PLAN_RECEIPTS_COLLECTION).doc(invoiceId).get()
  ]);
  const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

  if (!invoice || invoice.billingAccountUid !== uid) {
    return null;
  }

  const receipt = receiptSnapshot.exists ? receiptSnapshot.data() || {} : null;

  return { invoice: invoice, receipt: receipt && receipt.billingAccountUid === uid ? receipt : null };
}

// 台帳と Stripe の照合が済んだ請求書の領収書を、トランザクションで1件だけ作る(既にあればそれを返す)。
// 店主の発行(kind "issued")と、運営による退会後の再提供での発行(kind "issued_by_operator")で共通。
async function issueReceipt(database, deps, invoiceId, checkedInvoice, amountJpy, requestedAddressee, actorUid, kind) {
  const storeName = await readStoreName(database, checkedInvoice.storeId);
  const addressee = requestedAddressee !== "" ? requestedAddressee : storeName;
  const nowTimestamp = Timestamp.fromMillis(nowOf(deps));
  const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(invoiceId);
  const receiptRef = database.collection(STORE_CUSTOM_PLAN_RECEIPTS_COLLECTION).doc(invoiceId);

  return database.runTransaction(async function(transaction) {
    const receiptSnapshot = await transaction.get(receiptRef);
    const invoiceSnapshot = await transaction.get(invoiceRef);
    const latest = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

    if (receiptSnapshot.exists) {
      return { receipt: receiptSnapshot.data() || {}, invoice: latest, already: true };
    }

    // 照会の間に台帳が変わっていないか(支払い済み・同じ支払い・同じ請求先)をもう一度確かめる。
    if (
      !latest ||
      latest.billingAccountUid !== checkedInvoice.billingAccountUid ||
      latest.paymentIntentId !== checkedInvoice.paymentIntentId ||
      !readReceiptLedgerState(latest, deps.env).ok
    ) {
      return { conflict: true };
    }

    const receipt = {
      receiptNumber: storeCustomPlanReceiptNumber(invoiceId, latest.month),
      invoiceId: invoiceId,
      storeId: latest.storeId,
      month: latest.month,
      amountJpy: amountJpy,
      currency: "JPY",
      taxIncluded: true,
      paidAt: latest.paidAt,
      paymentIntentId: latest.paymentIntentId,
      chargeMode: latest.chargeMode,
      billingAccountUid: latest.billingAccountUid,
      storeNameAtIssue: storeName,
      addressee: addressee,
      addresseeHistory: [{ kind: kind, addressee: addressee, previous: "", at: nowTimestamp, byUid: actorUid }],
      purpose: STORE_CUSTOM_PLAN_RECEIPT_PURPOSE,
      paymentMethod: STORE_CUSTOM_PLAN_RECEIPT_PAYMENT_METHOD,
      issuer: Object.assign({}, STORE_CUSTOM_PLAN_RECEIPT_ISSUER),
      issuedAt: nowTimestamp,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    transaction.set(receiptRef, receipt);
    return { receipt: Object.assign({}, receipt), invoice: latest, already: false };
  });
}

// mode: storeCustomPlanReceiptGet (POST) { invoiceId }
// 発行済みならその領収書を返す。未発行で台帳が支払い済みなら、発行前の確認(宛名の既定値＝登録店舗名)を返す。
export async function handleStoreCustomPlanReceiptGet(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const invoiceId = readInvoiceId(deps.readRequestBody(request));

    if (invoiceId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const own = await readOwn(database, invoiceId, actor.uid);

    if (!own) {
      return sendError(response, 404, "invoice_not_found");
    }

    if (own.receipt) {
      return response.status(200).json({ success: true, issued: true, receipt: describeReceipt(own.receipt, own.invoice) });
    }

    const state = readReceiptLedgerState(own.invoice, deps.env);

    if (!state.ok) {
      return sendError(response, state.status, state.reason);
    }

    return response.status(200).json({
      success: true,
      issued: false,
      preview: {
        invoiceId: invoiceId,
        month: own.invoice.month,
        amountJpy: own.invoice.amountJpy,
        taxIncluded: own.invoice.taxIncluded === true,
        paidAtMillis: millisOf(own.invoice.paidAt),
        defaultAddressee: await readStoreName(database, own.invoice.storeId),
        purpose: STORE_CUSTOM_PLAN_RECEIPT_PURPOSE,
        paymentMethod: STORE_CUSTOM_PLAN_RECEIPT_PAYMENT_METHOD,
        issuer: STORE_CUSTOM_PLAN_RECEIPT_ISSUER,
        testMode: own.invoice.chargeMode === "test"
      }
    });
  } catch (error) {
    console.error("店舗カスタマイズ：領収書の取得エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeCustomPlanReceiptIssue (POST) { invoiceId, addressee? }
// 台帳と Stripe の照合が通った時だけ発行する。発行済みなら同じ領収書を返す(宛名は変えない)。
export async function handleStoreCustomPlanReceiptIssue(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const invoiceId = readInvoiceId(body);
    const requestedAddressee = normalizeReceiptAddressee(body.addressee);

    if (invoiceId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    if (requestedAddressee === null) {
      return sendError(response, 400, "invalid_input", { field: "addressee" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const own = await readOwn(database, invoiceId, actor.uid);

    if (!own) {
      return sendError(response, 404, "invoice_not_found");
    }

    if (own.receipt) {
      return response.status(200).json({ success: true, issued: true, alreadyIssued: true, receipt: describeReceipt(own.receipt, own.invoice) });
    }

    const state = readReceiptLedgerState(own.invoice, deps.env);

    if (!state.ok) {
      return sendError(response, state.status, state.reason);
    }

    const verified = await verifyReceiptPaymentWithStripe(invoiceId, own.invoice, deps);

    if (!verified.ok) {
      return sendError(response, verified.status, verified.reason);
    }

    const result = await issueReceipt(database, deps, invoiceId, own.invoice, verified.amountJpy, requestedAddressee, actor.uid, "issued");

    if (result.conflict) {
      return sendError(response, 409, "payment_unconfirmed");
    }

    return response.status(200).json({ success: true, issued: true, alreadyIssued: result.already, receipt: describeReceipt(result.receipt, result.invoice) });
  } catch (error) {
    console.error("店舗カスタマイズ：領収書の発行エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeCustomPlanReceiptCorrectAddressee (POST) { invoiceId, addressee }
// 発行済みの領収書の宛名だけを訂正する(訂正の記録を残す。金額・支払日・番号・発行日は変えない)。
export async function handleStoreCustomPlanReceiptCorrectAddressee(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const invoiceId = readInvoiceId(body);
    const addressee = normalizeReceiptAddressee(body.addressee);

    if (invoiceId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    if (addressee === null || addressee === "") {
      return sendError(response, 400, "invalid_input", { field: "addressee" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(invoiceId);
    const receiptRef = database.collection(STORE_CUSTOM_PLAN_RECEIPTS_COLLECTION).doc(invoiceId);
    const nowTimestamp = Timestamp.fromMillis(nowOf(deps));

    const result = await database.runTransaction(async function(transaction) {
      const receiptSnapshot = await transaction.get(receiptRef);
      const invoiceSnapshot = await transaction.get(invoiceRef);
      const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;
      const receipt = receiptSnapshot.exists ? receiptSnapshot.data() || {} : null;

      if (!invoice || invoice.billingAccountUid !== actor.uid) {
        return { error: [404, "invoice_not_found"] };
      }

      if (!receipt || receipt.billingAccountUid !== actor.uid) {
        return { error: [409, "receipt_not_issued"] };
      }

      const history = Array.isArray(receipt.addresseeHistory) ? receipt.addresseeHistory : [];

      if (receipt.addressee === addressee) {
        return { receipt: receipt, invoice: invoice, changed: false };
      }

      if (history.filter(function(entry) { return entry && entry.kind === "corrected"; }).length >= STORE_CUSTOM_PLAN_RECEIPT_CORRECTION_MAX) {
        return { error: [429, "too_many_corrections"] };
      }

      const nextHistory = history.concat([{ kind: "corrected", addressee: addressee, previous: receipt.addressee, at: nowTimestamp, byUid: actor.uid }]);
      transaction.update(receiptRef, { addressee: addressee, addresseeHistory: nextHistory, updatedAt: FieldValue.serverTimestamp() });
      return { receipt: Object.assign({}, receipt, { addressee: addressee, addresseeHistory: nextHistory }), invoice: invoice, changed: true };
    });

    if (result.error) {
      return sendError(response, result.error[0], result.error[1]);
    }

    return response.status(200).json({ success: true, changed: result.changed, receipt: describeReceipt(result.receipt, result.invoice) });
  } catch (error) {
    console.error("店舗カスタマイズ：領収書の宛名の訂正エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// ==========================================================================
// STEP 54-B｜返金の記録の同期(Stripe で成立した返金を、請求台帳と領収書に反映する)
// ==========================================================================
// 返金の操作そのものは Stripe の管理画面で行う(今だけ投稿の返金と同じ方針。マチナウからは返金を作らない)。
// 運営が「Stripe の返金を確認」を押すと、Stripe に GET で照会し、成立した返金だけを記録する：
//   1. 請求書が支払い済みで、記録した PaymentIntent が Stripe 上でもこの請求書の支払いとして succeeded(発行と同じ照合)。
//   2. GET /v1/refunds?payment_intent=… を最後まで読めたこと(形が違う・別の支払いの返金が混じる・返金の合計が
//      支払額を超える時は何も書かない)。請求専用キーに返金の読み取りの権限が無い時(401・403)は refund_permission_missing
//      として何も書かない(成功扱いにしない)。
//   3. 返金1件ごとに storeCustomPlanRefunds/{Stripe の返金ID}(同じ返金は同じ文書＝二重に数えない)。状態は Stripe の値の
//      まま区別し、変わった時は履歴に残す。請求書には集計(refundedAmountJpy・refundedAt・refundState・照合の履歴)だけを足し、
//      状態(paid)・支払日時・領収書の記録は変えない(元の領収書は消さない)。全額・一部・処理中を区別する。
// 運営だけ(requireAdmin)。Stripe には GET だけ。キーの値・Stripe の応答本文は出さない。

export const STORE_CUSTOM_PLAN_REFUNDS_COLLECTION = "storeCustomPlanRefunds";
export const STORE_CUSTOM_PLAN_REFUND_STATUSES = ["pending", "requires_action", "succeeded", "failed", "canceled"];
const REFUND_IN_PROGRESS_STATUSES = ["pending", "requires_action"];
const REFUND_ID_PATTERN = /^re_[A-Za-z0-9_]{1,100}$/;
const REFUND_LIST_MAX_PAGES = 10;
const REFUND_SYNC_HISTORY_LIMIT = 20;

// Stripe の返金の一覧を最後まで読む。{ ok, refunds } か { ok:false, reason, status }。
async function listStripeRefunds(config, deps, paymentIntentId) {
  const refunds = [];
  let startingAfter = "";

  for (let page = 0; page < REFUND_LIST_MAX_PAGES; page++) {
    const params = { "payment_intent": paymentIntentId, "limit": 100 };

    if (startingAfter !== "") {
      params["starting_after"] = startingAfter;
    }

    const fetched = await stripeRequest(config, deps, "GET", "/refunds", params, null);

    if (!fetched || !fetched.ok) {
      const status = fetched ? fetched.status : 0;
      return status === 401 || status === 403
        ? { ok: false, reason: "refund_permission_missing", status: 403 }
        : { ok: false, reason: "stripe_unavailable", status: 503 };
    }

    const data = fetched.data;

    if (!data || data.object !== "list" || !Array.isArray(data.data) || typeof data.has_more !== "boolean") {
      return { ok: false, reason: "refund_list_invalid", status: 502 };
    }

    for (const item of data.data) {
      if (
        !item ||
        item.object !== "refund" ||
        !REFUND_ID_PATTERN.test(String(item.id || "")) ||
        item.payment_intent !== paymentIntentId ||
        String(item.currency || "").toLowerCase() !== "jpy" ||
        !Number.isInteger(item.amount) ||
        item.amount <= 0 ||
        !STORE_CUSTOM_PLAN_REFUND_STATUSES.includes(item.status)
      ) {
        return { ok: false, reason: "refund_list_invalid", status: 502 };
      }

      refunds.push({ id: item.id, amountJpy: item.amount, status: item.status, createdMillis: Number.isInteger(item.created) ? item.created * 1000 : 0 });
    }

    if (!data.has_more) {
      return { ok: true, refunds: refunds };
    }

    startingAfter = refunds.length > 0 ? refunds[refunds.length - 1].id : "";

    if (startingAfter === "") {
      return { ok: false, reason: "refund_list_invalid", status: 502 };
    }
  }

  return { ok: false, reason: "refund_list_too_long", status: 502 };
}

// 成立した返金(succeeded)だけを返金額に数える。処理中(pending・requires_action)は別に数える。失敗・取消しは数えない。
export function summarizeStoreCustomPlanRefunds(refunds, paidAmountJpy) {
  const succeeded = refunds.filter(function(refund) { return refund.status === "succeeded"; });
  const refundedAmountJpy = succeeded.reduce(function(sum, refund) { return sum + refund.amountJpy; }, 0);
  const pendingAmountJpy = refunds
    .filter(function(refund) { return REFUND_IN_PROGRESS_STATUSES.includes(refund.status); })
    .reduce(function(sum, refund) { return sum + refund.amountJpy; }, 0);
  const refundedAtMillis = succeeded.reduce(function(latest, refund) { return Math.max(latest, refund.createdMillis); }, 0);
  const refundState = refundedAmountJpy > 0 && refundedAmountJpy >= paidAmountJpy
    ? "full"
    : pendingAmountJpy > 0
      ? "pending"
      : refundedAmountJpy > 0
        ? "partial"
        : "none";

  return { refundedAmountJpy: refundedAmountJpy, pendingAmountJpy: pendingAmountJpy, refundedAtMillis: refundedAtMillis, refundState: refundState };
}

// mode: adminStoreCustomPlanRefundSync (POST、運営のみ) { invoiceId }
export async function handleAdminStoreCustomPlanRefundSync(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const invoiceId = readInvoiceId(deps.readRequestBody(request));

    if (invoiceId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(invoiceId);
    const invoiceSnapshot = await invoiceRef.get();
    const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;
    const state = readReceiptLedgerState(invoice, deps.env);

    if (!state.ok) {
      return sendError(response, state.status, state.reason);
    }

    const verified = await verifyReceiptPaymentWithStripe(invoiceId, invoice, deps);

    if (!verified.ok) {
      return sendError(response, verified.status, verified.reason);
    }

    const listed = await listStripeRefunds(readReceiptStripeConfig(deps.env), deps, invoice.paymentIntentId);

    if (!listed.ok) {
      return sendError(response, listed.status, listed.reason);
    }

    const summary = summarizeStoreCustomPlanRefunds(listed.refunds, invoice.amountJpy);

    if (summary.refundedAmountJpy + summary.pendingAmountJpy > invoice.amountJpy) {
      return sendError(response, 409, "refund_amount_exceeds_payment");
    }

    const adminUid = authResult.actor && authResult.actor.uid ? authResult.actor.uid : "";
    const nowTimestamp = Timestamp.fromMillis(nowOf(deps));
    const refundRefs = listed.refunds.map(function(refund) { return database.collection(STORE_CUSTOM_PLAN_REFUNDS_COLLECTION).doc(refund.id); });

    const result = await database.runTransaction(async function(transaction) {
      const latestSnapshot = await transaction.get(invoiceRef);
      const latest = latestSnapshot.exists ? latestSnapshot.data() || {} : null;
      const existing = [];

      for (const ref of refundRefs) {
        existing.push(await transaction.get(ref));
      }

      if (!latest || latest.paymentIntentId !== invoice.paymentIntentId || latest.status !== "paid") {
        return { conflict: true };
      }

      // 別の請求書の記録になっている返金IDが来たら、何も書かない(取り違えを防ぐ)。
      if (existing.some(function(snapshot) { return snapshot.exists && (snapshot.data() || {}).invoiceId !== invoiceId; })) {
        return { conflict: true };
      }

      let changed = 0;

      listed.refunds.forEach(function(refund, index) {
        const before = existing[index].exists ? existing[index].data() || {} : null;

        if (before && before.status === refund.status && before.amountJpy === refund.amountJpy) {
          return;
        }

        const history = before && Array.isArray(before.statusHistory) ? before.statusHistory : [];
        transaction.set(refundRefs[index], {
          refundId: refund.id,
          invoiceId: invoiceId,
          storeId: latest.storeId,
          paymentIntentId: latest.paymentIntentId,
          amountJpy: refund.amountJpy,
          currency: "JPY",
          status: refund.status,
          stripeCreatedAt: refund.createdMillis > 0 ? Timestamp.fromMillis(refund.createdMillis) : null,
          firstSeenAt: before && before.firstSeenAt ? before.firstSeenAt : nowTimestamp,
          statusHistory: history.concat([{ status: refund.status, at: nowTimestamp, byUid: adminUid }]).slice(-REFUND_SYNC_HISTORY_LIMIT),
          updatedAt: FieldValue.serverTimestamp()
        });
        changed++;
      });

      const syncHistory = Array.isArray(latest.refundSyncHistory) ? latest.refundSyncHistory : [];
      transaction.update(invoiceRef, {
        refundedAmountJpy: summary.refundedAmountJpy,
        refundPendingAmountJpy: summary.pendingAmountJpy,
        refundedAt: summary.refundedAtMillis > 0 ? Timestamp.fromMillis(summary.refundedAtMillis) : null,
        refundState: summary.refundState,
        refundSyncedAt: nowTimestamp,
        refundSyncHistory: syncHistory.concat([{ at: nowTimestamp, byUid: adminUid, refundState: summary.refundState, refundedAmountJpy: summary.refundedAmountJpy, refundCount: listed.refunds.length }]).slice(-REFUND_SYNC_HISTORY_LIMIT),
        updatedAt: FieldValue.serverTimestamp()
      });

      return { changed: changed };
    });

    if (result.conflict) {
      return sendError(response, 409, "refund_record_conflict");
    }

    return response.status(200).json({
      success: true,
      invoiceId: invoiceId,
      refundState: summary.refundState,
      refundedAmountJpy: summary.refundedAmountJpy,
      pendingAmountJpy: summary.pendingAmountJpy,
      refundCount: listed.refunds.length,
      changedRefunds: result.changed
    });
  } catch (error) {
    console.error("店舗カスタマイズ：返金の照合エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// ==========================================================================
// STEP 54-B｜退会後の領収書の再提供(運営が本人確認をしたうえで表示し、提供の記録を残す)
// ==========================================================================
// 退会でログインが削除された店主は領収書の画面を開けないため、運営が本人を確かめた後に領収書を表示して渡す。
//   運営だけ(requireAdmin)。本人確認の方法(登録メールへの返信・電話・対面・その他)とメモ(200文字まで)が必須。
//   領収書が発行済みならそれを返す。未発行なら、店主の発行と同じ照合(台帳・Stripe)の後に1件だけ発行する
//   (宛名は運営が入力、未入力は登録店舗名)。
//   提供ごとに storeCustomPlanReceiptProvisions に記録(請求書ID・領収書番号・運営の uid・日時・本人確認の方法とメモ・
//   その時の退会の状態)。退会したアカウントのログイン・メールアドレスなどは復元しない(返すのは領収書の記載だけ)。
//   公開の URL からは見られない(運営のログインが必要)。

export const STORE_CUSTOM_PLAN_RECEIPT_PROVISIONS_COLLECTION = "storeCustomPlanReceiptProvisions";
export const STORE_CUSTOM_PLAN_RECEIPT_VERIFICATION_METHODS = ["registered_email", "phone", "in_person", "other"];
const VERIFICATION_NOTE_MAX_LENGTH = 200;
const PROVISION_LIST_LIMIT = 50;

function readVerification(body) {
  const method = body && typeof body.verificationMethod === "string" ? body.verificationMethod : "";
  const raw = body && typeof body.verificationNote === "string" ? body.verificationNote : "";
  const note = raw.replace(/[\t\n\r ]+/g, " ").trim();

  if (!STORE_CUSTOM_PLAN_RECEIPT_VERIFICATION_METHODS.includes(method)) {
    return { ok: false, field: "verificationMethod" };
  }

  if (note === "" || note.length > VERIFICATION_NOTE_MAX_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) {
    return { ok: false, field: "verificationNote" };
  }

  return { ok: true, method: method, note: note };
}

// mode: adminStoreCustomPlanReceiptProvide (POST、運営のみ) { invoiceId, verificationMethod, verificationNote, addressee? }
export async function handleAdminStoreCustomPlanReceiptProvide(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const invoiceId = readInvoiceId(body);
    const verification = readVerification(body);
    const requestedAddressee = normalizeReceiptAddressee(body.addressee);

    if (invoiceId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    if (!verification.ok) {
      return sendError(response, 400, "verification_required", { field: verification.field });
    }

    if (requestedAddressee === null) {
      return sendError(response, 400, "invalid_input", { field: "addressee" });
    }

    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const [invoiceSnapshot, receiptSnapshot] = await Promise.all([
      database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(invoiceId).get(),
      database.collection(STORE_CUSTOM_PLAN_RECEIPTS_COLLECTION).doc(invoiceId).get()
    ]);
    const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

    if (!invoice) {
      return sendError(response, 404, "invoice_not_found");
    }

    const adminUid = authResult.actor && authResult.actor.uid ? authResult.actor.uid : "";
    let receipt = receiptSnapshot.exists ? receiptSnapshot.data() || {} : null;
    let issuedNow = false;

    if (!receipt) {
      const state = readReceiptLedgerState(invoice, deps.env);

      if (!state.ok) {
        return sendError(response, state.status, state.reason);
      }

      const verified = await verifyReceiptPaymentWithStripe(invoiceId, invoice, deps);

      if (!verified.ok) {
        return sendError(response, verified.status, verified.reason);
      }

      const issued = await issueReceipt(database, deps, invoiceId, invoice, verified.amountJpy, requestedAddressee, adminUid, "issued_by_operator");

      if (issued.conflict) {
        return sendError(response, 409, "payment_unconfirmed");
      }

      receipt = issued.receipt;
      issuedNow = issued.already !== true;
    }

    const deletionSnapshot = await database.collection(ACCOUNT_DELETIONS_COLLECTION).doc(String(invoice.billingAccountUid || "-")).get();
    const deletion = deletionSnapshot.exists ? deletionSnapshot.data() || {} : null;
    const nowMs = nowOf(deps);
    const provisionId = invoiceId + "_" + nowMs;

    await database.collection(STORE_CUSTOM_PLAN_RECEIPT_PROVISIONS_COLLECTION).doc(provisionId).set({
      invoiceId: invoiceId,
      receiptNumber: receipt.receiptNumber,
      storeId: invoice.storeId,
      providedByUid: adminUid,
      providedAt: Timestamp.fromMillis(nowMs),
      verificationMethod: verification.method,
      verificationNote: verification.note,
      issuedNow: issuedNow,
      ownerAccountDeletionStatus: deletion && typeof deletion.status === "string" ? deletion.status : "",
      createdAt: FieldValue.serverTimestamp()
    });

    return response.status(200).json({ success: true, issued: true, issuedNow: issuedNow, provisionId: provisionId, receipt: describeReceipt(receipt, invoice) });
  } catch (error) {
    console.error("店舗カスタマイズ：領収書の再提供エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminStoreCustomPlanReceiptProvisionList (POST、運営のみ) { invoiceId? }  提供の記録(新しい順に50件まで)
export async function handleAdminStoreCustomPlanReceiptProvisionList(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const invoiceId = readInvoiceId(deps.readRequestBody(request) || {});
    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const collection = database.collection(STORE_CUSTOM_PLAN_RECEIPT_PROVISIONS_COLLECTION);
    const snapshot = invoiceId !== "" ? await collection.where("invoiceId", "==", invoiceId).get() : await collection.get();
    const items = snapshot.docs
      .map(function(documentSnapshot) {
        const data = documentSnapshot.data() || {};
        return {
          provisionId: documentSnapshot.id,
          invoiceId: data.invoiceId,
          receiptNumber: data.receiptNumber,
          providedAtMillis: millisOf(data.providedAt),
          verificationMethod: data.verificationMethod,
          verificationNote: data.verificationNote,
          issuedNow: data.issuedNow === true,
          ownerAccountDeletionStatus: data.ownerAccountDeletionStatus || ""
        };
      })
      .sort(function(a, b) { return b.providedAtMillis - a.providedAtMillis; })
      .slice(0, PROVISION_LIST_LIMIT);

    return response.status(200).json({ success: true, items: items });
  } catch (error) {
    console.error("店舗カスタマイズ：領収書の提供の記録エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
