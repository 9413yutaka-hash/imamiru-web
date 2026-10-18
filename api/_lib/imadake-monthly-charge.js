// ==========================================================================
// 今だけ投稿 決済 STEP 32-C｜月次請求(確定済みの請求書を、登録カードへStripeで請求、サーバー側のみ)
// ==========================================================================
// 対象：imadakeMonthlyInvoices/{storeId}_{YYYY-MM} のうち status "closed"(STEP 32-Bで確定済み)。
// 請求先：storeBilling/{storeId}.{mode} の正式な paymentMethodId(A案。Stripeの既定カードは使わない)。
// 1店舗・1か月につき請求書は1件、その請求書への支払い(PaymentIntent)は成功するまで1件ずつ。
//
// 請求書の状態(この工程で追加)：
//   closed ──確保──> charging ──結果──> paid(支払い済み・終わり)
//                               ├──> processing(処理中。後で照会)
//                               ├──> requires_action(本人認証が必要。店舗の操作待ち、後で照会)
//                               ├──> payment_failed(拒否。自動の再請求はしない＝方針は未決定)
//                               ├──> charge_error(請求内容の不備など。支払いは作られていない。人の確認が必要)
//                               ├──> charging のまま(結果不明＝通信切断・時間切れ・500・429。次の実行で照合)
//                               └──> needs_review(結果を確定できない・想定外の支払いがある。人の確認が必要)
//   Stripeに届かなかったことが確実な失敗(401・403・送信前の中止)は closed に戻す。
//   needs_review は自動で新しい支払いを作らない。次の実行でも照合(読み取り)だけを行い、Stripe上で
//   この請求書の支払いが見つかった時だけ、その結果(paid 等)へ進める。
//
// 二重請求の防止：
//   ・請求書の確保(トランザクション)：closed の請求書だけを確保し、leaseId・期限を書く。同じ店舗の
//     storeBilling.{mode}.billingLock も同じトランザクションで設定(請求中は旧カードの取り外しが止まる)。
//   ・冪等キー：machinau-invoice-{mode}-{invoiceId}-{試行番号}。試行番号は「前の試行で支払いが
//     作られていないことが確実な場合」だけ増やす。結果不明のときは同じ番号・同じキーのまま。
//   ・結果不明の照合：PaymentIntent IDが分かればStripeにそのIDで照会(最優先)。分からなければ、その顧客の
//     PaymentIntent一覧(作成日時で絞る)から metadata.invoiceId が一致するものを探す。
//     一覧に見つからないことは「作られていない」証拠にしない。時間が経っても、冪等キーの保存期間が
//     過ぎても、自動で送り直さない(needs_review にして止める)。
//   ・新しい支払いを作る前に、その顧客の一覧にこの請求書の支払いが既に無いことを確かめる(有れば作らない)。
//     一覧を確かめられない時は送らない。支払い済みの記録がある請求書は確保しない。
//   ・Stripeの応答が請求書と合わない(金額・通貨・顧客・請求書ID)場合は paid にせず needs_review にする。
//
// 実行の許可：IMADAKE_MONTHLY_CHARGE_ENABLED(この工程の新しいフラグ、false)と
// 課金開始フラグ IMADAKE_CV_BILLING_STARTED(false)の両方が true で、Stripeの設定がテスト用
// (store-billing.js の readStripeBillingConfig：テストキーのみ・Productionでは無効)のときだけ。
// 既定は試算(dryRun)：読むだけで書き込まず、Stripeにも接続しない。
// キーの値・Stripeの応答本文はログ・応答・Firestoreに出さない(状態・コード・IDだけ)。
// このファイルはVercel Functionではない(api/moderate-submission.js の mode から呼ばれる)。
// ==========================================================================

import {
  Timestamp
} from "firebase-admin/firestore";

import {
  randomUUID
} from "node:crypto";

import {
  STORE_BILLING_COLLECTION,
  readStripeBillingConfig
} from "./store-billing.js";

import {
  IMADAKE_MONTHLY_INVOICES_COLLECTION,
  computeImadakeMonthRange
} from "./imadake-monthly-close.js";

import {
  IMADAKE_DAILY_CHARGE_AMOUNT_JPY
} from "./imadake-cv.js";

