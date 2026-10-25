// Server tests for imadakeCardTranslationGet with a transactional in-memory Firestore and a mocked OpenAI.
import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
const REPO = REPO_ROOT + "";
const TR = await import(pathToFileURL(REPO + "/api/_lib/imadake-translation.js").href);
const IM = await import(pathToFileURL(REPO + "/api/_lib/imadake.js").href);

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };
const TS = (ms) => ({ toMillis: () => ms });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * 4);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));

// ---------- transactional Firestore mock (optimistic concurrency, like Firestore) ----------
function makeDb() {
  const store = new Map(); // path -> {data, version}
  const writeLog = [];
  let txCount = 0, conflicts = 0;
  const ref = (col, id) => ({ path: col + "/" + id, id, col });
  const setPath = (obj, dotted, value) => { const ks = dotted.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = value; };
  const apply = (w) => {
    const cur = store.get(w.ref.path);
    let data = cur ? clone(cur.data) : {};
    if (w.type === "set") data = w.merge ? { ...data, ...clone(w.data) } : clone(w.data);
    if (w.type === "update") { if (!cur) throw new Error("update on missing doc " + w.ref.path); for (const [k, v] of Object.entries(w.data)) setPath(data, k, clone(v)); }
    store.set(w.ref.path, { data, version: (cur ? cur.version : 0) + 1 });
    writeLog.push({ path: w.ref.path, type: w.type, keys: Object.keys(w.data) });
  };
  const snap = (r) => { const cur = store.get(r.path); return { id: r.id, exists: !!cur, data: () => (cur ? clone(cur.data) : undefined) }; };
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, id) }),
    async runTransaction(fn) {
      for (let attempt = 0; attempt < 50; attempt++) {
        txCount++;
        const reads = new Map(); const writes = [];
        const tx = {
          get: async (r) => { await jitter(); const cur = store.get(r.path); reads.set(r.path, cur ? cur.version : 0); return snap(r); },
          set: (r, data, opts) => { writes.push({ type: "set", ref: r, data, merge: !!(opts && opts.merge) }); },
          update: (r, data) => { writes.push({ type: "update", ref: r, data }); }
        };
        const result = await fn(tx);
        await jitter();
        let ok = true;
        for (const [p, v] of reads) { const cur = store.get(p); if ((cur ? cur.version : 0) !== v) { ok = false; break; } }
        if (!ok) { conflicts++; continue; }
        writes.forEach(apply);
        return result;
      }
      throw new Error("too much contention");
    }
  };
  return { db, store, writeLog, stats: () => ({ txCount, conflicts }), seed: (col, id, data) => store.set(col + "/" + id, { data: clone(data), version: 1 }) };
}

