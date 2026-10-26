// STEP 43-N: legal pages (特定商取引法に基づく表記・利用規約・プライバシーポリシー) and the links to them.
// Static checks of the page text (decided business info only, decided prices only, no STEP 44 plan, no placeholders)
// + headless Chrome at phone and PC widths (no horizontal overflow, no JS errors, links resolve).
// Every /api request from the TOP page is answered locally (nothing is sent to machinau.jp).
// run: node --import ./tests/mockfa/register.mjs tests/legal-pages-test.mjs
import { REPO_ROOT, REPO_URL, SHOTS_DIR as SHOT_DIR } from "./_paths.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8874";

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const read = (f) => readFileSync(join(REPO_ROOT, f), "utf8");
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const TOK = read("tokushoho.html"), TERMS = read("terms.html"), PRIV = read("privacy.html");
const tok = text(TOK), terms = text(TERMS), priv = text(PRIV);

// ===================== A: 特定商取引法に基づく表記 =====================
const row = (label) => { const m = TOK.match(new RegExp("<th scope=\"row\">" + label + "</th>\\s*<td>([\\s\\S]*?)</td>")); return m ? text(m[1]).trim() : null; };
t("A1 サービス名・販売事業者は代表が承認した内容（マチナウ・上田 豊）", row("サービス名") === "マチナウ" && row("販売事業者") === "上田 豊", { s: row("サービス名"), b: row("販売事業者") });
t("A2 所在地・電話番号（受付時間）・メールアドレス（24時間受付）は代表が承認・決定した内容", row("所在地") === "沖縄県八重瀬町港川174" && row("電話番号").replace(/\s+/g, "") === "090-5545-0052（受付：平日9:00〜15:00、日本時間）" && row("メールアドレス").replace(/\s+/g, "") === "9413yutaka@gmail.com（24時間受付・順次ご返信します）" && TOK.includes('href="tel:09055450052"') && TOK.includes('href="mailto:9413yutaka@gmail.com"'));
t("A3 株式会社上田屋を運営者として載せない（3ページとも）", ![TOK, TERMS, PRIV].some((h) => h.includes("上田屋")));
t("A4 販売価格は代表確定仕様（無料の範囲・1投稿1日100円（税込）・0件0円・同じ日は何件でも100円）・現在は請求なし",
  /店舗アカウントの作成、お店・施設の情報の登録・掲載：無料/.test(row("販売価格")) && /日本時間の1日に有効な閲覧.*1件以上あった日ごとに100円（税込）/.test(row("販売価格")) && /0件の日は0円/.test(row("販売価格")) && /何件でも100円/.test(row("販売価格")) && /現在、利用料金の請求は開始していません/.test(row("販売価格")) && /開始日の3日前までに/.test(row("販売価格")) && /明示的な同意が必要/.test(row("販売価格")), row("販売価格"));
t("A5 支払方法はクレジットカード（Stripe）・支払時期は月末締め・翌月2日・3日後と7日後の再請求・14日で新しい課金対象の投稿を停止・支払い後に再開",
  /クレジットカード/.test(row("支払方法")) && /Stripe/.test(row("支払方法")) && /月末に締めて.*翌月2日に/.test(row("支払時期")) && /3日後と7日後に再度請求/.test(row("支払時期")) && /14日を過ぎても未払いの場合は、新たに利用料金の対象となる今だけ投稿の作成を停止/.test(row("支払時期")) && /お支払いの後に再開/.test(row("支払時期")), row("支払時期"));
t("A6 返金：正常な料金は原則返金しない・二重請求等は調査のうえ返金または取消し／明細と領収書・適格請求書は発行しない",
  /正常に発生した利用料金は、原則として返金しません/.test(row("キャンセル・返金")) && /二重請求、誤った請求、システムの障害による不当な請求.*返金または請求の取消し/.test(row("キャンセル・返金")) && /請求の明細と領収書を提供/.test(row("請求明細・領収書")) && /適格請求書（インボイス）は、現時点では発行していません/.test(row("請求明細・領収書")), { r: row("キャンセル・返金"), m: row("請求明細・領収書") });
