// STEP 43-B: production-readiness on Preview code. (1) Stripe card registration is allowed in Production only when all 4
// run: node --import ./tests/mockfa-occ/register.mjs tests/prod-readiness-test.mjs
// conditions hold (code switch, STRIPE_MODE live, rk_live_ restricted key, pk_live_ key); elsewhere test mode only.
// (2) Card registration and imadake charging read separate Stripe settings; charging stays off in Production.
// (3) The old store URL (token), old claim approval and self-registration review are removed; kept functions still work.
// REAL modules on mocked firebase-admin (optimistic-concurrency transactions) with an in-memory Stripe stub. Keys are fake
// strings; no network, no real Stripe, no real data.
import fs from "node:fs";
// STEP 43-C｜模擬の firebase-admin（mockfa-occ）を読み込まずに実行された時は、本物の firebase-admin で落ちて
// 結果が出ないため、最初に分かる形で失敗にする（一括実行で結果が出なかった原因）。
if (!process.execArgv.some((a) => a.includes("mockfa-occ"))) {
  console.log("FAIL setup: run with --import ./tests/mockfa-occ/register.mjs (mock firebase-admin not loaded)");
  console.log("TOTAL 1  PASS 0  FAIL 1");
  process.exit(1);
}
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ADMIN = "9413yutaka@gmail.com";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = ADMIN;
process.env.CLOUDINARY_API_KEY = "fake-cloudinary-key"; process.env.CLOUDINARY_API_SECRET = "fake-cloudinary-secret";
const RK_LIVE = "rk_" + "live_FAKERESTRICTEDLIVEKEY0001", SK_LIVE = "sk_" + "live_FAKESECRETLIVEKEY000001", PK_LIVE = "pk_" + "live_FAKEPUBLISHABLELIVE0001";
const RK_TEST = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", PK_TEST = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const PROD_LIVE = { VERCEL_ENV: "production", STRIPE_MODE: "live", STRIPE_RESTRICTED_KEY: RK_LIVE, STRIPE_PUBLISHABLE_KEY: PK_LIVE };
const PREVIEW_TEST = { VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: RK_TEST, STRIPE_PUBLISHABLE_KEY: PK_TEST };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const NOWS = Math.floor(Date.now() / 1000);
const tok = (email) => b64({ alg: "RS256" }) + "." + b64({ user_id: "a", sub: "a", email, exp: NOWS + 3600, iat: NOWS, aud: "chikashoku-app", iss: "https://securetoken.google.com/chikashoku-app", firebase: { sign_in_provider: "password" } }) + ".s";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", ADMIN), [tok(ADMIN)]: pw("adm1", ADMIN), u6: pw("u6", "owner6@example.com"), anon: { uid: "an1", firebase: { sign_in_provider: "anonymous" } } };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

// ---- Stripe stub (records every call; only answers the card-setup operations) ----
const ST = { calls: [], seq: 0, intents: new Map(), pms: new Map() };
const realFetch = globalThis.fetch;
const stripeFetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") throw new Error("unexpected fetch " + url);
  const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
  ST.calls.push({ method: opts.method || "GET", path: u.pathname, auth: (opts.headers || {}).Authorization || "" });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (opts.method === "POST" && u.pathname === "/v1/customers") return json(200, { id: "cus_live" + form["metadata[accountUid]"], metadata: { accountUid: form["metadata[accountUid]"], machinauMode: form["metadata[machinauMode]"] }, livemode: true });
  if (opts.method === "POST" && u.pathname === "/v1/setup_intents") { const id = "seti_live" + ++ST.seq; const si = { id, client_secret: id + "_secret_FAKE", customer: form.customer, usage: form.usage, payment_method_types: ["card"], metadata: { accountUid: form["metadata[accountUid]"] }, status: "requires_payment_method", livemode: true }; ST.intents.set(id, si); return json(200, si); }
  let m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if ((opts.method || "GET") === "GET" && m) { const si = ST.intents.get(m[1]); const pmId = "pm_live" + m[1].replace(/[^A-Za-z0-9]/g, ""); ST.pms.set(pmId, { id: pmId, type: "card", customer: si.customer }); return json(200, { ...si, status: "succeeded", payment_method: { id: pmId, type: "card", customer: si.customer, card: { brand: "visa", last4: ST.seq % 2 ? "4242" : "5556", exp_month: 12, exp_year: 2031, number: "4242424242424242", cvc: "123" } } }); }
  m = u.pathname.match(/^\/v1\/payment_methods\/(pm_[A-Za-z0-9_]+)(\/detach)?$/);
  if (m) { const pm = ST.pms.get(m[1]) || { id: m[1], type: "card", customer: null }; if (m[2]) { pm.customer = null; return json(200, pm); } return json(200, pm); }
  return json(404, { error: { type: "invalid_request_error" } });
};
// OpenAI Moderation (edit-ad の保存時) は「問題なし」で答える模擬。
let moderationCalls = 0;
const moderationFetch = async (url, opts = {}) => { moderationCalls++; const input = JSON.parse(opts.body || "{}").input; const n = Array.isArray(input) ? input.length : 1; return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) }; };
process.env.OPENAI_API_KEY = "sk-" + "fake-openai-for-tests";
globalThis.fetch = async (url, opts) => { const h = new URL(String(url)).hostname; if (h === "127.0.0.1" || h === "localhost") return realFetch(url, opts); if (h === "api.openai.com") return moderationFetch(url, opts); return stripeFetch(url, opts); };

