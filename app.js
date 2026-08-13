let shops = [];

let userLatitude = null;
let userLongitude = null;
let userAreaName = null;
let selectedCategory = "すべて";

function loadFavoriteShopIdsFromStorage() {
  let rawFavoriteShopIds = null;

  try {
    rawFavoriteShopIds =
      localStorage.getItem(
        "machinauFavoriteShopIds"
      );

    if (!rawFavoriteShopIds) {
      const rawLegacyFavoriteShopIds =
        localStorage.getItem(
          "imamiruFavoriteShopIds"
        );

      if (rawLegacyFavoriteShopIds) {
        try {
          localStorage.setItem(
            "machinauFavoriteShopIds",
            rawLegacyFavoriteShopIds
          );
        } catch (error) {
          // 新キーへの移行に失敗しても、今回の読み込みは旧データで継続する
        }

        rawFavoriteShopIds = rawLegacyFavoriteShopIds;
      }
    }
  } catch (error) {
    rawFavoriteShopIds = null;
  }

  try {
    const parsedFavoriteShopIds =
      JSON.parse(
        rawFavoriteShopIds || "[]"
      );

    return Array.isArray(parsedFavoriteShopIds)
      ? parsedFavoriteShopIds
      : [];
  } catch (error) {
    return [];
  }
}

const favoriteShopIds =
  new Set(
    loadFavoriteShopIdsFromStorage()
  );

let currentModalImages = [];
let currentModalImageIndex = 0;
let modalTouchStartX = null;
let modalTouchEndX = null;
let modalSlideChanging = false;

let googleMapInstance = null;
let shopMarkers = [];
let shopInfoWindow = null;
let currentLocationMarker = null;

let expiryDisplayRefreshTimerId = null;

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function calculateDistance(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const earthRadiusKm = 6371;

  const latitudeDifference =
    degreesToRadians(
      latitude2 - latitude1
    );

  const longitudeDifference =
    degreesToRadians(
      longitude2 - longitude1
    );

  const firstLatitude =
    degreesToRadians(latitude1);

  const secondLatitude =
    degreesToRadians(latitude2);

  const calculation =
    Math.sin(
      latitudeDifference / 2
    ) ** 2 +
    Math.cos(firstLatitude) *
    Math.cos(secondLatitude) *
    Math.sin(
      longitudeDifference / 2
    ) ** 2;

  const angle =
    2 *
    Math.atan2(
      Math.sqrt(calculation),
      Math.sqrt(1 - calculation)
    );

  return earthRadiusKm * angle;
}

function formatDistance(distanceKm) {
  if (
    distanceKm === null ||
    !Number.isFinite(distanceKm)
  ) {
    return "現在地を取得";
  }

  if (distanceKm < 1) {
    return (
      Math.round(
        distanceKm * 1000
      ) + "m"
    );
  }

  return (
    distanceKm.toFixed(1) +
    "km"
  );
}

function estimateWalkingTime(
  distanceKm
) {
  if (
    distanceKm === null ||
    !Number.isFinite(distanceKm)
  ) {
    return "距離を確認";
  }

  const walkingMinutes =
    Math.max(
      1,
      Math.round(
        distanceKm / 0.08
      )
    );

  if (walkingMinutes >= 120) {
    return "車での移動推奨";
  }

  return (
    "徒歩 約" +
    walkingMinutes +
    "分"
  );
}

function createGoogleMapUrl(
  latitude,
  longitude,
  address,
  shopName
) {
  let destination = "";

  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    destination =
      latitude + "," + longitude;
  } else if (address) {
    destination =
      address;
  } else {
    return "";
  }

  return (
    "https://www.google.com/maps/dir/" +
    "?api=1" +
    "&destination=" +
    encodeURIComponent(destination) +
    "&travelmode=walking"
  );
}
 

function getCategoryDisplay(
  category
) {
  const categorySettings = {
    グルメ: {
      categoryText:
        "グルメ・飲食店",

      emoji:
        "🍜",

      visualClass:
        "visual-food"
    },

    "カフェ・スイーツ": {
      categoryText:
        "カフェ・スイーツ",

      emoji:
        "🥭",

      visualClass:
        "visual-cafe"
    },

    ショッピング: {
      categoryText:
        "ショッピング・お土産",

      emoji:
        "🛍️",

      visualClass:
        "visual-shopping"
    },

    イベント: {
      categoryText:
        "イベント・体験",

      emoji:
        "🎵",

      visualClass:
        "visual-event"
    },

    "観光・体験": {
      categoryText:
        "観光・体験",

      emoji:
        "🏝️",

      visualClass:
        "visual-sightseeing"
    },

    ナイトスポット: {
      categoryText:
        "ナイトスポット・夜の沖縄",

      emoji:
        "🌃",

      visualClass:
        "visual-bar"
    },

    "美容・リラクゼーション": {
      categoryText:
        "美容・リラクゼーション",

      emoji:
        "💆",

      visualClass:
        "visual-beauty"
    },

    宿泊: {
      categoryText:
        "宿泊",

      emoji:
        "🏨",

      visualClass:
        "visual-stay"
    },

    カフェ: {
      categoryText:
        "カフェ・スイーツ",

      emoji:
        "🥭",

      visualClass:
        "visual-cafe"
    },

    居酒屋: {
      categoryText:
        "ナイトスポット・夜の沖縄",

      emoji:
        "🌃",

      visualClass:
        "visual-bar"
    },

    お知らせ: {
      categoryText:
        "お知らせ",

      emoji:
        "📢",

      visualClass:
        "visual-official"
    }
  };

  return (
    categorySettings[category] ||
    {
      categoryText:
        category ||
        "沖縄の今",

      emoji:
        "🌺",

      visualClass:
        "visual-event"
    }
  );
}

function getDateValue(
  timestamp
) {
  if (!timestamp) {
    return 0;
  }

  if (
    typeof timestamp.toMillis ===
    "function"
  ) {
    return timestamp.toMillis();
  }

  if (
    timestamp.seconds !==
    undefined
  ) {
    return (
      Number(timestamp.seconds) *
      1000
    );
  }

  const parsedDate =
    new Date(timestamp);

  if (
    Number.isNaN(
      parsedDate.getTime()
    )
  ) {
    return 0;
  }

  return parsedDate.getTime();
}

const JST_OFFSET_MILLISECONDS =
  9 * 60 * 60 * 1000;

function getJstEndOfTodayMilliseconds(
  nowMilliseconds
) {
  const jstShiftedMilliseconds =
    nowMilliseconds +
    JST_OFFSET_MILLISECONDS;

  const jstShiftedDate =
    new Date(
      jstShiftedMilliseconds
    );

  const jstEndOfDayShiftedMilliseconds =
    Date.UTC(
      jstShiftedDate.getUTCFullYear(),
      jstShiftedDate.getUTCMonth(),
      jstShiftedDate.getUTCDate(),
      23,
      59,
      59,
      999
    );

  return (
    jstEndOfDayShiftedMilliseconds -
    JST_OFFSET_MILLISECONDS
  );
}

function getExpiryDisplayText(
  shop
) {
  const expiryMilliseconds =
    getDateValue(
      shop.expiresAt
    );

  const nowMilliseconds =
    Date.now();

  const remainingMilliseconds =
    expiryMilliseconds -
    nowMilliseconds;

  if (
    expiryMilliseconds <= 0 ||
    remainingMilliseconds <= 0
  ) {
    return "🆕 新着";
  }

  if (
    remainingMilliseconds <
    60 * 60 * 1000
  ) {
    const remainingMinutesTotal =
      Math.max(
        1,
        Math.ceil(
          remainingMilliseconds /
            60000
        )
      );

    return (
      "⚡ あと" +
      remainingMinutesTotal +
      "分"
    );
  }

  if (
    remainingMilliseconds <=
    24 * 60 * 60 * 1000
  ) {
    return "🔥 今日だけ";
  }

  return "🆕 新着";
}

function getJstMinutesSinceMidnight(
  nowMilliseconds
) {
  const jstShiftedMilliseconds =
    nowMilliseconds +
    JST_OFFSET_MILLISECONDS;

  const jstShiftedDate =
    new Date(
      jstShiftedMilliseconds
    );

  return (
    jstShiftedDate.getUTCHours() *
      60 +
    jstShiftedDate.getUTCMinutes()
  );
}

function parseTimeStringToMinutes(
  timeString
) {
  if (
    typeof timeString !== "string"
  ) {
    return null;
  }

  const match =
    timeString.match(
      /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/
    );

  if (!match) {
    return null;
  }

  return (
    Number(match[1]) * 60 +
    Number(match[2])
  );
}

function getBusinessStatus(
  shop
) {
  if (shop.isOpen24Hours === true) {
    return {
      text: "営業中",
      isOpen: true
    };
  }

  const businessStartTime =
    shop.businessStartTime || "";

  const businessEndTime =
    shop.businessEndTime || "";

  if (
    businessStartTime === "" &&
    businessEndTime === ""
  ) {
    return {
      text: "掲載中",
      isOpen: null
    };
  }

  const startMinutes =
    parseTimeStringToMinutes(
      businessStartTime
    );

  const endMinutes =
    parseTimeStringToMinutes(
      businessEndTime
    );

  if (
    startMinutes === null ||
    endMinutes === null
  ) {
    return {
      text: "掲載中",
      isOpen: null
    };
  }

  if (startMinutes === endMinutes) {
    return {
      text: "営業中",
      isOpen: true
    };
  }

  const nowMinutes =
    getJstMinutesSinceMidnight(
      Date.now()
    );

  let isOpen;

  if (startMinutes < endMinutes) {
    isOpen =
      nowMinutes >= startMinutes &&
      nowMinutes < endMinutes;
  } else {
    isOpen =
      nowMinutes >= startMinutes ||
      nowMinutes < endMinutes;
  }

  return {
    text:
      isOpen ?
        "営業中" :
        "営業時間外",

    isOpen: isOpen
  };
}

