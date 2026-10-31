// STEP 2 CV foundation tests: transactional Firestore mock, mocked ID token verification. No network.
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
const REPO = REPO_ROOT + "";
const CV = await import(pathToFileURL(REPO + "/api/_lib/imadake-cv.js").href);

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };
const TS = (ms) => ({ toMillis: () => ms });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * 4);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));

function makeDb(o = {}) {
  const store = new Map(); const writeLog = []; let failCommit = o.failCommit || 0, failTx = o.failTx || false, failAfterCommit = o.failAfterCommit || 0; const failGets = o.failGets || new Set();
  const ref = (col, id) => ({ path: col + "/" + id, id, col, get: async () => { await jitter(); if (failGets.has(col)) throw new Error("simulated read failure " + col); return snap({ path: col + "/" + id, id }); } });
  const setPath = (obj, dotted, value) => { const ks = dotted.split("."); let x = obj; for (let i = 0; i < ks.length - 1; i++) { if (!x[ks[i]] || typeof x[ks[i]] !== "object") x[ks[i]] = {}; x = x[ks[i]]; } x[ks[ks.length - 1]] = value; };
  const apply = (w) => { const cur = store.get(w.ref.path); let data = cur ? clone(cur.data) : {}; if (w.type === "set") data = w.merge ? { ...data, ...clone(w.data) } : clone(w.data); if (w.type === "update") { if (!cur) throw new Error("update missing"); for (const [k, v] of Object.entries(w.data)) setPath(data, k, clone(v)); } store.set(w.ref.path, { data, version: (cur ? cur.version : 0) + 1 }); writeLog.push(w.ref.path.split("/")[0]); };
  const snap = (r) => { const cur = store.get(r.path); return { id: r.id, exists: !!cur, data: () => (cur ? clone(cur.data) : undefined) }; };
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, id) }),
    async runTransaction(fn) {
      if (failTx) throw new Error("simulated transaction failure");
      for (let a = 0; a < 50; a++) {
        const reads = new Map(); const writes = [];
        const tx = { get: async (r) => { await jitter(); const cur = store.get(r.path); reads.set(r.path, cur ? cur.version : 0); return snap(r); }, set: (r, data, opts) => writes.push({ type: "set", ref: r, data, merge: !!(opts && opts.merge) }), update: (r, data) => writes.push({ type: "update", ref: r, data }) };
        const result = await fn(tx);
        await jitter();
        if (failCommit > 0) { failCommit--; throw new Error("simulated commit failure"); }
        let ok = true; for (const [p, v] of reads) { const cur = store.get(p); if ((cur ? cur.version : 0) !== v) ok = false; }
        if (!ok) continue; writes.forEach(apply);
        if (failAfterCommit > 0) { failAfterCommit--; throw new Error("simulated failure after commit (written, response lost)"); }
        return result;
      }
      throw new Error("contention");
    }
  };
  return { db, store, writeLog, failGets, seed: (col, id, data) => store.set(col + "/" + id, { data: clone(data), version: 1 }), get: (col, id) => (store.get(col + "/" + id) || {}).data, count: (col) => [...store.keys()].filter((k) => k.startsWith(col + "/")).length };
}

