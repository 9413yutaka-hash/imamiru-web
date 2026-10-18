// STEP 31 UI: store-account.html payment method section. Store login faked in the browser; POST /api answered in-process
// by the REAL handler (mocked firebase-admin) with an in-memory Stripe stub; Stripe.js replaced by a fake served at the real
// js.stripe.com URL. No network to Stripe, no real data. run: node --import ./mockfa/register.mjs billing-ui-test.mjs [origin]
import { REPO_ROOT, REPO_URL, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = process.argv[2] || "http://127.0.0.1:8801";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { owner: pw("u1", "owner@example.com"), editor: pw("u5", "ed@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
S.docs.set("storeAccounts/s1", { storeName: "八重瀬の食堂", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
S.docs.set("storeMembers/s1_u1", { storeId: "s1", uid: "u1", role: "owner", status: "active" });
S.docs.set("storeMembers/s1_u5", { storeId: "s1", uid: "u5", role: "editor", status: "active" });
const ST = { calls: [], seq: 0, siStatus: "succeeded", intents: new Map() };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") return realFetch(url, opts);
  const form = Object.fromEntries(new URLSearchParams(opts.body || "")); ST.calls.push(opts.method + " " + u.pathname);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (u.pathname === "/v1/customers") return json(200, { id: "cus_ui1" });
  if (u.pathname === "/v1/setup_intents") { if (Object.keys(form).some((k) => k.startsWith("payment_method_types"))) return json(400, { error: { type: "invalid_request_error", code: "payment_method_types_no_longer_supported" } }); const allowed = form["allowed_payment_method_types[]"]; const id = "seti_ui" + ++ST.seq; ST.intents.set(id, { id, client_secret: id + "_secret_X", customer: form.customer, payment_method_types: allowed ? ["card", "link"].filter((x) => x === allowed) : ["card", "link"], metadata: { storeId: form["metadata[storeId]"] } }); return json(200, ST.intents.get(id)); }
  const m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if (m) return json(200, { ...ST.intents.get(m[1]), status: ST.siStatus, payment_method: ST.siStatus === "succeeded" ? { id: "pm_ui1", customer: ST.intents.get(m[1]).customer, card: { brand: "visa", last4: "4242", exp_month: 3, exp_year: 2031 } } : null });
  return json(404, { error: {} });
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const apiBodies = [];
async function api(url, method, log, postData, headers) {
  if (method !== "POST") return null;
  const body = JSON.parse(postData || "{}"); apiBodies.push(postData || "");
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1", ...(headers.Authorization || headers.authorization ? { authorization: headers.Authorization || headers.authorization } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return { status: r.code, body: r.body };
}
const stripeJsLoads = [];
const FAKE_STRIPE_JS = `window.Stripe = function (pk) { window.__stripePk = pk; return {
  elements: function (opts) { window.__elOpts = { clientSecret: opts.clientSecret, locale: opts.locale }; return { create: function (type, o) { window.__peType = type; return { mount: function (sel) { document.querySelector(sel).innerHTML = '<div class="fake-pe">[Stripe card field]</div>'; } }; } }; },
  confirmSetup: async function (args) { window.__confirmArgs = { redirect: args.redirect, returnUrl: args.confirmParams && args.confirmParams.return_url, hasElements: !!args.elements };
    const sc = window.__stripeScenario || "ok"; if (sc === "declined") return { error: { message: "Your card was declined." } };
    return { setupIntent: { id: window.__lastSetupIntentId, status: sc === "ok" ? "succeeded" : "requires_action" } }; } }; };`;
async function urlMock(url) { if (url.startsWith("https://js.stripe.com/")) { stripeJsLoads.push(url); return { raw: Buffer.from(FAKE_STRIPE_JS), contentType: "application/javascript" }; } return null; }
const fakeStoreAuth = (token) => `(() => { let fb; Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) { fb = v; if (v && v.initializeApp && !v.__wrapped) { const orig = v.initializeApp.bind(v); v.__wrapped = true; v.initializeApp = function(options, name) { if (name === 'machinauStoreAccount') { const u = { uid: "u", email: "owner@example.com", isAnonymous: false, emailVerified: true, getIdToken: async () => ${JSON.stringify(token)}, reload: async () => {} }; return { name, auth: () => ({ currentUser: u, onAuthStateChanged(cb) { setTimeout(() => cb(u), 0); return () => {}; }, signOut: async () => {} }) }; } return orig(options, name); }; } } }); })();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 400) : ""}`); };
const setEnv = (o) => { for (const k of ["STRIPE_MODE", "STRIPE_RESTRICTED_KEY", "STRIPE_PUBLISHABLE_KEY", "VERCEL_ENV"]) delete process.env[k]; Object.assign(process.env, o); };
const TEST_ENV = { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview" };
const server = process.argv[2] ? { close() {} } : await serve(REPO_ROOT + "", 8801);
const browser = await launchChrome();
async function open(token, lang = "ja", w = 390) {
  const p = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiPassthrough: true, apiMock: api, urlMock, initScripts: [fakeStoreAuth(token), langInit(lang)] } });
  await p.goto("/store-account.html"); await p.waitFor("document.querySelectorAll('#storeList > *').length >= 1", 12000); await sleep(1200);
  return p;
}
const sec = (p) => p.ev(`({ shown: !document.getElementById("billingSection").hidden, badge: !document.getElementById("billingTestBadge").hidden, status: document.getElementById("billingCardStatus").textContent, start: document.getElementById("billingStartButton").hidden ? "" : document.getElementById("billingStartButton").textContent, form: !document.getElementById("billingForm").hidden, submitDisabled: document.getElementById("billingSubmitButton").disabled, msg: document.getElementById("billingMessage").textContent, heading: document.querySelector("#billingSection h3").textContent })`);
try {
  for (const [env, label] of [[{}, "キー未設定"], [{ ...TEST_ENV, VERCEL_ENV: "production" }, "Production"], [{ ...TEST_ENV, STRIPE_PUBLISHABLE_KEY: "pk_" + "live_FAKE" }, "本番キー混入"]]) {
    setEnv(env); const p = await open("owner"); const s = await sec(p);
    t(`1 ${label}：お支払い方法の欄は表示しない・Stripe.jsを読み込まない`, !s.shown && stripeJsLoads.length === 0, s); await p.close();
  }
  setEnv(TEST_ENV);
  let p = await open("editor"); let s = await sec(p);
  t("2 owner以外（editor）には表示しない", !s.shown, s); await p.close();
  p = await open("owner"); s = await sec(p);
  t("3 テスト環境のowner：欄を表示・「テスト環境」・未登録・カード登録ボタン（Stripe.jsはまだ読み込まない）", s.shown && s.badge && s.status === "カードはまだ登録されていません。" && s.start === "カードを登録する" && stripeJsLoads.length === 0, s);
  await p.ev(`document.getElementById("billingStartButton").click(), true`);
  await p.waitFor(`!document.getElementById("billingForm").hidden`, 8000);
  await p.ev(`window.__lastSetupIntentId = window.__elOpts && window.__elOpts.clientSecret ? window.__elOpts.clientSecret.split("_secret_")[0] : ""; true`);
  const started = await p.ev(`({ pk: window.__stripePk, el: window.__elOpts, pe: window.__peType, mounted: !!document.querySelector("#billingPaymentElement .fake-pe") })`); s = await sec(p);
  t("4 登録開始：js.stripe.com/endive/stripe.js を読み込み、公開可能キー（pk_test_）とclient_secretでPayment Elementを表示", stripeJsLoads.length === 1 && stripeJsLoads[0] === "https://js.stripe.com/endive/stripe.js" && started.pk === FAKE_PK && /^seti_ui\d+_secret_X$/.test(started.el.clientSecret) && started.el.locale === "ja" && started.pe === "payment" && started.mounted && s.form, { started, loads: stripeJsLoads });
  t("5 同意にチェックするまで登録ボタンは押せない", s.submitDisabled === true, s);
  await p.ev(`(() => { const c = document.getElementById("billingConsentCheck"); c.checked = true; c.dispatchEvent(new Event("change")); return true; })()`);
  t("5b 同意すると押せる", (await sec(p)).submitDisabled === false);
  // declined
  await p.ev(`window.__stripeScenario = "declined"; document.getElementById("billingSubmitButton").click(); true`); await sleep(800);
  s = await sec(p);
  t("6 カード拒否（Stripeのエラー）→ Stripeのメッセージを表示・保存しない", s.msg === "Your card was declined." && !(S.docs.get("storeBilling/s1") || {}).test?.paymentMethodId, s);
  // requires_action
  ST.siStatus = "requires_action";
  await p.ev(`window.__stripeScenario = "action"; document.getElementById("billingSubmitButton").click(); true`); await sleep(1000);
  s = await sec(p);
  t("7 3Dセキュア未完了（サーバー照会でrequires_action）→ 案内を表示・保存しない", s.msg === "カード会社の認証が完了していません。もう一度お試しください。" && !(S.docs.get("storeBilling/s1") || {}).test?.paymentMethodId, s);
  // success
  ST.siStatus = "succeeded";
  await p.ev(`window.__stripeScenario = "ok"; document.getElementById("billingSubmitButton").click(); true`);
  await p.waitFor(`/登録しました/.test(document.getElementById("billingMessage").textContent)`, 8000);
  s = await sec(p); const ca = await p.ev(`window.__confirmArgs`);
  t("8 登録成功：confirmSetup（redirect:if_required）→ サーバー照会 → 「VISA •••• 4242（03/2031）」を表示・入力欄を閉じる", s.msg === "カードを登録しました。" && s.status.includes("VISA •••• 4242（03/2031）") && !s.form && s.start === "カードを変更する" && ca.redirect === "if_required" && ca.returnUrl.includes("/store-account.html?billingStore=s1"), { s, ca });
  const saved = S.docs.get("storeBilling/s1") || {};
  t("8b 保存はテスト用の項目だけ（顧客・支払い方法・カード表示情報・同意）", saved.test && saved.test.paymentMethodId === "pm_ui1" && saved.test.card.last4 === "4242" && saved.test.consentVersion && !saved.live, saved);
  t("9 マチナウのAPIにはカード番号・セキュリティコードを送っていない", !apiBodies.some((b) => /4242424242424242|"number"|"cvc"/.test(b)), apiBodies.slice(-3));
  const lay = await p.ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
  await p.screenshot(SHOTS_DIR + "/billing-ja-390.png", "#billingSection");
  const errs = [...new Set(p.log.errors)].filter((e) => !/RefererNotAllowed|404 local|sessionStorage/.test(e));
  t("10 スマホ390px：横スクロールなし・JSエラーなし", lay.sw <= lay.cw && errs.length === 0, { lay, errs });
  await p.close();
  // English + returning visit shows registered card
  p = await open("owner", "en", 1280); s = await sec(p);
  t("11 英語・PC：見出し・テスト表示・登録済みカード・変更ボタン", s.shown && s.heading.startsWith("Payment method") && s.status.includes("Registered card") && s.status.includes("VISA •••• 4242") && s.start === "Change card", s);
  await p.close();
  t("12 Stripe APIの呼び出しはサーバーのテスト用処理だけ（顧客・SetupIntentの作成と照会）", ST.calls.every((c) => /^(POST \/v1\/customers|POST \/v1\/setup_intents|GET \/v1\/setup_intents\/seti_ui\d+)$/.test(c)), ST.calls);
} catch (e) { console.error("HARNESS ERROR", e.stack); fail++; }
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
browser.close(); server.close(); process.exit(0);
