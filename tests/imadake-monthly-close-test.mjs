// STEP 32-B: imadake month-end close (per store × month invoice amount). REAL api/_lib/imadake-monthly-close.js and the
// REAL moderate-submission handler on mocked firebase-admin with optimistic-concurrency transactions. No network, no Stripe.
// run: node --import ./tests/mockfa-occ/register.mjs tests/imadake-monthly-close-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const pw = (uid, email) => ({ uid, email, email_verified: true, firebase: { sign_in_provider: "password" } });
globalThis.__MOCK_TOKENS = { admin: pw("adm1", "admin@example.com"), user: pw("u1", "owner@example.com") };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
let stripeCalls = 0;
globalThis.fetch = async (url) => { stripeCalls++; throw new Error("unexpected network " + url); };

const MC = await import(REPO_URL + "/api/_lib/imadake-monthly-close.js?v=" + Date.now());
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());
const IM = await import(REPO_URL + "/api/_lib/imadake.js");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 700) : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = (await import("firebase-admin/firestore")).getFirestore();
const jst = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh - 9, mm);
const charge = (postId, storeId, jstDate, extra = {}) => S.docs.set("imadakePostDailyCharges/" + postId + "_" + jstDate, { postId, storeId, jstDate, validCvCount: 1, amountJpy: 100, currency: "JPY", status: "accrued", ...extra });
const post = (id, storeId, billable = true) => S.docs.set("imadakePosts/" + id, { storeId, cvBillingEnabled: billable, status: "published" });
const inv = (storeId, month) => S.docs.get("imadakeMonthlyInvoices/" + storeId + "_" + month);
const chargesOf = (pred) => [...S.docs.entries()].filter(([k, v]) => k.startsWith("imadakePostDailyCharges/") && pred(v));
const snapshotOf = (prefixes) => JSON.stringify([...S.docs.entries()].filter(([k]) => prefixes.some((p) => k.startsWith(p))).sort());
let ip = 0;
async function call(body, token) {
  const r = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {}, send(b) { this.body = b; return this; }, end() { return this; } };
  const e = console.error; console.error = () => {};
  try { await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100." + (++ip % 250), ...(token ? { authorization: "Bearer " + token } : {}) }, body: { mode: "imadakeMonthlyClose", ...body }, query: {} }, r); } finally { console.error = e; }
  return r;
}

// ---- seed: 2026-11 ----
S.docs.set("storeAccounts/s1", { storeName: "店1", enabled: true }); S.docs.set("storeAccounts/s2", { storeName: "店2", enabled: true }); S.docs.set("storeAccounts/s3", { storeName: "テスト店", enabled: true, isTestAccount: true });
post("p1", "s1"); post("p2", "s1"); post("p3", "s2"); post("p4", "s3"); post("p5", "s1", false); post("p6", "s1");
charge("p1", "s1", "2026-11-01"); charge("p1", "s1", "2026-11-02"); charge("p1", "s1", "2026-11-30");
charge("p2", "s1", "2026-11-15", { validCvCount: 3 });           // 3 CVs on one day = still 100 yen
charge("p2", "s1", "2026-10-31"); charge("p2", "s1", "2026-11-01"); // post spanning months: only Nov counted
charge("p1", "s1", "2026-12-01");                                  // next month: not read
charge("p3", "s2", "2026-11-10");
charge("p4", "s3", "2026-11-05");                                  // test store
charge("p5", "s1", "2026-11-06");                                  // post not billable
charge("p6", "s2", "2026-11-07");                                  // charge store != post store
charge("p7", "s1", "2026-11-08");                                  // post missing
charge("p2", "s1", "2026-11-20", { amountJpy: 200 });              // wrong amount
charge("p3", "s2", "2026-11-21", { validCvCount: 0 });             // no valid CV
S.docs.set("imadakePostDailyCharges/p3_2026-11-22", { postId: "p3", storeId: "s2", jstDate: "2026-11-23", validCvCount: 1, amountJpy: 100, currency: "JPY", status: "accrued" }); // id/date mismatch
charge("p3", "s2", "2026-11-24", { status: "void" });              // unexpected status

