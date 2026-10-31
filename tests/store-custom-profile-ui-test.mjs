// STEP 44-A client: the owner editor section (store-profile.html) and the traveler detail (index.html / app.js)
// for the paid store customization. REAL moderate-submission handler on mocked firebase-admin; Chrome talks to it
// through request interception. Store login is a fake named Firebase app; Cloudinary upload, OpenAI Moderation and
// Cloudinary destroy are local stubs. No real services, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-profile-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8874";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
process.env.OPENAI_API_KEY = "sk-" + "fake-openai-for-tests"; process.env.CLOUDINARY_API_KEY = "fake-cloudinary-key"; process.env.CLOUDINARY_API_SECRET = "fake-cloudinary-secret";
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
  if (u.hostname === "api.cloudinary.com") return { ok: true, status: 200, json: async () => ({ result: "ok" }) };
  otherNetwork++; throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
const posts = [];
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return null;
  const e = console.error; console.error = () => {};
  try {
    if (method === "GET") {
      const q = Object.fromEntries(u.searchParams.entries());
      if (q.mode && q.mode !== "publicStoreProfiles") return { status: 200, body: { success: true, posts: [], articles: [], stores: [] } };
      const r = res(); await handler({ method: "GET", headers: {}, query: q }, r);
      return { status: r.code, body: r.body };
    }
    const body = JSON.parse(postData || "{}"); posts.push(body);
    clearRate();
    const auth = headers.Authorization || headers.authorization;
    const r = res();
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r);
    return { status: r.code, body: r.body };
  } finally { console.error = e; }
}
const uploads = [];
let uploadSeq = 0;
const urlMock = async (url, method, postData) => {
  if (!/api\.cloudinary\.com\/v1_1\/[^/]+\/image\/upload/.test(url)) return null;
  const folder = (String(postData).match(/name="folder"\r\n\r\n([^\r]+)/) || [])[1] || "";
  const id = "img" + (++uploadSeq);
  uploads.push(folder);
  return { body: { secure_url: "https://res.cloudinary.com/cdhyctnp/image/upload/v1700000001/" + folder + "/" + id + ".webp", public_id: folder + "/" + id } };
};
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

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(Date.now() - 86400000);
function seedStore(id, uid, name, lat) {
  S.docs.set("storeAccounts/" + id, { storeName: name, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: lat, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 3, categoryCode: "cafe_sweets", description: "無料の紹介文", moderationStatus: "passed", moderatedText: "無料の紹介文", businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/free1.webp", publicId: "machinau_store_profiles/" + id + "/free1", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
}
seedStore("S1", "u1", "海辺のカフェ", 26.21);
seedStore("S2", "u9", "となりの食堂", 26.22);
const setPlan = (status, until) => S.docs.set("storeCustomPlans/S1", { storeId: "S1", status, accessUntil: until, ownerUid: "u1" });

const server = await serve(REPO_ROOT + "", 8874);
const browser = await launchChrome();
const openEditor = async (lang = "ja") => {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, urlMock, urlMockPattern: /api\.cloudinary\.com/, initScripts: [fakeStoreAuth, langInit(lang)] } });
  await p.goto("/store-profile.html?store=S1");
  await p.waitFor(`!document.getElementById("customSection").hidden && !!document.getElementById("customPlanNote").textContent`, 20000); await sleep(300);
  return p;
};
const editorView = (p) => p.ev(`({ note: document.getElementById("customPlanNote").textContent, saveHidden: document.getElementById("customSaveButton").hidden, addMenuDisabled: document.getElementById("customMenuAddButton").disabled, addLinkDisabled: document.getElementById("customLinkAddButton").disabled, storyDisabled: document.getElementById("customStoryInput").disabled, freeSaveDisabled: document.getElementById("saveButton").disabled, freeVisible: !document.getElementById("editorArea").hidden, items: document.querySelectorAll("#customMenuList .custom-item").length, msg: document.getElementById("customMessage").textContent })`);
try {
  // ===== editor: no plan =====
  let p = await openEditor("ja");
  let v = await editorView(p);
  // STEP 50-D｜代表決定 B案：契約前でもメニュー・リンク・ストーリーを入力・保存・編集できる(公開だけが契約で決まる)。
  t("E1 未契約：「契約していません」「非公開」の案内・保存ボタンあり・追加ボタンと入力が使える（STEP 50-D）", /月額契約をしていません/.test(v.note) && /非公開/.test(v.note) && !v.saveHidden && !v.addMenuDisabled && !v.addLinkDisabled && !v.storyDisabled, v);
  t("E2 未契約でも無料の店舗情報の編集はこれまでどおり使える（無料の保存ボタンは有効）", v.freeVisible && v.freeSaveDisabled === false, v);
  await p.ev(`(() => {
    const set = (el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(document.getElementById("customStoryInput"), "契約前に書いたストーリー");
    document.getElementById("customMenuAddButton").click();
    set(document.getElementById("custom-name-0"), "契約前のメニュー");
    document.getElementById("customLinkAddButton").click();
    const row = document.querySelector("#customLinkRows .custom-link-row");
    const select = row.querySelector("select"); select.value = "website"; select.dispatchEvent(new Event("change", { bubbles: true }));
    set(row.querySelector(".custom-link-url"), "https://example.com/before");
    document.getElementById("customSaveButton").click();
    return true;
  })()`);
  await p.waitFor(`/保存しました/.test(document.getElementById("customMessage").textContent)`, 20000); await sleep(300);
  let draft = S.docs.get("storeCustomProfiles/S1") || {};
  t("E3 未契約：画面からメニュー・リンク・ストーリーを保存できる（契約は作らない）", draft.revision === 1 && draft.menuItems.length === 1 && draft.menuItems[0].name === "契約前のメニュー" && draft.links.length === 1 && draft.links[0].url === "https://example.com/before" && draft.story === "契約前に書いたストーリー" && !S.docs.has("storeCustomPlans/S1"), draft);
  t("E4 JSエラーなし（未契約）", p.log.errors.length === 0, p.log.errors);
  await p.close();
  for (const k of [...S.docs.keys()]) if (k.startsWith("storeRateLimits/")) S.docs.delete(k);
  p = await openEditor("ja");
  const reopened = await p.ev(`({ story: document.getElementById("customStoryInput").value, menu: document.getElementById("custom-name-0") && document.getElementById("custom-name-0").value, link: (document.querySelector("#customLinkRows .custom-link-url") || {}).value })`);
  await p.ev(`(() => { const el = document.getElementById("customStoryInput"); el.value = "契約前に書き直したストーリー"; el.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("customSaveButton").click(); return true; })()`);
  await p.waitFor(`/保存しました/.test(document.getElementById("customMessage").textContent)`, 20000); await sleep(300);
  draft = S.docs.get("storeCustomProfiles/S1") || {};
  t("E3b 未契約：開き直すと保存済みの内容が表示され、再編集して保存できる（revision 2）", reopened.story === "契約前に書いたストーリー" && reopened.menu === "契約前のメニュー" && reopened.link === "https://example.com/before" && draft.revision === 2 && draft.story === "契約前に書き直したストーリー" && draft.menuItems.length === 1, { reopened, draft });
  await p.close();
  // 以降(契約中の編集)は「保存の無い状態」から始める前提なので、模擬データ(メモリー上)の保存内容と連続保存の制限だけを初期化する。
  S.docs.delete("storeCustomProfiles/S1");
  for (const k of [...S.docs.keys()]) if (k.startsWith("storeRateLimits/")) S.docs.delete(k);

  // ===== editor: active plan =====
  setPlan("active", Timestamp.fromMillis(Date.now() + 30 * 86400000));
  p = await openEditor("ja");
  v = await editorView(p);
  t("E5 契約中：「契約中です」と利用期限・保存ボタンあり・追加できる", /契約中です/.test(v.note) && /\d{4}年/.test(v.note) && !v.saveHidden && !v.addMenuDisabled && !v.addLinkDisabled && !v.storyDisabled, v);
  await p.ev(`(async () => {
    const set = (el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
    set(document.getElementById("customStoryInput"), "祖母が始めた喫茶店です。\\n今は孫が継いでいます。");
    document.getElementById("customMenuAddButton").click();
    document.getElementById("customMenuAddButton").click();
    set(document.getElementById("custom-name-0"), "ちんすこうラテ");
    set(document.getElementById("custom-priceText-0"), "¥650");
    set(document.getElementById("custom-description-0"), "自家製のちんすこう入り");
    set(document.getElementById("custom-name-1"), "<img src=x onerror=alert(1)>本日のケーキ");
    document.querySelector('[data-custom-action="photo"][data-custom-index="0"]').click();
    const canvas = document.createElement("canvas"); canvas.width = 40; canvas.height = 30; canvas.getContext("2d").fillRect(0, 0, 40, 30);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "a.png", { type: "image/png" }));
    const input = document.getElementById("customPhotoInput"); input.files = dt.files; input.dispatchEvent(new Event("change"));
    document.getElementById("customLinkAddButton").click();
    const row = document.querySelector("#customLinkRows .custom-link-row");
    const select = row.querySelector("select"); select.value = "instagram"; select.dispatchEvent(new Event("change", { bubbles: true }));
    set(row.querySelector(".custom-link-url"), "https://www.instagram.com/example_cafe");
    return true;
  })()`);
  await p.waitFor(`!!document.querySelector("#customMenuList .custom-item-photo img")`, 10000); await sleep(500);
  await p.ev(`document.getElementById("customSaveButton").click(), true`);
  await p.waitFor(`/保存しました/.test(document.getElementById("customMessage").textContent)`, 20000); await sleep(300);
  const saved = S.docs.get("storeCustomProfiles/S1") || {};
  t("E6 保存：2商品・写真・リンク・ストーリーがサーバーに保存される", saved.revision === 1 && saved.menuItems.length === 2 && saved.menuItems[0].name === "ちんすこうラテ" && saved.menuItems[0].priceText === "¥650" && /^machinau_store_profiles\/S1\/menu\/img\d+$/.test(saved.menuItems[0].photo.publicId) && saved.links[0].type === "instagram" && saved.story.includes("\n"), saved);
  t("E7 商品写真は商品写真の署名（purpose storeCustomMenuPhoto）で、商品写真のフォルダーへアップロード", JSON.stringify(uploads) === '["machinau_store_profiles/S1/menu"]' && posts.some((b) => b.mode === "cloudinarySignature" && b.purpose === "storeCustomMenuPhoto"), { uploads });
  t("E8 無料の店舗情報（storeProfiles）は変わらない（revision 3 のまま・有料の項目なし）", S.docs.get("storeProfiles/S1").revision === 3 && !("menuItems" in S.docs.get("storeProfiles/S1")));
  await p.ev(`(() => { const u = document.querySelector("#customLinkRows .custom-link-url"); u.value = "http://insecure.example.com/"; u.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("customSaveButton").click(); return true; })()`);
  await p.waitFor(`/リンク1/.test(document.getElementById("customMessage").textContent)`, 15000);
  v = await editorView(p);
  t("E9 http:// のリンク：保存せず「リンク1：https:// で始まる…」を表示", /リンク1：https:\/\//.test(v.msg) && S.docs.get("storeCustomProfiles/S1").revision === 1, v.msg);
  t("E10 JSエラーなし（契約中の編集・保存）", p.log.errors.length === 0, p.log.errors);
  await p.close();
  p = await openEditor("en");
  v = await editorView(p);
  const enText = await p.ev(`document.getElementById("customSection").innerText`);
  t("E11 英語：見出し・案内・項目名が英語（保存済みの内容は読み込み済み）", enText.includes("Store card (¥100/month, tax included)") && /Your contract is active/.test(v.note) && /Item 1/.test(enText) && v.items === 2 && !/商品名|契約中/.test(enText), enText.slice(0, 400));
  await p.close();

  // ===== editor: shop-wide 5 photo limit =====
  p = await openEditor("ja");
  const addPhoto = (i) => p.ev(`(async () => {
    document.querySelector('[data-custom-action="photo"][data-custom-index="${i}"]').click();
    const canvas = document.createElement("canvas"); canvas.width = 20; canvas.height = 20; canvas.getContext("2d").fillRect(0, 0, 20, 20);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "p.png", { type: "image/png" }));
    const input = document.getElementById("customPhotoInput"); input.files = dt.files; input.dispatchEvent(new Event("change"));
    return true;
  })()`);
  await p.ev(`(() => { const set = (el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }; for (let i = 0; i < 4; i++) document.getElementById("customMenuAddButton").click(); for (let i = 2; i < 6; i++) set(document.getElementById("custom-name-" + i), "追加の商品" + i); return true; })()`);
  for (const i of [1, 2, 3, 4]) { await addPhoto(i); await p.waitFor(`document.querySelectorAll("#customMenuList .custom-item-photo img").length >= ${i + 1}`, 10000); }
  await sleep(500);
  const cap = await p.ev(`({ count: document.getElementById("customPhotoCount").textContent, sixthDisabled: document.querySelector('[data-custom-action="photo"][data-custom-index="5"]').disabled, changeEnabled: !document.querySelector('[data-custom-action="photo"][data-custom-index="0"]').disabled, imgs: document.querySelectorAll("#customMenuList .custom-item-photo img").length })`);
  t("E12 写真5枚：「商品写真 5 / 5枚」・写真の無い6件目は「写真を選ぶ」を押せない・登録済みの写真の差し替えはできる", cap.count === "商品写真 5 / 5枚" && cap.sixthDisabled === true && cap.changeEnabled === true && cap.imgs === 5, cap);
  uploads.length = 0;
  await p.ev(`document.getElementById("customSaveButton").click(), true`);
  const savedWait = await p.waitFor(`/保存しました/.test(document.getElementById("customMessage").textContent)`, 20000); await sleep(300);
  const saved5 = S.docs.get("storeCustomProfiles/S1");
  t("E13 6商品・写真5枚で保存（写真の無い商品も保存）・新しい4枚だけアップロード", savedWait >= 0 && saved5.menuItems.length === 6 && saved5.menuItems.filter((x) => x.photo).length === 5 && saved5.menuItems[5].photo === null && uploads.length === 4, { n: saved5.menuItems.length, uploads: uploads.length });
  await p.ev(`document.querySelector('[data-custom-action="photo-remove"][data-custom-index="1"]').click(), true`);
  const afterRemove = await p.ev(`({ count: document.getElementById("customPhotoCount").textContent, sixthDisabled: document.querySelector('[data-custom-action="photo"][data-custom-index="5"]').disabled })`);
  t("E14 1枚外すと「4 / 5枚」・6件目に写真を追加できる", afterRemove.count === "商品写真 4 / 5枚" && afterRemove.sixthDisabled === false, afterRemove);
  t("E15 JSエラーなし（写真の上限）", p.log.errors.length === 0, p.log.errors);
  await p.close();
  // restore the content the traveler checks below expect (2 items, 1 photo)
  S.docs.set("storeCustomProfiles/S1", saved);

  // ===== traveler detail =====
  const openTop = async (lang = "ja", w = 390) => {
    const q = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiMock: api, articles: [], initScripts: [langInit(lang)] } });
    await q.goto("/"); await q.waitFor(`typeof storeProfileListStores !== "undefined" && storeProfileListStores.length === 2`, 20000); await sleep(800);
    return q;
  };
  const detail = (q, id) => q.ev(`(() => { openShopModal(${JSON.stringify(id)}, "card"); const m = document.getElementById("modalMessage"); const c = m.querySelector(".shop-custom"); return { has: !!c, text: c ? c.innerText : "", html: c ? c.innerHTML : "", imgs: c ? [...c.querySelectorAll("img")].map((i) => i.getAttribute("src")) : [], links: c ? [...c.querySelectorAll("a")].map((a) => ({ href: a.getAttribute("href"), target: a.target, rel: a.rel, text: a.textContent })) : [], headings: c ? [...c.querySelectorAll(".shop-custom-heading")].map((h) => h.textContent) : [], all: m.innerText }; })()`);
  let q = await openTop("ja");
  let d = await detail(q, "sp_S1");
  t("D1 契約中の店舗の詳細：ストーリー・メニュー・リンクの3つの見出しと内容", d.has && JSON.stringify(d.headings) === '["お店のこだわり・ストーリー","メニュー・商品","リンク"]' && /祖母が始めた喫茶店です。\n今は孫が継いでいます。/.test(d.text) && /ちんすこうラテ/.test(d.text) && /¥650/.test(d.text) && /自家製のちんすこう入り/.test(d.text), d);
  t("D2 商品写真は商品写真の URL だけ（1枚）・価格が空の商品は価格を出さない", d.imgs.length === 1 && /\/machinau_store_profiles\/S1\/menu\/img\d+\.webp$/.test(d.imgs[0]) && (d.html.match(/shop-custom-menu-price/g) || []).length === 1, d);
  t("D3 文字はエスケープ（商品名の <img onerror> は文字のまま・要素にならない）", d.imgs.length === 1 && d.text.includes("<img src=x onerror=alert(1)>本日のケーキ"), d.text);
  t("D4 リンクは https・新しいタブ・noopener noreferrer nofollow・表示名が空なら種類の名前（Instagram）", d.links.length === 1 && d.links[0].href === "https://www.instagram.com/example_cafe" && d.links[0].target === "_blank" && /noopener/.test(d.links[0].rel) && /noreferrer/.test(d.links[0].rel) && /nofollow/.test(d.links[0].rel) && d.links[0].text === "Instagram", d.links);
  // STEP 50-B(代表決定 2026-10-31)｜未契約の店舗カードは一覧に出ないため、旅行者は詳細を開けない。
  const listed = await q.ev(`storeProfileListStores.map((s) => s.id)`);
  t("D5 未契約の店舗（S2）は正式店舗の一覧に出ない（STEP 50-B）", Array.isArray(listed) && !listed.includes("sp_S2"), listed);
  await detail(q, "sp_S1");
  const cards = await q.ev(`(() => { const inModal = document.getElementById("shopModal").innerHTML.includes("ちんすこうラテ"); const clone = document.body.cloneNode(true); clone.querySelector("#shopModal").remove(); return { inModal, outside: clone.innerHTML.includes("ちんすこうラテ") || clone.innerHTML.includes("shop-custom") }; })()`);
  t("D6 有料の内容は詳細の中だけ（詳細の外＝一覧カード等には出さない）", cards.inModal === true && cards.outside === false, cards);
  const order = await q.ev(`storeProfileListStores.map((s) => s.id).join(",")`);
  t("D7 正式店舗の一覧は契約中の店舗だけ（STEP 50-B）", order === "sp_S1", order);
  t("D8 TOPでJSエラーなし", q.log.errors.filter((x) => !/RefererNotAllowed|Google Maps/.test(x)).length === 0, q.log.errors);
  await q.close();
  q = await openTop("en", 1280);
  d = await detail(q, "sp_S1");
  t("D9 英語・PC：見出しは英語（Our story / Menu and products / Links）", JSON.stringify(d.headings) === '["Our story","Menu and products","Links"]', d.headings);
  await q.close();
  setPlan("canceling", Timestamp.fromMillis(Date.now() - 1000));
  q = await openTop("ja");
  d = await detail(q, "sp_S1");
  t("D10 利用期限が過ぎた後：詳細に有料の内容を出さない（データは残る）", !d.has && S.docs.get("storeCustomProfiles/S1").menuItems.length === 2, d);
  await q.close();
} finally {
  browser.close(); server.close();
}
t("Z1 想定外の通信なし", otherNetwork === 0, otherNetwork);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
