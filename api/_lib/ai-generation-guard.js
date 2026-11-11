// OpenAI API安全対策 STEP 2-B(2026-11-11)｜「この街の情報」(cityInfo)と「今日の地域情報」(regionTodayInfo)の
// 新しい AI 生成だけを守る部品。保存済み(キャッシュ)の表示には一切かからない。
//   1. 地域名の正規化：実在する市区町村・都道府県の正式名(japan-municipalities と同じ)にそろえる。
//   2. 回数の制限：新しく生成する時だけ、1日(日本時間)の回数を「サービス全体・利用者(uid)・IP」で数える。
//      読み取りと加算を1つのトランザクションで行うため、同時に呼ばれても上限を超えない。
//   3. 緊急停止：Firestore の aiGenerationControl/settings(すぐ効く)または環境変数 AI_GENERATION_STOP(再デプロイで効く)。
//   4. 同じ地域の同時生成の防止(この街の情報)：生成中の印(aiGenerationLocks)。
// 回数の上限は利用実態を確認できていないため「仮の値」。本番への適用は代表の承認後(02_重要決定に記録すること)。
import { Timestamp } from "firebase-admin/firestore";
import { JAPAN_MUNICIPALITIES_BY_PREFECTURE } from "./japan-municipalities.js";
import { JAPAN_MUNICIPALITY_ROMAJI_BY_PREFECTURE } from "./japan-municipality-romaji.js";

export const AI_GENERATION_FEATURES = Object.freeze(["cityInfo", "regionTodayInfo"]);

// 仮の上限(1日・日本時間)。根拠は Obsidian「OpenAI API安全対策 STEP2-B」の記録を参照。
export const AI_GENERATION_DAILY_LIMITS = Object.freeze({
  cityInfo: Object.freeze({ global: 30, perUser: 3, perIp: 10 }),
  // overseasGlobal：今日の地域情報の海外の新しい生成だけの、サービス全体の1日の上限(2026-11-12 代表決定：5回)。
  // 海外の分は全体(60)にも数える。対象は都道府県コードにそろえられない呼び出し(place_id の鍵)＝海外と、
  // 都道府県名を読み取れない日本の呼び出し(同じ place_id の経路。国コードを JP と偽って海外の上限を避けられないように)。
  regionTodayInfo: Object.freeze({ global: 60, perUser: 5, perIp: 20, overseasGlobal: 5 })
});

export const AI_GENERATION_USAGE_COLLECTION = "aiGenerationUsage";
export const AI_GENERATION_CONTROL_COLLECTION = "aiGenerationControl";
export const AI_GENERATION_CONTROL_DOC_ID = "settings";
export const AI_GENERATION_LOCKS_COLLECTION = "aiGenerationLocks";
// 生成の待ち時間(この街の情報は60秒で打ち切り)より長くとる。これより古い「生成中」は終わったものとして扱う。
export const AI_GENERATION_LOCK_STALE_MS = 2 * 60 * 1000;
const AI_GENERATION_USAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const AI_GENERATION_STOP_ENV = "AI_GENERATION_STOP";
// Firestore の aiGenerationControl/settings で使う項目名(運営画面 admin-ai-generation.html の停止・再開で書き換える)。
export const AI_GENERATION_CONTROL_FIELDS = Object.freeze({
  all: "stopAll",
  cityInfo: "stopCityInfo",
  regionTodayInfo: "stopRegionTodayInfo"
});

// 環境変数 AI_GENERATION_STOP：「all」(または true・1)で全部、「cityInfo」「regionTodayInfo」(カンマ区切り)で機能ごと。
export function isAiGenerationStoppedByEnv(feature, env = process.env) {
  const raw = env && typeof env[AI_GENERATION_STOP_ENV] === "string" ? env[AI_GENERATION_STOP_ENV] : "";
  const parts = raw.split(",").map((part) => part.trim()).filter((part) => part !== "");
  return parts.some((part) => part === "all" || part === "true" || part === "1" || part === feature);
}

export function isAiGenerationStoppedByControl(data, feature) {
  if (!data || typeof data !== "object") return false;
  if (data[AI_GENERATION_CONTROL_FIELDS.all] === true) return true;
  const field = AI_GENERATION_CONTROL_FIELDS[feature];
  return typeof field === "string" && data[field] === true;
}

