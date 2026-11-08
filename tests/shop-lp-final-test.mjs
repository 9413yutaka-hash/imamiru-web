// 2026-11-08 有料店舗LP 最終完成工程(代表指示)。shop-lp-refresh-test.mjs で見ていない所を確かめる。
// D. 店主の編集画面：360/390/430px・PC(1280px)・英語で、横にはみ出さない・保存のボタンが画面の幅に収まる・エラーなし。
// E. 店主が営業時間・電話・ストーリー・メニュー・追加リンクを編集して保存 → 旅行者の店舗ページ(日英)と TOP の詳細に反映される。
// F. 旅行者の店舗ページ：360/390/430px・PC・英語で、店名と操作の帯が重ならない・操作が最初の画面に収まる・押せる大きさ・はみ出しなし。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// OpenAI Moderation and translation are local stubs (counted), Google Maps is a shim. No real services, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/shop-lp-final-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8945;
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

const openEditor = async (width, lang) => {
  const ed = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: api, urlMock, initScripts: [fakeStoreAuth, langInit(lang)] } });
  await ed.goto("/store-profile.html?store=S1");
  await ed.waitFor(`!document.getElementById("editorArea").hidden && document.querySelectorAll("#photoGrid .photo-card").length === 3 && !document.getElementById("saveButton").disabled && !document.getElementById("customSection").hidden && document.getElementById("customStoryInput").value !== "" && !document.getElementById("customSaveButton").disabled`, 20000);
  await sleep(300);
  return ed;
};
const waitDoc = async (key, ok) => { for (let i = 0; i < 80; i++) { const d = S.docs.get(key); if (d && ok(d)) return d; await sleep(250); } return S.docs.get(key); };
// 画面の幅を超えて表示されている要素(横に送る枠の中は除く)。
const WIDE = `(() => {
  const vw = document.documentElement.clientWidth;
  const inScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
  return [...document.body.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && (r.right > vw + 1 || r.left < -1) && !inScroller(e); })
    .slice(0, 6).map((e) => e.tagName + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""));
})()`;

