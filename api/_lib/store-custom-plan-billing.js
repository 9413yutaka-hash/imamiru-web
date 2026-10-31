// ==========================================================================
// STEP 44-C③｜月額100円カスタマイズの後払い請求の基盤(契約の暦月モデル・利用月の記録・月末締め・請求台帳)
// ==========================================================================
// 代表決定(2026-10-24)：月額100円(税込)、1店舗・日本時間の暦月ごとに100円、後払い、月末締め、翌月2日請求、
// 今だけ投稿とは請求書を合算しない。月途中の申込・解約・申込直後の解約でも当月100円、日割りなし、原則返金なし。
// 解約後は当月末まで利用可、翌月以降は発生しない。同じ店舗・同じ月は何度申込・解約・再申込しても100円が上限。
// 所有者変更前に発生した料金は旧店主に帰属する。
//
// 契約の種類(storeCustomPlans.periodKind)：
//   preview_trial … STEP 44-B の Preview 試験の契約(申込から暦の1か月、請求の対象外)。動作は変えない。
//   monthly       … 本番の暦月契約。解約するまで毎月継続。解約するとその月の月末(翌月1日 0:00 JST)まで利用可。
//                   status(契約の状態)：active(契約中)・canceling(解約手続き済み・月末まで)・ended(終了)。
//                   STEP 44-C④｜未払いは契約の状態と別に paymentStatus(current・past_due＝猶予中で利用可・
//                   suspended＝停止で利用不可、データは保持)で持つ(store-custom-plan-charge.js が更新する)。
//
// 利用月の記録 storeCustomPlanUsage/{storeId}_{YYYY-MM}(店舗・年月で1件)：その月に1日でも利用できた最初の
//   契約者を記録する(申込・解約・解約の取り消し・前の月の締めでの翌月の開始・締め時の補完で作る)。あとから別の
//   契約者が同じ月に申し込んでも上書きしない(同じ店舗・同じ月は100円が上限、旧店主の発生済みの料金は旧店主のまま)。
// 請求台帳 storeCustomPlanInvoices/{storeId}_{YYYY-MM}(店舗・年月で1件)：月末締めで、その月の利用月の記録から作る。
//   請求先＝利用月の記録の契約者(billingAccountUid)。Stripe への請求はこの工程では行わない(請求のフラグ false)。
// どの文書も Firestore Rules に許可の指定が無い＝ブラウザから読み書きできない(サーバーだけが書く)。
// 今だけ投稿の台帳(imadakeMonthlyInvoices 等)・料金計算・フラグには触れない。
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
  isActiveOwner,
  isEditableStore
} from "./store-profile.js";

import {
  STORE_CUSTOM_PLAN_INVOICES_COLLECTION,
  STORE_CUSTOM_PLAN_LOCK_PREFIX
} from "./store-billing.js";

export {
  STORE_CUSTOM_PLAN_INVOICES_COLLECTION,
  STORE_CUSTOM_PLAN_LOCK_PREFIX
};

// ===== 実行の許可(コード内の固定値。代表の承認があるまで false のまま変えない) =====
// 本番の暦月契約の申込の受付。false の間、本番(Production)では申込を受け付けない。
export const STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED =
  false;

// 月末締め(請求台帳への書き込み)。false の間は試算だけ(Preview 試験の環境では試験用データへ書き込める)。
export const STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED =
  false;

// Stripe への請求。false の間は請求の操作をすべて拒否する(Preview でも請求しない)。
export const STORE_CUSTOM_PLAN_CHARGE_ENABLED =
  false;

const STORE_ACCOUNTS_COLLECTION = "storeAccounts";
const STORE_MEMBERS_COLLECTION = "storeMembers";
const STORE_CUSTOM_PLANS_COLLECTION = "storeCustomPlans";
export const STORE_CUSTOM_PLAN_USAGE_COLLECTION = "storeCustomPlanUsage";

