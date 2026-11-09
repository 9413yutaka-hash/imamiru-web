// 2026-11-08 サイト全体改善 第2弾(代表承認)。TOP 以外の公開ページの統一と、旅の保存箱の共有の30件の案内。
// 1. 公開ページは共通の基準(machinau-pages.css)を最後に読む。管理者の画面・領収書は対象外。
// 2. 公開ページの見出し・ラベル・ボタン・飾りのアイコンの絵文字を外した(カテゴリー・状態の印は残す)。見出しは24px/18px、押せる高さ44px。
// 3. 共有は一度に最大30件と常に案内し、31件以上の保存がある時は「上から30件」を出す(30件の制限・公開の判定は不変)。
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// run: node --import ./tests/mockfa-occ/register.mjs tests/site-improvement-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8949;
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


// 30件を超える保存を作るための近くの運営掲載(N01〜N32)。
for (let i = 1; i <= 32; i++) S.docs.set("submissions/N" + String(i).padStart(2, "0"), { ...LISTING, title: "近くの店" + i, shopName: "近くの店" + i, latitude: 26.2141 + i * 0.0001, longitude: 127.6802 });

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
  // SEO改善 STEP 2｜column-list.html は api/_lib/column-list-page.js へ移した(サーバーが記事のカードを入れて返す)。カード無しの形で読む。
  const { buildColumnListPageHtml } = await import(REPO_URL + "/api/_lib/column-list-page.js");
  const read = (f) => (f === "column-list.html" ? buildColumnListPageHtml("", "") : fsx.readFileSync(REPO_ROOT + "/" + f, "utf8"));
  const PUBLIC = ["shop-guide", "shop-apply", "store-account", "store-profile", "contribute", "post", "imadake-post", "town-now-post", "community-board-post", "column-list", "contact", "privacy", "end", "edit", "404", "shop"];
  const ACCOUNT = ["store-account", "store-profile", "imadake-post"];
  const ADMIN = ["terms", "tokushoho", "admin", "admin-post", "admin-shops", "admin-billing", "editor", "ai-editor", "ai-sources", "store-receipt", "index"];
  {
    const bad = [];
    for (const p of PUBLIC) {
      const s = read(p + ".html");
      const headEnd = s.indexOf("</head>");
      const link = s.indexOf('<link rel="stylesheet" href="machinau-pages.css">');
      const lastStyle = s.lastIndexOf("</style>", headEnd);
      const body = (s.match(/<body[^>]*>/) || [""])[0];
      const want = ACCOUNT.includes(p) ? '<body class="machinau-page machinau-account-page">' : '<body class="machinau-page">';
      if (!(link > lastStyle && link < headEnd) || body !== want) bad.push(p);
    }
    const adminBad = ADMIN.filter((p) => read(p + ".html").includes("machinau-pages.css"));
    t("1 公開ページ16件は共通の基準をページのスタイルの後に読み、本文に印を付ける(アカウント系3件は帯の印も)。利用規約・特商法(告知の間は本番と同一に保つ)・管理者の画面・領収書・TOP は読まない", bad.length === 0 && adminBad.length === 0, { bad, adminBad });
    const css = read("machinau-pages.css");
    t("1b 共通の基準：見出し24px(PC 28px)・18px、帯は青のグラデーション、言語の切り替え・文字のボタン・計測の停止は44px", /\.machinau-page h1 \{\s*font-size: 24px;/.test(css) && /\.machinau-page h2 \{\s*font-size: 18px;/.test(css) && /min-width: 701px[\s\S]*font-size: 28px/.test(css) && css.includes("linear-gradient(135deg, #0687c5, #13c3ce)") && /\.language-switch button \{\s*min-height: 44px;/.test(css) && /\.link-button \{[^}]*min-height: 44px;/.test(css) && /#areaUsageOptOutButton \{\s*min-height: 44px;/.test(css));
  }
  {
    const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{231A}-\u{23FF}]/u;
    const KEEP = /^\s*(🍜|🥭|🛍️|🎵|🏝️|🌃|💆|🏨|⛩️) |^\s*📷\s*$|complete-icon">✅</;
    const left = [];
    for (const p of PUBLIC) {
      const s = read(p + ".html").replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
      s.split("\n").forEach((l) => { if (EMO.test(l) && !KEEP.test(l)) left.push(p + ": " + l.trim().slice(0, 40)); });
    }
    const post = read("post.html"), cb = read("community-board-post.html");
    t("2 公開ページの画面の絵文字は、カテゴリー・写真の枠・完了の印だけ(見出し・ラベル・ボタン・飾りのアイコンには無い)", left.length === 0, left);
    t("2b 投稿画面のスクリプトの文言も絵文字なし・TOP の見出しの名前(「街の発見」)と一致", !post.includes("選択中：👀") && !post.includes("📍 この場所を現在地から設定") && !post.includes("📍 現在地を再取得") && post.includes('tr("post_published_street")') && /post_published_street: \{\s*ja: "[^"]*トップページの「街の発見」/.test(read("translations.js")) && !cb.includes('"📌 "'));
    t("2c 今だけ投稿の写真ボタンの日英の辞書も絵文字なし", /imadake_post_photo_add: \{\s*ja: "写真を選ぶ",\s*en: "Choose photos"/.test(read("translations.js").replace(/\r\n/g, "\n")));
  }
  // ---- 3. 共有の30件の案内(TOP)
  const ALL = Array.from({ length: 32 }, (_, i) => "N" + String(i + 1).padStart(2, "0"));
  for (const [lang, width] of [["ja", 390], ["ja", 360], ["en", 390], ["ja", 1280]]) {
    const p = await openAt("/", { lang, width, geo: NAHA, favorites: ALL.concat(["L2"]) });
    await p.ev("showMyPage(); true"); await sleep(900);
    const v = await p.ev(`(() => { const l = document.getElementById("travelBoxShareLimit"); const n = document.querySelector(".travel-box-share-note"); return { limit: l.hidden ? null : l.textContent, note: n.textContent, h: Math.round(l.getBoundingClientRect().height), noHScroll: document.documentElement.scrollWidth <= innerWidth + 1 }; })()`);
    const expectLimit = lang === "en" ? "You have 33 saved places. The first 30 will be sent." : "保存した33件のうち、上から30件を送ります。";
    const expectNote = lang === "en" ? "up to 30 at a time" : "一度に最大30件まで";
    t(`3 ${lang} ${width}：保存33件 → 共有ボタンの下に「上から30件」・案内に最大30件・はみ出しなし`, v.limit === expectLimit && v.note.includes(expectNote) && v.noHScroll, v);
    if (lang === "ja" && width === 390) {
      await p.ev(`document.querySelector(".travel-box-trip-share .machinau-share-button").click(); true`); await sleep(500);
      const url = await p.ev(`window.__clip[window.__clip.length - 1] || ""`);
      const ids = url.slice("https://machinau.jp/?trip=".length).split(".");
      t("3b 送る URL は30件のまま(制限・公開の判定は不変)・重複なし", ids.length === 30 && new Set(ids).size === 30, { n: ids.length });
      await p.ev(`switchMachinauLanguage("en"); true`); await sleep(600);
      t("3c 表示中に英語へ切り替えると「上から30件」も英語", (await p.ev(`document.getElementById("travelBoxShareLimit").textContent`)) === "You have 33 saved places. The first 30 will be sent.", await p.ev(`document.getElementById("travelBoxShareLimit").textContent`));
    }
    await p.close();
  }
  {
    const p = await openAt("/", { geo: NAHA, favorites: ALL.slice(0, 30) });
    await p.ev("showMyPage(); true"); await sleep(900);
    t("3d 保存がちょうど30件の時は「上から30件」を出さない", await p.ev(`document.getElementById("travelBoxShareLimit").hidden`));
    await p.close();
  }
  t("4 翻訳の API は呼ばない・想定外の外部通信なし", calls.translation === 0 && calls.other === 0, calls);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
