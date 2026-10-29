// ==========================================================================
// 今だけ投稿(imadake) STEP 3｜サーバー側データ基盤
// ==========================================================================
// お店・施設・主催者が「今、伝えたいこと」を旅行者へ届ける24時間限定の投稿。
// 既存の無料店舗掲載(submissions)・街の発見・掲示板とは完全に独立した
// collectionと処理で、既存の表示・集計には一切混ざらない。
//
// collection
//   imadakePosts/{postId}           今だけ投稿本体(postId = Firestore auto ID = GA4のpost_id)
//   imadakeStoreSlots/{storeId}     1店舗の「掲載中1件」「審査中1件」を保証する枠
//   imadakeRateLimits/{key}         店舗ごとの連続投稿制限(既存claimRateLimit()を利用)
//
// 認証は既存の店舗専用投稿URL＋token(validateStoreToken())をそのまま使う。
// 安全チェックは既存のOpenAI Moderation・安全重大語判定をそのまま使い、
// 判定できない場合は公開しない(fail closed)。
//
// まだUI・TOP表示・GA4送信・課金は作らない(このファイルはmoderate-submission.js
// のmodeから呼ばれるだけ)。このモジュールは先頭が"_"のapi/_lib配下のため
// Vercel Functionにはならない(Functions本数は増えない)。
// ==========================================================================

import {
  isPreviewCvBillingTrialEnabled
} from "./firebase-target.js";

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  createHash
} from "node:crypto";

import {
  encodeTownNowGeohash,
  computeTownNowDistanceKm,
  computeTownNowGeohashQueryRanges
} from "./town-now-threads.js";

// 2026-10-08 代表決定｜今だけ投稿の「近く」＝現在地から半径15km以内
// (15.000kmちょうどを含む)。既存の無料店舗カードの15km(app.js)や街の今
// スレッドの5kmとは別の、今だけ投稿専用の値として固定する。「範囲を広げる」
// はこの次に、現在地を含む都道府県・州等の全体(regionKey、例：JP-47)へ
// 直接広げる(市区町村の選択は挟まない)。
export const IMADAKE_NEARBY_RADIUS_KM =
  15;

// 浮動小数点誤差の吸収分(1マイクロメートル)。15.001km等の実質的な超過は対象外。
const IMADAKE_NEARBY_DISTANCE_EPSILON_KM =
  1e-9;

// 閲覧者の現在地から投稿までの距離(km)。街の今スレッドと同じ球面距離
// (地球半径6371km)の計算をそのまま使う(既存関数は変更しない)。
export function computeImadakeDistanceKm(
  viewerLatitude,
  viewerLongitude,
  postLatitude,
  postLongitude
) {
  return computeTownNowDistanceKm(
    viewerLatitude,
    viewerLongitude,
    postLatitude,
    postLongitude
  );
}

export function isWithinImadakeNearbyRadius(
  distanceKm
) {
  return (
    typeof distanceKm === "number" &&
    Number.isFinite(distanceKm) &&
    distanceKm <=
      IMADAKE_NEARBY_RADIUS_KM +
      IMADAKE_NEARBY_DISTANCE_EPSILON_KM
  );
}

export const IMADAKE_POSTS_COLLECTION =
  "imadakePosts";

export const IMADAKE_STORE_SLOTS_COLLECTION =
  "imadakeStoreSlots";

export const IMADAKE_RATE_LIMITS_COLLECTION =
  "imadakeRateLimits";

// 掲載時間は公開(publishedAt)から24時間。作成時刻からではない
// (審査待ちの時間で店舗の掲載時間を消費させないため)。
export const IMADAKE_PUBLISH_DURATION_MILLISECONDS =
  24 * 60 * 60 * 1000;

// 同じ店舗の連続投稿(作成リクエスト)の間隔。審査中・掲載中の制限とは別の、
// Moderation呼び出しの連打対策。
export const IMADAKE_CREATE_COOLDOWN_MILLISECONDS =
  20 * 1000;

export const IMADAKE_HEADLINE_MAX_LENGTH = 40;
export const IMADAKE_BODY_MAX_LENGTH = 3000;
export const IMADAKE_MAX_IMAGES = 10;
export const IMADAKE_URL_MAX_LENGTH = 500;
export const IMADAKE_SHORT_TEXT_MAX_LENGTH = 60;
export const IMADAKE_PLACE_NAME_MAX_LENGTH = 40;
export const IMADAKE_STOCK_QUANTITY_MAX = 9999;

// 既存Moderationは1リクエストに画像5枚まで(MAX_MODERATION_IMAGE_COUNT)。
// 今だけ投稿は最大10枚なので、5枚ずつに分けて全画像を確認する。
const IMADAKE_MODERATION_IMAGES_PER_REQUEST = 5;

// 投稿の状態(固定英語コード)。
//   pending   安全重大語等で人間確認待ち(公開しない)
//   published 公開中(expiresAtまで)
//   ended     店舗が24時間前に自主終了
//   expired   24時間経過(次の投稿時等に記録される。表示はexpiresAtで判定)
//   rejected  Moderationで危険判定(公開しない)
//   removed   運営による削除(今回は作成経路なし)
//   withdrawn 店舗が審査中の投稿を取り下げ
export const IMADAKE_STATUSES = [
  "pending",
  "published",
  "ended",
  "expired",
  "rejected",
  "removed",
  "withdrawn"
];

export const IMADAKE_CATEGORY_CODES = [
  "restaurant",
  "food_shop",
  "retail",
  "event",
  "other"
];

export const IMADAKE_ACTION_TARGET_KEYS = [
  "phone",
  "reservationUrl",
  "websiteUrl",
  "socialUrl",
  "orderUrl"
];

// 投稿時点の「今の状態」。typeごとに許可するstatusを固定コードで持つ
// (将来の多言語表示・リアルタイム更新に備え、自由文字列は保存しない)。
// stockだけは任意で残り個数(quantity)を数値で持てる。
export const IMADAKE_LIVE_STATE_STATUSES_BY_TYPE = {
  stock: ["available", "few", "sold_out"],
  seats: ["available", "few", "full"],
  tickets: ["available", "few", "sold_out"]
};

// 業種別の任意項目(すべて任意)。ここに無いkeyは保存しない。
const IMADAKE_CATEGORY_FIELD_SPECS = {
  restaurant: {
    takeout: "boolean",
    sameDayReservation: "boolean"
  },
  food_shop: {
    takeout: "boolean",
    holdAvailable: "boolean"
  },
  retail: {
    newArrival: "boolean"
  },
  event: {
    startTime: "time",
    endTime: "time",
    venue: "shortText",
    feeText: "shortText"
  },
  other: {}
};

const IMADAKE_PAYMENT_METHODS = ["cash", "card", "qr"];
const IMADAKE_SOURCE_LANGUAGES = ["ja", "en"];

// 画像は既存のCloudinary署名付きアップロード(cloud name: cdhyctnp、
// folder: machinau_submissions)で上げたものだけを受け付ける。
const IMADAKE_IMAGE_URL_PREFIX =
  "https://res.cloudinary.com/cdhyctnp/image/upload/";
const IMADAKE_IMAGE_FOLDER_SEGMENT =
  "/machinau_submissions/";

// 「範囲を広げる」(都道府県・州等の全体)用の安定した地域キー。表示名ではなく
// ISO 3166-2の行政区画コードを使う(例：沖縄県 → "JP-47")。現時点では日本の
// 都道府県だけを対応し、対応していない国・名称は""(地域全体の一覧には未対応)
// にする。将来は国ごとの表を追加するだけで世界へ広げられる。
// 日本語名に加え、Google Geocoderが英語で返す場合の名称も受け付ける
// (大文字小文字・長音記号・"Prefecture"等の違いは正規化して比較)。
const JP_PREFECTURE_ISO_CODES = [
  ["JP-01", "北海道", "hokkaido"], ["JP-02", "青森県", "aomori"], ["JP-03", "岩手県", "iwate"],
  ["JP-04", "宮城県", "miyagi"], ["JP-05", "秋田県", "akita"], ["JP-06", "山形県", "yamagata"],
  ["JP-07", "福島県", "fukushima"], ["JP-08", "茨城県", "ibaraki"], ["JP-09", "栃木県", "tochigi"],
  ["JP-10", "群馬県", "gunma"], ["JP-11", "埼玉県", "saitama"], ["JP-12", "千葉県", "chiba"],
  ["JP-13", "東京都", "tokyo"], ["JP-14", "神奈川県", "kanagawa"], ["JP-15", "新潟県", "niigata"],
  ["JP-16", "富山県", "toyama"], ["JP-17", "石川県", "ishikawa"], ["JP-18", "福井県", "fukui"],
  ["JP-19", "山梨県", "yamanashi"], ["JP-20", "長野県", "nagano"], ["JP-21", "岐阜県", "gifu"],
  ["JP-22", "静岡県", "shizuoka"], ["JP-23", "愛知県", "aichi"], ["JP-24", "三重県", "mie"],
  ["JP-25", "滋賀県", "shiga"], ["JP-26", "京都府", "kyoto"], ["JP-27", "大阪府", "osaka"],
  ["JP-28", "兵庫県", "hyogo"], ["JP-29", "奈良県", "nara"], ["JP-30", "和歌山県", "wakayama"],
  ["JP-31", "鳥取県", "tottori"], ["JP-32", "島根県", "shimane"], ["JP-33", "岡山県", "okayama"],
  ["JP-34", "広島県", "hiroshima"], ["JP-35", "山口県", "yamaguchi"], ["JP-36", "徳島県", "tokushima"],
  ["JP-37", "香川県", "kagawa"], ["JP-38", "愛媛県", "ehime"], ["JP-39", "高知県", "kochi"],
  ["JP-40", "福岡県", "fukuoka"], ["JP-41", "佐賀県", "saga"], ["JP-42", "長崎県", "nagasaki"],
  ["JP-43", "熊本県", "kumamoto"], ["JP-44", "大分県", "oita"], ["JP-45", "宮崎県", "miyazaki"],
  ["JP-46", "鹿児島県", "kagoshima"], ["JP-47", "沖縄県", "okinawa"]
];

function normalizeRegionNameForMatching(
  value
) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*(prefecture|metropolis|-ken|-fu|-to)$/u, "")
    .replace(/(ou|oo)/g, "o")
    .trim();
}

export function buildImadakeRegionKey(
  countryCode,
  prefecture
) {
  if (countryCode !== "JP") {
    return "";
  }

  const raw =
    String(prefecture || "").trim();

  if (raw === "") {
    return "";
  }

  const normalized =
    normalizeRegionNameForMatching(raw);

  const match =
    JP_PREFECTURE_ISO_CODES.find(
      function(entry) {
        return (
          entry[1] === raw ||
          normalizeRegionNameForMatching(entry[2]) === normalized
        );
      }
    );

  return match ? match[0] : "";
}

// ---------------------------------------------------------------------------
// 入力検証(ブラウザから来た値は信用しない)
// ---------------------------------------------------------------------------

function readTrimmedString(
  value
) {
  return typeof value === "string"
    ? value.replace(/\r\n?/g, "\n").trim()
    : "";
}

// 制御文字(改行・タブ以外)を含む文字列は受け付けない。
function hasDisallowedControlCharacters(
  text
) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
}

