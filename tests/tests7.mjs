// 収益化 STEP 3 E2E: real app.js in headless Chrome + REAL server handlers (imadake-cv.js / imadake.js)
// running in node on an in-memory transactional Firestore mock. No production writes, no GA network.
import { REPO_ROOT, TEST_DIR, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
import { pathToFileURL } from "node:url";
import { TS, makeDb } from "./cvmock.mjs";
import { readFileSync } from "node:fs";
const ARTICLES = JSON.parse(readFileSync(TEST_DIR + "/columns.json", "utf8")).articles;
const REPO = REPO_ROOT + "";
const CV = await import(pathToFileURL(REPO + "/api/_lib/imadake-cv.js").href);
const IM = await import(pathToFileURL(REPO + "/api/_lib/imadake.js").href);
const ORIGIN = "http://127.0.0.1:8701";
const only = process.argv[2] || "";
let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 400) : ""}`); };
const H = 3600e3;
const BODY = (id) => "本文全文 " + id + "\n二行目まで全部読めます。";
const IMG = "https://res.cloudinary.com/cdhyctnp/image/upload/v1791695969/machinau_submissions/b6yoin9ypyv4pbfkvq8r.jpg";

// ---------- simulated backend ----------
const be = { m: makeDb(), clock: Date.now(), detail500: false, dropOnce: false, reqs: [] };
const now0 = Date.now();
function seedPost(id, o = {}) {
  be.m.seed("imadakePosts", id, { storeId: o.storeId || "S1", storeNameSnapshot: "店" + id, categoryCode: "restaurant", headline: "限定ランチ " + id, body: BODY(id), sourceLanguage: "ja", status: "published", publishedAt: TS(now0 - H), expiresAt: TS(o.expiresAt ?? now0 + 72 * H), latitude: 26.2, longitude: 127.6, imageUrls: [IMG], actionTargets: { websiteUrl: "https://example.com/" + id }, categoryFields: {}, priceText: "1,000円", paymentMethods: ["cash"], address: "那覇市", ...(o.billing ? { cvBillingEnabled: true } : {}) });
}
be.m.seed("storeAccounts", "S1", { storeName: "店1" }); be.m.seed("storeAccounts", "S2", { storeName: "店2" }); be.m.seed("storeAccounts", "TEST", { storeName: "テスト", isTestAccount: true });
be.m.seed("storeMembers", "S1_own1", { storeId: "S1", uid: "own1", role: "owner", status: "active" }); be.m.seed("storeMembers", "S2_own2", { storeId: "S2", uid: "own2", role: "owner", status: "active" });
seedPost("P1", { billing: true }); seedPost("P2", { billing: true }); seedPost("LEG", { storeId: "S2" }); seedPost("TP", { billing: true, storeId: "TEST" }); seedPost("EXPD", { billing: true, expiresAt: now0 - 1000 });
const LIST = ["P1", "P2", "LEG", "TP", "EXPD"];
const cardOf = (id) => ({ postId: id, storeName: "店" + id, categoryCode: "restaurant", headline: "限定ランチ " + id, excerpt: "本文全文 " + id + " 二行目まで…", excerptTruncated: true, sourceLanguage: "ja", imageUrl: IMG, imageCount: 1, liveState: null, availableUntil: "", publishedAt: new Date(now0 - H).toISOString(), expiresAt: new Date(now0 + 5 * H).toISOString(), distanceKm: 1, cardTranslations: {} });
const verifyIdToken = async (app, tok) => {
  let m;
  if ((m = /^tok-([A-Za-z0-9]+)$/.exec(tok))) return { uid: m[1], firebase: { sign_in_provider: "anonymous" } };
  if ((m = /^store-(own[0-9])$/.exec(tok))) return { uid: m[1], firebase: { sign_in_provider: "password" } };
  throw new Error("invalid token");
};
const deps = { getFirebaseAdminApp: () => ({}), getFirestore: () => be.m.db, verifyIdToken, readRequestBody: (r) => r.body, now: () => be.clock };
const mkRes = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } });
const lower = (h) => Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v]));
async function apiMock(url, method, log, postData, headers) {
  const u = new URL(url); const mode = u.searchParams.get("mode");
  if (method === "GET" && mode === "publicListPublishedColumns") return { body: { success: true, articles: ARTICLES } };
  if (method === "GET" && mode === "imadakePostsNearby") return { body: { success: true, radiusKm: 15, posts: LIST.map(cardOf) } };
  if (method === "GET" && mode === "imadakePostGet") { be.reqs.push({ mode, postId: u.searchParams.get("postId") }); const res = mkRes(); await IM.handleImadakePostGet({ query: Object.fromEntries(u.searchParams), headers: {} }, res, deps); return { status: res.code, body: res.body }; }
  if (method !== "POST") return null;
  let body = {}; try { body = JSON.parse(postData || "{}"); } catch {}
  const h = lower(headers);
  if (body.mode === "imadakeCardTranslationGet") { be.reqs.push({ mode: body.mode, postIds: body.postIds, language: body.language }); const translations = {}; body.postIds.forEach((id) => { translations[id] = { headline: "Limited lunch " + id, excerpt: "Full text " + id }; }); return { delayMs: 100, body: { success: true, translations, pending: [], limited: false } }; }
  if (body.mode === "imadakeDetailOpen") {
    be.reqs.push({ mode: body.mode, postId: body.postId, auth: h.authorization || "", store: h["x-machinau-store-authorization"] || "" });
    if (be.detail500) return { status: 500, body: { success: false, message: "x" } };
    const res = mkRes(); const e = console.error; console.error = () => {}; try { await CV.handleImadakeDetailOpen({ headers: h, body }, res, deps); } finally { console.error = e; }
    if (be.dropOnce) { be.dropOnce = false; return { fail: true }; }
    return { status: res.code, body: res.body };
  }
  if (body.mode === "imadakeViewedPosts") { be.reqs.push({ mode: body.mode, postIds: body.postIds, auth: h.authorization || "" }); const res = mkRes(); await CV.handleImadakeViewedPosts({ headers: h, body }, res, deps); return { status: res.code, body: res.body }; }
  return null;
}
const view = (pid, uid) => be.m.get("imadakeCvViews", pid + "_" + uid);
const day = () => CV.computeImadakeCvDayKey(be.clock);
const charge = (pid, d = day()) => be.m.get("imadakePostDailyCharges", pid + "_" + d);
const reqsOf = (mode) => be.reqs.filter((r) => r.mode === mode);

// ---------- browser ----------
const server = await serve(REPO, 8701);
const browser = await launchChrome();
const ctx = async () => (await browser.send("Target.createBrowserContext")).result.browserContextId;
async function page(uid, o = {}) {
  const lang = o.lang || "ja";
  const p = await openPage(browser, { origin: ORIGIN, width: o.width || 390, mobile: !o.width, contextId: o.contextId || null, state: { apiMock, initScripts: [`try{ if (window.top === window) { localStorage.setItem('machinauLanguage', ${JSON.stringify(lang)}); } }catch(e){}`] } });
  await p.goto("/"); await p.waitFor("typeof shops!=='undefined' && typeof openImadakeDetail==='function'");
  await p.ev(`window.__uid = ${JSON.stringify(uid)}; window.__ga = [];
    getAnonymousIdTokenForLocationCollection = async function(){ if (!window.__uid) throw new Error('anonymous auth failed (test)'); return 'tok-' + window.__uid; };
    getExistingTownNowIdToken = async function(){ return window.__uid ? 'tok-' + window.__uid : ''; };
    getCurrentImadakeTravelerUid = function(){ return window.__uid || ''; };
    sendMachinauAnalyticsEvent = function(n, p){ window.__ga.push([n, p]); };
    ${o.storeTok !== undefined ? `getImadakeStoreOwnerIdToken = async function(){ return ${JSON.stringify(o.storeTok)}; };` : ""}
    true`);
  await p.ev(`applyUserLocation(26.2124, 127.6792, null); true`);
  await p.waitFor(`document.querySelectorAll('#imadakeCardList .imadake-card').length===${o.expectCards || LIST.length}`, 10000);
  await sleep(o.settle ?? 600);
  return p;
}
const cards = (p) => p.ev(`Object.fromEntries([...document.querySelectorAll('#imadakeCardList .imadake-card')].map(c=>[c.dataset.imadakePostId,{button:!!c.querySelector('.imadake-read-more'), viewed:c.classList.contains('imadake-card-viewed'), full:(c.querySelector('.imadake-card-fulltext')||{}).textContent||'', excerpt:(c.querySelector('.imadake-card-excerpt')||{}).textContent||'', title:c.querySelector('.imadake-card-title').textContent, note:[...c.querySelectorAll('.imadake-original-note')].map(n=>n.textContent).join('|'), links:c.querySelectorAll('.imadake-action-link').length, rows:c.querySelectorAll('.imadake-detail-row').length}]))`);
async function openD(p, id) {
  const ok = await p.ev(`(()=>{const b=document.querySelector('#imadakeCardList .imadake-card[data-imadake-post-id="${id}"] .imadake-read-more'); if(!b) return false; b.click(); return true;})()`);
  if (!ok) return { clicked: false };
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state!=='loading'`, 8000); await sleep(250);
  return { clicked: true, ...(await detail(p)) };
}
const detail = (p) => p.ev(`({state: imadakeDetailState && imadakeDetailState.state, text:(document.querySelector('#imadakeDetailBody .imadake-detail-text')||{}).textContent||'', msg:(document.querySelector('#imadakeDetailBody .imadake-detail-message')||{}).textContent||'', retry:!!document.querySelector('#imadakeDetailBody .imadake-detail-retry'), bodyInDom: document.body.innerText.includes('二行目まで全部読めます')})`);
const closeD = (p) => p.ev("closeImadakeDetail(); true");
const ga = (p) => p.ev("window.__ga");
const ls = (p) => p.ev("localStorage.getItem('machinau_imadake_viewed_v1')");
async function finish(p, label) {
  const errs = [...new Set(p.log.errors)].filter((e) => !/RefererNotAllowedMapError|Google Maps|anonymous auth failed/.test(e));
  const ow = await p.ev("document.documentElement.scrollWidth <= window.innerWidth + 1");
  t(`${label}: JS errors 0, no horizontal scroll`, errs.length === 0 && ow, { errs });
  await p.close();
}