export const STORE_CUSTOM_PLAN_PERIOD_PREVIEW_TRIAL = "preview_trial";
export const STORE_CUSTOM_PLAN_PERIOD_MONTHLY = "monthly";

export const STORE_CUSTOM_PLAN_MONTHLY_FEE_JPY = 100;
// STEP 50-B(代表決定 2026-10-31)｜店舗カード月額契約(税込100円／店舗・暦月、月末締め・翌月2日請求・
// 日割りなし、今だけ投稿とは別の請求)への同意の版。カード登録の同意(STORE_BILLING_CONSENT_VERSION)とは別。
// 同意の文面を変えた時は版を上げる(古い版の申込は受け付けない)。
export const STORE_CARD_PLAN_CONSENT_VERSION = "store-card-monthly-2026-10-31";
// 請求予定日(翌月の何日、日本時間)。
export const STORE_CUSTOM_PLAN_CHARGE_DAY_OF_MONTH = 2;
// 決済失敗(代表決定)：初回失敗の3日後・7日後に再試行、初回失敗から14日で有料機能を停止。
export const STORE_CUSTOM_PLAN_RETRY_DAYS = [3, 7];
export const STORE_CUSTOM_PLAN_SUSPEND_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function millisOf(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function readNowMillis(deps) {
  return deps && typeof deps.now === "function" ? deps.now() : Date.now();
}

// ===== 日本時間の暦月 =====

export function jstMonthKey(millis) {
  const local = new Date(millis + JST_OFFSET_MS);

  return local.getUTCFullYear() + "-" + String(local.getUTCMonth() + 1).padStart(2, "0");
}

export function isMonthKey(value) {
  return typeof value === "string" && MONTH_KEY_PATTERN.test(value);
}

// その月の1日 0:00(日本時間)のミリ秒。
export function jstMonthStartMillis(monthKey) {
  const match = MONTH_KEY_PATTERN.exec(monthKey);

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1) - JST_OFFSET_MS;
}

export function nextMonthKey(monthKey) {
  const match = MONTH_KEY_PATTERN.exec(monthKey);
  const year = Number(match[1]);
  const month = Number(match[2]);

  return month === 12 ? (year + 1) + "-01" : year + "-" + String(month + 1).padStart(2, "0");
}

// 請求予定日：対象月の翌月の2日(日本時間)。{ date: "YYYY-MM-DD", millis: その日の 0:00 JST }。
export function storeCustomPlanChargeScheduleFor(monthKey) {
  const next = nextMonthKey(monthKey);
  const day = String(STORE_CUSTOM_PLAN_CHARGE_DAY_OF_MONTH).padStart(2, "0");

  return {
    date: next + "-" + day,
    millis: jstMonthStartMillis(next) + (STORE_CUSTOM_PLAN_CHARGE_DAY_OF_MONTH - 1) * DAY_MS
  };
}

// 決済失敗の予定(次工程の自動再試行・停止で使う)。初回失敗の時刻から計算する。
export function computeStoreCustomPlanRetrySchedule(firstFailedAtMillis) {
  return {
    retryAtMillis: STORE_CUSTOM_PLAN_RETRY_DAYS.map(function(days) { return firstFailedAtMillis + days * DAY_MS; }),
    suspendAtMillis: firstFailedAtMillis + STORE_CUSTOM_PLAN_SUSPEND_DAYS * DAY_MS
  };
}

// ===== 契約の利用権限 =====

export function isMonthlyPlan(planData) {
  return !!planData && planData.periodKind === STORE_CUSTOM_PLAN_PERIOD_MONTHLY;
}

