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


// Ver1.8 Phase2(マチナウ読み物コメント機能MVP)｜新しいVercel Functionは
// 追加せず、既存のこのFunction(api/moderate-submission.js)へmode追加のみで
// 実装する(Functions 12/12を維持)。新規Firestoreコレクションは
// クライアントから直接読み書きさせず、常にAdmin SDK経由(このFunction経由)
// のみでアクセスする設計とし、Firestore Security Rulesの変更を一切
// 不要にする(既存のsubmissions/aiCollectedArticles等と同じ、コードだけで
// 完結する安全設計)。対象記事は事前登録制のホワイトリストとし、
// 存在しないarticleSlugでの無差別なドキュメント量産を防ぐ。将来コラムを
// 追加する際は、このリストへの追記が必要(自動検出は行わない)。
const ARTICLE_COMMENTS_COLLECTION =
  "articleComments";

const ALLOWED_ARTICLE_COMMENT_SLUGS =
  [
    "typhoon-okinawa-travel"
  ];

const COMMENT_NICKNAME_MAX_LENGTH =
  20;

const COMMENT_TEXT_MAX_LENGTH =
  500;

const COMMENT_FALLBACK_NICKNAME =
  "名無しさん";

const COMMENTS_LIST_MAX_COUNT =
  200;

// 個人情報(生IP)を保存しない。ハッシュ化した値だけをスパム対策の
// クールダウン判定に使い、逆算で元のIPへ戻せないようにする。
const COMMENT_RATE_LIMITS_COLLECTION =
  "commentRateLimits";

const COMMENT_RATE_LIMIT_COOLDOWN_MILLISECONDS =
  30 * 1000;

const COMMENTS_LIST_SHARED_CACHE_MAX_AGE_SECONDS =
  15;

