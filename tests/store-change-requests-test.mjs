// 運営管理の変更依頼(1回1,000円)の台帳と、月末締めでの合算。
// 状態：requested → completed(料金確定) → invoiced(請求書に合算済み)／requested → canceled(請求しない)。
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-change-requests-test.mjs
import { REPO_URL } from "./_paths.mjs";
const ADMIN = "admin@example.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["u1", "u2"].map((u) => [u, pw(u, u + "@example.com")]));
globalThis.__MOCK_TOKENS.admin = pw("adm1", ADMIN);
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
globalThis.fetch = async (url) => { throw new Error("unexpected network " + url); };
const jst = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600000;
let NOW = jst(2026, 11, 10, 10, 0);
Date.now = () => NOW;
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

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
const invoice = (id, m) => S.docs.get("storeCustomPlanInvoices/" + id + "_" + m);
const request = (id) => S.docs.get("storeChangeRequests/" + id);

const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(jst(2026, 9, 1));
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
function seedStore(id, uid) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 1, categoryCode: "cafe_sweets", description: "紹介文" + id, moderationStatus: "passed", moderatedText: "紹介文" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/f.webp", publicId: "machinau_store_profiles/" + id + "/f", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
}
seedStore("CR1", "u1"); seedStore("CR2", "u2");
card("u1"); card("u2");

const MSUB = (storeId) => ({ mode: "storeCustomPlanSubscribe", storeId, contractModel: "monthly", planKind: "managed", planConsentVersion: "store-managed-plan-2026-11-17" });
const SUB = (storeId) => ({ mode: "storeCustomPlanSubscribe", storeId, contractModel: "monthly", planConsentVersion: "store-card-monthly-2026-10-31" });
const CREATE = (storeId, note) => ({ mode: "adminStoreChangeRequestCreate", storeId, note });
const COMPLETE = (requestId) => ({ mode: "adminStoreChangeRequestComplete", requestId });
const CANCELREQ = (requestId) => ({ mode: "adminStoreChangeRequestCancel", requestId });
const CLOSE = (month, execute) => ({ mode: "adminStoreCustomPlanMonthlyClose", month, ...(execute ? { execute: true } : {}) });

let r = await call(MSUB("CR1"), "u1");
t("前提：CR1 が運営管理を契約", r.code === 200 && S.docs.get("storeCustomPlans/CR1").planKind === "managed", r.body);
r = await call(SUB("CR2"), "u2");
t("前提：CR2 がセルフ運用を契約", r.code === 200 && (S.docs.get("storeCustomPlans/CR2").planKind || "self") === "self", r.body);

// ===================== 台帳の状態操作 =====================
r = await call(CREATE("CR1", "写真の差し替え"), "u1");
t("R1 運営以外は変更依頼を受け付けられない", r.code === 403, r.body);
r = await call(CREATE("CR2", "写真の差し替え"), "admin");
t("R2 セルフ運用の店舗には変更依頼を受け付けられない（運営管理の契約が必要）", r.code === 409 && r.body.reason === "change_request_plan_required", r.body);
r = await call(CREATE("CR1", "写真の差し替え"), "admin");
const reqA = r.body.request && r.body.request.requestId;
t("R3 運営管理の店舗に受け付け：状態は requested・料金はまだ確定しない（0円）", r.code === 200 && !!reqA && r.body.request.status === "requested" && r.body.request.feeJpy === 0, r.body);
r = await call(CANCELREQ(reqA), "admin");
t("R4 取り消し：canceled になり、料金は確定しない", r.code === 200 && request(reqA).status === "canceled" && request(reqA).feeJpy === 0, r.body);
r = await call(COMPLETE(reqA), "admin");
t("R5 取り消した依頼は完了にできない", r.code === 409 && r.body.reason === "request_not_completable", r.body);

r = await call(CREATE("CR1", "メニューの差し替え"), "admin");
const reqB = r.body.request.requestId;
r = await call(CREATE("CR1", "営業時間の変更"), "admin");
const reqC = r.body.request.requestId;
NOW = jst(2026, 11, 20, 10, 0);
r = await call(COMPLETE(reqB), "admin");
t("R6 完了：料金1,000円が確定し、完了した月（2026-11）が記録される", r.code === 200 && request(reqB).status === "completed" && request(reqB).feeJpy === 1000 && request(reqB).completedMonth === "2026-11", r.body);
r = await call(COMPLETE(reqC), "admin");
t("R7 2件目の完了も同じ月に確定", r.code === 200 && request(reqC).feeJpy === 1000 && request(reqC).completedMonth === "2026-11", r.body);
r = await call(COMPLETE(reqB), "admin");
t("R8 完了済みの二重完了は 409", r.code === 409 && r.body.reason === "request_not_completable", r.body);
r = await call({ mode: "adminStoreChangeRequestList", storeId: "CR1" }, "admin");
t("R9 一覧：CR1 の依頼が3件（canceled・completed×2）", r.code === 200 && r.body.requests.length === 3, r.body);

// ===================== 月末締めでの合算 =====================
NOW = jst(2026, 12, 5, 10, 0);
r = await call(CLOSE("2026-11", false), "admin");
t("C1 試算では請求書を作らず、変更依頼も消費しない", r.code === 200 && !invoice("CR1", "2026-11") && request(reqB).status === "completed", r.body);
r = await call(CLOSE("2026-11", true), "admin");
const inv1 = invoice("CR1", "2026-11");
t("C2 締め：請求書は1件で、月額500円＋変更依頼2,000円＝2,500円（内訳つき）", r.code === 200 && !!inv1 && inv1.planFeeJpy === 500 && inv1.changeRequestJpy === 2000 && inv1.changeRequestCount === 2 && inv1.amountJpy === 2500, { body: r.body, inv: inv1 });
t("C3 合算した変更依頼は invoiced になり、取り消した依頼は canceled のまま", request(reqB).status === "invoiced" && request(reqB).invoiceId === "CR1_2026-11" && request(reqC).status === "invoiced" && request(reqA).status === "canceled", {});
r = await call(CLOSE("2026-11", true), "admin");
t("C4 締めを繰り返しても二重に合算しない（請求書は2,500円のまま）", invoice("CR1", "2026-11").amountJpy === 2500 && invoice("CR1", "2026-11").changeRequestJpy === 2000, r.body);
const invSelf = invoice("CR2", "2026-11");
t("C5 セルフ運用の請求書は100円・変更依頼の合算なし（内訳は月額100円のみ）", !!invSelf && invSelf.planFeeJpy === 100 && invSelf.changeRequestJpy === 0 && invSelf.amountJpy === 100, invSelf);

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
