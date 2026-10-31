// STEP 44-C③ server: monthly ¥100 customization — calendar-month contracts (JST), usage records, month-end close,
// invoice ledger (one per store and month), owner change, unpaid states, flags. No Stripe charge is ever made.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// The clock is controlled (Date.now). run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-billing-test.mjs
import { REPO_URL } from "./_paths.mjs";
const ADMIN = "admin@example.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["u1", "u2", "u3", "u6", "u7", "u8", "u9"].map((u) => [u, pw(u, u + "@example.com")]));
globalThis.__MOCK_TOKENS.admin = pw("adm1", ADMIN);
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let otherNetwork = 0;
globalThis.fetch = async (url) => { otherNetwork++; throw new Error("unexpected network " + url); };
const jst = (y, mo, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(y, mo - 1, d, h, mi, s, ms) - 9 * 3600000;
let NOW = jst(2026, 10, 15, 10, 0);
Date.now = () => NOW;
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const B = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");

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
const docs = (prefix) => [...S.docs.entries()].filter(([k]) => k.startsWith(prefix + "/"));
const snapOf = (prefix) => JSON.stringify(docs(prefix));
const usage = (id, m) => S.docs.get("storeCustomPlanUsage/" + id + "_" + m);
const invoice = (id, m) => S.docs.get("storeCustomPlanInvoices/" + id + "_" + m);
const plan = (id) => S.docs.get("storeCustomPlans/" + id);

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(jst(2026, 9, 1));
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
const member = (id, uid, status = "active") => S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status });
function seedStore(id, uid, extra = {}) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [], ...extra });
  member(id, uid);
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 1, categoryCode: "cafe_sweets", description: "無料の紹介文" + id, moderationStatus: "passed", moderatedText: "無料の紹介文" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/f.webp", publicId: "machinau_store_profiles/" + id + "/f", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
}
seedStore("S1", "u1"); seedStore("S2", "u2"); seedStore("S5", "u1"); seedStore("S7", "u7"); seedStore("S8", "u8", { isTestAccount: true }); seedStore("S9", "u9");
["u1", "u2", "u6", "u7", "u8", "u9"].forEach(card);
// an imadake invoice with the same ID shape, to prove the ledgers stay separate
S.docs.set("imadakeMonthlyInvoices/S1_2026-10", { storeId: "S1", month: "2026-10", status: "closed", lineCount: 2, amountJpy: 200, currency: "JPY", taxIncluded: true });
const IMADAKE_BEFORE = snapOf("imadakeMonthlyInvoices");
const SUB = (storeId) => ({ mode: "storeCustomPlanSubscribe", storeId, contractModel: "monthly", planConsentVersion: "store-card-monthly-2026-10-31" });
const CANCEL = (storeId) => ({ mode: "storeCustomPlanCancel", storeId });
const CLOSE = (month, execute) => ({ mode: "adminStoreCustomPlanMonthlyClose", month, ...(execute ? { execute: true } : {}) });

