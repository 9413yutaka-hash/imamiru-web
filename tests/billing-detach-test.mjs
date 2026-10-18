// STEP 31-B②: safe detach of replaced cards. REAL moderate-submission handler on mocked firebase-admin (optimistic
// concurrency transactions), in-memory Stripe stub incl. PaymentMethods. No network, no real Stripe/Firestore. Fake keys.
// run: node --import ./mockfa-occ/register.mjs billing-detach-test.mjs
import { REPO_URL } from "./_paths.mjs";
import * as fs from "node:fs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
Object.assign(process.env, { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview" });
const realNow = Date.now; let clockOffset = 0; Date.now = () => realNow() + clockOffset;
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = {};
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const addStore = (n) => { globalThis.__MOCK_TOKENS["o" + n] = pw("u" + n, "o" + n + "@example.com"); S.docs.set("storeAccounts/s" + n, { storeName: "店" + n, enabled: true, createdByType: "storeUser", registrationStatus: "active" }); S.docs.set("storeMembers/s" + n + "_u" + n, { storeId: "s" + n, uid: "u" + n, role: "owner", status: "active" }); };
for (let i = 1; i <= 60; i++) addStore(i);
// ---- Stripe stub ----
const ST = { calls: [], seq: 0, intents: new Map(), pms: new Map(), getFail: [], detachFail: [], detachPosts: [], holdGet: null, holds: [], idem: new Map(), afterDetach: null };
const CARD = { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); if (u.hostname !== "api.stripe.com") throw new Error("unexpected fetch " + url);
  const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
  ST.calls.push(opts.method + " " + u.pathname);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + FAKE_SERVER_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/customers") return json(200, { id: "cus_d" + ++ST.seq });
  if (opts.method === "POST" && u.pathname === "/v1/setup_intents") {
    const id = "seti_d" + ++ST.seq; ST.intents.set(id, { id, customer: form.customer, metadata: { storeId: form["metadata[storeId]"] } });
    return json(200, { id, client_secret: id + "_secret_FAKE", customer: form.customer, payment_method_types: ["card"], metadata: { storeId: form["metadata[storeId]"] }, status: "requires_payment_method" });
  }
  let m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if (opts.method === "GET" && m) {
    const si = ST.intents.get(m[1]); const pmId = "pm" + m[1].slice(4);
    if (!ST.pms.has(pmId)) ST.pms.set(pmId, { customer: si.customer, type: "card" });
    const pm = ST.pms.get(pmId);
    return json(200, { id: si.id, customer: si.customer, metadata: si.metadata, status: "succeeded", payment_method: { id: pmId, type: pm.type, customer: pm.customer, card: CARD } });
  }
  m = u.pathname.match(/^\/v1\/payment_methods\/(pm_[A-Za-z0-9_]+)$/);
  if (opts.method === "GET" && m) {
    if (ST.holdGet && ST.holdGet.pm === m[1]) { const h = ST.holdGet; ST.holdGet = null; h.reached(); await h.release; }
    const hi = ST.holds.findIndex((h) => h.pm === m[1]); if (hi >= 0) { const h = ST.holds.splice(hi, 1)[0]; h.reached(); await h.release; }
    if (ST.getFail.length) { const f = ST.getFail.shift(); if (f === "network") throw new Error("socket hang up"); return json(f, { error: { type: "api_error", message: "secret " + FAKE_SERVER_KEY } }); }
    const pm = ST.pms.get(m[1]); if (!pm) return json(404, { error: { type: "invalid_request_error", code: "resource_missing" } });
    return json(200, { id: pm.reportId || m[1], type: pm.type, customer: pm.customer, card: CARD });
  }
  m = u.pathname.match(/^\/v1\/payment_methods\/(pm_[A-Za-z0-9_]+)\/detach$/);
  if (opts.method === "POST" && m) {
    const idemKey = (opts.headers || {})["Idempotency-Key"] || "";
    ST.detachPosts.push({ pm: m[1], idem: idemKey });
    if (idemKey && ST.idem.has(idemKey)) { const c = ST.idem.get(idemKey); return json(c.status, c.body); }
    if (ST.detachFail.length && ST.detachFail[0] === "cached500") { ST.detachFail.shift(); const body = { error: { type: "api_error" } }; ST.idem.set(idemKey, { status: 500, body }); return json(500, body); }
    if (ST.detachFail.length) { const f = ST.detachFail.shift(); if (f === "network") throw new Error("socket hang up"); return json(f, { error: { type: f === 403 ? "invalid_request_error" : "api_error", code: f === 403 ? "permission_denied" : "" } }); }
    const pm = ST.pms.get(m[1]); if (!pm) return json(404, { error: { type: "invalid_request_error" } });
    pm.customer = null; pm.detached = true; if (ST.afterDetach) { const f = ST.afterDetach; ST.afterDetach = null; f(); }
    return json(200, { id: m[1], customer: null });
  }
  return json(404, { error: { type: "invalid_request_error" } });
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
let pass = 0, fail = 0; const logs = [];
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
let ip = 0;
async function call(mode, body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = (...a) => logs.push(a.map(String).join(" "));
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), authorization: "Bearer " + token }, body: { mode, ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}
const CONSENT = "2026-10-16";
const resetRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeBillingRateLimits/")) S.docs.delete(k); };
const sec = (n) => ((S.docs.get("storeBilling/s" + n) || {}).test) || {};
const q = (n) => sec(n).detachPendingPaymentMethods || [];
const start = async (n) => { resetRate(); return call("storeBillingSetupIntentCreate", { storeId: "s" + n }, "o" + n); };
const confirm = (n, si) => call("storeBillingSetupConfirm", { storeId: "s" + n, setupIntentId: si, consentVersion: CONSENT }, "o" + n);
const register = async (n) => { const c = await start(n); const f = await confirm(n, c.body.setupIntentId); return { c, f, pm: sec(n).paymentMethodId }; };
const posts = (pm) => ST.detachPosts.filter((x) => x.pm === pm).length;
// seed a store with a given current card and queue (customer known to the stub)
const seed = (n, cur, entries, extra = {}) => { const cust = "cus_seed" + n; ST.pms.set(cur, { customer: cust, type: "card" }); for (const e of entries) if (!ST.pms.has(e.paymentMethodId)) ST.pms.set(e.paymentMethodId, { customer: cust, type: "card" }); S.docs.set("storeBilling/s" + n, { storeId: "s" + n, test: { customerId: cust, paymentMethodId: cur, card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }, cardVersion: 3, pendingSetupIntentId: "", detachPendingPaymentMethods: entries, ...extra } }); return cust; };
const ent = (pm, more = {}) => ({ paymentMethodId: pm, state: "pending", queuedAtMs: 1, queuedCardVersion: 2, attempts: 0, ...more });

