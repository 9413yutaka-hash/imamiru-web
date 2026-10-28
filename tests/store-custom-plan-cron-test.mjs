// STEP 44-C⑤ server: scheduled entry for the monthly ¥100 customization (no admin login, X-Machinau-Cron-Secret).
// Daily: close the previous JST month (with catch-up), apply the 14-day suspension, and plan charges/retries — charges stay
// a dry run while STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED is false (even with a Stripe test key present). Lock, run records,
// failure and re-run. REAL moderate-submission handler on mocked firebase-admin (optimistic-concurrency transactions);
// Stripe is a stub that counts calls. No network, no real services. Fake secrets.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-cron-test.mjs
import { REPO_URL } from "./_paths.mjs";
const ADMIN = "admin@example.com";
const SECRET = "fake-" + "cron-secret-for-tests-0001";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", AI_COLLECT_CRON_SECRET: SECRET, STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKECARDSETUPKEYONLY0001", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKECHARGEKEYFORTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["u1", "u2", "u3", "u4"].map((u) => [u, pw(u, u + "@example.com")]));
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let stripeCalls = 0, otherNetwork = 0;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname === "api.stripe.com") { stripeCalls++; return { ok: false, status: 500, json: async () => ({ error: { type: "api_error" } }) }; }
  otherNetwork++; throw new Error("unexpected network " + url);
};
const jst = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600000;
const DAY = 86400000;
let NOW = jst(2026, 10, 15, 10);
Date.now = () => NOW;
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const CR = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");
const B = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
async function call(body, headers = {}) {
  clearRate();
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...headers }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const CRON = (secret = SECRET) => call({ mode: "storeCustomPlanCron" }, secret === null ? {} : { "x-machinau-cron-secret": secret });
const docs = (prefix) => [...S.docs.entries()].filter(([k]) => k.startsWith(prefix + "/"));
const inv = (id) => S.docs.get("storeCustomPlanInvoices/" + id);
const plan = (id) => S.docs.get("storeCustomPlans/" + id);
const runs = () => docs("storeCustomPlanCronRuns").map(([, v]) => v);

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(jst(2026, 9, 1));
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
function seedStore(id, uid) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 1, categoryCode: "cafe_sweets", description: "無料" + id, moderationStatus: "passed", moderatedText: "無料" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/f.webp", publicId: "machinau_store_profiles/" + id + "/f", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
}
seedStore("S1", "u1"); seedStore("S2", "u2"); seedStore("S3", "u3"); seedStore("S4", "u4");
["u1", "u2", "u3", "u4"].forEach(card);
const SUB = (storeId, token) => call({ mode: "storeCustomPlanSubscribe", storeId, contractModel: "monthly" }, { authorization: "Bearer " + token });

// ===================== helpers / flags =====================
t("H1 前月（日本時間）：12/1 0:05 JST（UTC 11/30 15:05）は 2026-11、11/30 23:55 JST は 2026-10、1/1 0:00 JST は 2026-12", CR.previousJstMonthKey(jst(2026, 12, 1, 0, 5)) === "2026-11" && CR.previousJstMonthKey(jst(2026, 11, 30, 23, 55)) === "2026-10" && CR.previousJstMonthKey(jst(2027, 1, 1)) === "2026-12" && CR.jstDateKey(jst(2026, 12, 1, 0, 5)) === "2026-12-01");
t("H2 合言葉の比較：同じ値だけ一致（空・長さ違い・違う値は不一致）", CR.storeCustomPlanCronSecretsMatch(SECRET, SECRET) && !CR.storeCustomPlanCronSecretsMatch("", SECRET) && !CR.storeCustomPlanCronSecretsMatch(SECRET + "x", SECRET) && !CR.storeCustomPlanCronSecretsMatch("fake-cron-secret-for-tests-0002", SECRET) && !CR.storeCustomPlanCronSecretsMatch(SECRET, ""));
t("H3 定期実行からの請求の許可（STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED）は false・月額プランの3フラグも false", CR.STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === false && B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false && B.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === false && B.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === false);