const H = 3600e3;
let clock = Date.parse("2026-10-13T03:00:00Z"); // 12:00 JST
function post(id, o = {}) {
  return { storeId: "s-" + id, storeNameSnapshot: "店" + id, categoryCode: "restaurant", headline: o.headline ?? "本日限定ランチ1,200円", body: o.body ?? "席はあと3席です。21:00まで営業しています。ご来店お待ちしています。", sourceLanguage: o.sourceLanguage ?? "ja",
    status: o.status ?? "published", publishedAt: TS(clock - H), expiresAt: TS(o.expiresAt ?? clock + 20 * H), latitude: 26.2, longitude: 127.6, imageUrls: [], ...(o.extra || {}) };
}
function goodTranslator(counter, opts = {}) {
  return async (items, language) => {
    counter.calls++; counter.items += items.length; counter.batches.push(items.map((i) => i.id));
    if (opts.delayMs) await sleep(opts.delayMs);
    if (opts.onCall) await opts.onCall(items);
    if (opts.throwError) throw new Error("simulated OpenAI failure");
    const byId = {};
    items.forEach((i) => { byId[i.id] = opts.badDigits ? { headline: "Lunch special 1,300 yen", excerpt: "x" } : { headline: "EN: " + i.headline.replace(/[^\d,:]/g, " ").trim() + " special", excerpt: "EN " + (i.excerpt.match(/[\d,:]+/g) || []).join(" ") }; });
    return { byId, usage: { inputTokens: 300, outputTokens: 60 }, estimatedCostUsd: 0.0001 };
  };
}
function deps(db, counter, opts = {}) {
  return {
    getFirebaseAdminApp: () => ({}), getFirestore: () => db,
    verifyIdToken: async (app, tok) => { if (tok !== "good") throw new Error("bad token"); return { uid: "anon" }; },
    readBearerToken: (req) => (req.headers.authorization || "").replace(/^Bearer /, ""),
    readRequestBody: (req) => req.body,
    claimRateLimit: opts.rateLimit || (async () => true),
    hashClientIpAddress: () => "iphash",
    translateCards: opts.translator || goodTranslator(counter, opts),
    now: () => clock,
    randomId: (() => { let n = 0; return () => "claim-" + (++n) + "-" + Math.random().toString(36).slice(2, 6); })()
  };
}
async function call(d, body, token = "good") {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await TR.handleImadakeCardTranslationGet({ headers: token ? { authorization: "Bearer " + token } : {}, body }, res, d);
  return res;
}
const card = (store, id) => { const c = store.get("imadakePosts/" + id); return c && c.data.translations && c.data.translations.en && c.data.translations.en.card; };
const budget = (store, day) => { const c = store.get("imadakeTranslationBudgets/" + day); return c ? c.data.count : 0; };
const DAY = () => TR.computeImadakeTranslationDayKey(clock);
const quietErrors = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

// ---------- U: pure helpers ----------
t("U JST day key: 14:59:59Z -> same day, 15:00Z -> next day", TR.computeImadakeTranslationDayKey(Date.parse("2026-10-13T14:59:59Z")) === "2026-10-13" && TR.computeImadakeTranslationDayKey(Date.parse("2026-10-13T15:00:00Z")) === "2026-10-14" && TR.computeImadakeTranslationDayKey(Date.parse("2026-12-31T15:00:00Z")) === "2027-01-01");
const v = (s, tr) => TR.validateImadakeCardTranslation(s, tr);
t("U digits: same numbers (commas, full-width) pass", v({ headline: "ランチ１，２００円", excerpt: "残り3席・21:00まで" }, { headline: "Lunch 1,200 yen", excerpt: "3 seats left, until 21:00" }).ok === true);
t("U digits: changed price fails", v({ headline: "ランチ1,200円", excerpt: "" }, { headline: "Lunch 1,300 yen", excerpt: "" }).reason === "digits_mismatch");
t("U digits: 21:00 -> 9 pm fails", v({ headline: "夜", excerpt: "21:00まで" }, { headline: "Night", excerpt: "until 9 pm" }).reason === "digits_mismatch");
t("U empty/too long translation fails", v({ headline: "a", excerpt: "b" }, { headline: "", excerpt: "x" }).ok === false && v({ headline: "a", excerpt: "b" }, { headline: "x".repeat(161), excerpt: "y" }).ok === false && v({ headline: "a", excerpt: "b" }, { headline: "x", excerpt: "" }).ok === false && v({ headline: "a", excerpt: "b" }, null).ok === false);
const D = TR.decideImadakeCardTranslationState;
t("U state: ready / generating(<60s) / stale / failed / waiting / changed source", D(null, "h", clock) === "claimable" && D({ status: "ready", sourceHash: "h" }, "h", clock) === "ready" && D({ status: "ready", sourceHash: "old" }, "h", clock) === "claimable" && D({ status: "generating", sourceHash: "h", generatingStartedAt: TS(clock - 59e3) }, "h", clock) === "generating" && D({ status: "generating", sourceHash: "h", generatingStartedAt: TS(clock - 61e3) }, "h", clock) === "claimable" && D({ status: "failed", sourceHash: "h", errorCount: 3 }, "h", clock) === "failed" && D({ status: "error", sourceHash: "h", errorCount: 1, retryAfter: TS(clock + 1) }, "h", clock) === "waiting" && D({ status: "error", sourceHash: "old", errorCount: 3, retryAfter: TS(clock + 1e9) }, "h", clock) === "claimable");

