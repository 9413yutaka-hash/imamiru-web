// ==========================================================================
// 今だけ投稿 収益化 STEP 2｜CV(成果)の記録と、投稿ごとの日次料金台帳(サーバー側のみ)
// ==========================================================================
// 正式仕様(2026-10-14 代表決定・C案)：同じ旅行者が同じ今だけ投稿の「続きを見る」を
// 初めて押した時に1CV。料金は「1投稿・日本時間の1日」に有効CVが1件以上あれば100円、
// 0件なら0円(同じ日にCVが増えても100円のまま)。事業者単位では合算・上限管理しない。
// POST mode=imadakeDetailOpen から呼ばれ、CVを記録してから詳細本文を返す。
//
// 保存先(書き込みはこのファイルのトランザクションだけ)
//   imadakeCvViews/{postId}_{uid}             旅行者(匿名認証uid)×投稿の初回閲覧(CV)記録
//   imadakePostDailyCharges/{postId}_{日付}   投稿ごと・日本時間の日次料金台帳(課金対象の時だけ)
//
// 課金対象(料金台帳を作る)のは、次をすべて満たす時だけ(代表A案・安全側)：
//   ・投稿にサーバー側で cvBillingEnabled: true が付いている(既存投稿は項目なし＝対象外。
//     このSTEPでは、この項目を付ける処理(課金開始)は作っていない)
//   ・事業者(storeAccounts)が isTestAccount: true ではない
//   ・店舗本人の閲覧ではない(代表B案)
// 料金台帳の金額は「発生した料金の記録」で、決済会社への請求(未実装)とは別。
//
// 店舗本人の閲覧の除外(代表B案)：旅行者の匿名IDトークン(Authorization)とは別に、
// 同じブラウザでログイン中の店舗アカウントのIDトークンを X-Machinau-Store-Authorization
// ヘッダーで受け取れた時だけ、サーバーで検証し、投稿の所有店舗(DB上のstoreId)の
// storeMembersで有効なownerなら除外する。クライアントが送るstoreIdは使わない。
// 店舗トークンが無い時は通常の閲覧として数える。店舗トークンは届いたが検証・照合
// できない時は、本人かもしれないため有効CVにせず、除外できたとも扱わない(記録しない)。
//
// STEP 3｜POST mode=imadakeViewedPosts：画面が「この旅行者が閲覧済みの投稿」を
// サーバー記録(imadakeCvViews)で確かめ、閲覧済みの投稿だけ詳細本文を返す(読み取りのみ)。
//
// IPアドレスは旅行者の識別に使わない。このモジュールはVercel Functionではない。
// ==========================================================================

import {
  Timestamp
} from "firebase-admin/firestore";

import {
  IMADAKE_POSTS_COLLECTION,
  isPublishedAndUnexpired,
  buildImadakePublicPost
} from "./imadake.js";

import {
  computeImadakeTranslationDayKey
} from "./imadake-translation.js";

export const IMADAKE_CV_VIEWS_COLLECTION =
  "imadakeCvViews";

export const IMADAKE_POST_DAILY_CHARGES_COLLECTION =
  "imadakePostDailyCharges";

// 1投稿・日本時間の1日あたりの料金(有効CVが1件以上の日)。
export const IMADAKE_DAILY_CHARGE_AMOUNT_JPY =
  100;

// 店舗アカウントのIDトークンを送るヘッダー(旅行者の匿名IDトークンのAuthorizationとは別)。
export const IMADAKE_STORE_AUTH_HEADER =
  "x-machinau-store-authorization";

const IMADAKE_POST_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

// 日本時間の日付キー(YYYY-MM-DD)。翻訳の日次上限と同じ計算を使う。
export function computeImadakeCvDayKey(
  nowMillis
) {
  return computeImadakeTranslationDayKey(nowMillis);
}

function readBearerFromHeader(
  value
) {
  if (typeof value !== "string") {
    return "";
  }

  const match =
    value.match(/^Bearer\s+(.+)$/);

  return match ? match[1].trim() : "";
}

// 旅行者(匿名認証)のuid。匿名ログインのトークンだけを旅行者として扱う。
// 取得・検証できない時はnull(CV・料金は発生させない。課金対象の投稿は詳細も返さない＝STEP 48-D)。
async function resolveTravelerUid(
  request,
  app,
  deps
) {
  const token =
    readBearerFromHeader(
      request.headers && request.headers.authorization
    );

  if (token === "") {
    return { uid: null, reason: "no_traveler_token" };
  }

  try {
    const decoded =
      await deps.verifyIdToken(app, token);

    const provider =
      decoded &&
      decoded.firebase &&
      typeof decoded.firebase.sign_in_provider === "string"
        ? decoded.firebase.sign_in_provider
        : "";

    if (provider !== "anonymous" || typeof decoded.uid !== "string" || decoded.uid === "") {
      return { uid: null, reason: "not_anonymous_traveler" };
    }

    return { uid: decoded.uid, reason: "" };
  } catch (error) {
    return { uid: null, reason: "traveler_token_invalid" };
  }
}

