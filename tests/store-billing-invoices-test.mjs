// STEP 38-B: store billing history (mode storeBillingInvoices, read-only). REAL moderate-submission handler + REAL
// api/_lib/store-billing.js on mocked firebase-admin. No network, no Stripe, no real data. IDs below are fake strings.
// run: node --import ./tests/mockfa-occ/register.mjs tests/store-billing-invoices-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const pw = (uid, email, verified = true) => ({ uid, email, email_verified: verified, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { owner: pw("u1", "owner@example.com"), other: pw("u2", "other@example.com"), editor: pw("u5", "ed@example.com"), unverified: pw("u1", "owner@example.com", false), anon: { uid: "a1", firebase: { sign_in_provider: "anonymous" } }, emptyOwner: pw("u3", "empty@example.com"), unifyOwner: pw("u4", "unify@example.com"), admin: pw("adm1", "admin@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let network = 0;
globalThis.fetch = async (url) => { network++; throw new Error("unexpected network " + url); };

// mockのFirestoreは globalThis.__MOCK_DB を読み込み時に取り込むため、上で用意した後に読み込む。
const { Timestamp, getFirestore } = await import("firebase-admin/firestore");
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
const IM = await import(REPO_URL + "/api/_lib/imadake.js");
const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js");
const CH = await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js");
const RP = await import(REPO_URL + "/api/_lib/imadake-cv-report.js");
const FT = await import(REPO_URL + "/api/_lib/firebase-target.js");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };

const BRANCH = "preview/stripe-card-setup";
const sa = (id) => JSON.stringify({ type: "service_account", project_id: id, private_key: "-----FAKE-KEY-FOR-TESTS-----" });
const TRIAL = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCH, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("machinau-preview") };
const ENV_KEYS = ["VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW"];
const setEnv = (env) => { for (const k of ENV_KEYS) delete process.env[k]; Object.assign(process.env, env); };

let ip = 0;
async function call(body, token) {
  const r = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); } finally { console.error = e; }
  return r;
}
const Q = (storeId, extra) => ({ mode: "storeBillingInvoices", storeId, ...(extra || {}) });

// ---- month keys relative to the real clock (the handler uses Date.now) ----
const jstMonth = (offset) => { const d = new Date(Date.now() + 9 * 3600 * 1000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1)).toISOString().slice(0, 7); };
const M0 = jstMonth(0), M1 = jstMonth(1), M2 = jstMonth(2), M3 = jstMonth(3), M4 = jstMonth(4), M5 = jstMonth(5), M6 = jstMonth(6), M11 = jstMonth(11), M12 = jstMonth(12);
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// ---- seed ----
const store = (name, extra) => ({ storeName: name, enabled: true, createdByType: "storeUser", registrationStatus: "active", ...(extra || {}) });
S.docs.set("storeAccounts/s1", store("店1"));
S.docs.set("storeAccounts/s2", store("店2"));
S.docs.set("storeAccounts/s3", store("請求なしの店"));
S.docs.set("storeAccounts/s4", store("統一確認の店"));
S.docs.set("storeMembers/s1_u1", { storeId: "s1", uid: "u1", role: "owner", status: "active" });
S.docs.set("storeMembers/s2_u2", { storeId: "s2", uid: "u2", role: "owner", status: "active" });
S.docs.set("storeMembers/s1_u5", { storeId: "s1", uid: "u5", role: "editor", status: "active" });
S.docs.set("storeMembers/s3_u3", { storeId: "s3", uid: "u3", role: "owner", status: "active" });
S.docs.set("storeMembers/s4_u4", { storeId: "s4", uid: "u4", role: "owner", status: "active" });
S.docs.set("storeAccounts/legacy", { storeName: "旧方式の店", enabled: true, storeToken: "legacy-token-xyz" });

const XSS = `<img src=x onerror="window.__xss=1">`;
S.docs.set("imadakePosts/p1", { storeId: "s1", headline: "ランチ半額", cvBillingEnabled: true, status: "published" });
S.docs.set("imadakePosts/p2", { storeId: "s1", headline: XSS, cvBillingEnabled: true, status: "published" });
S.docs.set("imadakePosts/pFree", { storeId: "s1", headline: "無料の投稿", cvBillingEnabled: false, status: "published" });
S.docs.set("imadakePosts/pOther", { storeId: "s2", headline: "他店の見出し（出してはいけない）", cvBillingEnabled: true, status: "published" });

