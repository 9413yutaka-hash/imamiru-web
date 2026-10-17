// ==========================================================================
// 今だけ投稿 決済 STEP 31｜店舗のカード登録(Stripe SetupIntent、サーバー側のみ)
// ==========================================================================
// 将来の月次請求に備えて、事業者(storeId)ごとにStripeの顧客を1つ作り、カードを登録する。
// このファイルは請求をしない(お金は動かない)。月次の締め・請求・返金は別の工程。
//
// 安全装置(どれか1つでも満たさなければ、カード登録の機能そのものを止める)
//   ・環境変数 STRIPE_MODE が "test"(本番モードはこの工程では使わない)
//   ・サーバーのキー(STRIPE_RESTRICTED_KEY)が rk_test_／sk_test_、公開可能キー
//     (STRIPE_PUBLISHABLE_KEY)が pk_test_ で始まる(テストと本番の取り違えを防ぐ)
//   ・Productionのデプロイ(VERCEL_ENV=production)では動かさない(本番サイトでは無効)
//   ・キーが未設定なら止める
// キーの値はログ・応答・Firestoreに一切出さない。Stripeの応答本文もログに出さない。
//
// 保存先(サーバーのAdmin SDKだけが読み書きする。ブラウザからは読み書き不可にする)
//   storeBilling/{storeId}
//     test: { customerId, paymentMethodId, card: { brand, last4, expMonth, expYear }, cardVersion,
//             detachPendingPaymentMethods: [ 置き換え前のカード(取り外し待ち) ], lastDetachResult,
//             pendingSetupIntentId, consentVersion, consentAt, updatedAt, updatedByUid }
//     live: (本番用。この工程では作らない)
//   PreviewとProductionは同じFirestoreなので、テスト用と本番用は必ず別の項目に分ける。
//   カード番号・セキュリティコードは受け取らない・保存しない(Stripeが直接受け取る)。
//
// 操作できるのは、メール確認済みの店舗アカウントで、その事業者の有効なownerだけ
// (既存のrequireVerifiedStoreUser＋checkStoreProfileEditor)。
// このファイルはVercel Functionではない(api/moderate-submission.jsから呼ばれる)。
// ==========================================================================

import {
  FieldValue
} from "firebase-admin/firestore";

import {
  randomUUID
} from "node:crypto";

import {
  requireVerifiedStoreUser
} from "./store-self-service.js";

import {
  IMADAKE_CV_BILLING_STARTED
} from "./imadake.js";

export const STORE_BILLING_COLLECTION =
  "storeBilling";

const STORE_BILLING_RATE_LIMITS_COLLECTION =
  "storeBillingRateLimits";

// SetupIntentの作成は同じ事業者で10秒に1回まで(連打で大量に作らない)。
const STORE_BILLING_SETUP_COOLDOWN_MS =
  10 * 1000;

const STRIPE_API_BASE =
  "https://api.stripe.com/v1";

const STRIPE_REQUEST_TIMEOUT_MS =
  10000;

// 将来の請求にカードを使うことへの同意文の版(画面の文言を変えたら上げる)。
export const STORE_BILLING_CONSENT_VERSION =
  "2026-10-16";

// この工程で許可するモードはテストだけ。
const ALLOWED_STRIPE_MODES =
  ["test"];

const STRIPE_SETUP_INTENT_ID_PATTERN =
  /^seti_[A-Za-z0-9]{1,100}$/;

// 現在のカードとして保存するIDと、取り外し待ちに記録するIDは同じ条件で判定する(記録漏れを防ぐ)。
const STRIPE_PAYMENT_METHOD_ID_PATTERN =
  /^pm_[A-Za-z0-9_]{1,100}$/;

// カード変更で置き換わった旧カードの「取り外し待ち」の上限。上限に達している間は新しい
// カード変更を始めさせない(確定時には記録を捨てない)。取り外し処理は別の工程で追加する。
const DETACH_PENDING_LIMIT =
  10;

// 取り外し待ち(detachPendingPaymentMethods)の1件:
//   { paymentMethodId, state: "pending", queuedAtMs, queuedCardVersion, attempts }
// 一度ここに入ったカードは、二度と現在のカードとして保存しない(確定時に拒否する)。
function readDetachPending(section) {
  const list = Array.isArray(section.detachPendingPaymentMethods) ? section.detachPendingPaymentMethods : [];

  return list.filter(function(entry) {
    return entry && typeof entry.paymentMethodId === "string" && entry.paymentMethodId !== "";
  });
}

