// STEP 50-B server: owner-managed store cards are public only while the monthly ¥100 store card contract is usable
// (storeCustomPlans + STEP 44 access rules), and subscribing requires explicit consent to the current consent version.
// Operator listings (submissions) are not affected. Preview-trial contracts only, no Stripe, no billing.
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-plan-test.mjs
import { REPO_URL, REPO_ROOT } from "./_paths.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: "admin@example.com", OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEKEYFORLOCALTESTS0001" });
const pw = (uid) => ({ uid, email: uid + "@example.com", email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["un", "ut", "ua", "uc", "ue", "up", "uf", "uo", "ux", "uy"].map((u) => [u, pw(u)]));
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
globalThis.fetch = async (url, opts = {}) => {
  if (new URL(String(url)).hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const SP = await import(REPO_URL + "/api/_lib/store-profile.js");
const BL = await import(REPO_URL + "/api/_lib/store-custom-plan-billing.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
async function call(body, uid) {
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(uid ? { authorization: "Bearer " + uid } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
async function publicList() { const r = res(); const e = console.error; console.error = () => {}; try { await handler({ method: "GET", headers: {}, query: { mode: "publicStoreProfiles" } }, r); } finally { console.error = e; } return r; }
const ids = async () => ((await publicList()).body.stores || []).map((s) => s.id);
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
const plan = (id) => S.docs.get("storeCustomPlans/" + id);
const events = (id) => [...S.docs.entries()].filter(([k]) => k.startsWith("storeCustomPlanEvents/" + id + "_")).map(([, v]) => v);
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const DAY = 86400000;
const CONSENT = BL.STORE_CARD_PLAN_CONSENT_VERSION;

// ---- fixtures ----
const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
const member = (id, uid, status = "active") => S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status });
function seedStore(id, uid, status = "published", extra = {}) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.21, longitude: 127.68, duplicateCandidates: [], createdByUid: uid, ...extra });
  member(id, uid);
  S.docs.set("storeProfiles/" + id, { storeId: id, status, revision: 3, categoryCode: "cafe_sweets", description: "紹介文" + id, moderationStatus: "passed", moderatedText: "紹介文" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/p.webp", publicId: "machinau_store_profiles/" + id + "/p", moderationStatus: "passed" }] });
}
const trialPlan = (id, uid, o = {}) => S.docs.set("storeCustomPlans/" + id, { storeId: id, status: "active", ownerUid: uid, periodKind: "preview_trial", createdInPreview: true, accessUntil: Timestamp.fromMillis(Date.now() + 20 * DAY), ...o });
const monthlyPlan = (id, uid, o = {}) => S.docs.set("storeCustomPlans/" + id, { storeId: id, status: "active", ownerUid: uid, periodKind: "monthly", createdInPreview: true, subscribedAt: Timestamp.fromMillis(Date.now() - 40 * DAY), accessUntil: null, paymentStatus: "current", ...o });

seedStore("SN", "un");                       // 新規作成・未契約
seedStore("ST", "ut", "published", { duplicateCandidates: [{ source: "submissions", id: "subT" }] }); // 引き継ぎ・未契約
S.docs.set("submissions/subT", { shopName: "運営掲載の店", status: "approved" });
S.docs.set("storeListingLinks/subT", { status: "active", storeId: "ST", claimId: "cT" });
S.docs.set("submissions/subFree", { shopName: "運営の無料掲載", status: "approved" }); // 運営の無料掲載(紐付けなし)
seedStore("SA", "ua"); trialPlan("SA", "ua");                                                    // 有効な契約
seedStore("SC", "uc"); monthlyPlan("SC", "uc", { status: "canceling", accessUntil: Timestamp.fromMillis(Date.now() + 5 * DAY) }); // 解約予約中(月末まで)
seedStore("SE", "ue"); monthlyPlan("SE", "ue", { status: "canceling", accessUntil: Timestamp.fromMillis(Date.now() - 1000) });   // 解約後・期限終了
seedStore("SP", "up"); monthlyPlan("SP", "up", { paymentStatus: "suspended" });                 // 支払い停止
seedStore("SF", "uf"); trialPlan("SF", "uf");                                                    // 契約の読み取り失敗
seedStore("SO", "uo"); trialPlan("SO", "ux"); member("SO", "ux", "removed");                    // 契約者が owner でない
["un", "ut", "ua", "uc", "ue", "up", "uf", "uo", "uy"].forEach(card);

// ===================== A. publish conditions =====================
t("A0 公開条件の一覧に plan（店舗カード契約）がある", SP.STORE_PUBLISH_CONDITION_CODES.includes("plan"));
const base = { account: S.docs.get("storeAccounts/SA"), profile: S.docs.get("storeProfiles/SA"), ownerActive: true, resolvedListingIds: new Set() };
t("A1 契約の利用権が無ければ plan が不足（planActive 未指定も未契約）", JSON.stringify(SP.evaluateStorePublishConditions(base)) === '["plan"]' && JSON.stringify(SP.evaluateStorePublishConditions({ ...base, planActive: false })) === '["plan"]');
t("A2 契約の利用権があればほかの条件だけで判定", SP.evaluateStorePublishConditions({ ...base, planActive: true }).length === 0);

let list = await ids();
t("L1 未契約の新規店舗カード（published のまま）は旅行者向けの一覧に出ない", !list.includes("sp_SN"), list);
t("L2 未契約の引き継ぎ店舗カードは一覧に出ない", !list.includes("sp_ST"), list);
t("L3 有効な契約の店舗カードは一覧に出る", list.includes("sp_SA"), list);
t("L4 解約予約中（月末まで）は一覧に出る", list.includes("sp_SC"), list);
t("L5 契約の終了後は一覧に出ない", !list.includes("sp_SE"), list);
t("L6 支払い停止中は一覧に出ない", !list.includes("sp_SP"), list);
t("L7 契約者がその店舗の有効な owner でなければ出ない", !list.includes("sp_SO"), list);
let pl = (await publicList()).body;
t("L8 引き継ぎ店舗カードが非公開の間は、運営無料掲載を一覧から外さない（suppressed に含めない・claimed には残る）", !pl.suppressedListingIds.includes("subT") && pl.claimedListingIds.includes("subT"), pl);
t("L9 紐付けの無い運営無料掲載には一切影響しない", !pl.suppressedListingIds.includes("subFree") && !pl.claimedListingIds.includes("subFree"), pl);

// read failure on storeCustomPlans → that store is treated as not contracted
const origGet = S.docs.get.bind(S.docs);
S.docs.get = (k) => { if (k === "storeCustomPlans/SF") throw new Error("UNAVAILABLE (simulated plan read failure)"); return origGet(k); };
const failList = await publicList();
t("F1 契約の読み取りに失敗した店舗は一覧に出さない（ほかの店舗は出す）", failList.code === 200 && !failList.body.stores.some((s) => s.id === "sp_SF") && failList.body.stores.some((s) => s.id === "sp_SA"), failList.body.stores.map((s) => s.id));
clearRate(); let r = await call({ mode: "storeProfilePublish", storeId: "SF", expectedRevision: 3 }, "uf");
t("F2 契約の読み取りに失敗した時は公開操作も成立しない", r.code !== 200 && S.docs.get("storeProfiles/SF").status === "published" && r.body.success === false, { code: r.code, body: r.body });
S.docs.get = origGet;
t("F3 読み取りが戻れば一覧に出る", (await ids()).includes("sp_SF"));

// ===================== B. draft editing and publishing =====================
S.docs.set("storeProfiles/SN", { ...S.docs.get("storeProfiles/SN"), status: "draft" });
clearRate(); r = await call({ mode: "storeProfileUpdate", storeId: "SN", expectedRevision: 3, categoryCode: "cafe_sweets", description: "下書きの紹介文", businessHours: null, phone: "", websiteUrl: "", reservationUrl: "", socialLinks: [], paymentMethodCodes: [] }, "un");
t("B1 未契約でも下書きの保存・編集ができる", r.code === 200 && S.docs.get("storeProfiles/SN").description === "下書きの紹介文" && S.docs.get("storeProfiles/SN").status === "draft", r.body);
t("B2 保存の応答の公開状態に plan の不足が出る", Array.isArray(r.body.publication && r.body.publication.missing) && r.body.publication.missing.includes("plan"), r.body.publication);
const rev = S.docs.get("storeProfiles/SN").revision;
clearRate(); r = await call({ mode: "storeProfilePublish", storeId: "SN", expectedRevision: rev }, "un");
t("B3 未契約の公開操作：409 publish_conditions_not_met（missing に plan）・draft のまま", r.code === 409 && r.body.reason === "publish_conditions_not_met" && r.body.missing.includes("plan") && S.docs.get("storeProfiles/SN").status === "draft", r.body);
clearRate(); r = await call({ mode: "storeProfileGet", storeId: "SN" }, "un");
t("B4 編集画面の取得：未契約は plan が不足と表示される", r.code === 200 && r.body.publication.missing.includes("plan"), r.body.publication);

// ===================== C. consent at subscription =====================
clearRate(); r = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN" }, "un");
t("C1 同意なしの申込（旧画面）：400 plan_consent_required・契約は作らない", r.code === 400 && r.body.reason === "plan_consent_required" && !plan("SN"), r.body);
clearRate(); r = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN", planConsentVersion: "store-card-monthly-2026-01-01" }, "un");
t("C2 古い・不正な同意の版：400 plan_consent_required・契約は作らない", r.code === 400 && r.body.reason === "plan_consent_required" && !plan("SN"), r.body);
clearRate(); r = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN", planConsentVersion: CONSENT }, "un");
const p = plan("SN"); const ev = events("SN").find((e) => e.event === "subscribed");
const consentOk = (c) => !!c && c.version === CONSENT && c.feeJpy === 100 && c.taxIncluded === true && c.storeId === "SN" && c.uid === "un" && ms(c.consentedAt) > Date.now() - 60000;
t("C3 同意ありの申込：200 subscribed（試験の契約 preview_trial・請求の対象外）", r.code === 200 && r.body.result === "subscribed" && p.periodKind === "preview_trial" && p.createdInPreview === true, r.body);
t("C4 同意の証跡を契約の文書に保存（版・日時・税込100円・店舗ID・契約者UID）", consentOk(p.consent), p.consent);
t("C5 契約の履歴（subscribed）にも同じ証跡", !!ev && consentOk(ev.consent), ev);
t("C6 試験の契約は利用月の記録（請求の元）を作らない", ![...S.docs.keys()].some((k) => k.startsWith("storeCustomPlanUsage/SN_")));
clearRate(); r = await call({ mode: "storeProfilePublish", storeId: "SN", expectedRevision: rev }, "un");
t("C7 契約の後は公開でき、一覧に出る", r.code === 200 && S.docs.get("storeProfiles/SN").status === "published" && (await ids()).includes("sp_SN"), r.body);
clearRate(); r = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN", planConsentVersion: CONSENT }, "un");
t("C8 二重契約は既存どおり 409 already_subscribed", r.code === 409 && r.body.reason === "already_subscribed", r.body);

// takeover store: contract → the operator listing is replaced by the store card
clearRate(); r = await call({ mode: "storeCustomPlanSubscribe", storeId: "ST", planConsentVersion: CONSENT }, "ut");
pl = (await publicList()).body;
t("C9 引き継ぎ店舗カードも契約で公開され、運営掲載は外れる（suppressed）", r.code === 200 && pl.stores.some((s) => s.id === "sp_ST") && pl.suppressedListingIds.includes("subT"), pl);

// cancel → reactivate also records consent
clearRate(); await call({ mode: "storeCustomPlanCancel", storeId: "SN" }, "un");
clearRate(); r = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN" }, "un");
t("C10 解約の取り消しも同意が必要（同意なしは 400・canceling のまま）", r.code === 400 && plan("SN").status === "canceling", r.body);
clearRate(); r = await call({ mode: "storeCustomPlanSubscribe", storeId: "SN", planConsentVersion: CONSENT }, "un");
const re = events("SN").find((e) => e.event === "reactivated");
t("C11 解約の取り消し：reactivated の履歴と契約の文書に同意の証跡", r.code === 200 && r.body.result === "reactivated" && !!re && consentOk(re.consent) && consentOk(plan("SN").consent), { body: r.body, re });

// ===================== D. card registration alone never creates a contract =====================
const libDir = join(REPO_ROOT, "api", "_lib");
const writers = readdirSync(libDir).filter((f) => f.endsWith(".js") && /storeCustomPlans"|STORE_CUSTOM_PLANS_COLLECTION/.test(readFileSync(join(libDir, f), "utf8")));
t("D1 storeCustomPlans を扱うのは店舗カード契約・請求・公開判定のファイルだけ（カード登録・新規登録・引き継ぎ・今だけ投稿には無い）", JSON.stringify(writers.sort()) === JSON.stringify(["store-custom-plan-billing.js", "store-custom-plan-charge.js", "store-custom-profile.js", "store-profile.js"]), writers);
t("D2 公開判定(store-profile.js)は storeCustomPlans を読むだけ（書き込まない）", !/STORE_CUSTOM_PLANS_COLLECTION\)\.doc\([^)]*\)\.(set|update)|transaction\.(set|update)\(planRef/.test(readFileSync(join(libDir, "store-profile.js"), "utf8")));
t("D3 カード登録済みでも契約の無いアカウント（uy）には契約が無い", ![...S.docs.keys()].some((k) => k.startsWith("storeCustomPlans/") && (S.docs.get(k) || {}).ownerUid === "uy"));
t("D4 店舗カードの同意の版はカード登録の同意の版と別", CONSENT !== (await import(REPO_URL + "/api/_lib/store-billing.js")).STORE_BILLING_CONSENT_VERSION);

// ===================== E. STEP 50-C wording (translations.js, ja/en) =====================
const vm = await import("node:vm");
const trCtx = {};
vm.createContext(trCtx);
vm.runInContext(readFileSync(join(REPO_ROOT, "translations.js"), "utf8") + "\nthis.TR = MACHINAU_TRANSLATIONS;", trCtx);
const TR = trCtx.TR;
const both = (k) => !!TR[k] && typeof TR[k].ja === "string" && TR[k].ja !== "" && typeof TR[k].en === "string" && TR[k].en !== "" && !/[ぁ-んァ-ン一-龯]/.test(TR[k].en);
const planKeys = ["store_custom_heading", "store_custom_intro", "store_card_plan_terms_heading", "store_card_plan_terms_fee", "store_card_plan_terms_scope", "store_card_plan_terms_billing", "store_card_plan_terms_proration", "store_card_plan_terms_separate", "store_card_plan_terms_cancel", "store_card_plan_consent_label", "store_custom_plan_err_consent", "store_profile_publish_cond_plan", "store_profile_publish_fix_plan"];
t("E1 店舗カードの文言は日本語・英語の両方があり、英語に日本語が混ざらない", planKeys.every(both), planKeys.filter((k) => !both(k)));
t("E2 新規作成の後の案内：月額100円（税込）の申し込みで公開できる", /月額100円（税込）/.test(TR.store_account_store_registered_active.ja) && /店舗カードの編集・申し込み/.test(TR.store_account_store_registered_active.ja) && /¥100\/month/.test(TR.store_account_store_registered_active.en));
t("E3 引き継ぎの後の案内：月額100円（税込）の申し込みで公開・契約までは運営の無料掲載がそのまま", /月額100円（税込）/.test(TR.store_claim_completed.ja) && /運営による無料掲載がそのまま/.test(TR.store_claim_completed.ja) && /free listing by Machinau/.test(TR.store_claim_completed.en));
t("E4 店舗一覧の案内とリンク：店舗カードの編集・申し込み（公開には申し込みが必要）", TR.store_profile_edit_link.ja === "店舗カードの編集・申し込み" && /申し込みが必要/.test(TR.store_account_store_note_active.ja));
t("E5 解約予定・契約終了・支払い停止の表示：店舗カードを旅行者に出さないことを案内", /店舗カードを旅行者に表示しません/.test(TR.store_custom_plan_canceling.ja) && /非公開/.test(TR.store_custom_plan_expired.ja) && /店舗カードの表示を停止/.test(TR.store_custom_plan_suspended.ja) && /store card/.test(TR.store_custom_plan_suspended.en) && /月末に締めて、翌月2日に請求/.test(TR.store_custom_plan_monthly_active.ja));
const oldWording = ["store_custom_heading", "store_custom_intro", "store_custom_plan_none_signup", "store_custom_plan_subscribe_button", "store_custom_plan_cancel_confirm", "store_plan_pay_heading", "store_custom_err_plan", "store_custom_plan_suspended"].filter((k) => /無料の店舗情報|月額100円カスタマイズ|月額100円プラン|有料の内容|customization|free shop information/.test(TR[k].ja + TR[k].en));
t("E6 旧仕様の「無料の店舗情報＋有料カスタマイズ」の言い方が店主の主な文言に残っていない", oldWording.length === 0, oldWording);

// ===================== G. STEP 50-D｜契約前でもメニュー・リンク・ストーリーを保存できる(代表決定 B案) =====================
globalThis.__MOCK_TOKENS.ug = pw("ug"); globalThis.__MOCK_TOKENS.uz = pw("uz");
seedStore("SG", "ug"); seedStore("SZ", "uz");
const SECRET_MENU = "契約前メニューG", SECRET_LINK = "https://example.com/sg-before", SECRET_STORY = "契約前ストーリーG";
const CUSTOM = (rev, story) => ({ mode: "storeCustomProfileUpdate", storeId: "SG", expectedRevision: rev, menuItems: [{ name: SECRET_MENU, description: "", priceText: "¥500", photo: null }], links: [{ type: "website", label: "", url: SECRET_LINK }], story });
const leaks = (text) => [SECRET_MENU, SECRET_LINK, SECRET_STORY, "書き直しG"].filter((x) => text.includes(x));
const shareShop = async (id) => { const r = res(); const e = console.error; console.error = () => {}; try { await handler({ method: "GET", headers: {}, query: { mode: "renderShareShop", shopId: id } }, r); } finally { console.error = e; } return String(r.body || ""); };
clearRate(); r = await call(CUSTOM(0, SECRET_STORY), "ug");
let cg = S.docs.get("storeCustomProfiles/SG") || {};
t("G1 未契約：メニュー・リンク・ストーリーを保存できる（200・契約は作らない）", r.code === 200 && cg.revision === 1 && cg.menuItems[0].name === SECRET_MENU && cg.links[0].url === SECRET_LINK && cg.story === SECRET_STORY && !plan("SG"), r.body);
clearRate(); r = await call({ mode: "storeCustomProfileGet", storeId: "SG" }, "ug");
t("G2 未契約：取得は保存済みの内容と editable true を返す（再編集できる）", r.code === 200 && r.body.editable === true && r.body.plan.access === false && r.body.custom.story === SECRET_STORY && r.body.custom.links.length === 1, r.body);
clearRate(); r = await call(CUSTOM(1, SECRET_STORY + "書き直しG"), "ug");
t("G3 未契約：再編集の保存も 200（revision 2）", r.code === 200 && r.body.revision === 2, r.body);
pl = (await publicList()).body;
t("G4 未契約の店舗カードは旅行者向けの一覧に出ず、メニュー・リンク・ストーリーも公開 API に出ない", !pl.stores.some((x) => x.id === "sp_SG") && leaks(JSON.stringify(pl)).length === 0, leaks(JSON.stringify(pl)));
let html = await shareShop("sp_SG");
t("G5 未契約：シェアのプレビューにも店舗カード・有料の内容が出ない", !html.includes("店SG") && leaks(html).length === 0, html.slice(0, 300));
const sgSnap = JSON.stringify(S.docs.get("storeCustomProfiles/SG"));
clearRate(); r = await call(CUSTOM(2, "他人の書き換え"), "uz");
const sigZ = await call({ mode: "cloudinarySignature", purpose: "storeCustomMenuPhoto", storeId: "SG" }, "uz");
clearRate(); const getZ = await call({ mode: "storeCustomProfileGet", storeId: "SG" }, "uz");
t("G6 他の店舗の店主：未契約の店舗でも保存・写真の署名・取得は 404（内容は変わらない）", r.code === 404 && sigZ.code === 404 && getZ.code === 404 && JSON.stringify(S.docs.get("storeCustomProfiles/SG")) === sgSnap, { r: r.body, sig: sigZ.body, get: getZ.body });
trialPlan("SG", "ug");
pl = (await publicList()).body;
let sgPub = pl.stores.find((x) => x.id === "sp_SG");
t("G7 契約後：契約前に保存したメニュー・リンク・ストーリーがそのまま公開される", !!sgPub && !!sgPub.custom && sgPub.custom.menuItems[0].name === SECRET_MENU && sgPub.custom.links[0].url === SECRET_LINK && sgPub.custom.story === SECRET_STORY + "書き直しG", sgPub);
trialPlan("SG", "ug", { status: "canceling", canceledAt: Timestamp.fromMillis(Date.now() - DAY) });
t("G8 解約予約中（期限内）：月末までは公開のまま", (await ids()).includes("sp_SG"));
monthlyPlan("SG", "ug", { paymentStatus: "suspended" });
pl = (await publicList()).body;
t("G9 支払い停止（suspended）：非公開・有料の内容も出ない・保存済みの内容は残る", !pl.stores.some((x) => x.id === "sp_SG") && leaks(JSON.stringify(pl)).length === 0 && JSON.stringify(S.docs.get("storeCustomProfiles/SG")) === sgSnap, leaks(JSON.stringify(pl)));
trialPlan("SG", "ug", { status: "canceling", accessUntil: Timestamp.fromMillis(Date.now() - 1000) });
pl = (await publicList()).body; html = await shareShop("sp_SG");
t("G10 解約後（利用期限の終了）：非公開・公開 API とシェアに出ない・保存済みの内容は残る", !pl.stores.some((x) => x.id === "sp_SG") && leaks(JSON.stringify(pl) + html).length === 0 && JSON.stringify(S.docs.get("storeCustomProfiles/SG")) === sgSnap);
clearRate(); r = await call(CUSTOM(2, SECRET_STORY + "書き直しG"), "ug");
t("G11 解約後も保存・編集できる（200・revision 3）", r.code === 200 && r.body.revision === 3, r.body);
trialPlan("SG", "ug");
sgPub = (await publicList()).body.stores.find((x) => x.id === "sp_SG");
t("G12 再契約後：保存済みのメニュー・リンク・ストーリーを再び公開できる", !!sgPub && !!sgPub.custom && sgPub.custom.menuItems[0].name === SECRET_MENU && sgPub.custom.links[0].url === SECRET_LINK && sgPub.custom.story === SECRET_STORY + "書き直しG", sgPub);

console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