const SECRET = { paymentIntentId: "pi_FAKESECRET001", chargeCustomerId: "cus_FAKESECRET", chargePaymentMethodId: "pm_FAKESECRET", chargeIdempotencyKey: "machinau-charge-idem-FAKE", chargeLeaseId: "lease-FAKE", chargeLeaseUntilMs: 1, closeRunId: "run-FAKE", closedByUid: "adm1", chargeCardVersion: 3, lastChargeError: { status: 402, type: "card_error", code: "card_declined", declineCode: "insufficient_funds" }, chargeErrorReason: "raw-error-text-FAKE", chargeHistory: [{ paymentIntentId: "pi_FAKEHIST" }] };
const inv = (storeId, month, status, extra) => S.docs.set(`imadakeMonthlyInvoices/${storeId}_${month}`, { storeId, month, status, lineCount: 1, amountJpy: 100, currency: "JPY", taxIncluded: true, unitAmountJpy: 100, closedAt: Timestamp.fromMillis(Date.parse(month + "-01T00:00:00Z") + 33 * 86400000), ...SECRET, ...(extra || {}) });
inv("s1", M1, "closed", { lineCount: 2, amountJpy: 200 });
inv("s1", M2, "paid", { paidAt: Timestamp.fromMillis(Date.parse(M1 + "-05T03:00:00Z")) });
inv("s1", M3, "payment_failed");
inv("s1", M4, "requires_action");
inv("s1", M5, "closing");
inv("s1", M6, "needs_review");
inv("s1", M11, "charging", { chargeOutcomeUnknown: true });
inv("s1", M12, "paid");                         // 13か月前：表示しない
inv("s2", M1, "closed");                        // 他店
S.docs.set(`imadakeMonthlyInvoices/s1_bogus`, { storeId: "s1", month: M1, status: "paid", amountJpy: 99999 }); // IDの形が違う
const charge = (id, data) => S.docs.set("imadakePostDailyCharges/" + id, { currency: "JPY", amountJpy: 100, validCvCount: 1, ...data });
charge(`p1_${M1}-03`, { postId: "p1", storeId: "s1", jstDate: `${M1}-03`, status: "invoiced", invoiceId: `s1_${M1}` });
charge(`p2_${M1}-04`, { postId: "p2", storeId: "s1", jstDate: `${M1}-04`, status: "invoiced", invoiceId: `s1_${M1}` });
charge(`p1_${M2}-10`, { postId: "p1", storeId: "s1", jstDate: `${M2}-10`, status: "invoiced", invoiceId: `s1_${M2}` });
charge(`p1_${M5}-10`, { postId: "p1", storeId: "s1", jstDate: `${M5}-10`, status: "invoiced", invoiceId: `s1_${M5}` });
charge(`pOther_${M1}-03`, { postId: "pOther", storeId: "s2", jstDate: `${M1}-03`, status: "invoiced", invoiceId: `s2_${M1}` });
// 見込み(当月)：有効2件、除外4件
charge(`p1_${TODAY}`, { postId: "p1", storeId: "s1", jstDate: TODAY, status: "accrued", validCvCount: 3 });
charge(`p2_${TODAY}`, { postId: "p2", storeId: "s1", jstDate: TODAY, status: "accrued" });
charge(`pFree_${TODAY}`, { postId: "pFree", storeId: "s1", jstDate: TODAY, status: "accrued" });            // 課金対象外
charge(`pZero_${TODAY}`, { postId: "p1", storeId: "s1", jstDate: `${M0}-01`, status: "accrued", validCvCount: 0 }); // 有効CVなし
charge(`pAmt_${TODAY}`, { postId: "p2", storeId: "s1", jstDate: `${M0}-02`, status: "accrued", amountJpy: 500 });   // 金額が違う
charge(`pOtherPost_${TODAY}`, { postId: "pOther", storeId: "s1", jstDate: TODAY, status: "accrued" });     // 投稿は他店
// 請求書がある月(closed)の未請求の行は見込みに入れない
charge(`p1_${M1}-20`, { postId: "p1", storeId: "s1", jstDate: `${M1}-20`, status: "accrued" });

const snapshotAll = () => JSON.stringify([...S.docs.entries()].sort());

