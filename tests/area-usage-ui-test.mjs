// 店主向け「この街のマチナウ利用状況」：store-account.html の店舗管理画面の上部(スマートフォンの幅 375px・ja/en)。
// 市町村名・利用人数・利用回数・今日/過去7日間/過去30日間の切り替え・集計対象の期間・最終更新・複数店舗の切り替え・
// 10人未満・0人と非表示の区別・準備中・対象外・所在地不明・読み込み失敗・更新失敗・旅行者の TOP には出さない。
// 店舗のログインはブラウザで模擬、POST /api は本物の処理(模擬の firebase-admin)が答える。数値は試験用の架空の値で、
// 本番の実績ではない。実際の GA4・Firestore・本番には接続しない。
// run: node --import ./tests/mockfa-occ/register.mjs tests/area-usage-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8883;
const ORIGIN = "http://127.0.0.1:" + PORT;
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
Object.assign(process.env, { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup" });
const pw = (uid) => ({ uid, email: uid + "@example.com", email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { own: pw("uo"), one: pw("u1"), tok: pw("ut") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const realFetch = globalThis.fetch;
let googleCalls = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (/google/.test(u.hostname)) googleCalls++;
  throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const AU = await import(REPO_URL + "/api/_lib/area-usage.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
let failAreaUsage = false;
let areaUsageCalls = 0;
async function api(url, method, log, postData, headers) {
  if (method === "GET") return null;
  const body = JSON.parse(postData || "{}");
  if (body.mode === "storeAreaUsage") {
    areaUsageCalls++;
    if (failAreaUsage) return { status: 500, body: { success: false, reason: "server_error" } };
  }
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...(headers.Authorization || headers.authorization ? { authorization: headers.Authorization || headers.authorization } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  for (const k of [...S.docs.keys()]) if (k.includes("RateLimits/")) S.docs.delete(k);
  return { status: r.code, body: r.body };
}
const fakeStoreAuth = (token) => `(() => { let fb; Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) { fb = v; if (v && v.initializeApp && !v.__wrapped) { const orig = v.initializeApp.bind(v); v.__wrapped = true; v.initializeApp = function(options, name) {
if (name === 'machinauStoreAccount') { const u = { uid: "u", email: "x@example.com", isAnonymous: false, emailVerified: true, getIdToken: async () => ${JSON.stringify(token)}, reload: async () => {}, sendEmailVerification: async () => {} }; return { name, auth: () => ({ currentUser: u, onAuthStateChanged(cb) { setTimeout(() => cb(u), 0); return () => {}; }, signOut: async () => {} }) }; } return orig(options, name); }; } } }); })();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };

// ---- fixtures(試験用の架空の値) ----
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, setupStatus: "succeeded", detachPendingPaymentMethods: [], pendingSetupIntentId: "" } });
function seed(uid, id, o, offset) {
  S.docs.set("storeMembers/" + id + "_" + uid, { storeId: id, uid, role: "owner", status: "active" });
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, enabled: true, registrationStatus: "active", createdByType: "storeUser", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", latitude: 26.21, longitude: 127.68, duplicateCandidates: [], reviewFlags: [], createdAt: Timestamp.fromMillis(Date.now() - offset), ...o });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "draft", storeName: "店" + id, revision: 1 });
}
card("uo"); card("u1"); card("ut");
seed("uo", "SN", {}, 3000); seed("uo", "SI", { city: "石垣市" }, 2000); seed("uo", "SY", { city: "八重瀬町" }, 1000);
seed("u1", "SO", { city: "宮古島市" }, 1000);
seed("ut", "ST", { prefecture: "東京都", city: "港区" }, 2000); seed("ut", "SU", { city: "" }, 1000);
const NOW = Date.now();
const todayKey = AU.dateKeyInTimeZone(NOW, "Asia/Tokyo");
const periods = AU.buildAreaUsagePeriods(todayKey);
const START = periods.last7Days.startDate; // 計測の開始日：7日前(30日の期間は開始日からになる)
const docs = AU.buildAreaUsageStatsDocs({
  dimensionHeaders: [{ name: "dateRange" }, { name: "customEvent:area_prefecture" }, { name: "customEvent:area_city" }],
  rows: [["today", "那覇市", 12, 31], ["last7Days", "那覇市", 40, 133], ["last30Days", "那覇市", 128, 356], ["last7Days", "石垣市", 5, 9], ["last30Days", "石垣市", 25, 61], ["today", "八重瀬町", 0, 0]]
    .map(([range, city, users, events]) => ({ dimensionValues: [{ value: range }, { value: "沖縄県" }, { value: city }], metricValues: [{ value: String(users) }, { value: String(events) }] })),
  metadata: { timeZone: "Asia/Tokyo" }
}, { nowMillis: NOW - 10 * 60000, runId: "ui", targets: AU.AREA_USAGE_TARGETS, measurementStartDate: START });
S.docs.set("areaUsageStats/" + docs[0].id, docs[0].data);
S.docs.set("areaUsageRefreshState/ga4", { lastAttemptAt: Timestamp.fromMillis(NOW - 600000), lastSuccessAt: Timestamp.fromMillis(NOW - 600000), lastErrorCode: "" });

const server = await serve(REPO_ROOT + "", PORT);
const browser = await launchChrome();
async function open(token, lang = "ja") {
  const p = await openPage(browser, { origin: ORIGIN, width: 375, mobile: true, state: { apiPassthrough: true, apiMock: api, articles: [], initScripts: [fakeStoreAuth(token), langInit(lang)] } });
  await p.goto("/store-account.html");
  await p.waitFor(`!document.getElementById("accountView").hidden && document.querySelectorAll("#storeList li").length > 0`, 15000);
  await p.waitFor(`document.getElementById("areaUsageStatus").getAttribute("data-area-usage-status") !== "loading"`, 15000);
  await sleep(300);
  return p;
}
const view = (p) => p.ev(`(() => { const g = (id) => document.getElementById(id); return { hidden: g("areaUsagePanel").hidden, heading: g("areaUsagePanel").querySelector("h3").textContent, intro: g("areaUsagePanel").querySelector(".note").textContent, city: g("areaUsageCity").textContent, valuesHidden: g("areaUsageValues").hidden, users: g("areaUsageUsers").textContent, events: g("areaUsageEvents").textContent, range: g("areaUsageRange").hidden ? "" : g("areaUsageRange").textContent, updated: g("areaUsageUpdated").hidden ? "" : g("areaUsageUpdated").textContent, status: g("areaUsageStatus").classList.contains("show") ? g("areaUsageStatus").textContent : "", code: g("areaUsageStatus").getAttribute("data-area-usage-status"), selectShown: !g("areaUsageStoreField").hidden, options: [...g("areaUsageStoreSelect").options].map((o) => o.textContent), pressed: [...document.querySelectorAll("[data-area-usage-period]")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("data-area-usage-period")), notes: [...g("areaUsagePanel").querySelectorAll(".area-usage-notes li")].map((li) => li.textContent), noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 }; })()`);
const clickPeriod = (p, period) => p.ev(`document.querySelector('[data-area-usage-period="${period}"]').click(); true`);
const pickStore = (p, id) => p.ev(`(() => { const s = document.getElementById("areaUsageStoreSelect"); s.value = "${id}"; s.dispatchEvent(new Event("change")); return true; })()`);
const waitCode = (p, prefix) => p.waitFor(`(document.getElementById("areaUsageStatus").getAttribute("data-area-usage-status") || "").startsWith("${prefix}")`, 10000);

try {
  let p = await open("own");
  let v = await view(p);
  const order = await p.ev(`(() => { const section = document.getElementById("storeSection"); const kids = [...section.children]; return { panel: kids.indexOf(document.getElementById("areaUsagePanel")), list: kids.indexOf(document.getElementById("storeList")), heading: kids.findIndex((k) => k.tagName === "H3") }; })()`);
  t("U1 店舗管理画面の上部(「あなたの店舗・施設」の見出しの直後・店舗一覧より上)に表示", !v.hidden && order.heading === 0 && order.panel === 1 && order.panel < order.list, order);
  t("U2 見出し「この街のマチナウ利用状況」・採用済みの案内文", v.heading === "この街のマチナウ利用状況" && v.intro === "この街で、マチナウがどれくらい利用されているかをご確認いただけます。地域の利用状況を参考に、お店の情報発信にお役立てください。", v);
  t("U3 選択中の店舗(最初の店舗 店SN)の市町村「沖縄県 那覇市」・今日：12人・約30回", v.city === "沖縄県 那覇市" && !v.valuesHidden && v.users === "12人" && v.events === "約30回" && v.pressed.join() === "today", v);
  t("U4 集計対象の期間(今日)と最終更新の日時", /^集計対象：\d+月\d+日〜\d+月\d+日$/.test(v.range) && /^最終更新：\d+月\d+日 \d{2}:\d{2}$/.test(v.updated), v);
  t("U5 注記：人数は推定値・回数は現在地の判定の成功回数・実際の来店人数ではない・今日の数字は数時間遅れることがある・10人未満", v.notes.length === 5 && /推定値/.test(v.notes[0]) && /現在地の判定に成功した回数/.test(v.notes[1]) && /実際の来店人数ではありません/.test(v.notes[2]) && /数時間遅れて/.test(v.notes[3]) && /10人未満/.test(v.notes[4]), v.notes);
  await clickPeriod(p, "last7Days"); v = await view(p);
  t("U6 過去7日間：40人・約130回(期間の表示も切り替わる)", v.users === "40人" && v.events === "約130回" && v.pressed.join() === "last7Days" && /^集計対象：/.test(v.range), v);
  await clickPeriod(p, "last30Days"); v = await view(p);
  t("U7 過去30日間：128人・約360回・計測の開始日より前は含めない(「計測の開始日」と表示)", v.users === "128人" && v.events === "約360回" && /（計測の開始日）/.test(v.range), v);
  t("U8 期間の切り替えでは API を呼び直さない(保存済みの値を表示)", areaUsageCalls === 1, areaUsageCalls);
  t("U9 複数店舗：店舗の選択を表示(3店舗)", v.selectShown && v.options.join() === "店SN,店SI,店SY", v.options);
  await pickStore(p, "SI"); await waitCode(p, "ok:"); v = await view(p);
  t("U10 店舗を切り替えると、その店舗の所在地(石垣市)の値(過去30日間：25人・約60回)", v.city === "沖縄県 石垣市" && v.users === "25人" && v.events === "約60回", v);
  await clickPeriod(p, "last7Days"); v = await view(p);
  t("U11 1〜9人：「10人未満」・回数は「表示なし」・理由を案内", v.users === "10人未満" && v.events === "表示なし" && /10人未満/.test(v.status), v);
  await clickPeriod(p, "today"); v = await view(p);
  t("U12 行の無い期間(石垣市の今日)：0人・0回(しきい値の無い応答の時だけ)", v.users === "0人" && v.events === "0回" && v.status === "", v);
  await pickStore(p, "SY"); await waitCode(p, "ok:"); v = await view(p);
  t("U13 八重瀬町(今日 0人)：0人", v.city === "沖縄県 八重瀬町" && v.users === "0人", v);
  t("U14 375px で横にはみ出さない・JavaScript のエラーなし", v.noHScroll && p.log.errors.length === 0, p.log.errors);
  await p.close();

  // ---- English ----
  p = await open("own", "en"); v = await view(p);
  t("U15 English：見出し・人数・回数・期間・注記が英語", v.heading === "Machinau use in your town" && v.users === "12" && v.events === "About 30" && /^Period: /.test(v.range) && /^Last updated: /.test(v.updated) && /not the number of visitors/.test(v.notes[2]) && /few hours/.test(v.notes[3]) && v.noHScroll, v);
  await p.ev(`document.querySelector('[data-language="ja"]') && document.querySelector('[data-language="ja"]').click(); true`); await sleep(300); v = await view(p);
  t("U16 言語の切り替えで表示も切り替わる(日本語)", v.heading === "この街のマチナウ利用状況" && v.users === "12人", v);
  await p.close();

  // ---- 1店舗・宮古島市(数値の無い市町村)・しきい値 ----
  S.docs.set("areaUsageStats/" + docs[0].id, { ...docs[0].data, thresholded: true, cities: { ...docs[0].data.cities, "宮古島市": { today: { state: "withheld" }, last7Days: { state: "withheld" }, last30Days: { state: "withheld" } } } });
  AU.resetAreaUsageCachesForTests();
  p = await open("one"); v = await view(p);
  t("U17 1店舗だけ：店舗の選択は出さない", !v.selectShown && v.city === "沖縄県 宮古島市", v);
  t("U18 しきい値で伏せられた可能性：0人ではなく「表示なし」と案内", v.users === "表示なし" && v.events === "表示なし" && /0人という意味ではありません/.test(v.status), v);
  await p.close();

  // ---- 対象外・所在地不明 ----
  p = await open("tok"); v = await view(p);
  t("U19 対象外の地域(東京都港区)：別の地域の数字を出さず「まだ集計の対象の地域ではありません」", v.city === "東京都 港区" && v.valuesHidden && /港区は、まだ集計の対象の地域ではありません/.test(v.status), v);
  await pickStore(p, "SU"); await waitCode(p, "area_unknown"); v = await view(p);
  t("U20 所在地の市町村が不明：数値を出さずに案内", v.valuesHidden && /市町村を確認できない/.test(v.status), v);
  await p.close();

  // ---- 準備中・計測前・更新失敗・遅れ・読み込み失敗 ----
  S.docs.delete("areaUsageStats/" + docs[0].id);
  S.docs.set("areaUsageRefreshState/ga4", { lastAttemptAt: Timestamp.fromMillis(NOW), lastErrorCode: "ga4_permission_denied" });
  AU.resetAreaUsageCachesForTests();
  p = await open("one"); v = await view(p);
  t("U21 一度も取得できていない(GA4 の設定待ち)：「準備中」・数値も0も出さない・最終更新も出さない", v.valuesHidden && /準備中/.test(v.status) && v.updated === "" && v.code === "preparing", v);
  await p.close();
  S.docs.set("areaUsageStats/" + docs[0].id, { ...docs[0].data, measurementStartDate: "" });
  S.docs.set("areaUsageRefreshState/ga4", { lastAttemptAt: Timestamp.fromMillis(NOW), lastSuccessAt: Timestamp.fromMillis(NOW), lastErrorCode: "" });
  AU.resetAreaUsageCachesForTests();
  p = await open("one"); v = await view(p);
  t("U22 計測の開始直後(地域イベントがまだ無い)：「計測を始めたばかり」・数値は出さない・最終更新は出す", v.valuesHidden && /計測を始めたばかりで、まだ集計できる利用のデータがありません/.test(v.status) && /^最終更新：/.test(v.updated), v);
  await p.close();
  S.docs.set("areaUsageStats/" + docs[0].id, { ...docs[0].data, refreshedAt: Timestamp.fromMillis(NOW - 3 * 3600000) });
  S.docs.set("areaUsageRefreshState/ga4", { lastAttemptAt: Timestamp.fromMillis(NOW), lastSuccessAt: Timestamp.fromMillis(NOW - 3 * 3600000), lastErrorCode: "ga4_request_failed" });
  AU.resetAreaUsageCachesForTests();
  p = await open("own"); v = await view(p);
  t("U23 更新の失敗・遅れ：前回の数値(12人)を出したまま「最終更新の時点の数値」と案内", v.users === "12人" && /遅れています/.test(v.status) && /取得できませんでした/.test(v.status), v);
  await p.close();
  failAreaUsage = true;
  p = await open("own"); v = await view(p);
  t("U24 利用状況の読み込みに失敗：数値を出さず「読み込めませんでした」(他の店舗の表示は続く)", v.valuesHidden && /読み込めませんでした/.test(v.status) && (await p.ev(`document.querySelectorAll("#storeList li").length`)) === 3 && p.log.errors.length === 0, v);
  await p.close();
  failAreaUsage = false;

  t("U25 店主の画面の表示で Google(GA4)への通信は0回", googleCalls === 0, googleCalls);
  const index = readFileSync(REPO_ROOT + "/index.html", "utf8");
  t("U26 旅行者向けの TOP(index.html)には利用状況を出さない", !index.includes("areaUsagePanel") && !index.includes("area_usage_heading"));
} finally {
  await browser.close();
  server.close();
}
console.log(`TOTAL ${pass + fail} PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