function getBusinessClosingText(
  shop
) {
  if (!shop) {
    return "";
  }

  if (shop.isOpen24Hours === true) {
    return "";
  }

  const businessStatus =
    getBusinessStatus(shop);

  if (businessStatus.isOpen !== true) {
    return "";
  }

  const startMinutes =
    parseTimeStringToMinutes(
      shop.businessStartTime || ""
    );

  const endMinutes =
    parseTimeStringToMinutes(
      shop.businessEndTime || ""
    );

  if (
    startMinutes === null ||
    endMinutes === null
  ) {
    return "";
  }

  if (startMinutes === endMinutes) {
    return "";
  }

  const nowMinutes =
    getJstMinutesSinceMidnight(
      Date.now()
    );

  let remainingMinutes;

  if (startMinutes < endMinutes) {
    remainingMinutes =
      endMinutes -
      nowMinutes;
  } else if (
    nowMinutes >= startMinutes
  ) {
    remainingMinutes =
      (1440 - nowMinutes) +
      endMinutes;
  } else {
    remainingMinutes =
      endMinutes -
      nowMinutes;
  }

  if (remainingMinutes <= 0) {
    return "";
  }

  if (remainingMinutes < 60) {
    const remainingMinutesTotal =
      Math.max(
        1,
        Math.ceil(
          remainingMinutes
        )
      );

    return (
      "⚡ 営業終了まであと" +
      remainingMinutesTotal +
      "分"
    );
  }

  const remainingHoursTotal =
    Math.max(
      1,
      Math.ceil(
        remainingMinutes / 60
      )
    );

  return (
    "⏰ 営業終了まであと" +
    remainingHoursTotal +
    "時間"
  );
}

function getBusinessRemainingMinutes(
  shop
) {
  if (!shop) {
    return null;
  }

  if (shop.isOpen24Hours === true) {
    return null;
  }

  const businessStatus =
    getBusinessStatus(shop);

  if (businessStatus.isOpen !== true) {
    return null;
  }

  const startMinutes =
    parseTimeStringToMinutes(
      shop.businessStartTime || ""
    );

  const endMinutes =
    parseTimeStringToMinutes(
      shop.businessEndTime || ""
    );

  if (
    startMinutes === null ||
    endMinutes === null
  ) {
    return null;
  }

  if (startMinutes === endMinutes) {
    return null;
  }

  const nowMinutes =
    getJstMinutesSinceMidnight(
      Date.now()
    );

  let remainingMinutes;

  if (startMinutes < endMinutes) {
    remainingMinutes =
      endMinutes -
      nowMinutes;
  } else if (
    nowMinutes >= startMinutes
  ) {
    remainingMinutes =
      (1440 - nowMinutes) +
      endMinutes;
  } else {
    remainingMinutes =
      endMinutes -
      nowMinutes;
  }

  if (remainingMinutes <= 0) {
    return null;
  }

  return remainingMinutes;
}

function getBusinessClosedMessage(
  shop
) {
  if (!shop) {
    return "";
  }

  if (shop.isOpen24Hours === true) {
    return "";
  }

  const businessStartTime =
    shop.businessStartTime || "";

  const businessEndTime =
    shop.businessEndTime || "";

  if (
    businessStartTime === "" &&
    businessEndTime === ""
  ) {
    return "";
  }

  const startMinutes =
    parseTimeStringToMinutes(
      businessStartTime
    );

  const endMinutes =
    parseTimeStringToMinutes(
      businessEndTime
    );

  if (
    startMinutes === null ||
    endMinutes === null
  ) {
    return "";
  }

  if (startMinutes === endMinutes) {
    return "";
  }

  const businessStatus =
    getBusinessStatus(shop);

  if (businessStatus.isOpen !== false) {
    return "";
  }

  const nowMinutes =
    getJstMinutesSinceMidnight(
      Date.now()
    );

  if (startMinutes < endMinutes) {
    if (nowMinutes < startMinutes) {
      return (
        "🕘 本日は" +
        businessStartTime +
        "から営業します"
      );
    }

    if (nowMinutes >= endMinutes) {
      return "🌙 本日の営業は終了しました";
    }

    return "";
  }

  if (
    endMinutes <= nowMinutes &&
    nowMinutes < startMinutes
  ) {
    return "🌙 本日の営業は終了しました";
  }

  return "";
}

function getBusinessHoursDisplayText(
  shop
) {
  if (!shop) {
    return "";
  }

  if (shop.isOpen24Hours === true) {
    return "🕘 24時間営業";
  }

  const businessStartTime =
    shop.businessStartTime || "";

  const businessEndTime =
    shop.businessEndTime || "";

  if (
    businessStartTime === "" ||
    businessEndTime === ""
  ) {
    return "";
  }

  const startMinutes =
    parseTimeStringToMinutes(
      businessStartTime
    );

  const endMinutes =
    parseTimeStringToMinutes(
      businessEndTime
    );

  if (
    startMinutes === null ||
    endMinutes === null
  ) {
    return "";
  }

  if (startMinutes === endMinutes) {
    return "🕘 24時間営業";
  }

  return (
    "🕘 営業時間 " +
    businessStartTime +
    "〜" +
    businessEndTime
  );
}

function startExpiryDisplayRefreshTimer() {
  if (
    expiryDisplayRefreshTimerId !==
    null
  ) {
    return;
  }

  expiryDisplayRefreshTimerId =
    window.setInterval(
      function() {
        renderShops();
      },
      60000
    );
}

function getFirstText(
  values,
  fallbackText
) {
  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const value =
      values[index];

    if (
      typeof value ===
        "string" &&
      value.trim() !== ""
    ) {
      return value.trim();
    }
  }

  return fallbackText;
}

function getNumberValue(
  value
) {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" &&
    value.trim() !== ""
  ) {
    const convertedNumber =
      Number(value);

    if (
      Number.isFinite(
        convertedNumber
      )
    ) {
      return convertedNumber;
    }
  }

  return null;
}

function getSafeImageUrl(
  value
) {
  if (
    typeof value !==
      "string" ||
    value.trim() === ""
  ) {
    return "";
  }

  const imageUrl =
    value.trim();

  if (
    !imageUrl.startsWith(
      "https://"
    )
  ) {
    return "";
  }

  return imageUrl;
}

function getSafeWebsiteUrl(
  value
) {
  if (
    typeof value !==
      "string" ||
    value.trim() === ""
  ) {
    return "";
  }

  const websiteUrl =
    value.trim();

  if (
    !/^https?:\/\//.test(
      websiteUrl
    )
  ) {
    return "";
  }

  return websiteUrl;
}

function getSubmissionImageUrls(
  data
) {
  const imageUrls = [];

  if (
    Array.isArray(
      data.imageUrls
    )
  ) {
    data.imageUrls.forEach(
      function(imageUrl) {
        const safeImageUrl =
          getSafeImageUrl(
            imageUrl
          );

        if (safeImageUrl) {
          imageUrls.push(
            safeImageUrl
          );
        }
      }
    );
  }

  if (
    Array.isArray(
      data.images
    )
  ) {
    data.images.forEach(
      function(imageData) {
        const safeImageUrl =
          getSafeImageUrl(
            imageData &&
            imageData.url
          );

        if (safeImageUrl) {
          imageUrls.push(
            safeImageUrl
          );
        }
      }
    );
  }

  return Array.from(
    new Set(
      imageUrls
    )
  ).slice(
    0,
    5
  );
}

function getCardVisualHtml(
  shop
) {
  const firstImageUrl =
    shop.imageUrls &&
    shop.imageUrls.length > 0
      ? shop.imageUrls[0]
      : "";

  if (!firstImageUrl) {
    return `
      <span class="shop-emoji">
        ${escapeHtml(
          shop.emoji
        )}
      </span>
    `;
  }

  return `
    <img
      src="${escapeHtml(
        firstImageUrl
      )}"
      alt="${escapeHtml(
        shop.name
      )}の掲載写真"
      loading="lazy"
      style="
        position: absolute;
        inset: 0;
        z-index: 1;
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      "
    >
  `;
}

