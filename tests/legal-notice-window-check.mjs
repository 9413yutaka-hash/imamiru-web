// STEP 47-H: read-only check of the advance notice period before the launch (not part of the test run).
// 1. The live pages on machinau.jp show the notice with the expected dates (public GET only).
// 2. The Production deployment of the notice commit (GitHub deployment statuses) succeeded, and the posting day (JST)
//    is at least 8 days before the effective date (7 full days after the posting day).
// 3. Whether the effective date (JST) has come.
// Nothing is written anywhere. Needs the gh CLI to read the deployments of the public repository.
// run: node tests/legal-notice-window-check.mjs <notice commit sha> [start YYYY-MM-DD] [effective YYYY-MM-DD]
import { execFileSync } from "node:child_process";

const [sha, start = "2026-10-30", effective = "2026-11-07"] = process.argv.slice(2);
if (!/^[0-9a-f]{7,40}$/.test(sha || "")) {
  console.log("usage: node tests/legal-notice-window-check.mjs <notice commit sha> [start] [effective]");
  process.exit(2);
}
const REPO = "9413yutaka-hash/imamiru-web";
const DAY = 86400000;
const jstDate = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const utcDay = (d) => Date.parse(d + "T00:00:00Z");
let ok = true;
const line = (good, msg) => { if (!good) ok = false; console.log(`${good ? "OK  " : "NG  "} ${msg}`); };

for (const page of ["terms.html", "privacy.html", "shop-guide.html", "store-account.html"]) {
  const r = await fetch("https://machinau.jp/" + page, { headers: { "cache-control": "no-cache" } });
  const html = await r.text();
  const m = html.match(/data-legal-notice="step47" data-notice-start="([\d-]+)" data-effective="([\d-]+)"/);
  line(r.status === 200 && m && m[1] === start && m[2] === effective, `${page}: ${r.status} ${m ? "notice " + m[1] + " → " + m[2] : "no notice"}`);
}

const gh = (path) => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
const deployments = gh(`repos/${REPO}/deployments?sha=${sha}&per_page=20`).filter((d) => /production/i.test(d.environment));
let postedAt = null;
for (const d of deployments) {
  const success = gh(`repos/${REPO}/deployments/${d.id}/statuses`).filter((s) => s.state === "success").map((s) => Date.parse(s.created_at)).sort()[0];
  if (success && (!postedAt || success < postedAt)) postedAt = success;
}
line(!!postedAt, `Production deployment of ${sha}: ${postedAt ? new Date(postedAt).toISOString() + " (JST " + jstDate(postedAt) + ")" : "not found"}`);
if (postedAt) {
  const days = Math.round((utcDay(effective) - utcDay(jstDate(postedAt))) / DAY);
  line(days >= 8, `posting day ${jstDate(postedAt)} → effective ${effective}: ${days} days (needs 8 or more = 7 full days after the posting day)`);
}
const today = jstDate(Date.now());
console.log(`     today (JST) ${today}: ${today >= effective ? "the effective date has come" : "before the effective date — do not launch yet"}`);
console.log("     Also confirm that Production was not rolled back to a deployment without the notice during the period (Vercel deployment history).");
process.exit(ok ? 0 : 1);
