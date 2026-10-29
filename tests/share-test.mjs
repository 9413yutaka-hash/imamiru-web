// STEP 48: share button on the 今だけ投稿 detail, the free store detail and the 読みもの article, and what a shared link opens.
// REAL moderate-submission handler (submissions list, imadakePostGet, imadakeDetailOpen with the CV ledger, renderColumn)
// on mocked firebase-admin; publicStoreProfiles is a fixed answer. Headless Chrome with navigator.share / clipboard replaced.
// Every /api request is answered locally (nothing is sent to machinau.jp); any other network from node is an error.
// run: node --import ./tests/mockfa/register.mjs tests/share-test.mjs
import { REPO_ROOT, REPO_URL, SHOTS_DIR } from "./_paths.mjs";
import { serve, launchChrome, openPage, sleep } from "./lib.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import http from "node:http";

const PORT = 8712;
const ORIGIN = "http://127.0.0.1:" + PORT;
process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{}"; process.env.RATE_LIMIT_HMAC_SECRET = "fake";
const realFetch = globalThis.fetch;
const outsideNetwork = [];
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url));
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return realFetch(url, opts);
  outsideNetwork.push(String(url));
  throw new Error("unexpected network " + url);
};
globalThis.__MOCK_TOKENS = { "tok-A": { uid: "A", firebase: { sign_in_provider: "anonymous" } }, "tok-B": { uid: "B", firebase: { sign_in_provider: "anonymous" } }, "tok-C": { uid: "C", firebase: { sign_in_provider: "anonymous" } }, "tok-Z": { uid: "Z", firebase: { sign_in_provider: "anonymous" } } };
const S = globalThis.__MOCK_DB = { docs: new Map(), writes: [], failAddFor: null, seq: 0 };
const { Timestamp } = await import("firebase-admin/firestore");
const { default: handler } = await import(REPO_URL + "/api/moderate-submission.js?v=" + Date.now());

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok && d !== "" ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const res = () => ({ code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, send(b) { this.body = b; return this; }, end() { return this; } });
const quiet = async (fn) => { const e = console.error, l = console.log, w = console.warn; console.error = () => {}; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.log = l; console.warn = w; } };
async function get(query) { const r = res(); await quiet(() => handler({ method: "GET", headers: {}, query }, r)); return r; }
async function post(body, headers = {}) { const r = res(); await quiet(() => handler({ method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...headers }, body, query: {} }, r)); return r; }

