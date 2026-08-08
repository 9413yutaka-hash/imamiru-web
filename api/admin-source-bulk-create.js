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


const ALLOWED_PRIORITY_VALUES = [1, 2, 3, 4, 5];

const DEFAULT_SOURCE_PRIORITY = 3;

const DEFAULT_IS_ENABLED = true;


const MAX_SOURCE_COUNT = 100;

const MAX_BULK_ITEM_COUNT = 30;


function validateBulkItemFields(
  itemBody
) {
  if (
    !itemBody ||
    typeof itemBody !== "object" ||
    Array.isArray(itemBody)
  ) {
    throw new Error(
      "データの形式が正しくありません。"
    );
  }

  const name =
    String(
      itemBody.name || ""
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
      itemBody.url || ""
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
      itemBody.sourceType || ""
    )
      .trim();

  if (
    !ALLOWED_SOURCE_TYPES.includes(
      sourceType
    )
  ) {
    throw new Error(
      "種類が正しくありません。"
    );
  }

  const area =
    String(
      itemBody.area || ""
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

  const feedUrl =
    String(
      itemBody.feedUrl || ""
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

  let isEnabled;

  if (
    itemBody.isEnabled === undefined ||
    itemBody.isEnabled === null
  ) {
    isEnabled = DEFAULT_IS_ENABLED;
  } else if (
    typeof itemBody.isEnabled === "boolean"
  ) {
    isEnabled = itemBody.isEnabled;
  } else {
    throw new Error(
      "有効／停止の値が正しくありません。"
    );
  }

  let priority;

  if (
    itemBody.priority === undefined ||
    itemBody.priority === null
  ) {
    priority = DEFAULT_SOURCE_PRIORITY;
  } else if (
    typeof itemBody.priority === "number" &&
    Number.isInteger(itemBody.priority) &&
    ALLOWED_PRIORITY_VALUES.includes(itemBody.priority)
  ) {
    priority = itemBody.priority;
  } else {
    throw new Error(
      "情報源ランクは1〜5の整数で指定してください。"
    );
  }

  return {
    name: name,
    url: url,
    sourceType: sourceType,
    area: area,
    isEnabled: isEnabled,
    feedUrl: feedUrl,
    priority: priority
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

    const rawItems =
      requestBody.items;

    if (
      !Array.isArray(rawItems) ||
      rawItems.length === 0
    ) {
      return response.status(400).json({
        success: false,
        message:
          "登録するデータがありません。items配列を指定してください。"
      });
    }

    if (
      rawItems.length >
      MAX_BULK_ITEM_COUNT
    ) {
      return response.status(400).json({
        success: false,
        message:
          "一度に登録できるのは" +
          MAX_BULK_ITEM_COUNT +
          "件までです。（入力：" +
          rawItems.length +
          "件）"
      });
    }

    const totalCount =
      rawItems.length;

    const rowResults =
      new Array(
        totalCount
      );

    const pendingRows = [];

    for (
      let index = 0;
      index < totalCount;
      index++
    ) {
      const row =
        index + 1;

      try {
        const fields =
          validateBulkItemFields(
            rawItems[index]
          );

        pendingRows.push({
          row: row,
          fields: fields
        });
      } catch (validationError) {
        rowResults[index] = {
          row: row,
          status: "error",
          message:
            validationError.message
        };
      }
    }

    const urlToPendingRows =
      new Map();

    pendingRows.forEach(
      function(pendingRow) {
        const url =
          pendingRow.fields.url;

        if (
          !urlToPendingRows.has(
            url
          )
        ) {
          urlToPendingRows.set(
            url,
            []
          );
        }

        urlToPendingRows
          .get(url)
          .push(
            pendingRow
          );
      }
    );

    const rowsToCheckAgainstFirestore = [];

    urlToPendingRows.forEach(
      function(sameUrlRows) {
        if (sameUrlRows.length === 1) {
          rowsToCheckAgainstFirestore.push(
            sameUrlRows[0]
          );
          return;
        }

        const firstRow =
          sameUrlRows[0];

        rowsToCheckAgainstFirestore.push(
          firstRow
        );

        for (
          let duplicateIndex = 1;
          duplicateIndex < sameUrlRows.length;
          duplicateIndex++
        ) {
          const duplicateRow =
            sameUrlRows[duplicateIndex];

          rowResults[
            duplicateRow.row - 1
          ] = {
            row:
              duplicateRow.row,
            status: "duplicate",
            message:
              "入力データ内で" +
              firstRow.row +
              "行目とURLが重複しています。"
          };
        }
      }
    );

    const database =
      getFirestore(app);

    await Promise.all(
      rowsToCheckAgainstFirestore.map(
        async function(pendingRow) {
          const duplicateSnapshot =
            await database
              .collection(
                "aiSources"
              )
              .where(
                "url",
                "==",
                pendingRow.fields.url
              )
              .limit(1)
              .get();

          if (
            !duplicateSnapshot.empty
          ) {
            rowResults[
              pendingRow.row - 1
            ] = {
              row:
                pendingRow.row,
              status: "duplicate",
              message:
                "このURLは既に登録されています。"
            };
          } else {
            rowResults[
              pendingRow.row - 1
            ] = {
              row:
                pendingRow.row,
              status: "ok",
              message: ""
            };
          }
        }
      )
    );

    const countSnapshot =
      await database
        .collection(
          "aiSources"
        )
        .count()
        .get();

    const existingSourceCount =
      countSnapshot.data().count;

    const capacityExceeded =
      existingSourceCount +
        totalCount >
      MAX_SOURCE_COUNT;

    const errorCount =
      rowResults.filter(
        function(rowResult) {
          return (
            rowResult.status ===
            "error"
          );
        }
      ).length;

    const duplicateCount =
      rowResults.filter(
        function(rowResult) {
          return (
            rowResult.status ===
            "duplicate"
          );
        }
      ).length;

    const hasBlockingProblem =
      errorCount > 0 ||
      duplicateCount > 0 ||
      capacityExceeded;

    if (hasBlockingProblem) {
      let message =
        "入力内容にエラーまたは重複があるため、登録を中止しました。1件も登録されていません。";

      if (capacityExceeded) {
        message =
          "情報源の登録件数が上限（" +
          MAX_SOURCE_COUNT +
          "件）を超えるため、登録を中止しました。1件も登録されていません。（現在" +
          existingSourceCount +
          "件＋今回" +
          totalCount +
          "件）";
      }

      return response.status(400).json({
        success: false,
        message: message,
        summary: {
          totalCount: totalCount,
          successCount: 0,
          duplicateCount: duplicateCount,
          errorCount: errorCount
        },
        results: rowResults
      });
    }

    const batch =
      database.batch();

    pendingRows.forEach(
      function(pendingRow) {
        const documentReference =
          database
            .collection(
              "aiSources"
            )
            .doc();

        batch.set(
          documentReference,
          {
            name:
              pendingRow.fields.name,

            url:
              pendingRow.fields.url,

            sourceType:
              pendingRow.fields.sourceType,

            area:
              pendingRow.fields.area,

            isEnabled:
              pendingRow.fields.isEnabled,

            feedUrl:
              pendingRow.fields.feedUrl,

            priority:
              pendingRow.fields.priority,

            createdAt:
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp()
          }
        );
      }
    );

    await batch.commit();

    return response.status(200).json({
      success: true,
      message:
        totalCount +
        "件の情報源を登録しました。",
      summary: {
        totalCount: totalCount,
        successCount: totalCount,
        duplicateCount: 0,
        errorCount: 0
      },
      results: rowResults
    });
  } catch (error) {
    console.error(
      "情報源の一括登録エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "情報源の一括登録に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
