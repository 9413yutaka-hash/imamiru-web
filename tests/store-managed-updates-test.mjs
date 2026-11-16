// 運営管理の代行編集：更新案（ドラフト）→ 店舗へ送信の記録 → 承認の記録 → 反映、の作業管理。
// 承認が記録されていない更新案は反映できない。反映は店主本人の保存と同じ検証を通す。
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-managed-updates-test.mjs
import { REPO_URL } from "./_paths.mjs";
const ADMIN = "admin@example.com";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL_ENV = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/stripe-card-setup", FIREBASE_SERVICE_ACCOUNT_KEY: sa("chikashoku-app"), FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
Object.assign(process.env, TRIAL_ENV, { RATE_LIMIT_HMAC_SECRET: "fake", ADMIN_EMAIL: ADMIN, OPENAI_API_KEY: "sk-" + "fake-openai-for-tests", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: "rk_" + "test_FAKEKEYFORLOCALTESTS0001", STRIPE_PUBLISHABLE_KEY: "pk_" + "test_FAKEPUBLISHABLEFORTESTS01" });
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = Object.fromEntries(["u1", "u2"].map((u) => [u, pw(u, u + "@example.com")]));
globalThis.__MOCK_TOKENS.admin = pw("adm1", ADMIN);
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input;
    const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  throw new Error("unexpected network " + url);
};
const jst = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600000;
let NOW = jst(2026, 11, 10, 10, 0);
Date.now = () => NOW;
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const CP = await import(REPO_URL + "/api/_lib/store-custom-profile.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
async function call(body, token) {
  clearRate();
  const r = res(); const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const custom = (id) => S.docs.get("storeCustomProfiles/" + id);
const update = (id) => S.docs.get("storeManagedUpdates/" + id);
const docs = (prefix) => [...S.docs.entries()].filter(([k]) => k.startsWith(prefix + "/"));

const CLD = "https://res.cloudinary.com/cdhyctnp/image/upload/";
const at = Timestamp.fromMillis(jst(2026, 9, 1));
const card = (uid) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [] } });
function seedStore(id, uid) {
  S.docs.set("storeAccounts/" + id, { storeName: "店" + id, registrationStatus: "active", enabled: true, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, duplicateCandidates: [] });
  S.docs.set("storeMembers/" + id + "_" + uid, { uid, storeId: id, role: "owner", status: "active" });
  S.docs.set("storeProfiles/" + id, { storeId: id, status: "published", revision: 1, categoryCode: "cafe_sweets", description: "紹介文" + id, moderationStatus: "passed", moderatedText: "紹介文" + id, businessHours: null, photos: [{ url: CLD + "v1/machinau_store_profiles/" + id + "/f.webp", publicId: "machinau_store_profiles/" + id + "/f", moderationStatus: "passed" }], publishedAt: at, updatedAt: at });
}
seedStore("MU1", "u1"); seedStore("MU2", "u2");
card("u1"); card("u2");

const PHOTO = { url: CLD + "v1/machinau_store_profiles/MU1/menu/p1.webp", publicId: "machinau_store_profiles/MU1/menu/p1", moderationStatus: "passed" };
const baseFields = { story: "今のストーリー", menuItems: [{ name: "商品A", description: "説明A", priceText: "900円", photo: { url: PHOTO.url, publicId: PHOTO.publicId } }], links: [] };
S.docs.set("storeCustomProfiles/MU1", { storeId: "MU1", revision: 3, story: baseFields.story, menuItems: [{ name: "商品A", description: "説明A", priceText: "900円", photo: PHOTO }], links: [], moderationStatus: "passed", moderatedText: CP.buildStoreCustomModerationText(baseFields) });

const MSUB = (storeId) => ({ mode: "storeCustomPlanSubscribe", storeId, contractModel: "monthly", planKind: "managed", planConsentVersion: "store-managed-plan-2026-11-17" });
const SUB = (storeId) => ({ mode: "storeCustomPlanSubscribe", storeId, contractModel: "monthly", planConsentVersion: "store-card-monthly-2026-10-31" });
const CREATE = (storeId, customBody) => ({ mode: "adminManagedUpdateCreate", storeId, custom: customBody });
const SENT = (updateId) => ({ mode: "adminManagedUpdateMarkSent", updateId });
const APPROVAL = (updateId, approved) => ({ mode: "adminManagedUpdateRecordApproval", updateId, approved });
const APPLY = (updateId) => ({ mode: "adminManagedUpdateApply", updateId });
const CANCELU = (updateId) => ({ mode: "adminManagedUpdateCancel", updateId });
const changedFields = { story: "今のストーリー", menuItems: [{ name: "商品A", description: "説明A", priceText: "950円", photo: { url: PHOTO.url, publicId: PHOTO.publicId } }], links: [] };

let r = await call(MSUB("MU1"), "u1");
t("前提：MU1 が運営管理を契約", r.code === 200 && S.docs.get("storeCustomPlans/MU1").planKind === "managed", r.body);
r = await call(SUB("MU2"), "u2");
t("前提：MU2 がセルフ運用を契約", r.code === 200, r.body);

