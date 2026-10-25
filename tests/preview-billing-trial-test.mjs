// STEP 34-A: Preview専用の課金対象判定。対象ブランチのPreviewで、サーバーのFirebase接続先が machinau-preview と
// 確認できた時だけ、新規の今だけ投稿を課金対象にする。Production・ほかのPreview・条件の欠落では必ず無効。
// 月末締め・月次請求・Stripeのフラグには作用しないことも確かめる。REAL api/_lib/*.js、模擬の firebase-admin。
// run: node --import ./tests/mockfa-occ/register.mjs tests/preview-billing-trial-test.mjs
import { REPO_URL, REPO_ROOT } from "./_paths.mjs";
import fs from "node:fs";

const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const FT = await import(REPO_URL + "/api/_lib/firebase-target.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const FS = await import("firebase-admin/firestore");
const db = FS.getFirestore();

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };

const BRANCH = "preview/stripe-card-setup";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
const on = (env) => FT.isPreviewCvBillingTrialEnabled(env);

// ---------------- T: the trial switch ----------------
t("T1 対象ブランチのPreview・接続先 machinau-preview：有効", on(TRIAL_ENV) === true);
t("T2 Production（Preview専用の鍵があっても）：無効", on({ ...TRIAL_ENV, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }) === false);
t("T2b Production で対象ブランチ名を名乗っても：無効", on({ ...TRIAL_ENV, VERCEL_ENV: "production" }) === false);
t("T3 ローカル・development（VERCEL_ENV なし／development）：無効", on({ ...TRIAL_ENV, VERCEL_ENV: undefined }) === false && on({ ...TRIAL_ENV, VERCEL_ENV: "development" }) === false);
t("T4 Previewでブランチ名が無い：無効", on({ ...TRIAL_ENV, VERCEL_GIT_COMMIT_REF: undefined }) === false && on({ ...TRIAL_ENV, VERCEL_GIT_COMMIT_REF: "  " }) === false);
t("T5 ほかのPreviewブランチ（Preview専用の鍵や machinau-preview の鍵があっても）：無効", on({ ...TRIAL_ENV, VERCEL_GIT_COMMIT_REF: "preview/town-now-thread-backend" }) === false && on({ ...TRIAL_ENV, VERCEL_GIT_COMMIT_REF: "preview/town-now-thread-backend", FIREBASE_SERVICE_ACCOUNT_KEY: sa("machinau-preview") }) === false);
const missing = { ...TRIAL_ENV }; delete missing.FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW;
t("T6 Preview専用の鍵の環境変数が無い：無効", on(missing) === false);
t("T7 Preview専用の鍵が本番の鍵（接続先が不一致）：無効", on({ ...TRIAL_ENV, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("chikashoku-app") }) === false);
t("T7b Preview専用の鍵が別のプロジェクト：無効", on({ ...TRIAL_ENV, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("someone-else-proj") }) === false);
t("T8 Preview専用の鍵がJSONでない・空：無効", on({ ...TRIAL_ENV, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: "{not json" }) === false && on({ ...TRIAL_ENV, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: "" }) === false);
t("T9 環境変数そのものが無い：無効", on(undefined) === false && on({}) === false);
t("T10 表の期待値が本番のID：無効（表の誤記にも備える）", FT.isPreviewCvBillingTrialEnabled({ ...TRIAL_ENV, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("chikashoku-app") }, { [BRANCH]: "chikashoku-app" }) === false);
t("T12 試験の表の期待値が接続先と違う（接続は machinau-preview でも）：無効", FT.isPreviewCvBillingTrialEnabled(TRIAL_ENV, { [BRANCH]: "another-preview-proj" }) === false);
t("T13 試験の表に対象ブランチが無い（接続先の検査は通っても）：無効", FT.isPreviewCvBillingTrialEnabled(TRIAL_ENV, {}) === false);
t("T11 表は書き換えられない・対象は preview/stripe-card-setup → machinau-preview だけ", Object.isFrozen(FT.PREVIEW_CV_BILLING_TRIAL_TARGETS) && JSON.stringify(FT.PREVIEW_CV_BILLING_TRIAL_TARGETS) === JSON.stringify({ [BRANCH]: "machinau-preview" }));

