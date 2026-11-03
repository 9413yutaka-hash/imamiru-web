// STEP 56-B / STEP 57: store owners finish everything by themselves (no operator step).
// One flow per entry route (new registration / takeover of an operator listing) through the REAL API:
// card → register/take over → draft edit without a contract → publishing blocked → ¥100/month consent →
// publish → permanent page with phone / booking / website / SNS → one-place status (storeMyStores) →
// cancel → account closure (awaiting settlement, no final deletion) . Plus: store page URL safety,
// shop-apply.html, legal pages unchanged, switches off.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// Preview-trial contracts only, no Stripe, no billing. Geocoding / Moderation are local fakes (no network).
// run: node --import ./tests/mockfa-occ/register.mjs tests/self-service-test.mjs
import { REPO_URL, REPO_ROOT } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", GOOGLE_MAPS_API_KEY: "fake-maps-key", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEKEYFORLOCALTESTS0001" });
const pw = (uid, verified = true) => ({ uid, email: uid + "@example.com", email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["ua", "ub", "uz"].map((u) => [u, pw(u)]));
globalThis.__MOCK_TOKENS.uv = pw("uv", false);
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

const GEO = {
  "沖縄県那覇市牧志2-2-2": { lat: 26.2160, lng: 127.6890, city: "那覇市", formatted: "日本、〒900-0013 沖縄県那覇市牧志２丁目２−２" }
};
let otherNetwork = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  if (u.hostname === "maps.googleapis.com") {
    // 引き継ぎは運営掲載の座標から逆ジオコーディング(latlng)する。
    const g = u.searchParams.get("latlng") ? GEO["沖縄県那覇市牧志2-2-2"] : GEO[u.searchParams.get("address")];
    if (!g) return { ok: true, status: 200, json: async () => ({ status: "ZERO_RESULTS", results: [] }) };
    return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: g.formatted, geometry: { location: { lat: g.lat, lng: g.lng } }, address_components: [
      { long_name: "日本", short_name: "JP", types: ["country", "political"] },
      { long_name: "沖縄県", short_name: "沖縄県", types: ["administrative_area_level_1", "political"] },
      { long_name: g.city, short_name: g.city, types: ["locality", "political"] }
    ] }] }) };
  }
  otherNetwork++;
  throw new Error("unexpected network " + url);
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const BL = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CH = await import(REPO_URL + "/api/_lib/store-custom-plan-charge.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const DEL = await import(REPO_URL + "/api/_lib/store-account-deletion.js");
const PG = await import(REPO_URL + "/api/_lib/store-page.js");
const SP = await import(REPO_URL + "/api/_lib/store-profile.js");
const SS = await import(REPO_URL + "/api/_lib/store-self-service.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(body, uid) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2." + (++ip % 250), ...(uid ? { authorization: "Bearer " + uid } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function get(query) { const r = res(); const e = console.error; console.error = () => {}; try { await handler({ method: "GET", headers: {}, query }, r); } finally { console.error = e; } return r; }
const page = (storeId, lang) => get({ mode: "renderStorePage", storeId, ...(lang ? { lang } : {}) });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.includes("RateLimits/")) S.docs.delete(k); };
const doc = (k) => S.docs.get(k);
const rev = (id) => { const p = doc("storeProfiles/" + id) || {}; return typeof p.revision === "number" ? p.revision : 0; };
const CONSENT = BL.STORE_CARD_PLAN_CONSENT_VERSION;
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
const myStores = async (uid) => ((await call({ mode: "storeMyStores" }, uid)).body || {}).stores || [];
const PROFILE = (storeId, rev, extra = {}) => ({ mode: "storeProfileUpdate", storeId, expectedRevision: rev, categoryCode: "cafe_sweets", description: "店主が書いた紹介文です。", businessHours: null, phone: "098-123-4567", websiteUrl: "https://shop.example.com/", reservationUrl: "https://reserve.example.com/book", socialLinks: [{ type: "instagram", url: "https://www.instagram.com/example_shop/" }, { type: "line", url: "https://lin.ee/abcdEFG" }], paymentMethodCodes: ["cash"], supportedLanguageCodes: ["ja", "en"], ...extra });
// 写真は Cloudinary への直接アップロード(試験では行わない)。審査済みの写真を店舗の文書に置いて代わりにする。
const addPhoto = (storeId) => { const p = doc("storeProfiles/" + storeId); p.photos = [{ url: CLD + "v1/machinau_store_profiles/" + storeId + "/p.webp", publicId: "machinau_store_profiles/" + storeId + "/p", moderationStatus: "passed" }]; };

// 運営の無料掲載(引き継ぎの対象)
S.docs.set("submissions/LA", { title: "おすすめ", shopName: "掲載中の食堂", category: "グルメ", content: "運営が掲載した紹介文。", address: "沖縄県那覇市牧志2-2-2", latitude: 26.2161, longitude: 127.6891, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], imageUrls: [] });
const listingBefore = JSON.stringify(doc("submissions/LA"));

