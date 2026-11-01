// STEP 52-B: store card ¥100/month — (U) the sign-up availability shown on the store card screen follows the
// Production monthly sign-up switch (mocked through deps, the real switch stays false), (W) the Production scheduled
// workflow is prepared but cannot run (schedule commented out + job if:false), talks only to machinau.jp after
// checking the Production Firebase, never prints the secret, and treats "switches off" as a skip,
// (C) the Production cron entry does nothing while the switches are off, (J) JST month-end close and 2nd-day charge.
// REAL api/_lib modules + REAL moderate-submission handler on mocked firebase-admin. No network.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-prod-cron-test.mjs
import { REPO_URL, REPO_ROOT } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
Object.assign(process.env, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", AI_COLLECT_CRON_SECRET: "fake-ai-collect-secret-for-tests", STORE_CARD_BILLING_CRON_SECRET: "fake-cron-secret-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_CHARGE_RESTRICTED_KEY: "rk_" + "test_FAKECHARGEKEYFORTESTS001" });
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
globalThis.__MOCK_TOKENS = {};
const network = [];
globalThis.fetch = async (url) => { network.push(String(url)); throw new Error("unexpected network " + url); };
const { Timestamp, getFirestore } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");
const B = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");
const CR = await import(REPO_URL + "/api/_lib/store-custom-plan-cron.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const db = getFirestore();
const jst = (s) => Date.parse(s + "+09:00");

// ---- fixtures (in-memory mock only) ----
S.docs.set("storeAccounts/SU", { storeName: "店SU", registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
S.docs.set("storeMembers/SU_u1", { uid: "u1", storeId: "SU", role: "owner", status: "active" });
const depsFor = (monthlyOn, extra = {}) => ({
  resolveStoreUserActor: async () => ({ ok: true, actor: { uid: "u1", emailVerified: true } }),
  readRequestBody: (request) => request.body || {},
  getFirestore: () => db,
  getFirebaseAdminApp: () => ({}),
  isStoreCustomPlanTrialEnabled: () => false,
  isStoreCustomPlanMonthlySignupEnabled: () => monthlyOn,
  checkAccountBillingCard: async () => ({ ok: true }),
  claimRateLimit: async () => true,
  computeRateLimitIdentifier: (kind, uid) => kind + ":" + uid,
  now: () => jst("2026-11-10T12:00:00"),
  ...extra
});
const get = async (deps) => { const r = res(); await quiet(() => CP.handleStoreCustomProfileGet({ body: { storeId: "SU" } }, r, deps)); return r; };
const subscribe = async (deps) => { const r = res(); await quiet(() => CP.handleStoreCustomPlanSubscribe({ body: { storeId: "SU", planConsentVersion: B.STORE_CARD_PLAN_CONSENT_VERSION } }, r, deps)); return r; };

// ===================== U. sign-up availability on the store card screen =====================
t("U0 本番の申込のスイッチ（コードの値）は true（Production の環境でだけ効く。ここは模擬の deps）（STEP 52-F：本番のカード登録・本番の申込は受付開始のため true）", B.STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === true);
let r = await get(depsFor(false));
t("U1 本番の申込が OFF（Production・試験の環境でもない）：画面の目安は申込できない（signupAvailable false）", r.code === 200 && r.body.plan.signupAvailable === false && r.body.plan.cardRegistered === false, r.body && r.body.plan);
r = await subscribe(depsFor(false));
t("U2 本番の申込が OFF：申込は 403 plan_signup_unavailable・契約を作らない", r.code === 403 && r.body.reason === "plan_signup_unavailable" && !S.docs.has("storeCustomPlans/SU"), r.body);
r = await get(depsFor(true));
t("U3 本番の申込が ON（模擬）：画面の目安は申込できる（signupAvailable true・カード登録済みの確認あり）", r.code === 200 && r.body.plan.signupAvailable === true && r.body.plan.cardRegistered === true && r.body.plan.state === "none", r.body && r.body.plan);
r = await subscribe(depsFor(true));
const p = S.docs.get("storeCustomPlans/SU") || {};
t("U4 本番の申込が ON（模擬）：同意つきの申込で本番の暦月契約（monthly・createdInPreview false・同意の版）を作る", r.code === 200 && p.periodKind === "monthly" && p.createdInPreview === false && p.ownerUid === "u1" && !!p.consent && p.consent.version === B.STORE_CARD_PLAN_CONSENT_VERSION, { body: r.body, p });
t("U5 申込・取得で外部（Stripe 等）へ通信しない", network.length === 0, network);

// ===================== J. JST month-end close and charge on the 2nd =====================
const s11 = B.storeCustomPlanChargeScheduleFor("2026-11"), s12 = B.storeCustomPlanChargeScheduleFor("2026-12");
t("J1 11月分は 12月2日 0:00（日本時間）に請求予定・年をまたぐ12月分は 2027年1月2日", s11.date === "2026-12-02" && s11.millis === jst("2026-12-02T00:00:00") && s12.date === "2027-01-02" && s12.millis === jst("2027-01-02T00:00:00"), { s11, s12 });
t("J2 月の判定は日本時間（UTC 10月31日 15:00 は日本時間 11月1日）", B.jstMonthKey(Date.parse("2026-10-31T14:59:59Z")) === "2026-10" && B.jstMonthKey(Date.parse("2026-10-31T15:00:00Z")) === "2026-11");
S.docs.set("storeCustomPlans/SC", { storeId: "SC", status: "active", ownerUid: "u2", billingAccountUid: "u2", periodKind: "monthly", createdInPreview: false, subscribedAt: Timestamp.fromMillis(jst("2026-09-05T10:00:00")), accessUntil: null, paymentStatus: "current", revision: 1 });
S.docs.set("storeAccounts/SC", { ...S.docs.get("storeAccounts/SU"), storeName: "店SC" });
S.docs.set("storeMembers/SC_u2", { uid: "u2", storeId: "SC", role: "owner", status: "active" });
let c = await quiet(() => B.runStoreCustomPlanMonthlyClose(db, "2026-10", jst("2026-10-31T23:50:00"), true));
t("J3 日本時間の月末（10月31日 23:50）はまだ10月を締めない（month_not_closed）", c.ok === false && c.reason === "month_not_closed" && !S.docs.has("storeCustomPlanInvoices/SC_2026-10"), c);
c = await quiet(() => B.runStoreCustomPlanMonthlyClose(db, "2026-10", jst("2026-11-01T00:10:00"), true));
const inv = S.docs.get("storeCustomPlanInvoices/SC_2026-10") || {};
t("J4 日本時間の11月1日 0:10 に10月を締める：100円（税込）・請求予定は 11月2日 0:00（日本時間）", c.ok === true && inv.amountJpy === 100 && inv.taxIncluded === true && inv.status === "closed" && inv.chargeScheduledFor === "2026-11-02" && inv.chargeScheduledAt.toMillis() === jst("2026-11-02T00:00:00") && inv.createdInPreview === false, { c, inv });

// ===================== D. duplicate runs =====================
const invBefore = JSON.stringify(inv);
c = await quiet(() => B.runStoreCustomPlanMonthlyClose(db, "2026-10", jst("2026-11-01T00:40:00"), true));
const invoiceIds = [...S.docs.keys()].filter((k) => k.startsWith("storeCustomPlanInvoices/SC_"));
t("D1 同じ月の締めを2回実行しても、請求書は店舗・月で1件のまま・内容も変わらない", c.ok === true && JSON.stringify(invoiceIds) === JSON.stringify(["storeCustomPlanInvoices/SC_2026-10"]) && JSON.stringify(S.docs.get("storeCustomPlanInvoices/SC_2026-10")) === invBefore, invoiceIds);

// ===================== C. Production cron entry (STEP 53: close on, charges off) =====================
t("C0 締めの書き込み・請求・定期実行の請求のスイッチは true（STEP 53）", B.STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED === true && B.STORE_CUSTOM_PLAN_CHARGE_ENABLED === true && CR.STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED === true);
const writesBefore = S.writes.length, docsBefore = JSON.stringify([...S.docs.entries()]);
const cr = res();
await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", "x-machinau-cron-secret": "fake-cron-secret-for-tests" }, body: { mode: "storeCustomPlanCron" }, query: {} }, cr));
t("C1 Production の定期実行の入口（STEP 53）：200・本番として記録・前月の締めは同じ請求書のまま（二重に作らない）・本番の請求専用キーが無い（テストキーだけ）ので請求しない（stripe_unavailable）・退会の最終削除の手順は渡さない・外部へ通信しない", cr.code === 200 && cr.body.success === true && cr.body.steps.close.status === "done" && cr.body.steps.charges.executed === false && cr.body.steps.charges.blockedReason === "stripe_unavailable" && !cr.body.steps.accountDeletion && JSON.stringify(S.docs.get("storeCustomPlanInvoices/SC_2026-10")) === invBefore && [...S.docs.keys()].some((k) => k.startsWith("storeCustomPlanCronRuns/") && S.docs.get(k).environment === "production") && network.length === 0, cr.body);
const bad = res();
await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", "x-machinau-cron-secret": "wrong" }, body: { mode: "storeCustomPlanCron" }, query: {} }, bad));
t("C2 合言葉が違えば 401（何もしない）", bad.code === 401, bad.body);

// ===================== W. the Production workflow file =====================
const PROD = readFileSync(join(REPO_ROOT, ".github", "workflows", "store-card-plan-production.yml"), "utf8").replace(/\r\n/g, "\n");
const MAIN = readFileSync(join(REPO_ROOT, ".github", "workflows", "main.yml"), "utf8").replace(/\r\n/g, "\n");
const live = PROD.split("\n").filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s+#.*$/, "")).join("\n");
t("W1 本番の定期実行（STEP 53）：予約は日本時間の毎日 10:10〜13:10（UTC 01:10〜04:10）の1つだけ・job は main の予約か手動の時だけ（if は1つ）", /^\s*schedule:\n\s*- cron: "10 1-4 \* \* \*"$/m.test(live) && (live.match(/^\s*-\s*cron:/gm) || []).length === 1 && /^\s*if: github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\)$/m.test(live) && (live.match(/^\s*if:/gm) || []).length === 1);
t("W2 本番だけに送る：送り先は https://machinau.jp だけ（Preview の vercel.app には送らない）", (PROD.match(/https:\/\/[a-z0-9.-]+/g) || []).every((u) => u === "https://machinau.jp") && !/vercel\.app/.test(PROD));
t("W3 合言葉を送る前に、main のファイルであることと本番の Firebase（chikashoku-app・検査あり）を確かめる", /store-card-plan-production\.yml@refs\/heads\/main/.test(PROD) && /projectId==="chikashoku-app"&&t\.enforced===true/.test(PROD) && PROD.indexOf("chikashoku-app") < PROD.indexOf("X-Machinau-Cron-Secret"));
t("W4 合言葉（STEP 53-B：定期請求の専用の STORE_CARD_BILLING_CRON_SECRET・情報収集の合言葉は使わない）は secrets から環境変数で渡すだけ・ログに出さない（echo しない）", /CRON_SECRET: \$\{\{ secrets\.STORE_CARD_BILLING_CRON_SECRET \}\}/.test(PROD) && !/AI_COLLECT_CRON_SECRET \}\}/.test(PROD) && !/echo[^\n]*CRON_SECRET/.test(PROD) && !/set -x/.test(PROD));
t("W5 二重実行の防止：同じ workflow は concurrency で1つずつ（実行中を取り消さない）", /concurrency:\n\s+group: store-card-plan-production\n\s+cancel-in-progress: false/.test(PROD));
t("W6 店舗カードの入口（storeCustomPlanCron）だけを呼ぶ・今だけ投稿の請求の入口は呼ばない", /"mode":"storeCustomPlanCron"/.test(PROD) && !/imadake/i.test(PROD));
t("W7 スイッチが false の時（403 cron_disabled）は「停止中」として成功で終わる・それ以外は 200 だけを成功とする", /\[ "\$code" = "403" \] && \[ "\$reason" = "cron_disabled" \]/.test(PROD) && /\[ "\$code" = "200" \]\s*$/.test(PROD.trim()));
const previewJob = MAIN.slice(MAIN.indexOf("preview-plan-cron:"));
t("W8 Preview の定期実行（main.yml）は今までどおり：手動・Preview のブランチ・machinau-preview の確認・machinau.jp には送らない", /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/preview\/stripe-card-setup'/.test(previewJob) && /projectId==="machinau-preview"/.test(previewJob) && !/machinau\.jp/.test(previewJob));

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
