import {
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";

import {
  FieldValue,
  getFirestore
} from "firebase-admin/firestore";

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

export default async function handler(
  request,
  response
) {
  if (
    request.method !== "GET" &&
    request.method !== "POST"
  ) {
    response.setHeader(
      "Allow",
      "GET, POST"
    );

    return response.status(405).json({
      success: false,
      message:
        "GETまたはPOSTのみ利用できます。"
    });
  }

  try {
    const app = getFirebaseAdminApp();
    const database = getFirestore(app);
    const currentTime = new Date();

    const expiredSnapshot =
      await database
        .collection("submissions")
        .where(
          "expiresAt",
          "<=",
          currentTime
        )
        .get();

    const expiredDocuments =
      expiredSnapshot.docs.filter(
        function(documentSnapshot) {
          const data =
            documentSnapshot.data();

          return data.status === "approved";
        }
      );

    if (expiredDocuments.length === 0) {
      return response.status(200).json({
        success: true,
        expiredCount: 0,
        message:
          "期限切れの掲載情報はありませんでした。",
        checkedAt:
          currentTime.toISOString()
      });
    }

    const maximumBatchSize = 500;
    let updatedCount = 0;

    for (
      let startIndex = 0;
      startIndex < expiredDocuments.length;
      startIndex += maximumBatchSize
    ) {
      const documentGroup =
        expiredDocuments.slice(
          startIndex,
          startIndex + maximumBatchSize
        );

      const batch =
        database.batch();

      documentGroup.forEach(
        function(documentSnapshot) {
          batch.update(
            documentSnapshot.ref,
            {
              status: "expired",
              updatedAt:
                FieldValue.serverTimestamp()
            }
          );
        }
      );

      await batch.commit();

      updatedCount +=
        documentGroup.length;
    }

    return response.status(200).json({
      success: true,
      expiredCount: updatedCount,
      message:
        updatedCount +
        "件を期限切れに変更しました。",
      checkedAt:
        currentTime.toISOString()
    });
  } catch (error) {
    console.error(
      "期限切れ処理エラー:",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "期限切れ処理に失敗しました。",
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }
}