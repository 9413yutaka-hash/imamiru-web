const TS = (ms) => ({ toMillis: () => ms });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * 4);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));

function makeDb(o = {}) {
  const store = new Map(); const writeLog = []; let failCommit = o.failCommit || 0, failTx = o.failTx || false; const failGets = o.failGets || new Set();
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
        if (!ok) continue; writes.forEach(apply); return result;
      }
      throw new Error("contention");
    }
  };
  return { db, store, writeLog, failGets, seed: (col, id, data) => store.set(col + "/" + id, { data: clone(data), version: 1 }), get: (col, id) => (store.get(col + "/" + id) || {}).data, count: (col) => [...store.keys()].filter((k) => k.startsWith(col + "/")).length };
}
export { TS, makeDb };
