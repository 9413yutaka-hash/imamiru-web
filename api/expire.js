import {
  assertFirebaseTarget,
  readFirebaseServiceAccountText
} from "./_lib/firebase-target.js";

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
  timingSafeEqual
} from "node:crypto";

// 店主向け「この街のマチナウ利用状況」の30分ごとの更新(代表決定 2026-11-05)。
import {
  refreshAreaUsageIfDue
} from "./_lib/area-usage.js";

// admin-source-collect.jsのcron認証(X-Machinau-Cron-Secret)と同じ考え方・
// 同じSecret(AI_COLLECT_CRON_SECRET)を再利用する。新規Secretは作らない。
function readCronSecretHeader(
  request
) {
  const headerValue =
    request.headers &&
    request.headers["x-machinau-cron-secret"];

  if (
    typeof headerValue !== "string"
  ) {
    return "";
  }

  return headerValue;
}

function cronSecretsMatch(
  providedSecret,
  expectedSecret
) {
  if (
    typeof providedSecret !== "string" ||
    typeof expectedSecret !== "string" ||
    providedSecret === "" ||
    expectedSecret === ""
  ) {
    return false;
  }

  const providedBuffer =
    Buffer.from(
      providedSecret,
      "utf8"
    );

  const expectedBuffer =
    Buffer.from(
      expectedSecret,
      "utf8"
    );

  if (
    providedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  try {
    return timingSafeEqual(
      providedBuffer,
      expectedBuffer
    );
  } catch (error) {
    return false;
  }
}

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Preview(ブランチに関係なく)では FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW だけを読む(無ければ止める。STEP 45-B)。
  const serviceAccountText =
    readFirebaseServiceAccountText(process.env);

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

  // Production は chikashoku-app、Preview は machinau-preview の時だけ初期化する(不一致・未設定は止める。STEP 45-B)。
  assertFirebaseTarget(process.env, serviceAccount);

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

  const cronSecretHeaderValue =
    readCronSecretHeader(
      request
    );

  const expectedCronSecret =
    process.env.AI_COLLECT_CRON_SECRET;

  if (
    !cronSecretsMatch(
      cronSecretHeaderValue,
      expectedCronSecret
    )
  ) {
    return response.status(401).json({
      success: false,
      message:
        "認証情報が正しくありません。"
    });
  }

  try {
    const app = getFirebaseAdminApp();
    const database = getFirestore(app);
    const currentTime = new Date();

    // 店主向け「この街のマチナウ利用状況」｜この定期実行(合言葉は上の既存の確認のまま)に相乗りして、前回の成功から
    // 25分以上たっている時だけ GA4 から取得する(Production だけ・二重実行は実行ロックで防ぐ)。
    // 失敗しても掲載期限の処理には影響させない(例外を投げない・応答にも含めない)。
    await refreshAreaUsageIfDue(
      {
        env: process.env,
        fetch: function(url, options) {
          return fetch(url, options);
        },
        getFirestore: getFirestore,
        getFirebaseAdminApp: getFirebaseAdminApp
      },
      "expire"
    );

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