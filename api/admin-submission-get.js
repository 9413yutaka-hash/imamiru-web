import {
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";

import {
  getFirestore
} from "firebase-admin/firestore";

import {
  getAuth
} from "firebase-admin/auth";


function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountText =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountText) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY が設定されていません。"
    );
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(
      serviceAccountText
    );
  } catch (error) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY のJSON形式が正しくありません。"
    );
  }

  return initializeApp({
    credential: cert(serviceAccount)
  });
}


function readBearerToken(
  request
) {
  const authorizationHeader =
    request.headers &&
    request.headers.authorization;

  if (
    typeof authorizationHeader !== "string"
  ) {
    return "";
  }

  const match =
    authorizationHeader.match(
      /^Bearer\s+(.+)$/
    );

  if (!match) {
    return "";
  }

  return match[1].trim();
}


export default async function handler(
  request,
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (
    request.method !== "GET"
  ) {
    response.setHeader(
      "Allow",
      "GET"
    );

    return response.status(405).json({
      success: false,
      message:
        "GETのみ利用できます。"
    });
  }

  const adminEmail =
    process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    return response.status(500).json({
      success: false,
      message:
        "管理者メールアドレスが設定されていません。"
    });
  }

  const idToken =
    readBearerToken(
      request
    );

  if (idToken === "") {
    return response.status(401).json({
      success: false,
      message:
        "認証情報がありません。"
    });
  }

  try {
    const app =
      getFirebaseAdminApp();

    let decodedToken;

    try {
      decodedToken =
        await getAuth(app)
          .verifyIdToken(
            idToken
          );
    } catch (verifyError) {
      return response.status(401).json({
        success: false,
        message:
          "認証情報が正しくありません。"
      });
    }

    const decodedEmail =
      String(
        decodedToken.email || ""
      )
        .toLowerCase();

    if (
      decodedEmail === "" ||
      decodedEmail !==
        adminEmail.toLowerCase()
    ) {
      return response.status(403).json({
        success: false,
        message:
          "管理者権限がありません。"
      });
    }

    const documentId =
      request.query &&
      typeof request.query.id === "string"
        ? request.query.id.trim()
        : "";

    if (documentId === "") {
      return response.status(400).json({
        success: false,
        message:
          "documentIdを指定してください。"
      });
    }

    const database =
      getFirestore(app);

    const documentSnapshot =
      await database
        .collection(
          "submissions"
        )
        .doc(
          documentId
        )
        .get();

    if (
      !documentSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の投稿が見つかりませんでした。"
      });
    }

    const data =
      documentSnapshot.data() ||
      {};

    if (
      data.postType !== "admin"
    ) {
      return response.status(403).json({
        success: false,
        message:
          "この投稿は編集できません。"
      });
    }

    const expiresAtValue =
      data.expiresAt &&
      typeof data.expiresAt.toDate === "function"
        ? data.expiresAt
            .toDate()
            .toISOString()
        : null;

    return response.status(200).json({
      success: true,
      submission: {
        id:
          documentSnapshot.id,

        title:
          data.title || "",

        category:
          data.category || "",

        content:
          data.content || "",

        expiresAt:
          expiresAtValue,

        address:
          data.address || "",

        latitude:
          typeof data.latitude === "number"
            ? data.latitude
            : null,

        longitude:
          typeof data.longitude === "number"
            ? data.longitude
            : null,

        imageUrls:
          Array.isArray(
            data.imageUrls
          )
            ? data.imageUrls
            : [],

        websiteUrl:
          data.websiteUrl || "",

        sourceLabel:
          data.sourceLabel || "",

        postType:
          data.postType || ""
      }
    });
  } catch (error) {
    console.error(
      "運営情報の取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "投稿内容の取得に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
