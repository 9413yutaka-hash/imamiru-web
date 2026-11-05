// 店主向け「この街のマチナウ利用状況」(代表決定 2026-11-05・A案 GA4)：サーバーと app.js の計測。
// A 少人数の秘匿・期間・保存の形  B 定期実行(GA4 の取得を模擬：認証・1回の問い合わせで3期間・ロック・失敗・設定待ち)
// C 店主の画面の API(owner だけ・店舗の所在地で切り替え・未取得/失敗/遅れ・同時500件で GA4 を呼ばない)
// D app.js の計測(現在地の取得に成功した時だけ・復元では送らない・30分の重複・拒否・判定できない時・座標を送らない)
// E 課金のスイッチが変わっていない・workflow の形。
// Google への通信はすべて模擬(実際の GA4・Firestore・本番には接続しない)。
// run: node --import ./tests/mockfa-occ/register.mjs tests/area-usage-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, createVerify } from "node:crypto";
import vm from "node:vm";

let pass = 0, fail = 0;
const readMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = { type: "service_account", project_id: "chikashoku-app", client_email: "fake-sa@chikashoku-app.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
Object.assign(process.env, { FIREBASE_SERVICE_ACCOUNT_KEY: JSON.stringify(SA), RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", AI_COLLECT_CRON_SECRET: "cron-secret-for-tests", VERCEL_ENV: "production" });
const pw = (uid) => ({ uid, email: uid + "@example.com", email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { own: pw("uo"), other: pw("ux"), anon: { uid: "an", firebase: { sign_in_provider: "anonymous" } } };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const { Timestamp } = await import("firebase-admin/firestore");
const AU = await import(REPO_URL + "/api/_lib/area-usage.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

// ---------- Google の模擬 ----------
const G = { calls: [], reports: [], fail: null, properties: ["123456789"], streams: { "123456789": "G-PGM7GNVQX8" } };
let report = null, startReport = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  G.calls.push({ url: u, method: opts.method || "GET", body: opts.body ? String(opts.body) : "", auth: opts.headers && opts.headers.Authorization });
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  if (u === "https://oauth2.googleapis.com/token") {
    const assertion = decodeURIComponent(String(opts.body).split("assertion=")[1]);
    const [h, p, sig] = assertion.split(".");
    const v = createVerify("RSA-SHA256"); v.update(h + "." + p);
    const okSig = v.verify(publicKey, Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    const claims = JSON.parse(Buffer.from(p, "base64").toString());
    G.lastClaims = claims; G.lastSigOk = okSig;
    return okSig ? json(200, { access_token: "ya29.fake", expires_in: 3600 }) : json(401, { error: "invalid_grant" });
  }
  if (G.fail) return json(G.fail.status, G.fail.body);
  if (u.startsWith("https://analyticsadmin.googleapis.com/v1beta/accountSummaries")) return json(200, { accountSummaries: [{ propertySummaries: G.properties.map((id) => ({ property: "properties/" + id })) }] });
  const sm = u.match(/analyticsadmin\.googleapis\.com\/v1beta\/properties\/(\d+)\/dataStreams/);
  if (sm) return json(200, { dataStreams: G.streams[sm[1]] ? [{ webStreamData: { measurementId: G.streams[sm[1]] } }] : [] });
  const rm = u.match(/analyticsdata\.googleapis\.com\/v1beta\/properties\/(\d+):runReport/);
  if (rm) { const body = JSON.parse(opts.body); G.reports.push({ propertyId: rm[1], body }); return json(200, body.dimensions[0].name === "date" ? startReport : report); }
  throw new Error("unexpected network " + u);
};

const row = (range, pref, city, users, events) => ({ dimensionValues: [{ value: range }, { value: pref }, { value: city }], metricValues: [{ value: String(users) }, { value: String(events) }] });
const HEAD = [{ name: "dateRange" }, { name: "customEvent:area_prefecture" }, { name: "customEvent:area_city" }];
const mkReport = (rows, meta = {}) => ({ dimensionHeaders: HEAD, metricHeaders: [{ name: "totalUsers" }, { name: "eventCount" }], rows, metadata: { timeZone: "Asia/Tokyo", ...meta }, propertyQuota: { tokensPerDay: { consumed: 12, remaining: 199988 } } });

async function call(body, { token = "", headers = {} } = {}) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(token ? { authorization: "Bearer " + token } : {}), ...headers }, body, query: {} }, r); } finally { console.error = e; }
  for (const k of [...S.docs.keys()]) if (k.includes("RateLimits/")) S.docs.delete(k);
  return { status: r.code, body: r.body };
}
const cron = (secret = "cron-secret-for-tests") => call({ mode: "areaUsageRefresh" }, { headers: { "x-machinau-cron-secret": secret } });

// ---------- A 秘匿・期間・保存の形 ----------
t("A1 人数10人以上：人数はそのまま・回数は10回単位", JSON.stringify(AU.suppressAreaUsageValue({ users: 128, events: 356 }, false)) === JSON.stringify({ state: "ok", users: 128, events: 360 }));
t("A2 人数1〜9人：「10人未満」(人数・回数とも返さない)", [1, 5, 9].every((n) => JSON.stringify(AU.suppressAreaUsageValue({ users: n, events: 40 }, false)) === JSON.stringify({ state: "under_min" })));
t("A3 行が無い：しきい値の無い応答なら0人／しきい値のある応答なら「非表示」(0と区別)", AU.suppressAreaUsageValue(null, false).state === "zero" && AU.suppressAreaUsageValue(null, true).state === "withheld");
t("A4 10人ちょうど・回数が少ない時も回数は最低10(0回と見せない)", JSON.stringify(AU.suppressAreaUsageValue({ users: 10, events: 12 }, false)) === JSON.stringify({ state: "ok", users: 10, events: 10 }) && AU.suppressAreaUsageValue({ users: 10, events: 3 }, false).events === 10);
const NOW = Date.parse("2026-11-05T05:00:00Z"); // 日本時間 14:00
const p = AU.buildAreaUsagePeriods(AU.dateKeyInTimeZone(NOW, "Asia/Tokyo"));
t("A5 期間：今日＝当日・過去7日間＝今日を含む7日・過去30日間＝今日を含む30日(プロパティのタイムゾーン)", p.today.startDate === "2026-11-05" && p.today.endDate === "2026-11-05" && p.last7Days.startDate === "2026-10-30" && p.last30Days.startDate === "2026-10-07", p);
t("A6 日付の境目は日本時間(UTC 15:30 は翌日)", AU.dateKeyInTimeZone(Date.parse("2026-11-05T15:30:00Z"), "Asia/Tokyo") === "2026-11-06");
const docsA = AU.buildAreaUsageStatsDocs(mkReport([row("today", "沖縄県", "那覇市", 12, 31), row("last7Days", "沖縄県", "那覇市", 40, 133), row("last30Days", "沖縄県", "那覇市", 128, 356), row("today", "沖縄県", "八重瀬町", 3, 7), row("last30Days", "沖縄県", "存在しない町", 500, 900), row("last30Days", "東京都", "港区", 900, 999)]), { nowMillis: NOW, runId: "r1", targets: AU.AREA_USAGE_TARGETS, measurementStartDate: "2026-11-01" });
const naha = docsA[0].data.cities["那覇市"];
t("A7 保存の文書：都道府県ごとに1件(JP_沖縄県)・41市町村×3期間", docsA.length === 1 && docsA[0].id === "JP_沖縄県" && Object.keys(docsA[0].data.cities).length === 41 && Object.values(docsA[0].data.cities).every((c) => Object.keys(c).join() === "today,last7Days,last30Days"));
t("A8 市町村×期間ごとの人数・回数(那覇市 今日12人・約30回／7日40人・約130回／30日128人・約360回)", naha.today.users === 12 && naha.today.events === 30 && naha.last7Days.users === 40 && naha.last7Days.events === 130 && naha.last30Days.users === 128 && naha.last30Days.events === 360, naha);
t("A9 少人数(八重瀬町 今日3人)は「10人未満」・行の無い期間は0人・対象外の市町村・都道府県は保存しない", docsA[0].data.cities["八重瀬町"].today.state === "under_min" && docsA[0].data.cities["八重瀬町"].last7Days.state === "zero" && !docsA[0].data.cities["存在しない町"] && !JSON.stringify(docsA).includes("港区"));
t("A10 生の少人数の値(3人・7回)は保存の文書のどこにも無い", !JSON.stringify(docsA[0].data.cities["八重瀬町"]).match(/\b(3|7)\b/));
const docsT = AU.buildAreaUsageStatsDocs(mkReport([row("last30Days", "沖縄県", "那覇市", 128, 356)], { subjectToThresholding: true }), { nowMillis: NOW, runId: "r2", targets: AU.AREA_USAGE_TARGETS, measurementStartDate: "2026-11-01" });
t("A11 GA4 のしきい値のある応答：行の無い市町村は0人ではなく「非表示」", docsT[0].data.thresholded === true && docsT[0].data.cities["石垣市"].today.state === "withheld" && docsT[0].data.cities["那覇市"].last30Days.state === "ok");
const okiList = (readFileSync(REPO_ROOT + "/japan-municipalities.js", "utf8").match(/"沖縄県": (\[[^\]]+\])/) || [])[1];
t("A12 集計の対象の41市町村は japan-municipalities.js の沖縄県と同じ(店舗の所在地の名前とも同じ形)", okiList && JSON.stringify(JSON.parse(okiList)) === JSON.stringify(AU.AREA_USAGE_TARGETS[0].municipalities) && AU.AREA_USAGE_TARGETS[0].municipalities.length === 41);

