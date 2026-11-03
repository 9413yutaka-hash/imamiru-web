// 店舗カードの月額料金の請求の開始と規約B案の、掲示版(段階①)と施行日の版(段階②)の整合。
// 告知があれば掲示版として、無ければ施行日の版として確かめる(どちらの版でも同じ試験を使う)。
// 掲示版：本文(利用規約・特商法)は本番の現行の版と1文字も違わない・告知に改定後の文の全文と施行日・申込画面と同意の版は変えない・最終更新日は変えない。
// 施行日の版：告知はどこにも残らない・改定後の文が本文にある・最終更新日と同意の版の日付が施行日。
// Files only. run: node tests/store-card-billing-notice-test.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(REPO_DIR, f), "utf8").split("\r\n").join("\n");
let pass = 0, fail = 0;
function t(name, ok, detail) {
  if (ok) { pass++; console.log("PASS " + name); } else { fail++; console.log("FAIL " + name + (detail === undefined ? "" : " :: " + JSON.stringify(detail).slice(0, 400))); }
}

const TERMS = read("terms.html"), TOK = read("tokushoho.html"), ACC = read("store-account.html"), PROF = read("store-profile.html"), TRJS = read("translations.js");
const BILL = read("api/_lib/store-custom-plan-billing.js");
const TR = new Function(TRJS + ";return MACHINAU_TRANSLATIONS;")();
const plain = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
const sha = (s) => createHash("sha256").update(s).digest("hex");

// 改定後の文(規約B案。代表が正式採用)
const PAY = "毎月末日に利用料金を締め、原則として翌月2日に登録済みのクレジットカードへ請求します。システム障害、請求処理の遅延その他のやむを得ない事情により予定日に請求できなかった場合は、翌月3日以降に請求することがあります。";
const START = "店舗カードの月額料金は、2026年11月分から請求します（11月分は2026年11月30日に締め、2026年12月2日に請求します）。月額契約の申し込みより前の月の月額料金は請求しません。";
const T18_1 = "今だけ投稿の利用料金と店舗カードの月額料金（以下あわせて「利用料金」といいます）について、運営は、" + PAY;
const TK_PRICE = "今だけ投稿の利用料金の請求は、現在開始していません。請求を開始する場合は、開始日の3日前までに本サービス上でお知らせします。" + START + "利用料金の請求には、事業者の明示的な同意が必要です。";
const TK_PAY = "今だけ投稿の利用料金と店舗カードの月額料金は、それぞれ" + PAY + "（別々に請求します）。";
// 本番の現行の版の利用規約・特商法(改行は LF)。STEP 58-B｜2026年11月3日の改定(13条3項・15条5項・17条1項・17条5項・販売価格の無料の範囲)の版。
// 以前の版(origin/main ea83217)：terms 0144788346dceac9d53b5fef434aa6bd71a7689349e2c1dcca418b1a58ce7dd5・tokushoho 5c9416d6cd782c4c111c1b0df687bba85e02eb231ffbfbbee08be8a63b7e22f5
const CURRENT_SHA = { terms: "d363796671d3d79af0bba3d932e426ec05906a8ca064855856331f7030ddd2f7", tokushoho: "84aa166ee713b3de285f0b5ec942d880d441700413ce26b9d166d1bfc3f8b17b" };
const OLD_CONSENT = "store-card-monthly-2026-10-31";

const serverVersion = (BILL.match(/export const STORE_CARD_PLAN_CONSENT_VERSION = "([^"]+)";/) || [])[1];
const pageVersion = (PROF.match(/const STORE_CARD_PLAN_CONSENT_VERSION = "([^"]+)";/) || [])[1];
const updated = (h) => (h.match(/最終更新日：(\d{4})年(\d{1,2})月(\d{1,2})日/) || []).slice(1).map(Number);
const ymd = (a) => a.length === 3 ? a[0] + "-" + String(a[1]).padStart(2, "0") + "-" + String(a[2]).padStart(2, "0") : "";
const ja = (d) => { const [y, m, dd] = d.split("-").map(Number); return y + "年" + m + "月" + dd + "日"; };
const en = (d) => { const [y, m, dd] = d.split("-").map(Number); return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1] + " " + dd + ", " + y; };
const NOTICE_ATTR = 'data-legal-notice="store-card-billing"';
const STAGE = TERMS.includes(NOTICE_ATTR) ? "notice" : "launch";
console.log("stage: " + STAGE);

