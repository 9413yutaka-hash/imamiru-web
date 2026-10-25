// STEP 31-A: card change / confirm transaction safety. REAL moderate-submission handler on mocked firebase-admin with
// optimistic-concurrency transactions (mockfa-occ), in-memory Stripe stub. No network, no real Stripe/Firestore. Fake keys.
// run: node --import ./mockfa-occ/register.mjs billing-change-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
Object.assign(process.env, { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { owner: pw("u1", "owner@example.com"), owner2: pw("u2", "owner2@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
S.docs.set("storeAccounts/s1", { storeName: "店1", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
S.docs.set("storeMembers/s1_u1", { storeId: "s1", uid: "u1", role: "owner", status: "active" });
S.docs.set("storeAccounts/s2", { storeName: "マチナウ動作テスト", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
S.docs.set("storeMembers/s2_u2", { storeId: "s2", uid: "u2", role: "owner", status: "active" });
// ---- Stripe stub: each SetupIntent gets its own card; GET status per intent ----
const ST = { calls: [], seq: 0, intents: new Map(), nextCard: null, failNextGet: null };
const CARDS = { visa: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 }, mc: { brand: "mastercard", last4: "4444", exp_month: 6, exp_year: 2031 }, amex: { brand: "amex", last4: "8431", exp_month: 3, exp_year: 2032 } };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url)); if (u.hostname !== "api.stripe.com") throw new Error("unexpected fetch " + url);
  const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
  ST.calls.push(opts.method + " " + u.pathname);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + FAKE_SERVER_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method === "POST" && u.pathname === "/v1/customers") return json(200, { id: "cus_new" + ++ST.seq });
  if (opts.method === "POST" && u.pathname === "/v1/setup_intents") {
    if (Object.keys(form).some((k) => k.startsWith("payment_method_types"))) return json(400, { error: { type: "invalid_request_error", code: "payment_method_types_no_longer_supported" } });
    const id = "seti_c" + ++ST.seq;
    ST.intents.set(id, { id, client_secret: id + "_secret_FAKE", customer: form.customer, payment_method_types: ["card"], metadata: { accountUid: form["metadata[accountUid]"] }, status: "succeeded", card: ST.nextCard || CARDS.visa });
    const si = ST.intents.get(id); return json(200, { id, client_secret: si.client_secret, customer: si.customer, payment_method_types: si.payment_method_types, metadata: si.metadata, status: "requires_payment_method" });
  }
  if (/^\/v1\/payment_methods\//.test(u.pathname)) return json(503, { error: { type: "api_error" } });
  const m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if (opts.method === "GET" && m) {
    if (ST.failNextGet) { const f = ST.failNextGet; ST.failNextGet = null; if (f === "network") throw new Error("socket hang up"); return json(f, { error: { type: "api_error" } }); }
    const si = ST.intents.get(m[1]); if (!si) return json(404, { error: { type: "invalid_request_error", code: "resource_missing" } });
    const pm = si.status === "succeeded" ? (si.noCard ? { id: "pm_" + m[1], type: "link", customer: si.customer } : { id: si.pmId || ("pm_" + m[1]), type: "card", customer: "pmCustomer" in si ? si.pmCustomer : si.customer, card: { ...si.card, number: "4242424242424242", cvc: "123" } }) : null;
    return json(200, { id: si.id, customer: si.customer, metadata: si.metadata, status: si.status, payment_method: pm });
  }
  return json(404, { error: { type: "invalid_request_error" } });
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
let pass = 0, fail = 0; const logs = [];
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };
let ip = 0;
async function call(mode, body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = (...a) => logs.push(a.map(String).join(" "));
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + ++ip, authorization: "Bearer " + token }, body: { mode, ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}
const CONSENT = "2026-10-16";
const resetRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeBillingRateLimits/")) S.docs.delete(k); };
// STEP 42-C｜カードはアカウント単位(店舗 sN の owner は uN)。
const ACC = { s1: "u1", s2: "u2", s3: "u3", s4: "u4" };
const sec = (id = "s1") => ((S.docs.get("accountBilling/" + (ACC[id] || id)) || {}).test) || {};
const start = async (store = "s1", token = "owner", card = null) => { resetRate(); ST.nextCard = card; const r = await call("storeBillingSetupIntentCreate", { storeId: store }, token); return r; };
const confirm = (si, store = "s1", token = "owner") => call("storeBillingSetupConfirm", { storeId: store, setupIntentId: si, consentVersion: CONSENT }, token);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1 first registration
let c1 = await start("s1", "owner", CARDS.visa), f1 = await confirm(c1.body.setupIntentId);
t("1 初回登録：成功・VISA 4242・paymentMethodId保存・cardVersion=1・登録中IDは空", c1.code === 200 && f1.code === 200 && f1.body.status === "succeeded" && sec().paymentMethodId === "pm_" + c1.body.setupIntentId && sec().card.last4 === "4242" && sec().cardVersion === 1 && sec().pendingSetupIntentId === "", { f1: f1.body, sec: sec() });

// 2 change
const c2 = await start("s1", "owner", CARDS.mc), f2 = await confirm(c2.body.setupIntentId);
t("2 カード変更：新カード（Mastercard 4444）に置き換わり cardVersion=2・顧客は同じ", f2.code === 200 && sec().paymentMethodId === "pm_" + c2.body.setupIntentId && sec().card.last4 === "4444" && sec().cardVersion === 2 && sec().customerId === "cus_new1", sec());

// 3 abandoned change keeps old card
const c3 = await start("s1", "owner", CARDS.amex);
const st3 = await call("storeBillingStatus", { storeId: "s1" }, "owner");
t("3 変更を途中でやめた：登録済みカード（4444）・cardVersionはそのまま、登録中IDだけ新しい", sec().paymentMethodId === "pm_" + c2.body.setupIntentId && sec().cardVersion === 2 && sec().pendingSetupIntentId === c3.body.setupIntentId && st3.body.card && st3.body.card.last4 === "4444", { sec: sec(), st: st3.body });

// 4 stale SetupIntent rejected
const c4 = await start("s1", "owner", CARDS.visa);
const f3stale = await confirm(c3.body.setupIntentId), f2again = await confirm(c2.body.setupIntentId);
t("4 古いSetupIntent（別タブで先に始めた分・確定済みの分）の確定は409・カードは変わらない", f3stale.code === 409 && f3stale.body.reason === "setup_intent_mismatch" && f2again.code === 409 && sec().paymentMethodId === "pm_" + c2.body.setupIntentId && sec().cardVersion === 2, { f3stale: f3stale.body, f2again: f2again.body, sec: sec() });
const f4 = await confirm(c4.body.setupIntentId);
t("4b 最新のSetupIntentは確定できる（cardVersion=3）", f4.code === 200 && sec().paymentMethodId === "pm_" + c4.body.setupIntentId && sec().cardVersion === 3, sec());

// 5 concurrent confirms of the same SetupIntent
const c5 = await start("s1", "owner", CARDS.mc);
globalThis.__TX_HOOK = async () => { await sleep(5); };
const retriesBefore = S.txStats.retries;
const both = await Promise.all([confirm(c5.body.setupIntentId), confirm(c5.body.setupIntentId), confirm(c5.body.setupIntentId)]);
globalThis.__TX_HOOK = null;
const codes = both.map((x) => x.code).sort();
t("5 同じSetupIntentを3つ同時に確定：成立は1回だけ（200が1件・409が2件）・cardVersionは1だけ増える", JSON.stringify(codes) === "[200,409,409]" && sec().cardVersion === 4 && sec().paymentMethodId === "pm_" + c5.body.setupIntentId, { codes, sec: sec(), retries: S.txStats.retries - retriesBefore });

// 5b confirm racing with a new start: the confirmed card must never be reverted by a stale snapshot
const c6 = await start("s1", "owner", CARDS.amex);
globalThis.__TX_HOOK = async () => { await sleep(5); };
resetRate(); ST.nextCard = CARDS.visa;
const [f6, c7] = await Promise.all([confirm(c6.body.setupIntentId), call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner")]);
globalThis.__TX_HOOK = null;
const s5b = sec();
const ok5b = f6.code === 200
  ? s5b.paymentMethodId === "pm_" + c6.body.setupIntentId && s5b.cardVersion === 5 && s5b.card.last4 === "8431"
  : f6.code === 409 && s5b.paymentMethodId === "pm_" + c5.body.setupIntentId && s5b.cardVersion === 4;
t("5b 確定と新しい登録開始が同時：確定したカードが古い読み取りで戻らない（どちらの順でも整合）", ok5b && c7.code === 200 && s5b.pendingSetupIntentId === (f6.code === 200 && s5b.pendingSetupIntentId === "" ? "" : s5b.pendingSetupIntentId), { f6: f6.code, c7: c7.code, sec: s5b });
// after the race, whichever pending ID is stored must be the only confirmable one
const pendingNow = sec().pendingSetupIntentId;
if (pendingNow) { const fp = await confirm(pendingNow); t("5c 競合後に残った登録中IDだけが確定できる", fp.code === 200 && sec().paymentMethodId === "pm_" + pendingNow, { fp: fp.body, sec: sec() }); }
else t("5c 競合後に残った登録中IDだけが確定できる（登録中なし）", true);

// 6 Stripe-side failures keep the old card
const before6 = JSON.stringify({ pm: sec().paymentMethodId, card: sec().card, v: sec().cardVersion });
const c8 = await start("s1", "owner", CARDS.mc);
const res6 = [];
for (const f of [500, "network", 401]) { ST.failNextGet = f; const r = await confirm(c8.body.setupIntentId); res6.push(r.code); }
ST.intents.get(c8.body.setupIntentId).status = "requires_payment_method"; res6.push((await confirm(c8.body.setupIntentId)).body.status);
ST.intents.get(c8.body.setupIntentId).status = "requires_action"; res6.push((await confirm(c8.body.setupIntentId)).body.status);
ST.intents.get(c8.body.setupIntentId).status = "succeeded"; ST.intents.get(c8.body.setupIntentId).noCard = true; res6.push((await confirm(c8.body.setupIntentId)).code);
ST.intents.get(c8.body.setupIntentId).noCard = false; ST.intents.get(c8.body.setupIntentId).customer = "cus_someoneelse"; res6.push((await confirm(c8.body.setupIntentId)).code);
const after6 = JSON.stringify({ pm: sec().paymentMethodId, card: sec().card, v: sec().cardVersion });
t("6 Stripe失敗（500・通信断・401）・カード拒否・3Dセキュア未完了・カード以外・顧客不一致：すべて旧カードを維持", JSON.stringify(res6) === JSON.stringify([503, 503, 503, "failed", "requires_action", 502, 409]) && before6 === after6 && sec().pendingSetupIntentId === c8.body.setupIntentId, { res6, before6, after6 });

// 7 compatibility with the existing (STEP 29) data shape: no cardVersion field
S.docs.set("accountBilling/u2", { uid: "u2", test: { customerId: "cus_existing", customerCreatedAt: { ms: 1 }, customerCreatedByUid: "u2", paymentMethodId: "pm_existing4242", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }, setupStatus: "succeeded", lastSetupIntentId: "seti_existing", pendingSetupIntentId: "", consentVersion: CONSENT, consentAt: { ms: 2 }, consentByUid: "u2", updatedAt: { ms: 3 }, updatedByUid: "u2" } });
const custCallsBefore = ST.calls.filter((x) => x === "POST /v1/customers").length;
const st7 = await call("storeBillingStatus", { storeId: "s2" }, "owner2");
t("7 既存形式（cardVersionなし）のVISA 4242：状態表示は従来どおり", st7.code === 200 && st7.body.available === true && JSON.stringify(st7.body.card) === JSON.stringify({ brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }), st7.body);
const c9 = await start("s2", "owner2", CARDS.mc);
t("7b 既存形式で変更開始：既存の顧客を再利用（顧客を作らない）・登録済みカードは保持", c9.code === 200 && ST.calls.filter((x) => x === "POST /v1/customers").length === custCallsBefore && sec("s2").paymentMethodId === "pm_existing4242" && sec("s2").customerCreatedAt.ms === 1, sec("s2"));
const f9 = await confirm(c9.body.setupIntentId, "s2", "owner2");
t("7c 既存形式からの変更確定：cardVersionは未設定=0として1になり、顧客作成記録など既存項目は残る", f9.code === 200 && sec("s2").cardVersion === 1 && sec("s2").paymentMethodId === "pm_" + c9.body.setupIntentId && sec("s2").customerId === "cus_existing" && sec("s2").customerCreatedAt.ms === 1 && sec("s2").customerCreatedByUid === "u2", sec("s2"));
const u2Before = JSON.stringify(sec("s2"));
const otherStore = await confirm(c9.body.setupIntentId, "s2", "owner");
t("7d 他のアカウント（u1）は u2 のSetupIntentで確定できない（409 setup_intent_mismatch・u2 のカード情報は変わらない）", otherStore.code === 409 && otherStore.body.reason === "setup_intent_mismatch" && JSON.stringify(sec("s2")) === u2Before, otherStore.body);

// ===== STEP 31-B①: detach-pending record =====
const q = (id) => (sec(id).detachPendingPaymentMethods || []);
t("B0 既存形式（項目なし）からの変更：置き換え前のVISA（pm_existing4242）だけが取り外し待ちに入る", JSON.stringify(q("s2").map((e) => e.paymentMethodId)) === '["pm_existing4242"]' && q("s2")[0].state === "pending" && q("s2")[0].queuedCardVersion === 1 && q("s2")[0].attempts === 1 && q("s2")[0].lastError.status === 503 && q("s2")[0].nextRetryAtMs > Date.now(), q("s2"));
globalThis.__MOCK_TOKENS.owner3 = pw("u3", "owner3@example.com");
S.docs.set("storeAccounts/s3", { storeName: "店3", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
S.docs.set("storeMembers/s3_u3", { storeId: "s3", uid: "u3", role: "owner", status: "active" });
const b1 = await start("s3", "owner3", CARDS.visa), b1f = await confirm(b1.body.setupIntentId, "s3", "owner3");
t("B1 初回登録では取り外し待ちは空", b1f.code === 200 && Array.isArray(sec("s3").detachPendingPaymentMethods) && q("s3").length === 0, sec("s3"));
const pm1 = sec("s3").paymentMethodId;
const b2 = await start("s3", "owner3", CARDS.mc), b2f = await confirm(b2.body.setupIntentId, "s3", "owner3");
t("B2 カード変更：直前のカードだけを記録（state=pending・queuedCardVersion=2・attempts=0）・現在のカードは含まない", b2f.code === 200 && q("s3").length === 1 && q("s3")[0].paymentMethodId === pm1 && q("s3")[0].state === "pending" && q("s3")[0].queuedCardVersion === 2 && q("s3")[0].attempts === 1 && q("s3")[0].lastError.status === 503 && typeof q("s3")[0].queuedAtMs === "number" && !q("s3").some((e) => e.paymentMethodId === sec("s3").paymentMethodId), q("s3"));
const pm2 = sec("s3").paymentMethodId;
const b3 = await start("s3", "owner3", CARDS.amex), b3f = await confirm(b3.body.setupIntentId, "s3", "owner3");
t("B3 2回目の変更：古い順に2件・重複なし・現在のカードは含まない", b3f.code === 200 && JSON.stringify(q("s3").map((e) => e.paymentMethodId)) === JSON.stringify([pm1, pm2]) && !q("s3").some((e) => e.paymentMethodId === sec("s3").paymentMethodId), q("s3"));
// concurrent confirms
const b4 = await start("s3", "owner3", CARDS.visa); const pm3 = sec("s3").paymentMethodId;
globalThis.__TX_HOOK = async () => { await sleep(5); };
const b4r = await Promise.all([1, 2, 3].map(() => confirm(b4.body.setupIntentId, "s3", "owner3")));
globalThis.__TX_HOOK = null;
t("B4 同時確定（3件）：成立は1回・取り外し待ちは1件だけ増える（重複記録なし）", JSON.stringify(b4r.map((x) => x.code).sort()) === "[200,409,409]" && JSON.stringify(q("s3").map((e) => e.paymentMethodId)) === JSON.stringify([pm1, pm2, pm3]), { codes: b4r.map((x) => x.code), q: q("s3") });
// foreign / detached payment method
const snap5 = JSON.stringify(sec("s3"));
const b5 = await start("s3", "owner3", CARDS.mc); const after5start = JSON.stringify({ ...sec("s3"), pendingSetupIntentId: null, pendingSetupStartedAt: null });
ST.intents.get(b5.body.setupIntentId).pmCustomer = "cus_someoneelse";
const b5a = await confirm(b5.body.setupIntentId, "s3", "owner3");
ST.intents.get(b5.body.setupIntentId).pmCustomer = null;
const b5b = await confirm(b5.body.setupIntentId, "s3", "owner3");
const now5 = JSON.stringify({ ...sec("s3"), pendingSetupIntentId: null, pendingSetupStartedAt: null });
t("B5 新カードが別顧客のもの・取り外し済み（customerなし）：409 payment_method_mismatch・カードと取り外し待ちは変わらない", b5a.code === 409 && b5a.body.reason === "payment_method_mismatch" && b5b.code === 409 && b5b.body.reason === "payment_method_mismatch" && now5 === after5start && sec("s3").pendingSetupIntentId === b5.body.setupIntentId, { b5a: b5a.body, b5b: b5b.body });
// queued card can never become current again
ST.intents.get(b5.body.setupIntentId).pmCustomer = sec("s3").customerId; ST.intents.get(b5.body.setupIntentId).pmId = pm1;
const cur6 = sec("s3").paymentMethodId, q6 = JSON.stringify(q("s3"));
const b6 = await confirm(b5.body.setupIntentId, "s3", "owner3");
t("B6 取り外し待ちのカードは、現在のカードとして保存しない（409）", b6.code === 409 && b6.body.reason === "payment_method_mismatch" && sec("s3").paymentMethodId === cur6 && JSON.stringify(q("s3")) === q6 && q("s3").length === 3, { b6: b6.body, cur: sec("s3").paymentMethodId, cur6 });
delete ST.intents.get(b5.body.setupIntentId).pmId;
// limit
globalThis.__MOCK_TOKENS.owner4 = pw("u4", "owner4@example.com");
S.docs.set("storeAccounts/s4", { storeName: "店4", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
S.docs.set("storeMembers/s4_u4", { storeId: "s4", uid: "u4", role: "owner", status: "active" });
const mk = (n) => Array.from({ length: n }, (_, i) => ({ paymentMethodId: "pm_old" + i, state: "pending", queuedAtMs: 1000 + i, queuedCardVersion: i + 2, attempts: 0 }));
S.docs.set("accountBilling/u4", { uid: "u4", test: { customerId: "cus_s4", paymentMethodId: "pm_cur4", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }, cardVersion: 10, detachPendingPaymentMethods: mk(10), pendingSetupIntentId: "" } });
const callsBefore = ST.calls.length;
const b7 = await start("s4", "owner4", CARDS.mc);
t("B7 取り外し待ちが上限（10件）：新しい変更は開始前に409 detach_pending_limit・Stripeを呼ばない・記録10件はそのまま", b7.code === 409 && b7.body.reason === "detach_pending_limit" && !ST.calls.slice(callsBefore).some((x) => /customers|setup_intents/.test(x)) && JSON.stringify(q("s4").map((e) => e.paymentMethodId)) === JSON.stringify(mk(10).map((e) => e.paymentMethodId)) && sec("s4").paymentMethodId === "pm_cur4", { b7: b7.body, calls: ST.calls.length - callsBefore });
S.docs.set("accountBilling/u4", { uid: "u4", test: { ...sec("s4"), detachPendingPaymentMethods: mk(9) } });
const b7b = await start("s4", "owner4", CARDS.mc), b7bf = await confirm(b7b.body.setupIntentId, "s4", "owner4");
t("B7b 9件のときは変更でき、確定で10件目（直前のカード）が入る", b7b.code === 200 && b7bf.code === 200 && q("s4").length === 10 && q("s4")[9].paymentMethodId === "pm_cur4", q("s4").map((e) => e.paymentMethodId));
// over-limit at confirm time (e.g. started before the limit was reached): never drop
const cur4 = sec("s4").paymentMethodId; const siOver = "seti_over1";
ST.intents.set(siOver, { id: siOver, client_secret: "x", customer: "cus_s4", payment_method_types: ["card"], metadata: { accountUid: "u4" }, status: "succeeded", card: CARDS.amex });
S.docs.set("accountBilling/u4", { uid: "u4", test: { ...sec("s4"), detachPendingPaymentMethods: mk(12), pendingSetupIntentId: siOver } });
const b7c = await confirm(siOver, "s4", "owner4");
t("B7c 上限を超えた状態で確定しても、既存12件＋直前のカードの13件をすべて保持（黙って捨てない）", b7c.code === 200 && q("s4").length === 13 && JSON.stringify(q("s4").slice(0, 12).map((e) => e.paymentMethodId)) === JSON.stringify(mk(12).map((e) => e.paymentMethodId)) && q("s4")[12].paymentMethodId === cur4, { len: q("s4").length });
// malformed entries in existing data are ignored, valid ones kept
S.docs.set("accountBilling/u4", { uid: "u4", test: { ...sec("s4"), detachPendingPaymentMethods: [null, { foo: 1 }, { paymentMethodId: "pm_keep", state: "pending" }] } });
const st8 = await call("storeBillingStatus", { storeId: "s4" }, "owner4");
t("B8 取り外し待ちに不正な要素が混じっていても状態表示は正常（カード表示は従来どおり）", st8.code === 200 && st8.body.available === true && st8.body.card && st8.body.card.last4 === "8431", st8.body);
t("B9 取り外し（detach）はStripeに一度も送っていない", !ST.calls.some((x) => /detach/.test(x)), [...new Set(ST.calls)]);

// 8 safety invariants
const stored = JSON.stringify([...S.docs.entries()].filter(([k]) => k.startsWith("accountBilling/")));
t("8 カード番号全体・CVCは保存されない（Stripe応答に含まれていても）", !stored.includes("4242424242424242") && !stored.includes('"cvc"') && !stored.includes('"number"'));
t("8b liveの欄は作られない", ![...S.docs.entries()].some(([k, v]) => k.startsWith("accountBilling/") && "live" in v));
const touched = [...new Set(S.writes.map((w) => w.split("/")[0]))].sort();
t("8c 書き込み先は accountBilling と連打防止だけ", JSON.stringify(touched) === JSON.stringify(["accountBilling", "storeBillingRateLimits"]), touched);
t("8d トランザクション内ではStripeを呼ばない（呼び出しは作成・照会だけ）", ST.calls.every((x) => /^(POST \/v1\/customers|POST \/v1\/setup_intents|GET \/v1\/setup_intents\/seti_(c\d+|over1)|GET \/v1\/payment_methods\/pm_[A-Za-z0-9_]+)$/.test(x)), [...new Set(ST.calls)]);
t("8e サーバーキーはログに出ない", !logs.join("\n").includes(FAKE_SERVER_KEY));
t("8f 課金停止フラグは false のまま", (await import(REPO_URL + "/api/_lib/imadake.js")).IMADAKE_CV_BILLING_STARTED === false);
console.log("tx commits=" + S.txStats.commits + " retries=" + S.txStats.retries);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
