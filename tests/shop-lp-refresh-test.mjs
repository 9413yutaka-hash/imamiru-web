// 2026-11-08 TOP店舗カード＋LP級店舗ページの刷新(代表承認)。
// A. 店舗ページ(/shop/{storeId})：写真が主役のファーストビュー・すぐ下の操作・今日の営業時間・写真の配信幅・共有・
//    英語の表示(保存済みの紹介文の訳だけを使う・原文が変わった訳は使わない・住所の案内・翻訳 API を呼ばない)。
// B. TOP の店舗カード(Chrome、360/390/430px・英語)：見出しの位置・距離・ラベル・♡・詳細・並び順・重複なし。
// C. 店主が編集画面で紹介文と写真の順番を変えて保存 → 旅行者向けの店舗ページ・TOP に反映される。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// OpenAI Moderation and translation are local stubs (counted), Google Maps is a shim. No real services, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/shop-lp-refresh-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8941;
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
const PG = await import(REPO_URL + "/api/_lib/store-page.js");
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

const hasOnlyLdScript = (html) => (html.match(/<script/g) || []).length === 1 && html.includes('<script type="application/ld+json">');

// ===== A. 店舗ページ =====
{
  const ja = await page("S1");
  const h = ja.html;
  t("A1 ファーストビュー：1枚目の写真(配信幅1200・先に読み込む)の上に種類・地域と店名(h1)", ja.code === 200 && /<div class="hero"><img src="https:\/\/res\.cloudinary\.com\/cdhyctnp\/image\/upload\/f_auto,q_auto,c_limit,w_1200\/v1\/machinau_store_profiles\/S1\/p1\.webp"[^>]*fetchpriority="high"/.test(h) && h.includes('<p class="eyebrow">カフェ・スイーツ・沖縄県那覇市</p><h1>海辺のカフェ</h1>'), h.slice(h.indexOf("<main"), h.indexOf("<main") + 600));
  t("A2 OGP・構造化データの画像は保存済みの URL のまま(変換しない)", h.includes('<meta property="og:image" content="' + CLD + 'v1/machinau_store_profiles/S1/p1.webp">') && h.includes('"image":["' + CLD + "v1/machinau_store_profiles/S1/p1.webp"));
  const quick = [...h.matchAll(/data-quick="([a-z]+)"/g)].map((m) => m[1]);
  t("A3 すぐ下の操作：地図(Google マップ)・電話(tel:)・予約(新しいタブ)・共有(#share)", JSON.stringify(quick) === JSON.stringify(["map", "phone", "reservation", "share"]) && h.includes('href="tel:0981234567" data-quick="phone"') && /href="https:\/\/reserve\.example\.com\/umibe" target="_blank" rel="noopener noreferrer nofollow" data-quick="reservation"/.test(h) && h.includes('href="#share" data-quick="share"'), quick);
  t("A4 写真：2枚目以降を横に送る欄(配信幅900・遅延読み込み)", (h.match(/<div class="gallery">/g) || []).length === 1 && h.includes("f_auto,q_auto,c_limit,w_900/v1/machinau_store_profiles/S1/p2.webp\" alt=\"海辺のカフェの写真2\" loading=\"lazy\"") && h.includes("/S1/p3.webp\" alt=\"海辺のカフェの写真3\" loading=\"lazy\""));
  t("A5 メニューの写真は配信幅300・店名・説明はエスケープ", h.includes("f_auto,q_auto,c_limit,w_300/v1/machinau_store_profiles/S1/menu/m1.webp") && h.includes("&lt;b&gt;ぜんざい&lt;/b&gt;") && !h.includes("<b>ぜんざい</b>") && h.includes("インスタ&lt;script&gt;"));
  t("A6 共有：固定の URL を表示・LINE と X の共有の画面へのリンク(URL はエンコード)", h.includes('<code class="share-url">https://machinau.jp/shop/S1</code>') && h.includes('href="https://social-plugins.line.me/lineit/share?url=https%3A%2F%2Fmachinau.jp%2Fshop%2FS1"') && h.includes('href="https://twitter.com/intent/tweet?url=https%3A%2F%2Fmachinau.jp%2Fshop%2FS1&amp;text=') && h.includes('id="share"'));
  t("A7 スクリプトは構造化データだけ(画面のスクリプトなし)・有料の追加リンクは連絡先と同じボタンの並び", hasOnlyLdScript(h) && /<ul class="contact">[\s\S]*data-contact="link"/.test(h) && !h.includes('<ul class="links">'));
  t("A8 日本語の表示では訳を使わない・住所の英語の案内なし", !h.includes(DESC_EN) && h.includes(DESC) && !h.includes("Address (in Japanese)"));

  const en = await page("S1", "en");
  const e = en.html;
  t("A9 英語：紹介文は保存済みの自動翻訳(原文と一致)・訳の案内を添える", en.code === 200 && e.includes('<p class="text lead">' + DESC_EN + "</p>") && e.includes("Automatically translated from Japanese.") && !e.includes('<p class="text lead" lang="ja">'));
  t("A10 英語：住所は日本語のまま「Address (in Japanese)」の案内付き・ストーリーとメニューは原文(lang=ja)", e.includes('<span class="address-note">Address (in Japanese)</span><p class="text" lang="ja">日本、〒900-0013') && e.includes('<div class="story"><p class="text" lang="ja">祖母が始めた店です。') && e.includes('<ul class="menu" lang="ja">'));
  t("A11 英語：見出し・操作は英語(Map・Call・Book・Share)", ["About", "Photos", "Our story", "Menu &amp; products", "Opening hours", "Location", "Shop information", "Share this page"].every((x) => e.includes("<h2>" + x + "</h2>")) && ["Map", "Call", "Book", "Share"].every((x) => e.includes("</svg>" + x + "</a>")));

  // 原文を変えた(訳が古い)時は訳を使わない
  S.docs.get("storeProfiles/S1").description = DESC + "（変更）";
  S.docs.get("storeProfiles/S1").moderatedText = DESC + "（変更）\n月曜は早じまい";
  const stale = (await page("S1", "en")).html;
  t("A12 英語：原文が変わった後の古い訳は出さず、原文(lang=ja)を表示", !stale.includes(DESC_EN) && stale.includes('<p class="text lead" lang="ja">' + DESC + "（変更）</p>") && !stale.includes("Automatically translated"));
  S.docs.get("storeProfiles/S1").description = DESC;
  S.docs.get("storeProfiles/S1").moderatedText = DESC + "\n月曜は早じまい";
  t("A13 店舗ページの表示で翻訳の API を呼ばない(訳を作らない)・外部への通信なし", calls.translation === 0 && calls.other === 0, calls);

  // 今日の営業時間(日本時間)。2026-11-11 は水曜(定休日)、2026-11-14 は土曜(24時間)。
  const store = { storeName: "店", categoryCode: "gourmet", description: "紹介", location: { prefecture: "沖縄県", city: "那覇市", formattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.6 }, photos: [], businessHours: { weekly: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [{ open: "00:00", close: "24:00" }], sun: [{ open: "10:00", close: "18:00" }] } }, paymentMethodCodes: [], featureCodes: [], contact: {} };
  const wed = PG.buildStorePageHtml("X1", store, null, "ja", { nowMillis: Date.parse("2026-11-11T12:00:00+09:00") });
  const sat = PG.buildStorePageHtml("X1", store, null, "ja", { nowMillis: Date.parse("2026-11-13T23:30:00+09:00") + 3600000 });
  t("A14 今日の営業時間：日本時間の曜日(水曜は定休日・土曜は24時間)・表の今日の行に印", wed.includes('<span class="label">今日の営業時間</span><strong>定休日</strong>') && /<tr class="today" aria-current="date"><th scope="row">水曜日 <span class="today-mark">今日<\/span>/.test(wed) && sat.includes("<strong>24時間</strong>") && /<tr class="today" aria-current="date"><th scope="row">土曜日/.test(sat));
  t("A15 写真の無い店舗：写真なしのファーストビュー(店名・種類)・写真の欄なし・電話も予約も無ければ操作は地図と共有だけ", wed.includes('<div class="hero no-photo"><div class="hero-text"><p class="eyebrow">グルメ・沖縄県那覇市</p><h1>店</h1>') && !wed.includes('class="gallery"') && JSON.stringify([...wed.matchAll(/data-quick="([a-z]+)"/g)].map((m) => m[1])) === JSON.stringify(["map", "share"]));
  const noHours = PG.buildStorePageHtml("X1", { ...store, businessHours: null }, null, "ja");
  t("A16 営業時間の登録が無い店舗は今日の営業時間・営業時間の欄を出さない", !noHours.includes("今日の営業時間") && !noHours.includes('class="hours"'));
}

