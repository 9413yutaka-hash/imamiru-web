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
// 完結する安全設計)。
const ARTICLE_COMMENTS_COLLECTION =
  "articleComments";

// マチナウ読み物投稿機能(Phase1)導入前から存在する唯一の静的HTML記事
// (column/typhoon-okinawa-travel.html)専用の互換リスト。この記事は
// Firestore columnArticlesへ一切登録せず(URLも本文もコメントも壊さない
// という指示のため、既存の仕組みへ一切手を触れない)、コメント対象判定
// でだけ「常に許可」として扱う。新しい静的コラムを今後手作業で追加する
// 予定はないため、このリストへの追記は原則発生しない想定(通常の新規記事は
// すべてadmin-column.html経由のFirestore記事として作成され、
// isColumnSlugEligibleForComments()が自動的にコメント対象として扱う)。
const LEGACY_STATIC_COLUMN_SLUGS =
  [
    "typhoon-okinawa-travel"
  ];

// マチナウ読み物投稿機能(Phase1)｜Firestore columnArticlesのドキュメントID
// そのものをslug(URLの一部)として使う(別途slugフィールドを持たない、
// IDとslugが食い違う不整合を構造的に無くすため)。
const COLUMN_ARTICLES_COLLECTION =
  "columnArticles";

const COLUMN_STATUS_DRAFT =
  "draft";

const COLUMN_STATUS_PUBLISHED =
  "published";

// Phase1では少数の分かりやすいカテゴリーのみを用意する(大量のカテゴリーを
// 作らない指示のため)。将来増やす場合はこの配列に追記するだけでよく、
// admin-column.html側の同名配列と両方を更新する(既存のOKINAWA_MUNICIPALITY_
// TO_REGION_NAME等と同じ、複製管理の方針を踏襲)。
const ALLOWED_COLUMN_CATEGORIES =
  [
    "文化・背景",
    "楽しみ方",
    "安全・備え",
    "マチナウの想い"
  ];

const COLUMN_TITLE_MAX_LENGTH =
  60;

const COLUMN_DESCRIPTION_MAX_LENGTH =
  120;

const COLUMN_CONTENT_MAX_LENGTH =
  6000;

// 代表が任意でURL識別子(slug)を指定できる場合の形式。指定しない場合は
// Firestoreの自動採番IDをそのままslugとして使うため、代表が英語slugを
// 考える必要はない。
const COLUMN_CUSTOM_SLUG_PATTERN =
  /^[a-z0-9]+(-[a-z0-9]+)*$/;

const COLUMN_CUSTOM_SLUG_MAX_LENGTH =
  60;

const COLUMN_LIST_MAX_COUNT =
  200;

// ==========================================================================
// マチナウ読み物投稿機能(Phase2)｜地域連動基盤
// columnArticlesは「沖縄専用」データ構造を新たに固定しない。国(country)・
// 都道府県/州等(prefecture)・市区町村(city)・任意の細粒度エリア(area)の
// 4階層をすべて任意項目として持たせ、記事ごとに粒度を選べるようにする
// (例：「沖縄の雨」はcountry+prefectureのみ、「国際通りは…」はcity+area
// まで指定、「日本のお正月」はcountryのみ)。既存のOKINAWA_MUNICIPALITY_TO_
// REGION_NAME(app.js、沖縄8広域グループ)・submissions.area・
// regionRecommendations.targetAreasはいずれも変更しない、完全に独立した
// 新設計。
// ==========================================================================

const COLUMN_REGION_FIELD_MAX_LENGTHS =
  {
    prefecture: 40,
    city: 40,
    area: 40
  };

// Ver1.8 Phase2(国識別の世界対応・仕上げ)｜countryは表示名の揺れ(「日本」
// 「Japan」等、入力言語や閲覧者のGoogle Geocoderロケールにより変わりうる)
// を一切許さず、ISO 3166-1 alpha-2の国コードのみを正本として保存する。
// 「JP/France/日本/フランスが混在する」状態を防ぐため、コードを覚えて
// もらう代わりに、admin-column.html・column-list.htmlの国欄を自由記述の
// テキストから<select>(値=コード、表示=国名)へ変更し、代表・利用者とも
// コードを直接入力する必要が無い設計にした(手書きの国名変換表を増やす
// アプローチは採らない)。
//
// 保持するのは「ISO 3166-1で現在割り当てられているalpha-2コードの一覧」
// という、めったに変わらない国際標準の一覧だけ(新規発行・廃止は極めて
// まれ)。表示用の国名(日本語ラベル)は一切手書きせず、Node.js/ブラウザ
// 標準搭載のIntl.DisplayNames(新しい外部API・依存ライブラリを追加せず、
// ECMAScript国際化APIの標準機能)で実行時に生成する。これにより、
// 世界中どの国コードを追加しても翻訳表のメンテナンスが発生しない。
const ISO_3166_1_ALPHA_2_COUNTRY_CODES =
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
    "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
    "DE DJ DK DM DO DZ " +
    "EC EE EG EH ER ES ET " +
    "FI FJ FK FM FO FR " +
    "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
    "HK HM HN HR HT HU " +
    "ID IE IL IM IN IO IQ IR IS IT " +
    "JE JM JO JP " +
    "KE KG KH KI KM KN KP KR KW KY KZ " +
    "LA LB LC LI LK LR LS LT LU LV LY " +
    "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
    "NA NC NE NF NG NI NL NO NP NR NU NZ " +
    "OM " +
    "PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
    "QA " +
    "RE RO RS RU RW " +
    "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
    "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
    "UA UG UM US UY UZ " +
    "VA VC VE VG VI VN VU " +
    "WF WS " +
    "YE YT " +
    "ZA ZM ZW"
  ).split(" ");

const ISO_3166_1_ALPHA_2_COUNTRY_CODE_SET =
  new Set(
    ISO_3166_1_ALPHA_2_COUNTRY_CODES
  );

let cachedJapaneseCountryDisplayNames =
  null;

// Intl.DisplayNamesは環境によって未実装の可能性がある(Vercelの
// Node.jsランタイムでは通常利用可能)。使えない場合はコードをそのまま
// 表示にフォールバックし、機能停止にはしない。
function getCountryDisplayLabel(
  countryCode
) {
  if (
    typeof countryCode !== "string" ||
    countryCode === ""
  ) {
    return "";
  }

  const normalizedCode =
    countryCode.toUpperCase();

  try {
    if (!cachedJapaneseCountryDisplayNames) {
      cachedJapaneseCountryDisplayNames =
        new Intl.DisplayNames(
          ["ja"],
          {
            type: "region"
          }
        );
    }

    const label =
      cachedJapaneseCountryDisplayNames.of(
        normalizedCode
      );

    return (
      typeof label === "string" &&
      label !== ""
        ? label
        : normalizedCode
    );
  } catch (error) {
    return normalizedCode;
  }
}

