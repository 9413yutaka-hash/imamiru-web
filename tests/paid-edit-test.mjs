// STEP 58: owners can edit or manage a shop only with a confirmed email, a registered card and the ¥100/month contract.
// New registration and takeover (as a new shop) are one procedure with the contract (consent → shop + contract in one
// transaction). Without an active contract every save path is refused by the server (plan_required), whatever the page
// shows. Shops that already have an active contract keep editing. Same conditions for registration and takeover,
// no double contracts / double usage, permanent URL and the old share link, cancel → closure, close → invoice.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// Preview-trial environment only, no Stripe, no billing. Geocoding / Moderation are local fakes (no network).
// run: node --import ./tests/mockfa-occ/register.mjs tests/paid-edit-test.mjs
import { REPO_URL, REPO_ROOT } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", GOOGLE_MAPS_API_KEY: "fake-maps-key", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEKEYFORLOCALTESTS0001", CLOUDINARY_API_KEY: "fake-cloudinary-key", CLOUDINARY_API_SECRET: "fake-cloudinary-secret" });
const pw = (uid, verified = true) => ({ uid, email: uid + "@example.com", email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["un", "uc", "ul", "ux", "uo", "uk", "ud"].map((u) => [u, pw(u)]));
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

let otherNetwork = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  if (u.hostname === "maps.googleapis.com") {
    // 住所ごとに少しずつ離す(同じ店主の重複の判定に掛からないように)。引き継ぎは運営掲載の座標から逆ジオコーディング。
    const address = u.searchParams.get("address") || "";
    const shift = (address.length % 7) * 0.01;
    return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: "日本、沖縄県那覇市" + address, geometry: { location: { lat: 26.2 + shift, lng: 127.68 + shift } }, address_components: [
      { long_name: "日本", short_name: "JP", types: ["country", "political"] },
      { long_name: "沖縄県", short_name: "沖縄県", types: ["administrative_area_level_1", "political"] },
      { long_name: "那覇市", short_name: "那覇市", types: ["locality", "political"] }
    ] }] }) };
  }
  otherNetwork++;
  throw new Error("unexpected network " + url);
};
const { Timestamp, getFirestore } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const BL = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");
const CH = await import(REPO_URL + "/api/_lib/store-custom-plan-charge.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const DEL = await import(REPO_URL + "/api/_lib/store-account-deletion.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(body, uid) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(uid ? { authorization: "Bearer " + uid } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function get(query) { const r = res(); const e = console.error; console.error = () => {}; try { await handler({ method: "GET", headers: {}, query }, r); } finally { console.error = e; } return r; }
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.includes("RateLimits/")) S.docs.delete(k); };
const doc = (k) => S.docs.get(k);
const keys = (prefix) => [...S.docs.keys()].filter((k) => k.startsWith(prefix));
const rev = (id) => { const p = doc("storeProfiles/" + id) || {}; return typeof p.revision === "number" ? p.revision : 0; };
const CONSENT = BL.STORE_CARD_PLAN_CONSENT_VERSION;
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const DAY = 86400000;
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
const REG = (name, extra = {}) => ({ mode: "storeSelfRegister", storeName: name, categoryCode: "cafe_sweets", countryCode: "JP", address: name + "1-1", sourceLanguage: "ja", contractModel: "monthly", ...extra });
const CLAIM = (submissionId, extra = {}) => ({ mode: "storeListingClaimCreate", submissionId, targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "", contractModel: "monthly", ...extra });
const PROFILE = (storeId, extra = {}) => ({ mode: "storeProfileUpdate", storeId, expectedRevision: rev(storeId), categoryCode: "cafe_sweets", description: "店主が書いた紹介文です。", businessHours: null, phone: "", websiteUrl: "", reservationUrl: "", socialLinks: [], paymentMethodCodes: [], ...extra });
const CUSTOM = (storeId, revision) => ({ mode: "storeCustomProfileUpdate", storeId, expectedRevision: revision, menuItems: [{ name: "メニュー", description: "", priceText: "¥500", photo: null }], links: [], story: "ストーリー" });
const IDENT = (storeId, storeName) => ({ mode: "storeIdentityUpdate", storeId, storeName, address: (doc("storeAccounts/" + storeId) || {}).address || "" });
const addPhoto = (storeId) => { const p = doc("storeProfiles/" + storeId); p.photos = [{ url: CLD + "v1/machinau_store_profiles/" + storeId + "/p.webp", publicId: "machinau_store_profiles/" + storeId + "/p", moderationStatus: "passed" }]; };
// すべての保存の経路(店舗情報・有料の欄・店名と所在地・店舗写真と商品写真の署名・公開)を呼ぶ。
async function allSavePaths(storeId, uid) {
  const out = {};
  clearRate(); out.profile = await call(PROFILE(storeId), uid);
  clearRate(); out.custom = await call(CUSTOM(storeId, ((doc("storeCustomProfiles/" + storeId) || {}).revision) || 0), uid);
  clearRate(); out.identity = await call(IDENT(storeId, "名前を変えた店" + storeId), uid);
  out.photoSig = await call({ mode: "cloudinarySignature", purpose: "storeProfilePhoto", storeId }, uid);
  out.menuSig = await call({ mode: "cloudinarySignature", purpose: "storeCustomMenuPhoto", storeId }, uid);
  clearRate(); out.publish = await call({ mode: "storeProfilePublish", storeId, expectedRevision: rev(storeId) }, uid);
  return out;
}
const codes = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.code + ":" + (v.body && v.body.reason || "")]));
const allRefused = (o) => ["profile", "custom", "identity", "photoSig", "menuSig"].every((k) => o[k].code === 403 && o[k].body.reason === "plan_required") && o.publish.code !== 200;
const allAllowed = (o) => ["profile", "custom", "photoSig", "menuSig"].every((k) => o[k].code === 200) && o.identity.code === 200;