// D1 first registration
const r1 = await register(1);
t("D1 初回登録：取り外しは起きない（detach送信0件・取り外し待ち0件）", r1.f.code === 200 && q(1).length === 0 && ST.detachPosts.length === 0 && !ST.calls.some((x) => /payment_methods/.test(x)), { q: q(1), calls: ST.calls });
// D2 change detaches only the previous card
const r2 = await register(1);
t("D2 カード変更：直前のカードだけを取り外す（冪等キー付き1回）・待ち一覧は空・結果を記録", r2.f.code === 200 && posts(r1.pm) === 1 && ST.detachPosts.find((x) => x.pm === r1.pm).idem === "machinau-detach-test-" + r1.pm + "-1" && q(1).length === 0 && sec(1).lastDetachResult.paymentMethodId === r1.pm && sec(1).lastDetachResult.outcome === "detached", { posts: ST.detachPosts, q: q(1), last: sec(1).lastDetachResult });
t("D2b 現在のカードは取り外さない・登録状態はそのまま（cardVersion=2）", posts(r2.pm) === 0 && sec(1).paymentMethodId === r2.pm && sec(1).cardVersion === 2 && ST.pms.get(r2.pm).customer !== null, sec(1));
// D3 corrupt queue entry equal to the current card is never touched
seed(2, "pm_cur2", [ent("pm_cur2"), ent("pm_old2")]);
const r3 = await register(2);
t("D3 待ち一覧に現在のカードと同じIDが混じっていても、それは取り外さない（確定前の現在カードも同様）", r3.f.code === 200 && posts("pm_cur2") === 1 && posts(sec(2).paymentMethodId) === 0 && q(2).filter((e) => e.paymentMethodId === "pm_cur2").length === 0, { posts: ST.detachPosts.filter((x) => /2$|d/.test(x.pm)), cur: sec(2).paymentMethodId });
// direct check: current card in queue is skipped by the claim
seed(3, "pm_cur3", [ent("pm_cur3"), ...Array.from({ length: 9 }, (_, i) => ent("pm_q3_" + i))]);
const callsBefore3 = ST.calls.length; const r3b = await start(3);
t("D3b 上限10件の先頭に現在のカードが混じっていても、回復処理はそれを飛ばして他の2件だけ取り外す", posts("pm_cur3") === 0 && !ST.calls.slice(callsBefore3).includes("GET /v1/payment_methods/pm_cur3") && posts("pm_q3_0") === 1 && posts("pm_q3_1") === 1 && sec(3).paymentMethodId === "pm_cur3" && ST.pms.get("pm_cur3").customer === "cus_seed3", { calls: ST.calls.slice(callsBefore3), code: r3b.code });
// D4 foreign customer
seed(4, "pm_cur4", []); const r4a = await register(4); ST.pms.set("pm_cur4", { customer: "cus_OTHER", type: "card" }); // not used
S.docs.set("storeBilling/s4", { storeId: "s4", test: { ...sec(4), detachPendingPaymentMethods: [ent("pm_foreign4")] } }); ST.pms.set("pm_foreign4", { customer: "cus_OTHER", type: "card" });
await register(4);
const f4 = q(4).find((e) => e.paymentMethodId === "pm_foreign4");
t("D4 他の顧客のカード：取り外さず blocked（customer_mismatch）として記録を残す", posts("pm_foreign4") === 0 && f4 && f4.state === "blocked" && f4.blockedReason === "customer_mismatch" && ST.pms.get("pm_foreign4").customer === "cus_OTHER", f4);
// D5 already detached
seed(5, "pm_cur5", [ent("pm_gone5")]); ST.pms.set("pm_gone5", { customer: null, type: "card" });
await register(5);
t("D5 取り外し済み（customerなし）：再度detachしない・一覧から除き already_detached を記録", posts("pm_gone5") === 0 && !q(5).some((e) => e.paymentMethodId === "pm_gone5") && sec(5).lastDetachResult && ["already_detached", "detached"].includes(sec(5).lastDetachResult.outcome), { q: q(5), last: sec(5).lastDetachResult });
// D6 not found / unexpected
seed(6, "pm_cur6", [ent("pm_missing6")]); ST.pms.delete("pm_missing6");
await register(6);
const f6 = q(6).find((e) => e.paymentMethodId === "pm_missing6");
t("D6 Stripeに見つからない（404）：取り外さず blocked（payment_method_not_found）で残す", f6 && f6.state === "blocked" && f6.blockedReason === "payment_method_not_found" && posts("pm_missing6") === 0, f6);
seed(7, "pm_cur7", [ent("pm_odd7")]); ST.pms.set("pm_odd7", { customer: "cus_seed7", type: "sepa_debit" });
await register(7);
const f7 = q(7).find((e) => e.paymentMethodId === "pm_odd7");
t("D7 カード以外の種類：取り外さず blocked（payment_method_unexpected）", f7 && f7.state === "blocked" && f7.blockedReason === "payment_method_unexpected" && posts("pm_odd7") === 0, f7);
// D8 Stripe outage on lookup -> retry with backoff
seed(8, "pm_cur8", [ent("pm_old8")]);
ST.getFail.push(500, 500); const r8 = await register(8);
const f8 = q(8).find((e) => e.paymentMethodId === "pm_old8");
t("D8 照会でStripe障害（500）：カード登録は成功のまま・取り外し待ちは pending（attempts=1・エラー記録・再試行時刻）", r8.f.code === 200 && r8.f.body.status === "succeeded" && f8 && f8.state === "pending" && f8.attempts === 1 && f8.lastError.status === 500 && f8.nextRetryAtMs > Date.now() && posts("pm_old8") === 0, { f8, f: r8.f.body });
const pmAfter8 = sec(8).paymentMethodId;
// D8b before nextRetryAt: not retried; after: retried and detached (via another change)
resetRate(); const g8 = ST.calls.length; await start(8);
t("D8b 再試行時刻前は再試行しない", !ST.calls.slice(g8).some((x) => x === "GET /v1/payment_methods/pm_old8"), ST.calls.slice(g8));
clockOffset += 2 * 60 * 1000; ST.getFail.length = 0;
const r8c = await register(8);
t("D8c 再試行時刻の後のカード変更で、残っていた旧カードも順に取り外される", posts("pm_old8") === 1 && !q(8).some((e) => e.paymentMethodId === "pm_old8") && r8c.f.code === 200, { q: q(8), posts: ST.detachPosts.filter((x) => /8$|d/.test(x.pm)) });
// D9 network / 403 / exhausted
seed(9, "pm_cur9", [ent("pm_old9")]);
ST.detachFail.push("network"); await register(9);
const f9 = q(9).find((e) => e.paymentMethodId === "pm_old9");
t("D9 取り外しで通信断：pending（再試行待ち）で残る・現在のカードは変わらない", f9 && f9.state === "pending" && f9.lastError.type === "network_error" && sec(9).paymentMethodId !== "pm_old9", f9);
seed(10, "pm_cur10", [ent("pm_old10", { attempts: 7 })]);
ST.detachFail.push(403); await register(10);
const f10 = q(10).find((e) => e.paymentMethodId === "pm_old10");
t("D9b 権限不足（403）：回数を超えていても failed にせず pending・1時間後に再試行（権限を直せば回復）", f10 && f10.state === "pending" && f10.lastError.status === 403 && f10.nextRetryAtMs - Date.now() > 50 * 60 * 1000, f10);
seed(11, "pm_cur11", [ent("pm_old11", { attempts: 4 })]);
ST.detachFail.push(500); await register(11);
const f11 = q(11).find((e) => e.paymentMethodId === "pm_old11");
t("D9c 5回目の失敗（500）で failed になり、消さずに残す", f11 && f11.state === "failed" && f11.attempts === 5 && f11.lastError.status === 500, f11);
// D9d Stripe replays a cached 500 for the same idempotency key -> retry must use a new key and succeed
seed(22, "pm_cur22", [ent("pm_old22")]);
ST.detachFail.push("cached500"); await register(22);
const f22 = q(22).find((e) => e.paymentMethodId === "pm_old22");
clockOffset += 2 * 60 * 1000;
await register(22);
const keys22 = ST.detachPosts.filter((x) => x.pm === "pm_old22").map((x) => x.idem);
t("D9d 1回目の取り外しが500（Stripeが同じキーに500を再送する状態）→再試行は別の冪等キーで送り、取り外しに成功する", f22 && f22.state === "pending" && f22.lastError.status === 500 && keys22.length === 2 && keys22[0] !== keys22[1] && keys22[0].endsWith("-1") && keys22[1].endsWith("-2") && !q(22).some((e) => e.paymentMethodId === "pm_old22") && ST.pms.get("pm_old22").customer === null, { keys22, f22, q: q(22) });
// D10 detach success but Firestore update fails -> recovered after lease expiry without second detach
seed(12, "pm_cur12", [ent("pm_old12")]);
ST.afterDetach = () => { globalThis.__TX_HOOK = async () => { globalThis.__TX_HOOK = null; throw new Error("DEADLINE_EXCEEDED (simulated)"); }; };
const r12 = await register(12);
const f12 = q(12).find((e) => e.paymentMethodId === "pm_old12");
t("D10 Stripeで取り外し成功→Firestore更新に失敗：登録は成功のまま・項目は detaching（確保中）で残る", r12.f.code === 200 && posts("pm_old12") === 1 && f12 && f12.state === "detaching" && f12.leaseUntilMs > Date.now(), { f12, f: r12.f.body });
resetRate(); const g12 = ST.calls.length; await start(12); // lease still valid -> nothing
t("D10b 確保期限内は再処理しない", !ST.calls.slice(g12).some((x) => x === "GET /v1/payment_methods/pm_old12"), ST.calls.slice(g12));
clockOffset += 61 * 1000;
await register(12);
t("D10c 確保期限切れ後：照会で取り外し済みと分かり、再detachせずに一覧から除く（detach送信は合計1回）", posts("pm_old12") === 1 && !q(12).some((e) => e.paymentMethodId === "pm_old12"), { q: q(12), posts: posts("pm_old12") });
// D11 lease expiry while the old worker is still running: old worker must not detach
seed(13, "pm_cur13", [ent("pm_old13")]);
let reached; const reachedP = new Promise((r) => (reached = r)); let release; const releaseP = new Promise((r) => (release = r));
ST.holdGet = { pm: "pm_old13", reached, release: releaseP };
const rA = (async () => { const c = await start(13); return confirm(13, c.body.setupIntentId); })(); // worker A (held at lookup)
await reachedP; clockOffset += 61 * 1000; // A's lease expires
const rB = await register(13); // worker B claims the expired lease and detaches
const postsAfterB = posts("pm_old13");
release(); const rAres = await rA;
t("D11 旧処理の確保期限が切れて新処理が取り外した後、旧処理は取り外しを送らず、記録も上書きしない", postsAfterB === 1 && posts("pm_old13") === 1 && !q(13).some((e) => e.paymentMethodId === "pm_old13") && rAres.code === 200 && rB.f.code === 200, { postsAfterB, total: posts("pm_old13"), q: q(13), a: rAres.code });
// D11b lease nearly expired when the lookup returns -> no detach sent, entry back to pending
seed(20, "pm_cur20", [ent("pm_old20")]);
let reached20; const reached20P = new Promise((r) => (reached20 = r)); let release20; const release20P = new Promise((r) => (release20 = r));
ST.holdGet = { pm: "pm_old20", reached: reached20, release: release20P };
const r20p = register(20);
await reached20P; clockOffset += 45 * 1000; release20(); const r20 = await r20p;
const f20 = q(20).find((e) => e.paymentMethodId === "pm_old20");
t("D11b 照会が返った時点で確保期限の残りが20秒未満：取り外しを送らず pending に戻す（lease_too_short）", r20.f.code === 200 && posts("pm_old20") === 0 && f20 && f20.state === "pending" && f20.lastError.type === "lease_too_short" && ST.pms.get("pm_old20").customer === "cus_seed20", f20);
// D11c stale worker's result must not overwrite a newer claim (leaseId match)
seed(21, "pm_cur21", [ent("pm_old21")]);
const mkHold = (pm) => { let reached, release; const rp = new Promise((r) => (reached = r)), lp = new Promise((r) => (release = r)); ST.holds.push({ pm, reached, release: lp }); return { rp, release }; };
const hA = mkHold("pm_old21");
const pA = register(21); await hA.rp;            // worker A claimed, held at lookup
clockOffset += 61 * 1000;                        // A's lease expired
const hB = mkHold("pm_old21");
const pB = (async () => { resetRate(); return confirm(21, (await start(21)).body.setupIntentId); })(); await hB.rp; // B re-claimed, held
const leaseB = q(21).find((e) => e.paymentMethodId === "pm_old21").leaseId;
hA.release(); await pA;                           // A finishes (lease_too_short) -> must not touch B's claim
const midState = q(21).find((e) => e.paymentMethodId === "pm_old21");
hB.release(); await pB;
t("D11c 期限切れの旧処理の結果は、新しい確保（leaseId）を上書きしない→新処理が正しく完了", midState && midState.state === "detaching" && midState.leaseId === leaseB && posts("pm_old21") === 1 && !q(21).some((e) => e.paymentMethodId === "pm_old21"), { midState, leaseB, posts: posts("pm_old21"), q: q(21) });
// D12 concurrent processing: no entry detached twice
const many = Array.from({ length: 10 }, (_, i) => ent("pm_c14_" + i));
seed(14, "pm_cur14", many);
globalThis.__TX_HOOK = async () => { await sleep(3); };
const conc = await Promise.all([1, 2, 3].map(() => call("storeBillingSetupIntentCreate", { storeId: "s14" }, "o14")));
globalThis.__TX_HOOK = null;
const dup = many.filter((e) => posts(e.paymentMethodId) > 1).length, done14 = many.filter((e) => posts(e.paymentMethodId) === 1).length;
t("D12 同時に3件の処理が走っても、同じカードを2回取り外さない（取り外した分だけ一覧から消える）", dup === 0 && q(14).length === 10 - done14 && done14 >= 1 && !q(14).some((e) => posts(e.paymentMethodId) === 1), { dup, done14, left: q(14).length, codes: conc.map((x) => x.code) });
// D13 recovery from the 10-entry limit
seed(15, "pm_cur15", Array.from({ length: 10 }, (_, i) => ent("pm_l15_" + i)));
const r15 = await start(15);
t("D13 上限10件：登録開始時に2件取り外して8件になり、カード変更を始められる（回復）", r15.code === 200 && q(15).length === 8, { code: r15.code, body: r15.body, left: q(15).length });
seed(16, "pm_cur16", Array.from({ length: 10 }, (_, i) => ent("pm_l16_" + i)));
ST.getFail.push(503, 503); const r16 = await start(16);
t("D13b 上限10件でStripe障害：409 detach_pending_limit・10件の記録はすべて残る（エラー記録つき）", r16.code === 409 && r16.body.reason === "detach_pending_limit" && q(16).length === 10 && q(16).filter((e) => e.lastError && e.lastError.status === 503).length === 2, { code: r16.code, q: q(16).map((e) => [e.paymentMethodId, e.state]) });
// D14 billing lock holds detaching
seed(17, "pm_cur17", [ent("pm_old17")], { billingLock: { atMs: 1, runId: "x" } });
const g17 = ST.calls.length; const r17 = await register(17);
const f17 = q(17).find((e) => e.paymentMethodId === "pm_old17");
t("D14 請求ロック（billingLock）中は取り外さずに保留（照会もしない・attemptsも増えない）", r17.f.code === 200 && f17 && f17.state === "pending" && f17.attempts === 0 && posts("pm_old17") === 0 && !ST.calls.slice(g17).some((x) => x === "GET /v1/payment_methods/pm_old17") && q(17).length === 2, { q: q(17) });
// D15 Stripe failure during post-processing never breaks the registration
seed(18, "pm_cur18", []); ST.getFail.push("network");
const r18 = await register(18);
t("D15 取り外しの照会が通信断でも、カード登録・変更は成功（新カード保存・旧カードは再試行待ち）", r18.f.code === 200 && r18.f.body.status === "succeeded" && sec(18).paymentMethodId === r18.pm && q(18).some((e) => e.paymentMethodId === "pm_cur18" && e.state === "pending"), { f: r18.f.body, q: q(18) });
// D16 existing data (no queue field, old card) works end-to-end
ST.pms.set("pm_existing4444", { customer: "cus_legacy19", type: "card" });
S.docs.set("storeBilling/s19", { storeId: "s19", test: { customerId: "cus_legacy19", paymentMethodId: "pm_existing4444", card: { brand: "mastercard", last4: "4444", expMonth: 6, expYear: 2031 }, cardVersion: 2, setupStatus: "succeeded", lastSetupIntentId: "seti_x", pendingSetupIntentId: "", consentVersion: CONSENT } });
const st19 = await call("storeBillingStatus", { storeId: "s19" }, "o19");
const r19 = await register(19);
t("D16 既存形式（取り外し待ち項目なし・Mastercard 4444）：表示は従来どおり→変更で4444だけ取り外し", st19.body.card && st19.body.card.last4 === "4444" && r19.f.code === 200 && posts("pm_existing4444") === 1 && q(19).length === 0 && sec(19).cardVersion === 3, { st: st19.body, q: q(19) });
// ===== STEP 32-D①: detach is no longer stopped by the billing-start flag, but protected by unresolved invoices =====
const invoiceOf = (n, month, status, pm, extra = {}) => S.docs.set("imadakeMonthlyInvoices/s" + n + "_" + month, { storeId: "s" + n, month, status, lineCount: 1, amountJpy: 100, currency: "JPY", taxIncluded: true, chargePaymentMethodId: pm, ...extra });
const src = fs.readFileSync(new URL("../api/_lib/store-billing.js", import.meta.url), "utf8");
t("E0 取り外しの可否は課金開始フラグに依存しない（store-billing.js は IMADAKE_CV_BILLING_STARTED を参照しない）", !/IMADAKE_CV_BILLING_STARTED/.test(src));

