// ==========================================================================
// STEP 44-A｜月額100円・店舗カスタマイズプランの有料プロフィール(サーバー側)
// ==========================================================================
// 代表決定(2026-10-24)：既存の無料の店舗プロフィール(storeProfiles)は削らず、
// 有料の拡張として「メニュー・商品紹介(商品ごとの写真・説明・価格)」「SNS・予約先などの
// 追加リンク」「店舗のこだわり・ストーリー」を追加する。
//
// データは無料の storeProfiles とは別の文書に分ける：
//   storeCustomProfiles/{storeId}  有料の内容(メニュー・追加リンク・ストーリー)
//   storeCustomPlans/{storeId}     契約状態(利用権限)。STEP 44-B の申込・解約(サーバー)だけが書く。
//   storeCustomPlanEvents/{id}     申込・解約・再開・置き換えの履歴(サーバーだけが書く、消さない)。
// どちらも Firestore Rules に許可の指定が無い＝ブラウザからは読み書きできない
// (全体を許可する指定が無いことは確認済み)。契約状態を画面から書き換えることはできない。
//
// 編集できるのは次をすべて満たす場合だけ(すべてサーバー側で判定する)：
//   ・ログイン済み・メール確認済みの店舗アカウント
//   ・storeMembers/{storeId}_{uid} が role:"owner" かつ status:"active"
//   ・storeAccounts/{storeId} が registrationStatus:"active" かつ enabled:true
//   ・storeCustomPlans/{storeId} の利用権限が有効(hasStoreCustomPlanAccess)で、契約者本人(ownerUid)であること
// 利用権限が無い(未契約・期限切れ)店舗の有料の内容は、削除せずに保存したまま
// 旅行者には返さない(再契約すればそのまま表示に戻る)。
// 無料の storeProfiles・storeAccounts・submissions・今だけ投稿には一切書き込まない。
// このファイルはVercel Functionではない(api/moderate-submission.jsから呼ばれる)。

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  validateImadakeUrl
} from "./imadake.js";

import {
  requireVerifiedStoreUser
} from "./store-self-service.js";

// STEP 44-C③｜契約の暦月モデル・利用月の記録(月末締めの元データ)。
import {
  STORE_CUSTOM_PLAN_PERIOD_MONTHLY,
  STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED,
  evaluateStoreCustomPlanAccess,
  isMonthlyPlan,
  jstMonthKey,
  jstMonthStartMillis,
  nextMonthKey,
  storeCustomPlanUsageRef,
  writeStoreCustomPlanUsage
} from "./store-custom-plan-billing.js";

import {
  STORE_PHOTO_FOLDER_ROOT,
  readMultilineText,
  readSingleLineText,
  isActiveOwner,
  isEditableStore
} from "./store-profile.js";

const STORE_ACCOUNTS_COLLECTION = "storeAccounts";
const STORE_MEMBERS_COLLECTION = "storeMembers";
export const STORE_CUSTOM_PROFILES_COLLECTION = "storeCustomProfiles";
export const STORE_CUSTOM_PLANS_COLLECTION = "storeCustomPlans";
export const STORE_CUSTOM_PLAN_EVENTS_COLLECTION = "storeCustomPlanEvents";
// STEP 44-B｜Preview試験の契約の印(本番の請求と結び付いた契約と区別する)。
export const STORE_CUSTOM_PLAN_PERIOD_PREVIEW_TRIAL = "preview_trial";
// 無料の店舗情報と同じ連打防止用collectionを使う(新しいRulesを増やさない)。
const STORE_RATE_LIMITS_COLLECTION = "storeRegistrationRateLimits";

const STORE_CUSTOM_UPDATE_COOLDOWN_MS = 3 * 1000;

// 上限は代表決定(2026-10-24 STEP 44-A 最終調整)。変える時はここだけを直す
// (画面は storeCustomProfileGet の応答の limits から上限を受け取る)。
// 商品写真は1商品1枚まで、店舗全体の合計で menuPhotosMax 枚まで(写真の無い商品も登録できる)。
// 無料の店舗写真(最大10枚、storeProfiles.photos)とは別に数える。
export const STORE_CUSTOM_LIMITS = {
  menuItemsMax: 20,
  menuPhotosMax: 5,
  menuNameMaxLength: 40,
  menuDescriptionMaxLength: 300,
  menuPriceMaxLength: 20,
  linksMax: 5,
  linkLabelMaxLength: 30,
  storyMaxLength: 2000
};

// 追加リンクの種類は英語code。一度使ったcodeは改名・意味変更しない(追加のみ)。
export const STORE_CUSTOM_LINK_TYPES = [
  "instagram",
  "website",
  "reservation",
  "x",
  "facebook",
  "tiktok",
  "youtube",
  "line",
  "other"
];

// 利用権限がある契約状態。44-B で申込・解約を作る時に、この2つ以外を増やす場合はここで決める。
// canceling＝解約の手続き済みで、利用期限(accessUntil)までは使える状態。
export const STORE_CUSTOM_PLAN_ACCESS_STATUSES = ["active", "canceling"];

const STORE_PHOTO_CLOUDINARY_PREFIX = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const STORE_CUSTOM_PHOTO_MODERATION_CONCURRENCY = 3;

// 商品写真は無料の店舗写真(machinau_store_profiles/{storeId}/{id})とは別の下のフォルダーに置く。
// 無料の写真の保存・削除の判定(isStorePhotoPublicId)には一致しないため、互いの保存・削除が
// もう一方の写真に触れることはない。
export function buildStoreMenuPhotoFolder(storeId) {
  return STORE_PHOTO_FOLDER_ROOT + "/" + storeId + "/menu";
}

export function isStoreMenuPhotoPublicId(publicId, storeId) {
  return (
    typeof publicId === "string" &&
    typeof storeId === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(storeId) &&
    new RegExp("^" + STORE_PHOTO_FOLDER_ROOT + "/" + storeId + "/menu/[A-Za-z0-9_-]{1,100}$").test(publicId)
  );
}

