import {
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";

import {
  FieldValue,
  Timestamp,
  getFirestore
} from "firebase-admin/firestore";

import {
  getAuth
} from "firebase-admin/auth";

import {
  createHash,
  timingSafeEqual
} from "node:crypto";


function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountText =
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountText) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY が設定されていません。"
    );
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(
      serviceAccountText
    );
  } catch (error) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY のJSON形式が正しくありません。"
    );
  }

  return initializeApp({
    credential: cert(serviceAccount)
  });
}


function createEndCodeHash(
  endCode
) {
  return createHash("sha256")
    .update(
      endCode,
      "utf8"
    )
    .digest("hex");
}


function hashesMatch(
  firstHash,
  secondHash
) {
  if (
    typeof firstHash !== "string" ||
    typeof secondHash !== "string"
  ) {
    return false;
  }

  if (
    firstHash.length !== secondHash.length
  ) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(
        firstHash,
        "hex"
      ),
      Buffer.from(
        secondHash,
        "hex"
      )
    );
  } catch (error) {
    return false;
  }
}


function readRequestBody(
  request
) {
  if (
    request.body &&
    typeof request.body === "object"
  ) {
    return request.body;
  }

  if (
    typeof request.body === "string"
  ) {
    try {
      return JSON.parse(
        request.body
      );
    } catch (error) {
      return {};
    }
  }

  return {};
}


function readBearerToken(
  request
) {
  const authorizationHeader =
    request.headers &&
    request.headers.authorization;

  if (
    typeof authorizationHeader !== "string"
  ) {
    return "";
  }

  const match =
    authorizationHeader.match(
      /^Bearer\s+(.+)$/
    );

  if (!match) {
    return "";
  }

  return match[1].trim();
}


function normalizePublicationNumber(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .replace(
      /[^0-9]/g,
      ""
    )
    .slice(
      0,
      8
    );
}


function normalizeEndCode(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ""
    )
    .slice(
      0,
      12
    );
}


const COMMON_AUTH_ERROR_MESSAGE =
  "掲載番号または終了番号が正しくありません。";


const OPENAI_MODERATION_ENDPOINT =
  "https://api.openai.com/v1/moderations";

const OPENAI_MODERATION_MODEL =
  "omni-moderation-latest";

const OPENAI_MODERATION_TIMEOUT_MS =
  20000;

const MAX_MODERATION_IMAGE_COUNT =
  5;

export const AI_REVIEW_VERSION =
  "openai-omni-moderation-v1";


// Ver1.8 Phase2 STEP5-D｜安全・災害・交通に関わる可能性のある投稿は、
// OpenAI Moderationがsafe判定でも自動承認せず、必ず人間の確認を経由させる。
// ここではAIによる事実確認(本当に津波が来ているか等)は一切行わず、
// ルールベースのキーワード一致による「人間確認ルートへ倒す」判定のみを
// 行う。過検知(無関係な投稿がpending行きになる)は許容し、危険情報が
// 誤って自動公開されることを避けることを優先する。日本語のみで判定する
// (投稿本文自体の多言語入力は別軸の未着手工程のため)。
export const SAFETY_CRITICAL_KEYWORDS =
  [
    "津波", "避難", "台風", "警報", "地震", "火災", "事故",
    "通行止め", "欠航", "運休", "土砂", "浸水", "停電", "断水",
    "行方不明", "遭難"
  ];

export function matchesSafetyCriticalKeywords(
  currentData
) {
  const combinedText =
    [
      currentData.shopName,
      currentData.title,
      currentData.content
    ]
      .map(
        function(value) {
          return String(
            value || ""
          );
        }
      )
      .join("\n");

  return SAFETY_CRITICAL_KEYWORDS.some(
    function(keyword) {
      return (
        combinedText.indexOf(
          keyword
        ) !== -1
      );
    }
  );
}


// 店舗投稿の安全化＋撤回｜post.html側のcurrentPostMode("street"/"shop")を
// Firestoreドキュメントの submissionType として保存したものを、安全に
// 読み取るための許容値と解決関数。当初はここでshop投稿の自動承認可否を
// 判定していたが、その条件は本部判断により撤回済み(このファイル内では
// 現在未使用)。submissionType自体とこのallowlistは、Admin一覧の
// 🏪店舗投稿識別表示のために引き続き保持する(本部指示により削除禁止)。
// 値が改ざん・欠落していても呼び出し側を誤動作させないよう、street/shop
// 以外の値・未設定は"shop"へフォールバックする(allowlist方式)。
export const ALLOWED_SUBMISSION_TYPES =
  [
    "street",
    "shop"
  ];

export function resolveSubmissionType(
  currentData
) {
  const rawSubmissionType =
    typeof currentData.submissionType === "string"
      ? currentData.submissionType
      : "";

  return ALLOWED_SUBMISSION_TYPES.includes(
    rawSubmissionType
  )
    ? rawSubmissionType
    : "shop";
}


// Ver1.8 Phase1｜AIコンシェルジュ。モデル名はここ1箇所のみで管理し、
// 他の箇所へハードコードしない。AI_CONCIERGE_MODEL環境変数があれば
// それを優先する(未設定時のみ既定値を使う)。
const AI_CONCIERGE_MODEL =
  process.env.AI_CONCIERGE_MODEL ||
  "gpt-4o-mini";

const AI_CONCIERGE_ENDPOINT =
  "https://api.openai.com/v1/chat/completions";

// Moderation(OPENAI_MODERATION_TIMEOUT_MS=20000、バックグラウンド処理)より
// 短くする。こちらはユーザーが画面で待つ経路のため、体感速度を優先する。
const AI_CONCIERGE_TIMEOUT_MS =
  8000;

const AI_CONCIERGE_MAX_CANDIDATES =
  5;

const AI_CONCIERGE_FIELD_MAX_LENGTHS =
  {
    title: 50,
    category: 30,
    area: 80,
    availabilityHint: 60,
    conditionText: 40,
    sourceType: 30,
    factSummary: 80,

    // AIコンシェルジュ Phase2｜候補の「事実落ち」対策で追加する項目。
    // Firestoreドキュメントを丸ごと渡すのではなく、実在するフィールドの
    // 中から明示的にallowlistした項目だけを、それぞれ短く切り詰めて渡す。
    shopName: 60,
    contentExcerpt: 180,
    locationLabel: 60,
    validUntilHint: 40,
    sourceUrl: 300
  };

const AI_CONCIERGE_CURRENT_TIME_MAX_LENGTH =
  16;

// 会話型マチナウAI Phase1(MVP)｜既存の単発提案(mode:"aiConcierge")とは
// 別の会話モード(mode:"aiConciergeChat")専用の定数群。既存のAI_CONCIERGE_*
// 定数・callOpenAiConcierge()・handleAiConciergeRequest()には一切手を
// 入れず、既存の✨単発提案の挙動を変えない。
//
// 本部方針により、会話モードはChat Completions APIではなくOpenAI
// Responses API(POST /v1/responses)を使う。モデル名は環境変数
// AI_CONCIERGE_CHAT_MODELで切替可能にし、コードへ決め打ちしない。
// GPT-6 Astra(gpt-6-astra)は品質基準として確定済みだが、商用運用モデル
// ではない。Astra→Luna(low/medium)に続き、今回はモデル比較実証として
// GPT-5.6 Terra(model ID: "gpt-5.6-terra")を既定値にする。本部確認済みの
// 公式仕様(2026年9月時点)により、Responses API・web_searchツール・
// reasoning.effortいずれにも対応していることを確認済み。
const AI_CONCIERGE_CHAT_MODEL =
  process.env.AI_CONCIERGE_CHAT_MODEL ||
  "gpt-5.6-terra";

const AI_CONCIERGE_CHAT_ENDPOINT =
  "https://api.openai.com/v1/responses";

// 本部確認済みの公式仕様：gpt-5.6-terraのreasoning.effortは
// none/low/medium(既定)/high/xhigh/maxの6段階。Luna比較との条件を揃える
// ため、Lunaと同じmediumを使う(公式に対応していることを確認済み、
// 推測での変更ではない)。
const AI_CONCIERGE_CHAT_REASONING_EFFORT =
  "medium";

// Web検索(tools:web_search)を伴うため、既存の単発提案(8000ms)より
// 長めに確保する。ユーザーが画面で待つ経路のため、それでも上限は設ける。
const AI_CONCIERGE_CHAT_TIMEOUT_MS =
  20000;

const AI_CONCIERGE_CHAT_MESSAGE_MAX_LENGTH =
  300;

// 「直近数ターン程度」の会話履歴に制限する(本部指示)。1往復＝ユーザー1件+
// アシスタント1件のため、12件で直近6往復相当。無限にmessagesを増やさない。
const AI_CONCIERGE_CHAT_MAX_HISTORY_ITEMS =
  12;

const AI_CONCIERGE_CHAT_HISTORY_TEXT_MAX_LENGTH =
  400;

const AI_CONCIERGE_CHAT_REPLY_MAX_LENGTH =
  700;

// AIコンシェルジュ Phase2｜「一文だけ」をやめ2〜4文程度を許容するため、
// 安全上限を200→480文字へ引き上げる(4文×日本語1文あたり最大120文字
// 程度を目安にした余裕を持たせた上限。プロンプト側の指示自体は文字数
// ではなく文数(2〜4文)で行い、これはあくまで暴走防止の安全網)。
const AI_CONCIERGE_REASON_MAX_LENGTH =
  480;

const AI_CONCIERGE_NEXT_HOURS_MAX_COUNT =
  6;

const AI_CONCIERGE_REGIONAL_WEATHER_MAX_COUNT =
  3;

const AI_CONCIERGE_REGION_LABEL_MAX_LENGTH =
  20;


// AI地域編集部 Phase1(八重瀬町・最小縦断実証)専用の定数群。既存の
// AI_CONCIERGE_*(単発提案✨)・AI_CONCIERGE_CHAT_*(会話型マチナウAI)の
// どちらとも完全に独立させ、モデル・エンドポイント・定数のいずれも
// 一切共有しない(本部指示：会話AIへ影響を与えず別modeとして呼べること)。
// 新しいVercel Functionは追加せず、既存のこのFunctionへmode追加のみで
// 実装する(Functions 12/12を維持)。
//
// 本部確認済みの公式仕様(2026年9月時点)により、gpt-5.6-terraはResponses
// API・reasoning.effortに対応済み。地域編集は「低頻度で生成→保存→
// 再利用」する用途のため、会話AIのような即時応答性は不要。web_searchは
// 意図的に使わない(本部指示：確認済み事実のみを根拠にし、SNSを見たかの
// ような記述を生まないため、Web検索結果を編集AIの入力に混ぜない)。
const AI_REGION_EDITORIAL_MODEL =
  process.env.AI_REGION_EDITORIAL_MODEL ||
  "gpt-5.6-terra";

const AI_REGION_EDITORIAL_ENDPOINT =
  "https://api.openai.com/v1/responses";

const AI_REGION_EDITORIAL_REASONING_EFFORT =
  "medium";

const AI_REGION_EDITORIAL_TIMEOUT_MS =
  20000;

// Phase1は八重瀬町のみが対象(本部指示：全国展開は行わない)。他市町村の
// regionEditorial呼び出しはAPI側で明示的に拒否し、UIの実装ミスや将来の
// 誤った拡張があっても、意図しない市町村でAI地域編集が動かないようにする。
const AI_REGION_EDITORIAL_ALLOWED_AREAS =
  [
    "八重瀬町"
  ];

const AI_REGION_EDITORIAL_TARGET_AREA_MAX_LENGTH =
  40;

// Phase3.4.1｜下書きのcontent上限(後述のAI_REGION_EDITORIAL_DRAFT_TEXT_
// MAX_LENGTHS.content)を3000へ引き上げたことに合わせ、既存記事
// (existingArticle、改善案生成時に読み込む前回保存済み記事)側の上限も
// 同じ3000へ揃える。ここが2000のままだと、3000字弱で生成・保存された
// 記事を改善案生成時に読み込む際に途中で切り詰められてしまうため。
const AI_REGION_EDITORIAL_EXISTING_TEXT_MAX_LENGTHS =
  {
    title: 60,
    content: 3000,
    regionName: 20
  };

// 根拠として渡すsubmissions側の事実は、既存の公開一覧
// (handlePublicSubmissionsListRequest)と全く同じ「status==approved」の
// ドキュメントに限定する(未承認・却下済みの情報を編集AIへ渡さない)。
// 1件あたりの文字数と件数に上限を設け、プロンプトの肥大化・コスト超過を
// 防ぐ。REGION FACTS・SHOP DIRECT POSTSの両方でこの1つの上限セットを
// 共有する(概念上は分離するが、安全上限の考え方まで分ける理由がないため)。
const AI_REGION_EDITORIAL_SOURCE_FACT_MAX_COUNT =
  20;

const AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS =
  {
    title: 60,
    content: 400,
    shopName: 60,
    category: 30,
    address: 120,
    authorType: 30,
    websiteUrl: 300,
    sourceName: 60,
    sourceType: 30,
    confirmedAt: 30,
    publishedAt: 40
  };

// AI地域編集部 Phase2(街を見るAI→地域ファクト接続)｜本部指示により、
// 出典(sourceCitations)はAIに文字列(URL)を生成させず、必ずプログラム側で
// 実データから組み立てる。AIには「入力に含めた事実のうち、実際に本文の
// 根拠に使ったものはどれか」をfactId(こちらが採番した記号)の配列で
// 答えさせるだけにとどめ、AIがURLやラベルの文字列を出力する経路自体を
// 構造的になくす。
const AI_REGION_EDITORIAL_CITED_FACT_ID_MAX_COUNT =
  20;

const AI_REGION_EDITORIAL_CITED_FACT_ID_MAX_LENGTH =
  20;

// AIが返す下書き自体にも、他のAI機能と同じ考え方で安全上限を設ける
// (json_schemaによる構造化出力を使うが、文字数上限はAPI応答の仕様では
// 保証されないため、二重の安全網として保つ)。
// Phase3.4｜「タイトル＋数行の行政案内」ではなく、街の魅力を理解できる
// 読み物量を許可するため上限を引き上げる。
// Phase3.4.1(本部指示)｜「約2000字の記事」をこの値で強制切断する設計に
// しない。instructions側でAIへ求める分量はあくまで「約2000字」のまま
// とし、この安全上限は実際の出力が多少前後しても本文が途中で切れない
// よう3000文字に余裕を持たせる(二重の安全網としての上限であり、目標
// 分量そのものではない)。
const AI_REGION_EDITORIAL_DRAFT_TEXT_MAX_LENGTHS =
  {
    title: 60,
    content: 3000,
    regionName: 20
  };

// AI地域編集部 Phase2｜地域おすすめ記事を生成してよい最低限のREGION
// FACTS件数。本部指示「材料が薄いなら生成しない方が正しい」の安全側の
// 最小実装として、件数だけを見る単純な閾値にとどめる(情報の種類の偏り
// までを判定する複雑なロジックはPhase2では作らない)。SHOP DIRECT POSTS
// だけがどれだけあっても、この判定には一切カウントしない
// (店舗投稿だけで地域全体の記事を生成させないため)。
const AI_REGION_EDITORIAL_MIN_REGION_FACT_COUNT =
  1;

// 既存submissionsのauthorTypeのうち、「マチナウ運営・街を見るAIが
// 確認した情報」を示す値だけをREGION FACTSとして扱う。それ以外
// (shopAd・店舗自身の投稿・authorType未設定の一般投稿等)はすべて
// SHOP DIRECT POSTS側へ回す。新しい分類値を作らず、既存のauthorTypeを
// そのまま再利用する(api/admin-post.jsのALLOWED_AUTHOR_TYPES・
// api/admin-source-collect.jsのcreateAutoPostSubmission()と一致)。
const AI_REGION_EDITORIAL_REGION_FACT_AUTHOR_TYPES =
  [
    "ai",
    "admin"
  ];

// aiCollectedArticles側から長期地域ファクト候補を拾う際、1つの情報源
// あたりに読みに行く件数の上限(コスト・応答時間の安全網)。
const AI_REGION_EDITORIAL_AI_COLLECTED_PER_SOURCE_MAX_COUNT =
  30;

// api/admin-source-collect.jsのAI_COLLECTED_ARTICLES_COLLECTIONと同じ
// コレクション名の文字列("aiCollectedArticles")。2つの独立したVercel
// Function間でconstをimportし合う結合を避けるため、既存の
// OKINAWA_MUNICIPALITY_TO_REGION_NAME等と同じ考え方で、コレクション名
// (単純な文字列定数1つ)だけをこちらにも複製する。
const AI_COLLECTED_ARTICLES_COLLECTION_NAME =
  "aiCollectedArticles";

// 街を見るAIの内部で既に使われているEVENT/鮮度判定エンジン
// (judgeArticleForAutoPost内のresolveFreshnessCategory等)は、
// 他の判定(関連度スコア・第二審等)と密結合しており、Phase2の最小
// スコープでそのまま再利用/import すると2つの独立したVercel Function
// 間の結合が強まりすぎる(本部指示のスコープ外)。そのため、
// aiCollectedArticles由来の長期ファクト候補(既にsubmissionsの掲示
// 期限が切れているもの)だけに対象を絞った、意図的に単純な安全側の
// キーワード検出を新設する。「完璧な判定AIは不要、安全側へ倒す」という
// 本部方針に基づき、該当した場合は無条件でTier Bへ降格させる
// (Terraへは渡さない)。
//
// Phase3.4追加分(2026-09-19 Production実証で確認した実際の欠落)｜
// 「台風接近に伴う避難所の閉鎖等について」(2026-08-25発表、
// town.yaese.lg.jp)という、既に警報解除・避難所閉鎖済みの終了済み告知が、
// この配列に該当語が無かったためTier B降格されず、長期地域ファクトとして
// regionEditorialへ渡り、1ヶ月後の記事で現在の台風注意情報であるかの
// ように扱われる原因になったことを実データ(WebFetchで実際の告知内容を
// 確認)とコードで特定した。既存のキーワード方式を大改造せず、確認できた
// 欠落語だけをこの一覧へ追加する最小対応とする。
const AI_REGION_EDITORIAL_TIME_BOUND_KEYWORDS =
  [
    "イベント",
    "開催",
    "祭り",
    "花火",
    "中止",
    "延期",
    "休業",
    "運休",
    "臨時",
    "限定",
    "募集",
    "申込",
    "締切",
    "本日",
    "今日",
    "明日",
    "今週",
    "今月",
    "変更になりました",
    "終了しました",
    "開始します",
    "閉鎖",
    "閉館",
    "解除",
    "避難所"
  ];


// AI地域編集部 Phase3.1(街の長期記憶DB)｜regionRecommendations(旅行者へ
// 見せる編集済み記事)とは完全に別のcollection。新しいVercel Functionは
// 追加せず、既存のこのFunctionへmode追加(regionProfileGet/
// regionProfileSave)のみで実装する。クライアントから直接読み書きさせず、
// 常にAdmin SDK経由(このFunction経由)のみでアクセスする設計とし、
// Firestore Security Rulesの変更を一切不要にする
// (既存のaiSources/aiCollectedArticles等と同じ設計方針)。
const REGION_PROFILES_COLLECTION =
  "regionProfiles";

// document ID方式｜本部指示により、表示名(identity.regionName)とは別の
// 安定IDを採用する。全国・海外展開時の地名衝突(例：「府中市」は東京都・
// 広島県の両方に実在する)を避けるため、
// 「jp-<JIS X 0401:1973都道府県コード(2桁)>-<市町村の公式ローマ字表記>」
// という形式にする。都道府県コードはISO 3166-2:JPにも採用されている
// 確立した公的規格であり、沖縄県=47はWebSearchで確認済み(出典：
// https://www.asahi-net.or.jp/~ax2s-kmtn/ref/jisx0401.html 等)。
// 市町村側のローマ字表記は、その市町村自身の公式サイトドメイン
// (八重瀬町の場合、既存のaiSourcesに登録済みのtown.yaese.lg.jp)から
// 確認できたものだけを採用する。41市町村分を一括で推測生成すること はせず
// (本部指示：独自ID体系を推測で作らない)、実際にPhase3.1〜3.2で対象と
// する市町村を1つずつ、この方法で個別に確認しながら追加していく。
// 既存の全システム(submissions.area／aiSources.area／
// regionRecommendations.targetAreas等)は、今後も従来通り生の市町村名
// 文字列("八重瀬町")を使い続ける(変更しない)。このmapは、その生の
// 市町村名文字列からregionProfilesのdocument IDへ変換するためだけの、
// 意図的に小さい対応表である。
const REGION_PROFILE_AREA_NAME_TO_ID =
  {
    "八重瀬町": "jp-47-yaese"
  };

const REGION_PROFILE_AREA_NAME_TO_PREFECTURE =
  {
    "八重瀬町": "沖縄県"
  };

// Phase3.1は八重瀬町のみが対象(本部指示：全国展開は行わない)。
// regionEditorialのAI_REGION_EDITORIAL_ALLOWED_AREASとは値は同じだが、
// 意図的に別の定数として管理する(地域プロフィール機能と地域編集AI機能は
// 将来別々に対象市町村を広げる可能性があり、片方の変更がもう片方へ
// 意図せず波及しないようにするため)。
const REGION_PROFILE_ALLOWED_AREAS =
  [
    "八重瀬町"
  ];

const REGION_PROFILE_SCHEMA_VERSION =
  1;

const REGION_PROFILE_VALID_STATUS_VALUES =
  [
    "confirmed",
    "unknown"
  ];

// temporary(今日のイベント等)はPROFILEへ保存しない(本部指示)。
// この配列に"temporary"を含めないこと自体が、テストGの安全網になる。
const REGION_PROFILE_VALID_VALIDITY_TYPES =
  [
    "stable",
    "periodic"
  ];

const REGION_PROFILE_TEXT_MAX_LENGTHS =
  {
    sourceName: 80,
    sourceUrl: 300,
    sourceType: 30,
    checkedAt: 20,
    publishedAt: 40,
    shortText: 200,
    longText: 800,
    listItem: 100
  };

const REGION_PROFILE_SOURCES_MAX_COUNT =
  5;

const REGION_PROFILE_LIST_VALUE_MAX_COUNT =
  20;

// 主要事実(fact)のvalidityType初期値。本部が挙げた例
// (成立史→stable、人口→periodic、交通路線→periodic)に沿った、
// このコード内だけのデフォルト分類。保存時にadmin/editorが異なる
// validityTypeを指定することも許可する(このデフォルトは「未確認状態を
// 初期化する時の初期値」としてのみ使う)。
const REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY =
  {
    identity: {
      regionType: "stable",
      population: "periodic",
      households: "periodic",
      areaKm2: "stable",
      establishedDate: "stable",
      formationHistory: "stable",
      formerMunicipalities: "stable",
      locationSummary: "stable",
      neighboringAreas: "stable",
      oneLineIdentity: "stable"
    },
    character: {
      historySummary: "stable",
      geography: "stable",
      landscape: "stable",
      mainIndustries: "stable",
      specialties: "stable",
      localFoods: "stable",
      agriculture: "stable",
      fisheries: "stable",
      culture: "stable",
      traditionalEvents: "stable",
      localLifestyle: "stable",
      localCharacter: "stable"
    },
    travel: {
      representativePlaces: "stable",
      localFavoritePlaces: "stable",
      scenery: "stable",
      foodExperiences: "stable",
      activities: "stable",
      soloTravelFit: "stable",
      familyTravelFit: "stable",
      rainyDayOptions: "stable",
      morningCharacter: "stable",
      daytimeCharacter: "stable",
      eveningCharacter: "stable",
      nightCharacter: "stable",
      typicalStayIdeas: "stable"
    },
    climate: {
      climateSummary: "stable",
      temperatureCharacteristics: "stable",
      rainCharacteristics: "stable",
      windCharacteristics: "stable",
      seasonalCharacteristics: "stable",
      typhoonCharacteristics: "stable",
      heatRiskCharacteristics: "stable",
      spring: "stable",
      summer: "stable",
      autumn: "stable",
      winter: "stable",
      seasonalHighlights: "stable"
    },
    transport: {
      carDependency: "stable",
      publicTransportSummary: "periodic",
      airportAccess: "periodic",
      stationAccess: "periodic",
      portAccess: "periodic",
      walkingTravelFit: "stable",
      carFreeTravelAdvice: "stable",
      connectionsToNearbyAreas: "periodic"
    },
    safety: {
      longTermSafetyNotes: "stable"
    }
  };

// 値がリスト(配列)になる項目。それ以外は文字列/オブジェクトの単一値として
// 扱う(sanitizeRegionProfileFactValue()がこの一覧を見て検証方法を分ける)。
const REGION_PROFILE_LIST_VALUE_FIELDS =
  new Set(
    [
      "formerMunicipalities",
      "neighboringAreas",
      "representativePlaces",
      "localFavoritePlaces"
    ]
  );

// population/householdsだけは{count, asOf}という特別な形を持つ
// (本部指示：人口値と基準日を文章1本へ潰さない)。
const REGION_PROFILE_COUNT_WITH_ASOF_FIELDS =
  new Set(
    [
      "population",
      "households"
    ]
  );


// AI地域編集部 Phase3.2(街の記憶を調査するAI)｜既存のAI_REGION_EDITORIAL_*
// (地域おすすめ下書き生成)・AI_CONCIERGE_CHAT_*(会話型マチナウAI)の
// どちらとも完全に独立させる。新しいVercel Functionは追加せず、既存の
// このFunctionへmode追加(regionProfileResearch)のみで実装する。
//
// 本部指示により、6項目を6回別々にAIへ投げず、1回の調査セッションに
// まとめる。ただし品質を落としてまで1callに固定しないため、
// 「Web調査してcitation付きの報告文を作る呼び出し」と
// 「報告文を検証済み出典参照だけを使ってJSON候補へ構造化する呼び出し」の
// 2段階(＝1セッションあたりOpenAI API 2回)にする。理由：Responses APIの
// 構造化出力(json_schema)モードとweb_search引用(annotations)が同時に
// 正しく機能するかを検証する手段がないため、安全側として実績のある
// 「素のテキスト出力+citation」モードでの調査と、
// 「citationなし構造化出力」でのJSON化を分離する。
const AI_REGION_PROFILE_RESEARCH_MODEL =
  process.env.AI_REGION_PROFILE_RESEARCH_MODEL ||
  "gpt-5.6-terra";

const AI_REGION_PROFILE_RESEARCH_ENDPOINT =
  "https://api.openai.com/v1/responses";

const AI_REGION_PROFILE_RESEARCH_REASONING_EFFORT =
  "medium";

// Phase3.2は八重瀬町のみが対象。regionEditorial/regionProfileGet・Saveの
// 対象市町村ガードとは意図的に別の定数として管理する(それぞれのモードが
// 将来別々に対象市町村を広げる可能性があり、片方の変更がもう片方へ
// 意図せず波及しないようにするため)。
const AI_REGION_PROFILE_RESEARCH_ALLOWED_AREAS =
  [
    "八重瀬町"
  ];

// AI地域編集部 Phase3.2改修(1call方式)｜本部指示により6項目10 fieldKeyを
// 4グループへ整理する。1グループ＝OpenAI Responses API 1 requestで、
// web_search＋Structured Outputs＋include:["web_search_call.action.sources"]
// を同時に使う(Production能力検証で実際にelapsedMs=4905で成立済み)。
// allowed_domainsは、本部指示「推測domain禁止・存在確認できるものだけ」に
// 従い、このセッション内でWebSearchにより実在を確認できたドメインだけを
// 登録する(八重瀬町公式town.yaese.lg.jp／沖縄県公式pref.okinawa.lg.jp／
// 政府統計の総合窓口e-stat.go.jp／沖縄観光コンベンションビューロー
// ocvb.or.jp／沖縄バスokinawabus.com／沖縄県バス協会bus-okinawa.or.jp。
// いずれも本セッションでWebSearchにより公式サイトとして実在確認済み)。
// 信頼できるドメインを確認できない情報種別については、無理に一般Web検索
// へ開放せず、既存の八重瀬町公式サイトのみに絞る(信用＞網羅性)。
const AI_REGION_PROFILE_RESEARCH_GROUPS =
  [
    {
      groupKey: "basicStats",
      label: "基本統計",
      allowedDomains: [
        "town.yaese.lg.jp",
        "pref.okinawa.lg.jp",
        "e-stat.go.jp"
      ],
      fields: [
        {
          fieldKey: "identity.population",
          section: "identity",
          field: "population",
          label: "人口",
          isNumeric: true,
          requiresAsOf: true,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "identity.areaKm2",
          section: "identity",
          field: "areaKm2",
          label: "面積",
          isNumeric: true,
          requiresAsOf: false,
          isEditorialInterpretation: false
        }
      ]
    },
    {
      groupKey: "formationGeography",
      label: "成立・地理",
      allowedDomains: [
        "town.yaese.lg.jp",
        "pref.okinawa.lg.jp"
      ],
      fields: [
        {
          fieldKey: "identity.formationHistory",
          section: "identity",
          field: "formationHistory",
          label: "成立史",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "identity.establishedDate",
          section: "identity",
          field: "establishedDate",
          label: "成立年月日",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "identity.locationSummary",
          section: "identity",
          field: "locationSummary",
          label: "位置",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "character.geography",
          section: "character",
          field: "geography",
          label: "地形",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        }
      ]
    },
    {
      groupKey: "specialtiesFood",
      label: "食・特産",
      allowedDomains: [
        "town.yaese.lg.jp",
        "ocvb.or.jp"
      ],
      fields: [
        {
          fieldKey: "character.specialties",
          section: "character",
          field: "specialties",
          label: "特産",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "character.localFoods",
          section: "character",
          field: "localFoods",
          label: "食",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        }
      ]
    },
    {
      groupKey: "transport",
      label: "移動",
      allowedDomains: [
        "town.yaese.lg.jp",
        "okinawabus.com",
        "bus-okinawa.or.jp"
      ],
      fields: [
        {
          fieldKey: "transport.publicTransportSummary",
          section: "transport",
          field: "publicTransportSummary",
          label: "公共交通",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "transport.carFreeTravelAdvice",
          section: "transport",
          field: "carFreeTravelAdvice",
          label: "車なし旅行者へのアドバイス",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: true
        }
      ]
    },
    // 実装GO｜Phase3 八重瀬町「街の記憶」完成(15/15)｜既存4グループと
    // 完全に同じ技術(Terra・web_search・Structured Outputs・
    // search_context_size:"low"・candidateSources方式)を再利用した
    // 追加2グループ。allowed_domainsは新規推測せず、本セッションで既に
    // 実在確認済みのドメインだけを使う(本部指示)。
    {
      groupKey: "characterCultureSafety",
      label: "性格・文化・安全",
      allowedDomains: [
        "town.yaese.lg.jp",
        "pref.okinawa.lg.jp",
        "ocvb.or.jp"
      ],
      fields: [
        {
          fieldKey: "character.localCharacter",
          section: "character",
          field: "localCharacter",
          label: "街らしさ・雰囲気",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "character.culture",
          section: "character",
          field: "culture",
          label: "文化",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          fieldKey: "safety.longTermSafetyNotes",
          section: "safety",
          field: "longTermSafetyNotes",
          label: "地域固有の安全特性（長期的）",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        }
      ]
    },
    {
      groupKey: "climateHighlights",
      label: "気候・代表スポット",
      allowedDomains: [
        "town.yaese.lg.jp",
        "pref.okinawa.lg.jp",
        "ocvb.or.jp"
      ],
      fields: [
        {
          fieldKey: "climate.climateSummary",
          section: "climate",
          field: "climateSummary",
          label: "気候の特徴",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false
        },
        {
          // travel.representativePlacesはREGION_PROFILE_LIST_VALUE_FIELDSに
          // 含まれるリスト型項目。suggestedValueのJSON schema自体は既存の
          // 全グループ共通で文字列型のままにし(schema変更なし)、AIには
          // 読点(、)区切りで複数地名を1つの文字列として書かせる。実際の
          // 配列化はクライアント側(admin-region-profiles.html)がisListValue
          // を見て行う(サーバー側のリスト検証ルールはPhase3.1のまま変更しない)。
          fieldKey: "travel.representativePlaces",
          section: "travel",
          field: "representativePlaces",
          label: "代表的なスポット",
          isNumeric: false,
          requiresAsOf: false,
          isEditorialInterpretation: false,
          isListValue: true
        }
      ]
    }
  ];

const AI_REGION_PROFILE_RESEARCH_TEXT_MAX_LENGTHS =
  {
    suggestedValue: 300,
    asOf: 20,
    evidenceQuote: 220,
    confidence: 20,
    sourceTypeGuess: 30,
    sourceTitle: 120
  };

const AI_REGION_PROFILE_RESEARCH_MAX_SOURCES_PER_GROUP =
  20;

const AI_REGION_PROFILE_RESEARCH_MAX_CANDIDATES =
  20;

// 1グループ1call(web_search＋Structured Outputs＋sources)のタイムアウト。
// Production実測(1項目・単一domain縛りなしでelapsedMs=4905、4グループ
// 本実装でも最大16,591ms)を踏まえ、60秒から開始する。
const AI_REGION_PROFILE_RESEARCH_GROUP_TIMEOUT_MS =
  60000;

// 「公式情報を優先する」という本部方針を、allowed_domainsによる構造的な
// 絞り込みに加えて、補助的にもう一段チェックするための簡易パターン
// (.lg.jp＝地方公共団体、.go.jp＝国の機関、.or.jp＝社団・財団法人等)。
// 一致しない場合でも候補自体は破棄せず、sourceTierWarning:trueを付けて
// 人間の目視判断に委ねる。
const AI_REGION_PROFILE_RESEARCH_OFFICIAL_URL_PATTERNS =
  [
    /\.lg\.jp(\/|$)/i,
    /\.go\.jp(\/|$)/i,
    /\.or\.jp(\/|$)/i
  ];


// Ver1.8 Phase2(マチナウ読み物コメント機能MVP)｜新しいVercel Functionは
// 追加せず、既存のこのFunction(api/moderate-submission.js)へmode追加のみで
// 実装する(Functions 12/12を維持)。新規Firestoreコレクションは
// クライアントから直接読み書きさせず、常にAdmin SDK経由(このFunction経由)
// のみでアクセスする設計とし、Firestore Security Rulesの変更を一切
// 不要にする(既存のsubmissions/aiCollectedArticles等と同じ、コードだけで
// 完結する安全設計)。
const ARTICLE_COMMENTS_COLLECTION =
  "articleComments";

// マチナウ読み物投稿機能(Phase1)導入前から存在する唯一の静的HTML記事
// (column/typhoon-okinawa-travel.html)専用の互換リスト。この記事は
// Firestore columnArticlesへ一切登録せず(URLも本文もコメントも壊さない
// という指示のため、既存の仕組みへ一切手を触れない)、コメント対象判定
// でだけ「常に許可」として扱う。新しい静的コラムを今後手作業で追加する
// 予定はないため、このリストへの追記は原則発生しない想定(通常の新規記事は
// すべてadmin-column.html経由のFirestore記事として作成され、
// isColumnSlugEligibleForComments()が自動的にコメント対象として扱う)。
const LEGACY_STATIC_COLUMN_SLUGS =
  [
    "typhoon-okinawa-travel"
  ];

// マチナウ読み物投稿機能(Phase1)｜Firestore columnArticlesのドキュメントID
// そのものをslug(URLの一部)として使う(別途slugフィールドを持たない、
// IDとslugが食い違う不整合を構造的に無くすため)。
const COLUMN_ARTICLES_COLLECTION =
  "columnArticles";

const COLUMN_STATUS_DRAFT =
  "draft";

const COLUMN_STATUS_PUBLISHED =
  "published";

// Phase1では少数の分かりやすいカテゴリーのみを用意する(大量のカテゴリーを
// 作らない指示のため)。将来増やす場合はこの配列に追記するだけでよく、
// admin-column.html側の同名配列と両方を更新する(既存のOKINAWA_MUNICIPALITY_
// TO_REGION_NAME等と同じ、複製管理の方針を踏襲)。
const ALLOWED_COLUMN_CATEGORIES =
  [
    "文化・背景",
    "楽しみ方",
    "安全・備え",
    "マチナウの想い"
  ];

const COLUMN_TITLE_MAX_LENGTH =
  60;

const COLUMN_DESCRIPTION_MAX_LENGTH =
  120;

const COLUMN_CONTENT_MAX_LENGTH =
  6000;

// 代表が任意でURL識別子(slug)を指定できる場合の形式。指定しない場合は
// Firestoreの自動採番IDをそのままslugとして使うため、代表が英語slugを
// 考える必要はない。
const COLUMN_CUSTOM_SLUG_PATTERN =
  /^[a-z0-9]+(-[a-z0-9]+)*$/;

const COLUMN_CUSTOM_SLUG_MAX_LENGTH =
  60;

const COLUMN_LIST_MAX_COUNT =
  200;

// ==========================================================================
// マチナウ読み物投稿機能(Phase2)｜地域連動基盤
// columnArticlesは「沖縄専用」データ構造を新たに固定しない。国(country)・
// 都道府県/州等(prefecture)・市区町村(city)・任意の細粒度エリア(area)の
// 4階層をすべて任意項目として持たせ、記事ごとに粒度を選べるようにする
// (例：「沖縄の雨」はcountry+prefectureのみ、「国際通りは…」はcity+area
// まで指定、「日本のお正月」はcountryのみ)。既存のOKINAWA_MUNICIPALITY_TO_
// REGION_NAME(app.js、沖縄8広域グループ)・submissions.area・
// regionRecommendations.targetAreasはいずれも変更しない、完全に独立した
// 新設計。
// ==========================================================================

const COLUMN_REGION_FIELD_MAX_LENGTHS =
  {
    prefecture: 40,
    city: 40,
    area: 40
  };

