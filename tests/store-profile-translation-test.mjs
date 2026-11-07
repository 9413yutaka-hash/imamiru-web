// Server tests for storeProfileTranslationGet (2026-11-07 G案: owner store card descriptions in English)
// with a transactional in-memory Firestore and a mocked OpenAI. No real services.
// run: node --import ./tests/mockfa/register.mjs tests/store-profile-translation-test.mjs
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
const TS = (ms) => ({ toMillis: () => ms });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * 4);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));
// transactional Firestore mock (optimistic concurrency, like Firestore; same as imadake-translation-test) that logs written field paths
function makeDb() {
  const store = new Map(); const writeLog = [];
  const ref = (col, id) => ({ path: col + "/" + id, id, col });
  const setPath = (obj, dotted, value) => { const ks = dotted.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = value; };
  const apply = (w) => {
    const cur = store.get(w.ref.path); let data = cur ? clone(cur.data) : {};
    if (w.type === "set") data = w.merge ? { ...data, ...clone(w.data) } : clone(w.data);
    if (w.type === "update") { if (!cur) throw new Error("update on missing doc " + w.ref.path); for (const [k, v] of Object.entries(w.data)) setPath(data, k, clone(v)); }
    store.set(w.ref.path, { data, version: (cur ? cur.version : 0) + 1 }); writeLog.push({ path: w.ref.path, type: w.type, keys: Object.keys(w.data) });
  };
  const snap = (r) => { const cur = store.get(r.path); return { id: r.id, exists: !!cur, data: () => (cur ? clone(cur.data) : undefined) }; };
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, id) }),
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const reads = new Map(); const writes = [];
        const tx = { get: async (r) => { await jitter(); const cur = store.get(r.path); reads.set(r.path, cur ? cur.version : 0); return snap(r); },
          set: (r, data, opts) => { writes.push({ type: "set", ref: r, data, merge: !!(opts && opts.merge) }); }, update: (r, data) => { writes.push({ type: "update", ref: r, data }); } };
        const result = await fn(tx); await jitter();
        let ok = true; for (const [pth, v] of reads) { const cur = store.get(pth); if ((cur ? cur.version : 0) !== v) { ok = false; break; } }
        if (!ok) continue; writes.forEach(apply); return result;
      }
      throw new Error("too much contention");
    }
  };
  // seed は店主の保存(merge)と同じく版を進める(進行中のトランザクションは読み直しになる)
  return { db, store, writeLog, seed: (col, id, data) => { const cur = store.get(col + "/" + id); store.set(col + "/" + id, { data: clone(data), version: (cur ? cur.version : 0) + 1 }); }, get: (col, id) => (store.get(col + "/" + id) || {}).data };
}
const REPO = REPO_ROOT + "";
const TR = await import(pathToFileURL(REPO + "/api/_lib/store-profile-translation.js").href);

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };
const quietErrors = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

const DESC = "首里の老舗です。\nランチ1,200円、11:00〜15:00。\n席は20席。";
let clock = Date.parse("2026-11-07T03:00:00Z"); // 12:00 JST