function isDetachPending(list, paymentMethodId) {
  return list.some(function(entry) {
    return entry.paymentMethodId === paymentMethodId;
  });
}

const STORE_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,128}$/;

function sendError(response, status, reason, extra) {
  return response.status(status).json(
    Object.assign({ success: false, reason: reason }, extra || {})
  );
}

// 環境変数からStripeの設定を読み、安全条件をすべて確かめる。キーの値は返り値の
// serverKey/publishableKeyだけに入れ、呼び出し元はログに出さない。
export function readStripeBillingConfig(env) {
  const source = env || {};
  const mode = typeof source.STRIPE_MODE === "string" ? source.STRIPE_MODE.trim() : "";
  const serverKey =
    typeof source.STRIPE_RESTRICTED_KEY === "string" ? source.STRIPE_RESTRICTED_KEY.trim() : "";
  const publishableKey =
    typeof source.STRIPE_PUBLISHABLE_KEY === "string" ? source.STRIPE_PUBLISHABLE_KEY.trim() : "";

  if (source.VERCEL_ENV === "production") {
    return { ok: false, reason: "disabled_in_production" };
  }

  if (mode === "" || serverKey === "" || publishableKey === "") {
    return { ok: false, reason: "not_configured" };
  }

  if (!ALLOWED_STRIPE_MODES.includes(mode)) {
    return { ok: false, reason: "mode_not_allowed" };
  }

  const serverKeyIsTest = serverKey.startsWith("rk_test_") || serverKey.startsWith("sk_test_");
  const publishableKeyIsTest = publishableKey.startsWith("pk_test_");

  if (!serverKeyIsTest || !publishableKeyIsTest) {
    return { ok: false, reason: "key_mode_mismatch" };
  }

  return {
    ok: true,
    mode: mode,
    serverKey: serverKey,
    publishableKey: publishableKey
  };
}

// application/x-www-form-urlencoded(Stripeの形式)。値はstringかnumberだけ。
function encodeStripeForm(params) {
  const form = new URLSearchParams();

  Object.keys(params || {}).forEach(function(key) {
    const value = params[key];

    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  });

  return form.toString();
}