// ===================== auth / environment =====================
let r = await CRON(null);
t("A1 合言葉の見出しなし：401・何もしない", r.code === 401 && docs("storeCustomPlanCronRuns").length === 0, r.body);
r = await CRON("wrong-" + "secret-value-000000000");
t("A2 合言葉が違う：401・何もしない", r.code === 401 && docs("storeCustomPlanCronRuns").length === 0, r.body);
delete process.env.AI_COLLECT_CRON_SECRET;
r = await CRON();
process.env.AI_COLLECT_CRON_SECRET = SECRET;
t("A3 サーバーに合言葉が設定されていない：503 cron_secret_not_configured・何もしない", r.code === 503 && r.body.reason === "cron_secret_not_configured" && docs("storeCustomPlanCronRuns").length === 0, r.body);
process.env.VERCEL_ENV = "production";
r = await CRON();
process.env.VERCEL_ENV = "preview";
t("A4 Production の環境（締めのフラグ false）：403 cron_disabled・何もしない", r.code === 403 && r.body.reason === "cron_disabled" && docs("storeCustomPlanCronRuns").length === 0 && docs("storeCustomPlanCronLocks").length === 0, r.body);
t("A5 応答に合言葉を含まない", !JSON.stringify(r.body).includes(SECRET));

// ===================== October contracts =====================
NOW = jst(2026, 10, 15, 10);
await SUB("S1", "u1"); await SUB("S2", "u2");
t("O0 10月に S1・S2 が暦月契約（10月の利用月の記録2件）", !!S.docs.get("storeCustomPlanUsage/S1_2026-10") && !!S.docs.get("storeCustomPlanUsage/S2_2026-10"));

// ===================== Nov 1: close October =====================
NOW = jst(2026, 10, 31, 23, 50);
r = await CRON();
t("N0 10/31 23:50 JST の実行：10月はまだ締めない（前月＝9月、請求書0件）", r.code === 200 && r.body.closeMonth === "2026-09" && docs("storeCustomPlanInvoices").length === 0, r.body.steps && r.body.steps.close);
NOW = jst(2026, 11, 1, 0, 10);
r = await CRON();
const run1 = r.body;
t("N1 11/1 0:10 JST の実行：10月を締める（請求書2件・各100円・請求予定日 11/2）・状態 completed", r.code === 200 && run1.status === "completed" && run1.closeMonth === "2026-10" && run1.steps.close.status === "done" && run1.steps.close.invoices.create === 2 && inv("S1_2026-10").amountJpy === 100 && inv("S2_2026-10").chargeScheduledFor === "2026-11-02", run1);
t("N2 請求の対象の判定は試算だけ（請求予定日前なので対象0件・Stripe に通信しない・請求書は closed のまま）", run1.steps.charges.status === "done" && run1.steps.charges.executed === false && run1.steps.charges.blockedReason === "cron_charges_disabled" && run1.steps.charges.dueInvoiceIds.length === 0 && stripeCalls === 0 && inv("S1_2026-10").status === "closed", run1.steps.charges);
t("N3 翌月（11月）の利用月の記録を作る（継続中の S1・S2）", !!S.docs.get("storeCustomPlanUsage/S1_2026-11") && !!S.docs.get("storeCustomPlanUsage/S2_2026-11"));
const rec = runs().find((x) => x.runId === run1.runId);
t("N4 実行の記録（日本時間の日付・前月・手順ごとの結果・Preview 試験の環境）・ロックは解除", !!rec && rec.jstDate === "2026-11-01" && rec.closeMonth === "2026-10" && rec.status === "completed" && rec.environment === "preview_trial" && S.docs.get("storeCustomPlanCronLocks/daily").runId === "", rec);
const invoicesAfter = JSON.stringify(docs("storeCustomPlanInvoices"));
r = await CRON();
t("N5 同じ日にもう一度：新しい請求書0件（already_invoiced 2）・台帳は変わらない・記録は別に残る", r.code === 200 && !r.body.steps.close.invoices.create && r.body.steps.close.invoices.already_invoiced === 2 && JSON.stringify(docs("storeCustomPlanInvoices")) === invoicesAfter && runs().length >= 3, r.body.steps.close);
const both = await Promise.all([CRON(), CRON()]);
const codes = both.map((x) => x.code).sort();
t("N6 同時に2回：1回は実行・もう1回は 409 already_running（何もしない）・台帳は変わらない", JSON.stringify(codes) === "[200,409]" && both.find((x) => x.code === 409).body.reason === "already_running" && JSON.stringify(docs("storeCustomPlanInvoices")) === invoicesAfter, codes);
S.docs.set("storeCustomPlanCronLocks/daily", { runId: "crashed-run", leaseUntil: Timestamp.fromMillis(NOW + 60000) });
r = await CRON();
t("N7 実行中のロック（期限内）がある：409・何もしない", r.code === 409, r.body);
S.docs.set("storeCustomPlanCronLocks/daily", { runId: "crashed-run", leaseUntil: Timestamp.fromMillis(NOW - 1000) });
r = await CRON();
t("N8 途中で止まった実行のロック（期限切れ）：次の実行は続けられる（200）", r.code === 200 && r.body.status === "completed", r.body.status);

