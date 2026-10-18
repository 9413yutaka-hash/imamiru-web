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


const created = () => be.reqs.filter((r) => r.mode === "imadakePostCreate").at(-1);
const srcState = (p) => p.ev("({checked: (document.querySelector('input[name=sourceLanguage]:checked')||{}).value, selected: [...document.querySelectorAll('#sourceLanguageChips .chip.selected')].map(c=>c.querySelector('input').value).join(','), label: document.querySelector('[data-i18n=imadake_post_source_language_label]').textContent, options: [...document.querySelectorAll('#sourceLanguageChips .chip')].map(c=>c.textContent.trim()).join('/'), aria: document.getElementById('sourceLanguageChips').getAttribute('aria-label')})");
async function submit(p, headline) {
  await p.ev("document.querySelector('#categoryChips input[value=other]').click(); document.getElementById('headlineInput').value=" + JSON.stringify(headline) + "; document.getElementById('submitButton').click(); true");
  await p.waitFor("document.getElementById('postForm').hidden === true", 8000); await sleep(150);
}
try {
  be.current = null;
  let p = await page("/imadake-post.html?store=S1");
  let st = await srcState(p);
  t("JA UI: field shown, default 日本語 checked + highlighted, label/aria in Japanese, options 日本語/English", st.checked === "ja" && st.selected === "ja" && st.label === "投稿する言語" && st.aria === "投稿する言語" && st.options === "日本語/English", st);
  await submit(p, "本日まだ空席あります");
  t("JA post with default -> sourceLanguage ja", created().sourceLanguage === "ja", created());
  await p.ev("document.getElementById('endButton').click(); true"); await p.waitFor("document.getElementById('postForm').hidden === false", 8000);
  st = await srcState(p);
  t("after posting, form reset returns to 日本語 (highlight synced)", st.checked === "ja" && st.selected === "ja", st);
  await p.ev("document.querySelector('input[name=sourceLanguage][value=en]').click(); true");
  st = await srcState(p);
  t("choosing English highlights English only", st.checked === "en" && st.selected === "en", st);
  await submit(p, "Seats still available");
  t("English chosen (JA UI) -> sourceLanguage en; typed text unchanged", created().sourceLanguage === "en" && created().headline === "Seats still available", created());
  await p.close();

  be.current = null;
  p = await page("/imadake-post.html?store=S1", { lang: "en" });
  st = await srcState(p);
  t("EN UI: default is still 日本語 (independent of display language), label/hint in English", st.checked === "ja" && st.label === "Language of your post" && st.aria === "Language of your post" && st.options === "日本語/English" && (await p.ev("document.querySelector('[data-i18n=imadake_post_source_language_hint]').textContent")).startsWith("Choose the language"), st);
  await submit(p, "日本語の見出し");
  t("EN UI + default -> sourceLanguage ja", created().sourceLanguage === "ja");
  await p.ev("document.getElementById('endButton').click(); true"); await p.waitFor("document.getElementById('postForm').hidden === false", 8000);
  // select English, fill, switch display language back and forth
  await p.ev("document.querySelector('input[name=sourceLanguage][value=en]').click(); document.querySelector('#categoryChips input[value=event]').click(); document.getElementById('headlineInput').value='Live music tonight'; document.getElementById('bodyInput').value='Doors open at 7pm.'; true");
  await sw(p, "ja"); await sleep(150); const a = await srcState(p); const fa = await formState(p);
  await sw(p, "en"); await sleep(150); const b = await srcState(p); const fb = await formState(p);
  t("display language JA<->EN does not change the post language (stays English) or inputs", a.checked === "en" && b.checked === "en" && a.selected === "en" && b.selected === "en" && fa.headline === "Live music tonight" && fb.body === "Doors open at 7pm." && fa.cat === "event" && fb.cat === "event", { a, b });
  await p.ev("document.getElementById('submitButton').click(); true"); await p.waitFor("document.getElementById('postForm').hidden === true", 8000);
  t("EN UI + English chosen -> sourceLanguage en, category event", created().sourceLanguage === "en" && created().categoryCode === "event", created());
  await p.close();

  // legacy token store also sends the chosen language
  be.current = null;
  p = await page("/imadake-post.html?store=LEG&token=secret", { login: false });
  await p.ev("document.querySelector('input[name=sourceLanguage][value=en]').click(); true");
  await submit(p, "Fresh bread");
  t("legacy token store: sourceLanguage en sent with token", created().sourceLanguage === "en" && created().token === "secret");
  await p.close();

  be.current = null;
  for (const width of [390, 1280]) {
    p = await page("/imadake-post.html?store=S1", { width: width === 390 ? undefined : width });
    const lay = await p.ev("(()=>{const b=document.getElementById('sourceLanguageChips').getBoundingClientRect(); return {hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, visible: b.width > 0 && b.right <= window.innerWidth + 1};})()");
    t("[" + width + "] language field visible, no horizontal scroll, JS errors 0", lay.visible && !lay.hscroll && p.log.errors.length === 0, { lay, errs: p.log.errors });
    await p.screenshot(SHOTS_DIR + "/srclang-" + width + ".png", "#postForm");
    await p.close();
  }
} catch (e) { console.log("ERROR", e); fail++; }
finally { console.log("TOTAL " + (pass + fail) + "  PASS " + pass + "  FAIL " + fail); process.exit(0); }
