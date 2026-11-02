// STEP 54｜店舗カード月額100円の領収書。REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin and
// an in-memory Stripe stub (GET /v1/payment_intents/{id} only). Issue only after the ledger is paid AND Stripe confirms the
// PaymentIntent (succeeded / amount_received / jpy / metadata invoiceId); refuse unpaid, processing, unknown, failed and
// mismatched payments; one receipt per invoice (also under concurrent requests); owner-only (other accounts get 404);
// addressee before issue (default = store name) and corrections with history; amount, paid date, number never change;
// refunds shown without deleting the record; Production uses the live charge key and only live invoices, Preview only test
// invoices; issuer = the tokushoho operator, no invoice registration number. Browser: the "View receipt" link on
// store-account.html and store-receipt.html (phone width, issue, correct, print view). No real services. Fake keys.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-custom-plan-receipt-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";

const ORIGIN = "http://127.0.0.1:8881";
const ADMIN = "9413yutaka@gmail.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TEST_KEY = "rk_" + "test_FAKECHARGEKEYFORTESTS0001", TEST_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const LIVE_KEY = "rk_" + "live_FAKELIVECHARGEKEYFORTEST01", LIVE_PK = "pk_" + "live_FAKELIVEPUBLISHABLEKEY001";
const PREVIEW_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", STRIPE_MODE: "test", STRIPE_CHARGE_RESTRICTED_KEY: TEST_KEY, STRIPE_PUBLISHABLE_KEY: TEST_PK };
const PROD_ENV = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", STRIPE_MODE: "live", STRIPE_CHARGE_RESTRICTED_KEY: LIVE_KEY, STRIPE_PUBLISHABLE_KEY: LIVE_PK };
Object.assign(process.env, PREVIEW_ENV, { FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKECARDSETUPKEYONLY0001" });
const pw = (uid, email, verified = true) => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "u1@example.com"), u2: pw("u2", "u2@example.com"), u3: pw("u3", "u3@example.com", false) };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