import {
  IMADAKE_CV_BILLING_STARTED
} from "./imadake.js";

// 月次請求の実行の許可。代表の承認があるまで false のまま変えない。
export const IMADAKE_MONTHLY_CHARGE_ENABLED =
  false;

// 実行の許可(コード内の固定値。画面や環境変数からは変えられない)。
export function readImadakeMonthlyChargeGates() {
  return {
    chargeEnabled: IMADAKE_MONTHLY_CHARGE_ENABLED === true,
    billingStarted: IMADAKE_CV_BILLING_STARTED === true
  };
}

const STRIPE_API_BASE =
  "https://api.stripe.com/v1";

const STRIPE_CHARGE_TIMEOUT_MS =
  20 * 1000;

// 請求書の確保期限と、送信を見送る残り時間(期限切れ後の別処理と重ならないように)。
const CHARGE_LEASE_MS =
  2 * 60 * 1000;

const CHARGE_LEASE_SAFETY_MS =
  40 * 1000;

// 一覧照合で、作成日時をどこまで遡って探すか。請求書の締め(closedAt)より前の支払いはこの請求書の
// ものではないが、時計のずれと過去の試行を含めるため、試行開始の90日前から探す。
const LIST_LOOKBACK_SECONDS =
  90 * 24 * 60 * 60;

// 一覧を読む最大ページ数(1ページ100件)。読み切れない時は「確かめられない」として扱う。
const LIST_MAX_PAGES =
  10;

// Stripe の JPY の最低請求額。
const STRIPE_MIN_AMOUNT_JPY =
  50;

const CHARGE_HISTORY_LIMIT =
  10;

const STORE_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

const PAYMENT_INTENT_ID_PATTERN =
  /^pi_[A-Za-z0-9_]{1,100}$/;

const LOCK_HOLDING_STATUSES =
  ["charging", "processing", "requires_action", "needs_review"];

function nowOf(deps) {
  return deps && typeof deps.now === "function" ? deps.now() : Date.now();
}

function readSection(data, mode) {
  const section = data && data[mode];
  return section && typeof section === "object" ? section : {};
}

function encodeForm(params) {
  const form = new URLSearchParams();

  Object.keys(params || {}).forEach(function(key) {
    const value = params[key];

    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  });

  return form.toString();
}