// M1 period helpers
const r12 = MC.computeImadakeMonthRange("2026-12");
t("M1 期間：2026-12 は [2026-12-01, 2027-01-01)、不正な月は null", r12.startKey === "2026-12-01" && r12.endKeyExclusive === "2027-01-01" && r12.nextMonth === "2027-01" && MC.computeImadakeMonthRange("2026-13") === null && MC.computeImadakeMonthRange("26-11") === null, r12);
t("M1b 締めの可否は日本時間：12/1 23:59 JSTは不可、12/2 0:00 JSTから可（UTCでは12/1 15:00）", MC.isImadakeMonthClosable("2026-11", jst(2026, 12, 1, 23, 59)) === false && MC.isImadakeMonthClosable("2026-11", jst(2026, 12, 2, 0, 0)) === true && MC.isImadakeMonthClosable("2026-11", jst(2026, 11, 30, 12)) === false);

// M2 dry-run
const writesBefore = S.writes.length;
const dry = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 5) });
const s1 = dry.stores.find((x) => x.storeId === "s1"), s2 = dry.stores.find((x) => x.storeId === "s2");
t("M2 試算：店1は5件500円（同日3CVでも100円・月またぎは11月分だけ）、店2は1件100円、合計600円（税込）", dry.ok && dry.dryRun === true && s1.expectedLineCount === 5 && s1.expectedAmountJpy === 500 && s2.expectedLineCount === 1 && s2.expectedAmountJpy === 100 && dry.totals.expectedAmountJpy === 600 && dry.totals.storeCount === 2 && dry.taxIncluded === true, dry);
const ex = dry.excluded;
t("M2b 請求対象外を理由ごとに除外（テスト店舗・課金対象外・店舗不一致・投稿なし・金額不正・CV0・ID不整合・想定外の状態）", ["test_account", "post_not_billable", "store_mismatch", "post_missing", "invalid_amount", "no_valid_cv", "invalid_charge_id", "unexpected_status"].every((k) => ex[k] && ex[k].count === 1) && !dry.stores.some((x) => x.storeId === "s3"), ex);
t("M2c 試算は書き込みゼロ・Stripe呼び出しゼロ", S.writes.length === writesBefore && stripeCalls === 0, { writes: S.writes.length - writesBefore });

// M3 handler
const h0 = await call({ month: "2026-11" }, null), h1 = await call({ month: "2026-11" }, "user"), h2 = await call({ month: "2026-11" }, "admin"), h3 = await call({ month: "2026-11", dryRun: false }, "admin"), h4 = await call({ month: "2026/11" }, "admin");
t("M3 API：未ログイン401・運営以外403・運営の試算200（既定はdryRun）・締めの実行は現在403（close_writes_disabled）・不正な月400", h0.code === 401 && h1.code === 403 && h2.code === 200 && h2.body.dryRun === true && h2.body.totals.expectedAmountJpy === 600 && h3.code === 403 && h3.body.reason === "close_writes_disabled" && h4.code === 400, [h0.code, h1.code, h2.code, h3.code, h3.body, h4.code]);
t("M3b 書き込みの許可は無効のまま（IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED=false）・課金開始フラグもfalse・API経由でも書き込みゼロ", MC.IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === false && IM.IMADAKE_CV_BILLING_STARTED === false && S.writes.length === writesBefore);

// M4 month not closable yet
const early = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 1, 18), dryRun: false, allowWrite: true });
t("M4 翌月2日（日本時間）より前の締めは拒否（month_not_closable）・書き込みなし", early.ok === false && early.reason === "month_not_closable" && S.writes.length === writesBefore, early);
const noAllow = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 5), dryRun: false });
t("M4b 書き込み許可なしの締めは拒否（close_writes_disabled）", noAllow.ok === false && noAllow.reason === "close_writes_disabled" && S.writes.length === writesBefore);

