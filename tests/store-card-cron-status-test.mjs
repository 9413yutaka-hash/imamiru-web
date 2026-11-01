// STEP 53-H: public status URL for the external monitor (UptimeRobot) —
// GET /api/moderate-submission?mode=storeCardCronStatus returns 200 only when a successful store card cron run is
// confirmed (today, or yesterday until 14:00 JST), 503 otherwise (stopped, never run, unreadable). Read only:
// no Firestore writes, never runs billing, returns only { ok, state }, no-store, Firestore read at most once per 60s.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin. No network. Fake secrets.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-cron-status-test.mjs
import { REPO_URL } from "./_paths.mjs";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const SECRET = "fake-store-card-billing-secret-0001";
const ENV = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", AI_COLLECT_CRON_SECRET: "fake-ai-collect-secret-0002", STORE_CARD_BILLING_CRON_SECRET: SECRET, STRIPE_MODE: "live", STRIPE_RESTRICTED_KEY: "rk_" + "live_FAKECARDKEY0001", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "live_FAKECHARGEKEY0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "live_FAKEPUBKEY0001" };
Object.assign(process.env, ENV);
globalThis.__MOCK_TOKENS = { admin: { uid: "adm1", email: "admin@example.com", email_verified: true, firebase: { sign_in_provider: "password" } }, u1: { uid: "u1", email: "u1@example.com", email_verified: true, firebase: { sign_in_provider: "password" } } };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const network = [];
globalThis.fetch = async (url) => { network.push(String(url)); throw new Error("unexpected network " + url); };
const jst = (s) => Date.parse(s + "+09:00");
let NOW = jst("2026-12-01T09:00:00");
Date.now = () => NOW;
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const CR = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
async function GET(query) { const r = res(); await quiet(() => handler({ method: "GET", headers: {}, query }, r)); return r; }
async function POST(body, headers = {}) { const r = res(); await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers }, body, query: {} }, r)); return r; }
const STATUS = () => GET({ mode: "storeCardCronStatus" });
const health = (data) => S.docs.set("storeCustomPlanCronHealth/production", { environment: "production", ...data });
const ts = (s) => Timestamp.fromMillis(jst(s));
const onlyOkState = (b) => !!b && JSON.stringify(Object.keys(b).sort()) === JSON.stringify(["ok", "state"]);

// ---- never run ----
let r = await STATUS();
t("S1 まだ一度も記録が無い：503（正常な成功を確認できない）・本文は ok と状態だけ・キャッシュしない", r.code === 503 && r.body.ok === false && r.body.state === "never_run" && onlyOkState(r.body) && r.headers["cache-control"] === "no-store", { code: r.code, body: r.body, h: r.headers });

// ---- healthy ----
CR.resetStoreCardCronStatusMemo();
health({ lastRunAt: ts("2026-12-01T10:10:00"), lastStatus: "succeeded", lastSuccessAt: ts("2026-12-01T10:10:00"), lastSuccessJstDate: "2026-12-01", lastRunJstDate: "2026-12-01", lastRunId: "run-secret-id-xyz" });
NOW = jst("2026-12-01T10:20:00");
r = await STATUS();
t("S2 今日成功している：200 ok", r.code === 200 && r.body.ok === true && r.body.state === "ok" && onlyOkState(r.body), r.body);
NOW = jst("2026-12-02T13:59:00");
CR.resetStoreCardCronStatusMemo();
r = await STATUS();
t("S3 昨日成功していれば、日本時間14時までは 200", r.code === 200 && r.body.ok === true, r.body);

// ---- stopped ----
NOW = jst("2026-12-02T14:00:00");
CR.resetStoreCardCronStatusMemo();
r = await STATUS();
t("S4 14時を過ぎても今日の成功が無い：503 stale（原因は断定しない）", r.code === 503 && r.body.ok === false && r.body.state === "stale" && onlyOkState(r.body), r.body);
CR.resetStoreCardCronStatusMemo();
health({ lastRunAt: ts("2026-12-02T10:10:00"), lastStatus: "failed", lastSuccessAt: ts("2026-12-01T10:10:00"), lastSuccessJstDate: "2026-12-01", lastRunJstDate: "2026-12-02", lastRunId: "run-secret-id-xyz" });
r = await STATUS();
t("S5 実行はしたが失敗が続いている（最後の成功が昨日・14時過ぎ）：503", r.code === 503 && r.body.ok === false, r.body);