// ---- Stripe stub (GET only; the receipt never creates or changes a payment) ----
const ST = { pis: new Map(), calls: [], keys: [], fail: 0, otherHosts: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname !== "api.stripe.com") { ST.otherHosts++; throw new Error("unexpected host " + u.hostname); }
  ST.calls.push((opts.method || "GET") + " " + u.pathname); ST.keys.push((opts.headers || {}).Authorization || "");
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (ST.fail > 0) { ST.fail--; throw new Error("socket hang up"); }
  const m = u.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
  if ((opts.method || "GET") === "GET" && m) { const pi = ST.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error", code: "resource_missing" } }); }
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
const receipts = () => [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanReceipts/"));
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);

// ---- fixtures ----
const PAID_AT = Date.UTC(2026, 11, 2, 1, 15); // 2026-12-02 10:15 JST
S.docs.set("storeAccounts/S1", { storeName: "海辺のそば屋", registrationStatus: "active", enabled: true });
S.docs.set("storeAccounts/S2", { storeName: "丘の上のカフェ", registrationStatus: "active", enabled: true });
const inv = (storeId, month, uid, extra = {}) => ({ storeId, month, amountJpy: 100, currency: "JPY", taxIncluded: true, holderUid: uid, billingAccountUid: uid, laterHolderUids: [], chargeMode: "test", createdInPreview: true, status: "closed", chargeScheduledFor: "2026-12-02", ...extra });
const paid = (pi, extra = {}) => ({ status: "paid", paymentIntentId: pi, paymentIntentStatus: "succeeded", paidAt: Timestamp.fromMillis(PAID_AT), chargeOutcomeUnknown: false, ...extra });
const pi = (id, invoiceId, extra = {}) => ST.pis.set(id, { id, object: "payment_intent", amount: 100, amount_received: 100, currency: "jpy", status: "succeeded", customer: "cus_x", metadata: { invoiceId, machinauProduct: "store_custom_plan", storeId: invoiceId.split("_")[0], month: invoiceId.slice(-7) }, ...extra });
const set = (id, data) => S.docs.set("storeCustomPlanInvoices/" + id, data);
set("S1_2026-11", inv("S1", "2026-11", "u1", paid("pi_ok1"))); pi("pi_ok1", "S1_2026-11");
set("S1_2026-10", inv("S1", "2026-10", "u1")); // closed (unpaid)
set("S1_2026-09", inv("S1", "2026-09", "u1", { status: "processing", paymentIntentId: "pi_proc", paymentIntentStatus: "processing" }));
set("S1_2026-08", inv("S1", "2026-08", "u1", { status: "needs_review", chargeOutcomeUnknown: true }));
set("S1_2026-07", inv("S1", "2026-07", "u1", { status: "payment_failed", paymentIntentId: "pi_fail", paymentIntentStatus: "requires_payment_method" }));
set("S1_2026-06", inv("S1", "2026-06", "u1", paid("pi_amount"))); pi("pi_amount", "S1_2026-06", { amount_received: 50 });
set("S1_2026-05", inv("S1", "2026-05", "u1", paid("pi_notyet"))); pi("pi_notyet", "S1_2026-05", { status: "processing", amount_received: 0 });
set("S1_2026-04", inv("S1", "2026-04", "u1", paid("pi_other"))); pi("pi_other", "S9_2026-04");
set("S1_2026-03", inv("S1", "2026-03", "u1", paid("pi_refund", { refundedAmountJpy: 100, refundedAt: Timestamp.fromMillis(PAID_AT + 5 * 86400000) }))); pi("pi_refund", "S1_2026-03");
set("S1_2026-02", inv("S1", "2026-02", "u1", paid("pi_net"))); pi("pi_net", "S1_2026-02");
set("S1_2026-01", inv("S1", "2026-01", "u1", paid("pi_paidonly", { paymentIntentStatus: "" })));
set("S2_2026-11", inv("S2", "2026-11", "u2", paid("pi_ok2"))); pi("pi_ok2", "S2_2026-11");
set("S2_2026-10", inv("S2", "2026-10", "u2", paid("pi_ok3"))); pi("pi_ok3", "S2_2026-10");

// ===================== A. issue after the ledger AND Stripe confirm =====================
let r = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-11" }, "u1");
t("A1 発行前の確認：支払い済みの請求は未発行の確認を返す（宛名の既定は登録店舗名・税込100円・支払日）・Stripe には照会しない・記録を作らない",
  r.code === 200 && r.body.issued === false && r.body.preview.defaultAddressee === "海辺のそば屋" && r.body.preview.amountJpy === 100 && r.body.preview.taxIncluded === true && r.body.preview.paidAtMillis === PAID_AT && ST.calls.length === 0 && receipts().length === 0, r.body);
r = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S1_2026-11", addressee: "", amountJpy: 1, paidAt: 0, receiptNumber: "X" }, "u1");
const rec1 = r.body.receipt || {};
t("A2 発行：宛名が未入力なら登録店舗名・金額は Stripe で確かめた税込100円（画面から送った金額・番号・日付は使わない）",
  r.code === 200 && r.body.issued === true && r.body.alreadyIssued === false && rec1.addressee === "海辺のそば屋" && rec1.amountJpy === 100 && rec1.taxIncluded === true && rec1.receiptNumber !== "X", r.body);
t("A3 記載：対象利用月・支払日・領収書番号（請求書IDから決まる MN-202611-…）・請求書ID・発行日・但し書き・支払方法・発行者（表示名マチナウ）",
  rec1.month === "2026-11" && rec1.paidAtMillis === PAID_AT && rec1.receiptNumber === RC.storeCustomPlanReceiptNumber("S1_2026-11", "2026-11") && /^MN-202611-[0-9A-F]{8}$/.test(rec1.receiptNumber) &&
  rec1.invoiceId === "S1_2026-11" && rec1.issuedAtMillis > 0 && rec1.purpose === "マチナウ 店舗プロフィールカスタマイズプラン利用料として" && rec1.paymentMethod === "クレジットカード決済" &&
  rec1.issuer.serviceName === "マチナウ" && rec1.issuer.sellerName === "上田 豊" && rec1.refund === null, rec1);
t("A4 Stripe には PaymentIntent の取得（GET）だけ・テストの請求書はテストの請求専用キーで照会", JSON.stringify(ST.calls) === JSON.stringify(["GET /v1/payment_intents/pi_ok1"]) && ST.keys.every((k) => k === "Bearer " + TEST_KEY), ST.calls);
const stored = S.docs.get("storeCustomPlanReceipts/S1_2026-11");
t("A5 記録：storeCustomPlanReceipts/{請求書ID}・請求先・支払いID・発行の記録（宛名の履歴）を保存", !!stored && stored.billingAccountUid === "u1" && stored.paymentIntentId === "pi_ok1" && stored.addresseeHistory.length === 1 && stored.addresseeHistory[0].kind === "issued" && stored.storeNameAtIssue === "海辺のそば屋");
t("A6 応答にキー・カード・顧客・支払いの ID を出さない", !/rk_|sk_|pm_|cus_|pi_|secret/.test(JSON.stringify(r.body)), r.body);

// ===================== B. no duplicates, stable values =====================
const callsBefore = ST.calls.length;
S.docs.set("storeAccounts/S1", { storeName: "改名後のそば屋", registrationStatus: "active", enabled: true });
r = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S1_2026-11", addressee: "別の宛名" }, "u1");
t("B1 2回目の発行は同じ領収書（alreadyIssued）・番号・金額・支払日・発行日・宛名は変わらない・店舗名の変更でも書き換えない・Stripe に照会しない・記録は1件",
  r.code === 200 && r.body.alreadyIssued === true && r.body.receipt.receiptNumber === rec1.receiptNumber && r.body.receipt.issuedAtMillis === rec1.issuedAtMillis && r.body.receipt.paidAtMillis === PAID_AT && r.body.receipt.addressee === "海辺のそば屋" && ST.calls.length === callsBefore && receipts().length === 1, r.body);
r = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-11" }, "u1");
t("B2 表示（Get）も同じ内容", r.code === 200 && r.body.issued === true && r.body.receipt.receiptNumber === rec1.receiptNumber && r.body.receipt.addressee === "海辺のそば屋");
const both = await Promise.all([call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S2_2026-11", addressee: "A社" }, "u2"), call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S2_2026-11", addressee: "B社" }, "u2")]);
const s2 = S.docs.get("storeCustomPlanReceipts/S2_2026-11");
t("B3 同時の発行でも1件だけ・2つの応答は同じ番号・宛名は先に確定した方", both.every((x) => x.code === 200) && both[0].body.receipt.receiptNumber === both[1].body.receipt.receiptNumber && both[0].body.receipt.addressee === both[1].body.receipt.addressee && ["A社", "B社"].includes(s2.addressee) && receipts().filter((k) => k.includes("S2_2026-11")).length === 1, both.map((x) => x.body));

