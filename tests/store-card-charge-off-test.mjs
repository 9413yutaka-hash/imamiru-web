// STEP 53-I: the Production store card charge switch (STORE_CUSTOM_PLAN_CHARGE_ENABLED) stays false until the
// representative approves. Even with every live key set (including STRIPE_CHARGE_RESTRICTED_KEY), no path sends a
// charge to Stripe: the scheduled entry, the operator's manual run (and the late-invoice approval), the owner's
// pay-now and 3-D Secure start. Month-end close, dunning, run records and the monitor keep working.
// REAL code (no switch override). REAL moderate-submission handler on mocked firebase-admin. Stripe is a counting stub.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-charge-off-test.mjs
import { REPO_URL } from "./_paths.mjs";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const SECRET = "fake-store-card-billing-secret-0003";
const ENV = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", AI_COLLECT_CRON_SECRET: "fake-ai-collect-secret-0003", STORE_CARD_BILLING_CRON_SECRET: SECRET, STRIPE_MODE: "live", STRIPE_RESTRICTED_KEY: "rk_" + "live_FAKECARDKEY0003", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "live_FAKECHARGEKEY0003", STRIPE_PUBLISHABLE_KEY: "pk_" + "live_FAKEPUBKEY0003" };
Object.assign(process.env, ENV);
const pw = (uid, email) => ({ uid, email: email || uid + "@example.com", email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1"), u2: pw("u2"), admin: pw("adm1", "admin@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const stripe = [], other = [];
globalThis.fetch = async (url) => { const u = String(url); if (u.includes("stripe.com")) { stripe.push(u); return { ok: false, status: 500, json: async () => ({ error: { type: "api_error" } }) }; } other.push(u); throw new Error("unexpected network " + u); };
const jst = (s) => Date.parse(s + "+09:00");
let NOW = jst("2026-11-10T12:00:00");
Date.now = () => NOW;
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const B = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CH = await import(REPO_URL + "/api/_lib/store-custom-plan-charge.js");
const CR = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(body, token, headers = {}) {
  for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k);
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}), ...headers }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function GET(query) { const r = res(); const e = console.error; console.error = () => {}; try { await handler({ method: "GET", headers: {}, query }, r); } finally { console.error = e; } return r; }
const CRON = () => call({ mode: "storeCustomPlanCron" }, null, { "x-machinau-cron-secret": SECRET });
const inv = (id) => S.docs.get("storeCustomPlanInvoices/" + id) || {};
const plan = (id) => S.docs.get("storeCustomPlans/" + id) || {};

// ---- fixtures: owners with a live card ----
for (const [id, uid] of [["G1", "u1"], ["G2", "u2"]]) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("accountBilling/" + uid, { uid, live: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
}

// ===================== switches =====================
t("W1 本番の請求のスイッチ false・遅れて確定した請求書の自動請求 false・今だけ投稿の請求は false のまま・締め・定期実行は true", B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false && CH.STORE_CUSTOM_PLAN_LATE_AUTO_CHARGE_ENABLED === false && IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && B.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === true && CR.STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === true);
t("W2 本番の請求専用キー（rk_live_）・pk_live_・STRIPE_MODE live がそろっていても、請求の許可は charge_disabled", SB.readStripeLiveChargeConfig(ENV).ok === true && CH.readStoreCustomPlanChargeGate({ env: ENV }).ok === false && CH.readStoreCustomPlanChargeGate({ env: ENV }).reason === "charge_disabled");

// ===================== sign-up and month-end close keep working =====================
let r = await call({ mode: "storeCustomPlanSubscribe", storeId: "G1", planConsentVersion: B.STORE_CARD_PLAN_CONSENT_VERSION }, "u1");
t("C1 申込は今までどおり（本番のカードで月額契約を作る）", r.code === 200 && plan("G1").periodKind === "monthly", r.body);
NOW = jst("2026-12-01T10:10:00");
r = await CRON();
t("C2 12月1日の定期実行：11月を締める（100円・請求予定 12月2日）・実行の記録・停止の検知の記録は今までどおり", r.code === 200 && inv("G1_2026-11").amountJpy === 100 && inv("G1_2026-11").chargeScheduledFor === "2026-12-02" && S.docs.has("storeCustomPlanCronHealth/production") && [...S.docs.keys()].some((k) => k.startsWith("storeCustomPlanCronRuns/")), r.body);

// ===================== path 1: scheduled entry =====================
NOW = jst("2026-12-02T10:10:00");
r = await CRON();
t("P1 12月2日の定期実行（請求予定日）：請求しない（executed false・charge_disabled）・Stripe への通信0・請求書は closed のまま", r.code === 200 && r.body.steps.charges.executed === false && r.body.steps.charges.blockedReason === "charge_disabled" && stripe.length === 0 && inv("G1_2026-11").status === "closed" && (inv("G1_2026-11").chargeAttempt || 0) === 0, r.body.steps.charges);

// ===================== path 2: operator manual run =====================
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: false }, "admin");
t("P2 運営の「請求を実行」：403 charge_disabled・Stripe への通信0・請求書は変わらない", r.code === 403 && r.body.reason === "charge_disabled" && stripe.length === 0 && inv("G1_2026-11").status === "closed", r.body);
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: false, approveLateInvoiceIds: ["G1_2026-11"] }, "admin");
t("P2b 運営の「確認して請求」（遅れて確定した請求書の指定）も 403 charge_disabled・Stripe への通信0", r.code === 403 && r.body.reason === "charge_disabled" && stripe.length === 0, r.body);
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: true }, "admin");
// 事実：請求の許可が無い間の試算は、従来から Preview 試験の請求書だけを対象に数える（本番の請求書は対象0件と表示）。
t("P2c 運営の「請求の試算」は読むだけ（実行は許可されていない＝charge_disabled・Stripe への通信0）", r.code === 200 && r.body.dryRun === true && r.body.executionAllowed === false && r.body.executionBlockedReason === "charge_disabled" && stripe.length === 0, r.body.totals);

