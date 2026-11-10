// 2026-11-10 TOP・店舗・街ページ 16項目修正(代表の点検結果と修正指示)。
// ①キャッチコピー(フッター含む画面の文字) ②利用統計の注記(確定文言) ③スポット欄のサブコピー ④掲示板のカード(現在地なし)→選んだ街の掲示板・ガイドの注記
// ⑤並び順とラベル ⑥無料掲載の詳細の営業時間・電話番号 ⑦現在地の取得の失敗で選んだ街を残す ⑧shop.html の申込みの案内(規約17条9項)
// ⑨正式店舗の詳細→その店舗の今だけ投稿のカード(CV なし) ⑩マチナウをシェアの重複 ⑭shop.html のヘッダー ⑮広告の募集の1枠 ⑯今だけ投稿0件の表示。
// 画面の試験の土台は site-improvement-6-test.mjs と同じ(模擬の API・Geocoder・掲示板のトークン)。
// run: node --import ./tests/mockfa-occ/register.mjs tests/top-shop-16-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8991;
const ORIGIN = "http://127.0.0.1:" + PORT;
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
process.env.OPENAI_API_KEY = "sk-" + "fake-openai-for-tests";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const realFetch = globalThis.fetch;
const calls = { moderation: 0, translation: 0, other: 0 };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname === "api.openai.com" && u.pathname === "/v1/chat/completions") { calls.translation++; throw new Error("translation must not be called"); }
  if (u.hostname === "api.openai.com") {
    calls.moderation++;
    const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  calls.other++; throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const { computeStoreProfileDescriptionHash } = await import(REPO_URL + "/api/_lib/store-profile-translation.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const page = (storeId, lang) => quiet(async () => { const r = res(); await handler({ method: "GET", headers: {}, query: { mode: "renderStorePage", storeId, ...(lang ? { lang } : {}) } }, r); return { code: r.code, html: String(r.body || "") }; });

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const DESC = "海の見えるカフェです。朝8時から営業しています。";
const DESC_EN = "A cafe with a sea view. Open from 8 a.m.";
const photo = (n) => ({ url: CLD + "v1/machinau_store_profiles/S1/" + n + ".webp", publicId: "machinau_store_profiles/S1/" + n, moderationStatus: "passed" });
const ago = (d) => { const ms = Date.now() - d * 86400000; return { toDate: () => new Date(ms), toMillis: () => ms, seconds: Math.floor(ms / 1000) }; };
S.docs.set("storeAccounts/S1", { storeName: "海辺のカフェ", registrationStatus: "active", enabled: true, createdByType: "storeUser", createdByUid: "u1", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", address: "沖縄県那覇市牧志1-1-1", locationFormattedAddress: "日本、〒900-0013 沖縄県那覇市牧志１丁目１−１", latitude: 26.2141, longitude: 127.6802, duplicateCandidates: [], reviewFlags: [] });
S.docs.set("storeMembers/S1_u1", { uid: "u1", storeId: "S1", role: "owner", status: "active" });
S.docs.set("storeProfiles/S1", { storeId: "S1", status: "published", storeName: "海辺のカフェ", revision: 3, categoryCode: "cafe_sweets", description: DESC, moderationStatus: "passed", moderatedText: DESC + "\n月曜は早じまい", businessHours: { weekly: { mon: [{ open: "09:00", close: "15:00" }], tue: [{ open: "09:00", close: "18:00" }], wed: [], thu: [{ open: "09:00", close: "18:00" }], fri: [{ open: "09:00", close: "18:00" }], sat: [{ open: "00:00", close: "24:00" }], sun: [{ open: "10:00", close: "18:00" }] }, note: "月曜は早じまい" }, websiteUrl: "https://example.com/cafe", paymentMethodCodes: ["cash", "card"], featureCodes: ["free_wifi", "takeout"], phone: "098-123-4567", reservationUrl: "https://reserve.example.com/umibe", socialLinks: [{ type: "instagram", url: "https://www.instagram.com/umibe_cafe/" }], supportedLanguageCodes: ["ja", "en"], photos: ["p1", "p2", "p3"].map(photo), sourceLanguage: "ja",
  translations: { en: { description: { status: "ready", sourceHash: computeStoreProfileDescriptionHash(DESC), description: DESC_EN, model: "test" } } } });
S.docs.set("storeCustomPlans/S1", { storeId: "S1", status: "active", ownerUid: "u1", periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(Date.now() - 40 * 86400000), accessUntil: null, paymentStatus: "current" });
const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");
const custom = { story: "祖母が始めた店です。", menuItems: [{ name: "<b>ぜんざい</b>", description: "黒糖", priceText: "¥500", photo: { url: CLD + "v1/machinau_store_profiles/S1/menu/m1.webp", publicId: "machinau_store_profiles/S1/menu/m1", moderationStatus: "passed" } }], links: [{ type: "instagram", label: "インスタ<script>", url: "https://www.instagram.com/umibe_cafe/" }] };
S.docs.set("storeCustomProfiles/S1", { storeId: "S1", revision: 1, ...custom, moderationStatus: "passed", moderatedText: CP.buildStoreCustomModerationText(custom) });
// 運営の無料掲載：L1 は S1 に引き継がれた掲載(TOP では S1 のカードに置き換わる)、L2 は近く、L3 は遠い(15km の外)、OPS は運営のお知らせ。
const LISTING = { title: "本日のおすすめ", shopName: "運営掲載の食堂", category: "グルメ", content: "定食の店です。", address: "沖縄県那覇市久茂地1-1-1", latitude: 26.2141, longitude: 127.6802, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], takeout: false, imageUrls: [], createdAt: ago(20) };
S.docs.set("submissions/L1", LISTING);
S.docs.set("submissions/L2", { ...LISTING, title: "ぜんざいとコーヒー", shopName: "見本カフェ", category: "カフェ・スイーツ", latitude: 26.2160, longitude: 127.6770 });
S.docs.set("submissions/L3", { ...LISTING, title: "遠くの店", shopName: "名護の店", latitude: 26.5915, longitude: 127.9773 });
const inHours = (h) => { const ms = Date.now() + h * 3600000; return { toDate: () => new Date(ms), toMillis: () => ms, seconds: Math.floor(ms / 1000) }; };
S.docs.set("submissions/T1", { title: "本日限定のかき氷", shopName: "期限つきの店", category: "カフェ・スイーツ", content: "夏だけのかき氷です。", address: "沖縄県那覇市久茂地2-2-2", latitude: 26.2130, longitude: 127.6790, status: "approved", isPermanentAd: false, authorType: "shop", publisherType: "verified_shop", businessStartTime: "10:00", businessEndTime: "20:00", isOpen24Hours: false, imageUrls: [], createdAt: ago(0), expiresAt: inHours(2.5) });
S.docs.set("storeListingLinks/L1", { status: "active", storeId: "S1", claimId: "c1" });


// ===== Chrome =====
const staticServer = await serve(REPO_ROOT + "", PORT + 1);
const server = http.createServer(async (req, rs) => {
  const u = new URL(req.url, "http://x");
  const m = u.pathname.match(/^\/shop\/([^/]+)$/);
  if (m) {
    const r = await page(decodeURIComponent(m[1]), u.searchParams.get("lang") || undefined);
    rs.writeHead(r.code, { "Content-Type": "text/html; charset=utf-8" }); rs.end(r.html); return;
  }
  const up = await realFetch("http://127.0.0.1:" + (PORT + 1) + req.url);
  rs.writeHead(up.status, { "Content-Type": up.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" });
  rs.end(Buffer.from(await up.arrayBuffer()));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const clearRate = () => { for (const k of [...S.docs.keys()]) if (/RateLimits\//.test(k) || k.startsWith("storeRateLimits/")) S.docs.delete(k); };
// ---- 街ページの試験用の応答(スレッド・掲示板・今だけ投稿・読み物) ----
const PLACES = {
  "那覇市": { placeId: "ChIJnaha", delay: 30 },
  "宜野湾市": { placeId: "ChIJginowan", delay: 30 },
  "名護市": { placeId: "ChIJnago", delay: 30 },
  "うるま市": { placeId: "ChIJuruma", delay: 30 }
};
const THREADS = {
  ChIJnaha: [{ threadId: "tn1", text: "那覇の今日の会話です", placeType: "municipality", placeLabel: "那覇市", regionName: "那覇市", createdAt: new Date(Date.now() - 600000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }],
  ChIJginowan: [{ threadId: "tg1", text: "宜野湾の今日の会話です", placeType: "municipality", placeLabel: "宜野湾市", regionName: "宜野湾市", createdAt: new Date(Date.now() - 600000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }],
  ChIJnago: []
};
const BOARD = {
  ChIJnaha: { delay: 1500, posts: [{ postId: "bn1", text: "那覇の掲示板の投稿です", operatorLinksEnabled: false, authorType: "", imageUrls: [], createdAtMillis: Date.UTC(2026, 9, 7, 3, 0, 0) }] },
  ChIJginowan: { delay: 50, posts: [
    { postId: "bg1", text: "宜野湾の運営のお知らせ。詳しくは https://www.example.com/ginowan/very/long/path?x=1 をご覧ください。", operatorLinksEnabled: true, authorType: "operator", imageUrls: [], createdAtMillis: Date.UTC(2026, 10, 1, 3, 0, 0) },
    { postId: "bg2", text: "宜野湾の一般の投稿です", operatorLinksEnabled: false, authorType: "", imageUrls: [], createdAtMillis: Date.UTC(2026, 10, 2, 3, 0, 0) }
  ] },
  ChIJnago: { delay: 30, posts: [] }
};
let threadsListFail = false;
const nearbyThreads = [{ threadId: "near1", text: "近くの会話です", placeType: "current_location", placeLabel: "那覇市", regionName: "那覇市", createdAt: new Date(Date.now() - 300000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }];
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return null;
  const q = Object.fromEntries(u.searchParams.entries());
  if (method === "GET" && q.mode === "townNowThreadsList") {
    await sleep(40);
    if (threadsListFail) return { status: 500, body: { success: false } };
    return { status: 200, body: { success: true, threads: THREADS[q.googlePlaceId] || [] } };
  }
  if (method === "GET" && q.mode === "publicListPublishedColumns") return null;
  if (method === "GET" && q.mode === "townNowThreadsNearby") return { status: 200, body: { success: true, threads: nearbyThreads } };
  if (method === "POST") {
    const body = JSON.parse(postData || "{}");
    if (body.mode === "communityBoardPostsList") {
      const b = BOARD[body.googlePlaceId] || { delay: 30, posts: [] };
      await sleep(b.delay);
      return { status: 200, body: { success: true, posts: b.posts } };
    }
  }
  return quiet(async () => {
    const r = res();
    if (method === "GET") {
      if (q.mode === "imadakePostsNearby" && imadakeReply) return imadakeReply;
      if (q.mode && q.mode !== "publicStoreProfiles") return { status: 200, body: { success: true, posts: [], articles: [], stores: [], threads: [] } };
      await handler({ method: "GET", headers: {}, query: q }, r);
      return { status: r.code, body: r.body };
    }
    const body = JSON.parse(postData || "{}");
    if (body.mode === "shopTranslationGet" || body.mode === "storeProfileTranslationGet") return { status: 200, body: { success: false } };
    clearRate();
    const auth = headers.Authorization || headers.authorization;
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r);
    return { status: r.code, body: r.body };
  });
}
let imadakeReply = null;
const IMG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
const urlMock = async (url) => (/res\.cloudinary\.com/.test(url) ? { raw: IMG, contentType: "image/jpeg" } : null);
// 地図の代わり：Geocoder は街の名前ごとに place_id を返す(遅れも街ごと)。地図(google.maps.Map)を作った回数を数える。
const MAPS_SHIM = `(() => {
  window.__mapsCreated = 0;
  const PLACES = ${JSON.stringify(PLACES)};
  const deep = () => new Proxy(function(){}, { get: (t, k) => k === "then" ? undefined : (k === Symbol.toPrimitive ? () => "" : deep()), apply: () => deep(), construct: () => deep() });
  const here = [{ formatted_address: "日本、沖縄県那覇市久茂地", address_components: [
    { long_name: "那覇市", short_name: "那覇市", types: ["locality", "political"] },
    { long_name: "沖縄県", short_name: "沖縄県", types: ["administrative_area_level_1", "political"] },
    { long_name: "日本", short_name: "JP", types: ["country", "political"] }], types: ["street_address"] }];
  const town = (name) => [{ place_id: PLACES[name].placeId, formatted_address: "日本、沖縄県" + name, types: ["locality", "political"], address_components: [
    { long_name: name, short_name: name, types: ["locality", "political"] },
    { long_name: "沖縄県", short_name: "沖縄県", types: ["administrative_area_level_1", "political"] },
    { long_name: "日本", short_name: "JP", types: ["country", "political"] }] }];
  window.google = { maps: new Proxy({}, { get: (t, k) => {
    if (k === "Geocoder") return function() { this.geocode = (req, cb) => {
      const name = req && typeof req.address === "string" ? Object.keys(PLACES).find((n) => req.address.includes(n)) : null;
      const result = name ? town(name) : here;
      const delay = name ? PLACES[name].delay : 30;
      if (cb) setTimeout(() => cb(result, "OK"), delay);
      return Promise.resolve({ results: result });
    }; };
    if (k === "GeocoderStatus") return { OK: "OK" };
    if (k === "Map") return function() { window.__mapsCreated++; return deep(); };
    return deep();
  } }) };
})();`;
// 掲示板の一覧は匿名認証の ID トークンが要るため、試験ではトークンの取得だけ差し替える(サーバーの判定は別の試験)。
const BOARD_TOKEN = `document.addEventListener("DOMContentLoaded", () => { window.getAnonymousIdTokenForLocationCollection = async () => "anon"; if (!window.firebase) { window.firebase = { auth() { return { currentUser: null, onAuthStateChanged() { return () => {}; } }; } }; } });`;
const GA_SPY = `(() => { window.__ga = []; document.addEventListener("DOMContentLoaded", () => { window.sendMachinauAnalyticsEvent = function(name, params) { window.__ga.push([name, params || {}]); }; }); })();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
const ARTICLES = [
  { slug: "a1", title: "旅の記事1", description: "説明1", category: "", imageUrl: "", publishedDate: "2026年10月7日", publishedMonth: "2026-10" },
  { slug: "a2", title: "旅の記事2", description: "説明2", category: "", imageUrl: "" }
];
const browser = await launchChrome();
async function openAt(path, { lang = "ja", width = 390, geo = null, grant = true, extra = [] } = {}) {
  const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: api, articles: ARTICLES, urlMock, initScripts: [langInit(lang), MAPS_SHIM, BOARD_TOKEN, GA_SPY, ...extra], blockUrls: ["maps.googleapis.com/maps/api/js"] } });
  if (grant) await p.send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation"], browserContextId: p.browserContextId });
  await p.goto(path);
  await p.waitFor("document.readyState === 'complete' && typeof shops !== 'undefined' && shops.length > 0 && typeof storeProfileListFetchSettled !== 'undefined' && storeProfileListFetchSettled", 30000);
  await sleep(800);
  if (geo) {
    await p.s("Emulation.setGeolocationOverride", { latitude: geo[0], longitude: geo[1], accuracy: 20 });
    await p.ev("getLocation(); true");
    await p.waitFor("userLatitude !== null", 15000);
    await sleep(1500);
  }
  return p;
}
async function tap(p, selector, mobile) {
  await sleep(900);
  const box = await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; document.documentElement.style.scrollBehavior = "auto"; e.scrollIntoView({ block: "center", behavior: "instant" }); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, ok: !!hit && !!hit.closest(${JSON.stringify(selector)}) }; })()`);
  if (!box || !box.ok) return false;
  await sleep(200);
  if (mobile) { await p.s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] }); await p.s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
  else { await p.s("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 }); await p.s("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }); }
  await sleep(400);
  return true;
}
const NAHA = [26.2124, 127.6792];
const vis = (id) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!e && !e.hidden && getComputedStyle(e).display !== "none"; })()`;
const text = (sel) => `(document.querySelector(${JSON.stringify(sel)}) || {}).textContent?.replace(/\\s+/g, " ").trim() || ""`;
async function chooseArea(p, town) {
  await p.ev(`(() => { const s = document.getElementById("communityBoardPrefectureSelect"); s.value = "沖縄県"; s.dispatchEvent(new Event("change")); const a = document.getElementById("communityBoardAreaNameInput"); a.value = ${JSON.stringify(town)}; document.getElementById("communityBoardAreaSearchButton").disabled = false; document.getElementById("communityBoardAreaSearchButton").click(); return true; })()`);
}

// ---- 16項目の追加の試験データ：L2 に電話番号・営業時間、L4 は形の違う電話番号(表示しない)。
S.docs.set("submissions/L2", { ...S.docs.get("submissions/L2"), businessStartTime: "10:00", businessEndTime: "18:00", closedDays: ["wed"], permanentAdPhone: "098-123-4567" });
S.docs.set("submissions/L4", { ...LISTING, title: "電話の形が違う店", shopName: "形違いの店", latitude: 26.2150, longitude: 127.6800, permanentAdPhone: "abc<script>" });

try {
  const fsx = await import("node:fs");
  const read = (f) => fsx.readFileSync(REPO_ROOT + "/" + f, "utf8");
  const html = read("index.html");

  // ---- ①②③⑭ 文言(実際に画面に出る文字、日英・4幅)
  for (const lang of ["ja", "en"]) {
    for (const width of [360, 390, 430, 1280]) {
      const p = await openAt("/", { lang, width });
      await p.ev(`(() => { const n = document.getElementById("areaUsageLocationNote"); if (n) n.hidden = false; return true; })()`);
      const v = await p.ev(`({ h1: document.querySelector(".hero-main-copy").innerText.replace(/\\s+/g, ""), h1Lines: Math.round(document.querySelector(".hero-main-copy").getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector(".hero-main-copy")).lineHeight)), footer: ${text("footer [data-i18n=footer_tagline]")}, note: ${text("#areaUsageLocationNote")}, caption: ${text(".brand-caption")}, sub: ${text("#shopsSection [data-i18n=shops_description]")}, hScroll: document.documentElement.scrollWidth > innerWidth + 1 })`);
      const tag = `${lang} ${width}`;
      if (lang === "ja") {
        t(`A1 ${tag} キャッチコピー(画面の文字)`, v.h1 === "街の今を知れば、もっと、いい旅になる。", v.h1);
        t(`A2 ${tag} キャッチコピーは2行まで(「いい旅」が途中で割れない)`, v.h1Lines <= 2, v.h1Lines);
        t(`A3 ${tag} フッターも同じキャッチコピー`, v.footer === "街の今を知れば、もっと、いい旅になる。", v.footer);
        t(`A4 ${tag} 利用統計の注記(確定文言)`, v.note === "現在地から分かった市区町村名（座標は残しません）は、地域ごとの利用統計にも使います。 詳しく見る／利用を停止する", v.note);
        t(`A5 ${tag} スポット欄のサブコピー`, v.sub === "お店・観光・体験", v.sub);
        t(`A6 ${tag} ヘッダーの肩書き`, v.caption === "街の「今」がわかる旅の案内所", v.caption);
      } else {
        t(`A1 ${tag} catch copy`, v.h1 === "Knowwhat'shappeningintownnow,andmakeyourtripevenbetter.", v.h1);
        t(`A3 ${tag} footer uses the same copy`, v.footer === "Know what's happening in town now, and make your trip even better.", v.footer);
        t(`A4 ${tag} privacy note`, v.note === "The municipality name found from your location (your coordinates are not kept) is also used for area usage statistics. Details / turn off", v.note);
        t(`A5 ${tag} spot sub copy`, v.sub === "Shops, sightseeing & experiences", v.sub);
      }
      t(`A7 ${tag} 横スクロールなし・エラーなし`, !v.hScroll && p.log.errors.length === 0, { h: v.hScroll, e: p.log.errors });
      await p.close();
    }
  }
  t("A8 注記のリンクは停止のボタン(privacy.html#area-usage)へ", /<a href="privacy\.html#area-usage" data-i18n="location_area_usage_note_link">詳しく見る／利用を停止する<\/a>/.test(html) && /id="areaUsageOptOutButton"/.test(read("privacy.html")), "");

  // ---- ⑭ shop.html のヘッダー
  {
    const p = await openAt("/", { lang: "ja", width: 390 });
    await p.goto("/shop.html"); await sleep(1500);
    const v = await p.ev(`({ caption: ${text(".brand-caption")}, plan100: ${text(".plan-open")}, soon: [...document.querySelectorAll(".plan-soon")].map((e) => e.textContent.replace(/\\s+/g, " ").trim()), hScroll: document.documentElement.scrollWidth > innerWidth + 1 })`);
    t("B1 shop.html ヘッダー「街の「今」がわかる旅の案内所」", v.caption === "街の「今」がわかる旅の案内所", v.caption);
    // ---- ⑧ 申込みの案内(規約17条9項)
    t("B2 100円：申込み受付中・初回請求 2026年12月2日予定・請求は未開始", /お申し込み受付中/.test(v.plan100) && /月額100円/.test(v.plan100) && /月額料金の実際の請求は、現在はまだ開始していません。最初の請求は、2026年12月2日に行う予定です。/.test(v.plan100), v.plan100);
    t("B3 500円：準備中(申込み不可)", v.soon.some((s) => /準備中/.test(s) && /月額500円/.test(s)), v.soon);
    t("B4 横スクロールなし", !v.hScroll, "");
    await p.close();
    const terms = read("terms.html");
    t("B5 規約17条9項と同じ文言(最初の請求は、2026年12月2日に行う予定)", /最初の請求は、2026年12月2日に行う予定です。/.test(terms), "");
  }

  // ---- ④ 位置情報なし：掲示板のカード → 地域から探す → 選んだ街の掲示板へ。ガイドの注記。
  for (const lang of ["ja", "en"]) {
    const p = await openAt("/", { lang, width: 390 });
    await p.ev(`document.getElementById("heroActionBoard").click(); true`); await sleep(900);
    t(`C1 ${lang} 掲示板のカード(現在地なし)→ 地域の選択が開く`, await p.ev(`document.getElementById("regionRecommendationAreaPicker").style.display !== "none"`), "");
    await chooseArea(p, "宜野湾市");
    await p.waitFor(`/宜野湾の一般の投稿/.test(document.getElementById("regionRecommendationSection").textContent)`, 10000);
    await sleep(2500);
    const v = await p.ev(`({ boardTop: Math.round(document.getElementById("regionRecommendationSection").getBoundingClientRect().top), shopsTop: Math.round(document.getElementById("shopsSection").getBoundingClientRect().top), shown: ${vis("regionRecommendationSection")} })`);
    t(`C2 ${lang} 街を選んだ後は掲示板(専用の一覧)へ移る(店舗の一覧ではない)`, v.shown && v.boardTop > -40 && v.boardTop < 260, v);
    await p.ev(`openHowToModal(); true`); await sleep(200);
    const note = await p.ev(text("#howToModal [data-i18n=how_to_threads_board_note]"));
    t(`C3 ${lang} ガイドの注記`, note === (lang === "ja" ? "※スレッドと掲示板は、現在地を取得するか、「地域から探す」で街を選ぶと表示されます。" : "* Threads and the board appear once you get your location or pick a town in “Explore by Area.”"), note);
    await p.close();
  }
  {
    // 楽しみ方④(スレッド)は従来どおりスレッドへ、「地域から探す」(ヒーロー)は従来どおり店舗へ
    const p = await openAt("/", { lang: "ja", width: 390 });
    await p.ev(`document.getElementById("heroActionArea").click(); true`); await sleep(600);
    await chooseArea(p, "那覇市");
    await p.waitFor(`typeof selectedShopRegion !== "undefined" && selectedShopRegion && selectedShopRegion.municipalityName === "那覇市"`, 10000);
    await sleep(3500);
    const top = await p.ev(`Math.round(document.getElementById("shopsSection").getBoundingClientRect().top)`);
    t("C4 地域から探す(ヒーロー)は従来どおり店舗へ", top > -40 && top < 260, top);
    await p.close();
  }

  // ---- ⑤ 並び順とラベル
  {
    const p = await openAt("/", { lang: "ja", width: 390 });
    const v = await p.ev(`({ label: ${text("#shopsOrderLabel")}, dates: [...document.querySelectorAll("#shopsList .shop-card")].map((c) => c.getAttribute("data-shop-id")).map((id) => { const s = shops.find((x) => x.firestoreId === id); return s ? getDateValue(s.createdAt) : null; }).filter((x) => x !== null) })`);
    t("D1 現在地なし：ラベル「新しい順」・実際も新しい順", v.label === "新しい順" && v.dates.every((x, i) => i === 0 || x <= v.dates[i - 1]), v);
    await p.close();
    const q = await openAt("/", { lang: "ja", width: 390, geo: NAHA });
    const w = await q.ev(`({ label: ${text("#shopsOrderLabel")}, d: [...document.querySelectorAll("#shopsList .shop-card")].map((c) => { const id = c.getAttribute("data-shop-id"); const s = getVisibleShops().find((x) => x.firestoreId === id); return s && typeof s.distanceKm === "number" ? s.distanceKm : null; }).filter((x) => x !== null) })`);
    t("D2 現在地あり：ラベル「現在地から近い順」・実際も近い順", w.label === "現在地から近い順" && w.d.length > 0 && w.d.every((x, i) => i === 0 || x >= w.d[i - 1]), w);
    await q.ev(`switchMachinauLanguage("en"); true`); await sleep(300);
    t("D3 en label Nearest First", (await q.ev(text("#shopsOrderLabel"))) === "Nearest First", "");
    t("D4 15km の判定は不変(名護の店は出ない)", !(await q.ev(`[...document.querySelectorAll("#shopsList .shop-card")].map((c) => c.getAttribute("data-shop-id"))`)).includes("L3"), "");
    await q.close();
  }

  // ---- ⑦ 現在地の取得に失敗しても、選んでいた街(店舗・スレッド・掲示板)を残す。成功した時だけ現在地側へ。
  {
    const p = await openAt("/", { lang: "ja", width: 390, grant: false });
    await p.ev(`document.getElementById("heroActionArea").click(); true`); await sleep(600);
    await chooseArea(p, "那覇市");
    await p.waitFor(`typeof selectedShopRegion !== "undefined" && selectedShopRegion && selectedShopRegion.municipalityName === "那覇市" && /那覇の掲示板の投稿/.test(document.getElementById("regionRecommendationSection").textContent) && /那覇の今日の会話/.test(document.getElementById("townNowThreadsList").textContent)`, 15000);
    await sleep(500);
    // 位置情報を拒否 → 取得に失敗
    await p.send("Browser.resetPermissions", { browserContextId: p.browserContextId });
    await p.ev(`navigator.geolocation.getCurrentPosition = (ok, ng) => setTimeout(() => ng({ code: 1, message: "denied" }), 50); true`);
    await p.ev(`document.getElementById("locationButton").click(); true`);
    await sleep(1500);
    const v = await p.ev(`({ region: selectedShopRegion && selectedShopRegion.municipalityName, heading: ${text("#shopsHeading")}, board: /那覇の掲示板の投稿/.test(document.getElementById("regionRecommendationSection").textContent), threads: /那覇の今日の会話/.test(document.getElementById("townNowThreadsList").textContent), note: ${text("#townNowThreadsAreaNote")}, failOpen: ${vis("locationFailureActions")}, lat: userLatitude })`);
    t("E1 取得に失敗：選んでいた那覇市のまま(沖縄県全体に戻らない)", v.region === "那覇市" && v.heading === "那覇市で楽しめる場所" && v.lat === null, v);
    t("E2 取得に失敗：掲示板・スレッドの表示も那覇市のまま", v.board && v.threads && v.note === "選んだ街「那覇市」の今日のスレッドです。", v);
    t("E3 取得に失敗：代替手段は開く", v.failOpen, v);
    // 成功した時だけ現在地側へ戻る(従来どおり)
    await p.ev(`navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords: { latitude: ${NAHA[0]}, longitude: ${NAHA[1]}, accuracy: 20 } }), 50); true`);
    await p.ev(`document.getElementById("locationButton").click(); true`);
    await p.waitFor(`userLatitude !== null`, 10000); await sleep(1500);
    const w = await p.ev(`({ region: selectedShopRegion, label: ${text("#shopsOrderLabel")}, threads: /近くの会話/.test(document.getElementById("townNowThreadsList").textContent) })`);
    t("E4 取得に成功：現在地側(15km・近い順・近くのスレッド)へ戻る", w.region === null && w.label === "現在地から近い順" && w.threads, w);
    await p.close();
  }

  // ---- ⑯ 今だけ投稿が0件の時
  for (const lang of ["ja", "en"]) {
    imadakeReply = { status: 200, body: { success: true, posts: [] } };
    const p = await openAt("/", { lang, width: 390, geo: NAHA });
    await sleep(800);
    await p.ev(`document.getElementById("columnEntryCardList").insertAdjacentHTML("beforeend", "<article>記事</article>"); true`); await sleep(300);
    const v = await p.ev(`(() => { const s = document.getElementById("todayNowEmptySection"); return { shown: !s.hidden, h: s.querySelector("h2").textContent.trim(), lead: s.querySelector(".imadake-lead").textContent.trim(), targets: [...s.querySelectorAll("[data-today-now-target]")].map((b) => b.getAttribute("data-today-now-target")), readsLine: /マチナウ読み物|Machinau Reads/.test(s.textContent) }; })()`);
    t(`F1 ${lang} 見出し・本文`, v.shown && v.h === (lang === "ja" ? "今日の今だけ投稿" : "Today's limited-time posts") && v.lead === (lang === "ja" ? "近くでは、まだ掲載中の「今だけ投稿」がありません。" : "There are no limited-time posts nearby yet."), v);
    t(`F2 ${lang} 読み物の行は削除・地域の今日と近くのお店の導線は残す`, !v.readsLine && !v.targets.includes("columnEntrySection") && v.targets.includes("regionTodayInfoSection") && v.targets.includes("shopsSection"), v);
    await p.close();
    imadakeReply = null;
  }

  // ---- ⑩ マチナウをシェアは1つ(フッター)
  {
    const p = await openAt("/", { lang: "ja", width: 390 });
    await p.ev(`showMyPage(); true`); await sleep(300);
    const v = await p.ev(`({ inMyPage: document.querySelectorAll("#myPageSection .machinau-site-share").length, all: document.querySelectorAll(".machinau-site-share").length, trip: !!document.querySelector("#myPageSection .travel-box-trip-share .machinau-share-button") })`);
    t("G1 旅の保存箱の中に「マチナウをシェア」は無い・ページ全体で1つ・同行者への共有ボタンは残る", v.inMyPage === 0 && v.all === 1 && v.trip, v);
    await p.close();
  }

  // ---- ⑮ 広告の募集の1枠(横幅いっぱい・確定文言・料金なし)
  for (const [lang, width] of [["ja", 360], ["ja", 390], ["ja", 1280], ["en", 390]]) {
    const p = await openAt("/", { lang, width });
    const v = await p.ev(`(() => { const a = document.getElementById("adSlotSection"); const ref = document.getElementById("columnEntrySection"); return { label: ${text(".ad-slot-label")}, tag: ${text(".ad-slot-tag")}, h: ${text("#adSlotHeading")}, texts: [...a.querySelectorAll(".ad-slot-house-text")].map((e) => e.textContent.trim()), btn: ${text(".ad-slot-button")}, href: a.querySelector(".ad-slot-button").getAttribute("href"), slots: document.querySelectorAll(".ad-slot").length, links: a.querySelectorAll("a, button").length, w: Math.round(a.getBoundingClientRect().width), refW: Math.round(ref.getBoundingClientRect().width), price: /円|¥|料金|\\$|price/i.test(a.textContent), hScroll: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
    const tag = `${lang} ${width}`;
    if (lang === "ja") {
      t(`H1 ${tag} 確定文言`, v.label === "広告" && v.tag === "広告主募集中" && v.h === "この街のお店を、募集中。" && JSON.stringify(v.texts) === JSON.stringify(["このページは、旅行者も、この街に住む人も見ています。", "現在地から近い順の表示で、あなたのお店も届きます。"]) && v.btn === "お店・施設の方へ →", v);
    } else {
      t(`H1 ${tag} English texts`, v.label === "Ad" && v.tag === "Advertisers wanted" && v.h === "We're looking for shops in this town." && v.btn === "For shops & venues →" && v.texts.length === 2, v);
    }
    t(`H2 ${tag} 1枠だけ・ボタン1つ(店舗向け案内)・料金なし`, v.slots === 1 && v.links === 1 && v.href === "shop.html" && !v.price, v);
    t(`H3 ${tag} 横幅いっぱい(読み物の枠と同じ幅)・横スクロールなし`, Math.abs(v.w - v.refW) <= 2 && !v.hScroll, v);
    await p.close();
  }
  t("H4 入れ替えの処理は無い", !/AD_SLOT_HOUSE_NOTICES|renderAdSlotHouseNotice/.test(read("app.js")), "");

  // ---- ⑥ 無料掲載の詳細：営業時間・定休日・電話番号(押すと電話)。形の違う電話番号は出さない。
  for (const lang of ["ja", "en"]) {
    const p = await openAt("/", { lang, width: 390, geo: NAHA });
    await p.ev(`openShopModal("L2"); true`); await sleep(500);
    const v = await p.ev(`({ text: document.getElementById("shopModal") ? document.getElementById("shopModal").textContent.replace(/\\s+/g, " ") : "", tel: (document.querySelector("#shopModal a.shop-modal-phone-link") || {}).getAttribute ? document.querySelector("#shopModal a.shop-modal-phone-link").getAttribute("href") : null })`);
    t(`I1 ${lang} 営業時間・定休日を表示`, lang === "ja" ? /10:00/.test(v.text) && /18:00/.test(v.text) && /水/.test(v.text) : /10:00/.test(v.text) && /Wed/.test(v.text), v.text.slice(0, 400));
    t(`I2 ${lang} 電話番号を表示(押すと電話)`, v.tel === "tel:0981234567" && (lang === "ja" ? /電話：098-123-4567/.test(v.text) : /Phone: 098-123-4567/.test(v.text)), v);
    await p.ev(`closeShopModal(); openShopModal("L4"); true`); await sleep(400);
    const w = await p.ev(`({ tel: !!document.querySelector("#shopModal a.shop-modal-phone-link"), script: /abc<script>/.test(document.getElementById("shopModal").innerHTML) })`);
    t(`I3 ${lang} 形の違う電話番号は出さない`, !w.tel && !w.script, w);
    await p.ev(`closeShopModal(); openShopModal("T1"); true`); await sleep(400);
    t(`I4 ${lang} 常設店舗広告でない投稿には電話の欄なし`, !(await p.ev(`!!document.querySelector("#shopModal a.shop-modal-phone-link")`)), "");
    await p.close();
  }
  {
    const lib = await import(REPO_URL + "/api/_lib/permanent-ad-hours.js?v=" + Date.now());
    const ok = (v) => { try { return lib.readPermanentAdPhone(v); } catch (e) { return "ERR"; } };
    t("I5 電話番号の検証(空は未設定・数字と+-()で9〜15桁・20文字まで)", ok("") === "" && ok(" 098-123-4567 ") === "098-123-4567" && ok("+81 98 123 4567") === "+81 98 123 4567" && ok("12345") === "ERR" && ok("abc") === "ERR" && ok("098-123-4567-890123") === "ERR" && ok(123) === "", "");
    const hours = lib.readPermanentAdHours({ businessStartTime: "10:00", businessEndTime: "18:00", permanentAdPhone: "098-123-4567" });
    t("I6 営業時間と一緒に解析(新規・編集で共通)", hours.permanentAdPhone === "098-123-4567" && hours.businessStartTime === "10:00", hours);
    let threw = false; try { lib.readPermanentAdHours({ permanentAdPhone: "x" }); } catch (e) { threw = /電話番号/.test(e.message); }
    t("I7 形の違う電話番号は保存しない(画面にメッセージ)", threw, "");
    const post = read("api/admin-post.js"), upd = read("api/admin-submission-update.js"), get = read("api/admin-submission-get.js"), ap = read("admin-post.html"), ms = read("api/moderate-submission.js");
    t("I8 常設店舗広告の新規・編集だけで保存・編集画面に復元", /submissionData\.permanentAdPhone =\s*postFields\.permanentAdHours\.permanentAdPhone/.test(post) && /updateData\.permanentAdPhone =\s*postFields\.permanentAdHours\.permanentAdPhone/.test(upd) && /data\.isPermanentAd === true && typeof data\.permanentAdPhone === "string"/.test(get) && /id="permanentAdPhone"/.test(ap) && /payload\.permanentAdPhone = permanentAdPhoneInput\.value\.trim\(\)/.test(ap), "");
    t("I9 公開の項目に追加したのは permanentAdPhone だけ(phone という汎用の名前は公開しない)", /"permanentAdPhone",/.test(ms) && !/\n\s*"phone",/.test(ms.slice(ms.indexOf("PUBLIC_SUBMISSION_FIELD_ALLOWLIST"), ms.indexOf("PUBLIC_SUBMISSION_FIELD_ALLOWLIST") + 3000)), "");
  }

  // ---- ⑨ 正式店舗の詳細から、その店舗の期限内の今だけ投稿(TOP の枠のカード)へ。詳細(全文)は開かない＝CV なし。
  {
    const now = Date.now();
    imadakeReply = { status: 200, body: { success: true, posts: [
      { postId: "P1", storeId: "S1", storeName: "海辺のカフェ", headline: "今だけのかき氷", body: "x", imageUrls: [], latitude: 26.2141, longitude: 127.6802, publishedAt: new Date(now - 3600000).toISOString(), expiresAt: new Date(now + 3600000).toISOString(), categoryCode: "cafe_sweets", actionTargets: {}, categoryFields: {}, paymentMethods: [] },
      { postId: "P9", storeId: "S9", storeName: "別の店", headline: "別の店の投稿", body: "x", imageUrls: [], latitude: 26.2141, longitude: 127.6802, publishedAt: new Date(now - 3600000).toISOString(), expiresAt: new Date(now + 3600000).toISOString(), categoryCode: "cafe_sweets", actionTargets: {}, categoryFields: {}, paymentMethods: [] }
    ] } };
    for (const lang of ["ja", "en"]) {
      const p = await openAt("/", { lang, width: 390, geo: NAHA });
      await p.waitFor(`document.querySelectorAll("#imadakeCardList .imadake-card").length >= 2`, 10000);
      await p.ev(`window.__req = []; const of = window.fetch; window.fetch = function(u, o) { window.__req.push(String(u) + " " + ((o && o.body) || "")); return of.apply(this, arguments); }; true`);
      await p.ev(`openShopModal("sp_S1"); true`); await sleep(400);
      const btn = await p.ev(`(() => { const b = document.querySelector("#shopModal .shop-modal-imadake-link"); return b ? { id: b.getAttribute("data-imadake-post-id"), t: b.textContent.trim() } : null; })()`);
      t(`J1 ${lang} 正式店舗の詳細に「この店舗の今だけ投稿を見る」(同じ店舗の投稿だけ)`, btn && btn.id === "P1" && btn.t === (lang === "ja" ? "この店舗の今だけ投稿を見る →" : "See this shop's limited-time post →"), btn);
      await p.ev(`document.documentElement.style.scrollBehavior = "auto"; document.querySelector("#shopModal .shop-modal-imadake-link").click(); true`); await sleep(900);
      const v = await p.ev(`(() => { const c = document.querySelector('#imadakeCardList .imadake-card[data-imadake-post-id="P1"]'); const r = c.getBoundingClientRect(); return { modalOpen: document.getElementById("shopModal").classList.contains("visible") || getComputedStyle(document.getElementById("shopModal")).display !== "none" && document.getElementById("shopModal").style.display === "flex", inView: r.top >= 0 && r.bottom <= innerHeight + 2, hl: c.classList.contains("imadake-card-highlight"), detail: document.getElementById("imadakeDetailModal").classList.contains("visible"), req: window.__req.filter((x) => /imadake/i.test(x)) }; })()`);
      t(`J2 ${lang} 押すと詳細を閉じ、TOP の枠のその投稿のカードへ移る`, v.inView && v.hl && !v.detail, v);
      t(`J3 ${lang} 全文(詳細)は開かない・CV の通信なし`, v.req.length === 0 && !v.detail, v.req);
      // 無料掲載の詳細には出さない(無料と有料の権利を混同しない)
      await p.ev(`openShopModal("L2"); true`); await sleep(300);
      t(`J4 ${lang} 無料掲載の詳細にはボタンなし`, !(await p.ev(`!!document.querySelector("#shopModal .shop-modal-imadake-link")`)), "");
      await p.close();
    }
    imadakeReply = { status: 200, body: { success: true, posts: [{ postId: "P2", storeId: "S1", headline: "x", body: "x", imageUrls: [], latitude: 26.2141, longitude: 127.6802, publishedAt: new Date(now - 30 * 3600000).toISOString(), expiresAt: new Date(now - 60000).toISOString(), categoryCode: "cafe_sweets", actionTargets: {}, categoryFields: {}, paymentMethods: [] }] } };
    const q = await openAt("/", { lang: "ja", width: 390, geo: NAHA });
    await q.ev(`openShopModal("sp_S1"); true`); await sleep(300);
    t("J5 期限切れの投稿しか無い時はボタンなし(24時間の期限・公開の条件はそのまま)", !(await q.ev(`!!document.querySelector("#shopModal .shop-modal-imadake-link")`)), "");
    await q.close();
    imadakeReply = null;
  }

  // ---- 翻訳の辞書(新しい固定の文言に日英)
  {
    const src = read("translations.js");
    const keys = ["footer_tagline", "location_area_usage_note", "shops_description", "shops_current_location_order", "today_now_empty_heading", "today_now_empty_text", "how_to_threads_board_note", "ad_slot_recruit_tag", "ad_slot_recruit_title", "ad_slot_recruit_text_audience", "ad_slot_recruit_text_order", "ad_slot_recruit_button", "shop_phone_label", "shop_modal_imadake_link"];
    const missing = keys.filter((k) => !new RegExp("\\n  " + k + ": \\{\\r?\\n    ja: \"[^\"]+\",\\r?\\n    en: \"[^\"]+\"").test(src));
    t("K1 新しい文言に日英", missing.length === 0, missing);
    t("K2 いいい旅なし", !/いいい旅/.test(src + html), "");
  }
} catch (error) {
  t("unexpected", false, String(error && error.stack || error));
} finally {
  try { browser.close(); } catch (e) {}
  server.close(); staticServer.close();
  console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
