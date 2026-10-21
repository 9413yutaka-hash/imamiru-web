// ==========================================================================
// Preview専用Firebaseへの分離 STEP 32-D㉗｜サーバーのFirebase接続先の検査(サーバー側のみ)
// ==========================================================================
// PreviewとProductionは同じFirestoreを使っている。特定のPreviewブランチだけを専用のFirebase
// プロジェクトへ向けるとき、Vercelのブランチ専用の FIREBASE_SERVICE_ACCOUNT_KEY が効いていない
// (追加できない・消えた等)と、気づかないまま本番のFirestoreへ書き込んでしまう。それを防ぐため、
// 対象ブランチではサービスアカウントの project_id が期待値と一致する時だけFirebaseを使う。
//
// 検査するのは VERCEL_ENV が "preview" で、ブランチ(VERCEL_GIT_COMMIT_REF)が下の表にある時だけ。
// Production・ローカル・表にないPreviewブランチは検査しない(今までどおり)。
// 対象ブランチで次のどれかなら、Firebaseを初期化する前に止める(書き込みも読み取りもしない)：
//   ・期待するプロジェクトIDが未設定(Preview専用プロジェクトの作成前)
//   ・期待するプロジェクトIDが本番のID
//   ・サービスアカウントが無い・JSONでない・project_id が期待値と違う
// Previewでブランチ名が分からない時も止める(対象かどうか判断できないため)。
// 鍵の読み先(STEP 32-D㊲ B案)：対象ブランチでは FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW だけを読む。無ければ止める
// (本番用の FIREBASE_SERVICE_ACCOUNT_KEY へは切り替えない)。それ以外は今までどおり FIREBASE_SERVICE_ACCOUNT_KEY。
// プロジェクトIDは秘密ではない(ブラウザ用の設定にも含まれる)。鍵の中身はどこにも出さない。
// このファイルはVercel Functionではない。
// ==========================================================================

export const PRODUCTION_FIREBASE_PROJECT_ID =
  "chikashoku-app";

// Previewブランチ → そのブランチが使うPreview専用FirebaseのプロジェクトID。
// 空文字は「まだ決まっていない」＝そのブランチではFirebaseを使わずに止める。
// preview/stripe-card-setup は Preview専用Firebase machinau-preview(東京、2026-10-19構築)を使う。
export const PREVIEW_FIREBASE_TARGETS = Object.freeze({
  "preview/stripe-card-setup": "machinau-preview"
});

// 対象ブランチのサーバーが読む、Preview専用Firebaseのサービスアカウント(Vercelでブランチ専用に設定する)。
export const PREVIEW_SERVICE_ACCOUNT_ENV_NAME =
  "FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW";

const PROJECT_ID_PATTERN =
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

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

// どの環境変数から鍵を読むか。対象ブランチ(Previewで表にあるブランチ)なら Preview専用の変数だけ。
function resolveServiceAccountSource(env, targets) {
  const source = env || {};
  const table = targets || PREVIEW_FIREBASE_TARGETS;
  const branch = typeof source.VERCEL_GIT_COMMIT_REF === "string" ? source.VERCEL_GIT_COMMIT_REF.trim() : "";

  if (source.VERCEL_ENV === "preview" && branch !== "" && Object.prototype.hasOwnProperty.call(table, branch)) {
    const text = typeof source[PREVIEW_SERVICE_ACCOUNT_ENV_NAME] === "string" ? source[PREVIEW_SERVICE_ACCOUNT_ENV_NAME] : "";
    return { targeted: true, text: text };
  }

  return { targeted: false, text: source.FIREBASE_SERVICE_ACCOUNT_KEY };
}

// Firebase Admin SDK の初期化で使う鍵(JSON文字列)を返す。対象ブランチで Preview専用の変数が無い時は止める。
// 対象外では今までどおり FIREBASE_SERVICE_ACCOUNT_KEY の値をそのまま返す(未設定の扱いも今までどおり呼び出し側)。
export function readFirebaseServiceAccountText(env, targets) {
  const source = resolveServiceAccountSource(env, targets);

  if (source.targeted && source.text === "") {
    throw new FirebaseTargetError("preview_service_account_missing");
  }

  return source.text;
}

// 環境変数のサービスアカウント(JSON文字列)から project_id だけを読む。読めなければ ""。
export function readServiceAccountProjectId(env, targets) {
  const raw = resolveServiceAccountSource(env, targets).text;
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
//   enforced:false は検査の対象外(今までどおり)。ok:false の時はFirebaseを使ってはいけない。
//   targets は省略時 PREVIEW_FIREBASE_TARGETS(テストで別の表を渡すためだけの引数)。
export function checkFirebaseTarget(env, serviceAccount, targets) {
  const source = env || {};
  const table = targets || PREVIEW_FIREBASE_TARGETS;
  const projectId = readProjectIdFromServiceAccount(serviceAccount);

  if (source.VERCEL_ENV !== "preview") {
    return { ok: true, enforced: false, branch: "", expectedProjectId: "", projectId: projectId, reason: "" };
  }

  const branch = typeof source.VERCEL_GIT_COMMIT_REF === "string" ? source.VERCEL_GIT_COMMIT_REF.trim() : "";

  if (branch === "") {
    return { ok: false, enforced: true, branch: "", expectedProjectId: "", projectId: projectId, reason: "preview_branch_unknown" };
  }

  if (!Object.prototype.hasOwnProperty.call(table, branch)) {
    return { ok: true, enforced: false, branch: branch, expectedProjectId: "", projectId: projectId, reason: "" };
  }

  const expectedProjectId = table[branch];
  const result = { ok: false, enforced: true, branch: branch, expectedProjectId: expectedProjectId, projectId: projectId, reason: "" };

  if (typeof expectedProjectId !== "string" || expectedProjectId === "") {
    return { ...result, reason: "preview_project_not_set" };
  }

  if (expectedProjectId === PRODUCTION_FIREBASE_PROJECT_ID || !PROJECT_ID_PATTERN.test(expectedProjectId)) {
    return { ...result, reason: "preview_project_invalid" };
  }

  if (projectId === "") {
    return { ...result, reason: "service_account_unreadable" };
  }

  if (projectId !== expectedProjectId) {
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
export function checkFirebaseTargetFromEnv(env, targets) {
  const source = resolveServiceAccountSource(env, targets);
  const text = typeof source.text === "string" ? source.text : "";
  let serviceAccount = null;

  if (source.targeted && text === "") {
    return { ok: false, enforced: true, branch: String((env || {}).VERCEL_GIT_COMMIT_REF || "").trim(), expectedProjectId: "", projectId: "", reason: "preview_service_account_missing" };
  }

  if (text !== "") {
    try {
      serviceAccount = JSON.parse(text);
    } catch (error) {
      serviceAccount = null;
    }
  }

  const result = checkFirebaseTarget(env, serviceAccount, targets);

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