function convertSubmissionToShop(
  documentSnapshot,
  index
) {
  const data =
    documentSnapshot.data() ||
    {};

  const category =
    getFirstText(
      [
        data.category,
        data.genre
      ],
      "グルメ"
    );

  const categoryDisplay =
    getCategoryDisplay(
      category
    );

  const shopName =
    getFirstText(
      [
        data.shopName,
        data.storeName,
        data.name,
        data.businessName
      ],
      "店舗名未登録"
    );

  const title =
    getFirstText(
      [
        data.title,
        data.adTitle,
        data.headline
      ],
      "今だけの情報"
    );

  const content =
    getFirstText(
      [
        data.content,
        data.message,
        data.description,
        data.details
      ],
      "詳しい情報は店舗へご確認ください。"
    );

  const address =
    getFirstText(
      [
        data.address,
        data.shopAddress,
        data.location
      ],
      ""
    );

  const latitude =
    getNumberValue(
      data.latitude
    );

  const longitude =
    getNumberValue(
      data.longitude
    );

  const timeMessage =
    getFirstText(
      [
        data.timeMessage,
        data.period,
        data.eventTime,
        data.openingHours
      ],
      "⚡ マチナウ掲載中"
    );

  return {
    id:
      index + 1,

    firestoreId:
      documentSnapshot.id,

    name:
      shopName,

    title:
      title,

    category:
      category,

    categoryText:
      categoryDisplay
        .categoryText,

    emoji:
      categoryDisplay
        .emoji,

    visualClass:
      categoryDisplay
        .visualClass,

    status:
      "掲載中",

    badge:
      title,

    message:
      content,

    timeMessage:
      timeMessage,

    address:
      address,

    latitude:
      latitude,

    longitude:
      longitude,

    websiteUrl:
      getSafeWebsiteUrl(
        data.websiteUrl
      ),

    imageUrls:
      getSubmissionImageUrls(
        data
      ),

    createdAt:
      data.createdAt ||
      data.submittedAt ||
      data.updatedAt ||
      null,

    expiresAt:
      data.expiresAt ||
      null,

    businessStartTime:
      typeof data.businessStartTime ===
      "string"
        ? data.businessStartTime.trim()
        : "",

    businessEndTime:
      typeof data.businessEndTime ===
      "string"
        ? data.businessEndTime.trim()
        : "",

    isOpen24Hours:
      Boolean(
        data.isOpen24Hours
      ),

    postType:
      typeof data.postType === "string" &&
      data.postType.trim() !== ""
        ? data.postType.trim()
        : "shop",

    sourceLabel:
      typeof data.sourceLabel === "string"
        ? data.sourceLabel.trim()
        : "",

    area:
      typeof data.area === "string"
        ? data.area.trim()
        : ""
  };
}

const CATEGORY_FILTER_ALIASES = {
  "カフェ・スイーツ": [
    "カフェ・スイーツ",
    "カフェ"
  ],

  ナイトスポット: [
    "ナイトスポット",
    "居酒屋"
  ]
};

function shopMatchesSelectedCategory(
  shop,
  selectedCategoryValue
) {
  const aliasGroup =
    CATEGORY_FILTER_ALIASES[
      selectedCategoryValue
    ];

  if (aliasGroup) {
    return aliasGroup.includes(
      shop.category
    );
  }

  return (
    shop.category ===
    selectedCategoryValue
  );
}

const AI_AUTO_POST_WIDE_AREA_NAME =
  "沖縄県全域";

// AI自動投稿(postType==="admin")だけを対象に、現在地の地域(userAreaName)との
// 一致度で優先順位を返す。AI自動投稿以外、またはuserAreaName未確定の場合は
// 常に同じ値(2)を返し、既存の並び順(createdAt降順)を変えない。
function getAiAreaPriorityRank(
  shop
) {
  if (
    shop.postType !== "admin" ||
    userAreaName === null ||
    userAreaName === ""
  ) {
    return 2;
  }

  if (shop.area === userAreaName) {
    return 0;
  }

  if (shop.area === AI_AUTO_POST_WIDE_AREA_NAME) {
    return 1;
  }

  return 2;
}


function getVisibleShops() {
  let visibleShops =
    shops.filter(
      function(shop) {
        return (
          selectedCategory === "すべて" ||
selectedCategory === "お気に入り" ||
shopMatchesSelectedCategory(
  shop,
  selectedCategory
)
        );
      }
    );
if (selectedCategory === "お気に入り") {
    visibleShops = visibleShops.filter(function (shop) {
        return favoriteShopIds.has(shop.firestoreId);
    });
}
  visibleShops =
    visibleShops.map(
      function(shop) {
        let distanceKm =
          null;

        if (
          userLatitude !== null &&
          userLongitude !== null &&
          Number.isFinite(
            shop.latitude
          ) &&
          Number.isFinite(
            shop.longitude
          )
        ) {
          distanceKm =
            calculateDistance(
              userLatitude,
              userLongitude,
              shop.latitude,
              shop.longitude
            );
        }

        return {
          ...shop,

          distanceKm:
            distanceKm
        };
      }
    );

  if (
    userLatitude !== null &&
    userLongitude !== null
  ) {
    visibleShops.sort(
      function(
        firstShop,
        secondShop
      ) {
        if (
          firstShop.distanceKm ===
            null &&
          secondShop.distanceKm ===
            null
        ) {
          const firstAreaPriorityRank =
            getAiAreaPriorityRank(
              firstShop
            );

          const secondAreaPriorityRank =
            getAiAreaPriorityRank(
              secondShop
            );

          if (
            firstAreaPriorityRank !==
            secondAreaPriorityRank
          ) {
            return (
              firstAreaPriorityRank -
              secondAreaPriorityRank
            );
          }

          return (
            getDateValue(
              secondShop.createdAt
            ) -
            getDateValue(
              firstShop.createdAt
            )
          );
        }

        if (
          firstShop.distanceKm ===
          null
        ) {
          return 1;
        }

        if (
          secondShop.distanceKm ===
          null
        ) {
          return -1;
        }

        return (
          firstShop.distanceKm -
          secondShop.distanceKm
        );
      }
    );
  }

  return visibleShops;
}

function renderLoading() {
  const shopsList =
    document.getElementById(
      "shopsList"
    );

  if (!shopsList) {
    return;
  }

  shopsList.innerHTML = `
    <div class="sample-notice">
      掲載中の情報を読み込んでいます…
    </div>
  `;
}

function renderLoadError(
  errorMessage
) {
  const shopsList =
    document.getElementById(
      "shopsList"
    );

  if (!shopsList) {
    return;
  }

  shopsList.innerHTML = `
    <div class="sample-notice">
      掲載情報を読み込めませんでした。<br>
      少し時間を置いて、
      もう一度ページを更新してください。
      ${
        errorMessage
          ? `
            <br>

            <small>
              ${escapeHtml(
                errorMessage
              )}
            </small>
          `
          : ""
      }
    </div>
  `;
}

function getMapButtonHtml(
  shop
) {
  const mapUrl =
    createGoogleMapUrl(
      shop.latitude,
      shop.longitude,
      shop.address,
      shop.name
    );

  if (mapUrl === "") {
    return "";
  }

  return `
    <a
      class="
        shop-button
        map-button
      "
      href="${mapUrl}"
      target="_blank"
      rel="noopener noreferrer"
    >
      📍 地図
    </a>
  `;
}

function getSourceLinkButtonHtml(
  shop
) {
  if (
    shop.postType !== "admin" ||
    shop.websiteUrl === ""
  ) {
    return "";
  }

  return `
    <a
      class="
        shop-button
        source-link-button
      "
      href="${shop.websiteUrl}"
      target="_blank"
      rel="noopener noreferrer"
    >
      🔗 情報元を見る
    </a>
  `;
}

// admin-source-collect.jsのDRAFT_LIFELINE_KEYWORDS/DRAFT_TRANSPORT_KEYWORDS/
// DRAFT_EMERGENCY_KEYWORDSと同期が必要（この3配列は同じ内容を維持すること）
const FLASH_BANNER_LIFELINE_KEYWORDS = ["節水", "断水", "停電"];

const FLASH_BANNER_TRANSPORT_KEYWORDS = [
  "交通", "通行止め", "交通規制", "欠航", "運休"
];

const FLASH_BANNER_EMERGENCY_KEYWORDS = [
  "避難", "警報", "台風", "津波", "大雨", "熱中症"
];

const FLASH_BANNER_DEFAULT_TITLE_TEXT =
  "今日だけの沖縄を、見逃さない。";

const FLASH_BANNER_DEFAULT_MESSAGE_TEXT =
  "タイムセールや限定イベントなど、今しか出会えない情報を配信します。";

function shopMatchesFlashBannerKeywords(
  shop
) {
  const combinedText =
    (shop.title || "") +
    " " +
    (shop.message || "");

  return (
    FLASH_BANNER_LIFELINE_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    ) ||
    FLASH_BANNER_TRANSPORT_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    ) ||
    FLASH_BANNER_EMERGENCY_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    )
  );
}

function updateFlashBanner() {
  const flashBannerTitle =
    document.getElementById(
      "flashBannerTitle"
    );

  const flashBannerMessage =
    document.getElementById(
      "flashBannerMessage"
    );

  const flashBannerDetailButton =
    document.getElementById(
      "flashBannerDetailButton"
    );

  if (
    !flashBannerTitle ||
    !flashBannerMessage ||
    !flashBannerDetailButton
  ) {
    return;
  }

  const matchingShops =
    shops.filter(
      shopMatchesFlashBannerKeywords
    );

  if (matchingShops.length === 0) {
    flashBannerTitle.textContent =
      FLASH_BANNER_DEFAULT_TITLE_TEXT;

    flashBannerMessage.textContent =
      FLASH_BANNER_DEFAULT_MESSAGE_TEXT;

    flashBannerDetailButton.style.display =
      "none";

    flashBannerDetailButton.onclick =
      null;

    return;
  }

  const sortedMatchingShops =
    matchingShops
      .slice()
      .sort(
        function(shopA, shopB) {
          return (
            getDateValue(
              shopB.createdAt
            ) -
            getDateValue(
              shopA.createdAt
            )
          );
        }
      );

  const featuredShop =
    sortedMatchingShops[0];

  flashBannerTitle.textContent =
    "🚨 速報：" +
    featuredShop.title;

  flashBannerMessage.textContent =
    featuredShop.message;

  flashBannerDetailButton.style.display =
    "";

  flashBannerDetailButton.onclick =
    function() {
      openShopModal(
        featuredShop.firestoreId
      );
    };
}