// ===================== calendar helpers (JST) =====================
t("K1 日本時間の月：10/31 23:59:59.999 JST は 2026-10、11/1 0:00 JST（UTC では 10/31 15:00）は 2026-11", B.jstMonthKey(jst(2026, 10, 31, 23, 59, 59, 999)) === "2026-10" && B.jstMonthKey(jst(2026, 11, 1)) === "2026-11" && new Date(jst(2026, 11, 1)).toISOString() === "2026-10-31T15:00:00.000Z");
t("K2 年末：12/31 23:59 JST は 2026-12、1/1 0:00 JST は 2027-01・翌月は 2027-01", B.jstMonthKey(jst(2026, 12, 31, 23, 59)) === "2026-12" && B.jstMonthKey(jst(2027, 1, 1)) === "2027-01" && B.nextMonthKey("2026-12") === "2027-01");
t("K3 請求予定日＝翌月2日（日本時間）：2026-10 → 2026-11-02、2026-12 → 2027-01-02（年末）、2028-01 → 2028-02-02（うるう年）", B.storeCustomPlanChargeScheduleFor("2026-10").date === "2026-11-02" && B.storeCustomPlanChargeScheduleFor("2026-10").millis === jst(2026, 11, 2) && B.storeCustomPlanChargeScheduleFor("2026-12").date === "2027-01-02" && B.storeCustomPlanChargeScheduleFor("2028-01").date === "2028-02-02");
t("K4 うるう年の2月：2028-02 の月初と翌月初（2/29 23:59 JST は 2028-02、3/1 0:00 JST は 2028-03）", B.jstMonthStartMillis("2028-02") === jst(2028, 2, 1) && B.jstMonthKey(jst(2028, 2, 29, 23, 59)) === "2028-02" && B.jstMonthKey(jst(2028, 3, 1)) === "2028-03" && B.jstMonthStartMillis(B.nextMonthKey("2028-02")) === jst(2028, 3, 1));
const rs = B.computeStoreCustomPlanRetrySchedule(jst(2026, 11, 2, 10));
t("K5 決済失敗の予定：初回失敗の3日後・7日後に再試行、14日後に停止", rs.retryAtMillis[0] === jst(2026, 11, 5, 10) && rs.retryAtMillis[1] === jst(2026, 11, 9, 10) && rs.suspendAtMillis === jst(2026, 11, 16, 10));
t("K6 料金は100円・税込・翌月2日（定数）", B.STORE_CUSTOM_PLAN_MONTHLY_FEE_JPY === 100 && B.STORE_CUSTOM_PLAN_CHARGE_DAY_OF_MONTH === 2);

// ===================== flags / environment =====================
t("F1 月額プラン専用のフラグ3つ（本番の申込・締めの書き込み・請求）はすべて false", B.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === false && B.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === false && B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false);
process.env.VERCEL_ENV = "production";
let r = await call(SUB("S1"), "u1");
t("F2 Production の環境：暦月契約の申込は受け付けない（403 plan_signup_unavailable・書き込みなし）", r.code === 403 && r.body.reason === "plan_signup_unavailable" && !plan("S1") && docs("storeCustomPlanUsage").length === 0, r.body);
process.env.VERCEL_ENV = "preview";