// ===================== path 3: owner pay-now / 3-D Secure =====================
const sched = B.storeCustomPlanChargeScheduleFor("2026-10");
S.docs.set("storeCustomPlans/G2", { storeId: "G2", status: "active", ownerUid: "u2", billingAccountUid: "u2", periodKind: "monthly", createdInPreview: false, subscribedAt: Timestamp.fromMillis(jst("2026-10-05T10:00:00")), accessUntil: null, paymentStatus: "past_due", revision: 1 });
S.docs.set("storeCustomPlanInvoices/G2_2026-10", { storeId: "G2", month: "2026-10", amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: "u2", billingAccountUid: "u2", laterHolderUids: [], usageReason: "subscribed", createdInPreview: false, status: "payment_failed", closedAt: Timestamp.fromMillis(jst("2026-11-01T10:10:00")), chargeScheduledFor: sched.date, chargeScheduledAt: Timestamp.fromMillis(sched.millis), chargeAttempt: 1, chargeAttempts: [], paymentIntentId: "pi_failed_old", chargeOutcomeUnknown: false, retryCount: 2, firstFailedAt: Timestamp.fromMillis(jst("2026-11-02T10:10:00")), nextRetryAt: null, suspendAt: Timestamp.fromMillis(jst("2026-11-16T10:10:00")) });
S.docs.set("storeCustomPlanInvoices/G2_2026-09", { ...S.docs.get("storeCustomPlanInvoices/G2_2026-10"), month: "2026-09", status: "requires_action", paymentIntentId: "pi_needs_auth_old" });
const g2Before = JSON.stringify([inv("G2_2026-10"), inv("G2_2026-09")]);
r = await call({ mode: "storeCustomPlanPayNow", invoiceId: "G2_2026-10" }, "u2");
t("P3 店主の「今すぐ支払う」：受け付けない（成功にしない）・Stripe への通信0・請求書は変わらない", r.code !== 200 && stripe.length === 0 && inv("G2_2026-10").status === "payment_failed", { code: r.code, body: r.body });
r = await call({ mode: "storeCustomPlanPaymentStart", invoiceId: "G2_2026-09" }, "u2");
t("P3b 店主の本人認証の開始（3-D Secure）も受け付けない・Stripe への通信0", r.code !== 200 && stripe.length === 0, { code: r.code, body: r.body });
t("P3c 支払いの操作で請求書の内容は変わらない", JSON.stringify([inv("G2_2026-10"), inv("G2_2026-09")]) === g2Before);

// ===================== dunning, records and the monitor keep working =====================
NOW = jst("2026-12-03T10:10:00");
r = await CRON();
t("D1 未払いの判定は今までどおり（14日を過ぎた G2 は停止）・Stripe への通信0", r.code !== 401 && plan("G2").paymentStatus === "suspended" && stripe.length === 0, { code: r.code, dunning: r.body.steps && r.body.steps.dunning });
const st = await GET({ mode: "storeCardCronStatus" });
t("D2 外部監視の状態の URL は 200（定期実行は正常に成功している）", st.code === 200 && st.body.ok === true, st.body);
const health = await call({ mode: "adminStoreCustomPlanCronHealth" }, "admin");
t("D3 運営の画面の「定期実行は動いています」も今までどおり", health.code === 200 && health.body.ok === true, health.body);
t("D4 このテストの間、Stripe への通信は一度もない・Stripe 以外への通信もない", stripe.length === 0 && other.length === 0, { stripe, other });

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
