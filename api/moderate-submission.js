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


const OPENAI_MODERATION_ENDPOINT =
  "https://api.openai.com/v1/moderations";

const OPENAI_MODERATION_MODEL =
  "omni-moderation-latest";

const OPENAI_MODERATION_TIMEOUT_MS =
  20000;

const MAX_MODERATION_IMAGE_COUNT =
  5;

const AI_REVIEW_VERSION =
  "openai-omni-moderation-v1";


const CATEGORY_LABELS = {
  "harassment":
    "嫌がらせ的な内容",

  "harassment/threatening":
    "脅迫を伴う嫌がらせ",

  "hate":
    "差別的な内容",

  "hate/threatening":
    "脅迫を伴う差別的な内容",

  "illicit":
    "違法行為に関する内容",

  "illicit/violent":
    "暴力を伴う違法行為に関する内容",

  "self-harm":
    "自傷行為に関する内容",

  "self-harm/instructions":
    "自傷行為の手段に関する内容",

  "self-harm/intent":
    "自傷の意図に関する内容",

  "sexual":
    "性的な内容",

  "sexual/minors":
    "未成年に関する性的な内容",

  "violence":
    "暴力的な内容",

  "violence/graphic":
    "グロテスクな暴力描写"
};


function buildModerationInput(
  currentData
) {
  const textParts =
    [
      currentData.shopName,
      currentData.title,
      currentData.content
    ]
      .map(
        function(value) {
          return String(
            value || ""
          )
            .trim();
        }
      )
      .filter(
        function(value) {
          return value !== "";
        }
      );

  const inputItems =
    [];

  if (textParts.length > 0) {
    inputItems.push({
      type: "text",
      text: textParts.join("\n")
    });
  }

  const imageUrls =
    Array.isArray(
      currentData.imageUrls
    )
      ? currentData.imageUrls.slice(
          0,
          MAX_MODERATION_IMAGE_COUNT
        )
      : [];

  imageUrls.forEach(
    function(url) {
      if (
        typeof url === "string" &&
        url !== ""
      ) {
        inputItems.push({
          type: "image_url",
          image_url: {
            url: url
          }
        });
      }
    }
  );

  return inputItems;
}


function classifyModerationError(
  error
) {
  if (
    error &&
    error.isMissingApiKey
  ) {
    return "AI審査の設定に問題があります。";
  }

  if (
    error &&
    error.name === "AbortError"
  ) {
    return "AI審査サーバーへの接続がタイムアウトしました。";
  }

  if (
    error &&
    error.isHttpError
  ) {
    return "AI審査サービスでエラーが発生しました。";
  }

  if (
    error &&
    error.isJsonError
  ) {
    return "AI審査サービスの応答を読み取れませんでした。";
  }

  return "AI審査中にエラーが発生しました。";
}


async function callOpenAiModeration(
  inputItems
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error(
        "OPENAI_API_KEY が設定されていません。"
      );

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      OPENAI_MODERATION_TIMEOUT_MS
    );

  let response;

  try {
    response =
      await fetch(
        OPENAI_MODERATION_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              "Bearer " + apiKey
          },

          body:
            JSON.stringify({
              model:
                OPENAI_MODERATION_MODEL,

              input:
                inputItems
            }),

          signal:
            controller.signal
        }
      );
  } finally {
    clearTimeout(
      timeoutId
    );
  }

  if (!response.ok) {
    const httpError =
      new Error(
        "OpenAI Moderation APIがエラーを返しました。status=" +
          response.status
      );

    httpError.isHttpError =
      true;

    throw httpError;
  }

  let responseData;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    const parseError =
      new Error(
        "OpenAI Moderation APIの応答を解析できませんでした。"
      );

    parseError.isJsonError =
      true;

    throw parseError;
  }

  if (
    !responseData ||
    !Array.isArray(
      responseData.results
    )
  ) {
    const shapeError =
      new Error(
        "OpenAI Moderation APIの応答形式が不正です。"
      );

    shapeError.isJsonError =
      true;

    throw shapeError;
  }

  return responseData.results;
}