function countCharacters(
  text
) {
  return Array.from(text).length;
}

function readShortText(
  value,
  maxLength
) {
  const text =
    readTrimmedString(value);

  if (
    text !== "" &&
    (
      countCharacters(text) > maxLength ||
      hasDisallowedControlCharacters(text) ||
      text.includes("\n")
    )
  ) {
    return null;
  }

  return text;
}

// http/httpsだけを許可し、javascript:・data:等、認証情報付きURL、
// ホスト名の無いURLは拒否する。
export function validateImadakeUrl(
  value
) {
  const text =
    readTrimmedString(value);

  if (text === "") {
    return "";
  }

  if (
    text.length > IMADAKE_URL_MAX_LENGTH ||
    /\s/.test(text)
  ) {
    return null;
  }

  let parsed;

  try {
    parsed = new URL(text);
  } catch (error) {
    return null;
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !parsed.hostname.includes(".")
  ) {
    return null;
  }

  return text;
}

// 電話番号：数字・+・-・括弧・空白のみ、数字は9〜15桁。
export function validateImadakePhone(
  value
) {
  const text =
    readTrimmedString(value);

  if (text === "") {
    return "";
  }

  if (
    text.length > 20 ||
    !/^\+?[0-9()\-\s]+$/.test(text)
  ) {
    return null;
  }

  const digitCount =
    text.replace(/[^0-9]/g, "").length;

  if (digitCount < 9 || digitCount > 15) {
    return null;
  }

  return text;
}

function readCoordinate(
  value,
  min,
  max
) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;

  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    return null;
  }

  return number;
}

function readTimeOfDay(
  value
) {
  const text =
    readTrimmedString(value);

  if (text === "") {
    return "";
  }

  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(text)
    ? text
    : null;
}

function validateCategoryFields(
  categoryCode,
  raw
) {
  const specs =
    IMADAKE_CATEGORY_FIELD_SPECS[categoryCode] || {};

  const result = {};

  if (raw === undefined || raw === null) {
    return result;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  for (const key of Object.keys(raw)) {
    const kind = specs[key];

    if (!kind) {
      // この業種で使わない項目は保存しない(エラーにはしない)。
      continue;
    }

    const value = raw[key];

    if (kind === "boolean") {
      if (typeof value !== "boolean") {
        return null;
      }

      result[key] = value;
    } else if (kind === "time") {
      const time = readTimeOfDay(value);

      if (time === null) {
        return null;
      }

      if (time !== "") {
        result[key] = time;
      }
    } else if (kind === "shortText") {
      const text = readShortText(value, IMADAKE_SHORT_TEXT_MAX_LENGTH);

      if (text === null) {
        return null;
      }

      if (text !== "") {
        result[key] = text;
      }
    }
  }

  return result;
}

function validateLiveState(
  raw
) {
  if (raw === undefined || raw === null) {
    return { value: null };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "liveState" };
  }

  const type =
    readTrimmedString(raw.type);

  const allowedStatuses =
    IMADAKE_LIVE_STATE_STATUSES_BY_TYPE[type];

  if (!allowedStatuses) {
    return { error: "liveState.type" };
  }

  const status =
    readTrimmedString(raw.status);

  if (!allowedStatuses.includes(status)) {
    return { error: "liveState.status" };
  }

  const liveState = {
    type: type,
    status: status
  };

  if (
    raw.quantity !== undefined &&
    raw.quantity !== null &&
    raw.quantity !== ""
  ) {
    if (
      type !== "stock" ||
      typeof raw.quantity !== "number" ||
      !Number.isInteger(raw.quantity) ||
      raw.quantity < 0 ||
      raw.quantity > IMADAKE_STOCK_QUANTITY_MAX
    ) {
      return { error: "liveState.quantity" };
    }

    liveState.quantity = raw.quantity;
  }

  return { value: liveState };
}

function validateImages(
  rawUrls,
  rawPublicIds
) {
  if (rawUrls === undefined || rawUrls === null) {
    return { imageUrls: [], imagePublicIds: [] };
  }

  if (!Array.isArray(rawUrls)) {
    return { error: "imageUrls" };
  }

  if (rawUrls.length > IMADAKE_MAX_IMAGES) {
    return { error: "imageUrls.count" };
  }

  const imageUrls = [];

  for (const value of rawUrls) {
    const url =
      readTrimmedString(value);

    if (
      url === "" ||
      url.length > IMADAKE_URL_MAX_LENGTH ||
      /\s/.test(url) ||
      !url.startsWith(IMADAKE_IMAGE_URL_PREFIX) ||
      !url.includes(IMADAKE_IMAGE_FOLDER_SEGMENT)
    ) {
      return { error: "imageUrls.url" };
    }

    imageUrls.push(url);
  }

  let imagePublicIds = [];

  if (rawPublicIds !== undefined && rawPublicIds !== null) {
    if (
      !Array.isArray(rawPublicIds) ||
      rawPublicIds.length > imageUrls.length
    ) {
      return { error: "imagePublicIds" };
    }

    for (const value of rawPublicIds) {
      const publicId =
        readTrimmedString(value);

      if (
        publicId === "" ||
        publicId.length > 200 ||
        !/^machinau_submissions\/[A-Za-z0-9_\-/]+$/.test(publicId)
      ) {
        return { error: "imagePublicIds" };
      }

      imagePublicIds.push(publicId);
    }
  }

  return { imageUrls: imageUrls, imagePublicIds: imagePublicIds };
}

// 店舗が入力する項目だけを検証して返す。status・publishedAt・expiresAt・
// storeNameSnapshot等はここでは一切受け取らない(サーバー側で決める)。
// 戻り値：{ ok: true, fields } または { ok: false, field }
export function validateImadakePostInput(
  requestBody
) {
  const body =
    requestBody && typeof requestBody === "object"
      ? requestBody
      : {};

  const fail =
    function(field) {
      return { ok: false, field: field };
    };

  const categoryCode =
    readTrimmedString(body.categoryCode);

  if (!IMADAKE_CATEGORY_CODES.includes(categoryCode)) {
    return fail("categoryCode");
  }

  const headline =
    readTrimmedString(body.headline);

  if (
    headline === "" ||
    countCharacters(headline) > IMADAKE_HEADLINE_MAX_LENGTH ||
    headline.includes("\n") ||
    hasDisallowedControlCharacters(headline)
  ) {
    return fail("headline");
  }

  const bodyText =
    readTrimmedString(body.body);

  if (
    countCharacters(bodyText) > IMADAKE_BODY_MAX_LENGTH ||
    hasDisallowedControlCharacters(bodyText)
  ) {
    return fail("body");
  }

  // STEP 4A(Option A)｜所在地(緯度経度・国・都道府県・市区町村・住所)は
  // ブラウザから受け取らない。送られてきても無視し、作成時にサーバーが
  // storeAccounts/{storeId}の正式所在地(運営が登録)を使う。

  const rawTargets =
    body.actionTargets === undefined || body.actionTargets === null
      ? {}
      : body.actionTargets;

  if (typeof rawTargets !== "object" || Array.isArray(rawTargets)) {
    return fail("actionTargets");
  }

  const actionTargets = {};

  for (const key of Object.keys(rawTargets)) {
    if (!IMADAKE_ACTION_TARGET_KEYS.includes(key)) {
      return fail("actionTargets." + key);
    }

    const value =
      key === "phone"
        ? validateImadakePhone(rawTargets[key])
        : validateImadakeUrl(rawTargets[key]);

    if (value === null) {
      return fail("actionTargets." + key);
    }

    if (value !== "") {
      actionTargets[key] = value;
    }
  }

  const categoryFields =
    validateCategoryFields(categoryCode, body.categoryFields);

  if (categoryFields === null) {
    return fail("categoryFields");
  }

  const liveStateResult =
    validateLiveState(body.liveState);

  if (liveStateResult.error) {
    return fail(liveStateResult.error);
  }

  const images =
    validateImages(body.imageUrls, body.imagePublicIds);

  if (images.error) {
    return fail(images.error);
  }

  const availableUntil =
    readTimeOfDay(body.availableUntil);

  if (availableUntil === null) {
    return fail("availableUntil");
  }

  const priceText =
    readShortText(body.priceText, IMADAKE_SHORT_TEXT_MAX_LENGTH);

  if (priceText === null) {
    return fail("priceText");
  }

  let paymentMethods = [];

  if (body.paymentMethods !== undefined && body.paymentMethods !== null) {
    if (
      !Array.isArray(body.paymentMethods) ||
      body.paymentMethods.some(
        function(value) {
          return !IMADAKE_PAYMENT_METHODS.includes(value);
        }
      )
    ) {
      return fail("paymentMethods");
    }

    paymentMethods =
      Array.from(new Set(body.paymentMethods));
  }

  const sourceLanguage =
    readTrimmedString(body.sourceLanguage) || "ja";

  if (!IMADAKE_SOURCE_LANGUAGES.includes(sourceLanguage)) {
    return fail("sourceLanguage");
  }

  return {
    ok: true,
    fields: {
      categoryCode: categoryCode,
      headline: headline,
      body: bodyText,
      actionTargets: actionTargets,
      categoryFields: categoryFields,
      liveState: liveStateResult.value,
      imageUrls: images.imageUrls,
      imagePublicIds: images.imagePublicIds,
      availableUntil: availableUntil,
      priceText: priceText,
      paymentMethods: paymentMethods,
      sourceLanguage: sourceLanguage
    }
  };
}

// ---------------------------------------------------------------------------
// 安全チェック(既存Moderation・安全重大語判定をそのまま使う)
// ---------------------------------------------------------------------------

// 今だけ投稿専用の追加の重大語(2026-10-15)。共有のSAFETY_CRITICAL_KEYWORDS・
// matchesSafetyCriticalKeywords(店舗投稿・掲示板・スレッド・広告でも使用)は変更せず、
// 今だけ投稿だけで追加判定する。目的は危険情報の削除ではなく、未確認の重大情報を
// 自動公開せず運営確認待ちにすること(過検知は許容、既存方針と同じ)。
// ・日本語：既存の一覧で漏れていた表現(「通行止」は「全面通行止」「通行止め」も含む)
// ・英語：大文字小文字を区別せず、語の区切りで判定(複数形・活用形を含む)。一般的な語
//   (cancel・suspend・crash・warning等)は、交通・気象など重大情報の文脈に限る
// ・投稿の言語(sourceLanguage)に関係なく、日本語・英語の両方を必ず確認する(混在文も対象)
// ・対象は投稿者が入力する見出し・本文・価格・会場・料金だけ(店舗名は対象にしない：
//   「Fire Grill」のような店名で毎回確認待ちにならないように)。全角英数字・半角カナは
//   NFKC正規化してから判定する
export const IMADAKE_EXTRA_SAFETY_KEYWORDS_JA = [
  "洪水", "噴火", "運転見合わせ", "交通規制", "爆発", "救助", "大雨", "竜巻", "落雷",
  "ツナミ", "つなみ", "通行止", "火事", "災害", "高潮", "暴風", "冠水", "土石流",
  "がけ崩れ", "崖崩れ", "地すべり", "地滑り"
];

const IMADAKE_TRANSPORT_WORDS =
  "(?:flights?|trains?|bus(?:es)?|ferr(?:y|ies)|ships?|boats?|rail(?:way)?s?|services?|lines?|monorail|yui\\s*rail)";

