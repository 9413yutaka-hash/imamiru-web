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

export const AI_REVIEW_VERSION =
  "openai-omni-moderation-v1";


// Ver1.8 Phase2 STEP5-D｜安全・災害・交通に関わる可能性のある投稿は、
// OpenAI Moderationがsafe判定でも自動承認せず、必ず人間の確認を経由させる。
// ここではAIによる事実確認(本当に津波が来ているか等)は一切行わず、
// ルールベースのキーワード一致による「人間確認ルートへ倒す」判定のみを
// 行う。過検知(無関係な投稿がpending行きになる)は許容し、危険情報が
// 誤って自動公開されることを避けることを優先する。日本語のみで判定する
// (投稿本文自体の多言語入力は別軸の未着手工程のため)。
export const SAFETY_CRITICAL_KEYWORDS =
  [
    "津波", "避難", "台風", "警報", "地震", "火災", "事故",
    "通行止め", "欠航", "運休", "土砂", "浸水", "停電", "断水",
    "行方不明", "遭難"
  ];

export function matchesSafetyCriticalKeywords(
  currentData
) {
  const combinedText =
    [
      currentData.shopName,
      currentData.title,
      currentData.content
    ]
      .map(
        function(value) {
          return String(
            value || ""
          );
        }
      )
      .join("\n");

  return SAFETY_CRITICAL_KEYWORDS.some(
    function(keyword) {
      return (
        combinedText.indexOf(
          keyword
        ) !== -1
      );
    }
  );
}


// Ver1.8 Phase1｜AIコンシェルジュ。モデル名はここ1箇所のみで管理し、
// 他の箇所へハードコードしない。AI_CONCIERGE_MODEL環境変数があれば
// それを優先する(未設定時のみ既定値を使う)。
const AI_CONCIERGE_MODEL =
  process.env.AI_CONCIERGE_MODEL ||
  "gpt-4o-mini";

const AI_CONCIERGE_ENDPOINT =
  "https://api.openai.com/v1/chat/completions";

// Moderation(OPENAI_MODERATION_TIMEOUT_MS=20000、バックグラウンド処理)より
// 短くする。こちらはユーザーが画面で待つ経路のため、体感速度を優先する。
const AI_CONCIERGE_TIMEOUT_MS =
  8000;

const AI_CONCIERGE_MAX_CANDIDATES =
  5;

const AI_CONCIERGE_FIELD_MAX_LENGTHS =
  {
    title: 50,
    category: 30,
    area: 80,
    availabilityHint: 60,
    conditionText: 40,
    sourceType: 30,
    factSummary: 80
  };

const AI_CONCIERGE_CURRENT_TIME_MAX_LENGTH =
  16;

const AI_CONCIERGE_REASON_MAX_LENGTH =
  200;


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