// 新規保存時はISO 3166-1 alpha-2コードのみを正本として受け付ける
// (JP/France/日本/フランス等の混在を防ぐ)。admin-column.htmlが
// <select>(値=コード)へ変更されたため、通常はここで弾かれることは
// ないが、API直叩き等の想定外入力に備えて厳密に検証する。
function validateColumnRegionCountryCode(
  rawValue
) {
  const trimmedValue =
    String(
      rawValue || ""
    )
      .trim()
      .toUpperCase();

  if (trimmedValue === "") {
    return "";
  }

  if (
    !ISO_3166_1_ALPHA_2_COUNTRY_CODE_SET.has(
      trimmedValue
    )
  ) {
    throw new Error(
      "国の指定が正しくありません。選択肢から選び直してください。"
    );
  }

  return trimmedValue;
}

const COLUMN_ARTICLE_PAGE_SHARED_CACHE_MAX_AGE_SECONDS =
  300;

const COLUMN_ARTICLE_PAGE_STALE_WHILE_REVALIDATE_SECONDS =
  600;

const COLUMN_LIST_SHARED_CACHE_MAX_AGE_SECONDS =
  60;

const COLUMN_LIST_STALE_WHILE_REVALIDATE_SECONDS =
  120;

const SITEMAP_SHARED_CACHE_MAX_AGE_SECONDS =
  300;

const SITEMAP_STALE_WHILE_REVALIDATE_SECONDS =
  600;

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


