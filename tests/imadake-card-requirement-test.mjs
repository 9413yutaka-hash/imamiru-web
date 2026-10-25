// STEP 35-A: 今だけ投稿のカード登録必須。判定(api/_lib/imadake-card-requirement.js)と、REAL handleImadakePostCreate への
// 組み込み(課金対象の投稿だけ・回数制限より前・保存トランザクション内の再確認)を、Stripe・ネットワークなしで確かめる。
// run: node --import ./tests/mockfa-occ/register.mjs tests/imadake-card-requirement-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import fs from "node:fs";

const CR = await import(REPO_URL + "/api/_lib/imadake-card-requirement.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const SP = await import(REPO_URL + "/api/_lib/store-profile.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };

const NOW = Date.parse("2026-10-20T03:00:00Z"); // 2026-10 (JST)
const CARD = (o = {}) => ({ brand: "visa", last4: "4242", expMonth: 12, expYear: 2030, ...o });
const SECTION = (o = {}) => ({ customerId: "cus_TestCustomer1", paymentMethodId: "pm_TestCard1", card: CARD(), cardVersion: 1, setupStatus: "succeeded", detachPendingPaymentMethods: [], ...o });
// STEP 42-C｜カードはアカウント単位(accountBilling/{uid})。店舗 s1 の請求先は owner の u1。
const DOC = (o = {}, section = SECTION()) => ({ uid: "u1", test: section, ...o });
const ev = (data, nowMs = NOW) => CR.evaluateImadakeBillingCard(data, "u1", "test", nowMs);

// ---------------- U: the judgment ----------------
t("U1 有効なカード：ok", ev(DOC()).ok === true && ev(DOC()).paymentMethodId === "pm_TestCard1");
t("U2 accountBilling の文書が無い：card_required", ev(null).reason === "card_required");
t("U3 その環境のモードの区画が無い（live だけ等）：card_required", ev({ uid: "u1", live: SECTION() }).reason === "card_required");
t("U4 登録の途中だけ（pendingSetupIntentId だけ・paymentMethodId なし）：card_required", ev(DOC({}, { customerId: "cus_TestCustomer1", pendingSetupIntentId: "seti_123" })).reason === "card_required");
t("U5 文書の uid が請求先アカウントと違う：card_account_mismatch", ev(DOC({ uid: "other" })).reason === "card_account_mismatch");
t("U5b 文書に uid が無い：card_invalid", ev({ test: SECTION() }).reason === "card_invalid");
t("U6 確定済みでない（setupStatus が succeeded 以外）：card_invalid", ev(DOC({}, SECTION({ setupStatus: "requires_action" }))).reason === "card_invalid");
t("U7 顧客IDが無い・形が違う：card_invalid", ev(DOC({}, SECTION({ customerId: "" }))).reason === "card_invalid" && ev(DOC({}, SECTION({ customerId: "x_1" }))).reason === "card_invalid");
t("U8 paymentMethodId の形が違う：card_invalid", ev(DOC({}, SECTION({ paymentMethodId: "card_123" }))).reason === "card_invalid");
t("U9 正式なカードが取り外し待ち：card_retiring", ev(DOC({}, SECTION({ detachPendingPaymentMethods: [{ paymentMethodId: "pm_TestCard1", state: "pending" }] }))).reason === "card_retiring");
t("U10 有効期限の情報が無い・不正：card_invalid", ev(DOC({}, SECTION({ card: null }))).reason === "card_invalid" && ev(DOC({}, SECTION({ card: CARD({ expMonth: 0 }) }))).reason === "card_invalid" && ev(DOC({}, SECTION({ card: CARD({ expYear: 0 }) }))).reason === "card_invalid");
t("U11 有効期限切れ（先月・去年）：card_expired", ev(DOC({}, SECTION({ card: CARD({ expMonth: 9, expYear: 2026 }) }))).reason === "card_expired" && ev(DOC({}, SECTION({ card: CARD({ expMonth: 12, expYear: 2025 }) }))).reason === "card_expired");
t("U12 今月まで有効（日本時間の今月）：ok", ev(DOC({}, SECTION({ card: CARD({ expMonth: 10, expYear: 2026 }) }))).ok === true);
t("U13 日本時間の月の境目：UTCでは9月末でも日本時間で10月なら、9月期限は期限切れ", ev(DOC({}, SECTION({ card: CARD({ expMonth: 9, expYear: 2026 }) })), Date.parse("2026-09-30T16:00:00Z")).reason === "card_expired");
t("U14 カード変更の途中（pendingSetupIntentId あり）でも、確定済みの旧カードが有効なら ok", ev(DOC({}, SECTION({ pendingSetupIntentId: "seti_new" }))).ok === true);
t("U15 取り外し待ちに入っているのが別の（古い）カードだけなら ok", ev(DOC({}, SECTION({ detachPendingPaymentMethods: [{ paymentMethodId: "pm_OldCard0", state: "pending" }] }))).ok === true);

