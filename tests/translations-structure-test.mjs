// translations.js の構造テスト（2026-11-23 追加）
// 検証で見つかった不具合の再発防止：
// - キーの値の中に別のキーが入れ子になっていると、そのキーは画面で空白になる
//   （getMachinauTranslation はトップレベルのキーしか引けない）。
// - "zh-TW" ではなく "zh" と書くと繁体字で引けない。
// - HTML の data-i18n キーが辞書に無いと、applyLanguage が文言を空白で上書きする。
// run: node tests/translations-structure-test.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 400) : ""}`); };

const src = read("translations.js") + "\n;globalThis.__T = MACHINAU_TRANSLATIONS;";
const ctx = { console };
ctx.window = ctx;
ctx.document = { documentElement: {} };
ctx.localStorage = { getItem: () => null, setItem: () => {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const T = ctx.__T;
const LANGS = ["ja", "en", "zh-TW"];

t("S0 辞書が読み込める", !!T && Object.keys(T).length > 1000, Object.keys(T || {}).length);

const nested = [], shorthand = [], absent = [];
for (const [key, value] of Object.entries(T)) {
  if (!value || typeof value !== "object") { absent.push(key + ":not-object"); continue; }
  for (const prop of Object.keys(value)) {
    if (typeof value[prop] === "object") nested.push(key + ">" + prop);
  }
  if ("zh" in value) shorthand.push(key);
  for (const lang of LANGS) if (!(lang in value)) absent.push(key + ":" + lang);
}
t("S1 入れ子になったキーが無い", nested.length === 0, nested.slice(0, 10));
t("S2 zh と短縮表記したキーが無い（zh-TW が正）", shorthand.length === 0, shorthand.slice(0, 10));
t("S3 全キーに ja / en / zh-TW の3言語が存在する", absent.length === 0, absent.slice(0, 10));

for (const page of ["store-account.html", "imadake-post.html", "store-profile.html", "index.html", "shop.html"]) {
  const html = read(page);
  const keys = [...new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]))];
  const missing = keys.filter((k) => !(k in T));
  t(`S4 ${page} の data-i18n キーがすべて辞書にある (${keys.length}件)`, missing.length === 0, missing.slice(0, 10));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
