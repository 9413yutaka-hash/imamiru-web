// ==========================================================================
// 正式店舗参加基盤 Phase 2A｜セルフ店舗登録(サーバー側)
// ==========================================================================
// メール確認済みの店舗アカウント(Phase 1)が、運営を介さずに自分の店舗・施設を
// 登録する。運営が店舗キー・専用URL(token)を発行する旧方式とは別の経路で、
// セルフ登録店舗にはtokenHashを一切作らない(=validateStoreToken()では必ず
// 不一致になり、旧URL経路では操作できない)。
//
// 作成するデータ(すべてサーバーのAdmin SDKだけが読み書きする)
//   storeAccounts/{storeId}        管理情報。所在地の項目名は運営登録店舗(STEP 4A
//                                  Option A)と同じにし、後のPhaseで今だけ投稿が
//                                  無改修でこの所在地を使えるようにする
//   storeMembers/{storeId}_{uid}   店舗とログインユーザーの関係(role:"owner")
//   storeProfiles/{storeId}        常設の公開情報の最低限のdraft(まだ公開しない)
//
// 1 uid = 1 store の制約は置かない(storeMembersは店舗×ユーザーの組で持つ)。
// 既存の運営無料店舗(submissions)は重複の疑いを調べるために読むだけで、
// 書き換え・紐付け・統合は一切しない。
// このファイルはVercel Functionではない(api/moderate-submission.jsから呼ばれる)。

import {
  FieldValue
} from "firebase-admin/firestore";

import {
  encodeTownNowGeohash,
  computeTownNowDistanceKm
} from "./town-now-threads.js";

import {
  buildImadakeRegionKey
} from "./imadake.js";

const STORE_ACCOUNTS_COLLECTION = "storeAccounts";
const STORE_MEMBERS_COLLECTION = "storeMembers";
const STORE_PROFILES_COLLECTION = "storeProfiles";
const STORE_REGISTRATION_RATE_LIMITS_COLLECTION = "storeRegistrationRateLimits";

export const STORE_NAME_MAX_LENGTH = 60;
export const STORE_ADDRESS_MAX_LENGTH = 200;
const STORE_REVIEW_REASON_MAX_LENGTH = 200;

// 常設店舗のカテゴリ(内部値は英語code。表示名は画面側の翻訳キーで出す)。
// TOPの既存カテゴリ(日本語の内部値)への対応付けは、旅行者へ公開する段階(2D)で行う。
export const STORE_CATEGORY_CODES = [
  "gourmet",
  "cafe_sweets",
  "shopping",
  "sightseeing_experience",
  "nightlife",
  "beauty_relaxation",
  "lodging",
  "other"
];

const STORE_SOURCE_LANGUAGES = ["ja", "en"];

// 連打・機械的な大量登録を止めるための待ち時間(同じユーザー単位)。
const STORE_REGISTRATION_PREVIEW_COOLDOWN_MS = 3 * 1000;
const STORE_REGISTRATION_COOLDOWN_MS = 30 * 1000;

// 「異常な連続登録」の目安：同じユーザーが24時間以内にこの件数を超えて登録したら、
// 以後の登録は運営確認(pending_review)へ回す(登録自体は受け付ける)。
const STORE_RAPID_REGISTRATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const STORE_RAPID_REGISTRATION_LIMIT = 3;

// 「既存店舗との強い重複疑い」：名前(表記ゆれを除いた形)が完全に同じで、
// かつ100m以内。名前が似ているだけ・近いだけでは審査待ちにしない(保守的)。
const STORE_DUPLICATE_RADIUS_KM = 0.1;

const STORE_GEOCODING_TIMEOUT_MS = 8000;

// Google Geocodingの第1行政区分の略称(short_name)が、ISO 3166-2の地域コードと
// 一致することを確認できている国だけ、日本以外でもregionKeyを作る。
// それ以外の国は空文字にする(国・座標が正しく保存されることを優先)。
const REGION_KEY_SHORT_NAME_COUNTRIES = ["US", "CA", "AU"];

