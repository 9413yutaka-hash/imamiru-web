// STEP 37-C: Preview-only permission for month-end close writes. REAL moderate-submission handler + REAL
// api/_lib/imadake-monthly-close.js on mocked firebase-admin (optimistic-concurrency transactions). No network, no Stripe.
// run: node --import ./tests/mockfa-occ/register.mjs tests/imadake-monthly-close-preview-trial-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", "admin@example.com"), user: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let network = 0;
globalThis.fetch = async (url) => { network++; throw new Error("unexpected network " + url); };

const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js?v=" + Date.now());
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js?v=" + Date.now());
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const FT = await import(REPO_URL + "/api/_lib/firebase-target.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };

const BRANCH = "preview/stripe-card-setup";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
const ENV_KEYS = ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW"];
const setEnv = (env) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, env); };

let ip = 0;
async function call(body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const writesNow = () => S.writes.length;
const snapshot = () => JSON.stringify([...S.docs.entries()].filter(([k]) => k.startsWith("imadakeMonthlyInvoices/") || k.startsWith("imadakePostDailyCharges/")).sort());

// seed: a September ledger line (September is closable now) for a billable post of a normal store
S.docs.set("storeAccounts/sP", { storeName: "Preview試験店", enabled: true });
S.docs.set("imadakePosts/pP", { storeId: "sP", cvBillingEnabled: true, status: "published" });
S.docs.set("imadakePostDailyCharges/pP_2026-09-15", { postId: "pP", storeId: "sP", jstDate: "2026-09-15", validCvCount: 2, amountJpy: 100, currency: "JPY", status: "accrued" });
const SEP = { mode: "imadakeMonthlyClose", month: "2026-09" };

// ---------------- permission switch ----------------
t("A1 判定：Preview試験の環境（Preview・対象ブランチ・machinau-preview）だけ true", FT.isPreviewMonthlyCloseTrialEnabled(TRIAL) === true);
t("A2 判定：Production・別ブランチ・鍵の不一致・鍵なしは false", FT.isPreviewMonthlyCloseTrialEnabled({ ...TRIAL, VERCEL_ENV: "production" }) === false && FT.isPreviewMonthlyCloseTrialEnabled({ ...TRIAL, VERCEL_GIT_COMMIT_REF: "preview/region-profiles-freeze" }) === false && FT.isPreviewMonthlyCloseTrialEnabled({ ...TRIAL, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("chikashoku-app") }) === false && FT.isPreviewMonthlyCloseTrialEnabled({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH }) === false);

// ---------------- auth ----------------
setEnv(TRIAL);
let w0 = writesNow();
const u0 = await call({ ...SEP, dryRun: false }), u1 = await call({ ...SEP, dryRun: false }, "user");
t("B1 未ログインは401・運営以外は403（試験環境でも）・書き込みなし", u0.code === 401 && u1.code === 403 && writesNow() === w0, [u0.code, u1.code]);

// ---------------- rejected environments ----------------
for (const [label, env] of [["Production", { ...TRIAL, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }], ["別のPreviewブランチ", { ...TRIAL, VERCEL_GIT_COMMIT_REF: "preview/region-profiles-freeze" }], ["接続先の不一致（Preview専用の鍵が本番）", { ...TRIAL, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("chikashoku-app") }], ["Preview専用の鍵なし", { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH }]]) {
  setEnv(env); w0 = writesNow(); const before = snapshot();
  const dry = await call({ ...SEP }, "admin");
  const exec = await call({ ...SEP, dryRun: false }, "admin");
  t("C " + label + "：試算は可・writeAllowed false、締めの実行は 403 close_writes_disabled・書き込みなし", dry.code === 200 && dry.body.writeAllowed === false && dry.body.previewTrial === false && exec.code === 403 && exec.body.reason === "close_writes_disabled" && writesNow() === w0 && snapshot() === before, { dry: dry.code, wa: dry.body && dry.body.writeAllowed, exec: exec.code, reason: exec.body && exec.body.reason });
}

// ---------------- the Preview trial environment ----------------
setEnv(TRIAL);
w0 = writesNow();
const dry = await call({ ...SEP }, "admin");
t("D1 試験環境の試算（dryRun）：200・writeAllowed true・previewTrial true・1店舗1件100円・書き込みゼロ", dry.code === 200 && dry.body.dryRun === true && dry.body.writeAllowed === true && dry.body.previewTrial === true && dry.body.closable === true && dry.body.totals.storeCount === 1 && dry.body.totals.expectedLineCount === 1 && dry.body.totals.expectedAmountJpy === 100 && writesNow() === w0, { code: dry.code, body: dry.body && { wa: dry.body.writeAllowed, totals: dry.body.totals } });
const exec1 = await call({ ...SEP, dryRun: false }, "admin");
const invoice = S.docs.get("imadakeMonthlyInvoices/sP_2026-09"), ledger = S.docs.get("imadakePostDailyCharges/pP_2026-09-15");
t("D2 試験環境で締めを実行：請求書 closed・1行・100円、台帳は invoiced・請求書ID付き", exec1.code === 200 && exec1.body.stores[0].outcome === "closed" && invoice && invoice.status === "closed" && invoice.lineCount === 1 && invoice.amountJpy === 100 && ledger.status === "invoiced" && ledger.invoiceId === "sP_2026-09", { code: exec1.code, outcome: exec1.body && exec1.body.stores, invoice, ledger });
const afterFirst = snapshot(); w0 = writesNow();
const exec2 = await call({ ...SEP, dryRun: false }, "admin");
t("D3 二重締めの防止：同じ月をもう一度締めても already_closed・請求書と台帳は変わらない・書き込みなし", exec2.code === 200 && exec2.body.stores[0].outcome === "already_closed" && exec2.body.stores[0].addedLines === 0 && snapshot() === afterFirst && writesNow() === w0, { outcome: exec2.body && exec2.body.stores, writes: writesNow() - w0 });
w0 = writesNow();
const oct = await call({ mode: "imadakeMonthlyClose", month: "2026-10", dryRun: false }, "admin");
t("D4 試験環境でも締めの時期より前（今月分）は 409 month_not_closable・書き込みなし", oct.code === 409 && oct.body.reason === "month_not_closable" && writesNow() === w0, { code: oct.code, body: oct.body });

// ---------------- Stripe charge stays disabled ----------------
w0 = writesNow();
const ch = await call({ mode: "imadakeMonthlyCharge", month: "2026-09", dryRun: false }, "admin");
t("E1 試験環境でも月次請求（Stripe）の実行は 403 charge_disabled・書き込みなし・通信なし", ch.code === 403 && ch.body.reason === "charge_disabled" && writesNow() === w0 && network === 0, { code: ch.code, body: ch.body });
const gates = CH.readImadakeMonthlyChargeGates();
t("E2 課金関連3フラグは false のまま（請求の実行の許可も false）", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false && gates.chargeEnabled === false && gates.billingStarted === false);
setEnv({});

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