// Stripe APIを呼ぶ。失敗しても例外は投げず { ok:false, status, type, code } を返す
// (キー・応答本文はどこにも出さない)。
async function callStripe(config, deps, method, path, params, idempotencyKey, timeoutMs) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(function() {
    abortController.abort();
  }, timeoutMs || STRIPE_REQUEST_TIMEOUT_MS);

  const headers = {
    "Authorization": "Bearer " + config.serverKey
  };
  let url = STRIPE_API_BASE + path;
  let body;

  if (method === "GET") {
    const query = encodeStripeForm(params);

    if (query !== "") {
      url += "?" + query;
    }
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = encodeStripeForm(params);
  }

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  try {
    const stripeResponse = await deps.fetch(url, {
      method: method,
      headers: headers,
      body: body,
      signal: abortController.signal
    });
    let data = null;

    try {
      data = await stripeResponse.json();
    } catch (error) {
      data = null;
    }

    if (!stripeResponse.ok || !data || data.error) {
      const stripeError = data && data.error ? data.error : {};

      return {
        ok: false,
        status: stripeResponse.status,
        type: typeof stripeError.type === "string" ? stripeError.type : "",
        code: typeof stripeError.code === "string" ? stripeError.code : ""
      };
    }

    return { ok: true, data: data };
  } catch (error) {
    return { ok: false, status: 0, type: "network_error", code: "" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function readStoreId(body) {
  const storeId = body && typeof body.storeId === "string" ? body.storeId.trim() : "";

  return STORE_ID_PATTERN.test(storeId) ? storeId : "";
}

// ログイン・メール確認・その事業者の有効なownerかを確かめる。だめならnull(応答は送信済み)。
async function requireStoreBillingOwner(request, response, deps, database, storeId) {
  const actor = await requireVerifiedStoreUser(request, response, deps);

  if (!actor) {
    return null;
  }

  if (storeId === "") {
    sendError(response, 400, "invalid_input", { field: "storeId" });
    return null;
  }

  const editor = await deps.checkStoreProfileEditor(database, storeId, actor.uid);

  if (!editor.ok) {
    sendError(response, editor.status === 404 ? 404 : 403, editor.reason || "not_owner");
    return null;
  }

  return actor;
}

function readModeSection(billingData, mode) {
  const section = billingData && billingData[mode];

  return section && typeof section === "object" ? section : {};
}

function buildCardSummary(section) {
  const card = section.card && typeof section.card === "object" ? section.card : null;

  if (!card || typeof section.paymentMethodId !== "string" || section.paymentMethodId === "") {
    return null;
  }

  return {
    brand: typeof card.brand === "string" ? card.brand : "",
    last4: typeof card.last4 === "string" ? card.last4 : "",
    expMonth: Number(card.expMonth) || 0,
    expYear: Number(card.expYear) || 0
  };
}

// mode: storeBillingStatus (POST)
// { storeId } → { success, available, unavailableReason, card }
// available:false の時、画面はカード登録欄を出さない(本番サイト・キー未設定など)。
export async function handleStoreBillingStatus(request, response, deps) {
  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const storeId = readStoreId(deps.readRequestBody(request));
    const actor = await requireStoreBillingOwner(request, response, deps, database, storeId);

    if (!actor) {
      return;
    }

    const config = readStripeBillingConfig(deps.env);

    if (!config.ok) {
      return response.status(200).json({
        success: true,
        available: false,
        unavailableReason: config.reason,
        card: null
      });
    }

    const snapshot = await database.collection(STORE_BILLING_COLLECTION).doc(storeId).get();
    const section = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);

    return response.status(200).json({
      success: true,
      available: true,
      mode: config.mode,
      card: buildCardSummary(section)
    });
  } catch (error) {
    console.error("店舗カード登録：状態取得エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// 事業者のStripe顧客を1つだけ用意する。既にあればそれを使う。作成は冪等キーで
// 重複を防ぎ、保存はトランザクションで先に保存された値を優先する。
async function ensureStripeCustomer(database, config, deps, storeId, uid) {
  const billingRef = database.collection(STORE_BILLING_COLLECTION).doc(storeId);
  const snapshot = await billingRef.get();
  const existing = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);

  if (typeof existing.customerId === "string" && existing.customerId.startsWith("cus_")) {
    return { ok: true, customerId: existing.customerId };
  }

  const created = await callStripe(
    config,
    deps,
    "POST",
    "/customers",
    {
      "metadata[storeId]": storeId,
      "metadata[machinauMode]": config.mode,
      "description": "Machinau store " + storeId
    },
    "machinau-customer-" + config.mode + "-" + storeId
  );

  if (!created.ok || typeof created.data.id !== "string" || !created.data.id.startsWith("cus_")) {
    return { ok: false, stripeError: created };
  }

  const customerId = await database.runTransaction(async function(transaction) {
    const current = await transaction.get(billingRef);
    const section = readModeSection(current.exists ? current.data() : null, config.mode);

    if (typeof section.customerId === "string" && section.customerId.startsWith("cus_")) {
      return section.customerId;
    }

    transaction.set(
      billingRef,
      {
        storeId: storeId,
        [config.mode]: {
          ...section,
          customerId: created.data.id,
          customerCreatedAt: FieldValue.serverTimestamp(),
          customerCreatedByUid: uid
        }
      },
      { merge: true }
    );

    return created.data.id;
  });

  return { ok: true, customerId: customerId };
}

// Stripeが計算した利用可能な決済手段がカードだけかを確かめる(カード以外は画面に出さない)。
function isCardOnlyPaymentMethodTypes(types) {
  return Array.isArray(types) && types.length === 1 && types[0] === "card";
}

// ---------------------------------------------------------------------------
// STEP 31-B②｜取り外し待ちの旧カードを、1件ずつ安全にStripeから取り外す
// ---------------------------------------------------------------------------
// 流れ(Stripe APIはトランザクションの外でだけ呼ぶ):
//   ① 確保(トランザクション)：pending(再試行時刻を過ぎたもの)か、確保期限切れのdetachingを1件選び、
//      現在のカードと違うことを確かめて state=detaching・leaseId・leaseUntilMs を書く。
//   ② 照会：GET /v1/payment_methods/{id}。IDとtype=cardを確認し、customerが空なら取り外し済み、
//      保存済みの顧客と違えば触らずに保留(blocked)、一致したときだけ③へ。
//   ③ 取り外し：POST /v1/payment_methods/{id}/detach(冪等キー付き)。確保期限が近ければ送らない。
//   ④ 反映(トランザクション)：leaseIdが一致する項目だけを更新する。成功→一覧から除く、
//      失敗→pendingに戻して再試行時刻とエラー(status・type・codeだけ)を残す。
// 安全の前提：取り外し待ちのカードは現在のカードとして保存されない(確定時に拒否)ため、
// ②〜③の間にカード変更が起きても、取り外す対象が現在のカードになることはない。
// 請求が始まった後(課金開始フラグがtrue)、または請求ロック(billingLock)がある間は、取り外さずに保留する。
const DETACH_LEASE_MS =
  60 * 1000;

// 確保期限の残りがこれより短ければ、取り外しを送らない(期限切れ後の別処理と重ならないように)。
const DETACH_LEASE_SAFETY_MS =
  20 * 1000;

const DETACH_STRIPE_TIMEOUT_MS =
  5000;

const DETACH_MAX_ATTEMPTS =
  5;

const DETACH_RETRY_BASE_MS =
  60 * 1000;

// 権限不足(401・403)は回数切れにせず、間隔をあけて再試行する(権限を直せば回復する)。
const DETACH_AUTH_RETRY_MS =
  60 * 60 * 1000;

function currentTimeMs(deps) {
  return deps && typeof deps.now === "function" ? deps.now() : Date.now();
}

function isDetachAllowedNow(section) {
  // 月次請求は未実装。請求が始まった後は、未完了の請求との関係を確かめる処理が入るまで取り外さない。
  return IMADAKE_CV_BILLING_STARTED === false && !section.billingLock;
}

function isClaimableDetachEntry(entry, nowMs) {
  if (entry.state === "pending") {
    return !(Number(entry.nextRetryAtMs) > nowMs);
  }

  if (entry.state === "detaching") {
    return !(Number(entry.leaseUntilMs) > nowMs);
  }

  return false;
}

function summarizeStripeError(failure) {
  const source = failure || {};

  return {
    status: Number.isInteger(source.status) ? source.status : 0,
    type: typeof source.type === "string" ? source.type.slice(0, 60) : "",
    code: typeof source.code === "string" ? source.code.slice(0, 60) : ""
  };
}

async function claimDetachEntry(database, billingRef, config, nowMs) {
  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(billingRef);
    const section = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);

    if (!isDetachAllowedNow(section) || typeof section.customerId !== "string" || section.customerId === "") {
      return null;
    }

    const list = readDetachPending(section);
    const currentPaymentMethodId = typeof section.paymentMethodId === "string" ? section.paymentMethodId : "";
    const index = list.findIndex(function(entry) {
      return (
        STRIPE_PAYMENT_METHOD_ID_PATTERN.test(entry.paymentMethodId) &&
        entry.paymentMethodId !== currentPaymentMethodId &&
        isClaimableDetachEntry(entry, nowMs)
      );
    });

    if (index < 0) {
      return null;
    }

    const leaseId = randomUUID();
    const leaseUntilMs = nowMs + DETACH_LEASE_MS;
    const nextList = list.slice();

    nextList[index] = {
      ...list[index],
      state: "detaching",
      leaseId: leaseId,
      leaseUntilMs: leaseUntilMs,
      attempts: (Number.isInteger(list[index].attempts) ? list[index].attempts : 0) + 1,
      lastAttemptAtMs: nowMs
    };

    transaction.set(
      billingRef,
      { [config.mode]: { ...section, detachPendingPaymentMethods: nextList } },
      { merge: true }
    );

    return {
      paymentMethodId: list[index].paymentMethodId,
      customerId: section.customerId,
      leaseId: leaseId,
      leaseUntilMs: leaseUntilMs,
      attempts: nextList[index].attempts
    };
  });
}

