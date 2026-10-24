// STEP 44-B client: the owner's plan box on store-profile.html (subscribe / cancel / undo cancel / expiry, card required)
// and the read-only contract list on admin-billing.html. REAL moderate-submission handler on mocked firebase-admin in the
// Preview-trial environment (Preview + preview/stripe-card-setup + machinau-preview service account, all fake).
// No Stripe, no real services, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8875";
const ADMIN = "9413yutaka@gmail.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
Object.assign(process.env, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01" });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const NOWS = Math.floor(Date.now() / 1000);
const tok = (email) => b64({ alg: "RS256" }) + "." + b64({ user_id: "a", sub: "a", email, exp: NOWS + 3600, iat: NOWS, aud: "chikashoku-app", iss: "https://securetoken.google.com/chikashoku-app", firebase: { sign_in_provider: "password" } }) + ".s";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "owner@example.com"), u3: pw("u3", "nocard@example.com"), [tok(ADMIN)]: pw("adm1", ADMIN) };
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
      const r = res(); await handler({ method: "GET", headers: {}, query: q }, r);
      return { status: r.code, body: r.body };
    }
    const body = JSON.parse(postData || "{}"); posts.push(body);
    clearRate();
    const auth = headers.Authorization || headers.authorization;
    const r = res();
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.8", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r);
    return { status: r.code, body: r.body };
  } finally { console.error = e; }
}
const fakeStoreAuth = (uid) => `(() => {
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) {
    fb = v;
    if (v && v.initializeApp && !v.__wrapped) {
      const orig = v.initializeApp.bind(v);
      v.__wrapped = true;
      v.initializeApp = function(options, name) {
        if (name === 'machinauStoreAccount') {
          const userObj = { uid: "${uid}", email: "owner@example.com", isAnonymous: false, emailVerified: true, getIdToken: async () => "${uid}", reload: async () => {} };
          return { name, auth: () => ({ currentUser: userObj, onAuthStateChanged(cb) { setTimeout(() => cb(userObj), 0); return () => {}; } }) };
        }
        return orig(options, name);
      };
    }
  } });
})();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
const confirmYes = `window.confirm = () => true;`;

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(Date.now() - 86400000);
function seedStore(id, uid, name, lat) {
  S.docs.set("storeAccounts/" + id, { storeName: name, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: lat, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 3, categoryCode: "cafe_sweets", description: "無料の紹介文", moderationStatus: "passed", moderatedText: "無料の紹介文", businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/free1.webp", publicId: "machinau_store_profiles/" + id + "/free1", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
}
seedStore("S1", "u1", "海辺のカフェ", 26.21);
seedStore("S3", "u3", "カードなしの店", 26.23);
S.docs.set("accountBilling/u1", { uid: "u1", test: { customerId: "cus_u1", paymentMethodId: "pm_u1", setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });

const server = await serve(REPO_ROOT + "", 8875);
const browser = await launchChrome();
const openEditor = async (uid, store, lang = "ja") => {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, initScripts: [fakeStoreAuth(uid), langInit(lang), confirmYes] } });
  await p.goto("/store-profile.html?store=" + store);
  await p.waitFor(`!document.getElementById("customSection").hidden && !!document.getElementById("customPlanNote").textContent`, 20000); await sleep(300);
  return p;
};
const view = (p) => p.ev(`({ note: document.getElementById("customPlanNote").textContent, dates: document.getElementById("customPlanDates").hidden ? "" : document.getElementById("customPlanDates").textContent, trial: !document.getElementById("customPlanTrialNote").hidden, card: !document.getElementById("customPlanCardNote").hidden, sub: document.getElementById("customSubscribeButton").hidden ? null : { text: document.getElementById("customSubscribeButton").textContent, disabled: document.getElementById("customSubscribeButton").disabled }, cancel: document.getElementById("customCancelButton").hidden ? null : document.getElementById("customCancelButton").textContent, msg: document.getElementById("customPlanMessage").textContent, storyDisabled: document.getElementById("customStoryInput").disabled, saveHidden: document.getElementById("customSaveButton").hidden })`);
const click = (p, id) => p.ev(`document.getElementById("${id}").click(), true`);
try {
  let p = await openEditor("u1", "S1");
  let v = await view(p);
  t("U1 未契約（カード登録済み）：案内・試験の注意・「月額100円プランを申し込む」（押せる）・解約ボタンなし・有料の欄は編集不可", /未契約です/.test(v.note) && v.trial && !v.card && v.sub && v.sub.text === "月額100円プランを申し込む" && v.sub.disabled === false && v.cancel === null && v.storyDisabled && v.saveHidden, v);
  await click(p, "customSubscribeButton");
  await p.waitFor(`/申し込みました/.test(document.getElementById("customPlanMessage").textContent) && !document.getElementById("customStoryInput").disabled`, 15000); await sleep(300);
  v = await view(p);
  const plan1 = S.docs.get("storeCustomPlans/S1");
  t("U2 申込：「申し込みました。…まで利用できます」・契約中・申込と利用期限の表示・解約ボタン・有料の欄が編集できる", /申し込みました。.*まで利用できます/.test(v.msg) && /契約中です/.test(v.note) && /申込：/.test(v.dates) && /利用期限：/.test(v.dates) && v.cancel === "解約する" && v.sub === null && !v.storyDisabled && !v.saveHidden && plan1 && plan1.status === "active" && plan1.ownerUid === "u1", { v, plan1 });
  t("U3 申込の API は1回だけ（ボタンの連打防止・申込後はボタンを隠す）", posts.filter((b) => b.mode === "storeCustomPlanSubscribe").length === 1);
  await p.ev(`(() => { const s = document.getElementById("customStoryInput"); s.value = "祖母が始めた喫茶店です。"; s.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("customSaveButton").click(); return true; })()`);
  await p.waitFor(`/保存しました/.test(document.getElementById("customMessage").textContent)`, 15000);
  t("U4 契約中に有料の欄を保存できる", (S.docs.get("storeCustomProfiles/S1") || {}).story === "祖母が始めた喫茶店です。");
  await click(p, "customCancelButton");
  await p.waitFor(`/解約手続きをしました/.test(document.getElementById("customPlanMessage").textContent)`, 15000); await sleep(300);
  v = await view(p);
  t("U5 解約：「解約手続きをしました。…までは利用できます」・解約手続き済みの案内と日時・「解約を取り消して続ける」・期限内なので編集できる", /解約手続きをしました/.test(v.msg) && /解約手続き済みです/.test(v.note) && /解約手続き：/.test(v.dates) && v.sub && v.sub.text === "解約を取り消して続ける" && v.cancel === null && !v.storyDisabled && S.docs.get("storeCustomPlans/S1").status === "canceling", v);
  await click(p, "customSubscribeButton");
  await p.waitFor(`/解約を取り消しました/.test(document.getElementById("customPlanMessage").textContent)`, 15000); await sleep(300);
  v = await view(p);
  t("U6 解約の取り消し：契約中に戻る・利用期限は同じ", /契約中です/.test(v.note) && v.cancel === "解約する" && S.docs.get("storeCustomPlans/S1").status === "active" && S.docs.get("storeCustomPlans/S1").accessUntil.toMillis() === plan1.accessUntil.toMillis(), v);
  t("U7 JSエラーなし（申込・解約）", p.log.errors.length === 0, p.log.errors);
  await p.close();

  // expiry
  S.docs.set("storeCustomPlans/S1", { ...S.docs.get("storeCustomPlans/S1"), status: "canceling", canceledAt: Timestamp.fromMillis(Date.now() - 2000), accessUntil: Timestamp.fromMillis(Date.now() - 1000) });
  p = await openEditor("u1", "S1");
  v = await view(p);
  t("U8 利用期限の終了後：「利用期限（…）が終了しました」・データは残っている案内・「申し込む」・編集不可", /が終了しました/.test(v.note) && /削除されていません/.test(v.note) && v.sub && v.sub.text === "月額100円プランを申し込む" && v.storyDisabled && v.saveHidden, v);
  await p.close();
  p = await openEditor("u1", "S1", "en");
  v = await view(p);
  t("U9 英語：期限切れの案内・ボタン・試験の注意が英語", /The plan ended on/.test(v.note) && v.sub && v.sub.text === "Subscribe to the monthly ¥100 plan" && v.trial && !/[ぁ-んァ-ン]/.test(v.note + v.sub.text), v);
  await p.close();

  // no card
  p = await openEditor("u3", "S3");
  v = await view(p);
  t("U10 カード未登録：「申し込む」は押せない・カード登録の案内と store-account.html へのリンク", v.sub && v.sub.disabled === true && v.card === true && (await p.ev(`document.querySelector("#customPlanCardNote a").getAttribute("href")`)) === "store-account.html", v);
  t("U11 カード未登録の画面から申込の API を呼ばない", !posts.some((b) => b.mode === "storeCustomPlanSubscribe" && b.storeId === "S3"));
  await p.close();

  // admin list
  const authMock = async (url) => {
    if (url.includes("signInWithPassword")) return { body: { localId: "a", email: ADMIN, idToken: tok(ADMIN), refreshToken: "r", expiresIn: "3600", registered: true } };
    if (url.includes("lookup")) return { body: { users: [{ localId: "a", email: ADMIN, emailVerified: true, providerUserInfo: [{ providerId: "password", email: ADMIN }] }] } };
    return { body: { id_token: tok(ADMIN), refresh_token: "r", expires_in: "3600" } };
  };
  const a = await openPage(browser, { origin: ORIGIN, width: 1280, state: { apiPassthrough: true, apiMock: api, authMock } });
  await a.goto("/admin-billing.html"); await a.waitFor("document.readyState === 'complete'"); await sleep(800);
  await a.ev(`(() => { document.getElementById("adminEmail").value = ${JSON.stringify(ADMIN)}; document.getElementById("adminPassword").value = "x"; document.getElementById("loginButton").click(); return true; })()`);
  await a.waitFor(`!!document.querySelector("#customPlanList table")`, 20000); await sleep(300);
  const adminView = await a.ev(`({ text: document.getElementById("customPlanPanel").innerText, rows: document.querySelectorAll("#customPlanList tr").length, buttons: [...document.querySelectorAll("#customPlanPanel button")].map((b) => b.id) })`);
  t("A1 運営：契約一覧に店舗・状態・申込日時・利用期限・解約日時・種類（試験）", adminView.rows === 2 && /海辺のカフェ/.test(adminView.text) && /利用期限の終了/.test(adminView.text) && /試験/.test(adminView.text) && /申込日時/.test(adminView.text) && /解約日時/.test(adminView.text), adminView);
  t("A2 契約一覧の欄のボタンは「読み込み直す」だけ（変更・解約・請求のボタンなし）", JSON.stringify(adminView.buttons) === '["customPlanReloadButton"]', adminView.buttons);
  t("A3 運営画面でJSエラーなし", a.log.errors.length === 0, a.log.errors);
  await a.close();
} finally {
  browser.close(); server.close();
}
t("Z1 想定外の通信なし（Stripe 等への通信なし）", otherNetwork === 0, otherNetwork);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