// E1 resolved invoices (paid / closed / closing / charge_error) do not protect the old card
for (const [n, status] of [[26, "paid"], [27, "closed"], [28, "closing"], [29, "charge_error"]]) {
  seed(n, "pm_cur" + n, [ent("pm_old" + n)]); invoiceOf(n, "2027-11", status, "pm_old" + n);
  await register(n);
}
t("E1 支払い済み・締め後(未請求)・締め処理中・請求不備(支払いなし)の請求書が使ったカードは、取り外せる", [26, 27, 28, 29].every((n) => posts("pm_old" + n) === 1 && !q(n).some((e) => e.paymentMethodId === "pm_old" + n)), [26, 27, 28, 29].map((n) => [n, posts("pm_old" + n), q(n).map((e) => e.paymentMethodId + ":" + e.state)]));

// E2 unresolved invoices protect the card they used (even without a billingLock = inconsistent state)
const unresolved = [[30, "charging"], [31, "processing"], [32, "requires_action"], [33, "needs_review"], [34, "payment_failed"], [35, "refunded_future_status"]];
for (const [n, status] of unresolved) {
  seed(n, "pm_cur" + n, [ent("pm_old" + n)]); invoiceOf(n, "2027-11", status, "pm_old" + n);
  await register(n);
}
t("E2 未解決（請求中・処理中・本人認証待ち・人の確認待ち・支払い失敗・知らない状態）の請求書が使ったカードは取り外さない（記録は pending のまま）", unresolved.every(([n]) => posts("pm_old" + n) === 0 && q(n).some((e) => e.paymentMethodId === "pm_old" + n && e.state === "pending" && e.attempts === 0)), unresolved.map(([n]) => [n, posts("pm_old" + n), q(n).find((e) => e.paymentMethodId === "pm_old" + n)]));
t("E2b 守られているカードは飛ばし、守られていない別の旧カード（直前のカード）は取り外す", unresolved.every(([n]) => posts("pm_cur" + n) === 1), unresolved.map(([n]) => [n, posts("pm_cur" + n)]));