// ===== B・C. Chrome =====
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
const CARDS = `(() => {
  const vis = (e) => !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
  return [...document.querySelectorAll("#shopsList .shop-card")].map((c) => {
    const r = c.getBoundingClientRect(); const v = c.querySelector(".shop-visual").getBoundingClientRect();
    const name = c.querySelector(".shop-name"); const hl = c.querySelector(".shop-headline"); const dist = c.querySelector(".info-chip-distance"); const label = c.querySelector(".user-post-badge");
    return { id: c.dataset.shopId, w: Math.round(r.width), photoH: Math.round(v.height), overflow: c.scrollWidth > c.clientWidth + 1,
      eventBadge: !!c.querySelector(".event-badge"), headline: hl ? hl.textContent.trim() : null, headlineBelowName: !!hl && hl.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1,
      distance: vis(dist) ? dist.textContent.replace(/\\s+/g, " ").trim() : null, label: vis(label) ? label.textContent.trim() : null,
      labelAbove: vis(dist) && vis(label) ? label.getBoundingClientRect().bottom <= dist.getBoundingClientRect().top + 1 && label.getBoundingClientRect().right <= r.right - 8 && label.getBoundingClientRect().height < 22 : null,
      bottomGap: vis(dist) ? Math.round(r.bottom - dist.getBoundingClientRect().bottom) : null,
      hidden: [".shop-description", ".shop-actions", ".time-limit"].filter((s) => vis(c.querySelector(s))) };
  });
})()`;

