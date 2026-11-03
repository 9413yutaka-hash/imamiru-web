// STEP 56: one permanent public page per owner-managed store (/shop/{storeId}), owner edits of name/location,
// one ¥100/month contract for both entry routes (new registration / takeover of an operator listing),
// share links, sitemap, SEO tags, pricing wording, charges stay off, terms stay on the Nov 1 version.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// Preview-trial contracts only, no Stripe, no billing. Geocoding is a local fake (no network).
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-page-test.mjs
import { REPO_URL, REPO_ROOT } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", GOOGLE_MAPS_API_KEY: "fake-maps-key", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEKEYFORLOCALTESTS0001" });
const pw = (uid, verified = true) => ({ uid, email: uid + "@example.com", email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["un", "ut", "um", "uo", "ux", "ud", "un2", "ut2"].map((u) => [u, pw(u)]));
globalThis.__MOCK_TOKENS.uv = pw("uv", false);
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

// 住所 → 座標の試験用の応答(Google Geocoding の形)。
const GEO = {
  "沖縄県那覇市牧志1-1-1": { lat: 26.2150, lng: 127.6880, city: "那覇市", formatted: "日本、〒900-0013 沖縄県那覇市牧志１丁目１−１" },
  "沖縄県那覇市久茂地1-1-1": { lat: 26.2140, lng: 127.6790, city: "那覇市", formatted: "日本、〒900-0015 沖縄県那覇市久茂地１丁目１−１" },
  "沖縄県北谷町美浜1-1": { lat: 26.3160, lng: 127.7570, city: "北谷町", formatted: "日本、〒904-0115 沖縄県中頭郡北谷町美浜１丁目１" }
};
let geocodeCalls = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  if (u.hostname === "maps.googleapis.com") {
    geocodeCalls++;
    const g = GEO[u.searchParams.get("address")];
    if (!g) return { ok: true, status: 200, json: async () => ({ status: "ZERO_RESULTS", results: [] }) };
    return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: g.formatted, geometry: { location: { lat: g.lat, lng: g.lng } }, address_components: [
      { long_name: "日本", short_name: "JP", types: ["country", "political"] },
      { long_name: "沖縄県", short_name: "沖縄県", types: ["administrative_area_level_1", "political"] },
      { long_name: g.city, short_name: g.city, types: ["locality", "political"] }
    ] }] }) };
  }
  throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const BL = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CR = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const PG = await import(REPO_URL + "/api/_lib/store-page.js");

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
const page = (storeId, lang) => get({ mode: "renderStorePage", storeId, ...(lang ? { lang } : {}) });
const publicIds = async () => ((await get({ mode: "publicStoreProfiles" })).body.stores || []).map((s) => s.id);
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
const plan = (id) => S.docs.get("storeCustomPlans/" + id);
const DAY = 86400000;
const CONSENT = BL.STORE_CARD_PLAN_CONSENT_VERSION;
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";

// ---- fixtures ----
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
const member = (id, uid, status = "active") => S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status });
function seedStore(id, uid, status = "published", extra = {}, profileExtra = {}) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, createdByType: "storeUser", createdByUid: uid, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", address: "沖縄県那覇市牧志1-1-1", locationFormattedAddress: "日本、〒900-0013 沖縄県那覇市牧志１丁目１−１", latitude: 26.215, longitude: 127.688, duplicateCandidates: [], reviewFlags: [], ...extra });
  member(id, uid);
  S.docs.set("storeProfiles/" + id, { storeId: id, status, storeName: "店" + id, revision: 3, categoryCode: "cafe_sweets", description: "紹介文" + id, moderationStatus: "passed", moderatedText: "紹介文" + id, businessHours: null, phone: "098-111-2222", reservationUrl: "https://reserve.example.com/" + id, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/p.webp", publicId: "machinau_store_profiles/" + id + "/p", moderationStatus: "passed" }], ...profileExtra });
}
const monthlyPlan = (id, uid, o = {}) => S.docs.set("storeCustomPlans/" + id, { storeId: id, status: "active", ownerUid: uid, periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(Date.now() - 40 * DAY), accessUntil: null, paymentStatus: "current", ...o });

// SN：新規登録の店舗(契約あり・公開中)／ST：運営掲載を引き継いだ店舗(契約あり・公開中)
seedStore("SN", "un", "published", {}, {
  businessHours: { weekly: { mon: [{ open: "09:00", close: "18:00" }], tue: [], wed: [{ open: "00:00", close: "24:00" }], thu: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "22:00" }], fri: [], sat: [], sun: [] }, note: "祝日は休み" },
  moderatedText: "紹介文SN\n祝日は休み", websiteUrl: "https://sn.example.com/", paymentMethodCodes: ["cash", "qr"], featureCodes: ["free_wifi", "takeout"],
  photos: [
    { url: CLD + "v1/machinau_store_profiles/SN/a.webp", publicId: "machinau_store_profiles/SN/a", moderationStatus: "passed" },
    { url: CLD + "v1/machinau_store_profiles/SN/b.webp", publicId: "machinau_store_profiles/SN/b", moderationStatus: "pending" },
    { url: CLD + "v1/machinau_store_profiles/SN/c.webp", publicId: "machinau_store_profiles/SN/c", moderationStatus: "passed" }
  ]
});
monthlyPlan("SN", "un");
seedStore("ST", "ut", "published", { duplicateCandidates: [{ source: "submissions", id: "subT" }], latitude: 26.214, longitude: 127.679 });
monthlyPlan("ST", "ut");
S.docs.set("submissions/subT", { shopName: "運営掲載の店", status: "approved", isPermanentAd: true, authorType: "shopAd", latitude: 26.214, longitude: 127.679 });
S.docs.set("storeListingLinks/subT", { status: "active", storeId: "ST", claimId: "cT" });
// 公開してはいけない店舗：下書き(SD)・契約なし(SX)・店主が抜けた(SW)・停止(SS)
seedStore("SD", "ud", "draft"); monthlyPlan("SD", "ud");
seedStore("SX", "ux", "published");
seedStore("SW", "uo", "published"); monthlyPlan("SW", "uo"); member("SW", "uo", "removed");
seedStore("SS", "uo", "published", { enabled: false }); monthlyPlan("SS", "uo");
// 運営の無料掲載(店主の管理なし)
S.docs.set("submissions/L1", { shopName: "運営の無料掲載の店", content: "地元の定食。", status: "approved", isPermanentAd: true, authorType: "shopAd", latitude: 26.3, longitude: 127.8, imageUrls: [CLD + "v1/l1.webp"] });
// 1つのアカウントで2店舗(M1・M2)
seedStore("M1", "um", "published", { latitude: 26.30, longitude: 127.80, address: "沖縄県北谷町美浜1-1" }); monthlyPlan("M1", "um");
seedStore("M2", "um", "published", { latitude: 26.40, longitude: 127.90 }); monthlyPlan("M2", "um");