// ===================== October: subscribe / cancel / undo =====================
NOW = jst(2026, 10, 15, 10, 0);
r = await call(SUB("S1"), "u1");
t("A1 月途中（10/15）の申込：暦月契約（monthly・期限なし・Preview の試験用の印）・10月の利用月の記録（契約者 u1・申込）", r.code === 200 && r.body.result === "subscribed" && r.body.periodKind === "monthly" && plan("S1").periodKind === "monthly" && plan("S1").accessUntil === null && plan("S1").createdInPreview === true && usage("S1", "2026-10").holderUid === "u1" && usage("S1", "2026-10").reason === "subscribed" && ms(usage("S1", "2026-10").firstUsageAt) === NOW, { body: r.body, plan: plan("S1"), u: usage("S1", "2026-10") });
NOW += 60000;
r = await call(CANCEL("S1"), "u1");
t("A2 申込直後の解約：canceling・利用期限＝11/1 0:00 JST（10月末まで利用可）・利用月の記録は1件のまま", r.code === 200 && plan("S1").status === "canceling" && ms(plan("S1").accessUntil) === jst(2026, 11, 1) && r.body.accessUntilMillis === jst(2026, 11, 1) && docs("storeCustomPlanUsage").length === 1, { body: r.body, plan: plan("S1") });
t("A3 解約後も10月末までは利用できる（10/31 23:59 JST は利用可・11/1 0:00 JST は不可）", CP.hasStoreCustomPlanAccess(plan("S1"), jst(2026, 10, 31, 23, 59)) === true && CP.hasStoreCustomPlanAccess(plan("S1"), jst(2026, 11, 1)) === false);
NOW += 60000;
r = await call(SUB("S1"), "u1");
t("A4 同じ月の解約の取り消し：active・期限なしに戻る・利用月の記録は1件のまま（二重課金なし）", r.code === 200 && r.body.result === "reactivated" && plan("S1").status === "active" && plan("S1").accessUntil === null && docs("storeCustomPlanUsage").length === 1, { body: r.body, plan: plan("S1") });
for (let i = 0; i < 2; i++) { NOW += 60000; await call(CANCEL("S1"), "u1"); NOW += 60000; await call(SUB("S1"), "u1"); }
t("A5 同じ月に解約・再申込を繰り返しても、10月の利用月の記録は1件（100円が上限）・契約者は u1 のまま", docs("storeCustomPlanUsage").filter(([k]) => k.startsWith("storeCustomPlanUsage/S1_")).length === 1 && usage("S1", "2026-10").holderUid === "u1" && plan("S1").status === "active", usage("S1", "2026-10"));
r = await call(SUB("S1"), "u1");
t("A6 契約中の二重申込：409 already_subscribed", r.code === 409 && r.body.reason === "already_subscribed", r.body);
const race = await Promise.all([call(SUB("S2"), "u2"), call(SUB("S2"), "u2")]);
t("A7 同じ店舗への同時の申込：1件だけ成立・利用月の記録は1件", race.filter((x) => x.code === 200).length === 1 && docs("storeCustomPlanUsage").filter(([k]) => k.startsWith("storeCustomPlanUsage/S2_")).length === 1, race.map((x) => [x.code, x.body && x.body.reason]));
NOW = jst(2026, 10, 25, 9, 0);
r = await call(CANCEL("S2"), "u2");
t("A8 月途中（10/25）の解約：canceling・10月末まで", r.code === 200 && ms(plan("S2").accessUntil) === jst(2026, 11, 1), r.body);
NOW = jst(2026, 10, 30, 22, 0);
r = await call(SUB("S5"), "u1");
t("A9 同じアカウントの別の店舗（S5）：店舗ごとに別の利用月の記録", r.code === 200 && usage("S5", "2026-10").holderUid === "u1" && usage("S1", "2026-10").storeId === "S1", r.body);
NOW = jst(2026, 10, 5, 12, 0);
await call(SUB("S7"), "u7"); await call(SUB("S8"), "u8");
t("A10 S7（u7）・S8（試験店舗）も10月に申込", plan("S7").status === "active" && plan("S8").status === "active" && !!usage("S8", "2026-10"));
const g = await call({ mode: "storeCustomProfileGet", storeId: "S1" }, "u1");
t("A11 取得：暦月契約・期限なし・編集できる・Preview の試験用の契約", g.body.plan.state === "active" && g.body.plan.periodKind === "monthly" && g.body.plan.accessUntilMillis === 0 && g.body.plan.createdInPreview === true && g.body.editable === true, g.body.plan);
NOW = jst(2026, 10, 20);
r = await call({ mode: "storeCustomPlanSubscribe", storeId: "S9", planConsentVersion: "store-card-monthly-2026-10-31" }, "u9");
t("A12 既定（contractModel の指定なし）は STEP 44-B の試験の契約（preview_trial・申込から暦の1か月・利用月の記録なし）", r.code === 200 && plan("S9").periodKind === "preview_trial" && ms(plan("S9").accessUntil) === CP.addOneCalendarMonthJst(NOW) && !usage("S9", "2026-10"), plan("S9"));

