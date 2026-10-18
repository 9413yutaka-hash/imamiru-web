// STEP 32-D⑧: read-only Stripe reconciliation of one monthly invoice. REAL api/_lib/imadake-billing-admin.js and the REAL
// moderate-submission handler on mocked firebase-admin, in-memory Stripe stub (records every call's method). No network.
// run: node --import ./tests/mockfa-occ/register.mjs tests/imadake-billing-inspect-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const ENV = { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview" };
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", "admin@example.com"), user: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let globalFetch = 0;
globalThis.fetch = async (url) => { globalFetch++; throw new Error("unexpected network " + url); };

// ---- Stripe stub (GET only expected) ----
const ST = { pis: new Map(), calls: [], retrieveFail: new Set(), listFail: false, forbidden: false };
const NOW = Date.now(), NOWS = Math.floor(NOW / 1000);
const stripe = async (url, opts = {}) => {
  const u = new URL(String(url)); ST.calls.push({ method: opts.method, path: u.pathname, body: opts.body || null, idem: (opts.headers || {})["Idempotency-Key"] || null });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + FAKE_SERVER_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (ST.forbidden) return json(403, { error: { type: "invalid_request_error", code: "permission_denied" } });
  if (opts.method !== "GET") return json(400, { error: { type: "invalid_request_error", code: "unexpected_method" } });
  const m = u.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
  if (m) { if (ST.retrieveFail.has(m[1])) return json(500, { error: { type: "api_error" } }); const pi = ST.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error", code: "resource_missing" } }); }
  if (u.pathname === "/v1/payment_intents") {
    if (ST.listFail) return json(500, { error: { type: "api_error" } });
    const customer = u.searchParams.get("customer"), gte = Number(u.searchParams.get("created[gte]") || 0), limit = Number(u.searchParams.get("limit") || 10), after = u.searchParams.get("starting_after");
    let rows = [...ST.pis.values()].filter((p) => p.customer === customer && p.created >= gte).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (after) rows = rows.filter((p) => p.id > after);
    return json(200, { object: "list", data: rows.slice(0, limit), has_more: rows.length > limit });
  }
  return json(404, { error: {} });
};
const pi = (id, over = {}) => { const base = { id, object: "payment_intent", amount: 500, amount_received: 500, currency: "jpy", customer: "cus_a", payment_method: "pm_a", status: "succeeded", livemode: false, created: NOWS - 3600,
  metadata: { invoiceId: "sa_2027-11", storeId: "sa", month: "2027-11", chargeAttempt: "1", machinauMode: "test" },
  client_secret: id + "_secret_SHOULD_NOT_LEAK", billing_details: { name: "Taro Yamada", email: "taro@example.com", address: { line1: "1-2-3" } }, receipt_email: "taro@example.com",
  payment_method_details: { card: { fingerprint: "FPSECRET", last4: "4242" } }, last_payment_error: null };
  const p = { ...base, ...over, metadata: { ...base.metadata, ...(over.metadata || {}) } }; ST.pis.set(id, p); return p; };

const BA = await import(REPO_URL + "/api/_lib/imadake-billing-admin.js?v=" + Date.now());
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const FS = await import("firebase-admin/firestore");
const db = FS.getFirestore();
const deps = { fetch: stripe, env: ENV };
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
const reset = () => { S.docs.clear(); ST.pis.clear(); ST.retrieveFail.clear(); ST.listFail = false; ST.forbidden = false; };
const inv = (data = {}) => { const d = { storeId: "sa", month: "2027-11", status: "paid", lineCount: 5, amountJpy: 500, currency: "JPY", taxIncluded: true, createdAt: FS.Timestamp.fromMillis(NOW - 2 * 86400000), chargeMode: "test", chargeAttempt: 1, chargeCustomerId: "cus_a", chargePaymentMethodId: "pm_a", chargeIdempotencyKey: "machinau-invoice-test-sa_2027-11-1", paymentIntentId: "pi_1", chargeHistory: [{ attempt: 1, paymentIntentId: "pi_1" }], ...data }; S.docs.set("imadakeMonthlyInvoices/sa_2027-11", d); S.docs.set("storeBilling/sa", { test: { customerId: "cus_a", paymentMethodId: "pm_a" } }); return d; };
const run = (id = "sa_2027-11", d = deps) => BA.inspectImadakeInvoice(db, d, id, NOW);
const codes = (r) => r.findings.map((f) => f.code);
let ip = 0;
async function call(body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body: { mode: "imadakeBillingInspect", ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}

t("I0 課金関連3フラグは false のまま", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false);

// I1 verified
reset(); inv(); pi("pi_1");
let r = await run();
t("I1 正常一致：支払い済み・成功1件・全項目一致 → verified・complete", r.ok && r.verdict === "verified" && r.complete === true && r.paymentIntents.length === 1 && r.paymentIntents[0].mismatches.length === 0 && r.paymentIntents[0].sources.includes("id") && r.paymentIntents[0].sources.includes("list"), r);
const out = JSON.stringify(r);
t("I1b 応答に client_secret・請求先情報・カード詳細・顧客ID・カードID・冪等キーを含めない", !/_secret_|Taro|taro@example|1-2-3|FPSECRET|payment_method_details|cus_a|pm_a|machinau-invoice-test/.test(out), out.slice(0, 400));

// I2 duplicate
reset(); inv(); pi("pi_1"); pi("pi_2", { created: NOWS - 1800 });
r = await run();
t("I2 同じ請求書に成功した支払いが2件 → 二重請求の疑い（重大）・受取額超過・記録外の支払い", r.verdict === "mismatch" && codes(r).includes("duplicate_charge_suspected") && codes(r).includes("received_exceeds_invoice") && codes(r).includes("unrecorded_payment_intent") && r.findings.find((f) => f.code === "duplicate_charge_suspected").severity === "severe", r.findings);
reset(); inv({ status: "charging", paymentIntentId: "", chargeHistory: [] }); pi("pi_p1", { status: "processing", amount_received: 0 }); pi("pi_p2", { status: "succeeded" });
r = await run();
t("I2b 処理中＋成功の2件でも二重請求の疑い", codes(r).includes("duplicate_charge_suspected") && r.verdict === "mismatch", r.findings);

// I3-I6 field mismatches
reset(); inv(); pi("pi_1", { amount: 999, amount_received: 999 });
r = await run();
t("I3 金額不一致 → payment_intent_mismatch（amount）", r.verdict === "mismatch" && r.paymentIntents[0].mismatches.includes("amount"), r.paymentIntents[0]);
reset(); inv(); pi("pi_1", { customer: "cus_other" });
r = await run();
t("I4 顧客不一致（IDで照会した支払いが別の顧客）→ customer", r.verdict === "mismatch" && r.paymentIntents[0].mismatches.includes("customer"), r.paymentIntents[0]);
reset(); inv(); pi("pi_1", { payment_method: "pm_other" });
r = await run();
t("I5 今の試行のカード不一致 → payment_method", r.verdict === "mismatch" && r.paymentIntents[0].mismatches.includes("payment_method"), r.paymentIntents[0]);
reset(); inv({ chargeAttempt: 2, chargeHistory: [{ attempt: 1, paymentIntentId: "pi_old" }, { attempt: 2, paymentIntentId: "pi_1" }] }); pi("pi_1", { metadata: { chargeAttempt: "2" } }); pi("pi_old", { payment_method: "pm_prev", status: "requires_payment_method", amount_received: 0 });
r = await run();
t("I5b 前の試行の支払いは別のカードでもカード不一致にしない（今の試行だけ照合）", r.verdict === "verified" && r.paymentIntents.every((p) => !p.mismatches.includes("payment_method")), r);
reset(); inv(); pi("pi_1", { metadata: { month: "2027-10" } });
r = await run();
t("I6 metadata不一致（対象月）→ metadata_month", r.verdict === "mismatch" && r.paymentIntents[0].mismatches.includes("metadata_month"), r.paymentIntents[0]);
reset(); inv(); pi("pi_1", { metadata: { chargeAttempt: "7" } });
r = await run();
t("I6b 試行番号が記録より大きい → attempt", r.paymentIntents[0].mismatches.includes("attempt"), r.paymentIntents[0]);

// I7 mode mismatch
reset(); inv({ chargeMode: "live" }); pi("pi_1");
const calls7 = ST.calls.length; r = await run();
t("I7 請求書のモード（live）と設定（test）が違う → mode_mismatch・Stripeに接続しない", r.verdict === "mode_mismatch" && ST.calls.length === calls7, r);
reset(); inv(); pi("pi_1", { livemode: true });
r = await run();
t("I7b Stripeの応答が本番（livemode:true）→ mode_mismatch", r.verdict === "mode_mismatch" && r.paymentIntents[0].mismatches.includes("livemode"), r.paymentIntents[0]);

// I8 404
reset(); inv({ paymentIntentId: "pi_missing", chargeHistory: [{ attempt: 1, paymentIntentId: "pi_missing" }] });
r = await run();
t("I8 記録した支払いIDがStripeで見つからない（404）→ 重大", r.verdict === "mismatch" && codes(r).includes("recorded_payment_intent_not_found"), r.findings);

// I9 zero found
reset(); inv({ status: "needs_review", paymentIntentId: "", chargeHistory: [] });
r = await run();
t("I9 0件：not_found_in_range（範囲内で見つからない）・complete・「未請求」「安全」とは返さない", r.verdict === "not_found_in_range" && r.complete === true && codes(r).includes("not_found_in_range") && !/unbilled|safe|未請求|安全/.test(JSON.stringify({ v: r.verdict, f: r.findings })), r);

// I10 API failure
reset(); inv(); pi("pi_1"); ST.retrieveFail.add("pi_1");
r = await run();
t("I10 IDでの照会が失敗（500）→ incomplete（照合未完了）", r.complete === false && codes(r).includes("retrieve_failed") && r.verdict === "incomplete", r);
reset(); inv(); pi("pi_1"); ST.listFail = true;
r = await run();
t("I10b 一覧の取得が失敗 → incomplete（IDの照会で一致していても完了にしない）", r.complete === false && codes(r).includes("list_failed") && r.verdict === "incomplete" && r.stripe.listComplete === false, r);
reset(); inv(); ST.forbidden = true;
r = await run();
t("I10c 権限不足（403、PaymentIntents:Read なし）→ incomplete。照会できなかったことを根拠に「支払い未確認」「見つからない」とは判定しない", r.complete === false && r.verdict === "incomplete" && !codes(r).includes("paid_not_confirmed") && !codes(r).includes("not_found_in_range"), r.findings);

// I11 page limit
reset(); inv({ status: "needs_review", paymentIntentId: "", chargeHistory: [] });
for (let i = 0; i < 1050; i++) pi("pi_x" + String(i).padStart(4, "0"), { metadata: { invoiceId: "other_2027-10" } });
r = await run();
t("I11 一覧が上限（10ページ・1,000件）を超える → list_page_limit・incomplete（見つからなくても断定しない）", r.complete === false && codes(r).includes("list_page_limit") && r.stripe.listPagesRead === 10 && r.verdict === "incomplete", { f: r.findings, s: r.stripe });

// I12 state rules
reset(); inv({ status: "closed", paymentIntentId: "", chargeHistory: [] }); pi("pi_s");
r = await run();
t("I12 締め後（未請求扱い）なのに支払いがある → 重大（もう一度請求すると二重請求）", r.verdict === "mismatch" && codes(r).includes("payment_exists_for_unbilled_invoice"), r.findings);
reset(); inv({ status: "payment_failed" }); pi("pi_1", { status: "succeeded" });
r = await run();
t("I12b 支払い失敗扱いなのにStripeでは成功 → 重大", codes(r).includes("succeeded_but_marked_failed") && r.verdict === "mismatch", r.findings);
reset(); inv({ status: "needs_review", paymentIntentId: "", chargeHistory: [] }); pi("pi_n");
r = await run();
t("I12c 人の確認待ちでStripeに成功がある → 要確認（状態は変えない）", r.verdict === "attention" && codes(r).includes("stripe_has_active_payment") && S.docs.get("imadakeMonthlyInvoices/sa_2027-11").status === "needs_review", r.findings);
reset(); inv({ status: "paid" }); pi("pi_1", { status: "requires_payment_method", amount_received: 0 });
r = await run();
t("I12d 支払い済み扱いなのにStripeで成功していない → 重大", codes(r).includes("paid_not_confirmed") && r.verdict === "mismatch", r.findings);

// I13 unlinked candidate
reset(); inv(); pi("pi_1"); pi("pi_manual", { metadata: { invoiceId: undefined, storeId: undefined, month: undefined, chargeAttempt: undefined, machinauMode: undefined } });
ST.pis.get("pi_manual").metadata = {};
r = await run();
t("I13 請求書IDの無い同額の成功した支払い → 参考情報（possible_unlinked_payment、断定しない）", codes(r).includes("possible_unlinked_payment") && r.unlinkedCandidates.length === 1 && r.verdict === "verified", { f: r.findings, v: r.verdict });

// I14 stripe unavailable (production) and invoice not found
reset(); inv(); pi("pi_1");
const c14 = ST.calls.length;
r = await run("sa_2027-11", { ...deps, env: { ...ENV, VERCEL_ENV: "production" } });
t("I14 Productionなど Stripe設定が無効 → incomplete（stripe_unavailable_disabled_in_production）・Stripeに接続しない", r.verdict === "incomplete" && codes(r).includes("stripe_unavailable_disabled_in_production") && ST.calls.length === c14, r.findings);
r = await run("zz_2027-11");
t("I14b 請求書が存在しない → invoice_not_found（読み取り失敗とは区別）", r.ok && r.invoiceFound === false && r.verdict === "invoice_not_found");

// I15 handler auth / validation
reset(); inv(); pi("pi_1");
const h0 = await call({ invoiceId: "sa_2027-11" }, null), h1 = await call({ invoiceId: "sa_2027-11" }, "user"), h2 = await call({ invoiceId: "../x" }, "admin"), h3 = await call({ invoiceId: "sa_2027-11" }, "admin");
t("I15 API：未ログイン401・運営以外403・不正な請求書ID 400・運営は200（本番の process.env はテストキーなし→incomplete）", h0.code === 401 && h1.code === 403 && h2.code === 400 && h3.code === 200 && h3.body.success === true && h3.body.verdict === "incomplete", [h0.code, h1.code, h2.code, h3.code, h3.body && h3.body.verdict]);
globalThis.__QUERY_FAIL = null;

// I16 invariants
t("I16 Stripeへの呼び出しはすべて GET・本文なし・冪等キーなし", ST.calls.length > 0 && ST.calls.every((c) => c.method === "GET" && !c.body && !c.idem), [...new Set(ST.calls.map((c) => c.method))]);
t("I16b Firestoreへの書き込みゼロ・グローバルfetch（外部通信）ゼロ", S.writes.length === 0 && globalFetch === 0, { writes: S.writes.length, globalFetch });

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