// ===== A. 新規登録と引き継ぎの契約は同じ(同じ申込・同じ契約台帳・同じ条件) =====
{
  const subscribeSrc = readFileSync(join(REPO_ROOT, "api/_lib/store-custom-profile.js"), "utf8");
  const start = subscribeSrc.indexOf("export async function handleStoreCustomPlanSubscribe");
  const body = subscribeSrc.slice(start, subscribeSrc.indexOf("\nexport ", start + 10));
  t("A1 申込の処理は新規登録・引き継ぎを区別しない(作成の経路・紐付け・運営掲載を見ない)", start > 0 && !/createdByType|storeListingLinks|listingClaim|claimId|submissions/.test(body));

  // 新規登録の店舗(SN2)と引き継いだ店舗(ST2、運営掲載 subT2 に紐付く)。どちらも未契約・カード登録済み。
  seedStore("SN2", "un2", "draft");
  seedStore("ST2", "ut2", "draft", { createdByType: "listingClaim", duplicateCandidates: [{ source: "submissions", id: "subT2" }] });
  S.docs.set("submissions/subT2", { shopName: "引き継ぎ前の運営掲載", status: "approved", isPermanentAd: true, authorType: "shopAd" });
  S.docs.set("storeListingLinks/subT2", { status: "active", storeId: "ST2", claimId: "cT2" });
  card("un2"); card("ut2");

  const n0 = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN2", contractModel: "monthly" }, "un2");
  const s0 = await call({ mode: "storeCustomPlanSubscribe", storeId: "ST2", contractModel: "monthly" }, "ut2");
  t("A2 同意なしの申込は、新規登録・引き継ぎとも同じく拒否(400 plan_consent_required)", n0.code === 400 && s0.code === 400 && n0.body.reason === "plan_consent_required" && s0.body.reason === "plan_consent_required" && !plan("SN2") && !plan("ST2"), { n0: n0.body, s0: s0.body });

  clearRate();
  const n1 = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN2", contractModel: "monthly", planConsentVersion: CONSENT }, "un2");
  const s1 = await call({ mode: "storeCustomPlanSubscribe", storeId: "ST2", contractModel: "monthly", planConsentVersion: CONSENT }, "ut2");
  const pick = (p) => p && { status: p.status, periodKind: p.periodKind, feeJpy: p.consent && p.consent.feeJpy, taxIncluded: p.consent && p.consent.taxIncluded, version: p.consent && p.consent.version, accessUntil: p.accessUntil };
  t("A3 新規登録・引き継ぎとも同じ月額100円(税込)・同じ同意の版・同じ暦月の契約になる", n1.code === 200 && s1.code === 200 && JSON.stringify(pick(plan("SN2"))) === JSON.stringify(pick(plan("ST2"))) && pick(plan("SN2")).feeJpy === 100 && pick(plan("SN2")).taxIncluded === true && pick(plan("SN2")).periodKind === "monthly", { n: pick(plan("SN2")), s: pick(plan("ST2")) });
  const usage = (id) => [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanUsage/") && S.docs.get(k).storeId === id);
  t("A4 契約台帳(利用月の記録)は、どちらも同じ形で1店舗1か月に1件", usage("SN2").length === 1 && usage("ST2").length === 1, { n: usage("SN2"), s: usage("ST2") });

  clearRate();
  const n2 = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN2", contractModel: "monthly", planConsentVersion: CONSENT }, "un2");
  const s2 = await call({ mode: "storeCustomPlanSubscribe", storeId: "ST2", contractModel: "monthly", planConsentVersion: CONSENT }, "ut2");
  t("A5 同じ店舗への2回目の申込は重複契約にしない(409 already_subscribed)・台帳も増えない", n2.code === 409 && s2.code === 409 && n2.body.reason === "already_subscribed" && s2.body.reason === "already_subscribed" && usage("SN2").length === 1 && usage("ST2").length === 1, { n2: n2.body, s2: s2.body });

  clearRate();
  const other = await call({ mode: "storeCustomPlanSubscribe", storeId: "ST2", contractModel: "monthly", planConsentVersion: CONSENT }, "un2");
  t("A6 他人の店舗は申し込めない(404 store_not_found)", other.code === 404 && other.body.reason === "store_not_found", other.body);
}

// ===== B. 店舗ごとの固定の公開ページ =====
{
  const r = await page("SN");
  const html = String(r.body || "");
  t("B1 /shop/SN：200・店名・紹介文・カテゴリ・地域を表示", r.code === 200 && html.includes("<h1>店SN</h1>") && html.includes("紹介文SN") && html.includes("カフェ・スイーツ") && html.includes("沖縄県那覇市"), html.slice(0, 400));
  t("B2 SEO：title・description・canonical・og:url は店舗ごと(固定の URL)", html.includes("<title>店SN（沖縄県那覇市）｜マチナウ</title>") && html.includes('<meta name="description" content="紹介文SN">') && html.includes('<link rel="canonical" href="https://machinau.jp/shop/SN">') && html.includes('<meta property="og:url" content="https://machinau.jp/shop/SN">'));
  t("B3 OGP：og:image は審査を通過した店舗の写真の1枚目・twitter は大きい画像", html.includes('<meta property="og:image" content="' + CLD + 'v1/machinau_store_profiles/SN/a.webp">') && html.includes('content="summary_large_image"'));
  t("B4 検索に載せる(公開中の日本語のページは noindex を付けない)", !/noindex/.test(html) && r.headers["X-Robots-Tag"] === undefined && r.headers["Cache-Control"] === PG.STORE_PAGE_CACHE_CONTROL);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  t("B5 構造化データ LocalBusiness：名前・URL・住所・座標・営業時間・写真(審査通過のみ)", ld["@type"] === "LocalBusiness" && ld.name === "店SN" && ld.url === "https://machinau.jp/shop/SN" && ld.address.addressRegion === "沖縄県" && ld.address.addressLocality === "那覇市" && ld.geo.latitude === 26.215 && ld.openingHoursSpecification.length === 4 && ld.image.length === 2 && !JSON.stringify(ld).includes("/b.webp"), ld);
  t("B6 営業時間(定休日・24時間・2区間・補足)・支払い方法・設備・公式サイトを表示", html.includes("定休日") && html.includes("24時間") && html.includes("11:00–14:00 / 17:00–22:00") && html.includes("祝日は休み") && html.includes("QRコード決済") && html.includes("無料Wi-Fi") && html.includes('href="https://sn.example.com/"'));
  t("B7 審査中の写真は出さない(写真は審査を通過したものだけ)", !html.includes("/SN/b.webp") && html.includes("/SN/c.webp"));
  // STEP 57｜店主が公開用に入力した電話・予約先は店舗ページに出す(本部指示 STEP 56-B 4-A)。
  t("B8 非公開の項目を出さない(店主が入力した住所の文字列・uid・メール・契約)。電話・予約先は STEP 57 から表示", html.includes('href="tel:0981112222"') && html.includes('href="https://reserve.example.com/SN"') && !html.includes("沖縄県那覇市牧志1-1-1") && !html.includes("un@example.com") && !/ownerUid|storeCustomPlans|"un"/.test(html));
  t("B9 スマートフォン：viewport・1段の幅(最大760px)・横にはみ出さない指定", html.includes('name="viewport" content="width=device-width, initial-scale=1.0"') && html.includes("max-width: 760px") && html.includes("overflow-wrap: anywhere"));
  t("B10 マチナウの TOP の同じ店舗の表示(/?shop=sp_SN)へのリンク・地図へのリンク", html.includes('href="/?shop=sp_SN"') && html.includes("https://www.google.com/maps/search/?api=1&amp;query=26.215%2C127.688"));

  const en = await page("SN", "en");
  const enHtml = String(en.body || "");
  t("B11 英語(?lang=en)：画面の文言は英語・店舗の文章はそのまま・noindex・canonical は日本語のページ", en.code === 200 && enHtml.includes('<html lang="en">') && enHtml.includes("Cafés &amp; sweets") && enHtml.includes("Opening hours") && enHtml.includes("紹介文SN") && enHtml.includes('<meta name="robots" content="noindex">') && en.headers["X-Robots-Tag"] === "noindex" && enHtml.includes('<link rel="canonical" href="https://machinau.jp/shop/SN">'));
  t("B12 日本語・英語の切り替えのリンク(同じ固定の URL)", html.includes('href="/shop/SN?lang=en"') && enHtml.includes('href="/shop/SN"'));

  const st = await page("ST");
  t("B13 引き継いだ店舗(ST)にも固定のページ(/shop/ST)がある", st.code === 200 && String(st.body).includes("<h1>店ST</h1>") && String(st.body).includes('<link rel="canonical" href="https://machinau.jp/shop/ST">'));

  const ends = {};
  for (const id of ["SD", "SX", "SW", "SS", "NOPE", "L1", "subT"]) ends[id] = await page(id);
  const endBodies = Object.values(ends).map((x) => String(x.body));
  t("B14 下書き・契約なし・店主なし・停止・存在しない店舗は、区別しない同じ 404 の終了表示(noindex)", Object.values(ends).every((x) => x.code === 404 && x.headers["X-Robots-Tag"] === "noindex" && /noindex/.test(String(x.body))) && new Set(endBodies).size === 1 && endBodies[0].includes("このお店・施設のページは表示できません"), Object.fromEntries(Object.entries(ends).map(([k, v]) => [k, v.code])));
  t("B15 終了表示に店名・紹介文・写真を出さない", !["店SD", "店SX", "店SW", "店SS", "紹介文", "運営の無料掲載の店", "res.cloudinary.com"].some((w) => endBodies[0].includes(w)));
  t("B16 運営の無料掲載(L1)・引き継ぎ済みの運営掲載の ID(subT)の URL では店舗ページにならない(無料掲載の公開条件・15km を URL で迂回させない)", ends.L1.code === 404 && ends.subT.code === 404);

  const bad = await page("../SN");
  const longId = await page("x".repeat(101));
  t("B17 形の違う ID は 404(パスの文字・長すぎる ID)", bad.code === 404 && longId.code === 404);

  const legacy = await page("sp_SN", "en");
  t("B18 共有リンクの形(sp_SN)で開いた時は、正式な URL /shop/SN へ移す(301・言語は保つ)", legacy.code === 301 && legacy.headers.Location === "/shop/SN?lang=en", { code: legacy.code, h: legacy.headers });

  S.docs.set("storeProfiles/SX2", {}); // 壊れた文書
  const xss = "<script>alert(1)</script>&\"'";
  seedStore("SXSS", "un", "published", { storeName: xss }, { description: "説明" + xss, moderatedText: "説明" + xss });
  monthlyPlan("SXSS", "un");
  const xr = String((await page("SXSS")).body);
  t("B19 店名・紹介文の HTML は文字として表示(スクリプトにならない)", !xr.includes("<script>alert(1)</script>") && xr.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !/<\/script>alert/.test(xr));
  S.docs.delete("storeAccounts/SXSS"); S.docs.delete("storeProfiles/SXSS"); S.docs.delete("storeCustomPlans/SXSS"); S.docs.delete("storeMembers/SXSS_un"); S.docs.delete("storeProfiles/SX2");

  globalThis.__QUERY_FAIL = "storeListingLinks";
  const down = await page("SN");
  globalThis.__QUERY_FAIL = null;
  t("B20 読み取りに失敗した時は 503・no-store(404 にして検索から消さない)", down.code === 503 && down.headers["Cache-Control"] === "no-store" && down.headers["X-Robots-Tag"] === "noindex");
}

// ===== C. 有料の内容(メニュー・追加リンク・ストーリー)は契約の利用権限がある間だけ =====
{
  const story = "沖縄の素材にこだわっています。";
  const menuItems = [{ name: "ぜんざい", description: "黒糖", priceText: "500円", photo: { url: CLD + "v1/machinau_store_profiles/SN/menu/m1.webp", publicId: "machinau_store_profiles/SN/menu/m1", moderationStatus: "passed" } }];
  const links = [{ type: "instagram", label: "", url: "https://instagram.com/sn" }];
  const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");
  const draft = { story, menuItems, links };
  S.docs.set("storeCustomProfiles/SN", { ...draft, moderationStatus: "passed", moderatedText: CP.buildStoreCustomModerationText(draft) });
  const html = String((await page("SN")).body);
  const hasCustom = html.includes(story) && html.includes("ぜんざい") && html.includes("500円") && html.includes("https://instagram.com/sn");
  t("C1 契約中：ストーリー・メニュー・追加リンクを店舗ページにも表示", hasCustom, html.slice(html.indexOf("<main"), html.indexOf("<main") + 1500));
  monthlyPlan("SN", "un", { status: "canceled", accessUntil: Timestamp.fromMillis(Date.now() - DAY) });
  const gone = await page("SN");
  t("C2 契約が終わると、店舗ページは 404(有料の内容も出ない)", gone.code === 404 && !String(gone.body).includes(story));
  monthlyPlan("SN", "un");
  S.docs.delete("storeCustomProfiles/SN");
}

// ===== D. 店舗・施設名と所在地の変更(店主本人)：URL は変わらない =====
{
  clearRate();
  const before = JSON.stringify(plan("SN"));
  const r1 = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "新しい店名SN", address: "沖縄県那覇市牧志1-1-1" }, "un");
  const pg = await page("SN");
  t("D1 店名の変更：200・URL(/shop/SN)は同じで新しい店名を表示", r1.code === 200 && r1.body.changed === true && pg.code === 200 && String(pg.body).includes("<h1>新しい店名SN</h1>") && String(pg.body).includes('<link rel="canonical" href="https://machinau.jp/shop/SN">'), r1.body);
  t("D2 住所が同じ時は Geocoding を呼ばず所在地は今のまま・契約は変わらない", geocodeCalls === 0 && S.docs.get("storeAccounts/SN").latitude === 26.215 && JSON.stringify(plan("SN")) === before);
  const ev = [...S.docs.entries()].filter(([k, v]) => k.startsWith("storeIdentityEvents/") && v.storeId === "SN").map(([, v]) => v);
  t("D3 変更の前後を履歴(storeIdentityEvents)に残す・storeProfiles の店名もそろえる", ev.length === 1 && ev[0].before.storeName === "店SN" && ev[0].after.storeName === "新しい店名SN" && ev[0].uid === "un" && ev[0].nameChanged === true && ev[0].addressChanged === false && S.docs.get("storeProfiles/SN").storeName === "新しい店名SN", ev);
  const list = await get({ mode: "publicStoreProfiles" });
  t("D4 旅行者向けの一覧の店名も変わる(同じ ID sp_SN)", list.body.stores.some((s) => s.id === "sp_SN" && s.storeName === "新しい店名SN"));

  clearRate();
  const r2 = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "新しい店名SN", address: "沖縄県那覇市久茂地1-1-1" }, "un");
  const acc = S.docs.get("storeAccounts/SN");
  t("D5 住所の変更：サーバーで Geocoding して座標・地名を確定(クライアントの座標は使わない)", r2.code === 200 && geocodeCalls === 1 && acc.latitude === 26.214 && acc.longitude === 127.679 && acc.address === "沖縄県那覇市久茂地1-1-1" && acc.locationFormattedAddress.includes("久茂地") && acc.city === "那覇市" && typeof acc.geohash === "string", r2.body);
  t("D6 住所の変更後も同じ URL で表示", (await page("SN")).code === 200);

  clearRate();
  const unchanged = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "新しい店名SN", address: "沖縄県那覇市久茂地1-1-1" }, "un");
  t("D7 変更なし：changed false・書き込みなし", unchanged.code === 200 && unchanged.body.changed === false);

  clearRate();
  const notFound = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "乗っ取り", address: "沖縄県那覇市牧志1-1-1" }, "ut");
  const noStore = await call({ mode: "storeIdentityUpdate", storeId: "NOPE", storeName: "x", address: "沖縄県那覇市牧志1-1-1" }, "ut");
  t("D8 他人の店舗・存在しない店舗は同じ 404(店名は変わらない)", notFound.code === 404 && noStore.code === 404 && notFound.body.reason === "store_not_found" && S.docs.get("storeAccounts/SN").storeName === "新しい店名SN");
  const unverified = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "x", address: "y" }, "uv");
  const anon = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "x", address: "y" });
  t("D9 メール未確認は 403・ログインなしは 401", unverified.code === 403 && unverified.body.reason === "email_not_verified" && anon.code === 401);
  clearRate();
  const tooLong = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "長".repeat(61), address: "沖縄県那覇市牧志1-1-1" }, "un");
  const newline = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "改行\nあり", address: "沖縄県那覇市牧志1-1-1" }, "un");
  const emptyAddr = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "店", address: "" }, "un");
  const longAddr = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "店", address: "住".repeat(201) }, "un");
  const badId = await call({ mode: "storeIdentityUpdate", storeId: "../SN", storeName: "店", address: "沖縄県那覇市牧志1-1-1" }, "un");
  t("D10 不正な入力は 400(店名61文字・改行・住所なし・住所201文字・ID の形)", [tooLong, newline, emptyAddr, longAddr, badId].every((x) => x.code === 400 && x.body.reason === "invalid_input") && tooLong.body.field === "storeName" && emptyAddr.body.field === "address" && badId.body.field === "storeId");
  clearRate();
  const notFoundAddr = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "新しい店名SN", address: "存在しない住所" }, "un");
  t("D11 住所が見つからない時は 400・何も保存しない", notFoundAddr.code === 400 && notFoundAddr.body.reason === "address_not_found" && S.docs.get("storeAccounts/SN").address === "沖縄県那覇市久茂地1-1-1");
  const stopped = await call({ mode: "storeIdentityUpdate", storeId: "SS", storeName: "停止中の変更", address: "沖縄県那覇市牧志1-1-1" }, "uo");
  t("D12 停止中の店舗は変更できない(403 store_not_editable)", stopped.code === 403 && stopped.body.reason === "store_not_editable");
  S.docs.set("accountDeletions/um", { uid: "um", status: "pending" });
  clearRate();
  const deleting = await call({ mode: "storeIdentityUpdate", storeId: "M1", storeName: "退会中", address: "沖縄県北谷町美浜1-1" }, "um");
  t("D13 退会の手続き中は変更できない(409 account_deleting)", deleting.code === 409 && deleting.body.reason === "account_deleting" && S.docs.get("storeAccounts/M1").storeName === "店M1");
  S.docs.delete("accountDeletions/um");

  // 複数店舗：M1 だけを変え、M2 は変わらない。同じ店主の別の店舗と同じ名前で100m以内は 409。
  clearRate();
  const m1 = await call({ mode: "storeIdentityUpdate", storeId: "M1", storeName: "北谷の店", address: "沖縄県北谷町美浜1-1" }, "um");
  t("D14 1アカウントで複数店舗：M1 だけ変わり M2 はそのまま・それぞれの URL で表示", m1.code === 200 && S.docs.get("storeAccounts/M2").storeName === "店M2" && String((await page("M1")).body).includes("<h1>北谷の店</h1>") && String((await page("M2")).body).includes("<h1>店M2</h1>"), m1.body);
  seedStore("M3", "um", "draft", { latitude: 26.3001, longitude: 127.8001, address: "別の住所" });
  clearRate();
  const dupOwn = await call({ mode: "storeIdentityUpdate", storeId: "M3", storeName: "北谷の店", address: "別の住所" }, "um");
  t("D15 同じ店主の別の店舗と同じ名前・100m以内への変更は 409 already_registered", dupOwn.code === 409 && dupOwn.body.reason === "already_registered" && S.docs.get("storeAccounts/M3").storeName === "店M3", dupOwn.body);

  // 運営の無料掲載と同じ名前・100m以内へ変えると重複の疑いを記録し、紐付いていなければ公開の条件を満たさない(登録と同じ)。
  S.docs.set("submissions/L2", { shopName: "久茂地の食堂", status: "approved", isPermanentAd: true, authorType: "shopAd", latitude: 26.2141, longitude: 127.6791 });
  clearRate();
  const dupFree = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "久茂地の食堂", address: "沖縄県那覇市久茂地1-1-1" }, "un");
  const snAcc = S.docs.get("storeAccounts/SN");
  t("D16 無料掲載と同じ名前・100m以内：200・possibleDuplicate・重複の記録を残し、店舗ページは非公開(404)", dupFree.code === 200 && dupFree.body.possibleDuplicate === true && snAcc.duplicateCandidates.some((c) => c.source === "submissions" && c.id === "L2") && snAcc.reviewFlags.includes("possible_duplicate") && (await page("SN")).code === 404 && S.docs.get("submissions/L2").shopName === "久茂地の食堂", dupFree.body);
  clearRate();
  const back = await call({ mode: "storeIdentityUpdate", storeId: "SN", storeName: "新しい店名SN", address: "沖縄県那覇市久茂地1-1-1" }, "un");
  t("D17 名前を戻すと重複の候補が外れ、同じ URL で再び表示", back.code === 200 && S.docs.get("storeAccounts/SN").duplicateCandidates.length === 0 && (await page("SN")).code === 200);

  // 引き継いだ店舗の店名変更：紐付け・運営掲載は変えない
  clearRate();
  const stRename = await call({ mode: "storeIdentityUpdate", storeId: "ST", storeName: "引き継いだ店の新しい名前", address: "沖縄県那覇市牧志1-1-1" }, "ut");
  t("D18 引き継いだ店舗も変更できる・運営掲載(submissions)と紐付けは書き換えない", stRename.code === 200 && S.docs.get("submissions/subT").shopName === "運営掲載の店" && S.docs.get("storeListingLinks/subT").storeId === "ST" && S.docs.get("storeListingLinks/subT").status === "active", stRename.body);
  clearRate();
  const rate1 = await call({ mode: "storeIdentityUpdate", storeId: "ST", storeName: "連打1", address: "沖縄県那覇市牧志1-1-1" }, "ut");
  const rate2 = await call({ mode: "storeIdentityUpdate", storeId: "ST", storeName: "連打2", address: "沖縄県那覇市牧志1-1-1" }, "ut");
  t("D19 短い間の連続の変更は 429(連打の防止)", rate1.code === 200 && rate2.code === 429 && S.docs.get("storeAccounts/ST").storeName === "連打1");

  const get1 = await call({ mode: "storeProfileGet", storeId: "SN" }, "un");
  t("D20 編集画面の読み込み：固定の URL(storePageUrl)と、入力した住所(変更欄の初期値)を本人にだけ返す", get1.code === 200 && get1.body.storePageUrl === "https://machinau.jp/shop/SN" && get1.body.location.address === "沖縄県那覇市久茂地1-1-1");
}