// M5 close
const excludedBefore = snapshotOf(["imadakePostDailyCharges/p4_", "imadakePostDailyCharges/p5_", "imadakePostDailyCharges/p6_", "imadakePostDailyCharges/p7_", "imadakePostDailyCharges/p2_2026-11-20", "imadakePostDailyCharges/p3_2026-11-2", "imadakePostDailyCharges/p2_2026-10-31", "imadakePostDailyCharges/p1_2026-12-01"]);
const run1 = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 2), dryRun: false, allowWrite: true, actorUid: "adm1" });
const i1 = inv("s1", "2026-11"), i2 = inv("s2", "2026-11");
t("M5 締め：店1の請求書 closed 5件500円（税込）、店2 closed 1件100円、テスト店舗・0円の店舗の請求書は作らない", run1.ok && i1 && i1.status === "closed" && i1.lineCount === 5 && i1.amountJpy === 500 && i1.taxIncluded === true && i2.status === "closed" && i2.lineCount === 1 && i2.amountJpy === 100 && !inv("s3", "2026-11") && i1.closedByUid === "adm1", { i1, i2, run1: run1.stores });
const marked = chargesOf((v) => v.invoiceId === "s1_2026-11");
t("M5b 請求に入れた台帳だけ invoiced＋invoiceId（店1の5件）、対象外・他月の台帳は一切変更なし", marked.length === 5 && marked.every(([, v]) => v.status === "invoiced") && snapshotOf(["imadakePostDailyCharges/p4_", "imadakePostDailyCharges/p5_", "imadakePostDailyCharges/p6_", "imadakePostDailyCharges/p7_", "imadakePostDailyCharges/p2_2026-11-20", "imadakePostDailyCharges/p3_2026-11-2", "imadakePostDailyCharges/p2_2026-10-31", "imadakePostDailyCharges/p1_2026-12-01"]) === excludedBefore, marked.map(([k]) => k));
const touched = [...new Set(S.writes.slice(writesBefore).map((w) => w.split("/")[0]))].sort();
t("M5c 書き込み先は imadakePostDailyCharges と imadakeMonthlyInvoices だけ・Stripe呼び出しゼロ", JSON.stringify(touched) === JSON.stringify(["imadakeMonthlyInvoices", "imadakePostDailyCharges"]) && stripeCalls === 0, touched);

// M6 rerun = no double counting
const afterRun1 = snapshotOf(["imadakeMonthlyInvoices/", "imadakePostDailyCharges/"]);
const run2 = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 3), dryRun: false, allowWrite: true });
const dry2 = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 3) });
t("M6 同じ月の再実行：追加0件・請求額は変わらない（二重計上なし）", run2.ok && run2.stores.every((x) => x.addedLines === 0 && x.outcome === "already_closed") && inv("s1", "2026-11").amountJpy === 500 && inv("s2", "2026-11").amountJpy === 100 && dry2.stores.find((x) => x.storeId === "s1").expectedAmountJpy === 500 && dry2.stores.find((x) => x.storeId === "s1").pendingLines === 0, run2.stores);
const stripVolatile = (s) => s.replace(/"updatedAt":\{"ms":\d+\}/g, "").replace(/"closeRunId":"[^"]*"/g, "");
t("M6b 再実行で台帳・請求書の内容は変わらない", stripVolatile(snapshotOf(["imadakeMonthlyInvoices/", "imadakePostDailyCharges/"])) === stripVolatile(afterRun1));

// M7 late charge after closed
charge("p1", "s1", "2026-11-29");
const run3 = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 4), dryRun: false, allowWrite: true });
const st3 = run3.stores.find((x) => x.storeId === "s1");
t("M7 確定後に見つかった未請求の台帳：確定済みの請求書は書き換えず late_charges として報告（台帳は accrued のまま）", st3.outcome === "late_charges" && st3.lateChargeCount === 1 && inv("s1", "2026-11").amountJpy === 500 && S.docs.get("imadakePostDailyCharges/p1_2026-11-29").status === "accrued", st3);

// M8 invoice past "closed" is never touched
S.docs.set("imadakeMonthlyInvoices/s2_2026-11", { ...inv("s2", "2026-11"), status: "charging" });
charge("p3", "s2", "2026-11-28");
const run4 = await MC.runImadakeMonthlyClose(db, { month: "2026-11", nowMillis: jst(2026, 12, 4), dryRun: false, allowWrite: true });
t("M8 締め後の状態（例：請求中）に進んだ請求書には触れない（invoice_locked、台帳もaccruedのまま）", run4.stores.find((x) => x.storeId === "s2").outcome === "invoice_locked" && inv("s2", "2026-11").status === "charging" && inv("s2", "2026-11").amountJpy === 100 && S.docs.get("imadakePostDailyCharges/p3_2026-11-28").status === "accrued", run4.stores);