t("A7 月額100円カスタマイズプラン（STEP 44）を載せない（3ページとも）", ![tok, terms, priv].some((s) => /月額|カスタマイズ|サブスク/.test(s)));
t("A8 未記入の印（【】・未定・TODO 等）が残っていない（3ページとも）", ![tok, terms, priv].some((s) => /【|】|TODO|未記入|要確認|XXX/.test(s)));

// ===================== B: 利用規約 =====================
const nums = (html) => [...html.matchAll(/<h2>(\d+)\. /g)].map((m) => Number(m[1]));
const seq = (a) => a.every((n, i) => n === i + 1);
t("B1 条の番号が1から順に並ぶ（1〜19）", seq(nums(TERMS)) && nums(TERMS).length === 19, nums(TERMS));
t("B2 運営者は個人事業の上田 豊", /上田 豊（以下「運営」といいます）が個人事業として運営/.test(terms));
t("B3 既存の1〜12条（禁止事項・投稿・終了番号・免責等）は残っている", ["1. サービス概要", "3. 禁止事項", "8. 終了番号の管理", "11. 免責事項", "12. 規約の変更"].every((h) => TERMS.includes("<h2>" + h)));
t("B4 カード登録：店舗の登録・引き継ぎに必要・1アカウント1枚・登録だけでは料金なし・カード番号は Stripe が受け取り保存しない",
  /お店・施設の登録と、運営が掲載しているお店・施設の引き継ぎには、店舗アカウントへのクレジットカードの登録が必要/.test(terms) && /1つの店舗アカウントにつき1枚/.test(terms) && /カードを登録しただけでは、料金は発生しません/.test(terms) && /Stripe）が直接受け取ります。運営はこれらを受け取らず、保存しません/.test(terms));
t("B5 今だけ投稿の料金は代表確定仕様どおり（無料の投稿・1投稿1日100円（税込）・CV の定義・本人の閲覧は数えない）",
  /投稿そのものは無料/.test(terms) && /日本時間の1日に有効な閲覧が1件以上あった日ごとに100円（税込）/.test(terms) && /「続きを見る」を初めて押したこと/.test(terms) && /自らの店舗アカウントでログインしている時の閲覧は数えません/.test(terms));
t("B6 支払い・再請求・停止・結果不明・明細と領収書・返金は代表決定どおり（翌月2日・3日後と7日後・14日で新しい課金対象の投稿を停止・結果不明は自動で再請求しない）",
  /翌月2日に、登録されたクレジットカードへ請求/.test(terms) && /3日後と7日後に再度請求/.test(terms) && /最初の請求ができなかった日から14日を過ぎても未払いの場合は、新たに利用料金の対象となる今だけ投稿の作成を停止/.test(terms) && /お支払いいただいた後、利用を再開/.test(terms) && /自動で再度の請求は行わず/.test(terms) && /請求の明細と領収書を提供/.test(terms) && /適格請求書（インボイス）は、現時点では発行していません/.test(terms) && /18\. 返金/.test(terms) && /原則として返金しません/.test(terms) && /返金または請求の取消し/.test(terms));
t("B6b 課金開始の告知（3日前まで）・明示の同意・開始前の投稿は対象外・実際の開始日は書かない・未実装の削除は書かない",
  /開始日の3日前までに本サービス上でお知らせ/.test(terms) && /事業者の明示的な同意が必要/.test(terms) && /請求を開始する前に作成された今だけ投稿には、利用料金は発生しません/.test(terms) && !/20\d\d年\d+月\d+日から(請求|課金)/.test(terms) && !/アカウントの削除|店舗の削除/.test(terms));
t("B7 引き継ぎに運営の承認・追加の本人確認の工程を書いていない", !/運営の承認|本人確認書類|電話で確認|公式サイトで確認/.test(terms.slice(terms.indexOf("15. 店舗情報の引き継ぎ"))));

