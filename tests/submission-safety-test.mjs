// STEP 55: safety of general (post.html) submissions and the operator check.
// REAL moderate-submission handler + REAL admin APIs on mocked firebase-admin; OpenAI Moderation is a local stub.
// Also checks that post.html, admin.html, api/_lib/submission-safety.js and firestore.rules use the same field list.
// No network, no real Firestore/OpenAI. The rules themselves are verified separately with the Firebase rules test API.
// run: node --import ./tests/mockfa-occ/register.mjs tests/submission-safety-test.mjs
import { REPO_URL, REPO_ROOT } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import vm from "node:vm";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
process.env.OPENAI_API_KEY = "sk-" + "fake-openai-for-tests";
const ADMIN = "admin@example.com";
const tok = (uid, email, verified, provider = "password") => Object.assign({ uid, email, firebase: { sign_in_provider: provider } }, verified === undefined ? {} : { email_verified: verified });
globalThis.__MOCK_TOKENS = {
  admin: tok("adm1", ADMIN, true), adminUpper: tok("adm1", "Admin@Example.COM", true), adminUnverified: tok("adm2", ADMIN, false), adminNoFlag: tok("adm3", ADMIN, undefined),
  user: tok("u1", "someone@example.com", true), look: tok("u2", "admin@example.com.evil.test", true)
};
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const OA = { calls: 0, flagged: false };
let otherNetwork = 0;
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname === "api.openai.com" && u.pathname === "/v1/moderations") {
    OA.calls++;
    return { ok: true, status: 200, json: async () => ({ results: [{ flagged: OA.flagged, categories: {}, category_scores: {} }] }) };
  }
  otherNetwork++; throw new Error("unexpected fetch " + url);
};

