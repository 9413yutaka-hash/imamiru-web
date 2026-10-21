// STEP 32-D⑤: read-only billing overview for operators. REAL api/_lib/imadake-billing-admin.js and the REAL
// moderate-submission handler on mocked firebase-admin. No network, no Stripe, no writes.
// run: node --import ./tests/mockfa-occ/register.mjs tests/imadake-billing-overview-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", "admin@example.com"), user: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let fetchCalls = 0;
globalThis.fetch = async (url) => { fetchCalls++; throw new Error("unexpected network " + url); };
const BA = await import(REPO_URL + "/api/_lib/imadake-billing-admin.js?v=" + Date.now());
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const FS = await import("firebase-admin/firestore");
const db = FS.getFirestore();
const TS = (ms) => FS.Timestamp.fromMillis(ms);
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
const NOW = Date.UTC(2027, 11, 10, 3, 0);
const H = 3600 * 1000, D = 24 * H;
const reset = () => S.docs.clear();
// STEP 42-C｜請求中の請求書は、確保の時に請求先アカウント(chargeBillingAccountUid)を記録する。店舗 X の請求先は u_X。
const inv = (storeId, month, data) => S.docs.set("imadakeMonthlyInvoices/" + storeId + "_" + month, { storeId, month, lineCount: 2, amountJpy: 200, currency: "JPY", taxIncluded: true, ...(data && data.chargeMode ? { chargeBillingAccountUid: "u_" + storeId } : {}), ...data });
const ledger = (invoiceId, n) => { for (let i = 0; i < n; i++) S.docs.set("imadakePostDailyCharges/" + invoiceId + "_l" + i, { invoiceId, status: "invoiced", amountJpy: 100 }); };
// STEP 42-C｜支払い情報はアカウント単位(accountBilling/u_X)。旧 billingLock({invoiceId,...})は請求書ごとの billingLocks に直す。
const bill = (storeId, test) => {
  const { billingLock, ...rest } = test || {};
  const next = billingLock ? { ...rest, billingLocks: { [billingLock.invoiceId || ""]: { attempt: billingLock.attempt, sinceMs: billingLock.sinceMs } } } : rest;
  S.docs.set("accountBilling/u_" + storeId, { uid: "u_" + storeId, test: next });
};
const run = (opts = {}) => BA.buildImadakeBillingOverview(db, { nowMillis: NOW, ...opts });
const reasonsOf = (r, id) => ((r.items.find((x) => x.invoiceId === id || (x.kind === "account_billing" && x.accountUid === "u_" + id)) || {}).reasons || []);
let ip = 0;
async function call(body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body: { mode: "imadakeBillingOverview", ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}

// O0 flags / empty
t("O0 課金関連3フラグは false のまま", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false);
reset();
const empty = await run();
t("O0b 請求書もロックも無い：全件確認できたので complete:true・problemFree:true（読み取り失敗とは区別）", empty.ok && empty.complete === true && empty.problemFree === true && empty.attentionCount === 0 && empty.errors.length === 0, empty);

// O1 auth
const h0 = await call({}, null), h1 = await call({}, "user"), h2 = await call({}, "admin");
t("O1 API：未ログイン401・運営以外403・運営200", h0.code === 401 && h1.code === 403 && h2.code === 200 && h2.body.success === true, [h0.code, h1.code, h2.code]);

// O2 statuses
reset();
const holding = { chargeMode: "test", chargePaymentMethodId: "pm_x", chargeLeaseUntilMs: NOW + H };
inv("a1", "2027-11", { status: "needs_review", chargeReviewReason: "outcome_unknown_not_found", ...holding });
inv("a2", "2027-11", { status: "requires_action", ...holding });
inv("a3", "2027-11", { status: "processing", ...holding });
inv("a4", "2027-11", { status: "payment_failed", lastChargeError: { code: "card_declined", declineCode: "insufficient_funds" }, chargePaymentMethodId: "pm_x" });
inv("a5", "2027-11", { status: "charge_error", chargeErrorReason: "stripe_request_rejected" });
inv("a6", "2027-11", { status: "charging", ...holding, chargeLeaseUntilMs: NOW - 1 });
inv("a7", "2027-11", { status: "charging", ...holding, chargeOutcomeUnknown: true });
inv("a8", "2027-11", { status: "closing", updatedAt: TS(NOW - 2 * D) });
inv("a9", "2027-11", { status: "closed", closedAt: TS(NOW - 4 * D) });
inv("b1", "2027-11", { status: "closed", closedAt: TS(NOW - 1 * D) });                     // fresh closed: OK
inv("b2", "2027-11", { status: "paid", paymentIntentId: "pi_ok" });                        // OK
inv("b3", "2027-11", { status: "paid" });                                                   // paid without PI
inv("b4", "2027-11", { status: "refunded_someday" });                                       // unknown status
inv("b5", "2027-11", { status: "paid", paymentIntentId: "pi_ok", amountJpy: 999 });         // amount mismatch
S.docs.set("imadakeMonthlyInvoices/wrongid", { storeId: "b6", month: "2027-11", status: "paid", paymentIntentId: "pi_ok", lineCount: 2, amountJpy: 200 });
inv("b7", "2027-11", { status: "charging", chargeMode: "test", chargeLeaseUntilMs: NOW + H });   // holding without card
inv("b8", "2027-11", { status: "closing", updatedAt: TS(NOW - 2 * H) });                   // fresh closing: OK
for (const id of ["a1", "a2", "a3", "a6", "a7", "b7"]) bill(id, { customerId: "cus_" + id, paymentMethodId: "pm_cur", billingLock: { invoiceId: id + "_2027-11", attempt: 1, sinceMs: NOW - H } });
for (const id of ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a9", "b1", "b7"]) ledger(id + "_2027-11", 2);
const w0 = S.writes.length;
const r2 = await run();
const has = (id, reason) => reasonsOf(r2, id + "_2027-11").includes(reason);
t("O2 要対応の状態（人の確認待ち・本人認証待ち・処理中・支払い失敗・請求不備）を検出", has("a1", "status_needs_review") && has("a2", "status_requires_action") && has("a3", "status_processing") && has("a4", "status_payment_failed") && has("a5", "status_charge_error"), r2.items);
t("O2b 請求中の確保期限切れ・結果不明、締め処理中の滞留、締め後の未請求滞留（3日超）を検出", has("a6", "charging_lease_expired") && has("a7", "charging_outcome_unknown") && has("a8", "closing_stale") && has("a9", "closed_uncharged"), r2.items.filter((x) => ["a6", "a7", "a8", "a9"].includes(x.storeId)));
t("O2c 未知の状態・支払いIDのない支払い済み・金額不一致（amountJpy≠件数×100）・請求書IDの不整合・使ったカード不明を検出", has("b4", "unknown_status") && has("b3", "paid_without_payment_intent") && has("b5", "amount_mismatch") && reasonsOf(r2, "wrongid").includes("invalid_invoice_id") && has("b7", "charge_card_unknown"), r2.items.filter((x) => ["b3", "b4", "b5", "b6", "b7"].includes(x.storeId)));
t("O2d 正常なもの（3日以内の締め後・正常な支払い済み・24時間以内の締め処理中・ロックが正しい請求中）は一覧に出さない", !r2.items.some((x) => ["b1_2027-11", "b2_2027-11", "b8_2027-11"].includes(x.invoiceId)) && !reasonsOf(r2, "a3_2027-11").includes("invoice_without_lock"), r2.items.map((x) => x.invoiceId || x.storeId));
t("O2e 全件を確かめたので complete:true だが、問題があるので problemFree:false", r2.complete === true && r2.problemFree === false && r2.attentionCount === r2.items.length, { complete: r2.complete, n: r2.attentionCount });
t("O2f 書き込みゼロ・外部通信ゼロ", S.writes.length === w0 && fetchCalls === 0);
const payload = JSON.stringify(r2);
t("O2g 応答にカードID・顧客ID・冪等キーなどを含めない（必要な情報だけ）", !payload.includes("pm_x") && !payload.includes("pm_cur") && !payload.includes("cus_") && !payload.includes("chargeIdempotencyKey"), payload.slice(0, 300));

// O3 ledger mismatch and lock consistency
reset();
inv("c1", "2027-11", { status: "closed", closedAt: TS(NOW - H) }); ledger("c1_2027-11", 1);            // ledger 1 vs lineCount 2
inv("c2", "2027-11", { status: "needs_review", chargeMode: "test", chargePaymentMethodId: "pm_c2", chargeLeaseUntilMs: 0 }); ledger("c2_2027-11", 2);   // no lock
bill("c3", { billingLock: { attempt: 1, sinceMs: NOW - H } });                                            // lock without invoice
bill("c4", { billingLock: { invoiceId: "c4_2027-11", attempt: 1, sinceMs: NOW - H } });                   // invoice missing
inv("c5", "2027-11", { status: "paid", paymentIntentId: "pi_ok", chargePaymentMethodId: "pm_c5" });
bill("c5", { billingLock: { invoiceId: "c5_2027-11", attempt: 1, sinceMs: NOW - H } });                   // lock on a paid invoice
inv("c6", "2027-11", { status: "charging", chargeMode: "test", chargeLeaseUntilMs: NOW + H }); ledger("c6_2027-11", 2);
bill("c6", { billingLock: { invoiceId: "c6_2027-11", attempt: 1, sinceMs: NOW - H } });                   // locked invoice without card
inv("c7", "2027-11", { status: "requires_action", chargeMode: "test", chargePaymentMethodId: "pm_c7", chargeLeaseUntilMs: 0 }); ledger("c7_2027-11", 2);
bill("c7", { billingLock: { invoiceId: "c7_2027-11", attempt: 1, sinceMs: NOW - 30 * H } });              // stale lock (30h)
bill("c8", { billingLock: { invoiceId: "c9_2027-11", attempt: 1, sinceMs: NOW - H } });
inv("c9", "2027-11", { status: "charging", chargeMode: "test", chargePaymentMethodId: "pm_c9", chargeLeaseUntilMs: NOW + H }); ledger("c9_2027-11", 2);  // lock of another store
const r3 = await run();
t("O3 日別台帳の件数（1）と請求書の件数（2）の不一致を検出", reasonsOf(r3, "c1_2027-11").includes("ledger_count_mismatch") && r3.items.find((x) => x.invoiceId === "c1_2027-11").ledgerLineCount === 1, r3.items.find((x) => x.invoiceId === "c1_2027-11"));
t("O3b ロックを持つべき請求書にロックが無い（invoice_without_lock）", reasonsOf(r3, "c2_2027-11").includes("invoice_without_lock"));
const lockReasons = (storeId) => ((r3.items.find((x) => x.kind === "account_billing" && x.accountUid === "u_" + storeId) || {}).reasons || []);
t("O3c ロックの食い違い：請求書IDなし・請求書が存在しない・支払い済みの請求書を指す・使ったカード不明・他店の請求書を指す", lockReasons("c3").includes("lock_without_invoice") && lockReasons("c4").includes("lock_invoice_missing") && lockReasons("c5").includes("lock_invoice_not_holding") && lockReasons("c6").includes("lock_invoice_without_card") && lockReasons("c8").includes("lock_invoice_other_account"), r3.items.filter((x) => x.kind === "account_billing"));
t("O3d 請求中ロックの長期滞留（24時間超）を検出し、経過時間を返す", lockReasons("c7").includes("lock_stale") && r3.items.find((x) => x.kind === "account_billing" && x.accountUid === "u_c7").lockHours === 30);

// O4 read failures are never "no problems"
reset();
globalThis.__QUERY_FAIL = "imadakeMonthlyInvoices";
const r4 = await run();
globalThis.__QUERY_FAIL = null;
t("O4 請求書の読み取りに失敗：complete:false・problemFree:false・エラーを返す（0件でも問題なしにしない）", r4.ok && r4.complete === false && r4.problemFree === false && r4.errors.some((e) => e.scope === "invoices" && e.reason === "read_failed"), r4);
globalThis.__QUERY_FAIL = "accountBilling";
const r4b = await run();
globalThis.__QUERY_FAIL = null;
t("O4b 支払い情報の読み取りに失敗：complete:false・problemFree:false", r4b.complete === false && r4b.problemFree === false && r4b.errors.some((e) => e.scope === "accountBilling"), r4b.errors);
inv("d1", "2027-11", { status: "closed", closedAt: TS(NOW - H) });
globalThis.__QUERY_FAIL = "imadakePostDailyCharges";
const r4c = await run();
globalThis.__QUERY_FAIL = null;
t("O4c 台帳の件数照合に失敗：その請求書を要確認にし、complete:false", reasonsOf(r4c, "d1_2027-11").includes("ledger_count_unavailable") && r4c.complete === false && r4c.problemFree === false, r4c.items);
const bad = await run({ invoiceCursor: "../etc" });
t("O4d 不正な続きの位置（cursor）は拒否", bad.ok === false && bad.reason === "invalid_cursor");

// O5 pagination and limits
reset();
for (let i = 0; i < 1100; i++) inv("p" + String(i).padStart(4, "0"), "2027-10", { status: "paid", paymentIntentId: "pi_ok" });
inv("p1099", "2027-10", { status: "mystery" });
const p1 = await run();
t("O5 1回の読み取りは上限（請求書1,000件）まで：complete:false・続きの位置を返す・問題なしにしない", p1.scanned.invoices === 1000 && p1.complete === false && p1.problemFree === false && p1.next.invoiceCursor !== "", { scanned: p1.scanned, next: p1.next });
const p2 = await run({ invoiceCursor: p1.next.invoiceCursor });
t("O5b 続きの位置から残り100件を読み、末尾の未知の状態を検出・読み終えたら complete:true", p2.scanned.invoices === 100 && p2.complete === true && p2.next.invoiceCursor === "" && reasonsOf(p2, "p1099_2027-10").includes("unknown_status"), { scanned: p2.scanned, complete: p2.complete, items: p2.items });
reset();
for (let i = 0; i < 60; i++) { inv("q" + String(i).padStart(3, "0"), "2027-10", { status: "closed", closedAt: TS(NOW - H) }); ledger("q" + String(i).padStart(3, "0") + "_2027-10", 2); }
const p3 = await run();
t("O5c 台帳の件数照合は1回50件まで：照合していない請求書の手前で止め、続きの位置をそこにする（complete:false・問題なしにしない）", p3.scanned.ledgerCounts === 50 && p3.scanned.ledgerSkipped === 1 && p3.complete === false && p3.problemFree === false && p3.next.invoiceCursor === "q049_2027-10", { scanned: p3.scanned, next: p3.next });
const p3b = await run({ invoiceCursor: p3.next.invoiceCursor });
t("O5c2 続きから残り10件を照合して complete:true・problemFree:true（照合を読み飛ばさない）", p3b.scanned.ledgerCounts === 10 && p3b.complete === true && p3b.problemFree === true, { scanned: p3b.scanned, complete: p3b.complete });
// linked-read limit on locks (accountBilling side)
reset();
for (let i = 0; i < 210; i++) bill("L" + String(i).padStart(3, "0"), { billingLock: { invoiceId: "missing" + i + "_2027-10", attempt: 1, sinceMs: NOW - H } });
const p6 = await run();
t("O5f ロックが指す請求書の個別読み取りは1回200件まで：その手前で止め、続きの位置を返す", p6.scanned.linkedReads === 200 && p6.complete === false && p6.next.billingCursor === "u_L199" && p6.items.filter((x) => x.kind === "account_billing").length === 200, { scanned: p6.scanned, next: p6.next });
const p6b = await run({ billingCursor: p6.next.billingCursor });
t("O5g 続きから残り10件を確認して complete:true（10件とも lock_invoice_missing で要確認）", p6b.complete === true && p6b.items.filter((x) => x.kind === "account_billing" && x.reasons.includes("lock_invoice_missing")).length === 10, { scanned: p6b.scanned, n: p6b.items.length });
reset();
for (let i = 0; i < 700; i++) bill("s" + String(i).padStart(4, "0"), { customerId: "cus_x" });
const p4 = await run();
t("O5d 支払い情報も1回600件まで：complete:false・続きの位置を返す", p4.scanned.accountBilling === 600 && p4.complete === false && p4.next.billingCursor !== "", p4.scanned);
const p5 = await run({ billingCursor: p4.next.billingCursor });
t("O5e 続きを読み終えると complete:true・problemFree:true", p5.scanned.accountBilling === 100 && p5.complete === true && p5.problemFree === true, p5.scanned);

// O7 chaining with done flags: no part is re-read from the start
reset();
for (let i = 0; i < 1050; i++) inv("r" + String(i).padStart(4, "0"), "2027-10", { status: "paid", paymentIntentId: "pi_ok" });
for (let i = 0; i < 650; i++) bill("t" + String(i).padStart(4, "0"), { customerId: "cus_x" });
inv("r0005", "2027-10", { status: "needs_review", chargeMode: "test", chargePaymentMethodId: "pm_z", chargeLeaseUntilMs: 0 });
const chain = []; let req = {};
for (let i = 0; i < 10; i++) { const r = await run(req); chain.push(r); if (r.next.invoicesDone && r.next.billingDone) break; req = { invoiceCursor: r.next.invoiceCursor, billingCursor: r.next.billingCursor, invoicesDone: r.next.invoicesDone, billingDone: r.next.billingDone }; }
const totInv = chain.reduce((s, r) => s + r.scanned.invoices, 0), totBill = chain.reduce((s, r) => s + r.scanned.accountBilling, 0);
const keys = chain.flatMap((r) => r.items.map((x) => (x.invoiceId || x.storeId) + ":" + x.kind));
t("O7 続きの位置と読み終え印（invoicesDone/billingDone）で、請求書1,050件・支払い情報650件をちょうど1回ずつ読み、要確認を重複なく返す", totInv === 1050 && totBill === 650 && new Set(keys).size === keys.length && keys.includes("r0005_2027-10:invoice") && chain[chain.length - 1].next.invoicesDone && chain[chain.length - 1].next.billingDone, { totInv, totBill, calls: chain.length, keys: keys.length });

// O8 the items cap stops the scan instead of dropping items
reset();
for (let i = 0; i < 620; i++) inv("u" + String(i).padStart(4, "0"), "2027-10", { status: "paid" });   // paid without PI -> attention
const c1 = await run();
const c2 = await run({ invoiceCursor: c1.next.invoiceCursor, billingCursor: c1.next.billingCursor, invoicesDone: c1.next.invoicesDone, billingDone: c1.next.billingDone });
const got = new Set([...c1.items, ...c2.items].map((x) => x.invoiceId));
t("O8 要確認が500件に達したらそこで止め、続きの位置を返す（上限を超えた分も次の呼び出しで返し、取りこぼさない）", c1.items.length === 500 && c1.complete === false && c1.truncated === false && got.size === 620 && c2.next.invoicesDone === true && c1.scanned.invoices === 500 && c1.scanned.invoiceDocsRead === 620 && c1.scanned.invoices + c2.scanned.invoices === 620, { c1: c1.items.length, c2: c2.items.length, got: got.size });

t("O6 全体を通して書き込みゼロ・外部通信ゼロ", S.writes.length === 0 && fetchCalls === 0, { writes: S.writes.length, fetchCalls });
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