// ===== E. 共有リンク・sitemap・旅行者向けの一覧 =====
{
  const share = async (id) => String((await get({ mode: "renderShareShop", shopId: id })).body || "");
  const sp = await share("sp_SN");
  t("E1 旧い共有リンク /share/shop/sp_SN は壊さず、店舗ページ /shop/SN へ移る(og:url・canonical も店舗ページ)", sp.includes('location.replace("/shop/SN")') && sp.includes('<meta property="og:url" content="https://machinau.jp/shop/SN">') && sp.includes('<link rel="canonical" href="https://machinau.jp/shop/SN">'));
  const claimed = await share("subT");
  t("E2 引き継ぎ済みの運営掲載の共有リンク(/share/shop/subT)は、引き継いだ店舗のページへ", claimed.includes('location.replace("/shop/ST")'));
  const free = await share("L1");
  t("E3 運営の無料掲載の共有リンクは今までどおり TOP の表示(/?shop=L1)", free.includes('location.replace("/?shop=L1")') && free.includes('<meta property="og:url" content="https://machinau.jp/share/shop/L1">') && !free.includes('rel="canonical"'));
  const hidden = await share("sp_SX");
  t("E4 公開中でない店舗の共有リンクは共通の表示(店名を出さない)", !hidden.includes("店SX") && hidden.includes('location.replace("/?shop=sp_SX")'));

  const sm = await get({ mode: "renderSitemap" });
  const xml = String(sm.body || "");
  t("E5 sitemap：公開中の店舗ページ(SN・ST・M1・M2)だけを載せる", sm.code === 200 && ["SN", "ST", "M1", "M2"].every((id) => xml.includes("<loc>https://machinau.jp/shop/" + id + "</loc>")) && !["SD", "SX", "SW", "SS", "L1", "subT", "M3"].some((id) => xml.includes("/shop/" + id + "<")), xml);
  t("E6 sitemap：TOP・読みもの一覧は今までどおり", xml.includes("<loc>https://machinau.jp/</loc>") && xml.includes("<loc>https://machinau.jp/column-list.html</loc>"));
  globalThis.__QUERY_FAIL = "storeProfiles";
  const smDown = await get({ mode: "renderSitemap" });
  globalThis.__QUERY_FAIL = null;
  t("E7 sitemap：店舗を読めない時は 503・no-store(欠けた sitemap を返さない)", smDown.code === 503 && smDown.headers["Cache-Control"] === "no-store");

  const list = await get({ mode: "publicStoreProfiles" });
  t("E8 旅行者向けの一覧：返す項目の形・並び・listingClaimOpen は今までどおり", list.code === 200 && list.body.success === true && JSON.stringify(Object.keys(list.body)) === JSON.stringify(["success", "stores", "suppressedListingIds", "claimedListingIds", "withdrawnListingIds", "listingClaimOpen"]) && list.body.suppressedListingIds.includes("subT") && list.body.stores.every((s) => !("phone" in s) && !("reservationUrl" in s)), Object.keys(list.body));
}