export function buildModerationInput(
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


export function classifyModerationError(
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


export async function callOpenAiModeration(
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


// Ver1.8 Phase1｜候補1件分の入力値をサニタイズする。文字列は最大長で
// 切り詰め、想定外の型は空文字/nullへ落とす。ここを通った値だけが
// AIへのプロンプトに含まれる。
function sanitizeAiConciergeCandidate(
  rawCandidate
) {
  if (
    !rawCandidate ||
    typeof rawCandidate !== "object"
  ) {
    return null;
  }

  const id =
    typeof rawCandidate.id === "string"
      ? rawCandidate.id.trim()
      : "";

  if (id === "") {
    return null;
  }

  function clippedText(value, maxLength) {
    return typeof value === "string"
      ? value.trim().slice(0, maxLength)
      : "";
  }

  const distanceKm =
    typeof rawCandidate.distanceKm === "number" &&
    Number.isFinite(rawCandidate.distanceKm)
      ? Math.round(rawCandidate.distanceKm * 10) / 10
      : null;

  return {
    id: id,

    // Ver1.8 Phase1(設計修正)｜候補プールが一般店舗・地域おすすめ・⚡・🔥・
    // ✨の複数情報源から構成されるため、AIへの説明用ラベルとしてsourceTypeを
    // 追加する。値の妥当性(候補選定条件)はクライアント側の各select...ForAiConcierge()
    // で既に確定済みのため、ここでは文字列としての最大長切り詰めのみ行う。
    sourceType: clippedText(
      rawCandidate.sourceType,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.sourceType
    ),

    title: clippedText(
      rawCandidate.title,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.title
    ),

    category: clippedText(
      rawCandidate.category,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.category
    ),

    area: clippedText(
      rawCandidate.area,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.area
    ),

    availabilityHint: clippedText(
      rawCandidate.availabilityHint,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.availabilityHint
    ),

    // Ver1.8 Phase1(重要情報優先の確認・修正)｜"factual_info"候補にのみ
    // クライアント側で付与される短い事実要約。他のsourceTypeでは空文字。
    factSummary: clippedText(
      rawCandidate.factSummary,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.factSummary
    ),

    distanceKm: distanceKm
  };
}


function sanitizeAiConciergeCandidateList(
  rawCandidates
) {
  if (!Array.isArray(rawCandidates)) {
    return [];
  }

  const sanitizedCandidates =
    [];

  for (
    let candidateIndex = 0;
    candidateIndex < rawCandidates.length &&
      sanitizedCandidates.length < AI_CONCIERGE_MAX_CANDIDATES;
    candidateIndex += 1
  ) {
    const sanitizedCandidate =
      sanitizeAiConciergeCandidate(
        rawCandidates[candidateIndex]
      );

    if (sanitizedCandidate) {
      sanitizedCandidates.push(
        sanitizedCandidate
      );
    }
  }

  return sanitizedCandidates;
}


function sanitizeAiConciergeWeather(
  rawWeather
) {
  if (
    !rawWeather ||
    typeof rawWeather !== "object"
  ) {
    return null;
  }

  function numberOrNull(value) {
    return typeof value === "number" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  return {
    temperatureC: numberOrNull(rawWeather.temperatureC),
    feelsLikeC: numberOrNull(rawWeather.feelsLikeC),
    chanceOfRain: numberOrNull(rawWeather.chanceOfRain),
    windKph: numberOrNull(rawWeather.windKph),
    uvIndex: numberOrNull(rawWeather.uvIndex),

    conditionText:
      typeof rawWeather.conditionText === "string"
        ? rawWeather.conditionText
            .trim()
            .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.conditionText)
        : ""
  };
}


// Ver1.8 Phase1｜候補外の場所を生成させないための指示を明記する。
// 「候補リストの中からIDで1件選ぶ」以外の振る舞いを許可しない。
function buildAiConciergePrompt(
  payload
) {
  const languageLabel =
    payload.language === "en" ? "English" : "Japanese";

  const systemInstruction =
    "You are Machinau's travel concierge. Each candidate in the JSON " +
    "\"candidates\" array has a \"sourceType\" describing what kind of " +
    "information it is: \"factual_info\" (safety/important real-time info, " +
    "such as typhoons, warnings, evacuation notices, transport suspensions, " +
    "facility closures, or last-minute schedule changes; it may include a " +
    "short \"factSummary\" field with a brief factual excerpt), " +
    "\"official_today\" (official Machinau operator post), " +
    "\"traveler_suggestion\" (curated event/sightseeing pick), " +
    "\"region_recommendation\" (editorial regional recommendation), or " +
    "\"shop\" (a regular shop/venue listing). " +
    "PRIORITY RULE: if any \"factual_info\" candidate is relevant to the " +
    "traveler's area or plans right now, you MUST treat it as higher " +
    "priority than any regular shop, sightseeing, or event candidate, even " +
    "if a regular candidate would otherwise seem like a nicer suggestion. " +
    "Do not ignore a relevant closure, warning, or safety notice just to " +
    "recommend something more appealing. Stay calm and factual — do not " +
    "exaggerate risk or cause unnecessary alarm. " +
    "You must choose exactly ONE candidate from the array that is most " +
    "meaningful for this traveler right now, considering the provided area, " +
    "current time, weather, distance, category, and availability hint. " +
    "You must NEVER invent, rename, or describe a place, shop, or event that is " +
    "not in the candidates list. The value of \"suggestedCandidateId\" in your " +
    "response MUST be exactly one of the \"id\" values in the candidates array, " +
    "copied verbatim (do not strip or alter its prefix). Do not state specific " +
    "facts (hours, prices, distance) that are not present in the matching " +
    "candidate's data (for \"factual_info\", you may restate its own " +
    "\"factSummary\" in your own words, but do not add facts beyond it). " +
    "ANSWER SHAPE when you choose a \"factual_info\" candidate: \"reasonShort\" " +
    "should state the key fact plainly and what it means for the traveler's " +
    "plans right now (fact -> what to do). If, and only if, another candidate " +
    "in the array is a reasonable nearby alternative, you may name it in " +
    "\"cautionNote\" by copying its exact \"title\" text from the candidates " +
    "array — never invent an alternative name that is not one of the " +
    "provided candidates' titles. Otherwise set \"cautionNote\" to null. " +
    "Reply with a single JSON object only, with exactly these keys: " +
    "\"suggestedCandidateId\" (string, one of the candidate ids), " +
    "\"reasonShort\" (string, one short sentence written in " + languageLabel + "), " +
    "\"cautionNote\" (string in " + languageLabel + ", or null). " +
    "No extra text before or after the JSON object.";

  const userContent =
    JSON.stringify({
      area: payload.area,
      currentTime: payload.currentTime,
      weather: payload.weather,
      candidates: payload.candidates
    });

  return {
    systemInstruction: systemInstruction,
    userContent: userContent
  };
}


// callOpenAiModeration()と同じfetchベースの呼び出し方式(SDK不使用、
// AbortControllerによるタイムアウト)を踏襲する。エンドポイント・モデル・
// レスポンス形式(json_object)のみ異なる。
async function callOpenAiConcierge(
  payload
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

  const prompt =
    buildAiConciergePrompt(
      payload
    );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      AI_CONCIERGE_TIMEOUT_MS
    );

  let response;

  try {
    response =
      await fetch(
        AI_CONCIERGE_ENDPOINT,
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
                AI_CONCIERGE_MODEL,

              response_format:
                { type: "json_object" },

              messages: [
                {
                  role: "system",
                  content: prompt.systemInstruction
                },
                {
                  role: "user",
                  content: prompt.userContent
                }
              ]
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
        "OpenAI APIがエラーを返しました。status=" +
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
        "OpenAI APIの応答を解析できませんでした。"
      );

    parseError.isJsonError =
      true;

    throw parseError;
  }

  const messageContent =
    responseData &&
    Array.isArray(responseData.choices) &&
    responseData.choices[0] &&
    responseData.choices[0].message &&
    typeof responseData.choices[0].message.content === "string"
      ? responseData.choices[0].message.content
      : "";

  if (messageContent === "") {
    const shapeError =
      new Error(
        "OpenAI APIの応答形式が不正です。"
      );

    shapeError.isJsonError =
      true;

    throw shapeError;
  }

  try {
    return JSON.parse(
      messageContent
    );
  } catch (contentParseError) {
    const invalidJsonError =
      new Error(
        "AI応答のJSON解析に失敗しました。"
      );

    invalidJsonError.isJsonError =
      true;

    throw invalidJsonError;
  }
}


// サーバー側での候補ID一致検証(必須)。ここを通らない応答は一切採用せず、
// 呼び出し元がsuccess:falseを返してクライアント側のルールベース
// フォールバックへ委ねる。
function isValidAiConciergeSuggestion(
  suggestion,
  candidates
) {
  if (
    !suggestion ||
    typeof suggestion !== "object"
  ) {
    return false;
  }

  if (
    typeof suggestion.suggestedCandidateId !== "string" ||
    suggestion.suggestedCandidateId === ""
  ) {
    return false;
  }

  const matchesCandidate =
    candidates.some(
      function(candidate) {
        return (
          candidate.id ===
          suggestion.suggestedCandidateId
        );
      }
    );

  if (!matchesCandidate) {
    return false;
  }

  if (
    typeof suggestion.reasonShort !== "string" ||
    suggestion.reasonShort.trim() === ""
  ) {
    return false;
  }

  return true;
}


// Ver1.8 Phase1｜AIコンシェルジュ本体。認証はhandleCloudinarySignatureRequest()
// と同じ匿名Firebase AuthenticationのBearer Token検証をそのまま再利用する。
// AI呼び出し・応答検証のいずれかで失敗しても、常にsuccess:falseのJSONを
// 返すだけにとどめ(500エラーの詳細を露出しない)、呼び出し元(app.js)側で
// 既存のルールベース提案へ静かにフォールバックできるようにする。
async function handleAiConciergeRequest(
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

    const requestBody =
      readRequestBody(
        request
      );

    const language =
      requestBody.language === "en" ? "en" : "ja";

    const currentTime =
      typeof requestBody.currentTime === "string"
        ? requestBody.currentTime
            .trim()
            .slice(0, AI_CONCIERGE_CURRENT_TIME_MAX_LENGTH)
        : "";

    const contextInput =
      requestBody.context &&
      typeof requestBody.context === "object"
        ? requestBody.context
        : {};

    const area =
      typeof contextInput.area === "string"
        ? contextInput.area
            .trim()
            .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.area)
        : "";

    const weather =
      sanitizeAiConciergeWeather(
        contextInput.weather
      );

    const candidates =
      sanitizeAiConciergeCandidateList(
        requestBody.candidates
      );

    // Preview検証用デバッグログ(本番mainへ入れるかは代表判断・後で削除可)。
    // Secret・Token・詳細な緯度経度・個人情報は一切出力しない。
    console.log(
      "[AIConcierge Debug] request received candidateCount=" +
        candidates.length
    );

    if (candidates.length === 0) {
      console.log(
        "[AIConcierge Debug] fallback reason=no_candidates_in_request"
      );

      return response.status(400).json({
        success: false,
        message:
          "候補が指定されていません。"
      });
    }

    let aiSuggestion;

    try {
      console.log(
        "[AIConcierge Debug] AI request started"
      );

      aiSuggestion =
        await callOpenAiConcierge(
          {
            language: language,
            currentTime: currentTime,
            area: area,
            weather: weather,
            candidates: candidates
          }
        );
    } catch (aiError) {
      console.error(
        "AIコンシェルジュ呼び出しエラー：",
        aiError
      );

      console.log(
        "[AIConcierge Debug] fallback reason=ai_call_error"
      );

      return response.status(200).json({
        success: false,
        message:
          "AI判断を利用できませんでした。"
      });
    }

    if (
      !isValidAiConciergeSuggestion(
        aiSuggestion,
        candidates
      )
    ) {
      console.log(
        "[AIConcierge Debug] fallback reason=invalid_ai_suggestion"
      );

      return response.status(200).json({
        success: false,
        message:
          "AI判断結果を利用できませんでした。"
      });
    }

    console.log(
      "[AIConcierge Debug] AI suggestion accepted"
    );

    const cautionNote =
      typeof aiSuggestion.cautionNote === "string" &&
      aiSuggestion.cautionNote.trim() !== ""
        ? aiSuggestion.cautionNote
            .trim()
            .slice(0, AI_CONCIERGE_REASON_MAX_LENGTH)
        : null;

    return response.status(200).json({
      success: true,
      suggestion: {
        suggestedCandidateId:
          aiSuggestion.suggestedCandidateId,

        reasonShort:
          String(aiSuggestion.reasonShort)
            .trim()
            .slice(0, AI_CONCIERGE_REASON_MAX_LENGTH),

        cautionNote: cautionNote
      }
    });
  } catch (error) {
    console.error(
      "AIコンシェルジュ処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "AI判断中にエラーが発生しました。"
    });
  }
}


