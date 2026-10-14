// ==========================================================================
// 今だけ投稿 収益化 STEP 4-A｜店舗向けCVレポート(読み取り専用、サーバー側のみ)
// ==========================================================================
// POST mode=imadakeStoreCvReport から呼ばれる。ログイン中の店舗本人(既存の
// verifyImadakeStoreActor：店舗アカウントのowner＋利用中の店舗、または旧方式の
// 店舗token)だけが、自分の店舗の今だけ投稿の有効CV件数を、投稿別・日別・月別に見られる。
// 読み取りだけで、CV記録・料金台帳・投稿には一切書き込まない。
//
// 金額は2種類を必ず分けて返す(混同させない)：
//   referenceAmountJpy  料金目安。有効CVが1件以上ある「投稿×日本時間の1日」につき100円で
//                       計算した、有料運用時の目安(請求ではない)。CV記録から計算する。
//   actualChargeJpy     実際の請求額。課金開始前(IMADAKE_CV_BILLING_STARTED=false)は常に0。
//                       課金開始後は、課金対象の投稿の料金台帳(imadakePostDailyCharges)だけから出す。
//
// 返さないもの：旅行者のuid、個々の閲覧記録、店舗本人の閲覧件数(画面に出さない決定)。
// 集計対象の有効CVは counted: true の記録だけ(同じ旅行者の再閲覧・店舗本人の閲覧は含まれない)。
//
// 読み取り費用：店舗の投稿一覧(storeIdの一致だけ＝単一項目インデックスで足りる)を読み、
// 期間内の「投稿×日」ごとに件数集計(count()：該当1,000件ごとに1読み取り)を1回ずつ行う。
// 1投稿は最長24時間なので、日本時間で最大2日にまたがるだけ。料金台帳は、課金開始後かつ
// 課金対象の投稿だけ読む(課金開始前は読まない)。このモジュールはVercel Functionではない。
// ==========================================================================

import {
  IMADAKE_POSTS_COLLECTION,
  IMADAKE_CV_BILLING_STARTED,
  verifyImadakeStoreActor
} from "./imadake.js";

import {
  IMADAKE_CV_VIEWS_COLLECTION,
  IMADAKE_POST_DAILY_CHARGES_COLLECTION,
  IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
  computeImadakeCvDayKey
} from "./imadake-cv.js";

// 表示期間(当月を含む直近の月数)。変更する時はこの値だけを変える。
export const IMADAKE_CV_REPORT_MONTHS =
  3;

// 1回のレポートで集計する投稿数の上限(期間内の新しい順)。超えた分は truncated で知らせる。
export const IMADAKE_CV_REPORT_POST_LIMIT =
  200;

const DAY_MILLIS =
  24 * 60 * 60 * 1000;

function readMillis(
  value
) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

// "YYYY-MM-DD" の翌日(日本時間の日付キーどうしの計算。時差の影響を受けないようUTCで扱う)。
function nextDayKey(
  dayKey
) {
  return new Date(Date.parse(dayKey + "T00:00:00Z") + DAY_MILLIS)
    .toISOString()
    .slice(0, 10);
}

// 当月を含む直近 months か月の期間(日本時間)。
export function computeImadakeCvReportPeriod(
  nowMillis,
  months
) {
  const todayKey =
    computeImadakeCvDayKey(nowMillis);

  const year =
    Number(todayKey.slice(0, 4));

  const monthIndex =
    Number(todayKey.slice(5, 7)) - 1;

  const monthKeys =
    [];

  for (let offset = months - 1; offset >= 0; offset--) {
    const date =
      new Date(Date.UTC(year, monthIndex - offset, 1));

    monthKeys.push(date.toISOString().slice(0, 7));
  }

  return {
    startDate: monthKeys[0] + "-01",
    endDate: todayKey,
    months: monthKeys
  };
}

