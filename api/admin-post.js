import {
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";

import {
  FieldValue,
  Timestamp,
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


const ALLOWED_CATEGORIES = [
  "お知らせ",
  "イベント",
  "観光・体験",
  "グルメ",
  "カフェ・スイーツ",
  "ショッピング",
  "ナイトスポット",
  "美容・リラクゼーション",
  "宿泊"
];


// authorTypeが省略された場合は従来どおり"admin"として扱う(既存のadmin-post.html
// からの呼び出しは常に省略するため、挙動は現在と完全に同じ)。AIテスト投稿の
// ためだけに"ai"も明示的に指定できるようにするが、値はこの2つだけに限定する。
const ALLOWED_AUTHOR_TYPES = [
  "admin",
  "ai"
];

// aiSourcesコレクションのsourceType(ai-sources.htmlのALLOWED_SOURCE_TYPESと
// 同一の6値)をそのまま再利用する。新しい分類値は作らない。
const ALLOWED_SOURCE_TYPES = [
  "行政",
  "観光施設",
  "イベント",
  "交通",
  "防災・気象",
  "その他"
];


const FIELD_MAX_LENGTHS = {
  title: 50,
  content: 300,
  address: 120,
  websiteUrl: 300,
  area: 80
};


const MAX_IMAGE_COUNT = 5;

const MAX_EXPIRES_AT_DAYS = 90;


function validatePostFields(
  requestBody
) {
  const title =
    String(
      requestBody.title || ""
    )
      .trim();

  if (title === "") {
    throw new Error(
      "情報タイトルを入力してください。"
    );
  }

  if (
    title.length >
    FIELD_MAX_LENGTHS.title
  ) {
    throw new Error(
      "情報タイトルが長すぎます。"
    );
  }

  const category =
    String(
      requestBody.category || ""
    )
      .trim();

  if (
    !ALLOWED_CATEGORIES.includes(
      category
    )
  ) {
    throw new Error(
      "カテゴリーを選択してください。"
    );
  }

  const content =
    String(
      requestBody.content || ""
    )
      .trim();

  if (content === "") {
    throw new Error(
      "内容を入力してください。"
    );
  }

  if (
    content.length >
    FIELD_MAX_LENGTHS.content
  ) {
    throw new Error(
      "内容が長すぎます。"
    );
  }

  const address =
    String(
      requestBody.address || ""
    )
      .trim();

  if (
    address.length >
    FIELD_MAX_LENGTHS.address
  ) {
    throw new Error(
      "住所・場所が長すぎます。"
    );
  }

  const websiteUrl =
    String(
      requestBody.websiteUrl || ""
    )
      .trim();

  if (
    websiteUrl.length >
    FIELD_MAX_LENGTHS.websiteUrl
  ) {
    throw new Error(
      "情報元ページのアドレスが長すぎます。"
    );
  }

  if (
    websiteUrl !== "" &&
    !/^https?:\/\//.test(
      websiteUrl
    )
  ) {
    throw new Error(
      "ページのアドレスは「https://」または「http://」から始まる形で貼り付けてください。"
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

  let latitude = null;

  if (
    requestBody.latitude !== null &&
    requestBody.latitude !== undefined &&
    requestBody.latitude !== ""
  ) {
    const parsedLatitude =
      Number(
        requestBody.latitude
      );

    if (
      !Number.isFinite(
        parsedLatitude
      ) ||
      parsedLatitude < -90 ||
      parsedLatitude > 90
    ) {
      throw new Error(
        "緯度の値が正しくありません。"
      );
    }

    latitude = parsedLatitude;
  }

  let longitude = null;

  if (
    requestBody.longitude !== null &&
    requestBody.longitude !== undefined &&
    requestBody.longitude !== ""
  ) {
    const parsedLongitude =
      Number(
        requestBody.longitude
      );

    if (
      !Number.isFinite(
        parsedLongitude
      ) ||
      parsedLongitude < -180 ||
      parsedLongitude > 180
    ) {
      throw new Error(
        "経度の値が正しくありません。"
      );
    }

    longitude = parsedLongitude;
  }

  const imageUrls =
    Array.isArray(
      requestBody.imageUrls
    )
      ? requestBody.imageUrls
      : [];

  if (
    imageUrls.length >
    MAX_IMAGE_COUNT
  ) {
    throw new Error(
      "写真は最大5枚までです。"
    );
  }

  imageUrls.forEach(
    function(imageUrl) {
      if (
        typeof imageUrl !== "string" ||
        !imageUrl.startsWith(
          "https://"
        )
      ) {
        throw new Error(
          "写真のアドレスが正しくありません。"
        );
      }
    }
  );

  const expiresAtRawValue =
    requestBody.expiresAt;

  if (
    !expiresAtRawValue ||
    typeof expiresAtRawValue !== "string"
  ) {
    throw new Error(
      "掲載終了日時を指定してください。"
    );
  }

  const expiresAtDate =
    new Date(
      expiresAtRawValue
    );

  if (
    Number.isNaN(
      expiresAtDate.getTime()
    )
  ) {
    throw new Error(
      "掲載終了日時を正しく指定してください。"
    );
  }

  const nowMilliseconds =
    Date.now();

  if (
    expiresAtDate.getTime() <=
    nowMilliseconds
  ) {
    throw new Error(
      "掲載終了日時は現在より未来の日時を指定してください。"
    );
  }

  const maxExpiresAtMilliseconds =
    nowMilliseconds +
    MAX_EXPIRES_AT_DAYS *
      24 *
      60 *
      60 *
      1000;

  if (
    expiresAtDate.getTime() >
    maxExpiresAtMilliseconds
  ) {
    throw new Error(
      "掲載終了日時は90日以内で指定してください。"
    );
  }

  const authorTypeRaw =
    String(
      requestBody.authorType || ""
    )
      .trim();

  const authorType =
    authorTypeRaw === ""
      ? "admin"
      : authorTypeRaw;

  if (
    !ALLOWED_AUTHOR_TYPES.includes(
      authorType
    )
  ) {
    throw new Error(
      "authorTypeの値が正しくありません。"
    );
  }

  const sourceType =
    String(
      requestBody.sourceType || ""
    )
      .trim();

  if (
    sourceType !== "" &&
    !ALLOWED_SOURCE_TYPES.includes(
      sourceType
    )
  ) {
    throw new Error(
      "sourceTypeの値が正しくありません。"
    );
  }

  return {
    title: title,
    category: category,
    content: content,
    address: address,
    websiteUrl: websiteUrl,
    area: area,
    latitude: latitude,
    longitude: longitude,
    imageUrls: imageUrls,
    expiresAtDate: expiresAtDate,
    authorType: authorType,
    sourceType: sourceType
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

    let postFields;

    try {
      postFields =
        validatePostFields(
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

    const submissionData = {
      shopName:
        "マチナウ運営",

      title:
        postFields.title,

      category:
        postFields.category,

      content:
        postFields.content,

      address:
        postFields.address,

      latitude:
        postFields.latitude,

      longitude:
        postFields.longitude,

      imageUrls:
        postFields.imageUrls,

      websiteUrl:
        postFields.websiteUrl,

      area:
        postFields.area,

      expiresAt:
        Timestamp.fromDate(
          postFields.expiresAtDate
        ),

      status:
        "approved",

      postType:
        "admin",

      authorType:
        postFields.authorType,

      sourceLabel:
        "マチナウ運営より",

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp()
    };

    // sourceTypeが指定されなかった通常の運営投稿では、このフィールド自体を
    // 書き込まない(既存投稿と同じデータ形を維持し、後方互換性を最大化する)。
    if (postFields.sourceType !== "") {
      submissionData.sourceType =
        postFields.sourceType;
    }

    const documentReference =
      await database
        .collection(
          "submissions"
        )
        .add(
          submissionData
        );

    return response.status(200).json({
      success: true,
      message:
        "運営情報を公開しました。",
      documentId:
        documentReference.id
    });
  } catch (error) {
    console.error(
      "運営情報の投稿エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "投稿の保存に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