function renderShops() {
  const shopsList =
    document.getElementById(
      "shopsList"
    );

  if (!shopsList) {
    return;
  }

  const visibleShops =
    getVisibleShops();

  updateShopMarkers();

  updateFlashBanner();

  if (
    visibleShops.length ===
    0
  ) {
    shopsList.innerHTML = `
      <div class="sample-notice">
        現在、このカテゴリーに
        掲載中の情報はありません。
      </div>
    `;

    return;
  }

  shopsList.innerHTML =
    visibleShops
      .map(
        function(shop) {
          const isFavorite =
            favoriteShopIds.has(
              shop.firestoreId
            );

          const expiryDisplayText =
            getExpiryDisplayText(
              shop
            );

          const isAdminPost =
            shop.postType ===
            "admin";

          const businessStatus =
            isAdminPost
              ? { text: "", isOpen: null }
              : getBusinessStatus(
                  shop
                );

          const businessStatusColor =
            businessStatus.isOpen ===
            false
              ? "#d9534f"
              : "var(--green)";

          const businessClosingText =
            isAdminPost
              ? ""
              : getBusinessClosingText(
                  shop
                );

          const businessRemainingMinutes =
            isAdminPost
              ? null
              : getBusinessRemainingMinutes(
                  shop
                );

          let businessClosingChipStyle =
            "";

          if (
            businessRemainingMinutes !==
              null &&
            businessRemainingMinutes <=
              30
          ) {
            businessClosingChipStyle =
              "color: #d9534f; " +
              "border-color: rgba(217, 83, 79, 0.3); " +
              "background: rgba(217, 83, 79, 0.08);";
          } else if (
            businessRemainingMinutes !==
              null &&
            businessRemainingMinutes <=
              120
          ) {
            businessClosingChipStyle =
              "color: #e67e22; " +
              "border-color: rgba(230, 126, 34, 0.3); " +
              "background: rgba(230, 126, 34, 0.08);";
          }

          const businessClosedMessage =
            isAdminPost
              ? ""
              : getBusinessClosedMessage(
                  shop
                );

          return `
            <article class="shop-card ${
              isAdminPost
                ? "admin-post-card"
                : ""
            }">

              <div
                class="
                  shop-visual
                  ${escapeHtml(
                    shop.visualClass
                  )}
                "
              >

                <div class="shop-badges">

                  <span class="event-badge">
                    ⚡
                    ${escapeHtml(
                      shop.badge
                    )}
                  </span>

                  <button
                    class="
                      favorite-button
                      ${
                        isFavorite
                          ? "active"
                          : ""
                      }
                    "
                    type="button"
                    aria-label="お気に入り"
                    onclick="
                      toggleFavorite(
                        '${escapeHtml(
                          shop.firestoreId
                        )}'
                      )
                    "
                  >
                    ${
                      isFavorite
                        ? "♥"
                        : "♡"
                    }
                  </button>

                </div>

                ${getCardVisualHtml(
                  shop
                )}

              </div>

              <div class="shop-body">

                <div class="shop-category">

                  <span>
                    ${escapeHtml(
                      shop.categoryText
                    )}
                  </span>

                  ${
                    isAdminPost
                      ? `
                        <span class="admin-post-badge">
                          🌺 マチナウ運営より
                        </span>
                      `
                      : businessStatus.text
                        ? `
                          <span
                            class="open-status"
                            style="color: ${businessStatusColor};"
                          >
                            ●
                            ${escapeHtml(
                              businessStatus.text
                            )}
                          </span>
                        `
                        : ""
                  }

                </div>

                <h3 class="shop-name">
                  ${escapeHtml(
                    shop.name
                  )}
                </h3>

                <p class="shop-description">
                  ${escapeHtml(
                    shop.message
                  )}
                </p>

                <div class="shop-info-row">

                  <span class="info-chip">
                    ${
                      expiryDisplayText
                        ? escapeHtml(
                            expiryDisplayText
                          )
                        : "🆕 新着"
                    }
                  </span>

                  <span class="info-chip">
                    📍
                    ${formatDistance(
                      shop.distanceKm
                    )}
                  </span>

                  <span class="info-chip">
                    🚶
                    ${estimateWalkingTime(
                      shop.distanceKm
                    )}
                  </span>

                  ${
                    businessClosingText
                      ? `
                        <span
                          class="info-chip"
                          style="${businessClosingChipStyle}"
                        >
                          ${escapeHtml(
                            businessClosingText
                          )}
                        </span>
                      `
                      : ""
                  }

                </div>

                ${
                  shop.address
                    ? `
                      <div class="time-limit">
                        📍
                        ${escapeHtml(
                          shop.address
                        )}
                      </div>
                    `
                    : ""
                }

                ${
                  isAdminPost
                    ? ""
                    : `
                      <div class="time-limit">
                        ${escapeHtml(
                          shop.timeMessage
                        )}
                      </div>
                    `
                }

                ${
                  businessClosedMessage
                    ? `
                      <div class="time-limit">
                        ${escapeHtml(
                          businessClosedMessage
                        )}
                      </div>
                    `
                    : ""
                }

                <div class="shop-actions">

                  <button
                    class="
                      shop-button
                      detail-button
                    "
                    type="button"
                    onclick="
                      openShopModal(
                        '${escapeHtml(
                          shop.firestoreId
                        )}'
                      )
                    "
                  >
                    今の情報を見る
                  </button>

                  ${getMapButtonHtml(
                    shop
                  )}

                  ${getSourceLinkButtonHtml(
                    shop
                  )}

                </div>

              </div>

            </article>
          `;
        }
      )
      .join("");
}
function renderFavoriteList() {
  const favoriteList =
    document.getElementById("favoriteList");

  if (!favoriteList) {
    return;
  }

  const favoriteShops = shops.filter(
    function (shop) {
      return favoriteShopIds.has(
        shop.firestoreId
      );
    }
  );

  if (favoriteShops.length === 0) {
    favoriteList.innerHTML =
      "<p>まだお気に入りはありません。</p>";
    return;
  }

  favoriteList.innerHTML =
    favoriteShops
      .map(function (shop) {
        const firstImageUrl =
          shop.imageUrls &&
          shop.imageUrls.length > 0
            ? shop.imageUrls[0]
            : "";

        const visualHtml = firstImageUrl
          ? `
            <img
              src="${escapeHtml(firstImageUrl)}"
              alt="${escapeHtml(shop.name)}の掲載写真"
              loading="lazy"
              style="
                width: 100%;
                height: 100%;
                object-fit: cover;
              "
            >
          `
          : `
            <span class="shop-emoji">🌺</span>
          `;

        return `
          <div class="favorite-list-item">
            <div
              class="favorite-list-visual"
              style="
                position: relative;
                width: 100%;
                aspect-ratio: 4 / 3;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
              "
            >
              ${visualHtml}
            </div>
            <strong>${escapeHtml(shop.name)}</strong>
            <p>${escapeHtml(shop.title)}</p>
            <div class="shop-actions">
              <button
                class="shop-button detail-button"
                type="button"
                onclick="
                  openShopModal(
                    '${escapeHtml(shop.firestoreId)}'
                  )
                "
              >
                今の情報を見る
              </button>
            </div>
          </div>
        `;
      })
      .join("");
}
function selectCategory(
  category,
  button
) {
  selectedCategory =
    category;

  document
    .querySelectorAll(
      ".category-button"
    )
    .forEach(
      function(
        categoryButton
      ) {
        categoryButton
          .classList
          .remove(
            "active"
          );
      }
    );

  if (button) {
    button
      .classList
      .add(
        "active"
      );
  }

  renderShops();
}

function toggleFavorite(
  firestoreId
) {
  if (
    favoriteShopIds.has(
      firestoreId
    )
  ) {
    favoriteShopIds.delete(
      firestoreId
    );
  } else {
    favoriteShopIds.add(
      firestoreId
    );
  }
localStorage.setItem(
  "machinauFavoriteShopIds",
  JSON.stringify(
    Array.from(
      favoriteShopIds
    )
  )
);
  renderShops();
}

function removeModalSlider() {
  const oldSlider =
    document.getElementById(
      "machinauModalSlider"
    );

  if (oldSlider) {
    oldSlider.remove();
  }

  const modalEmoji =
    document.getElementById(
      "modalEmoji"
    );

  if (modalEmoji) {
    modalEmoji.style.display =
      "";
  }

  currentModalImages =
    [];

  currentModalImageIndex =
    0;

  modalTouchStartX =
    null;

  modalTouchEndX =
    null;

  modalSlideChanging =
    false;
}

