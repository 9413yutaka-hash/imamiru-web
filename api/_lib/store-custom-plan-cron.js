// ==========================================================================
// STEP 44-C⑤｜月額100円カスタマイズの定期実行の入口(運営のログイン不要・合言葉で認証)
// ==========================================================================
// 呼び出し：POST /api/moderate-submission  本文 { "mode": "storeCustomPlanCron" }
//   見出し X-Machinau-Cron-Secret に合言葉。合言葉は /api/expire・/api/admin-source-collect と同じ
//   AI_COLLECT_CRON_SECRET を再利用する(新しい秘密値は作らない)。比較は timingSafeEqual。
// 毎日1回(何回呼ばれても同じ結果)、日本時間の日付で次を行う：
//   1. 前月分の月末締め(runStoreCustomPlanMonthlyClose。毎月1日に呼ばれる想定だが、1日の実行に失敗しても翌日以降の
//      実行で同じ締めを行い直す＝取りこぼしを防ぐ。締めは店舗・年月で1件のため重複しない)。
//   2. 未払いの判定(applyStoreCustomPlanDunning：初回失敗から14日を過ぎた未払いの店舗の有料機能を停止、
//      支払い済みなら再開。Stripe には接続しない)。
//   4. STEP 47-C｜店舗の退会の最終削除(runAccountDeletionSweep。清算が済んだ退会だけ)。運営の対応が必要な異常を
//      はじめて見つけた時は 500(reason operator_attention_required)にして、定期実行の失敗のメールで知らせる。
//   3. 請求・再試行・照合の対象の判定(runStoreCustomPlanCharges)。毎月2日以降に請求予定日を迎えた請求書、
//      再試行の予定日を過ぎた支払い失敗、結果不明の照合。定期実行からの実行は STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED
//      (false)が true で、かつ請求の許可(readStoreCustomPlanChargeGate)がある時だけ。false の間は試算(対象の判定と
//      記録)だけで、Stripe に接続しない。結果不明の請求は従来どおり自動で送り直さない。
// 実行の条件：合言葉が設定されていない → 503(何もしない)。合言葉が違う → 401(何もしない)。
//   Preview 試験の環境(Preview・対象ブランチ・machinau-preview)でない、かつ本番の締めの許可(STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED、
//   false)も無い → 403(何もしない)。同時に別の実行が動いている → 409(何もしない、ロックは5分で自動的に外れる)。
// 記録：storeCustomPlanCronRuns/{日本時間の日付}_{実行ID}(手順ごとの結果・件数・失敗の内容)。失敗した手順があれば 500 を返す
// (cron-job.org 等で失敗に気づけるように)。手順はそれぞれ独立して何度行っても同じ結果のため、途中で止まっても次の実行で続く。
// 新しい Function は作らない(api/moderate-submission.js の mode)。ブラウザからは読み書きできない(Rules に許可なし)。
// ==========================================================================

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED,
  jstMonthKey,
  jstMonthStartMillis,
  runStoreCustomPlanMonthlyClose
} from "./store-custom-plan-billing.js";

import {
  applyStoreCustomPlanDunning,
  readStoreCustomPlanChargeGate,
  runStoreCustomPlanCharges
} from "./store-custom-plan-charge.js";

// 定期実行からの Stripe への請求の許可(コード内の固定値)。代表の承認があるまで false のまま変えない。
export const STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED =
  false;

export const STORE_CUSTOM_PLAN_CRON_RUNS_COLLECTION = "storeCustomPlanCronRuns";
const CRON_LOCK_COLLECTION = "storeCustomPlanCronLocks";
const CRON_LOCK_ID = "daily";
const CRON_LOCK_LEASE_MS = 5 * 60 * 1000;
// 1回の実行で使う時間の目安。過ぎたら残りの手順は次の実行に回す(Vercel の実行時間の上限より十分短く)。
const CRON_TIME_BUDGET_MS = 25 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function readCronSecretHeader(request) {
  const value = request.headers && request.headers["x-machinau-cron-secret"];
  return typeof value === "string" ? value : "";
}