// result: { kind: "done", outcome } | { kind: "blocked", reason } | { kind: "retry", error }
async function finishDetachEntry(database, billingRef, config, claim, result, nowMs) {
  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(billingRef);
    const section = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);
    const list = readDetachPending(section);
    const index = list.findIndex(function(entry) {
      return entry.paymentMethodId === claim.paymentMethodId && entry.leaseId === claim.leaseId;
    });

    // 確保が期限切れで別の処理に引き継がれていたら、何も書かない(記録は引き継いだ側が扱う)。
    if (index < 0) {
      return false;
    }

    const nextList = list.slice();
    const extra = {};

    if (result.kind === "done") {
      nextList.splice(index, 1);
      extra.lastDetachResult = {
        paymentMethodId: claim.paymentMethodId,
        outcome: result.outcome,
        atMs: nowMs
      };
    } else if (result.kind === "blocked") {
      nextList[index] = {
        ...list[index],
        state: "blocked",
        blockedReason: result.reason,
        leaseId: "",
        leaseUntilMs: 0
      };
    } else {
      const error = result.error || {};
      const isAuthError = error.status === 401 || error.status === 403;
      const attempts = Number.isInteger(list[index].attempts) ? list[index].attempts : 0;
      const exhausted = !isAuthError && attempts >= DETACH_MAX_ATTEMPTS;

      nextList[index] = {
        ...list[index],
        state: exhausted ? "failed" : "pending",
        leaseId: "",
        leaseUntilMs: 0,
        lastError: error,
        nextRetryAtMs:
          nowMs + (isAuthError ? DETACH_AUTH_RETRY_MS : DETACH_RETRY_BASE_MS * Math.pow(2, Math.max(0, attempts - 1)))
      };
    }

    transaction.set(
      billingRef,
      { [config.mode]: { ...section, ...extra, detachPendingPaymentMethods: nextList } },
      { merge: true }
    );

    return true;
  });
}