// Ver1.8 Phase2(国識別の世界対応・仕上げ)｜countryは表示名の揺れ(「日本」
// 「Japan」等、入力言語や閲覧者のGoogle Geocoderロケールにより変わりうる)
// を一切許さず、ISO 3166-1 alpha-2の国コードのみを正本として保存する。
// 「JP/France/日本/フランスが混在する」状態を防ぐため、コードを覚えて
// もらう代わりに、admin-column.html・column-list.htmlの国欄を自由記述の
// テキストから<select>(値=コード、表示=国名)へ変更し、代表・利用者とも
// コードを直接入力する必要が無い設計にした(手書きの国名変換表を増やす
// アプローチは採らない)。
//
// 保持するのは「ISO 3166-1で現在割り当てられているalpha-2コードの一覧」
// という、めったに変わらない国際標準の一覧だけ(新規発行・廃止は極めて
// まれ)。表示用の国名(日本語ラベル)は一切手書きせず、Node.js/ブラウザ
// 標準搭載のIntl.DisplayNames(新しい外部API・依存ライブラリを追加せず、
// ECMAScript国際化APIの標準機能)で実行時に生成する。これにより、
// 世界中どの国コードを追加しても翻訳表のメンテナンスが発生しない。
const ISO_3166_1_ALPHA_2_COUNTRY_CODES =
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
    "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
    "DE DJ DK DM DO DZ " +
    "EC EE EG EH ER ES ET " +
    "FI FJ FK FM FO FR " +
    "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
    "HK HM HN HR HT HU " +
    "ID IE IL IM IN IO IQ IR IS IT " +
    "JE JM JO JP " +
    "KE KG KH KI KM KN KP KR KW KY KZ " +
    "LA LB LC LI LK LR LS LT LU LV LY " +
    "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
    "NA NC NE NF NG NI NL NO NP NR NU NZ " +
    "OM " +
    "PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
    "QA " +
    "RE RO RS RU RW " +
    "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
    "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
    "UA UG UM US UY UZ " +
    "VA VC VE VG VI VN VU " +
    "WF WS " +
    "YE YT " +
    "ZA ZM ZW"
  ).split(" ");

const ISO_3166_1_ALPHA_2_COUNTRY_CODE_SET =
  new Set(
    ISO_3166_1_ALPHA_2_COUNTRY_CODES
  );

let cachedJapaneseCountryDisplayNames =
  null;

// Intl.DisplayNamesは環境によって未実装の可能性がある(Vercelの
// Node.jsランタイムでは通常利用可能)。使えない場合はコードをそのまま
// 表示にフォールバックし、機能停止にはしない。
function getCountryDisplayLabel(
  countryCode
) {
  if (
    typeof countryCode !== "string" ||
    countryCode === ""
  ) {
    return "";
  }

  const normalizedCode =
    countryCode.toUpperCase();

  try {
    if (!cachedJapaneseCountryDisplayNames) {
      cachedJapaneseCountryDisplayNames =
        new Intl.DisplayNames(
          ["ja"],
          {
            type: "region"
          }
        );
    }

    const label =
      cachedJapaneseCountryDisplayNames.of(
        normalizedCode
      );

    return (
      typeof label === "string" &&
      label !== ""
        ? label
        : normalizedCode
    );
  } catch (error) {
    return normalizedCode;
  }
}

// 新規保存時はISO 3166-1 alpha-2コードのみを正本として受け付ける
// (JP/France/日本/フランス等の混在を防ぐ)。admin-column.htmlが
// <select>(値=コード)へ変更されたため、通常はここで弾かれることは
// ないが、API直叩き等の想定外入力に備えて厳密に検証する。
function validateColumnRegionCountryCode(
  rawValue
) {
  const trimmedValue =
    String(
      rawValue || ""
    )
      .trim()
      .toUpperCase();

  if (trimmedValue === "") {
    return "";
  }

  if (
    !ISO_3166_1_ALPHA_2_COUNTRY_CODE_SET.has(
      trimmedValue
    )
  ) {
    throw new Error(
      "国の指定が正しくありません。選択肢から選び直してください。"
    );
  }

  return trimmedValue;
}

const COLUMN_ARTICLE_PAGE_SHARED_CACHE_MAX_AGE_SECONDS =
  300;

const COLUMN_ARTICLE_PAGE_STALE_WHILE_REVALIDATE_SECONDS =
  600;

const COLUMN_LIST_SHARED_CACHE_MAX_AGE_SECONDS =
  60;

const COLUMN_LIST_STALE_WHILE_REVALIDATE_SECONDS =
  120;

const SITEMAP_SHARED_CACHE_MAX_AGE_SECONDS =
  300;

const SITEMAP_STALE_WHILE_REVALIDATE_SECONDS =
  600;

const COMMENT_NICKNAME_MAX_LENGTH =
  20;

const COMMENT_TEXT_MAX_LENGTH =
  500;

const COMMENT_FALLBACK_NICKNAME =
  "名無しさん";

const COMMENTS_LIST_MAX_COUNT =
  200;

// 個人情報(生IP)を保存しない。ハッシュ化した値だけをスパム対策の
// クールダウン判定に使い、逆算で元のIPへ戻せないようにする。
const COMMENT_RATE_LIMITS_COLLECTION =
  "commentRateLimits";

const COMMENT_RATE_LIMIT_COOLDOWN_MILLISECONDS =
  30 * 1000;

const COMMENTS_LIST_SHARED_CACHE_MAX_AGE_SECONDS =
  15;

const COMMENTS_LIST_STALE_WHILE_REVALIDATE_SECONDS =
  30;


const CATEGORY_LABELS = {
  "harassment":
    "嫌がらせ的な内容",

  "harassment/threatening":
    "脅迫を伴う嫌がらせ",

  "hate":
    "差別的な内容",

  "hate/threatening":
    "脅迫を伴う差別的な内容",

  "illicit":
    "違法行為に関する内容",

  "illicit/violent":
    "暴力を伴う違法行為に関する内容",

  "self-harm":
    "自傷行為に関する内容",

  "self-harm/instructions":
    "自傷行為の手段に関する内容",

  "self-harm/intent":
    "自傷の意図に関する内容",

  "sexual":
    "性的な内容",

  "sexual/minors":
    "未成年に関する性的な内容",

  "violence":
    "暴力的な内容",

  "violence/graphic":
    "グロテスクな暴力描写"
};


export function buildModerationInput(
  currentData
) {
  const textParts =
    [
      currentData.shopName,
      currentData.title,
      currentData.content
    ]
      .map(
        function(value) {
          return String(
            value || ""
          )
            .trim();
        }
      )
      .filter(
        function(value) {
          return value !== "";
        }
      );

  const inputItems =
    [];

  if (textParts.length > 0) {
    inputItems.push({
      type: "text",
      text: textParts.join("\n")
    });
  }

  const imageUrls =
    Array.isArray(
      currentData.imageUrls
    )
      ? currentData.imageUrls.slice(
          0,
          MAX_MODERATION_IMAGE_COUNT
        )
      : [];

  imageUrls.forEach(
    function(url) {
      if (
        typeof url === "string" &&
        url !== ""
      ) {
        inputItems.push({
          type: "image_url",
          image_url: {
            url: url
          }
        });
      }
    }
  );

  return inputItems;
}


export function classifyModerationError(
  error
) {
  if (
    error &&
    error.isMissingApiKey
  ) {
    return "AI審査の設定に問題があります。";
  }

  if (
    error &&
    error.name === "AbortError"
  ) {
    return "AI審査サーバーへの接続がタイムアウトしました。";
  }

  if (
    error &&
    error.isHttpError
  ) {
    return "AI審査サービスでエラーが発生しました。";
  }

  if (
    error &&
    error.isJsonError
  ) {
    return "AI審査サービスの応答を読み取れませんでした。";
  }

  return "AI審査中にエラーが発生しました。";
}


export async function callOpenAiModeration(
  inputItems
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error(
        "OPENAI_API_KEY が設定されていません。"
      );

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      OPENAI_MODERATION_TIMEOUT_MS
    );

  let response;

  try {
    response =
      await fetch(
        OPENAI_MODERATION_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              "Bearer " + apiKey
          },

          body:
            JSON.stringify({
              model:
                OPENAI_MODERATION_MODEL,

              input:
                inputItems
            }),

          signal:
            controller.signal
        }
      );
  } finally {
    clearTimeout(
      timeoutId
    );
  }

  if (!response.ok) {
    const httpError =
      new Error(
        "OpenAI Moderation APIがエラーを返しました。status=" +
          response.status
      );

    httpError.isHttpError =
      true;

    throw httpError;
  }

  let responseData;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    const parseError =
      new Error(
        "OpenAI Moderation APIの応答を解析できませんでした。"
      );

    parseError.isJsonError =
      true;

    throw parseError;
  }

  if (
    !responseData ||
    !Array.isArray(
      responseData.results
    )
  ) {
    const shapeError =
      new Error(
        "OpenAI Moderation APIの応答形式が不正です。"
      );

    shapeError.isJsonError =
      true;

    throw shapeError;
  }

  return responseData.results;
}


// Ver1.8 Phase1｜候補1件分の入力値をサニタイズする。文字列は最大長で
// 切り詰め、想定外の型は空文字/nullへ落とす。ここを通った値だけが
// AIへのプロンプトに含まれる。
function sanitizeAiConciergeCandidate(
  rawCandidate
) {
  if (
    !rawCandidate ||
    typeof rawCandidate !== "object"
  ) {
    return null;
  }

  const id =
    typeof rawCandidate.id === "string"
      ? rawCandidate.id.trim()
      : "";

  if (id === "") {
    return null;
  }

  function clippedText(value, maxLength) {
    return typeof value === "string"
      ? value.trim().slice(0, maxLength)
      : "";
  }

  const distanceKm =
    typeof rawCandidate.distanceKm === "number" &&
    Number.isFinite(rawCandidate.distanceKm)
      ? Math.round(rawCandidate.distanceKm * 10) / 10
      : null;

  return {
    id: id,

    // Ver1.8 Phase1(設計修正)｜候補プールが一般店舗・地域おすすめ・⚡・🔥・
    // ✨の複数情報源から構成されるため、AIへの説明用ラベルとしてsourceTypeを
    // 追加する。値の妥当性(候補選定条件)はクライアント側の各select...ForAiConcierge()
    // で既に確定済みのため、ここでは文字列としての最大長切り詰めのみ行う。
    sourceType: clippedText(
      rawCandidate.sourceType,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.sourceType
    ),

    title: clippedText(
      rawCandidate.title,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.title
    ),

    category: clippedText(
      rawCandidate.category,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.category
    ),

    area: clippedText(
      rawCandidate.area,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.area
    ),

    availabilityHint: clippedText(
      rawCandidate.availabilityHint,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.availabilityHint
    ),

    // Ver1.8 Phase1(重要情報優先の確認・修正)｜"factual_info"候補にのみ
    // クライアント側で付与される短い事実要約。他のsourceTypeでは空文字。
    factSummary: clippedText(
      rawCandidate.factSummary,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.factSummary
    ),

    distanceKm: distanceKm,

    // AIコンシェルジュ Phase2｜候補の「事実落ち」対策。実際にFirestoreへ
    // 保存されている既存フィールド(shopName/content/address/websiteUrl/
    // expiresAt由来)だけをclippedTextで短く切り詰めて渡す。存在しない
    // フィールドを新設してはいない。空文字の場合はプロンプト側で
    // 「情報なし」として自然に扱われる(AIへ「無いものは無い」と正直に
    // 伝わる設計、埋め合わせの創作をさせない)。
    shopName: clippedText(
      rawCandidate.shopName,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.shopName
    ),

    contentExcerpt: clippedText(
      rawCandidate.contentExcerpt,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.contentExcerpt
    ),

    locationLabel: clippedText(
      rawCandidate.locationLabel,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.locationLabel
    ),

    // 期限切れ除外は既存の候補選定ロジック(getVisibleShops()等)で
    // この候補プールへ入る前に完了済み。ここで渡すのは「あとどれくらい
    // 有効か」という付随情報のみで、AI自身に期限切れ判定をさせるための
    // ものではない(プロンプト側にも明記する)。
    validUntilHint: clippedText(
      rawCandidate.validUntilHint,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.validUntilHint
    ),

    // AIが「URLを確認した」等の未確認表現を生成しないよう、プロンプト側で
    // 「出典表示用の情報であり、AIはこのURLへアクセスしていない」と
    // 明記した上で渡す。
    sourceUrl: clippedText(
      rawCandidate.sourceUrl,
      AI_CONCIERGE_FIELD_MAX_LENGTHS.sourceUrl
    )
  };
}


function sanitizeAiConciergeCandidateList(
  rawCandidates
) {
  if (!Array.isArray(rawCandidates)) {
    return [];
  }

  const sanitizedCandidates =
    [];

  for (
    let candidateIndex = 0;
    candidateIndex < rawCandidates.length &&
      sanitizedCandidates.length < AI_CONCIERGE_MAX_CANDIDATES;
    candidateIndex += 1
  ) {
    const sanitizedCandidate =
      sanitizeAiConciergeCandidate(
        rawCandidates[candidateIndex]
      );

    if (sanitizedCandidate) {
      sanitizedCandidates.push(
        sanitizedCandidate
      );
    }
  }

  return sanitizedCandidates;
}


// 会話型マチナウAI Phase1(MVP)｜クライアントから送られてきた直近の会話
// 履歴を検証する。role・textの型を厳密にチェックし、不正な要素は黙って
// 除外する(既存のsanitizeAiConciergeCandidate系と同じ「信頼しない」方針)。
// 末尾側(＝新しい方)からAI_CONCIERGE_CHAT_MAX_HISTORY_ITEMS件だけを残す
// (クライアント側で既に制限している想定だが、サーバー側でも二重に守る)。
function sanitizeAiConciergeChatHistory(
  rawHistory
) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }

  const sanitizedHistory =
    [];

  rawHistory.forEach(
    function(rawItem) {
      if (
        !rawItem ||
        typeof rawItem !== "object"
      ) {
        return;
      }

      const role =
        rawItem.role === "assistant" ||
        rawItem.role === "user"
          ? rawItem.role
          : "";

      const text =
        typeof rawItem.text === "string"
          ? rawItem.text
              .trim()
              .slice(0, AI_CONCIERGE_CHAT_HISTORY_TEXT_MAX_LENGTH)
          : "";

      if (
        role === "" ||
        text === ""
      ) {
        return;
      }

      sanitizedHistory.push(
        { role: role, text: text }
      );
    }
  );

  if (
    sanitizedHistory.length >
    AI_CONCIERGE_CHAT_MAX_HISTORY_ITEMS
  ) {
    return sanitizedHistory.slice(
      sanitizedHistory.length -
        AI_CONCIERGE_CHAT_MAX_HISTORY_ITEMS
    );
  }

  return sanitizedHistory;
}


function sanitizeAiConciergeWeather(
  rawWeather
) {
  if (
    !rawWeather ||
    typeof rawWeather !== "object"
  ) {
    return null;
  }

  function numberOrNull(value) {
    return typeof value === "number" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  return {
    temperatureC: numberOrNull(rawWeather.temperatureC),
    feelsLikeC: numberOrNull(rawWeather.feelsLikeC),
    chanceOfRain: numberOrNull(rawWeather.chanceOfRain),
    windKph: numberOrNull(rawWeather.windKph),
    uvIndex: numberOrNull(rawWeather.uvIndex),

    conditionText:
      typeof rawWeather.conditionText === "string"
        ? rawWeather.conditionText
            .trim()
            .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.conditionText)
        : ""
  };
}


// マチナウAI旅行相棒化 Phase1｜会話モード専用の天気サニタイザ。既存の
// sanitizeAiConciergeWeather()(単発提案✨用)は一切変更せず、この新関数を
// handleAiConciergeChatRequest()からだけ使う。heatIndexC/gustKph/sunset/
// sunriseは既にapi/weather.jsが返している値をそのまま通すだけで、新しい
// 取得・計算は行わない。
function sanitizeAiConciergeChatWeather(
  rawWeather
) {
  const baseWeather =
    sanitizeAiConciergeWeather(
      rawWeather
    );

  if (!baseWeather) {
    return null;
  }

  function numberOrNull(value) {
    return typeof value === "number" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  function timeStringOrEmpty(value) {
    return typeof value === "string"
      ? value.trim().slice(0, 20)
      : "";
  }

  return Object.assign(
    {},
    baseWeather,
    {
      heatIndexC: numberOrNull(rawWeather.heatIndexC),
      gustKph: numberOrNull(rawWeather.gustKph),
      sunset: timeStringOrEmpty(rawWeather.sunset),
      sunrise: timeStringOrEmpty(rawWeather.sunrise)
    }
  );
}


// AIコンシェルジュ Phase2｜api/weather.jsが既存の1回のforecast.json
// 呼び出し(days=1)から抽出した「現在時刻以降の時間別予報」をそのまま
// 中継する。ここでは新たな取得は行わず、件数・各項目の長さだけを
// 安全側に検証・切り詰める。
function sanitizeAiConciergeNextHours(
  rawNextHours
) {
  if (!Array.isArray(rawNextHours)) {
    return [];
  }

  function numberOrNull(value) {
    return typeof value === "number" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  return rawNextHours
    .slice(
      0,
      AI_CONCIERGE_NEXT_HOURS_MAX_COUNT
    )
    .map(
      function(hourEntry) {
        return {
          time:
            typeof hourEntry.time === "string"
              ? hourEntry.time.trim().slice(0, 5)
              : "",

          chanceOfRain: numberOrNull(hourEntry.chanceOfRain),

          condition:
            typeof hourEntry.condition === "string"
              ? hourEntry.condition
                  .trim()
                  .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.conditionText)
              : "",

          temperatureC: numberOrNull(hourEntry.temperatureC),
          windKph: numberOrNull(hourEntry.windKph)
        };
      }
    );
}


// マチナウAI旅行相棒化 Phase1.1｜会話モード専用。既存のsanitizeAiConcierge
// NextHours()(単発提案✨用)は一切変更せず、この新関数をhandleAiConcierge
// ChatRequest()からだけ使う。今回の誤答(今日21時/22時のデータを明日の
// 判断に使った)の根本原因が「時刻だけで日付が無い」ことだったため、
// 各時間帯にdate(YYYY-MM-DD)を必ず含める。
const AI_CONCIERGE_CHAT_TOMORROW_HOURS_MAX_COUNT =
  6;

function sanitizeAiConciergeChatHourEntry(
  hourEntry
) {
  function numberOrNull(value) {
    return typeof value === "number" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  return {
    date:
      typeof hourEntry.date === "string"
        ? hourEntry.date.trim().slice(0, 10)
        : "",

    time:
      typeof hourEntry.time === "string"
        ? hourEntry.time.trim().slice(0, 5)
        : "",

    chanceOfRain: numberOrNull(hourEntry.chanceOfRain),

    condition:
      typeof hourEntry.condition === "string"
        ? hourEntry.condition
            .trim()
            .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.conditionText)
        : "",

    temperatureC: numberOrNull(hourEntry.temperatureC),
    windKph: numberOrNull(hourEntry.windKph)
  };
}

function sanitizeAiConciergeChatNextHours(
  rawNextHours
) {
  if (!Array.isArray(rawNextHours)) {
    return [];
  }

  return rawNextHours
    .slice(0, AI_CONCIERGE_NEXT_HOURS_MAX_COUNT)
    .map(sanitizeAiConciergeChatHourEntry);
}

function sanitizeAiConciergeTomorrowHours(
  rawTomorrowHours
) {
  if (!Array.isArray(rawTomorrowHours)) {
    return [];
  }

  return rawTomorrowHours
    .slice(0, AI_CONCIERGE_CHAT_TOMORROW_HOURS_MAX_COUNT)
    .map(sanitizeAiConciergeChatHourEntry);
}

function sanitizeAiConciergeTimeString(
  rawValue
) {
  return typeof rawValue === "string"
    ? rawValue.trim().slice(0, 20)
    : "";
}


// AIコンシェルジュ Phase2｜沖縄本島 北部/中部/南部の代表地点3つの現在天候を
// 比較材料として渡す。地点自体はクライアント側(app.js)の固定座標×既存
// /api/weather.jsの共有キャッシュ(15分)経由で取得済みのものを中継する
// だけで、このFunction自体が追加でWeatherAPIを呼ぶことはない。
function sanitizeAiConciergeRegionalWeather(
  rawRegionalWeather
) {
  if (!Array.isArray(rawRegionalWeather)) {
    return [];
  }

  function numberOrNull(value) {
    return typeof value === "number" &&
      Number.isFinite(value)
      ? value
      : null;
  }

  return rawRegionalWeather
    .slice(
      0,
      AI_CONCIERGE_REGIONAL_WEATHER_MAX_COUNT
    )
    .map(
      function(regionEntry) {
        return {
          region:
            regionEntry &&
            typeof regionEntry.region === "string"
              ? regionEntry.region
                  .trim()
                  .slice(0, AI_CONCIERGE_REGION_LABEL_MAX_LENGTH)
              : "",

          conditionText:
            regionEntry &&
            typeof regionEntry.conditionText === "string"
              ? regionEntry.conditionText
                  .trim()
                  .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.conditionText)
              : "",

          chanceOfRain:
            regionEntry
              ? numberOrNull(regionEntry.chanceOfRain)
              : null,

          temperatureC:
            regionEntry
              ? numberOrNull(regionEntry.temperatureC)
              : null
        };
      }
    )
    .filter(
      function(regionEntry) {
        return regionEntry.region !== "";
      }
    );
}


// Ver1.8 Phase1｜候補外の場所を生成させないための指示を明記する。
// 「候補リストの中からIDで1件選ぶ」以外の振る舞いを許可しない。
// AIコンシェルジュ Phase2｜「お天気アプリ」に見える問題への対応。
// 変更点：(1)候補データにshopName/contentExcerpt/locationLabel/
// validUntilHint/sourceUrlを追加(事実落ち対策、既存フィールドの
// allowlistのみ、新規データは作らない)、(2)nextHours(当日の直近数時間の
// 予報)・regionalWeather(本島北中南の代表地点)を判断材料として追加、
// (3)reasonShortを「一文」から「状況→提案→(必要なら)代替案」の2〜4文へ、
// (4)shouldReopenLater/reopenReasonTypeという小さな構造化値を追加し、
// 「また開いて」の文言自体はUI側の固定文で出す設計にする(AIに毎回
// 決まり文句を自由生成させない)。優先順位(factual_info最優先・捏造禁止・
// 候補外を作らない)という既存の安全思想は一切変更しない。
function buildAiConciergePrompt(
  payload
) {
  const languageLabel =
    payload.language === "en" ? "English" : "Japanese";

  const systemInstruction =
    "You are Machinau's travel concierge. Machinau is not a weather app — " +
    "your job is to read the traveler's current situation (location, time, " +
    "weather, and what's actually happening in the area right now) and help " +
    "them decide what to do next, the way a knowledgeable local friend would. " +
    "Each candidate in the JSON \"candidates\" array has a \"sourceType\" " +
    "describing what kind of information it is: \"factual_info\" " +
    "(safety/important real-time info, such as typhoons, warnings, " +
    "evacuation notices, transport suspensions, facility closures, or " +
    "last-minute schedule changes), \"official_today\" (official Machinau " +
    "operator post), \"traveler_suggestion\" (curated event/sightseeing " +
    "pick), \"region_recommendation\" (editorial regional recommendation), " +
    "or \"shop\" (a regular shop/venue listing). " +
    "PRIORITY RULE: if any \"factual_info\" candidate is relevant to the " +
    "traveler's area or plans right now, you MUST treat it as higher " +
    "priority than any regular shop, sightseeing, or event candidate, even " +
    "if a regular candidate would otherwise seem like a nicer suggestion. " +
    "Do not ignore a relevant closure, warning, or safety notice just to " +
    "recommend something more appealing. Stay calm and factual — do not " +
    "exaggerate risk or cause unnecessary alarm. " +
    "You must choose exactly ONE candidate from the array that is most " +
    "meaningful for this traveler right now. " +
    "\n\nDATA YOU MAY USE PER CANDIDATE: beyond title/category/area/" +
    "distanceKm/availabilityHint/factSummary, some candidates also include " +
    "\"shopName\" (the actual place name), \"contentExcerpt\" (a short " +
    "excerpt of the original post text — may already mention a specific " +
    "time, place, or detail; you may restate what it says but never expand " +
    "beyond it), \"locationLabel\" (a short address/place description), " +
    "\"validUntilHint\" (how much longer this specific candidate stays " +
    "valid — this is informational only; every candidate in this list has " +
    "ALREADY been confirmed to be currently valid by Machinau's own systems " +
    "before reaching you, so never question or reason about whether a " +
    "candidate might be expired), and \"sourceUrl\" (a source link shown to " +
    "the traveler for attribution only — you have NOT visited this URL and " +
    "must never say things like \"according to the official site\" or \"I " +
    "checked the website\"; you may only say a source link is available). " +
    "Any of these fields may be empty — if a fact is not given, treat it as " +
    "unknown and do not guess or invent it. " +
    "\n\nWEATHER DATA: \"weather\" is the current condition at the " +
    "traveler's own location. \"nextHours\" (if present) is an ordered list " +
    "of upcoming hourly forecasts for today only, starting from the current " +
    "hour — you may describe how the weather is expected to change (e.g., " +
    "rain easing, wind picking up) using ONLY the hours actually provided; " +
    "never state a specific future time or condition that is not one of the " +
    "given entries, and never assume what happens after the last entry " +
    "provided. \"regionalWeather\" (if present) compares the current " +
    "condition in up to three broad areas of Okinawa's main island (north/" +
    "central/south) — you may use this to note that another part of the " +
    "island has notably different weather, but only suggest moving there if " +
    "a candidate in the list is actually relevant to that area; never " +
    "suggest moving somewhere just because the weather sounds nicer if " +
    "there is no relevant candidate there. " +
    "\n\nABSOLUTELY FORBIDDEN: inventing a shop, place, or event not in the " +
    "candidates list; inventing business hours, prices, dates, or other " +
    "facts not present in the given data; inferring whether a place is open " +
    "or closed purely from the weather; recommending a candidate with no " +
    "stated reason beyond \"the weather is bad/good\" (a shop-ad-like " +
    "recommendation); claiming to have visited a sourceUrl; restating a " +
    "candidate's own facts beyond what its fields actually say. " +
    "\n\nANSWER SHAPE for \"reasonShort\": write 2 to 4 short, natural " +
    "sentences (not one, and not a long article) in " + languageLabel + " " +
    "that a person can read at a glance on a phone screen. Structure: " +
    "(1) briefly describe the relevant part of the current situation " +
    "(weather/time/area/an active factual_info notice, whichever is most " +
    "relevant), (2) say what that means to do right now, referencing the " +
    "chosen candidate using only its given facts, (3) if genuinely useful, " +
    "add one short alternative or caveat. Do not pad with filler sentences " +
    "just to reach the sentence count — if the situation is simple, 2 " +
    "sentences is fine. When you choose a \"factual_info\" candidate, state " +
    "the key fact plainly and what it means for the traveler's plans right " +
    "now (fact -> what to do), using its \"factSummary\"/\"contentExcerpt\" " +
    "in your own words without adding facts beyond them. " +
    "If, and only if, another candidate in the array is a reasonable nearby " +
    "alternative, you may name it in \"cautionNote\" by copying its exact " +
    "\"title\" text from the candidates array — never invent an alternative " +
    "name that is not one of the provided candidates' titles. Otherwise set " +
    "\"cautionNote\" to null. " +
    "\n\nRE-OPEN SIGNAL: set \"shouldReopenLater\" to true only if this " +
    "specific suggestion's relevance would meaningfully change if the " +
    "traveler's weather, time, or location changes later (this will be " +
    "common), and false if it is a one-time fact that will not change by " +
    "being re-checked (e.g., a fixed factual notice). If true, set " +
    "\"reopenReasonType\" to exactly one of \"weather\", \"time\", " +
    "\"location\", or \"availability\" — whichever is the main reason this " +
    "suggestion could change. If false, set \"reopenReasonType\" to null. " +
    "Do not write any re-open/come-back phrasing inside \"reasonShort\" or " +
    "\"cautionNote\" yourself — that message is handled separately by the " +
    "app's own interface. " +
    "\n\nThe value of \"suggestedCandidateId\" in your response MUST be " +
    "exactly one of the \"id\" values in the candidates array, copied " +
    "verbatim (do not strip or alter its prefix). " +
    "Reply with a single JSON object only, with exactly these keys: " +
    "\"suggestedCandidateId\" (string, one of the candidate ids), " +
    "\"reasonShort\" (string, 2-4 short sentences written in " + languageLabel + "), " +
    "\"cautionNote\" (string in " + languageLabel + ", or null), " +
    "\"shouldReopenLater\" (boolean), " +
    "\"reopenReasonType\" (one of \"weather\", \"time\", \"location\", " +
    "\"availability\", or null). " +
    "No extra text before or after the JSON object.";

  const userContent =
    JSON.stringify({
      area: payload.area,
      currentTime: payload.currentTime,
      weather: payload.weather,
      nextHours: payload.nextHours,
      regionalWeather: payload.regionalWeather,
      candidates: payload.candidates
    });

  return {
    systemInstruction: systemInstruction,
    userContent: userContent
  };
}


// callOpenAiModeration()と同じfetchベースの呼び出し方式(SDK不使用、
// AbortControllerによるタイムアウト)を踏襲する。エンドポイント・モデル・
// レスポンス形式(json_object)のみ異なる。
async function callOpenAiConcierge(
  payload
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error(
        "OPENAI_API_KEY が設定されていません。"
      );

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const prompt =
    buildAiConciergePrompt(
      payload
    );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      AI_CONCIERGE_TIMEOUT_MS
    );

  let response;

  try {
    response =
      await fetch(
        AI_CONCIERGE_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              "Bearer " + apiKey
          },

          body:
            JSON.stringify({
              model:
                AI_CONCIERGE_MODEL,

              response_format:
                { type: "json_object" },

              messages: [
                {
                  role: "system",
                  content: prompt.systemInstruction
                },
                {
                  role: "user",
                  content: prompt.userContent
                }
              ]
            }),

          signal:
            controller.signal
        }
      );
  } finally {
    clearTimeout(
      timeoutId
    );
  }

  if (!response.ok) {
    const httpError =
      new Error(
        "OpenAI APIがエラーを返しました。status=" +
          response.status
      );

    httpError.isHttpError =
      true;

    throw httpError;
  }

  let responseData;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    const parseError =
      new Error(
        "OpenAI APIの応答を解析できませんでした。"
      );

    parseError.isJsonError =
      true;

    throw parseError;
  }

  const messageContent =
    responseData &&
    Array.isArray(responseData.choices) &&
    responseData.choices[0] &&
    responseData.choices[0].message &&
    typeof responseData.choices[0].message.content === "string"
      ? responseData.choices[0].message.content
      : "";

  if (messageContent === "") {
    const shapeError =
      new Error(
        "OpenAI APIの応答形式が不正です。"
      );

    shapeError.isJsonError =
      true;

    throw shapeError;
  }

  try {
    return JSON.parse(
      messageContent
    );
  } catch (contentParseError) {
    const invalidJsonError =
      new Error(
        "AI応答のJSON解析に失敗しました。"
      );

    invalidJsonError.isJsonError =
      true;

    throw invalidJsonError;
  }
}


// サーバー側での候補ID一致検証(必須)。ここを通らない応答は一切採用せず、
// 呼び出し元がsuccess:falseを返してクライアント側のルールベース
// フォールバックへ委ねる。
function isValidAiConciergeSuggestion(
  suggestion,
  candidates
) {
  if (
    !suggestion ||
    typeof suggestion !== "object"
  ) {
    return false;
  }

  if (
    typeof suggestion.suggestedCandidateId !== "string" ||
    suggestion.suggestedCandidateId === ""
  ) {
    return false;
  }

  const matchesCandidate =
    candidates.some(
      function(candidate) {
        return (
          candidate.id ===
          suggestion.suggestedCandidateId
        );
      }
    );

  if (!matchesCandidate) {
    return false;
  }

  if (
    typeof suggestion.reasonShort !== "string" ||
    suggestion.reasonShort.trim() === ""
  ) {
    return false;
  }

  return true;
}


// ============================================================
// 会話型マチナウAI Phase1(MVP)
// ============================================================
// 既存の単発提案(buildAiConciergePrompt/callOpenAiConcierge/
// handleAiConciergeRequest)には一切手を入れない。新しい会話モード専用の
// プロンプト・呼び出し・ハンドラをここに追加するだけにとどめる。

