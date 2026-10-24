// STEP 44-B server: monthly ¥100 customization plan — subscribe / cancel / reactivate / expiry / ownership change /
// admin read-only list. Preview-trial contracts only (1 calendar month in JST), no Stripe, no billing.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-test.mjs
import { REPO_URL } from "./_paths.mjs";
const ADMIN = "admin@example.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01" });
const pw = (uid, email, verified = true) => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "a@example.com"), u2: pw("u2", "b@example.com"), u3: pw("u3", "c@example.com"), u4: pw("u4", "d@example.com"), u5: pw("u5", "e@example.com"), u6: pw("u6", "f@example.com"), unverified: pw("u1", "a@example.com", false), admin: pw("adm1", ADMIN) };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let otherNetwork = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  otherNetwork++; throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");
const FT = await import(REPO_URL + "/api/_lib/firebase-target.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(body, token) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function publicList() { const r = res(); const e = console.error; console.error = () => {}; try { await handler({ method: "GET", headers: {}, query: { mode: "publicStoreProfiles" } }, r); } finally { console.error = e; } return r; }
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
const snap = (k) => JSON.stringify(S.docs.get(k) === undefined ? null : S.docs.get(k));
const events = (storeId) => [...S.docs.entries()].filter(([k]) => k.startsWith("storeCustomPlanEvents/" + storeId + "_")).map(([, v]) => v);
const plan = (id) => S.docs.get("storeCustomPlans/" + id);
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(Date.now() - 86400000);
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
const member = (id, uid, status = "active") => S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status });
function seedStore(id, uid, name, lat) {
  S.docs.set("storeAccounts/" + id, { storeName: name, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: lat, longitude: 127.68, duplicateCandidates: [] });
  member(id, uid);
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 3, categoryCode: "cafe_sweets", description: "無料の紹介文" + id, moderationStatus: "passed", moderatedText: "無料の紹介文" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/free1.webp", publicId: "machinau_store_profiles/" + id + "/free1", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
}
seedStore("S1", "u1", "海辺のカフェ", 26.21);
seedStore("S2", "u2", "となりの食堂", 26.22);
seedStore("S3", "u3", "カードなしの店", 26.23);
seedStore("S4", "u4", "共同経営の店", 26.24); member("S4", "u5");
["u1", "u2", "u4", "u5", "u6"].forEach(card);
const SUB = (storeId) => ({ mode: "storeCustomPlanSubscribe", storeId });
const CANCEL = (storeId) => ({ mode: "storeCustomPlanCancel", storeId });
const GET = (storeId) => ({ mode: "storeCustomProfileGet", storeId });
const UPDATE = (storeId, rev, story) => ({ mode: "storeCustomProfileUpdate", storeId, expectedRevision: rev, menuItems: [{ name: "ちんすこうラテ", priceText: "¥650" }], links: [], story });

// ===================== calendar month (JST) =====================
const jst = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600000;
const cases = [
  ["10月24日 10:30 → 11月24日 10:30", jst(2026, 10, 24, 10, 30), jst(2026, 11, 24, 10, 30)],
  ["1月31日 → 2月28日（平年は月末に丸める）", jst(2027, 1, 31, 9), jst(2027, 2, 28, 9)],
  ["うるう年 1月31日 → 2月29日", jst(2028, 1, 31, 9), jst(2028, 2, 29, 9)],
  ["3月31日 → 4月30日", jst(2027, 3, 31, 18), jst(2027, 4, 30, 18)],
  ["12月31日 → 翌年1月31日", jst(2026, 12, 31, 23, 59), jst(2027, 1, 31, 23, 59)],
  ["日本時間の暦で数える（1月31日 0:30 JST＝UTCでは1月30日）→ 2月28日 0:30", jst(2027, 1, 31, 0, 30), jst(2027, 2, 28, 0, 30)],
  ["1月30日 → 2月28日（2月30日は無い）", jst(2027, 1, 30, 12), jst(2027, 2, 28, 12)],
  ["2月28日 → 3月28日（月末から月末へは伸ばさない）", jst(2027, 2, 28, 12), jst(2027, 3, 28, 12)]
];
for (const [name, from, to] of cases) t("M " + name, CP.addOneCalendarMonthJst(from) === to, { got: new Date(CP.addOneCalendarMonthJst(from)).toISOString(), want: new Date(to).toISOString() });