function createSliderButton(
  buttonText,
  ariaLabel,
  side
) {
  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.textContent =
    buttonText;

  button.setAttribute(
    "aria-label",
    ariaLabel
  );

  button.style.position =
    "absolute";

  button.style.top =
    "50%";

  button.style[side] =
    "12px";

  button.style.zIndex =
    "8";

  button.style.width =
    "42px";

  button.style.height =
    "42px";

  button.style.display =
    "grid";

  button.style.placeItems =
    "center";

  button.style.padding =
    "0";

  button.style.border =
    "none";

  button.style.borderRadius =
    "50%";

  button.style.background =
    "rgba(7, 26, 51, 0.72)";

  button.style.color =
    "#ffffff";

  button.style.fontSize =
    "22px";

  button.style.fontWeight =
    "900";

  button.style.cursor =
    "pointer";

  button.style.transform =
    "translateY(-50%)";

  button.style.boxShadow =
    "0 6px 18px rgba(0, 0, 0, 0.2)";

  button.style.transition =
    "transform 0.2s, background 0.2s";

  button.addEventListener(
    "mouseenter",
    function() {
      button.style.background =
        "rgba(7, 26, 51, 0.92)";
    }
  );

  button.addEventListener(
    "mouseleave",
    function() {
      button.style.background =
        "rgba(7, 26, 51, 0.72)";
    }
  );

  return button;
}

function createModalSlider() {
  const modalVisual =
    document.getElementById(
      "modalVisual"
    );

  const modalEmoji =
    document.getElementById(
      "modalEmoji"
    );

  if (
    !modalVisual ||
    !modalEmoji ||
    currentModalImages.length ===
      0
  ) {
    return;
  }


  modalEmoji.style.display =
    "none";

  modalVisual.style.position =
    "relative";

  modalVisual.style.overflow =
    "hidden";

  modalVisual.style.backgroundImage =
    "none";

  modalVisual.style.touchAction =
    "pan-y";

  currentModalImageIndex =
    0;

  const slider =
    document.createElement(
      "div"
    );

  slider.id =
    "machinauModalSlider";

  slider.style.position =
    "absolute";

  slider.style.inset =
    "0";

  slider.style.zIndex =
    "4";

  slider.style.overflow =
    "hidden";

  slider.style.background =
    "#e9f1f5";

  const image =
    document.createElement(
      "img"
    );

  image.id =
    "machinauModalSlideImage";

  image.alt =
    "店舗の掲載写真";

  image.draggable =
    false;

  image.style.position =
    "absolute";

  image.style.inset =
    "0";

  image.style.width =
    "100%";

  image.style.height =
    "100%";

  image.style.display =
    "block";

  image.style.objectFit =
    "cover";

  image.style.userSelect =
    "none";

  image.style.transition =
    "opacity 0.24s ease, transform 0.28s ease";

  slider.appendChild(
    image
  );

  const counter =
    document.createElement(
      "div"
    );

  counter.id =
    "machinauModalImageCounter";

  counter.style.position =
    "absolute";

  counter.style.top =
    "12px";

  counter.style.right =
    "12px";

  counter.style.zIndex =
    "9";

  counter.style.padding =
    "6px 10px";

  counter.style.borderRadius =
    "999px";

  counter.style.background =
    "rgba(7, 26, 51, 0.76)";

  counter.style.color =
    "#ffffff";

  counter.style.fontSize =
    "11px";

  counter.style.fontWeight =
    "900";

  counter.style.pointerEvents =
    "none";

  slider.appendChild(
    counter
  );

  const dots =
    document.createElement(
      "div"
    );

  dots.id =
    "machinauModalSliderDots";

  dots.style.position =
    "absolute";

  dots.style.right =
    "60px";

  dots.style.bottom =
    "13px";

  dots.style.left =
    "60px";

  dots.style.zIndex =
    "9";

  dots.style.display =
    "flex";

  dots.style.alignItems =
    "center";

  dots.style.justifyContent =
    "center";

  dots.style.gap =
    "7px";

  currentModalImages.forEach(
    function(
      imageUrl,
      index
    ) {
      const dot =
        document.createElement(
          "button"
        );

      dot.type =
        "button";

      dot.setAttribute(
        "aria-label",
        "写真" +
        (index + 1) +
        "を表示"
      );

      dot.dataset.index =
        String(index);

      dot.style.width =
        "9px";

      dot.style.height =
        "9px";

      dot.style.padding =
        "0";

      dot.style.border =
        "2px solid rgba(255, 255, 255, 0.95)";

      dot.style.borderRadius =
        "50%";

      dot.style.background =
        index === 0
          ? "#ffffff"
          : "rgba(7, 26, 51, 0.55)";

      dot.style.cursor =
        "pointer";

      dot.style.boxShadow =
        "0 2px 7px rgba(0, 0, 0, 0.22)";

      dot.style.transition =
        "transform 0.2s, background 0.2s";

      dot.addEventListener(
        "click",
        function(event) {
          event.stopPropagation();

          const selectedIndex =
            Number(
              dot.dataset.index
            );

          const direction =
            selectedIndex >
            currentModalImageIndex
              ? 1
              : -1;

          showModalSlide(
            selectedIndex,
            direction
          );
        }
      );

      dots.appendChild(
        dot
      );
    }
  );

  slider.appendChild(
    dots
  );

  if (
    currentModalImages.length >
    1
  ) {
    const previousButton =
      createSliderButton(
        "‹",
        "前の写真",
        "left"
      );

    previousButton.id =
      "machinauModalPreviousButton";

    previousButton.addEventListener(
      "click",
      function(event) {
        event.stopPropagation();

        showPreviousModalSlide();
      }
    );

    slider.appendChild(
      previousButton
    );

    const nextButton =
      createSliderButton(
        "›",
        "次の写真",
        "right"
      );

    nextButton.id =
      "machinauModalNextButton";

    nextButton.addEventListener(
      "click",
      function(event) {
        event.stopPropagation();

        showNextModalSlide();
      }
    );

    slider.appendChild(
      nextButton
    );
  }

  slider.addEventListener(
    "touchstart",
    function(event) {
      if (
        event.touches.length !==
        1
      ) {
        return;
      }

      modalTouchStartX =
        event.touches[0]
          .clientX;

      modalTouchEndX =
        modalTouchStartX;
    },
    {
      passive: true
    }
  );

  slider.addEventListener(
    "touchmove",
    function(event) {
      if (
        event.touches.length !==
        1
      ) {
        return;
      }

      modalTouchEndX =
        event.touches[0]
          .clientX;
    },
    {
      passive: true
    }
  );

  slider.addEventListener(
    "touchend",
    function() {
      handleModalSwipe();
    }
  );

  modalVisual.appendChild(
    slider
  );

  updateModalSliderDisplay();
}

function updateModalSliderDisplay() {
  const image =
    document.getElementById(
      "machinauModalSlideImage"
    );

  const counter =
    document.getElementById(
      "machinauModalImageCounter"
    );

  const dotsContainer =
    document.getElementById(
      "machinauModalSliderDots"
    );

  if (
    !image ||
    currentModalImages.length ===
      0
  ) {
    return;
  }

  image.src =
    currentModalImages[
      currentModalImageIndex
    ];

  if (counter) {
    counter.textContent =
      (
        currentModalImageIndex +
        1
      ) +
      " / " +
      currentModalImages.length;
  }

  if (dotsContainer) {
    const dots =
      dotsContainer.querySelectorAll(
        "button"
      );

    dots.forEach(
      function(
        dot,
        index
      ) {
        const isActive =
          index ===
          currentModalImageIndex;

        dot.style.background =
          isActive
            ? "#ffffff"
            : "rgba(7, 26, 51, 0.55)";

        dot.style.transform =
          isActive
            ? "scale(1.35)"
            : "scale(1)";
      }
    );
  }
}

function showModalSlide(
  nextIndex,
  direction
) {
  if (
    modalSlideChanging ||
    currentModalImages.length ===
      0
  ) {
    return;
  }

  const image =
    document.getElementById(
      "machinauModalSlideImage"
    );

  if (!image) {
    return;
  }

  const normalizedIndex =
    (
      nextIndex +
      currentModalImages.length
    ) %
    currentModalImages.length;

  if (
    normalizedIndex ===
    currentModalImageIndex
  ) {
    return;
  }

  modalSlideChanging =
    true;

  const movementDirection =
    direction >= 0
      ? -1
      : 1;

  image.style.opacity =
    "0";

  image.style.transform =
    "translateX(" +
    movementDirection *
      35 +
    "px)";

  window.setTimeout(
    function() {
      currentModalImageIndex =
        normalizedIndex;

      image.style.transition =
        "none";

      image.style.transform =
        "translateX(" +
        movementDirection *
          -35 +
        "px)";

      image.src =
        currentModalImages[
          currentModalImageIndex
        ];

      updateModalSliderDisplay();

      window.requestAnimationFrame(
        function() {
          window.requestAnimationFrame(
            function() {
              image.style.transition =
                "opacity 0.24s ease, transform 0.28s ease";

              image.style.opacity =
                "1";

              image.style.transform =
                "translateX(0)";
            }
          );
        }
      );

      window.setTimeout(
        function() {
          modalSlideChanging =
            false;
        },
        300
      );
    },
    180
  );
}

function showPreviousModalSlide() {
  if (
    currentModalImages.length <=
    1
  ) {
    return;
  }

  showModalSlide(
    currentModalImageIndex -
      1,
    -1
  );
}

function showNextModalSlide() {
  if (
    currentModalImages.length <=
    1
  ) {
    return;
  }

  showModalSlide(
    currentModalImageIndex +
      1,
    1
  );
}