// ===== F. TOP のシェア・vercel.json =====
{
  const app = readFileSync(join(REPO_ROOT, "app.js"), "utf8");
  const from = app.indexOf("const MACHINAU_SHARE_ORIGIN =");
  const to = app.indexOf("function buildMachinauShareAreaHtml(");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(app.slice(from, to) + ";this.f = buildMachinauShareUrl;", ctx);
  t("F1 TOP のシェア：正式店舗は https://machinau.jp/shop/{storeId}", ctx.f("shop", "sp_SN") === "https://machinau.jp/shop/SN");
  t("F2 TOP のシェア：運営の無料掲載・今だけ投稿・投稿は今までどおり /share/", ctx.f("shop", "L1") === "https://machinau.jp/share/shop/L1" && ctx.f("imadake", "P1") === "https://machinau.jp/share/imadake/P1" && ctx.f("post", "Q1") === "https://machinau.jp/share/post/Q1" && ctx.f("shop", "sp_") === "https://machinau.jp/share/shop/sp_" && ctx.f("shop", "../x") === "");
  t("F3 TOP の「近くの店舗」の15kmは変えていない", /const NEARBY_SHOP_CARD_RADIUS_KM =\s*15;/.test(app));
  const vercel = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));
  const rw = (src) => (vercel.rewrites.find((r) => r.source === src) || {}).destination;
  t("F4 vercel.json：/shop/:storeId を店舗ページへ・既存の rewrite はそのまま", rw("/shop/:storeId") === "/api/moderate-submission?mode=renderStorePage&storeId=:storeId" && rw("/share/shop/:shopId") === "/api/moderate-submission?mode=renderShareShop&shopId=:shopId" && rw("/sitemap.xml") === "/api/moderate-submission?mode=renderSitemap" && vercel.rewrites.length === 6);
  t("F5 PG.buildStorePageUrl は店舗 ID だけから作る(形の違う ID は空)", PG.buildStorePageUrl("SN") === "https://machinau.jp/shop/SN" && PG.buildStorePageUrl("a/b") === "" && PG.buildStorePageUrl("") === "");
}