export function getJstDateKey(nowMs = Date.now()) {
  return new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// トランザクションの中で、停止・回数を確かめる(読み取りだけ)。許可する時は apply(transaction) で回数を1つ加える。
// gate = { feature, uidHash, ipHash, hashUnavailable, overseas }
//   overseas：true の時は、海外の専用の上限(limits.overseasGlobal)も同じトランザクションで確かめて数える。
//   hashUnavailable：利用者・IP の識別に使う秘密値が無い等で数えられない時は、生成しない(安全側)。
export async function evaluateAiGenerationGateInTransaction(transaction, database, gate) {
  const feature = gate && gate.feature;
  const limits = AI_GENERATION_DAILY_LIMITS[feature];
  if (!limits) return { outcome: "stopped", reason: "unknown_feature" };
  if (isAiGenerationStoppedByEnv(feature)) return { outcome: "stopped", reason: "env" };
  const controlSnapshot = await transaction.get(
    database.collection(AI_GENERATION_CONTROL_COLLECTION).doc(AI_GENERATION_CONTROL_DOC_ID)
  );
  if (isAiGenerationStoppedByControl(controlSnapshot.exists ? controlSnapshot.data() : null, feature)) {
    return { outcome: "stopped", reason: "control" };
  }
  if (gate.hashUnavailable === true) return { outcome: "stopped", reason: "identifier_unavailable" };
  const nowMs = Date.now();
  const date = getJstDateKey(nowMs);
  const scopes = [{ scope: "all", id: `${feature}_${date}_all`, limit: limits.global }];
  if (gate.overseas === true) {
    // 海外の専用の上限が決まっていない機能では、海外の生成をしない(安全側)。
    if (!Number.isInteger(limits.overseasGlobal)) return { outcome: "limited", scope: "overseas" };
    scopes.push({ scope: "overseas", id: `${feature}_${date}_overseas`, limit: limits.overseasGlobal });
  }
  if (typeof gate.uidHash === "string" && gate.uidHash !== "") {
    scopes.push({ scope: "user", id: `${feature}_${date}_u_${gate.uidHash}`, limit: limits.perUser });
  }
  if (typeof gate.ipHash === "string" && gate.ipHash !== "") {
    scopes.push({ scope: "ip", id: `${feature}_${date}_ip_${gate.ipHash}`, limit: limits.perIp });
  }
  const counted = [];
  for (const entry of scopes) {
    const ref = database.collection(AI_GENERATION_USAGE_COLLECTION).doc(entry.id);
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const count = Number.isFinite(Number(data.count)) ? Number(data.count) : 0;
    if (count >= entry.limit) return { outcome: "limited", scope: entry.scope };
    counted.push({ ref, entry, count });
  }
  return {
    outcome: "allowed",
    apply(tx) {
      for (const { ref, entry, count } of counted) {
        tx.set(ref, {
          feature,
          date,
          scope: entry.scope,
          count: count + 1,
          updatedAt: Timestamp.fromMillis(nowMs),
          expireAt: Timestamp.fromMillis(nowMs + AI_GENERATION_USAGE_TTL_MS)
        }, { merge: true });
      }
    }
  };
}

// この街の情報：同じ地域の生成中の印＋停止・回数の確認を1つのトランザクションで行う。
// 結果：claimed(このリクエストだけが生成する)・generating(ほかで生成中)・stopped・limited。
export async function claimAiGenerationWithLock(database, gate, lockId) {
  const lockRef = database.collection(AI_GENERATION_LOCKS_COLLECTION).doc(lockId);
  return database.runTransaction(async (transaction) => {
    const lockSnapshot = await transaction.get(lockRef);
    if (lockSnapshot.exists) {
      const data = lockSnapshot.data() || {};
      const startedAtMs = data.startedAt && typeof data.startedAt.toMillis === "function" ? data.startedAt.toMillis() : null;
      if (startedAtMs !== null && Date.now() - startedAtMs < AI_GENERATION_LOCK_STALE_MS) {
        return { outcome: "generating" };
      }
    }
    const result = await evaluateAiGenerationGateInTransaction(transaction, database, gate);
    if (result.outcome !== "allowed") return { outcome: result.outcome, scope: result.scope, reason: result.reason };
    result.apply(transaction);
    const nowMs = Date.now();
    transaction.set(lockRef, {
      feature: gate.feature,
      status: "generating",
      startedAt: Timestamp.fromMillis(nowMs),
      expireAt: Timestamp.fromMillis(nowMs + AI_GENERATION_USAGE_TTL_MS)
    });
    return { outcome: "claimed" };
  });
}

export async function releaseAiGenerationLock(database, lockId) {
  try {
    await database.collection(AI_GENERATION_LOCKS_COLLECTION).doc(lockId).delete();
  } catch (error) {
    // 消せなくても、AI_GENERATION_LOCK_STALE_MS を過ぎれば生成中ではなくなる。
    console.error("AI生成の印の削除に失敗：", error && error.message);
  }
}

// ------------------------------------------------------------
// 地域名の正規化
// ------------------------------------------------------------
// ISO 3166-2:JP の都道府県コード・正式名・ローマ字(Google の英語表記の揺れを吸収するため)。
const JAPAN_PREFECTURES = Object.freeze([
  ["JP-01", "北海道", "hokkaido"], ["JP-02", "青森県", "aomori"], ["JP-03", "岩手県", "iwate"],
  ["JP-04", "宮城県", "miyagi"], ["JP-05", "秋田県", "akita"], ["JP-06", "山形県", "yamagata"],
  ["JP-07", "福島県", "fukushima"], ["JP-08", "茨城県", "ibaraki"], ["JP-09", "栃木県", "tochigi"],
  ["JP-10", "群馬県", "gunma"], ["JP-11", "埼玉県", "saitama"], ["JP-12", "千葉県", "chiba"],
  ["JP-13", "東京都", "tokyo"], ["JP-14", "神奈川県", "kanagawa"], ["JP-15", "新潟県", "niigata"],
  ["JP-16", "富山県", "toyama"], ["JP-17", "石川県", "ishikawa"], ["JP-18", "福井県", "fukui"],
  ["JP-19", "山梨県", "yamanashi"], ["JP-20", "長野県", "nagano"], ["JP-21", "岐阜県", "gifu"],
  ["JP-22", "静岡県", "shizuoka"], ["JP-23", "愛知県", "aichi"], ["JP-24", "三重県", "mie"],
  ["JP-25", "滋賀県", "shiga"], ["JP-26", "京都府", "kyoto"], ["JP-27", "大阪府", "osaka"],
  ["JP-28", "兵庫県", "hyogo"], ["JP-29", "奈良県", "nara"], ["JP-30", "和歌山県", "wakayama"],
  ["JP-31", "鳥取県", "tottori"], ["JP-32", "島根県", "shimane"], ["JP-33", "岡山県", "okayama"],
  ["JP-34", "広島県", "hiroshima"], ["JP-35", "山口県", "yamaguchi"], ["JP-36", "徳島県", "tokushima"],
  ["JP-37", "香川県", "kagawa"], ["JP-38", "愛媛県", "ehime"], ["JP-39", "高知県", "kochi"],
  ["JP-40", "福岡県", "fukuoka"], ["JP-41", "佐賀県", "saga"], ["JP-42", "長崎県", "nagasaki"],
  ["JP-43", "熊本県", "kumamoto"], ["JP-44", "大分県", "oita"], ["JP-45", "宮崎県", "miyazaki"],
  ["JP-46", "鹿児島県", "kagoshima"], ["JP-47", "沖縄県", "okinawa"]
]);

function normalizeJapaneseText(rawText) {
  return typeof rawText === "string" ? rawText.normalize("NFKC").replace(/\s+/g, "").trim() : "";
}

function normalizeLatinText(rawText) {
  return typeof rawText === "string"
    ? rawText.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s\-‐'’.,]/g, "")
    : "";
}

// 表記そのままで一致しなければ、末尾の行政区分の語を1つだけ外して比べる(例：Naha-shi・Kyoto Prefecture・Tokyo-to)。
function matchLatinName(normalized, candidates, suffixes) {
  if (normalized === "") return null;
  if (candidates.has(normalized)) return candidates.get(normalized);
  for (const suffix of suffixes) {
    if (normalized.length > suffix.length && normalized.endsWith(suffix)) {
      const stripped = normalized.slice(0, -suffix.length);
      if (candidates.has(stripped)) return candidates.get(stripped);
    }
  }
  return null;
}

const PREFECTURE_BY_JAPANESE = new Map();
const PREFECTURE_BY_LATIN = new Map();
for (const [code, name, latin] of JAPAN_PREFECTURES) {
  const entry = Object.freeze({ code, name });
  PREFECTURE_BY_JAPANESE.set(name, entry);
  if (/[県府都]$/.test(name)) PREFECTURE_BY_JAPANESE.set(name.slice(0, -1), entry);
  PREFECTURE_BY_LATIN.set(latin, entry);
}
const PREFECTURE_LATIN_SUFFIXES = ["prefecture", "metropolis", "ken", "fu", "to"];

// 都道府県名(日本語・英語)→ { code: "JP-47", name: "沖縄県" }。実在しなければ null。
export function resolveJapanPrefecture(rawName) {
  const japanese = normalizeJapaneseText(rawName);
  if (PREFECTURE_BY_JAPANESE.has(japanese)) return PREFECTURE_BY_JAPANESE.get(japanese);
  return matchLatinName(normalizeLatinText(rawName), PREFECTURE_BY_LATIN, PREFECTURE_LATIN_SUFFIXES);
}

// STEP 2-B 修正(2026-11-12)｜英語の画面の市区町村名を、全国の市区町村のローマ字の表(japan-municipality-romaji.js)で正式名にそろえる。
// 同じローマ字の市区町村が同じ都道府県に2つ以上ある時(例：釧路市・釧路町)は、末尾の語(City・Town 等)で見分ける。見分けられなければ "" (生成しない)。
const MUNICIPALITY_LATIN_SUFFIX_TYPES = Object.freeze([
  ["village", ["village"]], ["town", ["town"]], ["ward", ["ku"]], ["city", ["shi", "ku"]],
  ["machi", ["town"]], ["mura", ["village"]], ["shi", ["shi"]], ["cho", ["town"]], ["son", ["village"]], ["ku", ["ku"]]
]);

const ROMAJI_INDEX_BY_PREFECTURE = new Map();
for (const [prefectureName, rows] of Object.entries(JAPAN_MUNICIPALITY_ROMAJI_BY_PREFECTURE)) {
  const index = new Map();
  for (const [name, latin, type] of rows) {
    if (!index.has(latin)) index.set(latin, []);
    index.get(latin).push(Object.freeze({ name, type }));
  }
  ROMAJI_INDEX_BY_PREFECTURE.set(prefectureName, index);
}

function resolveMunicipalityFromLatin(prefectureName, rawName) {
  const index = ROMAJI_INDEX_BY_PREFECTURE.get(prefectureName);
  const normalized = normalizeLatinText(rawName);
  if (!index || normalized === "" || /[^a-z0-9]/.test(normalized)) return "";
  const exact = index.get(normalized);
  if (exact && exact.length === 1) return exact[0].name;
  for (const [suffix, types] of MUNICIPALITY_LATIN_SUFFIX_TYPES) {
    if (normalized.length <= suffix.length || !normalized.endsWith(suffix)) continue;
    const candidates = index.get(normalized.slice(0, -suffix.length));
    if (!candidates) continue;
    const typed = candidates.filter((candidate) => types.includes(candidate.type));
    if (typed.length === 1) return typed[0].name;
    if (typed.length === 0 && candidates.length === 1) return candidates[0].name;
    return "";
  }
  return "";
}

// 市区町村名 → その都道府県の正式名(japan-municipalities と同じ)。実在しなければ ""。
//   ・前後の空白・全角半角の違いをそろえる。・先頭の都道府県名・「〇〇郡」を外す(例：島尻郡八重瀬町 → 八重瀬町)。
//   ・政令指定都市の市名(例：横浜市)は、一覧の区(横浜市中区 等)があれば実在として扱う。
//   ・英語の表記(例：Naha・Shibuya City・Yokohama)は全国の市区町村のローマ字の表で照合する。
export function resolveJapanMunicipality(prefectureName, rawName) {
  const list = JAPAN_MUNICIPALITIES_BY_PREFECTURE[prefectureName];
  if (!Array.isArray(list)) return "";
  let name = normalizeJapaneseText(rawName);
  if (name.startsWith(prefectureName)) name = name.slice(prefectureName.length);
  const withoutDistrict = name.replace(/^[^郡]+郡(?=.+[町村]$)/, "");
  for (const candidate of [name, withoutDistrict]) {
    if (candidate === "") continue;
    if (list.includes(candidate)) return candidate;
    if (candidate.endsWith("市") && list.some((entry) => entry.startsWith(candidate) && entry.endsWith("区"))) return candidate;
  }
  return resolveMunicipalityFromLatin(prefectureName, rawName);
}

// ------------------------------------------------------------
// 国コード(今日の地域情報の海外の入力の確認)
// ------------------------------------------------------------
// ISO 3166-1 alpha-2 の割り当て済みのコード(249件)。Google の country の short_name はこの形。ここに無いコードでは生成しない。
const ISO_COUNTRY_CODES = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));