// ===== A. メール確認・カードの前提(新規登録・引き継ぎ・申込は同じ) =====
{
  let r = await call({ mode: "storeSelfRegister", storeName: "未確認の店", categoryCode: "cafe_sweets", countryCode: "JP", address: "沖縄県那覇市牧志2-2-2", sourceLanguage: "ja" }, "uv");
  const c = await call({ mode: "storeListingClaimCreate", submissionId: "LA", targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "" }, "uv");
  t("A1 メール未確認：新規登録も引き継ぎも 403 email_not_verified(店舗は作られない)", r.code === 403 && r.body.reason === "email_not_verified" && c.code === 403 && c.body.reason === "email_not_verified" && ![...S.docs.keys()].some((k) => k.startsWith("storeAccounts/")), { r: r.body, c: c.body });
  clearRate();
  r = await call({ mode: "storeSelfRegister", storeName: "カード無しの店", categoryCode: "cafe_sweets", countryCode: "JP", address: "沖縄県那覇市牧志2-2-2", sourceLanguage: "ja" }, "ua");
  const c2 = await call({ mode: "storeListingClaimCreate", submissionId: "LA", targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "" }, "ub");
  t("A2 カード未登録：新規登録も引き継ぎも 409 card_required(同じ前提)", r.code === 409 && r.body.reason === "card_required" && c2.code === 409 && c2.body.reason === "card_required", { r: r.body, c: c2.body });
  const none = await myStores("ua");
  t("A3 店舗一覧：まだ店舗が無い時は空(メール確認済み・ログイン中)", Array.isArray(none) && none.length === 0, none);
}