// 「街の今を見て、あなたの今を聞いて、一緒に次の行動を決めるAI」という
// 本部方針の人格定義をそのまま指示にする。既存の単発提案プロンプトと
// 同様、候補の事実以上を創作しないこと・factual_info(街を見るAIの
// 確認済み一次情報)を最優先することを明記する。今回は「候補から必ず
// 1つ選ぶ」制約を外し、候補はあくまで参考情報として扱わせる。
function buildAiConciergeChatInstructions(
  language
) {
  const languageLabel =
    language === "en" ? "English" : "Japanese";

  return (
    "You are Machinau, a travel companion AI for people exploring Okinawa " +
    "right now. Your core role: \"see what's happening in the town right " +
    "now, and share only what's actually worth knowing.\" Most turns, this " +
    "means being brief — you are not trying to pull the traveler into an " +
    "extended chat, and it is normal for the conversation to end after a " +
    "short reply. Only when the traveler actually states a specific " +
    "condition, destination, or question do you switch into a deeper, " +
    "back-and-forth travel-planning conversation (see MESSAGE TYPE below). " +
    "You are not writing a one-shot travel article or itinerary generator " +
    "either way. " +
    "\n\nSTYLE: reply in " + languageLabel + ", in short natural sentences " +
    "a person can read at a glance on a phone screen (see MESSAGE TYPE/" +
    "LIGHT RESPONSE below for exactly how short a LIGHT turn should be). " +
    "On a SPECIFIC turn, do not decide everything in one go — when " +
    "genuinely useful, end with one short, natural question (e.g. what to " +
    "eat, whether to stop somewhere, what time works) instead of a wall of " +
    "suggestions; a LIGHT turn follows the separate LIGHT RESPONSE rules " +
    "instead and does not end with a forced question. Be warm but " +
    "efficient, like a knowledgeable local friend texting back, not a " +
    "brochure. Light, natural warmth is fine, but do not mechanically " +
    "attach the same tic (e.g. a laugh marker) to every message. " +
    "\n\nCONTEXT YOU RECEIVE: each user turn includes the traveler's " +
    "message plus a JSON block of Machinau's own current data: area, " +
    "currentTime, weather, nextHours (TODAY's remaining hourly forecast " +
    "only, in order, starting from now), tomorrowHours (a handful of " +
    "representative checkpoint hours for TOMORROW, present only when " +
    "available), tomorrowSunset/tomorrowSunrise (tomorrow's own values, " +
    "separate from weather.sunset/weather.sunrise which are today's), " +
    "regionalWeather (north/central/south Okinawa comparison), and " +
    "candidates (places/posts Machinau's own systems already know about " +
    "right now). Every entry inside nextHours and tomorrowHours carries " +
    "its own \"date\" (YYYY-MM-DD) field — always read it. Each candidate " +
    "has a \"sourceType\": " +
    "\"factual_info\" (safety/important real-time info such as typhoons, " +
    "warnings, closures, transport suspensions, or schedule changes), " +
    "\"official_today\" (official Machinau operator post), " +
    "\"traveler_suggestion\" (curated event/sightseeing pick), " +
    "\"region_recommendation\" (editorial regional pick), or \"shop\" (a " +
    "regular shop/venue's own direct post). " +
    "\n\nPRIORITY RULE: if a \"factual_info\" candidate is relevant to the " +
    "traveler's area or plans, you MUST mention it and treat it as higher " +
    "priority than any regular shop/sightseeing/event suggestion, even if " +
    "another candidate seems more appealing. Never bury or skip a relevant " +
    "closure, warning, suspension, or safety notice. This applies " +
    "regardless of whether the turn is LIGHT or SPECIFIC (see MESSAGE TYPE " +
    "below) — a real safety/closure notice always overrides the lighter " +
    "LIGHT RESPONSE behavior. Stay calm and factual — do not exaggerate " +
    "risk. " +

    "\n\nMESSAGE TYPE (decide this first, silently, before anything else): " +
    "classify the traveler's latest message as either LIGHT or SPECIFIC. " +
    "LIGHT = a short, open-ended message with no concrete condition, " +
    "destination, or question attached yet — for example \"ノープラン\", " +
    "\"何かある？\", \"今どうしよう\", \"近場で楽しみたい\", \"なんかない？\", " +
    "\"暇だな\", \"雨でも楽しみたい\", or an equivalent vague opener in any " +
    "language. SPECIFIC = the traveler states an actual condition, " +
    "constraint, destination, timeframe, or a direct question to think " +
    "through together — for example \"明日の南部プランを考えて\", \"車なしで" +
    "美浜まで行きたい\", \"雨でも子どもと遊べるところある？\", \"夕方まで3時間" +
    "ある\", \"一人で行ける場所を教えて\", \"このあと那覇へ行きたい\", \"近くで" +
    "沖縄そばを食べたい\". If the " +
    "message is LIGHT, use the LIGHT RESPONSE process directly below " +
    "instead of BEFORE YOU ANSWER. If the message is SPECIFIC, use BEFORE " +
    "YOU ANSWER and everything below it exactly as described (nothing " +
    "there is changed or weakened by adding LIGHT). When in doubt and the " +
    "message contains no concrete condition/destination/question, treat it " +
    "as LIGHT. Once the traveler gives a SPECIFIC detail later in the same " +
    "conversation, switch to SPECIFIC from that turn onward as normal. " +

    "\n\nLIGHT RESPONSE: keep the reply to about 2 to 3 short sentences — " +
    "shorter than a SPECIFIC reply, readable in a glance. Mention the " +
    "current area/time/weather only if genuinely relevant (e.g. rain " +
    "coming soon); otherwise it's fine to skip weather entirely. Then, " +
    "using ONLY sourceTypes that actually have at least one candidate this " +
    "turn, tell the traveler WHICH KINDS of information exist right now — " +
    "do NOT name, describe, or single out a specific shop/place/product " +
    "(the factual_info safety exception in the LIGHT — NO NAMES RULE below " +
    "is the only exception). For example: if shop candidates exist " +
    "(sourceType \"shop\" with category other than \"街の発見\" — see rule " +
    "I), say something like \"お店からのお知らせも届いてるよ\" without naming " +
    "which shop; if traveler_suggestion/official_today candidates exist, " +
    "add something like \"街のイベントも届いてるよ\" without naming the " +
    "event; if a region_recommendation exists, you may mention that too; " +
    "if a street-discovery post (category \"街の発見\" — see rule I) " +
    "exists, add something like \"街で見つけた情報も届いてるよ\". Then point " +
    "the traveler to the actual candidate list already shown on the " +
    "screen below the chat instead of picking one for them — e.g. \"気にな" +
    "るものがあれば、下の候補から探してみて！\" (or an equivalent in the " +
    "reply language). Do not force in every kind — mention only the kinds " +
    "that actually have a candidate this turn; mentioning just one kind, " +
    "or nothing beyond area/weather, is completely fine when that's all " +
    "that's genuinely there. Never mention a kind of information (shop " +
    "news, an event, a street-discovery post, a region recommendation) " +
    "that has zero matching candidates this turn just to sound complete " +
    "— staying silent about a kind is correct when nothing exists for it " +
    "this turn. Do not ask the traveler about their car, whether they're " +
    "alone, how long they're staying, or where they want to go — those " +
    "are SPECIFIC-turn questions, not LIGHT ones. End with a low-key, " +
    "low-pressure line such as \"気になったら聞いてね\" (or an equivalent in " +
    "the reply language) rather than a specific question, and vary the " +
    "wording rather than reusing one fixed sentence. It is completely " +
    "normal for the conversation to end here if the traveler doesn't " +
    "reply again. Do not use web search just to fill in a kind of " +
    "information that has no candidate — web search on a LIGHT turn " +
    "should be rare, since there is usually nothing specific yet to look " +
    "up. " +

    "\n\nLIGHT — NO NAMES RULE (critical): on a LIGHT turn, never name a " +
    "specific shop, facility, product, or event, never single out one " +
    "candidate as \"the\" pick, and never tell the traveler what to do " +
    "(e.g. \"○○へ行こう\", \"○○がおすすめ\", \"まず○○して\"). Deciding on and " +
    "naming a specific place is what SPECIFIC turns are for — on LIGHT, " +
    "you announce what KINDS of information exist and point the traveler " +
    "to the candidate list on screen, nothing more. The ONE exception is a " +
    "genuinely relevant factual_info safety/closure/service-disruption " +
    "notice (typhoon, warning, suspension, closure, road restriction, " +
    "etc.) — because it directly affects the traveler's safety and " +
    "immediate decisions, you may and should use its specific name/details " +
    "even on a LIGHT turn (see PRIORITY RULE above). This safety exception " +
    "never extends to regular shops, events, or street-discovery posts on " +
    "a LIGHT turn. " +

    "\n\nBEFORE YOU ANSWER (SPECIFIC turns only — see MESSAGE TYPE above; " +
    "LIGHT turns use LIGHT RESPONSE above instead): silently work through " +
    "this order in your own reasoning before writing a single word of " +
    "your reply. Never show this " +
    "reasoning, its steps, or its labels to the traveler — only the final " +
    "reply text. " +
    "1) WHEN — which calendar date is the traveler actually talking about " +
    "right now (see rule D2 for how to pin this down without mixing dates). " +
    "2) WHERE — the traveler's current area and, if mentioned, their " +
    "destination or direction of travel. " +
    "3) WEATHER EXPERIENCE — of the data that actually exists for that " +
    "date and area, pick out only the parts that would actually change how " +
    "the traveler feels or acts (see rule A and WEATHER DATA SELECTION " +
    "below) — you do not need to mention every field. " +
    "4) HUMAN — traveling alone or with others, first time in Okinawa or " +
    "not, with or without a car, whether they've eaten, any fatigue hinted " +
    "at in the conversation, what they said they want, and what they've " +
    "already accepted or declined this conversation. Never guess what " +
    "wasn't actually said (see rule C and H). " +
    "5) MACHINAU NOW — check factual_info, official_today, shop direct " +
    "posts, and other candidates for anything genuinely tied to this " +
    "person's situation right now (see rules F and G); if nothing fits, " +
    "don't invent something. " +
    "6) FEASIBILITY — given business hours, transport, the current/planned " +
    "time, weather, the trip back, and how full the day already is, is the " +
    "move you're about to suggest actually realistic (see rule E and " +
    "CAR-FREE TRAVEL below)? " +
    "7) COMPANION RESPONSE — only now, write the reply, integrating the " +
    "above into a natural \"how they'll likely feel → what would feel good " +
    "or easy given that → one thing to decide together next\" flow (see " +
    "RESPONSE SHAPE below), rather than listing data points followed by a " +
    "generic suggestion. Before finalizing, silently ask yourself: \"if " +
    "this traveler is new to Okinawa, alone, and without a car, can they " +
    "read this and know what to do next without feeling like a plan is " +
    "being pushed on them?\" If the answer is no, revise the reply — never " +
    "output this self-check itself. " +

    "\n\nRESPONSE SHAPE (SPECIFIC turns; LIGHT turns follow LIGHT RESPONSE " +
    "above instead): prefer the order \"how the traveler will likely " +
    "feel right now / this period\" → \"what that makes comfortable or " +
    "pleasant to do\" → \"the one thing to figure out together next\", " +
    "over reciting data followed by a generic recommendation. Never reuse " +
    "a fixed template sentence-for-sentence — restate this shape freely in " +
    "your own words each time, driven by whatever the actual data says " +
    "this turn. " +

    "\n\nWEATHER DATA SELECTION: you do not need to recite every weather " +
    "field. Before answering, check what's actually present, and mention " +
    "only what would change the traveler's experience or choices — for " +
    "example: a meaningful uvIndex → sun protection; a feelsLikeC/wind " +
    "combination that changes how hot or cool it actually feels; a " +
    "regionalWeather difference → which direction to lean toward; a rain " +
    "window in nextHours/tomorrowHours → swapping meal/rest/indoor time " +
    "with outdoor time around it; a sunset that matters for the plan → how " +
    "much outdoor/beach time is left. Do not force in a field that has no " +
    "real bearing on this reply. " +

    "\n\nCAR-FREE TRAVEL: \"no car\" should not just mean \"suggest fewer " +
    "things.\" When the traveler has no car, factor in, as relevant: the " +
    "trip back, transfers and waiting time, keeping the itinerary flowing " +
    "in one general direction instead of zigzagging, and the extra burden " +
    "public transport adds during rain. You have NOT been given real " +
    "transit schedules or travel-time data — never invent specific bus/" +
    "monorail/ferry times or exact transfer durations; if a specific " +
    "transit detail would change your answer, use web search, and if you " +
    "still can't confirm it, say plainly that it needs checking. " +

    "\n\nA. WEATHER → HUMAN EXPERIENCE: never just read out numbers. " +
    "The weather block may include temperatureC, feelsLikeC, heatIndexC, " +
    "windKph, gustKph, uvIndex, chanceOfRain, and conditionText, plus " +
    "nextHours, tomorrowHours (when present), and regionalWeather (north/" +
    "central/south comparison). Combine whichever of these are actually " +
    "present — for the correct date, see rule D below — into what it " +
    "means for the traveler and what to do about it. For example: weigh " +
    "feelsLikeC/heatIndexC and wind together rather than temperatureC " +
    "alone; if it looks cloudy but uvIndex is high, mention sun protection " +
    "anyway; if rain is only expected for a short window, suggest " +
    "reordering that part of the day (e.g. do a meal or indoor stop during " +
    "that window) rather than moving everything indoors; if regionalWeather " +
    "shows the traveler's area differs from another region, do not " +
    "describe Okinawa as if it has one single weather; treat strong wind/" +
    "gusts as relevant to beach or outdoor plans. Never apply a fixed rule " +
    "like \"Okinawa is always hot/cold at X°C\" — always reason from the " +
    "actual numbers given this turn. If a sunset/sunrise value for the " +
    "relevant day is present, you may use it together with that day's " +
    "timeline to talk about how much daylight is left (e.g. \"there's " +
    "still good daylight left, so X could wait until later\"), but never " +
    "state a sunset/daylight claim if the field is empty, and never assume " +
    "it becomes fully dark immediately at sunset. " +

    "\n\nB. TRAVEL PACE: you are not optimizing for maximum efficiency. " +
    "Protect room for unhurried meals, moments to just look at the view, " +
    "rest, and changing plans. Do not default to a heavy/large meal " +
    "recommendation in the morning without an actual reason to. Do not " +
    "pack the day full — prefer offering 1 to 3 sensible next options " +
    "and deciding together over dictating a full plan. " +

    "\n\nC. HUMAN CONDITION: if the conversation history suggests the " +
    "traveler may have been active for a while, hasn't eaten yet, or has " +
    "been in the heat for a stretch, it's fine to check in naturally " +
    "(\"tired?\", \"want to sit down for a bit?\"). However, you have NOT " +
    "been given any GPS movement history, step count, or physical " +
    "condition data — never state fatigue, soreness, or physical state " +
    "as a fact (e.g. never say \"you must be exhausted\" or \"your feet " +
    "are probably swollen\" as if confirmed); only ask, don't assert. " +

    "\n\nD. TIME AWARENESS: treat currentTime as a hard real-world " +
    "constraint. Never propose a meal, event, or time-bound activity as if " +
    "it's still upcoming when currentTime shows it has already passed. If " +
    "what the traveler asks for conflicts with currentTime (e.g. asking " +
    "about breakfast in the evening), point that out naturally instead of " +
    "silently going along with it, and offer a sensible alternative. Carry " +
    "forward what was already decided earlier in this conversation " +
    "(accepted suggestions, declined suggestions, plan changes) rather " +
    "than re-deciding from scratch each turn. " +

    "\n\nD2. NEVER MIX DATES (critical): before answering, silently fix " +
    "which calendar date the traveler is actually asking about, using " +
    "currentTime as \"today\". nextHours contains ONLY today's remaining " +
    "hours — never use it to answer a question about tomorrow or any " +
    "other future date, even if a nextHours entry's time (e.g. \"21:00\") " +
    "looks like it could fit. tomorrowHours contains ONLY tomorrow's " +
    "checkpoint hours — never use it for today. Always check each hour " +
    "entry's own \"date\" field and only use entries whose date matches " +
    "the day you are actually answering about; if the traveler asks about " +
    "tomorrow, prefer tomorrowHours (and tomorrowSunset/tomorrowSunrise) " +
    "over nextHours. If the day the traveler is asking about isn't covered " +
    "by nextHours or tomorrowHours at all (e.g. two days from now), and " +
    "the forecast would change your answer, use web search to check it " +
    "for that specific date and location; if you still can't confirm it, " +
    "say plainly that you don't have a confirmed forecast for that day " +
    "yet instead of reusing a different day's numbers. Never present " +
    "tonight's weather as if it were tomorrow's, and never blend two " +
    "different dates' data into one piece of travel advice. " +

    "\n\nE. OPEN NOW / ACCURACY: when recommending a specific shop, " +
    "facility, or event as something to do right now or today, ground it " +
    "in what the candidate data actually says. If whether it's open today, " +
    "its hours, or an event's date would change your answer and " +
    "Machinau's own data doesn't cover it, use web search to check. If you " +
    "still can't confirm it, say so plainly (e.g. \"I couldn't confirm " +
    "today's hours\") instead of guessing. You have NOT been given any " +
    "regular-closing-day data for shops — never state that a place is " +
    "open today, or that today is not its closing day, unless you actually " +
    "confirmed it (via the given data or an actual search this turn). " +

    "\n\nF. SOURCE TRUST: keep these four kinds of information distinct " +
    "and never blur them together: (1) Machinau's own factual_info (the " +
    "town-watching AI's verified real-time info), (2) Machinau's own " +
    "official/curated candidates (official_today, traveler_suggestion, " +
    "region_recommendation), (3) anything found via web search, and (4) a " +
    "shop's own direct post (sourceType \"shop\" with category other than " +
    "\"街の発見\" — see rule I for the street-discovery exception). As " +
    "before, always label a shop candidate as a direct post from the shop " +
    "itself when you mention it. Never describe something you found via " +
    "web search as if it were Machinau's own verified first-hand " +
    "information. " +

    "\n\nG. MACHINAU MOMENT: don't just mechanically list famous " +
    "sightseeing spots. If a candidate is genuinely tied to today, the " +
    "traveler's current location, destination, or timing in a way that " +
    "would actually matter to them, bring it up when it's useful. If " +
    "nothing like that exists in the candidates, it is fine to say so " +
    "(e.g. \"nothing special stands out for today\") rather than inventing " +
    "something. " +

    "\n\nH. MISAKI BASELINE: Machinau's minimum quality bar for a good " +
    "travel-companion experience is modeled on a representative traveler " +
    "named \"Misaki\" — 28 years old, from Tokyo, visiting Okinawa for the " +
    "first time, traveling alone, no car, a 2-night/3-day trip. This does " +
    "NOT mean you should assume every traveler is like Misaki — never " +
    "assume an attribute (age, being alone, no car, first visit, trip " +
    "length, hometown) that the traveler hasn't actually stated. It means " +
    "that when a traveler DOES indicate they are new to the area, " +
    "traveling alone, and/or without a car, you should be especially " +
    "mindful of: the real burden of relying on public transport, waiting " +
    "and transfer time, the trip back, not overpacking the schedule, " +
    "building in rest, and keeping the flow comfortable to do solo — the " +
    "same care you'd want for someone finding their way around completely " +
    "new territory by themselves. " +

    "\n\nI. STREET DISCOVERY POSTS: a candidate with category \"街の発見\" " +
    "is a word-of-mouth post from someone who happened to notice something " +
    "in town — it is NOT a shop's own advertisement, even if its " +
    "sourceType is \"shop\". Never present it as an official/verified " +
    "recommendation, and never phrase it the way you'd phrase a shop's own " +
    "direct announcement. You have NOT been told whether the poster is a " +
    "local resident or a traveler — never say something like \"地元の人か" +
    "ら\"/\"a local told us\" as if that were confirmed; use a neutral " +
    "phrasing instead, such as \"街でこんな投稿が届いてるよ\"/\"こんな街の発見" +
    "が投稿されてるよ\" (or an equivalent neutral phrasing in the reply " +
    "language) that doesn't assign an identity to the poster. " +

    "\n\nWEB SEARCH: you have a web search tool available. Use it only " +
    "when it would genuinely change your answer — for example confirming " +
    "a specific shop/facility's current business hours, whether a named " +
    "place is open today, or a detail about a specific destination the " +
    "traveler asked about that Machinau's own data does not cover. Do NOT " +
    "search reflexively on every turn, and never use web search to " +
    "override or contradict Machinau's own weather or factual_info data " +
    "given to you — those are Machinau's own authoritative, already-" +
    "verified context and take priority over anything found via search. " +
    "\n\nNEVER: invent a shop, place, price, business hour, event date, " +
    "closing day, sunset/daylight time, or fatigue/physical state not " +
    "actually given to you by the candidates, the weather data, the " +
    "conversation, or an actual web search result; use a weather entry " +
    "whose \"date\" doesn't match the day you're actually answering about, " +
    "or otherwise mix data from two different dates into one judgment; " +
    "claim to have visited a sourceUrl you were only given as a citation; " +
    "pretend you checked something you did not actually check; describe a " +
    "shop announcement, event, street-discovery post, or region " +
    "recommendation as existing (on a LIGHT or a SPECIFIC turn) when no " +
    "matching candidate was actually given to you this turn." +
    "\n\nDo not output JSON or any formatting markup — reply with plain " +
    "conversational text only."
  );
}


// Responses API(POST /v1/responses)の"input"は、role付きの発話を並べた
// 配列を受け付ける(user/assistant)。過去の発話はテキストのみ、最新の
// ユーザー発話にだけ現在のマチナウ情報(area/weather/candidates等)を
// JSONとして添えることで、履歴が古い天気情報等で膨らまないようにする。
function buildAiConciergeChatInputItems(
  payload
) {
  const inputItems =
    payload.history.map(
      function(historyItem) {
        return {
          role: historyItem.role,
          content: [
            {
              type:
                historyItem.role === "assistant"
                  ? "output_text"
                  : "input_text",
              text: historyItem.text
            }
          ]
        };
      }
    );

  const currentContextJson =
    JSON.stringify(
      {
        area: payload.area,
        currentTime: payload.currentTime,
        weather: payload.weather,
        nextHours: payload.nextHours,
        // マチナウAI旅行相棒化 Phase1.1｜todayとは別のフィールドとして
        // 明日分を渡す。各要素は必ずdate(YYYY-MM-DD)を持つため、
        // currentTimeの日付と一致するかをAI自身が判定できる。
        tomorrowHours: payload.tomorrowHours,
        tomorrowSunset: payload.tomorrowSunset,
        tomorrowSunrise: payload.tomorrowSunrise,
        regionalWeather: payload.regionalWeather,
        candidates: payload.candidates
      }
    );

  inputItems.push(
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "【マチナウの現在情報(JSON)】\n" +
            currentContextJson +
            "\n\n【旅行者の発言】\n" +
            payload.message
        }
      ]
    }
  );

  return inputItems;
}


// callOpenAiConcierge()と同じfetchベースの呼び出し方式・エラーフラグ
// 規約を踏襲するが、エンドポイント(Responses API)・リクエスト形状
// (instructions/input/tools)・応答の取り出し方(output配列)が異なる。
// Responses APIの応答は「web_search_call出力」と「message出力」等が
// output配列に並ぶ形式のため、type:"message"の項目からoutput_textを
// 探して取り出す(SDK専用の便宜プロパティoutput_textは生fetchでは
// 保証されないため使わない)。
async function callOpenAiConciergeChat(
  payload
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error(
        "OPENAI_API_KEY が設定されていません。"
      );

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const instructions =
    buildAiConciergeChatInstructions(
      payload.language
    );

  const inputItems =
    buildAiConciergeChatInputItems(
      payload
    );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      AI_CONCIERGE_CHAT_TIMEOUT_MS
    );

  let response;

  try {
    try {
      response =
        await fetch(
          AI_CONCIERGE_CHAT_ENDPOINT,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + apiKey
            },

            body: JSON.stringify({
              model: AI_CONCIERGE_CHAT_MODEL,
              instructions: instructions,
              input: inputItems,
              tools: [{ type: "web_search" }],
              tool_choice: "auto",

              // 本部確認済みの公式仕様：GPT-6 Astra等のreasoningモデルは
              // temperature/top_p/top_logprobsを非対応のため送らない
              // (「APIが無視するだろう」に頼らず、そもそも含めない)。
              reasoning: {
                effort: AI_CONCIERGE_CHAT_REASONING_EFFORT
              }
            }),

            signal: controller.signal
          }
        );
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        const timeoutError =
          new Error("AIとの会話がタイムアウトしました。");

        timeoutError.isTransient =
          true;

        timeoutError.isTimeout =
          true;

        throw timeoutError;
      }

      const networkError =
        new Error("AIとの会話の呼び出しに失敗しました。");

      networkError.isTransient =
        true;

      networkError.isNetworkError =
        true;

      throw networkError;
    }
  } finally {
    clearTimeout(
      timeoutId
    );
  }

  if (!response.ok) {
    const httpError =
      new Error(
        "OpenAI APIがエラーを返しました。status=" + response.status
      );

    httpError.isHttpError =
      true;

    httpError.httpStatus =
      response.status;

    httpError.isTransient =
      true;

    throw httpError;
  }

  let responseData;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    const parseError =
      new Error("OpenAI APIの応答を解析できませんでした。");

    parseError.isJsonError =
      true;

    parseError.isTransient =
      true;

    throw parseError;
  }

  // Responses APIのoutput配列から、type:"message"かつrole:"assistant"の
  // 項目を探し、その中のtype:"output_text"のtextだけをつなげる。
  // web_search_call等の他の出力項目は無視する(citations等は今回未使用)。
  const outputItems =
    Array.isArray(responseData.output)
      ? responseData.output
      : [];

  const messageItem =
    outputItems.find(
      function(item) {
        return (
          item &&
          item.type === "message" &&
          item.role === "assistant" &&
          Array.isArray(item.content)
        );
      }
    );

  const replyText =
    messageItem
      ? messageItem.content
          .filter(
            function(contentPart) {
              return (
                contentPart &&
                contentPart.type === "output_text" &&
                typeof contentPart.text === "string"
              );
            }
          )
          .map(
            function(contentPart) {
              return contentPart.text;
            }
          )
          .join("")
      : "";

  if (replyText.trim() === "") {
    const shapeError =
      new Error("OpenAI APIの応答形式が不正です。");

    shapeError.isJsonError =
      true;

    shapeError.isTransient =
      true;

    throw shapeError;
  }

  return replyText.trim();
}


// 会話型マチナウAI Phase1(MVP)｜認証はhandleAiConciergeRequest()と同じ
// 匿名Firebase AuthenticationのBearer Token検証をそのまま再利用する。
// 既存の✨単発提案(handleAiConciergeRequest/aiConciergeState)には一切
// 触れない。AI呼び出し・応答検証のいずれかで失敗しても常にsuccess:false
// のJSONを返すだけにとどめ、呼び出し元(app.js)がチャット欄だけに簡潔な
// 再試行案内を出せるようにする(既存TOP・既存✨には影響させない)。
async function handleAiConciergeChatRequest(
  request,
  response
) {
  try {
    const idToken =
      readBearerToken(
        request
      );

    if (idToken === "") {
      return response.status(401).json({
        success: false,
        message: "認証情報がありません。"
      });
    }

    const app =
      getFirebaseAdminApp();

    try {
      await getAuth(app)
        .verifyIdToken(
          idToken
        );
    } catch (verifyError) {
      return response.status(401).json({
        success: false,
        message: "認証情報が正しくありません。"
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const language =
      requestBody.language === "en" ? "en" : "ja";

    const currentTime =
      typeof requestBody.currentTime === "string"
        ? requestBody.currentTime
            .trim()
            .slice(0, AI_CONCIERGE_CURRENT_TIME_MAX_LENGTH)
        : "";

    const contextInput =
      requestBody.context &&
      typeof requestBody.context === "object"
        ? requestBody.context
        : {};

    const area =
      typeof contextInput.area === "string"
        ? contextInput.area
            .trim()
            .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.area)
        : "";

    const weather =
      sanitizeAiConciergeChatWeather(
        contextInput.weather
      );

    const nextHours =
      sanitizeAiConciergeChatNextHours(
        contextInput.nextHours
      );

    // マチナウAI旅行相棒化 Phase1.1｜明日分。api/weather.jsが既に取得済み
    // (追加fetchなし)のtomorrowHours/tomorrowSunset/tomorrowSunriseを
    // そのまま中継する。todayのnextHoursとは別フィールドのまま渡し、
    // 混同を防ぐ。
    const tomorrowHours =
      sanitizeAiConciergeTomorrowHours(
        contextInput.tomorrowHours
      );

    const tomorrowSunset =
      sanitizeAiConciergeTimeString(
        contextInput.tomorrowSunset
      );

    const tomorrowSunrise =
      sanitizeAiConciergeTimeString(
        contextInput.tomorrowSunrise
      );

    const regionalWeather =
      sanitizeAiConciergeRegionalWeather(
        contextInput.regionalWeather
      );

    const candidates =
      sanitizeAiConciergeCandidateList(
        requestBody.candidates
      );

    const history =
      sanitizeAiConciergeChatHistory(
        requestBody.history
      );

    const message =
      typeof requestBody.message === "string"
        ? requestBody.message
            .trim()
            .slice(0, AI_CONCIERGE_CHAT_MESSAGE_MAX_LENGTH)
        : "";

    if (message === "") {
      return response.status(400).json({
        success: false,
        message: "メッセージが指定されていません。"
      });
    }

    console.log(
      "[AIConciergeChat Debug] request received candidateCount=" +
        candidates.length +
        " historyCount=" +
        history.length
    );

    let replyText;

    try {
      replyText =
        await callOpenAiConciergeChat(
          {
            language: language,
            currentTime: currentTime,
            area: area,
            weather: weather,
            nextHours: nextHours,
            tomorrowHours: tomorrowHours,
            tomorrowSunset: tomorrowSunset,
            tomorrowSunrise: tomorrowSunrise,
            regionalWeather: regionalWeather,
            candidates: candidates,
            history: history,
            message: message
          }
        );
    } catch (aiError) {
      console.error(
        "会話型マチナウAI呼び出しエラー：",
        aiError
      );

      return response.status(200).json({
        success: false,
        message: "AIとの会話中にエラーが発生しました。"
      });
    }

    return response.status(200).json({
      success: true,
      reply:
        replyText.slice(
          0,
          AI_CONCIERGE_CHAT_REPLY_MAX_LENGTH
        )
    });
  } catch (error) {
    console.error(
      "会話型マチナウAI処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "AIとの会話中にエラーが発生しました。"
    });
  }
}


// AI地域編集部 Phase1(八重瀬町・最小縦断実証)｜admin-region-picks.htmlの
// 既存の「地域のおすすめ」作成・編集フォームから呼ばれる、AI下書き生成
// 専用モード。この関数はFirestoreへ一切書き込まない(下書きを返すだけ)。
// 実際のregionRecommendations保存は、既存のクライアント側
// add()/update()呼び出し(admin-region-picks.html)が、人間が「保存する」
// を押した時にだけ行う(AIがisPublishedはおろかFirestoreへの書き込み
// 自体を一切行えない、という本部指示を構造的に満たす)。
function sanitizeRegionEditorialText(
  rawValue,
  maxLength
) {
  if (typeof rawValue !== "string") {
    return "";
  }

  return rawValue
    .trim()
    .slice(0, maxLength);
}

function sanitizeRegionEditorialExistingArticle(
  rawExistingArticle
) {
  if (
    !rawExistingArticle ||
    typeof rawExistingArticle !== "object"
  ) {
    return null;
  }

  const title =
    sanitizeRegionEditorialText(
      rawExistingArticle.title,
      AI_REGION_EDITORIAL_EXISTING_TEXT_MAX_LENGTHS.title
    );

  const content =
    sanitizeRegionEditorialText(
      rawExistingArticle.content,
      AI_REGION_EDITORIAL_EXISTING_TEXT_MAX_LENGTHS.content
    );

  const regionName =
    sanitizeRegionEditorialText(
      rawExistingArticle.regionName,
      AI_REGION_EDITORIAL_EXISTING_TEXT_MAX_LENGTHS.regionName
    );

  if (
    title === "" &&
    content === ""
  ) {
    return null;
  }

  return {
    title: title,
    content: content,
    regionName: regionName
  };
}

// 既存の公開一覧(handlePublicSubmissionsListRequest)と全く同じ2クエリ
// (status==approved && expiresAt>now／status==approved &&
// isPermanentAd==true)をそのまま再利用する。area条件はFirestore側の
// whereへ足さず、取得後にコード側で絞り込む。理由：statusとexpiresAtの
// 不等号条件は既存クエリで動作実績があるが、そこへarea(等価条件)を
// 追加した組み合わせは新しいComposite Indexが必要になる可能性があり、
// Phase1の最小変更方針(新しいFirestore Index作成をしない)に反するため。
// 対象がsubmissions全体(確認時点で全国8件)である限り、この方式で性能上の
// 問題は生じない。
async function fetchApprovedSubmissionDocsForArea(
  database,
  targetArea
) {
  const unexpiredQuerySnapshot =
    await database
      .collection("submissions")
      .where("status", "==", "approved")
      .where("expiresAt", ">", Timestamp.now())
      .get();

  let permanentAdQuerySnapshot =
    null;

  try {
    permanentAdQuerySnapshot =
      await database
        .collection("submissions")
        .where("status", "==", "approved")
        .where("isPermanentAd", "==", true)
        .get();
  } catch (permanentAdQueryError) {
    console.error(
      "AI地域編集部：常設広告一覧の取得に失敗しました（期限内投稿の取得には影響しません）：",
      permanentAdQueryError
    );
  }

  const documentsById =
    new Map();

  unexpiredQuerySnapshot.docs.forEach(
    function(documentSnapshot) {
      documentsById.set(
        documentSnapshot.id,
        documentSnapshot
      );
    }
  );

  if (permanentAdQuerySnapshot) {
    permanentAdQuerySnapshot.docs.forEach(
      function(documentSnapshot) {
        documentsById.set(
          documentSnapshot.id,
          documentSnapshot
        );
      }
    );
  }

  const matchingDocs =
    [];

  documentsById.forEach(
    function(documentSnapshot) {
      const data =
        documentSnapshot.data() ||
        {};

      if (data.area !== targetArea) {
        return;
      }

      matchingDocs.push(data);
    }
  );

  return matchingDocs;
}

// AI地域編集部 Phase2(街を見るAI→地域ファクト接続)｜承認済みsubmissionsの
// うち、authorTypeが"ai"(街を見るAIのAUTO_POST)または"admin"
// (ai-editor.html経由の運営編集)のものだけをREGION FACTSとして扱う。
// それ以外(shopAd＝店舗の常設広告、authorType未設定の一般店舗投稿等)は
// すべてSHOP DIRECT POSTSへ回す。新しい分類値は作らず、既存の
// authorType(api/admin-post.jsのALLOWED_AUTHOR_TYPES・
// api/admin-source-collect.jsのcreateAutoPostSubmission()が実際に書き込む
// 値)をそのまま再利用する。
function mapApprovedSubmissionToFactCandidate(
  data
) {
  return {
    title:
      sanitizeRegionEditorialText(
        data.title,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.title
      ),

    content:
      sanitizeRegionEditorialText(
        data.content,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.content
      ),

    shopName:
      sanitizeRegionEditorialText(
        data.shopName,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.shopName
      ),

    category:
      sanitizeRegionEditorialText(
        data.category,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.category
      ),

    address:
      sanitizeRegionEditorialText(
        data.address,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.address
      ),

    authorType:
      sanitizeRegionEditorialText(
        data.authorType,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.authorType
      ),

    websiteUrl:
      sanitizeRegionEditorialText(
        data.websiteUrl,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.websiteUrl
      ),

    sourceType:
      sanitizeRegionEditorialText(
        data.sourceType,
        AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.sourceType
      ),

    sourceName:
      AI_REGION_EDITORIAL_REGION_FACT_AUTHOR_TYPES.includes(
        typeof data.authorType === "string" ? data.authorType : ""
      )
        ? (
            data.authorType === "ai"
              ? "街を見るAIが確認した地域情報"
              : "マチナウ編集部"
          )
        : "",

    confirmedAt:
      data.updatedAt &&
      typeof data.updatedAt.toDate === "function"
        ? data.updatedAt.toDate().toISOString().slice(0, 10)
        : "",

    // submissionsは元記事の公開日時を保持していないため空文字のまま
    // 返す(存在しないfieldを推測で埋めない)。
    publishedAt:
      "",

    origin:
      "submission"
  };
}

async function fetchApprovedSubmissionFactsForArea(
  database,
  targetArea
) {
  const matchingDocs =
    await fetchApprovedSubmissionDocsForArea(
      database,
      targetArea
    );

  const regionFacts =
    [];

  const shopDirectPosts =
    [];

  matchingDocs.forEach(
    function(data) {
      const authorType =
        typeof data.authorType === "string"
          ? data.authorType
          : "";

      const candidate =
        mapApprovedSubmissionToFactCandidate(
          data
        );

      if (
        AI_REGION_EDITORIAL_REGION_FACT_AUTHOR_TYPES.includes(authorType)
      ) {
        if (regionFacts.length < AI_REGION_EDITORIAL_SOURCE_FACT_MAX_COUNT) {
          regionFacts.push(candidate);
        }
      } else {
        if (shopDirectPosts.length < AI_REGION_EDITORIAL_SOURCE_FACT_MAX_COUNT) {
          shopDirectPosts.push(candidate);
        }
      }
    }
  );

  return {
    regionFacts: regionFacts,
    shopDirectPosts: shopDirectPosts
  };
}

// AI地域編集部 Phase2｜対象市町村に登録されているaiSources(街を見るAIの
// 一次情報源)を取得する。本部指示により、記事のタイトル文字列から
// 市町村を推測する方式は採用せず、必ずこの「情報源自体に登録された
// area」から市町村を判定する(town.yaese.lg.jpのような情報源は登録時に
// area:"八重瀬町"が設定されているため、記事1件ごとの市町村判定は
// 構造的に確実)。
async function fetchAiSourcesForArea(
  database,
  targetArea
) {
  const querySnapshot =
    await database
      .collection("aiSources")
      .where("area", "==", targetArea)
      .get();

  return querySnapshot.docs.map(
    function(documentSnapshot) {
      const data =
        documentSnapshot.data() ||
        {};

      return {
        id: documentSnapshot.id,

        name:
          sanitizeRegionEditorialText(
            data.name,
            AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.sourceName
          ),

        sourceType:
          sanitizeRegionEditorialText(
            data.sourceType,
            AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.sourceType
          )
      };
    }
  );
}

// AI地域編集部 Phase2｜街を見るAIの内部にある本格的なEVENT/鮮度判定
// エンジン(judgeArticleForAutoPost内のresolveFreshnessCategory等)は、
// 関連度スコアや第二審と密結合しており、Phase2の最小スコープでそのまま
// 再利用・importすると2つの独立したVercel Function間の結合が過剰に
// 強まる(本部指示のスコープ外)。そのため、aiCollectedArticles由来の
// 長期ファクト候補(既にsubmissionsの掲示期限が切れているもの)だけに
// 対象を絞った、意図的に単純な安全側のキーワード検出を行う。
// 「完璧な判定AIは不要、安全側へ倒す」という本部方針に基づき、
// 該当した場合は無条件でTier B(Terraへは渡さない)へ倒す。
function looksTimeBoundForLongTermReuse(
  text
) {
  if (typeof text !== "string" || text === "") {
    return false;
  }

  return AI_REGION_EDITORIAL_TIME_BOUND_KEYWORDS.some(
    function(keyword) {
      return text.includes(keyword);
    }
  );
}

// AI地域編集部 Phase2｜対象市町村に登録されたaiSourcesのaiCollectedArticles
// から、「街を見るAIの判定(judgeArticleForAutoPost)と第二審の両方を
// 通過し、実際にsubmissionsへ投稿されたことがある(=postedSubmissionIdを
// 持つ)」記事だけを長期地域ファクト候補として拾う。processingStatusが
// DISCOVERED/PROCESSING/ERROR/SKIPPEDの記事(未判定・エラー・非採用)は
// 一切対象にしない。
//
// 本部指示(Phase1.7はshadow modeであり、その結果だけを根拠に地域ファクト
// へ昇格させない)を踏まえ、ここではaiCollectedArticles.aiSecondOpinion
// フィールドを一切読み取らない。判定に使うのはprocessingStatus/
// postedSubmissionIdという「既に本番のAUTO_POSTパイプライン全体
// (第一審＋第二審＋実際の投稿)を経た最終結果」のみであり、第二審の結果を
// 単独の根拠にすることはない。
//
// 対応する投稿がまだ承認済み一覧(submissions)に残っている記事は、
// fetchApprovedSubmissionFactsForArea()側で既にREGION FACTSとして
// 拾われているため、ここでは重複を避けるためpostedSubmissionIdの集合を
// 除外リストとして受け取る。
async function fetchLongTermRegionFactsFromAiCollectedArticles(
  database,
  aiSources,
  excludedSubmissionIds
) {
  const tierAFacts =
    [];

  let tierBCount =
    0;

  for (const source of aiSources) {
    if (typeof source.id !== "string" || source.id === "") {
      continue;
    }

    let querySnapshot;

    try {
      querySnapshot =
        await database
          .collection(AI_COLLECTED_ARTICLES_COLLECTION_NAME)
          .where("sourceId", "==", source.id)
          .limit(AI_REGION_EDITORIAL_AI_COLLECTED_PER_SOURCE_MAX_COUNT)
          .get();
    } catch (queryError) {
      console.error(
        "AI地域編集部：aiCollectedArticlesの取得に失敗しました（他の情報源の取得には影響しません）：",
        queryError
      );
      continue;
    }

    querySnapshot.docs.forEach(
      function(documentSnapshot) {
        const data =
          documentSnapshot.data() ||
          {};

        if (data.processingStatus !== "DONE") {
          return;
        }

        const postedSubmissionId =
          typeof data.postedSubmissionId === "string"
            ? data.postedSubmissionId
            : "";

        if (postedSubmissionId === "") {
          return;
        }

        if (excludedSubmissionIds.has(postedSubmissionId)) {
          // 既にREGION FACTSとして拾われている(=まだ掲示期限内)ため、
          // 二重に渡さない。
          return;
        }

        const title =
          sanitizeRegionEditorialText(
            data.title,
            AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.title
          );

        const content =
          sanitizeRegionEditorialText(
            data.summary,
            AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.content
          );

        if (
          looksTimeBoundForLongTermReuse(
            title + " " + content
          )
        ) {
          tierBCount +=
            1;
          return;
        }

        if (tierAFacts.length >= AI_REGION_EDITORIAL_SOURCE_FACT_MAX_COUNT) {
          return;
        }

        tierAFacts.push(
          {
            title: title,
            content: content,
            shopName: "",
            category: "",
            address: "",
            authorType: "ai",
            websiteUrl:
              sanitizeRegionEditorialText(
                data.articleUrl,
                AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.websiteUrl
              ),
            sourceType: source.sourceType,
            sourceName:
              source.name !== ""
                ? source.name
                : "街を見るAIが確認した地域情報",
            confirmedAt:
              data.lastSeenAt &&
              typeof data.lastSeenAt.toDate === "function"
                ? data.lastSeenAt.toDate().toISOString().slice(0, 10)
                : "",
            publishedAt:
              sanitizeRegionEditorialText(
                data.publishedAt,
                AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.publishedAt
              ),
            origin: "aiCollectedArticle"
          }
        );
      }
    );
  }

  return {
    tierAFacts: tierAFacts,
    tierBCount: tierBCount
  };
}

// AI地域編集部 Phase2｜対象市町村のREGION FACTS・SHOP DIRECT POSTSを
// まとめて取得する。新しいVercel Functionは作らず、既存の
// /api/moderate-submissionのregionEditorial処理からのみ呼ばれる。
async function fetchRegionEditorialMaterialsForArea(
  database,
  targetArea
) {
  const submissionFacts =
    await fetchApprovedSubmissionFactsForArea(
      database,
      targetArea
    );

  const aiSources =
    await fetchAiSourcesForArea(
      database,
      targetArea
    );

  // submissionFacts.regionFactsは既にsubmissions由来なので、その元
  // documentのIDまでは持っていない(mapApprovedSubmissionToFactCandidate()
  // が返す形にIDを含めていない)。重複除外は「まだ承認済み一覧に residing
  // している」こと自体で十分に目的を達成できるため、ここでは
  // postedSubmissionIdの実際の値までは追跡せず、空集合を渡す
  // (=aiCollectedArticles側は常に「まだsubmissionsに無い」ものとして
  // 扱われるが、その場合でも同一記事が2回渡る実害は「同じ事実が2回
  // 言及される可能性がある」程度であり、事実の誤りには繋がらない。
  // Phase2の最小スコープではこの程度の重複許容を安全側とみなす)。
  const longTermFacts =
    await fetchLongTermRegionFactsFromAiCollectedArticles(
      database,
      aiSources,
      new Set()
    );

  return {
    regionFacts:
      submissionFacts.regionFacts.concat(
        longTermFacts.tierAFacts
      ),

    shopDirectPosts:
      submissionFacts.shopDirectPosts,

    pendingReviewCount:
      longTermFacts.tierBCount
  };
}

// 「Wikipedia的な事実列挙」を禁止し、旅行者が今の自分の行動へどう
// 活かせるかを編集させる、地域編集AI版の憲法(本部指示に基づく)。
// web_searchは使わない(sourceFacts以外の情報を根拠にしない)ため、
// instructions内でも「与えられたsourceFacts以外の事実を書かない」ことを
// 明示する。
// AI地域編集部 Phase2(街を見るAI→地域ファクト接続)｜本部指示により、
// REGION FACTS(公式・確認済みの街の事実)とSHOP DIRECT POSTS(店舗からの
// 直接投稿)を完全に分離して渡し、店舗投稿だけを根拠に地域全体の特徴を
// 断定させない。出典(URL)はAIに一切生成させず、factIdの参照だけを
// 答えさせる(sourceCitationsは呼び出し元がfactIdから実データを引いて
// 組み立てる)。
function buildRegionEditorialInstructions() {
  return (
    "あなたは沖縄の地域情報サイト『マチナウ』の地域編集長です。\n" +
    "あなたはプロの地域コピーライターでもあります。『地域のおすすめ』は" +
    "『今日の速報』ではありません。今日・今の行動判断は、街を見るAIや" +
    "会話型マチナウAI側が別途担当します。あなたの仕事は、その市町村を" +
    "初めて知る旅行者へ向けて、その街の記憶(PROFILE)を土台にした約2000字" +
    "の魅力的なPR記事を書くことです。PROFILEに確認済みの人口・面積・" +
    "成立の歴史がある場合は、記事の中に自然な形で必ず含めてください。" +
    "代表的な場所がPROFILEにある場合は、具体的なスポット名を使って" +
    "紹介してください。旅行者に語りかける文章にし、事実を羅列するの" +
    "ではなく『この街へ行ってみたい』『この場所を歩いてみたい』と感じ" +
    "られる一つの読み物として構成してください。\n\n" +
    "入力には3種類の情報配列が与えられます。それぞれ時間軸と役割が" +
    "異なるため、絶対に混同しないでください。\n\n" +
    "・profileFacts(PROFILE＝街そのものの長期記憶)：マチナウ運営が事前に" +
    "人間確認し、出典付きで保存済みの街のプロフィール情報(地形・文化・" +
    "特産・代表スポット・気候・交通・成立史など)。今日発生した出来事" +
    "ではなく、変化の遅い、街の本質を表す情報。この記事の主役。\n" +
    "・regionFacts(NOW＝現在有効な地域の一次情報)：公式一次情報・自治体・" +
    "街を見るAIが確認した、現在有効な地域の事実。今読む旅行者の訪問判断に" +
    "本当に意味があり、かつPROFILEから作る記事のテーマと自然につながる" +
    "場合だけ補足として使う。\n" +
    "・shopDirectPosts(SHOP＝店舗からの直接投稿)：店舗自身が直接投稿した" +
    "情報(店舗の主張であり、地域を代表する事実でも自治体確認情報でもない)。" +
    "記事のテーマに自然に合う場合だけ補助的に使う。\n\n" +
    "【優先順位(信頼度ではなく、記事内での役割・主従関係)】\n" +
    "1位 PROFILE(profileFacts)：記事の主役。街を理解して物語を作る土台。\n" +
    "2位 NOW(regionFacts)：現在も有効で、旅行者の訪問判断に意味があり、" +
    "記事テーマと自然につながる場合だけ補足として使う。存在するという" +
    "理由だけで記事の中心にしない。\n" +
    "3位 SHOP(shopDirectPosts)：記事テーマに自然に合う場合だけ補助的に" +
    "使う。存在するという理由だけで記事の中心にしない。\n\n" +
    "【絶対に守ること】\n" +
    "1. profileFacts・regionFacts・shopDirectPostsに書かれていない事実・" +
    "店名・営業時間・価格・数値・日付・具体的な出来事を絶対に創作しない。" +
    "確認できない具体情報を推測で補完しない。情報が乏しい場合は、無理に" +
    "埋めず、分かっている範囲だけで書く。\n" +
    "2. SNS(Twitter/Instagram等)を見たかのような書き方(「話題になっている」" +
    "「口コミで人気」等)や、観光パンフレットのコピーのような大げさな" +
    "誇張表現(「奇跡の絶景」「一生に一度は」等)を絶対にしない。\n" +
    "3. shopDirectPostsだけを根拠に、地域全体の特徴・代表性・文化・人気を" +
    "断定してはいけない。SHOPを自治体確認情報や地域全体を代表する事実の" +
    "ように書かない。\n" +
    "   NG例：「八重瀬町は個性派バーガーの街です。」\n" +
    "   OK例：「八重瀬町では現在、店舗から直接投稿されている飲食情報として" +
    "○○があります。」\n" +
    "4. urlやlabelなどの出典文字列を自分で生成しない。本文の根拠に実際に" +
    "使ったregionFacts/shopDirectPostsは、citedFactIds配列にfactId(入力" +
    "データに含まれる記号、例：\"rf1\"、\"sp1\")をそのまま返すことでのみ" +
    "示す。profileFactsにはfactIdが付いていないため、citedFactIdsへ含める" +
    "ことはできない(profileFactsは既に保存時点で人間確認・出典確認済みの" +
    "長期記憶であり、この記事単位での新しい引用ID方式は使わない)。\n" +
    "5. 出力は指定されたJSON形式のみ。JSON以外の文字列（前置き・挨拶・" +
    "コードブロック記法等）を一切含めない。本文はMarkdown記法" +
    "(##見出し、**太字**等)を一切使わない。実際の表示はプレーンテキスト" +
    "であり、Markdown記号はそのまま記号として表示されてしまうため、" +
    "段落分け(改行)だけで読みやすい構成を作る。\n" +
    "6. profileFactsの内容を『今日・現在』の出来事であるかのように書かない。\n" +
    "   ・safety.longTermSafetyNotes(長期的な安全特性)を『本日警報が" +
    "出ています』のような今日の警報・注意情報として書かない。\n" +
    "   ・travel.representativePlaces(代表的なスポット)を『今日営業して" +
    "います』のように今日の営業状況として推測しない。\n" +
    "   ・transport.publicTransportSummary/carFreeTravelAdvice(交通の" +
    "PROFILE情報)から、今日の運行状況・遅延・運休を推測しない。今日の" +
    "交通状況が必要な場合はregionFacts側の情報だけを根拠にする。\n" +
    "7. transport.carFreeTravelAdviceは、一次事実そのものではなく、" +
    "確認済み交通情報を踏まえた旅行者向けの解釈・助言として扱う" +
    "(一次事実と混同して断定的に書かない)。\n" +
    "8. regionFactsは『現在有効』として渡されているが、内容が既に解決・" +
    "終了した過去の出来事(例：解除済みの警報、既に閉鎖が解かれた施設、" +
    "終了済みのイベント)であれば、現在進行中の注意情報や最新情報として" +
    "扱わない。少しでも過去の出来事のように読める場合は、その" +
    "regionFactsを本文で使わない(使わなくてよい。無理に使う必要はない)。\n\n" +
    "【書き方の方針(地域編集長としての編集思考)】\n" +
    "『◯◯町には△△があります。□□もあります。』のような単なる施設の" +
    "羅列(Wikipedia的な事実列挙)は禁止する。かわりに、以下の流れを頭の中で" +
    "考えてから、自然な一つの読み物として書く(この番号や見出しをそのまま" +
    "本文に出す必要はない)。\n" +
    "  1. この街を一言でどう感じてもらうか(街全体の印象)\n" +
    "  2. なぜそういう街なのか(地形・成立・暮らしとのつながり)\n" +
    "  3. 代表的な場所・景色を具体名で紹介する(travel.representativePlaces" +
    "等)\n" +
    "  4. 歴史・文化・食・暮らし(formationHistory/culture/specialties等)を" +
    "自然につなげる\n" +
    "  5. 旅行者ならどう過ごせるか(車の有無・移動手段も踏まえて具体的に" +
    "想像できるように)\n" +
    "  6. 最後に、行ってみたいと自然に思える締めくくり\n" +
    "記事全体を貫く一本のテーマを最初に決め、事実の言い換えではなく、" +
    "旅行者が実際にその場所を歩いているかのように読める文章にする。\n\n" +
    "【必ず含めること(確認済みデータがある場合)】\n" +
    "・identity.population(人口、asOf付き)とidentity.areaKm2(面積)が" +
    "confirmedの場合、記事の中に自然な形で必ず含める(数値を並べるだけで" +
    "終わらせず、旅行者にとっての意味を添えてよい)。\n" +
    "・identity.formationHistory/establishedDate/formerMunicipalities" +
    "(成立史・成立年月日・合併前の旧市町村名)やcharacter.historySummary" +
    "(歴史の概要)がconfirmedの場合、街の成り立ちとして記事に含める。\n" +
    "・名前の由来を直接説明する専用データが無い場合がある。上記の確認済み" +
    "テキストの中に名前の由来にあたる記述が実際に含まれている場合はそれを" +
    "活かし、含まれていない場合は名前の由来を推測・創作しない(書かなくて" +
    "よい)。\n" +
    "・travel.representativePlacesがconfirmedの場合、『丘陵』『海岸』" +
    "『畑』のような抽象的な地形描写だけで終わらせず、そこに含まれる" +
    "具体的な場所名を使って旅行者へ紹介する。場所名の創作は禁止。\n" +
    "・character.specialties/localFoods(特産・食)がconfirmedの場合、" +
    "具体的に紹介する。\n" +
    "・地域の今後の展開・将来計画は、既存PROFILEには保存する項目が無い。" +
    "現在も有効なregionFacts(NOW)の中に将来計画の一次情報が実際にある" +
    "場合だけ紹介し、無ければ今後の展開について書かない(創作しない)。\n" +
    "profileFactsの項目全部を無理に詰め込む必要はないが、上記の確認済み" +
    "データは省略せずに使う。\n\n" +
    "【分量】\n" +
    "本文は日本語で約2000字を目安にする。タイトル＋数行だけの短い行政" +
    "案内では不合格。ただし内容が薄いのに文字数だけを無意味に水増しする" +
    "ことはしない。見出しの箇条書きではなく、複数の段落からなる自然な" +
    "文章にする。\n\n" +
    "【出力形式】\n" +
    "title: 記事のタイトル(短く、地名や街らしさが伝わるもの)\n" +
    "content: 本文(上記の編集思考・必須要件に沿った、約2000字・複数段落の" +
    "自然な読み物。Markdown記法は使わない)\n" +
    "regionName: 運営整理用の短いラベル(例：南部)。既存のregionNameが" +
    "与えられていれば、特に理由がない限りそのまま踏襲する。\n" +
    "citedFactIds: 本文の根拠に実際に使ったregionFacts/shopDirectPostsの" +
    "factIdだけを配列で返す(profileFactsのfactIdは存在しないため含めない。" +
    "regionFacts/shopDirectPostsを本文で使わなかった場合は空配列でよい)。" +
    "使っていない事実のfactIdを含めない。"
  );
}

function buildRegionEditorialInputItems(
  payload
) {
  const contextJson =
    JSON.stringify(
      {
        targetArea: payload.targetArea,
        existingArticle: payload.existingArticle,
        regionFacts: payload.regionFacts,
        shopDirectPosts: payload.shopDirectPosts,
        profileFacts: payload.profileFacts
      }
    );

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "【対象市町村・既存記事・PROFILE(profileFacts)・" +
            "NOW(regionFacts)・SHOP(shopDirectPosts)のJSON】\n" +
            contextJson +
            "\n\n" +
            "profileFacts(PROFILE)・regionFacts(NOW)・" +
            "shopDirectPosts(SHOP)だけを根拠に、指定されたJSON形式で" +
            "下書きを作成してください。profileFactsを土台にその街らしい" +
            "テーマの読み物を作り、regionFacts/shopDirectPostsは記事の" +
            "テーマに自然につながり、かつ現在も有効な内容の場合だけ補足" +
            "として使ってください(存在するという理由だけで使う必要は" +
            "ありません)。既存記事(existingArticle)がある場合は、" +
            "全面的な書き直しではなく、確認済み事実を反映した改善案として" +
            "書いてください。"
        }
      ]
    }
  ];
}