const { getFirestore } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const CR = await import(REPO_URL + "/api/_lib/imadake-card-requirement.js");
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const LC = await import(REPO_URL + "/api/_lib/listing-profile-copy.js");
const db = getFirestore();

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

// ===================== 1. the 4 conditions =====================
const cfg = (env, liveEnabled) => SB.readStripeCardSetupConfig(env, liveEnabled === undefined ? undefined : { liveEnabled });
t("1 本番カード登録のスイッチは false（既定）・Production では4条件がそろっていても拒否（live_registration_disabled）", SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === false && cfg(PROD_LIVE).ok === false && cfg(PROD_LIVE).reason === "live_registration_disabled");
t("2 Stripe のモードが不一致なら拒否（Production で STRIPE_MODE test／空）", cfg({ ...PROD_LIVE, STRIPE_MODE: "test" }, true).reason === "mode_not_allowed" && cfg({ ...PROD_LIVE, STRIPE_MODE: "" }, true).reason === "not_configured");
t("3 不正なキーの種類は拒否：権限の広い sk_live_・テストのキー rk_test_／pk_test_・公開キーの取り違え", cfg({ ...PROD_LIVE, STRIPE_RESTRICTED_KEY: SK_LIVE }, true).reason === "server_key_not_restricted_live" && cfg({ ...PROD_LIVE, STRIPE_RESTRICTED_KEY: RK_TEST }, true).reason === "server_key_not_restricted_live" && cfg({ ...PROD_LIVE, STRIPE_PUBLISHABLE_KEY: PK_TEST }, true).reason === "key_mode_mismatch" && cfg({ ...PROD_LIVE, STRIPE_RESTRICTED_KEY: PK_LIVE }, true).reason === "server_key_not_restricted_live");
const live = cfg(PROD_LIVE, true);
t("4 4条件がそろった時だけ本番モード（live・カード登録用）", live.ok === true && live.mode === "live" && live.purpose === "card_setup");
t("5 Production 以外はテストモードだけ：Preview の test は可・Preview に本番キー／live を置いても拒否", cfg(PREVIEW_TEST).ok === true && cfg(PREVIEW_TEST).mode === "test" && cfg({ ...PROD_LIVE, VERCEL_ENV: "preview" }, true).ok === false && cfg({ ...PREVIEW_TEST, STRIPE_RESTRICTED_KEY: RK_LIVE, STRIPE_PUBLISHABLE_KEY: PK_LIVE }).reason === "key_mode_mismatch");
t("5b カード登録で呼べる Stripe の操作は顧客作成・SetupIntent 作成と照会・PaymentMethod 照会と取り外しだけ（支払いは不可）", SB.isCardSetupStripeOperation("POST", "/customers") && SB.isCardSetupStripeOperation("POST", "/setup_intents") && SB.isCardSetupStripeOperation("GET", "/setup_intents/seti_A1") && SB.isCardSetupStripeOperation("GET", "/payment_methods/pm_A1") && SB.isCardSetupStripeOperation("POST", "/payment_methods/pm_A1/detach") && !SB.isCardSetupStripeOperation("POST", "/payment_intents") && !SB.isCardSetupStripeOperation("GET", "/payment_intents") && !SB.isCardSetupStripeOperation("POST", "/refunds") && !SB.isCardSetupStripeOperation("POST", "/customers/cus_1"));