// ===== B. 新規登録(ua)：登録 → 契約前の下書き → 公開できない → 同意 → 公開 → 店舗ページ =====
let NEW_ID = "";
{
  card("ua"); clearRate();
  const r = await call({ mode: "storeSelfRegister", storeName: "ひとりで登録したカフェ", categoryCode: "cafe_sweets", countryCode: "JP", address: "沖縄県那覇市牧志2-2-2", sourceLanguage: "ja" }, "ua");
  NEW_ID = r.body && r.body.storeId;
  t("B1 カード登録済み：運営の承認なしで登録(active)・店舗の下書きができる", r.code === 200 && r.body.registrationStatus === "active" && doc("storeProfiles/" + NEW_ID).status === "draft", r.body);
  let list = await myStores("ua");
  const s0 = list.find((s) => s.storeId === NEW_ID) || {};
  t("B2 店舗一覧：固定の URL・未契約(none)・旅行者に非公開(false)を一か所で返す", s0.storePageUrl === "https://machinau.jp/shop/" + NEW_ID && s0.planState === "none" && s0.publiclyVisible === false && s0.profileStatus === "draft", s0);

  clearRate();
  const u1 = await call(PROFILE(NEW_ID, rev(NEW_ID)), "ua");
  t("B3 契約前でも下書きの保存・編集ができる(料金はかからない＝契約・台帳を作らない)", u1.code === 200 && !doc("storeCustomPlans/" + NEW_ID) && ![...S.docs.keys()].some((k) => k.startsWith("storeCustomPlanUsage/" + NEW_ID)), u1.body);
  addPhoto(NEW_ID);
  clearRate();
  const p0 = await call({ mode: "storeProfilePublish", storeId: NEW_ID, expectedRevision: rev(NEW_ID) }, "ua");
  t("B4 契約が無いと公開できない(旅行者に出ない・ページも 404)", p0.code !== 200 && doc("storeProfiles/" + NEW_ID).status === "draft" && (await page(NEW_ID)).code === 404, p0.body);

  clearRate();
  const sub0 = await call({ mode: "storeCustomPlanSubscribe", storeId: NEW_ID, contractModel: "monthly" }, "ua");
  clearRate();
  const sub1 = await call({ mode: "storeCustomPlanSubscribe", storeId: NEW_ID, contractModel: "monthly", planConsentVersion: CONSENT }, "ua");
  clearRate();
  const sub2 = await call({ mode: "storeCustomPlanSubscribe", storeId: NEW_ID, contractModel: "monthly", planConsentVersion: CONSENT }, "ua");
  const usage = [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanUsage/") && doc(k).storeId === NEW_ID);
  t("B5 同意なしは拒否・同意すると月額100円(税込)の契約・2回目は重複にしない(台帳は1件)", sub0.code === 400 && sub1.code === 200 && sub2.code === 409 && sub2.body.reason === "already_subscribed" && doc("storeCustomPlans/" + NEW_ID).consent.feeJpy === 100 && usage.length === 1, { sub0: sub0.body, sub1: sub1.body, sub2: sub2.body, usage });

  clearRate();
  const p1 = await call({ mode: "storeProfilePublish", storeId: NEW_ID, expectedRevision: rev(NEW_ID) }, "ua");
  t("B6 契約の後は公開できる", p1.code === 200 && doc("storeProfiles/" + NEW_ID).status === "published", p1.body);
  list = await myStores("ua");
  const s1 = list.find((s) => s.storeId === NEW_ID) || {};
  t("B7 店舗一覧：契約中(active)・旅行者に公開中(true)", s1.planState === "active" && s1.publiclyVisible === true, s1);

  const pg = await page(NEW_ID);
  const html = String(pg.body || "");
  t("B8 店舗ページ：電話はタップで発信(tel:+数字)・番号の表示", pg.code === 200 && html.includes('href="tel:0981234567"') && html.includes(">098-123-4567</a>"), html.slice(0, 300));
  t("B9 店舗ページ：予約先・公式サイト・SNS(Instagram・LINE)を新しいタブで開く(noopener)", html.includes('href="https://reserve.example.com/book" target="_blank" rel="noopener noreferrer nofollow" data-contact="reservation"') && html.includes('href="https://shop.example.com/" target="_blank" rel="noopener noreferrer" data-contact="website"') && html.includes('href="https://www.instagram.com/example_shop/"') && html.includes(">Instagram</a>") && html.includes('href="https://lin.ee/abcdEFG"') && html.includes(">LINE</a>"));
  t("B10 店舗ページ：対応言語(日本語・英語)・見出し「電話・予約・SNS」", html.includes("電話・予約・SNS") && html.includes("対応言語") && html.includes("<li>日本語</li>") && html.includes("<li>英語</li>"));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  t("B11 構造化データ：telephone・sameAs(公式サイト・SNS)", ld.telephone === "0981234567" && ld.sameAs.includes("https://shop.example.com/") && ld.sameAs.includes("https://www.instagram.com/example_shop/"), ld);
  const en = String((await page(NEW_ID, "en")).body || "");
  t("B12 英語の表示：Phone number・Reservation page・Languages spoken(言語名は英語)", en.includes("Phone, booking &amp; social media") && en.includes("Reservation page") && en.includes("Languages spoken") && en.includes("<li>English</li>") && en.includes("<li>Japanese</li>"));
  t("B13 店主の入力した住所の文字列・uid・メール・契約の情報は出さない", !html.includes("沖縄県那覇市牧志2-2-2") && !html.includes("ua@example.com") && !/ownerUid|storeCustomPlans|planConsent/.test(html));
  const listApi = await get({ mode: "publicStoreProfiles" });
  const inList = (listApi.body.stores || []).find((s) => s.id === "sp_" + NEW_ID) || {};
  t("B14 旅行者向けの一覧(TOP)・共有のプレビューには電話・予約先・SNS を足していない(店舗ページだけ)", inList.id === "sp_" + NEW_ID && !("contact" in inList) && !("phone" in inList) && !("reservationUrl" in inList) && !("socialLinks" in inList), Object.keys(inList));
  const share = String((await get({ mode: "renderShareShop", shopId: "sp_" + NEW_ID })).body || "");
  t("B15 旧い共有リンク(/share/shop/sp_{ID})は店舗ページへ移る(互換)", share.includes('location.replace("/shop/' + NEW_ID + '")'));
}

// ===== C. 引き継ぎ(ub)：新規登録と同じ契約・同じ流れ。運営掲載は書き換えない =====
let CLAIM_ID = "";
{
  card("ub"); clearRate();
  const r = await call({ mode: "storeListingClaimCreate", submissionId: "LA", targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "" }, "ub");
  CLAIM_ID = r.body && r.body.storeId;
  t("C1 カード登録済み：運営の承認・電話確認・運営配布の URL なしで、その場で引き継ぎ(approved)", r.code === 200 && r.body.status === "approved" && doc("storeListingLinks/LA").storeId === CLAIM_ID, r.body);
  t("C2 運営掲載(submissions)は書き換えない", JSON.stringify(doc("submissions/LA")) === listingBefore);
  clearRate();
  const again = await call({ mode: "storeListingClaimCreate", submissionId: "LA", targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "" }, "ua");
  t("C3 二重の引き継ぎは 409 listing_already_linked", again.code === 409 && again.body.reason === "listing_already_linked", again.body);
  let s = (await myStores("ub")).find((x) => x.storeId === CLAIM_ID) || {};
  t("C4 引き継いだ店舗も一覧に同じ形(未契約・非公開・固定の URL)", s.planState === "none" && s.publiclyVisible === false && s.storePageUrl === "https://machinau.jp/shop/" + CLAIM_ID, s);
  clearRate();
  const u = await call(PROFILE(CLAIM_ID, rev(CLAIM_ID), { description: "引き継いだ店主の紹介文。" }), "ub");
  addPhoto(CLAIM_ID);
  clearRate();
  const p0 = await call({ mode: "storeProfilePublish", storeId: CLAIM_ID, expectedRevision: rev(CLAIM_ID) }, "ub");
  t("C5 引き継ぎでも、契約前は下書きの編集だけ(公開できない)", u.code === 200 && p0.code !== 200 && doc("storeProfiles/" + CLAIM_ID).status === "draft", { u: u.body, p0: p0.body });
  clearRate();
  const sub = await call({ mode: "storeCustomPlanSubscribe", storeId: CLAIM_ID, contractModel: "monthly", planConsentVersion: CONSENT }, "ub");
  const pick = (p) => p && { status: p.status, periodKind: p.periodKind, fee: p.consent.feeJpy, tax: p.consent.taxIncluded, version: p.consent.version };
  t("C6 引き継ぎの契約は、新規登録の契約と同じ(月額100円・税込・同じ同意の版・暦月)", sub.code === 200 && JSON.stringify(pick(doc("storeCustomPlans/" + CLAIM_ID))) === JSON.stringify(pick(doc("storeCustomPlans/" + NEW_ID))), { a: pick(doc("storeCustomPlans/" + NEW_ID)), b: pick(doc("storeCustomPlans/" + CLAIM_ID)) });
  clearRate();
  const p1 = await call({ mode: "storeProfilePublish", storeId: CLAIM_ID, expectedRevision: rev(CLAIM_ID) }, "ub");
  s = (await myStores("ub")).find((x) => x.storeId === CLAIM_ID) || {};
  t("C7 契約の後は公開でき、店舗ページ /shop/{ID} が開く", p1.code === 200 && s.publiclyVisible === true && (await page(CLAIM_ID)).code === 200, p1.body);
}

// ===== D. 他の店舗は操作できない =====
{
  clearRate();
  const edit = await call(PROFILE(NEW_ID, rev(NEW_ID), { description: "乗っ取り" }), "ub");
  clearRate();
  const pub = await call({ mode: "storeProfileUnpublish", storeId: NEW_ID }, "ub");
  clearRate();
  const cancel = await call({ mode: "storeCustomPlanCancel", storeId: NEW_ID }, "ub");
  clearRate();
  const ident = await call({ mode: "storeIdentityUpdate", storeId: NEW_ID, storeName: "乗っ取り", address: "沖縄県那覇市牧志2-2-2" }, "ub");
  t("D1 他人の店舗の編集・非公開・解約・店名の変更はできない(公開・契約はそのまま)", [edit, pub, cancel, ident].every((x) => x.code === 404 || x.code === 403) && doc("storeProfiles/" + NEW_ID).status === "published" && doc("storeCustomPlans/" + NEW_ID).status === "active" && doc("storeProfiles/" + NEW_ID).description !== "乗っ取り", [edit, pub, cancel, ident].map((x) => [x.code, x.body && x.body.reason]));
  const other = await myStores("uz");
  t("D2 店舗一覧は自分がメンバーの店舗だけ(他人の店舗・契約は見えない)", other.length === 0, other);
}

// ===== E. 解約 → 退会(清算待ち・最終削除しない) =====
{
  clearRate();
  const c = await call({ mode: "storeCustomPlanCancel", storeId: NEW_ID }, "ua");
  const s = (await myStores("ua")).find((x) => x.storeId === NEW_ID) || {};
  t("E1 店主が自分で解約できる：一覧は解約済み(canceling)・公開できる期限を返す・月末までページは開く", c.code === 200 && s.planState === "canceling" && s.planAccessUntilMillis > Date.now() && s.publiclyVisible === true && (await page(NEW_ID)).code === 200, { c: c.body, s });
  clearRate();
  const chk = await call({ mode: "storeAccountDeletionCheck" }, "ua");
  clearRate();
  const del = await call({ mode: "storeAccountDelete", confirm: true }, "ua");
  const rec = doc("accountDeletions/ua") || {};
  t("E2 退会は確認(Check)→確定(confirm)の2段階・当月分が未請求の間は清算待ち(awaiting_settlement)", chk.code === 200 && chk.body.deletable === true && del.code === 202 && del.body.status === "awaiting_settlement" && del.body.blockers.includes("custom_plan_unbilled") && rec.status === "awaiting_settlement", { chk: chk.body, del: del.body });
  t("E3 退会の受付：店舗は非公開・無効、ページは 404、ログイン・カードは最後のお支払いのため残す(最終削除しない)", doc("storeProfiles/" + NEW_ID).status === "draft" && doc("storeAccounts/" + NEW_ID).enabled === false && (await page(NEW_ID)).code === 404 && !(globalThis.__MOCK_AUTH_DELETED || []).includes("ua") && doc("accountBilling/ua").test.paymentMethodId === "pm_ua");
  clearRate();
  const noConfirm = await call({ mode: "storeAccountDelete" }, "ub");
  t("E4 確認の印(confirm)が無い退会は受け付けない", noConfirm.code === 400 && !doc("accountDeletions/ub"), noConfirm.body);
  t("E5 本番の自動の最終削除は OFF のまま(代表の承認まで)", DEL.ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED === false && DEL.isAccountDeletionSweepAllowed({ VERCEL_ENV: "production" }) === false);
}

// ===== F. 店舗ページの安全(危険な URL・不正な電話は出さない) =====
{
  const C = SP.buildPublicStoreContact({ phone: "<script>", reservationUrl: "javascript:alert(1)", socialLinks: [{ type: "instagram", url: "data:text/html,x" }, { type: "x", url: "https://x.com/a\"onmouseover=1" }, { type: "youtube", url: "https://www.youtube.com/@a" }], supportedLanguageCodes: ["ja", "xx", "ko"] });
  const C2 = SP.buildPublicStoreContact({ socialLinks: [{ type: "evil", url: "https://x.example.com/" }, { type: "facebook", url: "https://user:pw@facebook.com/a" }, { type: "line", url: "https://lin.ee/<x>" }] });
  t("F1 連絡先の許可リスト：不正な電話・javascript:/data:・知らない種類・引用符・認証情報つきの URL は落とす", C.phone === "" && C.reservationUrl === "" && C.socialLinks.length === 1 && C.socialLinks[0].type === "youtube" && C2.socialLinks.length === 0 && JSON.stringify(C.supportedLanguageCodes) === '["ja","ko"]', C);
  const store = { storeName: "安全の店", categoryCode: "other", description: "", photos: [], location: { prefecture: "沖縄県", city: "那覇市" }, businessHours: null, websiteUrl: "javascript:alert(1)", paymentMethodCodes: [], featureCodes: [], contact: { phone: "098-000-0000\"><script>", reservationUrl: "http://plain.example.com/r?a=1&b=2", socialLinks: [{ type: "tiktok", url: "vbscript:x" }], supportedLanguageCodes: [] } };
  const html = PG.buildStorePageHtml("SAFE1", store, null, "ja");
  t("F2 描画の直前にも確かめる：javascript:/vbscript: のリンク・壊れた電話の発信リンクは出さない", !/javascript:|vbscript:/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "")) && !html.includes("tel:") && !html.includes("<script>"), html.slice(html.indexOf("<main"), html.indexOf("<main") + 600));
  t("F3 http の予約先は開ける(保存の時の検証と同じ)・& はエスケープ", html.includes('href="http://plain.example.com/r?a=1&amp;b=2"'));
  const empty = PG.buildStorePageHtml("SAFE2", { ...store, websiteUrl: "", contact: { phone: "", reservationUrl: "", socialLinks: [], supportedLanguageCodes: [] } }, null, "ja");
  t("F4 登録が無い項目は表示しない(見出しも出さない)", !empty.includes("電話・予約・SNS") && !empty.includes("対応言語"));
  const share = await SP.readPublicStoreProfileForShare((await import("firebase-admin/firestore")).getFirestore(), CLAIM_ID);
  t("F5 共有のプレビュー用の読み取り(既定)には contact を付けない", share && !("contact" in share));
  t("F6 一覧の契約の状態の要約(store-profile.js)：未払いは unpaid・契約なし/終了は none・店舗登録のファイルは契約を読まない", SP.summarizeStorePlanForList({ status: "active", paymentStatus: "suspended", periodKind: "monthly" }, Date.now()).planState === "unpaid" && SP.summarizeStorePlanForList(null, Date.now()).planState === "none" && SP.summarizeStorePlanForList({ status: "canceled", periodKind: "monthly" }, Date.now()).planState === "none" && typeof SS.summarizeStorePlanForList === "undefined");
}

