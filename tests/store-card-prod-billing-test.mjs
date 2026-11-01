// STEP 52-A: store card ¥100/month — the Production sign-up and charge paths exist but stay closed until the
// representative approves the start of billing (all switches false). Production charges use only the live
// restricted charge key (rk_live_ + pk_live_ + STRIPE_MODE live) and never charge Preview-made invoices.
// Just for Now billing (readStripeChargeConfig) is unchanged: still disabled in Production.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin. No network: Stripe is a counting stub.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-prod-billing-test.mjs
import { REPO_URL } from "./_paths.mjs";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const PROD_ENV = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, PROD_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKECHARGEKEYFORTESTS001" });
const pw = (uid) => ({ uid, email: uid + "@example.com", email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1"), u2: pw("u2") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const stripeCalls = [];
globalThis.fetch = async (url) => {
  if (String(url).includes("stripe.com")) { stripeCalls.push(String(url)); throw new Error("stripe must not be called in this test"); }
  throw new Error("unexpected network " + url);
};
const { Timestamp, getFirestore } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const CH = await import(REPO_URL + "/api/_lib/store-custom-plan-charge.js");
const B = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CR = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(body, uid) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(uid ? { authorization: "Bearer " + uid } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const LIVE = { VERCEL_ENV: "production", STRIPE_MODE: "live", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "live_FAKECHARGEKEYFORTESTS001", STRIPE_PUBLISHABLE_KEY: "pk_" + "live_FAKEPUBKEYFORTESTS0001" };
const SECRET = LIVE.STRIPE_CHARGE_RESTRICTED_KEY;

// ===================== A. all switches stay false =====================
t("A1 申込受付の開始：本番の申込・本番のカード登録・月末締めの書き込み・請求・定期実行の請求（STEP 53）は true／今だけ投稿の請求は false（STEP 52-F：本番のカード登録・本番の申込は受付開始のため true）",
  B.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === true && B.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === true && B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === true && CR.STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === true && SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === true && IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false);

// ===================== L. live charge config (store card only) =====================
const lc = (env) => SB.readStripeLiveChargeConfig(env);
t("L1 本番の請求用の設定：Production・STRIPE_MODE live・rk_live_・pk_live_ がそろった時だけ ok（mode live）", lc(LIVE).ok === true && lc(LIVE).mode === "live" && lc(LIVE).purpose === "charge");
t("L2 Production 以外（Preview）では使えない", lc({ ...LIVE, VERCEL_ENV: "preview" }).reason === "live_charge_production_only" && lc({ ...LIVE, VERCEL_ENV: undefined }).ok === false);
t("L3 権限の広い sk_live_ は拒否・テストキー・公開可能キーの不一致・live 以外のモード・キー未設定は不可",
  lc({ ...LIVE, STRIPE_CHARGE_RESTRICTED_KEY: "sk_" + "live_FAKE" }).reason === "server_key_not_restricted_live" && lc({ ...LIVE, STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKE" }).reason === "server_key_not_restricted_live" && lc({ ...LIVE, STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKE" }).reason === "key_mode_mismatch" && lc({ ...LIVE, STRIPE_MODE: "test" }).reason === "not_configured" && lc({ ...LIVE, STRIPE_CHARGE_RESTRICTED_KEY: "" }).reason === "charge_key_not_configured");
t("L4 カード登録用のキー（STRIPE_RESTRICTED_KEY）には切り替えない", lc({ VERCEL_ENV: "production", STRIPE_MODE: "live", STRIPE_RESTRICTED_KEY: "rk_" + "live_CARDKEY", STRIPE_PUBLISHABLE_KEY: LIVE.STRIPE_PUBLISHABLE_KEY }).reason === "charge_key_not_configured");
t("L5 今だけ投稿の請求の設定（readStripeChargeConfig）は本番キーがあっても Production では無効のまま", SB.readStripeChargeConfig(LIVE).ok === false && SB.readStripeChargeConfig(LIVE).reason === "disabled_in_production");
const reasons = JSON.stringify([lc({ ...LIVE, STRIPE_MODE: "test" }), lc({ ...LIVE, STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKE" }), SB.readStripeChargeConfig(LIVE)]);
t("L6 失敗の応答にキーの値を出さない", !reasons.includes(SECRET) && !reasons.includes("FAKEPUBKEY"));

// ===================== G. store card charge gate =====================
const gate = (env, extra = {}) => CH.readStoreCustomPlanChargeGate({ env, ...extra });
t("G1 （STEP 53：請求のスイッチ true）Production・本番の請求専用キーがそろうと本番の設定で請求できる・Preview（試験の環境でない）は charge_disabled のまま", gate(LIVE).ok === true && gate(LIVE).config.mode === "live" && gate({ VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKE", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKE" }).reason === "charge_disabled");
const gl = gate(LIVE, { chargeEnabledOverride: true });
t("G2 （試験でスイッチを true に差し替えた時）Production は本番の設定・mode live・Preview 試験だけの制限なし", gl.ok === true && gl.config.mode === "live" && gl.previewTrialOnly === false, { ok: gl.ok, reason: gl.reason });
t("G3 （スイッチ true でも）Production でテストキーなら請求しない（stripe_unavailable）", gate({ ...LIVE, STRIPE_MODE: "test", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKE", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKE" }, { chargeEnabledOverride: true }).reason === "stripe_unavailable");
t("G4 Preview の試験の経路は今までどおりテストモードだけ（本番キーでは不可）", gate({ ...LIVE, VERCEL_ENV: "preview" }, { isStoreCustomPlanTrialEnabled: () => true }).ok === false && gate({ VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKE", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKE" }, { isStoreCustomPlanTrialEnabled: () => true }).ok === true);

// ===================== R. charge planning in live mode =====================
const db = getFirestore();
const sched = B.storeCustomPlanChargeScheduleFor("2026-10");
const inv = (id, createdInPreview) => S.docs.set("storeCustomPlanInvoices/" + id + "_2026-10", { storeId: id, month: "2026-10", amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: "u1", billingAccountUid: "u1", laterHolderUids: [], usageReason: "continued", createdInPreview, status: "closed", chargeScheduledFor: sched.date, chargeScheduledAt: Timestamp.fromMillis(sched.millis) });
inv("PV", true); inv("PR", false);
const now = () => Date.parse("2026-11-03T10:00:00+09:00");
const before = JSON.stringify([...S.docs.entries()]);
let run = await CH.runStoreCustomPlanCharges(db, { env: LIVE, chargeEnabledOverride: true, now }, { dryRun: true });
const pv = (run.invoices || []).find((e) => e.invoiceId === "PV_2026-10"), pr = (run.invoices || []).find((e) => e.invoiceId === "PR_2026-10");
t("R1 本番の請求（試算）：Preview で作った請求書は請求しない（preview_invoice_in_live）・本番の請求書は請求の対象", run.ok === true && run.mode === "live" && !!pv && pv.plan === "skip" && pv.planReason === "preview_invoice_in_live" && !!pr && pr.plan === "charge", run.invoices);
t("R2 試算では Stripe に通信せず、データも変えない", stripeCalls.length === 0 && JSON.stringify([...S.docs.entries()]) === before);
run = await CH.runStoreCustomPlanCharges(db, { env: { ...LIVE, STRIPE_CHARGE_RESTRICTED_KEY: "" }, now }, { dryRun: false });
t("R3 請求専用キーが未登録の Production（スイッチ true）：実行は stripe_unavailable（charge_key_not_configured）・Stripe に通信しない・データを変えない", run.ok === false && run.reason === "stripe_unavailable" && run.detail === "charge_key_not_configured" && stripeCalls.length === 0 && JSON.stringify([...S.docs.entries()]) === before, run);

// ===================== P. Production sign-up stays closed =====================
S.docs.set("storeAccounts/SP", { storeName: "店SP", registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
S.docs.set("storeMembers/SP_u1", { uid: "u1", storeId: "SP", role: "owner", status: "active" });
let r = await call({ mode: "storeCustomProfileGet", storeId: "SP" }, "u1");
t("P1 Production：画面の目安は「申込できる」（signupAvailable true）・保存・編集はできる（STEP 52-F：本番のカード登録・本番の申込は受付開始のため true）", r.code === 200 && r.body.plan.signupAvailable === true && r.body.editable === true, r.body && r.body.plan);
r = await call({ mode: "storeCustomPlanSubscribe", storeId: "SP", planConsentVersion: B.STORE_CARD_PLAN_CONSENT_VERSION }, "u1");
t("P2 Production：申込の受付は開いている・本番のカードが無ければ 403 card_required・契約を作らない（STEP 52-F：本番のカード登録・本番の申込は受付開始のため true）", r.code === 403 && r.body.reason === "card_required" && !S.docs.has("storeCustomPlans/SP"), r.body);
t("P3 このテストの間、Stripe へは一度も通信していない", stripeCalls.length === 0);

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