// ===================== 2. account card in live mode (4 conditions, mocked Stripe) =====================
const actorFor = (uid) => async () => ({ ok: true, actor: { type: "storeUser", uid, emailVerified: true } });
const billingDeps = (uid, env, options) => ({ getFirebaseAdminApp: () => ({}), getFirestore: () => db, readRequestBody: (r) => r.body, resolveStoreUserActor: actorFor(uid), checkStoreProfileEditor: async () => ({ ok: false }), claimRateLimit: async () => true, computeRateLimitIdentifier: (a, b) => a + ":" + b, env, fetch: stripeFetch, cardSetupConfigOptions: options, isStoreInvoiceHistoryAvailable: () => false });
async function billing(fn, uid, body, env, options) { const r = res(); await quiet(() => fn({ body: body || {}, headers: {} }, r, billingDeps(uid, env, options))); return r; }
ST.calls.length = 0;
let st = await billing(SB.handleStoreBillingStatus, "uL1", {}, PROD_LIVE, undefined);
let si = await billing(SB.handleStoreBillingSetupIntentCreate, "uL1", {}, PROD_LIVE, undefined);
t("6 Production・スイッチ false：カード登録は使えない（available false）・Stripe へ1回も送らない", st.body.available === false && st.body.unavailableReason === "live_registration_disabled" && si.code >= 400 && ST.calls.length === 0, { st: st.body, si: si.body });
st = await billing(SB.handleStoreBillingStatus, "uL1", {}, PROD_LIVE, { liveEnabled: true });
si = await billing(SB.handleStoreBillingSetupIntentCreate, "uL1", {}, PROD_LIVE, { liveEnabled: true });
const conf = await billing(SB.handleStoreBillingSetupConfirm, "uL1", { setupIntentId: si.body.setupIntentId, consentVersion: SB.STORE_BILLING_CONSENT_VERSION }, PROD_LIVE, { liveEnabled: true });
const acct = S.docs.get("accountBilling/uL1") || {};
t("7 4条件がそろうと本番モードでアカウント共通カードを登録できる（公開キーは pk_live_・SetupIntent → 確定）", st.body.available === true && st.body.mode === "live" && si.code === 200 && si.body.publishableKey === PK_LIVE && conf.code === 200 && conf.body.status === "succeeded", { st: st.body, si: si.body && { id: si.body.setupIntentId, pk: si.body.publishableKey }, conf: conf.body });
t("8 保存先は accountBilling/{uid}.live（test の区画と分かれる）・カード番号／セキュリティコードは保存しない（ブランド・下4桁・有効期限だけ）", acct.uid === "uL1" && acct.live && /^cus_/.test(acct.live.customerId) && /^pm_/.test(acct.live.paymentMethodId) && !acct.test && JSON.stringify(Object.keys(acct.live.card).sort()) === JSON.stringify(["brand", "expMonth", "expYear", "last4"]) && !JSON.stringify(acct).includes("4242424242424242") && !JSON.stringify(acct).includes("\"cvc\""), acct);
const firstPm = acct.live && acct.live.paymentMethodId;
const si2 = await billing(SB.handleStoreBillingSetupIntentCreate, "uL1", {}, PROD_LIVE, { liveEnabled: true });
const conf2 = await billing(SB.handleStoreBillingSetupConfirm, "uL1", { setupIntentId: si2.body.setupIntentId, consentVersion: SB.STORE_BILLING_CONSENT_VERSION }, PROD_LIVE, { liveEnabled: true });
const acct2 = S.docs.get("accountBilling/uL1") || {};
const detachCalls = ST.calls.filter((c) => /\/detach$/.test(c.path));
t("9 カードの変更：新しいカードに置き換わり、旧カードは取り外し（detach）の対象になる", conf2.code === 200 && acct2.live.paymentMethodId !== firstPm && (detachCalls.some((c) => c.path.includes(firstPm)) || (acct2.live.detachPendingPaymentMethods || []).some((e) => e.paymentMethodId === firstPm)), { pm: acct2.live.paymentMethodId, firstPm, detach: detachCalls.map((c) => c.path), pending: acct2.live.detachPendingPaymentMethods });
const cardChecks = await Promise.all([CR.checkAccountBillingCard(db, "uL1", { env: PROD_LIVE, liveEnabled: true }), CR.checkAccountBillingCard(db, "uL1", { env: PROD_LIVE })]);
t("10 店舗の登録・引き継ぎの条件（アカウントのカード）：4条件の時は live の区画で有効・スイッチ false なら card_billing_unavailable", cardChecks[0].ok === true && cardChecks[1].ok === false && cardChecks[1].reason === "card_billing_unavailable", cardChecks);
const allowedOnly = ST.calls.every((c) => SB.isCardSetupStripeOperation(c.method, c.path.replace(/^\/v1/, "")));
t("11 カード登録で Stripe に送ったのは許可した操作だけ・キーは rk_live_・支払い（PaymentIntent）・返金は一度も送らない", ST.calls.length > 0 && allowedOnly && ST.calls.every((c) => c.auth === "Bearer " + RK_LIVE) && !ST.calls.some((c) => /payment_intents|refunds|charges|invoices/.test(c.path)), ST.calls.map((c) => c.method + " " + c.path));