// ===================== Nov 2: charges are planned, not executed =====================
NOW = jst(2026, 11, 2, 10);
r = await CRON();
t("C1 11/2：請求予定の2件を対象と判定（S1・S2）・定期実行からは請求しない（試算・Stripe 通信0）・請求書は closed のまま", r.code === 200 && r.body.steps.charges.executed === false && JSON.stringify(r.body.steps.charges.dueInvoiceIds.slice().sort()) === JSON.stringify(["S1_2026-10:charge", "S2_2026-10:charge"]) && stripeCalls === 0 && inv("S1_2026-10").status === "closed" && inv("S2_2026-10").status === "closed", r.body.steps.charges);

// ===================== dunning =====================
const seedInvoice = (id, month, uid, extra) => S.docs.set("storeCustomPlanInvoices/" + id + "_" + month, { storeId: id, month, amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: uid, billingAccountUid: uid, createdInPreview: true, chargeScheduledFor: "2026-10-02", chargeScheduledAt: Timestamp.fromMillis(jst(2026, 10, 2)), chargeAttempt: 1, chargeAttempts: [], chargeMode: "test", ...extra });
S.docs.set("storeCustomPlans/S3", { storeId: "S3", status: "active", ownerUid: "u3", billingAccountUid: "u3", periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(jst(2026, 11, 1, 12)), accessUntil: null, paymentStatus: "past_due", revision: 1 });
seedInvoice("S3", "2026-09", "u3", { status: "payment_failed", firstFailedAt: Timestamp.fromMillis(NOW - 15 * DAY), suspendAt: Timestamp.fromMillis(NOW - DAY), retryCount: 2, nextRetryAt: null });
S.docs.set("storeCustomPlans/S4", { storeId: "S4", status: "active", ownerUid: "u4", billingAccountUid: "u4", periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(jst(2026, 11, 1, 12)), accessUntil: null, paymentStatus: "current", revision: 1 });
seedInvoice("S4", "2026-09", "u4", { status: "requires_action", paymentIntentId: "pi_x", firstFailedAt: Timestamp.fromMillis(NOW - 2 * DAY), suspendAt: Timestamp.fromMillis(NOW + 12 * DAY), nextRetryAt: null });
r = await CRON();
t("D1 未払いの判定：14日を過ぎた S3 は停止（suspended）・猶予中の S4 は past_due・データは保持・Stripe 通信0", r.code === 200 && plan("S3").paymentStatus === "suspended" && plan("S4").paymentStatus === "past_due" && r.body.steps.dunning.suspended === 1 && r.body.steps.dunning.storeCount === 2 && stripeCalls === 0 && plan("S3").status === "active", r.body.steps.dunning);
t("D2 S3 の再試行は使い切り（対象外）・本人認証待ちの S4 は照合（読むだけ）の対象で、新しい請求・再試行の対象にしない", !r.body.steps.charges.dueInvoiceIds.some((x) => x.startsWith("S3_2026-09:")) && r.body.steps.charges.dueInvoiceIds.includes("S4_2026-09:reconcile") && !r.body.steps.charges.dueInvoiceIds.some((x) => /^S4_2026-09:(charge|retry)$/.test(x)), r.body.steps.charges.dueInvoiceIds);
S.docs.set("storeCustomPlanInvoices/S3_2026-09", { ...inv("S3_2026-09"), status: "paid" });
r = await CRON();
t("D3 支払われたら次の実行で再開（current）", plan("S3").paymentStatus === "current" && r.body.steps.dunning.resumed >= 1, r.body.steps.dunning);

// ===================== failure / re-run / catch-up =====================
NOW = jst(2026, 12, 1, 0, 5);
globalThis.__QUERY_FAIL = "storeCustomPlans";
r = await CRON();
delete globalThis.__QUERY_FAIL;
const failedRec = runs().find((x) => x.runId === r.body.runId);
t("F1 契約の読み取りに失敗（締めと未払いの判定が使う storeCustomPlans）：500・状態 failed・失敗した手順（close・dunning）と内容を記録・残りの手順（請求の判定）は実行・ロックは解除", r.code === 500 && r.body.status === "failed" && JSON.stringify(r.body.errors) === '["close","dunning"]' && r.body.steps.close.status === "failed" && r.body.steps.dunning.status === "failed" && r.body.steps.charges.status === "done" && failedRec && failedRec.steps.close.error.message.length > 0 && S.docs.get("storeCustomPlanCronLocks/daily").runId === "", r.body);
t("F2 失敗の記録・応答に合言葉・キーを含まない", !JSON.stringify(failedRec).includes(SECRET) && !/rk_test|sk_test|pk_test/.test(JSON.stringify(failedRec)));
NOW = jst(2026, 12, 3, 9);
r = await CRON();
t("F3 1日の失敗の後、12/3 の実行で11月の締めを取りこぼさず行う（S1・S2 の11月分）", r.code === 200 && r.body.closeMonth === "2026-11" && !!inv("S1_2026-11") && !!inv("S2_2026-11") && inv("S1_2026-11").chargeScheduledFor === "2026-12-02", r.body.steps.close);
r = await CRON();
t("F4 再実行しても11月の請求書は増えない", r.code === 200 && !r.body.steps.close.invoices.create && docs("storeCustomPlanInvoices").filter(([k]) => k.endsWith("_2026-11")).length === 2, r.body.steps.close.invoices);

