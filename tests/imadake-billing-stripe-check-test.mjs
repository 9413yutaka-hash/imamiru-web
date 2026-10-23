// STEP 32-D⑩: read-only Stripe connection check (GET /v1/payment_intents?limit=1). REAL api/_lib/imadake-billing-admin.js and
// the REAL moderate-submission handler on mocked firebase-admin, in-memory Stripe stub (records every call). No network.
// run: node --import ./tests/mockfa-occ/register.mjs tests/imadake-billing-stripe-check-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const ENV = { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKECARDSETUPKEYONLY0001", STRIPE_CHARGE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview" };
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", "admin@example.com"), user: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

// ---- Stripe stub: ST.reply decides the answer of the next call ----
const ST = { calls: [], reply: "list1" };
const SECRET_PI = { id: "pi_SECRETID123", object: "payment_intent", amount: 500, currency: "jpy", customer: "cus_SECRET", payment_method: "pm_SECRET", status: "succeeded", livemode: false,
  client_secret: "pi_SECRETID123_secret_SHOULD_NOT_LEAK", billing_details: { name: "Taro Yamada", email: "taro@example.com" }, metadata: { invoiceId: "sa_2027-11" } };
const stripe = async (url, opts = {}) => {
  const u = new URL(String(url)); ST.calls.push({ method: opts.method, host: u.host, path: u.pathname, query: u.search, body: opts.body || null, idem: (opts.headers || {})["Idempotency-Key"] || null });
  const json = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  if ((opts.headers || {}).Authorization !== "Bearer " + FAKE_SERVER_KEY) return json(401, { error: { type: "invalid_request_error" } });
  if (opts.method !== "GET") return json(400, { error: { type: "invalid_request_error", code: "unexpected_method" } });
  switch (ST.reply) {
    case "list1": return json(200, { object: "list", data: [SECRET_PI], has_more: true, url: "/v1/payment_intents" });
    case "list0": return json(200, { object: "list", data: [], has_more: false, url: "/v1/payment_intents" });
    case "live": return json(200, { object: "list", data: [{ ...SECRET_PI, livemode: true }], has_more: false });
    case "401": return json(401, { error: { type: "invalid_request_error", message: "Invalid API Key provided: rk_test_****0001" } });
    case "403": return json(403, { error: { type: "invalid_request_error", code: "secret_key_required", message: "The provided key 'rk_test_***' does not have the required permissions for this endpoint" } });
    case "429": return json(429, { error: { type: "invalid_request_error", code: "rate_limit" } });
    case "500": return json(500, { error: { type: "api_error" } });
    case "network": throw new TypeError("fetch failed");
    case "notjson": return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } };
    case "notlist": return json(200, { object: "payment_intent", id: "pi_x" });
    case "wrongobject": return json(200, { object: "search_result", data: [], has_more: false });
    case "nohasmore": return json(200, { object: "list", data: [] });
    case "datanotarray": return json(200, { object: "list", data: "x", has_more: false });
    case "nolivemode": return json(200, { object: "list", data: [{ id: "pi_x", object: "payment_intent" }], has_more: false });
    case "errorbody": return json(200, { error: { type: "api_error" } });
    default: return json(404, { error: {} });
  }
};

const BA = await import(REPO_URL + "/api/_lib/imadake-billing-admin.js?v=" + Date.now());
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const deps = { fetch: stripe, env: ENV };
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
const NOW = Date.now();
const check = (reply, d = deps) => { ST.reply = reply; return BA.checkStripeReadConnection(d, NOW); };
const leaks = (r) => /pi_SECRETID123|_secret_|cus_SECRET|pm_SECRET|Taro|taro@example|rk_test_|pk_test_|FAKEKEY|Invalid API Key|does not have/.test(JSON.stringify(r));
const ALLOWED_KEYS = ["ok", "checkedAtMs", "connected", "testMode", "mode", "httpStatus", "sampleCount", "status", "configReason", "errorCode"];

// C1 success with one PaymentIntent
let r = await check("list1");
const c1 = ST.calls[ST.calls.length - 1];
t("C1 PaymentIntentが1件ある → connected・テスト環境・件数1", r.ok && r.status === "connected" && r.connected === true && r.testMode === true && r.mode === "test" && r.httpStatus === 200 && r.sampleCount === 1, r);
t("C1b 送るのは GET api.stripe.com/v1/payment_intents?limit=1 の1回だけ（本文・冪等キーなし）", ST.calls.length === 1 && c1.method === "GET" && c1.host === "api.stripe.com" && c1.path === "/v1/payment_intents" && c1.query === "?limit=1" && !c1.body && !c1.idem, c1);
t("C1c 応答にPaymentIntentのID・顧客・カード・client_secret・個人情報・キーを含めない", !leaks(r) && Object.keys(r).every((k) => ALLOWED_KEYS.includes(k)), r);

// C2 success with zero PaymentIntents
r = await check("list0");
t("C2 PaymentIntentが0件でも正常な一覧の応答なら connected（件数0）", r.status === "connected" && r.connected === true && r.testMode === true && r.sampleCount === 0, r);

// C3 401 / C4 403
r = await check("401");
t("C3 401 → unauthorized（接続できていない）・Stripeのメッセージやキーを返さない", r.status === "unauthorized" && r.connected === false && r.httpStatus === 401 && !leaks(r), r);
r = await check("403");
t("C4 403 → forbidden（権限不足）・エラーコードのみ・メッセージは返さない", r.status === "forbidden" && r.connected === false && r.httpStatus === 403 && r.errorCode === "secret_key_required" && !leaks(r), r);
t("C4b 401 と 403 を区別する", (await check("401")).status !== (await check("403")).status);

