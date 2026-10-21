// ==========================================================================
// STEP 42-D｜運営が先行掲載した店舗(submissions の常設店舗広告)の情報を、引き継いだ店主の店舗情報
// (storeProfiles)へ写す(代表決定 2026-10-21：運営掲載の文章・写真を店主の店舗プロフィールへ引き継ぐ)。
// ==========================================================================
// 写す項目(運営掲載 → 店舗情報)：
//   本文 content                             → 紹介文 description(最大1,000字)
//   営業時間 businessStartTime/EndTime・定休日 closedDays・不定休 irregularClosed
//                                            → 曜日ごとの営業時間 businessHours(定休日の曜日は空、不定休は補足に記載)
//   カテゴリ category                         → categoryCode(引き継ぎの申請と同じ対応表)
//   支払い方法 paymentMethods                  → paymentMethodCodes
//   テイクアウト takeout                       → featureCodes ["takeout"]
//   写真 imageUrls                             → photos(店舗専用の Cloudinary フォルダーへ複製。最大10枚)
// 写さない：情報元ページ websiteUrl(公式サイトとは限らないため)。運営掲載(submissions)は書き換えない。
// 紹介文の Moderation 済みの記録(moderatedText)は作らない(公開は店主が保存・公開する時の既存の確認を通す)。
// 写真の複製は Cloudinary への書き込みになるため、代表の承認があるまで止める(LISTING_PHOTO_COPY_ENABLED)。
// このファイルはVercel Functionではない。
// ==========================================================================

import {
  STORE_DESCRIPTION_MAX_LENGTH,
  STORE_PAYMENT_METHOD_CODES,
  STORE_PHOTOS_MAX,
  STORE_WEEKDAY_CODES,
  isStorePhotoPublicId
} from "./store-profile.js";

// 運営掲載の写真を店舗の写真フォルダーへ複製してよいか(Cloudinary への書き込み)。代表の承認があるまで false。
export const LISTING_PHOTO_COPY_ENABLED =
  false;

const LISTING_PHOTO_URL_PATTERN =
  /^https:\/\/res\.cloudinary\.com\/cdhyctnp\/image\/upload\/[A-Za-z0-9_\-./,]+\.(jpg|jpeg|png|webp)$/i;

const TIME_PATTERN =
  /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// 運営無料掲載のカテゴリ(日本語の内部値) → 常設店舗のカテゴリcode(引き継ぎの申請と同じ対応表)。
export const LISTING_CATEGORY_TO_CODE = {
  "グルメ": "gourmet",
  "カフェ": "cafe_sweets",
  "カフェ・スイーツ": "cafe_sweets",
  "ショッピング": "shopping",
  "観光・体験": "sightseeing_experience",
  "ナイトスポット": "nightlife",
  "居酒屋": "nightlife",
  "美容・リラクゼーション": "beauty_relaxation",
  "宿泊": "lodging"
};

function truncateText(text, maxLength) {
  const characters = Array.from(text);
  return characters.length > maxLength ? characters.slice(0, maxLength).join("") : text;
}

// 運営掲載の営業時間・定休日 → 曜日ごとの営業時間。開店・閉店が無ければ null(定休日だけは表せないため写さない)。
function buildBusinessHours(listing) {
  const start = typeof listing.businessStartTime === "string" ? listing.businessStartTime.trim() : "";
  const end = typeof listing.businessEndTime === "string" ? listing.businessEndTime.trim() : "";

  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || start === end) {
    return null;
  }

  const closedDays = Array.isArray(listing.closedDays) ? listing.closedDays : [];
  const weekly = {};

  STORE_WEEKDAY_CODES.forEach(function(day) {
    weekly[day] = closedDays.includes(day) ? [] : [{ open: start, close: end }];
  });

  return { weekly: weekly, note: listing.irregularClosed === true ? "不定休" : "" };
}

// 新しく作る店舗情報(draft)に写す項目。
export function buildProfileFieldsFromListing(listing, submissionId) {
  const source = listing && typeof listing === "object" ? listing : {};
  const content = typeof source.content === "string" ? source.content.trim() : "";
  const paymentMethods = Array.isArray(source.paymentMethods) ? source.paymentMethods : [];

  return {
    categoryCode: LISTING_CATEGORY_TO_CODE[source.category] || "other",
    description: truncateText(content, STORE_DESCRIPTION_MAX_LENGTH),
    businessHours: buildBusinessHours(source),
    paymentMethodCodes: STORE_PAYMENT_METHOD_CODES.filter(function(code) { return paymentMethods.includes(code); }),
    featureCodes: source.takeout === true ? ["takeout"] : [],
    copiedFromSubmissionId: submissionId
  };
}