// ===================== 3. charging is separate and stays off =====================
const RK_CHARGE_TEST = "rk_" + "test_FAKECHARGEKEYONLY00000001";
const PREVIEW_CHARGE = { ...PREVIEW_TEST, STRIPE_CHARGE_RESTRICTED_KEY: RK_CHARGE_TEST };
t("12 請求用の設定は Production では常に無効（本番カード登録の4条件・請求用キーがそろっていても）・Preview は請求用キーがある時だけ test", SB.readStripeChargeConfig({ ...PROD_LIVE, STRIPE_CHARGE_RESTRICTED_KEY: RK_LIVE }).ok === false && SB.readStripeChargeConfig({ ...PROD_LIVE, STRIPE_CHARGE_RESTRICTED_KEY: RK_LIVE }).reason === "disabled_in_production" && SB.readStripeChargeConfig(PREVIEW_CHARGE).ok === true && SB.readStripeChargeConfig(PREVIEW_CHARGE).purpose === "charge" && SB.readStripeChargeConfig(PREVIEW_CHARGE).serverKey === RK_CHARGE_TEST);
// STEP 43-M｜請求用キーの分離：カード登録用のキーへ切り替えない・未設定なら止まる
t("12a 請求用キー（STRIPE_CHARGE_RESTRICTED_KEY）が未設定なら、カード登録用のキーがあっても請求の設定は無効（charge_key_not_configured）", SB.CHARGE_KEY_ENV_NAME === "STRIPE_CHARGE_RESTRICTED_KEY" && SB.CARD_SETUP_KEY_ENV_NAME === "STRIPE_RESTRICTED_KEY" && SB.readStripeChargeConfig(PREVIEW_TEST).ok === false && SB.readStripeChargeConfig(PREVIEW_TEST).reason === "charge_key_not_configured" && SB.readStripeChargeConfig({ ...PREVIEW_TEST, STRIPE_CHARGE_RESTRICTED_KEY: "  " }).reason === "charge_key_not_configured");
t("12b カード登録の設定は請求用キーを使わない（カード登録用のキーだけ）・請求用キーだけでは使えない", SB.readStripeCardSetupConfig(PREVIEW_CHARGE).serverKey === RK_TEST && SB.readStripeCardSetupConfig({ ...PREVIEW_CHARGE, STRIPE_RESTRICTED_KEY: "" }).ok === false);
const before = ST.calls.length;
const charge = await quiet(() => CH.runImadakeMonthlyCharge(db, { env: PROD_LIVE, fetch: stripeFetch, cardSetupConfigOptions: { liveEnabled: true } }, { month: "2026-10", dryRun: false, gates: { chargeEnabled: true, billingStarted: true } }));
t("13 請求の処理はカード登録用のキー・設定を使えない：フラグを仮に true にしても Production では stripe_unavailable（Stripe へ送らない）", charge.ok === false && charge.reason === "stripe_unavailable" && charge.unavailableReason === "disabled_in_production" && ST.calls.length === before, charge);
const gated = await quiet(() => CH.runImadakeMonthlyCharge(db, { env: PREVIEW_TEST, fetch: stripeFetch }, { month: "2026-10", dryRun: false, gates: CH.readImadakeMonthlyChargeGates() }));
const beforeNoChargeKey = ST.calls.length;
const noChargeKey = await quiet(() => CH.runImadakeMonthlyCharge(db, { env: PREVIEW_TEST, fetch: stripeFetch }, { month: "2026-10", dryRun: false, gates: { chargeEnabled: true, billingStarted: true } }));
t("14a 請求用キーが未設定なら、フラグを仮に true にしても月次請求は止まる（stripe_unavailable／charge_key_not_configured）・Stripe へ送らない", noChargeKey.ok === false && noChargeKey.reason === "stripe_unavailable" && noChargeKey.unavailableReason === "charge_key_not_configured" && ST.calls.length === beforeNoChargeKey, noChargeKey);
t("14 課金関連3フラグは false のまま（請求の実行は charge_disabled）・写真の複製も false", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false && LC.LISTING_PHOTO_COPY_ENABLED === false && gated.ok === false && gated.reason === "charge_disabled", gated);
t("15 カード登録で請求は発生しない（請求書・日別課金の記録を作らない）", ![...S.docs.keys()].some((k) => k.startsWith("imadakeMonthlyInvoices/") || k.startsWith("imadakePostDailyCharges/")));