// 投稿が掲載されていた日本時間の日付(公開日〜終了・期限・現在のうち最も早い時刻)。
function listPostDayKeys(
  post,
  nowMillis
) {
  const publishedAtMillis =
    readMillis(post.publishedAt);

  if (publishedAtMillis === null) {
    return [];
  }

  const candidates =
    [nowMillis];

  const expiresAtMillis =
    readMillis(post.expiresAt);

  if (expiresAtMillis !== null) {
    candidates.push(expiresAtMillis);
  }

  const endedAtMillis =
    readMillis(post.endedAt);

  if (endedAtMillis !== null) {
    candidates.push(endedAtMillis);
  }

  const lastMillis =
    Math.max(publishedAtMillis, Math.min.apply(null, candidates));

  const lastKey =
    computeImadakeCvDayKey(lastMillis);

  const keys =
    [];

  for (
    let key = computeImadakeCvDayKey(publishedAtMillis);
    key <= lastKey && keys.length < 7;
    key = nextDayKey(key)
  ) {
    keys.push(key);
  }

  return keys;
}

function readDisplayStatus(
  post,
  nowMillis
) {
  if (post.status === "published") {
    const expiresAtMillis =
      readMillis(post.expiresAt);

    return expiresAtMillis !== null && expiresAtMillis > nowMillis
      ? "published"
      : "expired";
  }

  return post.status === "ended"
    ? "ended"
    : "expired";
}

function toIsoOrNull(
  value
) {
  const millis =
    readMillis(value);

  return millis === null
    ? null
    : new Date(millis).toISOString();
}

// 1投稿・1日の有効CV件数(件数集計だけ。記録そのものは読まない)。
async function countValidCvs(
  database,
  postId,
  dayKey
) {
  const snapshot =
    await database
      .collection(IMADAKE_CV_VIEWS_COLLECTION)
      .where("postId", "==", postId)
      .where("jstDate", "==", dayKey)
      .where("counted", "==", true)
      .count()
      .get();

  const data =
    snapshot.data() || {};

  return Number(data.count) || 0;
}

// 実際の請求額(課金開始後・課金対象の投稿だけ料金台帳から)。課金開始前は常に0で、台帳も読まない。
async function readActualCharge(
  database,
  postId,
  post,
  dayKey
) {
  if (!IMADAKE_CV_BILLING_STARTED || post.cvBillingEnabled !== true) {
    return 0;
  }

  const snapshot =
    await database
      .collection(IMADAKE_POST_DAILY_CHARGES_COLLECTION)
      .doc(postId + "_" + dayKey)
      .get();

  const charge =
    snapshot.exists
      ? snapshot.data() || {}
      : null;

  return charge && charge.storeId === post.storeId
    ? Number(charge.amountJpy) || 0
    : 0;
}