// 既存の自店舗へつなぐ場合：店主がまだ入れていない(空の)項目だけを埋める(入力済みの内容は上書きしない)。
export function buildEmptyFieldFill(profile, fields) {
  const current = profile && typeof profile === "object" ? profile : {};
  const fill = {};

  if (!(typeof current.description === "string" && current.description.trim() !== "") && fields.description !== "") {
    fill.description = fields.description;
  }

  if (!current.businessHours && fields.businessHours) {
    fill.businessHours = fields.businessHours;
  }

  if (!(Array.isArray(current.paymentMethodCodes) && current.paymentMethodCodes.length > 0) && fields.paymentMethodCodes.length > 0) {
    fill.paymentMethodCodes = fields.paymentMethodCodes;
  }

  if (!Array.isArray(current.featureCodes) && fields.featureCodes.length > 0) {
    fill.featureCodes = fields.featureCodes;
  }

  if (Object.keys(fill).length > 0) {
    fill.copiedFromSubmissionId = fields.copiedFromSubmissionId;
  }

  return fill;
}

// 複製の元にできる運営掲載の写真(マチナウの Cloudinary の画像だけ、最大10枚)。
export function readListingPhotoSources(listing) {
  const urls = listing && Array.isArray(listing.imageUrls) ? listing.imageUrls : [];

  return urls
    .filter(function(url) { return typeof url === "string" && LISTING_PHOTO_URL_PATTERN.test(url); })
    .slice(0, STORE_PHOTOS_MAX);
}

// 運営掲載の写真を店舗の写真フォルダーへ複製し、店舗情報の写真がまだ無い時だけ保存する。
// options.enabled が true の時だけ実行(既定は LISTING_PHOTO_COPY_ENABLED)。失敗しても引き継ぎは成功のまま。
// 戻り値 { status: "disabled" | "no_photos" | "skipped_existing" | "copied" | "failed", copied }
export async function copyListingPhotosToProfile(database, storeId, listing, deps, options) {
  const enabled = options && typeof options.enabled === "boolean" ? options.enabled : LISTING_PHOTO_COPY_ENABLED;

  if (!enabled || !deps || typeof deps.copyListingPhotoToStore !== "function") {
    return { status: "disabled", copied: 0 };
  }

  const sources = readListingPhotoSources(listing);

  if (sources.length === 0) {
    return { status: "no_photos", copied: 0 };
  }

  const profileRef = database.collection("storeProfiles").doc(storeId);
  const before = await profileRef.get();
  const beforeData = before.exists ? before.data() || {} : null;

  if (!beforeData || (Array.isArray(beforeData.photos) && beforeData.photos.length > 0)) {
    return { status: "skipped_existing", copied: 0 };
  }

  const photos = [];

  for (const url of sources) {
    try {
      const copied = await deps.copyListingPhotoToStore(url, storeId);

      if (copied && typeof copied.url === "string" && isStorePhotoPublicId(copied.publicId, storeId)) {
        // 運営が掲載した画像の複製(運営掲載の時点で公開済み)。
        photos.push({ url: copied.url, publicId: copied.publicId, moderationStatus: "passed", source: "listing" });
      }
    } catch (error) {
      console.error("引き継ぎ：写真の複製エラー：", error && error.message);
    }
  }

  if (photos.length === 0) {
    return { status: "failed", copied: 0 };
  }

  const saved = await database.runTransaction(async function(transaction) {
    const current = await transaction.get(profileRef);
    const data = current.exists ? current.data() || {} : null;

    if (!data || (Array.isArray(data.photos) && data.photos.length > 0)) {
      return false;
    }

    transaction.set(profileRef, { photos: photos.slice(0, STORE_PHOTOS_MAX) }, { merge: true });
    return true;
  });

  return saved ? { status: "copied", copied: Math.min(photos.length, STORE_PHOTOS_MAX) } : { status: "skipped_existing", copied: 0 };
}