// ===================== C. refuse when the payment is not confirmed =====================
const refuse = async (id, reason, code = 409) => { const before = ST.calls.length; const x = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: id }, "u1"); const g = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: id }, "u1"); return { ok: x.code === code && x.body.reason === reason && !S.docs.has("storeCustomPlanReceipts/" + id), stripe: ST.calls.length - before, x: x.body, g: g.body, gcode: g.code }; };
let c = await refuse("S1_2026-10", "not_paid");
t("C1 未払い（締めただけ）：発行しない（not_paid）・Stripe に照会しない・確認の画面も出さない", c.ok && c.stripe === 0 && c.gcode === 409 && c.g.reason === "not_paid", c);
c = await refuse("S1_2026-09", "payment_processing");
t("C2 決済処理中：発行しない（payment_processing）", c.ok && c.stripe === 0, c);
c = await refuse("S1_2026-08", "payment_unconfirmed");
t("C3 決済結果不明（要確認）：発行しない（payment_unconfirmed）", c.ok && c.stripe === 0, c);
c = await refuse("S1_2026-07", "payment_failed");
t("C4 決済失敗：発行しない（payment_failed）", c.ok && c.stripe === 0, c);
c = await refuse("S1_2026-01", "payment_unconfirmed");
t("C5 台帳が paid でも Stripe の成功の記録（succeeded）が無ければ発行しない（台帳の表示だけで推定しない）", c.ok && c.stripe === 0, c);
c = await refuse("S1_2026-06", "payment_unconfirmed");
t("C6 Stripe の受領額が台帳と違う → 発行しない", c.ok && c.stripe === 1, c);
c = await refuse("S1_2026-05", "payment_unconfirmed");
t("C7 Stripe 側がまだ成功していない → 発行しない", c.ok && c.stripe === 1, c);
c = await refuse("S1_2026-04", "payment_unconfirmed");
t("C8 Stripe の支払いが別の請求書のもの（metadata の請求書IDが違う）→ 発行しない", c.ok && c.stripe === 1, c);
ST.fail = 1;
c = await refuse("S1_2026-02", "stripe_unavailable", 503);
t("C9 Stripe に照会できない → 発行しない（503 stripe_unavailable）・次の試行で発行できる", c.ok, c);
r = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S1_2026-02" }, "u1");
t("C10 照会できた後は発行できる", r.code === 200 && r.body.issued === true, r.body);