// ===================== environment gate =====================
t("G1 申込の環境：Preview・対象ブランチ・machinau-preview の時だけ有効／Production・ほかのブランチ・ローカルは無効", FT.isPreviewStoreCustomPlanTrialEnabled(TRIAL_ENV) === true && FT.isPreviewStoreCustomPlanTrialEnabled({ ...TRIAL_ENV, VERCEL_ENV: "production" }) === false && FT.isPreviewStoreCustomPlanTrialEnabled({ ...TRIAL_ENV, VERCEL_GIT_COMMIT_REF: "preview/store-custom-plan" }) === false && FT.isPreviewStoreCustomPlanTrialEnabled({ ...TRIAL_ENV, VERCEL_ENV: undefined }) === false);
process.env.VERCEL_ENV = "production"; clearRate();
let r = await call(SUB("S1"), "u1");
process.env.VERCEL_ENV = "preview";
t("G2 Production の環境では申込を受け付けない（403 plan_signup_unavailable・書き込みなし）", r.code === 403 && r.body.reason === "plan_signup_unavailable" && !S.docs.has("storeCustomPlans/S1"), r.body);

// ===================== subscribe: refusals =====================
clearRate(); r = await call(SUB("S1"));
t("R1 未ログイン：401", r.code === 401, r.body);
clearRate(); r = await call(SUB("S1"), "unverified");
t("R2 メール未確認：403 email_not_verified", r.code === 403 && r.body.reason === "email_not_verified", r.body);
clearRate(); r = await call(SUB("S1"), "u2");
t("R3 他の店舗への申込：404 store_not_found・書き込みなし", r.code === 404 && !S.docs.has("storeCustomPlans/S1"), r.body);
clearRate(); r = await call(SUB("S3"), "u3");
t("R4 カード未登録：403 card_required・書き込みなし", r.code === 403 && r.body.reason === "card_required" && !S.docs.has("storeCustomPlans/S3"), r.body);
S.docs.set("storeAccounts/S2", { ...S.docs.get("storeAccounts/S2"), enabled: false });
clearRate(); r = await call(SUB("S2"), "u2");
t("R5 編集できない店舗（運営が停止）：403 store_not_editable", r.code === 403 && r.body.reason === "store_not_editable" && !S.docs.has("storeCustomPlans/S2"), r.body);
S.docs.set("storeAccounts/S2", { ...S.docs.get("storeAccounts/S2"), enabled: true });

