// STEP 4-A: store CV report (read-only API). In-memory Firestore mock with where()/count(), real auth logic
// (verifyImadakeStoreActor + checkStoreProfileEditor), mocked ID-token resolution. No network.
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
import { TS, makeDb } from "./cvmock.mjs";
const REPO = REPO_ROOT + "";
const R = await import(pathToFileURL(REPO + "/api/_lib/imadake-cv-report.js").href);
const SP = await import(pathToFileURL(REPO + "/api/_lib/store-profile.js").href);
const IM = await import(pathToFileURL(REPO + "/api/_lib/imadake.js").href);
let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 500) : ""}`); };
const J = (s) => Date.parse(s.replace(" ", "T") + ":00+09:00"); // JST "YYYY-MM-DD HH:MM"
const NOW = J("2026-10-14 12:00");

function makeQueryDb(o = {}) {
  const m = makeDb();
  m.stats = { queries: [], counts: [], docGets: [] };
  m.failCount = !!o.failCount;
  const baseCollection = m.db.collection;
  m.db.collection = (col) => {
    const c = baseCollection(col);
    const docsOf = (filters) => [...m.store.keys()].filter((k) => k.startsWith(col + "/")).map((k) => ({ id: k.slice(col.length + 1), data: () => m.get(col, k.slice(col.length + 1)) })).filter((d) => filters.every(([f, op, v]) => { if (op !== "==") throw new Error("unsupported op " + op); return d.data()[f] === v; }));
    const q = (filters) => ({
      where: (f, op, v) => q([...filters, [f, op, v]]),
      get: async () => { m.stats.queries.push(col + " " + JSON.stringify(filters)); const docs = docsOf(filters); return { docs, size: docs.length, empty: docs.length === 0 }; },
      count: () => ({ get: async () => { if (m.failCount) throw new Error("simulated count failure"); m.stats.counts.push(col + " " + JSON.stringify(filters)); return { data: () => ({ count: docsOf(filters).length }) }; } })
    });
    return { doc: (id) => { const r = c.doc(id); const g = r.get; return { ...r, get: async () => { m.stats.docGets.push(col + "/" + id); return g(); } }; }, where: (f, op, v) => q([[f, op, v]]) };
  };
  return m;
}
// tokens: "owner-<uid>" (password login, verified) / "unverified-<uid>" / none
const resolveStoreUserActor = async (request) => {
  const h = (request.headers && request.headers.authorization) || "";
  const mm = /^Bearer (owner|unverified)-(\w+)$/.exec(h);
  if (!h) return { ok: false, status: 401 };
  if (!mm) return { ok: false, status: 403 };
  return { ok: true, actor: { uid: mm[2], emailVerified: mm[1] === "owner" } };
};
const validateStoreToken = async (db, storeId, token) => (storeId === "LEG" && token === "secret" ? { valid: true, storeId: "LEG", storeName: "旧URL店" } : { valid: false });
const deps = (m, o = {}) => ({ getFirebaseAdminApp: () => ({}), getFirestore: () => m.db, readRequestBody: (r) => r.body, resolveStoreUserActor, checkStoreProfileEditor: SP.checkStoreProfileEditor, validateStoreToken, now: () => o.now ?? NOW });
async function report(m, body, auth, o = {}) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const headers = auth ? { authorization: "Bearer " + auth } : {};
  const e = console.error; console.error = () => {};
  try { await R.handleImadakeStoreCvReport({ headers, body: { mode: "imadakeStoreCvReport", ...body } }, res, deps(m, o)); } finally { console.error = e; }
  return res;
}
function post(storeId, o) { return { storeId, storeNameSnapshot: "店" + storeId, categoryCode: "restaurant", headline: o.headline, body: "本文（レポートには返さない）", sourceLanguage: "ja", status: o.status || "published", publishedAt: o.pub ? TS(J(o.pub)) : null, expiresAt: o.pub ? TS(J(o.pub) + 24 * 3600e3) : null, endedAt: o.ended ? TS(J(o.ended)) : null, ...(o.billing ? { cvBillingEnabled: true } : { cvBillingEnabled: false }) }; }
function view(m, postId, storeId, uid, date, counted = true) { m.seed("imadakeCvViews", postId + "_" + uid, { postId, storeId, uid, firstOpenedAt: TS(J(date + " 12:00")), jstDate: date, counted, excludedReason: counted ? "" : "store_owner_view", billable: false, billingExcludedReason: counted ? "billing_not_enabled" : "store_owner_view" }); }
function seed(m) {
  m.seed("storeAccounts", "S1", { storeName: "店1", registrationStatus: "active", enabled: true });
  m.seed("storeAccounts", "S2", { storeName: "店2", registrationStatus: "active", enabled: true });
  m.seed("storeAccounts", "SUSP", { storeName: "停止店", registrationStatus: "active", enabled: false });
  m.seed("storeAccounts", "LEG", { storeName: "旧URL店", registrationStatus: "active", enabled: true });
  m.seed("storeMembers", "S1_u1", { storeId: "S1", uid: "u1", role: "owner", status: "active" });
  m.seed("storeMembers", "S2_u2", { storeId: "S2", uid: "u2", role: "owner", status: "active" });
  m.seed("storeMembers", "SUSP_u3", { storeId: "SUSP", uid: "u3", role: "owner", status: "active" });
  // S1 posts
  m.seed("imadakePosts", "A", post("S1", { headline: "A 掲載中", pub: "2026-10-13 20:00" }));
  m.seed("imadakePosts", "B", post("S1", { headline: "B 終了", pub: "2026-10-10 10:00", status: "ended", ended: "2026-10-10 15:00" }));
  m.seed("imadakePosts", "C", post("S1", { headline: "C 期限切れ(8月末→9月)", pub: "2026-08-31 22:00", status: "expired" }));
  m.seed("imadakePosts", "D", post("S1", { headline: "D 期間外(7月)", pub: "2026-07-15 10:00", status: "expired" }));
  m.seed("imadakePosts", "E", post("S1", { headline: "E 確認中", status: "pending" }));
  m.seed("imadakePosts", "F", post("S1", { headline: "F 課金対象フラグ", pub: "2026-10-12 10:00", status: "expired", billing: true }));
  m.seed("imadakePosts", "G", post("S2", { headline: "G 他店舗", pub: "2026-10-14 09:00" }));
  m.seed("imadakePosts", "L", post("LEG", { headline: "L 旧URL店", pub: "2026-10-14 08:00" }));
  view(m, "A", "S1", "travA", "2026-10-13"); view(m, "A", "S1", "travB", "2026-10-13"); view(m, "A", "S1", "u1", "2026-10-13", false); view(m, "A", "S1", "travC", "2026-10-14");
  view(m, "C", "S1", "travA", "2026-08-31"); view(m, "C", "S1", "travB", "2026-09-01"); view(m, "C", "S1", "travC", "2026-09-01");
  view(m, "D", "S1", "travA", "2026-07-15");
  view(m, "F", "S1", "travD", "2026-10-12");
  m.seed("imadakePostDailyCharges", "F_2026-10-12", { postId: "F", storeId: "S1", jstDate: "2026-10-12", validCvCount: 1, amountJpy: 100, currency: "JPY", status: "accrued" });
  view(m, "G", "S2", "travA", "2026-10-14"); view(m, "G", "S2", "travE", "2026-10-14");
  view(m, "L", "LEG", "travA", "2026-10-14");
}
const byId = (b) => Object.fromEntries((b.posts || []).map((p) => [p.postId, p]));
const dayOf = (p, d) => p.days.find((x) => x.date === d);

{
  const m = makeQueryDb(); seed(m);
  const r = await report(m, { storeId: "S1" }, "owner-u1");
  const b = r.body, P = byId(b);
  t("1 owner of S1: 200, no-store, store id/name", r.code === 200 && b.success && b.storeId === "S1" && b.storeName === "店1" && r.headers["Cache-Control"] === "no-store", r.body);
  t("1 period = last 3 months JST (2026-08..2026-10), end = today", JSON.stringify(b.period) === JSON.stringify({ startDate: "2026-08-01", endDate: "2026-10-14", months: ["2026-08", "2026-09", "2026-10"] }), b.period);
  t("2 only S1's posts in period (A,B,C,F); D (out of period), E (never published), G (other store), L excluded", JSON.stringify(Object.keys(P).sort()) === JSON.stringify(["A", "B", "C", "F"]), Object.keys(P));
  t("2 newest first", JSON.stringify(b.posts.map((p) => p.postId)) === JSON.stringify(["A", "F", "B", "C"]), b.posts.map((p) => p.postId));
  t("3 post A (spans 10/13-10/14): days 2 / valid 2 (owner view excluded) / 1", JSON.stringify(P.A.days.map((d) => [d.date, d.validCvCount, d.referenceAmountJpy])) === JSON.stringify([["2026-10-13", 2, 100], ["2026-10-14", 1, 100]]) && P.A.validCvCount === 3 && P.A.cvDayCount === 2 && P.A.referenceAmountJpy === 200, P.A);
  t("3 post B (ended, no CV): one day, 0 CV, 0 JPY", P.B.status === "ended" && P.B.days.length === 1 && P.B.validCvCount === 0 && P.B.referenceAmountJpy === 0, P.B);
  t("6 post C (expired, Aug 31 -> Sep 1): still reported, 1 + 2 CVs, 200 JPY reference", P.C.status === "expired" && dayOf(P.C, "2026-08-31").validCvCount === 1 && dayOf(P.C, "2026-09-01").validCvCount === 2 && P.C.referenceAmountJpy === 200, P.C);
  t("4 reference = 100 JPY per post×day with >=1 valid CV (2 CVs same day still 100)", dayOf(P.C, "2026-09-01").referenceAmountJpy === 100 && dayOf(P.A, "2026-10-13").referenceAmountJpy === 100 && dayOf(P.F, "2026-10-13").referenceAmountJpy === 0);
  const M = Object.fromEntries(b.months.map((x) => [x.month, x]));
  t("3 monthly: Aug 1 CV/1 day/100, Sep 2/1/100, Oct 4/3/300", JSON.stringify([M["2026-08"], M["2026-09"], M["2026-10"]].map((x) => [x.validCvCount, x.cvDayCount, x.referenceAmountJpy])) === JSON.stringify([[1, 1, 100], [2, 1, 100], [4, 3, 300]]), b.months);
  t("3 totals: 7 CVs, 5 post×days, 500 JPY reference", b.totals.validCvCount === 7 && b.totals.cvDayCount === 5 && b.totals.referenceAmountJpy === 500, b.totals);
  t("5 billing stopped: billingStarted false, actualChargeJpy 0 everywhere (even F with a ledger doc), billingTarget false", b.billingStarted === false && b.totals.actualChargeJpy === 0 && b.posts.every((p) => p.actualChargeJpy === 0 && p.billingTarget === false && p.days.every((d) => d.actualChargeJpy === 0)) && b.months.every((x) => x.actualChargeJpy === 0));
  t("5 billing stopped: the charge ledger is not even read", m.stats.docGets.filter((g) => g.startsWith("imadakePostDailyCharges/")).length === 0, m.stats.docGets);
  const json = JSON.stringify(b);
  t("privacy: no traveler uid / owner uid / owner-view count / post body in the response", !/trav[A-E]|"u1"|store_owner_view|excluded|本文（レポートには返さない）/.test(json), json.slice(0, 300));
  t("7 read cost: 1 posts query (storeId equality only) + 1 count() per post×day (7), no per-view reads", m.stats.queries.length === 1 && m.stats.queries[0] === 'imadakePosts [["storeId","==","S1"]]' && m.stats.counts.length === 7 && m.stats.counts.every((c) => /"postId","==".*"jstDate","==".*"counted","==",true/.test(c)), m.stats);
  t("read-only: nothing written", m.writeLog.length === 0);
}
// cross-store / auth failures
{
  const m = makeQueryDb(); seed(m);
  let r = await report(m, { storeId: "S1" }, "owner-u2");
  t("2 owner of S2 asking for S1: 403, no data", r.code === 403 && !r.body.posts && m.stats.counts.length === 0, r.body);
  r = await report(m, { storeId: "S2" }, "owner-u2");
  t("2 owner of S2 gets only S2 (G), not S1's posts", r.code === 200 && JSON.stringify(r.body.posts.map((p) => p.postId)) === JSON.stringify(["G"]) && r.body.totals.validCvCount === 2, r.body.posts);
  r = await report(m, { storeId: "S1" }, null);
  t("no login: 401", r.code === 401 && !r.body.posts);
  r = await report(m, { storeId: "S1" }, "unverified-u1");
  t("email not verified: 403", r.code === 403 && !r.body.posts);
  r = await report(m, { storeId: "SUSP" }, "owner-u3");
  t("suspended store (owner): 403 (only active stores)", r.code === 403 && !r.body.posts);
  r = await report(m, { storeId: "" }, "owner-u1");
  t("missing storeId: 403", r.code === 403);
  r = await report(m, { storeId: "S1/../S2" }, "owner-u1");
  t("malformed storeId: 403", r.code === 403);
  r = await report(m, { storeId: "LEG", token: "secret" }, null);
  t("legacy token store with valid token: 200, its own posts only", r.code === 200 && r.body.storeId === "LEG" && JSON.stringify(r.body.posts.map((p) => p.postId)) === JSON.stringify(["L"]) && r.body.totals.validCvCount === 1, r.body);
  r = await report(m, { storeId: "LEG", token: "wrong" }, null);
  t("legacy token wrong: 403", r.code === 403 && !r.body.posts);
  r = await report(m, { storeId: "S1", token: "secret" }, null);
  t("legacy token for another store id: 403", r.code === 403);
  t("auth failures read no CV data and wrote nothing", m.writeLog.length === 0);
}
// failures / edge cases
{
  const m = makeQueryDb({ failCount: true }); seed(m);
  const r = await report(m, { storeId: "S1" }, "owner-u1");
  t("count() failure: 500, generic message, nothing written", r.code === 500 && r.body.success === false && !r.body.posts && m.writeLog.length === 0, r.body);
}
{
  const m = makeQueryDb(); seed(m);
  const r = await report(m, { storeId: "S1" }, "owner-u1", { now: J("2026-11-01 00:30") });
  t("JST month boundary: on Nov 1 00:30 JST the period is Sep..Nov, Aug post C drops out except Sep 1", JSON.stringify(r.body.period.months) === JSON.stringify(["2026-09", "2026-10", "2026-11"]) && r.body.period.startDate === "2026-09-01" && JSON.stringify(byId(r.body).C.days.map((d) => d.date)) === JSON.stringify(["2026-09-01"]), r.body.period);
  t("computeImadakeCvReportPeriod across a year boundary", JSON.stringify(R.computeImadakeCvReportPeriod(J("2026-01-15 09:00"), 3).months) === JSON.stringify(["2025-11", "2025-12", "2026-01"]));
  t("months is configurable (IMADAKE_CV_REPORT_MONTHS=3 default)", R.IMADAKE_CV_REPORT_MONTHS === 3 && R.computeImadakeCvReportPeriod(NOW, 6).months.length === 6);
}
{
  const m = makeQueryDb(); seed(m);
  m.seed("imadakePosts", "LIVE", post("S1", { headline: "公開直後", pub: "2026-10-14 11:00" }));
  const r = await report(m, { storeId: "S1" }, "owner-u1");
  const L = byId(r.body).LIVE;
  t("live post published today: only today's day row (no future days)", L && L.status === "published" && JSON.stringify(L.days.map((d) => d.date)) === JSON.stringify(["2026-10-14"]), L);
}
{
  const m = makeQueryDb(); seed(m);
  for (let i = 0; i < 205; i++) m.seed("imadakePosts", "N" + String(i).padStart(3, "0"), post("S1", { headline: "n", pub: "2026-10-01 10:00", status: "ended", ended: "2026-10-01 11:00" }));
  const r = await report(m, { storeId: "S1" }, "owner-u1");
  t("post limit: at most 200 posts, truncated flag set", r.code === 200 && r.body.posts.length === 200 && r.body.truncated === true);
}
t("billing switch still off in code", IM.IMADAKE_CV_BILLING_STARTED === false);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