// /api/expire と同じ考え方(空は不一致、長さが違えば不一致、比較は timingSafeEqual)。
export function storeCustomPlanCronSecretsMatch(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || provided === "" || expected === "") {
    return false;
  }

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function jstDateKey(millis) {
  return new Date(millis + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// 前月(日本時間)。
export function previousJstMonthKey(millis) {
  const current = jstMonthKey(millis);
  return jstMonthKey(jstMonthStartMillis(current) - 1);
}

function errorSummary(error) {
  return { message: String(error && error.message ? error.message : error).slice(0, 200) };
}

async function acquireLock(database, runId, nowMillis) {
  const lockRef = database.collection(CRON_LOCK_COLLECTION).doc(CRON_LOCK_ID);

  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(lockRef);
    const lock = snapshot.exists ? snapshot.data() || {} : {};
    const leaseUntil = lock.leaseUntil && typeof lock.leaseUntil.toMillis === "function" ? lock.leaseUntil.toMillis() : 0;

    if (lock.runId && leaseUntil > nowMillis) {
      return false;
    }

    transaction.set(lockRef, { runId: runId, leaseUntil: Timestamp.fromMillis(nowMillis + CRON_LOCK_LEASE_MS), acquiredAt: Timestamp.fromMillis(nowMillis) });
    return true;
  });
}

async function releaseLock(database, runId) {
  const lockRef = database.collection(CRON_LOCK_COLLECTION).doc(CRON_LOCK_ID);

  await database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(lockRef);

    if (snapshot.exists && (snapshot.data() || {}).runId === runId) {
      transaction.set(lockRef, { runId: "", leaseUntil: Timestamp.fromMillis(0), releasedAt: FieldValue.serverTimestamp() });
    }
  });
}

// 定期実行の本体(認証・環境の確認は呼び出し側)。
export async function runStoreCustomPlanCron(database, deps, nowMillis) {
  const startedMs = Date.now();
  const deadline = startedMs + CRON_TIME_BUDGET_MS;
  const steps = {};
  const errors = [];
  const closeMonth = previousJstMonthKey(nowMillis);

  // 1. 前月分の月末締め(毎日、取りこぼしの補完を兼ねる)。
  try {
    const closed = await runStoreCustomPlanMonthlyClose(database, closeMonth, nowMillis, true);
    steps.close = closed.ok
      ? { status: "done", month: closeMonth, invoices: closed.invoices, continuation: closed.continuation, nextMonthOpening: closed.nextMonthOpening, chargeScheduledFor: closed.chargeScheduledFor }
      : { status: "skipped", month: closeMonth, reason: closed.reason };
  } catch (error) {
    steps.close = { status: "failed", month: closeMonth, error: errorSummary(error) };
    errors.push("close");
  }

  // 2. 未払いの判定(14日で停止・支払い済みで再開)。
  if (Date.now() > deadline) {
    steps.dunning = { status: "deferred" };
  } else {
    try {
      steps.dunning = Object.assign({ status: "done" }, await applyStoreCustomPlanDunning(database, nowMillis, deadline));

      if (steps.dunning.deferred > 0) {
        steps.dunning.status = "partial";
      }
    } catch (error) {
      steps.dunning = { status: "failed", error: errorSummary(error) };
      errors.push("dunning");
    }
  }

  // 3. 請求・再試行・照合(定期実行からの請求の許可が無い間は試算＝対象の判定と記録だけ)。
  if (Date.now() > deadline) {
    steps.charges = { status: "deferred" };
  } else {
    try {
      const gate = readStoreCustomPlanChargeGate(deps);
      const execute = STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === true && gate.ok === true;
      const charged = await runStoreCustomPlanCharges(database, deps, { dryRun: !execute });

      steps.charges = charged.ok
        ? {
            status: "done",
            executed: execute,
            blockedReason: execute ? "" : (STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED !== true ? "cron_charges_disabled" : gate.reason),
            totals: charged.totals,
            dueInvoiceIds: charged.invoices.filter(function(x) { return x.plan === "charge" || x.plan === "retry" || x.plan === "reconcile"; }).map(function(x) { return x.invoiceId + ":" + x.plan; }).slice(0, 50)
          }
        : { status: "failed", reason: charged.reason };

      if (!charged.ok) {
        errors.push("charges");
      }
    } catch (error) {
      steps.charges = { status: "failed", error: errorSummary(error) };
      errors.push("charges");
    }
  }

  // 4. STEP 47-C ②｜店舗の退会の最終削除(締め・未払いの判定・請求の後に行う＝その日の請求の処理が先)。
  //    最終削除は記録ごとに清算をもう一度確かめる(未払い・結果不明・請求中は削除しない)。本体は
  //    store-account-deletion.js(依存として渡される。無ければ行わない)。
  if (typeof deps.runAccountDeletionSweep === "function") {
    if (Date.now() > deadline) {
      steps.accountDeletion = { status: "deferred" };
    } else {
      try {
        steps.accountDeletion = await deps.runAccountDeletionSweep(database);
      } catch (error) {
        steps.accountDeletion = { status: "failed", error: errorSummary(error) };
        errors.push("accountDeletion");
      }
    }
  }

  const deferred = Object.values(steps).some(function(step) { return step.status === "deferred" || step.status === "partial"; });

  return {
    jstDate: jstDateKey(nowMillis),
    closeMonth: closeMonth,
    status: errors.length > 0 ? "failed" : deferred ? "partial" : "completed",
    errors: errors,
    steps: steps,
    elapsedMs: Date.now() - startedMs
  };
}

