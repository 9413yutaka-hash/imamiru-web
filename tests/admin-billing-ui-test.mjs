// STEP 32-D⑥: admin-billing.html (read-only billing check screen). Real Firebase compat SDK signs in against a fake
// identitytoolkit backend; /api/moderate-submission is answered in-process by the REAL handler on mocked firebase-admin.
// No Stripe, no Firestore writes. run: node --import ./tests/mockfa-occ/register.mjs tests/admin-billing-ui-test.mjs
import { REPO_ROOT, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ADMIN = "9413yutaka@gmail.com";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = ADMIN;
const ORIGIN = "http://127.0.0.1:8811";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const NOWS = Math.floor(Date.now() / 1000);
const tok = (email) => b64({ alg: "RS256" }) + "." + b64({ user_id: "a", sub: "a", email, exp: NOWS + 3600, iat: NOWS, aud: "chikashoku-app", iss: "https://securetoken.google.com/chikashoku-app", firebase: { sign_in_provider: "password" } }) + ".s";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { [tok(ADMIN)]: pw("adm1", ADMIN) };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
Object.assign(process.env, { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKECARDSETUPKEYONLY0001", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01", VERCEL_ENV: "preview" });
// Stripe stub for the read-only inspect (GET only expected). stripeCalls counts every call, nonGet counts anything else.
let stripeCalls = 0, nonGet = 0; const SP = { pis: new Map(), listFail: false, check: "ok" };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o = {}) => {
  if (!String(url).includes("api.stripe.com")) return realFetch(url, o);
  stripeCalls++; if ((o.method || "GET") !== "GET") { nonGet++; return { ok: false, status: 400, json: async () => ({ error: { type: "invalid_request_error" } }) }; }
  const u = new URL(String(url)); const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const m = u.pathname.match(/^\/v1\/payment_intents\/(.+)$/);
  if (m) { const pi = SP.pis.get(decodeURIComponent(m[1])); return pi ? json(200, pi) : json(404, { error: { code: "resource_missing" } }); }
  if (SP.listFail) return json(500, { error: { type: "api_error" } });
  const customer = u.searchParams.get("customer");
  if (!customer) {
    // connection check: GET /v1/payment_intents?limit=1
    const sample = { id: "pi_CHECKSECRET", customer: "cus_CHECKSECRET", payment_method: "pm_CHECKSECRET", amount: 999, client_secret: "pi_CHECKSECRET_secret_LEAK", billing_details: { email: "check-leak@example.com" }, livemode: false };
    if (SP.check === "403") return json(403, { error: { type: "invalid_request_error", code: "secret_key_required", message: "does not have the required permissions" } });
    if (SP.check === "401") return json(401, { error: { type: "invalid_request_error", message: "Invalid API Key provided" } });
    if (SP.check === "network") throw new TypeError("fetch failed");
    if (SP.check === "live") return json(200, { object: "list", data: [{ ...sample, livemode: true }], has_more: false });
    if (SP.check === "xss") return json(500, { error: { type: "api_error", code: "<img src=x onerror=window.__xss3=1>" } });
    if (SP.check === "empty") return json(200, { object: "list", data: [], has_more: false });
    return json(200, { object: "list", data: [sample], has_more: true });
  }
  return json(200, { object: "list", data: [...SP.pis.values()].filter((x) => x.customer === customer), has_more: false });
};
const NOWS2 = Math.floor(Date.now() / 1000);
const spi = (id, invoiceId, over = {}) => SP.pis.set(id, { id, amount: 200, amount_received: 200, currency: "jpy", customer: "cus_u", payment_method: "pm_u", status: "succeeded", livemode: false, created: NOWS2 - 60, client_secret: id + "_secret_LEAK", billing_details: { email: "leak@example.com" }, metadata: { invoiceId, storeId: invoiceId.split("_")[0], month: "2027-11", chargeAttempt: "1", machinauMode: "test" }, ...over });
const { default: handler } = await import((await import("node:url")).pathToFileURL(REPO_ROOT + "/api/moderate-submission.js").href + "?v=" + Date.now());
const FS = await import("firebase-admin/firestore");
const TS = (ms) => FS.Timestamp.fromMillis(ms);
const H = 3600 * 1000, D = 24 * H, NOW = Date.now();