// ===================== subscribe: success =====================
let g = await call(GET("S1"), "u1");
t("B0 申込前：state none・申込できる環境・カード登録済み・編集不可", g.body.plan.state === "none" && g.body.plan.signupAvailable === true && g.body.plan.cardRegistered === true && g.body.editable === false, g.body.plan);
const before = Date.now(); clearRate(); r = await call(SUB("S1"), "u1"); const after = Date.now();
let p1 = plan("S1");
t("B1 申込：200 subscribed・active・契約者 u1・preview_trial・利用期限＝申込時刻の暦の1か月後", r.code === 200 && r.body.result === "subscribed" && p1.status === "active" && p1.ownerUid === "u1" && p1.billingAccountUid === "u1" && p1.periodKind === "preview_trial" && ms(p1.accessUntil) === CP.addOneCalendarMonthJst(ms(p1.subscribedAt)) && ms(p1.subscribedAt) >= before && ms(p1.subscribedAt) <= after && r.body.accessUntilMillis === ms(p1.accessUntil), { body: r.body, p1 });
t("B2 履歴：subscribed を1件記録", events("S1").length === 1 && events("S1")[0].event === "subscribed" && events("S1")[0].uid === "u1", events("S1"));
g = await call(GET("S1"), "u1");
t("B3 取得：state active・editable true・利用期限・申込日時を返す", g.body.plan.state === "active" && g.body.editable === true && g.body.plan.accessUntilMillis === ms(p1.accessUntil) && g.body.plan.subscribedAtMillis === ms(p1.subscribedAt) && g.body.plan.canceledAtMillis === 0, g.body.plan);
clearRate(); r = await call(SUB("S1"), "u1");
t("B4 二重申込：409 already_subscribed・契約は変わらない", r.code === 409 && r.body.reason === "already_subscribed" && snap("storeCustomPlans/S1") === JSON.stringify(p1) && events("S1").length === 1, r.body);
r = await call(SUB("S1"), "u1");
t("B5 連打（3秒以内）：429 rate_limited", r.code === 429, r.body);
clearRate();
const race = await Promise.all([call(SUB("S4"), "u4"), call(SUB("S4"), "u5")]);
const raceCodes = race.map((x) => x.code).sort();
t("B6 同じ店舗への同時の申込（共同 owner 2人）：1件だけ成立・もう1件は 409・契約は1つ", JSON.stringify(raceCodes) === "[200,409]" && race.find((x) => x.code === 409).body.reason === "already_subscribed" && events("S4").filter((e) => e.event === "subscribed").length === 1, { raceCodes, bodies: race.map((x) => x.body) });
const s4Holder = plan("S4").ownerUid; const s4Other = s4Holder === "u4" ? "u5" : "u4";

// ===================== edit / display while active =====================
clearRate(); r = await call(UPDATE("S1", 0, "祖母が始めた喫茶店です。"), "u1");
t("D1 契約中：有料の欄を保存できる", r.code === 200 && r.body.revision === 1, r.body);
let pl = await publicList();
t("D2 契約中：旅行者向け一覧の S1 に有料の内容", !!(pl.body.stores.find((s) => s.id === "sp_S1") || {}).custom, pl.body.stores.map((s) => s.id));

// ===================== cancel =====================
clearRate(); r = await call(CANCEL("S1"), "u2");
t("C1 他の店舗の解約：404・契約は変わらない", r.code === 404 && plan("S1").status === "active", r.body);
clearRate(); r = await call(CANCEL("S4"), s4Other);
t("C2 契約者ではない共同 owner の解約：409 plan_not_active・契約は変わらない", r.code === 409 && plan("S4").status === "active", r.body);
clearRate(); r = await call(CANCEL("S1"), "unverified");
t("C3 メール未確認の解約：403", r.code === 403, r.body);
clearRate(); r = await call(CANCEL("S1"), "u1");
p1 = plan("S1");
t("C4 解約：200・canceling・解約日時を記録・利用期限は変えない", r.code === 200 && r.body.alreadyCanceled === false && p1.status === "canceling" && ms(p1.canceledAt) > 0 && r.body.accessUntilMillis === ms(p1.accessUntil) && events("S1").some((e) => e.event === "canceled"), { body: r.body, p1 });
const afterCancel = snap("storeCustomPlans/S1");
const accessUntilAtCancel = ms(plan("S1").accessUntil);
clearRate(); r = await call(CANCEL("S1"), "u1");
t("C5 二重解約：200 alreadyCanceled・状態も履歴も変えない", r.code === 200 && r.body.alreadyCanceled === true && snap("storeCustomPlans/S1") === afterCancel && events("S1").filter((e) => e.event === "canceled").length === 1, r.body);
g = await call(GET("S1"), "u1");
pl = await publicList();
clearRate(); r = await call(UPDATE("S1", 1, "解約後も期限までは編集できる"), "u1");
t("C6 解約手続き済み（期限内）：state canceling・編集できる・旅行者にも表示", g.body.plan.state === "canceling" && g.body.editable === true && r.code === 200 && !!pl.body.stores.find((s) => s.id === "sp_S1").custom, { plan: g.body.plan, code: r.code });
clearRate(); r = await call(SUB("S1"), "u1");
p1 = plan("S1");
t("C7 期限内の再申込＝解約の取り消し：reactivated・active・利用期限は同じ", r.code === 200 && r.body.result === "reactivated" && p1.status === "active" && p1.canceledAt === null && ms(p1.accessUntil) === accessUntilAtCancel && r.body.accessUntilMillis === accessUntilAtCancel && events("S1").some((e) => e.event === "reactivated"), { body: r.body, p1 });
clearRate(); await call(CANCEL("S1"), "u1");

