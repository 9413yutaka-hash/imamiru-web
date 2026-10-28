// STEP 47 UI: store-account.html "delete account" (check → confirm → delete → logged out), blocked reasons, cancel, English.
// Store login faked in the browser; POST /api answered in-process by the REAL handler (mocked firebase-admin) with an
// in-memory Stripe stub (test mode). No real services.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-account-deletion-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8873";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
Object.assign(process.env, { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { delOk: pw("d1", "ok@example.com"), delBlocked: pw("d2", "blocked@example.com"), delEn: pw("d3", "en@example.com"), delLive: pw("d4", "live@example.com"), delUnv: { ...pw("d5", "unv@example.com"), email_verified: false }, delWd: pw("d6", "wd@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const PM = new Map();
function seed(uid, storeId) {
  S.docs.set("storeMembers/" + storeId + "_" + uid, { storeId, uid, role: "owner", status: "active" });
  S.docs.set("storeAccounts/" + storeId, { storeName: "店 " + storeId, enabled: true, registrationStatus: "active", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", latitude: 26.21, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeProfiles/" + storeId, { storeId, status: "published", revision: 1, categoryCode: "cafe_sweets", description: "紹介文", moderationStatus: "passed", moderatedText: "紹介文", photos: [] });
  PM.set("pm_" + uid, "cus_" + uid);
  S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2031 }, cardVersion: 1, setupStatus: "succeeded", detachPendingPaymentMethods: [], pendingSetupIntentId: "" } });
}
seed("d1", "s1"); seed("d2", "s2"); seed("d3", "s3"); seed("d4", "s4"); seed("d6", "s6");
S.docs.set("imadakeMonthlyInvoices/s6_2026-09", { storeId: "s6", month: "2026-09", status: "payment_failed", amountJpy: 100 });
S.docs.get("accountBilling/d4").live = { customerId: "cus_lived4", paymentMethodId: "pm_lived4", card: { last4: "1111" }, setupStatus: "succeeded" };
S.docs.set("imadakePosts/p1", { storeId: "s1", status: "published" });
S.docs.set("imadakeMonthlyInvoices/s2_2026-09", { storeId: "s2", month: "2026-09", status: "payment_failed", amountJpy: 100 });
// ---- Stripe stub ----
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") return realFetch(url, opts);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const m = u.pathname.match(/^\/v1\/payment_methods\/(pm_[A-Za-z0-9_]+)(\/detach)?$/);
  if (m && PM.has(m[1])) { if (m[2]) PM.set(m[1], null); return json(200, { id: m[1], type: "card", customer: PM.get(m[1]) }); }
  return json(404, { error: {} });
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
async function api(url, method, log, postData, headers) {
  if (method === "GET") return null;
  const body = JSON.parse(postData || "{}");
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1", ...(headers.Authorization || headers.authorization ? { authorization: headers.Authorization || headers.authorization } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  for (const k of [...S.docs.keys()]) if (k.startsWith("storeBillingRateLimits/")) S.docs.delete(k);
  return { status: r.code, body: r.body };
}
const fakeStoreAuth = (token, verified = true) => `(() => { let fb; Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) { fb = v; if (v && v.initializeApp && !v.__wrapped) { const orig = v.initializeApp.bind(v); v.__wrapped = true; v.initializeApp = function(options, name) {
if (name === 'machinauStoreAccount') { const u = { uid: "u", email: "x@example.com", isAnonymous: false, emailVerified: ${verified}, getIdToken: async () => ${JSON.stringify(token)}, reload: async () => {} }; window.__signedOut = false; return { name, auth: () => ({ currentUser: u, onAuthStateChanged(cb) { setTimeout(() => cb(u), 0);
 return () => {}; }, signOut: async () => { window.__signedOut = true; } }) }; } return orig(options, name); }; } } }); })();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };
const server = await serve(REPO_ROOT + "", 8873);
const browser = await launchChrome();
async function open(token, lang = "ja", w = 390, verified = true) {
  const p = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiPassthrough: true, apiMock: api, articles: [], initScripts: [fakeStoreAuth(token, verified), langInit(lang)] } });
  await p.goto("/store-account.html"); await p.waitFor(`!document.getElementById("accountDeletionSection").hidden`, 15000); await sleep(1200);
  return p;
}
const state = (p) => p.ev(`({
  confirmOpen: !document.getElementById("deleteConfirmBox").hidden,
  checkHidden: document.getElementById("deleteCheckButton").hidden,
  checkText: document.getElementById("deleteCheckButton").textContent,
  summary: [...document.querySelectorAll("#deleteSummaryList li")].map((li) => li.textContent),
  effects: [...document.querySelectorAll("#deleteEffectsList li")].map((li) => li.textContent),
  message: document.getElementById("deleteMessage").textContent,
  blockers: [...document.querySelectorAll("#deleteBlockerList li")].map((li) => li.textContent),
  note: !document.getElementById("deleteSettlementNote").hidden,
  confirmText: document.getElementById("deleteConfirmButton").textContent,
  resume: !document.getElementById("deleteResumeButton").hidden,
  withdraw: !document.getElementById("deleteWithdrawButton").hidden,
  withdrawConfirm: !document.getElementById("deleteWithdrawConfirmBox").hidden,
  guide: [...document.querySelectorAll("#deleteWithdrawGuideList li")].map((li) => li.textContent),
  view: ["login","signup","reset","account"].find((v) => !document.getElementById(v + "View").hidden),
  global: document.getElementById("globalMessage").textContent,
  signedOut: window.__signedOut === true,
  hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
try {
  // ---- success (ja, phone width) ----
  let p = await open("delOk");
  let s = await state(p);
  t("U1 メール確認済みのアカウントに「アカウントの削除」欄が出る・最初は確認画面を開いていない", !s.confirmOpen && !s.checkHidden && /削除/.test(s.checkText), s);
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteConfirmBox").hidden`, 8000);
  s = await state(p);
  t("U2 確認画面：店舗・投稿・カードの件数と、削除すると起きること（7項目：月額プランの解約・写真の削除を含む）を表示・清算待ちの注意は出さない", s.summary.length === 3 && /1/.test(s.summary[0]) && /公開中 1/.test(s.summary[0]) && /1$/.test(s.summary[1]) && /あり/.test(s.summary[2]) && s.effects.length === 7 && s.effects.some((l) => /写真/.test(l)) && s.effects.some((l) => /月額100円/.test(l)) && !s.note && /アカウントを削除する/.test(s.confirmText) && s.checkHidden, s);
  t("U3 確認画面にカードの番号・Stripe の ID は出さない", !/4242|pm_|cus_/.test(JSON.stringify(s)), s);
  await p.ev(`document.getElementById("deleteCancelButton").click(), true`);
  s = await state(p);
  t("U4 「やめる」で確認画面を閉じる（何も削除しない）", !s.confirmOpen && !s.checkHidden && S.docs.get("accountBilling/d1") && !S.docs.get("accountDeletions/d1"), s);
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteConfirmBox").hidden`, 8000);
  await p.ev(`document.getElementById("deleteConfirmButton").click(), true`);
  await p.waitFor(`!document.getElementById("loginView").hidden`, 10000); await sleep(300);
  s = await state(p);
  t("U5 削除：ログアウトしてログイン画面に戻り「削除しました」を表示", s.view === "login" && s.signedOut && /削除しました/.test(s.global), s);
  t("U6 サーバー側：店舗は非公開・無効、カードの記録は消え、ログインは削除済み", S.docs.get("storeProfiles/s1").status === "draft" && S.docs.get("storeAccounts/s1").enabled === false && !S.docs.get("accountBilling/d1") && (globalThis.__MOCK_AUTH_DELETED || []).includes("d1") && S.docs.get("imadakePosts/p1").status === "ended");
  t("U7 横スクロールなし・画面のエラーなし（390px）", !s.hscroll && p.log.errors.length === 0, p.log.errors);
  await p.close();

  // ---- unpaid → closure accepted, deleted after settlement ----
  p = await open("delBlocked");
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteConfirmBox").hidden`, 8000);
  s = await state(p);
  t("U8 未払いがある：確認画面に清算待ちの注意を出し、ボタンは「退会を申し込む（清算の後に削除）」", s.confirmOpen && s.note && /退会を申し込む/.test(s.confirmText), s);
  await p.ev(`document.getElementById("deleteConfirmButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteResumeButton").hidden`, 8000);
  s = await state(p);
  t("U8b 退会を受け付け：「受け付けました」と残りの理由を表示・ログアウトしない・店舗は非公開・カードは残す", /受け付けました/.test(s.message) && s.blockers.length === 1 && /お支払いが済んでいない/.test(s.blockers[0]) && s.resume && !s.signedOut && s.view === "account" && S.docs.get("storeProfiles/s2").status === "draft" && S.docs.get("accountBilling/d2").test.paymentMethodId === "pm_d2" && S.docs.get("accountDeletions/d2").status === "awaiting_settlement", s);
  await p.close();
  p = await open("delBlocked");
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteResumeButton").hidden`, 8000);
  s = await state(p);
  t("U8c 後から開いても「退会の手続き中」と「手続きの状況を確認する」を表示（確認画面は開かない）", /退会の手続き中/.test(s.message) && s.resume && !s.confirmOpen, s);
  S.docs.get("imadakeMonthlyInvoices/s2_2026-09").status = "paid";
  await p.ev(`document.getElementById("deleteResumeButton").click(), true`);
  await p.waitFor(`!document.getElementById("loginView").hidden`, 10000); await sleep(300);
  s = await state(p);
  t("U8d 支払いの後に「手続きの状況を確認する」：削除が完了しログアウト", s.view === "login" && s.signedOut && /削除しました/.test(s.global) && (globalThis.__MOCK_AUTH_DELETED || []).includes("d2"), s);
  await p.close();

  // ---- STEP 47-C: withdraw the closure request ----
  p = await open("delWd");
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteConfirmBox").hidden`, 8000);
  await p.ev(`document.getElementById("deleteConfirmButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteWithdrawButton").hidden`, 8000);
  s = await state(p);
  t("W1 退会の受付後（清算待ち）は「退会を取り消す」を表示", s.withdraw && s.resume && S.docs.get("accountDeletions/d6").status === "awaiting_settlement", s);
  await p.ev(`document.getElementById("deleteWithdrawButton").click(), true`);
  s = await state(p);
  t("W2 「退会を取り消す」はすぐに取り消さず、確認を表示（2段階）", s.withdrawConfirm && !s.withdraw && S.docs.get("accountDeletions/d6").status === "awaiting_settlement", s);
  await p.ev(`document.getElementById("deleteWithdrawBackButton").click(), true`);
  s = await state(p);
  t("W3 「やめる」で確認を閉じる（取り消さない）", !s.withdrawConfirm && s.withdraw && S.docs.get("accountDeletions/d6").status === "awaiting_settlement", s);
  await p.ev(`document.getElementById("deleteWithdrawButton").click(), document.getElementById("deleteWithdrawConfirmButton").click(), true`);
  await p.waitFor(`document.querySelectorAll("#deleteWithdrawGuideList li").length > 0`, 8000);
  s = await state(p);
  t("W4 取り消し：「取り消しました」と再開の手順（公開し直す・投稿し直す・申込み直す・請求は残る）の4項目を表示", /取り消しました/.test(s.message) && s.guide.length === 4 && /公開/.test(s.guide[0]) && /投稿/.test(s.guide[1]) && /申し込み直/.test(s.guide[2]) && /お支払い/.test(s.guide[3]) && !s.withdraw && !s.signedOut, s);
  t("W5 サーバー側：取り消し済み・店舗の無効は戻るが非公開のまま・未払いの請求は残る", S.docs.get("accountDeletions/d6").status === "canceled" && S.docs.get("storeAccounts/s6").enabled === true && S.docs.get("storeProfiles/s6").status === "draft" && S.docs.get("imadakeMonthlyInvoices/s6_2026-09").status === "payment_failed");
  t("W6 横スクロールなし・画面のエラーなし", !s.hscroll && p.log.errors.length === 0, p.log.errors);
  await p.close();

  // ---- not deletable (live card in an environment without live card setup) ----
  p = await open("delLive");
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`document.querySelectorAll("#deleteBlockerList li").length > 0`, 8000);
  s = await state(p);
  t("U8e 清算で解消しない理由：削除できない理由を表示し、確認画面は開かない（何も変えない）", !s.confirmOpen && /削除できません/.test(s.message) && s.blockers.length === 1 && S.docs.get("storeProfiles/s4").status === "published" && !S.docs.get("accountDeletions/d4"), s);
  await p.close();

  // ---- unverified email ----
  p = await open("delUnv", "ja", 390, false);
  s = await state(p);
  t("U12 メール未確認のアカウントにも「アカウントの削除」欄を出す", !s.checkHidden && /削除/.test(s.checkText), s);
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteConfirmBox").hidden`, 8000);
  await p.ev(`document.getElementById("deleteConfirmButton").click(), true`);
  await p.waitFor(`!document.getElementById("loginView").hidden`, 10000); await sleep(300);
  s = await state(p);
  t("U13 メール未確認のアカウント（店舗・カードなし）を削除できる", s.view === "login" && (globalThis.__MOCK_AUTH_DELETED || []).includes("d5"), s);
  t("U14 横スクロールなし・画面のエラーなし（390px）", !s.hscroll && p.log.errors.length === 0, p.log.errors);
  await p.close();

  // ---- English, desktop ----
  p = await open("delEn", "en", 1280);
  s = await state(p);
  t("U9 英語：欄の文言が英語", /delete account/i.test(s.checkText), s);
  await p.ev(`document.getElementById("deleteCheckButton").click(), true`);
  await p.waitFor(`!document.getElementById("deleteConfirmBox").hidden`, 8000);
  s = await state(p);
  t("U10 英語：件数の区切りは英語の書き方（全角の記号を使わない）・項目も英語", s.summary.length === 3 && s.summary.every((l) => /: /.test(l) && !/[：（）]/.test(l)) && /Businesses/.test(s.summary[0]) && s.effects.every((l) => /[a-z]/i.test(l)), s);
  t("U11 画面のエラーなし（1280px）", p.log.errors.length === 0, p.log.errors);
  await p.close();
} finally {
  browser.close(); server.close();
}
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