// ===================== 作成の条件 =====================
r = await call(CREATE("MU1", changedFields), "u1");
t("U1 運営以外は更新案を作れない", r.code === 403, r.body);
r = await call(CREATE("MU2", changedFields), "admin");
t("U2 セルフ運用の店舗には更新案を作れない（運営管理の契約が必要）", r.code === 409 && r.body.reason === "managed_plan_required", r.body);
r = await call(CREATE("MU1", { story: "", menuItems: [{ name: "商品B", description: "", priceText: "", photo: { url: CLD + "v1/machinau_store_profiles/MU1/menu/new1.webp", publicId: "machinau_store_profiles/MU1/menu/new1" } }], links: [] }), "admin");
t("U3 新しい商品写真を含む更新案は受け付けない（写真の追加はこの経路では扱わない）", r.code === 400 && r.body.reason === "managed_update_new_photo_not_supported", r.body);
r = await call(CREATE("MU1", changedFields), "admin");
const up1 = r.body.update && r.body.update.updateId;
t("U4 更新案の作成：draft・基準の revision は今の内容（3）", r.code === 200 && !!up1 && r.body.update.status === "draft" && r.body.update.baseRevision === 3, r.body);

// ===================== 承認が無ければ反映できない =====================
r = await call(APPLY(up1), "admin");
t("U5 承認の記録が無い更新案は反映できない", r.code === 409 && r.body.reason === "update_not_approved" && custom("MU1").revision === 3, r.body);
r = await call(APPROVAL(up1, true), "admin");
t("U6 店舗へ送る前に承認は記録できない", r.code === 409 && r.body.reason === "update_not_awaiting_approval", r.body);
r = await call(SENT(up1), "admin");
t("U7 送信の記録：sent になる", r.code === 200 && update(up1).status === "sent", r.body);
r = await call(APPROVAL(up1, false), "admin");
t("U8 承認が得られなかった記録：rejected になる", r.code === 200 && update(up1).status === "rejected" && update(up1).approval.approved === false, r.body);
r = await call(APPLY(up1), "admin");
t("U9 rejected の更新案は反映できない", r.code === 409 && custom("MU1").revision === 3, r.body);

// ===================== 承認→反映 =====================
r = await call(CREATE("MU1", changedFields), "admin");
const up2 = r.body.update.updateId;
await call(SENT(up2), "admin");
r = await call(APPROVAL(up2, true), "admin");
t("U10 承認の記録：approved になる（公式LINEで得た返事として記録）", r.code === 200 && update(up2).status === "approved" && update(up2).approval.source === "line", r.body);
r = await call(APPLY(up2), "admin");
t("U11 反映：内容が新しい値段になり、revision が 4 になる。更新案は applied・監査ログが残る", r.code === 200 && update(up2).status === "applied" && update(up2).appliedRevision === 4 && custom("MU1").revision === 4 && custom("MU1").menuItems[0].priceText === "950円" && custom("MU1").menuItems[0].photo.moderationStatus === "passed" && docs("storeManagedAuditLogs").length === 1, { body: r.body, custom: custom("MU1") });
r = await call(APPLY(up2), "admin");
t("U12 反映済みの二重反映はできない", r.code === 409 && custom("MU1").revision === 4, r.body);

// ===================== 基準がずれたら反映しない =====================
r = await call(CREATE("MU1", changedFields), "admin");
const up3 = r.body.update.updateId;
await call(SENT(up3), "admin");
await call(APPROVAL(up3, true), "admin");
S.docs.set("storeCustomProfiles/MU1", { ...custom("MU1"), revision: 5 });
r = await call(APPLY(up3), "admin");
t("U13 作成の後に内容が変わっていたら反映しない（409・内容はそのまま）", r.code === 409 && r.body.reason === "managed_update_conflict" && custom("MU1").revision === 5 && update(up3).status === "approved", r.body);

// ===================== 取り消しと一覧 =====================
r = await call(CREATE("MU1", changedFields), "admin");
const up4 = r.body.update.updateId;
r = await call(CANCELU(up4), "admin");
t("U14 下書きの取り消し：canceled", r.code === 200 && update(up4).status === "canceled", r.body);
r = await call(SENT(up4), "admin");
t("U15 取り消した更新案は送信にできない", r.code === 409, r.body);
r = await call({ mode: "adminManagedUpdateList", storeId: "MU1" }, "admin");
t("U16 一覧：MU1 の更新案が4件", r.code === 200 && r.body.updates.length === 4, r.body);

// ===================== 代行画面用の読み込み =====================
r = await call({ mode: "adminManagedStoreCustomGet", storeId: "MU1" }, "u1");
t("U17 運営以外は店舗の内容を読めない", r.code === 403, r.body);
r = await call({ mode: "adminManagedStoreCustomGet", storeId: "MU1" }, "admin");
t("U18 読み込み：契約の種別 managed と今の内容（revision・商品）を返す", r.code === 200 && r.body.planKind === "managed" && r.body.custom.revision === 5 && r.body.custom.menuItems.length === 1, r.body);
r = await call({ mode: "adminManagedStoreCustomGet", storeId: "MU2" }, "admin");
t("U19 セルフ運用の店舗は planKind self と返る（画面で代行を止めるため）", r.code === 200 && r.body.planKind === "self", r.body);
r = await call({ mode: "adminManagedStoreCustomGet", storeId: "NOPE" }, "admin");
t("U20 存在しない店舗は 404", r.code === 404 && r.body.reason === "store_not_found", r.body);

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