// ===================== expiry =====================
const keptCustom = snap("storeCustomProfiles/S1");
S.docs.set("storeCustomPlans/S1", { ...plan("S1"), accessUntil: Timestamp.fromMillis(Date.now() - 1000) });
g = await call(GET("S1"), "u1");
clearRate(); r = await call(UPDATE("S1", 2, "期限後は保存できない"), "u1");
pl = await publicList();
const s1pub = pl.body.stores.find((s) => s.id === "sp_S1");
t("E1 利用期限の終了後：state expired・編集不可（403 plan_required）", g.body.plan.state === "expired" && g.body.editable === false && r.code === 403 && r.body.reason === "plan_required", { plan: g.body.plan, body: r.body });
t("E2 利用期限の終了後：旅行者には有料の内容を出さない・無料プロフィールは掲載を続ける・データは残る", s1pub && !("custom" in s1pub) && s1pub.description === "無料の紹介文S1" && snap("storeCustomProfiles/S1") === keptCustom, s1pub);
clearRate(); r = await call(CANCEL("S1"), "u1");
t("E3 期限切れの契約の解約：409 plan_not_active", r.code === 409 && r.body.reason === "plan_not_active", r.body);
const expiredPlan = plan("S1");
clearRate(); r = await call(SUB("S1"), "u1");
p1 = plan("S1");
const sup = events("S1").find((e) => e.event === "superseded");
t("E4 期限切れの後の再申込：新しい契約（新しい利用期限）・前の契約は履歴（superseded）に残す", r.code === 200 && r.body.result === "subscribed" && p1.status === "active" && ms(p1.accessUntil) > Date.now() && !!sup && sup.previous.status === "canceling" && sup.previous.ownerUid === "u1" && sup.previous.accessUntilMillis === ms(expiredPlan.accessUntil), { body: r.body, sup });
pl = await publicList();
t("E5 再申込でデータがそのまま表示に戻る（商品・ストーリー）", (pl.body.stores.find((s) => s.id === "sp_S1").custom || {}).story === "解約後も期限までは編集できる", pl.body.stores.find((s) => s.id === "sp_S1"));

