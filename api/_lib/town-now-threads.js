// 街の今スレッド Phase 1B-1｜親スレッドのサーバー基盤。
//
// 「話題になっている場所」に紐づく、その地域の「その日だけ」のスレッド。
// 発信者の現在地は話題の場所を指定する手段にすぎず、投稿できる地域を制限しない。
//
// このモジュールはVercel Functionではない(api/_lib/。先頭"_"のためFunction化
// されず、api/配下のため静的配信もされない)。api/moderate-submission.js
// がmode(townNowThreadCreate/townNowThreadsList/townNowThreadGet)を受けて
// 呼び出す。地域検証・連投対策・Moderation等の既存処理は、moderate-submission.js
// から関数参照(deps)として受け取って再利用する(既存関数の移動・コピー・
// exportの追加はしない、既存Moderation経路は変更しない)。
//
// 保存先はtownNowThreads/townNowRateLimitsのみ。submissions・
// communityBoardPostsには書き込まない。地域台帳(regions/
// regionsByGooglePlaceId)は既存掲示板と共有する(新しい地域の場合のみ、
// 既存resolveOrCreateCommunityBoardRegion()が掲示板と同じ仕組みで追加する)。

import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  getAuth
} from "firebase-admin/auth";

import tzlookup from "@photostructure/tz-lookup";


export const TOWN_NOW_THREADS_COLLECTION =
  "townNowThreads";

export const TOWN_NOW_RATE_LIMITS_COLLECTION =
  "townNowRateLimits";

// 親スレッドは同じ投稿元から60秒に1件まで。
export const TOWN_NOW_THREAD_RATE_LIMIT_COOLDOWN_MILLISECONDS =
  60 * 1000;

// 今日の地域スレッド一覧の1回の取得上限。
export const TOWN_NOW_THREADS_LIST_LIMIT =
  20;

export const TOWN_NOW_PLACE_TYPES =
  ["current_location", "municipality"];

// 座標を持たない話題地域(市区町村選択)のタイムゾーン。
// Phase 1は日本国内の地域だけを扱う(既存resolveOrCreateCommunityBoardRegion()
// もJP以外を受け付けない)ため、登録されている国だけを返し、それ以外はnull
// (=投稿・一覧の対象外)にする。全世界をAsia/Tokyo扱いにはしない。
const TOWN_NOW_COUNTRY_TIME_ZONES =
  {
    JP: "Asia/Tokyo"
  };

// 現在地由来の座標を約1kmのグリッドへ丸める。緯度は0.01度(南北約1.11km、
// 地球上どこでもほぼ一定)。経度の1度の長さは緯度によって変わる(cos(緯度)倍)
// ため、経度の刻みを0.01度/cos(丸めた緯度)にして、東西方向も約1.11kmに揃える。
// 生のGPS座標は保存しない。
const TOWN_NOW_COORDINATE_LATITUDE_STEP_DEGREES =
  0.01;

const TOWN_NOW_COORDINATE_MAX_ABS_LATITUDE =
  85;

export function roundTownNowCoordinates(
  latitude,
  longitude
) {
  const roundedLatitude =
    Math.round(
      latitude /
        TOWN_NOW_COORDINATE_LATITUDE_STEP_DEGREES
    ) *
    TOWN_NOW_COORDINATE_LATITUDE_STEP_DEGREES;

  const cosine =
    Math.cos(
      Math.min(
        Math.abs(roundedLatitude),
        TOWN_NOW_COORDINATE_MAX_ABS_LATITUDE
      ) *
        Math.PI /
        180
    );

  const longitudeStep =
    TOWN_NOW_COORDINATE_LATITUDE_STEP_DEGREES /
    cosine;

  let roundedLongitude =
    Math.round(
      longitude /
        longitudeStep
    ) *
    longitudeStep;

  if (roundedLongitude > 180) {
    roundedLongitude -= 360;
  }

  if (roundedLongitude <= -180) {
    roundedLongitude += 360;
  }

  return {
    latitude:
      Number(roundedLatitude.toFixed(6)),
    longitude:
      Number(roundedLongitude.toFixed(6))
  };
}

