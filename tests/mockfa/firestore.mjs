// In-memory Firestore subset for the board handlers.
const SENT = Symbol("serverTimestamp");
export class Timestamp { constructor(ms) { this.ms = ms; } toMillis() { return this.ms; } toDate() { return new Date(this.ms); } static fromMillis(ms) { return new Timestamp(ms); } static now() { return new Timestamp(Date.now()); } }
export const FieldValue = { serverTimestamp: () => ({ [SENT]: "ts" }), increment: (n) => ({ [SENT]: "inc", n }), delete: () => ({ [SENT]: "del" }), arrayUnion: (...v) => ({ [SENT]: "union", v }) };
export const FieldPath = { documentId: () => "__name__" };
const S = globalThis.__MOCK_DB = globalThis.__MOCK_DB || { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const resolve = (data, prev = {}) => { const out = { ...prev }; for (const [k, v] of Object.entries(data)) { if (v && v[SENT] === "ts") out[k] = Timestamp.now(); else if (v && v[SENT] === "inc") out[k] = (prev[k] || 0) + v.n; else if (v && v[SENT] === "del") delete out[k]; else if (v && v[SENT] === "union") out[k] = [...new Set([...(prev[k] || []), ...v.v])]; else out[k] = v; } return out; };
const snap = (col, id) => { const d = S.docs.get(col + "/" + id); return { id, exists: !!d, ref: ref(col, id), data: () => (d ? { ...d } : undefined), get: (f) => (d ? d[f] : undefined) }; };
const write = (col, id, data, merge) => { const p = col + "/" + id; S.docs.set(p, resolve(data, merge ? S.docs.get(p) || {} : {})); S.writes.push(p); };
function ref(col, id) { return { id, path: col + "/" + id, collection: (sub) => coll(col + "/" + id + "/" + sub), get: async () => snap(col, id), set: async (d, o) => write(col, id, d, o && o.merge), update: async (d) => { if (!S.docs.has(col + "/" + id)) throw new Error("NOT_FOUND"); write(col, id, d, true); }, delete: async () => { S.docs.delete(col + "/" + id); S.writes.push("delete:" + col + "/" + id); } }; }
function query(col, filters = [], order = [], lim = Infinity, after = null) {
  const q = { where: (f, op, v) => query(col, [...filters, [f, op, v]], order, lim, after), orderBy: (f, dir = "asc") => query(col, filters, [...order, [f, dir]], lim, after), limit: (n) => query(col, filters, order, n, after), startAfter: (...v) => query(col, filters, order, lim, v),
    get: async () => {
      if (globalThis.__QUERY_FAIL === col) throw new Error("UNAVAILABLE (simulated query failure)");
      let rows = [...S.docs.keys()].filter((k) => k.startsWith(col + "/") && !k.slice(col.length + 1).includes("/")).map((k) => ({ id: k.slice(col.length + 1), d: S.docs.get(k) }));
      const val = (r, f) => (f === "__name__" ? r.id : r.d[f]); const cmp = (a) => (a && a.toMillis ? a.toMillis() : a);
      rows = rows.filter((r) => filters.every(([f, op, v]) => { const x = cmp(val(r, f)), y = cmp(v); return op === "==" ? x === y : op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : op === ">=" ? x >= y : op === "in" ? v.includes(x) : op === "array-contains" ? (x || []).includes(v) : false; }));
      for (const [f, dir] of [...order].reverse()) rows.sort((a, b) => { const x = cmp(val(a, f)), y = cmp(val(b, f)); return (x < y ? -1 : x > y ? 1 : 0) * (dir === "desc" ? -1 : 1); });
      if (after && after.length) { const cur = after[0]; if (typeof cur === "string") { rows = rows.filter((r) => r.id > cur); } else { const idx = cur && typeof cur.id === "string" ? rows.findIndex((r) => r.id === cur.id) : -1; if (idx >= 0) rows = rows.slice(idx + 1); } }
      rows = rows.slice(0, lim);
      return { empty: rows.length === 0, size: rows.length, docs: rows.map((r) => snap(col, r.id)) };
    } };
  q.count = () => ({ get: async () => { const res = await q.get(); return { data: () => ({ count: res.size }) }; } });
  return q;
}
function coll(col) { return { doc: (id) => ref(col, id || "auto" + ++S.seq), add: async (d) => { if (S.failAddFor === col) throw new Error("PERMISSION_DENIED (simulated)"); const id = "auto" + ++S.seq; write(col, id, d); return ref(col, id); }, ...query(col) }; }
export function getFirestore() { return { collection: coll, getAll: async (...refs) => refs.map((r) => r.get()), runTransaction: async (fn) => { const pending = []; const tx = { get: async (r) => (r.get ? r.get() : r), set: (r, d, o) => pending.push(() => write(r.path.split("/")[0], r.id, d, o && o.merge)), update: (r, d) => pending.push(() => write(r.path.split("/")[0], r.id, d, true)), delete: (r) => pending.push(() => S.docs.delete(r.path)) }; const res = await fn(tx); pending.forEach((f) => f()); return res; }, batch: () => { const p = []; return { set: (r, d, o) => p.push(() => write(r.path.split("/")[0], r.id, d, o && o.merge)), update: (r, d) => p.push(() => write(r.path.split("/")[0], r.id, d, true)), delete: (r) => p.push(() => S.docs.delete(r.path)), commit: async () => p.forEach((f) => f()) }; } }; }
