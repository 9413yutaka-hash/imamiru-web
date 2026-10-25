// ==========================================================================
// 今だけ投稿 決済 STEP 31｜店舗のカード登録(Stripe SetupIntent、サーバー側のみ)
// ==========================================================================
// 将来の月次請求に備えて、店舗アカウント(Firebase Authのuid)ごとにStripeの顧客を1つ作り、カードを登録する。
// STEP 42-C(代表決定)：カードは1アカウント1枚を共用する。同じアカウントが管理する複数の店舗は同じカードを使い、
// 請求は各カードの登録先(登録したアカウント)へ行う。店舗ごとに別の顧客・カード登録は求めない。
// このファイルは請求をしない(お金は動かない)。月次の締め・請求・返金は別の工程。
//
// 安全装置(どれか1つでも満たさなければ、カード登録の機能そのものを止める)
// STEP 43-B(代表決定 2026-10-22)：カード登録用と請求用で Stripe の設定の読み取りを分ける。
//   カード登録(readStripeCardSetupConfig)：
//     ・Production(VERCEL_ENV=production)では次の4条件がすべてそろった時だけ本番モード(live)：
//       ①コードのスイッチ STORE_CARD_REGISTRATION_LIVE_ENABLED が true(既定 false)
//         STEP 43-N C案(代表決定 2026-10-25)：スイッチが false の間も、代表のアカウント(先行テスト)だけは①を満たす扱い
//         (isStoreCardLiveTrialToken。カード登録の3つの操作だけ。②〜④は同じ)
//       ②環境変数 STRIPE_MODE が "live"
//       ③サーバーのキー(STRIPE_RESTRICTED_KEY)が制限付きの本番キー rk_live_(権限の広い sk_live_ は拒否)
//       ④公開可能キー(STRIPE_PUBLISHABLE_KEY)が pk_live_
//     ・Production以外はテストモードだけ(STRIPE_MODE "test"、rk_test_／sk_test_、pk_test_)
//     ・呼べる Stripe の操作は、顧客の作成・SetupIntent の作成と照会・PaymentMethod の照会と取り外しだけ
//       (CARD_SETUP_STRIPE_OPERATIONS。支払い(PaymentIntent)は呼べない)
//   請求(readStripeChargeConfig、今だけ投稿の月次請求・請求の確認画面)：
//     ・Productionでは常に無効(本番の課金開始の承認まで)。テストモードだけ
//     ・STEP 43-M(代表承認 2026-10-23)：請求は専用の環境変数 STRIPE_CHARGE_RESTRICTED_KEY のキーだけを使う。
//       未設定なら請求は止まる(charge_key_not_configured)。カード登録用の STRIPE_RESTRICTED_KEY へは切り替えない。
//   ・キーが未設定なら止める
// キーの値はログ・応答・Firestoreに一切出さない。Stripeの応答本文もログに出さない。
//
// 保存先(サーバーのAdmin SDKだけが読み書きする。ブラウザからは読み書き不可にする)
//   accountBilling/{uid}   (STEP 42-C。以前の storeBilling/{storeId} は使わない)
//     test: { customerId, paymentMethodId, card: { brand, last4, expMonth, expYear }, cardVersion,
//             detachPendingPaymentMethods: [ 置き換え前のカード(取り外し待ち) ], lastDetachResult,
//             pendingSetupIntentId, consentVersion, consentAt, updatedAt, updatedByUid }
//     live: (本番用。test と同じ形。本番のカード登録が4条件で有効な時だけ作られる)
//   PreviewとProductionは同じFirestoreなので、テスト用と本番用は必ず別の項目に分ける。
//   カード番号・セキュリティコードは受け取らない・保存しない(Stripeが直接受け取る)。
//
// 操作できるのは、メール確認済み・パスワードでログインした店舗アカウント本人だけ(自分のアカウントの
// カードだけ。既存のrequireVerifiedStoreUser)。店舗を持つ前でも登録できる(登録・引き継ぎの前にカードを登録するため)。
// 店舗の請求先：店舗の有効なowner(storeMembers の role "owner"・status "active")のアカウント。現行の構造では
// 店舗のメンバーは作成時の owner 1人だけ(追加する処理は無い)。0人・2人以上なら請求先を決めない(請求しない)。
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

// STEP 38-B｜請求履歴(読み取り専用)で使う既存の定数。どれも store-billing.js を読み込まない(循環なし)。
// 公開条件(課金開始フラグ・Preview試験の判定)はこのファイルでは参照せず、呼び出し元から deps で受け取る
// (カードの取り外しなど既存の処理が課金開始フラグに依存しないことを保つ)。
import {
  IMADAKE_POSTS_COLLECTION
} from "./imadake.js";

import {
  IMADAKE_POST_DAILY_CHARGES_COLLECTION,
  IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
  computeImadakeCvDayKey
} from "./imadake-cv.js";


