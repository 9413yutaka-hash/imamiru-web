// ==========================================================================
// STEP 44-C④｜月額100円カスタマイズの請求(Stripe PaymentIntent)・未払い・本人認証(サーバー側のみ)
// ==========================================================================
// 対象：月末締めで確定した storeCustomPlanInvoices/{storeId}_{YYYY-MM}(店舗・年月で1件、100円・税込)。
// 請求先：請求書に締めの時点で記録した契約者(billingAccountUid)の accountBilling/{uid}.{mode} の正式なカード。
//   店舗の今の owner ではなく請求書の契約者へ請求する(所有者変更後も旧店主の発生済みの料金は旧店主)。
// 請求の仕組みは今だけ投稿の月次請求(imadake-monthly-charge.js)の部品をそのまま使う：Stripe の呼び出し・応答の判定・
// 一覧での照合・冪等キー・請求書の確保(lease)・結果不明は自動で送り直さない(needs_review)・請求ロック。
// 今だけ投稿の請求書と ID の形が同じため、Stripe の metadata.invoiceId・請求ロックのキー・照合には
// 前置き付きの ID(storeCustomPlan:{storeId}_{YYYY-MM})を使い、互いの支払いを取り違えない。
//
// 請求書の状態：closed ──確保──> charging ──結果──> paid / processing / requires_action / payment_failed /
//   charge_error / needs_review / charging のまま(結果不明)。Stripe に届かなかったことが確実な失敗は確保前の状態へ戻す。
// 決済失敗(代表決定)：初回失敗(payment_failed または requires_action)の時刻 firstFailedAt から、3日後・7日後に
//   自動で再試行(payment_failed の時だけ。結果不明・本人認証待ちは自動で送り直さない)、14日後(suspendAt)に未払いの
//   まま残っていれば、その店舗の契約の paymentStatus を suspended(有料の内容を停止、データは保持)。
// 契約の支払いの状態(storeCustomPlans.paymentStatus)：current / past_due / suspended。契約の状態(status)とは別に持つ。
//   契約者が請求先の未払い(payment_failed・requires_action)が無くなれば current に戻す(複数月の未払いはすべて支払われた時)。
//
// 実行の許可：STORE_CUSTOM_PLAN_CHARGE_ENABLED(false)が true、または Preview 試験の経路(Preview・対象ブランチ・
// machinau-preview の環境で、請求用キーがテストモード、Preview で作った試験用の請求書だけ)。どちらでも、請求用の設定
// (readStripeChargeConfig：Production では常に無効、テストキーのみ)が使える時だけ。本番キーでは実行しない。
// このファイルは Vercel Function ではない(api/moderate-submission.js から呼ばれる)。
// ==========================================================================

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  randomUUID
} from "node:crypto";

import {
  ACCOUNT_BILLING_COLLECTION,
  STORE_CUSTOM_PLAN_INVOICES_COLLECTION,
  STORE_CUSTOM_PLAN_LOCK_PREFIX,
  readStripeChargeConfig
} from "./store-billing.js";

import {
  stripeRequest,
  checkBillingSection,
  resultFromPaymentIntent,
  resultFromCreateResponse,
  listInvoicePaymentIntents,
  resultFromFoundPaymentIntents
} from "./imadake-monthly-charge.js";

import {
  STORE_CUSTOM_PLAN_CHARGE_ENABLED,
  STORE_CUSTOM_PLAN_MONTHLY_FEE_JPY,
  STORE_CUSTOM_PLAN_PERIOD_MONTHLY,
  STORE_CUSTOM_PLAN_RETRY_DAYS,
  STORE_CUSTOM_PLAN_SUSPEND_DAYS
} from "./store-custom-plan-billing.js";

import {
  requireVerifiedStoreUser
} from "./store-self-service.js";

const STORE_ACCOUNTS_COLLECTION = "storeAccounts";
const STORE_CUSTOM_PLANS_COLLECTION = "storeCustomPlans";
const STORE_RATE_LIMITS_COLLECTION = "storeRegistrationRateLimits";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHARGE_LEASE_MS = 2 * 60 * 1000;
const CHARGE_LEASE_SAFETY_MS = 40 * 1000;
const CHARGE_HISTORY_LIMIT = 10;
const OWNER_PAYMENT_COOLDOWN_MS = 5 * 1000;
const STRIPE_MIN_AMOUNT_JPY = 50;
const INVOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}_\d{4}-(0[1-9]|1[0-2])$/;
const PAYMENT_INTENT_ID_PATTERN = /^pi_[A-Za-z0-9_]{1,100}$/;

// 請求ロック(カードの取り外しを止める)を持ち続ける状態。今だけ投稿と同じ。
const LOCK_HOLDING_STATUSES = ["charging", "processing", "requires_action", "needs_review"];
// 店主の側で支払いが済んでいない状態(猶予・停止の対象)。結果不明・請求の不備(charge_error)は運営の確認のため数えない。
export const STORE_CUSTOM_PLAN_OWNER_UNPAID_STATUSES = ["payment_failed", "requires_action"];

