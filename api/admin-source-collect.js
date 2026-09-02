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
  lookup as dnsLookup
} from "node:dns/promises";

import {
  createHash,
  timingSafeEqual
} from "node:crypto";

import {
  XMLParser
} from "fast-xml-parser";


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


function readCronSecretHeader(
  request
) {
  const headerValue =
    request.headers &&
    request.headers["x-machinau-cron-secret"];

  if (
    typeof headerValue !== "string"
  ) {
    return "";
  }

  return headerValue;
}


function cronSecretsMatch(
  providedSecret,
  expectedSecret
) {
  if (
    typeof providedSecret !== "string" ||
    typeof expectedSecret !== "string" ||
    providedSecret === "" ||
    expectedSecret === ""
  ) {
    return false;
  }

  const providedBuffer =
    Buffer.from(
      providedSecret,
      "utf8"
    );

  const expectedBuffer =
    Buffer.from(
      expectedSecret,
      "utf8"
    );

  if (
    providedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  try {
    return timingSafeEqual(
      providedBuffer,
      expectedBuffer
    );
  } catch (error) {
    return false;
  }
}


const TRACKING_QUERY_PARAM_NAMES = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content"
];


function normalizeArticleUrl(
  rawUrl
) {
  const originalUrl =
    String(
      rawUrl || ""
    )
      .trim();

  let parsedUrl;

  try {
    parsedUrl =
      new URL(
        originalUrl
      );
  } catch (error) {
    return originalUrl;
  }

  parsedUrl.hostname =
    parsedUrl.hostname.toLowerCase();

  parsedUrl.hash =
    "";

  TRACKING_QUERY_PARAM_NAMES.forEach(
    function(paramName) {
      parsedUrl.searchParams.delete(
        paramName
      );
    }
  );

  let pathname =
    parsedUrl.pathname;

  if (
    pathname.length > 1 &&
    pathname.endsWith("/")
  ) {
    pathname =
      pathname.slice(
        0,
        -1
      );
  }

  parsedUrl.pathname =
    pathname;

  return parsedUrl.toString();
}


function computeNormalizedUrlHash(
  normalizedUrl
) {
  return createHash("sha256")
    .update(
      normalizedUrl,
      "utf8"
    )
    .digest("hex");
}


const PROCESSING_STATUS_DISCOVERED =
  "DISCOVERED";

const PROCESSING_STATUS_PROCESSING =
  "PROCESSING";

const PROCESSING_STATUS_DONE =
  "DONE";

const PROCESSING_STATUS_ERROR =
  "ERROR";

const PROCESSING_STATUS_SKIPPED =
  "SKIPPED";


// judgeArticleForAutoPost()内のsummary未保存時のSKIP理由文言と
// 完全一致させる必要がある(judgeArticleForAutoPost()は変更しないため、
// ここでは定数を共有せず文言だけを同期させている)。
const SUMMARY_MISSING_SKIP_REASON =
  "概要（summary）が保存されていないため対象外です。";


const PROCESSING_CLAIM_STALE_MILLISECONDS =
  10 * 60 * 1000;


const AI_COLLECTED_ARTICLES_COLLECTION =
  "aiCollectedArticles";


const PRIORITY_TIER_IMPORTANT =
  "IMPORTANT";

const PRIORITY_TIER_NORMAL =
  "NORMAL";

const CRON_COLLECTION_CONCURRENCY =
  2;

const MAX_SOURCES_PER_CRON_RUN =
  10;


const FETCH_TIMEOUT_MILLISECONDS =
  8000;

const MAX_RESPONSE_BYTES =
  1024 * 1024;

const MAX_CANDIDATE_COUNT = 20;

const MAX_TITLE_LENGTH = 200;

const MAX_SUMMARY_LENGTH = 500;


function isPrivateOrReservedIpAddress(
  ipAddress
) {
  if (
    typeof ipAddress !== "string" ||
    ipAddress === ""
  ) {
    return true;
  }

  const normalizedAddress =
    ipAddress
      .toLowerCase();

  if (
    normalizedAddress === "::1" ||
    normalizedAddress === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

  if (
    normalizedAddress.startsWith(
      "fe80:"
    ) ||
    normalizedAddress.startsWith(
      "fc"
    ) ||
    normalizedAddress.startsWith(
      "fd"
    )
  ) {
    return true;
  }

  const mappedMatch =
    normalizedAddress.match(
      /^::ffff:(\d+\.\d+\.\d+\.\d+)$/
    );

  const ipv4Candidate =
    mappedMatch
      ? mappedMatch[1]
      : normalizedAddress;

  const ipv4Match =
    ipv4Candidate.match(
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    );

  if (!ipv4Match) {
    return false;
  }

  const octets = [
    Number(ipv4Match[1]),
    Number(ipv4Match[2]),
    Number(ipv4Match[3]),
    Number(ipv4Match[4])
  ];

  const hasInvalidOctet =
    octets.some(
      function(octet) {
        return (
          !Number.isInteger(
            octet
          ) ||
          octet < 0 ||
          octet > 255
        );
      }
    );

  if (hasInvalidOctet) {
    return true;
  }

  const firstOctet =
    octets[0];

  const secondOctet =
    octets[1];

  if (firstOctet === 127) {
    return true;
  }

  if (firstOctet === 10) {
    return true;
  }

  if (
    firstOctet === 172 &&
    secondOctet >= 16 &&
    secondOctet <= 31
  ) {
    return true;
  }

  if (
    firstOctet === 192 &&
    secondOctet === 168
  ) {
    return true;
  }

  if (
    firstOctet === 169 &&
    secondOctet === 254
  ) {
    return true;
  }

  if (firstOctet === 0) {
    return true;
  }

  return false;
}


function isBlockedHostnameLiteral(
  hostname
) {
  const normalizedHostname =
    hostname
      .toLowerCase();

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(
      ".localhost"
    )
  ) {
    return true;
  }

  return isPrivateOrReservedIpAddress(
    normalizedHostname
  );
}


async function assertFeedUrlIsSafe(
  feedUrl
) {
  let parsedUrl;

  try {
    parsedUrl = new URL(
      feedUrl
    );
  } catch (error) {
    throw new Error(
      "RSS URLの形式が正しくありません。"
    );
  }

  if (
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "https:"
  ) {
    throw new Error(
      "RSS URLはhttp://またはhttps://のみ利用できます。"
    );
  }

  const hostname =
    parsedUrl.hostname;

  if (
    isBlockedHostnameLiteral(
      hostname
    )
  ) {
    throw new Error(
      "このRSS URLは利用できません。"
    );
  }

  let lookupResults;

  try {
    lookupResults =
      await dnsLookup(
        hostname,
        { all: true }
      );
  } catch (error) {
    throw new Error(
      "RSS URLの名前解決に失敗しました。"
    );
  }

  if (
    !Array.isArray(
      lookupResults
    ) ||
    lookupResults.length === 0
  ) {
    throw new Error(
      "RSS URLの名前解決に失敗しました。"
    );
  }

  const hasBlockedAddress =
    lookupResults.some(
      function(lookupResult) {
        return isPrivateOrReservedIpAddress(
          lookupResult.address
        );
      }
    );

  if (hasBlockedAddress) {
    throw new Error(
      "このRSS URLは利用できません。"
    );
  }

  return parsedUrl;
}


async function fetchFeedContent(
  feedUrl
) {
  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      FETCH_TIMEOUT_MILLISECONDS
    );

  let response;

  try {
    try {
      response =
        await fetch(
          feedUrl,
          {
            signal:
              controller.signal,

            redirect:
              "manual",

            headers: {
              "User-Agent":
                "MachinauAIReporterBot/1.0 (+admin RSS collector)"
            }
          }
        );
    } catch (fetchError) {
      if (
        fetchError.name === "AbortError"
      ) {
        throw new Error(
          "RSSの取得がタイムアウトしました。"
        );
      }

      throw new Error(
        "RSSの取得に失敗しました。"
      );
    }

    if (
      response.type === "opaqueredirect" ||
      (
        response.status >= 300 &&
        response.status < 400
      )
    ) {
      throw new Error(
        "このRSS URLはリダイレクトされるため取得できません。登録するURLを直接のURLに変更してください。"
      );
    }

    if (!response.ok) {
      throw new Error(
        "RSSの取得に失敗しました。（HTTP " +
        response.status +
        "）"
      );
    }

    if (!response.body) {
      throw new Error(
        "RSSの取得に失敗しました。"
      );
    }

    const reader =
      response.body.getReader();

    const chunks =
      [];

    let totalBytes =
      0;

    while (true) {
      const readResult =
        await reader.read();

      if (readResult.done) {
        break;
      }

      totalBytes +=
        readResult.value.byteLength;

      if (
        totalBytes >
        MAX_RESPONSE_BYTES
      ) {
        throw new Error(
          "RSSのデータが大きすぎます。"
        );
      }

      chunks.push(
        readResult.value
      );
    }

    const combinedBuffer =
      Buffer.concat(
        chunks.map(
          function(chunk) {
            return Buffer.from(
              chunk
            );
          }
        )
      );

    return combinedBuffer.toString(
      "utf8"
    );
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}


// Ver1.8 Phase2 STEP6-C｜RSSのdescription/content:encodedはCDATA
// (<![CDATA[...]]>)で囲まれていることが多く、CDATA内部はXML仕様上
// パーサーがエンティティ解釈を行わない領域のため、XMLParserの
// htmlEntitiesオプションだけでは&#160;や&#x1f389;等がデコードされずに
// 残ってしまう(実データで確認済み)。ここでは数値文字参照(10進・16進)
// のみを対象に、抽出済みのプレーンテキストへ直接デコードを適用する。
// 名前付きエンティティ(&amp;や&lt;等)はfast-xml-parserが既に解決済みの
// はずなのでここでは扱わない。stripHtmlTags()より前に実行することで、
// "&#60;script&#62;"のようなタグの数値文字参照エンコードがあっても
// デコード後にHTMLタグ除去の対象として正しく拾われる(タグの復活には
// つながらない)。
function decodeNumericCharacterReferences(
  text
) {
  return String(
    text ?? ""
  )
    .replace(
      /&#x([0-9a-fA-F]+);/g,
      function(matchedText, hexDigits) {
        try {
          return String.fromCodePoint(
            parseInt(hexDigits, 16)
          );
        } catch (decodeError) {
          return matchedText;
        }
      }
    )
    .replace(
      /&#([0-9]+);/g,
      function(matchedText, decimalDigits) {
        try {
          return String.fromCodePoint(
            parseInt(decimalDigits, 10)
          );
        } catch (decodeError) {
          return matchedText;
        }
      }
    );
}


function stripHtmlTags(
  text
) {
  return String(
    text ?? ""
  ).replace(
    /<[^>]*>/g,
    ""
  );
}


function normalizeWhitespace(
  text
) {
  return text
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function truncateText(
  text,
  maxLength
) {
  if (
    text.length <=
    maxLength
  ) {
    return text;
  }

  return (
    text.slice(
      0,
      maxLength
    ) + "…"
  );
}


// Ver1.8 Phase2 STEP6-C｜WordPressの全文フィードが自動付与する
// "The post [記事タイトル] first appeared on [サイト名]." という定型文を除去する。
// 記事タイトル・サイト名が変わっても対応できるよう、末尾の固定パターンのみを
// 対象とする(本文中の一般的な英文を誤って削除しないよう、文字列の最後尾に
// 限定するため$アンカーを使う。normalizeWhitespace後の1スペース区切り
// テキストに対して適用する前提)。
function stripWordpressAutoExcerptFooter(
  text
) {
  return text.replace(
    /\s*The post .+? first appeared on .+?\.$/,
    ""
  );
}


function cleanText(
  rawValue,
  maxLength
) {
  return truncateText(
    stripWordpressAutoExcerptFooter(
      normalizeWhitespace(
        stripHtmlTags(
          decodeNumericCharacterReferences(
            rawValue
          )
        )
      )
    ),
    maxLength
  );
}


function extractText(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    return String(
      value
    );
  }

  if (
    typeof value === "object" &&
    typeof value["#text"] === "string"
  ) {
    return value["#text"];
  }

  return "";
}


