// STEP 32-D㉗: Preview専用Firebaseへの分離の安全対策。サーバーの接続先検査(api/_lib/firebase-target.js)と、
// 8つのFunctionの初期化・REAL moderate-submission の配線、ブラウザの firebase.js の接続先の決め方を確かめる。
// STEP 45-B: 接続先はブランチではなく環境で決める(Production＝chikashoku-app、Preview＝machinau-preview、本番の鍵へ切り替えない)。
// firebase-admin は「初期化前の状態から始まる」模擬(tests/mockfa-target)。実際の鍵・ネットワークは使わない。
// run: node --import ./tests/mockfa-target/register.mjs tests/firebase-target-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", "admin@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const A = globalThis.__FB_ACCESS = globalThis.__FB_ACCESS || { inits: [], firestore: 0, collections: 0 };
const APPS = globalThis.__MOCK_APPS = globalThis.__MOCK_APPS || [];
globalThis.fetch = async () => { throw new Error("no network"); };

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };

const FT = await import(REPO_URL + "/api/_lib/firebase-target.js");
const BRANCH = "preview/stripe-card-setup";
const PREVIEW_ID = "machinau-preview-test";
const sa = (projectId) => ({ type: "service_account", project_id: projectId, private_key: "-----FAKE-PRIVATE-KEY-FOR-TESTS-----", client_email: "x@" + projectId + ".iam.example" });
const OTHER = "preview/town-now-thread-backend";
const PV = "FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW";
const KEYJ = (id) => JSON.stringify(sa(id));

// ---------------- S: server check (unit) — STEP 45-B：ブランチではなく環境で決める ----------------
t("S0 定数：本番は chikashoku-app・Preview は machinau-preview（同じにならない）・ブランチの表は接続先に使わない", FT.PRODUCTION_FIREBASE_PROJECT_ID === "chikashoku-app" && FT.PREVIEW_FIREBASE_PROJECT_ID === "machinau-preview" && FT.PREVIEW_FIREBASE_PROJECT_ID !== FT.PRODUCTION_FIREBASE_PROJECT_ID && FT.PREVIEW_FIREBASE_TARGETS === undefined);
let r = FT.checkFirebaseTarget({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, sa("chikashoku-app"));
t("S1 Production・本番のサービスアカウント：使ってよい（検査あり）", r.ok && r.enforced === true && r.expectedProjectId === "chikashoku-app" && r.projectId === "chikashoku-app", r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, sa("machinau-preview"));
t("S1a Production に Preview のサービスアカウント：止める（project_mismatch）", !r.ok && r.enforced && r.reason === "project_mismatch", r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, sa("someone-else-proj"));
t("S1c Production に別のプロジェクト：止める", !r.ok && r.reason === "project_mismatch", r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, null);
t("S1d Production でサービスアカウントが読めない：止める", !r.ok && r.reason === "service_account_unreadable", r);
r = FT.checkFirebaseTarget({}, sa("chikashoku-app"));
t("S1b ローカル（VERCEL_ENVなし）：検査しない（今までどおり）", r.ok && r.enforced === false, r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "development" }, sa("someone-else-proj"));
t("S1e vercel dev（development）：検査しない（今までどおり）", r.ok && r.enforced === false, r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH }, sa("machinau-preview"));
t("S3c Preview（preview/stripe-card-setup）で machinau-preview：使ってよい", r.ok && r.enforced && r.projectId === "machinau-preview" && r.expectedProjectId === "machinau-preview", r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER }, sa("machinau-preview"));
t("S2 Preview（ほかのブランチ）でも machinau-preview：使ってよい（ブランチに依存しない）", r.ok && r.enforced && r.projectId === "machinau-preview", r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "preview" }, sa("machinau-preview"));
t("S8 Preview でブランチ名が分からなくても machinau-preview なら使ってよい（判定にブランチを使わない）", r.ok && r.enforced, r);
for (const branch of [BRANCH, OTHER, ""]) {
  r = FT.checkFirebaseTarget({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch }, sa("chikashoku-app"));
  if (!(!r.ok && r.enforced && r.reason === "project_mismatch")) t("S3d Preview に本番のサービスアカウント（" + (branch || "ブランチ不明") + "）", false, r);
}
t("S3d Preview に本番のサービスアカウント：どのブランチでも止める（project_mismatch）", true);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER }, sa("someone-else-proj"));
t("S5b Preview に別のプロジェクト：止める", !r.ok && r.reason === "project_mismatch", r);
r = FT.checkFirebaseTarget({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER }, null);
t("S6 Preview でサービスアカウントが無い・読めない：止める", !r.ok && r.reason === "service_account_unreadable", r);
let thrown = null; try { FT.assertFirebaseTarget({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER }, sa("chikashoku-app")); } catch (e) { thrown = e; }
t("S9 assertFirebaseTarget は止める時に FirebaseTargetError を投げ、鍵の中身を含めない", thrown && thrown.name === "FirebaseTargetError" && thrown.reason === "project_mismatch" && !/FAKE-PRIVATE|client_email/.test(String(thrown.message)), thrown && thrown.message);
thrown = null; try { FT.assertFirebaseTarget({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, sa("machinau-preview")); } catch (e) { thrown = e; }
t("S9b Production で別のプロジェクトなら assertFirebaseTarget も止める", thrown && thrown.name === "FirebaseTargetError" && thrown.reason === "project_mismatch", thrown && thrown.reason);
r = FT.checkFirebaseTargetFromEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, [PV]: "{not json" });
t("S10 Preview専用の変数がJSONでない：止める", !r.ok && r.reason === "service_account_unreadable", r);
r = FT.checkFirebaseTargetFromEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app") });
t("S11 環境変数だけの検査：Preview専用の変数が無ければ本番の変数があっても止める（preview_service_account_missing）", !r.ok && r.enforced && r.reason === "preview_service_account_missing" && r.projectId === "", r);
r = FT.checkFirebaseTargetFromEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("machinau-preview"), [PV]: KEYJ("machinau-preview") });
t("S12 環境変数だけの検査：Production の変数に Preview の鍵：止める（project_mismatch）", !r.ok && r.reason === "project_mismatch", r);