// ===================== 4. old methods removed / kept functions =====================
let ip = 0;
async function call(body, token) {
  const r = res();
  await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r));
  return r;
}
const removedModes = ["shopTokenValidate", "shopSubmissionCreate", "adminRotateStoreToken", "adminStoreListingClaimReview", "adminCountPendingStoreListingClaims", "storeListingClaimWithdraw", "adminStoreRegistrationReview"];
const w0 = S.writes.length;
const removedResults = [];
for (const mode of removedModes) removedResults.push([mode, (await call({ mode, storeId: "x", token: "t", claimId: "c" }, mode.startsWith("admin") ? "admin" : "u6")).code]);
t("16 撤去した旧方式の mode はすべて 410・Firestore へ書き込まない", removedResults.every((x) => x[1] === 410) && S.writes.length === w0, removedResults);
const sig = await call({ mode: "cloudinarySignature", storeId: "legacy1", token: "secret" }, "anon");
const sigStreet = await call({ mode: "cloudinarySignature" }, "anon");
t("17 token による旧写真アップロード経路は 410（storeId／token 無しの通常の署名は従来どおり 200）", sig.code === 410 && sigStreet.code === 200 && typeof sigStreet.body.signature === "string", { sig: sig.code, street: sigStreet.code });
const created = await call({ mode: "adminCreateStoreAccount", storeName: "運営登録の店" }, "admin");
const createdDoc = S.docs.get("storeAccounts/" + (created.body && created.body.storeId)) || {};
const list = await call({ mode: "adminListStoreAccounts" }, "admin");
const renamed = await call({ mode: "adminUpdateStoreAccountName", storeId: created.body.storeId, storeName: "運営登録の店（改）" }, "admin");
const disabled = await call({ mode: "adminSetStoreEnabled", storeId: created.body.storeId, enabled: false }, "admin");
t("18 運営による店舗登録は維持（200・店舗を作る）・旧店舗URL（token）は発行しない（応答にも保存にも無い）", created.code === 200 && createdDoc.storeName === "運営登録の店" && !("token" in created.body) && !("tokenHash" in createdDoc), { body: created.body, createdDoc });
t("19 運営の店舗一覧・店舗名の編集・有効化／無効化は維持", list.code === 200 && (list.body.storeAccounts || []).some((s) => s.storeId === created.body.storeId) && renamed.code === 200 && disabled.code === 200 && S.docs.get("storeAccounts/" + created.body.storeId).enabled === false && S.docs.get("storeAccounts/" + created.body.storeId).storeName === "運営登録の店（改）", { list: list.code, renamed: renamed.body, disabled: disabled.body });

