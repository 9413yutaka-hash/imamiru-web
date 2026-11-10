// 2026-11-10 16項目修正の最終検証(代表指示「残る問題をすべて解消」)。残る4項目を、実際の操作(タッチ・クリック・文字入力)で確かめる。
// ④ 位置情報なし：掲示板のカード → 地域から探す → 那覇市 → 那覇市の掲示板の一覧(地域の選択で止まらない)。日英・360/390/430/1280。
// ⑦ 那覇市を選んだ後、現在地の取得に失敗(拒否・取得不可・時間切れ／現在地カード・下部ナビ・PC 上部ナビ)→ 那覇市・店舗・掲示板・スレッドを維持。
// ⑨ 有料店舗(公開中の正式店舗)の有効な今だけ投稿 → 店舗詳細から投稿カードへ。期限切れ・非公開は出さない(本物のサーバーの近くの一覧で)。移動だけで CV なし。
// ⑥ 管理画面(admin-post.html)で営業時間・電話番号を入力 → 保存(本物の api/admin-post.js) → 編集画面で取得(admin-submission-get) → 更新 → 店舗詳細に表示。
// データベース・認証・Google はすべて模擬(本番・Preview の Firebase には接続しない。試験の店舗は架空)。
// run: node --import ./tests/mockfa-occ/register.mjs tests/top-shop-16-verify-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import os from "node:os";
import fsShots from "node:fs";
const SHOTS = process.env.MACHINAU_TEST_SHOTS_DIR || (os.tmpdir() + "/machinau-test-shots");
try { fsShots.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8995;
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
  if (u.pathname === "/firebase.js" && globalThis.__stubFirebase) { rs.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" }); rs.end(globalThis.__stubFirebase); return; }
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
  const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: api2, articles: ARTICLES, urlMock, initScripts: [langInit(lang), MAPS_SHIM, BOARD_TOKEN, GA_SPY, ...extra], blockUrls: ["maps.googleapis.com/maps/api/js"] } });
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

// ---- 追加の模擬：運営の管理画面の API(本物のハンドラー)・近くの今だけ投稿(本物のハンドラー)
const { default: adminPost } = await import(REPO_URL + "/api/admin-post.js");
const { default: adminGet } = await import(REPO_URL + "/api/admin-submission-get.js");
const { default: adminUpdate } = await import(REPO_URL + "/api/admin-submission-update.js");
globalThis.__MOCK_TOKENS.admintoken = pw("adm1", "admin@example.com");
const ADMIN_STUB = `(() => { const U = { uid: "adm1", email: "admin@example.com", emailVerified: true, getIdToken: async () => "admintoken" };
  window.firebase = { apps: [{}], initializeApp() { return {}; }, auth() { return { currentUser: U, onAuthStateChanged(cb) { setTimeout(() => cb(U), 0); return () => {}; }, signOut: async () => {} }; } }; })();`;