// マチナウ読み物投稿機能(Phase1)｜コメント対象記事の判定を、旧来の
// 静的コラム(LEGACY_STATIC_COLUMN_SLUGS、既存の1記事専用の互換維持)と、
// Firestore columnArticlesに実在しstatus==="published"の記事、の
// どちらかであればtrueとする。後者により、admin-column.html経由で新しく
// 公開された読み物は、コード変更なしに自動でコメント対象になる
// (「記事を追加するたびコード変更をなくす」という指示に対応)。
async function isColumnSlugEligibleForComments(
  database,
  articleSlug
) {
  if (
    articleSlug === ""
  ) {
    return false;
  }

  if (
    LEGACY_STATIC_COLUMN_SLUGS.includes(
      articleSlug
    )
  ) {
    return true;
  }

  const articleSnapshot =
    await database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc(
        articleSlug
      )
      .get();

  return (
    articleSnapshot.exists &&
    articleSnapshot.data().status ===
      COLUMN_STATUS_PUBLISHED
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

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    if (
      !(await isColumnSlugEligibleForComments(
        database,
        articleSlug
      ))
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

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    if (
      !(await isColumnSlugEligibleForComments(
        database,
        articleSlug
      ))
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

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

    const database =
      getFirestore(
        app
      );

    if (
      !(await isColumnSlugEligibleForComments(
        database,
        articleSlug
      ))
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

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


// ==========================================================================
// マチナウ読み物投稿機能(Phase1)
// 新しいVercel Functionは追加せず、既存のこのFunctionへmode追加のみで
// 実装する(Functions 12/12を維持)。columnArticlesコレクションはクライアント
// から直接読み書きさせず、常にAdmin SDK経由(このFunction経由)のみで
// アクセスするため、Firestore Security Rulesの変更は一切不要。
// column/typhoon-okinawa-travel.html(既存の唯一の静的記事)には一切触れず、
// URL・本文・コメント・GA4いずれも無変更のまま独立して残す。
// ==========================================================================

function escapeHtmlForRender(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function toDateFromFirestoreValue(
  value
) {
  if (
    value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  return null;
}


function formatDateForDisplay(
  date
) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}


function formatDateForAttribute(
  date
) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const twoDigits =
    function(numberValue) {
      return String(
        numberValue
      ).padStart(
        2,
        "0"
      );
    };

  return (
    date.getFullYear() +
    "-" +
    twoDigits(
      date.getMonth() + 1
    ) +
    "-" +
    twoDigits(
      date.getDate()
    )
  );
}


// 本文(プレーンテキスト、admin-column.htmlのtextareaからそのまま届く)を
// 空行区切りの段落として扱い、各段落をエスケープした<p>へ変換する。
// 管理者入力であってもHTMLタグは一切許可しない(admin-post.js等、既存の
// マチナウ運営コンテンツもすべてプレーンテキスト入力のみで、リッチテキスト
// 入力欄を持たせる既存資産が無いため、この方針を踏襲する)。
function buildColumnArticleParagraphsHtml(
  content
) {
  const paragraphs =
    String(
      content || ""
    )
      .split(
        /\n\s*\n/
      )
      .map(
        function(paragraph) {
          return paragraph.trim();
        }
      )
      .filter(
        function(paragraph) {
          return paragraph !== "";
        }
      );

  return paragraphs
    .map(
      function(paragraph) {
        return (
          "<p>" +
          escapeHtmlForRender(
            paragraph
          ).replaceAll(
            "\n",
            "<br>"
          ) +
          "</p>"
        );
      }
    )
    .join(
      "\n      "
    );
}


// column/typhoon-okinawa-travel.htmlと同じCSS変数・カード構造・GA4呼び出し
// 方式・コメントセクション構造を再利用する(見た目を統一するため、既存の
// 静的HTMLからCSSブロックを複製している。既存ファイル自体は変更しない)。
function buildColumnArticleHtml(
  article
) {
  const canonicalUrl =
    "https://machinau.jp/column/" +
    article.slug +
    ".html";

  const publishedDisplay =
    formatDateForDisplay(
      article.publishedAtDate
    );

  const updatedDisplay =
    formatDateForDisplay(
      article.updatedAtDate ||
        article.publishedAtDate
    );

  const publishedAttribute =
    formatDateForAttribute(
      article.publishedAtDate
    );

  const updatedAttribute =
    formatDateForAttribute(
      article.updatedAtDate ||
        article.publishedAtDate
    );

  const escapedTitle =
    escapeHtmlForRender(
      article.title
    );

  const escapedDescription =
    escapeHtmlForRender(
      article.description
    );

  const escapedCategory =
    escapeHtmlForRender(
      article.category
    );

  const escapedSlugForJs =
    JSON.stringify(
      article.slug
    );

  // Ver1.8 Phase2(地域連動基盤)｜地域名は表示のためだけに使い、タイトル・
  // descriptionへは詰め込まない(不自然なSEO詰め込みを避ける指示のため)。
  // 空の階層は単に表示しない(市区町村未設定の記事は「日本 / 沖縄県」まで、
  // というように自然に短くなる)。
  const regionBreadcrumbParts =
    [
      article.regionCountryLabel,
      article.regionPrefecture,
      article.regionCity,
      article.regionArea
    ].filter(
      function(part) {
        return (
          typeof part === "string" &&
          part.trim() !== ""
        );
      }
    );

  const regionBreadcrumbHtml =
    regionBreadcrumbParts.length > 0
      ? '<p class="article-region">' +
        regionBreadcrumbParts
          .map(
            escapeHtmlForRender
          )
          .join(
            " / "
          ) +
        "</p>"
      : "";

  const hasMainImage =
    typeof article.imageUrl === "string" &&
    article.imageUrl !== "";

  const ogImageUrl =
    hasMainImage
      ? article.imageUrl
      : "https://machinau.jp/icon-512.png";

  const mainImageHtml =
    hasMainImage
      ? '<img class="article-main-image" src="' +
        escapeHtmlForRender(
          article.imageUrl
        ) +
        '" alt="' +
        escapedTitle +
        '" loading="lazy">'
      : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <script>
    (function () {
      if (location.hostname !== "machinau.jp" && location.hostname !== "imamiru-web.vercel.app") {
        return;
      }

      window.dataLayer = window.dataLayer || [];

      window.gtag = function () {
        dataLayer.push(arguments);
      };

      gtag("js", new Date());
      gtag("config", "G-PGM7GNVQX8");

      const gaScript = document.createElement("script");
      gaScript.async = true;
      gaScript.src =
        "https://www.googletagmanager.com/gtag/js?id=G-PGM7GNVQX8";
      document.head.appendChild(gaScript);
    })();
  </script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0788c9">
  <meta name="description" content="${escapedDescription}">
  <title>${escapedTitle}｜マチナウ</title>
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/svg+xml" href="../favicon.svg">
  <link rel="manifest" href="../manifest.json">
  <link rel="apple-touch-icon" href="../apple-touch-icon.png">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapedTitle}｜マチナウ">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta name="twitter:card" content="summary${hasMainImage ? "_large_image" : ""}">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(article.title)},
    "description": ${JSON.stringify(article.description)},
    "image": ${JSON.stringify(ogImageUrl)},
    "author": { "@type": "Organization", "name": "マチナウ運営" },
    "publisher": {
      "@type": "Organization",
      "name": "マチナウ",
      "logo": { "@type": "ImageObject", "url": "https://machinau.jp/icon-512.png" }
    },
    "datePublished": "${publishedAttribute}",
    "dateModified": "${updatedAttribute}",
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonicalUrl}" }
  }
  </script>

  <style>
    :root {
      --navy: #071a33;
      --blue: #0788c9;
      --cyan: #04b7d7;
      --white: #ffffff;
      --text: #15233a;
      --subtext: #697386;
      --border: #e7edf3;
      --background: #f4f8fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0 0 60px;
      font-family: "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
      background: var(--background);
      color: var(--text);
    }
    .page-header {
      padding: 28px 18px;
      background: linear-gradient(135deg, #0788c9, #04b7d7);
      color: var(--white);
      text-align: center;
    }
    .brand-mini {
      display: inline-flex; align-items: center; gap: 8px;
      font-weight: 900; font-size: 15px; margin-bottom: 14px;
    }
    .brand-mini-icon {
      width: 28px; height: 28px; display: grid; place-items: center;
      border-radius: 9px; background: rgba(255, 255, 255, 0.2); font-size: 15px;
    }
    .page-header h1 { margin: 0; font-size: 22px; line-height: 1.5; }
    main { width: min(100%, 680px); margin: -20px auto 0; padding: 0 18px; }
    .card {
      background: var(--white); border-radius: 22px;
      box-shadow: 0 16px 45px rgba(20, 52, 82, 0.12); padding: 30px 22px;
    }
    .article-meta { margin: 0 0 12px; color: var(--subtext); font-size: 12px; }
    .article-region { margin: 0 0 8px; color: var(--subtext); font-size: 12px; }
    .article-category {
      display: inline-block; margin: 0 0 14px; padding: 5px 12px;
      border-radius: 999px; background: #eef7fb; color: var(--blue);
      font-size: 11px; font-weight: 900;
    }
    .article-main-image {
      display: block; width: 100%; max-height: 320px; object-fit: cover;
      border-radius: 16px; margin: 0 0 20px;
    }
    .lede { margin: 0 0 28px; font-size: 15px; line-height: 2; color: var(--text); }
    p { font-size: 14px; line-height: 2; color: var(--text); }
    .cta-section {
      margin-top: 36px; padding: 24px 20px; border-radius: 18px;
      background: linear-gradient(135deg, #0788c9, #04b7d7);
      color: var(--white); text-align: center;
    }
    .cta-section p { color: rgba(255, 255, 255, 0.92); margin: 0 0 16px; font-size: 13px; }
    .cta-button {
      display: inline-block; padding: 13px 28px; border-radius: 999px;
      background: var(--white); color: var(--blue); font-weight: 700;
      font-size: 14px; text-decoration: none;
    }
    .byline {
      margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--border);
      font-size: 12px; color: var(--subtext);
    }
    .back-link {
      display: inline-block; margin-top: 24px; font-size: 13px;
      font-weight: 700; color: var(--blue); text-decoration: none;
    }
    .comment-section { margin: 34px 0 0; padding-top: 22px; border-top: 1px solid var(--border); }
    .comment-section h2 { margin: 0 0 10px; font-size: 16px; color: var(--navy); }
    .comment-form { display: grid; gap: 10px; margin: 14px 0 0; }
    .comment-form label { display: block; margin: 0 0 5px; color: var(--navy); font-size: 12px; font-weight: 700; }
    .comment-form input, .comment-form textarea {
      width: 100%; padding: 11px 13px; border: 1px solid var(--border); border-radius: 12px;
      outline: none; color: var(--text); background: #fbfdfe; font-size: 14px; font-family: inherit;
    }
    .comment-form input:focus, .comment-form textarea:focus { border-color: var(--cyan); background: var(--white); }
    .comment-form textarea { min-height: 90px; resize: vertical; }
    .comment-honeypot-field { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
    .comment-submit-button {
      justify-self: start; min-height: 44px; padding: 11px 22px; border: none; border-radius: 999px;
      color: var(--white); background: linear-gradient(135deg, var(--blue), var(--cyan));
      font-size: 13px; font-weight: 900; cursor: pointer;
    }
    .comment-submit-button:disabled { opacity: 0.6; cursor: wait; }
    .comment-status-message { margin: 2px 0 0; font-size: 12px; line-height: 1.7; min-height: 1em; }
    .comment-status-message.success { color: #146e4a; }
    .comment-status-message.error { color: #a93d3d; }
    .comment-list { display: grid; gap: 12px; margin: 20px 0 0; }
    .comment-item { padding: 13px 14px; border-radius: 13px; background: #f4f8fa; }
    .comment-item-nickname { margin: 0; color: var(--navy); font-size: 12px; font-weight: 900; }
    .comment-item-body { margin: 6px 0 0; color: var(--text); font-size: 13px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
    .comment-item-time { margin: 6px 0 0; color: var(--subtext); font-size: 10px; }
    .comment-empty-state {
      margin: 16px 0 0; padding: 16px; border: 1px dashed var(--border); border-radius: 13px;
      color: var(--subtext); font-size: 12px; text-align: center;
    }
  </style>
</head>
<body>

  <div class="page-header">
    <div class="brand-mini"><span class="brand-mini-icon">🌺</span>マチナウ</div>
    <h1>${escapedTitle}</h1>
  </div>

  <main>
    <div class="card">

      ${regionBreadcrumbHtml}

      <span class="article-category">${escapedCategory}</span>

      <p class="article-meta">
        公開日：<time datetime="${publishedAttribute}">${publishedDisplay}</time>／更新日：<time datetime="${updatedAttribute}">${updatedDisplay}</time>
      </p>

      ${mainImageHtml}

      <p class="lede">${escapedDescription}</p>

      ${buildColumnArticleParagraphsHtml(
        article.content
      )}

      <div class="cta-section">
        <p>天気・交通・地域の「今」を確認して、このあとの判断材料に。</p>
        <a class="cta-button" href="../" onclick="if (typeof gtag === 'function') { gtag('event', 'column_cta_click', { article_slug: ${escapedSlugForJs} }); }">今の沖縄をマチナウで見る</a>
      </div>

      <p class="byline">マチナウ運営</p>

      <div class="comment-section">
        <h2>この記事にコメントする</h2>

        <form id="commentForm" class="comment-form" novalidate>
          <div>
            <label for="commentNicknameInput">ニックネーム</label>
            <input id="commentNicknameInput" type="text" maxlength="20" placeholder="例：旅好き" autocomplete="off">
          </div>
          <div>
            <label for="commentTextInput">コメント</label>
            <textarea id="commentTextInput" maxlength="500" placeholder="この記事についてのご感想や、実際に体験したことなどをどうぞ"></textarea>
          </div>
          <div class="comment-honeypot-field" aria-hidden="true">
            <label for="commentContactField">ウェブサイト</label>
            <input id="commentContactField" type="text" tabindex="-1" autocomplete="off">
          </div>
          <button id="commentSubmitButton" class="comment-submit-button" type="submit">コメントを投稿する</button>
          <p id="commentStatusMessage" class="comment-status-message" role="status" aria-live="polite"></p>
        </form>

        <div id="commentList" class="comment-list">
          <div class="comment-empty-state">コメントを読み込んでいます…</div>
        </div>
      </div>

      <a class="back-link" href="../">← マチナウTOPへ戻る</a>

    </div>
  </main>

  <script>
    const ARTICLE_SLUG = ${escapedSlugForJs};
    const commentForm = document.getElementById("commentForm");
    const commentNicknameInput = document.getElementById("commentNicknameInput");
    const commentTextInput = document.getElementById("commentTextInput");
    const commentContactField = document.getElementById("commentContactField");
    const commentSubmitButton = document.getElementById("commentSubmitButton");
    const commentStatusMessage = document.getElementById("commentStatusMessage");
    const commentList = document.getElementById("commentList");

    function escapeCommentHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function showCommentStatus(message, type) {
      commentStatusMessage.textContent = message;
      commentStatusMessage.className = "comment-status-message" + (type ? " " + type : "");
    }

    function formatCommentTime(isoString) {
      if (typeof isoString !== "string" || isoString === "") return "";
      const parsedDate = new Date(isoString);
      if (Number.isNaN(parsedDate.getTime())) return "";
      return parsedDate.toLocaleString("ja-JP");
    }

    function renderCommentItemHtml(comment) {
      const timeText = formatCommentTime(comment.createdAt);
      return (
        '<div class="comment-item">' +
          '<p class="comment-item-nickname">' + escapeCommentHtml(comment.nickname) + '</p>' +
          '<p class="comment-item-body">' + escapeCommentHtml(comment.comment) + '</p>' +
          (timeText !== "" ? '<p class="comment-item-time">' + escapeCommentHtml(timeText) + '</p>' : "") +
        '</div>'
      );
    }

    function renderComments(comments) {
      if (!Array.isArray(comments) || comments.length === 0) {
        commentList.innerHTML = '<div class="comment-empty-state">まだコメントはありません。最初のコメントを投稿してみませんか？</div>';
        return;
      }
      commentList.innerHTML = comments.map(renderCommentItemHtml).join("");
    }

    async function loadComments() {
      try {
        const response = await fetch("/api/moderate-submission?mode=articleComments&articleSlug=" + encodeURIComponent(ARTICLE_SLUG));
        const responseData = await response.json();
        if (!response.ok || !responseData || responseData.success !== true) {
          throw new Error("コメントを取得できませんでした。");
        }
        renderComments(responseData.comments);
      } catch (error) {
        console.error("コメント一覧の取得に失敗しました：", error);
        commentList.innerHTML = '<div class="comment-empty-state">コメントを読み込めませんでした。時間をおいて再度お試しください。</div>';
      }
    }

    commentForm.addEventListener("submit", async function(event) {
      event.preventDefault();
      showCommentStatus("", "");
      commentSubmitButton.disabled = true;
      commentSubmitButton.textContent = "投稿しています…";
      try {
        const response = await fetch("/api/moderate-submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "postArticleComment",
            articleSlug: ARTICLE_SLUG,
            nickname: commentNicknameInput.value,
            comment: commentTextInput.value,
            contactField: commentContactField.value
          })
        });
        let responseData = null;
        try { responseData = await response.json(); } catch (jsonError) { throw new Error("応答を読み取れませんでした。"); }
        if (!responseData || responseData.success !== true) {
          showCommentStatus((responseData && responseData.message) || "コメントを投稿できませんでした。", "error");
          return;
        }
        if (responseData.comment) {
          const existingEmptyState = commentList.querySelector(".comment-empty-state");
          if (existingEmptyState) { commentList.innerHTML = ""; }
          commentList.insertAdjacentHTML("afterbegin", renderCommentItemHtml(responseData.comment));
        }
        commentTextInput.value = "";
        showCommentStatus("コメントを投稿しました。", "success");
      } catch (error) {
        console.error("コメント投稿に失敗しました：", error);
        showCommentStatus("コメントの投稿に失敗しました。時間をおいて、もう一度お試しください。", "error");
      } finally {
        commentSubmitButton.disabled = false;
        commentSubmitButton.textContent = "コメントを投稿する";
      }
    });

    loadComments();
  </script>

</body>
</html>
`;
}


function buildColumnNotFoundHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>記事が見つかりません｜マチナウ</title>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 60px 20px; color: #15233a;">
  <p>お探しの記事は見つかりませんでした。</p>
  <p><a href="/" style="color: #0788c9;">マチナウTOPへ戻る</a></p>
</body>
</html>
`;
}


// 記事本体のHTMLを動的レンダリングする(vercel.jsonのrewriteにより、
// 実在する静的ファイルが無い/column/*.htmlへのアクセスだけがここへ届く。
// 既存の/column/typhoon-okinawa-travel.html(実ファイルとして存在)は
// Vercelの仕様上、静的ファイルの一致がrewriteより優先されるため、この
// 関数には一切到達しない＝無変更のまま維持される)。
async function handleRenderColumnArticleRequest(
  request,
  response
) {
  try {
    const slug =
      request.query &&
      typeof request.query.slug === "string"
        ? request.query.slug.trim()
        : "";

    if (
      slug === "" ||
      LEGACY_STATIC_COLUMN_SLUGS.includes(
        slug
      )
    ) {
      response.setHeader(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      return response.status(404).send(
        buildColumnNotFoundHtml()
      );
    }

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    const documentSnapshot =
      await database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .doc(
          slug
        )
        .get();

    if (
      !documentSnapshot.exists ||
      documentSnapshot.data().status !==
        COLUMN_STATUS_PUBLISHED
    ) {
      response.setHeader(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      return response.status(404).send(
        buildColumnNotFoundHtml()
      );
    }

    const data =
      documentSnapshot.data();

    const html =
      buildColumnArticleHtml(
        {
          slug: slug,
          title: data.title,
          category: data.category,
          description: data.description,
          content: data.content,

          regionCountryLabel:
            getCountryDisplayLabel(
              typeof data.regionCountry === "string"
                ? data.regionCountry
                : ""
            ),

          regionPrefecture:
            typeof data.regionPrefecture === "string"
              ? data.regionPrefecture
              : "",

          regionCity:
            typeof data.regionCity === "string"
              ? data.regionCity
              : "",

          regionArea:
            typeof data.regionArea === "string"
              ? data.regionArea
              : "",

          imageUrl:
            typeof data.imageUrl === "string"
              ? data.imageUrl
              : "",

          publishedAtDate:
            toDateFromFirestoreValue(
              data.publishedAt
            ),
          updatedAtDate:
            toDateFromFirestoreValue(
              data.updatedAt
            )
        }
      );

    response.setHeader(
      "Content-Type",
      "text/html; charset=utf-8"
    );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        COLUMN_ARTICLE_PAGE_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        COLUMN_ARTICLE_PAGE_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).send(
      html
    );
  } catch (error) {
    console.error(
      "読み物ページのレンダリングエラー：",
      error
    );

    response.setHeader(
      "Content-Type",
      "text/html; charset=utf-8"
    );

    return response.status(500).send(
      buildColumnNotFoundHtml()
    );
  }
}


// 公開済みマチナウ読み物の一覧(TOPの動的カード表示用)。既存の静的カード
// (index.html内のtyphoon-okinawa-travel専用マークアップ)はそのまま残し、
// このAPIはそれに追加するFirestore由来の記事だけを返す(既存カードとの
// 重複は発生しない設計)。
// Ver1.8 Phase2(地域連動基盤)｜記事の地域タグと閲覧者の現在地(country/
// prefecture/city、いずれも空文字なら未取得)を突き合わせ、地域の関連度を
// 4段階(3=市区町村完全一致、2=同一都道府県・州等でその記事にcityの指定が
// 無い、1=同一国でその記事にprefecture/cityの指定が無い、0=関連度なし)で
// 返す。記事側のより下位階層(city等)が指定されている場合は、その階層での
// 完全一致だけを見る(上位階層への取りこぼしフォールバックはしない。
// 「那覇市限定」記事を沖縄県内の別市町村の閲覧者にも関連ありと広げすぎない
// ため)。matchLevel 0の記事も除外はしない(現在地以外の記事を読めなくしては
// いけないという指示のため、並び順を後ろにするだけ)。
function computeColumnArticleMatchLevel(
  article,
  viewer
) {
  if (
    article.regionCity !== "" &&
    viewer.city !== "" &&
    article.regionCity === viewer.city
  ) {
    return 3;
  }

  if (
    article.regionCity === "" &&
    article.regionPrefecture !== "" &&
    viewer.prefecture !== "" &&
    article.regionPrefecture === viewer.prefecture
  ) {
    return 2;
  }

  if (
    article.regionCity === "" &&
    article.regionPrefecture === "" &&
    article.regionCountry !== "" &&
    viewer.country !== "" &&
    article.regionCountry.toUpperCase() ===
      viewer.country.toUpperCase()
  ) {
    return 1;
  }

  return 0;
}


async function handlePublicListPublishedColumnArticlesRequest(
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

    const query =
      request.query ||
      {};

    // 閲覧者の現在地(app.jsのresolveLocationHierarchyFromCoordinates()から
    // 渡される、既存のuserAreaName/getSuggestionAreaPriorityRank()とは
    // 完全に独立した値)。任意パラメータのため、無指定なら全記事が
    // matchLevel 0(公開日時順のみ)として扱われ、既存のPhase1と同じ
        // 「単純な新着順」に自然に縮退する。
    const viewer =
      {
        country:
          typeof query.viewerCountry === "string"
            ? query.viewerCountry.trim().toUpperCase()
            : "",

        prefecture:
          typeof query.viewerPrefecture === "string"
            ? query.viewerPrefecture.trim()
            : "",

        city:
          typeof query.viewerCity === "string"
            ? query.viewerCity.trim()
            : ""
      };

    // カテゴリーでの絞り込み(読み物一覧ページの「地域＋カテゴリーから探す」
    // 用、任意)。無指定なら絞り込まない。
    const categoryFilter =
      typeof query.category === "string"
        ? query.category.trim()
        : "";

    // column-list.html(専用一覧ページ)が地域欄へ明示的に入力して検索した
    // 場合だけtrueにするフラグ。TOP(loadDynamicColumnEntries())は現在地を
    // 「優先表示のヒント」として渡すだけで、これを付けない＝matchLevel0の
    // 記事も引き続き返す(現在地以外の記事を読めなくしてはいけないという
    // 指示のため)。一覧ページの明示検索だけは、実際に絞り込まれた手応えを
    // 返すため、matchLevel0を除外する。
    const strictRegionFilter =
      query.strictRegion === "1";

    let firestoreQuery =
      database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .where(
          "status",
          "==",
          COLUMN_STATUS_PUBLISHED
        );

    if (
      categoryFilter !== "" &&
      ALLOWED_COLUMN_CATEGORIES.includes(
        categoryFilter
      )
    ) {
      firestoreQuery =
        firestoreQuery.where(
          "category",
          "==",
          categoryFilter
        );
    }

    const articlesSnapshot =
      await firestoreQuery
        .limit(
          COLUMN_LIST_MAX_COUNT
        )
        .get();

    const articles =
      articlesSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            const publishedAtDate =
              toDateFromFirestoreValue(
                data.publishedAt
              );

            const articleRegion =
              {
                regionCountry:
                  typeof data.regionCountry === "string"
                    ? data.regionCountry
                    : "",

                regionPrefecture:
                  typeof data.regionPrefecture === "string"
                    ? data.regionPrefecture
                    : "",

                regionCity:
                  typeof data.regionCity === "string"
                    ? data.regionCity
                    : "",

                regionArea:
                  typeof data.regionArea === "string"
                    ? data.regionArea
                    : ""
              };

            return {
              slug:
                documentSnapshot.id,

              title:
                typeof data.title === "string"
                  ? data.title
                  : "",

              description:
                typeof data.description === "string"
                  ? data.description
                  : "",

              category:
                typeof data.category === "string"
                  ? data.category
                  : "",

              imageUrl:
                typeof data.imageUrl === "string"
                  ? data.imageUrl
                  : "",

              regionCountryLabel:
                getCountryDisplayLabel(
                  articleRegion.regionCountry
                ),

              regionPrefecture:
                articleRegion.regionPrefecture,

              regionCity:
                articleRegion.regionCity,

              regionArea:
                articleRegion.regionArea,

              matchLevel:
                computeColumnArticleMatchLevel(
                  articleRegion,
                  viewer
                ),

              publishedAtMillis:
                publishedAtDate
                  ? publishedAtDate.getTime()
                  : 0
            };
          }
        )
        .sort(
          function(firstArticle, secondArticle) {
            const matchLevelDifference =
              secondArticle.matchLevel -
              firstArticle.matchLevel;

            if (matchLevelDifference !== 0) {
              return matchLevelDifference;
            }

            return (
              secondArticle.publishedAtMillis -
              firstArticle.publishedAtMillis
            );
          }
        )
        .filter(
          function(article) {
            return (
              !strictRegionFilter ||
              article.matchLevel > 0
            );
          }
        )
        .map(
          function(article) {
            return {
              slug: article.slug,
              title: article.title,
              description: article.description,
              category: article.category,
              imageUrl: article.imageUrl,
              regionCountry: article.regionCountryLabel,
              regionPrefecture: article.regionPrefecture,
              regionCity: article.regionCity,
              regionArea: article.regionArea,
              matchLevel: article.matchLevel
            };
          }
        );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        COLUMN_LIST_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        COLUMN_LIST_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).json({
      success: true,
      articles: articles
    });
  } catch (error) {
    console.error(
      "読み物一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "読み物一覧を取得できませんでした。"
    });
  }
}


// sitemap.xmlを動的生成する(vercel.jsonのrewriteで/sitemap.xml自体を
// このFunctionへ向ける。静的ファイルsitemap.xmlは今回削除し、既存の
// TOP・既存コラム記事のURLをこの関数内に固定で含めることで、既存の
// SEO資産(2件)を維持しつつ、公開済みのFirestore記事を自動で追加する)。
async function handleRenderSitemapRequest(
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

    const urlEntries =
      [
        {
          loc: "https://machinau.jp/",
          lastmod: null
        },
        {
          loc: "https://machinau.jp/column/typhoon-okinawa-travel.html",
          lastmod: "2026-08-27"
        },
        {
          loc: "https://machinau.jp/column-list.html",
          lastmod: null
        }
      ];

    try {
      const articlesSnapshot =
        await database
          .collection(
            COLUMN_ARTICLES_COLLECTION
          )
          .where(
            "status",
            "==",
            COLUMN_STATUS_PUBLISHED
          )
          .limit(
            COLUMN_LIST_MAX_COUNT
          )
          .get();

      articlesSnapshot.docs.forEach(
        function(documentSnapshot) {
          const data =
            documentSnapshot.data() ||
            {};

          const updatedAtDate =
            toDateFromFirestoreValue(
              data.updatedAt
            ) ||
            toDateFromFirestoreValue(
              data.publishedAt
            );

          urlEntries.push(
            {
              loc:
                "https://machinau.jp/column/" +
                documentSnapshot.id +
                ".html",

              lastmod:
                formatDateForAttribute(
                  updatedAtDate
                ) || null
            }
          );
        }
      );
    } catch (articlesError) {
      console.error(
        "sitemap生成時の読み物一覧取得に失敗しました(TOP・既存コラムのみで生成を継続)：",
        articlesError
      );
    }

    const xmlBody =
      urlEntries
        .map(
          function(entry) {
            return (
              "  <url>\n" +
              "    <loc>" +
              escapeHtmlForRender(
                entry.loc
              ) +
              "</loc>\n" +
              (
                entry.lastmod
                  ? "    <lastmod>" +
                    entry.lastmod +
                    "</lastmod>\n"
                  : ""
              ) +
              "  </url>"
            );
          }
        )
        .join(
          "\n"
        );

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      xmlBody +
      "\n</urlset>\n";

    response.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        SITEMAP_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        SITEMAP_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).send(
      xml
    );
  } catch (error) {
    console.error(
      "sitemap生成エラー：",
      error
    );

    response.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );

    return response.status(500).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n'
    );
  }
}


