// 店主向け「この街のマチナウ利用状況」(代表決定 2026-11-05・A案 GA4)。
//
// 旅行者が現在地の取得に成功し、市町村が判定できた時だけ、ブラウザが GA4 へ
// location_area_resolved(area_prefecture・area_city。座標・住所は送らない)を送る(app.js)。
// ここでは次の2つを行う。
//   ①定期実行(30分ごと、合言葉 X-Machinau-Cron-Secret)：GA4 Data API で対象の都道府県の市町村ごとの
//     利用人数(totalUsers＝そのイベントを送った異なる利用者数。GA4 の推定値)と利用回数(eventCount)を
//     今日・過去7日間・過去30日間の3期間まとめて1回で取得し、少人数の秘匿をした後の値だけを Firestore に保存する。
//   ②店主の画面(mode storeAreaUsage)：保存済みの値だけを返す。店主の閲覧で GA4 は呼ばない。
//
// 少人数の秘匿：人数1〜9人は「10人未満」(人数・回数とも返さない)。回数は10回単位に丸める(期間の差から
// 少人数の行動を割り出しにくくする)。GA4 のしきい値で行が伏せられた可能性がある時は0と区別して「非表示」。
// 生の人数・回数は保存しない・返さない。
//
// GA4 の認証は Firebase のサービスアカウント(既存の環境変数。新しい秘密値は作らない)で JWT を署名して行う。
// GA4 の管理画面でこのサービスアカウントに閲覧の権限を付け、Google Cloud で Analytics Data API(と、
// プロパティ ID を自動で探す時は Analytics Admin API)を有効にするまでは、取得は「設定待ち」で止まる。

import {
  createSign,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  Timestamp
} from "firebase-admin/firestore";

import {
  readFirebaseServiceAccountText
} from "./firebase-target.js";

import {
  checkStoreProfileEditor
} from "./store-profile.js";

export const AREA_USAGE_EVENT_NAME = "location_area_resolved";
export const AREA_USAGE_PREFECTURE_PARAM = "area_prefecture";
export const AREA_USAGE_CITY_PARAM = "area_city";
export const GA4_MEASUREMENT_ID = "G-PGM7GNVQX8";

// 人数がこれより少ない時は「10人未満」(回数も出さない)。
export const AREA_USAGE_MIN_USERS = 10;
// 回数の丸めの単位。
export const AREA_USAGE_EVENT_ROUNDING = 10;

export const AREA_USAGE_PERIODS = ["today", "last7Days", "last30Days"];
const PERIOD_DAYS_BACK = { today: 0, last7Days: 6, last30Days: 29 };

// 集計の対象(沖縄41市町村から開始。全国へは都道府県を足すだけで広げられる)。
// 市町村名は japan-municipalities.js(郡名を除いた正式名)と同じ。店舗の所在地(storeAccounts.city)も同じ形。
export const AREA_USAGE_TARGETS = [
  {
    countryCode: "JP",
    prefecture: "沖縄県",
    municipalities: ["那覇市", "宜野湾市", "石垣市", "浦添市", "名護市", "糸満市", "沖縄市", "豊見城市", "うるま市", "宮古島市", "南城市", "国頭村", "大宜味村", "東村", "今帰仁村", "本部町", "恩納村", "宜野座村", "金武町", "伊江村", "読谷村", "嘉手納町", "北谷町", "北中城村", "中城村", "西原町", "与那原町", "南風原町", "渡嘉敷村", "座間味村", "粟国村", "渡名喜村", "南大東村", "北大東村", "伊平屋村", "伊是名村", "久米島町", "八重瀬町", "多良間村", "竹富町", "与那国町"]
  }
];

export const AREA_USAGE_STATS_COLLECTION = "areaUsageStats";
export const AREA_USAGE_STATE_COLLECTION = "areaUsageRefreshState";
const AREA_USAGE_STATE_ID = "ga4";
const REFRESH_LOCK_LEASE_MS = 2 * 60 * 1000;
// 最終更新からこれより経つと、画面に「更新が遅れています」と出す(30分ごとの更新が数回続けて届かない時)。
export const AREA_USAGE_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
// 店主の画面の読み取りの、関数のインスタンスごとの一時保存(同時に多くの店主が開いても Firestore の読み取りを抑える)。
const READ_CACHE_MS = 60 * 1000;

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_DATA_API = "https://analyticsdata.googleapis.com/v1beta/";
const GA4_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta/";

