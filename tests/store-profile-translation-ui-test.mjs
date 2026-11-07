// 2026-11-07 C案・G案｜TOP の店舗カード・詳細の英語表示を、実際の画面(app.js)で確かめる。
//   C案：住所は日本語のまま、英語の表示では「Address (in Japanese)」を添える(日本語の表示は従来どおり)。
//   G案：店主の店舗カード(sp_)の紹介文は英語訳に差し替える(訳が届くまで・失敗時は原文)。
// 翻訳の API は本物の処理(api/_lib/store-profile-translation.js)を、メモリ上の Firestore と偽の翻訳で動かす
// (OpenAI は呼ばない)。公開一覧・正式店舗一覧は固定の値。No real services.
// run: node --import ./tests/mockfa/register.mjs tests/store-profile-translation-ui-test.mjs
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const TR = await import(pathToFileURL(REPO_ROOT + "/api/_lib/store-profile-translation.js").href);

const ORIGIN = "http://127.0.0.1:8881";
let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };
const NOW = Date.now(), H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();

const TS = (ms) => ({ toMillis: () => ms });
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));
function makeDb() {
  const store = new Map();
  const setPath = (obj, dotted, value) => { const ks = dotted.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = value; };
  const db = {
    collection: (col) => ({ doc: (id) => ({ path: col + "/" + id, id }) }),
    async runTransaction(fn) {
      const writes = [];
      const tx = { get: async (r) => { const cur = store.get(r.path); return { exists: !!cur, data: () => clone(cur) }; }, set: (r, d, o) => writes.push({ r, d, merge: !!(o && o.merge), set: true }), update: (r, d) => writes.push({ r, d }) };
      const result = await fn(tx);
      for (const w of writes) { let cur = clone(store.get(w.r.path)) || {}; if (w.set) cur = w.merge ? { ...cur, ...clone(w.d) } : clone(w.d); else for (const [k, v] of Object.entries(w.d)) setPath(cur, k, clone(v)); store.set(w.r.path, cur); }
      return result;
    }
  };
  return { db, store };
}

// 運営掲載(無料掲載)：公開一覧と同じ形
const listing = (id, name, address, ageH) => ({ id, fields: {
  address, businessEndTime: "", businessStartTime: "", category: "グルメ", content: name + "の紹介文です。", createdAt: iso(NOW - ageH * H), expiresAt: iso(NOW + 48 * H),
  latitude: 26.214, longitude: 127.68, paymentMethods: [], shopName: name, title: "那覇市", takeout: false, updatedAt: iso(NOW - ageH * H), websiteUrl: "" } });
const SUBMISSIONS = [listing("L1", "テスト食堂", "沖縄県那覇市久茂地1-1", 1)];

const DESC1 = "首里の老舗です。\nランチ1,200円、11:00〜15:00。";
const DESC_EN = "Fresh bread every morning from 8:00.";
const storeJson = (id, name, description, sourceLanguage, address) => ({
  id: "sp_" + id, listingType: "store_profile", storeName: name, categoryCode: "restaurant", description, sourceLanguage,
  photos: [], location: { countryCode: "JP", prefecture: "沖縄県", city: "那覇市", formattedAddress: address, latitude: 26.2125, longitude: 127.679 },
  businessHours: null, websiteUrl: "", paymentMethodCodes: [], featureCodes: [], publishedAt: iso(NOW), linkedListingIds: []
});
const state = { desc1: DESC1, translatorFails: false, translatorCalls: 0, apiCalls: [] };
const be = makeDb();
const seedProfiles = () => {
  be.store.set("storeProfiles/S1", { ...(be.store.get("storeProfiles/S1") || {}), status: "published", description: state.desc1, sourceLanguage: "ja" });
  be.store.set("storeProfiles/S2", { status: "published", description: DESC_EN, sourceLanguage: "en" });
};
const storeProfilesBody = () => ({ success: true, stores: [storeJson("S1", "首里テスト店", state.desc1, "ja", "日本、〒903-0812 沖縄県那覇市首里当蔵町1-1"), storeJson("S2", "Bakery Test", DESC_EN, "en", "沖縄県那覇市泉崎1-1")],
  suppressedListingIds: [], claimedListingIds: [], withdrawnListingIds: [], listingClaimOpen: false });