const IMADAKE_DISRUPTION_WORDS =
  "(?:cancel(?:l)?ed|cancel(?:l)?ations?|suspend(?:ed)?|suspensions?|delay(?:ed|s)?|halted|stopped|not\\s+running)";

export const IMADAKE_EXTRA_SAFETY_PATTERNS_EN = [
  /\btyphoons?\b/i,
  /\b(?:storms?|stormy|thunderstorms?|rainstorms?)\b/i,
  /\btsunamis?\b/i,
  /\b(?:earthquakes?|quakes?|tremors?|aftershocks?)\b/i,
  /\bflood(?:s|ed|ing)?\b/i,
  /\b(?:land|mud|rock)slides?\b/i,
  /\b(?:wild)?fires?\b/i,
  /\bexplo(?:sion|sions|ded|de|des)\b/i,
  /\baccidents?\b/i,
  /\b(?:car|traffic|road|bus|plane|train)\s+crash(?:es)?\b/i,
  /\broads?\s+(?:closures?|closed|blocked)\b/i,
  /\b(?:closed|blocked)\s+roads?\b/i,
  /\broad\s*blocks?\b/i,
  /\bevacuat\w*/i,
  /\bemergenc(?:y|ies)\b/i,
  /\b(?:power|water|electricity|gas)\s+(?:outages?|cuts?|failures?|shortages?)\b/i,
  /\boutages?\b/i,
  /\bblackouts?\b/i,
  /\bno\s+(?:running\s+)?water\b/i,
  /\bmissing\s+(?:persons?|people|child|children|hikers?|swimmers?|divers?)\b/i,
  /\brescu(?:e|ed|es|ing)\b/i,
  new RegExp("\\b" + IMADAKE_TRANSPORT_WORDS + "\\b[^.!?\\n]{0,40}?\\b" + IMADAKE_DISRUPTION_WORDS + "\\b", "i"),
  new RegExp("\\b" + IMADAKE_DISRUPTION_WORDS + "\\b[^.!?\\n]{0,40}?\\b" + IMADAKE_TRANSPORT_WORDS + "\\b", "i"),
  /\b(?:weather|storm|typhoon|tsunami|flood|heat|rain|wind|evacuation|emergency)\s+(?:warnings?|alerts?|advisor(?:y|ies))\b/i,
  /\bdisasters?\b/i,
  /\b(?:volcan\w*|eruptions?|erupted)\b/i,
  /\bheavy\s+rain\b/i,
  /\btornado(?:e)?s?\b/i,
  /\blightning\b/i,
  /\bhigh\s+waves?\b/i,
  /\bstorm\s+surges?\b/i
];

// 見出し・本文(価格・会場・料金を含む)に、今だけ投稿専用の追加の重大語があるか。
export function matchesImadakeExtraSafetyKeywords(
  moderationSubject
) {
  const text =
    [
      moderationSubject && moderationSubject.title,
      moderationSubject && moderationSubject.content
    ]
      .map(function(value) {
        return String(value || "");
      })
      .join("\n")
      .normalize("NFKC");

  return (
    IMADAKE_EXTRA_SAFETY_KEYWORDS_JA.some(function(keyword) {
      return text.indexOf(keyword) !== -1;
    }) ||
    IMADAKE_EXTRA_SAFETY_PATTERNS_EN.some(function(pattern) {
      return pattern.test(text);
    })
  );
}

// 戻り値："published" / "pending" / "rejected"。Moderationが判定できない場合は
// 例外を投げる(呼び出し元で投稿失敗として返し、公開も保存もしない＝fail closed)。
async function decideImadakeSafety(
  fields,
  storeName,
  deps
) {
  const moderationText =
    [
      fields.body,
      fields.priceText,
      fields.categoryFields.venue || "",
      fields.categoryFields.feeText || ""
    ]
      .filter(
        function(value) {
          return value !== "";
        }
      )
      .join("\n");

  const moderationSubject = {
    shopName: storeName,
    title: fields.headline,
    content: moderationText
  };

  const imageBatches = [];

  for (
    let index = 0;
    index < fields.imageUrls.length;
    index += IMADAKE_MODERATION_IMAGES_PER_REQUEST
  ) {
    imageBatches.push(
      fields.imageUrls.slice(
        index,
        index + IMADAKE_MODERATION_IMAGES_PER_REQUEST
      )
    );
  }

  // 1回目：文章＋画像1〜5枚、2回目以降：残りの画像だけ。
  const requests = [
    deps.buildModerationInput({
      ...moderationSubject,
      imageUrls: imageBatches[0] || []
    })
  ];

  for (const batch of imageBatches.slice(1)) {
    requests.push(
      deps.buildModerationInput({
        imageUrls: batch
      })
    );
  }

  const allResults = [];

  for (const inputItems of requests) {
    const results =
      await deps.callOpenAiModeration(inputItems);

    if (!Array.isArray(results) || results.length === 0) {
      throw new Error("moderation response was empty");
    }

    allResults.push(...results);
  }

  const allSafe =
    allResults.every(
      function(result) {
        return result && result.flagged === false;
      }
    );

  if (!allSafe) {
    return {
      decision: "rejected",
      moderationStatus: "FLAGGED",
      reason: deps.buildReviewReason(allResults)
    };
  }

  // 既存の共有判定(日本語16語、店舗名も対象)はそのまま。加えて今だけ投稿専用の
  // 追加判定(日本語の補強・英語、見出しと本文だけ)。どちらかに該当すれば運営確認待ち。
  if (
    deps.matchesSafetyCriticalKeywords(moderationSubject) ||
    matchesImadakeExtraSafetyKeywords(moderationSubject)
  ) {
    return {
      decision: "pending",
      moderationStatus: "REVIEW",
      reason:
        "安全・災害・交通に関する情報の可能性があるため、内容を人間が確認します。"
    };
  }

  return {
    decision: "published",
    moderationStatus: "SAFE",
    reason: ""
  };
}

// ---------------------------------------------------------------------------
// 1店舗1件の枠(imadakeStoreSlots/{storeId})
// ---------------------------------------------------------------------------

function toMillis(
  value
) {
  return value && typeof value.toMillis === "function"
    ? value.toMillis()
    : null;
}

// --------------------------------------------------------------------------
// 正式店舗アカウント接続｜今だけ投稿の店舗本人の確認(作成・状態取得・終了の3経路で共通)
// --------------------------------------------------------------------------
// 方式A(旧方式の店舗専用URL＋token)：STEP 43-B(代表決定 2026-10-22)で撤去した。tokenが送られてきた時は
//   常に 410 で断る(方式Bへは切り替えない＝取り違え防止。token の照合はしない)。
// 方式B(セルフ登録した正式店舗)：tokenが無い時だけ、AuthorizationヘッダーのFirebase
//   IDトークンを既存のresolveStoreUserActor()(passwordログインのみ)で確かめ、
//   メール確認済みであること、既存のcheckStoreProfileEditor()でstoreMembersの有効な
//   ownerかつstoreAccountsが有効な正式店舗(registrationStatus:"active"・enabled:true)
//   であることを確かめる。storeIdだけでは操作できない。他店舗・審査待ち・停止中・
//   メンバーでない場合は、店舗の有無が分からない同じ403にする。
// 戻り値：{ valid: true, storeId, storeName, method } または { valid: false, status, message }
export async function verifyImadakeStoreActor(
  request,
  requestBody,
  database,
  deps
) {
  const token =
    typeof requestBody.token === "string"
      ? requestBody.token.trim()
      : "";

  if (token !== "") {
    return {
      valid: false,
      status: 410,
      reason: "legacy_feature_removed",
      message: "旧方式の店舗専用URLは終了しました。店舗アカウントにログインしてご利用ください。"
    };
  }

  const storeId =
    typeof requestBody.storeId === "string"
      ? requestBody.storeId.trim()
      : "";

  const forbidden = {
    valid: false,
    status: 403,
    message: "この店舗で今だけ投稿を操作する権限がありません。"
  };

  if (
    storeId === "" ||
    storeId.length > 128 ||
    storeId.includes("/") ||
    typeof deps.resolveStoreUserActor !== "function" ||
    typeof deps.checkStoreProfileEditor !== "function"
  ) {
    return forbidden;
  }

  const actorResult =
    await deps.resolveStoreUserActor(request);

  if (!actorResult || !actorResult.ok) {
    return actorResult && actorResult.status === 401
      ? {
          valid: false,
          status: 401,
          message: "店舗アカウントでログインしてください。"
        }
      : forbidden;
  }

  if (actorResult.actor.emailVerified !== true) {
    return {
      valid: false,
      status: 403,
      message: "メールアドレスの確認が終わっていません。"
    };
  }

  const editorCheck =
    await deps.checkStoreProfileEditor(
      database,
      storeId,
      actorResult.actor.uid
    );

  if (!editorCheck || editorCheck.ok !== true) {
    return forbidden;
  }

  const accountSnapshot =
    await database
      .collection("storeAccounts")
      .doc(storeId)
      .get();

  const accountData =
    accountSnapshot.exists
      ? accountSnapshot.data() || {}
      : {};

  const storeName =
    typeof accountData.storeName === "string"
      ? accountData.storeName.trim()
      : "";

  if (storeName === "") {
    return forbidden;
  }

  return {
    valid: true,
    storeId: storeId,
    storeName: storeName,
    method: "storeUser"
  };
}

// STEP 3｜英語カード翻訳(imadake-translation.js)でも同じ判定を使うためexportする(中身は変えない)。
export function isPublishedAndUnexpired(
  post,
  nowMillis
) {
  const expiresAtMillis =
    toMillis(post.expiresAt);

  return (
    post.status === "published" &&
    expiresAtMillis !== null &&
    expiresAtMillis > nowMillis
  );
}

// トランザクション内で、店舗の枠と、枠が指す投稿の現在状態を読む。
// 期限切れの掲載中投稿があれば"expired"へ記録し、枠を空ける(遅延失効)。
async function readStoreSlotState(
  transaction,
  database,
  storeId,
  nowMillis
) {
  const slotRef =
    database
      .collection(IMADAKE_STORE_SLOTS_COLLECTION)
      .doc(storeId);

  const slotSnapshot =
    await transaction.get(slotRef);

  const slot =
    slotSnapshot.exists
      ? slotSnapshot.data() || {}
      : {};

  let activePostRef = null;
  let activePost = null;
  let pendingPostRef = null;
  let pendingPost = null;

  if (typeof slot.activePostId === "string" && slot.activePostId !== "") {
    activePostRef =
      database
        .collection(IMADAKE_POSTS_COLLECTION)
        .doc(slot.activePostId);

    const snapshot =
      await transaction.get(activePostRef);

    activePost =
      snapshot.exists ? snapshot.data() || {} : null;
  }

  if (typeof slot.pendingPostId === "string" && slot.pendingPostId !== "") {
    pendingPostRef =
      database
        .collection(IMADAKE_POSTS_COLLECTION)
        .doc(slot.pendingPostId);

    const snapshot =
      await transaction.get(pendingPostRef);

    pendingPost =
      snapshot.exists ? snapshot.data() || {} : null;
  }

  const hasActive =
    activePost !== null &&
    isPublishedAndUnexpired(activePost, nowMillis);

  const activeIsStaleExpired =
    activePost !== null &&
    activePost.status === "published" &&
    !hasActive;

  const hasPending =
    pendingPost !== null &&
    pendingPost.status === "pending";

  return {
    slotRef: slotRef,
    slot: slot,
    activePostRef: activePostRef,
    activePost: activePost,
    hasActive: hasActive,
    activeIsStaleExpired: activeIsStaleExpired,
    pendingPostRef: pendingPostRef,
    hasPending: hasPending
  };
}