// Stripe API を呼ぶ。例外は投げず、{ ok, status, data?, error? } を返す。
// error は { type, code, declineCode, paymentIntent? }(応答本文そのものは返さない)。status 0 は通信失敗・時間切れ。
async function stripeRequest(config, deps, method, path, params, idempotencyKey) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(function() {
    abortController.abort();
  }, STRIPE_CHARGE_TIMEOUT_MS);

  const headers = { "Authorization": "Bearer " + config.serverKey };
  let url = STRIPE_API_BASE + path;
  let body;

  if (method === "GET") {
    const query = encodeForm(params);
    if (query !== "") {
      url += "?" + query;
    }
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encodeForm(params);
  }

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  try {
    const response = await deps.fetch(url, { method: method, headers: headers, body: body, signal: abortController.signal });
    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (response.ok && data && !data.error) {
      return { ok: true, status: response.status, data: data };
    }

    const stripeError = data && data.error && typeof data.error === "object" ? data.error : {};
    const paymentIntent = stripeError.payment_intent && typeof stripeError.payment_intent === "object" ? stripeError.payment_intent : null;

    return {
      ok: false,
      status: response.status,
      error: {
        type: typeof stripeError.type === "string" ? stripeError.type.slice(0, 60) : "",
        code: typeof stripeError.code === "string" ? stripeError.code.slice(0, 60) : "",
        declineCode: typeof stripeError.decline_code === "string" ? stripeError.decline_code.slice(0, 60) : "",
        paymentIntent: paymentIntent
      }
    };
  } catch (error) {
    return { ok: false, status: 0, error: { type: "network_error", code: "", declineCode: "", paymentIntent: null } };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildIdempotencyKey(mode, invoiceId, attempt) {
  return "machinau-invoice-" + mode + "-" + invoiceId + "-" + attempt;
}

// 請求書が請求できる内容か(金額・件数・通貨・税込)。問題があれば理由を返す。
function checkInvoiceAmount(invoice) {
  const lineCount = Number(invoice.lineCount);
  const amountJpy = Number(invoice.amountJpy);

  if (!Number.isInteger(lineCount) || lineCount <= 0 || amountJpy !== lineCount * IMADAKE_DAILY_CHARGE_AMOUNT_JPY) {
    return "invalid_invoice_amount";
  }

  if (amountJpy < STRIPE_MIN_AMOUNT_JPY) {
    return "below_minimum_amount";
  }

  if (invoice.currency !== "JPY" || invoice.taxIncluded !== true) {
    return "invalid_invoice_currency";
  }

  return "";
}

// 店舗の支払い情報(storeBilling.{mode})が請求に使えるか。
function checkBillingSection(section, invoiceId) {
  if (typeof section.customerId !== "string" || !section.customerId.startsWith("cus_")) {
    return "no_customer";
  }

  if (typeof section.paymentMethodId !== "string" || !section.paymentMethodId.startsWith("pm_")) {
    return "no_payment_method";
  }

  const pending = Array.isArray(section.detachPendingPaymentMethods) ? section.detachPendingPaymentMethods : [];

  if (pending.some(function(entry) { return entry && entry.paymentMethodId === section.paymentMethodId; })) {
    return "payment_method_retiring";
  }

  if (section.billingLock && section.billingLock.invoiceId !== invoiceId) {
    return "store_busy";
  }

  return "";
}

// PaymentIntent が、この請求書の支払いとして正しいか(金額・通貨・顧客・請求書ID)。
function matchesInvoice(pi, claim) {
  const metadata = pi && pi.metadata && typeof pi.metadata === "object" ? pi.metadata : {};
  const customer = typeof pi.customer === "string" ? pi.customer : pi.customer && pi.customer.id;

  return (
    pi &&
    typeof pi.id === "string" &&
    PAYMENT_INTENT_ID_PATTERN.test(pi.id) &&
    pi.amount === claim.amountJpy &&
    pi.currency === "jpy" &&
    customer === claim.customerId &&
    metadata.invoiceId === claim.invoiceId
  );
}

// PaymentIntent の状態を請求書の状態へ。
function resultFromPaymentIntent(pi, claim) {
  if (!matchesInvoice(pi, claim)) {
    return { kind: "needs_review", reason: "payment_intent_mismatch", paymentIntentId: pi && typeof pi.id === "string" ? pi.id.slice(0, 120) : "" };
  }

  const lastError = pi.last_payment_error && typeof pi.last_payment_error === "object" ? pi.last_payment_error : {};
  const base = {
    paymentIntentId: pi.id,
    paymentIntentStatus: typeof pi.status === "string" ? pi.status : "",
    error: {
      status: 0,
      type: typeof lastError.type === "string" ? lastError.type.slice(0, 60) : "",
      code: typeof lastError.code === "string" ? lastError.code.slice(0, 60) : "",
      declineCode: typeof lastError.decline_code === "string" ? lastError.decline_code.slice(0, 60) : ""
    }
  };

  switch (pi.status) {
    case "succeeded":
      return { ...base, kind: "paid" };
    case "processing":
    case "requires_capture":
      return { ...base, kind: "processing" };
    case "requires_action":
    case "requires_confirmation":
      return { ...base, kind: "requires_action" };
    case "requires_payment_method":
      return { ...base, kind: base.error.code === "authentication_required" || base.error.declineCode === "authentication_required" ? "requires_action" : "payment_failed" };
    case "canceled":
      return { ...base, kind: "payment_failed" };
    default:
      return { ...base, kind: "unknown" };
  }
}

// 支払いの作成(または同じキーでの送り直し)の応答を、請求書の結果へ。
function resultFromCreateResponse(response, claim) {
  if (response.ok) {
    return resultFromPaymentIntent(response.data, claim);
  }

  const error = response.error || {};
  const summary = { status: response.status, type: error.type || "", code: error.code || "", declineCode: error.declineCode || "" };

  if (response.status === 0 || response.status >= 500 || response.status === 429) {
    return { kind: "unknown", error: summary };
  }

  if (response.status === 402) {
    if (error.paymentIntent) {
      const mapped = resultFromPaymentIntent(error.paymentIntent, claim);
      return { ...mapped, error: summary.code || summary.declineCode ? summary : mapped.error };
    }

    return { kind: "payment_failed", error: summary };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: "not_sent", error: summary };
  }

  // 400(パラメーターの不備・冪等キーの使い方の誤り等)：支払いは作られていないが、人の確認が必要。
  return { kind: "charge_error", reason: "stripe_request_rejected", error: summary };
}