const SAFE = await import(REPO_URL + "/api/_lib/submission-safety.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const { default: submissionGet } = await import(REPO_URL + "/api/admin-submission-get.js");
const { default: sourceList } = await import(REPO_URL + "/api/admin-source-list.js");
const { Timestamp } = await import("firebase-admin/firestore");
// 模擬の Timestamp に無い fromDate だけをこの試験の中で補う(自動承認が終了日時を作る時に使う)。
if (typeof Timestamp.fromDate !== "function") Timestamp.fromDate = (d) => Timestamp.fromMillis(d.getTime());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const read = (p) => readFileSync(join(REPO_ROOT, p), "utf8").replace(/\r\n/g, "\n");
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const mkRes = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
let ip = 0;
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

// ---- A. the same lists in every place ----
const ALLOWED = SAFE.PUBLIC_SUBMISSION_ALLOWED_FIELDS;
const postHtml = read("post.html");
const block = postHtml.slice(postHtml.indexOf("const submissionData = {"), postHtml.indexOf("const submissionDocumentReference"));
const postKeys = [...block.matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((m) => m[1]);
t("A1 post.html が送る項目＝許可の一覧(順番も同じ)", sameList(postKeys, [...ALLOWED]), { postKeys });
const rules = read("firestore.rules");
const fnList = (name) => { const m = rules.match(new RegExp("function " + name + "\\(\\) \\{\\s*return \\[([\\s\\S]*?)\\];")); return m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : null; };
t("A2 firestore.rules の publicSubmissionFields＝許可の一覧", sameList(fnList("publicSubmissionFields") || [], [...ALLOWED]), fnList("publicSubmissionFields"));
t("A3 firestore.rules の掲載時間＝3・6・12・24", sameList((fnList("publicSubmissionDurationHours") || []).map(Number), [...SAFE.PUBLIC_SUBMISSION_DURATION_HOURS]) && sameList([...SAFE.PUBLIC_SUBMISSION_DURATION_HOURS], [3, 6, 12, 24]));
t("A4 firestore.rules の自動審査の項目＝4つ", sameList(fnList("publicSubmissionReviewFields") || [], ["aiReviewStatus", "aiReviewReason", "aiReviewedAt", "aiReviewVersion"]));
const adminHtml = read("admin.html");
const htmlList = (name) => { const m = adminHtml.match(new RegExp("const " + name + " = \\[([\\s\\S]*?)\\];")); return m ? m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : null; };
t("A5 admin.html の許可の一覧＝同じ", sameList(htmlList("PUBLIC_SUBMISSION_ALLOWED_FIELDS") || [], [...ALLOWED]));
t("A6 admin.html の掲載時間＝同じ", sameList((htmlList("PUBLIC_SUBMISSION_DURATION_HOURS") || []).map(Number), [3, 6, 12, 24]));
t("A7 post.html の画面の選択肢も 3・6・12・24 時間", sameList([...postHtml.matchAll(/<option value="(\d+)">/g)].map((m) => Number(m[1])), [3, 6, 12, 24]));
t("A8 運営用の項目(isPermanentAd・postType・authorType・sourceType・operatorUid・aiReviewStatus 等)は許可の一覧に無い", ["isPermanentAd", "postType", "authorType", "sourceType", "sourceTrust", "sourceLabel", "publisherType", "operatorUid", "operatorEmail", "operatorRole", "aiReviewStatus", "endedAt", "endedBy", "area", "closedDays", "irregularClosed", "sourceId", "sourceArticleUrl"].every((k) => !ALLOWED.includes(k)));

// ---- B. the rules text (behaviour is verified with the rules test API; here: the text stays as intended) ----
t("B1 isAdmin() はメールの一致とメール確認済みの両方", /function isAdmin\(\) \{\s*return request\.auth != null\s*&& request\.auth\.token\.email == "9413yutaka@gmail\.com"\s*&& request\.auth\.token\.email_verified == true;/.test(rules));
const createRule = rules.slice(rules.indexOf("match /submissions/{document}"), rules.indexOf("allow read: if", rules.indexOf("match /submissions/{document}")));
t("B2 投稿の作成は許可の一覧だけ(hasOnly)", createRule.includes("request.resource.data.keys().hasOnly(publicSubmissionFields())"));
t("B3 投稿の作成は掲載時間 3・6・12・24 時間だけ", createRule.includes("request.resource.data.durationHours in publicSubmissionDurationHours()"));
t("B4 投稿の作成は終了日時が48時間以内", createRule.includes("request.resource.data.expiresAt <= request.time + duration.value(48, 'h')"));
t("B5 一般利用者は審査待ち(pending)でしか作れない(従来どおり)", /request\.resource\.data\.status == "pending"\s*\|\| \(isAdmin\(\) && request\.resource\.data\.status == "approved"\)/.test(createRule));
const updateRule = rules.slice(rules.indexOf("allow update: if", rules.indexOf("match /submissions/{document}")), rules.indexOf("allow delete: if false;", rules.indexOf("match /submissions/{document}")));
t("B6 承認への変更は一般の投稿の項目・正しい掲載時間の投稿だけ", updateRule.includes("resource.data.keys().hasOnly(") && updateRule.includes("publicSubmissionFields().concat(publicSubmissionReviewFields())") && updateRule.includes("resource.data.durationHours in publicSubmissionDurationHours()"));
t("B7 運営の更新で変えられる項目は従来の5つのまま", /hasOnly\(\[\s*"status",\s*"updatedAt",\s*"endedAt",\s*"endedBy",\s*"expiresAt"\s*\]\)/.test(updateRule));
for (const col of ["accountBilling", "storeBilling", "imadakePosts", "imadakeStoreSlots", "imadakeRateLimits", "storeMembers", "storeProfiles", "storeRegistrationRateLimits", "storeListingClaims", "storeListingLinks", "storeBillingRateLimits", "imadakeMonthlyInvoices", "imadakePostDailyCharges", "imadakeCvViews"]) {
  t("B8 " + col + " はブラウザから読み書きできないまま", new RegExp("match /" + col + "/\\{\\w+\\} \\{\\s*allow read, write: if false;\\s*\\}").test(rules));
}
// STEP 58｜契約(storeCustomPlans)は明示の拒否(allow read, write: if false)を足した。許可の記載が無いことは同じ。
const denyOnly = (c) => { const m = rules.match(new RegExp("match /" + c + "/\\{[^}]+\\} \\{([^}]*)\\}")); return !rules.includes(c) || (!!m && m[1].trim() === "allow read, write: if false;" && rules.split(c).length === 2); };
t("B9 請求・領収書・返金・提供の記録・契約のコレクションに許可の記載が無い(記載が無いか、明示の拒否だけ)", ["storeCustomPlanInvoices", "storeCustomPlanReceipts", "storeCustomPlanRefunds", "storeCustomPlanReceiptProvisions", "storeCustomPlans"].every(denyOnly) && rules.includes("match /storeCustomPlans/{storeId}"));
t("B10 すべてを許可するワイルドカードが無い", !/match \/\{document=\*\*\}/.test(rules) && !/allow read, write: if true/.test(rules));
t("B11 投稿の削除は禁止のまま", /match \/submissions\/\{document\}[\s\S]*?allow delete: if false;/.test(rules));
t("B12 firestore.rules は公開サイトに配信しない(.vercelignore)", read(".vercelignore").split("\n").map((s) => s.trim()).includes("/firestore.rules"));

// ---- C. the shared checks ----
const okPost = () => ({ shopName: "s", title: "t", category: "street_discovery", durationHours: 3, expiresAt: "x", content: "c", status: "pending", publicationNumber: "12345678", endCodeHash: "h" });
t("C1 通常の投稿は受け付ける", SAFE.checkPublicSubmission(okPost()).ok === true);
t("C2 自動審査の項目(ERROR の後のやり直し)は混入と扱わない", SAFE.checkPublicSubmission(Object.assign(okPost(), { aiReviewStatus: "ERROR", aiReviewReason: "r", aiReviewedAt: 1, aiReviewVersion: "v" })).ok === true);
const c3 = SAFE.checkPublicSubmission(Object.assign(okPost(), { isPermanentAd: true, postType: "admin" }));
t("C3 isPermanentAd・postType は disallowed_fields", c3.ok === false && c3.reason === "disallowed_fields" && sameList(c3.fields, ["isPermanentAd", "postType"]), c3);
for (const [label, v] of [["48", 48], ["0", 0], ["-3", -3], ["3.5", 3.5], ["1e9", 1e9], ["NaN", NaN], ["Infinity", Infinity], ["\"3\"", "3"], ["null", null], ["配列", [3]], ["無し", undefined]]) {
  const r = SAFE.checkPublicSubmission(Object.assign(okPost(), { durationHours: v }));
  t("C4 掲載時間 " + label + " は invalid_duration", r.ok === false && r.reason === "invalid_duration", r);
}
for (const h of [3, 6, 12, 24]) t("C5 掲載時間 " + h + " 時間は受け付ける", SAFE.isAllowedPublicSubmissionDurationHours(h));
t("C6 データが無い・オブジェクトでない時は受け付けない", SAFE.checkPublicSubmission(null).ok === false && SAFE.checkPublicSubmission("x").ok === false);
const v = SAFE.isVerifiedAdminToken;
t("C7 運営の判定：メール一致＋確認済みだけ true", v(tok("a", ADMIN, true), ADMIN) && v(tok("a", "Admin@Example.COM", true), " admin@example.com "));
t("C8 運営の判定：未確認・確認の印なし・別のメール・メールなし・ADMIN_EMAIL 未設定は false", !v(tok("a", ADMIN, false), ADMIN) && !v(tok("a", ADMIN, undefined), ADMIN) && !v(tok("a", "admin@example.com.evil.test", true), ADMIN) && !v(tok("a", undefined, true), ADMIN) && !v(tok("a", ADMIN, true), "") && !v(tok("a", ADMIN, true), undefined) && !v(null, ADMIN) && !v(Object.assign(tok("a", ADMIN, "true")), ADMIN));

// ---- D. the automatic review (moderate-submission) ----
const END = "ABCDEFGHJKLM";
const endHash = createHash("sha256").update(END, "utf8").digest("hex");
let pubSeq = 10000000;
const T0 = Date.now();
function seed(extra = {}) {
  const pub = String(++pubSeq);
  const id = "sub" + pub;
  S.docs.set("submissions/" + id, Object.assign({
    shopName: "那覇の市場", title: "那覇の市場", category: "street_discovery", durationHours: 3, expiresAt: Timestamp.fromMillis(T0 + 3 * 3600e3),
    content: "朝市がにぎわっています", address: "沖縄県那覇市松尾", latitude: 26.21, longitude: 127.68, websiteUrl: "", businessStartTime: "", businessEndTime: "",
    isOpen24Hours: false, takeout: false, paymentMethods: [], imageUrls: [], imagePublicIds: [], images: [], submissionType: "street", status: "pending",
    publicationNumber: pub, endCodeHash: endHash, createdAt: Timestamp.fromMillis(T0), updatedAt: Timestamp.fromMillis(T0), source: "web", version: "1.2"
  }, extra));
  return { id, pub };
}
const doc = (id) => S.docs.get("submissions/" + id);
async function review(pub, endCode = END) {
  const r = mkRes();
  await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250) }, body: { publicationNumber: pub, endCode }, query: {} }, r));
  return r;
}
const hoursLeft = (ts) => (ts && ts.toMillis ? (ts.toMillis() - Date.now()) / 3600e3 : NaN);