function extractAtomLink(
  entry
) {
  if (!entry.link) {
    return "";
  }

  if (
    Array.isArray(
      entry.link
    )
  ) {
    const firstLinkWithHref =
      entry.link.find(
        function(linkItem) {
          return (
            linkItem &&
            typeof linkItem === "object" &&
            typeof linkItem["@_href"] === "string"
          );
        }
      );

    if (firstLinkWithHref) {
      return firstLinkWithHref[
        "@_href"
      ];
    }

    const firstStringLink =
      entry.link.find(
        function(linkItem) {
          return (
            typeof linkItem === "string"
          );
        }
      );

    return firstStringLink || "";
  }

  if (
    typeof entry.link === "object" &&
    typeof entry.link["@_href"] === "string"
  ) {
    return entry.link[
      "@_href"
    ];
  }

  if (
    typeof entry.link === "string"
  ) {
    return entry.link;
  }

  return "";
}


function parseFeedXml(
  xmlText
) {
  const parser =
    new XMLParser(
      {
        ignoreAttributes:
          false,

        attributeNamePrefix:
          "@_",

        textNodeName:
          "#text",

        // Ver1.8 Phase2 STEP6-C｜RSS本文中の数値文字参照(&#160;や&#x1f389;等)を
        // 読める文字へ戻す。fast-xml-parserの既存オプションを有効化するだけで、
        // <, >, &, ", 'といったHTML構造上重要な文字は元からこのオプションに
        // 関係なく常に解決される(lastEntities/ampEntityとして別枠処理される
        // ためタグの再構成にはつながらない)。新規ライブラリは追加しない。
        htmlEntities:
          true
      }
    );

  let parsedXml;

  try {
    parsedXml =
      parser.parse(
        xmlText
      );
  } catch (parseError) {
    throw new Error(
      "RSS／Atomの解析に失敗しました。"
    );
  }

  const rawItems =
    [];

  const rssItems =
    parsedXml &&
    parsedXml.rss &&
    parsedXml.rss.channel &&
    parsedXml.rss.channel.item;

  if (rssItems) {
    const itemArray =
      Array.isArray(
        rssItems
      )
        ? rssItems
        : [rssItems];

    itemArray.forEach(
      function(item) {
        rawItems.push(
          {
            title:
              extractText(
                item.title
              ),

            link:
              extractText(
                item.link
              ),

            publishedAt:
              extractText(
                item.pubDate
              ),

            summary:
              extractText(
                item.description ||
                item["content:encoded"]
              )
          }
        );
      }
    );
  }

  const atomEntries =
    parsedXml &&
    parsedXml.feed &&
    parsedXml.feed.entry;

  if (atomEntries) {
    const entryArray =
      Array.isArray(
        atomEntries
      )
        ? atomEntries
        : [atomEntries];

    entryArray.forEach(
      function(entry) {
        rawItems.push(
          {
            title:
              extractText(
                entry.title
              ),

            link:
              extractAtomLink(
                entry
              ),

            publishedAt:
              extractText(
                entry.published ||
                entry.updated
              ),

            summary:
              extractText(
                entry.summary ||
                entry.content
              )
          }
        );
      }
    );
  }

  if (rawItems.length === 0) {
    throw new Error(
      "RSS／Atom形式のデータを認識できませんでした。"
    );
  }

  return rawItems
    .slice(
      0,
      MAX_CANDIDATE_COUNT
    )
    .map(
      function(rawItem) {
        return {
          title:
            cleanText(
              rawItem.title,
              MAX_TITLE_LENGTH
            ),

          link:
            String(
              rawItem.link || ""
            )
              .trim(),

          publishedAt:
            String(
              rawItem.publishedAt || ""
            )
              .trim(),

          summary:
            cleanText(
              rawItem.summary,
              MAX_SUMMARY_LENGTH
            )
        };
      }
    );
}


function createCollectionError(
  statusCode,
  message
) {
  const collectionError =
    new Error(
      message
    );

  collectionError.statusCode =
    statusCode;

  return collectionError;
}


// ============================================================
// Ver1.8 Phase2 STEP6-W (Phase A)｜構造化ページからの事実自動取得
// ============================================================
// RSSのsummary/content:encodedが空の候補について、記事自身の公式ページURL
// (candidateItem.link)を安全に取得し、既知のサイト構造(アダプター)に一致する
// 場合のみ、機械的に事実(開催日・時間・場所・主催・問い合わせ等)を抽出する。
// AIは一切使わない(Phase Aの明示的な制約)。対応アダプターが無いサイトは
// 何もせず、既存の空summaryのまま返す(安全側フォールバック、既存動作を壊さない)。
// この処理はsummaryフィールド自体を書き換えない。judgeArticleForAutoPost()の
// 鮮度・関連度判定、自動投稿(runAutoPostForDiscoveredArticles())の対象可否には
// 一切影響しない(この事実補強だけを理由に自動公開が増えることを防ぐため、
// 意図的に分離している)。呼び出し箇所も手動の個別「情報を集める」
// (documentId指定の単一情報源collect)のみに限定し、cron・locationCollectの
// 定期実行では実行しない(itemsフィールド自体を使わないため、無駄なHTTP
// リクエストを増やさない)。


// 本部町観光協会 event_info の<dl><dt>ラベル</dt><dd>値</dd></dl>構造で使われる
// 既知のラベルだけを対象にする。未知のラベルは無視する(安全側、推測しない)。
const MOTOBU_EVENT_INFO_FIELD_LABEL_MAP = {
  "開催日": "eventDate",
  "開場/開始時間": "eventTime",
  "開催時間": "eventTime",
  "開催場所": "eventLocation",
  "料金": "price",
  "参加費": "price",
  "予約": "reservation",
  "主催": "organizer",
  "お問合せ": "contact",
  "お問い合わせ": "contact"
};

// motobu-ka.com/event_info/配下の記事ページから<dl>構造を抽出する。
// 値はHTML本文からそのまま切り出すだけで、要約・言い換え・推測は一切行わない。
// <dl>構造自体が見つからない、または既知ラベルが1つも無い場合はnullを返す
// (推測で埋めない、呼び出し側が安全にフォールバックできるようにする)。
function extractMotobuEventInfoFacts(html) {
  const entryMatch =
    html.match(
      /<div class="entry[^"]*"[\s\S]*?<dl>([\s\S]*?)<\/dl>/
    );

  if (!entryMatch) {
    return null;
  }

  const dlContent =
    entryMatch[1];

  const dtDdPattern =
    /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;

  const facts =
    {};

  let match;

  while (
    (match = dtDdPattern.exec(dlContent)) !==
    null
  ) {
    const label =
      decodeNumericCharacterReferences(
        stripHtmlTags(match[1])
      ).trim();

    const value =
      decodeNumericCharacterReferences(
        stripHtmlTags(match[2])
      ).trim();

    const mappedKey =
      MOTOBU_EVENT_INFO_FIELD_LABEL_MAP[label];

    if (mappedKey && value !== "") {
      facts[mappedKey] = value;
    }
  }

  if (Object.keys(facts).length === 0) {
    return null;
  }

  return facts;
}


// 対応済みサイトの一覧。新しいサイトへ対応する場合はここへアダプターを
// 追加するだけでよく、収集本体(collectFromSource等)へは手を入れない設計。
const STRUCTURED_ARTICLE_ADAPTERS = [
  {
    matches: function(parsedUrl) {
      return (
        parsedUrl.hostname === "www.motobu-ka.com" &&
        parsedUrl.pathname.indexOf("/event_info/") === 0
      );
    },

    extract: extractMotobuEventInfoFacts
  }
];

// サイトのホスト名・パスから対応するアダプターを選ぶ。未対応サイトはnullを返し、
// 呼び出し側は安全に「何もしない」へフォールバックする。
function selectStructuredArticleAdapter(articleUrl) {
  let parsedUrl;

  try {
    parsedUrl =
      new URL(
        articleUrl
      );
  } catch (parseError) {
    return null;
  }

  return (
    STRUCTURED_ARTICLE_ADAPTERS.find(
      function(adapter) {
        return adapter.matches(
          parsedUrl
        );
      }
    ) ||
    null
  );
}


// 構造化事実から、AIを使わず決定的ロジックで300字以内の下書き素材を組み立てる。
// 優先順位: 開催日→場所→料金→予約→時間→主催→問い合わせ。単純な先頭300文字
// 切り詰めではなく、フィールド単位で「300字に収まるものだけ」を優先順位順に
// 採用する(重要事実の途中で切れることを防ぐ)。取得できなかった項目は出力に
// 含めない(推測で埋めない)。
const STRUCTURED_CONTENT_DRAFT_MAX_LENGTH = 300;

const STRUCTURED_FACT_FIELD_ORDER = [
  { key: "eventDate", label: "開催日" },
  { key: "eventLocation", label: "場所" },
  { key: "price", label: "料金" },
  { key: "reservation", label: "予約" },
  { key: "eventTime", label: "時間" },
  { key: "organizer", label: "主催" },
  { key: "contact", label: "問い合わせ" }
];

function buildStructuredFactsContentDraft(facts) {
  const includedLines =
    [];

  let usedLength =
    0;

  STRUCTURED_FACT_FIELD_ORDER.forEach(
    function(field) {
      const value =
        facts[field.key];

      if (
        typeof value !== "string" ||
        value === ""
      ) {
        return;
      }

      const line =
        field.label + "：" + value;

      const separatorLength =
        includedLines.length > 0 ? 1 : 0;

      if (
        usedLength + separatorLength + line.length >
        STRUCTURED_CONTENT_DRAFT_MAX_LENGTH
      ) {
        return;
      }

      includedLines.push(
        line
      );

      usedLength +=
        separatorLength + line.length;
    }
  );

  return includedLines.join(
    "\n"
  );
}


// ============================================================
// Ver1.8 Phase2 STEP6-AC (Phase B)｜非構造化ページのAI事実抽出
// ============================================================
// Phase A(構造化アダプター)が使えないサイトについて、AIを最大1回だけ使い、
// 公式ページ本文から事実を抽出する。AIの出力はそのまま信用せず、必ず
// 正規化した本文へ実在するかをコード側で検証してから採用する(本文に無い
// 値は黙ってnullへ落とす)。1回の手動収集あたりのAI呼び出しは
// AI_FACT_EXTRACTION_MAX_PER_COLLECTION_RUN件までに制限する(コスト安全弁)。
// area/source/URLはAIの出力対象に一切含めない(既存データをそのまま使う)。
// 呼び出し箇所はPhase Aと同じく手動の個別「情報を集める」ハンドラのみ。

const AI_FACT_EXTRACTION_MODEL =
  process.env.AI_FACT_EXTRACTION_MODEL ||
  "gpt-4o-mini";

const AI_FACT_EXTRACTION_ENDPOINT =
  "https://api.openai.com/v1/chat/completions";

const AI_FACT_EXTRACTION_TIMEOUT_MS =
  6000;

const AI_FACT_EXTRACTION_MAX_INPUT_LENGTH =
  2000;

const AI_FACT_EXTRACTION_MAX_PER_COLLECTION_RUN =
  3;

const AI_FACT_EXTRACTION_MIN_PAGE_TEXT_LENGTH =
  50;

const AI_FACT_EXTRACTION_MAX_ARTICLE_AGE_DAYS =
  365;

const AI_FACT_EXTRACTION_FIELD_KEYS = [
  "eventDateOrPeriod",
  "time",
  "location",
  "price",
  "reservation",
  "organizer",
  "contact",
  "actionableDetails"
];

const AI_EXTRACTED_FACTS_FIELD_ORDER = [
  { key: "eventDateOrPeriod", label: "開催日・期間" },
  { key: "location", label: "場所" },
  { key: "price", label: "料金" },
  { key: "reservation", label: "予約" },
  { key: "time", label: "時間" },
  { key: "actionableDetails", label: "詳細" },
  { key: "organizer", label: "主催" },
  { key: "contact", label: "問い合わせ" }
];


// script/style除去→既存のタグ除去・数値文字参照デコード・空白正規化
// (いずれもRSS処理と同じ既存関数を再利用)→最大文字数で切り詰め。
// 公式ページ全HTMLはAIへ送らない。
function buildAiFactExtractionInputText(html) {
  const withoutScriptsAndStyles =
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const plainText =
    normalizeWhitespace(
      stripHtmlTags(
        decodeNumericCharacterReferences(
          withoutScriptsAndStyles
        )
      )
    );

  return truncateText(
    plainText,
    AI_FACT_EXTRACTION_MAX_INPUT_LENGTH
  );
}


