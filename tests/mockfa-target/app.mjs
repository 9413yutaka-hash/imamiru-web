const C = globalThis.__FB_ACCESS = globalThis.__FB_ACCESS || { inits: [], firestore: 0, collections: 0 };
const apps = globalThis.__MOCK_APPS = globalThis.__MOCK_APPS || [];
export function getApps() { return apps; }
export function initializeApp(options) { const projectId = options && options.credential && options.credential.project_id; C.inits.push(projectId || ""); const a = { name: "mock", projectId }; apps.push(a); return a; }
export function cert(x) { return x; }
