// STEP 37-C: admin-billing.html month-end close panel (Preview trial). Real Firebase compat SDK signs in against a fake
// identitytoolkit; /api/moderate-submission is answered by a mock that records every request. The Preview Firebase target
// is simulated with an init script (window.machinauFirebaseTarget). No Firestore, no Stripe.
// run: node --import ./tests/mockfa/register.mjs tests/admin-billing-close-trial-ui-test.mjs
import { REPO_ROOT } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";

const ADMIN = "9413yutaka@gmail.com";
const ORIGIN = "http://127.0.0.1:8815";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const NOWS = Math.floor(Date.now() / 1000);
const tok = (email) => b64({ alg: "RS256" }) + "." + b64({ user_id: "a", sub: "a", email, exp: NOWS + 3600, iat: NOWS, aud: "chikashoku-app", iss: "https://securetoken.google.com/chikashoku-app", firebase: { sign_in_provider: "password" } }) + ".s";
let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };

const calls = [];
let closeDry = null, closeExec = null;
const DRY_OK = { success: true, month: "2026-10", period: { startKey: "2026-10-01", endKeyExclusive: "2026-11-01" }, dryRun: true, closable: true, writeAllowed: true, previewTrial: true, totals: { storeCount: 1, expectedLineCount: 1, expectedAmountJpy: 100, attentionCount: 0 }, stores: [{ storeId: "fcxQwDTJYBjUuUpqhjdH", expectedLineCount: 1, expectedAmountJpy: 100, invoiceStatus: "" }], excluded: {} };
const EXEC_OK = { ...DRY_OK, dryRun: false, stores: [{ ...DRY_OK.stores[0], outcome: "closed", invoiceStatus: "closed" }] };
async function api(url, method, log, postData) {
  if (method !== "POST") return null;
  const body = JSON.parse(postData || "{}"); calls.push(body);
  if (body.mode === "imadakeBillingOverview") return { status: 200, body: { success: true, items: [], errors: [], truncated: false, next: { invoicesDone: true, billingDone: true }, scanned: { invoices: 0, storeBilling: 0 }, thresholds: { closedUncharredWarnHours: 72, lockWarnHours: 24, closingWarnHours: 24 } } };
  if (body.mode === "imadakeMonthlyClose") return body.dryRun === false ? closeExec : closeDry;
  return { status: 500, body: { success: false } };
}
const authMock = async (url) => {
  if (url.includes("signInWithPassword")) return { body: { localId: "a", email: ADMIN, idToken: tok(ADMIN), refreshToken: "r", expiresIn: "3600", registered: true } };
  if (url.includes("lookup")) return { body: { users: [{ localId: "a", email: ADMIN, emailVerified: true, providerUserInfo: [{ providerId: "password", email: ADMIN }] }] } };
  return { body: { id_token: tok(ADMIN), refresh_token: "r", expires_in: "3600" } };
};
// firebase.js がトップレベルで const machinauFirebaseTarget を宣言するため、変更できない(non-configurable)プロパティは使えない。
// 書き込みを無視する読み取り専用のアクセサ(configurable)で、ブラウザの接続先を Preview専用Firebase として見せる。
const PREVIEW_TARGET = `(() => { const v = { ok: true, source: "server_preview", projectId: "machinau-preview", reason: "" }; Object.defineProperty(window, "machinauFirebaseTarget", { configurable: true, get: () => v, set: () => {} }); })();`;
const CONFIRM = (answer) => `window.__confirms = []; window.confirm = function(m) { window.__confirms.push(String(m)); return ${answer}; };`;

const server = await serve(REPO_ROOT, 8815);
const browser = await launchChrome();
async function open(initScripts) {
  const p = await openPage(browser, { origin: ORIGIN, width: 1280, state: { apiPassthrough: true, apiMock: api, authMock, initScripts } });
  await p.goto("/admin-billing.html");
  await p.waitFor("document.readyState === 'complete'");
  await sleep(500);
  await p.ev(`(() => { document.getElementById("adminEmail").value = ${JSON.stringify(ADMIN)}; document.getElementById("adminPassword").value = "x"; document.getElementById("loginButton").click(); return true; })()`);
  await p.waitFor(`document.getElementById("adminArea").classList.contains("visible")`, 15000);
  await sleep(500);
  return p;
}
const closeCalls = () => calls.filter((c) => c.mode === "imadakeMonthlyClose");
const state = (p) => p.ev(`({ panel: !document.getElementById("closeTrialPanel").hidden, confirmBox: !document.getElementById("closeConfirmBox").hidden, execDisabled: document.getElementById("closeExecuteButton").disabled, result: document.getElementById("closeTrialResult").textContent, confirms: window.__confirms || [] })`);
async function dryRun(p) { await p.ev(`document.getElementById("closeDryRunButton").click()`); await p.waitFor(`!document.getElementById("closeDryRunButton").disabled && !document.getElementById("closeTrialResult").hidden`, 10000); }