// ===================== 5. static invariants =====================
const read = (p) => fs.readFileSync(REPO_ROOT + "/" + p, "utf8");
const clientFiles = fs.readdirSync(REPO_ROOT).filter((f) => f.endsWith(".html")).concat(["app.js"]);
const leftovers = clientFiles.filter((f) => /shopTokenValidate|shopSubmissionCreate|adminRotateStoreToken|adminStoreListingClaimReview|adminCountPendingStoreListingClaims|storeListingClaimWithdraw|adminStoreRegistrationReview/.test(read(f)));
t("20 画面（HTML・app.js）から撤去した旧方式の呼び出しが無い", leftovers.length === 0, leftovers);
const apiText = fs.readdirSync(REPO_ROOT + "/api").filter((f) => f.endsWith(".js")).map((f) => read("api/" + f)).join("\n") + fs.readdirSync(REPO_ROOT + "/api/_lib").map((f) => read("api/_lib/" + f)).join("\n");
t("21 サーバーに店舗token の検証・発行の処理が残っていない（validateStoreToken・generateStoreToken）", !/validateStoreToken|generateStoreToken/.test(apiText.replace(/\/\/.*$/gm, "")));
t("22 Function は11本のまま", fs.readdirSync(REPO_ROOT + "/api").filter((f) => f.endsWith(".js")).length === 11);
t("23 カード登録（store-billing）は請求用の設定を、請求（monthly-charge）はカード登録用の設定を使わない", !/readStripeChargeConfig\(/.test(read("api/_lib/store-billing.js").split("export function readStripeChargeConfig")[0]) && !/readStripeCardSetupConfig/.test(read("api/_lib/imadake-monthly-charge.js")) && !/readStripeCardSetupConfig/.test(read("api/_lib/imadake-billing-admin.js")));
// STEP 43-C｜shop.html：旧専用URL方式の案内を撤去し、店主の導線は店舗アカウント（登録・ログイン・自動引き継ぎ）だけ。
const shopVisible = read("shop.html").replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const claimLinkJa = (read("translations.js").match(/modal_claim_link:\s*\{\s*ja:\s*"([^"]+)"/) || [])[1] || "";
t("24a shop.html：旧専用URL方式の案内（専用投稿URL・edit.html・end.html・shop-guide.html への導線）が無い", !/専用投稿URL|これまでどおり、お渡しした専用URL|href="edit\.html"|href="end\.html"|href="shop-guide\.html"/.test(shopVisible));
t("24b shop.html：店主の導線は既存の店舗アカウント（作成 store-account.html?view=signup・ログイン store-account.html）と、掲載中のお店の詳細の入口（TOP と同じ文言）", /href="store-account\.html\?view=signup"/.test(shopVisible) && /href="store-account\.html"/.test(shopVisible) && claimLinkJa !== "" && shopVisible.includes(claimLinkJa.replace(/\s*→$/, "")), claimLinkJa);
t("24c shop.html：はじめ方にクレジットカードの登録があり、旧方式の運営確認・「準備中」の案内が無い", /クレジットカードを登録します/.test(shopVisible) && !/運営が確認してから登録が完了/.test(shopVisible) && !/仕組みは準備中/.test(shopVisible) && !/自動では引き継がれません/.test(shopVisible));
// STEP 43-G①｜管理画面（admin.html・admin-shops.html）の文言
const visibleOf = (p) => read(p).replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "").split(/\r?\n/).map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");
const adminVisible = visibleOf("admin.html");
const shopsLink = (adminVisible.match(/href="admin-shops\.html"[\s\S]*?admin-menu-link-note">([^<]*)</) || [])[1] || "";
t("32a admin.html：管理メニュー「店舗・施設を管理する」の説明は「店舗の登録・管理」・旧文言「店舗登録・専用投稿URLの発行」が無い", shopsLink === "店舗の登録・管理" && !/専用投稿URLの発行/.test(adminVisible), shopsLink);
const shopsVisible = visibleOf("admin-shops.html");
t("32b admin-shops.html：タイトル・見出しは「店舗の登録・管理」・「店舗専用投稿URL管理」「（専用URLなし）」が無い", /<title>\s*店舗の登録・管理｜マチナウ運営\s*<\/title>/.test(shopsVisible) && /<h1>\s*店舗の登録・管理\s*<\/h1>/.test(shopsVisible) && !/店舗専用投稿URL管理|（専用URLなし）/.test(shopsVisible));
const scope = ["admin.html", "admin-shops.html", "admin-store-claims.html", "admin-billing.html"];
const oldWords = scope.filter((p) => /専用投稿URL|専用URLを発行|URLの発行|token再発行|本人確認の手順|公式連絡先で確認/.test(visibleOf(p)));
t("32c 管理画面（メニュー・店舗・引き継ぎ・請求確認）に旧方式が使えると誤認させる表示が無い", oldWords.length === 0, oldWords);

// STEP 43-D｜shop-guide.html：旧専用URLの説明書 → 店舗アカウントの利用案内（正式な流れ・既存の導線だけ）
const guideVisible = read("shop-guide.html").replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const flow = ["店舗アカウントを作る", "メールアドレスを確認する", "クレジットカードを登録する", "お店・施設を登録する、または引き継ぐ", "お店の情報を管理する"];
const flowIdx = flow.map((x) => guideVisible.indexOf(x));
t("28a shop-guide.html：正式な流れ（アカウント作成→メール確認→カード登録→新規登録／自動引き継ぎ→店舗情報の管理）をこの順で案内", flowIdx.every((i) => i >= 0) && flowIdx.every((i, k) => k === 0 || i > flowIdx[k - 1]), flowIdx);
t("28b shop-guide.html：旧専用URL方式（お店専用の投稿ページ・URL の保管／再発行・掲載番号／終了番号・edit／end への導線）が無い", !/お店専用の投稿ページ|発行し直す|終了番号|掲載番号|href="edit\.html"|href="end\.html"/.test(guideVisible));
const guideHrefs = [...guideVisible.matchAll(/href="([^"#]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith("/favicon"));
t("28c shop-guide.html：リンクは既存のページだけ（存在しないURLを作らない）", guideHrefs.length > 0 && guideHrefs.every((h) => fs.existsSync(REPO_ROOT + "/" + h.split("?")[0])), guideHrefs);
// STEP 51-B｜料金は正式な4商品の案内だけを載せる(店舗カードの作成・下書きは無料・公開は月額100円・今だけ投稿は契約不要)。
t("28d shop-guide.html：運営の個別承認・電話確認・書類提出などの新しい条件を加えない・料金は正式な案内だけ（ラベルは実際の画面の文言）", !/電話|書類|審査|本人確認|手数料|特定商取引|500円/.test(guideVisible) && /店舗カードの作成・下書きは無料です。店舗カードを旅行者に公開するには月額100円（税込）の契約が必要です。今だけ投稿は店舗カードの契約が無くても使え/.test(guideVisible) && !/お店・施設の情報の登録は無料/.test(guideVisible) && /「カードを登録する」/.test(guideVisible) && /「店舗・施設を登録する」/.test(guideVisible) && /「このお店を引き継ぐ」/.test(guideVisible) && /「常設店舗情報を編集する」/.test(guideVisible) && /「旅行者に公開する」/.test(guideVisible));

// STEP 43-D｜「街の声」の編集・掲載終了（edit.html／end.html の API、api/edit-ad.js）は維持
{
  const { createHash } = await import("node:crypto");
  const { Timestamp } = await import("firebase-admin/firestore");
  const { default: editAd } = await import(REPO_URL + "/api/edit-ad.js?v=" + Date.now());
  const END = "ABCDEFGHJKLM";
  const later = Timestamp.fromMillis(Date.now() + 6 * 3600e3);
  S.docs.set("submissions/street1", { submissionType: "street", shopName: "国際通り", title: "", category: "", content: "国際通りで三線のライブをしています。", address: "沖縄県那覇市", websiteUrl: "", status: "approved", publicationNumber: "12345678", endCodeHash: createHash("sha256").update(END, "utf8").digest("hex"), expiresAt: later, createdAt: Timestamp.fromMillis(Date.now() - 3600e3) });
  S.docs.set("submissions/legacyShop1", { submissionType: "shop", publisherType: "verified_shop", storeId: "legacyStore", shopName: "旧URL店", title: "旧方式の店舗投稿", category: "グルメ", content: "過去の投稿", address: "沖縄県那覇市", status: "expired", publicationNumber: "87654321", endCodeHash: createHash("sha256").update(END, "utf8").digest("hex"), expiresAt: Timestamp.fromMillis(Date.now() - 3600e3) });
  const ea = async (body) => { const r = res(); await quiet(() => editAd({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.77" }, body, query: {} }, r)); return r; };
  const lk = await ea({ action: "lookup", publicationNumber: "12345678", endCode: END });
  t("29a 「街の声」の投稿：掲載番号＋終了番号で内容を呼び出せる（edit.html）", lk.code === 200 && lk.body.submission && /三線/.test(lk.body.submission.content), { code: lk.code, body: lk.body });
  const bad = await ea({ action: "lookup", publicationNumber: "12345678", endCode: "ABCDEFGHJKLN" });
  t("29b 終了番号が違えば呼び出せない（従来どおり）", bad.code === 401);
  const saveBody = { action: "save", publicationNumber: "12345678", endCode: END, ...(lk.body.submission || {}), title: "三線ライブ", category: "イベント", content: "国際通りで三線のライブ、19時までです。" }; // 編集画面はタイトル・カテゴリの入力が必須（従来どおり）
  const sv = await ea(saveBody);
  t("29c 「街の声」の投稿の編集を保存できる（内容の確認を通す）", sv.code === 200 && /19時まで/.test(S.docs.get("submissions/street1").content), { code: sv.code, body: sv.body, moderationCalls });
  const en = await ea({ action: "end", publicationNumber: "12345678", endCode: END });
  t("29d 「街の声」の投稿の掲載を終了できる（end.html）", en.code === 200 && S.docs.get("submissions/street1").status === "expired", { code: en.code, body: en.body });
  const lg = await ea({ action: "lookup", publicationNumber: "87654321", endCode: END });
  t("29e 旧方式の店舗投稿（本番に1件ある過去データ）の扱いは従来どおり（表示用の印 isVerifiedShop を返す・データは変えない）", lg.body && (lg.code === 200 ? lg.body.submission.isVerifiedShop === true : true) && S.docs.get("submissions/legacyShop1").status === "expired", { code: lg.code, body: lg.body });
}

// ===================== 6. screens =====================
const ORIGIN = "http://127.0.0.1:8875";
async function api(url, method, log, postData, headers) {
  if (method !== "POST") return null;
  const r = res(); const auth = headers.Authorization || headers.authorization;
  await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(auth ? { authorization: auth } : {}) }, body: JSON.parse(postData || "{}"), query: {} }, r));
  apiCalls.push(JSON.parse(postData || "{}").mode);
  return { status: r.code, body: r.body };
}
const apiCalls = [];
const authMock = async (url) => {
  if (url.includes("signInWithPassword")) return { body: { localId: "a", email: ADMIN, idToken: tok(ADMIN), refreshToken: "r", expiresIn: "3600", registered: true } };
  if (url.includes("lookup")) return { body: { users: [{ localId: "a", email: ADMIN, emailVerified: true, providerUserInfo: [{ providerId: "password", email: ADMIN }] }] } };
  return { body: { id_token: tok(ADMIN), refresh_token: "r", expires_in: "3600" } };
};
const server = await serve(REPO_ROOT + "", 8875);
const browser = await launchChrome();
try {
  const a = await openPage(browser, { origin: ORIGIN, width: 1280, state: { apiPassthrough: true, apiMock: api, authMock } });
  await a.goto("/admin-shops.html"); await a.waitFor("document.readyState === 'complete'"); await sleep(800);
  await a.ev(`(() => { document.getElementById("adminEmail").value = ${JSON.stringify(ADMIN)}; document.getElementById("adminPassword").value = "x"; document.getElementById("loginButton").click(); return true; })()`);
  await a.waitFor(`document.querySelectorAll("#storeList .store-row").length >= 1`, 20000); await sleep(600);
  await a.ev(`(() => { document.getElementById("newStoreNameInput").value = "画面から登録した店"; document.getElementById("createStoreButton").click(); return true; })()`);
  await a.waitFor(`/店舗を登録しました/.test(document.getElementById("createStoreMessage").textContent)`, 15000); await sleep(800);
  const v = await a.ev(`({ area: document.getElementById("adminArea").innerText, button: document.getElementById("createStoreButton").textContent.trim(), rotate: document.querySelectorAll('[data-action="rotate"], [data-action="review-approve"], [data-action="review-reject"], .store-issued-url, #createStoreIssuedUrlBox').length, list: document.getElementById("storeList").innerText })`);
  t("24 admin-shops：運営の店舗登録は画面から使える（「店舗を登録する」）・専用URLの表示／token再発行／運営確認の承認・却下は無い", v.button === "店舗を登録する" && /画面から登録した店/.test(v.list) && v.rotate === 0 && !/専用URL|token再発行|確認OK（利用可能にする）/.test(v.area), { button: v.button, rotate: v.rotate });
  t("25 admin-shops：JSエラーなし", a.log.errors.length === 0, a.log.errors);
  // STEP 43-G①｜管理画面の文言：旧専用URL方式が今も使えると誤認させる表示を残さない
  const head = await a.ev(`({ title: document.title.trim(), h1: document.querySelector("h1").textContent.trim(), body: document.body.innerText })`);
  t("31 admin-shops：タイトル・見出しは「店舗の登録・管理」・画面全体に「専用URL／専用投稿URL」の表示が無い", /^店舗の登録・管理/.test(head.title) && head.h1 === "店舗の登録・管理" && !/専用URL|専用投稿URL|token再発行/.test(head.body), { title: head.title, h1: head.h1 });
  await a.close();

  apiCalls.length = 0;
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, articles: [] } });
  await p.goto("/post.html?mode=shop&store=legacy1&token=secret"); await p.waitFor("document.readyState === 'complete'"); await sleep(2000);
  const pv = await p.ev(`({ notice: (document.getElementById("postModeShopUnavailableNotice") || {}).textContent || "", shown: getComputedStyle(document.getElementById("postModeShopUnavailableNotice")).display !== "none", search: location.search })`);
  t("26 旧店舗投稿URL（post.html?mode=shop&store&token）：サーバーへ問い合わせず終了の案内・アドレスバーから token を消す", pv.shown && /終了しました/.test(pv.notice) && !apiCalls.includes("shopTokenValidate") && !pv.search.includes("token"), { pv, apiCalls });
  await p.close();

  // STEP 43-C｜shop.html の表示（スマホ・PC）：JSエラーなし・横スクロールなし・旧欄なし
  for (const w of [390, 1280]) {
    const sp = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiMock: api, articles: [] } });
    await sp.goto("/shop.html"); await sp.waitFor("document.readyState === 'complete'"); await sleep(600);
    const sv = await sp.ev(`({ text: document.body.innerText, oldCard: document.querySelectorAll(".existing-card").length, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 })`);
    t("27 shop.html（幅 " + w + "）：表示できる・旧欄なし・横スクロールなし・JSエラーなし", /店舗アカウントを作る/.test(sv.text) && sv.oldCard === 0 && !sv.overflow && sp.log.errors.length === 0, { oldCard: sv.oldCard, overflow: sv.overflow, errors: sp.log.errors });
    await sp.close();
    // STEP 43-D｜shop-guide.html（店舗アカウントの使い方）
    const gp = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiMock: api, articles: [] } });
    await gp.goto("/shop-guide.html"); await gp.waitFor("document.readyState === 'complete'"); await sleep(600);
    const gv = await gp.ev(`({ h1: document.querySelector("h1").textContent.trim(), overflow: document.documentElement.scrollWidth > window.innerWidth + 1, title: document.title.trim() })`);
    t("30 shop-guide.html（幅 " + w + "）：「店舗アカウントの使い方」を表示・横スクロールなし・JSエラーなし", gv.h1 === "店舗アカウントの使い方" && /店舗アカウントの使い方/.test(gv.title) && !gv.overflow && gp.log.errors.length === 0, { gv, errors: gp.log.errors });
    await gp.close();
  }
} finally {
  browser.close(); server.close();
}

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
