// Unit tests for imadakePostsNearby with an in-memory Firestore mock (no network, no writes).
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
const REPO = REPO_ROOT + "";
const IM = await import(pathToFileURL(REPO + "/api/_lib/imadake.js").href);
const TN = await import(pathToFileURL(REPO + "/api/_lib/town-now-threads.js").href);
const Timestamp = { fromMillis: (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) }) };

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };

const NOW = Date.now();
const H = 3600 * 1000;
const BASE = { lat: 26.212, lng: 127.679 }; // 那覇(小数点以下3桁)
const KM_PER_DEG_LAT = (Math.PI / 180) * 6371; // 球面距離と同じ地球半径
const north = (km) => ({ lat: BASE.lat + km / KM_PER_DEG_LAT, lng: BASE.lng });

// ---------------- Firestore mock ----------------
function makeDb({ slots = {}, posts = {}, failOn = null, ignoreRanges = false } = {}) {
  const stats = { slotReads: 0, postReads: 0, queries: 0, writes: 0 };
  const forbidden = (n) => () => { stats.writes++; throw new Error("WRITE CALLED: " + n); };
  const makeQuery = (filters = [], order = null, lim = Infinity) => ({
    where: (f, op, v) => makeQuery([...filters, [f, op, v]], order, lim),
    orderBy: (f) => makeQuery(filters, f, lim),
    limit: (n) => makeQuery(filters, order, n),
    get: async () => {
      stats.queries++;
      if (failOn === "query") throw new Error("simulated read failure");
      let docs = Object.entries(slots).filter(([, d]) => ignoreRanges || filters.every(([f, op, v]) => {
        const x = d[f]; if (typeof x !== "string") return false;
        return op === ">=" ? x >= v : op === "<" ? x < v : op === "==" ? x === v : false;
      }));
      if (order) docs.sort((a, b) => (a[1][order] < b[1][order] ? -1 : 1));
      docs = docs.slice(0, lim);
      stats.slotReads += docs.length;
      return { docs: docs.map(([id, d]) => ({ id, exists: true, data: () => d })) };
    }
  });
  const db = {
    collection: (name) => {
      if (name === "imadakeStoreSlots") return { ...makeQuery(), doc: forbidden("slot.doc") };
      if (name === "imadakePosts") return { doc: (id) => ({ __post: id, id, set: forbidden("set"), update: forbidden("update") }), where: forbidden("posts.where") };
      throw new Error("unexpected collection " + name);
    },
    getAll: async (...refs) => {
      if (failOn === "getAll") throw new Error("simulated getAll failure");
      stats.postReads += refs.length;
      return refs.map((r) => ({ id: r.__post, exists: r.__post in posts, data: () => posts[r.__post] }));
    },
    runTransaction: forbidden("runTransaction"),
    batch: forbidden("batch")
  };
  return { db, stats };
}
const deps = (db) => ({ getFirebaseAdminApp: () => ({}), getFirestore: () => db });

