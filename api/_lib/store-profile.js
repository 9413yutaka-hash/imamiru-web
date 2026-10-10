// ==========================================================================
// 正式店舗参加基盤 Phase 2B｜店舗自身による常設店舗情報の作成・編集(サーバー側)
// ==========================================================================
// セルフ登録した店舗(Phase 2A)の owner が、storeProfiles/{storeId} の基本項目を
// 自分で入力・保存する。保存では status を変えない(公開・非公開は Phase 2D の
// storeProfilePublish / storeProfileUnpublish だけが変える)。店名・所在地は表示のみで、
// ここでは変更しない。
//
// 編集できるのは次をすべて満たす場合だけ(すべてサーバー側で判定する)：
//   ・ログイン済み・メール確認済みの店舗アカウント
//   ・storeMembers/{storeId}_{uid} が role:"owner" かつ status:"active"
//   ・storeAccounts/{storeId} が registrationStatus:"active" かつ enabled:true
// storeAccounts・submissions・TOPの公開一覧には一切書き込まない。
// Firestore Rulesの変更は不要(storeProfilesはPhase 2Aで直接read/write拒否済み)。
// このファイルはVercel Functionではない(api/moderate-submission.jsから呼ばれる)。

import {
  FieldValue
} from "firebase-admin/firestore";

import {
  validateImadakeUrl,
  validateImadakePhone
} from "./imadake.js";

import {
  STORE_CATEGORY_CODES,
  requireVerifiedStoreUser
} from "./store-self-service.js";

const STORE_ACCOUNTS_COLLECTION = "storeAccounts";
const STORE_MEMBERS_COLLECTION = "storeMembers";
const STORE_PROFILES_COLLECTION = "storeProfiles";
// Phase 2D｜公開条件の重複候補の判定でだけ読む(オーナー化 MVP-1 の紐付け)。
const STORE_LISTING_LINKS_COLLECTION = "storeListingLinks";
// Phase 2Aと同じ連打防止用collectionを使う(新しいRulesを増やさない)。
const STORE_RATE_LIMITS_COLLECTION = "storeRegistrationRateLimits";

export const STORE_DESCRIPTION_MAX_LENGTH = 1000;
export const STORE_HOURS_NOTE_MAX_LENGTH = 100;
export const STORE_SOCIAL_LINKS_MAX = 3;
export const STORE_HOURS_RANGES_PER_DAY_MAX = 2;

// 曜日は英語code。保存形式は businessHours.weekly.{mon..sun} = [{open, close}]。
export const STORE_WEEKDAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// SNSの種類は英語code。URLから種類を自動推測しない(店舗が選んだ値をそのまま保存)。
export const STORE_SOCIAL_TYPES = [
  "instagram",
  "x",
  "facebook",
  "tiktok",
  "youtube",
  "threads",
  "line",
  "other"
];

// 既存の店舗カード(submissions.paymentMethods)と同じ3値。2Dでそのまま使える。
export const STORE_PAYMENT_METHOD_CODES = ["cash", "card", "qr"];

// 2B追加｜設備・サービス(英語code)。「ある」ものだけを保存する(codeなし＝未登録・不明。
// 「なし」とは解釈しない)。カテゴリによって保存できる項目を制限しない。
// 一度使ったcodeは改名・意味変更しない(追加のみ)。画面はstoreProfileGetの応答に
// 含まれるこの一覧から選択肢を作る(サーバーと画面の許可codeを一致させるため)。
export const STORE_FEATURE_CODES = [
  "parking",
  "free_wifi",
  "power_outlets",
  "wheelchair_accessible",
  "kid_friendly",
  "pet_friendly",
  "dine_in",
  "takeout",
  "delivery",
  "store_pickup",
  "tax_free"
];

// 2B追加｜対応言語(BCP 47)。設備・サービスとは別項目。将来は一覧へ追加するだけで増やせる。
export const STORE_LANGUAGE_CODES = ["ja", "en", "zh-Hans", "zh-Hant", "ko", "th", "vi", "fr", "es", "de"];

const STORE_PROFILE_UPDATE_COOLDOWN_MS = 3 * 1000;

// Phase 2C｜常設店舗の写真。最大10枚、配列の順＝表示順、photos[0]がメイン写真。
// 店舗写真はCloudinaryの店舗専用フォルダー machinau_store_profiles/{storeId} にだけ
// 置く(署名発行時にサーバーがowner確認後に指定する)。保存時は、自店舗フォルダーの
// 画像以外を受け付けない(運営無料掲載・今だけ投稿・他店舗・外部URLの画像は不可)。
export const STORE_PHOTOS_MAX = 10;
export const STORE_PHOTO_FOLDER_ROOT = "machinau_store_profiles";
const STORE_PHOTO_CLOUDINARY_PREFIX = "https://res.cloudinary.com/cdhyctnp/image/upload/";
// 写真のModerationは1枚1リクエスト(複数画像は too_many_images になる)。同時実行数だけ制限する。
const STORE_PHOTO_MODERATION_CONCURRENCY = 3;

export function buildStorePhotoFolder(storeId) {
  return STORE_PHOTO_FOLDER_ROOT + "/" + storeId;
}

// 削除してよい画像か(店舗写真フォルダーの画像だけ)。削除処理側でも同じ確認を重ねる。
export function isStorePhotoPublicId(publicId, storeId) {
  return (
    typeof publicId === "string" &&
    typeof storeId === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(storeId) &&
    new RegExp("^" + STORE_PHOTO_FOLDER_ROOT + "/" + storeId + "/[A-Za-z0-9_-]{1,100}$").test(publicId)
  );
}

// photos: undefined/null は「送られてこなかった」(=保存済みの写真を変えない)。
// それ以外は [{url, publicId}] で最大10枚。URLはpublicIdから決まる形
// (https://res.cloudinary.com/cdhyctnp/image/upload/v{版}/{publicId}.{webp|jpg|jpeg|png})と
// 完全一致しなければ受け付けない(URLとpublicIdを別々の画像にすり替えられないように)。
function readStorePhotos(value, storeId) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > STORE_PHOTOS_MAX) {
    return null;
  }

  const photos = [];
  const seen = new Set();

  for (const item of value) {
    const publicId = item && typeof item.publicId === "string" ? item.publicId : "";
    const url = item && typeof item.url === "string" ? item.url : "";

    if (!isStorePhotoPublicId(publicId, storeId) || seen.has(publicId)) {
      return null;
    }

    const expected = new RegExp(
      "^" + STORE_PHOTO_CLOUDINARY_PREFIX.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") +
      "v\\d{1,12}/" + publicId + "\\.(webp|jpg|jpeg|png)$"
    );

    if (!expected.test(url)) {
      return null;
    }

    seen.add(publicId);
    photos.push({ url: url, publicId: publicId });
  }

  return photos;
}

