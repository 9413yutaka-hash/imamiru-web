// 2026-11-09 サイト全体改善 第5弾(代表正式承認)。入口・集客改善。
// A. ファーストビュー(見出し・補足・主ボタン「現在地から探す」・副導線「地域から探す」、旧3入口の整理、計測の意味の維持)。
// B. 情報の鮮度(期限の無い掲載に「新着」を出さない・残り時間・根拠の無い「営業中」を出さない)。
// C. TOPカードの簡潔化(短い紹介・距離・詳細への導線、15km・近い順・お気に入り・地図・詳細)。
// D. 今だけ投稿が0件の日の「今日の今」。E. 店舗向け案内の再設計。F. 店舗向け案内への移動の計測。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// run: node --import ./tests/mockfa-occ/register.mjs tests/site-improvement-5-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8971;
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
const posts = [];
let imadakeReply = null;
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return null;
  const q = Object.fromEntries(u.searchParams.entries());
  return quiet(async () => {
    const r = res();
    if (method === "GET") {
      if (q.mode === "imadakePostsNearby" && imadakeReply) return imadakeReply;
      if (q.mode && q.mode !== "publicStoreProfiles") return { status: 200, body: { success: true, posts: [], articles: [], stores: [], threads: [] } };
      await handler({ method: "GET", headers: {}, query: q }, r);
      return { status: r.code, body: r.body };
    }
    const body = JSON.parse(postData || "{}"); posts.push(body.mode || "");
    // TOP の英語の訳の取得(無料掲載・店主の店舗)は、この試験では止める(翻訳は別の試験)。
    if (body.mode === "shopTranslationGet" || body.mode === "storeProfileTranslationGet") return { status: 200, body: { success: false } };
    clearRate();
    const auth = headers.Authorization || headers.authorization;
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r);
    return { status: r.code, body: r.body };
  });
}
const IMG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
const urlMock = async (url) => (/res\.cloudinary\.com/.test(url) ? { raw: IMG, contentType: "image/jpeg" } : null);
const MAPS_SHIM = `(() => {
  const deep = () => new Proxy(function(){}, { get: (t, k) => k === "then" ? undefined : (k === Symbol.toPrimitive ? () => "" : deep()), apply: () => deep(), construct: () => deep() });
  const result = [{ formatted_address: "日本、沖縄県那覇市久茂地", address_components: [
    { long_name: "那覇市", short_name: "那覇市", types: ["locality", "political"] },
    { long_name: "沖縄県", short_name: "沖縄県", types: ["administrative_area_level_1", "political"] },
    { long_name: "日本", short_name: "JP", types: ["country", "political"] }], types: ["street_address"] }];
  window.google = { maps: new Proxy({}, { get: (t, k) => {
    if (k === "Geocoder") return function() { this.geocode = (req, cb) => { if (cb) setTimeout(() => cb(result, "OK"), 30); return Promise.resolve({ results: result }); }; };
    if (k === "GeocoderStatus") return { OK: "OK" };
    return deep();
  } }) };
})();`;
const fakeStoreAuth = `(() => {
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) {
    fb = v;
    if (v && v.initializeApp && !v.__wrapped) {
      const orig = v.initializeApp.bind(v);
      v.__wrapped = true;
      v.initializeApp = function(options, name) {
        if (name === 'machinauStoreAccount') {
          const userObj = { uid: "u1", email: "owner@example.com", isAnonymous: false, emailVerified: true, getIdToken: async () => "u1", reload: async () => {} };
          return { name, auth: () => ({ currentUser: userObj, onAuthStateChanged(cb) { setTimeout(() => cb(userObj), 0); return () => {}; } }) };
        }
        return orig(options, name);
      };
    }
  } });
})();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
const browser = await launchChrome();
async function openTop(lang, width) {
  const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: api, articles: [], urlMock, initScripts: [langInit(lang), MAPS_SHIM], blockUrls: ["maps.googleapis.com/maps/api/js"] } });
  await p.send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation"], browserContextId: p.browserContextId });
  await p.goto("/");
  await p.waitFor("document.readyState === 'complete' && typeof shops !== 'undefined' && shops.length > 0", 30000);
  await sleep(800);
  await p.s("Emulation.setGeolocationOverride", { latitude: 26.2124, longitude: 127.6792, accuracy: 20 });
  await p.ev("getLocation(); true");
  await p.waitFor("userLatitude !== null", 15000);
  await p.waitFor(`!!document.querySelector('#shopsList .shop-card[data-shop-id="sp_S1"]')`, 15000);
  await sleep(1200);
  return p;
}

// GA4 の送信は本番のドメインだけのため、試験では送信の関数を差し替えて記録する(本体の呼び出しは変えない)。
const GA_SPY = `(() => {
  window.__ga = [];
  const install = () => { window.sendMachinauAnalyticsEvent = function(name, params) { window.__ga.push([name, params || {}]); }; };
  document.addEventListener("DOMContentLoaded", install);
})();`;
const CLIP_SPY = `(() => {
  window.__clip = [];
  try { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); } catch (e) {}
  try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.__clip.push(text); } } }); } catch (e) {}
})();`;
async function openAt(path, { lang = "ja", width = 390, geo = null, favorites = null } = {}) {
  const favInit = favorites ? `try{ if (!sessionStorage.getItem("__f")) { sessionStorage.setItem("__f","1"); localStorage.setItem("machinauFavoriteShopIds", ${JSON.stringify(JSON.stringify(favorites))}); } }catch(e){}` : "";
  const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: api, articles: [], urlMock, initScripts: [langInit(lang), MAPS_SHIM, GA_SPY, CLIP_SPY, favInit], blockUrls: ["maps.googleapis.com/maps/api/js"] } });
  await p.send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation"], browserContextId: p.browserContextId });
  await p.goto(path);
  await p.waitFor("document.readyState === 'complete' && typeof shops !== 'undefined' && shops.length > 0 && typeof storeProfileListFetchSettled !== 'undefined' && storeProfileListFetchSettled", 30000);
  await sleep(800);
  if (geo) {
    await p.s("Emulation.setGeolocationOverride", { latitude: geo[0], longitude: geo[1], accuracy: 20 });
    await p.ev("getLocation(); true");
    await p.waitFor("userLatitude !== null", 15000);
    await sleep(1200);
  }
  return p;
}
const NAHA = [26.2124, 127.6792], TOKYO = [35.6812, 139.7671];
const PII = /lat|lng|lon|email|uid|address|phone/i;

try {
  const fsx = await import("node:fs");
  const read = (f) => fsx.readFileSync(REPO_ROOT + "/" + f, "utf8");
  // 利用者の操作と同じ入力(isTrusted)で押す。
  async function tap(p, selector, mobile) {
    // 前の操作のなめらかなスクロールが止まるのを待ち、狙った要素がその位置にあることを確かめてから押す。
    await sleep(1200);
    const box = await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; document.documentElement.style.scrollBehavior = "auto"; e.scrollIntoView({ block: "center", behavior: "instant" }); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, ok: !!hit && !!hit.closest(${JSON.stringify(selector)}) }; })()`);
    if (!box || !box.ok) return false;
    await sleep(250);
    if (mobile) { await p.s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] }); await p.s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
    else { await p.s("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 }); await p.s("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }); }
    await sleep(500);
    return true;
  }
  const ga = (p, name) => p.ev(`window.__ga.filter((e) => e[0] === ${JSON.stringify(name)})`);
  const errs = (p) => p.log.errors.filter((e) => !/動的一覧取得に失敗/.test(e));

  // ---- A. ファーストビュー
  for (const lang of ["ja", "en"]) for (const width of [360, 390, 430, 1280]) {
    const p = await openAt("/", { lang, width });
    await p.ev("window.scrollTo(0, 0); true"); await sleep(200);
    const v = await p.ev(`(() => {
      const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, w: b.width, h: b.height, text: e.textContent.replace(/\\s+/g, " ").trim(), vis: getComputedStyle(e).display !== "none" }; };
      return { h1: document.querySelector(".hero-main-copy").textContent.replace(/\\s+/g, "").trim(), lead: document.querySelector(".hero-lead").textContent.replace(/\\s+/g, "").trim(),
        primary: r("locationButton"), area: r("heroActionArea"), msg: r("locationMessage"), howTo: r("howToEntryButton"),
        removed: ["heroActionToday", "heroActionNearby", "heroActionReads"].filter((id) => document.getElementById(id)).length,
        grid: document.querySelectorAll(".hero-action-grid, .hero-action-card").length,
        hScroll: document.documentElement.scrollWidth > innerWidth + 1, vh: innerHeight };
    })()`);
    const ja = lang === "ja";
    const textOk = ja ? v.h1 === "今、この街で何しよう？" && v.lead === "今だけの情報も、近くのお店も。今いる場所から見つけよう。" && v.primary.text === "現在地から探す" && v.area.text === "地域から探す"
      : v.h1 === "Whattodointhistown,rightnow?" && /^Limited-timeupdates/.test(v.lead) && v.primary.text === "Search near me" && v.area.text === "Explore by Area";
    t(`A1 ${lang} ${width}：見出し・補足・主ボタン「現在地から探す」・副導線「地域から探す」。旧3入口は無い`, textOk && v.removed === 0 && v.grid === 0, v);
    t(`A2 ${lang} ${width}：主ボタンが一番大きく(高さ・幅とも副導線以上)、最初の画面に入る・取得前の案内は空で非表示・楽しみ方の入口あり・横スクロールなし・エラーなし`,
      v.primary.h > v.area.h && v.primary.w >= v.area.w && v.primary.bottom < v.vh && !v.msg.vis && v.howTo && v.howTo.vis && !v.hScroll && errs(p).length === 0, { v, e: errs(p) });
    await p.close();
  }
  for (const [width, mobile] of [[390, true], [1280, false]]) {
    const p = await openAt("/", { width });
    await p.s("Emulation.setGeolocationOverride", { latitude: NAHA[0], longitude: NAHA[1], accuracy: 20 });
    await tap(p, "#locationButton", mobile);
    await p.waitFor("userLatitude !== null", 15000); await sleep(1500);
    const v = await p.ev(`({ btn: document.getElementById("locationButton").textContent.trim(), msg: document.getElementById("locationMessage").textContent.trim(), msgVis: getComputedStyle(document.getElementById("locationMessage")).display !== "none" })`);
    const lb = await ga(p, "location_button_click"), hero = await ga(p, "hero_action_click");
    t(`A3 ${width}：現在地から探す → 現在地を取得(取得後は「現在地を更新」・案内を表示)。計測は既存の location_button_click 1回だけ(hero_action_click は送らない＝二重に数えない)・座標なし`,
      v.btn === "現在地を更新" && v.msg !== "" && v.msgVis && lb.length === 1 && hero.length === 0 && !PII.test(JSON.stringify(lb)), { v, lb, hero });
    const before = (await ga(p, "community_board_view")).length;
    await tap(p, "#heroActionArea", mobile);
    const areaGa = await ga(p, "hero_action_click");
    const picker = await p.ev(`getComputedStyle(document.getElementById("regionRecommendationAreaPicker")).display !== "none"`);
    t(`A4 ${width}：地域から探す → 地域の選択が開く・hero_action_click {action: area} を1回・既存の community_board_view も従来どおり`, picker && areaGa.length === 1 && areaGa[0][1].action === "area" && (await ga(p, "community_board_view")).length === before + 1, { picker, areaGa });
    await p.close();
  }
  {
    // 位置情報の拒否：理由の案内・設定方法・「地域から探す」(同じボタンを重ねない)。
    const p = await openAt("/");
    await p.ev(`navigator.geolocation.getCurrentPosition = (ok, ng) => setTimeout(() => ng({ code: 1, message: "denied" }), 10); getLocation(); true`); await sleep(800);
    const v = await p.ev(`(() => { const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0; }; return { msg: document.getElementById("locationMessage").textContent.trim(), guide: vis("locationPermissionGuideToggle"), failure: vis("locationFailureActions"), failureArea: vis("locationFailureAreaButton"), area: vis("heroActionArea"), btn: document.getElementById("locationButton").textContent.trim() }; })()`);
    t("A5 位置情報を拒否：案内の文・設定方法を見る・「地域から探す」(1つだけ)・もう一度試す", v.msg !== "" && v.guide && v.failure && !v.failureArea && v.area && v.btn !== "", v);
    // 地域を選ぶ → 現在地へ戻る(既存の導線)
    await p.ev(`document.getElementById("heroActionArea").click(); true`); await sleep(500);
    await p.close();
  }
  {
    // 楽しみ方の説明の「近くで楽しめる場所を見る」(外した入口と同じ処理)：現在地の取得後は近くの一覧へ・地域の表示を解除。
    const p = await openAt("/", { geo: NAHA });
    await p.ev(`selectedShopRegion = { prefecture: "沖縄県", municipality: "那覇市" }; openHowToModal(); document.querySelector('#howToModal [data-how-to-action="nearby"]').click(); true`); await sleep(1200);
    const v = await p.ev(`({ region: selectedShopRegion, modal: document.getElementById("howToModal").classList.contains("visible"), top: Math.round(document.getElementById("shopsSection").getBoundingClientRect().top) })`);
    t("A6 楽しみ方の「近くで楽しめる場所を見る」：近くの一覧へ移動し、地域の表示を解除する(エラーなし)", v.region === null && !v.modal && v.top < 200 && errs(p).length === 0, { v, e: errs(p) });
    await p.close();
  }

  // ---- B. 情報の鮮度・営業の表示 / C. TOPカード
  for (const lang of ["ja", "en"]) {
    const p = await openAt("/", { lang, geo: NAHA });
    const v = await p.ev(`(() => { const cards = [...document.querySelectorAll("#shopsList .shop-card")]; const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
      return { ids: cards.map((c) => c.getAttribute("data-shop-id")), text: document.getElementById("shopsList").innerText,
        summaries: cards.map((c) => (c.querySelector(".shop-summary") || {}).textContent || ""), clamp: cards.map((c) => c.querySelector(".shop-summary") ? getComputedStyle(c.querySelector(".shop-summary")).webkitLineClamp : ""),
        hiddenLong: cards.every((c) => !vis(c.querySelector(".shop-description")) && [...c.querySelectorAll(".time-limit")].every((e) => !vis(e))),
        detail: cards.every((c) => vis(c.querySelector(".detail-button"))), noPhoto: (() => { const c = document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .shop-visual'); return c ? Math.round(c.getBoundingClientRect().height) : 0; })(),
        timeChip: (document.querySelector('#shopsList .shop-card[data-shop-id="T1"] .info-chip-time') || {}).textContent || "",
        dist: cards.map((c) => (c.querySelector(".info-chip-distance") || {}).textContent || "").map((s) => s.replace(/\\s+/g, "")),
        eager: [...document.querySelectorAll("#shopsList img")].filter((i) => i.getAttribute("loading") !== "lazy").length,
        hScroll: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
    const ja = lang === "ja";
    t(`B1 ${lang}：期限の無い掲載に「新着」・「今日だけ」・「掲載中」・「営業中」・「営業時間外」を出さない`, !/新着|今日だけ|掲載中|営業中|営業時間外|New\b|Today Only|\bListed\b(?! for)|\bOpen\b|\bClosed\b/.test(v.text), v.text.slice(0, 400));
    t(`B2 ${lang}：期限つきの投稿は実際の掲載期限までの残り時間(掲載はあと2時間)`, ja ? v.timeChip.trim() === "掲載はあと2時間" : v.timeChip.trim() === "Listed for 2 more hr", v.timeChip);
    // この試験では英語の訳の取得を止めているため、英語の表示でも紹介文は原文(訳がある時は訳の最初の一文)。
    const sp = "海の見えるカフェです。";
    t(`C1 ${lang}：短い紹介は紹介文の最初の一文(2行まで)・長い紹介文と住所はカードに出さない`, v.summaries[v.ids.indexOf("sp_S1")] === sp && v.summaries[v.ids.indexOf("L2")] === "定食の店です。" && v.clamp.every((c) => c === "2") && v.hiddenLong, v);
    // スマホの2枚表示は操作のボタンを出さず(2026-11-08 承認の刷新)、カード全体を押すと詳細が開く。
    await p.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .shop-summary').click(); true`); await sleep(600);
    const opened = await p.ev(`document.getElementById("shopModal").classList.contains("visible") && /見本カフェ/.test(document.getElementById("shopModal").innerText)`);
    await p.ev(`closeShopModal && closeShopModal(); true`); await sleep(300);
    t(`C1b ${lang}：カードを押すと詳細が開く(詳細への導線)`, opened && !v.detail, { opened, detail: v.detail });
    t(`C2 ${lang}：近い順・15km の外(名護)は出さない・写真なしの掲載も同じ枠で表示・写真の先読みは2枚まで・横スクロールなし`, !v.ids.includes("L3") && v.noPhoto > 100 && v.eager <= 2 && !v.hScroll && v.dist.every((d, i, a) => i === 0 || parseFloat(a[i - 1].replace(/[^0-9.]/g, "")) <= parseFloat(d.replace(/[^0-9.]/g, "")) || /km/.test(d)), v);
    // 詳細：期限つき投稿は営業時間を出すが「営業中」は出さない。常設の掲載は「新着」を出さない。
    await p.ev(`openShopModal("T1", "card"); true`); await sleep(600);
    const m1 = await p.ev(`document.getElementById("modalMessage").innerText + " | " + document.getElementById("modalCategory").textContent`);
    await p.ev(`closeShopModal && closeShopModal(); openShopModal("L2", "card"); true`); await sleep(600);
    const m2 = await p.ev(`document.getElementById("modalMessage").innerText`);
    t(`B3 ${lang}：詳細も「営業中・閉店まで・新着」を出さず、店舗が入力した営業時間と残り時間を出す`, (ja ? /営業時間 10:00〜20:00/.test(m1) && /掲載はあと2時間/.test(m1) : /Hours: 10:00–20:00/.test(m1) && /Listed for 2 more hr/.test(m1)) && !/営業中|営業終了まで|新着|Open\b|Closing in|\bNew\b/.test(m1 + m2), { m1, m2 });
    t(`C3 ${lang}：詳細には地図・お気に入り・共有が従来どおりある`, await p.ev(`(() => { const m = document.getElementById("shopModal"); return !!m.querySelector("#modalMapButton") && getComputedStyle(m.querySelector("#modalMapButton")).display !== "none" && !!m.querySelector(".machinau-share-button, [data-share-kind]"); })()`), "");
    await p.close();
  }
  {
    const p = await openAt("/", { width: 1280, geo: NAHA });
    const v = await p.ev(`(() => { const c = document.querySelector('#shopsList .shop-card[data-shop-id="L2"]'); const vis = (e) => !!e && getComputedStyle(e).display !== "none"; return { map: vis(c.querySelector(".map-button")), detail: vis(c.querySelector(".detail-button")), desc: vis(c.querySelector(".shop-description")), hScroll: document.documentElement.scrollWidth > innerWidth + 1 }; })()`);
    await p.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .favorite-button').click(); true`); await sleep(400);
    const fav = await p.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .favorite-button').classList.contains("active")`);
    t("C4 PC：TOPカードは紹介文の全文・地図のボタンを出さず(詳細にある)、詳細への導線あり・お気に入りは押せる", !v.map && v.detail && !v.desc && !v.hScroll && fav, { v, fav });
    await p.close();
  }
  t("B4 期限の文言：期限なし・過去は空、30分→「掲載はあと30分」、23時間30分→「掲載はあと23時間」(切り捨て)", await (async () => {
    const p = await openAt("/");
    const r = await p.ev(`[getExpiryDisplayText({}), getExpiryDisplayText({ expiresAt: new Date(Date.now() - 1000) }), getExpiryDisplayText({ expiresAt: new Date(Date.now() + 30 * 60000 - 500) }), getExpiryDisplayText({ expiresAt: new Date(Date.now() + 23.5 * 3600000) }), getBusinessStatus({ businessStartTime: "00:00", businessEndTime: "23:59" }).text, getBusinessClosingText({ isOpen24Hours: true })]`);
    await p.close();
    return JSON.stringify(r) === JSON.stringify(["", "", "掲載はあと30分", "掲載はあと23時間", "", ""]);
  })(), "");

  // ---- D. 今だけ投稿が0件の日
  const IMADAKE_POST = { postId: "P1", storeId: "S1", storeNameSnapshot: "海辺のカフェ", categoryCode: "restaurant", headline: "本日空席あります", body: "カウンター席が空いています。", sourceLanguage: "ja", publishedAt: new Date(Date.now() - 3600000).toISOString(), expiresAt: new Date(Date.now() + 3 * 3600000).toISOString(), distanceKm: 0.3, imageUrls: [] };
  for (const [label, reply] of [["ok0", { status: 200, body: { success: true, posts: [] } }], ["fail", { status: 500, body: { success: false } }], ["one", { status: 200, body: { success: true, posts: [IMADAKE_POST] } }]]) {
    imadakeReply = reply;
    for (const lang of label === "ok0" ? ["ja", "en"] : ["ja"]) {
      posts.length = 0;
      const p = await openAt("/", { lang, geo: NAHA }); await sleep(800);
      const v = await p.ev(`(() => { const s = document.getElementById("todayNowEmptySection"); return { empty: !s.hidden, imadake: !document.getElementById("imadakeSection").hidden, heading: s.querySelector("h2").textContent.trim(), links: [...s.querySelectorAll("[data-today-now-target]")].filter((b) => !b.hidden && getComputedStyle(b).display !== "none").map((b) => b.getAttribute("data-today-now-target")), labels: [...s.querySelectorAll("[data-today-now-target]")].filter((b) => !b.hidden).map((b) => b.textContent.trim()) }; })()`);
      if (label === "ok0") {
        t(`D1 ${lang}：取得に成功して0件の時だけ「今日の今」を出し、表示中の枠(近くのお店)への移動だけを並べる(空の枠・非表示の枠へのボタンは出さない)`, v.empty && !v.imadake && v.heading === (lang === "ja" ? "今日の今" : "Today, right now") && JSON.stringify(v.links) === '["shopsSection"]', v);
        // 読みものの枠に記事が出たら、そのボタンも出る。押すとその枠へ移動する。
        await p.ev(`document.getElementById("columnEntryCardList").insertAdjacentHTML("beforeend", "<article>記事</article>"); true`); await sleep(300);
        const links2 = await p.ev(`[...document.querySelectorAll("#todayNowEmptySection [data-today-now-target]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-today-now-target"))`);
        await p.ev(`document.documentElement.style.scrollBehavior = "auto"; document.querySelector('#todayNowEmptySection [data-today-now-target="shopsSection"]').click(); true`); await sleep(900);
        const top = await p.ev(`(() => { const r = document.getElementById("shopsSection").getBoundingClientRect(); return Math.round(r.top) + 0; })()`); // -0 は CDP で値として返らないため 0 にそろえる
        t(`D2 ${lang}：表示中の枠が増えたらボタンも増える・押すとその枠へ移動・今だけ投稿の CV・詳細の通信なし`, JSON.stringify(links2) === '["shopsSection","columnEntrySection"]' && top < 250 && !posts.some((m) => /imadake/i.test(m)), { links2, top, posts });
      } else if (label === "fail") {
        t("D3 取得に失敗した時は「今日の今」を出さない(掲載が無いと言わない)・今だけ投稿の枠も出さない", !v.empty && !v.imadake, v);
      } else {
        t("D4 今だけ投稿がある時は従来の枠を出し、「今日の今」は出さない・CV の記録(詳細の通信)は押すまで送らない", !v.empty && v.imadake && !posts.some((m) => /imadakeDetailOpen/.test(m)) && errs(p).length === 0, { v, posts, e: errs(p) });
      }
      await p.close();
    }
  }
  imadakeReply = null;

  // ---- E. 店舗向け案内(shop.html)
  for (const width of [360, 390, 430, 1280]) {
    const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: {} });
    await p.goto("/shop.html"); await sleep(600);
    const v = await p.ev(`(() => { const txt = (s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\\s+/g, " ").trim());
      return { h1: document.querySelector("h1").textContent.replace(/\\s+/g, ""), sections: txt("main h2"), sample: document.body.innerText.includes("見本（架空のお店です）"),
        open: txt(".plan-open .plan-status, .plan-open .plan-price"), soon: txt(".plan-soon").map((s) => s.slice(0, 60)), soonLinks: document.querySelectorAll(".plan-soon a, .plan-soon button, .plan-soon form").length,
        signup: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /store-account/.test(h)),
        hScroll: document.documentElement.scrollWidth > innerWidth + 1, body: document.body.innerText }; })()`);
    t(`E1 ${width}：最初に価値「今、この街にいる旅行者へ、お店の情報を届ける。」→見本(架空と明示)→活用例→管理のメリット→料金と条件→はじめ方→引き継ぎ`, v.h1 === "今、この街にいる旅行者へ、お店の情報を届ける。" && v.sample && JSON.stringify(v.sections.slice(0, 6)) === JSON.stringify(["旅行者には、こう見えます", "「今だけ投稿」の使い方の例", "お店の情報をご自身で管理すると", "料金と条件", "はじめ方", "マチナウにすでに掲載されているお店の方へ"]) && !v.hScroll && p.log.errors.length === 0, v);
    t(`E2 ${width}：100円は受付中・500円／1,000円は「準備中・現在はお申し込みできません」で申込みの導線なし・申込みは既存の店舗アカウントだけ`, v.open.join("|") === "お申し込み受付中|月額100円（税込）／1店舗" && v.soon.length === 2 && v.soon.every((s) => s.startsWith("準備中・現在はお申し込みできません")) && /月額500円/.test(v.soon[0]) && /1回1,000円/.test(v.soon[1]) && v.soonLinks === 0 && v.signup.every((h) => h === "store-account.html?view=signup" || h === "store-account.html"), v);
    t(`E3 ${width}：正式な条件の文(新規も引き継ぎも同じ料金・無料掲載は続く・料金で表示順は上がらない・今だけ投稿の料金)・実績や集客の数字を書かない`, ["新規店舗登録も、掲載済み店舗の引き継ぎも、同じ料金・同じ条件です", "運営が掲載している無料の掲載は、店舗カードの契約が無くても続きます", "料金によってトップページでの表示順が上がることはありません", "有効な閲覧があった日だけ1投稿100円（税込）"].every((s) => v.body.includes(s)) && !/導入店舗|店舗が導入|人が利用|万人|実績|売上|来店数|集客効果|No\.1/.test(v.body), "");
    await p.close();
  }

  // ---- F. 店舗向け案内への移動の計測(既存の shop_guide_click、置き場所を分ける・1回の押下で1件)
  {
    const p = await openAt("/");
    await p.ev(`window.addEventListener("click", (e) => e.preventDefault()); true`);
    const seen = [];
    for (const [sel, placement] of [[".contribute-cta-shop-link", "top_cta"], ['footer a[href="shop.html"]', "footer"]]) {
      const before = (await ga(p, "shop_guide_click")).length;
      await tap(p, sel, true);
      const after = await ga(p, "shop_guide_click");
      seen.push({ placement, added: after.length - before, last: after[after.length - 1] });
    }
    await p.ev(`openHowToModal(); true`); await sleep(300);
    const b2 = (await ga(p, "shop_guide_click")).length;
    await p.ev(`document.querySelector('#howToModal a[href="shop.html"]').click(); true`); await sleep(200);
    const howTo = (await ga(p, "shop_guide_click")).slice(b2);
    t("F1 店舗向け案内への移動：TOP の案内・フッター・楽しみ方の説明を placement で分けて1回ずつ(個人・位置の情報なし)", seen.every((x) => x.added === 1 && x.last[1].placement === x.placement) && howTo.length === 1 && howTo[0][1].placement === "how_to" && !PII.test(JSON.stringify(seen.map((x) => x.last[1]).concat(howTo.map((x) => x[1])))), { seen, howTo });
    await p.close();
  }
  t("G 翻訳の API は呼ばない・想定外の外部通信なし", calls.translation === 0 && calls.other === 0, calls);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
