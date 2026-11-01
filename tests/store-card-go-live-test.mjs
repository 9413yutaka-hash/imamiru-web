// STEP 53: store card ¥100/month — the Production billing flow with every store card switch on (stage 1 + stage 2):
// sign-up on Production with a live card -> month-end close on the 1st (JST) -> charge on the 2nd from the scheduled
// entry (storeCustomPlanCron) with the live restricted charge key only -> retries 3 and 7 days after the first
// failure -> suspension (card hidden from travelers) 14 days after -> resume after the owner pays.
// Also: no live key -> no charge, Preview never charges from these switches, imadake / deletion sweep stay off.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin and an in-memory Stripe stub.
// No network, no real Stripe. Fake keys only.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-go-live-test.mjs
import { REPO_URL } from "./_paths.mjs";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const LIVE_CHARGE_KEY = "rk_" + "live_FAKECHARGEKEYFORTESTS001", LIVE_CARD_KEY = "rk_" + "live_FAKECARDSETUPKEYONLY01", LIVE_PK = "pk_" + "live_FAKEPUBKEYFORTESTS0001";
const SECRET = "fake-cron-secret-for-tests-0001";
const PROD_ENV = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", AI_COLLECT_CRON_SECRET: SECRET, STRIPE_MODE: "live", STRIPE_RESTRICTED_KEY: LIVE_CARD_KEY, STRIPE_CHARGE_RESTRICTED_KEY: LIVE_CHARGE_KEY, STRIPE_PUBLISHABLE_KEY: LIVE_PK };
Object.assign(process.env, PROD_ENV);
const pw = (uid) => ({ uid, email: uid + "@example.com", email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1"), u2: pw("u2") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const jst = (s) => Date.parse(s + "+09:00");
let NOW = jst("2026-11-05T10:00:00");
Date.now = () => NOW;

// ---- Stripe stub (PaymentIntents only; answers only the live charge key) ----
const ST = { pis: new Map(), idem: new Map(), calls: [], auth: new Set(), creates: [], modes: new Map(), seq: 0, otherHosts: 0 };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") { ST.otherHosts++; throw new Error("unexpected host " + u.hostname); }
  ST.calls.push(opts.method + " " + u.pathname);
  ST.auth.add((opts.headers || {}).Authorization);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + LIVE_CHARGE_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/payment_intents") {
    const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
    const key = (opts.headers || {})["Idempotency-Key"] || "";
    if (key && ST.idem.has(key)) { const c = ST.idem.get(key); return json(c.status, c.data); }
    const queue = ST.modes.get(form.customer) || [];
    const mode = queue.shift() || "succeed";
    const id = "pi_live" + ++ST.seq;
    const status = mode === "succeed" ? "succeeded" : "requires_payment_method";
    const pi = { id, object: "payment_intent", amount: Number(form.amount), currency: form.currency, customer: form.customer, payment_method: form.payment_method, status, created: Math.floor(Date.now() / 1000), metadata: { invoiceId: form["metadata[invoiceId]"], storeId: form["metadata[storeId]"], month: form["metadata[month]"], chargeAttempt: form["metadata[chargeAttempt]"], machinauProduct: form["metadata[machinauProduct]"] }, last_payment_error: mode === "succeed" ? null : { type: "card_error", code: "card_declined", decline_code: "insufficient_funds" } };
    ST.pis.set(id, pi); ST.creates.push(form);
    const data = mode === "succeed" ? pi : { error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", payment_intent: pi } };
    const code = mode === "succeed" ? 200 : 402;
    if (key) ST.idem.set(key, { status: code, data });
    return json(code, data);
  }
  const m = u.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
  if (opts.method === "GET" && m) { const pi = ST.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error", code: "resource_missing" } }); }
  if (opts.method === "GET" && u.pathname === "/v1/payment_intents") {
    const customer = u.searchParams.get("customer"), gte = Number(u.searchParams.get("created[gte]"));
    return json(200, { object: "list", data: [...ST.pis.values()].filter((p) => p.customer === customer && p.created >= gte).reverse(), has_more: false });
  }
  return json(404, { error: { type: "invalid_request_error" } });
};

const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const B = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CR = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");
const CH = await import(REPO_URL + "/api/_lib/store-custom-plan-charge.js");
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const SD = await import(REPO_URL + "/api/_lib/store-account-deletion.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const MCL = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
async function call(body, token, headers = {}) {
  clearRate();
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}), ...headers }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const CRON = () => call({ mode: "storeCustomPlanCron" }, null, { "x-machinau-cron-secret": SECRET });
async function publicIds() {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "GET", headers: {}, query: { mode: "publicStoreProfiles" } }, r); } finally { console.error = e; }
  return JSON.stringify(r.body || {});
}
const inv = (id) => S.docs.get("storeCustomPlanInvoices/" + id) || {};
const plan = (id) => S.docs.get("storeCustomPlans/" + id) || {};
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const DAY = 86400000;

