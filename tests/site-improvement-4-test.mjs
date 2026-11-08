// 2026-11-08 サイト全体改善 第4弾(代表承認)。投稿フォーム・お問い合わせの英語と、読みもの一覧の保存済みの英語の題名。
// 1. 街で見つけた(post.html)・街の今スレッド・掲示板・お問い合わせは TOP の言語を引き継ぎ、英語では固定の文言・入力の案内・
//    エラー・送信結果・サーバーが返すメッセージを英語で出す(日本語は従来どおり)。送信先・送る項目は変えない。
// 2. 読みもの一覧の API は、保存済みで今の原文と一致する英語の題名・紹介文だけを返す(翻訳の生成・呼び出しはしない)。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// run: node --import ./tests/mockfa-occ/register.mjs tests/site-improvement-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8953;
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
  const { createHash } = await import("node:crypto");
  const hash = (title, description) => createHash("sha256").update(JSON.stringify({ title, description }), "utf8").digest("hex");
  const JP = /[\u3040-\u30ff\u4e00-\u9fff]/;
  // ---- 投稿フォームの送信の応答(試験ごとに差し替える)
  const replies = {};
  const formApi = async (url, method, log, postData, headers) => {
    if (method === "POST") {
      let mode = ""; try { mode = JSON.parse(postData || "{}").mode || ""; } catch {}
      if (replies[mode]) { log.posts.push(mode); const r = replies[mode].shift(); return { status: r.status, body: r.body }; }
    }
    return api(url, method, log, postData, headers);
  };
  // 匿名ログイン済みの状態(送信の手前まで)。本物の認証の通信は lib-auth が遮断する。
  const SIGNED_IN = `(() => { const a = firebase.auth(); Object.defineProperty(a, "currentUser", { configurable: true, get: () => ({ getIdToken: async () => "anon-token" }) }); return true; })()`;
  async function openForm(path, lang, width = 390, extra = []) {
    const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 701, state: { apiMock: formApi, articles: [], urlMock, initScripts: [langInit(lang), MAPS_SHIM, ...extra], blockUrls: ["maps.googleapis.com/maps/api/js"] } });
    await p.goto(path); await sleep(1200);
    return p;
  }
  const visibleJapanese = (p) => p.ev(`(() => { const out = []; const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) { const t = c.textContent.replace(/\\s+/g, " ").trim(); const el = c.parentElement; if (!t || !/[\\u3040-\\u30ff\\u4e00-\\u9fff]/.test(t) || !el || el.closest("script,style,noscript,option[value]:not([value=''])")) continue; const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || el.getBoundingClientRect().height === 0) continue; out.push(t.slice(0, 40)); } else if (c.nodeType === 1) walk(c); } }; walk(document.body); [...document.querySelectorAll("input[placeholder],textarea[placeholder]")].forEach((e) => { if (/[\\u3040-\\u30ff\\u4e00-\\u9fff]/.test(e.placeholder) && e.getBoundingClientRect().height > 0) out.push("placeholder:" + e.placeholder.slice(0, 30)); }); return out; })()`);

  // ===== 1. 英語の表示(日本語が画面に残らない)・日本語は従来どおり =====
  const PAGES = [
    ["/post.html", "post", "Share what's happening | Machinau", "今の情報を投稿する｜マチナウ", `document.getElementById("postModeStreetButton").click(); true`],
    ["/town-now-post.html", "townnow", "Town Now Threads | Machinau", "街の今スレッド｜マチナウ", `document.getElementById("choosePlaceButton").click(); true`],
    ["/community-board-post.html", "board", "Post to the Community Board | Machinau", "街の掲示板投稿｜マチナウ", null],
    ["/contact.html", "contact", "Contact & Feedback | Machinau", "お問い合わせ・ご意見｜マチナウ", null],
  ];
  for (const [path, name, enTitle, jaTitle, act] of PAGES) {
    for (const width of [360, 390, 430, 1280]) {
      const p = await openForm(path, "en", width);
      if (act) { await p.ev(act); await sleep(400); }
      const jp = await visibleJapanese(p);
      const v = await p.ev(`({ lang: document.documentElement.lang, title: document.title, noHScroll: document.documentElement.scrollWidth <= innerWidth + 1 })`);
      t(`1 ${name} 英語 ${width}：題名・本文・入力の案内に日本語なし(都道府県名などのデータを除く)・はみ出しなし・エラーなし`, v.lang === "en" && v.title === enTitle && jp.length === 0 && v.noHScroll && p.log.errors.length === 0, { jp, v, err: p.log.errors });
      await p.close();
    }
    const q = await openForm(path, "ja", 390);
    if (act) { await q.ev(act); await sleep(400); }
    const v = await q.ev(`({ lang: document.documentElement.lang, title: document.title, attrs: document.querySelectorAll("[data-i18n],[data-i18n-lines],[data-i18n-placeholder]").length, text: document.body.innerText.slice(0, 2000) })`);
    t(`1b ${name} 日本語は従来どおり(題名・文言)`, v.lang === "ja" && v.title === jaTitle && v.attrs > 5 && JP.test(v.text) && !/Machinau Reads|Required|Optional/.test(v.text), { title: v.title });
    await q.close();
  }

  // ===== 2. 街で見つけた(post.html)：入力のエラー・サーバーのメッセージ =====
  {
    const p = await openForm("/post.html", "en");
    await p.ev(`document.getElementById("postModeStreetButton").click(); true`); await sleep(300);
    const label = await p.ev(`({ selected: document.getElementById("postModeSelectedLabel").textContent, name: document.getElementById("shopNameLabelText").textContent, ph: document.getElementById("shopName").placeholder, content: document.getElementById("contentLabelText").textContent, durations: [...document.querySelectorAll("#durationHours option")].map((o) => o.value + "=" + o.textContent.trim()) })`);
    t("2 街で見つけた：選んだ表示・入力欄の名前と例・掲載時間の選択肢が英語(値は 3・6・12・24 のまま)", label.selected === "Selected: Spotted in town!" && label.name === "What did you find?" && label.ph === "e.g. Beautiful hibiscus" && label.content === "A few words" && label.durations.join("|") === "=Please choose|3=3 hours|6=6 hours|12=12 hours|24=24 hours (the rest of today)", label);
    await p.ev(`document.getElementById("submissionForm").dispatchEvent(new Event("submit", { cancelable: true })); true`); await sleep(500);
    const msg = await p.ev(`document.getElementById("messageBox").innerText`);
    t("2b 空のまま送ると、確認の案内と各項目のエラーが英語", msg.includes("Please check the following:") && msg.includes("Please enter a name.") && msg.includes("Please enter the details.") && !JP.test(msg), msg);
    await p.ev(`document.getElementById("content").value = "abc"; document.getElementById("content").dispatchEvent(new Event("input")); true`); await sleep(200);
    t("2c 文字数の表示も英語", (await p.ev(`document.getElementById("contentCount").textContent`)) === "3 / 300 characters");
    const server = await p.ev(`[localizeServerMessage("認証情報がありません。", "post_error_upload_prepare_failed"), localizeServerMessage("知らないメッセージ", "post_error_upload_prepare_failed"), localizeDisplayedError("日本語の想定外のエラー", "post_error_submit"), localizeDisplayedError("Missing or insufficient permissions.", "post_error_submit")]`);
    t("2d サーバーのメッセージ：既知は英語の訳・未知は汎用の案内・英語の技術的な文言はそのまま", JSON.stringify(server) === JSON.stringify(["We couldn't confirm your session. Reload the page and try again.", "We couldn't prepare the photo upload.", "We couldn't submit your post. Please try again.", "Missing or insufficient permissions."]), server);
    await p.close();
    const j = await openForm("/post.html", "ja");
    const js = await j.ev(`[localizeServerMessage("認証情報がありません。", "post_error_upload_prepare_failed"), localizeServerMessage("", "post_error_upload_prepare_failed")]`);
    t("2e 日本語の時はサーバーの文言のまま(無い時は従来の案内)", JSON.stringify(js) === JSON.stringify(["認証情報がありません。", "画像アップロードの準備に失敗しました。"]), js);
    await j.close();
  }

  // ===== 3. 街の今スレッド：送信の結果 =====
  const SAVED = `try { sessionStorage.setItem("machinauTopSavedUserLocation", JSON.stringify({ latitude: 26.2124, longitude: 127.6792, savedAt: Date.now(), locationHierarchy: { communityBoardPlaceId: "ChIJnaha", countryCode: "JP", communityBoardRegionName: "那覇市" } })); } catch (e) {}`;
  for (const [status, body, expect] of [
    [200, { success: true, status: "visible" }, "Posted. It's shown to people near the place."],
    [200, { success: true, status: "pending" }, "Thanks! Your post will be published after review."],
    [429, { success: false, message: "短時間に続けて投稿されています。" }, "You're posting too often. Please wait a moment and try again."],
    [400, { success: false, message: "入力内容を確認してください。" }, "We couldn't post this. Check the place and your message, then try again."],
  ]) {
    replies.townNowThreadCreate = [{ status, body }];
    const p = await openForm("/town-now-post.html", "en", 390, [SAVED]);
    await p.ev(SIGNED_IN);
    await p.ev(`document.getElementById("useCurrentLocationButton").click(); true`); await sleep(300);
    const place = await p.ev(`document.getElementById("selectedPlaceBox").textContent`);
    await p.ev(`const i = document.getElementById("threadTextInput"); i.value = "Any tips?"; i.dispatchEvent(new Event("input")); document.getElementById("submitButton").click(); true`); await sleep(800);
    const v = await p.ev(`({ done: document.getElementById("completionBox").style.display === "block" ? document.getElementById("completionText").textContent : "", err: document.getElementById("submitMessage").textContent })`);
    t(`3 街の今スレッド(${status} ${body.status || body.message})：場所の表示と結果が英語`, place === "Place: 那覇市 (your location)" && (status === 200 ? v.done === expect : v.err === expect), { place, v });
    await p.close();
  }

  // ===== 4. 掲示板：サーバーのメッセージ・完了 =====
  const BOARD = "/community-board-post.html?googlePlaceId=ChIJnaha&countryCode=JP&regionName=" + encodeURIComponent("那覇市");
  for (const [status, body, expect] of [
    [400, { success: false, message: "URLを含む投稿はできません。URLを除いて投稿してください。" }, "Posts can't include links. Remove the URL and try again."],
    [429, { success: false, message: "短時間に続けて投稿されています。少し待ってから、もう一度お試しください。" }, "You're posting too often. Please wait a moment and try again."],
    [500, { success: false, message: "サーバーの想定外の文言" }, "We couldn't send your post. Please try again."],
    [200, { success: true }, null],
  ]) {
    replies.communityBoardPostCreate = [{ status, body }];
    const p = await openForm(BOARD, "en");
    await p.ev(SIGNED_IN); await sleep(300);
    const banner = await p.ev(`document.getElementById("remoteRegionBannerHeading").textContent`);
    await p.ev(`const i = document.getElementById("postTextInput"); i.value = "Try the mangoes!"; i.dispatchEvent(new Event("input")); document.getElementById("submitButton").click(); true`); await sleep(1000);
    const v = await p.ev(`({ err: document.getElementById("submitMessage").textContent, done: document.getElementById("completionBox").style.display === "block" ? document.getElementById("completionBox").innerText.replace(/\\s+/g, " ").trim() : "" })`);
    t(`4 掲示板(${status})：投稿先の案内と結果が英語(サーバーの文言は対応する訳・未知は汎用)`, banner === "Post to the 那覇市 board" && (expect ? v.err === expect : v.done === "Thank you for posting. It will appear on the board after review."), { banner, v });
    await p.close();
  }

  // ===== 5. お問い合わせ：入力のエラー・サーバーのメッセージ・完了 =====
  {
    const p = await openForm("/contact.html", "en");
    await p.ev(`document.getElementById("submitButton").click(); true`); await sleep(300);
    const e1 = await p.ev(`document.getElementById("formMessage").textContent`);
    await p.ev(`document.getElementById("categoryInput").value = "bug"; document.getElementById("submitButton").click(); true`); await sleep(300);
    const e2 = await p.ev(`document.getElementById("formMessage").textContent`);
    await p.ev(`document.getElementById("messageInput").value = "Hello"; document.getElementById("emailInput").value = "bad"; document.getElementById("submitButton").click(); true`); await sleep(300);
    const e3 = await p.ev(`document.getElementById("formMessage").textContent`);
    t("5 お問い合わせ：入力のエラーが英語(種別・内容・メールの形式)・送信はしない", e1 === "Please choose a type of inquiry." && e2 === "Please enter your message." && e3 === "Please check the email address format." && p.log.posts.length === 0, { e1, e2, e3 });
    await p.close();
  }
  for (const [status, body, expect] of [
    [400, { success: false, message: "お名前・店舗名は60文字以内で入力してください。" }, "Name must be 60 characters or fewer."],
    [429, { success: false, message: "短時間に続けて送信されています。3分ほど時間をおいて、もう一度お試しください。" }, "You're sending too often. Please wait about 3 minutes and try again."],
    [503, { success: false, message: "ただいまお問い合わせが集中しています。時間をおいて、もう一度お試しください。" }, "We're receiving many inquiries right now. Please try again later."],
    [500, { success: false }, "We couldn't send your message. Please try again later."],
    [200, { success: true }, null],
  ]) {
    replies.contactInquiryCreate = [{ status, body }];
    const p = await openForm("/contact.html", "en");
    await p.ev(`document.getElementById("categoryInput").value = "feedback"; document.getElementById("messageInput").value = "Hello"; document.getElementById("submitButton").click(); true`); await sleep(900);
    const v = await p.ev(`({ err: document.getElementById("formMessage").textContent, done: getComputedStyle(document.getElementById("completeCard")).display !== "none" ? document.getElementById("completeCard").innerText.replace(/\\s+/g, " ").trim() : "", btn: document.getElementById("submitButton").textContent.trim() })`);
    t(`5b お問い合わせ(${status})：サーバーの文言は対応する訳・未知は汎用・完了も英語`, expect ? v.err === expect && v.btn === "Send" : v.done.includes("We received your message.") && !JP.test(v.done.replace("✅", "")), v);
    await p.close();
  }
  {
    replies.contactInquiryCreate = [{ status: 400, body: { success: false, message: "お名前・店舗名は60文字以内で入力してください。" } }];
    const p = await openForm("/contact.html", "ja");
    await p.ev(`document.getElementById("categoryInput").value = "feedback"; document.getElementById("messageInput").value = "こんにちは"; document.getElementById("submitButton").click(); true`); await sleep(900);
    t("5c お問い合わせ(日本語)：サーバーの文言のまま(従来どおり)", (await p.ev(`document.getElementById("formMessage").textContent`)) === "お名前・店舗名は60文字以内で入力してください。");
    await p.close();
  }

  // ===== 6. 読みもの一覧の API：保存済みの英語の題名だけを返す(翻訳を呼ばない) =====
  const READY = (title, description) => ({ status: "ready", sourceHash: hash(title, description), title: "EN " + title, description: "EN " + description });
  const base = { status: "published", category: "旅のヒント", content: "本文", publishedAt: Timestamp.fromMillis(Date.now() - 86400000) };
  S.docs.set("columnArticles/c-ready", { ...base, title: "那覇の朝", description: "朝の散歩", translations: { en: { summary: READY("那覇の朝", "朝の散歩") } } });
  S.docs.set("columnArticles/c-stale", { ...base, title: "新しい題名", description: "説明", translations: { en: { summary: READY("古い題名", "説明") } } });
  S.docs.set("columnArticles/c-pending", { ...base, title: "翻訳中", description: "説明", translations: { en: { summary: { status: "pending", sourceHash: hash("翻訳中", "説明") } } } });
  S.docs.set("columnArticles/c-none", { ...base, title: "訳なし", description: "説明" });
  const r = res();
  await quiet(() => handler({ method: "GET", headers: {}, query: { mode: "publicListPublishedColumns" } }, r));
  const bySlug = Object.fromEntries((r.body.articles || []).map((a) => [a.slug, a]));
  t("6 一覧の API：今の原文と一致する保存済みの訳だけを返す(古い訳・作成中・訳なしは返さない)・翻訳 API の呼び出しなし",
    r.body.success === true && JSON.stringify(bySlug["c-ready"].translations) === JSON.stringify({ en: { title: "EN 那覇の朝", description: "EN 朝の散歩" } }) &&
    bySlug["c-stale"].translations === undefined && bySlug["c-pending"].translations === undefined && bySlug["c-none"].translations === undefined && calls.translation === 0 &&
    !S.writes.some((w) => String(w.path || w[0] || "").includes("columnArticles")), Object.values(bySlug).map((a) => [a.slug, a.translations]));

  // ===== 7. 読みもの一覧(英語)：保存済みの訳を使う・無い記事は原文と案内 =====
  const LIST = [
    { slug: "c-ready", title: "那覇の朝", description: "朝の散歩", category: "旅のヒント", publishedMonth: "2026-11", publishedDate: "2026年11月1日", imageUrl: "", translations: { en: { title: "Morning in Naha", description: "A morning walk" } } },
    { slug: "c-none", title: "訳なし", description: "説明", category: "旅のヒント", publishedMonth: "2026-11", publishedDate: "2026年11月1日", imageUrl: "" },
  ];
  async function openList(lang, articles) {
    const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: (url, ...rest) => (url.includes("publicListPublishedColumns") ? null : api(url, ...rest)), articles, urlMock, initScripts: [langInit(lang)] } });
    await p.goto("/column-list.html"); await sleep(1000);
    return p;
  }
  {
    const p = await openList("en", LIST);
    const v = await p.ev(`({ cards: [...document.querySelectorAll(".article-card")].map((a) => ({ title: a.querySelector(".article-card-title").textContent, lang: a.querySelector(".article-card-title").getAttribute("lang"), desc: a.querySelector(".article-card-description").textContent, href: a.getAttribute("href") })), note: document.getElementById("listLanguageNote").hidden ? "" : document.getElementById("listLanguageNote").textContent })`);
    t("7 読みもの一覧(英語)：訳がある記事は英語の題名・紹介文、無い記事は原文(lang=ja)・案内あり・POST なし",
      v.cards[0].title === "Morning in Naha" && v.cards[0].desc === "A morning walk" && v.cards[0].lang === null && v.cards[1].title === "訳なし" && v.cards[1].lang === "ja" &&
      v.cards[0].href === "column/c-ready.html?lang=en" && v.note.startsWith("Some titles and summaries") && p.log.posts.length === 0, v);
    await p.close();
    const all = await openList("en", [LIST[0]]);
    t("7b すべての記事に訳がある時は案内を出さない", await all.ev(`document.getElementById("listLanguageNote").hidden`));
    await all.close();
    const ja = await openList("ja", LIST);
    t("7c 日本語は原文のまま(訳があっても使わない)", (await ja.ev(`document.querySelector(".article-card-title").textContent`)) === "那覇の朝" && (await ja.ev(`document.getElementById("listLanguageNote").hidden`)));
    await ja.close();
  }
  t("8 翻訳の API は呼ばない・想定外の外部通信なし", calls.translation === 0 && calls.other === 0, calls);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
