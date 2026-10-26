// STEP 42-G: listing takeover screens. (1) admin-store-claims.html no longer shows the old identity-check procedure,
// keeps the takeover history and link revoke. (2) The TOP "このお店の方へ" entry is hidden for listings that already have an
// active takeover link (server state via publicStoreProfiles.claimedListingIds); the server still refuses double takeovers.
// REAL moderate-submission handler on mocked firebase-admin (optimistic-concurrency transactions). No real services.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-claim-entry-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8873";
const ADMIN = "9413yutaka@gmail.com";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = ADMIN;
Object.assign(process.env, { VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01" });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const NOWS = Math.floor(Date.now() / 1000);
const tok = (email) => b64({ alg: "RS256" }) + "." + b64({ user_id: "a", sub: "a", email, exp: NOWS + 3600, iat: NOWS, aud: "chikashoku-app", iss: "https://securetoken.google.com/chikashoku-app", firebase: { sign_in_provider: "password" } }) + ".s";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "owner-one@example.com"), u2: pw("u2", "owner-two@example.com"), u3: pw("u3", "owner-three@example.com"), admin: pw("adm1", ADMIN), [tok(ADMIN)]: pw("adm1", ADMIN) };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
// Google geocoding is answered by a local stub; local (Chrome DevTools) passes; any other network is an error.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname !== "maps.googleapis.com") throw new Error("unexpected network " + url);
  return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: "日本、沖縄県島尻郡八重瀬町", geometry: { location: { lat: 26.15, lng: 127.72 } }, address_components: [{ types: ["country", "political"], short_name: "JP", long_name: "Japan" }, { types: ["administrative_area_level_1", "political"], short_name: "沖縄県", long_name: "沖縄県" }, { types: ["locality", "political"], short_name: "八重瀬町", long_name: "八重瀬町" }] }] }) };
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
let ip = 0;
async function post(body, token) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function get(query) { const r = res(); await handler({ method: "GET", headers: {}, query }, r); return r; }

const at = Timestamp.fromMillis(Date.now() - 86400000);
const LISTING = { title: "本日のおすすめ", category: "グルメ", content: "地元の食材の定食。", address: "沖縄県島尻郡八重瀬町", latitude: 26.15, longitude: 127.72, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], takeout: false, imageUrls: [], createdAt: at, updatedAt: at };
S.docs.set("submissions/L1", { ...LISTING, shopName: "まだ引き継がれていない食堂" });
S.docs.set("submissions/L2", { ...LISTING, shopName: "引き継ぎ済みのカフェ", latitude: 26.151 });
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid + "SECRET", paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
["u1", "u2", "u3"].forEach(card);
const CLAIM = (id) => ({ mode: "storeListingClaimCreate", submissionId: id, targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "" });
const claimedIds = async () => { const r = await get({ mode: "publicStoreProfiles" }); return { r, ids: (r.body && r.body.claimedListingIds) || null }; };

// ===================== server =====================
let c = await claimedIds();
t("S1 引き継ぎ前：公開の店舗一覧（publicStoreProfiles・ログイン不要）の claimedListingIds は空", c.r.code === 200 && Array.isArray(c.ids) && c.ids.length === 0, c.r.body);
const both = await Promise.all([post(CLAIM("L2"), "u1"), post(CLAIM("L2"), "u2")]);
const codes = both.map((r) => r.code).sort();
const fromL2 = [...S.docs.entries()].filter(([k, v]) => k.startsWith("storeAccounts/") && v.sourceSubmissionId === "L2");
t("S2 同時の引き継ぎ（カード登録済みの2アカウントが同時に L2）：1件だけ成立・もう1件は 409 listing_already_linked・店舗は1つだけ", JSON.stringify(codes) === "[200,409]" && both.find((r) => r.code === 409).body.reason === "listing_already_linked" && fromL2.length === 1 && S.docs.get("storeListingLinks/L2").status === "active", { codes, bodies: both.map((r) => r.body), stores: fromL2.length });
const winner = both.find((r) => r.code === 200).body.storeId;
c = await claimedIds();
const raw = JSON.stringify(c.r.body);
t("S3 引き継ぎ後：claimedListingIds は [\"L2\"]（店舗は下書きのまま＝suppressedListingIds には入らない）・キャッシュの設定は従来どおり", JSON.stringify(c.ids) === '["L2"]' && JSON.stringify(c.r.body.suppressedListingIds) === "[]" && /s-maxage=/.test(c.r.headers["Cache-Control"] || ""), c.r.body);
t("S4 公開の応答に、紐付け先の店舗ID・店主（uid・メール）・申請・カード（Stripe 顧客）の情報を含まない", !raw.includes(winner) && !/u1|u2|owner-one|owner-two|@example\.com|SECRET|cus|claimId/.test(raw), raw);
const again = await post(CLAIM("L2"), "u3");
t("S5 画面の表示に関係なく、サーバーは引き継ぎ済みの掲載を拒否（409 listing_already_linked）", again.code === 409 && again.body.reason === "listing_already_linked", again.body);