// STEP 42-C｜アカウント単位の支払い情報(1アカウント1枚のカード)。
export const ACCOUNT_BILLING_COLLECTION =
  "accountBilling";

const STORE_MEMBERS_COLLECTION =
  "storeMembers";

const ACCOUNT_UID_PATTERN =
  /^[A-Za-z0-9_-]{1,128}$/;

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

// STEP 43-B｜本番のカード登録のスイッチ(4条件の①)。代表の承認まで false。
// true にしても、今だけ投稿の請求(readStripeChargeConfig)は有効にならない。
export const STORE_CARD_REGISTRATION_LIVE_ENABLED =
  false;

// STEP 43-N C案(代表決定 2026-10-25)｜本番のカード登録の先行テスト。一般公開(上のスイッチを true)の前に、
// 代表のアカウントだけが本番モードのカード登録・変更(状態・開始・確定の3つ)を使える。②〜④(STRIPE_MODE live・
// rk_live_・pk_live_)は同じ。店舗の新規登録・引き継ぎ・今だけ投稿のカード確認(checkAccountBillingCard 等)には使わない
// (一般公開まで、代表を含めて本番では使えない)。一般公開の後、または先行テストをやめる時は false にする。
export const STORE_CARD_LIVE_ADMIN_TRIAL_ENABLED =
  true;

// STEP 43-N C案｜先行テストのアカウント(代表)か。サーバーで検証した ID トークンだけで判定する。
// 代表の特定は管理画面と同じ環境変数 ADMIN_EMAIL(コードにメールアドレス・uid を書かない)。条件：
// ADMIN_EMAIL が設定済み・トークンのメールが一致(大文字小文字は区別しない)・メール確認済み・パスワードでのログイン。
// 結果は真偽値だけを使い、メールアドレスは応答・ログ・Firestore に出さない。
export function isStoreCardLiveTrialToken(decodedToken, env) {
  const source = env || {};
  const adminEmail = typeof source.ADMIN_EMAIL === "string" ? source.ADMIN_EMAIL.trim().toLowerCase() : "";

  if (adminEmail === "" || !decodedToken || typeof decodedToken !== "object") {
    return false;
  }

  const email = typeof decodedToken.email === "string" ? decodedToken.email.trim().toLowerCase() : "";
  const provider = decodedToken.firebase && typeof decodedToken.firebase.sign_in_provider === "string"
    ? decodedToken.firebase.sign_in_provider
    : "";

  return email !== "" && email === adminEmail && decodedToken.email_verified === true && provider === "password";
}

// STEP 43-N C案｜店舗の新規登録・引き継ぎを一般に開いているか(旅行者向けの入口の表示に使う)。
// Production ではスイッチが true の時だけ。Production 以外は従来どおり(テストモード)。可否の判定はサーバーの各処理が行う。
export function isStoreOnboardingOpen(env) {
  const source = env || {};
  return source.VERCEL_ENV !== "production" || STORE_CARD_REGISTRATION_LIVE_ENABLED === true;
}

// カード登録の3つの操作に渡す設定の引数。先行テストの可否はサーバーで検証したログイン(actor)だけから決める。
function cardSetupOptionsFor(deps, actor) {
  return Object.assign({}, deps.cardSetupConfigOptions || {}, {
    liveTrialAccount: Boolean(actor) && actor.cardLiveTrial === true
  });
}

// STEP 43-B｜カード登録で呼んでよい Stripe の操作(方法とパス)。これ以外(支払いの作成など)は送らない。
// 本番の制限付きキーに必要な権限：Customers(書き込み)・SetupIntents(書き込み)・PaymentMethods(書き込み：照会と取り外し)。
export const CARD_SETUP_STRIPE_OPERATIONS = Object.freeze([
  { method: "POST", path: /^\/customers$/ },
  { method: "POST", path: /^\/setup_intents$/ },
  { method: "GET", path: /^\/setup_intents\/seti_[A-Za-z0-9]{1,100}$/ },
  { method: "GET", path: /^\/payment_methods\/pm_[A-Za-z0-9_]{1,100}$/ },
  { method: "POST", path: /^\/payment_methods\/pm_[A-Za-z0-9_]{1,100}\/detach$/ }
]);

export function isCardSetupStripeOperation(method, path) {
  return CARD_SETUP_STRIPE_OPERATIONS.some(function(operation) {
    return operation.method === method && operation.path.test(String(path || ""));
  });
}

// STEP 43-M｜カード登録用と請求用のサーバーキーの環境変数(別々。互いに切り替えない)。
export const CARD_SETUP_KEY_ENV_NAME = "STRIPE_RESTRICTED_KEY";
export const CHARGE_KEY_ENV_NAME = "STRIPE_CHARGE_RESTRICTED_KEY";

