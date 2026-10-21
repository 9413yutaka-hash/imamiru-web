// STEP 42-D server: card-first store registration and automatic takeover of operator listings (no operator approval).
// REAL moderate-submission handler + REAL api/_lib modules on mocked firebase-admin (optimistic-concurrency transactions).
// Google geocoding is answered by a local stub. No Stripe, no Cloudinary, no network, no real data.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-card-registration-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com"; process.env.GOOGLE_MAPS_API_KEY = "fake-maps-key";
const pw = (uid, email, verified = true) => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { u1: pw("u1", "a@example.com"), u2: pw("u2", "b@example.com"), u3: pw("u3", "c@example.com"), u4: pw("u4", "d@example.com"), u5: pw("u5", "e@example.com"), u6: pw("u6", "f@example.com"), unverified: pw("u7", "g@example.com", false), admin: pw("adm1", "admin@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let otherNetwork = 0, geocodeCalls = 0;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname !== "maps.googleapis.com") { otherNetwork++; throw new Error("unexpected network " + url); }
  geocodeCalls++;
  return { ok: true, status: 200, json: async () => ({ status: "OK", results: [{ types: ["street_address"], formatted_address: "日本、沖縄県島尻郡八重瀬町", geometry: { location: { lat: 26.15, lng: 127.72 } }, address_components: [{ types: ["country", "political"], short_name: "JP", long_name: "Japan" }, { types: ["administrative_area_level_1", "political"], short_name: "沖縄県", long_name: "沖縄県" }, { types: ["locality", "political"], short_name: "八重瀬町", long_name: "八重瀬町" }] }] }) };
};
const { Timestamp } = await import("firebase-admin/firestore");
const { getFirestore } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const LC = await import(REPO_URL + "/api/_lib/listing-profile-copy.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
let ip = 0;
async function call(body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const FAKE_RK = "rk_" + "test_FAKEKEYFORLOCALTESTS0001", FAKE_PK = "pk_" + "test_FAKEPUBLISHABLEFORTESTS01";
Object.assign(process.env, { VERCEL_ENV: "preview", STRIPE_MODE: "test", STRIPE_RESTRICTED_KEY: FAKE_RK, STRIPE_PUBLISHABLE_KEY: FAKE_PK });
const card = (uid, o = {}) => S.docs.set("accountBilling/" + uid, { uid, test: { customerId: "cus_" + uid, paymentMethodId: "pm_" + uid, setupStatus: "succeeded", card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 }, cardVersion: 1, detachPendingPaymentMethods: [], ...o } });
const clearRate = () => { for (const k of [...S.docs.keys()]) if (k.startsWith("storeRegistrationRateLimits/")) S.docs.delete(k); };
const docsIn = (col) => [...S.docs.entries()].filter(([k]) => k.startsWith(col + "/") && !k.slice(col.length + 1).includes("/")).map(([k, v]) => ({ id: k.split("/")[1], v }));
const REG = (name) => ({ mode: "storeSelfRegister", storeName: name, categoryCode: "gourmet", countryCode: "JP", address: "沖縄県島尻郡八重瀬町1-1", sourceLanguage: "ja" });

// operator listing (permanent ad) with hours / closed days / payment / takeout / photos
const LISTING = { title: "本日のおすすめ", shopName: "八重瀬の食堂", category: "グルメ", content: "地元の食材を使った定食の店です。\n駐車場あり。", address: "沖縄県島尻郡八重瀬町", latitude: 26.15, longitude: 127.72, status: "approved", isPermanentAd: true, authorType: "shopAd", websiteUrl: "https://example.com/source", paymentMethods: ["cash", "qr"], takeout: true, businessStartTime: "11:00", businessEndTime: "21:00", closedDays: ["tue"], irregularClosed: true, imageUrls: ["https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_admin/a1.jpg", "https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_admin/a2.jpg"] };
S.docs.set("submissions/L1", { ...LISTING });
S.docs.set("submissions/L2", { ...LISTING, shopName: "二号店", content: "二号店の紹介" });
S.docs.set("submissions/L3", { ...LISTING, shopName: "三号店" });
S.docs.set("submissions/NOTAD", { ...LISTING, isPermanentAd: false, authorType: "admin" });
const listingBefore = JSON.stringify(S.docs.get("submissions/L1"));

// ===================== A: new store registration =====================
let r = await call(REG("新しいカフェ"), "u1");
t("A1 カード未登録：新規登録は 409 card_required・店舗は作られない", r.code === 409 && r.body.reason === "card_required" && docsIn("storeAccounts").length === 0, r.body);
card("u1", { card: { brand: "visa", last4: "4242", expMonth: 1, expYear: 2020 } });
r = await call(REG("新しいカフェ"), "u1");
t("A2 期限切れのカード：409 card_expired・店舗は作られない", r.code === 409 && r.body.reason === "card_expired" && docsIn("storeAccounts").length === 0, r.body);
card("u2"); clearRate();
r = await call(REG("新しいカフェ"), "u1");
t("A3 他のアカウント（u2）のカードは使えない：u1 は 409（card_expired のまま）", r.code === 409 && docsIn("storeAccounts").length === 0, r.body);
card("u1"); clearRate();
r = await call(REG("新しいカフェ"), "u1");
const s1 = S.docs.get("storeAccounts/" + r.body.storeId) || {};
t("A4 カード登録済み：即時に登録（active）・owner と店舗情報の下書きを作成・運営の承認待ちにしない", r.code === 200 && r.body.registrationStatus === "active" && s1.registrationStatus === "active" && S.docs.get("storeMembers/" + r.body.storeId + "_u1").role === "owner" && S.docs.get("storeProfiles/" + r.body.storeId).status === "draft", { body: r.body, s1 });
clearRate();
r = await call(REG("八重瀬の食堂"), "u2");
const dup = S.docs.get("storeAccounts/" + r.body.storeId) || {};
t("A5 運営掲載と同じ名前で100m以内（重複の候補）：承認待ちにせず active・重複の候補と記録（possible_duplicate）を保存", r.code === 200 && dup.registrationStatus === "active" && (dup.reviewFlags || []).includes("possible_duplicate") && (dup.duplicateCandidates || []).some((c) => c.id === "L1"), dup);
const rapid = [];
for (const n of ["連続1", "連続2", "連続3"]) { clearRate(); rapid.push(await call(REG(n), "u1")); }
const last = S.docs.get("storeAccounts/" + rapid[2].body.storeId) || {};
t("A6 24時間に3件を超える登録：承認待ちにせず active・記録（rapid_registrations）を保存", rapid.every((x) => x.code === 200 && x.body.registrationStatus === "active") && last.registrationStatus === "active" && (last.reviewFlags || []).includes("rapid_registrations"), { flags: last.reviewFlags, codes: rapid.map((x) => x.code) });
t("A7 承認待ち（pending_review）の店舗は1件も作られない", docsIn("storeAccounts").every((d) => d.v.registrationStatus === "active"), docsIn("storeAccounts").map((d) => d.v.registrationStatus));
r = await call(REG("x"), "unverified");
t("A8 メール未確認は 403（従来どおり）", r.code === 403 && r.body.reason === "email_not_verified", r.body);
clearRate();
const sameOwner = await call(REG("新しいカフェ"), "u1");
t("A9 同じアカウントの同じ店（名前・100m以内）は 409 already_registered（既存の店舗を上書きしない）", sameOwner.code === 409 && sameOwner.body.reason === "already_registered", sameOwner.body);

// ===================== B: automatic takeover =====================
const CLAIM = (submissionId, extra = {}) => ({ mode: "storeListingClaimCreate", submissionId, targetType: "new_store", role: "owner", publicReferenceUrl: "", note: "", ...extra });
r = await call(CLAIM("L1"), "u3");
t("B1 カード未登録：引き継ぎは 409 card_required・紐付け・申請・店舗は作られない", r.code === 409 && r.body.reason === "card_required" && !S.docs.get("storeListingLinks/L1") && docsIn("storeListingClaims").length === 0, r.body);
card("u3");
const storesBefore = docsIn("storeAccounts").length;
r = await call(CLAIM("L1"), "u3");
const link = S.docs.get("storeListingLinks/L1") || {};
const newStore = S.docs.get("storeAccounts/" + r.body.storeId) || {};
const claimDoc = (docsIn("storeListingClaims").find((d) => d.v.submissionId === "L1") || {}).v || {};
t("B2 カード登録済み：運営の承認なしでその場で引き継ぎ完了（approved・自動の記録・紐付け active・新しい店舗 active・owner）", r.code === 200 && r.body.status === "approved" && link.status === "active" && link.storeId === r.body.storeId && link.verificationMethod === "auto_card_registered" && claimDoc.status === "approved" && claimDoc.decidedByType === "auto" && claimDoc.verificationMethod === "auto_card_registered" && newStore.registrationStatus === "active" && newStore.createdByType === "listingClaim" && S.docs.get("storeMembers/" + r.body.storeId + "_u3").role === "owner" && docsIn("storeAccounts").length === storesBefore + 1, { body: r.body, link, claimDoc });
const prof = S.docs.get("storeProfiles/" + r.body.storeId) || {};
t("B3 運営掲載の文章・営業時間（定休日は休み・不定休は補足）・カテゴリ・支払い方法・テイクアウトを店舗情報（下書き）へ写す", prof.status === "draft" && prof.description === LISTING.content && prof.categoryCode === "gourmet" && JSON.stringify(prof.paymentMethodCodes) === '["cash","qr"]' && JSON.stringify(prof.featureCodes) === '["takeout"]' && prof.businessHours && JSON.stringify(prof.businessHours.weekly.tue) === "[]" && JSON.stringify(prof.businessHours.weekly.mon) === '[{"open":"11:00","close":"21:00"}]' && prof.businessHours.note === "不定休" && prof.copiedFromSubmissionId === "L1", prof);
t("B4 写さないもの：情報元ページ（websiteUrl）・Moderation 済みの記録（公開は店主の保存・公開の確認を通す）", !("websiteUrl" in prof) && !("moderatedText" in prof) && !("moderationStatus" in prof), Object.keys(prof));
t("B5 運営掲載（submissions）は書き換えない", JSON.stringify(S.docs.get("submissions/L1")) === listingBefore);
t("B6 写真の複製は代表の承認まで止めている（photoCopy: disabled・写真なし・Cloudinary への通信なし）", r.body.photoCopy === "disabled" && !prof.photos && otherNetwork === 0 && LC.LISTING_PHOTO_COPY_ENABLED === false, { photoCopy: r.body.photoCopy, photos: prof.photos });
card("u4");
const w0 = S.writes.length;
r = await call(CLAIM("L1"), "u4");
t("B7 二重引き継ぎの防止：管理者がいる掲載は、別のカード登録済みアカウントでも 409 listing_already_linked（奪えない・書き込みなし）", r.code === 409 && r.body.reason === "listing_already_linked" && S.docs.get("storeListingLinks/L1").storeId === link.storeId && S.writes.length === w0, r.body);
// concurrency: two accounts at the same time
card("u5"); card("u6");
const both = await Promise.all([call(CLAIM("L2"), "u5"), call(CLAIM("L2"), "u6")]);
const okCount = both.filter((x) => x.code === 200).length;
const l2stores = docsIn("storeAccounts").filter((d) => d.v.sourceSubmissionId === "L2");
t("B8 同時の引き継ぎ：片方だけが成功（もう片方は 409）・作られる店舗は1つ・紐付けは1つ", okCount === 1 && both.some((x) => x.code === 409 && x.body.reason === "listing_already_linked") && l2stores.length === 1 && S.docs.get("storeListingLinks/L2").storeId === l2stores[0].id, both.map((x) => [x.code, x.body.reason]));
r = await call(CLAIM("NOTAD"), "u4");
t("B9 運営の常設店舗広告でない投稿は引き継げない（404 listing_not_found）", r.code === 404 && r.body.reason === "listing_not_found", r.body);
// existing store target: fill only empty fields
S.docs.set("storeProfiles/" + (await (async () => { clearRate(); const rr = await call(REG("既存の店"), "u4"); return rr.body.storeId; })()), {});
const existingStoreId = docsIn("storeMembers").find((d) => d.v.uid === "u4").v.storeId;
S.docs.set("storeProfiles/" + existingStoreId, { storeId: existingStoreId, status: "draft", storeName: "既存の店", categoryCode: "cafe_sweets", description: "店主が書いた紹介文", sourceLanguage: "ja" });
r = await call(CLAIM("L3", { targetType: "existing_store", targetStoreId: existingStoreId }), "u4");
const exProf = S.docs.get("storeProfiles/" + existingStoreId);
t("B10 登録済みの自店舗へつなぐ：紐付け完了・店主が入れた紹介文とカテゴリは上書きしない・空の営業時間等だけ運営掲載で埋める", r.code === 200 && r.body.storeId === existingStoreId && S.docs.get("storeListingLinks/L3").storeId === existingStoreId && exProf.description === "店主が書いた紹介文" && exProf.categoryCode === "cafe_sweets" && exProf.businessHours && JSON.stringify(exProf.paymentMethodCodes) === '["cash","qr"]', exProf);
r = await call(CLAIM("L3", { targetType: "existing_store", targetStoreId: l2stores[0].id }), "u4");
t("B11 他人の店舗へはつなげない（403 target_store_not_allowed）", r.code === 403 && r.body.reason === "target_store_not_allowed", r.body);
// admin revoke still works; after revoke another card-registered account can take over
const rv = await call({ mode: "adminStoreListingLinkRevoke", submissionId: "L1", reason: "店舗からの申し出" }, "admin");
clearRate();
r = await call(CLAIM("L1"), "u4");
t("B12 運営による紐付けの解除は従来どおり（Admin だけ・履歴を残す）。解除後は別のカード登録済みアカウントが引き継げる", rv.code === 200 && r.code === 200 && S.docs.get("storeListingLinks/L1").status === "active" && S.docs.get("storeListingLinks/L1").storeId === r.body.storeId && (S.docs.get("storeListingLinks/L1").history || []).some((h) => h.event === "revoked"), { rv: rv.body, r: r.body });
const notAdmin = await call({ mode: "adminStoreListingLinkRevoke", submissionId: "L1", reason: "x" }, "u3");
t("B13 店主は紐付けを解除できない（Admin だけ）", notAdmin.code === 403 || notAdmin.code === 401, notAdmin.code);

// ===================== C: photos (copy logic, mocked Cloudinary) =====================
const db = getFirestore();
S.docs.set("storeProfiles/pc1", { storeId: "pc1", status: "draft" });
const copies = [];
const mockDeps = { copyListingPhotoToStore: async (url, storeId) => { copies.push(url); return { url: "https://res.cloudinary.com/cdhyctnp/image/upload/v2/machinau_store_profiles/" + storeId + "/c" + copies.length + ".jpg", publicId: "machinau_store_profiles/" + storeId + "/c" + copies.length }; } };
const many = { imageUrls: Array.from({ length: 12 }, (_, i) => "https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_admin/p" + i + ".jpg").concat(["https://evil.example.com/x.jpg"]) };
const off = await LC.copyListingPhotosToProfile(db, "pc1", many, mockDeps);
t("C1 既定（承認前）は写真を複製しない（Cloudinary を呼ばない）", off.status === "disabled" && copies.length === 0, off);
const on = await LC.copyListingPhotosToProfile(db, "pc1", many, mockDeps, { enabled: true });
const pcPhotos = S.docs.get("storeProfiles/pc1").photos || [];
t("C2 複製（モック）：マチナウの Cloudinary の画像だけ・最大10枚・店舗の写真フォルダー・photos に保存", on.status === "copied" && copies.length === 10 && !copies.some((u) => u.includes("evil")) && pcPhotos.length === 10 && pcPhotos.every((p) => p.publicId.startsWith("machinau_store_profiles/pc1/")), { on, n: pcPhotos.length });
const again = await LC.copyListingPhotosToProfile(db, "pc1", many, mockDeps, { enabled: true });
t("C3 店主の写真が既にある時は複製しない（上書きしない）", again.status === "skipped_existing" && copies.length === 10, again);
// STEP 42-F｜Preview 実証の条件（試験の印 previewTrial: "STEP42-F" ＋ Preview・対象ブランチ・machinau-preview の判定）。
const FT = await import(REPO_URL + "/api/_lib/firebase-target.js");
const trialOn = { ...mockDeps, isListingPhotoCopyTrialEnabled: () => true };
const trialOff = { ...mockDeps, isListingPhotoCopyTrialEnabled: () => false };
const marked = { ...many, previewTrial: "STEP42-F" };
t("C4 試験の印の無い掲載は、試験環境でも複製しない", LC.isListingPhotoCopyAllowed(many, trialOn) === false && LC.isListingPhotoCopyAllowed({ ...many, previewTrial: "STEP42-E" }, trialOn) === false);
t("C5 試験の印があっても、環境の判定が false（Production など）なら複製しない", LC.isListingPhotoCopyAllowed(marked, trialOff) === false && LC.isListingPhotoCopyAllowed(marked, mockDeps) === false);
S.docs.set("storeProfiles/pc2", { storeId: "pc2", status: "draft" });
const before5 = copies.length;
const offEnv = await LC.copyListingPhotosToProfile(db, "pc2", marked, trialOff);
const onTrial = await LC.copyListingPhotosToProfile(db, "pc2", marked, trialOn);
t("C6 試験の印＋試験環境の時だけ複製（最大10枚・店舗の写真フォルダー）", offEnv.status === "disabled" && onTrial.status === "copied" && copies.length - before5 === 10 && (S.docs.get("storeProfiles/pc2").photos || []).every((p) => p.publicId.startsWith("machinau_store_profiles/pc2/")), { offEnv, onTrial });
const prodEnv = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" };
t("C7 環境の判定：Production・対象外のブランチ・ローカルでは false", FT.isPreviewListingPhotoCopyTrialEnabled(prodEnv) === false && FT.isPreviewListingPhotoCopyTrialEnabled({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/other" }) === false && FT.isPreviewListingPhotoCopyTrialEnabled({}) === false);
t("C8 本番の有効化 LISTING_PHOTO_COPY_ENABLED は false のまま", LC.LISTING_PHOTO_COPY_ENABLED === false);
S.docs.set("storeProfiles/pc3", { storeId: "pc3", status: "draft" });
let active = 0, peak = 0;
const slowDeps = { copyListingPhotoToStore: async (url, storeId) => { active++; peak = Math.max(peak, active); const n = Number(url.split("/p").pop().split(".")[0]); await new Promise((r) => setTimeout(r, 30 - n * 2)); active--; if (n === 3) throw new Error("x"); return { url: "https://res.cloudinary.com/cdhyctnp/image/upload/v2/machinau_store_profiles/" + storeId + "/k" + n + ".jpg", publicId: "machinau_store_profiles/" + storeId + "/k" + n }; } };
const conc = await LC.copyListingPhotosToProfile(db, "pc3", many, slowDeps, { enabled: true });
const order = (S.docs.get("storeProfiles/pc3").photos || []).map((p) => p.publicId.split("/").pop());
t("C9 複製は同時に最大5件・並び順は掲載の順・1枚の失敗で他は止まらない", conc.status === "copied" && conc.copied === 9 && peak === 5 && JSON.stringify(order) === JSON.stringify(["k0", "k1", "k2", "k4", "k5", "k6", "k7", "k8", "k9"]), { conc, peak, order });

// ===================== D: operator approval path (kept) =====================
S.docs.set("submissions/L4", { ...LISTING, shopName: "四号店" });
S.docs.set("storeListingClaims/legacy1", { submissionId: "L4", claimantUid: "u6", targetType: "new_store", targetStoreId: "", role: "owner", publicReferenceUrl: "", note: "", claimCode: "ABC234", status: "pending", verificationMethod: "operator_review", createdAt: Timestamp.fromMillis(Date.now()) });
const ap = await call({ mode: "adminStoreListingClaimReview", claimId: "legacy1", decision: "approve", reason: "", verificationChannel: "official_website", verificationNote: "" }, "admin");
const apProf = S.docs.get("storeProfiles/" + ap.body.storeId) || {};
t("D1 運営の承認の処理（承認待ちの申請があった場合）も共通の紐付け処理で動き、文章等を写す", ap.code === 200 && ap.body.status === "approved" && S.docs.get("storeListingLinks/L4").verificationMethod === "operator_review" && apProf.description === LISTING.content && S.docs.get("storeListingClaims/legacy1").status === "approved", { ap: ap.body, apProf });

// ===================== Z: invariants =====================
t("Z1 課金関連3フラグは false のまま・Stripe／Cloudinary への通信なし（地図の住所確認だけ模擬）", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false && otherNetwork === 0 && geocodeCalls > 0);
const touched = [...new Set(S.writes.map((w) => w.split("/")[0]))].sort();
t("Z2 書き込み先は店舗登録・引き継ぎ関連だけ（請求・カード・submissions は書かない）", !touched.includes("submissions") && !touched.includes("imadakeMonthlyInvoices") && touched.every((c) => ["accountBilling", "storeAccounts", "storeMembers", "storeProfiles", "storeListingLinks", "storeListingClaims", "storeRegistrationRateLimits"].includes(c)), touched);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
