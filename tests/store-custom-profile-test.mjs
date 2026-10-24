// STEP 44-A server: paid store customization (月額100円カスタマイズ) — menu items with photos, extra links, story.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// OpenAI Moderation and Cloudinary destroy are answered by local stubs. No Stripe, no real network, no real data.
// The plan state (storeCustomPlans) is written only by this test (STEP 44-A has no writer; 44-B will add the server writer).
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-profile-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
process.env.OPENAI_API_KEY = "sk-" + "fake-openai-for-tests"; process.env.CLOUDINARY_API_KEY = "fake-cloudinary-key"; process.env.CLOUDINARY_API_SECRET = "fake-cloudinary-secret";
const pw = (uid, email, verified = true) => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "a@example.com"), u2: pw("u2", "b@example.com"), unverified: pw("u1", "a@example.com", false) };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let otherNetwork = 0, moderationCalls = 0, imageModerationCalls = 0;
const destroyed = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "api.openai.com") {
    moderationCalls++;
    const body = String(opts.body || "");
    if (/image_url/.test(body)) imageModerationCalls++;
    const input = JSON.parse(body || "{}").input;
    const n = Array.isArray(input) ? input.length : 1;
    const flagged = /FLAGME|flagimg/.test(body);
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged, categories: {}, category_scores: {} })) }) };
  }
  if (u.hostname === "api.cloudinary.com" && u.pathname.endsWith("/image/destroy")) {
    destroyed.push(new URLSearchParams(String(opts.body)).get("public_id"));
    return { ok: true, status: 200, json: async () => ({ result: "ok" }) };
  }
  otherNetwork++; throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");

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

// ---- fixtures: two published stores (S1 owned by u1, S2 owned by u2) ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(Date.now() - 86400000);
function seedStore(id, uid, name, lat) {
  S.docs.set("storeAccounts/" + id, { storeName: name, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: lat, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  const photo = { url: CLD + "v1/machinau_store_profiles/" + id + "/free1.webp", publicId: "machinau_store_profiles/" + id + "/free1", moderationStatus: "passed" };
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 3, categoryCode: "cafe_sweets", description: "無料の紹介文", moderationStatus: "passed", moderatedText: "無料の紹介文", businessHours: null, photos: [photo], publishedAt: at, updatedAt: at });
}
seedStore("S1", "u1", "海辺のカフェ", 26.21);
seedStore("S2", "u2", "となりの食堂", 26.22);
const FREE_S1 = snap("storeProfiles/S1");
const future = () => Timestamp.fromMillis(Date.now() + 30 * 86400000);
const setPlan = (id, status, until) => S.docs.set("storeCustomPlans/" + id, { storeId: id, status, accessUntil: until, ownerUid: id === "S1" ? "u1" : "u2" });
const menuPhoto = (id, key) => ({ url: CLD + "v1700000000/machinau_store_profiles/" + id + "/menu/" + key + ".webp", publicId: "machinau_store_profiles/" + id + "/menu/" + key });
const GOOD = (extra = {}) => ({
  mode: "storeCustomProfileUpdate", storeId: "S1", expectedRevision: 0,
  menuItems: [
    { name: "ちんすこうラテ", description: "自家製のちんすこうを\n砕いて乗せました。", priceText: "¥650", photo: menuPhoto("S1", "latte") },
    { name: "本日のケーキ", description: "", priceText: "", photo: null }
  ],
  links: [
    { type: "instagram", label: "", url: "https://www.instagram.com/example_cafe" },
    { type: "reservation", label: "席の予約", url: "https://reserve.example.com/cafe" }
  ],
  story: "祖母が始めた小さな喫茶店を、2020年に受け継ぎました。",
  ...extra
});