function handleModalSwipe() {
  if (
    modalTouchStartX ===
      null ||
    modalTouchEndX ===
      null ||
    currentModalImages.length <=
      1
  ) {
    modalTouchStartX =
      null;

    modalTouchEndX =
      null;

    return;
  }

  const swipeDistance =
    modalTouchEndX -
    modalTouchStartX;

  const minimumSwipeDistance =
    45;

  if (
    swipeDistance >
    minimumSwipeDistance
  ) {
    showPreviousModalSlide();
  }

  if (
    swipeDistance <
    -minimumSwipeDistance
  ) {
    showNextModalSlide();
  }

  modalTouchStartX =
    null;

  modalTouchEndX =
    null;
}

function getOrCreateModalWebsiteButton(
  modalMapButtonElement
) {
  let modalWebsiteButton =
    document.getElementById(
      "modalWebsiteButton"
    );

  if (
    !modalWebsiteButton &&
    modalMapButtonElement &&
    modalMapButtonElement.parentNode
  ) {
    modalWebsiteButton =
      document.createElement(
        "a"
      );

    modalWebsiteButton.id =
      "modalWebsiteButton";

    modalWebsiteButton.className =
      "modal-map-button";

    modalWebsiteButton.target =
      "_blank";

    modalWebsiteButton.rel =
      "noopener noreferrer";

    modalWebsiteButton.textContent =
      "🔗 お店のページを見る";

    modalMapButtonElement.parentNode.insertBefore(
      modalWebsiteButton,
      modalMapButtonElement.nextSibling
    );
  }

  return modalWebsiteButton;
}

function openShopModal(
  firestoreId
) {
  const selectedShop =
    shops.find(
      function(shop) {
        return (
          shop.firestoreId ===
          firestoreId
        );
      }
    );

  if (!selectedShop) {
    return;
  }

  const modal =
    document.getElementById(
      "shopModal"
    );

  const modalVisual =
    document.getElementById(
      "modalVisual"
    );

  const modalEmoji =
    document.getElementById(
      "modalEmoji"
    );

  const modalCategory =
    document.getElementById(
      "modalCategory"
    );

  const modalTitle =
    document.getElementById(
      "modalTitle"
    );

  const modalMessage =
    document.getElementById(
      "modalMessage"
    );

  const modalMapButton =
    document.getElementById(
      "modalMapButton"
    );

  if (
    !modal ||
    !modalVisual ||
    !modalEmoji ||
    !modalCategory ||
    !modalTitle ||
    !modalMessage ||
    !modalMapButton
  ) {
    return;
  }

  removeModalSlider();

  modalVisual.className =
    "modal-visual " +
    selectedShop.visualClass;

  modalVisual.style.position =
    "relative";

  modalVisual.style.backgroundImage =
    "";

  modalVisual.style.backgroundSize =
    "";

  modalVisual.style.backgroundPosition =
    "";

  currentModalImages =
    Array.isArray(
      selectedShop.imageUrls
    )
      ? selectedShop.imageUrls
      : [];

  currentModalImageIndex =
    0;

  if (
    currentModalImages.length >
    0
  ) {
    modalEmoji.style.display =
      "none";

    createModalSlider();
  } else {
    modalEmoji.style.display =
      "";

    modalEmoji.textContent =
      selectedShop.emoji;
  }

  const isAdminPost =
    selectedShop.postType ===
    "admin";

  const modalBusinessStatus =
    isAdminPost
      ? { text: "", isOpen: null }
      : getBusinessStatus(
          selectedShop
        );

  modalCategory.textContent =
    modalBusinessStatus.text
      ? selectedShop.categoryText +
        "・" +
        modalBusinessStatus.text
      : selectedShop.categoryText;

  modalTitle.textContent =
    selectedShop.name;

  let modalText =
    "📢 " +
    escapeHtml(
      selectedShop.message
    );

  if (
    selectedShop.sourceLabel
  ) {
    modalText +=
      "<br><br>🌺 " +
      escapeHtml(
        selectedShop.sourceLabel
      );
  }

  if (
    selectedShop.address
  ) {
    modalText +=
      "<br><br>📍 " +
      escapeHtml(
        selectedShop.address
      );
  }

  if (
    selectedShop.timeMessage
  ) {
    modalText +=
      "<br><br>" +
      escapeHtml(
        selectedShop.timeMessage
      );
  }

  const modalBusinessHoursDisplayText =
    isAdminPost
      ? ""
      : getBusinessHoursDisplayText(
          selectedShop
        );

  if (modalBusinessHoursDisplayText) {
    modalText +=
      "<br><br>" +
      escapeHtml(
        modalBusinessHoursDisplayText
      );
  }

  const modalExpiryDisplayText =
    getExpiryDisplayText(
      selectedShop
    );

  if (modalExpiryDisplayText) {
    modalText +=
      "<br><br>" +
      escapeHtml(
        modalExpiryDisplayText
      );
  }

  const modalBusinessClosingText =
    isAdminPost
      ? ""
      : getBusinessClosingText(
          selectedShop
        );

  if (modalBusinessClosingText) {
    modalText +=
      "<br><br>" +
      escapeHtml(
        modalBusinessClosingText
      );
  }

  const modalBusinessClosedMessage =
    isAdminPost
      ? ""
      : getBusinessClosedMessage(
          selectedShop
        );

  if (modalBusinessClosedMessage) {
    modalText +=
      "<br><br>" +
      escapeHtml(
        modalBusinessClosedMessage
      );
  }

  modalMessage.innerHTML =
    modalText;

  const modalMapUrl =
    createGoogleMapUrl(
      selectedShop.latitude,
      selectedShop.longitude,
      selectedShop.address,
      selectedShop.name
    );

  if (modalMapUrl === "") {
    modalMapButton.style.display =
      "none";
  } else {
    modalMapButton.href =
      modalMapUrl;

    modalMapButton.style.display =
      "";
  }

  const modalWebsiteButton =
    getOrCreateModalWebsiteButton(
      modalMapButton
    );

  if (modalWebsiteButton) {
    if (
      selectedShop.websiteUrl ===
      ""
    ) {
      modalWebsiteButton.style.display =
        "none";
    } else {
      modalWebsiteButton.href =
        selectedShop.websiteUrl;

      modalWebsiteButton.style.display =
        "";
    }
  }

  modal.classList.add(
    "visible"
  );

  document.body.style.overflow =
    "hidden";
}

function closeShopModal() {
  const modal =
    document.getElementById(
      "shopModal"
    );

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "visible"
  );

  document.body.style.overflow =
    "";

  removeModalSlider();
}

function closeModalOutside(
  event
) {
  if (
    event.target.id ===
    "shopModal"
  ) {
    closeShopModal();
  }
}

const NAHA_FALLBACK_LATITUDE =
  26.2124;

const NAHA_FALLBACK_LONGITUDE =
  127.6809;

const WEATHER_CACHE_STORAGE_KEY =
  "machinauWeatherCache";

const WEATHER_CACHE_MAX_AGE_MILLISECONDS =
  15 * 60 * 1000;

const WEATHER_CACHE_MAX_COORDINATE_DELTA =
  0.05;


function readWeatherCache(latitude, longitude) {
  try {
    const rawCache =
      sessionStorage.getItem(
        WEATHER_CACHE_STORAGE_KEY
      );

    if (!rawCache) {
      return null;
    }

    const parsedCache =
      JSON.parse(
        rawCache
      );

    if (
      !parsedCache ||
      typeof parsedCache !== "object" ||
      typeof parsedCache.fetchedAt !== "number" ||
      typeof parsedCache.latitude !== "number" ||
      typeof parsedCache.longitude !== "number" ||
      !parsedCache.weather
    ) {
      return null;
    }

    if (
      Date.now() - parsedCache.fetchedAt >
      WEATHER_CACHE_MAX_AGE_MILLISECONDS
    ) {
      return null;
    }

    if (
      Math.abs(parsedCache.latitude - latitude) >
        WEATHER_CACHE_MAX_COORDINATE_DELTA ||
      Math.abs(parsedCache.longitude - longitude) >
        WEATHER_CACHE_MAX_COORDINATE_DELTA
    ) {
      return null;
    }

    return parsedCache.weather;
  } catch (error) {
    return null;
  }
}


function writeWeatherCache(latitude, longitude, weather) {
  try {
    sessionStorage.setItem(
      WEATHER_CACHE_STORAGE_KEY,
      JSON.stringify({
        fetchedAt: Date.now(),
        latitude: latitude,
        longitude: longitude,
        weather: weather
      })
    );
  } catch (error) {
    // sessionStorageが利用できない環境でも天候機能自体は継続する
  }
}


async function fetchWeather(latitude, longitude) {
  const cachedWeather =
    readWeatherCache(
      latitude,
      longitude
    );

  if (cachedWeather) {
    return cachedWeather;
  }

  const response =
    await fetch(
      "/api/weather?lat=" +
      encodeURIComponent(latitude) +
      "&lon=" +
      encodeURIComponent(longitude)
    );

  const responseData =
    await response.json();

  if (
    !response.ok ||
    !responseData ||
    responseData.success !== true ||
    !responseData.weather
  ) {
    throw new Error(
      responseData && responseData.message
        ? responseData.message
        : "天候情報の取得に失敗しました。"
    );
  }

  writeWeatherCache(
    latitude,
    longitude,
    responseData.weather
  );

  return responseData.weather;
}