// C5 network / other errors
r = await check("network");
t("C5 通信失敗（例外・タイムアウト）→ network_error・httpStatus 0", r.status === "network_error" && r.connected === false && r.httpStatus === 0, r);
r = await check("429");
t("C5b 429 → rate_limited", r.status === "rate_limited" && r.connected === false, r);
r = await check("500");
t("C5c 500 → stripe_error", r.status === "stripe_error" && r.connected === false && r.httpStatus === 500, r);

// C6 malformed responses
const bad = {};
for (const k of ["notjson", "notlist", "wrongobject", "nohasmore", "datanotarray", "nolivemode", "errorbody"]) bad[k] = (await check(k)).status;
t("C6 応答の形が想定外（JSONでない・一覧でない・object が list 以外・has_moreなし・dataが配列でない・livemodeなし・200でerror）→ すべて invalid_response", Object.values(bad).every((s) => s === "invalid_response"), bad);
r = await check("notlist");
t("C6b 想定外の応答は connected にしない", r.connected === false, r);

// C7 test/live mix-up
r = await check("live");
t("C7 テスト用のキーなのに livemode:true が返る → mode_mismatch（接続成功にしない）", r.status === "mode_mismatch" && r.connected === false && r.testMode === true, r);

// C8 config gates (no Stripe call at all)
const before = ST.calls.length;
const gates = {
  production: (await check("list1", { ...deps, env: { ...ENV, VERCEL_ENV: "production" } })),
  liveMode: (await check("list1", { ...deps, env: { ...ENV, STRIPE_MODE: "live" } })),
  liveKey: (await check("list1", { ...deps, env: { ...ENV, STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "live_FAKE0000000000000001" } })),
  noKey: (await check("list1", { ...deps, env: { ...ENV, STRIPE_CHARGE_RESTRICTED_KEY: "" } }))
};
t("C8 Production では無効（stripe_disabled・disabled_in_production）・Stripeに接続しない", gates.production.status === "stripe_disabled" && gates.production.configReason === "disabled_in_production" && gates.production.connected === false, gates.production);
t("C8b STRIPE_MODE が test 以外・本番用キー・請求用キーなし → stripe_disabled（mode_not_allowed / key_mode_mismatch / charge_key_not_configured：STEP 43-M）",
  gates.liveMode.configReason === "mode_not_allowed" && gates.liveKey.configReason === "key_mode_mismatch" && gates.noKey.configReason === "charge_key_not_configured" && [gates.liveMode, gates.liveKey, gates.noKey].every((g) => g.status === "stripe_disabled" && !g.connected), gates);
t("C8c 設定が無効なときは Stripe への呼び出しゼロ", ST.calls.length === before, ST.calls.length - before);
t("C8d 無効時の応答にもキーを含めない", !leaks(gates), gates);

// C9 handler: auth, wiring (process.env + global fetch are what the real handler uses)
let ip = 0;
async function call(token, body = {}) {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body: { mode: "imadakeBillingStripeCheck", ...body }, query: {} }, res); } finally { console.error = e; }
  return res;
}
Object.assign(process.env, ENV);
globalThis.fetch = stripe;
ST.reply = "list1";
const n0 = ST.calls.length;
const h0 = await call(null), h1 = await call("user");
t("C9 API：未ログイン 401・運営以外 403、どちらも Stripe に接続しない", h0.code === 401 && h1.code === 403 && h0.body.success === false && h1.body.success === false && ST.calls.length === n0, [h0.code, h1.code, ST.calls.length - n0]);
const h2 = await call("admin", { path: "/v1/customers", method: "POST", limit: 100 });
t("C9b API：運営は 200・connected（本文の path・method・limit は無視し、GET limit=1 だけ）", h2.code === 200 && h2.body.success === true && h2.body.status === "connected" && ST.calls.length === n0 + 1 && ST.calls[n0].path === "/v1/payment_intents" && ST.calls[n0].query === "?limit=1" && ST.calls[n0].method === "GET", { code: h2.code, body: h2.body, call: ST.calls[n0] });
t("C9c API の応答にも PaymentIntent の詳細・キーを含めない", !leaks(h2.body), h2.body);
ST.reply = "403";
const h3 = await call("admin");
t("C9d API：Stripeが403 → 200で status forbidden（APIとしては成功、接続は失敗と表示できる）", h3.code === 200 && h3.body.status === "forbidden" && h3.body.connected === false, h3.body);
process.env.VERCEL_ENV = "production";
const n1 = ST.calls.length;
const h4 = await call("admin");
t("C9e API：Production では stripe_disabled・Stripeに接続しない", h4.code === 200 && h4.body.status === "stripe_disabled" && h4.body.configReason === "disabled_in_production" && ST.calls.length === n1, h4.body);
process.env.VERCEL_ENV = "preview";

// C10 invariants
t("C10 Stripe への呼び出しはすべて GET・本文なし・冪等キーなし・/v1/payment_intents だけ", ST.calls.length > 0 && ST.calls.every((c) => c.method === "GET" && !c.body && !c.idem && c.path === "/v1/payment_intents"), [...new Set(ST.calls.map((c) => c.method + " " + c.path))]);
t("C10b Firestore への書き込みゼロ", S.writes.length === 0, S.writes.length);

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