{
  const s = seed(); const before = OA.calls; const r = await review(s.pub);
  t("D1 通常の街の発見の投稿は従来どおり自動承認(SAFE)", r.code === 200 && doc(s.id).status === "approved" && doc(s.id).aiReviewStatus === "SAFE" && OA.calls === before + 1, { r: r.body, d: doc(s.id) });
  t("D2 自動承認の終了日時はサーバーが掲載時間(3時間)から計算", Math.abs(hoursLeft(doc(s.id).expiresAt) - 3) < 0.05, hoursLeft(doc(s.id).expiresAt));
}
for (const h of [6, 12, 24]) {
  const s = seed({ durationHours: h, expiresAt: Timestamp.fromMillis(T0 + h * 3600e3) }); await review(s.pub);
  t(`D3 掲載時間 ${h} 時間も自動承認・終了日時は ${h} 時間後`, doc(s.id).status === "approved" && Math.abs(hoursLeft(doc(s.id).expiresAt) - h) < 0.05);
}
{
  const s = seed({ expiresAt: Timestamp.fromMillis(T0 + 1000 * 24 * 3600e3) }); await review(s.pub);
  t("D4 終了日時を1000日後に書き換えた投稿も、承認の時に掲載時間(3時間)へ計算し直す", doc(s.id).status === "approved" && Math.abs(hoursLeft(doc(s.id).expiresAt) - 3) < 0.05, hoursLeft(doc(s.id).expiresAt));
}
for (const [k, val] of [["isPermanentAd", true], ["postType", "admin"], ["authorType", "operator"], ["sourceType", "official"], ["operatorUid", "adm1"], ["sourceLabel", "マチナウ運営より"], ["closedDays", ["mon"]], ["storeId", "st1"]]) {
  const s = seed({ [k]: val }); const before = OA.calls; const r = await review(s.pub);
  const d = doc(s.id);
  t(`D5 運営用の項目 ${k} が付いた投稿は自動承認せず却下(rejected・審査に進まない)`, r.code === 400 && r.body.reason === "disallowed_fields" && d.status === "rejected" && d.aiReviewStatus === "REJECTED" && OA.calls === before, { r: r.body, status: d.status, ai: d.aiReviewStatus });
}
for (const [label, val] of [["48", 48], ["1000", 1000], ["0", 0], ["-3", -3], ["3.5", 3.5], ["文字列\"3\"", "3"], ["null", null]]) {
  const s = seed({ durationHours: val }); const before = OA.calls; const r = await review(s.pub);
  t(`D6 掲載時間 ${label} の投稿は自動承認せず却下`, r.code === 400 && r.body.reason === "invalid_duration" && doc(s.id).status === "rejected" && OA.calls === before, { r: r.body, d: doc(s.id).status });
}
{
  const s = seed({ isPermanentAd: true, aiReviewStatus: "SAFE" }); const r = await review(s.pub);
  t("D7 自動審査の結果(SAFE)を偽って付けた混入の投稿も却下(審査済みとして素通りさせない)", r.code === 400 && doc(s.id).status === "rejected", { r: r.body, d: doc(s.id).status });
}
{
  const s = seed({ aiReviewStatus: "REVIEW", aiReviewReason: "要確認", aiReviewedAt: Timestamp.fromMillis(T0), aiReviewVersion: "v" }); const r = await review(s.pub);
  t("D8 要確認(REVIEW)の正常な投稿は従来どおり審査をやり直さず審査待ちのまま", r.code === 200 && doc(s.id).status === "pending" && doc(s.id).aiReviewStatus === "REVIEW", { r: r.body });
}
{
  const s = seed(); OA.flagged = true; await review(s.pub); OA.flagged = false;
  t("D9 不適切と判定された正常な投稿は従来どおり要確認(却下しない)", doc(s.id).status === "pending" && doc(s.id).aiReviewStatus === "REVIEW");
}
{
  const s = seed({ isPermanentAd: true }); const r = await review(s.pub, "ZZZZZZZZZZZZ");
  t("D10 終了番号が違えば何も変えない(他人の投稿を却下させられない)", r.code === 401 && doc(s.id).status === "pending" && !doc(s.id).aiReviewStatus, { r: r.body });
}
{
  const s = seed({ durationHours: 48 }); S.docs.get("submissions/" + s.id).status = "approved"; const r = await review(s.pub);
  t("D11 審査待ち以外(承認済み)は従来どおり処理しない(却下に変えない)", r.code === 200 && doc(s.id).status === "approved" && !doc(s.id).aiReviewStatus);
}
{
  const s = seed({ submissionType: "shop" }); const r = await review(s.pub);
  t("D12 店舗モードの投稿は従来どおり準備中(403・審査待ちのまま)", r.code === 403 && doc(s.id).status === "pending");
}
t("D13 却下した投稿の運営用の項目は承認で有効にならない(status は rejected のまま)", [...S.docs.entries()].filter(([k, d]) => k.startsWith("submissions/") && (d.isPermanentAd || d.postType || d.authorType)).every(([, d]) => d.status !== "approved"));