export function areaUsageStatsDocId(countryCode, prefecture) {
  return countryCode + "_" + prefecture;
}

export function findAreaUsageTarget(countryCode, prefecture, city) {
  const target = AREA_USAGE_TARGETS.find(function(entry) {
    return entry.countryCode === countryCode && entry.prefecture === prefecture;
  });

  return target && target.municipalities.includes(city) ? target : null;
}

// ---------- 少人数の秘匿(保存する前に行う) ----------

// row：GA4 の行({ users, events })または null(行が無い)。thresholded：しきい値で伏せられた可能性。
export function suppressAreaUsageValue(row, thresholded) {
  if (!row) {
    return thresholded ? { state: "withheld" } : { state: "zero" };
  }

  const users = Number.isFinite(row.users) ? Math.max(0, Math.floor(row.users)) : 0;
  const events = Number.isFinite(row.events) ? Math.max(0, Math.floor(row.events)) : 0;

  if (users === 0 && events === 0) {
    return thresholded ? { state: "withheld" } : { state: "zero" };
  }

  if (users < AREA_USAGE_MIN_USERS) {
    return { state: "under_min" };
  }

  return {
    state: "ok",
    users: users,
    events: Math.max(AREA_USAGE_EVENT_ROUNDING, Math.round(events / AREA_USAGE_EVENT_ROUNDING) * AREA_USAGE_EVENT_ROUNDING)
  };
}

// ---------- 日付(GA4 のプロパティのタイムゾーン) ----------

export function dateKeyInTimeZone(millis, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(millis));
  const get = function(type) {
    return parts.find(function(part) { return part.type === type; }).value;
  };
  return get("year") + "-" + get("month") + "-" + get("day");
}