// 店舗写真の署名発行と保存で共通に使う、編集できる店舗かの確認(Phase 2Bと同じ条件)。
// 他人の店舗・存在しない店舗は区別せず store_not_found を返す。
export async function checkStoreProfileEditor(database, storeId, uid) {
  const snapshots = await Promise.all([
    database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + uid).get(),
    database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get()
  ]);

  if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), uid, storeId) || !snapshots[1].exists) {
    return { ok: false, status: 404, reason: "store_not_found" };
  }

  if (!isEditableStore(snapshots[1].data())) {
    return { ok: false, status: 403, reason: "store_not_editable" };
  }

  return { ok: true };
}

// 新しく追加された写真だけをModerationにかける。OpenAI Moderationは1回のリクエストに
// 画像を複数入れると 400 invalid_request_error / too_many_images を返すため
// (2026-10-10 Preview実測)、写真は必ず1枚ずつ別のリクエストで確認する。
// 同時に送るのは最大3件。1枚でもflaggedなら true、1件でもエラーなら例外(fail closed)。
async function moderateNewPhotos(photos, deps) {
  let nextIndex = 0;
  let flagged = false;
  let firstError = null;

  async function worker() {
    while (nextIndex < photos.length && !firstError) {
      const photo = photos[nextIndex];
      nextIndex += 1;

      try {
        const results = await deps.callOpenAiModeration(
          deps.buildModerationInput({ imageUrls: [photo.url] })
        );

        if (!Array.isArray(results) || results.length === 0) {
          throw new Error("moderation response was empty");
        }

        if (!results.every(function(result) { return result && result.flagged === false; })) {
          flagged = true;
        }
      } catch (error) {
        if (!firstError) {
          firstError = error;
        }
      }
    }
  }

  const workers = [];

  for (let index = 0; index < Math.min(STORE_PHOTO_MODERATION_CONCURRENCY, photos.length); index += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);

  if (firstError) {
    throw firstError;
  }

  return flagged;
}

// 原因調査用(Phase 2C Preview)｜Moderation失敗のログ用の要約。
// 数値のHTTP status、OpenAIのerror.type/error.code(呼び出し側で英数字の短い
// 識別子に限定済み)、エラーの区分、確認しようとした画像の枚数だけを含める。
function describeModerationErrorForLog(error, imageCount) {
  return JSON.stringify({
    kind:
      error && error.name === "AbortError" ? "timeout"
        : error && error.isHttpError ? "http_error"
          : error && error.isJsonError ? "invalid_response"
            : error && error.isMissingApiKey ? "missing_api_key"
              : "other",
    httpStatus: error && Number.isInteger(error.httpStatus) ? error.httpStatus : null,
    openAiErrorType: error && typeof error.openAiErrorType === "string" ? error.openAiErrorType : "",
    openAiErrorCode: error && typeof error.openAiErrorCode === "string" ? error.openAiErrorCode : "",
    imageCount: imageCount
  });
}

function readStoredPhotos(profileData) {
  return profileData && Array.isArray(profileData.photos) ? profileData.photos : [];
}

// Cloudinary上の実体削除。保存の成否には影響させず、失敗はサーバーログへ残す。
// 削除対象は呼び出し元で「この店舗フォルダーの画像」に限定済み。ここでも再確認する。
async function deleteStorePhotos(storeId, publicIds, deps, context) {
  const targets = publicIds.filter(function(publicId) {
    return isStorePhotoPublicId(publicId, storeId);
  });

  if (targets.length === 0) {
    return { requested: 0, failed: 0 };
  }

  let failed = 0;

  try {
    const results = await deps.destroyStorePhotoImages(targets);

    results.forEach(function(result) {
      if (!result.ok) {
        failed += 1;
        console.error(
          "店舗写真：Cloudinary削除失敗：",
          JSON.stringify({ storeId: storeId, publicId: result.publicId, context: context, detail: result.detail })
        );
      }
    });
  } catch (error) {
    failed = targets.length;
    console.error(
      "店舗写真：Cloudinary削除エラー：",
      JSON.stringify({ storeId: storeId, publicIds: targets, context: context, detail: error && error.message })
    );
  }

  return { requested: targets.length, failed: failed };
}


function sendError(response, status, reason, extra) {
  return response.status(status).json(
    Object.assign({ success: false, reason: reason }, extra || {})
  );
}

function readTrimmedString(value) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function countCharacters(text) {
  return Array.from(text).length;
}

// 改行(複数行)を許す文章。上限超過・改行とタブ以外の制御文字はnull(=不正)。
function readMultilineText(value, maxLength) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return null;
  }

  const text = readTrimmedString(value);

  if (
    countCharacters(text) > maxLength ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)
  ) {
    return null;
  }

  return text;
}

function readSingleLineText(value, maxLength) {
  const text = readMultilineText(value, maxLength);

  return text === null || text.includes("\n") ? null : text;
}

// "HH:MM" → 分。closeだけ "24:00"(=その日の終わり)を許す。
function readTimeMinutes(value, allowEndOfDay) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3));

  if (minutes > 59) {
    return null;
  }

  if (hours === 24 && minutes === 0 && allowEndOfDay) {
    return 1440;
  }

  return hours <= 23 ? hours * 60 + minutes : null;
}