// ---------- B 定期実行 ----------
let r = await cron("wrong");
t("B1 合言葉が違う → 401(GA4 を呼ばない)", r.status === 401 && G.calls.length === 0, r);
process.env.VERCEL_ENV = "preview";
r = await cron();
t("B2 Production 以外(Preview)では GA4 を読まない(skipped)", r.status === 200 && r.body.reason === "not_production" && G.calls.length === 0, r);
process.env.VERCEL_ENV = "production";

G.fail = { status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: "Google Analytics Data API has not been used in project 1 before or it is disabled.", details: [{ reason: "SERVICE_DISABLED" }] } } };
r = await cron();
let state = S.docs.get("areaUsageRefreshState/ga4");
t("B3 設定待ち(API が無効)：200 setup_pending・原因の記号だけを記録・数値の文書は作らない", r.status === 200 && r.body.reason === "setup_pending" && r.body.errorCode === "ga4_admin_api_disabled" && state.lastErrorCode === "ga4_admin_api_disabled" && !S.docs.has("areaUsageStats/JP_沖縄県"), { r, state });
t("B4 認証：サービスアカウントの鍵で署名した JWT(閲覧の範囲 analytics.readonly だけ)", G.lastSigOk === true && G.lastClaims.scope === "https://www.googleapis.com/auth/analytics.readonly" && G.lastClaims.iss === SA.client_email);
t("B5 応答・記録に鍵・トークンを出さない", !JSON.stringify(r.body).includes("PRIVATE KEY") && !JSON.stringify(state).includes("ya29") && !JSON.stringify(state).includes("PRIVATE"));
G.fail = { status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED", message: "User does not have sufficient permissions for this property." } } };
r = await cron();
t("B6 権限が無い：setup_pending・ga4_permission_denied", r.status === 200 && r.body.errorCode === "ga4_permission_denied", r);
G.fail = null;

startReport = { dimensionHeaders: [{ name: "date" }], rows: [{ dimensionValues: [{ value: "20261102" }], metricValues: [{ value: "4" }] }, { dimensionValues: [{ value: "20261101" }], metricValues: [{ value: "2" }] }], metadata: { timeZone: "Asia/Tokyo" } };
report = mkReport([row("today", "沖縄県", "那覇市", 12, 31), row("last7Days", "沖縄県", "那覇市", 40, 133), row("last30Days", "沖縄県", "那覇市", 128, 356), row("today", "沖縄県", "石垣市", 4, 9)]);
G.calls = []; G.reports = [];
r = await cron();
state = S.docs.get("areaUsageRefreshState/ga4");
let stats = S.docs.get("areaUsageStats/JP_沖縄県");
t("B7 取得：プロパティを測定 ID G-PGM7GNVQX8 で特定し、200 refreshed", r.status === 200 && r.body.status === "refreshed" && state.propertyId === "123456789" && r.body.measurementStarted === true, r);
const main = G.reports.find((x) => x.body.dimensions[0].name !== "date");
t("B8 1回の runReport で3期間(today・last7Days・last30Days)×市町村・人数は totalUsers・回数は eventCount", main && main.body.dateRanges.map((d) => d.name + ":" + d.startDate).join() === "today:today,last7Days:6daysAgo,last30Days:29daysAgo" && main.body.metrics.map((m) => m.name).join() === "totalUsers,eventCount" && main.body.dimensions.map((d) => d.name).join() === "customEvent:area_prefecture,customEvent:area_city", main && main.body);
t("B9 地域イベント(location_area_resolved)だけ・都道府県で絞る(location_button_click・region_search・IP の地域は使わない)", JSON.stringify(main.body.dimensionFilter).includes('"value":"location_area_resolved"') && JSON.stringify(main.body.dimensionFilter).includes("沖縄県") && !JSON.stringify(main.body).includes("location_button_click") && !JSON.stringify(main.body).includes('"city"') && !JSON.stringify(main.body).includes("region_search"));
t("B10 計測の開始日＝地域イベントが最初に記録された日(2026-11-01)を保存", state.measurementStartDate === "2026-11-01" && stats.measurementStartDate === "2026-11-01");
t("B11 保存：那覇市は128人・約360回(30日)、石垣市の今日4人は「10人未満」", stats.cities["那覇市"].last30Days.users === 128 && stats.cities["那覇市"].last30Days.events === 360 && stats.cities["石垣市"].today.state === "under_min" && state.lastErrorCode === "" && state.lockRunId === "");
G.calls = []; G.reports = [];
r = await cron();
t("B12 2回目：プロパティ・開始日は保存済みを使い、GA4 の問い合わせは1回だけ(Admin API・開始日の問い合わせは無し)", r.status === 200 && G.reports.length === 1 && !G.calls.some((c) => c.url.includes("analyticsadmin")), G.calls.map((c) => c.url));
S.docs.set("areaUsageRefreshState/ga4", { ...S.docs.get("areaUsageRefreshState/ga4"), lockRunId: "other", lockLeaseUntil: Timestamp.fromMillis(Date.now() + 60000) });
G.calls = [];
r = await cron();
t("B13 二重実行：実行中のロックがある間は 409(GA4 を呼ばない・数値を書かない)", r.status === 409 && G.calls.length === 0, r);
S.docs.set("areaUsageRefreshState/ga4", { ...S.docs.get("areaUsageRefreshState/ga4"), lockRunId: "other", lockLeaseUntil: Timestamp.fromMillis(Date.now() - 1000) });
const before = JSON.stringify(S.docs.get("areaUsageStats/JP_沖縄県").cities);
G.fail = { status: 500, body: { error: { code: 500, status: "INTERNAL", message: "backend error" } } };
r = await cron();
t("B14 一度取得できた後の失敗：500 refresh_failed・前回の数値は残す(0で上書きしない)・期限切れのロックは取り直せる", r.status === 500 && r.body.reason === "refresh_failed" && JSON.stringify(S.docs.get("areaUsageStats/JP_沖縄県").cities) === before && S.docs.get("areaUsageRefreshState/ga4").lastErrorCode === "ga4_request_failed", r);
G.fail = null;

// ---------- C 店主の画面の API ----------
const seedStore = (id, uid, o = {}) => {
  S.docs.set("storeMembers/" + id + "_" + uid, { storeId: id, uid, role: "owner", status: "active" });
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, enabled: true, registrationStatus: "active", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", ...o });
};
seedStore("SN", "uo"); seedStore("SI", "uo", { city: "石垣市" }); seedStore("SX", "uo", { prefecture: "東京都", city: "港区" }); seedStore("SU", "uo", { city: "" }); seedStore("SZ", "ux");
AU.resetAreaUsageCachesForTests();
r = await call({ mode: "storeAreaUsage", storeId: "SN" });
t("C1 ログインなし → 401", r.status === 401, r);
r = await call({ mode: "storeAreaUsage", storeId: "SZ" }, { token: "own" });
t("C2 他人の店舗 → 404(数値を返さない)", r.status === 404 && !r.body.periods, r);
S.docs.set("storeMembers/SN_ux", { storeId: "SN", uid: "ux", role: "staff", status: "active" });
r = await call({ mode: "storeAreaUsage", storeId: "SN" }, { token: "other" });
t("C3 owner でないメンバー → 404", r.status === 404, r);
r = await call({ mode: "storeAreaUsage", storeId: "SN" }, { token: "anon" });
t("C4 旅行者の匿名ログイン → 拒否", r.status === 401 || r.status === 403, r);
r = await call({ mode: "storeAreaUsage", storeId: "SN" }, { token: "own" });
t("C5 owner：店舗の所在地(那覇市)の値・期間(計測の開始日から)・最終更新・失敗の印", r.status === 200 && r.body.status === "ok" && r.body.area.city === "那覇市" && r.body.periods.last30Days.users === 128 && r.body.periods.last30Days.events === 360 && r.body.periods.last30Days.startDate === "2026-11-01" && r.body.periods.last30Days.clipped === true && r.body.updatedAtMillis > 0 && r.body.refreshFailed === true, r.body);
r = await call({ mode: "storeAreaUsage", storeId: "SI", city: "那覇市", prefecture: "沖縄県" }, { token: "own" });
t("C6 複数店舗：石垣市の店舗は石垣市の値(画面から送った地域は使わない)・4人は「10人未満」", r.status === 200 && r.body.area.city === "石垣市" && r.body.periods.today.state === "under_min" && r.body.periods.today.users === undefined && r.body.periods.today.events === undefined, r.body);
r = await call({ mode: "storeAreaUsage", storeId: "SX" }, { token: "own" });
t("C7 対象外の地域(東京都港区)：not_covered(別の地域の数字を代わりに出さない)", r.status === 200 && r.body.status === "not_covered" && !r.body.periods, r.body);
r = await call({ mode: "storeAreaUsage", storeId: "SU" }, { token: "own" });
t("C8 所在地の市町村が不明：area_unknown", r.status === 200 && r.body.status === "area_unknown" && !r.body.periods, r.body);
const stDoc = { refreshedAt: Timestamp.fromMillis(NOW - 3 * 3600000), measurementStartDate: "2026-11-01", periods: p, cities: { "那覇市": { today: { state: "zero" }, last7Days: { state: "withheld" }, last30Days: { state: "ok", users: 15, events: 40 } } } };
let built = AU.buildStoreAreaUsageResponse({ countryCode: "JP", prefecture: "沖縄県", city: "那覇市" }, stDoc, { lastAttemptAt: Timestamp.fromMillis(NOW - 3 * 3600000), lastSuccessAt: Timestamp.fromMillis(NOW - 3 * 3600000) }, NOW);
t("C9 0人・非表示・遅れ(最終更新から2時間超)を区別して返す", built.periods.today.state === "zero" && built.periods.last7Days.state === "withheld" && built.stale === true && built.refreshFailed === false, built);
built = AU.buildStoreAreaUsageResponse({ countryCode: "JP", prefecture: "沖縄県", city: "那覇市" }, null, { lastAttemptAt: Timestamp.fromMillis(NOW), lastErrorCode: "ga4_permission_denied" }, NOW);
t("C10 まだ一度も取得できていない：preparing(数値なし・0と見せない)", built.status === "preparing" && !built.periods);
built = AU.buildStoreAreaUsageResponse({ countryCode: "JP", prefecture: "沖縄県", city: "那覇市" }, { ...stDoc, measurementStartDate: "" }, {}, NOW);
t("C11 取得はできたが地域イベントがまだ無い：not_started(計測の前の期間を推測で補わない)", built.status === "not_started" && !built.periods);
built = AU.buildStoreAreaUsageResponse({ countryCode: "JP", prefecture: "沖縄県", city: "那覇市" }, { ...stDoc, cities: { "那覇市": { today: { state: "ok" } } } }, {}, NOW);
t("C12 値の欠けた文書：ok でも数値が無ければ「非表示」・無い期間も「非表示」", built.periods.today.state === "withheld" && built.periods.last30Days.state === "withheld");

// 同時閲覧：500件の閲覧で GA4 の呼び出し0・Firestore の数値の読み取りはインスタンスごとの一時保存で抑える
AU.resetAreaUsageCachesForTests();
G.calls = [];
const origGet = S.docs.get.bind(S.docs);
let statReads = 0;
S.docs.get = (k) => { if (String(k).startsWith("areaUsage")) statReads++; return origGet(k); };
const many = await Promise.all(Array.from({ length: 500 }, () => call({ mode: "storeAreaUsage", storeId: "SN" }, { token: "own" })));
S.docs.get = origGet;
t("C13 500人が同時に開いても GA4 への通信は0回", G.calls.length === 0 && many.every((x) => x.status === 200 && x.body.status === "ok"), G.calls.length);
t("C14 500件の閲覧での数値の文書の読み取りは閲覧の人数に比例しない(一時保存)", statReads < 50, statReads);

// ---------- D app.js の計測 ----------
const app = readFileSync(REPO_ROOT + "/app.js", "utf8").split("\r\n").join("\n");
const start = app.indexOf("const AREA_USAGE_MEASUREMENT_ENABLED =");
const end = app.indexOf("\nfunction getLocation() {");
const sendStart = app.indexOf("function sendMachinauAnalyticsEvent(");
const sendEnd = app.indexOf("\nfunction degreesToRadians(");
// 地域計測 ON(代表決定 2026-11-05)｜プライバシーポリシーの改定(2026年11月5日施行・停止の設定)の後だけ true。
const PRIV = readFileSync(REPO_ROOT + "/privacy.html", "utf8");
t("D1 計測のスイッチ true は、プライバシーポリシーの改定(市町村の統計・停止の設定)が本文にある版だけ", /const AREA_USAGE_MEASUREMENT_ENABLED =\n  true;/.test(app) && PRIV.includes('data-revision="2026-11-05"') && PRIV.includes('id="areaUsageOptOutButton"') && PRIV.includes("machinauAreaUsageOptOut"));
const block = app.slice(start, end);
const muni = readFileSync(REPO_ROOT + "/japan-municipalities.js", "utf8");
function makeCtx({ host = "machinau.jp", jaGeocode = null, enabled = true } = {}) {
  const sent = [], ls = new Map(), ss = new Map(), geocodeCalls = [], domReady = [], note = { hidden: true };
  const ctx = {
    location: { hostname: host }, Date, JSON, Promise, Array, String, Number, setTimeout, clearTimeout, console,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    sessionStorage: { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)), removeItem: (k) => ss.delete(k) },
    gtag: (...a) => sent.push(a), AREA_NAME_RESOLUTION_TIMEOUT_MS: 50,
    document: { getElementById: (id) => (id === "areaUsageLocationNote" ? note : null), addEventListener: (type, fn) => { if (type === "DOMContentLoaded") domReady.push(fn); } },
    google: { maps: { Geocoder: function() { this.geocode = (req, cb) => { geocodeCalls.push(req); cb(jaGeocode ? [jaGeocode] : [], jaGeocode ? "OK" : "ZERO_RESULTS"); }; } } }
  };
  vm.createContext(ctx);
  vm.runInContext(muni.replace("const JAPAN_MUNICIPALITIES_BY_PREFECTURE", "var JAPAN_MUNICIPALITIES_BY_PREFECTURE"), ctx);
  vm.runInContext(app.slice(sendStart, sendEnd) + "\n" + block.replace(/const AREA_USAGE_MEASUREMENT_ENABLED =\n  (true|false);/, "const AREA_USAGE_MEASUREMENT_ENABLED =\n  " + enabled + ";") + "\nthis.record = recordAreaUsageMeasurement;", ctx);
  return { ctx, sent, ls, ss, geocodeCalls, domReady, note };
}
const H = (o = {}) => ({ country: "JP", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", municipality: "那覇市", ...o });
let c = makeCtx();
let res = await c.ctx.record(H(), 26.2124, 127.6809);
t("D2 現在地の取得に成功・市町村を判定できた：location_area_resolved を1回(都道府県名・市町村名だけ)", res === true && c.sent.length === 1 && c.sent[0][0] === "event" && c.sent[0][1] === "location_area_resolved" && JSON.stringify(c.sent[0][2]) === JSON.stringify({ area_prefecture: "沖縄県", area_city: "那覇市" }), c.sent);
t("D3 座標・住所・場所の ID は送らない", !JSON.stringify(c.sent).match(/26\.2|127\.6|place|lat|lng|address/i));
res = await c.ctx.record(H(), 26.2124, 127.6809);
t("D4 同じタブで同じ市町村を30分以内にもう一度(「現在地を更新」の連打など)：送らない", res === false && c.sent.length === 1);
res = await c.ctx.record(H({ city: "浦添市", municipality: "浦添市" }), 26.24, 127.72);
t("D5 別の市町村へ移った：送る", res === true && c.sent.length === 2 && c.sent[1][2].area_city === "浦添市");
const saved = JSON.parse(c.ss.get("machinauAreaUsageLastSent")); saved.sentAt -= 31 * 60 * 1000; saved.city = "那覇市"; c.ss.set("machinauAreaUsageLastSent", JSON.stringify(saved));
res = await c.ctx.record(H(), 26.2124, 127.6809);
t("D6 30分を過ぎた後の取得：送る", res === true && c.sent.length === 3);
c = makeCtx();
res = await c.ctx.record(H({ city: "", municipality: "" }), 26.2, 127.6);
t("D7 市町村を判定できない(空)：送らない(地域別の成功件数に含めない)", res === false && c.sent.length === 0);
res = await c.ctx.record(H({ countryCode: "US", country: "US", prefecture: "Hawaii", city: "Honolulu" }), 21.3, -157.8);
t("D8 日本以外：送らない", res === false && c.sent.length === 0);
res = await c.ctx.record(null, 26.2, 127.6);
t("D9 地域の判定に失敗(null)：送らない", res === false && c.sent.length === 0);
c = makeCtx({ jaGeocode: { address_components: [{ long_name: "沖縄県", types: ["administrative_area_level_1", "political"] }, { long_name: "那覇市", types: ["locality", "political"] }] } });
res = await c.ctx.record(H({ prefecture: "Okinawa", city: "Naha", municipality: "Naha" }), 26.2124, 127.6809);
t("D10 端末の言語が英語(Okinawa/Naha)：日本語の名前を1回だけ問い合わせて正式名(沖縄県/那覇市)で送る", res === true && c.geocodeCalls.length === 1 && c.geocodeCalls[0].language === "ja" && c.sent[0][2].area_city === "那覇市" && c.sent[0][2].area_prefecture === "沖縄県", { sent: c.sent, g: c.geocodeCalls });
c = makeCtx();
res = await c.ctx.record(H(), 26.2124, 127.6809);
t("D11 日本語の名前がそのまま一覧にある時は追加の問い合わせをしない(Google の費用を増やさない)", res === true && c.geocodeCalls.length === 0);
c = makeCtx();
res = await c.ctx.record(H({ prefecture: "Okinawa", city: "Naha" }), 26.2, 127.6);
t("D12 日本語の名前が取れない：送らない(推測の名前で数えない)", res === false && c.sent.length === 0);
c = makeCtx(); c.ls.set("machinauAreaUsageOptOut", "1");
res = await c.ctx.record(H(), 26.2, 127.6);
t("D13 旅行者が地域の利用統計を拒否した端末：送らない", res === false && c.sent.length === 0);
c = makeCtx({ host: "imamiru-git-preview-stripe-card-setup-9413yutaka-hashs-projects.vercel.app" });
await c.ctx.record(H(), 26.2, 127.6);
t("D14 Preview・本番以外のホスト：本番の GA4 に送らない", c.sent.length === 0);
c = makeCtx({ enabled: false });
res = await c.ctx.record(H(), 26.2, 127.6);
t("D15 スイッチ false：何も送らない・何も保存しない", res === false && c.sent.length === 0 && c.ss.size === 0);
const apply = app.slice(app.indexOf("function applyUserLocation("), app.indexOf("function resetLocationPermissionGuide()"));
t("D16 呼び出しは GPS で新しく取得した時だけ(30分の現在地の復元 isRestoredLocation では呼ばない)", /if \(!isRestoredLocation\) \{\n\s+recordAreaUsageMeasurement\(\n\s+locationHierarchy,\n\s+latitude,\n\s+longitude\n\s+\);\n\s+\}/.test(apply) && apply.split("recordAreaUsageMeasurement(").length === 2);
// プライバシーポリシー 2026年11月5日改定(代表決定・即日施行)｜本文に市町村の統計・停止の設定。計測のスイッチは false のまま。
t("D20 プライバシーポリシーの改定：最終更新日・改定の条項と施行日・1/2/4/5/7条・停止の設定(ボタン・同じ保存の名前)があり、日付の空欄は残らない",
  PRIV.includes("最終更新日：2026年11月5日") && PRIV.includes('data-revision="2026-11-05"') && /2026年11月5日から適用します。/.test(PRIV) &&
  PRIV.includes('id="area-usage"') && PRIV.includes("市町村名と都道府県名だけ") && PRIV.includes("座標・住所は送信しません。") &&
  PRIV.includes('id="areaUsageOptOutButton"') && PRIV.includes('var KEY = "machinauAreaUsageOptOut";') && !/__[A-Z_]+__/.test(PRIV));
t("D21 停止の画面の状態の表示は「送信を停止していません」(現在地を取得した時だけ送るため「送信しています」と書かない)", !PRIV.includes("現在：送信しています") && PRIV.includes("現在：送信を停止していません"));
const idx = readFileSync(REPO_ROOT + "/index.html", "utf8");
t("D18 TOP の現在地ボタンの下の説明(既定は非表示・プライバシーポリシーの説明と停止へのリンク・日英)", /<p id="areaUsageLocationNote" class="location-area-usage-note" hidden>/.test(idx) && idx.includes('href="privacy.html#area-usage"') && idx.includes('data-i18n="location_area_usage_note"') && idx.includes('data-i18n="location_area_usage_note_link"') && PRIV.includes('id="area-usage"'));
c = makeCtx({ enabled: true }); c.domReady.forEach((fn) => fn());
const shownOn = c.note.hidden === false;
c = makeCtx({ enabled: true }); c.ls.set("machinauAreaUsageOptOut", "1"); c.domReady.forEach((fn) => fn());
const hiddenOptOut = c.note.hidden === true;
c = makeCtx({ enabled: false }); c.domReady.forEach((fn) => fn());
t("D19 説明はスイッチ ON・停止していない端末だけ表示(停止した端末・スイッチ OFF では出さない)", shownOn && hiddenOptOut && c.note.hidden === true);
// プライバシーポリシーの停止のボタン(privacy.html の script)を実際に動かし、同じ端末の計測が止まる・再開できることを確かめる。
{
  const script = (PRIV.match(/<script>([\s\S]*?)<\/script>/) || ["", ""])[1];
  c = makeCtx({ enabled: true });
  const els = { areaUsageOptOutButton: { textContent: "", listeners: [], addEventListener(type, fn) { if (type === "click") this.listeners.push(fn); } }, areaUsageOptOutState: { textContent: "" } };
  vm.runInContext(script, Object.assign(c.ctx, { document: { getElementById: (id) => els[id] || null } }));
  const before = els.areaUsageOptOutButton.textContent + "|" + els.areaUsageOptOutState.textContent;
  els.areaUsageOptOutButton.listeners.forEach((fn) => fn());
  const stoppedLabel = els.areaUsageOptOutButton.textContent + "|" + els.areaUsageOptOutState.textContent;
  const stoppedKey = c.ls.get("machinauAreaUsageOptOut");
  const resStopped = await c.ctx.record(H(), 26.2, 127.6);
  const sentStopped = c.sent.length;
  els.areaUsageOptOutButton.listeners.forEach((fn) => fn());
  const resumedKey = c.ls.has("machinauAreaUsageOptOut");
  const resResumed = await c.ctx.record(H(), 26.2, 127.6);
  t("D22 停止のボタン：押すと停止(この端末の保存)・地域イベントを送らない／もう一度押すと再開して送る",
    before === "送信を停止する|現在：送信を停止していません" && stoppedLabel === "送信を再開する|現在：停止しています" && stoppedKey === "1" && resStopped === false && sentStopped === 0 &&
    resumedKey === false && resResumed === true && c.sent.length === 1 && c.sent[0][1] === "location_area_resolved",
    { before, stoppedLabel, stoppedKey, resStopped, sentStopped, resumedKey, resResumed, sent: c.sent.length });
}
t("D23 送るのは市町村名・都道府県名の2つだけ(座標・住所・場所の ID・利用者の ID を送らない)", (() => { const m = block.match(/AREA_USAGE_EVENT_NAME,\n\s+\{([\s\S]*?)\}\n/); return !!m && m[1].replace(/\s/g, "") === "area_prefecture:names.prefecture,area_city:city"; })());
t("D17 既存の location_button_click・region_search は変えていない", app.split('"location_button_click"').length === readFileSync(REPO_ROOT + "/app.js", "utf8").split('"location_button_click"').length && app.includes('"region_search"'));

// ---------- E 課金のスイッチ・workflow ----------
// 2026-11-05 時点の main(5d80ac8)の値。この機能では1つも変えない。
const FLAGS = [["api/_lib/store-custom-plan-billing.js", "STORE_CUSTOM_PLAN_MONTHLY_SIGNUP_ENABLED", "true"], ["api/_lib/store-custom-plan-billing.js", "STORE_CUSTOM_PLAN_CLOSE_WRITES_ENABLED", "true"], ["api/_lib/store-custom-plan-billing.js", "STORE_CUSTOM_PLAN_CHARGE_ENABLED", "false"], ["api/_lib/store-custom-plan-cron.js", "STORE_CUSTOM_PLAN_CRON_CHARGES_ENABLED", "true"], ["api/_lib/store-custom-plan-charge.js", "STORE_CUSTOM_PLAN_LATE_AUTO_CHARGE_ENABLED", "false"], ["api/_lib/imadake-monthly-charge.js", "IMADAKE_MONTHLY_CHARGE_ENABLED", "false"], ["api/_lib/imadake-monthly-close.js", "IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED", "false"], ["api/_lib/store-account-deletion.js", "ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED", "false"], ["api/_lib/store-billing.js", "STORE_CARD_REGISTRATION_LIVE_ENABLED", "true"], ["api/_lib/store-billing.js", "STORE_CARD_LIVE_ADMIN_TRIAL_ENABLED", "true"]];
const flagBad = FLAGS.filter(([f, name, v]) => !new RegExp("export const " + name + " =\\s*" + v + ";").test(readFileSync(REPO_ROOT + "/" + f, "utf8")));
t("E1 課金・請求・退会の削除のスイッチ10個は変更なし(本番の請求の一括停止 STORE_CUSTOM_PLAN_CHARGE_ENABLED は false)", flagBad.length === 0, flagBad);
const au = readFileSync(REPO_ROOT + "/api/_lib/area-usage.js", "utf8");
t("E2 集計のモジュールは課金・請求・Stripe に触れない", !/storeCustomPlans|stripe|accountBilling|imadake/i.test(au.replace(/^\/\/.*$/gm, "")));
// 改行は CRLF の checkout(Windows)でも LF でも同じに扱う。
const wf = readFileSync(REPO_ROOT + "/.github/workflows/area-usage-refresh.yml", "utf8").split("\r\n").join("\n");
t("E3 workflow：30分ごと・main のファイルだけ・本番の接続先を確認してから・合言葉は secrets・同時に1つ", /cron: "5,35 \* \* \* \*"/.test(wf) && wf.includes("area-usage-refresh.yml@refs/heads/main") && wf.includes('t.projectId==="chikashoku-app"') && wf.includes("secrets.AI_COLLECT_CRON_SECRET") && /concurrency:\n  group: area-usage-refresh/.test(wf) && !/echo[^\n]*\$CRON_SECRET/.test(wf));
const sc = readFileSync(REPO_ROOT + "/.github/workflows/store-card-plan-production.yml", "utf8");
t("E4 店舗カードの本番の定期実行は1日4回のまま(変更なし)", sc.includes('- cron: "10 1-4 * * *"'));


// ---------- F 30分ごとの更新(既存の定期実行＝掲載期限 /api/expire への相乗り) ----------
{
  const ts = (ms) => Timestamp.fromMillis(ms);
  const T0 = Date.parse("2026-11-06T03:00:00Z");
  const due = (success, attempt) => AU.isAreaUsageRefreshDue({ lastSuccessAt: ts(T0 - success * 60000), lastAttemptAt: ts(T0 - attempt * 60000) }, T0);
  t("F1 取得の条件：未取得なら取得／前回の成功から25分未満は取得しない・25分以上は取得／失敗の直後は5分おいて再実行",
    AU.isAreaUsageRefreshDue(null, T0) && !due(10, 10) && !due(24, 24) && due(25, 25) && due(31, 31) && !due(40, 2) && due(40, 6) && AU.AREA_USAGE_REFRESH_DUE_MS === 25 * 60000);

  const { default: collect } = await import(REPO_URL + "/api/expire.js?v=" + Date.now());
  const callCollect = async (secret, body = {}) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
    const e = console.error, w = console.warn, l = console.log; console.error = () => {}; console.warn = () => {}; console.log = () => {};
    try { await collect({ method: "POST", headers: { "content-type": "application/json", "x-machinau-cron-secret": secret }, body, query: {} }, res); } catch (error) { res.code = "threw"; } finally { console.error = e; console.warn = w; console.log = l; }
    return res;
  };
  report = mkReport([row("today", "沖縄県", "那覇市", 12, 31), row("last30Days", "沖縄県", "那覇市", 128, 356)]);
  startReport = { rows: [{ dimensionValues: [{ value: "20261105" }], metricValues: [{ value: "5" }] }] };
  G.fail = null;
  AU.resetAreaUsageCachesForTests();
  const stateKey = "areaUsageRefreshState/ga4";
  const old = Date.now() - 40 * 60000;
  S.docs.set(stateKey, { ...S.docs.get(stateKey), lockRunId: "", lockLeaseUntil: ts(0), lastSuccessAt: ts(old), lastAttemptAt: ts(old), lastErrorCode: "", recentRuns: [] });

  let reportsBefore = G.reports.length;
  let res = await callCollect("wrong-secret");
  t("F2 掲載期限の合言葉が違う → 既存どおり 401・GA4 を呼ばない", res.code === 401 && G.reports.length === reportsBefore, res.code);

  process.env.VERCEL_ENV = "preview";
  res = await callCollect("cron-secret-for-tests");
  t("F3 Production 以外(Preview)の掲載期限の実行では GA4 を読まない", G.reports.length === reportsBefore && (S.docs.get(stateKey).recentRuns || []).length === 0);
  process.env.VERCEL_ENV = "production";

  res = await callCollect("cron-secret-for-tests");
  let st = S.docs.get(stateKey);
  const runs1 = st.recentRuns || [];
  t("F4 掲載期限の定期実行(合言葉は既存の確認のまま)で、前回の成功から40分たっていれば GA4 から取得して保存する(呼び出し元 expire・成功)・掲載期限の処理も既存どおり 200",
    res.code === 200 && res.body && res.body.success === true && G.reports.length > reportsBefore && runs1.length === 1 && runs1[0].trigger === "expire" && runs1[0].result === "ok" && readMs(st.lastSuccessAt) > old && readMs(S.docs.get("areaUsageStats/JP_沖縄県").refreshedAt) === readMs(st.lastSuccessAt),
    { code: res.code, runs1 });

  reportsBefore = G.reports.length;
  res = await callCollect("cron-secret-for-tests");
  t("F5 直後の別の呼び出し(GitHub と cron-job.org の両方から等)では取得しない(25分未満)＝呼び出しが重なっても30分に1回程度", G.reports.length === reportsBefore && (S.docs.get(stateKey).recentRuns || []).length === 1);

  S.docs.set(stateKey, { ...S.docs.get(stateKey), lastSuccessAt: ts(old), lastAttemptAt: ts(old) });
  G.fail = { status: 500, body: { error: { code: 500, status: "INTERNAL", message: "backend error" } } };
  const failedCode = (await callCollect("cron-secret-for-tests")).code;
  st = S.docs.get(stateKey);
  const runs2 = st.recentRuns || [];
  reportsBefore = G.reports.length;
  await callCollect("cron-secret-for-tests");
  t("F6 GA4 の失敗：失敗を記録(数値の文書は前回のまま)・掲載期限の処理は止めない(200)・5分以内の次の呼び出しでは再実行しない",
    runs2.length === 2 && runs2[1].result === "failed" && failedCode === 200 && G.reports.length === reportsBefore && st.lastErrorCode !== "", { runs2, failedCode });
  S.docs.set(stateKey, { ...S.docs.get(stateKey), lastAttemptAt: ts(Date.now() - 6 * 60000) });
  G.fail = null;
  await callCollect("cron-secret-for-tests");
  const runs3 = S.docs.get(stateKey).recentRuns || [];
  t("F7 失敗から5分たった次の呼び出しで再実行して成功する", runs3.length === 3 && runs3[2].result === "ok" && S.docs.get(stateKey).lastErrorCode === "");

  S.docs.set(stateKey, { ...S.docs.get(stateKey), lockRunId: "other", lockLeaseUntil: ts(Date.now() + 60000), lastSuccessAt: ts(old), lastAttemptAt: ts(old) });
  reportsBefore = G.reports.length;
  const r409 = await AU.refreshAreaUsageIfDue({ env: process.env, fetch: globalThis.fetch, getFirestore: (await import("firebase-admin/firestore")).getFirestore, getFirebaseAdminApp: () => ({}) }, "expire");
  t("F8 二重実行の防止：別の実行がロック中なら取得しない(already_running)", r409.status === "already_running" && G.reports.length === reportsBefore, r409);
  S.docs.set(stateKey, { ...S.docs.get(stateKey), lockRunId: "", lockLeaseUntil: ts(0) });

  const { getFirestore: gf } = await import("firebase-admin/firestore");
  const db = gf({});
  for (let i = 0; i < 14; i++) await AU.runAreaUsageRefresh(db, { env: process.env, fetch: globalThis.fetch }, Date.now() + i * 1000, "h" + i, "direct");
  const runs4 = S.docs.get(stateKey).recentRuns || [];
  t("F9 実行の記録は直近12回だけ(時刻・呼び出し元・成否だけ。数値・市町村・秘密は記録しない)",
    runs4.length === 12 && runs4.every((x) => Object.keys(x).sort().join() === "at,result,trigger") && !/ya29|PRIVATE|那覇/.test(JSON.stringify(runs4)));

  const getStatus = async (nowMs) => {
    const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(x) { this.body = x; return this; }, end() { return this; } };
    AU.resetAreaUsageStatusMemoForTests();
    if (nowMs) { await AU.handleAreaUsageRefreshStatus({ method: "GET", query: { mode: "areaUsageRefreshStatus" }, headers: {} }, res, { now: () => nowMs, getFirestore: gf, getFirebaseAdminApp: () => ({}) }); return res; }
    await handler({ method: "GET", headers: {}, query: { mode: "areaUsageRefreshStatus" } }, res);
    return res;
  };
  let sres = await getStatus();
  t("F10 公開の状態確認(GET mode=areaUsageRefreshStatus・認証なし)：200 ok・前回の成功の時刻・直近の実行(時刻・呼び出し元・成否だけ)・no-store",
    sres.code === 200 && sres.body.ok === true && sres.body.state === "ok" && /^\d{4}-\d\d-\d\dT/.test(sres.body.lastSuccessAt) && sres.body.recentRuns.length === 12 &&
    sres.body.recentRuns.every((x) => Object.keys(x).sort().join() === "at,result,trigger" && /T/.test(x.at)) && sres.headers["Cache-Control"] === "no-store" &&
    Object.keys(sres.body).sort().join() === "lastSuccessAt,ok,recentRuns,state", sres.body);
  sres = await getStatus(Date.now() + 66 * 60000);
  t("F11 前回の成功から65分を超えたら 503 stale(30分ごとの更新が止まったことが分かる)", sres.code === 503 && sres.body.state === "stale" && sres.body.ok === false, sres.body);

  const src = readFileSync(REPO_ROOT + "/api/expire.js", "utf8").replace(/\r/g, "");
  const hookAt = src.indexOf("await refreshAreaUsageIfDue(");
  t("F12 相乗りは掲載期限の定期実行の合言葉の確認(既存の AI_COLLECT_CRON_SECRET のまま)の後・期限切れの処理の前の1か所だけ",
    hookAt > src.indexOf("process.env.AI_COLLECT_CRON_SECRET;") && hookAt > src.indexOf("return response.status(401)") && hookAt < src.indexOf('.collection("submissions")') &&
    src.split("refreshAreaUsageIfDue(").length === 2 && !/AI_COLLECT_CRON_SECRET_ALT|STORE_CARD_BILLING_CRON_SECRET/.test(src));
  const collectSrc = readFileSync(REPO_ROOT + "/api/admin-source-collect.js", "utf8");
  t("F13 情報収集(本番で読み込みに失敗している)・GitHub Actions の workflow・合言葉は変えていない", !collectSrc.includes("refreshAreaUsageIfDue") && collectSrc.includes("process.env.AI_COLLECT_CRON_SECRET_ALT"));
}

console.log(`TOTAL ${pass + fail} PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