// E3 result unknown on an otherwise "closed" invoice protects the card
seed(36, "pm_cur36", [ent("pm_old36")]); invoiceOf(36, "2027-11", "closed", "pm_old36", { chargeOutcomeUnknown: true });
await register(36);
t("E3 結果不明の印がある請求書のカードは、状態が closed でも取り外さない", posts("pm_old36") === 0, q(36));

// E4 an unresolved invoice using a different card does not block this card
seed(37, "pm_cur37", [ent("pm_old37")]); invoiceOf(37, "2027-11", "needs_review", "pm_other37");
await register(37);
t("E4 未解決の請求書が別のカードを使っている場合、この旧カードは取り外す", posts("pm_old37") === 1, q(37));

// E5 invoices cannot be read -> stop all detaching for that store
seed(38, "pm_cur38", [ent("pm_old38")]);
globalThis.__QUERY_FAIL = "imadakeMonthlyInvoices";
const r38 = await register(38);
globalThis.__QUERY_FAIL = null;
t("E5 請求書を読めない：カード登録は成功、取り外しは一切しない（照会も送らない・記録は手つかず）", r38.f.code === 200 && posts("pm_old38") === 0 && posts("pm_cur38") === 0 && q(38).every((e) => e.state === "pending" && e.attempts === 0), q(38));