// M9 many charges + interruption mid-way + resume (pagination > 300, chunks of 200)
for (let i = 0; i < 15; i++) post("q" + i, "s1");
for (let i = 0; i < 15; i++) for (let d = 1; d <= 30; d++) charge("q" + i, "s1", "2027-01-" + String(d).padStart(2, "0"));
const dryBig = await MC.runImadakeMonthlyClose(db, { month: "2027-01", nowMillis: jst(2027, 2, 2) });
t("M9 450件（300件ずつの読み取りをまたぐ）を正しく数える：450件・45,000円", dryBig.stores[0].expectedLineCount === 450 && dryBig.stores[0].expectedAmountJpy === 45000 && dryBig.totals.chargeDocsRead === 450, dryBig.totals);
let txCount = 0;
globalThis.__TX_HOOK = async (pending) => { txCount++; if (txCount === 3) { globalThis.__TX_HOOK = null; throw new Error("DEADLINE_EXCEEDED (simulated crash)"); } };
let crashed = null;
try { await MC.runImadakeMonthlyClose(db, { month: "2027-01", nowMillis: jst(2027, 2, 2), dryRun: false, allowWrite: true }); } catch (e) { crashed = e.message; }
globalThis.__TX_HOOK = null;
const midInv = inv("s1", "2027-01");
t("M9b 途中で失敗：請求書は closing のまま、加えた分（1回目の200件）と台帳の印は一致", crashed && midInv.status === "closing" && midInv.lineCount === 200 && midInv.amountJpy === 20000 && chargesOf((v) => v.invoiceId === "s1_2027-01").length === 200, { crashed, midInv });
const resume = await MC.runImadakeMonthlyClose(db, { month: "2027-01", nowMillis: jst(2027, 2, 3), dryRun: false, allowWrite: true });
const finInv = inv("s1", "2027-01");
t("M9c 再実行で残り250件だけを加えて確定：closed 450件・45,000円、全台帳が1回だけinvoiced", resume.stores[0].addedLines === 250 && finInv.status === "closed" && finInv.lineCount === 450 && finInv.amountJpy === 45000 && chargesOf((v) => v.invoiceId === "s1_2027-01" && v.status === "invoiced").length === 450 && chargesOf((v) => v.jstDate && v.jstDate.startsWith("2027-01") && v.status === "accrued").length === 0, { added: resume.stores[0].addedLines, finInv });

// M10 concurrent runs
for (let i = 0; i < 10; i++) post("c" + i, "s2");
for (let i = 0; i < 10; i++) for (let d = 1; d <= 25; d++) charge("c" + i, "s2", "2027-03-" + String(d).padStart(2, "0"));
globalThis.__TX_HOOK = async () => { await sleep(2); };
const retriesBefore = S.txStats.retries;
const both = await Promise.all([1, 2, 3].map(() => MC.runImadakeMonthlyClose(db, { month: "2027-03", nowMillis: jst(2027, 4, 2), dryRun: false, allowWrite: true })));
globalThis.__TX_HOOK = null;
const cInv = inv("s2", "2027-03");
const addedSum = both.reduce((s, r) => s + r.stores[0].addedLines, 0);
t("M10 3つの締めを同時に実行：請求書は1件・closed 250件・25,000円、追加の合計も250件（二重計上なし）", both.every((r) => r.ok) && cInv.status === "closed" && cInv.lineCount === 250 && cInv.amountJpy === 25000 && addedSum === 250 && chargesOf((v) => v.invoiceId === "s2_2027-03").length === 250, { addedSum, cInv, retries: S.txStats.retries - retriesBefore });

// M10b deterministic race: another worker marks 40 lines after this run has classified them as pending
for (let i = 0; i < 4; i++) post("r" + i, "s1");
for (let i = 0; i < 4; i++) for (let d = 1; d <= 25; d++) charge("r" + i, "s1", "2027-05-" + String(d).padStart(2, "0"));
S.docs.set("imadakeMonthlyInvoices/s1_2027-05", { storeId: "s1", month: "2027-05", status: "closing", lineCount: 0, amountJpy: 0, currency: "JPY", taxIncluded: true });
let raced = false;
globalThis.__TX_HOOK = async () => {
  if (raced) return; raced = true;
  const ids = [...S.docs.keys()].filter((k) => k.startsWith("imadakePostDailyCharges/r0_2027-05") || k.startsWith("imadakePostDailyCharges/r1_2027-05")).slice(0, 40);
  for (const k of ids) S.docs.set(k, { ...S.docs.get(k), status: "invoiced", invoiceId: "s1_2027-05" });
  S.docs.set("imadakeMonthlyInvoices/s1_2027-05", { ...S.docs.get("imadakeMonthlyInvoices/s1_2027-05"), lineCount: 40, amountJpy: 4000 });
};
const raceRun = await MC.runImadakeMonthlyClose(db, { month: "2027-05", nowMillis: jst(2027, 6, 2), dryRun: false, allowWrite: true });
globalThis.__TX_HOOK = null;
const rInv = inv("s1", "2027-05");
t("M10b 分類の後に別の処理が40件を先に請求へ入れても、トランザクション内で確かめ直して残り60件だけ加える（100件・10,000円）", raceRun.stores[0].addedLines === 60 && rInv.status === "closed" && rInv.lineCount === 100 && rInv.amountJpy === 10000, { added: raceRun.stores[0].addedLines, rInv });

