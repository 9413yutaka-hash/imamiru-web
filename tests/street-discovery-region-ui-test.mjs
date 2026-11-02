// STEP 53｜TOP の「この街を見る」で選んだ市区町村に、街の発見(街の声・street 投稿)が出ることを実際の画面で確かめる。
// 本番で那覇市の街の発見が出なかった原因：住所が「那覇市 …」(都道府県なし)で、住所の先頭の「都道府県＋市区町村」だけで
// 判定していたため。公開一覧の API(GET /api/moderate-submission)は、本番と同じ形(承認済み・期限内だけ)の値を返す偽物。
// 現在地は八重瀬町(navigator.geolocation を差し替え)。スマートフォン幅・英語・再読み込み・連続の切り替えも確かめる。
// No real services (other GET modes are answered empty). run: node --import ./tests/mockfa/register.mjs tests/street-discovery-region-ui-test.mjs
import { REPO_ROOT } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";

const ORIGIN = "http://127.0.0.1:8879";
let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };

const NOW = Date.now(), H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const YAESE = { lat: 26.1585, lng: 127.7186 };
const street = (id, title, address, lat, lng, ageH = 1, expH = 5) => ({ id, fields: {
  address, businessEndTime: "", businessStartTime: "", category: "街の発見", createdAt: iso(NOW - ageH * H), expiresAt: iso(NOW + expH * H),
  latitude: lat, longitude: lng, paymentMethods: [], shopName: title, submissionType: "street", takeout: false, title, updatedAt: iso(NOW - ageH * H), websiteUrl: "" } });
// 本番の公開一覧と同じ形。サーバーは承認済み・期限内だけを返す(未承認はここに来ない)。期限切れの1件は、画面の側の期限の判定も確かめるために入れる。
const SUBMISSIONS = [
  street("naha1", "那覇・県なし", "那覇市 琉球新報本社ビル1階 あじまーる広場", 26.2129261, 127.6780438, 1), // 本番で出なかった投稿と同じ形
  street("naha2", "那覇・県あり", "沖縄県那覇市久茂地1-1", 26.214, 127.68, 2),
  street("chatan1", "北谷・郡あり県なし", "中頭郡北谷町美浜9-1", 26.3195, 127.7643, 1),
  street("chatan2", "北谷・県あり", "沖縄県中頭郡北谷町北谷2-1", 26.32, 127.76, 3),
  street("yaese1", "八重瀬・現地", "沖縄県島尻郡八重瀬町具志頭", 26.1585, 127.7186, 1),
  street("nahaOld", "那覇・期限切れ", "那覇市泊1", 26.22, 127.68, 9, -1)
];
let listRequests = 0;
async function api(url, method) {
  if (method !== "GET") return { status: 200, body: { success: false, message: "blocked in local test" } };
  const u = new URL(url, ORIGIN);
  if (u.pathname !== "/api/moderate-submission") return { status: 404, body: { success: false } };
  if (!u.searchParams.get("mode")) { listRequests++; return { status: 200, body: { success: true, submissions: SUBMISSIONS } }; }
  return { status: 200, body: { success: true, profiles: [], storeProfiles: [], articles: [], items: [], threads: [], posts: [], claimedListingIds: [], suppressedListingIds: [] } };
}
const geo = `navigator.geolocation.getCurrentPosition = function(ok){ setTimeout(function(){ ok({ coords: { latitude: ${YAESE.lat}, longitude: ${YAESE.lng}, accuracy: 20 } }); }, 50); };
navigator.geolocation.watchPosition = function(ok){ navigator.geolocation.getCurrentPosition(ok); return 1; };`;
const langInit = (lang) => `try{ localStorage.setItem("machinauLanguage", "${lang}"); }catch(e){}`;

const server = await serve(REPO_ROOT + "", 8879);
const browser = await launchChrome();
async function openTop(lang, width) {
  const p = await openPage(browser, { origin: ORIGIN, width, mobile: width < 800, state: { apiMock: api, blockUrls: ["maps.googleapis.com", "places.googleapis.com"], initScripts: [geo, langInit(lang)] } });
  await p.goto("/");
  await p.waitFor(`typeof shops !== "undefined" && shops.some((s) => s.firestoreId === "naha1")`, 20000);
  await p.ev(`machinauStartLocation()`);
  await p.waitFor(`userLatitude !== null && userLongitude !== null`, 10000);
  await sleep(400);
  return p;
}
const titles = (p) => p.ev(`(() => { const s = document.getElementById("streetDiscoverySection"); const l = document.getElementById("streetDiscoveryList"); return { shown: !!s && getComputedStyle(s).display !== "none", titles: l ? [...l.querySelectorAll(".street-discovery-title")].map((h) => h.textContent.trim()) : [] }; })()`);
// 「この街を見る」：都道府県と市区町村を選んでボタンを押す(画面の操作と同じ順)。
const pick = (p, pref, muni) => p.ev(`(async () => { const ps = document.getElementById("communityBoardPrefectureSelect"); ps.value = ${JSON.stringify(pref)}; ps.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50)); const ms = document.getElementById("communityBoardAreaNameInput"); ms.value = ${JSON.stringify(muni)}; ms.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("communityBoardAreaSearchButton").click(); return true; })()`);
const settle = async (p) => { await p.waitFor(`!document.getElementById("communityBoardAreaSearchButton").disabled`, 15000); await sleep(300); };

