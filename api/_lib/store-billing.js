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
//     test: { customerId, paymentMethodId, card: { brand, last4, expMonth, expYear },
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
  requireVerifiedStoreUser
} from "./store-self-service.js";

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
async function callStripe(config, deps, method, path, params, idempotencyKey) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(function() {
    abortController.abort();
  }, STRIPE_REQUEST_TIMEOUT_MS);

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
    const billingRef = database.collection(STORE_BILLING_COLLECTION).doc(storeId);
    const latest = await billingRef.get();
    const latestSection = readModeSection(latest.exists ? latest.data() : null, config.mode);

    await billingRef.set(
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
      !paymentMethod.id.startsWith("pm_") ||
      !card
    ) {
      return sendError(response, 502, "stripe_request_failed");
    }

    const cardSummary = {
      brand: typeof card.brand === "string" ? card.brand.slice(0, 20) : "",
      last4: typeof card.last4 === "string" && /^[0-9]{4}$/.test(card.last4) ? card.last4 : "",
      expMonth: Number.isInteger(card.exp_month) ? card.exp_month : 0,
      expYear: Number.isInteger(card.exp_year) ? card.exp_year : 0
    };

    await billingRef.set(
      {
        storeId: storeId,
        [config.mode]: {
          ...section,
          paymentMethodId: paymentMethod.id,
          card: cardSummary,
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

    return response.status(200).json({ success: true, status: "succeeded", card: cardSummary });
  } catch (error) {
    console.error("店舗カード登録：登録確認エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