function validateColumnArticleFields(
  requestBody
) {
  const title =
    String(
      requestBody.title || ""
    )
      .trim();

  if (title === "") {
    throw new Error(
      "タイトルを入力してください。"
    );
  }

  if (
    title.length >
    COLUMN_TITLE_MAX_LENGTH
  ) {
    throw new Error(
      "タイトルが長すぎます（" +
      COLUMN_TITLE_MAX_LENGTH +
      "文字以内）。"
    );
  }

  const category =
    String(
      requestBody.category || ""
    )
      .trim();

  if (
    !ALLOWED_COLUMN_CATEGORIES.includes(
      category
    )
  ) {
    throw new Error(
      "カテゴリーを選択してください。"
    );
  }

  const description =
    String(
      requestBody.description || ""
    )
      .trim();

  if (description === "") {
    throw new Error(
      "概要・説明文を入力してください。"
    );
  }

  if (
    description.length >
    COLUMN_DESCRIPTION_MAX_LENGTH
  ) {
    throw new Error(
      "概要・説明文が長すぎます（" +
      COLUMN_DESCRIPTION_MAX_LENGTH +
      "文字以内）。"
    );
  }

  const content =
    String(
      requestBody.content || ""
    )
      .trim();

  if (content === "") {
    throw new Error(
      "本文を入力してください。"
    );
  }

  if (
    content.length >
    COLUMN_CONTENT_MAX_LENGTH
  ) {
    throw new Error(
      "本文が長すぎます（" +
      COLUMN_CONTENT_MAX_LENGTH +
      "文字以内）。"
    );
  }

  // Ver1.8 Phase2(地域連動基盤)｜country/prefecture/city/areaはすべて任意。
  // 市区町村だけを必須単位にせず、記事ごとに粒度を選べるようにする
  // (「沖縄の雨」はcountry+prefectureのみ、「日本のお正月」はcountryのみ、
  // 等)。countryはISO 3166-1 alpha-2コードのみを正本として受け付ける
  // (validateColumnRegionCountryCode()、不正な値はエラーで弾く)。
  const regionCountry =
    validateColumnRegionCountryCode(
      requestBody.regionCountry
    );

  const regionPrefecture =
    String(
      requestBody.regionPrefecture || ""
    )
      .trim();

  if (
    regionPrefecture.length >
    COLUMN_REGION_FIELD_MAX_LENGTHS.prefecture
  ) {
    throw new Error(
      "都道府県・州等が長すぎます（" +
      COLUMN_REGION_FIELD_MAX_LENGTHS.prefecture +
      "文字以内）。"
    );
  }

  const regionCity =
    String(
      requestBody.regionCity || ""
    )
      .trim();

  if (
    regionCity.length >
    COLUMN_REGION_FIELD_MAX_LENGTHS.city
  ) {
    throw new Error(
      "市区町村が長すぎます（" +
      COLUMN_REGION_FIELD_MAX_LENGTHS.city +
      "文字以内）。"
    );
  }

  const regionArea =
    String(
      requestBody.regionArea || ""
    )
      .trim();

  if (
    regionArea.length >
    COLUMN_REGION_FIELD_MAX_LENGTHS.area
  ) {
    throw new Error(
      "エリア名が長すぎます（" +
      COLUMN_REGION_FIELD_MAX_LENGTHS.area +
      "文字以内）。"
    );
  }

  // city/areaを指定するなら、その上位階層(prefecture/city)も指定させる
  // (階層の飛び級を防ぎ、マッチング条件を単純に保つ)。country自体は
  // 必須にしない(将来country未設定の汎用記事もありうるため)。
  if (
    regionArea !== "" &&
    regionCity === ""
  ) {
    throw new Error(
      "エリアを指定する場合は市区町村も入力してください。"
    );
  }

  if (
    regionCity !== "" &&
    regionPrefecture === ""
  ) {
    throw new Error(
      "市区町村を指定する場合は都道府県・州等も入力してください。"
    );
  }

  if (
    regionPrefecture !== "" &&
    regionCountry === ""
  ) {
    throw new Error(
      "都道府県・州等を指定する場合は国も入力してください。"
    );
  }

  // メイン画像は既存Cloudinary(mode:"cloudinarySignature"、post.html・
  // admin-region-picks.htmlと共用)経由でアップロードされたURLのみを許可
  // する(新しい画像サービスは追加しない)。1枚のみ、任意。
  const imageUrl =
    String(
      requestBody.imageUrl || ""
    )
      .trim();

  if (
    imageUrl !== "" &&
    !/^https:\/\//.test(
      imageUrl
    )
  ) {
    throw new Error(
      "メイン画像のアドレスが正しくありません。"
    );
  }

  const imagePublicId =
    String(
      requestBody.imagePublicId || ""
    )
      .trim();

  const isPublished =
    requestBody.isPublished === true;

  return {
    title: title,
    category: category,
    description: description,
    content: content,
    regionCountry: regionCountry,
    regionPrefecture: regionPrefecture,
    regionCity: regionCity,
    regionArea: regionArea,
    imageUrl: imageUrl,
    imagePublicId: imagePublicId,
    isPublished: isPublished
  };
}


