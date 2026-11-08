// 2026-11-08 サイト全体改善 第3弾(代表承認)。ヒーロー4入口の GA4・版の表記の撤去・読みもの一覧と投稿の入口の英語。
// 1. ヒーローの4入口は、利用者が押した時だけ hero_action_click {action} を1回送る(ほかの導線が内部で押した時は送らない)。
// 2. 利用者向けのフッターから「Web Version …」を外した(管理者の画面はそのまま)。
// 3. 読みもの一覧・投稿の入口は TOP で選んだ言語を引き継ぎ、英語では固定の文言を訳す(記事の題名などのデータは訳さない・翻訳 API を呼ばない)。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// run: node --import ./tests/mockfa-occ/register.mjs tests/site-improvement-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8951;
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
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return null;
  const q = Object.fromEntries(u.searchParams.entries());
  return quiet(async () => {
    const r = res();
    if (method === "GET") {
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
  const heroGa = (p) => p.ev(`window.__ga.filter((e) => e[0] === "hero_action_click")`);

  // ---- 1. GA4
  for (const [width, mobile] of [[390, true], [1280, false]]) {
    const p = await openAt("/", { width, geo: NAHA });
    const seen = [];
    for (const [id, action] of [["heroActionToday", "today"], ["heroActionNearby", "nearby"], ["heroActionArea", "area"], ["heroActionReads", "reads"]]) {
      const before = (await heroGa(p)).length;
      const tapped = await tap(p, "#" + id, mobile);
      const after = await heroGa(p);
      seen.push({ action, tapped, added: after.length - before, last: after[after.length - 1] });
    }
    t(`1 ${width}：4入口それぞれを押すと hero_action_click を1回だけ(action で区別・ほかの項目なし)`, seen.every((x) => x.added === 1 && x.last && x.last[1].action === x.action && JSON.stringify(Object.keys(x.last[1])) === '["action"]'), seen);
    if (mobile) {
      const cb = await p.ev(`window.__ga.filter((e) => e[0] === "community_board_view").length`);
      t("1b 既存の処理はそのまま：「地域から探す」の community_board_view も従来どおり送る", cb >= 1, cb);
    }
    await p.close();
  }
  {
    const p = await openAt("/", { geo: NAHA });
    await p.ev(`document.getElementById("heroActionArea").click(); document.getElementById("heroActionReads").click(); typeof openAreaSearchFromShopsEmpty === "function" && openAreaSearchFromShopsEmpty(); true`); await sleep(600);
    const ga = await heroGa(p);
    const cb = await p.ev(`window.__ga.filter((e) => e[0] === "community_board_view").length`);
    t("1c ほかの導線が内部で押した時(プログラムの click)は hero_action_click を送らない(既存の community_board_view は送る)", ga.length === 0 && cb >= 2, { ga, cb });
    await p.close();
  }
  {
    const p = await openAt("/", { geo: NAHA, lang: "en" });
    await tap(p, "#heroActionNearby", true);
    const ga = await heroGa(p);
    t("1d 英語でも同じ action の値(言語・位置・個人の情報を含まない)", ga.length === 1 && ga[0][1].action === "nearby" && !JSON.stringify(ga).match(/26\.|127\.|@|lang/), ga);
    await p.close();
  }

  // ---- 2. 版の表記
  {
    const left = ["index", "post", "end", "edit", "shop", "contribute", "column-list", "shop-guide", "town-now-post", "community-board-post", "contact", "404"].filter((f) => /Web Version|Version 1 MVP/.test(read(f + ".html")));
    t("2 利用者向けのページに「Web Version …」の表記が無い(管理者の画面は変えない)", left.length === 0 && read("admin.html").includes("マチナウ Web Version 1 MVP") && read("admin-post.html").includes("マチナウ Web Version 1.2"), left);
    for (const lang of ["ja", "en"]) {
      const p = await openAt("/", { lang });
      const f = await p.ev(`document.querySelector("footer").innerText`);
      t(`2b TOP のフッター(${lang})は名前だけ`, !/Version|MVP/.test(f) && f.includes(lang === "en" ? "Machinau" : "マチナウ"), f.slice(0, 120));
      await p.close();
    }
  }

  // ---- 3. 読みもの一覧
  const ARTICLES = [
    { slug: "eat-1", title: "那覇の朝ごはん", description: "朝7時から開いている食堂。", category: "食べる・飲む", publishedMonth: "2026-10", publishedDate: "2026年10月5日", imageUrl: "" },
    { slug: "walk-1", title: "国際通りの裏道", description: "一本入ると静かな道。", category: "街を歩く", publishedMonth: "2026-09", publishedDate: "2026年9月20日", imageUrl: "" },
  ];
  async function openList(lang, width) {
    const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: (url, ...rest) => (url.includes("publicListPublishedColumns") ? null : api(url, ...rest)), articles: ARTICLES, urlMock, initScripts: [langInit(lang)] } });
    await p.goto("/column-list.html"); await sleep(1200);
    return p;
  }
  for (const [lang, width] of [["en", 360], ["en", 390], ["en", 430], ["en", 1280], ["ja", 390]]) {
    const p = await openList(lang, width);
    const v = await p.ev(`(() => ({ lang: document.documentElement.lang, title: document.title, h1: document.querySelector("h1").textContent.trim(), labels: [...document.querySelectorAll("label")].map((l) => l.textContent.trim()), reset: document.getElementById("resetButton").textContent.trim(), months: [...document.getElementById("filterMonthInput").options].map((o) => o.textContent), cats: [...document.getElementById("filterCategoryInput").options].map((o) => o.textContent).slice(0, 4), catValues: [...document.getElementById("filterCategoryInput").options].map((o) => o.value).slice(0, 4), cards: [...document.querySelectorAll(".article-card")].map((a) => ({ href: a.getAttribute("href"), cat: (a.querySelector(".article-card-category") || {}).textContent, title: a.querySelector(".article-card-title").textContent })), note: document.getElementById("listLanguageNote").hidden ? "" : document.getElementById("listLanguageNote").textContent, back: document.querySelector(".back-link").textContent.trim(), noHScroll: document.documentElement.scrollWidth <= innerWidth + 1 }))()`);
    if (lang === "en") {
      t(`3 読みもの一覧(英語 ${width})：固定の文言・カテゴリー・年月は英語、絞り込みの値は日本語のまま、記事は ?lang=en で開く、題名は原文、案内あり、はみ出しなし`,
        v.lang === "en" && v.title === "Machinau Reads | Machinau" && v.h1 === "Find an article" && v.labels.join("|") === "Month published|Category" && v.reset === "Clear filters" &&
        v.months.join("|") === "All|October 2026|September 2026" && v.cats.join("|") === "All|Know the Town|Walk the Town|Eat & Drink" && v.catValues[3] === "食べる・飲む" &&
        v.cards.length === 2 && v.cards[0].href === "column/eat-1.html?lang=en" && v.cards[0].cat === "Eat & Drink" && v.cards[0].title === "那覇の朝ごはん" &&
        v.note.startsWith("Article titles and summaries") && v.back === "← Back to Machinau" && v.noHScroll, v);
      if (width === 390) {
        await p.ev(`document.getElementById("filterCategoryInput").value = "街を歩く"; document.getElementById("filterCategoryInput").dispatchEvent(new Event("change")); true`); await sleep(200);
        const f = await p.ev(`[...document.querySelectorAll(".article-card")].map((a) => a.getAttribute("href"))`);
        await p.ev(`document.getElementById("filterCategoryInput").value = "見る・遊ぶ"; document.getElementById("filterCategoryInput").dispatchEvent(new Event("change")); true`); await sleep(200);
        const none = await p.ev(`document.getElementById("articleList").textContent.trim()`);
        t("3b 英語でも絞り込みは同じ動き・該当なしの案内も英語", JSON.stringify(f) === '["column/walk-1.html?lang=en"]' && none === "No articles match these filters yet.", { f, none });
        t("3c 一覧のために翻訳を呼ばない(POST なし)", p.log.posts.length === 0, p.log.posts);
      }
    } else {
      t("3d 読みもの一覧(日本語)は従来どおり(文言・リンクに ?lang なし・案内なし)", v.lang === "ja" && v.h1 === "読みものを探す" && v.months.join("|") === "すべて|2026年10月|2026年9月" && v.cats[3] === "食べる・飲む" && v.cards[0].href === "column/eat-1.html" && v.note === "" && v.back === "← マチナウTOPへ戻る", v);
    }
    await p.close();
  }

  // ---- 3. 投稿の入口
  async function openContribute(lang, width) {
    const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: api, articles: [], urlMock, initScripts: [langInit(lang)] } });
    await p.goto("/contribute.html"); await sleep(900);
    return p;
  }
  const JP = /[\u3040-\u30ff\u4e00-\u9fff]/;
  for (const [lang, width] of [["en", 360], ["en", 390], ["en", 430], ["en", 1280], ["ja", 390]]) {
    const p = await openContribute(lang, width);
    const v = await p.ev(`(() => ({ lang: document.documentElement.lang, title: document.title, h1: document.querySelector("h1").textContent.trim(), text: document.body.innerText, links: [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")), leadBr: document.querySelector("[data-i18n-lines=contribute_lead]").querySelectorAll("br").length, noHScroll: document.documentElement.scrollWidth <= innerWidth + 1 }))()`);
    if (lang === "en") {
      const jpLines = v.text.split("\n").filter((l) => JP.test(l));
      t(`3e 投稿の入口(英語 ${width})：画面に日本語が残らない・料金は訳さず日本語のページへ案内・リンク先は同じ・はみ出しなし`,
        v.lang === "en" && v.title === "Found something in town? | Machinau" && v.h1 === "Found something in town?" && jpLines.length === 0 && v.leadBr === 1 &&
        v.text.includes("Details and fees are explained on the next page (in Japanese).") && !/100/.test(v.text) &&
        JSON.stringify(v.links) === JSON.stringify(["index.html", "post.html?mode=street", "town-now-post.html", "shop.html", "terms.html", "privacy.html", "index.html"]) && v.noHScroll, { jpLines, links: v.links });
    } else {
      t("3f 投稿の入口(日本語)は従来どおり", v.lang === "ja" && v.h1 === "この街で、何か見つけた？" && v.text.includes("1投稿100円・税込") && v.leadBr === 1, v.h1);
    }
    await p.close();
  }
  {
    // 記事の取得に失敗した時も、英語の選択肢・案内は英語のまま。
    const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: (url, ...rest) => (url.includes("publicListPublishedColumns") ? null : api(url, ...rest)), articles: [], columnFail: true, urlMock, initScripts: [langInit("en")] } });
    await p.goto("/column-list.html"); await sleep(1000);
    const v = await p.ev(`({ months: [...document.getElementById("filterMonthInput").options].map((o) => o.textContent), msg: document.getElementById("articleList").textContent.trim() })`);
    t("3g 読みもの一覧(英語)：取得に失敗した時も選択肢と案内は英語", v.months.join("|") === "All" && v.msg === "We couldn't load the articles. Please try again later.", v);
    await p.close();
  }
  t("4 翻訳の API は呼ばない・想定外の外部通信なし", calls.translation === 0 && calls.other === 0, calls);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