// 店舗本人の閲覧か。
//   { owner: true }            店舗トークンを検証でき、投稿の所有店舗の有効なownerと確認できた
//   { owner: false }           店舗トークンが無い、または検証できた別店舗・非ownerのアカウント
//   { unverifiable: true }     店舗トークンは届いたが検証・照合できなかった(期限切れ・不正・
//                              店舗アカウント以外のトークン・読み取り失敗)。本人かもしれないため
//                              有効CVにはせず、除外できたとも扱わない(呼び出し元でCVを記録しない)。
async function isStoreOwnerViewing(
  request,
  app,
  database,
  postStoreId,
  deps
) {
  const token =
    readBearerFromHeader(
      request.headers && request.headers[IMADAKE_STORE_AUTH_HEADER]
    );

  if (token === "") {
    return { owner: false, unverifiable: false };
  }

  if (typeof postStoreId !== "string" || postStoreId === "") {
    return { owner: false, unverifiable: true };
  }

  let decoded;

  try {
    decoded =
      await deps.verifyIdToken(app, token);
  } catch (error) {
    return { owner: false, unverifiable: true };
  }

  const provider =
    decoded &&
    decoded.firebase &&
    typeof decoded.firebase.sign_in_provider === "string"
      ? decoded.firebase.sign_in_provider
      : "";

  if (provider !== "password" || typeof decoded.uid !== "string" || decoded.uid === "") {
    return { owner: false, unverifiable: true };
  }

  let memberSnapshot;

  try {
    memberSnapshot =
      await database
        .collection("storeMembers")
        .doc(postStoreId + "_" + decoded.uid)
        .get();
  } catch (error) {
    console.error("今だけ投稿の店舗本人確認に失敗しました：", error);

    return { owner: false, unverifiable: true };
  }

  const member =
    memberSnapshot.exists
      ? memberSnapshot.data() || {}
      : null;

  // 店舗の状態(審査待ち・停止中など)に関係なく、その店舗の有効なownerなら本人とみなす。
  const isOwner =
    !!member &&
    member.uid === decoded.uid &&
    member.storeId === postStoreId &&
    member.role === "owner" &&
    member.status === "active";

  return { owner: isOwner, unverifiable: false };
}

// 料金台帳を作ってよいか(サーバー側の項目だけで判定)。
function readBillingEligibility(
  post,
  storeAccount
) {
  if (post.cvBillingEnabled !== true) {
    return { billable: false, reason: "billing_not_enabled" };
  }

  if (storeAccount && storeAccount.isTestAccount === true) {
    return { billable: false, reason: "test_account" };
  }

  return { billable: true, reason: "" };
}

// 初回閲覧(CV)と日次料金台帳を、1つのトランザクションで確定する。
//   status "new"      今回が初回(CVを記録した)
//   status "existing" 同じ旅行者・同じ投稿の記録が既にある(CVを増やさない)
//   status "unavailable" 投稿が公開中でない・期限切れ(記録しない)
async function recordImadakeCv(
  database,
  postId,
  uid,
  nowMillis,
  options
) {
  const postRef =
    database.collection(IMADAKE_POSTS_COLLECTION).doc(postId);

  const viewRef =
    database.collection(IMADAKE_CV_VIEWS_COLLECTION).doc(postId + "_" + uid);

  const jstDate =
    computeImadakeCvDayKey(nowMillis);

  const chargeRef =
    database.collection(IMADAKE_POST_DAILY_CHARGES_COLLECTION).doc(postId + "_" + jstDate);

  return database.runTransaction(
    async function(transaction) {
      const postSnapshot =
        await transaction.get(postRef);

      const viewSnapshot =
        await transaction.get(viewRef);

      const chargeSnapshot =
        await transaction.get(chargeRef);

      const post =
        postSnapshot.exists
          ? postSnapshot.data() || {}
          : null;

      if (post === null || !isPublishedAndUnexpired(post, nowMillis)) {
        return { status: "unavailable" };
      }

      if (viewSnapshot.exists) {
        return { status: "existing", post: post };
      }

      const storeId =
        typeof post.storeId === "string" ? post.storeId : "";

      const eligibility =
        readBillingEligibility(post, options.storeAccount);

      const counted =
        !options.storeOwnerViewing;

      const billable =
        counted && eligibility.billable;

      transaction.set(viewRef, {
        postId: postId,
        storeId: storeId,
        uid: uid,
        firstOpenedAt: Timestamp.fromMillis(nowMillis),
        jstDate: jstDate,
        counted: counted,
        excludedReason: counted ? "" : "store_owner_view",
        billable: billable,
        billingExcludedReason:
          billable
            ? ""
            : counted
              ? eligibility.reason
              : "store_owner_view"
      });

      if (billable) {
        const charge =
          chargeSnapshot.exists
            ? chargeSnapshot.data() || {}
            : null;

        if (charge) {
          transaction.update(chargeRef, {
            validCvCount: (Number(charge.validCvCount) || 0) + 1,
            lastCvAt: Timestamp.fromMillis(nowMillis)
          });
        } else {
          transaction.set(chargeRef, {
            postId: postId,
            storeId: storeId,
            jstDate: jstDate,
            validCvCount: 1,
            firstCvAt: Timestamp.fromMillis(nowMillis),
            lastCvAt: Timestamp.fromMillis(nowMillis),
            amountJpy: IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
            currency: "JPY",
            // 発生した料金の記録。決済会社への請求は未実装(別の状態で管理する)。
            status: "accrued"
          });
        }
      }

      return {
        status: "new",
        post: post,
        counted: counted,
        billable: billable
      };
    }
  );
}