function readStripeEnvValues(source, keyEnvName) {
  const name = keyEnvName || CARD_SETUP_KEY_ENV_NAME;

  return {
    mode: typeof source.STRIPE_MODE === "string" ? source.STRIPE_MODE.trim() : "",
    serverKey: typeof source[name] === "string" ? source[name].trim() : "",
    publishableKey: typeof source.STRIPE_PUBLISHABLE_KEY === "string" ? source.STRIPE_PUBLISHABLE_KEY.trim() : ""
  };
}

// テストモードだけの確認(Production以外のカード登録・請求の両方で使う)。
function readStripeTestOnlyConfig(values, purpose) {
  if (values.mode === "" || values.serverKey === "" || values.publishableKey === "") {
    return { ok: false, reason: "not_configured" };
  }

  if (!ALLOWED_STRIPE_MODES.includes(values.mode)) {
    return { ok: false, reason: "mode_not_allowed" };
  }

  const serverKeyIsTest = values.serverKey.startsWith("rk_test_") || values.serverKey.startsWith("sk_test_");
  const publishableKeyIsTest = values.publishableKey.startsWith("pk_test_");

  if (!serverKeyIsTest || !publishableKeyIsTest) {
    return { ok: false, reason: "key_mode_mismatch" };
  }

  return {
    ok: true,
    purpose: purpose,
    mode: values.mode,
    serverKey: values.serverKey,
    publishableKey: values.publishableKey
  };
}

// STEP 43-B｜カード登録用の設定。Production では4条件(上の説明)がすべてそろった時だけ live。
// options.liveEnabled は試験でスイッチの値を差し替えるためだけの引数(省略時はコードのスイッチ)。
// STEP 43-N C案｜options.liveTrialAccount(サーバーで検証した先行テストのアカウントの時だけ true。cardSetupOptionsFor)と
// 先行テストのスイッチ(options.liveTrialEnabled は試験用、省略時は STORE_CARD_LIVE_ADMIN_TRIAL_ENABLED)がそろえば①を満たす。
// 本番のサーバーの部品(buildStoreBillingDeps)は cardSetupConfigOptions を渡さない(リクエストからは指定できない)。
// キーの値は返り値の serverKey/publishableKey だけに入れ、呼び出し元はログに出さない。
export function readStripeCardSetupConfig(env, options) {
  const source = env || {};
  const values = readStripeEnvValues(source, CARD_SETUP_KEY_ENV_NAME);

  if (source.VERCEL_ENV !== "production") {
    return readStripeTestOnlyConfig(values, "card_setup");
  }

  const liveEnabled =
    options && typeof options.liveEnabled === "boolean"
      ? options.liveEnabled
      : STORE_CARD_REGISTRATION_LIVE_ENABLED;

  const liveTrialEnabled =
    options && typeof options.liveTrialEnabled === "boolean"
      ? options.liveTrialEnabled
      : STORE_CARD_LIVE_ADMIN_TRIAL_ENABLED;
  const liveTrialAccount = liveTrialEnabled === true && Boolean(options) && options.liveTrialAccount === true;

  if (liveEnabled !== true && !liveTrialAccount) {
    return { ok: false, reason: "live_registration_disabled" };
  }

  if (values.mode === "" || values.serverKey === "" || values.publishableKey === "") {
    return { ok: false, reason: "not_configured" };
  }

  if (values.mode !== "live") {
    return { ok: false, reason: "mode_not_allowed" };
  }

  if (!values.serverKey.startsWith("rk_live_")) {
    return { ok: false, reason: "server_key_not_restricted_live" };
  }

  if (!values.publishableKey.startsWith("pk_live_")) {
    return { ok: false, reason: "key_mode_mismatch" };
  }

  return {
    ok: true,
    purpose: "card_setup",
    mode: "live",
    serverKey: values.serverKey,
    publishableKey: values.publishableKey
  };
}

