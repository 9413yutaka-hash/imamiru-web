// STEP 43-N C案: production card registration advance test for the representative's account only.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions),
// in-memory Stripe stub with FAKE live-shaped keys. No network, no real Stripe/Firestore, no real keys.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-live-trial-test.mjs
import { REPO_URL, REPO_ROOT as REPO_DIR } from "./_paths.mjs";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
const ADMIN = "admin@example.com";
const FAKE_LIVE_RK = "rk_" + "live_FAKEKEYFORLOCALTESTS0001", FAKE_LIVE_PK = "pk_" + "live_FAKEPUBLISHABLEFORTESTS01";
const FAKE_TEST_RK = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_TEST_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const PROD = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", STRIPE_MODE: "live", STRIPE_RESTRICTED_KEY: FAKE_LIVE_RK, STRIPE_PUBLISHABLE_KEY: FAKE_LIVE_PK, ADMIN_EMAIL: ADMIN };
const setEnv = (o) => { for (const k of ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "STRIPE_MODE", "STRIPE_RESTRICTED_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_CHARGE_RESTRICTED_KEY", "ADMIN_EMAIL"]) delete process.env[k]; Object.assign(process.env, o); };
setEnv(PROD);
const tok = (uid, email, verified = true, provider = "password") => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: provider } });
globalThis.__MOCK_TOKENS = {
  admin: tok("adm1", ADMIN), adminUpper: tok("adm1", "Admin@Example.COM"), adminUnverified: tok("adm2", ADMIN, false), adminGoogle: tok("adm3", ADMIN, true, "google.com"),
  owner: tok("u1", "owner@example.com"), owner2: tok("u2", "owner2@example.com"), look1: tok("u3", "admin@example.com.evil.test"), look2: tok("u4", "xadmin@example.com"), noEmail: tok("u5", undefined)
};
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
// ---- Stripe stub (live-shaped fake key only) ----
const ST = { calls: [], seq: 0, intents: new Map(), nextCard: null, auth: [] };
const CARDS = { visa: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 }, mc: { brand: "mastercard", last4: "4444", exp_month: 6, exp_year: 2031 } };
let otherNetwork = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") { otherNetwork++; throw new Error("unexpected fetch " + url); }
  const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
  ST.calls.push(opts.method + " " + u.pathname); ST.auth.push((opts.headers || {}).Authorization);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const key = String((opts.headers || {}).Authorization || "").replace(/^Bearer /, "");
  if (key !== FAKE_LIVE_RK && key !== FAKE_TEST_RK) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/customers") return json(200, { id: "cus_new" + ++ST.seq, metadata: { machinauMode: form["metadata[machinauMode]"] } });
  if (opts.method === "POST" && u.pathname === "/v1/setup_intents") {
    const id = "seti_l" + ++ST.seq;
    ST.intents.set(id, { id, client_secret: id + "_secret_FAKE", customer: form.customer, payment_method_types: ["card"], metadata: { accountUid: form["metadata[accountUid]"], machinauMode: form["metadata[machinauMode]"] }, status: "succeeded", card: ST.nextCard || CARDS.visa });
    const si = ST.intents.get(id); return json(200, { id, client_secret: si.client_secret, customer: si.customer, payment_method_types: si.payment_method_types, metadata: si.metadata, status: "requires_payment_method" });
  }
  if (/^\/v1\/payment_methods\//.test(u.pathname)) return json(503, { error: { type: "api_error" } });
  const m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if (opts.method === "GET" && m) {
    const si = ST.intents.get(m[1]); if (!si) return json(404, { error: { type: "invalid_request_error", code: "resource_missing" } });
    return json(200, { id: si.id, customer: si.customer, metadata: si.metadata, status: si.status, payment_method: { id: "pm_" + m[1], type: "card", customer: si.customer, card: { ...si.card } } });
  }
  return json(404, { error: { type: "invalid_request_error" } });
};
globalThis.__geocode = 0;
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const LC = await import(REPO_URL + "/api/_lib/listing-profile-copy.js");