// WeatherAPI.comのcondition.codeに対する簡易な絵文字マッピング。
// 未知のコードは中立の絵文字にフォールバックする(表示が壊れないことを優先)。
function getWeatherConditionEmoji(conditionCode) {
  if (conditionCode === 1000) {
    return "☀️";
  }

  if ([1003, 1006, 1009].includes(conditionCode)) {
    return "☁️";
  }

  if (
    [
      1063, 1150, 1153, 1180, 1183, 1186,
      1189, 1192, 1195, 1240, 1243, 1246
    ].includes(conditionCode)
  ) {
    return "☂";
  }

  if (
    [1087, 1273, 1276, 1279, 1282].includes(
      conditionCode
    )
  ) {
    return "⛈";
  }

  if ([1030, 1135, 1147].includes(conditionCode)) {
    return "🌫";
  }

  return "🌤";
}


// ここでの表示はあくまで旅行者向けの行動判断補助であり、
// 気象庁等が発表する公式警報・避難情報ではない。
// 「警報」「避難指示」等の表現は使用しない。
// 優先順位は健康リスクの大きさを基準にした単純な固定順(熱→UV→雨→風)で、
// 新しいスコアリング体系は作らない。
function buildWeatherAdviceText(weather) {
  const heatIndexForAdvice =
    weather.heatIndexC !== null
      ? weather.heatIndexC
      : weather.temperatureC;

  if (
    heatIndexForAdvice !== null &&
    heatIndexForAdvice >= 35
  ) {
    return "🌡 こまめな水分補給を";
  }

  if (
    weather.uvIndex !== null &&
    weather.uvIndex >= 8
  ) {
    return "☀️ 紫外線対策を";
  }

  if (
    weather.chanceOfRain !== null &&
    weather.chanceOfRain >= 50
  ) {
    return "☂ 傘があると安心";
  }

  if (
    weather.windKph !== null &&
    weather.windKph >= 20
  ) {
    return "🌬 強風に注意";
  }

  return "";
}


function updateWeatherDisplay(weather, locationLabelText) {
  const weatherCard =
    document.getElementById("weatherCard");

  const weatherLocationLabel =
    document.getElementById("weatherLocationLabel");

  const weatherSummary =
    document.getElementById("weatherSummary");

  const weatherFeelsLike =
    document.getElementById("weatherFeelsLike");

  const weatherDetails =
    document.getElementById("weatherDetails");

  const weatherAdvice =
    document.getElementById("weatherAdvice");

  if (
    !weatherCard ||
    !weatherLocationLabel ||
    !weatherSummary ||
    !weatherFeelsLike ||
    !weatherDetails ||
    !weatherAdvice
  ) {
    return;
  }

  if (!weather) {
    weatherCard.style.display = "none";
    return;
  }

  weatherLocationLabel.textContent =
    locationLabelText;

  const temperatureText =
    weather.temperatureC !== null
      ? Math.round(weather.temperatureC) + "℃"
      : "--℃";

  weatherSummary.textContent =
    getWeatherConditionEmoji(weather.conditionCode) +
    " " +
    (weather.conditionText || "") +
    "　" +
    temperatureText;

  weatherFeelsLike.textContent =
    weather.feelsLikeC !== null
      ? "体感 " + Math.round(weather.feelsLikeC) + "℃"
      : "";

  const detailParts = [];

  if (weather.chanceOfRain !== null) {
    detailParts.push(
      "☂ 降水" + weather.chanceOfRain + "%"
    );
  }

  if (weather.windKph !== null) {
    detailParts.push(
      "🌬 " + Math.round(weather.windKph) + "km/h"
    );
  }

  if (weather.uvIndex !== null) {
    detailParts.push(
      "UV " + weather.uvIndex
    );
  }

  weatherDetails.textContent =
    detailParts.join("　");

  const adviceText =
    buildWeatherAdviceText(weather);

  if (adviceText) {
    weatherAdvice.textContent = adviceText;
    weatherAdvice.style.display = "";
  } else {
    weatherAdvice.textContent = "";
    weatherAdvice.style.display = "none";
  }

  weatherCard.style.display = "";
}


// 緯度・経度から市区町村名(locality)を取得する。
// Geocoderが使えない/結果0件/localityが見つからない/APIエラーの
// いずれの場合もrejectせずnullでresolveし、呼び出し側の既存処理を止めない。
function resolveAreaNameFromCoordinates(latitude, longitude) {
  return new Promise(function(resolve) {
    if (
      typeof google === "undefined" ||
      !google.maps ||
      !google.maps.Geocoder
    ) {
      resolve(null);
      return;
    }

    try {
      const geocoder =
        new google.maps.Geocoder();

      geocoder.geocode(
        {
          location: {
            lat: latitude,
            lng: longitude
          }
        },
        function(results, status) {
          if (
            status !== "OK" ||
            !Array.isArray(results) ||
            results.length === 0
          ) {
            resolve(null);
            return;
          }

          const localityResult =
            results.find(function(result) {
              return (
                Array.isArray(result.address_components) &&
                result.address_components.some(function(component) {
                  return (
                    Array.isArray(component.types) &&
                    component.types.includes("locality")
                  );
                })
              );
            });

          if (!localityResult) {
            resolve(null);
            return;
          }

          const localityComponent =
            localityResult.address_components.find(function(component) {
              return (
                Array.isArray(component.types) &&
                component.types.includes("locality")
              );
            });

          resolve(
            localityComponent &&
            typeof localityComponent.long_name === "string"
              ? localityComponent.long_name
              : null
          );
        }
      );
    } catch (error) {
      resolve(null);
    }
  });
}


function getLocation() {
  const locationButton =
    document.getElementById(
      "locationButton"
    );

  const locationMessage =
    document.getElementById(
      "locationMessage"
    );

  const currentMapLink =
    document.getElementById(
      "currentMapLink"
    );

  if (
    !locationButton ||
    !locationMessage ||
    !currentMapLink
  ) {
    return;
  }

  if (
    !navigator.geolocation
  ) {
    locationMessage.textContent =
      "このブラウザでは位置情報を利用できません。";

    fetchWeather(
      NAHA_FALLBACK_LATITUDE,
      NAHA_FALLBACK_LONGITUDE
    )
      .then(function(weather) {
        updateWeatherDisplay(weather, "那覇の天気");
      })
      .catch(function(error) {
        // 天候取得の失敗は既存の位置情報エラー表示に影響させない
      });

    return;
  }

  locationButton.disabled =
    true;

  locationButton.textContent =
    "確認しています…";

  locationMessage.textContent =
    "GPSから現在地を取得しています。";

  navigator.geolocation
    .getCurrentPosition(
      function(position) {
        userLatitude =
          position
            .coords
            .latitude;

        userLongitude =
          position
            .coords
            .longitude;

        locationMessage.textContent =
          "現在地を取得しました。近い順に表示しています。";

        currentMapLink.href =
          createGoogleMapUrl(
            userLatitude,
            userLongitude,
            "",
            ""
          );

        currentMapLink.style.display =
          "block";

        locationButton.disabled =
          false;

        locationButton.textContent =
          "現在地を更新";

        showCurrentLocationMarker(
          userLatitude,
          userLongitude
        );

        renderShops();

        fetchWeather(
          userLatitude,
          userLongitude
        )
          .then(function(weather) {
            updateWeatherDisplay(weather, "現在地の天気");
          })
          .catch(function(error) {
            // 天候取得の失敗はrenderShops()等の既存フローに影響させない
          });

        resolveAreaNameFromCoordinates(
          userLatitude,
          userLongitude
        )
          .then(function(areaName) {
            if (areaName) {
              userAreaName = areaName;
            }
          })
          .catch(function(error) {
            // 地域名取得の失敗は既存フローに影響させない
          });
      },

      function(error) {
        let message =
          "位置情報を取得できませんでした。";

        if (
          error.code === 1
        ) {
         message =
    message +
    "\n\n" +
    "① ブラウザの位置情報を「許可」に変更してください。\n" +
    "② この画面に戻って「もう一度試す」を押してください。";
        }

        if (
          error.code === 2
        ) {
          message =
            "現在地を確認できませんでした。";
        }

        if (
          error.code === 3
        ) {
          message =
            "取得に時間がかかりました。もう一度お試しください。";
        }

        locationMessage.textContent =
          message;

        locationButton.disabled =
          false;

        locationButton.textContent =
          "もう一度試す";

        fetchWeather(
          NAHA_FALLBACK_LATITUDE,
          NAHA_FALLBACK_LONGITUDE
        )
          .then(function(weather) {
            updateWeatherDisplay(weather, "那覇の天気");
          })
          .catch(function(error) {
            // 天候取得の失敗は既存の位置情報エラー表示に影響させない
          });
      },

      {
        enableHighAccuracy:
          true,

        timeout:
          15000,

        maximumAge:
          60000
      }
    );
}

function scrollToShops() {
  const shopsSection =
    document.getElementById(
      "shopsSection"
    );

  if (!shopsSection) {
    return;
  }

  shopsSection.scrollIntoView({
    behavior:
      "smooth"
  });
}