// ---------------- K: which variable the key is read from ----------------
for (const branch of [BRANCH, OTHER, ""]) {
  let thrownK = null;
  try { FT.readFirebaseServiceAccountText({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: branch, FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app") }); } catch (e) { thrownK = e; }
  if (!(thrownK && thrownK.name === "FirebaseTargetError" && thrownK.reason === "preview_service_account_missing")) t("K1 " + (branch || "ブランチ不明"), false, thrownK && thrownK.reason);
}
t("K1 Preview で Preview専用の変数が無い：どのブランチでも本番用の変数へ切り替えず止める（preview_service_account_missing）", true);
t("K2 Preview（preview/stripe-card-setup）では Preview専用の変数だけを読む", FT.readFirebaseServiceAccountText({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app"), [PV]: KEYJ("machinau-preview") }) === KEYJ("machinau-preview"));
t("K3 Production では Preview専用の変数があっても FIREBASE_SERVICE_ACCOUNT_KEY", FT.readFirebaseServiceAccountText({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app"), [PV]: KEYJ("machinau-preview") }) === KEYJ("chikashoku-app"));
t("K4 Preview（ほかのブランチ）でも Preview専用の変数だけを読む（本番の変数は読まない）", FT.readFirebaseServiceAccountText({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app"), [PV]: KEYJ("machinau-preview") }) === KEYJ("machinau-preview"));
t("K5 Production で FIREBASE_SERVICE_ACCOUNT_KEY が無い時は値なし（未設定の扱いは今までどおり呼び出し側＝止まる）", FT.readFirebaseServiceAccountText({ VERCEL_ENV: "production" }) === undefined);
t("K5b ローカルでは今までどおり FIREBASE_SERVICE_ACCOUNT_KEY（Preview専用の変数は読まない）", FT.readFirebaseServiceAccountText({ FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app"), [PV]: KEYJ("machinau-preview") }) === KEYJ("chikashoku-app"));
t("K6 変数名の定数は FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW", FT.PREVIEW_SERVICE_ACCOUNT_ENV_NAME === PV);
t("K7 Preview の鍵の project_id を読める（Preview専用の変数から）", FT.readServiceAccountProjectId({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app"), [PV]: KEYJ("machinau-preview") }) === "machinau-preview");

// ---------------- T: Preview試験の機能の有効条件は変えない（ブランチの表のまま） ----------------
const TRIALS = ["isPreviewCvBillingTrialEnabled", "isPreviewMonthlyCloseTrialEnabled", "isPreviewStoreInvoiceHistoryEnabled", "isPreviewListingPhotoCopyTrialEnabled"];
const trialEnv = (env) => TRIALS.map((name) => FT[name](env));
const PREVIEW_OK = { FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("chikashoku-app"), [PV]: KEYJ("machinau-preview") };
t("T1 試験の機能：preview/stripe-card-setup・machinau-preview の時だけ有効（4つとも）", trialEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, ...PREVIEW_OK }).every((v) => v === true), trialEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, ...PREVIEW_OK }));
t("T2 試験の機能：ほかのブランチは machinau-preview につながっていても無効（有効条件は今までどおりブランチの表）", trialEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, ...PREVIEW_OK }).every((v) => v === false));
t("T3 試験の機能：Production・ローカル・Preview専用の変数なしでは無効", [trialEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", ...PREVIEW_OK }), trialEnv({ ...PREVIEW_OK }), trialEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEYJ("machinau-preview") })].flat().every((v) => v === false));
t("T4 試験の機能のブランチの表は変えていない（preview/stripe-card-setup → machinau-preview だけ）", JSON.stringify(FT.PREVIEW_CV_BILLING_TRIAL_TARGETS) === JSON.stringify({ [BRANCH]: "machinau-preview" }) && Object.isFrozen(FT.PREVIEW_CV_BILLING_TRIAL_TARGETS));

// ---------------- F: the 8 functions check before initializeApp (static) ----------------
const FILES = ["moderate-submission", "expire", "edit-ad", "admin-source-bulk-create", "admin-source-collect", "admin-source-delete", "admin-source-list", "admin-source-save"];
const staticResults = FILES.map((f) => {
  const s = fs.readFileSync(REPO_ROOT + "/api/" + f + ".js", "utf8");
  const start = s.indexOf("function getFirebaseAdminApp()");
  const body = s.slice(start, s.indexOf("\n}", start));
  const readAt = body.indexOf("readFirebaseServiceAccountText(process.env)"), parseAt = body.indexOf("JSON.parse"), assertAt = body.indexOf("assertFirebaseTarget(process.env, serviceAccount)"), initAt = body.indexOf("initializeApp(");
  return { f, ok: start > 0 && readAt > 0 && parseAt > readAt && assertAt > parseAt && initAt > assertAt && !/process\.env\.FIREBASE_SERVICE_ACCOUNT_KEY/.test(s) && /from "\.\/_lib\/firebase-target\.js"/.test(s) };
});
t("F1 8ファイルすべてで、鍵は共通の関数で読み、初期化の直前に接続先を検査する（環境変数を直接読む箇所なし）", staticResults.every((x) => x.ok), staticResults.filter((x) => !x.ok));
const allInits = fs.readdirSync(REPO_ROOT + "/api").filter((f) => f.endsWith(".js")).filter((f) => /initializeApp\(/.test(fs.readFileSync(REPO_ROOT + "/api/" + f, "utf8"))).map((f) => f.replace(/\.js$/, "")).sort();
t("F2 Firebaseを初期化するFunctionは、この8ファイルだけ（取りこぼしなし）", JSON.stringify(allInits) === JSON.stringify([...FILES].sort()), allInits);
t("F3 Functionは11本のまま", fs.readdirSync(REPO_ROOT + "/api").filter((f) => f.endsWith(".js")).length === 11);

// ---------------- H: REAL moderate-submission wiring ----------------
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const setEnv = (env) => {
  for (const k of ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "FIREBASE_SERVICE_ACCOUNT_KEY", PV]) delete process.env[k];
  Object.assign(process.env, env);
  APPS.length = 0; A.inits.length = 0; A.firestore = 0; A.collections = 0;
};
let ip = 0;
const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } });
async function post(body, token) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function get(query) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "GET", headers: { "x-forwarded-for": "198.51.100." + (++ip % 250) }, body: {}, query }, r); } finally { console.error = e; }
  return r;
}
const KEY = (id) => JSON.stringify(sa(id));

// Vercelの切り替え前：対象ブランチに本番用の変数しか無い
setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app") });
let h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H1 対象ブランチで Preview専用の変数が無い（切り替え前）：本番用の変数を使わず、初期化もFirestoreも使わずに失敗で返す", h.code >= 500 && h.body && h.body.success === false && A.inits.length === 0 && A.firestore === 0 && A.collections === 0 && S.writes.length === 0, { code: h.code, body: h.body, A, writes: S.writes.length });
h = await get({});
t("H1b 同じ状態で公開一覧（ログイン不要のGET）も、初期化・Firestoreの前に止まる", h.code >= 500 && A.inits.length === 0 && A.firestore === 0 && A.collections === 0, { code: h.code, A });
h = await post({ mode: "contactInquiryCreate", name: "x", email: "x@example.com", message: "hello" });
t("H1c 同じ状態でログイン不要のPOST（お問い合わせ等）も、Firestoreへ書かない", A.inits.length === 0 && A.collections === 0 && S.writes.length === 0, { code: h.code, A, writes: S.writes.length });

setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("chikashoku-app") });
h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H1e Preview専用の変数に本番の鍵を入れてしまった：止める（project_mismatch）", h.code >= 500 && A.inits.length === 0 && A.collections === 0, { code: h.code, A });

setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("machinau-preview") });
h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H1d 切り替え後（Preview専用の変数＝machinau-preview、共通の変数は本番のまま）：machinau-preview で初期化して処理する（200）", h.code === 200 && h.body.success === true && A.inits.length === 1 && A.inits[0] === "machinau-preview" && S.writes.length === 0, { code: h.code, A });

setEnv({ VERCEL_ENV: "preview", FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app") });
h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H2 Previewでブランチ名が分からず本番の変数しか無い：本番へ切り替えず止める", h.code >= 500 && A.inits.length === 0 && A.collections === 0, { code: h.code, A });

setEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("machinau-preview") });
h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H3 Production（Preview専用の変数があっても）：今までどおり本番で初期化して処理する（200）", h.code === 200 && h.body.success === true && A.inits.length === 1 && A.inits[0] === "chikashoku-app" && A.collections > 0, { code: h.code, A });

setEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: KEY("machinau-preview") });
h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H3b Production の変数に本番以外の鍵（machinau-preview）：初期化もFirestoreも使わずに止める", h.code >= 500 && A.inits.length === 0 && A.collections === 0, { code: h.code, A });

setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("machinau-preview") });
h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H4 ほかのPreviewブランチ：本番の変数があっても machinau-preview で初期化して処理する（200）", h.code === 200 && A.inits.length === 1 && A.inits[0] === "machinau-preview" && S.writes.length === 0, { code: h.code, A });

setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app") });
h = await post({ mode: "imadakeBillingOverview" }, "admin");
t("H4b ほかのPreviewブランチで Preview専用の変数が無い（本番の変数だけ）：本番へ切り替えず止める", h.code >= 500 && A.inits.length === 0 && A.collections === 0 && S.writes.length === 0, { code: h.code, A });
h = await get({});
t("H4c 同じ状態で公開一覧（ログイン不要のGET）も止まる", h.code >= 500 && A.inits.length === 0 && A.collections === 0, { code: h.code, A });

// GET mode=firebaseTarget (browser declaration)
setEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("machinau-preview") });
h = await get({ mode: "firebaseTarget" });
t("H5 接続先の申告（Production）：200・本番のプロジェクトIDだけ・初期化しない", h.code === 200 && h.body.success === true && h.body.projectId === "chikashoku-app" && h.body.enforced === true && A.inits.length === 0 && A.firestore === 0, { code: h.code, body: h.body, A });
t("H5b 申告に鍵の中身・メールアドレスを含めない", !/FAKE-PRIVATE|client_email|iam\.example|private_key/.test(JSON.stringify(h.body)), h.body);
setEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: KEY("machinau-preview") });
h = await get({ mode: "firebaseTarget" });
t("H5c 接続先の申告（Production の変数に本番以外の鍵）：503 project_mismatch", h.code === 503 && h.body.reason === "project_mismatch" && A.inits.length === 0, { code: h.code, body: h.body });
setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app") });
h = await get({ mode: "firebaseTarget" });
t("H6c 接続先の申告（ほかのPreviewブランチ・Preview専用の変数なし）：503 preview_service_account_missing（本番を申告しない）", h.code === 503 && h.body.reason === "preview_service_account_missing" && A.inits.length === 0, { code: h.code, body: h.body });
setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: OTHER, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("machinau-preview") });
h = await get({ mode: "firebaseTarget" });
t("H6d 接続先の申告（ほかのPreviewブランチ・machinau-preview）：200 projectId machinau-preview・検査あり", h.code === 200 && h.body.projectId === "machinau-preview" && h.body.enforced === true, { code: h.code, body: h.body });
setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app") });
h = await get({ mode: "firebaseTarget" });
t("H6 接続先の申告（対象ブランチ・Preview専用の変数なし）：503 preview_service_account_missing", h.code === 503 && h.body.success === false && h.body.reason === "preview_service_account_missing" && A.inits.length === 0, { code: h.code, body: h.body });
setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("chikashoku-app") });
h = await get({ mode: "firebaseTarget" });
t("H6a 接続先の申告（対象ブランチ・Preview専用の変数に本番の鍵）：503 project_mismatch", h.code === 503 && h.body.reason === "project_mismatch", { code: h.code, body: h.body });
setEnv({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY: KEY("chikashoku-app"), [PV]: KEY("machinau-preview") });
h = await get({ mode: "firebaseTarget" });
t("H6b 接続先の申告（対象ブランチ・machinau-preview）：200 projectId machinau-preview・検査あり", h.code === 200 && h.body.success === true && h.body.projectId === "machinau-preview" && h.body.enforced === true && A.inits.length === 0, { code: h.code, body: h.body });
setEnv({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" });
h = await get({ mode: "firebaseTarget" });
t("H7 接続先の申告（サービスアカウントなし）：503", h.code === 503 && h.body.reason === "service_account_unreadable", { code: h.code, body: h.body });

// ---------------- B: browser firebase.js ----------------
const SRC = fs.readFileSync(REPO_ROOT + "/firebase.js", "utf8");
const ORIGINAL = execFileSync("git", ["show", "HEAD:firebase.js"], { cwd: REPO_ROOT, encoding: "utf8" });
const PROD = { apiKey: "AIzaSyBZZn0BjfJ2338f4WW6iQB7iOIKwhplkLE", authDomain: "chikashoku-app.firebaseapp.com", projectId: "chikashoku-app", storageBucket: "chikashoku-app.firebasestorage.app", messagingSenderId: "1091035515947", appId: "1:1091035515947:web:7aa99024a5fef0acf4ee6e" };

function runBrowser(src, hostname, server, opts = {}) {
  const calls = { xhr: [], inits: [], banner: null };
  const apps = opts.existingApp ? [opts.existingApp] : [];
  const firebase = {
    apps,
    app: () => apps[0],
    initializeApp: (cfg) => { calls.inits.push(JSON.parse(JSON.stringify(cfg))); const a = { options: cfg }; apps.push(a); return a; },
    firestore: (app) => ({ db: true, projectId: app.options.projectId })
  };
  class XMLHttpRequest {
    open(method, url, async) { this.method = method; this.url = url; this.async = async; }
    send() {
      calls.xhr.push({ method: this.method, url: this.url, async: this.async });
      if (server === "throw") throw new Error("network");
      this.status = server.status; this.responseText = server.text !== undefined ? server.text : JSON.stringify(server.body);
    }
  }
  const document = { readyState: "complete", body: { appendChild: (el) => { calls.banner = el; } }, getElementById: () => null, createElement: () => ({ setAttribute() {}, style: {} }), addEventListener() {} };
  const window = { location: { hostname } };
  const quiet = { log() {}, error() {}, warn() {} };
  vm.runInNewContext(src, { window, document, firebase, XMLHttpRequest, console: quiet, JSON, Object, String, Error });
  return { calls, window };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const NO_SERVER = { status: 500, body: {} };

for (const host of ["machinau.jp", "www.machinau.jp", "imamiru-web.vercel.app", "9413yutaka-hash.github.io", "127.0.0.1", "localhost"]) {
  const b = runBrowser(SRC, host, NO_SERVER);
  if (!(b.calls.xhr.length === 0 && b.calls.inits.length === 1 && same(b.calls.inits[0], PROD) && b.window.machinauDb && b.window.machinauDb.projectId === "chikashoku-app")) {
    t("B1 本番のドメイン " + host, false, b.calls);
  }
}
t("B1 本番のドメイン（machinau.jp・www・imamiru-web.vercel.app・GitHub Pages・ローカル）：問い合わせせず、本番の設定そのままで初期化", true);
const orig = runBrowser(ORIGINAL, "machinau.jp", NO_SERVER), now = runBrowser(SRC, "machinau.jp", NO_SERVER);
t("B1b 本番のドメインでの初期化は、変更前の firebase.js と同じ（同じ設定・同じ window.machinauDb）", same(orig.calls.inits, now.calls.inits) && same(orig.window.machinauDb, now.window.machinauDb) && !!orig.window.machinauFirebaseApp === !!now.window.machinauFirebaseApp, { orig: orig.calls.inits, now: now.calls.inits });

const PH = "imamiru-abc123-9413yutaka-hashs-projects.vercel.app";
let b = runBrowser(SRC, PH, { status: 200, body: { success: true, projectId: "chikashoku-app", enforced: false } });
t("B2 本番以外のドメインでサーバーが本番のプロジェクトを申告（表にないPreview・本番の個別URL）：本番の設定（今までどおり）", b.calls.xhr.length === 1 && b.calls.xhr[0].url === "/api/moderate-submission?mode=firebaseTarget" && b.calls.xhr[0].method === "GET" && same(b.calls.inits[0], PROD) && b.window.machinauFirebaseTarget.source === "server_production", b.calls);
b = runBrowser(SRC, PH, { status: 503, body: { success: false, reason: "preview_project_not_set" } });
t("B3 サーバーが接続先を確かめられない（503）：Firebaseを初期化しない・machinauDb は null・警告を表示", b.calls.inits.length === 0 && b.window.machinauDb === null && b.window.machinauFirebaseApp === null && b.window.machinauFirebaseTarget.ok === false && b.window.machinauFirebaseTarget.reason === "server_target_unavailable" && b.calls.banner && /停止/.test(b.calls.banner.textContent), { inits: b.calls.inits, target: b.window.machinauFirebaseTarget });
b = runBrowser(SRC, PH, { status: 200, body: { success: true, projectId: PREVIEW_ID } });
t("B4 サーバーが表に無いプロジェクトを申告：初期化しない", b.calls.inits.length === 0 && b.window.machinauDb === null && b.window.machinauFirebaseTarget.reason === "unknown_server_project", b.window.machinauFirebaseTarget);
const MP = { apiKey: "AIzaSyAkBF4yBUrJ1ctdsETiVUuUXF5-Im5J6A4", authDomain: "machinau-preview.firebaseapp.com", projectId: "machinau-preview", storageBucket: "machinau-preview.firebasestorage.app", messagingSenderId: "87817017832", appId: "1:87817017832:web:d57e020c140f2ee5d22c5d" };
b = runBrowser(SRC, PH, { status: 200, body: { success: true, projectId: "machinau-preview", enforced: true } });
t("B4b サーバーが machinau-preview を申告（切り替え後のPreview）：machinau-preview の設定で初期化（本番の設定は使わない）", b.calls.inits.length === 1 && same(b.calls.inits[0], MP) && b.window.machinauDb.projectId === "machinau-preview" && b.window.machinauFirebaseTarget.source === "server_preview", b.calls.inits);
b = runBrowser(SRC, "machinau.jp", { status: 200, body: { success: true, projectId: "machinau-preview" } });
t("B4c 本番のドメインでは machinau-preview の表があっても本番の設定（問い合わせなし）", b.calls.xhr.length === 0 && same(b.calls.inits[0], PROD), b.calls);
b = runBrowser(SRC, PH, "throw");
t("B5 問い合わせが通信失敗：初期化しない", b.calls.inits.length === 0 && b.window.machinauDb === null, b.window.machinauFirebaseTarget);
b = runBrowser(SRC, PH, { status: 200, text: "<html>not json" });
t("B6 応答がJSONでない：初期化しない", b.calls.inits.length === 0 && b.window.machinauDb === null, b.window.machinauFirebaseTarget);
b = runBrowser(SRC, PH, { status: 200, body: { success: true, projectId: "" } });
t("B6b 応答にプロジェクトIDが無い：初期化しない", b.calls.inits.length === 0, b.window.machinauFirebaseTarget);
b = runBrowser(SRC, "machinau.jp.example.com", { status: 503, body: {} });
t("B7 本番のドメインに似た別のドメイン（machinau.jp.example.com）は本番扱いしない（完全一致のみ）", b.calls.xhr.length === 1 && b.calls.inits.length === 0, b.calls);

// with a Preview config table (as it will be after the Preview project exists)
const PCFG = { apiKey: "AIza-preview-fake", authDomain: PREVIEW_ID + ".firebaseapp.com", projectId: PREVIEW_ID, storageBucket: PREVIEW_ID + ".firebasestorage.app", messagingSenderId: "1", appId: "1:1:web:1" };
const withTable = (cfg) => SRC.replace(/const MACHINAU_PREVIEW_FIREBASE_CONFIGS = \{[\s\S]*?\n\};/, "const MACHINAU_PREVIEW_FIREBASE_CONFIGS = { " + JSON.stringify(PREVIEW_ID) + ": " + JSON.stringify(cfg) + " };");
t("B8前提 テスト用に表を差し替えられる", withTable(PCFG) !== SRC);
b = runBrowser(withTable(PCFG), PH, { status: 200, body: { success: true, projectId: PREVIEW_ID, enforced: true } });
t("B8 サーバーと表が同じPreview専用プロジェクト：そのプロジェクトで初期化（本番の設定は使わない）", b.calls.inits.length === 1 && b.calls.inits[0].projectId === PREVIEW_ID && b.window.machinauDb.projectId === PREVIEW_ID && b.window.machinauFirebaseTarget.source === "server_preview", b.calls.inits);
b = runBrowser(withTable({ ...PCFG, projectId: "chikashoku-app" }), PH, { status: 200, body: { success: true, projectId: PREVIEW_ID } });
t("B9 表の設定のプロジェクトIDがサーバーの申告と食い違う：初期化しない", b.calls.inits.length === 0 && b.window.machinauDb === null, b.window.machinauFirebaseTarget);
b = runBrowser(withTable(PCFG), "machinau.jp", { status: 200, body: { success: true, projectId: PREVIEW_ID } });
t("B10 本番のドメインでは、Previewの表があってもサーバーが何を言っても本番の設定（テスト用Firebaseに接続しない）", b.calls.xhr.length === 0 && same(b.calls.inits[0], PROD), b.calls);
b = runBrowser(SRC, "machinau.jp", NO_SERVER, { existingApp: { options: { projectId: "other-project" } } });
t("B11 既に別のプロジェクトのアプリがあれば machinauDb を作らない", b.window.machinauDb === null && b.calls.inits.length === 0, b.window);
b = runBrowser(SRC, PH, { status: 200, body: { success: true, projectId: "chikashoku-app" } });
t("B12 問い合わせは同期・GETのみ（他のスクリプトより先に接続先が決まる）", b.calls.xhr.length === 1 && b.calls.xhr[0].async === false && b.calls.xhr[0].method === "GET");

t("Z 全体を通してFirestoreへの書き込みゼロ", S.writes.length === 0, S.writes.length);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