function buildSlotLocationFields(
  post
) {
  return {
    activeExpiresAt: post.expiresAt,
    activeRegionKey: post.regionKey,
    activeGeohash: post.geohash,
    activeLatitude: post.latitude,
    activeLongitude: post.longitude,
    activeCountryCode: post.countryCode
  };
}

const EMPTY_ACTIVE_SLOT_FIELDS = {
  activePostId: "",
  activeExpiresAt: null,
  activeRegionKey: "",
  activeGeohash: "",
  activeLatitude: null,
  activeLongitude: null,
  activeCountryCode: ""
};

// ---------------------------------------------------------------------------
// 収益化 STEP 3｜課金対象(cvBillingEnabled)は投稿作成時にサーバーだけが決め、その投稿では
// 以後変えない(投稿者・画面からは指定できない。公開・終了・審査の更新でも書き換えない)。
// 正式な課金開始前のため、現在はすべての新規投稿をfalseにする。課金開始後も、テスト事業者
// (storeAccounts.isTestAccount: true)の投稿はfalse。既存投稿は項目なし＝課金対象外。
// ---------------------------------------------------------------------------
export const IMADAKE_CV_BILLING_STARTED =
  false;

// STEP 34-A｜Preview専用の課金対象判定：対象ブランチのPreviewで、サーバーのFirebase接続先が
// Preview専用プロジェクト(machinau-preview)だと確認できた時だけ、課金開始前でも新規投稿を課金対象にする
// (試験用)。Productionでは常に従来どおり IMADAKE_CV_BILLING_STARTED だけで決まる。
// この判定は投稿の課金対象の印だけに使い、月末締め・月次請求・Stripeの実行には使わない。
// テスト事業者(isTestAccount)は、どちらの場合も課金対象にしない。
export async function decideImadakeCvBillingForNewPost(
  database,
  storeId,
  env
) {
  const billingActive =
    IMADAKE_CV_BILLING_STARTED ||
    isPreviewCvBillingTrialEnabled(env || process.env);

  if (!billingActive) {
    return false;
  }

  const snapshot =
    await database
      .collection("storeAccounts")
      .doc(storeId)
      .get();

  const account =
    snapshot.exists
      ? snapshot.data() || {}
      : null;

  return !!account && account.isTestAccount !== true;
}

// STEP 35-A｜カード登録必須の理由コード → サーバーの応答の文(画面は理由コードから日英の文を出す)。
function buildImadakeCardRequirementMessage(reason) {
  if (reason === "card_expired") {
    return "登録しているクレジットカードの有効期限が切れています。店舗アカウント画面でカードを変更してください。";
  }

  if (reason === "card_billing_unavailable") {
    return "ただいまカードの登録状態を確認できません。少し時間をおいてから、もう一度お試しください。";
  }

  return "今だけ投稿の利用には、クレジットカードの登録が必要です。店舗アカウント画面でカードを登録してください。";
}

// ---------------------------------------------------------------------------
// mode: imadakePostCreate (POST)
// ---------------------------------------------------------------------------
export async function handleImadakePostCreate(
  request,
  response,
  deps
) {
  try {
    const requestBody =
      deps.readRequestBody(request);

    const validation =
      validateImadakePostInput(requestBody);

    if (!validation.ok) {
      return response.status(400).json({
        success: false,
        field: validation.field,
        message: "入力内容を確認してください。"
      });
    }

    const fields =
      validation.fields;

    const app =
      deps.getFirebaseAdminApp();

    const database =
      deps.getFirestore(app);

    // 店舗本人の確認(存在しない店舗・無効化された店舗・誤ったtokenは拒否)。
    // storeIdを送られただけでは信用しない。店名はサーバー側の正式名を使う。
    // 正式店舗アカウント接続｜方式A(店舗専用URLのtoken)・方式B(ログインした正式店舗)。
    const storeValidation =
      await verifyImadakeStoreActor(
        request,
        requestBody,
        database,
        deps
      );

    if (!storeValidation.valid) {
      return response.status(storeValidation.status).json({
        success: false,
        message: storeValidation.message
      });
    }

    const storeId =
      storeValidation.storeId;

    const storeName =
      storeValidation.storeName;

    // STEP 4A(Option A)｜所在地は運営が登録したstoreAccountsの正式所在地だけを
    // 使う(サーバー側で読む。ブラウザの値は使わない)。未登録の店舗は投稿不可。
    const officialLocation =
      await readStoreOfficialLocation(
        database,
        storeId
      );

    if (!officialLocation) {
      return response.status(409).json({
        success: false,
        reason: "location_not_registered",
        message: "店舗の掲載場所がまだ登録されていません。運営へお問い合わせください。"
      });
    }

    // 収益化 STEP 3｜課金対象かどうかは作成時にサーバーで決めて固定する(Productionでは現在常にfalse)。
    // STEP 35-A｜回数制限・投稿枠より前に決め、課金対象になる投稿はカード登録(店舗の請求先アカウントの accountBilling、STEP 42-C)を必須にする
    // (未登録・不整合・期限切れ等は保存せず409。課金対象でない投稿・Productionの現行動作は変えない)。
    const cvBillingEnabled =
      await decideImadakeCvBillingForNewPost(
        database,
        storeId
      );

    if (cvBillingEnabled === true) {
      const cardCheck =
        typeof deps.checkImadakeBillingCard === "function"
          ? await deps.checkImadakeBillingCard(database, storeId)
          : { ok: false, reason: "card_billing_unavailable" };

      if (!cardCheck || cardCheck.ok !== true) {
        const cardReason =
          cardCheck && typeof cardCheck.reason === "string" && cardCheck.reason !== ""
            ? cardCheck.reason
            : "card_billing_unavailable";

        return response.status(409).json({
          success: false,
          reason: cardReason,
          message: buildImadakeCardRequirementMessage(cardReason)
        });
      }
    }

    // 連打対策(店舗ごとに一定間隔)。
    const rateLimitOk =
      await deps.claimRateLimit(
        database,
        IMADAKE_RATE_LIMITS_COLLECTION,
        deps.hashRateLimitStore(storeId),
        IMADAKE_CREATE_COOLDOWN_MILLISECONDS
      );

    if (!rateLimitOk) {
      return response.status(429).json({
        success: false,
        message: "少し時間をおいてから、もう一度お試しください。"
      });
    }

    // 先に枠を確認し、掲載中・審査中があればModerationを呼ばずに断る
    // (最終的な保証は下のトランザクションで行う)。
    const precheck =
      await database.runTransaction(
        async function(transaction) {
          return readStoreSlotState(
            transaction,
            database,
            storeId,
            Date.now()
          );
        }
      );

    if (precheck.hasActive) {
      return response.status(409).json({
        success: false,
        reason: "active_post_exists",
        message: "掲載中の今だけ投稿があります。終了してから新しく投稿できます。"
      });
    }

    if (precheck.hasPending) {
      return response.status(409).json({
        success: false,
        reason: "pending_post_exists",
        message: "確認中の今だけ投稿があります。確認が終わるまでお待ちください。"
      });
    }

    let safety;

    try {
      safety =
        await decideImadakeSafety(
          fields,
          storeName,
          deps
        );
    } catch (moderationError) {
      // 判定できない時は公開も保存もしない(fail closed)。
      console.error(
        "今だけ投稿：安全チェックを実行できませんでした：",
        deps.classifyModerationError(moderationError)
      );

      return response.status(503).json({
        success: false,
        reason: "safety_check_unavailable",
        message: "ただいま投稿を確認できません。少し時間をおいてから、もう一度お試しください。"
      });
    }

    let ipHash = "";

    try {
      ipHash =
        deps.hashClientIpAddress(request) || "";
    } catch (hashError) {
      ipHash = "";
    }

    const geohash =
      encodeTownNowGeohash(
        officialLocation.latitude,
        officialLocation.longitude
      );

    const regionKey =
      buildImadakeRegionKey(
        officialLocation.countryCode,
        officialLocation.prefecture
      );

    const result =
      await database.runTransaction(
        async function(transaction) {
          const nowMillis =
            Date.now();

          const state =
            await readStoreSlotState(
              transaction,
              database,
              storeId,
              nowMillis
            );

          // STEP 35-A｜確認の後・保存までの間のカード変更・取り外しとの競合を防ぐため、保存の
          // トランザクションの中でもカードを確かめる(読み取りは書き込みより前)。
          if (cvBillingEnabled === true) {
            const cardInTransaction =
              typeof deps.checkImadakeBillingCardInTransaction === "function"
                ? await deps.checkImadakeBillingCardInTransaction(transaction, database, storeId)
                : { ok: false, reason: "card_billing_unavailable" };

            if (!cardInTransaction || cardInTransaction.ok !== true) {
              return {
                conflict:
                  cardInTransaction && typeof cardInTransaction.reason === "string" && cardInTransaction.reason !== ""
                    ? cardInTransaction.reason
                    : "card_billing_unavailable"
              };
            }
          }

          // 並行リクエスト・二重タップでも、ここで必ず1件に絞られる。
          if (safety.decision === "published" && state.hasActive) {
            return { conflict: "active_post_exists" };
          }

          if (state.hasPending) {
            return { conflict: "pending_post_exists" };
          }

          if (
            safety.decision !== "rejected" &&
            state.hasActive
          ) {
            return { conflict: "active_post_exists" };
          }

          const postRef =
            database
              .collection(IMADAKE_POSTS_COLLECTION)
              .doc();

          const isPublished =
            safety.decision === "published";

          const publishedAt =
            isPublished
              ? Timestamp.fromMillis(nowMillis)
              : null;

          const expiresAt =
            isPublished
              ? Timestamp.fromMillis(
                  nowMillis + IMADAKE_PUBLISH_DURATION_MILLISECONDS
                )
              : null;

          const post = {
            storeId: storeId,
            storeNameSnapshot: storeName,
            categoryCode: fields.categoryCode,
            headline: fields.headline,
            body: fields.body,
            sourceLanguage: fields.sourceLanguage,
            status: safety.decision,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            statusChangedAt: FieldValue.serverTimestamp(),
            publishedAt: publishedAt,
            expiresAt: expiresAt,
            endedAt: null,
            // storeAccountsの正式所在地を投稿時点のsnapshotとして保存する
            // (後で店舗の所在地が変わっても、この投稿の値は変えない)。
            latitude: officialLocation.latitude,
            longitude: officialLocation.longitude,
            countryCode: officialLocation.countryCode,
            prefecture: officialLocation.prefecture,
            city: officialLocation.city,
            address: officialLocation.address,
            locationSource: "storeAccount",
            regionKey: regionKey,
            geohash: geohash,
            actionTargets: fields.actionTargets,
            categoryFields: fields.categoryFields,
            liveState:
              fields.liveState
                ? {
                    ...fields.liveState,
                    updatedAt: Timestamp.fromMillis(nowMillis)
                  }
                : null,
            availableUntil: fields.availableUntil,
            priceText: fields.priceText,
            paymentMethods: fields.paymentMethods,
            imageUrls: fields.imageUrls,
            imagePublicIds: fields.imagePublicIds,
            moderationStatus: safety.moderationStatus,
            moderationReason: safety.reason,
            moderationCheckedAt: Timestamp.fromMillis(nowMillis),
            moderationVersion: deps.AI_REVIEW_VERSION,
            createdByType: "store",
            authMethod: "storeToken",
            createdIpHash: ipHash,
            cvBillingEnabled: cvBillingEnabled === true
          };

          transaction.set(postRef, post);

          // 枠が指していた期限切れの掲載中投稿は"expired"として記録する。
          if (state.activeIsStaleExpired && state.activePostRef) {
            transaction.update(state.activePostRef, {
              status: "expired",
              statusChangedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });
          }

          const slotUpdate = {
            storeId: storeId,
            updatedAt: FieldValue.serverTimestamp()
          };

          if (isPublished) {
            Object.assign(
              slotUpdate,
              { activePostId: postRef.id },
              buildSlotLocationFields({
                expiresAt: expiresAt,
                regionKey: regionKey,
                geohash: geohash,
                latitude: officialLocation.latitude,
                longitude: officialLocation.longitude,
                countryCode: officialLocation.countryCode
              })
            );
          } else if (state.activeIsStaleExpired) {
            Object.assign(slotUpdate, EMPTY_ACTIVE_SLOT_FIELDS);
          }

          if (safety.decision === "pending") {
            slotUpdate.pendingPostId = postRef.id;
          }

          transaction.set(state.slotRef, slotUpdate, { merge: true });

          return {
            postId: postRef.id,
            status: safety.decision,
            publishedAtMillis: publishedAt ? nowMillis : null,
            expiresAtMillis: expiresAt ? nowMillis + IMADAKE_PUBLISH_DURATION_MILLISECONDS : null
          };
        }
      );

    if (result.conflict) {
      return response.status(409).json({
        success: false,
        reason: result.conflict,
        message:
          String(result.conflict).startsWith("card_")
            ? buildImadakeCardRequirementMessage(result.conflict)
            : result.conflict === "pending_post_exists"
              ? "確認中の今だけ投稿があります。確認が終わるまでお待ちください。"
              : "掲載中の今だけ投稿があります。終了してから新しく投稿できます。"
      });
    }

    const messageByStatus = {
      published: "今だけ投稿を掲載しました。24時間後に自動で終了します。",
      pending: "内容を確認してから掲載します。",
      rejected: "この内容は掲載できません。内容を見直してください。"
    };

    return response.status(200).json({
      success: true,
      postId: result.postId,
      status: result.status,
      publishedAt:
        result.publishedAtMillis !== null
          ? new Date(result.publishedAtMillis).toISOString()
          : null,
      expiresAt:
        result.expiresAtMillis !== null
          ? new Date(result.expiresAtMillis).toISOString()
          : null,
      message: messageByStatus[result.status]
    });
  } catch (error) {
    console.error("今だけ投稿の作成に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "今だけ投稿を作成できませんでした。"
    });
  }
}

