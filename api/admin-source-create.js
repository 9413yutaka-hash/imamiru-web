import {
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";

import {
  FieldValue,
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


const ALLOWED_SOURCE_TYPES = [
  "行政",
  "観光施設",
  "イベント",
  "交通",
  "防災・気象",
  "その他"
];


const FIELD_MAX_LENGTHS = {
  name: 80,
  url: 300,
  area: 80,
  feedUrl: 300
};


const MAX_SOURCE_COUNT = 100;


function validateSourceFields(
  requestBody
) {
  const name =
    String(
      requestBody.name || ""
    )
      .trim();

  if (name === "") {
    throw new Error(
      "情報源名を入力してください。"
    );
  }

  if (
    name.length >
    FIELD_MAX_LENGTHS.name
  ) {
    throw new Error(
      "情報源名が長すぎます。"
    );
  }

  const url =
    String(
      requestBody.url || ""
    )
      .trim();

  if (url === "") {
    throw new Error(
      "情報源URLを入力してください。"
    );
  }

  if (
    url.length >
    FIELD_MAX_LENGTHS.url
  ) {
    throw new Error(
      "情報源URLが長すぎます。"
    );
  }

  if (
    !/^https?:\/\//.test(
      url
    )
  ) {
    throw new Error(
      "情報源URLは「https://」または「http://」から始まる形で入力してください。"
    );
  }

  const sourceType =
    String(
      requestBody.sourceType || ""
    )
      .trim();

  if (
    !ALLOWED_SOURCE_TYPES.includes(
      sourceType
    )
  ) {
    throw new Error(
      "種類を選択してください。"
    );
  }

  const area =
    String(
      requestBody.area || ""
    )
      .trim();

  if (
    area.length >
    FIELD_MAX_LENGTHS.area
  ) {
    throw new Error(
      "対象地域が長すぎます。"
    );
  }

  if (
    typeof requestBody.isEnabled !== "boolean"
  ) {
    throw new Error(
      "有効／停止の値が正しくありません。"
    );
  }

  const feedUrl =
    String(
      requestBody.feedUrl || ""
    )
      .trim();

  if (
    feedUrl.length >
    FIELD_MAX_LENGTHS.feedUrl
  ) {
    throw new Error(
      "RSS URLが長すぎます。"
    );
  }

  if (
    feedUrl !== "" &&
    !/^https?:\/\//.test(
      feedUrl
    )
  ) {
    throw new Error(
      "RSS URLは「https://」または「http://」から始まる形で入力してください。"
    );
  }

  return {
    name: name,
    url: url,
    sourceType: sourceType,
    area: area,
    isEnabled: requestBody.isEnabled,
    feedUrl: feedUrl
  };
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

    let sourceFields;

    try {
      sourceFields =
        validateSourceFields(
          requestBody
        );
    } catch (validationError) {
      return response.status(400).json({
        success: false,
        message:
          validationError.message
      });
    }

    const database =
      getFirestore(app);

    const duplicateSnapshot =
      await database
        .collection(
          "aiSources"
        )
        .where(
          "url",
          "==",
          sourceFields.url
        )
        .limit(1)
        .get();

    if (
      !duplicateSnapshot.empty
    ) {
      return response.status(409).json({
        success: false,
        message:
          "このURLは既に登録されています。"
      });
    }

    const countSnapshot =
      await database
        .collection(
          "aiSources"
        )
        .count()
        .get();

    if (
      countSnapshot.data().count >=
      MAX_SOURCE_COUNT
    ) {
      return response.status(400).json({
        success: false,
        message:
          "情報源の登録件数が上限（" +
          MAX_SOURCE_COUNT +
          "件）に達しています。"
      });
    }

    await database
      .collection(
        "aiSources"
      )
      .add({
        name:
          sourceFields.name,

        url:
          sourceFields.url,

        sourceType:
          sourceFields.sourceType,

        area:
          sourceFields.area,

        isEnabled:
          sourceFields.isEnabled,

        feedUrl:
          sourceFields.feedUrl,

        createdAt:
          FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp()
      });

    return response.status(200).json({
      success: true,
      message:
        "情報源を登録しました。"
    });
  } catch (error) {
    console.error(
      "情報源の登録エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "情報源の登録に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