// 取り外し待ちを最大maxEntries件まで処理する。失敗しても例外を投げない(呼び出し元の操作を失敗させない)。
async function processDetachPending(database, config, deps, storeId, maxEntries) {
  const billingRef = database.collection(STORE_BILLING_COLLECTION).doc(storeId);
  let processed = 0;

  for (let count = 0; count < maxEntries; count++) {
    let claim = null;

    try {
      claim = await claimDetachEntry(database, billingRef, config, currentTimeMs(deps));
    } catch (error) {
      console.error("店舗カード登録：取り外し対象の確保エラー：", error && error.message);
      return processed;
    }

    if (!claim) {
      return processed;
    }

    let result;
    const fetched = await callStripe(
      config,
      deps,
      "GET",
      "/payment_methods/" + claim.paymentMethodId,
      {},
      null,
      DETACH_STRIPE_TIMEOUT_MS
    );

    if (!fetched.ok) {
      result =
        fetched.status === 404
          ? { kind: "blocked", reason: "payment_method_not_found" }
          : { kind: "retry", error: summarizeStripeError(fetched) };
    } else {
      const paymentMethod = fetched.data || {};
      const owner =
        typeof paymentMethod.customer === "string"
          ? paymentMethod.customer
          : paymentMethod.customer && typeof paymentMethod.customer.id === "string"
            ? paymentMethod.customer.id
            : "";

      if (paymentMethod.id !== claim.paymentMethodId || paymentMethod.type !== "card") {
        result = { kind: "blocked", reason: "payment_method_unexpected" };
      } else if (owner === "") {
        result = { kind: "done", outcome: "already_detached" };
      } else if (owner !== claim.customerId) {
        result = { kind: "blocked", reason: "customer_mismatch" };
      } else if (currentTimeMs(deps) > claim.leaseUntilMs - DETACH_LEASE_SAFETY_MS) {
        result = { kind: "retry", error: { status: 0, type: "lease_too_short", code: "" } };
      } else {
        const detached = await callStripe(
          config,
          deps,
          "POST",
          "/payment_methods/" + claim.paymentMethodId + "/detach",
          {},
          // Stripeは同じ冪等キーの再送に最初の応答(500も含む)を返すため、確保のたびに番号を変える。
          // 同じ確保の中の重複送信だけが同じキーになる(二重の取り外しは照会と確保期限で防ぐ)。
          "machinau-detach-" + config.mode + "-" + claim.paymentMethodId + "-" + claim.attempts,
          DETACH_STRIPE_TIMEOUT_MS
        );

        result = detached.ok
          ? { kind: "done", outcome: "detached" }
          : { kind: "retry", error: summarizeStripeError(detached) };
      }
    }

    try {
      await finishDetachEntry(database, billingRef, config, claim, result, currentTimeMs(deps));
    } catch (error) {
      // 反映に失敗しても、項目はdetachingのまま残る。確保期限が切れた後の再処理で、
      // 照会(取り外し済みならcustomerが空)から正しく完了させる。
      console.error("店舗カード登録：取り外し結果の保存エラー：", error && error.message);
      return processed;
    }

    processed++;
  }

  return processed;
}