export function buildReviewReason(
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


// TOP画面のFirestore資金防衛「層3」用。weather.js(commit 2068ce3)で本番実証済みの
// Vercel CDN共有キャッシュ方式を再利用するが、TTLの値はそのまま流用しない。
// ⚡(防災・気象・交通情報)は天気予報よりも鮮度の許容幅が狭いため、weather.jsの
// 900秒ではなく、代表確認済みの「投稿反映の遅延は最大30秒程度まで許容」という
// 判断に基づき30秒とする。
const SUBMISSIONS_PUBLIC_LIST_SHARED_CACHE_MAX_AGE_SECONDS =
  30;

const SUBMISSIONS_PUBLIC_LIST_STALE_WHILE_REVALIDATE_SECONDS =
  30;


// Admin SDKのFirestore Timestampは、getter(seconds/nanoseconds)がクラス上で
// 列挙不可(non-enumerable)なため、JSON.stringify()すると生のプライベート
// フィールド{_seconds, _nanoseconds}がそのまま漏れてしまう(toJSON()も未定義)。
// クライアント側app.jsのgetDateValue()はこの形を認識できないため、ここで
// 明示的にISO文字列へ変換してから返す。Timestamp以外の値はそのまま通す。
function convertFirestoreValueForPublicResponse(
  value
) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return value;
}