export function getTownNowCountryTimeZone(
  countryCode
) {
  return typeof countryCode === "string" &&
    Object.prototype.hasOwnProperty.call(
      TOWN_NOW_COUNTRY_TIME_ZONES,
      countryCode
    )
    ? TOWN_NOW_COUNTRY_TIME_ZONES[countryCode]
    : null;
}

export function resolveTimeZoneFromCoordinates(
  latitude,
  longitude
) {
  try {
    const timeZoneId =
      tzlookup(
        latitude,
        longitude
      );

    return typeof timeZoneId === "string" &&
      timeZoneId !== ""
      ? timeZoneId
      : null;
  } catch (error) {
    return null;
  }
}

function readLocalDateTimeParts(
  date,
  timeZone
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }
    ).formatToParts(
      date
    );

  const values =
    {};

  parts.forEach(
    function(part) {
      if (part.type !== "literal") {
        values[part.type] =
          Number(part.value);
      }
    }
  );

  return values;
}

// その地域の日付キー(YYYY-MM-DD)。
export function computeTownNowLocalDateKey(
  date,
  timeZone
) {
  const values =
    readLocalDateTimeParts(
      date,
      timeZone
    );

  return (
    String(values.year).padStart(4, "0") +
    "-" +
    String(values.month).padStart(2, "0") +
    "-" +
    String(values.day).padStart(2, "0")
  );
}

// 指定時刻における、そのタイムゾーンのUTCからのずれ(ミリ秒)。
function getTimeZoneOffsetMilliseconds(
  date,
  timeZone
) {
  const values =
    readLocalDateTimeParts(
      date,
      timeZone
    );

  const localAsUtc =
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

  return (
    localAsUtc -
    (Math.floor(date.getTime() / 1000) * 1000)
  );
}

// その地域の「次の0:00」。投稿時刻＋24時間ではない
// (08:00投稿→当日24:00、23:55投稿→5分後)。
export function computeTownNowNextLocalMidnight(
  date,
  timeZone
) {
  const values =
    readLocalDateTimeParts(
      date,
      timeZone
    );

  const nextMidnightAsUtc =
    Date.UTC(
      values.year,
      values.month - 1,
      values.day + 1,
      0,
      0,
      0
    );

  let result =
    nextMidnightAsUtc -
    getTimeZoneOffsetMilliseconds(
      new Date(nextMidnightAsUtc),
      timeZone
    );

  // 夏時間の切り替わり付近でずれを再計算する。
  result =
    nextMidnightAsUtc -
    getTimeZoneOffsetMilliseconds(
      new Date(result),
      timeZone
    );

  return new Date(result);
}

function readTownNowText(
  rawText,
  maxLength
) {
  if (typeof rawText !== "string") {
    return "";
  }

  const text =
    rawText.trim();

  if (
    text === "" ||
    text.length > maxLength
  ) {
    return "";
  }

  return text;
}

function readFiniteNumber(
  value,
  min,
  max
) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

function toIsoOrNull(
  value
) {
  return value &&
    typeof value.toDate === "function"
    ? value.toDate().toISOString()
    : null;
}

// 公開レスポンスへ出す項目だけに絞る。authorUid・aiReview*・
// 座標は含めない。
function buildPublicThread(
  threadId,
  data
) {
  return {
    threadId: threadId,
    text: data.text,
    placeType: data.placeType,
    placeLabel: data.placeLabel,
    regionName: data.regionName,
    localDateKey: data.localDateKey,
    commentCount:
      typeof data.commentCount === "number"
        ? data.commentCount
        : 0,
    createdAt: toIsoOrNull(data.createdAt),
    expiresAt: toIsoOrNull(data.expiresAt)
  };
}

function setPublicCache(
  response
) {
  response.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=30, stale-while-revalidate=30"
  );
}