// ===================== access control =====================
let r = await call({ mode: "storeCustomProfileGet", storeId: "S1" });
t("A1 未ログイン：取得は 401", r.code === 401, r.body);
r = await call({ mode: "storeCustomProfileGet", storeId: "S1" }, "unverified");
t("A2 メール未確認：取得は 403 email_not_verified", r.code === 403 && r.body.reason === "email_not_verified", r.body);
r = await call({ mode: "storeCustomProfileGet", storeId: "S1" }, "u2");
t("A3 他の店舗の店主：404 store_not_found（存在の有無も出さない）", r.code === 404 && r.body.reason === "store_not_found", r.body);
r = await call({ mode: "storeCustomProfileGet", storeId: "S1" }, "u1");
t("A4 未契約の店主：取得は 200・利用権限なし（plan.access false・editable false）・上限と種類を返す", r.code === 200 && r.body.plan.access === false && r.body.plan.status === "none" && r.body.editable === false && r.body.limits.menuItemsMax === 20 && r.body.linkTypes.includes("reservation") && r.body.custom.revision === 0, r.body);
clearRate(); r = await call(GOOD(), "u1");
t("A5 未契約の店主：保存は 403 plan_required・何も書き込まない", r.code === 403 && r.body.reason === "plan_required" && !S.docs.has("storeCustomProfiles/S1"), r.body);
clearRate(); r = await call(GOOD({ storeId: "S1" }), "u2");
t("A6 他の店舗の店主が S1 を保存：404・書き込みなし", r.code === 404 && !S.docs.has("storeCustomProfiles/S1"), r.body);
setPlan("S1", "active", Timestamp.fromMillis(Date.now() - 1000));
clearRate(); r = await call(GOOD(), "u1");
t("A7 利用期限が過ぎた契約（active でも accessUntil が過去）：403 plan_required", r.code === 403 && r.body.reason === "plan_required", r.body);
setPlan("S1", "canceled", future());
clearRate(); r = await call(GOOD(), "u1");
t("A8 解約済み（canceled）：期限が先でも 403 plan_required", r.code === 403 && r.body.reason === "plan_required", r.body);
S.docs.set("storeCustomPlans/S1", { storeId: "S1", status: "active", ownerUid: "u1" });
clearRate(); r = await call(GOOD(), "u1");
t("A9 利用期限の無い契約（無期限は作らない）：403 plan_required", r.code === 403 && r.body.reason === "plan_required", r.body);
t("A10 判定関数：active/canceling かつ期限が先の時だけ true", CP.hasStoreCustomPlanAccess({ status: "active", accessUntil: future() }, Date.now()) && CP.hasStoreCustomPlanAccess({ status: "canceling", accessUntil: future() }, Date.now()) && !CP.hasStoreCustomPlanAccess({ status: "past_due", accessUntil: future() }, Date.now()) && !CP.hasStoreCustomPlanAccess(null, Date.now()));

// ===================== save with access =====================
setPlan("S1", "active", future());
const S1_PLAN = snap("storeCustomPlans/S1");
moderationCalls = 0;
clearRate(); r = await call(GOOD(), "u1");
const saved = S.docs.get("storeCustomProfiles/S1") || {};
t("B1 契約中の店主：保存は 200・revision 1・メニュー2件・リンク2件・ストーリー", r.code === 200 && r.body.revision === 1 && saved.menuItems.length === 2 && saved.links.length === 2 && saved.story.startsWith("祖母") && saved.updatedByUid === "u1", { body: r.body, saved });
t("B2 文章は1回・新しい商品写真は1枚ずつ Moderation（文章1＋写真1＝2回）", moderationCalls === 2, moderationCalls);
t("B3 価格が空の商品は空のまま保存（表示しない）・写真なしの商品は photo null", saved.menuItems[1].priceText === "" && saved.menuItems[1].photo === null && saved.menuItems[0].photo.moderationStatus === "passed", saved.menuItems);
t("B4 無料の店舗情報（storeProfiles）・契約状態（storeCustomPlans）は変わらない", snap("storeProfiles/S1") === FREE_S1 && snap("storeCustomPlans/S1") === S1_PLAN);
moderationCalls = 0;
clearRate(); r = await call(GOOD({ expectedRevision: 1 }), "u1");
t("B5 内容が同じ保存：Moderation を呼ばない・revision 2", r.code === 200 && r.body.revision === 2 && moderationCalls === 0, { body: r.body, moderationCalls });
clearRate(); r = await call(GOOD({ expectedRevision: 1 }), "u1");
t("B6 古い revision での保存：409 revision_conflict（上書きしない）", r.code === 409 && r.body.reason === "revision_conflict" && r.body.currentRevision === 2, r.body);
const g = await call({ mode: "storeCustomProfileGet", storeId: "S1" }, "u1");
t("B7 取得：契約中は editable true・保存した内容を返す（写真は url と publicId だけ）", g.code === 200 && g.body.editable === true && g.body.plan.access === true && g.body.custom.revision === 2 && g.body.custom.menuItems[0].photo.publicId === "machinau_store_profiles/S1/menu/latte" && !("moderationStatus" in g.body.custom.menuItems[0].photo), g.body);

