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
// Stripe の模擬：既定は 500（呼ばれた時点で失敗が分かる）。"decline" の時だけ、請求を始めた後の試験のためにカードの拒否を返す。
let stripeMode = "error500", piSeq = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.includes("stripe.com")) { other.push(u); throw new Error("unexpected network " + u); }
  stripe.push((opts.method || "GET") + " " + new URL(u).pathname);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (stripeMode !== "decline") return json(500, { error: { type: "api_error" } });
  if ((opts.method || "GET") === "GET") return json(200, { object: "list", data: [], has_more: false });
  const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
  const pi = { id: "pi_off" + ++piSeq, object: "payment_intent", amount: Number(form.amount), currency: form.currency, customer: form.customer, status: "requires_payment_method", created: Math.floor(Date.now() / 1000), metadata: { invoiceId: form["metadata[invoiceId]"], chargeAttempt: form["metadata[chargeAttempt]"] } };
  return json(402, { error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", payment_intent: pi } });
};
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
t("P1 12月2日の定期実行（請求予定日）：請求の対象（G1 の11月分・1件）を判定するが請求しない（executed false・charge_disabled）・Stripe への通信0・請求書は closed のまま", r.code === 200 && r.body.steps.charges.executed === false && r.body.steps.charges.blockedReason === "charge_disabled" && r.body.steps.charges.totals.chargeCount === 1 && r.body.steps.charges.totals.plannedAmountJpy === 100 && stripe.length === 0 && inv("G1_2026-11").status === "closed" && (inv("G1_2026-11").chargeAttempt || 0) === 0, r.body.steps.charges);

// ===================== path 2: operator manual run =====================
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: false }, "admin");
t("P2 運営の「請求を実行」：403 charge_disabled・Stripe への通信0・請求書は変わらない", r.code === 403 && r.body.reason === "charge_disabled" && stripe.length === 0 && inv("G1_2026-11").status === "closed", r.body);
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: false, approveLateInvoiceIds: ["G1_2026-11"] }, "admin");
t("P2b 運営の「確認して請求」（遅れて確定した請求書の指定）も 403 charge_disabled・Stripe への通信0", r.code === 403 && r.body.reason === "charge_disabled" && stripe.length === 0, r.body);
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: true }, "admin");
t("P2c STEP 53-J：運営の「請求の試算」は本番の請求書を数える（対象1件・請求予定額100円）・実行は止まっていることを別に返す（charge_disabled）・読むだけ・Stripe への通信0", r.code === 200 && r.body.dryRun === true && r.body.executionAllowed === false && r.body.executionBlockedReason === "charge_disabled" && r.body.totals.chargeCount === 1 && r.body.totals.plannedAmountJpy === 100 && stripe.length === 0, r.body.totals);
S.docs.set("storeCustomPlanInvoices/PV_2026-11", { ...inv("G1_2026-11"), storeId: "PV", createdInPreview: true });
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: true }, "admin");
t("P2d 試算で Preview で作った請求書は数えない（preview_invoice_in_live）", r.code === 200 && r.body.totals.chargeCount === 1 && r.body.invoices.some((x) => x.invoiceId === "PV_2026-11" && x.planReason === "preview_invoice_in_live"), r.body.totals);
S.docs.delete("storeCustomPlanInvoices/PV_2026-11");