// ===================== close October =====================
NOW = jst(2026, 10, 31, 23, 0);
r = await call(CLOSE("2026-10"), "admin");
t("C0 月が終わる前（10/31 23:00 JST）の10月の締めは 409 month_not_closed", r.code === 409 && r.body.reason === "month_not_closed", r.body);
NOW = jst(2026, 11, 1, 0, 30);
const beforeDry = snapOf("storeCustomPlanInvoices") + snapOf("storeCustomPlanUsage") + snapOf("storeCustomPlans");
r = await call(CLOSE("2026-10"), "admin");
t("C1 10月の締めの試算：請求書を作る予定 S1・S2・S5・S7 の4件（400円）・試験店舗 S8 は除外・書き込みなし", r.code === 200 && r.body.executed === false && r.body.invoices.create === 4 && r.body.invoices.test_store === 1 && snapOf("storeCustomPlanInvoices") + snapOf("storeCustomPlanUsage") + snapOf("storeCustomPlans") === beforeDry, r.body);
process.env.VERCEL_ENV = "production";
r = await call(CLOSE("2026-10", true), "admin");
process.env.VERCEL_ENV = "preview";
t("C2 Production の環境（締めのフラグ false）：締めの実行は 403 close_writes_disabled・書き込みなし", r.code === 403 && r.body.reason === "close_writes_disabled" && docs("storeCustomPlanInvoices").length === 0, r.body);
r = await call(CLOSE("2026-10", true), "u1");
t("C3 店主のアカウントでは締めを実行できない", r.code === 401 || r.code === 403, r.code);
r = await call(CLOSE("2026-10", true), "admin");
const i1 = invoice("S1", "2026-10");
t("C4 10月の締め（Preview 試験の環境）：請求書4件・各100円・税込・JPY・状態 closed・請求予定日 2026-11-02", r.code === 200 && r.body.executed === true && r.body.invoices.create === 4 && r.body.invoices.amountJpy === 400 && docs("storeCustomPlanInvoices").length === 4 && ["S1", "S2", "S5", "S7"].every((s) => invoice(s, "2026-10").amountJpy === 100 && invoice(s, "2026-10").status === "closed" && invoice(s, "2026-10").chargeScheduledFor === "2026-11-02" && invoice(s, "2026-10").taxIncluded === true), r.body);
t("C5 請求書の内容：契約者・請求先 u1・課金の理由（申込）・申込日時・締め日時・請求予定日・試行の記録（空）・PaymentIntent・カードは未設定", i1.holderUid === "u1" && i1.billingAccountUid === "u1" && i1.usageReason === "subscribed" && ms(i1.firstUsageAt) === jst(2026, 10, 15, 10, 0) && ms(i1.closedAt) === NOW && ms(i1.chargeScheduledAt) === jst(2026, 11, 2) && i1.chargeAttempt === 0 && Array.isArray(i1.chargeAttempts) && i1.chargeAttempts.length === 0 && i1.paymentIntentId === "" && i1.chargePaymentMethodId === "" && i1.createdInPreview === true, i1);
t("C6 試験店舗（isTestAccount）は請求書を作らない（利用月の記録は excluded）", !invoice("S8", "2026-10") && usage("S8", "2026-10").status === "excluded", usage("S8", "2026-10"));
t("C7 今だけ投稿の請求書（同じ形の ID S1_2026-10）は変わらない（別の台帳）", snapOf("imadakeMonthlyInvoices") === IMADAKE_BEFORE);
t("C8 翌月（11月）の開始：継続中の S1・S5・S7 に11月の利用月の記録（継続）・10月に解約した S2 には作らない", !!usage("S1", "2026-11") && usage("S1", "2026-11").reason === "continued" && usage("S1", "2026-11").holderUid === "u1" && ms(usage("S1", "2026-11").firstUsageAt) === jst(2026, 11, 1) && !!usage("S5", "2026-11") && !!usage("S7", "2026-11") && !usage("S2", "2026-11"), r.body.nextMonthOpening);
const afterClose = snapOf("storeCustomPlanInvoices");
r = await call(CLOSE("2026-10", true), "admin");
t("C9 同じ締めをもう一度：新しい請求書0件・金額も台帳も変わらない", r.code === 200 && !r.body.invoices.create && r.body.invoices.already_invoiced === 4 && snapOf("storeCustomPlanInvoices") === afterClose, r.body.invoices);

