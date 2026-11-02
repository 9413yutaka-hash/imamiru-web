// STEP 55｜一般利用者の投稿(post.html がブラウザから Firestore の submissions に直接作る)の安全対策。
// ・受け付ける項目は post.html が実際に送る項目だけ(許可の一覧)。運営用の項目(isPermanentAd・postType・
//   authorType・sourceType・operatorUid・aiReviewStatus 等)は一覧に無いため、付いていれば拒否する。
// ・掲載時間は画面の選択肢 3・6・12・24 時間だけ(今だけ投稿の24時間固定とは別の仕組み)。
// 同じ一覧を firestore.rules(作成の許可)・admin.html(運営の手動承認)・試験でも使う。変える時は3か所をそろえる。
export const PUBLIC_SUBMISSION_ALLOWED_FIELDS = Object.freeze([
  "shopName",
  "title",
  "category",
  "durationHours",
  "expiresAt",
  "content",
  "address",
  "latitude",
  "longitude",
  "websiteUrl",
  "businessStartTime",
  "businessEndTime",
  "isOpen24Hours",
  "takeout",
  "paymentMethods",
  "imageUrls",
  "imagePublicIds",
  "images",
  "submissionType",
  "status",
  "publicationNumber",
  "endCodeHash",
  "createdAt",
  "updatedAt",
  "source",
  "version"
]);

export const PUBLIC_SUBMISSION_DURATION_HOURS = Object.freeze([3, 6, 12, 24]);

// 自動審査が投稿の後に書き足す項目。審査をやり直す時に、これらがあっても混入とは扱わない。
const PUBLIC_SUBMISSION_REVIEW_FIELDS = Object.freeze([
  "aiReviewStatus",
  "aiReviewReason",
  "aiReviewedAt",
  "aiReviewVersion"
]);

export function isAllowedPublicSubmissionDurationHours(value) {
  return typeof value === "number" && PUBLIC_SUBMISSION_DURATION_HOURS.includes(value);
}

// 許可の一覧に無い項目の名前を返す(無ければ空の配列)。
export function findDisallowedPublicSubmissionFields(data) {
  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.keys(data).filter(function(key) {
    return !PUBLIC_SUBMISSION_ALLOWED_FIELDS.includes(key) && !PUBLIC_SUBMISSION_REVIEW_FIELDS.includes(key);
  });
}

// 一般投稿として受け付けてよいか。ok:false の時は reason(disallowed_fields / invalid_duration)を返す。
export function checkPublicSubmission(data) {
  const disallowedFields = findDisallowedPublicSubmissionFields(data);

  if (disallowedFields.length > 0) {
    return { ok: false, reason: "disallowed_fields", fields: disallowedFields };
  }

  if (!isAllowedPublicSubmissionDurationHours(data && data.durationHours)) {
    return { ok: false, reason: "invalid_duration", fields: [] };
  }

  return { ok: true, reason: "", fields: [] };
}

// STEP 55｜運営(代表)の判定。サーバーで検証した ID トークンのメールが ADMIN_EMAIL と一致(大文字小文字は区別しない)し、
// かつメール確認済みの時だけ運営とみなす。Firestore のルールの isAdmin() と同じ条件。
export function isVerifiedAdminToken(decodedToken, adminEmail) {
  const expected = typeof adminEmail === "string" ? adminEmail.trim().toLowerCase() : "";

  if (expected === "" || !decodedToken || typeof decodedToken !== "object") {
    return false;
  }

  const email = typeof decodedToken.email === "string" ? decodedToken.email.trim().toLowerCase() : "";

  return email !== "" && email === expected && decodedToken.email_verified === true;
}
