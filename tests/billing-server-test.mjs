// STEP 31 server: store card setup (Stripe SetupIntent) through the REAL moderate-submission handler on mocked
// firebase-admin, with an in-memory Stripe stub. No network, no real Stripe, no real data. Keys below are fake strings.
// run: node --import ./mockfa/register.mjs billing-server-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001";
const FAKE_PUBLISHABLE = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const pw = (uid, email, verified = true) => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { owner: pw("u1", "owner@example.com"), other: pw("u2", "other@example.com"), editor: pw("u5", "ed@example.com"), unverified: pw("u1", "owner@example.com", false), anon: { uid: "a1", firebase: { sign_in_provider: "anonymous" } } };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const seedStores = () => {
  S.docs.set("storeAccounts/s1", { storeName: "店1", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
  S.docs.set("storeAccounts/s2", { storeName: "店2", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
  S.docs.set("storeAccounts/s3", { storeName: "停止店", enabled: false, createdByType: "storeUser", registrationStatus: "active" });
  S.docs.set("storeMembers/s1_u1", { storeId: "s1", uid: "u1", role: "owner", status: "active" });
  S.docs.set("storeMembers/s2_u2", { storeId: "s2", uid: "u2", role: "owner", status: "active" });
  S.docs.set("storeMembers/s3_u1", { storeId: "s3", uid: "u1", role: "owner", status: "active" });
  S.docs.set("storeMembers/s1_u5", { storeId: "s1", uid: "u5", role: "editor", status: "active" });
};
seedStores();
// ---- Stripe stub ----
const ST = { calls: [], customers: new Map(), idem: new Map(), intents: new Map(), seq: 0, failNext: null, dashboardTypes: ["card", "link", "konbini"], forceTypes: null, siStatus: "succeeded", pmCard: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030, number: "4242424242424242", cvc: "123" } };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== "api.stripe.com") throw new Error("unexpected fetch " + url);
  const auth = (opts.headers || {}).Authorization || "";
  const idem = (opts.headers || {})["Idempotency-Key"] || "";
  const form = Object.fromEntries(new URLSearchParams(opts.body || ""));
  ST.calls.push({ method: opts.method, path: u.pathname, auth, idem, form, query: u.search });
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (ST.failNext) { const f = ST.failNext; ST.failNext = null; if (f === "network") throw new Error("socket hang up"); return json(f, { error: { type: f === 401 ? "invalid_request_error" : "api_error", message: "secret detail " + FAKE_SERVER_KEY, code: f === 402 ? "card_declined" : "" } }); }
  if (auth !== "Bearer " + FAKE_SERVER_KEY) return json(401, { error: { type: "invalid_request_error", message: "bad key" } });
  if (opts.method === "POST" && u.pathname === "/v1/customers") {
    if (idem && ST.idem.has(idem)) return json(200, ST.customers.get(ST.idem.get(idem)));
    const id = "cus_test" + ++ST.seq; const c = { id, metadata: { storeId: form["metadata[storeId]"], machinauMode: form["metadata[machinauMode]"] } };
    ST.customers.set(id, c); if (idem) ST.idem.set(idem, id); return json(200, c);
  }
  if (opts.method === "POST" && u.pathname === "/v1/setup_intents") {
    // 現行Stripe API(2026-08-26以降)の挙動：payment_method_typesは400、allowed_payment_method_typesはダッシュボードで有効な手段に絞る
    if (Object.keys(form).some((k) => k.startsWith("payment_method_types"))) return json(400, { error: { type: "invalid_request_error", code: "payment_method_types_no_longer_supported", message: "The `payment_method_types` parameter is no longer supported." } });
    const allowed = Object.entries(form).filter(([k]) => k === "allowed_payment_method_types[]").map(([, v]) => v);
    const computed = ST.forceTypes || (allowed.length ? ST.dashboardTypes.filter((x) => allowed.includes(x)) : ST.dashboardTypes.slice());
    const id = "seti_test" + ++ST.seq; const si = { id, client_secret: id + "_secret_FAKE", customer: form.customer, usage: form.usage, payment_method_types: computed, metadata: { storeId: form["metadata[storeId]"] }, status: "requires_payment_method" };
    ST.intents.set(id, si); return json(200, si);
  }
  const m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if (opts.method === "GET" && m) {
    const si = ST.intents.get(m[1]); if (!si) return json(404, { error: { type: "invalid_request_error", code: "resource_missing" } });
    return json(200, { ...si, status: ST.siStatus, payment_method: ST.siStatus === "succeeded" ? { id: "pm_test" + m[1], type: "card", customer: si.customer, card: ST.pmCard } : null });
  }
  return json(404, { error: { type: "invalid_request_error" } });
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
let pass = 0, fail = 0; const logs = [];
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 400) : ""}`); };
let ip = 0;
async function call(mode, body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error, l = console.log; console.error = (...a) => logs.push(a.map(String).join(" ")); console.log = (...a) => logs.push(a.map(String).join(" "));
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + ++ip, ...(token ? { authorization: "Bearer " + token } : {}) }, body: { mode, ...body }, query: {} }, r); } finally { console.error = e; console.log = l; }
  return r;
}
const setEnv = (o) => { for (const k of ["STRIPE_MODE", "STRIPE_RESTRICTED_KEY", "STRIPE_PUBLISHABLE_KEY", "VERCEL_ENV"]) delete process.env[k]; Object.assign(process.env, o); };
const TEST_ENV = { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE, VERCEL_ENV: "preview" };
const billing = (id = "s1") => S.docs.get("storeBilling/" + id);
const resetRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeBillingRateLimits/")) S.docs.delete(k); };

// 1-3 safe stop
setEnv({});
let st = await call("storeBillingStatus", { storeId: "s1" }, "owner"), cr = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner");
t("1 キー未設定：状態はavailable:false（not_configured）・作成は503・Stripeを呼ばない", st.code === 200 && st.body.available === false && st.body.unavailableReason === "not_configured" && cr.code === 503 && cr.body.reason === "billing_unavailable" && ST.calls.length === 0, [st.body, cr.body]);
setEnv({ ...TEST_ENV, VERCEL_ENV: "production" });
st = await call("storeBillingStatus", { storeId: "s1" }, "owner"); cr = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner");
t("2 Production（VERCEL_ENV=production）ではテストキーがあっても無効（disabled_in_production）・Stripeを呼ばない", st.body.available === false && st.body.unavailableReason === "disabled_in_production" && cr.code === 503 && ST.calls.length === 0, [st.body, cr.body]);
const mixes = [[{ ...TEST_ENV, STRIPE_MODE: "live" }, "mode_not_allowed"], [{ ...TEST_ENV, STRIPE_RESTRICTED_KEY: "sk_" + "live_FAKE0000" }, "key_mode_mismatch"], [{ ...TEST_ENV, STRIPE_RESTRICTED_KEY: "rk_" + "live_FAKE0000" }, "key_mode_mismatch"], [{ ...TEST_ENV, STRIPE_PUBLISHABLE_KEY: "pk_" + "live_FAKE0000" }, "key_mode_mismatch"], [{ ...TEST_ENV, STRIPE_MODE: "" }, "not_configured"]];
const mixRes = [];
for (const [env, reason] of mixes) { setEnv(env); const a = await call("storeBillingStatus", { storeId: "s1" }, "owner"); const b = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner"); mixRes.push([a.body.unavailableReason, b.code, reason]); }
t("3 テスト・本番の取り違え（live指定・sk_live_/rk_live_/pk_live_・モード未設定）はすべて停止・Stripeを呼ばない", mixRes.every(([r, c, exp]) => r === exp && c === 503) && ST.calls.length === 0, mixRes);

// 4 auth
setEnv(TEST_ENV);
const authRes = [await call("storeBillingSetupIntentCreate", { storeId: "s1" }, null), await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "anon"), await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "unverified"), await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "other"), await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "editor"), await call("storeBillingSetupIntentCreate", { storeId: "s3" }, "owner"), await call("storeBillingSetupIntentCreate", { storeId: "../s1" }, "owner"), await call("storeBillingStatus", { storeId: "s2" }, "owner")];
t("4 未ログイン401・匿名403・メール未確認403・他店のowner404・editor404・停止中の店403・不正なstoreId400・他店の状態404・Stripeを呼ばない", JSON.stringify(authRes.map((x) => x.code)) === "[401,403,403,404,404,403,400,404]" && ST.calls.length === 0, authRes.map((x) => [x.code, x.body.reason]));

// 5 create
cr = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner");
const custCall = ST.calls.find((c) => c.path === "/v1/customers"), siCall = ST.calls.find((c) => c.path === "/v1/setup_intents");
t("5 ownerのカード登録開始：Stripe顧客を作成（冪等キー付き）→SetupIntent（off_session・カードのみ・storeId）→client_secretと公開可能キーを返す", cr.code === 200 && cr.body.clientSecret.endsWith("_secret_FAKE") && cr.body.publishableKey === FAKE_PUBLISHABLE && custCall && custCall.idem === "machinau-customer-test-s1" && siCall.form.usage === "off_session" && siCall.form["allowed_payment_method_types[]"] === "card" && !Object.keys(siCall.form).some((k) => k.startsWith("payment_method_types")) && siCall.form["metadata[storeId]"] === "s1", { body: cr.body, custCall, siCall });
t("5c 現行APIで廃止された payment_method_types は送らない／Stripeが計算した手段はカードだけ（ダッシュボードでLink・コンビニが有効でも）", !ST.calls.some((c) => Object.keys(c.form).some((k) => k.startsWith("payment_method_types"))) && JSON.stringify(ST.intents.get(cr.body.setupIntentId).payment_method_types) === '["card"]', ST.intents.get(cr.body.setupIntentId));
let b = billing() || {};
t("5b 保存：storeBilling/s1 の test にだけ顧客IDと登録中のSetupIntent（liveは作らない）", b.test && b.test.customerId === "cus_test1" && b.test.pendingSetupIntentId === cr.body.setupIntentId && !("live" in b), b);
const cr2 = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner");
t("6 10秒以内の連続作成は429（連打防止）", cr2.code === 429 && cr2.body.reason === "rate_limited", cr2.body);
resetRate(); const custBefore = ST.calls.filter((c) => c.path === "/v1/customers").length;
const cr3 = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner");
t("6b 2回目の登録開始は既存の顧客を使う（顧客を重複作成しない）", cr3.code === 200 && ST.calls.filter((c) => c.path === "/v1/customers").length === custBefore && billing().test.customerId === "cus_test1" && billing().test.pendingSetupIntentId === cr3.body.setupIntentId, { cr3: cr3.body, b: billing() });
// duplicate prevention under a lost customerId (simulated retry): idempotency key returns the same customer
S.docs.set("storeBilling/s1", { storeId: "s1", test: { pendingSetupIntentId: cr3.body.setupIntentId } }); resetRate();
const cr4 = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner");
t("6c 保存前に途切れた再試行でも、冪等キーで同じStripe顧客になる（重複顧客なし）", cr4.code === 200 && billing().test.customerId === "cus_test1" && ST.customers.size === 1, { customers: ST.customers.size, b: billing() });

// 7-10 confirm
const CONSENT = "2026-10-16";
let cf = await call("storeBillingSetupConfirm", { storeId: "s1", setupIntentId: cr4.body.setupIntentId }, "owner");
t("7 同意なしの登録確定は400（consent_required）", cf.code === 400 && cf.body.reason === "consent_required");
cf = await call("storeBillingSetupConfirm", { storeId: "s1", setupIntentId: cr.body.setupIntentId, consentVersion: CONSENT }, "owner");
t("8 登録中ではない（古い）SetupIntentは409", cf.code === 409 && cf.body.reason === "setup_intent_mismatch", cf.body);
ST.siStatus = "requires_action";
cf = await call("storeBillingSetupConfirm", { storeId: "s1", setupIntentId: cr4.body.setupIntentId, consentVersion: CONSENT }, "owner");
t("9 3Dセキュアが必要（requires_action）→保存せず状態を返す", cf.code === 200 && cf.body.status === "requires_action" && !billing().test.paymentMethodId, cf.body);
ST.siStatus = "requires_payment_method";
cf = await call("storeBillingSetupConfirm", { storeId: "s1", setupIntentId: cr4.body.setupIntentId, consentVersion: CONSENT }, "owner");
t("10 認証失敗・カード拒否（requires_payment_method）→failed・保存しない", cf.body.status === "failed" && !billing().test.paymentMethodId, cf.body);
ST.siStatus = "succeeded";
const otherConfirm = await call("storeBillingSetupConfirm", { storeId: "s1", setupIntentId: cr4.body.setupIntentId, consentVersion: CONSENT }, "other");
t("11 他人は登録確定できない（404）", otherConfirm.code === 404);
cf = await call("storeBillingSetupConfirm", { storeId: "s1", setupIntentId: cr4.body.setupIntentId, consentVersion: CONSENT }, "owner");
b = billing();
t("12 登録成功：サーバーがStripeに照会して確認→ブランド・下4桁・有効期限だけ保存・同意を記録", cf.code === 200 && cf.body.status === "succeeded" && JSON.stringify(cf.body.card) === JSON.stringify({ brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }) && b.test.paymentMethodId === "pm_test" + cr4.body.setupIntentId && b.test.consentVersion === CONSENT && b.test.pendingSetupIntentId === "" && b.test.customerId === "cus_test1", { body: cf.body, b });
const stored = JSON.stringify(S.docs.get("storeBilling/s1"));
t("13 カード番号・セキュリティコードは保存しない（Stripe応答に含まれていても）", !stored.includes("4242424242424242") && !stored.includes('"cvc"') && !stored.includes('"number"'), stored.slice(0, 300));
const getCall = ST.calls.filter((c) => c.method === "GET").pop();
t("13b 照会はexpand[]=payment_methodでSetupIntentを取得", getCall && decodeURIComponent(getCall.query).includes("expand[]=payment_method"), getCall);
st = await call("storeBillingStatus", { storeId: "s1" }, "owner");
t("14 状態取得：登録済みカードの表示情報を返す", st.body.available === true && st.body.card && st.body.card.last4 === "4242" && st.body.mode === "test", st.body);
// customer mismatch from Stripe
resetRate(); const cr5 = await call("storeBillingSetupIntentCreate", { storeId: "s1" }, "owner");
ST.intents.get(cr5.body.setupIntentId).customer = "cus_someoneelse";
cf = await call("storeBillingSetupConfirm", { storeId: "s1", setupIntentId: cr5.body.setupIntentId, consentVersion: CONSENT }, "owner");
t("15 Stripe上の顧客が一致しないSetupIntentは409（他人の登録を取り込まない）", cf.code === 409 && cf.body.reason === "setup_intent_mismatch", cf.body);

// 16 Stripe errors
const errs = [];
for (const f of [500, 401, "network", 402]) { resetRate(); ST.failNext = f; const r = await call("storeBillingSetupIntentCreate", { storeId: "s2" }, "other"); errs.push([f, r.code, r.body.reason]); }
t("16 Stripeのエラー：500→503 stripe_unavailable、401→503 stripe_auth_failed、通信失敗→503、402→502", JSON.stringify(errs) === JSON.stringify([[500, 503, "stripe_unavailable"], [401, 503, "stripe_auth_failed"], ["network", 503, "stripe_unavailable"], [402, 502, "stripe_request_failed"]]), errs);
// 16b card-only guard
const guard = [];
for (const [force, dash] of [[["card", "link"], null], [null, ["link", "konbini"]], [[], null]]) {
  resetRate(); ST.forceTypes = force; if (dash) ST.dashboardTypes = dash;
  const before = String(((S.docs.get("storeBilling/s2") || {}).test || {}).pendingSetupIntentId || "");
  const r = await call("storeBillingSetupIntentCreate", { storeId: "s2" }, "other");
  guard.push([r.code, r.body.reason, !r.body.clientSecret, String(((S.docs.get("storeBilling/s2") || {}).test || {}).pendingSetupIntentId || "") === before ? "unchanged" : "changed"]);
  ST.forceTypes = null; ST.dashboardTypes = ["card", "link", "konbini"];
}
t("16b カード以外が含まれる・カードが無効で空になる場合は502で止め、client_secretを返さず、登録中のSetupIntentも保存しない", guard.every((g) => g[0] === 502 && g[1] === "stripe_request_failed" && g[2] && g[3] === "unchanged"), guard);
resetRate(); const okAfter = await call("storeBillingSetupIntentCreate", { storeId: "s2" }, "other");
t("16c ダッシュボード設定が戻れば通常どおり作成できる", okAfter.code === 200 && okAfter.body.clientSecret, okAfter.body);
// 17 no secrets in logs/responses
const allLogs = logs.join("\n");
t("17 サーバーのキーはログにもエラー応答にも出ない（Stripeのエラー文に含まれていても）", !allLogs.includes(FAKE_SERVER_KEY) && !JSON.stringify(errs).includes("rk_test_"), allLogs.slice(0, 300));
t("17b Stripeへの要求はすべてサーバーのテストキーで認証（liveキーでの呼び出し0件）", ST.calls.every((c) => c.auth === "Bearer " + FAKE_SERVER_KEY || c.auth === ""), ST.calls.map((c) => c.auth.slice(0, 15)));
// 18 existing modes and data untouched
const my = await call("storeMyStores", {}, "owner");
t("18 既存の店舗一覧（storeMyStores）は従来どおり", my.code === 200 && my.body.success === true && my.body.stores.some((x) => x.storeId === "s1"), my.body);
const touched = [...new Set(S.writes.map((w) => w.split("/")[0]))].sort();
t("19 書き込み先は storeBilling と連打防止だけ（店舗情報・CV台帳・料金台帳は変更なし）", JSON.stringify(touched) === JSON.stringify(["storeBilling", "storeBillingRateLimits"]), touched);
t("20 課金停止フラグは false のまま", (await import(REPO_URL + "/api/_lib/imadake.js")).IMADAKE_CV_BILLING_STARTED === false);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
