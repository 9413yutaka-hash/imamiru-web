// STEP 3 client tests: original first, swap to English when the translation arrives (mocked APIs).
import { REPO_ROOT, TEST_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
import { readFileSync } from "node:fs";
const SP = TEST_DIR + "";
const ORIGIN = "http://127.0.0.1:8701";
const ARTICLES = JSON.parse(readFileSync(SP + "/columns.json", "utf8")).articles;
const only = process.argv[2] || "";
const results = [];
const t = (name, pass, detail = "") => { results.push(!!pass); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail !== "" ? " :: " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300) : ""}`); };
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const IMG = "https://res.cloudinary.com/cdhyctnp/image/upload/v1791695969/machinau_submissions/b6yoin9ypyv4pbfkvq8r.jpg";
const card = (id, o = {}) => ({ postId: id, storeName: "店" + id, categoryCode: "restaurant", headline: "限定ランチ " + id, excerpt: "本日だけのメニューです " + id, excerptTruncated: false, sourceLanguage: o.sourceLanguage || "ja", imageUrl: IMG, imageCount: 1, liveState: null, availableUntil: "", publishedAt: iso(-3600e3), expiresAt: iso(5 * 3600e3), distanceKm: 1, cardTranslations: o.cardTranslations || {} });
const EN = (id) => ({ headline: "Limited lunch " + id, excerpt: "Today's special menu " + id });
const A = { lat: 26.2124, lng: 127.6792, key: "26.212,127.679" };
const B = { lat: 35.6812, lng: 139.7671, key: "35.681,139.767" };

function mock(sc) {
  return async (url, method, log, postData) => {
    const u = new URL(url); const mode = u.searchParams.get("mode");
    if (method === "GET" && mode === "imadakePostsNearby") { const k = u.searchParams.get("latitude") + "," + u.searchParams.get("longitude"); const e = sc.lists[k] || { posts: [] }; return { delayMs: e.delayMs || 0, body: { success: true, radiusKm: 15, posts: JSON.parse(JSON.stringify(e.posts)) } }; }
    if (method === "GET" && mode === "publicListPublishedColumns") return { body: { success: true, articles: ARTICLES } };
    if (method === "POST") {
      let body = {}; try { body = JSON.parse(postData || "{}"); } catch {}
      if (body.mode === "imadakeCardTranslationGet") {
        log.tr = (log.tr || []).concat([{ ids: body.postIds, language: body.language }]);
        const n = log.tr.length; const resp = typeof sc.translate === "function" ? sc.translate(body, n) : null;
        if (!resp) { const translations = {}; body.postIds.forEach((id) => { translations[id] = EN(id); }); return { delayMs: sc.delayMs || 300, body: { success: true, translations, pending: [], limited: false } }; }
        return resp;
      }
    }
    return null;
  };
}
const server = await serve(REPO_ROOT + "", 8701);
const browser = await launchChrome();
async function page(sc, lang = "en") {
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: mock(sc), initScripts: [`try{ if (window.top === window && !sessionStorage.getItem('__langSeeded')) { sessionStorage.setItem('__langSeeded','1'); localStorage.setItem('machinauLanguage', ${JSON.stringify(lang)}); } }catch(e){}`] } });
  await p.goto("/"); await p.waitFor("typeof shops!=='undefined' && shops.length>0");
  await p.ev("getAnonymousIdTokenForLocationCollection = async function(){ return 'test-anon-token'; }; true");
  return p;
}
const cards = (p) => p.ev(`[...document.querySelectorAll('#imadakeCardList .imadake-card')].map(c=>({id:c.dataset.imadakePostId, title:c.querySelector('.imadake-card-title').textContent, titleLang:c.querySelector('.imadake-card-title').getAttribute('lang'), excerpt:(c.querySelector('.imadake-card-excerpt')||{}).textContent, note:(c.querySelector('.imadake-original-note')||{}).textContent||'', toggle:(c.querySelector('.imadake-translation-toggle')||{}).textContent||'', store:c.querySelector('.imadake-card-store').textContent}))`);
const loc = (p, L) => p.ev(`applyUserLocation(${L.lat}, ${L.lng}, null); true`);
const finish = async (p, label) => { const errs = [...new Set(p.log.errors)].filter((e) => !/RefererNotAllowedMapError/.test(e)); t(`${label}: JS errors 0, no GA/other POST`, errs.length === 0 && p.log.posts.every((m) => m === "shopTranslationGet" || m === "columnArticleTranslationGet") , { errs, posts: p.log.posts }); await p.close(); };

try {
if (!only || only === "1") {
  const sc = { lists: { [A.key]: { posts: [card("p1"), card("p2")] } }, delayMs: 1200 };
  const p = await page(sc, "en");
  await loc(p, A); await p.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===2", 8000);
  let c = await cards(p);
  t("1 original shown immediately (before translation arrives)", c[0].title === "限定ランチ p1" && c[0].titleLang === "ja" && c[0].note.startsWith("Shown as written by the shop"), c[0]);
  await sleep(300);
  t("1 translation requested once for visible posts (en)", JSON.stringify(p.log.tr) === JSON.stringify([{ ids: ["p1", "p2"], language: "en" }]), p.log.tr);
  await sleep(1300); c = await cards(p);
  t("1 after arrival: title & excerpt switched to English, lang=en", c[0].title === "Limited lunch p1" && c[0].excerpt === "Today's special menu p1" && c[0].titleLang === "en" && c[1].title === "Limited lunch p2", c);
  t("1 'Automatically translated' + 'See original'; store name stays original", c[0].note.startsWith("Automatically translated") && c[0].toggle === "See original" && c[0].store === "店p1", c[0]);
  await p.ev("document.querySelector('#imadakeCardList .imadake-translation-toggle').click(); true"); await sleep(200); c = await cards(p);
  t("1 'See original' shows the original + 'See translation'", c[0].title === "限定ランチ p1" && c[0].toggle === "See translation" && c[1].title === "Limited lunch p2", c.slice(0, 2));
  await p.ev("document.querySelector('#imadakeCardList .imadake-translation-toggle').click(); true"); await sleep(200);
  t("1 'See translation' switches back", (await cards(p))[0].title === "Limited lunch p1");
  await p.ev("switchMachinauLanguage('ja'); true"); await sleep(300); c = await cards(p);
  t("1 back to Japanese -> original, no auto-translated label", c[0].title === "限定ランチ p1" && c[0].note === "" && c[0].toggle === "", c[0]);
  await p.ev("switchMachinauLanguage('en'); true"); await sleep(300);
  t("1 English again -> translation reused (no new request)", (await cards(p))[0].title === "Limited lunch p1" && p.log.tr.length === 1);
  await finish(p, "1");
}
if (!only || only === "2") {
  const sc = { lists: { [A.key]: { posts: [card("c1", { cardTranslations: { en: EN("c1") } }), card("c2", { sourceLanguage: "en" })] } } };
  const p = await page(sc, "en");
  await loc(p, A); await p.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===2", 8000); await sleep(800);
  const c = await cards(p);
  t("2 cached translation in list -> English from the start, no translation request", c[0].title === "Limited lunch c1" && !(p.log.tr || []).length, { c0: c[0], tr: p.log.tr });
  t("2 English-source post: original, no request, no note", c[1].title === "限定ランチ c2" && c[1].note === "", c[1]);
  await finish(p, "2");
  const q = await page(sc, "ja");
  await loc(q, A); await q.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===2", 8000); await sleep(800);
  t("2 Japanese view: original even if a translation exists; no request", (await cards(q))[0].title === "限定ランチ c1" && !(q.log.tr || []).length);
  await q.ev("switchMachinauLanguage('en'); true"); await sleep(400);
  t("2 switch to English -> cached translation shown at once", (await cards(q))[0].title === "Limited lunch c1" && !(q.log.tr || []).length);
  await finish(q, "2b");
}
if (!only || only === "3") {
  for (const [label, resp] of [["HTTP 500", { status: 500, body: { success: false } }], ["limited", { body: { success: true, translations: {}, pending: [], limited: true } }], ["rate limited 429", { status: 429, body: { success: false, rateLimited: true } }]]) {
    const sc = { lists: { [A.key]: { posts: [card("f1"), card("f2")] } }, translate: () => resp };
    const p = await page(sc, "en");
    await loc(p, A); await p.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===2", 8000); await sleep(1500);
    await p.ev("renderImadakeSection(); renderImadakeSection(); true"); await sleep(500);
    const c = await cards(p);
    t(`3 ${label}: cards stay, original shown, not requested again`, c.length === 2 && c[0].title === "限定ランチ f1" && p.log.tr.length === 1, { n: c.length, tr: p.log.tr.length });
    await finish(p, "3-" + label);
  }
  // pending -> retried once
  const sc = { lists: { [A.key]: { posts: [card("g1")] } }, translate: (body, n) => ({ body: { success: true, translations: {}, pending: ["g1"], limited: false } }) };
  const p = await page(sc, "en");
  await loc(p, A); await p.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===1", 8000);
  await sleep(1000);
  t("3 pending: first request only (wait ~6s before retry)", p.log.tr.length === 1);
  await sleep(6500);
  t("3 pending: retried exactly once after ~6s", p.log.tr.length === 2, p.log.tr.length);
  await sleep(7000);
  t("3 pending twice: no further retries", p.log.tr.length === 2 && (await cards(p))[0].title === "限定ランチ g1", p.log.tr.length);
  await finish(p, "3-pending");
}
if (!only || only === "4") {
  // language switch while a translation is in flight: no wrong display, reused when back to English
  const sc = { lists: { [A.key]: { posts: [card("l1")] }, [B.key]: { posts: [card("b1")] } }, delayMs: 2000 };
  const p = await page(sc, "en");
  await loc(p, A); await p.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===1", 8000); await sleep(300);
  await p.ev("switchMachinauLanguage('ja'); true"); await sleep(2300);
  { const cc = await cards(p); t("4 response after switching to Japanese -> Japanese view keeps original", cc[0] && cc[0].title === "限定ランチ l1", { cc, tr: p.log.tr, lang: await p.ev("getCurrentMachinauLanguage()") }); }
  await p.ev("switchMachinauLanguage('en'); true"); await sleep(300);
  t("4 back to English -> the late translation is used, no new request", (await cards(p))[0].title === "Limited lunch l1" && p.log.tr.length === 1, p.log.tr);
  await finish(p, "4a");
  // location change while in flight: old posts' translations not shown on new cards; new cards get requested
  const sc2 = { lists: { [A.key]: { posts: [card("l1")] }, [B.key]: { posts: [card("b1")] } }, delayMs: 1500 };
  const q = await page(sc2, "en");
  await loc(q, A); await q.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===1", 8000); await sleep(200);
  await loc(q, B); await q.waitFor("document.querySelector('#imadakeCardList .imadake-card') && document.querySelector('#imadakeCardList .imadake-card').dataset.imadakePostId==='b1'", 8000);
  await sleep(1600);
  let c = await cards(q);
  t("4 location changed during translation: new card not given old post's translation", c.length === 1 && c[0].id === "b1", c);
  await sleep(1800); c = await cards(q);
  t("4 new location's card requested afterwards and translated", JSON.stringify(q.log.tr.map((x) => x.ids)) === JSON.stringify([["l1"], ["b1"]]) && c[0].title === "Limited lunch b1", { tr: q.log.tr, c });
  await finish(q, "4b");
}
if (!only || only === "5") {
  // XSS in translation is escaped; detail still original
  const sc = { lists: { [A.key]: { posts: [card("x1")] } }, translate: () => ({ body: { success: true, translations: { x1: { headline: "<img src=x onerror=window.__x=1>Hi", excerpt: "<b>bold</b>" } }, pending: [], limited: false } }) };
  const p = await page(sc, "en");
  await loc(p, A); await p.waitFor("document.querySelectorAll('#imadakeCardList .imadake-card').length===1", 8000); await sleep(1200);
  const c = await cards(p);
  t("5 translated text is escaped (no HTML injection)", c[0].title === "<img src=x onerror=window.__x=1>Hi" && c[0].excerpt === "<b>bold</b>" && !(await p.ev("window.__x===1")), c[0]);
  t("5 translation request is not GA/CV (no gtag/collect for it)", !(p.log.ga || []).some((e) => /imadake|translation/i.test(e)));
  await finish(p, "5");
}
} catch (e) { console.error("HARNESS ERROR", e.stack); }
console.log(`\nTOTAL ${results.length}  PASS ${results.filter(Boolean).length}  FAIL ${results.filter((x) => !x).length}`);
browser.close(); server.close(); process.exit(0);