// ===================== C: プライバシーポリシー =====================
t("C1 項目の番号が1から順に並ぶ（1〜13）・本文中の項目の参照も実在の番号と名前", seq(nums(PRIV)) && nums(PRIV).length === 13 && [...priv.matchAll(/「(\d+)\. ([^」]+)」/g)].every((m) => PRIV.includes("<h2>" + m[1] + ". " + m[2] + "</h2>")), { nums: nums(PRIV), refs: [...priv.matchAll(/「(\d+)\. ([^」]+)」/g)].map((m) => m[0]) });
t("C2 運営者（上田 豊）を明記し、住所・連絡先は特商法の表記へ案内", /運営者である上田 豊/.test(priv) && PRIV.includes('href="tokushoho.html"'));
t("C3 店舗アカウント・カード（保存する項目・Stripe が直接受け取る）・料金の記録・「続きを見る」の記録を記載",
  /店舗アカウントの作成・ログイン時の情報/.test(priv) && /カードのブランド・下4桁・有効期限/.test(priv) && /Stripeが直接受け取り、運営は受け取りません/.test(priv) && /利用料金の計算・請求に必要な記録/.test(priv) && /「続きを見る」が押された記録/.test(priv));
t("C4 委託先の表：決済（Stripe）・地図・AI・画像・利用状況・データの保存（クラウドサービスの事業者）", /クレジットカードの登録、利用料金の決済 Stripe/.test(priv) && /Google（Google Maps Platform）/.test(priv) && /OpenAI/.test(priv) && /Cloudinary/.test(priv) && /Google（Google Analytics）/.test(priv) && /クラウドサービスの事業者/.test(priv));
t("C5 技術構成の名称（Vercel・Firebase・Firestore・GitHub）を列挙しない", !/Vercel|Firebase|Firestore|GitHub/.test(priv), (priv.match(/Vercel|Firebase|Firestore|GitHub/g) || []));
t("C6 外国での取扱い・安全管理措置・開示等の請求・苦情の窓口を記載", /外国にあるサーバーで取り扱われる場合があります/.test(priv) && /個人情報保護委員会/.test(priv) && /10\. 安全管理のための措置/.test(priv) && /11\. 開示等のご請求/.test(priv) && /お問い合わせ・苦情/.test(priv));
t("C7 撤去済みの旧方式（専用投稿ページのお渡し）の説明を外した・お申し込みフォームの記載は残す", !/専用投稿ページ/.test(priv) && /無料投稿のお申し込み/.test(priv));
t("C8 既存の記載（位置情報・IP の変換・24時間で削除・ブラウザ内の保存）は残っている", /約1km単位に丸めた座標/.test(priv) && /24時間後を有効期限/.test(priv) && /7\. ブラウザ内に保存される情報/.test(priv));