// ===================== input validation =====================
async function bad(extra, field) {
  clearRate(); const before = snap("storeCustomProfiles/S1");
  const rr = await call(GOOD({ expectedRevision: 2, ...extra }), "u1");
  return rr.code === 400 && rr.body.reason === "invalid_input" && String(rr.body.field) === field && snap("storeCustomProfiles/S1") === before ? true : rr.body;
}
const link = (url, type = "other") => ({ links: [{ type, label: "", url }] });
for (const [n, u] of [["javascript:", "javascript:alert(1)"], ["data:", "data:text/html,<script>alert(1)</script>"], ["http:（https だけ）", "http://example.com/"], ["ユーザー名入り", "https://user:pass@example.com/"], ["空白入り", "https://exa mple.com/"]]) {
  const v = await bad(link(u), "links"); t("V1 危険・不正な URL を保存しない：" + n, v === true, v);
}
let v = await bad({ links: [{ type: "evil", label: "", url: "https://example.com/" }] }, "links"); t("V2 許可されていないリンクの種類：400", v === true, v);
v = await bad({ links: Array.from({ length: 6 }, () => ({ type: "other", label: "", url: "https://example.com/" })) }, "links"); t("V3 リンク6件（上限5）：400", v === true, v);
v = await bad({ links: [{ type: "other", label: "あ".repeat(31), url: "https://example.com/" }] }, "links"); t("V4 リンクの表示名31字（上限30）：400", v === true, v);
v = await bad({ menuItems: Array.from({ length: 21 }, (_, i) => ({ name: "商品" + i })) }, "menuItems"); t("V5 商品21件（上限20）：400", v === true, v);
v = await bad({ menuItems: [{ name: "" }] }, "menuItems.name"); t("V6 商品名が空：400", v === true, v);
v = await bad({ menuItems: [{ name: "あ".repeat(41) }] }, "menuItems.name"); t("V7 商品名41字（上限40）：400", v === true, v);
v = await bad({ menuItems: [{ name: "改行\n入り" }] }, "menuItems.name"); t("V8 商品名の改行：400", v === true, v);
v = await bad({ menuItems: [{ name: "A", description: "あ".repeat(301) }] }, "menuItems.description"); t("V9 説明301字（上限300）：400", v === true, v);
v = await bad({ menuItems: [{ name: "A", priceText: "1".repeat(21) }] }, "menuItems.priceText"); t("V10 価格21字（上限20）：400", v === true, v);
v = await bad({ story: "あ".repeat(2001) }, "story"); t("V11 ストーリー2,001字（上限2,000）：400", v === true, v);
v = await bad({ story: "制御文字\u0007" }, "story"); t("V12 制御文字：400", v === true, v);
v = await bad({ menuItems: [{ name: "A", photo: menuPhoto("S2", "x") }] }, "menuItems.photo"); t("V13 他の店舗の商品写真：400", v === true, v);
v = await bad({ menuItems: [{ name: "A", photo: { url: CLD + "v1/machinau_store_profiles/S1/free1.webp", publicId: "machinau_store_profiles/S1/free1" } }] }, "menuItems.photo"); t("V14 無料の店舗写真のフォルダーの画像を商品写真にしない：400", v === true, v);
v = await bad({ menuItems: [{ name: "A", photo: { url: CLD + "v1/machinau_store_profiles/S1/menu/other.webp", publicId: "machinau_store_profiles/S1/menu/latte" } }] }, "menuItems.photo"); t("V15 URL と publicId の不一致（すり替え）：400", v === true, v);
v = await bad({ menuItems: [{ name: "A", photo: { url: "https://evil.example.com/v1/machinau_store_profiles/S1/menu/x.webp", publicId: "machinau_store_profiles/S1/menu/x" } }] }, "menuItems.photo"); t("V16 外部の画像 URL：400", v === true, v);
v = await bad({ menuItems: [{ name: "A", photo: menuPhoto("S1", "dup") }, { name: "B", photo: menuPhoto("S1", "dup") }] }, "menuItems.photo"); t("V17 同じ写真を2つの商品に使わない：400", v === true, v);
v = await bad({ menuItems: "x" }, "menuItems"); t("V18 配列でない menuItems：400", v === true, v);

