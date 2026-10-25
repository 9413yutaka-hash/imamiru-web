// STEP 4-B: store results report UI on imadake-post.html (headless Chrome) + REAL report handler / store auth
// (imadake-cv-report.js, verifyImadakeStoreActor, checkStoreProfileEditor) on an in-memory Firestore mock.
// The store login (named Firebase app) is faked in the browser. No production access, no writes.
import { REPO_ROOT, TEST_DIR, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
import { makeQueryDb, seed, deps, R, IM, post, TS, J } from "./reportfixtures.mjs";
const REPO = REPO_ROOT + "";
const SP = TEST_DIR + "";
const ORIGIN = process.env.ORIGIN || "http://127.0.0.1:8701";
let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 500) : ""}`); };

const m = makeQueryDb(); seed(m);
// a store with a post but no CVs
m.seed("storeAccounts", "S0", { storeName: "CVなし店", registrationStatus: "active", enabled: true });
m.seed("storeMembers", "S0_u0", { storeId: "S0", uid: "u0", role: "owner", status: "active" });
m.seed("imadakePosts", "Z", post("S0", { headline: "Z 閲覧なし", pub: "2026-10-14 09:00" }));
const be = { reportFail: false, reportNetFail: false, reqs: [] };
const mkRes = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } });
const lower = (h) => Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k.toLowerCase(), v]));
async function apiMock(url, method, log, postData, headers) {
  if (method !== "POST" || !url.includes("/api/moderate-submission")) return null;
  let body = {}; try { body = JSON.parse(postData || "{}"); } catch {}
  const request = { headers: lower(headers), body };
  be.reqs.push({ mode: body.mode, storeId: body.storeId, token: body.token ? "set" : "", auth: request.headers.authorization || "" });
  const d = deps(m);
  if (body.mode === "imadakeStoreStatus") {
    // same store check as the real status API (verifyImadakeStoreActor), minimal status body
    const v = await IM.verifyImadakeStoreActor(request, body, m.db, d);
    if (!v.valid) return { status: v.status, body: { success: false, message: v.message } };
    return { body: { success: true, storeName: v.storeName, location: { prefecture: "沖縄県", city: "那覇市" }, currentPost: null } };
  }
  if (body.mode === "imadakeStoreCvReport") {
    if (be.reportNetFail) return { fail: true };
    if (be.reportFail) return { status: 500, body: { success: false, message: "成果レポートを取得できませんでした。" } };
    const res = mkRes(); const e = console.error; console.error = () => {};
    try { await R.handleImadakeStoreCvReport(request, res, d); } finally { console.error = e; }
    return { status: res.code, body: res.body };
  }
  return { status: 400, body: { success: false } };
}
// fake store login on the named app "machinauStoreAccount" (null = not logged in)
const fakeLogin = (token) => `(() => { let real; Object.defineProperty(window, 'firebase', { configurable: true, get(){ return real; }, set(v){ real = v; if (!v || v.__patched) return; const init = v.initializeApp.bind(v); v.initializeApp = function(opts, name){ if (name === 'machinauStoreAccount') { return { name, auth(){ return { onAuthStateChanged(cb){ setTimeout(() => cb(${token ? `{ isAnonymous:false, getIdToken: async () => ${JSON.stringify(token)} }` : "null"}), 0); return function(){}; } }; } }; } return init(opts, name); }; v.__patched = true; } }); })();`;
const server = process.env.ORIGIN ? null : await serve(REPO, 8701);
const browser = await launchChrome();
async function page(path, o = {}) {
  const p = await openPage(browser, { origin: ORIGIN, width: o.width || 390, mobile: !o.width, state: { apiMock, initScripts: [fakeLogin(o.login === undefined ? null : o.login), `try{ localStorage.setItem('machinauLanguage', ${JSON.stringify(o.lang || "ja")}); }catch(e){}`] } });
  await p.goto(path);
  await p.waitFor("document.getElementById('loadingPanel').hidden === true", 15000);
  await sleep(o.settle ?? 700);
  return p;
}
const reportText = (p) => p.ev("(document.getElementById('reportContent')||{}).innerText||''");
const cards = (p) => p.ev("[...document.querySelectorAll('#reportContent .report-card')].map(c=>({kind:c.className.replace('report-card ',''), label:c.querySelector('.report-card-label').textContent, value:c.querySelector('.report-card-value').textContent, note:(c.querySelector('.report-card-note')||{}).textContent||''}))");
const tabs = (p) => p.ev("[...document.querySelectorAll('#reportContent [data-report-month]')].map(b=>({m:b.dataset.reportMonth, label:b.textContent, on:b.getAttribute('aria-pressed')}))");
const postsShown = (p) => p.ev("[...document.querySelectorAll('#reportContent .report-post')].map(d=>({id:d.dataset.reportPostId, title:d.querySelector('.report-post-title').textContent, status:d.querySelector('.report-status').textContent, meta:d.querySelector('.report-post-meta').innerText, rows:[...d.querySelectorAll('.report-day-row:not(.head)')].map(r=>[...r.children].map(c=>c.textContent))}))");
const clickTab = (p, mo) => p.ev(`document.querySelector('#reportContent [data-report-month="${mo}"]').click(); true`);
async function finish(p, label) {
  const errs = [...new Set(p.log.errors)];
  t(`${label}: JS errors 0, no horizontal scroll`, errs.length === 0 && (await p.ev("document.documentElement.scrollWidth <= window.innerWidth + 1")), { errs });
  await p.close();
}
const PRIVACY = /trav[A-E]|\bu1\b|store_owner_view|本人の閲覧\s*\d|本文（レポートには返さない）/;

try {
  // 1. owner, mobile, Japanese
  let p = await page("/imadake-post.html?store=S1", { login: "owner-u1" });
  t("1 logged-in owner: store panel + report panel shown, existing post form still shown", await p.ev("!document.getElementById('storePanel').hidden && !document.getElementById('reportPanel').hidden && !document.getElementById('postForm').hidden && document.querySelectorAll('#categoryChips .chip').length > 0"));
  const rr = be.reqs.filter((r) => r.mode === "imadakeStoreCvReport").at(-1);
  t("1 report requested with the store login token (no store token)", rr && rr.auth === "Bearer owner-u1" && rr.storeId === "S1" && rr.token === "", rr);
  let txt = await reportText(p);
  t("1 billing-paused message shown exactly", txt.includes("現在は課金停止中です。料金は発生しません。"), txt.slice(0, 200));
  let tb = await tabs(p);
  t("3 month tabs: 2026年8月 / 9月 / 10月, current month selected", JSON.stringify(tb.map((x) => [x.label, x.on])) === JSON.stringify([["2026年8月", "false"], ["2026年9月", "false"], ["2026年10月", "true"]]), tb);
  let c = await cards(p);
  t("4 October cards: 有効CV 4件 / 実際の請求額 0円 (paused note) / 有料運用時の料金目安 300円 (not a charge)", c.length === 3 && c[0].label === "有効CV件数" && c[0].value === "4件" && c[1].label === "実際の請求額" && c[1].value === "0円" && /請求はありません/.test(c[1].note) && c[2].label === "有料運用時の料金目安" && c[2].value === "300円" && /請求額ではありません/.test(c[2].note), c);
  t("4 actual charge and estimate are separate cards (different styles)", c[1].kind === "actual" && c[2].kind === "reference");
  let ps = await postsShown(p);
  t("5 October posts: A (live), F, B (ended); not C (Aug/Sep only), not other stores", JSON.stringify(ps.map((x) => x.id)) === JSON.stringify(["A", "F", "B"]), ps.map((x) => x.id));
  const A = ps[0];
  t("5 post A spans two days: 10/13 2件 0円 100円, 10/14 1件 0円 100円; status 掲載中", JSON.stringify(A.rows) === JSON.stringify([["10/13", "2件", "0円", "100円"], ["10/14", "1件", "0円", "100円"]]) && A.status === "掲載中", A);
  t("5 post B ended with 0 CVs: 0件 / 0円 row, status 掲載終了", JSON.stringify(ps[2].rows) === JSON.stringify([["10/10", "0件", "0円", "0円"]]) && ps[2].status === "掲載終了", ps[2]);
  await p.ev("document.querySelector('#reportContent .report-post').open = true; true"); await sleep(150);
  t("5 breakdown opens (details) with live period", /掲載期間：/.test(await p.ev("document.querySelector('#reportContent .report-post .report-period').textContent")));
  await clickTab(p, "2026-08"); await sleep(150); c = await cards(p); ps = await postsShown(p);
  t("6 August: expired post C still reported (8/31 1件 100円), cards 1件/0円/100円", JSON.stringify(ps.map((x) => [x.id, x.status, x.rows])) === JSON.stringify([["C", "掲載期間終了", [["8/31", "1件", "0円", "100円"]]]]) && c[0].value === "1件" && c[1].value === "0円" && c[2].value === "100円", { ps, c });
  await clickTab(p, "2026-09"); await sleep(150); ps = await postsShown(p);
  t("6 September: C's second day 9/1 2件 100円 (two CVs, still 100円)", JSON.stringify(ps[0].rows) === JSON.stringify([["9/1", "2件", "0円", "100円"]]), ps);
  txt = await p.ev("document.body.innerText");
  t("privacy: no traveler uid / owner uid / owner-view count / post body on the page", !PRIVACY.test(txt));
  t("notes: valid CV definition + JST + as-of time", /初めて押した件数/.test(txt) && /日本時間/.test(txt) && /集計時点：/.test(txt));
  await p.screenshot(`${SHOTS_DIR}/report-mobile-ja.png`, "#reportPanel");
  await finish(p, "1 mobile ja");

  // English + desktop
  p = await page("/imadake-post.html?store=S1", { login: "owner-u1", lang: "en", width: 1280 });
  c = await cards(p); tb = await tabs(p); txt = await reportText(p);
  t("EN: billing paused message, tabs, cards in English (¥0 actual, ¥300 estimate)", txt.includes("Billing is currently paused. No fees are charged.") && JSON.stringify(tb.map((x) => x.label)) === JSON.stringify(["Aug 2026", "Sep 2026", "Oct 2026"]) && c[0].label === "Valid CVs" && c[0].value === "4" && c[1].label === "Actual charges" && c[1].value === "¥0" && c[2].label === "Estimated fee if billing were active" && c[2].value === "¥300", { c, tb });
  t("PC: summary cards in 3 columns", await p.ev("getComputedStyle(document.querySelector('.report-summary')).gridTemplateColumns.split(' ').length === 3"));
  await p.ev("document.querySelector('#languageSwitch [data-language=\"ja\"]').click(); true"); await sleep(150);
  t("page language switch (header) JA re-renders the report in Japanese and saves the setting", (await cards(p))[1].value === "0円" && (await p.ev("localStorage.getItem('machinauLanguage')")) === "ja");
  await p.ev("document.querySelector('#languageSwitch [data-language=\"en\"]').click(); true");
  await p.screenshot(`${SHOTS_DIR}/report-pc-en.png`, "#reportPanel");
  await finish(p, "PC en");
  p = await page("/imadake-post.html?store=S1", { login: "owner-u1" });
  t("mobile: summary cards in 1 column", await p.ev("getComputedStyle(document.querySelector('.report-summary')).gridTemplateColumns.split(' ').length === 1"));
  await finish(p, "mobile layout");

  // CV 0 store
  p = await page("/imadake-post.html?store=S0", { login: "owner-u0" });
  c = await cards(p); ps = await postsShown(p);
  t("CV 0: 0件 / 0円 / 0円 and the post listed with 0件", c[0].value === "0件" && c[1].value === "0円" && c[2].value === "0円" && ps.length === 1 && JSON.stringify(ps[0].rows) === JSON.stringify([["10/14", "0件", "0円", "0円"]]), { c, ps });
  await clickTab(p, "2026-08"); await sleep(150);
  t("month without posts: 'この月に掲載された今だけ投稿はありません。'", (await reportText(p)).includes("この月に掲載された今だけ投稿はありません。"));
  await finish(p, "CV0");

  // other store
  const before = be.reqs.filter((r) => r.mode === "imadakeStoreCvReport").length;
  p = await page("/imadake-post.html?store=S1", { login: "owner-u2" });
  t("other store's owner opening S1: denied panel, report hidden, no report request", await p.ev("!document.getElementById('storeDeniedPanel').hidden && document.getElementById('reportPanel').hidden") && be.reqs.filter((r) => r.mode === "imadakeStoreCvReport").length === before);
  txt = await p.ev("document.body.innerText");
  t("other store: none of S1's headlines on the page", !/A 掲載中|B 終了|C 期限切れ/.test(txt));
  await finish(p, "other store");
  // direct API call by S2's owner for S1 (report endpoint itself)
  {
    const res = mkRes(); await R.handleImadakeStoreCvReport({ headers: { authorization: "Bearer owner-u2" }, body: { mode: "imadakeStoreCvReport", storeId: "S1" } }, res, deps(m));
    t("API: S2's owner asking for S1 directly -> 403", res.code === 403 && !res.body.posts);
  }

  // not logged in
  const before2 = be.reqs.length;
  p = await page("/imadake-post.html?store=S1", { login: null });
  t("not logged in: login-required panel, report hidden, no API calls", await p.ev("!document.getElementById('loginRequiredPanel').hidden && document.getElementById('reportPanel').hidden") && be.reqs.length === before2);
  await finish(p, "logged out");

  // old token URL (STEP 43-B: method A removed) — no report, no API call
  const beforeLegacy = be.reqs.length;
  p = await page("/imadake-post.html?store=LEG&token=secret", { login: null });
  t("old token URL: invalid panel, report hidden, no API calls", await p.ev("!document.getElementById('invalidPanel').hidden && document.getElementById('reportPanel').hidden") && be.reqs.length === beforeLegacy, be.reqs.slice(beforeLegacy));
  await finish(p, "legacy");

  // API errors
  be.reportFail = true;
  p = await page("/imadake-post.html?store=S1", { login: "owner-u1" });
  txt = await reportText(p);
  t("API 500: error message + retry, NO numbers (no 0件/0円, no cards, no tabs)", txt.includes("成果レポートを取得できませんでした。") && !/\d+件|\d+円/.test(txt) && (await cards(p)).length === 0 && (await tabs(p)).length === 0 && (await p.ev("!!document.querySelector('#reportContent .report-retry')")), txt);
  t("API 500: the rest of the page still works (store panel + post form)", await p.ev("!document.getElementById('storePanel').hidden && !document.getElementById('postForm').hidden"));
  be.reportFail = false;
  await p.ev("document.querySelector('#reportContent .report-retry').click(); true"); await p.waitFor("document.querySelectorAll('#reportContent .report-card').length===3", 5000);
  t("retry after recovery: report shown", (await cards(p))[0].value === "4件");
  await finish(p, "api 500");
  be.reportNetFail = true;
  p = await page("/imadake-post.html?store=S1", { login: "owner-u1" });
  txt = await reportText(p);
  t("network failure: error message, no numbers", txt.includes("成果レポートを取得できませんでした。") && !/\d+件|\d+円/.test(txt));
  be.reportNetFail = false;
  await finish(p, "network fail");

  t("read-only: nothing written to the mock Firestore", m.writeLog.length === 0);
} catch (e) { console.log("ERROR", e); fail++; }
finally { console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`); process.exit(0); }