// 結果を請求書へ記録する(確保の leaseId が一致するときだけ)。billingLock も同じトランザクションで扱う。
async function finishCharge(database, claim, result, deps) {
  const invoiceRef = database.collection(IMADAKE_MONTHLY_INVOICES_COLLECTION).doc(claim.invoiceId);
  const billingRef = database.collection(STORE_BILLING_COLLECTION).doc(claim.storeId);
  const nowMs = nowOf(deps);
  const nowTimestamp = Timestamp.fromMillis(nowMs);

  return database.runTransaction(async function(transaction) {
    const invoiceSnapshot = await transaction.get(invoiceRef);
    const billingSnapshot = await transaction.get(billingRef);
    const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

    if (!invoice || invoice.chargeLeaseId !== claim.leaseId) {
      return { recorded: false, status: invoice ? invoice.status : "" };
    }

    const billingData = billingSnapshot.exists ? billingSnapshot.data() || {} : {};
    const section = readSection(billingData, claim.mode);
    let nextStatus = invoice.status;
    let releaseLock = false;
    const update = {
      chargeLeaseId: "",
      chargeLeaseUntilMs: 0,
      chargeUpdatedAt: nowTimestamp
    };

    if (result.paymentIntentId) {
      update.paymentIntentId = result.paymentIntentId;
    }

    if (result.paymentIntentStatus) {
      update.paymentIntentStatus = result.paymentIntentStatus;
    }

    if (result.error && (result.error.status || result.error.code || result.error.declineCode || result.error.type)) {
      update.lastChargeError = result.error;
    }

    switch (result.kind) {
      case "paid":
        nextStatus = "paid";
        update.paidAt = nowTimestamp;
        update.chargeOutcomeUnknown = false;
        releaseLock = true;
        break;
      case "processing":
      case "requires_action":
        nextStatus = result.kind;
        update.chargeOutcomeUnknown = false;
        break;
      case "payment_failed":
        nextStatus = "payment_failed";
        update.chargeOutcomeUnknown = false;
        releaseLock = true;
        break;
      case "charge_error":
        nextStatus = "charge_error";
        update.chargeErrorReason = result.reason || "";
        update.chargeOutcomeUnknown = false;
        releaseLock = !result.keepLock;
        break;
      case "needs_review":
        // 結果を確定できない：自動では新しい支払いを作らず、人の確認を待つ。billingLock は残す。
        nextStatus = "needs_review";
        update.chargeReviewReason = result.reason || "";
        break;
      case "not_sent":
        // Stripe に支払いが作られていないことが確実(送信前の中止・認証エラー)。closed に戻す。
        nextStatus = "closed";
        update.chargeOutcomeUnknown = false;
        update.chargeNotSentReason = result.reason || "";
        releaseLock = true;
        break;
      default:
        // 結果不明：同じ試行番号・同じキーのまま、次の実行で照合する。billingLock は残す。
        // needs_review の照合で分からなかった時は needs_review のまま。
        nextStatus = invoice.status === "needs_review" ? "needs_review" : "charging";
        update.chargeOutcomeUnknown = true;
        break;
    }

    update.status = nextStatus;

    const history = Array.isArray(invoice.chargeHistory) ? invoice.chargeHistory.slice(-(CHARGE_HISTORY_LIMIT - 1)) : [];
    history.push({
      atMs: nowMs,
      attempt: claim.attempt,
      action: claim.action,
      result: result.kind,
      paymentIntentId: result.paymentIntentId || "",
      code: result.error && result.error.code ? result.error.code : ""
    });
    update.chargeHistory = history;

    transaction.update(invoiceRef, update);

    if (releaseLock && section.billingLock && section.billingLock.invoiceId === claim.invoiceId) {
      const nextSection = { ...section };
      delete nextSection.billingLock;
      transaction.set(billingRef, { ...billingData, [claim.mode]: nextSection });
    }

    return { recorded: true, status: nextStatus };
  });
}

