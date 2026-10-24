// STEP 44-C⑥: the Preview-only manual job in .github/workflows/main.yml (this branch's copy). Checks the job conditions
// for every trigger/branch, and runs the REAL shell steps of the job in bash with stub `gh` and `curl` commands to prove:
// it stops before sending the secret unless the workflow file is this branch's version at the run commit, the commit has a
// successful Preview deployment with a vercel.app URL of the expected shape, and that URL reports machinau-preview; the
// secret only goes to that verified URL and never appears in the output. No network, fake secret.
// run: node tests/workflow-preview-plan-cron-test.mjs
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./_paths.mjs";

let pass = 0, fail = 0;
const t = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${!ok ? " :: " + JSON.stringify(d).slice(0, 600) : ""}`); };
const yml = readFileSync(join(REPO_ROOT, ".github/workflows/main.yml"), "utf8").replace(/\r\n/g, "\n");

// ---- tiny extraction of the jobs we care about (2-space job keys under "jobs:") ----
const jobsText = yml.slice(yml.indexOf("\njobs:\n") + 7);
const jobBlocks = {};
let current = null;
for (const line of jobsText.split("\n")) {
  const m = /^  ([a-z-]+):\s*$/.exec(line);
  if (m) { current = m[1]; jobBlocks[current] = []; continue; }
  if (current) jobBlocks[current].push(line);
}
const jobIf = (name) => ((jobBlocks[name] || []).map((l) => /^    if: (.+)$/.exec(l)).find(Boolean) || [])[1] || "";
const evalIf = (expr, ctx) => {
  if (expr.trim().startsWith("false")) return false;
  const js = expr.replace(/#.*$/, "").replace(/github\.event_name/g, JSON.stringify(ctx.event)).replace(/github\.ref/g, JSON.stringify(ctx.ref)).replace(/==/g, "===").replace(/'/g, '"');
  return Function("return (" + js + ");")();
};
// run blocks of a job, in order
const runBlocks = (name) => {
  const lines = jobBlocks[name] || [];
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^        run: \|\s*$/.test(lines[i])) {
      const body = [];
      for (i = i + 1; i < lines.length && (lines[i].startsWith("          ") || lines[i].trim() === ""); i++) body.push(lines[i].slice(10));
      blocks.push(body.join("\n")); i--;
    }
  }
  return blocks;
};

// ===================== job conditions =====================
t("W0 ジョブは expire・collect-sources・preview-plan-cron の3つ（既存の2つはそのまま）", JSON.stringify(Object.keys(jobBlocks)) === JSON.stringify(["expire", "collect-sources", "preview-plan-cron"]), Object.keys(jobBlocks));
const matrix = [
  { name: "定期実行（GitHub は main の版を使う）", ctx: { event: "schedule", ref: "refs/heads/main" }, expire: true, preview: false },
  { name: "main での手動実行", ctx: { event: "workflow_dispatch", ref: "refs/heads/main" }, expire: true, preview: false },
  { name: "preview/stripe-card-setup での手動実行", ctx: { event: "workflow_dispatch", ref: "refs/heads/preview/stripe-card-setup" }, expire: false, preview: true },
  { name: "ほかのブランチでの手動実行", ctx: { event: "workflow_dispatch", ref: "refs/heads/preview/store-custom-plan" }, expire: false, preview: false }
];
for (const row of matrix) {
  const e = evalIf(jobIf("expire"), row.ctx), p = evalIf(jobIf("preview-plan-cron"), row.ctx), c = evalIf(jobIf("collect-sources"), row.ctx);
  t("C " + row.name + "：本番の掲載期限 " + (row.expire ? "実行" : "なし") + "・Preview の締め " + (row.preview ? "実行" : "なし") + "・収集は停止のまま", e === row.expire && p === row.preview && c === false, { e, p, c });
}
const mainYml = spawnSync("git", ["-C", REPO_ROOT, "show", "origin/main:.github/workflows/main.yml"], { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).stdout.replace(/\r\n/g, "\n");
const expireSteps = (text) => text.slice(text.indexOf("  expire:"), text.indexOf("  collect-sources:")).split("\n").filter((l) => !/^\s*(#|if:)/.test(l)).join("\n");
t("M1 本番の掲載期限のジョブの処理（URL・合言葉の見出し・30分ごと）は main の版と同じ（このブランチで足したのは条件とコメントだけ）", mainYml.includes("cron: \"*/30 * * * *\"") && expireSteps(yml) === expireSteps(mainYml) && /\n  workflow_dispatch:\n/.test(yml), { here: expireSteps(yml), main: expireSteps(mainYml) });
t("M2 main の版にはこの変更が無い（Production の workflow は変更しない）", !mainYml.includes("preview-plan-cron") && !mainYml.includes("STEP 44"));
const previewBlocks = runBlocks("preview-plan-cron");
t("M3 Preview のジョブの処理は2手順・コマンドの中に GitHub の式（${{ }}）を直接書かない（値は env だけで渡す）", previewBlocks.length === 2 && previewBlocks.every((b) => !b.includes("${{")), previewBlocks.map((b) => b.slice(0, 80)));
const previewText = (jobBlocks["preview-plan-cron"] || []).join("\n");
t("M4 権限は読み取りだけ（contents・deployments）", /permissions:\n      contents: read\n      deployments: read/.test(previewText));

// ===================== run the real steps with stub gh / curl =====================
const work = mkdtempSync(join(tmpdir(), "mn-wf-"));
const bin = join(work, "bin");
spawnSync("mkdir", ["-p", bin]);
const writeStub = (name, body) => { const p = join(bin, name); writeFileSync(p, "#!/usr/bin/env bash\n" + body + "\n"); chmodSync(p, 0o755); };
writeStub("gh", `
echo "gh $*" >> "$STUB_LOG"
case "$*" in
  *"/deployments?sha="*) printf '%s' "$MOCK_DEPLOYMENT_ID" ;;
  *"/statuses"*) printf '%s' "$MOCK_STATUS_JSON" ;;
  *) exit 1 ;;