// 請求用(今だけ投稿の月次請求・請求の確認画面)の設定。Productionでは常に無効、テストモードだけ。
// 本番カード登録のスイッチ・本番キーがあっても、ここは有効にならない(本番の課金開始は別の承認・別の変更)。
// STEP 43-M｜キーは請求専用の STRIPE_CHARGE_RESTRICTED_KEY だけ。未設定なら charge_key_not_configured で止まる
// (カード登録用の STRIPE_RESTRICTED_KEY があっても使わない)。
export function readStripeChargeConfig(env) {
  const source = env || {};

  if (source.VERCEL_ENV === "production") {
    return { ok: false, reason: "disabled_in_production" };
  }

  const values = readStripeEnvValues(source, CHARGE_KEY_ENV_NAME);

  if (values.serverKey === "") {
    return { ok: false, reason: "charge_key_not_configured" };
  }

  return readStripeTestOnlyConfig(values, "charge");
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
// STEP 43-B｜カード登録用の設定(purpose "card_setup")で、許可した操作(CARD_SETUP_STRIPE_OPERATIONS)だけを送る。
async function callStripe(config, deps, method, path, params, idempotencyKey, timeoutMs) {
  if (!config || config.purpose !== "card_setup" || !isCardSetupStripeOperation(method, path)) {
    return { ok: false, status: 0, type: "stripe_operation_not_allowed", code: "" };
  }

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

// STEP 42-C｜カードの操作：ログイン・メール確認済みの店舗アカウント本人(自分のアカウントのカードだけ)。
async function requireBillingAccountUser(request, response, deps) {
  const actor = await requireVerifiedStoreUser(request, response, deps);

  if (!actor) {
    return null;
  }

  if (typeof actor.uid !== "string" || !ACCOUNT_UID_PATTERN.test(actor.uid)) {
    sendError(response, 403, "store_account_required");
    return null;
  }

  return actor;
}

// STEP 42-C｜店舗の請求先アカウント：店舗の有効な owner が1人だけの時、その uid。
// transaction を渡すとトランザクションの中で読む。owner が0人・2人以上なら決めない(請求しない)。
// 戻り値 { ok: true, uid } | { ok: false, reason: "billing_account_missing" | "billing_account_ambiguous" }
export async function resolveStoreBillingAccount(database, storeId, transaction) {
  const query = database.collection(STORE_MEMBERS_COLLECTION).where("storeId", "==", storeId);
  const snapshot = transaction ? await transaction.get(query) : await query.get();
  const owners = [];

  snapshot.docs.forEach(function(doc) {
    const member = doc.data() || {};

    if (
      member.storeId === storeId &&
      member.role === "owner" &&
      member.status === "active" &&
      typeof member.uid === "string" &&
      ACCOUNT_UID_PATTERN.test(member.uid) &&
      doc.id === storeId + "_" + member.uid
    ) {
      owners.push(member.uid);
    }
  });

  if (owners.length === 1) {
    return { ok: true, uid: owners[0] };
  }

  return { ok: false, reason: owners.length === 0 ? "billing_account_missing" : "billing_account_ambiguous" };
}

// 請求中のロック(請求書ごと)。1つのアカウントで複数の店舗の請求が重なるため、請求書IDごとに持つ。
export function readBillingLocks(section) {
  const locks = section && section.billingLocks && typeof section.billingLocks === "object" ? section.billingLocks : {};

  return Object.keys(locks).filter(function(invoiceId) {
    return invoiceId !== "" && locks[invoiceId] && typeof locks[invoiceId] === "object";
  });
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
// {} → { success, available, unavailableReason, card }(STEP 42-C：ログイン中のアカウントのカード。storeId は使わない)
// available:false の時、画面はカード登録欄を出さない(本番サイト・キー未設定など)。
export async function handleStoreBillingStatus(request, response, deps) {
  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const actor = await requireBillingAccountUser(request, response, deps);

    if (!actor) {
      return;
    }

    const config = readStripeCardSetupConfig(deps.env, cardSetupOptionsFor(deps, actor));

    if (!config.ok) {
      return response.status(200).json({
        success: true,
        available: false,
        unavailableReason: config.reason,
        card: null
      });
    }

    const snapshot = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(actor.uid).get();
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

// アカウントのStripe顧客を1つだけ用意する。既にあればそれを使う。作成は冪等キーで
// 重複を防ぎ、保存はトランザクションで先に保存された値を優先する。
async function ensureStripeCustomer(database, config, deps, uid) {
  const billingRef = database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid);
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
      "metadata[accountUid]": uid,
      "metadata[machinauMode]": config.mode,
      "description": "Machinau account " + uid
    },
    "machinau-customer-" + config.mode + "-account-" + uid
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
        uid: uid,
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
// STEP 32-D①：課金開始フラグでは止めない。取り外すカードが未解決の月次請求(imadakeMonthlyInvoices)で
// 使われている・使われた可能性がある間、またはその店舗の請求書を読めない間は、取り外さずに保留する(安全側)。
// STEP 32-D③：請求ロック(billingLock)がある間も、ロックが指す請求書が実在して未解決で、使ったカードが
// 記録されていることを確かめられた場合に限り、守るカード以外を取り外す。確かめられない時は全部止める。
// 安全の根拠：月次請求は「確保した時点の現在のカード」だけを使う。取り外しの確保は「現在のカードではない」
// ことをトランザクション内で確かめ、取り外し待ちのカードは二度と現在のカードにならない。したがって、
// 取り外すカードを使う請求は、取り外しの確保より前に記録済みであり、確保の後の再確認で必ず見つかる。
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

// 請求ロックがある時は、ロックが指す請求書をすべて確かめられた場合だけ取り外しを続ける(守るカードは別に除く)。
// STEP 42-C：ロックは請求書ごと(billingLocks)。1つでも確かめられなければ止める。
function isDetachAllowedNow(section, protection) {
  const lockInvoiceIds = readBillingLocks(section);

  if (lockInvoiceIds.length === 0) {
    return true;
  }

  return Boolean(protection && protection.ok) && lockInvoiceIds.every(function(invoiceId) {
    return protection.unresolvedInvoiceIds.has(invoiceId);
  });
}

const MONTHLY_INVOICES_COLLECTION =
  "imadakeMonthlyInvoices";

// 請求書の状態のうち、カードを取り外してよいと分かっているもの(支払いを作っていない、または支払い済み)。
// これ以外(請求中・処理中・本人認証待ち・人の確認待ち・支払い失敗・知らない状態)は、使ったカードを守る。
const INVOICE_STATUSES_RELEASING_CARD =
  ["closing", "closed", "paid", "charge_error"];

// そのアカウントの顧客で請求した請求書(どの店舗の分でも)から、取り外してはいけないカードを集める。
// 読めなければ { ok:false }(取り外しを止める)。STEP 42-C：店舗単位ではなく、請求書に記録した顧客(chargeCustomerId)で探す。
// 請求の確保は、顧客・カードの記録と請求中の状態を同じトランザクションで書くため、請求中の請求書は必ず見つかる。
async function readInvoiceProtectedPaymentMethods(database, customerId) {
  if (typeof customerId !== "string" || customerId === "") {
    return { ok: true, protectedIds: new Set(), unresolvedInvoiceIds: new Set() };
  }

  try {
    const snapshot = await database
      .collection(MONTHLY_INVOICES_COLLECTION)
      .where("chargeCustomerId", "==", customerId)
      .get();

    const protectedIds = new Set();
    const unresolvedInvoiceIds = new Set();
    let unknownCard = false;

    snapshot.docs.forEach(function(doc) {
      const invoice = doc.data() || {};
      const usedId = typeof invoice.chargePaymentMethodId === "string" ? invoice.chargePaymentMethodId : "";
      const releasing = INVOICE_STATUSES_RELEASING_CARD.includes(invoice.status) && invoice.chargeOutcomeUnknown !== true;

      if (releasing) {
        return;
      }

      unresolvedInvoiceIds.add(doc.id);

      if (STRIPE_PAYMENT_METHOD_ID_PATTERN.test(usedId)) {
        protectedIds.add(usedId);
      } else {
        // 未解決なのに使ったカードが分からない：どのカードを守ればよいか判断できない。
        unknownCard = true;
      }
    });

    if (unknownCard) {
      return { ok: false, protectedIds: protectedIds, unresolvedInvoiceIds: unresolvedInvoiceIds };
    }

    return { ok: true, protectedIds: protectedIds, unresolvedInvoiceIds: unresolvedInvoiceIds };
  } catch (error) {
    console.error("店舗カード登録：請求書の確認エラー：", error && error.message);
    return { ok: false, protectedIds: new Set(), unresolvedInvoiceIds: new Set() };
  }
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

async function claimDetachEntry(database, billingRef, config, nowMs, protection) {
  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(billingRef);
    const section = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);

    if (!isDetachAllowedNow(section, protection) || typeof section.customerId !== "string" || section.customerId === "") {
      return null;
    }

    const list = readDetachPending(section);
    const currentPaymentMethodId = typeof section.paymentMethodId === "string" ? section.paymentMethodId : "";
    const index = list.findIndex(function(entry) {
      return (
        STRIPE_PAYMENT_METHOD_ID_PATTERN.test(entry.paymentMethodId) &&
        entry.paymentMethodId !== currentPaymentMethodId &&
        !protection.protectedIds.has(entry.paymentMethodId) &&
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

// Stripeで取り外す直前の確認：請求ロックがなく、現在のカードではなく、未解決の請求書が使っていないこと。
async function isStillSafeToDetach(database, billingRef, config, paymentMethodId) {
  let section;

  try {
    const snapshot = await billingRef.get();
    section = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);
  } catch (error) {
    return false;
  }

  if (section.paymentMethodId === paymentMethodId) {
    return false;
  }

  const protection = await readInvoiceProtectedPaymentMethods(database, section.customerId);

  return protection.ok && isDetachAllowedNow(section, protection) && !protection.protectedIds.has(paymentMethodId);
}

// 取り外し待ちを最大maxEntries件まで処理する。失敗しても例外を投げない(呼び出し元の操作を失敗させない)。
async function processDetachPending(database, config, deps, uid, maxEntries) {
  const billingRef = database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid);
  let processed = 0;

  for (let count = 0; count < maxEntries; count++) {
    let claim = null;

    // 未解決の月次請求で使われている(使われた可能性がある)カードは確保しない。請求書を読めなければ止める。
    let customerId = "";

    try {
      const current = await billingRef.get();
      customerId = readModeSection(current.exists ? current.data() : null, config.mode).customerId || "";
    } catch (error) {
      return processed;
    }

    const protection = await readInvoiceProtectedPaymentMethods(database, customerId);

    if (!protection.ok) {
      return processed;
    }

    try {
      claim = await claimDetachEntry(database, billingRef, config, currentTimeMs(deps), protection);
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
      } else if (!(await isStillSafeToDetach(database, billingRef, config, claim.paymentMethodId))) {
        // 確保の後に、請求ロックが付いた・未解決の請求書がこのカードを使っている・確認できない：送らない。
        result = { kind: "retry", error: { status: 0, type: "protected_by_invoice", code: "" } };
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

async function processDetachPendingSafely(database, config, deps, uid, maxEntries) {
  try {
    return await processDetachPending(database, config, deps, uid, maxEntries);
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
// {} → { success, clientSecret, publishableKey, setupIntentId }(STEP 42-C：ログイン中のアカウントのカード)
// 将来の請求(off_session)のためのカード登録を始める。請求はしない。
export async function handleStoreBillingSetupIntentCreate(request, response, deps) {
  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const actor = await requireBillingAccountUser(request, response, deps);

    if (!actor) {
      return;
    }

    const config = readStripeCardSetupConfig(deps.env, cardSetupOptionsFor(deps, actor));

    if (!config.ok) {
      return sendError(response, 503, "billing_unavailable", { unavailableReason: config.reason });
    }

    // 取り外し待ちが上限に達している間は、Stripeに何も作らずに止める(旧カードの記録を捨てない)。
    // 上限に達していたら、先に取り外しを最大2件試してから数え直す(回復の機会)。
    const uid = actor.uid;
    const queueRef = database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid);
    const queueSnapshot = await queueRef.get();
    const queueSection = readModeSection(queueSnapshot.exists ? queueSnapshot.data() : null, config.mode);

    if (readDetachPending(queueSection).length >= DETACH_PENDING_LIMIT) {
      await processDetachPendingSafely(database, config, deps, uid, 2);

      const recheckSnapshot = await queueRef.get();
      const recheckSection = readModeSection(recheckSnapshot.exists ? recheckSnapshot.data() : null, config.mode);

      if (readDetachPending(recheckSection).length >= DETACH_PENDING_LIMIT) {
        return sendError(response, 409, "detach_pending_limit");
      }
    }

    const allowed = await deps.claimRateLimit(
      database,
      STORE_BILLING_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("accountBillingSetup", uid),
      STORE_BILLING_SETUP_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const customer = await ensureStripeCustomer(database, config, deps, uid);

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
        "metadata[accountUid]": uid,
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
    const billingRef = database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid);

    await database.runTransaction(async function(transaction) {
      const latest = await transaction.get(billingRef);
      const latestSection = readModeSection(latest.exists ? latest.data() : null, config.mode);

      transaction.set(
        billingRef,
        {
          uid: uid,
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
// { setupIntentId, consentVersion } → { success, status, card }(STEP 42-C：ログイン中のアカウントのカード)
// 画面の結果は信用せず、サーバーがStripeにSetupIntentを照会して確かめてから保存する。
export async function handleStoreBillingSetupConfirm(request, response, deps) {
  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const body = deps.readRequestBody(request) || {};
    const actor = await requireBillingAccountUser(request, response, deps);

    if (!actor) {
      return;
    }

    const config = readStripeCardSetupConfig(deps.env, cardSetupOptionsFor(deps, actor));

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

    const uid = actor.uid;
    const billingRef = database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid);
    const snapshot = await billingRef.get();
    const section = readModeSection(snapshot.exists ? snapshot.data() : null, config.mode);

    // このアカウントで、このサーバーが作ったSetupIntentだけを受け付ける(他のアカウントのIDを使わせない)。
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

    if (setupIntent.customer !== section.customerId || metadata.accountUid !== uid) {
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
          uid: uid,
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
    await processDetachPendingSafely(database, config, deps, uid, 1);

    return response.status(200).json({ success: true, status: "succeeded", card: cardSummary });
  } catch (error) {
    console.error("店舗カード登録：登録確認エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// ---------------------------------------------------------------------------
// STEP 38-B｜店舗向けの請求履歴(読み取り専用)
// ---------------------------------------------------------------------------
// 見られるのは、メール確認済み・パスワードでログインした、その事業者の有効なownerだけ
// (カード登録と同じ requireStoreBillingOwner。editor・旧方式の店舗token・他店は不可)。
// 読むのはFirestoreだけ(Stripeへの問い合わせ・書き込みなし)。
//
// 公開条件：課金開始後、または Preview試験の環境(machinau-preview)だけ。判定は呼び出し元(moderate-submission.js)が
// deps.isStoreInvoiceHistoryAvailable として渡す。無い・true 以外なら公開しない(安全側)。
// 公開しない時(課金開始前のProduction・ほかのPreview)は、請求書・台帳を読まずに available:false だけを返す。
//
// 返すのは許可した項目だけ：対象年月・店舗向けの状態・確定請求額・件数・確定日時・支払日時・明細(日付と投稿の見出し)、
// 別枠の見込み(未確定)。請求書ID・投稿ID・StripeのID・冪等キー・lease・実行者のuid・エラーの原文は返さない。
//
// 見込み(未確定)の計算基準は成果レポート(imadake-cv-report.js の料金目安)と同じ：
//   有効CVが1件以上ある「投稿×日本時間の1日」につき IMADAKE_DAILY_CHARGE_AMOUNT_JPY 円。
// ただし請求されるのは課金対象の投稿(料金台帳がある投稿)だけなので、料金台帳の未請求の行から数える
// (月末締めが請求に入れる条件と同じ確認をする)。請求書がある月(締め処理中を含む)は見込みに入れない。
export const STORE_INVOICE_HISTORY_MONTHS =
  12;

// 1件の請求書で返す明細の上限(超えた分は linesTruncated で知らせる)。
const STORE_INVOICE_LINES_LIMIT =
  200;

// 請求書の状態 → 店舗向けの状態(画面の文言キーの一部)。知らない状態は「確認中」。
const STORE_INVOICE_STATUS_KEYS = {
  closing: "aggregating",
  closed: "confirmed_unbilled",
  charging: "processing",
  processing: "processing",
  paid: "paid",
  payment_failed: "payment_failed",
  requires_action: "requires_action",
  charge_error: "under_review",
  needs_review: "under_review"
};

export function isStoreInvoiceHistoryAvailable(deps) {
  return Boolean(deps) && typeof deps.isStoreInvoiceHistoryAvailable === "function" && deps.isStoreInvoiceHistoryAvailable() === true;
}

export function mapStoreInvoiceStatus(invoice) {
  const status = invoice && typeof invoice.status === "string" ? invoice.status : "";
  const key = Object.prototype.hasOwnProperty.call(STORE_INVOICE_STATUS_KEYS, status)
    ? STORE_INVOICE_STATUS_KEYS[status]
    : "under_review";

  // 支払いの結果が分からない請求は、支払い済み以外は「確認中」にする(誤って案内しない)。
  if (invoice && invoice.chargeOutcomeUnknown === true && key !== "paid") {
    return "under_review";
  }

  return key;
}

// 当月を含む直近 months か月の "YYYY-MM"(新しい順)。
export function computeStoreInvoiceHistoryMonths(nowMs, months) {
  const todayKey = computeImadakeCvDayKey(nowMs);
  const year = Number(todayKey.slice(0, 4));
  const monthIndex = Number(todayKey.slice(5, 7)) - 1;
  const keys = [];

  for (let offset = 0; offset < months; offset++) {
    keys.push(new Date(Date.UTC(year, monthIndex - offset, 1)).toISOString().slice(0, 7));
  }

  return keys;
}

function toIsoOrNull(value) {
  if (value && typeof value.toMillis === "function") {
    return new Date(value.toMillis()).toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return null;
}

async function readDocsByIdOnce(database, collectionName, ids) {
  const unique = Array.from(new Set(ids.filter(function(id) {
    return typeof id === "string" && id !== "" && !id.includes("/");
  })));
  const result = new Map();

  await Promise.all(unique.map(async function(id) {
    const snapshot = await database.collection(collectionName).doc(id).get();

    if (snapshot.exists) {
      result.set(id, snapshot.data() || {});
    }
  }));

  return result;
}

// 1店舗の請求履歴と見込みを作る(読み取りだけ)。storeId は認証済みのownerの店舗だけを渡す。
export async function buildStoreInvoiceHistory(database, storeId, nowMs) {
  const monthKeys = computeStoreInvoiceHistoryMonths(nowMs, STORE_INVOICE_HISTORY_MONTHS);
  const oldestMonth = monthKeys[monthKeys.length - 1];

  // どちらも storeId の一致だけ(単一項目のインデックスで足りる。複合インデックスは不要)。
  const [invoiceSnapshot, chargeSnapshot, storeSnapshot] = await Promise.all([
    database.collection(MONTHLY_INVOICES_COLLECTION).where("storeId", "==", storeId).get(),
    database.collection(IMADAKE_POST_DAILY_CHARGES_COLLECTION).where("storeId", "==", storeId).get(),
    database.collection("storeAccounts").doc(storeId).get()
  ]);

  const invoices = new Map();

  invoiceSnapshot.docs.forEach(function(doc) {
    const data = doc.data() || {};
    const month = typeof data.month === "string" ? data.month : "";

    // 請求書IDの形・店舗・期間を確かめる(他店・想定外の文書を混ぜない)。
    if (data.storeId !== storeId || doc.id !== storeId + "_" + month || !monthKeys.includes(month)) {
      return;
    }

    invoices.set(doc.id, { month: month, data: data });
  });

  const rows = [];

  chargeSnapshot.docs.forEach(function(doc) {
    const data = doc.data() || {};
    const jstDate = typeof data.jstDate === "string" ? data.jstDate : "";

    if (data.storeId !== storeId || !/^\d{4}-\d{2}-\d{2}$/.test(jstDate) || jstDate.slice(0, 7) < oldestMonth) {
      return;
    }

    rows.push(data);
  });

  const posts = await readDocsByIdOnce(database, IMADAKE_POSTS_COLLECTION, rows.map(function(row) {
    return row.postId;
  }));

  const headlineOf = function(row) {
    const post = posts.get(row.postId);

    return post && post.storeId === storeId && typeof post.headline === "string" ? post.headline : "";
  };

  const linesByInvoice = new Map();
  const estimateByMonth = new Map();
  const storeData = storeSnapshot.exists ? storeSnapshot.data() || {} : {};
  const testAccount = storeData.isTestAccount === true;

  rows.forEach(function(row) {
    const month = row.jstDate.slice(0, 7);

    if (row.status === "invoiced") {
      const invoiceId = typeof row.invoiceId === "string" ? row.invoiceId : "";

      if (invoiceId === storeId + "_" + month && invoices.has(invoiceId)) {
        if (!linesByInvoice.has(invoiceId)) {
          linesByInvoice.set(invoiceId, []);
        }

        linesByInvoice.get(invoiceId).push({ date: row.jstDate, headline: headlineOf(row) });
      }

      return;
    }

    // 見込み：月末締めが請求に入れる条件と同じ(未請求・金額と通貨・有効CV1件以上・課金対象の投稿・同じ店舗・テスト事業者でない)。
    const post = posts.get(row.postId);

    if (
      row.status !== "accrued" ||
      row.invoiceId ||
      row.amountJpy !== IMADAKE_DAILY_CHARGE_AMOUNT_JPY ||
      row.currency !== "JPY" ||
      !(Number(row.validCvCount) >= 1) ||
      !post ||
      post.cvBillingEnabled !== true ||
      post.storeId !== storeId ||
      testAccount ||
      invoices.has(storeId + "_" + month)
    ) {
      return;
    }

    estimateByMonth.set(month, (estimateByMonth.get(month) || 0) + 1);
  });

  const invoiceList = Array.from(invoices.entries())
    .sort(function(a, b) {
      return a[1].month < b[1].month ? 1 : a[1].month > b[1].month ? -1 : 0;
    })
    .map(function(entry) {
      const invoiceId = entry[0];
      const data = entry[1].data;
      const statusKey = mapStoreInvoiceStatus(data);
      const aggregating = statusKey === "aggregating";
      const lines = (linesByInvoice.get(invoiceId) || []).sort(function(a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : a.headline < b.headline ? -1 : a.headline > b.headline ? 1 : 0;
      });

      // 締め処理中(closing)は金額・明細が確定していないため出さない。
      return {
        month: entry[1].month,
        statusKey: statusKey,
        amountJpy: aggregating ? null : Number(data.amountJpy) || 0,
        lineCount: aggregating ? null : Number(data.lineCount) || 0,
        closedAt: aggregating ? null : toIsoOrNull(data.closedAt),
        paidAt: statusKey === "paid" ? toIsoOrNull(data.paidAt) : null,
        lines: aggregating ? [] : lines.slice(0, STORE_INVOICE_LINES_LIMIT),
        linesTruncated: !aggregating && lines.length > STORE_INVOICE_LINES_LIMIT
      };
    });

  const estimateMonths = monthKeys
    .filter(function(month) {
      return estimateByMonth.has(month);
    })
    .map(function(month) {
      const lineCount = estimateByMonth.get(month);

      return { month: month, lineCount: lineCount, amountJpy: lineCount * IMADAKE_DAILY_CHARGE_AMOUNT_JPY };
    });

  return {
    months: monthKeys,
    dailyChargeAmountJpy: IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
    invoices: invoiceList,
    estimate: {
      months: estimateMonths,
      lineCount: estimateMonths.reduce(function(sum, month) { return sum + month.lineCount; }, 0),
      amountJpy: estimateMonths.reduce(function(sum, month) { return sum + month.amountJpy; }, 0)
    }
  };
}

// mode: storeBillingInvoices (POST)
// { storeId } → { success, available, invoices, estimate, months, dailyChargeAmountJpy }
export async function handleStoreBillingInvoices(request, response, deps) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const storeId = readStoreId(deps.readRequestBody(request));
    const actor = await requireStoreBillingOwner(request, response, deps, database, storeId);

    if (!actor) {
      return;
    }

    // 課金開始前のProduction・ほかのPreviewでは、請求書・台帳を読まずに返す(未開始の課金情報を出さない)。
    if (!isStoreInvoiceHistoryAvailable(deps)) {
      return response.status(200).json({ success: true, available: false });
    }

    const history = await buildStoreInvoiceHistory(database, storeId, currentTimeMs(deps));

    return response.status(200).json({ success: true, available: true, ...history });
  } catch (error) {
    console.error("店舗の請求履歴：取得エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