// M11 dry-run detects an inconsistent invoice
S.docs.set("imadakeMonthlyInvoices/s2_2027-03", { ...cInv, lineCount: 249 });
const dryBad = await MC.runImadakeMonthlyClose(db, { month: "2027-03", nowMillis: jst(2027, 4, 5) });
t("M11 試算で、請求書の件数と請求済み台帳の件数の食い違いを知らせる（invoiceMismatch）", dryBad.stores[0].invoiceMismatch === true, dryBad.stores[0]);
const rerunBad = await MC.runImadakeMonthlyClose(db, { month: "2027-03", nowMillis: jst(2027, 4, 5), dryRun: false, allowWrite: true });
t("M11b 確定済みの請求書は再実行でも書き換えない（食い違いは人が確認）", inv("s2", "2027-03").lineCount === 249 && rerunBad.stores[0].addedLines === 0);

// M12 empty month
const empty = await MC.runImadakeMonthlyClose(db, { month: "2026-08", nowMillis: jst(2026, 9, 5), dryRun: false, allowWrite: true });
t("M12 台帳が無い月：店舗0・0円・請求書を作らない", empty.ok && empty.stores.length === 0 && empty.totals.expectedAmountJpy === 0 && ![...S.docs.keys()].some((k) => k.startsWith("imadakeMonthlyInvoices/") && k.endsWith("_2026-08")));
// ===== STEP 32-B safety fixes =====
const commitCounter = (n, fn) => { let c = 0; globalThis.__TX_HOOK = async () => { c++; if (c === n) { globalThis.__TX_HOOK = null; await fn(); } }; };
// N1 an unbilled line appears after the first read (during ②): verification blocks the close, a rerun closes correctly
post("n1", "s1"); charge("n1", "s1", "2027-06-01"); charge("n1", "s1", "2027-06-02");
commitCounter(2, async () => { charge("n1", "s1", "2027-06-03"); });   // after ① and the first ② chunk
const n1a = await MC.runImadakeMonthlyClose(db, { month: "2027-06", nowMillis: jst(2027, 7, 2), dryRun: false, allowWrite: true });
const n1Inv = inv("s1", "2027-06");
t("N1 確定直前に未請求の台帳が見つかる：closed にせず close_blocked（pending_lines_remaining・残り1件）、請求書は closing・2件のまま", n1a.stores[0].outcome === "close_blocked" && n1a.stores[0].blockReasons.includes("pending_lines_remaining") && n1a.stores[0].pendingLines === 1 && n1Inv.status === "closing" && n1Inv.lineCount === 2, { st: n1a.stores[0], n1Inv });
const n1b = await MC.runImadakeMonthlyClose(db, { month: "2027-06", nowMillis: jst(2027, 7, 3), dryRun: false, allowWrite: true });
t("N1b 再実行で残りの1件を加えて確定：closed 3件・300円", n1b.stores[0].outcome === "closed" && inv("s1", "2027-06").status === "closed" && inv("s1", "2027-06").lineCount === 3 && inv("s1", "2027-06").amountJpy === 300, n1b.stores[0]);

// N2 another worker adds a line between the verification read and the close transaction
post("n2", "s2"); charge("n2", "s2", "2027-07-01");
commitCounter(3, async () => {                                   // 3rd commit = the close transaction (① , ②, ③)
  S.docs.set("imadakePostDailyCharges/n2_2027-07-09", { postId: "n2", storeId: "s2", jstDate: "2027-07-09", validCvCount: 1, amountJpy: 100, currency: "JPY", status: "invoiced", invoiceId: "s2_2027-07" });
  await db.collection("imadakeMonthlyInvoices").doc("s2_2027-07").set({ lineCount: 2, amountJpy: 200 }, { merge: true });
});
const n2a = await MC.runImadakeMonthlyClose(db, { month: "2027-07", nowMillis: jst(2027, 8, 2), dryRun: false, allowWrite: true });
t("N2 確認の後・確定の直前に別の処理が台帳を加えた：トランザクション内で件数の変化を検知し close_blocked（changed_after_verification）、closing のまま", n2a.stores[0].outcome === "close_blocked" && (n2a.stores[0].blockReasons || []).includes("changed_after_verification") && inv("s2", "2027-07").status === "closing" && inv("s2", "2027-07").lineCount === 2, { st: n2a.stores[0], inv: inv("s2", "2027-07") });
const n2b = await MC.runImadakeMonthlyClose(db, { month: "2027-07", nowMillis: jst(2027, 8, 3), dryRun: false, allowWrite: true });
t("N2b 再実行で件数一致を確かめて確定：closed 2件・200円", n2b.stores[0].outcome === "closed" && inv("s2", "2027-07").status === "closed" && inv("s2", "2027-07").lineCount === 2, n2b.stores[0]);

