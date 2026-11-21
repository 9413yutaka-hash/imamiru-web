// 無料掲載への形態タグ付与(2026-11-22)の検証。
// 運営の作成・編集・読み出しで businessFormCodes が許可値だけ保存され、
// 公開一覧の許可リストにも入っていることを確認する。
// run: node --import ./tests/mockfa-occ/register.mjs tests/free-listing-business-form-test.mjs
import { REPO_URL } from "./_paths.mjs";

process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}";
process.env.ADMIN_EMAIL = "admin@example.com";
process.env.OPENAI_API_KEY = "test-key";
process.env.RATE_LIMIT_HMAC_SECRET = "fake";

globalThis.__MOCK_TOKENS = {
  "t-admin": { uid: "admin1", email: "admin@example.com", email_verified: true, firebase: { sign_in_provider: "password" } }
};
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname === "api.openai.com") {
    const input = JSON.parse(String(opts.body || "{}")).input;
    const n = Array.isArray(input) ? input.length : 1;
    return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
  }
  throw new Error("unexpected network " + url);
};

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + JSON.stringify(detail).slice(0, 400)}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const AUTH = { authorization: "Bearer t-admin" };

const { Timestamp } = await import("firebase-admin/firestore");
if (typeof Timestamp.fromDate !== "function") {
  Timestamp.fromDate = (d) => Timestamp.fromMillis(d.getTime());
}

const { default: adminPost } = await import(REPO_URL + "/api/admin-post.js?v=" + Date.now());
const { default: adminUpdate } = await import(REPO_URL + "/api/admin-submission-update.js?v=" + Date.now());
const { default: adminGet } = await import(REPO_URL + "/api/admin-submission-get.js?v=" + Date.now());

const baseBody = {
  title: "キッチンカーのテスト出店",
  category: "グルメ",
  content: "移動販売のテスト店舗です。",
  address: "沖縄県那覇市久茂地1-1",
  latitude: 26.2141,
  longitude: 127.6802,
  imageUrls: [],
  websiteUrl: "",
  area: "那覇市",
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  takeout: true,
  paymentMethods: ["cash", "bogus"]
};

function findSubmissionByTitle(title) {
  for (const [key, value] of S.docs.entries()) {
    if (key.startsWith("submissions/") && value && value.title === title) return { id: key.split("/")[1], data: value };
  }
  return null;
}

// 1. 作成: 許可値だけが保存される
{
  const r = res();
  await quiet(() => adminPost({ method: "POST", headers: AUTH, body: { ...baseBody, businessFormCodes: ["mobile_vendor", "bogus_code", "event_booth"] } }, r));
  const found = findSubmissionByTitle(baseBody.title);
  t("作成が成功する", r.code === 200 && found !== null, { code: r.code, body: r.body });
  t("形態は許可値だけ保存される", found && JSON.stringify(found.data.businessFormCodes) === JSON.stringify(["mobile_vendor", "event_booth"]), found && found.data.businessFormCodes);
  t("支払い方法の既存の絞り込みは不変", found && JSON.stringify(found.data.paymentMethods) === JSON.stringify(["cash"]), found && found.data.paymentMethods);
}

// 2. 作成: 未指定なら空配列
{
  const title2 = "形態なしのテスト店";
  const r = res();
  await quiet(() => adminPost({ method: "POST", headers: AUTH, body: { ...baseBody, title: title2 } }, r));
  const found = findSubmissionByTitle(title2);
  t("形態なしの作成も成功し空配列", r.code === 200 && found && Array.isArray(found.data.businessFormCodes) && found.data.businessFormCodes.length === 0, { code: r.code, found: found && found.data.businessFormCodes });
}

// 3. 編集: 形態を差し替えられる + 読み出しで復元できる
{
  const target = findSubmissionByTitle(baseBody.title);
  const r = res();
  await quiet(() => adminUpdate({ method: "POST", headers: AUTH, body: { ...baseBody, documentId: target.id, businessFormCodes: ["street_spot", "nope"] } }, r));
  const after = findSubmissionByTitle(baseBody.title);
  t("編集で形態が差し替わる", r.code === 200 && after && JSON.stringify(after.data.businessFormCodes) === JSON.stringify(["street_spot"]), { code: r.code, body: r.body, codes: after && after.data.businessFormCodes });

  const g = res();
  await quiet(() => adminGet({ method: "GET", headers: AUTH, query: { id: target.id } }, g));
  const sub = g.body && (g.body.submission || g.body.data || g.body);
  t("編集用の読み出しに形態が含まれる", g.code === 200 && sub && JSON.stringify(sub.businessFormCodes) === JSON.stringify(["street_spot"]), { code: g.code, body: g.body });
}

// 4. 公開側の配線(ソース確認): 許可リストと表示側の取り込み
{
  const fs = await import("node:fs");
  const ms = fs.readFileSync(new URL("../api/moderate-submission.js", import.meta.url), "utf8");
  const allowlist = ms.slice(ms.indexOf("PUBLIC_SUBMISSION_FIELD_ALLOWLIST"), ms.indexOf("PUBLIC_SUBMISSION_FIELD_ALLOWLIST") + 3000);
  t("公開一覧の許可リストに businessFormCodes がある", allowlist.includes("\"businessFormCodes\""), "");
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  t("app.js が掲載データから形態を取り込む", /businessFormCodes:\s*\n?\s*Array\.isArray\(\s*\n?\s*data\.businessFormCodes/.test(app), "");
  const ap = fs.readFileSync(new URL("../admin-post.html", import.meta.url), "utf8");
  t("投稿画面に形態の入力と送信がある", ap.includes("businessFormMobileVendor") && ap.includes("businessFormCodes: businessFormCodes"), "");
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
