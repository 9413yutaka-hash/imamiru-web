// ==========================================================================
// Preview専用Firebaseへの分離 STEP 32-D㉗／STEP 45-B｜サーバーのFirebase接続先の検査(サーバー側のみ)
// ==========================================================================
// STEP 45-B(代表承認 A案)：接続先はブランチ名ではなく Vercel の環境(VERCEL_ENV)だけで決める。
//   ・Production：FIREBASE_SERVICE_ACCOUNT_KEY だけを読み、project_id が本番(chikashoku-app)の時だけ使う。
//   ・Preview(ブランチに関係なく)：FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW だけを読み、project_id が
//     Preview専用(machinau-preview)の時だけ使う。無い時は止める(本番用の FIREBASE_SERVICE_ACCOUNT_KEY へは切り替えない)。
//   ・それ以外(ローカル・テスト・vercel dev)：今までどおり FIREBASE_SERVICE_ACCOUNT_KEY を読み、検査しない。
// 以前はブランチの表(preview/stripe-card-setup だけ)で振り分けていたため、表にない Preview は
// 本番の鍵で本番のFirestoreへつながっていた。それを防ぐ。
// 次のどれかなら、Firebaseを初期化する前に止める(書き込みも読み取りもしない)：
//   ・サービスアカウントが無い・JSONでない・project_id が期待値と違う
// Preview試験の機能(課金対象の印・月末締めの書き込み・月額プランの申込など)の有効条件は、下の
// PREVIEW_CV_BILLING_TRIAL_TARGETS(ブランチの表)のまま変えない(接続先の判定とは別)。
// プロジェクトIDは秘密ではない(ブラウザ用の設定にも含まれる)。鍵の中身はどこにも出さない。
// このファイルはVercel Functionではない。
// ==========================================================================

export const PRODUCTION_FIREBASE_PROJECT_ID =
  "chikashoku-app";

// Vercel の Preview はブランチに関係なく、このPreview専用Firebase(東京、2026-10-19構築)だけを使う。
export const PREVIEW_FIREBASE_PROJECT_ID =
  "machinau-preview";

// Preview のサーバーが読む、Preview専用Firebaseのサービスアカウント。
export const PREVIEW_SERVICE_ACCOUNT_ENV_NAME =
  "FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW";

const PRODUCTION_SERVICE_ACCOUNT_ENV_NAME =
  "FIREBASE_SERVICE_ACCOUNT_KEY";

export class FirebaseTargetError extends Error {
  constructor(reason) {
    super("Firebaseの接続先を確認できないため停止しました(" + reason + ")。");
    this.name = "FirebaseTargetError";
    this.reason = reason;
  }
}

function readProjectIdFromServiceAccount(serviceAccount) {
  return serviceAccount && typeof serviceAccount.project_id === "string"
    ? serviceAccount.project_id
    : "";
}

function readBranch(source) {
  return typeof source.VERCEL_GIT_COMMIT_REF === "string" ? source.VERCEL_GIT_COMMIT_REF.trim() : "";
}

// 環境ごとに、どの変数から鍵を読み、どのプロジェクトなら使ってよいか。
// enforced:false はローカル・テスト(検査しない、今までどおり)。
function resolveExpectation(env) {
  const source = env || {};

  if (source.VERCEL_ENV === "production") {
    return { enforced: true, envName: PRODUCTION_SERVICE_ACCOUNT_ENV_NAME, expectedProjectId: PRODUCTION_FIREBASE_PROJECT_ID };
  }

  if (source.VERCEL_ENV === "preview") {
    return { enforced: true, envName: PREVIEW_SERVICE_ACCOUNT_ENV_NAME, expectedProjectId: PREVIEW_FIREBASE_PROJECT_ID };
  }

  return { enforced: false, envName: PRODUCTION_SERVICE_ACCOUNT_ENV_NAME, expectedProjectId: "" };
}

// その環境の鍵(JSON文字列)。Preview で Preview専用の変数が無い時は "" (呼び出し側が止める)。
function readServiceAccountSource(env) {
  const source = env || {};
  const expectation = resolveExpectation(source);
  const value = source[expectation.envName];

  if (expectation.envName === PREVIEW_SERVICE_ACCOUNT_ENV_NAME) {
    return { preview: true, text: typeof value === "string" ? value : "" };
  }

  return { preview: false, text: value };
}

// Firebase Admin SDK の初期化で使う鍵(JSON文字列)を返す。Preview で Preview専用の変数が無い時は止める。
// Production・ローカルでは FIREBASE_SERVICE_ACCOUNT_KEY の値をそのまま返す(未設定の扱いは今までどおり呼び出し側)。
export function readFirebaseServiceAccountText(env) {
  const source = readServiceAccountSource(env);

  if (source.preview && source.text === "") {
    throw new FirebaseTargetError("preview_service_account_missing");
  }

  return source.text;
}

// 環境変数のサービスアカウント(JSON文字列)から project_id だけを読む。読めなければ ""。
export function readServiceAccountProjectId(env) {
  const raw = readServiceAccountSource(env).text;
  const text = typeof raw === "string" ? raw : "";

  if (text === "") {
    return "";
  }

  try {
    return readProjectIdFromServiceAccount(JSON.parse(text));
  } catch (error) {
    return "";
  }
}