// ===================== November: owner change, cancel, unpaid =====================
NOW = jst(2026, 11, 5);
member("S7", "u7", "removed");
NOW = jst(2026, 11, 10);
member("S1", "u1", "removed"); member("S1", "u6");
NOW = jst(2026, 11, 15);
r = await call(SUB("S1"), "u6");
t("O1 同じ月の所有者の変更（11/10 に u1 → u6、u6 が 11/15 に申込）：新しい契約は u6・11月の料金は旧店主 u1 のまま（上書きしない・u6 は記録だけ）", r.code === 200 && plan("S1").ownerUid === "u6" && usage("S1", "2026-11").holderUid === "u1" && JSON.stringify(usage("S1", "2026-11").laterHolderUids) === '["u6"]', { plan: plan("S1"), u: usage("S1", "2026-11") });
NOW = jst(2026, 11, 20);
r = await call(CANCEL("S5"), "u1");
t("O2 S5 を11月に解約：11月末まで", r.code === 200 && ms(plan("S5").accessUntil) === jst(2026, 12, 1), r.body);

// ===================== close November (concurrent) =====================
NOW = jst(2026, 12, 1, 9, 0);
const both = await Promise.all([call(CLOSE("2026-11", true), "admin"), call(CLOSE("2026-11", true), "admin")]);
const nov = docs("storeCustomPlanInvoices").filter(([k]) => k.endsWith("_2026-11")).map(([, v]) => v);
t("N1 11月の締めを同時に2回：どちらも成功・請求書は S1・S5・S7 の3件だけ（二重計上なし）", both.every((x) => x.code === 200) && nov.length === 3 && (both[0].body.invoices.create || 0) + (both[1].body.invoices.create || 0) === 3, { codes: both.map((x) => x.code), nov: nov.map((v) => v.storeId) });
t("N2 所有者変更の月（11月）の S1 の請求書は1件・100円・請求先は旧店主 u1", invoice("S1", "2026-11").billingAccountUid === "u1" && invoice("S1", "2026-11").amountJpy === 100 && JSON.stringify(invoice("S1", "2026-11").laterHolderUids) === '["u6"]', invoice("S1", "2026-11"));
t("N3 11月に owner でなくなった S7 の旧店主 u7：11月の初めに開始済みの料金は u7 に請求（発生済みの料金は旧店主）", invoice("S7", "2026-11").billingAccountUid === "u7", invoice("S7", "2026-11"));
t("N4 10月に解約した S2 の11月は0円（請求書なし）", !invoice("S2", "2026-11"));
t("N5 12月の開始：S1 は新しい契約者 u6・S5（11月に解約）は作らない・S7（契約者が owner でない）は作らずに契約を終了", usage("S1", "2026-12").holderUid === "u6" && !usage("S5", "2026-12") && !usage("S7", "2026-12") && plan("S7").status === "ended" && plan("S7").endReason === "holder_not_owner", { s1: usage("S1", "2026-12"), s7: plan("S7") });

// ===================== close December (year end) =====================
NOW = jst(2027, 1, 1, 0, 10);
r = await call(CLOSE("2026-12", true), "admin");
t("Y1 年末（12月）の締め：S1 の12月は新しい契約者 u6 に100円・請求予定日 2027-01-02・S5・S7 は0円", r.code === 200 && invoice("S1", "2026-12").billingAccountUid === "u6" && invoice("S1", "2026-12").chargeScheduledFor === "2027-01-02" && !invoice("S5", "2026-12") && !invoice("S7", "2026-12") && docs("storeCustomPlanInvoices").filter(([k]) => k.endsWith("_2026-12")).length === 1, r.body);
t("Y2 1月の開始：S1（u6）と試験店舗 S8 だけ（S8 は締めで除外される）", !!usage("S1", "2027-01") && usage("S1", "2027-01").holderUid === "u6" && JSON.stringify(docs("storeCustomPlanUsage").filter(([k]) => k.endsWith("_2027-01")).map(([k]) => k).sort()) === JSON.stringify(["storeCustomPlanUsage/S1_2027-01", "storeCustomPlanUsage/S8_2027-01"]) && !invoice("S8", "2026-12"));
t("Y3 店舗ごとの請求の合計：S1 は10・11・12月で3件（各100円）・同じ店舗・同じ月は1件", ["2026-10", "2026-11", "2026-12"].every((m) => invoice("S1", m).amountJpy === 100) && docs("storeCustomPlanInvoices").filter(([k]) => k.startsWith("storeCustomPlanInvoices/S1_")).length === 3);