// 営業時間。null(=未設定)または { weekly: {mon..sun: [{open, close}]}, note }。
// 1日の区間は最大2つ。空配列はその曜日が定休日。close < open は日跨ぎ(翌日のclose
// まで)。同じ日の2区間は時刻順・重ならないこと、日跨ぎできるのはその日の最後の区間だけ。
function readBusinessHours(value) {
  if (value === null || value === undefined) {
    return { ok: true, businessHours: null };
  }

  if (typeof value !== "object" || Array.isArray(value) || !value.weekly || typeof value.weekly !== "object") {
    return { ok: false, field: "businessHours" };
  }

  const weekly = {};

  for (const day of STORE_WEEKDAY_CODES) {
    const ranges = value.weekly[day];

    if (!Array.isArray(ranges) || ranges.length > STORE_HOURS_RANGES_PER_DAY_MAX) {
      return { ok: false, field: "businessHours." + day };
    }

    const normalized = [];
    let previousEnd = -1;

    for (let index = 0; index < ranges.length; index += 1) {
      const range = ranges[index] || {};
      const open = readTimeMinutes(range.open, false);
      const close = readTimeMinutes(range.close, true);

      if (open === null || close === null || open === close) {
        return { ok: false, field: "businessHours." + day };
      }

      const overnight = close < open;

      if (open < previousEnd || (overnight && index !== ranges.length - 1)) {
        return { ok: false, field: "businessHours." + day };
      }

      previousEnd = overnight ? close + 1440 : close;
      normalized.push({ open: range.open, close: range.close });
    }

    weekly[day] = normalized;
  }

  const note = readSingleLineText(value.note, STORE_HOURS_NOTE_MAX_LENGTH);

  if (note === null) {
    return { ok: false, field: "businessHours.note" };
  }

  return { ok: true, businessHours: { weekly: weekly, note: note } };
}

function readSocialLinks(value) {
  if (value === undefined || value === null) {
    return { ok: true, socialLinks: [] };
  }

  if (!Array.isArray(value) || value.length > STORE_SOCIAL_LINKS_MAX) {
    return { ok: false, field: "socialLinks" };
  }

  const socialLinks = [];

  for (const item of value) {
    const type = item && typeof item.type === "string" ? item.type : "";
    const url = validateImadakeUrl(item && item.url);

    if (!STORE_SOCIAL_TYPES.includes(type) || url === null || url === "") {
      return { ok: false, field: "socialLinks" };
    }

    socialLinks.push({ type: type, url: url });
  }

  return { ok: true, socialLinks: socialLinks };
}

function readPaymentMethodCodes(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.some(function(code) { return !STORE_PAYMENT_METHOD_CODES.includes(code); })
  ) {
    return null;
  }

  // 重複を除き、定義順に並べる。
  return STORE_PAYMENT_METHOD_CODES.filter(function(code) {
    return value.includes(code);
  });
}

// 許可された一覧のcodeだけを受け付け、重複を除いて一覧の順に並べる。
// undefined/null は「送られてこなかった」(=保存済みの値を変えない)としてundefinedを返す。
// 新項目を知らない古い画面から保存されても、既存の値を消さないため。
function readOptionalCodeList(value, allowedCodes) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.some(function(code) { return !allowedCodes.includes(code); })
  ) {
    return null;
  }

  return allowedCodes.filter(function(code) {
    return value.includes(code);
  });
}

// クライアントから受け取ってよい項目だけを読む。status・storeName・所在地・
// revision等の値は、送られてきても使わない。
export function validateStoreProfileInput(body) {
  const categoryCode = typeof body.categoryCode === "string" ? body.categoryCode : "";

  if (!STORE_CATEGORY_CODES.includes(categoryCode)) {
    return { ok: false, field: "categoryCode" };
  }

  const description = readMultilineText(body.description, STORE_DESCRIPTION_MAX_LENGTH);

  if (description === null) {
    return { ok: false, field: "description" };
  }

  const hours = readBusinessHours(body.businessHours);

  if (!hours.ok) {
    return hours;
  }

  const phone = validateImadakePhone(body.phone);

  if (phone === null) {
    return { ok: false, field: "phone" };
  }

  const websiteUrl = validateImadakeUrl(body.websiteUrl);

  if (websiteUrl === null) {
    return { ok: false, field: "websiteUrl" };
  }

  const reservationUrl = validateImadakeUrl(body.reservationUrl);

  if (reservationUrl === null) {
    return { ok: false, field: "reservationUrl" };
  }

  const social = readSocialLinks(body.socialLinks);

  if (!social.ok) {
    return social;
  }

  const paymentMethodCodes = readPaymentMethodCodes(body.paymentMethodCodes);

  if (paymentMethodCodes === null) {
    return { ok: false, field: "paymentMethodCodes" };
  }

  const featureCodes = readOptionalCodeList(body.featureCodes, STORE_FEATURE_CODES);

  if (featureCodes === null) {
    return { ok: false, field: "featureCodes" };
  }

  const supportedLanguageCodes = readOptionalCodeList(body.supportedLanguageCodes, STORE_LANGUAGE_CODES);

  if (supportedLanguageCodes === null) {
    return { ok: false, field: "supportedLanguageCodes" };
  }

  // 送られてこなかった項目は保存対象に含めない(保存はmergeのため既存値が残る)。
  const optionalFields = {};

  if (featureCodes !== undefined) {
    optionalFields.featureCodes = featureCodes;
  }

  if (supportedLanguageCodes !== undefined) {
    optionalFields.supportedLanguageCodes = supportedLanguageCodes;
  }

  return {
    ok: true,
    fields: Object.assign({
      categoryCode: categoryCode,
      description: description,
      businessHours: hours.businessHours,
      phone: phone,
      websiteUrl: websiteUrl,
      reservationUrl: reservationUrl,
      socialLinks: social.socialLinks,
      paymentMethodCodes: paymentMethodCodes
    }, optionalFields)
  };
}

function readStoreId(body) {
  const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";

  return storeId !== "" && storeId.length <= 100 && /^[A-Za-z0-9_-]+$/.test(storeId)
    ? storeId
    : "";
}

function isActiveOwner(memberData, uid, storeId) {
  return (
    !!memberData &&
    memberData.uid === uid &&
    memberData.storeId === storeId &&
    memberData.role === "owner" &&
    memberData.status === "active"
  );
}

function isEditableStore(accountData) {
  return (
    !!accountData &&
    accountData.registrationStatus === "active" &&
    accountData.enabled === true
  );
}

function readRegistrationStatusForDisplay(accountData) {
  if (accountData.enabled !== true && accountData.registrationStatus === "active") {
    return "suspended";
  }

  return typeof accountData.registrationStatus === "string" ? accountData.registrationStatus : "active";
}

function readRevision(profileData) {
  return profileData && Number.isInteger(profileData.revision) ? profileData.revision : 0;
}