// mode: storeCustomPlanCron (POST、合言葉で認証。運営のログインは不要)
export async function handleStoreCustomPlanCron(request, response, deps) {
  const expected = deps.env ? deps.env.AI_COLLECT_CRON_SECRET : "";

  if (typeof expected !== "string" || expected === "") {
    return response.status(503).json({ success: false, reason: "cron_secret_not_configured" });
  }

  if (!storeCustomPlanCronSecretsMatch(readCronSecretHeader(request), expected)) {
    return response.status(401).json({ success: false, reason: "unauthorized" });
  }

  const trial = typeof deps.isStoreCustomPlanTrialEnabled === "function" && deps.isStoreCustomPlanTrialEnabled() === true;

  if (!trial && STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED !== true) {
    return response.status(403).json({ success: false, reason: "cron_disabled" });
  }

  const database = deps.getFirestore(deps.getFirebaseAdminApp());
  const nowMillis = typeof deps.now === "function" ? deps.now() : Date.now();
  const runId = randomUUID();
  let locked = false;

  try {
    locked = await acquireLock(database, runId, nowMillis);

    if (!locked) {
      return response.status(409).json({ success: false, reason: "already_running" });
    }

    const result = await runStoreCustomPlanCron(database, deps, nowMillis);

    await database.collection(STORE_CUSTOM_PLAN_CRON_RUNS_COLLECTION).doc(result.jstDate + "_" + runId).set(Object.assign({
      runId: runId,
      startedAt: Timestamp.fromMillis(nowMillis),
      finishedAt: FieldValue.serverTimestamp(),
      environment: trial ? "preview_trial" : "production"
    }, result));

    // STEP 47-C ③｜退会の最終削除で運営の対応が必要な異常を今回はじめて見つけた時も 500 にする
    // (定期実行の仕組みの失敗のメールで運営に知らせる。同じ異常では二度と 500 にしない)。
    const deletionStep = result.steps && result.steps.accountDeletion;
    const attention = Boolean(deletionStep && deletionStep.operatorAttention && Object.keys(deletionStep.operatorAttention).length > 0);

    return response.status(result.status === "failed" || attention ? 500 : 200).json(Object.assign(
      { success: result.status !== "failed" && !attention, runId: runId },
      attention ? { reason: "operator_attention_required" } : {},
      result
    ));
  } catch (error) {
    console.error("店舗カスタマイズ：定期実行エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  } finally {
    if (locked) {
      await releaseLock(database, runId).catch(function(error) {
        console.error("店舗カスタマイズ：定期実行のロック解除エラー：", error && error.message);
      });
    }
  }
}