// STEP 48-D｜CVの成立を確認できない時の応答。課金対象の投稿(cvBillingEnabled)は詳細を公開せず、
// 再試行できるエラーにする。課金対象外の投稿は従来どおり詳細を返す(CV・料金は発生させない)。
function respondWithoutCv(
  response,
  postId,
  post,
  statusCode,
  reason
) {
  if (post.cvBillingEnabled === true) {
    return response.status(statusCode).json({
      success: false,
      retryable: true,
      reason: reason,
      message: "詳細を読み込めませんでした。もう一度お試しください。"
    });
  }

  return response.status(200).json({
    success: true,
    post: buildImadakePublicPost(postId, post),
    cv: { status: "not_recorded" }
  });
}

// mode: imadakeDetailOpen (POST)
//   入力 { postId }。Authorization：旅行者の匿名認証IDトークン(無い・不正の時はCVを記録しない)。
//        X-Machinau-Store-Authorization：任意。ログイン中の店舗アカウントのIDトークン(本人閲覧の除外用)。
//   出力 { success, post: 公開用の詳細, cv: { status: "new"|"existing"|"not_recorded" } }
//   公開中でない・期限切れ・存在しない投稿は404(既存のimadakePostGetと同じ)。
//   STEP 48-D｜CVを記録できない時(旅行者トークン無し・不正、店舗の本人確認不能、読み取り・記録の失敗)：
//   課金対象の投稿(cvBillingEnabled)は詳細を返さず { success:false, retryable:true } (respondWithoutCv)。
//   課金対象外の投稿は従来どおり詳細を返す(cv.status "not_recorded")。
export async function handleImadakeDetailOpen(
  request,
  response,
  deps
) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const requestBody =
      deps.readRequestBody(request) || {};

    const postId =
      typeof requestBody.postId === "string"
        ? requestBody.postId.trim()
        : "";

    if (!IMADAKE_POST_ID_PATTERN.test(postId)) {
      return response.status(400).json({
        success: false,
        message: "入力内容を確認してください。"
      });
    }

    const app =
      deps.getFirebaseAdminApp();

    const database =
      deps.getFirestore(app);

    const now =
      typeof deps.now === "function"
        ? deps.now
        : Date.now;

    // 1. 投稿の存在・公開状態・掲載期限
    const postSnapshot =
      await database.collection(IMADAKE_POSTS_COLLECTION).doc(postId).get();

    const post =
      postSnapshot.exists
        ? postSnapshot.data() || {}
        : null;

    if (post === null || !isPublishedAndUnexpired(post, now())) {
      return response.status(404).json({
        success: false,
        message: "この今だけ投稿は掲載されていません。"
      });
    }

    // 2. 旅行者(匿名認証)。確認できない時はCV・料金を発生させない(課金対象の投稿は詳細も返さない)。
    const traveler =
      await resolveTravelerUid(request, app, deps);

    if (!traveler.uid) {
      return respondWithoutCv(response, postId, post, 401, traveler.reason);
    }

    // 3. 除外条件(店舗本人の閲覧・テスト事業者)。投稿の所有店舗はDB上のstoreIdを使う。
    //    確認・読み取りに失敗した時は、誤って有効CV・料金を確定しないよう記録しない
    //    (課金対象の投稿は詳細も返さない)。
    const ownerCheck =
      await isStoreOwnerViewing(request, app, database, post.storeId, deps);

    if (ownerCheck.unverifiable) {
      return respondWithoutCv(response, postId, post, 401, "store_owner_unverifiable");
    }

    let storeAccount =
      null;

    try {
      const storeAccountSnapshot =
        typeof post.storeId === "string" && post.storeId !== ""
          ? await database.collection("storeAccounts").doc(post.storeId).get()
          : null;

      storeAccount =
        storeAccountSnapshot && storeAccountSnapshot.exists
          ? storeAccountSnapshot.data() || {}
          : null;
    } catch (storeAccountError) {
      console.error("今だけ投稿の事業者情報の取得に失敗しました：", storeAccountError);

      return respondWithoutCv(response, postId, post, 503, "store_account_read_failed");
    }

    // 4. 初回CVと日次料金台帳をトランザクションで確定
    let result;

    try {
      result =
        await recordImadakeCv(
          database,
          postId,
          traveler.uid,
          now(),
          {
            storeOwnerViewing: ownerCheck.owner,
            storeAccount: storeAccount
          }
        );
    } catch (recordError) {
      // トランザクションは全部書くか何も書かないため、失敗時は何も記録されていない
      // (書き込み済みで応答だけ失敗した場合も、再試行は既存の記録を見て"existing"になり重複しない)。
      console.error("今だけ投稿のCV記録に失敗しました：", recordError);

      return respondWithoutCv(response, postId, post, 503, "cv_record_failed");
    }

    if (result.status === "unavailable") {
      return response.status(404).json({
        success: false,
        message: "この今だけ投稿は掲載されていません。"
      });
    }

    // 5. 詳細本文(トランザクション内で読んだ最新の投稿)。counted は今回新しく
    //    有効CVになった時だけtrue(画面側の分析用。料金の根拠は台帳だけ)。
    return response.status(200).json({
      success: true,
      post: buildImadakePublicPost(postId, result.post),
      cv: {
        status: result.status,
        counted: result.status === "new" && result.counted === true
      }
    });
  } catch (error) {
    console.error("今だけ投稿の詳細(CV)の取得に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "今だけ投稿を取得できませんでした。"
    });
  }
}