function shiftDateKey(dateKey, days) {
  const date = new Date(dateKey + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildAreaUsagePeriods(todayKey) {
  const periods = {};
  AREA_USAGE_PERIODS.forEach(function(period) {
    periods[period] = { startDate: shiftDateKey(todayKey, PERIOD_DAYS_BACK[period]), endDate: todayKey };
  });
  return periods;
}

// ---------- GA4 の認証・呼び出し ----------

export class AreaUsageGa4Error extends Error {
  constructor(code, httpStatus) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus || 0;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function readServiceAccount(env) {
  let text = "";

  try {
    text = readFirebaseServiceAccountText(env);
  } catch (error) {
    throw new AreaUsageGa4Error("service_account_unavailable");
  }

  let account = null;

  try {
    account = JSON.parse(typeof text === "string" ? text : "");
  } catch (error) {
    throw new AreaUsageGa4Error("service_account_unavailable");
  }

  if (!account || typeof account.client_email !== "string" || typeof account.private_key !== "string") {
    throw new AreaUsageGa4Error("service_account_unavailable");
  }

  return account;
}

let cachedAccessToken = { token: "", expiresAtMillis: 0, email: "" };

export function resetAreaUsageCachesForTests() {
  cachedAccessToken = { token: "", expiresAtMillis: 0, email: "" };
  readCache.clear();
}

async function getGa4AccessToken(deps, nowMillis) {
  const account = readServiceAccount(deps.env);

  if (cachedAccessToken.token !== "" && cachedAccessToken.email === account.client_email && cachedAccessToken.expiresAtMillis - 60 * 1000 > nowMillis) {
    return cachedAccessToken.token;
  }

  const issuedAt = Math.floor(nowMillis / 1000);
  const unsigned =
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
    base64Url(JSON.stringify({ iss: account.client_email, scope: GA4_SCOPE, aud: GOOGLE_TOKEN_URL, iat: issuedAt, exp: issuedAt + 3600 }));
  let signature = "";

  try {
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signature = signer.sign(account.private_key).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  } catch (error) {
    throw new AreaUsageGa4Error("service_account_unavailable");
  }

  const response = await deps.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(unsigned + "." + signature)
  });
  const result = await response.json().catch(function() { return null; });

  if (!response.ok || !result || typeof result.access_token !== "string") {
    throw new AreaUsageGa4Error("google_auth_failed", response.status);
  }

  cachedAccessToken = {
    token: result.access_token,
    expiresAtMillis: nowMillis + (Number.isFinite(result.expires_in) ? result.expires_in : 3600) * 1000,
    email: account.client_email
  };
  return cachedAccessToken.token;
}

// Google の API の失敗を、原因が分かる短い記号にする(応答の本文はログに出さない)。
export function classifyGoogleApiError(httpStatus, body, api) {
  const error = body && body.error ? body.error : {};
  const status = typeof error.status === "string" ? error.status : "";
  const message = typeof error.message === "string" ? error.message : "";
  const details = Array.isArray(error.details) ? JSON.stringify(error.details) : "";

  if (httpStatus === 403 && (/SERVICE_DISABLED|has not been used|is disabled/i.test(message + details))) {
    return api === "admin" ? "ga4_admin_api_disabled" : "ga4_data_api_disabled";
  }

  if (httpStatus === 403 || status === "PERMISSION_DENIED") {
    return "ga4_permission_denied";
  }

  if (httpStatus === 400 && /customEvent|dimension/i.test(message)) {
    return "ga4_custom_dimension_missing";
  }

  if (httpStatus === 429 || status === "RESOURCE_EXHAUSTED") {
    return "ga4_quota_exhausted";
  }

  if (httpStatus === 404) {
    return "ga4_property_not_found";
  }

  return "ga4_request_failed";
}

async function callGoogleApi(deps, token, url, method, body, api) {
  const response = await deps.fetch(url, {
    method: method,
    headers: Object.assign({ Authorization: "Bearer " + token }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json().catch(function() { return null; });

  if (!response.ok) {
    throw new AreaUsageGa4Error(classifyGoogleApiError(response.status, result, api), response.status);
  }

  return result || {};
}

// GA4 のプロパティ ID：環境変数 GA4_PROPERTY_ID(数字)があればそれを使う。無ければ、このサービスアカウントが
// 見られるプロパティから、測定 ID G-PGM7GNVQX8 のウェブのデータストリームを持つものを探す(Admin API)。
async function resolveGa4PropertyId(deps, token, state) {
  const fromEnv = deps.env && typeof deps.env.GA4_PROPERTY_ID === "string" ? deps.env.GA4_PROPERTY_ID.trim() : "";

  if (/^[0-9]{1,20}$/.test(fromEnv)) {
    return fromEnv;
  }

  if (typeof state.propertyId === "string" && /^[0-9]{1,20}$/.test(state.propertyId)) {
    return state.propertyId;
  }

  const summaries = await callGoogleApi(deps, token, GA4_ADMIN_API + "accountSummaries?pageSize=200", "GET", null, "admin");
  const properties = [];
  (Array.isArray(summaries.accountSummaries) ? summaries.accountSummaries : []).forEach(function(summary) {
    (Array.isArray(summary.propertySummaries) ? summary.propertySummaries : []).forEach(function(property) {
      if (typeof property.property === "string" && /^properties\/[0-9]+$/.test(property.property)) {
        properties.push(property.property.slice("properties/".length));
      }
    });
  });

  for (const propertyId of properties.slice(0, 20)) {
    const streams = await callGoogleApi(deps, token, GA4_ADMIN_API + "properties/" + propertyId + "/dataStreams?pageSize=200", "GET", null, "admin");
    const matched = (Array.isArray(streams.dataStreams) ? streams.dataStreams : []).some(function(stream) {
      return stream && stream.webStreamData && stream.webStreamData.measurementId === GA4_MEASUREMENT_ID;
    });

    if (matched) {
      return propertyId;
    }
  }

  throw new AreaUsageGa4Error("ga4_property_not_found");
}

function eventFilter(prefectures, extraExpressions) {
  return {
    andGroup: {
      expressions: [
        { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: AREA_USAGE_EVENT_NAME } } },
        { filter: { fieldName: "customEvent:" + AREA_USAGE_PREFECTURE_PARAM, inListFilter: { values: prefectures } } }
      ].concat(extraExpressions || [])
    }
  };
}

function readMetric(row, index) {
  const value = row && Array.isArray(row.metricValues) && row.metricValues[index] ? Number(row.metricValues[index].value) : NaN;
  return Number.isFinite(value) ? value : 0;
}

function readDimension(row, index) {
  return row && Array.isArray(row.dimensionValues) && row.dimensionValues[index] && typeof row.dimensionValues[index].value === "string"
    ? row.dimensionValues[index].value
    : "";
}

// 計測の開始日：対象の地域でこのイベントが最初に記録された日(過去30日の中で)。一度決まったら変えない。
async function findMeasurementStartDate(deps, token, propertyId, prefectures) {
  const report = await callGoogleApi(deps, token, GA4_DATA_API + "properties/" + propertyId + ":runReport", "POST", {
    dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: eventFilter(prefectures, [
      { notExpression: { filter: { fieldName: "customEvent:" + AREA_USAGE_CITY_PARAM, stringFilter: { matchType: "EXACT", value: "(not set)" } } } }
    ]),
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: 40
  }, "data");
  const dates = (Array.isArray(report.rows) ? report.rows : [])
    .filter(function(row) { return readMetric(row, 0) > 0 && /^[0-9]{8}$/.test(readDimension(row, 0)); })
    .map(function(row) {
      const value = readDimension(row, 0);
      return value.slice(0, 4) + "-" + value.slice(4, 6) + "-" + value.slice(6, 8);
    })
    .sort();

  return dates.length > 0 ? dates[0] : "";
}

// 対象の都道府県の市町村×3期間を1回の runReport で取る。
async function fetchAreaUsageReport(deps, token, propertyId, prefectures) {
  return callGoogleApi(deps, token, GA4_DATA_API + "properties/" + propertyId + ":runReport", "POST", {
    dateRanges: AREA_USAGE_PERIODS.map(function(period) {
      return { startDate: PERIOD_DAYS_BACK[period] === 0 ? "today" : PERIOD_DAYS_BACK[period] + "daysAgo", endDate: "today", name: period };
    }),
    dimensions: [
      { name: "customEvent:" + AREA_USAGE_PREFECTURE_PARAM },
      { name: "customEvent:" + AREA_USAGE_CITY_PARAM }
    ],
    metrics: [{ name: "totalUsers" }, { name: "eventCount" }],
    dimensionFilter: eventFilter(prefectures),
    limit: 10000,
    returnPropertyQuota: true
  }, "data");
}

// GA4 の応答 → 保存する文書(都道府県ごと)。
export function buildAreaUsageStatsDocs(report, options) {
  const metadata = report && report.metadata ? report.metadata : {};
  const thresholded = metadata.subjectToThresholding === true || metadata.dataLossFromOtherRow === true;
  const timeZone = typeof metadata.timeZone === "string" && metadata.timeZone !== "" ? metadata.timeZone : "Asia/Tokyo";
  const todayKey = dateKeyInTimeZone(options.nowMillis, timeZone);
  const periods = buildAreaUsagePeriods(todayKey);
  const headers = Array.isArray(report.dimensionHeaders) ? report.dimensionHeaders.map(function(header) { return header.name; }) : [];
  const rangeIndex = headers.indexOf("dateRange");
  const prefectureIndex = headers.indexOf("customEvent:" + AREA_USAGE_PREFECTURE_PARAM);
  const cityIndex = headers.indexOf("customEvent:" + AREA_USAGE_CITY_PARAM);
  const values = new Map();

  (Array.isArray(report.rows) ? report.rows : []).forEach(function(row) {
    const period = rangeIndex >= 0 ? readDimension(row, rangeIndex) : AREA_USAGE_PERIODS[0];
    const key = period + "|" + readDimension(row, prefectureIndex) + "|" + readDimension(row, cityIndex);
    const previous = values.get(key) || { users: 0, events: 0 };
    values.set(key, { users: previous.users + readMetric(row, 0), events: previous.events + readMetric(row, 1) });
  });

  return options.targets.map(function(target) {
    const cities = {};
    target.municipalities.forEach(function(city) {
      cities[city] = {};
      AREA_USAGE_PERIODS.forEach(function(period) {
        cities[city][period] = suppressAreaUsageValue(values.get(period + "|" + target.prefecture + "|" + city) || null, thresholded);
      });
    });

    return {
      id: areaUsageStatsDocId(target.countryCode, target.prefecture),
      data: {
        countryCode: target.countryCode,
        prefecture: target.prefecture,
        source: "ga4",
        timeZone: timeZone,
        periods: periods,
        thresholded: thresholded,
        measurementStartDate: options.measurementStartDate || "",
        cities: cities,
        refreshedAt: Timestamp.fromMillis(options.nowMillis),
        runId: options.runId
      }
    };
  });
}

// ---------- 定期実行 ----------

function readMillis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function readCronSecretHeader(request) {
  const value = request.headers && request.headers["x-machinau-cron-secret"];
  return typeof value === "string" ? value : "";
}

function cronSecretsMatch(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || provided === "" || expected === "") {
    return false;
  }

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

async function acquireRefreshLock(database, runId, nowMillis) {
  const stateRef = database.collection(AREA_USAGE_STATE_COLLECTION).doc(AREA_USAGE_STATE_ID);

  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(stateRef);
    const state = snapshot.exists ? snapshot.data() || {} : {};

    if (state.lockRunId && readMillis(state.lockLeaseUntil) > nowMillis) {
      return null;
    }

    transaction.set(stateRef, { lockRunId: runId, lockLeaseUntil: Timestamp.fromMillis(nowMillis + REFRESH_LOCK_LEASE_MS) }, { merge: true });
    return state;
  });
}