// OpenAI Moderation＋安全重大語チェック。既存のstreet/掲示板と同じ関数・
// 同じ理由文を使う。失敗時・要確認時は必ずpending_review(非公開)に倒す。
async function reviewTownNowText(
  text,
  deps
) {
  const moderationInputData =
    {
      content: text
    };

  let moderationResults;

  try {
    moderationResults =
      await deps.callOpenAiModeration(
        deps.buildModerationInput(
          moderationInputData
        )
      );
  } catch (error) {
    return {
      status: "pending_review",
      aiReviewStatus: "ERROR",
      aiReviewReason:
        deps.classifyModerationError(
          error
        )
    };
  }

  const allSafe =
    Array.isArray(moderationResults) &&
    moderationResults.every(
      function(result) {
        return (
          result &&
          result.flagged === false
        );
      }
    );

  const isSafetyCriticalContent =
    deps.matchesSafetyCriticalKeywords(
      moderationInputData
    );

  if (
    allSafe &&
    !isSafetyCriticalContent
  ) {
    return {
      status: "visible",
      aiReviewStatus: "SAFE",
      aiReviewReason: null
    };
  }

  return {
    status: "pending_review",
    aiReviewStatus: "REVIEW",
    aiReviewReason:
      allSafe && isSafetyCriticalContent
        ? "安全・災害・交通に関する情報の可能性があるため、内容を人間が確認します。"
        : deps.buildReviewReason(
            moderationResults
          )
  };
}