// ---------------- in-memory transactional DB ----------------
const TS = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toMillis === "function" ? { __ts: x.toMillis() } : x)), (k, x) => (x && typeof x === "object" && "__ts" in x ? TS(x.__ts) : x)));
function makeDb() {
  const store = new Map(); let auto = 0;
  const snap = (r) => { const cur = store.get(r.path); return { id: r.id, exists: !!cur, data: () => (cur ? clone(cur.data) : undefined) }; };
  const ref = (col, id) => ({ path: col + "/" + id, id, col, get: async () => snap({ path: col + "/" + id, id }) });
  const setPath = (o, dotted, v) => { const ks = dotted.split("."); let x = o; for (let i = 0; i < ks.length - 1; i++) { if (!x[ks[i]] || typeof x[ks[i]] !== "object") x[ks[i]] = {}; x = x[ks[i]]; } x[ks[ks.length - 1]] = v; };
  const apply = (w) => { const cur = store.get(w.ref.path); let data = cur ? clone(cur.data) : {}; if (w.type === "set") data = w.merge ? { ...data, ...clone(w.data) } : clone(w.data); if (w.type === "update") Object.entries(clone(w.data)).forEach(([k, v]) => setPath(data, k, v)); store.set(w.ref.path, { data, version: (cur ? cur.version : 0) + 1 }); };
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, id || "auto" + (++auto)), where: (field, op, value) => {
      if (op !== "==") throw new Error("where op not mocked: " + op);
      const keys = () => [...store.keys()].filter((k) => k.startsWith(col + "/") && store.get(k).data && store.get(k).data[field] === value);
      return { __query: true, keys, get: async () => ({ docs: keys().map((k) => snap({ path: k, id: k.slice(col.length + 1) })) }) };
    } }),
    async runTransaction(fn) {
      for (let a = 0; a < 20; a++) {
        const reads = new Map(); const writes = [];
        const tx = { get: async (r) => { if (r && r.__query) { const ks = r.keys(); ks.forEach((k) => reads.set(k, store.get(k).version)); return r.get(); } const cur = store.get(r.path); reads.set(r.path, cur ? cur.version : 0); return snap(r); }, set: (r, d, o) => writes.push({ type: "set", ref: r, data: d, merge: !!(o && o.merge) }), update: (r, d) => writes.push({ type: "update", ref: r, data: d }) };
        const result = await fn(tx);
        let ok = true; for (const [p, v] of reads) { const cur = store.get(p); if ((cur ? cur.version : 0) !== v) ok = false; }
        if (!ok) continue; writes.forEach(apply); return result;
      }
      throw new Error("contention");
    }
  };
  return { db, store, seed: (c, id, d) => store.set(c + "/" + id, { data: clone(d), version: 1 }), get: (c, id) => (store.get(c + "/" + id) || {}).data, list: (c) => [...store.keys()].filter((k) => k.startsWith(c + "/")) };
}

