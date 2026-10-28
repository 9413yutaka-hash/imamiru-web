// STEP 47-H: advance notice of the terms / privacy policy revision (store account closure), and the launch-day state.
// Notice line (before the effective date): the notice is on terms / privacy / shop-guide / store-account with the same dates,
// the notice period is at least 7 full days after the posting day, the current legal text is unchanged byte for byte,
// and the closure feature itself is NOT shipped. Launch line: no notice left, revised clauses in the body, the update date
// is the effective date, the feature is shipped with the production auto-deletion off. Billing flags stay off in both.
// + headless Chrome (phone / PC, Japanese / English): the notice is shown, no horizontal overflow, no JS errors.
// Every /api request is answered locally (nothing is sent to machinau.jp).
// run: node --import ./tests/mockfa/register.mjs tests/legal-change-notice-test.mjs
import { REPO_ROOT, REPO_URL, SHOTS_DIR } from "./_paths.mjs";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { serve, launchChrome, openPage, sleep } from "./lib-auth.mjs";
const ORIGIN = "http://127.0.0.1:8875";

// 告知開始日と施行予定日（代表の承認に合わせて変更する。告知の各ページの日付と一致させる）。
const SCHEDULE = { start: "2026-10-30", effective: "2026-11-07" };
// 告知の日を数えず、その翌日から7日間を告知期間とする（施行日は告知日の8日後以降）。
const MIN_DAYS_FROM_POSTING_TO_EFFECTIVE = 8;
// 告知を外した時に一致すべき、現行の版（main 5c8c597）の内容（改行は LF にそろえる）。
const CURRENT_SHA256 = {
  "terms.html": "d72fda9958c7660245c4f9bc9152521c45bf929960a3814dff996f8283561321",
  "privacy.html": "c26afaabce5b0d9da3178fadbb303dea1ed2eee437128f977d5a594964fa37fc",
  "shop-guide.html": "2ed289a26184918e2a6ef9247b6da483b28e9cfeae3f042191cb0918e9d26de6",
  "store-account.html": "abef918eb429d22c480c13e65dc68bad49a7852449a40f25522d2e47bb2a476e",
  "translations.js": "3de3780b026bb9b4e1a67da1b895f5d50f5cc1104f6c5de7ee49b8c2ad851f02"
};
const PAGES = ["terms.html", "privacy.html", "shop-guide.html", "store-account.html"];

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const read = (f) => readFileSync(join(REPO_ROOT, f), "utf8").replace(/\r/g, "");
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const parse = (d) => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
const ja = (d) => { const x = new Date(parse(d)); return `${x.getUTCFullYear()}年${x.getUTCMonth() + 1}月${x.getUTCDate()}日`; };
const prevJa = (d) => { const x = new Date(parse(d) - 86400000); return `${x.getUTCFullYear()}年${x.getUTCMonth() + 1}月${x.getUTCDate()}日`; };
// Same removal as the publishing script: the marker lines, everything between, and the one blank line after.
function stripNotice(s) {
  let out = s;
  for (const [a, b] of [["LEGAL-NOTICE:START", "LEGAL-NOTICE:END"], ["LEGAL-NOTICE-CSS:START", "LEGAL-NOTICE-CSS:END"]]) {
    while (out.includes(a)) {
      const i = out.indexOf(a), j = out.indexOf(b, i);
      if (j < 0) return null;
      const from = out.lastIndexOf("\n", i) + 1;
      let to = out.indexOf("\n", j) + 1;
      if (out[to] === "\n") to++;
      out = out.slice(0, from) + out.slice(to);
    }
  }
  return out;
}
const noticeOf = (html) => { const m = html.match(/<!-- LEGAL-NOTICE:START[\s\S]*?LEGAL-NOTICE:END/); return m ? m[0] : ""; };

const FILES = Object.fromEntries([...PAGES, "translations.js"].map((f) => [f, read(f)]));
const tr = new Function(FILES["translations.js"].replace(/\r/g, "") + ";return MACHINAU_TRANSLATIONS;")();
const FEATURE_SHIPPED = existsSync(join(REPO_ROOT, "api/_lib/store-account-deletion.js"));
const HAS_NOTICE = PAGES.some((f) => FILES[f].includes("LEGAL-NOTICE:START"));
const MS = read("api/moderate-submission.js"), ACC = FILES["store-account.html"];
console.log(`line: ${HAS_NOTICE ? "notice" : "no notice"} / feature ${FEATURE_SHIPPED ? "shipped" : "not shipped"}`);