// 接続先の検査。戻り値 { ok, enforced, branch, expectedProjectId, projectId, reason }
//   enforced:false は検査の対象外(ローカル・テスト)。ok:false の時はFirebaseを使ってはいけない。
//   branch は記録用(判定には使わない)。
export function checkFirebaseTarget(env, serviceAccount) {
  const source = env || {};
  const expectation = resolveExpectation(source);
  const projectId = readProjectIdFromServiceAccount(serviceAccount);
  const branch = readBranch(source);

  if (!expectation.enforced) {
    return { ok: true, enforced: false, branch: branch, expectedProjectId: "", projectId: projectId, reason: "" };
  }

  const result = { ok: false, enforced: true, branch: branch, expectedProjectId: expectation.expectedProjectId, projectId: projectId, reason: "" };

  if (projectId === "") {
    return { ...result, reason: "service_account_unreadable" };
  }

  if (projectId !== expectation.expectedProjectId) {
    return { ...result, reason: "project_mismatch" };
  }

  return { ...result, ok: true, reason: "" };
}

// Firebase Admin SDK を初期化する直前に呼ぶ。止めるべき時は FirebaseTargetError を投げる。
export function assertFirebaseTarget(env, serviceAccount) {
  const result = checkFirebaseTarget(env, serviceAccount);

  if (!result.ok) {
    throw new FirebaseTargetError(result.reason);
  }

  return result;
}

// 環境変数だけで検査する(Firebaseを初期化しない)。ブラウザへの接続先の申告に使う。
export function checkFirebaseTargetFromEnv(env) {
  const source = readServiceAccountSource(env);
  const text = typeof source.text === "string" ? source.text : "";
  let serviceAccount = null;

  if (source.preview && text === "") {
    return { ok: false, enforced: true, branch: readBranch(env || {}), expectedProjectId: PREVIEW_FIREBASE_PROJECT_ID, projectId: "", reason: "preview_service_account_missing" };
  }

  if (text !== "") {
    try {
      serviceAccount = JSON.parse(text);
    } catch (error) {
      serviceAccount = null;
    }
  }

  const result = checkFirebaseTarget(env, serviceAccount);

  if (result.ok && result.projectId === "") {
    // 検査の対象外でも、プロジェクトIDを申告できない時はブラウザに接続先を教えられない。
    return { ...result, ok: false, reason: "service_account_unreadable" };
  }

  return result;
}

// ==========================================================================
// STEP 34-A｜Preview専用の課金対象判定（今だけ投稿の「課金対象の印」だけに使う）
// ==========================================================================
// 対象ブランチのPreviewで、サーバーのFirebase接続先が Preview専用プロジェクトだと確認できた時だけ true。
// 次をすべて満たす必要がある(1つでも不明・不一致なら false)：
//   ・VERCEL_ENV が "preview"
//   ・ブランチ(VERCEL_GIT_COMMIT_REF)が下の表にある
//   ・接続先の検査(checkFirebaseTargetFromEnv)が通り、検査の対象(enforced)で、
//     サーバーの鍵の project_id が表の期待値と一致し、本番のIDではない
// 請求(月次請求の実行・Stripe)・月末締めの書き込みには使わない(それぞれのフラグはfalseのまま)。
export const PREVIEW_CV_BILLING_TRIAL_TARGETS = Object.freeze({
  "preview/stripe-card-setup": "machinau-preview"
});

export function isPreviewCvBillingTrialEnabled(env, targets) {
  const source = env || {};

  if (source.VERCEL_ENV !== "preview") {
    return false;
  }

  const branch = typeof source.VERCEL_GIT_COMMIT_REF === "string" ? source.VERCEL_GIT_COMMIT_REF.trim() : "";
  const table = targets || PREVIEW_CV_BILLING_TRIAL_TARGETS;

  if (branch === "" || !Object.prototype.hasOwnProperty.call(table, branch)) {
    return false;
  }

  const expected = table[branch];

  if (typeof expected !== "string" || expected === "" || expected === PRODUCTION_FIREBASE_PROJECT_ID) {
    return false;
  }

  const target = checkFirebaseTargetFromEnv(source);

  return (
    target.ok === true &&
    target.enforced === true &&
    target.projectId === expected &&
    target.projectId !== PRODUCTION_FIREBASE_PROJECT_ID
  );
}

// STEP 37-C｜Preview限定の月末締めの書き込み許可。STEP 34-A の試験環境の判定
// (Preview・対象ブランチ・サーバーの鍵が machinau-preview)をそのまま使う。月末締めの書き込みだけに使い、
// 月次請求(Stripe)の実行には使わない。Productionでは常に false。
export function isPreviewMonthlyCloseTrialEnabled(env, targets) {
  return isPreviewCvBillingTrialEnabled(env, targets);
}

// STEP 38-B｜店舗向けの請求履歴(読み取り専用)を Preview試験の環境で見せてよいか。条件は課金対象判定の試験と同じ
// (Preview・対象ブランチ・machinau-preview)。請求・締め・Stripeの実行には使わない。
export function isPreviewStoreInvoiceHistoryEnabled(env, targets) {
  return isPreviewCvBillingTrialEnabled(env, targets);
}

// STEP 42-F｜運営掲載の写真の複製の Preview 実証(試験の印のある掲載だけ)を行ってよいか。条件は課金対象判定の試験と同じ
// (Preview・対象ブランチ・machinau-preview)。Productionでは常に false。請求・締め・Stripeの実行には使わない。
export function isPreviewListingPhotoCopyTrialEnabled(env, targets) {
  return isPreviewCvBillingTrialEnabled(env, targets);
}

// STEP 44-B｜月額100円カスタマイズの申込(Preview試験の仮の契約、Stripe の請求なし)を受け付けてよいか。
// 条件は課金対象判定の試験と同じ(Preview・対象ブランチ・machinau-preview)。Productionでは常に false。
export function isPreviewStoreCustomPlanTrialEnabled(env, targets) {
  return isPreviewCvBillingTrialEnabled(env, targets);
}
