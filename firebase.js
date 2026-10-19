const firebaseConfig = {
  apiKey: "AIzaSyBZZn0BjfJ2338f4WW6iQB7iOIKwhplkLE",
  authDomain: "chikashoku-app.firebaseapp.com",
  projectId: "chikashoku-app",
  storageBucket: "chikashoku-app.firebasestorage.app",
  messagingSenderId: "1091035515947",
  appId: "1:1091035515947:web:7aa99024a5fef0acf4ee6e"
};

// Preview専用Firebaseの分離 STEP 32-D㉗｜ブラウザのFirebase接続先の決め方。
// ・本番のドメイン(下の一覧)では、上の本番の設定をそのまま使う(サーバーへの問い合わせもしない)。
// ・それ以外のドメインでは、サーバーに接続先(プロジェクトID)を問い合わせ、
//     本番のプロジェクト → 上の本番の設定(表にないPreviewブランチ・本番の個別URLは今までどおり)
//     下の表にあるPreview専用プロジェクト → その設定
//   と、サーバーと同じプロジェクトの時だけ初期化する。問い合わせに失敗した・表に無い・
//   設定とプロジェクトIDが食い違う時は、Firebaseを初期化しない(ログイン・読み書きを止める)。
// 本番のドメイン以外を一律にPreviewとはみなさない(接続先はサーバーの申告で決める)。
const MACHINAU_PRODUCTION_HOSTNAMES = [
  "machinau.jp",
  "www.machinau.jp",
  "imamiru-web.vercel.app",
  "9413yutaka-hash.github.io",
  // ローカルの確認(テスト)は今までどおり本番の設定(サーバーの無い静的配信のため)。
  "localhost",
  "127.0.0.1"
];

// Preview専用プロジェクトのブラウザ用設定(公開してよい値)。プロジェクトID → 設定。
// 表にないプロジェクトを申告されたら止まる。値は Firebase CLI の apps:sdkconfig で取得したもの(2026-10-19)。
const MACHINAU_PREVIEW_FIREBASE_CONFIGS = {
  "machinau-preview": {
    apiKey: "AIzaSyAkBF4yBUrJ1ctdsETiVUuUXF5-Im5J6A4",
    authDomain: "machinau-preview.firebaseapp.com",
    projectId: "machinau-preview",
    storageBucket: "machinau-preview.firebasestorage.app",
    messagingSenderId: "87817017832",
    appId: "1:87817017832:web:d57e020c140f2ee5d22c5d"
  }
};

const MACHINAU_FIREBASE_TARGET_URL =
  "/api/moderate-submission?mode=firebaseTarget";

function resolveMachinauFirebaseConfig(hostname, readServerTarget) {
  if (MACHINAU_PRODUCTION_HOSTNAMES.indexOf(String(hostname || "")) !== -1) {
    return { ok: true, config: firebaseConfig, source: "production_host" };
  }

  let target = null;

  try {
    target = readServerTarget();
  } catch (error) {
    target = null;
  }

  if (!target || target.success !== true || typeof target.projectId !== "string" || target.projectId === "") {
    return { ok: false, reason: "server_target_unavailable" };
  }

  if (target.projectId === firebaseConfig.projectId) {
    return { ok: true, config: firebaseConfig, source: "server_production" };
  }

  const previewConfig = Object.prototype.hasOwnProperty.call(MACHINAU_PREVIEW_FIREBASE_CONFIGS, target.projectId)
    ? MACHINAU_PREVIEW_FIREBASE_CONFIGS[target.projectId]
    : null;

  if (!previewConfig || previewConfig.projectId !== target.projectId) {
    return { ok: false, reason: "unknown_server_project" };
  }

  return { ok: true, config: previewConfig, source: "server_preview" };
}

// サーバーの申告を同期で読む(ページの他のスクリプトより先に接続先を決めるため)。本番のドメインでは呼ばれない。
function readMachinauServerFirebaseTarget() {
  const request = new XMLHttpRequest();
  request.open("GET", MACHINAU_FIREBASE_TARGET_URL, false);
  request.send(null);

  if (request.status !== 200) {
    return null;
  }

  return JSON.parse(request.responseText);
}

function showMachinauFirebaseStopped(reason) {
  const show = function() {
    if (!document.body || document.getElementById("machinauFirebaseStopped")) {
      return;
    }

    const banner = document.createElement("div");
    banner.id = "machinauFirebaseStopped";
    banner.setAttribute("role", "alert");
    banner.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#a5303b;color:#fff;padding:10px 16px;font:700 14px/1.5 sans-serif;";
    banner.textContent = "接続先を確認できないため、ログインとデータの読み書きを停止しています（" + reason + "）。";
    document.body.appendChild(banner);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", show);
  } else {
    show();
  }
}

const machinauFirebaseTarget =
  resolveMachinauFirebaseConfig(window.location.hostname, readMachinauServerFirebaseTarget);

window.machinauFirebaseTarget = {
  ok: machinauFirebaseTarget.ok,
  source: machinauFirebaseTarget.source || "",
  projectId: machinauFirebaseTarget.ok ? machinauFirebaseTarget.config.projectId : "",
  reason: machinauFirebaseTarget.reason || ""
};

if (!machinauFirebaseTarget.ok) {
  console.error("❌ Firebaseの接続先を確認できないため、初期化しません", machinauFirebaseTarget.reason);

  window.machinauFirebaseApp = null;
  window.machinauDb = null;
  showMachinauFirebaseStopped(machinauFirebaseTarget.reason);
} else {
  try {
    const firebaseApp = firebase.apps.length
      ? firebase.app()
      : firebase.initializeApp(machinauFirebaseTarget.config);

    // 既に初期化済みのアプリがあれば、そのプロジェクトも決めた接続先と同じであることを確かめる。
    if (!firebaseApp.options || firebaseApp.options.projectId !== machinauFirebaseTarget.config.projectId) {
      throw new Error("Firebaseアプリの接続先が一致しません。");
    }

    const firestoreDb = firebase.firestore(firebaseApp);

    window.machinauFirebaseApp = firebaseApp;
    window.machinauDb = firestoreDb;

    console.log("✅ マチナウとFirebaseの接続に成功しました");
  } catch (error) {
    console.error("❌ Firebaseの初期化に失敗しました", error);

    window.machinauFirebaseApp = null;
    window.machinauDb = null;
  }
}
