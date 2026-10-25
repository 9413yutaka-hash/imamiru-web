// imadake-post.html i18n: language switch keeps form input, post / end / withdraw flows in JA & EN,
// store login + legacy token, messages re-translate. Mocked APIs, fake store login. No network writes.
import { REPO_ROOT, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
const REPO = REPO_ROOT + "";
const ORIGIN = process.env.ORIGIN || "http://127.0.0.1:8701";
let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 500) : ""}`); };
const be = { current: null, reqs: [], createReply: null };
async function apiMock(url, method, log, postData, headers) {
  if (method !== "POST" || !url.includes("/api/moderate-submission")) return null;
  const body = JSON.parse(postData || "{}"); be.reqs.push(body);
  const auth = (headers && (headers.Authorization || headers.authorization)) || "";
  const okAuth = body.token === "secret" || auth === "Bearer tok";
  if (body.mode === "imadakeStoreStatus") return okAuth ? { body: { success: true, storeName: "テスト店", location: { prefecture: "沖縄県", city: "那覇市" }, currentPost: be.current } } : { status: 403, body: { success: false, message: "この店舗投稿URLは無効です。" } };
  if (body.mode === "imadakePostCreate") {
    if (be.createReply) return be.createReply;
    const status = body.headline.includes("審査") ? "pending" : "published";
    be.current = { postId: "NEW1", status, headline: body.headline, publishedAt: status === "published" ? "2026-10-15T01:00:00Z" : null, expiresAt: status === "published" ? "2026-10-16T01:00:00Z" : null };
    return { body: { success: true, postId: "NEW1", status, publishedAt: be.current.publishedAt, expiresAt: be.current.expiresAt } };
  }
  if (body.mode === "imadakePostEnd") { const was = be.current; be.current = null; return { body: { success: true, status: was && was.status === "pending" ? "withdrawn" : "ended" } }; }
  if (body.mode === "imadakeStoreCvReport") return { body: { success: true, billingStarted: false, dailyChargeAmountJpy: 100, period: { startDate: "2026-08-01", endDate: "2026-10-15", months: ["2026-08", "2026-09", "2026-10"] }, months: [{ month: "2026-08", validCvCount: 0, cvDayCount: 0, referenceAmountJpy: 0, actualChargeJpy: 0 }, { month: "2026-09", validCvCount: 0, cvDayCount: 0, referenceAmountJpy: 0, actualChargeJpy: 0 }, { month: "2026-10", validCvCount: 2, cvDayCount: 1, referenceAmountJpy: 100, actualChargeJpy: 0 }], totals: { validCvCount: 2, cvDayCount: 1, referenceAmountJpy: 100, actualChargeJpy: 0 }, posts: [], truncated: false, generatedAt: "2026-10-15T01:00:00Z" } };
  return { status: 400, body: { success: false } };
}
const fakeLogin = (on) => `(() => { let real; Object.defineProperty(window, 'firebase', { configurable: true, get(){ return real; }, set(v){ real = v; if (!v || v.__patched) return; const init = v.initializeApp.bind(v); v.initializeApp = function(opts, name){ if (name === 'machinauStoreAccount') { return { name, auth(){ return { onAuthStateChanged(cb){ setTimeout(() => cb(${on ? "{ isAnonymous:false, getIdToken: async () => 'tok' }" : "null"}), 0); return function(){}; } }; } }; } return init(opts, name); }; v.__patched = true; } }); })();`;
const server = process.env.ORIGIN ? null : await serve(REPO, 8701);
const browser = await launchChrome();
async function page(path, o = {}) {
  const p = await openPage(browser, { origin: ORIGIN, width: o.width || 390, mobile: !o.width, state: { apiMock, initScripts: [fakeLogin(o.login !== false), `try{ localStorage.setItem('machinauLanguage', ${JSON.stringify(o.lang || "ja")}); }catch(e){}`, "window.__confirms=[]; window.confirm=(m)=>{window.__confirms.push(m); return true;};"] } });
  await p.goto(path); await p.waitFor("document.getElementById('loadingPanel').hidden === true", 15000); await sleep(500);
  return p;
}
const sw = (p, lang) => p.ev(`document.querySelector('#languageSwitch [data-language="${lang}"]').click(); true`);
const formState = (p) => p.ev(`({
  headline: document.getElementById('headlineInput').value, body: document.getElementById('bodyInput').value,
  cat: (document.querySelector('#categoryChips input:checked')||{}).value || '', catSelected: [...document.querySelectorAll('#categoryChips .chip.selected')].length,
  live: (document.querySelector('#liveStateChips input:checked')||{}).value, quantity: document.getElementById('quantityInput').value,
  takeout: !!(document.querySelector('[data-category-field=takeout]')||{}).checked, price: document.getElementById('priceTextInput').value,
  pay: [...document.querySelectorAll('input[name=paymentMethod]:checked')].map(i=>i.value).join(','), phone: document.getElementById('phoneInput').value,
  photos: document.querySelectorAll('#photoGrid .photo-item').length, hint: document.getElementById('photoHint').textContent,
  headlineCounter: document.getElementById('headlineCounter').textContent,
  catLabels: [...document.querySelectorAll('#categoryChips .chip')].map(c=>c.textContent.trim()),
  liveLabel: document.getElementById('liveStateLabel').textContent, liveLabels: [...document.querySelectorAll('#liveStateChips .chip')].map(c=>c.textContent.trim()),
  fieldLabels: [...document.querySelectorAll('#categoryFieldsBox label')].map(l=>l.textContent.trim()), submit: document.getElementById('submitButton').textContent,
  lang: document.documentElement.lang, pressed: (document.querySelector('#languageSwitch [aria-pressed=true]')||{}).textContent })`);

try {
  // ---- language switch keeps the form ----
  let p = await page("/imadake-post.html?store=S1");
  await p.ev(`(() => {
    document.querySelector('#categoryChips input[value=food_shop]').click();
    document.querySelector('#liveStateChips input[value=few]').click();
    document.getElementById('quantityInput').value = '6';
    document.querySelector('[data-category-field=holdAvailable]').click();
    const h = document.getElementById('headlineInput'); h.value = 'タルト、あと6個です'; h.dispatchEvent(new Event('input'));
    document.getElementById('bodyInput').value = '本日限定の本文です。';
    document.getElementById('priceTextInput').value = '1個 450円';
    document.querySelector('input[name=paymentMethod][value=qr]').click();
    document.getElementById('phoneInput').value = '098-000-0000';
    const dt = new DataTransfer();
    for (let i = 0; i < 2; i++) { const c = document.createElement('canvas'); c.width = c.height = 4; dt.items.add(new File([new Uint8Array(100)], 'p' + i + '.png', { type: 'image/png' })); }
    const input = document.getElementById('photoInput'); input.files = dt.files; input.dispatchEvent(new Event('change'));
    return true; })()`);
  await sleep(200);
  const ja1 = await formState(p);
  t("JA: form filled (food_shop, few, qty 6, hold, QR, 2 photos)", ja1.cat === "food_shop" && ja1.live === "few" && ja1.photos === 2 && ja1.hint === "1枚目がメインの写真になります（2 / 10枚）。" && ja1.liveLabel === "今の在庫・残り状況", ja1);
  await sw(p, "en"); await sleep(200);
  const en1 = await formState(p);
  t("EN switch: every input/selection/photo kept", ["headline", "body", "cat", "live", "quantity", "price", "pay", "phone", "photos", "headlineCounter"].every((k) => en1[k] === ja1[k]) && en1.catSelected === 1, { ja1, en1 });
  t("EN switch: labels in English (categories, live state, fields, photo hint, submit, lang, pressed)", JSON.stringify(en1.catLabels) === JSON.stringify(["Restaurant / café", "Food & sweets", "Shop / retail", "Event", "Other"]) && en1.liveLabel === "Stock right now" && JSON.stringify(en1.liveLabels) === JSON.stringify(["Not specified", "Available", "Only a few left", "Sold out"]) && JSON.stringify(en1.fieldLabels) === JSON.stringify(["Takeout available", "Items can be held"]) && en1.hint === "The first photo will be the main photo (2 / 10)." && en1.submit === "Publish your post" && en1.lang === "en" && en1.pressed === "English", en1);
  t("EN: photo labels / remove buttons in English", await p.ev("document.querySelector('#photoGrid .photo-main-label').textContent === 'Main' && document.querySelector('#photoGrid .photo-remove').getAttribute('aria-label') === 'Remove this photo'"));
  t("EN: store data stays original (store name, location, typed headline)", await p.ev("document.getElementById('storeNameText').textContent === 'テスト店' && document.getElementById('storeLocationText').textContent === '沖縄県 那覇市' && document.getElementById('headlineInput').value === 'タルト、あと6個です'"));
  await sw(p, "ja"); await sleep(200);
  const ja2 = await formState(p);
  t("back to JA: identical to before switching (values + labels)", JSON.stringify(ja2) === JSON.stringify(ja1), { ja1, ja2 });
  t("language saved (machinauLanguage)", (await p.ev("localStorage.getItem('machinauLanguage')")) === "ja");
  // a message shown, then switch: it re-translates
  await p.ev("while (document.querySelector('#photoGrid .photo-remove')) document.querySelector('#photoGrid .photo-remove').click(); document.getElementById('headlineInput').value=''; document.getElementById('submitButton').click(); true"); await sleep(150);
  t("JA validation message", (await p.ev("document.getElementById('formMessage').textContent")) === "「いちばん伝えたいこと」を入力してください。");
  await sw(p, "en"); await sleep(150);
  t("message re-translated on switch (EN)", (await p.ev("document.getElementById('formMessage').textContent")) === "Please enter “Your main message”.");
  t("photos removed -> hint 0 / 10 in EN", (await p.ev("document.getElementById('photoHint').textContent")) === "The first photo will be the main photo (0 / 10).");
  await p.close();

  // ---- create (published) / end in English, store login ----
  be.current = null;
  p = await page("/imadake-post.html?store=S1", { lang: "en" });
  await p.ev("document.querySelector('#categoryChips input[value=restaurant]').click(); document.getElementById('headlineInput').value='Seats still available'; document.getElementById('submitButton').click(); true");
  await p.waitFor("document.getElementById('postForm').hidden === true", 8000); await sleep(200);
  const cr = be.reqs.filter((r) => r.mode === "imadakePostCreate").at(-1);
  t("EN create: request unchanged (codes, sourceLanguage 'ja' as before, typed text as-is)", cr && cr.categoryCode === "restaurant" && cr.headline === "Seats still available" && cr.sourceLanguage === "ja", cr);
  let cur = await p.ev("({status: document.getElementById('currentStatusLabel').textContent, meta: document.getElementById('currentMeta').textContent, msg: document.getElementById('currentMessage').textContent, end: document.getElementById('endButton').textContent})");
  t("EN create result: Live / 'Scheduled to end' / success message with end time", cur.status === "Live" && /^Scheduled to end: 10\/16, 10:00 AM \(24 hours after going live\)$/.test(cur.meta) && /^Your post is now live\.\nIt stays live for 24 hours\. Scheduled to end: 10\/16, 10:00 AM$/.test(cur.msg) && cur.end === "End this post", cur);
  await sw(p, "ja"); await sleep(150);
  cur = await p.ev("({status: document.getElementById('currentStatusLabel').textContent, meta: document.getElementById('currentMeta').textContent, msg: document.getElementById('currentMessage').textContent})");
  t("switch to JA after posting: status / date / message in Japanese (JST)", cur.status === "公開中" && cur.meta === "掲載終了予定：10/16 10:00（公開から24時間）" && cur.msg === "今だけ投稿を公開しました。\n24時間限定です。掲載終了予定：10/16 10:00", cur);
  await sw(p, "en"); await sleep(100);
  await p.ev("document.getElementById('endButton').click(); true"); await p.waitFor("document.getElementById('postForm').hidden === false", 8000); await sleep(150);
  t("EN end: confirm dialog in English, result message in English, form back", (await p.ev("window.__confirms.at(-1)")) === "End your live post? (Travelers will no longer see it.)" && (await p.ev("document.getElementById('formMessage').textContent")) === "Your post has ended. You can create a new post.");
  await p.close();

  // ---- old token URL (STEP 43-B: method A removed) ----
  const beforeLegacy = be.reqs.length;
  p = await page("/imadake-post.html?store=LEG&token=secret", { login: false });
  t("old token URL: invalid panel, no API calls", await p.ev("!document.getElementById('invalidPanel').hidden && document.getElementById('storePanel').hidden") && be.reqs.length === beforeLegacy);
  await p.close();
  // ---- pending + withdraw in Japanese (logged-in store) ----
  be.current = null;
  p = await page("/imadake-post.html?store=S1");
  t("logged-in store: page works", await p.ev("!document.getElementById('storePanel').hidden && !document.getElementById('postForm').hidden"));
  await p.ev("document.querySelector('#categoryChips input[value=other]').click(); document.getElementById('headlineInput').value='審査になる見出し'; document.getElementById('submitButton').click(); true");
  await p.waitFor("document.getElementById('postForm').hidden === true", 8000); await sleep(150);
  cur = await p.ev("({status: document.getElementById('currentStatusLabel').textContent, msg: document.getElementById('currentMessage').textContent, withdraw: document.getElementById('withdrawButton').textContent})");
  t("JA pending result (logged-in store): 運営確認中 + pending message", cur.status === "運営確認中（まだ公開されていません）" && cur.msg.startsWith("内容を運営が確認しています。") && cur.withdraw === "投稿を取り下げる", cur);
  await p.ev("document.getElementById('withdrawButton').click(); true"); await p.waitFor("document.getElementById('postForm').hidden === false", 8000); await sleep(150);
  t("JA withdraw: confirm + result in Japanese", (await p.ev("window.__confirms.at(-1)")) === "確認中の投稿を取り下げますか？（公開されません）" && (await p.ev("document.getElementById('formMessage').textContent")) === "確認中の投稿を取り下げました。新しく投稿できます。");
  await p.close();

  // ---- server error mapping in EN ----
  be.current = null; be.createReply = { status: 409, body: { success: false, reason: "active_post_exists", message: "すでに公開中の今だけ投稿があります。" } };
  p = await page("/imadake-post.html?store=S1", { lang: "en" });
  await p.ev("document.querySelector('#categoryChips input[value=retail]').click(); document.getElementById('headlineInput').value='x'; document.getElementById('submitButton').click(); true"); await sleep(600);
  t("EN error from server reason code: English text (server Japanese not shown)", (await p.ev("document.getElementById('formMessage').textContent")) === "You already have a live post. Each shop can have one post live at a time. End it before creating a new one.");
  be.createReply = { status: 500, body: { success: false, message: "サーバーの日本語メッセージ" } };
  await p.ev("document.getElementById('submitButton').click(); true"); await sleep(600);
  t("EN unknown server error: generic English (server Japanese hidden)", (await p.ev("document.getElementById('formMessage').textContent")) === "Couldn't publish your post. Please try again later.");
  await sw(p, "ja"); await sleep(150);
  t("JA: the same error shows the server's Japanese text as before", (await p.ev("document.getElementById('formMessage').textContent")) === "サーバーの日本語メッセージ");
  be.createReply = null;
  await p.close();

  // ---- denied + not logged in in EN ----
  p = await page("/imadake-post.html?store=S1", { lang: "en", login: false });
  t("EN not logged in: English login message + link", await p.ev("!document.getElementById('loginRequiredPanel').hidden && document.getElementById('loginRequiredPanel').innerText.includes('Please sign in to your shop account and try again.') && document.getElementById('loginRequiredPanel').innerText.includes('Open the shop account page')"));
  await p.close();

  // ---- layout (mobile + PC), header switch ----
  for (const width of [390, 1280]) {
    p = await page("/imadake-post.html?store=S1", { lang: "en", width: width === 390 ? undefined : width });
    const lay = await p.ev("(()=>{const s=document.getElementById('languageSwitch').getBoundingClientRect(); return {hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, switchVisible: s.width > 0 && s.right <= window.innerWidth + 1, buttons: [...document.querySelectorAll('#languageSwitch button')].map(b=>b.textContent)};})()");
    t(`[${width}] header language switch visible (日本語 / English), no horizontal scroll`, !lay.hscroll && lay.switchVisible && JSON.stringify(lay.buttons) === JSON.stringify(["日本語", "English"]), lay);
    await p.screenshot(`${SHOTS_DIR}/i18n-${width}.png`);
    const errs = [...new Set(p.log.errors)];
    t(`[${width}] JS errors 0`, errs.length === 0, errs);
    await p.close();
  }
} catch (e) { console.log("ERROR", e); fail++; }
finally { console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`); process.exit(0); }