// ---------------------------------------------------------------------------
// mode: imadakePostEnd (POST)
// 店舗本人が、掲載中の投稿を早期終了(ended)、または確認中の投稿を取り下げ
// (withdrawn)する。他店舗の投稿は終了できない。
// ---------------------------------------------------------------------------
export async function handleImadakePostEnd(
  request,
  response,
  deps
) {
  try {
    const requestBody =
      deps.readRequestBody(request);

    const postId =
      readTrimmedString(requestBody.postId);

    if (
      postId === "" ||
      postId.length > 100 ||
      postId.includes("/")
    ) {
      return response.status(400).json({
        success: false,
        message: "入力内容を確認してください。"
      });
    }

    const app =
      deps.getFirebaseAdminApp();

    const database =
      deps.getFirestore(app);

    // 正式店舗アカウント接続｜方式A(店舗専用URLのtoken)・方式B(ログインした正式店舗)。
    const storeValidation =
      await verifyImadakeStoreActor(
        request,
        requestBody,
        database,
        deps
      );

    if (!storeValidation.valid) {
      return response.status(storeValidation.status).json({
        success: false,
        message: storeValidation.message
      });
    }

    const storeId =
      storeValidation.storeId;

    const result =
      await database.runTransaction(
        async function(transaction) {
          const nowMillis =
            Date.now();

          const postRef =
            database
              .collection(IMADAKE_POSTS_COLLECTION)
              .doc(postId);

          const postSnapshot =
            await transaction.get(postRef);

          // 他店舗の投稿は、存在しない投稿と同じ応答にする。
          if (
            !postSnapshot.exists ||
            (postSnapshot.data() || {}).storeId !== storeId
          ) {
            return { error: 404 };
          }

          const post =
            postSnapshot.data() || {};

          const slotRef =
            database
              .collection(IMADAKE_STORE_SLOTS_COLLECTION)
              .doc(storeId);

          const slotSnapshot =
            await transaction.get(slotRef);

          const slot =
            slotSnapshot.exists
              ? slotSnapshot.data() || {}
              : {};

          if (post.status === "pending") {
            transaction.update(postRef, {
              status: "withdrawn",
              endedAt: FieldValue.serverTimestamp(),
              endedByType: "store",
              statusChangedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });

            if (slot.pendingPostId === postId) {
              transaction.set(
                slotRef,
                { pendingPostId: "", updatedAt: FieldValue.serverTimestamp() },
                { merge: true }
              );
            }

            return { status: "withdrawn" };
          }

          if (post.status !== "published") {
            return { error: 409, reason: "not_active" };
          }

          if (!isPublishedAndUnexpired(post, nowMillis)) {
            transaction.update(postRef, {
              status: "expired",
              statusChangedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });

            if (slot.activePostId === postId) {
              transaction.set(
                slotRef,
                { ...EMPTY_ACTIVE_SLOT_FIELDS, updatedAt: FieldValue.serverTimestamp() },
                { merge: true }
              );
            }

            return { error: 409, reason: "already_expired" };
          }

          transaction.update(postRef, {
            status: "ended",
            endedAt: FieldValue.serverTimestamp(),
            endedByType: "store",
            statusChangedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });

          if (slot.activePostId === postId) {
            transaction.set(
              slotRef,
              { ...EMPTY_ACTIVE_SLOT_FIELDS, updatedAt: FieldValue.serverTimestamp() },
              { merge: true }
            );
          }

          return { status: "ended" };
        }
      );

    if (result.error === 404) {
      return response.status(404).json({
        success: false,
        message: "対象の今だけ投稿が見つかりません。"
      });
    }

    if (result.error === 409) {
      return response.status(409).json({
        success: false,
        reason: result.reason,
        message: "この今だけ投稿はすでに掲載されていません。"
      });
    }

    return response.status(200).json({
      success: true,
      postId: postId,
      status: result.status,
      message:
        result.status === "withdrawn"
          ? "確認中の今だけ投稿を取り下げました。"
          : "今だけ投稿を終了しました。"
    });
  } catch (error) {
    console.error("今だけ投稿の終了に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "今だけ投稿を終了できませんでした。"
    });
  }
}

// ---------------------------------------------------------------------------
// mode: imadakePostGet (GET、認証不要)
// 公開中(published かつ expiresAt > 現在)の1件だけを、公開してよい項目に
// 絞って返す。それ以外の状態は「見つからない」と同じ応答にする。
// ---------------------------------------------------------------------------
function toIsoOrNull(
  value
) {
  const millis =
    toMillis(value);

  return millis === null
    ? null
    : new Date(millis).toISOString();
}

export function buildImadakePublicPost(
  postId,
  post
) {
  return {
    postId: postId,
    storeId: post.storeId,
    storeName: post.storeNameSnapshot,
    categoryCode: post.categoryCode,
    headline: post.headline,
    body: post.body,
    sourceLanguage: post.sourceLanguage,
    imageUrls: Array.isArray(post.imageUrls) ? post.imageUrls : [],
    latitude: post.latitude,
    longitude: post.longitude,
    countryCode: post.countryCode,
    prefecture: post.prefecture,
    city: post.city,
    address: post.address,
    regionKey: post.regionKey,
    actionTargets: post.actionTargets || {},
    categoryFields: post.categoryFields || {},
    liveState:
      post.liveState
        ? {
            type: post.liveState.type,
            status: post.liveState.status,
            quantity:
              typeof post.liveState.quantity === "number"
                ? post.liveState.quantity
                : null,
            updatedAt: toIsoOrNull(post.liveState.updatedAt)
          }
        : null,
    availableUntil: post.availableUntil,
    priceText: post.priceText,
    paymentMethods: Array.isArray(post.paymentMethods) ? post.paymentMethods : [],
    publishedAt: toIsoOrNull(post.publishedAt),
    expiresAt: toIsoOrNull(post.expiresAt)
  };
}

// STEP 48-C｜課金対象の投稿の「続きを見る」の前の公開項目(許可リスト)。近くの一覧のカード
// (buildImadakeCardPost)と同じ範囲：店名・見出し・本文の冒頭80文字・写真1枚・カテゴリー・在庫等の状態・
// 掲載の期限と提供の期限・原文の言語・保存済みのカード訳。本文・住所・連絡先(actionTargets)・価格・
// 支払い方法・イベントの詳細(categoryFields)・座標・地域・店舗IDは含めない。
export function buildImadakePublicCardPreview(
  postId,
  post
) {
  const imageUrls =
    Array.isArray(post.imageUrls)
      ? post.imageUrls
      : [];

  const excerpt =
    buildImadakeCardExcerpt(post.body);

  return {
    postId: postId,
    storeName: post.storeNameSnapshot,
    categoryCode: post.categoryCode,
    headline: post.headline,
    body: "",
    excerpt: excerpt.excerpt,
    excerptTruncated: excerpt.excerptTruncated,
    sourceLanguage: post.sourceLanguage,
    imageUrls: imageUrls.length > 0 ? [imageUrls[0]] : [],
    liveState:
      post.liveState
        ? {
            type: post.liveState.type,
            status: post.liveState.status,
            quantity:
              typeof post.liveState.quantity === "number"
                ? post.liveState.quantity
                : null
          }
        : null,
    availableUntil: post.availableUntil,
    publishedAt: toIsoOrNull(post.publishedAt),
    expiresAt: toIsoOrNull(post.expiresAt),
    cardTranslations: readReadyImadakeCardTranslations(post)
  };
}