try {
  // ===== D. 店主の編集画面の幅 =====
  for (const [width, lang] of [[360, "ja"], [390, "ja"], [430, "ja"], [1280, "ja"], [360, "en"]]) {
    const ed = await openEditor(width, lang);
    const v = await ed.ev(`(() => {
      const vw = document.documentElement.clientWidth;
      const inside = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= vw + 1 && r.height >= 44; };
      return { noHScroll: document.documentElement.scrollWidth <= vw + 1, wide: ${WIDE}, save: inside("saveButton"), customSave: inside("customSaveButton"),
        menuRows: document.querySelectorAll("#customMenuList .custom-item").length, links: document.querySelectorAll("#customLinkRows .custom-link-row").length, days: document.querySelectorAll("#dayRows .day-row").length };
    })()`);
    t(`D ${width}px ${lang}：編集画面は横にはみ出さない・保存のボタン2つが画面の幅に収まり押せる大きさ・営業時間7日・商品1・リンク1を表示・エラーなし`,
      v.noHScroll && v.wide.length === 0 && v.save && v.customSave && v.days === 7 && v.menuRows === 1 && v.links === 1 && ed.log.errors.length === 0, { ...v, err: ed.log.errors });
    await ed.close();
  }

  // ===== E. 編集 → 旅行者の画面に反映 =====
  const ed = await openEditor(390, "ja");
  const NEW_PHONE = "098-765-4321";
  await ed.ev(`(() => {
    const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
    const wed = document.querySelector('.day-row[data-day="wed"]');
    const closed = wed.querySelector(".day-closed"); closed.checked = false; fire(closed, "change");
    const open = wed.querySelector(".range-open"), close = wed.querySelector(".range-close");
    open.value = "11:00"; fire(open, "input"); fire(open, "change"); close.value = "20:00"; fire(close, "input"); fire(close, "change");
    const phone = document.getElementById("phoneInput"); phone.value = ${JSON.stringify(NEW_PHONE)}; fire(phone, "input");
    return true;
  })()`);
  await sleep(200);
  await ed.ev(`document.getElementById("saveButton").click(); true`);
  const prof = await waitDoc("storeProfiles/S1", (d) => d.phone === NEW_PHONE);
  t("E1 編集画面：水曜を定休日→11:00〜20:00、電話番号を変更して保存 → 公開中のまま更新", prof.phone === NEW_PHONE && prof.status === "published" && JSON.stringify(prof.businessHours.weekly.wed) === JSON.stringify([{ open: "11:00", close: "20:00" }]) && ed.log.errors.length === 0, { phone: prof.phone, wed: prof.businessHours && prof.businessHours.weekly.wed, s: prof.status, err: ed.log.errors });

  const NEW_STORY = "祖母の味を三代で守っています。黒糖は多良間島から。";
  await ed.waitFor(`!document.getElementById("customSaveButton").disabled`, 10000);
  await ed.ev(`(() => {
    const fire = (el) => el.dispatchEvent(new Event("input", { bubbles: true }));
    const s = document.getElementById("customStoryInput"); s.value = ${JSON.stringify(NEW_STORY)}; fire(s);
    const n = document.querySelector('[data-custom-field="name"][data-custom-index="0"]'); n.value = "黒糖ぜんざい"; fire(n);
    const p = document.querySelector('[data-custom-field="priceText"][data-custom-index="0"]'); p.value = "¥600"; fire(p);
    const l = document.querySelector('[data-custom-link-field="label"][data-custom-index="0"]'); l.value = "公式インスタ"; fire(l);
    document.getElementById("customSaveButton").click();
    return true;
  })()`);
  const cus = await waitDoc("storeCustomProfiles/S1", (d) => d.story === NEW_STORY);
  t("E2 編集画面：ストーリー・商品名と価格・リンク名を変更して保存 → 店舗カードの内容が更新(審査は通過)", cus.story === NEW_STORY && cus.menuItems[0].name === "黒糖ぜんざい" && cus.menuItems[0].priceText === "¥600" && !!cus.menuItems[0].photo && cus.links[0].label === "公式インスタ" && cus.moderationStatus === "passed" && ed.log.errors.length === 0, { story: cus.story, menu: cus.menuItems, links: cus.links, m: cus.moderationStatus, err: ed.log.errors });
  await ed.close();

  const sp = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { urlMock } });
  await sp.goto("/shop/S1"); await sleep(800);
  const pv = await sp.ev(`(() => {
    const sec = (h) => { const s = [...document.querySelectorAll("section")].find((x) => (x.querySelector("h2") || {}).textContent === h); return s ? s.innerText : ""; };
    return { story: sec("こだわり・ストーリー"), menu: sec("メニュー・商品"), hours: sec("営業時間"), tel: [...document.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute("href")),
      link: [...document.querySelectorAll('[data-contact="link"]')].map((a) => a.textContent.trim()).join("|"), sections: [...document.querySelectorAll("section h2")].map((h) => h.textContent) };
  })()`);
  t("E3 店舗ページ：新しいストーリー・商品名と価格・水曜 11:00〜20:00(定休日の表示が消える)・新しい電話番号・新しいリンク名",
    pv.story.includes(NEW_STORY) && pv.menu.includes("黒糖ぜんざい") && pv.menu.includes("¥600") && /11:00/.test(pv.hours) && /20:00/.test(pv.hours) && !pv.hours.includes("定休") && pv.tel.length >= 1 && pv.tel.every((h) => h === "tel:" + NEW_PHONE.replace(/-/g, "") || h === "tel:" + NEW_PHONE) && pv.link.includes("公式インスタ"), pv);
  await sp.goto("/shop/S1?lang=en"); await sleep(500);
  const pe = await sp.ev(`(() => { const s = [...document.querySelectorAll("section")].find((x) => /story/i.test((x.querySelector("h2") || {}).textContent || "")); const p = s && s.querySelector("[lang=ja]"); return { story: p ? p.textContent : "", hasStorySection: !!s, hours: document.body.innerText.includes("11:00") }; })()`);
  t("E4 英語の店舗ページ：ストーリーは日本語の原文(lang=ja)で表示・営業時間も反映(翻訳 API は呼ばない)", pe.hasStorySection && pe.story.includes(NEW_STORY) && pe.hours && calls.translation === 0, pe);
  t("E5 店舗ページ：JavaScript のエラーなし", sp.log.errors.length === 0, sp.log.errors);
  await sp.close();

  const top = await openTop("ja", 390);
  await top.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="sp_S1"] .shop-name').click(); true`); await sleep(900);
  const mt = await top.ev(`document.getElementById("shopModal").innerText`);
  const topCards = await top.ev(`[...document.querySelectorAll("#shopsList .shop-card")].map((c) => c.dataset.shopId)`);
  t("E6 TOP の詳細：新しいストーリーと商品名を表示・カードの並びは変わらない(S1 → L2、L1 は重複しない)", mt.includes(NEW_STORY) && mt.includes("黒糖ぜんざい") && JSON.stringify(topCards) === JSON.stringify(["sp_S1", "L2"]), { topCards, modalHas: [mt.includes(NEW_STORY), mt.includes("黒糖ぜんざい")] });
  t("E7 TOP：JavaScript のエラーなし", top.log.errors.length === 0, top.log.errors);
  await top.close();

  // ===== F. 旅行者の店舗ページの幅 =====
  for (const [width, lang] of [[360, "ja"], [390, "ja"], [430, "ja"], [1280, "ja"], [360, "en"], [1280, "en"]]) {
    const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { urlMock } });
    await p.goto("/shop/S1" + (lang === "en" ? "?lang=en" : "")); await sleep(700);
    const v = await p.ev(`(() => {
      const vw = document.documentElement.clientWidth, vh = innerHeight;
      const hero = document.querySelector(".hero").getBoundingClientRect(), h1 = document.querySelector(".hero h1").getBoundingClientRect(), q = document.querySelector("nav.quick").getBoundingClientRect();
      const qa = [...document.querySelectorAll("nav.quick a")].map((a) => a.getBoundingClientRect());
      const header = document.querySelector("header.site").getBoundingClientRect();
      return { noHScroll: document.documentElement.scrollWidth <= vw + 1, wide: ${WIDE}, heroH: Math.round(hero.height), h1InHero: h1.top >= hero.top && h1.bottom <= hero.bottom + 1 && h1.top >= header.bottom - 1,
        noOverlap: h1.bottom <= q.top + 1, firstScreen: q.bottom <= vh, quick: qa.length, tap: qa.every((r) => r.height >= 44 && r.width >= 44), quickInside: qa.every((r) => r.left >= -1 && r.right <= vw + 1),
        imgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length };
    })()`);
    t(`F ${width}px ${lang}：店名は写真の中で操作の帯と重ならない・操作4つは最初の画面に収まり押せる大きさ・横にはみ出さない・エラーなし`,
      v.noHScroll && v.wide.length === 0 && v.heroH >= 200 && v.h1InHero && v.noOverlap && v.firstScreen && v.quick === 4 && v.tap && v.quickInside && v.imgs === 0 && p.log.errors.length === 0, { ...v, err: p.log.errors });
    await p.close();
  }
  t("G 翻訳の API は呼ばない・想定外の外部通信なし", calls.translation === 0 && calls.other === 0, calls);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