// ===================== path 3: owner pay-now / 3-D Secure =====================
const sched = B.storeCustomPlanChargeScheduleFor("2026-10");
S.docs.set("storeCustomPlans/G2", { storeId: "G2", status: "active", ownerUid: "u2", billingAccountUid: "u2", periodKind: "monthly", createdInPreview: false, subscribedAt: Timestamp.fromMillis(jst("2026-10-05T10:00:00")), accessUntil: null, paymentStatus: "past_due", revision: 1 });
S.docs.set("storeCustomPlanInvoices/G2_2026-10", { storeId: "G2", month: "2026-10", amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: "u2", billingAccountUid: "u2", laterHolderUids: [], usageReason: "subscribed", createdInPreview: false, status: "payment_failed", closedAt: Timestamp.fromMillis(jst("2026-11-01T10:10:00")), chargeScheduledFor: sched.date, chargeScheduledAt: Timestamp.fromMillis(sched.millis), chargeAttempt: 1, chargeAttempts: [], paymentIntentId: "pi_failed_old", chargeOutcomeUnknown: false, retryCount: 2, firstFailedAt: Timestamp.fromMillis(jst("2026-11-26T10:10:00")), nextRetryAt: null, suspendAt: Timestamp.fromMillis(jst("2026-12-10T10:10:00")) });
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
t("D1 完成形 A：請求を止めている間は、以前の支払い失敗（G2・停止の予定日 12月10日）があっても新しく停止しない（past_due のまま）・止めた時刻を請求書に記録・Stripe への通信0", r.body.steps.dunning.chargesPaused === true && plan("G2").paymentStatus === "past_due" && inv("G2_2026-10").suspendPausedAt && inv("G2_2026-10").suspendPausedAt.toMillis() === NOW && stripe.length === 0, { dunning: r.body.steps && r.body.steps.dunning, ps: plan("G2").paymentStatus });
const pausedAtMs = NOW;
const ownerView = CH.describeOwnerPlanInvoice("G2_2026-10", inv("G2_2026-10"), "店G2", false);
t("D1h 止めている間の店主の表示：停止の予定日を出さず「受付を一時停止・公開は止まらない」の案内（今すぐ支払うは出さない）", ownerView.suspendAtMillis === 0 && ownerView.suspendPaused === true && ownerView.canPayNow === false && ownerView.unpaid === true, ownerView);
NOW = jst("2026-12-10T10:10:00");
r = await CRON();
t("D1b 止めている間に停止の予定日（12月10日）を迎えても停止しない・止めた時刻は最初の時刻のまま", plan("G2").paymentStatus === "past_due" && inv("G2_2026-10").suspendPausedAt.toMillis() === pausedAtMs, plan("G2").paymentStatus);
// 既に停止中の契約は、請求を止めてもそのまま（支払えた期間の停止は取り消さない）。
S.docs.set("storeCustomPlans/GS", { storeId: "GS", status: "active", ownerUid: "u2", billingAccountUid: "u2", periodKind: "monthly", createdInPreview: false, subscribedAt: Timestamp.fromMillis(jst("2026-09-05T10:00:00")), accessUntil: null, paymentStatus: "suspended", revision: 1 });
S.docs.set("storeCustomPlanInvoices/GS_2026-09", { ...inv("G2_2026-10"), storeId: "GS", month: "2026-09", suspendPausedAt: null, suspendAt: Timestamp.fromMillis(jst("2026-10-20T10:10:00")) });
const { getFirestore: gf } = await import("firebase-admin/firestore");
await CH.refreshStoreCustomPlanPaymentStatus(gf(), "GS", NOW, { chargesPaused: true });
t("D1c 既に停止中の契約は、請求を止めている間もそのまま（suspended）", plan("GS").paymentStatus === "suspended", plan("GS").paymentStatus);
// 再開（請求の許可がある状態を chargesPaused false で再現）：止めていた時間だけ停止の予定日を後ろへずらす。
const suspendBefore = inv("G2_2026-10").suspendAt.toMillis();
const resumeAt = jst("2026-12-15T10:10:00");
await CH.refreshStoreCustomPlanPaymentStatus(gf(), "G2", resumeAt, { chargesPaused: false });
const shifted = inv("G2_2026-10").suspendAt.toMillis();
t("D1d 請求を再開した時：止めていた期間を理由に即時停止しない（past_due）・停止の予定日を止めていた時間だけ後ろへ（累計を記録・止めた時刻は消す）", plan("G2").paymentStatus === "past_due" && shifted === suspendBefore + (resumeAt - pausedAtMs) && inv("G2_2026-10").suspendPausedTotalMs === resumeAt - pausedAtMs && !inv("G2_2026-10").suspendPausedAt, { ps: plan("G2").paymentStatus, shifted, suspendBefore });
const remainingBefore = suspendBefore - pausedAtMs;
t("D1e 店主に残る猶予は、止める前と同じ長さ（止めた時点の残り＝再開後の残り）", shifted - resumeAt === remainingBefore, { remainingBefore, after: shifted - resumeAt });
await CH.refreshStoreCustomPlanPaymentStatus(gf(), "G2", shifted - 1000, { chargesPaused: false });
const beforeDue = plan("G2").paymentStatus;
await CH.refreshStoreCustomPlanPaymentStatus(gf(), "G2", shifted, { chargesPaused: false });
t("D1f ずらした予定日の前は停止しない・予定日を過ぎても未払いなら停止（支払い失敗による停止の仕様は請求が有効な間は維持）", beforeDue === "past_due" && plan("G2").paymentStatus === "suspended", { beforeDue, after: plan("G2").paymentStatus });
S.docs.set("storeCustomPlanInvoices/G2_2026-10", { ...inv("G2_2026-10"), status: "paid" });
S.docs.set("storeCustomPlanInvoices/G2_2026-09", { ...inv("G2_2026-09"), status: "paid" });
await CH.refreshStoreCustomPlanPaymentStatus(gf(), "G2", shifted + 1000, { chargesPaused: false });
t("D1g 支払いが済めば再開（current）", plan("G2").paymentStatus === "current", plan("G2").paymentStatus);
// ===================== no suspension while charges are off =====================
NOW = jst("2026-12-20T10:10:00");
r = await CRON();
t("O1 STEP 53-J：請求を止めている間は、請求予定日から14日以上たっても G1 を停止しない（請求していないので未払いの扱いにならない・current のまま・請求書は closed のまま）", r.body.steps.dunning.status === "done" && (plan("G1").paymentStatus || "current") === "current" && inv("G1_2026-11").status === "closed" && !inv("G1_2026-11").suspendAt && stripe.length === 0, { ps: plan("G1").paymentStatus, st: inv("G1_2026-11").status });
// 承認後（スイッチ true を差し替えで再現）に最初の請求が失敗した場合：14日はこの失敗から数える＝止めていた期間を理由に即時停止しない。
stripeMode = "decline";
const { getFirestore } = await import("firebase-admin/firestore");
const on = await (async () => { const e = console.error; console.error = () => {}; try { return await CH.runStoreCustomPlanCharges(getFirestore(), { env: ENV, fetch: (...a) => globalThis.fetch(...a), now: () => NOW, chargeEnabledOverride: true }, { dryRun: false, month: "2026-11" }); } finally { console.error = e; } })();
t("O2 請求を始めた後の最初の失敗（12月20日）：支払い失敗・停止の予定は失敗の日から14日後（1月3日）・すぐには停止しない（past_due）", on.ok === true && inv("G1_2026-11").status === "payment_failed" && inv("G1_2026-11").suspendAt.toMillis() === inv("G1_2026-11").firstFailedAt.toMillis() + 14 * 86400000 && inv("G1_2026-11").firstFailedAt.toMillis() === NOW && plan("G1").paymentStatus === "past_due", { inv: inv("G1_2026-11").status, ps: plan("G1").paymentStatus });
stripeMode = "error500";
const stripeBeforeMonitor = stripe.length;
const st = await GET({ mode: "storeCardCronStatus" });
t("D2 外部監視の状態の URL は 200（定期実行は正常に成功している）", st.code === 200 && st.body.ok === true, st.body);
const health = await call({ mode: "adminStoreCustomPlanCronHealth" }, "admin");
t("D3 運営の画面の「定期実行は動いています」も今までどおり", health.code === 200 && health.body.ok === true, health.body);
t("D4 請求を止めている間（O2 の差し替え以外）、Stripe への通信は一度もない・Stripe 以外への通信もない", stripe.length === stripeBeforeMonitor && stripe.every((x) => /payment_intents/.test(x)) && other.length === 0, { stripe, other });

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