// 本文実在チェック専用の正規化(表記揺れ吸収のみが目的で、内容の言い換えは
// 一切行わない)。全角/半角(NFKC)・波ダッシュ・ハイフン類・空白の違いだけを
// 吸収する。
function normalizeTextForFactVerification(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[〜～]/g, "~")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}


function buildAiFactExtractionPrompt(pageText) {
  const systemInstruction =
    "You are a strict fact-extraction tool, not a writer. You will be " +
    "given the plain text of an official Japanese web page. Extract ONLY " +
    "facts that are explicitly and literally written in the given text. " +
    "Do not use any outside knowledge. Do not paraphrase, translate, " +
    "summarize, or reformat dates/prices into a different style. Every " +
    "non-null field value you return MUST be an exact verbatim substring " +
    "copied from the given text (same characters, same order). If a fact " +
    "is not explicitly stated in the text, return null for that field — " +
    "never guess, infer, or fill in a typical/default value. In " +
    "particular: do NOT write anything meaning 'free'/'no charge' for " +
    "\"price\" unless the text explicitly states there is no fee. Do NOT " +
    "write anything meaning 'no reservation needed' for \"reservation\" " +
    "unless the text explicitly states so. Reply with a single JSON " +
    "object only, with exactly these keys: \"eventDateOrPeriod\" (string " +
    "or null), \"time\" (string or null), \"location\" (string or null), " +
    "\"price\" (string or null), \"reservation\" (string or null), " +
    "\"organizer\" (string or null), \"contact\" (string or null), " +
    "\"actionableDetails\" (string or null, a short verbatim excerpt " +
    "describing what a visitor can concretely do), \"confidence\" " +
    "(\"high\", \"medium\", or \"low\": your own confidence that the " +
    "extracted facts are complete and correctly scoped to a single " +
    "event/notice). No extra text before or after the JSON object.";

  return {
    systemInstruction: systemInstruction,
    userContent: pageText
  };
}


// callOpenAiConcierge()(moderate-submission.js)と同じfetchベースの
// 呼び出し方式(SDK不使用、AbortControllerタイムアウト、response_format
// json_object)を踏襲する。既存関数自体には一切手を入れない。
// エラーにisTransient(一時的失敗)フラグを付け、呼び出し側がFirestore
// キャッシュへ「確定的失敗」として保存すべきでないことを判定できるようにする。
async function callOpenAiFactExtraction(pageText) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError =
      new Error("OPENAI_API_KEY が設定されていません。");

    configError.isMissingApiKey =
      true;

    throw configError;
  }

  const prompt =
    buildAiFactExtractionPrompt(
      pageText
    );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      AI_FACT_EXTRACTION_TIMEOUT_MS
    );

  let response;

  try {
    try {
      response =
        await fetch(
          AI_FACT_EXTRACTION_ENDPOINT,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + apiKey
            },

            body: JSON.stringify({
              model: AI_FACT_EXTRACTION_MODEL,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: prompt.systemInstruction },
                { role: "user", content: prompt.userContent }
              ]
            }),

            signal: controller.signal
          }
        );
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        const timeoutError =
          new Error("AI事実抽出がタイムアウトしました。");

        timeoutError.isTransient =
          true;

        timeoutError.isTimeout =
          true;

        throw timeoutError;
      }

      const networkError =
        new Error("AI事実抽出の呼び出しに失敗しました。");

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

    // Ver1.8 Phase2 STEP6-AC｜5xx/429は一時的な問題の可能性が高い。
    // 4xx(429以外)もAPIキー・アカウント設定等、記事の内容とは無関係な
    // 問題である可能性が高いため、いずれも記事単位ではキャッシュしない
    // (1回の収集あたり最大3件という上限が既にあるため無限リトライにはならない)。
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
      new Error("OpenAI APIの応答形式が不正です。");

    shapeError.isJsonError =
      true;

    shapeError.isTransient =
      true;

    throw shapeError;
  }

  try {
    return JSON.parse(
      messageContent
    );
  } catch (contentParseError) {
    // AIがJSONとして不正な応答を返した場合、モデル側の一時的な不調である
    // 可能性を考慮し、記事単位ではキャッシュしない(次回再試行を許す)。
    const invalidJsonError =
      new Error("AI応答のJSON解析に失敗しました。");

    invalidJsonError.isJsonError =
      true;

    invalidJsonError.isTransient =
      true;

    throw invalidJsonError;
  }
}


// AI出力をそのまま信用しない。null以外の各値が、正規化済み本文中に
// 部分文字列として実在するかを検証し、存在しない値は黙ってnullへ落とす。
// area/source/URLはAIの出力対象に含めていないため、ここでの検証対象にもならない。
function verifyAiExtractedFactsAgainstPageText(rawFacts, pageText) {
  if (
    !rawFacts ||
    typeof rawFacts !== "object"
  ) {
    return null;
  }

  const normalizedPageText =
    normalizeTextForFactVerification(
      pageText
    );

  const verifiedFacts =
    {};

  AI_FACT_EXTRACTION_FIELD_KEYS.forEach(
    function(key) {
      const value =
        rawFacts[key];

      if (
        typeof value !== "string" ||
        value.trim() === ""
      ) {
        return;
      }

      const normalizedValue =
        normalizeTextForFactVerification(
          value
        );

      if (
        normalizedValue !== "" &&
        normalizedPageText.includes(
          normalizedValue
        )
      ) {
        verifiedFacts[key] =
          value.trim();
      }
    }
  );

  const confidenceRaw =
    typeof rawFacts.confidence === "string"
      ? rawFacts.confidence
      : "";

  const confidence =
    ["high", "medium", "low"].includes(confidenceRaw)
      ? confidenceRaw
      : "low";

  if (Object.keys(verifiedFacts).length === 0) {
    return {
      facts: null,
      confidence: confidence
    };
  }

  return {
    facts: verifiedFacts,
    confidence: confidence
  };
}


// Phase Aと同じ決定的ロジック(優先順位順にフィールド単位で採用、単純な
// 先頭スライスはしない)でPhase B用の300字下書き素材を組み立てる。
// 取得できなかった項目は出力に含めない(推測で埋めない)。
function buildAiExtractedFactsContentDraft(facts) {
  const includedLines =
    [];

  let usedLength =
    0;

  AI_EXTRACTED_FACTS_FIELD_ORDER.forEach(
    function(field) {
      const value =
        facts[field.key];

      if (
        typeof value !== "string" ||
        value === ""
      ) {
        return;
      }

      const line =
        field.label + "：" + value;

      const separatorLength =
        includedLines.length > 0 ? 1 : 0;

      if (
        usedLength + separatorLength + line.length >
        STRUCTURED_CONTENT_DRAFT_MAX_LENGTH
      ) {
        return;
      }

      includedLines.push(
        line
      );

      usedLength +=
        separatorLength + line.length;
    }
  );

  return includedLines.join(
    "\n"
  );
}


// Ver1.8 Phase2 STEP6-AC｜安全・災害系キーワードに一致する場合、Phase Bで
// 事実抽出できてもUI上で明確に確認対象だと分かるようにするためのフラグ。
// DRAFT_EMERGENCY_KEYWORDS等はこのファイル内で既存(このファイル下方で定義、
// 関数本体は呼び出し時にしか実行されないためTDZの問題はない)。
function matchesSafetyRelevantKeywords(combinedText) {
  return (
    DRAFT_EMERGENCY_KEYWORDS.some(function(keyword) { return combinedText.includes(keyword); }) ||
    DRAFT_LIFELINE_KEYWORDS.some(function(keyword) { return combinedText.includes(keyword); }) ||
    DRAFT_TRANSPORT_KEYWORDS.some(function(keyword) { return combinedText.includes(keyword); })
  );
}


// adapter不一致の記事についてのみ呼ばれる(summary空・adapter不一致は
// 呼び出し元で確認済み)。Firestoreキャッシュ(sourceId+normalizedUrlHash、
// 既存のcollectFromSource()と同じドキュメントID)を必ず確認し、既にAI抽出
// 済み(成功・確定的失敗いずれも)なら再度AIを呼ばない。1回の手動収集
// あたりの呼び出し件数はrunState.usedCountで管理し、上限に達したら
// 以降は何もせずnullを返す(安全側フォールバック)。
async function enrichCandidateWithAiFactExtraction(
  candidateItem,
  database,
  sourceId,
  runState
) {
  if (
    !database ||
    typeof sourceId !== "string" ||
    sourceId === ""
  ) {
    return null;
  }

  const publishedAtDate =
    new Date(candidateItem.publishedAt || "");

  if (!isNaN(publishedAtDate.getTime())) {
    const ageDays =
      (Date.now() - publishedAtDate.getTime()) / 86400000;

    if (ageDays > AI_FACT_EXTRACTION_MAX_ARTICLE_AGE_DAYS) {
      return null;
    }
  }

  const normalizedUrl =
    normalizeArticleUrl(
      candidateItem.link
    );

  const normalizedUrlHash =
    computeNormalizedUrlHash(
      normalizedUrl
    );

  const articleDocumentId =
    sourceId + "_" + normalizedUrlHash;

  // 同一収集リクエスト内での二重AI呼び出しを防ぐ(念のための追加防御)。
  if (runState.processedArticleIds.has(articleDocumentId)) {
    return null;
  }

  runState.processedArticleIds.add(
    articleDocumentId
  );

  const articleDocumentRef =
    database
      .collection(AI_COLLECTED_ARTICLES_COLLECTION)
      .doc(articleDocumentId);

  let existingSnapshot;

  try {
    existingSnapshot =
      await articleDocumentRef.get();
  } catch (readError) {
    console.error(
      "AI事実抽出キャッシュの読み取りに失敗しました：",
      readError
    );

    return null;
  }

  const existingData =
    existingSnapshot.exists
      ? (existingSnapshot.data() || {})
      : {};

  if (
    existingData.aiFactExtractionAttemptedAt &&
    typeof existingData.aiFactExtractionAttemptedAt.toDate === "function"
  ) {
    if (
      existingData.aiExtractedFacts &&
      typeof existingData.aiExtractedFacts === "object"
    ) {
      const cachedDraft =
        buildAiExtractedFactsContentDraft(
          existingData.aiExtractedFacts
        );

      return {
        structuredFacts: existingData.aiExtractedFacts,
        structuredContentDraft: cachedDraft,
        structuredFactsSource: "aiExtraction",
        structuredFactsConfidence:
          typeof existingData.aiExtractedFactsConfidence === "string"
            ? existingData.aiExtractedFactsConfidence
            : "low",
        structuredFactsSafetyFlag:
          matchesSafetyRelevantKeywords(
            (candidateItem.title || "") + " " + cachedDraft
          )
      };
    }

    // 確定的失敗としてキャッシュ済み(有効な事実0件) → 何もしない。
    return null;
  }

  let html;

  try {
    await assertFeedUrlIsSafe(
      candidateItem.link
    );

    html =
      await fetchFeedContent(
        candidateItem.link
      );
  } catch (fetchError) {
    console.error(
      "AI事実抽出用ページ取得に失敗しました：",
      fetchError
    );

    return null;
  }

  const pageText =
    buildAiFactExtractionInputText(
      html
    );

  if (pageText.length < AI_FACT_EXTRACTION_MIN_PAGE_TEXT_LENGTH) {
    // 本文がほぼ無い(PDF/画像依存等) → AIを呼んでも無駄なので対象外。
    return null;
  }

  // コスト安全弁：判定(usedCount比較)と予約(usedCount+=1)の間にawaitを
  // 挟まないことで、Promise.allによる並行処理下でも上限を超えないようにする。
  if (runState.usedCount >= AI_FACT_EXTRACTION_MAX_PER_COLLECTION_RUN) {
    return null;
  }

  runState.usedCount +=
    1;

  let rawFacts;

  try {
    rawFacts =
      await callOpenAiFactExtraction(
        pageText
      );
  } catch (aiError) {
    console.error(
      "AI事実抽出に失敗しました：",
      aiError
    );

    // isTransient(timeout/HTTPエラー/JSON不正等)はFirestoreへ何も
    // 書き込まない(次回再試行できるようにする)。
    return null;
  }

  const verified =
    verifyAiExtractedFactsAgainstPageText(
      rawFacts,
      pageText
    );

  if (!verified) {
    return null;
  }

  if (!verified.facts) {
    // 確定的失敗：AI応答は正常だが有効な事実が0件 → キャッシュして
    // 次回以降は再AIしない。
    try {
      await articleDocumentRef.set(
        {
          aiFactExtractionAttemptedAt: FieldValue.serverTimestamp(),
          aiExtractedFacts: null,
          aiExtractedFactsConfidence: verified.confidence
        },
        { merge: true }
      );
    } catch (writeError) {
      console.error(
        "AI事実抽出結果(確定的失敗)の保存に失敗しました：",
        writeError
      );
    }

    return null;
  }

  try {
    await articleDocumentRef.set(
      {
        aiFactExtractionAttemptedAt: FieldValue.serverTimestamp(),
        aiExtractedFacts: verified.facts,
        aiExtractedFactsConfidence: verified.confidence
      },
      { merge: true }
    );
  } catch (writeError) {
    console.error(
      "AI事実抽出結果の保存に失敗しました：",
      writeError
    );

    // 保存に失敗しても、今回取得できた結果自体はそのまま返す。
  }

  const contentDraft =
    buildAiExtractedFactsContentDraft(
      verified.facts
    );

  return {
    structuredFacts: verified.facts,
    structuredContentDraft: contentDraft,
    structuredFactsSource: "aiExtraction",
    structuredFactsConfidence: verified.confidence,
    structuredFactsSafetyFlag:
      matchesSafetyRelevantKeywords(
        (candidateItem.title || "") + " " + contentDraft
      )
  };
}


