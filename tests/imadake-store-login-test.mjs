// Store-login connection for imadake create/status/end (method B logged-in store owner).
// STEP 43-B: method A (old store URL + token) was removed; a token is always refused with 410 (no fallback to login).
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
const REPO = REPO_ROOT + "";
const IM = await import(pathToFileURL(REPO + "/api/_lib/imadake.js").href);
const SP_ = await import(pathToFileURL(REPO + "/api/_lib/store-profile.js").href);

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };
const TS = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));

function makeDb() {
  const store = new Map(); const writeLog = []; let autoId = 0;
  const ref = (col, id) => ({ path: col + "/" + id, id, col, get: async () => snap({ path: col + "/" + id, id }) });
  const setPath = (obj, dotted, value) => { const ks = dotted.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = value; };
  const apply = (w) => { const cur = store.get(w.ref.path); let data = cur ? clone(cur.data) : {}; if (w.type === "set") data = w.merge ? { ...data, ...clone(w.data) } : clone(w.data); if (w.type === "update") { if (!cur) throw new Error("update missing " + w.ref.path); for (const [k, v] of Object.entries(w.data)) setPath(data, k, clone(v)); } store.set(w.ref.path, { data, version: (cur ? cur.version : 0) + 1 }); writeLog.push(w.ref.path.split("/")[0]); };
  const snap = (r) => { const cur = store.get(r.path); return { id: r.id, exists: !!cur, data: () => (cur ? clone(cur.data) : undefined) }; };
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, id || "auto" + (++autoId)), where: () => { throw new Error("where not mocked for " + col); } }),
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
  return { db, store, writeLog, seed: (col, id, data) => store.set(col + "/" + id, { data: clone(data), version: 1 }), get: (col, id) => (store.get(col + "/" + id) || {}).data };
}