// 住所の結果がこれらの種類「だけ」の場合は、店舗の位置として粗すぎる
// (国・都道府県・市区町村の中心点等)ため登録しない。
const COARSE_GEOCODE_RESULT_TYPES = [
  "political",
  "country",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "administrative_area_level_4",
  "administrative_area_level_5",
  "colloquial_area",
  "locality",
  "sublocality",
  "sublocality_level_1",
  "postal_code",
  "postal_code_prefix",
  "natural_feature"
];


function readTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function countCharacters(text) {
  return Array.from(text).length;
}

// 1行テキスト。上限超過・改行・制御文字を含む場合はnull(=不正)を返す。
function readSingleLineText(value, maxLength) {
  const text = readTrimmedString(value);

  if (
    countCharacters(text) > maxLength ||
    /[\u0000-\u001F\u007F]/.test(text)
  ) {
    return null;
  }

  return text;
}

function readCountryCode(value) {
  const code = readTrimmedString(value).toUpperCase();

  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function readCoordinate(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

// 重複判定用の店名。全角半角・大文字小文字・空白・記号の違いだけを無視する。
export function normalizeStoreNameForMatching(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function readStoreRegistrationInput(body) {
  const storeName = readSingleLineText(body.storeName, STORE_NAME_MAX_LENGTH);

  if (storeName === null || storeName === "") {
    return { ok: false, field: "storeName" };
  }

  const categoryCode = readTrimmedString(body.categoryCode);

  if (!STORE_CATEGORY_CODES.includes(categoryCode)) {
    return { ok: false, field: "categoryCode" };
  }

  const countryCode = readCountryCode(body.countryCode);

  if (countryCode === "") {
    return { ok: false, field: "countryCode" };
  }

  const address = readSingleLineText(body.address, STORE_ADDRESS_MAX_LENGTH);

  if (address === null || address === "") {
    return { ok: false, field: "address" };
  }

  const sourceLanguage = STORE_SOURCE_LANGUAGES.includes(body.sourceLanguage)
    ? body.sourceLanguage
    : "ja";

  return {
    ok: true,
    storeName: storeName,
    categoryCode: categoryCode,
    countryCode: countryCode,
    address: address,
    sourceLanguage: sourceLanguage
  };
}

function readLocationInput(body) {
  const countryCode = readCountryCode(body.countryCode);

  if (countryCode === "") {
    return { ok: false, field: "countryCode" };
  }

  const address = readSingleLineText(body.address, STORE_ADDRESS_MAX_LENGTH);

  if (address === null || address === "") {
    return { ok: false, field: "address" };
  }

  return { ok: true, countryCode: countryCode, address: address };
}

function buildRegionKeyForCountry(countryCode, adminArea1) {
  if (!adminArea1) {
    return "";
  }

  if (countryCode === "JP") {
    return buildImadakeRegionKey(countryCode, adminArea1.long_name);
  }

  const shortName =
    typeof adminArea1.short_name === "string" ? adminArea1.short_name.trim() : "";

  if (
    REGION_KEY_SHORT_NAME_COUNTRIES.includes(countryCode) &&
    /^[A-Z]{2,3}$/.test(shortName)
  ) {
    return countryCode + "-" + shortName;
  }

  return "";
}

// 住所 → 座標・国・第1行政区分・市区町村(サーバー側Google Geocoding)。
// 既存の運営用geocodeStoreAddress()(日本・日本語固定)は変更せず、こちらは
// 店舗が選んだ国(components=country:XX)の中だけで検索する。地名は日本なら
// 日本語、それ以外は英語で取得する(運営登録店舗の日本語表記と揃えるため)。
// 失敗時は例外を投げず{ ok:false, reason }を返す(呼び出し元は何も保存しない)。
export async function geocodeStoreAddressInCountry(
  address,
  countryCode,
  deps
) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return { ok: false, reason: "geocoding_unavailable" };
  }

  const requestUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  requestUrl.searchParams.set("address", address);
  requestUrl.searchParams.set("components", "country:" + countryCode);
  requestUrl.searchParams.set("region", countryCode.toLowerCase());
  requestUrl.searchParams.set("language", countryCode === "JP" ? "ja" : "en");
  requestUrl.searchParams.set("key", apiKey);

  const abortController = new AbortController();
  const timeoutId = setTimeout(function() {
    abortController.abort();
  }, STORE_GEOCODING_TIMEOUT_MS);

  let responseData;

  try {
    const response = await fetch(requestUrl, { signal: abortController.signal });
    responseData = await response.json();
  } catch (error) {
    return { ok: false, reason: "geocoding_unavailable" };
  } finally {
    clearTimeout(timeoutId);
  }

  if (responseData && responseData.status === "ZERO_RESULTS") {
    return { ok: false, reason: "address_not_found" };
  }

  if (
    !responseData ||
    responseData.status !== "OK" ||
    !Array.isArray(responseData.results) ||
    responseData.results.length === 0
  ) {
    return { ok: false, reason: "geocoding_unavailable" };
  }

  const result = responseData.results[0];
  const components = result.address_components;
  const resultTypes = Array.isArray(result.types) ? result.types : [];

  if (
    resultTypes.length === 0 ||
    resultTypes.every(function(type) {
      return COARSE_GEOCODE_RESULT_TYPES.includes(type);
    })
  ) {
    return { ok: false, reason: "location_too_coarse" };
  }

  const country = deps.findAddressComponentByType(components, "country");
  const resolvedCountryCode =
    country && typeof country.short_name === "string"
      ? country.short_name.toUpperCase()
      : "";

  if (resolvedCountryCode !== countryCode) {
    return { ok: false, reason: "country_mismatch" };
  }

  const location = result.geometry && result.geometry.location ? result.geometry.location : null;
  const latitude = location ? readCoordinate(location.lat, -90, 90) : null;
  const longitude = location ? readCoordinate(location.lng, -180, 180) : null;

  if (latitude === null || longitude === null) {
    return { ok: false, reason: "address_not_found" };
  }

  const adminArea1 = deps.findAddressComponentByType(components, "administrative_area_level_1");
  const locality = deps.findAddressComponentByType(components, "locality");
  const postalTown = deps.findAddressComponentByType(components, "postal_town");
  const adminArea2 = deps.findAddressComponentByType(components, "administrative_area_level_2");
  const sublocality1 = deps.findAddressComponentByType(components, "sublocality_level_1");
  const longName = function(component) {
    return component && typeof component.long_name === "string" ? component.long_name : "";
  };

  let city = longName(locality) || longName(postalTown);

  // 政令指定都市の区(例：大阪市＋北区)は、運営登録店舗と同じ「大阪市北区」の形にする。
  if (
    countryCode === "JP" &&
    city.endsWith("市") &&
    longName(sublocality1).endsWith("区")
  ) {
    city = city + longName(sublocality1);
  }

  if (city === "") {
    city = longName(adminArea2) || longName(sublocality1);
  }

  return {
    ok: true,
    latitude: latitude,
    longitude: longitude,
    countryCode: countryCode,
    // 項目名は運営登録店舗(STEP 4A)に合わせてprefectureのまま。日本以外では
    // 「第1行政区分(州・省等)」の名前を入れる。
    prefecture: longName(adminArea1),
    city: city,
    regionKey: buildRegionKeyForCountry(countryCode, adminArea1),
    formattedAddress: typeof result.formatted_address === "string" ? result.formatted_address : "",
    partialMatch: result.partial_match === true
  };
}

function sendError(response, status, reason, extra) {
  return response.status(status).json(
    Object.assign({ success: false, reason: reason }, extra || {})
  );
}

// ログイン済み・メール確認済みの店舗アカウントだけを通す。権限判定はuidだけで行う。
async function requireVerifiedStoreUser(request, response, deps) {
  const result = await deps.resolveStoreUserActor(request);

  if (!result.ok) {
    sendError(response, result.status, result.status === 401 ? "login_required" : "store_account_required");
    return null;
  }

  if (result.actor.emailVerified !== true) {
    sendError(response, 403, "email_not_verified");
    return null;
  }

  return result.actor;
}

function buildPublicLocation(location) {
  return {
    formattedAddress: location.formattedAddress,
    countryCode: location.countryCode,
    prefecture: location.prefecture,
    city: location.city,
    regionKey: location.regionKey,
    latitude: location.latitude,
    longitude: location.longitude,
    partialMatch: location.partialMatch
  };
}

// 既存の店舗(運営登録・セルフ登録のstoreAccounts、運営無料店舗submissions)の中に、
// 同じ名前で100m以内のものがあるかを調べる。読むだけで、何も書き換えない。
async function findStrongDuplicates(database, candidate, uid) {
  const normalizedName = normalizeStoreNameForMatching(candidate.storeName);

  if (normalizedName === "") {
    return [];
  }

  const matches = [];
  const isStrongMatch = function(name, latitude, longitude) {
    return (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      normalizeStoreNameForMatching(name) === normalizedName &&
      computeTownNowDistanceKm(candidate.latitude, candidate.longitude, latitude, longitude) <=
        STORE_DUPLICATE_RADIUS_KM
    );
  };

  const storeAccountsSnapshot = await database.collection(STORE_ACCOUNTS_COLLECTION).get();

  storeAccountsSnapshot.docs.forEach(function(documentSnapshot) {
    const data = documentSnapshot.data() || {};

    if (isStrongMatch(data.storeName, data.latitude, data.longitude)) {
      matches.push({
        source: "storeAccounts",
        id: documentSnapshot.id,
        sameOwner:
          data.createdByType === "storeUser" &&
          data.createdByUid === uid &&
          data.registrationStatus !== "rejected"
      });
    }
  });

  const freeListingsSnapshot = await database
    .collection("submissions")
    .where("isPermanentAd", "==", true)
    .get();

  freeListingsSnapshot.docs.forEach(function(documentSnapshot) {
    const data = documentSnapshot.data() || {};

    if (isStrongMatch(data.shopName, data.latitude, data.longitude)) {
      matches.push({ source: "submissions", id: documentSnapshot.id, sameOwner: false });
    }
  });

  return matches;
}

async function countRecentRegistrationsByUser(database, uid) {
  const snapshot = await database
    .collection(STORE_MEMBERS_COLLECTION)
    .where("uid", "==", uid)
    .get();

  const since = Date.now() - STORE_RAPID_REGISTRATION_WINDOW_MS;

  return snapshot.docs.filter(function(documentSnapshot) {
    const data = documentSnapshot.data() || {};

    return (
      data.role === "owner" &&
      data.createdAt &&
      typeof data.createdAt.toMillis === "function" &&
      data.createdAt.toMillis() >= since
    );
  }).length;
}


// mode: storeRegistrationPreview (POST、メール確認済み店舗アカウント)
// { countryCode, address } → 所在地の確認結果だけを返す。何も保存しない。
export async function handleStoreRegistrationPreview(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const input = readLocationInput(deps.readRequestBody(request));

    if (!input.ok) {
      return sendError(response, 400, "invalid_input", { field: input.field });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const allowed = await deps.claimRateLimit(
      database,
      STORE_REGISTRATION_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeRegistrationPreview", actor.uid),
      STORE_REGISTRATION_PREVIEW_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const location = await geocodeStoreAddressInCountry(input.address, input.countryCode, deps);

    if (!location.ok) {
      return sendError(response, location.reason === "geocoding_unavailable" ? 503 : 400, location.reason);
    }

    return response.status(200).json({
      success: true,
      location: buildPublicLocation(location)
    });
  } catch (error) {
    console.error("セルフ店舗登録：所在地確認エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// mode: storeSelfRegister (POST、メール確認済み店舗アカウント)
// { storeName, categoryCode, countryCode, address, sourceLanguage }
// 所在地はクライアントの値を信用せず、サーバーで改めてGeocodingして確定する。
export async function handleStoreSelfRegister(request, response, deps) {
  try {
    const actor = await requireVerifiedStoreUser(request, response, deps);

    if (!actor) {
      return;
    }

    const input = readStoreRegistrationInput(deps.readRequestBody(request));

    if (!input.ok) {
      return sendError(response, 400, "invalid_input", { field: input.field });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const allowed = await deps.claimRateLimit(
      database,
      STORE_REGISTRATION_RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("storeSelfRegister", actor.uid),
      STORE_REGISTRATION_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const location = await geocodeStoreAddressInCountry(input.address, input.countryCode, deps);

    if (!location.ok) {
      return sendError(response, location.reason === "geocoding_unavailable" ? 503 : 400, location.reason);
    }

    const duplicates = await findStrongDuplicates(
      database,
      {
        storeName: input.storeName,
        latitude: location.latitude,
        longitude: location.longitude
      },
      actor.uid
    );

    if (duplicates.some(function(match) { return match.sameOwner; })) {
      return sendError(response, 409, "already_registered");
    }

    const reviewFlags = [];

    if (duplicates.length > 0) {
      reviewFlags.push("possible_duplicate");
    }

    if (
      (await countRecentRegistrationsByUser(database, actor.uid)) >= STORE_RAPID_REGISTRATION_LIMIT
    ) {
      reviewFlags.push("rapid_registrations");
    }

    const registrationStatus = reviewFlags.length > 0 ? "pending_review" : "active";
    const storeRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc();
    const storeId = storeRef.id;
    const memberRef = database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + actor.uid);
    const profileRef = database.collection(STORE_PROFILES_COLLECTION).doc(storeId);

    await database.runTransaction(async function(transaction) {
      const existing = await Promise.all([
        transaction.get(storeRef),
        transaction.get(memberRef),
        transaction.get(profileRef)
      ]);

      if (existing.some(function(snapshot) { return snapshot.exists; })) {
        throw new Error("store_id_collision");
      }

      // 管理情報。tokenHashは作らない(旧store token経路では操作できない)。
      transaction.set(storeRef, {
        storeName: input.storeName,
        enabled: true,
        createdByType: "storeUser",
        createdByUid: actor.uid,
        registrationStatus: registrationStatus,
        reviewFlags: reviewFlags,
        duplicateCandidates: duplicates.map(function(match) {
          return { source: match.source, id: match.id };
        }),
        address: input.address,
        locationFormattedAddress: location.formattedAddress,
        latitude: location.latitude,
        longitude: location.longitude,
        countryCode: location.countryCode,
        prefecture: location.prefecture,
        city: location.city,
        regionKey: location.regionKey,
        geohash: encodeTownNowGeohash(location.latitude, location.longitude),
        locationSource: "storeSelfGeocode",
        locationUpdatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      transaction.set(memberRef, {
        storeId: storeId,
        uid: actor.uid,
        role: "owner",
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // 常設の公開情報の最低限のdraft。まだ旅行者へは公開しない(2Dで公開)。
      transaction.set(profileRef, {
        storeId: storeId,
        status: "draft",
        storeName: input.storeName,
        categoryCode: input.categoryCode,
        sourceLanguage: input.sourceLanguage,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    return response.status(200).json({
      success: true,
      storeId: storeId,
      registrationStatus: registrationStatus
    });
  } catch (error) {
    console.error("セルフ店舗登録：登録エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// mode: storeMyStores (POST、ログイン済み店舗アカウント)
// 自分がメンバーになっている店舗の概要を返す(複数店舗を前提にした形)。
export async function handleStoreMyStores(request, response, deps) {
  try {
    const result = await deps.resolveStoreUserActor(request);

    if (!result.ok) {
      return sendError(response, result.status, result.status === 401 ? "login_required" : "store_account_required");
    }

    const uid = result.actor.uid;
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const membersSnapshot = await database
      .collection(STORE_MEMBERS_COLLECTION)
      .where("uid", "==", uid)
      .get();

    const memberships = membersSnapshot.docs
      .map(function(documentSnapshot) {
        return documentSnapshot.data() || {};
      })
      .filter(function(member) {
        return member.status === "active" && typeof member.storeId === "string";
      });

    const stores = await Promise.all(
      memberships.map(async function(member) {
        const snapshots = await Promise.all([
          database.collection(STORE_ACCOUNTS_COLLECTION).doc(member.storeId).get(),
          database.collection(STORE_PROFILES_COLLECTION).doc(member.storeId).get()
        ]);

        if (!snapshots[0].exists) {
          return null;
        }

        const account = snapshots[0].data() || {};
        const profile = snapshots[1].exists ? snapshots[1].data() || {} : {};

        return {
          storeId: member.storeId,
          role: member.role,
          storeName: typeof account.storeName === "string" ? account.storeName : "",
          categoryCode: typeof profile.categoryCode === "string" ? profile.categoryCode : "",
          registrationStatus:
            account.enabled !== true && account.registrationStatus === "active"
              ? "suspended"
              : account.registrationStatus || "active",
          profileStatus: typeof profile.status === "string" ? profile.status : "draft",
          countryCode: account.countryCode || "",
          prefecture: account.prefecture || "",
          city: account.city || "",
          formattedAddress: account.locationFormattedAddress || account.address || "",
          createdAtMillis:
            account.createdAt && typeof account.createdAt.toMillis === "function"
              ? account.createdAt.toMillis()
              : 0
        };
      })
    );

    return response.status(200).json({
      success: true,
      stores: stores
        .filter(Boolean)
        .sort(function(first, second) {
          return first.createdAtMillis - second.createdAtMillis;
        })
    });
  } catch (error) {
    console.error("セルフ店舗登録：店舗一覧エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}


// mode: adminStoreRegistrationReview (POST、admin専用)
// { storeId, decision: "approve" | "reject", reason }。運営確認待ち(pending_review)
// のセルフ登録店舗だけが対象。approve → active、reject → rejected(enabled:false)。
export async function handleAdminStoreRegistrationReview(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult || !authResult.ok) {
      return response.status((authResult && authResult.status) || 403).json({
        success: false,
        message: (authResult && authResult.message) || "管理者権限が必要です。"
      });
    }

    const body = deps.readRequestBody(request);
    const storeId = readTrimmedString(body.storeId);
    const decision = body.decision;
    const reason = readSingleLineText(body.reason, STORE_REVIEW_REASON_MAX_LENGTH);

    if (
      storeId === "" ||
      storeId.length > 100 ||
      (decision !== "approve" && decision !== "reject") ||
      reason === null
    ) {
      return sendError(response, 400, "invalid_input");
    }

    const database = authResult.database;
    const storeRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const snapshot = await transaction.get(storeRef);

      if (!snapshot.exists) {
        outcome = { status: 404, reason: "not_found" };
        return;
      }

      const data = snapshot.data() || {};

      if (data.createdByType !== "storeUser" || data.registrationStatus !== "pending_review") {
        outcome = { status: 409, reason: "not_pending_review" };
        return;
      }

      const nextStatus = decision === "approve" ? "active" : "rejected";

      transaction.update(storeRef, {
        registrationStatus: nextStatus,
        enabled: decision === "approve",
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedByUid: authResult.actor.uid,
        reviewDecision: decision,
        reviewReason: reason,
        updatedAt: FieldValue.serverTimestamp()
      });

      outcome = { status: 200, registrationStatus: nextStatus };
    });

    if (outcome.status !== 200) {
      return sendError(response, outcome.status, outcome.reason);
    }

    return response.status(200).json({
      success: true,
      registrationStatus: outcome.registrationStatus
    });
  } catch (error) {
    console.error("セルフ店舗登録：運営確認エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