// summaryが空の候補1件について、公式ページ(candidateItem.link)を安全に取得し
// 事実補強を試みる。まずPhase A(構造化アダプター、AI 0回)を試し、対応
// アダプターが無い場合のみPhase B(AI最大1回)へ進む。取得に失敗した、
// 有効な事実が1つも見つからない、のいずれの場合もnullを返し、呼び出し側は
// 既存の空summaryのまま何も変えずに済ませる(安全側フォールバック)。
async function enrichCandidateWithStructuredFacts(
  candidateItem,
  database,
  sourceId,
  aiExtractionRunState
) {
  if (candidateItem.summary !== "") {
    return null;
  }

  const adapter =
    selectStructuredArticleAdapter(
      candidateItem.link
    );

  if (adapter) {
    let html;

    try {
      await assertFeedUrlIsSafe(
        candidateItem.link
      );

      html =
        await fetchFeedContent(
          candidateItem.link
        );
    } catch (fetchError) {
      console.error(
        "構造化事実の取得に失敗しました：",
        fetchError
      );

      return null;
    }

    let facts;

    try {
      facts =
        adapter.extract(
          html
        );
    } catch (extractError) {
      console.error(
        "構造化事実の抽出に失敗しました：",
        extractError
      );

      return null;
    }

    if (!facts) {
      return null;
    }

    const contentDraft =
      buildStructuredFactsContentDraft(
        facts
      );

    return {
      structuredFacts: facts,
      structuredContentDraft: contentDraft,
      structuredFactsSource: "codeAdapter",
      structuredFactsSafetyFlag:
        matchesSafetyRelevantKeywords(
          (candidateItem.title || "") + " " + contentDraft
        )
    };
  }

  return enrichCandidateWithAiFactExtraction(
    candidateItem,
    database,
    sourceId,
    aiExtractionRunState
  );
}


// 手動の個別「情報を集める」(documentId指定)でのみ呼び出す。cron・
// locationCollectはitemsを使わないため対象外(呼び出し箇所を意図的に限定する)。
// 1件の補強が失敗しても他の候補・収集結果全体には影響させない。
async function enrichCandidateItemsWithStructuredFacts(
  items,
  database,
  sourceId
) {
  const aiExtractionRunState =
    {
      usedCount: 0,
      processedArticleIds: new Set()
    };

  return Promise.all(
    items.map(
      async function(item) {
        let enrichment =
          null;

        try {
          enrichment =
            await enrichCandidateWithStructuredFacts(
              item,
              database,
              sourceId,
              aiExtractionRunState
            );
        } catch (enrichmentError) {
          console.error(
            "構造化事実補強エラー：",
            enrichmentError
          );
        }

        if (!enrichment) {
          return item;
        }

        return Object.assign(
          {},
          item,
          enrichment
        );
      }
    )
  );
}


async function collectFromSource(
  database,
  sourceId
) {
  const documentSnapshot =
    await database
      .collection(
        "aiSources"
      )
      .doc(
        sourceId
      )
      .get();

  if (
    !documentSnapshot.exists
  ) {
    throw createCollectionError(
      404,
      "対象の情報源が見つかりませんでした。"
    );
  }

  const sourceData =
    documentSnapshot.data() ||
    {};

  if (
    sourceData.isEnabled !== true
  ) {
    throw createCollectionError(
      400,
      "この情報源は停止中のため情報を集められません。"
    );
  }

  const feedUrl =
    typeof sourceData.feedUrl === "string"
      ? sourceData.feedUrl.trim()
      : "";

  if (feedUrl === "") {
    throw createCollectionError(
      400,
      "この情報源にはRSS URLが登録されていません。"
    );
  }

  try {
    await assertFeedUrlIsSafe(
      feedUrl
    );
  } catch (ssrfError) {
    throw createCollectionError(
      400,
      ssrfError.message
    );
  }

  let feedXmlText;

  try {
    feedXmlText =
      await fetchFeedContent(
        feedUrl
      );
  } catch (fetchError) {
    throw createCollectionError(
      502,
      fetchError.message
    );
  }

  let candidateItems;

  try {
    candidateItems =
      parseFeedXml(
        feedXmlText
      );
  } catch (parseError) {
    throw createCollectionError(
      422,
      parseError.message
    );
  }

  let newItemCount =
    0;

  let existingItemCount =
    0;

  try {
    const articleCollectionReference =
      database.collection(
        AI_COLLECTED_ARTICLES_COLLECTION
      );

    const articleLookupEntries =
      candidateItems.map(
        function(candidateItem) {
          const normalizedUrl =
            normalizeArticleUrl(
              candidateItem.link
            );

          const normalizedUrlHash =
            computeNormalizedUrlHash(
              normalizedUrl
            );

          const articleDocumentId =
            sourceId +
            "_" +
            normalizedUrlHash;

          return {
            candidateItem:
              candidateItem,

            normalizedUrlHash:
              normalizedUrlHash,

            documentRef:
              articleCollectionReference.doc(
                articleDocumentId
              )
          };
        }
      );

    if (articleLookupEntries.length > 0) {
      const existingArticleSnapshots =
        await database.getAll(
          ...articleLookupEntries.map(
            function(entry) {
              return entry.documentRef;
            }
          )
        );

      const articleWriteBatch =
        database.batch();

      articleLookupEntries.forEach(
        function(entry, entryIndex) {
          const existingSnapshot =
            existingArticleSnapshots[
              entryIndex
            ];

          if (
            existingSnapshot &&
            existingSnapshot.exists
          ) {
            existingItemCount +=
              1;

            const existingData =
              existingSnapshot.data() ||
              {};

            const existingSummary =
              typeof existingData.summary === "string"
                ? existingData.summary.trim()
                : "";

            const candidateSummary =
              typeof entry.candidateItem.summary === "string"
                ? entry.candidateItem.summary.trim()
                : "";

            const shouldBackfillSummary =
              existingSummary === "" &&
              candidateSummary !== "";

            const updateFields =
              {
                lastSeenAt:
                  FieldValue.serverTimestamp()
              };

            if (shouldBackfillSummary) {
              updateFields.summary =
                entry.candidateItem.summary;

              const wasSkippedForMissingSummary =
                existingData.processingStatus === PROCESSING_STATUS_SKIPPED &&
                existingData.processingError === SUMMARY_MISSING_SKIP_REASON;

              if (wasSkippedForMissingSummary) {
                updateFields.processingStatus =
                  PROCESSING_STATUS_DISCOVERED;

                updateFields.processingError =
                  "";
              }
            }

            articleWriteBatch.update(
              entry.documentRef,
              updateFields
            );
          } else {
            newItemCount +=
              1;

            articleWriteBatch.set(
              entry.documentRef,
              {
                sourceId:
                  sourceId,

                articleUrl:
                  entry.candidateItem.link,

                normalizedUrlHash:
                  entry.normalizedUrlHash,

                title:
                  entry.candidateItem.title,

                publishedAt:
                  entry.candidateItem.publishedAt,

                summary:
                  entry.candidateItem.summary,

                firstSeenAt:
                  FieldValue.serverTimestamp(),

                lastSeenAt:
                  FieldValue.serverTimestamp(),

                processingStatus:
                  PROCESSING_STATUS_DISCOVERED,

                processingError:
                  ""
              }
            );
          }
        }
      );

      await articleWriteBatch.commit();
    }
  } catch (articleRecordError) {
    console.error(
      "既読記事の記録エラー：",
      articleRecordError
    );
  }

  const sourceName =
    typeof sourceData.name === "string"
      ? sourceData.name
      : "";

  const items =
    candidateItems.map(
      function(candidateItem) {
        return {
          title:
            candidateItem.title,

          link:
            candidateItem.link,

          publishedAt:
            candidateItem.publishedAt,

          summary:
            candidateItem.summary,

          sourceName:
            sourceName
        };
      }
    );

  return {
    sourceName:
      sourceName,

    items:
      items,

    newItemCount:
      newItemCount,

    existingItemCount:
      existingItemCount
  };
}


function sourceMatchesPriorityTier(
  priority,
  priorityTier
) {
  if (
    typeof priority !== "number"
  ) {
    return false;
  }

  if (
    priorityTier === PRIORITY_TIER_IMPORTANT
  ) {
    return priority >= 4;
  }

  if (
    priorityTier === PRIORITY_TIER_NORMAL
  ) {
    return priority <= 3;
  }

  return false;
}


// RSS URLを持たない情報源はcronのローテーション枠(MAX_SOURCES_PER_CRON_RUN)を
// 無駄に消費するため、cron収集の候補選定時のみ除外する。
// 手動収集(collectFromSource経由)には影響しない。
// isEnabled/feedUrl自体の書き換えは行わない(候補から外すだけ)。
function sourceHasUsableFeedUrl(
  sourceData
) {
  return (
    typeof sourceData.feedUrl === "string" &&
    sourceData.feedUrl.trim() !== ""
  );
}


// targetAreaが未指定(undefined/null/空文字/trim後空文字)なら常にtrueを返し、
// 従来通り地域による絞り込みを行わない。指定時のみ aiSources.area との
// trim済み完全一致で判定する(部分一致・あいまい一致・正規化は行わない)。
function sourceMatchesTargetArea(
  sourceData,
  targetArea
) {
  const trimmedTargetArea =
    typeof targetArea === "string"
      ? targetArea.trim()
      : "";

  if (trimmedTargetArea === "") {
    return true;
  }

  return (
    typeof sourceData.area === "string" &&
    sourceData.area.trim() === trimmedTargetArea
  );
}


// 位置情報起点収集(mode:"locationCollect")専用のclaim/クールダウン設定。
// collectionClaimedAt: 収集を試みた瞬間に更新する短期ロック(同時多重
// リクエスト対策)。collectionSucceededAt: 収集が成功した後だけ更新する
// 長期クールダウン(RSS/Firestoreへの過度なアクセス防止)。失敗時は
// collectionSucceededAtを更新しないため、短期ロックが切れ次第すぐに
// 再試行できる(claimDiscoveredArticle()のstale再クレームと同じ考え方)。
const SOURCE_COLLECTION_CLAIM_LOCK_MILLISECONDS =
  2 * 60 * 1000;

const SOURCE_COLLECTION_SUCCESS_COOLDOWN_MILLISECONDS =
  15 * 60 * 1000;