// ===================== unpaid states (separate from the contract state) =====================
NOW = jst(2027, 1, 10);
seedStore("S11", "u9");
r = await call(SUB("S11"), "u9");
S.docs.set("storeCustomPlans/S11", { ...plan("S11"), paymentStatus: "suspended" });
const susp = await call({ mode: "storeCustomProfileGet", storeId: "S11" }, "u9");
let plU = await publicList();
const s11pub = plU.body.stores.find((s) => s.id === "sp_S11");
// STEP 50-B(代表決定 2026-10-31)｜支払い停止で契約の利用権が無くなると、店舗カード自体を旅行者に出さない。
t("U1 未払いで停止（paymentStatus suspended、契約の状態とは別）：利用権なし・保存・編集はできる(STEP 50-D)・店舗カードを旅行者に出さない(STEP 50-B)", r.code === 200 && susp.body.plan.paymentStatus === "suspended" && susp.body.plan.state === "active" && susp.body.plan.access === false && susp.body.editable === true && !s11pub, { plan: susp.body.plan, s11pub });
r = await call(SUB("S11"), "u9");
t("U2 停止中は新しい申込・解約の取り消しを受け付けない（409 plan_unpaid）", r.code === 409 && r.body.reason === "plan_unpaid", r.body);
S.docs.set("storeCustomPlans/S11", { ...plan("S11"), paymentStatus: "past_due" });
const pd = await call({ mode: "storeCustomProfileGet", storeId: "S11" }, "u9");
const usageBeforeCancel = snapOf("storeCustomPlanUsage");
r = await call(CANCEL("S11"), "u9");
t("U3 未払い・猶予中（paymentStatus past_due）：利用は続く（編集可）・未払い中でも解約は受け付ける（契約は canceling、未払いはそのまま、今月の料金も残る）", pd.body.plan.paymentStatus === "past_due" && pd.body.editable === true && r.code === 200 && plan("S11").status === "canceling" && plan("S11").paymentStatus === "past_due" && snapOf("storeCustomPlanUsage") === usageBeforeCancel && !!usage("S11", "2027-01"), { plan: pd.body.plan, cancel: r.body });
S.docs.set("storeCustomPlans/S11", { ...plan("S11"), paymentStatus: "suspended" });
NOW += 60000;
r = await call(CANCEL("S11"), "u9");
t("U4 停止中に解約済みの契約をもう一度解約しても状態は変わらない（200 alreadyCanceled）", r.code === 200 && r.body.alreadyCanceled === true, r.body);