// E6 billingLock still holds everything
seed(39, "pm_cur39", [ent("pm_old39")], { billingLock: { invoiceId: "s39_2027-11", attempt: 1, sinceMs: 1 } });
await register(39);
t("E6 請求ロックがある間は、請求書に関係なくどのカードも取り外さない", posts("pm_old39") === 0 && posts("pm_cur39") === 0, q(39));

// E7 race: after the claim, an unresolved invoice starts using the card -> re-check right before detach stops it
seed(40, "pm_cur40", [ent("pm_old40")]);
const h40 = mkHold("pm_old40");
const p40 = register(40); await h40.rp;
invoiceOf(40, "2027-11", "charging", "pm_old40");
h40.release(); await p40;
const f40 = q(40).find((e) => e.paymentMethodId === "pm_old40");
t("E7 確保した後に未解決の請求書がそのカードを使い始めた：取り外し直前の確認で止め、pending に戻す（protected_by_invoice）", posts("pm_old40") === 0 && f40 && f40.state === "pending" && f40.lastError.type === "protected_by_invoice", f40);

// E8 race: a billingLock appears after the claim
seed(41, "pm_cur41", [ent("pm_old41")]);
const h41 = mkHold("pm_old41");
const p41 = register(41); await h41.rp;
S.docs.set("storeBilling/s41", { ...S.docs.get("storeBilling/s41"), test: { ...S.docs.get("storeBilling/s41").test, billingLock: { invoiceId: "s41_2027-11", attempt: 1, sinceMs: 1 } } });
h41.release(); await p41;
t("E8 確保した後に請求ロックが付いた：取り外し直前の確認で止める", posts("pm_old41") === 0 && q(41).find((e) => e.paymentMethodId === "pm_old41").state === "pending", q(41));