// claimDiscoveredArticle()と同じ考え方で、Firestore transactionにより
// 同じ情報源への同時リクエストのうち最初の1つだけがcollectionClaimedAtを
// 更新して収集権を取得する。collectionSucceededAtが長期クールダウン内なら
// そもそも収集不要のためfalseを返す。
async function claimSourceForLocationCollection(
  database,
  sourceId
) {
  const sourceRef =
    database
      .collection(
        "aiSources"
      )
      .doc(
        sourceId
      );

  return database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(
          sourceRef
        );

      if (!snapshot.exists) {
        return false;
      }

      const data =
        snapshot.data() ||
        {};

      const nowMilliseconds =
        Date.now();

      const succeededAtMillis =
        data.collectionSucceededAt &&
        typeof data.collectionSucceededAt.toMillis === "function"
          ? data.collectionSucceededAt.toMillis()
          : null;

      if (
        succeededAtMillis !== null &&
        (
          nowMilliseconds -
          succeededAtMillis
        ) < SOURCE_COLLECTION_SUCCESS_COOLDOWN_MILLISECONDS
      ) {
        return false;
      }

      const claimedAtMillis =
        data.collectionClaimedAt &&
        typeof data.collectionClaimedAt.toMillis === "function"
          ? data.collectionClaimedAt.toMillis()
          : null;

      if (
        claimedAtMillis !== null &&
        (
          nowMilliseconds -
          claimedAtMillis
        ) < SOURCE_COLLECTION_CLAIM_LOCK_MILLISECONDS
      ) {
        return false;
      }

      transaction.update(
        sourceRef,
        {
          collectionClaimedAt:
            FieldValue.serverTimestamp()
        }
      );

      return true;
    }
  );
}


// 収集(collectFromSource())が例外を投げずに完了した場合だけ呼ぶ。
// 失敗時はここを呼ばないため、collectionSucceededAtは更新されず、
// 短期ロック(collectionClaimedAt)が切れ次第すぐに再試行可能になる。
async function markSourceCollectionSucceeded(
  database,
  sourceId
) {
  await database
    .collection(
      "aiSources"
    )
    .doc(
      sourceId
    )
    .update(
      {
        collectionSucceededAt:
          FieldValue.serverTimestamp()
      }
    );
}


// 41市町村名 → 旅行者目線の広域グループ名の対応表。記事単位area判定専用の
// OKINAWA_MUNICIPALITY_NAMES(変更禁止)とは完全に独立した別の定数であり、
// locationCollectの収集対象を広げる目的だけに使う。41市町村すべてを
// いずれか1つの広域グループへ割り当てる(非対応は作らない)。
const OKINAWA_MUNICIPALITY_TO_REGION_NAME = {
  // 沖縄本島南部
  "那覇市": "沖縄本島南部",
  "糸満市": "沖縄本島南部",
  "豊見城市": "沖縄本島南部",
  "南城市": "沖縄本島南部",
  "与那原町": "沖縄本島南部",
  "南風原町": "沖縄本島南部",
  "八重瀬町": "沖縄本島南部",

  // 沖縄本島中部
  "宜野湾市": "沖縄本島中部",
  "浦添市": "沖縄本島中部",
  "沖縄市": "沖縄本島中部",
  "うるま市": "沖縄本島中部",
  "嘉手納町": "沖縄本島中部",
  "北谷町": "沖縄本島中部",
  "西原町": "沖縄本島中部",
  "読谷村": "沖縄本島中部",
  "北中城村": "沖縄本島中部",
  "中城村": "沖縄本島中部",

  // 沖縄本島北部
  "名護市": "沖縄本島北部",
  "本部町": "沖縄本島北部",
  "金武町": "沖縄本島北部",
  "国頭村": "沖縄本島北部",
  "大宜味村": "沖縄本島北部",
  "東村": "沖縄本島北部",
  "今帰仁村": "沖縄本島北部",
  "恩納村": "沖縄本島北部",
  "宜野座村": "沖縄本島北部",
  "伊江村": "沖縄本島北部",

  // 慶良間
  "渡嘉敷村": "慶良間",
  "座間味村": "慶良間",

  // 久米島
  "久米島町": "久米島",

  // 宮古
  "宮古島市": "宮古",
  "多良間村": "宮古",

  // 八重山
  "石垣市": "八重山",
  "竹富町": "八重山",
  "与那国町": "八重山",

  // その他離島
  "粟国村": "その他離島",
  "渡名喜村": "その他離島",
  "南大東村": "その他離島",
  "北大東村": "その他離島",
  "伊平屋村": "その他離島",
  "伊是名村": "その他離島"
};


// locationCollect専用。app.js側のAI_AUTO_POST_WIDE_AREA_NAME("沖縄県全域")と
// 同じ文字列だが、ファイルが独立しているため別定数として持つ。
const PREFECTURE_WIDE_AREA_NAME =
  "沖縄県全域";


// targetArea(市町村)から、収集候補となるarea値を
// [市町村, 広域グループ(該当すれば), 沖縄県全域] の順で重複なく返す。
function resolveCandidateAreaValuesForLocationTrigger(
  targetArea
) {
  const candidateAreaValues =
    [
      targetArea
    ];

  const regionName =
    OKINAWA_MUNICIPALITY_TO_REGION_NAME[
      targetArea
    ];

  if (
    typeof regionName === "string" &&
    !candidateAreaValues.includes(
      regionName
    )
  ) {
    candidateAreaValues.push(
      regionName
    );
  }

  if (
    !candidateAreaValues.includes(
      PREFECTURE_WIDE_AREA_NAME
    )
  ) {
    candidateAreaValues.push(
      PREFECTURE_WIDE_AREA_NAME
    );
  }

  return candidateAreaValues;
}


// 指定したarea値のいずれかにisEnabled==trueで完全一致する情報源を、
// area値ごとに独立したwhere("area","==",X)クエリ(Phase1で本番実証済みの
// クエリ形状)で取得し、sourceIdの重複を除いて返す。where("area","in",...)
// は使わない(Firestore複合インデックスの新規作成を避けるため)。
async function findEnabledSourcesMatchingAreaValues(
  database,
  areaValues
) {
  const matchedSourcesById =
    new Map();

  for (
    let areaIndex = 0;
    areaIndex < areaValues.length;
    areaIndex += 1
  ) {
    const areaValue =
      areaValues[
        areaIndex
      ];

    const sourcesSnapshot =
      await database
        .collection(
          "aiSources"
        )
        .where(
          "isEnabled",
          "==",
          true
        )
        .where(
          "area",
          "==",
          areaValue
        )
        .get();

    sourcesSnapshot.docs.forEach(
      function(sourceDocumentSnapshot) {
        if (
          !matchedSourcesById.has(
            sourceDocumentSnapshot.id
          )
        ) {
          matchedSourcesById.set(
            sourceDocumentSnapshot.id,
            sourceDocumentSnapshot
          );
        }
      }
    );
  }

  return Array.from(
    matchedSourcesById.values()
  );
}


// mode:"locationCollect"専用。targetArea(市町村)・対応する広域グループ・
// 沖縄県全域の3階層を常に収集候補にする。claimSourceForLocationCollection()
// の2分ロック・15分クールダウンにより、実際のRSSアクセスは情報源単位で
// 抑制される(候補に含めること自体はRSSアクセスを意味しない)。
async function collectFromSourcesForLocationTrigger(
  database,
  targetArea
) {
  const candidateAreaValues =
    resolveCandidateAreaValuesForLocationTrigger(
      targetArea
    );

  const matchedSourceDocuments =
    await findEnabledSourcesMatchingAreaValues(
      database,
      candidateAreaValues
    );

  const results =
    [];

  for (
    let sourceIndex = 0;
    sourceIndex < matchedSourceDocuments.length;
    sourceIndex += 1
  ) {
    const sourceDocumentSnapshot =
      matchedSourceDocuments[
        sourceIndex
      ];

    const sourceId =
      sourceDocumentSnapshot.id;

    const sourceData =
      sourceDocumentSnapshot.data() ||
      {};

    const sourceName =
      typeof sourceData.name === "string"
        ? sourceData.name
        : "";

    if (
      !sourceHasUsableFeedUrl(
        sourceData
      )
    ) {
      results.push(
        {
          sourceId: sourceId,
          sourceName: sourceName,
          claimed: false,
          reason: "feedUrl未設定"
        }
      );

      continue;
    }

    const claimed =
      await claimSourceForLocationCollection(
        database,
        sourceId
      );

    if (!claimed) {
      results.push(
        {
          sourceId: sourceId,
          sourceName: sourceName,
          claimed: false,
          reason: "クールダウン中"
        }
      );

      continue;
    }

    try {
      const collectionResult =
        await collectFromSource(
          database,
          sourceId
        );

      await markSourceCollectionSucceeded(
        database,
        sourceId
      );

      results.push(
        {
          sourceId: sourceId,
          sourceName: collectionResult.sourceName,
          claimed: true,
          success: true,
          newItemCount: collectionResult.newItemCount,
          existingItemCount: collectionResult.existingItemCount
        }
      );
    } catch (collectionError) {
      results.push(
        {
          sourceId: sourceId,
          sourceName: sourceName,
          claimed: true,
          success: false,
          message: collectionError.message
        }
      );
    }
  }

  return results;
}


const IMPORTANT_SLOT_INTERVAL_MILLISECONDS =
  15 * 60 * 1000;

const NORMAL_SLOT_INTERVAL_MILLISECONDS =
  60 * 60 * 1000;


function computeCronSlotNumber(
  priorityTier,
  nowMilliseconds
) {
  const slotIntervalMilliseconds =
    priorityTier === PRIORITY_TIER_IMPORTANT
      ? IMPORTANT_SLOT_INTERVAL_MILLISECONDS
      : NORMAL_SLOT_INTERVAL_MILLISECONDS;

  return Math.floor(
    nowMilliseconds /
    slotIntervalMilliseconds
  );
}


function sortSourceDocumentsById(
  sourceDocuments
) {
  return sourceDocuments
    .slice()
    .sort(
      function(documentA, documentB) {
        if (documentA.id < documentB.id) {
          return -1;
        }

        if (documentA.id > documentB.id) {
          return 1;
        }

        return 0;
      }
    );
}


function selectRotationBatch(
  sortedSourceDocuments,
  maxBatchSize,
  slotNumber
) {
  const totalCount =
    sortedSourceDocuments.length;

  if (totalCount === 0) {
    return [];
  }

  const batchCount =
    Math.ceil(
      totalCount /
      maxBatchSize
    );

  const batchIndex =
    slotNumber %
    batchCount;

  const startIndex =
    batchIndex *
    maxBatchSize;

  return sortedSourceDocuments.slice(
    startIndex,
    startIndex +
    maxBatchSize
  );
}


async function collectFromPriorityTier(
  database,
  priorityTier,
  targetArea
) {
  const sourcesSnapshot =
    await database
      .collection(
        "aiSources"
      )
      .where(
        "isEnabled",
        "==",
        true
      )
      .get();

  const matchingSourceDocuments =
    sourcesSnapshot.docs
      .filter(
        function(documentSnapshot) {
          const sourceData =
            documentSnapshot.data() ||
            {};

          return (
            sourceMatchesPriorityTier(
              sourceData.priority,
              priorityTier
            ) &&
            sourceHasUsableFeedUrl(
              sourceData
            ) &&
            sourceMatchesTargetArea(
              sourceData,
              targetArea
            )
          );
        }
      );

  const sortedSourceDocuments =
    sortSourceDocumentsById(
      matchingSourceDocuments
    );

  const slotNumber =
    computeCronSlotNumber(
      priorityTier,
      Date.now()
    );

  const rotationBatch =
    selectRotationBatch(
      sortedSourceDocuments,
      MAX_SOURCES_PER_CRON_RUN,
      slotNumber
    );

  const results =
    [];

  let nextSourceIndex =
    0;

  async function runCollectionWorker() {
    while (
      nextSourceIndex <
      rotationBatch.length
    ) {
      const currentIndex =
        nextSourceIndex;

      nextSourceIndex +=
        1;

      const sourceDocumentSnapshot =
        rotationBatch[
          currentIndex
        ];

      const sourceId =
        sourceDocumentSnapshot.id;

      const sourceData =
        sourceDocumentSnapshot.data() ||
        {};

      const fallbackSourceName =
        typeof sourceData.name === "string"
          ? sourceData.name
          : "";

      try {
        const collectionResult =
          await collectFromSource(
            database,
            sourceId
          );

        results.push(
          {
            sourceId:
              sourceId,

            sourceName:
              collectionResult.sourceName,

            success:
              true,

            itemCount:
              collectionResult.items.length,

            newItemCount:
              collectionResult.newItemCount,

            existingItemCount:
              collectionResult.existingItemCount
          }
        );
      } catch (sourceError) {
        results.push(
          {
            sourceId:
              sourceId,

            sourceName:
              fallbackSourceName,

            success:
              false,

            message:
              sourceError.message
          }
        );
      }
    }
  }

  const workerCount =
    Math.min(
      CRON_COLLECTION_CONCURRENCY,
      rotationBatch.length
    );

  const workers =
    [];

  for (
    let workerIndex = 0;
    workerIndex < workerCount;
    workerIndex += 1
  ) {
    workers.push(
      runCollectionWorker()
    );
  }

  await Promise.all(
    workers
  );

  const succeededResults =
    results.filter(
      function(result) {
        return result.success === true;
      }
    );

  const succeededCount =
    succeededResults.length;

  const totalItemCount =
    succeededResults.reduce(
      function(sum, result) {
        return sum + result.itemCount;
      },
      0
    );

  const totalNewItemCount =
    succeededResults.reduce(
      function(sum, result) {
        return sum + result.newItemCount;
      },
      0
    );

  const totalExistingItemCount =
    succeededResults.reduce(
      function(sum, result) {
        return sum + result.existingItemCount;
      },
      0
    );

  return {
    processed:
      results.length,

    succeeded:
      succeededCount,

    failed:
      results.length -
      succeededCount,

    results:
      results,

    totalItemCount:
      totalItemCount,

    totalNewItemCount:
      totalNewItemCount,

    totalExistingItemCount:
      totalExistingItemCount
  };
}