let apiMode = "real"; const apiCalls = [];
async function api(url, method, log, postData, headers) {
  if (method !== "POST") return null;
  const body = JSON.parse(postData || "{}"); apiCalls.push(body);
  if (apiMode === "500") return { status: 500, body: { success: false, reason: "server_error" } };
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  const auth = headers.Authorization || headers.authorization;
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return { status: r.code, body: r.body };
}
let authEmail = ADMIN;
const authMock = async (url) => {
  if (url.includes("signInWithPassword")) return { body: { localId: "a", email: authEmail, idToken: tok(authEmail), refreshToken: "r", expiresIn: "3600", registered: true } };
  if (url.includes("lookup")) return { body: { users: [{ localId: "a", email: authEmail, emailVerified: true, providerUserInfo: [{ providerId: "password", email: authEmail }] }] } };
  return { body: { id_token: tok(authEmail), refresh_token: "r", expires_in: "3600" } };
};

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };
const inv = (storeId, month, data) => S.docs.set("imadakeMonthlyInvoices/" + storeId + "_" + month, { storeId, month, lineCount: 2, amountJpy: 200, currency: "JPY", taxIncluded: true, ...data });
const server = await serve(REPO_ROOT, 8811);
const browser = await launchChrome();
const open = async (w = 1280) => { const p = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiPassthrough: true, apiMock: api, authMock } }); await p.goto("/admin-billing.html"); await p.waitFor("document.readyState === 'complete'"); await sleep(800); return p; };
const login = async (p, email = ADMIN) => { await p.ev(`(() => { document.getElementById("adminEmail").value = ${JSON.stringify(email)}; document.getElementById("adminPassword").value = "x"; document.getElementById("loginButton").click(); return true; })()`); };
const state = (p) => p.ev(`({ loginShown: getComputedStyle(document.getElementById("loginPanel")).display !== "none", areaShown: document.getElementById("adminArea").classList.contains("visible"), overall: document.getElementById("overallStatus").textContent, kind: document.getElementById("overallStatus").className, cont: !document.getElementById("continueButton").hidden, err: document.getElementById("errorBox").textContent, items: document.querySelectorAll("#itemList .item").length, pages: document.getElementById("pageCount").textContent, attention: document.getElementById("attentionCount").textContent, loginMsg: document.getElementById("loginMessage").textContent, limitNote: document.getElementById("displayLimitNote").hidden ? "" : document.getElementById("displayLimitNote").textContent })`);
const waitIdle = (p) => p.waitFor(`!/確認中です/.test(document.getElementById("overallStatus").textContent) && document.getElementById("overallStatus").textContent !== "確認していません。"`, 20000);