function nowOf(deps) {
  return deps && typeof deps.now === "function" ? deps.now() : Date.now();
}

function millisOf(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function readSection(data, mode) {
  const section = data && data[mode];
  return section && typeof section === "object" ? section : {};
}

export function storeCustomPlanLockKey(ledgerId) {
  return STORE_CUSTOM_PLAN_LOCK_PREFIX + ledgerId;
}

function buildIdempotencyKey(mode, ledgerId, attempt) {
  return "machinau-plan-" + mode + "-" + ledgerId + "-" + attempt;
}

// ===== 実行の許可 =====
// { ok, config, previewTrialOnly } か { ok:false, reason }。
export function readStoreCustomPlanChargeGate(deps) {
  const config = readStripeChargeConfig(deps && deps.env);

  if (STORE_CUSTOM_PLAN_CHARGE_ENABLED === true) {
    return config.ok ? { ok: true, config: config, previewTrialOnly: false } : { ok: false, reason: "stripe_unavailable", detail: config.reason };
  }

  const trial = !!deps && typeof deps.isStoreCustomPlanTrialEnabled === "function" && deps.isStoreCustomPlanTrialEnabled() === true;

  if (!trial) {
    return { ok: false, reason: "charge_disabled" };
  }

  if (!config.ok) {
    return { ok: false, reason: "stripe_unavailable", detail: config.reason };
  }

  // Preview 試験の経路はテストモード・テストキーだけ(本番キーでは絶対に実行しない)。
  if (config.mode !== "test" || !/^(rk|sk)_test_/.test(String(config.serverKey || ""))) {
    return { ok: false, reason: "stripe_not_test_mode" };
  }

  return { ok: true, config: config, previewTrialOnly: true };
}

// ===== 請求書の確認 =====

function checkPlanInvoice(ledgerId, invoice) {
  if (!INVOICE_ID_PATTERN.test(ledgerId) || ledgerId !== invoice.storeId + "_" + invoice.month) {
    return "invalid_invoice";
  }

  if (Number(invoice.amountJpy) !== STORE_CUSTOM_PLAN_MONTHLY_FEE_JPY || Number(invoice.amountJpy) < STRIPE_MIN_AMOUNT_JPY) {
    return "invalid_invoice_amount";
  }

  if (invoice.currency !== "JPY" || invoice.taxIncluded !== true) {
    return "invalid_invoice_currency";
  }

  if (typeof invoice.billingAccountUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(invoice.billingAccountUid)) {
    return "billing_account_missing";
  }

  return "";
}

// 確保(新しい試行)。kind：charge(締めた請求書の初回)・retry(自動の再試行)・pay_now(店主の操作による支払い)。
async function claimPlanInvoice(database, ledgerId, config, deps, kind) {
  const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(ledgerId);
  const nowMs = nowOf(deps);
  const expectedStatus = kind === "charge" ? "closed" : "payment_failed";

  return database.runTransaction(async function(transaction) {
    const invoiceSnapshot = await transaction.get(invoiceRef);
    const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

    if (!invoice || invoice.status !== expectedStatus) {
      return { skip: "status_changed" };
    }

    if (invoice.paidAt || invoice.paymentIntentStatus === "succeeded") {
      return { skip: "already_paid" };
    }

    const problem = checkPlanInvoice(ledgerId, invoice);

    if (problem) {
      return { skip: problem };
    }

    const uid = invoice.billingAccountUid;
    const billingRef = database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid);
    const billingSnapshot = await transaction.get(billingRef);
    const billingData = billingSnapshot.exists ? billingSnapshot.data() || {} : {};

    if (!billingSnapshot.exists || billingData.uid !== uid) {
      return { skip: "billing_account_mismatch" };
    }

    const section = readSection(billingData, config.mode);
    const billingProblem = checkBillingSection(section);

    if (billingProblem) {
      return { skip: billingProblem };
    }

    const attempt = (Number.isInteger(invoice.chargeAttempt) ? invoice.chargeAttempt : 0) + 1;
    const leaseId = randomUUID();
    const leaseUntilMs = nowMs + CHARGE_LEASE_MS;
    const idempotencyKey = buildIdempotencyKey(config.mode, ledgerId, attempt);
    const lockKey = storeCustomPlanLockKey(ledgerId);

    transaction.update(invoiceRef, {
      status: "charging",
      chargeMode: config.mode,
      chargeKind: kind,
      chargeFromStatus: expectedStatus,
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
      updatedAt: FieldValue.serverTimestamp()
    });

    const locks = section.billingLocks && typeof section.billingLocks === "object" ? section.billingLocks : {};

    transaction.set(billingRef, {
      ...billingData,
      [config.mode]: { ...section, billingLocks: { ...locks, [lockKey]: { attempt: attempt, sinceMs: nowMs, storeId: invoice.storeId } } }
    });

    return {
      claim: {
        action: "charge",
        kind: kind,
        fromStatus: expectedStatus,
        ledgerId: ledgerId,
        invoiceId: lockKey,
        storeId: invoice.storeId,
        month: invoice.month,
        billingAccountUid: uid,
        mode: config.mode,
        attempt: attempt,
        idempotencyKey: idempotencyKey,
        leaseId: leaseId,
        leaseUntilMs: leaseUntilMs,
        attemptStartedAtMs: nowMs,
        amountJpy: Number(invoice.amountJpy),
        customerId: section.customerId,
        paymentMethodId: section.paymentMethodId,
        cardVersion: Number.isInteger(section.cardVersion) ? section.cardVersion : 0,
        paymentIntentId: ""
      }
    };
  });
}

