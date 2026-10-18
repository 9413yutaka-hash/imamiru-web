const apps = [];
export function getApps() { return apps; }
export function initializeApp() { const a = { name: "mock" }; apps.push(a); return a; }
export function cert(x) { return x; }
apps.push({ name: "mock" });