export async function handleImadakePostGet(
  request,
  response,
  deps
) {
  try {
    const postId =
      request.query && typeof request.query.postId === "string"
        ? request.query.postId.trim()
        : "";

    if (
      postId === "" ||
      postId.length > 100 ||
      postId.includes("/")
    ) {
      return response.status(400).json({
        success: false,
        message: "入力内容を確認してください。"
      });
    }

    const app =
      deps.getFirebaseAdminApp();

    const database =
      deps.getFirestore(app);

    const snapshot =
      await database
        .collection(IMADAKE_POSTS_COLLECTION)
        .doc(postId)
        .get();

    const post =
      snapshot.exists ? snapshot.data() || {} : null;

    if (
      post === null ||
      !isPublishedAndUnexpired(post, Date.now())
    ) {
      return response.status(404).json({
        success: false,
        message: "この今だけ投稿は掲載されていません。"
      });
    }

    // 収益化 STEP 3｜課金対象の投稿は、この認証不要のGETでは本文を返さない(本文は
    // POST imadakeDetailOpenでCVを記録してから返す。CVを迂回して全文を得る経路を作らない)。
    // 課金対象外(既存投稿・現在の新規投稿)は従来どおり本文を返す。
    // STEP 48-C｜課金対象の投稿は、「続きを見る」の前に公開してよい項目(公開カードと同じ範囲)だけを
    // 返す(buildImadakePublicCardPreview)。住所・連絡先・価格・支払い方法・イベントの詳細・座標・
    // 店舗ID・写真2枚目以降は、POST imadakeDetailOpen(CVの判定)を経た後にだけ返す。
    if (post.cvBillingEnabled === true) {
      return response.status(200).json({
        success: true,
        bodyProtected: true,
        post: buildImadakePublicCardPreview(snapshot.id, post)
      });
    }

    // STEP 48-B｜共有リンクの紹介の翻訳用に、保存済みのカード訳(近くの一覧と同じ値。AI翻訳は呼ばない)を加える。
    return response.status(200).json({
      success: true,
      post: {
        ...buildImadakePublicPost(snapshot.id, post),
        cardTranslations: readReadyImadakeCardTranslations(post)
      }
    });
  } catch (error) {
    console.error("今だけ投稿の取得に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "今だけ投稿を取得できませんでした。"
    });
  }
}

// ==========================================================================
// 今だけ投稿 STEP 5｜旅行者向けの近くの一覧(GET mode=imadakePostsNearby、認証不要)
// ==========================================================================
// TOPの独立枠(次工程)が使う、カード表示用の一覧。読み取りだけで、書き込み・
// AI翻訳・GA4・成果計測は行わない。
//
// 1. 店舗ごとの枠(imadakeStoreSlots)を、閲覧者の現在地から15kmのgeohash範囲で
//    読む(1店舗1件の枠なので、同じ店舗の投稿は重ならない)。
// 2. 枠の掲載期限・座標で候補を絞り、近い順に上限件数まで投稿本体を読む。
// 3. 投稿本体で「公開中かつ期限内」「枠と同じ店舗」「15km以内」を再確認する
//    (枠の情報が古くても、公開していない投稿は返さない)。
// 返すのはカードに必要な項目だけ(本文は冒頭80文字の紹介文のみ。本文全文・
// 店舗ID・正確な座標・審査情報・token等は返さない)。詳細はimadakePostGet。
// ==========================================================================

// 返すカードの最大件数(街の今スレッドの一覧上限20件と同じ)。
export const IMADAKE_NEARBY_LIST_LIMIT =
  20;

// geohash範囲ごとに読む店舗枠の上限(街の今スレッドの範囲検索上限50件と同じ)。
export const IMADAKE_NEARBY_RANGE_QUERY_LIMIT =
  50;

// 投稿本体を読む候補の上限(近い順)。本体側の再確認で落ちる分を見込み、
// 返す件数より少し多く読む。
export const IMADAKE_NEARBY_CANDIDATE_LIMIT =
  30;

// カードの紹介文(本文の冒頭)の文字数。
export const IMADAKE_CARD_EXCERPT_LENGTH =
  80;

// 閲覧者の現在地。街の今スレッドと同じく、約100m(小数点以下3桁まで)に丸めた
// 値だけを受け付ける(精密な現在地を送らせない・CDNキャッシュが効くようにする)。
function readImadakeViewerCoordinate(
  rawValue,
  min,
  max
) {
  if (
    typeof rawValue !== "string" ||
    !/^-?\d{1,3}(\.\d{1,3})?$/.test(rawValue.trim())
  ) {
    return null;
  }

  const value =
    Number(rawValue.trim());

  return Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

// 本文の冒頭をカード用の紹介文にする。改行・連続空白は1つの空白にまとめ、
// 絵文字等が途中で割れないよう文字(コードポイント)単位で切る。
export function buildImadakeCardExcerpt(
  body
) {
  const normalized =
    typeof body === "string"
      ? body.replace(/\s+/g, " ").trim()
      : "";

  const characters =
    Array.from(normalized);

  return {
    excerpt:
      characters
        .slice(0, IMADAKE_CARD_EXCERPT_LENGTH)
        .join(""),
    excerptTruncated:
      characters.length > IMADAKE_CARD_EXCERPT_LENGTH
  };
}

// --------------------------------------------------------------------------
// 今だけ投稿 STEP 3｜カード(タイトル＋紹介文)の翻訳キャッシュ
// --------------------------------------------------------------------------
// 翻訳はimadakePosts/{postId}.translations.{language}.cardに保存する
// (書き込みはimadake-translation.jsの翻訳専用処理だけ)。カードの原文
// (headlineと、本文から作る紹介文)のハッシュが一致する訳だけを使い、原文が
// 変わった後の古い訳は使わない。一覧APIは投稿本体を読んでいるので、訳を返す
// ための追加の読み取りは無い。

// カード翻訳に対応する表示言語(サーバー側の許可リスト。初期は英語のみ)。
export const IMADAKE_CARD_TRANSLATION_LANGUAGES =
  ["en"];

export function getImadakeCardSource(
  post
) {
  return {
    headline:
      typeof post.headline === "string"
        ? post.headline
        : "",
    excerpt:
      buildImadakeCardExcerpt(post.body).excerpt
  };
}

export function computeImadakeCardSourceHash(
  source
) {
  return createHash("sha256")
    .update(
      JSON.stringify([source.headline, source.excerpt]),
      "utf8"
    )
    .digest("hex");
}

// 使ってよい(翻訳済み・原文ハッシュ一致・原文と違う言語の)カード翻訳だけを返す。
export function readReadyImadakeCardTranslations(
  post
) {
  const result =
    {};

  const translations =
    post.translations && typeof post.translations === "object"
      ? post.translations
      : null;

  if (!translations) {
    return result;
  }

  const sourceHash =
    computeImadakeCardSourceHash(
      getImadakeCardSource(post)
    );

  IMADAKE_CARD_TRANSLATION_LANGUAGES.forEach(function(language) {
    const entry =
      translations[language] &&
      translations[language].card;

    if (
      language !== post.sourceLanguage &&
      entry &&
      entry.status === "ready" &&
      entry.sourceHash === sourceHash &&
      typeof entry.headline === "string" &&
      entry.headline !== "" &&
      typeof entry.excerpt === "string"
    ) {
      result[language] = {
        headline: entry.headline,
        excerpt: entry.excerpt
      };
    }
  });

  return result;
}

export function buildImadakeCardPost(
  postId,
  post,
  distanceKm
) {
  const imageUrls =
    Array.isArray(post.imageUrls)
      ? post.imageUrls
      : [];

  const excerpt =
    buildImadakeCardExcerpt(post.body);

  return {
    postId: postId,
    storeName: post.storeNameSnapshot,
    categoryCode: post.categoryCode,
    headline: post.headline,
    excerpt: excerpt.excerpt,
    excerptTruncated: excerpt.excerptTruncated,
    sourceLanguage: post.sourceLanguage,
    imageUrl: imageUrls.length > 0 ? imageUrls[0] : "",
    imageCount: imageUrls.length,
    liveState:
      post.liveState
        ? {
            type: post.liveState.type,
            status: post.liveState.status,
            quantity:
              typeof post.liveState.quantity === "number"
                ? post.liveState.quantity
                : null
          }
        : null,
    availableUntil: post.availableUntil,
    publishedAt: toIsoOrNull(post.publishedAt),
    expiresAt: toIsoOrNull(post.expiresAt),
    // 距離は0.1km単位に丸める(正確な座標は返さない)。
    distanceKm: Math.round(distanceKm * 10) / 10,
    // STEP 3｜翻訳済みのカード訳(無ければ{})。既存の項目は変えない。
    cardTranslations: readReadyImadakeCardTranslations(post)
  };
}

export async function handleImadakePostsNearby(
  request,
  response,
  deps
) {
  try {
    const query =
      request.query ||
      {};

    const viewerLatitude =
      readImadakeViewerCoordinate(
        query.latitude,
        -90,
        90
      );

    const viewerLongitude =
      readImadakeViewerCoordinate(
        query.longitude,
        -180,
        180
      );

    if (
      viewerLatitude === null ||
      viewerLongitude === null
    ) {
      return response.status(400).json({
        success: false,
        message: "現在地(小数点以下3桁まで)を指定してください。"
      });
    }

    const database =
      deps.getFirestore(
        deps.getFirebaseAdminApp()
      );

    const nowMillis =
      Date.now();

    const slotsCollection =
      database.collection(
        IMADAKE_STORE_SLOTS_COLLECTION
      );

    const ranges =
      computeTownNowGeohashQueryRanges(
        viewerLatitude,
        viewerLongitude,
        IMADAKE_NEARBY_RADIUS_KM * 1000
      );

    // activeGeohashだけの範囲条件(単一フィールド)なので、新しい複合indexは不要。
    // 掲載の無い枠はactiveGeohashが""のため、範囲に入らない。
    const rangeSnapshots =
      await Promise.all(
        ranges.map(
          function(range) {
            return slotsCollection
              .where(
                "activeGeohash",
                ">=",
                range[0]
              )
              .where(
                "activeGeohash",
                "<",
                range[1]
              )
              .orderBy(
                "activeGeohash"
              )
              .limit(
                IMADAKE_NEARBY_RANGE_QUERY_LIMIT
              )
              .get();
          }
        )
      );

    // 店舗ID(枠のドキュメントID)ごとに1件。geohash範囲が重なっても重複しない。
    const candidatesByStoreId =
      new Map();

    rangeSnapshots.forEach(
      function(snapshot) {
        snapshot.docs.forEach(
          function(slotSnapshot) {
            const slot =
              slotSnapshot.data() ||
              {};

            const activePostId =
              typeof slot.activePostId === "string"
                ? slot.activePostId
                : "";

            const activeExpiresAtMillis =
              toMillis(slot.activeExpiresAt);

            if (
              activePostId === "" ||
              activePostId.includes("/") ||
              activeExpiresAtMillis === null ||
              activeExpiresAtMillis <= nowMillis ||
              typeof slot.activeLatitude !== "number" ||
              typeof slot.activeLongitude !== "number"
            ) {
              return;
            }

            const slotDistanceKm =
              computeImadakeDistanceKm(
                viewerLatitude,
                viewerLongitude,
                slot.activeLatitude,
                slot.activeLongitude
              );

            if (!isWithinImadakeNearbyRadius(slotDistanceKm)) {
              return;
            }

            candidatesByStoreId.set(
              slotSnapshot.id,
              {
                storeId: slotSnapshot.id,
                postId: activePostId,
                distanceKm: slotDistanceKm
              }
            );
          }
        );
      }
    );

    const candidates =
      Array.from(
        candidatesByStoreId.values()
      )
        .sort(
          function(a, b) {
            return a.distanceKm - b.distanceKm;
          }
        )
        .slice(
          0,
          IMADAKE_NEARBY_CANDIDATE_LIMIT
        );

    const postSnapshots =
      candidates.length > 0
        ? await database.getAll(
            ...candidates.map(
              function(candidate) {
                return database
                  .collection(IMADAKE_POSTS_COLLECTION)
                  .doc(candidate.postId);
              }
            )
          )
        : [];

    const cards =
      [];

    postSnapshots.forEach(
      function(postSnapshot, index) {
        const candidate =
          candidates[index];

        const post =
          postSnapshot && postSnapshot.exists
            ? postSnapshot.data() || {}
            : null;

        if (
          post === null ||
          !isPublishedAndUnexpired(post, nowMillis) ||
          post.storeId !== candidate.storeId ||
          typeof post.latitude !== "number" ||
          typeof post.longitude !== "number"
        ) {
          return;
        }

        // 距離は投稿本体の座標(投稿時点の店舗所在地)で計算し直す。
        const distanceKm =
          computeImadakeDistanceKm(
            viewerLatitude,
            viewerLongitude,
            post.latitude,
            post.longitude
          );

        if (!isWithinImadakeNearbyRadius(distanceKm)) {
          return;
        }

        cards.push({
          card:
            buildImadakeCardPost(
              postSnapshot.id,
              post,
              distanceKm
            ),
          distanceKm: distanceKm,
          publishedAtMillis: toMillis(post.publishedAt) || 0
        });
      }
    );

    // 近い順。同じ距離なら新しい投稿を先にする。
    cards.sort(
      function(a, b) {
        return (
          a.distanceKm - b.distanceKm ||
          b.publishedAtMillis - a.publishedAtMillis
        );
      }
    );

    // 街の今スレッドの周辺取得と同じ短いCDNキャッシュ(30秒)。
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=30, stale-while-revalidate=30"
    );

    return response.status(200).json({
      success: true,
      radiusKm: IMADAKE_NEARBY_RADIUS_KM,
      posts:
        cards
          .slice(0, IMADAKE_NEARBY_LIST_LIMIT)
          .map(function(entry) {
            return entry.card;
          })
    });
  } catch (error) {
    console.error("今だけ投稿の近くの一覧の取得に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "今だけ投稿を取得できませんでした。"
    });
  }
}

