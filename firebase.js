// Firebase接続用ファイル
// 次の工程で、Firebase設定とFirestore読み込み処理をここに追加します。
// 現在は空のままで問題ありません。
const firebaseConfig = {
  apiKey: "AIzaSyBZZn0BjfJ2338f4WW6iQB7iOIKwhplkLE",
  authDomain: "chikashoku-app.firebaseapp.com",
  projectId: "chikashoku-app",
  storageBucket: "chikashoku-app.firebasestorage.app",
  messagingSenderId: "1091035515947",
  appId: "1:1091035515947:web:7aa99024a5fef0acf4ee6e"
};

const firebaseApp = firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

window.imamiruFirebaseApp = firebaseApp;
window.imamiruDb = db;

console.log("✅ イマミルとFirebaseの接続に成功しました");