// ===================== F: flags (both lines) =====================
const flag = (file, name) => { const m = read(file).match(new RegExp("export const " + name + " =\\s*(true|false);")); return m ? m[1] : null; };
t("F1 本番課金は始まっていない（請求の開始・月次の請求・月次の締めの書き込みはすべて OFF）",
  flag("api/_lib/imadake.js", "IMADAKE_CV_BILLING_STARTED") === "false" && flag("api/_lib/imadake-monthly-charge.js", "IMADAKE_MONTHLY_CHARGE_ENABLED") === "false" && flag("api/_lib/imadake-monthly-close.js", "IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED") === "false");
t("F2 本番のカード登録の一般公開は OFF のまま（代表限定の試行の設定は変えていない）", flag("api/_lib/store-billing.js", "STORE_CARD_REGISTRATION_LIVE_ENABLED") === "false" && flag("api/_lib/store-billing.js", "STORE_CARD_LIVE_ADMIN_TRIAL_ENABLED") === "true");

if (HAS_NOTICE) {
  // ===================== N: notice line =====================
  t("N0 告知の期間中は、退会の機能を公開しない（削除の本体・API の入口・画面の欄が無い）",
    !FEATURE_SHIPPED && !/storeAccountDelete|accountDeletionSweep/.test(MS) && !ACC.includes("accountDeletionSection") && !/store_account_delete_/.test(FILES["translations.js"]));
  const attrs = PAGES.map((f) => { const m = noticeOf(FILES[f]).match(/data-notice-start="([\d-]+)" data-effective="([\d-]+)"/); return m ? { f, start: m[1], effective: m[2] } : { f }; });
  t("N1 4ページすべてに告知があり、告知開始日と施行予定日が同じ（予定表どおり）", attrs.every((a) => a.start === SCHEDULE.start && a.effective === SCHEDULE.effective), attrs);
  const gap = Math.round((parse(SCHEDULE.effective) - parse(SCHEDULE.start)) / 86400000);
  t(`N2 告知期間：告知日の翌日から7日以上（施行日は告知日の${MIN_DAYS_FROM_POSTING_TO_EFFECTIVE}日後以降）`, gap >= MIN_DAYS_FROM_POSTING_TO_EFFECTIVE, { gap });
  const nt = Object.fromEntries(["terms.html", "privacy.html", "shop-guide.html"].map((f) => [f, text(noticeOf(FILES[f]))]));
  const required = [
    ["退会の機能の追加", /店舗アカウントの退会（削除）を申し込めるようになります/],
    ["申込み後は非公開", /お店・施設の情報は非公開になり/],
    ["未払いは清算後に削除", /未払いの利用料金がある場合は、お支払い（清算）が済んでから店舗アカウントを削除/],
    ["削除開始前は取り消せる", /削除が始まる前であれば、退会の申し込みを取り消せます/],
    ["法令上必要な取引記録は保存", /法令上必要な請求・取引の記録と、退会の手続きの記録は、削除後も保存/],
    ["規約・ポリシーの改定", /利用規約とプライバシーポリシーを改定/],
    ["告知開始日", new RegExp("告知開始日：" + ja(SCHEDULE.start))],
    ["施行予定日", new RegExp("施行予定日：" + ja(SCHEDULE.effective))],
    ["施行日の前日までは現行が適用", new RegExp(prevJa(SCHEDULE.effective) + "までは、現在の利用規約・プライバシーポリシーが適用")]
  ];
  for (const [f, s] of Object.entries(nt)) {
    const miss = required.filter(([, re]) => !re.test(s)).map(([n]) => n);
    t(`N3 ${f} の告知に必要な事項がすべてある（${required.length}項目）`, miss.length === 0, miss);
  }
  const keys = Object.keys(tr).filter((k) => k.startsWith("store_account_legal_notice_"));
  const ja_ = keys.map((k) => tr[k].ja).join(" "), en_ = keys.map((k) => tr[k].en).join(" ");
  t("N4 店舗アカウントの画面の告知：日本語に必要な事項がすべてある", required.every(([, re]) => re.test(ja_)), required.filter(([, re]) => !re.test(ja_)).map(([n]) => n));
  t("N5 店舗アカウントの画面の告知：英語の文があり、日本語が混ざらない・日付も英語の書き方", keys.length === 11 && keys.every((k) => tr[k].en && !/[぀-ヿ一-鿿]/.test(tr[k].en)) && /November 7, 2026/.test(en_) && /October 30, 2026/.test(en_) && /November 6, 2026/.test(en_), keys.filter((k) => !tr[k].en || /[぀-ヿ一-鿿]/.test(tr[k].en)));
  t("N6 店舗アカウントの画面の告知は、ログイン前も後も見える場所（ログイン・登録・アカウントの各欄の外）", ACC.indexOf('data-legal-notice="step47"') > 0 && ACC.indexOf('data-legal-notice="step47"') < ACC.indexOf('id="loginView"'));
  for (const f of [...PAGES, "translations.js"]) {
    const stripped = stripNotice(FILES[f]);
    t(`N7 ${f}：告知を外すと現行の版と1文字も違わない（現行の条文・画面は施行日まで変えない）`, stripped !== null && sha(stripped) === CURRENT_SHA256[f], stripped && sha(stripped));
  }
  const termsBody = text(stripNotice(FILES["terms.html"]));
  t("N8 利用規約の本文の最終更新日は現行のまま（2026年10月25日）・告知に最終更新日の変更を書いていない", /最終更新日：2026年10月25日/.test(termsBody) && !/最終更新日/.test(nt["terms.html"]));
  const details = text((noticeOf(FILES["terms.html"]).match(/<details>[\s\S]*?<\/details>/) || [""])[0]);
  t("N9 利用規約の告知に、改定後の条文（12条の全文・13条4〜11・14条6・15条4）を載せる", (noticeOf(FILES["terms.html"]).match(/<li>/g) || []).length === 5 + 4 + 8 + 1 + 1 && /運営の業務に使用するアカウントは、店舗アカウントの画面から退会することはできません/.test(details) && /決済代行会社における顧客の識別子と過去の決済の記録/.test(details) && /運営が確認するまで再び掲載しません/.test(details));
  const art12 = (details.match(/12\. 規約の変更（全文を次のとおり改めます）(.*?)13\. 店舗アカウント/) || ["", ""])[1];
  t("N13 12条の改定案：民法548条の4の2つの場合・変更の内容と施行日を定めて施行日より前に周知・施行日から効力・個別の同意が必要な変更は周知だけで同意とみなさない・「事前の通知なく」を使わない",
    /民法第548条の4/.test(art12) && /利用者の一般の利益に適合するとき/.test(art12) && /変更の必要性、変更後の内容の相当性その他の変更に係る事情に照らして合理的なもの/.test(art12) && /変更後の規約の内容と、その効力が生じる日（以下「施行日」といいます）を定め、施行日より前の相当な期間に/.test(art12) && /施行日から効力を生じます。施行日の前日までは、変更前の規約が適用されます/.test(art12) && /個別の同意が必要となる変更については、第2項による周知だけで同意を得たものとは扱わず/.test(art12) && !/事前の通知なく|掲載された時点から効力/.test(art12), art12.slice(0, 80));
  const LEAD_12_13 = /利用規約の変更の手続き（12条）とプライバシーポリシーの変更の手続き（13）を改めます/;
  t("N14 告知の導入文で12条・ポリシー13の改定も知らせる（4ページ・日英）", Object.values(nt).every((s) => LEAD_12_13.test(s)) && LEAD_12_13.test(tr.store_account_legal_notice_lead.ja) && /Article 12/.test(tr.store_account_legal_notice_lead.en) && /Privacy Policy \(Section 13\)/.test(tr.store_account_legal_notice_lead.en));
  const pDetails = text((noticeOf(FILES["privacy.html"]).match(/<details>[\s\S]*?<\/details>/) || [""])[0]);
  const sec13 = (pDetails.match(/13\. ポリシーの変更（全文を次のとおり改めます）(.*?)このほかの内容は変わりません/) || ["", ""])[1];
  t("N15 ポリシー13の改定案：変更の内容と施行日を定めて施行日より前に周知・施行日から適用・前日までは変更前・同意が必要な変更は周知だけで同意とみなさない・「掲載された時点から」を使わない",
    (sec13.match(/。/g) || []).length >= 4 && /変更後の内容と、その適用を開始する日（以下「施行日」といいます）を定め、施行日より前の相当な期間に/.test(sec13) && /変更後の本ポリシーは、施行日から適用します。施行日の前日までは、変更前の本ポリシーが適用されます/.test(sec13) && /ご本人の同意が必要となる変更については、第2項の周知だけで同意を得たものとは扱わず/.test(sec13) && !/掲載された時点から効力/.test(sec13), sec13.slice(0, 80));
  t("N16 告知の期間中、ポリシー13の本文は現行のまま（掲載された時点から効力）", /本ポリシーの内容は、必要に応じて変更されることがあります。変更後の内容は、本ページに掲載された時点から効力を生じます。/.test(text(stripNotice(FILES["privacy.html"]))));
  t("N10 プライバシーポリシーの告知に、改定後の8・11の全文を載せる（削除する情報・保存する記録・期間・Stripe・お問い合わせ）",
    /ログインの情報（メールアドレス等）、登録したクレジットカードの情報/.test(pDetails) && /請求・取引の記録.*原則として7年間/.test(pDetails) && /退会の手続きの記録、お店・施設の登録と引き継ぎの記録（メールアドレスは含みません）：原則として5年間/.test(pDetails) && /決済代行会社（Stripe）が保有する決済の記録/.test(pDetails) && /ご自身で退会（削除）を申し込むこともできます/.test(pDetails));
  t("N10b 保存の方針：法令の定めを優先・延長は対応に必要な記録に限る・お問い合わせの記録は一律には削除せず必要な期間に限って保存し、その後削除（無期限の保存を書かない）",
    /法令に保存の期間の定めがある記録は、その定めに従います/.test(pDetails) && /その対応に必要な記録に限り、対応が終わるまで/.test(pDetails) && /退会の際に一律には削除せず、お問い合わせへの対応や法令の遵守等に必要な期間に限って保存し、その後、運営が確認のうえ削除します/.test(pDetails) && !/無期限|永久|削除されません/.test(pDetails));
  const all = Object.values(nt).join(" ") + " " + ja_;
  t("N11 法令上の保存期間を断定しない（年数は「原則として」の運営の方針として書き、法律名・「法律で〇年」と書かない）", !/(法律|法令)(で|により|上)[^。]{0,12}\d+年/.test(all) && !/所得税法|電子帳簿保存法|民法第166条/.test(text(FILES["privacy.html"]) + text(FILES["terms.html"])) && (all.match(/\d+年間/g) || []).length === (all.match(/原則として\d+年間/g) || []).length);
  t("N12 未公開のプランの名前（月額・カスタマイズ）を出さない", !/月額|カスタマイズ/.test(all));
} else {
  // ===================== L: launch line =====================
  t("L0 施行日の版：告知はどこにも残っていない（4ページ・翻訳・CSS）", ![...PAGES, "translations.js"].some((f) => /LEGAL-NOTICE|legal-change-notice|store_account_legal_notice_/.test(FILES[f])));
  t("L1 施行日の版：退会の機能を含む・本番の自動削除は OFF", FEATURE_SHIPPED && /mode === "storeAccountDelete"|"storeAccountDelete"/.test(MS) && ACC.includes("accountDeletionSection") && flag("api/_lib/store-account-deletion.js", "ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED") === "false");
  const T = FILES["terms.html"], P = FILES["privacy.html"];
  t("L2 利用規約・プライバシーポリシーの最終更新日は施行日", T.includes(`最終更新日：${ja(SCHEDULE.effective)}`) && P.includes(`最終更新日：${ja(SCHEDULE.effective)}`));
  const olCount = (h2) => { const i = T.indexOf("<h2>" + h2); const s = T.slice(i, T.indexOf("</ol>", i)); return (s.match(/<li>/g) || []).length; };
  t("L3 利用規約：12条は4項目・13条は11項目・14条は6項目・15条は4項目", olCount("12. ") === 4 && olCount("13. ") === 11 && olCount("14. ") === 6 && olCount("15. ") === 4, [olCount("12. "), olCount("13. "), olCount("14. "), olCount("15. ")]);
  const terms = text(T), priv = text(P);
  const sec12 = terms.slice(terms.indexOf("12. 規約の変更"), terms.indexOf("13. 店舗アカウント"));
  t("L7 利用規約12：新しい文（548条の4・施行日の前に周知・個別の同意）に置き換わり、旧文（事前の通知なく・掲載された時点から）は残っていない", /民法第548条の4/.test(sec12) && /施行日より前の相当な期間に/.test(sec12) && /第2項による周知だけで同意を得たものとは扱わず/.test(sec12) && !/事前の通知なく本規約を変更|掲載された時点から効力/.test(terms));
  t("L4 利用規約：退会・清算待ち・取り消し・削除の内容・記録の保存・運営アカウントの例外・Stripe の顧客の識別子・引き継ぎの扱い",
    /店舗アカウントの削除（以下「退会」といいます）を申し込むことができます/.test(terms) && /その請求とお支払いが済んでから、店舗アカウントを削除します/.test(terms) && /退会の申し込みを取り消すことができます/.test(terms) && /削除した店舗アカウントは元に戻せません/.test(terms) && /運営の業務に使用するアカウントは、店舗アカウントの画面から退会することはできません/.test(terms) && /決済代行会社における顧客の識別子と過去の決済の記録/.test(terms) && /運営が確認するまで再び掲載しません/.test(terms));
  const sec8 = priv.slice(priv.indexOf("8. 情報の保存期間"), priv.indexOf("9. 情報の第三者提供"));
  t("L5 プライバシーポリシー8：削除する情報・保存する記録と期間（原則7年・原則5年・対応中は延長）・Stripe・お問い合わせ", /ログインの情報（メールアドレス等）/.test(sec8) && /原則として7年間/.test(sec8) && /原則として5年間/.test(sec8) && /対応が終わるまで保存することがあります/.test(sec8) && /Stripe/.test(sec8) && /お問い合わせの記録として取り扱い/.test(sec8) && /24時間後を有効期限/.test(sec8));
  t("L6 プライバシーポリシー11：画面から自分で退会できる", /ご自身で退会（削除）を申し込むこともできます/.test(priv.slice(priv.indexOf("11. 開示等のご請求"))));
  const p13 = P.slice(P.indexOf("<h2>13. "), P.indexOf("class=\"back-link\"", P.indexOf("<h2>13. ")));
  t("L8 プライバシーポリシー13：4項目の新しい文（施行日の前に周知・施行日から適用・同意が必要な変更）に置き換わり、旧文は残っていない", (p13.match(/<li>/g) || []).length === 4 && /施行日より前の相当な期間に/.test(p13) && /施行日から適用します/.test(p13) && /第2項の周知だけで同意を得たものとは扱わず/.test(p13) && !/掲載された時点から効力/.test(priv));
}

