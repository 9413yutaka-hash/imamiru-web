// Imadake STEP 2 (TOP section + detail) local browser tests with mocked APIs.
import { REPO_ROOT, TEST_DIR, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const SP = TEST_DIR + "";
const ORIGIN = "http://127.0.0.1:8701";
const ARTICLES = JSON.parse(readFileSync(SP + "/columns.json", "utf8")).articles;
mkdirSync(SHOTS_DIR, { recursive: true });
const only = process.argv[2] || "";
const results = [];
const t = (name, pass, detail = "") => { results.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail !== "" ? " :: " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300) : ""}`); };

const H = 3600 * 1000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const IMG = "https://res.cloudinary.com/cdhyctnp/image/upload/v1791695969/machinau_submissions/b6yoin9ypyv4pbfkvq8r.jpg";
function card(id, o = {}) {
  return { postId: id, storeName: o.storeName ?? "カフェ" + id, categoryCode: o.categoryCode ?? "restaurant", headline: o.headline ?? "今日だけのランチ " + id,
    excerpt: o.excerpt ?? "本日限定のランチを用意しました。".repeat(4).slice(0, 80), excerptTruncated: o.excerptTruncated ?? true, sourceLanguage: o.sourceLanguage ?? "ja",
    imageUrl: o.imageUrl ?? IMG, imageCount: o.imageUrl === "" ? 0 : 2, liveState: o.liveState === undefined ? { type: "seats", status: "few", quantity: 3 } : o.liveState,
    availableUntil: o.availableUntil === undefined ? "21:00" : o.availableUntil, publishedAt: iso(-2 * H), expiresAt: o.expiresAt ?? iso(5 * H + 10 * 60000), distanceKm: o.distanceKm ?? 1.2 };
}
function detail(c, o = {}) {
  return { postId: c.postId, storeId: "store-" + c.postId, storeName: c.storeName, categoryCode: c.categoryCode, headline: c.headline,
    body: o.body ?? "本文1行目\n本文2行目\n\n" + "詳しい説明です。".repeat(20), sourceLanguage: c.sourceLanguage, imageUrls: o.imageUrls ?? [IMG, IMG],
    latitude: 26.2, longitude: 127.6, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", address: "沖縄県那覇市久茂地1-1", regionKey: "JP-47",
    actionTargets: o.actionTargets ?? { phone: "098-123-4567", reservationUrl: "https://example.com/reserve", websiteUrl: "javascript:alert(1)", socialUrl: "https://instagram.com/x" },
    categoryFields: o.categoryFields ?? { takeout: true, sameDayReservation: false }, liveState: c.liveState, availableUntil: c.availableUntil,
    priceText: "ランチ 1,200円", paymentMethods: ["cash", "qr"], publishedAt: c.publishedAt, expiresAt: o.expiresAt ?? c.expiresAt };
}

// scenario state: { lists: {"lat,lng": {posts, delayMs}}, details: {postId: {status, body}} }
function makeMock(sc) {
  return async (url, method, log) => {
    const u = new URL(url);
    const mode = u.searchParams.get("mode");
    if (mode === "imadakePostsNearby") {
      log.imadakeList = (log.imadakeList || []).concat([u.searchParams.get("latitude") + "," + u.searchParams.get("longitude")]);
      const key = u.searchParams.get("latitude") + "," + u.searchParams.get("longitude");
      const e = sc.lists[key] || { posts: [] };
      return { delayMs: e.delayMs || 0, status: 200, body: { success: true, radiusKm: 15, posts: e.posts } };
    }
    if (mode === "imadakePostGet") {
      const id = u.searchParams.get("postId");
      log.imadakeDetail = (log.imadakeDetail || []).concat([id]);
      const d = sc.details[id];
      if (!d) return { status: 404, body: { success: false, message: "この今だけ投稿は掲載されていません。" } };
      return { status: d.status || 200, delayMs: d.delayMs || 0, body: d.body };
    }
    if (mode === "publicListPublishedColumns") return { status: 200, body: { success: true, articles: ARTICLES } };
    return null;
  };
}
const A = { lat: 26.2124, lng: 127.6792, key: "26.212,127.679" };
const B = { lat: 35.6812, lng: 139.7671, key: "35.681,139.767" };

const server = await serve(REPO_ROOT + "", 8701);
const browser = await launchChrome();
async function page(sc, opts = {}) {
  const p = await openPage(browser, { origin: ORIGIN, width: opts.width || 1280, mobile: !!opts.mobile, state: { apiMock: makeMock(sc), initScripts: [`window.__gtagCalls=[]; Object.defineProperty(window,'gtag',{configurable:true,get(){return window.__g},set(f){window.__g=function(){window.__gtagCalls.push(String(arguments[1]||arguments[0])); return f.apply(this,arguments)}}});`] } });
  await p.send("Browser.grantPermissions", { origin: ORIGIN, permissions: ["geolocation"], browserContextId: p.browserContextId });
  return p;
}
async function setLocation(p, loc) {
  await p.s("Emulation.setGeolocationOverride", { latitude: loc.lat, longitude: loc.lng, accuracy: 20 });
  await p.ev("getLocation(); true");
}
const section = (p) => p.ev(`(()=>{const s=document.getElementById('imadakeSection'); const cards=[...document.querySelectorAll('#imadakeCardList .imadake-card')]; return {hidden:s.hidden, display:getComputedStyle(s).display, ids:cards.map(c=>c.dataset.imadakePostId), heading:document.getElementById('imadakeHeading').textContent, lead:document.querySelector('.imadake-lead').textContent}})()`);
const cardInfo = (p, i = 0) => p.ev(`(()=>{const c=document.querySelectorAll('#imadakeCardList .imadake-card')[${i}]; if(!c) return null; const q=(s)=>c.querySelector(s); return {pr:q('.imadake-pr-badge').textContent, store:q('.imadake-card-store').textContent, title:q('.imadake-card-title').textContent, excerpt:q('.imadake-card-excerpt')?q('.imadake-card-excerpt').textContent:null, chips:[...c.querySelectorAll('.imadake-chip')].map(e=>e.textContent), img:!!q('img'), emoji:q('.imadake-card-emoji')?q('.imadake-card-emoji').textContent:null, note:q('.imadake-original-note')?q('.imadake-original-note').textContent:null, btn:q('.imadake-read-more').textContent, btnH:q('.imadake-read-more').getBoundingClientRect().height, html:c.innerHTML}})()`);
const modal = (p) => p.ev(`(()=>{const m=document.getElementById('imadakeDetailModal'); const b=document.getElementById('imadakeDetailBody'); return {visible:m.classList.contains('visible'), text:b.innerText, imgs:b.querySelectorAll('.imadake-detail-images img').length, links:[...b.querySelectorAll('.imadake-action-link')].map(a=>a.getAttribute('href')+'|'+a.textContent), bodyOverflow:document.body.style.overflow, title:(document.getElementById('imadakeDetailTitle')||{}).textContent}})()`);
const finish = async (p, label) => { const errs = [...new Set(p.log.errors)].filter((e) => !/RefererNotAllowedMapError/.test(e)); t(`${label}: JS errors 0`, errs.length === 0, errs); t(`${label}: no GA4 / gtag calls from imadake; only POST = imadakeDetailOpen (STEP 3)`, !(await p.ev("window.__gtagCalls")).some((n) => /imadake/i.test(n)) && p.log.posts.every((m) => m === "imadakeDetailOpen"), { gtag: await p.ev("window.__gtagCalls"), posts: p.log.posts }); await p.close(); };
const settleScroll = async (p) => { let last = -1; for (let i = 0; i < 40; i++) { const y = await p.ev("scrollY"); if (y === last) break; last = y; await sleep(120); } };
async function tap(p, selector, mobile) {
  await settleScroll(p);
  const box = await p.ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'center', inline:'center', behavior:'instant'}); const b=e.getBoundingClientRect(); const x=b.left+b.width/2, y=b.top+b.height/2; const hit=document.elementFromPoint(x,y); return {x,y,ok:!!hit&&(hit===e||e.contains(hit))};})()`);
  if (!box) return false; await sleep(150);
  if (!box.ok) console.log("  [tap] covered", selector);
  if (mobile) { await p.s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] }); await p.s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); }
  else { await p.s("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 }); await p.s("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 }); }
  await sleep(400); return true;
}
const READY = "typeof shops!=='undefined' && shops.length>0";