// closed の請求書を確保する(新しい試行)。戻り値 { claim } か { skip: reason }
async function claimForCharge(database, invoiceId, config, deps) {
  const invoiceRef = database.collection(IMADAKE_MONTHLY_INVOICES_COLLECTION).doc(invoiceId);
  const nowMs = nowOf(deps);

  return database.runTransaction(async function(transaction) {
    const invoiceSnapshot = await transaction.get(invoiceRef);
    const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

    if (!invoice || invoice.status !== "closed") {
      return { skip: "not_closed" };
    }

    // 支払い済みの記録がある請求書には、新しい支払いを作らない(状態の誤りへの備え)。
    if (invoice.paidAt || invoice.paymentIntentStatus === "succeeded") {
      return { skip: "already_paid" };
    }

    const storeId = typeof invoice.storeId === "string" ? invoice.storeId : "";

    if (!STORE_ID_PATTERN.test(storeId) || invoiceId !== storeId + "_" + invoice.month) {
      return { skip: "invalid_invoice" };
    }

    const amountProblem = checkInvoiceAmount(invoice);

    if (amountProblem) {
      return { skip: amountProblem };
    }

    const billingRef = database.collection(STORE_BILLING_COLLECTION).doc(storeId);
    const billingSnapshot = await transaction.get(billingRef);
    const billingData = billingSnapshot.exists ? billingSnapshot.data() || {} : {};
    const section = readSection(billingData, config.mode);
    const billingProblem = checkBillingSection(section, invoiceId);

    if (billingProblem) {
      return { skip: billingProblem };
    }

    const attempt = (Number.isInteger(invoice.chargeAttempt) ? invoice.chargeAttempt : 0) + 1;
    const leaseId = randomUUID();
    const leaseUntilMs = nowMs + CHARGE_LEASE_MS;
    const idempotencyKey = buildIdempotencyKey(config.mode, invoiceId, attempt);

    transaction.update(invoiceRef, {
      status: "charging",
      chargeMode: config.mode,
      chargeAttempt: attempt,
      chargeIdempotencyKey: idempotencyKey,
      chargeAttemptStartedAtMs: nowMs,
      chargeLeaseId: leaseId,
      chargeLeaseUntilMs: leaseUntilMs,
      chargeOutcomeUnknown: false,
      chargeCustomerId: section.customerId,
      chargePaymentMethodId: section.paymentMethodId,
      chargeCardVersion: Number.isInteger(section.cardVersion) ? section.cardVersion : 0,
      paymentIntentId: "",
      paymentIntentStatus: "",
      chargeUpdatedAt: Timestamp.fromMillis(nowMs)
    });

    transaction.set(billingRef, {
      ...billingData,
      [config.mode]: { ...section, billingLock: { invoiceId: invoiceId, attempt: attempt, sinceMs: nowMs } }
    });

    return {
      claim: {
        action: "charge",
        invoiceId: invoiceId,
        storeId: storeId,
        month: invoice.month,
        mode: config.mode,
        attempt: attempt,
        idempotencyKey: idempotencyKey,
        leaseId: leaseId,
        leaseUntilMs: leaseUntilMs,
        attemptStartedAtMs: nowMs,
        amountJpy: Number(invoice.amountJpy),
        lineCount: Number(invoice.lineCount),
        customerId: section.customerId,
        paymentMethodId: section.paymentMethodId,
        cardVersion: Number.isInteger(section.cardVersion) ? section.cardVersion : 0,
        paymentIntentId: ""
      }
    };
  });
}