function addStore(fx, storeId, postId, pos, overrides = {}, slotOverrides = {}) {
  const publishedAt = overrides.publishedAtMillis ?? NOW - 2 * H;
  const expiresAt = overrides.expiresAtMillis ?? publishedAt + 24 * H;
  fx.posts[postId] = {
    storeId, storeNameSnapshot: "店舗" + storeId, categoryCode: "restaurant", headline: "見出し" + storeId,
    body: overrides.body ?? "本文です。".repeat(30), sourceLanguage: "ja", status: overrides.status ?? "published",
    publishedAt: Timestamp.fromMillis(publishedAt), expiresAt: Timestamp.fromMillis(expiresAt),
    latitude: pos.lat, longitude: pos.lng, geohash: TN.encodeTownNowGeohash(pos.lat, pos.lng), regionKey: "JP-47",
    imageUrls: overrides.imageUrls ?? ["https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_submissions/a.jpg", "https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_submissions/b.jpg"],
    imagePublicIds: ["machinau_submissions/a"], liveState: { type: "seats", status: "few", quantity: 3, updatedAt: Timestamp.fromMillis(NOW - H) },
    availableUntil: "21:00", priceText: "500円", paymentMethods: ["cash"], actionTargets: { phone: "098-000-0000" }, categoryFields: { takeout: true },
    moderationStatus: "passed", moderationReason: "", address: "沖縄県那覇市", countryCode: "JP", prefecture: "沖縄県", city: "那覇市",
    ...(overrides.post || {})
  };
  fx.slots[storeId] = {
    activePostId: postId, activeExpiresAt: Timestamp.fromMillis(expiresAt), activeRegionKey: "JP-47",
    activeGeohash: TN.encodeTownNowGeohash(pos.lat, pos.lng), activeLatitude: pos.lat, activeLongitude: pos.lng, activeCountryCode: "JP",
    ...slotOverrides
  };
}
async function call(db, q) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await IM.handleImadakePostsNearby({ query: q, method: "GET" }, res, deps(db));
  return res;
}
const Q = { mode: "imadakePostsNearby", latitude: String(BASE.lat), longitude: String(BASE.lng) };