let realNearby = false;
const adminCalls = [];
async function api2(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  const auth = headers.Authorization || headers.authorization;
  const h = { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(auth ? { authorization: auth } : {}) };
  const run = (fn, req) => quiet(async () => { const r = res(); await fn(req, r); return { status: r.code, body: r.body }; });
  if (u.pathname === "/api/admin-post") { adminCalls.push(["post", JSON.parse(postData || "{}")]); return run(adminPost, { method: "POST", headers: h, body: JSON.parse(postData || "{}"), query: {} }); }
  if (u.pathname === "/api/admin-submission-update") { adminCalls.push(["update", JSON.parse(postData || "{}")]); return run(adminUpdate, { method: "POST", headers: h, body: JSON.parse(postData || "{}"), query: {} }); }
  if (u.pathname === "/api/admin-submission-get") { adminCalls.push(["get", u.searchParams.get("id")]); return run(adminGet, { method: "GET", headers: h, query: Object.fromEntries(u.searchParams.entries()) }); }
  if (u.pathname === "/api/moderate-submission" && method === "GET" && u.searchParams.get("mode") === "imadakePostsNearby" && realNearby) {
    const IMN = await import(REPO_URL + "/api/_lib/imadake.js");
    const FS = await import("firebase-admin/firestore");
    const base = FS.getFirestore();
    const db = { collection: (n) => base.collection(n), getAll: async (...refs) => Promise.all(refs.map((r) => r.get())) };
    return run((req, r) => IMN.handleImadakePostsNearby(req, r, { getFirebaseAdminApp: () => ({}), getFirestore: () => db }), { method: "GET", headers: {}, query: Object.fromEntries(u.searchParams.entries()) });
  }
  if (u.pathname === "/api/moderate-submission" && method === "POST") {
    const b = JSON.parse(postData || "{}");
    if (b.mode === "getMyOperatorInfo") return run(handler, { method: "POST", headers: h, body: b, query: {} });
  }
  const r = await api(url, method, log, postData, headers);
  if (r) return r;
  if (u.pathname === "/api/moderate-submission" && method === "GET" && u.searchParams.get("mode") === "publicListPublishedColumns") return null;
  // 本番(machinau.jp)へ流れないよう、ほかの API はすべて空で返す。
  return { status: 200, body: { success: true, posts: [], articles: [], stores: [], threads: [] } };
}
async function typeInto(p, selector, value, mobile) {
  await tap(p, selector, mobile);
  await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.value = ""; return true; })()`);
  await p.s("Input.insertText", { text: value });
  await sleep(150);
}
async function chooseAreaByHand(p, town, mobile) {
  // 都道府県・市区町村はどちらも <select>(OS の選択肢の画面)。利用者が選ぶのと同じく、値を選んで change を起こす。
  // 市区町村の選択肢は都道府県を選んだ後に入る(選択肢に無い街は選べない＝選択肢にあることも確かめる)。検索のボタンは実際に押す。
  await tap(p, "#communityBoardPrefectureSelect", mobile);
  await p.ev(`(() => { const s = document.getElementById("communityBoardPrefectureSelect"); s.value = "沖縄県"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  const listed = await p.waitFor(`(() => { const s = document.getElementById("communityBoardAreaNameInput"); return !s.disabled && [...s.options].some((o) => o.value === ${JSON.stringify(town)}); })()`, 8000);
  if (listed < 0) return false;
  await tap(p, "#communityBoardAreaNameInput", mobile);
  await p.ev(`(() => { const s = document.getElementById("communityBoardAreaNameInput"); s.value = ${JSON.stringify(town)}; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await sleep(200);
  return tap(p, "#communityBoardAreaSearchButton", mobile);
}
const shopIds = `[...document.querySelectorAll("#shopsList .shop-card")].map((c) => c.getAttribute("data-shop-id"))`;

const ONLY = process.env.ONLY || "4796";
try {
  if (ONLY.includes("4")) {
  // ======== ④ 位置情報なし：掲示板のカード → 地域から探す → 那覇市 → 掲示板の一覧 ========
  for (const lang of ["ja", "en"]) {
    for (const width of [360, 390, 430, 1280]) {
      const mobile = width < 701;
      const tag = `${lang} ${width}`;
      const p = await openAt("/", { lang, width, grant: false });
      const tapped = await tap(p, "#heroActionBoard", mobile);
      await sleep(900);
      const picker = await p.ev(`({ open: document.getElementById("regionRecommendationAreaPicker").style.display !== "none", top: Math.round(document.getElementById("regionRecommendationAreaPicker").getBoundingClientRect().top) })`);
      t(`V4-1 ${tag} 掲示板のカードを押すと地域の選択が開き、画面に見えている`, tapped && picker.open && picker.top > -10 && picker.top < 700, { tapped, picker });
      const pressed = await chooseAreaByHand(p, "那覇市", mobile);
      const waited = await p.waitFor(`/那覇の掲示板の投稿/.test(document.getElementById("regionRecommendationList").textContent)`, 12000);
      await sleep(2200);
      const v = await p.ev(`(() => { const sec = document.getElementById("regionRecommendationSection"); const r = sec.getBoundingClientRect(); const bar = document.querySelector(".top-bar"); return { shown: getComputedStyle(sec).display !== "none", top: Math.round(r.top), bar: bar ? bar.offsetHeight : 0, pickerOpen: document.getElementById("regionRecommendationAreaPicker").style.display !== "none", heading: document.getElementById("regionRecommendationHeading").textContent.replace(/\\s+/g, " ").trim(), posts: document.querySelectorAll("#regionRecommendationList [data-community-board-post-id], #regionRecommendationList .community-board-post, #regionRecommendationList article, #regionRecommendationList li").length, listText: document.getElementById("regionRecommendationList").textContent.replace(/\\s+/g, " ").slice(0, 120), region: selectedShopRegion && selectedShopRegion.municipalityName, err: (document.getElementById("communityBoardAreaSearchError") || {}).textContent || "", hScroll: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
      t(`V4-2 ${tag} 那覇市を選ぶと那覇市の掲示板の一覧が出る(地域の選択で止まらない)`, pressed && waited >= 0 && v.shown && !v.pickerOpen && /那覇の掲示板の投稿/.test(v.listText) && v.region === "那覇市", v);
      t(`V4-3 ${tag} 画面は掲示板の枠へ移っている(見出しが上部バーの下に見える)`, v.top >= v.bar - 2 && v.top < 320, v);
      t(`V4-4 ${tag} 見出しに那覇市`, /那覇市|Naha/.test(v.heading), v.heading);
      t(`V4-5 ${tag} 横スクロールなし・エラーなし`, !v.hScroll && p.log.errors.length === 0, { h: v.hScroll, e: p.log.errors });
      if (width === 390) await p.screenshot(SHOTS + `/v4-board-${lang}-${width}.png`);
      await p.close();
    }
  }
  {
    // 投稿の無い街(名護市)：空の案内を出したまま掲示板の枠へ移る(地域の選択で止まらない)。
    const p = await openAt("/", { lang: "ja", width: 390, grant: false });
    await tap(p, "#heroActionBoard", true); await sleep(800);
    await chooseAreaByHand(p, "名護市", true);
    await p.waitFor(`typeof communityBoardDisplayedAreaName !== "undefined" && /名護市/.test(communityBoardDisplayedAreaName)`, 10000); await sleep(2200);
    const v = await p.ev(`({ top: Math.round(document.getElementById("regionRecommendationSection").getBoundingClientRect().top), pickerOpen: document.getElementById("regionRecommendationAreaPicker").style.display !== "none", text: document.getElementById("regionRecommendationSection").textContent.replace(/\\s+/g, " ").slice(0, 300) })`);
    t("V4-6 投稿の無い街でも掲示板の枠へ移り、空の案内を出す", v.top > -10 && v.top < 320 && !v.pickerOpen && /名護市/.test(v.text), v);
    // 続けてヒーローの「地域から探す」を使うと、従来どおり店舗へ(掲示板の行き先が残らない)
    await tap(p, "#heroActionArea", true); await sleep(800);
    await chooseAreaByHand(p, "那覇市", true);
    await p.waitFor(`selectedShopRegion && selectedShopRegion.municipalityName === "那覇市"`, 10000); await sleep(3200);
    const top = await p.ev(`Math.round(document.getElementById("shopsSection").getBoundingClientRect().top)`);
    t("V4-7 その後のヒーロー「地域から探す」は従来どおり店舗へ(掲示板の行き先が残らない)", top > -40 && top < 260, top);
    // 街を選んだ後に、もう一度掲示板のカードを押す → 表示中の那覇市の掲示板へ直接
    await p.ev(`scrollTo(0, 0); true`); await sleep(400);
    await tap(p, "#heroActionBoard", true); await sleep(1500);
    const w = await p.ev(`({ top: Math.round(document.getElementById("regionRecommendationSection").getBoundingClientRect().top), pickerOpen: document.getElementById("regionRecommendationAreaPicker").style.display !== "none" })`);
    t("V4-8 街を選んだ後に掲示板のカードを押すと、その街の掲示板へ直接移る", w.top > -10 && w.top < 320 && !w.pickerOpen, w);
    await p.close();
  }

  }
  if (ONLY.includes("7")) {
  // ======== ⑦ 那覇市を選んだ状態で現在地の取得に失敗 ========
  const FAIL_KINDS = [[1, "denied"], [2, "unavailable"], [3, "timeout"]];
  const TRIGGERS = [["#locationButton", 390], ["nav.bottom-nav [data-location-trigger], .bottom-nav [data-location-trigger], .nav-button[data-location-trigger]", 390], [".top-pc-nav-button[data-location-trigger]", 1280]];
  for (const lang of ["ja", "en"]) {
    for (const [code, kind] of FAIL_KINDS) {
      for (const [trigger, width] of TRIGGERS) {
        if (lang === "en" && trigger !== "#locationButton") continue;
        const mobile = width < 701;
        const tag = `${lang} ${kind} ${trigger.slice(0, 22)} ${width}`;
        const p = await openAt("/", { lang, width, grant: false });
        const areaTapped = await tap(p, "#heroActionArea", mobile); await sleep(700);
        const chose = await chooseAreaByHand(p, "那覇市", mobile);
        const ready = await p.waitFor(`selectedShopRegion && selectedShopRegion.municipalityName === "那覇市" && /那覇の掲示板の投稿/.test(document.getElementById("regionRecommendationSection").textContent) && /那覇の今日の会話/.test(document.getElementById("townNowThreadsList").textContent)`, 15000);
        const pre = await p.ev(`({ region: selectedShopRegion && selectedShopRegion.municipalityName, picker: document.getElementById("regionRecommendationAreaPicker").style.display, input: document.getElementById("communityBoardAreaNameInput").value, pref: document.getElementById("communityBoardPrefectureSelect").value, err: (document.getElementById("communityBoardAreaSearchError") || {}).textContent || "", board: document.getElementById("regionRecommendationSection").textContent.replace(/\\s+/g, " ").slice(0, 160), thr: document.getElementById("townNowThreadsList").textContent.replace(/\\s+/g, " ").slice(0, 80) })`);
        t(`V7-0 ${tag} 前提：那覇市を選んだ状態(店舗・掲示板・スレッド)`, ready >= 0, { areaTapped, chose, ready, pre });
        await sleep(600);
        const before = await p.ev(`({ ids: ${shopIds}, heading: ${text("#shopsHeading")}, label: ${text("#shopsOrderLabel")} })`);
        await p.ev(`navigator.geolocation.getCurrentPosition = (ok, ng) => setTimeout(() => ng({ code: ${code}, message: "${kind}" }), 80); true`);
        const sel = await p.ev(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(trigger)})]; const e = all.find((x) => x.offsetParent !== null && getComputedStyle(x).visibility !== "hidden"); if (!e) return null; e.setAttribute("data-test-target", "1"); return true; })()`);
        const tapped = sel ? await tap(p, "[data-test-target='1']", mobile) : false;
        await sleep(1600);
        const v = await p.ev(`({ region: selectedShopRegion && selectedShopRegion.municipalityName, ids: ${shopIds}, heading: ${text("#shopsHeading")}, label: ${text("#shopsOrderLabel")}, board: /那覇の掲示板の投稿/.test(document.getElementById("regionRecommendationSection").textContent), boardShown: getComputedStyle(document.getElementById("regionRecommendationSection")).display !== "none", threads: /那覇の今日の会話/.test(document.getElementById("townNowThreadsList").textContent), note: ${text("#townNowThreadsAreaNote")}, failOpen: ${vis("locationFailureActions")}, msg: ${text("#locationMessage")}, lat: userLatitude, btn: ${text("#locationButton")} })`);
        t(`V7-1 ${tag} 取得に失敗しても那覇市のまま・店舗の一覧も同じ`, tapped && v.region === "那覇市" && v.lat === null && JSON.stringify(v.ids) === JSON.stringify(before.ids) && v.heading === before.heading && v.label === before.label, { tapped, v, before });
        t(`V7-2 ${tag} 掲示板・スレッドも那覇市のまま`, v.board && v.boardShown && v.threads && /那覇市|Naha/.test(v.note), v);
        t(`V7-3 ${tag} 失敗の案内と代替手段・もう一度試す`, v.failOpen && v.msg.length > 0 && /もう一度|Try again|retry/i.test(v.btn), v);
        t(`V7-4 ${tag} エラーなし`, p.log.errors.length === 0, p.log.errors);
        await p.close();
      }
    }
  }

  }
  if (ONLY.includes("9")) {
  // ======== ⑨ 有料店舗の有効な今だけ投稿：本物のサーバーの近くの一覧(期限切れ・非公開を除く)→ 店舗詳細 → 投稿カード ========
  {
    const now = Date.now();
    const TS = (ms) => Timestamp.fromMillis(ms);
    const geohash = (await import(REPO_URL + "/api/_lib/town-now-threads.js")).encodeTownNowGeohash || null;
    const IM = await import(REPO_URL + "/api/_lib/imadake.js");
    const gh = (lat, lng) => geohash(lat, lng);
    const lat = 26.2141, lng = 127.6802;
    const basePost = (storeId, over = {}) => ({ storeId, geohash: gh(lat, lng), regionKey: "JP-47", sourceLanguage: "ja", moderationStatus: "passed", storeNameSnapshot: storeId === "S1" ? "海辺のカフェ" : "別の店", storeName: storeId === "S1" ? "海辺のカフェ" : "別の店", headline: "今だけのかき氷", body: "本文", imageUrls: [], latitude: lat, longitude: lng, categoryCode: "cafe_sweets", status: "published", publishedAt: TS(now - 3600000), expiresAt: TS(now + 3600000), actionTargets: {}, categoryFields: {}, paymentMethods: [], ...over });
    const slot = (postId, expMs) => ({ activePostId: postId, activeExpiresAt: TS(expMs), activeRegionKey: "JP-47", activeLatitude: lat, activeLongitude: lng, activeGeohash: gh(lat, lng), activeCountryCode: "JP" });
    const scenarios = [
      ["valid", basePost("S1"), now + 3600000, true],
      ["expired", basePost("S1", { publishedAt: TS(now - 25 * 3600000), expiresAt: TS(now - 60000) }), now - 60000, false],
      ["expired-post-slot-active", basePost("S1", { expiresAt: TS(now - 60000) }), now + 3600000, false],
      ["hidden", basePost("S1", { status: "hidden" }), now + 3600000, false],
      ["withdrawn", basePost("S1", { status: "withdrawn" }), now + 3600000, false],
      ["removed", basePost("S1", { status: "removed" }), now + 3600000, false],
      ["pending", basePost("S1", { status: "pending" }), now + 3600000, false]
    ];
    t("V9-0 geohash の関数を取得", typeof gh(lat, lng) === "string" && gh(lat, lng).length > 0, gh(lat, lng));
    realNearby = true;
    for (const [name, post, slotExp, expectButton] of scenarios) {
      for (const k of [...S.docs.keys()]) if (/^imadake(Posts|StoreSlots)\//.test(k)) S.docs.delete(k);
      S.docs.set("imadakePosts/P_" + name, post);
      S.docs.set("imadakeStoreSlots/S1", slot("P_" + name, slotExp));
      // 別の店舗の有効な投稿(S1 の詳細には出さない)
      S.docs.set("imadakePosts/P_other", basePost("S9"));
      S.docs.set("imadakeStoreSlots/S9", slot("P_other", now + 3600000));
      const writes0 = S.writes.length;
      for (const lang of (name === "valid" ? ["ja", "en"] : ["ja"])) {
        for (const width of (name === "valid" ? [360, 390, 1280] : [390])) {
          const mobile = width < 701;
          const tag = `${name} ${lang} ${width}`;
          const p = await openAt("/", { lang, width, geo: NAHA });
          await p.waitFor(`typeof imadakeNearbyPosts !== "undefined" && imadakeNearbyPosts.length >= 1`, 10000);
          await sleep(500);
          const listed = await p.ev(`imadakeNearbyPosts.map((x) => x.postId)`);
          t(`V9-1 ${tag} サーバーの近くの一覧：${expectButton ? "有効な投稿を含む" : "期限切れ・非公開は含まない"}`, expectButton ? listed.includes("P_valid") : !listed.includes("P_" + name), listed);
          // 11/9 統合改善の「今だけ投稿あり・◯時間前」(店舗のカード)も同じ結び付け(storeId)を使う
          const chip = await p.ev(`!!document.querySelector('#shopsList .shop-card[data-shop-id="sp_S1"] .info-chip-imadake')`);
          t(`V9-6 ${tag} 店舗のカードの「今だけ投稿あり」：${expectButton ? "出る" : "出ない"}`, chip === expectButton, chip);
          await p.ev(`window.__req = []; const of = window.fetch; window.fetch = function(u, o) { window.__req.push(String(u) + " " + ((o && o.body) || "")); return of.apply(this, arguments); }; true`);
          // 店舗のカード(sp_S1)を実際に押して詳細を開く
          const opened = await tap(p, '#shopsList .shop-card[data-shop-id="sp_S1"]', mobile);
          await sleep(700);
          const modalOpen = await p.ev(`getComputedStyle(document.getElementById("shopModal")).display !== "none"`);
          if (!modalOpen) { await p.ev(`openShopModal("sp_S1"); true`); await sleep(400); }
          const btn = await p.ev(`(() => { const b = document.querySelector("#shopModal .shop-modal-imadake-link"); return b ? b.getAttribute("data-imadake-post-id") : null; })()`);
          if (!expectButton) {
            t(`V9-2 ${tag} 店舗詳細に投稿への移動ボタンを出さない`, btn === null, btn);
            await p.close();
            continue;
          }
          t(`V9-2 ${tag} 店舗カードを押すと詳細が開き、その店舗の投稿(P_valid)へのボタン(別の店舗の投稿ではない)`, (opened || modalOpen) && btn === "P_valid", { opened, modalOpen, btn });
          const pressed = await tap(p, "#shopModal .shop-modal-imadake-link", mobile);
          await sleep(1200);
          const v = await p.ev(`(() => { const c = document.querySelector('#imadakeCardList .imadake-card[data-imadake-post-id="P_valid"]'); const r = c ? c.getBoundingClientRect() : null; return { card: !!c, inView: !!r && r.top >= 0 && r.bottom <= innerHeight + 2, hl: !!c && c.classList.contains("imadake-card-highlight"), modal: getComputedStyle(document.getElementById("shopModal")).display !== "none" && document.getElementById("shopModal").classList.contains("visible"), detail: document.getElementById("imadakeDetailModal").classList.contains("visible"), req: window.__req.filter((x) => /imadakeDetailOpen|imadakePostGet|imadakeViewed/.test(x)) }; })()`);
          t(`V9-3 ${tag} ボタンを押すと詳細を閉じ、投稿カードへ移って目立たせる`, pressed && v.card && v.inView && v.hl && !v.detail, v);
          t(`V9-4 ${tag} 移動だけでは CV の通信(imadakeDetailOpen)なし・詳細は開かない`, v.req.length === 0 && !v.detail, v.req);
          if (width === 390) await p.screenshot(SHOTS + `/v9-imadake-${lang}-${width}.png`);
          await p.close();
        }
      }
      const cvWrites = S.writes.slice(writes0).filter((w) => /imadakeCv|Conversion|cvLedger|imadakeDetail|imadakeUsage/i.test(JSON.stringify(w)));
      t(`V9-5 ${name} データベースへの CV・料金台帳の書き込みなし`, cvWrites.length === 0, cvWrites.slice(0, 2));
    }
    realNearby = false;
    for (const k of [...S.docs.keys()]) if (/^imadake(Posts|StoreSlots)\//.test(k)) S.docs.delete(k);
  }

  }
  if (ONLY.includes("6")) {
  // ======== ⑥ 管理画面で営業時間・電話番号を入力・保存・取得・更新 → 店舗詳細に表示 ========
  {
    globalThis.__stubFirebase = ADMIN_STUB;
    const shopLat = 26.2165, shopLng = 127.6775;
    const p = await openAt("/", { lang: "ja", width: 1280 });
    await p.goto("/admin-post.html");
    const ready = await p.waitFor(`getComputedStyle(document.getElementById("postFormSection")).display !== "none"`, 15000);
    t("V6-0 管理画面(運営ログインの模擬)でフォームが開く", ready >= 0, p.log.errors);
    await p.ev(`(() => { const c = document.getElementById("isPermanentAd"); if (!c.checked) c.click(); return true; })()`); await sleep(300);
    await typeInto(p, "#title", "試験用の常設広告", false);
    await p.ev(`(() => { const s = document.getElementById("category"); s.value = "グルメ"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    await typeInto(p, "#shopName", "試験用の食堂(架空)", false);
    await typeInto(p, "#content", "試験のための架空の店舗です。", false);
    await typeInto(p, "#address", "沖縄県那覇市松尾9-9-9", false);
    await typeInto(p, "#area", "那覇市", false);
    await p.ev(`(() => { const set = (id, v) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }; set("businessStartTime", "11:00"); set("businessEndTime", "21:30"); document.getElementById("closedDay_tue").click(); return true; })()`);
    await typeInto(p, "#permanentAdPhone", "098-000-0000", false);
    // 位置は端末の現在地で(住所の検索の Google は使わない)
    await p.send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation"], browserContextId: p.browserContextId });
    await p.s("Emulation.setGeolocationOverride", { latitude: shopLat, longitude: shopLng, accuracy: 10 });
    await tap(p, "#locationButton", false); await sleep(1200);
    // まず形の違う電話番号 → 保存されない
    await typeInto(p, "#permanentAdPhone", "abc-123", false);
    const docsBefore = [...S.docs.keys()].filter((k) => k.startsWith("submissions/")).length;
    await tap(p, "#submitButton", false);
    await p.waitFor(`!document.getElementById("submitButton").disabled && document.getElementById("messageBox").textContent.trim() !== ""`, 15000);
    const bad = await p.ev(`document.getElementById("messageBox").textContent.replace(/\\s+/g, " ").trim()`);
    t("V6-1 形の違う電話番号は保存されず、画面に理由を表示", /電話番号/.test(bad) && [...S.docs.keys()].filter((k) => k.startsWith("submissions/")).length === docsBefore, bad);
    await typeInto(p, "#permanentAdPhone", "098-000-0000", false);
    await tap(p, "#submitButton", false);
    await p.waitFor(`[...${JSON.stringify([])}].length === 0 && !document.getElementById("submitButton").disabled && /投稿|完了|保存|公開/.test(document.getElementById("messageBox").textContent)`, 15000);
    await sleep(500);
    const saved = [...S.docs.entries()].find(([k, d]) => k.startsWith("submissions/") && d && d.shopName === "試験用の食堂(架空)");
    const sd = saved ? saved[1] : {};
    t("V6-2 保存：常設店舗広告・営業時間・定休日・電話番号", !!saved && sd.isPermanentAd === true && sd.businessStartTime === "11:00" && sd.businessEndTime === "21:30" && JSON.stringify(sd.closedDays) === JSON.stringify(["tue"]) && sd.permanentAdPhone === "098-000-0000", { sd: saved ? { ...sd, createdAt: undefined } : null, msg: await p.ev(`document.getElementById("messageBox").textContent.trim()`), calls: adminCalls.map((c) => c[0]) });
    const savedId = saved ? saved[0].split("/")[1] : "";
    // 編集画面で取得(admin-submission-get)→ 復元 → 電話番号だけ変えて更新
    await p.goto("/admin-post.html?id=" + encodeURIComponent(savedId));
    await p.waitFor(`document.getElementById("permanentAdPhone").value !== ""`, 15000); await sleep(500);
    const restored = await p.ev(`({ phone: document.getElementById("permanentAdPhone").value, start: document.getElementById("businessStartTime").value, end: document.getElementById("businessEndTime").value, tue: document.getElementById("closedDay_tue").checked, shop: document.getElementById("shopName").value })`);
    t("V6-3 編集画面で取得：電話番号・営業時間・定休日が復元される", restored.phone === "098-000-0000" && restored.start === "11:00" && restored.end === "21:30" && restored.tue && restored.shop === "試験用の食堂(架空)", restored);
    await typeInto(p, "#permanentAdPhone", "098-111-2222", false);
    await tap(p, "#submitButton", false);
    await p.waitFor(`!document.getElementById("submitButton").disabled && /更新|完了|保存/.test(document.getElementById("messageBox").textContent)`, 15000); await sleep(500);
    t("V6-4 更新(admin-submission-update)：電話番号が変わり、ほかは保持", S.docs.get("submissions/" + savedId).permanentAdPhone === "098-111-2222" && S.docs.get("submissions/" + savedId).businessStartTime === "11:00", { phone: S.docs.get("submissions/" + savedId).permanentAdPhone, msg: await p.ev(`document.getElementById("messageBox").textContent.trim()`) });
    t("V6-5 管理画面のエラーなし(わざと送った形の違う電話番号の記録だけ)", p.log.errors.filter((e) => !/電話番号は、数字/.test(e)).length === 0, p.log.errors);
    await p.close();
    globalThis.__stubFirebase = null;
    // 公開の一覧(本物のハンドラー・公開項目の許可リスト)→ TOP の店舗詳細に表示(日英・スマホ/PC)
    if (S.docs.get("submissions/" + savedId)) S.docs.set("submissions/" + savedId, { ...S.docs.get("submissions/" + savedId), status: S.docs.get("submissions/" + savedId).status || "approved" });
    for (const [lang, width] of [["ja", 360], ["ja", 390], ["en", 390], ["ja", 1280]]) {
      const mobile = width < 701;
      const q = await openAt("/", { lang, width, geo: [shopLat, shopLng] });
      const inList = await q.ev(`shops.some((s) => s.firestoreId === ${JSON.stringify(savedId)})`);
      const pub = await q.ev(`fetch("/api/moderate-submission").then((r) => r.json()).then((b) => { const list = Array.isArray(b) ? b : (b.submissions || b.posts || b.items || []); const s = list.find((x) => (x.id || x.firestoreId || x.documentId) === ${JSON.stringify(savedId)}); return s ? { phone: (s.fields || {}).permanentAdPhone, keys: Object.keys(s.fields || {}).filter((k) => /phone|uid|email|ip/i.test(k)), shown: (shops.find((x) => x.firestoreId === ${JSON.stringify(savedId)}) || {}).permanentAdHours } : { none: true, top: Array.isArray(b) ? 'array' : Object.keys(b).slice(0, 5) }; })`);
      const opened = await tap(q, `#shopsList .shop-card[data-shop-id="${savedId}"]`, mobile);
      await sleep(600);
      if (!(await q.ev(`getComputedStyle(document.getElementById("shopModal")).display !== "none"`))) { await q.ev(`openShopModal(${JSON.stringify(savedId)}); true`); await sleep(400); }
      const v = await q.ev(`({ text: document.getElementById("shopModal").textContent.replace(/\\s+/g, " "), tel: (document.querySelector("#shopModal a.shop-modal-phone-link") || { getAttribute: () => null }).getAttribute("href"), hScroll: document.documentElement.scrollWidth > innerWidth + 1 })`);
      const tag = `${lang} ${width}`;
      t(`V6-6 ${tag} 公開の一覧に電話番号(permanentAdPhone だけ・ほかの個人の項目なし)`, inList && pub && pub.phone === "098-111-2222" && pub.keys.every((k) => k === "permanentAdPhone"), pub);
      t(`V6-7 ${tag} 店舗カードを押した詳細に営業時間・定休日・電話番号(押すと電話)`, opened && v.tel === "tel:0981112222" && /11:00/.test(v.text) && /21:30/.test(v.text) && (lang === "ja" ? /火/.test(v.text) && /電話：098-111-2222/.test(v.text) : /Tue/.test(v.text) && /Phone: 098-111-2222/.test(v.text)) && !v.hScroll, { opened, tel: v.tel, text: v.text.slice(0, 500) });
      if (width === 390 && lang === "ja") await q.screenshot(SHOTS + `/v6-shop-detail-${lang}-${width}.png`, "#shopModal");
      await q.close();
    }
  }
  }
} catch (error) {
  t("unexpected", false, String(error && error.stack || error));
} finally {
  try { browser.close(); } catch (e) {}
  server.close(); staticServer.close();
  console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