async function claimDiscoveredArticle(
  database,
  articleRef
) {
  return database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(
          articleRef
        );

      if (!snapshot.exists) {
        return null;
      }

      const data =
        snapshot.data() ||
        {};

      const isDiscovered =
        data.processingStatus === PROCESSING_STATUS_DISCOVERED;

      const isStaleProcessing =
        data.processingStatus === PROCESSING_STATUS_PROCESSING &&
        data.processingClaimedAt &&
        typeof data.processingClaimedAt.toMillis === "function" &&
        (
          Date.now() -
          data.processingClaimedAt.toMillis()
        ) > PROCESSING_CLAIM_STALE_MILLISECONDS;

      if (!isDiscovered && !isStaleProcessing) {
        return null;
      }

      transaction.update(
        articleRef,
        {
          processingStatus:
            PROCESSING_STATUS_PROCESSING,

          processingClaimedAt:
            FieldValue.serverTimestamp(),

          processingError:
            ""
        }
      );

      return data;
    }
  );
}


async function finalizeArticleProcessing(
  database,
  articleRef,
  finalStatus,
  extraFields
) {
  await database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(
          articleRef
        );

      if (!snapshot.exists) {
        return;
      }

      const data =
        snapshot.data() ||
        {};

      if (
        data.processingStatus !== PROCESSING_STATUS_PROCESSING
      ) {
        return;
      }

      transaction.update(
        articleRef,
        Object.assign(
          {
            processingStatus:
              finalStatus,

            processingUpdatedAt:
              FieldValue.serverTimestamp()
          },
          extraFields || {}
        )
      );
    }
  );
}


const TRAVELER_RELEVANCE_KEYWORDS = [
  "イベント", "祭り", "花火", "観光", "ビーチ", "海",
  "台風", "大雨", "津波", "警報", "熱中症",
  "通行止め", "交通規制", "バス", "ゆいレール", "フェリー",
  "空港", "欠航", "運休", "観光施設", "営業時間",
  "臨時休業", "首里城", "美ら海水族館"
];

const INTERNAL_RELEVANCE_KEYWORDS = [
  "採用", "入札", "公募", "補助金", "納税", "申請書",
  "会議", "委員会", "職員", "事業者向け", "制度", "調達",
  "アンケート", "住宅", "市営住宅", "県営住宅",
  "議会", "議員", "求人", "助成金", "税金",
  "届出", "手続き", "審議会", "子育て", "学校",
  "教育委員会", "選挙"
];

const RELEVANCE_LABELS_BY_SCORE = {
  5: "最重要",
  4: "旅行者向け",
  3: "要確認",
  2: "優先度低",
  1: "行政向け"
};

const RELEVANCE_VISIBLE_MINIMUM_SCORE = 3;

const AUTO_POST_MINIMUM_RELEVANCE_SCORE = 2;


function computeRelevance(
  item
) {
  const combinedText =
    (item.title || "") + " " + (item.summary || "");

  const boostKeywords =
    TRAVELER_RELEVANCE_KEYWORDS.filter(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    );

  // 台風・避難等の強い安全情報(DRAFT_EMERGENCY_KEYWORDS/DRAFT_TRANSPORT_KEYWORDS)を
  // 含む記事は、行政系の除外キーワード(INTERNAL_RELEVANCE_KEYWORDS)が
  // 同時に含まれていても減点しない。「住宅アンケートを消す」ためのキーワード追加が
  // 「台風接近に伴う学校休校」のような安全情報まで巻き込んで除外しないための安全策。
  const hasStrongSafetySignal =
    DRAFT_EMERGENCY_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    ) ||
    DRAFT_TRANSPORT_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    );

  const dropKeywords =
    hasStrongSafetySignal
      ? []
      : INTERNAL_RELEVANCE_KEYWORDS.filter(
          function(keyword) {
            return combinedText.includes(keyword);
          }
        );

  const rawScore =
    2 + boostKeywords.length - dropKeywords.length;

  const relevanceScore =
    Math.min(5, Math.max(1, rawScore));

  const relevanceLabel =
    RELEVANCE_LABELS_BY_SCORE[relevanceScore];

  const reasonParts =
    [];

  if (boostKeywords.length > 0) {
    reasonParts.push(
      "旅行者向け：" + boostKeywords.join("、")
    );
  }

  if (dropKeywords.length > 0) {
    reasonParts.push(
      "優先度低下：" + dropKeywords.join("、")
    );
  }

  const relevanceReason =
    reasonParts.length > 0
      ? reasonParts.join(" / ")
      : "一致する判定キーワードはありません。";

  return {
    relevanceScore: relevanceScore,
    relevanceLabel: relevanceLabel,
    relevanceReason: relevanceReason,
    relevanceBoostKeywords: boostKeywords,
    relevanceDropKeywords: dropKeywords
  };
}


// 沖縄県内41市町村(11市・11町・19村)の正式名称。記事のtitle/summaryから
// 記事単位のareaを判定する目的だけに使う。施設名・路線名等からの変換は
// Ver1では行わない(市町村名の直接一致のみ)。
const OKINAWA_MUNICIPALITY_NAMES = [
  // 市(11)
  "那覇市", "宜野湾市", "石垣市", "浦添市", "名護市",
  "糸満市", "沖縄市", "豊見城市", "うるま市", "宮古島市",
  "南城市",

  // 町(11)
  "与那原町", "南風原町", "久米島町", "八重瀬町", "嘉手納町",
  "北谷町", "西原町", "本部町", "金武町", "竹富町",
  "与那国町",

  // 村(19)
  "渡嘉敷村", "座間味村", "粟国村", "渡名喜村", "南大東村",
  "北大東村", "伊平屋村", "伊是名村", "読谷村", "北中城村",
  "中城村", "国頭村", "大宜味村", "東村", "今帰仁村",
  "恩納村", "宜野座村", "伊江村", "多良間村"
];


// targetTextがcombinedText内に出現する、すべての開始・終了位置を返す。
// 同一市町村名が複数箇所に書かれているケース(例:「北中城村と中城村」の
// 「中城村」が2箇所に出現する)を取りこぼさないよう、重複可能な検索にする。
function findAllOccurrenceRanges(
  combinedText,
  targetText
) {
  const occurrenceRanges =
    [];

  let searchFromIndex =
    0;

  while (true) {
    const foundIndex =
      combinedText.indexOf(
        targetText,
        searchFromIndex
      );

    if (foundIndex === -1) {
      break;
    }

    occurrenceRanges.push(
      {
        start: foundIndex,
        end: foundIndex + targetText.length
      }
    );

    searchFromIndex =
      foundIndex + 1;
  }

  return occurrenceRanges;
}


// 「北中城村」に含まれる「中城村」のように、より長い自治体名の出現範囲に
// 完全に内包されている出現だけを、重複一致から除外するための判定。
// 同じ短い名前でも、長い名前の範囲外に別途出現していれば内包扱いにしない
// (例:「北中城村と中城村」の2つ目の「中城村」は内包されないため生き残る)。
function isOccurrenceContainedByLongerMatch(
  occurrence,
  allOccurrences
) {
  return allOccurrences.some(
    function(otherOccurrence) {
      return (
        otherOccurrence.name.length >
          occurrence.name.length &&
        occurrence.start >=
          otherOccurrence.start &&
        occurrence.end <=
          otherOccurrence.end
      );
    }
  );
}


// title+summaryにOKINAWA_MUNICIPALITY_NAMESがちょうど1つだけ含まれる場合は
// その市町村名を返す。0件または2件以上(曖昧)の場合はsourceAreaをそのまま返し、
// 記事側では推測しない。
// 「北中城村」のように、長い正式自治体名に短い自治体名(「中城村」)が
// 完全に内包される場合は、内包された側を別自治体としては数えない。
// ただし短い名前が長い名前の範囲外に別途出現していれば、別自治体として扱う。
function resolveArticleAreaFromText(
  title,
  summary,
  sourceArea
) {
  const combinedText =
    (title || "") +
    " " +
    (summary || "");

  const allOccurrences =
    [];

  OKINAWA_MUNICIPALITY_NAMES.forEach(
    function(municipalityName) {
      findAllOccurrenceRanges(
        combinedText,
        municipalityName
      ).forEach(
        function(occurrenceRange) {
          allOccurrences.push(
            {
              name: municipalityName,
              start: occurrenceRange.start,
              end: occurrenceRange.end
            }
          );
        }
      );
    }
  );

  const survivingOccurrences =
    allOccurrences.filter(
      function(occurrence) {
        return !isOccurrenceContainedByLongerMatch(
          occurrence,
          allOccurrences
        );
      }
    );

  const matchedMunicipalityNames =
    Array.from(
      new Set(
        survivingOccurrences.map(
          function(occurrence) {
            return occurrence.name;
          }
        )
      )
    );

  if (matchedMunicipalityNames.length === 1) {
    return matchedMunicipalityNames[0];
  }

  return sourceArea;
}