// ---- E. the operator check on the server ----
async function get(fn, token, query = {}) {
  const r = mkRes();
  await quiet(() => fn({ method: "GET", headers: Object.assign({ "x-forwarded-for": "198.51.100." + (++ip % 250) }, token ? { authorization: "Bearer " + token } : {}), query, body: {} }, r));
  return r;
}
const one = seed({ status: "approved", postType: "admin", operatorUid: "adm1" });
{
  const a = await get(submissionGet, "admin", { id: one.id });
  t("E1 運営(メール確認済み)は運営の API を使える(投稿の取得)", a.code === 200, a.body);
  const a2 = await get(submissionGet, "adminUpper", { id: one.id });
  t("E2 大文字小文字の違いは従来どおり同じメールとみなす", a2.code === 200, a2.body);
  for (const k of ["adminUnverified", "adminNoFlag", "user", "look"]) {
    const r = await get(submissionGet, k, { id: one.id });
    t("E3 " + k + " は運営の API を使えない(403)", r.code === 403, r.body);
  }
  const n = await get(submissionGet, null, { id: one.id });
  t("E4 ログインなしは 401(従来どおり)", n.code === 401);
}
{
  const r = mkRes(); await quiet(() => handler({ method: "POST", headers: { authorization: "Bearer adminUnverified", "x-forwarded-for": "198.51.100.7" }, body: { mode: "getMyOperatorInfo" }, query: {} }, r));
  const r2 = mkRes(); await quiet(() => handler({ method: "POST", headers: { authorization: "Bearer admin", "x-forwarded-for": "198.51.100.8" }, body: { mode: "getMyOperatorInfo" }, query: {} }, r2));
  t("E5 運営の情報(getMyOperatorInfo)：確認済みは admin、未確認は運営として扱わない", JSON.stringify(r2.body).includes("admin") && !(r.body && r.body.actor && r.body.actor.type === "admin") && !(r.body && r.body.role === "admin") && !(r.body && r.body.isAdmin === true), { unverified: r.body, verified: r2.body });
}
{
  const ok = await get(sourceList, "admin");
  const ng = await get(sourceList, "adminUnverified");
  const ng2 = await get(sourceList, "adminNoFlag");
  t("E6 素材の管理 API(admin-source-list)：メール未確認・確認の印なしは 403", ng.code === 403 && ng2.code === 403, { ng: ng.code, ng2: ng2.code });
  t("E7 素材の管理 API：運営(メール確認済み)は権限の確認を通る(403 にならない)", ok.code !== 403 && ok.code !== 401, { code: ok.code, body: ok.body });
}
for (const f of ["admin-source-bulk-create", "admin-source-collect", "admin-source-delete", "admin-source-list", "admin-source-save"]) {
  t("E8 " + f + " は運営の判定にメール確認済みを含む", /adminEmail\.toLowerCase\(\) \|\|\s*decodedToken\.email_verified !== true/.test(read("api/" + f + ".js")));
}