const COMMENTS_LIST_STALE_WHILE_REVALIDATE_SECONDS =
  30;


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
//
// 運営管理型・常設店舗広告(isPermanentAd:true、expiresAtを保存しない)は、
// Firestoreの仕様上、上記の不等号クエリ(expiresAt>now)の対象に含まれない
// (対象フィールドが存在しない文書は不等号クエリの結果から除外される)。
// そのため別クエリ(status=="approved" && isPermanentAd==true、等価条件のみ
// のため新規の複合indexは不要)で取得し、結果をコード側でマージする。
// 1クエリのOR条件(Filter.or())はSDK上は利用可能だが、不等号を含む分岐と
// 組み合わせた場合に実際のProduction環境の既存indexだけで動作するかを
// 確認する手段がなかったため、安全側としてこの2クエリ方式を採用する。
// 常設広告クエリが失敗しても、既存の期限内投稿の取得・表示には影響しない
// (catchして空扱いにするのみ)。
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

    const unexpiredQuerySnapshot =
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

    let permanentAdQuerySnapshot =
      null;

    try {
      permanentAdQuerySnapshot =
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
            "isPermanentAd",
            "==",
            true
          )
          .get();
    } catch (permanentAdQueryError) {
      console.error(
        "常設広告一覧の取得に失敗しました（既存の期限内投稿の表示には影響しません）：",
        permanentAdQueryError
      );
    }

    const submissionDocumentsById =
      new Map();

    unexpiredQuerySnapshot.docs.forEach(
      function(documentSnapshot) {
        submissionDocumentsById.set(
          documentSnapshot.id,
          documentSnapshot
        );
      }
    );

    if (permanentAdQuerySnapshot) {
      permanentAdQuerySnapshot.docs.forEach(
        function(documentSnapshot) {
          submissionDocumentsById.set(
            documentSnapshot.id,
            documentSnapshot
          );
        }
      );
    }

    const submissions =
      Array.from(
        submissionDocumentsById.values()
      ).map(
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


function sanitizeCommentNickname(
  rawValue
) {
  const value =
    String(
      rawValue || ""
    )
      .trim()
      .slice(
        0,
        COMMENT_NICKNAME_MAX_LENGTH
      );

  return value === ""
    ? COMMENT_FALLBACK_NICKNAME
    : value;
}


// クライアントのIPアドレスは保存しない。スパム対策のクールダウン判定
// キーとしてのみハッシュ値を使い、生IPはFirestoreへ一切書き込まない。
// x-forwarded-forが取得できない場合は空文字を返し、呼び出し側は
// レート制限自体をスキップする(安全側はモデレーションが担うため、
// IP不明を理由に投稿自体を止めることはしない)。
function hashClientIpAddress(
  request
) {
  const forwardedForHeader =
    request.headers &&
    request.headers["x-forwarded-for"];

  const rawIp =
    typeof forwardedForHeader === "string"
      ? forwardedForHeader
          .split(",")[0]
          .trim()
      : "";

  if (rawIp === "") {
    return "";
  }

  return createHash("sha256")
    .update(
      rawIp,
      "utf8"
    )
    .digest("hex");
}


// claimSourceForLocationCollection()(api/admin-source-collect.js)と同じ
// Firestore transactionによるクールダウン判定の考え方を、コメント投稿の
// 簡易スパム対策に転用したもの。ipHashが空(IP不明)の場合は判定自体を
// スキップしtrue(投稿許可)を返す。
async function claimCommentRateLimit(
  database,
  ipHash
) {
  if (ipHash === "") {
    return true;
  }

  const rateLimitRef =
    database
      .collection(
        COMMENT_RATE_LIMITS_COLLECTION
      )
      .doc(
        ipHash
      );

  return database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(
          rateLimitRef
        );

      const data =
        snapshot.exists
          ? snapshot.data() || {}
          : {};

      const lastSubmittedAtMillis =
        data.lastSubmittedAt &&
        typeof data.lastSubmittedAt.toMillis === "function"
          ? data.lastSubmittedAt.toMillis()
          : null;

      const nowMilliseconds =
        Date.now();

      if (
        lastSubmittedAtMillis !== null &&
        (
          nowMilliseconds -
          lastSubmittedAtMillis
        ) < COMMENT_RATE_LIMIT_COOLDOWN_MILLISECONDS
      ) {
        return false;
      }

      transaction.set(
        rateLimitRef,
        {
          lastSubmittedAt:
            FieldValue.serverTimestamp()
        }
      );

      return true;
    }
  );
}