if (STAGE === "notice") {
  const eff = (TERMS.match(/data-legal-notice="store-card-billing" data-effective="(\d{4}-\d{2}-\d{2})"/) || [])[1] || "";
  const strip = (h) => h.replace(/[ ]*<!-- BILLING-START-NOTICE:START[\s\S]*?<!-- BILLING-START-NOTICE:END -->\n/, "").replace(/    \/\* BILLING-START-NOTICE-CSS[^\n]*\n(    \.legal-notice-billing[^\n]*\n)+/, "");
  t("N1 告知は利用規約・特商法・店舗アカウントの画面の3か所に1つずつ・施行日はすべて同じ（日英）", !!eff &&
    [TERMS, TOK, ACC].every((h) => h.split(NOTICE_ATTR).length === 2) && TOK.includes('data-effective="' + eff + '"') &&
    [TERMS, TOK].every((h) => h.includes("施行日：<span data-legal-billing-effective>" + ja(eff) + "</span>")) &&
    TR.store_account_billing_notice_date.ja === "施行日：" + ja(eff) && TR.store_account_billing_notice_date.en === "Effective date: " + en(eff), { eff });
  t("N2 掲示の間、利用規約・特商法の本文は本番の現行の版と1文字も違わない（告知と告知の CSS を除くと一致）",
    sha(strip(TERMS)) === CURRENT_SHA.terms && sha(strip(TOK)) === CURRENT_SHA.tokushoho, { terms: sha(strip(TERMS)), tokushoho: sha(strip(TOK)) });
  const nT = TERMS.slice(TERMS.indexOf("BILLING-START-NOTICE:START"), TERMS.indexOf("BILLING-START-NOTICE:END"));
  const nK = TOK.slice(TOK.indexOf("BILLING-START-NOTICE:START"), TOK.indexOf("BILLING-START-NOTICE:END"));
  t("N3 告知に改定後の文の全文：利用規約 17条9項・18条1項、特商法 販売価格の最後の段落・支払時期の1つ目の段落",
    nT.includes('<ol start="9">\n            <li>' + START + "</li>") && nT.includes("<li>" + T18_1 + "</li>") && nK.includes("<p>" + TK_PRICE + "</p>") && nK.includes("<p>" + TK_PAY + "</p>"));
  t("N4 告知の内容：請求の開始（11月分・11月30日締め・12月2日請求）・申し込みの無いお店に料金なし・申込前の月は請求しない・施行日の前日までは改定前（現在の本文）",
    [nT, nK, TR.store_account_billing_notice_start.ja].every((s) => s.includes("2026年11月分から請求します。11月分は2026年11月30日に締め、2026年12月2日に、登録されたクレジットカードへ請求します。月額契約を申し込んでいないお店・施設に料金が発生することはありません。申し込みより前の月の月額料金は請求しません。")) &&
    [nT, nK, TR.store_account_billing_notice_revision.ja].every((s) => s.includes("施行日の前日までは、改定前の内容（現在の本文）が適用されます。")));
  // STEP 58-B｜最終更新日は11月3日の別の改定(店舗カードの管理は月額契約が必須)の日付。12月1日の改定の内容はまだ入れない。
  t("N5 掲示の間は申込画面・同意の版を変えない・最終更新日は11月3日の別の改定の日（同意の版 store-card-monthly-2026-10-31・申込画面に支払い失敗時の1行なし）",
    serverVersion === OLD_CONSENT && pageVersion === OLD_CONSENT && ymd(updated(TERMS)) === "2026-11-03" && ymd(updated(TOK)) === "2026-11-03" && TERMS.includes('data-revision="2026-11-03"') && TOK.includes('data-revision="2026-11-03"') && !PROF.includes("store_card_plan_terms_failure"), { serverVersion, pageVersion });
  t("N6 施行日は掲示の後（同意の版の日付より後）・英語の告知に日本語が混ざらない",
    eff > "2026-11-01" && ["store_account_billing_notice_title", "store_account_billing_notice_start", "store_account_billing_notice_revision", "store_account_billing_notice_date"].every((k) => !/[぀-ヿ一-鿿]/.test(TR[k].en)));
} else {
  const eff = (serverVersion || "").replace(/^store-card-monthly-/, "");
  t("F1 施行日の版：告知はどこにも残っていない（3ページ・翻訳・CSS）",
    ![TERMS, TOK, ACC, TRJS].some((h) => h.includes(NOTICE_ATTR) || h.includes("BILLING-START-NOTICE") || h.includes("store_account_billing_notice_") || h.includes("legal-notice-billing")));
  t("F2 最終更新日（利用規約・特商法）と同意の版（画面とサーバー）の日付が施行日で同じ",
    /^\d{4}-\d{2}-\d{2}$/.test(eff) && eff > "2026-11-01" && pageVersion === serverVersion && ymd(updated(TERMS)) === eff && ymd(updated(TOK)) === eff, { eff, terms: ymd(updated(TERMS)), tok: ymd(updated(TOK)), pageVersion });
  t("F3 改定後の文が本文にある：17条9項・18条1項・特商法の販売価格と支払時期・改定前の「申し込みと月額料金の請求は開始していません」は残らない",
    TERMS.includes("<li>" + START + "</li>") && TERMS.includes("<li>" + T18_1 + "</li>") && TOK.includes("<p>" + TK_PRICE + "</p>") && TOK.includes("<p>" + TK_PAY + "</p>") &&
    !/申し込みと月額料金の請求は開始していません/.test(TERMS) && !/申し込みと請求を開始する場合も/.test(TOK));
  t("F4 申込画面：支払い失敗時の1行・原則として翌月2日（日英）・カード登録の画面は月額契約のお店だけ請求",
    PROF.includes('data-i18n="store_card_plan_terms_failure"') && /原則として翌月2日/.test(TR.store_card_plan_terms_billing.ja) && /as a rule/.test(TR.store_card_plan_terms_billing.en) &&
    /月額契約を申し込んだお店・施設についてだけ請求します/.test(TR.store_billing_intro.ja) && !/現在、請求は行っていません/.test(TR.store_billing_intro.ja));
}
t("C1 本文の外の文（プライバシーポリシーの最終更新日）は変えない", /最終更新日：2026年11月1日/.test(read("privacy.html")));

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