try {
  // U1 not logged in
  let p = await open(); let s = await state(p);
  t("U1 未ログイン：ログイン欄だけを表示し、請求情報を表示しない・APIを呼ばない", s.loginShown && !s.areaShown && apiCalls.length === 0, s);
  // U2 non-admin email (client gate)
  await login(p, "someone@example.com"); await sleep(400); s = await state(p);
  t("U2 運営以外のメールアドレス：ログインさせず、APIを呼ばない", !s.areaShown && /管理者権限がありません/.test(s.loginMsg) && apiCalls.length === 0, s);
  await p.close();

  // U3 admin, attention items
  inv("a1", "2027-11", { status: "needs_review", chargeMode: "test", chargePaymentMethodId: "pm_secret1", chargeIdempotencyKey: "machinau-invoice-test-a1_2027-11-1", chargeCustomerId: "cus_secret", chargeLeaseUntilMs: 0, chargeReviewReason: "outcome_unknown_not_found", paymentIntentId: "" });
  inv("a2", "2027-11", { status: "payment_failed", lastChargeError: { code: "card_declined", declineCode: "insufficient_funds" }, chargePaymentMethodId: "pm_secret2", paymentIntentId: "pi_abc" });
  inv("a3", "2027-11", { status: "paid", paymentIntentId: "pi_ok" });
  // STEP 42-C｜支払い情報はアカウント単位(accountBilling)、ロックは請求書ごと(billingLocks)。
  S.docs.set("accountBilling/u_a9", { uid: "u_a9", test: { customerId: "cus_secret9", paymentMethodId: "pm_secret9", billingLocks: { "a9_2027-11": { attempt: 1, sinceMs: NOW - 30 * H } } } });
  const w0 = S.writes.length;
  p = await open(); await login(p); await p.waitFor(`document.getElementById("adminArea").classList.contains("visible")`, 15000); await waitIdle(p); s = await state(p);
  t("U3 運営ログイン：自動で確認し、要確認（人の確認待ち・支払い失敗・ロックの食い違い）を表示・全件確認済みで「対応が必要な請求が3件」", s.areaShown && /全件を確認しました。対応が必要な請求が 3 件あります/.test(s.overall) && s.items === 3 && s.attention === "3" && !s.cont, s);
  const text = await p.ev(`document.getElementById("itemList").textContent`);
  t("U3b 店舗ID・対象月・状態・金額・理由・経過時間を表示（日本語の理由＋コード）", /a1_2027-11/.test(text) && /2027-11/.test(text) && /人の確認が必要\(needs_review\)/.test(text) && /200円\(税込\)/.test(text) && /請求中ロックが長く続いている\(lock_stale\)/.test(text) && /30時間/.test(text) && /card_declined/.test(text), text.slice(0, 400));
  const page = await p.ev(`document.body.innerText`);
  t("U3c カードID・顧客ID・冪等キーは表示しない", !/pm_secret|cus_secret|machinau-invoice-test/.test(page));
  const buttons = await p.ev(`[...document.querySelectorAll("button")].map((b) => b.id || ("class:" + b.className + ":" + b.textContent))`);
  // STEP 37-C｜月末締め（Preview試験）の2つのボタンは、Previewの専用Firebaseの時だけ表示される（本番のドメインでは非表示）。
  const closeTrialHidden = await p.ev(`document.getElementById("closeTrialPanel").hidden === true`);
  t("U3d0 本番のドメインでは月末締め（Preview試験）の欄を表示しない", closeTrialHidden === true);
  // STEP 44-B｜月額100円カスタマイズの契約一覧の「読み込み直す」（読み取りのみ）も許可する。
  const others = buttons.filter((b) => !["continueButton", "loginButton", "restartButton", "stripeCheckButton", "closeDryRunButton", "closeExecuteButton", "customPlanReloadButton",
    // STEP 44-C④｜月額100円カスタマイズの締め・請求（試算は読むだけ、実行はサーバーが許可した時だけ）。
    "customPlanCloseDryRunButton", "customPlanCloseExecuteButton", "customPlanChargeDryRunButton", "customPlanChargeExecuteButton", "customPlanInvoiceReloadButton"].includes(b));
  const checkLabel = await p.ev(`document.getElementById("stripeCheckButton").textContent`);
  t("U3d ボタンは「ログイン」「最初から確認」「続きを確認」「Stripeとの接続を確認（読み取りのみ）」と、請求書ごとの「Stripeの記録を確認（読み取りのみ）」だけ（支払い確定・再請求・ロック解除・返金などは無い）", checkLabel === "Stripeとの接続を確認（読み取りのみ）" && buttons.includes("stripeCheckButton") &&  others.length === 2 && others.every((b) => b === "class:inspect-button:Stripeの記録を確認（読み取りのみ）"), buttons);
  t("U3e 一覧の表示では書き込みゼロ・Stripe呼び出しゼロ", S.writes.length === w0 && stripeCalls === 0);
  const lay = await p.ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
  await p.close();

  // U4 no problems
  S.docs.clear();
  inv("b1", "2027-11", { status: "paid", paymentIntentId: "pi_ok" });
  p = await open(); await login(p); await waitIdle(p); s = await state(p);
  t("U4 全件を確認して要確認0件：はじめて「対応が必要な請求はありません」", /全件を確認しました。対応が必要な請求はありません/.test(s.overall) && /ok/.test(s.kind) && s.items === 0, s);
  await p.close();

  // U5 pagination: first page has 0 attention items but is incomplete
  S.docs.clear();
  for (let i = 0; i < 1100; i++) inv("p" + String(i).padStart(4, "0"), "2027-10", { status: "paid", paymentIntentId: "pi_ok" });
  inv("p1099", "2027-10", { status: "mystery" });
  p = await open(); await login(p); await waitIdle(p); s = await state(p);
  t("U5 1ページ目は要確認0件でも「確認が完了していません：続きがあります」・続きボタンを表示（問題なしと表示しない）", /確認が完了していません：続きがあります/.test(s.overall) && !/問題なし$|対応が必要な請求はありません/.test(s.overall) && s.cont && s.pages === "1" && s.items === 0, s);
  await p.ev(`document.getElementById("continueButton").click(), true`); await sleep(300); await waitIdle(p); s = await state(p);
  t("U5b 続きを確認：2ページ目で末尾の未知の状態を見つけ、全件確認済み・要確認1件", s.pages === "2" && /全件を確認しました。対応が必要な請求が 1 件/.test(s.overall) && s.items === 1 && !s.cont && /未知の状態/.test(await p.ev(`document.getElementById("itemList").textContent`)), s);
  const sentNext = apiCalls[apiCalls.length - 1];
  t("U5c 続きの取得は前回の next（位置・読み終え印）をそのまま送る", typeof sentNext.invoiceCursor === "string" && sentNext.invoiceCursor !== "" && sentNext.invoicesDone === false, sentNext);
  await p.close();

  // U6 read failure -> complete:false with errors
  S.docs.clear();
  globalThis.__QUERY_FAIL = "imadakeMonthlyInvoices";
  p = await open(); await login(p); await waitIdle(p); s = await state(p);
  globalThis.__QUERY_FAIL = null;
  t("U6 読み取り失敗（complete:false・errors）：エラー表示で「問題なし」と表示しない・続きボタンも出さない（最初から確認し直す）", /読み取りエラーがありました/.test(s.overall) && /error/.test(s.kind) && /invoices・read_failed/.test(s.err) && !s.cont && !/対応が必要な請求はありません/.test(s.overall), s);
  await p.close();

  // U7 API error
  apiMode = "500";
  p = await open(); await login(p); await waitIdle(p); s = await state(p);
  apiMode = "real";
  t("U7 APIエラー（500）：「確認できませんでした」と表示し、全件確認は完了していないと明示", /確認できませんでした/.test(s.overall) && /完了していません/.test(s.overall) && /500/.test(s.err), s);
  await p.close();

  // U8 server-side 403 (client gate passes, server rejects)
  globalThis.__MOCK_TOKENS[tok(ADMIN)] = pw("x", "intruder@example.com");
  p = await open(); await login(p); await waitIdle(p); s = await state(p);
  globalThis.__MOCK_TOKENS[tok(ADMIN)] = pw("adm1", ADMIN);
  t("U8 サーバー側で権限なし（403）：請求情報を表示せず、権限がないと表示", /権限がありません\(403\)/.test(s.overall) && s.items === 0, s);
  await p.close();

  // U9 HTML injection
  S.docs.clear();
  S.docs.set("imadakeMonthlyInvoices/evil", { storeId: "<img src=x onerror=window.__xss=1>", month: "<b>2027</b>", status: "<script>window.__xss=2</script>", lineCount: 1, amountJpy: 100 });
  p = await open(); await login(p); await waitIdle(p);
  const xss = await p.ev(`({ flag: window.__xss || 0, imgs: document.querySelectorAll("#itemList img").length, scripts: document.querySelectorAll("#itemList script").length, bolds: document.querySelectorAll("#itemList b").length, text: document.getElementById("itemList").textContent })`);
  t("U9 応答に含まれるHTMLは文字として表示し、実行・要素化しない", xss.flag === 0 && xss.imgs === 0 && xss.scripts === 0 && xss.bolds === 0 && xss.text.includes("<img src=x onerror=window.__xss=1>"), xss);
  await p.close();

  // X: Stripe inspect (read-only) from the screen
  S.docs.clear(); SP.pis.clear();
  const base = { lineCount: 2, amountJpy: 200, chargeMode: "test", chargeAttempt: 1, chargeCustomerId: "cus_u", chargePaymentMethodId: "pm_u", createdAt: TS(NOW - 2 * D), chargeLeaseUntilMs: 0 };
  inv("x1", "2027-11", { ...base, status: "payment_failed", paymentIntentId: "pi_f1", chargeHistory: [{ attempt: 1, paymentIntentId: "pi_f1" }] });
  spi("pi_f1", "x1_2027-11", { status: "requires_payment_method", amount_received: 0, last_payment_error: { code: "card_declined" } });
  inv("x2", "2027-11", { ...base, status: "needs_review", paymentIntentId: "", chargeHistory: [], chargeCustomerId: "cus_x2" });
  spi("pi_d1", "x2_2027-11", { customer: "cus_x2" }); spi("pi_d2", "x2_2027-11", { customer: "cus_x2" });
  inv("x3", "2027-11", { ...base, status: "needs_review", paymentIntentId: "", chargeHistory: [], chargeCustomerId: "cus_x3" });
  inv("x4", "2027-11", { ...base, status: "requires_action", paymentIntentId: "pi_<img src=x onerror=window.__xss2=1>", chargeHistory: [], chargeCustomerId: "cus_x4" });
  SP.pis.set("pi_<img src=x onerror=window.__xss2=1>", { id: "pi_<img src=x onerror=window.__xss2=1>", amount: 200, amount_received: 0, currency: "jpy", customer: "cus_x4", payment_method: "pm_u", status: "requires_action", livemode: false, created: NOWS2, metadata: { invoiceId: "x4_2027-11", storeId: "x4", month: "2027-11", chargeAttempt: "1", machinauMode: "test" }, last_payment_error: { code: "<script>window.__xss2=2</script>" } });
  const w1 = S.writes.length;
  p = await open(); await login(p); await waitIdle(p);
  const clickInspect = async (id) => { await p.ev(`(() => { const box = [...document.querySelectorAll("#itemList .item")].find((b) => b.querySelector(".item-title").textContent.includes(${JSON.stringify(id)})); box.querySelector(".inspect-button").click(); return true; })()`); await p.waitFor(`(() => { const box = [...document.querySelectorAll("#itemList .item")].find((b) => b.querySelector(".item-title").textContent.includes(${JSON.stringify(id)})); const r = box && box.querySelector(".inspect-result"); return r && !r.hidden && !/確認しています/.test(r.textContent); })()`, 15000); return p.ev(`(() => { const box = [...document.querySelectorAll("#itemList .item")].find((b) => b.querySelector(".item-title").textContent.includes(${JSON.stringify(id)})); const r = box.querySelector(".inspect-result"); return { text: r.textContent, rows: r.querySelectorAll(".pi-table tr").length, severe: r.querySelectorAll(".verdict.severe").length }; })()`); };
  let x = await clickInspect("x1_2027-11");
  t("X1 支払い失敗の請求書を照合：Stripeの記録と一致（支払いID・状態・エラーを表にする）", /Stripeの記録と一致しました/.test(x.text) && x.rows === 2 && /card_declined/.test(x.text), x);
  x = await clickInspect("x2_2027-11");
  t("X2 二重請求の疑い：重大表示・2件を表にする", /重大な食い違い/.test(x.text) && /二重請求の疑い/.test(x.text) && x.rows === 3 && x.severe >= 1, x);
  x = await clickInspect("x3_2027-11");
  t("X3 0件：「範囲では見つからない（証明ではない）」と表示し、未請求・安全とは表示しない", /証明ではありません/.test(x.text) && !/未請求です|安全/.test(x.text), x);
  SP.listFail = true; x = await clickInspect("x3_2027-11"); SP.listFail = false;
  t("X4 一覧の取得失敗：「照合未完了」と表示", /照合未完了/.test(x.text), x);
  x = await clickInspect("x4_2027-11");
  const xss2 = await p.ev(`({ flag: window.__xss2 || 0, imgs: document.querySelectorAll(".inspect-result img").length, scripts: document.querySelectorAll(".inspect-result script").length })`);
  t("X5 Stripeの応答に含まれるHTMLも文字として表示し、実行しない", xss2.flag === 0 && xss2.imgs === 0 && xss2.scripts === 0 && x.text.includes("<script>window.__xss2=2</script>"), { xss2, text: x.text.slice(0, 200) });
  t("X6 画面に client_secret・請求先のメールアドレスを出さない", !/_secret_LEAK|leak@example\.com/.test(await p.ev(`document.body.innerText`)));
  apiMode = "500"; x = await clickInspect("x1_2027-11"); apiMode = "real";
  t("X7 照合APIのエラー（500）：「照合できませんでした…照合は完了していません」", /照合できませんでした/.test(x.text) && /完了していません/.test(x.text), x);
  t("X8 照合でもFirestore書き込みゼロ・StripeへはGETだけ", S.writes.length === w1 && nonGet === 0 && stripeCalls > 0, { writes: S.writes.length - w1, nonGet, stripeCalls });
  await p.close();

  // Y: Stripe read-connection check button
  const w2 = S.writes.length, sc0 = stripeCalls, ac0 = apiCalls.length;
  p = await open(); await login(p); await waitIdle(p);
  t("Y0 ページを開いて一覧を確認しただけでは接続確認を送らない", !apiCalls.slice(ac0).some((b) => b.mode === "imadakeBillingStripeCheck") && stripeCalls === sc0);
  const clickCheck = async () => {
    await p.ev(`(() => { document.getElementById("stripeCheckResult").textContent = ""; document.getElementById("stripeCheckButton").click(); return true; })()`);
    await p.waitFor(`(() => { const r = document.getElementById("stripeCheckResult"); return !r.hidden && r.textContent !== "" && !/確認しています/.test(r.textContent) && !document.getElementById("stripeCheckButton").disabled; })()`, 15000);
    return p.ev(`(() => { const r = document.getElementById("stripeCheckResult"); return { text: r.textContent, severe: r.querySelectorAll(".verdict.severe").length, ok: r.querySelectorAll(".verdict.ok").length }; })()`);
  };
  SP.check = "ok"; let y = await clickCheck();
  const lastCheck = apiCalls[apiCalls.length - 1];
  t("Y1 接続成功：「読み取り接続：成功」「テスト環境：はい」「エラーの種類：なし」", /読み取り接続：成功/.test(y.text) && /テスト環境：はい/.test(y.text) && /エラーの種類：なし/.test(y.text) && y.ok === 1 && y.severe === 0, y);
  t("Y1b 画面から送るのは mode だけ", JSON.stringify(lastCheck) === JSON.stringify({ mode: "imadakeBillingStripeCheck" }), lastCheck);
  t("Y1c PaymentIntentのID・顧客・カード・client_secret・メール・金額・キーを画面に出さない", !/CHECKSECRET|_secret_LEAK|check-leak@example|999|rk_test_|pk_test_/.test(await p.ev(`document.getElementById("stripeCheckResult").textContent`)));
  SP.check = "empty"; y = await clickCheck();
  t("Y2 PaymentIntentが0件でも接続成功と表示", /読み取り接続：成功/.test(y.text) && y.ok === 1, y);
  SP.check = "403"; y = await clickCheck();
  t("Y3 403：「キーに読み取り権限がありません(403)」・エラーの種類 forbidden・Stripeのメッセージは出さない", /読み取り権限がありません\(403\)/.test(y.text) && /エラーの種類：forbidden・secret_key_required/.test(y.text) && !/does not have/.test(y.text) && y.severe === 1, y);
  SP.check = "401"; y = await clickCheck();
  t("Y4 401：「キーを受け付けませんでした(401)」（403と区別）", /受け付けませんでした\(401\)/.test(y.text) && /エラーの種類：unauthorized/.test(y.text) && !/Invalid API Key/.test(y.text), y);
  SP.check = "network"; y = await clickCheck();
  t("Y5 通信失敗：「Stripeと通信できませんでした」", /Stripeと通信できませんでした/.test(y.text) && /network_error/.test(y.text) && y.severe === 1, y);
  SP.check = "live"; y = await clickCheck();
  t("Y6 本番の応答が返った：重大表示（mode_mismatch）・成功とは表示しない", /本番環境のもの/.test(y.text) && /mode_mismatch/.test(y.text) && !/成功/.test(y.text) && y.severe === 1, y);
  SP.check = "xss"; y = await clickCheck();
  const xss3 = await p.ev(`({ flag: window.__xss3 || 0, imgs: document.querySelectorAll("#stripeCheckResult img").length })`);
  t("Y7 Stripeのエラーコードに含まれるHTMLも文字として表示し、実行しない", xss3.flag === 0 && xss3.imgs === 0 && y.text.includes("<img src=x onerror=window.__xss3=1>"), { xss3, text: y.text });
  SP.check = "ok"; apiMode = "500"; y = await clickCheck(); apiMode = "real";
  t("Y8 接続確認APIのエラー（500）：「確認できませんでした(500)」・成功とは表示しない", /確認できませんでした\(500\)/.test(y.text) && !/成功/.test(y.text) && y.severe === 1, y);
  process.env.VERCEL_ENV = "production"; const sc1 = stripeCalls; y = await clickCheck(); process.env.VERCEL_ENV = "preview";
  t("Y9 Production：「設定が無効のため、接続していません」・Stripeに接続しない", /設定が無効のため、接続していません/.test(y.text) && /disabled_in_production/.test(y.text) && stripeCalls === sc1, y);
  t("Y10 接続確認でもFirestore書き込みゼロ・StripeへはGETだけ", S.writes.length === w2 && nonGet === 0 && stripeCalls > sc0, { writes: S.writes.length - w2, nonGet, stripeCalls: stripeCalls - sc0 });
  await p.close();
  SP.check = "ok";

  // U10 large data: 2,100 attention items over several pages, display capped at 2,000
  S.docs.clear();
  for (let i = 0; i < 2100; i++) inv("L" + String(i).padStart(4, "0"), "2027-10", { status: "paid" });   // paid without PI
  p = await open(390); await login(p); await waitIdle(p);
  for (let i = 0; i < 10; i++) { s = await state(p); if (!s.cont) break; await p.ev(`document.getElementById("continueButton").click(), true`); await sleep(200); await waitIdle(p); }
  s = await state(p);
  const lay2 = await p.ev(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
  try { await p.screenshot(SHOTS_DIR + "/admin-billing-390.png", "#adminArea .panel"); } catch (e) { console.log("  (screenshot skipped)"); }
  t("U10 大量（要確認2,100件）：全件確認済み・合計2,100件（読んだ請求書も2,100件と表示）、画面は先頭2,000件まで表示して件数を明示", /対応が必要な請求が 2100 件/.test(s.overall) && (await p.ev(`document.getElementById("invoiceCount").textContent`)) === "2100" && s.items === 2000 && s.attention === "2100" && /先頭の 2000 件/.test(s.limitNote), s);
  const errs = [...new Set(p.log.errors)].filter((e) => !/RefererNotAllowed|404 local|sessionStorage|Firebase/i.test(e));
  t("U11 スマホ390px・PC：横スクロールなし・JSエラーなし", lay.sw <= lay.cw && lay2.sw <= lay2.cw && errs.length === 0, { lay, lay2, errs });
  await p.close();
  t("U12 全体を通してFirestore書き込みゼロ・StripeへのGET以外の呼び出しゼロ", S.writes.length === 0 && nonGet === 0, { writes: S.writes.length, nonGet });
} catch (e) { console.error("HARNESS ERROR", e.stack); fail++; }
browser.close(); server.close();
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