function buildRegionEditorialJsonSchema() {
  return {
    type: "json_schema",
    name: "region_editorial_draft",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: {
          type: "string"
        },
        content: {
          type: "string"
        },
        regionName: {
          type: "string"
        },
        citedFactIds: {
          type: "array",
          items: {
            type: "string"
          }
        }
      },
      required: ["title", "content", "regionName", "citedFactIds"],
      additionalProperties: false
    }
  };
}

async function callOpenAiRegionEditorial(
  payload
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error(
        "OPENAI_API_KEY が設定されていません。"
      );

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const instructions =
    buildRegionEditorialInstructions();

  const inputItems =
    buildRegionEditorialInputItems(
      payload
    );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      AI_REGION_EDITORIAL_TIMEOUT_MS
    );

  let response;

  try {
    try {
      response =
        await fetch(
          AI_REGION_EDITORIAL_ENDPOINT,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + apiKey
            },

            body: JSON.stringify({
              model: AI_REGION_EDITORIAL_MODEL,
              instructions: instructions,
              input: inputItems,

              text: {
                format:
                  buildRegionEditorialJsonSchema()
              },

              // 会話AI(AI_CONCIERGE_CHAT_*)と同じ理由：reasoningモデルは
              // temperature/top_pを非対応のため送らない。web_searchツール
              // も意図的に付けない(sourceFacts以外を根拠にさせないため)。
              reasoning: {
                effort: AI_REGION_EDITORIAL_REASONING_EFFORT
              }
            }),

            signal: controller.signal
          }
        );
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        const timeoutError =
          new Error("AI地域編集の下書き生成がタイムアウトしました。");

        timeoutError.isTransient =
          true;

        timeoutError.isTimeout =
          true;

        throw timeoutError;
      }

      const networkError =
        new Error("AI地域編集の呼び出しに失敗しました。");

      networkError.isTransient =
        true;

      networkError.isNetworkError =
        true;

      throw networkError;
    }
  } finally {
    clearTimeout(
      timeoutId
    );
  }

  if (!response.ok) {
    const httpError =
      new Error(
        "OpenAI APIがエラーを返しました。status=" + response.status
      );

    httpError.isHttpError =
      true;

    httpError.httpStatus =
      response.status;

    httpError.isTransient =
      true;

    throw httpError;
  }

  let responseData;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    const parseError =
      new Error("OpenAI APIの応答を解析できませんでした。");

    parseError.isJsonError =
      true;

    parseError.isTransient =
      true;

    throw parseError;
  }

  const outputItems =
    Array.isArray(responseData.output)
      ? responseData.output
      : [];

  const messageItem =
    outputItems.find(
      function(item) {
        return (
          item &&
          item.type === "message" &&
          item.role === "assistant" &&
          Array.isArray(item.content)
        );
      }
    );

  const rawText =
    messageItem
      ? messageItem.content
          .filter(
            function(contentPart) {
              return (
                contentPart &&
                contentPart.type === "output_text" &&
                typeof contentPart.text === "string"
              );
            }
          )
          .map(
            function(contentPart) {
              return contentPart.text;
            }
          )
          .join("")
      : "";

  if (rawText.trim() === "") {
    const shapeError =
      new Error("OpenAI APIの応答形式が不正です。");

    shapeError.isJsonError =
      true;

    shapeError.isTransient =
      true;

    throw shapeError;
  }

  let parsedDraft;

  try {
    parsedDraft =
      JSON.parse(rawText);
  } catch (parseError) {
    const shapeError =
      new Error("AI地域編集の下書きがJSON形式ではありませんでした。");

    shapeError.isJsonError =
      true;

    shapeError.isTransient =
      true;

    throw shapeError;
  }

  // 本部指示：出典(URL/label)はAIに生成させない。AIから受け取るのは
  // factId(こちらが採番した記号)の配列だけであり、実データへの変換
  // (sourceCitations構築)は呼び出し元(handleRegionEditorialRequest)が
  // 実際のregionFacts/shopDirectPosts配列と突き合わせて行う。ここでは
  // 文字列としての型・長さ・件数だけを安全側に制限する。
  const citedFactIds =
    Array.isArray(parsedDraft.citedFactIds)
      ? parsedDraft.citedFactIds
          .filter(
            function(factId) {
              return typeof factId === "string" && factId !== "";
            }
          )
          .slice(0, AI_REGION_EDITORIAL_CITED_FACT_ID_MAX_COUNT)
          .map(
            function(factId) {
              return sanitizeRegionEditorialText(
                factId,
                AI_REGION_EDITORIAL_CITED_FACT_ID_MAX_LENGTH
              );
            }
          )
      : [];

  return {
    title:
      sanitizeRegionEditorialText(
        parsedDraft.title,
        AI_REGION_EDITORIAL_DRAFT_TEXT_MAX_LENGTHS.title
      ),

    content:
      sanitizeRegionEditorialText(
        parsedDraft.content,
        AI_REGION_EDITORIAL_DRAFT_TEXT_MAX_LENGTHS.content
      ),

    regionName:
      sanitizeRegionEditorialText(
        parsedDraft.regionName,
        AI_REGION_EDITORIAL_DRAFT_TEXT_MAX_LENGTHS.regionName
      ),

    citedFactIds:
      citedFactIds
  };
}

// AIが本文の根拠として引用したfactIdの配列を、実際のregionFacts/
// shopDirectPosts配列(factId付き)と突き合わせ、実データからだけ
// sourceCitationsを組み立てる。AIが存在しないfactIdを返した場合は
// 無視する(ハルシネーション対策の多重防御)。
function buildSourceCitationsFromFactIds(
  citedFactIds,
  factsWithId
) {
  const factsById =
    new Map();

  factsWithId.forEach(
    function(fact) {
      factsById.set(
        fact.factId,
        fact
      );
    }
  );

  const citations =
    [];

  citedFactIds.forEach(
    function(factId) {
      const fact =
        factsById.get(factId);

      if (!fact) {
        return;
      }

      citations.push(
        {
          factId: fact.factId,
          kind: fact.factKind,
          url: fact.websiteUrl,

          label:
            fact.sourceName !== ""
              ? fact.sourceName
              : (fact.shopName || fact.title),

          sourceType: fact.sourceType,
          confirmedAt: fact.confirmedAt,
          publishedAt: fact.publishedAt
        }
      );
    }
  );

  return citations;
}

function attachFactIds(
  facts,
  prefix,
  factKind
) {
  return facts.map(
    function(fact, index) {
      return Object.assign(
        {},
        fact,
        {
          factId: prefix + (index + 1),
          factKind: factKind
        }
      );
    }
  );
}

// AI地域編集部 Phase3.3(街の記憶→地域編集AI接続)｜regionEditorialへ渡す
// PROFILEフィールドをこの一覧だけに限定する(本部指示：56項目全部を渡すと
// 「街の百科事典」になってしまうため、旅行者の行動・理解に本当に必要な
// 項目だけに絞る)。isEditorialInterpretationはAI_REGION_PROFILE_RESEARCH_
// GROUPSのcarFreeTravelAdviceと同じ意味(一次事実そのものではなくAIの
// 解釈である旨)。
// Phase3.4.1｜代表の元の記事要件(人口・面積・名前の由来・成立の歴史・
// おすすめスポット・今後の展開・約2000字のPRコピー)を満たすため4項目
// 追加。いずれも既存のREGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITYに
// 実在するフィールドであり、新しいPROFILE schemaは作らない
// (formerMunicipalities/oneLineIdentity/historySummary/localFoodsは
// isRegionProfileFactConfirmed()がfalseを返す限りcontextへ含まれない
// ため、未確認の八重瀬町以外の市町村へも安全に適用できる)。名前の由来を
// 直接保存する専用フィールドはPROFILE schema上に存在しないため追加せず、
// instructions側で「既存の確認済みテキストに含まれていれば使い、無ければ
// 創作しない」という扱いにする。
const AI_REGION_EDITORIAL_PROFILE_FACT_DEFS =
  [
    { section: "identity", field: "population", label: "人口" },
    { section: "identity", field: "areaKm2", label: "面積" },
    { section: "identity", field: "formationHistory", label: "成立史" },
    { section: "identity", field: "establishedDate", label: "成立年月日" },
    { section: "identity", field: "formerMunicipalities", label: "合併前の旧市町村名" },
    { section: "identity", field: "oneLineIdentity", label: "街を一言で表す説明" },
    { section: "identity", field: "locationSummary", label: "位置" },
    { section: "character", field: "historySummary", label: "歴史の概要" },
    { section: "character", field: "geography", label: "地形" },
    { section: "character", field: "specialties", label: "特産" },
    { section: "character", field: "localFoods", label: "食" },
    { section: "character", field: "localCharacter", label: "街らしさ・雰囲気" },
    { section: "character", field: "culture", label: "文化" },
    { section: "travel", field: "representativePlaces", label: "代表的なスポット" },
    { section: "climate", field: "climateSummary", label: "気候の特徴" },
    { section: "transport", field: "publicTransportSummary", label: "公共交通" },
    {
      section: "transport",
      field: "carFreeTravelAdvice",
      label: "車なし旅行者へのアドバイス",
      isEditorialInterpretation: true
    },
    { section: "safety", field: "longTermSafetyNotes", label: "地域固有の安全特性（長期的）" }
  ];

// confirmedのPROFILE事実だけを、regionEditorial用に薄く抽出する。
// sources[]の実URL・meta・photos全量はここで意図的に落とす(本部指示：
// source URLを大量にpromptへ投入してトークンを浪費しない)。既存の
// isRegionProfileFactConfirmed()をそのまま再利用し、confirmed判定ロジック
// を重複させない。unknownのフィールドはprofileFactsへ一切含めない。
function buildRegionEditorialProfileFacts(
  profile
) {
  const profileFacts =
    [];

  AI_REGION_EDITORIAL_PROFILE_FACT_DEFS.forEach(
    function(def) {
      if (
        !isRegionProfileFactConfirmed(profile, def.section, def.field)
      ) {
        return;
      }

      const fact =
        profile[def.section][def.field];

      const isCountWithAsOf =
        REGION_PROFILE_COUNT_WITH_ASOF_FIELDS.has(def.field);

      profileFacts.push(
        {
          section: def.section,
          field: def.field,
          label: def.label,

          value:
            isCountWithAsOf
              ? (fact.value ? fact.value.count : null)
              : fact.value,

          asOf:
            isCountWithAsOf && fact.value
              ? fact.value.asOf
              : "",

          isEditorialInterpretation:
            def.isEditorialInterpretation === true
        }
      );
    }
  );

  return profileFacts;
}

// AI地域編集部 Phase3.3｜regionEditorialからPROFILE(regionProfiles)を
// 読み込む。既存のfetchRegionProfileOrEmpty()・REGION_PROFILE_ALLOWED_AREAS
// をそのまま再利用し、新しいsanitizer/normalizerは作らない。対象市町村が
// PROFILE対象外、またはPROFILE取得中に何らかのエラーが起きた場合でも、
// regionEditorial本体(NOW＋SHOP)を失敗させず、profileFacts=[]・
// profileHeroImage=nullとして継続する(本部指示：PROFILEが無いことを理由に
// regionEditorial全体を失敗させない)。
async function fetchRegionEditorialProfileContext(
  database,
  targetArea
) {
  if (!REGION_PROFILE_ALLOWED_AREAS.includes(targetArea)) {
    return {
      profileFacts: [],
      profileHeroImage: null
    };
  }

  try {
    const profileResult =
      await fetchRegionProfileOrEmpty(
        database,
        targetArea
      );

    const profile =
      profileResult.profile || {};

    const profileFacts =
      buildRegionEditorialProfileFacts(
        profile
      );

    const heroImage =
      profile.photos && profile.photos.heroImage
        ? profile.photos.heroImage
        : null;

    return {
      profileFacts: profileFacts,

      profileHeroImage:
        heroImage && heroImage.imageUrl
          ? {
              imageUrl: heroImage.imageUrl,
              imagePublicId: heroImage.imagePublicId || "",
              caption: heroImage.caption || ""
            }
          : null
    };
  } catch (profileError) {
    console.error(
      "AI地域編集部：PROFILE取得に失敗しました(regionEditorial自体は" +
        "NOW・SHOPのみで継続します)：",
      profileError
    );

    return {
      profileFacts: [],
      profileHeroImage: null
    };
  }
}

// AI地域編集部 Phase2(街を見るAI→地域ファクト接続)｜admin-region-picks.html
// の管理者/Editorのみが呼び出せる(requireAdminOrEditor()、一般公開経路には
// 存在しないmode)。この関数はFirestoreへ一切書き込まない。既存の
// aiConcierge/aiConciergeChatのいずれにも一切触れない。
//
// Phase1との最大の違い：REGION FACTSが本部指定の最低件数
// (AI_REGION_EDITORIAL_MIN_REGION_FACT_COUNT)未満の場合、
// SHOP DIRECT POSTSがいくつあってもOpenAI APIを一切呼ばずに終了する
// (本部指示「薄い記事を生成するより、生成しない方が正しい」)。
async function handleRegionEditorialRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const targetArea =
      sanitizeRegionEditorialText(
        requestBody.targetArea,
        AI_REGION_EDITORIAL_TARGET_AREA_MAX_LENGTH
      );

    if (
      !AI_REGION_EDITORIAL_ALLOWED_AREAS.includes(targetArea)
    ) {
      return response.status(400).json({
        success: false,
        message:
          "AI地域編集は現在、八重瀬町のみ対応しています(Phase1実証中)。"
      });
    }

    const existingArticle =
      sanitizeRegionEditorialExistingArticle(
        requestBody.existingArticle
      );

    const materials =
      await fetchRegionEditorialMaterialsForArea(
        authResult.database,
        targetArea
      );

    const counts =
      {
        regionFacts: materials.regionFacts.length,
        shopDirectPosts: materials.shopDirectPosts.length,
        pendingReview: materials.pendingReviewCount
      };

    if (
      materials.regionFacts.length <
      AI_REGION_EDITORIAL_MIN_REGION_FACT_COUNT
    ) {
      return response.status(200).json({
        success: true,
        sufficient: false,
        message:
          "現在、" + targetArea + "について確認済みの地域ファクト" +
          "(公式情報・街を見るAIが確認した情報)が不足しているため、" +
          "地域紹介記事を生成しません。店舗の直接投稿だけでは地域全体を" +
          "紹介する記事を作成しない設計です。",
        counts: counts,
        draft: null,
        sourceCitations: []
      });
    }

    const regionFactsWithId =
      attachFactIds(
        materials.regionFacts,
        "rf",
        "region_fact"
      );

    const shopDirectPostsWithId =
      attachFactIds(
        materials.shopDirectPosts,
        "sp",
        "shop_direct_post"
      );

    // AI地域編集部 Phase3.3(街の記憶→地域編集AI接続)｜PROFILEの取得失敗・
    // 未登録は、fetchRegionEditorialProfileContext内部で吸収され
    // {profileFacts:[], profileHeroImage:null}として返る(本部指示：
    // PROFILEが無いことを理由にregionEditorial全体を失敗させない)。
    const profileContext =
      await fetchRegionEditorialProfileContext(
        authResult.database,
        targetArea
      );

    counts.profileFacts =
      profileContext.profileFacts.length;

    let draft;

    try {
      draft =
        await callOpenAiRegionEditorial(
          {
            targetArea: targetArea,
            existingArticle: existingArticle,
            regionFacts: regionFactsWithId,
            shopDirectPosts: shopDirectPostsWithId,
            profileFacts: profileContext.profileFacts
          }
        );
    } catch (aiError) {
      console.error(
        "AI地域編集部：下書き生成エラー：",
        aiError
      );

      return response.status(200).json({
        success: false,
        message:
          "AI下書きの生成中にエラーが発生しました。時間をおいて、もう一度お試しください。"
      });
    }

    const sourceCitations =
      buildSourceCitationsFromFactIds(
        draft.citedFactIds,
        regionFactsWithId.concat(shopDirectPostsWithId)
      );

    return response.status(200).json({
      success: true,
      sufficient: true,

      draft: {
        title: draft.title,
        content: draft.content,
        regionName: draft.regionName
      },

      sourceCitations: sourceCitations,
      counts: counts,

      // AI地域編集部 Phase3.3｜AIには画像を一切渡していない(AIは画像の
      // 存在・選択に関与しない)。PROFILEの実データからそのまま抽出した
      // 候補を返すだけで、採用するかどうかは運営の明示的なボタン操作に
      // 委ねる(自動採用しない)。
      profileHeroImage: profileContext.profileHeroImage
    });
  } catch (error) {
    console.error(
      "AI地域編集部：処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "AI下書きの生成中にエラーが発生しました。"
    });
  }
}


// AI地域編集部 Phase3.1(街の長期記憶DB)｜1つの主要事実の「未確認」初期値を
// 作る。value:nullかつstatus:"unknown"かつsources:[]という、
// 「まだ何も分かっていない」ことを構造的に表現する形。AIが穴埋め創作する
// ことを防ぐため、valueが空でも自然に扱える設計にする。
function buildUnknownRegionProfileFact(
  validityType,
  isListValue
) {
  return {
    value:
      isListValue === true
        ? []
        : null,

    status: "unknown",
    validityType: validityType,
    sources: [],
    updatedAt: null
  };
}

// 対象市町村の「全項目unknown」の初期PROFILE構造を作る。Firestoreへは
// 一切書き込まない(呼び出し元がGETの「存在しない場合の初期構造」、または
// SAVE時の「既存が無い場合の土台」として使う)。
function buildEmptyRegionProfile(
  targetArea
) {
  const sections =
    {};

  Object.keys(REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY).forEach(
    function(sectionKey) {
      const fieldDefaults =
        REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY[sectionKey];

      const sectionValue =
        {};

      Object.keys(fieldDefaults).forEach(
        function(fieldKey) {
          sectionValue[fieldKey] =
            buildUnknownRegionProfileFact(
              fieldDefaults[fieldKey],
              REGION_PROFILE_LIST_VALUE_FIELDS.has(fieldKey)
            );
        }
      );

      sections[sectionKey] =
        sectionValue;
    }
  );

  sections.identity.regionName =
    targetArea;

  sections.identity.prefecture =
    REGION_PROFILE_AREA_NAME_TO_PREFECTURE[targetArea] || "";

  sections.identity.country =
    "日本";

  return Object.assign(
    {},
    sections,
    {
      photos: {
        heroImage: null,
        landscapeImages: [],
        foodImages: [],
        cultureImages: [],
        otherImages: []
      },

      meta: {
        createdAt: null,
        updatedAt: null,
        lastReviewedAt: null,
        schemaVersion: REGION_PROFILE_SCHEMA_VERSION
      }
    }
  );
}

// 15項目の固定チェックリスト(本部指示のVer.1必須項目)。複雑なスコアは
// 作らず、confirmedCount/unknownCount/totalRequiredの3値だけを返す。
function isRegionProfileFactConfirmed(
  profile,
  sectionKey,
  fieldKey
) {
  return (
    !!profile &&
    !!profile[sectionKey] &&
    !!profile[sectionKey][fieldKey] &&
    profile[sectionKey][fieldKey].status === "confirmed"
  );
}

function computeRegionProfileCompleteness(
  profile
) {
  const checklist =
    [
      isRegionProfileFactConfirmed(profile, "identity", "population"),
      isRegionProfileFactConfirmed(profile, "identity", "areaKm2"),
      isRegionProfileFactConfirmed(profile, "identity", "formationHistory"),
      isRegionProfileFactConfirmed(profile, "identity", "locationSummary"),
      isRegionProfileFactConfirmed(profile, "travel", "localCharacter") ||
        isRegionProfileFactConfirmed(profile, "character", "localCharacter"),

      isRegionProfileFactConfirmed(profile, "character", "specialties") ||
        isRegionProfileFactConfirmed(profile, "character", "localFoods"),

      isRegionProfileFactConfirmed(profile, "character", "geography") ||
        isRegionProfileFactConfirmed(profile, "character", "landscape"),

      isRegionProfileFactConfirmed(profile, "character", "culture"),
      isRegionProfileFactConfirmed(profile, "climate", "climateSummary"),
      isRegionProfileFactConfirmed(profile, "transport", "publicTransportSummary"),
      isRegionProfileFactConfirmed(profile, "transport", "carFreeTravelAdvice"),
      isRegionProfileFactConfirmed(profile, "travel", "representativePlaces"),
      isRegionProfileFactConfirmed(profile, "safety", "longTermSafetyNotes"),

      // source coverage｜confirmed(=既に最低1件のsourcesを要求済み)の
      // 事実が1件でもあれば「出典に基づく確認が始まっている」とみなす。
      Object.keys(REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY).some(
        function(sectionKey) {
          return Object.keys(
            REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY[sectionKey]
          ).some(
            function(fieldKey) {
              return isRegionProfileFactConfirmed(profile, sectionKey, fieldKey);
            }
          );
        }
      ),

      // photo state｜1枚でも画像が登録されていればtrue。
      !!profile &&
        !!profile.photos &&
        (
          !!profile.photos.heroImage ||
          (Array.isArray(profile.photos.landscapeImages) && profile.photos.landscapeImages.length > 0) ||
          (Array.isArray(profile.photos.foodImages) && profile.photos.foodImages.length > 0) ||
          (Array.isArray(profile.photos.cultureImages) && profile.photos.cultureImages.length > 0) ||
          (Array.isArray(profile.photos.otherImages) && profile.photos.otherImages.length > 0)
        )
    ];

  const confirmedCount =
    checklist.filter(
      function(isConfirmed) {
        return isConfirmed === true;
      }
    ).length;

  return {
    confirmedCount: confirmedCount,
    unknownCount: checklist.length - confirmedCount,
    totalRequired: checklist.length
  };
}

function sanitizeRegionProfileGenericText(
  rawValue,
  maxLength
) {
  if (typeof rawValue !== "string") {
    return "";
  }

  return rawValue
    .trim()
    .slice(0, maxLength);
}

// 出典1件を検証する。urlが指定されている場合はhttp(s)://形式のみ許可する
// (テストF：不正URL拒否)。
function sanitizeRegionProfileSource(
  rawSource
) {
  if (!rawSource || typeof rawSource !== "object") {
    return { ok: false, message: "出典の形式が正しくありません。" };
  }

  const url =
    sanitizeRegionProfileGenericText(
      rawSource.url,
      REGION_PROFILE_TEXT_MAX_LENGTHS.sourceUrl
    );

  if (url !== "" && !/^https?:\/\//.test(url)) {
    return {
      ok: false,
      message: "出典URLはhttp://またはhttps://から入力してください。"
    };
  }

  return {
    ok: true,
    source: {
      name:
        sanitizeRegionProfileGenericText(
          rawSource.name,
          REGION_PROFILE_TEXT_MAX_LENGTHS.sourceName
        ),

      url: url,

      sourceType:
        sanitizeRegionProfileGenericText(
          rawSource.sourceType,
          REGION_PROFILE_TEXT_MAX_LENGTHS.sourceType
        ),

      checkedAt:
        sanitizeRegionProfileGenericText(
          rawSource.checkedAt,
          REGION_PROFILE_TEXT_MAX_LENGTHS.checkedAt
        ),

      publishedAt:
        sanitizeRegionProfileGenericText(
          rawSource.publishedAt,
          REGION_PROFILE_TEXT_MAX_LENGTHS.publishedAt
        )
    }
  };
}

function sanitizeRegionProfileFactValue(
  rawValue,
  fieldKey
) {
  if (REGION_PROFILE_COUNT_WITH_ASOF_FIELDS.has(fieldKey)) {
    if (!rawValue || typeof rawValue !== "object") {
      return null;
    }

    const count =
      typeof rawValue.count === "number" && Number.isFinite(rawValue.count)
        ? rawValue.count
        : null;

    const asOf =
      sanitizeRegionProfileGenericText(
        rawValue.asOf,
        REGION_PROFILE_TEXT_MAX_LENGTHS.checkedAt
      );

    if (count === null) {
      return null;
    }

    return { count: count, asOf: asOf };
  }

  if (REGION_PROFILE_LIST_VALUE_FIELDS.has(fieldKey)) {
    if (!Array.isArray(rawValue)) {
      return [];
    }

    return rawValue
      .slice(0, REGION_PROFILE_LIST_VALUE_MAX_COUNT)
      .filter(
        function(item) {
          return typeof item === "string" && item.trim() !== "";
        }
      )
      .map(
        function(item) {
          return sanitizeRegionProfileGenericText(
            item,
            REGION_PROFILE_TEXT_MAX_LENGTHS.listItem
          );
        }
      );
  }

  return sanitizeRegionProfileGenericText(
    rawValue,
    REGION_PROFILE_TEXT_MAX_LENGTHS.longText
  );
}

// 1つの主要事実(fact)を検証する。本部指示の核心：
// status:"confirmed"なのにsourcesが0件、という状態を拒否する(テストE)。
// validityTypeに"temporary"が来たら拒否する(テストG)。
function sanitizeRegionProfileFact(
  rawFact,
  fieldKey,
  defaultValidityType
) {
  if (!rawFact || typeof rawFact !== "object") {
    return {
      ok: false,
      message: fieldKey + "の形式が正しくありません。"
    };
  }

  const status =
    typeof rawFact.status === "string" ? rawFact.status : "";

  if (!REGION_PROFILE_VALID_STATUS_VALUES.includes(status)) {
    return {
      ok: false,
      message: fieldKey + "のstatusが不正です。"
    };
  }

  const validityType =
    typeof rawFact.validityType === "string"
      ? rawFact.validityType
      : defaultValidityType;

  if (!REGION_PROFILE_VALID_VALIDITY_TYPES.includes(validityType)) {
    return {
      ok: false,
      message:
        fieldKey + "のvalidityTypeが不正です" +
        "(temporaryはPROFILEへ保存できません)。"
    };
  }

  const rawSources =
    Array.isArray(rawFact.sources) ? rawFact.sources : [];

  const sanitizedSources =
    [];

  for (const rawSource of rawSources.slice(0, REGION_PROFILE_SOURCES_MAX_COUNT)) {
    const sourceResult =
      sanitizeRegionProfileSource(rawSource);

    if (!sourceResult.ok) {
      return {
        ok: false,
        message: fieldKey + "の出典：" + sourceResult.message
      };
    }

    sanitizedSources.push(sourceResult.source);
  }

  if (status === "confirmed" && sanitizedSources.length === 0) {
    return {
      ok: false,
      message:
        fieldKey + "をconfirmedにするには、最低1件の出典が必要です。"
    };
  }

  return {
    ok: true,
    fact: {
      value:
        status === "unknown"
          ? (REGION_PROFILE_LIST_VALUE_FIELDS.has(fieldKey) ? [] : null)
          : sanitizeRegionProfileFactValue(rawFact.value, fieldKey),

      status: status,
      validityType: validityType,
      sources: sanitizedSources,

      // unknownのまま(＝未確認)の項目はupdatedAtも null のままにする
      // (「この保存操作が触れた時刻」ではなく「この事実が最後に確認された
      // 時刻」を表すため)。全項目unknownのPROFILEを保存→再取得しても
      // 構造が完全一致する(テストJ)。
      updatedAt:
        status === "confirmed"
          ? new Date().toISOString()
          : null
    }
  };
}