function millisOf(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

// 利用権限(期間・状態)。Preview 試験の契約：active / canceling で、利用期限(accessUntil)が今より後の時だけ true
// (利用期限の無い試験の契約は権限なし)。STEP 44-C③ の本番の暦月契約(periodKind monthly)：active・past_due は
// 利用可、canceling は月末(accessUntil)まで、suspended・ended は不可。判定は store-custom-plan-billing.js にまとめる。
export function hasStoreCustomPlanAccess(planData, nowMillis) {
  return evaluateStoreCustomPlanAccess(planData, nowMillis);
}

// STEP 44-B｜契約はそれを申し込んだアカウント(ownerUid＝カードの登録先)に結び付く。
// 有料の欄を編集できるのは、契約が有効で、かつ契約者本人(ownerUid)の時だけ。
// 旅行者への表示は、契約が有効で、かつ契約者が今もその店舗の有効な owner の時だけ
// (所有者が変わったら、旧店主の契約は新しい owner に引き継がれず、表示もしない)。
export function isStoreCustomPlanHolder(planData, uid) {
  return !!planData && typeof planData.ownerUid === "string" && planData.ownerUid !== "" && planData.ownerUid === uid;
}

// 画面に出す契約の状態。none(契約なし)・active(契約中)・canceling(解約手続き済み・期限まで利用可)・
// expired(利用期限の終了)・other_holder(別のアカウントの契約)。
export function readStoreCustomPlanState(planData, uid, nowMillis) {
  if (!planData || typeof planData.status !== "string") {
    return "none";
  }

  if (!isStoreCustomPlanHolder(planData, uid)) {
    return "other_holder";
  }

  // STEP 44-C④｜未払いは契約の状態と別(paymentStatus)。停止中(suspended)は有料の内容を使えないため期限の判定と分ける。
  if (isMonthlyPlan(planData) && planData.paymentStatus === "suspended" && planData.status !== "ended") {
    return planData.status === "canceling" && millisOf(planData.accessUntil) <= nowMillis ? "expired" : planData.status === "canceling" ? "canceling" : "active";
  }

  if (!hasStoreCustomPlanAccess(planData, nowMillis)) {
    return "expired";
  }

  return planData.status === "canceling" ? "canceling" : "active";
}

function buildPlanResponse(planData, uid, nowMillis) {
  const data = planData || {};
  const state = readStoreCustomPlanState(planData, uid, nowMillis);
  const mine = state !== "other_holder";

  return {
    access: hasStoreCustomPlanAccess(planData, nowMillis) && isStoreCustomPlanHolder(planData, uid),
    // 契約の期間内か(停止中でも、解約・支払いのために契約の期間を表示する)。
    state: state,
    status: typeof data.status === "string" ? data.status : "none",
    // 別のアカウントの契約の日時は見せない(状態だけ)。
    accessUntilMillis: mine ? millisOf(data.accessUntil) : 0,
    subscribedAtMillis: mine ? millisOf(data.subscribedAt) : 0,
    canceledAtMillis: mine ? millisOf(data.canceledAt) : 0,
    periodKind: mine && typeof data.periodKind === "string" ? data.periodKind : "",
    // STEP 44-C③｜Preview で作った試験用の契約か(画面に「実際には請求されません」を出す)。
    createdInPreview: mine && data.createdInPreview === true,
    // STEP 44-C④｜支払いの状態(契約の状態とは別)：current・past_due(未払い・猶予中)・suspended(未払いで停止)。
    paymentStatus: mine && (data.paymentStatus === "past_due" || data.paymentStatus === "suspended") ? data.paymentStatus : "current"
  };
}

// ===== STEP 44-B｜Preview試験専用の仮の利用期限 =====
// 申込時刻から暦の上で1か月後の同じ時刻(日本時間の暦で数える)。翌月にその日が無い時は、
// 翌月の末日に丸める(例：1月31日 → 2月28日／うるう年は29日、3月31日 → 4月30日)。
// 本番の請求日・更新日・日割り・税込区分の決定ではない(代表決定 2026-10-24)。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function addOneCalendarMonthJst(millis) {
  const local = new Date(millis + JST_OFFSET_MS);
  const year = local.getUTCFullYear();
  const nextMonth = local.getUTCMonth() + 1;
  const lastDayOfNextMonth = new Date(Date.UTC(year, nextMonth + 1, 0)).getUTCDate();

  return Date.UTC(
    year,
    nextMonth,
    Math.min(local.getUTCDate(), lastDayOfNextMonth),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds()
  ) - JST_OFFSET_MS;
}

// 店舗の外のページへのリンクは https だけ(javascript:・data:・http: 等は保存しない)。
function readHttpsUrl(value) {
  const url = validateImadakeUrl(value);

  if (url === null || url === "") {
    return url;
  }

  return url.indexOf("https://") === 0 ? url : null;
}

function readMenuPhoto(value, storeId) {
  if (value === undefined || value === null) {
    return { ok: true, photo: null };
  }

  const publicId = typeof value.publicId === "string" ? value.publicId : "";
  const url = typeof value.url === "string" ? value.url : "";

  if (!isStoreMenuPhotoPublicId(publicId, storeId)) {
    return { ok: false };
  }

  // URLはpublicIdから決まる形と完全一致しなければ受け付けない(別の画像へのすり替え防止)。
  const expected = new RegExp(
    "^" + STORE_PHOTO_CLOUDINARY_PREFIX.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") +
    "v\\d{1,12}/" + publicId + "\\.(webp|jpg|jpeg|png)$"
  );

  return expected.test(url) ? { ok: true, photo: { url: url, publicId: publicId } } : { ok: false };
}