let clock = Date.parse("2026-10-14T03:00:00Z"); // 12:00 JST
const H = 3600e3;
const TOKENS = { anonA: { uid: "travA", p: "anonymous" }, anonB: { uid: "travB", p: "anonymous" }, anonC: { uid: "travC", p: "anonymous" }, ownerS1: { uid: "ownerU1", p: "password" }, ownerS2: { uid: "ownerU2", p: "password" }, ownerSusp: { uid: "ownerU3", p: "password" }, pwTraveler: { uid: "pwUser", p: "password" }, anonOwnerUid: { uid: "ownerU1", p: "anonymous" } };
const verifyIdToken = async (app, tok) => { const u = TOKENS[tok]; if (!u) throw new Error("invalid token"); return { uid: u.uid, firebase: { sign_in_provider: u.p } }; };
const deps = (m, o = {}) => ({ getFirebaseAdminApp: () => ({}), getFirestore: () => m.db, verifyIdToken, readRequestBody: (r) => r.body, now: o.now || (() => clock) });
function post(o = {}) { return { storeId: o.storeId || "S1", storeNameSnapshot: "店", categoryCode: "restaurant", headline: "限定", body: "本文全文です。", sourceLanguage: "ja", status: o.status || "published", publishedAt: TS(clock - H), expiresAt: TS(o.expiresAt ?? clock + 10 * H), latitude: 26.2, longitude: 127.6, imageUrls: [], ...(o.billing ? { cvBillingEnabled: true } : {}) }; }
function seedAll(m) {
  m.seed("storeAccounts", "S1", { storeName: "店1", enabled: true }); m.seed("storeAccounts", "S2", { storeName: "店2", enabled: true });
  m.seed("storeAccounts", "TEST", { storeName: "マチナウ動作テスト", enabled: true, isTestAccount: true }); m.seed("storeAccounts", "SUSP", { storeName: "停止店", enabled: false, registrationStatus: "active" });
  m.seed("storeMembers", "S1_ownerU1", { storeId: "S1", uid: "ownerU1", role: "owner", status: "active" }); m.seed("storeMembers", "S2_ownerU2", { storeId: "S2", uid: "ownerU2", role: "owner", status: "active" });
  m.seed("storeMembers", "SUSP_ownerU3", { storeId: "SUSP", uid: "ownerU3", role: "owner", status: "active" });
  m.seed("imadakePosts", "P1", post({ billing: true })); m.seed("imadakePosts", "P2", post({ billing: true })); m.seed("imadakePosts", "LEGACY", post({}));
  m.seed("imadakePosts", "TP", post({ billing: true, storeId: "TEST" })); m.seed("imadakePosts", "SP", post({ billing: true, storeId: "SUSP" }));
  m.seed("imadakePosts", "P2S", post({ billing: true, storeId: "S2" }));
}
async function open(m, postId, travelerToken, o = {}) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const headers = {}; if (travelerToken) headers.authorization = "Bearer " + travelerToken; if (o.storeToken) headers["x-machinau-store-authorization"] = "Bearer " + o.storeToken;
  await CV.handleImadakeDetailOpen({ headers, body: { mode: "imadakeDetailOpen", postId, ...(o.body || {}) } }, res, o.deps || deps(m));
  return res;
}
const day = () => CV.computeImadakeCvDayKey(clock);
const charge = (m, postId, d = day()) => m.get("imadakePostDailyCharges", postId + "_" + d);
const view = (m, postId, uid) => m.get("imadakeCvViews", postId + "_" + uid);
// STEP 48-D｜課金対象の投稿でCVの成立を確認できない時：詳細を返さず、再試行できるエラー
const refused = (r, code, reason) => r.code === code && r.body.success === false && r.body.retryable === true && r.body.reason === reason && !("post" in r.body) && !JSON.stringify(r.body).includes("本文全文");
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