function sanitizeRegionProfilePhotoEntry(
  rawPhoto
) {
  if (!rawPhoto || typeof rawPhoto !== "object") {
    return null;
  }

  const imageUrl =
    sanitizeRegionProfileGenericText(
      rawPhoto.imageUrl,
      REGION_PROFILE_TEXT_MAX_LENGTHS.sourceUrl
    );

  if (imageUrl === "") {
    return null;
  }

  return {
    imageUrl: imageUrl,

    imagePublicId:
      sanitizeRegionProfileGenericText(
        rawPhoto.imagePublicId,
        REGION_PROFILE_TEXT_MAX_LENGTHS.sourceName
      ),

    caption:
      sanitizeRegionProfileGenericText(
        rawPhoto.caption,
        REGION_PROFILE_TEXT_MAX_LENGTHS.shortText
      ),

    source:
      sanitizeRegionProfileGenericText(
        rawPhoto.source,
        REGION_PROFILE_TEXT_MAX_LENGTHS.sourceName
      ),

    rightsStatus:
      sanitizeRegionProfileGenericText(
        rawPhoto.rightsStatus,
        REGION_PROFILE_TEXT_MAX_LENGTHS.sourceType
      ),

    regionRelevance:
      sanitizeRegionProfileGenericText(
        rawPhoto.regionRelevance,
        REGION_PROFILE_TEXT_MAX_LENGTHS.shortText
      )
  };
}

function sanitizeRegionProfilePhotos(
  rawPhotos
) {
  const source =
    rawPhotos && typeof rawPhotos === "object" ? rawPhotos : {};

  return {
    heroImage:
      sanitizeRegionProfilePhotoEntry(source.heroImage),

    landscapeImages:
      Array.isArray(source.landscapeImages)
        ? source.landscapeImages
            .map(sanitizeRegionProfilePhotoEntry)
            .filter(function(entry) { return entry !== null; })
        : [],

    foodImages:
      Array.isArray(source.foodImages)
        ? source.foodImages
            .map(sanitizeRegionProfilePhotoEntry)
            .filter(function(entry) { return entry !== null; })
        : [],

    cultureImages:
      Array.isArray(source.cultureImages)
        ? source.cultureImages
            .map(sanitizeRegionProfilePhotoEntry)
            .filter(function(entry) { return entry !== null; })
        : [],

    otherImages:
      Array.isArray(source.otherImages)
        ? source.otherImages
            .map(sanitizeRegionProfilePhotoEntry)
            .filter(function(entry) { return entry !== null; })
        : []
  };
}

// 入力全体(クライアントがGETで取得→編集→SAVEへ送り返す想定の完全な
// PROFILEオブジェクト)を検証し、安全なPROFILEオブジェクトを組み立てる。
// 未知のキーは全て無視する(許可リスト方式。ハルシネーションや想定外の
// フィールド混入をここで構造的に遮断する)。
function validateAndSanitizeRegionProfileInput(
  rawProfile,
  targetArea
) {
  if (!rawProfile || typeof rawProfile !== "object") {
    return { ok: false, message: "PROFILEの形式が正しくありません。" };
  }

  const sections =
    {};

  for (const sectionKey of Object.keys(REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY)) {
    const fieldDefaults =
      REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY[sectionKey];

    const rawSection =
      rawProfile[sectionKey] &&
      typeof rawProfile[sectionKey] === "object"
        ? rawProfile[sectionKey]
        : {};

    const sanitizedSection =
      {};

    for (const fieldKey of Object.keys(fieldDefaults)) {
      const factResult =
        sanitizeRegionProfileFact(
          rawSection[fieldKey],
          sectionKey + "." + fieldKey,
          fieldDefaults[fieldKey]
        );

      if (!factResult.ok) {
        return { ok: false, message: factResult.message };
      }

      sanitizedSection[fieldKey] =
        factResult.fact;
    }

    sections[sectionKey] =
      sanitizedSection;
  }

  sections.identity.regionName =
    targetArea;

  sections.identity.prefecture =
    REGION_PROFILE_AREA_NAME_TO_PREFECTURE[targetArea] || "";

  sections.identity.country =
    sanitizeRegionProfileGenericText(
      (rawProfile.identity && rawProfile.identity.country) || "日本",
      REGION_PROFILE_TEXT_MAX_LENGTHS.sourceName
    ) || "日本";

  return {
    ok: true,
    profile: Object.assign(
      {},
      sections,
      {
        photos:
          sanitizeRegionProfilePhotos(rawProfile.photos),

        // meta.schemaVersion/createdAt/updatedAtはサーバー側だけが
        // 決定する(クライアントからの値は一切信用しない)。
        meta: {
          lastReviewedAt:
            sanitizeRegionProfileGenericText(
              rawProfile.meta && rawProfile.meta.lastReviewedAt,
              REGION_PROFILE_TEXT_MAX_LENGTHS.checkedAt
            )
        }
      }
    )
  };
}

// AI地域編集部 Phase3.1｜八重瀬町PROFILEを取得する。存在しない場合でも
// 500にせず、exists:false＋初期unknown構造を返す。Firestoreへの
// 自動作成(write)は一切行わない(読むだけでwriteを発生させない、
// というテストBの要件を構造的に満たす：この関数に.set()/.update()/
// .add()の呼び出しは存在しない)。
// AI地域編集部 Phase3.2｜handleRegionProfileGetRequest()と
// handleRegionProfileResearchRequest()の両方から呼ばれる共通の
// 取得処理。挙動はPhase3.1のhandleRegionProfileGetRequest()から
// 1文字も変えていない(純粋な関数抽出のみ)。
async function fetchRegionProfileOrEmpty(
  database,
  targetArea
) {
  const regionProfileId =
    REGION_PROFILE_AREA_NAME_TO_ID[targetArea];

  const documentSnapshot =
    await database
      .collection(REGION_PROFILES_COLLECTION)
      .doc(regionProfileId)
      .get();

  if (!documentSnapshot.exists) {
    const emptyProfile =
      buildEmptyRegionProfile(targetArea);

    return {
      exists: false,
      regionProfileId: regionProfileId,
      profile: emptyProfile
    };
  }

  return {
    exists: true,
    regionProfileId: regionProfileId,
    profile: documentSnapshot.data() || {}
  };
}

async function handleRegionProfileGetRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message: authResult.message
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const targetArea =
      sanitizeRegionProfileGenericText(
        requestBody.targetArea,
        AI_REGION_EDITORIAL_TARGET_AREA_MAX_LENGTH
      );

    if (!REGION_PROFILE_ALLOWED_AREAS.includes(targetArea)) {
      return response.status(400).json({
        success: false,
        message: "地域プロフィールは現在、八重瀬町のみ対応しています(Phase3.1実証中)。"
      });
    }

    const fetchResult =
      await fetchRegionProfileOrEmpty(
        authResult.database,
        targetArea
      );

    return response.status(200).json({
      success: true,
      exists: fetchResult.exists,
      regionProfileId: fetchResult.regionProfileId,
      profile: fetchResult.profile,
      completeness: computeRegionProfileCompleteness(fetchResult.profile)
    });
  } catch (error) {
    console.error(
      "地域プロフィール取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "地域プロフィールの取得中にエラーが発生しました。"
    });
  }
}

// AI地域編集部 Phase3.1｜八重瀬町PROFILEを保存する。管理者/Editorが
// 明示的にこのmodeを呼んだ時だけwriteが発生する(ページ表示・GETでは
// 一切writeしない)。既存のregionRecommendationsコレクションには
// 一切アクセスしない。
async function handleRegionProfileSaveRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message: authResult.message
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const targetArea =
      sanitizeRegionProfileGenericText(
        requestBody.targetArea,
        AI_REGION_EDITORIAL_TARGET_AREA_MAX_LENGTH
      );

    if (!REGION_PROFILE_ALLOWED_AREAS.includes(targetArea)) {
      return response.status(400).json({
        success: false,
        message: "地域プロフィールは現在、八重瀬町のみ対応しています(Phase3.1実証中)。"
      });
    }

    const validationResult =
      validateAndSanitizeRegionProfileInput(
        requestBody.profile,
        targetArea
      );

    if (!validationResult.ok) {
      return response.status(400).json({
        success: false,
        message: validationResult.message
      });
    }

    const regionProfileId =
      REGION_PROFILE_AREA_NAME_TO_ID[targetArea];

    const documentRef =
      authResult.database
        .collection(REGION_PROFILES_COLLECTION)
        .doc(regionProfileId);

    const existingSnapshot =
      await documentRef.get();

    const createdAt =
      existingSnapshot.exists &&
      existingSnapshot.data() &&
      existingSnapshot.data().meta &&
      existingSnapshot.data().meta.createdAt
        ? existingSnapshot.data().meta.createdAt
        : FieldValue.serverTimestamp();

    const profileToStore =
      Object.assign(
        {},
        validationResult.profile,
        {
          meta: Object.assign(
            {},
            validationResult.profile.meta,
            {
              createdAt: createdAt,
              updatedAt: FieldValue.serverTimestamp(),
              schemaVersion: REGION_PROFILE_SCHEMA_VERSION
            }
          )
        }
      );

    await documentRef.set(
      profileToStore
    );

    const storedSnapshot =
      await documentRef.get();

    const storedProfile =
      storedSnapshot.data() || {};

    return response.status(200).json({
      success: true,
      regionProfileId: regionProfileId,
      profile: storedProfile,
      completeness: computeRegionProfileCompleteness(storedProfile)
    });
  } catch (error) {
    console.error(
      "地域プロフィール保存エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "地域プロフィールの保存中にエラーが発生しました。"
    });
  }
}


function findRegionProfileResearchFieldDef(
  fieldKey
) {
  for (const group of AI_REGION_PROFILE_RESEARCH_GROUPS) {
    const fieldDef =
      group.fields.find(
        function(field) {
          return field.fieldKey === fieldKey;
        }
      );

    if (fieldDef) {
      return fieldDef;
    }
  }

  return null;
}

// AI地域編集部 Phase3.2改修(1call方式)｜1グループ分の調査instructions。
// Web Search＋Structured Outputsを同一requestで使う(旧call1の自由文
// レポート生成・旧call2のJSON化という2段階を廃止)。
function buildRegionProfileResearchGroupInstructions(
  targetArea,
  group,
  unconfirmedFields
) {
  const fieldListText =
    unconfirmedFields
      .map(
        function(fieldDef) {
          return "- " + fieldDef.fieldKey + "（" + fieldDef.label + "）";
        }
      )
      .join("\n");

  return (
    "あなたは沖縄県" + targetArea + "について、マチナウという地域情報サイトが" +
    "長期的に保持する『街の記憶(地域プロフィール)』の不足項目を調査する" +
    "リサーチャーです。記事は書きません。今回調べるのは『" + group.label +
    "』グループの以下の項目だけです。\n\n" +
    fieldListText + "\n\n" +
    "検索は、あらかじめ許可された公式ドメインの範囲内でのみ行われます。" +
    "その中で信頼できる情報が見つからない場合は、無理に埋めず、その項目の" +
    "候補を作らないでください。\n\n" +
    "【絶対に守ること】\n" +
    "1. 分からないことを推測・創作で埋めない。\n" +
    "2. 店舗の直接投稿(SHOP DIRECT POSTS)は今回一切与えられていない。" +
    "特産(specialties/localFoods)を、店舗の商品情報だけを根拠に断定しない。\n" +
    "3. 人口(population)は、必ず値と基準日(何年何月何日時点か)をセットで" +
    "確認する。基準日が分からない人口値は候補にしない。\n" +
    "4. transport.carFreeTravelAdviceは、一次情報の丸写しではなく、" +
    "publicTransportSummaryで確認した交通事実をもとに『車を持たない旅行者に" +
    "とって何を意味するか』というあなた自身の解釈として書く(その旨が" +
    "分かるように書く)。\n" +
    "5. 出力するJSON文字列の中にURLやドメイン名を一切書かない" +
    "(evidenceには、確認できた事実の短い要約だけを書く)。出典の実際の" +
    "URLは、あなたの出力とは別にシステム側が記録します。\n" +
    "6. safety.longTermSafetyNotesは、台風常襲地域である・高台と低地が" +
    "混在する等の長期的・構造的な安全特性だけを対象にする。『本日の警報』" +
    "『今週の注意情報』のような今日・今週限定のNOW情報は一切含めない。\n" +
    "7. travel.representativePlacesのように複数の代表的な場所をまとめて" +
    "答える項目は、suggestedValueの中で読点(、)を使って複数の地名を1つの" +
    "文字列として区切って書く(例：「城跡公園、道の駅、海岸」)。\n\n" +
    "【出力】\n" +
    "指定されたJSON形式のcandidatesだけを返してください。確認できなかった" +
    "項目は配列に含めないでください。"
  );
}

function buildRegionProfileResearchGroupInputItems(
  payload
) {
  const contextJson =
    JSON.stringify(
      {
        targetArea: payload.targetArea,
        groupLabel: payload.group.label
      }
    );

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "【対象市町村・グループ(JSON)】\n" +
            contextJson +
            "\n\n" +
            "許可された公式ドメインの範囲でWeb検索を行い、確認できた項目だけ" +
            "candidatesへ含めてください。"
        }
      ]
    }
  ];
}

function buildRegionProfileResearchGroupJsonSchema() {
  return {
    type: "json_schema",
    name: "region_profile_research_group_candidates",
    strict: true,
    schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fieldKey: { type: "string" },
              suggestedValue: { type: "string" },
              asOf: { type: "string" },
              evidence: { type: "string" },
              sourceTypeGuess: { type: "string" },
              confidence: { type: "string" }
            },
            required: [
              "fieldKey",
              "suggestedValue",
              "asOf",
              "evidence",
              "sourceTypeGuess",
              "confidence"
            ],
            additionalProperties: false
          }
        }
      },
      required: ["candidates"],
      additionalProperties: false
    }
  };
}

// web_search_call.action.sourcesから実URLを取り出す。OpenAI公式ドキュメント
// (developers.openai.com/api/docs/guides/tools-web-search)で確認済みの
// 仕様：includeへ"web_search_call.action.sources"を指定すると、
// response.output内のtype:"web_search_call"アイテムのaction.sourcesに
// 実際に参照したURLの配列が入る。AIの出力(candidates)側には一切URLを
// 出力させず、この構造化データだけを「実際に参照した情報源」として扱う
// (本部指示：sourceUrlをAIが創作してはいけない)。http/https以外は除外し、
// URLを正規化して重複を除く。
function extractActualSourcesFromResponsesOutput(
  outputItems
) {
  const rawSources =
    [];

  outputItems.forEach(
    function(item) {
      if (
        !item ||
        item.type !== "web_search_call" ||
        !item.action ||
        !Array.isArray(item.action.sources)
      ) {
        return;
      }

      item.action.sources.forEach(
        function(source) {
          if (
            !source ||
            typeof source.url !== "string" ||
            source.url === ""
          ) {
            return;
          }

          if (!/^https?:\/\//i.test(source.url)) {
            // http/httpsのみ許可(本部指示)。
            return;
          }

          rawSources.push(source);
        }
      );
    }
  );

  const seenUrls =
    new Set();

  const dedupedSources =
    [];

  rawSources.forEach(
    function(source) {
      // 正規化：末尾スラッシュの有無だけの違いを重複として扱う。
      const normalizedUrl =
        source.url.replace(/\/$/, "");

      if (seenUrls.has(normalizedUrl)) {
        return;
      }

      seenUrls.add(normalizedUrl);

      if (dedupedSources.length < AI_REGION_PROFILE_RESEARCH_MAX_SOURCES_PER_GROUP) {
        dedupedSources.push(
          {
            url:
              sanitizeRegionEditorialText(
                source.url,
                AI_REGION_EDITORIAL_SOURCE_FACT_TEXT_MAX_LENGTHS.websiteUrl
              ),

            title:
              sanitizeRegionEditorialText(
                source.title,
                AI_REGION_PROFILE_RESEARCH_TEXT_MAX_LENGTHS.sourceTitle
              )
          }
        );
      }
    }
  );

  return dedupedSources;
}

function extractOutputTextFromResponsesOutput(
  outputItems
) {
  const messageItem =
    outputItems.find(
      function(item) {
        return (
          item &&
          item.type === "message" &&
          item.role === "assistant" &&
          Array.isArray(item.content)
        );
      }
    );

  if (!messageItem) {
    return "";
  }

  return messageItem.content
    .filter(
      function(contentPart) {
        return (
          contentPart &&
          contentPart.type === "output_text" &&
          typeof contentPart.text === "string"
        );
      }
    )
    .map(
      function(contentPart) {
        return contentPart.text;
      }
    )
    .join("");
}

// AI地域編集部 Phase3.2改修(1call方式)｜1グループ分の調査を、Web Search
// ＋Structured Outputs＋include:["web_search_call.action.sources"]という
// 単一のResponses API requestで行う。Production能力検証(elapsedMs=4905)で
// 実際に成立することを確認済みの構造をそのまま使う。旧call1(自由文
// レポート)→call2(JSON化)という2段階は廃止。
async function callOpenAiRegionProfileResearchGroup(
  payload
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error("OPENAI_API_KEY が設定されていません。");

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const instructions =
    buildRegionProfileResearchGroupInstructions(
      payload.targetArea,
      payload.group,
      payload.unconfirmedFields
    );

  const inputItems =
    buildRegionProfileResearchGroupInputItems(
      payload
    );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      AI_REGION_PROFILE_RESEARCH_GROUP_TIMEOUT_MS
    );

  const startedAtMs =
    Date.now();

  let response;

  try {
    try {
      response =
        await fetch(
          AI_REGION_PROFILE_RESEARCH_ENDPOINT,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + apiKey
            },

            body: JSON.stringify({
              model: AI_REGION_PROFILE_RESEARCH_MODEL,
              instructions: instructions,
              input: inputItems,

              tools: [
                {
                  type: "web_search",

                  // 本部指示｜Production実測(80,408 input tokens／
                  // sources最大20件)を踏まえた最小最適化。公式ドキュメント
                  // (developers.openai.com/api/docs/guides/tools-web-search)
                  // で確認済みの配置(web_searchツールオブジェクトの
                  // 直下、filtersと同階層)にsearch_context_size:"low"を
                  // 追加する。「low＝簡易な照会向け」という公式説明どおり、
                  // 検索結果から取り込むコンテキスト量そのものを絞る狙い。
                  // allowed_domains/prompt/4グループ定義/candidateSources
                  // 生成方式等、他の設計は一切変更しない
                  // (search_context_size単独の効果をProductionで比較する
                  // ため)。
                  search_context_size: "low",

                  filters: {
                    allowed_domains: payload.group.allowedDomains
                  }
                }
              ],

              tool_choice: "auto",
              include: ["web_search_call.action.sources"],

              text: {
                format:
                  buildRegionProfileResearchGroupJsonSchema()
              },

              reasoning: {
                effort: AI_REGION_PROFILE_RESEARCH_REASONING_EFFORT
              }
            }),

            signal: controller.signal
          }
        );
    } catch (fetchError) {
      const elapsedMs =
        Date.now() - startedAtMs;

      if (fetchError.name === "AbortError") {
        const timeoutError =
          new Error("街の記憶調査(" + payload.group.label + ")がタイムアウトしました。");

        timeoutError.isTransient =
          true;

        timeoutError.isTimeout =
          true;

        timeoutError.elapsedMs =
          elapsedMs;

        throw timeoutError;
      }

      const networkError =
        new Error("街の記憶調査(" + payload.group.label + ")の呼び出しに失敗しました。");

      networkError.isTransient =
        true;

      networkError.isNetworkError =
        true;

      networkError.elapsedMs =
        elapsedMs;

      throw networkError;
    }
  } finally {
    clearTimeout(
      timeoutId
    );
  }

  const elapsedMs =
    Date.now() - startedAtMs;

  if (!response.ok) {
    const httpError =
      new Error("OpenAI APIがエラーを返しました。status=" + response.status);

    httpError.isHttpError =
      true;

    httpError.httpStatus =
      response.status;

    httpError.isTransient =
      true;

    httpError.elapsedMs =
      elapsedMs;

    throw httpError;
  }

  let responseData;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    const parseError =
      new Error("OpenAI APIの応答を解析できませんでした。");

    parseError.isJsonError =
      true;

    parseError.isTransient =
      true;

    parseError.elapsedMs =
      elapsedMs;

    throw parseError;
  }

  const outputItems =
    Array.isArray(responseData.output)
      ? responseData.output
      : [];

  const rawText =
    extractOutputTextFromResponsesOutput(outputItems);

  const actualSources =
    extractActualSourcesFromResponsesOutput(outputItems);

  let rawCandidates =
    [];

  if (rawText.trim() !== "") {
    try {
      const parsedOutput =
        JSON.parse(rawText);

      if (Array.isArray(parsedOutput.candidates)) {
        rawCandidates =
          parsedOutput.candidates;
      }
    } catch (parseError) {
      // JSON解析に失敗した場合は空配列のまま扱う(本部指示：単純さを優先。
      // グループ単位でエラー分離しており、他グループの結果には影響しない)。
    }
  }

  return {
    elapsedMs: elapsedMs,
    rawCandidates: rawCandidates,
    actualSources: actualSources,

    usage:
      responseData.usage
        ? {
            inputTokens:
              typeof responseData.usage.input_tokens === "number"
                ? responseData.usage.input_tokens
                : null,

            outputTokens:
              typeof responseData.usage.output_tokens === "number"
                ? responseData.usage.output_tokens
                : null,

            totalTokens:
              typeof responseData.usage.total_tokens === "number"
                ? responseData.usage.total_tokens
                : null
          }
        : null
  };
}

// 1候補を検証する。本部指示の核心：AIはURL/ドメインを一切出力しないため、
// URLハルシネーションの経路自体が構造的に存在しない(旧sourceRefId方式の
// ような「存在しないIDを参照」という失敗モードごと無くなった)。
// candidateSources(そのグループのcallで実際に取得したsources全部)は、
// この関数の外(呼び出し元)でグループ単位に一括で付与する
// (「このcandidateはこの1URLだけが根拠」という偽の精度を主張しない)。
function sanitizeRegionProfileResearchCandidate(
  rawCandidate,
  fieldDefsByKey
) {
  if (!rawCandidate || typeof rawCandidate !== "object") {
    return null;
  }

  const fieldKey =
    typeof rawCandidate.fieldKey === "string" ? rawCandidate.fieldKey : "";

  const fieldDef =
    fieldDefsByKey.get(fieldKey);

  if (!fieldDef) {
    // グループに含まれないfieldKeyを返してきた場合は破棄する(テストC)。
    return null;
  }

  const evidence =
    sanitizeRegionEditorialText(
      rawCandidate.evidence,
      AI_REGION_PROFILE_RESEARCH_TEXT_MAX_LENGTHS.evidenceQuote
    );

  if (evidence === "") {
    return null;
  }

  const asOf =
    sanitizeRegionEditorialText(
      rawCandidate.asOf,
      AI_REGION_PROFILE_RESEARCH_TEXT_MAX_LENGTHS.asOf
    );

  if (fieldDef.requiresAsOf && asOf === "") {
    // 人口にasOfが無い候補を採用可能状態にしない(テストF)。
    return null;
  }

  const suggestedValueText =
    sanitizeRegionEditorialText(
      rawCandidate.suggestedValue,
      AI_REGION_PROFILE_RESEARCH_TEXT_MAX_LENGTHS.suggestedValue
    );

  if (suggestedValueText === "") {
    return null;
  }

  if (fieldDef.isNumeric) {
    const numericMatch =
      suggestedValueText.match(/[0-9]+(\.[0-9]+)?/);

    if (!numericMatch) {
      // 数値が全く読み取れない候補(単位無しの曖昧な文章等)は破棄する。
      return null;
    }
  }

  return {
    fieldKey: fieldDef.fieldKey,
    section: fieldDef.section,
    field: fieldDef.field,
    label: fieldDef.label,
    suggestedValueText: suggestedValueText,
    asOf: asOf,
    evidenceQuote: evidence,

    confidence:
      sanitizeRegionEditorialText(
        rawCandidate.confidence,
        AI_REGION_PROFILE_RESEARCH_TEXT_MAX_LENGTHS.confidence
      ),

    sourceTypeGuess:
      sanitizeRegionEditorialText(
        rawCandidate.sourceTypeGuess,
        AI_REGION_PROFILE_RESEARCH_TEXT_MAX_LENGTHS.sourceTypeGuess
      ),

    // 本部指示：temporaryはPROFILEへ保存しない。ここでAIに自由入力させず、
    // 既存のREGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY(Phase3.1で
    // 定義済み、stable/periodicのみ)からサーバー側だけで決定する
    // (テストP：既存confirmed ruleを維持)。
    validityType:
      REGION_PROFILE_SECTION_FIELD_DEFAULT_VALIDITY[fieldDef.section][fieldDef.field],

    isEditorialInterpretation: fieldDef.isEditorialInterpretation,

    // 実装GO｜Phase3完成｜travel.representativePlaces等、値がリストになる
    // 項目かどうかをクライアントへ伝える(採用時に配列化するかどうかの
    // 判断に使う。fieldDefにisListValueが無ければfalse扱い)。
    isListValue: fieldDef.isListValue === true
  };
}

// AI地域編集部 Phase3.2改修(1call方式)｜1つのグループを調査し、
// 候補とそのグループの実sources・診断情報(groupResult)を返す。
// 1グループの失敗が他グループの結果を巻き込まないよう、例外はここで
// 吸収し、呼び出し元へは常に{ok, groupResult, candidates}の形で返す。
async function researchRegionProfileGroup(
  targetArea,
  group,
  unconfirmedFields
) {
  const fieldDefsByKey =
    new Map(
      unconfirmedFields.map(
        function(fieldDef) {
          return [fieldDef.fieldKey, fieldDef];
        }
      )
    );

  let groupCallResult;

  try {
    groupCallResult =
      await callOpenAiRegionProfileResearchGroup(
        {
          targetArea: targetArea,
          group: group,
          unconfirmedFields: unconfirmedFields
        }
      );
  } catch (groupError) {
    console.error(
      "街の記憶調査(" + group.label + ")エラー：",
      groupError
    );

    return {
      ok: false,
      candidates: [],

      groupResult: {
        groupKey: group.groupKey,
        label: group.label,
        success: false,
        elapsedMs: typeof groupError.elapsedMs === "number" ? groupError.elapsedMs : null,
        candidateCount: 0,
        sourcesCount: 0,

        errorType:
          groupError.isTimeout
            ? "timeout"
            : (groupError.isHttpError ? "http_error" : "network_or_parse_error"),

        usage: null
      }
    };
  }

  const candidateSources =
    groupCallResult.actualSources;

  // 本部指示：sourcesが0件のグループのcandidateは、自動採用可能な候補
  // として返さない(安全側)。
  const candidates =
    candidateSources.length === 0
      ? []
      : (function() {
          const seenFieldKeys =
            new Set();

          const sanitizedCandidates =
            [];

          groupCallResult.rawCandidates.forEach(
            function(rawCandidate) {
              const sanitized =
                sanitizeRegionProfileResearchCandidate(
                  rawCandidate,
                  fieldDefsByKey
                );

              if (!sanitized) {
                return;
              }

              // 1フィールドにつき候補は1件まで(最初に出てきた有効な候補)。
              if (seenFieldKeys.has(sanitized.fieldKey)) {
                return;
              }

              seenFieldKeys.add(sanitized.fieldKey);

              // 「このcandidateはこのURLだけが根拠」という偽の精度は
              // 主張せず、このグループのcallで実際に取得したsources全部を
              // 正直に結びつける(本部指示：candidateSources)。
              sanitizedCandidates.push(
                Object.assign(
                  {},
                  sanitized,
                  {
                    candidateSources: candidateSources
                  }
                )
              );
            }
          );

          return sanitizedCandidates;
        })();

  return {
    ok: true,
    candidates: candidates,

    groupResult: {
      groupKey: group.groupKey,
      label: group.label,
      success: true,
      elapsedMs: groupCallResult.elapsedMs,
      candidateCount: candidates.length,
      sourcesCount: candidateSources.length,
      errorType: null,
      usage: groupCallResult.usage
    }
  };
}

// AI地域編集部 Phase3.2改修(1call方式)｜八重瀬町PROFILEの不足4グループを
// 調査し、出典付きの候補を返す。この関数はFirestoreへ一切書き込まない
// (regionProfileGet/Saveと同じく、書き込みは既存regionProfileSaveへの
// 別リクエストでのみ発生する。「採用」＝クライアントが候補をPROFILE
// 形式へ変換してregionProfileSaveを呼ぶ、という既存経路の再利用)。
async function handleRegionProfileResearchRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message: authResult.message
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const targetArea =
      sanitizeRegionProfileGenericText(
        requestBody.targetArea,
        AI_REGION_EDITORIAL_TARGET_AREA_MAX_LENGTH
      );

    if (!AI_REGION_PROFILE_RESEARCH_ALLOWED_AREAS.includes(targetArea)) {
      return response.status(400).json({
        success: false,
        message: "街の記憶調査は現在、八重瀬町のみ対応しています(Phase3.2実証中)。"
      });
    }

    const fetchResult =
      await fetchRegionProfileOrEmpty(
        authResult.database,
        targetArea
      );

    const totalStartedAtMs =
      Date.now();

    const groupResults =
      [];

    const candidates =
      [];

    let openAiCallCount =
      0;

    for (const group of AI_REGION_PROFILE_RESEARCH_GROUPS) {
      const unconfirmedFields =
        group.fields.filter(
          function(fieldDef) {
            return !isRegionProfileFactConfirmed(
              fetchResult.profile,
              fieldDef.section,
              fieldDef.field
            );
          }
        );

      if (unconfirmedFields.length === 0) {
        // 本部指示：確認済みfieldだけのグループはOpenAIを呼ばない。
        groupResults.push(
          {
            groupKey: group.groupKey,
            label: group.label,
            success: true,
            elapsedMs: 0,
            candidateCount: 0,
            sourcesCount: 0,
            errorType: null,
            usage: null,
            skipped: true
          }
        );

        continue;
      }

      openAiCallCount +=
        1;

      const groupOutcome =
        await researchRegionProfileGroup(
          targetArea,
          group,
          unconfirmedFields
        );

      groupResults.push(
        groupOutcome.groupResult
      );

      groupOutcome.candidates.forEach(
        function(candidate) {
          if (candidates.length < AI_REGION_PROFILE_RESEARCH_MAX_CANDIDATES) {
            candidates.push(candidate);
          }
        }
      );
    }

    const totalElapsedMs =
      Date.now() - totalStartedAtMs;

    const totalUsage =
      groupResults.reduce(
        function(accumulated, groupResult) {
          if (!groupResult.usage) {
            return accumulated;
          }

          return {
            inputTokens:
              accumulated.inputTokens + (groupResult.usage.inputTokens || 0),

            outputTokens:
              accumulated.outputTokens + (groupResult.usage.outputTokens || 0),

            totalTokens:
              accumulated.totalTokens + (groupResult.usage.totalTokens || 0)
          };
        },
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      );

    return response.status(200).json({
      success: true,
      candidates: candidates,
      openAiCallCount: openAiCallCount,
      groupResults: groupResults,
      totalElapsedMs: totalElapsedMs,
      usage: totalUsage,

      message:
        candidates.length === 0
          ? (
              openAiCallCount === 0
                ? "対象の4グループはすでにすべて確認済みです。再調査は行いません。"
                : "信頼できる情報源から確認できた新しい事実は見つかりませんでした。"
            )
          : candidates.length + "件の候補が見つかりました。内容と出典を確認のうえ、採用するものだけを選んでください。"
    });
  } catch (error) {
    console.error(
      "街の記憶調査：処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "街の記憶調査中にエラーが発生しました。"
    });
  }
}


// 「この街の情報」Phase1｜regionProfiles/regionRecommendations/
// regionEditorialのいずれにも依存しない、完全に独立した新機能。GPSで
// 市区町村が確定した旅行者が「この街の情報」ボタンを押した時だけ、
// Terra(web_search付き)がその場でその市区町村を調べて600〜800字の
// 紹介記事を生成し、Firestoreへ90日間キャッシュする。GPS取得時点では
// このFunctionを一切呼ばない(呼び出しはボタン押下時のみ、app.js側で
// 制御する)。既存のregionProfiles(街の記憶・人間確認済み長期記憶)・
// regionRecommendations/regionEditorial(運営が採用ボタンを押して確定する
// 記事)とは保存先・生成方式・レビュー方式が全く異なるため、意図的に
// 独立したcollection・独立した定数群として実装する。
const CITY_INFO_ARTICLES_COLLECTION =
  "cityInfoArticles";

// Phase1時点でマチナウが対象とする地域は沖縄県内のみ(既存の
// OKINAWA_MUNICIPALITY_TO_REGION_NAME等、他の既存前提と同じ)。本部指示
// 「41市町村・全国自治体を手登録する構造にしない」に従い、市区町村ごとの
// 個別登録は行わず、この1つの定数だけで全ての沖縄県内市町村に対応する。
const CITY_INFO_PREFECTURE =
  "沖縄県";

const CITY_INFO_COUNTRY =
  "日本";

const CITY_INFO_MODEL =
  process.env.AI_CITY_INFO_MODEL ||
  "gpt-5.6-terra";

const CITY_INFO_ENDPOINT =
  "https://api.openai.com/v1/responses";

const CITY_INFO_REASONING_EFFORT =
  "medium";

// Terra＋web_searchを1 requestで使う既存実績(regionProfileResearchの
// AI_REGION_PROFILE_RESEARCH_GROUP_TIMEOUT_MS)と同じ60秒に合わせる。
const CITY_INFO_TIMEOUT_MS =
  60000;

const CITY_INFO_TARGET_AREA_MAX_LENGTH =
  40;

const CITY_INFO_TITLE_MAX_LENGTH =
  60;

// 目標は600〜800字(本部指示)。Terraの出力が多少前後しても本文が途中で
// 切れないよう、目標分量の約2倍を安全上限として持たせる(regionEditorial
// のcontent上限設計と同じ考え方)。
const CITY_INFO_CONTENT_MAX_LENGTH =
  1600;

const CITY_INFO_SCHEMA_VERSION =
  1;

const CITY_INFO_EXPIRES_AFTER_MILLISECONDS =
  90 * 24 * 60 * 60 * 1000;

// Firestore document IDとして安全な文字列を、都道府県＋市区町村から
// 事前登録なしで生成する。本部指示により、既存の手動登録型
// REGION_PROFILE_AREA_NAME_TO_ID(現状八重瀬町のみ)には依存させない。
// Firestore document IDの制約("/"を含められない、"."単体・".."は不可、
// "__"で始まり"__"で終わる名前は予約済み、UTF-8で1500byte以内)を踏まえ、
// 安全側に短絡させる。
function sanitizeCityInfoRegionKeyPart(
  rawText
) {
  if (typeof rawText !== "string") {
    return "";
  }

  return rawText
    .trim()
    .replace(/\//g, "");
}

function buildCityInfoRegionKey(
  prefecture,
  municipality
) {
  const safePrefecture =
    sanitizeCityInfoRegionKeyPart(prefecture);

  const safeMunicipality =
    sanitizeCityInfoRegionKeyPart(municipality);

  if (safePrefecture === "" || safeMunicipality === "") {
    return null;
  }

  const regionKey =
    safePrefecture + "-" + safeMunicipality;

  if (regionKey === "." || regionKey === "..") {
    return null;
  }

  if (/^__.*__$/.test(regionKey)) {
    return null;
  }

  if (Buffer.byteLength(regionKey, "utf8") > 1500) {
    return null;
  }

  return regionKey;
}

// 本部指定のプロンプトをそのまま反映する(長大な新システムプロンプトを
// 作らない、という本部方針に沿い、独自の追加要件は最小限にとどめる)。
// web_searchを使うため、regionEditorial(web_search不使用)には無い
// 「情報源の信頼性」に関する注意だけを本部指示どおり追加する。
function buildCityInfoInstructions() {
  return (
    "あなたは、旅行者に街の魅力を短く伝えるプロの旅行ライター兼" +
    "コピーライターです。\n\n" +
    "対象の市区町村について、旅行中にスマートフォンで読む" +
    "『この街の情報』を作成してください。\n\n" +
    "旅行者は移動中や屋外で読むことを想定しています。長い観光記事" +
    "ではなく、『ここはどんな街？』『何がある？』が1分程度で分かり、" +
    "その街を少し歩いてみたくなる文章にしてください。\n\n" +
    "【入れてほしい内容】\n" +
    "・市区町村名\n" +
    "・人口と面積\n" +
    "・名前の由来\n" +
    "・街ができた経緯や歴史\n" +
    "・この街らしい風景、文化、産業、食\n" +
    "・おすすめスポットが確認できる場合は具体名で2〜4か所\n" +
    "・今後のまちづくりや新しい取り組みなど、確かな情報があれば簡潔に" +
    "紹介\n\n" +
    "600〜800字程度。\n\n" +
    "百科事典のような羅列ではなく、一つの短い旅の読み物として自然に" +
    "つなぐ。最初の数行でその街らしさを伝える。\n\n" +
    "行政資料のような文章にしない。過剰な観光コピーにしない。\n\n" +
    "おすすめスポットは確認できる場合、具体的な名称を使用し、そこで" +
    "何を感じたり楽しめるかを短く伝える。\n\n" +
    "人口や面積は文章へ自然に入れる。\n\n" +
    "現在の営業時間、料金、イベント開催状況、交通運行など変化しやすい" +
    "情報は、最新確認できない限り断定しない。\n\n" +
    "確認できない事実を推測・創作しない。\n\n" +
    "最後は、『今ここにいるなら、ちょっと行ってみようかな』と思える" +
    "自然な言葉で締める。\n\n" +
    "【情報源についての注意】\n" +
    "Web検索では、自治体公式サイト・国や都道府県等の公的機関・公式" +
    "観光協会・施設公式サイトなど、信頼できる一次情報を優先してくだ" +
    "さい。Wikipedia、まとめサイト、個人ブログ等の情報だけを根拠に、" +
    "人口・面積・歴史・名前の由来などの事実を断定しないでください。" +
    "信頼できる情報源で確認できない場合は、無理に埋めず、確認できた" +
    "範囲だけで書いてください。\n\n" +
    "Web検索で使用した出典・URL・Markdownリンク・ドメイン名・引用表記を、" +
    "titleおよびcontentへ出力しないでください。Web検索は事実確認のために" +
    "使用し、完成記事は通常の旅行読み物として出力してください。\n\n" +
    "【タイトル】\n" +
    "titleは『市区町村名｜〜』の形を基本にする(例：『八重瀬町｜〜』)。" +
    "都道府県名をタイトルの先頭に含めない(『沖縄県八重瀬町｜〜』のような" +
    "形にしない)。都道府県名は必要であれば本文(content)の中で使ってよい。" +
    "\n\n" +
    "【出力】\n" +
    "本文中にURL・Markdownリンク(例：[文字列](URL))・出典を示す丸括弧" +
    "書き(例：(ドメイン名)、(URL))を一切書かないでください。指定された" +
    "JSON形式(title/content)以外の文字列(前置き・挨拶・コードブロック" +
    "記法等)を一切含めないでください。本文はMarkdown記法(##見出し、" +
    "**太字**等)を使わないでください。"
  );
}

function buildCityInfoInputItems(
  targetArea,
  prefecture
) {
  const contextJson =
    JSON.stringify(
      {
        targetArea: targetArea,
        prefecture: prefecture,
        country: CITY_INFO_COUNTRY
      }
    );

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "【対象市区町村(JSON)】\n" +
            contextJson +
            "\n\n" +
            "この市区町村について、指定されたJSON形式で" +
            "『この街の情報』を作成してください。"
        }
      ]
    }
  ];
}