// N3 a "closing" invoice left behind with 0 lines (e.g. the store became a test store after ①)
S.docs.set("storeAccounts/s9", { storeName: "店9", enabled: true });
S.docs.set("imadakeMonthlyInvoices/s9_2027-08", { storeId: "s9", month: "2027-08", status: "closing", lineCount: 0, amountJpy: 0, currency: "JPY", taxIncluded: true });
const s9Before = JSON.stringify(inv("s9", "2027-08"));
const n3d = await MC.runImadakeMonthlyClose(db, { month: "2027-08", nowMillis: jst(2027, 9, 5) });
const n3w = await MC.runImadakeMonthlyClose(db, { month: "2027-08", nowMillis: jst(2027, 9, 5), dryRun: false, allowWrite: true });
t("N3 0件・0円で取り残された closing の請求書を試算・実行の両方で報告（staleEmptyClosing）、確定も削除も変更もしない", n3d.stores.length === 1 && n3d.stores[0].staleEmptyClosing === true && n3w.stores[0].outcome === "close_blocked" && n3w.stores[0].blockReasons.includes("empty_invoice") && JSON.stringify(inv("s9", "2027-08")) === s9Before && n3d.totals.attentionCount === 1, { d: n3d.stores, w: n3w.stores });

// N4 count mismatch on a closing invoice (invoice says 3, only 2 lines carry its invoiceId)
post("n4", "s1");
for (const d of ["2027-09-01", "2027-09-02"]) charge("n4", "s1", d, { status: "invoiced", invoiceId: "s1_2027-09" });
S.docs.set("imadakeMonthlyInvoices/s1_2027-09", { storeId: "s1", month: "2027-09", status: "closing", lineCount: 3, amountJpy: 300, currency: "JPY", taxIncluded: true });
const n4Before = JSON.stringify(inv("s1", "2027-09"));
const n4 = await MC.runImadakeMonthlyClose(db, { month: "2027-09", nowMillis: jst(2027, 10, 2), dryRun: false, allowWrite: true });
t("N4 請求書の件数（3）と請求済み台帳（2）が合わない：確定を止めて line_count_mismatch を報告、請求書は変更しない", n4.stores[0].outcome === "close_blocked" && n4.stores[0].blockReasons.includes("line_count_mismatch") && n4.stores[0].invoiceMismatch === true && JSON.stringify(inv("s1", "2027-09")) === n4Before, n4.stores[0]);

// N5 lines already on a closing invoice whose store became a test store
S.docs.set("storeAccounts/s8", { storeName: "店8", enabled: true }); post("n5", "s8");
for (const d of ["2027-10-01", "2027-10-02"]) charge("n5", "s8", d, { status: "invoiced", invoiceId: "s8_2027-10" });
S.docs.set("imadakeMonthlyInvoices/s8_2027-10", { storeId: "s8", month: "2027-10", status: "closing", lineCount: 2, amountJpy: 200, currency: "JPY", taxIncluded: true });
S.docs.set("storeAccounts/s8", { storeName: "店8", enabled: true, isTestAccount: true });
const n5 = await MC.runImadakeMonthlyClose(db, { month: "2027-10", nowMillis: jst(2027, 11, 2), dryRun: false, allowWrite: true });
t("N5 請求書に入れた後で請求対象外になった台帳（テスト店舗化）：件数不一致とは別に検知し、確定を止める（invoiced_lines_now_ineligible）", n5.stores[0].outcome === "close_blocked" && n5.stores[0].blockReasons.includes("invoiced_lines_now_ineligible") && n5.stores[0].invoicedLines === 2 && n5.stores[0].invoiceMismatch === false && inv("s8", "2027-10").status === "closing", n5.stores[0]);

t("M13 全体を通してStripe（外部通信）の呼び出しはゼロ", stripeCalls === 0);

console.log("tx commits=" + S.txStats.commits + " retries=" + S.txStats.retries);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