// ---- F. the operator's manual approval in admin.html ----
const startAt = adminHtml.indexOf("// STEP 55｜一般投稿で受け付ける項目と掲載時間");
const endAt = adminHtml.indexOf("async function rejectSubmission(");
const approveCode = adminHtml.slice(startAt, endAt);
function adminSandbox(items) {
  const ctx = { updates: [], messages: [], confirmed: 0 };
  const sandbox = {
    currentPendingSubmissions: items,
    showAdminMessage: (m, k) => ctx.messages.push({ m, k }),
    clearAdminMessage: () => {}, setPendingCardButtonsDisabled: () => {}, loadSubmissions: async () => {}, console: { error: () => {} },
    window: { confirm: () => { ctx.confirmed++; return true; }, machinauDb: { collection: () => ({ doc: (id) => ({ update: async (d) => ctx.updates.push({ id, d }) }) }) } },
    firebase: { firestore: { Timestamp: { fromDate: (d) => ({ ms: d.getTime() }) }, FieldValue: { serverTimestamp: () => "ts" } } },
    Date
  };
  vm.createContext(sandbox);
  vm.runInContext(approveCode + "\nthis.approveSubmission = approveSubmission;", sandbox);
  return { ctx, approve: (id) => sandbox.approveSubmission(id) };
}
const item = (id, extra = {}) => Object.assign({ id, shopName: "店", title: "t", category: "c", content: "c", durationHours: 3, status: "pending", publicationNumber: "1", endCodeHash: "h", createdAt: 1, updatedAt: 1, source: "web", version: "1.2" }, extra);
{
  const { ctx, approve } = adminSandbox([item("a")]); await approve("a");
  t("F1 運営画面：通常の審査待ちは承認できる(終了日時は今から3時間)", ctx.updates.length === 1 && ctx.updates[0].d.status === "approved" && Math.abs((ctx.updates[0].d.expiresAt.ms - Date.now()) / 3600e3 - 3) < 0.05, ctx);
}
{
  const { ctx, approve } = adminSandbox([item("b", { aiReviewStatus: "REVIEW", aiReviewReason: "r" })]); await approve("b");
  t("F2 運営画面：自動審査の要確認の投稿も承認できる", ctx.updates.length === 1);
}
for (const [k, val] of [["isPermanentAd", true], ["postType", "admin"], ["authorType", "operator"], ["sourceType", "official"]]) {
  const { ctx, approve } = adminSandbox([item("c", { [k]: val })]); await approve("c");
  t(`F3 運営画面：${k} が混入した投稿は承認しない(確認の前に止める・書き込みなし)`, ctx.updates.length === 0 && ctx.confirmed === 0 && ctx.messages.some((m) => m.k === "error" && m.m.includes(k)), ctx);
}
for (const [label, val] of [["48", 48], ["1000", 1000], ["0", 0], ["文字列\"3\"", "3"]]) {
  const { ctx, approve } = adminSandbox([item("d", { durationHours: val })]); await approve("d");
  t(`F4 運営画面：掲載時間 ${label} の投稿は承認しない`, ctx.updates.length === 0 && ctx.messages.some((m) => m.k === "error"), ctx);
}

t("Z1 外部への通信は OpenAI の模擬だけ", otherNetwork === 0, otherNetwork);
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