function buildProfileResponse(profileData) {
  const data = profileData || {};

  return {
    status: typeof data.status === "string" ? data.status : "draft",
    revision: readRevision(data),
    categoryCode: typeof data.categoryCode === "string" ? data.categoryCode : "",
    sourceLanguage: typeof data.sourceLanguage === "string" ? data.sourceLanguage : "ja",
    description: typeof data.description === "string" ? data.description : "",
    businessHours: data.businessHours && typeof data.businessHours === "object" ? data.businessHours : null,
    phone: typeof data.phone === "string" ? data.phone : "",
    websiteUrl: typeof data.websiteUrl === "string" ? data.websiteUrl : "",
    reservationUrl: typeof data.reservationUrl === "string" ? data.reservationUrl : "",
    socialLinks: Array.isArray(data.socialLinks) ? data.socialLinks : [],
    paymentMethodCodes: Array.isArray(data.paymentMethodCodes) ? data.paymentMethodCodes : [],
    featureCodes: Array.isArray(data.featureCodes) ? data.featureCodes : [],
    supportedLanguageCodes: Array.isArray(data.supportedLanguageCodes) ? data.supportedLanguageCodes : [],
    photos: readStoredPhotos(data).map(function(photo) {
      return { url: photo.url, publicId: photo.publicId };
    }),
    updatedAtMillis:
      data.updatedAt && typeof data.updatedAt.toMillis === "function" ? data.updatedAt.toMillis() : 0
  };
}

// 保存時のModeration対象の文章(紹介文＋営業時間の補足)。保存済みの moderatedText と
// 同じ組み立て方で比べるため、保存処理と公開条件の確認の両方でこの関数を使う。
function buildProfileModerationText(description, businessHours) {
  return [description, businessHours && typeof businessHours === "object" ? businessHours.note : ""]
    .filter(Boolean)
    .join("\n");
}

async function callTextModeration(storeName, text, deps) {
  const results = await deps.callOpenAiModeration(
    deps.buildModerationInput({ shopName: storeName, title: "", content: text })
  );

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("moderation response was empty");
  }

  return !results.every(function(result) { return result && result.flagged === false; });
}

// 紹介文・営業時間の補足をModerationにかける。flagged → 保存しない、
// Moderationが使えない → 例外(呼び出し元は保存せず503)。
async function moderateProfileText(storeName, fields, deps) {
  const text = buildProfileModerationText(fields.description, fields.businessHours);

  if (text === "") {
    return { flagged: false, text: "" };
  }

  return {
    flagged: await callTextModeration(storeName, text, deps),
    text: text
  };
}


// ===== Phase 2D｜旅行者への公開・非公開 =====
// storeProfiles.status は "draft"(非公開) と "published"(公開) の2つだけ。
// 公開中でも、下の公開条件を1つでも満たさなくなった店舗は旅行者に表示しない
// (表示側でも同じ関数で毎回確認する。条件を直せば、操作なしで表示に戻る)。

// 初回リリースで旅行者に公開できる国。タイムゾーン・海外住所・地域検索を整えたら、
// ここに国codeを足すだけで広げられる(国ごとの分岐はここ以外に作らない)。
export const STORE_PUBLISH_COUNTRY_CODES = ["JP"];

// 公開条件(画面の確認リストもこの順で表示する)。
export const STORE_PUBLISH_CONDITION_CODES = [
  "photo",
  "description",
  "moderation",
  "owner",
  "store_active",
  "location",
  "country",
  "duplicates"
];

// 公開条件の判定に使う紐付け(storeListingLinks)。重複候補のうち運営無料掲載
// (source:"submissions")は、その無料掲載がこの店舗へ有効に紐付いていれば解決済みとする。
// それ以外(他の店舗アカウントとの重複など)は今のデータでは解決済みと判定できないため、
// 安全側で未解決のままにする。
async function readResolvedDuplicateListingIds(database, storeId, account, transaction) {
  const candidates = Array.isArray(account && account.duplicateCandidates) ? account.duplicateCandidates : [];
  const listingIds = candidates
    .filter(function(candidate) {
      return candidate && candidate.source === "submissions" && typeof candidate.id === "string" && candidate.id !== "";
    })
    .map(function(candidate) { return candidate.id; });

  const resolved = new Set();

  for (const listingId of listingIds) {
    const linkRef = database.collection(STORE_LISTING_LINKS_COLLECTION).doc(listingId);
    const snapshot = transaction ? await transaction.get(linkRef) : await linkRef.get();
    const link = snapshot.exists ? snapshot.data() || {} : null;

    if (link && link.status === "active" && link.storeId === storeId) {
      resolved.add(listingId);
    }
  }

  return resolved;
}

function hasValidCoordinates(account) {
  return (
    typeof account.latitude === "number" &&
    typeof account.longitude === "number" &&
    Number.isFinite(account.latitude) &&
    Number.isFinite(account.longitude) &&
    Math.abs(account.latitude) <= 90 &&
    Math.abs(account.longitude) <= 180
  );
}

// 公開条件をすべて確認し、満たしていない条件codeの一覧を返す(空なら公開できる)。
// ownerActive：操作する本人が有効なownerか(公開・非公開の操作時に確認する)。
export function evaluateStorePublishConditions(input) {
  const account = input.account || {};
  const profile = input.profile || {};
  const resolvedListingIds = input.resolvedListingIds || new Set();
  const description = typeof profile.description === "string" ? profile.description.trim() : "";
  // 写真は公開時に再確認しない。Phase 2Cの保存時Moderationを通過した写真だけを数える。
  const passedPhotos = readStoredPhotos(profile).filter(function(photo) {
    return !!photo && typeof photo.url === "string" && photo.url !== "" && photo.moderationStatus === "passed";
  });
  const candidates = Array.isArray(account.duplicateCandidates) ? account.duplicateCandidates : [];

  const met = {
    photo: passedPhotos.length > 0,
    description: description !== "",
    moderation:
      profile.moderationStatus === "passed" &&
      typeof profile.moderatedText === "string" &&
      profile.moderatedText === buildProfileModerationText(profile.description, profile.businessHours),
    owner: input.ownerActive === true,
    store_active: isEditableStore(account),
    location: hasValidCoordinates(account),
    country: STORE_PUBLISH_COUNTRY_CODES.includes(account.countryCode),
    duplicates: candidates.every(function(candidate) {
      return !!candidate && candidate.source === "submissions" && resolvedListingIds.has(candidate.id);
    })
  };

  return STORE_PUBLISH_CONDITION_CODES.filter(function(code) {
    return met[code] !== true;
  });
}

