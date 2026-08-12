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


function cleanText(
  rawValue,
  maxLength
) {
  return truncateText(
    normalizeWhitespace(
      stripHtmlTags(
        rawValue
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
          "#text"
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
                item.description
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
            articleWriteBatch.update(
              entry.documentRef,
              {
                lastSeenAt:
                  FieldValue.serverTimestamp()
              }
            );
          } else {
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
      items
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
  priorityTier
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

          return sourceMatchesPriorityTier(
            sourceData.priority,
            priorityTier
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
              collectionResult.items.length
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

  const succeededCount =
    results.filter(
      function(result) {
        return result.success === true;
      }
    ).length;

  return {
    processed:
      results.length,

    succeeded:
      succeededCount,

    failed:
      results.length -
      succeededCount,

    results:
      results
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
  "会議", "委員会", "職員", "事業者向け", "制度", "調達"
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

  const dropKeywords =
    INTERNAL_RELEVANCE_KEYWORDS.filter(
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

  if (
    !sourceSnapshot.exists ||
    sourceSnapshot.data().isEnabled !== true
  ) {
    return {
      outcome: "SKIP",
      reason: "情報源が無効化されているため対象外です。"
    };
  }

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

  return {
    outcome: "PROCEED",
    relevanceResult: relevanceResult
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
  articleData
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
    websiteUrl: articleUrl
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

          expiresAt:
            Timestamp.fromDate(
              expiresAtDate
            ),

          status:
            "approved",

          postType:
            "admin",

          sourceLabel:
            "マチナウ運営より",

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

const AUTO_POST_CANDIDATE_QUERY_LIMIT =
  MAX_AUTO_POSTS_PER_RUN * 20;


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
        claimedData
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

    const requestBody =
      readRequestBody(
        request
      );

    const database =
      getFirestore(app);

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

      const tierResult =
        await collectFromPriorityTier(
          database,
          priorityTier
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

    return response.status(200).json({
      success: true,
      items: collectionResult.items
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