function scrollToTopPage() {
  const shopsSection =
    document.getElementById("shopsSection");

  const myPageSection =
    document.getElementById("myPageSection");

  const mapSection =
    document.querySelector(".map-section");

  if (shopsSection) {
    shopsSection.style.display = "block";
  }

  if (myPageSection) {
    myPageSection.style.display = "none";
  }

  if (mapSection) {
    mapSection.style.display = "block";
  }

  selectedCategory = "すべて";
  renderShops();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function showMyPage() {
  const shopsSection =
    document.getElementById("shopsSection");

  const myPageSection =
    document.getElementById("myPageSection");
const mapSection =
  document.querySelector(".map-section");
  if (
    !shopsSection ||
    !myPageSection
  ) {
    return;
  }

  shopsSection.style.display = "none";
  mapSection.style.display = "none";
  myPageSection.style.display = "block";

  myPageSection.scrollIntoView({
    behavior: "smooth"
  });
}
function showFavoriteList() {
  selectedCategory = "お気に入り";

  const shopsSection =
    document.getElementById("shopsSection");

  const myPageSection =
    document.getElementById("myPageSection");

  const mapSection =
    document.querySelector(".map-section");

  const favoriteList =
    document.getElementById("favoriteList");

  if (
    !shopsSection ||
    !myPageSection
  ) {
    return;
  }

  shopsSection.style.display = "none";
myPageSection.style.display = "block";

  if (mapSection) {
    mapSection.style.display = "none";
  }

  if (favoriteList) {
    favoriteList.style.display = "block";
  }

  renderFavoriteList();

  myPageSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}
function updateTopCounts(
  totalCount
) {
  const countElements =
    document.querySelectorAll(
      ".mini-info-value"
    );

  if (
    countElements.length >=
    1
  ) {
    countElements[0]
      .textContent =
      totalCount +
      "件";
  }

  if (
    countElements.length >=
    2
  ) {
    countElements[1]
      .textContent =
      totalCount +
      "件";
  }
}

function hideSampleNotice() {
  const sampleNotices =
    document.querySelectorAll(
      ".sample-notice"
    );

  sampleNotices.forEach(
    function(notice) {
      const noticeText =
        notice.textContent ||
        "";

      if (
        noticeText.includes(
          "Firebase接続前"
        ) ||
        noticeText.includes(
          "動作確認用サンプル"
        ) ||
        noticeText.includes(
          "Firebase接続の動作確認用サンプル"
        )
      ) {
        notice.style.display =
          "none";
      }
    }
  );
}

function waitForFirebase(
  maximumWaitMilliseconds
) {
  return new Promise(
    function(
      resolve,
      reject
    ) {
      const startedAt =
        Date.now();

      function checkFirebase() {
        if (
          window.machinauDb
        ) {
          resolve(
            window.machinauDb
          );

          return;
        }

        if (
          Date.now() -
            startedAt >=
          maximumWaitMilliseconds
        ) {
          reject(
            new Error(
              "Firebaseの準備が完了しませんでした。"
            )
          );

          return;
        }

        window.setTimeout(
          checkFirebase,
          100
        );
      }

      checkFirebase();
    }
  );
}

async function loadApprovedSubmissions() {
  renderLoading();

  if (window.machinauExpiryTimer) {
    window.clearTimeout(
      window.machinauExpiryTimer
    );

    window.machinauExpiryTimer =
      null;
  }

  try {
    const database =
      await waitForFirebase(
        10000
      );

    const querySnapshot =
      await database
        .collection(
          "submissions"
        )
        .where(
          "status",
          "==",
          "approved"
        )
        .get();

    const approvedShops =
      [];

    const currentTime =
      Date.now();

    let nearestExpiryTime =
      null;

    querySnapshot.forEach(
      function(
        documentSnapshot
      ) {
        const submissionData =
          documentSnapshot.data() ||
          {};

        const expiryTime =
          getDateValue(
            submissionData.expiresAt
          );

        const isStillPublished =
          expiryTime > currentTime;

        if (!isStillPublished) {
          return;
        }

        approvedShops.push(
          convertSubmissionToShop(
            documentSnapshot,
            approvedShops.length
          )
        );

        if (
          nearestExpiryTime === null ||
          expiryTime < nearestExpiryTime
        ) {
          nearestExpiryTime =
            expiryTime;
        }
      }
    );

    approvedShops.sort(
      function(
        firstShop,
        secondShop
      ) {
        return (
          getDateValue(
            secondShop.createdAt
          ) -
          getDateValue(
            firstShop.createdAt
          )
        );
      }
    );

    approvedShops.forEach(
      function(
        shop,
        index
      ) {
        shop.id =
          index + 1;
      }
    );

    shops =
      approvedShops;

    updateTopCounts(
      shops.length
    );

    hideSampleNotice();

    renderShops();

    console.log(
      "✅ 期限内の広告を読み込みました：" +
      shops.length +
      "件"
    );

    if (
      nearestExpiryTime !== null
    ) {
      const millisecondsUntilExpiry =
        Math.max(
          1000,
          nearestExpiryTime -
            Date.now() +
            1000
        );

      window.machinauExpiryTimer =
        window.setTimeout(
          function() {
            console.log(
              "⏰ 掲載期限を確認し直します。"
            );

            closeShopModal();

            loadApprovedSubmissions();
          },
          millisecondsUntilExpiry
        );
    }
  } catch (error) {
    console.error(
      "❌ 掲載情報の読み込みに失敗しました。",
      error
    );

    updateTopCounts(
      0
    );

    renderLoadError(
      error &&
      error.message
        ? error.message
        : ""
    );
  }
}

document.addEventListener(
  "keydown",
  function(event) {
    if (
      event.key ===
      "Escape"
    ) {
      closeShopModal();
    }

    const modal =
      document.getElementById(
        "shopModal"
      );

    if (
      !modal ||
      !modal.classList.contains(
        "visible"
      )
    ) {
      return;
    }

    if (
      event.key ===
      "ArrowLeft"
    ) {
      showPreviousModalSlide();
    }

    if (
      event.key ===
      "ArrowRight"
    ) {
      showNextModalSlide();
    }
  }
);

document.addEventListener(
  "DOMContentLoaded",
  function() {
    hideSampleNotice();

    loadApprovedSubmissions();

    startExpiryDisplayRefreshTimer();
  }
);
// Googleマップを表示する
function initGoogleMap() {
  const mapElement = document.getElementById("google-map");

  if (!mapElement) {
    return;
  }

  const nahaStation = {
    lat: 26.2124,
    lng: 127.6792
  };

  googleMapInstance = new google.maps.Map(mapElement, {
    center: nahaStation,
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true
  });

  new google.maps.Marker({
    position: nahaStation,
    map: googleMapInstance,
    title: "マチナウ"
  });

  shopInfoWindow =
    new google.maps.InfoWindow();

  updateShopMarkers();
}

window.initGoogleMap = initGoogleMap;


function clearShopMarkers() {
  shopMarkers.forEach(
    function(marker) {
      marker.setMap(null);
    }
  );

  shopMarkers = [];
}


function showShopInfoWindow(
  shop,
  marker
) {
  if (
    !googleMapInstance ||
    !shopInfoWindow
  ) {
    return;
  }

  const infoWindowHtml = `
    <div style="min-width:180px; max-width:220px;">
      <strong style="display:block; margin-bottom:4px;">
        ${escapeHtml(shop.name)}
      </strong>
      <p style="margin:0 0 8px; font-size:13px; color:#444;">
        ${escapeHtml(shop.title)}
      </p>
      <button
        type="button"
        onclick="openShopModal('${escapeHtml(shop.firestoreId)}')"
        style="
          width:100%;
          padding:6px 10px;
          border:none;
          border-radius:6px;
          background:#0788c9;
          color:#fff;
          font-weight:700;
          cursor:pointer;
        "
      >
        今の情報を見る
      </button>
    </div>
  `;

  shopInfoWindow.setContent(
    infoWindowHtml
  );

  shopInfoWindow.open(
    googleMapInstance,
    marker
  );
}


function updateShopMarkers() {
  try {
    if (!googleMapInstance) {
      return;
    }

    const visibleShops =
      getVisibleShops();

    clearShopMarkers();

    visibleShops.forEach(
      function(shop) {
        if (
          !Number.isFinite(
            shop.latitude
          ) ||
          !Number.isFinite(
            shop.longitude
          )
        ) {
          return;
        }

        const marker =
          new google.maps.Marker({
            position: {
              lat: shop.latitude,
              lng: shop.longitude
            },

            map: googleMapInstance,
            title: shop.name
          });

        marker.addListener(
          "click",
          function() {
            showShopInfoWindow(
              shop,
              marker
            );
          }
        );

        shopMarkers.push(
          marker
        );
      }
    );
  } catch (error) {
    console.error(
      "地図ピンの表示に失敗しました：",
      error
    );
  }
}


function showCurrentLocationMarker(
  latitude,
  longitude
) {
  try {
    if (!googleMapInstance) {
      return;
    }

    const position = {
      lat: latitude,
      lng: longitude
    };

    if (currentLocationMarker) {
      currentLocationMarker.setPosition(
        position
      );
    } else {
      currentLocationMarker =
        new google.maps.Marker({
          position: position,
          map: googleMapInstance,
          title: "現在地",

          icon: {
            path:
              google.maps.SymbolPath
                .CIRCLE,

            scale: 8,
            fillColor: "#0788c9",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });
    }

    googleMapInstance.setCenter(
      position
    );
  } catch (error) {
    console.error(
      "現在地マーカーの表示に失敗しました：",
      error
    );
  }
}