// ---------- data ----------
const H = 3600e3, now0 = Date.now();
const LONG_BODY = "旅行者に知ってほしい今日だけの限定ランチです。" + "地元の野菜をたっぷり使っています。".repeat(6) + "最後まで読めるのは詳細だけ。";
const EXCERPT80 = Array.from(LONG_BODY.replace(/\s+/g, " ").trim()).slice(0, 80).join("") + "…";
const IMG = "https://res.cloudinary.com/cdhyctnp/image/upload/v1791695969/machinau_submissions/b6yoin9ypyv4pbfkvq8r.jpg";
function seedPost(id, o = {}) {
  S.docs.set("imadakePosts/" + id, { storeId: o.storeId || "S1", storeNameSnapshot: "那覇の食堂 " + id, categoryCode: "restaurant", headline: "今日だけの限定ランチ " + id, body: o.body || LONG_BODY, sourceLanguage: "ja", status: o.status || "published", publishedAt: Timestamp.fromMillis(now0 - H), expiresAt: Timestamp.fromMillis(o.expiresAt ?? now0 + 5 * H), latitude: 26.2, longitude: 127.6, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", address: "沖縄県那覇市松尾", regionKey: "jp-47-201", imageUrls: [IMG], actionTargets: { phone: "098-000-0000", websiteUrl: "https://example.com/" + id }, categoryFields: {}, liveState: null, availableUntil: "", priceText: "1,000円", paymentMethods: ["cash"], ...(o.billing ? { cvBillingEnabled: true } : {}) });
}
S.docs.set("storeAccounts/S1", { storeName: "那覇の食堂" });
seedPost("SH1"); seedPost("SHB", { billing: true });
// STEP 48-C｜課金対象の投稿は写真2枚・英語のカード訳(保存済み)あり
const IMG2 = "https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_submissions/second.jpg";
{ const IMX = await import(REPO_URL + "/api/_lib/imadake.js"); const shb = S.docs.get("imadakePosts/SHB"); shb.imageUrls = [IMG, IMG2]; shb.translations = { en: { card: { status: "ready", sourceHash: IMX.computeImadakeCardSourceHash(IMX.getImadakeCardSource(shb)), headline: "Today-only lunch SHB", excerpt: "A lunch you should know about today, with lots of local vegetables" } } }; } seedPost("EXP", { expiresAt: now0 - 1000 }); seedPost("HID", { status: "hidden" });
const at = Timestamp.fromMillis(now0 - 86400000);
const LISTING = { title: "本日のおすすめ", category: "グルメ", content: "地元の食材の定食。", address: "沖縄県那覇市牧志", latitude: 26.215, longitude: 127.688, status: "approved", isPermanentAd: true, authorType: "shopAd", paymentMethods: ["cash"], takeout: false, imageUrls: [IMG], createdAt: at, updatedAt: at };
S.docs.set("submissions/L1", { ...LISTING, shopName: "共有できる食堂" });
S.docs.set("submissions/L2", { ...LISTING, shopName: "引き継ぎ済みのカフェ（旧掲載）" });
S.docs.set("submissions/L3", { ...LISTING, shopName: "引き継ぎ先が非公開の店" });
S.docs.set("submissions/LT", { ...LISTING, shopName: "東京の食堂", address: "東京都千代田区", latitude: 35.68, longitude: 139.76 });
const STORE = { id: "sp_S9", storeName: "店主が管理するカフェ", categoryCode: "cafe_sweets", description: "店主が書いた紹介です。", photos: [], location: { latitude: 26.214, longitude: 127.687, formattedAddress: "日本、〒900-0013 沖縄県那覇市牧志", prefecture: "沖縄県", city: "那覇市" }, paymentMethodCodes: ["cash"], featureCodes: ["free_wifi"], linkedListingIds: ["L2"], websiteUrl: "https://example.com/cafe", publishedAt: new Date(now0 - 86400000).toISOString() };
const apiState = { profiles: { success: true, stores: [STORE], suppressedListingIds: ["L2", "L3"], claimedListingIds: ["L2", "L3"], listingClaimOpen: false }, imadakeGet500: false };
S.docs.set("columnArticles/share-test-article", { status: "published", title: "国際通りの朝ごはん", description: "朝の国際通りで食べられるお店の紹介。", content: "本文の一段落目です。\n\n本文の二段落目です。", category: "食べる・飲む", publishedAt: at, updatedAt: at });
S.docs.set("columnArticles/share-draft-article", { status: "draft", title: "下書きの記事", description: "x", content: "x", category: "食べる・飲む", publishedAt: at, updatedAt: at });
// STEP 48-B｜OGP用の実データ(サーバーのプレビューは Firestore の実際の値と公開条件で判定する)
const STORE_PHOTO = "https://res.cloudinary.com/cdhyctnp/image/upload/v1/machinau_store_profiles/S9/cafe.jpg";
const storeProfile = (description, o = {}) => ({ status: "published", categoryCode: "cafe_sweets", description, moderationStatus: "passed", moderatedText: description, photos: [{ url: STORE_PHOTO, moderationStatus: "passed", publicId: "machinau_store_profiles/S9/cafe" }], ...o });
const storeAccount = (name, o = {}) => ({ storeName: name, registrationStatus: "active", enabled: true, latitude: 26.214, longitude: 127.687, countryCode: "JP", prefecture: "沖縄県", city: "那覇市", locationFormattedAddress: "日本、〒900-0013 沖縄県那覇市牧志", ownerEmail: "owner-s9@example.com", ...o });
S.docs.set("storeProfiles/S9", storeProfile("店主が書いた紹介です。"));
S.docs.set("storeAccounts/S9", storeAccount("店主が管理するカフェ"));
S.docs.set("storeListingLinks/L2", { status: "active", storeId: "S9", claimId: "CLAIM-SECRET-1" });
S.docs.set("storeProfiles/SDRAFT", storeProfile("下書きの紹介", { status: "draft" }));
S.docs.set("storeAccounts/SDRAFT", storeAccount("下書きの店"));
S.docs.set("storeListingLinks/L3", { status: "active", storeId: "SDRAFT" });
S.docs.set("storeProfiles/SOFF", storeProfile("停止中の紹介"));
S.docs.set("storeAccounts/SOFF", storeAccount("停止中の店", { enabled: false }));
S.docs.set("submissions/LHID", { ...LISTING, shopName: "非公開にした掲載", status: "hidden" });
S.docs.set("submissions/UP1", { title: "旅行者の投稿", category: "グルメ", content: "一般の投稿です。", address: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, status: "approved", submissionType: "street", imageUrls: [IMG], shopName: "一般の投稿の店", createdAt: at, updatedAt: at, expiresAt: Timestamp.fromMillis(now0 + 5 * H) });
seedPost("XSS", { body: '本文 "><script>alert(1)</script> の続き' });
S.docs.get("imadakePosts/XSS").headline = '見出し"><script>alert(2)</script>';

// ---------- server-side checks ----------
const views = () => [...S.docs.keys()].filter((k) => k.startsWith("imadakeCvViews/")).length;
const charges = () => [...S.docs.keys()].filter((k) => k.startsWith("imadakePostDailyCharges/")).length;
const art = await get({ mode: "renderColumn", slug: "share-test-article" });
const artHtml = String(art.body || "");
const shareConfig = (html) => { const m = html.match(/const config = (\{"url":[^\n]*\});/); return m ? JSON.parse(m[1]) : null; };
const cfgJa = shareConfig(artHtml);
t("C1 記事（日本語）：保存の下にシェアのボタン（読み込み前は hidden、文言「🔗 シェア」）", art.code === 200 && /id="articleShareButton" class="article-share-button" type="button" hidden>🔗 シェア<\/button>/.test(artHtml) && artHtml.indexOf('id="articleShareButton"') > artHtml.indexOf('id="articleSaveButton"'), art.code);
t("C2 記事（日本語）：共有するURLは正式なURL https://machinau.jp/column/share-test-article.html だけ（canonical と同じ）", cfgJa && cfgJa.url === "https://machinau.jp/column/share-test-article.html" && artHtml.includes('<link rel="canonical" href="https://machinau.jp/column/share-test-article.html">') && cfgJa.title === "国際通りの朝ごはん", cfgJa);
const artEn = await get({ mode: "renderColumn", slug: "share-test-article", lang: "en" });
const artEnHtml = String(artEn.body || "");
const cfgEn = shareConfig(artEnHtml);
t("C3 記事（英語）：ボタン「🔗 Share」・共有するURLは英語版の正式なURL（?lang=en）・案内も英語", artEn.code === 200 && artEnHtml.includes(">🔗 Share</button>") && cfgEn && cfgEn.url === "https://machinau.jp/column/share-test-article.html?lang=en" && /^Link copied/.test(cfgEn.text.copied) && /^Couldn't copy/.test(cfgEn.text.copyFailed), cfgEn);
const draft = await get({ mode: "renderColumn", slug: "share-draft-article" });
t("C4 公開していない記事の共有リンク：今までどおり404（記事は見つかりません）・シェアのボタンなし", draft.code === 404 && !String(draft.body).includes("articleShareButton") && /見つかりませんでした/.test(String(draft.body)), draft.code);
t("C5 記事の共有の設定に、利用者・位置の情報を含めない（URL・題名・文言だけ）", cfgJa && JSON.stringify(Object.keys(cfgJa)) === '["url","title","text"]' && !/lat|lng|uid|token/i.test(cfgJa.url), cfgJa);

// ---------- STEP 48-B：共有リンクのプレビュー(OGP) ----------
const meta = (html, key) => { const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`)); return m ? m[1] : null; };
const og = async (kind, id) => { const writesBefore = S.writes.length; const r = await get(kind === "imadake" ? { mode: "renderShareImadake", postId: id } : { mode: "renderShareShop", shopId: id }); const html = String(r.body || ""); return { r, html, writes: S.writes.length - writesBefore, title: meta(html, "og:title"), desc: meta(html, "og:description"), image: meta(html, "og:image"), url: meta(html, "og:url"), card: meta(html, "twitter:card") }; };
const DEFAULT_TITLE = "マチナウ｜今、何が起きているかを見つけよう";
const DEFAULT_IMAGE = "https://machinau.jp/icon-512.png?v=2";
const isDefault = (o) => o.title === DEFAULT_TITLE && o.image === DEFAULT_IMAGE && o.card === "summary";
const viewsBeforeOg = views(), chargesBeforeOg = charges();
let o = await og("imadake", "SH1");
t("O1 今だけ投稿のプレビュー：og:title＝見出し・og:image＝投稿の写真・og:description＝店名＋カードの紹介文80文字・大きな画像のカード", o.r.code === 200 && o.title === "今日だけの限定ランチ SH1｜マチナウ" && o.image === IMG && o.desc === "那覇の食堂 SH1｜" + EXCERPT80 && o.card === "summary_large_image" && meta(o.html, "og:site_name") === "マチナウ" && meta(o.html, "twitter:image") === IMG, { title: o.title, desc: o.desc, image: o.image });
t("O2 プレビューの URL：og:url は https://machinau.jp/share/imadake/SH1、人は JavaScript で /?imadake=SH1 へ（meta refresh は使わない）", o.url === "https://machinau.jp/share/imadake/SH1" && o.html.includes('location.replace("/?imadake=SH1")') && !/http-equiv="refresh"/i.test(o.html) && o.html.includes('href="/?imadake=SH1"'), o.html.slice(0, 300));
t("O3 プレビューに本文の全文・住所・電話・価格・座標・店舗ID・課金の情報を含めない", !o.html.includes("最後まで読めるのは詳細だけ") && !/松尾|098-000-0000|1,000円|example\.com|26\.2|127\.6|"S1"|cvBilling|storeId/.test(o.html), o.html);
t("O4 キャッシュは短く（s-maxage=60・stale-while-revalidate=60）・検索に登録させない（noindex）", o.r.headers["Cache-Control"] === "public, max-age=0, s-maxage=60, stale-while-revalidate=60" && o.r.headers["X-Robots-Tag"] === "noindex" && /<meta name="robots" content="noindex">/.test(o.html) && /text\/html/.test(o.r.headers["Content-Type"]), o.r.headers);
o = await og("imadake", "SHB");
t("O5 課金対象の投稿のプレビュー：見出し・写真・カードと同じ80文字の紹介文（全文なし）", o.title === "今日だけの限定ランチ SHB｜マチナウ" && o.desc === "那覇の食堂 SHB｜" + EXCERPT80 && o.image === IMG && !o.html.includes("最後まで読めるのは詳細だけ"), { title: o.title, desc: o.desc });
t("O6 プレビューを作ってもCV・料金台帳は増えない（Firestore への書き込み0件）", views() === viewsBeforeOg && charges() === chargesBeforeOg && o.writes === 0, { views: views(), charges: charges(), writes: o.writes });
for (const [id, label] of [["EXP", "掲載期限を過ぎた"], ["HID", "非公開の"], ["NOPE0000", "存在しない"], ["../SH1", "形の違うID"]]) {
  o = await og("imadake", id);
  t(`O7 ${label}投稿（${id}）：共通の題名・画像だけ（見出し・店名・写真・本文を出さない）`, o.r.code === 200 && isDefault(o) && !/限定ランチ|那覇の食堂|cloudinary|地元の野菜/.test(o.html) && (id === "../SH1" ? o.url === "https://machinau.jp/" && o.html.includes('location.replace("/")') : o.url === "https://machinau.jp/share/imadake/" + id), { title: o.title, image: o.image, url: o.url });
}
o = await og("imadake", "XSS");
t("O8 見出し・本文の記号は無害化（<script> を HTML に入れない）", !o.html.includes("<script>alert") && o.html.includes("見出し&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;"), o.title);
o = await og("shop", "L1");
t("O9 店舗（運営掲載）のプレビュー：og:title＝店名・og:image＝店舗の写真・紹介", o.title === "共有できる食堂｜マチナウ" && o.image === IMG && o.desc === "地元の食材の定食。" && o.url === "https://machinau.jp/share/shop/L1" && o.html.includes('location.replace("/?shop=L1")') && !/牧志|26\.215|127\.688/.test(o.html), { title: o.title, desc: o.desc });
o = await og("shop", "sp_S9");
t("O10 店舗（店主が管理する正式店舗）のプレビュー：店名・審査済みの写真・紹介（メール・申請・住所・座標なし）", o.title === "店主が管理するカフェ｜マチナウ" && o.image === STORE_PHOTO && o.desc === "店主が書いた紹介です。" && !/owner-s9|CLAIM-SECRET|牧志|26\.214/.test(o.html), { title: o.title, image: o.image });
o = await og("shop", "L2");
t("O11 引き継ぎ済みの旧掲載（L2）：一覧と同じく、引き継いだ正式店舗の内容（旧掲載の店名は出さない）", o.title === "店主が管理するカフェ｜マチナウ" && !o.html.includes("旧掲載") && !o.html.includes("CLAIM-SECRET"), o.title);
o = await og("shop", "L3");
t("O12 引き継ぎ先がまだ非公開の掲載（L3）：一覧と同じく掲載のまま（下書きの店の内容は出さない）", o.title === "引き継ぎ先が非公開の店｜マチナウ" && !o.html.includes("下書き"), o.title);
for (const [id, label] of [["sp_SDRAFT", "下書きの正式店舗"], ["sp_SOFF", "停止中の正式店舗"], ["sp_NONE", "存在しない正式店舗"], ["LHID", "非公開にした掲載"], ["UP1", "無料店舗でない一般の投稿"], ["GONE0000", "削除済みの掲載"]]) {
  o = await og("shop", id);
  t(`O13 ${label}（${id}）：共通の題名・画像だけ`, isDefault(o) && !/下書き|停止中|非公開にした|一般の投稿|cloudinary/.test(o.html), { title: o.title, image: o.image });
}
const vercel = JSON.parse(readFileSync(REPO_ROOT + "/vercel.json", "utf8"));
const rw = (src) => (vercel.rewrites.find((r) => r.source === src) || {}).destination;
t("O14 vercel.json：/share/imadake/:postId・/share/shop/:shopId を既存の Function（moderate-submission）へ（読みもの・sitemap の rewrite はそのまま）", rw("/share/imadake/:postId") === "/api/moderate-submission?mode=renderShareImadake&postId=:postId" && rw("/share/shop/:shopId") === "/api/moderate-submission?mode=renderShareShop&shopId=:shopId" && rw("/column/:slug.html") === "/api/moderate-submission?mode=renderColumn&slug=:slug" && rw("/sitemap.xml") === "/api/moderate-submission?mode=renderSitemap" && vercel.rewrites.length === 4, vercel);
const pg = await get({ mode: "imadakePostGet", postId: "SHB" });
t("O15 公開GET（課金対象）：本文は空のまま・カードと同じ紹介文（excerpt 80文字・続きあり）", pg.code === 200 && pg.body.bodyProtected === true && pg.body.post.body === "" && pg.body.post.excerpt + "…" === EXCERPT80 && pg.body.post.excerptTruncated === true, pg.body.post && { excerpt: pg.body.post.excerpt, t: pg.body.post.excerptTruncated });
// STEP 48-C｜課金対象の公開GETは、公開カードと同じ範囲の項目だけ(許可リスト)
const CARD_KEYS = ["postId", "storeName", "categoryCode", "headline", "body", "excerpt", "excerptTruncated", "sourceLanguage", "imageUrls", "liveState", "availableUntil", "publishedAt", "expiresAt", "cardTranslations"];
const pgRaw = JSON.stringify(pg.body);
t("P1 公開GET（課金対象・クリック前）：返す項目は公開カードと同じ範囲だけ（許可リストと完全一致）", JSON.stringify(Object.keys(pg.body.post)) === JSON.stringify(CARD_KEYS), Object.keys(pg.body.post));
t("P2 公開GET（課金対象・クリック前）：住所・電話・Webサイト・価格・支払い方法・イベントの詳細・座標・地域・店舗IDを含まない", !/松尾|098-000-0000|example\.com|1,000円|cash|"address"|"actionTargets"|"priceText"|"paymentMethods"|"categoryFields"|"latitude"|"longitude"|"regionKey"|"city"|"prefecture"|"storeId"|"S1"|cvBilling/.test(pgRaw), pgRaw);
t("P3 公開GET（課金対象・クリック前）：写真は1枚だけ（2枚目以降は詳細で）・本文の続き（最後の文）を含まない", pg.body.post.imageUrls.length === 1 && pg.body.post.imageUrls[0] === IMG && !pgRaw.includes("最後まで読めるのは詳細だけ"), pg.body.post.imageUrls);
t("P4 公開GET（課金対象）：保存済みのカード訳（英語）だけを返す（訳は近くの一覧と同じ値）", pg.body.post.cardTranslations.en && pg.body.post.cardTranslations.en.headline === "Today-only lunch SHB" && !("ja" in pg.body.post.cardTranslations), pg.body.post.cardTranslations);
const nbCard = (await import(REPO_URL + "/api/_lib/imadake.js")).buildImadakeCardPost("SHB", S.docs.get("imadakePosts/SHB"), 1);
const nb = { code: 200, body: { posts: [nbCard] } };
t("P5 近くの一覧のカード（buildImadakeCardPost）も詳細を含まない（既存のまま）・公開GETの紹介文・見出しと一致", nb.code === 200 && nbCard && !("address" in nbCard) && !("actionTargets" in nbCard) && !("priceText" in nbCard) && nbCard.excerpt === pg.body.post.excerpt && nbCard.headline === pg.body.post.headline, nbCard || nb.body);
const pg2 = await get({ mode: "imadakePostGet", postId: "SH1" });
t("O16 公開GET（課金対象外）：今までどおり本文・詳細あり（excerpt の項目は増やさない。保存済みのカード訳だけ追加）", pg2.code === 200 && pg2.body.post.body === LONG_BODY && pg2.body.post.address === "沖縄県那覇市松尾" && !("excerpt" in pg2.body.post) && !("bodyProtected" in pg2.body) && JSON.stringify(pg2.body.post.cardTranslations) === "{}", Object.keys(pg2.body.post));
const dOpen = await post({ mode: "imadakeDetailOpen", postId: "SHB" }, { authorization: "Bearer tok-Z" });
t("P6 「続きを見る」（POST imadakeDetailOpen・初回）：住所・連絡先・価格・本文の全文・写真すべてを返し、CVを記録（旅行者Z）", dOpen.code === 200 && dOpen.body.cv.status === "new" && dOpen.body.post.address === "沖縄県那覇市松尾" && dOpen.body.post.actionTargets.phone === "098-000-0000" && dOpen.body.post.priceText === "1,000円" && dOpen.body.post.body === LONG_BODY && dOpen.body.post.imageUrls.length === 2 && S.docs.has("imadakeCvViews/SHB_Z"), dOpen.body.cv);
const dAgain = await post({ mode: "imadakeDetailOpen", postId: "SHB" }, { authorization: "Bearer tok-Z" });
const zCharge = [...S.docs.entries()].find(([k]) => k.startsWith("imadakePostDailyCharges/SHB_"));
t("P7 同じ旅行者（Z）の2回目：詳細は返す・CVは existing（追加なし）・当日の料金は100円", dAgain.code === 200 && dAgain.body.cv.status === "existing" && dAgain.body.post.address === "沖縄県那覇市松尾" && zCharge && zCharge[1].amountJpy === 100 && zCharge[1].validCvCount === 1, { cv: dAgain.body.cv, charge: zCharge && zCharge[1] });
const vp = await post({ mode: "imadakeViewedPosts", postIds: ["SHB", "SH1"] }, { authorization: "Bearer tok-Z" });
t("P8 再訪問（POST imadakeViewedPosts・読み取りだけ）：CVのある旅行者には詳細を返す・CVの無い投稿は返さない・CVは増えない", vp.code === 200 && vp.body.posts.length === 1 && vp.body.posts[0].postId === "SHB" && vp.body.posts[0].address === "沖縄県那覇市松尾" && zCharge[1].validCvCount === 1, vp.body);
// Z の記録はこの後の画面の試験の件数に入らないよう消す(料金台帳も)
S.docs.delete("imadakeCvViews/SHB_Z"); S.docs.delete(zCharge[0]);
const flags = { cv: (await import(REPO_URL + "/api/_lib/imadake.js")).IMADAKE_CV_BILLING_STARTED, charge: (await import(REPO_URL + "/api/_lib/imadake-monthly-charge.js")).IMADAKE_MONTHLY_CHARGE_ENABLED, close: (await import(REPO_URL + "/api/_lib/imadake-monthly-close.js")).IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED, card: (await import(REPO_URL + "/api/_lib/store-billing.js")).STORE_CARD_REGISTRATION_LIVE_ENABLED };
t("P9 本番の課金のフラグはすべて false のまま（CV課金・月次請求・月末締めの書き込み・本番カード登録の一般公開）", flags.cv === false && flags.charge === false && flags.close === false && flags.card === false, flags);

// translations: every share key has ja and en, en has no Japanese
const sandbox = {}; vm.createContext(sandbox); vm.runInContext(readFileSync(REPO_ROOT + "/translations.js", "utf8") + "\nthis.T = MACHINAU_TRANSLATIONS;", sandbox);
const shareKeys = ["share_button", "share_copied", "share_copy_failed", "share_link_label", "share_shop_unavailable", "share_notice_close"];
t("T1 TOPの文言（translations.js）：シェアの6つのキーに日本語・英語があり、英語に日本語が混ざらない", shareKeys.every((k) => sandbox.T[k] && sandbox.T[k].ja && sandbox.T[k].en && !/[ぁ-んァ-ン一-龥]/.test(sandbox.T[k].en)), shareKeys.filter((k) => !sandbox.T[k]));

// ---------- browser ----------
async function api(url, method, log, postData, headers) {
  const u = new URL(url);
  if (u.pathname !== "/api/moderate-submission") return { status: 404, body: { success: false } };
  if (method === "GET") {
    const q = Object.fromEntries(u.searchParams.entries());
    log.apiGets = (log.apiGets || []).concat([q.mode || "(list)"]);
    if (q.mode === "publicStoreProfiles") return apiState.profiles500 ? { status: 500, body: { success: false } } : { body: apiState.profiles };
    if (q.mode === "imadakePostGet" && apiState.imadakeGet500) return { status: 500, body: { success: false } };
    if (q.mode === "articleComments") return { body: { success: true, comments: [] } };
    if (!q.mode || q.mode === "imadakePostGet" || q.mode === "publicListPublishedColumns") { const r = await get(q); return { status: r.code, body: r.body }; }
    return { body: { success: false, message: "not used in this test" } };
  }
  let body = {}; try { body = JSON.parse(postData || "{}"); } catch {}
  log.apiPosts = (log.apiPosts || []).concat([body.mode]);
  if (body.mode === "imadakeViewedPosts") { const auth = headers.Authorization || headers.authorization; const r = await post(body, auth ? { authorization: auth } : {}); return { status: r.code, body: r.body }; }
  if (body.mode === "imadakeDetailOpen") { const auth = headers.Authorization || headers.authorization; const store = headers["X-Machinau-Store-Authorization"] || headers["x-machinau-store-authorization"]; const r = await post(body, { ...(auth ? { authorization: auth } : {}), ...(store ? { "x-machinau-store-authorization": store } : {}) }); return { status: r.code, body: r.body }; }
  return { body: { success: false, message: "not used in this test" } };
}
const langInit = (lang) => `try{ if (window.top===window) { localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
// mode: "share" (navigator.share records), "share-abort", "share-denied", "copy" (no share, clipboard ok), "copy-fail" (no share, clipboard rejects)
const shareMock = (mode) => `(() => {
  window.__shared = []; window.__copied = [];
  const share = ${mode.startsWith("share")} ? async (d) => { window.__shared.push(d); ${mode === "share-abort" ? 'throw new DOMException("cancelled", "AbortError");' : mode === "share-denied" ? 'throw new DOMException("denied", "NotAllowedError");' : ""} } : undefined;
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { ${mode === "copy-fail" ? 'throw new DOMException("no", "NotAllowedError");' : "window.__copied.push(text);"} } }, configurable: true });
  return true; })()`;
// 手元の配信：/share/imadake/{ID}・/share/shop/{ID} は vercel.json の rewrite と同じく実際のサーバーの処理へ、それ以外は静的ファイル。
const staticServer = await serve(REPO_ROOT + "", PORT + 1);
const server = http.createServer(async (req, rs) => {
  const path = new URL(req.url, "http://x").pathname;
  const m = path.match(/^\/share\/(imadake|shop)\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[2]);
    const r = await get(m[1] === "imadake" ? { mode: "renderShareImadake", postId: id } : { mode: "renderShareShop", shopId: id });
    rs.writeHead(r.code, { "Content-Type": r.headers["Content-Type"] || "text/html" }); rs.end(String(r.body)); return;
  }
  const up = await realFetch("http://127.0.0.1:" + (PORT + 1) + req.url);
  rs.writeHead(up.status, { "Content-Type": up.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" });
  rs.end(Buffer.from(await up.arrayBuffer()));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const browser = await launchChrome();
const errorsOf = (p) => [...new Set(p.log.errors)].filter((e) => !/RefererNotAllowedMapError|Google Maps|anonymous auth failed|Failed to load resource/.test(e));
async function top(path, o = {}) {
  const p = await openPage(browser, { origin: ORIGIN, width: o.width || 390, mobile: !(o.width >= 800), contextId: o.contextId || null, state: { apiMock: api, articles: [], initScripts: [langInit(o.lang || "ja")] } });
  await p.goto(path);
  await p.waitFor(`typeof shops !== "undefined" && shops.length >= 4`, 20000);
  await sleep(o.settle ?? 1200);
  await p.ev(`getAnonymousIdTokenForLocationCollection = async function(){ return "tok-${o.uid || "A"}"; };
    getCurrentImadakeTravelerUid = function(){ return "${o.uid || "A"}"; };
    getImadakeStoreOwnerIdToken = async function(){ return ""; };
    getExistingTownNowIdToken = async function(){ return "tok-${o.uid || "A"}"; };
    true`);
  return p;
}
const modalState = (p) => p.ev(`({
  imadakeVisible: document.getElementById("imadakeDetailModal").classList.contains("visible"),
  state: imadakeDetailState && imadakeDetailState.state,
  title: (document.querySelector("#imadakeDetailBody .imadake-detail-title") || {}).textContent || "",
  text: (document.querySelector("#imadakeDetailBody .imadake-detail-text") || {}).textContent || "",
  msg: (document.querySelector("#imadakeDetailBody .imadake-detail-message") || {}).textContent || "",
  readMore: !!document.querySelector("#imadakeDetailBody .imadake-shared-read-more"),
  retry: !!document.querySelector("#imadakeDetailBody .imadake-detail-retry"),
  share: !!document.querySelector("#imadakeDetailBody .machinau-share-button"),
  shareLabel: ((document.querySelector("#imadakeDetailBody .machinau-share-button") || {}).textContent || "").trim(),
  links: document.querySelectorAll("#imadakeDetailBody .imadake-action-link").length,
  rows: document.querySelectorAll("#imadakeDetailBody .imadake-detail-row").length,
  fullBodyInDom: document.body.innerHTML.includes("最後まで読めるのは詳細だけ"),
  shopVisible: document.getElementById("shopModal").classList.contains("visible"),
  shopTitle: document.getElementById("modalTitle").textContent.trim(),
  shopShare: getComputedStyle(document.getElementById("modalShareArea")).display !== "none",
  shopShareId: document.getElementById("modalShareButton").getAttribute("data-share-id"),
  shopShareLabel: document.getElementById("modalShareButton").textContent.trim(),
  notice: !document.getElementById("sharedLinkNotice").hidden,
  noticeText: document.getElementById("sharedLinkNoticeText").textContent,
  noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1
})`);
const clickShare = async (p, selector, mode) => { await p.ev(shareMock(mode)); await p.ev(`document.querySelector(${JSON.stringify(selector)}).click(); true`); await sleep(400); return p.ev(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); const st = b.parentNode.querySelector(".machinau-share-status, .article-share-status"); const input = st && st.querySelector("input"); return { shared: window.__shared, copied: window.__copied, status: st ? st.textContent.trim() : "", statusHidden: st ? st.hidden || getComputedStyle(st).display === "none" : true, isError: st ? st.classList.contains("is-error") : false, input: input ? input.value : "", inputSelected: input ? document.activeElement === input : false }; })()`); };
const shot = (p, name, sel) => p.screenshot(`${SHOTS_DIR}/step48-${name}.png`, sel);

try {
  // ===== STEP 48-B：共有リンク（/share/）を人が開いた時 =====
  let p = await top("/share/imadake/SH1");
  let m = await modalState(p);
  t("S1 /share/imadake/SH1 を開く：TOP の /?imadake=SH1 へ移り、紹介をそのまま表示（現在地なし・CV0件）", (await p.ev("location.pathname + location.search")) === "/?imadake=SH1" && m.state === "preview" && m.title === "今日だけの限定ランチ SH1" && views() === 0 && !(p.log.apiPosts || []).includes("imadakeDetailOpen"), m);
  await p.close();
  p = await top("/share/imadake/EXP");
  m = await modalState(p);
  t("S2 掲載期限を過ぎた投稿の /share/：TOP で「掲載は終了しました」だけ", (await p.ev("location.search")) === "?imadake=EXP" && m.state === "ended" && m.title === "", m);
  await p.close();
  p = await top("/share/shop/L1");
  m = await modalState(p);
  t("S3 /share/shop/L1 を開く：TOP の /?shop=L1 へ移り、店舗の詳細を表示", (await p.ev("location.pathname + location.search")) === "/?shop=L1" && m.shopVisible && m.shopTitle === "共有できる食堂", m);
  await p.close();

  // ===== 今だけ投稿 =====
  p = await top("/?imadake=SH1");
  m = await modalState(p);
  t("A1 /?imadake=SH1（現在地なし）：今だけ投稿の紹介をそのまま表示（見出し・紹介文80文字＋…・「続きを見る」・シェア）", m.imadakeVisible && m.state === "preview" && m.title === "今日だけの限定ランチ SH1" && m.text.endsWith("…") && Array.from(m.text).length === 81 && m.readMore && m.share, m);
  t("A2 紹介では本文の全文・場所・連絡先を出さない（詳細は「続きを見る」から）", !m.fullBodyInDom && m.links === 0 && m.rows === 0, m);
  t("A3 開いただけではCVを記録しない（imadakeDetailOpen を呼ばない・CVの記録0件・料金台帳0件）", !(p.log.apiPosts || []).includes("imadakeDetailOpen") && views() === 0 && charges() === 0 && (p.log.apiGets || []).includes("imadakePostGet"), { posts: p.log.apiPosts, views: views() });
  t("A4 現在地を使わない（現在地が無いまま・近くの一覧は取得しない）", (await p.ev("userLatitude === null && userLongitude === null")) && !(p.log.apiGets || []).includes("imadakePostsNearby"), p.log.apiGets);
  await shot(p, "imadake-preview-390", "#imadakeDetailModal .modal-card");
  let s = await clickShare(p, "#imadakeDetailBody .machinau-share-button", "share");
  t("A5 シェア（Web Share API）：プレビュー付きのURL https://machinau.jp/share/imadake/SH1 と見出しだけを渡す（位置・利用者のIDなし）", s.shared.length === 1 && s.shared[0].url === "https://machinau.jp/share/imadake/SH1" && s.shared[0].title === "今日だけの限定ランチ SH1" && JSON.stringify(Object.keys(s.shared[0])) === '["title","url"]' && s.copied.length === 0 && s.statusHidden, s);
  await p.ev(`document.querySelector("#imadakeDetailBody .imadake-shared-read-more").click(); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state === "ready"`, 8000); await sleep(300);
  m = await modalState(p);
  t("A6 「続きを見る」を押した時だけ既存の詳細（POST imadakeDetailOpen 1回）：本文の全文・連絡先・シェア", (p.log.apiPosts || []).filter((x) => x === "imadakeDetailOpen").length === 1 && m.state === "ready" && m.fullBodyInDom && m.links >= 1 && m.share, { m, posts: p.log.apiPosts });
  t("A7 CVは今までどおり「続きを見る」で1件（課金対象外の投稿なので料金台帳は作らない）", views() === 1 && S.docs.has("imadakeCvViews/SH1_A") && charges() === 0, { views: views(), charges: charges() });
  s = await clickShare(p, "#imadakeDetailBody .machinau-share-button", "copy");
  t("A8 Web Share API が無い環境：URLをコピーし「リンクをコピーしました」", s.copied.length === 1 && s.copied[0] === "https://machinau.jp/share/imadake/SH1" && /リンクをコピーしました/.test(s.status) && !s.isError, s);
  s = await clickShare(p, "#imadakeDetailBody .machinau-share-button", "copy-fail");
  t("A9 コピーもできない時：失敗を案内し、リンクを選んだ状態で表示（手でコピー）", s.isError && /コピーできませんでした/.test(s.status) && s.input === "https://machinau.jp/share/imadake/SH1" && s.inputSelected, s);
  s = await clickShare(p, "#imadakeDetailBody .machinau-share-button", "share-abort");
  t("A10 共有の画面を閉じた（AbortError）：コピーも案内もしない", s.shared.length === 1 && s.copied.length === 0 && s.statusHidden, s);
  s = await clickShare(p, "#imadakeDetailBody .machinau-share-button", "share-denied");
  t("A11 共有が許可されない（NotAllowedError）：コピーに切り替える", s.shared.length === 1 && s.copied[0] === "https://machinau.jp/share/imadake/SH1" && /コピーしました/.test(s.status), s);
  await shot(p, "imadake-detail-390", "#imadakeDetailModal .modal-card");
  t("A12 スマートフォン（390px）：JSエラーなし・横スクロールなし", errorsOf(p).length === 0 && (await modalState(p)).noHScroll, errorsOf(p));
  await p.close();

  // billing post: body not returned by the public GET; CV and the daily charge only after 続きを見る
  const ctxB = (await browser.send("Target.createBrowserContext")).result.browserContextId;
  p = await top("/?imadake=SHB", { uid: "B", contextId: ctxB });
  m = await modalState(p);
  const beforeClickHtml = await p.ev(`document.getElementById("imadakeDetailBody").innerHTML`);
  t("A13b クリック前の画面（課金対象）：住所・電話・Webサイト・価格・2枚目の写真を表示もDOMにも持たない", !/松尾|098-000-0000|example.com|1,000円|second.jpg/.test(beforeClickHtml) && (await p.ev("document.querySelectorAll(\"#imadakeDetailBody .imadake-detail-images img\").length")) === 1, beforeClickHtml.slice(0, 300));
  t("A13 課金対象の投稿：紹介は見出し・カードと同じ80文字の紹介文・「続きを見る」（全文は出さない）・CV0件・料金台帳0件", m.state === "preview" && m.title === "今日だけの限定ランチ SHB" && m.text === EXCERPT80 && m.readMore && !m.fullBodyInDom && views() === 1 && charges() === 0, { m, views: views(), charges: charges() });
  await p.ev(`document.querySelector("#imadakeDetailBody .imadake-shared-read-more").click(); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state === "ready"`, 8000); await sleep(300);
  m = await modalState(p);
  const afterClickHtml = await p.ev(`document.getElementById("imadakeDetailBody").innerHTML`);
  t("A14a クリック後（CVの判定を経た詳細）：住所・電話・価格・写真2枚を表示", /松尾/.test(afterClickHtml) && /tel:0980000000/.test(afterClickHtml) && /1,000円/.test(afterClickHtml) && (await p.ev("document.querySelectorAll(\"#imadakeDetailBody .imadake-detail-images img\").length")) === 2, afterClickHtml.slice(0, 200));
  t("A14 課金対象の投稿で「続きを見る」：既存のCVと料金台帳（1投稿・1日100円）がそのまま動く", m.fullBodyInDom && S.docs.has("imadakeCvViews/SHB_B") && charges() === 1 && [...S.docs.entries()].find(([k]) => k.startsWith("imadakePostDailyCharges/SHB_"))[1].amountJpy === 100, [...S.docs.entries()].filter(([k]) => k.startsWith("imadakePostDailyCharges/")));
  const chargeDoc = () => [...S.docs.entries()].find(([k]) => k.startsWith("imadakePostDailyCharges/SHB_"))[1];
  const cvCountBefore = chargeDoc().validCvCount;
  await p.ev(`closeImadakeDetail(); true`);
  await p.close();
  // 同じ旅行者がもう一度共有リンクから「続きを見る」：CVも料金も増えない。別の旅行者(C)の初回は有効CVだが、当日の料金は100円のまま。
  p = await top("/?imadake=SHB", { uid: "B", contextId: ctxB });
  await p.ev(`openImadakeSharedPreview("SHB"); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state !== "loading"`, 8000); await sleep(300);
  m = await modalState(p);
  t("A14e 再訪問（同じブラウザの旅行者B・共有リンク）：「続きを見る」を押さずに詳細を表示（サーバーのCV記録で確認・imadakeDetailOpen を呼ばない・CV増えない）", m.state === "ready" && m.fullBodyInDom && !(p.log.apiPosts || []).includes("imadakeDetailOpen") && (p.log.apiPosts || []).includes("imadakeViewedPosts") && views() === 2 && chargeDoc().validCvCount === cvCountBefore, { m, posts: p.log.apiPosts });
  await p.ev(`closeImadakeDetail(); openImadakeSharedPreview("SHB"); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state !== "loading"`, 8000);
  await p.ev(`imadakeDetailState = { postId: "SHB", state: "preview", post: imadakeDetailState.post, shared: true }; renderImadakeDetail(); true`);
  await p.ev(`document.querySelector("#imadakeDetailBody .imadake-shared-read-more").click(); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state === "ready"`, 8000); await sleep(300);
  t("A14b 重複防止：同じ旅行者（B）がもう一度「続きを見る」→ CV・料金台帳は増えない（有効CVの件数も同じ）", views() === 2 && charges() === 1 && chargeDoc().validCvCount === cvCountBefore && chargeDoc().amountJpy === 100, { views: views(), doc: chargeDoc() });
  await p.close();
  p = await top("/?imadake=SHB", { uid: "C" });
  m = await modalState(p);
  t("A14c 別の旅行者（C）が開いただけ：CVなし", views() === 2 && m.state === "preview", views());
  await p.ev(`document.querySelector("#imadakeDetailBody .imadake-shared-read-more").click(); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state === "ready"`, 8000); await sleep(300);
  t("A14d 別の旅行者（C）が「続きを見る」：初回なので有効CVが1件増える・当日の料金は100円のまま（上限100円）", S.docs.has("imadakeCvViews/SHB_C") && charges() === 1 && chargeDoc().amountJpy === 100 && chargeDoc().validCvCount === cvCountBefore + 1, chargeDoc());
  await p.close();
  p = await top("/?imadake=SHB", { uid: "D", lang: "en", width: 1280 });
  m = await modalState(p);
  t("A14f 英語・PC（課金対象）：保存済みのカード訳で見出し・紹介文を表示（自動翻訳の表示）・住所等なし・CVなし", m.state === "preview" && m.title === "Today-only lunch SHB" && /^A lunch you should know about today/.test(m.text) && m.text.endsWith("…") && /Auto-translated|translated/i.test(await p.ev(`document.getElementById("imadakeDetailBody").innerText`)) && !/松尾|098-000-0000/.test(await p.ev(`document.getElementById("imadakeDetailBody").innerHTML`)) && !S.docs.has("imadakeCvViews/SHB_D"), m);
  await shot(p, "imadake-preview-1280-en-translated", "#imadakeDetailModal .modal-card");
  await p.close();

  // ===== STEP 48-D：課金対象の投稿で CV の成立を確認できない時は、詳細を出さず再試行の表示 =====
  const shbView = (uid) => S.docs.get("imadakeCvViews/SHB_" + uid);
  const detailHtml = (p) => p.ev(`document.getElementById("imadakeDetailBody").innerHTML`);
  const noDetails = (html) => !/松尾|098-000-0000|tel:0980000000|example\.com|1,000円|最後まで読めるのは詳細だけ/.test(html);
  const readMore = async (p) => { await p.ev(`document.querySelector("#imadakeDetailBody .imadake-shared-read-more").click(); true`); await p.waitFor(`imadakeDetailState && imadakeDetailState.state !== "loading"`, 8000); await sleep(300); };
  let cvBefore = chargeDoc().validCvCount;
  p = await top("/?imadake=SHB", { uid: "E" });
  await p.ev(`getAnonymousIdTokenForLocationCollection = async function(){ throw new Error("anonymous auth failed (simulated)"); }; true`);
  const getsBefore = (p.log.apiGets || []).filter((g) => g === "imadakePostGet").length;
  await readMore(p);
  m = await modalState(p);
  t("D1 旅行者のトークンを取得できない（匿名ログインの失敗）：「続きを見る」→ 再試行の表示・住所・電話・価格・全文を出さない（DOMにも無い）", m.state === "error" && m.retry && noDetails(await detailHtml(p)) && (p.log.apiPosts || []).includes("imadakeDetailOpen"), m);
  t("D2 その時 CV・料金台帳は増えない・公開GETへ戻らない（本文は返らないため）", !shbView("E") && charges() === 1 && chargeDoc().validCvCount === cvBefore && (p.log.apiGets || []).filter((g) => g === "imadakePostGet").length === getsBefore, { views: views(), gets: p.log.apiGets });
  await p.ev(`getAnonymousIdTokenForLocationCollection = async function(){ return "tok-E"; }; true`);
  globalThis.__MOCK_TOKENS["tok-E"] = { uid: "E", firebase: { sign_in_provider: "anonymous" } };
  await p.ev(`document.querySelector("#imadakeDetailBody .imadake-detail-retry").click(); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state === "ready"`, 8000); await sleep(300);
  m = await modalState(p);
  t("D3 「もう一度読み込む」でトークンを取得できた：初回の1CV・詳細を表示・当日の料金は100円のまま", m.state === "ready" && m.fullBodyInDom && /松尾/.test(await detailHtml(p)) && shbView("E") && shbView("E").counted === true && chargeDoc().validCvCount === cvBefore + 1 && chargeDoc().amountJpy === 100 && charges() === 1, chargeDoc());
  await p.close();
  cvBefore = chargeDoc().validCvCount;
  globalThis.__MOCK_TOKENS["tok-F"] = { uid: "F", firebase: { sign_in_provider: "anonymous" } };
  p = await top("/?imadake=SHB", { uid: "F" });
  await p.ev(`getImadakeStoreOwnerIdToken = async function(){ return "expired-store-token"; }; true`);
  await readMore(p);
  m = await modalState(p);
  t("D4 店舗のトークンを確認できない（期限切れ等）：再試行の表示・詳細を出さない・CV・料金なし（本人かもしれないため数えない）", m.state === "error" && m.retry && noDetails(await detailHtml(p)) && !shbView("F") && chargeDoc().validCvCount === cvBefore, m);
  await p.close();
  globalThis.__MOCK_TOKENS["tok-G"] = { uid: "G", firebase: { sign_in_provider: "anonymous" } };
  globalThis.__MOCK_TOKENS["store-own-S1"] = { uid: "ownerS1", firebase: { sign_in_provider: "password" } };
  S.docs.set("storeMembers/S1_ownerS1", { storeId: "S1", uid: "ownerS1", role: "owner", status: "active" });
  p = await top("/?imadake=SHB", { uid: "G" });
  await p.ev(`getImadakeStoreOwnerIdToken = async function(){ return "store-own-S1"; }; true`);
  await readMore(p);
  m = await modalState(p);
  t("D5 確認できた店主本人（自分の投稿）：詳細を表示・CVは数えない（store_owner_view）・料金は増えない", m.state === "ready" && m.fullBodyInDom && shbView("G") && shbView("G").counted === false && shbView("G").excludedReason === "store_owner_view" && chargeDoc().validCvCount === cvBefore && charges() === 1, shbView("G"));
  t("D6 STEP 48-D の画面：JSエラーなし", errorsOf(p).length === 0, errorsOf(p));
  await p.close();
  p = await top("/?imadake=SH1", { uid: "H" });
  await p.ev(`getAnonymousIdTokenForLocationCollection = async function(){ throw new Error("anonymous auth failed (simulated)"); }; true`);
  await readMore(p);
  m = await modalState(p);
  t("D7 課金対象外の投稿は今までどおり：トークンが無くても詳細を表示（CVは記録しない）", m.state === "ready" && m.fullBodyInDom && !S.docs.has("imadakeCvViews/SH1_H"), m);
  await p.close();

  for (const [id, label] of [["EXP", "掲載期限を過ぎた"], ["HID", "非公開（公開中でない）"], ["NOPE0000", "存在しない"]]) {
    p = await top("/?imadake=" + id);
    m = await modalState(p);
    t(`A15 ${label}投稿の共有リンク：「この今だけ投稿の掲載は終了しました。」だけ（見出し・本文・続きを見る・シェアを出さない）`, m.state === "ended" && m.msg === "この今だけ投稿の掲載は終了しました。" && m.title === "" && !m.readMore && !m.share && !(p.log.apiPosts || []).includes("imadakeDetailOpen"), m);
    await p.close();
  }
  apiState.imadakeGet500 = true;
  p = await top("/?imadake=SH1");
  m = await modalState(p);
  t("A16 読み込みに失敗：「もう一度読み込む」を出す（詳細・CVへは進めない）", m.state === "error" && m.retry && !(p.log.apiPosts || []).includes("imadakeDetailOpen"), m);
  apiState.imadakeGet500 = false;
  await p.ev(`document.querySelector("#imadakeDetailBody .imadake-detail-retry").click(); true`);
  await p.waitFor(`imadakeDetailState && imadakeDetailState.state === "preview"`, 8000);
  m = await modalState(p);
  t("A17 「もう一度読み込む」は紹介を読み直す（imadakeDetailOpen を呼ばない）", m.state === "preview" && !(p.log.apiPosts || []).includes("imadakeDetailOpen"), { m, posts: p.log.apiPosts });
  await p.close();
  p = await top("/?imadake=" + encodeURIComponent("../SH1"));
  m = await modalState(p);
  t("A18 形の違うID（../SH1）：何も開かず通常のTOP（取得もしない）", !m.imadakeVisible && !(p.log.apiGets || []).includes("imadakePostGet"), m);
  await p.close();

  // English / PC
  p = await top("/?imadake=SH1", { lang: "en", width: 1280 });
  m = await modalState(p);
  t("A19 英語・PC（1280px）：紹介は英語のUI（シェア「🔗 Share」・原文の言語の注記）・本文はお店の原文のまま", m.state === "preview" && m.shareLabel === "🔗 Share" && (await p.ev(`document.querySelector("#imadakeDetailBody .imadake-shared-read-more").textContent.trim()`)) === "See more" && (await p.ev(`!!document.querySelector("#imadakeDetailBody .imadake-original-note")`)) && m.noHScroll, m);
  s = await clickShare(p, "#imadakeDetailBody .machinau-share-button", "copy");
  t("A20 英語：コピーの案内も英語", /^Link copied/.test(s.status) && s.copied[0] === "https://machinau.jp/share/imadake/SH1", s);
  await shot(p, "imadake-preview-1280-en", "#imadakeDetailModal .modal-card");
  t("A21 PC：JSエラーなし", errorsOf(p).length === 0, errorsOf(p));
  await p.close();

  // ===== 無料店舗 =====
  p = await top("/?shop=L1");
  m = await modalState(p);
  t("B1 /?shop=L1（運営掲載の常設店舗広告・現在地なし）：店舗の詳細をそのまま表示・シェアあり", m.shopVisible && m.shopTitle === "共有できる食堂" && m.shopShare && m.shopShareId === "L1" && m.shopShareLabel === "🔗 シェア", m);
  s = await clickShare(p, "#modalShareButton", "share");
  t("B2 シェア：https://machinau.jp/share/shop/L1 と店名だけを渡す", s.shared.length === 1 && s.shared[0].url === "https://machinau.jp/share/shop/L1" && s.shared[0].title === "共有できる食堂", s);
  s = await clickShare(p, "#modalShareButton", "copy");
  t("B3 コピー：URLをコピーし案内を表示", s.copied[0] === "https://machinau.jp/share/shop/L1" && /リンクをコピーしました/.test(s.status), s);
  await shot(p, "shop-390", "#shopModal .modal-card");
  await p.ev(`closeShopModal(); openShopModal("L1", "card"); true`);
  t("B4 開き直すとコピーの案内は消える", (await p.ev(`document.querySelector("#modalShareArea .machinau-share-status").textContent`)) === "");
  await p.ev(`closeShopModal(); true`);
  t("B5 スマートフォン：JSエラーなし・横スクロールなし", errorsOf(p).length === 0 && (await modalState(p)).noHScroll, errorsOf(p));
  await p.close();

  p = await top("/?shop=sp_S9");
  m = await modalState(p);
  t("B6 /?shop=sp_S9（店主が管理する正式店舗）：詳細を表示・シェアのIDは sp_S9", m.shopVisible && m.shopTitle === "店主が管理するカフェ" && m.shopShare && m.shopShareId === "sp_S9", m);
  await p.close();
  p = await top("/?shop=L2");
  m = await modalState(p);
  t("B7 引き継ぎで一覧から外した旧掲載（L2）の共有リンク：引き継いだ正式店舗（sp_S9）を開く（旧掲載は出さない）", m.shopVisible && m.shopTitle === "店主が管理するカフェ" && m.shopShareId === "sp_S9", m);
  await p.close();
  for (const [id, label] of [["L3", "一覧から外した旧掲載で、表示できる正式店舗が無い"], ["GONE0000", "掲載されていない（削除・期限切れ）"], ["sp_HIDDEN", "非公開の正式店舗"]]) {
    p = await top("/?shop=" + id);
    m = await modalState(p);
    t(`B8 ${label}（${id}）：詳細を開かず「共有された店舗・施設の情報は、現在掲載されていません。」`, !m.shopVisible && m.notice && m.noticeText === "共有された店舗・施設の情報は、現在掲載されていません。", m);
    if (id === "GONE0000") await shot(p, "shop-unavailable-390");
    await p.close();
  }
  S.docs.set("submissions/U1", { title: "旅行者の投稿", category: "グルメ", content: "一般の投稿です。", address: "沖縄県那覇市", latitude: 26.2, longitude: 127.68, status: "approved", submissionType: "street", paymentMethods: [], imageUrls: [], createdAt: Timestamp.fromMillis(now0 - H), updatedAt: Timestamp.fromMillis(now0 - H), expiresAt: Timestamp.fromMillis(now0 + 5 * H) });
  p = await top("/?shop=U1");
  m = await modalState(p);
  const u1Loaded = await p.ev(`shops.some((s) => s.firestoreId === "U1")`);
  t("B9 無料店舗でない掲載（一般の投稿 U1）の共有リンクは開かない（案内のみ）", u1Loaded && !m.shopVisible && m.notice, { m, u1Loaded });
  await p.ev(`hideSharedLinkNotice(); openShopModal("U1", "card"); true`);
  m = await modalState(p);
  t("B10 一般の投稿の詳細にはシェアを出さない（対象は無料店舗だけ）", m.shopVisible && !m.shopShare && m.shopShareId === "", m);
  await p.close();
  S.docs.delete("submissions/U1");

  // 15km rule unchanged: Tokyo listing is not in the Naha card list, but its shared link still opens (like favorites)
  p = await top("/?shop=LT");
  m = await modalState(p);
  await p.ev(`closeShopModal(); applyUserLocation(26.2124, 127.6792, null); true`); await sleep(1200);
  const cardIds = await p.ev(`[...document.querySelectorAll("[data-shop-id], [data-firestore-id]")].map((e) => e.getAttribute("data-shop-id") || e.getAttribute("data-firestore-id"))`);
  const last = await p.ev("lastRenderedShopCardIds");
  const within = await p.ev(`typeof NEARBY_SHOP_CARD_RADIUS_KM !== "undefined" ? NEARBY_SHOP_CARD_RADIUS_KM : null`);
  t("B11 15kmの一覧の条件は不変：那覇の現在地では東京の掲載（LT）は一覧のカードに出ない（共有リンクの詳細は距離に関係なく開く）", m.shopVisible && m.shopTitle === "東京の食堂" && within === 15 && !cardIds.includes("LT") && last.includes("L1") && !last.includes("LT"), { within, cardIds, last });
  await p.close();

  apiState.profiles500 = true;
  p = await top("/?shop=L1");
  m = await modalState(p);
  t("B12 正式店舗の取得に失敗しても、運営掲載の共有リンクは今の一覧と同じく開く", m.shopVisible && m.shopTitle === "共有できる食堂", m);
  await p.close();
  apiState.profiles500 = false;

  p = await top("/?shop=L1", { lang: "en", width: 1280 });
  m = await modalState(p);
  s = await clickShare(p, "#modalShareButton", "copy-fail");
  t("B13 英語・PC：シェア「🔗 Share」・失敗の案内も英語・リンクを表示", m.shopVisible && m.shopShareLabel === "🔗 Share" && /^Couldn't copy the link/.test(s.status) && s.input === "https://machinau.jp/share/shop/L1" && m.noHScroll, { m, s });
  await shot(p, "shop-1280-en", "#shopModal .modal-card");
  await p.ev(`closeShopModal(); true`);
  t("B14 PC：JSエラーなし", errorsOf(p).length === 0, errorsOf(p));
  await p.close();
  p = await top("/?shop=GONE0000", { lang: "en" });
  m = await modalState(p);
  t("B15 英語：掲載されていない時の案内も英語", m.notice && m.noticeText === "The shared place is not listed at the moment.", m);
  await p.close();

  // normal TOP is unchanged: no modal, no notice, no extra request
  p = await top("/");
  m = await modalState(p);
  t("N1 共有リンクでない通常のTOP：何も開かない・案内なし・今だけ投稿の取得なし", !m.imadakeVisible && !m.shopVisible && !m.notice && !(p.log.apiGets || []).includes("imadakePostGet") && errorsOf(p).length === 0, { m, gets: p.log.apiGets });
  await p.close();

  // ===== 読みもの =====
  const articlePage = async (lang, width) => {
    const html = lang === "en" ? artEnHtml : artHtml;
    const pg = await openPage(browser, { origin: ORIGIN, width, mobile: width < 800, state: { apiMock: api, render: async () => html } });
    await pg.goto("/column/share-test-article.html" + (lang === "en" ? "?lang=en" : ""));
    await pg.waitFor(`document.getElementById("articleShareButton") && !document.getElementById("articleShareButton").hidden`, 10000);
    return pg;
  };
  for (const [lang, width] of [["ja", 360], ["en", 1280]]) {
    p = await articlePage(lang, width);
    const url = lang === "en" ? "https://machinau.jp/column/share-test-article.html?lang=en" : "https://machinau.jp/column/share-test-article.html";
    s = await clickShare(p, "#articleShareButton", "share");
    t(`C6 記事（${lang}・${width}px）：シェア（Web Share API）は記事の正式なURL ${url} と題名`, s.shared.length === 1 && s.shared[0].url === url && s.shared[0].title === "国際通りの朝ごはん", s);
    s = await clickShare(p, "#articleShareButton", "copy");
    t(`C7 記事（${lang}）：コピーの成功を案内`, s.copied[0] === url && (lang === "en" ? /^Link copied/ : /リンクをコピーしました/).test(s.status) && !s.statusHidden, s);
    s = await clickShare(p, "#articleShareButton", "copy-fail");
    t(`C8 記事（${lang}）：コピーの失敗を案内し、リンクを選んだ状態で表示`, s.isError && s.input === url && s.inputSelected && (lang === "en" ? /^Couldn't copy/ : /コピーできませんでした/).test(s.status), s);
    s = await clickShare(p, "#articleShareButton", "share-abort");
    t(`C9 記事（${lang}）：共有の画面を閉じた時は何もしない（前の案内も消す）`, s.copied.length === 0 && s.statusHidden, s);
    const saveOk = await p.ev(`!document.getElementById("articleSaveButton").hidden`);
    await shot(p, `article-${lang}-${width}`, ".card");
    t(`C10 記事（${lang}・${width}px）：保存ボタンはそのまま・JSエラーなし・横スクロールなし`, saveOk && errorsOf(p).length === 0 && (await p.ev("document.documentElement.scrollWidth <= window.innerWidth + 1")), errorsOf(p));
    await p.close();
  }
  t("Z1 テスト中に node から外部（本番を含む）へ通信していない", outsideNetwork.length === 0, outsideNetwork);
} finally {
  browser.close(); server.close(); staticServer.close();
}
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
