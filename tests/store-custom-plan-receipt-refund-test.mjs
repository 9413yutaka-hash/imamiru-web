// STEP 54-B｜領収書の残課題：(1) Stripe で成立した返金を請求台帳と領収書に反映(運営の照会・GET だけ・全額／一部／処理中・
// 二重に数えない・権限不足は成功にしない) (2) 退会後の領収書の再提供(運営だけ・本人確認の方法とメモ・提供の記録・
// 退会したアカウントの情報は復元しない) (3) 領収書の記録はブラウザ(公開の画面)から読み書きしない。
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin and an in-memory Stripe stub (GET only).
// Browser: store-receipt.html?operator=1 (operator login) and the admin-billing.html panel. No real services. Fake keys.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-receipt-refund-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";

const ORIGIN = "http://127.0.0.1:8883";
const ADMIN = "9413yutaka@gmail.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TEST_KEY = "rk_" + "test_FAKECHARGEKEYFORTESTS0001", TEST_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const LIVE_KEY = "rk_" + "live_FAKELIVECHARGEKEYFORTEST01", LIVE_PK = "pk_" + "live_FAKELIVEPUBLISHABLEKEY001";
const PREVIEW_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", STRIPE_MODE: "test", STRIPE_CHARGE_RESTRICTED_KEY: TEST_KEY, STRIPE_PUBLISHABLE_KEY: TEST_PK };
const PROD_ENV = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", STRIPE_MODE: "live", STRIPE_CHARGE_RESTRICTED_KEY: LIVE_KEY, STRIPE_PUBLISHABLE_KEY: LIVE_PK };
Object.assign(process.env, PREVIEW_ENV, { FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKECARDSETUPKEYONLY0001" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "u1@example.com"), u2: pw("u2", "u2@example.com"), admin: pw("adm1", ADMIN) };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

// ---- Stripe stub: GET payment_intents/{id} and GET refunds?payment_intent= (with permission / paging switches) ----
const ST = { pis: new Map(), refunds: new Map(), calls: [], keys: [], noRefundPermission: false, pageSize: 100, otherHosts: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname !== "api.stripe.com") { ST.otherHosts++; throw new Error("unexpected host " + u.hostname); }
  const method = opts.method || "GET";
  ST.calls.push(method + " " + u.pathname); ST.keys.push((opts.headers || {}).Authorization || "");
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  const m = u.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
  if (method === "GET" && m) { const pi = ST.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error", code: "resource_missing" } }); }
  if (method === "GET" && u.pathname === "/v1/refunds") {
    if (ST.noRefundPermission) return json(403, { error: { type: "invalid_request_error", message: "The provided key does not have the required permissions for this endpoint." } });
    const list = ST.refunds.get(u.searchParams.get("payment_intent")) || [];
    const after = u.searchParams.get("starting_after");
    const start = after ? list.findIndex((r) => r.id === after) + 1 : 0;
    const page = list.slice(start, start + ST.pageSize);
    return json(200, { object: "list", data: page, has_more: start + ST.pageSize < list.length });
  }
  return json(400, { error: { type: "invalid_request_error", code: "not_allowed_in_test" } });
};

const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const RC = await import(REPO_URL + "/api/_lib/store-custom-plan-receipt.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (/^(storeRegistrationRateLimits|storeBillingRateLimits)\//.test(k)) S.docs.delete(k); };
let ip = 0;
async function call(body, token) {
  clearRate();
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const snap = (prefix) => JSON.stringify([...S.docs.entries()].filter(([k]) => k.startsWith(prefix)));

// ---- fixtures ----
const PAID_AT = Date.UTC(2026, 11, 2, 1, 15);
S.docs.set("storeAccounts/S1", { storeName: "海辺のそば屋", registrationStatus: "active", enabled: true });
S.docs.set("storeAccounts/S2", { storeName: "丘の上のカフェ", registrationStatus: "active", enabled: true });
const inv = (storeId, month, uid, extra = {}) => ({ storeId, month, amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: uid, billingAccountUid: uid, laterHolderUids: [], chargeMode: "test", createdInPreview: true, status: "closed", chargeScheduledFor: "2026-12-02", ...extra });
const paid = (pi, extra = {}) => ({ status: "paid", paymentIntentId: pi, paymentIntentStatus: "succeeded", paidAt: Timestamp.fromMillis(PAID_AT), chargeOutcomeUnknown: false, ...extra });
const pi = (id, invoiceId) => ST.pis.set(id, { id, object: "payment_intent", amount: 100, amount_received: 100, currency: "jpy", status: "succeeded", metadata: { invoiceId, machinauProduct: "store_custom_plan" } });
const re = (id, piId, amount, status, createdSec = Math.floor(PAID_AT / 1000) + 86400) => ({ id, object: "refund", payment_intent: piId, currency: "jpy", amount, status, created: createdSec });
const set = (id, data) => S.docs.set("storeCustomPlanInvoices/" + id, data);
set("S1_2026-11", inv("S1", "2026-11", "u1", paid("pi_full"))); pi("pi_full", "S1_2026-11");
set("S1_2026-10", inv("S1", "2026-10", "u1", paid("pi_part"))); pi("pi_part", "S1_2026-10");
set("S1_2026-09", inv("S1", "2026-09", "u1", paid("pi_pend"))); pi("pi_pend", "S1_2026-09");
set("S1_2026-08", inv("S1", "2026-08", "u1", paid("pi_mix"))); pi("pi_mix", "S1_2026-08");
set("S1_2026-07", inv("S1", "2026-07", "u1", paid("pi_bad"))); pi("pi_bad", "S1_2026-07");
set("S1_2026-06", inv("S1", "2026-06", "u1", paid("pi_over"))); pi("pi_over", "S1_2026-06");
set("S1_2026-05", inv("S1", "2026-05", "u1")); // unpaid
set("S1_2026-04", inv("S1", "2026-04", "u1", paid("pi_page"))); pi("pi_page", "S1_2026-04");
ST.refunds.set("pi_full", [re("re_full1", "pi_full", 100, "succeeded")]);
ST.refunds.set("pi_part", [re("re_part1", "pi_part", 30, "succeeded")]);
ST.refunds.set("pi_pend", [re("re_pend1", "pi_pend", 100, "pending")]);
ST.refunds.set("pi_mix", [re("re_mix1", "pi_mix", 100, "failed"), re("re_mix2", "pi_mix", 100, "canceled"), re("re_mix3", "pi_mix", 40, "succeeded")]);
ST.refunds.set("pi_bad", [re("re_bad1", "pi_other", 10, "succeeded")]);
ST.refunds.set("pi_over", [re("re_over1", "pi_over", 100, "succeeded"), re("re_over2", "pi_over", 20, "succeeded")]);
ST.refunds.set("pi_page", [re("re_pg1", "pi_page", 10, "succeeded"), re("re_pg2", "pi_page", 10, "succeeded"), re("re_pg3", "pi_page", 10, "succeeded")]);

// ===================== R. refund sync =====================
let r = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S1_2026-11" }, "u1");
const receiptBefore = S.docs.get("storeCustomPlanReceipts/S1_2026-11");
t("R0 前提：返金の前に領収書を発行済み（税込100円）", r.code === 200 && r.body.receipt.refund === null && !!receiptBefore, r.body);
const sync = (id, token = "admin") => call({ mode: "adminStoreCustomPlanRefundSync", invoiceId: id }, token);
r = await sync("S1_2026-11");
let invAfter = S.docs.get("storeCustomPlanInvoices/S1_2026-11");
t("R1 全額返金：Stripe で成立した返金（succeeded 100円）を記録・台帳は全額返金済み（返金日は Stripe の日時）・状態（paid）と支払日は変えない",
  r.code === 200 && r.body.refundState === "full" && r.body.refundedAmountJpy === 100 && invAfter.refundState === "full" && invAfter.refundedAmountJpy === 100 && ms(invAfter.refundedAt) === PAID_AT + 86400000 - (PAID_AT % 1000) &&
  invAfter.status === "paid" && ms(invAfter.paidAt) === PAID_AT && S.docs.has("storeCustomPlanRefunds/re_full1"), r.body);
r = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-11" }, "u1");
const receiptAfter = S.docs.get("storeCustomPlanReceipts/S1_2026-11");
t("R2 元の領収書は消さず（番号・金額・支払日そのまま）、全額返金済みを示す", r.code === 200 && r.body.receipt.receiptNumber === receiptBefore.receiptNumber && r.body.receipt.amountJpy === 100 && r.body.receipt.refund.full === true && r.body.receipt.refund.amountJpy === 100 && JSON.stringify(receiptAfter) === JSON.stringify(receiptBefore), r.body.receipt);
const refundDoc = JSON.stringify(S.docs.get("storeCustomPlanRefunds/re_full1"));
r = await sync("S1_2026-11");
t("R3 二重に反映しない：同じ照会をもう一度しても返金額は100円のまま・返金の記録は1件・変更0件（照合の履歴だけ増える）",
  r.code === 200 && r.body.refundedAmountJpy === 100 && r.body.changedRefunds === 0 && JSON.stringify(S.docs.get("storeCustomPlanRefunds/re_full1")) === refundDoc && S.docs.get("storeCustomPlanInvoices/S1_2026-11").refundSyncHistory.length === 2, r.body);
r = await sync("S1_2026-10");
t("R4 一部返金：30円 → 一部返金済み（全額と区別）", r.code === 200 && r.body.refundState === "partial" && S.docs.get("storeCustomPlanInvoices/S1_2026-10").refundedAmountJpy === 30, r.body);
r = await sync("S1_2026-09");
t("R5 処理中の返金：返金額に数えない（0円）・状態は返金処理中", r.code === 200 && r.body.refundState === "pending" && r.body.refundedAmountJpy === 0 && r.body.pendingAmountJpy === 100, r.body);
ST.refunds.get("pi_pend")[0].status = "succeeded";
r = await sync("S1_2026-09");
const pendDoc = S.docs.get("storeCustomPlanRefunds/re_pend1");
t("R6 処理中→成立：もう一度の照会で全額返金済み・返金の状態の変化を履歴に残す（pending→succeeded）", r.code === 200 && r.body.refundState === "full" && pendDoc.statusHistory.map((h) => h.status).join(",") === "pending,succeeded" && pendDoc.status === "succeeded", pendDoc);
r = await sync("S1_2026-08");
t("R7 失敗・取消しの返金は返金額に数えない（記録には残す）", r.code === 200 && r.body.refundState === "partial" && r.body.refundedAmountJpy === 40 && S.docs.get("storeCustomPlanRefunds/re_mix1").status === "failed" && S.docs.get("storeCustomPlanRefunds/re_mix2").status === "canceled", r.body);
ST.pageSize = 2;
r = await sync("S1_2026-04");
ST.pageSize = 100;
t("R8 返金の一覧を最後まで読む（2ページ・3件・30円）", r.code === 200 && r.body.refundCount === 3 && r.body.refundedAmountJpy === 30 && ST.calls.filter((c) => c === "GET /v1/refunds").length >= 2, r.body);

let before = snap("storeCustomPlan");
ST.noRefundPermission = true;
r = await sync("S1_2026-10");
ST.noRefundPermission = false;
t("R9 請求専用キーに返金の読み取りの権限が無い：成功にしない（403 refund_permission_missing）・何も書かない", r.code === 403 && r.body.reason === "refund_permission_missing" && snap("storeCustomPlan") === before, r.body);
r = await sync("S1_2026-07");
const r10b = await sync("S1_2026-06");
t("R10 別の支払いの返金が混じる・返金の合計が支払額を超える → 何も書かない", r.code === 502 && r.body.reason === "refund_list_invalid" && r10b.code === 409 && r10b.body.reason === "refund_amount_exceeds_payment" && snap("storeCustomPlan") === before, [r.body, r10b.body]);
const r11a = await sync("S1_2026-05"), r11b = await sync("S1_2026-11", "u1"), r11c = await sync("S1_2026-11", null);
t("R11 未払いの請求は照合しない（409）・店主は使えない（403）・ログインなし（401）", r11a.code === 409 && r11b.code === 403 && r11c.code === 401, [r11a.body, r11b.code, r11c.code]);
r = await call({ mode: "storeCustomPlanInvoiceList" }, "u1");
const byId = Object.fromEntries((r.body.invoices || []).map((x) => [x.invoiceId, x]));
t("R12 店主の請求の一覧：全額・一部・処理中の返金を区別して返す（返金額は成立したものだけ）", byId["S1_2026-11"].refundState === "full" && byId["S1_2026-10"].refundState === "partial" && byId["S1_2026-10"].refundedAmountJpy === 30 && byId["S1_2026-05"].refundState === "none", Object.values(byId).map((x) => x.invoiceId + ":" + x.refundState));
t("R13 Stripe には GET だけ（返金を作らない・取り消さない）・Stripe 以外へ通信しない", ST.calls.every((c) => c.startsWith("GET ")) && ST.otherHosts === 0, ST.calls.filter((c) => !c.startsWith("GET ")));
Object.assign(process.env, PROD_ENV);
set("P1_2026-11", inv("P1", "2026-11", "u1", paid("pi_live1", { chargeMode: "live", createdInPreview: false }))); pi("pi_live1", "P1_2026-11");
ST.refunds.set("pi_live1", [re("re_live1", "pi_live1", 100, "succeeded")]);
const keysBefore = ST.keys.length;
r = await sync("P1_2026-11");
const r14b = await sync("S1_2026-10");
Object.assign(process.env, PREVIEW_ENV);
t("R14 Production：本番の請求専用キーで照会・テスト／Preview 試験の請求書は照合しない（environment_mismatch）", r.code === 200 && ST.keys.slice(keysBefore).every((k) => k === "Bearer " + LIVE_KEY) && r14b.code === 409 && r14b.body.reason === "environment_mismatch", [r.body, r14b.body]);

// ===================== P. operator re-provision after account deletion =====================
set("S2_2026-11", inv("S2", "2026-11", "u2", paid("pi_s2"))); pi("pi_s2", "S2_2026-11");
S.docs.set("accountDeletions/u2", { uid: "u2", status: "completed", storeIds: ["S2"] });
const prov = (body, token = "admin") => call({ mode: "adminStoreCustomPlanReceiptProvide", invoiceId: "S2_2026-11", ...body }, token);
before = snap("storeCustomPlanReceipt");
const p1 = await prov({ verificationMethod: "registered_email", verificationNote: "登録メールからの依頼に返信して確認" }, "u2");
const p2 = await prov({ verificationMethod: "", verificationNote: "メモ" });
const p3 = await prov({ verificationMethod: "phone", verificationNote: "" });
const p4 = await prov({ verificationMethod: "registered_email", verificationNote: "確認" }, null);
t("P1 運営だけ（店主 403・ログインなし 401）・本人確認の方法とメモが無ければ 400 verification_required・何も書かない",
  p1.code === 403 && p4.code === 401 && p2.code === 400 && p2.body.reason === "verification_required" && p3.code === 400 && p3.body.field === "verificationNote" && snap("storeCustomPlanReceipt") === before, [p1.code, p2.body, p3.body, p4.code]);
r = await prov({ verificationMethod: "registered_email", verificationNote: "登録メールからの依頼に返信して確認", addressee: "丘の上カフェ株式会社" });
const issuedByOp = S.docs.get("storeCustomPlanReceipts/S2_2026-11");
const logs1 = [...S.docs.entries()].filter(([k]) => k.startsWith("storeCustomPlanReceiptProvisions/"));
t("P2 退会済み（ログイン削除）の店主の未発行の請求：運営が本人確認のうえ発行（台帳と Stripe の照合つき・宛名は運営が入力）・請求先は元のアカウントのまま",
  r.code === 200 && r.body.issuedNow === true && r.body.receipt.addressee === "丘の上カフェ株式会社" && issuedByOp.billingAccountUid === "u2" && issuedByOp.addresseeHistory[0].kind === "issued_by_operator" && issuedByOp.addresseeHistory[0].byUid === "adm1", r.body);
t("P3 提供の記録：請求書ID・領収書番号・運営の uid・日時・本人確認の方法とメモ・退会の状態（completed）",
  logs1.length === 1 && logs1[0][1].receiptNumber === issuedByOp.receiptNumber && logs1[0][1].providedByUid === "adm1" && logs1[0][1].verificationMethod === "registered_email" && logs1[0][1].ownerAccountDeletionStatus === "completed" && ms(logs1[0][1].providedAt) > 0, logs1);
t("P4 退会したアカウントの情報を復元しない：応答と記録にメールアドレス・ログインの情報・カード・顧客を含めない・削除の記録は変えない",
  !/@example\.com|cus_|pm_|pi_|rk_|secret/.test(JSON.stringify(r.body) + JSON.stringify(logs1)) && S.docs.get("accountDeletions/u2").status === "completed" && !S.docs.has("storeMembers/S2_u2"), r.body);
await sleep(5);
r = await prov({ verificationMethod: "phone", verificationNote: "電話で登録情報を確認", addressee: "別の宛名" });
const list = await call({ mode: "adminStoreCustomPlanReceiptProvisionList", invoiceId: "S2_2026-11" }, "admin");
t("P5 発行済みなら同じ領収書（番号・宛名そのまま・issuedNow false）・提供のたびに記録・一覧は新しい順",
  r.code === 200 && r.body.issuedNow === false && r.body.receipt.receiptNumber === issuedByOp.receiptNumber && r.body.receipt.addressee === "丘の上カフェ株式会社" && list.code === 200 && list.body.items.length === 2 && list.body.items[0].verificationMethod === "phone" && list.body.items[1].verificationMethod === "registered_email", list.body);
const p6 = await call({ mode: "adminStoreCustomPlanReceiptProvide", invoiceId: "S1_2026-05", verificationMethod: "phone", verificationNote: "確認" }, "admin");
const p7 = await call({ mode: "adminStoreCustomPlanReceiptProvisionList" }, "u1");
t("P6 未払いの請求は運営でも発行しない（409・記録なし）・提供の記録は運営だけが読める", p6.code === 409 && p6.body.reason === "not_paid" && !S.docs.has("storeCustomPlanReceipts/S1_2026-05") && [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanReceiptProvisions/")).length === 2 && p7.code === 403, [p6.body, p7.code]);

// ===================== F. browser code never touches the billing / receipt records =====================
const pages = readdirSync(REPO_ROOT).filter((f) => /\.(html|js)$/.test(f));
const direct = pages.filter((f) => /collection\(\s*["'](storeCustomPlan[A-Za-z]*|accountBilling|accountDeletions)["']/.test(readFileSync(join(REPO_ROOT, f), "utf8")));
t("F1 公開の画面のコード（html・js）は請求・領収書・返金・提供の記録の Firestore を直接読み書きしない（サーバーの API だけ）", direct.length === 0, direct);
const RECEIPT_PAGE = readFileSync(join(REPO_ROOT, "store-receipt.html"), "utf8");
t("F2 領収書の画面は API（ログインのトークンつき）だけで取得し、URL だけでは表示しない（ログインなしは案内のみ）", /Authorization: "Bearer " \+ idToken/.test(RECEIPT_PAGE) && !/firestore\(\)/.test(RECEIPT_PAGE) && /login_required/.test(RECEIPT_PAGE));

// ===================== U. browser: operator mode and admin panel =====================
const fakeAdmin = `(() => {
  const user = { uid: "adm1", email: "${ADMIN}", isAnonymous: false, emailVerified: true, getIdToken: async () => "admin" };
  const app = { name: "[DEFAULT]", options: { projectId: "chikashoku-app" }, auth: () => ({ currentUser: user, onAuthStateChanged(cb) { setTimeout(() => cb(user), 0); return () => {}; } }) };
  Object.defineProperty(window, "machinauFirebaseApp", { configurable: true, get() { return app; }, set(v) {} });
})();`;
async function api(url, method, log, postData, headers) {
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return null;
  const e = console.error; console.error = () => {};
  try {
    if (method === "GET") { const x = res(); await handler({ method: "GET", headers: {}, query: Object.fromEntries(u.searchParams.entries()) }, x); return { status: x.code, body: x.body }; }
    clearRate();
    const auth = headers.Authorization || headers.authorization;
    const x = res();
    await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...(auth ? { authorization: auth } : {}) }, body: JSON.parse(postData || "{}"), query: {} }, x);
    return { status: x.code, body: x.body };
  } finally { console.error = e; }
}
const server = await serve(REPO_ROOT + "", 8883);
const browser = await launchChrome();
try {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, initScripts: [fakeAdmin] } });
  await p.goto("/store-receipt.html?invoice=S2_2026-11&operator=1");
  await p.waitFor(`!document.getElementById("operatorPanel").hidden`, 15000);
  const logsBefore = [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanReceiptProvisions/")).length;
  await p.ev(`document.getElementById("operatorProvideButton").click(); true`);
  await p.waitFor(`!document.getElementById("message").hidden`, 10000);
  const noVerify = await p.ev(`({ msg: document.getElementById("message").textContent, receipt: !document.getElementById("receiptArea").hidden })`);
  t("U1 運営の再提供の画面：本人確認の方法とメモを入れないと表示しない（記録も増えない）", /本人確認の方法とメモを入力/.test(noVerify.msg) && !noVerify.receipt && [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanReceiptProvisions/")).length === logsBefore, noVerify);
  await p.ev(`document.getElementById("verificationMethodInput").value = "registered_email"; document.getElementById("verificationNoteInput").value = "依頼メールに返信して確認"; document.getElementById("operatorProvideButton").click(); true`);
  await p.waitFor(`!document.getElementById("receiptArea").hidden`, 15000);
  const shown = await p.ev(`({ text: document.getElementById("receipt").innerText, correct: getComputedStyle(document.getElementById("correctToggle")).display, panel: document.getElementById("operatorPanel").hidden })`);
  t("U2 本人確認を入れると領収書を表示（同じ番号・宛名）・宛名の訂正は出さない・提供の記録が1件増える",
    new RegExp(issuedByOp.receiptNumber).test(shown.text) && /丘の上カフェ株式会社 様/.test(shown.text) && shown.correct === "none" && shown.panel === true && [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanReceiptProvisions/")).length === logsBefore + 1, shown);
  const a = await openPage(browser, { origin: ORIGIN, width: 1280, state: { apiMock: api } });
  await a.goto("/admin-billing.html"); await a.waitFor("document.readyState === 'complete'"); await sleep(500);
  const panel = await a.ev(`({ panel: !!document.getElementById("customPlanReceiptPanel"), sync: !!document.getElementById("customPlanRefundSyncButton"), open: !!document.getElementById("customPlanReceiptOperatorButton"), list: !!document.getElementById("customPlanReceiptProvisionListButton"), adminHidden: document.getElementById("adminArea") ? getComputedStyle(document.getElementById("adminArea")).display === "none" || document.getElementById("adminArea").hidden : true })`);
  t("U3 運営の請求の画面に「Stripe の返金を確認」「本人確認のうえ領収書を開く」「提供の記録」・ログイン前は運営の操作の欄を出さない", panel.panel && panel.sync && panel.open && panel.list && panel.adminHidden, panel);
  const errs = p.log.errors.filter((e) => !/Failed to load resource|net::ERR|gstatic|favicon/i.test(e));
  t("U4 画面にスクリプトのエラーが出ない", errs.length === 0, errs.slice(0, 3));
} finally {
  browser.close(); server.close();
}

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
