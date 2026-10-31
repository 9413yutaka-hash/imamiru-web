// STEP 49-A｜「街の発見」を地域から探す(selectedShopRegion)で選んだ市区町村で表示するテスト。
// app.js の実際の関数を取り出して vm 上で動かす(ネットワーク・Firestore には触れない)。
import { REPO_ROOT } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const appJs = readFileSync(join(REPO_ROOT, "app.js"), "utf8").replace(/\r\n/g, "\n");

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };

// 関数宣言(またはconst宣言)を波括弧の対応で丸ごと取り出す。
function extract(src, header) {
  const start = src.indexOf(header);
  if (start < 0) throw new Error("not found: " + header);
  if (header.startsWith("const ")) return src.slice(start, src.indexOf(";", start) + 1);
  let i = src.indexOf("{", src.indexOf(")", start)), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

const pieces = [
  "const NEARBY_SHOP_CARD_RADIUS_KM =",
  "function escapeHtml(text) {",
  "function degreesToRadians(",
  "function calculateDistance(",
  "function formatDistance(distanceKm) {",
  "function getDateValue(",
  "function isShopWithinNearbyCardRadius(",
  "function isShopInSelectedShopRegion(",
  "function getStreetDiscoveryItemsInSelectedRegion(",
  "function renderStreetDiscoverySection() {"
].map((h) => extract(appJs, h)).join("\n\n");

const elements = {
  streetDiscoverySection: { style: { display: "none" } },
  streetDiscoveryList: { innerHTML: "" }
};
const ctx = {
  document: { getElementById: (id) => elements[id] || null },
  getCurrentMachinauLanguage: () => "ja",
  getMachinauTranslation: (key) => key,
  getExpiryDisplayText: () => "",
  getSafeImageUrl: (u) => u,
  buildOptimizedImageUrl: (u) => u,
  OPTIMIZED_IMAGE_WIDTH_CARD: 400,
  Math, Number, Date, Array, JSON, isNaN
};
vm.createContext(ctx);
vm.runInContext(pieces + "\nvar shops = []; var userLatitude = null; var userLongitude = null; var selectedShopRegion = null;", ctx);

const NOW = Date.now();
const H = 3600 * 1000;
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const YAESE = { lat: 26.1585, lng: 127.7186 };
const CHATAN = { lat: 26.3195, lng: 127.7643 };
const NAHA = { lat: 26.212, lng: 127.679 };
const CHATAN_REGION = { prefectureName: "沖縄県", municipalityName: "北谷町" };
const NAHA_REGION = { prefectureName: "沖縄県", municipalityName: "那覇市" };

const street = (id, title, address, pos, extra = {}) => ({
  id, title, message: "", address, submissionType: "street",
  latitude: pos ? pos.lat : null, longitude: pos ? pos.lng : null,
  createdAt: ts(extra.createdAt ?? NOW - H), expiresAt: ts(extra.expiresAt ?? NOW + 3 * H), ...extra.more
});

const fixture = [
  street("c1", "北谷A", "沖縄県中頭郡北谷町美浜1-2", CHATAN, { createdAt: NOW - 3 * H }),
  street("c2", "北谷B", "沖縄県北谷町北谷2-1", null, { createdAt: NOW - H }), // 座標なし・郡名なし
  street("c3", "北谷・住所なし", "", CHATAN), // 住所なし：地域では判定できない
  street("c4", "北谷・県なし", "北谷町美浜", CHATAN), // 都道府県なし：推測しない
  street("c5", "北谷・期限切れ", "沖縄県中頭郡北谷町美浜", CHATAN, { expiresAt: NOW - 1 }),
  street("n1", "那覇", "沖縄県那覇市久茂地1", NAHA),
  street("y1", "八重瀬", "沖縄県島尻郡八重瀬町具志頭", YAESE),
  { id: "s1", title: "北谷の店", address: "沖縄県中頭郡北谷町美浜", submissionType: "shop", latitude: CHATAN.lat, longitude: CHATAN.lng, createdAt: ts(NOW), expiresAt: ts(NOW + H) }
];

function render({ lat = null, lng = null, region = null }) {
  ctx.shops = fixture; ctx.userLatitude = lat; ctx.userLongitude = lng; ctx.selectedShopRegion = region;
  elements.streetDiscoveryList.innerHTML = ""; elements.streetDiscoverySection.style.display = "none";
  vm.runInContext("renderStreetDiscoverySection()", ctx);
  const html = elements.streetDiscoveryList.innerHTML;
  const titles = [...html.matchAll(/<h3 class="street-discovery-title">([^<]*)<\/h3>/g)].map((m) => m[1]);
  return { shown: elements.streetDiscoverySection.style.display !== "none", titles, html };
}

// 1 八重瀬町にいて北谷町を指定
let r = render({ lat: YAESE.lat, lng: YAESE.lng, region: CHATAN_REGION });
t("1a 八重瀬町から北谷町を指定 → 北谷町の街の発見が表示される", r.shown && r.titles.includes("北谷A") && r.titles.includes("北谷B"), r.titles);
t("1b 北谷町以外(那覇・八重瀬)は出ない", !r.titles.includes("那覇") && !r.titles.includes("八重瀬"), r.titles);
t("1c 新しい順(北谷B→北谷A)", r.titles.join(",") === "北谷B,北谷A", r.titles);
t("1d 住所なし・都道府県なしの投稿は推測で割り当てない", !r.titles.includes("北谷・住所なし") && !r.titles.includes("北谷・県なし"), r.titles);
t("1e 期限切れ・店舗(shop)投稿は出ない", !r.titles.includes("北谷・期限切れ") && !r.titles.includes("北谷の店"), r.titles);
const card = (html, title) => html.split("<article").find((a) => a.includes(">" + title + "<")) || "";
const DIST = /\d(?:\.\d)?\s*(?:km|m)\b/;
t("1f 座標がある投稿は現在地からの距離を添え、座標なしは距離を出さない", DIST.test(card(r.html, "北谷A")) && !DIST.test(card(r.html, "北谷B")), [card(r.html, "北谷A").slice(-200), card(r.html, "北谷B").slice(-200)]);

// 2 北谷町の現地(地域指定なし)＝従来どおり15km
r = render({ lat: CHATAN.lat, lng: CHATAN.lng });
t("2a 北谷町の現地(指定なし) → 15km内の北谷の投稿を表示", r.shown && r.titles.includes("北谷A") && r.titles.includes("北谷・住所なし") && r.titles.includes("北谷・県なし"), r.titles);
t("2b 現在地モードは座標なしの投稿・15km外(八重瀬)を出さない", !r.titles.includes("北谷B") && !r.titles.includes("八重瀬"), r.titles);

// 3 北谷町から別の街(那覇市)へ切り替え
r = render({ lat: CHATAN.lat, lng: CHATAN.lng, region: NAHA_REGION });
t("3 北谷町→那覇市へ切替 → 対象が那覇市だけに変わる", r.shown && r.titles.join(",") === "那覇", r.titles);

// 4 現在地へ戻す(八重瀬の現地)
r = render({ lat: YAESE.lat, lng: YAESE.lng });
t("4a 現在地へ戻す → GPS基準(八重瀬の15km内)に戻る", r.shown && r.titles.includes("八重瀬") && !r.titles.includes("北谷A") && !r.titles.includes("北谷B"), r.titles);
t("4b 近い順(八重瀬→那覇)", r.titles.join(",") === "八重瀬,那覇", r.titles);

// 5 GPS未取得
r = render({ region: CHATAN_REGION });
t("5a GPS未取得でも北谷町を指定すれば表示", r.shown && r.titles.join(",") === "北谷B,北谷A", r.titles);
t("5b GPS未取得のときは距離を出さない", !DIST.test(r.html), "");
r = render({});
t("5c GPS未取得・指定なし → 従来どおり非表示", !r.shown && r.titles.length === 0, r.titles);

// 6 該当0件の地域
r = render({ lat: YAESE.lat, lng: YAESE.lng, region: { prefectureName: "沖縄県", municipalityName: "読谷村" } });
t("6 該当0件の市区町村 → セクションを出さない(従来の0件と同じ)", !r.shown, r.titles);

// 7 無料店舗枠の15km・店舗カードの判定は無変更(origin/main と同一)
const radius = (s) => extract(s, "const NEARBY_SHOP_CARD_RADIUS_KM =") + extract(s, "function isShopWithinNearbyCardRadius(") + extract(s, "function isShopInSelectedShopRegion(");
const shopFilter = (s) => { const i = s.indexOf("const adminExcludedShops = mergeStoreProfilesIntoShopCardList("); return s.slice(i, s.indexOf("updateShopsSectionRegionUi();", i)); };
let mainJs = "";
try {
  const { execFileSync } = await import("node:child_process");
  mainJs = execFileSync("git", ["show", "origin/main:app.js"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, "\n");
} catch { mainJs = ""; }
if (mainJs) {
  t("7a 15km定数・15km判定・地域判定の関数は origin/main と同一", radius(mainJs) === radius(appJs));
  t("7b 店舗カードの絞り込み・並び順(renderShops)は origin/main と同一", shopFilter(mainJs) !== "" && shopFilter(mainJs) === shopFilter(appJs));
} else {
  t("7 origin/main を読めない(比較できない)", false, "git show failed");
}

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
