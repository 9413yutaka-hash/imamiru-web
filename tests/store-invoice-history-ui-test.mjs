// STEP 38-B UI: store-account.html "ご請求の履歴" (read-only). Store login faked in the browser; POST /api answered
// in-process by the REAL handler on mocked firebase-admin. No Stripe, no network to real services, no real data.
// run: node --import ./tests/mockfa/register.mjs tests/store-invoice-history-ui-test.mjs
import { REPO_ROOT, REPO_URL, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8816";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { owner: pw("u1", "owner@example.com"), editor: pw("u5", "ed@example.com"), emptyOwner: pw("u3", "empty@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
// mockのFirestoreは globalThis.__MOCK_DB を読み込み時に取り込むため、上で用意した後に読み込む。
const { Timestamp } = await import("firebase-admin/firestore");
let stripeCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => { if (String(url).includes("stripe.com")) { stripeCalls++; throw new Error("no stripe"); } return realFetch(url, opts); };

const store = (name) => ({ storeName: name, enabled: true, createdByType: "storeUser", registrationStatus: "active" });
S.docs.set("storeAccounts/s1", store("八重瀬の食堂"));
S.docs.set("storeAccounts/s3", store("請求なしの店"));
S.docs.set("storeMembers/s1_u1", { storeId: "s1", uid: "u1", role: "owner", status: "active" });
S.docs.set("storeMembers/s1_u5", { storeId: "s1", uid: "u5", role: "editor", status: "active" });
S.docs.set("storeMembers/s3_u3", { storeId: "s3", uid: "u3", role: "owner", status: "active" });
const XSS = `<img src=x onerror="window.__xss=1">`;
S.docs.set("imadakePosts/p1", { storeId: "s1", headline: "ランチ半額", cvBillingEnabled: true, status: "published" });
S.docs.set("imadakePosts/p2", { storeId: "s1", headline: XSS, cvBillingEnabled: true, status: "published" });
const jstMonth = (offset) => { const d = new Date(Date.now() + 9 * 3600 * 1000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1)).toISOString().slice(0, 7); };
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const SECRET = { paymentIntentId: "pi_FAKESECRET001", chargeCustomerId: "cus_FAKESECRET", chargePaymentMethodId: "pm_FAKESECRET", chargeIdempotencyKey: "idem-FAKE", closedByUid: "adm1", lastChargeError: { code: "card_declined" } };
const statuses = ["closed", "paid", "payment_failed", "requires_action", "closing", "needs_review", "processing"];
statuses.forEach((status, i) => {
  const month = jstMonth(i + 1);
  S.docs.set(`imadakeMonthlyInvoices/s1_${month}`, { storeId: "s1", month, status, lineCount: 1, amountJpy: 100, currency: "JPY", closedAt: Timestamp.fromMillis(Date.parse(month + "-01T00:00:00Z") + 33 * 86400000), paidAt: status === "paid" ? Timestamp.fromMillis(Date.parse(month + "-01T00:00:00Z") + 35 * 86400000) : undefined, ...SECRET });
});
const M1 = jstMonth(1);
S.docs.set(`imadakePostDailyCharges/p2_${M1}-05`, { postId: "p2", storeId: "s1", jstDate: `${M1}-05`, status: "invoiced", invoiceId: `s1_${M1}`, amountJpy: 100, currency: "JPY", validCvCount: 1 });
S.docs.set(`imadakePostDailyCharges/p1_${TODAY}`, { postId: "p1", storeId: "s1", jstDate: TODAY, status: "accrued", amountJpy: 100, currency: "JPY", validCvCount: 2 });