try {
  for (const width of [360, 390, 430]) {
    const p = await openTop("ja", width);
    const cards = await p.ev(CARDS);
    const listW = await p.ev(`document.getElementById("shopsList").clientWidth`);
    const s1 = cards.find((c) => c.id === "sp_S1"); const l2 = cards.find((c) => c.id === "L2");
    t(`B1 ${width}px：並び順・件数は今までどおり(距離順・15km の外の L3 は出さない・引き継がれた L1 は S1 に置き換わり重複しない)`, JSON.stringify(cards.map((c) => c.id)) === JSON.stringify(["sp_S1", "L2"]), cards.map((c) => c.id));
    t(`B2 ${width}px：横に2枚＋次の端(カードの幅＝(一覧の幅−34)/2)・写真の枠176px・はみ出しなし`, cards.every((c) => Math.abs(c.w - (listW - 34) / 2) <= 1.5 && c.photoH === 176 && !c.overflow), { listW, cards });
    t(`B3 ${width}px：運営掲載の見出しは写真の上ではなく店名の下に1行(⚡なし)・店主の店舗は見出しなし`, !l2.eventBadge && l2.headline === "ぜんざいとコーヒー" && l2.headlineBelowName && !s1.eventBadge && s1.headline === null, { l2, s1 });
    t(`B4 ${width}px：最下段にラベル(店舗広告・店舗が管理・1行)、その下に距離・本文の補足と操作のボタンは出さない`, l2.label === "店舗広告" && s1.label === "店舗が管理" && /^📍 \d+m$/.test(l2.distance) && /^📍 \d+m$/.test(s1.distance) && l2.labelAbove && s1.labelAbove && cards.every((c) => c.hidden.length === 0 && c.bottomGap <= 14), cards);
    if (width === 390) {
      const fav = await p.ev(`(async () => { document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .favorite-button').click(); await new Promise((r) => setTimeout(r, 400)); return document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .favorite-button').classList.contains("active"); })()`);
      t("B5 ♡：押すとお気に入りになる(カードの詳細は開かない)", fav === true && (await p.ev(`getComputedStyle(document.getElementById("shopModal")).display === "none" || !document.getElementById("shopModal").classList.contains("active")`)), fav);
      await p.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="sp_S1"] .shop-name').click(); true`); await sleep(800);
      const m = await p.ev(`({ title: document.querySelector("#shopModal .modal-title").textContent.trim(), page: !!document.querySelector('#shopModal a[href="/shop/S1"], #shopModal [onclick*="/shop/S1"]') || document.getElementById("shopModal").innerText.includes("お店のページを見る") })`);
      t("B6 カードを押すと詳細(店名・お店のページへの導線)", m.title === "海辺のカフェ" && m.page, m);
    }
    t(`B7 ${width}px：JavaScript のエラーなし`, p.log.errors.length === 0, p.log.errors);
    await p.close();
  }
  const en = await openTop("en", 390);
  const ec = await en.ev(CARDS);
  t("B8 英語：ラベルは英語(Shop advertisement・Managed by the business)が1行で距離の上に入る・店名は原文・はみ出しなし", ec.find((c) => c.id === "L2").label === "Shop advertisement" && ec.find((c) => c.id === "sp_S1").label === "Managed by the business" && ec.every((c) => !c.overflow && c.labelAbove) && (await en.ev(`document.querySelector('#shopsList [data-shop-id="sp_S1"] .shop-name').textContent.trim()`)) === "海辺のカフェ", ec);
  await en.close();
  const pc = await openTop("ja", 1280);
  const pcc = await pc.ev(`[...document.querySelectorAll("#shopsList .shop-card")].map((c) => ({ id: c.dataset.shopId, photoH: Math.round(c.querySelector(".shop-visual").getBoundingClientRect().height), actions: getComputedStyle(c.querySelector(".shop-actions")).display !== "none", headline: (c.querySelector(".shop-headline") || {}).textContent || null }))`);
  t("B9 PC(1280px)：写真の枠220px・詳細と地図のボタンは今までどおり・見出しは店名の下", pcc.length === 2 && pcc.every((c) => c.photoH === 220 && c.actions) && pcc.find((c) => c.id === "L2").headline === "ぜんざいとコーヒー", pcc);
  await pc.close();

  // ===== C. 店主の編集 → 店舗ページ・TOP に反映 =====
  const ed = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, urlMock, initScripts: [fakeStoreAuth, langInit("ja")] } });
  await ed.goto("/store-profile.html?store=S1");
  await ed.waitFor(`!document.getElementById("editorArea").hidden && document.querySelectorAll("#photoGrid .photo-card").length === 3 && !document.getElementById("saveButton").disabled`, 20000); await sleep(300);
  const NEW_DESC = "朝8時から営業。窓から海が見える席が人気です。";
  await ed.ev(`(() => { const d = document.getElementById("descriptionInput"); d.value = ${JSON.stringify(NEW_DESC)}; d.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector('[data-photo-action="main"][data-photo-index="2"]').click(); return true; })()`);
  await sleep(200);
  await ed.ev(`document.getElementById("saveButton").click(); true`);
  const saved = await (async () => { for (let i = 0; i < 60; i++) { const d = S.docs.get("storeProfiles/S1"); if (d.description === NEW_DESC) return d; await sleep(250); } return S.docs.get("storeProfiles/S1"); })();
  t("C1 編集画面：紹介文を書き換え、3枚目を「メイン」にして保存 → 公開中のまま内容が更新される", saved.description === NEW_DESC && saved.status === "published" && saved.photos.map((x) => x.publicId.split("/").pop()).join(",") === "p3,p1,p2" && ed.log.errors.length === 0, { d: saved.description, s: saved.status, photos: saved.photos.map((x) => x.publicId), err: ed.log.errors });
  await ed.close();
  const sp = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { urlMock } });
  await sp.goto("/shop/S1"); await sleep(800);
  const v = await sp.ev(`({ hero: document.querySelector(".hero img").getAttribute("src"), lead: document.querySelector(".lead").textContent, noHScroll: document.documentElement.scrollWidth <= innerWidth + 1, firstScreen: (() => { const q = document.querySelector("nav.quick").getBoundingClientRect(); return q.bottom <= innerHeight; })() })`);
  t("C2 旅行者の店舗ページ：新しい紹介文・新しいメイン写真(3枚目)・操作が最初の画面に収まる・はみ出しなし", v.lead === NEW_DESC && /\/S1\/p3\.webp$/.test(v.hero) && v.firstScreen && v.noHScroll, v);
  await sp.goto("/shop/S1?lang=en"); await sleep(500);
  const ve = await sp.ev(`({ lead: document.querySelector(".lead").textContent, lang: document.querySelector(".lead").getAttribute("lang"), note: document.body.innerText.includes("Automatically translated") })`);
  t("C3 英語：原文が変わったので古い訳は出さず、新しい原文(lang=ja)を表示(次に TOP で訳されるまで)", ve.lead === NEW_DESC && ve.lang === "ja" && !ve.note, ve);
  t("C4 店舗ページ：JavaScript のエラーなし", sp.log.errors.length === 0, sp.log.errors);
  await sp.close();
  const top = await openTop("ja", 390);
  const topImg = await top.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="sp_S1"] .shop-visual img').getAttribute("src")`);
  t("C5 TOP のカードの写真も新しいメイン写真(3枚目)", /\/S1\/p3\.webp$/.test(topImg), topImg);
  await top.close();
  t("C6 翻訳の API は呼ばない・想定外の外部通信なし(Moderation は保存の審査だけ)", calls.translation === 0 && calls.other === 0 && calls.moderation >= 1, calls);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
