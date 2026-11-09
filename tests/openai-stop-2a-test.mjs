// OpenAI API安全対策 STEP 2-A(2026-11-10)。画面から使っていない AI の mode(aiConciergeChat・aiConcierge・socialPatrol)を
// サーバーで止める。認証(匿名・通常・運営・なし)や本文の中身に関係なく 403、OpenAI の呼び出し0回・Firestore の書き込み0回、
// 応答に秘密の値を含まない。ほかの AI の mode(翻訳・今日の地域情報・この街の情報)と投稿の審査の経路は止めない。
// REAL moderate-submission handler on mocked firebase-admin. OpenAI は模擬(実際の API は呼ばない)。
// run: node --import ./tests/mockfa-occ/register.mjs tests/openai-stop-2a-test.mjs
import { REPO_URL } from "./_paths.mjs";
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake"; process.env.ADMIN_EMAIL = "admin@example.com";
const FAKE_KEY = "sk-" + "fake-openai-key-for-tests-0123456789";
process.env.OPENAI_API_KEY = FAKE_KEY;
globalThis.__MOCK_TOKENS = {
  anon: { uid: "anon1", firebase: { sign_in_provider: "anonymous" } },
  user: { uid: "u1", email: "user@example.com", email_verified: true, firebase: { sign_in_provider: "password" } },
  admin: { uid: "a1", email: "admin@example.com", email_verified: true, firebase: { sign_in_provider: "password" } }
};
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const realFetch = globalThis.fetch;
const calls = { openai: 0, openaiUrls: [], other: 0 };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  if (u.hostname === "api.openai.com") {
    calls.openai++; calls.openaiUrls.push(u.pathname);
    if (u.pathname === "/v1/moderations") {
      const input = JSON.parse(String(opts.body || "{}")).input; const n = Array.isArray(input) ? input.length : 1;
      return { ok: true, status: 200, json: async () => ({ results: Array.from({ length: n }, () => ({ flagged: false, categories: {}, category_scores: {} })) }) };
    }
    return { ok: false, status: 500, json: async () => ({ error: { message: "mocked" } }), text: async () => "mocked" };
  }
  calls.other++;
  return { ok: false, status: 500, json: async () => ({}), text: async () => "" };
};
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 500) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error, w = console.warn, l = console.log; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };
const post = (body, token) => quiet(async () => { const r = res(); await handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...(token ? { authorization: "Bearer " + token } : {}) }, body, query: {} }, r); return r; });