// 代表が任意でURL識別子を指定した場合はその値(重複チェック済み)を、
// 指定しなかった場合はFirestoreの自動採番IDを、そのままドキュメントID
// (=slug)として使う。作成後にslugを変更する機能は用意しない
// (一度公開したURLを変えない、という既存コラムと同じSEO安全設計)。
async function resolveColumnArticleSlugForCreate(
  database,
  requestBody
) {
  const customSlug =
    typeof requestBody.customSlug === "string"
      ? requestBody.customSlug.trim().toLowerCase()
      : "";

  if (customSlug === "") {
    return database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc()
      .id;
  }

  if (
    customSlug.length >
    COLUMN_CUSTOM_SLUG_MAX_LENGTH ||
    !COLUMN_CUSTOM_SLUG_PATTERN.test(
      customSlug
    )
  ) {
    throw new Error(
      "URL識別子は半角小文字英数字とハイフンのみ、" +
      COLUMN_CUSTOM_SLUG_MAX_LENGTH +
      "文字以内で入力してください。空欄なら自動生成されます。"
    );
  }

  if (
    LEGACY_STATIC_COLUMN_SLUGS.includes(
      customSlug
    )
  ) {
    throw new Error(
      "このURL識別子は既存の記事と重複するため使用できません。"
    );
  }

  const existingSnapshot =
    await database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc(
        customSlug
      )
      .get();

  if (
    existingSnapshot.exists
  ) {
    throw new Error(
      "このURL識別子は既に使用されています。別の識別子を指定してください。"
    );
  }

  return customSlug;
}