let pass = 0, fail = 0; const logs = [];
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
let ip = 0;
const mkRes = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(mode, body, token, extraHeaders = {}) {
  const r = mkRes();
  const e = console.error; console.error = (...a) => logs.push(a.map(String).join(" "));
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}), ...extraHeaders }, body: { mode, ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function getPublic() {
  const r = mkRes();
  const e = console.error; console.error = () => {};
  try { await handler({ method: "GET", headers: { "x-forwarded-for": "198.51.100.9" }, query: { mode: "publicStoreProfiles" } }, r); } finally { console.error = e; }
  return r;
}
const CONSENT = SB.STORE_BILLING_CONSENT_VERSION || "2026-10-16";
const resetRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeBillingRateLimits/") || k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
const billing = (uid) => S.docs.get("accountBilling/" + uid) || null;
const start = async (token, card = null) => { resetRate(); ST.nextCard = card; return call("storeBillingSetupIntentCreate", {}, token); };
const confirm = (si, token) => call("storeBillingSetupConfirm", { setupIntentId: si, consentVersion: CONSENT }, token);

// ===================== U: unit — who is the advance-test account =====================
const L = (tk, env = PROD) => SB.isStoreCardLiveTrialToken(tk, env);
t("U1 代表（ADMIN_EMAIL と一致・確認済み・パスワード）：先行テストのアカウント", L(globalThis.__MOCK_TOKENS.admin) === true);
t("U2 大文字小文字の違いは同じメールとして扱う（管理画面の判定と同じ）", L(globalThis.__MOCK_TOKENS.adminUpper) === true);
t("U3 メール未確認・パスワード以外のログイン（Google 等）・別のメール・似たメール・メールなしは対象外",
  [globalThis.__MOCK_TOKENS.adminUnverified, globalThis.__MOCK_TOKENS.adminGoogle, globalThis.__MOCK_TOKENS.owner, globalThis.__MOCK_TOKENS.look1, globalThis.__MOCK_TOKENS.look2, globalThis.__MOCK_TOKENS.noEmail, null, undefined, "admin"].every((x) => L(x) === false));
t("U4 ADMIN_EMAIL が未設定・空・空白だけなら誰も対象外（コードに代表のメール・uid は無い）",
  L(globalThis.__MOCK_TOKENS.admin, { ...PROD, ADMIN_EMAIL: undefined }) === false && L(globalThis.__MOCK_TOKENS.admin, { ...PROD, ADMIN_EMAIL: "" }) === false && L(globalThis.__MOCK_TOKENS.admin, { ...PROD, ADMIN_EMAIL: "   " }) === false && L({ ...globalThis.__MOCK_TOKENS.admin, email: "" }, { ...PROD, ADMIN_EMAIL: "" }) === false);
const CFG = (o) => SB.readStripeCardSetupConfig(PROD, o);
t("U5 Production・一般公開のスイッチ false：一般は live_registration_disabled、先行テストのアカウントだけ live",
  CFG({}).reason === "live_registration_disabled" && CFG({ liveTrialAccount: false }).reason === "live_registration_disabled" && CFG({ liveTrialAccount: true }).ok === true && CFG({ liveTrialAccount: true }).mode === "live");
t("U6 先行テストのスイッチを false にすると代表も使えない（先行テストの終了・停止）", CFG({ liveTrialAccount: true, liveTrialEnabled: false }).reason === "live_registration_disabled");
t("U7 一般公開（スイッチ true）では全員が live（代表の判定は不要）", CFG({ liveEnabled: true }).ok === true && CFG({ liveEnabled: true, liveTrialEnabled: false }).mode === "live");
t("U8 先行テストでも他の3条件は同じ：STRIPE_MODE test・sk_live_・pk_test_・キー未設定はすべて停止",
  SB.readStripeCardSetupConfig({ ...PROD, STRIPE_MODE: "test" }, { liveTrialAccount: true }).ok === false &&
  SB.readStripeCardSetupConfig({ ...PROD, STRIPE_RESTRICTED_KEY: "sk_" + "live_FAKE" }, { liveTrialAccount: true }).reason === "server_key_not_restricted_live" &&
  SB.readStripeCardSetupConfig({ ...PROD, STRIPE_PUBLISHABLE_KEY: FAKE_TEST_PK }, { liveTrialAccount: true }).reason === "key_mode_mismatch" &&
  SB.readStripeCardSetupConfig({ ...PROD, STRIPE_RESTRICTED_KEY: "" }, { liveTrialAccount: true }).reason === "not_configured");
t("U9 Production 以外では先行テストの印があってもテストモードだけ（本番キーは使わない）",
  SB.readStripeCardSetupConfig({ ...PROD, VERCEL_ENV: "preview" }, { liveTrialAccount: true }).ok === false &&
  SB.readStripeCardSetupConfig({ VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_TEST_RK, STRIPE_PUBLISHABLE_KEY: FAKE_TEST_PK }, { liveTrialAccount: true }).mode === "test");
t("U10 一般への公開（新規登録・引き継ぎの入口）：Production はスイッチ false の間は閉じる・Production 以外は従来どおり開く",
  SB.isStoreOnboardingOpen(PROD) === false && SB.isStoreOnboardingOpen({ VERCEL_ENV: "preview" }) === true && SB.isStoreOnboardingOpen({}) === true);
t("U11 スイッチの既定値：一般公開 false・先行テスト true", SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === false && SB.STORE_CARD_LIVE_ADMIN_TRIAL_ENABLED === true);
t("U12 請求の設定は Production では常に無効（本番キー・請求用キーがあっても）", SB.readStripeChargeConfig({ ...PROD, STRIPE_CHARGE_RESTRICTED_KEY: FAKE_LIVE_RK }).reason === "disabled_in_production");

// ===================== P: production server — only the representative =====================
let r = await call("storeBillingStatus", {}, "owner");
t("P1 一般の店主：カード登録の状態は available:false（live_registration_disabled）", r.code === 200 && r.body.available === false && r.body.unavailableReason === "live_registration_disabled" && r.body.card === null, r.body);
let callsBefore = ST.calls.length;
r = await start("owner");
t("P2 一般の店主：カード登録の開始はサーバーで 503 billing_unavailable・Stripe に何も送らない・保存なし", r.code === 503 && r.body.reason === "billing_unavailable" && ST.calls.length === callsBefore && !billing("u1"), r.body);
r = await confirm("seti_forged123", "owner");
t("P3 一般の店主：確定（偽の SetupIntent ID）も 503・Stripe に照会しない・保存なし", r.code === 503 && ST.calls.length === callsBefore && !billing("u1"), r.body);
for (const [label, tk] of [["似たメール（後ろに別のドメイン）", "look1"], ["似たメール（前に文字）", "look2"], ["メールなし", "noEmail"]]) {
  r = await start(tk);
  t("P4 " + label + "：一般と同じく 503・Stripe に送らない", r.code === 503 && ST.calls.length === callsBefore, r.body);
}
r = await call("storeBillingStatus", {}, null);
const rBad = await call("storeBillingStatus", {}, "forged-token");
t("P5 未ログインは 401 login_required・不正なトークンは 401", r.code === 401 && r.body.reason === "login_required" && rBad.code === 401, { r: r.body, bad: rBad.body });
r = await start("adminUnverified");
const rG = await start("adminGoogle");
t("P6 代表のメールでも、メール未確認は 403 email_not_verified・Google 等のログインは 403（パスワードのログインだけ）", r.code === 403 && r.body.reason === "email_not_verified" && rG.code === 403 && ST.calls.length === callsBefore, { r: r.body, g: rG.body });
r = await call("storeBillingStatus", {}, "owner", { "x-machinau-live-trial": "1" });
const rBody = await call("storeBillingStatus", { liveTrialAccount: true, liveEnabled: true, cardLiveTrial: true }, "owner");
t("P7 一般の店主がリクエストの見出し・本文で先行テストを名乗っても無効（判定はサーバーで検証したログインだけ）", r.body.available === false && rBody.body.available === false, { h: r.body, b: rBody.body });

r = await call("storeBillingStatus", {}, "admin");
t("P8 代表：カード登録の状態は available:true・mode live・カード未登録", r.code === 200 && r.body.available === true && r.body.mode === "live" && r.body.card === null, r.body);
t("P9 応答に代表のメールアドレス・判定の印を出さない", !JSON.stringify(r.body).includes(ADMIN) && !JSON.stringify(r.body).includes("cardLiveTrial") && !JSON.stringify(r.body).includes("adm1"), r.body);
const c1 = await start("admin", CARDS.visa);
t("P10 代表：カード登録の開始は 200・mode live・本番の公開キー・Stripe の顧客の作成は live の印", c1.code === 200 && c1.body.mode === "live" && c1.body.publishableKey === FAKE_LIVE_PK && /^seti_/.test(c1.body.setupIntentId) && ST.calls.slice(callsBefore).join(",") === "POST /v1/customers,POST /v1/setup_intents" && ST.auth.slice(callsBefore).every((a) => a === "Bearer " + FAKE_LIVE_RK), { body: c1.body, calls: ST.calls.slice(callsBefore) });
t("P11 保存先は accountBilling/{代表の uid}.live だけ（test の区画は作らない）", billing("adm1") && billing("adm1").live && billing("adm1").live.pendingSetupIntentId === c1.body.setupIntentId && !billing("adm1").test, billing("adm1"));
const f1 = await confirm(c1.body.setupIntentId, "admin");
const live1 = (billing("adm1") || {}).live || {};
t("P12 代表：確定は 200 succeeded・Stripe に照会して live にカード（VISA 4242）・cardVersion 1・登録中の ID は空", f1.code === 200 && f1.body.status === "succeeded" && live1.paymentMethodId === "pm_" + c1.body.setupIntentId && live1.card.last4 === "4242" && live1.cardVersion === 1 && live1.pendingSetupIntentId === "", { f1: f1.body, live1 });
const again = await confirm(c1.body.setupIntentId, "admin");
t("P13 二重処理：同じ SetupIntent の確定を繰り返しても 409 setup_intent_mismatch・cardVersion は 1 のまま", again.code === 409 && again.body.reason === "setup_intent_mismatch" && billing("adm1").live.cardVersion === 1, again.body);
resetRate(); ST.nextCard = CARDS.mc;
const s2 = await call("storeBillingSetupIntentCreate", {}, "admin");
const s2b = await call("storeBillingSetupIntentCreate", {}, "admin");
t("P14 二重処理：続けての開始は 429 rate_limited（Stripe に2つ目を作らない）", s2.code === 200 && s2b.code === 429 && s2b.body.reason === "rate_limited", { s2: s2.code, s2b: s2b.body });
const [fa, fb] = await Promise.all([confirm(s2.body.setupIntentId, "admin"), confirm(s2.body.setupIntentId, "admin")]);
const live2 = billing("adm1").live;
t("P15 二重処理：カード変更の確定を同時に2回送っても1回だけ反映（cardVersion 2・Mastercard 4444・旧カードは取り外し待ち）",
  [fa.code, fb.code].filter((c) => c === 200).length >= 1 && live2.cardVersion === 2 && live2.card.last4 === "4444" && (live2.detachPendingPaymentMethods || []).some((e) => e.paymentMethodId === "pm_" + c1.body.setupIntentId) && !(live2.detachPendingPaymentMethods || []).some((e) => e.paymentMethodId === live2.paymentMethodId), { fa: fa.body, fb: fb.body, live2 });
const other = await confirm(s2.body.setupIntentId, "owner");
t("P16 代表の SetupIntent を一般の店主が確定しようとしても 503（使えない）・代表のカードは変わらない", other.code === 503 && billing("adm1").live.cardVersion === 2, other.body);
t("P17 Stripe へ送ったのはカード登録の操作だけ（支払い PaymentIntent などは0件）・キーは本番の制限付きの偽キーだけ",
  ST.calls.every((c) => /^(POST \/v1\/customers|POST \/v1\/setup_intents|GET \/v1\/setup_intents\/seti_\w+|GET \/v1\/payment_methods\/pm_\w+|POST \/v1\/payment_methods\/pm_\w+\/detach)$/.test(c)) && ST.calls.every((c) => SB.isCardSetupStripeOperation(c.split(" ")[0], c.split(" ")[1].replace(/^\/v1/, ""))) && !ST.calls.some((c) => c.includes("payment_intents")), ST.calls);
const st2 = await call("storeBillingStatus", {}, "admin");
t("P18 代表の状態：live のカード（Mastercard 4444）を表示", st2.body.available === true && st2.body.mode === "live" && st2.body.card && st2.body.card.last4 === "4444", st2.body);

// ===================== R: registration / takeover stay closed in production (everyone) =====================
S.docs.set("submissions/L1", { shopName: "八重瀬の食堂", title: "x", content: "y", address: "沖縄県", latitude: 26.15, longitude: 127.72, status: "approved", isPermanentAd: true, authorType: "shopAd" });
const REG = { storeName: "新しいカフェ", categoryCode: "gourmet", countryCode: "JP", address: "沖縄県島尻郡八重瀬町1-1", sourceLanguage: "ja" };
const storesBefore = [...S.docs.keys()].filter((k) => k.startsWith("storeAccounts/")).length;
resetRate(); r = await call("storeSelfRegister", REG, "owner");
t("R1 一般の店主：店舗の新規登録はサーバーで 409 card_billing_unavailable・店舗は作られない", r.code === 409 && r.body.reason === "card_billing_unavailable", r.body);
resetRate(); r = await call("storeSelfRegister", REG, "admin");
t("R2 代表（本番のカード登録済み）でも、先行テスト中の新規登録は 409 card_billing_unavailable（一般公開まで使わない）", r.code === 409 && r.body.reason === "card_billing_unavailable", r.body);
const CLAIM = { submissionId: "L1", targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "" };
resetRate(); r = await call("storeListingClaimCreate", CLAIM, "owner");
const rA = await call("storeListingClaimCreate", CLAIM, "admin");
t("R3 引き継ぎ：一般の店主・代表とも 409 card_billing_unavailable・紐付け・申請は作られない", r.code === 409 && r.body.reason === "card_billing_unavailable" && rA.code === 409 && rA.body.reason === "card_billing_unavailable" && !S.docs.get("storeListingLinks/L1") && ![...S.docs.keys()].some((k) => k.startsWith("storeListingClaims/")), { o: r.body, a: rA.body });
t("R4 店舗・メンバーの文書は1件も増えない・Google の所在地確認も呼ばない", [...S.docs.keys()].filter((k) => k.startsWith("storeAccounts/")).length === storesBefore && ![...S.docs.keys()].some((k) => k.startsWith("storeMembers/")) && otherNetwork === 0, { otherNetwork });
r = await call("storeUserStatus", {}, "admin");
t("R5 店舗アカウントの状態の応答にも、代表の判定の印・メールアドレスを出さない", r.code === 200 && !JSON.stringify(r.body).includes("cardLiveTrial") && !JSON.stringify(r.body).includes(ADMIN), r.body);

// ===================== V: traveler-facing entry =====================
let pub = await getPublic();
t("V1 Production（先行テスト中）：publicStoreProfiles は listingClaimOpen:false（TOP の「このお店を管理する」を出さない）", pub.code === 200 && pub.body.success === true && pub.body.listingClaimOpen === false && Array.isArray(pub.body.claimedListingIds), pub.body);
setEnv({ VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_TEST_RK, STRIPE_PUBLISHABLE_KEY: FAKE_TEST_PK, ADMIN_EMAIL: ADMIN });
pub = await getPublic();
t("V2 Production 以外：listingClaimOpen:true（従来どおり入口を出す）", pub.code === 200 && pub.body.listingClaimOpen === true, pub.body);
const appJs = readFileSync(join(REPO_DIR, "app.js"), "utf8");
t("V3 app.js：入口は listingClaimOpen が true の時だけ（取得失敗・値なしは出さない）", /let storeListingClaimOpen = false;/.test(appJs) && /nextClaimOpen = data\.listingClaimOpen === true;/.test(appJs) && /storeListingClaimOpen === true;/.test(appJs), "");

// ===================== W: Preview behaviour unchanged =====================
r = await call("storeBillingStatus", {}, "admin");
const rO = await call("storeBillingStatus", {}, "owner2");
t("W1 Preview：代表・一般とも従来どおりテストモード（先行テストは本番だけの仕組み）", r.body.available === true && r.body.mode === "test" && rO.body.available === true && rO.body.mode === "test", { a: r.body, o: rO.body });
setEnv(PROD);

// ===================== F: flags and STEP 44 not mixed in =====================
t("F1 課金・請求・写真の複製のフラグはすべて false", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false && LC.LISTING_PHOTO_COPY_ENABLED === false && LC.LISTING_PHOTO_COPY_PREVIEW_TRIAL === false && SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === false);
// STEP 46｜本番系列(main)の F2・F3 は「STEP 44 のコードが無い」ことを確かめる(代表決定 2026-10-25：STEP 44 を本番へ混ぜない)。
// Preview 系列は STEP 44 を持つため、ここでは「STEP 44 が本番で動かない」ことを確かめる。
const CPB = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CPC = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");
const FTG = await import(REPO_URL + "/api/_lib/firebase-target.js");
t("F2 （Preview 系列）STEP 44 の本番用のスイッチはすべて false・本番の環境では試験用の申込も無効",
  CPB.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === false && CPB.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === false && CPB.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false && CPC.STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === false && FTG.isPreviewStoreCustomPlanTrialEnabled(PROD) === false);
const wf = readFileSync(join(REPO_DIR, ".github", "workflows", "main.yml"), "utf8");
t("F3 （Preview 系列）Preview 用のジョブは preview/stripe-card-setup の手動実行だけ・本番の expire の条件は本番と同じ",
  wf.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/preview/stripe-card-setup'") && wf.includes("if: github.event_name == 'schedule' || github.ref == 'refs/heads/main'"), "");
t("F4 Function の数は11本のまま", readdirSync(join(REPO_DIR, "api")).filter((f) => f.endsWith(".js")).length === 11, readdirSync(join(REPO_DIR, "api")));
t("F5 ログに鍵・代表のメールアドレスを出していない", !logs.some((l) => l.includes(FAKE_LIVE_RK) || l.includes(FAKE_LIVE_PK) || l.includes(ADMIN)), logs.slice(0, 5));

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
