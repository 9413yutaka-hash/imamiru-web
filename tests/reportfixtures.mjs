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

export { makeQueryDb, seed, deps, R, IM, J, NOW, post, view, TS };