// マチナウ読み物の新規作成・編集(管理者のみ)。documentIdが指定されていれば
// 既存記事の更新(slugは不変のまま内容のみ更新)、無ければ新規作成。
// 新規作成時のみpublishedAtを設定し(下書き→公開へ変わったタイミングを
// 明確にするため)、既に一度公開済みの記事を編集してもpublishedAtは
// 上書きしない(公開日が変わらないようにする)。
async function handleAdminSaveColumnArticleRequest(
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

    let fields;

    try {
      fields =
        validateColumnArticleFields(
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
      getFirestore(
        app
      );

    const documentId =
      typeof requestBody.documentId === "string"
        ? requestBody.documentId.trim()
        : "";

    if (documentId !== "") {
      const documentReference =
        database
          .collection(
            COLUMN_ARTICLES_COLLECTION
          )
          .doc(
            documentId
          );

      const existingSnapshot =
        await documentReference.get();

      if (
        !existingSnapshot.exists
      ) {
        return response.status(404).json({
          success: false,
          message:
            "対象の記事が見つかりませんでした。"
        });
      }

      const existingData =
        existingSnapshot.data() ||
        {};

      const updateData = {
        title: fields.title,
        category: fields.category,
        description: fields.description,
        content: fields.content,
        regionCountry: fields.regionCountry,
        regionPrefecture: fields.regionPrefecture,
        regionCity: fields.regionCity,
        regionArea: fields.regionArea,
        imageUrl: fields.imageUrl,
        imagePublicId: fields.imagePublicId,

        status:
          fields.isPublished
            ? COLUMN_STATUS_PUBLISHED
            : COLUMN_STATUS_DRAFT,

        updatedAt:
          FieldValue.serverTimestamp()
      };

      if (
        fields.isPublished &&
        existingData.status !==
          COLUMN_STATUS_PUBLISHED
      ) {
        updateData.publishedAt =
          FieldValue.serverTimestamp();
      }

      await documentReference.update(
        updateData
      );

      return response.status(200).json({
        success: true,
        message:
          "マチナウ読み物を更新しました。",
        slug:
          documentId
      });
    }

    let newSlug;

    try {
      newSlug =
        await resolveColumnArticleSlugForCreate(
          database,
          requestBody
        );
    } catch (slugError) {
      return response.status(400).json({
        success: false,
        message:
          slugError.message
      });
    }

    const newDocumentData = {
      title: fields.title,
      category: fields.category,
      description: fields.description,
      content: fields.content,
      regionCountry: fields.regionCountry,
      regionPrefecture: fields.regionPrefecture,
      regionCity: fields.regionCity,
      regionArea: fields.regionArea,
      imageUrl: fields.imageUrl,
      imagePublicId: fields.imagePublicId,

      status:
        fields.isPublished
          ? COLUMN_STATUS_PUBLISHED
          : COLUMN_STATUS_DRAFT,

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),

      publishedAt:
        fields.isPublished
          ? FieldValue.serverTimestamp()
          : null
    };

    await database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc(
        newSlug
      )
      .set(
        newDocumentData
      );

    return response.status(200).json({
      success: true,
      message:
        "マチナウ読み物を保存しました。",
      slug:
        newSlug
    });
  } catch (error) {
    console.error(
      "マチナウ読み物の保存エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "保存に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}


async function handleAdminListColumnArticlesRequest(
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

    const database =
      getFirestore(
        app
      );

    const articlesSnapshot =
      await database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .limit(
          COLUMN_LIST_MAX_COUNT
        )
        .get();

    const articles =
      articlesSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            const updatedAtDate =
              toDateFromFirestoreValue(
                data.updatedAt
              );

            return {
              id:
                documentSnapshot.id,

              title:
                typeof data.title === "string"
                  ? data.title
                  : "",

              category:
                typeof data.category === "string"
                  ? data.category
                  : "",

              regionCountry:
                getCountryDisplayLabel(
                  typeof data.regionCountry === "string"
                    ? data.regionCountry
                    : ""
                ),

              regionPrefecture:
                typeof data.regionPrefecture === "string"
                  ? data.regionPrefecture
                  : "",

              regionCity:
                typeof data.regionCity === "string"
                  ? data.regionCity
                  : "",

              status:
                typeof data.status === "string"
                  ? data.status
                  : "",

              updatedAtMillis:
                updatedAtDate
                  ? updatedAtDate.getTime()
                  : 0,

              updatedAt:
                updatedAtDate
                  ? updatedAtDate.toISOString()
                  : null
            };
          }
        )
        .sort(
          function(firstArticle, secondArticle) {
            return (
              secondArticle.updatedAtMillis -
              firstArticle.updatedAtMillis
            );
          }
        )
        .map(
          function(article) {
            return {
              id: article.id,
              title: article.title,
              category: article.category,
              regionCountry: article.regionCountry,
              regionPrefecture: article.regionPrefecture,
              regionCity: article.regionCity,
              status: article.status,
              updatedAt: article.updatedAt
            };
          }
        );

    return response.status(200).json({
      success: true,
      articles: articles
    });
  } catch (error) {
    console.error(
      "マチナウ読み物一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "一覧を取得できませんでした。"
    });
  }
}