// ------------------------------------------------------------------
// A. 親スレッド作成(POST mode:"townNowThreadCreate"、匿名Firebase Authの
// IDトークン必須)。安全判定まで終えてからFirestoreへ1回だけ保存する。
// ------------------------------------------------------------------
export async function handleTownNowThreadCreate(
  request,
  response,
  deps
) {
  try {
    // 1. 認証
    const idToken =
      deps.readBearerToken(
        request
      );

    if (idToken === "") {
      return response.status(401).json({
        success: false,
        message: "認証情報がありません。"
      });
    }

    const app =
      deps.getFirebaseAdminApp();

    let decodedToken;

    try {
      decodedToken =
        await getAuth(app)
          .verifyIdToken(
            idToken
          );
    } catch (verifyError) {
      return response.status(401).json({
        success: false,
        message: "認証情報が正しくありません。"
      });
    }

    const database =
      deps.getFirestore(app);

    // 2. 入力値検証
    const requestBody =
      deps.readRequestBody(
        request
      );

    const text =
      readTownNowText(
        requestBody.text,
        deps.textMaxLength
      );

    const placeType =
      TOWN_NOW_PLACE_TYPES.includes(
        requestBody.placeType
      )
        ? requestBody.placeType
        : "";

    const googlePlaceId =
      typeof requestBody.googlePlaceId === "string"
        ? requestBody.googlePlaceId.trim()
        : "";

    const clientCountryCode =
      typeof requestBody.countryCode === "string"
        ? requestBody.countryCode.trim()
        : "";

    let rawLatitude = null;
    let rawLongitude = null;

    if (placeType === "current_location") {
      rawLatitude =
        readFiniteNumber(
          requestBody.latitude,
          -90,
          90
        );

      rawLongitude =
        readFiniteNumber(
          requestBody.longitude,
          -180,
          180
        );
    }

    if (
      text === "" ||
      placeType === "" ||
      googlePlaceId === "" ||
      googlePlaceId.length > deps.googlePlaceIdMaxLength ||
      clientCountryCode.length > deps.countryCodeMaxLength ||
      (
        placeType === "current_location" &&
        (rawLatitude === null || rawLongitude === null)
      )
    ) {
      return response.status(400).json({
        success: false,
        message: "入力内容を確認してください。"
      });
    }

    // 3. 話題地域の検証(ブラウザのregionId・地域名は信用しない)
    const regionInfo =
      await deps.resolveOrCreateCommunityBoardRegion(
        database,
        googlePlaceId,
        clientCountryCode
      );

    if (!regionInfo) {
      return response.status(400).json({
        success: false,
        message: "話題の地域を確認できませんでした。時間をおいて、もう一度お試しください。"
      });
    }

    // 4. 地域タイムゾーン(日付キー・次の0:00の基準)
    const timeZone =
      placeType === "current_location"
        ? resolveTimeZoneFromCoordinates(
            rawLatitude,
            rawLongitude
          )
        : getTownNowCountryTimeZone(
            regionInfo.countryCode
          );

    // 現在地の座標が、サーバーで確認した話題地域の国と食い違う場合は
    // 受け付けない(座標由来の日付だけを別の国にずらされないようにする)。
    const countryTimeZone =
      getTownNowCountryTimeZone(
        regionInfo.countryCode
      );

    if (
      !timeZone ||
      !countryTimeZone ||
      timeZone !== countryTimeZone
    ) {
      return response.status(400).json({
        success: false,
        message: "この地域は現在対象外です。"
      });
    }

    // 5. 連投対策(既存claimRateLimit、既存のIPハッシュ方式。IPが
    // 取得できない場合は匿名UIDのハッシュで代替する)
    const ipHash =
      deps.hashClientIpAddress(
        request
      );

    const rateLimitKey =
      ipHash !== ""
        ? ipHash
        : "uid_" + deps.hashText(decodedToken.uid);

    const rateLimitOk =
      await deps.claimRateLimit(
        database,
        TOWN_NOW_RATE_LIMITS_COLLECTION,
        rateLimitKey,
        TOWN_NOW_THREAD_RATE_LIMIT_COOLDOWN_MILLISECONDS
      );

    if (!rateLimitOk) {
      return response.status(429).json({
        success: false,
        message: "短時間に続けて投稿されています。少し待ってから、もう一度お試しください。"
      });
    }

    const now =
      new Date();

    const localDateKey =
      computeTownNowLocalDateKey(
        now,
        timeZone
      );

    const expiresAtDate =
      computeTownNowNextLocalMidnight(
        now,
        timeZone
      );

    // 6. Moderation＋安全重大語 → status
    const review =
      await reviewTownNowText(
        text,
        deps
      );

    // 7. Firestoreへ1回保存(現在地は約1kmへ丸めた座標のみ。
    // 市区町村選択は座標を保存しない)
    const threadData =
      {
        text: text,
        placeType: placeType,
        placeLabel: regionInfo.regionName,
        regionId: regionInfo.regionId,
        regionName: regionInfo.regionName,
        countryCode: regionInfo.countryCode,
        timezone: timeZone,
        localDateKey: localDateKey,
        expiresAt:
          Timestamp.fromDate(
            expiresAtDate
          ),
        status: review.status,
        aiReviewStatus: review.aiReviewStatus,
        aiReviewReason: review.aiReviewReason,
        aiReviewedAt:
          FieldValue.serverTimestamp(),
        aiReviewVersion:
          deps.AI_REVIEW_VERSION,
        commentCount: 0,
        authorUid: decodedToken.uid,
        createdAt:
          FieldValue.serverTimestamp(),
        updatedAt:
          FieldValue.serverTimestamp()
      };

    if (placeType === "current_location") {
      const rounded =
        roundTownNowCoordinates(
          rawLatitude,
          rawLongitude
        );

      threadData.latitude =
        rounded.latitude;

      threadData.longitude =
        rounded.longitude;
    }

    const threadReference =
      await database
        .collection(
          TOWN_NOW_THREADS_COLLECTION
        )
        .add(
          threadData
        );

    // 8. 必要最小限の結果(authorUid・内部判定理由は返さない)
    return response.status(200).json({
      success: true,
      threadId: threadReference.id,
      status: review.status,
      localDateKey: localDateKey,
      expiresAt: expiresAtDate.toISOString()
    });
  } catch (error) {
    console.error(
      "街の今スレッド：作成エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "投稿できませんでした。時間をおいて、もう一度お試しください。"
    });
  }
}