// GA4 から取得して保存する。戻り値 { status: "refreshed" | "failed", ... }。
export async function runAreaUsageRefresh(database, deps, nowMillis, runId) {
  const state = await acquireRefreshLock(database, runId, nowMillis);

  if (state === null) {
    return { status: "already_running" };
  }

  const stateRef = database.collection(AREA_USAGE_STATE_COLLECTION).doc(AREA_USAGE_STATE_ID);
  const everSucceeded = readMillis(state.lastSuccessAt) > 0;

  try {
    const token = await getGa4AccessToken(deps, nowMillis);
    const propertyId = await resolveGa4PropertyId(deps, token, state);
    const prefectures = AREA_USAGE_TARGETS.map(function(target) { return target.prefecture; });
    let measurementStartDate = typeof state.measurementStartDate === "string" ? state.measurementStartDate : "";

    if (measurementStartDate === "") {
      measurementStartDate = await findMeasurementStartDate(deps, token, propertyId, prefectures);
    }

    const report = await fetchAreaUsageReport(deps, token, propertyId, prefectures);
    const docs = buildAreaUsageStatsDocs(report, { nowMillis: nowMillis, runId: runId, targets: AREA_USAGE_TARGETS, measurementStartDate: measurementStartDate });
    const batch = database.batch();

    docs.forEach(function(doc) {
      batch.set(database.collection(AREA_USAGE_STATS_COLLECTION).doc(doc.id), doc.data);
    });
    batch.set(stateRef, {
      lockRunId: "",
      lockLeaseUntil: Timestamp.fromMillis(0),
      propertyId: propertyId,
      measurementStartDate: measurementStartDate,
      lastAttemptAt: Timestamp.fromMillis(nowMillis),
      lastSuccessAt: Timestamp.fromMillis(nowMillis),
      lastErrorCode: "",
      lastRunId: runId
    }, { merge: true });
    await batch.commit();

    const quota = report.propertyQuota && report.propertyQuota.tokensPerDay ? report.propertyQuota.tokensPerDay : null;

    return {
      status: "refreshed",
      prefectures: docs.length,
      rows: Array.isArray(report.rows) ? report.rows.length : 0,
      thresholded: docs.length > 0 ? docs[0].data.thresholded : false,
      measurementStarted: measurementStartDate !== "",
      tokensPerDayRemaining: quota && Number.isFinite(quota.remaining) ? quota.remaining : null
    };
  } catch (error) {
    const code = error instanceof AreaUsageGa4Error ? error.code : "server_error";

    await stateRef.set({
      lockRunId: "",
      lockLeaseUntil: Timestamp.fromMillis(0),
      lastAttemptAt: Timestamp.fromMillis(nowMillis),
      lastErrorCode: code,
      lastRunId: runId
    }, { merge: true });

    // 一度も取得できていない間は、GA4・Google Cloud の設定待ち(代表の操作)として扱う。
    return { status: "failed", errorCode: code, setupPending: !everSucceeded };
  }
}