function buildReviewReason(
  moderationResults
) {
  const flaggedCategoryKeys =
    new Set();

  moderationResults.forEach(
    function(result) {
      if (
        result &&
        result.flagged === true &&
        result.categories &&
        typeof result.categories === "object"
      ) {
        Object.keys(
          result.categories
        )
          .forEach(
            function(categoryKey) {
              if (
                result.categories[
                  categoryKey
                ] === true
              ) {
                flaggedCategoryKeys.add(
                  categoryKey
                );
              }
            }
          );
      }
    }
  );

  const labels =
    Array.from(
      flaggedCategoryKeys
    )
      .map(
        function(categoryKey) {
          return CATEGORY_LABELS[
            categoryKey
          ] || categoryKey;
        }
      );

  const reasonText =
    labels
      .slice(0, 3)
      .join("、");

  return reasonText.slice(
    0,
    100
  );
}


// post.htmlの既存unsigned upload preset(cloud name: cdhyctnp)と同じ値。
// signed uploadへ移行後もpreset自体は流用する(preset側のsigning modeは
// Cloudinary管理画面側の設定であり、signatureが正しければpresetが
// unsignedのままでも署名付きリクエストは受理される)。
const CLOUDINARY_UPLOAD_PRESET =
  "machinau_signed_upload";

// signed upload移行にあわせて新設する固定フォルダ。署名をアップロード
// 以外の用途(任意のfolder・presetへの流用)に悪用しにくくするための
// 追加防御。既存の表示ロジックはURLをそのまま使うだけでpath構造を
// 解析していないため、フォルダの追加はimageUrls等の表示に影響しない。
const CLOUDINARY_UPLOAD_FOLDER =
  "machinau_submissions";


function buildCloudinaryUploadSignature(
  paramsToSign,
  apiSecret
) {
  const sortedParamString =
    Object.keys(
      paramsToSign
    )
      .sort()
      .map(
        function(key) {
          return (
            key +
            "=" +
            paramsToSign[key]
          );
        }
      )
      .join("&");

  return createHash("sha1")
    .update(
      sortedParamString + apiSecret,
      "utf8"
    )
    .digest("hex");
}


