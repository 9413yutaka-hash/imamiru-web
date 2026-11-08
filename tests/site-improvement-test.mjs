// 2026-11-08 サイト全体改善(代表承認)。TOP の見出し・近くに掲載が無い時の案内・GA4 の計測・旅の保存箱の共有。
// 1. TOP の見出しの先頭の絵文字を外した(日英・辞書と画面の両方)。
// 2. 現在地から15km以内に掲載が無い時は、カテゴリーではなく距離の案内と「地域から探す」(15km・距離順は不変)。
// 3. GA4：現在地の結果・保存・保存箱・投稿と店舗向けの導線・共有。位置や個人の情報は送らない・二重に送らない。
// 4・5. 旅の保存箱の共有：公開中の ID だけの URL(?trip=)、受け取った側は公開一覧にあるものだけ・まとめて保存。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// run: node --import ./tests/mockfa-occ/register.mjs tests/site-improvement-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8947;
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
  // ===== 1. 見出しの絵文字(新しい店舗カード・店舗ページに合わせて外す) =====
  for (const lang of ["ja", "en"]) {
    const p = await openAt("/", { lang, geo: NAHA });
    const h = await p.ev(`(() => {
      const ids = { imadake: "imadakeHeading", travel: null };
      const keys = ["contribute_cta_heading", "factual_heading", "today_machinau_heading", "mypage_heading", "travel_box_shops_heading", "travel_box_articles_heading", "map_heading", "column_entry_heading", "street_discovery_heading", "town_now_heading", "imadake_heading", "suggestion_heading", "region_recommendation_heading_default"];
      const texts = keys.map((k) => { const e = document.querySelector('[data-i18n="' + k + '"]'); return [k, e ? e.textContent.trim() : null]; });
      return { texts, dict: keys.map((k) => getMachinauTranslation(k, getCurrentMachinauLanguage())) };
    })()`);
    const emo = /^\s*(\p{Extended_Pictographic}|[☀-➿])/u;
    const shown = h.texts.filter(([, v]) => v !== null);
    t(`1 ${lang}：TOP の見出しの先頭に絵文字なし(画面 ${shown.length}件・辞書 ${h.dict.length}件)・文言は残る`, shown.length >= 10 && shown.every(([, v]) => v !== "" && !emo.test(v)) && h.dict.every((v) => v !== "" && !emo.test(v)), h);
    t(`1b ${lang}：JavaScript のエラーなし`, p.log.errors.length === 0, p.log.errors);
    await p.close();
  }

  // ===== 2. 近くにお店・施設が無い時の案内 =====
  {
    const p = await openAt("/", { geo: TOKYO });
    const v = await p.ev(`(() => { const n = document.querySelector("#shopsList .sample-notice"); const b = n && n.querySelector(".shops-empty-area-button"); return { text: n ? n.textContent.replace(/\\s+/g, " ").trim() : "", button: b ? b.textContent.trim() : null, h: b ? b.getBoundingClientRect().height : 0 }; })()`);
    t("2 東京(15km以内に掲載なし・すべて)：カテゴリーではなく距離の案内と「地域から探す」(44px以上)", v.text.includes("15km以内") && !v.text.includes("このカテゴリー") && v.button === "地域から探す" && v.h >= 44, v);
    const clicked = await p.ev(`(() => { let n = 0; document.getElementById("heroActionArea").addEventListener("click", () => n++); document.querySelector("#shopsList .shops-empty-area-button").click(); return n; })()`);
    t("2b 「地域から探す」を押すとヒーローの「地域から探す」と同じ動き", clicked === 1, clicked);
    await p.close();
    const ok = await openAt("/", { geo: NAHA });
    const cards = await ok.ev(`[...document.querySelectorAll("#shopsList .shop-card")].map((c) => c.dataset.shopId)`);
    t("2c 那覇：今までどおり距離順(S1 → L2)・15kmの外(L3)と引き継ぎ済み(L1)は出ない・案内は出ない", JSON.stringify(cards) === JSON.stringify(["sp_S1", "L2"]) && !(await ok.ev(`!!document.querySelector("#shopsList .shops-empty-area-button")`)), cards);

    // ===== 3. GA4 =====
    await ok.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .favorite-button').click(); true`); await sleep(300);
    await ok.ev(`document.querySelector('#shopsList .shop-card[data-shop-id="L2"] .favorite-button').click(); true`); await sleep(300);
    await ok.ev(`showMyPage(); true`); await sleep(300);
    await ok.ev(`(() => { const a = document.querySelector(".contribute-cta-button"); window.addEventListener("click", (e) => e.preventDefault(), true); a.click(); const b = document.querySelector(".contribute-cta-shop-link"); b.click(); return true; })()`);
    await ok.ev(`(async () => { openShopModal("L2", "card"); await new Promise((r) => setTimeout(r, 400)); document.getElementById("modalShareButton").click(); await new Promise((r) => setTimeout(r, 400)); return true; })()`);
    const ga = await ok.ev(`window.__ga`);
    const names = ga.map((e) => e[0]);
    t("3 GA4：現在地の結果(success)・保存と解除・保存箱を開いた・投稿と店舗向けの導線・共有(コピー)を送る",
      names.includes("location_result") && ga.find((e) => e[0] === "location_result")[1].result === "success" && names.includes("favorite_add") && names.includes("favorite_remove") &&
      names.filter((n) => n === "travel_box_open").length === 1 && names.includes("contribute_cta_click") && names.includes("shop_guide_click") &&
      ga.some((e) => e[0] === "share" && e[1].content_type === "shop" && e[1].method === "copied"), names);
    t("3b GA4：位置・メール・住所・電話などの個人の情報を送らない・同じ操作で二重に送らない", ga.every((e) => !Object.keys(e[1]).some((k) => PII.test(k)) && !JSON.stringify(e[1]).match(/26\.21|127\.67/)) && names.filter((n) => n === "favorite_add").length === 1 && names.filter((n) => n === "location_result").length === 1, ga);
    await ok.close();
    const denied = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, articles: [], urlMock, initScripts: [langInit("ja"), MAPS_SHIM, GA_SPY] } });
    await denied.goto("/");
    await denied.waitFor("document.readyState === 'complete' && typeof shops !== 'undefined' && shops.length > 0", 30000);
    await denied.ev(`navigator.geolocation.getCurrentPosition = (ok, ng) => setTimeout(() => ng({ code: 1, message: "denied" }), 10); getLocation(); true`); await sleep(500);
    const dga = await denied.ev(`window.__ga.filter((e) => e[0] === "location_result")`);
    t("3c GA4：位置情報を拒否された時は result=denied だけ(既存の案内は今までどおり出る)", dga.length === 1 && dga[0][1].result === "denied" && Object.keys(dga[0][1]).length === 1 && (await denied.ev(`document.getElementById("locationMessage").textContent.length > 0`)), dga);
    await denied.close();
  }

  // ===== 4. 旅の保存箱の共有(送る側) =====
  {
    const p = await openAt("/", { geo: NAHA, favorites: ["L2", "sp_S1", "L1", "L3"] });
    await p.ev(`showMyPage(); true`); await sleep(500);
    await p.ev(`document.querySelector(".travel-box-trip-share .machinau-share-button").click(); true`); await sleep(500);
    const clip = await p.ev(`window.__clip`);
    const url = clip[0] || "";
    const ids = url.startsWith("https://machinau.jp/?trip=") ? url.slice("https://machinau.jp/?trip=".length).split(".") : [];
    t("4 保存箱の共有：公開中の保存だけの URL(https://machinau.jp/?trip=…)・引き継ぎ済み L1 は S1 にまとまる・位置や利用者の情報なし",
      ids.length === 3 && ids.includes("L2") && ids.includes("sp_S1") && ids.includes("L3") && !ids.includes("L1") && !/[&#]|lat|uid/.test(url), url);
    const status = await p.ev(`document.querySelector(".travel-box-trip-share .machinau-share-status").textContent.trim()`);
    t("4b 保存箱の共有：コピーした案内を表示・GA4 は share(content_type=trip)", status !== "" && (await p.ev(`window.__ga.some((e) => e[0] === "share" && e[1].content_type === "trip")`)), status);
    await p.close();
    const e = await openAt("/");
    await e.ev(`showMyPage(); true`); await sleep(300);
    await e.ev(`document.querySelector(".travel-box-trip-share .machinau-share-button").click(); true`); await sleep(300);
    const es = await e.ev(`({ status: document.querySelector(".travel-box-trip-share .machinau-share-status").textContent.trim(), clip: window.__clip.length })`);
    t("4c 保存が無い時：送らずに「♡で保存してください」の案内", es.clip === 0 && es.status.includes("♡"), es);
    await e.close();
  }

  // ===== 5. 旅の保存箱の共有(受け取る側) =====
  for (const [lang, width] of [["ja", 390], ["ja", 360], ["en", 390], ["ja", 1280]]) {
    const p = await openAt("/?trip=L2.L3.L1.zzz.bad!id", { lang, width });
    await p.waitFor(`!document.getElementById("sharedTripSection").hidden`, 10000);
    const v = await p.ev(`(() => { const s = document.getElementById("sharedTripSection"); return { heading: document.getElementById("sharedTripHeading").textContent.trim(), lead: document.getElementById("sharedTripLead").textContent, ids: [...s.querySelectorAll("[data-shared-trip-id]")].map((b) => b.getAttribute("data-shared-trip-id")), names: [...s.querySelectorAll(".shared-trip-name")].map((x) => x.textContent), noHScroll: document.documentElement.scrollWidth <= innerWidth + 1, overflow: s.scrollWidth > s.clientWidth + 1, tap: [...s.querySelectorAll("button")].every((b) => b.getBoundingClientRect().height >= 44) }; })()`);
    const expectHeading = lang === "en" ? "A shared trip list" : "共有された旅のリスト";
    t(`5 ${lang} ${width}px：届いたリストは公開中の3件(L2・L3・引き継ぎ先の S1)だけ・存在しない／形の違う ID は出さない・はみ出しなし・押せる大きさ`,
      v.heading === expectHeading && JSON.stringify(v.ids) === JSON.stringify(["L2", "L3", "sp_S1"]) && v.lead.includes("3") && v.noHScroll && !v.overflow && v.tap && p.log.errors.length === 0, { ...v, err: p.log.errors });
    if (lang === "ja" && width === 390) {
      await p.ev(`document.querySelector('[data-shared-trip-id="L3"]').click(); true`); await sleep(600);
      const title = await p.ev(`document.querySelector("#shopModal .modal-title").textContent.trim()`);
      t("5b 押すと詳細(15kmの外の L3 も、お気に入りと同じく詳細は見られる)", title === "名護の店", title);
      await p.ev(`closeShopModal(); true`);
      await p.ev(`document.getElementById("sharedTripSaveAllButton").click(); true`); await sleep(300);
      const fav = await p.ev(`JSON.parse(localStorage.getItem("machinauFavoriteShopIds") || "[]")`);
      t("5c まとめて保存：3件を自分の保存箱へ(S1 は引き継ぎ元 L1 も一緒に)・保存の案内・GA4 shared_trip_save", ["L2", "L3", "sp_S1", "L1"].every((id) => fav.includes(id)) && (await p.ev(`document.getElementById("sharedTripStatus").textContent`)).includes("保存") && (await p.ev(`window.__ga.some((e) => e[0] === "shared_trip_save" && e[1].item_count === 3)`)), fav);
      await p.ev(`switchMachinauLanguage("en"); true`); await sleep(400);
      t("5d 表示中に英語へ切り替えると説明も英語", (await p.ev(`document.getElementById("sharedTripLead").textContent`)).startsWith("3 places"), await p.ev(`document.getElementById("sharedTripLead").textContent`));
    }
    await p.close();
  }
  {
    const p = await openAt("/?trip=zzz.yyy");
    await sleep(800);
    const v = await p.ev(`({ hidden: document.getElementById("sharedTripSection").hidden, notice: !document.getElementById("sharedLinkNotice").hidden && document.getElementById("sharedLinkNoticeText").textContent })`);
    t("5e 届いたお店がすべて掲載されていない時：リストは出さず「今は掲載されていません」の案内", v.hidden && typeof v.notice === "string" && v.notice.includes("掲載されていません"), v);
    await p.close();
    const q = await openAt("/?shop=L2&trip=L3");
    await sleep(800);
    t("5f ほかの共有リンク(?shop=)がある時はそちらを優先し、旅のリストは出さない", (await q.ev(`document.getElementById("sharedTripSection").hidden`)) && (await q.ev(`document.querySelector("#shopModal .modal-title").textContent.trim()`)) === "見本カフェ");
    await q.close();
  }
  t("6 翻訳の API は呼ばない・想定外の外部通信なし", calls.translation === 0 && calls.other === 0, calls);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
