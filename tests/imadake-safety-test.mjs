// Imadake safety review hardening: real handleImadakePostCreate + real shared matchesSafetyCriticalKeywords,
// mocked Moderation (safe / flagged / error) and in-memory Firestore. No network, no real posts.
import { REPO_ROOT, TEST_DIR } from "./_paths.mjs";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const SP = TEST_DIR + "";
const harness = readFileSync(SP + "/imadake-store-login-test.mjs", "utf8").split("// ---------- 1.")[0];
const tmp = SP + "/_safety_harness.mjs";
const { writeFileSync } = await import("node:fs");
writeFileSync(tmp, harness + "\nexport { IM, makeDb, seedAll, deps, op, quiet };\n");
const H = await import(pathToFileURL(tmp).href + "?v=" + Date.now());
const M = await import(pathToFileURL(REPO_ROOT + "/api/moderate-submission.js").href);
const { IM, makeDb, seedAll, deps, op, quiet } = H;

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail !== "" ? " :: " + JSON.stringify(detail).slice(0, 500) : ""}`); };

// one create on a fresh store with the REAL shared keyword function.
// STEP 43-B: the old token store (method A) was removed; posts are created by the logged-in owner of "self1" (method B).
async function create(fields, o = {}) {
  const m = makeDb(); seedAll(m);
  if (o.storeName) { const a = m.get("storeAccounts", "self1"); a.storeName = o.storeName; m.seed("storeAccounts", "self1", a); }
  const d = deps(m, { flagged: !!o.flagged });
  d.matchesSafetyCriticalKeywords = M.matchesSafetyCriticalKeywords;
  if (o.moderationError) d.callOpenAiModeration = async () => { throw new Error("openai down"); };
  const r = await quiet(() => op(m, d, "create", { storeId: "self1", ...fields }, "u1tok"));
  const id = r.body && (r.body.postId || (r.body.post && r.body.post.postId));
  return { code: r.code, status: r.body && r.body.status, body: r.body, post: id ? m.get("imadakePosts", id) : null, posts: [...m.store.keys()].filter((k) => k.startsWith("imadakePosts/")).length };
}
const H1 = (headline, extra = {}) => { if (Array.from(headline).length > 40) throw new Error("headline over 40: " + headline); return create({ headline, body: "", ...extra }); };

// ---------- English 30 expressions ----------
const EN30 = ["Typhoon approaching", "typhoon", "Storm warning", "Tsunami warning", "TSUNAMI", "Earthquake", "earthquakes", "Flood", "flooding", "Landslide", "Fire", "fire alarm", "Explosion", "Accident on Route 58", "Road closure", "Road closed", "Evacuation order", "Evacuate now", "Emergency", "Power outage", "Blackout", "Water outage", "No running water", "Missing person", "Rescue", "Flight cancellation", "Flights cancelled", "Train suspension", "Trains suspended", "Bus service suspended"];
const enRes = [];
for (const s of EN30) enRes.push([s, (await H1(s)).status]);
t("EN: all 30 expressions -> pending (運営確認待ち)", enRes.every((x) => x[1] === "pending"), enRes.filter((x) => x[1] !== "pending"));
// sentences / plurals / case
const EN_SENT = ["We are closed today because of the typhoon.", "STORMS expected tonight, please stay safe", "Ferry services are suspended until further notice", "All flights to Ishigaki were cancelled", "Monorail not running due to power failure", "Heavy rain alert for Naha", "Volcano eruption reported", "Missing hikers near the falls", "Road blocked after a car crash", "Evacuation centers are open"];
const sentRes = []; for (const s of EN_SENT) sentRes.push([s, (await create({ headline: "Notice", body: s })).status]);
t("EN sentences (case, plural, inside text, paraphrase): all pending", sentRes.every((x) => x[1] === "pending"), sentRes.filter((x) => x[1] !== "pending"));

// ---------- Japanese ----------
const JA_ADD = ["洪水", "噴火", "運転見合わせ", "交通規制", "爆発", "救助", "大雨", "竜巻", "落雷", "ツナミ", "つなみ", "全面通行止", "ﾂﾅﾐ（半角）", "火事", "冠水"];
const jaRes = []; for (const s of JA_ADD) jaRes.push([s, (await H1(s + "のため本日休業")).status]);
t("JA added expressions (incl. half-width ﾂﾅﾐ): all pending", jaRes.every((x) => x[1] === "pending"), jaRes.filter((x) => x[1] !== "pending"));
const JA16 = ["津波", "避難", "台風", "警報", "地震", "火災", "事故", "通行止め", "欠航", "運休", "土砂", "浸水", "停電", "断水", "行方不明", "遭難"];
const ja16 = []; for (const s of JA16) ja16.push([s, (await H1(s + "の情報")).status]);
t("JA existing 16 words: still pending (shared rule unchanged)", ja16.every((x) => x[1] === "pending"), ja16.filter((x) => x[1] !== "pending"));
let r = await create({ headline: "本日営業", body: "" }, { storeName: "台風食堂" });
t("JA shared rule still checks the shop name (existing behavior): 店名「台風食堂」-> pending", r.status === "pending", r.status);

// ---------- mixed / sourceLanguage independent ----------
const MIX = [["台風Typhoonのため臨時休業", "ja"], ["本日はStorm接近のため早仕舞い", "ja"], ["Today: 停電 in the area", "en"], ["ＴＹＰＨＯＯＮ（全角）", "ja"], ["Closed today (台風)", "en"]];
const mixRes = []; for (const [s, lang] of MIX) mixRes.push([s, lang, (await create({ headline: s, body: "", sourceLanguage: lang })).status]);
t("mixed JA/EN + full-width: pending regardless of sourceLanguage", mixRes.every((x) => x[2] === "pending"), mixRes);
r = await create({ headline: "Lunch special", body: "Ferry service suspended today, sorry", sourceLanguage: "ja" });
t("English danger in the BODY of a post marked ja -> pending", r.status === "pending");
r = await create({ headline: "本日のおすすめ", body: "", priceText: "Free water due to water outage" });
t("English danger in price text -> pending (price is checked)", r.status === "pending");
r = await create({ headline: "Live tonight", body: "", categoryCode: "event", categoryFields: { venue: "Evacuation center hall", feeText: "" } });
t("English danger in event venue -> pending (venue is checked)", r.status === "pending", r.body);

// ---------- normal posts stay auto-published ----------
const NORMAL = ["Seats available tonight", "Fresh bread just baked", "Live music at 7pm", "Only 6 tarts left", "Happy hour 5-7pm", "New arrivals today", "Cancellation slots available for dinner", "Fireworks viewing seats left", "Brainstorm workshop today", "Campfire night on the beach", "Cozy fireplace seats", "本日まだ空席あります", "タルト、あと6個です", "新作が入荷しました", "本日17時まで営業", "当日券あります", "Takeout available"];
const normRes = []; for (const s of NORMAL) normRes.push([s, (await H1(s)).status]);
t("normal posts (EN/JA, incl. fireworks/brainstorm/campfire/fireplace/cancellation slots): published", normRes.every((x) => x[1] === "published"), normRes.filter((x) => x[1] !== "published"));
r = await create({ headline: "Grilled steak lunch", body: "Open now" }, { storeName: "Fire Grill Okinawa" });
t("shop name 'Fire Grill Okinawa' with a normal post -> published (shop name not used by the new check)", r.status === "published", r.status);
r = await create({ headline: "Lunch", body: "", actionTargets: { websiteUrl: "https://example.com/fire" } });
t("URL fields are not part of the text check (as before) -> published", r.status === "published");

// ---------- accepted over-detection (documented) ----------
const OVER = ["Fire Grill special today", "Emergency exit next to the counter", "Rescue dog café open", "Storm Burger launch", "爆発的人気のタルト", "Lightning deal: 50% off", "Our lunch service is suspended today", "大雨でも楽しめる屋内アクティビティ"];
const overRes = []; for (const s of OVER) overRes.push([s, (await H1(s)).status]);
t("accepted over-detection examples go to pending (not rejected, not lost)", overRes.every((x) => x[1] === "pending"), overRes);
console.log("  over-detection examples:", overRes.map((x) => x[0] + "=" + x[1]).join(" | "));

// ---------- statuses / reason / Moderation ----------
r = await H1("Typhoon approaching");
t("pending keeps existing fields: moderationStatus REVIEW, same reason text, not published, no expiry", r.post && r.post.status === "pending" && r.post.moderationStatus === "REVIEW" && r.post.moderationReason === "安全・災害・交通に関する情報の可能性があるため、内容を人間が確認します。" && r.post.publishedAt === null && r.post.expiresAt === null, r.post && { s: r.post.status, m: r.post.moderationStatus, reason: r.post.moderationReason });
r = await H1("Seats available tonight");
t("published keeps existing fields: SAFE, publishedAt/expiresAt set", r.post && r.post.status === "published" && r.post.moderationStatus === "SAFE" && r.post.publishedAt && r.post.expiresAt);
r = await create({ headline: "Typhoon approaching", body: "" }, { flagged: true });
t("Moderation flagged -> rejected as before (even with danger words)", r.status === "rejected" && r.post.moderationStatus === "FLAGGED");
r = await create({ headline: "Seats available", body: "" }, { flagged: true });
t("Moderation flagged on a normal post -> rejected", r.status === "rejected");
r = await create({ headline: "Typhoon approaching", body: "" }, { moderationError: true });
t("Moderation API failure -> 503 safety_check_unavailable, nothing saved (fail closed)", r.code === 503 && r.body.reason === "safety_check_unavailable" && r.posts === 0, r);
t("exports: extra lists exist, shared list unchanged (16 words)", Array.isArray(IM.IMADAKE_EXTRA_SAFETY_KEYWORDS_JA) && IM.IMADAKE_EXTRA_SAFETY_PATTERNS_EN.length > 0 && M.SAFETY_CRITICAL_KEYWORDS.length === 16);
t("shared matchesSafetyCriticalKeywords unchanged: English still not matched by it", M.matchesSafetyCriticalKeywords({ shopName: "", title: "Typhoon", content: "" }) === false && M.matchesSafetyCriticalKeywords({ shopName: "", title: "台風", content: "" }) === true);
console.log(`\nTOTAL ${pass + fail}  PASS ${pass}  FAIL ${fail}`);
process.exit(0);