// E9 once the invoice is resolved, the protected card is detached on a later run
S.docs.set("imadakeMonthlyInvoices/s33_2027-11", { ...S.docs.get("imadakeMonthlyInvoices/s33_2027-11"), status: "paid" });
await register(33);
t("E9 守っていた請求書が解決（paid）した後のカード変更で、その旧カードも取り外される", posts("pm_old33") === 1, q(33));

// ===== STEP 32-D③: while a billingLock exists, only cards not used by unresolved invoices are detached =====
const lockOn = (n, invoiceId) => { const d = S.docs.get("storeBilling/s" + n); S.docs.set("storeBilling/s" + n, { ...d, test: { ...d.test, billingLock: { invoiceId, attempt: 1, sinceMs: 1 } } }); };
// F1 the card in use by the locked (charging) invoice was the current card before this change
seed(46, "pm_inuse46", [ent("pm_y46")]);
invoiceOf(46, "2027-12", "charging", "pm_inuse46"); lockOn(46, "s46_2027-12");
const r46 = await register(46);
t("F1 請求中ロックあり：請求に使っているカード（変更前の現在のカード）は守り、別の旧カードは取り外す", r46.f.code === 200 && posts("pm_inuse46") === 0 && posts("pm_y46") === 1 && q(46).some((e) => e.paymentMethodId === "pm_inuse46" && e.state === "pending"), q(46));
await register(46);
t("F1b ロック中のカード変更を繰り返しても、請求に使っているカードは取り外さず、ほかの旧カードは順に減る", posts("pm_inuse46") === 0 && q(46).filter((e) => e.paymentMethodId !== "pm_inuse46").length <= 1, q(46).map((e) => e.paymentMethodId + ":" + e.state));
// F2 needs_review / requires_action / processing under lock
for (const [n, status] of [[47, "needs_review"], [48, "requires_action"], [49, "processing"]]) {
  seed(n, "pm_inuse" + n, [ent("pm_y" + n)]); invoiceOf(n, "2027-12", status, "pm_inuse" + n); lockOn(n, "s" + n + "_2027-12");
  await register(n);
}
t("F2 人の確認待ち・本人認証待ち・処理中のロック中も、使ったカードは守り、ほかの旧カードは取り外す", [47, 48, 49].every((n) => posts("pm_inuse" + n) === 0 && posts("pm_y" + n) === 1), [47, 48, 49].map((n) => [n, posts("pm_inuse" + n), posts("pm_y" + n)]));
// F3 locked invoice has no recorded card -> stop everything
seed(50, "pm_cur50", [ent("pm_y50")]); invoiceOf(50, "2027-12", "charging", ""); lockOn(50, "s50_2027-12");
await register(50);
t("F3 ロック中の請求書に使ったカードの記録がない：どのカードも取り外さない", posts("pm_y50") === 0 && posts("pm_cur50") === 0 && q(50).every((e) => e.attempts === 0), q(50));
// F4 lock points to an invoice that is already resolved (inconsistent)
seed(51, "pm_cur51", [ent("pm_y51")]); invoiceOf(51, "2027-12", "paid", "pm_x51"); lockOn(51, "s51_2027-12");
await register(51);
t("F4 ロックが解決済み（paid）の請求書を指している（食い違い）：取り外さない", posts("pm_y51") === 0 && posts("pm_cur51") === 0, q(51));
// F5 another unresolved invoice without a recorded card -> stop
seed(52, "pm_inuse52", [ent("pm_y52")]); invoiceOf(52, "2027-12", "charging", "pm_inuse52"); invoiceOf(52, "2027-11", "needs_review", ""); lockOn(52, "s52_2027-12");
await register(52);
t("F5 別の未解決の請求書が使ったカードを記録していない：判断できないので取り外さない", posts("pm_y52") === 0, q(52));
// F6 invoices cannot be read while locked
seed(53, "pm_inuse53", [ent("pm_y53")]); invoiceOf(53, "2027-12", "charging", "pm_inuse53"); lockOn(53, "s53_2027-12");
globalThis.__QUERY_FAIL = "imadakeMonthlyInvoices"; await register(53); globalThis.__QUERY_FAIL = null;
t("F6 ロック中に請求書を読めない：取り外さない", posts("pm_y53") === 0 && posts("pm_inuse53") === 0, q(53));
// F7 after the claim, an unresolved invoice (theoretically) starts using the claimed card -> re-check stops it
seed(54, "pm_inuse54", [ent("pm_y54")]); invoiceOf(54, "2027-12", "charging", "pm_inuse54"); lockOn(54, "s54_2027-12");
const h54 = mkHold("pm_y54");
const p54 = register(54); await h54.rp;
invoiceOf(54, "2027-11", "requires_action", "pm_y54");
h54.release(); await p54;
t("F7 確保した後に未解決の請求書がそのカードを使っていると分かった：取り外し直前の確認で止める", posts("pm_y54") === 0 && q(54).find((e) => e.paymentMethodId === "pm_y54").lastError.type === "protected_by_invoice", q(54));
// F8 after the locked invoice is paid and the lock is released, the protected card is detached
S.docs.set("imadakeMonthlyInvoices/s46_2027-12", { ...S.docs.get("imadakeMonthlyInvoices/s46_2027-12"), status: "paid" });
{ const d = S.docs.get("storeBilling/s46"); const t2 = { ...d.test }; delete t2.billingLock; S.docs.set("storeBilling/s46", { ...d, test: t2 }); }
for (let i = 0; i < 3 && posts("pm_inuse46") === 0; i++) await register(46);
t("F8 ロックの請求書が支払い済みになりロックが外れた後、守っていたカードも取り外される", posts("pm_inuse46") === 1, q(46));