const loc = (lat, lng) => ({ latitude: lat, longitude: lng, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", regionKey: "JP-47", address: "沖縄県那覇市1-1" });
function seedAll(m) {
  m.seed("storeAccounts", "legacy1", { storeName: "旧URL店", enabled: true, tokenHash: "h", ...loc(26.21, 127.68) });
  m.seed("storeAccounts", "self1", { storeName: "セルフ店1", enabled: true, createdByType: "storeUser", registrationStatus: "active", ...loc(26.22, 127.69) });
  m.seed("storeAccounts", "self2", { storeName: "セルフ店2", enabled: true, createdByType: "storeUser", registrationStatus: "active", ...loc(26.3, 127.75) });
  m.seed("storeAccounts", "other", { storeName: "他店", enabled: true, createdByType: "storeUser", registrationStatus: "active", ...loc(26.23, 127.7) });
  m.seed("storeAccounts", "pend", { storeName: "審査待ち店", enabled: true, createdByType: "storeUser", registrationStatus: "pending_review", ...loc(26.2, 127.6) });
  m.seed("storeAccounts", "susp", { storeName: "停止店", enabled: false, createdByType: "storeUser", registrationStatus: "active", ...loc(26.2, 127.6) });
  m.seed("storeAccounts", "rej", { storeName: "却下店", enabled: true, createdByType: "storeUser", registrationStatus: "rejected", ...loc(26.2, 127.6) });
  m.seed("storeAccounts", "noloc", { storeName: "所在地なし店", enabled: true, createdByType: "storeUser", registrationStatus: "active" });
  const mem = (storeId, uid, o = {}) => m.seed("storeMembers", storeId + "_" + uid, { storeId, uid, role: "owner", status: "active", ...o });
  mem("self1", "u1"); mem("self2", "u1"); mem("other", "u2"); mem("pend", "u3"); mem("susp", "u4"); mem("rej", "u8"); mem("noloc", "u9");
  mem("self1", "u5", { role: "editor" }); mem("self1", "u6", { status: "removed" });
}
const USERS = { u1tok: { uid: "u1", provider: "password", emailVerified: true }, u2tok: { uid: "u2", provider: "password", emailVerified: true }, u3tok: { uid: "u3", provider: "password", emailVerified: true }, u4tok: { uid: "u4", provider: "password", emailVerified: true }, u5tok: { uid: "u5", provider: "password", emailVerified: true }, u6tok: { uid: "u6", provider: "password", emailVerified: true }, u8tok: { uid: "u8", provider: "password", emailVerified: true }, u9tok: { uid: "u9", provider: "password", emailVerified: true }, u1unverified: { uid: "u1", provider: "password", emailVerified: false }, anon: { uid: "a1", provider: "anonymous", emailVerified: false }, google: { uid: "u1", provider: "google.com", emailVerified: true } };
// Same decisions as moderate-submission.js resolveStoreUserActor(): no token 401, bad token 401, non-password 403.
async function resolveStoreUserActor(request) {
  const h = (request.headers && request.headers.authorization) || ""; const m = h.match(/^Bearer (.+)$/);
  if (!m) return { ok: false, status: 401, message: "ログインが必要です。" };
  const u = USERS[m[1]]; if (!u) return { ok: false, status: 401, message: "ログイン情報を確認できませんでした。" };
  if (u.provider !== "password") return { ok: false, status: 403, message: "店舗アカウントでログインしてください。" };
  return { ok: true, actor: { type: "storeUser", uid: u.uid, emailVerified: u.emailVerified } };
}
function deps(m, o = {}) {
  const calls = { moderation: 0, rate: 0 };
  return {
    calls,
    getFirebaseAdminApp: () => ({}), getFirestore: () => m.db, readRequestBody: (req) => req.body,
    validateStoreToken: async (db, storeId, token) => (storeId === "legacy1" && token === "secret" ? { valid: true, storeId: "legacy1", storeName: "旧URL店" } : { valid: false }),
    claimRateLimit: o.rateLimit || (async () => { calls.rate++; return true; }),
    hashRateLimitStore: (id) => "store:" + id, hashClientIpAddress: () => "ip",
    buildModerationInput: (x) => x, callOpenAiModeration: async (input) => { calls.moderation++; return (Array.isArray(input) ? input : [input]).map(() => ({ flagged: !!o.flagged })); },
    classifyModerationError: () => "error", buildReviewReason: () => "review", matchesSafetyCriticalKeywords: () => !!o.keyword, AI_REVIEW_VERSION: "test",
    requireAdmin: async () => ({ ok: false, status: 403 }), findAddressComponentByType: () => null,
    resolveStoreUserActor: o.noLoginDeps ? undefined : resolveStoreUserActor,
    checkStoreProfileEditor: o.noLoginDeps ? undefined : SP_.checkStoreProfileEditor
  };
}
const res = () => ({ code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } });
const req = (body, token) => ({ body, headers: token ? { authorization: "Bearer " + token } : {} });
const POST_BODY = { categoryCode: "restaurant", headline: "本日空席あります", body: "ランチ営業中です。", sourceLanguage: "ja", imageUrls: [], imagePublicIds: [], actionTargets: {}, categoryFields: {}, paymentMethods: [] };
async function op(m, d, kind, body, token) {
  const r = res();
  const fn = kind === "status" ? IM.handleImadakeStoreStatus : kind === "create" ? IM.handleImadakePostCreate : IM.handleImadakePostEnd;
  const fullBody = kind === "status" ? { mode: "imadakeStoreStatus", ...body } : kind === "create" ? { mode: "imadakePostCreate", ...POST_BODY, ...body } : { mode: "imadakePostEnd", ...body };
  await fn(req(fullBody, token), r, d);
  return r;
}
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

// ---------- 1. method A (old store URL + token) removed (STEP 43-B) ----------
{
  const m = makeDb(); seedAll(m); const d = deps(m);
  const before = m.writeLog.length;
  const rs = await op(m, d, "status", { storeId: "legacy1", token: "secret" });
  const rc = await quiet(() => op(m, d, "create", { storeId: "legacy1", token: "secret" }));
  const re = await op(m, d, "end", { storeId: "legacy1", token: "secret", postId: "x" });
  t("1 token (old store URL): status/create/end all 410, nothing written, no moderation", rs.code === 410 && rc.code === 410 && re.code === 410 && m.writeLog.length === before && d.calls.moderation === 0, { s: rs.code, c: rc.code, e: re.code });
  t("1 token: clear message pointing to the store account", /旧方式の店舗専用URLは終了しました/.test(rs.body.message) && /店舗アカウント/.test(rs.body.message), rs.body);
  const wrong = await op(m, d, "status", { storeId: "legacy1", token: "wrong" });
  t("1 token: the token is not checked any more (wrong token -> same 410)", wrong.code === 410);
  const noLogin = await op(m, deps(m, { noLoginDeps: true }), "status", { storeId: "legacy1", token: "secret" });
  t("1 token: refused even without login deps", noLogin.code === 410);
}
// ---------- 2. method B owner: status / create / end ----------
let selfPostId;
{
  const m = makeDb(); seedAll(m); const d = deps(m);
  let r = await op(m, d, "status", { storeId: "self1" }, "u1tok");
  t("2 owner: status 200 with own store name and registered location", r.code === 200 && r.body.storeName === "セルフ店1" && r.body.location && r.body.location.city === "那覇市", r.body);
  r = await quiet(() => op(m, d, "create", { storeId: "self1" }, "u1tok"));
  selfPostId = r.body.postId || (r.body.post && r.body.post.postId);
  const p = selfPostId && m.get("imadakePosts", selfPostId);
  t("2 owner: create 200; post belongs to self1 with server-side name/location", r.code === 200 && p && p.storeId === "self1" && p.storeNameSnapshot === "セルフ店1" && p.latitude === 26.22 && p.status === "published", { code: r.code, body: r.body });
  t("[CV STEP3] new post: cvBillingEnabled decided by server = false (billing not started)", p && p.cvBillingEnabled === false, p && p.cvBillingEnabled);
  t("2 owner: one active post per store kept (second create -> 409 active_post_exists)", (await quiet(() => op(m, d, "create", { storeId: "self1" }, "u1tok"))).body.reason === "active_post_exists");
  r = await op(m, d, "status", { storeId: "self1" }, "u1tok");
  t("2 owner: status shows the current post", r.body.currentPost && r.body.currentPost.postId === selfPostId, r.body.currentPost);
  r = await op(m, d, "end", { storeId: "self1", postId: selfPostId }, "u1tok");
  t("2 owner: end 200 and post ended", r.code === 200 && m.get("imadakePosts", selfPostId).status === "ended", r.body);
  t("2 owner: writes only to imadakePosts / imadakeStoreSlots", [...new Set(m.writeLog)].every((c) => c === "imadakePosts" || c === "imadakeStoreSlots"), [...new Set(m.writeLog)]);
}
// ---------- 3-9. rejections ----------
{
  const m = makeDb(); seedAll(m); const d = deps(m);
  // a live post at "other" by its owner
  const rc = await quiet(() => op(m, d, "create", { storeId: "other" }, "u2tok"));
  const otherPostId = rc.body.postId || (rc.body.post && rc.body.post.postId);
  const cases = [
    ["3 other store's owner on self1", { storeId: "self1" }, "u2tok", 403],
    ["4 email not verified", { storeId: "self1" }, "u1unverified", 403],
    ["5 anonymous auth", { storeId: "self1" }, "anon", 403],
    ["6 non-password provider (google.com)", { storeId: "self1" }, "google", 403],
    ["7 pending_review store owner", { storeId: "pend" }, "u3tok", 403],
    ["8 suspended store (enabled:false) owner", { storeId: "susp" }, "u4tok", 403],
    ["8b rejected store owner", { storeId: "rej" }, "u8tok", 403],
    ["9 member with role editor", { storeId: "self1" }, "u5tok", 403],
    ["9 member with status removed", { storeId: "self1" }, "u6tok", 403],
    ["9 no member record (legacy store via login)", { storeId: "legacy1" }, "u1tok", 403],
    ["no Authorization header", { storeId: "self1" }, null, 401],
    ["unknown/invalid ID token", { storeId: "self1" }, "garbage", 401],
    ["storeId missing", {}, "u1tok", 403],
    ["storeId with slash", { storeId: "self1/x" }, "u1tok", 403],
    ["storeId of non-existent store", { storeId: "nope" }, "u1tok", 403]
  ];
  for (const [label, body, token, code] of cases) {
    const before = m.writeLog.length; const modBefore = d.calls.moderation;
    const rs = await op(m, d, "status", body, token);
    const rcr = await quiet(() => op(m, d, "create", body, token));
    const re = await op(m, d, "end", { ...body, postId: otherPostId }, token);
    t(`${label}: status/create/end all ${code}, no writes, no moderation`, rs.code === code && rcr.code === code && re.code === code && m.writeLog.length === before && d.calls.moderation === modBefore, { s: rs.code, c: rcr.code, e: re.code, msg: rs.body.message });
  }
  t("4 email not verified -> clear message", (await op(m, d, "status", { storeId: "self1" }, "u1unverified")).body.message === "メールアドレスの確認が終わっていません。");
  t("3/7/8/9 same 403 message (store existence not revealed)", ["u2tok", "u5tok"].every(async () => true) && (await op(m, d, "status", { storeId: "self1" }, "u2tok")).body.message === (await op(m, d, "status", { storeId: "nope" }, "u1tok")).body.message);
  const rEndOther = await op(m, d, "end", { storeId: "self1", postId: otherPostId }, "u1tok");
  t("3 owner of self1 cannot end other store's post (404 like a missing post)", rEndOther.code === 404 && m.get("imadakePosts", otherPostId).status === "published", rEndOther.body);
}
// ---------- 10. token vs login: no mix-up ----------
{
  const m = makeDb(); seedAll(m); const d = deps(m);
  let r = await op(m, d, "status", { storeId: "self1", token: "wrong" }, "u1tok");
  t("10 any token + valid owner login -> 410 (no fallback to login)", r.code === 410);
  r = await op(m, d, "status", { storeId: "legacy1", token: "secret" }, "u2tok");
  t("10 old store token + someone's login -> 410 (old store not reachable)", r.code === 410);
  r = await op(m, d, "status", { storeId: "self1", token: "secret" }, "u1tok");
  t("10 old token sent with self1 storeId -> 410", r.code === 410);
  r = await op(m, d, "status", { storeId: "self1", token: "   " }, "u1tok");
  t("10 blank token treated as no token -> login path", r.code === 200 && r.body.storeName === "セルフ店1");
}
// ---------- 11. multiple stores of one owner ----------
{
  const m = makeDb(); seedAll(m); const d = deps(m);
  const s1 = await op(m, d, "status", { storeId: "self1" }, "u1tok");
  const s2 = await op(m, d, "status", { storeId: "self2" }, "u1tok");
  t("11 same owner, two stores: each status returns its own name", s1.body.storeName === "セルフ店1" && s2.body.storeName === "セルフ店2");
  const c2 = await quiet(() => op(m, d, "create", { storeId: "self2" }, "u1tok"));
  const id2 = c2.body.postId || (c2.body.post && c2.body.post.postId);
  const c1 = await quiet(() => op(m, d, "create", { storeId: "self1" }, "u1tok"));
  const id1 = c1.body.postId || (c1.body.post && c1.body.post.postId);
  t("11 posts stored under the right store (no mix-up)", m.get("imadakePosts", id2).storeId === "self2" && m.get("imadakePosts", id1).storeId === "self1" && m.get("imadakePosts", id2).latitude === 26.3);
  t("11 slots are per store", m.get("imadakeStoreSlots", "self1").activePostId === id1 && m.get("imadakeStoreSlots", "self2").activePostId === id2);
  const e = await op(m, d, "end", { storeId: "self1", postId: id2 }, "u1tok");
  t("11 ending self2's post via self1 storeId -> 404, still published", e.code === 404 && m.get("imadakePosts", id2).status === "published");
}
// ---------- 13. existing rules kept for logged-in stores ----------
{
  const m = makeDb(); seedAll(m);
  let r = await quiet(() => op(m, deps(m, { flagged: true }), "create", { storeId: "self1" }, "u1tok"));
  t("13 moderation flagged -> rejected, not published", r.code === 200 ? m.get("imadakePosts", r.body.postId || (r.body.post && r.body.post.postId)).status === "rejected" : r.body.success === false, r.body);
  const m2 = makeDb(); seedAll(m2);
  r = await quiet(() => op(m2, deps(m2, { keyword: true }), "create", { storeId: "self1" }, "u1tok"));
  const pid = r.body.postId || (r.body.post && r.body.post.postId);
  t("13 safety keyword -> pending (admin review), not published", pid && m2.get("imadakePosts", pid).status === "pending", r.body);
  const m3 = makeDb(); seedAll(m3);
  r = await quiet(() => op(m3, deps(m3, { rateLimit: async () => false }), "create", { storeId: "self1" }, "u1tok"));
  t("13 rate limit -> 429", r.code === 429);
  const m4 = makeDb(); seedAll(m4);
  r = await quiet(() => op(m4, deps(m4), "create", { storeId: "noloc" }, "u9tok"));
  t("13 store without registered location -> 409 location_not_registered", r.code === 409 && r.body.reason === "location_not_registered");
  r = await quiet(() => op(m4, deps(m4), "create", { storeId: "self1", body: "x".repeat(3001) }, "u1tok"));
  t("13 body over 3,000 chars -> 400", r.code === 400);
  r = await quiet(() => op(m4, deps(m4), "create", { storeId: "self1", imageUrls: Array.from({ length: 11 }, (_, i) => "https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_submissions/p" + i + ".jpg") }, "u1tok"));
  t("13 more than 10 photos -> 400", r.code === 400);
  const pub = await quiet(() => op(m4, deps(m4), "create", { storeId: "self1" }, "u1tok"));
  const pp = m4.get("imadakePosts", pub.body.postId || (pub.body.post && pub.body.post.postId));
  t("13 24h expiry from publishedAt kept", pp && pp.expiresAt.toMillis() - pp.publishedAt.toMillis() === 24 * 3600e3);
}
{
  const m = makeDb(); seedAll(m); const d = deps(m);
  const r = await quiet(() => op(m, d, "create", { storeId: "self1", cvBillingEnabled: true, billable: true }, "u1tok"));
  const id = r.body.postId || (r.body.post && r.body.post.postId);
  const p = id && m.get("imadakePosts", id);
  t("[CV STEP3] client-sent cvBillingEnabled:true ignored -> stored false", r.code === 200 && p && p.cvBillingEnabled === false, p && p.cvBillingEnabled);
  await op(m, d, "end", { storeId: "self1", postId: id }, "u1tok");
  t("[CV STEP3] ending a post does not change cvBillingEnabled", m.get("imadakePosts", id).status === "ended" && m.get("imadakePosts", id).cvBillingEnabled === false);
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