// ---------------------------------------------------------------------------
// STEP 3.5｜運営による審査(admin専用)
// ---------------------------------------------------------------------------
// 安全重大語等でpendingになった今だけ投稿を、代表(admin)が承認または却下する。
// 認証は既存のrequireAdmin()(Firebase AuthのIDトークン＋ADMIN_EMAIL一致)だけ。
// 店舗token・Editor権限では一覧も審査もできない。

export const IMADAKE_ADMIN_PENDING_LIST_LIMIT = 50;
export const IMADAKE_REVIEW_REASON_MAX_LENGTH = 200;

// 審査に必要な項目だけを返す(IPハッシュ・認証方法等の内部情報は返さない)。
function buildImadakeAdminPendingItem(
  postId,
  post
) {
  return {
    postId: postId,
    storeId: post.storeId,
    storeName: post.storeNameSnapshot,
    categoryCode: post.categoryCode,
    headline: post.headline,
    body: post.body,
    imageUrls: Array.isArray(post.imageUrls) ? post.imageUrls : [],
    createdAt: toIsoOrNull(post.createdAt),
    moderationStatus: post.moderationStatus,
    moderationReason: post.moderationReason,
    latitude: post.latitude,
    longitude: post.longitude,
    prefecture: post.prefecture,
    city: post.city,
    address: post.address,
    actionTargets: post.actionTargets || {},
    categoryFields: post.categoryFields || {},
    liveState:
      post.liveState
        ? {
            type: post.liveState.type,
            status: post.liveState.status,
            quantity:
              typeof post.liveState.quantity === "number"
                ? post.liveState.quantity
                : null
          }
        : null,
    availableUntil: post.availableUntil,
    priceText: post.priceText
  };
}

async function requireImadakeAdmin(
  request,
  response,
  deps
) {
  const authResult =
    await deps.requireAdmin(request);

  if (!authResult || !authResult.ok) {
    response.status((authResult && authResult.status) || 403).json({
      success: false,
      message: (authResult && authResult.message) || "管理者権限が必要です。"
    });

    return null;
  }

  return authResult;
}

// mode: imadakeAdminPendingList (POST、admin専用)
export async function handleImadakeAdminPendingList(
  request,
  response,
  deps
) {
  try {
    const authResult =
      await requireImadakeAdmin(request, response, deps);

    if (!authResult) {
      return;
    }

    const database =
      deps.getFirestore(deps.getFirebaseAdminApp());

    // 等価条件1つだけのquery(複合index不要)。並べ替えはここで行う。
    const snapshot =
      await database
        .collection(IMADAKE_POSTS_COLLECTION)
        .where("status", "==", "pending")
        .limit(IMADAKE_ADMIN_PENDING_LIST_LIMIT)
        .get();

    const items =
      snapshot.docs
        .map(
          function(documentSnapshot) {
            return buildImadakeAdminPendingItem(
              documentSnapshot.id,
              documentSnapshot.data() || {}
            );
          }
        )
        .sort(
          function(first, second) {
            return String(first.createdAt || "").localeCompare(
              String(second.createdAt || "")
            );
          }
        );

    return response.status(200).json({
      success: true,
      posts: items
    });
  } catch (error) {
    console.error("今だけ投稿：審査待ち一覧の取得に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "審査待ちの今だけ投稿を取得できませんでした。"
    });
  }
}

// mode: imadakeAdminReview (POST、admin専用)
// decision: "approve" | "reject"。対象はstatus=="pending"の投稿だけ。
// 承認：その瞬間をpublishedAt、expiresAt＝publishedAt＋24h。同じ店舗に
//       公開中の今だけ投稿が既にある場合は承認しない(既存投稿を勝手に
//       終了させず、pendingのまま理由を返す)。店舗が無効化されていても承認しない。
// 却下：status＝rejected。
// どちらも1つのトランザクションで投稿と店舗の枠を同時に更新するため、
// 並行した承認でも同じ店舗の公開中は1件を超えない。
export async function handleImadakeAdminReview(
  request,
  response,
  deps
) {
  try {
    const authResult =
      await requireImadakeAdmin(request, response, deps);

    if (!authResult) {
      return;
    }

    const requestBody =
      deps.readRequestBody(request);

    const postId =
      readTrimmedString(requestBody.postId);

    const decision =
      readTrimmedString(requestBody.decision);

    const reviewReason =
      readShortText(
        requestBody.reason,
        IMADAKE_REVIEW_REASON_MAX_LENGTH
      );

    if (
      postId === "" ||
      postId.length > 100 ||
      postId.includes("/") ||
      (decision !== "approve" && decision !== "reject") ||
      reviewReason === null
    ) {
      return response.status(400).json({
        success: false,
        message: "入力内容を確認してください。"
      });
    }

    const reviewerUid =
      authResult.actor && typeof authResult.actor.uid === "string"
        ? authResult.actor.uid
        : "";

    const database =
      deps.getFirestore(deps.getFirebaseAdminApp());

    const result =
      await database.runTransaction(
        async function(transaction) {
          const nowMillis =
            Date.now();

          const postRef =
            database
              .collection(IMADAKE_POSTS_COLLECTION)
              .doc(postId);

          const postSnapshot =
            await transaction.get(postRef);

          if (!postSnapshot.exists) {
            return { error: 404 };
          }

          const post =
            postSnapshot.data() || {};

          // pending以外(withdrawn・rejected・published・ended等)は審査できない。
          if (post.status !== "pending") {
            return { error: 409, reason: "not_pending" };
          }

          const storeId =
            typeof post.storeId === "string" ? post.storeId : "";

          const state =
            await readStoreSlotState(
              transaction,
              database,
              storeId,
              nowMillis
            );

          const storeSnapshot =
            await transaction.get(
              database.collection("storeAccounts").doc(storeId)
            );

          const reviewFields = {
            reviewedAt: Timestamp.fromMillis(nowMillis),
            reviewedByUid: reviewerUid,
            reviewDecision: decision,
            reviewReason: reviewReason,
            statusChangedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          };

          const slotUpdate = {
            storeId: storeId,
            updatedAt: FieldValue.serverTimestamp()
          };

          if (state.slot.pendingPostId === postId) {
            slotUpdate.pendingPostId = "";
          }

          if (decision === "reject") {
            transaction.update(postRef, {
              status: "rejected",
              ...reviewFields
            });

            transaction.set(state.slotRef, slotUpdate, { merge: true });

            return { status: "rejected" };
          }

          if (
            !storeSnapshot.exists ||
            (storeSnapshot.data() || {}).enabled !== true
          ) {
            return { error: 409, reason: "store_disabled" };
          }

          if (state.hasActive) {
            return { error: 409, reason: "active_post_exists" };
          }

          const publishedAt =
            Timestamp.fromMillis(nowMillis);

          const expiresAt =
            Timestamp.fromMillis(
              nowMillis + IMADAKE_PUBLISH_DURATION_MILLISECONDS
            );

          transaction.update(postRef, {
            status: "published",
            publishedAt: publishedAt,
            expiresAt: expiresAt,
            ...reviewFields
          });

          if (state.activeIsStaleExpired && state.activePostRef) {
            transaction.update(state.activePostRef, {
              status: "expired",
              statusChangedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp()
            });
          }

          Object.assign(
            slotUpdate,
            { activePostId: postId },
            buildSlotLocationFields({
              expiresAt: expiresAt,
              regionKey: post.regionKey,
              geohash: post.geohash,
              latitude: post.latitude,
              longitude: post.longitude,
              countryCode: post.countryCode
            })
          );

          transaction.set(state.slotRef, slotUpdate, { merge: true });

          return {
            status: "published",
            publishedAtMillis: nowMillis,
            expiresAtMillis: nowMillis + IMADAKE_PUBLISH_DURATION_MILLISECONDS
          };
        }
      );

    if (result.error === 404) {
      return response.status(404).json({
        success: false,
        message: "対象の今だけ投稿が見つかりません。"
      });
    }

    if (result.error === 409) {
      const messageByReason = {
        not_pending: "この今だけ投稿は審査待ちではありません（すでに処理済み、または店舗が取り下げています）。",
        active_post_exists: "この店舗には公開中の今だけ投稿があるため、今は承認できません。公開中の投稿が終わってから承認してください。",
        store_disabled: "この店舗は現在無効になっているため承認できません。"
      };

      return response.status(409).json({
        success: false,
        reason: result.reason,
        message: messageByReason[result.reason] || "この操作はできません。"
      });
    }

    return response.status(200).json({
      success: true,
      postId: postId,
      status: result.status,
      publishedAt:
        result.publishedAtMillis
          ? new Date(result.publishedAtMillis).toISOString()
          : null,
      expiresAt:
        result.expiresAtMillis
          ? new Date(result.expiresAtMillis).toISOString()
          : null,
      message:
        result.status === "published"
          ? "承認して公開しました。24時間後に自動で終了します。"
          : "却下しました。"
    });
  } catch (error) {
    console.error("今だけ投稿：審査に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "審査を完了できませんでした。"
    });
  }
}