export async function buildImadakeStoreCvReport(
  database,
  storeId,
  nowMillis,
  options
) {
  const months =
    options && Number.isInteger(options.months) && options.months > 0
      ? options.months
      : IMADAKE_CV_REPORT_MONTHS;

  const period =
    computeImadakeCvReportPeriod(nowMillis, months);

  // 投稿一覧はstoreIdの一致だけで読む(単一項目インデックス。複合インデックス不要)。
  const postsSnapshot =
    await database
      .collection(IMADAKE_POSTS_COLLECTION)
      .where("storeId", "==", storeId)
      .get();

  const candidates =
    [];

  postsSnapshot.docs.forEach(function(documentSnapshot) {
    const post =
      documentSnapshot.data() || {};

    // 念のため投稿側のstoreIdも確認する(他店舗の投稿を混ぜない)。
    if (post.storeId !== storeId) {
      return;
    }

    const dayKeys =
      listPostDayKeys(post, nowMillis).filter(function(dayKey) {
        return dayKey >= period.startDate && dayKey <= period.endDate;
      });

    if (dayKeys.length === 0) {
      return;
    }

    candidates.push({
      postId: documentSnapshot.id,
      post: post,
      dayKeys: dayKeys,
      publishedAtMillis: readMillis(post.publishedAt) || 0
    });
  });

  candidates.sort(function(a, b) {
    return b.publishedAtMillis - a.publishedAtMillis;
  });

  const truncated =
    candidates.length > IMADAKE_CV_REPORT_POST_LIMIT;

  const selected =
    candidates.slice(0, IMADAKE_CV_REPORT_POST_LIMIT);

  const posts =
    await Promise.all(
      selected.map(async function(entry) {
        const days =
          await Promise.all(
            entry.dayKeys.map(async function(dayKey) {
              const counts =
                await Promise.all([
                  countValidCvs(database, entry.postId, dayKey),
                  readActualCharge(database, entry.postId, entry.post, dayKey)
                ]);

              return {
                date: dayKey,
                validCvCount: counts[0],
                referenceAmountJpy: counts[0] > 0 ? IMADAKE_DAILY_CHARGE_AMOUNT_JPY : 0,
                actualChargeJpy: counts[1]
              };
            })
          );

        return {
          postId: entry.postId,
          headline: typeof entry.post.headline === "string" ? entry.post.headline : "",
          categoryCode: typeof entry.post.categoryCode === "string" ? entry.post.categoryCode : "",
          status: readDisplayStatus(entry.post, nowMillis),
          publishedAt: toIsoOrNull(entry.post.publishedAt),
          expiresAt: toIsoOrNull(entry.post.expiresAt),
          endedAt: toIsoOrNull(entry.post.endedAt),
          billingTarget: IMADAKE_CV_BILLING_STARTED && entry.post.cvBillingEnabled === true,
          validCvCount: days.reduce(function(sum, day) { return sum + day.validCvCount; }, 0),
          cvDayCount: days.filter(function(day) { return day.validCvCount > 0; }).length,
          referenceAmountJpy: days.reduce(function(sum, day) { return sum + day.referenceAmountJpy; }, 0),
          actualChargeJpy: days.reduce(function(sum, day) { return sum + day.actualChargeJpy; }, 0),
          days: days
        };
      })
    );

  const monthSummaries =
    period.months.map(function(monthKey) {
      const summary = {
        month: monthKey,
        validCvCount: 0,
        cvDayCount: 0,
        referenceAmountJpy: 0,
        actualChargeJpy: 0
      };

      posts.forEach(function(post) {
        post.days.forEach(function(day) {
          if (day.date.slice(0, 7) === monthKey) {
            summary.validCvCount += day.validCvCount;
            summary.cvDayCount += day.validCvCount > 0 ? 1 : 0;
            summary.referenceAmountJpy += day.referenceAmountJpy;
            summary.actualChargeJpy += day.actualChargeJpy;
          }
        });
      });

      return summary;
    });

  const totals =
    monthSummaries.reduce(
      function(sum, month) {
        return {
          validCvCount: sum.validCvCount + month.validCvCount,
          cvDayCount: sum.cvDayCount + month.cvDayCount,
          referenceAmountJpy: sum.referenceAmountJpy + month.referenceAmountJpy,
          actualChargeJpy: sum.actualChargeJpy + month.actualChargeJpy
        };
      },
      { validCvCount: 0, cvDayCount: 0, referenceAmountJpy: 0, actualChargeJpy: 0 }
    );

  return {
    billingStarted: IMADAKE_CV_BILLING_STARTED,
    dailyChargeAmountJpy: IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
    period: period,
    months: monthSummaries,
    totals: totals,
    posts: posts,
    truncated: truncated
  };
}

// mode: imadakeStoreCvReport (POST)
//   入力 { storeId, token? }。店舗アカウントのIDトークン(Authorization)または旧方式のtoken。
//   本人確認は既存のverifyImadakeStoreActor()だけを使い、確認できたstoreIdのデータだけを読む。
export async function handleImadakeStoreCvReport(
  request,
  response,
  deps
) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const requestBody =
      deps.readRequestBody(request) || {};

    const database =
      deps.getFirestore(deps.getFirebaseAdminApp());

    const storeValidation =
      await verifyImadakeStoreActor(
        request,
        requestBody,
        database,
        deps
      );

    if (!storeValidation.valid) {
      return response.status(storeValidation.status).json({
        success: false,
        message: storeValidation.message
      });
    }

    const now =
      typeof deps.now === "function"
        ? deps.now
        : Date.now;

    const report =
      await buildImadakeStoreCvReport(
        database,
        storeValidation.storeId,
        now(),
        {}
      );

    return response.status(200).json({
      success: true,
      storeId: storeValidation.storeId,
      storeName: storeValidation.storeName,
      generatedAt: new Date(now()).toISOString(),
      ...report
    });
  } catch (error) {
    console.error("今だけ投稿の成果レポートの作成に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "成果レポートを取得できませんでした。"
    });
  }
}
