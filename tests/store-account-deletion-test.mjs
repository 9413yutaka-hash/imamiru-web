// STEP 47 / 47-B: store account self-deletion (closure request → settlement → deletion).
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions),
// in-memory Stripe / Cloudinary stubs with FAKE test-shaped keys. No network, no real Stripe/Firestore/Cloudinary, no real keys.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-account-deletion-test.mjs
import { REPO_URL } from "./_paths.mjs";

process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.CLOUDINARY_API_KEY = "fake-cld-key"; process.env.CLOUDINARY_API_SECRET = "fake-cld-secret";
const CRON_SECRET = "fake-cron-secret-for-tests";
process.env.AI_COLLECT_CRON_SECRET = CRON_SECRET;
const FAKE_TEST_RK = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_TEST_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const ENV_KEYS = ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "STRIPE_MODE", "STRIPE_RESTRICTED_KEY", "STRIPE_PUBLISHABLE_KEY"];
const PREVIEW = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_TEST_RK, STRIPE_PUBLISHABLE_KEY: FAKE_TEST_PK };
const PROD_NO_STRIPE = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
const setEnv = (o) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, o); };
setEnv(PREVIEW);

const tok = (uid, email, verified = true) => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = {};
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

// ---- Stripe / Cloudinary stubs (test-shaped fake keys only) ----
const ST = { calls: [], seq: 0, intents: new Map(), pm: new Map(), detachFail: false };
const CLD_CALLS = []; let cldFail = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (u.hostname === "api.cloudinary.com") {
    const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
    CLD_CALLS.push(form.public_id);
    return cldFail ? json(500, { error: { message: "x" } }) : json(200, { result: "ok" });
  }
  if (u.hostname !== "api.stripe.com") throw new Error("unexpected fetch " + url);
  const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
  ST.calls.push(opts.method + " " + u.pathname);
  if (String((opts.headers || {}).Authorization || "") !== "Bearer " + FAKE_TEST_RK) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/customers") return json(200, { id: "cus_new" + ++ST.seq });
  if (opts.method === "POST" && u.pathname === "/v1/setup_intents") {
    const id = "seti_t" + ++ST.seq;
    ST.intents.set(id, { id, customer: form.customer, metadata: { accountUid: form["metadata[accountUid]"], machinauMode: "test" } });
    return json(200, { id, client_secret: id + "_secret_FAKE", customer: form.customer, payment_method_types: ["card"], metadata: ST.intents.get(id).metadata, status: "requires_payment_method" });
  }
  let m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if (opts.method === "GET" && m) {
    const si = ST.intents.get(m[1]);
    return json(200, { id: si.id, customer: si.customer, metadata: si.metadata, status: "succeeded", payment_method: { id: "pm_" + m[1], type: "card", customer: si.customer, card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } } });
  }
  m = u.pathname.match(/^\/v1\/payment_methods\/(pm_[A-Za-z0-9_]+)(\/detach)?$/);
  if (m) {
    const pm = ST.pm.get(m[1]);
    if (!pm) return json(404, { error: { type: "invalid_request_error", code: "resource_missing" } });
    if (opts.method === "GET") return json(200, { id: m[1], type: "card", customer: pm.customer });
    if (ST.detachFail) return json(503, { error: { type: "api_error" } });
    pm.customer = null; return json(200, { id: m[1], type: "card", customer: null });
  }
  if (u.pathname.startsWith("/v1/customers/") && opts.method === "DELETE") ST.customerDeleted = true;
  return json(404, { error: { type: "invalid_request_error" } });
};

const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const CR = await import(REPO_URL + "/api/_lib/imadake-card-requirement.js");