try {
  // ---------------- auth ----------------
  setEnv(TRIAL);
  const before = snapshotAll(); const w0 = S.writes.length;
  const a0 = await call(Q("s1"));
  const a1 = await call(Q("s1"), "anon");
  const a2 = await call(Q("s1"), "unverified");
  const a3 = await call(Q("s1"), "editor");
  const a4 = await call(Q("s1"), "other");
  const a5 = await call(Q("s1", { token: "legacy-token-xyz" }));
  const a6 = await call(Q("legacy", { token: "legacy-token-xyz" }));
  const a7 = await call({ mode: "storeBillingInvoices" }, "owner");
  const a8 = await call(Q("s1"), "admin");
  t("A1 未ログインは401", a0.code === 401 && a0.body.success === false, a0);
  t("A2 匿名ログインは拒否（401/403）", [401, 403].includes(a1.code) && !a1.body.invoices, a1);
  t("A3 メール未確認は403 email_not_verified", a2.code === 403 && a2.body.reason === "email_not_verified", a2);
  t("A4 editor は拒否（owner以外）・請求データなし", [403, 404].includes(a3.code) && !a3.body.invoices && !a3.body.estimate, a3);
  t("A5 他店のownerが s1 を指定しても拒否", [403, 404].includes(a4.code) && !a4.body.invoices, a4);
  t("A6 旧方式の店舗token（ログインなし）は拒否", a5.code === 401 && a6.code === 401 && !a5.body.invoices && !a6.body.invoices, [a5, a6]);
  t("A7 店舗IDなしは400", a7.code === 400 && a7.body.reason === "invalid_input", a7);
  t("A8 運営アカウントでも店舗のownerでなければ拒否", [401, 403, 404].includes(a8.code) && !a8.body.invoices, a8);

  // ---------------- owner, trial env ----------------
  const r = await call(Q("s1"), "owner");
  const b = r.body || {};
  t("B1 owner：200・available true・no-store", r.code === 200 && b.success === true && b.available === true && r.headers["Cache-Control"] === "no-store", { code: r.code, b });
  t("B2 直近12か月（当月を含む）だけ・新しい順", Array.isArray(b.months) && b.months.length === 12 && b.months[0] === M0 && b.months[11] === M11 && b.invoices.map((i) => i.month).join() === [M1, M2, M3, M4, M5, M6, M11].join(), { months: b.months, inv: b.invoices && b.invoices.map((i) => i.month) });
  t("B3 13か月前・他店・IDの形が違う請求書は含めない", !b.invoices.some((i) => i.month === M12) && !b.invoices.some((i) => i.amountJpy === 99999) && b.invoices.filter((i) => i.month === M1).length === 1, b.invoices);
  const byMonth = Object.fromEntries(b.invoices.map((i) => [i.month, i]));
  t("C1 状態：closed → 確定済み・カードへのご請求前", byMonth[M1].statusKey === "confirmed_unbilled" && byMonth[M1].amountJpy === 200 && byMonth[M1].lineCount === 2 && /^\d{4}-\d{2}-\d{2}T/.test(byMonth[M1].closedAt) && byMonth[M1].paidAt === null, byMonth[M1]);
  t("C2 状態：paid → お支払い済み・支払日あり", byMonth[M2].statusKey === "paid" && /^\d{4}-\d{2}-\d{2}T/.test(byMonth[M2].paidAt), byMonth[M2]);
  t("C3 状態：payment_failed → payment_failed", byMonth[M3].statusKey === "payment_failed" && byMonth[M3].paidAt === null, byMonth[M3]);
  t("C4 状態：requires_action → requires_action", byMonth[M4].statusKey === "requires_action", byMonth[M4]);
  t("C5 状態：closing → 集計処理中・金額と明細は出さない", byMonth[M5].statusKey === "aggregating" && byMonth[M5].amountJpy === null && byMonth[M5].lineCount === null && byMonth[M5].lines.length === 0 && byMonth[M5].closedAt === null, byMonth[M5]);
  t("C6 状態：needs_review → 確認中、結果不明の charging → 確認中", byMonth[M6].statusKey === "under_review" && byMonth[M11].statusKey === "under_review", [byMonth[M6], byMonth[M11]]);
  t("C7 状態の対応表（単体）：charging/processing → processing、charge_error・未知 → under_review", SB.mapStoreInvoiceStatus({ status: "charging" }) === "processing" && SB.mapStoreInvoiceStatus({ status: "processing" }) === "processing" && SB.mapStoreInvoiceStatus({ status: "charge_error" }) === "under_review" && SB.mapStoreInvoiceStatus({ status: "something_new" }) === "under_review" && SB.mapStoreInvoiceStatus({ status: "paid", chargeOutcomeUnknown: true }) === "paid");
  t("D1 明細：日付と見出しだけ（他店の請求書の明細は入らない）", JSON.stringify(byMonth[M1].lines) === JSON.stringify([{ date: `${M1}-03`, headline: "ランチ半額" }, { date: `${M1}-04`, headline: XSS }]) && byMonth[M2].lines.length === 1, byMonth[M1].lines);
  t("E1 見込み：当月の課金対象の未請求2件・200円（課金対象外・有効CVなし・金額違い・他店の投稿・請求書がある月は除外）", b.estimate && b.estimate.lineCount === 2 && b.estimate.amountJpy === 200 && b.estimate.months.length === 1 && b.estimate.months[0].month === M0 && b.estimate.months[0].amountJpy === 200, b.estimate);
  t("E2 見込みと確定は別の項目（請求書の金額に見込みを足していない）", byMonth[M1].amountJpy === 200 && b.invoices.every((i) => !("estimate" in i)) && b.dailyChargeAmountJpy === 100, { m1: byMonth[M1], est: b.estimate });

  const text = JSON.stringify(b);
  const leaks = ["pi_", "cus_", "pm_", "idem", "lease", "run-FAKE", "adm1", "card_declined", "insufficient_funds", "raw-error", "s1_", "s2_", "p1", "pOther", "他店の見出し", "chargeHistory", "invoiceId", "postId", "storeId", "status\""].filter((k) => text.includes(k));
  t("F1 内部情報を返さない（Stripe ID・冪等キー・lease・実行者・エラー原文・請求書ID・投稿ID・店舗ID）", leaks.length === 0, leaks);
  const allowedTop = ["success", "available", "months", "dailyChargeAmountJpy", "invoices", "estimate"];
  const allowedInvoice = ["month", "statusKey", "amountJpy", "lineCount", "closedAt", "paidAt", "lines", "linesTruncated"];
  t("F2 返す項目は許可リストだけ", Object.keys(b).every((k) => allowedTop.includes(k)) && b.invoices.every((i) => Object.keys(i).every((k) => allowedInvoice.includes(k)) && i.lines.every((l) => Object.keys(l).join() === "date,headline")), Object.keys(b));
  t("G1 読み取り専用：Firestoreへの書き込みゼロ・データは変わらない・通信なし", S.writes.length === w0 && snapshotAll() === before && network === 0, { writes: S.writes.slice(w0) });

  // ---------------- empty ----------------
  const e = await call(Q("s3"), "emptyOwner");
  t("H1 請求書なし：invoices 空・見込み0", e.code === 200 && e.body.available === true && e.body.invoices.length === 0 && e.body.estimate.lineCount === 0 && e.body.estimate.amountJpy === 0 && e.body.estimate.months.length === 0, e.body);

  // ---------------- Production / other envs: hidden and refused ----------------
  for (const [label, env] of [["課金開始前のProduction", { ...TRIAL, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }], ["ほかのPreviewブランチ", { ...TRIAL, VERCEL_GIT_COMMIT_REF: "preview/region-profiles-freeze" }], ["Preview専用の鍵が本番を指す", { ...TRIAL, FIREBASE_SERVICE_ACCOUNT_KEY_PREVIEW: sa("chikashoku-app") }], ["環境変数なし（ローカル）", {}]]) {
    setEnv(env);
    globalThis.__QUERY_FAIL = "imadakeMonthlyInvoices"; // 読もうとしたら500になる(読まないことの確認)
    const p = await call(Q("s1"), "owner");
    globalThis.__QUERY_FAIL = "imadakePostDailyCharges";
    const p2 = await call(Q("s1"), "owner");
    globalThis.__QUERY_FAIL = null;
    const u = await call(Q("s1"), "editor");
    t("P " + label + "：available false だけ・請求書と台帳を読まない・editorは拒否のまま", p.code === 200 && p2.code === 200 && JSON.stringify(p.body) === JSON.stringify({ success: true, available: false }) && [403, 404].includes(u.code), { p: p.body, p2: p2.body, u: u.code });
  }
  t("P5 公開条件（単体）：Preview試験の判定は Preview・対象ブランチ・machinau-preview だけ true", FT.isPreviewStoreInvoiceHistoryEnabled(TRIAL) === true && FT.isPreviewStoreInvoiceHistoryEnabled({ ...TRIAL, VERCEL_ENV: "production" }) === false && FT.isPreviewStoreInvoiceHistoryEnabled({}) === false);
  t("P6 公開条件（単体）：deps の判定が無い・true以外なら公開しない（安全側）", SB.isStoreInvoiceHistoryAvailable({}) === false && SB.isStoreInvoiceHistoryAvailable({ isStoreInvoiceHistoryAvailable: () => "yes" }) === false && SB.isStoreInvoiceHistoryAvailable(null) === false && SB.isStoreInvoiceHistoryAvailable({ isStoreInvoiceHistoryAvailable: () => true }) === true);
  const sbSrc = (await import("node:fs")).readFileSync(new URL(REPO_URL + "/api/_lib/store-billing.js"), "utf8");
  t("P7 store-billing.js は課金開始フラグ・Preview試験の判定を直接参照しない（既存の取り外し処理への影響なし）", !/IMADAKE_CV_BILLING_STARTED|isPreviewCvBillingTrialEnabled|isPreviewStoreInvoiceHistoryEnabled/.test(sbSrc));

  // ---------------- read failure ----------------
  setEnv(TRIAL);
  globalThis.__QUERY_FAIL = "imadakeMonthlyInvoices";
  const f = await call(Q("s1"), "owner");
  globalThis.__QUERY_FAIL = null;
  t("Q1 読み取り失敗は500 server_error（エラーの原文を返さない）", f.code === 500 && JSON.stringify(f.body) === JSON.stringify({ success: false, reason: "server_error" }), f.body);

  // ---------------- 12 months (unit, fixed clock, year boundary) ----------------
  const keys = SB.computeStoreInvoiceHistoryMonths(Date.parse("2026-01-01T00:30:00+09:00"), 12);
  t("R1 12か月の計算（日本時間・年をまたぐ）：2026-01 から 2025-02 まで", keys.length === 12 && keys[0] === "2026-01" && keys[1] === "2025-12" && keys[11] === "2025-02", keys);
  const keysUtcEdge = SB.computeStoreInvoiceHistoryMonths(Date.parse("2026-10-31T15:30:00Z"), 12);
  t("R2 UTCでは10月でも日本時間で11月なら11月から数える", keysUtcEdge[0] === "2026-11", keysUtcEdge[0]);

  // ---------------- same basis as the store CV report ----------------
  S.docs.set("imadakePosts/pU1", { storeId: "s4", headline: "課金対象", cvBillingEnabled: true, status: "published", publishedAt: Timestamp.fromMillis(Date.now() - 3600000), expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
  S.docs.set("imadakePosts/pU2", { storeId: "s4", headline: "無料", cvBillingEnabled: false, status: "published", publishedAt: Timestamp.fromMillis(Date.now() - 3600000), expiresAt: Timestamp.fromMillis(Date.now() + 3600000) });
  for (const [id, post, n] of [["v1", "pU1", 1], ["v2", "pU1", 2], ["v3", "pU2", 1]]) S.docs.set("imadakeCvViews/" + id, { postId: post, jstDate: TODAY, counted: true, storeId: "s4", n });
  charge(`pU1_${TODAY}`, { postId: "pU1", storeId: "s4", jstDate: TODAY, status: "accrued", validCvCount: 2 });
  const u4 = await call(Q("s4"), "unifyOwner");
  const report = await RP.buildImadakeStoreCvReport(getFirestore(), "s4", Date.now(), {});
  const billableRef = report.posts.filter((p) => p.postId === "pU1").reduce((s, p) => s + p.referenceAmountJpy, 0);
  t("U1 見込みは成果レポートの料金目安と同じ基準（有効CVのある投稿×日＝100円）：課金対象の投稿で一致", u4.code === 200 && u4.body.estimate.amountJpy === billableRef && billableRef === 100 && u4.body.estimate.amountJpy === u4.body.dailyChargeAmountJpy * u4.body.estimate.lineCount, { est: u4.body.estimate, billableRef });
  t("U2 課金対象外の投稿は見込みに入れない（成果レポートの料金目安には含まれる：差は課金対象外の分だけ）", report.totals.referenceAmountJpy === 200 && u4.body.estimate.amountJpy === 100, { reportTotal: report.totals.referenceAmountJpy });

  // ---------------- flags ----------------
  t("Z1 課金関連3フラグは false のまま", IM.IMADAKE_CV_BILLING_STARTED === false && MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && CH.IMADAKE_MONTHLY_CHARGE_ENABLED === false);
  t("Z2 通信なし（Stripeなし）", network === 0, network);
} finally {
  setEnv({});
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