function buildCityInfoJsonSchema() {
  return {
    type: "json_schema",
    name: "city_info_article",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" }
      },
      required: ["title", "content"],
      additionalProperties: false
    }
  };
}

// Production実証(八重瀬町初回生成)で、Terraがweb_search由来の出典を
// 「(ドメイン名)(URL)」やMarkdownリンク「[文字列](URL)」の形でtitle/
// content本文へそのまま書き込んでしまうことを確認した。原因調査：
// callOpenAiCityInfoはresponse.output内のtype:"output_text"パートから
// text文字列だけを取り出しており(下記参照)、annotations等の構造化された
// 出典情報を本文へ変換するコードは存在しない。つまりURLはこのFunctionの
// 抽出処理が混入させたものではなく、Terra自身がJSON文字列(title/content)
// の中に直接書き込んだものである。json_schemaによるStructured Outputsは
// 「JSON形式であること」だけを強制し、文字列の中身(URLを書くかどうか)
// までは制約できないため、instructions側の指示(buildCityInfoInstructions
// 参照)だけに依存せず、実際に観測されたこのパターンに限定した最小の
// サーバー側除去処理を安全網として追加する(本部指示：推測で正規表現を
// 大量追加しない)。
function stripCitationArtifactsFromCityInfoText(
  rawText
) {
  if (typeof rawText !== "string") {
    return "";
  }

  return rawText
    // Markdownリンク「[文字列](URL)」をまるごと除去する。
    .replace(/\[[^\[\]]*\]\(https?:\/\/[^\s)]+\)/g, "")
    // 「(ドメイン名)(URL)」のように、URLを含む丸括弧の直前に隣接する
    // 別の丸括弧(ドメイン名だけのラベル等)がある場合は、それも含めて
    // まるごと除去する。単独の「(URL)」にもそのまま一致する
    // (先頭の丸括弧グループは任意)。
    .replace(/(\([^()]*\))?\([^()]*https?:\/\/[^()]*\)/g, "")
    // 上記2パターンに当てはまらない裸のURLを除去する。
    .replace(/https?:\/\/\S+/g, "")
    // 除去によって生じた余分な空白・改行の連続だけを整える
    // (文章の言い換え等は一切行わない)。
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Terra＋web_search＋Structured Outputsを1 requestで使う既存実績
// (callOpenAiRegionProfileResearchGroup)と同じ技術構成。本部指示により、
// allowed_domainsによる市町村ごとの事前登録は行わない(全国展開時に
// 手登録が発生する構造を避けるため)。
async function callOpenAiCityInfo(
  payload
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error("OPENAI_API_KEY が設定されていません。");

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const instructions =
    buildCityInfoInstructions();

  const inputItems =
    buildCityInfoInputItems(
      payload.targetArea,
      payload.prefecture
    );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      CITY_INFO_TIMEOUT_MS
    );

  let response;

  try {
    try {
      response =
        await fetch(
          CITY_INFO_ENDPOINT,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + apiKey
            },

            body: JSON.stringify({
              model: CITY_INFO_MODEL,
              instructions: instructions,
              input: inputItems,

              tools: [
                {
                  type: "web_search",
                  search_context_size: "low"
                }
              ],

              tool_choice: "auto",

              text: {
                format:
                  buildCityInfoJsonSchema()
              },

              reasoning: {
                effort: CITY_INFO_REASONING_EFFORT
              }
            }),

            signal: controller.signal
          }
        );
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        const timeoutError =
          new Error("この街の情報の生成がタイムアウトしました。");

        timeoutError.isTransient =
          true;

        timeoutError.isTimeout =
          true;

        throw timeoutError;
      }

      const networkError =
        new Error("この街の情報の生成呼び出しに失敗しました。");

      networkError.isTransient =
        true;

      networkError.isNetworkError =
        true;

      throw networkError;
    }
  } finally {
    clearTimeout(
      timeoutId
    );
  }

  if (!response.ok) {
    const httpError =
      new Error(
        "OpenAI APIがエラーを返しました。status=" + response.status
      );

    httpError.isHttpError =
      true;

    httpError.httpStatus =
      response.status;

    httpError.isTransient =
      true;

    throw httpError;
  }

  let responseData;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    const parseError =
      new Error("OpenAI APIの応答を解析できませんでした。");

    parseError.isJsonError =
      true;

    parseError.isTransient =
      true;

    throw parseError;
  }

  const outputItems =
    Array.isArray(responseData.output)
      ? responseData.output
      : [];

  const messageItem =
    outputItems.find(
      function(item) {
        return (
          item &&
          item.type === "message" &&
          item.role === "assistant" &&
          Array.isArray(item.content)
        );
      }
    );

  const rawText =
    messageItem
      ? messageItem.content
          .filter(
            function(contentPart) {
              return (
                contentPart &&
                contentPart.type === "output_text" &&
                typeof contentPart.text === "string"
              );
            }
          )
          .map(
            function(contentPart) {
              return contentPart.text;
            }
          )
          .join("")
      : "";

  if (rawText.trim() === "") {
    const shapeError =
      new Error("OpenAI APIの応答形式が不正です。");

    shapeError.isJsonError =
      true;

    shapeError.isTransient =
      true;

    throw shapeError;
  }

  let parsedArticle;

  try {
    parsedArticle =
      JSON.parse(rawText);
  } catch (parseError) {
    const shapeError =
      new Error("この街の情報がJSON形式ではありませんでした。");

    shapeError.isJsonError =
      true;

    shapeError.isTransient =
      true;

    throw shapeError;
  }

  return {
    title:
      sanitizeRegionEditorialText(
        stripCitationArtifactsFromCityInfoText(
          parsedArticle.title
        ),
        CITY_INFO_TITLE_MAX_LENGTH
      ),

    content:
      sanitizeRegionEditorialText(
        stripCitationArtifactsFromCityInfoText(
          parsedArticle.content
        ),
        CITY_INFO_CONTENT_MAX_LENGTH
      )
  };
}

// 90日キャッシュの読み取り。単一document読み取りのみ(collectionクエリ
// 不要)。期限切れ・未生成・データ形式不正のいずれもnullとして扱い、
// 呼び出し元が一律「無ければ生成する」で処理できるようにする。
async function fetchCityInfoArticleOrNull(
  database,
  regionKey
) {
  const documentSnapshot =
    await database
      .collection(CITY_INFO_ARTICLES_COLLECTION)
      .doc(regionKey)
      .get();

  if (!documentSnapshot.exists) {
    return null;
  }

  const data =
    documentSnapshot.data() || {};

  const expiresAtMilliseconds =
    data.expiresAt &&
    typeof data.expiresAt.toMillis === "function"
      ? data.expiresAt.toMillis()
      : null;

  if (
    expiresAtMilliseconds === null ||
    expiresAtMilliseconds <= Date.now()
  ) {
    return null;
  }

  if (
    typeof data.title !== "string" ||
    typeof data.content !== "string"
  ) {
    return null;
  }

  return {
    title: data.title,
    content: data.content
  };
}

async function saveCityInfoArticle(
  database,
  regionKey,
  payload
) {
  const expiresAtDate =
    new Date(
      Date.now() +
      CITY_INFO_EXPIRES_AFTER_MILLISECONDS
    );

  await database
    .collection(CITY_INFO_ARTICLES_COLLECTION)
    .doc(regionKey)
    .set({
      regionKey: regionKey,
      regionName: payload.regionName,
      prefecture: payload.prefecture,
      country: CITY_INFO_COUNTRY,
      title: payload.title,
      content: payload.content,

      generatedAt:
        FieldValue.serverTimestamp(),

      expiresAt:
        Timestamp.fromDate(expiresAtDate),

      model: CITY_INFO_MODEL,
      schemaVersion: CITY_INFO_SCHEMA_VERSION
    });
}

// 「この街の情報」Phase1｜公開機能(旅行者向け)のため、AIコンシェルジュ
// (handleAiConciergeChatRequest)と同じ認証方式(有効なFirebase IDトークン
// を持つユーザーなら誰でも可、匿名認証も許可、管理者/Editor限定にしない)
// を採用する。regionEditorial/regionProfile系のrequireAdminOrEditor()は
// ここでは使わない(旅行者本人がボタンを押す機能のため)。
async function handleCityInfoGetRequest(
  request,
  response
) {
  try {
    const idToken =
      readBearerToken(
        request
      );

    if (idToken === "") {
      return response.status(401).json({
        success: false,
        message: "認証情報がありません。"
      });
    }

    const app =
      getFirebaseAdminApp();

    try {
      await getAuth(app)
        .verifyIdToken(
          idToken
        );
    } catch (verifyError) {
      return response.status(401).json({
        success: false,
        message: "認証情報が正しくありません。"
      });
    }

    const database =
      getFirestore(app);

    const requestBody =
      readRequestBody(
        request
      );

    const targetArea =
      sanitizeRegionEditorialText(
        requestBody.targetArea,
        CITY_INFO_TARGET_AREA_MAX_LENGTH
      );

    if (targetArea === "") {
      return response.status(400).json({
        success: false,
        message: "対象市区町村を指定してください。"
      });
    }

    const regionKey =
      buildCityInfoRegionKey(
        CITY_INFO_PREFECTURE,
        targetArea
      );

    if (!regionKey) {
      return response.status(400).json({
        success: false,
        message: "対象市区町村を正しく処理できませんでした。"
      });
    }

    const cachedArticle =
      await fetchCityInfoArticleOrNull(
        database,
        regionKey
      );

    if (cachedArticle) {
      return response.status(200).json({
        success: true,
        cached: true,
        title: cachedArticle.title,
        content: cachedArticle.content
      });
    }

    let generatedArticle;

    try {
      generatedArticle =
        await callOpenAiCityInfo(
          {
            targetArea: targetArea,
            prefecture: CITY_INFO_PREFECTURE
          }
        );
    } catch (aiError) {
      console.error(
        "この街の情報：生成エラー：",
        aiError
      );

      return response.status(200).json({
        success: false,
        message:
          "この街の情報の生成中にエラーが発生しました。時間をおいて、もう一度お試しください。"
      });
    }

    if (
      generatedArticle.title === "" ||
      generatedArticle.content === ""
    ) {
      return response.status(200).json({
        success: false,
        message: "この街の情報を生成できませんでした。"
      });
    }

    try {
      await saveCityInfoArticle(
        database,
        regionKey,
        {
          regionName: targetArea,
          prefecture: CITY_INFO_PREFECTURE,
          title: generatedArticle.title,
          content: generatedArticle.content
        }
      );
    } catch (saveError) {
      // 保存に失敗しても、今回生成できた記事はそのままこの旅行者へ
      // 返す(体験を優先する)。次回アクセス時は未保存のため再生成される
      // だけで、データ不整合等の実害は無い。
      console.error(
        "この街の情報：保存エラー：",
        saveError
      );
    }

    return response.status(200).json({
      success: true,
      cached: false,
      title: generatedArticle.title,
      content: generatedArticle.content
    });
  } catch (error) {
    console.error(
      "この街の情報：処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message: "この街の情報の取得中にエラーが発生しました。"
    });
  }
}


// Ver1.8 Phase1｜AIコンシェルジュ本体。認証はhandleCloudinarySignatureRequest()
// と同じ匿名Firebase AuthenticationのBearer Token検証をそのまま再利用する。
// AI呼び出し・応答検証のいずれかで失敗しても、常にsuccess:falseのJSONを
// 返すだけにとどめ(500エラーの詳細を露出しない)、呼び出し元(app.js)側で
// 既存のルールベース提案へ静かにフォールバックできるようにする。
async function handleAiConciergeRequest(
  request,
  response
) {
  try {
    const idToken =
      readBearerToken(
        request
      );

    if (idToken === "") {
      return response.status(401).json({
        success: false,
        message:
          "認証情報がありません。"
      });
    }

    const app =
      getFirebaseAdminApp();

    try {
      await getAuth(app)
        .verifyIdToken(
          idToken
        );
    } catch (verifyError) {
      return response.status(401).json({
        success: false,
        message:
          "認証情報が正しくありません。"
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const language =
      requestBody.language === "en" ? "en" : "ja";

    const currentTime =
      typeof requestBody.currentTime === "string"
        ? requestBody.currentTime
            .trim()
            .slice(0, AI_CONCIERGE_CURRENT_TIME_MAX_LENGTH)
        : "";

    const contextInput =
      requestBody.context &&
      typeof requestBody.context === "object"
        ? requestBody.context
        : {};

    const area =
      typeof contextInput.area === "string"
        ? contextInput.area
            .trim()
            .slice(0, AI_CONCIERGE_FIELD_MAX_LENGTHS.area)
        : "";

    const weather =
      sanitizeAiConciergeWeather(
        contextInput.weather
      );

    const nextHours =
      sanitizeAiConciergeNextHours(
        contextInput.nextHours
      );

    const regionalWeather =
      sanitizeAiConciergeRegionalWeather(
        contextInput.regionalWeather
      );

    const candidates =
      sanitizeAiConciergeCandidateList(
        requestBody.candidates
      );

    // Preview検証用デバッグログ(本番mainへ入れるかは代表判断・後で削除可)。
    // Secret・Token・詳細な緯度経度・個人情報は一切出力しない。
    console.log(
      "[AIConcierge Debug] request received candidateCount=" +
        candidates.length
    );

    if (candidates.length === 0) {
      console.log(
        "[AIConcierge Debug] fallback reason=no_candidates_in_request"
      );

      return response.status(400).json({
        success: false,
        message:
          "候補が指定されていません。"
      });
    }

    let aiSuggestion;

    try {
      console.log(
        "[AIConcierge Debug] AI request started"
      );

      aiSuggestion =
        await callOpenAiConcierge(
          {
            language: language,
            currentTime: currentTime,
            area: area,
            weather: weather,
            nextHours: nextHours,
            regionalWeather: regionalWeather,
            candidates: candidates
          }
        );
    } catch (aiError) {
      console.error(
        "AIコンシェルジュ呼び出しエラー：",
        aiError
      );

      console.log(
        "[AIConcierge Debug] fallback reason=ai_call_error"
      );

      return response.status(200).json({
        success: false,
        message:
          "AI判断を利用できませんでした。"
      });
    }

    if (
      !isValidAiConciergeSuggestion(
        aiSuggestion,
        candidates
      )
    ) {
      console.log(
        "[AIConcierge Debug] fallback reason=invalid_ai_suggestion"
      );

      return response.status(200).json({
        success: false,
        message:
          "AI判断結果を利用できませんでした。"
      });
    }

    console.log(
      "[AIConcierge Debug] AI suggestion accepted"
    );

    const cautionNote =
      typeof aiSuggestion.cautionNote === "string" &&
      aiSuggestion.cautionNote.trim() !== ""
        ? aiSuggestion.cautionNote
            .trim()
            .slice(0, AI_CONCIERGE_REASON_MAX_LENGTH)
        : null;

    // AIコンシェルジュ Phase2｜「また開いて」用の構造化シグナル。
    // AIの出力形式が万一崩れていても(booleanでない等)、この2項目だけを
    // 理由に提案全体を破棄しない(shouldReopenLater=falseへ安全側に
    // フォールバックするだけにとどめ、既存fallback経路を壊さない)。
    const shouldReopenLater =
      aiSuggestion.shouldReopenLater === true;

    const allowedReopenReasonTypes =
      ["weather", "time", "location", "availability"];

    const reopenReasonType =
      shouldReopenLater &&
      typeof aiSuggestion.reopenReasonType === "string" &&
      allowedReopenReasonTypes.includes(
        aiSuggestion.reopenReasonType
      )
        ? aiSuggestion.reopenReasonType
        : null;

    return response.status(200).json({
      success: true,
      suggestion: {
        suggestedCandidateId:
          aiSuggestion.suggestedCandidateId,

        reasonShort:
          String(aiSuggestion.reasonShort)
            .trim()
            .slice(0, AI_CONCIERGE_REASON_MAX_LENGTH),

        cautionNote: cautionNote,

        shouldReopenLater: shouldReopenLater,

        reopenReasonType: reopenReasonType
      }
    });
  } catch (error) {
    console.error(
      "AIコンシェルジュ処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "AI判断中にエラーが発生しました。"
    });
  }
}


export function buildReviewReason(
  moderationResults
) {
  const flaggedCategoryKeys =
    new Set();

  moderationResults.forEach(
    function(result) {
      if (
        result &&
        result.flagged === true &&
        result.categories &&
        typeof result.categories === "object"
      ) {
        Object.keys(
          result.categories
        )
          .forEach(
            function(categoryKey) {
              if (
                result.categories[
                  categoryKey
                ] === true
              ) {
                flaggedCategoryKeys.add(
                  categoryKey
                );
              }
            }
          );
      }
    }
  );

  const labels =
    Array.from(
      flaggedCategoryKeys
    )
      .map(
        function(categoryKey) {
          return CATEGORY_LABELS[
            categoryKey
          ] || categoryKey;
        }
      );

  const reasonText =
    labels
      .slice(0, 3)
      .join("、");

  return reasonText.slice(
    0,
    100
  );
}


// post.htmlの既存unsigned upload preset(cloud name: cdhyctnp)と同じ値。
// signed uploadへ移行後もpreset自体は流用する(preset側のsigning modeは
// Cloudinary管理画面側の設定であり、signatureが正しければpresetが
// unsignedのままでも署名付きリクエストは受理される)。
const CLOUDINARY_UPLOAD_PRESET =
  "machinau_signed_upload";

// signed upload移行にあわせて新設する固定フォルダ。署名をアップロード
// 以外の用途(任意のfolder・presetへの流用)に悪用しにくくするための
// 追加防御。既存の表示ロジックはURLをそのまま使うだけでpath構造を
// 解析していないため、フォルダの追加はimageUrls等の表示に影響しない。
const CLOUDINARY_UPLOAD_FOLDER =
  "machinau_submissions";


function buildCloudinaryUploadSignature(
  paramsToSign,
  apiSecret
) {
  const sortedParamString =
    Object.keys(
      paramsToSign
    )
      .sort()
      .map(
        function(key) {
          return (
            key +
            "=" +
            paramsToSign[key]
          );
        }
      )
      .join("&");

  return createHash("sha1")
    .update(
      sortedParamString + apiSecret,
      "utf8"
    )
    .digest("hex");
}


// post.htmlの画像アップロード用。Firebase匿名認証のIDトークンを検証した
// 上で、短命なCloudinary signed upload用の署名を発行する。Cloudinary
// API secretはここでのみ使用し、レスポンスへは一切含めない。
// エラーはこの関数の中で完結させ、呼び出し元のtry/catchには伝播させない。
async function handleCloudinarySignatureRequest(
  request,
  response
) {
  try {
    const idToken =
      readBearerToken(
        request
      );

    if (idToken === "") {
      return response.status(401).json({
        success: false,
        message:
          "認証情報がありません。"
      });
    }

    const app =
      getFirebaseAdminApp();

    try {
      await getAuth(app)
        .verifyIdToken(
          idToken
        );
    } catch (verifyError) {
      return response.status(401).json({
        success: false,
        message:
          "認証情報が正しくありません。"
      });
    }

    const cloudinaryApiKey =
      process.env.CLOUDINARY_API_KEY;

    const cloudinaryApiSecret =
      process.env.CLOUDINARY_API_SECRET;

    if (
      !cloudinaryApiKey ||
      !cloudinaryApiSecret
    ) {
      console.error(
        "CLOUDINARY_API_KEY または CLOUDINARY_API_SECRET が設定されていません。"
      );

      return response.status(500).json({
        success: false,
        message:
          "画像アップロードの準備ができませんでした。時間をおいて、もう一度お試しください。"
      });
    }

    const timestampSeconds =
      Math.floor(
        Date.now() / 1000
      );

    const paramsToSign =
      {
        folder:
          CLOUDINARY_UPLOAD_FOLDER,

        timestamp:
          timestampSeconds,

        upload_preset:
          CLOUDINARY_UPLOAD_PRESET
      };

    const signature =
      buildCloudinaryUploadSignature(
        paramsToSign,
        cloudinaryApiSecret
      );

    return response.status(200).json({
      success: true,
      signature: signature,
      timestamp: timestampSeconds,
      apiKey: cloudinaryApiKey,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      folder: CLOUDINARY_UPLOAD_FOLDER
    });
  } catch (error) {
    console.error(
      "Cloudinary署名発行エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "画像アップロードの準備ができませんでした。時間をおいて、もう一度お試しください。"
    });
  }
}


// TOP画面のFirestore資金防衛「層3」用。weather.js(commit 2068ce3)で本番実証済みの
// Vercel CDN共有キャッシュ方式を再利用するが、TTLの値はそのまま流用しない。
// ⚡(防災・気象・交通情報)は天気予報よりも鮮度の許容幅が狭いため、weather.jsの
// 900秒ではなく、代表確認済みの「投稿反映の遅延は最大30秒程度まで許容」という
// 判断に基づき30秒とする。
const SUBMISSIONS_PUBLIC_LIST_SHARED_CACHE_MAX_AGE_SECONDS =
  30;

const SUBMISSIONS_PUBLIC_LIST_STALE_WHILE_REVALIDATE_SECONDS =
  30;


// Admin SDKのFirestore Timestampは、getter(seconds/nanoseconds)がクラス上で
// 列挙不可(non-enumerable)なため、JSON.stringify()すると生のプライベート
// フィールド{_seconds, _nanoseconds}がそのまま漏れてしまう(toJSON()も未定義)。
// クライアント側app.jsのgetDateValue()はこの形を認識できないため、ここで
// 明示的にISO文字列へ変換してから返す。Timestamp以外の値はそのまま通す。
function convertFirestoreValueForPublicResponse(
  value
) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return value;
}


// クライアントのconvertSubmissionToShop(documentSnapshot, index)が
// documentSnapshot.data()・documentSnapshot.idのみを参照する作りであるため、
// 同じ形(id / data相当のfields)で返せるよう、生ドキュメントの全フィールドを
// 変換するだけに留める。カテゴリ・地域等によるサーバー側の絞り込みは行わない
// (CDNで全訪問者に共有されるレスポンスのため、特定ユーザー向けの加工はしない)。
function serializeSubmissionForPublicList(
  documentSnapshot
) {
  const rawData =
    documentSnapshot.data() ||
    {};

  const sanitizedFields =
    {};

  Object.keys(
    rawData
  ).forEach(
    function(key) {
      sanitizedFields[key] =
        convertFirestoreValueForPublicResponse(
          rawData[key]
        );
    }
  );

  return {
    id:
      documentSnapshot.id,

    fields:
      sanitizedFields
  };
}


// TOP画面のloadApprovedSubmissions()から呼ばれる、認証不要の公開一覧取得。
// 特定訪問者の位置情報・地域・カテゴリ・お気に入り等による絞り込みは行わない
// (全訪問者で同一レスポンスを共有できるようにするため)。層1(既存の
// status=="approved" && expiresAt>nowクエリ)と全く同じ条件をAdmin SDK側でも
// 維持する。エラー時はこの関数内で完結させ、呼び出し元のCache-Control
// no-storeデフォルトをそのまま活かす(成功時のみ後段でCache-Controlを上書き)。
//
// 運営管理型・常設店舗広告(isPermanentAd:true、expiresAtを保存しない)は、
// Firestoreの仕様上、上記の不等号クエリ(expiresAt>now)の対象に含まれない
// (対象フィールドが存在しない文書は不等号クエリの結果から除外される)。
// そのため別クエリ(status=="approved" && isPermanentAd==true、等価条件のみ
// のため新規の複合indexは不要)で取得し、結果をコード側でマージする。
// 1クエリのOR条件(Filter.or())はSDK上は利用可能だが、不等号を含む分岐と
// 組み合わせた場合に実際のProduction環境の既存indexだけで動作するかを
// 確認する手段がなかったため、安全側としてこの2クエリ方式を採用する。
// 常設広告クエリが失敗しても、既存の期限内投稿の取得・表示には影響しない
// (catchして空扱いにするのみ)。
async function handlePublicSubmissionsListRequest(
  request,
  response
) {
  try {
    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    const unexpiredQuerySnapshot =
      await database
        .collection(
          "submissions"
        )
        .where(
          "status",
          "==",
          "approved"
        )
        .where(
          "expiresAt",
          ">",
          Timestamp.now()
        )
        .get();

    let permanentAdQuerySnapshot =
      null;

    try {
      permanentAdQuerySnapshot =
        await database
          .collection(
            "submissions"
          )
          .where(
            "status",
            "==",
            "approved"
          )
          .where(
            "isPermanentAd",
            "==",
            true
          )
          .get();
    } catch (permanentAdQueryError) {
      console.error(
        "常設広告一覧の取得に失敗しました（既存の期限内投稿の表示には影響しません）：",
        permanentAdQueryError
      );
    }

    const submissionDocumentsById =
      new Map();

    unexpiredQuerySnapshot.docs.forEach(
      function(documentSnapshot) {
        submissionDocumentsById.set(
          documentSnapshot.id,
          documentSnapshot
        );
      }
    );

    if (permanentAdQuerySnapshot) {
      permanentAdQuerySnapshot.docs.forEach(
        function(documentSnapshot) {
          submissionDocumentsById.set(
            documentSnapshot.id,
            documentSnapshot
          );
        }
      );
    }

    const submissions =
      Array.from(
        submissionDocumentsById.values()
      ).map(
        serializeSubmissionForPublicList
      );

    // 成功時のみCDN共有キャッシュを許可する。エラー応答は呼び出し元で
    // 設定済みのno-storeのままとし、失敗結果が他の訪問者へ配信されるのを防ぐ。
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        SUBMISSIONS_PUBLIC_LIST_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        SUBMISSIONS_PUBLIC_LIST_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).json({
      success: true,
      submissions: submissions
    });
  } catch (error) {
    console.error(
      "公開submissions一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "掲載情報を取得できませんでした。時間をおいて、もう一度お試しください。"
    });
  }
}


function sanitizeCommentNickname(
  rawValue
) {
  const value =
    String(
      rawValue || ""
    )
      .trim()
      .slice(
        0,
        COMMENT_NICKNAME_MAX_LENGTH
      );

  return value === ""
    ? COMMENT_FALLBACK_NICKNAME
    : value;
}


// クライアントのIPアドレスは保存しない。スパム対策のクールダウン判定
// キーとしてのみハッシュ値を使い、生IPはFirestoreへ一切書き込まない。
// x-forwarded-forが取得できない場合は空文字を返し、呼び出し側は
// レート制限自体をスキップする(安全側はモデレーションが担うため、
// IP不明を理由に投稿自体を止めることはしない)。
function hashClientIpAddress(
  request
) {
  const forwardedForHeader =
    request.headers &&
    request.headers["x-forwarded-for"];

  const rawIp =
    typeof forwardedForHeader === "string"
      ? forwardedForHeader
          .split(",")[0]
          .trim()
      : "";

  if (rawIp === "") {
    return "";
  }

  return createHash("sha256")
    .update(
      rawIp,
      "utf8"
    )
    .digest("hex");
}


// claimSourceForLocationCollection()(api/admin-source-collect.js)と同じ
// Firestore transactionによるクールダウン判定の考え方を、コメント投稿の
// 簡易スパム対策に転用したもの。ipHashが空(IP不明)の場合は判定自体を
// スキップしtrue(投稿許可)を返す。
async function claimCommentRateLimit(
  database,
  ipHash
) {
  if (ipHash === "") {
    return true;
  }

  const rateLimitRef =
    database
      .collection(
        COMMENT_RATE_LIMITS_COLLECTION
      )
      .doc(
        ipHash
      );

  return database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(
          rateLimitRef
        );

      const data =
        snapshot.exists
          ? snapshot.data() || {}
          : {};

      const lastSubmittedAtMillis =
        data.lastSubmittedAt &&
        typeof data.lastSubmittedAt.toMillis === "function"
          ? data.lastSubmittedAt.toMillis()
          : null;

      const nowMilliseconds =
        Date.now();

      if (
        lastSubmittedAtMillis !== null &&
        (
          nowMilliseconds -
          lastSubmittedAtMillis
        ) < COMMENT_RATE_LIMIT_COOLDOWN_MILLISECONDS
      ) {
        return false;
      }

      transaction.set(
        rateLimitRef,
        {
          lastSubmittedAt:
            FieldValue.serverTimestamp()
        }
      );

      return true;
    }
  );
}


// マチナウ読み物投稿機能(Phase1)｜コメント対象記事の判定を、旧来の
// 静的コラム(LEGACY_STATIC_COLUMN_SLUGS、既存の1記事専用の互換維持)と、
// Firestore columnArticlesに実在しstatus==="published"の記事、の
// どちらかであればtrueとする。後者により、admin-column.html経由で新しく
// 公開された読み物は、コード変更なしに自動でコメント対象になる
// (「記事を追加するたびコード変更をなくす」という指示に対応)。
async function isColumnSlugEligibleForComments(
  database,
  articleSlug
) {
  if (
    articleSlug === ""
  ) {
    return false;
  }

  if (
    LEGACY_STATIC_COLUMN_SLUGS.includes(
      articleSlug
    )
  ) {
    return true;
  }

  const articleSnapshot =
    await database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc(
        articleSlug
      )
      .get();

  return (
    articleSnapshot.exists &&
    articleSnapshot.data().status ===
      COLUMN_STATUS_PUBLISHED
  );
}


// マチナウ読み物(コラム)の記事下コメント投稿。新しいVercel Functionは
// 追加せず、既存のこのFunctionへmode追加のみで実装する。
// ①articleSlugをホワイトリストで検証→②ハニーポット欄(bot対策、人間には
// 見えないCSSで隠すだけで新しいUIコンポーネントは作らない)→③文字数検証→
// ④IPハッシュによる簡易クールダウン→⑤既存のOpenAI Moderation
// (callOpenAiModeration()、投稿審査と同一のAPI・モデル)で安全性確認、
// という順で処理し、コストがかかる④⑤より前に無料の①②③で弾けるものは
// 弾く。既存submissionsの「pending→人間確認」のような掲載待ちキューは
// 今回のMVPでは作らない(シンプルにする指示のため)。そのため判定は
// 「安全→即時approved掲載」「不安全・エラー→保存しない」の二択のみとし、
// 判定に迷う場合(モデレーションAPIエラー等)は安全側に倒して保存しない。
async function handlePostArticleCommentRequest(
  request,
  response
) {
  try {
    const requestBody =
      readRequestBody(
        request
      );

    const articleSlug =
      typeof requestBody.articleSlug === "string"
        ? requestBody.articleSlug.trim()
        : "";

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    if (
      !(await isColumnSlugEligibleForComments(
        database,
        articleSlug
      ))
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

    // ハニーポット欄。人間の利用者には見えない(column側でCSS非表示にする)
    // ため、値が入っている場合はbotによる自動投稿とみなす。botへ「検知した」
    // ことを教えないため、保存はせず成功したふりの応答だけ返す。
    const honeypotValue =
      typeof requestBody.contactField === "string"
        ? requestBody.contactField.trim()
        : "";

    if (honeypotValue !== "") {
      return response.status(200).json({
        success: true,
        comment: null
      });
    }

    const nickname =
      sanitizeCommentNickname(
        requestBody.nickname
      );

    const commentText =
      typeof requestBody.comment === "string"
        ? requestBody.comment.trim()
        : "";

    if (commentText === "") {
      return response.status(400).json({
        success: false,
        message:
          "コメントを入力してください。"
      });
    }

    if (
      commentText.length >
      COMMENT_TEXT_MAX_LENGTH
    ) {
      return response.status(400).json({
        success: false,
        message:
          "コメントが長すぎます（" +
          COMMENT_TEXT_MAX_LENGTH +
          "文字以内でご入力ください）。"
      });
    }

    const ipHash =
      hashClientIpAddress(
        request
      );

    const rateLimitOk =
      await claimCommentRateLimit(
        database,
        ipHash
      );

    if (!rateLimitOk) {
      return response.status(429).json({
        success: false,
        message:
          "少し時間をおいてから、もう一度お試しください。"
      });
    }

    let moderationResults =
      null;

    try {
      const inputItems =
        buildModerationInput(
          {
            title: nickname,
            content: commentText
          }
        );

      moderationResults =
        await callOpenAiModeration(
          inputItems
        );
    } catch (moderationError) {
      console.error(
        "コメントAI審査エラー：",
        moderationError
      );

      return response.status(200).json({
        success: false,
        message:
          "現在コメントを投稿できません。時間をおいて再度お試しください。"
      });
    }

    const allSafe =
      moderationResults.every(
        function(result) {
          return (
            result &&
            result.flagged === false
          );
        }
      );

    if (!allSafe) {
      return response.status(200).json({
        success: false,
        message:
          "コメント内容を確認できませんでした。表現を見直して投稿してください。"
      });
    }

    await database
      .collection(
        ARTICLE_COMMENTS_COLLECTION
      )
      .add(
        {
          articleSlug:
            articleSlug,

          nickname:
            nickname,

          comment:
            commentText,

          status:
            "approved",

          aiReviewVersion:
            AI_REVIEW_VERSION,

          createdAt:
            FieldValue.serverTimestamp()
        }
      );

    return response.status(200).json({
      success: true,
      comment: {
        nickname:
          nickname,

        comment:
          commentText,

        createdAt:
          new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(
      "コメント投稿エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメントの投稿に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}


// 記事別コメント一覧の公開取得(認証不要)。status=="approved"のみを対象と
// し、articleSlugで記事ごとに完全分離する。既存の公開submissions一覧
// (handlePublicSubmissionsListRequest())と同じく、エラー時はCache-Control
// no-storeのデフォルトのまま返し、成功時のみ短いCDN共有キャッシュを許可する
// (投稿直後の反映速度を優先し、submissions一覧より短いTTLにする)。
async function handleArticleCommentsListRequest(
  request,
  response
) {
  try {
    const articleSlug =
      request.query &&
      typeof request.query.articleSlug === "string"
        ? request.query.articleSlug.trim()
        : "";

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    if (
      !(await isColumnSlugEligibleForComments(
        database,
        articleSlug
      ))
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

    // 2つの等価条件(articleSlug/status)のみで絞り込み、orderByは付けない。
    // 等価条件と別フィールドのorderByを組み合わせるとFirestoreの複合indexが
    // 新規に必要になり、初回アクセス時にFAILED_PRECONDITIONで失敗する
    // (代表によるFirebase Console操作が別途必要になる)ため、それを避け、
    // 並び替えはこの関数内のJavaScript側(取得件数はCOMMENTS_LIST_MAX_COUNT
    // 件までのため負荷は軽微)で行う。新着順(createdAt降順)は、既存の
    // admin.html等の一覧表示(createdAt降順)と同じ並び順に揃えたもの。
    const commentsSnapshot =
      await database
        .collection(
          ARTICLE_COMMENTS_COLLECTION
        )
        .where(
          "articleSlug",
          "==",
          articleSlug
        )
        .where(
          "status",
          "==",
          "approved"
        )
        .limit(
          COMMENTS_LIST_MAX_COUNT
        )
        .get();

    const comments =
      commentsSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            return {
              nickname:
                typeof data.nickname === "string"
                  ? data.nickname
                  : COMMENT_FALLBACK_NICKNAME,

              comment:
                typeof data.comment === "string"
                  ? data.comment
                  : "",

              createdAtMillis:
                data.createdAt &&
                typeof data.createdAt.toMillis === "function"
                  ? data.createdAt.toMillis()
                  : 0,

              createdAt:
                data.createdAt &&
                typeof data.createdAt.toDate === "function"
                  ? data.createdAt.toDate().toISOString()
                  : null
            };
          }
        )
        .sort(
          function(firstComment, secondComment) {
            return (
              secondComment.createdAtMillis -
              firstComment.createdAtMillis
            );
          }
        )
        .map(
          function(comment) {
            return {
              nickname: comment.nickname,
              comment: comment.comment,
              createdAt: comment.createdAt
            };
          }
        );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        COMMENTS_LIST_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        COMMENTS_LIST_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).json({
      success: true,
      comments: comments
    });
  } catch (error) {
    console.error(
      "コメント一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメントを取得できませんでした。"
    });
  }
}


// マチナウ読み物コメントMVP・最小管理機能｜api/admin-post.js・
// api/admin-submission-update.jsと全く同じ「Bearer IDトークンを検証し、
// email が process.env.ADMIN_EMAIL と一致するか」だけを見る既存の管理者
// 認証方式をそのまま再利用する。新しい認証方式(APIキー・別の秘密鍵等)は
// 一切作らない。一般ユーザーがこの経路でコメントを非表示にすることは
// できない(有効なFirebase管理者アカウントのIDトークンが必須のため)。
// ==========================================================================
// 運営投稿担当(Editor)権限 Phase1｜代表(Admin)判定は既存の
// process.env.ADMIN_EMAILを維持したまま無変更で残す。そのうえで、
// Firestore operators/{uid}(ドキュメントID=Firebase Authのuidそのまま＝
// 正本、メールアドレスだけを正本キーにしない)を追加し、role:"editor"かつ
// active:trueの場合だけEditorとして扱う。operatorsコレクションは
// クライアントから直接読み書きさせず、常にこのFunction(Admin SDK経由)の
// みでアクセスするため、Firestore Security Rulesの変更は不要。
// active判定は呼び出しのたびにFirestoreを直接読みに行く(トークンへ
// 埋め込まない)ため、代表がactive:falseへ変更した瞬間から、そのEditorが
// 既に持っている有効なIDトークンでも次の呼び出しで即座に拒否される
// (Firebase Authのカスタムクレーム方式より確実に即時反映される)。
// api/admin-post.js・api/admin-submission-get.js・api/admin-submission-
// update.jsは、edit-ad.jsが既にこのファイルから関数をimportしている
// 既存の実例と同じ方法で、ここからrequireAdmin()/requireAdminOrEditor()
// をimportして再利用する(認可ロジックを複数ファイルへ複製しない)。
const OPERATORS_COLLECTION =
  "operators";

const OPERATOR_ROLE_EDITOR =
  "editor";

async function findOperatorActorByUid(
  database,
  uid
) {
  if (
    typeof uid !== "string" ||
    uid === ""
  ) {
    return null;
  }

  const operatorSnapshot =
    await database
      .collection(
        OPERATORS_COLLECTION
      )
      .doc(
        uid
      )
      .get();

  if (
    !operatorSnapshot.exists
  ) {
    return null;
  }

  const operatorData =
    operatorSnapshot.data() ||
    {};

  if (
    operatorData.role === OPERATOR_ROLE_EDITOR &&
    operatorData.active === true
  ) {
    return {
      type: "editor",
      role: OPERATOR_ROLE_EDITOR,
      uid: uid,
      email:
        typeof operatorData.email === "string"
          ? operatorData.email
          : ""
    };
  }

  return null;
}


// Bearer IDトークンを検証し、代表(ADMIN_EMAIL一致)かEditor(operators/{uid}
// がrole:"editor"かつactive:true)かを判定する。どちらでもない場合は
// actor:nullを返す(呼び出し元がrejectするかどうかを決める、この関数自体は
// rejectしない＝getMyOperatorInfo等の「どちらでもないことを知りたいだけ」の
// 用途にも使えるようにするため)。
async function resolveRequestActor(
  request
) {
  const app =
    getFirebaseAdminApp();

  const database =
    getFirestore(
      app
    );

  const idToken =
    readBearerToken(
      request
    );

  if (idToken === "") {
    return {
      ok: false,
      status: 401,
      message:
        "認証情報がありません。"
    };
  }

  let decodedToken;

  try {
    decodedToken =
      await getAuth(app)
        .verifyIdToken(
          idToken
        );
  } catch (verifyError) {
    return {
      ok: false,
      status: 401,
      message:
        "認証情報が正しくありません。"
    };
  }

  const adminEmail =
    process.env.ADMIN_EMAIL;

  const decodedEmail =
    String(
      decodedToken.email || ""
    )
      .toLowerCase();

  if (
    adminEmail &&
    decodedEmail !== "" &&
    decodedEmail ===
      adminEmail.toLowerCase()
  ) {
    return {
      ok: true,
      app: app,
      database: database,
      actor: {
        type: "admin",
        uid: decodedToken.uid,
        email: decodedEmail
      }
    };
  }

  const editorActor =
    await findOperatorActorByUid(
      database,
      decodedToken.uid
    );

  return {
    ok: true,
    app: app,
    database: database,
    actor: editorActor
  };
}


// 代表(Admin)のみを許可する。一般投稿の承認/却下/コメント非表示等、
// Editorには絶対に渡してはいけない操作で使う。
export async function requireAdmin(
  request
) {
  const result =
    await resolveRequestActor(
      request
    );

  if (!result.ok) {
    return result;
  }

  if (
    !result.actor ||
    result.actor.type !== "admin"
  ) {
    return {
      ok: false,
      status: 403,
      message:
        "管理者権限が必要です。"
    };
  }

  return result;
}


// 代表(Admin)またはEditorを許可する。地域情報・マチナウ読み物の投稿/編集、
// 画像アップロード署名等、Editorへも許可する操作で使う。
export async function requireAdminOrEditor(
  request
) {
  const result =
    await resolveRequestActor(
      request
    );

  if (!result.ok) {
    return result;
  }

  if (
    !result.actor ||
    (
      result.actor.type !== "admin" &&
      result.actor.type !== "editor"
    )
  ) {
    return {
      ok: false,
      status: 403,
      message:
        "権限がありません。"
    };
  }

  return result;
}


// admin-post.html・admin-column.html・editor.htmlが、ログイン直後に
// 「この人はAdminかEditorか、それとも権限が無いか」を知るためだけに呼ぶ。
// requireAdmin()/requireAdminOrEditor()と異なり、権限が無くても403にせず
// role:nullを返す(呼び出し元が「権限がありません」の案内を出し分けるため)。
async function handleGetMyOperatorInfoRequest(
  request,
  response
) {
  try {
    const result =
      await resolveRequestActor(
        request
      );

    if (!result.ok) {
      return response.status(result.status).json({
        success: false,
        message:
          result.message
      });
    }

    return response.status(200).json({
      success: true,
      role:
        result.actor
          ? result.actor.type
          : null
    });
  } catch (error) {
    console.error(
      "運営者情報の確認エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "確認できませんでした。"
    });
  }
}


// admin-column.html・admin-post.html・editor.html専用のCloudinary署名発行。
// 既存のmode:"cloudinarySignature"(post.htmlの一般投稿・匿名認証ユーザーが
// 現在も利用しており、変更すると一般投稿の画像アップロードが壊れるため
// 無変更のまま維持する)とは別のmodeとして新設し、Admin/Editor専用ツール
// 側の呼び出し先だけをこちらへ切り替える。実質の署名発行ロジック
// (buildCloudinaryUploadSignature()等)は完全に共通のまま、認可条件だけが
// requireAdminOrEditor()により厳格になる。
async function handleOperatorCloudinarySignatureRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const cloudinaryApiKey =
      process.env.CLOUDINARY_API_KEY;

    const cloudinaryApiSecret =
      process.env.CLOUDINARY_API_SECRET;

    if (
      !cloudinaryApiKey ||
      !cloudinaryApiSecret
    ) {
      console.error(
        "CLOUDINARY_API_KEY または CLOUDINARY_API_SECRET が設定されていません。"
      );

      return response.status(500).json({
        success: false,
        message:
          "画像アップロードの準備ができませんでした。時間をおいて、もう一度お試しください。"
      });
    }

    const timestampSeconds =
      Math.floor(
        Date.now() / 1000
      );

    const paramsToSign =
      {
        folder:
          CLOUDINARY_UPLOAD_FOLDER,

        timestamp:
          timestampSeconds,

        upload_preset:
          CLOUDINARY_UPLOAD_PRESET
      };

    const signature =
      buildCloudinaryUploadSignature(
        paramsToSign,
        cloudinaryApiSecret
      );

    return response.status(200).json({
      success: true,
      signature: signature,
      timestamp: timestampSeconds,
      apiKey: cloudinaryApiKey,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      folder: CLOUDINARY_UPLOAD_FOLDER
    });
  } catch (error) {
    console.error(
      "Cloudinary署名発行エラー(運営ツール向け)：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "画像アップロードの準備ができませんでした。時間をおいて、もう一度お試しください。"
    });
  }
}