// 照合のための確保(試行番号・キーは変えない。新しい支払いは作らない)。
async function claimPlanReconcile(database, ledgerId, config, deps) {
  const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(ledgerId);
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
        kind: invoice.chargeKind || "charge",
        fromStatus: invoice.chargeFromStatus || "closed",
        ledgerId: ledgerId,
        invoiceId: storeCustomPlanLockKey(ledgerId),
        storeId: invoice.storeId,
        month: invoice.month,
        billingAccountUid: typeof invoice.billingAccountUid === "string" ? invoice.billingAccountUid : "",
        mode: invoice.chargeMode,
        status: invoice.status,
        attempt: invoice.chargeAttempt,
        idempotencyKey: invoice.chargeIdempotencyKey,
        leaseId: leaseId,
        leaseUntilMs: leaseUntilMs,
        attemptStartedAtMs: Number(invoice.chargeAttemptStartedAtMs) || 0,
        amountJpy: Number(invoice.amountJpy),
        customerId: invoice.chargeCustomerId,
        paymentMethodId: invoice.chargePaymentMethodId,
        cardVersion: invoice.chargeCardVersion,
        paymentIntentId: typeof invoice.paymentIntentId === "string" ? invoice.paymentIntentId : ""
      }
    };
  });
}

// 結果を請求書へ記録する(確保の leaseId が一致する時だけ)。請求ロック・失敗の予定も同じ transaction で扱う。
async function finishPlanCharge(database, claim, result, deps) {
  const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(claim.ledgerId);
  const billingRef = claim.billingAccountUid ? database.collection(ACCOUNT_BILLING_COLLECTION).doc(claim.billingAccountUid) : null;
  const nowMs = nowOf(deps);
  const nowTimestamp = Timestamp.fromMillis(nowMs);

  return database.runTransaction(async function(transaction) {
    const invoiceSnapshot = await transaction.get(invoiceRef);
    const billingSnapshot = billingRef ? await transaction.get(billingRef) : null;
    const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

    if (!invoice || invoice.chargeLeaseId !== claim.leaseId) {
      return { recorded: false, status: invoice ? invoice.status : "" };
    }

    const billingData = billingSnapshot && billingSnapshot.exists ? billingSnapshot.data() || {} : {};
    const section = readSection(billingData, claim.mode);
    let nextStatus = invoice.status;
    let releaseLock = false;
    const update = { chargeLeaseId: "", chargeLeaseUntilMs: 0, updatedAt: FieldValue.serverTimestamp() };

    if (result.paymentIntentId) {
      update.paymentIntentId = result.paymentIntentId;
    }

    if (result.paymentIntentStatus) {
      update.paymentIntentStatus = result.paymentIntentStatus;
    }

    if (result.error && (result.error.status || result.error.code || result.error.declineCode || result.error.type)) {
      update.lastError = result.error;
    }

    switch (result.kind) {
      case "paid":
        nextStatus = "paid";
        update.paidAt = nowTimestamp;
        update.chargeOutcomeUnknown = false;
        update.nextRetryAt = null;
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
        releaseLock = true;
        break;
      case "needs_review":
        nextStatus = "needs_review";
        update.chargeReviewReason = result.reason || "";
        break;
      case "not_sent":
        // Stripe に支払いが作られていないことが確実：確保の前の状態へ戻す(再試行の回数は数えない)。
        nextStatus = claim.fromStatus === "payment_failed" ? "payment_failed" : "closed";
        update.chargeOutcomeUnknown = false;
        update.chargeNotSentReason = result.reason || "";
        releaseLock = true;
        break;
      default:
        // 結果不明：同じ試行番号・同じキーのまま、次の実行で照合だけ行う(自動で送り直さない)。ロックは残す。
        nextStatus = invoice.status === "needs_review" ? "needs_review" : "charging";
        update.chargeOutcomeUnknown = true;
        break;
    }

    update.status = nextStatus;

    // 決済失敗の予定(代表決定：初回失敗の3日後・7日後に再試行、14日後に停止)。
    if ((nextStatus === "payment_failed" || nextStatus === "requires_action") && result.kind !== "not_sent") {
      const firstFailedMs = millisOf(invoice.firstFailedAt) || nowMs;
      let retryCount = Number.isInteger(invoice.retryCount) ? invoice.retryCount : 0;

      if (claim.action === "charge" && claim.kind === "retry") {
        retryCount += 1;
      }

      update.firstFailedAt = Timestamp.fromMillis(firstFailedMs);
      update.suspendAt = Timestamp.fromMillis(firstFailedMs + STORE_CUSTOM_PLAN_SUSPEND_DAYS * DAY_MS);
      update.retryCount = retryCount;
      // 自動の再試行は payment_failed の時だけ(本人認証待ちは店主の操作で同じ PaymentIntent を完了する)。
      update.nextRetryAt = nextStatus === "payment_failed" && retryCount < STORE_CUSTOM_PLAN_RETRY_DAYS.length
        ? Timestamp.fromMillis(firstFailedMs + STORE_CUSTOM_PLAN_RETRY_DAYS[retryCount] * DAY_MS)
        : null;
    }

    const history = Array.isArray(invoice.chargeAttempts) ? invoice.chargeAttempts.slice(-(CHARGE_HISTORY_LIMIT - 1)) : [];
    history.push({
      atMs: nowMs,
      attempt: claim.attempt,
      action: claim.action,
      kind: claim.kind,
      result: result.kind,
      paymentIntentId: result.paymentIntentId || "",
      code: result.error && result.error.code ? result.error.code : ""
    });
    update.chargeAttempts = history;

    transaction.update(invoiceRef, update);

    const locks = section.billingLocks && typeof section.billingLocks === "object" ? section.billingLocks : {};

    if (releaseLock && billingRef && Object.prototype.hasOwnProperty.call(locks, claim.invoiceId)) {
      const nextLocks = { ...locks };
      delete nextLocks[claim.invoiceId];
      transaction.set(billingRef, { ...billingData, [claim.mode]: { ...section, billingLocks: nextLocks } });
    }

    return { recorded: true, status: nextStatus };
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
    "description": "Machinau カスタマイズ " + claim.month + " (" + claim.storeId + ")",
    "metadata[invoiceId]": claim.invoiceId,
    "metadata[storeId]": claim.storeId,
    "metadata[month]": claim.month,
    "metadata[chargeAttempt]": claim.attempt,
    "metadata[machinauMode]": claim.mode,
    "metadata[machinauProduct]": "store_custom_plan"
  };
}

// 新しい試行：送る直前にカードが変わっていないか、この請求書の支払いが Stripe に既に無いかを確かめてから送る。
async function performPlanCharge(database, config, deps, claim) {
  const billingSnapshot = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(claim.billingAccountUid).get();
  const section = readSection(billingSnapshot.exists ? billingSnapshot.data() : null, claim.mode);

  if (section.paymentMethodId !== claim.paymentMethodId || section.customerId !== claim.customerId) {
    return finishPlanCharge(database, claim, { kind: "not_sent", reason: "card_changed_before_send" }, deps);
  }

  const existing = await listInvoicePaymentIntents(config, deps, claim);

  if (!existing.ok) {
    return finishPlanCharge(database, claim, { kind: "not_sent", reason: "precheck_failed", error: existing.error }, deps);
  }

  if (!existing.complete) {
    return finishPlanCharge(database, claim, { kind: "needs_review", reason: "precheck_incomplete" }, deps);
  }

  // 前の試行で作った支払い(失敗済み)は数えない。成功・処理中・認証待ちが既にあれば新しく作らない。
  const live = existing.items.filter(function(pi) {
    return String(pi.metadata && pi.metadata.chargeAttempt) === String(claim.attempt) || ["succeeded", "processing", "requires_action", "requires_confirmation", "requires_capture"].includes(pi.status);
  });

  if (live.length > 0) {
    return finishPlanCharge(database, claim, resultFromFoundPaymentIntents(live, claim), deps);
  }

  if (nowOf(deps) > claim.leaseUntilMs - CHARGE_LEASE_SAFETY_MS) {
    return finishPlanCharge(database, claim, { kind: "not_sent", reason: "lease_too_short" }, deps);
  }

  // 送る直前にもう一度、正式なカードが確保の時と同じかを確かめる(一覧の確認の間にカードが変わった場合は送らない)。
  const latestBilling = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(claim.billingAccountUid).get();
  const latestSection = readSection(latestBilling.exists ? latestBilling.data() : null, claim.mode);

  if (latestSection.paymentMethodId !== claim.paymentMethodId || latestSection.customerId !== claim.customerId) {
    return finishPlanCharge(database, claim, { kind: "not_sent", reason: "card_changed_before_send" }, deps);
  }

  const response = await stripeRequest(config, deps, "POST", "/payment_intents", buildCreateParams(claim), claim.idempotencyKey);
  return finishPlanCharge(database, claim, resultFromCreateResponse(response, claim), deps);
}

// 照合(読み取りだけ)。PaymentIntent ID が分かればそのIDで、分からなければ一覧から探す。見つからなければ人の確認。
async function performPlanReconcile(database, config, deps, claim) {
  if (claim.paymentIntentId && PAYMENT_INTENT_ID_PATTERN.test(claim.paymentIntentId)) {
    const fetched = await stripeRequest(config, deps, "GET", "/payment_intents/" + claim.paymentIntentId, {}, null);

    if (!fetched.ok) {
      return finishPlanCharge(database, claim, { kind: claim.status === "processing" || claim.status === "requires_action" ? claim.status : "unknown", error: { status: fetched.status, type: fetched.error.type, code: fetched.error.code, declineCode: "" } }, deps);
    }

    return finishPlanCharge(database, claim, resultFromPaymentIntent(fetched.data, claim), deps);
  }

  const found = await listInvoicePaymentIntents(config, deps, claim);

  if (!found.ok) {
    return finishPlanCharge(database, claim, { kind: "unknown", error: found.error }, deps);
  }

  const sameAttempt = found.items.filter(function(pi) { return String(pi.metadata && pi.metadata.chargeAttempt) === String(claim.attempt) || pi.status === "succeeded"; });

  if (sameAttempt.length > 0) {
    return finishPlanCharge(database, claim, resultFromFoundPaymentIntents(sameAttempt, claim), deps);
  }

  return finishPlanCharge(database, claim, { kind: "needs_review", reason: found.complete ? "outcome_unknown_not_found" : "outcome_unknown_list_incomplete" }, deps);
}

// ===== 契約の支払いの状態(未払いと契約状態を別に管理) =====
// 契約者が請求先の、その店舗の未払い(payment_failed・requires_action)から決める。
//   無い → current(停止中だったら再開)。14日(suspendAt)を過ぎた未払いがある → suspended。それ以外 → past_due。
// 複数月の未払いは、すべてが支払われた時だけ current に戻る。旧店主の未払いは新しい契約者の契約に影響しない。
export async function refreshStoreCustomPlanPaymentStatus(database, storeId, nowMillis) {
  const planRef = database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId);
  const invoicesQuery = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).where("storeId", "==", storeId);

  return database.runTransaction(async function(transaction) {
    const planSnapshot = await transaction.get(planRef);
    const plan = planSnapshot.exists ? planSnapshot.data() || {} : null;

    if (!plan || plan.periodKind !== STORE_CUSTOM_PLAN_PERIOD_MONTHLY || typeof plan.ownerUid !== "string") {
      return { changed: false, paymentStatus: "" };
    }

    const invoicesSnapshot = await transaction.get(invoicesQuery);
    const unpaid = invoicesSnapshot.docs
      .map(function(documentSnapshot) { return documentSnapshot.data() || {}; })
      .filter(function(invoice) {
        return invoice.storeId === storeId && invoice.billingAccountUid === plan.ownerUid && STORE_CUSTOM_PLAN_OWNER_UNPAID_STATUSES.includes(invoice.status);
      });
    const next = unpaid.length === 0
      ? "current"
      : unpaid.some(function(invoice) { const at = millisOf(invoice.suspendAt); return at > 0 && at <= nowMillis; })
        ? "suspended"
        : "past_due";
    const previous = typeof plan.paymentStatus === "string" ? plan.paymentStatus : "current";

    if (previous === next) {
      return { changed: false, paymentStatus: next };
    }

    const update = { paymentStatus: next, paymentStatusChangedAt: Timestamp.fromMillis(nowMillis), updatedAt: FieldValue.serverTimestamp() };

    if (previous === "suspended" && next === "current") {
      update.resumedAt = Timestamp.fromMillis(nowMillis);
    }

    if (next === "suspended") {
      update.suspendedAt = Timestamp.fromMillis(nowMillis);
    }

    transaction.update(planRef, update);
    return { changed: true, paymentStatus: next, previous: previous };
  });
}

