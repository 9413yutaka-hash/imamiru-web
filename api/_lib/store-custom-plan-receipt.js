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

function readRefund(invoice) {
  const amount = Number.isInteger(invoice && invoice.refundedAmountJpy) ? invoice.refundedAmountJpy : 0;

  if (amount <= 0) {
    return null;
  }

  return {
    amountJpy: amount,
    refundedAtMillis: millisOf(invoice.refundedAt),
    full: amount >= (Number(invoice.amountJpy) || 0)
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

    const storeName = await readStoreName(database, own.invoice.storeId);
    const addressee = requestedAddressee !== "" ? requestedAddressee : storeName;
    const nowTimestamp = Timestamp.fromMillis(nowOf(deps));
    const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(invoiceId);
    const receiptRef = database.collection(STORE_CUSTOM_PLAN_RECEIPTS_COLLECTION).doc(invoiceId);

    const result = await database.runTransaction(async function(transaction) {
      const receiptSnapshot = await transaction.get(receiptRef);
      const invoiceSnapshot = await transaction.get(invoiceRef);
      const latest = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

      if (receiptSnapshot.exists) {
        return { receipt: receiptSnapshot.data() || {}, invoice: latest, already: true };
      }

      // 照会の間に台帳が変わっていないか(支払い済み・同じ支払い・同じ請求先)をもう一度確かめる。
      if (
        !latest ||
        latest.billingAccountUid !== actor.uid ||
        latest.paymentIntentId !== own.invoice.paymentIntentId ||
        !readReceiptLedgerState(latest, deps.env).ok
      ) {
        return { conflict: true };
      }

      const receipt = {
        receiptNumber: storeCustomPlanReceiptNumber(invoiceId, latest.month),
        invoiceId: invoiceId,
        storeId: latest.storeId,
        month: latest.month,
        amountJpy: verified.amountJpy,
        currency: "JPY",
        taxIncluded: true,
        paidAt: latest.paidAt,
        paymentIntentId: latest.paymentIntentId,
        chargeMode: latest.chargeMode,
        billingAccountUid: actor.uid,
        storeNameAtIssue: storeName,
        addressee: addressee,
        addresseeHistory: [{ kind: "issued", addressee: addressee, previous: "", at: nowTimestamp, byUid: actor.uid }],
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