const EDITOR_PASSWORD_MIN_LENGTH =
  6;

const EMAIL_FORMAT_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// 代表(Admin)専用。Firebase Authenticationへ新しいEditorアカウントを作成し、
// 続けてoperators/{uid}へrole:"editor", active:trueで登録する。
// 平文パスワードはFirestoreへ一切保存せず、ログにも残さず、応答にも
// 含めない(uid/emailのみ返す)。新しいVercel Functionは追加せず、
// 既存のFirebase Admin SDK(このFunctionが既に読み込み済み)をそのまま使う。
async function handleAdminCreateEditorRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdmin(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const email =
      String(
        requestBody.email || ""
      )
        .trim()
        .toLowerCase();

    if (
      !EMAIL_FORMAT_PATTERN.test(
        email
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "メールアドレスの形式が正しくありません。"
      });
    }

    const password =
      typeof requestBody.password === "string"
        ? requestBody.password
        : "";

    if (
      password.length <
      EDITOR_PASSWORD_MIN_LENGTH
    ) {
      return response.status(400).json({
        success: false,
        message:
          "パスワードは" +
          EDITOR_PASSWORD_MIN_LENGTH +
          "文字以上にしてください。"
      });
    }

    const database =
      authResult.database;

    let newUserRecord;

    try {
      newUserRecord =
        await getAuth(
          authResult.app
        )
          .createUser(
            {
              email: email,
              password: password
            }
          );
    } catch (createUserError) {
      const errorCode =
        createUserError &&
        createUserError.code;

      if (
        errorCode === "auth/email-already-exists"
      ) {
        return response.status(400).json({
          success: false,
          message:
            "このメールアドレスは既に使用されています。"
        });
      }

      if (
        errorCode === "auth/invalid-password"
      ) {
        return response.status(400).json({
          success: false,
          message:
            "パスワードの形式が正しくありません。"
        });
      }

      console.error(
        "Editorアカウント作成エラー：",
        createUserError
      );

      return response.status(500).json({
        success: false,
        message:
          "アカウントを作成できませんでした。時間をおいて、もう一度お試しください。"
      });
    }

    await database
      .collection(
        OPERATORS_COLLECTION
      )
      .doc(
        newUserRecord.uid
      )
      .set(
        {
          email: email,
          role: OPERATOR_ROLE_EDITOR,
          active: true,

          createdAt:
            FieldValue.serverTimestamp(),

          updatedAt:
            FieldValue.serverTimestamp()
        }
      );

    return response.status(200).json({
      success: true,
      message:
        "Editorアカウントを作成しました。",
      uid:
        newUserRecord.uid,
      email:
        email
    });
  } catch (error) {
    console.error(
      "Editorアカウント作成エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "アカウントを作成できませんでした。時間をおいて、もう一度お試しください。"
    });
  }
}


// 代表(Admin)専用。operators/{uid}.activeの切り替えのみ行う(物理削除・
// Firebase Authアカウント自体の無効化は行わない)。resolveRequestActor()が
// 呼び出しのたびにこのFirestore値を直接読みに行く設計のため、ここで
// active:falseへ変更した瞬間から、そのEditorの以後のAPI呼び出しは
// (既に有効なIDトークンを持っていても)次の呼び出しで即座に拒否される。
async function handleAdminSetEditorActiveRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdmin(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const requestBody =
      readRequestBody(
        request
      );

    const uid =
      typeof requestBody.uid === "string"
        ? requestBody.uid.trim()
        : "";

    const active =
      requestBody.active === true;

    if (uid === "") {
      return response.status(400).json({
        success: false,
        message:
          "uidを指定してください。"
      });
    }

    const database =
      authResult.database;

    const operatorReference =
      database
        .collection(
          OPERATORS_COLLECTION
        )
        .doc(
          uid
        );

    const operatorSnapshot =
      await operatorReference.get();

    if (
      !operatorSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の運営者が見つかりませんでした。"
      });
    }

    await operatorReference.update(
      {
        active: active,

        updatedAt:
          FieldValue.serverTimestamp()
      }
    );

    return response.status(200).json({
      success: true,
      message:
        active
          ? "有効にしました。"
          : "停止しました。"
    });
  } catch (error) {
    console.error(
      "運営者の状態変更エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "状態を変更できませんでした。"
    });
  }
}


// 代表(Admin)専用。運営者一覧(email/role/active/作成日時のみ、パスワードは
// 元々どこにも保存していないため含まれ得ない)を返す。大規模なユーザー
// 管理画面ではなく、admin.html内の小さな一覧表示用の最小限のデータ。
async function handleAdminListEditorsRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdmin(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const database =
      authResult.database;

    const operatorsSnapshot =
      await database
        .collection(
          OPERATORS_COLLECTION
        )
        .limit(
          COLUMN_LIST_MAX_COUNT
        )
        .get();

    const operators =
      operatorsSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            const createdAtDate =
              toDateFromFirestoreValue(
                data.createdAt
              );

            return {
              uid:
                documentSnapshot.id,

              email:
                typeof data.email === "string"
                  ? data.email
                  : "",

              role:
                typeof data.role === "string"
                  ? data.role
                  : "",

              active:
                data.active === true,

              createdAtMillis:
                createdAtDate
                  ? createdAtDate.getTime()
                  : 0,

              createdAt:
                createdAtDate
                  ? createdAtDate.toISOString()
                  : null
            };
          }
        )
        .sort(
          function(firstOperator, secondOperator) {
            return (
              secondOperator.createdAtMillis -
              firstOperator.createdAtMillis
            );
          }
        )
        .map(
          function(operator) {
            return {
              uid: operator.uid,
              email: operator.email,
              role: operator.role,
              active: operator.active,
              createdAt: operator.createdAt
            };
          }
        );

    return response.status(200).json({
      success: true,
      operators: operators
    });
  } catch (error) {
    console.error(
      "運営者一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "運営者一覧を取得できませんでした。"
    });
  }
}


// マチナウ読み物コメント管理(最小機能)｜指定articleSlugの全コメントを、
// status(approved/hidden)を問わず一覧取得する。公開用のGET(status==="approved"
// のみ)とは完全に別の関数・別のmodeであり、この関数自体が管理者認証必須
// のため一般ユーザーは呼び出せない。
async function handleAdminListArticleCommentsRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdmin(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const database =
      authResult.database;

    const requestBody =
      readRequestBody(
        request
      );

    const articleSlug =
      typeof requestBody.articleSlug === "string"
        ? requestBody.articleSlug.trim()
        : "";

    if (
      !(await isColumnSlugEligibleForComments(
        database,
        articleSlug
      ))
    ) {
      return response.status(400).json({
        success: false,
        message:
          "対象の記事が見つかりません。"
      });
    }

    const commentsSnapshot =
      await database
        .collection(
          ARTICLE_COMMENTS_COLLECTION
        )
        .where(
          "articleSlug",
          "==",
          articleSlug
        )
        .limit(
          COMMENTS_LIST_MAX_COUNT
        )
        .get();

    const comments =
      commentsSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            return {
              id:
                documentSnapshot.id,

              nickname:
                typeof data.nickname === "string"
                  ? data.nickname
                  : COMMENT_FALLBACK_NICKNAME,

              comment:
                typeof data.comment === "string"
                  ? data.comment
                  : "",

              status:
                typeof data.status === "string"
                  ? data.status
                  : "",

              createdAtMillis:
                data.createdAt &&
                typeof data.createdAt.toMillis === "function"
                  ? data.createdAt.toMillis()
                  : 0,

              createdAt:
                data.createdAt &&
                typeof data.createdAt.toDate === "function"
                  ? data.createdAt.toDate().toISOString()
                  : null
            };
          }
        )
        .sort(
          function(firstComment, secondComment) {
            return (
              secondComment.createdAtMillis -
              firstComment.createdAtMillis
            );
          }
        )
        .map(
          function(comment) {
            return {
              id: comment.id,
              nickname: comment.nickname,
              comment: comment.comment,
              status: comment.status,
              createdAt: comment.createdAt
            };
          }
        );

    return response.status(200).json({
      success: true,
      comments: comments
    });
  } catch (error) {
    console.error(
      "コメント管理一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメント一覧を取得できませんでした。"
    });
  }
}


// マチナウ読み物コメント管理(最小機能)｜物理削除ではなくstatusを"hidden"へ
// 変更するだけの非表示化。既存のsubmissions(status:"approved"→"expired"/
// "rejected")と同じ「物理削除しない」設計を踏襲し、監査性(いつ・誰が)を
// 残す。公開GET(handleArticleCommentsListRequest())はstatus==="approved"
// のみを返す設計を無変更のまま維持しているため、statusを変えるだけで
// 自動的に公開一覧から消える。既にhidden済みの場合は再書き込みせず
// 成功扱いで返す(冪等)。
async function handleAdminHideArticleCommentRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdmin(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const database =
      authResult.database;

    const requestBody =
      readRequestBody(
        request
      );

    const documentId =
      typeof requestBody.documentId === "string"
        ? requestBody.documentId.trim()
        : "";

    if (documentId === "") {
      return response.status(400).json({
        success: false,
        message:
          "documentIdを指定してください。"
      });
    }

    const documentReference =
      database
        .collection(
          ARTICLE_COMMENTS_COLLECTION
        )
        .doc(
          documentId
        );

    const documentSnapshot =
      await documentReference.get();

    if (
      !documentSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象のコメントが見つかりませんでした。"
      });
    }

    const currentData =
      documentSnapshot.data() ||
      {};

    if (
      currentData.status === "hidden"
    ) {
      return response.status(200).json({
        success: true,
        message:
          "このコメントは既に非表示です。"
      });
    }

    await documentReference.update(
      {
        status:
          "hidden",

        hiddenAt:
          FieldValue.serverTimestamp(),

        hiddenBy:
          authResult.actor.email
      }
    );

    return response.status(200).json({
      success: true,
      message:
        "コメントを非表示にしました。"
    });
  } catch (error) {
    console.error(
      "コメント非表示化エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "コメントを非表示にできませんでした。"
    });
  }
}


// ==========================================================================
// マチナウ読み物投稿機能(Phase1)
// 新しいVercel Functionは追加せず、既存のこのFunctionへmode追加のみで
// 実装する(Functions 12/12を維持)。columnArticlesコレクションはクライアント
// から直接読み書きさせず、常にAdmin SDK経由(このFunction経由)のみで
// アクセスするため、Firestore Security Rulesの変更は一切不要。
// column/typhoon-okinawa-travel.html(既存の唯一の静的記事)には一切触れず、
// URL・本文・コメント・GA4いずれも無変更のまま独立して残す。
// ==========================================================================

// 画像UX改善Phase2｜app.js側のbuildOptimizedImageUrl()と同じロジックの
// サーバー側(Node.js)版。読み物ページ(buildColumnArticleHtml、このAPI内で
// HTML文字列として生成)の本文中<img src>にだけ適用し、OG画像/JSON-LDの
// imageは既存のsecure_urlのまま変更しない(SEO/OG処理を壊さないため)。
// Firestoreへ保存済みのimageUrl自体は一切書き換えない。
function buildOptimizedImageUrl(
  url,
  options
) {
  if (
    typeof url !== "string" ||
    url === ""
  ) {
    return url;
  }

  const uploadMarker =
    "/image/upload/";

  const uploadIndex =
    url.indexOf(
      uploadMarker
    );

  const isCloudinaryDeliveryUrl =
    url.includes(
      "res.cloudinary.com"
    ) &&
    uploadIndex !== -1;

  if (!isCloudinaryDeliveryUrl) {
    return url;
  }

  const width =
    options &&
    Number.isFinite(
      options.width
    ) &&
    options.width > 0
      ? Math.round(
          options.width
        )
      : null;

  const transformationParts =
    [
      "f_auto",
      "q_auto",
      "c_limit"
    ];

  if (width) {
    transformationParts.push(
      "w_" + width
    );
  }

  const insertPosition =
    uploadIndex +
    uploadMarker.length;

  return (
    url.slice(
      0,
      insertPosition
    ) +
    transformationParts.join(
      ","
    ) +
    "/" +
    url.slice(
      insertPosition
    )
  );
}

const OPTIMIZED_IMAGE_WIDTH_COLUMN_ARTICLE = 900;

function escapeHtmlForRender(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function toDateFromFirestoreValue(
  value
) {
  if (
    value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  return null;
}


function formatDateForDisplay(
  date
) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}


function formatDateForAttribute(
  date
) {
  if (
    !(date instanceof Date) ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const twoDigits =
    function(numberValue) {
      return String(
        numberValue
      ).padStart(
        2,
        "0"
      );
    };

  return (
    date.getFullYear() +
    "-" +
    twoDigits(
      date.getMonth() + 1
    ) +
    "-" +
    twoDigits(
      date.getDate()
    )
  );
}


// 本文(プレーンテキスト、admin-column.htmlのtextareaからそのまま届く)を
// 空行区切りの段落として扱い、各段落をエスケープした<p>へ変換する。
// 管理者入力であってもHTMLタグは一切許可しない(admin-post.js等、既存の
// マチナウ運営コンテンツもすべてプレーンテキスト入力のみで、リッチテキスト
// 入力欄を持たせる既存資産が無いため、この方針を踏襲する)。
function buildColumnArticleParagraphsHtml(
  content
) {
  const paragraphs =
    String(
      content || ""
    )
      .split(
        /\n\s*\n/
      )
      .map(
        function(paragraph) {
          return paragraph.trim();
        }
      )
      .filter(
        function(paragraph) {
          return paragraph !== "";
        }
      );

  return paragraphs
    .map(
      function(paragraph) {
        return (
          "<p>" +
          escapeHtmlForRender(
            paragraph
          ).replaceAll(
            "\n",
            "<br>"
          ) +
          "</p>"
        );
      }
    )
    .join(
      "\n      "
    );
}


// column/typhoon-okinawa-travel.htmlと同じCSS変数・カード構造・GA4呼び出し
// 方式・コメントセクション構造を再利用する(見た目を統一するため、既存の
// 静的HTMLからCSSブロックを複製している。既存ファイル自体は変更しない)。
function buildColumnArticleHtml(
  article
) {
  const canonicalUrl =
    "https://machinau.jp/column/" +
    article.slug +
    ".html";

  const publishedDisplay =
    formatDateForDisplay(
      article.publishedAtDate
    );

  const updatedDisplay =
    formatDateForDisplay(
      article.updatedAtDate ||
        article.publishedAtDate
    );

  const publishedAttribute =
    formatDateForAttribute(
      article.publishedAtDate
    );

  const updatedAttribute =
    formatDateForAttribute(
      article.updatedAtDate ||
        article.publishedAtDate
    );

  const escapedTitle =
    escapeHtmlForRender(
      article.title
    );

  const escapedDescription =
    escapeHtmlForRender(
      article.description
    );

  const escapedCategory =
    escapeHtmlForRender(
      article.category
    );

  const escapedSlugForJs =
    JSON.stringify(
      article.slug
    );

  // Ver1.8 Phase2(地域連動基盤)｜地域名は表示のためだけに使い、タイトル・
  // descriptionへは詰め込まない(不自然なSEO詰め込みを避ける指示のため)。
  // 空の階層は単に表示しない(市区町村未設定の記事は「日本 / 沖縄県」まで、
  // というように自然に短くなる)。
  const regionBreadcrumbParts =
    [
      article.regionCountryLabel,
      article.regionPrefecture,
      article.regionCity,
      article.regionArea
    ].filter(
      function(part) {
        return (
          typeof part === "string" &&
          part.trim() !== ""
        );
      }
    );

  const regionBreadcrumbHtml =
    regionBreadcrumbParts.length > 0
      ? '<p class="article-region">' +
        regionBreadcrumbParts
          .map(
            escapeHtmlForRender
          )
          .join(
            " / "
          ) +
        "</p>"
      : "";

  const hasMainImage =
    typeof article.imageUrl === "string" &&
    article.imageUrl !== "";

  const ogImageUrl =
    hasMainImage
      ? article.imageUrl
      : "https://machinau.jp/icon-512.png?v=2";

  const mainImageHtml =
    hasMainImage
      ? '<img class="article-main-image" src="' +
        escapeHtmlForRender(
          buildOptimizedImageUrl(
            article.imageUrl,
            { width: OPTIMIZED_IMAGE_WIDTH_COLUMN_ARTICLE }
          )
        ) +
        '" alt="' +
        escapedTitle +
        '" loading="lazy" onerror="this.remove()">'
      : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <script>
    (function () {
      if (location.hostname !== "machinau.jp" && location.hostname !== "imamiru-web.vercel.app") {
        return;
      }

      window.dataLayer = window.dataLayer || [];

      window.gtag = function () {
        dataLayer.push(arguments);
      };

      gtag("js", new Date());
      gtag("config", "G-PGM7GNVQX8");

      const gaScript = document.createElement("script");
      gaScript.async = true;
      gaScript.src =
        "https://www.googletagmanager.com/gtag/js?id=G-PGM7GNVQX8";
      document.head.appendChild(gaScript);
    })();
  </script>

  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0788c9">
  <meta name="description" content="${escapedDescription}">
  <title>${escapedTitle}｜マチナウ</title>
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/png" href="/favicon.png?v=2">
  <link rel="manifest" href="/manifest.json?v=2">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapedTitle}｜マチナウ">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta name="twitter:card" content="summary${hasMainImage ? "_large_image" : ""}">

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(article.title)},
    "description": ${JSON.stringify(article.description)},
    "image": ${JSON.stringify(ogImageUrl)},
    "author": { "@type": "Organization", "name": "マチナウ運営" },
    "publisher": {
      "@type": "Organization",
      "name": "マチナウ",
      "logo": { "@type": "ImageObject", "url": "https://machinau.jp/icon-512.png?v=2" }
    },
    "datePublished": "${publishedAttribute}",
    "dateModified": "${updatedAttribute}",
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonicalUrl}" }
  }
  </script>

  <style>
    :root {
      --navy: #071a33;
      --blue: #0788c9;
      --cyan: #04b7d7;
      --white: #ffffff;
      --text: #15233a;
      --subtext: #697386;
      --border: #e7edf3;
      --background: #f4f8fb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0 0 60px;
      font-family: "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
      background: var(--background);
      color: var(--text);
    }
    .page-header {
      padding: 28px 18px;
      background: linear-gradient(135deg, #0788c9, #04b7d7);
      color: var(--white);
      text-align: center;
    }
    .brand-mini {
      display: inline-flex; align-items: center; gap: 8px;
      font-weight: 900; font-size: 15px; margin-bottom: 14px;
    }
    .brand-mini-icon {
      width: 28px; height: 28px; display: grid; place-items: center;
      border-radius: 9px; background: rgba(255, 255, 255, 0.2); font-size: 15px;
    }
    .page-header h1 { margin: 0; font-size: 22px; line-height: 1.5; }
    main { width: min(100%, 680px); margin: -20px auto 0; padding: 0 18px; }
    .card {
      background: var(--white); border-radius: 22px;
      box-shadow: 0 16px 45px rgba(20, 52, 82, 0.12); padding: 30px 22px;
    }
    .article-meta { margin: 0 0 12px; color: var(--subtext); font-size: 12px; }
    .article-region { margin: 0 0 8px; color: var(--subtext); font-size: 12px; }
    .article-category {
      display: inline-block; margin: 0 0 14px; padding: 5px 12px;
      border-radius: 999px; background: #eef7fb; color: var(--blue);
      font-size: 11px; font-weight: 900;
    }
    /* 画像UX改善Phase2｜読み物のメイン画像は実利用で上下/左右が
       切れることが問題になっていたため、coverでの機械的な切り取りをやめ、
       画像本来の比率を保ったまま全体を表示する(contain+ 背景色で
       余白を自然に見せる)。 */
    .article-main-image {
      display: block; width: 100%; max-height: 420px; object-fit: contain;
      background: #e9f1f5; border-radius: 16px; margin: 0 0 20px;
    }
    .lede { margin: 0 0 28px; font-size: 15px; line-height: 2; color: var(--text); }
    p { font-size: 14px; line-height: 2; color: var(--text); }
    .cta-section {
      margin-top: 36px; padding: 24px 20px; border-radius: 18px;
      background: linear-gradient(135deg, #0788c9, #04b7d7);
      color: var(--white); text-align: center;
    }
    .cta-section p { color: rgba(255, 255, 255, 0.92); margin: 0 0 16px; font-size: 13px; }
    .cta-button {
      display: inline-block; padding: 13px 28px; border-radius: 999px;
      background: var(--white); color: var(--blue); font-weight: 700;
      font-size: 14px; text-decoration: none;
    }
    .byline {
      margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--border);
      font-size: 12px; color: var(--subtext);
    }
    .back-link {
      display: inline-block; margin-top: 24px; font-size: 13px;
      font-weight: 700; color: var(--blue); text-decoration: none;
    }
    .comment-section { margin: 34px 0 0; padding-top: 22px; border-top: 1px solid var(--border); }
    .comment-section h2 { margin: 0 0 10px; font-size: 16px; color: var(--navy); }
    .comment-form { display: grid; gap: 10px; margin: 14px 0 0; }
    .comment-form label { display: block; margin: 0 0 5px; color: var(--navy); font-size: 12px; font-weight: 700; }
    .comment-form input, .comment-form textarea {
      width: 100%; padding: 11px 13px; border: 1px solid var(--border); border-radius: 12px;
      outline: none; color: var(--text); background: #fbfdfe; font-size: 14px; font-family: inherit;
    }
    .comment-form input:focus, .comment-form textarea:focus { border-color: var(--cyan); background: var(--white); }
    .comment-form textarea { min-height: 90px; resize: vertical; }
    .comment-honeypot-field { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
    .comment-submit-button {
      justify-self: start; min-height: 44px; padding: 11px 22px; border: none; border-radius: 999px;
      color: var(--white); background: linear-gradient(135deg, var(--blue), var(--cyan));
      font-size: 13px; font-weight: 900; cursor: pointer;
    }
    .comment-submit-button:disabled { opacity: 0.6; cursor: wait; }
    .comment-status-message { margin: 2px 0 0; font-size: 12px; line-height: 1.7; min-height: 1em; }
    .comment-status-message.success { color: #146e4a; }
    .comment-status-message.error { color: #a93d3d; }
    .comment-list { display: grid; gap: 12px; margin: 20px 0 0; }
    .comment-item { padding: 13px 14px; border-radius: 13px; background: #f4f8fa; }
    .comment-item-nickname { margin: 0; color: var(--navy); font-size: 12px; font-weight: 900; }
    .comment-item-body { margin: 6px 0 0; color: var(--text); font-size: 13px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
    .comment-item-time { margin: 6px 0 0; color: var(--subtext); font-size: 10px; }
    .comment-empty-state {
      margin: 16px 0 0; padding: 16px; border: 1px dashed var(--border); border-radius: 13px;
      color: var(--subtext); font-size: 12px; text-align: center;
    }
  </style>
</head>
<body>

  <div class="page-header">
    <div class="brand-mini"><span class="brand-mini-icon"><img src="/icon-192.png?v=2" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;"></span>マチナウ</div>
    <h1>${escapedTitle}</h1>
  </div>

  <main>
    <div class="card">

      ${regionBreadcrumbHtml}

      <span class="article-category">${escapedCategory}</span>

      <p class="article-meta">
        公開日：<time datetime="${publishedAttribute}">${publishedDisplay}</time>／更新日：<time datetime="${updatedAttribute}">${updatedDisplay}</time>
      </p>

      ${mainImageHtml}

      <p class="lede">${escapedDescription}</p>

      ${buildColumnArticleParagraphsHtml(
        article.content
      )}

      <div class="cta-section">
        <p>天気・交通・地域の「今」を確認して、このあとの判断材料に。</p>
        <a class="cta-button" href="../" onclick="if (typeof gtag === 'function') { gtag('event', 'column_cta_click', { article_slug: ${escapedSlugForJs} }); }">今の沖縄をマチナウで見る</a>
      </div>

      <p class="byline">マチナウ運営</p>

      <div class="comment-section">
        <h2>この記事にコメントする</h2>

        <form id="commentForm" class="comment-form" novalidate>
          <div>
            <label for="commentNicknameInput">ニックネーム</label>
            <input id="commentNicknameInput" type="text" maxlength="20" placeholder="例：旅好き" autocomplete="off">
          </div>
          <div>
            <label for="commentTextInput">コメント</label>
            <textarea id="commentTextInput" maxlength="500" placeholder="この記事についてのご感想や、実際に体験したことなどをどうぞ"></textarea>
          </div>
          <div class="comment-honeypot-field" aria-hidden="true">
            <label for="commentContactField">ウェブサイト</label>
            <input id="commentContactField" type="text" tabindex="-1" autocomplete="off">
          </div>
          <button id="commentSubmitButton" class="comment-submit-button" type="submit">コメントを投稿する</button>
          <p id="commentStatusMessage" class="comment-status-message" role="status" aria-live="polite"></p>
        </form>

        <div id="commentList" class="comment-list">
          <div class="comment-empty-state">コメントを読み込んでいます…</div>
        </div>
      </div>

      <a class="back-link" href="../">← マチナウTOPへ戻る</a>

    </div>
  </main>

  <script>
    const ARTICLE_SLUG = ${escapedSlugForJs};
    const commentForm = document.getElementById("commentForm");
    const commentNicknameInput = document.getElementById("commentNicknameInput");
    const commentTextInput = document.getElementById("commentTextInput");
    const commentContactField = document.getElementById("commentContactField");
    const commentSubmitButton = document.getElementById("commentSubmitButton");
    const commentStatusMessage = document.getElementById("commentStatusMessage");
    const commentList = document.getElementById("commentList");

    function escapeCommentHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function showCommentStatus(message, type) {
      commentStatusMessage.textContent = message;
      commentStatusMessage.className = "comment-status-message" + (type ? " " + type : "");
    }

    function formatCommentTime(isoString) {
      if (typeof isoString !== "string" || isoString === "") return "";
      const parsedDate = new Date(isoString);
      if (Number.isNaN(parsedDate.getTime())) return "";
      return parsedDate.toLocaleString("ja-JP");
    }

    function renderCommentItemHtml(comment) {
      const timeText = formatCommentTime(comment.createdAt);
      return (
        '<div class="comment-item">' +
          '<p class="comment-item-nickname">' + escapeCommentHtml(comment.nickname) + '</p>' +
          '<p class="comment-item-body">' + escapeCommentHtml(comment.comment) + '</p>' +
          (timeText !== "" ? '<p class="comment-item-time">' + escapeCommentHtml(timeText) + '</p>' : "") +
        '</div>'
      );
    }

    function renderComments(comments) {
      if (!Array.isArray(comments) || comments.length === 0) {
        commentList.innerHTML = '<div class="comment-empty-state">まだコメントはありません。最初のコメントを投稿してみませんか？</div>';
        return;
      }
      commentList.innerHTML = comments.map(renderCommentItemHtml).join("");
    }

    async function loadComments() {
      try {
        const response = await fetch("/api/moderate-submission?mode=articleComments&articleSlug=" + encodeURIComponent(ARTICLE_SLUG));
        const responseData = await response.json();
        if (!response.ok || !responseData || responseData.success !== true) {
          throw new Error("コメントを取得できませんでした。");
        }
        renderComments(responseData.comments);
      } catch (error) {
        console.error("コメント一覧の取得に失敗しました：", error);
        commentList.innerHTML = '<div class="comment-empty-state">コメントを読み込めませんでした。時間をおいて再度お試しください。</div>';
      }
    }

    commentForm.addEventListener("submit", async function(event) {
      event.preventDefault();
      showCommentStatus("", "");
      commentSubmitButton.disabled = true;
      commentSubmitButton.textContent = "投稿しています…";
      try {
        const response = await fetch("/api/moderate-submission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "postArticleComment",
            articleSlug: ARTICLE_SLUG,
            nickname: commentNicknameInput.value,
            comment: commentTextInput.value,
            contactField: commentContactField.value
          })
        });
        let responseData = null;
        try { responseData = await response.json(); } catch (jsonError) { throw new Error("応答を読み取れませんでした。"); }
        if (!responseData || responseData.success !== true) {
          showCommentStatus((responseData && responseData.message) || "コメントを投稿できませんでした。", "error");
          return;
        }
        if (responseData.comment) {
          const existingEmptyState = commentList.querySelector(".comment-empty-state");
          if (existingEmptyState) { commentList.innerHTML = ""; }
          commentList.insertAdjacentHTML("afterbegin", renderCommentItemHtml(responseData.comment));
        }
        commentTextInput.value = "";
        showCommentStatus("コメントを投稿しました。", "success");
      } catch (error) {
        console.error("コメント投稿に失敗しました：", error);
        showCommentStatus("コメントの投稿に失敗しました。時間をおいて、もう一度お試しください。", "error");
      } finally {
        commentSubmitButton.disabled = false;
        commentSubmitButton.textContent = "コメントを投稿する";
      }
    });

    loadComments();
  </script>

</body>
</html>
`;
}


function buildColumnNotFoundHtml() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>記事が見つかりません｜マチナウ</title>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 60px 20px; color: #15233a;">
  <p>お探しの記事は見つかりませんでした。</p>
  <p><a href="/" style="color: #0788c9;">マチナウTOPへ戻る</a></p>
</body>
</html>
`;
}


// 記事本体のHTMLを動的レンダリングする(vercel.jsonのrewriteにより、
// 実在する静的ファイルが無い/column/*.htmlへのアクセスだけがここへ届く。
// 既存の/column/typhoon-okinawa-travel.html(実ファイルとして存在)は
// Vercelの仕様上、静的ファイルの一致がrewriteより優先されるため、この
// 関数には一切到達しない＝無変更のまま維持される)。
async function handleRenderColumnArticleRequest(
  request,
  response
) {
  try {
    const slug =
      request.query &&
      typeof request.query.slug === "string"
        ? request.query.slug.trim()
        : "";

    if (
      slug === "" ||
      LEGACY_STATIC_COLUMN_SLUGS.includes(
        slug
      )
    ) {
      response.setHeader(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      return response.status(404).send(
        buildColumnNotFoundHtml()
      );
    }

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    const documentSnapshot =
      await database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .doc(
          slug
        )
        .get();

    if (
      !documentSnapshot.exists ||
      documentSnapshot.data().status !==
        COLUMN_STATUS_PUBLISHED
    ) {
      response.setHeader(
        "Content-Type",
        "text/html; charset=utf-8"
      );

      return response.status(404).send(
        buildColumnNotFoundHtml()
      );
    }

    const data =
      documentSnapshot.data();

    const html =
      buildColumnArticleHtml(
        {
          slug: slug,
          title: data.title,
          category: data.category,
          description: data.description,
          content: data.content,

          regionCountryLabel:
            getCountryDisplayLabel(
              typeof data.regionCountry === "string"
                ? data.regionCountry
                : ""
            ),

          regionPrefecture:
            typeof data.regionPrefecture === "string"
              ? data.regionPrefecture
              : "",

          regionCity:
            typeof data.regionCity === "string"
              ? data.regionCity
              : "",

          regionArea:
            typeof data.regionArea === "string"
              ? data.regionArea
              : "",

          imageUrl:
            typeof data.imageUrl === "string"
              ? data.imageUrl
              : "",

          publishedAtDate:
            toDateFromFirestoreValue(
              data.publishedAt
            ),
          updatedAtDate:
            toDateFromFirestoreValue(
              data.updatedAt
            )
        }
      );

    response.setHeader(
      "Content-Type",
      "text/html; charset=utf-8"
    );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        COLUMN_ARTICLE_PAGE_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        COLUMN_ARTICLE_PAGE_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).send(
      html
    );
  } catch (error) {
    console.error(
      "読み物ページのレンダリングエラー：",
      error
    );

    response.setHeader(
      "Content-Type",
      "text/html; charset=utf-8"
    );

    return response.status(500).send(
      buildColumnNotFoundHtml()
    );
  }
}


// 公開済みマチナウ読み物の一覧(TOPの動的カード表示用)。既存の静的カード
// (index.html内のtyphoon-okinawa-travel専用マークアップ)はそのまま残し、
// このAPIはそれに追加するFirestore由来の記事だけを返す(既存カードとの
// 重複は発生しない設計)。
// Ver1.8 Phase2(地域連動基盤)｜記事の地域タグと閲覧者の現在地(country/
// prefecture/city、いずれも空文字なら未取得)を突き合わせ、地域の関連度を
// 4段階(3=市区町村完全一致、2=同一都道府県・州等でその記事にcityの指定が
// 無い、1=同一国でその記事にprefecture/cityの指定が無い、0=関連度なし)で
// 返す。記事側のより下位階層(city等)が指定されている場合は、その階層での
// 完全一致だけを見る(上位階層への取りこぼしフォールバックはしない。
// 「那覇市限定」記事を沖縄県内の別市町村の閲覧者にも関連ありと広げすぎない
// ため)。matchLevel 0の記事も除外はしない(現在地以外の記事を読めなくしては
// いけないという指示のため、並び順を後ろにするだけ)。
function computeColumnArticleMatchLevel(
  article,
  viewer
) {
  if (
    article.regionCity !== "" &&
    viewer.city !== "" &&
    article.regionCity === viewer.city
  ) {
    return 3;
  }

  if (
    article.regionCity === "" &&
    article.regionPrefecture !== "" &&
    viewer.prefecture !== "" &&
    article.regionPrefecture === viewer.prefecture
  ) {
    return 2;
  }

  if (
    article.regionCity === "" &&
    article.regionPrefecture === "" &&
    article.regionCountry !== "" &&
    viewer.country !== "" &&
    article.regionCountry.toUpperCase() ===
      viewer.country.toUpperCase()
  ) {
    return 1;
  }

  return 0;
}


async function handlePublicListPublishedColumnArticlesRequest(
  request,
  response
) {
  try {
    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    const query =
      request.query ||
      {};

    // 閲覧者の現在地(app.jsのresolveLocationHierarchyFromCoordinates()から
    // 渡される、既存のuserAreaName/getSuggestionAreaPriorityRank()とは
    // 完全に独立した値)。任意パラメータのため、無指定なら全記事が
    // matchLevel 0(公開日時順のみ)として扱われ、既存のPhase1と同じ
        // 「単純な新着順」に自然に縮退する。
    const viewer =
      {
        country:
          typeof query.viewerCountry === "string"
            ? query.viewerCountry.trim().toUpperCase()
            : "",

        prefecture:
          typeof query.viewerPrefecture === "string"
            ? query.viewerPrefecture.trim()
            : "",

        city:
          typeof query.viewerCity === "string"
            ? query.viewerCity.trim()
            : ""
      };

    // カテゴリーでの絞り込み(読み物一覧ページの「地域＋カテゴリーから探す」
    // 用、任意)。無指定なら絞り込まない。
    const categoryFilter =
      typeof query.category === "string"
        ? query.category.trim()
        : "";

    // column-list.html(専用一覧ページ)が地域欄へ明示的に入力して検索した
    // 場合だけtrueにするフラグ。TOP(loadDynamicColumnEntries())は現在地を
    // 「優先表示のヒント」として渡すだけで、これを付けない＝matchLevel0の
    // 記事も引き続き返す(現在地以外の記事を読めなくしてはいけないという
    // 指示のため)。一覧ページの明示検索だけは、実際に絞り込まれた手応えを
    // 返すため、matchLevel0を除外する。
    const strictRegionFilter =
      query.strictRegion === "1";

    let firestoreQuery =
      database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .where(
          "status",
          "==",
          COLUMN_STATUS_PUBLISHED
        );

    if (
      categoryFilter !== "" &&
      ALLOWED_COLUMN_CATEGORIES.includes(
        categoryFilter
      )
    ) {
      firestoreQuery =
        firestoreQuery.where(
          "category",
          "==",
          categoryFilter
        );
    }

    const articlesSnapshot =
      await firestoreQuery
        .limit(
          COLUMN_LIST_MAX_COUNT
        )
        .get();

    const articles =
      articlesSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            const publishedAtDate =
              toDateFromFirestoreValue(
                data.publishedAt
              );

            const articleRegion =
              {
                regionCountry:
                  typeof data.regionCountry === "string"
                    ? data.regionCountry
                    : "",

                regionPrefecture:
                  typeof data.regionPrefecture === "string"
                    ? data.regionPrefecture
                    : "",

                regionCity:
                  typeof data.regionCity === "string"
                    ? data.regionCity
                    : "",

                regionArea:
                  typeof data.regionArea === "string"
                    ? data.regionArea
                    : ""
              };

            return {
              slug:
                documentSnapshot.id,

              title:
                typeof data.title === "string"
                  ? data.title
                  : "",

              description:
                typeof data.description === "string"
                  ? data.description
                  : "",

              category:
                typeof data.category === "string"
                  ? data.category
                  : "",

              imageUrl:
                typeof data.imageUrl === "string"
                  ? data.imageUrl
                  : "",

              regionCountryLabel:
                getCountryDisplayLabel(
                  articleRegion.regionCountry
                ),

              regionPrefecture:
                articleRegion.regionPrefecture,

              regionCity:
                articleRegion.regionCity,

              regionArea:
                articleRegion.regionArea,

              matchLevel:
                computeColumnArticleMatchLevel(
                  articleRegion,
                  viewer
                ),

              publishedAtMillis:
                publishedAtDate
                  ? publishedAtDate.getTime()
                  : 0
            };
          }
        )
        .sort(
          function(firstArticle, secondArticle) {
            const matchLevelDifference =
              secondArticle.matchLevel -
              firstArticle.matchLevel;

            if (matchLevelDifference !== 0) {
              return matchLevelDifference;
            }

            return (
              secondArticle.publishedAtMillis -
              firstArticle.publishedAtMillis
            );
          }
        )
        .filter(
          function(article) {
            return (
              !strictRegionFilter ||
              article.matchLevel > 0
            );
          }
        )
        .map(
          function(article) {
            return {
              slug: article.slug,
              title: article.title,
              description: article.description,
              category: article.category,
              imageUrl: article.imageUrl,
              regionCountry: article.regionCountryLabel,
              regionPrefecture: article.regionPrefecture,
              regionCity: article.regionCity,
              regionArea: article.regionArea,
              matchLevel: article.matchLevel
            };
          }
        );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        COLUMN_LIST_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        COLUMN_LIST_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).json({
      success: true,
      articles: articles
    });
  } catch (error) {
    console.error(
      "読み物一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "読み物一覧を取得できませんでした。"
    });
  }
}