// ===================== B: browser =====================
const server = await serve(REPO_ROOT + "", 8875);
const browser = await launchChrome();
const apiMock = async (url, method, log) => (method !== "GET" && log.posts.push(url.slice(ORIGIN.length)), { status: 200, body: method === "GET" ? { success: true, stores: [], suppressedListingIds: [], claimedListingIds: [], listingClaimOpen: false, articles: [] } : { success: false, message: "blocked in local test" } });
const langInit = (lang) => `try{ if (window.top===window && !sessionStorage.getItem("__l")) { sessionStorage.setItem("__l","1"); localStorage.setItem("machinauLanguage", "${lang}"); } }catch(e){}`;
try {
  for (const page of PAGES) {
    for (const [w, mobile, label, lang] of [[360, true, "スマートフォン（360px）", "ja"], [1280, false, "PC", "ja"], ...(page === "store-account.html" ? [[390, true, "スマートフォン・英語", "en"]] : [])]) {
      const p = await openPage(browser, { origin: ORIGIN, width: w, mobile, state: { apiMock, articles: [], initScripts: [langInit(lang)] } });
      await p.goto("/" + page); await sleep(page === "store-account.html" ? 1500 : 400);
      const L = await p.ev(`(() => { const n = document.querySelector('[data-legal-notice="step47"]'); const r = n && n.getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, w: window.innerWidth, shown: !!(n && r.height > 40 && getComputedStyle(n).display !== "none"), text: n ? n.innerText : "" }; })()`);
      if (HAS_NOTICE) {
        const textOk = lang === "en" ? /November 7, 2026/.test(L.text) && !/[぀-ヿ一-鿿]/.test(L.text.replace(/利用規約|プライバシーポリシー/g, "")) : new RegExp("施行予定日：" + ja(SCHEDULE.effective)).test(L.text);
        t(`B ${page}・${label}：告知が見える・文言が入っている・横にはみ出さない・JSエラーなし`, L.shown && textOk && L.sw <= L.w && p.log.errors.length === 0, { L: { ...L, text: L.text.slice(0, 120) }, errors: p.log.errors });
        if (mobile) await p.screenshot(join(SHOTS_DIR, `legal-notice-${page.replace(".html", "")}-${lang}-${w}.png`));
      } else {
        t(`B ${page}・${label}：告知は出ない・横にはみ出さない・JSエラーなし`, !L.shown && L.sw <= L.w && p.log.errors.length === 0, { L, errors: p.log.errors });
      }
      t(`B ${page}・${label}：本番のサーバーへ書き込みの要求を送っていない`, !p.log.posts.length, p.log.posts);
      await p.close();
    }
  }
} finally {
  browser.close(); server.close();
}

console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
