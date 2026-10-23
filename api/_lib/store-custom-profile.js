// ==========================================================================
// STEP 44-A｜月額100円・店舗カスタマイズプランの有料プロフィール(サーバー側)
// ==========================================================================
// 代表決定(2026-10-24)：既存の無料の店舗プロフィール(storeProfiles)は削らず、
// 有料の拡張として「メニュー・商品紹介(商品ごとの写真・説明・価格)」「SNS・予約先などの
// 追加リンク」「店舗のこだわり・ストーリー」を追加する。
//
// データは無料の storeProfiles とは別の文書に分ける：
//   storeCustomProfiles/{storeId}  有料の内容(メニュー・追加リンク・ストーリー)
//   storeCustomPlans/{storeId}     契約状態(利用権限)。STEP 44-B でサーバーだけが書く。
//                                  44-A ではどこからも書かない(読むだけ)。
// どちらも Firestore Rules に許可の指定が無い＝ブラウザからは読み書きできない
// (全体を許可する指定が無いことは確認済み)。契約状態を画面から書き換えることはできない。
//
// 編集できるのは次をすべて満たす場合だけ(すべてサーバー側で判定する)：
//   ・ログイン済み・メール確認済みの店舗アカウント
//   ・storeMembers/{storeId}_{uid} が role:"owner" かつ status:"active"
//   ・storeAccounts/{storeId} が registrationStatus:"active" かつ enabled:true
//   ・storeCustomPlans/{storeId} の利用権限が有効(hasStoreCustomPlanAccess)
// 利用権限が無い(未契約・期限切れ)店舗の有料の内容は、削除せずに保存したまま
// 旅行者には返さない(再契約すればそのまま表示に戻る)。
// 無料の storeProfiles・storeAccounts・submissions・今だけ投稿には一切書き込まない。
// このファイルはVercel Functionではない(api/moderate-submission.jsから呼ばれる)。

import {
  FieldValue
} from "firebase-admin/firestore";

import {
  validateImadakeUrl
} from "./imadake.js";

import {
  requireVerifiedStoreUser
} from "./store-self-service.js";

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
// 無料の店舗情報と同じ連打防止用collectionを使う(新しいRulesを増やさない)。
const STORE_RATE_LIMITS_COLLECTION = "storeRegistrationRateLimits";

const STORE_CUSTOM_UPDATE_COOLDOWN_MS = 3 * 1000;

// 上限は STEP 44-A の推奨値(代表の最終承認待ち)。変える時はここだけを直す
// (画面は storeCustomProfileGet の応答の limits から上限を受け取る)。
export const STORE_CUSTOM_LIMITS = {
  menuItemsMax: 20,
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

// 利用権限：契約状態が active / canceling で、利用期限(accessUntil)が今より後の時だけ true。
// 利用期限の無い契約は権限なし(期限を決めずに無期限で使える状態を作らない)。
export function hasStoreCustomPlanAccess(planData, nowMillis) {
  return (
    !!planData &&
    STORE_CUSTOM_PLAN_ACCESS_STATUSES.includes(planData.status) &&
    millisOf(planData.accessUntil) > nowMillis
  );
}

function buildPlanResponse(planData, nowMillis) {
  const data = planData || {};

  return {
    access: hasStoreCustomPlanAccess(planData, nowMillis),
    status: typeof data.status === "string" ? data.status : "none",
    accessUntilMillis: millisOf(data.accessUntil)
  };
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

  if (!hasStoreCustomPlanAccess(snapshots[2].exists ? snapshots[2].data() : null, nowMillis)) {
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

    const plan = buildPlanResponse(snapshots[2].exists ? snapshots[2].data() : null, readNowMillis(deps));

    return response.status(200).json({
      success: true,
      storeId: storeId,
      plan: plan,
      editable: isEditableStore(snapshots[1].data()) && plan.access,
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

    if (!hasStoreCustomPlanAccess(preSnapshots[2].exists ? preSnapshots[2].data() : null, readNowMillis(deps))) {
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

      if (!hasStoreCustomPlanAccess(snapshots[2].exists ? snapshots[2].data() : null, readNowMillis(deps))) {
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

    if (hasStoreCustomPlanAccess(plan, nowMillis)) {
      entitled.push({ storeId: storeIds[index], plan: plan });
    }
  });

  const customSnapshots = await Promise.all(entitled.map(function(entry) {
    return database.collection(STORE_CUSTOM_PROFILES_COLLECTION).doc(entry.storeId).get();
  }));

  customSnapshots.forEach(function(snapshot, index) {
    try {
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