try {
  const cA = await ctx(), cB = await ctx(), cC = await ctx();
  // 1. A first time
  let p = await page("A", { contextId: cA });
  let c = await cards(p);
  t("1 A first: every card shows 続きを見る, excerpt only, no full text", LIST.every((id) => c[id].button && !c[id].viewed && c[id].full === "" && c[id].excerpt !== ""), c);
  t("1 A first: no viewed-check request (no local hint yet)", reqsOf("imadakeViewedPosts").length === 0);
  let d = await openD(p, "P1");
  t("1 A opens P1: detail shows the full body", d.state === "ready" && d.text === BODY("P1"), d);
  const r1 = reqsOf("imadakeDetailOpen").at(-1);
  t("1 request = POST imadakeDetailOpen with anonymous token (no store token when not logged in)", r1.postId === "P1" && r1.auth === "Bearer tok-A" && r1.store === "", r1);
  t("1 server: 1 CV for A×P1, charge P1 today = 100 JPY (count 1)", view("P1", "A")?.counted === true && charge("P1")?.validCvCount === 1 && charge("P1")?.amountJpy === 100);
  let g = await ga(p);
  t("7 GA4 imadake_first_view sent once with post_id/category (analytics only)", g.length === 1 && g[0][0] === "imadake_first_view" && g[0][1].post_id === "P1" && g[0][1].category_code === "restaurant", g);
  await closeD(p); await sleep(200); c = await cards(p);
  t("4 after closing: P1 card has no button and shows full body + detail rows/links; others unchanged", !c.P1.button && c.P1.viewed && c.P1.full === BODY("P1") && c.P1.links === 1 && c.P1.rows >= 1 && c.P2.button && c.LEG.button, c.P1);
  t("localStorage hint stored for uid A only", JSON.parse(await ls(p)).uid === "A" && JSON.parse(await ls(p)).postIds.includes("P1"));
  await finish(p, "1");

  // 2 / 3. B and C first time (A already viewed P1)
  for (const [uid, cx, n] of [["B", cB, 2], ["C", cC, 3]]) {
    p = await page(uid, { contextId: cx }); c = await cards(p);
    t(`${n === 2 ? 2 : 3} ${uid}: P1 still shows 続きを見る although A viewed it`, c.P1.button && !c.P1.viewed && c.P1.full === "", c.P1);
    d = await openD(p, "P1");
    t(`${n === 2 ? 2 : 3} ${uid} opens P1: full body, separate CV recorded`, d.text === BODY("P1") && view("P1", uid)?.counted === true);
    t(`${n === 2 ? 2 : 3} charge P1 today: count ${n}, still 100 JPY, one ledger doc`, charge("P1").validCvCount === n && charge("P1").amountJpy === 100 && be.m.count("imadakePostDailyCharges") === 1, charge("P1"));
    g = await ga(p); t(`${n === 2 ? 2 : 3} ${uid}: GA4 once`, g.length === 1, g);
    await finish(p, uid);
  }

  // 4. A second visit (same browser)
  const viewsBefore = be.m.count("imadakeCvViews"), detailBefore = reqsOf("imadakeDetailOpen").length;
  p = await page("A", { contextId: cA }); await p.waitFor(`document.querySelector('.imadake-card-viewed')`, 5000); c = await cards(p);
  const vr = reqsOf("imadakeViewedPosts").at(-1);
  t("4 A revisit: viewed check asks the server only for A's hinted posts", vr && JSON.stringify(vr.postIds) === JSON.stringify(["P1"]) && vr.auth === "Bearer tok-A", vr);
  t("4 A revisit: P1 shows full body from the start, no button; others still have the button", !c.P1.button && c.P1.full === BODY("P1") && c.P2.button && c.LEG.button, c);
  t("4 A revisit: no detailOpen call, no new CV, charge unchanged", reqsOf("imadakeDetailOpen").length === detailBefore && be.m.count("imadakeCvViews") === viewsBefore && charge("P1").validCvCount === 3);
  await finish(p, "4");

  // other uid in the same browser: B's hint must not be used for D
  p = await page("D", { contextId: cB }); c = await cards(p);
  t("5 new anonymous uid D in B's browser: P1 shows the button (B's local hint not used), no viewed check", c.P1.button && !c.P1.viewed && reqsOf("imadakeViewedPosts").filter((r) => r.auth === "Bearer tok-D").length === 0, c.P1);
  await finish(p, "D");

  // 5. date change, A without local hint (server is the source of truth)
  be.clock += 24 * H;
  p = await page("A", { contextId: cA }); await p.ev("localStorage.removeItem('machinau_imadake_viewed_v1'); true"); await p.close();
  p = await page("A", { contextId: cA }); c = await cards(p);
  t("5 next JST day, A's local hint cleared: P1 shows the button (unknown locally)", c.P1.button, c.P1);
  d = await openD(p, "P1");
  t("5 A reopens P1 next day: body shown, server says existing -> no new CV, no ledger for the new day", d.text === BODY("P1") && !charge("P1") && charge("P1", CV.computeImadakeCvDayKey(be.clock - 24 * H)).validCvCount === 3 && (await ga(p)).length === 0);
  await closeD(p); await sleep(200); c = await cards(p);
  t("5 card turns into the viewed display again (server confirmed)", !c.P1.button && c.P1.full === BODY("P1"));
  // 6. another post
  d = await openD(p, "P2");
  t("6 A opens P2: new CV + P2 ledger (100 JPY) for the new day", d.text === BODY("P2") && view("P2", "A")?.counted && charge("P2")?.amountJpy === 100 && charge("P2").validCvCount === 1);
  await closeD(p);
  // 8 / 9. existing (non-billable) and test-account posts
  d = await openD(p, "LEG"); await closeD(p);
  t("8 existing post (no cvBillingEnabled): body shown, CV recorded non-billable, no ledger", d.text === BODY("LEG") && view("LEG", "A")?.billable === false && view("LEG", "A")?.billingExcludedReason === "billing_not_enabled" && !charge("LEG"));
  d = await openD(p, "TP"); await closeD(p);
  t("9 test-account post: body shown, not billable, no ledger", d.text === BODY("TP") && view("TP", "A")?.billingExcludedReason === "test_account" && !charge("TP"));
  // 14. expired on the server
  d = await openD(p, "EXPD");
  t("14 expired post: 'ended' message, no body, no CV", d.state === "ended" && d.text === "" && !view("EXPD", "A"), d);
  await closeD(p); await sleep(200); c = await cards(p);
  t("14 expired card removed from the list", !c.EXPD);
  await finish(p, "5-14");

  // 10. store owner
  const cO = await ctx();
  p = await page("O", { contextId: cO, storeTok: "store-own1" });
  const p2before = charge("P2").validCvCount;
  d = await openD(p, "P2");
  const ro = reqsOf("imadakeDetailOpen").at(-1);
  t("10 owner (store login) opens own P2: store token sent in the dedicated header", ro.store === "Bearer store-own1" && ro.auth === "Bearer tok-O", ro);
  t("10 owner view: body shown, CV excluded (store_owner_view), ledger unchanged, no GA4", d.text === BODY("P2") && view("P2", "O")?.counted === false && view("P2", "O")?.excludedReason === "store_owner_view" && charge("P2").validCvCount === p2before && (await ga(p)).length === 0);
  await finish(p, "10a");
  p = await page("O2", { contextId: await ctx(), storeTok: "store-own2" });
  d = await openD(p, "P2");
  t("10 owner of ANOTHER store opening P2: counted as a normal CV", view("P2", "O2")?.counted === true && charge("P2").validCvCount === p2before + 1);
  await finish(p, "10b");
  p = await page("O3", { contextId: await ctx(), storeTok: "store-bad" });
  d = await openD(p, "P2");
  t("10 unverifiable store token: body shown, NOT recorded (not claimed as excluded), button stays", d.text === BODY("P2") && !view("P2", "O3") && charge("P2").validCvCount === p2before + 1);
  await closeD(p); c = await cards(p); t("10 unverifiable: card keeps 続きを見る", c.P2.button);
  await finish(p, "10c");
  // real store-token reader with no store login: returns "" and no store header
  p = await page("R", { contextId: await ctx() });
  const realTok = await p.ev("getImadakeStoreOwnerIdToken()");
  d = await openD(p, "LEG");
  t("10 real getImadakeStoreOwnerIdToken without store login -> '' and no store header", realTok === "" && reqsOf("imadakeDetailOpen").at(-1).store === "" && d.text === BODY("LEG"), realTok);
  await finish(p, "10d");

  // 11. anonymous auth failure
  p = await page("", { contextId: await ctx() });
  const v0 = be.m.count("imadakeCvViews");
  d = await openD(p, "P1");
  const ra = reqsOf("imadakeDetailOpen").at(-1);
  t("11 anonymous auth failed: request without Authorization, body still shown", ra.auth === "" && d.text === BODY("P1"), { ra, d });
  t("11 no CV / no charge change / no GA4", be.m.count("imadakeCvViews") === v0 && (await ga(p)).length === 0);
  await closeD(p); c = await cards(p); t("11 card keeps 続きを見る (not treated as viewed)", c.P1.button && !c.P1.viewed);
  await finish(p, "11");

  // 12. Firestore failure
  p = await page("F", { contextId: await ctx() });
  be.m.failGets.add("storeAccounts");
  d = await openD(p, "P1"); await closeD(p);
  be.m.failGets.delete("storeAccounts");
  t("12 Firestore read failure during checks: body shown, no CV, no charge", d.text === BODY("P1") && !view("P1", "F") && charge("P1", CV.computeImadakeCvDayKey(be.clock - 24 * H)).validCvCount === 3);
  be.detail500 = true;
  const getsBefore = reqsOf("imadakePostGet").length;
  d = await openD(p, "LEG");
  t("12 detailOpen 500 on a non-billable post: falls back to GET imadakePostGet and shows the body", d.text === BODY("LEG") && reqsOf("imadakePostGet").length === getsBefore + 1 && !view("LEG", "F"));
  await closeD(p);
  d = await openD(p, "P2");
  t("12 detailOpen 500 on a billable post: GET returns no body -> error + retry, body not in DOM", d.state === "error" && d.retry && !d.bodyInDom && d.text === "", d);
  be.detail500 = false;
  await p.ev("retryImadakeDetail(); true"); await p.waitFor("imadakeDetailState && imadakeDetailState.state==='ready'", 8000); d = await detail(p);
  t("12 retry after recovery: body shown and CV recorded once", d.text === BODY("P2") && view("P2", "F")?.counted === true);
  await closeD(p); await finish(p, "12");

  // 13. connection dropped after the server committed the CV
  p = await page("N", { contextId: await ctx() });
  const before13 = charge("P2").validCvCount;
  be.dropOnce = true;
  d = await openD(p, "P2");
  t("13 response lost after commit (billable): error + retry, no body via GET", d.state === "error" && d.retry && !d.bodyInDom, d);
  t("13 server had committed one CV", view("P2", "N")?.counted === true && charge("P2").validCvCount === before13 + 1);
  await p.ev("retryImadakeDetail(); true"); await p.waitFor("imadakeDetailState && imadakeDetailState.state==='ready'", 8000); d = await detail(p);
  t("13 retry: body shown, server 'existing' -> no duplicate CV, ledger unchanged", d.text === BODY("P2") && charge("P2").validCvCount === before13 + 1);
  await closeD(p); await sleep(200); c = await cards(p);
  t("13 card becomes viewed after the retry", !c.P2.button && c.P2.full === BODY("P2"));
  await finish(p, "13");

  // 15. English: card translation kept; viewed card shows translated title + original body
  p = await page("A", { contextId: cA, lang: "en", settle: 1500 }); await p.waitFor(`document.querySelector('.imadake-card-viewed')`, 5000); await sleep(400); c = await cards(p);
  const trq = reqsOf("imadakeCardTranslationGet").at(-1);
  t("15 English: card translation still requested for the visible cards and applied to every card", trq && trq.language === "en" && trq.postIds.length >= 4 && Object.values(c).every((x) => /^Limited lunch /.test(x.title)), { trq, titles: Object.values(c).map((x) => x.title) });
  t("15 English viewed card: translated title + 'shown as written' note + original full body", c.P1.title === "Limited lunch P1" && /Automatically translated/.test(c.P1.note) && /written by the shop/i.test(c.P1.note) && c.P1.full === BODY("P1"), c.P1);
  await finish(p, "15");

  // desktop layout
  p = await page("A", { contextId: cA, width: 1280 }); await p.waitFor(`document.querySelector('.imadake-card-viewed')`, 5000);
  await p.screenshot(SHOTS_DIR + "/step3-desktop.png", "#imadakeSection");
  await finish(p, "desktop");
  p = await page("A", { contextId: cA }); await p.waitFor(`document.querySelector('.imadake-card-viewed')`, 5000);
  await p.screenshot(SHOTS_DIR + "/step3-mobile.png", "#imadakeSection");
  await finish(p, "mobile");

  t("no writes outside imadakeCvViews / imadakePostDailyCharges", [...new Set(be.m.writeLog)].every((x) => x === "imadakeCvViews" || x === "imadakePostDailyCharges"), [...new Set(be.m.writeLog)]);
} catch (e) { console.log("ERROR", e); fail++; }
finally { console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`); await browser.close?.(); server.close?.(); process.exit(0); }