S.docs.set("submissions/LC", { title: "おすすめ", shopName: "掲載中の店LC", category: "グルメ", content: "運営が掲載した紹介文。", address: "沖縄県那覇市LC", latitude: 26.3, longitude: 127.8, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], imageUrls: [] });
S.docs.set("submissions/LD", { title: "おすすめ", shopName: "掲載中の店LD", category: "グルメ", content: "運営が掲載した紹介文。", address: "沖縄県那覇市LD", latitude: 26.35, longitude: 127.85, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], imageUrls: [] });

// ===== A. カード未登録：新規登録・引き継ぎとも作れない(同意があっても) =====
{
  clearRate();
  const r = await call(REG("カード無しの店", { planConsentVersion: CONSENT }), "un");
  const c = await call(CLAIM("LC", { planConsentVersion: CONSENT }), "uc");
  t("A1 カード未登録：同意があっても新規登録・引き継ぎとも 409 card_required・店舗も契約も作られない", r.code === 409 && r.body.reason === "card_required" && c.code === 409 && c.body.reason === "card_required" && keys("storeAccounts/").length === 0 && keys("storeCustomPlans/").length === 0 && !doc("storeListingLinks/LC"), { r: r.body, c: c.body });
}

// ===== B. カード登録済み・同意なし：新規登録・引き継ぎとも作れない(同じ条件) =====
{
  card("un"); card("uc"); clearRate();
  const r = await call(REG("同意なしの店"), "un");
  const c = await call(CLAIM("LC"), "uc");
  const wrong = await call(REG("古い版の同意の店", { planConsentVersion: "store-card-monthly-2026-01-01" }), "un");
  t("B1 同意が無い・古い版の同意：新規登録・引き継ぎとも 400 plan_consent_required（同じ条件）・店舗・紐付け・契約・利用の記録は作られない", r.code === 400 && r.body.reason === "plan_consent_required" && c.code === 400 && c.body.reason === "plan_consent_required" && wrong.code === 400 && keys("storeAccounts/").length === 0 && keys("storeCustomPlans/").length === 0 && keys("storeCustomPlanUsage/").length === 0 && !doc("storeListingLinks/LC"), { r: r.body, c: c.body, wrong: wrong.body });
}