async function handleAdminGetColumnArticleRequest(
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

    const documentSnapshot =
      await database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .doc(
          documentId
        )
        .get();

    if (
      !documentSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の記事が見つかりませんでした。"
      });
    }

    const data =
      documentSnapshot.data() ||
      {};

    return response.status(200).json({
      success: true,
      article: {
        id: documentId,

        title:
          typeof data.title === "string"
            ? data.title
            : "",

        category:
          typeof data.category === "string"
            ? data.category
            : "",

        description:
          typeof data.description === "string"
            ? data.description
            : "",

        content:
          typeof data.content === "string"
            ? data.content
            : "",

        // 編集フォームの<select>へそのまま値をセットするため、表示用
        // ラベルへ変換せずISOコードのまま返す(admin-column.html側で
        // Intl.DisplayNamesを使い、コードから選択肢を組み立てる)。
        regionCountry:
          typeof data.regionCountry === "string"
            ? data.regionCountry
            : "",

        regionPrefecture:
          typeof data.regionPrefecture === "string"
            ? data.regionPrefecture
            : "",

        regionCity:
          typeof data.regionCity === "string"
            ? data.regionCity
            : "",

        regionArea:
          typeof data.regionArea === "string"
            ? data.regionArea
            : "",

        imageUrl:
          typeof data.imageUrl === "string"
            ? data.imageUrl
            : "",

        imagePublicId:
          typeof data.imagePublicId === "string"
            ? data.imagePublicId
            : "",

        status:
          typeof data.status === "string"
            ? data.status
            : ""
      }
    });
  } catch (error) {
    console.error(
      "マチナウ読み物取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "記事を取得できませんでした。"
    });
  }
}