export function isIsoCountryCode(code) {
  return typeof code === "string" && ISO_COUNTRY_CODES.has(code);
}

// ------------------------------------------------------------
// 緊急停止の運営操作(運営画面 admin-ai-generation.html から。代表＝requireAdmin だけ)
// ------------------------------------------------------------
export const AI_GENERATION_CONTROL_LOG_COLLECTION = "aiGenerationControlLog";
export const AI_GENERATION_CONTROL_TARGETS = Object.freeze(["all", "cityInfo", "regionTodayInfo"]);
const AI_GENERATION_CONTROL_REASON_MAX_LENGTH = 200;
const AI_GENERATION_CONTROL_HISTORY_LIMIT = 20;

function toMillisOrNull(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

function pickControlState(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    stopAll: source[AI_GENERATION_CONTROL_FIELDS.all] === true,
    stopCityInfo: source[AI_GENERATION_CONTROL_FIELDS.cityInfo] === true,
    stopRegionTodayInfo: source[AI_GENERATION_CONTROL_FIELDS.regionTodayInfo] === true
  };
}

function readControlVersion(data) {
  const version = data && Number(data.version);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

// 運営画面に出す今の状態：停止の設定・環境変数での停止・今日の生成の回数(サービス全体)・操作の履歴。
export async function readAiGenerationControlForAdmin(database, nowMs = Date.now()) {
  const controlSnapshot = await database
    .collection(AI_GENERATION_CONTROL_COLLECTION).doc(AI_GENERATION_CONTROL_DOC_ID).get();
  const controlData = controlSnapshot.exists ? controlSnapshot.data() || {} : {};
  const date = getJstDateKey(nowMs);
  const usageToday = {};
  for (const feature of AI_GENERATION_FEATURES) {
    const usageSnapshot = await database
      .collection(AI_GENERATION_USAGE_COLLECTION).doc(`${feature}_${date}_all`).get();
    const usageData = usageSnapshot.exists ? usageSnapshot.data() || {} : {};
    usageToday[feature] = {
      count: Number.isFinite(Number(usageData.count)) ? Number(usageData.count) : 0,
      limit: AI_GENERATION_DAILY_LIMITS[feature].global,
      perUser: AI_GENERATION_DAILY_LIMITS[feature].perUser,
      perIp: AI_GENERATION_DAILY_LIMITS[feature].perIp
    };
  }
  // 今日の地域情報の海外の分(専用の上限)。
  const overseasSnapshot = await database
    .collection(AI_GENERATION_USAGE_COLLECTION).doc(`regionTodayInfo_${date}_overseas`).get();
  const overseasData = overseasSnapshot.exists ? overseasSnapshot.data() || {} : {};
  usageToday.regionTodayInfo.overseasCount = Number.isFinite(Number(overseasData.count)) ? Number(overseasData.count) : 0;
  usageToday.regionTodayInfo.overseasLimit = AI_GENERATION_DAILY_LIMITS.regionTodayInfo.overseasGlobal;
  const historySnapshot = await database
    .collection(AI_GENERATION_CONTROL_LOG_COLLECTION)
    .orderBy("version", "desc").limit(AI_GENERATION_CONTROL_HISTORY_LIMIT).get();
  const history = historySnapshot.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      at: toMillisOrNull(data.at),
      target: typeof data.target === "string" ? data.target : "",
      stop: data.stop === true,
      actorEmail: typeof data.actorEmail === "string" ? data.actorEmail : "",
      reason: typeof data.reason === "string" ? data.reason : ""
    };
  });
  return {
    date,
    state: pickControlState(controlData),
    version: readControlVersion(controlData),
    updatedAt: toMillisOrNull(controlData.updatedAt),
    updatedByEmail: typeof controlData.updatedByEmail === "string" ? controlData.updatedByEmail : "",
    envStopped: {
      cityInfo: isAiGenerationStoppedByEnv("cityInfo"),
      regionTodayInfo: isAiGenerationStoppedByEnv("regionTodayInfo")
    },
    usageToday,
    history
  };
}

