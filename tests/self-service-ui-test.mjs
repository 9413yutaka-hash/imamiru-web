// STEP 57 client: store-account.html as the one place where an owner manages everything, at phone width (ja/en).
// Store list with publish / ¥100-plan state and the permanent URL (copy), the 6-step guide, the management guide,
// coming back to a takeover (?claim=) after email verification, keeping the new-store form through a reload,
// and picking up email verification when the tab becomes visible again.
// Store login faked in the browser; POST /api answered in-process by the REAL handler (mocked firebase-admin).
// No Stripe calls (card already registered in the fixture), no real services, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/self-service-ui-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8879;
const ORIGIN = "http://127.0.0.1:" + PORT;
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
Object.assign(process.env, { STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup" });
const pw = (uid, verified = true) => ({ uid, email: uid + "@example.com", email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { own: pw("uo"), drf: pw("ud"), unv: pw("uv", false), unvOk: pw("uv") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const realFetch = globalThis.fetch;
let otherNetwork = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  otherNetwork++; throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
async function api(url, method, log, postData, headers) {
  if (method === "GET") return null;
  const body = JSON.parse(postData || "{}");
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(x) { this.body = x; return this; }, setHeader() {}, send(x) { this.body = x; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...(headers.Authorization || headers.authorization ? { authorization: headers.Authorization || headers.authorization } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  for (const k of [...S.docs.keys()]) if (k.includes("RateLimits/")) S.docs.delete(k);
  return { status: r.code, body: r.body };
}
// token：ログイン中のトークン。verifiedToken があれば、window.__verifyNow の後の reload で確認済みになる。
const fakeStoreAuth = (token, verified = true, verifiedToken = "") => `(() => { let fb; Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) { fb = v; if (v && v.initializeApp && !v.__wrapped) { const orig = v.initializeApp.bind(v); v.__wrapped = true; v.initializeApp = function(options, name) {
if (name === 'machinauStoreAccount') { const u = { uid: "u", email: "x@example.com", isAnonymous: false, emailVerified: ${verified}, getIdToken: async () => (u.emailVerified && ${JSON.stringify(verifiedToken)} ? ${JSON.stringify(verifiedToken)} : ${JSON.stringify(token)}), reload: async () => { window.__reloads = (window.__reloads || 0) + 1; if (window.__verifyNow) u.emailVerified = true; }, sendEmailVerification: async () => {} }; return { name, auth: () => ({ currentUser: u, onAuthStateChanged(cb) { setTimeout(() => cb(u), 0); return () => {}; }, signOut: async () => {} }) }; } return orig(options, name); }; } } });
window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { window.__copied.push(text); } }, configurable: true }); })();`;
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, setupStatus: "succeeded", detachPendingPaymentMethods: [], pendingSetupIntentId: "" } });
function seed(uid, id, status, createdOffset) {
  S.docs.set("storeMembers/" + id + "_" + uid, { storeId: id, uid, role: "owner", status: "active" });
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, enabled: true, registrationStatus: "active", createdByType: "storeUser", countryCode: "JP", prefecture: "沖縄県", city: "那覇市", latitude: 26.21, longitude: 127.68, duplicateCandidates: [], reviewFlags: [], createdAt: Timestamp.fromMillis(Date.now() - createdOffset) });
  S.docs.set("storeProfiles/" + id, { storeId: id, status, storeName: "店" + id, revision: 1, categoryCode: "cafe_sweets", description: "紹介文", moderationStatus: "passed", moderatedText: "紹介文", photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/p.webp", publicId: "machinau_store_profiles/" + id + "/p", moderationStatus: "passed" }] });
}
const monthly = (id, uid, o = {}) => S.docs.set("storeCustomPlans/" + id, { storeId: id, status: "active", ownerUid: uid, periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(Date.now() - 40 * 86400000), accessUntil: null, paymentStatus: "current", ...o });
card("uo"); card("ud");
seed("uo", "SA", "published", 3000); monthly("SA", "uo");
seed("uo", "SB", "draft", 2000);
seed("uo", "SC", "published", 1000); monthly("SC", "uo", { status: "canceling", accessUntil: Timestamp.fromMillis(Date.now() + 10 * 86400000) });
seed("ud", "SD", "draft", 1000);

const server = await serve(REPO_ROOT + "", PORT);
const browser = await launchChrome();
async function open(token, path = "/store-account.html", lang = "ja", opts = {}) {
  const p = await openPage(browser, { origin: ORIGIN, width: 375, mobile: true, state: { apiPassthrough: true, apiMock: api, articles: [], initScripts: [fakeStoreAuth(token, opts.verified !== false, opts.verifiedToken || ""), langInit(lang)] } });
  await p.goto(path);
  await p.waitFor(`!document.getElementById("accountView").hidden`, 15000);
  if (opts.verified !== false) await p.waitFor(`document.querySelectorAll("#storeList li").length > 0`, 15000);
  await sleep(800);
  return p;
}
const cards = (p) => p.ev(`[...document.querySelectorAll("#storeList li")].map((li) => ({ name: li.querySelector(".store-card-name").textContent, visible: (li.querySelector("[data-store-visible]") || {}).textContent || "", visibleCode: (li.querySelector("[data-store-visible]") || { getAttribute: () => "" }).getAttribute("data-store-visible"), plan: (li.querySelector("[data-store-plan]") || {}).textContent || "", planCode: (li.querySelector("[data-store-plan]") || { getAttribute: () => "" }).getAttribute("data-store-plan"), url: (li.querySelector("[data-store-page-url]") || {}).textContent || "", links: [...li.querySelectorAll("a.store-card-link")].map((a) => a.getAttribute("href")) }))`);
const steps = (p) => p.ev(`[...document.querySelectorAll("#onboardingSteps li")].map((li) => ({ text: li.textContent, cls: li.className }))`);

try {
  // ===== 店舗一覧(3店舗：公開中・契約中／下書き・未契約／公開中・解約済み) =====
  let p = await open("own");
  const c = await cards(p);
  const byName = Object.fromEntries(c.map((x) => [x.name, x]));
  t("S1 店舗ごとに公開の状態・月額100円プランの状態を表示(公開中・契約中／非公開・未契約／解約済み)", c.length === 3 && byName["店SA"].visibleCode === "yes" && byName["店SA"].planCode === "active" && byName["店SA"].plan === "月額100円プラン：契約中" && byName["店SB"].visibleCode === "no" && byName["店SB"].planCode === "none" && /未契約/.test(byName["店SB"].plan) && byName["店SC"].planCode === "canceling" && /解約済み（.+まで公開できます）/.test(byName["店SC"].plan), c);
  t("S2 店舗ごとの固定の URL・編集(申し込み・解約・公開)への入口", ["SA", "SB", "SC"].every((id) => byName["店" + id].url === "https://machinau.jp/shop/" + id && byName["店" + id].links.includes("store-profile.html?store=" + id)), c);
  await p.ev(`document.querySelector('[data-store-page-copy="SB"]').click(); true`);
  await p.waitFor(`window.__copied.length === 1`, 5000);
  t("S3 「URLをコピー」：その店舗の固定の URL をコピーし、案内を表示(下書きの店舗は「公開されている間だけ開きます」)", (await p.ev(`window.__copied[0]`)) === "https://machinau.jp/shop/SB" && (await p.ev(`[...document.querySelectorAll("#storeList li")].find((li) => li.textContent.includes("店SB")).textContent.includes("URLをコピーしました。")`)) && (await p.ev(`[...document.querySelectorAll("#storeList li")].find((li) => li.textContent.includes("店SB")).textContent.includes("今は開けません")`)));
  let st = await steps(p);
  t("S4 手順は⑤公開まで(STEP 58｜登録・引き継ぎと月額100円の契約は同じ手続き)・すべて済み(カード・登録と契約・公開)", st.length === 5 && st.every((s) => s.cls.startsWith("done")) && /④/.test(st[3].text) && /月額100円/.test(st[3].text) && /⑤/.test(st[4].text), st);
  const help = await p.ev(`({ text: document.getElementById("storeManagementHelpNote").textContent, noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 })`);
  t("S5 管理の案内(編集・公開・申し込み・解約／請求・領収書／カード／退会の場所)・横にはみ出さない", /解約/.test(help.text) && /領収書/.test(help.text) && /アカウントの削除/.test(help.text) && /お支払い方法/.test(help.text) && help.noHScroll, help);
  t("S6 JavaScript のエラーなし(店舗一覧)", p.log.errors.length === 0, p.log.errors);
  await p.close();

  // ===== 契約の無い店舗だけのアカウント(STEP 58 より前に作った下書き)：④(同意して登録・引き継ぎ＝契約)が次にすること =====
  p = await open("drf");
  st = await steps(p);
  t("S7 契約の無い店舗だけ：④(登録・引き継ぎと契約)が「次にすること」(current)・⑤は未完了", st.length === 5 && st[2].cls.startsWith("done") && st[3].cls === "todo current" && st[4].cls === "todo", st);

  // ===== STEP 58｜契約の前に入力を途中保存しない(STEP 57 の入力の保持は撤去・前の版の控えも消す) =====
  await p.ev(`document.getElementById("openStoreFormButton").click(); true`);
  await p.waitFor(`!document.getElementById("storeForm").hidden`, 5000);
  await p.ev(`(() => { const n = document.getElementById("storeNameInput"); n.value = "途中まで入れた店"; n.dispatchEvent(new Event("input", { bubbles: true })); const a = document.getElementById("storeAddressInput"); a.value = "沖縄県那覇市松尾1-1"; a.dispatchEvent(new Event("input", { bubbles: true })); sessionStorage.setItem("machinauStoreFormDraft", JSON.stringify({ storeName: "前の版の控え", address: "x" })); return true; })()`);
  await p.ev(`location.reload(); true`);
  await p.waitFor(`!document.getElementById("accountView").hidden && document.querySelectorAll("#storeList li").length > 0`, 15000); await sleep(800);
  await p.ev(`document.getElementById("openStoreFormButton").click(); true`);
  await p.waitFor(`!document.getElementById("storeForm").hidden`, 5000);
  const restored = await p.ev(`({ name: document.getElementById("storeNameInput").value, address: document.getElementById("storeAddressInput").value, saved: sessionStorage.getItem("machinauStoreFormDraft") })`);
  t("S8 新規登録の入力は端末に残さない(再読み込みで空・前の版の控えも消える)", restored.name === "" && restored.address === "" && restored.saved === null, restored);
  const form = await p.ev(`({ consent: !!document.getElementById("storeConsentCheck") && document.getElementById("storeConsentCheck").checked === false, terms: /月額100円/.test(document.getElementById("storePlanTerms").innerText), disabled: document.getElementById("storeRegisterButton").disabled, noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1 })`);
  t("S9 登録のフォームに料金と条件・同意のチェック(未チェック)・登録ボタンは押せない・横にはみ出さない(375px)", form.consent && form.terms && form.disabled === true && form.noHScroll, form);
  await p.close();

  // ===== 引き継ぎの途中でメール確認 → ?claim= の無い画面に戻っても続きへ =====
  p = await open("drf", "/store-account.html?claim=LX1");
  const saved = await p.ev(`JSON.parse(localStorage.getItem("machinauPendingClaim") || "null")`);
  const hiddenOnClaimPage = await p.ev(`document.getElementById("claimResumeNotice").hidden`);
  await p.goto("/store-account.html");
  await p.waitFor(`!document.getElementById("accountView").hidden && document.querySelectorAll("#storeList li").length > 0`, 15000); await sleep(800);
  const resume = await p.ev(`({ hidden: document.getElementById("claimResumeNotice").hidden, href: document.getElementById("claimResumeLink").getAttribute("href"), text: document.getElementById("claimResumeNotice").textContent })`);
  t("S10 引き継ぎの画面(?claim=LX1)で開くと、この端末に掲載 ID だけを覚える(その画面には案内を出さない)", saved && saved.id === "LX1" && typeof saved.savedAt === "number" && Object.keys(saved).length === 2 && hiddenOnClaimPage === true, saved);
  t("S11 ?claim= の無い画面に戻ると「引き継ぎの手続きを続ける」(?claim=LX1 へ)", resume.hidden === false && resume.href === "store-account.html?claim=LX1" && /引き継ぎの途中です/.test(resume.text), resume);
  await p.ev(`document.getElementById("claimResumeDismiss").click(); true`);
  const dismissed = await p.ev(`({ hidden: document.getElementById("claimResumeNotice").hidden, saved: localStorage.getItem("machinauPendingClaim") })`);
  t("S12 「この案内を消す」で消える(控えも消す)", dismissed.hidden === true && dismissed.saved === null, dismissed);
  await p.ev(`localStorage.setItem("machinauPendingClaim", JSON.stringify({ id: "LX2", savedAt: Date.now() - 25 * 3600 * 1000 })); true`);
  await p.goto("/store-account.html");
  await p.waitFor(`!document.getElementById("accountView").hidden && document.querySelectorAll("#storeList li").length > 0`, 15000); await sleep(800);
  t("S13 24時間を過ぎた控えでは案内しない", (await p.ev(`document.getElementById("claimResumeNotice").hidden`)) === true);
  await p.close();

  // ===== メール確認：タブに戻ったら、ボタンを押さなくても取り直す =====
  p = await open("unv", "/store-account.html", "ja", { verified: false, verifiedToken: "unvOk" });
  const before = await p.ev(`({ section: document.getElementById("storeSection").hidden, required: document.getElementById("storeVerifyRequired").hidden })`);
  await p.ev(`window.__verifyNow = true; window.dispatchEvent(new Event("focus")); true`);
  await p.waitFor(`!document.getElementById("storeSection").hidden`, 10000); await sleep(500);
  const after = await p.ev(`({ section: document.getElementById("storeSection").hidden, message: (document.getElementById("message") || {}).textContent || "", reloads: window.__reloads })`);
  t("S14 メール未確認の間は店舗の手続きを出さない → 確認してタブに戻ると自動で取り直し、店舗の手続きへ進める", before.section === true && before.required === false && after.section === false && after.reloads >= 1, { before, after });
  t("S15 JavaScript のエラーなし(メール確認・引き継ぎの再開・入力の控え)", p.log.errors.length === 0, p.log.errors);
  await p.close();

  // ===== 英語 =====
  p = await open("own", "/store-account.html", "en");
  const enCards = await cards(p);
  st = await steps(p);
  const enHelp = await p.ev(`document.getElementById("storeManagementHelpNote").textContent`);
  t("S16 英語：状態・手続きの案内・手順④⑤が英語", enCards.some((x) => x.plan === "¥100/month plan: subscribed") && enCards.some((x) => x.visible === "Shown to travelers") && /Delete account/.test(enHelp) && st.length === 5 && /^4\. Agree/.test(st[3].text) && /^5\. /.test(st[4].text),{ enCards, st: st.map((s) => s.text), enHelp });
  await p.close();
  t("S17 外部への通信なし(試験の偽物以外)", otherNetwork === 0, otherNetwork);
} finally {
  browser.close(); server.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
