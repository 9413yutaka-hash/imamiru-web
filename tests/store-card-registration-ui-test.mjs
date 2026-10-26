// STEP 42-D UI: store-account.html "account → email → card → register / take over" and the TOP listing entry.
// Store login faked in the browser; POST /api answered in-process by the REAL handler (mocked firebase-admin) with an
// in-memory Stripe stub (test mode) and a stubbed Google geocoder; Stripe.js replaced by a fake. No real services.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-registration-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8871";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
const FAKE_SERVER_KEY = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
Object.assign(process.env, { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_SERVER_KEY, STRIPE_PUBLISHABLE_KEY: FAKE_PK, VERCEL_ENV: "preview" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { newOwner: pw("n1", "new@example.com"), claimer: pw("c1", "claim@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const LISTING = { title: "本日のおすすめ", shopName: "八重瀬の食堂", category: "グルメ", content: "地元の食材を使った定食の店です。", address: "沖縄県島尻郡八重瀬町", latitude: 26.15, longitude: 127.72, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], takeout: false, imageUrls: [], createdAt: { toDate: () => new Date(Date.now() - 86400000), toMillis: () => Date.now() - 86400000 } };
S.docs.set("submissions/L1", LISTING);
// STEP 43-N C案｜TOP の入口の確認用(引き継がれない運営掲載。L1 は途中の U7 で引き継がれる)。
S.docs.set("submissions/L9", { ...LISTING, shopName: "那覇の別の食堂", latitude: 26.21, longitude: 127.68 });
S.docs.set("submissions/OPS", { ...LISTING, shopName: "運営のお知らせ", authorType: "admin", isPermanentAd: true });
// ---- Stripe / geocoding stubs ----
const ST = { seq: 0, intents: new Map(), calls: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "maps.googleapis.com") return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: "日本、沖縄県島尻郡八重瀬町", geometry: { location: { lat: 26.16, lng: 127.73 } }, address_components: [{ types: ["country"], short_name: "JP", long_name: "Japan" }, { types: ["administrative_area_level_1"], short_name: "沖縄県", long_name: "沖縄県" }, { types: ["locality"], short_name: "八重瀬町", long_name: "八重瀬町" }] }] }) };
  if (u.hostname !== "api.stripe.com") return realFetch(url, opts);
  const form = Object.fromEntries(new URLSearchParams(opts.body || "")); ST.calls.push(opts.method + " " + u.pathname);
  const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (u.pathname === "/v1/customers") return json(200, { id: "cus" + "_ui" + form["metadata[accountUid]"] }); // 実際のStripeのIDと同じく英数字だけ
  if (u.pathname === "/v1/setup_intents") { const id = "seti_ui" + ++ST.seq; ST.intents.set(id, { id, client_secret: id + "_secret_X", customer: form.customer, payment_method_types: ["card"], metadata: { accountUid: form["metadata[accountUid]"] } }); return json(200, ST.intents.get(id)); }
  const m = u.pathname.match(/^\/v1\/setup_intents\/(seti_[A-Za-z0-9]+)$/);
  if (m) return json(200, { ...ST.intents.get(m[1]), status: "succeeded", payment_method: { id: "pm_ui" + m[1].replace(/_/g, ""), customer: ST.intents.get(m[1]).customer, card: { brand: "visa", last4: "4242", exp_month: 3, exp_year: 2031 } } });
  return json(404, { error: {} });
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
async function api(url, method, log, postData, headers) {
  if (method === "GET") {
    // STEP 43-N C案｜TOP の入口は publicStoreProfiles の listingClaimOpen で出すため、この mode も実際の処理で答える。
    const profiles = /mode=publicStoreProfiles/.test(url);
    if (!/\/api\/moderate-submission(\?|$)/.test(url) || (/mode=/.test(url) && !profiles)) return null;
    const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
    await handler({ method: "GET", headers: {}, query: profiles ? { mode: "publicStoreProfiles" } : {} }, r);
    return { status: r.code, body: r.body };
  }
  const body = JSON.parse(postData || "{}");
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.1", ...(headers.Authorization || headers.authorization ? { authorization: headers.Authorization || headers.authorization } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return { status: r.code, body: r.body };
}
const FAKE_STRIPE_JS = `window.Stripe = function (pk) { return {
  elements: function (opts) { window.__elOpts = { clientSecret: opts.clientSecret }; return { create: function () { return { mount: function (sel) { document.querySelector(sel).innerHTML = '<div class="fake-pe">[Stripe card field]</div>'; } }; } }; },
  confirmSetup: async function (args) { window.__returnUrl = args.confirmParams && args.confirmParams.return_url; return { setupIntent: { id: window.__elOpts.clientSecret.split("_secret_")[0], status: "succeeded" } }; } }; };`;
