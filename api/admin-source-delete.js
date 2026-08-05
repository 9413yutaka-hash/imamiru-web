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


function readRequestBody(
  request
) {
  if (
    request.body &&
    typeof request.body === "object"
  ) {
    return request.body;
  }

  if (
    typeof request.body === "string"
  ) {
    try {
      return JSON.parse(
        request.body
      );
    } catch (error) {
      return {};
    }
  }

  return {};
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
    request.method !== "POST"
  ) {
    response.setHeader(
      "Allow",
      "POST"
    );

    return response.status(405).json({
      success: false,
      message:
        "POSTのみ利用できます。"
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

    const requestBody =
      readRequestBody(
        request
      );

    const documentId =
      typeof requestBody.documentId === "string"
        ? requestBody.documentId.trim()
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

    const documentReference =
      database
        .collection(
          "aiSources"
        )
        .doc(
          documentId
        );

    const documentSnapshot =
      await documentReference.get();

    if (
      !documentSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の情報源が見つかりませんでした。"
      });
    }

    await documentReference.delete();

    return response.status(200).json({
      success: true,
      message:
        "情報源を削除しました。"
    });
  } catch (error) {
    console.error(
      "情報源の削除エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "情報源の削除に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