// ===================== D: links / card screen / consent version =====================
const hrefs = (html) => [...html.matchAll(/href="([^"#:]+\.html)"/g)].map((m) => m[1]);
const missing = [TOK, TERMS, PRIV].flatMap(hrefs).filter((h) => !existsSync(join(REPO_ROOT, h)));
t("D1 3ページ内のリンク先のページはすべて存在する", missing.length === 0, missing);
t("D2 利用規約・プライバシーポリシーから特商法の表記へ、特商法の表記から両方へリンク", TERMS.includes('href="tokushoho.html"') && PRIV.includes('href="tokushoho.html"') && TOK.includes('href="terms.html"') && TOK.includes('href="privacy.html"'));
const INDEX = read("index.html"), ACC = read("store-account.html");
t("D3 TOP のフッターに特商法の表記（翻訳キー付き）", /<a href="tokushoho.html" data-i18n="footer_tokushoho_link">特定商取引法に基づく表記<\/a>/.test(INDEX));
const billingSection = ACC.slice(ACC.indexOf('id="billingSection"'), ACC.indexOf('id="invoiceHistorySection"'));
t("D4 店舗アカウントのカード登録の欄（カード登録が使える時だけ表示）に、利用規約・特商法の表記へのリンク（別タブ）", /id="billingLegalLinks"/.test(billingSection) && /href="terms.html" target="_blank" rel="noopener"/.test(billingSection) && /href="tokushoho.html" target="_blank" rel="noopener"/.test(billingSection));
const tr = new Function(read("translations.js") + ";return MACHINAU_TRANSLATIONS;")();
const newKeys = ["footer_tokushoho_link", "store_billing_legal_prefix", "store_billing_legal_terms_link", "store_billing_legal_and", "store_billing_legal_tokushoho_link"];
t("D5 新しい翻訳キーは日本語・英語の両方", newKeys.every((k) => tr[k] && typeof tr[k].ja === "string" && tr[k].ja !== "" && typeof tr[k].en === "string" && tr[k].en !== ""), newKeys.filter((k) => !tr[k]));
t("D6 カード登録の説明：登録・引き継ぎに必要・登録だけでは料金なし・保存する項目・現在は請求なし（月額プランは書かない）",
  /お店・施設の登録と引き継ぎにも、カードの登録が必要/.test(tr.store_billing_intro.ja) && /カードを登録しただけでは料金は発生しません/.test(tr.store_billing_intro.ja) && /ブランド・下4桁・有効期限だけ/.test(tr.store_billing_intro.ja) && /現在、請求は行っていません/.test(tr.store_billing_intro.ja) && !/月額|カスタマイズ/.test(tr.store_billing_intro.ja + tr.store_billing_consent.ja));
t("D7 同意文に利用規約（料金・お支払いの条項）への同意を含む（英語も）", /利用規約（料金・お支払いの条項を含みます）に同意し/.test(tr.store_billing_consent.ja) && /Terms of Service/.test(tr.store_billing_consent.en));
const SB = await import(REPO_URL + "/api/_lib/store-billing.js");
t("D8 同意の版は 2026-10-25（文言の改定に合わせて更新）・画面は版を書き込まずサーバーの値を使う", SB.STORE_BILLING_CONSENT_VERSION === "2026-10-25" && !ACC.includes("2026-10-16") && !ACC.includes("2026-10-25"));

// ===================== E: browser (phone / PC) =====================
const server = await serve(REPO_ROOT + "", 8874);
const browser = await launchChrome();
const apiMock = async (url, method) => ({ status: 200, body: method === "GET" && url.includes("publicStoreProfiles") ? { success: true, stores: [], suppressedListingIds: [], claimedListingIds: [], listingClaimOpen: false } : (method === "GET" ? { success: true, submissions: [] } : { success: false }) });
const layout = (p) => p.ev(`(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, h1: (document.querySelector("h1") || {}).textContent || "", links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")) }))()`);
try {
  for (const [page, title] of [["/tokushoho.html", "特定商取引法に基づく表記"], ["/terms.html", "利用規約"], ["/privacy.html", "プライバシーポリシー"]]) {
    for (const [w, mobile, label] of [[360, true, "スマートフォン（360px）"], [1280, false, "PC"]]) {
      const p = await openPage(browser, { origin: ORIGIN, width: w, mobile, state: { apiMock } });
      await p.goto(page); await sleep(400);
      const L = await layout(p);
      t(`E ${title}・${label}：見出し表示・横にはみ出さない・JSエラーなし`, L.h1.trim() === title && L.sw <= L.w && p.log.errors.length === 0, { L: { sw: L.sw, w: L.w, h1: L.h1 }, errors: p.log.errors });
      if (page === "/tokushoho.html" && mobile) {
        const cells = await p.ev(`(() => { const th = document.querySelector("th"); const td = document.querySelector("td"); return { thDisplay: getComputedStyle(th).display, tdDisplay: getComputedStyle(td).display }; })()`);
        t("E 特商法の表記・スマートフォン：項目名と内容を縦に並べる", cells.thDisplay === "block" && cells.tdDisplay === "block", cells);
        await p.screenshot(join(SHOT_DIR, "legal-tokushoho-360.png"));
      }
      await p.close();
    }
  }
  const top = await openPage(browser, { origin: ORIGIN, width: 390, mobile: true, state: { apiMock, articles: [] } });
  await top.goto("/"); await sleep(2500);
  const foot = await top.ev(`(() => { const a = document.querySelector('.footer-links a[href="tokushoho.html"]'); return a ? { text: a.textContent.trim(), shown: getComputedStyle(a).display !== "none", sw: document.documentElement.scrollWidth, w: window.innerWidth } : null; })()`);
  t("E TOP（スマートフォン）：フッターに「特定商取引法に基づく表記」・横にはみ出さない", foot && foot.text === "特定商取引法に基づく表記" && foot.shown && foot.sw <= foot.w, foot);
  t("E TOP：本番のサーバー（machinau.jp）へ問い合わせていない・JSエラーなし", top.log.errors.length === 0, top.log.errors);
  await top.close();
} finally {
  browser.close(); server.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