async function processDetachPendingSafely(database, config, deps, storeId, maxEntries) {
  try {
    return await processDetachPending(database, config, deps, storeId, maxEntries);
  } catch (error) {
    console.error("店舗カード登録：取り外し処理エラー：", error && error.message);
    return 0;
  }
}

function respondStripeFailure(response, failure) {
  const stripeError = failure || {};

  if (stripeError.type === "network_error" || stripeError.status === 0 || stripeError.status >= 500) {
    return sendError(response, 503, "stripe_unavailable");
  }

  if (stripeError.status === 401 || stripeError.status === 403) {
    return sendError(response, 503, "stripe_auth_failed");
  }

  return sendError(response, 502, "stripe_request_failed");
}

// mode: storeBillingSetupIntentCreate (POST)
// { storeId } → { success, clientSecret, publishableKey, setupIntentId }
// 将来の請求(off_session)のためのカード登録を始める。請求はしない。
export async function handleStoreBillingSetupIntentCreate(request, response, deps) {
  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const storeId = readStoreId(deps.readRequestBody(request));
    const actor = await requireStoreBillingOwner(request, response, deps, database, storeId);

    if (!actor) {
      return;
    }

    const config = readStripeBillingConfig(deps.env);

    if (!config.ok) {
      return sendError(response, 503, "billing_unavailable", { unavailableReason: config.reason });
    }

    // 取り外し待ちが上限に達している間は、Stripeに何も作らずに止める(旧カードの記録を捨てない)。
    // 上限に達していたら、先に取り外しを最大2件試してから数え直す(回復の機会)。
    const queueRef = database.collection(STORE_BILLING_COLLECTION).doc(storeId);
    const queueSnapshot = await queueRef.get();
    const queueSection = readModeSection(queueSnapshot.exists ? queueSnapshot.data() : null, config.mode);

    if (readDetachPending(queueSection).length >= DETACH_PENDING_LIMIT) {
      await processDetachPendingSafely(database, config, deps, storeId, 2);

      const recheckSnapshot = await queueRef.get();
      const recheckSection = readModeSection(recheckSnapshot.exists ? recheckSnapshot.data() : null, config.mode);

      if (readDetachPending(recheckSection).length >= DETACH_PENDING_LIMIT) {
        return sendError(response, 409, "detach_pending_limit");
      }
    }

    const allowed = await deps.claimRateLimit(
      database,
      STORE_BILLING_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeBillingSetup", storeId),
      STORE_BILLING_SETUP_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const customer = await ensureStripeCustomer(database, config, deps, storeId, actor.uid);

    if (!customer.ok) {
      return respondStripeFailure(response, customer.stripeError);
    }

    const setupIntent = await callStripe(
      config,
      deps,
      "POST",
      "/setup_intents",
      {
        "customer": customer.customerId,
        "usage": "off_session",
        // 現行APIでは payment_method_types を送ると400になるため、許可リストでカードだけに絞る。
        "allowed_payment_method_types[]": "card",
        "metadata[storeId]": storeId,
        "metadata[machinauMode]": config.mode
      },
      null
    );

    if (
      !setupIntent.ok ||
      typeof setupIntent.data.id !== "string" ||
      !STRIPE_SETUP_INTENT_ID_PATTERN.test(setupIntent.data.id) ||
      typeof setupIntent.data.client_secret !== "string" ||
      !isCardOnlyPaymentMethodTypes(setupIntent.data.payment_method_types)
    ) {
      return respondStripeFailure(response, setupIntent);
    }

    // 入れ子の項目は、既存の値＋変更をまとめて書く(合流の仕方に依存しない)。
    // 同時に確定したカードを古い読み取り結果で戻さないよう、読み取りと保存はトランザクションで行う。
    const billingRef = database.collection(STORE_BILLING_COLLECTION).doc(storeId);

    await database.runTransaction(async function(transaction) {
      const latest = await transaction.get(billingRef);
      const latestSection = readModeSection(latest.exists ? latest.data() : null, config.mode);

      transaction.set(
        billingRef,
        {
          storeId: storeId,
          [config.mode]: {
            ...latestSection,
            pendingSetupIntentId: setupIntent.data.id,
            pendingSetupStartedAt: FieldValue.serverTimestamp(),
            pendingSetupStartedByUid: actor.uid
          }
        },
        { merge: true }
      );
    });

    return response.status(200).json({
      success: true,
      mode: config.mode,
      clientSecret: setupIntent.data.client_secret,
      publishableKey: config.publishableKey,
      setupIntentId: setupIntent.data.id,
      consentVersion: STORE_BILLING_CONSENT_VERSION
    });
  } catch (error) {
    console.error("店舗カード登録：SetupIntent作成エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeBillingSetupConfirm (POST)
// { storeId, setupIntentId, consentVersion } → { success, status, card }
// 画面の結果は信用せず、サーバーがStripeにSetupIntentを照会して確かめてから保存する。
export async function handleStoreBillingSetupConfirm(request, response, deps) {
  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const body = deps.readRequestBody(request) || {};
    const storeId = readStoreId(body);
    const actor = await requireStoreBillingOwner(request, response, deps, database, storeId);

    if (!actor) {
      return;
    }

    const config = readStripeBillingConfig(deps.env);

    if (!config.ok) {
      return sendError(response, 503, "billing_unavailable", { unavailableReason: config.reason });
    }

    const setupIntentId = typeof body.setupIntentId === "string" ? body.setupIntentId.trim() : "";

    if (!STRIPE_SETUP_INTENT_ID_PATTERN.test(setupIntentId)) {
      return sendError(response, 400, "invalid_input", { field: "setupIntentId" });
    }

    if (body.consentVersion !== STORE_BILLING_CONSENT_VERSION) {
      return sendError(response, 400, "consent_required");
    }

    const billingRef = database.collection(STORE_BILLING_COLLECTION).doc(storeId);
    const snapshot = await billingRef.get();
    const section = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);

    // この事業者で、このサーバーが作ったSetupIntentだけを受け付ける(他の事業者のIDを使わせない)。
    if (
      typeof section.customerId !== "string" ||
      section.customerId === "" ||
      section.pendingSetupIntentId !== setupIntentId
    ) {
      return sendError(response, 409, "setup_intent_mismatch");
    }

    const fetched = await callStripe(
      config,
      deps,
      "GET",
      "/setup_intents/" + setupIntentId,
      { "expand[]": "payment_method" },
      null
    );

    if (!fetched.ok) {
      return respondStripeFailure(response, fetched);
    }

    const setupIntent = fetched.data;
    const metadata = setupIntent.metadata && typeof setupIntent.metadata === "object" ? setupIntent.metadata : {};

    if (setupIntent.customer !== section.customerId || metadata.storeId !== storeId) {
      return sendError(response, 409, "setup_intent_mismatch");
    }

    if (setupIntent.status === "requires_action") {
      return response.status(200).json({ success: true, status: "requires_action", card: null });
    }

    if (setupIntent.status === "processing") {
      return response.status(200).json({ success: true, status: "processing", card: null });
    }

    if (setupIntent.status !== "succeeded") {
      return response.status(200).json({ success: true, status: "failed", card: null });
    }

    const paymentMethod =
      setupIntent.payment_method && typeof setupIntent.payment_method === "object"
        ? setupIntent.payment_method
        : null;
    const card = paymentMethod && paymentMethod.card && typeof paymentMethod.card === "object" ? paymentMethod.card : null;

    if (
      !paymentMethod ||
      typeof paymentMethod.id !== "string" ||
      !STRIPE_PAYMENT_METHOD_ID_PATTERN.test(paymentMethod.id) ||
      !card
    ) {
      return sendError(response, 502, "stripe_request_failed");
    }

    // 新しいカードが、保存済みのStripe顧客に付いていることを確かめる。別の顧客のカード・
    // 取り外し済み(customerが空)のカードは、現在のカードとして保存しない。
    const paymentMethodCustomer =
      typeof paymentMethod.customer === "string"
        ? paymentMethod.customer
        : paymentMethod.customer && typeof paymentMethod.customer.id === "string"
          ? paymentMethod.customer.id
          : "";

    if (paymentMethodCustomer === "" || paymentMethodCustomer !== section.customerId) {
      return sendError(response, 409, "payment_method_mismatch");
    }

    const cardSummary = {
      brand: typeof card.brand === "string" ? card.brand.slice(0, 20) : "",
      last4: typeof card.last4 === "string" && /^[0-9]{4}$/.test(card.last4) ? card.last4 : "",
      expMonth: Number.isInteger(card.exp_month) ? card.exp_month : 0,
      expYear: Number.isInteger(card.exp_year) ? card.exp_year : 0
    };

    // Stripeへの照会は上で済ませ、ここではFirestoreだけを扱う。登録中のSetupIntentの一致確認と
    // 新しいカードの保存を同じトランザクションで行い、別タブ・同時操作の古いSetupIntentが
    // 新しい登録状態を上書きしないようにする(一致しなければ保存せず、登録済みカードはそのまま)。
    // cardVersionは保存が成立するたびに1つ増える(既存データは未設定=0として扱う)。
    // 置き換え前のカードは、同じトランザクションで「取り外し待ち」に記録する(初回登録・同じカード・
    // 記録済みのカードは記録しない。上限を超えても捨てない)。取り外し待ちのカードは現在のカードにしない。
    const outcome = await database.runTransaction(async function(transaction) {
      const current = await transaction.get(billingRef);
      const currentSection = readModeSection(current.exists ? current.data() : null, config.mode);

      if (
        currentSection.customerId !== section.customerId ||
        currentSection.pendingSetupIntentId !== setupIntentId
      ) {
        return "setup_intent_mismatch";
      }

      const detachPending = readDetachPending(currentSection);

      if (isDetachPending(detachPending, paymentMethod.id)) {
        return "payment_method_mismatch";
      }

      const previousCardVersion = Number.isInteger(currentSection.cardVersion) ? currentSection.cardVersion : 0;
      const previousPaymentMethodId =
        typeof currentSection.paymentMethodId === "string" ? currentSection.paymentMethodId : "";
      const nextDetachPending = detachPending.slice();

      if (
        STRIPE_PAYMENT_METHOD_ID_PATTERN.test(previousPaymentMethodId) &&
        previousPaymentMethodId !== paymentMethod.id &&
        !isDetachPending(detachPending, previousPaymentMethodId)
      ) {
        nextDetachPending.push({
          paymentMethodId: previousPaymentMethodId,
          state: "pending",
          queuedAtMs: Date.now(),
          queuedCardVersion: previousCardVersion + 1,
          attempts: 0
        });
      }

      transaction.set(
        billingRef,
        {
          storeId: storeId,
          [config.mode]: {
            ...currentSection,
            paymentMethodId: paymentMethod.id,
            card: cardSummary,
            cardVersion: previousCardVersion + 1,
            detachPendingPaymentMethods: nextDetachPending,
            setupStatus: "succeeded",
            lastSetupIntentId: setupIntentId,
            pendingSetupIntentId: "",
            consentVersion: STORE_BILLING_CONSENT_VERSION,
            consentAt: FieldValue.serverTimestamp(),
            consentByUid: actor.uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedByUid: actor.uid
          }
        },
        { merge: true }
      );

      return "committed";
    });

    if (outcome !== "committed") {
      return sendError(response, 409, outcome);
    }

    // 新しいカードの保存が成立した後だけ、旧カードの取り外しを1件試す(失敗しても登録成功のまま)。
    await processDetachPendingSafely(database, config, deps, storeId, 1);

    return response.status(200).json({ success: true, status: "succeeded", card: cardSummary });
  } catch (error) {
    console.error("店舗カード登録：登録確認エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