// 利用権限(期間・状態だけ。契約者が owner かどうかは呼び出し側で確かめる)。
//   monthly：active は利用可(期限なし)、canceling は accessUntil(翌月1日 0:00 JST)まで、それ以外は不可。
//            ただし支払いの状態が suspended(未払いで停止)の間は利用不可(STEP 44-C④)。
//   preview_trial(と種類の無い古い形)：active・canceling で accessUntil が今より後の時だけ(STEP 44-A/B のまま)。
export function evaluateStoreCustomPlanAccess(planData, nowMillis) {
  if (!planData) {
    return false;
  }

  if (isMonthlyPlan(planData)) {
    if (planData.paymentStatus === "suspended") {
      return false;
    }

    if (planData.status === "active") {
      return true;
    }

    return planData.status === "canceling" && millisOf(planData.accessUntil) > nowMillis;
  }

  return (
    (planData.status === "active" || planData.status === "canceling") &&
    millisOf(planData.accessUntil) > nowMillis
  );
}

// その月の初め(1日 0:00 JST)の時点で、この月額契約が利用できる状態だったか(継続の判定)。
function monthlyPlanCoversMonthStart(planData, monthStartMillis) {
  if (!isMonthlyPlan(planData) || millisOf(planData.subscribedAt) >= monthStartMillis) {
    return false;
  }

  if (planData.status === "active") {
    return true;
  }

  return planData.status === "canceling" && millisOf(planData.accessUntil) > monthStartMillis;
}

// ===== 利用月の記録(店舗・年月で1件) =====

export function storeCustomPlanUsageId(storeId, monthKey) {
  return storeId + "_" + monthKey;
}

export function storeCustomPlanUsageRef(database, storeId, monthKey) {
  return database.collection(STORE_CUSTOM_PLAN_USAGE_COLLECTION).doc(storeCustomPlanUsageId(storeId, monthKey));
}