// sitemap.xmlを動的生成する(vercel.jsonのrewriteで/sitemap.xml自体を
// このFunctionへ向ける。静的ファイルsitemap.xmlは今回削除し、既存の
// TOP・既存コラム記事のURLをこの関数内に固定で含めることで、既存の
// SEO資産(2件)を維持しつつ、公開済みのFirestore記事を自動で追加する)。
async function handleRenderSitemapRequest(
  request,
  response
) {
  try {
    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(
        app
      );

    const urlEntries =
      [
        {
          loc: "https://machinau.jp/",
          lastmod: null
        },
        {
          loc: "https://machinau.jp/column/typhoon-okinawa-travel.html",
          lastmod: "2026-08-27"
        },
        {
          loc: "https://machinau.jp/column-list.html",
          lastmod: null
        }
      ];

    try {
      const articlesSnapshot =
        await database
          .collection(
            COLUMN_ARTICLES_COLLECTION
          )
          .where(
            "status",
            "==",
            COLUMN_STATUS_PUBLISHED
          )
          .limit(
            COLUMN_LIST_MAX_COUNT
          )
          .get();

      articlesSnapshot.docs.forEach(
        function(documentSnapshot) {
          const data =
            documentSnapshot.data() ||
            {};

          const updatedAtDate =
            toDateFromFirestoreValue(
              data.updatedAt
            ) ||
            toDateFromFirestoreValue(
              data.publishedAt
            );

          urlEntries.push(
            {
              loc:
                "https://machinau.jp/column/" +
                documentSnapshot.id +
                ".html",

              lastmod:
                formatDateForAttribute(
                  updatedAtDate
                ) || null
            }
          );
        }
      );
    } catch (articlesError) {
      console.error(
        "sitemap生成時の読み物一覧取得に失敗しました(TOP・既存コラムのみで生成を継続)：",
        articlesError
      );
    }

    const xmlBody =
      urlEntries
        .map(
          function(entry) {
            return (
              "  <url>\n" +
              "    <loc>" +
              escapeHtmlForRender(
                entry.loc
              ) +
              "</loc>\n" +
              (
                entry.lastmod
                  ? "    <lastmod>" +
                    entry.lastmod +
                    "</lastmod>\n"
                  : ""
              ) +
              "  </url>"
            );
          }
        )
        .join(
          "\n"
        );

    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      xmlBody +
      "\n</urlset>\n";

    response.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );

    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=" +
        SITEMAP_SHARED_CACHE_MAX_AGE_SECONDS +
        ", stale-while-revalidate=" +
        SITEMAP_STALE_WHILE_REVALIDATE_SECONDS
    );

    return response.status(200).send(
      xml
    );
  } catch (error) {
    console.error(
      "sitemap生成エラー：",
      error
    );

    response.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );

    return response.status(500).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n'
    );
  }
}


function validateColumnArticleFields(
  requestBody
) {
  const title =
    String(
      requestBody.title || ""
    )
      .trim();

  if (title === "") {
    throw new Error(
      "タイトルを入力してください。"
    );
  }

  if (
    title.length >
    COLUMN_TITLE_MAX_LENGTH
  ) {
    throw new Error(
      "タイトルが長すぎます（" +
      COLUMN_TITLE_MAX_LENGTH +
      "文字以内）。"
    );
  }

  const category =
    String(
      requestBody.category || ""
    )
      .trim();

  if (
    !ALLOWED_COLUMN_CATEGORIES.includes(
      category
    )
  ) {
    throw new Error(
      "カテゴリーを選択してください。"
    );
  }

  const description =
    String(
      requestBody.description || ""
    )
      .trim();

  if (description === "") {
    throw new Error(
      "概要・説明文を入力してください。"
    );
  }

  if (
    description.length >
    COLUMN_DESCRIPTION_MAX_LENGTH
  ) {
    throw new Error(
      "概要・説明文が長すぎます（" +
      COLUMN_DESCRIPTION_MAX_LENGTH +
      "文字以内）。"
    );
  }

  const content =
    String(
      requestBody.content || ""
    )
      .trim();

  if (content === "") {
    throw new Error(
      "本文を入力してください。"
    );
  }

  if (
    content.length >
    COLUMN_CONTENT_MAX_LENGTH
  ) {
    throw new Error(
      "本文が長すぎます（" +
      COLUMN_CONTENT_MAX_LENGTH +
      "文字以内）。"
    );
  }

  // Ver1.8 Phase2(地域連動基盤)｜country/prefecture/city/areaはすべて任意。
  // 市区町村だけを必須単位にせず、記事ごとに粒度を選べるようにする
  // (「沖縄の雨」はcountry+prefectureのみ、「日本のお正月」はcountryのみ、
  // 等)。countryはISO 3166-1 alpha-2コードのみを正本として受け付ける
  // (validateColumnRegionCountryCode()、不正な値はエラーで弾く)。
  const regionCountry =
    validateColumnRegionCountryCode(
      requestBody.regionCountry
    );

  const regionPrefecture =
    String(
      requestBody.regionPrefecture || ""
    )
      .trim();

  if (
    regionPrefecture.length >
    COLUMN_REGION_FIELD_MAX_LENGTHS.prefecture
  ) {
    throw new Error(
      "都道府県・州等が長すぎます（" +
      COLUMN_REGION_FIELD_MAX_LENGTHS.prefecture +
      "文字以内）。"
    );
  }

  const regionCity =
    String(
      requestBody.regionCity || ""
    )
      .trim();

  if (
    regionCity.length >
    COLUMN_REGION_FIELD_MAX_LENGTHS.city
  ) {
    throw new Error(
      "市区町村が長すぎます（" +
      COLUMN_REGION_FIELD_MAX_LENGTHS.city +
      "文字以内）。"
    );
  }

  const regionArea =
    String(
      requestBody.regionArea || ""
    )
      .trim();

  if (
    regionArea.length >
    COLUMN_REGION_FIELD_MAX_LENGTHS.area
  ) {
    throw new Error(
      "エリア名が長すぎます（" +
      COLUMN_REGION_FIELD_MAX_LENGTHS.area +
      "文字以内）。"
    );
  }

  // city/areaを指定するなら、その上位階層(prefecture/city)も指定させる
  // (階層の飛び級を防ぎ、マッチング条件を単純に保つ)。country自体は
  // 必須にしない(将来country未設定の汎用記事もありうるため)。
  if (
    regionArea !== "" &&
    regionCity === ""
  ) {
    throw new Error(
      "エリアを指定する場合は市区町村も入力してください。"
    );
  }

  if (
    regionCity !== "" &&
    regionPrefecture === ""
  ) {
    throw new Error(
      "市区町村を指定する場合は都道府県・州等も入力してください。"
    );
  }

  if (
    regionPrefecture !== "" &&
    regionCountry === ""
  ) {
    throw new Error(
      "都道府県・州等を指定する場合は国も入力してください。"
    );
  }

  // メイン画像は既存Cloudinary(mode:"cloudinarySignature"、post.html・
  // admin-region-picks.htmlと共用)経由でアップロードされたURLのみを許可
  // する(新しい画像サービスは追加しない)。1枚のみ、任意。
  const imageUrl =
    String(
      requestBody.imageUrl || ""
    )
      .trim();

  if (
    imageUrl !== "" &&
    !/^https:\/\//.test(
      imageUrl
    )
  ) {
    throw new Error(
      "メイン画像のアドレスが正しくありません。"
    );
  }

  const imagePublicId =
    String(
      requestBody.imagePublicId || ""
    )
      .trim();

  const isPublished =
    requestBody.isPublished === true;

  return {
    title: title,
    category: category,
    description: description,
    content: content,
    regionCountry: regionCountry,
    regionPrefecture: regionPrefecture,
    regionCity: regionCity,
    regionArea: regionArea,
    imageUrl: imageUrl,
    imagePublicId: imagePublicId,
    isPublished: isPublished
  };
}


// 代表が任意でURL識別子を指定した場合はその値(重複チェック済み)を、
// 指定しなかった場合はFirestoreの自動採番IDを、そのままドキュメントID
// (=slug)として使う。作成後にslugを変更する機能は用意しない
// (一度公開したURLを変えない、という既存コラムと同じSEO安全設計)。
async function resolveColumnArticleSlugForCreate(
  database,
  requestBody
) {
  const customSlug =
    typeof requestBody.customSlug === "string"
      ? requestBody.customSlug.trim().toLowerCase()
      : "";

  if (customSlug === "") {
    return database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc()
      .id;
  }

  if (
    customSlug.length >
    COLUMN_CUSTOM_SLUG_MAX_LENGTH ||
    !COLUMN_CUSTOM_SLUG_PATTERN.test(
      customSlug
    )
  ) {
    throw new Error(
      "URL識別子は半角小文字英数字とハイフンのみ、" +
      COLUMN_CUSTOM_SLUG_MAX_LENGTH +
      "文字以内で入力してください。空欄なら自動生成されます。"
    );
  }

  if (
    LEGACY_STATIC_COLUMN_SLUGS.includes(
      customSlug
    )
  ) {
    throw new Error(
      "このURL識別子は既存の記事と重複するため使用できません。"
    );
  }

  const existingSnapshot =
    await database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc(
        customSlug
      )
      .get();

  if (
    existingSnapshot.exists
  ) {
    throw new Error(
      "このURL識別子は既に使用されています。別の識別子を指定してください。"
    );
  }

  return customSlug;
}


// マチナウ読み物の新規作成・編集(管理者のみ)。documentIdが指定されていれば
// 既存記事の更新(slugは不変のまま内容のみ更新)、無ければ新規作成。
// 新規作成時のみpublishedAtを設定し(下書き→公開へ変わったタイミングを
// 明確にするため)、既に一度公開済みの記事を編集してもpublishedAtは
// 上書きしない(公開日が変わらないようにする)。
async function handleAdminSaveColumnArticleRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const database =
      authResult.database;

    const requestBody =
      readRequestBody(
        request
      );

    let fields;

    try {
      fields =
        validateColumnArticleFields(
          requestBody
        );
    } catch (validationError) {
      return response.status(400).json({
        success: false,
        message:
          validationError.message
      });
    }

    const documentId =
      typeof requestBody.documentId === "string"
        ? requestBody.documentId.trim()
        : "";

    if (documentId !== "") {
      const documentReference =
        database
          .collection(
            COLUMN_ARTICLES_COLLECTION
          )
          .doc(
            documentId
          );

      const existingSnapshot =
        await documentReference.get();

      if (
        !existingSnapshot.exists
      ) {
        return response.status(404).json({
          success: false,
          message:
            "対象の記事が見つかりませんでした。"
        });
      }

      const existingData =
        existingSnapshot.data() ||
        {};

      const updateData = {
        title: fields.title,
        category: fields.category,
        description: fields.description,
        content: fields.content,
        regionCountry: fields.regionCountry,
        regionPrefecture: fields.regionPrefecture,
        regionCity: fields.regionCity,
        regionArea: fields.regionArea,
        imageUrl: fields.imageUrl,
        imagePublicId: fields.imagePublicId,

        status:
          fields.isPublished
            ? COLUMN_STATUS_PUBLISHED
            : COLUMN_STATUS_DRAFT,

        updatedAt:
          FieldValue.serverTimestamp()
      };

      if (
        fields.isPublished &&
        existingData.status !==
          COLUMN_STATUS_PUBLISHED
      ) {
        updateData.publishedAt =
          FieldValue.serverTimestamp();
      }

      await documentReference.update(
        updateData
      );

      return response.status(200).json({
        success: true,
        message:
          "マチナウ読み物を更新しました。",
        slug:
          documentId
      });
    }

    let newSlug;

    try {
      newSlug =
        await resolveColumnArticleSlugForCreate(
          database,
          requestBody
        );
    } catch (slugError) {
      return response.status(400).json({
        success: false,
        message:
          slugError.message
      });
    }

    const newDocumentData = {
      title: fields.title,
      category: fields.category,
      description: fields.description,
      content: fields.content,
      regionCountry: fields.regionCountry,
      regionPrefecture: fields.regionPrefecture,
      regionCity: fields.regionCity,
      regionArea: fields.regionArea,
      imageUrl: fields.imageUrl,
      imagePublicId: fields.imagePublicId,

      // 運営投稿担当(Editor)権限 Phase1｜誰が作成したかを内部用として
      // 記録する(公開画面には一切表示しない、admin-column.htmlの管理
      // 一覧にも今回は表示しない)。作成時のみ設定し、以後の編集では
      // 上書きしない(最終編集者ではなく作成者を残す)。
      operatorUid: authResult.actor.uid,
      operatorEmail: authResult.actor.email,
      operatorRole: authResult.actor.type,

      status:
        fields.isPublished
          ? COLUMN_STATUS_PUBLISHED
          : COLUMN_STATUS_DRAFT,

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),

      publishedAt:
        fields.isPublished
          ? FieldValue.serverTimestamp()
          : null
    };

    await database
      .collection(
        COLUMN_ARTICLES_COLLECTION
      )
      .doc(
        newSlug
      )
      .set(
        newDocumentData
      );

    return response.status(200).json({
      success: true,
      message:
        "マチナウ読み物を保存しました。",
      slug:
        newSlug
    });
  } catch (error) {
    console.error(
      "マチナウ読み物の保存エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "保存に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}


async function handleAdminListColumnArticlesRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const database =
      authResult.database;

    const articlesSnapshot =
      await database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .limit(
          COLUMN_LIST_MAX_COUNT
        )
        .get();

    const articles =
      articlesSnapshot.docs
        .map(
          function(documentSnapshot) {
            const data =
              documentSnapshot.data() ||
              {};

            const updatedAtDate =
              toDateFromFirestoreValue(
                data.updatedAt
              );

            return {
              id:
                documentSnapshot.id,

              title:
                typeof data.title === "string"
                  ? data.title
                  : "",

              category:
                typeof data.category === "string"
                  ? data.category
                  : "",

              regionCountry:
                getCountryDisplayLabel(
                  typeof data.regionCountry === "string"
                    ? data.regionCountry
                    : ""
                ),

              regionPrefecture:
                typeof data.regionPrefecture === "string"
                  ? data.regionPrefecture
                  : "",

              regionCity:
                typeof data.regionCity === "string"
                  ? data.regionCity
                  : "",

              status:
                typeof data.status === "string"
                  ? data.status
                  : "",

              updatedAtMillis:
                updatedAtDate
                  ? updatedAtDate.getTime()
                  : 0,

              updatedAt:
                updatedAtDate
                  ? updatedAtDate.toISOString()
                  : null
            };
          }
        )
        .sort(
          function(firstArticle, secondArticle) {
            return (
              secondArticle.updatedAtMillis -
              firstArticle.updatedAtMillis
            );
          }
        )
        .map(
          function(article) {
            return {
              id: article.id,
              title: article.title,
              category: article.category,
              regionCountry: article.regionCountry,
              regionPrefecture: article.regionPrefecture,
              regionCity: article.regionCity,
              status: article.status,
              updatedAt: article.updatedAt
            };
          }
        );

    return response.status(200).json({
      success: true,
      articles: articles
    });
  } catch (error) {
    console.error(
      "マチナウ読み物一覧取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "一覧を取得できませんでした。"
    });
  }
}


async function handleAdminGetColumnArticleRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const database =
      authResult.database;

    const requestBody =
      readRequestBody(
        request
      );

    const documentId =
      typeof requestBody.documentId === "string"
        ? requestBody.documentId.trim()
        : "";

    if (documentId === "") {
      return response.status(400).json({
        success: false,
        message:
          "documentIdを指定してください。"
      });
    }

    const documentSnapshot =
      await database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .doc(
          documentId
        )
        .get();

    if (
      !documentSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の記事が見つかりませんでした。"
      });
    }

    const data =
      documentSnapshot.data() ||
      {};

    return response.status(200).json({
      success: true,
      article: {
        id: documentId,

        title:
          typeof data.title === "string"
            ? data.title
            : "",

        category:
          typeof data.category === "string"
            ? data.category
            : "",

        description:
          typeof data.description === "string"
            ? data.description
            : "",

        content:
          typeof data.content === "string"
            ? data.content
            : "",

        // 編集フォームの<select>へそのまま値をセットするため、表示用
        // ラベルへ変換せずISOコードのまま返す(admin-column.html側で
        // Intl.DisplayNamesを使い、コードから選択肢を組み立てる)。
        regionCountry:
          typeof data.regionCountry === "string"
            ? data.regionCountry
            : "",

        regionPrefecture:
          typeof data.regionPrefecture === "string"
            ? data.regionPrefecture
            : "",

        regionCity:
          typeof data.regionCity === "string"
            ? data.regionCity
            : "",

        regionArea:
          typeof data.regionArea === "string"
            ? data.regionArea
            : "",

        imageUrl:
          typeof data.imageUrl === "string"
            ? data.imageUrl
            : "",

        imagePublicId:
          typeof data.imagePublicId === "string"
            ? data.imagePublicId
            : "",

        status:
          typeof data.status === "string"
            ? data.status
            : ""
      }
    });
  } catch (error) {
    console.error(
      "マチナウ読み物取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "記事を取得できませんでした。"
    });
  }
}


// 公開/下書きへの切り替えだけを行う軽量モード(コメントのhide機能と同じ
// 考え方)。フォーム全体を再送信しなくても一覧画面から即座に切り替えられる。
async function handleAdminSetColumnArticleStatusRequest(
  request,
  response
) {
  try {
    const authResult =
      await requireAdminOrEditor(
        request
      );

    if (!authResult.ok) {
      return response.status(authResult.status).json({
        success: false,
        message:
          authResult.message
      });
    }

    const database =
      authResult.database;

    const requestBody =
      readRequestBody(
        request
      );

    const documentId =
      typeof requestBody.documentId === "string"
        ? requestBody.documentId.trim()
        : "";

    const isPublished =
      requestBody.isPublished === true;

    if (documentId === "") {
      return response.status(400).json({
        success: false,
        message:
          "documentIdを指定してください。"
      });
    }

    const documentReference =
      database
        .collection(
          COLUMN_ARTICLES_COLLECTION
        )
        .doc(
          documentId
        );

    const existingSnapshot =
      await documentReference.get();

    if (
      !existingSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の記事が見つかりませんでした。"
      });
    }

    const existingData =
      existingSnapshot.data() ||
      {};

    const updateData = {
      status:
        isPublished
          ? COLUMN_STATUS_PUBLISHED
          : COLUMN_STATUS_DRAFT,

      updatedAt:
        FieldValue.serverTimestamp()
    };

    if (
      isPublished &&
      existingData.status !==
        COLUMN_STATUS_PUBLISHED
    ) {
      updateData.publishedAt =
        FieldValue.serverTimestamp();
    }

    await documentReference.update(
      updateData
    );

    return response.status(200).json({
      success: true,
      message:
        isPublished
          ? "公開しました。"
          : "下書きに戻しました。"
    });
  } catch (error) {
    console.error(
      "マチナウ読み物のステータス変更エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "状態を変更できませんでした。"
    });
  }
}


export default async function handler(
  request,
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  // GET: TOP画面向けの公開submissions一覧取得(認証不要、CDN共有キャッシュ対象)。
  // 既存のPOST専用処理(投稿審査・Cloudinary署名発行)より前に分岐させ、
  // 互いに影響しないようにする。
  if (
    request.method === "GET"
  ) {
    // マチナウ読み物コメント機能MVP｜既存のsubmissions一覧取得(query無し)とは
    // 別のquery(mode=articleComments)でのみ分岐させ、既存の呼び出し(query無し)
    // には一切影響させない。
    if (
      request.query &&
      request.query.mode === "articleComments"
    ) {
      return handleArticleCommentsListRequest(
        request,
        response
      );
    }

    // マチナウ読み物投稿機能(Phase1)｜vercel.jsonのrewrite経由で
    // /column/*.html(実在する静的ファイルが無いものだけ)がここへ届く。
    if (
      request.query.mode === "renderColumn"
    ) {
      return handleRenderColumnArticleRequest(
        request,
        response
      );
    }

    // vercel.jsonのrewrite経由で/sitemap.xmlがここへ届く
    // (静的sitemap.xmlは削除済み)。
    if (
      request.query.mode === "renderSitemap"
    ) {
      return handleRenderSitemapRequest(
        request,
        response
      );
    }

    // TOPの「マチナウ読みもの」セクションが、既存の静的カードに追加して
    // Firestore由来の公開済み記事を動的に読み込むための一覧取得。
    if (
      request.query.mode === "publicListPublishedColumns"
    ) {
      return handlePublicListPublishedColumnArticlesRequest(
        request,
        response
      );
    }

    return handlePublicSubmissionsListRequest(
      request,
      response
    );
  }

  if (
    request.method !== "POST"
  ) {
    response.setHeader(
      "Allow",
      "GET, POST"
    );

    return response.status(405).json({
      success: false,
      message:
        "GETまたはPOSTのみ利用できます。"
    });
  }

  const requestBody =
    readRequestBody(
      request
    );

  if (
    requestBody.mode === "cloudinarySignature"
  ) {
    return handleCloudinarySignatureRequest(
      request,
      response
    );
  }

  // マチナウ読み物コメント機能MVP｜既存のcloudinarySignature/aiConciergeと
  // 同じ位置(モード判定)に追加するだけで、GET一覧取得・既定の投稿審査
  // (この先のtry節、publicationNumber/endCodeによるAI自動審査トリガー)の
  // いずれにも一切触れない。
  if (
    requestBody.mode === "postArticleComment"
  ) {
    return handlePostArticleCommentRequest(
      request,
      response
    );
  }

  // マチナウ読み物コメント管理(最小機能)｜管理者認証必須の2モード。
  // 一般ユーザー向けpostArticleComment/GET一覧とは別のmodeのため、
  // 既存の一般公開経路には一切影響しない。
  if (
    requestBody.mode === "adminListArticleComments"
  ) {
    return handleAdminListArticleCommentsRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminHideArticleComment"
  ) {
    return handleAdminHideArticleCommentRequest(
      request,
      response
    );
  }

  // マチナウ読み物投稿機能(Phase1)｜管理者認証必須の4モード。
  // 一般公開経路(renderColumn等)には一切影響しない。
  if (
    requestBody.mode === "adminSaveColumnArticle"
  ) {
    return handleAdminSaveColumnArticleRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminListColumnArticles"
  ) {
    return handleAdminListColumnArticlesRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminGetColumnArticle"
  ) {
    return handleAdminGetColumnArticleRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminSetColumnArticleStatus"
  ) {
    return handleAdminSetColumnArticleStatusRequest(
      request,
      response
    );
  }

  // 運営投稿担当(Editor)権限 Phase1｜Admin/Editor共用モード。
  if (
    requestBody.mode === "getMyOperatorInfo"
  ) {
    return handleGetMyOperatorInfoRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "operatorCloudinarySignature"
  ) {
    return handleOperatorCloudinarySignatureRequest(
      request,
      response
    );
  }

  // 運営投稿担当(Editor)権限 Phase1｜Admin専用の運営者管理モード。
  if (
    requestBody.mode === "adminCreateEditor"
  ) {
    return handleAdminCreateEditorRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminSetEditorActive"
  ) {
    return handleAdminSetEditorActiveRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "adminListEditors"
  ) {
    return handleAdminListEditorsRequest(
      request,
      response
    );
  }

  // Ver1.8 Phase1｜AIコンシェルジュ。既存のcloudinarySignatureモードと
  // 同じ位置(モード判定)に追加するだけで、GET一覧取得・cloudinarySignature・
  // 既定の投稿審査(この先のtry節)のいずれにも一切触れない。
  if (
    requestBody.mode === "aiConcierge"
  ) {
    return handleAiConciergeRequest(
      request,
      response
    );
  }

  // 会話型マチナウAI Phase1(MVP)｜既存のaiConciergeモードと同じ位置に
  // 追加するだけで、既存モードのいずれにも一切触れない。
  if (
    requestBody.mode === "aiConciergeChat"
  ) {
    return handleAiConciergeChatRequest(
      request,
      response
    );
  }

  // AI地域編集部 Phase1(八重瀬町・最小縦断実証)｜既存のaiConcierge/
  // aiConciergeChatと同じ位置(モード判定)に追加するだけで、既存モードの
  // いずれにも一切触れない。管理者/Editor専用(requireAdminOrEditor)。
  if (
    requestBody.mode === "regionEditorial"
  ) {
    return handleRegionEditorialRequest(
      request,
      response
    );
  }

  // AI地域編集部 Phase3.1(街の長期記憶DB)｜既存のregionEditorialと同じ
  // 位置(モード判定)に追加するだけで、既存モードのいずれにも一切触れない。
  // 管理者/Editor専用(requireAdminOrEditor)。
  if (
    requestBody.mode === "regionProfileGet"
  ) {
    return handleRegionProfileGetRequest(
      request,
      response
    );
  }

  if (
    requestBody.mode === "regionProfileSave"
  ) {
    return handleRegionProfileSaveRequest(
      request,
      response
    );
  }

  // AI地域編集部 Phase3.2(街の記憶を調査するAI)｜既存のregionProfileGet/
  // Saveと同じ位置(モード判定)に追加するだけで、既存モードのいずれにも
  // 一切触れない。管理者/Editor専用(requireAdminOrEditor)。
  if (
    requestBody.mode === "regionProfileResearch"
  ) {
    return handleRegionProfileResearchRequest(
      request,
      response
    );
  }

  // 「この街の情報」Phase1｜既存モードのいずれにも一切触れない。
  // regionEditorial/regionProfile系とは異なり、公開機能(旅行者向け)の
  // ため管理者/Editor限定にしない(handleCityInfoGetRequest内部で
  // aiConciergeChatと同じ認証方式を使う)。
  if (
    requestBody.mode === "cityInfoGet"
  ) {
    return handleCityInfoGetRequest(
      request,
      response
    );
  }

  try {
    const publicationNumber =
      normalizePublicationNumber(
        requestBody.publicationNumber
      );

    const endCode =
      normalizeEndCode(
        requestBody.endCode
      );

    if (
      !/^\d{8}$/.test(
        publicationNumber
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "掲載番号は8桁の数字で入力してください。"
      });
    }

    if (
      !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(
        endCode
      )
    ) {
      return response.status(400).json({
        success: false,
        message:
          "終了番号を正しく入力してください。"
      });
    }

    const app =
      getFirebaseAdminApp();

    const database =
      getFirestore(app);

    const submissionSnapshot =
      await database
        .collection(
          "submissions"
        )
        .where(
          "publicationNumber",
          "==",
          publicationNumber
        )
        .limit(10)
        .get();

    if (
      submissionSnapshot.empty
    ) {
      return response.status(401).json({
        success: false,
        message:
          COMMON_AUTH_ERROR_MESSAGE
      });
    }

    const enteredEndCodeHash =
      createEndCodeHash(
        endCode
      );

    const matchingDocument =
      submissionSnapshot.docs.find(
        function(documentSnapshot) {
          const submissionData =
            documentSnapshot.data();

          return hashesMatch(
            submissionData.endCodeHash,
            enteredEndCodeHash
          );
        }
      );

    if (
      !matchingDocument
    ) {
      return response.status(401).json({
        success: false,
        message:
          COMMON_AUTH_ERROR_MESSAGE
      });
    }

    const currentData =
      matchingDocument.data();

    if (
      currentData.status !== "pending"
    ) {
      return response.status(200).json({
        success: true,
        message:
          "審査対象外のため処理をスキップしました。"
      });
    }

    if (
      currentData.aiReviewStatus === "REVIEW" ||
      currentData.aiReviewStatus === "SAFE"
    ) {
      return response.status(200).json({
        success: true,
        message:
          "既に審査済みのため、再審査をスキップしました。"
      });
    }

    const durationHoursValue =
      typeof currentData.durationHours === "number" &&
      Number.isFinite(
        currentData.durationHours
      ) &&
      currentData.durationHours > 0
        ? currentData.durationHours
        : null;

    let moderationResults =
      null;

    let moderationError =
      null;

    try {
      const inputItems =
        buildModerationInput(
          currentData
        );

      moderationResults =
        await callOpenAiModeration(
          inputItems
        );
    } catch (error) {
      moderationError =
        error;
    }

    if (moderationError) {
      const reasonText =
        classifyModerationError(
          moderationError
        );

      await database.runTransaction(
        async function(transaction) {
          const freshSnapshot =
            await transaction.get(
              matchingDocument.ref
            );

          if (
            !freshSnapshot.exists
          ) {
            return;
          }

          const freshData =
            freshSnapshot.data();

          if (
            freshData.status !== "pending"
          ) {
            return;
          }

          transaction.update(
            matchingDocument.ref,
            {
              aiReviewStatus:
                "ERROR",

              aiReviewReason:
                reasonText,

              aiReviewedAt:
                FieldValue.serverTimestamp(),

              aiReviewVersion:
                AI_REVIEW_VERSION
            }
          );
        }
      );

      console.error(
        "AI自動審査エラー：",
        moderationError
      );

      return response.status(200).json({
        success: true,
        message:
          "AI審査でエラーが発生しました。",
        aiReviewStatus:
          "ERROR"
      });
    }

    const allSafe =
      moderationResults.every(
        function(result) {
          return (
            result &&
            result.flagged === false
          );
        }
      );

    // Ver1.8 Phase2 STEP5-D｜安全・災害・交通に関わる可能性のある投稿は、
    // Moderationがsafeでも自動承認せず、必ず人間の確認を経由させる。
    const isSafetyCriticalContent =
      matchesSafetyCriticalKeywords(
        currentData
      );

    // 店舗投稿の安全化＋撤回｜「店舗(shop)投稿はSAFEでも自動承認しない」
    // という条件は本部判断により撤回された(代表が個別に電話・DM等で
    // 店舗の実在・セール内容を確認する運用は現実的に不可能なため)。
    // street/shopの区別なく、Moderation SAFE＋durationHours正常＋
    // 安全/災害/交通キーワード無しであれば自動承認する、撤回前の判定へ
    // 戻す。submissionType自体・そのallowlist(resolveSubmissionType()、
    // ALLOWED_SUBMISSION_TYPES)はAdmin一覧の🏪店舗投稿識別表示のために
    // 引き続き保存・利用するが、このモデレーション判定では参照しない。
    if (
      allSafe &&
      durationHoursValue !== null &&
      !isSafetyCriticalContent
    ) {
      await database.runTransaction(
        async function(transaction) {
          const freshSnapshot =
            await transaction.get(
              matchingDocument.ref
            );

          if (
            !freshSnapshot.exists
          ) {
            return;
          }

          const freshData =
            freshSnapshot.data();

          if (
            freshData.status !== "pending"
          ) {
            return;
          }

          const newExpiresAtDate =
            new Date(
              Date.now() +
              durationHoursValue *
                60 *
                60 *
                1000
            );

          transaction.update(
            matchingDocument.ref,
            {
              status:
                "approved",

              expiresAt:
                Timestamp.fromDate(
                  newExpiresAtDate
                ),

              aiReviewStatus:
                "SAFE",

              aiReviewedAt:
                FieldValue.serverTimestamp(),

              aiReviewVersion:
                AI_REVIEW_VERSION
            }
          );
        }
      );

      return response.status(200).json({
        success: true,
        message:
          "AI審査によって自動承認されました。",
        aiReviewStatus:
          "SAFE"
      });
    }

    const reasonText =
      allSafe && isSafetyCriticalContent
        ? "安全・災害・交通に関する情報の可能性があるため、内容を人間が確認します。"
        : allSafe
          ? "掲載時間の情報が正しく設定されていないため、自動承認できません。"
          : buildReviewReason(
              moderationResults
            );

    await database.runTransaction(
      async function(transaction) {
        const freshSnapshot =
          await transaction.get(
            matchingDocument.ref
          );

        if (
          !freshSnapshot.exists
        ) {
          return;
        }

        const freshData =
          freshSnapshot.data();

        if (
          freshData.status !== "pending"
        ) {
          return;
        }

        transaction.update(
          matchingDocument.ref,
          {
            aiReviewStatus:
              "REVIEW",

            aiReviewReason:
              reasonText,

            aiReviewedAt:
              FieldValue.serverTimestamp(),

            aiReviewVersion:
              AI_REVIEW_VERSION
          }
        );
      }
    );

    return response.status(200).json({
      success: true,
      message:
        "人間による確認が必要と判定されました。",
      aiReviewStatus:
        "REVIEW"
    });
  } catch (error) {
    console.error(
      "AI自動審査処理エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "処理に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