// ===== 運営：請求の実行(試算・実行) =====

function describePlanInvoice(ledgerId, invoice) {
  return {
    invoiceId: ledgerId,
    storeId: invoice.storeId,
    month: invoice.month,
    status: invoice.status,
    amountJpy: Number(invoice.amountJpy) || 0,
    chargeScheduledFor: invoice.chargeScheduledFor || "",
    chargeAttempt: Number.isInteger(invoice.chargeAttempt) ? invoice.chargeAttempt : 0,
    retryCount: Number.isInteger(invoice.retryCount) ? invoice.retryCount : 0,
    nextRetryAtMillis: millisOf(invoice.nextRetryAt),
    suspendAtMillis: millisOf(invoice.suspendAt),
    firstFailedAtMillis: millisOf(invoice.firstFailedAt),
    paidAtMillis: millisOf(invoice.paidAt),
    chargeOutcomeUnknown: invoice.chargeOutcomeUnknown === true,
    reviewReason: invoice.chargeReviewReason || invoice.chargeErrorReason || "",
    createdInPreview: invoice.createdInPreview === true
  };
}

// 1件の請求書に対して今行うこと：charge(締め後・請求予定日以降)・retry(再試行の予定日以降)・reconcile(請求中・
// 処理中・本人認証待ち・人の確認待ちの照合)・skip。
function planInvoiceAction(invoice, nowMs, previewTrialOnly) {
  if (previewTrialOnly && invoice.createdInPreview !== true) {
    return { plan: "skip", reason: "not_preview_trial_invoice" };
  }

  if (invoice.status === "closed") {
    return millisOf(invoice.chargeScheduledAt) <= nowMs ? { plan: "charge", reason: "" } : { plan: "skip", reason: "before_scheduled_date" };
  }

  if (invoice.status === "payment_failed") {
    const retryCount = Number.isInteger(invoice.retryCount) ? invoice.retryCount : 0;
    const nextRetry = millisOf(invoice.nextRetryAt);

    if (retryCount >= STORE_CUSTOM_PLAN_RETRY_DAYS.length || nextRetry === 0) {
      return { plan: "skip", reason: "retries_exhausted" };
    }

    return nextRetry <= nowMs ? { plan: "retry", reason: "" } : { plan: "skip", reason: "before_retry_date" };
  }

  if (LOCK_HOLDING_STATUSES.includes(invoice.status)) {
    return { plan: "reconcile", reason: "" };
  }

  return { plan: "skip", reason: invoice.status === "paid" ? "paid" : "finished_or_needs_review" };
}

