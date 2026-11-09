// SEO改善 STEP 2(代表承認・Preview まで)。
// S. 読み物一覧のページ(/column-list.html → renderColumnList)：公開中の記事だけ・公開日の新しい順・題名・リンク・公開日を
//    最初の HTML に入れる、title・description・canonical・OGP・構造化データ、下書きを出さない、sitemap との一致、
//    公開の取得の上限(200件を超えても落ちない)、記事を読めない時の従来のページ。
// B. ブラウザ：JavaScript なしで記事の一覧が読める・JavaScript ありで従来どおり(絞り込み・英語)。
// T. TOP：canonical・description・横長の OGP 画像・WebSite／Organization の構造化データ。
// REAL moderate-submission handler on mocked firebase-admin.
// run: node --import ./tests/mockfa-occ/register.mjs tests/seo-2-test.mjs
import { REPO_ROOT, REPO_URL } from "./_paths.mjs";
import http from "node:http";
import fs from "node:fs";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const PORT = 8991;
const ORIGIN = "http://127.0.0.1:" + PORT;
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake";
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const realFetch = globalThis.fetch;
let network = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  network++; throw new Error("unexpected network " + url);
};
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const get = (query) => quiet(async () => { const r = res(); await handler({ method: "GET", headers: {}, query }, r); return r; });

// ---- fixtures：公開3件(公開日がばらばら)・下書き1件・題名に HTML を含む公開1件
const day = (d) => Timestamp.fromMillis(Date.UTC(2026, 9, d, 3, 0, 0));
const art = (title, extra) => ({ title, description: title + "の紹介文です。", content: "本文", category: "街を歩く", imageUrl: "https://res.cloudinary.com/cdhyctnp/image/upload/v1/col/a.jpg", status: "published", publishedAt: day(1), updatedAt: day(1), ...extra });
S.docs.set("columnArticles/aOld", art("古い記事", { publishedAt: day(2) }));
S.docs.set("columnArticles/bNew", art("新しい記事", { publishedAt: day(20), category: "食べる・飲む" }));
S.docs.set("columnArticles/cMid", art("真ん中の記事", { publishedAt: day(10), imageUrl: "" }));
S.docs.set("columnArticles/dDraft", art("下書きの記事", { status: "draft", publishedAt: day(25) }));
S.docs.set("columnArticles/eXss", art("</script><b>題名</b>", { publishedAt: day(5) }));