// ===================== D. owner only =====================
const before = JSON.stringify([...S.docs.entries()].filter(([k]) => k.startsWith("storeCustomPlanReceipts/")));
const d1 = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-11" }, "u2");
const d2 = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S1_2026-10" }, "u2");
const d3 = await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S1_2026-11", addressee: "乗っ取り" }, "u2");
const d4 = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-11" });
const d5 = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-11" }, "u3");
const d6 = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "../S1_2026-11" }, "u1");
t("D1 他のアカウントは、請求書ID を変えても他店舗の領収書を読めない・発行も訂正もできない（404・内容を返さない）",
  d1.code === 404 && d2.code === 404 && d3.code === 404 && !JSON.stringify([d1.body, d2.body, d3.body]).includes("海辺") && JSON.stringify([...S.docs.entries()].filter(([k]) => k.startsWith("storeCustomPlanReceipts/"))) === before, [d1.body, d3.body]);
t("D2 ログインなし 401・メール未確認 403・不正な請求書ID 400", d4.code === 401 && d5.code === 403 && d5.body.reason === "email_not_verified" && d6.code === 400, [d4.code, d5.code, d6.code]);
S.docs.set("storeCustomPlanReceipts/S1_2026-12", { ...S.docs.get("storeCustomPlanReceipts/S1_2026-11"), invoiceId: "S1_2026-12", billingAccountUid: "u2" });
set("S1_2026-12", inv("S1", "2026-12", "u1", paid("pi_x")));
const d7 = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-12" }, "u1");
t("D3 領収書の記録の請求先が違う時も返さない（台帳と記録の両方で請求先を確かめる）", d7.code === 200 && d7.body.issued === false, d7.body);
S.docs.delete("storeCustomPlanReceipts/S1_2026-12"); S.docs.delete("storeCustomPlanInvoices/S1_2026-12");

