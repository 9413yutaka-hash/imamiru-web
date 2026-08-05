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


function toIsoStringOrNull(
  timestampValue
) {
  if (
    timestampValue &&
    typeof timestampValue.toDate === "function"
  ) {
    return timestampValue
      .toDate()
      .toISOString();
  }

  return null;
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

    const database =
      getFirestore(app);

    const querySnapshot =
      await database
        .collection(
          "aiSources"
        )
        .orderBy(
          "createdAt",
          "desc"
        )
        .get();

    const sources =
      querySnapshot.docs.map(
        function(documentSnapshot) {
          const data =
            documentSnapshot.data() ||
            {};

          return {
            id:
              documentSnapshot.id,

            name:
              data.name || "",

            url:
              data.url || "",

            sourceType:
              data.sourceType || "",

            area:
              data.area || "",

            isEnabled:
              data.isEnabled === true,

            createdAt:
              toIsoStringOrNull(
                data.createdAt
              ),

            updatedAt:
              toIsoStringOrNull(
                data.updatedAt
              )
          };
        }
      );

    return response.status(200).json({
      success: true,
      sources: sources
    });
  } catch (error) {
    console.error(
      "情報源一覧の取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "情報源一覧の取得に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