try {
  // ---- S. サーバー
  let r = await get({ mode: "renderColumnList" });
  const html = String(r.body || "");
  const cards = [...html.matchAll(/<a class="card article-card" data-ssr-article href="column\/([^"]+)\.html">/g)].map((m) => m[1]);
  const listApiCache = (await get({ mode: "publicListPublishedColumns" })).headers["Cache-Control"];
  t("S1 200・HTML・一覧の API と同じキャッシュ", r.code === 200 && /text\/html/.test(r.headers["Content-Type"]) && r.headers["Cache-Control"] === listApiCache && /stale-while-revalidate/.test(listApiCache), [r.headers, listApiCache]);
  t("S2 公開中の記事だけ・公開日の新しい順(下書きなし)", JSON.stringify(cards) === JSON.stringify(["bNew", "cMid", "eXss", "aOld"]), cards);
  t("S3 カードに題名・紹介文・公開日・カテゴリー", /<p class="article-card-title">新しい記事<\/p>/.test(html) && /新しい記事の紹介文です。/.test(html) && /<p class="article-card-date">2026年10月20日<\/p>/.test(html) && /<span class="article-card-category">食べる・飲む<\/span>/.test(html), "");
  t("S4 画像は最適化の URL・画像の無い記事は img なし", /src="https:\/\/res\.cloudinary\.com\/cdhyctnp\/image\/upload\/f_auto,q_auto,c_limit,w_600\/v1\/col\/a\.jpg"/.test(html) && !/href="column\/cMid\.html"><img/.test(html), "");
  t("S5 題名の HTML はエスケープ(</script> で閉じない)", html.includes("&lt;/script&gt;&lt;b&gt;題名&lt;/b&gt;") && !html.includes("<b>題名</b>"), "");
  t("S6 下書きの題名・ID はどこにも出ない", !html.includes("下書きの記事") && !html.includes("dDraft"), "");
  const head = html.slice(0, html.indexOf("</head>"));
  t("S7 title・description・canonical", /<title>\s*マチナウ読み物 一覧｜マチナウ\s*<\/title>/.test(head) && /name="description"\s+content="マチナウ読み物の一覧です。/.test(head) && /rel="canonical"\s+href="https:\/\/machinau\.jp\/column-list\.html"/.test(head), "");
  t("S8 OGP(横長の画像・大きいカード)", ['og:type" content="website', 'og:title" content="マチナウ読み物 一覧｜マチナウ', 'og:url" content="https://machinau.jp/column-list.html', 'og:image" content="https://machinau.jp/machinau-hero-bg.png', 'og:image:width" content="2035', 'twitter:card" content="summary_large_image'].every((x) => head.includes(x)), "");
  const ld = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let ldJson = null; try { ldJson = JSON.parse(ld[1]); } catch (e) {}
  t("S9 構造化データ CollectionPage＋ItemList(順番・URL・名前)", ldJson && ldJson["@type"] === "CollectionPage" && ldJson.mainEntity.numberOfItems === 4 && ldJson.mainEntity.itemListElement[0].url === "https://machinau.jp/column/bNew.html" && ldJson.mainEntity.itemListElement[0].position === 1, ldJson);
  t("S10 構造化データの中の < は \\u003c(本文が script を閉じない)", ld && !ld[1].includes("</script") && ld[1].includes("\\u003c/script"), ld && ld[1].slice(0, 200));
  t("S11 ページのスクリプト・絞り込みは従来どおり含まれる", html.includes('id="filterMonthInput"') && html.includes("function renderArticleCard") && html.includes('data-ssr-article') && html.includes("hasServerCards"), "");
  // sitemap と一致
  r = await get({ mode: "renderSitemap" });
  const smCols = [...String(r.body).matchAll(/<loc>https:\/\/machinau\.jp\/column\/([^<]+)\.html<\/loc>/g)].map((m) => m[1]).sort();
  t("S12 sitemap の記事＝一覧のページの記事(下書きなし)", JSON.stringify(smCols) === JSON.stringify(cards.slice().sort()) && String(r.body).includes("<loc>https://machinau.jp/column-list.html</loc>"), { smCols, cards });
  // 記事を読めない時
  globalThis.__QUERY_FAIL = "columnArticles";
  r = await get({ mode: "renderColumnList" });
  globalThis.__QUERY_FAIL = null;
  t("S13 記事を読めない時：200・従来の「読み込んでいます…」・短いキャッシュ・カードなし", r.code === 200 && String(r.body).includes("読み込んでいます…") && !String(r.body).includes("data-ssr-article href") && /s-maxage=60/.test(r.headers["Cache-Control"]) && !String(r.body).includes("application/ld+json"), r.headers);
  // 公開の取得の上限：230件でも一覧のページ・一覧の API・sitemap から落ちない
  for (let i = 0; i < 226; i++) S.docs.set("columnArticles/bulk" + String(i).padStart(3, "0"), art("まとめて" + i, { publishedAt: day(1) }));
  r = await get({ mode: "renderColumnList" });
  const many = (String(r.body).match(/data-ssr-article href/g) || []).length;
  const apiR = await get({ mode: "publicListPublishedColumns" });
  const smR = await get({ mode: "renderSitemap" });
  const smMany = (String(smR.body).match(/<loc>https:\/\/machinau\.jp\/column\//g) || []).length;
  t("S14 230件：一覧のページ・一覧の API・sitemap とも全件(200件で切れない)", many === 230 && apiR.body.articles.length === 230 && smMany === 230, { many, api: apiR.body.articles.length, smMany });
  const apiOrder = apiR.body.articles.slice(0, 3).map((a) => a.slug);
  t("S15 一覧の API も公開日の新しい順", JSON.stringify(apiOrder) === JSON.stringify(["bNew", "cMid", "eXss"]), apiOrder);
  for (const k of [...S.docs.keys()]) if (k.startsWith("columnArticles/bulk")) S.docs.delete(k);
  t("S16 書き込み・外部への通信なし", S.writes.length === 0 && network === 0, { writes: S.writes, network });

  // ---- 静的ファイル・設定
  const vercel = JSON.parse(fs.readFileSync(REPO_ROOT + "/vercel.json", "utf8"));
  t("F1 vercel.json：/column-list.html → renderColumnList、記事の URL の書き換えは従来どおり", vercel.rewrites.some((x) => x.source === "/column-list.html" && x.destination === "/api/moderate-submission?mode=renderColumnList") && vercel.rewrites.some((x) => x.source === "/column/:slug.html"), vercel.rewrites);
  t("F2 静的な column-list.html は無い(あると書き換えより先に配信される)", !fs.existsSync(REPO_ROOT + "/column-list.html"), "");

  // ---- T. TOP
  const top = fs.readFileSync(REPO_ROOT + "/index.html", "utf8").replace(/\s+/g, " ");
  const topHead = top.slice(0, top.indexOf("</head>"));
  t("T1 canonical は https://machinau.jp/", /<link rel="canonical" href="https:\/\/machinau\.jp\/" >/.test(topHead), "");
  t("T2 description・og:description は今のマチナウ(旧文言なし)", (topHead.match(/街の「今」がわかる旅の案内所。今いる場所の近くで楽しめるお店・観光・体験/g) || []).length === 3 && !/タイムセール|リアルタイム観光コンシェルジュです/.test(topHead), "");
  t("T3 og:image は横長の写真(正方形のロゴではない)", /property="og:image" content="https:\/\/machinau\.jp\/machinau-hero-bg\.png"/.test(topHead) && /og:image:width" content="2035"/.test(topHead) && !/og:image" content="https:\/\/machinau\.jp\/icon-512/.test(topHead), "");
  const topLd = topHead.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  let g = null; try { g = JSON.parse(topLd[1]); } catch (e) {}
  t("T4 WebSite・Organization の構造化データ", g && g["@graph"].some((x) => x["@type"] === "WebSite" && x.url === "https://machinau.jp/") && g["@graph"].some((x) => x["@type"] === "Organization" && x.logo && x.logo.url === "https://machinau.jp/icon-512.png"), g);
  const png = fs.readFileSync(REPO_ROOT + "/machinau-hero-bg.png");
  t("T5 OGP 画像の大きさ＝実際のファイル(2035×773)", png.readUInt32BE(16) === 2035 && png.readUInt32BE(20) === 773, "");

  // ---- B. ブラウザ
  const staticServer = await serve(REPO_ROOT + "", PORT + 1);
  const server = http.createServer(async (req, rs) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/column-list.html") {
      const r2 = await get({ mode: "renderColumnList" });
      rs.writeHead(r2.code, { "Content-Type": "text/html; charset=utf-8" }); rs.end(String(r2.body)); return;
    }
    const up = await realFetch("http://127.0.0.1:" + (PORT + 1) + req.url);
    rs.writeHead(up.status, { "Content-Type": up.headers.get("content-type") || "application/octet-stream" });
    rs.end(Buffer.from(await up.arrayBuffer()));
  });
  await new Promise((rr) => server.listen(PORT, "127.0.0.1", rr));
  const api = async (url, method) => {
    const u = new URL(url, ORIGIN);
    if (u.pathname !== "/api/moderate-submission" || method !== "GET") return null;
    const r2 = await get(Object.fromEntries(u.searchParams.entries()));
    // 英語の題名は保存済みの訳(一覧の API の translations)を使う。訳の保存の形は別の試験で確かめるため、ここでは応答に足す。
    if (r2.body && Array.isArray(r2.body.articles)) r2.body.articles.forEach((a) => { if (a.slug === "bNew") a.translations = { en: { title: "A new article", description: "About the new article." } }; });
    return { status: r2.code, body: r2.body };
  };
  const browser = await launchChrome();
  try {
    // JavaScript なし
    const p = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api } });
    await p.s("Emulation.setScriptExecutionDisabled", { value: true });
    await p.goto("/column-list.html"); await sleep(1500);
    const v = await p.ev(`({ links: [...document.querySelectorAll("#articleList a.article-card")].map((a) => a.getAttribute("href")), titles: [...document.querySelectorAll("#articleList .article-card-title")].map((e) => e.textContent), loading: /読み込んでいます/.test(document.getElementById("articleList").textContent) })`);
    t("B1 JavaScript なし：記事の一覧(リンク・題名)が読める", JSON.stringify(v.links) === JSON.stringify(["column/bNew.html", "column/cMid.html", "column/eXss.html", "column/aOld.html"]) && v.titles[0] === "新しい記事" && !v.loading, v);
    await p.close();
    // JavaScript あり(日本語)
    const q = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api } });
    await q.goto("/column-list.html"); await sleep(2500);
    const j = await q.ev(`({ cards: document.querySelectorAll("#articleList a.article-card").length, ssrLeft: document.querySelectorAll("#articleList [data-ssr-article]").length, first: (document.querySelector("#articleList .article-card-title")||{}).textContent, months: [...document.getElementById("filterMonthInput").options].map((o) => o.textContent) })`);
    t("B2 JavaScript あり：同じ4件をスクリプトが描き直す(重複なし)・掲載年月の選択肢", j.cards === 4 && j.ssrLeft === 0 && j.first === "新しい記事" && j.months.join("|") === "すべて|2026年10月", j);
    await q.ev(`(() => { const s = document.getElementById("filterCategoryInput"); s.value = "食べる・飲む"; s.dispatchEvent(new Event("change")); return true; })()`); await sleep(300);
    t("B3 絞り込み(カテゴリー)は従来どおり", (await q.ev(`[...document.querySelectorAll("#articleList .article-card-title")].map((e) => e.textContent).join()`)) === "新しい記事", "");
    t("B4 画面のエラーなし", q.log.errors.length === 0, q.log.errors);
    await q.close();
    // 英語(端末の設定)
    const e = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock: api, initScripts: [`try{ if (!sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage","en"); } }catch(e){}`] } });
    await e.goto("/column-list.html"); await sleep(2500);
    const en = await e.ev(`({ lang: document.documentElement.lang, h1: document.querySelector("h1").textContent.trim(), first: document.querySelector("#articleList .article-card-title").textContent, href: document.querySelector("#articleList a.article-card").getAttribute("href") })`);
    t("B5 英語：固定の文言・保存済みの英語の題名・記事は ?lang=en", en.lang === "en" && en.h1 === "Find an article" && en.first === "A new article" && en.href === "column/bNew.html?lang=en", en);
    await e.close();
  } finally {
    browser.close(); server.close(); staticServer.close();
  }
} catch (error) {
  t("unexpected", false, String(error && error.stack || error));
} finally {
  console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