// ===================== access to invoices =====================
const l1 = await call({ mode: "storeCustomPlanInvoiceList" }, "u1");
const l6 = await call({ mode: "storeCustomPlanInvoiceList" }, "u6");
const l2 = await call({ mode: "storeCustomPlanInvoiceList" }, "u2");
t("V1 店主の請求一覧：自分が請求先の分だけ（u1：S1 の10・11月と S5 の10・11月、owner でなくなった S1 の分も見られる）", l1.code === 200 && JSON.stringify(l1.body.invoices.map((x) => x.invoiceId).sort()) === JSON.stringify(["S1_2026-10", "S1_2026-11", "S5_2026-10", "S5_2026-11"]), l1.body);
t("V2 新しい owner u6 は自分の分（S1 の12月）だけ・旧店主の請求は見えない", JSON.stringify(l6.body.invoices.map((x) => x.invoiceId)) === '["S1_2026-12"]' && JSON.stringify(l2.body.invoices.map((x) => x.invoiceId)) === '["S2_2026-10"]', { u6: l6.body, u2: l2.body });
t("V3 一覧に請求先 uid・カード・顧客・支払いの ID を含まない", !/billingAccountUid|chargePaymentMethodId|chargeCustomerId|paymentIntentId|cus_|pm_/.test(JSON.stringify(l1.body)), l1.body);
r = await call({ mode: "storeCustomPlanInvoiceList" });
t("V4 未ログインは 401", r.code === 401, r.code);
r = await call({ mode: "adminStoreCustomPlanInvoiceList" }, "u1");
t("V5 店主のアカウントでは運営の請求台帳を見られない", r.code === 401 || r.code === 403, r.code);
r = await call({ mode: "adminStoreCustomPlanInvoiceList", month: "2026-10" }, "admin");
t("V6 運営の請求台帳（10月）：4件・400円（読み取りだけ）", r.code === 200 && r.body.invoices.length === 4 && r.body.totalAmountJpy === 400, r.body);

// ===================== charge is refused =====================
const beforeCharge = snapOf("storeCustomPlanInvoices");
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: false }, "admin");
t("X1 請求の実行：請求用キーが無い（この試験の環境）ので 403 stripe_unavailable・Stripe へ通信しない・台帳は変わらない（STEP 44-C④ で試算・実行に変更）", r.code === 403 && r.body.reason === "stripe_unavailable" && otherNetwork === 0 && snapOf("storeCustomPlanInvoices") === beforeCharge, r.body);
process.env.VERCEL_ENV = "production";
r = await call({ mode: "adminStoreCustomPlanCharge", dryRun: false }, "admin");
process.env.VERCEL_ENV = "preview";
t("X1b Production の環境では請求の実行は 403 charge_disabled", r.code === 403 && r.body.reason === "charge_disabled", r.body);
r = await call({ mode: "adminStoreCustomPlanCharge" }, "u1");
t("X2 店主のアカウントでは請求の操作を呼べない", r.code === 401 || r.code === 403, r.code);

// ===================== regressions / isolation =====================
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const MCL = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const LC = await import(REPO_URL + "/api/_lib/listing-profile-copy.js");
t("R1 既存の課金関連6フラグはすべて false", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && MCL.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === false && LC.LISTING_PHOTO_COPY_ENABLED === false && LC.LISTING_PHOTO_COPY_PREVIEW_TRIAL === false);
t("R2 今だけ投稿の台帳（請求書・日別の料金）は変わらない", snapOf("imadakeMonthlyInvoices") === IMADAKE_BEFORE && docs("imadakePostDailyCharges").length === 0);
t("R3 storeBilling（廃止済み）を作らない・accountBilling（カード）を変えない", docs("storeBilling").length === 0 && ["u1", "u2", "u6"].every((u) => S.docs.get("accountBilling/" + u).test.paymentMethodId === "pm_" + u && !S.docs.get("accountBilling/" + u).test.billingLocks));
const pl = await publicList();
// STEP 50-B｜一覧に出るのは、契約の利用権がある店舗カードだけ(未契約・停止中の店舗カードは出さない)。
const listedPlanOk = pl.body.stores.every((s) => { const p = S.docs.get("storeCustomPlans/" + s.id.slice(3)); return !!p && (p.status === "active" || p.status === "canceling") && p.paymentStatus !== "suspended"; });
t("R4 旅行者向けの一覧は契約の利用権がある店舗カードだけ（STEP 50-B）", pl.code === 200 && pl.body.stores.length > 0 && listedPlanOk && !pl.body.stores.some((s) => s.id === "sp_S11"), pl.body.stores.map((s) => s.id));
t("Z1 外部への通信なし", otherNetwork === 0, otherNetwork);
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
