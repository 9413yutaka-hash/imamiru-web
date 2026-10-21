// ==========================================================================
// STEP 40-A｜運営管理型・常設店舗広告(isPermanentAd:true)の営業時間・定休日
// ==========================================================================
// api/admin-post.js(新規)と api/admin-submission-update.js(編集)の両方から使う解析処理。
// このファイルはVercel Functionではない(api/_lib)。
//
// 保存するフィールド(submissions、常設店舗広告だけ):
//   businessStartTime / businessEndTime  既存の店舗投稿(post.html)と同じフィールド・同じ "HH:MM" 形式を再利用する。
//                                        開店・閉店は30分刻み。両方空(未設定)か両方入力。閉店が開店より前なら翌日まで(日跨ぎ)。
//   closedDays                            定休日。曜日コード(mon..sun)の配列。月→日の順・重複なし。空配列は未設定。
//   irregularClosed                       不定休なら true。
// どれも任意。未設定(空)の項目は旅行者側に表示しない。
// ==========================================================================

export const PERMANENT_AD_CLOSED_DAY_CODES =
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const PERMANENT_AD_TIME_PATTERN =
  /^([01][0-9]|2[0-3]):(00|30)$/;

function readTime(value, label) {
  const text = typeof value === "string" ? value.trim() : "";

  if (text === "") {
    return "";
  }

  if (!PERMANENT_AD_TIME_PATTERN.test(text)) {
    throw new Error(label + "の時刻が正しくありません。");
  }

  return text;
}

// 不正な時刻・片方だけの入力・開店と閉店が同じ時刻は保存しない(例外のメッセージを画面に返す)。
// 定休日は許可された曜日コードだけを残す(不正な値は無視する。takeout/paymentMethodsと同じ安全側の扱い)。
export function readPermanentAdHours(requestBody) {
  const source = requestBody && typeof requestBody === "object" ? requestBody : {};
  const businessStartTime = readTime(source.businessStartTime, "開店");
  const businessEndTime = readTime(source.businessEndTime, "閉店");

  if ((businessStartTime === "") !== (businessEndTime === "")) {
    throw new Error("営業時間は開店と閉店の両方を選んでください（未設定にする場合は両方とも「未設定」）。");
  }

  if (businessStartTime !== "" && businessStartTime === businessEndTime) {
    throw new Error("営業時間の開店と閉店が同じ時刻です。");
  }

  const requestedDays = Array.isArray(source.closedDays) ? source.closedDays : [];
  const closedDays = PERMANENT_AD_CLOSED_DAY_CODES.filter(function(code) {
    return requestedDays.includes(code);
  });

  return {
    businessStartTime: businessStartTime,
    businessEndTime: businessEndTime,
    closedDays: closedDays,
    irregularClosed: source.irregularClosed === true
  };
}
