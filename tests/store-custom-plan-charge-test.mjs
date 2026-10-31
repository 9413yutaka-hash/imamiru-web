// STEP 44-C④ server: monthly ¥100 customization — Stripe PaymentIntent charge of the plan ledger, retries (3/7 days),
// suspension at 14 days, resume, 3-D Secure with the same PaymentIntent, owner pay-now, card change, unknown outcomes,
// cancel while unpaid, old owner's debt. REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin
// and an in-memory Stripe stub that replays idempotent responses like Stripe API v1. No network, no real Stripe. Fake keys.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-charge-test.mjs
import { REPO_URL } from "./_paths.mjs";
const ADMIN = "admin@example.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const FAKE_CHARGE_KEY = "rk_" + "test_FAKECHARGEKEYFORTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKECARDSETUPKEYONLY0001", STRIPE_CHARGE_RESTRICTED_KEY: FAKE_CHARGE_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["u1", "u2", "u3", "u4", "u5", "u6", "u7"].map((u) => [u, pw(u, u + "@example.com")]));
globalThis.__MOCK_TOKENS.admin = pw("adm1", ADMIN);
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const jst = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600000;
const DAY = 86400000;
let NOW = jst(2026, 11, 2, 10, 0);
Date.now = () => NOW;

// ---- Stripe stub ----
const ST = { pis: new Map(), idem: new Map(), calls: [], creates: 0, modes: [], seq: 0, listFail: 0, retrieveFail: 0, otherHosts: 0 };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") { ST.otherHosts++; throw new Error("unexpected host " + u.hostname); }
  ST.calls.push(opts.method + " " + u.pathname);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + FAKE_CHARGE_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/payment_intents") {
    const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
    const key = (opts.headers || {})["Idempotency-Key"] || "";
    if (key && ST.idem.has(key)) { const c = ST.idem.get(key); if (c.body !== opts.body) return json(400, { error: { type: "idempotency_error", code: "idempotency_key_in_use" } }); return json(c.status, c.data); }
    const mode = ST.modes.shift() || "succeed";
    const mkPi = (status, lastError) => {
      const id = "pi_plan" + ++ST.seq;
      const pi = { id, object: "payment_intent", amount: Number(form.amount), currency: form.currency, customer: form.customer, payment_method: form.payment_method, status, client_secret: id + "_secret_FAKE", created: Math.floor(Date.now() / 1000), metadata: { invoiceId: form["metadata[invoiceId]"], storeId: form["metadata[storeId]"], month: form["metadata[month]"], chargeAttempt: form["metadata[chargeAttempt]"], machinauProduct: form["metadata[machinauProduct]"] }, last_payment_error: lastError || null, offSession: form.off_session };
      ST.pis.set(id, pi); ST.creates++; return pi;
    };
    const cache = (status, data) => { if (key) ST.idem.set(key, { status, data, body: opts.body }); return json(status, data); };
    if (mode === "succeed") return cache(200, mkPi("succeeded"));
    if (mode === "decline") { const pi = mkPi("requires_payment_method", { type: "card_error", code: "card_declined", decline_code: "insufficient_funds" }); return cache(402, { error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", payment_intent: pi } }); }
    if (mode === "auth_required") { const pi = mkPi("requires_payment_method", { type: "card_error", code: "authentication_required", decline_code: "authentication_required" }); return cache(402, { error: { type: "card_error", code: "authentication_required", decline_code: "authentication_required", payment_intent: pi } }); }
    if (mode === "network_after_create") { const pi = mkPi("succeeded"); ST.idem.set(key, { status: 200, data: pi, body: opts.body }); throw new Error("socket hang up"); }
    if (mode === "500_cached") return cache(500, { error: { type: "api_error" } });
    throw new Error("bad mode " + mode);
  }
  let m = u.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
  if (opts.method === "GET" && m && ST.retrieveFail > 0) { ST.retrieveFail--; throw new Error("socket hang up"); }
  if (opts.method === "GET" && m) { const pi = ST.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error", code: "resource_missing" } }); }
  if (opts.method === "GET" && u.pathname === "/v1/payment_intents") {
    if (ST.listFail > 0) { ST.listFail--; throw new Error("ETIMEDOUT"); }
    const customer = u.searchParams.get("customer"), gte = Number(u.searchParams.get("created[gte]"));
    return json(200, { object: "list", data: [...ST.pis.values()].filter((p) => p.customer === customer && p.created >= gte).reverse(), has_more: false });
  }
  return json(404, { error: { type: "invalid_request_error" } });
};

const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const CH = await import(REPO_URL + "/api/_lib/store-custom-plan-charge.js");
const B = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
async function call(body, token) {
  clearRate();
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function publicList() { const r = res(); const e = console.error; console.error = () => {}; try { await handler({ method: "GET", headers: {}, query: { mode: "publicStoreProfiles" } }, r); } finally { console.error = e; } return r; }
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const inv = (id) => S.docs.get("storeCustomPlanInvoices/" + id);
const plan = (id) => S.docs.get("storeCustomPlans/" + id);
const billing = (uid) => S.docs.get("accountBilling/" + uid);
const RUN = (extra = {}) => call({ mode: "adminStoreCustomPlanCharge", dryRun: false, ...extra }, "admin");

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(jst(2026, 9, 1));
const card = (uid, pm = "pm_" + uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: pm, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
function seedStore(id, uid) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 1, categoryCode: "cafe_sweets", description: "無料の紹介文" + id, moderationStatus: "passed", moderatedText: "無料の紹介文" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/f.webp", publicId: "machinau_store_profiles/" + id + "/f", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
  S.docs.set("storeCustomPlans/" + id, { storeId: id, status: "active", ownerUid: uid, billingAccountUid: uid, periodKind: "monthly", createdInPreview: true, subscribedAt: at, accessUntil: null, paymentStatus: "current", revision: 1 });
  S.docs.set("storeCustomProfiles/" + id, { storeId: id, revision: 1, menuItems: [{ name: "商品" + id, description: "", priceText: "", photo: null }], links: [], story: "", moderationStatus: "passed", moderatedText: "商品" + id });
}
function seedInvoice(id, month, uid, extra = {}) {
  const sched = B.storeCustomPlanChargeScheduleFor(month);
  S.docs.set("storeCustomPlanInvoices/" + id + "_" + month, { storeId: id, month, amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: uid, billingAccountUid: uid, laterHolderUids: [], usageReason: "continued", createdInPreview: true, status: "closed", closedAt: Timestamp.fromMillis(jst(2026, 11, 1, 0, 30)), chargeScheduledFor: sched.date, chargeScheduledAt: Timestamp.fromMillis(sched.millis), chargeAttempt: 0, chargeAttempts: [], paymentIntentId: "", chargeCustomerId: "", chargePaymentMethodId: "", chargeCardVersion: null, chargeOutcomeUnknown: false, firstFailedAt: null, nextRetryAt: null, suspendAt: null, lastError: null, ...extra });
}
for (const [id, uid] of [["A", "u1"], ["Bf", "u2"], ["C3", "u3"], ["D", "u4"], ["E", "u5"]]) { seedStore(id, uid); card(uid); seedInvoice(id, "2026-10", uid); }
S.docs.set("imadakeMonthlyInvoices/A_2026-10", { storeId: "A", month: "2026-10", status: "closed", lineCount: 1, amountJpy: 100, currency: "JPY", taxIncluded: true });
const IMADAKE_BEFORE = JSON.stringify(S.docs.get("imadakeMonthlyInvoices/A_2026-10"));

// ===================== gate =====================
t("G1 実行の許可：Preview 試験の経路（Preview・対象ブランチ・machinau-preview・テストキー）だけ。Production・テスト以外のキーは不可", CH.readStoreCustomPlanChargeGate({ env: process.env, isStoreCustomPlanTrialEnabled: () => true }).ok === true && CH.readStoreCustomPlanChargeGate({ env: process.env, isStoreCustomPlanTrialEnabled: () => false }).reason === "charge_disabled" && CH.readStoreCustomPlanChargeGate({ env: { ...process.env, VERCEL_ENV: "production" }, isStoreCustomPlanTrialEnabled: () => true }).ok === false && CH.readStoreCustomPlanChargeGate({ env: { ...process.env, STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "live_FAKELIVEKEY000001" }, isStoreCustomPlanTrialEnabled: () => true }).ok === false && B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false);
process.env.VERCEL_ENV = "production";
let r = await RUN();
process.env.VERCEL_ENV = "preview";
t("G2 Production の環境：請求の実行は 403 charge_disabled・Stripe に通信しない", r.code === 403 && r.body.reason === "charge_disabled" && ST.calls.length === 0, r.body);
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: false }, "u1");
t("G3 店主のアカウントでは請求を実行できない", (r.code === 401 || r.code === 403) && ST.calls.length === 0, r.code);

// ===================== dry run / schedule =====================
NOW = jst(2026, 11, 1, 23, 0);
r = await call({ mode: "adminStoreCustomPlanCharge" }, "admin");
t("P0 請求予定日（11/2）より前の試算：5件とも before_scheduled_date・Stripe に通信しない", r.code === 200 && r.body.dryRun === true && r.body.invoices.every((x) => x.plan === "skip" && x.planReason === "before_scheduled_date") && ST.calls.length === 0, r.body);
NOW = jst(2026, 11, 2, 10, 0);
r = await call({ mode: "adminStoreCustomPlanCharge" }, "admin");
t("P1 請求予定日の試算：5件・500円を請求予定・書き込みなし", r.code === 200 && r.body.totals.chargeCount === 5 && r.body.totals.plannedAmountJpy === 500 && r.body.executionAllowed === true && ST.calls.length === 0 && inv("A_2026-10").status === "closed", r.body.totals);

// ===================== first charge: success / decline / auth / unknown =====================
ST.modes = ["succeed", "decline", "auth_required", "network_after_create", "succeed"]; // order of invoice ids: A, Bf, C3, D, E
r = await RUN();
const a = inv("A_2026-10"), b = inv("Bf_2026-10"), c = inv("C3_2026-10"), d = inv("D_2026-10"), e = inv("E_2026-10");
t("C1 初回の決済成功：paid・PaymentIntent・請求時のカード・試行の記録・ロック解除", a.status === "paid" && /^pi_plan/.test(a.paymentIntentId) && a.chargePaymentMethodId === "pm_u1" && a.chargeCustomerId === "cus_u1" && a.chargeAttempts.length === 1 && a.chargeAttempts[0].result === "paid" && !Object.keys(billing("u1").test.billingLocks || {}).length && ms(a.paidAt) === NOW, a);
const piA = ST.pis.get(a.paymentIntentId);
t("C2 Stripe への支払い：100円・JPY・契約者の顧客とカード・off_session・metadata の請求書IDは前置き付き（今だけ投稿と取り違えない）", piA.amount === 100 && piA.currency === "jpy" && piA.customer === "cus_u1" && piA.payment_method === "pm_u1" && piA.offSession === "true" && piA.metadata.invoiceId === "storeCustomPlan:A_2026-10" && piA.metadata.machinauProduct === "store_custom_plan" && ST.idem.has("machinau-plan-test-A_2026-10-1"), piA);
t("C3 決済失敗：payment_failed・初回失敗の時刻・再試行の予定（3日後）・停止の予定（14日後）・ロック解除", b.status === "payment_failed" && ms(b.firstFailedAt) === NOW && ms(b.nextRetryAt) === NOW + 3 * DAY && ms(b.suspendAt) === NOW + 14 * DAY && b.retryCount === 0 && !Object.keys(billing("u2").test.billingLocks || {}).length, b);
t("C4 本人認証が必要：requires_action・自動の再試行なし（nextRetryAt なし）・停止の予定は14日後・カードはロックで守る", c.status === "requires_action" && c.nextRetryAt === null && ms(c.suspendAt) === NOW + 14 * DAY && !!(billing("u3").test.billingLocks || {})["storeCustomPlan:C3_2026-10"], c);
t("C5 結果不明（作成後に通信切断）：charging のまま・結果不明の印・ロックを残す・送り直さない", d.status === "charging" && d.chargeOutcomeUnknown === true && !!(billing("u4").test.billingLocks || {})["storeCustomPlan:D_2026-10"], d);
t("C6 店舗ごとに別々の請求（E は成功）・今だけ投稿の請求書（同じ形の ID）は変わらない", e.status === "paid" && JSON.stringify(S.docs.get("imadakeMonthlyInvoices/A_2026-10")) === IMADAKE_BEFORE, e.status);
t("C7 契約の支払いの状態：失敗・本人認証待ちの店舗は past_due（利用は続く）・成功は current", plan("Bf").paymentStatus === "past_due" && plan("C3").paymentStatus === "past_due" && plan("A").paymentStatus === "current" && r.body.paymentStatuses.Bf === "past_due", { Bf: plan("Bf").paymentStatus, C3: plan("C3").paymentStatus });
let pl = await publicList();
t("C8 猶予中（past_due）は旅行者に有料の内容を表示し続ける", !!pl.body.stores.find((s) => s.id === "sp_Bf").custom);

// ===================== double run / unknown =====================
const createsBefore = ST.creates;
r = await RUN();
t("D1 すぐにもう一度実行：支払い済み・失敗（再試行の前）・本人認証待ちに新しい支払いを作らない・結果不明は照合（一覧で見つけて paid）", ST.creates === createsBefore && inv("A_2026-10").status === "paid" && inv("Bf_2026-10").status === "payment_failed" && inv("D_2026-10").status === "paid" && inv("D_2026-10").chargeOutcomeUnknown === false && !Object.keys(billing("u4").test.billingLocks || {}).length, { creates: ST.creates - createsBefore, d: inv("D_2026-10").status });
const both = await Promise.all([RUN(), RUN()]);
t("D2 同時に2回実行しても新しい支払いは作らない", ST.creates === createsBefore && both.every((x) => x.code === 200), both.map((x) => x.code));

// ===================== retries =====================
NOW = jst(2026, 11, 5, 9, 0);
r = await RUN();
t("R0 3日後の前（11/5 9:00、予定は 11/5 10:00）：再試行しない", inv("Bf_2026-10").chargeAttempt === 1 && inv("Bf_2026-10").retryCount === 0, inv("Bf_2026-10"));
NOW = jst(2026, 11, 5, 10, 0);
ST.modes = ["decline"];
r = await RUN();
let bf = inv("Bf_2026-10");
t("R1 3日後の再試行（試行2・新しい冪等キー）も失敗：retryCount 1・次は初回失敗から7日後・停止の予定は変わらない", bf.status === "payment_failed" && bf.chargeAttempt === 2 && bf.retryCount === 1 && ms(bf.nextRetryAt) === jst(2026, 11, 2, 10) + 7 * DAY && ms(bf.suspendAt) === jst(2026, 11, 2, 10) + 14 * DAY && ST.idem.has("machinau-plan-test-Bf_2026-10-2"), bf);
NOW = jst(2026, 11, 9, 10, 0);
ST.modes = ["decline"];
r = await RUN();
bf = inv("Bf_2026-10");
t("R2 7日後の再試行（試行3）も失敗：retryCount 2・それ以上の自動の再試行なし", bf.status === "payment_failed" && bf.chargeAttempt === 3 && bf.retryCount === 2 && bf.nextRetryAt === null, bf);
const c2 = ST.creates;
NOW = jst(2026, 11, 12);
r = await RUN();
t("R3 再試行を使い切った後は自動で送らない（retries_exhausted）", ST.creates === c2 && r.body.invoices.find((x) => x.invoiceId === "Bf_2026-10").planReason === "retries_exhausted", r.body.invoices.find((x) => x.invoiceId === "Bf_2026-10"));

// ===================== suspension at 14 days =====================
NOW = jst(2026, 11, 16, 9, 0);
r = await RUN();
t("S0 14日の直前（11/16 9:00）は停止しない（past_due）", plan("Bf").paymentStatus === "past_due");
NOW = jst(2026, 11, 16, 10, 0);
r = await RUN();
pl = await publicList();
const bfPub = pl.body.stores.find((s) => s.id === "sp_Bf");
// STEP 50-B(代表決定 2026-10-31)｜停止中は店舗カード自体を旅行者に出さない(データは保持)。
t("S1 初回失敗から14日：paymentStatus suspended・店舗カードを旅行者に出さない(STEP 50-B)・データは保持", plan("Bf").paymentStatus === "suspended" && ms(plan("Bf").suspendedAt) === NOW && !bfPub && !!S.docs.get("storeCustomProfiles/Bf") && plan("Bf").status === "active", { plan: plan("Bf"), bfPub });
t("S2 本人認証待ちのまま14日の C3 も停止", plan("C3").paymentStatus === "suspended");
let g = await call({ mode: "storeCustomProfileGet", storeId: "Bf" }, "u2");
t("S3 停止中：利用権なし・保存済みの内容の編集はできる（STEP 50-D）（契約の状態は active のまま・支払いの状態は suspended）", g.body.plan.access === false && g.body.editable === true && g.body.plan.state === "active" && g.body.plan.paymentStatus === "suspended", g.body.plan);

// ===================== owner: invoice list / pay now / resume =====================
let l = await call({ mode: "storeCustomPlanInvoiceList" }, "u2");
const bfRow = l.body.invoices[0];
t("O1 店主の請求一覧：未払い100円・支払いに失敗・今すぐ支払える・カード・顧客・支払いの ID・client_secret を含まない", l.code === 200 && l.body.unpaidTotalJpy === 100 && bfRow.status === "payment_failed" && bfRow.unpaid === true && bfRow.canPayNow === true && bfRow.storeName === "店Bf" && !/pm_|cus_|pi_|secret/.test(JSON.stringify(l.body)), l.body);
r = await call({ mode: "storeCustomPlanPayNow", invoiceId: "Bf_2026-10" }, "u1");
t("O2 他のアカウントの請求書は支払えない・存在も分からない（404）", r.code === 404 && r.body.reason === "invoice_not_found", r.body);
card("u2", "pm_u2new");
ST.modes = ["succeed"];
r = await call({ mode: "storeCustomPlanPayNow", invoiceId: "Bf_2026-10" }, "u2");
bf = inv("Bf_2026-10");
t("O3 店主が新しいカードで今すぐ支払う：paid（試行4・新しいカード）・停止を解除して再開（current・resumedAt）", r.code === 200 && r.body.status === "paid" && bf.chargeAttempt === 4 && bf.chargePaymentMethodId === "pm_u2new" && plan("Bf").paymentStatus === "current" && ms(plan("Bf").resumedAt) === NOW, { body: r.body, bf: bf.status });
pl = await publicList();
t("O4 再開後は旅行者に有料の内容が戻る", !!pl.body.stores.find((s) => s.id === "sp_Bf").custom);
r = await call({ mode: "storeCustomPlanPayNow", invoiceId: "Bf_2026-10" }, "u2");
t("O5 支払い済みの請求書を「今すぐ支払う」：409・新しい支払いなし", r.code === 409, r.body);

// ===================== 3-D Secure with the same PaymentIntent =====================
const c3 = inv("C3_2026-10");
r = await call({ mode: "storeCustomPlanPaymentStart", invoiceId: "C3_2026-10" }, "u2");
t("A1 他のアカウントは本人認証の情報を受け取れない（404）", r.code === 404, r.body);
r = await call({ mode: "storeCustomPlanPaymentStart", invoiceId: "C3_2026-10" }, "u3");
t("A2 本人認証の準備：既存の PaymentIntent の client_secret・公開キー（pk_test）・カード（新しい支払いは作らない）", r.code === 200 && r.body.clientSecret === c3.paymentIntentId + "_secret_FAKE" && r.body.publishableKey === FAKE_PK && r.body.paymentMethodId === "pm_u3" && ST.pis.size === ST.seq, r.body);
const createsBeforeConfirm = ST.creates;
r = await call({ mode: "storeCustomPlanPaymentConfirm", invoiceId: "C3_2026-10" }, "u3");
t("A3 画面で認証せずに確定を押しても、Stripe の状態（未完了）のまま requires_action（画面の表示で成功にしない）", r.code === 200 && inv("C3_2026-10").status === "requires_action" && plan("C3").paymentStatus === "suspended", { body: r.body, st: inv("C3_2026-10").status });
ST.pis.get(c3.paymentIntentId).status = "succeeded"; // the owner completed 3-D Secure in the browser
r = await call({ mode: "storeCustomPlanPaymentConfirm", invoiceId: "C3_2026-10" }, "u3");
t("A4 認証の完了後の確定：サーバーが同じ PaymentIntent を照会して paid・新しい支払いなし・停止を解除・ロック解除", r.code === 200 && r.body.status === "paid" && inv("C3_2026-10").paymentIntentId === c3.paymentIntentId && ST.creates === createsBeforeConfirm && plan("C3").paymentStatus === "current" && !Object.keys(billing("u3").test.billingLocks || {}).length, { body: r.body });

// ===================== card change while charging =====================
seedInvoice("E", "2026-11", "u5", { chargeScheduledFor: "2026-12-02", chargeScheduledAt: Timestamp.fromMillis(jst(2026, 12, 2)) });
NOW = jst(2026, 12, 2, 10);
const realGet = globalThis.fetch;
let swapped = false;
globalThis.fetch = async (url, opts = {}) => {
  // just before the plan charge sends (during the pre-check list), the owner replaces the card
  if (!swapped && String(url).includes("/v1/payment_intents?") && String(url).includes("cus_u5")) { swapped = true; card("u5", "pm_u5new"); }
  return realGet(url, opts);
};
const cc = ST.creates;
r = await RUN({ month: "2026-11" });
globalThis.fetch = realGet;
let e2 = inv("E_2026-11");
t("K1 請求の直前にカードが変わった：送らない（not_sent、closed に戻す）・古いカードへ請求しない", ST.creates === cc && e2.status === "closed" && e2.chargeNotSentReason === "card_changed_before_send" && !Object.keys(billing("u5").test.billingLocks || {}).length, e2);
ST.modes = ["succeed"];
r = await RUN({ month: "2026-11" });
e2 = inv("E_2026-11");
t("K2 次の実行で新しいカード（正式な請求先）へ請求（試行2）", e2.status === "paid" && e2.chargePaymentMethodId === "pm_u5new" && e2.chargeAttempt === 2 && ST.pis.get(e2.paymentIntentId).payment_method === "pm_u5new", e2);

// ===================== cancel while unpaid / no new charges after cancel =====================
seedInvoice("D", "2026-11", "u4", { chargeScheduledFor: "2026-12-02", chargeScheduledAt: Timestamp.fromMillis(jst(2026, 12, 2)) });
ST.modes = ["decline"];
r = await RUN({ month: "2026-11" });
t("U1 11月分が失敗して past_due", inv("D_2026-11").status === "payment_failed" && plan("D").paymentStatus === "past_due");
NOW = jst(2026, 12, 3);
r = await call({ mode: "storeCustomPlanCancel", storeId: "D" }, "u4");
t("U2 未払い中でも解約できる：canceling（12月末まで）・未払いの請求書はそのまま（削除・減額なし）・支払いの状態は past_due のまま", r.code === 200 && plan("D").status === "canceling" && ms(plan("D").accessUntil) === jst(2027, 1, 1) && inv("D_2026-11").status === "payment_failed" && inv("D_2026-11").amountJpy === 100 && plan("D").paymentStatus === "past_due", { plan: plan("D"), inv: inv("D_2026-11").status });
NOW = jst(2027, 1, 1, 0, 30);
let cl = await call({ mode: "adminStoreCustomPlanMonthlyClose", month: "2026-12", execute: true }, "admin");
t("U3 解約月（12月）は100円、解約の翌月（1月）は0円（利用月の記録を作らない）", !!S.docs.get("storeCustomPlanUsage/D_2026-12") && !S.docs.get("storeCustomPlanUsage/D_2027-01") && !!inv("D_2026-12"), cl.body);
NOW = jst(2027, 1, 2, 10);
ST.modes = ["succeed", "succeed"];
r = await RUN({ month: "2026-11" });
t("U4 解約後も既に発生した未払い（11月分）の再試行は続く（3日後の予定）", inv("D_2026-11").status === "paid" || inv("D_2026-11").retryCount >= 1, inv("D_2026-11"));

// ===================== old owner's debt after an owner change =====================
seedInvoice("A", "2026-11", "u1", { chargeScheduledFor: "2026-12-02", chargeScheduledAt: Timestamp.fromMillis(jst(2026, 12, 2)) });
S.docs.set("storeMembers/A_u1", { uid: "u1", storeId: "A", role: "owner", status: "removed" });
S.docs.set("storeMembers/A_u6", { uid: "u6", storeId: "A", role: "owner", status: "active" });
card("u6");
S.docs.set("storeCustomPlans/A", { ...plan("A"), ownerUid: "u6", billingAccountUid: "u6", paymentStatus: "current" });
ST.modes = ["decline"];
r = await RUN({ month: "2026-11" });
const a11 = inv("A_2026-11");
t("W1 所有者変更後も旧店主の請求書は旧店主（u1）のカードへ請求・新しい owner（u6）のカードは使わない", a11.chargeCustomerId === "cus_u1" && a11.chargePaymentMethodId === "pm_u1" && ST.pis.get(a11.paymentIntentId).customer === "cus_u1", a11);
t("W2 旧店主の未払いは新しい owner の契約を止めない（A の paymentStatus は current のまま）", plan("A").paymentStatus === "current" && a11.status === "payment_failed");
l = await call({ mode: "storeCustomPlanInvoiceList" }, "u1");
const l6 = await call({ mode: "storeCustomPlanInvoiceList" }, "u6");
t("W3 旧店主は自分の未払いを一覧で見られる・新しい owner には見えない", l.body.invoices.some((x) => x.invoiceId === "A_2026-11" && x.unpaid) && !l6.body.invoices.some((x) => x.invoiceId === "A_2026-11"), { u1: l.body.invoices.map((x) => x.invoiceId), u6: l6.body.invoices.map((x) => x.invoiceId) });

// ===================== unknown outcome is never re-sent =====================
seedStore("Z", "u7"); card("u7");
seedInvoice("Z", "2026-09", "u7", { chargeScheduledFor: "2026-10-02", chargeScheduledAt: Timestamp.fromMillis(jst(2026, 10, 2)) });
ST.modes = ["500_cached"];
r = await RUN({ month: "2026-09" });
t("N1 Stripe が 500：結果不明（charging・ロックあり）", inv("Z_2026-09").status === "charging" && inv("Z_2026-09").chargeOutcomeUnknown === true);
const cN = ST.creates;
r = await RUN({ month: "2026-09" });
t("N2 次の実行は照合だけ（一覧に無い → needs_review・新しい支払いを作らない）", inv("Z_2026-09").status === "needs_review" && ST.creates === cN, inv("Z_2026-09").status);
r = await RUN({ month: "2026-09" });
r = await RUN({ month: "2026-09" });
t("N3 人の確認待ちは何度実行しても自動で送り直さない", ST.creates === cN && inv("Z_2026-09").status === "needs_review" && plan("Z").paymentStatus === "current");

// ===================== admin list / flags / isolation =====================
const al = await call({ mode: "adminStoreCustomPlanInvoiceList" }, "admin");
t("L1 運営の請求台帳：決済失敗・結果不明・再試行の状況（試行・再試行・次の再試行・停止の予定）", al.code === 200 && al.body.invoices.some((x) => x.invoiceId === "Bf_2026-10" && x.status === "paid" && x.chargeAttempt === 4 && x.retryCount === 2) && al.body.invoices.some((x) => x.invoiceId === "Z_2026-09" && x.status === "needs_review"), al.body.invoices.slice(0, 3));
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const MCL = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const LC = await import(REPO_URL + "/api/_lib/listing-profile-copy.js");
t("F1 既存の課金関連6フラグ・月額プランの3フラグはすべて false", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && MCL.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === false && LC.LISTING_PHOTO_COPY_ENABLED === false && LC.LISTING_PHOTO_COPY_PREVIEW_TRIAL === false && B.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === false && B.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === false && B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false);
t("F2 今だけ投稿の請求書は変わらない・storeBilling は作らない", JSON.stringify(S.docs.get("imadakeMonthlyInvoices/A_2026-10")) === IMADAKE_BEFORE && ![...S.docs.keys()].some((k) => k.startsWith("storeBilling/")));
t("F3 Stripe への呼び出しは PaymentIntent の作成・照会・一覧だけ・Stripe 以外への通信なし", ST.calls.every((x) => /^(POST \/v1\/payment_intents|GET \/v1\/payment_intents(\/pi_[A-Za-z0-9_]+)?)$/.test(x)) && ST.otherHosts === 0, [...new Set(ST.calls)]);
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