// クライアントから受け取ってよい項目だけを読む。不正な項目があれば { ok:false, field }。
export function validateStoreCustomProfileInput(body, storeId) {
  const limits = STORE_CUSTOM_LIMITS;
  const menuInput = body.menuItems === undefined || body.menuItems === null ? [] : body.menuItems;

  if (!Array.isArray(menuInput) || menuInput.length > limits.menuItemsMax) {
    return { ok: false, field: "menuItems" };
  }

  const menuItems = [];
  const seenPhotoIds = new Set();

  for (let index = 0; index < menuInput.length; index += 1) {
    const item = menuInput[index];

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, field: "menuItems" };
    }

    const name = readSingleLineText(item.name, limits.menuNameMaxLength);

    if (name === null || name === "") {
      return { ok: false, field: "menuItems.name", index: index };
    }

    const description = readMultilineText(item.description, limits.menuDescriptionMaxLength);

    if (description === null) {
      return { ok: false, field: "menuItems.description", index: index };
    }

    const priceText = readSingleLineText(item.priceText, limits.menuPriceMaxLength);

    if (priceText === null) {
      return { ok: false, field: "menuItems.priceText", index: index };
    }

    const photo = readMenuPhoto(item.photo, storeId);

    if (!photo.ok || (photo.photo && seenPhotoIds.has(photo.photo.publicId))) {
      return { ok: false, field: "menuItems.photo", index: index };
    }

    if (photo.photo) {
      seenPhotoIds.add(photo.photo.publicId);
    }

    menuItems.push({ name: name, description: description, priceText: priceText, photo: photo.photo });
  }

  const linksInput = body.links === undefined || body.links === null ? [] : body.links;

  if (!Array.isArray(linksInput) || linksInput.length > limits.linksMax) {
    return { ok: false, field: "links" };
  }

  const links = [];

  for (let index = 0; index < linksInput.length; index += 1) {
    const link = linksInput[index];
    const type = link && typeof link.type === "string" ? link.type : "";
    const label = readSingleLineText(link && link.label, limits.linkLabelMaxLength);
    const url = readHttpsUrl(link && link.url);

    if (!STORE_CUSTOM_LINK_TYPES.includes(type) || label === null || url === null || url === "") {
      return { ok: false, field: "links", index: index };
    }

    links.push({ type: type, label: label, url: url });
  }

  const story = readMultilineText(body.story, limits.storyMaxLength);

  if (story === null) {
    return { ok: false, field: "story" };
  }

  // 商品写真の合計枚数(店舗全体)。画面の制御に関係なく、サーバーで必ず確認する。
  if (seenPhotoIds.size > limits.menuPhotosMax) {
    return { ok: false, field: "menuPhotos" };
  }

  return { ok: true, fields: { menuItems: menuItems, links: links, story: story } };
}

// Moderation対象の文章(ストーリー・商品名・説明・価格・リンクの表示名)。保存済みの
// moderatedText と同じ組み立て方で比べるため、保存と公開の両方でこの関数を使う。
export function buildStoreCustomModerationText(fields) {
  const data = fields || {};
  const parts = [typeof data.story === "string" ? data.story : ""];

  (Array.isArray(data.menuItems) ? data.menuItems : []).forEach(function(item) {
    parts.push(item && item.name, item && item.description, item && item.priceText);
  });

  (Array.isArray(data.links) ? data.links : []).forEach(function(link) {
    parts.push(link && link.label);
  });

  return parts
    .filter(function(part) { return typeof part === "string" && part !== ""; })
    .join("\n");
}

function readStoredMenuPhotos(customData) {
  return (customData && Array.isArray(customData.menuItems) ? customData.menuItems : [])
    .map(function(item) { return item && item.photo; })
    .filter(function(photo) { return !!photo && typeof photo.publicId === "string"; });
}

// 新しく追加された写真だけを1枚ずつModerationにかける(同時3件まで。1枚でもflaggedならtrue、
// 1件でもエラーなら例外＝保存しない)。無料の店舗写真と同じ方式。
async function moderateNewMenuPhotos(photos, deps) {
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

  for (let index = 0; index < Math.min(STORE_CUSTOM_PHOTO_MODERATION_CONCURRENCY, photos.length); index += 1) {
    workers.push(worker());
  }

  await Promise.all(workers);

  if (firstError) {
    throw firstError;
  }

  return flagged;
}

// Cloudinary上の商品写真の実体削除。保存の成否には影響させず、失敗はサーバーログへ残す。
async function deleteMenuPhotos(storeId, publicIds, deps, context) {
  const targets = publicIds.filter(function(publicId) {
    return isStoreMenuPhotoPublicId(publicId, storeId);
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
          "商品写真：Cloudinary削除失敗：",
          JSON.stringify({ storeId: storeId, publicId: result.publicId, context: context, detail: result.detail })
        );
      }
    });
  } catch (error) {
    failed = targets.length;
    console.error(
      "商品写真：Cloudinary削除エラー：",
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

function readStoreId(body) {
  const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";

  return storeId !== "" && storeId.length <= 100 && /^[A-Za-z0-9_-]+$/.test(storeId)
    ? storeId
    : "";
}

function readRevision(customData) {
  return customData && Number.isInteger(customData.revision) ? customData.revision : 0;
}

function buildCustomResponse(customData) {
  const data = customData || {};

  return {
    revision: readRevision(data),
    menuItems: (Array.isArray(data.menuItems) ? data.menuItems : []).map(function(item) {
      return {
        name: typeof item.name === "string" ? item.name : "",
        description: typeof item.description === "string" ? item.description : "",
        priceText: typeof item.priceText === "string" ? item.priceText : "",
        photo: item.photo && typeof item.photo.url === "string"
          ? { url: item.photo.url, publicId: item.photo.publicId }
          : null
      };
    }),
    links: (Array.isArray(data.links) ? data.links : []).map(function(link) {
      return { type: link.type, label: typeof link.label === "string" ? link.label : "", url: link.url };
    }),
    story: typeof data.story === "string" ? data.story : "",
    updatedAtMillis: millisOf(data.updatedAt)
  };
}

function readNowMillis(deps) {
  return typeof deps.now === "function" ? deps.now() : Date.now();
}

// 商品写真の署名発行の前に使う確認(owner・編集可能な店舗・利用権限あり)。
export async function checkStoreCustomEditor(database, storeId, uid, nowMillis) {
  const snapshots = await Promise.all([
    database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + uid).get(),
    database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get(),
    database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId).get()
  ]);

  if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), uid, storeId) || !snapshots[1].exists) {
    return { ok: false, status: 404, reason: "store_not_found" };
  }

  if (!isEditableStore(snapshots[1].data())) {
    return { ok: false, status: 403, reason: "store_not_editable" };
  }

  const plan = snapshots[2].exists ? snapshots[2].data() : null;

  if (!hasStoreCustomPlanAccess(plan, nowMillis) || !isStoreCustomPlanHolder(plan, uid)) {
    return { ok: false, status: 403, reason: "plan_required" };
  }

  return { ok: true };
}