try {
// ---- 1. before location / 0 posts ----
if (!only || only === "1") {
  const sc = { lists: { [A.key]: { posts: [] } }, details: {} };
  const p = await page(sc);
  await p.goto("/"); await p.waitFor(READY); await sleep(1500);
  let s = await section(p);
  t("1 before location: section hidden, no list request", s.hidden && s.display === "none" && !(p.log.imadakeList || []).length, { s, req: p.log.imadakeList });
  const order = await p.ev(`(()=>{const s=document.getElementById('imadakeSection'); const main=document.querySelector('main'); const a=document.getElementById('areaInfoSection'); return {prev:s.previousElementSibling&&s.previousElementSibling.id, next:s.nextElementSibling&&s.nextElementSibling.id, firstInMain: main.firstElementChild===s, mainPrevIsHero: !!(main.previousElementSibling && main.previousElementSibling.classList.contains('opening-visual')), areaNext: a.nextElementSibling&&a.nextElementSibling.id, hidden:s.hidden, display:getComputedStyle(s).display}})()`);
  t("1 placed right below the hero (first in <main>); 気になる情報を見る -> 今、近くで楽しめる場所 adjacent again", order.firstInMain && order.mainPrevIsHero && order.areaNext === "shopsSection", order);
  await setLocation(p, A); await p.waitFor("userLatitude!==null", 10000); await sleep(1500);
  s = await section(p);
  t("1 location known: request sent with 3-decimal coords", JSON.stringify(p.log.imadakeList) === JSON.stringify([A.key]), p.log.imadakeList);
  t("1 0 posts: section stays hidden", s.hidden && s.ids.length === 0, s);
  await finish(p, "1");
}
// ---- 2-4. display, no image/excerpt, expired, XSS ----
if (!only || only === "2") for (const W of [{ w: 390, m: true, tag: "390" }, { w: 1280, m: false, tag: "1280" }]) {
  const posts = [card("p1", { distanceKm: 0.4 }), card("p2", { imageUrl: "", excerpt: "", excerptTruncated: false, liveState: null, availableUntil: "", categoryCode: "event", storeName: '<img src=x onerror="window.__xss=1">店', headline: "<b>見出し</b>" }),
    card("pExpired", { expiresAt: iso(-60 * 1000) }), card("p3", { liveState: { type: "stock", status: "sold_out", quantity: 0 }, expiresAt: iso(30 * 60000), sourceLanguage: "en", headline: "Fresh bread", excerpt: "Baked this morning", excerptTruncated: false })];
  const sc = { lists: { [A.key]: { posts } }, details: {} };
  const p = await page(sc, { width: W.w, mobile: W.m });
  await p.goto("/"); await p.waitFor(READY);
  await setLocation(p, A); await p.waitFor("!document.getElementById('imadakeSection').hidden", 10000); await sleep(500);
  const s = await section(p);
  t(`[${W.tag}] 2 multiple posts shown in API order, expired one dropped`, !s.hidden && JSON.stringify(s.ids) === JSON.stringify(["p1", "p2", "p3"]), s.ids);
  t(`[${W.tag}] 2 heading/lead`, s.heading === "⏰ 今だけ投稿" && s.lead.startsWith("近くのお店"), s);
  const c1 = await cardInfo(p, 0);
  t(`[${W.tag}] 2 card: PR, store, title, excerpt(+…), photo, chips, 続きを見る`, c1.pr === "PR・お店の投稿" && c1.store === "カフェp1" && c1.title === "今日だけのランチ p1" && c1.excerpt.endsWith("…") && c1.img && c1.chips.includes("残り席わずか・残り3") && c1.chips.includes("21:00まで") && c1.chips.some((x) => /^掲載あと5時間$/.test(x)) && c1.btn === "続きを見る" && c1.btnH >= 44 && c1.note === null, c1);
  const c2 = await cardInfo(p, 1);
  t(`[${W.tag}] 3 no photo -> category emoji; no excerpt -> no excerpt line; no chips`, !c2.img && c2.emoji === "🎪" && c2.excerpt === null && c2.chips.length === 1, c2);
  t(`[${W.tag}] 3 store/headline HTML is escaped (no injection)`, c2.store.includes("<img") && c2.title === "<b>見出し</b>" && !(await p.ev("window.__xss===1")) && !c2.html.includes("<b>見出し"), c2.store);
  const c3 = await cardInfo(p, 2);
  t(`[${W.tag}] 2 sold out without quantity; <1h shows minutes; English original note`, c3.chips.includes("売り切れ") && c3.chips.some((x) => /^掲載あと(29|30)分$/.test(x)) && c3.note === "お店が書いた原文で表示しています", c3);
  t(`[${W.tag}] 2 no full body in list DOM`, !(await p.ev("document.getElementById('imadakeCardList').innerText.includes('本文1行目')")));
  const lay = await p.ev(`(()=>{const l=document.getElementById('imadakeCardList'); const cs=getComputedStyle(l); const c=l.querySelector('.imadake-card').getBoundingClientRect(); return {hscroll: document.documentElement.scrollWidth > innerWidth, display: cs.display, overflowX: cs.overflowX, cols: cs.gridTemplateColumns.split(' ').length, cardW: Math.round(c.width), listW: l.clientWidth, scrollable: l.scrollWidth > l.clientWidth}})()`);
  t(`[${W.tag}] 10 layout (no page h-scroll; mobile swipe strip / PC grid)`, !lay.hscroll && (W.m ? lay.display === "flex" && lay.overflowX === "auto" && lay.scrollable : lay.display === "grid" && lay.cols >= 3), lay);
  await p.screenshot(`${SHOTS_DIR}/imadake-${W.tag}.png`, "#imadakeSection");
  // expiry while displayed: make p3 expire, simulate timer tick
  t(`[${W.tag}] 5 expiry check timer running while shown`, await p.ev("imadakeExpiryCheckTimer !== null"));
  await p.ev("imadakeNearbyPosts.find(x=>x.postId==='p3').expiresAt = new Date(Date.now()-1000).toISOString(); renderImadakeSection(); true");
  t(`[${W.tag}] 5 card disappears once expired (no refetch)`, JSON.stringify((await section(p)).ids) === JSON.stringify(["p1", "p2"]) && (p.log.imadakeList || []).length === 1);
  await p.ev("imadakeNearbyPosts.forEach(x=>{x.expiresAt=new Date(Date.now()-1000).toISOString()}); renderImadakeSection(); true");
  t(`[${W.tag}] 5 all expired -> section hidden, timer stopped`, (await section(p)).hidden && (await p.ev("imadakeExpiryCheckTimer === null")));
  await finish(p, `2-${W.tag}`);
}
// ---- 5-6. detail ----
if (!only || only === "3") for (const W of [{ w: 390, m: true, tag: "390" }, { w: 1280, m: false, tag: "1280" }]) {
  const c1 = card("d1"), c2 = card("d404"), c3 = card("d500"), c4 = card("dExp");
  const sc = { lists: { [A.key]: { posts: [c1, c2, c3, c4] } }, details: { d1: { body: { success: true, post: detail(c1) }, delayMs: 600 }, d500: { status: 500, body: { success: false, message: "x" } }, dExp: { body: { success: true, post: detail(c4, { expiresAt: iso(-1000) }) } } } };
  const p = await page(sc, { width: W.w, mobile: W.m });
  await p.goto("/"); await p.waitFor(READY);
  await setLocation(p, A); await p.waitFor("!document.getElementById('imadakeSection').hidden", 10000);
  await tap(p, '#imadakeCardList .imadake-read-more[data-imadake-post-id="d1"]', W.m);
  let m = await modal(p);
  t(`[${W.tag}] 5 tap 続きを見る -> modal opens with loading`, m.visible && m.text.includes("読み込んでいます") && m.bodyOverflow === "hidden", m);
  await sleep(900); m = await modal(p);
  t(`[${W.tag}] 5 detail: title, full body, images, PR, chips, rows`, m.title === "今日だけのランチ d1" && m.text.includes("本文1行目") && m.text.includes("詳しい説明です。詳しい説明です。") && m.imgs === 2 && m.text.includes("PR・お店の投稿") && m.text.includes("テイクアウト可") && m.text.includes("ランチ 1,200円") && m.text.includes("現金・QRコード決済") && m.text.includes("沖縄県那覇市久茂地1-1") && m.text.includes("お店にご確認ください"), m.text.slice(0, 300));
  t(`[${W.tag}] 5 action links: tel sanitized, https kept, javascript: dropped`, JSON.stringify(m.links) === JSON.stringify(["tel:0981234567|📞 電話する", "https://example.com/reserve|📅 予約する", "https://instagram.com/x|📱 SNS"]), m.links);
  t(`[${W.tag}] 5 detail fetched only on tap (once)`, JSON.stringify(p.log.imadakeDetail) === JSON.stringify(["d1"]), p.log.imadakeDetail);
  await p.screenshot(`${SHOTS_DIR}/imadake-detail-${W.tag}.png`, "#imadakeDetailModal .modal-card");
  await p.ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); true"); await sleep(200);
  m = await modal(p);
  t(`[${W.tag}] 5 Escape closes, scroll restored`, !m.visible && m.bodyOverflow === "", m);
  await tap(p, '#imadakeCardList .imadake-read-more[data-imadake-post-id="d404"]', W.m); await sleep(500);
  m = await modal(p);
  t(`[${W.tag}] 6 detail 404 -> ended message, card removed from list`, m.text.includes("掲載は終了しました") && !(await section(p)).ids.includes("d404"), { text: m.text, ids: (await section(p)).ids });
  await p.ev("closeImadakeDetail(); true");
  await tap(p, '#imadakeCardList .imadake-read-more[data-imadake-post-id="d500"]', W.m); await sleep(500);
  m = await modal(p);
  t(`[${W.tag}] 6 detail 500 -> error message, card kept`, m.text.includes("読み込めませんでした") && (await section(p)).ids.includes("d500"), m.text);
  await p.ev("document.getElementById('imadakeDetailModal').dispatchEvent(new MouseEvent('click',{bubbles:true})); true"); await sleep(200);
  t(`[${W.tag}] 5 click outside closes`, !(await modal(p)).visible);
  await tap(p, '#imadakeCardList .imadake-read-more[data-imadake-post-id="dExp"]', W.m); await sleep(500);
  m = await modal(p);
  t(`[${W.tag}] 6 detail returned but already expired -> ended message`, m.text.includes("掲載は終了しました"), m.text);
  await p.ev("closeImadakeDetail(); true");
  // close while loading: late response must not reopen/overwrite
  sc.details.d1.delayMs = 1500;
  await p.ev("openImadakeDetail('d1'); true"); await sleep(200); await p.ev("closeImadakeDetail(); true"); await sleep(1700);
  t(`[${W.tag}] 6 late detail response after close is ignored`, !(await modal(p)).visible && (await p.ev("imadakeDetailState === null")));
  await finish(p, `3-${W.tag}`);
}
// ---- 8. location change race ----
if (!only || only === "4") {
  const sc = { lists: { [A.key]: { posts: [card("a1"), card("a2")], delayMs: 3000 }, [B.key]: { posts: [card("b1")] } }, details: {} };
  const p = await page(sc);
  await p.goto("/"); await p.waitFor(READY);
  await setLocation(p, A); await p.waitFor("userLatitude!==null", 10000);
  await sleep(300);
  await p.ev(`applyUserLocation(${B.lat}, ${B.lng}, null); true`); await p.waitFor(`Math.abs(userLatitude-${B.lat})<0.01`, 10000);
  await sleep(800);
  let s = await section(p);
  t("8 new location's posts shown", JSON.stringify(s.ids) === JSON.stringify(["b1"]), s.ids);
  await sleep(3000);
  s = await section(p);
  t("8 slow response for old location arriving later is ignored", JSON.stringify(s.ids) === JSON.stringify(["b1"]) && JSON.stringify(p.log.imadakeList) === JSON.stringify([A.key, B.key]), { ids: s.ids, req: p.log.imadakeList });
  await p.ev(`applyUserLocation(${B.lat}, ${B.lng}, null); true`); await sleep(1200);
  t("8 same location again -> no duplicate request", (p.log.imadakeList || []).length === 2, p.log.imadakeList);
  // switching location hides old posts until the new response arrives
  sc.lists[A.key].delayMs = 2000;
  await p.ev(`applyUserLocation(${A.lat}, ${A.lng}, null); true`); await sleep(300);
  s = await section(p);
  t("8 while new location loads, old location's cards are not shown", s.hidden && s.ids.length === 0, s);
  await sleep(2200);
  t("8 then new location's cards appear", JSON.stringify((await section(p)).ids) === JSON.stringify(["a1", "a2"]));
  await finish(p, "4");
}
// ---- 9. English ----
if (!only || only === "5") {
  const c1 = card("e1");
  const sc = { lists: { [A.key]: { posts: [c1] } }, details: { e1: { body: { success: true, post: detail(c1) } } } };
  const p = await page(sc, { width: 390, mobile: true });
  await p.goto("/"); await p.waitFor(READY);
  await setLocation(p, A); await p.waitFor("!document.getElementById('imadakeSection').hidden", 10000);
  await p.ev("switchMachinauLanguage('en'); true"); await sleep(500);
  const s = await section(p); const c = await cardInfo(p, 0);
  t("9 English fixed texts (heading, lead, PR, button, chips)", s.heading === "⏰ Just for Now" && s.lead.startsWith("Nearby shops") && c.pr === "PR · From the shop" && c.btn === "See more" && c.chips.includes("Few seats left・3 left") && c.chips.includes("Until 21:00") && c.chips.some((x) => /^5h left$/.test(x)), { s, c });
  t("9 English: shop-written text stays original, with note", c.title === "今日だけのランチ e1" && c.note === "Shown as written by the shop", c);
  await tap(p, '#imadakeCardList .imadake-read-more', true); await sleep(600);
  const m = await modal(p);
  t("9 English detail labels; content original", m.text.includes("Price") && m.text.includes("Cash・QR code payment") && m.text.includes("Takeout available") && m.text.includes("📞 Call") && m.text.includes("本文1行目") && m.text.includes("Please check the latest"), m.text.slice(0, 300));
  await p.ev("switchMachinauLanguage('ja'); true"); await sleep(300);
  t("9 language switch while detail open re-renders labels (ja)", (await modal(p)).text.includes("価格") && (await section(p)).heading === "⏰ 今だけ投稿");
  await p.screenshot(`${SHOTS_DIR}/imadake-en-detail-390.png`, "#imadakeDetailModal .modal-card");
  await finish(p, "5");
}
// ---- 11. no interference with existing TOP ----
if (!only || only === "6") {
  const sc = { lists: { [A.key]: { posts: [card("x1"), card("x2")] } }, details: {} };
  const fav = JSON.stringify(["__fav_a"]);
  const p = await page(sc);
  await p.ev(`1`);
  await p.s("Page.addScriptToEvaluateOnNewDocument", { source: `if(!sessionStorage.getItem('s')){sessionStorage.setItem('s','1');localStorage.setItem('machinauFavoriteShopIds',${JSON.stringify(fav)});}` });
  await p.goto("/"); await p.waitFor(READY);
  const before = await p.ev("({shops: shops.length, cards: document.querySelectorAll('#shopsSection [data-shop-id]').length})");
  await setLocation(p, A); await p.waitFor("!document.getElementById('imadakeSection').hidden", 10000); await sleep(1500);
  const after = await p.ev("({shops: shops.length, shopIds: shops.map(s=>s.firestoreId).filter(id=>/^x[12]$/.test(id)).length, cards: document.querySelectorAll('#shopsSection [data-shop-id]').length, inShops: document.querySelectorAll('#shopsSection .imadake-card').length, fav: localStorage.getItem('machinauFavoriteShopIds'), saved: localStorage.getItem('machinauSavedItems'), markers: shopMarkers.length})");
  t("11 imadake does not touch shops/favorites/saved items/map markers", after.shops === before.shops && after.shopIds === 0 && after.inShops === 0 && after.fav === fav && after.saved === null && (after.markers === 0 || after.markers === after.shops), { before, after });
  await p.ev("showMyPage(); true"); await sleep(300);
  t("11 Travel Box hides TOP sections as before (imadake section not inside box)", !(await p.ev("document.getElementById('myPageSection').contains(document.getElementById('imadakeSection'))")));
  await finish(p, "6");
}
} catch (e) { console.error("HARNESS ERROR", e.stack); }
const fails = results.filter((r) => !r.pass);
console.log(`\nTOTAL ${results.length}  PASS ${results.length - fails.length}  FAIL ${fails.length}`);
browser.close(); server.close(); process.exit(0);
