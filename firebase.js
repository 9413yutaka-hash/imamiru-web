const firebaseConfig = {
  apiKey: "AIzaSyBZZn0BjfJ2338f4WW6iQB7iOIKwhplkLE",
  authDomain: "chikashoku-app.firebaseapp.com",
  projectId: "chikashoku-app",
  storageBucket: "chikashoku-app.firebasestorage.app",
  messagingSenderId: "1091035515947",
  appId: "1:1091035515947:web:7aa99024a5fef0acf4ee6e"
};

try {
  const firebaseApp = firebase.apps.length
    ? firebase.app()
    : firebase.initializeApp(firebaseConfig);

  const firestoreDb = firebase.firestore(firebaseApp);

  window.imamiruFirebaseApp = firebaseApp;
  window.imamiruDb = firestoreDb;

  console.log("✅ イマミルとFirebaseの接続に成功しました");
} catch (error) {
  console.error("❌ Firebaseの初期化に失敗しました", error);

  window.imamiruFirebaseApp = null;
  window.imamiruDb = null;
}