try {
  const STOPPED = ["aiConciergeChat", "aiConcierge", "socialPatrol"];
  const bodies = {
    aiConciergeChat: { message: "今どこがおすすめ？", history: [], language: "ja", latitude: 26.21, longitude: 127.68 },
    aiConcierge: { language: "ja", currentTime: "12:00", candidates: [] },
    socialPatrol: { prefecture: "沖縄県", municipality: "那覇市", targetArea: "那覇市", includeDebugSources: true }
  };
  for (const mode of STOPPED) {
    for (const token of ["anon", "user", "admin", null]) {
      const before = { openai: calls.openai, writes: S.writes.length, docs: S.docs.size };
      const r = await post({ mode, ...bodies[mode] }, token);
      const text = JSON.stringify(r.body);
      t(`1 ${mode} (${token || "no token"})：403 ai_feature_stopped`, r.code === 403 && r.body && r.body.success === false && r.body.reason === "ai_feature_stopped", { code: r.code, body: r.body });
      t(`2 ${mode} (${token || "no token"})：OpenAI 0回・Firestore の書き込み0回`, calls.openai === before.openai && S.writes.length === before.writes && S.docs.size === before.docs, { calls: calls.openai - before.openai, writes: S.writes.slice(before.writes) });
      t(`3 ${mode} (${token || "no token"})：応答に鍵・内部の情報なし`, !text.includes(FAKE_KEY) && !/sk-|OPENAI|apiKey|stack/i.test(text), text);
    }
  }
  // 本文の中身で回避できない(余計な項目・管理者のふり・大文字小文字の違いは別 mode＝止まるか、どこにも届かない)
  const tricky = [
    { mode: "aiConciergeChat", bypass: true, admin: true, enabled: true, debug: true },
    { mode: "socialPatrol", forceRefresh: true, includeDebugSources: true }
  ];
  for (const b of tricky) {
    const before = calls.openai;
    const r = await post(b, "anon");
    t(`4 ${b.mode}：余計な項目でも 403`, r.code === 403 && r.body.reason === "ai_feature_stopped" && calls.openai === before, r.body);
  }
  for (const m of ["AICONCIERGECHAT", "aiconcierge", " socialPatrol"]) {
    const before = calls.openai;
    const r = await post({ mode: m, message: "x" }, "anon");
    t(`5 mode "${m}"：OpenAI に届かない`, calls.openai === before, { code: r.code, body: r.body });
  }

  // ---- 6. ほかの AI の mode は止めない(このファイルの停止の対象外＝handler まで届く)
  for (const [mode, body] of [
    ["shopTranslationGet", { firestoreIds: ["L1"], language: "en" }],
    ["regionTodayInfoGet", { language: "ja", latitude: 26.21, longitude: 127.68, countryCode: "JP", regionKey: "JP-47-201", regionName: "那覇市", municipality: "那覇市" }],
    ["cityInfoGet", { prefecture: "沖縄県", municipality: "那覇市", targetArea: "那覇市", language: "ja" }],
    ["columnArticleTranslationGet", { firestoreIds: ["c1"], language: "en" }],
    ["storeProfileTranslationGet", { storeIds: ["sp_S1"], language: "en" }]
  ]) {
    const r = await post({ mode, ...body }, "anon");
    t(`6 ${mode}：止めない(ai_feature_stopped ではない)`, !(r.body && r.body.reason === "ai_feature_stopped") && r.code !== 403, { code: r.code, body: r.body });
  }
  // 投稿の審査(omni-moderation)の経路も止めない：掲示板の投稿は審査(OpenAI moderations)まで進む
  const beforeMod = calls.openaiUrls.filter((p) => p === "/v1/moderations").length;
  const boardR = await post({ mode: "communityBoardPostCreate", text: "今日はいい天気です。", googlePlaceId: "ChIJx", countryCode: "JP", regionName: "那覇市" }, "anon");
  const afterMod = calls.openaiUrls.filter((p) => p === "/v1/moderations").length;
  t("7 投稿の処理(審査の経路)は止めない", !(boardR.body && boardR.body.reason === "ai_feature_stopped") && boardR.code !== 403, { code: boardR.code, body: boardR.body, moderationCalls: afterMod - beforeMod });

  // ---- 8. コード：処理は残す・一覧は3つだけ・場所は OpenAI の前
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL(REPO_URL + "/api/moderate-submission.js"), "utf8");
  const list = (src.match(/const STOPPED_AI_MODES = Object\.freeze\(\[([\s\S]*?)\]\)/) || [])[1] || "";
  t("8a 停止の一覧は3つだけ", JSON.stringify(list.match(/"[A-Za-z]+"/g)) === JSON.stringify(['"aiConciergeChat"', '"aiConcierge"', '"socialPatrol"']), list);
  t("8b 処理の関数は残す(再開できる)", ["handleAiConciergeChatRequest", "handleAiConciergeRequest", "handleSocialPatrolRequest", "callOpenAiConciergeChat", "callOpenAiSocialPatrol"].every((f) => new RegExp("async function " + f + "\\(").test(src)), "");
  const stopAt = src.indexOf("STOPPED_AI_MODES.includes(requestBody.mode)");
  const firstRoute = src.indexOf('requestBody.mode === "cloudinarySignature"');
  t("8c 停止の確認は、ほかの POST の振り分けより前", stopAt > 0 && stopAt < firstRoute, { stopAt, firstRoute });
} catch (error) {
  t("unexpected", false, String(error && error.stack || error));
} finally {
  console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