let pass = 0, fail = 0; const logs = [];
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const mkRes = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(mode, body, token, headers = {}) {
  const r = mkRes(); const e = console.error; console.error = (...a) => logs.push(a.map(String).join(" "));
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}), ...headers }, body: { mode, ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function getPublic() {
  const r = mkRes(); const e = console.error; console.error = () => {};
  try { await handler({ method: "GET", headers: { "x-forwarded-for": "198.51.100.9" }, query: { mode: "publicStoreProfiles" } }, r); } finally { console.error = e; }
  return r;
}
const resetRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeBillingRateLimits/") || k.startsWith("storeRegistrationRateLimits/") || k.startsWith("storeRateLimits/")) S.docs.delete(k); };
const doc = (path) => S.docs.get(path) || null;
const put = (path, data) => S.docs.set(path, data);
const check = (token) => call("storeAccountDeletionCheck", {}, token);
const del = async (token, body = { confirm: true }) => { resetRate(); return call("storeAccountDelete", body, token); };
const sweep = (secret = CRON_SECRET) => call("accountDeletionSweep", {}, null, secret ? { "x-machinau-cron-secret": secret } : {});
const deleted = () => globalThis.__MOCK_AUTH_DELETED || [];

const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const { Timestamp } = await import("firebase-admin/firestore");
const AT = Timestamp.fromMillis(Date.now() - 86400000);
const publicBody = async () => (await getPublic()).body || {};
const listedIds = async () => ((await publicBody()).stores || []).map((s) => String(s.id || ""));
const photoId = (storeId, name) => "machinau_store_profiles/" + storeId + "/" + name;
function seedAccount(uid, storeIds, opts = {}) {
  globalThis.__MOCK_TOKENS[uid] = tok(uid, opts.email || uid + "@example.com", opts.verified !== false);
  for (const storeId of storeIds) {
    put("storeMembers/" + storeId + "_" + uid, { storeId, uid, role: "owner", status: "active" });
    put("storeAccounts/" + storeId, { storeName: "店 " + storeId, enabled: true, registrationStatus: "active", createdByUid: uid, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.21, longitude: 127.68, duplicateCandidates: [], ...(opts.testStore ? { isTestAccount: true } : {}) });
    put("storeProfiles/" + storeId, { storeId, status: "published", revision: 3, categoryCode: "cafe_sweets", description: "紹介文" + storeId, moderationStatus: "passed", moderatedText: "紹介文" + storeId, businessHours: null, photos: [{ url: CLD + "v1/" + photoId(storeId, "free1") + ".webp", publicId: photoId(storeId, "free1"), moderationStatus: "passed" }], publishedAt: AT, updatedAt: AT });
  }
  if (opts.card !== false) {
    const pmId = "pm_" + uid + "card";
    ST.pm.set(pmId, { customer: "cus_" + uid });
    put("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: pmId, card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }, cardVersion: 1, setupStatus: "succeeded", detachPendingPaymentMethods: [], pendingSetupIntentId: "" } });
  }
}
const noChange = (uid, storeId) => doc("storeProfiles/" + storeId).status === "published" && doc("storeAccounts/" + storeId).enabled === true && doc("accountBilling/" + uid) && doc("accountBilling/" + uid).test.paymentMethodId === "pm_" + uid + "card" && !doc("accountDeletions/" + uid) && !deleted().includes(uid) && doc("storeMembers/" + storeId + "_" + uid).status === "active";
// 退会を受け付けて清算を待っている状態(非公開・無効、カード・ログイン・owner は残る)。
const awaiting = (uid, storeId) => doc("accountDeletions/" + uid) && doc("accountDeletions/" + uid).status === "awaiting_settlement" && doc("storeProfiles/" + storeId).status === "draft" && doc("storeAccounts/" + storeId).enabled === false && doc("accountBilling/" + uid).test.paymentMethodId === "pm_" + uid + "card" && !deleted().includes(uid) && doc("storeMembers/" + storeId + "_" + uid).status === "active";

// ===================== A: check (read only) =====================
seedAccount("u1", ["s1"]);
put("imadakePosts/p1", { storeId: "s1", status: "published", expiresAt: { toMillis: () => Date.now() + 3600e3 } });
put("imadakePosts/p2", { storeId: "s1", status: "pending" });
put("imadakePosts/p3", { storeId: "s1", status: "ended" });
put("imadakeStoreSlots/s1", { activePostId: "p1", pendingPostId: "p2", activeRegionKey: "jp-okinawa" });
put("imadakeMonthlyInvoices/s1_2026-09", { storeId: "s1", month: "2026-09", status: "paid", amountJpy: 300, chargeBillingAccountUid: "u1" });
let r = await call("storeAccountDeletionCheck", {}, null);
t("A1 未ログインは 401", r.code === 401, r.body);
seedAccount("u0", [], { verified: false, card: false });
r = await check("u0");
t("A2 ⑧メール未確認のアカウントも確認できる（店舗・カードなし＝削除できる）", r.code === 200 && r.body.deletable === true && r.body.summary.storeCount === 0 && r.body.summary.hasCard === false, r.body);
const writesBefore = S.writes.length;
r = await check("u1");
t("A3 確認：削除できる・清算待ちなし・公開中の店舗1・掲載中の投稿2・カードあり", r.code === 200 && r.body.deletable === true && r.body.settlementRequired === false && r.body.blockers.length === 0 && r.body.summary.storeCount === 1 && r.body.summary.publishedStoreCount === 1 && r.body.summary.activePostCount === 2 && r.body.summary.hasCard === true && r.body.deletionStatus === "", r.body);
t("A4 確認は何も書き込まない", S.writes.length === writesBefore, S.writes.slice(writesBefore));
t("A5 確認の応答にカードの番号・Stripe の ID・メールアドレスを含めない", !/pm_|cus_|4242|@example/.test(JSON.stringify(r.body)), r.body);
const listedBefore = await listedIds();
t("A6 （前提）削除の前は、この店舗が旅行者向けの一覧に出ている", listedBefore.includes("sp_s1"), listedBefore);
globalThis.__MOCK_TOKENS.adm = tok("adm", "admin@example.com");
r = await check("adm");
const rd = await del("adm");
t("A7 運営（ADMIN_EMAIL）のアカウントは店舗画面から削除しない（403 operator_account・何も変えない）", r.code === 403 && r.body.reason === "operator_account" && rd.code === 403 && !doc("accountDeletions/adm") && !deleted().includes("adm"), { r: r.body, rd: rd.body });
globalThis.__MOCK_TOKENS.ed1 = tok("ed1", "ed1@example.com"); put("operators/ed1", { role: "editor", active: true });
r = await del("ed1");
t("A8 Editor（operators）のアカウントも削除しない", r.code === 403 && r.body.reason === "operator_account", r.body);

// ===================== B: closure accepted, deleted after settlement =====================
const settleCase = async (label, uid, storeId, seedFn, expected) => {
  seedAccount(uid, [storeId]); seedFn(uid, storeId);
  const c = await check(uid);
  const d = await del(uid);
  t(label, c.body.deletable === true && c.body.settlementRequired === true && c.body.blockers.includes(expected) && d.code === 202 && d.body.status === "awaiting_settlement" && d.body.blockers.includes(expected) && awaiting(uid, storeId) && !/pm_|cus_/.test(JSON.stringify(d.body)), { c: c.body, d: d.body, rec: doc("accountDeletions/" + uid) });
};
await settleCase("B1 今だけ投稿の請求書が確定（closed）＝未払い：退会を受け付けて清算待ち（カード・ログイン・owner は残す）", "ub1", "sb1", (u, s) => put("imadakeMonthlyInvoices/" + s + "_2026-09", { storeId: s, month: "2026-09", status: "closed", amountJpy: 100 }), "imadake_invoice_unsettled");
await settleCase("B2 今だけ投稿の請求が失敗（payment_failed）：清算待ち", "ub2", "sb2", (u, s) => put("imadakeMonthlyInvoices/" + s + "_2026-08", { storeId: s, month: "2026-08", status: "payment_failed", amountJpy: 100, chargeBillingAccountUid: u }), "imadake_invoice_unsettled");
await settleCase("B3 決済結果が未確定（charging・needs_review）：清算待ち（削除しない）", "ub3", "sb3", (u, s) => { put("imadakeMonthlyInvoices/" + s + "_2026-08", { storeId: s, month: "2026-08", status: "charging" }); put("imadakeMonthlyInvoices/" + s + "_2026-07", { storeId: s, month: "2026-07", status: "needs_review" }); }, "imadake_invoice_unsettled");
await settleCase("B4 別の店舗の請求書でも、このアカウントが請求先なら清算待ち", "ub4", "sb4", (u) => put("imadakeMonthlyInvoices/other_2026-08", { storeId: "other", month: "2026-08", status: "requires_action", chargeBillingAccountUid: u }), "imadake_invoice_unsettled");
await settleCase("B5 ①締め前の今だけ投稿の料金：清算待ち（翌月2日の請求とお支払いの後に削除）", "ub5", "sb5", (u, s) => { put("imadakePosts/pb5", { storeId: s, status: "ended", cvBillingEnabled: true }); put("imadakePostDailyCharges/pb5_2026-10-20", { storeId: s, postId: "pb5", jstDate: "2026-10-20", amountJpy: 100, currency: "JPY", validCvCount: 2, status: "accrued" }); }, "imadake_charges_unbilled");
await settleCase("B6 月額100円の未請求の利用月（accrued）：清算待ち", "ub6", "sb6", (u, s) => put("storeCustomPlanUsage/" + s + "_2026-10", { storeId: s, month: "2026-10", billingAccountUid: u, holderUid: u, status: "accrued" }), "custom_plan_unbilled");
await settleCase("B7 月額100円の請求書が未払い（payment_failed）：清算待ち", "ub7", "sb7", (u, s) => put("storeCustomPlanInvoices/" + s + "_2026-09", { storeId: s, month: "2026-09", billingAccountUid: u, status: "payment_failed" }), "custom_plan_invoice_unsettled");
await settleCase("B8 カードに請求中のロック：清算待ち（カードは外さない）", "ub8", "sb8", (u) => { const b = doc("accountBilling/" + u); b.test.billingLocks = { "x_2026-09": { atMs: 1 } }; }, "billing_locked");
// 清算で解消しない理由は、何も変えずに止める
seedAccount("ub9", ["sb9"]); { const b = doc("accountBilling/ub9"); b.live = { customerId: "cus_liveub9", paymentMethodId: "pm_liveub9", card: { last4: "1111" }, setupStatus: "succeeded" }; }
r = await check("ub9"); const d9 = await del("ub9");
t("B9 本番（live）のカードがあるのに、この環境で本番のカード登録が使えない：受け付けず何も変えない（409）", r.body.deletable === false && r.body.blockers.includes("live_card_removal_unavailable") && d9.code === 409 && d9.body.reason === "not_deletable" && noChange("ub9", "sb9"), { r: r.body, d: d9.body });
// 請求されない行は止める理由にしない
seedAccount("uc1", ["sc1"]);
put("imadakePosts/pc1", { storeId: "sc1", status: "ended", cvBillingEnabled: false });
put("imadakePostDailyCharges/pc1_2026-10-20", { storeId: "sc1", postId: "pc1", jstDate: "2026-10-20", amountJpy: 100, currency: "JPY", validCvCount: 1, status: "accrued" });
put("storeCustomPlanUsage/sc1_2026-09", { storeId: "sc1", month: "2026-09", billingAccountUid: "uc1", status: "invoiced" });
put("storeCustomPlanInvoices/sc1_2026-09", { storeId: "sc1", month: "2026-09", billingAccountUid: "uc1", status: "paid" });
r = await check("uc1");
t("B10 請求されない行・請求済みの利用月・支払い済みの請求書は清算待ちの理由にしない", r.body.deletable === true && r.body.settlementRequired === false && r.body.blockers.length === 0, r.body);
seedAccount("uc2", ["sc2"], { testStore: true });
put("imadakePosts/pc2", { storeId: "sc2", status: "ended", cvBillingEnabled: true });
put("imadakePostDailyCharges/pc2_2026-10-20", { storeId: "sc2", postId: "pc2", jstDate: "2026-10-20", amountJpy: 100, currency: "JPY", validCvCount: 1, status: "accrued" });
r = await check("uc2");
t("B11 テスト店舗の料金は請求されない（月末締めと同じ条件）ので清算待ちにしない", r.body.deletable === true && r.body.settlementRequired === false, r.body);

// ---- G: while awaiting settlement, no new paid use / no new store ----
r = await check("ub5");
t("G1 清算待ちの確認：状態 awaiting_settlement と残りの理由を返す", r.body.deletionStatus === "awaiting_settlement" && r.body.blockers.includes("imadake_charges_unbilled"), r.body);
const cardChk = await CR.checkAccountBillingCard((await import("firebase-admin/firestore")).getFirestore(), "ub5", { env: process.env });
t("G2 清算待ちの間は、店舗の登録・引き継ぎ・月額プランの条件のカード確認が通らない（card_account_deleting）", cardChk.ok === false && cardChk.reason === "card_account_deleting", cardChk);
const postChk = await CR.checkImadakeBillingCard((await import("firebase-admin/firestore")).getFirestore(), "sb5", { env: process.env });
t("G3 清算待ちの間は、課金対象の今だけ投稿のカード確認が通らない（card_account_deleting）", postChk.ok === false && postChk.reason === "card_account_deleting", postChk);
resetRate();
r = await call("storeSelfRegister", { storeName: "新しい店", categoryCode: "gourmet", countryCode: "JP", address: "沖縄県那覇市1-1", sourceLanguage: "ja" }, "ub5");
t("G4 清算待ちの間は、新しい店舗を登録できない（409 account_deleting）", r.code === 409 && r.body.reason === "account_deleting" && ![...S.docs.keys()].some((k) => k.startsWith("storeMembers/") && k.endsWith("_ub5") && k !== "storeMembers/sb5_ub5"), r.body);
resetRate();
r = await call("storeBillingSetupIntentCreate", {}, "ub5");
t("G5 清算待ちの間は、最後のお支払いのためにカードの変更を始められる（200）", r.code === 200 && r.body.success === true, r.body);
r = await del("ub5");
t("G6 清算前にもう一度押しても削除しない（202 awaiting_settlement のまま）", r.code === 202 && r.body.status === "awaiting_settlement" && awaiting("ub5", "sb5"), r.body);
r = await sweep();
t("G7 定期実行：清算前の退会は進めない（カード・ログインは残る）", r.code === 200 && awaiting("ub5", "sb5") && awaiting("ub1", "sb1"), r.body);
r = await sweep("wrong");
const r0 = await sweep(null);
t("G8 定期実行は合言葉が違えば 401（何もしない）", r.code === 401 && r0.code === 401, { r: r.body, r0: r0.body });

// ---- H: settle → deletion completes ----
put("imadakeMonthlyInvoices/sb1_2026-09", { storeId: "sb1", month: "2026-09", status: "paid", amountJpy: 100 });
doc("imadakePostDailyCharges/pb5_2026-10-20").status = "invoiced"; doc("imadakePostDailyCharges/pb5_2026-10-20").invoiceId = "sb5_2026-10";
put("imadakeMonthlyInvoices/sb5_2026-10", { storeId: "sb5", month: "2026-10", status: "paid", amountJpy: 100 });
r = await sweep();
const h1 = (r.body.results || []);
t("H1 支払いが済んだ退会は、定期実行で最終削除まで進む（ub1・ub5 completed、未払いの ub2 は待つ）", r.code === 200 && doc("accountDeletions/ub1").status === "completed" && doc("accountDeletions/ub5").status === "completed" && doc("accountDeletions/ub2").status === "awaiting_settlement" && deleted().includes("ub1") && deleted().includes("ub5") && !deleted().includes("ub2"), { r: r.body, ub2: doc("accountDeletions/ub2") });
t("H2 最終削除：カードを Stripe から外し、カードの記録・owner の関係を外す（Customer は削除しない）", ST.pm.get("pm_ub5card").customer === null && doc("accountBilling/ub5") === null && doc("storeMembers/sb5_ub5").status === "removed" && !ST.customerDeleted && doc("accountDeletions/ub5").stripeCustomerIds.test === "cus_ub5", doc("accountDeletions/ub5"));
t("H3 請求・取引の記録（請求書・料金台帳）は残る", doc("imadakeMonthlyInvoices/sb5_2026-10").status === "paid" && doc("imadakePostDailyCharges/pb5_2026-10-20") !== null);
t("H4 カードの記録を待っている間（清算待ち）でもカードを外すのは清算の後だけ（ub2 のカードは残る）", doc("accountBilling/ub2").test.paymentMethodId === "pm_ub2card" && ST.pm.get("pm_ub2card").customer === "cus_ub2");

// ---- I: monthly plan (decision 2) ----
seedAccount("up1", ["sp1"]);
put("storeCustomPlans/sp1", { storeId: "sp1", status: "active", ownerUid: "up1", billingAccountUid: "up1", periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(Date.now() - 40 * 86400000), accessUntil: null, paymentStatus: "current", revision: 1 });
r = await del("up1");
const usageKey = [...S.docs.keys()].find((k) => k.startsWith("storeCustomPlanUsage/sp1_"));
t("I1 ②月額100円の契約中：退会の受付で解約し（canceling）、当月分を記録して清算待ち", r.code === 202 && r.body.status === "awaiting_settlement" && r.body.blockers.includes("custom_plan_unbilled") && doc("storeCustomPlans/sp1").status === "canceling" && usageKey && doc(usageKey).status === "accrued" && doc(usageKey).billingAccountUid === "up1" && awaiting("up1", "sp1"), { r: r.body, plan: doc("storeCustomPlans/sp1"), usage: usageKey && doc(usageKey) });
doc(usageKey).status = "invoiced";
put("storeCustomPlanInvoices/" + usageKey.split("/")[1], { storeId: "sp1", billingAccountUid: "up1", status: "charging" });
r = await sweep();
t("I2 当月分の請求が処理中（charging）の間は削除しない", doc("accountDeletions/up1").status === "awaiting_settlement" && !deleted().includes("up1"), doc("accountDeletions/up1"));
doc("storeCustomPlanInvoices/" + usageKey.split("/")[1]).status = "paid";
resetRate();
r = await del("up1");
t("I3 当月分の支払いの後、本人の再操作でも最終削除できる（200 completed）", r.code === 200 && r.body.status === "completed" && deleted().includes("up1"), r.body);

// ===================== C: immediate deletion when settled =====================
r = await del("u1", {});
t("C1 確認の印（confirm: true）が無ければ削除しない（400 confirm_required）", r.code === 400 && r.body.reason === "confirm_required" && noChange("u1", "s1"), r.body);
const callsBefore = ST.calls.length; const cldBefore = CLD_CALLS.length;
r = await del("u1");
t("C2 清算済み：削除は 200 completed", r.code === 200 && r.body.success === true && r.body.status === "completed", r.body);
t("C3 店舗情報は非公開（draft）・店舗は無効（owner_account_deleted）・文書は残る", doc("storeProfiles/s1").status === "draft" && doc("storeProfiles/s1").unpublishedReason === "account_deletion" && doc("storeAccounts/s1").enabled === false && doc("storeAccounts/s1").disabledReason === "owner_account_deleted", { p: doc("storeProfiles/s1"), a: doc("storeAccounts/s1") });
t("C4 今だけ投稿：掲載中は終了・審査待ちは取り下げ・終了済みはそのまま・投稿枠は空", doc("imadakePosts/p1").status === "ended" && doc("imadakePosts/p1").endedByType === "account_deletion" && doc("imadakePosts/p2").status === "withdrawn" && doc("imadakePosts/p3").status === "ended" && !doc("imadakePosts/p3").endedByType && doc("imadakeStoreSlots/s1").activePostId === "" && doc("imadakeStoreSlots/s1").pendingPostId === "", { p1: doc("imadakePosts/p1"), slot: doc("imadakeStoreSlots/s1") });
t("C5 ④Stripe：カードを照会して取り外す（顧客は削除しない・請求は作らない）", ST.calls.slice(callsBefore).join(",") === "GET /v1/payment_methods/pm_u1card,POST /v1/payment_methods/pm_u1card/detach" && ST.pm.get("pm_u1card").customer === null, ST.calls.slice(callsBefore));
t("C6 カードの記録（accountBilling）は消える", doc("accountBilling/u1") === null, doc("accountBilling/u1"));
t("C7 店舗との関係（owner）は外れる（文書は履歴として残る）", doc("storeMembers/s1_u1").status === "removed" && doc("storeMembers/s1_u1").removedReason === "account_deletion", doc("storeMembers/s1_u1"));
t("C8 ログイン（Firebase Authentication の利用者）は削除される", deleted().includes("u1"), deleted());
const rec = doc("accountDeletions/u1");
t("C9 ⑦削除の記録：完了・店舗ID・照合用の Stripe の顧客ID は残る、メールアドレスは記録しない", rec && rec.status === "completed" && JSON.stringify(rec.storeIds) === JSON.stringify(["s1"]) && rec.stripeCustomerIds && rec.stripeCustomerIds.test === "cus_u1" && !JSON.stringify(rec).includes("@example"), rec);
t("C10 請求・取引の記録（請求書）は残る", doc("imadakeMonthlyInvoices/s1_2026-09") && doc("imadakeMonthlyInvoices/s1_2026-09").status === "paid");
const listedAfter = await listedIds();
t("C11 旅行者向けの一覧に、削除した店舗は出ない（削除の前は出ていた）", listedBefore.includes("sp_s1") && !listedAfter.includes("sp_s1"), listedAfter);
t("C12 削除の応答にカード・Stripe の ID を含めない", !/pm_|cus_|4242/.test(JSON.stringify(r.body)), r.body);
t("C13 ⑨店舗の写真（この店舗のフォルダーの画像）を Cloudinary から削除し、文書から外す", JSON.stringify(CLD_CALLS.slice(cldBefore)) === JSON.stringify([photoId("s1", "free1")]) && doc("storeProfiles/s1").photos.length === 0 && rec.photosDeletedCount === 1, { calls: CLD_CALLS.slice(cldBefore), photos: doc("storeProfiles/s1").photos });

// ===================== P: photos (shared / foreign images are never deleted) =====================
seedAccount("uph", ["sph"]);
doc("storeProfiles/sph").photos.push({ url: CLD + "v1/machinau_submissions/orig1.webp", publicId: "machinau_submissions/orig1", moderationStatus: "passed" });
doc("storeProfiles/sph").photos.push({ url: CLD + "v1/" + photoId("other", "x") + ".webp", publicId: photoId("other", "x"), moderationStatus: "passed" });
put("storeCustomProfiles/sph", { storeId: "sph", menuItems: [{ name: "a", photo: { url: CLD + "v1/" + photoId("sph", "menu/m1") + ".webp", publicId: photoId("sph", "menu/m1") } }, { name: "b", photo: null }] });
const cldP = CLD_CALLS.length;
r = await del("uph");
t("P1 写真：自店舗のフォルダーの画像（店舗写真・商品写真）だけを消す。運営掲載の元画像・他店舗の画像は消さない", r.code === 200 && JSON.stringify(CLD_CALLS.slice(cldP).sort()) === JSON.stringify([photoId("sph", "free1"), photoId("sph", "menu/m1")].sort()) && doc("storeProfiles/sph").photos.length === 2 && doc("storeCustomProfiles/sph").menuItems[0].photo === null, { calls: CLD_CALLS.slice(cldP), photos: doc("storeProfiles/sph").photos });
seedAccount("upf", ["spf"]);
cldFail = true;
r = await del("upf");
cldFail = false;
t("P2 写真の削除に失敗しても退会は完了し、消せなかった画像は記録に残す（文書にも残す）", r.code === 200 && doc("accountDeletions/upf").photoDeleteFailedIds.includes(photoId("spf", "free1")) && doc("storeProfiles/spf").photos.length === 1, doc("accountDeletions/upf"));
// 別の人が owner になった店舗(記録上の店舗ID)には触れない
seedAccount("uo1", ["so1"]);
put("storeCustomPlanUsage/so1_2026-10", { storeId: "so1", month: "2026-10", billingAccountUid: "uo1", holderUid: "uo1", status: "accrued" });
await del("uo1");
put("storeMembers/so1_uo1", { storeId: "so1", uid: "uo1", role: "owner", status: "removed", removedReason: "transfer" });
put("storeMembers/so1_uo2", { storeId: "so1", uid: "uo2", role: "owner", status: "active" });
doc("storeAccounts/so1").enabled = true; doc("storeProfiles/so1").status = "published";
doc("storeCustomPlanUsage/so1_2026-10").status = "invoiced";
const cldO = CLD_CALLS.length;
await sweep();
t("P3 記録にある店舗でも、後から別の人の店舗になっていれば非公開にも写真の削除もしない", doc("accountDeletions/uo1").status === "completed" && doc("storeAccounts/so1").enabled === true && doc("storeProfiles/so1").status === "published" && CLD_CALLS.length === cldO, { rec: doc("accountDeletions/uo1"), a: doc("storeAccounts/so1") });

// 有効な owner が他にもいる店舗(共同の管理)の写真は消さない
seedAccount("uo3", ["so3"]); seedAccount("uo4", ["so3"], { card: false });
const cldO3 = CLD_CALLS.length;
r = await del("uo3");
t("P4 他にも有効な owner がいる店舗の写真は消さない（その人の掲載を壊さない）", r.code === 200 && CLD_CALLS.length === cldO3 && doc("storeProfiles/so3").photos.length === 1, { r: r.body, calls: CLD_CALLS.slice(cldO3) });

// ===================== L: operator listing taken over (decision 3) =====================
seedAccount("ul1", ["sl1"]);
put("submissions/sub1", { shopName: "運営掲載の店", status: "approved" });
put("storeListingLinks/sub1", { status: "active", storeId: "sl1", claimId: "c1" });
let pb = await publicBody();
t("L0 （前提）引き継いだ店舗が公開中は、運営掲載は外れている（suppressed）", (pb.suppressedListingIds || []).includes("sub1"), pb);
r = await del("ul1");
pb = await publicBody();
t("L1 ③店主の退会後も運営掲載は自動で再表示しない（suppressed・withdrawn に入る。紐付けは保持）", r.code === 200 && (pb.suppressedListingIds || []).includes("sub1") && (pb.withdrawnListingIds || []).includes("sub1") && (pb.claimedListingIds || []).includes("sub1") && doc("storeListingLinks/sub1").status === "active" && doc("storeListingLinks/sub1").listingHiddenReason === "owner_account_deleted", { pb, link: doc("storeListingLinks/sub1") });
doc("storeListingLinks/sub1").status = "revoked";
pb = await publicBody();
t("L2 運営が紐付けを解除した時だけ、運営掲載が再び表示される", !(pb.suppressedListingIds || []).includes("sub1") && !(pb.withdrawnListingIds || []).includes("sub1"), pb);

// ===================== D: repeat / double =====================
const callsD = ST.calls.length, authCount = deleted().length;
r = await del("u1");
t("D1 もう一度の削除：200 completed のまま・Stripe にもログインにも何もしない（二重実行で壊れない）", r.code === 200 && r.body.status === "completed" && ST.calls.length === callsD && deleted().length === authCount, r.body);
seedAccount("u2", ["s2"]);
const [d1, d2] = await Promise.all([call("storeAccountDelete", { confirm: true }, "u2"), call("storeAccountDelete", { confirm: true }, "u2")]);
const codes = [d1.code, d2.code].sort();
t("D2 同時の削除：一方は連打の制限（429）、一方だけが進む", JSON.stringify(codes) === JSON.stringify([200, 429]) && deleted().filter((x) => x === "u2").length === 1, { codes, a: d1.body, b: d2.body });
seedAccount("u2b", ["s2b"]);
put("storeCustomPlanUsage/s2b_2026-10", { storeId: "s2b", month: "2026-10", billingAccountUid: "u2b", holderUid: "u2b", status: "accrued" });
await del("u2b"); doc("storeCustomPlanUsage/s2b_2026-10").status = "invoiced";
resetRate();
const [sw, own] = await Promise.all([sweep(), call("storeAccountDelete", { confirm: true }, "u2b")]);
t("D3 定期実行と本人の操作が同時でも、最終削除は1回だけ（ログインの削除は1回）", doc("accountDeletions/u2b").status === "completed" && deleted().filter((x) => x === "u2b").length === 1, { sw: sw.body, own: own.body });

// ===================== E: failure in the middle & resume =====================
seedAccount("u3", ["s3"]);
ST.detachFail = true;
r = await del("u3");
t("E1 Stripe の取り外しに失敗：202 card_detach_pending（ログインは消さない・カードの記録は取り外し待ちで残る）", r.code === 202 && r.body.status === "card_detach_pending" && !deleted().includes("u3") && doc("accountBilling/u3") && doc("accountBilling/u3").test.paymentMethodId === "" && doc("accountBilling/u3").test.card === null && doc("accountBilling/u3").test.detachPendingPaymentMethods.length === 1 && doc("accountDeletions/u3").status === "card_detach_pending", { r: r.body, b: doc("accountBilling/u3"), rec: doc("accountDeletions/u3") });
t("E2 失敗しても店舗は非公開・無効のまま（途中まで進んだ状態が保たれる）", doc("storeProfiles/s3").status === "draft" && doc("storeAccounts/s3").enabled === false);
resetRate();
r = await call("storeBillingSetupIntentCreate", {}, "u3");
t("E3 最終削除の途中は、新しいカードの登録を始めない（409 account_deleting・Stripe に何も作らない）", r.code === 409 && r.body.reason === "account_deleting", r.body);
ST.detachFail = false;
doc("accountBilling/u3").test.detachPendingPaymentMethods[0].nextRetryAtMs = 0; // 再試行の時刻が来たとみなす
r = await del("u3");
t("E4 再実行：続きから進み 200 completed（取り外し・関係の解除・カードの記録の削除・ログインの削除）", r.code === 200 && r.body.status === "completed" && ST.pm.get("pm_u3card").customer === null && doc("accountBilling/u3") === null && deleted().includes("u3") && doc("storeMembers/s3_u3").status === "removed", { r: r.body, rec: doc("accountDeletions/u3") });
seedAccount("u4", ["s4"]);
globalThis.__MOCK_AUTH_DELETE_FAIL = true;
r = await del("u4");
t("E5 ログインの削除に失敗：500・削除の記録は auth_delete_pending（カードと関係は既に外れている）", r.code === 500 && doc("accountDeletions/u4").status === "auth_delete_pending" && doc("accountBilling/u4") === null && !deleted().includes("u4"), { r: r.body, rec: doc("accountDeletions/u4") });
globalThis.__MOCK_AUTH_DELETE_FAIL = false;
r = await sweep();
t("E6 定期実行の再実行：ログインを削除して completed", deleted().includes("u4") && doc("accountDeletions/u4").status === "completed", r.body);
// 最終削除の途中で未清算が見つかった(同時の料金)：清算待ちへ戻す
seedAccount("u5", ["s5"]);
globalThis.__TX_AFTER_COMMIT = async () => {
  if (doc("storeProfiles/s5") && doc("storeProfiles/s5").status === "draft" && !doc("imadakeMonthlyInvoices/s5_2026-10")) put("imadakeMonthlyInvoices/s5_2026-10", { storeId: "s5", month: "2026-10", status: "closing" });
};
r = await del("u5");
globalThis.__TX_AFTER_COMMIT = undefined;
t("E7 最終削除の直前に未清算が見つかった：カード・ログインは残し、清算待ち（awaiting_settlement）へ戻す", r.code === 202 && r.body.status === "awaiting_settlement" && r.body.blockers.includes("imadake_invoice_unsettled") && doc("accountBilling/u5").test.paymentMethodId === "pm_u5card" && !deleted().includes("u5") && doc("accountDeletions/u5").status === "awaiting_settlement", { r: r.body, rec: doc("accountDeletions/u5") });

// ---- K: repeated detach failure stops & operator resume (decision 10) ----
seedAccount("uk1", ["sk1"]);
ST.detachFail = true;
r = await del("uk1");
let k = 0;
while (doc("accountDeletions/uk1").status === "card_detach_pending" && k < 12) {
  doc("accountBilling/uk1").test.detachPendingPaymentMethods.forEach((e) => { e.nextRetryAtMs = 0; });
  await sweep(); k++;
}
const callsK = ST.calls.length;
await sweep(); resetRate(); const kOwn = await del("uk1");
t("K1 ⑩取り外しが上限まで失敗：card_detach_failed で停止し、運営の確認の印を付ける（ログイン・カードの記録は残る）", doc("accountDeletions/uk1").status === "card_detach_failed" && doc("accountDeletions/uk1").operatorAttention && doc("accountDeletions/uk1").operatorAttention.reason === "card_detach_failed" && !deleted().includes("uk1") && doc("accountBilling/uk1") !== null && k <= 6, { k, rec: doc("accountDeletions/uk1") });
t("K2 停止の後は、定期実行でも本人の操作でも Stripe へ再試行しない（無制限に再試行しない）", ST.calls.length === callsK && kOwn.code === 202 && kOwn.body.status === "card_detach_failed", { calls: ST.calls.slice(callsK), own: kOwn.body });
r = await check("uk1");
t("K3 本人の確認画面には「運営が確認中」の状態を返す", r.body.deletionStatus === "card_detach_failed", r.body);
r = await call("adminAccountDeletionList", {}, "uk1");
const rl = await call("adminAccountDeletionList", {}, "adm");
t("K4 運営の一覧：運営以外は 403、運営には停止中（needsOperator）の記録が見える（カード・メールは返さない）", r.code === 403 && rl.code === 200 && rl.body.records.some((x) => x.uid === "uk1" && x.needsOperator === true) && !/pm_|cus_|@example/.test(JSON.stringify(rl.body)), { r: r.body, rl: rl.body });
r = await call("adminAccountDeletionResume", { uid: "uk1" }, "uk1");
t("K5 再開は運営だけ（店主は 403）", r.code === 403, r.body);
r = await call("adminAccountDeletionResume", { uid: "u5" }, "adm");
t("K6 停止していない退会は再開できない（409 not_resumable・清算待ちの判定を飛ばさない）", r.code === 409 && r.body.reason === "not_resumable" && doc("accountDeletions/u5").status === "awaiting_settlement", r.body);
ST.detachFail = false;
r = await call("adminAccountDeletionResume", { uid: "uk1" }, "adm");
t("K7 原因の解消後に運営が再開：取り外して completed（成功を偽装せず Stripe で実際に取り外す）", r.code === 200 && r.body.status === "completed" && ST.pm.get("pm_uk1card").customer === null && deleted().includes("uk1"), { r: r.body, rec: doc("accountDeletions/uk1") });

// ===================== F: card confirm race / multiple stores / production test card / unverified =====================
seedAccount("u6", ["s6"], { card: false });
resetRate();
const startR = await call("storeBillingSetupIntentCreate", {}, "u6");
put("accountDeletions/u6", { uid: "u6", status: "finalizing" });
r = await call("storeBillingSetupConfirm", { setupIntentId: startR.body.setupIntentId, consentVersion: SB.STORE_BILLING_CONSENT_VERSION }, "u6");
t("F1 最終削除を始めた後のカードの確定は保存しない（409 account_deleting・カードは記録されない）", startR.code === 200 && r.code === 409 && r.body.reason === "account_deleting" && !(doc("accountBilling/u6").test || {}).paymentMethodId, { start: startR.body, r: r.body });
seedAccount("u7", ["s7a", "s7b"]);
r = await del("u7");
t("F2 複数の店舗：すべて非公開・無効にして削除", r.code === 200 && ["s7a", "s7b"].every((s) => doc("storeProfiles/" + s).status === "draft" && doc("storeAccounts/" + s).enabled === false && doc("storeMembers/" + s + "_u7").status === "removed"), r.body);
setEnv(PROD_NO_STRIPE);
seedAccount("u8", ["s8"]);
const callsF = ST.calls.length;
r = await del("u8");
setEnv(PREVIEW);
t("F3 本番でテストモードのカードだけが残っている（本番のカード登録は使えない）：Stripe に送らず手元の記録だけを消して削除", r.code === 200 && ST.calls.length === callsF && doc("accountBilling/u8") === null && deleted().includes("u8"), r.body);
seedAccount("u9", [], { card: false });
r = await del("u9");
t("F4 店舗もカードも無いアカウント：そのまま削除できる", r.code === 200 && deleted().includes("u9"), r.body);
r = await del("u0");
t("F5 ⑧メール未確認・登録途中のアカウント（店舗・カードなし）：本人が削除できる", r.code === 200 && r.body.status === "completed" && deleted().includes("u0"), r.body);
seedAccount("u10", ["s10"], { verified: false });
put("imadakeMonthlyInvoices/s10_2026-09", { storeId: "s10", month: "2026-09", status: "payment_failed" });
r = await del("u10");
t("F6 ⑧メール未確認でも、店舗・未払いの紐付けはサーバーで検査する（未払いがあれば清算待ち・ログインは残す）", r.code === 202 && r.body.status === "awaiting_settlement" && !deleted().includes("u10"), r.body);

// ===================== N: STEP 47-C ④ cancel before final deletion =====================
const cancel = async (token, body = { confirm: true }) => { resetRate(); return call("storeAccountDeletionCancel", body, token); };
seedAccount("un1", ["sn1"]);
put("imadakePosts/pn1", { storeId: "sn1", status: "published", expiresAt: { toMillis: () => Date.now() + 3600e3 } });
put("imadakeStoreSlots/sn1", { activePostId: "pn1" });
put("storeCustomPlans/sn1", { storeId: "sn1", status: "active", ownerUid: "un1", billingAccountUid: "un1", periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(Date.now() - 40 * 86400000), accessUntil: null, paymentStatus: "current", revision: 1 });
put("imadakeMonthlyInvoices/sn1_2026-09", { storeId: "sn1", month: "2026-09", status: "payment_failed", amountJpy: 100, chargeBillingAccountUid: "un1" });
put("submissions/subn1", { shopName: "運営掲載", status: "approved" });
put("storeListingLinks/subn1", { status: "active", storeId: "sn1" });
r = await del("un1");
const chkN = await check("un1");
t("N0 （前提）未払いがあるので清算待ち・取り消しできる状態（cancelable）", r.code === 202 && chkN.body.deletionStatus === "awaiting_settlement" && chkN.body.cancelable === true, { r: r.body, c: chkN.body });
r = await cancel("un1", {});
t("N1 確認の印が無ければ取り消さない（400）", r.code === 400 && doc("accountDeletions/un1").status === "awaiting_settlement", r.body);
r = await cancel("u10");
const otherBefore = JSON.stringify(doc("accountDeletions/un1"));
t("N2 他人の退会は取り消せない（自分の uid の記録だけ）", JSON.stringify(doc("accountDeletions/un1")) === otherBefore && doc("accountDeletions/un1").status === "awaiting_settlement");
r = await cancel("un1");
const evN = [...S.docs.keys()].filter((k) => k.startsWith("accountDeletionEvents/un1_"));
t("N3 清算待ちの間は本人が取り消せる（200 canceled・履歴を残す）", r.code === 200 && r.body.status === "canceled" && doc("accountDeletions/un1").status === "canceled" && evN.length === 1, { r: r.body, ev: evN });
t("N4 取り消し後：店舗の無効は戻すが、店舗情報は非公開のまま（自動で再公開しない）", doc("storeAccounts/sn1").enabled === true && doc("storeAccounts/sn1").disabledReason === "" && doc("storeProfiles/sn1").status === "draft", { a: doc("storeAccounts/sn1"), p: doc("storeProfiles/sn1").status });
t("N5 取り消し後：終了した今だけ投稿は復活させない・月額プランは再契約しない（解約のまま）", doc("imadakePosts/pn1").status === "ended" && doc("storeCustomPlans/sn1").status === "canceling", { post: doc("imadakePosts/pn1").status, plan: doc("storeCustomPlans/sn1").status });
t("N6 取り消し後：退会の前の請求の義務は残る（未払いの請求書はそのまま）・カードとログインも残る", doc("imadakeMonthlyInvoices/sn1_2026-09").status === "payment_failed" && doc("accountBilling/un1").test.paymentMethodId === "pm_un1card" && !deleted().includes("un1"));
t("N7 取り消し後：運営掲載は自動で再表示しない（非公開の印は残す）", doc("storeListingLinks/subn1").listingHiddenReason === "owner_account_deleted" && ((await publicBody()).suppressedListingIds || []).includes("subn1"));
const chkN2 = await check("un1");
const cardN = await CR.checkAccountBillingCard((await import("firebase-admin/firestore")).getFirestore(), "un1", { env: process.env });
t("N8 取り消し後は退会中として扱わない（確認の状態は空・店舗の登録等のカード確認も通る）", chkN2.body.deletionStatus === "" && cardN.ok === true, { c: chkN2.body, cardN });
r = await sweep();
t("N9 取り消した退会は定期実行でも削除しない", doc("accountDeletions/un1").status === "canceled" && !deleted().includes("un1"), r.body);
r = await cancel("un1");
t("N10 もう一度の取り消しは 409（退会の記録が無い扱い）", r.code === 409 && r.body.reason === "deletion_not_requested", r.body);
r = await del("un1");
t("N11 取り消しの後でも、もう一度退会を申し込める（清算待ち）", r.code === 202 && doc("accountDeletions/un1").status === "awaiting_settlement" && doc("storeAccounts/sn1").enabled === false, r.body);
// 最終削除の開始後は取り消せない
put("accountDeletions/un2", { uid: "un2", status: "finalizing", finalizeLeaseUntilMs: Date.now() + 60000 }); globalThis.__MOCK_TOKENS.un2 = tok("un2", "un2@example.com");
put("accountDeletions/un3", { uid: "un3", status: "card_detach_pending" }); globalThis.__MOCK_TOKENS.un3 = tok("un3", "un3@example.com");
const c2 = await cancel("un2"), c3 = await cancel("un3");
t("N12 最終削除が始まった後（finalizing・card_detach_pending）は取り消せない（409 deletion_in_progress・状態は変えない）", c2.code === 409 && c2.body.reason === "deletion_in_progress" && c3.code === 409 && doc("accountDeletions/un2").status === "finalizing" && doc("accountDeletions/un3").status === "card_detach_pending", { c2: c2.body, c3: c3.body });
// 取り消しと最終削除の同時：片方だけが成立する
let raceOk = true; const raceLog = [];
for (let i = 0; i < 6; i++) {
  const u = "ur" + i, st = "sr" + i;
  seedAccount(u, [st]);
  put("storeCustomPlanUsage/" + st + "_2026-10", { storeId: st, month: "2026-10", billingAccountUid: u, holderUid: u, status: "accrued" });
  await del(u);
  doc("storeCustomPlanUsage/" + st + "_2026-10").status = "invoiced";
  resetRate();
  const order = i % 2 === 0 ? [call("storeAccountDeletionCancel", { confirm: true }, u), sweep()] : [sweep(), call("storeAccountDeletionCancel", { confirm: true }, u)];
  const [a, b] = await Promise.all(order);
  const cRes = i % 2 === 0 ? a : b;
  const status = doc("accountDeletions/" + u).status;
  const ok = (status === "canceled" && cRes.code === 200 && !deleted().includes(u) && doc("accountBilling/" + u) !== null && doc("storeAccounts/" + st).enabled === true) ||
    (status === "completed" && cRes.code === 409 && deleted().includes(u) && doc("storeAccounts/" + st).enabled === false);
  raceLog.push({ u, status, cancel: cRes.code });
  raceOk = raceOk && ok;
}
t("N13 取り消しと自動の最終削除が同時でも、どちらか一方だけが成立する（取り消し＝何も消さない／削除＝取り消しは 409）", raceOk, raceLog);
// 退会の受付の処理の途中で取り消された：取り消しの後に店舗を非公開にしない・投稿を終えない
const SAD = await import(REPO_URL + "/api/_lib/store-account-deletion.js");
const FSM = await import("firebase-admin/firestore");
seedAccount("un5", ["sn5"]);
put("imadakePosts/pn5", { storeId: "sn5", status: "published", expiresAt: { toMillis: () => Date.now() + 3600e3 } });
put("storeCustomPlanUsage/sn5_2026-10", { storeId: "sn5", month: "2026-10", billingAccountUid: "un5", holderUid: "un5", status: "accrued" });
let canceledMid = false;
globalThis.__TX_AFTER_COMMIT = async () => {
  if (!canceledMid && doc("accountDeletions/un5") && doc("accountDeletions/un5").status === "awaiting_settlement") {
    canceledMid = true;
    await SAD.cancelAccountDeletion(FSM.getFirestore(), {}, "un5");
  }
};
r = await del("un5");
globalThis.__TX_AFTER_COMMIT = undefined;
t("N15 受付の処理の途中で取り消し：取り消しの後に店舗を非公開・無効にせず、今だけ投稿も終えない", canceledMid && doc("accountDeletions/un5").status === "canceled" && doc("storeAccounts/sn5").enabled === true && doc("storeProfiles/sn5").status === "published" && doc("imadakePosts/pn5").status === "published" && !deleted().includes("un5"), { r: r.body, rec: doc("accountDeletions/un5"), a: doc("storeAccounts/sn5"), p: doc("storeProfiles/sn5").status, post: doc("imadakePosts/pn5").status });

// 退会の前から運営が止めていた店舗は、取り消しでも有効に戻さない
seedAccount("un4", ["sn4"]);
doc("storeAccounts/sn4").enabled = false; doc("storeAccounts/sn4").disabledReason = "operator_suspended";
put("storeCustomPlanUsage/sn4_2026-10", { storeId: "sn4", month: "2026-10", billingAccountUid: "un4", holderUid: "un4", status: "accrued" });
await del("un4");
const kept = doc("storeAccounts/sn4").disabledReason;
await cancel("un4");
t("N14 退会の前から運営が無効にしていた店舗：理由を上書きせず、取り消しでも有効に戻さない", kept === "operator_suspended" && doc("storeAccounts/sn4").enabled === false && doc("storeAccounts/sn4").disabledReason === "operator_suspended", doc("storeAccounts/sn4"));

// ===================== O: STEP 47-C ① operator accounts are protected on the server side =====================
put("operators/uop1", { role: "editor", active: true }); globalThis.__MOCK_TOKENS.uop1 = tok("uop1", "uop1@example.com");
put("accountDeletions/uop1", { uid: "uop1", status: "awaiting_settlement", storeIds: [] });
put("accountDeletions/adm", { uid: "adm", status: "awaiting_settlement", storeIds: [] });
r = await sweep();
t("O1 ログインの無い自動の最終削除でも、運営（Editor・ADMIN_EMAIL）のアカウントは削除しない（operator_protected で停止）", doc("accountDeletions/uop1").status === "operator_protected" && doc("accountDeletions/adm").status === "operator_protected" && !deleted().includes("uop1") && !deleted().includes("adm"), { o: doc("accountDeletions/uop1"), a: doc("accountDeletions/adm") });
t("O2 運営アカウントの停止は運営への異常として1件ずつ記録し、最初の実行で知らせる（500 operator_attention_required）", r.code === 500 && r.body.reason === "operator_attention_required" && r.body.operatorAttention.operator_account_protected === 2 && doc("operatorAlerts/account_deletion_operator_account_protected_uop1").status === "open", r.body);
r = await call("adminAccountDeletionResume", { uid: "uop1" }, "adm");
t("O3 運営アカウントの停止は「再開」でも削除に進めない（409）", r.code === 409 && !deleted().includes("uop1"), r.body);

// ===================== S: STEP 47-C ② sweep lock / double start =====================
const SL = [];
for (let i = 0; i < 3; i++) { const u = "us" + i; seedAccount(u, ["ss" + i]); put("storeCustomPlanUsage/ss" + i + "_2026-10", { storeId: "ss" + i, month: "2026-10", billingAccountUid: u, holderUid: u, status: "accrued" }); await del(u); doc("storeCustomPlanUsage/ss" + i + "_2026-10").status = "invoiced"; SL.push(u); }
const authBeforeS = deleted().length, callsBeforeS = ST.calls.length;
const [sa1, sa2, sa3] = await Promise.all([sweep(), sweep(), sweep()]);
const lockedCount = [sa1, sa2, sa3].filter((x) => x.body && x.body.status === "locked").length;
t("S1 定期実行が同時に3つ起動しても、進めるのは1つだけ（残りは locked）・各アカウントの削除は1回", lockedCount === 2 && SL.every((u) => doc("accountDeletions/" + u).status === "completed" && deleted().filter((x) => x === u).length === 1) && deleted().length - authBeforeS === 3, { codes: [sa1, sa2, sa3].map((x) => x.body && x.body.status), log: SL.map((u) => doc("accountDeletions/" + u).status) });
t("S2 Stripe の取り外しも各カード1回だけ（二重に外さない）", SL.every((u) => ST.calls.slice(callsBeforeS).filter((c) => c === "POST /v1/payment_methods/pm_" + u + "card/detach").length === 1), ST.calls.slice(callsBeforeS));
put("accountDeletionSweepLocks/main", { runId: "other", leaseUntilMs: Date.now() + 60000 });
r = await sweep();
t("S3 別の定期実行が動いている間（ロックが有効）は何もしない", r.code === 200 && r.body.status === "locked" && r.body.processed === 0, r.body);
put("accountDeletionSweepLocks/main", { runId: "other", leaseUntilMs: Date.now() - 1 });
r = await sweep();
t("S4 止まった定期実行のロックは期限で外れ、次の実行が進める", r.code === 200 && r.body.status === "done", r.body);

// ===================== A2: STEP 47-C ③ alerts — dedupe, no personal data, notification failure =====================
seedAccount("ua1", ["sa1"]);
ST.detachFail = true;
await del("ua1");
let lastFailSweep = null;
for (let i = 0; i < 8 && doc("accountDeletions/ua1").status === "card_detach_pending"; i++) { doc("accountBilling/ua1").test.detachPendingPaymentMethods.forEach((e) => { e.nextRetryAtMs = 0; }); globalThis.__QUERY_FAIL = "operatorAlerts"; lastFailSweep = await sweep(); delete globalThis.__QUERY_FAIL; }
const alertKey = "operatorAlerts/account_deletion_card_detach_failed_ua1";
t("A21 通知の準備（未通知の異常の読み取り）に失敗しても、定期実行は正常に終わり（200）、削除の状態は安全に停止したまま（card_detach_failed・ログインは残る）・異常は未通知で残る", lastFailSweep && lastFailSweep.code === 200 && lastFailSweep.body.processed >= 1 && doc("accountDeletions/ua1").status === "card_detach_failed" && !deleted().includes("ua1") && doc(alertKey) && doc(alertKey).status === "open" && !doc(alertKey).signaledAt, { rec: doc("accountDeletions/ua1"), alert: doc(alertKey) });
r = await sweep();
t("A22 次の実行で知らせる（500 operator_attention_required・種類と件数だけ。uid・メール・カードの情報なし）", r.code === 500 && r.body.operatorAttention.card_detach_failed === 1 && !/ua1|@example|pm_|cus_|4242/.test(JSON.stringify(r.body)), r.body);
r = await sweep(); const r2 = await sweep();
t("A23 同じ異常は二度と知らせない（以後は 200）・異常の記録は1件だけ", r.code === 200 && r2.code === 200 && [...S.docs.keys()].filter((k) => k.startsWith("operatorAlerts/") && k.includes("ua1")).length === 1, { r: r.body, r2: r2.body });
const listA = await call("adminAccountDeletionList", {}, "adm");
t("A24 運営の一覧に未解決の異常が出る（運営のみ）", listA.code === 200 && listA.body.openAlerts.some((a) => a.kind === "card_detach_failed" && a.uid === "ua1"), listA.body.openAlerts);
ST.detachFail = false;
r = await call("adminAccountDeletionResume", { uid: "ua1" }, "adm");
t("A25 運営が再開して完了すると、異常は解決済みになる", r.code === 200 && r.body.status === "completed" && doc(alertKey).status === "resolved", { r: r.body, alert: doc(alertKey) });
// ログインの削除が何度も失敗：停止として知らせる
seedAccount("ua2", []);
globalThis.__MOCK_AUTH_DELETE_FAIL = true;
await del("ua2"); for (let i = 0; i < 3; i++) await sweep();
globalThis.__MOCK_AUTH_DELETE_FAIL = false;
t("A26 ログインの削除が繰り返し失敗：最終削除の停止として運営への異常を記録する", doc("accountDeletions/ua2").status === "auth_delete_pending" && doc("operatorAlerts/account_deletion_final_deletion_stalled_ua2") && doc("operatorAlerts/account_deletion_final_deletion_stalled_ua2").detail === "auth_delete", doc("accountDeletions/ua2"));
r = await sweep();
t("A27 原因が解消すれば次の自動の実行で完了し、異常は解決済み", doc("accountDeletions/ua2").status === "completed" && deleted().includes("ua2") && doc("operatorAlerts/account_deletion_final_deletion_stalled_ua2").status === "resolved", r.body);

// 清算待ちの間に、この環境では外せない本番のカードが見つかった：削除せず、運営への異常として知らせる
seedAccount("ua3", []);
doc("accountBilling/ua3").live = { customerId: "cus_liveua3", paymentMethodId: "pm_liveua3", card: { last4: "1111" }, setupStatus: "succeeded" };
put("accountDeletions/ua3", { uid: "ua3", status: "awaiting_settlement", storeIds: [] });
r = await sweep();
t("A28 最終削除の直前に外せない本番のカード：削除せず清算待ちのまま・運営への異常（card_removal_unavailable）を記録して知らせる", doc("accountDeletions/ua3").status === "awaiting_settlement" && !deleted().includes("ua3") && doc("accountBilling/ua3").live.paymentMethodId === "pm_liveua3" && doc("operatorAlerts/account_deletion_final_deletion_stalled_ua3") && doc("operatorAlerts/account_deletion_final_deletion_stalled_ua3").detail === "card_removal_unavailable" && r.code === 500 && r.body.operatorAttention.final_deletion_stalled === 1, { r: r.body, rec: doc("accountDeletions/ua3") });

// ===================== STEP 47-D: no automatic sweep in Production until approved =====================
setEnv(PROD_NO_STRIPE);
put("accountDeletions/uzp", { uid: "uzp", status: "awaiting_settlement", storeIds: [] }); globalThis.__MOCK_TOKENS.uzp = tok("uzp", "uzp@example.com");
r = await sweep();
setEnv(PREVIEW);
const SADM = await import(REPO_URL + "/api/_lib/store-account-deletion.js");
t("P47D1 本番（Production）では自動の最終削除は動かない（403 sweep_disabled・何も削除しない）・許可は false", r.code === 403 && r.body.reason === "sweep_disabled" && doc("accountDeletions/uzp").status === "awaiting_settlement" && !deleted().includes("uzp") && SADM.ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED === false && SADM.isAccountDeletionSweepAllowed({ VERCEL_ENV: "production" }) === false && SADM.isAccountDeletionSweepAllowed({ VERCEL_ENV: "preview" }) === true, r.body);
r = await sweep();
t("P47D2 Preview では従来どおり動く", r.code === 200 || r.code === 500, r.body);

// ===================== Z =====================
t("Z1 ログにカードの番号・キーを出していない", !logs.some((l) => l.includes(FAKE_TEST_RK) || l.includes("4242") || l.includes(CRON_SECRET)), logs.slice(0, 5));
t("Z2 Function の数は11本のまま", (await import("node:fs")).readdirSync(new URL("../api", import.meta.url)).filter((f) => f.endsWith(".js")).length === 11);
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