function profile(o = {}) {
  return { storeId: o.storeId || "S1", status: o.status ?? "published", description: o.description ?? DESC, sourceLanguage: o.sourceLanguage ?? "ja", revision: 3, categoryCode: "restaurant", ...(o.extra || {}) };
}
// 旅行者向けの公開判定の代わり(本番は readPublicStoreProfileForShare)。published だけを公開扱いにし、
// hidden に入れた店舗は「公開条件を満たさない」(契約なし等)として null を返す。
function publicReader(m, hidden = new Set()) {
  return async (db, storeId) => {
    const p = m.get("storeProfiles", storeId);
    if (!p || p.status !== "published" || hidden.has(storeId)) return null;
    return { id: "sp_" + storeId, description: String(p.description || "").trim(), sourceLanguage: p.sourceLanguage || "" };
  };
}
function translator(counter, opts = {}) {
  return async (items, language) => {
    counter.calls++; counter.items += items.length; counter.batches.push(items.map((i) => i.id));
    if (opts.throwError) throw Object.assign(new Error("simulated OpenAI failure"), opts.truncated ? { reason: "output_truncated" } : {});
    const byId = {};
    items.forEach((i) => { byId[i.id] = opts.badDigits ? "Lunch 1,300 yen" : "EN(" + language + "): " + (i.description.match(/[\d,:]+/g) || []).join(" "); });
    return { byId, usage: { inputTokens: 500, outputTokens: 200 }, estimatedCostUsd: 0.0002 };
  };
}
function deps(m, counter, opts = {}) {
  return {
    getFirebaseAdminApp: () => ({}), getFirestore: () => m.db,
    verifyIdToken: async (app, tok) => { if (tok !== "good") throw new Error("bad token"); return { uid: "anon" }; },
    readBearerToken: (req) => (req.headers.authorization || "").replace(/^Bearer /, ""),
    readRequestBody: (req) => req.body,
    claimRateLimit: opts.rateLimit || (async () => true),
    hashClientIpAddress: () => "iphash",
    readPublicStore: opts.readPublicStore || publicReader(m, opts.hidden),
    translateDescriptions: opts.translator || translator(counter, opts),
    now: () => clock,
    randomId: (() => { let n = 0; return () => "claim-" + (++n); })()
  };
}
async function call(d, body, token = "good") {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await TR.handleStoreProfileTranslationGet({ headers: token ? { authorization: "Bearer " + token } : {}, body }, res, d);
  return res;
}
const entry = (m, id) => { const p = m.get("storeProfiles", id); return p && p.translations && p.translations.en && p.translations.en.description; };
const budget = (m) => { const b = m.get("storeProfileTranslationBudgets", "2026-11-07"); return b ? b.count : 0; };
const counter = () => ({ calls: 0, items: 0, batches: [] });

// ---------- U: validation ----------
{
  const v = TR.validateStoreProfileDescriptionTranslation;
  t("U digits kept (commas, full-width, times) -> ok", v("ランチ１，２００円 11:00", "Lunch 1,200 yen 11:00").ok === true);
  t("U changed price / 11:00 -> 11 am -> digits_mismatch", v(DESC, "Lunch 1,300 yen, 11:00-15:00, 20 seats").reason === "digits_mismatch" && v("11:00から", "from 11 am").reason === "digits_mismatch");
  t("U empty / too long / not a string -> fail", v("a", "").ok === false && v("a", "x".repeat(TR.STORE_PROFILE_TRANSLATED_DESCRIPTION_MAX_LENGTH + 1)).ok === false && v("a", null).ok === false && v("a", { x: 1 }).ok === false);
  t("U limits: 10 stores/request, 5 new/request, 50 new/day", TR.STORE_PROFILE_TRANSLATION_MAX_STORES_PER_REQUEST === 10 && TR.STORE_PROFILE_TRANSLATION_MAX_NEW_PER_REQUEST === 5 && TR.STORE_PROFILE_TRANSLATION_DAILY_LIMIT === 50);
}

// ---------- H1: auth & input ----------
{
  const m = makeDb(); const c = counter(); const d = deps(m, c);
  t("H1 no token -> 401", (await call(d, { storeIds: ["sp_S1"], language: "en" }, "")).code === 401);
  t("H1 bad token -> 401", (await call(d, { storeIds: ["sp_S1"], language: "en" }, "nope")).code === 401);
  const bad = [{ storeIds: ["sp_S1"], language: "fr" }, { storeIds: ["sp_S1"], language: "ja" }, { storeIds: [], language: "en" }, { storeIds: "sp_S1", language: "en" },
    { storeIds: Array.from({ length: 11 }, (_, i) => "sp_S" + i), language: "en" }, { storeIds: ["S1"], language: "en" }, { storeIds: ["sp_a/b"], language: "en" }, { storeIds: [12], language: "en" }, { storeIds: ["sp_" + "x".repeat(101)], language: "en" }];
  let all400 = true; for (const b of bad) if ((await call(d, b)).code !== 400) all400 = false;
  t("H1 invalid language / ids / count (>10) / missing sp_ prefix -> 400, no OpenAI", all400 && c.calls === 0);
  const r = await call(deps(m, c, { rateLimit: async () => false }), { storeIds: ["sp_S1"], language: "en" });
  t("H1 rate limited -> 429, no OpenAI", r.code === 429 && r.body.rateLimited === true && c.calls === 0);
  t("H1 no-store cache header", r.headers["Cache-Control"] === "no-store");
}