// ===== C. 同意して新規登録・引き継ぎ：同じ手続きで契約が成立・同じ形の契約と利用の記録 =====
let NEW_ID = "", CLAIM_ID = "";
{
  clearRate();
  const r = await call(REG("同意した新規の店", { planConsentVersion: CONSENT }), "un");
  clearRate();
  const c = await call(CLAIM("LC", { planConsentVersion: CONSENT }), "uc");
  NEW_ID = r.body && r.body.storeId; CLAIM_ID = c.body && c.body.storeId;
  const pn = doc("storeCustomPlans/" + NEW_ID) || {}, pc = doc("storeCustomPlans/" + CLAIM_ID) || {};
  t("C1 同意して新規登録：店舗(active)と月額100円の契約(active・暦月・契約者＝本人・同意の証跡)が同時に成立", r.code === 200 && doc("storeAccounts/" + NEW_ID).registrationStatus === "active" && pn.status === "active" && pn.periodKind === "monthly" && pn.ownerUid === "un" && pn.billingAccountUid === "un" && pn.consent.version === CONSENT && pn.consent.feeJpy === 100 && pn.consent.taxIncluded === true && pn.consent.uid === "un" && pn.consent.storeId === NEW_ID, { r: r.body, pn });
  t("C2 同意して引き継ぎ：紐付け・店舗(active)と月額100円の契約が同時に成立(運営の承認なし)", c.code === 200 && c.body.status === "approved" && doc("storeListingLinks/LC").storeId === CLAIM_ID && pc.status === "active" && pc.ownerUid === "uc" && pc.consent.version === CONSENT, { c: c.body, pc });
  const shape = (p) => ({ status: p.status, periodKind: p.periodKind, createdInPreview: p.createdInPreview, accessUntil: p.accessUntil, canceledAt: p.canceledAt, fee: p.consent.feeJpy, tax: p.consent.taxIncluded, version: p.consent.version, revision: p.revision });
  t("C3 新規登録と引き継ぎの契約は同じ形(料金・税込・同意の版・暦月・期限なし)・経路だけ記録(store_registration / listing_claim)", JSON.stringify(shape(pn)) === JSON.stringify(shape(pc)) && pn.signupChannel === "store_registration" && pc.signupChannel === "listing_claim", { a: shape(pn), b: shape(pc) });
  const month = BL.jstMonthKey(Date.now());
  const un = doc("storeCustomPlanUsage/" + NEW_ID + "_" + month) || {}, uc = doc("storeCustomPlanUsage/" + CLAIM_ID + "_" + month) || {};
  t("C4 今月の利用の記録：店舗・月ごとに1件・契約者に結び付く(100円が上限)・新規登録と引き継ぎで同じ", un.holderUid === "un" && un.billingAccountUid === "un" && un.reason === "subscribed" && un.status === "accrued" && uc.holderUid === "uc" && uc.reason === "subscribed" && keys("storeCustomPlanUsage/").length === 2, { un, uc });
  const evN = keys("storeCustomPlanEvents/" + NEW_ID + "_").map(doc), evC = keys("storeCustomPlanEvents/" + CLAIM_ID + "_").map(doc);
  t("C5 契約の履歴(subscribed)にも同意の証跡と経路を残す", evN.length === 1 && evN[0].event === "subscribed" && evN[0].consent.version === CONSENT && evN[0].signupChannel === "store_registration" && evC.length === 1 && evC[0].signupChannel === "listing_claim", { evN, evC });
}

