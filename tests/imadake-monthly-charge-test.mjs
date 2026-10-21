// STEP 32-C: monthly charge of closed invoices (Stripe PaymentIntent off_session). REAL api/_lib/imadake-monthly-charge.js
// and REAL moderate-submission handler on mocked firebase-admin (optimistic-concurrency transactions) and an in-memory
// Stripe stub that replays idempotent responses (incl. 500) like Stripe API v1. No network, no real Stripe. Fake keys.
// run: node --import ./tests/mockfa-occ/register.mjs tests/imadake-monthly-charge-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const ENV = { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview" };
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", "admin@example.com"), user: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const realNow = Date.now; let offset = 0; Date.now = () => realNow() + offset;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Stripe stub ----
const ST = { pis: new Map(), idem: new Map(), calls: [], creates: 0, modes: [], hold: null, seq: 0, listFail: 0, retrieveFail: 0 };
let globalFetchCalls = 0;
globalThis.fetch = async (url) => { globalFetchCalls++; throw new Error("unexpected global fetch " + url); };
const stripeFetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") throw new Error("unexpected host");
  ST.calls.push(opts.method + " " + u.pathname);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + FAKE_SERVER_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/payment_intents") {
    const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
    const key = (opts.headers || {})["Idempotency-Key"] || "";
    if (key && ST.idem.has(key)) {
      const c = ST.idem.get(key);
      if (c.body !== opts.body) return json(400, { error: { type: "idempotency_error", code: "idempotency_key_in_use" } });
      return json(c.status, c.data);
    }
    if (ST.hold) { const h = ST.hold; ST.hold = null; h.reached(); await h.release; }
    const mode = ST.modes.shift() || "succeed";
    const mkPi = (status, lastError) => {
      const id = "pi_test" + ++ST.seq;
      const pi = { id, object: "payment_intent", amount: Number(form.amount), currency: form.currency, customer: form.customer, payment_method: form.payment_method, status, created: Math.floor(Date.now() / 1000), metadata: { invoiceId: form["metadata[invoiceId]"], storeId: form["metadata[storeId]"], month: form["metadata[month]"], chargeAttempt: form["metadata[chargeAttempt]"], machinauMode: form["metadata[machinauMode]"] }, last_payment_error: lastError || null, form };
      ST.pis.set(id, pi); ST.creates++; return pi;
    };
    const cache = (status, data) => { if (key) ST.idem.set(key, { status, data, body: opts.body }); return json(status, data); };
    if (mode === "succeed") return cache(200, mkPi("succeeded"));
    if (mode === "processing") return cache(200, mkPi("processing"));
    if (mode === "decline") { const pi = mkPi("requires_payment_method", { type: "card_error", code: "card_declined", decline_code: "insufficient_funds" }); return cache(402, { error: { type: "card_error", code: "card_declined", decline_code: "insufficient_funds", payment_intent: pi } }); }
    if (mode === "auth_required") { const pi = mkPi("requires_payment_method", { type: "card_error", code: "authentication_required", decline_code: "authentication_required" }); return cache(402, { error: { type: "card_error", code: "authentication_required", decline_code: "authentication_required", payment_intent: pi } }); }
    if (mode === "network_after_create") { const pi = mkPi("succeeded"); ST.idem.set(key, { status: 200, data: pi, body: opts.body }); throw new Error("socket hang up"); }
    if (mode === "network_before_create") throw new Error("ETIMEDOUT");
    if (mode === "500_cached") return cache(500, { error: { type: "api_error" } });
    if (mode === "500_after_create") { mkPi("succeeded"); return cache(500, { error: { type: "api_error" } }); }
    if (mode === "429") return json(429, { error: { type: "rate_limit_error" } });
    if (mode === "403") return json(403, { error: { type: "invalid_request_error", code: "permission_denied" } });
    if (mode === "400") return json(400, { error: { type: "invalid_request_error", code: "parameter_invalid" } });
    throw new Error("bad mode " + mode);
  }
  let m = u.pathname.match(/^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)$/);
  if (opts.method === "GET" && m && ST.retrieveFail > 0) { ST.retrieveFail--; throw new Error("socket hang up"); }
  if (opts.method === "GET" && m) { const pi = ST.pis.get(m[1]); return pi ? json(200, pi) : json(404, { error: { type: "invalid_request_error", code: "resource_missing" } }); }
  if (opts.method === "GET" && u.pathname === "/v1/payment_intents") {
    if (ST.listFail > 0) { ST.listFail--; throw new Error("ETIMEDOUT"); }
    const customer = u.searchParams.get("customer"), gte = Number(u.searchParams.get("created[gte]"));
    return json(200, { object: "list", data: [...ST.pis.values()].filter((p) => p.customer === customer && p.created >= gte), has_more: false });
  }
  return json(404, { error: { type: "invalid_request_error" } });
};