// ---------------- H: REAL handleImadakePostCreate ----------------
const sa = (id) => JSON.stringify({ project_id: id });
const FAKE_RK = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview"), STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_RK, STRIPE_PUBLISHABLE_KEY: FAKE_PK };
const PROD_ENV = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app") };
const ENV_KEYS = Object.keys(TRIAL_ENV);
function withEnv(env) { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, env); }
const USERS = { owner: { uid: "u1", provider: "password", emailVerified: true } };
async function resolveStoreUserActor(request) { const m = ((request.headers && request.headers.authorization) || "").match(/^Bearer (.+)$/); const u = m && USERS[m[1]]; if (!u) return { ok: false, status: 401 }; return { ok: true, actor: { type: "storeUser", uid: u.uid, emailVerified: u.emailVerified } }; }
function deps(m, o = {}) {
  const calls = { rate: 0, moderation: 0 };
  const d = {
    calls, getFirebaseAdminApp: () => ({}), getFirestore: () => m.db, readRequestBody: (r) => r.body,
    validateStoreToken: async () => ({ valid: false }),
    claimRateLimit: async () => { calls.rate++; if (o.duringRateLimit) await o.duringRateLimit(); return true; },
    hashRateLimitStore: (id) => "s:" + id, hashClientIpAddress: () => "ip",
    buildModerationInput: (x) => x, callOpenAiModeration: async (input) => { calls.moderation++; return (Array.isArray(input) ? input : [input]).map(() => ({ flagged: false })); },
    classifyModerationError: () => "error", buildReviewReason: () => "review", matchesSafetyCriticalKeywords: () => false, AI_REVIEW_VERSION: "test",
    requireAdmin: async () => ({ ok: false, status: 403 }), findAddressComponentByType: () => null,
    resolveStoreUserActor, checkStoreProfileEditor: SP.checkStoreProfileEditor
  };
  if (!o.noCardDeps) {
    d.checkImadakeBillingCard = (database, storeId) => CR.checkImadakeBillingCard(database, storeId, { env: process.env });
    d.checkImadakeBillingCardInTransaction = (tx, database, storeId) => CR.checkImadakeBillingCardInTransaction(tx, database, storeId, { env: process.env });
  }
  return d;
}
const res = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} });
const BODY = { mode: "imadakePostCreate", storeId: "s1", categoryCode: "restaurant", headline: "試験", body: "本文です。", sourceLanguage: "ja", imageUrls: [], imagePublicIds: [], actionTargets: {}, categoryFields: {}, paymentMethods: [] };
function seedStore(m, o = {}) {
  m.seed("storeAccounts", "s1", { storeName: "試験店", enabled: true, createdByType: "storeUser", registrationStatus: "active", latitude: 26.15, longitude: 127.72, countryCode: "JP", prefecture: "沖縄県", city: "八重瀬町", regionKey: "JP-47", address: "沖縄県八重瀬町", ...o });
  m.seed("storeMembers", "s1_u1", { storeId: "s1", uid: "u1", role: "owner", status: "active" });
}
async function create(m, d) { const r = res(); await IM.handleImadakePostCreate({ body: BODY, headers: { authorization: "Bearer owner" } }, r, d); return r; }
const futureCard = CARD({ expMonth: 12, expYear: 2099 });

withEnv(TRIAL_ENV);
let m = makeDb(); seedStore(m); let d = deps(m); let r = await create(m, d);
t("H1 課金対象（Preview試験）・カード未登録：409 card_required・投稿は保存されない・回数制限も消費しない", r.code === 409 && r.body.reason === "card_required" && m.list("imadakePosts").length === 0 && d.calls.rate === 0 && d.calls.moderation === 0, { code: r.code, body: r.body, rate: d.calls.rate });
m = makeDb(); seedStore(m); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: CARD({ expMonth: 1, expYear: 2020 }) }))); d = deps(m); r = await create(m, d);
t("H2 期限切れのカード：409 card_expired・保存なし", r.code === 409 && r.body.reason === "card_expired" && m.list("imadakePosts").length === 0, r.body);
m = makeDb(); seedStore(m); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard }))); d = deps(m); r = await create(m, d);
const saved = m.list("imadakePosts").map((k) => m.get("imadakePosts", k.split("/")[1]));
t("H3 有効なカード：200・課金対象（cvBillingEnabled true）で保存", r.code === 200 && r.body.success === true && saved.length === 1 && saved[0].cvBillingEnabled === true, { code: r.code, body: r.body });
m = makeDb(); seedStore(m); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard, pendingSetupIntentId: "seti_change" }))); d = deps(m); r = await create(m, d);
t("H4 カード変更の途中でも、確定済みの旧カードが有効なら投稿できる", r.code === 200 && r.body.success === true, r.body);
m = makeDb(); seedStore(m); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard })));
d = deps(m, { duringRateLimit: async () => { m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard, detachPendingPaymentMethods: [{ paymentMethodId: "pm_TestCard1", state: "pending" }] }))); } });
r = await create(m, d);
t("H5 競合：最初の確認の後・保存の前にカードが取り外し待ちになった → 保存トランザクション内の確認で 409 card_retiring・保存なし", r.code === 409 && r.body.reason === "card_retiring" && m.list("imadakePosts").length === 0, r.body);
m = makeDb(); seedStore(m); d = deps(m, { noCardDeps: true }); r = await create(m, d);
t("H6 課金対象なのにカード確認の部品が無い：409 card_billing_unavailable（安全側）", r.code === 409 && r.body.reason === "card_billing_unavailable" && m.list("imadakePosts").length === 0, r.body);
m = makeDb(); seedStore(m, { isTestAccount: true }); d = deps(m); r = await create(m, d);
t("H7 テスト事業者は課金対象外 → カードなしでも投稿できる（従来どおり）", r.code === 200 && r.body.success === true, r.body);
withEnv({ ...TRIAL_ENV, STRIPE_MODE: "" });
m = makeDb(); seedStore(m); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard }))); d = deps(m); r = await create(m, d);
t("H8 課金対象でもStripeの設定が無効：409 card_billing_unavailable", r.code === 409 && r.body.reason === "card_billing_unavailable", r.body);