// ===================== E. addressee and corrections =====================
r = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S2_2026-10", addressee: "  株式会社　丘の上  " }, "u2");
t("E1 発行の前に入力した宛名で発行（前後の空白は除く）", r.code === 200 && r.body.receipt.addressee === "株式会社　丘の上", r.body);
const bad1 = await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S2_2026-10", addressee: "あ".repeat(61) }, "u2");
const bad2 = await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S2_2026-10", addressee: "" }, "u2");
const bad3 = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S1_2026-03", addressee: "制御\u0007文字" }, "u1");
t("E2 宛名は60文字まで・空の訂正は不可・制御文字は不可（400）", bad1.code === 400 && bad2.code === 400 && bad3.code === 400 && !S.docs.has("storeCustomPlanReceipts/S1_2026-03"), [bad1.body, bad3.body]);
const beforeFix = S.docs.get("storeCustomPlanReceipts/S2_2026-10");
r = await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S2_2026-10", addressee: "株式会社 丘の上珈琲" }, "u2");
const afterFix = S.docs.get("storeCustomPlanReceipts/S2_2026-10");
t("E3 宛名の訂正：訂正の記録（訂正前・訂正後・日時・アカウント）を残す・番号・金額・支払日・発行日は変わらない",
  r.code === 200 && r.body.changed === true && r.body.receipt.addressee === "株式会社 丘の上珈琲" && r.body.receipt.corrections.length === 1 && r.body.receipt.corrections[0].previous === "株式会社　丘の上" &&
  afterFix.addresseeHistory.length === 2 && afterFix.addresseeHistory[1].byUid === "u2" && afterFix.receiptNumber === beforeFix.receiptNumber && afterFix.amountJpy === beforeFix.amountJpy && ms(afterFix.paidAt) === ms(beforeFix.paidAt) && ms(afterFix.issuedAt) === ms(beforeFix.issuedAt), r.body);
r = await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S2_2026-10", addressee: "株式会社 丘の上珈琲" }, "u2");
const nf = await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S1_2026-10", addressee: "未発行" }, "u1");
t("E4 同じ宛名なら記録を増やさない・未発行の請求は訂正できない（409 receipt_not_issued）", r.code === 200 && r.body.changed === false && S.docs.get("storeCustomPlanReceipts/S2_2026-10").addresseeHistory.length === 2 && nf.code === 409 && nf.body.reason === "receipt_not_issued", [r.body, nf.body]);
for (let i = 0; i < RC.STORE_CUSTOM_PLAN_RECEIPT_CORRECTION_MAX; i++) await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S2_2026-10", addressee: "宛名" + i }, "u2");
r = await call({ mode: "storeCustomPlanReceiptCorrectAddressee", invoiceId: "S2_2026-10", addressee: "上限の後" }, "u2");
t("E5 訂正は最大20回（429 too_many_corrections）", r.code === 429 && r.body.reason === "too_many_corrections", r.body);

// ===================== F. refund keeps the record =====================
r = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "S1_2026-03" }, "u1");
t("F1 返金済みの請求：領収書は元の金額（税込100円）のまま・返金済み（全額・返金日）を明示", r.code === 200 && r.body.receipt.amountJpy === 100 && r.body.receipt.refund && r.body.receipt.refund.full === true && r.body.receipt.refund.amountJpy === 100 && r.body.receipt.refund.refundedAtMillis === PAID_AT + 5 * 86400000, r.body);
const inv11 = S.docs.get("storeCustomPlanInvoices/S1_2026-11");
S.docs.set("storeCustomPlanInvoices/S1_2026-11", { ...inv11, refundedAmountJpy: 30, refundedAt: Timestamp.fromMillis(PAID_AT + 86400000) });
r = await call({ mode: "storeCustomPlanReceiptGet", invoiceId: "S1_2026-11" }, "u1");
t("F2 発行の後に返金が記録されても、領収書の記録は消さず（番号・金額そのまま）一部返金を示す", r.code === 200 && r.body.receipt.receiptNumber === rec1.receiptNumber && r.body.receipt.amountJpy === 100 && r.body.receipt.refund.full === false && r.body.receipt.refund.amountJpy === 30 && S.docs.has("storeCustomPlanReceipts/S1_2026-11"), r.body);
S.docs.set("storeCustomPlanInvoices/S1_2026-11", inv11);

