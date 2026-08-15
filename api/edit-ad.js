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
  createHash,
  timingSafeEqual
} from "node:crypto";


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


function createEndCodeHash(
  endCode
) {
  return createHash("sha256")
    .update(
      endCode,
      "utf8"
    )
    .digest("hex");
}


function hashesMatch(
  firstHash,
  secondHash
) {
  if (
    typeof firstHash !== "string" ||
    typeof secondHash !== "string"
  ) {
    return false;
  }

  if (
    firstHash.length !== secondHash.length
  ) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(
        firstHash,
        "hex"
      ),
      Buffer.from(
        secondHash,
        "hex"
      )
    );
  } catch (error) {
    return false;
  }
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


function normalizePublicationNumber(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .replace(
      /[^0-9]/g,
      ""
    )
    .slice(
      0,
      8
    );
}


function normalizeEndCode(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ""
    )
    .slice(
      0,
      12
    );
}


const COMMON_AUTH_ERROR_MESSAGE =
  "掲載番号または終了番号が正しくありません。";


const ALLOWED_CATEGORIES = [
  "グルメ",
  "カフェ・スイーツ",
  "ショッピング",
  "イベント",
  "観光・体験",
  "ナイトスポット",
  "美容・リラクゼーション",
  "宿泊",
  "カフェ",
  "居酒屋"
];


const ALLOWED_PAYMENT_METHOD_VALUES = [
  "cash",
  "card",
  "qr"
];


const FIELD_MAX_LENGTHS = {
  shopName: 60,
  title: 50,
  content: 300,
  address: 120,
  websiteUrl: 300
};