// D17 invariants
const stored = JSON.stringify([...S.docs.entries()].filter(([k]) => k.startsWith("storeBilling/")));
t("D17 秘密情報・カード番号はログにも保存にも出ない", !logs.join("\n").includes(FAKE_SERVER_KEY) && !stored.includes(FAKE_SERVER_KEY) && !stored.includes("4242424242424242"));
const touched = [...new Set(S.writes.map((w) => w.split("/")[0]))].sort();
t("D17b 書き込み先は storeBilling と連打防止だけ", JSON.stringify(touched) === JSON.stringify(["storeBilling", "storeBillingRateLimits"]), touched);
t("D17c Stripeへの呼び出しは許可した種類だけ（顧客作成・SetupIntent作成/照会・カード照会・取り外し）", ST.calls.every((x) => /^(POST \/v1\/customers|POST \/v1\/setup_intents|GET \/v1\/setup_intents\/seti_d\d+|GET \/v1\/payment_methods\/pm_[A-Za-z0-9_]+|POST \/v1\/payment_methods\/pm_[A-Za-z0-9_]+\/detach)$/.test(x)), [...new Set(ST.calls.map((x) => x.replace(/pm_[A-Za-z0-9_]+/, "pm_*").replace(/seti_d\d+/, "seti_*")))]);
t("D17d 現在のカードとして保存されているカードは、どの店舗でも取り外されていない", [...S.docs.entries()].filter(([k]) => k.startsWith("storeBilling/")).every(([, v]) => !v.test || !v.test.paymentMethodId || posts(v.test.paymentMethodId) === 0), [...S.docs.entries()].filter(([k]) => k.startsWith("storeBilling/")).map(([k, v]) => [k, v.test && v.test.paymentMethodId, v.test && posts(v.test.paymentMethodId)]));
t("D17e 課金停止フラグは false のまま", (await import(REPO_URL + "/api/_lib/imadake.js")).IMADAKE_CV_BILLING_STARTED === false);
console.log("detach posts=" + ST.detachPosts.length + " tx commits=" + S.txStats.commits + " retries=" + S.txStats.retries);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