// transaction の中で使う(読み取りは呼び出し側で先に済ませ、その結果 usageSnapshot を渡す)。
// 記録が無ければ作る。有れば契約者を変えない(後から別の契約者が利用しても、記録に残すだけ)。
export function writeStoreCustomPlanUsage(transaction, usageRef, usageSnapshot, entry) {
  if (usageSnapshot.exists) {
    const usage = usageSnapshot.data() || {};

    if (usage.holderUid !== entry.holderUid) {
      transaction.update(usageRef, {
        laterHolderUids: FieldValue.arrayUnion(entry.holderUid),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    return false;
  }

  transaction.set(usageRef, {
    storeId: entry.storeId,
    month: entry.month,
    holderUid: entry.holderUid,
    billingAccountUid: entry.holderUid,
    reason: entry.reason,
    firstUsageAt: Timestamp.fromMillis(entry.atMillis),
    contractSubscribedAt: entry.contractSubscribedAt || null,
    createdInPreview: entry.createdInPreview === true,
    status: "accrued",
    invoiceId: null,
    laterHolderUids: Array.isArray(entry.laterHolderUids) ? entry.laterHolderUids : [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return true;
}

// ===== 月末締め =====

function sendError(response, status, reason, extra) {
  return response.status(status).json(Object.assign({ success: false, reason: reason }, extra || {}));
}

function storeCustomPlanCloseWritesAllowed(deps) {
  return (
    STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === true ||
    (typeof deps.isStoreCustomPlanTrialEnabled === "function" && deps.isStoreCustomPlanTrialEnabled() === true)
  );
}

// 継続中の月額契約について、その月の利用月の記録を作る(無ければ)。契約者が今も店舗の有効な owner で、
// 店舗が有効な時だけ。契約者が owner でなくなっていたら、料金を作らずに契約を終了する(過大な請求をしない)。
async function ensureContinuationUsage(database, planDocument, monthKey, nowMillis, execute, counts) {
  const storeId = planDocument.id;
  const planRef = database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId);
  const usageRef = storeCustomPlanUsageRef(database, storeId, monthKey);
  const monthStart = jstMonthStartMillis(monthKey);
  let result = "skipped";

  const decide = function(plan, member, account, usageExists) {
    // 未払いで停止中(paymentStatus suspended)の契約には、新しい月の料金を作らない。
    if (!monthlyPlanCoversMonthStart(plan, monthStart) || plan.paymentStatus === "suspended") {
      return "not_covered";
    }

    if (usageExists) {
      return "already";
    }

    if (!member || !isActiveOwner(member, plan.ownerUid, storeId)) {
      return "holder_not_owner";
    }

    if (!account || !isEditableStore(account)) {
      return "store_not_active";
    }

    return "create";
  };

  if (!execute) {
    const plan = planDocument.data() || {};
    const snapshots = await Promise.all([
      database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + plan.ownerUid).get(),
      database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get(),
      usageRef.get()
    ]);
    result = decide(
      plan,
      snapshots[0].exists ? snapshots[0].data() : null,
      snapshots[1].exists ? snapshots[1].data() : null,
      snapshots[2].exists
    );
  } else {
    await database.runTransaction(async function(transaction) {
      const planSnapshot = await transaction.get(planRef);
      const plan = planSnapshot.exists ? planSnapshot.data() || {} : null;

      if (!plan || typeof plan.ownerUid !== "string" || plan.ownerUid === "") {
        result = "not_covered";
        return;
      }

      const snapshots = await Promise.all([
        transaction.get(database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + plan.ownerUid)),
        transaction.get(database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId)),
        transaction.get(usageRef)
      ]);

      result = decide(
        plan,
        snapshots[0].exists ? snapshots[0].data() : null,
        snapshots[1].exists ? snapshots[1].data() : null,
        snapshots[2].exists
      );

      if (result === "create") {
        writeStoreCustomPlanUsage(transaction, usageRef, snapshots[2], {
          storeId: storeId,
          month: monthKey,
          holderUid: plan.ownerUid,
          reason: "continued",
          // 継続中の契約は、その月の初めから利用できた。
          atMillis: monthStart,
          contractSubscribedAt: plan.subscribedAt || null,
          createdInPreview: plan.createdInPreview === true
        });
      } else if (result === "holder_not_owner" && plan.status !== "ended") {
        transaction.update(planRef, {
          status: "ended",
          endedAt: Timestamp.fromMillis(nowMillis),
          endReason: "holder_not_owner",
          updatedAt: FieldValue.serverTimestamp(),
          revision: (Number.isInteger(plan.revision) ? plan.revision : 0) + 1
        });
      }
    });
  }

  counts[result] = (counts[result] || 0) + 1;
  return result;
}

// 利用月の記録1件から請求台帳を作る(無ければ)。同じ店舗・同じ月の請求書は1件だけ(ID固定・transaction)。
async function closeUsageIntoInvoice(database, usageDocument, monthKey, closeRunId, nowMillis, execute, counts) {
  const usageRef = usageDocument.ref;
  const storeId = (usageDocument.data() || {}).storeId;
  const invoiceRef = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION).doc(storeId + "_" + monthKey);
  const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
  let result = "skipped";

  const decide = function(usage, invoiceExists, account) {
    if (!usage || usage.month !== monthKey || usage.storeId !== storeId || usageRef.id !== storeId + "_" + monthKey) {
      return "invalid_usage";
    }

    if (invoiceExists) {
      return usage.status === "invoiced" ? "already_invoiced" : "invoice_exists";
    }

    if (account && account.isTestAccount === true) {
      return "test_store";
    }

    if (typeof usage.billingAccountUid !== "string" || usage.billingAccountUid === "") {
      return "invalid_usage";
    }

    return "create";
  };

  const buildInvoice = function(usage) {
    const schedule = storeCustomPlanChargeScheduleFor(monthKey);

    return {
      storeId: storeId,
      month: monthKey,
      amountJpy: STORE_CUSTOM_PLAN_MONTHLY_FEE_JPY,
      currency: "JPY",
      taxIncluded: true,
      holderUid: usage.holderUid,
      billingAccountUid: usage.billingAccountUid,
      laterHolderUids: Array.isArray(usage.laterHolderUids) ? usage.laterHolderUids : [],
      usageReason: usage.reason,
      firstUsageAt: usage.firstUsageAt || null,
      contractSubscribedAt: usage.contractSubscribedAt || null,
      createdInPreview: usage.createdInPreview === true,
      status: "closed",
      closedAt: Timestamp.fromMillis(nowMillis),
      closeRunId: closeRunId,
      chargeScheduledFor: schedule.date,
      chargeScheduledAt: Timestamp.fromMillis(schedule.millis),
      // 次工程(Stripe への請求)で使う。今は空のまま。
      chargeAttempt: 0,
      chargeAttempts: [],
      paymentIntentId: "",
      chargeCustomerId: "",
      chargePaymentMethodId: "",
      chargeCardVersion: null,
      chargeOutcomeUnknown: false,
      firstFailedAt: null,
      nextRetryAt: null,
      suspendAt: null,
      lastError: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };
  };

  if (!execute) {
    const snapshots = await Promise.all([invoiceRef.get(), accountRef.get()]);
    result = decide(usageDocument.data() || {}, snapshots[0].exists, snapshots[1].exists ? snapshots[1].data() : null);
  } else {
    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([transaction.get(usageRef), transaction.get(invoiceRef), transaction.get(accountRef)]);
      const usage = snapshots[0].exists ? snapshots[0].data() || {} : null;
      result = decide(usage, snapshots[1].exists, snapshots[2].exists ? snapshots[2].data() : null);

      if (result === "create") {
        transaction.set(invoiceRef, buildInvoice(usage));
        transaction.update(usageRef, {
          status: "invoiced",
          invoiceId: invoiceRef.id,
          invoicedAt: Timestamp.fromMillis(nowMillis),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else if (result === "invoice_exists") {
        // 請求書は既にある(別の実行が作った)：利用月の記録に印だけ付ける(金額は増やさない)。
        transaction.update(usageRef, {
          status: "invoiced",
          invoiceId: invoiceRef.id,
          updatedAt: FieldValue.serverTimestamp()
        });
      } else if (result === "test_store" && usage.status !== "excluded") {
        transaction.update(usageRef, { status: "excluded", excludedReason: "test_store", updatedAt: FieldValue.serverTimestamp() });
      }
    });
  }

  counts[result] = (counts[result] || 0) + 1;

  if (result === "create") {
    counts.amountJpy = (counts.amountJpy || 0) + STORE_CUSTOM_PLAN_MONTHLY_FEE_JPY;
  }

  return result;
}

// 月末締めの本体。month(YYYY-MM、日本時間)が終わっていること。execute=false は読むだけ(試算)。
//   1. 継続中の月額契約の、その月の利用月の記録を補完する(前の月の締めで作れなかった分)。
//   2. その月の利用月の記録から請求台帳を作る(店舗・年月で1件)。
//   3. 翌月の利用月の記録を、今も継続中の契約について作る(翌月の初めの時点の契約者に料金を結び付ける)。
export async function runStoreCustomPlanMonthlyClose(database, monthKey, nowMillis, execute) {
  const currentMonth = jstMonthKey(nowMillis);

  if (!isMonthKey(monthKey) || monthKey >= currentMonth) {
    return { ok: false, reason: "month_not_closed" };
  }

  const closeRunId = randomUUID();
  const next = nextMonthKey(monthKey);
  const continuation = {};
  const invoices = {};
  const opening = {};
  const planSnapshot = await database.collection(STORE_CUSTOM_PLANS_COLLECTION).where("periodKind", "==", STORE_CUSTOM_PLAN_PERIOD_MONTHLY).get();

  for (const planDocument of planSnapshot.docs) {
    await ensureContinuationUsage(database, planDocument, monthKey, nowMillis, execute, continuation);
  }

  const usageSnapshot = await database.collection(STORE_CUSTOM_PLAN_USAGE_COLLECTION).where("month", "==", monthKey).get();

  for (const usageDocument of usageSnapshot.docs) {
    await closeUsageIntoInvoice(database, usageDocument, monthKey, closeRunId, nowMillis, execute, invoices);
  }

  // 翌月の開始は、翌月が始まっている時だけ(締めは対象月の終了後なので、翌月は始まっている)。
  if (next <= currentMonth) {
    const refreshed = await database.collection(STORE_CUSTOM_PLANS_COLLECTION).where("periodKind", "==", STORE_CUSTOM_PLAN_PERIOD_MONTHLY).get();

    for (const planDocument of refreshed.docs) {
      await ensureContinuationUsage(database, planDocument, next, nowMillis, execute, opening);
    }
  }

  return {
    ok: true,
    month: monthKey,
    executed: execute === true,
    closeRunId: execute ? closeRunId : "",
    chargeScheduledFor: storeCustomPlanChargeScheduleFor(monthKey).date,
    continuation: continuation,
    invoices: invoices,
    nextMonth: next,
    nextMonthOpening: opening
  };
}

// mode: adminStoreCustomPlanMonthlyClose (POST、運営のみ) { month: "YYYY-MM", execute?: true }
// 既定は試算(読むだけ)。書き込みは STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED(false)か Preview 試験の環境の時だけ。
// Stripe には接続しない。
export async function handleAdminStoreCustomPlanMonthlyClose(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const execute = body.execute === true;

    if (!isMonthKey(body.month)) {
      return sendError(response, 400, "invalid_input", { field: "month" });
    }

    if (execute && !storeCustomPlanCloseWritesAllowed(deps)) {
      return sendError(response, 403, "close_writes_disabled");
    }

    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const result = await runStoreCustomPlanMonthlyClose(database, body.month, readNowMillis(deps), execute);

    if (!result.ok) {
      return sendError(response, 409, result.reason);
    }

    return response.status(200).json(Object.assign({ success: true }, result));
  } catch (error) {
    console.error("店舗カスタマイズ：月末締めエラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// STEP 44-C④｜請求(adminStoreCustomPlanCharge)と店主の請求一覧(storeCustomPlanInvoiceList)は
// store-custom-plan-charge.js へ移した(支払いの状態・本人認証と合わせて扱うため)。

function buildInvoiceSummary(documentSnapshot) {
  const data = documentSnapshot.data() || {};

  return {
    invoiceId: documentSnapshot.id,
    storeId: data.storeId,
    month: data.month,
    amountJpy: data.amountJpy,
    currency: data.currency,
    taxIncluded: data.taxIncluded === true,
    status: data.status,
    chargeScheduledFor: data.chargeScheduledFor || "",
    usageReason: data.usageReason || "",
    closedAtMillis: millisOf(data.closedAt),
    // STEP 44-C④｜運営の確認用(決済失敗・結果不明・再試行の状況)。
    chargeAttempt: Number.isInteger(data.chargeAttempt) ? data.chargeAttempt : 0,
    retryCount: Number.isInteger(data.retryCount) ? data.retryCount : 0,
    nextRetryAtMillis: millisOf(data.nextRetryAt),
    suspendAtMillis: millisOf(data.suspendAt),
    paidAtMillis: millisOf(data.paidAt),
    chargeOutcomeUnknown: data.chargeOutcomeUnknown === true,
    reviewReason: data.chargeReviewReason || data.chargeErrorReason || "",
    createdInPreview: data.createdInPreview === true
  };
}

// mode: adminStoreCustomPlanInvoiceList (POST、運営のみ、読み取り専用) { month?: "YYYY-MM" }
export async function handleAdminStoreCustomPlanInvoiceList(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const collection = database.collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION);
    const snapshot = isMonthKey(body.month) ? await collection.where("month", "==", body.month).get() : await collection.get();
    const invoices = snapshot.docs.map(buildInvoiceSummary).sort(function(a, b) {
      return a.month < b.month ? 1 : a.month > b.month ? -1 : a.storeId < b.storeId ? -1 : 1;
    });

    return response.status(200).json({
      success: true,
      invoices: invoices,
      totalAmountJpy: invoices.reduce(function(sum, invoice) { return sum + (Number(invoice.amountJpy) || 0); }, 0)
    });
  } catch (error) {
    console.error("店舗カスタマイズ：請求台帳一覧エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
