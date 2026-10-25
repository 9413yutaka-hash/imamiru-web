// Client tests: imadake-post.html login mode / token mode, and the store-account entry link.
import { REPO_ROOT } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
const ORIGIN = "http://127.0.0.1:8701";
const results = [];
const t = (name, pass, detail = "") => { results.push(!!pass); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail !== "" ? " :: " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320) : ""}`); };

// Wrap firebase.initializeApp so the named store app returns a fake auth (user or null). Default app untouched.
const fakeStoreAuth = (user) => `(() => {
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) {
    fb = v;
    if (v && v.initializeApp && !v.__wrapped) {
      const orig = v.initializeApp.bind(v);
      v.__wrapped = true;
      v.initializeApp = function(options, name) {
        if (name === 'machinauStoreAccount') {
          const userObj = ${user ? `{ uid: ${JSON.stringify(user.uid)}, email: "owner@example.com", isAnonymous: false, emailVerified: true, getIdToken: async () => ${JSON.stringify(user.token)}, reload: async () => {} }` : "null"};
          window.__storeAuthCalls = (window.__storeAuthCalls || 0) + 1;
          return { name, auth: () => ({ currentUser: userObj, onAuthStateChanged(cb) { setTimeout(() => cb(userObj), 0); return () => {}; } }) };
        }
        return orig(options, name);
      };
    }
  } });
})();`;

function mockFor(sc, log) {
  return async (url, method, l, postData) => {
    if (method !== "POST") return null;
    let body = {}; try { body = JSON.parse(postData || "{}"); } catch {}
    log.push({ mode: body.mode, body, url });
    if (body.mode === "imadakeStoreStatus") return sc.status;
    if (body.mode === "cloudinarySignature") return { status: 500, body: { success: false } };
    if (body.mode === "imadakePostCreate" || body.mode === "imadakePostEnd") return { body: { success: false, message: "mock" } };
    return { body: { success: false } };
  };
}
const server = await serve(REPO_ROOT + "", 8701);
const browser = await launchChrome();
async function openImadake(query, user, sc) {
  const calls = [];
  const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { initScripts: [fakeStoreAuth(user)], apiMock: mockFor(sc, calls) } });
  // capture Authorization headers from the page's fetch
  await p.s("Page.addScriptToEvaluateOnNewDocument", { source: `window.__authHeaders=[]; const __f=window.fetch; window.fetch=function(u,o){ try{ if(String(u).includes('/api/moderate-submission') && o && o.headers){ window.__authHeaders.push({auth:o.headers.Authorization||o.headers.authorization||'', body:o.body}); } }catch(e){} return __f.apply(this, arguments); };` });
  await p.goto("/imadake-post.html" + query); await sleep(1500);
  return { p, calls };
}
const panels = (p) => p.ev(`({loading:!document.getElementById('loadingPanel').hidden, invalid:!document.getElementById('invalidPanel').hidden, login:!document.getElementById('loginRequiredPanel').hidden, denied:!document.getElementById('storeDeniedPanel').hidden, deniedMsg:document.getElementById('storeDeniedMessage').textContent, store:!document.getElementById('storePanel').hidden, storeName:document.getElementById('storeNameText').textContent, loginLink:(document.querySelector('#loginRequiredPanel a')||{}).getAttribute&&document.querySelector('#loginRequiredPanel a').getAttribute('href')})`);
const okStatus = { body: { success: true, storeName: "セルフ店1", location: { prefecture: "沖縄県", city: "那覇市", address: "x" }, currentPost: null } };

try {
  // 1. login mode, logged in owner
  let { p, calls } = await openImadake("?store=self1", { uid: "u1", token: "store-user-id-token" }, { status: okStatus });
  let pn = await panels(p);
  t("1 login mode: store panel shown with server store name", pn.store && pn.storeName === "セルフ店1" && !pn.invalid && !pn.login, pn);
  const st = calls.find((c) => c.mode === "imadakeStoreStatus");
  t("1 status request: storeId only, no token in body", st && st.body.storeId === "self1" && !("token" in st.body), st && st.body);
  const hdr = await p.ev("window.__authHeaders");
  t("1 status request carries store user's ID token (Authorization)", hdr.length >= 1 && hdr[0].auth === "Bearer store-user-id-token", hdr);
  t("1 named store app used; default app not signed in anonymously", (await p.ev("window.__storeAuthCalls")) === 1 && !p.log.blocked.includes("auth"), { storeAuth: await p.ev("window.__storeAuthCalls"), blocked: p.log.blocked });
  // create / end requests (direct calls to the page helper)
  await p.ev("callImadakeApi('imadakePostCreate', { headline: 'x' }); callImadakeApi('imadakePostEnd', { postId: 'P1' }); true"); await sleep(600);
  const cr = calls.find((c) => c.mode === "imadakePostCreate"), en = calls.find((c) => c.mode === "imadakePostEnd");
  const h2 = await p.ev("window.__authHeaders");
  t("1 create/end: storeId only (no token), Authorization attached", cr && en && cr.body.storeId === "self1" && !("token" in cr.body) && en.body.storeId === "self1" && !("token" in en.body) && h2.slice(1).every((h) => h.auth === "Bearer store-user-id-token"), { cr: cr && cr.body, en: en && en.body, h2 });
  // photo signature
  const upload = await p.ev(`(async()=>{ const blob = await new Promise(r=>{ const c=document.createElement('canvas'); c.width=4; c.height=4; c.toBlob(r,'image/png'); }); try { await uploadPhoto(new File([blob],'a.png',{type:'image/png'})); return 'uploaded'; } catch(e) { return 'stopped: ' + e.message; } })()`);
  const sig = calls.filter((c) => c.mode === "cloudinarySignature").pop();
  const h3 = (await p.ev("window.__authHeaders")).filter((h) => String(h.body).includes("cloudinarySignature")).pop();
  t("12 photo signature: body has no storeId/token, store user's ID token used, no anonymous sign-in", sig && JSON.stringify(Object.keys(sig.body)) === '["mode"]' && h3 && h3.auth === "Bearer store-user-id-token" && !p.log.blocked.includes("auth") && /stopped/.test(upload), { sig: sig && sig.body, h3, upload, blocked: p.log.blocked });
  await p.close();

  // 2. login mode, not logged in
  ({ p, calls } = await openImadake("?store=self1", null, { status: okStatus }));
  pn = await panels(p);
  t("2 not logged in: login-required panel with link to store-account.html, no API call", pn.login && pn.loginLink === "store-account.html" && !pn.store && calls.length === 0, { pn, calls: calls.length });
  await p.close();

  // 3. login mode, server rejects (403 with message) / 401
  ({ p, calls } = await openImadake("?store=pend", { uid: "u3", token: "t3" }, { status: { status: 403, body: { success: false, message: "この店舗で今だけ投稿を操作する権限がありません。" } } }));
  pn = await panels(p);
  t("3 server 403: denied panel shows server message, form hidden", pn.denied && pn.deniedMsg === "この店舗で今だけ投稿を操作する権限がありません。" && !pn.store && !pn.invalid, pn);
  await p.close();
  ({ p, calls } = await openImadake("?store=self1", { uid: "u1", token: "expired" }, { status: { status: 401, body: { success: false, message: "店舗アカウントでログインしてください。" } } }));
  t("3 server 401: login-required panel", (await panels(p)).login);
  await p.close();

  // 4. old token URL (method A) removed (STEP 43-B): no server call, invalid panel pointing to the store account
  ({ p, calls } = await openImadake("?store=legacy1&token=secret", null, { status: { body: { success: true, storeName: "旧URL店", location: { prefecture: "沖縄県", city: "那覇市" }, currentPost: null } } }));
  pn = await panels(p);
  const invalidText4 = await p.ev("document.getElementById('invalidPanel').innerText");
  t("4 old token URL: invalid panel, no API call, token scrubbed from address bar", pn.invalid && !pn.store && calls.length === 0 && !(await p.ev("location.search")).includes("token"), { pn, calls: calls.map((c) => c.mode), search: await p.ev("location.search") });
  t("4 old token URL: message points to the store account login (not to an operator URL)", /店舗アカウントにログイン/.test(invalidText4) && !/お渡しした店舗専用URL/.test(invalidText4), invalidText4);
  t("4 old token URL: named store app not used", (await p.ev("window.__storeAuthCalls || 0")) === 0);
  await p.close();
  ({ p, calls } = await openImadake("?store=legacy1&token=bad", null, { status: { status: 403, body: { success: false, message: "この店舗投稿URLは無効です。" } } }));
  t("4 old token URL (bad token): same invalid panel, no API call", (await panels(p)).invalid && calls.length === 0);
  await p.close();
  ({ p, calls } = await openImadake("", { uid: "u1", token: "x" }, { status: okStatus }));
  t("4 no store param: invalid panel, no API call", (await panels(p)).invalid && calls.length === 0);
  await p.close();

  // 5. store-account entry link (real flow: logged-in verified owner, storeMyStores mocked)
  const STORES = [
    {storeId:"self1", storeName:"セルフ店1", registrationStatus:"active", countryCode:"JP", prefecture:"沖縄県", city:"那覇市"},
    {storeId:"self2", storeName:"セルフ店2", registrationStatus:"active", countryCode:"JP", prefecture:"沖縄県", city:"南城市"},
    {storeId:"pend", storeName:"審査待ち店", registrationStatus:"pending_review", countryCode:"JP"},
    {storeId:"susp", storeName:"停止店", registrationStatus:"suspended", countryCode:"JP"},
    {storeId:"rej", storeName:"却下店", registrationStatus:"rejected", countryCode:"JP"} ];
  for (const lang of ["ja", "en"]) {
    const calls5 = [];
    const q = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { initScripts: [fakeStoreAuth({ uid: "u1", token: "acct-token" }), `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`], apiMock: async (url, method, l, postData) => { if (method !== "POST") return null; let body = {}; try { body = JSON.parse(postData || "{}"); } catch {} calls5.push(body.mode); if (body.mode === "storeMyStores") return { body: { success: true, stores: STORES } }; return { body: { success: false } }; } } });
    await q.goto("/store-account.html"); await q.waitFor("document.querySelectorAll('#storeList > *').length >= 5", 10000); await sleep(500);
    const links = await q.ev(`[...document.querySelectorAll("#storeList > *")].map(item => [...item.querySelectorAll("a")].map(a => a.getAttribute("href") + "|" + a.textContent))`);
    const label = lang === "ja" ? "⏰ 今だけ投稿" : "⏰ Just for Now";
    t(`5 [${lang}] active stores: profile link unchanged + imadake link with own storeId, no token`, [0, 1].every((i) => links[i].length === 2 && links[i][0].startsWith(`store-profile.html?store=self${i + 1}|`) && links[i][1] === `imadake-post.html?store=self${i + 1}|${label}`), links);
    t(`5 [${lang}] pending / suspended / rejected: no imadake link (no links as before)`, links.slice(2).every((x) => x.length === 0), links.slice(2));
    t(`5 [${lang}] no link contains a token`, links.flat().every((l) => !/token=/.test(l)));
    const errs = [...new Set(q.log.errors)].filter((e) => !/RefererNotAllowed/.test(e));
    t(`5 [${lang}] store-account: no JS errors`, errs.length === 0, errs);
    await q.close();
  }
} catch (e) { console.error("HARNESS ERROR", e.stack); }
console.log(`\nTOTAL ${results.length}  PASS ${results.filter(Boolean).length}  FAIL ${results.filter((x) => !x).length}`);
browser.close(); server.close(); process.exit(0);