// ------------------------------------------------------------------
// B. 今日の地域スレッド一覧(GET mode=townNowThreadsList、認証不要)。
// googlePlaceId＋countryCodeから既存地域台帳で地域を引く(新規作成はしない)。
// 地域×今日×visibleだけを新しい順に最大20件読む。
// ------------------------------------------------------------------
export async function handleTownNowThreadsList(
  request,
  response,
  deps
) {
  try {
    const query =
      request.query ||
      {};

    const queryCountryCode =
      typeof query.countryCode === "string"
        ? query.countryCode.trim()
        : "";

    const queryGooglePlaceId =
      typeof query.googlePlaceId === "string"
        ? query.googlePlaceId.trim()
        : "";

    const indexKey =
      queryCountryCode.length <= deps.countryCodeMaxLength &&
      queryGooglePlaceId.length <= deps.googlePlaceIdMaxLength
        ? deps.buildCommunityBoardRegionIndexKey(
            queryCountryCode,
            queryGooglePlaceId
          )
        : null;

    if (indexKey === null) {
      return response.status(400).json({
        success: false,
        message: "地域を指定してください。"
      });
    }

    const database =
      deps.getFirestore(
        deps.getFirebaseAdminApp()
      );

    const regionInfo =
      await deps.loadTrustedCommunityBoardRegionInfoByIndexKey(
        database,
        indexKey
      );

    const timeZone =
      regionInfo
        ? getTownNowCountryTimeZone(
            regionInfo.countryCode
          )
        : null;

    if (
      !regionInfo ||
      !timeZone
    ) {
      setPublicCache(
        response
      );

      return response.status(200).json({
        success: true,
        regionName:
          regionInfo
            ? regionInfo.regionName
            : "",
        threads: []
      });
    }

    const now =
      new Date();

    const todayKey =
      computeTownNowLocalDateKey(
        now,
        timeZone
      );

    const snapshot =
      await database
        .collection(
          TOWN_NOW_THREADS_COLLECTION
        )
        .where(
          "regionId",
          "==",
          regionInfo.regionId
        )
        .where(
          "localDateKey",
          "==",
          todayKey
        )
        .where(
          "status",
          "==",
          "visible"
        )
        .orderBy(
          "createdAt",
          "desc"
        )
        .limit(
          TOWN_NOW_THREADS_LIST_LIMIT
        )
        .get();

    const nowMillis =
      now.getTime();

    const threads =
      snapshot.docs
        .map(
          function(documentSnapshot) {
            return {
              id: documentSnapshot.id,
              data: documentSnapshot.data() || {}
            };
          }
        )
        .filter(
          function(item) {
            return (
              item.data.expiresAt &&
              typeof item.data.expiresAt.toMillis === "function" &&
              item.data.expiresAt.toMillis() > nowMillis
            );
          }
        )
        .map(
          function(item) {
            return buildPublicThread(
              item.id,
              item.data
            );
          }
        );

    setPublicCache(
      response
    );

    return response.status(200).json({
      success: true,
      regionName: regionInfo.regionName,
      localDateKey: todayKey,
      threads: threads
    });
  } catch (error) {
    console.error(
      "街の今スレッド：一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "スレッドを取得できませんでした。"
    });
  }
}


// ------------------------------------------------------------------
// C. 親スレッド詳細(GET mode=townNowThreadGet、認証不要)。今回は親だけ返す。
// visible・期限内・その地域の今日のものだけ公開する。
// ------------------------------------------------------------------
export async function handleTownNowThreadGet(
  request,
  response,
  deps
) {
  try {
    const query =
      request.query ||
      {};

    const threadId =
      typeof query.threadId === "string"
        ? query.threadId.trim()
        : "";

    if (!/^[A-Za-z0-9]{1,40}$/.test(threadId)) {
      return response.status(400).json({
        success: false,
        message: "スレッドを指定してください。"
      });
    }

    const database =
      deps.getFirestore(
        deps.getFirebaseAdminApp()
      );

    const documentSnapshot =
      await database
        .collection(
          TOWN_NOW_THREADS_COLLECTION
        )
        .doc(
          threadId
        )
        .get();

    const now =
      new Date();

    const data =
      documentSnapshot.exists
        ? documentSnapshot.data() || {}
        : null;

    const isPublic =
      data !== null &&
      data.status === "visible" &&
      data.expiresAt &&
      typeof data.expiresAt.toMillis === "function" &&
      data.expiresAt.toMillis() > now.getTime() &&
      typeof data.timezone === "string" &&
      data.localDateKey ===
        computeTownNowLocalDateKey(
          now,
          data.timezone
        );

    if (!isPublic) {
      return response.status(404).json({
        success: false,
        message: "このスレッドは見つからないか、公開が終了しました。"
      });
    }

    setPublicCache(
      response
    );

    return response.status(200).json({
      success: true,
      thread:
        buildPublicThread(
          threadId,
          data
        )
    });
  } catch (error) {
    console.error(
      "街の今スレッド：詳細取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "スレッドを取得できませんでした。"
    });
  }
}