// ---------- 1. valid + 15km boundary ----------
{
  const fx = { slots: {}, posts: {} };
  addStore(fx, "s1", "p1", north(1));
  addStore(fx, "s5", "p5", north(5));
  addStore(fx, "s14", "p14", north(14.999));
  addStore(fx, "s15", "p15", north(15));
  addStore(fx, "s15b", "p15b", north(15.001));
  addStore(fx, "s20", "p20", north(20));
  const { db, stats } = makeDb(fx);
  const r = await call(db, Q);
  const ids = r.body.posts.map((p) => p.postId);
  t("valid coords -> 200", r.code === 200 && r.body.success === true && r.body.radiusKm === 15);
  t("15km boundary: 14.999 and 15.000 included, 15.001 and 20 excluded", JSON.stringify(ids) === JSON.stringify(["p1", "p5", "p14", "p15"]), ids);
  t("sorted nearest first", ids[0] === "p1" && ids[3] === "p15");
  t("distanceKm rounded to 0.1", r.body.posts.map((p) => p.distanceKm).join(",") === "1,5,15,15", r.body.posts.map((p) => p.distanceKm));
  t("short CDN cache header (30s like town-now)", r.headers["Cache-Control"] === "public, max-age=0, s-maxage=30, stale-while-revalidate=30");
  t("no writes / transactions", stats.writes === 0);
  // output whitelist
  const p = r.body.posts[0];
  const keys = Object.keys(p).sort().join(",");
  t("card fields only (whitelist)", keys === ["availableUntil", "cardTranslations", "categoryCode", "distanceKm", "excerpt", "excerptTruncated", "expiresAt", "headline", "imageCount", "imageUrl", "liveState", "postId", "publishedAt", "sourceLanguage", "storeName"].sort().join(","), keys);
  const json = JSON.stringify(r.body);
  t("no body / storeId / coords / moderation / token / ids leaked", !/"body"|storeId|latitude|longitude|geohash|moderation|imagePublicIds|token|actionTargets|phone|098-000/.test(json), json.slice(0, 200));
  t("cardTranslations empty when no translation", JSON.stringify(p.cardTranslations) === "{}");
  t("liveState without updatedAt, first image, imageCount", p.liveState.type === "seats" && p.liveState.quantity === 3 && !("updatedAt" in p.liveState) && p.imageUrl.endsWith("a.jpg") && p.imageCount === 2);
  t("excerpt = first 80 chars, truncated flag", Array.from(p.excerpt).length === 80 && p.excerptTruncated === true);
}
// ---------- 2. invalid coords ----------
{
  const { db, stats } = makeDb({});
  const bad = [{}, { latitude: "abc", longitude: "127.6" }, { latitude: "26.2124", longitude: "127.679" }, { latitude: "91", longitude: "0" }, { latitude: "0", longitude: "-181" }, { latitude: "1e2", longitude: "0" }, { latitude: ["26.2"], longitude: "127.6" }, { latitude: " ", longitude: "" }, { latitude: "26.", longitude: "127.6" }, { latitude: "NaN", longitude: "1" }];
  let all400 = true; const codes = [];
  for (const b of bad) { const r = await call(db, { mode: "imadakePostsNearby", ...b }); codes.push(r.code); if (r.code !== 400 || r.body.success !== false) all400 = false; }
  t("invalid coords (missing, text, >3 decimals, out of range, exponent, array, empty) -> 400", all400, codes);
  t("invalid coords: no Firestore reads", stats.queries === 0);
  const ok = await call(db, { mode: "imadakePostsNearby", latitude: "-90", longitude: "180" });
  t("edge valid coords (-90,180) accepted", ok.code === 200, ok.code);
}
// ---------- 3. zero ----------
{
  const { db } = makeDb({});
  const r = await call(db, Q);
  t("0 posts -> 200 with empty list", r.code === 200 && Array.isArray(r.body.posts) && r.body.posts.length === 0);
}
// ---------- 4. tie-break, multiple stores ----------
{
  const fx = { slots: {}, posts: {} };
  const pos = north(3);
  addStore(fx, "sa", "pa", pos, { publishedAtMillis: NOW - 5 * H });
  addStore(fx, "sb", "pb", pos, { publishedAtMillis: NOW - 1 * H });
  addStore(fx, "sc", "pc", north(2));
  const r = await call(makeDb(fx).db, Q);
  t("multiple stores; same distance -> newer first", JSON.stringify(r.body.posts.map((p) => p.postId)) === JSON.stringify(["pc", "pb", "pa"]), r.body.posts.map((p) => p.postId));
}
// ---------- 5. same store ----------
{
  const fx = { slots: {}, posts: {} };
  addStore(fx, "s1", "pActive", north(1));
  // another published post of the same store that is NOT the slot's active one
  fx.posts.pOther = { ...fx.posts.pActive, headline: "別の投稿" };
  const r = await call(makeDb(fx).db, Q);
  t("same store: only the slot's active post", r.body.posts.length === 1 && r.body.posts[0].postId === "pActive");
  // overlapping ranges returning the same slot several times
  const r2 = await call(makeDb({ ...fx, ignoreRanges: true }).db, Q);
  t("same slot returned by several geohash ranges -> one card", r2.body.posts.length === 1, r2.body.posts.length);
  // slot points to a post of another store
  const fx3 = { slots: {}, posts: {} };
  addStore(fx3, "s1", "p1", north(1));
  fx3.posts.p1.storeId = "someoneElse";
  t("post.storeId must match slot", (await call(makeDb(fx3).db, Q)).body.posts.length === 0);
}
// ---------- 6. expiry ----------
{
  const fx = { slots: {}, posts: {} };
  addStore(fx, "sExpSlot", "pExpSlot", north(1), { publishedAtMillis: NOW - 30 * H }); // slot+post expired
  addStore(fx, "sStale", "pStale", north(2), {}, { activeExpiresAt: Timestamp.fromMillis(NOW + H) });
  fx.posts.pStale.expiresAt = Timestamp.fromMillis(NOW - 1000); // slot says active, post expired
  addStore(fx, "sExactNow", "pExactNow", north(3), { expiresAtMillis: NOW - 1 });
  addStore(fx, "sOk", "pOk", north(4));
  const r = await call(makeDb(fx).db, Q);
  t("expired (slot or post) excluded, valid kept", JSON.stringify(r.body.posts.map((p) => p.postId)) === JSON.stringify(["pOk"]), r.body.posts.map((p) => p.postId));
  const fx2 = { slots: {}, posts: {} };
  addStore(fx2, "sNoExp", "pNoExp", north(1));
  fx2.posts.pNoExp.expiresAt = null;
  t("missing expiresAt excluded", (await call(makeDb(fx2).db, Q)).body.posts.length === 0);
}
// ---------- 7. non-public statuses ----------
{
  const fx = { slots: {}, posts: {} };
  const statuses = ["pending", "rejected", "ended", "withdrawn", "removed", "expired"];
  statuses.forEach((s, i) => addStore(fx, "st" + i, "ps" + i, north(1 + i), { status: s }));
  addStore(fx, "sPub", "pPub", north(9));
  const r = await call(makeDb(fx).db, Q);
  t("pending/rejected/ended/withdrawn/removed/expired excluded", JSON.stringify(r.body.posts.map((p) => p.postId)) === JSON.stringify(["pPub"]), r.body.posts.map((p) => p.postId));
  const fx2 = { slots: {}, posts: {} };
  addStore(fx2, "sGone", "pGone", north(1));
  delete fx2.posts.pGone;
  t("slot pointing to missing post -> excluded", (await call(makeDb(fx2).db, Q)).body.posts.length === 0);
  const fx3 = { slots: { empty: { activePostId: "", activeGeohash: "", activeExpiresAt: null, activeLatitude: null, activeLongitude: null } }, posts: {} };
  t("empty slot ignored", (await call(makeDb({ ...fx3, ignoreRanges: true }).db, Q)).body.posts.length === 0);
}
// ---------- 8. read failure ----------
{
  const fx = { slots: {}, posts: {} };
  addStore(fx, "s1", "p1", north(1));
  const origErr = console.error; console.error = () => {};
  const r1 = await call(makeDb({ ...fx, failOn: "query" }).db, Q);
  const r2 = await call(makeDb({ ...fx, failOn: "getAll" }).db, Q);
  console.error = origErr;
  t("slot query failure -> 500, generic message", r1.code === 500 && r1.body.success === false && !/simulated/.test(JSON.stringify(r1.body)));
  t("post read failure -> 500, generic message", r2.code === 500 && r2.body.success === false && !/simulated/.test(JSON.stringify(r2.body)));
}
// ---------- 9. limits ----------
{
  const fx = { slots: {}, posts: {} };
  for (let i = 0; i < 120; i++) addStore(fx, "m" + String(i).padStart(3, "0"), "pm" + i, { lat: BASE.lat + (i % 12) * 0.002, lng: BASE.lng + Math.floor(i / 12) * 0.002 });
  const { db, stats } = makeDb(fx);
  const r = await call(db, Q);
  const ranges = TN.computeTownNowGeohashQueryRanges(BASE.lat, BASE.lng, 15000).length;
  t("returns at most 20 cards", r.body.posts.length === 20, r.body.posts.length);
  t(`slot reads <= ${ranges} ranges x 50`, stats.slotReads <= ranges * 50 && stats.queries === ranges, { slotReads: stats.slotReads, queries: stats.queries, ranges });
  t("post reads <= 30 (candidate limit)", stats.postReads === 30, stats.postReads);
  const d = r.body.posts.map((p) => p.distanceKm);
  t("limited result still nearest-first", d.every((x, i) => i === 0 || d[i - 1] <= x));
}
// ---------- 10. excerpt ----------
{
  const e1 = IM.buildImadakeCardExcerpt("  一行目\n\n二行目\t 三行目  ");
  t("excerpt collapses whitespace", e1.excerpt === "一行目 二行目 三行目" && e1.excerptTruncated === false, e1);
  const emoji = "😀".repeat(79) + "🍜🍜";
  const e2 = IM.buildImadakeCardExcerpt(emoji);
  t("excerpt cuts by characters (emoji not split)", Array.from(e2.excerpt).length === 80 && e2.excerpt.endsWith("🍜") && e2.excerptTruncated === true);
  const e3 = IM.buildImadakeCardExcerpt("a".repeat(80));
  t("exactly 80 chars -> not truncated", e3.excerpt.length === 80 && e3.excerptTruncated === false);
  t("non-string body -> empty excerpt", IM.buildImadakeCardExcerpt(null).excerpt === "" && IM.buildImadakeCardExcerpt(undefined).excerptTruncated === false);
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
