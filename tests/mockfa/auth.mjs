export const TOKENS = globalThis.__MOCK_TOKENS = globalThis.__MOCK_TOKENS || {};
export function getAuth() { return { verifyIdToken: async (t) => { const u = TOKENS[t]; if (!u) throw new Error("bad token"); return u; } }; }
