// STEP 48-E (代表決定 B案): the production GA4 tag (G-PGM7GNVQX8) loads only on the production hosts
// (machinau.jp, imamiru-web.vercel.app). On Preview (*.vercel.app deployments) and localhost, index.html does not load
// gtag.js and does not define gtag, so no event reaches the production GA4 property. The page itself keeps working.
// 1. static check of index.html  2. the inline loader run in node with each hostname  3. real index.html in headless Chrome
// on 127.0.0.1 (a non-production host, like Preview) with every /api request answered locally.
// run: node tests/preview-analytics-test.mjs
import { REPO_ROOT } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const PORT = 8731;
const ORIGIN = "http://127.0.0.1:" + PORT;
const GA_ID = "G-PGM7GNVQX8";
const GA_SRC = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok && d !== "" ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };

// ---------- 1. static ----------
const html = readFileSync(REPO_ROOT + "/index.html", "utf8");
const head = html.slice(0, html.indexOf("</head>"));
t("1 index.html: no unconditional <script src> for gtag.js (the static async tag is gone)", !/<script[^>]*src="https:\/\/www\.googletagmanager\.com/i.test(html), head.slice(0, 400));
t("1 index.html: gtag.js URL appears once, inside the host-gated loader, same measurement ID", html.split(GA_SRC).length === 2 && html.split(`gtag("config", "${GA_ID}")`).length === 2);
const loaderMatch = head.match(/<script>\s*(\(function \(\) \{\s*if \(location\.hostname !== "machinau\.jp" && location\.hostname !== "imamiru-web\.vercel\.app"\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/);
t("1 index.html: the loader returns early unless the host is machinau.jp or imamiru-web.vercel.app (same rule as the article page and the board)", !!loaderMatch, head.slice(0, 600));
const board = readFileSync(REPO_ROOT + "/community-board-post.html", "utf8");
const boardLoader = (board.match(/<script>\s*(\(function \(\) \{\s*if \(location\.hostname[\s\S]*?\}\)\(\);)\s*<\/script>/) || [])[1];
t("1 index.html loader is the same code as the community board page (already used in production)", loaderMatch && boardLoader && loaderMatch[1].replace(/\s+/g, " ") === boardLoader.replace(/\s+/g, " "));

// ---------- 2. run the loader per hostname ----------
function runLoader(hostname) {
  const appended = [];
  const ctx = { location: { hostname }, document: { createElement: (tag) => ({ tag }), head: { appendChild: (el) => appended.push(el) } }, Date };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(loaderMatch[1], ctx);
  return { appended, gtag: typeof ctx.gtag, dataLayer: ctx.dataLayer ? ctx.dataLayer.map((a) => Array.from(a)) : null };
}
for (const host of ["machinau.jp", "imamiru-web.vercel.app"]) {
  const r = runLoader(host);
  t(`2 production host ${host}: loads gtag.js (async) once, defines gtag, sends js + config ${GA_ID} as before`, r.appended.length === 1 && r.appended[0].tag === "script" && r.appended[0].src === GA_SRC && r.appended[0].async === true && r.gtag === "function" && r.dataLayer.length === 2 && r.dataLayer[0][0] === "js" && r.dataLayer[1][0] === "config" && r.dataLayer[1][1] === GA_ID, r);
}
for (const host of ["imamiru-kasyg0ohu-9413yutaka-hashs-projects.vercel.app", "imamiru-git-preview-stripe-card-setup-9413yutaka-hashs-projects.vercel.app", "localhost", "127.0.0.1", "www.machinau.jp.evil.example", "machinau.jp.vercel.app"]) {
  const r = runLoader(host);
  t(`2 non-production host ${host}: no gtag.js, no gtag, no dataLayer`, r.appended.length === 0 && r.gtag === "undefined" && r.dataLayer === null, r);
}

// ---------- 3. real page in headless Chrome on a non-production host ----------
const api = async (url, method) => {
  const u = new URL(url);
  if (u.pathname !== "/api/moderate-submission") return { status: 404, body: { success: false } };
  const mode = u.searchParams.get("mode") || "";
  if (method === "GET" && mode === "firebaseTarget") return { body: { success: true, projectId: "machinau-preview", enforced: true } };
  if (method === "GET" && mode === "") return { body: { success: true, submissions: [] } };
  return { body: { success: true, posts: [], profiles: [], columns: [], comments: [] } };
};
const server = await serve(REPO_ROOT + "", PORT);
const browser = await launchChrome();
try {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, articles: [] } });
  await p.goto("/");
  await p.waitFor(`document.readyState === "complete"`, 20000);
  await sleep(2500);
  const s = await p.ev(`({
    gtag: typeof gtag,
    dataLayer: typeof dataLayer,
    gaScripts: [...document.scripts].filter((x) => /googletagmanager/.test(x.src)).length,
    gaRequests: performance.getEntriesByType("resource").filter((e) => /googletagmanager|google-analytics/.test(e.name)).length,
    firebaseReady: !!(window.machinauFirebaseTarget && window.machinauFirebaseTarget.ok && window.machinauDb),
    title: document.title,
    hasMap: !!document.querySelector(".map-section"),
    hasImadakeModal: !!document.getElementById("imadakeDetailModal")
  })`);
  t("3 Preview-like host: gtag is not defined, no dataLayer, no gtag.js script, no request to Google Analytics", s.gtag === "undefined" && s.dataLayer === "undefined" && s.gaScripts === 0 && s.gaRequests === 0 && (p.log.ga || []).length === 0, s);
  // (127.0.0.1 uses the local static config in firebase.js; the Preview host → machinau-preview rule is covered by firebase-target-test)
  t("3 the page still works without gtag: Firebase initialized, title, map section, 今だけ投稿 modal present", s.firebaseReady && /マチナウ/.test(s.title) && s.hasMap && s.hasImadakeModal, s);
  const r = await p.ev(`(() => { try { sendMachinauAnalyticsEvent("test_event", { a: 1 }); return "ok"; } catch (e) { return "threw " + e.message; } })()`);
  t("3 analytics helper without gtag: does nothing and does not throw (CV / posting code paths call it)", r === "ok", r);
  const errors = [...new Set(p.log.errors)].filter((e) => !/RefererNotAllowedMapError|Google Maps|anonymous auth failed|Failed to load resource/.test(e));
  t("3 no JS errors on the page", errors.length === 0, errors);
  await p.close();
} finally {
  try { await browser.close(); } catch {}
  try { server.close(); } catch {}
}

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