// ===== G. 画面・文言・古いページ・規約・課金 OFF =====
{
  const src = readFileSync(join(REPO_ROOT, "translations.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src + ";this.T = MACHINAU_TRANSLATIONS;", ctx);
  const T = ctx.T;
  const keys = ["store_steps_plan", "store_steps_publish", "store_list_public_visible", "store_list_public_hidden", "store_list_plan_active", "store_list_plan_canceling", "store_list_plan_unpaid", "store_list_plan_none", "store_management_help_note", "store_claim_resume_text", "store_claim_resume_link", "store_claim_resume_dismiss"];
  t("G1 新しい文言は日本語・英語の両方がある", keys.every((k) => T[k] && T[k].ja && T[k].en), keys.filter((k) => !(T[k] && T[k].ja && T[k].en)));
  const L = PG.STORE_PAGE_LABELS;
  t("G2 店舗ページの電話・予約・SNS の文言は編集画面の文言と同じ(日英)", ["ja", "en"].every((lang) => L[lang].phone === T.store_profile_phone_label[lang] && L[lang].reservation === T.store_profile_reservation_label[lang] && L[lang].headingLanguages === T.store_profile_languages_heading[lang] && ["instagram", "x", "facebook", "tiktok", "youtube", "threads", "line"].every((k) => L[lang].social[k] === T["store_profile_social_" + k][lang])));

  const acc = readFileSync(join(REPO_ROOT, "store-account.html"), "utf8");
  t("G3 店舗アカウント画面：手順は⑥公開まで・店舗ごとの公開/契約の状態・固定の URL とコピー・管理の案内", acc.includes('key: "store_steps_plan"') && acc.includes('key: "store_steps_publish"') && acc.includes("appendStoreCardStates(item, store)") && acc.includes('data-store-page-copy') && acc.includes('data-i18n="store_management_help_note"'));
  t("G4 引き継ぎの途中のメール確認から戻れる(掲載 ID だけをこの端末に24時間)・確認の後の自動の取り直し", acc.includes('CLAIM_RESUME_STORAGE_KEY = "machinauPendingClaim"') && acc.includes("rememberPendingClaim(CLAIM_SUBMISSION_ID)") && acc.includes("forgetPendingClaim();") && acc.includes('addEventListener("visibilitychange", refreshVerificationQuietly)'));
  t("G5 新規登録の入力を残す(カード登録・戻る・再読み込み)。登録済み・やめるで消す", acc.includes('STORE_FORM_DRAFT_STORAGE_KEY = "machinauStoreFormDraft"') && /function openStoreForm\(\) \{[\s\S]*?restoreStoreFormDraft\(\);/.test(acc) && /function closeStoreForm\(\) \{\s*clearStoreFormDraft\(\);/.test(acc));
  t("G6 LINE の登録・ログインを必須にしていない・架空の公式アカウントの URL を置いていない", !/line\.me\/R\/ti|lin\.ee\//.test(acc) && !/LINE(で|に)ログイン/.test(acc));

  const apply = readFileSync(join(REPO_ROOT, "shop-apply.html"), "utf8");
  const visible = apply.replace(/<!--[\s\S]*?-->/g, "");
  t("G7 shop-apply.html：URL は残し(200 の静的ページ)、古い「投稿は無料」・旧フォーム・旧方式の案内を撤去", !visible.includes("無料") && !apply.includes('id="applyForm"') && !apply.includes("shopApplicationCreate") && !apply.includes("<script") && apply.includes('href="store-account.html"') && apply.includes('href="shop.html"'));
  t("G8 shop-apply.html：今の正式な料金(新規登録も引き継ぎも同じ月額100円)・noindex・canonical は shop.html", apply.includes("新規店舗登録も、掲載済み店舗の引き継ぎも、同じ料金でご利用いただけます") && apply.includes('content="noindex"') && apply.includes('href="https://machinau.jp/shop.html"'));

  const terms = readFileSync(join(REPO_ROOT, "terms.html"), "utf8");
  const toku = readFileSync(join(REPO_ROOT, "tokushoho.html"), "utf8");
  t("G9 規約・特商法は変えていない(11月1日の版・12月1日の告知を残す・法務の判断の文言は保留)", terms.includes("最終更新日：2026年11月1日") && terms.includes('data-effective="2026-12-01"') && toku.includes("最終更新日：2026年11月1日") && terms.includes("店舗カード」といいます）の作成・保存・編集は無料です。") && toku.includes("の作成・保存・編集：無料。"));
  t("G10 課金・削除のスイッチは OFF のまま(店舗カードの請求・遅れた請求の自動・今だけ投稿の請求・本番の自動の最終削除)", BL.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false && CH.STORE_CUSTOM_PLAN_LATE_AUTO_CHARGE_ENABLED === false && IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && DEL.ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED === false);
  const wf = readFileSync(join(REPO_ROOT, ".github/workflows/store-card-plan-production.yml"), "utf8");
  t("G11 定期実行は1日4回のまま", /cron: "10 1-4 \* \* \*"/.test(wf));
  const app = readFileSync(join(REPO_ROOT, "app.js"), "utf8");
  t("G12 運営の無料掲載の「近くの店舗」15km は変えていない", /const NEARBY_SHOP_CARD_RADIUS_KM =\s*15;/.test(app));
  t("G13 試験の通信は OpenAI・Geocoding の偽物だけ(Stripe・本番には接続していない)", otherNetwork === 0, otherNetwork);
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