// ===================== G. Production / Preview separation =====================
Object.assign(process.env, PROD_ENV);
set("P1_2026-11", inv("P1", "2026-11", "u1", paid("pi_live1", { chargeMode: "live", createdInPreview: false }))); pi("pi_live1", "P1_2026-11");
set("P2_2026-11", inv("P2", "2026-11", "u1", paid("pi_test2", { chargeMode: "test", createdInPreview: false }))); pi("pi_test2", "P2_2026-11");
set("P3_2026-11", inv("P3", "2026-11", "u1", paid("pi_prev3", { chargeMode: "live", createdInPreview: true }))); pi("pi_prev3", "P3_2026-11");
S.docs.set("storeAccounts/P1", { storeName: "本番の店", registrationStatus: "active", enabled: true });
const keysBefore = ST.keys.length;
r = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "P1_2026-11" }, "u1");
t("G1 Production：本番の請求（live）の請求書は、本番の請求専用キー（rk_live_）で Stripe に照会して発行・テストの印なし", r.code === 200 && r.body.receipt.testMode === false && ST.keys.slice(keysBefore).every((k) => k === "Bearer " + LIVE_KEY) && ST.keys.length > keysBefore, r.body);
const g2 = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "P2_2026-11" }, "u1");
const g3 = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "P3_2026-11" }, "u1");
t("G2 Production：テストの請求書・Preview 試験で作った請求書には発行しない（environment_mismatch）", g2.code === 409 && g2.body.reason === "environment_mismatch" && g3.code === 409 && g3.body.reason === "environment_mismatch" && !S.docs.has("storeCustomPlanReceipts/P2_2026-11") && !S.docs.has("storeCustomPlanReceipts/P3_2026-11"), [g2.body, g3.body]);
Object.assign(process.env, { ...PROD_ENV, STRIPE_CHARGE_RESTRICTED_KEY: "sk_" + "live_FAKEWIDEKEY" });
set("P4_2026-11", inv("P4", "2026-11", "u1", paid("pi_live4", { chargeMode: "live", createdInPreview: false }))); pi("pi_live4", "P4_2026-11");
const g4 = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "P4_2026-11" }, "u1");
t("G3 Production：請求専用キーが制限付きの本番キーでなければ照会しない（503 stripe_unavailable・発行しない）", g4.code === 503 && g4.body.reason === "stripe_unavailable" && !S.docs.has("storeCustomPlanReceipts/P4_2026-11"), g4.body);
Object.assign(process.env, PREVIEW_ENV);
const g5 = await call({ mode: "storeCustomPlanReceiptIssue", invoiceId: "P4_2026-11" }, "u1");
t("G4 Preview：本番の請求（live）の請求書には発行しない（environment_mismatch）", g5.code === 409 && g5.body.reason === "environment_mismatch", g5.body);

