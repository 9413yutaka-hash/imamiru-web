// 2026-11-22｜住所なし(mobile)登録と今だけ投稿の出店場所の確認。
// 実モジュール(api/_lib/store-self-service.js・store-profile.js・imadake.js)を偽Firestoreで動かす。
// Geocodingは global fetch のスタブで答える。実行: node tests/store-mobile-location-test.mjs
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
const REPO = REPO_ROOT + "";
const SS = await import(pathToFileURL(REPO + "/api/_lib/store-self-service.js").href);
const SP = await import(pathToFileURL(REPO + "/api/_lib/store-profile.js").href);
const IM = await import(pathToFileURL(REPO + "/api/_lib/imadake.js").href);

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 500) : ""}`); };
const TS = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));

function makeDb() {
  const store = new Map(); const writeLog = []; let autoId = 0;
  const ref = (col, id) => ({ path: col + "/" + id, id, col, get: async () => snap({ path: col + "/" + id, id }) });
  const setPath = (obj, dotted, value) => { const ks = dotted.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = value; };
  const apply = (w) => { const cur = store.get(w.ref.path); let data = cur ? clone(cur.data) : {}; if (w.type === "set") data = w.merge ? { ...data, ...clone(w.data) } : clone(w.data); if (w.type === "update") { if (!cur) throw new Error("update missing " + w.ref.path); for (const [k, v] of Object.entries(w.data)) setPath(data, k, clone(v)); } store.set(w.ref.path, { data, version: (cur ? cur.version : 0) + 1 }); writeLog.push(w.ref.path.split("/")[0]); };
  const snap = (r) => { const cur = store.get(r.path); return { id: r.id, exists: !!cur, data: () => (cur ? clone(cur.data) : undefined) }; };
  const colDocs = (col) => [...store.entries()].filter(([p]) => p.startsWith(col + "/") && !p.slice(col.length + 1).includes("/")).map(([p, v]) => ({ id: p.split("/")[1], data: () => clone(v.data) }));
  const db = {
    collection: (col) => ({
      doc: (id) => ref(col, id || "auto" + (++autoId)),
      get: async () => ({ docs: colDocs(col) }),
      where: (field, op, value) => ({ get: async () => ({ docs: colDocs(col).filter((d) => { const data = d.data() || {}; return op === "==" ? data[field] === value : false; }) }) })
    }),
    async runTransaction(fn) {
      for (let a = 0; a < 20; a++) {
        const reads = new Map(); const writes = [];
        const tx = { get: async (r) => { const cur = store.get(r.path); reads.set(r.path, cur ? cur.version : 0); return snap(r); }, set: (r, data, opts) => writes.push({ type: "set", ref: r, data, merge: !!(opts && opts.merge) }), update: (r, data) => writes.push({ type: "update", ref: r, data }) };
        const result = await fn(tx);
        let ok = true; for (const [p, v] of reads) { const cur = store.get(p); if ((cur ? cur.version : 0) !== v) ok = false; }
        if (!ok) continue; writes.forEach(apply); return result;
      }
      throw new Error("contention");
    }
  };
  return { db, store, writeLog, seed: (col, id, data) => store.set(col + "/" + id, { data: clone(data), version: 1 }), get: (col, id) => (store.get(col + "/" + id) || {}).data, all: (col) => colDocs(col) };
}

const findComponent = (components, type) => (Array.isArray(components) ? components.find((c) => Array.isArray(c.types) && c.types.includes(type)) || null : null);
const res = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

process.env.GOOGLE_MAPS_API_KEY = "test-key";
let fetchResult = null;
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => fetchResult });
const GEO_COMPONENTS = [
  { types: ["country", "political"], short_name: "JP", long_name: "日本" },
  { types: ["administrative_area_level_1", "political"], short_name: "沖縄県", long_name: "沖縄県" },
  { types: ["locality", "political"], short_name: "北谷町", long_name: "北谷町" }
];
const geoOk = (lat, lng) => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: "日本、沖縄県北谷町美浜9-1", geometry: { location: { lat, lng } }, address_components: GEO_COMPONENTS }] });

// ---------- A. 公開条件 location ----------
{
  const baseProfile = { description: "テスト紹介文", moderationStatus: "passed", moderatedText: "テスト紹介文", businessHours: {}, photos: [{ url: "https://example.com/a.jpg", moderationStatus: "passed" }] };
  const base = { profile: baseProfile, ownerActive: true, planActive: true, resolvedListingIds: new Set() };
  const mobileAccount = { registrationStatus: "active", enabled: true, countryCode: "JP", locationMode: "mobile", prefecture: "沖縄県", city: "北谷町" };
  t("A1 mobile+活動エリアで location を満たす", !SP.evaluateStorePublishConditions({ ...base, account: mobileAccount }).includes("location"), SP.evaluateStorePublishConditions({ ...base, account: mobileAccount }));
  t("A2 mobile で市区町村なしは location を満たさない", SP.evaluateStorePublishConditions({ ...base, account: { ...mobileAccount, city: "" } }).includes("location"));
  t("A3 固定店舗は座標なしでは location を満たさない(従来通り)", SP.evaluateStorePublishConditions({ ...base, account: { registrationStatus: "active", enabled: true, countryCode: "JP" } }).includes("location"));
  t("A4 固定店舗は座標があれば location を満たす(従来通り)", !SP.evaluateStorePublishConditions({ ...base, account: { registrationStatus: "active", enabled: true, countryCode: "JP", latitude: 26.2, longitude: 127.7 } }).includes("location"));
  t("A5 mobile でも他の条件は従来通り(写真なしは photo が不足)", SP.evaluateStorePublishConditions({ ...base, account: mobileAccount, profile: { ...baseProfile, photos: [] } }).includes("photo"));
}

// ---------- B. 登録 ----------
function selfServiceDeps(m) {
  return {
    getFirebaseAdminApp: () => ({}), getFirestore: () => m.db, readRequestBody: (req) => req.body,
    resolveStoreUserActor: async () => ({ ok: true, actor: { uid: "u1", emailVerified: true } }),
    claimRateLimit: async () => true, computeRateLimitIdentifier: (kind, uid) => kind + ":" + uid,
    findAddressComponentByType: findComponent
  };
}
async function register(m, body) {
  const r = res();
  await quiet(() => SS.handleStoreSelfRegister({ body, headers: {} }, r, selfServiceDeps(m)));
  return r;
}
{
  const m = makeDb();
  const r = await register(m, { storeName: "島タコス号", categoryCode: "gourmet", countryCode: "JP", locationMode: "mobile", activityPrefecture: "沖縄県", activityCity: "北谷町", sourceLanguage: "ja" });
  const account = r.body && r.body.storeId ? m.get("storeAccounts", r.body.storeId) : null;
  t("B1 mobile 登録できる(200・active)", r.code === 200 && r.body.registrationStatus === "active" && !!account, r.body);
  t("B2 アカウントに locationMode mobile・エリア・regionKey が入り、座標と geohash は無い", !!account && account.locationMode === "mobile" && account.prefecture === "沖縄県" && account.city === "北谷町" && account.regionKey === "JP-47" && account.address === "" && !("latitude" in account) && !("geohash" in account), account);
  const r2 = await register(m, { storeName: "悪い店", categoryCode: "gourmet", countryCode: "JP", locationMode: "mobile", activityPrefecture: "沖縄県", activityCity: "存在しない市", sourceLanguage: "ja" });
  t("B3 マスタにない市区町村は 400 activityArea", r2.code === 400 && r2.body.field === "activityArea", r2.body);
  const r3 = await register(m, { storeName: "海外店", categoryCode: "gourmet", countryCode: "US", locationMode: "mobile", activityPrefecture: "沖縄県", activityCity: "北谷町", sourceLanguage: "ja" });
  t("B4 mobile は JP 以外では 400", r3.code === 400, r3.body);
  fetchResult = geoOk(26.15, 127.72);
  const r4 = await register(m, { storeName: "固定カフェ", categoryCode: "gourmet", countryCode: "JP", address: "沖縄県北谷町美浜9-1", sourceLanguage: "ja" });
  const fixedAccount = r4.body && r4.body.storeId ? m.get("storeAccounts", r4.body.storeId) : null;
  t("B5 固定店舗は従来通り座標つきで登録できる", r4.code === 200 && !!fixedAccount && fixedAccount.latitude === 26.15 && fixedAccount.locationMode === "fixed", { code: r4.code, body: r4.body });
}

// ---------- C. 今だけ投稿 ----------
function imadakeDeps(m) {
  const calls = { moderation: 0 };
  return {
    calls,
    getFirebaseAdminApp: () => ({}), getFirestore: () => m.db, readRequestBody: (req) => req.body,
    claimRateLimit: async () => true, hashRateLimitStore: (id) => "store:" + id, hashClientIpAddress: () => "ip",
    buildModerationInput: (x) => x, callOpenAiModeration: async (input) => { calls.moderation++; return (Array.isArray(input) ? input : [input]).map(() => ({ flagged: false })); },
    classifyModerationError: () => "error", buildReviewReason: () => "review", matchesSafetyCriticalKeywords: () => false, AI_REVIEW_VERSION: "test",
    requireAdmin: async () => ({ ok: false, status: 403 }), findAddressComponentByType: findComponent,
    resolveStoreUserActor: async () => ({ ok: true, actor: { type: "storeUser", uid: "u1", emailVerified: true } }),
    checkStoreProfileEditor: SP.checkStoreProfileEditor
  };
}
const POST_BODY = { categoryCode: "restaurant", headline: "本日出店中", body: "タコス販売中です。", sourceLanguage: "ja", imageUrls: [], imagePublicIds: [], actionTargets: {}, categoryFields: {}, paymentMethods: [] };
async function createPost(m, d, body) {
  const r = res();
  await quiet(() => IM.handleImadakePostCreate({ body: { mode: "imadakePostCreate", ...POST_BODY, ...body }, headers: {} }, r, d));
  return r;
}
async function storeStatus(m, d, storeId) {
  const r = res();
  await quiet(() => IM.handleImadakeStoreStatus({ body: { mode: "imadakeStoreStatus", storeId }, headers: {} }, r, d));
  return r;
}
{
  const m = makeDb();
  m.seed("storeAccounts", "truck1", { storeName: "島タコス号", enabled: true, createdByType: "storeUser", registrationStatus: "active", locationMode: "mobile", countryCode: "JP", prefecture: "沖縄県", city: "北谷町", regionKey: "JP-47" });
  m.seed("storeMembers", "truck1_u1", { storeId: "truck1", uid: "u1", role: "owner", status: "active" });
  m.seed("storeAccounts", "fixed1", { storeName: "固定タコス", enabled: true, createdByType: "storeUser", registrationStatus: "active", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", regionKey: "JP-47", address: "沖縄県那覇市1-1", latitude: 26.21, longitude: 127.68 });
  m.seed("storeMembers", "fixed1_u1", { storeId: "fixed1", uid: "u1", role: "owner", status: "active" });
  const d = imadakeDeps(m);

  const st = await storeStatus(m, d, "truck1");
  t("C1 mobile 店舗の状態: locationMode mobile・場所は活動エリア", st.code === 200 && st.body.locationMode === "mobile" && st.body.location && st.body.location.city === "北谷町", st.body);

  const noSpot = await createPost(m, d, { storeId: "truck1" });
  t("C2 mobile で出店場所なしは 400 post_location_required", noSpot.code === 400 && noSpot.body.reason === "post_location_required", noSpot.body);

  fetchResult = geoOk(26.316, 127.769);
  const withSpot = await createPost(m, d, { storeId: "truck1", postAddress: "北谷町美浜9-1 カーニバルパーク前" });
  const post = withSpot.body && withSpot.body.postId ? m.get("imadakePosts", withSpot.body.postId) : null;
  t("C3 mobile+出店場所で投稿でき、snapshot は投稿の場所になる", withSpot.code === 200 && !!post && post.latitude === 26.316 && post.longitude === 127.769 && post.city === "北谷町" && post.address === "北谷町美浜9-1 カーニバルパーク前" && post.locationSource === "storePost" && post.status === "published", { code: withSpot.code, body: withSpot.body, post });

  fetchResult = { status: "ZERO_RESULTS", results: [] };
  const m2 = makeDb();
  m2.seed("storeAccounts", "truck1", { storeName: "島タコス号", enabled: true, createdByType: "storeUser", registrationStatus: "active", locationMode: "mobile", countryCode: "JP", prefecture: "沖縄県", city: "北谷町", regionKey: "JP-47" });
  m2.seed("storeMembers", "truck1_u1", { storeId: "truck1", uid: "u1", role: "owner", status: "active" });
  const badSpot = await createPost(m2, imadakeDeps(m2), { storeId: "truck1", postAddress: "どこかそのへん" });
  t("C4 場所を特定できない住所は 400 post_location_unresolved で保存しない", badSpot.code === 400 && badSpot.body.reason === "post_location_unresolved" && m2.all("imadakePosts").length === 0, badSpot.body);

  const fixed = await createPost(m, d, { storeId: "fixed1", postAddress: "北谷町美浜9-1" });
  const fixedPost = fixed.body && fixed.body.postId ? m.get("imadakePosts", fixed.body.postId) : null;
  t("C5 固定店舗は postAddress を送っても正式所在地のまま", fixed.code === 200 && !!fixedPost && fixedPost.latitude === 26.21 && fixedPost.address === "沖縄県那覇市1-1" && fixedPost.locationSource === "storeAccount", { code: fixed.code, post: fixedPost });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