// ---- unreadable ----
CR.resetStoreCardCronStatusMemo();
const rr = res();
await quiet(() => CR.handleStoreCardCronStatus({ method: "GET", query: {} }, rr, { env: ENV, now: () => NOW, getFirebaseAdminApp: () => ({}), getFirestore: () => { throw new Error("internal detail: credentials path /secret/key.json"); } }));
t("S6 Firestore を読めない：503 unavailable・内部のエラーの内容は返さない", rr.code === 503 && rr.body.ok === false && rr.body.state === "unavailable" && onlyOkState(rr.body) && !JSON.stringify(rr.body).includes("secret") && rr.headers["cache-control"] === "no-store", rr.body);

// ---- no leaks ----
const bodies = JSON.stringify([r.body, rr.body]);
t("S7 応答に日時・実行ID・合言葉・キー・メールアドレス・金額を含まない", !/2026|run-secret|fake-|rk_|pk_|@|円|JPY|amount/i.test(bodies), bodies);

// ---- read only / memo ----
CR.resetStoreCardCronStatusMemo();
health({ lastRunAt: ts("2026-12-02T10:10:00"), lastStatus: "succeeded", lastSuccessAt: ts("2026-12-02T10:10:00"), lastSuccessJstDate: "2026-12-02", lastRunJstDate: "2026-12-02" });
const writesBefore = S.writes.length;
for (let i = 0; i < 20; i++) await STATUS();
t("S8 何回呼んでも Firestore に書き込まない", S.writes.length === writesBefore, S.writes.slice(writesBefore));
health({ lastRunAt: ts("2026-12-01T10:10:00"), lastStatus: "failed", lastSuccessJstDate: "2026-11-01" });
r = await STATUS();
t("S9 読み取りは同じ実行環境で60秒に1回まで（60秒以内は前回の読み取りの結果）", r.code === 200, r.body);
NOW += 60 * 1000;
r = await STATUS();
t("S10 60秒たてば読み直す（最新の状態で 503）", r.code === 503, r.body);

// ---- cannot trigger billing ----
const runsBefore = [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanCronRuns/") || k.startsWith("storeCustomPlanInvoices/") || k.startsWith("storeCustomPlanCronLocks/")).length;
await GET({ mode: "storeCardCronStatus", run: "1", execute: "true", dryRun: "false" });
await GET({ mode: "storeCustomPlanCron" });
const postStatus = await POST({ mode: "storeCardCronStatus" }, { "x-machinau-cron-secret": SECRET });
t("S11 状態の URL・GET の mode=storeCustomPlanCron からは定期実行・締め・請求を行わない（記録・請求書・ロックが増えない・外部へ通信しない）", [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanCronRuns/") || k.startsWith("storeCustomPlanInvoices/") || k.startsWith("storeCustomPlanCronLocks/")).length === runsBefore && network.length === 0 && S.writes.length === writesBefore, { network, post: postStatus.code });
t("S12 POST で mode=storeCardCronStatus を送っても状態の URL・定期実行にはならない（200 の ok を返さない）", !(postStatus.body && postStatus.body.ok === true && postStatus.body.state === "ok"), postStatus.body);

// ---- existing admin API unchanged ----
const adm = await POST({ mode: "adminStoreCustomPlanCronHealth" }, { authorization: "Bearer admin" });
t("S13 既存の運営の状態の確認（POST・運営のみ）は今までどおり（200・詳しい状態）", adm.code === 200 && adm.body.success === true && adm.body.environment === "production" && typeof adm.body.lastSuccessJstDate === "string", adm.body);
const own = await POST({ mode: "adminStoreCustomPlanCronHealth" }, { authorization: "Bearer u1" });
t("S14 運営以外は詳しい状態を見られない", own.code >= 401, own.code);
const ft = await GET({ mode: "firebaseTarget" });
t("S15 既存の公開の GET（接続先の確認）は今までどおり", ft.code === 200 && ft.body.projectId === "chikashoku-app", ft.body);

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