function millisOf(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

// 画面用の公開状態。status は保存されている値、missing は今満たしていない条件。
function buildPublicationResponse(profile, missing) {
  const data = profile || {};

  return {
    status: data.status === "published" ? "published" : "draft",
    missing: missing,
    conditionCodes: STORE_PUBLISH_CONDITION_CODES,
    publishedAtMillis: millisOf(data.publishedAt)
  };
}

async function readPublicationForOwner(database, storeId, account, profile) {
  const resolvedListingIds = await readResolvedDuplicateListingIds(database, storeId, account, null);

  return buildPublicationResponse(profile, evaluateStorePublishConditions({
    account: account,
    profile: profile,
    ownerActive: true,
    resolvedListingIds: resolvedListingIds
  }));
}


// mode: storeProfileGet (POST、メール確認済み店舗アカウントの owner)
// 編集画面用に、常設店舗情報(draft)と表示専用の店名・所在地・登録状態を返す。
// 編集不可の店舗(運営確認中・却下・停止中)も、owner なら閲覧はできる(editable:false)。
export async function handleStoreProfileGet(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const storeId = readStoreId(deps.readRequestBody(request));

    if (storeId === "") {
      return sendError(response, 400, "invalid_input", { field: "storeId" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const snapshots = await Promise.all([
      database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + actor.uid).get(),
      database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get(),
      database.collection(STORE_PROFILES_COLLECTION).doc(storeId).get()
    ]);

    // 他人の店舗・存在しない店舗は区別せず同じ応答にする(存在有無を漏らさない)。
    if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), actor.uid, storeId) || !snapshots[1].exists) {
      return sendError(response, 404, "store_not_found");
    }

    const account = snapshots[1].data() || {};
    const profileData = snapshots[2].exists ? snapshots[2].data() || {} : {};
    const publication = await readPublicationForOwner(database, storeId, account, profileData);

    return response.status(200).json({
      success: true,
      storeId: storeId,
      storeName: typeof account.storeName === "string" ? account.storeName : "",
      registrationStatus: readRegistrationStatusForDisplay(account),
      editable: isEditableStore(account),
      location: {
        countryCode: account.countryCode || "",
        prefecture: account.prefecture || "",
        city: account.city || "",
        formattedAddress: account.locationFormattedAddress || account.address || ""
      },
      profile: buildProfileResponse(snapshots[2].exists ? snapshots[2].data() : null),
      // Phase 2D｜旅行者への公開状態と、満たしていない公開条件。
      publication: publication,
      // 編集画面はこの一覧から選択肢を作る(許可codeをサーバーと一致させる)。
      options: {
        featureCodes: STORE_FEATURE_CODES,
        supportedLanguageCodes: STORE_LANGUAGE_CODES,
        photosMax: STORE_PHOTOS_MAX
      }
    });
  } catch (error) {
    console.error("常設店舗情報：取得エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// mode: storeProfileUpdate (POST、メール確認済み店舗アカウントの owner、編集可能な店舗のみ)
// { storeId, expectedRevision, categoryCode, description, businessHours, phone,
//   websiteUrl, reservationUrl, socialLinks, paymentMethodCodes }
// expectedRevisionが保存済みのrevisionと違う場合は上書きせず409(revision_conflict)。
export async function handleStoreProfileUpdate(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const body = deps.readRequestBody(request);
    const storeId = readStoreId(body);

    if (storeId === "") {
      return sendError(response, 400, "invalid_input", { field: "storeId" });
    }

    if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) {
      return sendError(response, 400, "invalid_input", { field: "expectedRevision" });
    }

    const input = validateStoreProfileInput(body);

    if (!input.ok) {
      return sendError(response, 400, "invalid_input", { field: input.field });
    }

    // Phase 2C｜写真。送られてこなければ保存済みの写真を変えない(undefined)。
    const photosInput = readStorePhotos(body.photos, storeId);

    if (photosInput === null) {
      return sendError(response, 400, "invalid_input", { field: "photos" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const memberRef = database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + actor.uid);
    const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
    const profileRef = database.collection(STORE_PROFILES_COLLECTION).doc(storeId);

    // Moderation(外部API)の前に、権限と編集可否を確認しておく(無駄な呼び出しを防ぐ)。
    const preSnapshots = await Promise.all([memberRef.get(), accountRef.get(), profileRef.get()]);

    if (!preSnapshots[0].exists || !isActiveOwner(preSnapshots[0].data(), actor.uid, storeId) || !preSnapshots[1].exists) {
      return sendError(response, 404, "store_not_found");
    }

    const accountBefore = preSnapshots[1].data() || {};

    if (!isEditableStore(accountBefore)) {
      return sendError(response, 403, "store_not_editable", {
        registrationStatus: readRegistrationStatusForDisplay(accountBefore)
      });
    }

    const profileBefore = preSnapshots[2].exists ? preSnapshots[2].data() || {} : {};

    if (readRevision(profileBefore) !== body.expectedRevision) {
      return sendError(response, 409, "revision_conflict", { currentRevision: readRevision(profileBefore) });
    }

    const allowed = await deps.claimRateLimit(
      database,
      STORE_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeProfileUpdate", actor.uid),
      STORE_PROFILE_UPDATE_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    // 文章が前回の確認済みの内容から変わった時だけModerationを呼ぶ。
    const moderationTextBefore =
      typeof profileBefore.moderatedText === "string" ? profileBefore.moderatedText : null;
    const nextText = buildProfileModerationText(input.fields.description, input.fields.businessHours);
    let moderationUpdate = {};

    if (nextText !== moderationTextBefore) {
      let moderation;

      try {
        moderation = await moderateProfileText(accountBefore.storeName || "", input.fields, deps);
      } catch (moderationError) {
        console.error(
          "常設店舗情報：Moderationエラー：",
          deps.classifyModerationError(moderationError)
        );
        return sendError(response, 503, "safety_check_unavailable");
      }

      if (moderation.flagged) {
        return sendError(response, 400, "content_not_allowed");
      }

      moderationUpdate = {
        moderationStatus: "passed",
        moderatedText: moderation.text,
        moderationCheckedAt: FieldValue.serverTimestamp()
      };
    }

    // Phase 2C｜新しく追加された写真だけをModerationにかける(確認済みの写真は、
    // 並べ替え・削除だけの保存では再確認しない)。
    let photosUpdate = {};

    if (photosInput !== undefined) {
      const storedPhotos = readStoredPhotos(profileBefore);
      const storedById = new Map(storedPhotos.map(function(photo) { return [photo.publicId, photo]; }));
      const newPhotos = photosInput.filter(function(photo) { return !storedById.has(photo.publicId); });

      if (newPhotos.length > 0) {
        let flagged;

        try {
          flagged = await moderateNewPhotos(newPhotos, deps);
        } catch (moderationError) {
          console.error(
            "店舗写真：Moderationエラー：",
            deps.classifyModerationError(moderationError)
          );
          // 原因調査用(Phase 2C Preview)｜HTTP statusと安全な識別子だけを残す
          // (画像URL・エラー本文・秘密値・個人情報は出さない)。
          console.error(
            "店舗写真：Moderationエラー詳細：",
            describeModerationErrorForLog(moderationError, newPhotos.length)
          );
          // 写真は店舗専用フォルダーに残る(再保存時にアップロードし直さずに使えるよう削除しない)。
          return sendError(response, 503, "safety_check_unavailable");
        }

        if (flagged) {
          // 掲載できない可能性がある写真は保存せず、今回新しく上げた写真の実体を削除する
          // (どれもこの店舗の専用フォルダーの、まだ保存されていない写真)。
          await deleteStorePhotos(
            storeId,
            newPhotos.map(function(photo) { return photo.publicId; }),
            deps,
            "moderation_rejected"
          );
          return sendError(response, 400, "photo_not_allowed");
        }
      }

      photosUpdate = {
        photos: photosInput.map(function(photo) {
          const stored = storedById.get(photo.publicId);

          return {
            url: photo.url,
            publicId: photo.publicId,
            moderationStatus: stored && stored.moderationStatus ? stored.moderationStatus : "passed"
          };
        })
      };
    }

    let outcome = null;
    let previousPhotos = [];
    let savedAccount = null;
    let savedProfile = null;

    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([
        transaction.get(memberRef),
        transaction.get(accountRef),
        transaction.get(profileRef)
      ]);

      if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), actor.uid, storeId) || !snapshots[1].exists) {
        outcome = { status: 404, reason: "store_not_found" };
        return;
      }

      if (!isEditableStore(snapshots[1].data())) {
        outcome = { status: 403, reason: "store_not_editable" };
        return;
      }

      const profileData = snapshots[2].exists ? snapshots[2].data() || {} : {};
      const currentRevision = readRevision(profileData);

      if (currentRevision !== body.expectedRevision) {
        outcome = { status: 409, reason: "revision_conflict", currentRevision: currentRevision };
        return;
      }

      const nextRevision = currentRevision + 1;
      previousPhotos = readStoredPhotos(profileData);

      // statusは保存済みの値をそのまま引き継ぐ(公開中の店舗は公開中のまま、内容だけ更新する。
      // 公開・非公開は storeProfilePublish / storeProfileUnpublish だけが変える)。
      // storeId・店名・所在地は書き換えない。
      savedAccount = snapshots[1].data() || {};
      savedProfile = Object.assign({}, profileData, input.fields, moderationUpdate, photosUpdate);
      transaction.set(
        profileRef,
        Object.assign(
          {
            storeId: storeId,
            status: typeof profileData.status === "string" ? profileData.status : "draft",
            revision: nextRevision,
            updatedByUid: actor.uid,
            updatedAt: FieldValue.serverTimestamp()
          },
          input.fields,
          moderationUpdate,
          photosUpdate
        ),
        { merge: true }
      );

      outcome = { status: 200, revision: nextRevision };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason,
        outcome.currentRevision !== undefined ? { currentRevision: outcome.currentRevision } : undefined);
    }

    // Phase 2C｜保存が成功した後に、外した写真の実体をCloudinaryから削除する。
    // 対象は「保存前にこの店舗の写真として登録されていて、今回外された、
    // この店舗の専用フォルダーの画像」だけ。失敗しても保存は巻き戻さない(ログに残す)。
    let photoCleanup = { requested: 0, failed: 0 };

    if (photosUpdate.photos) {
      const keptIds = new Set(photosUpdate.photos.map(function(photo) { return photo.publicId; }));
      const removedIds = previousPhotos
        .map(function(photo) { return photo.publicId; })
        .filter(function(publicId) { return !keptIds.has(publicId); });

      photoCleanup = await deleteStorePhotos(storeId, removedIds, deps, "removed_from_profile");
    }

    // 保存後の公開状態(公開中の店舗が条件を満たさなくなった場合も、画面で分かるようにする)。
    const publication = await readPublicationForOwner(database, storeId, savedAccount, savedProfile);

    return response.status(200).json({
      success: true,
      revision: outcome.revision,
      photos: photosUpdate.photos
        ? photosUpdate.photos.map(function(photo) { return { url: photo.url, publicId: photo.publicId }; })
        : undefined,
      photoCleanup: photoCleanup,
      status: publication.status,
      publication: publication
    });
  } catch (error) {
    console.error("常設店舗情報：保存エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// mode: storeProfilePublish (POST、メール確認済み店舗アカウントの owner)
// { storeId, expectedRevision }
// 画面の判定は信用せず、サーバーで公開条件をすべて確認し直す。条件を満たしていれば、
// 店名＋紹介文をModerationにかけ(写真は保存時の確認結果を使い、再確認しない)、
// 通過した場合だけ status を "published" にする。内容(revision)は変えない。
export async function handleStoreProfilePublish(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const body = deps.readRequestBody(request);
    const storeId = readStoreId(body);

    if (storeId === "") {
      return sendError(response, 400, "invalid_input", { field: "storeId" });
    }

    if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) {
      return sendError(response, 400, "invalid_input", { field: "expectedRevision" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const memberRef = database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + actor.uid);
    const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
    const profileRef = database.collection(STORE_PROFILES_COLLECTION).doc(storeId);

    const preSnapshots = await Promise.all([memberRef.get(), accountRef.get(), profileRef.get()]);

    // 他人の店舗・存在しない店舗は区別せず同じ応答にする(保存・取得と同じ)。
    if (!preSnapshots[0].exists || !isActiveOwner(preSnapshots[0].data(), actor.uid, storeId) || !preSnapshots[1].exists) {
      return sendError(response, 404, "store_not_found");
    }

    const accountBefore = preSnapshots[1].data() || {};
    const profileBefore = preSnapshots[2].exists ? preSnapshots[2].data() || {} : {};

    // 画面に表示していた内容(revision)と保存済みの内容が違えば公開しない。
    if (readRevision(profileBefore) !== body.expectedRevision) {
      return sendError(response, 409, "revision_conflict", { currentRevision: readRevision(profileBefore) });
    }

    const missingBefore = evaluateStorePublishConditions({
      account: accountBefore,
      profile: profileBefore,
      ownerActive: true,
      resolvedListingIds: await readResolvedDuplicateListingIds(database, storeId, accountBefore, null)
    });

    if (missingBefore.length > 0) {
      return sendError(response, 409, "publish_conditions_not_met", { missing: missingBefore });
    }

    const allowed = await deps.claimRateLimit(
      database,
      STORE_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeProfilePublish", actor.uid),
      STORE_PROFILE_UPDATE_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    // 公開時の確認：旅行者に見せる店名と紹介文。セルフ登録時の店名はまだ確認していないため、
    // 保存時の確認(moderatedTextとの一致)とは別に、ここで1回だけ確認する(文章のみ・画像なし)。
    let flagged;

    try {
      flagged = await callTextModeration(
        typeof accountBefore.storeName === "string" ? accountBefore.storeName : "",
        typeof profileBefore.description === "string" ? profileBefore.description : "",
        deps
      );
    } catch (moderationError) {
      console.error(
        "常設店舗の公開：Moderationエラー：",
        deps.classifyModerationError(moderationError)
      );
      return sendError(response, 503, "safety_check_unavailable");
    }

    if (flagged) {
      return sendError(response, 400, "content_not_allowed");
    }

    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([
        transaction.get(memberRef),
        transaction.get(accountRef),
        transaction.get(profileRef)
      ]);

      if (!snapshots[0].exists || !snapshots[1].exists) {
        outcome = { status: 404, reason: "store_not_found" };
        return;
      }

      const account = snapshots[1].data() || {};
      const profile = snapshots[2].exists ? snapshots[2].data() || {} : {};

      // Moderation中に内容が保存し直された場合は、確認した内容と違うので公開しない。
      if (readRevision(profile) !== body.expectedRevision) {
        outcome = { status: 409, reason: "revision_conflict", currentRevision: readRevision(profile) };
        return;
      }

      // 店名が確認中に変わった場合も、確認した店名と違うので公開しない。
      if (account.storeName !== accountBefore.storeName) {
        outcome = { status: 409, reason: "revision_conflict", currentRevision: readRevision(profile) };
        return;
      }

      const missing = evaluateStorePublishConditions({
        account: account,
        profile: profile,
        ownerActive: isActiveOwner(snapshots[0].data(), actor.uid, storeId),
        resolvedListingIds: await readResolvedDuplicateListingIds(database, storeId, account, transaction)
      });

      if (missing.length > 0) {
        outcome = { status: 409, reason: "publish_conditions_not_met", missing: missing };
        return;
      }

      if (profile.status !== "published") {
        transaction.update(profileRef, {
          status: "published",
          publishedAt: FieldValue.serverTimestamp(),
          publishedByUid: actor.uid
        });
      }

      outcome = { status: 200 };
    });

    if (outcome.status !== 200) {
      const extra = {};

      if (outcome.currentRevision !== undefined) {
        extra.currentRevision = outcome.currentRevision;
      }

      if (outcome.missing) {
        extra.missing = outcome.missing;
      }

      return sendError(response, outcome.status, outcome.reason, extra);
    }

    const profileAfter = await profileRef.get();

    return response.status(200).json({
      success: true,
      status: "published",
      publication: await readPublicationForOwner(
        database,
        storeId,
        accountBefore,
        profileAfter.exists ? profileAfter.data() || {} : {}
      )
    });
  } catch (error) {
    console.error("常設店舗の公開：エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// mode: storeProfileUnpublish (POST、メール確認済み店舗アカウントの owner)
// { storeId }
// status を "draft" に戻す。店舗が運営確認中・停止中でも、owner本人なら非公開にはできる。
// 内容(revision)は変えない。
export async function handleStoreProfileUnpublish(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const storeId = readStoreId(deps.readRequestBody(request));

    if (storeId === "") {
      return sendError(response, 400, "invalid_input", { field: "storeId" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const memberRef = database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + actor.uid);
    const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
    const profileRef = database.collection(STORE_PROFILES_COLLECTION).doc(storeId);

    let outcome = null;
    let account = {};

    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([
        transaction.get(memberRef),
        transaction.get(accountRef),
        transaction.get(profileRef)
      ]);

      if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), actor.uid, storeId) || !snapshots[1].exists) {
        outcome = { status: 404, reason: "store_not_found" };
        return;
      }

      account = snapshots[1].data() || {};
      const profile = snapshots[2].exists ? snapshots[2].data() || {} : null;

      if (profile && profile.status === "published") {
        transaction.update(profileRef, {
          status: "draft",
          unpublishedAt: FieldValue.serverTimestamp(),
          unpublishedByUid: actor.uid
        });
      }

      outcome = { status: 200 };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason);
    }

    const profileAfter = await profileRef.get();

    return response.status(200).json({
      success: true,
      status: "draft",
      publication: await readPublicationForOwner(
        database,
        storeId,
        account,
        profileAfter.exists ? profileAfter.data() || {} : {}
      )
    });
  } catch (error) {
    console.error("常設店舗の非公開：エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// ===== Phase 2D STEP 3｜旅行者向けの正式店舗プロフィール一覧(読み取り専用) =====
// GET /api/moderate-submission?mode=publicStoreProfiles (認証不要、CDN共有キャッシュ対象)
// 既存の公開submissions一覧とは別のmodeで、互いに影響しない(こちらが失敗しても、
// 無料掲載の一覧はこれまでどおり返る)。submissionsは読まず、書き込みも一切しない。
//
// 返すのは、status:"published" で、返す直前の確認でも公開条件をすべて満たす店舗だけ
// (公開中のままでも、条件を満たさなくなった店舗は返さない)。owner条件は公開操作をする
// 本人の確認のため、ここでは対象外(運営による停止は store_active で反映される)。
//
// suppressedListingIds：有効な紐付け(storeListingLinks)があり、紐付け先の正式店舗を
// 今回返している場合だけ、その運営無料掲載の submission ID を入れる。画面側で同じ店舗が
// 2枚並ばないようにするための情報(STEP 3では画面からはまだ使わない)。

export const PUBLIC_STORE_ID_PREFIX = "sp_";
export const PUBLIC_STORE_LISTING_TYPE = "store_profile";

function readPublicText(value) {
  return typeof value === "string" ? value : "";
}

function readPublicCodes(value, allowedCodes) {
  return Array.isArray(value)
    ? allowedCodes.filter(function(code) { return value.includes(code); })
    : [];
}

function readPublicBusinessHours(value) {
  if (!value || typeof value !== "object" || !value.weekly || typeof value.weekly !== "object") {
    return null;
  }

  const weekly = {};

  STORE_WEEKDAY_CODES.forEach(function(day) {
    const ranges = Array.isArray(value.weekly[day]) ? value.weekly[day] : [];

    weekly[day] = ranges
      .filter(function(range) {
        return range && typeof range.open === "string" && typeof range.close === "string";
      })
      .map(function(range) {
        return { open: range.open, close: range.close };
      });
  });

  return { weekly: weekly, note: readPublicText(value.note) };
}

// 旅行者に返す項目の許可リスト(allowlist)。ここに書いた項目以外は一切返さない。
// 返さないもの：uid・メール・メンバー/権限・duplicateCandidates・Moderationの記録・
// 写真のpublicId・公開/非公開の監査記録・revision・登録経緯(createdBy*/source*)・
// 店舗が入力した住所文字列(address)・geohash等の管理用項目。
// 電話・予約・SNS・対応言語は、詳細表示を広げる時に改めて追加を判断する。
function buildPublicStoreProfile(storeId, account, profile) {
  return {
    id: PUBLIC_STORE_ID_PREFIX + storeId,
    listingType: PUBLIC_STORE_LISTING_TYPE,
    storeName: readPublicText(account.storeName),
    categoryCode: STORE_CATEGORY_CODES.includes(profile.categoryCode) ? profile.categoryCode : "other",
    description: readPublicText(profile.description).trim(),
    sourceLanguage: readPublicText(profile.sourceLanguage),
    photos: readStoredPhotos(profile)
      .filter(function(photo) {
        return (
          !!photo &&
          photo.moderationStatus === "passed" &&
          typeof photo.url === "string" &&
          photo.url.indexOf(STORE_PHOTO_CLOUDINARY_PREFIX) === 0
        );
      })
      .map(function(photo) {
        return { url: photo.url };
      }),
    location: {
      countryCode: readPublicText(account.countryCode),
      prefecture: readPublicText(account.prefecture),
      city: readPublicText(account.city),
      formattedAddress: readPublicText(account.locationFormattedAddress),
      latitude: account.latitude,
      longitude: account.longitude
    },
    businessHours: readPublicBusinessHours(profile.businessHours),
    websiteUrl: readPublicText(profile.websiteUrl),
    paymentMethodCodes: readPublicCodes(profile.paymentMethodCodes, STORE_PAYMENT_METHOD_CODES),
    featureCodes: readPublicCodes(profile.featureCodes, STORE_FEATURE_CODES)
  };
}

export async function handlePublicStoreProfilesList(request, response, deps) {
  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const snapshots = await Promise.all([
      database.collection(STORE_PROFILES_COLLECTION).where("status", "==", "published").get(),
      database.collection(STORE_LISTING_LINKS_COLLECTION).where("status", "==", "active").get()
    ]);
    const profileDocs = snapshots[0].docs;

    // storeId → 有効に紐付いている運営無料掲載のsubmission ID(文書ID)
    const linkedListingIdsByStore = new Map();

    snapshots[1].docs.forEach(function(documentSnapshot) {
      const link = documentSnapshot.data() || {};

      if (link.status !== "active" || typeof link.storeId !== "string" || link.storeId === "") {
        return;
      }

      if (!linkedListingIdsByStore.has(link.storeId)) {
        linkedListingIdsByStore.set(link.storeId, []);
      }

      linkedListingIdsByStore.get(link.storeId).push(documentSnapshot.id);
    });

    const accountSnapshots = await Promise.all(profileDocs.map(function(documentSnapshot) {
      return database.collection(STORE_ACCOUNTS_COLLECTION).doc(documentSnapshot.id).get();
    }));

    const stores = [];
    const suppressedListingIds = new Set();

    profileDocs.forEach(function(documentSnapshot, index) {
      const storeId = documentSnapshot.id;

      // 1店舗のデータが壊れていても、他の店舗の表示は止めない(その店舗だけ返さない)。
      try {
        const profile = documentSnapshot.data() || {};
        const accountSnapshot = accountSnapshots[index];

        if (profile.status !== "published" || !accountSnapshot.exists) {
          return;
        }

        const account = accountSnapshot.data() || {};
        const linkedListingIds = linkedListingIdsByStore.get(storeId) || [];
        const missing = evaluateStorePublishConditions({
          account: account,
          profile: profile,
          ownerActive: true,
          resolvedListingIds: new Set(linkedListingIds)
        });

        if (missing.length > 0) {
          return;
        }

        stores.push(buildPublicStoreProfile(storeId, account, profile));
        linkedListingIds.forEach(function(listingId) {
          suppressedListingIds.add(listingId);
        });
      } catch (storeError) {
        console.error("旅行者向け店舗一覧：店舗の読み取りを飛ばしました：", storeId, storeError && storeError.message);
      }
    });

    stores.sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });

    // 成功時だけ、既存の公開submissions一覧と同じCDN共有キャッシュにする
    // (失敗時は呼び出し元で設定済みの no-store のまま)。
    response.setHeader("Cache-Control", deps.publicListCacheControl);

    return response.status(200).json({
      success: true,
      stores: stores,
      suppressedListingIds: Array.from(suppressedListingIds).sort()
    });
  } catch (error) {
    console.error("旅行者向け店舗一覧：取得エラー：", error && error.message);
    return response.status(500).json({
      success: false,
      message: "店舗情報を取得できませんでした。時間をおいて、もう一度お試しください。"
    });
  }
}