// 一度に確かめる投稿IDの上限(TOPの今だけ投稿の一覧の件数より十分大きい値)。
export const IMADAKE_VIEWED_POSTS_LIMIT =
  20;

// mode: imadakeViewedPosts (POST、読み取りのみ)
//   入力 { postIds: [...] }。Authorization：旅行者の匿名認証IDトークン。
//   出力 { success, posts: [公開用の詳細] }：この旅行者(uid)のCV記録(imadakeCvViews/{postId}_{uid})が
//   あり、今も公開中の投稿だけ。記録の無い投稿・別の旅行者の記録は返さない(投稿全体の閲覧数は
//   使わない)。トークンが無い・不正な時は空(閲覧済みかどうか不明＝画面は初回表示)。
//   旅行者ごとの結果のため共有キャッシュしない。CV・料金は記録しない。
export async function handleImadakeViewedPosts(
  request,
  response,
  deps
) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const requestBody =
      deps.readRequestBody(request) || {};

    const rawPostIds =
      Array.isArray(requestBody.postIds)
        ? requestBody.postIds
        : null;

    if (
      rawPostIds === null ||
      rawPostIds.length > IMADAKE_VIEWED_POSTS_LIMIT ||
      !rawPostIds.every(function(postId) {
        return typeof postId === "string" && IMADAKE_POST_ID_PATTERN.test(postId);
      })
    ) {
      return response.status(400).json({
        success: false,
        message: "入力内容を確認してください。"
      });
    }

    const postIds =
      Array.from(new Set(rawPostIds));

    const app =
      deps.getFirebaseAdminApp();

    const traveler =
      await resolveTravelerUid(request, app, deps);

    if (!traveler.uid || postIds.length === 0) {
      return response.status(200).json({ success: true, posts: [] });
    }

    const database =
      deps.getFirestore(app);

    const now =
      typeof deps.now === "function"
        ? deps.now
        : Date.now;

    const viewSnapshots =
      await Promise.all(
        postIds.map(function(postId) {
          return database
            .collection(IMADAKE_CV_VIEWS_COLLECTION)
            .doc(postId + "_" + traveler.uid)
            .get();
        })
      );

    const viewedPostIds =
      postIds.filter(function(postId, index) {
        return viewSnapshots[index].exists;
      });

    const postSnapshots =
      await Promise.all(
        viewedPostIds.map(function(postId) {
          return database
            .collection(IMADAKE_POSTS_COLLECTION)
            .doc(postId)
            .get();
        })
      );

    const nowMillis =
      now();

    const posts =
      [];

    postSnapshots.forEach(function(snapshot, index) {
      const post =
        snapshot.exists
          ? snapshot.data() || {}
          : null;

      if (post !== null && isPublishedAndUnexpired(post, nowMillis)) {
        posts.push(buildImadakePublicPost(viewedPostIds[index], post));
      }
    });

    return response.status(200).json({ success: true, posts: posts });
  } catch (error) {
    console.error("今だけ投稿の閲覧済み確認に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "閲覧状態を確認できませんでした。"
    });
  }
}