// ---------------------------------------------------------------------------
// STEP 4A(Option A)｜店舗の正式所在地(運営が登録)
// ---------------------------------------------------------------------------
// storeAccounts/{storeId}に、運営が登録・確認した所在地を保存する。
//   address / latitude / longitude / countryCode / prefecture / city /
//   regionKey / locationFormattedAddress / locationUpdatedAt / locationUpdatedByUid
// 15km判定は緯度経度、「範囲を広げる」はregionKeyを正とする。
// Google Geocodingは登録・変更の時だけ呼び、今だけ投稿の作成時には呼ばない。

export const IMADAKE_STORE_ADDRESS_MAX_LENGTH = 120;

const IMADAKE_GEOCODING_TIMEOUT_MS = 8000;

// storeAccountsのデータから正式所在地を取り出す。緯度経度・国コードが
// そろっていない場合は「未登録」(null)として扱う。
export function readStoreOfficialLocationFromData(
  data
) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const latitude =
    readCoordinate(data.latitude, -90, 90);

  const longitude =
    readCoordinate(data.longitude, -180, 180);

  const countryCode =
    typeof data.countryCode === "string" ? data.countryCode : "";

  if (
    latitude === null ||
    longitude === null ||
    (latitude === 0 && longitude === 0) ||
    !/^[A-Z]{2}$/.test(countryCode)
  ) {
    return null;
  }

  const prefecture =
    typeof data.prefecture === "string" ? data.prefecture : "";

  return {
    address: typeof data.address === "string" ? data.address : "",
    latitude: latitude,
    longitude: longitude,
    countryCode: countryCode,
    prefecture: prefecture,
    city: typeof data.city === "string" ? data.city : "",
    regionKey:
      typeof data.regionKey === "string" && data.regionKey !== ""
        ? data.regionKey
        : buildImadakeRegionKey(countryCode, prefecture)
  };
}

async function readStoreOfficialLocation(
  database,
  storeId
) {
  const snapshot =
    await database
      .collection("storeAccounts")
      .doc(storeId)
      .get();

  return snapshot.exists
    ? readStoreOfficialLocationFromData(snapshot.data() || {})
    : null;
}

// 住所 → 緯度経度・国・都道府県・市区町村(サーバー側Google Geocoding)。
// 既存のapi/edit-ad.js geocodeAddress()・街の掲示板の地域確認と同じ
// エンドポイント・同じサーバー用APIキー(GOOGLE_MAPS_API_KEY)・日本語指定。
// 失敗時は例外を投げず{ ok:false }を返す(呼び出し元は保存しない)。
export async function geocodeStoreAddress(
  address,
  deps
) {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return { ok: false, reason: "geocoding_unavailable" };
  }

  const requestUrl =
    new URL("https://maps.googleapis.com/maps/api/geocode/json");

  requestUrl.searchParams.set("address", address);
  requestUrl.searchParams.set("region", "JP");
  requestUrl.searchParams.set("language", "ja");
  requestUrl.searchParams.set("key", apiKey);

  const abortController =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        abortController.abort();
      },
      IMADAKE_GEOCODING_TIMEOUT_MS
    );

  let responseData;

  try {
    const response =
      await fetch(requestUrl, { signal: abortController.signal });

    responseData =
      await response.json();
  } catch (error) {
    return { ok: false, reason: "geocoding_failed" };
  } finally {
    clearTimeout(timeoutId);
  }

  if (
    !responseData ||
    responseData.status !== "OK" ||
    !Array.isArray(responseData.results) ||
    responseData.results.length === 0
  ) {
    return { ok: false, reason: "address_not_found" };
  }

  const result =
    responseData.results[0];

  const components =
    result.address_components;

  const country =
    deps.findAddressComponentByType(components, "country");

  const adminArea1 =
    deps.findAddressComponentByType(components, "administrative_area_level_1");

  const locality =
    deps.findAddressComponentByType(components, "locality");

  const sublocality1 =
    deps.findAddressComponentByType(components, "sublocality_level_1");

  const location =
    result.geometry && result.geometry.location
      ? result.geometry.location
      : null;

  const latitude =
    location ? readCoordinate(location.lat, -90, 90) : null;

  const longitude =
    location ? readCoordinate(location.lng, -180, 180) : null;

  const countryCode =
    country && typeof country.short_name === "string"
      ? country.short_name.toUpperCase()
      : "";

  if (
    latitude === null ||
    longitude === null ||
    !/^[A-Z]{2}$/.test(countryCode)
  ) {
    return { ok: false, reason: "address_not_found" };
  }

  const prefecture =
    adminArea1 && typeof adminArea1.long_name === "string"
      ? adminArea1.long_name
      : "";

  // 政令指定都市の区(例：大阪市＋北区)は、既存の市区町村データ
  // (japan-municipalities.js)と同じ「大阪市北区」の形にまとめる。
  let city =
    locality && typeof locality.long_name === "string"
      ? locality.long_name
      : "";

  if (
    city.endsWith("市") &&
    sublocality1 &&
    typeof sublocality1.long_name === "string" &&
    sublocality1.long_name.endsWith("区")
  ) {
    city = city + sublocality1.long_name;
  }

  if (city === "" && sublocality1 && typeof sublocality1.long_name === "string") {
    city = sublocality1.long_name;
  }

  return {
    ok: true,
    latitude: latitude,
    longitude: longitude,
    countryCode: countryCode,
    prefecture: prefecture,
    city: city,
    regionKey: buildImadakeRegionKey(countryCode, prefecture),
    formattedAddress:
      typeof result.formatted_address === "string"
        ? result.formatted_address
        : "",
    partialMatch: result.partial_match === true
  };
}

// mode: imadakeAdminStoreLocation (POST、admin専用)
// { storeId, address, confirm }。confirm:false(既定)は確認用の結果を返すだけで
// 保存しない。confirm:trueで同じ住所を改めてGeocodingし、storeAccountsへ保存する。
// Geocodingに失敗した場合は保存しない(既存の所在地もそのまま)。
export async function handleImadakeAdminStoreLocation(
  request,
  response,
  deps
) {
  try {
    const authResult =
      await requireImadakeAdmin(request, response, deps);

    if (!authResult) {
      return;
    }

    const requestBody =
      deps.readRequestBody(request);

    const storeId =
      readTrimmedString(requestBody.storeId);

    const address =
      readShortText(requestBody.address, IMADAKE_STORE_ADDRESS_MAX_LENGTH);

    if (
      storeId === "" ||
      storeId.length > 100 ||
      storeId.includes("/") ||
      address === null ||
      address === ""
    ) {
      return response.status(400).json({
        success: false,
        message: "住所を入力してください。"
      });
    }

    const database =
      deps.getFirestore(deps.getFirebaseAdminApp());

    const storeRef =
      database.collection("storeAccounts").doc(storeId);

    const storeSnapshot =
      await storeRef.get();

    if (!storeSnapshot.exists) {
      return response.status(404).json({
        success: false,
        message: "対象の店舗が見つかりません。"
      });
    }

    // 正式店舗参加基盤 Phase 2A｜セルフ登録店舗の所在地は、店舗が選んだ国で
    // 確定済み。日本固定のこの運営用Geocodingでは上書きしない。
    // STEP 42-F｜運営掲載の引き継ぎで作られた店舗(listingClaim)も店主が管理する店舗のため同じ扱い。
    const storeCreatedByType = (storeSnapshot.data() || {}).createdByType;

    if (storeCreatedByType === "storeUser" || storeCreatedByType === "listingClaim") {
      return response.status(409).json({
        success: false,
        reason: "self_registered_store",
        message: "セルフ登録の店舗の所在地は、この画面からは変更できません。"
      });
    }

    const geocoded =
      await geocodeStoreAddress(address, deps);

    if (!geocoded.ok) {
      return response.status(400).json({
        success: false,
        reason: geocoded.reason,
        message:
          geocoded.reason === "geocoding_unavailable"
            ? "住所の確認機能が利用できません。"
            : "この住所の場所を確認できませんでした。住所を詳しく入力してください。"
      });
    }

    const location = {
      address: address,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      countryCode: geocoded.countryCode,
      prefecture: geocoded.prefecture,
      city: geocoded.city,
      regionKey: geocoded.regionKey,
      formattedAddress: geocoded.formattedAddress,
      partialMatch: geocoded.partialMatch
    };

    if (requestBody.confirm !== true) {
      return response.status(200).json({
        success: true,
        saved: false,
        location: location
      });
    }

    await storeRef.update({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      countryCode: location.countryCode,
      prefecture: location.prefecture,
      city: location.city,
      regionKey: location.regionKey,
      locationFormattedAddress: location.formattedAddress,
      locationUpdatedAt: FieldValue.serverTimestamp(),
      locationUpdatedByUid:
        authResult.actor && typeof authResult.actor.uid === "string"
          ? authResult.actor.uid
          : "",
      updatedAt: FieldValue.serverTimestamp()
    });

    return response.status(200).json({
      success: true,
      saved: true,
      location: location
    });
  } catch (error) {
    console.error("店舗所在地の登録に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "店舗所在地を登録できませんでした。"
    });
  }
}

// ---------------------------------------------------------------------------
// mode: imadakeStoreStatus (POST、店舗token)
// 店舗の今だけ投稿画面用。店名・掲載場所(表示用)・今の投稿1件(公開中または
// 確認中)だけを返す。過去の履歴一覧は返さない。
// ---------------------------------------------------------------------------
function buildImadakeStoreCurrentPost(
  postId,
  post
) {
  return {
    postId: postId,
    status: post.status,
    headline: post.headline,
    categoryCode: post.categoryCode,
    publishedAt: toIsoOrNull(post.publishedAt),
    expiresAt: toIsoOrNull(post.expiresAt)
  };
}

export async function handleImadakeStoreStatus(
  request,
  response,
  deps
) {
  try {
    const requestBody =
      deps.readRequestBody(request);

    const app =
      deps.getFirebaseAdminApp();

    const database =
      deps.getFirestore(app);

    // 正式店舗アカウント接続｜方式A(店舗専用URLのtoken)・方式B(ログインした正式店舗)。
    const storeValidation =
      await verifyImadakeStoreActor(
        request,
        requestBody,
        database,
        deps
      );

    if (!storeValidation.valid) {
      return response.status(storeValidation.status).json({
        success: false,
        message: storeValidation.message
      });
    }

    const storeId =
      storeValidation.storeId;

    const officialLocation =
      await readStoreOfficialLocation(database, storeId);

    const state =
      await database.runTransaction(
        async function(transaction) {
          return readStoreSlotState(
            transaction,
            database,
            storeId,
            Date.now()
          );
        }
      );

    let currentPost = null;

    if (state.hasActive && state.activePostRef) {
      currentPost =
        buildImadakeStoreCurrentPost(state.activePostRef.id, state.activePost);
    } else if (state.hasPending && state.pendingPostRef) {
      const pendingSnapshot =
        await state.pendingPostRef.get();

      if (pendingSnapshot.exists) {
        currentPost =
          buildImadakeStoreCurrentPost(pendingSnapshot.id, pendingSnapshot.data() || {});
      }
    }

    return response.status(200).json({
      success: true,
      storeName: storeValidation.storeName,
      location:
        officialLocation
          ? {
              prefecture: officialLocation.prefecture,
              city: officialLocation.city,
              address: officialLocation.address
            }
          : null,
      currentPost: currentPost
    });
  } catch (error) {
    console.error("今だけ投稿：店舗の状態取得に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "今だけ投稿の状態を確認できませんでした。"
    });
  }
}