// ---------------- D: the billable decision at post creation ----------------
S.docs.set("storeAccounts/s_normal", { storeName: "試験店", isTestAccount: false });
S.docs.set("storeAccounts/s_test", { storeName: "動作テスト", isTestAccount: true });
t("D1 試験環境・通常の店舗：新規投稿は課金対象", (await IM.decideImadakeCvBillingForNewPost(db, "s_normal", TRIAL_ENV)) === true);
t("D2 試験環境でもテスト事業者（isTestAccount）は課金対象外", (await IM.decideImadakeCvBillingForNewPost(db, "s_test", TRIAL_ENV)) === false);
t("D3 試験環境でも店舗アカウントが無ければ課金対象外", (await IM.decideImadakeCvBillingForNewPost(db, "s_missing", TRIAL_ENV)) === false);
t("D4 Production：従来どおり課金対象外（課金開始フラグ false）", (await IM.decideImadakeCvBillingForNewPost(db, "s_normal", { ...TRIAL_ENV, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })) === false);
t("D5 Preview専用の鍵が無い／接続先が不一致：課金対象外", (await IM.decideImadakeCvBillingForNewPost(db, "s_normal", missing)) === false && (await IM.decideImadakeCvBillingForNewPost(db, "s_normal", { ...TRIAL_ENV, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("chikashoku-app") })) === false);
t("D6 ほかのPreviewブランチ：課金対象外", (await IM.decideImadakeCvBillingForNewPost(db, "s_normal", { ...TRIAL_ENV, VERCEL_GIT_COMMIT_REF: "preview/town-now-thread-backend" })) === false);
// env を省略した時は process.env を使う（投稿作成の実際の呼び出しの形）
const saved = { ...process.env };
Object.assign(process.env, TRIAL_ENV);
const viaProcessOn = await IM.decideImadakeCvBillingForNewPost(db, "s_normal");
process.env.VERCEL_ENV = "production";
const viaProcessOff = await IM.decideImadakeCvBillingForNewPost(db, "s_normal");
for (const k of Object.keys(TRIAL_ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
t("D7 実際の呼び出し（env省略＝process.env）でも、試験環境だけ有効・Productionでは無効", viaProcessOn === true && viaProcessOff === false, { viaProcessOn, viaProcessOff });

// ---------------- G: other switches stay off ----------------
const gates = CH.readImadakeMonthlyChargeGates();
t("G1 課金開始フラグ・月末締めの書き込み・月次請求の実行は false のまま", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false);
t("G2 月次請求の実行の許可は、試験環境でも無効（請求開始・請求実行とも false）", gates.chargeEnabled === false && gates.billingStarted === false, gates);
const savedEnv = { ...process.env }; Object.assign(process.env, TRIAL_ENV);
const r = await CH.runImadakeMonthlyCharge(db, { env: TRIAL_ENV, fetch: async () => { throw new Error("no network"); } }, { month: "2026-09", dryRun: false, gates: CH.readImadakeMonthlyChargeGates() });
for (const k of Object.keys(TRIAL_ENV)) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
t("G3 試験環境で請求の実行を求めても止まる（charge_disabled）", r.ok === false && r.reason === "charge_disabled", r);
const c = await MC.runImadakeMonthlyClose(db, { month: "2026-09", dryRun: false, allowWrite: MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED, nowMillis: Date.UTC(2026, 9, 20) });
t("G4 試験環境でも月末締めの書き込みは止まる（close_writes_disabled）", c.ok === false && c.reason === "close_writes_disabled", c);

// ---------------- W: wiring ----------------
const im = fs.readFileSync(REPO_ROOT + "/api/_lib/imadake.js", "utf8");
const usesTrial = (src) => (src.match(/isPreviewCvBillingTrialEnabled/g) || []).length;
t("W1 試験の判定を使うのは imadake.js の課金対象判定だけ（ほかの課金処理では使わない）", usesTrial(im) === 2 &&
  ["imadake-cv.js", "imadake-cv-report.js", "imadake-monthly-close.js", "imadake-monthly-charge.js", "store-billing.js", "imadake-billing-admin.js"].every((f) => usesTrial(fs.readFileSync(REPO_ROOT + "/api/_lib/" + f, "utf8")) === 0) &&
  usesTrial(fs.readFileSync(REPO_ROOT + "/api/moderate-submission.js", "utf8")) === 0);
t("W2 投稿作成は decideImadakeCvBillingForNewPost で課金対象を決める（呼び出しは1か所）", (im.match(/await decideImadakeCvBillingForNewPost\(/g) || []).length === 1);
t("W3 Functionは11本のまま", fs.readdirSync(REPO_ROOT + "/api").filter((f) => f.endsWith(".js")).length === 11);
t("W4 Firestoreへの書き込みゼロ", S.writes.length === 0, S.writes.length);

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