export async function runStoreCustomPlanCharges(database, deps, options) {
  const dryRun = !options || options.dryRun !== false;
  const gate = readStoreCustomPlanChargeGate(deps);

  if (!dryRun && !gate.ok) {
    return { ok: false, reason: gate.reason, detail: gate.detail || "" };
  }

  const nowMs = nowOf(deps);
  const previewTrialOnly = gate.ok ? gate.previewTrialOnly : true;
  const snapshot = await database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).get();
  const entries = [];
  const touchedStores = new Set();

  for (const documentSnapshot of snapshot.docs) {
    const invoice = documentSnapshot.data() || {};

    if (options && options.month && invoice.month !== options.month) {
      continue;
    }

    const entry = describePlanInvoice(documentSnapshot.id, invoice);
    const action = planInvoiceAction(invoice, nowMs, previewTrialOnly);
    entry.plan = action.plan;
    entry.planReason = action.reason;

    if (STORE_CUSTOM_PLAN_OWNER_UNPAID_STATUSES.includes(invoice.status)) {
      touchedStores.add(invoice.storeId);
    }

    if (!dryRun && action.plan !== "skip") {
      const claimed = action.plan === "reconcile"
        ? await claimPlanReconcile(database, documentSnapshot.id, gate.config, deps)
        : await claimPlanInvoice(database, documentSnapshot.id, gate.config, deps, action.plan);

      if (claimed.skip) {
        entry.outcome = "skipped";
        entry.outcomeReason = claimed.skip;
      } else {
        const finished = action.plan === "reconcile"
          ? await performPlanReconcile(database, gate.config, deps, claimed.claim)
          : await performPlanCharge(database, gate.config, deps, claimed.claim);
        const latest = await database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(documentSnapshot.id).get();
        Object.assign(entry, describePlanInvoice(documentSnapshot.id, latest.data() || {}));
        entry.outcome = finished.recorded ? entry.status : "lease_lost";
        touchedStores.add(invoice.storeId);
      }
    }

    entries.push(entry);
  }

  // 支払いの状態(未払い・停止・再開)を更新する(実行時だけ)。
  const paymentStatuses = {};

  if (!dryRun) {
    for (const storeId of touchedStores) {
      const refreshed = await refreshStoreCustomPlanPaymentStatus(database, storeId, nowMs);
      paymentStatuses[storeId] = refreshed.paymentStatus;
    }
  }

  entries.sort(function(a, b) { return a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0; });

  return {
    ok: true,
    dryRun: dryRun,
    executionAllowed: gate.ok,
    executionBlockedReason: gate.ok ? "" : gate.reason,
    previewTrialOnly: previewTrialOnly,
    mode: gate.ok ? gate.config.mode : "",
    invoices: entries,
    paymentStatuses: paymentStatuses,
    totals: {
      invoiceCount: entries.length,
      chargeCount: entries.filter(function(x) { return x.plan === "charge"; }).length,
      retryCount: entries.filter(function(x) { return x.plan === "retry"; }).length,
      reconcileCount: entries.filter(function(x) { return x.plan === "reconcile"; }).length,
      plannedAmountJpy: entries.filter(function(x) { return x.plan === "charge" || x.plan === "retry"; }).reduce(function(s, x) { return s + x.amountJpy; }, 0)
    }
  };
}