// 結果が分からない・処理中・認証待ちの請求書を、照合のために確保する(試行番号・キーは変えない)。
async function claimForReconcile(database, invoiceId, config, deps) {
  const invoiceRef = database.collection(IMADAKE_MONTHLY_INVOICES_COLLECTION).doc(invoiceId);
  const nowMs = nowOf(deps);

  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(invoiceRef);
    const invoice = snapshot.exists ? snapshot.data() || {} : null;

    if (!invoice || !LOCK_HOLDING_STATUSES.includes(invoice.status)) {
      return { skip: "not_reconcilable" };
    }

    if (Number(invoice.chargeLeaseUntilMs) > nowMs) {
      return { skip: "in_progress" };
    }

    if (invoice.chargeMode !== config.mode) {
      return { skip: "mode_mismatch" };
    }

    const leaseId = randomUUID();
    const leaseUntilMs = nowMs + CHARGE_LEASE_MS;

    transaction.update(invoiceRef, { chargeLeaseId: leaseId, chargeLeaseUntilMs: leaseUntilMs });

    return {
      claim: {
        action: "reconcile",
        invoiceId: invoiceId,
        storeId: invoice.storeId,
        month: invoice.month,
        mode: invoice.chargeMode,
        status: invoice.status,
        attempt: invoice.chargeAttempt,
        idempotencyKey: invoice.chargeIdempotencyKey,
        leaseId: leaseId,
        leaseUntilMs: leaseUntilMs,
        attemptStartedAtMs: Number(invoice.chargeAttemptStartedAtMs) || 0,
        amountJpy: Number(invoice.amountJpy),
        lineCount: Number(invoice.lineCount),
        customerId: invoice.chargeCustomerId,
        paymentMethodId: invoice.chargePaymentMethodId,
        cardVersion: invoice.chargeCardVersion,
        paymentIntentId: typeof invoice.paymentIntentId === "string" ? invoice.paymentIntentId : ""
      }
    };
  });
}

function buildCreateParams(claim) {
  return {
    "amount": claim.amountJpy,
    "currency": "jpy",
    "customer": claim.customerId,
    "payment_method": claim.paymentMethodId,
    "off_session": "true",
    "confirm": "true",
    "allowed_payment_method_types[]": "card",
    "description": "Machinau 今だけ投稿 " + claim.month + " (" + claim.lineCount + "件)",
    "metadata[invoiceId]": claim.invoiceId,
    "metadata[storeId]": claim.storeId,
    "metadata[month]": claim.month,
    "metadata[chargeAttempt]": claim.attempt,
    "metadata[machinauMode]": claim.mode
  };
}

async function sendCreate(config, deps, claim) {
  return stripeRequest(config, deps, "POST", "/payment_intents", buildCreateParams(claim), claim.idempotencyKey);
}

// その顧客のPaymentIntent一覧から、この請求書(metadata.invoiceId)の支払いを集める。
// 戻り値 { ok, complete, items }。通信失敗は ok:false、ページを読み切れない時は complete:false。
async function listInvoicePaymentIntents(config, deps, claim) {
  const items = [];
  let startingAfter = "";

  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const params = {
      "customer": claim.customerId,
      "created[gte]": Math.floor(claim.attemptStartedAtMs / 1000) - LIST_LOOKBACK_SECONDS,
      "limit": 100
    };

    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const listed = await stripeRequest(config, deps, "GET", "/payment_intents", params, null);

    if (!listed.ok) {
      return { ok: false, complete: false, items: items, error: { status: listed.status, type: listed.error.type, code: listed.error.code, declineCode: "" } };
    }

    const data = Array.isArray(listed.data.data) ? listed.data.data : [];

    data.forEach(function(pi) {
      if (pi && pi.metadata && pi.metadata.invoiceId === claim.invoiceId) {
        items.push(pi);
      }
    });

    if (!listed.data.has_more || data.length === 0) {
      return { ok: true, complete: true, items: items };
    }

    startingAfter = data[data.length - 1].id;
  }

  return { ok: true, complete: false, items: items };
}

// 見つかったこの請求書の支払いから結果を決める。成功が1件でもあればそれを採用(重ねて請求しない)。
// それ以外で、今の試行番号の支払いがあればその状態。どちらでもなければ人の確認。
function resultFromFoundPaymentIntents(items, claim) {
  const succeeded = items.filter(function(pi) { return pi.status === "succeeded"; });

  if (succeeded.length > 1) {
    return { kind: "needs_review", reason: "multiple_succeeded_payment_intents" };
  }

  if (succeeded.length === 1) {
    return resultFromPaymentIntent(succeeded[0], claim);
  }

  const sameAttempt = items.filter(function(pi) { return String(pi.metadata.chargeAttempt) === String(claim.attempt); });

  if (sameAttempt.length === 1) {
    return resultFromPaymentIntent(sameAttempt[0], claim);
  }

  return { kind: "needs_review", reason: "unexpected_payment_intents" };
}