// ===================== STEP 47-C: account deletion as the last step of the daily run =====================
NOW = jst(2026, 12, 4, 9);
globalThis.__MOCK_TOKENS.ud1 = pw("ud1", "ud1@example.com"); globalThis.__MOCK_TOKENS.ud2 = pw("ud2", "ud2@example.com"); globalThis.__MOCK_TOKENS.ud3 = pw("ud3", "ud3@example.com");
S.docs.set("accountDeletions/ud1", { uid: "ud1", status: "awaiting_settlement", blockers: ["custom_plan_unbilled"], storeIds: [] });
S.docs.set("storeCustomPlanInvoices/SD2_2026-11", { storeId: "SD2", billingAccountUid: "ud2", status: "payment_failed" });
S.docs.set("accountDeletions/ud2", { uid: "ud2", status: "awaiting_settlement", blockers: ["custom_plan_invoice_unsettled"], storeIds: [] });
S.docs.set("storeCustomPlanInvoices/SD3_2026-11", { storeId: "SD3", billingAccountUid: "ud3", status: "processing" });
S.docs.set("accountDeletions/ud3", { uid: "ud3", status: "awaiting_settlement", blockers: ["custom_plan_invoice_unsettled"], storeIds: [] });
r = await CRON();
const del47 = r.body.steps && r.body.steps.accountDeletion;
t("G1 47-C：毎日の定期実行の最後（締め・未払いの判定・請求の後）に、清算が済んだ退会を自動で最終削除する", r.code === 200 && JSON.stringify(Object.keys(r.body.steps)) === JSON.stringify(["close", "dunning", "charges", "accountDeletion"]) && del47 && del47.counts.completed === 1 && S.docs.get("accountDeletions/ud1").status === "completed" && (globalThis.__MOCK_AUTH_DELETED || []).includes("ud1"), { steps: r.body.steps && Object.keys(r.body.steps), del47 });
t("G2 47-C：未払い（payment_failed）・請求の処理中（processing）の退会は削除しない（清算待ちのまま・ログインは残る）", S.docs.get("accountDeletions/ud2").status === "awaiting_settlement" && S.docs.get("accountDeletions/ud3").status === "awaiting_settlement" && !(globalThis.__MOCK_AUTH_DELETED || []).some((u) => u === "ud2" || u === "ud3"), { ud2: S.docs.get("accountDeletions/ud2"), ud3: S.docs.get("accountDeletions/ud3") });
t("G3 47-C：定期実行の応答・記録に uid・メールアドレスを含めない（件数だけ）", !/ud1|ud2|ud3|@example/.test(JSON.stringify(r.body)) && !/ud1|@example/.test(JSON.stringify(runs().find((x) => x.runId === r.body.runId))), del47);
S.docs.set("accountDeletions/ud4", { uid: "ud4", status: "card_detach_failed", storeIds: [] });
r = await CRON();
t("G4 47-C：運営の対応が必要な異常（カードの取り外しで停止）を見つけた最初の実行は 500 operator_attention_required（定期実行の失敗のメールで知らせる）・種類と件数だけ", r.code === 500 && r.body.reason === "operator_attention_required" && r.body.steps.accountDeletion.operatorAttention.card_detach_failed === 1 && !/ud4/.test(JSON.stringify(r.body)), r.body.steps && r.body.steps.accountDeletion);
r = await CRON();
t("G5 47-C：同じ異常では二度と 500 にしない（重複の通知をしない）", r.code === 200 && Object.keys(r.body.steps.accountDeletion.operatorAttention).length === 0, r.body.steps && r.body.steps.accountDeletion);

t("Z1 Stripe への通信は0回（定期実行からは請求しない）・Stripe 以外の通信なし", stripeCalls === 0 && otherNetwork === 0, { stripeCalls, otherNetwork });
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
