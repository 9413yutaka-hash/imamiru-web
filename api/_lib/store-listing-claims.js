// ==========================================================================
// 運営無料掲載 → 店舗オーナー化 MVP-1(サーバー側)
// ==========================================================================
// マチナウ運営が先に無料掲載した店舗(submissions の運営常設掲載)を、後から本当の
// 店舗が自分の店舗として引き継ぐ。初期MVPでは自動の本人確認は行わず、全件
//   店舗アカウントから申請 → マチナウ運営が確認 → 承認／却下
// とする。本人確認の本体は「申請者とは独立した店舗の公式連絡先(公式サイト・公式SNS・
// 地図サービスの店舗情報等)の管理者から、その申請を承認する回答を得たこと」。
// 申請コード(claimCode)は、どの申請について確認しているかを照合するための番号で、
// それ自体を本人証明とはしない。メール確認・カード・店名一致・位置の近さ・
// 申請者が入力した連絡先は、本人確認として扱わない。
//
// 作成・更新するデータ(すべてサーバーのAdmin SDKだけが読み書きする)
//   storeListingClaims/{claimId}       申請(履歴として残す。削除しない)
//   storeListingLinks/{submissionId}   紐付け。文書ID＝無料掲載のID。
//                                      「1つの無料掲載に有効な紐付けは1つ」を
//                                      文書IDとtransactionで保証する
// submissions(運営無料掲載)は読むだけで、一切書き換えない。
// 旅行者向けの表示(TOP・15km・地域検索・地図・詳細・お気に入り・GA4)は変えない。
// このファイルはVercel Functionではない(api/moderate-submission.jsから呼ばれる)。

import {
  FieldValue
} from "firebase-admin/firestore";

import {
  encodeTownNowGeohash
} from "./town-now-threads.js";

import {
  requireVerifiedStoreUser,
  reverseGeocodeStoreLocation
} from "./store-self-service.js";

import {
  validateImadakeUrl
} from "./imadake.js";

const SUBMISSIONS_COLLECTION = "submissions";
const STORE_ACCOUNTS_COLLECTION = "storeAccounts";
const STORE_MEMBERS_COLLECTION = "storeMembers";
const STORE_PROFILES_COLLECTION = "storeProfiles";
const CLAIMS_COLLECTION = "storeListingClaims";
const LINKS_COLLECTION = "storeListingLinks";
// 連打防止は既存のcollectionを使う(新しいRulesを増やさない)。
const RATE_LIMITS_COLLECTION = "storeRegistrationRateLimits";

const CLAIM_CREATE_COOLDOWN_MS = 30 * 1000;
const CLAIM_PENDING_PER_USER_MAX = 10;
const CLAIM_NOTE_MAX_LENGTH = 200;
const DECISION_REASON_MAX_LENGTH = 300;
const VERIFICATION_NOTE_MAX_LENGTH = 300;
const ADMIN_LIST_DECIDED_LIMIT = 30;

export const CLAIM_ROLES = ["owner", "manager"];
export const CLAIM_TARGET_TYPES = ["new_store", "existing_store"];
// 運営が本人確認に使った、申請者とは独立した公開連絡先の種類(記録用)。
export const VERIFICATION_CHANNELS = ["official_website", "official_sns", "map_listing", "other_public_source"];

// 紛らわしい文字(I/O/0/1)を除いた英数字。申請と運営の確認を照合するための番号。
const CLAIM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// 運営無料掲載のカテゴリ(日本語の内部値) → 常設店舗のカテゴリcode。
const LISTING_CATEGORY_TO_CODE = {
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


function sendError(response, status, reason, extra) {
  return response.status(status).json(Object.assign({ success: false, reason: reason }, extra || {}));
}

function readTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readId(value) {
  const id = readTrimmedString(value);
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "";
}

// 1行テキスト(上限・改行・制御文字を拒否)。不正はnull。
function readSingleLineText(value, maxLength) {
  if (value !== undefined && value !== null && typeof value !== "string") {
    return null;
  }

  const text = readTrimmedString(value);

  if (Array.from(text).length > maxLength || /[\u0000-\u001F\u007F]/.test(text)) {
    return null;
  }

  return text;
}

function generateClaimCode(randomInt) {
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += CLAIM_CODE_CHARACTERS[randomInt(CLAIM_CODE_CHARACTERS.length)];
  }

  return code;
}