// ===== D. 契約が成立した店舗は、すべての経路で編集・保存・公開できる =====
{
  const o = await allSavePaths(NEW_ID, "un");
  t("D1 新規登録の店舗：店舗情報・有料の欄・店名の変更・写真の署名(店舗写真・商品写真)が使える", allAllowed(o), codes(o));
  addPhoto(NEW_ID);
  clearRate(); const p = await call({ mode: "storeProfilePublish", storeId: NEW_ID, expectedRevision: rev(NEW_ID) }, "un");
  t("D2 新規登録の店舗：公開できる・固定の URL /shop/{ID} が開く", p.code === 200 && (await get({ mode: "renderStorePage", storeId: NEW_ID })).code === 200, p.body);
  const oc = await allSavePaths(CLAIM_ID, "uc");
  t("D3 引き継いだ店舗：同じく全部の経路が使える(同じ条件)", allAllowed(oc), codes(oc));
  const share = String((await get({ mode: "renderShareShop", shopId: "sp_" + NEW_ID })).body || "");
  t("D4 旧い共有リンク(/share/shop/sp_{ID})は店舗ページへ移る(互換)・店名を変えても URL は同じ", share.includes('location.replace("/shop/' + NEW_ID + '")') && doc("storeAccounts/" + NEW_ID).storeName === "名前を変えた店" + NEW_ID);
}