async function judgeArticleForAutoPost(
  database,
  articleData
) {
  const title =
    typeof articleData.title === "string"
      ? articleData.title.trim()
      : "";

  if (title === "") {
    return {
      outcome: "SKIP",
      reason: "タイトルが空のため対象外です。"
    };
  }

  const summary =
    typeof articleData.summary === "string"
      ? articleData.summary.trim()
      : "";

  if (summary === "") {
    return {
      outcome: "SKIP",
      reason: "概要（summary）が保存されていないため対象外です。"
    };
  }

  const articleUrl =
    typeof articleData.articleUrl === "string"
      ? articleData.articleUrl.trim()
      : "";

  if (articleUrl === "") {
    return {
      outcome: "SKIP",
      reason: "記事URLが空のため対象外です。"
    };
  }

  if (
    !articleData.firstSeenAt ||
    typeof articleData.firstSeenAt.toDate !== "function"
  ) {
    return {
      outcome: "SKIP",
      reason: "firstSeenAtが正しく記録されていないため対象外です。"
    };
  }

  const sourceId =
    typeof articleData.sourceId === "string"
      ? articleData.sourceId
      : "";

  if (sourceId === "") {
    return {
      outcome: "SKIP",
      reason: "sourceIdが記録されていないため対象外です。"
    };
  }

  const sourceSnapshot =
    await database
      .collection(
        "aiSources"
      )
      .doc(
        sourceId
      )
      .get();

  const sourceData =
    sourceSnapshot.exists
      ? sourceSnapshot.data() || {}
      : {};

  if (
    !sourceSnapshot.exists ||
    sourceData.isEnabled !== true
  ) {
    return {
      outcome: "SKIP",
      reason: "情報源が無効化されているため対象外です。"
    };
  }

  const sourceArea =
    typeof sourceData.area === "string"
      ? sourceData.area.trim()
      : "";

  const sourceType =
    typeof sourceData.sourceType === "string"
      ? sourceData.sourceType.trim()
      : "";

  const relevanceResult =
    computeRelevance(
      {
        title: title,
        summary: summary
      }
    );

  if (
    relevanceResult.relevanceScore <
    AUTO_POST_MINIMUM_RELEVANCE_SCORE
  ) {
    return {
      outcome: "SKIP",
      reason:
        "旅行者関連度スコアが基準未満です（" +
        relevanceResult.relevanceScore +
        "点）。"
    };
  }

  const combinedText =
    title + " " + summary;

  const freshnessCategory =
    resolveFreshnessCategory(
      combinedText
    );

  // Ver1.8 Phase2 STEP6-C｜EVENT分類は「記事公開日」ではなく
  // 「本文中に書かれた開催日」で鮮度を判定する。開催日を安全に抽出できた
  // 場合はそれを優先し、抽出できない場合のみ保守的な上限日数(公開日基準)へ
  // フォールバックする。未来の開催予定を誤って消さないことを最優先する。
  if (freshnessCategory === "EVENT") {
    const explicitEventEndDate =
      extractLatestExplicitDateFromText(
        combinedText
      );

    if (explicitEventEndDate) {
      const eventGraceMilliseconds =
        24 * 60 * 60 * 1000;

      if (
        Date.now() -
          explicitEventEndDate.getTime() >
        eventGraceMilliseconds
      ) {
        return {
          outcome: "SKIP",
          reason:
            "本文中の開催日(" +
            explicitEventEndDate.toISOString().slice(0, 10) +
            ")が既に終了しているため対象外です。"
        };
      }

      // 開催日が未来、または開催中(猶予1日以内)なので鮮度チェックを通過する。
    } else {
      const publishedAtText =
        typeof articleData.publishedAt === "string"
          ? articleData.publishedAt.trim()
          : "";

      if (publishedAtText !== "") {
        const publishedAtDate =
          new Date(
            publishedAtText
          );

        if (
          !isNaN(
            publishedAtDate.getTime()
          )
        ) {
          const articleAgeMilliseconds =
            Date.now() -
            publishedAtDate.getTime();

          const eventFallbackMaxAgeMilliseconds =
            EVENT_FALLBACK_MAX_AGE_DAYS *
            24 * 60 * 60 * 1000;

          if (
            articleAgeMilliseconds >
            eventFallbackMaxAgeMilliseconds
          ) {
            return {
              outcome: "SKIP",
              reason:
                "開催日を本文から特定できず、公開から" +
                EVENT_FALLBACK_MAX_AGE_DAYS +
                "日以上経過しているため対象外です。"
            };
          }
        }
      }
    }
  } else {
    const freshnessMaxAgeDays =
      FRESHNESS_MAX_AGE_DAYS_BY_CATEGORY[
        freshnessCategory
      ];

    if (
      typeof freshnessMaxAgeDays === "number"
    ) {
      const publishedAtText =
        typeof articleData.publishedAt === "string"
          ? articleData.publishedAt.trim()
          : "";

      if (publishedAtText !== "") {
        const publishedAtDate =
          new Date(
            publishedAtText
          );

        const isPublishedAtValid =
          !isNaN(
            publishedAtDate.getTime()
          );

        if (isPublishedAtValid) {
          const articleAgeMilliseconds =
            Date.now() -
            publishedAtDate.getTime();

          const freshnessMaxAgeMilliseconds =
            freshnessMaxAgeDays *
            24 * 60 * 60 * 1000;

          if (
            articleAgeMilliseconds >
            freshnessMaxAgeMilliseconds
          ) {
            return {
              outcome: "SKIP",
              reason:
                "公開から時間が経過しているため対象外です（" +
                freshnessCategory +
                "、" +
                freshnessMaxAgeDays +
                "日基準）。"
            };
          }
        }
      }
    }
  }

  const articleArea =
    resolveArticleAreaFromText(
      title,
      summary,
      sourceArea
    );

  return {
    outcome: "PROCEED",
    relevanceResult: relevanceResult,
    sourceArea: articleArea,
    sourceType: sourceType
  };
}


const DRAFT_TITLE_SUFFIX_TRIGGER_KEYWORDS = [
  "節水", "断水", "停電",
  "欠航", "運休", "通行止め",
  "警報", "避難"
];

const DRAFT_TITLE_SUFFIX_TEXT = "｜滞在中・渡航予定の方も確認を";

const DRAFT_LIFELINE_KEYWORDS = ["節水", "断水", "停電"];

const DRAFT_TRANSPORT_KEYWORDS = [
  "交通", "通行止め", "交通規制", "欠航", "運休"
];

const DRAFT_EMERGENCY_KEYWORDS = [
  "避難", "警報", "台風", "津波", "大雨", "熱中症"
];

const DRAFT_EVENT_KEYWORDS = ["イベント", "祭り", "花火"];

const DRAFT_SIGHTSEEING_KEYWORDS = [
  "ビーチ", "海", "観光施設", "首里城", "美ら海水族館"
];


// カテゴリー別の自動投稿許容日数(公開からの経過日数)。
// EVENTは記事公開日と開催日が異なるケースがあるため、このマップでは扱わず、
// judgeArticleForAutoPost()内で本文中の明示的な開催日を抽出して個別に判定する
// (Ver1.8 Phase2 STEP6-C)。このマップに存在しないカテゴリーは、
// このマップによる鮮度チェックの対象外になる。
const FRESHNESS_MAX_AGE_DAYS_BY_CATEGORY = {
  EMERGENCY: 2,
  TRANSPORT: 3,
  SIGHTSEEING: 7,
  OTHER: 5
};


// Ver1.8 Phase2 STEP6-C｜EVENT分類記事のみに使う、開催日が本文から
// 特定できない場合の保守的な上限日数。イベント告知は他カテゴリーより
// 早めに公開される傾向があるため、他カテゴリー(2〜7日)よりは長めだが、
// 無期限に候補として残さないための最終防衛ライン。
const EVENT_FALLBACK_MAX_AGE_DAYS = 60;


// Ver1.8 Phase2 STEP6-C｜本文・タイトルから「明示的な年を伴う」日付表記
// (2026年9月10日／令和8年9月10日)だけを安全に抽出する。年が書かれていない
// 「9月10日」「9/10」「毎週日曜日」等は、どの年・どの回を指すか記事だけからは
// 確定できないため、意図的に対象外とする(誤った推測をしないため)。
// 複数の日付が見つかった場合は、開催期間(◯日〜◯日)の終了日を安全側に
// 倒して判定できるよう、最も遅い日付を採用する。
function extractLatestExplicitDateFromText(
  combinedText
) {
  const datePattern =
    /(?:令和(\d{1,2})年|(\d{4})年)(\d{1,2})月(\d{1,2})日/g;

  let match;

  let latestDate =
    null;

  while (
    (match = datePattern.exec(combinedText)) !==
    null
  ) {
    const reiwaYearNumber =
      match[1] !== undefined
        ? Number(match[1])
        : null;

    const westernYearNumber =
      match[2] !== undefined
        ? Number(match[2])
        : null;

    const month =
      Number(match[3]);

    const day =
      Number(match[4]);

    const year =
      reiwaYearNumber !== null
        ? reiwaYearNumber + 2018
        : westernYearNumber;

    if (
      !Number.isFinite(year) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      continue;
    }

    const candidateDate =
      new Date(
        year,
        month - 1,
        day,
        23,
        59,
        59
      );

    if (
      !latestDate ||
      candidateDate.getTime() >
        latestDate.getTime()
    ) {
      latestDate =
        candidateDate;
    }
  }

  return latestDate;
}

function resolveFreshnessCategory(
  combinedText
) {
  const matchesEmergencyKeyword =
    DRAFT_EMERGENCY_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    }) ||
    DRAFT_LIFELINE_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesEmergencyKeyword) {
    return "EMERGENCY";
  }

  const matchesTransportKeyword =
    DRAFT_TRANSPORT_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesTransportKeyword) {
    return "TRANSPORT";
  }

  const matchesEventKeyword =
    DRAFT_EVENT_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesEventKeyword) {
    return "EVENT";
  }

  const matchesSightseeingKeyword =
    DRAFT_SIGHTSEEING_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesSightseeingKeyword) {
    return "SIGHTSEEING";
  }

  return "OTHER";
}


const DRAFT_LIFELINE_NOTE =
  "滞在中・渡航予定の方も、現地での生活に関わる情報として確認しておくと安心です。";

const DRAFT_TRANSPORT_NOTE =
  "移動予定がある方は、利用前に最新情報を確認してください。";

const DRAFT_EMERGENCY_NOTE =
  "滞在中・移動予定の方は、最新の公式情報を確認してください。";

const DRAFT_EVENT_NOTE =
  "滞在中・近くを訪れる予定の方は、開催情報を確認してみてください。";

const DRAFT_OFFICIAL_SOURCE_NOTE =
  "詳しい状況・最新情報は情報元ページをご確認ください。";

const DRAFT_CONTENT_MAX_LENGTH = 300;


function normalizeDraftSummaryText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldAddTravelerTitleSuffix(combinedText) {
  return DRAFT_TITLE_SUFFIX_TRIGGER_KEYWORDS.some(
    function(keyword) {
      return combinedText.includes(keyword);
    }
  );
}

function buildDraftTitleText(baseTitle, combinedText) {
  if (!shouldAddTravelerTitleSuffix(combinedText)) {
    return baseTitle.slice(0, 50);
  }

  return (
    baseTitle + DRAFT_TITLE_SUFFIX_TEXT
  ).slice(0, 50);
}

function resolveDraftCategory(combinedText) {
  const matchesNoticeKeepKeyword =
    DRAFT_LIFELINE_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    }) ||
    DRAFT_TRANSPORT_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    }) ||
    DRAFT_EMERGENCY_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesNoticeKeepKeyword) {
    return "お知らせ";
  }

  const matchesEventKeyword =
    DRAFT_EVENT_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesEventKeyword) {
    return "イベント";
  }

  const matchesSightseeingKeyword =
    DRAFT_SIGHTSEEING_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesSightseeingKeyword) {
    return "観光・体験";
  }

  return "お知らせ";
}

function resolveDraftTravelerNote(combinedText) {
  const matchesEmergencyKeyword =
    DRAFT_EMERGENCY_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesEmergencyKeyword) {
    return DRAFT_EMERGENCY_NOTE;
  }

  const matchesLifelineKeyword =
    DRAFT_LIFELINE_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesLifelineKeyword) {
    return DRAFT_LIFELINE_NOTE;
  }

  const matchesTransportKeyword =
    DRAFT_TRANSPORT_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesTransportKeyword) {
    return DRAFT_TRANSPORT_NOTE;
  }

  const matchesEventKeyword =
    DRAFT_EVENT_KEYWORDS.some(function(keyword) {
      return combinedText.includes(keyword);
    });

  if (matchesEventKeyword) {
    return DRAFT_EVENT_NOTE;
  }

  return "";
}

function buildDraftContentText(article, trimmedSourceUrlValue, combinedText) {
  const travelerNote =
    resolveDraftTravelerNote(combinedText);

  const officialSourceNote =
    trimmedSourceUrlValue !== ""
      ? DRAFT_OFFICIAL_SOURCE_NOTE
      : "";

  const trailingParts =
    [travelerNote, officialSourceNote].filter(
      function(part) {
        return part !== "";
      }
    );

  const trailingText =
    trailingParts.length > 0
      ? "\n\n" + trailingParts.join("\n\n")
      : "";

  const maxSummaryLength =
    Math.max(
      0,
      DRAFT_CONTENT_MAX_LENGTH - trailingText.length
    );

  const normalizedSummary =
    normalizeDraftSummaryText(article.summary);

  const truncatedSummary =
    normalizedSummary.slice(0, maxSummaryLength);

  return (
    truncatedSummary + trailingText
  ).slice(0, DRAFT_CONTENT_MAX_LENGTH);
}