withEnv(TRIAL_ENV);
// STEP 42-C｜請求先アカウント
m = makeDb(); seedStore(m); m.seed("storeMembers", "s1_u1", { storeId: "s1", uid: "u1", role: "owner", status: "removed" }); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard })));
const h9 = await CR.checkImadakeBillingCard(m.db, "s1", { env: process.env, nowMillis: NOW });
t("H9 店舗の有効な owner がいない（請求先アカウントが決まらない）：card_billing_account_unresolved（判定の単体。投稿は owner でなければそもそも拒否される）", h9.ok === false && h9.reason === "card_billing_account_unresolved", h9);
m = makeDb(); seedStore(m); m.seed("storeMembers", "s1_u2", { storeId: "s1", uid: "u2", role: "owner", status: "active" }); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard }))); d = deps(m); r = await create(m, d);
t("H10 有効な owner が2人（請求先を独断で選ばない）：409 card_billing_account_unresolved・保存なし", r.code === 409 && r.body.reason === "card_billing_account_unresolved" && m.list("imadakePosts").length === 0, r.body);
m = makeDb(); seedStore(m); m.seed("accountBilling", "u2", { uid: "u2", test: SECTION({ card: futureCard }) }); d = deps(m); r = await create(m, d);
t("H11 他のアカウント（u2）のカードは使えない：s1（u1）は card_required", r.code === 409 && r.body.reason === "card_required" && m.list("imadakePosts").length === 0, r.body);
m = makeDb(); seedStore(m); m.seed("storeAccounts", "s2", { storeName: "2店目", enabled: true, createdByType: "storeUser", registrationStatus: "active", latitude: 26.15, longitude: 127.72, countryCode: "JP", prefecture: "沖縄県", city: "八重瀬町", regionKey: "JP-47", address: "沖縄県八重瀬町" });
m.seed("storeMembers", "s2_u1", { storeId: "s2", uid: "u1", role: "owner", status: "active" }); m.seed("accountBilling", "u1", DOC({}, SECTION({ card: futureCard }))); d = deps(m);
const r2a = res(); await IM.handleImadakePostCreate({ body: { ...BODY, storeId: "s2" }, headers: { authorization: "Bearer owner" } }, r2a, d);
const r1a = await create(m, d);
t("H12 同じアカウント（u1）の2店舗（s1・s2）が1枚のカードを共用して、どちらも投稿できる", r2a.code === 200 && r1a.code === 200 && m.list("imadakePosts").length === 2 && m.list("accountBilling").length === 1, { r2: r2a.body, r1: r1a.body });

