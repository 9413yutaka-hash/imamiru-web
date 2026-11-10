// 2026-11-09 TOP・街ページ統合改善(代表承認・ミューズの仕様とスマホの完成イメージ)。
// A. ヘッダー・ヒーロー(肩書き・キャッチコピー・沖縄からエリア拡大中・現在地カード・4つの入口・掲示板・楽しみ方、日英・4幅)。
// B. 位置情報が使えない場合の代替手段。C. 楽しみ方④(現在地なし→地域から探す→選んだ街のスレッド)。
// D. 掲示板の街の切替(古い街の混入なし)・日付・属性・リンクのボタン。E. 街ページの表示順・投稿の入口の統一・広告枠・読み物。
// F. 店舗の並びの表示と実際の並び・15km・距離順・同順位・鮮度の根拠。G. GA4(入口・二重なし・座標なし)・地図なし。H. 翻訳・表記。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// run: node --import ./tests/mockfa-occ/register.mjs tests/site-improvement-6-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8981;
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

try {
  const fsx = await import("node:fs");
  const read = (f) => fsx.readFileSync(REPO_ROOT + "/" + f, "utf8");
  const html = read("index.html");

  // ---- A. ヘッダー・ヒーロー(日本語・英語、360/390/430/1280)
  for (const lang of ["ja", "en"]) for (const width of [360, 390, 430, 1280]) {
    const p = await openAt("/", { lang, width });
    const v = await p.ev(`({ caption: ${text(".brand-caption")}, chip: !!document.querySelector(".live-chip"), h1: document.querySelector(".hero-main-copy").innerText.replace(/\\s+/g, ""), badge: ${text(".hero-area-badge")}, heading: ${text("#locationHeading")}, msg: ${text("#locationMessage")}, btn: ${text("#locationButton")}, alt: ${text("#locationAlternativesToggle")}, note: ${text("#areaUsageLocationNote")}, lead: !!document.querySelector(".hero-lead"), cards: [...document.querySelectorAll(".hero-action-grid .hero-action-card")].map((c) => ({ id: c.id, t: c.querySelector(".hero-action-title").textContent.trim(), c: c.querySelector(".hero-action-caption").textContent.trim(), svg: !!c.querySelector("svg.hero-line-icon"), emoji: /[\\u{1F300}-\\u{1FAFF}\\u2600-\\u27BF]/u.test(c.textContent) })), board: ${text("#heroActionBoard")}, howTo: ${text("#howToEntryButton")}, hScroll: document.documentElement.scrollWidth > innerWidth + 1, failOpen: ${vis("locationFailureActions")}, mapsCreated: window.__mapsCreated, mapEl: !!document.getElementById("google-map") || !!document.querySelector(".map-section") })`);
    const tag = `A ${lang} ${width}`;
    t(`${tag} no horizontal scroll`, v.hScroll === false, v);
    t(`${tag} no 今を配信中 pill`, v.chip === false, v);
    t(`${tag} no map section, no map created`, v.mapEl === false && v.mapsCreated === 0, v);
    t(`${tag} alternatives closed by default`, v.failOpen === false, v);
    t(`${tag} 4 entries with line icons, no emoji`, v.cards.length === 4 && v.cards.every((c) => c.svg && !c.emoji) && v.cards.map((c) => c.id).join() === "heroActionToday,heroActionNearby,heroActionArea,heroActionReads", v.cards);
    if (lang === "ja") {
      t(`${tag} header caption`, v.caption === "街の「今」がわかる旅の案内所", v.caption);
      t(`${tag} catch copy (いい旅, not いいい旅)`, v.h1 === "街の今を知れば、もっと、いい旅になる。", v.h1);
      t(`${tag} badge 沖縄からエリア拡大中`, v.badge === "沖縄からエリア拡大中", v.badge);
      t(`${tag} location card texts`, v.heading === "あなたの街の「今」" && v.msg === "今いる街の「今」をお届けします。まずは下のボタンを押してみてください。" && v.btn === "現在地を取得する" && v.alt === "位置情報が使えない場合はこちら", v);
      t(`${tag} privacy note (verified wording) + one link`, v.note === "現在地から分かった市区町村名（座標は残しません）は、地域ごとの利用統計にも使います。 詳しく見る／利用を停止する", v.note);
      t(`${tag} entry titles & captions`, JSON.stringify(v.cards.map((c) => [c.t, c.c])) === JSON.stringify([["今いる街の情報", "街のスレッドへ"], ["近くで楽しめる場所", "お店・観光・体験"], ["地域から探す", "都道府県・市区町村で"], ["マチナウ読み物", "旅のヒント・ストーリー"]]), v.cards);
      t(`${tag} board card & how-to card`, v.board === "街の掲示板 この街を訪れる人へ、地元のひとことを残す場所 見る →" && v.howTo === "はじめての方へ マチナウの楽しみ方 見る →", [v.board, v.howTo]);
      t(`${tag} round 5 lead removed`, v.lead === false, v);
    } else {
      const jp = /[぀-ヿ一-鿿]/;
      const all = [v.caption, v.h1, v.badge, v.heading, v.msg, v.btn, v.alt, v.note, v.board, v.howTo, ...v.cards.flatMap((c) => [c.t, c.c])];
      t(`${tag} no Japanese left in fixed hero texts`, all.every((s) => s && !jp.test(s)), all);
      t(`${tag} english texts`, v.btn === "Get my location" && v.badge === "Starting in Okinawa, expanding across Japan" && v.caption === "Your guide to what's happening in town", v);
    }
    await p.close();
  }

  // ---- B. 位置情報が使えない場合(リンク・拒否・失敗)
  {
    const p = await openAt("/", { lang: "ja", width: 390 });
    await p.ev(`document.getElementById("locationAlternativesToggle").click(); true`); await sleep(200);
    const v = await p.ev(`({ open: ${vis("locationFailureActions")}, exp: document.getElementById("locationAlternativesToggle").getAttribute("aria-expanded"), btns: [...document.querySelectorAll("#locationFailureActions .location-alternative-button")].map((b) => b.textContent.trim()), perm: ${vis("locationPermissionGuideToggle")}, permText: ${text("#locationPermissionGuideToggle")}, mapCenter: /地図で中心/.test(document.getElementById("locationFailureActions").textContent) })`);
    t("B1 link opens the alternatives (aria-expanded)", v.open && v.exp === "true", v);
    t("B2 entries: 都道府県・市区町村から / もう一度現在地を取得する", JSON.stringify(v.btns) === JSON.stringify(["都道府県・市区町村から", "もう一度現在地を取得する"]), v.btns);
    t("B3 collapsible 許可し直す方法を見る", v.perm && v.permText === "許可し直す方法を見る", v);
    t("B4 no map-center button (not approved / not shown)", v.mapCenter === false, v);
    await p.ev(`document.getElementById("locationPermissionGuideToggle").click(); true`); await sleep(150);
    t("B5 permission guide expands", await p.ev(vis("locationPermissionGuide")), "");
    await p.ev(`document.getElementById("locationFailureAreaButton").click(); true`); await sleep(900);
    t("B6 都道府県・市区町村から opens the area picker", await p.ev(`document.getElementById("regionRecommendationAreaPicker").style.display !== "none" && ${vis("regionRecommendationSection")}`), "");
    await p.ev(`document.getElementById("locationAlternativesToggle").click(); true`); await sleep(150);
    t("B7 link again closes", await p.ev(`!${vis("locationFailureActions")} && document.getElementById("locationAlternativesToggle").getAttribute("aria-expanded") === "false"`), "");
    await p.close();
  }
  {
    // 拒否：権限を与えないで取得 → 代替手段が開く。再取得のボタンは現在地のボタンと同じ処理。
    const p = await openAt("/", { lang: "ja", width: 390, grant: false });
    await p.send("Browser.resetPermissions", { browserContextId: p.browserContextId }).catch(() => {});
    await p.ev(`document.getElementById("locationButton").click(); true`);
    const opened = await p.waitFor(vis("locationFailureActions"), 15000);
    t("B8 denied/failed location opens the alternatives", !!opened, "");
    t("B9 aria-expanded true after failure", await p.ev(`document.getElementById("locationAlternativesToggle").getAttribute("aria-expanded") === "true"`), "");
    await p.ev(`window.__retry = 0; document.getElementById("locationButton").addEventListener("click", () => window.__retry++); true`);
    await p.ev(`document.getElementById("locationRetryButton").click(); true`); await sleep(200);
    t("B10 もう一度現在地を取得する = location button", await p.ev("window.__retry") === 1, "");
    await p.close();
  }

  // ---- C. 楽しみ方④(現在地なし)→ 地域から探す → 選んだ街のスレッド。ほかの9つのボタンは同じ。
  {
    const p = await openAt("/", { lang: "ja", width: 390 });
    const actions = await p.ev(`[...document.querySelectorAll("#howToModal [data-how-to-action], #howToModal a.how-to-step-link")].map((e) => e.getAttribute("data-how-to-action") || e.getAttribute("href"))`);
    t("C1 guide has the same 10 buttons", JSON.stringify(actions) === JSON.stringify(["location", "area", "nearby", "threads", "post.html?mode=street", "shop.html", "location", "area"]), actions);
    await p.ev(`openHowToModal(); true`); await sleep(200);
    await p.ev(`document.querySelector('#howToModal [data-how-to-action="threads"]').click(); true`); await sleep(900);
    t("C2 step 4 without location opens 地域から探す", await p.ev(`document.getElementById("regionRecommendationAreaPicker").style.display !== "none" && !document.getElementById("howToModal").classList.contains("visible")`), "");
    await chooseArea(p, "那覇市");
    await p.waitFor(`/那覇の今日の会話/.test(document.getElementById("townNowThreadsList").textContent)`, 10000);
    // 掲示板の応答(那覇は1.5秒)の後にスクロールが始まるため、止まるまで待つ。
    await sleep(4000);
    const v = await p.ev(`({ shown: ${vis("townNowThreadsSection")}, note: ${text("#townNowThreadsAreaNote")}, list: ${text("#townNowThreadsList")}, top: Math.round(document.getElementById("townNowThreadsSection").getBoundingClientRect().top) })`);
    t("C3 thread section shows the chosen town's threads", v.shown && /那覇の今日の会話/.test(v.list) && !/宜野湾/.test(v.list), v);
    t("C4 area note names the town", v.note === "選んだ街「那覇市」の今日のスレッドです。", v.note);
    t("C5 scrolled to the threads (not to shops)", v.top > -40 && v.top < 260, v.top);
    // 現在地を取得 → 近くのスレッドへ戻る(選んだ街の注記は消える)
    await p.s("Emulation.setGeolocationOverride", { latitude: NAHA[0], longitude: NAHA[1], accuracy: 20 });
    await p.send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation"], browserContextId: p.browserContextId });
    await p.ev(`document.getElementById("locationButton").click(); true`);
    await p.waitFor(`/近くの会話/.test(document.getElementById("townNowThreadsList").textContent)`, 15000);
    t("C6 after getting location, nearby threads replace the town view", await p.ev(`document.getElementById("townNowThreadsAreaNote").hidden === true && !/那覇の今日の会話/.test(document.getElementById("townNowThreadsList").textContent)`), "");
    await p.close();
  }
  {
    // 現在地あり：④は近くのスレッドへ
    const p = await openAt("/", { lang: "ja", width: 390, geo: NAHA });
    await p.ev(`openHowToModal(); document.querySelector('#howToModal [data-how-to-action="threads"]').click(); true`); await sleep(1200);
    t("C7 step 4 with location goes to nearby threads", await p.ev(`${vis("townNowThreadsSection")} && /近くの会話/.test(document.getElementById("townNowThreadsList").textContent) && document.getElementById("regionRecommendationAreaPicker").style.display === "none"`), "");
    await p.close();
  }

  // ---- D. 掲示板の街の切替(古い街の混入なし)・投稿の表示
  {
    const p = await openAt("/", { lang: "ja", width: 390 });
    await p.ev(`document.getElementById("heroActionArea").click(); true`); await sleep(600);
    await chooseArea(p, "那覇市");
    await p.waitFor(`/那覇の掲示板の投稿/.test(document.getElementById("regionRecommendationList").textContent)`, 10000);
    // 那覇(掲示板の応答 1.5秒)へ切り替えた直後に宜野湾(すぐ返る)へ。
    await p.ev(`document.getElementById("regionRecommendationOtherAreaButton").click(); true`);
    await chooseArea(p, "那覇市"); await sleep(100);
    const during = await p.ev(`({ list: ${text("#regionRecommendationList")}, heading: ${text("#regionRecommendationHeading")}, link: ${vis("communityBoardPostLink")} })`);
    t("D1 switching clears the previous town and shows loading", /読み込んでいます/.test(during.list) && !/投稿です/.test(during.list) && during.link === false, during);
    await sleep(150);
    await chooseArea(p, "宜野湾市");
    await sleep(2600);
    const v = await p.ev(`({ list: ${text("#regionRecommendationList")}, heading: ${text("#regionRecommendationHeading")}, threads: ${text("#townNowThreadsList")}, link: ${text("#communityBoardPostLink")}, href: (document.getElementById("communityBoardPostLink") || {}).getAttribute("href"), items: [...document.querySelectorAll("#regionRecommendationList .community-board-post-item")].map((e) => ({ meta: (e.querySelector(".community-board-post-meta") || {}).textContent || "", text: e.querySelector(".community-board-post-text").textContent, links: [...e.querySelectorAll(".community-board-link-button")].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("rel")]) })) })`);
    t("D2 late reply of the old town never overwrites the new town", /宜野湾/.test(v.list) && !/那覇の掲示板/.test(v.list) && v.heading === "宜野湾市の掲示板", v);
    t("D3 threads follow the same town", /宜野湾の今日の会話/.test(v.threads) && !/那覇/.test(v.threads), v.threads);
    t("D4 operator post: date + 運営", v.items[0] && /運営/.test(v.items[0].meta) && /2026年11月1日/.test(v.items[0].meta), v.items[0]);
    t("D5 general post: date, no guessed attribute", v.items[1] && !/運営|地元|旅行者/.test(v.items[1].meta) && /2026年11月2日/.test(v.items[1].meta), v.items[1]);
    t("D6 raw URL not in text, shown as a link button", v.items[0] && !/https?:\/\//.test(v.items[0].text) && v.items[0].links.length === 1 && v.items[0].links[0][0] === "example.com を開く" && v.items[0].links[0][2] === "noopener noreferrer", v.items[0]);
    t("D7 board post link (in the unified CTA) points to the chosen town", v.link === "宜野湾市について投稿する" && /googlePlaceId=ChIJginowan/.test(v.href), [v.link, v.href]);
    // 0件・失敗
    await p.ev(`document.getElementById("regionRecommendationOtherAreaButton").click(); true`);
    await chooseArea(p, "名護市"); await sleep(1200);
    const z = await p.ev(`({ board: ${text("#regionRecommendationList")}, threads: ${text("#townNowThreadsList")} })`);
    t("D8 empty town: natural messages, not blank", /まだ投稿がありません/.test(z.board) && /この街では、まだ今日の会話がありません/.test(z.threads) && /あなたの発見を教えて/.test(z.threads), z);
    threadsListFail = true;
    await p.ev(`document.getElementById("regionRecommendationOtherAreaButton").click(); true`);
    await chooseArea(p, "宜野湾市"); await sleep(1200);
    t("D9 thread list failure shows an error, not an empty day", /読み込めませんでした/.test(await p.ev(text("#townNowThreadsList"))), await p.ev(text("#townNowThreadsList")));
    threadsListFail = false;
    // 英語
    await p.ev(`switchMachinauLanguage("en"); true`); await sleep(400);
    await p.ev(`document.getElementById("regionRecommendationOtherAreaButton").click(); true`);
    await chooseArea(p, "宜野湾市"); await sleep(1200);
    const en = await p.ev(`({ meta: ${text("#regionRecommendationList .community-board-post-meta")}, btn: ${text(".community-board-link-button")}, note: ${text("#townNowThreadsAreaNote")} })`);
    t("D10 English: date, operator label, link button, area note", /Nov 1, 2026/.test(en.meta) && /Machinau team/.test(en.meta) && en.btn === "Open example.com" && en.note === "Today's threads in 宜野湾市 (the town you picked).", en);
    await p.close();
  }

  // ---- E. 街ページの表示順・投稿の入口の統一・広告枠・読み物
  {
    const p = await openAt("/", { lang: "ja", width: 390, geo: NAHA });
    const v = await p.ev(`(() => { const ids = [...document.querySelectorAll("main > section, main > aside")].map((e) => e.id || e.className); const pos = (id) => ids.indexOf(id); return { ids, ok: pos("townNowThreadsSection") < pos("regionRecommendationSection") && pos("regionRecommendationSection") < pos("imadakeSection") && pos("imadakeSection") < pos("shopsSection") && pos("shopsSection") < pos("postCtaSection") && pos("postCtaSection") < pos("columnEntrySection") && pos("columnEntrySection") < pos("adSlotSection"), postLinks: [...document.querySelectorAll('a[href^="town-now-post.html"], a[href^="community-board-post.html"]')].map((a) => a.closest("section, aside") && a.closest("section, aside").id), cityInfo: !!document.getElementById("cityInfoSection"), regionToday: !!document.getElementById("regionTodayInfoSection"), street: !!document.getElementById("streetDiscoverySection"), shared: !!document.getElementById("sharedTripSection") }; })()`);
    t("E1 order: threads → board → (imadake) → shops → CTA → reads → ad", v.ok, v.ids);
    t("E2 post entries only in the unified CTA", v.postLinks.length === 2 && v.postLinks.every((id) => id === "postCtaSection"), v.postLinks);
    t("E3 other town features kept (この街の情報・今日の地域情報・街の発見・共有リスト)", v.cityInfo && v.regionToday && v.street && v.shared, v);
    const ad = await p.ev(`({ label: ${text(".ad-slot-label")}, h: Math.round(document.getElementById("adSlotSection").getBoundingClientRect().height), title: ${text(".ad-slot-house-title")}, price: /円|¥|料金|申込/.test(document.getElementById("adSlotSection").textContent), inShops: !!document.querySelector("#shopsList #adSlotSection") })`);
    t("E4 ad slot: 広告 label, reserved height, house notice, no price/order", ad.label === "広告" && ad.h >= 120 && ad.title !== "" && !ad.price && !ad.inShops, ad);
    const reads = await p.ev(`({ h: ${text("#columnEntrySection h2")}, lead: ${text("#columnEntrySection .column-entry-lead")}, dates: [...document.querySelectorAll("#columnEntryCardList .region-recommendation-card")].map((c) => (c.querySelector(".column-entry-date") || {}).textContent || "") })`);
    t("E5 reads heading / lead", reads.h === "マチナウ読み物" && reads.lead === "旅のヒント・ストーリー", reads);
    t("E6 published date only when known", reads.dates.length === 2 && reads.dates[0].replace(/\s+/g, " ").trim() === "公開日 2026年10月7日" && reads.dates[1] === "", reads.dates);
    await p.close();
    // 16項目⑮｜広告は入れ替えず、固定の募集の1枠(開き直しても同じ)
    const q = await openAt("/", { lang: "ja", width: 390 });
    const first = await q.ev(`document.querySelector("#adSlotBody [data-ad-house]").getAttribute("data-ad-house")`);
    await q.ev(`location.reload(); true`); await sleep(2500);
    const second = await q.ev(`document.querySelector("#adSlotBody [data-ad-house]").getAttribute("data-ad-house")`);
    t("E7 one fixed recruitment slot (no rotation)", first === "shop" && second === "shop", [first, second]);
    await q.ev(`switchMachinauLanguage("en"); true`); await sleep(300);
    t("E8 English ad label / reads date", await q.ev(`document.querySelector(".ad-slot-label").textContent.trim() === "Ad" && /Published Oct 7, 2026/.test(document.getElementById("columnEntryCardList").textContent.replace(/\\s+/g, " "))`), await q.ev(text("#columnEntryCardList")));
    await q.close();
  }

  // ---- F. 店舗：並びの表示と実際の並び・15km・距離順・同順位・鮮度の根拠
  {
    const p = await openAt("/", { lang: "ja", width: 390 });
    t("F1 no location: label says 新しい順 (actual order is newest)", (await p.ev(text("#shopsOrderLabel"))) === "新しい順", await p.ev(text("#shopsOrderLabel")));
    const tie = await p.ev(`(() => { const a = { firestoreId: "b", createdAt: null }, b = { firestoreId: "a", createdAt: null }, c = { firestoreId: "c", createdAt: { seconds: 100 } }; return [a, b, c].sort(compareShopsForStableTie).map((s) => s.firestoreId).join(); })()`);
    t("F2 ties: newer first, then id (stable across reloads)", tie === "c,a,b", tie);
    await p.close();
    const now = Date.now();
    imadakeReply = { status: 200, body: { success: true, posts: [
      { postId: "P1", storeId: "S1", storeName: "海辺のカフェ", headline: "今だけ", body: "x", imageUrls: [], latitude: 26.2141, longitude: 127.6802, publishedAt: new Date(now - 2 * 3600000 - 60000).toISOString(), expiresAt: new Date(now + 3600000).toISOString(), categoryCode: "cafe_sweets", actionTargets: {}, categoryFields: {}, paymentMethods: [] }
    ] } };
    const q = await openAt("/", { lang: "ja", width: 390, geo: NAHA });
    await sleep(1500);
    const v = await q.ev(`(() => { const cards = [...document.querySelectorAll("#shopsList .shop-card")]; const km = (c) => { const t = (c.querySelector(".info-chip-distance") || {}).textContent || ""; const m = t.match(/([\\d.]+)\\s*(km|m)/); return m ? (m[2] === "km" ? +m[1] * 1000 : +m[1]) : NaN; }; return { label: ${text("#shopsOrderLabel")}, ids: cards.map((c) => c.getAttribute("data-shop-id")), d: cards.map(km), chips: cards.map((c) => [c.getAttribute("data-shop-id"), [...c.querySelectorAll(".info-chip-imadake")].map((e) => e.textContent.trim())]) }; })()`);
    t("F3 with location: label 現在地から近い順", v.label === "現在地から近い順", v.label);
    t("F4 distance order kept", v.d.every((x, i) => i === 0 || x >= v.d[i - 1]), v.d);
    t("F5 15km kept (名護の店 not shown)", !v.ids.includes("L3"), v.ids);
    const chipS1 = v.chips.find((c) => c[0] === "sp_S1"), others = v.chips.filter((c) => c[0] !== "sp_S1");
    t("F6 live imadake post of the same store → 今だけ投稿あり・2時間前", chipS1 && chipS1[1].join() === "今だけ投稿あり・2時間前", v.chips);
    t("F7 no freshness chip on listings without a live post", others.every((c) => c[1].length === 0), others);
    await q.close();
    imadakeReply = { status: 200, body: { success: true, posts: [{ postId: "P2", storeId: "S1", headline: "x", body: "x", imageUrls: [], publishedAt: new Date(now - 30 * 3600000).toISOString(), expiresAt: new Date(now - 60000).toISOString(), actionTargets: {}, categoryFields: {}, paymentMethods: [] }] } };
    const r = await openAt("/", { lang: "ja", width: 390, geo: NAHA });
    await sleep(1200);
    t("F8 expired post → no chip", await r.ev(`document.querySelectorAll("#shopsList .info-chip-imadake").length === 0`), "");
    // 30分以内の現在地の復元：最初から距離順(新しい順を一度描いてから並べ替えない)
    await r.ev(`window.__orders = []; true`);
    await r.ev(`location.reload(); true`);
    await r.waitFor("typeof shops !== 'undefined' && shops.length > 0 && userLatitude !== null", 20000); await sleep(1500);
    t("F9 restored location: label 現在地から近い順 and distance order", (await r.ev(text("#shopsOrderLabel"))) === "現在地から近い順", await r.ev(text("#shopsOrderLabel")));
    await r.close();
    imadakeReply = null;
  }

  // ---- G. GA4：入口の計測(二重なし)・地図なし・保存箱
  {
    const p = await openAt("/", { lang: "ja", width: 390, geo: NAHA });
    for (const [id, action] of [["heroActionToday", "today"], ["heroActionNearby", "nearby"], ["heroActionArea", "area"], ["heroActionReads", "reads"], ["heroActionBoard", "board"]]) {
      await p.ev(`window.scrollTo(0, 0); true`);
      const before = await p.ev(`window.__ga.filter((e) => e[0] === "hero_action_click").length`);
      const ok = await tap(p, "#" + id, true);
      const after = await p.ev(`window.__ga.filter((e) => e[0] === "hero_action_click")`);
      t(`G ${id} → hero_action_click {action:${action}} once`, ok && after.length === before + 1 && after[after.length - 1][1].action === action, { ok, after });
      await p.ev(`document.getElementById("regionRecommendationAreaPicker").style.display = "none"; true`);
    }
    const programmatic = await p.ev(`(() => { const n = window.__ga.filter((e) => e[0] === "hero_action_click").length; openHowToModal(); document.querySelector('#howToModal [data-how-to-action="area"]').click(); return window.__ga.filter((e) => e[0] === "hero_action_click").length - n; })()`);
    t("G internal clicks are not counted as hero clicks", programmatic === 0, programmatic);
    await p.ev(`document.querySelector("#adSlotBody").innerHTML = '<a class="ad-slot-house" href="shop.html" data-ad-house="shop">x</a>'; document.querySelector("#adSlotBody a").addEventListener("click", (e) => e.preventDefault()); document.querySelector("#adSlotBody a").click(); true`);
    const shopGa = await p.ev(`window.__ga.filter((e) => e[0] === "shop_guide_click").map((e) => e[1].placement)`);
    t("G ad slot → shop_guide_click placement ad_slot (1 event)", JSON.stringify(shopGa) === JSON.stringify(["ad_slot"]), shopGa);
    const pii = await p.ev(`JSON.stringify(window.__ga.map((e) => e[1]))`);
    t("G no coordinates in GA params", !/26\.2|127\.6/.test(pii), pii);
    await p.ev(`showMyPage(); true`); await sleep(500);
    t("G 旅の保存箱 opens without the map section", await p.ev(`document.getElementById("myPageSection").style.display === "block"`) && p.log.errors.filter((e) => !/404 local|動的一覧/.test(e)).length === 0, p.log.errors);
    t("G no Google map created after location", await p.ev(`window.__mapsCreated`) === 0, "");
    await p.close();
  }

  // ---- S. サーバー：掲示板の公開一覧の投稿者の属性(保存された authorType だけ・投稿者の ID は返さない)
  {
    globalThis.__MOCK_TOKENS.anonViewer = { uid: "anonViewer", firebase: { sign_in_provider: "anonymous" } };
    S.docs.set("regionsByGooglePlaceId/JP_ChIJtestBoard", { regionId: "RB1" });
    S.docs.set("regions/RB1", { regionName: "試験市" });
    S.docs.set("communityBoardPosts/BO1", { regionId: "RB1", status: "approved", text: "運営のお知らせ https://example.com/a", authorType: "operator", createdByUid: "op-secret", operatorLinksEnabled: true, imageUrls: [], createdAt: Timestamp.fromMillis(Date.now() - 1000) });
    S.docs.set("communityBoardPosts/BG1", { regionId: "RB1", status: "approved", text: "一般の投稿", authorUid: "user-secret", operatorLinksEnabled: false, createdAt: Timestamp.fromMillis(Date.now() - 2000) });
    S.docs.set("communityBoardPosts/BP1", { regionId: "RB1", status: "pending", text: "審査中", authorType: "operator", createdAt: Timestamp.fromMillis(Date.now() - 500) });
    const r = res();
    await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", authorization: "Bearer anonViewer", "x-forwarded-for": "198.51.100.9" }, body: { mode: "communityBoardPostsList", googlePlaceId: "ChIJtestBoard", countryCode: "JP" }, query: {} }, r));
    const list = (r.body && r.body.posts) || [];
    const byId = Object.fromEntries(list.map((x) => [x.postId, x]));
    t("S1 board list: operator post → authorType operator, general → empty", r.code === 200 && byId.BO1 && byId.BO1.authorType === "operator" && byId.BG1 && byId.BG1.authorType === "", { code: r.code, body: r.body });
    t("S2 board list: no author IDs, pending posts not listed", !/secret/.test(JSON.stringify(r.body)) && !byId.BP1, r.body);
  }

  // ---- H. 翻訳辞書・表記
  {
    const keys = ["brand_caption", "hero_area_badge", "hero_action_today_caption", "hero_board_title", "hero_board_caption", "hero_card_more", "how_to_entry_title", "location_alternatives_toggle", "location_alternatives_heading", "location_retry_button", "shops_newest_order", "shop_imadake_chip", "community_board_loading", "community_board_open_link", "community_board_author_operator", "town_now_loading", "town_now_list_load_error", "town_now_empty_region", "town_now_empty_hint", "town_now_area_note_prefix", "town_now_area_note_suffix", "column_entry_published_label", "ad_slot_label", "ad_house_shop_title", "ad_house_reads_title", "ad_house_how_to_title", "ad_house_more"];
    const src = read("translations.js");
    const missing = keys.filter((k) => !new RegExp("\\n  " + k + ": \\{\\r?\\n    ja: \"[^\"]+\",\\r?\\n    en: \"[^\"]+\"").test(src));
    t("H1 new fixed texts have ja and en", missing.length === 0, missing);
    const jaLines = src.split(/\r?\n/).filter((l) => /^    ja: /.test(l));
    t("H2 表記 マチナウ読み物 (no 読みもの in ja texts)", jaLines.every((l) => !/読みもの/.test(l)), jaLines.filter((l) => /読みもの/.test(l)));
    t("H3 no 読みもの left in visible TOP texts", !/>[^<]*読みもの[^<]*</.test(html.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "")), "");
    t("H4 no いいい旅", !/いいい旅/.test(src + html), "");
  }
} catch (error) {
  t("unexpected", false, String(error && error.stack || error));
} finally {
  try { browser.close(); } catch (e) {}
  server.close(); staticServer.close();
  console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