esac`);
writeStub("curl", `
args="$*"
out=""; prev=""
for a in "$@"; do if [ "$prev" = "-o" ]; then out="$a"; fi; prev="$a"; done
echo "curl $args" >> "$STUB_LOG"
case "$args" in
  *"mode=firebaseTarget"*) if [ "$MOCK_TARGET_FAIL" = "1" ]; then exit 22; fi; printf '%s' "$MOCK_TARGET_JSON" ;;
  *"-X POST"*) printf '%s' "$MOCK_CRON_RESPONSE" > "$out"; printf '%s' "$MOCK_CRON_CODE" ;;
  *) exit 1 ;;
esac`);
const SHA = "a".repeat(40);
const SECRET = "fake-" + "workflow-secret-0001";
const GOOD_URL = "https://imamiru-abc123xyz-9413yutaka-hashs-projects.vercel.app";
const baseEnv = {
  GH_TOKEN: "fake-token", REPO: "9413yutaka-hash/imamiru-web", RUN_SHA: SHA, WORKFLOW_SHA: SHA,
  WORKFLOW_REF: "9413yutaka-hash/imamiru-web/.github/workflows/main.yml@refs/heads/preview/stripe-card-setup",
  MOCK_DEPLOYMENT_ID: "12345", MOCK_STATUS_JSON: JSON.stringify([{ state: "success", environment_url: GOOD_URL }]),
  MOCK_TARGET_JSON: JSON.stringify({ success: true, projectId: "machinau-preview", enforced: true }), MOCK_TARGET_FAIL: "0"
};
function runStep(index, env) {
  const log = join(work, "log-" + Math.random().toString(36).slice(2));
  const out = join(work, "out-" + Math.random().toString(36).slice(2));
  writeFileSync(log, ""); writeFileSync(out, "");
  const r = spawnSync("bash", ["-c", previewBlocks[index]], { cwd: work, encoding: "utf8", env: { ...process.env, PATH: bin + (process.platform === "win32" ? ";" : ":") + process.env.PATH, ...env, STUB_LOG: log, GITHUB_OUTPUT: out } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, log: readFileSync(log, "utf8"), output: readFileSync(out, "utf8") };
}
const sentSecret = (r) => r.log.includes(SECRET);

let r = runStep(0, baseEnv);
t("S1 すべての確認を満たす：Preview の URL を出力（commit・接続先 machinau-preview を確認）", r.code === 0 && r.output.trim() === "url=" + GOOD_URL && /Verified Preview deployment/.test(r.stdout), r);
const stopCases = [
  ["S2 workflow のファイルが main の版（選んだブランチの版が使われていない）", { WORKFLOW_REF: "9413yutaka-hash/imamiru-web/.github/workflows/main.yml@refs/heads/main" }, false],
  ["S3 workflow のファイルの commit が実行の commit と違う", { WORKFLOW_SHA: "b".repeat(40) }, false],
  ["S4 workflow のファイルの commit が空", { WORKFLOW_SHA: "" }, false],
  ["S5 この commit の Preview のデプロイが無い", { MOCK_DEPLOYMENT_ID: "" }, true],
  ["S6 デプロイの状態が success ではない", { MOCK_STATUS_JSON: JSON.stringify([{ state: "failure", environment_url: GOOD_URL }]) }, true],
  ["S7 URL が本番（machinau.jp）", { MOCK_STATUS_JSON: JSON.stringify([{ state: "success", environment_url: "https://machinau.jp" }]) }, true],
  ["S8 URL が別のホスト（imamiru-web.vercel.app）", { MOCK_STATUS_JSON: JSON.stringify([{ state: "success", environment_url: "https://imamiru-web.vercel.app" }]) }, true],
  ["S9 URL の後ろに別のホスト（…vercel.app.evil.example）", { MOCK_STATUS_JSON: JSON.stringify([{ state: "success", environment_url: GOOD_URL + ".evil.example" }]) }, true],
  ["S10 接続先が本番の Firebase（chikashoku-app）", { MOCK_TARGET_JSON: JSON.stringify({ success: true, projectId: "chikashoku-app", enforced: false }) }, true],
  ["S10b 接続先が本番の Firebase（検査ありと名乗っても）", { MOCK_TARGET_JSON: JSON.stringify({ success: true, projectId: "chikashoku-app", enforced: true }) }, true],
  ["S11 接続先の検査が無効（enforced false）", { MOCK_TARGET_JSON: JSON.stringify({ success: true, projectId: "machinau-preview", enforced: false }) }, true],
  ["S12 接続先の確認に失敗（HTTP エラー）", { MOCK_TARGET_FAIL: "1" }, true]
];
for (const [name, extra, mayCallGh] of stopCases) {
  r = runStep(0, { ...baseEnv, ...extra });
  t(name + "：STOP・URL を出力しない・合言葉の手順に進めない" + (mayCallGh ? "" : "・GitHub にも問い合わせない"), r.code !== 0 && r.output.trim() === "" && /STOP|curl/.test(r.stdout + r.stderr + r.log) && (mayCallGh || r.log === ""), { code: r.code, out: r.output, stdout: r.stdout.slice(0, 200), log: r.log.slice(0, 200) });
}
t("S13 接続先の確認の時点では合言葉を送らない（1つ目の手順は合言葉を持たない）", !previewBlocks[0].includes("CRON_SECRET") && !sentSecret(runStep(0, baseEnv)));

// step 2
r = runStep(1, { CRON_SECRET: SECRET, PREVIEW_URL: GOOD_URL, MOCK_CRON_CODE: "200", MOCK_CRON_RESPONSE: JSON.stringify({ success: true, status: "completed", jstDate: "2026-11-01", closeMonth: "2026-10", errors: [], steps: { close: { status: "done", invoices: { create: 1 } }, dunning: { status: "done" }, charges: { status: "done", executed: false, blockedReason: "cron_charges_disabled", totals: { chargeCount: 0 } } } }) });
const posts = r.log.split("\n").filter((l) => l.includes("-X POST"));
t("R1 確認済みの Preview の URL へだけ POST（mode storeCustomPlanCron・合言葉の見出し）・1回だけ", r.code === 0 && posts.length === 1 && posts[0].includes(GOOD_URL + "/api/moderate-submission") && posts[0].includes("X-Machinau-Cron-Secret: " + SECRET) && posts[0].includes('{"mode":"storeCustomPlanCron"}'), { code: r.code, posts });
t("R2 結果の要約を表示（締めの件数・請求は実行しない）・合言葉は表示しない", /"closeMonth": "2026-10"/.test(r.stdout) && /"executed": false/.test(r.stdout) && !(r.stdout + r.stderr).includes(SECRET), r.stdout.slice(0, 300));
t("R3 応答のファイルは消す", !existsSync(join(work, "response.json")));
r = runStep(1, { CRON_SECRET: SECRET, PREVIEW_URL: GOOD_URL, MOCK_CRON_CODE: "401", MOCK_CRON_RESPONSE: JSON.stringify({ success: false, reason: "unauthorized" }) });
t("R4 401（Preview の合言葉が違う）：失敗として終わる・合言葉は表示しない", r.code !== 0 && /HTTP 401/.test(r.stdout) && /unauthorized/.test(r.stdout) && !(r.stdout + r.stderr).includes(SECRET), r.stdout);
r = runStep(1, { CRON_SECRET: SECRET, PREVIEW_URL: "", MOCK_CRON_CODE: "200", MOCK_CRON_RESPONSE: "{}" });
t("R5 確認済みの URL が無い：STOP・送らない", r.code !== 0 && !sentSecret(r) && /STOP/.test(r.stdout), r);
r = runStep(1, { CRON_SECRET: "", PREVIEW_URL: GOOD_URL, MOCK_CRON_CODE: "200", MOCK_CRON_RESPONSE: "{}" });
t("R6 合言葉が無い：STOP・送らない", r.code !== 0 && r.log === "" && /STOP/.test(r.stdout), r);

rmSync(work, { recursive: true, force: true });
console.log(`TOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