// 公開/下書きへの切り替えだけを行う軽量モード(コメントのhide機能と同じ
// 考え方)。フォーム全体を再送信しなくても一覧画面から即座に切り替えられる。
async function handleAdminSetColumnArticleStatusRequest(
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

    const isPublished =
      requestBody.isPublished === true;

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
          COLUMN_ARTICLES_COLLECTION
        )
        .doc(
          documentId
        );

    const existingSnapshot =
      await documentReference.get();

    if (
      !existingSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の記事が見つかりませんでした。"
      });
    }

    const existingData =
      existingSnapshot.data() ||
      {};

    const updateData = {
      status:
        isPublished
          ? COLUMN_STATUS_PUBLISHED
          : COLUMN_STATUS_DRAFT,

      updatedAt:
        FieldValue.serverTimestamp()
    };

    if (
      isPublished &&
      existingData.status !==
        COLUMN_STATUS_PUBLISHED
    ) {
      updateData.publishedAt =
        FieldValue.serverTimestamp();
    }

    await documentReference.update(
      updateData
    );

    return response.status(200).json({
      success: true,
      message:
        isPublished
          ? "公開しました。"
          : "下書きに戻しました。"
    });
  } catch (error) {
    console.error(
      "マチナウ読み物のステータス変更エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "状態を変更できませんでした。"
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

    // マチナウ読み物投稿機能(Phase1)｜vercel.jsonのrewrite経由で
    // /column/*.html(実在する静的ファイルが無いものだけ)がここへ届く。
    if (
      request.query.mode === "renderColumn"
    ) {
      return handleRenderColumnArticleRequest(
        request,
        response
      );
    }

    // vercel.jsonのrewrite経由で/sitemap.xmlがここへ届く
    // (静的sitemap.xmlは削除済み)。
    if (
      request.query.mode === "renderSitemap"
    ) {
      return handleRenderSitemapRequest(
        request,
        response
      );
    }

    // TOPの「マチナウ読みもの」セクションが、既存の静的カードに追加して
    // Firestore由来の公開済み記事を動的に読み込むための一覧取得。
    if (
      request.query.mode === "publicListPublishedColumns"
    ) {
      return handlePublicListPublishedColumnArticlesRequest(
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

  // マチナウ読み物投稿機能(Phase1)｜管理者認証必須の4モード。
  // 一般公開経路(renderColumn等)には一切影響しない。
  if (
    requestBody.mode === "adminSaveColumnArticle"
  ) {
    return handleAdminSaveColumnArticleRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminListColumnArticles"
  ) {
    return handleAdminListColumnArticlesRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminGetColumnArticle"
  ) {
    return handleAdminGetColumnArticleRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminSetColumnArticleStatus"
  ) {
    return handleAdminSetColumnArticleStatusRequest(
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
