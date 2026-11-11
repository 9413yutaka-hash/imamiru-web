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

export const AI_GENERATION_FEATURES = Object.freeze(["cityInfo", "regionTodayInfo"]);

// 仮の上限(1日・日本時間)。根拠は Obsidian「OpenAI API安全対策 STEP2-B」の記録を参照。
export const AI_GENERATION_DAILY_LIMITS = Object.freeze({
  cityInfo: Object.freeze({ global: 30, perUser: 3, perIp: 10 }),
  regionTodayInfo: Object.freeze({ global: 60, perUser: 5, perIp: 20 })
});

export const AI_GENERATION_USAGE_COLLECTION = "aiGenerationUsage";
export const AI_GENERATION_CONTROL_COLLECTION = "aiGenerationControl";
export const AI_GENERATION_CONTROL_DOC_ID = "settings";
export const AI_GENERATION_LOCKS_COLLECTION = "aiGenerationLocks";
// 生成の待ち時間(この街の情報は60秒で打ち切り)より長くとる。これより古い「生成中」は終わったものとして扱う。
export const AI_GENERATION_LOCK_STALE_MS = 2 * 60 * 1000;
const AI_GENERATION_USAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const AI_GENERATION_STOP_ENV = "AI_GENERATION_STOP";
// Firestore の aiGenerationControl/settings で使う項目名(運営が Firebase の画面で true にすると止まる)。
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
// gate = { feature, uidHash, ipHash, hashUnavailable }
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

// 沖縄県41市町村のローマ字(英語の画面で Google が返す表記の揺れを吸収するため)。
const OKINAWA_MUNICIPALITY_ROMAJI = Object.freeze({
  "那覇市": "naha", "宜野湾市": "ginowan", "石垣市": "ishigaki", "浦添市": "urasoe", "名護市": "nago",
  "糸満市": "itoman", "沖縄市": "okinawa", "豊見城市": "tomigusuku", "うるま市": "uruma", "宮古島市": "miyakojima",
  "南城市": "nanjo", "国頭村": "kunigami", "大宜味村": "ogimi", "東村": "higashi", "今帰仁村": "nakijin",
  "本部町": "motobu", "恩納村": "onna", "宜野座村": "ginoza", "金武町": "kin", "伊江村": "ie",
  "読谷村": "yomitan", "嘉手納町": "kadena", "北谷町": "chatan", "北中城村": "kitanakagusuku", "中城村": "nakagusuku",
  "西原町": "nishihara", "与那原町": "yonabaru", "南風原町": "haebaru", "渡嘉敷村": "tokashiki", "座間味村": "zamami",
  "粟国村": "aguni", "渡名喜村": "tonaki", "南大東村": "minamidaito", "北大東村": "kitadaito", "伊平屋村": "iheya",
  "伊是名村": "izena", "久米島町": "kumejima", "八重瀬町": "yaese", "多良間村": "tarama", "竹富町": "taketomi",
  "与那国町": "yonaguni"
});

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

const OKINAWA_BY_LATIN = new Map(Object.entries(OKINAWA_MUNICIPALITY_ROMAJI).map(([name, latin]) => [latin, name]));
const MUNICIPALITY_LATIN_SUFFIXES = ["village", "town", "city", "machi", "mura", "shi", "cho", "son"];

// 市区町村名 → その都道府県の正式名(japan-municipalities と同じ)。実在しなければ ""。
//   ・前後の空白・全角半角の違いをそろえる。・先頭の都道府県名・「〇〇郡」を外す(例：島尻郡八重瀬町 → 八重瀬町)。
//   ・政令指定都市の市名(例：横浜市)は、一覧の区(横浜市中区 等)があれば実在として扱う。
//   ・英語の表記は沖縄県41市町村だけ対応(ほかの都道府県は "")。
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
  if (prefectureName === "沖縄県") {
    const latin = matchLatinName(normalizeLatinText(rawName), OKINAWA_BY_LATIN, MUNICIPALITY_LATIN_SUFFIXES);
    if (latin) return latin;
  }
  return "";
}