// ===================== moderation =====================
clearRate(); let before = snap("storeCustomProfiles/S1");
r = await call(GOOD({ expectedRevision: 2, story: "FLAGME 不適切な文章" }), "u1");
t("M1 不適切な文章：400 content_not_allowed・保存しない", r.code === 400 && r.body.reason === "content_not_allowed" && snap("storeCustomProfiles/S1") === before, r.body);
destroyed.length = 0; clearRate(); before = snap("storeCustomProfiles/S1");
r = await call(GOOD({ expectedRevision: 2, menuItems: [{ name: "A", photo: menuPhoto("S1", "flagimg") }] }), "u1");
t("M2 不適切な商品写真：400 photo_not_allowed・保存しない・今回の写真だけ Cloudinary から削除", r.code === 400 && r.body.reason === "photo_not_allowed" && snap("storeCustomProfiles/S1") === before && JSON.stringify(destroyed) === '["machinau_store_profiles/S1/menu/flagimg"]', { body: r.body, destroyed });

// ===================== photo removal =====================
destroyed.length = 0; clearRate();
r = await call(GOOD({ expectedRevision: 2, menuItems: [{ name: "本日のケーキ" }] }), "u1");
t("P1 商品写真を外して保存：外した商品写真だけ削除（無料の写真は消さない）", r.code === 200 && JSON.stringify(destroyed) === '["machinau_store_profiles/S1/menu/latte"]' && snap("storeProfiles/S1") === FREE_S1, { body: r.body, destroyed });
clearRate(); r = await call(GOOD({ expectedRevision: 3 }), "u1");
t("P2 もう一度、写真つきの内容で保存（以後の公開の確認用）", r.code === 200 && r.body.revision === 4, r.body);

// ===================== free profile stays independent =====================
clearRate();
const free = await call({ mode: "storeProfileUpdate", storeId: "S1", expectedRevision: 3, categoryCode: "cafe_sweets", description: "無料の紹介文", businessHours: null, phone: "", websiteUrl: "", reservationUrl: "", socialLinks: [], paymentMethodCodes: [] }, "u1");
const customAfterFree = S.docs.get("storeCustomProfiles/S1");
t("F1 無料の店舗情報の保存は、有料の内容に触れない（storeCustomProfiles は revision 4 のまま）", free.code === 200 && customAfterFree.revision === 4 && customAfterFree.menuItems.length === 2, { code: free.code, body: free.body });
const freeAfter = S.docs.get("storeProfiles/S1");
t("F2 有料の内容は無料の店舗情報の文書に入らない（menuItems・links・story なし）", !("menuItems" in freeAfter) && !("links" in freeAfter) && !("story" in freeAfter), Object.keys(freeAfter));

// ===================== traveler-facing list =====================
let pl = await publicList();
const s1 = (pl.body.stores || []).find((s) => s.id === "sp_S1");
const s2 = (pl.body.stores || []).find((s) => s.id === "sp_S2");
const rawPublic = JSON.stringify(pl.body);
t("T1 旅行者向け一覧：契約中の S1 に有料の内容（メニュー2件・リンク2件・ストーリー）", pl.code === 200 && s1 && s1.custom && s1.custom.menuItems.length === 2 && s1.custom.links.length === 2 && s1.custom.story.startsWith("祖母"), pl.body);
t("T2 公開する項目は許可リストだけ（商品名・説明・価格・写真URL／リンクの種類・表示名・URL／ストーリー）", s1 && JSON.stringify(Object.keys(s1.custom.menuItems[0])) === '["name","description","priceText","photoUrl"]' && JSON.stringify(Object.keys(s1.custom.links[0])) === '["type","label","url"]' && s1.custom.menuItems[0].photoUrl.endsWith("/menu/latte.webp"), s1 && s1.custom);
t("T3 応答に publicId・uid・Moderation の記録・契約状態を含まない", !/publicId|updatedByUid|moderat|accessUntil|storeCustomPlans|"u1"/.test(rawPublic), rawPublic.slice(0, 400));
t("T4 未契約の S2 には custom が無い（無料の内容はこれまでどおり）", s2 && !("custom" in s2) && s2.description === "無料の紹介文", s2);
t("T5 無料の一覧の他の項目は変わらない（並び順・suppressed/claimed・キャッシュ）", JSON.stringify(pl.body.stores.map((s) => s.id)) === '["sp_S1","sp_S2"]' && Array.isArray(pl.body.suppressedListingIds) && Array.isArray(pl.body.claimedListingIds) && /s-maxage=/.test(pl.headers["Cache-Control"] || ""), pl.body);