// 新しい試行：送信直前にカードが変わっていないか、この請求書の支払いがStripeに既に無いかを確かめ、
// 確保期限に余裕があるときだけ送る。
async function performCharge(database, config, deps, claim) {
  const billingSnapshot = await database.collection(STORE_BILLING_COLLECTION).doc(claim.storeId).get();
  const section = readSection(billingSnapshot.exists ? billingSnapshot.data() : null, claim.mode);

  if (section.paymentMethodId !== claim.paymentMethodId || section.customerId !== claim.customerId) {
    return finishCharge(database, claim, { kind: "not_sent", reason: "card_changed_before_send" }, deps);
  }

  const existing = await listInvoicePaymentIntents(config, deps, claim);

  if (!existing.ok) {
    // 一覧を確かめられない：送らない(支払いは作っていない)。closed に戻して次の実行に任せる。
    return finishCharge(database, claim, { kind: "not_sent", reason: "precheck_failed", error: existing.error }, deps);
  }

  if (!existing.complete) {
    return finishCharge(database, claim, { kind: "needs_review", reason: "precheck_incomplete" }, deps);
  }

  if (existing.items.length > 0) {
    // この請求書の支払いが既にある：新しく作らず、その結果に従う。
    return finishCharge(database, claim, resultFromFoundPaymentIntents(existing.items, claim), deps);
  }

  if (nowOf(deps) > claim.leaseUntilMs - CHARGE_LEASE_SAFETY_MS) {
    return finishCharge(database, claim, { kind: "not_sent", reason: "lease_too_short" }, deps);
  }

  const response = await sendCreate(config, deps, claim);
  return finishCharge(database, claim, resultFromCreateResponse(response, claim), deps);
}

// 照合(読み取りだけ。新しい支払いは作らない)：PaymentIntent IDが分かればそのIDで照会(最優先)。
// 分からなければ一覧から探す。見つからない・確かめられない時は、作られていない証拠にせず止める。
async function performReconcile(database, config, deps, claim) {
  if (claim.paymentIntentId && PAYMENT_INTENT_ID_PATTERN.test(claim.paymentIntentId)) {
    const fetched = await stripeRequest(config, deps, "GET", "/payment_intents/" + claim.paymentIntentId, {}, null);

    if (!fetched.ok) {
      // 照会できない：状態は変えずに次の実行で照会し直す(charging は結果不明のまま)。
      return finishCharge(database, claim, { kind: claim.status === "processing" || claim.status === "requires_action" ? claim.status : "unknown", error: { status: fetched.status, type: fetched.error.type, code: fetched.error.code, declineCode: "" } }, deps);
    }

    return finishCharge(database, claim, resultFromPaymentIntent(fetched.data, claim), deps);
  }

  const found = await listInvoicePaymentIntents(config, deps, claim);

  if (!found.ok) {
    return finishCharge(database, claim, { kind: "unknown", error: found.error }, deps);
  }

  if (found.items.length > 0) {
    return finishCharge(database, claim, resultFromFoundPaymentIntents(found.items, claim), deps);
  }

  // 一覧に見つからない(または読み切れない)：作られていないとは判断しない。人の確認へ。
  return finishCharge(database, claim, { kind: "needs_review", reason: found.complete ? "outcome_unknown_not_found" : "outcome_unknown_list_incomplete" }, deps);
}

function describeInvoice(invoiceId, invoice) {
  return {
    invoiceId: invoiceId,
    storeId: invoice.storeId,
    status: invoice.status,
    amountJpy: Number(invoice.amountJpy) || 0,
    lineCount: Number(invoice.lineCount) || 0,
    chargeAttempt: Number.isInteger(invoice.chargeAttempt) ? invoice.chargeAttempt : 0,
    paymentIntentId: typeof invoice.paymentIntentId === "string" ? invoice.paymentIntentId : "",
    chargeOutcomeUnknown: invoice.chargeOutcomeUnknown === true
  };
}