const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js?v=" + Date.now());
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const db = (await import("firebase-admin/firestore")).getFirestore();
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
const deps = { fetch: stripeFetch, env: ENV };
const GATES = { chargeEnabled: true, billingStarted: true };
const run = (month, extra = {}) => CH.runImadakeMonthlyCharge(db, deps, { month, dryRun: false, gates: GATES, ...extra });
const inv = (id) => S.docs.get("imadakeMonthlyInvoices/" + id);
// STEP 42-C｜カードはアカウント単位(accountBilling/{uid})。店舗 sN の請求先は owner の u_sN(共有の試験は uid を指定)。
const acctOf = (storeId) => { const m = [...S.docs.entries()].find(([k, v]) => k.startsWith("storeMembers/" + storeId + "_") && v.role === "owner" && v.status === "active"); return m ? m[1].uid : "u_" + storeId; };
const bill = (storeId) => (S.docs.get("accountBilling/" + acctOf(storeId)) || {}).test || {};
// 旧 billingLock と同じ形({ invoiceId, ... })で、請求書ごとのロックの最初の1件を返す(無ければ undefined)。
const lockOf = (storeId, invoiceId) => { const l = bill(storeId).billingLocks || {}; const k = invoiceId || Object.keys(l)[0]; return k && l[k] ? { invoiceId: k, ...l[k] } : undefined; };
const setup = (storeId, month, { lineCount = 5, pm = "pm_" + storeId + "a", status = "closed", extraBilling = {}, extraInvoice = {}, uid = "u_" + storeId, customerKey = storeId } = {}) => {
  S.docs.set("storeMembers/" + storeId + "_" + uid, { storeId, uid, role: "owner", status: "active" });
  S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + customerKey, paymentMethodId: pm, card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }, cardVersion: 2, ...extraBilling } });
  S.docs.set("imadakeMonthlyInvoices/" + storeId + "_" + month, { storeId, month, status, lineCount, amountJpy: lineCount * 100, currency: "JPY", taxIncluded: true, ...extraInvoice });
  return storeId + "_" + month;
};
const createsFor = (invoiceId) => [...ST.pis.values()].filter((p) => p.metadata.invoiceId === invoiceId);
let ip = 0;
async function call(body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body: { mode: "imadakeMonthlyCharge", ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}

// C1 flags and dry-run
t("C1 実行の許可は無効のまま（IMADAKE_MONTHLY_CHARGE_ENABLED=false・課金開始false・締めの書き込みもfalse）", CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false && IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && JSON.stringify(CH.readImadakeMonthlyChargeGates()) === JSON.stringify({ chargeEnabled: false, billingStarted: false }));
const i1 = setup("s1", "2027-11");
setup("s2", "2027-11", { pm: "" });
setup("s3", "2027-11", { status: "closing" });
const w0 = S.writes.length;
const dry = await CH.runImadakeMonthlyCharge(db, deps, { month: "2027-11" });
const pl = (id) => dry.invoices.find((x) => x.invoiceId === id);
t("C1b 試算：店1は請求予定500円、カード未登録の店2は対象外（no_payment_method）、締め処理中の店3は対象外（not_closed）、書き込み・Stripe通信ゼロ", dry.ok && dry.dryRun && pl(i1).plan === "charge" && pl(i1).amountJpy === 500 && pl("s2_2027-11").plan === "skip" && pl("s2_2027-11").planReason === "no_payment_method" && pl("s3_2027-11").planReason === "not_closed" && dry.totals.plannedChargeAmountJpy === 500 && S.writes.length === w0 && ST.calls.length === 0, dry);
const h0 = await call({ month: "2027-11" }, null), h1 = await call({ month: "2027-11" }, "user"), h2 = await call({ month: "2027-11" }, "admin"), h3 = await call({ month: "2027-11", dryRun: false }, "admin");
t("C1c API：未ログイン401・運営以外403・運営の試算200・請求の実行は403（charge_disabled）・Stripe通信ゼロ", h0.code === 401 && h1.code === 403 && h2.code === 200 && h2.body.dryRun === true && h3.code === 403 && h3.body.reason === "charge_disabled" && ST.calls.length === 0 && globalFetchCalls === 0, [h0.code, h1.code, h2.code, h3.code, h3.body]);
const noGate = await CH.runImadakeMonthlyCharge(db, deps, { month: "2027-11", dryRun: false, gates: { chargeEnabled: true, billingStarted: false } });
const prodEnv = await CH.runImadakeMonthlyCharge(db, { ...deps, env: { ...ENV, VERCEL_ENV: "production" } }, { month: "2027-11", dryRun: false, gates: GATES });
t("C1d 課金開始フラグがfalseなら実行不可・Productionでは実行不可（Stripe設定が無効）", noGate.ok === false && noGate.reason === "charge_disabled" && prodEnv.ok === false && prodEnv.reason === "stripe_unavailable" && ST.calls.length === 0, [noGate, prodEnv]);

// C2 success
const r2 = await run("2027-11");
const pi2 = createsFor(i1)[0];
t("C2 請求成功：PaymentIntent（500円・jpy・顧客・登録カード・off_session・confirm・カードのみ）を1件作り paid に、請求書のロックを外す", inv(i1).status === "paid" && inv(i1).paymentIntentId === pi2.id && pi2.amount === 500 && pi2.currency === "jpy" && pi2.customer === "cus_s1" && pi2.payment_method === "pm_s1a" && pi2.form.off_session === "true" && pi2.form.confirm === "true" && pi2.form["allowed_payment_method_types[]"] === "card" && !("payment_method_types[]" in pi2.form) && !lockOf("s1") && ST.creates === 1, { inv: inv(i1), pi2 });
t("C2b 冪等キーは machinau-invoice-test-{請求書ID}-1、metadataに請求書ID・試行番号", inv(i1).chargeIdempotencyKey === "machinau-invoice-test-" + i1 + "-1" && pi2.metadata.invoiceId === i1 && pi2.metadata.chargeAttempt === "1" && pi2.metadata.machinauMode === "test", inv(i1));
const before3 = ST.calls.length;
await run("2027-11");
t("C3 再実行：支払い済み（paid）の請求書には何も送らない", ST.calls.length === before3 && ST.creates === 1 && inv(i1).status === "paid");
t("C3b カード未登録・締め処理中の請求書は実行時も請求しない", inv("s2_2027-11").status === "closed" && inv("s3_2027-11").status === "closing" && createsFor("s2_2027-11").length === 0);

// C4 decline
const i4 = setup("s4", "2027-12"); ST.modes.push("decline");
await run("2027-12");
t("C4 カード拒否（402）：payment_failed・拒否理由とPaymentIntent IDを記録・請求書のロックを外す・自動の再請求なし", inv(i4).status === "payment_failed" && inv(i4).lastChargeError.declineCode === "insufficient_funds" && inv(i4).paymentIntentId.startsWith("pi_") && !lockOf("s4"), inv(i4));
const c4 = ST.creates; await run("2027-12");
t("C4b 再実行しても拒否済みの請求書へ自動では送り直さない", ST.creates === c4 && inv(i4).status === "payment_failed");

// C5 3DS required
const i5 = setup("s5", "2028-01"); ST.modes.push("auth_required");
await run("2028-01");
t("C5 本人認証が必要（authentication_required）：requires_action・請求書のロックは残す（旧カードの取り外しを止めたまま）", inv(i5).status === "requires_action" && lockOf("s5") && lockOf("s5").invoiceId === i5, { inv: inv(i5), lock: lockOf("s5") });

// C6 processing -> later succeeded via reconcile
const i6 = setup("s6", "2028-02"); ST.modes.push("processing");
await run("2028-02");
t("C6 処理中（processing）：状態を記録し請求書のロックを残す", inv(i6).status === "processing" && !!lockOf("s6"));
ST.pis.get(inv(i6).paymentIntentId).status = "succeeded";
const c6 = ST.creates; await run("2028-02");
t("C6b 再実行でPaymentIntentを照会し、成功を確認して paid に（新しい支払いは作らない）", inv(i6).status === "paid" && ST.creates === c6 && !lockOf("s6"), inv(i6));

// C7 network error after Stripe created the payment
const i7 = setup("s7", "2028-03"); ST.modes.push("network_after_create");
await run("2028-03");
t("C7 通信切断（Stripe側では作成済み）：結果不明として charging のまま・請求書のロックを残す・試行番号は1のまま", inv(i7).status === "charging" && inv(i7).chargeOutcomeUnknown === true && inv(i7).chargeAttempt === 1 && !!lockOf("s7"), inv(i7));
const c7 = ST.creates; await run("2028-03");
t("C7b 再実行：一覧から同じ請求書の支払いを見つけて paid に（新しい支払いもキーも作らない、合計1件）", inv(i7).status === "paid" && ST.creates === c7 && createsFor(i7).length === 1 && inv(i7).chargeAttempt === 1, inv(i7));

// C8 timeout before creation: the result is unknown -> never resent automatically
const i8 = setup("s8", "2028-04"); ST.modes.push("network_before_create");
await run("2028-04");
const key8 = inv(i8).chargeIdempotencyKey;
t("C8 時間切れ：結果不明として charging のまま（chargeOutcomeUnknown）・請求書のロックを残す", inv(i8).status === "charging" && inv(i8).chargeOutcomeUnknown === true && !!lockOf("s8") && createsFor(i8).length === 0, inv(i8));
await run("2028-04");
t("C8b 次の実行：一覧に見つからなくても「作られていない」とは判断せず needs_review（outcome_unknown_not_found）で止める", inv(i8).status === "needs_review" && inv(i8).chargeReviewReason === "outcome_unknown_not_found" && !!lockOf("s8") && createsFor(i8).length === 0, inv(i8));
offset += 16 * 60 * 1000; await run("2028-04");
offset += 25 * 60 * 60 * 1000; await run("2028-04"); await run("2028-04");
t("C8c 15分後・25時間後（冪等キーの保存期間後）に何度実行しても、新しい支払いを作らない（送信は最初の1回だけ・試行番号1・キーも同じ）", inv(i8).status === "needs_review" && createsFor(i8).length === 0 && inv(i8).chargeAttempt === 1 && inv(i8).chargeIdempotencyKey === key8, inv(i8));

// C9 Stripe stored a 500 for the key (no payment created): stays stopped
const i9 = setup("s9", "2028-05"); ST.modes.push("500_cached");
await run("2028-05"); await run("2028-05");
ST.idem.delete(inv(i9).chargeIdempotencyKey); offset += 25 * 60 * 60 * 1000;   // Stripe pruned the key (>=24h)
await run("2028-05"); await run("2028-05");
t("C9 500（結果不明）→ needs_review。冪等キーが消えた後も自動では新しい支払いを作らない（支払い0件・試行番号1）", inv(i9).status === "needs_review" && createsFor(i9).length === 0 && inv(i9).chargeAttempt === 1 && !!lockOf("s9"), inv(i9));

// C9b 429 is treated as unknown too
const i9b = setup("s9b", "2028-05"); ST.modes.push("429");
await run("2028-05");
t("C9b 429（混雑）も結果不明として charging（送り直さない）", inv(i9b).status === "charging" && inv(i9b).chargeOutcomeUnknown === true && createsFor(i9b).length === 0, inv(i9b));

// C10 500 but the payment was actually created
const i10 = setup("s10", "2028-06"); ST.modes.push("500_after_create");
await run("2028-06"); await run("2028-06");
t("C10 500（実際には作成済み）：照合で見つけて paid、送り直しなし（支払い1件）", inv(i10).status === "paid" && createsFor(i10).length === 1, inv(i10));

// C11 concurrent runs
const i11 = setup("s11", "2028-07");
globalThis.__TX_HOOK = async () => { await sleep(3); };
await Promise.all([run("2028-07"), run("2028-07"), run("2028-07")]);
globalThis.__TX_HOOK = null;
t("C11 3つの請求処理を同時に実行：支払いは1件だけ・paid", createsFor(i11).length === 1 && inv(i11).status === "paid", { creates: createsFor(i11).length, inv: inv(i11) });

// C11b deterministic race: both runs read "closed", one claim commits first, the other must re-check and stop
const i11b = setup("s11b", "2029-02");
let delayed = false;
let reached11; const reached11P = new Promise((r) => (reached11 = r)); let release11; const release11P = new Promise((r) => (release11 = r));
ST.hold = { reached: reached11, release: release11P };          // hold the first send at Stripe
globalThis.__TX_HOOK = async () => { if (!delayed) { delayed = true; await sleep(30); } };
const both11 = Promise.all([run("2029-02"), run("2029-02")]);
await reached11P; await sleep(80);                              // the other run re-checks while the first send is in flight
release11(); await both11;
globalThis.__TX_HOOK = null;
t("C11b 両方が closed を読んだ後に一方が先に確保：もう一方はトランザクション内で確かめ直して請求しない（支払い1件・試行番号1）", createsFor(i11b).length === 1 && inv(i11b).status === "paid" && inv(i11b).chargeAttempt === 1, { creates: createsFor(i11b).length, inv: inv(i11b) });

// C12 lease takeover while the first request is still in flight
const i12 = setup("s12", "2028-08");
let reached; const reachedP = new Promise((r) => (reached = r)); let release; const releaseP = new Promise((r) => (release = r));
ST.hold = { reached, release: releaseP };
const pA = run("2028-08"); await reachedP;           // A sent, Stripe has not answered yet
offset += 3 * 60 * 1000;                             // A's lease expired
const rB = await run("2028-08");                     // B: reconcile, nothing in the list yet -> must wait, not resend
const createsWhileHeld = createsFor(i12).length;
release(); await pA;                                 // A's request completes at Stripe (1 payment), A cannot record (lease lost)
t("C12 確保期限が切れても、最初の送信の結果が出る前に別の処理は新しく送らない（一覧に無い→needs_review で止める）", createsWhileHeld === 0 && rB.invoices.find((x) => x.invoiceId === i12).status === "needs_review", { createsWhileHeld, b: rB.invoices.find((x) => x.invoiceId === i12) });
await run("2028-08");
t("C12b needs_review の照合（読み取りだけ）で最初の送信の支払いを見つけて paid（支払いは1件だけ）", inv(i12).status === "paid" && createsFor(i12).length === 1, inv(i12));

// C13 card changed between claim and send
const i13 = setup("s13", "2028-09");
let fired = false;
globalThis.__TX_AFTER_COMMIT = async () => { if (fired) return; fired = true; await db.collection("accountBilling").doc("u_s13").set({ test: { ...bill("s13"), paymentMethodId: "pm_s13b", cardVersion: 3 } }, { merge: true }); };
await run("2028-09");
globalThis.__TX_AFTER_COMMIT = null;
t("C13 確保の後・送信の前にカードが変わった：送らずに closed へ戻す（card_changed_before_send）・請求書のロックを外す", inv(i13).status === "closed" && inv(i13).chargeNotSentReason === "card_changed_before_send" && createsFor(i13).length === 0 && !lockOf("s13"), inv(i13));
await run("2028-09");
t("C13b 次の実行で新しいカード（pm_s13b）へ請求、試行番号2・新しいキー（前の試行は送っていないことが確実）", inv(i13).status === "paid" && createsFor(i13)[0].payment_method === "pm_s13b" && inv(i13).chargeAttempt === 2 && inv(i13).chargeIdempotencyKey.endsWith("-2"), inv(i13));

// C14 permission error (not executed at Stripe)
const i14 = setup("s14", "2028-10"); ST.modes.push("403");
await run("2028-10");
t("C14 権限不足（403）：支払いは作られていない→ closed に戻し、エラーを記録・請求書のロックを外す", inv(i14).status === "closed" && inv(i14).lastChargeError.status === 403 && createsFor(i14).length === 0 && !lockOf("s14"), inv(i14));

// C15 request rejected (400)
const i15 = setup("s15", "2028-11"); ST.modes.push("400");
await run("2028-11");
t("C15 請求内容の不備（400）：charge_error（人の確認が必要）・自動の再送なし", inv(i15).status === "charge_error" && createsFor(i15).length === 0, inv(i15));

// C16 (STEP 42-C) another invoice of the same account is being charged: per-invoice locks do not block / bad amount / retiring card
const i16 = setup("s16", "2028-12", { extraBilling: { billingLocks: { "s16_2028-11": { attempt: 1, sinceMs: 1 } } } });
const i16b = setup("s17", "2028-12", { extraInvoice: { amountJpy: 999 } });
const i16c = setup("s18", "2028-12", { extraBilling: { detachPendingPaymentMethods: [{ paymentMethodId: "pm_s18a", state: "pending" }] } });
await run("2028-12");
t("C16 同じアカウントの別の請求書が請求中でも、この請求書は請求できる（ロックは請求書ごと、相手のロックは残る）・金額不整合・取り外し待ちのカードは請求しない", inv(i16).status === "paid" && !!lockOf("s16", "s16_2028-11") && !lockOf("s16", i16) && inv(i16b).status === "closed" && inv(i16c).status === "closed" && createsFor(i16).length === 1 && createsFor(i16b).length + createsFor(i16c).length === 0, { i16: inv(i16), locks: bill("s16").billingLocks });

// C17 mismatched PaymentIntent is never treated as paid
const i17 = setup("s19", "2029-01"); ST.modes.push("network_before_create"); const creates17 = ST.creates;
await run("2029-01");
ST.pis.set("pi_forged", { id: "pi_forged", amount: 1, currency: "jpy", customer: "cus_s19", status: "succeeded", created: Math.floor(Date.now() / 1000), metadata: { invoiceId: i17, chargeAttempt: "1" } });
await run("2029-01");
t("C17 金額が合わない支払いが見つかっても paid にしない（needs_review・payment_intent_mismatch・請求書のロックは残す）", inv(i17).status === "needs_review" && inv(i17).chargeReviewReason === "payment_intent_mismatch" && !!lockOf("s19") && ST.creates === creates17, inv(i17));

// C19 pre-send check: the invoice is "closed" but Stripe already has a succeeded payment for it
const i19 = setup("s20", "2029-03");
ST.pis.set("pi_prior19", { id: "pi_prior19", amount: 500, currency: "jpy", customer: "cus_s20", payment_method: "pm_s20a", status: "succeeded", created: Math.floor(Date.now() / 1000) - 3600, metadata: { invoiceId: i19, chargeAttempt: "1" } });
const c19 = ST.creates; await run("2029-03");
t("C19 送信前の確認：この請求書の成功した支払いがStripeに既にあれば、新しく作らずにその支払いで paid", ST.creates === c19 && inv(i19).status === "paid" && inv(i19).paymentIntentId === "pi_prior19", inv(i19));

// C20 pre-send list fails -> not sent
const i20 = setup("s21", "2029-04"); ST.listFail = 1;
const c20 = ST.creates; await run("2029-04");
t("C20 送信前の確認（一覧）が失敗：送らずに closed へ戻す（precheck_failed）・請求書のロックを外す", ST.creates === c20 && inv(i20).status === "closed" && inv(i20).chargeNotSentReason === "precheck_failed" && !lockOf("s21"), inv(i20));

// C21 paid evidence on a "closed" invoice
const i21 = setup("s22", "2029-05", { extraInvoice: { paidAt: { ms: 1 }, paymentIntentStatus: "succeeded", paymentIntentId: "pi_old" } });
const c21 = ST.creates; const r21 = await run("2029-05");
t("C21 支払い済みの記録がある請求書は、状態が closed でも確保しない（already_paid）", ST.creates === c21 && r21.invoices.find((x) => x.invoiceId === i21).outcomeReason === "already_paid" && inv(i21).status === "closed", r21.invoices.find((x) => x.invoiceId === i21));

// C22 PaymentIntent ID is used first (no list), and a failed lookup keeps the state
const i22 = setup("s23", "2029-06"); ST.modes.push("processing");
await run("2029-06");
const pi22 = inv(i22).paymentIntentId;
ST.retrieveFail = 1; const callsBefore22 = ST.calls.length;
await run("2029-06");
const calls22 = ST.calls.slice(callsBefore22);
t("C22 IDが分かっている照合はIDで照会（一覧を使わない）・照会に失敗しても processing のまま", calls22.length === 1 && calls22[0] === "GET /v1/payment_intents/" + pi22 && inv(i22).status === "processing", { calls22, inv: inv(i22) });
ST.pis.get(pi22).status = "succeeded";
await run("2029-06");
t("C22b 照会できた時点で paid", inv(i22).status === "paid" && createsFor(i22).length === 1);

// C23 unknown result whose list lookup fails -> stays unknown (not needs_review, not resent)
const i23 = setup("s24", "2029-07"); ST.modes.push("network_before_create");
await run("2029-07"); ST.listFail = 1; await run("2029-07");
t("C23 結果不明の照合で一覧も取れない：charging（結果不明）のまま、送り直さない", inv(i23).status === "charging" && inv(i23).chargeOutcomeUnknown === true && createsFor(i23).length === 0, inv(i23));

// C24 no new PaymentIntent for paid invoices, ever
const paidIds = [...S.docs.entries()].filter(([k, v]) => k.startsWith("imadakeMonthlyInvoices/") && v.status === "paid").map(([k]) => k.split("/")[1]);
const createsBefore24 = ST.creates;
for (const m of ["2027-11", "2028-02", "2028-03", "2028-06", "2028-07", "2029-02", "2029-03", "2029-06"]) await run(m);
t("C24 支払い済みの請求書を含む月を再実行しても、新しい支払いは作られない", ST.creates === createsBefore24 && paidIds.every((id) => inv(id).status === "paid"), { before: createsBefore24, after: ST.creates });

// C25-C28 (STEP 42-C) one card per account
const i25a = setup("s30", "2029-09", { uid: "shared", customerKey: "shared", pm: "pm_shared" });
const i25b = setup("s31", "2029-09", { uid: "shared", customerKey: "shared", pm: "pm_shared" });
await run("2029-09");
const p25a = createsFor(i25a)[0], p25b = createsFor(i25b)[0];
t("C25 同じアカウントの2店舗：それぞれの請求書を、同じ顧客・同じカード（1枚を共用）で別々に請求し、請求先アカウントを請求書に記録・ロックはすべて外れる", inv(i25a).status === "paid" && inv(i25b).status === "paid" && p25a.customer === "cus_shared" && p25b.customer === "cus_shared" && p25a.payment_method === "pm_shared" && p25b.payment_method === "pm_shared" && inv(i25a).chargeBillingAccountUid === "shared" && inv(i25b).chargeBillingAccountUid === "shared" && Object.keys(bill("s30").billingLocks || {}).length === 0, { a: inv(i25a), b: inv(i25b) });
const i26 = setup("s32", "2029-10"); S.docs.set("storeMembers/s32_u_second", { storeId: "s32", uid: "u_second", role: "owner", status: "active" });
const r26 = await run("2029-10");
t("C26 有効な owner が2人の店舗は請求先を決めない：請求しない（billing_account_ambiguous）・closed のまま", inv(i26).status === "closed" && createsFor(i26).length === 0 && r26.invoices.find((x) => x.invoiceId === i26).planReason === "billing_account_ambiguous", r26.invoices.find((x) => x.invoiceId === i26));
const i27 = setup("s33", "2029-11"); S.docs.set("storeMembers/s33_u_s33", { storeId: "s33", uid: "u_s33", role: "owner", status: "removed" });
const r27 = await run("2029-11");
t("C27 有効な owner がいない店舗は請求しない（billing_account_missing）", inv(i27).status === "closed" && createsFor(i27).length === 0 && r27.invoices.find((x) => x.invoiceId === i27).planReason === "billing_account_missing", r27.invoices.find((x) => x.invoiceId === i27));
t("C28 請求書に請求先アカウント（chargeBillingAccountUid）を記録・既存の顧客・カード・カードの版の記録はそのまま", inv(i1).chargeBillingAccountUid === "u_s1" && inv(i1).chargeCustomerId === "cus_s1" && inv(i1).chargePaymentMethodId === "pm_s1a" && inv(i1).chargeCardVersion === 2, inv(i1));

// C18 safety invariants
const touched = [...new Set(S.writes.map((w) => w.split("/")[0]))].sort();
t("C18 書き込み先は imadakeMonthlyInvoices と accountBilling だけ（storeMembers は試験の種まき）", JSON.stringify(touched.filter((c) => c !== "storeMembers")) === JSON.stringify(["accountBilling", "imadakeMonthlyInvoices"]), touched);
const stored = JSON.stringify([...S.docs.entries()]);
t("C18b 秘密鍵・Stripeの応答本文はFirestoreに保存しない", !stored.includes(FAKE_SERVER_KEY) && !stored.includes("socket hang up"));
t("C18c Stripeへの呼び出しは作成・照会・一覧だけ（グローバルfetchは0回）", ST.calls.every((c) => /^(POST \/v1\/payment_intents|GET \/v1\/payment_intents(\/pi_[A-Za-z0-9_]+)?)$/.test(c)) && globalFetchCalls === 0, [...new Set(ST.calls)]);
const paidInvoices = [...S.docs.entries()].filter(([k, v]) => k.startsWith("imadakeMonthlyInvoices/") && v.status === "paid");
t("C18d 支払い済みの請求書はどれも、成功した支払いがちょうど1件", paidInvoices.every(([k]) => createsFor(k.split("/")[1]).filter((p) => p.status === "succeeded").length === 1), paidInvoices.map(([k]) => [k, createsFor(k.split("/")[1]).length]));

console.log("stripe creates=" + ST.creates + " tx commits=" + S.txStats.commits + " retries=" + S.txStats.retries);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
