// STEP 44-C④ client: the owner's "monthly ¥100 customization charges" section on store-account.html (unpaid total,
// statuses, pay now, 3-D Secure with the existing PaymentIntent — confirmed by the server, never by the browser) and the
// admin close/charge panel on admin-billing.html. REAL moderate-submission handler on mocked firebase-admin in the Preview
// trial environment; Stripe API is an in-memory stub on the server side; Stripe.js in the browser is a fake that records
// the call. No real services, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-charge-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8876";
const ADMIN = "9413yutaka@gmail.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const FAKE_CHARGE_KEY = "rk_" + "test_FAKECHARGEKEYFORTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
Object.assign(process.env, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKECARDSETUPKEYONLY0001", STRIPE_CHARGE_RESTRICTED_KEY: FAKE_CHARGE_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const NOWS = Math.floor(Date.now() / 1000);
const tok = (email) => b64({ alg: "RS256" }) + "." + b64({ user_id: "a", sub: "a", email, exp: NOWS + 3600, iat: NOWS, aud: "chikashoku-app", iss: "https://securetoken.google.com/chikashoku-app", firebase: { sign_in_provider: "password" } }) + ".s";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u2: pw("u2", "owner@example.com"), [tok(ADMIN)]: pw("adm1", ADMIN) };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const ST = { pis: new Map(), creates: 0, seq: 0, modes: [], otherHosts: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname === "api.openai.com") return { ok: true, status: 200, json: async () => ({ results: [{ flagged: false }] }) };
  if (u.hostname !== "api.stripe.com") { ST.otherHosts++; throw new Error("unexpected host " + u.hostname); }
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + FAKE_CHARGE_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/payment_intents") {
    const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
    const mode = ST.modes.shift() || "succeed";
    const id = "pi_ui" + ++ST.seq;
    const pi = { id, amount: Number(form.amount), currency: "jpy", customer: form.customer, payment_method: form.payment_method, status: mode === "succeed" ? "succeeded" : "requires_payment_method", client_secret: id + "_secret_FAKE", created: Math.floor(Date.now() / 1000), metadata: { invoiceId: form["metadata[invoiceId]"], chargeAttempt: form["metadata[chargeAttempt]"] }, last_payment_error: mode === "succeed" ? null : { code: "authentication_required" } };
    ST.pis.set(id, pi); ST.creates++;
    return mode === "succeed" ? json(200, pi) : json(402, { error: { type: "card_error", code: "authentication_required", payment_intent: pi } });
  }
  const m = u.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
  if (opts.method === "GET" && m) { const pi = ST.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error" } }); }
  if (opts.method === "GET" && u.pathname === "/v1/payment_intents") return json(200, { data: [...ST.pis.values()].filter((p) => p.customer === u.searchParams.get("customer")), has_more: false });
  return json(404, { error: { type: "invalid_request_error" } });
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (/^(storeRegistrationRateLimits|storeBillingRateLimits)\//.test(k)) S.docs.delete(k); };
const posts = [];
let browserConfirms = 0;
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname === "/api/__fakeStripeConfirm") {
    // the fake Stripe.js reports here; this test then marks the PaymentIntent as authenticated on the Stripe side
    browserConfirms++;
    const pi = [...ST.pis.values()].find((p) => p.client_secret === u.searchParams.get("cs"));
    if (pi && u.searchParams.get("ok") === "1") pi.status = "succeeded";
    return { status: 200, body: {} };
  }
  if (u.pathname !== "/api/moderate-submission") return null;
  const e = console.error; console.error = () => {};
  try {
    if (method === "GET") { const r = res(); await handler({ method: "GET", headers: {}, query: Object.fromEntries(u.searchParams.entries()) }, r); return { status: r.code, body: r.body }; }
    const body = JSON.parse(postData || "{}"); posts.push(body); clearRate();
    const auth = headers.Authorization || headers.authorization;
    const r = res();
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r);
    return { status: r.code, body: r.body };
  } finally { console.error = e; }
}
let stripeAuthOk = true;
const urlMock = async (url) => {
  if (!/js\.stripe\.com/.test(url)) return null;
  const src = `window.Stripe = function (pk) { return { confirmCardPayment: async function (cs, opts) { window.__stripePk = pk; window.__stripeConfirm = { cs: cs, pm: opts && opts.payment_method }; await fetch("/api/__fakeStripeConfirm?cs=" + encodeURIComponent(cs) + "&ok=" + (window.__stripeAuthOk === false ? "0" : "1")); return { paymentIntent: { status: "succeeded" } }; } }; };`;
  return { raw: Buffer.from(src), contentType: "text/javascript" };
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
          const userObj = { uid: "u2", email: "owner@example.com", isAnonymous: false, emailVerified: true, providerData: [{ providerId: "password" }], getIdToken: async () => "u2", reload: async () => {} };
          return { name, auth: () => ({ currentUser: userObj, languageCode: "ja", onAuthStateChanged(cb) { setTimeout(() => cb(userObj), 0); return () => {}; }, signOut: async () => {} }) };
        }
        return orig(options, name);
      };
    }
  } });
})();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;