// ===================== H. owner list, issuer, legal text, retention =====================
r = await call({ mode: "storeCustomPlanInvoiceList" }, "u1");
const byId = Object.fromEntries((r.body.invoices || []).map((x) => [x.invoiceId, x]));
t("H1 店主の請求の一覧：領収書の入口は、支払い済み（Stripe の成功の記録あり）の請求だけ", byId["S1_2026-11"].receiptAvailable === true && byId["S1_2026-10"].receiptAvailable === false && byId["S1_2026-07"].receiptAvailable === false && byId["S1_2026-09"].receiptAvailable === false && byId["S1_2026-01"].receiptAvailable === false, Object.values(byId).map((x) => x.invoiceId + ":" + x.receiptAvailable));
const TOK = readFileSync(join(REPO_ROOT, "tokushoho.html"), "utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const ISS = RC.STORE_CUSTOM_PLAN_RECEIPT_ISSUER;
t("H2 発行者の情報は特定商取引法に基づく表記と同じ（販売事業者・所在地・メールアドレス）・表示名はマチナウ",
  ISS.serviceName === "マチナウ" && TOK.includes("販売事業者 " + ISS.sellerName) && TOK.includes("所在地 " + ISS.address) && TOK.includes("メールアドレス " + ISS.email), ISS);
const PAGE = readFileSync(join(REPO_ROOT, "store-receipt.html"), "utf8");
const TERMS = readFileSync(join(REPO_ROOT, "terms.html"), "utf8");
t("H3 適格請求書の登録番号を表示しない・適格請求書ではないと明記（規約の「適格請求書は発行していません」と一致）",
  PAGE.includes("本書は適格請求書（インボイス）ではありません。") && !/登録番号|T\d{13}/.test(PAGE + JSON.stringify(ISS)) && /適格請求書（インボイス）は、現時点では発行していません/.test(TERMS));
const DEL = readFileSync(join(REPO_ROOT, "api/_lib/store-account-deletion.js"), "utf8");
t("H4 退会の後も領収書の記録は残す（退会の処理は領収書の記録に触れない・残すものに明記）", !DEL.includes("storeCustomPlanReceipts") && /残すもの：[^\n]*領収書/.test(DEL));
t("H5 領収書の処理は Stripe に支払いを作らない（POST を送っていない）・Stripe 以外へ通信しない", ST.calls.every((x) => x.startsWith("GET ")) && ST.otherHosts === 0, ST.calls);

// ===================== U. browser: link on store-account.html and store-receipt.html =====================
const fakeStoreAuth = (uid) => `(() => {
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) {
    fb = v;
    if (v && v.initializeApp && !v.__wrapped) {
      const orig = v.initializeApp.bind(v);
      v.__wrapped = true;
      v.initializeApp = function(options, name) {
        if (name === 'machinauStoreAccount') {
          const userObj = { uid: "${uid}", email: "${uid}@example.com", isAnonymous: false, emailVerified: true, providerData: [{ providerId: "password" }], getIdToken: async () => "${uid}", reload: async () => {} };
          return { name, auth: () => ({ currentUser: userObj, languageCode: "ja", onAuthStateChanged(cb) { setTimeout(() => cb(userObj), 0); return () => {}; }, signOut: async () => {} }) };
        }
        return orig(options, name);
      };
    }
  } });
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
set("S1_2025-12", inv("S1", "2025-12", "u1", paid("pi_ui1"))); pi("pi_ui1", "S1_2025-12");
const server = await serve(REPO_ROOT + "", 8881);
const browser = await launchChrome();
try {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, initScripts: [fakeStoreAuth("u1")] } });
  await p.goto("/store-account.html");
  await p.waitFor(`!document.getElementById("planPaymentSection").hidden && document.querySelectorAll("#planPayList .plan-pay-item").length > 0`, 20000); await sleep(300);
  const links = await p.ev(`[...document.querySelectorAll("#planPayList .plan-pay-receipt")].map((a) => ({ text: a.textContent, href: a.getAttribute("href") }))`);
  t("U1 店舗アカウントの請求明細：支払い済みの請求にだけ「領収書を見る」（store-receipt.html?invoice=…）", links.length > 0 && links.every((l) => l.text === "領収書を見る" && /^store-receipt\.html\?invoice=[A-Z0-9]+_\d{4}-\d{2}$/.test(l.href)) && links.some((l) => l.href.endsWith("S1_2025-12")) && !links.some((l) => /S1_2026-(10|09|08|07|01)$/.test(l.href)), links);
  await p.goto("/store-receipt.html?invoice=S1_2025-12");
  await p.waitFor(`!document.getElementById("previewPanel").hidden`, 15000);
  const pre = await p.ev(`({ summary: document.getElementById("previewSummary").textContent, placeholder: document.getElementById("addresseeInput").placeholder, receipt: !document.getElementById("receiptArea").hidden })`);
  t("U2 発行前：宛名の入力（未入力は登録店舗名）・対象月・税込100円・支払日を表示・領収書はまだ出さない", /2025年12月分・¥100（税込）・支払日 2026年12月2日/.test(pre.summary) && pre.placeholder === "改名後のそば屋" && pre.receipt === false, pre);
  await p.ev(`document.getElementById("addresseeInput").value = "株式会社 海辺"; document.getElementById("issueButton").click(); true`);
  await p.waitFor(`!document.getElementById("receiptArea").hidden`, 15000);
  const view = await p.ev(`({ text: document.getElementById("receipt").innerText, width: document.documentElement.scrollWidth, vw: window.innerWidth })`);
  t("U3 領収書（スマートフォン幅）：宛名・税込100円・但し書き・対象利用月・支払日・支払方法・請求書ID・番号・発行者マチナウ・適格請求書でない旨・横にはみ出さない",
    /株式会社 海辺 様/.test(view.text) && /¥100（税込）/.test(view.text) && /但し、マチナウ 店舗プロフィールカスタマイズプラン利用料として/.test(view.text) && /2025年12月分/.test(view.text) && /2026年12月2日/.test(view.text) &&
    /クレジットカード決済/.test(view.text) && /S1_2025-12/.test(view.text) && /MN-202512-[0-9A-F]{8}/.test(view.text) && /マチナウ/.test(view.text) && /販売事業者：上田 豊/.test(view.text) && /適格請求書（インボイス）ではありません/.test(view.text) && view.width <= view.vw, view);
  await p.ev(`document.getElementById("correctToggle").click(); document.getElementById("correctInput").value = "株式会社 海辺商店"; document.getElementById("correctButton").click(); true`);
  await p.waitFor(`/株式会社 海辺商店/.test(document.getElementById("rAddressee").textContent)`, 15000);
  const corr = await p.ev(`document.getElementById("rCorrections").innerText`);
  t("U4 宛名の訂正：新しい宛名で表示し、訂正の記録（訂正前の宛名）を領収書に残す", /宛名訂正：.*（訂正前の宛名：株式会社 海辺）/.test(corr), corr);
  await p.s("Emulation.setEmulatedMedia", { media: "print" });
  const printed = await p.ev(`({ hiddenButtons: [...document.querySelectorAll(".no-print")].every((e) => getComputedStyle(e).display === "none"), receiptShown: getComputedStyle(document.getElementById("receipt")).display !== "none", hasPrint: typeof window.print === "function" })`);
  await p.s("Emulation.setEmulatedMedia", { media: "" });
  t("U5 印刷表示：ボタン・入力・案内は印刷しない・領収書だけを印刷（ブラウザの印刷で PDF 保存）", printed.hiddenButtons && printed.receiptShown && printed.hasPrint, printed);
  await p.goto("/store-receipt.html?invoice=S1_2026-10");
  await p.waitFor(`!document.getElementById("message").hidden`, 15000);
  const refused = await p.ev(`({ msg: document.getElementById("message").textContent, receipt: !document.getElementById("receiptArea").hidden, preview: !document.getElementById("previewPanel").hidden })`);
  t("U6 未払いの請求の領収書の画面：発行できない理由を表示し、領収書も発行の入力も出さない", /まだお支払いが完了していない/.test(refused.msg) && !refused.receipt && !refused.preview, refused);
  const p2 = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, initScripts: [fakeStoreAuth("u2")] } });
  await p2.goto("/store-receipt.html?invoice=S1_2025-12");
  await p2.waitFor(`!document.getElementById("message").hidden`, 15000);
  const other = await p2.ev(`({ msg: document.getElementById("message").textContent, text: document.body.innerText })`);
  t("U7 他のアカウントで同じURLを開いても他店舗の領収書は表示されない", /表示できません/.test(other.msg) && !/海辺/.test(other.text), other.msg);
  const errs = p.log.errors.filter((e) => !/Failed to load resource|net::ERR|gstatic|favicon/i.test(e));
  t("U8 画面にスクリプトのエラーが出ない", errs.length === 0, errs.slice(0, 3));
} finally {
  browser.close(); server.close();
}

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