// S2 has content but no plan → hidden
S.docs.set("storeCustomProfiles/S2", { storeId: "S2", revision: 1, menuItems: [{ name: "秘密の定食", description: "", priceText: "", photo: null }], links: [], story: "", moderationStatus: "passed", moderatedText: "秘密の定食" });
pl = await publicList();
t("T6 有料の内容があっても契約が無い店舗には付けない（ブラウザから契約状態は書けない＝サーバーの判定だけ）", !JSON.stringify(pl.body).includes("秘密の定食"), pl.body);

// Expiry → hidden, data kept, restore on re-contract
setPlan("S1", "canceling", Timestamp.fromMillis(Date.now() - 1000));
pl = await publicList();
const keptData = S.docs.get("storeCustomProfiles/S1");
t("T7 利用期限が過ぎたら表示しない・データは削除しない", !("custom" in pl.body.stores.find((s) => s.id === "sp_S1")) && keptData && keptData.menuItems.length === 2, pl.body.stores);
setPlan("S1", "active", future());
pl = await publicList();
t("T8 再契約（利用権限が戻る）でそのまま表示に戻る", !!pl.body.stores.find((s) => s.id === "sp_S1").custom);

// Tampered content (moderatedText mismatch) → hidden
S.docs.set("storeCustomProfiles/S1", { ...S.docs.get("storeCustomProfiles/S1"), story: "確認していない文章" });
pl = await publicList();
t("T9 Moderation 済みの文章と一致しない内容は表示しない", !("custom" in pl.body.stores.find((s) => s.id === "sp_S1")), pl.body.stores[0]);
S.docs.set("storeCustomProfiles/S1", keptData);

// Store suspended → whole store hidden (existing rule), custom never leaks separately
S.docs.set("storeAccounts/S1", { ...S.docs.get("storeAccounts/S1"), enabled: false });
pl = await publicList();
clearRate(); r = await call(GOOD({ expectedRevision: 4 }), "u1");
t("T10 運営が停止した店舗：一覧に出ない・保存は 403 store_not_editable", !pl.body.stores.some((s) => s.id === "sp_S1") && r.code === 403 && r.body.reason === "store_not_editable", { stores: pl.body.stores.map((s) => s.id), body: r.body });
S.docs.set("storeAccounts/S1", { ...S.docs.get("storeAccounts/S1"), enabled: true });

// Empty content → no custom key
const pub = CP.buildPublicStoreCustomProfile("S9", { status: "active", accessUntil: future() }, { menuItems: [], links: [], story: "", moderationStatus: "passed", moderatedText: "" }, Date.now());
t("T11 有料の内容が空なら null（画面に空の見出しを出さない）", pub === null, pub);

// ===================== Cloudinary signature =====================
const sig1 = await call({ mode: "cloudinarySignature", purpose: "storeCustomMenuPhoto", storeId: "S2" }, "u2");
t("C1 未契約の店舗：商品写真の署名は 403 plan_required", sig1.code === 403 && sig1.body.reason === "plan_required", sig1.body);
const sig2 = await call({ mode: "cloudinarySignature", purpose: "storeCustomMenuPhoto", storeId: "S1" }, "u1");
t("C2 契約中の店舗：商品写真の署名は商品写真のフォルダー（…/S1/menu）", sig2.code === 200 && sig2.body.folder === "machinau_store_profiles/S1/menu" && !JSON.stringify(sig2.body).includes("fake-cloudinary-secret"), sig2.body);
const sig3 = await call({ mode: "cloudinarySignature", purpose: "storeCustomMenuPhoto", storeId: "S1" }, "u2");
t("C3 他の店舗の店主：商品写真の署名は 404", sig3.code === 404, sig3.body);
const sig4 = await call({ mode: "cloudinarySignature", purpose: "storeProfilePhoto", storeId: "S2" }, "u2");
t("C4 無料の店舗写真の署名はこれまでどおり（契約不要・…/S2）", sig4.code === 200 && sig4.body.folder === "machinau_store_profiles/S2", sig4.body);

