// ==========================================================================
// 正式店舗参加基盤 Phase 2B｜店舗自身による常設店舗情報の作成・編集(サーバー側)
// ==========================================================================
// セルフ登録した店舗(Phase 2A)の owner が、storeProfiles/{storeId} の基本項目を
// 自分で入力・保存する。保存しても status は "draft" のままで、旅行者へは
// 一切公開しない(公開は2D)。店名・所在地は表示のみで、ここでは変更しない。
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
const STORE_PHOTO_MODERATION_BATCH_SIZE = 5;

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

// 新しく追加された写真だけをModerationにかける(最大5枚ずつ、並列)。
async function moderateNewPhotos(photos, deps) {
  const batches = [];

  for (let index = 0; index < photos.length; index += STORE_PHOTO_MODERATION_BATCH_SIZE) {
    batches.push(photos.slice(index, index + STORE_PHOTO_MODERATION_BATCH_SIZE));
  }

  const resultsPerBatch = await Promise.all(batches.map(function(batch) {
    return deps.callOpenAiModeration(
      deps.buildModerationInput({
        imageUrls: batch.map(function(photo) { return photo.url; })
      })
    );
  }));

  for (const results of resultsPerBatch) {
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error("moderation response was empty");
    }
  }

  return resultsPerBatch.some(function(results) {
    return !results.every(function(result) { return result && result.flagged === false; });
  });
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

// 紹介文・営業時間の補足をModerationにかける。flagged → 保存しない、
// Moderationが使えない → 例外(呼び出し元は保存せず503)。
async function moderateProfileText(storeName, fields, deps) {
  const text = [fields.description, fields.businessHours ? fields.businessHours.note : ""]
    .filter(Boolean)
    .join("\n");

  if (text === "") {
    return { flagged: false, text: "" };
  }

  const results = await deps.callOpenAiModeration(
    deps.buildModerationInput({ shopName: storeName, title: "", content: text })
  );

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("moderation response was empty");
  }

  return {
    flagged: !results.every(function(result) { return result && result.flagged === false; }),
    text: text
  };
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
    const nextText = [input.fields.description, input.fields.businessHours ? input.fields.businessHours.note : ""]
      .filter(Boolean)
      .join("\n");
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

      // statusは "draft" のまま(公開は2D)。storeId・店名・所在地は書き換えない。
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

    return response.status(200).json({
      success: true,
      revision: outcome.revision,
      photos: photosUpdate.photos
        ? photosUpdate.photos.map(function(photo) { return { url: photo.url, publicId: photo.publicId }; })
        : undefined,
      photoCleanup: photoCleanup,
      status: "draft"
    });
  } catch (error) {
    console.error("常設店舗情報：保存エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