// 月次請求の本体。options: { month, dryRun, gates: { chargeEnabled, billingStarted } }
// deps: { fetch, env, now? }
export async function runImadakeMonthlyCharge(database, deps, options) {
  const range = computeImadakeMonthRange(options.month);

  if (!range) {
    return { ok: false, reason: "invalid_month" };
  }

  const dryRun = options.dryRun !== false;
  const gates = options.gates || {};
  const config = readStripeBillingConfig(deps.env);

  if (!dryRun) {
    if (gates.chargeEnabled !== true || gates.billingStarted !== true) {
      return { ok: false, reason: "charge_disabled" };
    }

    if (!config.ok) {
      return { ok: false, reason: "stripe_unavailable", unavailableReason: config.reason };
    }
  }

  const mode = config.ok ? config.mode : "test";
  const snapshot = await database
    .collection(IMADAKE_MONTHLY_INVOICES_COLLECTION)
    .where("month", "==", range.month)
    .get();

  const invoices = [];

  for (const doc of snapshot.docs) {
    const invoice = doc.data() || {};
    const entry = describeInvoice(doc.id, invoice);
    let plan = "skip";
    let reason = "";

    if (invoice.status === "closed") {
      const billingSnapshot = await database.collection(STORE_BILLING_COLLECTION).doc(String(invoice.storeId)).get();
      const section = readSection(billingSnapshot.exists ? billingSnapshot.data() : null, mode);
      reason = checkInvoiceAmount(invoice) || checkBillingSection(section, doc.id);
      plan = reason ? "skip" : "charge";
    } else if (LOCK_HOLDING_STATUSES.includes(invoice.status)) {
      plan = "reconcile";
    } else {
      reason = invoice.status === "closing" ? "not_closed" : "finished_or_needs_review";
    }

    entry.plan = plan;
    entry.planReason = reason;

    if (!dryRun && plan !== "skip") {
      const claimed = plan === "charge"
        ? await claimForCharge(database, doc.id, config, deps)
        : await claimForReconcile(database, doc.id, config, deps);

      if (claimed.skip) {
        entry.outcome = "skipped";
        entry.outcomeReason = claimed.skip;
      } else {
        const finished = plan === "charge"
          ? await performCharge(database, config, deps, claimed.claim)
          : await performReconcile(database, config, deps, claimed.claim);
        const latest = await database.collection(IMADAKE_MONTHLY_INVOICES_COLLECTION).doc(doc.id).get();
        Object.assign(entry, describeInvoice(doc.id, latest.data() || {}));
        entry.outcome = finished.recorded ? entry.status : "lease_lost";
      }
    }

    invoices.push(entry);
  }

  invoices.sort(function(a, b) { return a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0; });

  return {
    ok: true,
    month: range.month,
    dryRun: dryRun,
    mode: mode,
    invoices: invoices,
    totals: {
      invoiceCount: invoices.length,
      plannedChargeCount: invoices.filter(function(x) { return x.plan === "charge"; }).length,
      plannedChargeAmountJpy: invoices.filter(function(x) { return x.plan === "charge"; }).reduce(function(s, x) { return s + x.amountJpy; }, 0),
      reconcileCount: invoices.filter(function(x) { return x.plan === "reconcile"; }).length
    }
  };
}

// mode: imadakeMonthlyCharge (POST、運営のみ)
//   入力 { month: "YYYY-MM", dryRun?: boolean }。dryRun は省略時 true(試算：読むだけ、Stripeに接続しない)。
//   請求の実行(dryRun:false)は IMADAKE_MONTHLY_CHARGE_ENABLED と課金開始フラグが true の時だけ(現在は403)。
export async function handleImadakeMonthlyCharge(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const month = typeof body.month === "string" ? body.month.trim() : "";
    const dryRun = body.dryRun !== false;

    if (!computeImadakeMonthRange(month)) {
      return response.status(400).json({ success: false, reason: "invalid_month" });
    }

    const gates = readImadakeMonthlyChargeGates();

    if (!dryRun && !(gates.chargeEnabled && gates.billingStarted)) {
      return response.status(403).json({ success: false, reason: "charge_disabled" });
    }

    const result = await runImadakeMonthlyCharge(authResult.database, deps, { month: month, dryRun: dryRun, gates: gates });

    if (!result.ok) {
      return response.status(result.reason === "invalid_month" ? 400 : 403).json({ success: false, reason: result.reason });
    }

    return response.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("今だけ投稿 月次請求エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}