withEnv(PROD_ENV);
m = makeDb(); seedStore(m); d = deps(m); r = await create(m, d);
const prodSaved = m.list("imadakePosts").map((k) => m.get("imadakePosts", k.split("/")[1]));
t("P1 Production（課金開始前）：カードなしでも従来どおり投稿でき、課金対象外", r.code === 200 && r.body.success === true && prodSaved.length === 1 && prodSaved[0].cvBillingEnabled === false && d.calls.rate === 1, { code: r.code, body: r.body });
m = makeDb(); seedStore(m); d = deps(m, { noCardDeps: true }); r = await create(m, d);
t("P2 Production：カード確認の部品が無くても従来どおり（カードを確認しない）", r.code === 200 && r.body.success === true, r.body);
withEnv({});

// ---------------- W: wiring / scope ----------------
const read = (p) => fs.readFileSync(REPO_ROOT + "/" + p, "utf8");
const im = read("api/_lib/imadake.js"), ms = read("api/moderate-submission.js");
t("W1 imadake.js は store-billing.js もカード判定のモジュールも読み込まない（循環なし・依存として受け取る）", !/from "\.\/store-billing\.js"/.test(im) && !/from "\.\/imadake-card-requirement\.js"/.test(im));
t("W2 moderate-submission.js が今だけ投稿の依存にカード確認を渡す", /checkImadakeBillingCard: function/.test(ms) && /checkImadakeBillingCardInTransaction: function/.test(ms) && /from "\.\/_lib\/imadake-card-requirement\.js"/.test(ms));
const users = fs.readdirSync(REPO_ROOT + "/api/_lib").filter((f) => f.endsWith(".js") && /checkImadakeBillingCard/.test(read("api/_lib/" + f)));
t("W3 カード確認を使うのは imadake.js（今だけ投稿の作成）と判定モジュールだけ", JSON.stringify(users.sort()) === JSON.stringify(["imadake-card-requirement.js", "imadake.js"]), users);
const fnStart = im.indexOf("export async function handleImadakePostCreate"), fnEnd = im.indexOf("\nexport async function", fnStart + 10);
t("W4 imadake.js でカード確認を呼ぶのは handleImadakePostCreate の中だけ", (im.match(/deps\.checkImadakeBillingCard/g) || []).length === (im.slice(fnStart, fnEnd).match(/deps\.checkImadakeBillingCard/g) || []).length && (im.match(/deps\.checkImadakeBillingCard/g) || []).length >= 2);
const cr = read("api/_lib/imadake-card-requirement.js");
t("W5 判定モジュールは書き込み・Stripeへの問い合わせをしない", !/\.(set|update|delete|add)\(/.test(cr) && !/fetch\(|api\.stripe\.com/.test(cr));
t("W6 課金関連3フラグは false のまま・Functions 11本", /IMADAKE_CV_BILLING_STARTED =\s*false/.test(im) && /IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED =\s*false/.test(read("api/_lib/imadake-monthly-close.js")) && /IMADAKE_MONTHLY_CHARGE_ENABLED =\s*false/.test(read("api/_lib/imadake-monthly-charge.js")) && fs.readdirSync(REPO_ROOT + "/api").filter((f) => f.endsWith(".js")).length === 11);

// ---------------- UI: screen and texts ----------------
const page = read("imadake-post.html"), tr = read("translations.js");
t("UI1 投稿画面：カードの理由コードを表示文に変え、カード登録への案内（店舗アカウント画面）を出す", /data\.reason === "card_expired"/.test(page) && /imadake_post_error_card_required/.test(page) && /id="cardSetupGuide"/.test(page) && /store-account\.html#billingSection/.test(page) && /cardGuide\.hidden =/.test(page));
const T = (() => { const ctx = {}; new Function("window", tr.replace(/^\s*const\s+(\w+)\s*=/m, "window.$1 =") + ";")(ctx); return ctx; })();
const dict = Object.values(T).find((v) => v && typeof v === "object" && v.imadake_post_error_card_required) || {};
t("UI2 文言は日英そろっている", ["imadake_post_error_card_required", "imadake_post_error_card_expired", "imadake_post_error_card_unavailable", "imadake_post_card_setup_link"].every((k) => dict[k] && dict[k].ja && dict[k].en), Object.keys(dict).filter((k) => /card/.test(k)));
t("UI3 店舗アカウント画面に案内先（billingSection）がある", /id="billingSection"/.test(read("store-account.html")));

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