// 1-4, 7
{
  const m = makeDb(); seedAll(m);
  let r = await open(m, "P1", "anonA");
  t("1 first open: 200 + full body, cv new", r.code === 200 && r.body.success && r.body.post.body === "本文全文です。" && r.body.cv.status === "new" && r.headers["Cache-Control"] === "no-store", r.body);
  const v = view(m, "P1", "travA");
  t("1 CV record fields (postId, storeId from DB, uid, firstOpenedAt, jstDate, counted)", v && v.postId === "P1" && v.storeId === "S1" && v.uid === "travA" && v.firstOpenedAt.toMillis() === clock && v.jstDate === "2026-10-14" && v.counted === true && v.excludedReason === "" && v.billable === true, v);
  const c = charge(m, "P1");
  t("1 daily charge created: 100 JPY, count 1, status accrued", c && c.postId === "P1" && c.storeId === "S1" && c.jstDate === "2026-10-14" && c.validCvCount === 1 && c.amountJpy === 100 && c.status === "accrued" && c.firstCvAt.toMillis() === clock, c);
  r = await open(m, "P1", "anonA");
  t("2 same uid + same post again: cv existing, no new record, charge unchanged", r.body.cv.status === "existing" && m.count("imadakeCvViews") === 1 && charge(m, "P1").validCvCount === 1 && r.body.post.body === "本文全文です。");
  r = await open(m, "P2", "anonA");
  t("3 same uid + another post: new CV and its own charge", r.body.cv.status === "new" && view(m, "P2", "travA") && charge(m, "P2").validCvCount === 1 && charge(m, "P2").amountJpy === 100);
  await open(m, "P1", "anonB"); await open(m, "P1", "anonC");
  t("4 several uids on same post: count 3, still one record per uid", charge(m, "P1").validCvCount === 3 && view(m, "P1", "travB") && view(m, "P1", "travC"));
  t("7 1 post 1 day max 100 JPY regardless of count", charge(m, "P1").amountJpy === 100 && m.count("imadakePostDailyCharges") === 2);
  t("7 charges are per post (not merged per store)", charge(m, "P1").storeId === "S1" && charge(m, "P2").storeId === "S1" && charge(m, "P1") !== charge(m, "P2"));
  t("writes only to imadakeCvViews / imadakePostDailyCharges", [...new Set(m.writeLog)].every((c) => c === "imadakeCvViews" || c === "imadakePostDailyCharges"), [...new Set(m.writeLog)]);
}
// 5 concurrency
{
  const m = makeDb(); seedAll(m);
  const rs = await Promise.all(Array.from({ length: 12 }, () => open(m, "P1", "anonA")));
  t("5 12 simultaneous opens by one uid: exactly one CV, charge count 1", m.count("imadakeCvViews") === 1 && charge(m, "P1").validCvCount === 1 && rs.filter((r) => r.body.cv.status === "new").length === 1 && rs.every((r) => r.code === 200), { views: m.count("imadakeCvViews"), cnt: charge(m, "P1").validCvCount, news: rs.filter((r) => r.body.cv.status === "new").length });
  const toks = ["anonB", "anonC"]; const rs2 = await Promise.all([...Array(6)].map((_, i) => open(m, "P1", toks[i % 2])));
  t("5 concurrent opens by two other uids: +2 CVs, one charge doc, 100 JPY", charge(m, "P1").validCvCount === 3 && m.count("imadakePostDailyCharges") === 1 && charge(m, "P1").amountJpy === 100, charge(m, "P1"));
}
// 6 JST date change
{
  const m = makeDb(); seedAll(m);
  const before = clock;
  m.seed("imadakePosts", "P1", post({ billing: true, expiresAt: Date.parse("2026-10-15T02:00:00Z") }));
  clock = Date.parse("2026-10-14T14:59:59Z"); await open(m, "P1", "anonA");
  clock = Date.parse("2026-10-14T15:00:00Z"); await open(m, "P1", "anonB");
  const c14 = charge(m, "P1", "2026-10-14"), c15 = charge(m, "P1", "2026-10-15");
  t("6 23:59:59 JST and 00:00 JST -> two daily charges (100 JPY each)", c14 && c15 && c14.amountJpy === 100 && c15.amountJpy === 100 && c14.validCvCount === 1 && c15.validCvCount === 1, { c14, c15 });
  await open(m, "P1", "anonA");
  t("6 same uid on the next day: no new CV (first view only)", charge(m, "P1", "2026-10-15").validCvCount === 1 && view(m, "P1", "travA").jstDate === "2026-10-14");
  clock = before;
}
// 8, 9 billing exclusions
{
  const m = makeDb(); seedAll(m);
  let r = await open(m, "LEGACY", "anonA");
  const v = view(m, "LEGACY", "travA");
  t("8 existing post (no cvBillingEnabled): CV recorded as valid, not billable, no charge", r.body.cv.status === "new" && v.counted === true && v.billable === false && v.billingExcludedReason === "billing_not_enabled" && !charge(m, "LEGACY"), v);
  r = await open(m, "TP", "anonA");
  const v2 = view(m, "TP", "travA");
  t("9 test account post (cvBillingEnabled true): not billable (test_account), no charge", v2.counted === true && v2.billable === false && v2.billingExcludedReason === "test_account" && !charge(m, "TP"), v2);
  r = await open(m, "LEGACY", "anonA", { body: { cvBillingEnabled: true, storeId: "S2", billable: true } });
  t("8 client cannot turn billing on (body fields ignored)", !charge(m, "LEGACY") && view(m, "LEGACY", "travA").storeId === "S1");
}
// 10 store owner exclusion
{
  const m = makeDb(); seedAll(m);
  await open(m, "P1", "anonA", { storeToken: "ownerS1" });
  const v = view(m, "P1", "travA");
  t("10 owner of the post's store (verified store token): counted false, store_owner_view, no charge", v.counted === false && v.excludedReason === "store_owner_view" && v.billable === false && !charge(m, "P1"), v);
  await open(m, "P1", "anonB", { storeToken: "ownerS2" });
  t("10 owner of another store viewing: counted (not excluded)", view(m, "P1", "travB").counted === true && charge(m, "P1").validCvCount === 1);
  await open(m, "P2S", "anonC", { storeToken: "ownerS1", body: { storeId: "S1" } });
  t("10 client-sent storeId ignored (S1 owner viewing S2's post -> counted)", view(m, "P2S", "travC").counted === true && charge(m, "P2S").validCvCount === 1);
  let rr = await open(m, "P2", "anonA", { storeToken: "garbage" });
  t("10 [STEP48-D] billable + invalid store token -> unverifiable: 401 retryable, no details, no CV/charge (not claimed as excluded)", refused(rr, 401, "store_owner_unverifiable") && !view(m, "P2", "travA") && !charge(m, "P2"), rr.body);
  rr = await open(m, "P2", "anonB", { storeToken: "anonOwnerUid" });
  t("10 [STEP48-D] billable + store token with anonymous provider -> unverifiable: no details, not recorded", refused(rr, 401, "store_owner_unverifiable") && !view(m, "P2", "travB"), rr.body);
  rr = await open(m, "LEGACY", "anonA", { storeToken: "garbage" });
  t("10 [STEP48-D] non-billable + invalid store token: as before (200 + body, not_recorded)", rr.code === 200 && rr.body.post.body === "本文全文です。" && rr.body.cv.status === "not_recorded" && !view(m, "LEGACY", "travA"), rr.body);
  rr = await open(m, "P2", "anonA");
  t("10 [STEP48-D] same traveler retries without the broken store token -> normal first CV once", rr.code === 200 && rr.body.cv.status === "new" && rr.body.post.body === "本文全文です。" && charge(m, "P2").validCvCount === 1, rr.body.cv);
  await open(m, "SP", "anonA", { storeToken: "ownerSusp" });
  t("10 owner of a suspended store viewing own post -> still excluded", view(m, "SP", "travA").counted === false && !charge(m, "SP"));
  await open(m, "P2", "anonC");
  t("10 without store token -> counted (exclusion only when verified)", view(m, "P2", "travC").counted === true && charge(m, "P2").validCvCount === 2 && charge(m, "P2").amountJpy === 100);
}
// 11 traveler auth failure
{
  const m = makeDb(); seedAll(m);
  for (const [label, tok] of [["no token", null], ["invalid token", "garbage"], ["password (non-anonymous) token", "pwTraveler"]]) {
    const before = m.writeLog.length;
    const r = await open(m, "P1", tok);
    const reason = tok === null ? "no_traveler_token" : tok === "garbage" ? "traveler_token_invalid" : "not_anonymous_traveler";
    t(`11 [STEP48-D] billable, ${label}: 401 retryable, no details, no writes`, refused(r, 401, reason) && m.writeLog.length === before && !charge(m, "P1"), r.body);
    const rl = await open(m, "LEGACY", tok);
    t(`11 non-billable, ${label}: as before (200 with body, cv not_recorded, no writes)`, rl.code === 200 && rl.body.post.body === "本文全文です。" && rl.body.cv.status === "not_recorded" && m.writeLog.length === before, rl.body.cv);
  }
  const r = await open(m, "P1", "anonA");
  t("11 [STEP48-D] after the traveler signs in (retry with a token): first CV, details shown", r.code === 200 && r.body.cv.status === "new" && r.body.post.body === "本文全文です。" && charge(m, "P1").validCvCount === 1);
}
// 12 expiry / non-public / missing
{
  const m = makeDb(); seedAll(m);
  m.seed("imadakePosts", "EXP", post({ billing: true, expiresAt: clock - 1 }));
  m.seed("imadakePosts", "END", post({ billing: true, status: "ended" }));
  for (const id of ["EXP", "END", "NOPE"]) { const r = await open(m, id, "anonA"); t(`12 ${id}: 404, no CV, no charge`, r.code === 404 && !view(m, id, "travA") && !charge(m, id)); }
  m.seed("imadakePosts", "EDGE", post({ billing: true, expiresAt: clock + 1000 }));
  let n = 0; const r = await open(m, "EDGE", "anonA", { deps: deps(m, { now: () => (n++ === 0 ? clock : clock + 2000) }) });
  t("12 expires between check and transaction: 404, nothing written", r.code === 404 && !view(m, "EDGE", "travA") && !charge(m, "EDGE"), r.body);
  const bad = await open(m, "a/b", "anonA");
  t("12 invalid postId -> 400", bad.code === 400);
}
// 13 Firestore failure
{
  const m = makeDb({ failTx: true }); seedAll(m);
  const r = await quiet(() => open(m, "P1", "anonA"));
  t("13 [STEP48-D] billable, transaction failure: 503 retryable, no details, nothing written", refused(r, 503, "cv_record_failed") && m.count("imadakeCvViews") === 0 && m.count("imadakePostDailyCharges") === 0, r.body);
  const rl = await quiet(() => open(m, "LEGACY", "anonA"));
  t("13 non-billable, transaction failure: as before (200 + body, not_recorded, nothing written)", rl.code === 200 && rl.body.post.body === "本文全文です。" && rl.body.cv.status === "not_recorded" && m.count("imadakeCvViews") === 0, rl.body.cv);
  const m2 = makeDb({ failCommit: 1 }); seedAll(m2);
  const r2 = await quiet(() => open(m2, "P1", "anonA"));
  t("13 commit failure: no partial write (no CV without charge or vice versa), no details", refused(r2, 503, "cv_record_failed") && m2.count("imadakeCvViews") === 0 && m2.count("imadakePostDailyCharges") === 0, r2.body);
  const r3 = await open(m2, "P1", "anonA");
  t("13 retry after failure records CV and charge together once, details shown", r3.body.cv.status === "new" && r3.body.post.body === "本文全文です。" && view(m2, "P1", "travA") && charge(m2, "P1").validCvCount === 1);
  // STEP 48-D｜書き込みは成功したが応答が失敗した(通信の一時的な失敗)：再試行で重複CV・重複料金にならない
  const m4 = makeDb({ failAfterCommit: 1 }); seedAll(m4);
  const r4 = await quiet(() => open(m4, "P1", "anonA"));
  t("13 [STEP48-D] written but the call failed: 503 retryable, no details (CV and charge written once)", refused(r4, 503, "cv_record_failed") && m4.count("imadakeCvViews") === 1 && charge(m4, "P1").validCvCount === 1, r4.body);
  const r5 = await open(m4, "P1", "anonA");
  const r6 = await open(m4, "P1", "anonA");
  t("13 [STEP48-D] retries after that: existing (no duplicate CV), charge count 1 / 100 JPY, details shown", r5.body.cv.status === "existing" && r6.body.cv.status === "existing" && r5.body.post.body === "本文全文です。" && m4.count("imadakeCvViews") === 1 && charge(m4, "P1").validCvCount === 1 && charge(m4, "P1").amountJpy === 100 && m4.count("imadakePostDailyCharges") === 1, { r5: r5.body.cv, c: charge(m4, "P1") });
  const r7 = await open(m4, "P1", "anonB");
  t("13 [STEP48-D] another traveler afterwards: +1 valid CV, still 100 JPY for the day", r7.body.cv.status === "new" && charge(m4, "P1").validCvCount === 2 && charge(m4, "P1").amountJpy === 100);
}
// ===== STEP 3 additions =====
const IM = await import(pathToFileURL(REPO + "/api/_lib/imadake.js").href);
// S3-a: Firestore read failures in the owner / store-account checks (STEP 2 500 bug)
{
  const m = makeDb({ failGets: new Set(["storeMembers"]) }); seedAll(m);
  let r = await quiet(() => open(m, "P1", "anonA", { storeToken: "ownerS1" }));
  t("S3 [STEP48-D] billable, storeMembers read fails (store token sent): 401 retryable, no details, nothing written", refused(r, 401, "store_owner_unverifiable") && m.writeLog.length === 0, r.body);
  r = await quiet(() => open(m, "LEGACY", "anonA", { storeToken: "ownerS1" }));
  t("S3 non-billable, storeMembers read fails (store token sent): as before (200 + body, not_recorded)", r.code === 200 && r.body.post.body === "本文全文です。" && r.body.cv.status === "not_recorded" && m.writeLog.length === 0, r.body);
  r = await open(m, "P1", "anonA");
  t("S3 storeMembers down but no store token: owner check not needed -> normal CV", r.body.cv.status === "new" && view(m, "P1", "travA").counted === true);
  const m2 = makeDb({ failGets: new Set(["storeAccounts"]) }); seedAll(m2);
  r = await quiet(() => open(m2, "P1", "anonA"));
  t("S3 [STEP48-D] billable, storeAccounts read fails: 503 retryable, no details, nothing written", refused(r, 503, "store_account_read_failed") && m2.writeLog.length === 0, r.body);
  r = await quiet(() => open(m2, "LEGACY", "anonA"));
  t("S3 non-billable, storeAccounts read fails: as before (200 + body, not_recorded, nothing written)", r.code === 200 && r.body.post.body === "本文全文です。" && r.body.cv.status === "not_recorded" && m2.writeLog.length === 0, r.body);
  const m3 = makeDb({ failGets: new Set(["imadakePosts"]) }); seedAll(m3);
  r = await quiet(() => open(m3, "P1", "anonA"));
  t("S3 post read fails: 500 (no body; client falls back), nothing written", r.code === 500 && m3.writeLog.length === 0 && !("post" in r.body));
}
// S3-b: counted flag in the response (for GA4 only)
{
  const m = makeDb(); seedAll(m);
  let r = await open(m, "P1", "anonA");
  t("S3 cv.counted true only on the new valid CV", r.body.cv.status === "new" && r.body.cv.counted === true);
  r = await open(m, "P1", "anonA");
  t("S3 cv.counted false on existing", r.body.cv.status === "existing" && r.body.cv.counted === false);
  r = await open(m, "P2", "anonA", { storeToken: "ownerS1" });
  t("S3 cv.counted false on owner's own first view", r.body.cv.status === "new" && r.body.cv.counted === false);
  r = await open(m, "LEGACY", "anonB");
  t("S3 non-billable post: counted true (valid CV, not billed)", r.body.cv.counted === true && !charge(m, "LEGACY"));
}
// S3-c: imadakeViewedPosts (per uid, read-only)
async function viewed(m, tok, postIds, o = {}) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const headers = {}; if (tok) headers.authorization = "Bearer " + tok;
  await CV.handleImadakeViewedPosts({ headers, body: { mode: "imadakeViewedPosts", postIds } }, res, o.deps || deps(m));
  return res;
}
{
  const m = makeDb(); seedAll(m);
  m.seed("imadakePosts", "EXP", post({ billing: true, expiresAt: clock + 1000 }));
  await open(m, "P1", "anonA"); await open(m, "LEGACY", "anonA"); await open(m, "EXP", "anonA"); await open(m, "P2", "anonB");
  clock += 2000;
  const writes = m.writeLog.length;
  let r = await viewed(m, "anonA", ["P1", "P2", "LEGACY", "EXP", "NOPE"]);
  const ids = (r.body.posts || []).map((p) => p.postId).sort();
  t("S3 viewedPosts A: only A's own viewed + still public posts (P1, LEGACY), with full body", r.code === 200 && JSON.stringify(ids) === JSON.stringify(["LEGACY", "P1"]) && r.body.posts.every((p) => p.body === "本文全文です。") && r.headers["Cache-Control"] === "no-store", r.body);
  r = await viewed(m, "anonB", ["P1", "P2"]);
  t("S3 viewedPosts B: P2 only (A's viewing of P1 does not count for B)", JSON.stringify(r.body.posts.map((p) => p.postId)) === JSON.stringify(["P2"]));
  r = await viewed(m, "anonC", ["P1", "P2", "LEGACY"]);
  t("S3 viewedPosts C (never opened): empty although others viewed", r.body.success && r.body.posts.length === 0);
  for (const [label, tok] of [["no token", null], ["invalid token", "garbage"], ["password (store) token", "pwTraveler"]]) { r = await viewed(m, tok, ["P1"]); t(`S3 viewedPosts ${label}: 200 empty (unknown = first-time display)`, r.code === 200 && r.body.posts.length === 0); }
  r = await viewed(m, "anonA", Array.from({ length: 21 }, (_, i) => "P" + i));
  t("S3 viewedPosts >20 ids -> 400", r.code === 400);
  r = await viewed(m, "anonA", ["a/b"]); const r2 = await viewed(m, "anonA", "P1");
  t("S3 viewedPosts invalid id / non-array -> 400", r.code === 400 && r2.code === 400);
  t("S3 viewedPosts is read-only (no CV, no charge writes)", m.writeLog.length === writes);
  const mf = makeDb({ failGets: new Set(["imadakeCvViews"]) }); seedAll(mf);
  r = await quiet(() => viewed(mf, "anonA", ["P1"]));
  t("S3 viewedPosts read failure -> 500 (client keeps first-time display)", r.code === 500);
}
// S3-d: imadakePostGet does not return the body of billable posts
async function publicGet(m, postId) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await IM.handleImadakePostGet({ query: { postId }, headers: {} }, res, { getFirebaseAdminApp: () => ({}), getFirestore: () => m.db });
  return res;
}
{
  const m = makeDb(); seedAll(m);
  const live = (o) => ({ ...post(o), publishedAt: TS(Date.now() - H), expiresAt: TS(Date.now() + 5 * H) });
  m.seed("imadakePosts", "GB", live({ billing: true })); m.seed("imadakePosts", "GF", live({})); m.seed("imadakePosts", "GX", { ...live({ billing: true }), expiresAt: TS(Date.now() - 1) });
  let r = await publicGet(m, "GB");
  t("S3 imadakePostGet billable: 200, body empty, bodyProtected true (no CV-free bypass)", r.code === 200 && r.body.post.body === "" && r.body.bodyProtected === true && r.body.post.headline === "限定", r.body);
  r = await publicGet(m, "GF");
  t("S3 imadakePostGet non-billable (existing posts): full body as before, no bodyProtected", r.code === 200 && r.body.post.body === "本文全文です。" && !("bodyProtected" in r.body));
  r = await publicGet(m, "GX");
  t("S3 imadakePostGet expired: 404", r.code === 404);
  t("S3 imadakePostGet wrote nothing", m.writeLog.length === 0);
}
// S3-e: billing decided at creation (fixed)
{
  const m = makeDb({ failGets: new Set(["storeAccounts"]) });
  t("S3 IMADAKE_CV_BILLING_STARTED is false", IM.IMADAKE_CV_BILLING_STARTED === false);
  const v = await IM.decideImadakeCvBillingForNewPost(m.db, "S1");
  t("S3 decideImadakeCvBillingForNewPost -> false without any read (billing not started)", v === false);
}
// S3-f: first view billing state is fixed (no retroactive billing)
{
  const m = makeDb(); seedAll(m);
  await open(m, "LEGACY", "anonA");
  const p = m.get("imadakePosts", "LEGACY"); p.cvBillingEnabled = true; m.seed("imadakePosts", "LEGACY", p);
  const r = await open(m, "LEGACY", "anonA");
  t("S3 view recorded as non-billable stays non-billable even if the post flag changed later", r.body.cv.status === "existing" && view(m, "LEGACY", "travA").billable === false && !charge(m, "LEGACY"));
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
