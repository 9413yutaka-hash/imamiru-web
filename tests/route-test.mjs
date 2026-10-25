import { REPO_ROOT } from "./_paths.mjs";
import { pathToFileURL } from "node:url";
const M = await import(pathToFileURL(REPO_ROOT + "/api/moderate-submission.js").href);
let pass = 0, fail = 0; const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (!ok ? " :: " + JSON.stringify(d).slice(0, 300) : "")); };
async function call(method, query, body) {
  const res = { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.headers[k] = v; } };
  await M.default({ method, query, body: body || {}, headers: {} }, res);
  return res;
}
const r1 = await call("GET", { mode: "imadakePostsNearby", latitude: "abc", longitude: "1" });
t("GET imadakePostsNearby routed (400 for bad coords)", r1.code === 400 && /現在地/.test(r1.body.message), r1);
const r2 = await call("GET", { mode: "imadakePostsNearby" });
t("GET imadakePostsNearby without coords -> 400", r2.code === 400, r2);
const r3 = await call("GET", { mode: "imadakePostGet", postId: "" });
t("existing GET imadakePostGet still routed (400 for empty id)", r3.code === 400 && r3.body.message === "入力内容を確認してください。", r3);
const r4 = await call("GET", { mode: "townNowThreadsNearby", latitude: "x", longitude: "y" });
t("existing GET townNowThreadsNearby still routed (400)", r4.code === 400 && /現在地/.test(r4.body.message), r4);
const r5 = await call("POST", {}, { mode: "imadakeCardTranslationGet", postIds: ["a"], language: "en" });
t("POST imadakeCardTranslationGet routed (401 without token)", r5.code === 401 && /認証/.test(r5.body.message), r5);
const r6 = await call("POST", {}, { mode: "imadakeDetailOpen", postId: "a/b" });
t("POST imadakeDetailOpen routed (400 for invalid postId, before Firestore)", r6.code === 400 && r6.headers["Cache-Control"] === "no-store", r6);
const r7 = await call("POST", {}, { mode: "imadakeViewedPosts", postIds: "x" });
t("POST imadakeViewedPosts routed (400 for non-array, before Firestore)", r7.code === 400 && r7.headers["Cache-Control"] === "no-store", r7);
const r8 = await call("POST", {}, { mode: "imadakeStoreCvReport", storeId: "x" });
t("POST imadakeStoreCvReport routed (no-store, success:false without auth)", r8.headers["Cache-Control"] === "no-store" && r8.body && r8.body.success === false && !r8.body.posts, { code: r8.code, body: r8.body });
const r9 = await call("POST", {}, { mode: "imadakePostLocationUpdate", postId: "a/b" });
t("POST imadakePostLocationUpdate routed (400 for invalid postId, before Firestore)", r9.code === 400, r9);
console.log(`TOTAL ${pass + fail} PASS ${pass} FAIL ${fail}`);
process.exit(0);