function millisOf(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

// オーナー化の対象にできる運営無料掲載(運営の常設掲載で、掲載中のもの)だけを通す。
function isClaimableListing(data) {
  return (
    !!data &&
    data.isPermanentAd === true &&
    data.authorType === "shopAd" &&
    data.status === "approved"
  );
}

// 申請者・運営に見せる掲載の概要(どれも旅行者向けに公開済みの情報だけ)。
function buildListingSummary(data) {
  return {
    shopName: typeof data.shopName === "string" ? data.shopName : "",
    address: typeof data.address === "string" ? data.address : "",
    category: typeof data.category === "string" ? data.category : "",
    imageUrl: Array.isArray(data.imageUrls) && typeof data.imageUrls[0] === "string" ? data.imageUrls[0] : ""
  };
}

// 既存の自店舗へつなぐ時の条件：owner かつ有効なメンバーで、店舗が利用可能(active・enabled)。
function isEligibleTargetStore(memberData, accountData, uid, storeId) {
  return (
    !!memberData &&
    memberData.uid === uid &&
    memberData.storeId === storeId &&
    memberData.role === "owner" &&
    memberData.status === "active" &&
    !!accountData &&
    accountData.enabled === true &&
    accountData.registrationStatus === "active"
  );
}

async function listEligibleStoresForUser(database, uid) {
  const membersSnapshot = await database.collection(STORE_MEMBERS_COLLECTION).where("uid", "==", uid).get();
  const stores = [];

  for (const memberDocument of membersSnapshot.docs) {
    const member = memberDocument.data() || {};

    if (typeof member.storeId !== "string") {
      continue;
    }

    const accountSnapshot = await database.collection(STORE_ACCOUNTS_COLLECTION).doc(member.storeId).get();
    const account = accountSnapshot.exists ? accountSnapshot.data() || {} : null;

    if (isEligibleTargetStore(member, account, uid, member.storeId)) {
      stores.push({
        storeId: member.storeId,
        storeName: typeof account.storeName === "string" ? account.storeName : "",
        city: account.city || "",
        prefecture: account.prefecture || ""
      });
    }
  }

  return stores;
}

async function readListing(database, submissionId) {
  const snapshot = await database.collection(SUBMISSIONS_COLLECTION).doc(submissionId).get();

  return snapshot.exists && isClaimableListing(snapshot.data()) ? snapshot.data() : null;
}

function isActiveLink(linkData) {
  return !!linkData && linkData.status === "active";
}


// ===== 店舗側 =====

// mode: storeListingClaimPreview { submissionId }
// 申請画面用：掲載の概要・紐付け状況(誰の店舗かは返さない)・選べる自分の店舗・自分の確認待ち申請。
export async function handleStoreListingClaimPreview(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const submissionId = readId(deps.readRequestBody(request).submissionId);

    if (submissionId === "") {
      return sendError(response, 400, "invalid_input", { field: "submissionId" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const listing = await readListing(database, submissionId);

    if (!listing) {
      return sendError(response, 404, "listing_not_found");
    }

    const [linkSnapshot, myClaimsSnapshot, eligibleStores] = await Promise.all([
      database.collection(LINKS_COLLECTION).doc(submissionId).get(),
      database.collection(CLAIMS_COLLECTION).where("claimantUid", "==", actor.uid).get(),
      listEligibleStoresForUser(database, actor.uid)
    ]);

    const link = linkSnapshot.exists ? linkSnapshot.data() : null;
    const myPending = myClaimsSnapshot.docs
      .map(function(documentSnapshot) { return Object.assign({ claimId: documentSnapshot.id }, documentSnapshot.data()); })
      .find(function(claim) { return claim.submissionId === submissionId && claim.status === "pending"; });
    const myStoreIds = eligibleStores.map(function(store) { return store.storeId; });

    return response.status(200).json({
      success: true,
      submissionId: submissionId,
      listing: buildListingSummary(listing),
      linkState: !isActiveLink(link)
        ? "unlinked"
        : myStoreIds.includes(link.storeId) ? "linked_to_you" : "linked",
      eligibleStores: eligibleStores,
      pendingClaim: myPending
        ? { claimId: myPending.claimId, claimCode: myPending.claimCode, createdAtMillis: millisOf(myPending.createdAt) }
        : null
    });
  } catch (error) {
    console.error("オーナー申請：確認画面エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeListingClaimCreate
// { submissionId, targetType: "new_store"|"existing_store", targetStoreId?, role, publicReferenceUrl?, note? }
// 申請者の電話番号・メール等の連絡先は受け取らない(本人確認は運営が独立して行うため)。
export async function handleStoreListingClaimCreate(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const body = deps.readRequestBody(request);
    const submissionId = readId(body.submissionId);
    const targetType = body.targetType;
    const targetStoreId = targetType === "existing_store" ? readId(body.targetStoreId) : "";
    const role = body.role;
    const publicReferenceUrl = validateImadakeUrl(body.publicReferenceUrl);
    const note = readSingleLineText(body.note, CLAIM_NOTE_MAX_LENGTH);

    if (submissionId === "") return sendError(response, 400, "invalid_input", { field: "submissionId" });
    if (!CLAIM_TARGET_TYPES.includes(targetType)) return sendError(response, 400, "invalid_input", { field: "targetType" });
    if (targetType === "existing_store" && targetStoreId === "") return sendError(response, 400, "invalid_input", { field: "targetStoreId" });
    if (!CLAIM_ROLES.includes(role)) return sendError(response, 400, "invalid_input", { field: "role" });
    if (publicReferenceUrl === null) return sendError(response, 400, "invalid_input", { field: "publicReferenceUrl" });
    if (note === null) return sendError(response, 400, "invalid_input", { field: "note" });

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const listing = await readListing(database, submissionId);

    if (!listing) {
      return sendError(response, 404, "listing_not_found");
    }

    if (targetType === "existing_store") {
      const [memberSnapshot, accountSnapshot] = await Promise.all([
        database.collection(STORE_MEMBERS_COLLECTION).doc(targetStoreId + "_" + actor.uid).get(),
        database.collection(STORE_ACCOUNTS_COLLECTION).doc(targetStoreId).get()
      ]);

      // 他人の店舗・存在しない店舗・ownerでない・利用できない店舗は区別せず同じ応答にする。
      if (!isEligibleTargetStore(
        memberSnapshot.exists ? memberSnapshot.data() : null,
        accountSnapshot.exists ? accountSnapshot.data() : null,
        actor.uid,
        targetStoreId
      )) {
        return sendError(response, 403, "target_store_not_allowed");
      }
    }

    const [linkSnapshot, myClaimsSnapshot] = await Promise.all([
      database.collection(LINKS_COLLECTION).doc(submissionId).get(),
      database.collection(CLAIMS_COLLECTION).where("claimantUid", "==", actor.uid).get()
    ]);
    const link = linkSnapshot.exists ? linkSnapshot.data() : null;

    if (isActiveLink(link) && targetType === "existing_store" && link.storeId === targetStoreId) {
      return sendError(response, 409, "already_linked_to_this_store");
    }

    const myClaims = myClaimsSnapshot.docs.map(function(documentSnapshot) { return documentSnapshot.data() || {}; });

    if (myClaims.some(function(claim) { return claim.submissionId === submissionId && claim.status === "pending"; })) {
      return sendError(response, 409, "pending_claim_exists");
    }

    if (myClaims.filter(function(claim) { return claim.status === "pending"; }).length >= CLAIM_PENDING_PER_USER_MAX) {
      return sendError(response, 429, "too_many_pending_claims");
    }

    const allowed = await deps.claimRateLimit(
      database,
      RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeListingClaimCreate", actor.uid),
      CLAIM_CREATE_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const claimRef = database.collection(CLAIMS_COLLECTION).doc();
    const claimCode = generateClaimCode(deps.randomInt);

    await claimRef.set({
      submissionId: submissionId,
      // 申請時点の掲載の概要(公開情報のみ)。運営の確認と監査のために残す。
      listingSnapshot: buildListingSummary(listing),
      claimantUid: actor.uid,
      targetType: targetType,
      targetStoreId: targetStoreId,
      role: role,
      publicReferenceUrl: publicReferenceUrl,
      note: note,
      claimCode: claimCode,
      status: "pending",
      linkConflictAtCreation: isActiveLink(link),
      verificationMethod: "operator_review",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    return response.status(200).json({
      success: true,
      claimId: claimRef.id,
      claimCode: claimCode,
      status: "pending"
    });
  } catch (error) {
    console.error("オーナー申請：作成エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeListingClaimMine — 自分の申請の一覧(運営の内部メモ・判断理由は返さない)。
export async function handleStoreListingClaimMine(request, response, deps) {
  try {
    const result = await deps.resolveStoreUserActor(request);

    if (!result.ok) {
      return sendError(response, result.status, result.status === 401 ? "login_required" : "store_account_required");
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const snapshot = await database.collection(CLAIMS_COLLECTION).where("claimantUid", "==", result.actor.uid).get();

    const claims = snapshot.docs
      .map(function(documentSnapshot) {
        const claim = documentSnapshot.data() || {};

        return {
          claimId: documentSnapshot.id,
          submissionId: claim.submissionId,
          listing: claim.listingSnapshot || {},
          targetType: claim.targetType,
          status: claim.status,
          claimCode: claim.status === "pending" ? claim.claimCode : "",
          resultStoreId: claim.status === "approved" ? claim.resultStoreId || "" : "",
          createdAtMillis: millisOf(claim.createdAt),
          decidedAtMillis: millisOf(claim.decidedAt)
        };
      })
      .sort(function(first, second) { return second.createdAtMillis - first.createdAtMillis; });

    return response.status(200).json({ success: true, claims: claims });
  } catch (error) {
    console.error("オーナー申請：一覧エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeListingClaimWithdraw { claimId } — 自分の確認待ち申請だけ取り下げられる。
export async function handleStoreListingClaimWithdraw(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const claimId = readId(deps.readRequestBody(request).claimId);

    if (claimId === "") {
      return sendError(response, 400, "invalid_input", { field: "claimId" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const claimRef = database.collection(CLAIMS_COLLECTION).doc(claimId);
    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const snapshot = await transaction.get(claimRef);
      const claim = snapshot.exists ? snapshot.data() || {} : null;

      if (!claim || claim.claimantUid !== actor.uid) {
        outcome = { status: 404, reason: "claim_not_found" };
        return;
      }

      if (claim.status !== "pending") {
        outcome = { status: 409, reason: "claim_not_pending" };
        return;
      }

      transaction.update(claimRef, {
        status: "withdrawn",
        withdrawnAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      outcome = { status: 200 };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason);
    }

    return response.status(200).json({ success: true, status: "withdrawn" });
  } catch (error) {
    console.error("オーナー申請：取り下げエラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// ===== 運営(Admin)側 =====

async function requireAdminActor(request, response, deps) {
  const authResult = await deps.requireAdmin(request);

  if (!authResult || !authResult.ok) {
    response.status((authResult && authResult.status) || 403).json({
      success: false,
      message: (authResult && authResult.message) || "管理者権限が必要です。"
    });
    return null;
  }

  return authResult;
}

// mode: adminCountPendingStoreListingClaims — 管理本部の「未対応 ○件」用。
export async function handleAdminCountPendingStoreListingClaims(request, response, deps) {
  try {
    const authResult = await requireAdminActor(request, response, deps);

    if (!authResult) {
      return;
    }

    const snapshot = await authResult.database.collection(CLAIMS_COLLECTION).where("status", "==", "pending").get();

    return response.status(200).json({ success: true, pendingCount: snapshot.docs.length });
  } catch (error) {
    console.error("オーナー申請：件数エラー：", error && error.message);
    return response.status(500).json({ success: false, message: "未対応件数を取得できませんでした。" });
  }
}

// mode: adminStoreListingClaimList — 確認待ちの申請(紐付け状況・同じ掲載への他の申請・
// 申請先の店舗)と、最近判断した申請、有効な紐付けの一覧。
export async function handleAdminStoreListingClaimList(request, response, deps) {
  try {
    const authResult = await requireAdminActor(request, response, deps);

    if (!authResult) {
      return;
    }

    const database = authResult.database;
    const [pendingSnapshot, decidedSnapshot, linksSnapshot] = await Promise.all([
      database.collection(CLAIMS_COLLECTION).where("status", "==", "pending").get(),
      database.collection(CLAIMS_COLLECTION).where("status", "in", ["approved", "rejected", "withdrawn"]).get(),
      database.collection(LINKS_COLLECTION).where("status", "==", "active").get()
    ]);

    const storeNameCache = new Map();
    const readStoreName = async function(storeId) {
      if (!storeId) return "";
      if (!storeNameCache.has(storeId)) {
        const snapshot = await database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get();
        storeNameCache.set(storeId, snapshot.exists ? (snapshot.data() || {}).storeName || "" : "");
      }
      return storeNameCache.get(storeId);
    };

    const pendingClaims = pendingSnapshot.docs.map(function(documentSnapshot) {
      return Object.assign({ claimId: documentSnapshot.id }, documentSnapshot.data());
    });
    const pendingCountBySubmission = {};
    pendingClaims.forEach(function(claim) {
      pendingCountBySubmission[claim.submissionId] = (pendingCountBySubmission[claim.submissionId] || 0) + 1;
    });

    const activeLinks = new Map(linksSnapshot.docs.map(function(documentSnapshot) {
      return [documentSnapshot.id, documentSnapshot.data() || {}];
    }));

    const describeClaim = async function(claim) {
      const link = activeLinks.get(claim.submissionId);
      const listingNow = await database.collection(SUBMISSIONS_COLLECTION).doc(claim.submissionId).get();

      return {
        claimId: claim.claimId,
        submissionId: claim.submissionId,
        listing: claim.listingSnapshot || {},
        listingStillClaimable: listingNow.exists && isClaimableListing(listingNow.data()),
        claimantUid: claim.claimantUid,
        targetType: claim.targetType,
        targetStoreId: claim.targetStoreId || "",
        targetStoreName: await readStoreName(claim.targetStoreId),
        role: claim.role,
        publicReferenceUrl: claim.publicReferenceUrl || "",
        note: claim.note || "",
        claimCode: claim.claimCode,
        status: claim.status,
        createdAtMillis: millisOf(claim.createdAt),
        decidedAtMillis: millisOf(claim.decidedAt),
        decisionReason: claim.decisionReason || "",
        verificationChannel: claim.verificationChannel || "",
        resultStoreId: claim.resultStoreId || "",
        currentLink: link ? { storeId: link.storeId, storeName: await readStoreName(link.storeId) } : null,
        otherPendingClaimsForListing: Math.max(0, (pendingCountBySubmission[claim.submissionId] || 0) - (claim.status === "pending" ? 1 : 0))
      };
    };

    const pending = [];
    for (const claim of pendingClaims.sort(function(a, b) { return millisOf(a.createdAt) - millisOf(b.createdAt); })) {
      pending.push(await describeClaim(claim));
    }

    const decidedClaims = decidedSnapshot.docs
      .map(function(documentSnapshot) { return Object.assign({ claimId: documentSnapshot.id }, documentSnapshot.data()); })
      .sort(function(a, b) { return millisOf(b.decidedAt || b.withdrawnAt || b.updatedAt) - millisOf(a.decidedAt || a.withdrawnAt || a.updatedAt); })
      .slice(0, ADMIN_LIST_DECIDED_LIMIT);
    const decided = [];
    for (const claim of decidedClaims) {
      decided.push(await describeClaim(claim));
    }

    const links = [];
    for (const [submissionId, link] of activeLinks) {
      const listingSnapshot = await database.collection(SUBMISSIONS_COLLECTION).doc(submissionId).get();
      links.push({
        submissionId: submissionId,
        listing: listingSnapshot.exists ? buildListingSummary(listingSnapshot.data()) : {},
        storeId: link.storeId,
        storeName: await readStoreName(link.storeId),
        claimId: link.claimId || "",
        linkedAtMillis: millisOf(link.linkedAt)
      });
    }

    return response.status(200).json({ success: true, pending: pending, decided: decided, links: links });
  } catch (error) {
    console.error("オーナー申請：管理一覧エラー：", error && error.message);
    return response.status(500).json({ success: false, message: "オーナー申請の一覧を取得できませんでした。" });
  }
}

// 「新しい店舗として引き継ぐ」承認時に作る店舗の所在地。運営が置いた座標を正として使い、
// 国・第1行政区分・市区町村・regionKeyは逆ジオコーディングで世界共通の形にする。
async function buildNewStoreLocation(listing, deps) {
  const location = await reverseGeocodeStoreLocation(listing.latitude, listing.longitude, deps);

  if (!location.ok) {
    return location;
  }

  return {
    ok: true,
    fields: {
      address: typeof listing.address === "string" ? listing.address : "",
      locationFormattedAddress: location.formattedAddress,
      latitude: location.latitude,
      longitude: location.longitude,
      countryCode: location.countryCode,
      prefecture: location.prefecture,
      city: location.city,
      regionKey: location.regionKey,
      geohash: encodeTownNowGeohash(location.latitude, location.longitude),
      locationSource: "listingCoordinates"
    }
  };
}

// mode: adminStoreListingClaimReview
// { claimId, decision: "approve"|"reject", reason, verificationChannel?, verificationNote? }
// 承認には、運営が申請者とは独立した公開連絡先で確認した記録(verificationChannel)が必須。
export async function handleAdminStoreListingClaimReview(request, response, deps) {
  try {
    const authResult = await requireAdminActor(request, response, deps);

    if (!authResult) {
      return;
    }

    const body = deps.readRequestBody(request);
    const claimId = readId(body.claimId);
    const decision = body.decision;
    const reason = readSingleLineText(body.reason, DECISION_REASON_MAX_LENGTH);
    const verificationChannel = body.verificationChannel;
    const verificationNote = readSingleLineText(body.verificationNote, VERIFICATION_NOTE_MAX_LENGTH);

    if (claimId === "" || (decision !== "approve" && decision !== "reject") || reason === null || verificationNote === null) {
      return sendError(response, 400, "invalid_input");
    }

    if (decision === "reject" && reason === "") {
      return sendError(response, 400, "invalid_input", { field: "reason" });
    }

    if (decision === "approve" && !VERIFICATION_CHANNELS.includes(verificationChannel)) {
      return sendError(response, 400, "invalid_input", { field: "verificationChannel" });
    }

    const database = authResult.database;
    const adminUid = authResult.actor.uid;
    const claimRef = database.collection(CLAIMS_COLLECTION).doc(claimId);

    if (decision === "reject") {
      let outcome = null;

      await database.runTransaction(async function(transaction) {
        const snapshot = await transaction.get(claimRef);

        if (!snapshot.exists) {
          outcome = { status: 404, reason: "claim_not_found" };
          return;
        }

        if ((snapshot.data() || {}).status !== "pending") {
          outcome = { status: 409, reason: "claim_not_pending" };
          return;
        }

        transaction.update(claimRef, {
          status: "rejected",
          decidedAt: FieldValue.serverTimestamp(),
          decidedByUid: adminUid,
          decisionReason: reason,
          updatedAt: FieldValue.serverTimestamp()
        });
        outcome = { status: 200 };
      });

      return outcome.status === 200
        ? response.status(200).json({ success: true, status: "rejected" })
        : sendError(response, outcome.status, outcome.reason);
    }

    // ----- 承認 -----
    const preClaim = await claimRef.get();

    if (!preClaim.exists) {
      return sendError(response, 404, "claim_not_found");
    }

    const preClaimData = preClaim.data() || {};

    if (preClaimData.status !== "pending") {
      return sendError(response, 409, "claim_not_pending");
    }

    const submissionRef = database.collection(SUBMISSIONS_COLLECTION).doc(preClaimData.submissionId);
    const linkRef = database.collection(LINKS_COLLECTION).doc(preClaimData.submissionId);

    // 新しい店舗を作る場合の所在地は、外部APIのためtransactionの前に準備する。
    let newStoreLocation = null;

    if (preClaimData.targetType === "new_store") {
      const listingBefore = await submissionRef.get();

      if (!listingBefore.exists || !isClaimableListing(listingBefore.data())) {
        return sendError(response, 409, "listing_not_claimable");
      }

      newStoreLocation = await buildNewStoreLocation(listingBefore.data(), deps);

      if (!newStoreLocation.ok) {
        return sendError(response, newStoreLocation.reason === "geocoding_unavailable" ? 503 : 400, newStoreLocation.reason);
      }
    }

    const newStoreRef = preClaimData.targetType === "new_store"
      ? database.collection(STORE_ACCOUNTS_COLLECTION).doc()
      : null;
    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const claimSnapshot = await transaction.get(claimRef);
      const linkSnapshot = await transaction.get(linkRef);
      const submissionSnapshot = await transaction.get(submissionRef);
      const claim = claimSnapshot.exists ? claimSnapshot.data() || {} : null;

      if (!claim) {
        outcome = { status: 404, reason: "claim_not_found" };
        return;
      }

      if (claim.status !== "pending") {
        outcome = { status: 409, reason: "claim_not_pending" };
        return;
      }

      // 「1つの無料掲載に有効な紐付けは1つ」。既存の有効な紐付けは、Adminが明示的に
      // 解除するまで別の申請からは奪えない(同時承認でも片方しか通らない)。
      const existingLink = linkSnapshot.exists ? linkSnapshot.data() || {} : null;

      if (isActiveLink(existingLink)) {
        outcome = { status: 409, reason: "listing_already_linked" };
        return;
      }

      if (!submissionSnapshot.exists || !isClaimableListing(submissionSnapshot.data())) {
        outcome = { status: 409, reason: "listing_not_claimable" };
        return;
      }

      const listing = submissionSnapshot.data();
      let storeId;

      if (claim.targetType === "existing_store") {
        storeId = claim.targetStoreId;
        const memberSnapshot = await transaction.get(database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + claim.claimantUid));
        const accountSnapshot = await transaction.get(database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId));

        if (!isEligibleTargetStore(
          memberSnapshot.exists ? memberSnapshot.data() : null,
          accountSnapshot.exists ? accountSnapshot.data() : null,
          claim.claimantUid,
          storeId
        )) {
          outcome = { status: 409, reason: "target_store_not_allowed" };
          return;
        }
      } else {
        storeId = newStoreRef.id;
        const memberRef = database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + claim.claimantUid);
        const profileRef = database.collection(STORE_PROFILES_COLLECTION).doc(storeId);
        const existing = await Promise.all([transaction.get(newStoreRef), transaction.get(memberRef), transaction.get(profileRef)]);

        if (existing.some(function(snapshot) { return snapshot.exists; })) {
          outcome = { status: 500, reason: "store_id_collision" };
          return;
        }

        // Phase 2Aと同じ形の管理情報(tokenHashは作らない)。所在地は掲載の座標を使う。
        transaction.set(newStoreRef, Object.assign({
          storeName: typeof listing.shopName === "string" ? listing.shopName : "",
          enabled: true,
          createdByType: "listingClaim",
          createdByUid: claim.claimantUid,
          registrationStatus: "active",
          reviewFlags: [],
          duplicateCandidates: [],
          sourceSubmissionId: claim.submissionId,
          sourceClaimId: claimId,
          locationUpdatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, newStoreLocation.fields));

        transaction.set(memberRef, {
          storeId: storeId,
          uid: claim.claimantUid,
          role: "owner",
          status: "active",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        // 常設情報は最低限の下書きだけ(無料掲載の紹介文・写真はコピーしない)。
        transaction.set(profileRef, {
          storeId: storeId,
          status: "draft",
          storeName: typeof listing.shopName === "string" ? listing.shopName : "",
          categoryCode: LISTING_CATEGORY_TO_CODE[listing.category] || "other",
          sourceLanguage: "ja",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      const now = Date.now();
      const history = existingLink && Array.isArray(existingLink.history) ? existingLink.history.slice() : [];
      history.push({ event: "linked", storeId: storeId, claimId: claimId, byUid: adminUid, atMillis: now, reason: reason });

      transaction.set(linkRef, {
        submissionId: claim.submissionId,
        storeId: storeId,
        status: "active",
        claimId: claimId,
        verificationMethod: "operator_review",
        verificationChannel: verificationChannel,
        linkedAt: FieldValue.serverTimestamp(),
        linkedByUid: adminUid,
        revokedAt: null,
        revokedByUid: "",
        revokeReason: "",
        history: history,
        updatedAt: FieldValue.serverTimestamp()
      });

      transaction.update(claimRef, {
        status: "approved",
        decidedAt: FieldValue.serverTimestamp(),
        decidedByUid: adminUid,
        decisionReason: reason,
        verificationChannel: verificationChannel,
        verificationNote: verificationNote,
        resultStoreId: storeId,
        updatedAt: FieldValue.serverTimestamp()
      });

      outcome = { status: 200, storeId: storeId };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason);
    }

    return response.status(200).json({ success: true, status: "approved", storeId: outcome.storeId });
  } catch (error) {
    console.error("オーナー申請：承認・却下エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminStoreListingLinkRevoke { submissionId, reason } — 有効な紐付けを解除する(Adminのみ)。
// 紐付けの文書は消さず status:"revoked" と履歴を残す。店舗アカウント・メンバー・常設情報は変えない。
export async function handleAdminStoreListingLinkRevoke(request, response, deps) {
  try {
    const authResult = await requireAdminActor(request, response, deps);

    if (!authResult) {
      return;
    }

    const body = deps.readRequestBody(request);
    const submissionId = readId(body.submissionId);
    const reason = readSingleLineText(body.reason, DECISION_REASON_MAX_LENGTH);

    if (submissionId === "" || reason === null || reason === "") {
      return sendError(response, 400, "invalid_input");
    }

    const database = authResult.database;
    const linkRef = database.collection(LINKS_COLLECTION).doc(submissionId);
    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const snapshot = await transaction.get(linkRef);
      const link = snapshot.exists ? snapshot.data() || {} : null;

      if (!isActiveLink(link)) {
        outcome = { status: 409, reason: "link_not_active" };
        return;
      }

      const history = Array.isArray(link.history) ? link.history.slice() : [];
      history.push({ event: "revoked", storeId: link.storeId, claimId: link.claimId || "", byUid: authResult.actor.uid, atMillis: Date.now(), reason: reason });

      transaction.update(linkRef, {
        status: "revoked",
        revokedAt: FieldValue.serverTimestamp(),
        revokedByUid: authResult.actor.uid,
        revokeReason: reason,
        history: history,
        updatedAt: FieldValue.serverTimestamp()
      });
      outcome = { status: 200 };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason);
    }

    return response.status(200).json({ success: true, status: "revoked" });
  } catch (error) {
    console.error("オーナー申請：紐付け解除エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