function validateEditableFields(
  requestBody
) {
  const shopName =
    String(
      requestBody.shopName || ""
    )
      .trim();

  if (shopName === "") {
    throw new Error(
      "店舗・イベント名を入力してください。"
    );
  }

  if (
    shopName.length >
    FIELD_MAX_LENGTHS.shopName
  ) {
    throw new Error(
      "店舗・イベント名が長すぎます。"
    );
  }

  const title =
    String(
      requestBody.title || ""
    )
      .trim();

  if (title === "") {
    throw new Error(
      "広告タイトルを入力してください。"
    );
  }

  if (
    title.length >
    FIELD_MAX_LENGTHS.title
  ) {
    throw new Error(
      "広告タイトルが長すぎます。"
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
      "広告内容を入力してください。"
    );
  }

  if (
    content.length >
    FIELD_MAX_LENGTHS.content
  ) {
    throw new Error(
      "広告内容が長すぎます。"
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
      "お店のページのアドレスが長すぎます。"
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

  const takeout =
    requestBody.takeout === true;

  const rawPaymentMethods =
    Array.isArray(
      requestBody.paymentMethods
    )
      ? requestBody.paymentMethods
      : [];

  const paymentMethods =
    Array.from(
      new Set(
        rawPaymentMethods.filter(
          function(value) {
            return ALLOWED_PAYMENT_METHOD_VALUES.includes(
              value
            );
          }
        )
      )
    );

  return {
    shopName: shopName,
    title: title,
    category: category,
    content: content,
    address: address,
    websiteUrl: websiteUrl,
    takeout: takeout,
    paymentMethods: paymentMethods
  };
}


async function geocodeAddress(
  address
) {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    const configError =
      new Error(
        "住所の確認機能が利用できません。"
      );

    configError.isConfigError =
      true;

    throw configError;
  }

  const requestUrl =
    new URL(
      "https://maps.googleapis.com/maps/api/geocode/json"
    );

  requestUrl.searchParams.set(
    "address",
    address
  );

  requestUrl.searchParams.set(
    "region",
    "JP"
  );

  requestUrl.searchParams.set(
    "key",
    apiKey
  );

  let responseData;

  try {
    const response =
      await fetch(
        requestUrl
      );

    responseData =
      await response.json();
  } catch (error) {
    throw new Error(
      "入力された住所の場所を確認できませんでした。住所を詳しく入力してください。"
    );
  }

  if (
    !responseData ||
    responseData.status !== "OK" ||
    !Array.isArray(
      responseData.results
    ) ||
    responseData.results.length === 0
  ) {
    throw new Error(
      "入力された住所の場所を確認できませんでした。住所を詳しく入力してください。"
    );
  }

  const location =
    responseData.results[0]
      .geometry
      .location;

  if (
    typeof location.lat !== "number" ||
    typeof location.lng !== "number"
  ) {
    throw new Error(
      "入力された住所の場所を確認できませんでした。住所を詳しく入力してください。"
    );
  }

  return {
    latitude: location.lat,
    longitude: location.lng
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

  try {
    const requestBody =
      readRequestBody(
        request
      );

    const action =
      requestBody.action;

    if (
      action !== "lookup" &&
      action !== "save" &&
      action !== "end"
    ) {
      return response.status(400).json({
        success: false,
        message:
          "actionの指定が正しくありません。"
      });
    }

    const publicationNumber =
      normalizePublicationNumber(
        requestBody.publicationNumber
      );

    const endCode =
      normalizeEndCode(
        requestBody.endCode
      );

    if (
      !/^\d{8}$/.test(
        publicationNumber
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "掲載番号は8桁の数字で入力してください。"
      });
    }

    if (
      !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(
        endCode
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "終了番号を正しく入力してください。"
      });
    }

    let editableFields =
      null;

    if (action === "save") {
      try {
        editableFields =
          validateEditableFields(
            requestBody
          );
      } catch (validationError) {
        return response.status(400).json({
          success: false,
          message:
            validationError.message
        });
      }
    }

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(app);

    const submissionSnapshot =
      await database
        .collection(
          "submissions"
        )
        .where(
          "publicationNumber",
          "==",
          publicationNumber
        )
        .limit(10)
        .get();

    if (
      submissionSnapshot.empty
    ) {
      return response.status(401).json({
        success: false,
        message:
          COMMON_AUTH_ERROR_MESSAGE
      });
    }

    const enteredEndCodeHash =
      createEndCodeHash(
        endCode
      );

    const matchingDocument =
      submissionSnapshot.docs.find(
        function(documentSnapshot) {
          const submissionData =
            documentSnapshot.data();

          return hashesMatch(
            submissionData.endCodeHash,
            enteredEndCodeHash
          );
        }
      );

    if (
      !matchingDocument
    ) {
      return response.status(401).json({
        success: false,
        message:
          COMMON_AUTH_ERROR_MESSAGE
      });
    }

    const currentData =
      matchingDocument.data();

    if (action === "end") {
      if (
        currentData.status === "expired"
      ) {
        return response.status(200).json({
          success: true,
          alreadyEnded: true,
          message:
            "この掲載はすでに終了しています。"
        });
      }

      if (
        currentData.status === "rejected"
      ) {
        return response.status(409).json({
          success: false,
          message:
            "この掲載は運営によって却下されているため、掲載されていません。"
        });
      }

      await matchingDocument.ref.update({
        status:
          "expired",

        endedAt:
          FieldValue.serverTimestamp(),

        endedBy:
          "shop",

        updatedAt:
          FieldValue.serverTimestamp()
      });

      return response.status(200).json({
        success: true,
        alreadyEnded: false,
        message:
          "掲載を終了しました。"
      });
    }

    if (
      currentData.status !== "approved" &&
      currentData.status !== "pending"
    ) {
      return response.status(409).json({
        success: false,
        message:
          "この投稿は現在編集できません。"
      });
    }

    if (action === "lookup") {
      return response.status(200).json({
        success: true,
        submission: {
          shopName:
            currentData.shopName || "",

          title:
            currentData.title || "",

          category:
            currentData.category || "",

          content:
            currentData.content || "",

          address:
            currentData.address || "",

          websiteUrl:
            currentData.websiteUrl || "",

          takeout:
            currentData.takeout === true,

          paymentMethods:
            Array.isArray(
              currentData.paymentMethods
            )
              ? currentData.paymentMethods
              : []
        }
      });
    }

    const currentAddress =
      String(
        currentData.address || ""
      )
        .trim();

    let latitude =
      currentData.latitude ??
      null;

    let longitude =
      currentData.longitude ??
      null;

    if (
      editableFields.address === ""
    ) {
      latitude = null;
      longitude = null;
    } else if (
      editableFields.address !==
      currentAddress
    ) {
      let coordinates;

      try {
        coordinates =
          await geocodeAddress(
            editableFields.address
          );
      } catch (geocodeError) {
        if (
          geocodeError.isConfigError
        ) {
          return response.status(500).json({
            success: false,
            message:
              "住所の確認に失敗しました。時間をおいて、もう一度お試しください。"
          });
        }

        return response.status(400).json({
          success: false,
          message:
            geocodeError.message
        });
      }

      latitude =
        coordinates.latitude;

      longitude =
        coordinates.longitude;
    }

    await matchingDocument.ref.update({
      shopName:
        editableFields.shopName,

      title:
        editableFields.title,

      category:
        editableFields.category,

      content:
        editableFields.content,

      address:
        editableFields.address,

      websiteUrl:
        editableFields.websiteUrl,

      takeout:
        editableFields.takeout,

      paymentMethods:
        editableFields.paymentMethods,

      latitude:
        latitude,

      longitude:
        longitude,

      updatedAt:
        FieldValue.serverTimestamp()
    });

    return response.status(200).json({
      success: true,
      message:
        "投稿内容を更新しました。"
    });
  } catch (error) {
    console.error(
      "投稿編集の保存エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "投稿内容の保存に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