// mode: adminStoreCustomPlanCharge (POST、運営のみ) { dryRun?: boolean(既定 true), month?: "YYYY-MM" }
// 試算は読むだけ(Stripe に接続しない)。実行は readStoreCustomPlanChargeGate が ok の時だけ(今は Preview 試験の経路だけ)。
export async function handleAdminStoreCustomPlanChargeRun(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const month = typeof body.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) ? body.month : "";
    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const result = await runStoreCustomPlanCharges(database, deps, { dryRun: body.dryRun !== false, month: month });

    if (!result.ok) {
      return response.status(403).json({ success: false, reason: result.reason, detail: result.detail || "" });
    }

    return response.status(200).json(Object.assign({ success: true }, result));
  } catch (error) {
    console.error("店舗カスタマイズ：請求エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}

// ===== 店主：本人認証・今すぐ支払う =====

function sendError(response, status, reason, extra) {
  return response.status(status).json(Object.assign({ success: false, reason: reason }, extra || {}));
}

function readLedgerId(body) {
  const id = body && typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
  return INVOICE_ID_PATTERN.test(id) ? id : "";
}

// 店主の請求書か(請求先＝ログイン中のアカウント)。他のアカウントの請求書は区別せず not_found。
async function readOwnInvoice(database, ledgerId, uid) {
  const snapshot = await database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(ledgerId).get();
  const invoice = snapshot.exists ? snapshot.data() || {} : null;

  return invoice && invoice.billingAccountUid === uid ? invoice : null;
}

// mode: storeCustomPlanPaymentStart (POST) { invoiceId }
// 本人認証が必要な請求書について、既存の PaymentIntent をそのまま画面で完了するための情報を返す
// (新しい支払いは作らない)。client_secret はこの請求書の請求先の店主にだけ返す。
export async function handleStoreCustomPlanPaymentStart(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const ledgerId = readLedgerId(deps.readRequestBody(request));

    if (ledgerId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    const gate = readStoreCustomPlanChargeGate(deps);

    if (!gate.ok) {
      return sendError(response, 403, gate.reason);
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const invoice = await readOwnInvoice(database, ledgerId, actor.uid);

    if (!invoice) {
      return sendError(response, 404, "invoice_not_found");
    }

    if (invoice.status !== "requires_action" || !PAYMENT_INTENT_ID_PATTERN.test(String(invoice.paymentIntentId || "")) || invoice.chargeMode !== gate.config.mode) {
      return sendError(response, 409, "not_requires_action");
    }

    const fetched = await stripeRequest(gate.config, deps, "GET", "/payment_intents/" + invoice.paymentIntentId, {}, null);
    const pi = fetched.ok ? fetched.data : null;
    const metadata = pi && pi.metadata && typeof pi.metadata === "object" ? pi.metadata : {};
    const customer = pi && (typeof pi.customer === "string" ? pi.customer : pi.customer && pi.customer.id);

    if (!pi || pi.id !== invoice.paymentIntentId || metadata.invoiceId !== storeCustomPlanLockKey(ledgerId) || customer !== invoice.chargeCustomerId || pi.amount !== Number(invoice.amountJpy) || typeof pi.client_secret !== "string") {
      return sendError(response, 502, "payment_intent_unavailable");
    }

    if (pi.status === "succeeded") {
      return response.status(200).json({ success: true, alreadySucceeded: true });
    }

    return response.status(200).json({
      success: true,
      clientSecret: pi.client_secret,
      publishableKey: gate.config.publishableKey,
      paymentMethodId: typeof invoice.chargePaymentMethodId === "string" ? invoice.chargePaymentMethodId : ""
    });
  } catch (error) {
    console.error("店舗カスタマイズ：本人認証の準備エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeCustomPlanPaymentConfirm (POST) { invoiceId }
// 画面での本人認証の後、サーバーが Stripe に照会して結果を確定する(画面の表示だけで支払い済みにしない)。
export async function handleStoreCustomPlanPaymentConfirm(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const ledgerId = readLedgerId(deps.readRequestBody(request));

    if (ledgerId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    const gate = readStoreCustomPlanChargeGate(deps);

    if (!gate.ok) {
      return sendError(response, 403, gate.reason);
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const invoice = await readOwnInvoice(database, ledgerId, actor.uid);

    if (!invoice) {
      return sendError(response, 404, "invoice_not_found");
    }

    const claimed = await claimPlanReconcile(database, ledgerId, gate.config, deps);

    if (claimed.skip) {
      return response.status(200).json({ success: true, status: invoice.status, changed: false, reason: claimed.skip });
    }

    await performPlanReconcile(database, gate.config, deps, claimed.claim);
    const refreshed = await refreshStoreCustomPlanPaymentStatus(database, invoice.storeId, nowOf(deps));
    const latest = await database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(ledgerId).get();

    return response.status(200).json({ success: true, status: (latest.data() || {}).status, changed: true, paymentStatus: refreshed.paymentStatus });
  } catch (error) {
    console.error("店舗カスタマイズ：支払いの確認エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeCustomPlanPayNow (POST) { invoiceId }
// 支払いに失敗した請求書を、店主の操作で今のカードに請求し直す(1回の操作で1回だけ。冪等キーは新しい試行番号)。
// 本人認証が必要になった時は requires_action になり、画面で同じ PaymentIntent を完了する。
export async function handleStoreCustomPlanPayNow(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const ledgerId = readLedgerId(deps.readRequestBody(request));

    if (ledgerId === "") {
      return sendError(response, 400, "invalid_input", { field: "invoiceId" });
    }

    const gate = readStoreCustomPlanChargeGate(deps);

    if (!gate.ok) {
      return sendError(response, 403, gate.reason);
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const invoice = await readOwnInvoice(database, ledgerId, actor.uid);

    if (!invoice) {
      return sendError(response, 404, "invoice_not_found");
    }

    if (invoice.status !== "payment_failed" || (gate.previewTrialOnly && invoice.createdInPreview !== true)) {
      return sendError(response, 409, "not_payable");
    }

    const allowed = await deps.claimRateLimit(
      database,
      STORE_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeCustomPlanPayNow", actor.uid),
      OWNER_PAYMENT_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const claimed = await claimPlanInvoice(database, ledgerId, gate.config, deps, "pay_now");

    if (claimed.skip) {
      return sendError(response, 409, claimed.skip);
    }

    await performPlanCharge(database, gate.config, deps, claimed.claim);
    const refreshed = await refreshStoreCustomPlanPaymentStatus(database, invoice.storeId, nowOf(deps));
    const latest = await database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(ledgerId).get();

    return response.status(200).json({ success: true, status: (latest.data() || {}).status, paymentStatus: refreshed.paymentStatus });
  } catch (error) {
    console.error("店舗カスタマイズ：支払いエラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// 店主の請求一覧に付ける支払いの情報(カード・顧客・支払いの ID は返さない)。
export function describeOwnerPlanInvoice(ledgerId, invoice, storeName, gateOk) {
  return {
    invoiceId: ledgerId,
    storeId: invoice.storeId,
    storeName: storeName || "",
    month: invoice.month,
    amountJpy: invoice.amountJpy,
    currency: invoice.currency,
    taxIncluded: invoice.taxIncluded === true,
    status: invoice.status,
    chargeScheduledFor: invoice.chargeScheduledFor || "",
    usageReason: invoice.usageReason || "",
    closedAtMillis: millisOf(invoice.closedAt),
    paidAtMillis: millisOf(invoice.paidAt),
    nextRetryAtMillis: millisOf(invoice.nextRetryAt),
    suspendAtMillis: millisOf(invoice.suspendAt),
    unpaid: STORE_CUSTOM_PLAN_OWNER_UNPAID_STATUSES.includes(invoice.status),
    requiresAction: invoice.status === "requires_action",
    canPayNow: gateOk === true && invoice.status === "payment_failed",
    createdInPreview: invoice.createdInPreview === true
  };
}

// mode: storeCustomPlanInvoiceList (POST、メール確認済み店舗アカウント)
// このアカウントが請求先の請求書だけを返す(店舗のメンバーでなくなった旧店主も、自分の分は見られる)。
// 他のアカウント・他の店舗の請求書は返さない。カード・顧客・支払いの ID・client_secret は返さない。
export async function handleStoreCustomPlanInvoiceList(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const snapshot = await database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).where("billingAccountUid", "==", actor.uid).get();
    const own = snapshot.docs.filter(function(documentSnapshot) { return (documentSnapshot.data() || {}).billingAccountUid === actor.uid; });
    const storeIds = Array.from(new Set(own.map(function(documentSnapshot) { return (documentSnapshot.data() || {}).storeId; })));
    const accounts = await Promise.all(storeIds.map(function(storeId) { return database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get(); }));
    const names = new Map(storeIds.map(function(storeId, index) {
      const account = accounts[index].exists ? accounts[index].data() || {} : {};
      return [storeId, typeof account.storeName === "string" ? account.storeName : ""];
    }));
    const gateOk = readStoreCustomPlanChargeGate(deps).ok;
    const invoices = own
      .map(function(documentSnapshot) {
        const invoice = documentSnapshot.data() || {};
        return describeOwnerPlanInvoice(documentSnapshot.id, invoice, names.get(invoice.storeId), gateOk);
      })
      .sort(function(a, b) { return a.month < b.month ? 1 : a.month > b.month ? -1 : a.storeId < b.storeId ? -1 : 1; });

    return response.status(200).json({
      success: true,
      invoices: invoices,
      unpaidTotalJpy: invoices.filter(function(x) { return x.unpaid; }).reduce(function(s, x) { return s + (Number(x.amountJpy) || 0); }, 0),
      paymentsAvailable: gateOk
    });
  } catch (error) {
    console.error("店舗カスタマイズ：請求一覧エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