// ---------- H2: translate, save, reuse, source change ----------
{
  const m = makeDb(); const c = counter();
  m.seed("storeProfiles", "S1", profile()); m.seed("storeProfiles", "S2", profile({ storeId: "S2", description: "焼きたてパンの店。8:00開店。" }));
  const d = deps(m, c);
  let r = await call(d, { storeIds: ["sp_S1", "sp_S2", "sp_S1"], language: "en" });
  t("H2 untranslated -> one OpenAI batch with both stores (duplicates removed)", c.calls === 1 && JSON.stringify(c.batches[0]) === '["sp_S1","sp_S2"]', c.batches);
  t("H2 response has translations keyed by public id", r.code === 200 && typeof r.body.translations.sp_S1 === "string" && r.body.translations.sp_S1.startsWith("EN(en)") && r.body.pending.length === 0 && r.body.limited === false, r.body);
  t("H2 response does not include the original or owner data", !JSON.stringify(r.body).includes("首里") && !JSON.stringify(r.body).includes("revision"));
  const e1 = entry(m, "S1");
  t("H2 stored ready entry with source hash; original description unchanged; budget 2", e1.status === "ready" && e1.sourceHash === TR.computeStoreProfileDescriptionHash(DESC.trim()) && m.get("storeProfiles", "S1").description === DESC && budget(m) === 2, e1);
  const keys = new Set(m.writeLog.map((w) => w.path.split("/")[0] + ":" + w.keys.join(",")));
  t("H2 writes only translations.en.description and the day budget", [...keys].every((k) => k === "storeProfiles:translations.en.description" || k.startsWith("storeProfileTranslationBudgets:")), [...keys]);
  r = await call(d, { storeIds: ["sp_S1", "sp_S2"], language: "en" });
  t("H2 cached -> no OpenAI call, budget unchanged, served from cache", c.calls === 1 && budget(m) === 2 && r.body.translations.sp_S1 === e1.description);
  // the owner edits the description (merge save keeps the translations field)
  const p = m.get("storeProfiles", "S1"); p.description = "首里の老舗です。ランチ1,500円。"; m.seed("storeProfiles", "S1", p);
  r = await call(d, { storeIds: ["sp_S1"], language: "en" });
  t("H2 source changed -> retranslated once (old translation not served)", c.calls === 2 && budget(m) === 3 && r.body.translations.sp_S1.includes("1,500") && entry(m, "S1").sourceHash === TR.computeStoreProfileDescriptionHash("首里の老舗です。ランチ1,500円。"), r.body);
}

// ---------- H3: not translated (non-public, hidden, English source, empty) ----------
{
  const m = makeDb(); const c = counter();
  m.seed("storeProfiles", "D1", profile({ storeId: "D1", status: "draft" }));
  m.seed("storeProfiles", "H1", profile({ storeId: "H1" }));
  m.seed("storeProfiles", "E1", profile({ storeId: "E1", sourceLanguage: "en", description: "Fresh bread from 8:00." }));
  m.seed("storeProfiles", "N1", profile({ storeId: "N1", description: "   " }));
  const r = await call(deps(m, c, { hidden: new Set(["H1"]) }), { storeIds: ["sp_D1", "sp_H1", "sp_E1", "sp_N1", "sp_MISSING"], language: "en" });
  t("H3 draft / not meeting publish conditions / English source / empty / missing -> no OpenAI, nothing returned, nothing written",
    r.code === 200 && c.calls === 0 && JSON.stringify(r.body.translations) === "{}" && r.body.pending.length === 0 && m.writeLog.length === 0 && budget(m) === 0, { body: r.body, w: m.writeLog });
  const paths = new Set(m.writeLog.map((w) => w.path));
  t("H3 response does not reveal which stores exist", !JSON.stringify(r.body).includes("D1") && !JSON.stringify(r.body).includes("MISSING") && paths.size === 0);
}