// ===================== ownership change =====================
member("S1", "u1", "removed"); member("S1", "u6");
pl = await publicList();
t("O1 所有者の変更（u1 が owner でなくなり u6 が owner）：旧店主の契約では旅行者に表示しない", !("custom" in pl.body.stores.find((s) => s.id === "sp_S1")), pl.body.stores.find((s) => s.id === "sp_S1"));
g = await call(GET("S1"), "u6");
t("O2 新しい owner：state other_holder・旧契約は有効ではない（otherHolderActive false）・編集不可・旧契約の日時は見せない", g.body.plan.state === "other_holder" && g.body.plan.otherHolderActive === false && g.body.editable === false && g.body.plan.accessUntilMillis === 0 && g.body.plan.subscribedAtMillis === 0, g.body.plan);
clearRate(); r = await call(UPDATE("S1", 2, "新しい owner"), "u6");
t("O3 新しい owner は旧店主の契約で保存できない（403 plan_required）", r.code === 403 && r.body.reason === "plan_required", r.body);
clearRate(); r = await call(CANCEL("S1"), "u6");
t("O4 新しい owner は旧店主の契約を解約できない（409）", r.code === 409, r.body);
clearRate(); r = await call(GET("S1"), "u1");
t("O5 owner でなくなった旧店主：404（契約・内容を見られない）", r.code === 404, r.body);
const oldPlan = plan("S1");
clearRate(); r = await call(SUB("S1"), "u6");
const p6 = plan("S1");
const sup6 = events("S1").filter((e) => e.event === "superseded").find((e) => e.previous.ownerUid === "u1" && e.uid === "u6");
t("O6 新しい owner の申込：自分のカードの新しい契約（契約者・請求先 u6）・旧店主の契約は履歴に残す（自動で引き継がない）", r.code === 200 && r.body.result === "subscribed" && p6.ownerUid === "u6" && p6.billingAccountUid === "u6" && ms(p6.subscribedAt) !== ms(oldPlan.subscribedAt) && !!sup6, { p6, sup6 });
g = await call(GET("S4"), s4Other);
clearRate(); r = await call(SUB("S4"), s4Other);
const r2 = await call(UPDATE("S4", 0, "共同 owner"), s4Other);
t("O7 共同 owner（契約者ではない）：state other_holder・契約が有効なので申込は 409・有料の欄は保存できない", g.body.plan.state === "other_holder" && g.body.plan.otherHolderActive === true && r.code === 409 && r2.code === 403 && r2.body.reason === "plan_required", { plan: g.body.plan, sub: r.body, upd: r2.body });
const sig = await call({ mode: "cloudinarySignature", purpose: "storeCustomMenuPhoto", storeId: "S4" }, s4Other);
t("O8 共同 owner（契約者ではない）：商品写真の署名も 403 plan_required", sig.code === 403 && sig.body.reason === "plan_required", sig.body);

// ===================== admin list =====================
r = await call({ mode: "adminStoreCustomPlanList" }, "u1");
t("A1 店主のアカウントでは契約一覧を取得できない", r.code === 401 || r.code === 403, r.code);
r = await call({ mode: "adminStoreCustomPlanList" });
t("A2 未ログインでは契約一覧を取得できない", r.code === 401 || r.code === 403, r.code);
const writesBefore = JSON.stringify([...S.docs.entries()].filter(([k]) => !k.startsWith("storeRegistrationRateLimits/")));
r = await call({ mode: "adminStoreCustomPlanList" }, "admin");
const a1 = (r.body.plans || []).find((x) => x.storeId === "S1");
t("A3 運営：契約一覧（店舗名・状態・申込日時・利用期限・解約日時・契約者が owner か）", r.code === 200 && r.body.plans.length === 2 && a1.storeName === "海辺のカフェ" && a1.state === "active" && a1.holderIsActiveOwner === true && a1.subscribedAtMillis === ms(p6.subscribedAt) && a1.accessUntilMillis === ms(p6.accessUntil) && a1.periodKind === "preview_trial", r.body);
t("A4 運営の一覧は読み取りだけ（データは変わらない）", JSON.stringify([...S.docs.entries()].filter(([k]) => !k.startsWith("storeRegistrationRateLimits/"))) === writesBefore);
t("A5 運営の一覧に uid・メール・カードの情報を含まない", !/u6|u1|@example|cus_|pm_/.test(JSON.stringify(r.body.plans)), r.body.plans);

// ===================== flags / safety =====================
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const MCL = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const LC = await import(REPO_URL + "/api/_lib/listing-profile-copy.js");
t("F1 課金関連の6フラグはすべて false", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && MCL.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && SB.STORE_CARD_REGISTRATION_LIVE_ENABLED === false && LC.LISTING_PHOTO_COPY_ENABLED === false && LC.LISTING_PHOTO_COPY_PREVIEW_TRIAL === false);
t("F2 Stripe 等への通信なし（申込・解約は請求しない）", otherNetwork === 0, otherNetwork);
const imadakeDocs = [...S.docs.keys()].filter((k) => /^(imadake|accountBilling\/.*charge|storeBilling)/.test(k));
t("F3 今だけ投稿・請求の台帳に書き込まない", imadakeDocs.length === 0, imadakeDocs);
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