const BRANCH = "preview/stripe-card-setup";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
const setEnv = (o) => { for (const k of ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW", "STRIPE_MODE", "STRIPE_RESTRICTED_KEY", "STRIPE_PUBLISHABLE_KEY"]) delete process.env[k]; Object.assign(process.env, o); };

const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const apiBodies = [];
async function api(url, method, log, postData, headers) {
  if (method !== "POST") return null;
  const body = JSON.parse(postData || "{}"); apiBodies.push(body);
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1", ...(headers.Authorization || headers.authorization ? { authorization: headers.Authorization || headers.authorization } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return { status: r.code, body: r.body };
}
const fakeStoreAuth = (token) => `(() => { let fb; Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) { fb = v; if (v && v.initializeApp && !v.__wrapped) { const orig = v.initializeApp.bind(v); v.__wrapped = true; v.initializeApp = function(options, name) { if (name === 'machinauStoreAccount') { const u = { uid: "u", email: "owner@example.com", isAnonymous: false, emailVerified: true, getIdToken: async () => ${JSON.stringify(token)}, reload: async () => {} }; return { name, auth: () => ({ currentUser: u, onAuthStateChanged(cb) { setTimeout(() => cb(u), 0); return () => {}; }, signOut: async () => {} }) }; } return orig(options, name); }; } } }); })();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };

const server = await serve(REPO_ROOT + "", 8816);
const browser = await launchChrome();
async function open(token, lang = "ja") {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiPassthrough: true, apiMock: api, initScripts: [fakeStoreAuth(token), langInit(lang)] } });
  await p.goto("/store-account.html"); await p.waitFor("document.querySelectorAll('#storeList > *').length >= 1", 12000); await sleep(1500);
  return p;
}
const sec = (p) => p.ev(`({ shown: !document.getElementById("invoiceHistorySection").hidden, estimate: document.getElementById("invoiceEstimate").textContent, list: document.getElementById("invoiceList").textContent, items: document.querySelectorAll("#invoiceList .invoice-item").length, all: document.getElementById("invoiceHistorySection").textContent, heading: document.querySelector("#invoiceHistorySection h3").textContent, xss: window.__xss || 0, imgs: document.querySelectorAll("#invoiceHistorySection img").length, msg: document.getElementById("invoiceMessage").textContent, billingShown: !document.getElementById("billingSection").hidden, overflow: document.documentElement.scrollWidth > window.innerWidth })`);

try {
  // Production before billing start, other Preview: hidden
  for (const [env, label] of [[{ ...TRIAL, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, "課金開始前のProduction"], [{ ...TRIAL, VERCEL_GIT_COMMIT_REF: "preview/region-profiles-freeze" }, "ほかのPreview"]]) {
    setEnv(env); const p = await open("owner"); const s = await sec(p);
    t(`V1 ${label}：ご請求の履歴の欄は表示しない（サーバーは available false）`, !s.shown && apiBodies.some((b) => b.mode === "storeBillingInvoices"), s); await p.close();
  }
  setEnv(TRIAL);
  apiBodies.length = 0;
  let p = await open("editor"); let s = await sec(p);
  t("V2 owner以外（editor）には表示しない・要求も送らない", !s.shown && !apiBodies.some((b) => b.mode === "storeBillingInvoices"), s); await p.close();

  apiBodies.length = 0;
  p = await open("owner"); s = await sec(p);
  const sent = apiBodies.filter((b) => b.mode === "storeBillingInvoices");
  t("V3 ownerには表示・送るのは mode と storeId だけ", s.shown && s.heading === "ご請求の履歴" && sent.length === 1 && JSON.stringify(Object.keys(sent[0]).sort()) === JSON.stringify(["mode", "storeId"]), { s, sent });
  t("V4 見込み（未確定）は別枠：当月1件・100円（見込み）と注記", /1件・100円（見込み）/.test(s.estimate) && /確定したご請求額とは別/.test(s.estimate) && !/見込み/.test(s.list), s.estimate);
  const labels = ["確定済み・カードへのご請求前", "お支払い済み", "カードでのお支払いができませんでした（カードの確認をお願いします）", "カードの本人確認が必要です。運営からご連絡します", "集計処理中", "確認中（運営が確認しています）", "ご請求の処理中"];
  t("V5 状態の表示：closed／paid／payment_failed／requires_action／closing／needs_review／processing", s.items === 7 && labels.every((l) => s.list.includes(l)), { items: s.items, list: s.list });
  t("V6 確定額と件数・確定日・お支払い日を表示、集計処理中は金額を出さない", /ご請求額：100円（税込）・1件/.test(s.list) && /確定日：\d{4}\/\d{2}\/\d{2}/.test(s.list) && /お支払い日：\d{4}\/\d{2}\/\d{2}/.test(s.list) && /月末の締めの集計中です/.test(s.list), s.list);
  const aggregatingItem = await p.ev(`[...document.querySelectorAll("#invoiceList .invoice-item")].find((el) => el.textContent.includes("集計処理中")).textContent`);
  t("V6b 集計処理中の請求には金額の行がない", !/ご請求額/.test(aggregatingItem), aggregatingItem);
  t("V7 XSS：見出しのHTMLは文字として表示（img要素なし・実行されない）", s.xss === 0 && s.imgs === 0 && s.list.includes(XSS), { xss: s.xss, imgs: s.imgs });
  const leaks = ["pi_", "cus_", "pm_", "idem", "adm1", "card_declined", "s1_", "p1", "p2_"].filter((k) => s.all.includes(k));
  t("V8 画面に内部情報（Stripe ID・請求書ID・投稿ID・エラーの原文）が出ない", leaks.length === 0, leaks);
  t("V9 スマホ幅で横にはみ出さない", s.overflow === false, s.overflow);
  t("V10 カード登録の欄はStripe未設定のまま非表示（既存の動作のまま）・Stripeへの通信なし", s.billingShown === false && stripeCalls === 0, { billing: s.billingShown, stripeCalls });

  await p.screenshot(SHOTS_DIR + "/store-invoice-history-ja.png", "#invoiceHistorySection");
  await p.ev(`document.querySelector('[data-language="en"]').click(), true`); await sleep(400); s = await sec(p);
  t("V11 英語に切り替えると請求履歴も英語（Billing history・Paid・Card authentication…）", s.heading === "Billing history" && /Paid/.test(s.list) && /Card authentication is required/.test(s.list) && /\(estimate\)/.test(s.estimate), { h: s.heading, list: s.list.slice(0, 200) });
  await p.close();

  p = await open("emptyOwner"); s = await sec(p);
  t("V12 請求書なし：「確定した請求はまだありません。」・「未確定の見込みはありません。」", s.shown && s.list.includes("確定した請求はまだありません。") && s.estimate.includes("未確定の見込みはありません。"), s);
  await p.close();

  t("V13 読み取り専用：Firestoreへの書き込みゼロ", S.writes.length === 0, S.writes);
} finally {
  setEnv({});
  browser.close();
  server.close();
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