// ---------- H4: failure, retry wait, give up after 3 ----------
{
  const m = makeDb(); const c = counter();
  m.seed("storeProfiles", "S1", profile());
  const failing = deps(m, c, { throwError: true });
  let r = await quietErrors(() => call(failing, { storeIds: ["sp_S1"], language: "en" }));
  t("H4 OpenAI failure -> 200 with no translation (page keeps the original), error entry with 10 min wait", r.code === 200 && JSON.stringify(r.body.translations) === "{}" && entry(m, "S1").status === "error" && entry(m, "S1").errorCount === 1 && entry(m, "S1").retryAfter.toMillis() === clock + 10 * 60e3, entry(m, "S1"));
  r = await call(failing, { storeIds: ["sp_S1"], language: "en" });
  t("H4 during the wait -> no OpenAI call, no budget", c.calls === 1 && budget(m) === 1);
  clock += 11 * 60e3;
  await quietErrors(() => call(failing, { storeIds: ["sp_S1"], language: "en" }));
  t("H4 2nd failure -> wait 1 hour", c.calls === 2 && entry(m, "S1").errorCount === 2 && entry(m, "S1").retryAfter.toMillis() === clock + 60 * 60e3);
  clock += 61 * 60e3;
  await quietErrors(() => call(failing, { storeIds: ["sp_S1"], language: "en" }));
  t("H4 3rd failure -> failed (no more automatic retries)", c.calls === 3 && entry(m, "S1").status === "failed");
  clock += 24 * 60 * 60e3;
  await call(failing, { storeIds: ["sp_S1"], language: "en" });
  t("H4 failed stays failed for the same source (even the next day)", c.calls === 3);
  const p = m.get("storeProfiles", "S1"); p.description = "新しい紹介文。"; m.seed("storeProfiles", "S1", p);
  r = await call(deps(m, c), { storeIds: ["sp_S1"], language: "en" });
  t("H4 owner changes the text -> translated again", c.calls === 4 && typeof r.body.translations.sp_S1 === "string");
  clock = Date.parse("2026-11-07T03:00:00Z");
}

// ---------- H5: bad output is not saved ----------
{
  const m = makeDb(); const c = counter();
  m.seed("storeProfiles", "S1", profile());
  let r = await call(deps(m, c, { badDigits: true }), { storeIds: ["sp_S1"], language: "en" });
  t("H5 changed numbers -> not saved, not returned (digits_mismatch)", JSON.stringify(r.body.translations) === "{}" && entry(m, "S1").status === "error" && entry(m, "S1").lastErrorReason === "digits_mismatch");
  const m2 = makeDb(); m2.seed("storeProfiles", "S1", profile());
  r = await quietErrors(() => call(deps(m2, c, { throwError: true, truncated: true }), { storeIds: ["sp_S1"], language: "en" }));
  t("H5 output cut off at the token limit -> not saved (output_truncated)", JSON.stringify(r.body.translations) === "{}" && entry(m2, "S1").lastErrorReason === "output_truncated");
}

// ---------- H6: per-request cap, daily cap, concurrency ----------
{
  const m = makeDb(); const c = counter();
  const ids = Array.from({ length: 8 }, (_, i) => "S" + i);
  ids.forEach((id) => m.seed("storeProfiles", id, profile({ storeId: id, description: "店" + id + "の紹介。" })));
  let r = await call(deps(m, c), { storeIds: ids.map((id) => "sp_" + id), language: "en" });
  t("H6 8 untranslated stores -> 5 translated now, 3 pending (no more than 5 per request)", c.items === 5 && Object.keys(r.body.translations).length === 5 && r.body.pending.length === 3 && budget(m) === 5, r.body);
  r = await call(deps(m, c), { storeIds: r.body.pending, language: "en" });
  t("H6 asking again for the pending ones -> translated", c.items === 8 && Object.keys(r.body.translations).length === 3 && budget(m) === 8);

  const m2 = makeDb(); const c2 = counter();
  m2.seed("storeProfileTranslationBudgets", "2026-11-07", { dayKey: "2026-11-07", count: 49 });
  ["A", "B"].forEach((id) => m2.seed("storeProfiles", id, profile({ storeId: id })));
  r = await call(deps(m2, c2), { storeIds: ["sp_A", "sp_B"], language: "en" });
  t("H6 daily cap 50: 49 used -> 1 more translated, the other limited", c2.items === 1 && Object.keys(r.body.translations).length === 1 && r.body.limited === true && budget(m2) === 50, r.body);
  const translatedId = Object.keys(r.body.translations)[0];
  r = await call(deps(m2, c2), { storeIds: ["sp_A", "sp_B"], language: "en" });
  t("H6 after the cap: cached one still served, no new OpenAI call", c2.calls === 1 && r.body.translations[translatedId] && r.body.limited === true);

  const m3 = makeDb(); const c3 = counter();
  m3.seed("storeProfiles", "S1", profile());
  let release; const gate = new Promise((res) => { release = res; });
  const slow = deps(m3, c3, { translator: async (items, lang) => { c3.calls++; await gate; return translator(counter())(items, lang); } });
  const first = call(slow, { storeIds: ["sp_S1"], language: "en" });
  await new Promise((res) => setTimeout(res, 60));
  const second = await call(slow, { storeIds: ["sp_S1"], language: "en" });
  release(); const firstRes = await first;
  t("H6 concurrent request while generating -> pending, only 1 OpenAI call, budget 1", c3.calls === 1 && second.body.pending.includes("sp_S1") && typeof firstRes.body.translations.sp_S1 === "string" && budget(m3) === 1, { second: second.body });
}

