import {
  cert,
  getApps,
  initializeApp
} from "firebase-admin/app";

import {
  getFirestore
} from "firebase-admin/firestore";

import {
  getAuth
} from "firebase-admin/auth";

import {
  lookup as dnsLookup
} from "node:dns/promises";

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

  const adminEmail =
    process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    return response.status(500).json({
      success: false,
      message:
        "管理者メールアドレスが設定されていません。"
    });
  }

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

  try {
    const app =
      getFirebaseAdminApp();

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

    const database =
      getFirestore(app);

    const documentSnapshot =
      await database
        .collection(
          "aiSources"
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
          "対象の情報源が見つかりませんでした。"
      });
    }

    const sourceData =
      documentSnapshot.data() ||
      {};

    if (
      sourceData.isEnabled !== true
    ) {
      return response.status(400).json({
        success: false,
        message:
          "この情報源は停止中のため情報を集められません。"
      });
    }

    const feedUrl =
      typeof sourceData.feedUrl === "string"
        ? sourceData.feedUrl.trim()
        : "";

    if (feedUrl === "") {
      return response.status(400).json({
        success: false,
        message:
          "この情報源にはRSS URLが登録されていません。"
      });
    }

    try {
      await assertFeedUrlIsSafe(
        feedUrl
      );
    } catch (ssrfError) {
      return response.status(400).json({
        success: false,
        message:
          ssrfError.message
      });
    }

    let feedXmlText;

    try {
      feedXmlText =
        await fetchFeedContent(
          feedUrl
        );
    } catch (fetchError) {
      return response.status(502).json({
        success: false,
        message:
          fetchError.message
      });
    }

    let candidateItems;

    try {
      candidateItems =
        parseFeedXml(
          feedXmlText
        );
    } catch (parseError) {
      return response.status(422).json({
        success: false,
        message:
          parseError.message
      });
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

    return response.status(200).json({
      success: true,
      items: items
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