// ---- fixtures: u2 owns Bf; three invoices (paid / payment_failed / requires_action) ----
const at = Timestamp.fromMillis(Date.now() - 40 * 86400000);
S.docs.set("storeAccounts/Bf", { storeName: "海辺のカフェ", registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
S.docs.set("storeMembers/Bf_u2", { uid: "u2", storeId: "Bf", role: "owner", status: "active" });
S.docs.set("accountBilling/u2", { uid: "u2", test: { customerId: "cus_u2", paymentMethodId: "pm_u2", setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
S.docs.set("storeCustomPlans/Bf", { storeId: "Bf", status: "active", ownerUid: "u2", billingAccountUid: "u2", periodKind: "monthly", createdInPreview: true, subscribedAt: at, accessUntil: null, paymentStatus: "past_due", revision: 1 });
const base = (month, extra) => ({ storeId: "Bf", month, amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: "u2", billingAccountUid: "u2", createdInPreview: true, chargeScheduledFor: month + "-02", chargeScheduledAt: at, chargeAttempt: 1, chargeAttempts: [], chargeMode: "test", chargeCustomerId: "cus_u2", chargePaymentMethodId: "pm_u2", ...extra });
S.docs.set("storeCustomPlanInvoices/Bf_2026-08", base("2026-08", { status: "paid", paidAt: Timestamp.fromMillis(Date.now() - 50 * 86400000), paymentIntentId: "pi_old" }));
const failedAt = Date.now() - 86400000;
S.docs.set("storeCustomPlanInvoices/Bf_2026-09", base("2026-09", { status: "payment_failed", firstFailedAt: Timestamp.fromMillis(failedAt), nextRetryAt: Timestamp.fromMillis(failedAt + 3 * 86400000), suspendAt: Timestamp.fromMillis(failedAt + 14 * 86400000), retryCount: 0 }));
const piAuth = { id: "pi_auth1", amount: 100, currency: "jpy", customer: "cus_u2", payment_method: "pm_u2", status: "requires_action", client_secret: "pi_auth1_secret_FAKE", created: Math.floor(Date.now() / 1000), metadata: { invoiceId: "storeCustomPlan:Bf_2026-10", chargeAttempt: "1" } };
ST.pis.set(piAuth.id, piAuth);
S.docs.set("storeCustomPlanInvoices/Bf_2026-10", base("2026-10", { status: "requires_action", paymentIntentId: "pi_auth1", firstFailedAt: Timestamp.fromMillis(failedAt), suspendAt: Timestamp.fromMillis(failedAt + 14 * 86400000), nextRetryAt: null, retryCount: 0 }));

const server = await serve(REPO_ROOT + "", 8876);
const browser = await launchChrome();
const openAccount = async (lang = "ja", extraInit = []) => {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, urlMock, urlMockPattern: /js\.stripe\.com/, initScripts: [fakeStoreAuth, langInit(lang), ...extraInit] } });
  await p.goto("/store-account.html");
  await p.waitFor(`!document.getElementById("planPaymentSection").hidden && document.querySelectorAll("#planPayList .plan-pay-item").length === 3`, 20000); await sleep(300);
  return p;
};
const view = (p) => p.ev(`({ total: document.getElementById("planPayUnpaidTotal").hidden ? "" : document.getElementById("planPayUnpaidTotal").textContent, items: [...document.querySelectorAll("#planPayList .plan-pay-item")].map((i) => ({ text: i.innerText, unpaid: i.classList.contains("unpaid"), action: (i.querySelector("[data-plan-pay-action]") || {}).getAttribute ? i.querySelector("[data-plan-pay-action]").getAttribute("data-plan-pay-action") : "" })), msg: document.getElementById("planPayMessage").textContent })`);
try {
  let p = await openAccount("ja");
  let v = await view(p);
  t("V1 店主のご請求：未払い200円・3件（10月：本人認証が必要・9月：支払い失敗と次の再請求と停止の予定・8月：支払い済み）", v.total === "未払い：200円" && /2026\/10/.test(v.items[0].text) && /本人認証が必要/.test(v.items[0].text) && v.items[0].action === "authenticate" && /お支払いができませんでした/.test(v.items[1].text) && /次の自動の再請求/.test(v.items[1].text) && /表示を停止します/.test(v.items[1].text) && v.items[1].action === "pay_now" && /お支払い済み/.test(v.items[2].text) && v.items[2].action === "" && v.items[0].unpaid && !v.items[2].unpaid, v);
  t("V2 表示にカード・顧客・支払いの ID を出さない・試験用の請求の印", !/pm_|cus_|pi_|secret/.test(JSON.stringify(v)) && /試験用の請求/.test(v.items[0].text), v.items[0].text);
  // 3-D Secure: the browser completes the existing PaymentIntent; the server confirms with Stripe
  const createsBefore = ST.creates;
  await p.ev(`document.querySelector('[data-plan-pay-action="authenticate"]').click(), true`);
  await p.waitFor(`/お支払いが完了しました/.test(document.getElementById("planPayMessage").textContent)`, 15000); await sleep(300);
  const confirmInfo = await p.ev(`({ pk: window.__stripePk, c: window.__stripeConfirm })`);
  v = await view(p);
  t("A1 本人認証：既存の PaymentIntent の client_secret とカードで Stripe.js を呼ぶ（公開キーは pk_test）・新しい支払いは作らない", confirmInfo.pk === FAKE_PK && confirmInfo.c.cs === "pi_auth1_secret_FAKE" && confirmInfo.c.pm === "pm_u2" && ST.creates === createsBefore && browserConfirms === 1, confirmInfo);
  t("A2 サーバーが Stripe に照会して確定：10月分は支払い済み・未払いは100円に", S.docs.get("storeCustomPlanInvoices/Bf_2026-10").status === "paid" && v.total === "未払い：100円" && posts.some((b) => b.mode === "storeCustomPlanPaymentConfirm"), { status: S.docs.get("storeCustomPlanInvoices/Bf_2026-10").status, v });
  // pay now
  ST.modes = ["succeed"];
  await p.ev(`document.querySelector('[data-plan-pay-action="pay_now"]').click(), true`);
  await p.waitFor(`/お支払いが完了しました/.test(document.getElementById("planPayMessage").textContent) && document.getElementById("planPayUnpaidTotal").hidden`, 15000); await sleep(300);
  v = await view(p);
  t("P1 今すぐ支払う：9月分が支払い済み・未払いなし・ボタンなし・契約の支払いの状態は current に戻る", S.docs.get("storeCustomPlanInvoices/Bf_2026-09").status === "paid" && v.total === "" && v.items.every((i) => i.action === "") && S.docs.get("storeCustomPlans/Bf").paymentStatus === "current", { v, plan: S.docs.get("storeCustomPlans/Bf").paymentStatus });
  t("P2 JSエラーなし（ご請求・本人認証・支払い）", p.log.errors.length === 0, p.log.errors);
  await p.close();

  // authentication not completed in the browser → stays requires_action (the browser result is not trusted)
  const pi2 = { ...piAuth, id: "pi_auth2", client_secret: "pi_auth2_secret_FAKE", status: "requires_action", metadata: { invoiceId: "storeCustomPlan:Bf_2026-07", chargeAttempt: "1" } };
  ST.pis.set(pi2.id, pi2);
  S.docs.set("storeCustomPlanInvoices/Bf_2026-07", base("2026-07", { status: "requires_action", paymentIntentId: "pi_auth2", firstFailedAt: Timestamp.fromMillis(failedAt), suspendAt: Timestamp.fromMillis(failedAt + 14 * 86400000) }));
  p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, urlMock, urlMockPattern: /js\.stripe\.com/, initScripts: [fakeStoreAuth, langInit("en"), "window.__stripeAuthOk = false;"] } });
  await p.goto("/store-account.html");
  await p.waitFor(`!document.getElementById("planPaymentSection").hidden && !!document.querySelector('[data-plan-pay-action="authenticate"]')`, 20000); await sleep(300);
  const en = await p.ev(`document.getElementById("planPaymentSection").innerText`);
  t("E1 英語：見出し・状態・ボタンが英語", /Monthly ¥100 customization charges/.test(en) && /Authenticate and pay/.test(en) && !/本人認証|未払い/.test(en), en.slice(0, 300));
  await p.ev(`document.querySelector('[data-plan-pay-action="authenticate"]').click(), true`);
  await p.waitFor(`/Authentication was not completed/.test(document.getElementById("planPayMessage").textContent)`, 15000);
  t("E2 画面で認証が完了しなかった：サーバーの照会のとおり requires_action のまま（画面の表示で支払い済みにしない）", S.docs.get("storeCustomPlanInvoices/Bf_2026-07").status === "requires_action", S.docs.get("storeCustomPlanInvoices/Bf_2026-07").status);
  await p.close();

  // admin panel
  const authMock = async (url) => {
    if (url.includes("signInWithPassword")) return { body: { localId: "a", email: ADMIN, idToken: tok(ADMIN), refreshToken: "r", expiresIn: "3600", registered: true } };
    if (url.includes("lookup")) return { body: { users: [{ localId: "a", email: ADMIN, emailVerified: true, providerUserInfo: [{ providerId: "password", email: ADMIN }] }] } };
    return { body: { id_token: tok(ADMIN), refresh_token: "r", expires_in: "3600" } };
  };
  const a = await openPage(browser, { origin: ORIGIN, width: 1280, state: { apiPassthrough: true, apiMock: api, authMock, initScripts: ["window.confirm = () => true;"] } });
  await a.goto("/admin-billing.html"); await a.waitFor("document.readyState === 'complete'"); await sleep(800);
  await a.ev(`(() => { document.getElementById("adminEmail").value = ${JSON.stringify(ADMIN)}; document.getElementById("adminPassword").value = "x"; document.getElementById("loginButton").click(); return true; })()`);
  await a.waitFor(`document.getElementById("adminArea").classList.contains("visible")`, 20000); await sleep(500);
  const createsBeforeAdmin = ST.creates;
  await a.ev(`document.getElementById("customPlanChargeDryRunButton").click(), true`);
  await a.waitFor(`/請求の試算です/.test(document.getElementById("customPlanBillingMessage").textContent)`, 15000); await sleep(200);
  const dry = await a.ev(`({ msg: document.getElementById("customPlanBillingMessage").textContent, rows: document.querySelectorAll("#customPlanBillingResult tr").length, table: document.getElementById("customPlanBillingResult").innerText })`);
  t("M1 運営：請求の試算（Stripe に接続しない）・請求台帳の状態・試行・停止の予定を表示", dry.rows === 5 && /本人認証待ち/.test(dry.table) && /支払い済み/.test(dry.table) && ST.creates === createsBeforeAdmin, dry);
  await a.ev(`document.getElementById("customPlanCloseDryRunButton").click(), true`);
  await a.waitFor(`/締めの試算です|実行できませんでした/.test(document.getElementById("customPlanBillingMessage").textContent)`, 15000);
  const closeMsg = await a.ev(`document.getElementById("customPlanBillingMessage").textContent`);
  t("M2 運営：締めの試算（書き込みなし）", /締めの試算です/.test(closeMsg), closeMsg);
  t("M3 運営画面でJSエラーなし", a.log.errors.length === 0, a.log.errors);
  await a.close();
} finally {
  browser.close(); server.close();
}
t("Z1 Stripe 以外への外部通信なし", ST.otherHosts === 0, ST.otherHosts);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