// ===================== browser =====================
async function api(url, method, log, postData, headers) {
  if (method === "GET") {
    const u = new URL(url, ORIGIN);
    if (u.pathname !== "/api/moderate-submission") return null;
    if (u.searchParams.get("mode") === "publicStoreProfiles" && apiState.profiles500) return { status: 500, body: { success: false } };
    const q = Object.fromEntries(u.searchParams.entries());
    if (q.mode && q.mode !== "publicStoreProfiles") return null;
    const r = await get(q);
    return { status: r.code, body: r.body };
  }
  const body = JSON.parse(postData || "{}");
  const auth = headers.Authorization || headers.authorization;
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...(auth ? { authorization: auth } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return { status: r.code, body: r.body };
}
const apiState = { profiles500: false };
const authMock = async (url) => {
  if (url.includes("signInWithPassword")) return { body: { localId: "a", email: ADMIN, idToken: tok(ADMIN), refreshToken: "r", expiresIn: "3600", registered: true } };
  if (url.includes("lookup")) return { body: { users: [{ localId: "a", email: ADMIN, emailVerified: true, providerUserInfo: [{ providerId: "password", email: ADMIN }] }] } };
  return { body: { id_token: tok(ADMIN), refresh_token: "r", expires_in: "3600" } };
};
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
const server = await serve(REPO_ROOT + "", 8873);
const browser = await launchChrome();
async function openTop(lang = "ja", w = 390) {
  const p = await openPage(browser, { origin: ORIGIN, width: w, mobile: w < 800, state: { apiMock: api, articles: [], initScripts: [langInit(lang)] } });
  await p.goto("/"); await p.waitFor(`typeof shops !== "undefined" && shops.some((s) => s.firestoreId === "L1") && shops.some((s) => s.firestoreId === "L2")`, 20000); await sleep(1500);
  return p;
}
const entry = (p) => p.ev(`(() => { const get = (id) => { openShopModal(id, "card"); const a = document.getElementById("modalClaimLink"); const out = { shown: getComputedStyle(a).display !== "none", href: a.getAttribute("href"), text: a.textContent.trim() }; return out; }; return { L1: get("L1"), L2: get("L2") }; })()`);
try {
  let p = await openTop("ja");
  let e = await entry(p);
  t("U1 未ログインの旅行者：まだ引き継がれていない掲載（L1）には「このお店の方へ：お店の情報を管理する」→ store-account.html?claim=L1", e.L1.shown && e.L1.href === "store-account.html?claim=L1" && /お店の情報を管理する/.test(e.L1.text), e);
  t("U2 引き継ぎ済みの掲載（L2）には入口を出さない（掲載の詳細そのものは表示）", e.L2.shown === false, e);
  t("U3 TOPでJSエラーなし・Firestoreへの直接の書き込みなし", p.log.errors.length === 0 && !p.log.blocked.includes("firestore-write"), p.log.errors);
  await p.close();
  p = await openTop("en", 1280);
  e = await entry(p);
  t("U4 英語・PC：L1 の入口は英語の文言で表示、L2 は出さない", e.L1.shown && !/[ぁ-んァ-ン]/.test(e.L1.text) && e.L1.text.length > 0 && e.L2.shown === false, e);
  await p.close();
  apiState.profiles500 = true;
  p = await openTop("ja");
  e = await entry(p);
  // STEP 43-N C案｜一般に開いているか(listingClaimOpen)が分からない時は入口を出さない(以前は出していた)。掲載の表示は止めない。
  t("U5 店舗一覧の取得に失敗した時は入口を出さない（一般に開いているか分からないため）", e.L1.shown === false && e.L2.shown === false, e);
  await p.close();
  apiState.profiles500 = false;
  process.env.VERCEL_ENV = "production";
  p = await openTop("ja");
  e = await entry(p);
  t("U5b Production（本番カード登録の先行テスト中＝一般公開のスイッチ false）：まだ引き継がれていない掲載（L1）にも入口を出さない・JSエラーなし", e.L1.shown === false && e.L2.shown === false && p.log.errors.length === 0, { e, errors: p.log.errors });
  await p.close();
  process.env.VERCEL_ENV = "preview";

  // ---- admin-store-claims ----
  const a = await openPage(browser, { origin: ORIGIN, width: 1280, state: { apiPassthrough: true, apiMock: api, authMock } });
  await a.goto("/admin-store-claims.html"); await a.waitFor("document.readyState === 'complete'"); await sleep(800);
  await a.ev(`(() => { document.getElementById("adminEmail").value = ${JSON.stringify(ADMIN)}; document.getElementById("adminPassword").value = "x"; document.getElementById("loginButton").click(); return true; })()`);
  await a.waitFor(`document.querySelectorAll("#linkList .claim-card").length === 1 && document.querySelectorAll("#decidedList .claim-card").length >= 1`, 20000); await sleep(800);
  const view = await a.ev(`({ area: document.getElementById("adminArea").innerText, guide: document.getElementById("claimFlowGuide").innerText, links: document.getElementById("linkList").innerText, decided: document.getElementById("decidedList").innerText, pendingList: !!document.getElementById("pendingList"), approveUi: document.querySelectorAll('[data-action="approve"], [data-action="reject"], .claim-channel').length })`);
  t("A1 旧方式の「本人確認の手順」（公式連絡先へ運営が連絡・確認OKの手順）を表示しない", !/本人確認の手順|運営が自分で連絡先を見つける|お店として承認しますか|公式連絡先の管理者から承認の回答/.test(view.area), view.area.slice(0, 500));
  t("A2 代わりの短い案内：アカウント作成・メール確認・カード登録で運営の承認なしに自動で紐付く・1掲載に有効な紐付けは1つ・解除できる（新しい確認の条件は書かない）", /アカウント作成・メール確認・クレジットカード登録/.test(view.guide) && /運営の承認なしで自動/.test(view.guide) && /有効な紐付けは1つ/.test(view.guide) && /解除できます/.test(view.guide) && !/電話|公式サイト|本人確認|審査/.test(view.guide), view.guide);
  t("A3 自動の引き継ぎの履歴を表示（掲載・申請コード・「引き継ぎ方法：自動」）", /引き継ぎ済みのカフェ/.test(view.decided) && /引き継ぎ方法：自動（アカウント・メール確認・カード登録済み、運営の承認なし）/.test(view.decided) && /申請コード/.test(view.decided), view.decided.slice(0, 400));
  t("A4 有効な紐付けに L2（紐付け先の店舗）を表示・旧方式の確認待ちの一覧と承認・却下・連絡先の選択は無い（STEP 43-B）", /L2/.test(view.links) && view.links.includes(winner) && view.pendingList === false && view.approveUi === 0 && !/確認待ちのオーナー申請/.test(view.area), { links: view.links, pendingList: view.pendingList, approveUi: view.approveUi });
  await a.ev(`(() => { window.confirm = () => true; const card = document.querySelector('#linkList .claim-card[data-submission-id="L2"]'); card.querySelector(".link-revoke-reason").value = "試験：誤った紐付けの解除"; card.querySelector('button[data-action="revoke"]').click(); return true; })()`);
  await a.waitFor(`/紐付けを解除しました/.test(document.getElementById("linkMessage").textContent)`, 15000); await sleep(800);
  const afterRevoke = await a.ev(`document.getElementById("linkList").innerText`);
  const link = S.docs.get("storeListingLinks/L2");
  t("A5 運営の紐付け解除は従来どおり（理由つき・履歴を残す・店舗アカウントは残る）", link.status === "revoked" && (link.history || []).some((h) => h.event === "revoked") && !!S.docs.get("storeAccounts/" + winner) && /有効な紐付けはありません/.test(afterRevoke), { status: link.status, afterRevoke });
  t("A6 管理画面でJSエラーなし", a.log.errors.length === 0, a.log.errors);
  await a.close();

  // ---- admin.html menu (STEP 42-G 継続) ----
  const m = await openPage(browser, { origin: ORIGIN, width: 1280, state: { apiPassthrough: true, apiMock: api, authMock } });
  await m.goto("/admin.html"); await m.waitFor("document.readyState === 'complete'"); await sleep(800);
  await m.ev(`(() => { document.getElementById("adminEmail").value = ${JSON.stringify(ADMIN)}; document.getElementById("adminPassword").value = "x"; document.getElementById("loginButton").click(); return true; })()`);
  await m.waitFor(`!!document.querySelector('a.admin-menu-link[href="admin-store-claims.html"]') && document.querySelector('a.admin-menu-link[href="admin-store-claims.html"]').offsetParent !== null`, 20000); await sleep(1500);
  const menu = await m.ev(`(() => { const l = document.querySelector('a.admin-menu-link[href="admin-store-claims.html"]'); return { note: l.querySelector(".admin-menu-link-note").textContent.trim(), title: l.querySelector(".admin-menu-link-title").textContent.replace(/\s+/g, " ").trim(), badge: !!document.getElementById("storeListingClaimPendingBadge"), area: document.getElementById("adminArea").innerText }; })()`);
  t("M1 管理メニューの説明文は「店舗の自動引き継ぎ履歴の確認・紐付け解除」・旧文言（本人確認・公式連絡先・承認・却下）は出ない", menu.note === "店舗の自動引き継ぎ履歴の確認・紐付け解除" && !/本人確認|公式連絡先で確認/.test(menu.area), menu);
  t("M2 リンクのタイトルは従来どおり・旧方式の「未対応 ○件」は撤去（STEP 43-B）", /オーナー申請（無料掲載の引き継ぎ）/.test(menu.title) && !/未対応/.test(menu.title) && menu.badge === false, menu);
  await m.ev(`document.querySelector('a.admin-menu-link[href="admin-store-claims.html"]').click(), true`);
  await m.waitFor(`location.pathname === "/admin-store-claims.html" && document.readyState === "complete"`, 15000); await sleep(800);
  const landed = await m.ev(`({ path: location.pathname, h: document.querySelector("h1") ? document.querySelector("h1").textContent.trim() : "" })`);
  t("M3 管理メニューから admin-store-claims.html へ遷移できる", landed.path === "/admin-store-claims.html", landed);
  // この試験で用意していない別機能（Editor一覧＝Firebase SDK の直接取得、読み物の選択肢＝GET）の取得失敗の記録だけは除く。
  const menuErrors = m.log.errors.filter((x) => !/Editor一覧を取得できませんでした|読み物の選択肢を取得できませんでした/.test(x));
  t("M4 管理メニューでJSエラーなし（試験で用意していない別機能の取得失敗の記録を除く）", menuErrors.length === 0, m.log.errors);
  await m.close();
  const nonAdmin = await post({ mode: "adminStoreListingClaimList" }, "u1");
  t("M5 権限は従来どおり：店主のアカウントでは運営の申請一覧を取得できない", nonAdmin.code === 403 || nonAdmin.code === 401, nonAdmin.code);

  c = await claimedIds();
  p = await openTop("ja");
  e = await entry(p);
  t("U6 解除後は claimedListingIds から外れ、L2 にも入口が戻る（再び引き継げる）", JSON.stringify(c.ids) === "[]" && e.L2.shown && e.L2.href === "store-account.html?claim=L2", { ids: c.ids, e });
  await p.close();
} finally {
  browser.close(); server.close();
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