try {
  // P1 production host
  let p = await open([]);
  let st = await state(p);
  t("P1 本番の接続先（本番のドメイン）では月末締めの欄を表示しない", st.panel === false, st);
  await p.close();

  // P2-P5 preview target
  closeDry = { status: 200, body: DRY_OK }; closeExec = { status: 200, body: EXEC_OK };
  p = await open([PREVIEW_TARGET, CONFIRM("false")]);
  st = await state(p);
  t("P2 Preview専用Firebaseの接続先では月末締めの欄を表示（ログイン直後は締めのAPIを呼ばない）", st.panel === true && closeCalls().length === 0, { st, calls: closeCalls() });
  await dryRun(p);
  st = await state(p);
  const dryCall = closeCalls()[0];
  t("P3 試算：送るのは month 2026-10 だけ（dryRun:false を送らない）・店舗1件・1件・100円を表示", dryCall && dryCall.month === "2026-10" && !("dryRun" in dryCall) && /店舗：1件・件数：1件・金額：100円/.test(st.result) && /試算の結果/.test(st.result), { dryCall, result: st.result });
  t("P4 確認の印を付けるまで実行ボタンは押せない", st.confirmBox === true && st.execDisabled === true, st);
  await p.ev(`(() => { const c = document.getElementById("closeConfirmCheck"); c.checked = true; c.dispatchEvent(new Event("change")); document.getElementById("closeExecuteButton").click(); return true; })()`);
  await sleep(600);
  st = await state(p);
  t("P5 確認の画面で「キャンセル」なら締めを送らない", st.confirms.length === 1 && /2026年10月分の月末締めを実行します/.test(st.confirms[0]) && /100円/.test(st.confirms[0]) && closeCalls().filter((c) => c.dryRun === false).length === 0, { confirms: st.confirms, calls: closeCalls() });
  await p.close();

  p = await open([PREVIEW_TARGET, CONFIRM("true")]);
  await dryRun(p);
  await p.ev(`(() => { const c = document.getElementById("closeConfirmCheck"); c.checked = true; c.dispatchEvent(new Event("change")); document.getElementById("closeExecuteButton").click(); return true; })()`);
  await p.waitFor(`/月末締めを実行しました/.test(document.getElementById("closeTrialResult").textContent) || /失敗|できません/.test(document.getElementById("closeTrialResult").textContent)`, 10000);
  st = await state(p);
  const execCalls = closeCalls().filter((c) => c.dryRun === false);
  t("P6 印と確認の後だけ、dryRun:false の締めを1回送り、結果（closed）を表示", execCalls.length === 1 && execCalls[0].month === "2026-10" && /月末締めを実行しました/.test(st.result) && /結果 closed/.test(st.result) && st.confirmBox === false, { execCalls, result: st.result });
  await p.close();

  // P7 server says writes not allowed
  closeDry = { status: 200, body: { ...DRY_OK, writeAllowed: false, previewTrial: false } };
  p = await open([PREVIEW_TARGET, CONFIRM("true")]); await dryRun(p); st = await state(p);
  t("P7 サーバーが書き込み不可（writeAllowed false）と返せば、実行の欄を出さない", st.confirmBox === false && /締めの実行：できない/.test(st.result), st);
  await p.close();

  // P8 not closable yet
  closeDry = { status: 200, body: { ...DRY_OK, closable: false } };
  p = await open([PREVIEW_TARGET, CONFIRM("true")]); await dryRun(p); st = await state(p);
  t("P8 まだ締められない（closable false）時は実行の欄を出さず、11月2日以降と表示", st.confirmBox === false && /2026年11月2日0時/.test(st.result), st);
  await p.close();

  // P9 server rejects execute (e.g. the page was modified in Production)
  closeDry = { status: 200, body: DRY_OK }; closeExec = { status: 403, body: { success: false, reason: "close_writes_disabled" } };
  p = await open([PREVIEW_TARGET, CONFIRM("true")]); await dryRun(p);
  await p.ev(`(() => { const c = document.getElementById("closeConfirmCheck"); c.checked = true; c.dispatchEvent(new Event("change")); document.getElementById("closeExecuteButton").click(); return true; })()`);
  await p.waitFor(`/サーバーが拒否/.test(document.getElementById("closeTrialResult").textContent)`, 10000);
  st = await state(p);
  t("P9 サーバーが拒否（403 close_writes_disabled）した時は、拒否を表示する", /この環境では締めを実行できません（サーバーが拒否）/.test(st.result), st.result);
  await p.close();

  // P10 HTML in response is shown as text
  closeDry = { status: 200, body: { ...DRY_OK, stores: [{ storeId: "<img src=x onerror=window.__xss=1>", expectedLineCount: 1, expectedAmountJpy: 100, invoiceStatus: "" }] } };
  p = await open([PREVIEW_TARGET, CONFIRM("false")]); await dryRun(p);
  const x = await p.ev(`({ flag: window.__xss || 0, imgs: document.querySelectorAll("#closeTrialResult img").length, text: document.getElementById("closeTrialResult").textContent })`);
  t("P10 応答の文字にHTMLが含まれても文字として表示し、実行しない", x.flag === 0 && x.imgs === 0 && x.text.includes("<img src=x onerror=window.__xss=1>"), x);
  await p.close();
} finally {
  browser.close();
  server.close();
}
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