// post.htmlの画像アップロード用。Firebase匿名認証のIDトークンを検証した
// 上で、短命なCloudinary signed upload用の署名を発行する。Cloudinary
// API secretはここでのみ使用し、レスポンスへは一切含めない。
// エラーはこの関数の中で完結させ、呼び出し元のtry/catchには伝播させない。
async function handleCloudinarySignatureRequest(
  request,
  response
) {
  try {
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

    const app =
      getFirebaseAdminApp();

    try {
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

    const cloudinaryApiKey =
      process.env.CLOUDINARY_API_KEY;

    const cloudinaryApiSecret =
      process.env.CLOUDINARY_API_SECRET;

    if (
      !cloudinaryApiKey ||
      !cloudinaryApiSecret
    ) {
      console.error(
        "CLOUDINARY_API_KEY または CLOUDINARY_API_SECRET が設定されていません。"
      );

      return response.status(500).json({
        success: false,
        message:
          "画像アップロードの準備ができませんでした。時間をおいて、もう一度お試しください。"
      });
    }

    const timestampSeconds =
      Math.floor(
        Date.now() / 1000
      );

    const paramsToSign =
      {
        folder:
          CLOUDINARY_UPLOAD_FOLDER,

        timestamp:
          timestampSeconds,

        upload_preset:
          CLOUDINARY_UPLOAD_PRESET
      };

    const signature =
      buildCloudinaryUploadSignature(
        paramsToSign,
        cloudinaryApiSecret
      );

    return response.status(200).json({
      success: true,
      signature: signature,
      timestamp: timestampSeconds,
      apiKey: cloudinaryApiKey,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      folder: CLOUDINARY_UPLOAD_FOLDER
    });
  } catch (error) {
    console.error(
      "Cloudinary署名発行エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "画像アップロードの準備ができませんでした。時間をおいて、もう一度お試しください。"
    });
  }
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

  const requestBody =
    readRequestBody(
      request
    );

  if (
    requestBody.mode === "cloudinarySignature"
  ) {
    return handleCloudinarySignatureRequest(
      request,
      response
    );
  }

  try {
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

    if (
      currentData.status !== "pending"
    ) {
      return response.status(200).json({
        success: true,
        message:
          "審査対象外のため処理をスキップしました。"
      });
    }

    if (
      currentData.aiReviewStatus === "REVIEW" ||
      currentData.aiReviewStatus === "SAFE"
    ) {
      return response.status(200).json({
        success: true,
        message:
          "既に審査済みのため、再審査をスキップしました。"
      });
    }

    const durationHoursValue =
      typeof currentData.durationHours === "number" &&
      Number.isFinite(
        currentData.durationHours
      ) &&
      currentData.durationHours > 0
        ? currentData.durationHours
        : null;

    let moderationResults =
      null;

    let moderationError =
      null;

    try {
      const inputItems =
        buildModerationInput(
          currentData
        );

      moderationResults =
        await callOpenAiModeration(
          inputItems
        );
    } catch (error) {
      moderationError =
        error;
    }

    if (moderationError) {
      const reasonText =
        classifyModerationError(
          moderationError
        );

      await database.runTransaction(
        async function(transaction) {
          const freshSnapshot =
            await transaction.get(
              matchingDocument.ref
            );

          if (
            !freshSnapshot.exists
          ) {
            return;
          }

          const freshData =
            freshSnapshot.data();

          if (
            freshData.status !== "pending"
          ) {
            return;
          }

          transaction.update(
            matchingDocument.ref,
            {
              aiReviewStatus:
                "ERROR",

              aiReviewReason:
                reasonText,

              aiReviewedAt:
                FieldValue.serverTimestamp(),

              aiReviewVersion:
                AI_REVIEW_VERSION
            }
          );
        }
      );

      console.error(
        "AI自動審査エラー：",
        moderationError
      );

      return response.status(200).json({
        success: true,
        message:
          "AI審査でエラーが発生しました。",
        aiReviewStatus:
          "ERROR"
      });
    }

    const allSafe =
      moderationResults.every(
        function(result) {
          return (
            result &&
            result.flagged === false
          );
        }
      );

    if (
      allSafe &&
      durationHoursValue !== null
    ) {
      await database.runTransaction(
        async function(transaction) {
          const freshSnapshot =
            await transaction.get(
              matchingDocument.ref
            );

          if (
            !freshSnapshot.exists
          ) {
            return;
          }

          const freshData =
            freshSnapshot.data();

          if (
            freshData.status !== "pending"
          ) {
            return;
          }

          const newExpiresAtDate =
            new Date(
              Date.now() +
              durationHoursValue *
                60 *
                60 *
                1000
            );

          transaction.update(
            matchingDocument.ref,
            {
              status:
                "approved",

              expiresAt:
                Timestamp.fromDate(
                  newExpiresAtDate
                ),

              aiReviewStatus:
                "SAFE",

              aiReviewedAt:
                FieldValue.serverTimestamp(),

              aiReviewVersion:
                AI_REVIEW_VERSION
            }
          );
        }
      );

      return response.status(200).json({
        success: true,
        message:
          "AI審査によって自動承認されました。",
        aiReviewStatus:
          "SAFE"
      });
    }

    const reasonText =
      allSafe
        ? "掲載時間の情報が正しく設定されていないため、自動承認できません。"
        : buildReviewReason(
            moderationResults
          );

    await database.runTransaction(
      async function(transaction) {
        const freshSnapshot =
          await transaction.get(
            matchingDocument.ref
          );

        if (
          !freshSnapshot.exists
        ) {
          return;
        }

        const freshData =
          freshSnapshot.data();

        if (
          freshData.status !== "pending"
        ) {
          return;
        }

        transaction.update(
          matchingDocument.ref,
          {
            aiReviewStatus:
              "REVIEW",

            aiReviewReason:
              reasonText,

            aiReviewedAt:
              FieldValue.serverTimestamp(),

            aiReviewVersion:
              AI_REVIEW_VERSION
          }
        );
      }
    );

    return response.status(200).json({
      success: true,
      message:
        "人間による確認が必要と判定されました。",
      aiReviewStatus:
        "REVIEW"
    });
  } catch (error) {
    console.error(
      "AI自動審査処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "処理に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