// ---------- H7: the text changes or the store is unpublished during translation ----------
{
  const m = makeDb(); const c = counter();
  m.seed("storeProfiles", "S1", profile());
  const changing = deps(m, c, { translator: async (items, lang) => { const p = m.get("storeProfiles", "S1"); p.description = "変更後"; m.seed("storeProfiles", "S1", p); return translator(c)(items, lang); } });
  let r = await call(changing, { storeIds: ["sp_S1"], language: "en" });
  t("H7 text changed during translation -> old translation not saved or returned", JSON.stringify(r.body.translations) === "{}" && entry(m, "S1").status !== "ready");
  const m2 = makeDb(); const c2 = counter();
  m2.seed("storeProfiles", "S1", profile());
  const unpublishing = deps(m2, c2, { translator: async (items, lang) => { const p = m2.get("storeProfiles", "S1"); p.status = "draft"; m2.seed("storeProfiles", "S1", p); return translator(c2)(items, lang); } });
  r = await call(unpublishing, { storeIds: ["sp_S1"], language: "en" });
  t("H7 unpublished during translation -> not saved or returned", JSON.stringify(r.body.translations) === "{}" && entry(m2, "S1").status !== "ready");
  const m3 = makeDb(); const c3 = counter();
  m3.seed("storeProfiles", "S1", profile());
  const r3 = await call(deps(m3, c3, { readPublicStore: async () => ({ id: "sp_S1", description: "公開判定の時点の別の原文", sourceLanguage: "ja" }) }), { storeIds: ["sp_S1"], language: "en" });
  t("H7 text differs between the public check and the claim -> not translated", c3.calls === 0 && JSON.stringify(r3.body.translations) === "{}" && budget(m3) === 0);
}

// ---------- H8: a stale "generating" (stopped midway) counts as a failure ----------
{
  const m = makeDb(); const c = counter();
  const hash = TR.computeStoreProfileDescriptionHash(DESC.trim());
  m.seed("storeProfiles", "S1", profile({ extra: { translations: { en: { description: { status: "generating", sourceHash: hash, claimId: "old", generatingStartedAt: TS(clock - 61e3), errorCount: 2 } } } } }));
  const r = await call(deps(m, c), { storeIds: ["sp_S1"], language: "en" });
  t("H8 stale generating with 2 failures -> failed, no OpenAI call", c.calls === 0 && entry(m, "S1").status === "failed" && JSON.stringify(r.body.translations) === "{}");
  const m2 = makeDb();
  m2.seed("storeProfiles", "S1", profile({ extra: { translations: { en: { description: { status: "generating", sourceHash: hash, claimId: "old", generatingStartedAt: TS(clock - 30e3), errorCount: 0 } } } } }));
  const r2 = await call(deps(m2, c), { storeIds: ["sp_S1"], language: "en" });
  t("H8 generating under 60s -> pending, no OpenAI call", c.calls === 0 && r2.body.pending.includes("sp_S1"));
}

// ---------- R: route wiring ----------
{
  const M = await import(pathToFileURL(REPO + "/api/moderate-submission.js").href);
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await M.default({ method: "POST", query: {}, body: { mode: "storeProfileTranslationGet", storeIds: ["sp_S1"], language: "en" }, headers: {} }, res);
  t("R POST storeProfileTranslationGet is routed (401 without token, no-store)", res.code === 401 && /認証/.test(res.body.message) && res.headers["Cache-Control"] === "no-store", { code: res.code, body: res.body });
}

console.log(`TOTAL ${pass + fail} PASS ${pass} FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