// クライアントのconvertSubmissionToShop(documentSnapshot, index)が
// documentSnapshot.data()・documentSnapshot.idのみを参照する作りであるため、
// 同じ形(id / data相当のfields)で返せるよう、生ドキュメントの全フィールドを
// 変換するだけに留める。カテゴリ・地域等によるサーバー側の絞り込みは行わない
// (CDNで全訪問者に共有されるレスポンスのため、特定ユーザー向けの加工はしない)。
function serializeSubmissionForPublicList(
  documentSnapshot
) {
  const rawData =
    documentSnapshot.data() ||
    {};

  const sanitizedFields =
    {};

  Object.keys(
    rawData
  ).forEach(
    function(key) {
      sanitizedFields[key] =
        convertFirestoreValueForPublicResponse(
          rawData[key]
        );
    }
  );

  return {
    id:
      documentSnapshot.id,

    fields:
      sanitizedFields
  };
}


// TOP画面のloadApprovedSubmissions()から呼ばれる、認証不要の公開一覧取得。
// 特定訪問者の位置情報・地域・カテゴリ・お気に入り等による絞り込みは行わない
// (全訪問者で同一レスポンスを共有できるようにするため)。層1(既存の
// status=="approved" && expiresAt>nowクエリ)と全く同じ条件をAdmin SDK側でも
// 維持する。エラー時はこの関数内で完結させ、呼び出し元のCache-Control
// no-storeデフォルトをそのまま活かす(成功時のみ後段でCache-Controlを上書き)。
async function handlePublicSubmissionsListRequest(
  request,
  response
) {
  try {
    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    const querySnapshot =
      await database
        .collection(
          "submissions"
        )
        .where(
          "status",
          "==",
          "approved"
        )
        .where(
          "expiresAt",
          ">",
          Timestamp.now()
        )
        .get();

    const submissions =
      querySnapshot.docs.map(
        serializeSubmissionForPublicList
      );

    // 成功時のみCDN共有キャッシュを許可する。エラー応答は呼び出し元で
    // 設定済みのno-storeのままとし、失敗結果が他の訪問者へ配信されるのを防ぐ。
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        SUBMISSIONS_PUBLIC_LIST_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        SUBMISSIONS_PUBLIC_LIST_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).json({
      success: true,
      submissions: submissions
    });
  } catch (error) {
    console.error(
      "公開submissions一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "掲載情報を取得できませんでした。時間をおいて、もう一度お試しください。"
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

  // GET: TOP画面向けの公開submissions一覧取得(認証不要、CDN共有キャッシュ対象)。
  // 既存のPOST専用処理(投稿審査・Cloudinary署名発行)より前に分岐させ、
  // 互いに影響しないようにする。
  if (
    request.method === "GET"
  ) {
    return handlePublicSubmissionsListRequest(
      request,
      response
    );
  }

  if (
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

  // Ver1.8 Phase1｜AIコンシェルジュ。既存のcloudinarySignatureモードと
  // 同じ位置(モード判定)に追加するだけで、GET一覧取得・cloudinarySignature・
  // 既定の投稿審査(この先のtry節)のいずれにも一切触れない。
  if (
    requestBody.mode === "aiConcierge"
  ) {
    return handleAiConciergeRequest(
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

    // Ver1.8 Phase2 STEP5-D｜安全・災害・交通に関わる可能性のある投稿は、
    // Moderationがsafeでも自動承認せず、必ず人間の確認を経由させる。
    const isSafetyCriticalContent =
      matchesSafetyCriticalKeywords(
        currentData
      );

    if (
      allSafe &&
      durationHoursValue !== null &&
      !isSafetyCriticalContent
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
      allSafe && isSafetyCriticalContent
        ? "安全・災害・交通に関する情報の可能性があるため、内容を人間が確認します。"
        : allSafe
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