// マチナウ読み物(コラム)の記事下コメント投稿。新しいVercel Functionは
// 追加せず、既存のこのFunctionへmode追加のみで実装する。
// ①articleSlugをホワイトリストで検証→②ハニーポット欄(bot対策、人間には
// 見えないCSSで隠すだけで新しいUIコンポーネントは作らない)→③文字数検証→
// ④IPハッシュによる簡易クールダウン→⑤既存のOpenAI Moderation
// (callOpenAiModeration()、投稿審査と同一のAPI・モデル)で安全性確認、
// という順で処理し、コストがかかる④⑤より前に無料の①②③で弾けるものは
// 弾く。既存submissionsの「pending→人間確認」のような掲載待ちキューは
// 今回のMVPでは作らない(シンプルにする指示のため)。そのため判定は
// 「安全→即時approved掲載」「不安全・エラー→保存しない」の二択のみとし、
// 判定に迷う場合(モデレーションAPIエラー等)は安全側に倒して保存しない。
async function handlePostArticleCommentRequest(
  request,
  response
) {
  try {
    const requestBody =
      readRequestBody(
        request
      );

    const articleSlug =
      typeof requestBody.articleSlug === "string"
        ? requestBody.articleSlug.trim()
        : "";

    if (
      !ALLOWED_ARTICLE_COMMENT_SLUGS.includes(
        articleSlug
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

    // ハニーポット欄。人間の利用者には見えない(column側でCSS非表示にする)
    // ため、値が入っている場合はbotによる自動投稿とみなす。botへ「検知した」
    // ことを教えないため、保存はせず成功したふりの応答だけ返す。
    const honeypotValue =
      typeof requestBody.contactField === "string"
        ? requestBody.contactField.trim()
        : "";

    if (honeypotValue !== "") {
      return response.status(200).json({
        success: true,
        comment: null
      });
    }

    const nickname =
      sanitizeCommentNickname(
        requestBody.nickname
      );

    const commentText =
      typeof requestBody.comment === "string"
        ? requestBody.comment.trim()
        : "";

    if (commentText === "") {
      return response.status(400).json({
        success: false,
        message:
          "コメントを入力してください。"
      });
    }

    if (
      commentText.length >
      COMMENT_TEXT_MAX_LENGTH
    ) {
      return response.status(400).json({
        success: false,
        message:
          "コメントが長すぎます（" +
          COMMENT_TEXT_MAX_LENGTH +
          "文字以内でご入力ください）。"
      });
    }

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    const ipHash =
      hashClientIpAddress(
        request
      );

    const rateLimitOk =
      await claimCommentRateLimit(
        database,
        ipHash
      );

    if (!rateLimitOk) {
      return response.status(429).json({
        success: false,
        message:
          "少し時間をおいてから、もう一度お試しください。"
      });
    }

    let moderationResults =
      null;

    try {
      const inputItems =
        buildModerationInput(
          {
            title: nickname,
            content: commentText
          }
        );

      moderationResults =
        await callOpenAiModeration(
          inputItems
        );
    } catch (moderationError) {
      console.error(
        "コメントAI審査エラー：",
        moderationError
      );

      return response.status(200).json({
        success: false,
        message:
          "現在コメントを投稿できません。時間をおいて再度お試しください。"
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

    if (!allSafe) {
      return response.status(200).json({
        success: false,
        message:
          "コメント内容を確認できませんでした。表現を見直して投稿してください。"
      });
    }

    await database
      .collection(
        ARTICLE_COMMENTS_COLLECTION
      )
      .add(
        {
          articleSlug:
            articleSlug,

          nickname:
            nickname,

          comment:
            commentText,

          status:
            "approved",

          aiReviewVersion:
            AI_REVIEW_VERSION,

          createdAt:
            FieldValue.serverTimestamp()
        }
      );

    return response.status(200).json({
      success: true,
      comment: {
        nickname:
          nickname,

        comment:
          commentText,

        createdAt:
          new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(
      "コメント投稿エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメントの投稿に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}


// 記事別コメント一覧の公開取得(認証不要)。status=="approved"のみを対象と
// し、articleSlugで記事ごとに完全分離する。既存の公開submissions一覧
// (handlePublicSubmissionsListRequest())と同じく、エラー時はCache-Control
// no-storeのデフォルトのまま返し、成功時のみ短いCDN共有キャッシュを許可する
// (投稿直後の反映速度を優先し、submissions一覧より短いTTLにする)。
async function handleArticleCommentsListRequest(
  request,
  response
) {
  try {
    const articleSlug =
      request.query &&
      typeof request.query.articleSlug === "string"
        ? request.query.articleSlug.trim()
        : "";

    if (
      !ALLOWED_ARTICLE_COMMENT_SLUGS.includes(
        articleSlug
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    // 2つの等価条件(articleSlug/status)のみで絞り込み、orderByは付けない。
    // 等価条件と別フィールドのorderByを組み合わせるとFirestoreの複合indexが
    // 新規に必要になり、初回アクセス時にFAILED_PRECONDITIONで失敗する
    // (代表によるFirebase Console操作が別途必要になる)ため、それを避け、
    // 並び替えはこの関数内のJavaScript側(取得件数はCOMMENTS_LIST_MAX_COUNT
    // 件までのため負荷は軽微)で行う。新着順(createdAt降順)は、既存の
    // admin.html等の一覧表示(createdAt降順)と同じ並び順に揃えたもの。
    const commentsSnapshot =
      await database
        .collection(
          ARTICLE_COMMENTS_COLLECTION
        )
        .where(
          "articleSlug",
          "==",
          articleSlug
        )
        .where(
          "status",
          "==",
          "approved"
        )
        .limit(
          COMMENTS_LIST_MAX_COUNT
        )
        .get();

    const comments =
      commentsSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            return {
              nickname:
                typeof data.nickname === "string"
                  ? data.nickname
                  : COMMENT_FALLBACK_NICKNAME,

              comment:
                typeof data.comment === "string"
                  ? data.comment
                  : "",

              createdAtMillis:
                data.createdAt &&
                typeof data.createdAt.toMillis === "function"
                  ? data.createdAt.toMillis()
                  : 0,

              createdAt:
                data.createdAt &&
                typeof data.createdAt.toDate === "function"
                  ? data.createdAt.toDate().toISOString()
                  : null
            };
          }
        )
        .sort(
          function(firstComment, secondComment) {
            return (
              secondComment.createdAtMillis -
              firstComment.createdAtMillis
            );
          }
        )
        .map(
          function(comment) {
            return {
              nickname: comment.nickname,
              comment: comment.comment,
              createdAt: comment.createdAt
            };
          }
        );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        COMMENTS_LIST_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        COMMENTS_LIST_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).json({
      success: true,
      comments: comments
    });
  } catch (error) {
    console.error(
      "コメント一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメントを取得できませんでした。"
    });
  }
}


// マチナウ読み物コメントMVP・最小管理機能｜api/admin-post.js・
// api/admin-submission-update.jsと全く同じ「Bearer IDトークンを検証し、
// email が process.env.ADMIN_EMAIL と一致するか」だけを見る既存の管理者
// 認証方式をそのまま再利用する。新しい認証方式(APIキー・別の秘密鍵等)は
// 一切作らない。一般ユーザーがこの経路でコメントを非表示にすることは
// できない(有効なFirebase管理者アカウントのIDトークンが必須のため)。
async function verifyAdminBearerToken(
  app,
  request
) {
  const adminEmail =
    process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    return {
      ok: false,
      status: 500,
      message:
        "管理者メールアドレスが設定されていません。"
    };
  }

  const idToken =
    readBearerToken(
      request
    );

  if (idToken === "") {
    return {
      ok: false,
      status: 401,
      message:
        "認証情報がありません。"
    };
  }

  let decodedToken;

  try {
    decodedToken =
      await getAuth(app)
        .verifyIdToken(
          idToken
        );
  } catch (verifyError) {
    return {
      ok: false,
      status: 401,
      message:
        "認証情報が正しくありません。"
    };
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
    return {
      ok: false,
      status: 403,
      message:
        "管理者権限がありません。"
    };
  }

  return {
    ok: true,
    adminEmail: decodedEmail
  };
}


// マチナウ読み物コメント管理(最小機能)｜指定articleSlugの全コメントを、
// status(approved/hidden)を問わず一覧取得する。公開用のGET(status==="approved"
// のみ)とは完全に別の関数・別のmodeであり、この関数自体が管理者認証必須
// のため一般ユーザーは呼び出せない。
async function handleAdminListArticleCommentsRequest(
  request,
  response
) {
  try {
    const app =
      getFirebaseAdminApp();

    const authResult =
      await verifyAdminBearerToken(
        app,
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const articleSlug =
      typeof requestBody.articleSlug === "string"
        ? requestBody.articleSlug.trim()
        : "";

    if (
      !ALLOWED_ARTICLE_COMMENT_SLUGS.includes(
        articleSlug
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

    const database =
      getFirestore(
        app
      );

    const commentsSnapshot =
      await database
        .collection(
          ARTICLE_COMMENTS_COLLECTION
        )
        .where(
          "articleSlug",
          "==",
          articleSlug
        )
        .limit(
          COMMENTS_LIST_MAX_COUNT
        )
        .get();

    const comments =
      commentsSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            return {
              id:
                documentSnapshot.id,

              nickname:
                typeof data.nickname === "string"
                  ? data.nickname
                  : COMMENT_FALLBACK_NICKNAME,

              comment:
                typeof data.comment === "string"
                  ? data.comment
                  : "",

              status:
                typeof data.status === "string"
                  ? data.status
                  : "",

              createdAtMillis:
                data.createdAt &&
                typeof data.createdAt.toMillis === "function"
                  ? data.createdAt.toMillis()
                  : 0,

              createdAt:
                data.createdAt &&
                typeof data.createdAt.toDate === "function"
                  ? data.createdAt.toDate().toISOString()
                  : null
            };
          }
        )
        .sort(
          function(firstComment, secondComment) {
            return (
              secondComment.createdAtMillis -
              firstComment.createdAtMillis
            );
          }
        )
        .map(
          function(comment) {
            return {
              id: comment.id,
              nickname: comment.nickname,
              comment: comment.comment,
              status: comment.status,
              createdAt: comment.createdAt
            };
          }
        );

    return response.status(200).json({
      success: true,
      comments: comments
    });
  } catch (error) {
    console.error(
      "コメント管理一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメント一覧を取得できませんでした。"
    });
  }
}


// マチナウ読み物コメント管理(最小機能)｜物理削除ではなくstatusを"hidden"へ
// 変更するだけの非表示化。既存のsubmissions(status:"approved"→"expired"/
// "rejected")と同じ「物理削除しない」設計を踏襲し、監査性(いつ・誰が)を
// 残す。公開GET(handleArticleCommentsListRequest())はstatus==="approved"
// のみを返す設計を無変更のまま維持しているため、statusを変えるだけで
// 自動的に公開一覧から消える。既にhidden済みの場合は再書き込みせず
// 成功扱いで返す(冪等)。
async function handleAdminHideArticleCommentRequest(
  request,
  response
) {
  try {
    const app =
      getFirebaseAdminApp();

    const authResult =
      await verifyAdminBearerToken(
        app,
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
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
      getFirestore(
        app
      );

    const documentReference =
      database
        .collection(
          ARTICLE_COMMENTS_COLLECTION
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
          "対象のコメントが見つかりませんでした。"
      });
    }

    const currentData =
      documentSnapshot.data() ||
      {};

    if (
      currentData.status === "hidden"
    ) {
      return response.status(200).json({
        success: true,
        message:
          "このコメントは既に非表示です。"
      });
    }

    await documentReference.update(
      {
        status:
          "hidden",

        hiddenAt:
          FieldValue.serverTimestamp(),

        hiddenBy:
          authResult.adminEmail
      }
    );

    return response.status(200).json({
      success: true,
      message:
        "コメントを非表示にしました。"
    });
  } catch (error) {
    console.error(
      "コメント非表示化エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメントを非表示にできませんでした。"
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
    // マチナウ読み物コメント機能MVP｜既存のsubmissions一覧取得(query無し)とは
    // 別のquery(mode=articleComments)でのみ分岐させ、既存の呼び出し(query無し)
    // には一切影響させない。
    if (
      request.query &&
      request.query.mode === "articleComments"
    ) {
      return handleArticleCommentsListRequest(
        request,
        response
      );
    }

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

  // マチナウ読み物コメント機能MVP｜既存のcloudinarySignature/aiConciergeと
  // 同じ位置(モード判定)に追加するだけで、GET一覧取得・既定の投稿審査
  // (この先のtry節、publicationNumber/endCodeによるAI自動審査トリガー)の
  // いずれにも一切触れない。
  if (
    requestBody.mode === "postArticleComment"
  ) {
    return handlePostArticleCommentRequest(
      request,
      response
    );
  }

  // マチナウ読み物コメント管理(最小機能)｜管理者認証必須の2モード。
  // 一般ユーザー向けpostArticleComment/GET一覧とは別のmodeのため、
  // 既存の一般公開経路には一切影響しない。
  if (
    requestBody.mode === "adminListArticleComments"
  ) {
    return handleAdminListArticleCommentsRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminHideArticleComment"
  ) {
    return handleAdminHideArticleCommentRequest(
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
