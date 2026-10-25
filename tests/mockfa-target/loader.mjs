// Like mockfa-occ, but firebase-admin/app starts with NO initialized app (so getFirebaseAdminApp really runs),
// and every initializeApp / getFirestore / collection call is counted (to prove "stopped before Firestore access").
const base = new URL("./", import.meta.url);
export async function resolve(spec, ctx, next) { const m = spec.match(/^firebase-admin\/(app|auth|firestore)$/); if (m) return { url: new URL(m[1] + ".mjs", base).href, shortCircuit: true }; return next(spec, ctx); }