const handlerDeps = () => ({
  getFirebaseAdminApp: () => ({}), getFirestore: () => be.db,
  verifyIdToken: async (app, tok) => { if (!tok) throw new Error("no token"); return { uid: "anon" }; },
  readBearerToken: (req) => String(req.headers.authorization || "").replace(/^Bearer /, ""),
  readRequestBody: (req) => req.body,
  claimRateLimit: async () => true, hashClientIpAddress: () => "ip",
  readPublicStore: async (db, storeId) => { const p = be.store.get("storeProfiles/" + storeId); return p && p.status === "published" ? { id: "sp_" + storeId, description: String(p.description).trim(), sourceLanguage: p.sourceLanguage } : null; },
  translateDescriptions: async (items) => { state.translatorCalls++; if (state.translatorFails) throw new Error("simulated OpenAI failure"); const byId = {}; items.forEach((i) => { byId[i.id] = "EN: Long-established shop in Shuri. Lunch " + (i.description.match(/[\d,:]+/g) || []).join(" "); }); return { byId, usage: { inputTokens: 1, outputTokens: 1 }, estimatedCostUsd: 0 }; }
});
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return { status: 404, body: { success: false } };
  if (method === "POST") {
    let body = {}; try { body = JSON.parse(postData || "{}"); } catch {}
    state.apiCalls.push(body.mode);
    if (body.mode === "storeProfileTranslationGet") {
      const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
      const e = console.error; console.error = () => {};
      try { await TR.handleStoreProfileTranslationGet({ headers: { authorization: headers.Authorization || headers.authorization || "" }, body }, res, handlerDeps()); } finally { console.error = e; }
      return { status: res.code, body: res.body, delayMs: 150 };
    }
    // 無料掲載の紹介文の翻訳(既存)：この試験では訳を返さない(費用の発生する処理は呼ばない)
    if (body.mode === "shopTranslationGet") return { status: 200, body: { success: true, translations: {}, titleTranslations: {} } };
    return { status: 200, body: { success: false, message: "blocked in local test" } };
  }
  const mode = u.searchParams.get("mode");
  if (!mode) return { status: 200, body: { success: true, submissions: SUBMISSIONS } };
  if (mode === "publicStoreProfiles") return { status: 200, body: storeProfilesBody() };
  return { status: 200, body: { success: true, profiles: [], storeProfiles: [], articles: [], items: [], threads: [], posts: [], claimedListingIds: [], suppressedListingIds: [] } };
}
const langInit = (lang) => `try{ if(!sessionStorage.getItem("__l")){ sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;

seedProfiles();
const server = await serve(REPO_ROOT + "", 8881);
const browser = await launchChrome();
async function openTop(width = 390) {
  const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 800, state: { apiMock: api, blockUrls: ["maps.googleapis.com", "places.googleapis.com"], initScripts: [langInit("ja")] } });
  await p.goto("/");
  await p.waitFor(`typeof shops !== "undefined" && shops.some((s) => s.firestoreId === "L1") && storeProfileListStores.length === 2 && document.querySelector('#shopsList [data-shop-id="sp_S1"]')`, 20000);
  // 匿名認証(Firebase Auth)はこの試験では外へ出さないため、取得済みの token の代わりを使う
  await p.ev(`getAnonymousIdTokenForLocationCollection = async function() { return "tok-anon"; }; true`);
  await sleep(300);
  return p;
}
const card = (p, id) => p.ev(`(() => { const c = document.querySelector('#shopsList [data-shop-id="${id}"]'); if (!c) return null;
  const addr = [...c.querySelectorAll(".time-limit")].find((e) => e.textContent.includes("📍"));
  return { name: c.querySelector(".shop-name").textContent.trim(), desc: c.querySelector(".shop-description").textContent.trim(), addrText: addr ? addr.textContent.replace(/\\s+/g, " ").trim() : "", addrHtml: addr ? addr.innerHTML : "", jaLang: addr && addr.querySelector('[lang="ja"]') ? addr.querySelector('[lang="ja"]').textContent : null,
    overflow: c.scrollWidth > c.clientWidth + 1 }; })()`);
const modal = async (p, id) => { await p.ev(`openShopModal("${id}", "card"); true`); await sleep(400); const r = await p.ev(`document.getElementById("modalMessage").textContent`); await p.ev(`closeShopModal(); true`); await sleep(200); return r; };
const countMode = (m) => state.apiCalls.filter((x) => x === m).length;

try {
  // ===== 日本語 =====
  let p = await openTop(390);
  let c1 = await card(p, "sp_S1"), l1 = await card(p, "L1");
  t("J1 日本語：住所はそのまま(案内なし・従来の形)、紹介文は原文、店名は原文", c1.addrText === "📍 沖縄県那覇市首里当蔵町1-1" && !c1.addrHtml.includes("address-language-note") && l1.addrText === "📍 沖縄県那覇市久茂地1-1" && c1.desc === DESC1.replace(/\s+/g, " ").trim() || c1.desc === DESC1, { c1, l1 });
  t("J2 日本語：店主の紹介文の翻訳 API は呼ばない(費用なし)", countMode("storeProfileTranslationGet") === 0 && state.translatorCalls === 0, state.apiCalls);
  t("J3 日本語の詳細：住所に案内なし", !(await modal(p, "sp_S1")).includes("Address (in Japanese)"));

  // ===== 英語へ切り替え =====
  await p.ev(`switchMachinauLanguage("en"); true`);
  await sleep(150);
  c1 = await card(p, "sp_S1");
  t("E1 英語：訳が届く前は原文のまま表示(待機中は原文)", c1.desc.startsWith("首里の老舗です"), c1);
  await p.waitFor(`document.querySelector('#shopsList [data-shop-id="sp_S1"] .shop-description').textContent.includes("EN:")`, 10000);
  c1 = await card(p, "sp_S1"); l1 = await card(p, "L1"); const c2 = await card(p, "sp_S2");
  t("E2 英語：店主の紹介文は英語訳に差し替え(数字はそのまま)", c1.desc.startsWith("EN: Long-established shop in Shuri.") && c1.desc.includes("1,200") && c1.desc.includes("11:00"), c1);
  t("E3 英語：店名は日本語の原文のまま(訳さない)", c1.name === "首里テスト店" && l1.name === "テスト食堂");
  t("E4 英語：住所は「Address (in Japanese)」＋日本語の住所(lang=ja)。店主・運営の両方のカード",
    c1.addrText === "📍 Address (in Japanese)沖縄県那覇市首里当蔵町1-1" && c1.jaLang === "沖縄県那覇市首里当蔵町1-1" && l1.jaLang === "沖縄県那覇市久茂地1-1" && l1.addrText.startsWith("📍 Address (in Japanese)"), { c1, l1 });
  t("E5 英語：原文が英語の店舗(S2)は翻訳を頼まない・原文のまま", c2.desc === DESC_EN && state.translatorCalls === 1, { c2, calls: state.translatorCalls });
  t("E6 英語：翻訳の依頼は1回だけ(描き直しで繰り返さない)・紹介文は保存済み", countMode("storeProfileTranslationGet") === 1 && be.store.get("storeProfiles/S1").translations.en.description.status === "ready", state.apiCalls);
  const m1 = await modal(p, "sp_S1");
  t("E7 英語の詳細：紹介文は訳、住所は案内＋日本語", m1.includes("EN: Long-established shop in Shuri.") && m1.includes("Address (in Japanese)") && m1.includes("沖縄県那覇市首里当蔵町1-1"), m1.slice(0, 300));
  const ml = await modal(p, "L1");
  t("E8 英語の詳細(運営掲載)：住所に案内＋日本語", ml.includes("Address (in Japanese)") && ml.includes("沖縄県那覇市久茂地1-1"));
  t("E9 英語：はみ出しなし・エラーなし", !c1.overflow && !l1.overflow && p.log.errors.length === 0, p.log.errors);
  await p.ev(`switchMachinauLanguage("ja"); true`); await sleep(400);
  c1 = await card(p, "sp_S1");
  t("E10 日本語へ戻す：原文・住所の案内なし・新しい依頼なし", c1.desc.startsWith("首里の老舗です") && !c1.addrHtml.includes("address-language-note") && countMode("storeProfileTranslationGet") === 1, c1);
  await p.close();

  // ===== 保存済みの訳の再利用(別の閲覧者) =====
  p = await openTop(390);
  await p.ev(`switchMachinauLanguage("en"); true`);
  await p.waitFor(`document.querySelector('#shopsList [data-shop-id="sp_S1"] .shop-description').textContent.includes("EN:")`, 10000);
  t("C1 別の閲覧者：保存済みの訳をそのまま配信(翻訳の呼び出しは増えない)", state.translatorCalls === 1 && countMode("storeProfileTranslationGet") === 2, { calls: state.translatorCalls });
  await p.close();

  // ===== 原文の変更 =====
  state.desc1 = "首里の老舗です。ランチ1,500円。"; seedProfiles();
  p = await openTop(390);
  await p.ev(`switchMachinauLanguage("en"); true`);
  await p.waitFor(`document.querySelector('#shopsList [data-shop-id="sp_S1"] .shop-description').textContent.includes("EN:")`, 10000);
  t("S1 店主が紹介文を変えた：新しい原文で1回だけ訳し直し、新しい訳を表示", state.translatorCalls === 2 && (await card(p, "sp_S1")).desc.includes("EN:"), { calls: state.translatorCalls });
  await p.close();

  // ===== 翻訳の失敗 =====
  state.desc1 = "首里の老舗です。夜は18:00から。"; state.translatorFails = true; seedProfiles();
  p = await openTop(360);
  const before = countMode("storeProfileTranslationGet");
  await p.ev(`switchMachinauLanguage("en"); true`);
  await sleep(2500);
  c1 = await card(p, "sp_S1");
  t("F1 翻訳の失敗：原文のまま表示・住所の案内は出る・画面のエラーなし", c1.desc.startsWith("首里の老舗です。夜は18:00") && c1.addrText.startsWith("📍 Address (in Japanese)") && p.log.errors.length === 0, { c1, errors: p.log.errors });
  await p.ev(`renderShops(); true`); await sleep(500); await p.ev(`renderShops(); true`); await sleep(1500);
  t("F2 翻訳の失敗：描き直しても頼み直さない(呼び出しは1回だけ)", countMode("storeProfileTranslationGet") - before === 1 && state.translatorCalls === 3, { n: countMode("storeProfileTranslationGet") - before, calls: state.translatorCalls });
  const hScroll = await p.ev(`document.documentElement.scrollWidth > innerWidth + 1`);
  t("F3 360px 英語：横スクロールなし", hScroll === false);
  await p.close();
} catch (e) {
  t("unexpected error", false, String(e && e.stack || e));
} finally {
  browser.close(); server.close();
}
console.log(`TOTAL ${pass + fail} PASS ${pass} FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