// mode: storeCustomProfileGet (POST、メール確認済み店舗アカウントの owner)
// 有料の内容と契約状態を返す。未契約・期限切れでも、保存済みの内容は owner に見せる(編集は不可)。
export async function handleStoreCustomProfileGet(request, response, deps) {
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
      database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId).get(),
      database.collection(STORE_CUSTOM_PROFILES_COLLECTION).doc(storeId).get()
    ]);

    // 他人の店舗・存在しない店舗は区別せず同じ応答にする(存在有無を漏らさない)。
    if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), actor.uid, storeId) || !snapshots[1].exists) {
      return sendError(response, 404, "store_not_found");
    }

    const planData = snapshots[2].exists ? snapshots[2].data() : null;
    const plan = buildPlanResponse(planData, actor.uid, readNowMillis(deps));
    const storeEditable = isEditableStore(snapshots[1].data());

    // STEP 44-B｜申込の可否の目安(画面の表示用。申込の時にサーバーがすべて確認し直す)。
    plan.signupAvailable = typeof deps.isStoreCustomPlanTrialEnabled === "function" && deps.isStoreCustomPlanTrialEnabled() === true;
    plan.storeEditable = storeEditable;

    if (plan.signupAvailable && typeof deps.checkAccountBillingCard === "function") {
      const card = await deps.checkAccountBillingCard(database, actor.uid);
      plan.cardRegistered = !!card && card.ok === true;
    } else {
      plan.cardRegistered = false;
    }

    if (plan.state === "other_holder") {
      // 別のアカウントの契約が今も有効か(契約者が有効な owner で、期限内)。有効なら新しい申込はできない。
      const holderSnapshot = await database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + planData.ownerUid).get();
      plan.otherHolderActive =
        hasStoreCustomPlanAccess(planData, readNowMillis(deps)) &&
        holderSnapshot.exists &&
        isActiveOwner(holderSnapshot.data(), planData.ownerUid, storeId);
    } else {
      plan.otherHolderActive = false;
    }

    return response.status(200).json({
      success: true,
      storeId: storeId,
      plan: plan,
      editable: storeEditable && plan.access,
      custom: buildCustomResponse(snapshots[3].exists ? snapshots[3].data() : null),
      limits: STORE_CUSTOM_LIMITS,
      linkTypes: STORE_CUSTOM_LINK_TYPES
    });
  } catch (error) {
    console.error("店舗カスタマイズ：取得エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// mode: storeCustomProfileUpdate (POST、owner・編集可能な店舗・利用権限ありの時だけ)
// { storeId, expectedRevision, menuItems, links, story }
// 送られた内容で有料の内容をまるごと置き換える(並べ替え・削除も同じ操作)。
// expectedRevisionが保存済みのrevisionと違う場合は上書きせず409(revision_conflict)。
export async function handleStoreCustomProfileUpdate(request, response, deps) {
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

    const input = validateStoreCustomProfileInput(body, storeId);

    if (!input.ok) {
      return sendError(response, 400, "invalid_input",
        input.index !== undefined ? { field: input.field, index: input.index } : { field: input.field });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const memberRef = database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + actor.uid);
    const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
    const planRef = database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId);
    const customRef = database.collection(STORE_CUSTOM_PROFILES_COLLECTION).doc(storeId);

    // Moderation(外部API)の前に、権限・編集可否・利用権限を確認しておく。
    const preSnapshots = await Promise.all([memberRef.get(), accountRef.get(), planRef.get(), customRef.get()]);

    if (!preSnapshots[0].exists || !isActiveOwner(preSnapshots[0].data(), actor.uid, storeId) || !preSnapshots[1].exists) {
      return sendError(response, 404, "store_not_found");
    }

    const accountBefore = preSnapshots[1].data() || {};

    if (!isEditableStore(accountBefore)) {
      return sendError(response, 403, "store_not_editable");
    }

    const planBefore = preSnapshots[2].exists ? preSnapshots[2].data() : null;

    if (!hasStoreCustomPlanAccess(planBefore, readNowMillis(deps)) || !isStoreCustomPlanHolder(planBefore, actor.uid)) {
      return sendError(response, 403, "plan_required");
    }

    const customBefore = preSnapshots[3].exists ? preSnapshots[3].data() || {} : {};

    if (readRevision(customBefore) !== body.expectedRevision) {
      return sendError(response, 409, "revision_conflict", { currentRevision: readRevision(customBefore) });
    }

    const allowed = await deps.claimRateLimit(
      database,
      STORE_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeCustomProfileUpdate", actor.uid),
      STORE_CUSTOM_UPDATE_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    // 文章が前回の確認済みの内容から変わった時だけModerationを呼ぶ。
    const nextText = buildStoreCustomModerationText(input.fields);
    const textBefore = typeof customBefore.moderatedText === "string" ? customBefore.moderatedText : null;
    let moderationUpdate = {};

    if (nextText !== textBefore) {
      if (nextText !== "") {
        let flagged;

        try {
          const results = await deps.callOpenAiModeration(
            deps.buildModerationInput({ shopName: accountBefore.storeName || "", title: "", content: nextText })
          );

          if (!Array.isArray(results) || results.length === 0) {
            throw new Error("moderation response was empty");
          }

          flagged = !results.every(function(result) { return result && result.flagged === false; });
        } catch (moderationError) {
          console.error("店舗カスタマイズ：Moderationエラー：", deps.classifyModerationError(moderationError));
          return sendError(response, 503, "safety_check_unavailable");
        }

        if (flagged) {
          return sendError(response, 400, "content_not_allowed");
        }
      }

      moderationUpdate = {
        moderationStatus: "passed",
        moderatedText: nextText,
        moderationCheckedAt: FieldValue.serverTimestamp()
      };
    }

    // 新しく追加された商品写真だけをModerationにかける(確認済みの写真は再確認しない)。
    const storedPhotos = readStoredMenuPhotos(customBefore);
    const storedById = new Map(storedPhotos.map(function(photo) { return [photo.publicId, photo]; }));
    const newPhotos = input.fields.menuItems
      .map(function(item) { return item.photo; })
      .filter(function(photo) { return !!photo && !storedById.has(photo.publicId); });

    if (newPhotos.length > 0) {
      let flagged;

      try {
        flagged = await moderateNewMenuPhotos(newPhotos, deps);
      } catch (moderationError) {
        console.error("商品写真：Moderationエラー：", deps.classifyModerationError(moderationError));
        return sendError(response, 503, "safety_check_unavailable");
      }

      if (flagged) {
        await deleteMenuPhotos(
          storeId,
          newPhotos.map(function(photo) { return photo.publicId; }),
          deps,
          "moderation_rejected"
        );
        return sendError(response, 400, "photo_not_allowed");
      }
    }

    const menuItems = input.fields.menuItems.map(function(item) {
      return {
        name: item.name,
        description: item.description,
        priceText: item.priceText,
        photo: item.photo
          ? {
              url: item.photo.url,
              publicId: item.photo.publicId,
              moderationStatus: storedById.has(item.photo.publicId) && storedById.get(item.photo.publicId).moderationStatus
                ? storedById.get(item.photo.publicId).moderationStatus
                : "passed"
            }
          : null
      };
    });

    let outcome = null;
    let previousPhotos = [];
    let savedCustom = null;

    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([
        transaction.get(memberRef),
        transaction.get(accountRef),
        transaction.get(planRef),
        transaction.get(customRef)
      ]);

      if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), actor.uid, storeId) || !snapshots[1].exists) {
        outcome = { status: 404, reason: "store_not_found" };
        return;
      }

      if (!isEditableStore(snapshots[1].data())) {
        outcome = { status: 403, reason: "store_not_editable" };
        return;
      }

      const planNow = snapshots[2].exists ? snapshots[2].data() : null;

      if (!hasStoreCustomPlanAccess(planNow, readNowMillis(deps)) || !isStoreCustomPlanHolder(planNow, actor.uid)) {
        outcome = { status: 403, reason: "plan_required" };
        return;
      }

      const customData = snapshots[3].exists ? snapshots[3].data() || {} : {};
      const currentRevision = readRevision(customData);

      if (currentRevision !== body.expectedRevision) {
        outcome = { status: 409, reason: "revision_conflict", currentRevision: currentRevision };
        return;
      }

      previousPhotos = readStoredMenuPhotos(customData);
      savedCustom = Object.assign({}, customData, { menuItems: menuItems, links: input.fields.links, story: input.fields.story, revision: currentRevision + 1 });
      transaction.set(
        customRef,
        Object.assign(
          {
            storeId: storeId,
            revision: currentRevision + 1,
            menuItems: menuItems,
            links: input.fields.links,
            story: input.fields.story,
            updatedByUid: actor.uid,
            updatedAt: FieldValue.serverTimestamp()
          },
          moderationUpdate
        ),
        { merge: true }
      );

      outcome = { status: 200, revision: currentRevision + 1 };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason,
        outcome.currentRevision !== undefined ? { currentRevision: outcome.currentRevision } : undefined);
    }

    // 保存の成功後に、外した商品写真の実体を削除する(この店舗の商品写真フォルダーの画像だけ)。
    const keptIds = new Set(readStoredMenuPhotos({ menuItems: menuItems }).map(function(photo) { return photo.publicId; }));
    const photoCleanup = await deleteMenuPhotos(
      storeId,
      previousPhotos
        .map(function(photo) { return photo.publicId; })
        .filter(function(publicId) { return !keptIds.has(publicId); }),
      deps,
      "removed_from_custom_profile"
    );

    return response.status(200).json({
      success: true,
      revision: outcome.revision,
      custom: buildCustomResponse(savedCustom),
      photoCleanup: photoCleanup
    });
  } catch (error) {
    console.error("店舗カスタマイズ：保存エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// ===== 旅行者向け(publicStoreProfiles の各店舗に付ける有料の内容) =====
// 利用権限がある店舗で、保存済みの文章がModeration済み(moderatedTextが今の内容と一致)の
// 場合だけ返す。写真はModerationを通過した、この店舗の商品写真フォルダーの画像だけ。
// 返す項目の許可リスト：商品名・説明・価格・写真URL、リンクの種類・表示名・URL(httpsのみ)、ストーリー。
// 内容が何も無い場合は null(画面は見出しも出さない)。
export function buildPublicStoreCustomProfile(storeId, planData, customData, nowMillis) {
  if (!hasStoreCustomPlanAccess(planData, nowMillis) || !customData) {
    return null;
  }

  if (
    customData.moderationStatus !== "passed" ||
    customData.moderatedText !== buildStoreCustomModerationText(customData)
  ) {
    return null;
  }

  const menuItems = (Array.isArray(customData.menuItems) ? customData.menuItems : [])
    .filter(function(item) { return !!item && typeof item.name === "string" && item.name.trim() !== ""; })
    .map(function(item) {
      const photo = item.photo;
      const photoOk =
        !!photo &&
        photo.moderationStatus === "passed" &&
        isStoreMenuPhotoPublicId(photo.publicId, storeId) &&
        typeof photo.url === "string" &&
        photo.url.indexOf(STORE_PHOTO_CLOUDINARY_PREFIX) === 0;

      return {
        name: item.name,
        description: typeof item.description === "string" ? item.description : "",
        priceText: typeof item.priceText === "string" ? item.priceText : "",
        photoUrl: photoOk ? photo.url : ""
      };
    });

  const links = (Array.isArray(customData.links) ? customData.links : [])
    .filter(function(link) {
      return (
        !!link &&
        STORE_CUSTOM_LINK_TYPES.includes(link.type) &&
        typeof link.url === "string" &&
        readHttpsUrl(link.url) === link.url
      );
    })
    .map(function(link) {
      return { type: link.type, label: typeof link.label === "string" ? link.label : "", url: link.url };
    });

  const story = typeof customData.story === "string" ? customData.story.trim() : "";

  if (menuItems.length === 0 && links.length === 0 && story === "") {
    return null;
  }

  return { menuItems: menuItems, links: links, story: story };
}

// 公開中の店舗IDの一覧について、有料の内容を Map(storeId → 公開用の内容) で返す。
// 契約状態を先に読み、利用権限がある店舗の内容だけを読む(読み取りを増やしすぎない)。
// 1店舗の読み取りに失敗しても、他の店舗・無料の一覧は止めない(呼び出し元でも例外を握る)。
export async function readPublicStoreCustomProfiles(database, storeIds, nowMillis) {
  const result = new Map();
  const planSnapshots = await Promise.all(storeIds.map(function(storeId) {
    return database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId).get();
  }));
  const entitled = [];

  planSnapshots.forEach(function(snapshot, index) {
    const plan = snapshot.exists ? snapshot.data() : null;

    if (hasStoreCustomPlanAccess(plan, nowMillis) && typeof plan.ownerUid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(plan.ownerUid)) {
      entitled.push({ storeId: storeIds[index], plan: plan });
    }
  });

  // STEP 44-B｜契約者が今もその店舗の有効な owner の時だけ表示する(所有者が変わったら旧店主の契約では表示しない)。
  const holderSnapshots = await Promise.all(entitled.map(function(entry) {
    return database.collection(STORE_MEMBERS_COLLECTION).doc(entry.storeId + "_" + entry.plan.ownerUid).get();
  }));
  const customSnapshots = await Promise.all(entitled.map(function(entry) {
    return database.collection(STORE_CUSTOM_PROFILES_COLLECTION).doc(entry.storeId).get();
  }));

  customSnapshots.forEach(function(snapshot, index) {
    try {
      const holder = holderSnapshots[index];

      if (!holder.exists || !isActiveOwner(holder.data(), entitled[index].plan.ownerUid, entitled[index].storeId)) {
        return;
      }

      const custom = buildPublicStoreCustomProfile(
        entitled[index].storeId,
        entitled[index].plan,
        snapshot.exists ? snapshot.data() : null,
        nowMillis
      );

      if (custom) {
        result.set(entitled[index].storeId, custom);
      }
    } catch (error) {
      console.error("店舗カスタマイズ：公開用の読み取りを飛ばしました：", entitled[index].storeId, error && error.message);
    }
  });

  return result;
}

// ===== STEP 44-B｜月額100円プランの申込・解約(Preview試験)・運営の契約一覧 =====
// 契約状態は storeCustomPlans/{storeId} の1文書。履歴は storeCustomPlanEvents に追記だけする。
// Stripe には一切接続しない(請求は 44-C)。申込は Preview試験の環境(Preview・対象ブランチ・
// machinau-preview)の時だけ受け付ける(deps.isStoreCustomPlanTrialEnabled。Production では常に受け付けない)。

const STORE_CUSTOM_PLAN_COOLDOWN_MS = 3 * 1000;

function snapshotPlanForHistory(planData) {
  const data = planData || {};

  return {
    status: typeof data.status === "string" ? data.status : "",
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    periodKind: typeof data.periodKind === "string" ? data.periodKind : "",
    subscribedAtMillis: millisOf(data.subscribedAt),
    accessUntilMillis: millisOf(data.accessUntil),
    canceledAtMillis: millisOf(data.canceledAt)
  };
}

function writePlanEvent(transaction, database, storeId, uid, event, nowMillis, detail) {
  const eventRef = database
    .collection(STORE_CUSTOM_PLAN_EVENTS_COLLECTION)
    .doc(storeId + "_" + nowMillis + "_" + event);

  transaction.set(eventRef, Object.assign({
    storeId: storeId,
    uid: uid,
    event: event,
    at: Timestamp.fromMillis(nowMillis),
    createdAt: FieldValue.serverTimestamp()
  }, detail || {}));
}

// mode: storeCustomPlanSubscribe (POST、メール確認済み店舗アカウントの owner)
// 条件：Preview試験の環境・自店の有効な owner・店舗が編集可能・このアカウントにカード登録済み・
// 有効な契約が無い。解約手続き済み(期限内)の自分の契約は、申込で「解約の取り消し」になる(期限は変えない)。
// それ以外(契約なし・期限切れ・前の owner の契約)は新しい契約(申込時刻から暦の1か月後まで)を作り、
// 前の契約は履歴(superseded)に残す。旧店主の契約を新しい owner へ引き継ぐことはしない。
export async function handleStoreCustomPlanSubscribe(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const storeId = readStoreId(deps.readRequestBody(request));

    if (storeId === "") {
      return sendError(response, 400, "invalid_input", { field: "storeId" });
    }

    // STEP 44-C③｜契約の種類：本番の申込の受付(STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED、false)が有効なら本番の暦月契約。
    // それ以外は Preview 試験の環境の時だけ受け付け、既定は STEP 44-B の試験の契約(申込から暦の1か月・請求の対象外)、
    // contractModel "monthly" を指定した時だけ試験用の暦月契約(createdInPreview。請求台帳の試験用)。Production では受け付けない。
    const monthlySignupEnabled =
      STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED === true ||
      (typeof deps.isStoreCustomPlanMonthlySignupEnabled === "function" && deps.isStoreCustomPlanMonthlySignupEnabled() === true);
    const trialEnvironment = typeof deps.isStoreCustomPlanTrialEnabled === "function" && deps.isStoreCustomPlanTrialEnabled() === true;
    const requestedModel = deps.readRequestBody(request).contractModel;

    if (!monthlySignupEnabled && !trialEnvironment) {
      return sendError(response, 403, "plan_signup_unavailable");
    }

    const contractModel = monthlySignupEnabled || requestedModel === STORE_CUSTOM_PLAN_PERIOD_MONTHLY
      ? STORE_CUSTOM_PLAN_PERIOD_MONTHLY
      : STORE_CUSTOM_PLAN_PERIOD_PREVIEW_TRIAL;
    const createdInPreview = !monthlySignupEnabled;

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const memberRef = database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + actor.uid);
    const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
    const planRef = database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId);
    const preSnapshots = await Promise.all([memberRef.get(), accountRef.get()]);

    if (!preSnapshots[0].exists || !isActiveOwner(preSnapshots[0].data(), actor.uid, storeId) || !preSnapshots[1].exists) {
      return sendError(response, 404, "store_not_found");
    }

    if (!isEditableStore(preSnapshots[1].data())) {
      return sendError(response, 403, "store_not_editable");
    }

    const card = typeof deps.checkAccountBillingCard === "function"
      ? await deps.checkAccountBillingCard(database, actor.uid)
      : { ok: false, reason: "card_required" };

    if (!card || card.ok !== true) {
      return sendError(response, 403, "card_required", { cardReason: card && card.reason ? card.reason : "card_required" });
    }

    const allowed = await deps.claimRateLimit(
      database,
      STORE_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeCustomPlan", actor.uid),
      STORE_CUSTOM_PLAN_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const nowMillis = readNowMillis(deps);
    const monthKey = jstMonthKey(nowMillis);
    const usageRef = storeCustomPlanUsageRef(database, storeId, monthKey);
    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([
        transaction.get(memberRef),
        transaction.get(accountRef),
        transaction.get(planRef),
        transaction.get(usageRef)
      ]);
      const planData = snapshots[2].exists ? snapshots[2].data() || {} : null;
      const usageSnapshot = snapshots[3];
      let holderActive = false;

      if (planData && typeof planData.ownerUid === "string" && planData.ownerUid !== "" && planData.ownerUid !== actor.uid) {
        const holderSnapshot = await transaction.get(
          database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + planData.ownerUid)
        );
        holderActive = holderSnapshot.exists && isActiveOwner(holderSnapshot.data(), planData.ownerUid, storeId);
      }

      if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), actor.uid, storeId) || !snapshots[1].exists) {
        outcome = { status: 404, reason: "store_not_found" };
        return;
      }

      if (!isEditableStore(snapshots[1].data())) {
        outcome = { status: 403, reason: "store_not_editable" };
        return;
      }

      const inPeriod = hasStoreCustomPlanAccess(planData, nowMillis);
      const mine = isStoreCustomPlanHolder(planData, actor.uid);

      // STEP 44-C③/④｜未払い(猶予中・停止中)の自分の契約がある間は、新しい申込・解約の取り消しを受け付けない
      // (支払いの完了で再開する)。
      if (mine && isMonthlyPlan(planData) && (planData.paymentStatus === "past_due" || planData.paymentStatus === "suspended")) {
        outcome = { status: 409, reason: "plan_unpaid" };
        return;
      }

      // 既存の契約と同じ種類の時だけ「解約の取り消し」(試験の契約と本番の暦月契約は混ぜない)。
      if (inPeriod && mine && planData.status === "canceling" && (isMonthlyPlan(planData) === (contractModel === STORE_CUSTOM_PLAN_PERIOD_MONTHLY))) {
        const reactivated = {
          status: "active",
          canceledAt: null,
          reactivatedAt: Timestamp.fromMillis(nowMillis),
          updatedAt: FieldValue.serverTimestamp(),
          revision: (Number.isInteger(planData.revision) ? planData.revision : 0) + 1
        };

        if (isMonthlyPlan(planData)) {
          // 暦月契約は解約の取り消しで期限が無くなる(毎月継続)。今月の料金は既に記録済みなら増やさない。
          reactivated.accessUntil = null;
          writeStoreCustomPlanUsage(transaction, usageRef, usageSnapshot, {
            storeId: storeId,
            month: monthKey,
            holderUid: actor.uid,
            reason: "reactivated",
            atMillis: nowMillis,
            contractSubscribedAt: planData.subscribedAt || null,
            createdInPreview: planData.createdInPreview === true
          });
        }

        transaction.update(planRef, reactivated);
        writePlanEvent(transaction, database, storeId, actor.uid, "reactivated", nowMillis, {
          accessUntil: planData.accessUntil
        });
        outcome = {
          status: 200,
          result: "reactivated",
          accessUntilMillis: isMonthlyPlan(planData) ? 0 : millisOf(planData.accessUntil),
          periodKind: isMonthlyPlan(planData) ? STORE_CUSTOM_PLAN_PERIOD_MONTHLY : STORE_CUSTOM_PLAN_PERIOD_PREVIEW_TRIAL
        };
        return;
      }

      if (inPeriod && (mine || holderActive)) {
        outcome = { status: 409, reason: "already_subscribed" };
        return;
      }

      const monthly = contractModel === STORE_CUSTOM_PLAN_PERIOD_MONTHLY;
      // Preview 試験の契約は申込から暦の1か月。本番の暦月契約は期限なし(解約するまで毎月継続)。
      const accessUntilMillis = monthly ? 0 : addOneCalendarMonthJst(nowMillis);

      if (planData) {
        writePlanEvent(transaction, database, storeId, actor.uid, "superseded", nowMillis, {
          previous: snapshotPlanForHistory(planData)
        });
      }

      if (monthly) {
        // 今月の料金は、今月の初めから利用できた前の暦月契約があればその契約者(旧店主)に、無ければ申込んだ本人に
        // 結び付ける(店舗・年月で1件。同じ月に何度申込・解約・再申込しても100円が上限)。
        const previousCoversMonth =
          isMonthlyPlan(planData) &&
          typeof planData.ownerUid === "string" &&
          planData.ownerUid !== "" &&
          millisOf(planData.subscribedAt) < jstMonthStartMillis(monthKey) &&
          planData.paymentStatus !== "suspended" &&
          planData.status !== "ended" &&
          (planData.status !== "canceling" || millisOf(planData.accessUntil) > jstMonthStartMillis(monthKey));

        // 記録が既にあれば、申込んだ本人を「同じ月の後の契約者」として残すだけ(料金は増やさない)。
        writeStoreCustomPlanUsage(transaction, usageRef, usageSnapshot, usageSnapshot.exists
          ? { holderUid: actor.uid }
          : previousCoversMonth
          ? {
              storeId: storeId,
              month: monthKey,
              holderUid: planData.ownerUid,
              laterHolderUids: planData.ownerUid !== actor.uid ? [actor.uid] : [],
              reason: "continued",
              atMillis: jstMonthStartMillis(monthKey),
              contractSubscribedAt: planData.subscribedAt || null,
              createdInPreview: planData.createdInPreview === true
            }
          : {
              storeId: storeId,
              month: monthKey,
              holderUid: actor.uid,
              reason: "subscribed",
              atMillis: nowMillis,
              contractSubscribedAt: Timestamp.fromMillis(nowMillis),
              createdInPreview: createdInPreview
            });
      }

      transaction.set(planRef, {
        storeId: storeId,
        status: "active",
        ownerUid: actor.uid,
        billingAccountUid: actor.uid,
        periodKind: contractModel,
        createdInPreview: createdInPreview,
        subscribedAt: Timestamp.fromMillis(nowMillis),
        accessUntil: monthly ? null : Timestamp.fromMillis(accessUntilMillis),
        canceledAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        revision: (planData && Number.isInteger(planData.revision) ? planData.revision : 0) + 1
      });
      writePlanEvent(transaction, database, storeId, actor.uid, "subscribed", nowMillis, {
        periodKind: contractModel,
        accessUntil: monthly ? null : Timestamp.fromMillis(accessUntilMillis)
      });
      outcome = { status: 200, result: "subscribed", accessUntilMillis: accessUntilMillis, periodKind: contractModel };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason);
    }

    return response.status(200).json({
      success: true,
      result: outcome.result,
      accessUntilMillis: outcome.accessUntilMillis,
      periodKind: outcome.periodKind || ""
    });
  } catch (error) {
    console.error("店舗カスタマイズ：申込エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeCustomPlanCancel (POST、メール確認済み店舗アカウントの owner・契約者本人)
// 契約中(期限内)の契約を「解約手続き済み」にする。利用期限は変えない(期限までは利用できる)。
// すでに解約手続き済みなら何も変えずに成功を返す(連打・二重解約で状態を壊さない)。
// 店舗が停止中でも、契約者本人なら解約できる。有料の内容・写真は消さない。
export async function handleStoreCustomPlanCancel(request, response, deps) {
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
    const planRef = database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId);
    const nowMillis = readNowMillis(deps);
    const monthKey = jstMonthKey(nowMillis);
    const usageRef = storeCustomPlanUsageRef(database, storeId, monthKey);
    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([transaction.get(memberRef), transaction.get(planRef), transaction.get(usageRef)]);

      if (!snapshots[0].exists || !isActiveOwner(snapshots[0].data(), actor.uid, storeId)) {
        outcome = { status: 404, reason: "store_not_found" };
        return;
      }

      const planData = snapshots[1].exists ? snapshots[1].data() || {} : null;
      // 未払いで停止中(有料の内容は使えない)でも、契約の期間内なら解約できる(STEP 44-C④)。
      const inContract = isMonthlyPlan(planData) && planData.paymentStatus === "suspended"
        ? hasStoreCustomPlanAccess(Object.assign({}, planData, { paymentStatus: "current" }), nowMillis)
        : hasStoreCustomPlanAccess(planData, nowMillis);

      if (!inContract || !isStoreCustomPlanHolder(planData, actor.uid)) {
        outcome = { status: 409, reason: "plan_not_active" };
        return;
      }

      if (planData.status === "canceling") {
        outcome = { status: 200, alreadyCanceled: true, accessUntilMillis: millisOf(planData.accessUntil) };
        return;
      }

      // STEP 44-C④｜未払い中でも解約は受け付ける(本部提案・代表承認)。既に発生した料金(請求台帳)は消さず・減らさず、
      // 翌月以降は発生しない。未払い(paymentStatus)は契約の状態と別に残る。

      // 本番の暦月契約：解約月の月末(翌月1日 0:00 JST)まで利用でき、今月の料金(100円)は残る(無ければ記録する)。
      // Preview 試験の契約：利用期限は変えない(STEP 44-B のまま)。
      const monthly = isMonthlyPlan(planData);
      const accessUntil = monthly ? Timestamp.fromMillis(jstMonthStartMillis(nextMonthKey(monthKey))) : planData.accessUntil;

      if (monthly) {
        writeStoreCustomPlanUsage(transaction, usageRef, snapshots[2], {
          storeId: storeId,
          month: monthKey,
          holderUid: actor.uid,
          reason: "continued",
          // 前の月から継続していれば今月の初めから、今月の申込ならその時から利用している。
          atMillis: Math.max(jstMonthStartMillis(monthKey), millisOf(planData.subscribedAt)),
          contractSubscribedAt: planData.subscribedAt || null,
          createdInPreview: planData.createdInPreview === true
        });
      }

      transaction.update(planRef, {
        status: "canceling",
        canceledAt: Timestamp.fromMillis(nowMillis),
        accessUntil: accessUntil,
        updatedAt: FieldValue.serverTimestamp(),
        revision: (Number.isInteger(planData.revision) ? planData.revision : 0) + 1
      });
      writePlanEvent(transaction, database, storeId, actor.uid, "canceled", nowMillis, {
        accessUntil: accessUntil
      });
      outcome = { status: 200, alreadyCanceled: false, accessUntilMillis: millisOf(accessUntil) };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason);
    }

    return response.status(200).json({
      success: true,
      alreadyCanceled: outcome.alreadyCanceled,
      accessUntilMillis: outcome.accessUntilMillis
    });
  } catch (error) {
    console.error("店舗カスタマイズ：解約エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminStoreCustomPlanList (POST、運営のみ、読み取り専用)
// 契約の一覧(店舗・状態・申込日時・利用期限・解約日時)。契約状態を書き換える機能は無い。
export async function handleAdminStoreCustomPlanList(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const nowMillis = readNowMillis(deps);
    const planSnapshot = await database.collection(STORE_CUSTOM_PLANS_COLLECTION).get();
    const plans = planSnapshot.docs.map(function(documentSnapshot) {
      return { storeId: documentSnapshot.id, data: documentSnapshot.data() || {} };
    });
    const related = await Promise.all(plans.map(function(plan) {
      const ownerUid = typeof plan.data.ownerUid === "string" && plan.data.ownerUid !== "" ? plan.data.ownerUid : "_";

      return Promise.all([
        database.collection(STORE_ACCOUNTS_COLLECTION).doc(plan.storeId).get(),
        database.collection(STORE_MEMBERS_COLLECTION).doc(plan.storeId + "_" + ownerUid).get()
      ]);
    }));

    const items = plans.map(function(plan, index) {
      const account = related[index][0].exists ? related[index][0].data() || {} : {};
      const holder = related[index][1];
      const holderActive = holder.exists && isActiveOwner(holder.data(), plan.data.ownerUid, plan.storeId);
      const inPeriod = hasStoreCustomPlanAccess(plan.data, nowMillis);

      return {
        storeId: plan.storeId,
        storeName: typeof account.storeName === "string" ? account.storeName : "",
        state:
          isMonthlyPlan(plan.data) && plan.data.status === "ended"
            ? "ended"
            : isMonthlyPlan(plan.data) && plan.data.paymentStatus === "suspended" && plan.data.status !== "canceling"
              ? "active"
              : !inPeriod ? "expired" : plan.data.status === "canceling" ? "canceling" : "active",
        // STEP 44-C④｜支払いの状態(契約の状態とは別)。
        paymentStatus: plan.data.paymentStatus === "past_due" || plan.data.paymentStatus === "suspended" ? plan.data.paymentStatus : "current",
        holderIsActiveOwner: holderActive,
        periodKind: typeof plan.data.periodKind === "string" ? plan.data.periodKind : "",
        subscribedAtMillis: millisOf(plan.data.subscribedAt),
        accessUntilMillis: millisOf(plan.data.accessUntil),
        canceledAtMillis: millisOf(plan.data.canceledAt)
      };
    });

    items.sort(function(a, b) { return b.subscribedAtMillis - a.subscribedAtMillis; });

    return response.status(200).json({ success: true, plans: items });
  } catch (error) {
    console.error("店舗カスタマイズ：契約一覧エラー：", error && error.message);
    return response.status(500).json({ success: false, message: "契約一覧を取得できませんでした。" });
  }
}