// ===== E. 契約が無い店舗(STEP 58 より前に作った下書きの店舗)：画面を通さず API を直接呼んでも全部拒否 =====
const LEGACY = "LEGACY1";
{
  S.docs.set("storeMembers/" + LEGACY + "_ul", { storeId: LEGACY, uid: "ul", role: "owner", status: "active" });
  S.docs.set("storeAccounts/" + LEGACY, { storeName: "以前の下書きの店", enabled: true, registrationStatus: "active", createdByType: "storeUser", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", address: "以前の住所", latitude: 26.5, longitude: 127.9, duplicateCandidates: [], reviewFlags: [] });
  S.docs.set("storeProfiles/" + LEGACY, { storeId: LEGACY, status: "draft", storeName: "以前の下書きの店", revision: 2, categoryCode: "cafe_sweets", description: "以前の下書き", moderationStatus: "passed", moderatedText: "以前の下書き", photos: [{ url: CLD + "v1/machinau_store_profiles/" + LEGACY + "/p.webp", publicId: "machinau_store_profiles/" + LEGACY + "/p", moderationStatus: "passed" }] });
  card("ul");
  const before = JSON.stringify([doc("storeProfiles/" + LEGACY), doc("storeAccounts/" + LEGACY)]);
  const o = await allSavePaths(LEGACY, "ul");
  t("E1 契約の無い店舗：店舗情報・有料の欄・店名と所在地・店舗写真と商品写真の署名は 403 plan_required・公開もできない", allRefused(o), codes(o));
  t("E2 契約の無い店舗：保存済みの下書き・店舗の情報は変わらない(消さない)・契約も作られない", JSON.stringify([doc("storeProfiles/" + LEGACY), doc("storeAccounts/" + LEGACY)]) === before && !doc("storeCustomPlans/" + LEGACY) && !doc("storeCustomProfiles/" + LEGACY), codes(o));
  clearRate(); const g = await call({ mode: "storeProfileGet", storeId: LEGACY }, "ul");
  clearRate(); const gc = await call({ mode: "storeCustomProfileGet", storeId: LEGACY }, "ul");
  t("E3 取得は 200(内容の確認だけ)・editable false・planRequired true(画面は編集できない表示)", g.code === 200 && g.body.editable === false && g.body.planRequired === true && gc.code === 200 && gc.body.editable === false && gc.body.planRequired === true, { g: g.body.editable, gc: gc.body.editable });
  clearRate();
  const linkToLegacy = await call({ mode: "storeListingClaimCreate", submissionId: "LD", targetType: "existing_store", targetStoreId: LEGACY, role: "owner", publicReferenceUrl: "", note: "" }, "ul");
  clearRate(); const preview = await call({ mode: "storeListingClaimPreview", submissionId: "LD" }, "ul");
  t("E4 契約の無い自分の店舗へは引き継げない(403 plan_required)・候補にも出さない", linkToLegacy.code === 403 && linkToLegacy.body.reason === "plan_required" && !doc("storeListingLinks/LD") && preview.code === 200 && !(preview.body.eligibleStores || []).some((s) => s.storeId === LEGACY), { link: linkToLegacy.body, eligible: preview.body.eligibleStores });
  clearRate(); const sub0 = await call({ mode: "storeCustomPlanSubscribe", storeId: LEGACY, contractModel: "monthly" }, "ul");
  clearRate(); const sub = await call({ mode: "storeCustomPlanSubscribe", storeId: LEGACY, contractModel: "monthly", planConsentVersion: CONSENT }, "ul");
  const after = await allSavePaths(LEGACY, "ul");
  t("E5 その店舗の月額100円を申し込むと(同意なしは 400)、保存済みの下書きのまま編集・保存できる", sub0.code === 400 && sub.code === 200 && allAllowed(after) && (doc("storeProfiles/" + LEGACY).description === "店主が書いた紹介文です。"), { sub0: sub0.body, sub: sub.body, after: codes(after) });
  clearRate(); const linkNow = await call({ mode: "storeListingClaimCreate", submissionId: "LD", targetType: "existing_store", targetStoreId: LEGACY, role: "owner", publicReferenceUrl: "", note: "" }, "ul");
  t("E6 契約中の自分の店舗へは引き継げる(新しい契約は作らない・空欄だけ運営掲載で埋める)", linkNow.code === 200 && doc("storeListingLinks/LD").storeId === LEGACY && keys("storeCustomPlanEvents/" + LEGACY + "_").length === 1, linkNow.body);
}

// ===== F. すでに有効な契約がある店舗(本番の既存の契約と同じ形)は、引き続き編集できる =====
{
  const K = "KEEP1";
  S.docs.set("storeMembers/" + K + "_uk", { storeId: K, uid: "uk", role: "owner", status: "active" });
  S.docs.set("storeAccounts/" + K, { storeName: "契約中の既存店", enabled: true, registrationStatus: "active", createdByType: "storeUser", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", address: "既存の住所", latitude: 26.6, longitude: 128.0, duplicateCandidates: [], reviewFlags: [] });
  S.docs.set("storeProfiles/" + K, { storeId: K, status: "published", storeName: "契約中の既存店", revision: 5, categoryCode: "cafe_sweets", description: "公開中", moderationStatus: "passed", moderatedText: "公開中", photos: [{ url: CLD + "v1/machinau_store_profiles/" + K + "/p.webp", publicId: "machinau_store_profiles/" + K + "/p", moderationStatus: "passed" }] });
  S.docs.set("storeCustomPlans/" + K, { storeId: K, status: "active", ownerUid: "uk", billingAccountUid: "uk", periodKind: "monthly", createdInPreview: false, subscribedAt: Timestamp.fromMillis(Date.now() - 2 * DAY), accessUntil: null, paymentStatus: "current", consent: { version: CONSENT, feeJpy: 100, taxIncluded: true } });
  card("uk");
  const o = await allSavePaths(K, "uk");
  t("F1 既存の有効な契約(暦月・支払い済み)の店舗：全部の経路で編集できる(契約の書き換えなし)", allAllowed(o) && doc("storeProfiles/" + K).status === "published" && doc("storeCustomPlans/" + K).status === "active" && keys("storeCustomPlanEvents/" + K + "_").length === 0, codes(o));
  S.docs.set("storeCustomPlans/" + K, { ...doc("storeCustomPlans/" + K), paymentStatus: "past_due" });
  clearRate(); const pd = await call(PROFILE(K, { description: "猶予中の編集" }), "uk");
  t("F2 支払いの猶予中(past_due)はまだ利用できる＝編集できる(停止 suspended までは止めない)", pd.code === 200, pd.body);
  S.docs.set("storeCustomPlans/" + K, { ...doc("storeCustomPlans/" + K), paymentStatus: "suspended" });
  clearRate(); const sp = await call(PROFILE(K, { description: "停止中の編集" }), "uk");
  t("F3 未払いで停止中(suspended)：編集は 403 plan_required(公開も止まる・支払いで再開)", sp.code === 403 && sp.body.reason === "plan_required" && doc("storeProfiles/" + K).description === "猶予中の編集", sp.body);
  S.docs.set("storeCustomPlans/" + K, { ...doc("storeCustomPlans/" + K), paymentStatus: "current" });
}

// ===== G. 他人の店舗・二重契約・二重の利用の記録 =====
{
  const before = JSON.stringify([doc("storeProfiles/" + NEW_ID), doc("storeAccounts/" + NEW_ID), doc("storeCustomProfiles/" + NEW_ID)]);
  const o = await allSavePaths(NEW_ID, "ux");
  t("G1 他人の店舗(契約中)：どの経路も 404(存在も見せない)・内容は変わらない", ["profile", "custom", "identity", "photoSig", "menuSig", "publish"].every((k) => o[k].code === 404) && JSON.stringify([doc("storeProfiles/" + NEW_ID), doc("storeAccounts/" + NEW_ID), doc("storeCustomProfiles/" + NEW_ID)]) === before, codes(o));
  clearRate(); const sub = await call({ mode: "storeCustomPlanSubscribe", storeId: NEW_ID, contractModel: "monthly", planConsentVersion: CONSENT }, "un");
  const month = BL.jstMonthKey(Date.now());
  t("G2 登録の後の申込は 409 already_subscribed(二重契約にしない)・利用の記録は1件のまま", sub.code === 409 && sub.body.reason === "already_subscribed" && keys("storeCustomPlanUsage/" + NEW_ID + "_").length === 1 && keys("storeCustomPlanEvents/" + NEW_ID + "_").length === 1, sub.body);
  // D1 で店名を変えているため、今の店名・同じ住所(同じ場所)で登録し直す。
  clearRate(); const again = await call(REG("名前を変えた店" + NEW_ID, { address: "同意した新規の店1-1", planConsentVersion: CONSENT }), "un");
  t("G3 同じ店の二重登録は 409 already_registered(契約も作らない)", again.code === 409 && again.body.reason === "already_registered" && keys("storeCustomPlans/").length === 4, again.body);
  clearRate();
  card("ud"); card("ux");
  S.docs.set("submissions/LE", { title: "おすすめ", shopName: "同時の店LE", category: "グルメ", content: "紹介文。", address: "沖縄県那覇市LE", latitude: 26.4, longitude: 127.9, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], imageUrls: [] });
  const race = await Promise.all([call(CLAIM("LE", { planConsentVersion: CONSENT }), "ud"), call(CLAIM("LE", { planConsentVersion: CONSENT }), "ux")]);
  const won = race.filter((x) => x.code === 200);
  const plansLE = keys("storeCustomPlans/").filter((k) => (doc(k).signupChannel === "listing_claim") && doc("storeListingLinks/LE") && k === "storeCustomPlans/" + doc("storeListingLinks/LE").storeId);
  const leStores = keys("storeAccounts/").filter((k) => doc(k).sourceSubmissionId === "LE");
  t("G4 同時の引き継ぎ：1件だけ成立・もう1件は 409・店舗も契約も1つだけ(負けた側に契約・利用の記録は残らない)", won.length === 1 && race.some((x) => x.code === 409) && leStores.length === 1 && plansLE.length === 1 && keys("storeCustomPlanUsage/").filter((k) => doc(k).holderUid === "ud" || doc(k).holderUid === "ux").length === 1, { codes: race.map((x) => x.code), leStores, plansLE });
}

// ===== H. 請求・領収書との整合：登録と同時の契約も、申込の契約と同じ月末締めで請求書(100円)になる =====
{
  const db = getFirestore();
  const month = BL.jstMonthKey(Date.now());
  const nextStart = BL.jstMonthStartMillis(BL.nextMonthKey(month));
  const dry = await BL.runStoreCustomPlanMonthlyClose(db, month, nextStart + 60000, false);
  const run = await BL.runStoreCustomPlanMonthlyClose(db, month, nextStart + 60000, true);
  const inv = (id) => doc("storeCustomPlanInvoices/" + id + "_" + month) || {};
  t("H1 月末締め：新規登録・引き継ぎ・申込の契約とも、店舗ごとに1件・100円(税込)・契約者のアカウントへの請求書", dry.ok && run.ok && inv(NEW_ID).amountJpy === 100 && inv(NEW_ID).billingAccountUid === "un" && inv(CLAIM_ID).amountJpy === 100 && inv(CLAIM_ID).billingAccountUid === "uc" && inv(LEGACY).amountJpy === 100 && inv(LEGACY).billingAccountUid === "ul", { NEW: inv(NEW_ID), CLAIM: inv(CLAIM_ID), LEGACY: inv(LEGACY), run: run.invoices });
  const again = await BL.runStoreCustomPlanMonthlyClose(db, month, nextStart + 120000, true);
  t("H2 締めをもう一度実行しても請求書は増えない(二重請求にしない)", again.ok && keys("storeCustomPlanInvoices/").filter((k) => k.endsWith("_" + month)).length === keys("storeCustomPlanUsage/").filter((k) => k.endsWith("_" + month) && doc(k).status === "invoiced").length, again.invoices);
  t("H3 締めは請求書を作るだけ(Stripe へは接続しない)・請求のスイッチは OFF", otherNetwork === 0 && BL.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false, otherNetwork);
}

// ===== I. 解約 → 期限まで編集できる → 期限後は編集できない → 退会(最終削除しない) =====
{
  clearRate(); const c = await call({ mode: "storeCustomPlanCancel", storeId: NEW_ID }, "un");
  clearRate(); const e1 = await call(PROFILE(NEW_ID, { description: "解約後も月末までは編集" }), "un");
  t("I1 解約：月末まで利用できる(解約済み)・その間は編集できる", c.code === 200 && doc("storeCustomPlans/" + NEW_ID).status === "canceling" && e1.code === 200, { c: c.body, e1: e1.body });
  S.docs.set("storeCustomPlans/" + NEW_ID, { ...doc("storeCustomPlans/" + NEW_ID), accessUntil: Timestamp.fromMillis(Date.now() - 1000) });
  const o = await allSavePaths(NEW_ID, "un");
  t("I2 利用期限の後：全部の経路で 403 plan_required・店舗ページは 404(非公開)", allRefused(o) && (await get({ mode: "renderStorePage", storeId: NEW_ID })).code === 404, codes(o));
  clearRate(); const chk = await call({ mode: "storeAccountDeletionCheck" }, "un");
  clearRate(); const del = await call({ mode: "storeAccountDelete", confirm: true }, "un");
  t("I3 退会は2段階・受け付けて店舗を止める・本番の自動の最終削除は OFF のまま", chk.code === 200 && (del.code === 202 || del.code === 200) && !!doc("accountDeletions/un") && DEL.ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED === false, { chk: chk.body, del: del.body });
  clearRate(); const reg = await call(REG("退会中の新しい店", { planConsentVersion: CONSENT }), "un");
  t("I4 退会の手続き中は、同意があっても新しい店舗・契約を作れない(409 account_deleting)", reg.code === 409 && reg.body.reason === "account_deleting" && !keys("storeAccounts/").some((k) => doc(k).storeName === "退会中の新しい店"), reg.body);
}

// ===== J. 申込の受付の条件(環境)と、変えていないもの =====
{
  const body = { planConsentVersion: CONSENT };
  const prod = CP.resolveStoreCardPlanSignup({ env: { VERCEL_ENV: "production" } }, body);
  const prodNoConsent = CP.resolveStoreCardPlanSignup({ env: { VERCEL_ENV: "production" } }, {});
  const previewOther = CP.resolveStoreCardPlanSignup({ env: { VERCEL_ENV: "preview" }, isStoreCustomPlanTrialEnabled: () => false }, body);
  const trial = CP.resolveStoreCardPlanSignup({ env: { VERCEL_ENV: "preview" }, isStoreCustomPlanTrialEnabled: () => true }, body);
  t("J1 本番：同意があれば本番の暦月契約(試験の印なし)・同意が無ければ拒否", BL.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === true && prod.ok && prod.contractModel === "monthly" && prod.createdInPreview === false && !prodNoConsent.ok && prodNoConsent.reason === "plan_consent_required", { prod, prodNoConsent });
  t("J2 Preview：試験の環境(Preview の Firebase)の時だけ受け付ける(既定は試験の契約)・それ以外は plan_signup_unavailable", !previewOther.ok && previewOther.reason === "plan_signup_unavailable" && trial.ok && trial.contractModel === "preview_trial" && trial.createdInPreview === true, { previewOther, trial });
  const wf = readFileSync(join(REPO_ROOT, ".github/workflows/store-card-plan-production.yml"), "utf8");
  t("J3 課金のスイッチは OFF のまま(店舗カードの請求・遅れた請求の自動・今だけ投稿の請求)・定期実行は1日4回", BL.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false && CH.STORE_CUSTOM_PLAN_LATE_AUTO_CHARGE_ENABLED === false && IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && /cron: "10 1-4 \* \* \*"/.test(wf));
  const app = readFileSync(join(REPO_ROOT, "app.js"), "utf8");
  t("J4 運営の無料掲載は従来どおり(近くの店舗の 15km・運営掲載 submissions は書き換えない)", /const NEARBY_SHOP_CARD_RADIUS_KM =\s*15;/.test(app) && doc("submissions/LC").shopName === "掲載中の店LC" && !("storeId" in doc("submissions/LC")));
  const ss = readFileSync(join(REPO_ROOT, "api/_lib/store-self-service.js"), "utf8");
  const lc = readFileSync(join(REPO_ROOT, "api/_lib/store-listing-claims.js"), "utf8");
  t("J5 登録・引き継ぎのファイルは契約の記録を直接書かない(契約のファイルの関数を依存で受け取る)", !/storeCustomPlans"/.test(ss + lc) && ss.includes("deps.writeNewStoreCardPlanInTransaction") && lc.includes("deps.writeNewStoreCardPlanInTransaction"));
  // 新規登録・引き継ぎの同意は、店舗プロフィール画面の申込と同じ同意の版・同じ料金と条件の行(版を変える時に取り残さない)。
  const acc = readFileSync(join(REPO_ROOT, "store-account.html"), "utf8");
  const prof = readFileSync(join(REPO_ROOT, "store-profile.html"), "utf8");
  const termsKeys = (html, id) => { const m = html.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</ul>')); return m ? [...m[1].matchAll(/<li data-i18n="([a-z_]+)"/g)].map((x) => x[1]).join(",") : ""; };
  const versions = [acc, prof].map((html) => (html.match(/const STORE_CARD_PLAN_CONSENT_VERSION = "([^"]+)"/) || [])[1]);
  t("J7 画面の同意の版はサーバーと同じ・新規登録と引き継ぎの料金と条件の行は店舗プロフィール画面の申込と同じ", versions.every((v) => v === CONSENT) && termsKeys(prof, "customPlanTerms") !== "" && termsKeys(acc, "storePlanTerms") === termsKeys(prof, "customPlanTerms") && termsKeys(acc, "claimPlanTerms") === termsKeys(prof, "customPlanTerms"), { versions, prof: termsKeys(prof, "customPlanTerms"), reg: termsKeys(acc, "storePlanTerms"), claim: termsKeys(acc, "claimPlanTerms") });
  t("J6 試験の通信は OpenAI・Geocoding の偽物だけ(Stripe・本番には接続していない)", otherNetwork === 0, otherNetwork);
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