function buildAutoDraftFromArticle(
  articleData,
  sourceArea,
  sourceType
) {
  const title =
    articleData.title.trim();

  const summary =
    articleData.summary.trim();

  const articleUrl =
    typeof articleData.articleUrl === "string"
      ? articleData.articleUrl.trim()
      : "";

  const combinedText =
    title + " " + summary;

  const draftTitle =
    buildDraftTitleText(
      title,
      combinedText
    );

  const draftCategory =
    resolveDraftCategory(
      combinedText
    );

  const draftContent =
    buildDraftContentText(
      { summary: summary },
      articleUrl,
      combinedText
    );

  return {
    title: draftTitle,
    category: draftCategory,
    content: draftContent,
    websiteUrl: articleUrl,
    area:
      typeof sourceArea === "string"
        ? sourceArea
        : "",
    sourceType:
      typeof sourceType === "string"
        ? sourceType
        : ""
  };
}


const AUTO_POST_EXPIRES_AT_MILLISECONDS =
  24 * 60 * 60 * 1000;


async function createAutoPostSubmission(
  database,
  draft
) {
  const expiresAtDate =
    new Date(
      Date.now() +
      AUTO_POST_EXPIRES_AT_MILLISECONDS
    );

  const documentReference =
    await database
      .collection(
        "submissions"
      )
      .add(
        {
          shopName:
            "マチナウ運営",

          title:
            draft.title,

          category:
            draft.category,

          content:
            draft.content,

          address:
            "",

          latitude:
            null,

          longitude:
            null,

          imageUrls:
            [],

          websiteUrl:
            draft.websiteUrl,

          area:
            draft.area,

          expiresAt:
            Timestamp.fromDate(
              expiresAtDate
            ),

          status:
            "approved",

          postType:
            "admin",

          authorType:
            "ai",

          sourceLabel:
            "マチナウ運営より",

          sourceType:
            draft.sourceType,

          createdAt:
            FieldValue.serverTimestamp(),

          updatedAt:
            FieldValue.serverTimestamp()
        }
      );

  return documentReference.id;
}


const MAX_AUTO_POSTS_PER_RUN =
  3;

// orderByなしのFirestoreクエリはドキュメントID順(記事の新しさと無関係)で
// 打ち切られるため、この値は小さすぎると新しいDISCOVERED記事が候補から
// 漏れる(取得後にsortArticleDocumentsByFirstSeenAtDescending()で並べ替えても、
// そもそも取得できていなければ並べ替えでは救えない)。MAX_AUTO_POSTS_PER_RUNの
// 数十倍程度の余裕を持たせ、情報源が増えても当面は取りこぼさない値にする。
const AUTO_POST_CANDIDATE_QUERY_LIMIT =
  500;


function sortArticleDocumentsByFirstSeenAtDescending(
  articleDocuments
) {
  return articleDocuments
    .slice()
    .sort(
      function(documentA, documentB) {
        const dataA =
          documentA.data() ||
          {};

        const dataB =
          documentB.data() ||
          {};

        const millisA =
          dataA.firstSeenAt &&
          typeof dataA.firstSeenAt.toMillis === "function"
            ? dataA.firstSeenAt.toMillis()
            : 0;

        const millisB =
          dataB.firstSeenAt &&
          typeof dataB.firstSeenAt.toMillis === "function"
            ? dataB.firstSeenAt.toMillis()
            : 0;

        return millisB - millisA;
      }
    );
}


async function runAutoPostForDiscoveredArticles(
  database,
  maxProcessedCount
) {
  const candidateSnapshot =
    await database
      .collection(
        AI_COLLECTED_ARTICLES_COLLECTION
      )
      .where(
        "processingStatus",
        "in",
        [
          PROCESSING_STATUS_DISCOVERED,
          PROCESSING_STATUS_PROCESSING
        ]
      )
      .limit(
        AUTO_POST_CANDIDATE_QUERY_LIMIT
      )
      .get();

  const sortedCandidateDocuments =
    sortArticleDocumentsByFirstSeenAtDescending(
      candidateSnapshot.docs
    );

  const outcomes =
    [];

  for (
    let candidateIndex = 0;
    candidateIndex < sortedCandidateDocuments.length;
    candidateIndex += 1
  ) {
    if (
      outcomes.length >=
      maxProcessedCount
    ) {
      break;
    }

    const candidateDocument =
      sortedCandidateDocuments[
        candidateIndex
      ];

    const result =
      await processDiscoveredArticleForAutoPost(
        database,
        candidateDocument.ref
      );

    if (result.outcome !== "NOT_CLAIMED") {
      outcomes.push(
        result
      );
    }
  }

  const postedCount =
    outcomes.filter(
      function(outcome) {
        return outcome.outcome === "POSTED";
      }
    ).length;

  const skippedCount =
    outcomes.filter(
      function(outcome) {
        return outcome.outcome === "SKIPPED";
      }
    ).length;

  const errorCount =
    outcomes.filter(
      function(outcome) {
        return outcome.outcome === "ERROR";
      }
    ).length;

  return {
    attempted:
      outcomes.length,

    posted:
      postedCount,

    skipped:
      skippedCount,

    error:
      errorCount,

    outcomes:
      outcomes
  };
}


async function processDiscoveredArticleForAutoPost(
  database,
  articleRef
) {
  const claimedData =
    await claimDiscoveredArticle(
      database,
      articleRef
    );

  if (!claimedData) {
    return {
      outcome: "NOT_CLAIMED"
    };
  }

  let judgment;

  try {
    judgment =
      await judgeArticleForAutoPost(
        database,
        claimedData
      );
  } catch (judgeError) {
    await finalizeArticleProcessing(
      database,
      articleRef,
      PROCESSING_STATUS_ERROR,
      {
        processingError:
          "判定処理でエラーが発生しました。"
      }
    );

    return {
      outcome: "ERROR",
      message: judgeError.message
    };
  }

  if (judgment.outcome === "SKIP") {
    await finalizeArticleProcessing(
      database,
      articleRef,
      PROCESSING_STATUS_SKIPPED,
      {
        processingError:
          judgment.reason
      }
    );

    return {
      outcome: "SKIPPED",
      reason: judgment.reason
    };
  }

  try {
    const draft =
      buildAutoDraftFromArticle(
        claimedData,
        judgment.sourceArea,
        judgment.sourceType
      );

    const submissionId =
      await createAutoPostSubmission(
        database,
        draft
      );

    await finalizeArticleProcessing(
      database,
      articleRef,
      PROCESSING_STATUS_DONE,
      {
        processingError:
          "",

        postedSubmissionId:
          submissionId
      }
    );

    return {
      outcome: "POSTED",
      submissionId: submissionId
    };
  } catch (postError) {
    await finalizeArticleProcessing(
      database,
      articleRef,
      PROCESSING_STATUS_ERROR,
      {
        processingError:
          "自動投稿処理でエラーが発生しました。"
      }
    );

    return {
      outcome: "ERROR",
      message: postError.message
    };
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

  if (
    request.method !== "POST"
  ) {
    response.setHeader(
      "Allow",
      "POST"
    );

    return response.status(405).json({
      success: false,
      message:
        "POSTのみ利用できます。"
    });
  }

  const cronSecretHeaderValue =
    readCronSecretHeader(
      request
    );

  const isCronRequest =
    cronSecretHeaderValue !== "";

  if (isCronRequest) {
    const expectedCronSecret =
      process.env.AI_COLLECT_CRON_SECRET;

    if (
      !cronSecretsMatch(
        cronSecretHeaderValue,
        expectedCronSecret
      )
    ) {
      return response.status(401).json({
        success: false,
        message:
          "認証情報が正しくありません。"
      });
    }
  }

  const adminEmail =
    process.env.ADMIN_EMAIL;

  let idToken =
    "";

  if (!isCronRequest) {
    if (!adminEmail) {
      return response.status(500).json({
        success: false,
        message:
          "管理者メールアドレスが設定されていません。"
      });
    }

    idToken =
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
  }

  try {
    const app =
      getFirebaseAdminApp();

    const requestBody =
      readRequestBody(
        request
      );

    // mode:"locationCollect"は一般利用者(匿名認証)専用の第3モード。
    // cronリクエストとは独立し、管理者メール一致も要求しない。
    // requestBodyの内容だけで判定し、トークンの種類では判定しない。
    const isLocationCollectRequest =
      !isCronRequest &&
      requestBody.mode === "locationCollect";

    if (!isCronRequest) {
      let decodedToken;

      try {
        decodedToken =
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

      if (!isLocationCollectRequest) {
        const decodedEmail =
          String(
            decodedToken.email || ""
          )
            .toLowerCase();

        if (
          decodedEmail === "" ||
          decodedEmail !==
            adminEmail.toLowerCase()
        ) {
          return response.status(403).json({
            success: false,
            message:
              "管理者権限がありません。"
          });
        }
      }
    }

    const database =
      getFirestore(app);

    if (isLocationCollectRequest) {
      const targetArea =
        typeof requestBody.targetArea === "string"
          ? requestBody.targetArea.trim()
          : "";

      if (targetArea === "") {
        return response.status(400).json({
          success: false,
          message:
            "targetAreaを指定してください。"
        });
      }

      const collectionResults =
        await collectFromSourcesForLocationTrigger(
          database,
          targetArea
        );

      // summaryバックフィルによりSKIPPED→DISCOVEREDへ復帰した記事は
      // newItemCountに反映されないため、newItemCountの有無ではなく
      // 「実際に収集(claim→collectFromSource())が成功した情報源が
      // 1件以上あるか」を条件にする。claimed:falseのみ(全クールダウン中)、
      // またはclaimed:trueでもsuccess:falseのみ(RSS取得失敗のみ)の場合は
      // 呼ばない。
      const hasSuccessfulCollection =
        collectionResults.some(
          function(result) {
            return (
              result.claimed === true &&
              result.success === true
            );
          }
        );

      let autoPostSummary =
        null;

      if (hasSuccessfulCollection) {
        try {
          autoPostSummary =
            await runAutoPostForDiscoveredArticles(
              database,
              MAX_AUTO_POSTS_PER_RUN
            );
        } catch (autoPostError) {
          console.error(
            "自動投稿処理エラー：",
            autoPostError
          );
        }
      }

      return response.status(200).json({
        success: true,
        targetArea:
          targetArea,

        results:
          collectionResults,

        autoPost:
          autoPostSummary
      });
    }

    if (isCronRequest) {
      const priorityTier =
        typeof requestBody.priorityTier === "string"
          ? requestBody.priorityTier.trim()
          : "";

      if (
        priorityTier !== PRIORITY_TIER_IMPORTANT &&
        priorityTier !== PRIORITY_TIER_NORMAL
      ) {
        return response.status(400).json({
          success: false,
          message:
            "priorityTierはIMPORTANTまたはNORMALを指定してください。"
        });
      }

      const targetArea =
        typeof requestBody.targetArea === "string"
          ? requestBody.targetArea.trim()
          : "";

      const tierResult =
        await collectFromPriorityTier(
          database,
          priorityTier,
          targetArea
        );

      let autoPostSummary =
        null;

      try {
        autoPostSummary =
          await runAutoPostForDiscoveredArticles(
            database,
            MAX_AUTO_POSTS_PER_RUN
          );
      } catch (autoPostError) {
        console.error(
          "自動投稿処理エラー：",
          autoPostError
        );
      }

      return response.status(200).json({
        success: true,
        priorityTier:
          priorityTier,

        processed:
          tierResult.processed,

        succeeded:
          tierResult.succeeded,

        failed:
          tierResult.failed,

        results:
          tierResult.results,

        totalItemCount:
          tierResult.totalItemCount,

        totalNewItemCount:
          tierResult.totalNewItemCount,

        totalExistingItemCount:
          tierResult.totalExistingItemCount,

        targetArea:
          targetArea || null,

        autoPost:
          autoPostSummary
      });
    }

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

    let collectionResult;

    try {
      collectionResult =
        await collectFromSource(
          database,
          documentId
        );
    } catch (collectionError) {
      if (
        typeof collectionError.statusCode === "number"
      ) {
        return response.status(collectionError.statusCode).json({
          success: false,
          message:
            collectionError.message
        });
      }

      throw collectionError;
    }

    let responseItems =
      collectionResult.items;

    try {
      responseItems =
        await enrichCandidateItemsWithStructuredFacts(
          collectionResult.items,
          database,
          documentId
        );
    } catch (enrichmentError) {
      console.error(
        "構造化事実補強エラー(全体)：",
        enrichmentError
      );

      responseItems =
        collectionResult.items;
    }

    return response.status(200).json({
      success: true,
      items: responseItems
    });
  } catch (error) {
    console.error(
      "情報収集エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "情報の収集に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
