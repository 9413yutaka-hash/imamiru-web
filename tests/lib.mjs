// Local test harness: static server + headless Chrome over CDP with request interception.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

export function serve(root, port) {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(root, p));
    try { const body = await readFile(file); res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(body); }
    catch { res.writeHead(404, { "Content-Type": "text/html" }); res.end("<h1>404 local</h1>"); }
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

export async function launchChrome(port = 9400 + Math.floor(Math.random() * 500)) {
  const profile = mkdtempSync(join(tmpdir(), "mn-local-"));
  const proc = spawn((process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe"), ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(200); try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch {} }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); const handlers = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    const h = handlers.get(m.sessionId || ""); if (h) h(m);
  });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  return { send, handlers, close: () => { try { ws.close(); } catch {} proc.kill(); } };
}

// state: { articles, columnDelayMs, columnFail, storeProfiles, initScripts[] }
export async function openPage(browser, { origin, width = 1280, mobile = false, state = {}, contextId = null }) {
  const { send } = browser;
  const ownsContext = !contextId;
  const browserContextId = contextId || (await send("Target.createBrowserContext")).result.browserContextId;
  const { targetId } = (await send("Target.createTarget", { url: "about:blank", browserContextId })).result;
  const { sessionId } = (await send("Target.attachToTarget", { targetId, flatten: true })).result;
  const s = (method, params) => send(method, params, sessionId);
  const log = { errors: [], posts: [], blocked: [], ga: [], translationSlugs: [], columnListRequests: 0 };
  browser.handlers.set(sessionId, async (m) => {
    if (m.method === "Runtime.exceptionThrown") log.errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") log.errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 160));
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params; const url = request.url;
    const fulfill = (status, obj) => s("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(obj)).toString("base64") });
    const fail = () => s("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    try {
      if (state.blockUrls && state.blockUrls.some((p) => url.includes(p))) { log.blocked.push("test-block"); return fail(); }
      if (state.render && url.startsWith(origin + "/column/")) { const html = await state.render(url); if (html !== null) { log.articleRenders = (log.articleRenders || 0) + 1; return s("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }], body: Buffer.from(html).toString("base64") }); } }
      if (url.startsWith(origin + "/api/")) {
        if (state.apiMock) { const mocked = await state.apiMock(url, request.method, log, request.postData, request.headers || {}); if (mocked) { if (mocked.delayMs) await sleep(mocked.delayMs); if (mocked.fail) return fail(); return fulfill(mocked.status || 200, mocked.body); } }
        if (request.method === "GET" && url.includes("mode=publicListPublishedColumns")) {
          log.columnListRequests++;
          if (!state.articles) return s("Fetch.continueRequest", { requestId });
          if (state.columnDelayMs) await sleep(state.columnDelayMs);
          return state.columnFail ? fulfill(500, { success: false }) : fulfill(200, { success: true, articles: state.articles || [] });
        }
        if (request.method === "GET" && url.includes("mode=publicStoreProfiles") && state.storeProfiles) return fulfill(200, state.storeProfiles);
        if (request.method === "GET" && state.apiPassthrough) return s("Fetch.continueRequest", { requestId });
        if (request.method === "GET") {
          const r = await fetch("https://machinau.jp" + url.slice(origin.length));
          const body = Buffer.from(await r.arrayBuffer()).toString("base64");
          return s("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: [{ name: "Content-Type", value: r.headers.get("content-type") || "application/json" }], body });
        }
        let mode = ""; let parsed = {}; try { parsed = JSON.parse(request.postData || "{}"); mode = parsed.mode || ""; } catch {}
        log.posts.push(mode);
        if (mode === "columnArticleTranslationGet") log.translationSlugs.push(...(parsed.firestoreIds || []));
        return fulfill(200, { success: false, message: "blocked in local test" });
      }
      if (/vercel.live/.test(url)) { log.blocked.push("vercel-live"); return fail(); }
      if (/identitytoolkit\.googleapis|securetoken\.googleapis/.test(url)) { log.blocked.push("auth"); return fail(); }
      if (/google\.firestore\.v1\.Firestore\/Write|:commit|:batchWrite/.test(url)) { log.blocked.push("firestore-write"); return fail(); }
      if (/google-analytics\.com\/(g\/)?collect|googletagmanager\.com\/.*collect/.test(url)) { const en = [...(url + "\n" + (request.postData || "")).matchAll(/en=([^&\s]+)/g)].map((x) => x[1]); log.ga.push(...en); return fail(); }
      return s("Fetch.continueRequest", { requestId });
    } catch (e) { try { await s("Fetch.continueRequest", { requestId }); } catch {} }
  });
  await s("Runtime.enable"); await s("Page.enable");
  await s("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await s("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
  if (mobile) await s("Emulation.setTouchEmulationEnabled", { enabled: true });
  for (const src of state.initScripts || []) await s("Page.addScriptToEvaluateOnNewDocument", { source: src });
  const ev = async (expr) => { let r; for (let k = 0; k < 4; k++) { r = await s("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (!r.error) break; console.log("  [cdp error]", r.error.message, String(expr).slice(0, 60)); await sleep(700); } if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }; return r.result?.result?.value; };
  const waitFor = async (expr, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await ev(expr); if (v && !v.__error) return Date.now() - t; await sleep(150); } return -1; };
  const goto = async (path = "/") => { for (let attempt = 0; attempt < 4; attempt++) { await s("Page.navigate", { url: origin + path }); await waitFor("document.readyState!=='loading'"); await sleep(200); const href = await ev("location.href"); if (typeof href === "string" && !href.startsWith("chrome-error://")) { if (attempt > 0) log.navRetries = (log.navRetries || 0) + attempt; return; } await sleep(1000); } };
  const screenshot = async (file, clipSelector) => {
    let clip;
    if (clipSelector) { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(clipSelector)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,width:b.width,height:Math.min(b.height,2400)}})()`); if (r) clip = { ...r, scale: 1 }; }
    const r = await s("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, ...(clip ? { clip } : {}) });
    const { writeFile } = await import("node:fs/promises"); await writeFile(file, Buffer.from(r.result.data, "base64"));
  };
  const close = async () => { browser.handlers.delete(sessionId); await send("Target.closeTarget", { targetId }); if (ownsContext) await send("Target.disposeBrowserContext", { browserContextId }); };
  return { s, ev, waitFor, goto, screenshot, close, log, state, sessionId, browserContextId, send };
}