// mode: areaUsageRefresh (POST、定期実行。合言葉は他の定期実行と同じ AI_COLLECT_CRON_SECRET)
// Production だけで GA4 を読む(Preview の Firebase は本番の GA4 の権限を持たない・Preview から本番の数値を作らない)。
export async function handleAreaUsageRefresh(request, response, deps) {
  const expected = deps.env ? deps.env.AI_COLLECT_CRON_SECRET : "";

  if (typeof expected !== "string" || expected === "") {
    return response.status(503).json({ success: false, reason: "cron_secret_not_configured" });
  }

  if (!cronSecretsMatch(readCronSecretHeader(request), expected)) {
    return response.status(401).json({ success: false, reason: "unauthorized" });
  }

  if (!deps.env || deps.env.VERCEL_ENV !== "production") {
    return response.status(200).json({ success: true, status: "skipped", reason: "not_production" });
  }

  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const nowMillis = typeof deps.now === "function" ? deps.now() : Date.now();
    const result = await runAreaUsageRefresh(database, deps, nowMillis, randomUUID());

    if (result.status === "already_running") {
      return response.status(409).json({ success: false, reason: "already_running" });
    }

    if (result.status === "failed") {
      // 設定待ちの間は 200(定期実行の失敗の通知を30分ごとに出さない)。一度取得できた後の失敗は 500。
      return response.status(result.setupPending ? 200 : 500).json({ success: false, reason: result.setupPending ? "setup_pending" : "refresh_failed", errorCode: result.errorCode });
    }

    return response.status(200).json(Object.assign({ success: true }, result));
  } catch (error) {
    console.error("地域の利用状況：更新エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}

// ---------- 店主の画面 ----------

const readCache = new Map();

async function readCachedDoc(database, collection, id, nowMillis) {
  const key = collection + "/" + id;
  const cached = readCache.get(key);

  if (cached && nowMillis - cached.readAtMillis < READ_CACHE_MS) {
    return cached.promise;
  }

  // 読み取りの途中の Promise ごと保存する(同時に開いた店主が同じ読み取りを共有する)。失敗した時は保存を消す。
  const promise = database.collection(collection).doc(id).get().then(function(snapshot) {
    return snapshot.exists ? snapshot.data() || {} : null;
  });
  readCache.set(key, { promise: promise, readAtMillis: nowMillis });
  promise.catch(function() {
    readCache.delete(key);
  });
  return promise;
}

function readStoreId(body) {
  const storeId = body && typeof body.storeId === "string" ? body.storeId.trim() : "";
  return storeId !== "" && storeId.length <= 100 && /^[A-Za-z0-9_-]+$/.test(storeId) ? storeId : "";
}

// 計測の開始より前の日は、集計の対象の期間に含めない(推測で補わない)。
function clipPeriod(period, measurementStartDate) {
  if (!period) {
    return null;
  }

  const startDate = measurementStartDate !== "" && measurementStartDate > period.startDate ? measurementStartDate : period.startDate;
  return { startDate: startDate, endDate: period.endDate, clipped: startDate !== period.startDate };
}

// 保存済みの文書 → 店主の画面に返す形(秘匿の済んだ値だけ)。
export function buildStoreAreaUsageResponse(account, statsDoc, stateDoc, nowMillis) {
  const area = {
    countryCode: typeof account.countryCode === "string" ? account.countryCode : "",
    prefecture: typeof account.prefecture === "string" ? account.prefecture : "",
    city: typeof account.city === "string" ? account.city : ""
  };

  if (area.prefecture === "" || area.city === "") {
    return { status: "area_unknown", area: area };
  }

  if (!findAreaUsageTarget(area.countryCode, area.prefecture, area.city)) {
    return { status: "not_covered", area: area };
  }

  const state = stateDoc || {};
  // 最後の取得が失敗した時だけ lastErrorCode が入る(取得に成功すると空に戻る)。
  const refreshFailed = typeof state.lastErrorCode === "string" && state.lastErrorCode !== "";
  const refreshedAtMillis = statsDoc ? readMillis(statsDoc.refreshedAt) : 0;

  if (!statsDoc || refreshedAtMillis === 0) {
    return { status: "preparing", area: area, refreshFailed: refreshFailed };
  }

  const measurementStartDate = typeof statsDoc.measurementStartDate === "string" ? statsDoc.measurementStartDate : "";

  if (measurementStartDate === "") {
    return { status: "not_started", area: area, updatedAtMillis: refreshedAtMillis, refreshFailed: refreshFailed };
  }

  const cityValues = statsDoc.cities && statsDoc.cities[area.city] ? statsDoc.cities[area.city] : {};
  const periods = {};

  AREA_USAGE_PERIODS.forEach(function(period) {
    const value = cityValues[period] || { state: "withheld" };
    const range = clipPeriod(statsDoc.periods ? statsDoc.periods[period] : null, measurementStartDate);
    const entry = { state: ["ok", "under_min", "zero", "withheld"].includes(value.state) ? value.state : "withheld" };

    if (entry.state === "ok" && Number.isFinite(value.users) && Number.isFinite(value.events)) {
      entry.users = value.users;
      entry.events = value.events;
    } else if (entry.state === "ok") {
      entry.state = "withheld";
    }

    if (range) {
      entry.startDate = range.startDate;
      entry.endDate = range.endDate;
      entry.clipped = range.clipped;
    }

    periods[period] = entry;
  });

  return {
    status: "ok",
    area: area,
    periods: periods,
    measurementStartDate: measurementStartDate,
    timeZone: typeof statsDoc.timeZone === "string" ? statsDoc.timeZone : "Asia/Tokyo",
    updatedAtMillis: refreshedAtMillis,
    stale: nowMillis - refreshedAtMillis > AREA_USAGE_STALE_AFTER_MS,
    refreshFailed: refreshFailed,
    minUsers: AREA_USAGE_MIN_USERS
  };
}

// mode: storeAreaUsage (POST、ログイン済み店舗アカウント。その店舗の owner だけ)
// 店舗の所在地はサーバーの storeAccounts から読む(画面から送られた地域は使わない)。GA4 は呼ばない。
export async function handleStoreAreaUsage(request, response, deps) {
  try {
    const actor = await deps.resolveStoreUserActor(request);

    if (!actor.ok) {
      return response.status(actor.status).json({ success: false, reason: actor.status === 401 ? "login_required" : "store_account_required" });
    }

    const body = (await deps.readRequestBody(request)) || {};
    const storeId = readStoreId(body);

    if (storeId === "") {
      return response.status(400).json({ success: false, reason: "invalid_store" });
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const editor = await checkStoreProfileEditor(database, storeId, actor.actor.uid);

    if (!editor.ok) {
      return response.status(editor.status).json({ success: false, reason: editor.reason });
    }

    const accountSnapshot = await database.collection("storeAccounts").doc(storeId).get();
    const account = accountSnapshot.exists ? accountSnapshot.data() || {} : {};
    const nowMillis = typeof deps.now === "function" ? deps.now() : Date.now();
    const target = findAreaUsageTarget(account.countryCode, account.prefecture, account.city);
    let statsDoc = null;
    let stateDoc = null;

    if (target) {
      const docs = await Promise.all([
        readCachedDoc(database, AREA_USAGE_STATS_COLLECTION, areaUsageStatsDocId(target.countryCode, target.prefecture), nowMillis),
        readCachedDoc(database, AREA_USAGE_STATE_COLLECTION, AREA_USAGE_STATE_ID, nowMillis)
      ]);
      statsDoc = docs[0];
      stateDoc = docs[1];
    }

    return response.status(200).json(Object.assign({ success: true, storeId: storeId }, buildStoreAreaUsageResponse(account, statsDoc, stateDoc, nowMillis)));
  } catch (error) {
    console.error("地域の利用状況：店主の表示エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}