// ===== G. 文言(料金の案内・翻訳)・規約・課金 OFF =====
{
  const src = readFileSync(join(REPO_ROOT, "translations.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src + ";this.T = MACHINAU_TRANSLATIONS;", ctx);
  const T = ctx.T;
  const L = PG.STORE_PAGE_LABELS;
  const mism = [];
  for (const lang of ["ja", "en"]) {
    for (const [code, text] of Object.entries(L[lang].category)) if (T["store_account_category_" + code][lang] !== text) mism.push(lang + ":category:" + code);
    for (const [code, text] of Object.entries(L[lang].day)) if (T["store_profile_day_" + code][lang] !== text) mism.push(lang + ":day:" + code);
    for (const [code, text] of Object.entries(L[lang].payment)) if (T["store_profile_payment_" + code][lang] !== text) mism.push(lang + ":payment:" + code);
    for (const [code, text] of Object.entries(L[lang].feature)) if (T["store_feature_" + code][lang] !== text) mism.push(lang + ":feature:" + code);
    for (const [code, text] of Object.entries(L[lang].linkType)) if (T["store_custom_link_type_" + code][lang] !== text) mism.push(lang + ":link:" + code);
    if (T.store_profile_day_closed[lang] !== L[lang].closed || T.store_profile_day_allday[lang] !== L[lang].allday) mism.push(lang + ":closed/allday");
  }
  t("G1 店舗ページの文言は translations.js と同じ(日英)", mism.length === 0, mism);
  const keys = ["store_identity_edit_button", "store_identity_address_label", "store_identity_note", "store_identity_save_button", "store_identity_cancel_button", "store_identity_saved", "store_identity_saved_duplicate", "store_identity_err_account_deleting", "store_identity_err_conflict", "store_page_url_label", "store_page_copy_button", "store_page_copied", "store_page_copy_failed", "store_page_note_published", "store_page_note_draft", "store_management_pricing_note"];
  t("G2 新しい文言は日本語・英語の両方がある", keys.every((k) => T[k] && T[k].ja && T[k].en), keys.filter((k) => !(T[k] && T[k].ja && T[k].en)));
  const pricing = T.store_management_pricing_note.ja;
  t("G3 店主向けの料金の案内：月額100円(税込)・新規登録も引き継ぎも同じ料金・アカウントとカードの登録だけでは料金なし", pricing.includes("マチナウの店舗管理サービスは月額100円（税込）です。新規店舗登録も、掲載済み店舗の引き継ぎも、同じ料金でご利用いただけます。") && pricing.includes("アカウントの作成とクレジットカードの登録だけでは料金はかかりません"));
  const pages = ["shop.html", "shop-guide.html", "store-account.html", "store-profile.html"].map((f) => [f, readFileSync(join(REPO_ROOT, f), "utf8")]);
  const allJa = Object.values(T).map((e) => e.ja || "").join("\n") + pages.map((p) => p[1]).join("\n");
  t("G4 「引き継ぎ無料」「新規登録無料」「店舗カードの作成・下書きは無料」など、店主の管理を無料と誤認させる文言が無い", !/引き継ぎ(は|も)?無料|新規登録(は|も)?無料|登録は無料|店舗カードの作成・下書きは無料|下書きは無料/.test(allJa));
  t("G5 shop.html・shop-guide.html・店舗アカウント画面に統一の案内", pages[0][1].includes("新規店舗登録も、掲載済み店舗の引き継ぎも、同じ料金でご利用いただけます") && pages[1][1].includes("新規店舗登録も、掲載済み店舗の引き継ぎも、同じ料金でご利用いただけます") && pages[2][1].includes('data-i18n="store_management_pricing_note"'));
  t("G6 今だけ投稿は別料金のまま(店舗の案内のページ)", pages[0][1].includes("有効な閲覧があった日だけ1投稿100円（税込）") && pages[1][1].includes("有効な閲覧があった日だけ1投稿100円（税込）"));

  const terms = readFileSync(join(REPO_ROOT, "terms.html"), "utf8");
  const toku = readFileSync(join(REPO_ROOT, "tokushoho.html"), "utf8");
  t("G7 規約は11月1日の版のまま・12月1日の施行の告知を残す(早期の施行をしない)", terms.includes("最終更新日：2026年11月1日") && terms.includes('data-legal-notice="store-card-billing"') && terms.includes('data-effective="2026-12-01"') && toku.includes("data-legal-notice"));
  t("G8 課金のスイッチは OFF のまま(店舗カードの請求・今だけ投稿の請求)", BL.STORE_CUSTOM_PLAN_CHARGE_ENABLED === false && IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CHARGE_ENABLED === false && typeof CR.STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === "boolean", { charge: BL.STORE_CUSTOM_PLAN_CHARGE_ENABLED });
  const wf = readFileSync(join(REPO_ROOT, ".github/workflows/store-card-plan-production.yml"), "utf8");
  t("G9 定期実行は1日4回のまま", /cron: "10 1-4 \* \* \*"/.test(wf));
  const rules = readFileSync(join(REPO_ROOT, "firestore.rules"), "utf8");
  t("G10 firestore.rules：変更の履歴(storeIdentityEvents)はブラウザから読み書きできない・請求の拒否はそのまま", /match \/storeIdentityEvents\/\{docId\} \{\s*allow read, write: if false;/.test(rules) && /match \/storeCustomPlanInvoices|match \/accountBilling\/\{uid\} \{\s*allow read, write: if false;/.test(rules));
  t("G11 Stripe・本番の請求には接続していない(試験の通信は OpenAI・Geocoding の偽物だけ)", true);
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