// ---- fixtures: two owners with a live card each (in-memory mock only) ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(jst("2026-10-01T00:00:00"));
for (const [id, uid] of [["G1", "u1"], ["G2", "u2"]]) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 1, categoryCode: "cafe_sweets", description: "紹介文" + id, moderationStatus: "passed", moderatedText: "紹介文" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/f.webp", publicId: "machinau_store_profiles/" + id + "/f", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
  S.docs.set("accountBilling/" + uid, { uid, live: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
}
S.docs.set("imadakeMonthlyInvoices/G1_2026-11", { storeId: "G1", month: "2026-11", status: "closed", lineCount: 1, amountJpy: 100, currency: "JPY", taxIncluded: true });
const IMADAKE_BEFORE = JSON.stringify(S.docs.get("imadakeMonthlyInvoices/G1_2026-11"));

// ===================== S. switches =====================
t("S1 店舗カードのスイッチ：申込・締め・請求・定期実行の請求は true（STEP 53）・本番のカード登録 true",
  B.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === true && B.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === true && B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === true && CR.STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === true && SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === true);
t("S2 今だけ投稿の請求・締め・課金開始と、退会の本番の自動の最終削除は false のまま",
  IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && MCL.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && SD.ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED === false && SD.isAccountDeletionSweepAllowed(PROD_ENV) === false);

// ===================== K. the key / environment guards =====================
const gate = (env) => CH.readStoreCustomPlanChargeGate({ env });
t("K1 Production・本番の請求専用キー（rk_live_）・pk_live_・STRIPE_MODE live がそろうと請求できる（mode live・Preview 試験の制限なし）", gate(PROD_ENV).ok === true && gate(PROD_ENV).config.mode === "live" && gate(PROD_ENV).previewTrialOnly === false && gate(PROD_ENV).config.serverKey === LIVE_CHARGE_KEY);
t("K2 請求専用キーが未登録の Production（今の本番）は請求しない（stripe_unavailable・charge_key_not_configured）", gate({ ...PROD_ENV, STRIPE_CHARGE_RESTRICTED_KEY: "" }).ok === false && gate({ ...PROD_ENV, STRIPE_CHARGE_RESTRICTED_KEY: "" }).detail === "charge_key_not_configured");
t("K3 権限の広い sk_live_・テストキー・テストモードの Production は請求しない",
  gate({ ...PROD_ENV, STRIPE_CHARGE_RESTRICTED_KEY: "sk_" + "live_FAKE" }).ok === false && gate({ ...PROD_ENV, STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKE" }).ok === false && gate({ ...PROD_ENV, STRIPE_MODE: "test" }).ok === false);
t("K4 請求のスイッチは Production だけに効く：Preview（試験の環境でない）は charge_disabled・試験の環境はテストキーの試験の経路だけ",
  gate({ VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKE", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKE" }).reason === "charge_disabled" &&
  CH.readStoreCustomPlanChargeGate({ env: { VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKE", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKE" }, isStoreCustomPlanTrialEnabled: () => true }).previewTrialOnly === true &&
  gate({ ...PROD_ENV, VERCEL_ENV: "preview" }).ok === false);

// ===================== U. sign-up on Production (live card) =====================
let r = await call({ mode: "storeCustomPlanSubscribe", storeId: "G1", planConsentVersion: B.STORE_CARD_PLAN_CONSENT_VERSION }, "u1");
t("U1 本番の申込：本番のカード登録済みの店主は同意つきで申し込める（monthly・createdInPreview false）", r.code === 200 && plan("G1").periodKind === "monthly" && plan("G1").createdInPreview === false && plan("G1").ownerUid === "u1", r.body);
NOW = jst("2026-11-20T15:00:00");
r = await call({ mode: "storeCustomPlanSubscribe", storeId: "G2", planConsentVersion: B.STORE_CARD_PLAN_CONSENT_VERSION }, "u2");
t("U2 2店目も申込（11月20日・日割りなし）", r.code === 200 && plan("G2").periodKind === "monthly", r.body);
t("U3 申込では Stripe に通信しない", ST.calls.length === 0, ST.calls);

// ===================== C. month-end close on December 1 (JST) =====================
NOW = jst("2026-11-30T23:59:00");
r = await CRON();
t("C1 11月30日 23:59（日本時間）の定期実行：11月はまだ締めない（10月分の締めの対象なし）・請求なし", r.code === 200 && r.body.closeMonth === "2026-10" && !S.docs.has("storeCustomPlanInvoices/G1_2026-11") && ST.calls.length === 0, r.body);
NOW = jst("2026-12-01T10:10:00");
r = await CRON();
t("C2 12月1日 10:10 の定期実行：11月を締める・G1・G2 とも100円（税込）・請求予定は 12月2日・まだ請求しない（予定日前）",
  r.code === 200 && r.body.closeMonth === "2026-11" && inv("G1_2026-11").amountJpy === 100 && inv("G2_2026-11").amountJpy === 100 && inv("G1_2026-11").taxIncluded === true && inv("G1_2026-11").chargeScheduledFor === "2026-12-02" && inv("G1_2026-11").status === "closed" && r.body.steps.charges.executed === true && r.body.steps.charges.totals.chargeCount === 0 && ST.calls.length === 0, r.body);
t("C3 12月の利用月の記録も継続中の2店に作る（翌月の初めの契約者に結び付ける）", !!S.docs.get("storeCustomPlanUsage/G1_2026-12") && !!S.docs.get("storeCustomPlanUsage/G2_2026-12"));
const closedSnapshot = JSON.stringify([inv("G1_2026-11"), inv("G2_2026-11")]);
NOW = jst("2026-12-01T13:10:00");
r = await CRON();
t("C4 同じ日にもう一度（13:10）：請求書は店舗・月で1件のまま・内容も変わらない", r.code === 200 && JSON.stringify([inv("G1_2026-11"), inv("G2_2026-11")]) === closedSnapshot && [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanInvoices/")).length === 2);

// ===================== P. charge on December 2 =====================
ST.modes.set("cus_u2", ["decline", "decline", "decline", "decline"]);
NOW = jst("2026-12-02T10:10:00");
r = await CRON();
t("P1 12月2日 10:10 の定期実行：本番の請求を実行（executed・対象2件）", r.code === 200 && r.body.steps.charges.executed === true && r.body.steps.charges.blockedReason === "" && r.body.steps.charges.totals.chargeCount === 2, r.body.steps);
const g1Create = ST.creates.find((f) => f["metadata[storeId]"] === "G1");
t("P2 Stripe へ送る内容：100円・JPY・カードを保存した顧客と支払い方法・オフセッション・店舗カードの商品・11月分", !!g1Create && g1Create.amount === "100" && g1Create.currency === "jpy" && g1Create.customer === "cus_u1" && g1Create.payment_method === "pm_u1" && g1Create.off_session === "true" && g1Create.confirm === "true" && g1Create["metadata[machinauProduct]"] === "store_custom_plan" && g1Create["metadata[month]"] === "2026-11", g1Create);
t("P3 請求に使うのは請求専用キーだけ（カード登録用のキーは使わない）・Stripe への呼び出しは PaymentIntent の作成・照会・一覧だけ",
  [...ST.auth].every((a) => a === "Bearer " + LIVE_CHARGE_KEY) && ST.calls.every((x) => /^(POST \/v1\/payment_intents|GET \/v1\/payment_intents(\/pi_[A-Za-z0-9_]+)?)$/.test(x)) && ST.otherHosts === 0, { auth: [...ST.auth].map((a) => String(a).slice(0, 15)), calls: [...new Set(ST.calls)] });
t("P4 G1 は支払い済み（paid）・G2 は支払い失敗（payment_failed・再試行は初回失敗の3日後）", inv("G1_2026-11").status === "paid" && inv("G2_2026-11").status === "payment_failed" && ms(inv("G2_2026-11").nextRetryAt) === ms(inv("G2_2026-11").firstFailedAt) + 3 * DAY && ms(inv("G2_2026-11").suspendAt) === ms(inv("G2_2026-11").firstFailedAt) + 14 * DAY, inv("G2_2026-11"));
t("P5 G2 の契約は未払い（past_due）・まだ公開は止めない（14日の猶予）", plan("G2").paymentStatus === "past_due" && (plan("G1").paymentStatus || "current") === "current", { g1: plan("G1").paymentStatus, g2: plan("G2").paymentStatus });
const createsAfterFirst = ST.creates.length;
NOW = jst("2026-12-02T13:10:00");
r = await CRON();
t("P6 同じ日にもう一度：新しい請求をしない（G1 は支払い済み・G2 は再試行の予定日前）", r.code === 200 && ST.creates.length === createsAfterFirst && inv("G1_2026-11").status === "paid", r.body.steps.charges);

// ===================== R. retries on day 3 and day 7 =====================
NOW = jst("2026-12-05T10:10:00");
r = await CRON();
t("R1 12月5日（初回失敗の3日後）：1回目の再試行・また失敗・次は7日後", ST.creates.length === createsAfterFirst + 1 && inv("G2_2026-11").retryCount === 1 && inv("G2_2026-11").status === "payment_failed" && ms(inv("G2_2026-11").nextRetryAt) === ms(inv("G2_2026-11").firstFailedAt) + 7 * DAY, inv("G2_2026-11"));
NOW = jst("2026-12-09T10:10:00");
r = await CRON();
t("R2 12月9日（7日後）：2回目の再試行・また失敗・自動の再試行はここまで", ST.creates.length === createsAfterFirst + 2 && inv("G2_2026-11").retryCount === 2 && inv("G2_2026-11").status === "payment_failed", inv("G2_2026-11"));
NOW = jst("2026-12-12T10:10:00");
r = await CRON();
t("R3 その後の定期実行では自動で請求しない（retries_exhausted）・G1 には二重に請求しない", ST.creates.length === createsAfterFirst + 2 && ST.creates.filter((f) => f["metadata[storeId]"] === "G1").length === 1, ST.creates.length);
t("R4 14日前は停止しない（past_due のまま・公開は続く）", plan("G2").paymentStatus === "past_due" && (await publicIds()).includes("G2"));

// ===================== X. suspension on day 14 and resume =====================
NOW = jst("2026-12-16T10:10:00");
r = await CRON();
t("X1 12月16日（初回失敗の14日後）：G2 は停止（suspended）・旅行者に公開しない・G1 は公開のまま", plan("G2").paymentStatus === "suspended" && !(await publicIds()).includes("G2") && (await publicIds()).includes("G1"), plan("G2"));
NOW = jst("2027-01-01T10:10:00");
r = await CRON();
t("X2 1月1日の締め：G1・G2 とも12月分100円（G2 は12月の初めに契約中だったため・日割りなし）・停止中の G2 には1月の利用月の記録を作らない", r.code === 200 && inv("G1_2026-12").amountJpy === 100 && inv("G2_2026-12").amountJpy === 100 && inv("G1_2026-12").chargeScheduledFor === "2027-01-02" && !!S.docs.get("storeCustomPlanUsage/G1_2027-01") && !S.docs.get("storeCustomPlanUsage/G2_2027-01"), r.body.steps.close);
ST.modes.set("cus_u2", ["succeed"]);
NOW = jst("2027-01-01T12:00:00");
r = await call({ mode: "storeCustomPlanPayNow", invoiceId: "G2_2026-11" }, "u2");
t("X3 店主が未払いを今すぐ支払う（本番の請求専用キー）：支払い済み・停止を解除（current）・公開を再開", r.code === 200 && inv("G2_2026-11").status === "paid" && plan("G2").paymentStatus === "current" && (await publicIds()).includes("G2"), { body: r.body, inv: inv("G2_2026-11").status, plan: plan("G2").paymentStatus });
t("X4 合計の請求：G1 は11月分1回、G2 は失敗3回＋支払い1回（同じ請求書を二重に支払わない）", ST.creates.filter((f) => f["metadata[storeId]"] === "G1").length === 1 && ST.creates.filter((f) => f["metadata[storeId]"] === "G2").length === 4 && ST.creates.filter((f) => f["metadata[storeId]"] === "G2" && f["metadata[month]"] === "2026-11").length === 4);

// ===================== O. other products / records =====================
t("O1 今だけ投稿の請求書は変わらない", JSON.stringify(S.docs.get("imadakeMonthlyInvoices/G1_2026-11")) === IMADAKE_BEFORE);
const runs = [...S.docs.entries()].filter(([k]) => k.startsWith("storeCustomPlanCronRuns/"));
t("O2 定期実行の記録：本番として記録・退会の最終削除の手順なし・失敗なし・合言葉を含まない", runs.length >= 10 && runs.every(([, v]) => v.environment === "production" && !v.steps.accountDeletion && v.errors.length === 0) && !JSON.stringify(runs).includes(SECRET) && !JSON.stringify(runs).includes(LIVE_CHARGE_KEY), runs.length);

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