// 停止・再開の1回の操作。誤操作を防ぐため：
//   ・target・stop は決まった値だけ。confirmed が true の時だけ(画面の確認の後)。
//   ・expectedVersion が今の版と違えば変えない(別の画面・別の操作で変わっている＝読み直してもらう)。
//   ・すでにその状態なら変えない(履歴も増やさない)。
// 設定の更新と操作の履歴(aiGenerationControlLog)は1つのトランザクションで書く。
export async function updateAiGenerationControlByAdmin(database, input) {
  const target = input && input.target;
  const stop = input && input.stop;
  if (!AI_GENERATION_CONTROL_TARGETS.includes(target) || typeof stop !== "boolean") {
    return { outcome: "invalid", message: "操作の内容が正しくありません。" };
  }
  if (!input || input.confirmed !== true) {
    return { outcome: "invalid", message: "確認が済んでいません。画面の確認に答えてから操作してください。" };
  }
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return { outcome: "invalid", message: "画面を読み直してから操作してください。" };
  }
  const actor = input.actor || {};
  const reason = typeof input.reason === "string"
    ? input.reason.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, AI_GENERATION_CONTROL_REASON_MAX_LENGTH)
    : "";
  const field = AI_GENERATION_CONTROL_FIELDS[target];
  const controlRef = database.collection(AI_GENERATION_CONTROL_COLLECTION).doc(AI_GENERATION_CONTROL_DOC_ID);
  const logRef = database.collection(AI_GENERATION_CONTROL_LOG_COLLECTION).doc();
  const nowMs = typeof input.nowMs === "number" ? input.nowMs : Date.now();
  return database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(controlRef);
    const data = snapshot.exists ? snapshot.data() || {} : {};
    const currentVersion = readControlVersion(data);
    const before = pickControlState(data);
    if (currentVersion !== expectedVersion) {
      return { outcome: "conflict", message: "ほかの操作で設定が変わっています。画面を読み直してから、もう一度操作してください。", state: before, version: currentVersion };
    }
    if ((data[field] === true) === stop) {
      return { outcome: "unchanged", message: stop ? "すでに止めています。" : "すでに動いています。", state: before, version: currentVersion };
    }
    const after = Object.assign({}, before, { [field]: stop });
    const nextVersion = currentVersion + 1;
    transaction.set(controlRef, {
      [field]: stop,
      version: nextVersion,
      updatedAt: Timestamp.fromMillis(nowMs),
      updatedByUid: typeof actor.uid === "string" ? actor.uid : "",
      updatedByEmail: typeof actor.email === "string" ? actor.email : ""
    }, { merge: true });
    transaction.set(logRef, {
      target,
      stop,
      before,
      after,
      version: nextVersion,
      reason,
      actorUid: typeof actor.uid === "string" ? actor.uid : "",
      actorEmail: typeof actor.email === "string" ? actor.email : "",
      at: Timestamp.fromMillis(nowMs)
    });
    return { outcome: "updated", state: after, version: nextVersion };
  });
}