// ---------- H1: auth & input ----------
{
  const { db } = makeDb(); const c = { calls: 0, items: 0, batches: [] }; const d = deps(db, c);
  t("H1 no token -> 401", (await call(d, { postIds: ["a"], language: "en" }, "")).code === 401);
  t("H1 bad token -> 401", (await call(d, { postIds: ["a"], language: "en" }, "nope")).code === 401);
  const bad = [{ postIds: ["a"], language: "fr" }, { postIds: ["a"], language: "ja" }, { postIds: [], language: "en" }, { postIds: "a", language: "en" }, { postIds: Array.from({ length: 11 }, (_, i) => "p" + i), language: "en" }, { postIds: ["a/b"], language: "en" }, { postIds: [12], language: "en" }, { postIds: ["x".repeat(101)], language: "en" }];
  let all400 = true; for (const b of bad) if ((await call(d, b)).code !== 400) all400 = false;
  t("H1 invalid language / ids / count (>10) -> 400, no OpenAI", all400 && c.calls === 0);
  const r = await call(deps(db, c, { rateLimit: async () => false }), { postIds: ["a"], language: "en" });
  t("H1 rate limited -> 429, no OpenAI", r.code === 429 && r.body.rateLimited === true && c.calls === 0);
  t("H1 no-store cache header", r.headers["Cache-Control"] === "no-store");
}
// ---------- H2: translate, cache, list ----------
{
  const m = makeDb(); const c = { calls: 0, items: 0, batches: [] };
  m.seed("imadakePosts", "p1", post("p1")); m.seed("imadakePosts", "p2", post("p2", { headline: "焼きたてパン" }));
  const d = deps(m.db, c);
  let r = await call(d, { postIds: ["p1", "p2", "p1"], language: "en" });
  t("H2 untranslated -> one OpenAI batch with both posts", c.calls === 1 && JSON.stringify(c.batches[0]) === JSON.stringify(["p1", "p2"]), c.batches);
  t("H2 response has translations for both", r.code === 200 && r.body.translations.p1 && r.body.translations.p2 && r.body.pending.length === 0 && r.body.limited === false, r.body);
  t("H2 response contains only headline+excerpt", JSON.stringify(Object.keys(r.body.translations.p1).sort()) === '["excerpt","headline"]' && !JSON.stringify(r.body).includes("席はあと3席"));
  t("H2 stored ready entry with hash, budget 2", card(m.store, "p1").status === "ready" && card(m.store, "p1").sourceHash === IM.computeImadakeCardSourceHash(IM.getImadakeCardSource(m.store.get("imadakePosts/p1").data)) && budget(m.store, DAY()) === 2);
  r = await call(d, { postIds: ["p1", "p2"], language: "en" });
  t("H2 cached -> no OpenAI call, budget unchanged, served from cache", c.calls === 1 && budget(m.store, DAY()) === 2 && r.body.translations.p1.headline === card(m.store, "p1").headline);
  const listCard = IM.buildImadakeCardPost("p1", m.store.get("imadakePosts/p1").data, 1.2);
  t("H2 list card gets cardTranslations.en (cache, no extra read)", listCard.cardTranslations.en && listCard.cardTranslations.en.headline === card(m.store, "p1").headline && listCard.headline === "本日限定ランチ1,200円");
  // source change -> old translation not used
  m.store.get("imadakePosts/p1").data.headline = "本日限定ランチ1,200円（変更）";
  t("H2 source changed -> list does not use old translation", JSON.stringify(IM.buildImadakeCardPost("p1", m.store.get("imadakePosts/p1").data, 1).cardTranslations) === "{}");
  r = await call(d, { postIds: ["p1"], language: "en" });
  t("H2 source changed -> regenerated (new OpenAI call, budget 3)", c.calls === 2 && budget(m.store, DAY()) === 3 && card(m.store, "p1").status === "ready", { calls: c.calls, b: budget(m.store, DAY()) });
  const writes = new Set(m.writeLog.map((w) => w.path.split("/")[0] + ":" + w.keys.join(",")));
  t("H2 writes limited to translations.en.card and the day budget", [...writes].every((w) => w === "imadakePosts:translations.en.card" || w.startsWith("imadakeTranslationBudgets:")), [...writes]);
}
// ---------- H3: not translated (en source, unpublished, expired, missing) ----------
{
  const m = makeDb(); const c = { calls: 0, items: 0, batches: [] };
  m.seed("imadakePosts", "en1", post("en1", { sourceLanguage: "en", headline: "Fresh bread" }));
  ["pending", "rejected", "ended", "withdrawn", "removed", "expired"].forEach((s) => m.seed("imadakePosts", "st_" + s, post("x", { status: s })));
  m.seed("imadakePosts", "old", post("old", { expiresAt: clock - 1 }));
  const r = await call(deps(m.db, c), { postIds: ["en1", "st_pending", "st_rejected", "st_ended", "st_withdrawn", "st_removed", "st_expired", "old", "missing"], language: "en" });
  t("H3 en-source / non-public / expired / missing -> not translated, no budget", r.code === 200 && Object.keys(r.body.translations).length === 0 && c.calls === 0 && budget(m.store, DAY()) === 0, r.body);
  t("H3 en-source list card has no cardTranslations", JSON.stringify(IM.buildImadakeCardPost("en1", m.store.get("imadakePosts/en1").data, 1).cardTranslations) === "{}");
}
// ---------- H4: concurrent requests for the same post ----------
{
  const m = makeDb(); const c = { calls: 0, items: 0, batches: [] };
  m.seed("imadakePosts", "p1", post("p1"));
  const d = deps(m.db, c, { delayMs: 30 });
  const rs = await Promise.all(Array.from({ length: 6 }, () => call(d, { postIds: ["p1"], language: "en" })));
  const got = rs.filter((r) => r.body.translations.p1).length, pend = rs.filter((r) => r.body.pending.includes("p1")).length;
  t("H4 6 simultaneous requests -> OpenAI called once, budget 1", c.calls === 1 && budget(m.store, DAY()) === 1, { calls: c.calls, b: budget(m.store, DAY()), conflicts: m.stats().conflicts });
  t("H4 others get pending (or ready), never a second generation", got + pend === 6 && got >= 1, { got, pend });
}
// ---------- H5: daily limit 100 under concurrency ----------
{
  const m = makeDb(); const c = { calls: 0, items: 0, batches: [] };
  m.seed("imadakeTranslationBudgets", DAY(), { dayKey: DAY(), count: 99, limit: 100 });
  for (let i = 0; i < 12; i++) m.seed("imadakePosts", "q" + i, post("q" + i, { headline: "限定" + i }));
  const d = deps(m.db, c, { delayMs: 10 });
  const rs = await Promise.all([call(d, { postIds: ["q0", "q1", "q2"], language: "en" }), call(d, { postIds: ["q3", "q4"], language: "en" }), call(d, { postIds: ["q5"], language: "en" }), call(d, { postIds: ["q6", "q7", "q8", "q9"], language: "en" })]);
  const translated = rs.reduce((n, r) => n + Object.keys(r.body.translations).length, 0);
  t("H5 from 99, 4 concurrent requests (10 posts) -> exactly 1 new translation, budget 100", budget(m.store, DAY()) === 100 && c.items === 1 && translated === 1, { budget: budget(m.store, DAY()), items: c.items, translated, conflicts: m.stats().conflicts });
  t("H5 the rest report limited and stay untranslated", rs.filter((r) => r.body.limited).length >= 3);
  const r2 = await call(d, { postIds: ["q10", "q11"], language: "en" });
  t("H5 at 100 -> limited, no OpenAI call", r2.body.limited === true && c.items === 1 && budget(m.store, DAY()) === 100);
  const cachedId = Object.keys(rs.find((r) => Object.keys(r.body.translations).length).body.translations)[0];
  const r3 = await call(d, { postIds: [cachedId], language: "en" });
  t("H5 cached translation still served at the limit (not counted)", r3.body.translations[cachedId] && budget(m.store, DAY()) === 100);
  // JST day boundary
  const before = clock; clock = Date.parse("2026-10-13T15:00:00Z");
  const r4 = await call(d, { postIds: ["q10"], language: "en" });
  t("H5 next JST day -> new budget doc, translation allowed", r4.body.translations.q10 && budget(m.store, "2026-10-14") === 1 && budget(m.store, "2026-10-13") === 100, { day14: budget(m.store, "2026-10-14") });
  clock = Date.parse("2026-10-13T14:59:59Z");
  const r5 = await call(d, { postIds: ["q11"], language: "en" });
  t("H5 one second before JST midnight still counts as the full day", r5.body.limited === true && !r5.body.translations.q11);
  clock = before;
}
// ---------- H6: failures, retry delays, give-up; budget not refunded ----------
{
  const m = makeDb(); const c = { calls: 0, items: 0, batches: [] };
  m.seed("imadakePosts", "f1", post("f1"));
  const d = deps(m.db, c, { throwError: true });
  const start = clock;
  let r = await quietErrors(() => call(d, { postIds: ["f1"], language: "en" }));
  t("H6 1st failure -> original kept (no translation), error, retry in 10 min, budget 1", !r.body.translations.f1 && card(m.store, "f1").status === "error" && card(m.store, "f1").errorCount === 1 && card(m.store, "f1").retryAfter.toMillis() === start + 10 * 60e3 && budget(m.store, DAY()) === 1);
  r = await quietErrors(() => call(d, { postIds: ["f1"], language: "en" }));
  t("H6 immediate retry -> waiting, no OpenAI call, no budget", c.calls === 1 && budget(m.store, DAY()) === 1);
  clock = start + 10 * 60e3 + 1;
  await quietErrors(() => call(d, { postIds: ["f1"], language: "en" }));
  t("H6 after 10 min -> 2nd attempt, fails, retry in 1 h, budget 2", c.calls === 2 && card(m.store, "f1").errorCount === 2 && card(m.store, "f1").retryAfter.toMillis() === clock + 60 * 60e3 && budget(m.store, DAY()) === 2);
  clock += 30 * 60e3; await quietErrors(() => call(d, { postIds: ["f1"], language: "en" }));
  t("H6 30 min later -> still waiting", c.calls === 2);
  clock += 31 * 60e3; await quietErrors(() => call(d, { postIds: ["f1"], language: "en" }));
  t("H6 3rd failure -> failed (auto retry stopped), budget 3", c.calls === 3 && card(m.store, "f1").status === "failed" && budget(m.store, DAY()) === 3);
  clock += 5 * H; await quietErrors(() => call(d, { postIds: ["f1"], language: "en" }));
  t("H6 after giving up -> never called again (same source)", c.calls === 3 && budget(m.store, DAY()) === 3);
  clock = start;
  // digits mismatch counts as failure
  const m2 = makeDb(); const c2 = { calls: 0, items: 0, batches: [] }; m2.seed("imadakePosts", "d1", post("d1"));
  const r2 = await quietErrors(() => call(deps(m2.db, c2, { badDigits: true }), { postIds: ["d1"], language: "en" }));
  t("H6 digits mismatch -> treated as failure, not shown", !r2.body.translations.d1 && card(m2.store, "d1").status === "error" && card(m2.store, "d1").lastErrorReason === "digits_mismatch");
  // count mismatch / missing item from model
  const m3 = makeDb(); const c3 = { calls: 0 }; m3.seed("imadakePosts", "e1", post("e1")); m3.seed("imadakePosts", "e2", post("e2", { headline: "別" }));
  const r3 = await quietErrors(() => call(deps(m3.db, c3, { translator: async (items) => { c3.calls++; return { byId: { e1: { headline: "EN 1,200", excerpt: "EN 3 21:00" } }, usage: null, estimatedCostUsd: null }; } }), { postIds: ["e1", "e2"], language: "en" }));
  t("H6 model omits one item -> that one fails, the other is saved", r3.body.translations.e1 && !r3.body.translations.e2 && card(m3.store, "e2").status === "error");
}
// ---------- H7: stale generating (crash/timeout) counted, bounded ----------
{
  const m = makeDb(); const c = { calls: 0, items: 0, batches: [] };
  const p = post("g1"); const hash = IM.computeImadakeCardSourceHash(IM.getImadakeCardSource(p));
  p.translations = { en: { card: { status: "generating", sourceHash: hash, claimId: "dead", generatingStartedAt: TS(clock - 30e3), errorCount: 0 } } };
  m.seed("imadakePosts", "g1", p);
  const d = deps(m.db, c, { throwError: true });
  let r = await quietErrors(() => call(d, { postIds: ["g1"], language: "en" }));
  t("H7 generating < 60s -> pending, no call, no budget", r.body.pending.includes("g1") && c.calls === 0 && budget(m.store, DAY()) === 0);
  clock += 31e3;
  await quietErrors(() => call(d, { postIds: ["g1"], language: "en" }));
  t("H7 stale (>60s) -> counted as a failure, new attempt consumes 1 slot", c.calls === 1 && card(m.store, "g1").errorCount === 2 && budget(m.store, DAY()) === 1, card(m.store, "g1"));
  // simulate a crash after claim: put generating again (stale) with errorCount 2
  const cur = m.store.get("imadakePosts/g1"); cur.data.translations.en.card = { status: "generating", sourceHash: hash, claimId: "dead2", generatingStartedAt: TS(clock - 61e3), errorCount: 2 };
  await quietErrors(() => call(d, { postIds: ["g1"], language: "en" }));
  t("H7 stale with 2 failures -> marked failed without calling OpenAI or using budget", c.calls === 1 && card(m.store, "g1").status === "failed" && budget(m.store, DAY()) === 1, card(m.store, "g1"));
  // late save from an old claim must not overwrite
  const m2 = makeDb(); const c2 = { calls: 0, items: 0, batches: [] }; m2.seed("imadakePosts", "g2", post("g2"));
  const r2 = await quietErrors(() => call(deps(m2.db, c2, { onCall: async () => { const cc = m2.store.get("imadakePosts/g2"); cc.data.translations.en.card.claimId = "someone-else"; cc.version++; } }), { postIds: ["g2"], language: "en" }));
  t("H7 result for a claim that is no longer ours is discarded", !r2.body.translations.g2 && card(m2.store, "g2").claimId === "someone-else");
}
// ---------- H8: post ended / expired / edited during translation ----------
{
  for (const [label, mutate] of [["ended", (d) => { d.status = "ended"; }], ["expired", (d) => { d.expiresAt = TS(clock - 1); }], ["edited", (d) => { d.headline = "別の見出し"; }]]) {
    const m = makeDb(); const c = { calls: 0, items: 0, batches: [] }; m.seed("imadakePosts", "x1", post("x1"));
    const r = await quietErrors(() => call(deps(m.db, c, { onCall: async () => { const cc = m.store.get("imadakePosts/x1"); mutate(cc.data); cc.version++; } }), { postIds: ["x1"], language: "en" }));
    t(`H8 post ${label} while translating -> result not saved/returned`, !r.body.translations.x1 && card(m.store, "x1").status !== "ready", card(m.store, "x1"));
  }
}
// ---------- H9: output token cap & finish_reason "length" (real call function, fetch mocked; no network) ----------
{
  const realFetch = globalThis.fetch;
  const sent = [];
  let mode = "stop";
  process.env.OPENAI_API_KEY = "test-key-not-real";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body); sent.push({ url, body });
    const items = JSON.parse(body.messages[1].content).items;
    const content = JSON.stringify({ items: items.map((i) => ({ id: i.id, headline: "EN " + (i.headline.match(/[\d,:]+/g) || []).join(" "), excerpt: "EN " + (i.excerpt.match(/[\d,:]+/g) || []).join(" ") })) });
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: mode, message: { content } }], usage: { prompt_tokens: 400, completion_tokens: 80 } }) };
  };
  try {
    const items = [{ id: "a", headline: "ランチ1,200円", excerpt: "残り3席" }];
    const ok = await TR.callOpenAiImadakeCardTranslation(items, "en");
    const b = sent[0].body;
    t("H9 request: max_completion_tokens 2000, model gpt-4o-mini, JSON mode, OpenAI endpoint", b.max_completion_tokens === 2000 && TR.IMADAKE_CARD_TRANSLATION_MAX_OUTPUT_TOKENS === 2000 && b.model === "gpt-4o-mini" && b.response_format.type === "json_object" && sent[0].url === "https://api.openai.com/v1/chat/completions", b);
    t("H9 finish_reason stop -> translated, estimated cost from usage", ok.byId.a && Math.abs(ok.estimatedCostUsd - (400 * 0.15 + 80 * 0.6) / 1e6) < 1e-12, ok);
    mode = "length";
    let err = null; try { await TR.callOpenAiImadakeCardTranslation(items, "en"); } catch (e) { err = e; }
    t("H9 finish_reason length -> throws output_truncated (even if JSON looks complete)", err && err.reason === "output_truncated");
    // end-to-end through the handler
    const m = makeDb(); const c = { calls: 0, items: 0, batches: [] };
    m.seed("imadakePosts", "t1", post("t1"));
    const d = { ...deps(m.db, c), translateCards: TR.callOpenAiImadakeCardTranslation };
    const before = sent.length;
    const r = await quietErrors(() => call(d, { postIds: ["t1"], language: "en" }));
    t("H9 truncated -> no translation returned or saved, failure recorded (output_truncated)", !r.body.translations.t1 && card(m.store, "t1").status === "error" && card(m.store, "t1").lastErrorReason === "output_truncated" && !("headline" in card(m.store, "t1")), card(m.store, "t1"));
    t("H9 truncated -> slot consumed (not refunded), retry waits 10 min", budget(m.store, DAY()) === 1 && card(m.store, "t1").errorCount === 1 && card(m.store, "t1").retryAfter.toMillis() === clock + 10 * 60e3);
    await quietErrors(() => call(d, { postIds: ["t1"], language: "en" }));
    t("H9 immediate retry -> no OpenAI request, no slot", sent.length === before + 1 && budget(m.store, DAY()) === 1);
    // limit kept with truncation at 99
    const m2 = makeDb(); m2.seed("imadakeTranslationBudgets", DAY(), { dayKey: DAY(), count: 99, limit: 100 });
    m2.seed("imadakePosts", "u1", post("u1")); m2.seed("imadakePosts", "u2", post("u2", { headline: "別" }));
    const d2 = { ...deps(m2.db, c), translateCards: TR.callOpenAiImadakeCardTranslation };
    const s0 = sent.length;
    const r2 = await quietErrors(() => call(d2, { postIds: ["u1", "u2"], language: "en" }));
    t("H9 at 99 with truncation -> 1 slot used (100), other limited, nothing saved as ready", budget(m2.store, DAY()) === 100 && r2.body.limited === true && sent.length === s0 + 1 && JSON.parse(sent[sent.length - 1].body.messages[1].content).items.length === 1 && card(m2.store, "u1").status === "error", { b: budget(m2.store, DAY()), limited: r2.body.limited });
    const s1 = sent.length;
    await quietErrors(() => call(d2, { postIds: ["u2"], language: "en" }));
    t("H9 after reaching 100 -> no OpenAI request", sent.length === s1 && budget(m2.store, DAY()) === 100);
  } finally {
    globalThis.fetch = realFetch; delete process.env.OPENAI_API_KEY;
  }
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