try {
  // ===== スマートフォン幅・日本語 =====
  let p = await openTop("ja", 390);
  let r = await titles(p);
  t("U1 現在地（八重瀬町・指定なし）：15km の街の発見（八重瀬・那覇）を表示・北谷（15km 外）と期限切れは出ない",
    r.shown && r.titles.includes("八重瀬・現地") && r.titles.includes("那覇・県なし") && !r.titles.some((x) => x.startsWith("北谷")) && !r.titles.includes("那覇・期限切れ"), r);
  await pick(p, "沖縄県", "那覇市"); await settle(p);
  r = await titles(p);
  t("U2 八重瀬町から「この街を見る」で那覇市：都道府県の無い住所（那覇市 琉球新報本社ビル…）の投稿も出る・新しい順・八重瀬・北谷・期限切れは出ない",
    r.shown && r.titles.join(",") === "那覇・県なし,那覇・県あり", r);
  const region = await p.ev(`selectedShopRegion && selectedShopRegion.prefectureName + selectedShopRegion.municipalityName`);
  t("U3 選択中の地域は那覇市（現在地の八重瀬町と混同しない）・現在地は八重瀬町のまま", region === "沖縄県那覇市" && Math.abs((await p.ev("userLatitude")) - YAESE.lat) < 1e-6, region);
  await pick(p, "沖縄県", "北谷町"); await settle(p);
  r = await titles(p);
  t("U4 八重瀬町から北谷町：郡名から始まる住所（中頭郡北谷町…）と県ありの住所の両方・那覇は出ない", r.shown && r.titles.join(",") === "北谷・郡あり県なし,北谷・県あり", r);
  // 連続の切り替え(待たずに続けて押す)
  await pick(p, "沖縄県", "那覇市"); await sleep(30); await pick(p, "沖縄県", "北谷町"); await sleep(30); await pick(p, "沖縄県", "那覇市"); await settle(p); await sleep(500);
  r = await titles(p);
  t("U5 地域を続けて切り替えても、最後に選んだ那覇市の投稿だけ（取り違えない）", r.titles.join(",") === "那覇・県なし,那覇・県あり" && (await p.ev(`selectedShopRegion.municipalityName`)) === "那覇市", r);
  // 英語へ切り替え
  await p.ev(`switchMachinauLanguage("en")`); await sleep(500);
  r = await titles(p);
  t("U6 英語に切り替えても地域の判定は同じ（那覇市の2件・同じ順）", r.titles.join(",") === "那覇・県なし,那覇・県あり" && (await p.ev(`getCurrentMachinauLanguage()`)) === "en", r);
  await p.ev(`switchMachinauLanguage("ja")`); await sleep(300);
  // 現在地へ戻す
  await p.ev(`document.getElementById("regionRecommendationBackToCurrentButton") ? document.getElementById("regionRecommendationBackToCurrentButton").click() : machinauStartLocation()`); await sleep(600);
  r = await titles(p);
  t("U7 現在地へ戻す：地域の選択を外し、八重瀬町の15km に戻る（北谷は出ない）", (await p.ev(`selectedShopRegion`)) === null && r.titles.includes("八重瀬・現地") && !r.titles.some((x) => x.startsWith("北谷")), r);
  // 再読み込み(セッションのキャッシュから復元する経路)
  const before = listRequests;
  await p.goto("/"); await p.waitFor(`typeof shops !== "undefined" && shops.some((s) => s.firestoreId === "naha1")`, 20000);
  await p.ev(`machinauStartLocation()`); await p.waitFor(`userLatitude !== null`, 10000); await sleep(300);
  await pick(p, "沖縄県", "北谷町"); await settle(p);
  r = await titles(p);
  t("U8 再読み込みの後（キャッシュから復元）も北谷町を選べば北谷の2件", r.titles.join(",") === "北谷・郡あり県なし,北谷・県あり" && listRequests === before, { r, listRequests, before });
  const errs = p.log.errors.filter((e) => !/Failed to load resource|net::ERR|maps|places|gtag|analytics|favicon/i.test(e));
  t("U9 画面にスクリプトのエラーが出ない", errs.length === 0, errs.slice(0, 3));
  // ===== パソコン幅・英語で開く =====
  p = await openTop("en", 1280);
  await pick(p, "沖縄県", "北谷町"); await settle(p);
  r = await titles(p);
  t("U10 英語で開いたパソコン幅：八重瀬町から北谷町 → 北谷の2件", r.titles.join(",") === "北谷・郡あり県なし,北谷・県あり", r);
} finally {
  await browser.close?.(); server.close?.();
}

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