// ===================== shop-wide photo limit (代表決定：商品写真は店舗全体で最大5枚) =====================
const rev = () => S.docs.get("storeCustomProfiles/S1").revision;
const items = (n, photos) => Array.from({ length: n }, (_, i) => ({ name: "商品" + (i + 1), photo: i < photos ? menuPhoto("S1", "p" + (i + 1)) : null }));
const lim = await call({ mode: "storeCustomProfileGet", storeId: "S1" }, "u1");
t("L0 上限：商品20件・商品写真は店舗全体で5枚（応答の limits）", lim.body.limits.menuItemsMax === 20 && lim.body.limits.menuPhotosMax === 5 && lim.body.limits.storyMaxLength === 2000 && lim.body.limits.linksMax === 5, lim.body.limits);
destroyed.length = 0; clearRate();
r = await call(GOOD({ expectedRevision: rev(), menuItems: items(20, 5) }), "u1");
let doc = S.docs.get("storeCustomProfiles/S1");
t("L1 商品20件・写真5枚（15件は写真なし）：保存できる", r.code === 200 && doc.menuItems.length === 20 && doc.menuItems.filter((x) => x.photo).length === 5 && doc.menuItems[19].photo === null, r.body);
const fivePhotos = JSON.stringify(doc.menuItems.map((x) => x.photo && x.photo.publicId));
clearRate(); let beforeL2 = snap("storeCustomProfiles/S1");
r = await call(GOOD({ expectedRevision: rev(), menuItems: items(20, 6) }), "u1");
t("L2 写真6枚目：400 invalid_input（field menuPhotos）・保存しない（画面に関係なくサーバーで拒否）", r.code === 400 && r.body.reason === "invalid_input" && r.body.field === "menuPhotos" && snap("storeCustomProfiles/S1") === beforeL2, r.body);
clearRate(); beforeL2 = snap("storeCustomProfiles/S1");
r = await call(GOOD({ expectedRevision: rev(), menuItems: items(6, 6) }), "u1");
t("L3 商品6件すべてに写真（合計6枚）：400 menuPhotos", r.code === 400 && r.body.field === "menuPhotos" && snap("storeCustomProfiles/S1") === beforeL2, r.body);
destroyed.length = 0; imageModerationCalls = 0; clearRate();
const reordered = items(20, 5).reverse();
r = await call(GOOD({ expectedRevision: rev(), menuItems: reordered }), "u1");
doc = S.docs.get("storeCustomProfiles/S1");
t("L4 商品の並べ替え：順番どおりに保存・写真は商品についたまま・写真の削除も写真の Moderation もなし（文章は順番が変わるため再確認）", r.code === 200 && doc.menuItems[0].name === "商品20" && doc.menuItems[19].name === "商品1" && doc.menuItems[19].photo.publicId === "machinau_store_profiles/S1/menu/p1" && destroyed.length === 0 && imageModerationCalls === 0, { destroyed, imageModerationCalls });
destroyed.length = 0; imageModerationCalls = 0; clearRate();
const swapped = items(20, 5); swapped[0].photo = menuPhoto("S1", "p1new");
r = await call(GOOD({ expectedRevision: rev(), menuItems: swapped }), "u1");
doc = S.docs.get("storeCustomProfiles/S1");
t("L5 写真の差し替え：新しい写真だけ確認・古い写真だけ削除・合計5枚のまま", r.code === 200 && doc.menuItems[0].photo.publicId === "machinau_store_profiles/S1/menu/p1new" && JSON.stringify(destroyed) === '["machinau_store_profiles/S1/menu/p1"]' && imageModerationCalls === 1 && doc.menuItems.filter((x) => x.photo).length === 5, { destroyed, imageModerationCalls });
destroyed.length = 0; clearRate();
const removed = items(20, 5); removed[2].photo = null; removed[0].photo = menuPhoto("S1", "p1new");
r = await call(GOOD({ expectedRevision: rev(), menuItems: removed }), "u1");
doc = S.docs.get("storeCustomProfiles/S1");
t("L6 写真の削除：外した写真だけ削除・商品は残る（写真なしで表示できる）", r.code === 200 && JSON.stringify(destroyed) === '["machinau_store_profiles/S1/menu/p3"]' && doc.menuItems[2].name === "商品3" && doc.menuItems[2].photo === null && doc.menuItems.filter((x) => x.photo).length === 4, destroyed);
pl = await publicList();
const pub20 = pl.body.stores.find((s) => s.id === "sp_S1").custom;
t("L7 旅行者向け：20件すべて表示・写真のある商品は4件・写真の無い商品は photoUrl 空", pub20.menuItems.length === 20 && pub20.menuItems.filter((x) => x.photoUrl !== "").length === 4 && pub20.menuItems[2].photoUrl === "", pub20.menuItems.slice(0, 3));
// Free profile 10 photos: separate count, unaffected by the 5 menu photos
const tenFree = Array.from({ length: 10 }, (_, i) => ({ url: CLD + "v1/machinau_store_profiles/S1/free" + i + ".webp", publicId: "machinau_store_profiles/S1/free" + i, moderationStatus: "passed" }));
S.docs.set("storeProfiles/S1", { ...S.docs.get("storeProfiles/S1"), photos: tenFree });
const customBeforeFree = snap("storeCustomProfiles/S1");
destroyed.length = 0; clearRate();
const freeRev = S.docs.get("storeProfiles/S1").revision;
const free10 = await call({ mode: "storeProfileUpdate", storeId: "S1", expectedRevision: freeRev, categoryCode: "cafe_sweets", description: "無料の紹介文", businessHours: null, phone: "", websiteUrl: "", reservationUrl: "https://reserve.example.com/", socialLinks: [{ type: "instagram", url: "https://www.instagram.com/free_sns" }], paymentMethodCodes: [], photos: tenFree.map((x) => ({ url: x.url, publicId: x.publicId })) }, "u1");
const freeDoc = S.docs.get("storeProfiles/S1");
t("L8 無料の写真10枚は従来どおり保存できる（商品写真の5枚とは別に数える）・有料の内容は変わらない", free10.code === 200 && freeDoc.photos.length === 10 && snap("storeCustomProfiles/S1") === customBeforeFree && destroyed.length === 0, free10.body);
t("L9 無料の予約ページ・SNS欄は従来どおり保存される（削除・有料移行なし）", freeDoc.reservationUrl === "https://reserve.example.com/" && freeDoc.socialLinks.length === 1, { r: freeDoc.reservationUrl, s: freeDoc.socialLinks });
clearRate();
const free11 = await call({ mode: "storeProfileUpdate", storeId: "S1", expectedRevision: freeDoc.revision, categoryCode: "cafe_sweets", description: "無料の紹介文", businessHours: null, phone: "", websiteUrl: "", reservationUrl: "", socialLinks: [], paymentMethodCodes: [], photos: tenFree.concat([tenFree[0]]).map((x, i) => ({ url: CLD + "v1/machinau_store_profiles/S1/x" + i + ".webp", publicId: "machinau_store_profiles/S1/x" + i })) }, "u1");
t("L10 無料の写真11枚は従来どおり拒否（無料の上限10枚は変更なし）", free11.code === 400 && free11.body.field === "photos", free11.body);
clearRate();
const freeWithMenu = await call({ mode: "storeProfileUpdate", storeId: "S1", expectedRevision: freeDoc.revision, categoryCode: "cafe_sweets", description: "無料の紹介文", businessHours: null, phone: "", websiteUrl: "", reservationUrl: "", socialLinks: [], paymentMethodCodes: [], photos: [{ url: CLD + "v1700000000/machinau_store_profiles/S1/menu/p2.webp", publicId: "machinau_store_profiles/S1/menu/p2" }] }, "u1");
t("L11 商品写真を無料の写真へ流用できない（400 photos）", freeWithMenu.code === 400 && freeWithMenu.body.field === "photos", freeWithMenu.body);
v = await bad({ expectedRevision: rev(), menuItems: [{ name: "A", photo: menuPhoto("S2", "p1") }] }, "menuItems.photo");
t("L12 他店の商品写真の流用：400（上限の判定より前に拒否）", v === true || (v && v.field === "menuItems.photo"), v);

t("Z1 想定外の通信なし（OpenAI・Cloudinary の削除は模擬）", otherNetwork === 0, otherNetwork);
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