async function urlMock(url) { if (url.startsWith("https://js.stripe.com/")) return { raw: Buffer.from(FAKE_STRIPE_JS), contentType: "application/javascript" }; return null; }
const fakeStoreAuth = (token) => `(() => { let fb; Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) { fb = v; if (v && v.initializeApp && !v.__wrapped) { const orig = v.initializeApp.bind(v); v.__wrapped = true; v.initializeApp = function(options, name) { if (name === 'machinauStoreAccount') { const u = { uid: "u", email: "x@example.com", isAnonymous: false, emailVerified: true, getIdToken: async () => ${JSON.stringify(token)}, reload: async () => {} }; return { name, auth: () => ({ currentUser: u, onAuthStateChanged(cb) { setTimeout(() => cb(u), 0); return () => {}; }, signOut: async () => {} }) }; } return orig(options, name); }; } } }); })();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };
const server = await serve(REPO_ROOT + "", 8871);
const browser = await launchChrome();
async function open(token, query = "", lang = "ja", w = 390) {
  const p = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiPassthrough: true, apiMock: api, urlMock, articles: [], initScripts: [fakeStoreAuth(token), langInit(lang)] } });
  await p.goto("/store-account.html" + query); await p.waitFor(`!document.getElementById("billingSection").hidden`, 15000); await sleep(1500);
  return p;
}
const gate = (p) => p.ev(`({ steps: [...document.querySelectorAll("#onboardingSteps li")].map((li) => li.className + ":" + li.textContent), notice: document.getElementById("cardGateNotice").hidden ? "" : document.getElementById("cardGateNotice").textContent, registerDisabled: document.getElementById("openStoreFormButton").disabled, formOpen: !document.getElementById("storeForm").hidden, claimShown: !document.getElementById("claimSection").hidden, claimNotice: document.getElementById("claimCardGateNotice").hidden ? "" : document.getElementById("claimCardGateNotice").textContent, claimDisabled: document.getElementById("claimSubmitButton").disabled, claimMsg: document.getElementById("claimMessage").textContent, stores: document.getElementById("storeList").textContent, overflow: document.documentElement.scrollWidth > innerWidth })`);
async function registerCard(p) {
  await p.ev(`document.getElementById("billingStartButton").click(), true`);
  await p.waitFor(`!document.getElementById("billingForm").hidden`, 8000);
  await p.ev(`(() => { const c = document.getElementById("billingConsentCheck"); c.checked = true; c.dispatchEvent(new Event("change")); document.getElementById("billingSubmitButton").click(); return true; })()`);
  await p.waitFor(`/登録しました|registered/.test(document.getElementById("billingMessage").textContent)`, 8000); await sleep(800);
}
try {
  // ---- new store: card first ----
  let p = await open("newOwner");
  let g = await gate(p);
  t("U1 カード未登録：手順（①アカウント ✓ ②メール確認 ✓ ③カード登録＝今の手順 ④登録・引き継ぎ）を表示・「店舗・施設を登録する」は押せない・カード登録への案内", g.steps.length === 4 && g.steps[0].startsWith("done") && g.steps[1].startsWith("done") && g.steps[2].startsWith("todo current") && /クレジットカード/.test(g.steps[2]) && g.registerDisabled === true && /クレジットカードの登録が必要/.test(g.notice) && g.overflow === false, g);
  await p.ev(`document.getElementById("cardGateLink").click(), true`);
  await registerCard(p);
  g = await gate(p);
  t("U2 案内からカードを登録すると、元の作業（店舗の登録フォーム）へ自動で戻る・③が完了・登録ボタンが使える", g.steps[2].startsWith("done") && g.notice === "" && g.registerDisabled === false && g.formOpen === true, g);
  const cat = await p.ev(`(() => { const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input")); el.dispatchEvent(new Event("change")); }; set("storeNameInput", "新しいカフェ"); const c = document.getElementById("storeCategorySelect"); set("storeCategorySelect", c.options[c.options.length > 1 ? 1 : 0].value); set("storeCountrySelect", "JP"); set("storeAddressInput", "沖縄県島尻郡八重瀬町1-1"); document.getElementById("storePreviewButton").click(); return c.value; })()`);
  await p.waitFor(`!document.getElementById("storeRegisterButton").disabled`, 10000);
  await p.ev(`document.getElementById("storeRegisterButton").click(), true`);
  await p.waitFor(`document.getElementById("storeForm").hidden`, 10000); await sleep(1000);
  const owned = [...S.docs.entries()].filter(([k, v]) => k.startsWith("storeMembers/") && v.uid === "n1");
  const stored = owned.length ? S.docs.get("storeAccounts/" + owned[0][1].storeId) : null;
  t("U3 カード登録後の新規登録：すぐに利用可能（active）で作成され、運営の承認待ちにならない", !!stored && stored.registrationStatus === "active", { cat, owned: owned.length, stored });
  await p.close();

  // ---- takeover from the listing ----
  p = await open("claimer", "?claim=L1");
  g = await gate(p);
  t("U4 運営掲載の引き継ぎ（?claim=）：カード未登録の間は引き継ぎボタンが押せず、カード登録への案内を表示", g.claimShown && g.claimDisabled === true && /クレジットカードの登録が必要/.test(g.claimNotice), g);
  const claimTexts = await p.ev(`document.getElementById("claimSection").innerText`);
  t("U5 引き継ぎの説明は「運営の確認なしで、すぐに完了」（運営が確認・申請コードの案内は出さない）", /運営の確認なしで、すぐに引き継ぎが完了/.test(claimTexts) && !/申請コード/.test(claimTexts.replace(/あなたのオーナー申請[\s\S]*$/, "")), claimTexts.slice(0, 300));
  await p.ev(`document.getElementById("claimCardGateLink").click(), true`);
  await registerCard(p);
  g = await gate(p);
  const ru = await p.ev(`window.__returnUrl || ""`);
  t("U6 カード登録後は引き継ぎへ戻れる（引き継ぎボタンが使える・カード会社の画面から戻る時も ?claim= を保つ）", g.claimDisabled === false && g.claimNotice === "" && /billingAccount=1&claim=L1/.test(ru), { g, ru });
  await p.ev(`document.getElementById("claimSubmitButton").click(), true`);
  await p.waitFor(`/引き継ぎが完了しました/.test(document.getElementById("claimMessage").textContent)`, 10000); await sleep(1500);
  g = await gate(p);
  t("U7 「このお店を引き継ぐ」→ その場で完了（運営の承認待ちなし）・あなたの店舗に表示", /引き継ぎが完了しました/.test(g.claimMsg) && /八重瀬の食堂/.test(g.stores) && S.docs.get("storeListingLinks/L1").status === "active", g);
  await p.close();
  p = await open("claimer", "", "en", 1280);
  g = await gate(p);
  t("U8 英語・PC：手順の表示も英語", g.steps.length === 4 && /Register a credit card/.test(g.steps[2]) && /Register a store, or take over/.test(g.steps[3]), g.steps);
  await p.close();

  // ---- TOP entry ----
  const top = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, articles: [] } });
  await top.goto("/"); await top.waitFor(`typeof shops !== "undefined" && shops.some((s) => s.firestoreId === "L1")`, 20000); await sleep(800);
  const link = await top.ev(`(() => { const get = (id) => { openShopModal(id, "card"); const a = document.getElementById("modalClaimLink"); return { shown: getComputedStyle(a).display !== "none", href: a.getAttribute("href"), text: a.textContent.trim() }; }; return { listing: get("L9"), claimed: get("L1"), ops: get("OPS") }; })()`);
  t("U9 TOPの運営掲載の詳細に「このお店の方へ：お店の情報を管理する」→ store-account.html?claim=L9（運営の常設店舗広告だけ・引き継ぎ済みの L1 には出さない）", link.listing.shown && link.listing.href === "store-account.html?claim=L9" && /お店の情報を管理する/.test(link.listing.text) && link.claimed.shown === false && link.ops.shown === false, link);
  t("U10 TOPでJSエラーなし・Firestoreへの直接の書き込みなし", top.log.errors.length === 0 && !top.log.blocked.includes("firestore-write"), top.log.errors);
  await top.close();
} finally {
  browser.close(); server.close();
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
