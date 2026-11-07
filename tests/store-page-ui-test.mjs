// STEP 56 client: the permanent store page (/shop/{storeId}) in Chrome at phone and PC width (ja/en), and the owner
// editor (store-profile.html): the permanent URL with copy, and changing the name and location (URL stays the same).
// REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it through request interception.
// Store login is a fake named Firebase app; Geocoding and OpenAI Moderation are local stubs. No real services, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-page-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8876;
const ORIGIN = "http://127.0.0.1:" + PORT;
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
process.env.OPENAI_API_KEY = "sk-" + "fake-openai-for-tests"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const realFetch = globalThis.fetch;
let otherNetwork = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  if (u.hostname === "maps.googleapis.com") {
    return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: "日本、〒900-0015 沖縄県那覇市久茂地１丁目１−１", geometry: { location: { lat: 26.214, lng: 127.679 } }, address_components: [
      { long_name: "日本", short_name: "JP", types: ["country", "political"] },
      { long_name: "沖縄県", short_name: "沖縄県", types: ["administrative_area_level_1", "political"] },
      { long_name: "那覇市", short_name: "那覇市", types: ["locality", "political"] }
    ] }] }) };
  }
  otherNetwork++; throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return null;
  const e = console.error; console.error = () => {};
  try {
    if (method === "GET") return { status: 200, body: { success: true, posts: [], articles: [], stores: [] } };
    const body = JSON.parse(postData || "{}");
    clearRate();
    const auth = headers.Authorization || headers.authorization;
    const r = res();
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r);
    return { status: r.code, body: r.body };
  } finally { console.error = e; }
}
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
  window.__copied = [];
  Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.__copied.push(text); } }, configurable: true });
})();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
S.docs.set("storeAccounts/S1", { storeName: "海辺のカフェ", registrationStatus: "active", enabled: true, createdByType: "storeUser", createdByUid: "u1", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", address: "沖縄県那覇市牧志1-1-1", locationFormattedAddress: "日本、〒900-0013 沖縄県那覇市牧志１丁目１−１", latitude: 26.215, longitude: 127.688, duplicateCandidates: [], reviewFlags: [] });
S.docs.set("storeMembers/S1_u1", { uid: "u1", storeId: "S1", role: "owner", status: "active" });
S.docs.set("storeProfiles/S1", { storeId: "S1", status: "published", storeName: "海辺のカフェ", revision: 3, categoryCode: "cafe_sweets", description: "海の見えるカフェです。".repeat(30), moderationStatus: "passed", moderatedText: "海の見えるカフェです。".repeat(30) + "\n月曜は早じまい", businessHours: { weekly: { mon: [{ open: "09:00", close: "15:00" }], tue: [{ open: "09:00", close: "18:00" }], wed: [], thu: [{ open: "09:00", close: "18:00" }], fri: [{ open: "09:00", close: "18:00" }], sat: [{ open: "00:00", close: "24:00" }], sun: [{ open: "10:00", close: "18:00" }] }, note: "月曜は早じまい" }, websiteUrl: "https://example.com/a-very-long-path/that-should-wrap-on-small-screens-without-horizontal-scroll", paymentMethodCodes: ["cash", "card", "qr"], featureCodes: ["free_wifi", "takeout", "kid_friendly", "wheelchair_accessible"], phone: "098-123-4567", reservationUrl: "https://reserve.example.com/umibe-cafe", socialLinks: [{ type: "instagram", url: "https://www.instagram.com/umibe_cafe/" }], supportedLanguageCodes: ["ja", "en"], photos: [1, 2, 3, 4].map((i) => ({ url: CLD + "v1/machinau_store_profiles/S1/p" + i + ".webp", publicId: "machinau_store_profiles/S1/p" + i, moderationStatus: "passed" })) });
S.docs.set("storeCustomPlans/S1", { storeId: "S1", status: "active", ownerUid: "u1", periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(Date.now() - 40 * 86400000), accessUntil: null, paymentStatus: "current" });

// /shop/{id} は vercel.json の rewrite と同じく実際のサーバーの処理へ、それ以外は静的ファイル。画像は空の応答。
const staticServer = await serve(REPO_ROOT + "", PORT + 1);
const server = http.createServer(async (req, rs) => {
  const u = new URL(req.url, "http://x");
  const m = u.pathname.match(/^\/shop\/([^/]+)$/);
  if (m) {
    const r = res(); const e = console.error; console.error = () => {};
    try { await handler({ method: "GET", headers: {}, query: { mode: "renderStorePage", storeId: decodeURIComponent(m[1]), ...(u.searchParams.get("lang") ? { lang: u.searchParams.get("lang") } : {}) } }, r); } finally { console.error = e; }
    rs.writeHead(r.code, { "Content-Type": r.headers["Content-Type"] || "text/html", ...(r.headers.Location ? { Location: r.headers.Location } : {}) }); rs.end(String(r.body)); return;
  }
  const up = await realFetch("http://127.0.0.1:" + (PORT + 1) + req.url);
  rs.writeHead(up.status, { "Content-Type": up.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" });
  rs.end(Buffer.from(await up.arrayBuffer()));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const browser = await launchChrome();
const imgBlock = { blockUrls: ["res.cloudinary.com"] };
const pageView = (p) => p.ev(`({ h1: (document.querySelector("h1") || {}).textContent || "", lang: document.documentElement.lang, title: document.title, noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1, imgs: document.querySelectorAll("main img").length, sections: Array.from(document.querySelectorAll("section.block h2")).map((h) => h.textContent), facts: Array.from(document.querySelectorAll(".facts h3")).map((h) => h.textContent), quick: Array.from(document.querySelectorAll("nav.quick a")).map((a) => a.dataset.quick), canonical: (document.querySelector('link[rel="canonical"]') || {}).href || "" })`);

try {
  // ===== 店舗ページ：スマートフォン(日本語) =====
  let p = await openPage(browser, { origin: ORIGIN, width: 375, mobile: true, state: { ...imgBlock } });
  await p.goto("/shop/S1");
  let v = await pageView(p);
  if (process.env.STORE_PAGE_SHOT) await p.screenshot(process.env.STORE_PAGE_SHOT);
  // STEP 57｜公式サイトは「電話・予約・SNS」の欄へ。2026-11-08 LP級：写真が主役のファーストビュー＋地図・電話・予約・共有、
  // 支払い・設備・対応言語は「お店の情報」にまとめ、最後に共有の欄。
  t("P1 スマートフォン(375px)：店名・写真4枚・紹介/写真/営業時間/所在地/お店の情報(支払い・設備・対応言語)/電話・予約・SNS/共有・すぐ下の操作(地図・電話・予約・共有)・横にはみ出さない", v.h1 === "海辺のカフェ" && v.imgs === 4 && JSON.stringify(v.sections) === JSON.stringify(["お店・施設の紹介", "写真", "営業時間", "所在地", "お店の情報", "電話・予約・SNS", "このページを共有"]) && JSON.stringify(v.facts) === JSON.stringify(["支払い方法", "設備・サービス", "対応言語"]) && JSON.stringify(v.quick) === JSON.stringify(["map", "phone", "reservation", "share"]) && v.noHScroll && v.lang === "ja", v);
  const contact = await p.ev(`[...document.querySelectorAll("ul.contact a")].map((a) => ({ href: a.getAttribute("href"), kind: a.getAttribute("data-contact"), target: a.target, h: a.getBoundingClientRect().height, w: a.getBoundingClientRect().width }))`);
  t("P7 電話(tel:)・予約先・公式サイト・SNS は押しやすい大きさ(高さ44px以上・幅いっぱい)・外部のリンクは新しいタブ", contact.length === 4 && contact[0].href === "tel:0981234567" && contact[0].kind === "phone" && contact.slice(1).every((x) => x.target === "_blank") && contact.every((x) => x.h >= 44 && x.w >= 300), contact);
  t("P2 title・canonical(固定の URL)", v.title === "海辺のカフェ（沖縄県那覇市）｜マチナウ" && v.canonical === "https://machinau.jp/shop/S1", v);
  t("P3 JavaScript のエラーなし(店舗ページはスクリプトを使わない)", p.log.errors.length === 0 && (await p.ev(`document.querySelectorAll("script:not([type='application/ld+json'])").length`)) === 0, p.log.errors);
  await p.ev(`document.querySelector('nav.lang a[hreflang="en"]').click(); true`);
  await p.waitFor(`document.documentElement.lang === "en"`, 10000); await sleep(200);
  v = await pageView(p);
  t("P4 English に切り替え：同じ店舗・英語の見出し・横にはみ出さない", v.lang === "en" && v.h1 === "海辺のカフェ" && v.sections.includes("Opening hours") && v.facts.includes("Payment methods") && v.noHScroll && (await p.ev("location.pathname + location.search")) === "/shop/S1?lang=en", v);
  await p.close();

  // ===== 店舗ページ：PC・存在しない店舗 =====
  p = await openPage(browser, { origin: ORIGIN, width: 1280, mobile: false, state: { ...imgBlock } });
  await p.goto("/shop/S1");
  v = await pageView(p);
  t("P5 PC(1280px)：本文の幅は最大760px・横にはみ出さない", v.h1 === "海辺のカフェ" && v.noHScroll && (await p.ev(`document.querySelector("main").getBoundingClientRect().width`)) <= 760, v);
  await p.goto("/shop/NOPE");
  const end = await p.ev(`({ h1: document.querySelector("h1").textContent, robots: (document.querySelector('meta[name="robots"]') || {}).content, top: (document.querySelector('main a[href="/"]') || {}).textContent })`);
  t("P6 存在しない店舗：終了表示・noindex・トップへのリンク", end.h1 === "このお店・施設のページは表示できません" && end.robots === "noindex" && end.top === "マチナウのトップへ", end);
  await p.close();

  // ===== 編集画面：固定の URL・コピー・店名と所在地の変更 =====
  const openEditor = async (lang) => {
    const page = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, initScripts: [fakeStoreAuth, langInit(lang)] } });
    await page.goto("/store-profile.html?store=S1");
    await page.waitFor(`!document.getElementById("editorArea").hidden && !!document.getElementById("storePageLink").textContent`, 20000); await sleep(300);
    return page;
  };
  p = await openEditor("ja");
  const ed = await p.ev(`({ link: document.getElementById("storePageLink").textContent, href: document.getElementById("storePageLink").href, note: document.getElementById("storePageNote").textContent, editVisible: !document.getElementById("identityEditButton").hidden, noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 })`);
  t("U1 編集画面：お店のページの固定の URL を表示・公開中の案内(LINE・SNS・QRコードで共有)・横にはみ出さない", ed.link === "https://machinau.jp/shop/S1" && ed.href === "https://machinau.jp/shop/S1" && /LINE・Instagram・SNS・QRコード/.test(ed.note) && ed.editVisible && ed.noHScroll, ed);
  await p.ev(`document.getElementById("storePageCopyButton").click(); true`);
  await p.waitFor(`window.__copied.length === 1`, 5000);
  t("U2 「URLをコピー」：固定の URL をコピーし、案内を表示", (await p.ev(`window.__copied[0]`)) === "https://machinau.jp/shop/S1" && (await p.ev(`document.getElementById("storePageCopyStatus").textContent`)) === "URLをコピーしました。");
  await p.ev(`document.getElementById("identityEditButton").click(); true`);
  const opened = await p.ev(`({ name: document.getElementById("identityNameInput").value, address: document.getElementById("identityAddressInput").value, editorHidden: document.getElementById("identityEditor").hidden })`);
  t("U3 「店舗・施設名と所在地を変更する」：今の店名と、入力した住所を初期値に表示", opened.name === "海辺のカフェ" && opened.address === "沖縄県那覇市牧志1-1-1" && !opened.editorHidden, opened);
  await p.ev(`(() => { document.getElementById("identityNameInput").value = "海辺のカフェ 久茂地店"; document.getElementById("identityAddressInput").value = "沖縄県那覇市久茂地1-1-1"; document.getElementById("identitySaveButton").click(); return true; })()`);
  await p.waitFor(`/保存しました/.test(document.getElementById("identityMessage").textContent) && !document.getElementById("editorArea").hidden`, 20000); await sleep(500);
  const saved = await p.ev(`({ name: document.getElementById("storeNameText").textContent, loc: document.getElementById("storeLocationText").textContent, link: document.getElementById("storePageLink").textContent, msg: document.getElementById("identityMessage").textContent, editorHidden: document.getElementById("identityEditor").hidden })`);
  const acc = S.docs.get("storeAccounts/S1");
  t("U4 保存：店名・所在地(サーバーの Geocoding)が変わり、URL は同じ・保存の案内", saved.name === "海辺のカフェ 久茂地店" && /久茂地/.test(saved.loc) && saved.link === "https://machinau.jp/shop/S1" && /URLは変わりません/.test(saved.msg) && saved.editorHidden && acc.storeName === "海辺のカフェ 久茂地店" && acc.latitude === 26.214, { saved, acc: { n: acc.storeName, lat: acc.latitude } });
  t("U5 JavaScript のエラーなし(編集画面)", p.log.errors.length === 0, p.log.errors);
  await p.close();

  p = await openPage(browser, { origin: ORIGIN, width: 375, mobile: true, state: { ...imgBlock } });
  await p.goto("/shop/S1");
  v = await pageView(p);
  t("U6 変更後も同じ URL /shop/S1 で、新しい店名を表示", v.h1 === "海辺のカフェ 久茂地店" && v.canonical === "https://machinau.jp/shop/S1", v);
  await p.close();

  p = await openEditor("en");
  const en = await p.ev(`({ label: document.querySelector('[data-i18n="store_page_url_label"]').textContent, copy: document.getElementById("storePageCopyButton").textContent, edit: document.getElementById("identityEditButton").textContent, note: document.getElementById("storePageNote").textContent })`);
  t("U7 英語：お店のページ・コピー・変更のボタンの文言が英語", en.label === "Your shop page (permanent URL)" && en.copy === "Copy URL" && en.edit === "Change name and location" && /share this URL on LINE/.test(en.note), en);
  await p.close();
  t("U8 外部への通信なし(試験の偽物以外)", otherNetwork === 0, otherNetwork);
} finally {
  browser.close(); server.close(); staticServer.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
