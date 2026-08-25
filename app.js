let shops = [];

let userLatitude = null;
let userLongitude = null;
let userAreaName = null;
let selectedCategory = "すべて";

// TOP店舗カード(最大6件・横スクロール)か、見つける全件表示(1列リッチカード)かを
// 切り替えるフラグ。selectCategory()等では変更しない(切替はもっと見る/
// bottom-navigation「見つける」/「ホーム」からのみ)。
let isShowingAllShopCards = false;

// ---- Ver1.7｜多言語化の器(固定UI文言専用) ----
// ここで扱うのは画面の固定UI文言(見出し・ボタン・カテゴリー表示ラベル等)だけ。
// category / area / sourceType / postType / authorType / selectedCategory と
// いった内部判定用の値、およびFirestore由来の投稿本文(title/content/
// shopName等)には一切触れない。翻訳データそのものはtranslations.js
// (MACHINAU_TRANSLATIONS / MACHINAU_SUPPORTED_LANGUAGES / MACHINAU_DEFAULT_LANGUAGE /
// getMachinauTranslation())側に定義されており、app.jsより先に読み込まれる。

const MACHINAU_LANGUAGE_STORAGE_KEY = "machinauLanguage";

// localStorageの値が未保存・不正・利用不可な場合は必ずMACHINAU_DEFAULT_LANGUAGEへ
// フォールバックする(空表示・エラーを避ける)。
function getCurrentMachinauLanguage() {
  let storedLanguage = null;

  try {
    storedLanguage = localStorage.getItem(MACHINAU_LANGUAGE_STORAGE_KEY);
  } catch (error) {
    storedLanguage = null;
  }

  if (
    typeof storedLanguage === "string" &&
    MACHINAU_SUPPORTED_LANGUAGES.includes(storedLanguage)
  ) {
    return storedLanguage;
  }

  return MACHINAU_DEFAULT_LANGUAGE;
}

function saveMachinauLanguage(language) {
  try {
    localStorage.setItem(MACHINAU_LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    // localStorageが使えない環境でも、表示切替自体は継続する。
  }
}

// #locationButtonはgetLocation()(本体は変更しない)がGPS成功時に
// 文言を直接書き換えるため、data-i18n属性の一括置換だけでは正しい状態を
// 追従できない。userLatitudeの有無で現在の状態を判定し、ここでだけ
// 個別に文言を決める(getLocation()本体には一切触れない)。
function updateLocationButtonLanguage(language) {
  const locationButton = document.getElementById("locationButton");

  if (!locationButton) {
    return;
  }

  const translationKey =
    userLatitude !== null
      ? "location_button_update"
      : "location_button_get";

  const translatedText =
    getMachinauTranslation(translationKey, language);

  if (translatedText) {
    locationButton.textContent = translatedText;
  }
}

function updateLanguageSwitcherUi(language) {
  const switcherButtons =
    document.querySelectorAll(
      "#languageSwitcher .language-switch-button"
    );

  switcherButtons.forEach(function (button) {
    const isActive =
      button.getAttribute("data-language") === language;

    button.style.background = isActive ? "var(--white)" : "transparent";
    button.style.color = isActive ? "var(--blue)" : "var(--subtext)";
    button.style.boxShadow =
      isActive ? "0 2px 6px rgba(20, 52, 82, 0.12)" : "none";
  });
}

// 固定UI文言(data-i18n属性を持つ要素)だけを選択言語へ差し替える。
// Firestore由来の投稿本文・category等の内部値には一切触れない。
// GPS状態・スクロール位置・カテゴリー選択状態は変更しない(何も再取得・
// 再描画しないため自然に維持される)。
function applyMachinauLanguage(language) {
  document.documentElement.lang = language;

  document.querySelectorAll("[data-i18n]").forEach(function (element) {
    const key = element.getAttribute("data-i18n");
    const translatedText = getMachinauTranslation(key, language);

    if (translatedText) {
      element.innerHTML = translatedText;
    }
  });

  // innerHTML一括置換と同じ考え方をaria-label属性にも適用する(工程2)。
  // 対象はdata-i18n-aria-label属性を持つ要素のみで、既存のdata-i18n(innerHTML)
  // の挙動には一切影響しない。
  document.querySelectorAll("[data-i18n-aria-label]").forEach(function (element) {
    const key = element.getAttribute("data-i18n-aria-label");
    const translatedText = getMachinauTranslation(key, language);

    if (translatedText) {
      element.setAttribute("aria-label", translatedText);
    }
  });

  updateLocationButtonLanguage(language);
  updateLanguageSwitcherUi(language);
}

// 言語切替のためだけにFirestore再取得を発生させないよう、既にメモリ上にある
// shops配列のcategoryText(表示用ラベル)だけを現在言語で再計算する。
// shop.category(内部値・フィルタ条件で使用)は一切変更しない。
// getCategoryDisplay()・renderShops()自体も変更しない(既存関数の再利用のみ)。
function refreshShopCategoryTextForCurrentLanguage() {
  shops.forEach(function (shop) {
    const categoryDisplay = getCategoryDisplay(shop.category);
    shop.categoryText = categoryDisplay.categoryText;
  });

  renderShops();
}

// 地域おすすめの見出し(📍 {地域}のおすすめ)だけを、Firestore再取得なしで
// 現在言語へ再計算する。currentRegionRecommendationAreaNameは
// showRegionRecommendationsForArea()が既に保持している値をそのまま使う
// (地域名自体・showRegionRecommendationsForArea()本体には一切触れない)。
function refreshRegionRecommendationHeadingForCurrentLanguage() {
  const regionRecommendationHeading =
    document.getElementById(
      "regionRecommendationHeading"
    );

  if (
    !regionRecommendationHeading ||
    typeof currentRegionRecommendationAreaName !== "string" ||
    currentRegionRecommendationAreaName === ""
  ) {
    return;
  }

  regionRecommendationHeading.textContent =
    getMachinauTranslation(
      "region_recommendation_heading_dynamic",
      getCurrentMachinauLanguage()
    ).replace(
      "{AREA}",
      currentRegionRecommendationAreaName
    );
}

function switchMachinauLanguage(language) {
  if (!MACHINAU_SUPPORTED_LANGUAGES.includes(language)) {
    return;
  }

  saveMachinauLanguage(language);
  applyMachinauLanguage(language);

  // shops配列のcategoryText再計算(内部でrenderShops()を呼ぶため、
  // renderShops()経由で✨⚡🔥も既存ロジックのまま再評価・再描画される)。
  refreshShopCategoryTextForCurrentLanguage();

  // 地域おすすめはrenderShops()の対象外の独立セクションのため、
  // 別途Firestore再取得なしで再描画する(regionRecommendationArticlesは
  // 既に取得済みの配列をそのまま使う)。
  renderRegionRecommendationCards();
  refreshRegionRecommendationHeadingForCurrentLanguage();

  // Hero写真のalt文言(shop_image_altキー)を現在言語へ即時反映する。
  // 候補選定・画像URL・Firestore再取得は発生しない(既存候補を再利用するだけ)。
  updateHeroPhoto();
}

function initializeMachinauLanguageSwitcher() {
  applyMachinauLanguage(getCurrentMachinauLanguage());

  const switcherButtons =
    document.querySelectorAll(
      "#languageSwitcher .language-switch-button"
    );

  switcherButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      switchMachinauLanguage(button.getAttribute("data-language"));
    });
  });
}

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

let toiletMarkers = [];
let lastToiletSearchLatitude = null;
let lastToiletSearchLongitude = null;
let lastToiletSearchAt = 0;
let lastToiletPlaces = [];

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
    return getMachinauTranslation(
      "location_button_get",
      getCurrentMachinauLanguage()
    );
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
    return getMachinauTranslation(
      "shop_walking_distance_unknown",
      getCurrentMachinauLanguage()
    );
  }

  const walkingMinutes =
    Math.max(
      1,
      Math.round(
        distanceKm / 0.08
      )
    );

  if (walkingMinutes >= 120) {
    return getMachinauTranslation(
      "shop_walking_car_recommended",
      getCurrentMachinauLanguage()
    );
  }

  return getMachinauTranslation(
    "shop_walking_minutes",
    getCurrentMachinauLanguage()
  ).replace(
    "{N}",
    walkingMinutes
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
 

// getCategoryDisplay()のcategoryText表示ラベルだけをtranslations.jsの
// 辞書キーへ対応させるための表(内部category値そのものは変更しない)。
// カフェ/居酒屋は旧カテゴリーのエイリアスのため、現行カテゴリーと同じ
// キーへ揃えている。
const CATEGORY_TRANSLATION_KEYS_BY_INTERNAL_CATEGORY = {
  グルメ: "category_gourmet",
  カフェ: "category_cafe_sweets",
  "カフェ・スイーツ": "category_cafe_sweets",
  ショッピング: "category_shopping",
  イベント: "category_event",
  "観光・体験": "category_sightseeing",
  ナイトスポット: "category_nightlife",
  居酒屋: "category_nightlife",
  "美容・リラクゼーション": "category_beauty",
  宿泊: "category_lodging",
  お知らせ: "category_notice"
};

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

  const baseDisplay =
    categorySettings[category] ||
    {
      categoryText:
        category ||
        "沖縄の今",

      emoji:
        "🌺",

      visualClass:
        "visual-event"
    };

  // 表示ラベル(categoryText)だけを選択言語の辞書で差し替える。内部の
  // category値・emoji・visualClassには一切触れない(translations.js未読込・
  // 未対応カテゴリーの場合は何もせず日本語のまま返す)。
  // 選択言語が日本語(正本)の場合は、既存のcategoryText(「グルメ・飲食店」等の
  // 詳しい表記)をそのまま使い続けるため上書きしない。翻訳辞書のja値は
  // カテゴリーボタン等の短いラベル用であり、この長い表記とは別物のため。
  const translationKey =
    CATEGORY_TRANSLATION_KEYS_BY_INTERNAL_CATEGORY[category];

  if (
    translationKey &&
    typeof getMachinauTranslation === "function" &&
    typeof getCurrentMachinauLanguage === "function" &&
    getCurrentMachinauLanguage() !== MACHINAU_DEFAULT_LANGUAGE
  ) {
    const translatedCategoryText =
      getMachinauTranslation(
        translationKey,
        getCurrentMachinauLanguage()
      );

    if (translatedCategoryText) {
      return Object.assign(
        {},
        baseDisplay,
        { categoryText: translatedCategoryText }
      );
    }
  }

  return baseDisplay;
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
    return getMachinauTranslation(
      "shop_expiry_new",
      getCurrentMachinauLanguage()
    );
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

    return getMachinauTranslation(
      "shop_expiry_minutes_left",
      getCurrentMachinauLanguage()
    ).replace(
      "{N}",
      remainingMinutesTotal
    );
  }

  if (
    remainingMilliseconds <=
    24 * 60 * 60 * 1000
  ) {
    return getMachinauTranslation(
      "shop_expiry_today_only",
      getCurrentMachinauLanguage()
    );
  }

  return getMachinauTranslation(
    "shop_expiry_new",
    getCurrentMachinauLanguage()
  );
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
      text: getMachinauTranslation(
        "shop_status_open",
        getCurrentMachinauLanguage()
      ),
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
      text: getMachinauTranslation(
        "shop_status_listed",
        getCurrentMachinauLanguage()
      ),
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
      text: getMachinauTranslation(
        "shop_status_listed",
        getCurrentMachinauLanguage()
      ),
      isOpen: null
    };
  }

  if (startMinutes === endMinutes) {
    return {
      text: getMachinauTranslation(
        "shop_status_open",
        getCurrentMachinauLanguage()
      ),
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
        getMachinauTranslation(
          "shop_status_open",
          getCurrentMachinauLanguage()
        ) :
        getMachinauTranslation(
          "shop_status_closed",
          getCurrentMachinauLanguage()
        ),

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

    return getMachinauTranslation(
      "shop_closing_minutes",
      getCurrentMachinauLanguage()
    ).replace(
      "{N}",
      remainingMinutesTotal
    );
  }

  const remainingHoursTotal =
    Math.max(
      1,
      Math.ceil(
        remainingMinutes / 60
      )
    );

  return getMachinauTranslation(
    "shop_closing_hours",
    getCurrentMachinauLanguage()
  ).replace(
    "{N}",
    remainingHoursTotal
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
      return getMachinauTranslation(
        "shop_opens_today_at",
        getCurrentMachinauLanguage()
      ).replace(
        "{START}",
        businessStartTime
      );
    }

    if (nowMinutes >= endMinutes) {
      return getMachinauTranslation(
        "shop_closed_today",
        getCurrentMachinauLanguage()
      );
    }

    return "";
  }

  if (
    endMinutes <= nowMinutes &&
    nowMinutes < startMinutes
  ) {
    return getMachinauTranslation(
      "shop_closed_today",
      getCurrentMachinauLanguage()
    );
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
    return getMachinauTranslation(
      "shop_hours_24",
      getCurrentMachinauLanguage()
    );
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
    return getMachinauTranslation(
      "shop_hours_24",
      getCurrentMachinauLanguage()
    );
  }

  return getMachinauTranslation(
    "shop_hours_range",
    getCurrentMachinauLanguage()
  )
    .replace(
      "{START}",
      businessStartTime
    )
    .replace(
      "{END}",
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
      alt="${getMachinauTranslation(
        "shop_image_alt",
        getCurrentMachinauLanguage()
      ).replace(
        "{SHOP_NAME}",
        escapeHtml(shop.name)
      )}"
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

// api/edit-ad.js の ALLOWED_PAYMENT_METHOD_VALUES と同じ許容値。
// この3種類以外の値はconvertSubmissionToShop()で読み取り時に除外する。
const ALLOWED_PAYMENT_METHOD_VALUES = [
  "cash",
  "card",
  "qr"
];

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
      getMachinauTranslation(
        "shop_name_fallback",
        getCurrentMachinauLanguage()
      )
    );

  const title =
    getFirstText(
      [
        data.title,
        data.adTitle,
        data.headline
      ],
      getMachinauTranslation(
        "shop_title_fallback",
        getCurrentMachinauLanguage()
      )
    );

  const content =
    getFirstText(
      [
        data.content,
        data.message,
        data.description,
        data.details
      ],
      getMachinauTranslation(
        "shop_content_fallback",
        getCurrentMachinauLanguage()
      )
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
      getMachinauTranslation(
        "shop_time_message_fallback",
        getCurrentMachinauLanguage()
      )
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

    takeout:
      Boolean(
        data.takeout
      ),

    paymentMethods:
      Array.isArray(
        data.paymentMethods
      )
        ? data.paymentMethods.filter(
            function(value) {
              return ALLOWED_PAYMENT_METHOD_VALUES.includes(
                value
              );
            }
          )
        : [],

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
        : "",

    authorType:
      typeof data.authorType === "string"
        ? data.authorType.trim()
        : "",

    sourceType:
      typeof data.sourceType === "string"
        ? data.sourceType.trim()
        : ""
  };
}

// shop.paymentMethods(convertSubmissionToShop()で許容値だけに絞り込み済み)から
// カード・詳細モーダル共通の表示用バッジ文言を組み立てる。
// paymentMethodsが空の場合は何も返さない(支払い情報なしとして扱う)。
// cashのみが選ばれている場合だけ「現金のみ」を返し、
// card/qrのいずれかと併用されている場合は「現金のみ」を出さない。
function getPaymentBadgeTexts(
  shop
) {
  if (
    !Array.isArray(
      shop.paymentMethods
    ) ||
    shop.paymentMethods.length === 0
  ) {
    return [];
  }

  const hasCash =
    shop.paymentMethods.includes(
      "cash"
    );

  const hasCard =
    shop.paymentMethods.includes(
      "card"
    );

  const hasQr =
    shop.paymentMethods.includes(
      "qr"
    );

  const badgeTexts =
    [];

  if (hasCard) {
    badgeTexts.push(
      getMachinauTranslation(
        "shop_payment_card",
        getCurrentMachinauLanguage()
      )
    );
  }

  if (hasQr) {
    badgeTexts.push(
      getMachinauTranslation(
        "shop_payment_qr",
        getCurrentMachinauLanguage()
      )
    );
  }

  if (
    hasCash &&
    !hasCard &&
    !hasQr
  ) {
    badgeTexts.push(
      getMachinauTranslation(
        "shop_payment_cash_only",
        getCurrentMachinauLanguage()
      )
    );
  }

  return badgeTexts;
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

// Hero写真の候補選定。getVisibleShops()は変更せず、selectedCategory(カテゴリータブ)に
// 依存しない別ロジックとして、距離/エリア優先度/新しさの考え方だけを再利用する。
// 追加Firestore read・追加GPS取得・追加APIは一切発生しない
// (shops配列・userLatitude/userLongitudeとも既存の値をそのまま読むだけ)。
function selectHeroPhotoCandidate() {
  const candidatesWithPhoto =
    shops.filter(
      function(shop) {
        return (
          Array.isArray(shop.imageUrls) &&
          shop.imageUrls.length > 0
        );
      }
    );

  if (candidatesWithPhoto.length === 0) {
    return null;
  }

  const annotatedCandidates =
    candidatesWithPhoto.map(
      function(shop) {
        let distanceKm =
          null;

        if (
          userLatitude !== null &&
          userLongitude !== null &&
          Number.isFinite(shop.latitude) &&
          Number.isFinite(shop.longitude)
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

  annotatedCandidates.sort(
    function(firstShop, secondShop) {
      if (
        userLatitude !== null &&
        userLongitude !== null
      ) {
        if (
          firstShop.distanceKm === null &&
          secondShop.distanceKm === null
        ) {
          return (
            getDateValue(secondShop.createdAt) -
            getDateValue(firstShop.createdAt)
          );
        }

        if (firstShop.distanceKm === null) {
          return 1;
        }

        if (secondShop.distanceKm === null) {
          return -1;
        }

        return (
          firstShop.distanceKm -
          secondShop.distanceKm
        );
      }

      const firstAreaPriorityRank =
        getAiAreaPriorityRank(firstShop);

      const secondAreaPriorityRank =
        getAiAreaPriorityRank(secondShop);

      if (firstAreaPriorityRank !== secondAreaPriorityRank) {
        return (
          firstAreaPriorityRank -
          secondAreaPriorityRank
        );
      }

      return (
        getDateValue(secondShop.createdAt) -
        getDateValue(firstShop.createdAt)
      );
    }
  );

  return annotatedCandidates[0];
}

// Hero写真表示の更新。候補が0件の場合は既存のグラデーション+波のHeroへ
// フォールバックし、エラー表示・ダミー画像は一切出さない。クリック時は
// 既存のopenShopModal()をそのまま呼び出すだけで、新しいモーダルは作らない。
function updateHeroPhoto() {
  const heroPhotoWrapper =
    document.getElementById("heroPhotoWrapper");

  const heroPhotoButton =
    document.getElementById("heroPhotoButton");

  const heroPhotoImage =
    document.getElementById("heroPhotoImage");

  if (
    !heroPhotoWrapper ||
    !heroPhotoButton ||
    !heroPhotoImage
  ) {
    return;
  }

  const candidate =
    selectHeroPhotoCandidate();

  if (!candidate) {
    heroPhotoWrapper.style.display = "none";
    heroPhotoButton.onclick = null;
    return;
  }

  const photoUrl =
    candidate.imageUrls[0];

  if (heroPhotoImage.src !== photoUrl) {
    heroPhotoImage.src = photoUrl;
  }

  heroPhotoImage.alt =
    getMachinauTranslation(
      "shop_image_alt",
      getCurrentMachinauLanguage()
    ).replace(
      "{SHOP_NAME}",
      escapeHtml(candidate.name)
    );

  heroPhotoButton.onclick =
    function() {
      openShopModal(candidate.firestoreId);
    };

  heroPhotoWrapper.style.display = "";
}

// shops配列・GPS(userLatitude)は、getLocation()・applyLoadedSubmissions()等の
// 既存保護関数の内部で更新される。それらの関数自体には一切手を加えず、
// 変化を検知した時だけHero写真を再評価する軽量ポーリング
// (ネットワーク通信は発生しない、値の比較のみ)。
let heroPhotoLastCheckedShopsLength =
  -1;

let heroPhotoLastCheckedLatitude =
  null;

function checkAndUpdateHeroPhotoIfChanged() {
  if (
    shops.length === heroPhotoLastCheckedShopsLength &&
    userLatitude === heroPhotoLastCheckedLatitude
  ) {
    return;
  }

  heroPhotoLastCheckedShopsLength =
    shops.length;

  heroPhotoLastCheckedLatitude =
    userLatitude;

  updateHeroPhoto();
}

window.setInterval(
  checkAndUpdateHeroPhotoIfChanged,
  1000
);

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
      ${getMachinauTranslation(
        "shops_loading",
        getCurrentMachinauLanguage()
      )}
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
      ${getMachinauTranslation(
        "shop_load_error",
        getCurrentMachinauLanguage()
      )}
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
      ${getMachinauTranslation(
        "shop_map_button",
        getCurrentMachinauLanguage()
      )}
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
      ${getMachinauTranslation(
        "shop_source_link_button",
        getCurrentMachinauLanguage()
      )}
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
      getMachinauTranslation(
        "flash_banner_default_title",
        getCurrentMachinauLanguage()
      );

    flashBannerMessage.textContent =
      getMachinauTranslation(
        "flash_banner_default_message",
        getCurrentMachinauLanguage()
      );

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
    getMachinauTranslation(
      "flash_banner_breaking_prefix",
      getCurrentMachinauLanguage()
    ) +
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

  updateUnifiedImportantInfo();

  // ✨あなたへの提案は60秒更新・カテゴリー切替・お気に入り切替・ホーム復帰の
  // いずれでもrenderShops()経由で再評価する。selectTravelerSuggestionCandidate()
  // 自体はselectedCategoryに依存しないため、カテゴリー切替等で候補が
  // 変わることはない(依存関係を持たないだけで、無条件に再評価しても安全)。
  updateTravelerSuggestionCard();

  // 🔥今日のマチナウもFirestore読込後・60秒更新・GPS/地域確定後のいずれでも
  // renderShops()経由で再評価する(新しいタイマーは作らない)。
  updateTodayMachinauCard();

  // 店舗カード描画専用の配列。getVisibleShops()自体・updateShopMarkers()・
  // updateFlashBanner()・updateUnifiedImportantInfo()はすべてvisibleShops
  // (またはgetVisibleShops()の独自呼び出し)を無変更のまま使い続けるため、
  // この配列を絞り込んでもMap・提案・重要情報には一切影響しない。
  // postType==="admin"(AI自動投稿・運営手動投稿・authorTypeなしの旧admin投稿を
  // 含む全て)を店舗一覧から除外する(TOP・見つける全件表示のどちらでも)。
  const adminExcludedShops =
    visibleShops
      .filter(
        function(shop) {
          return (
            shop.postType !==
            "admin"
          );
        }
      );

  // isShowingAllShopCardsがfalseならTOP用に先頭6件だけ、
  // trueなら見つける全件表示としてadminExcludedShopsをそのまま使う。
  const topShopCardCandidates =
    isShowingAllShopCards
      ? adminExcludedShops
      : adminExcludedShops.slice(
          0,
          6
        );

  const shopsSectionElement =
    document.getElementById(
      "shopsSection"
    );

  if (shopsSectionElement) {
    shopsSectionElement.classList.toggle(
      "shops-show-all",
      isShowingAllShopCards
    );
  }

  const shopMoreButton =
    document.getElementById(
      "shopMoreButton"
    );

  if (shopMoreButton) {
    shopMoreButton.style.display =
      !isShowingAllShopCards &&
      adminExcludedShops.length > 6
        ? ""
        : "none";
  }

  if (
    topShopCardCandidates.length ===
    0
  ) {
    shopsList.innerHTML = `
      <div class="sample-notice">
        ${getMachinauTranslation(
          "shop_empty_category_notice",
          getCurrentMachinauLanguage()
        )}
      </div>
    `;

    return;
  }

  shopsList.innerHTML =
    topShopCardCandidates
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
            <article
              class="shop-card ${
                isAdminPost
                  ? "admin-post-card"
                  : ""
              }"
              onclick="
                if (
                  event.target.closest(
                    'button, a'
                  )
                ) {
                  return;
                }
                openShopModal(
                  '${escapeHtml(
                    shop.firestoreId
                  )}'
                )
              "
            >

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
                    aria-label="${getMachinauTranslation(
                      "shop_favorite_aria_label",
                      getCurrentMachinauLanguage()
                    )}"
                    onclick="
                      event.stopPropagation();
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
                          ${getMachinauTranslation(
                            "shop_admin_badge",
                            getCurrentMachinauLanguage()
                          )}
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
                        : escapeHtml(
                            getMachinauTranslation(
                              "shop_expiry_new",
                              getCurrentMachinauLanguage()
                            )
                          )
                    }
                  </span>

                  <span class="info-chip info-chip-distance">
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

                  ${
                    shop.takeout === true
                      ? `
                        <span class="info-chip">
                          ${getMachinauTranslation(
                            "shop_takeout_ok",
                            getCurrentMachinauLanguage()
                          )}
                        </span>
                      `
                      : ""
                  }

                  ${getPaymentBadgeTexts(
                    shop
                  )
                    .map(
                      function(paymentBadgeText) {
                        return `
                          <span class="info-chip">
                            ${paymentBadgeText}
                          </span>
                        `;
                      }
                    )
                    .join("")}

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
                    ${getMachinauTranslation(
                      "shop_detail_button",
                      getCurrentMachinauLanguage()
                    )}
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
      "<p>" +
      getMachinauTranslation(
        "mypage_favorite_empty",
        getCurrentMachinauLanguage()
      ) +
      "</p>";
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
              alt="${getMachinauTranslation(
                "shop_image_alt",
                getCurrentMachinauLanguage()
              ).replace(
                "{SHOP_NAME}",
                escapeHtml(shop.name)
              )}"
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
                ${getMachinauTranslation(
                  "shop_detail_button",
                  getCurrentMachinauLanguage()
                )}
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
    getMachinauTranslation(
      "modal_slider_image_alt",
      getCurrentMachinauLanguage()
    );

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
        getMachinauTranslation(
          "slider_dot_button",
          getCurrentMachinauLanguage()
        ).replace(
          "{N}",
          index + 1
        )
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
        getMachinauTranslation(
          "slider_prev_button",
          getCurrentMachinauLanguage()
        ),
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
        getMachinauTranslation(
          "slider_next_button",
          getCurrentMachinauLanguage()
        ),
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

    modalMapButtonElement.parentNode.insertBefore(
      modalWebsiteButton,
      modalMapButtonElement.nextSibling
    );
  }

  if (modalWebsiteButton) {
    modalWebsiteButton.textContent =
      getMachinauTranslation(
        "modal_website_button",
        getCurrentMachinauLanguage()
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
    selectedShop.takeout === true
  ) {
    modalText +=
      "<br><br>" +
      getMachinauTranslation(
        "shop_takeout_ok",
        getCurrentMachinauLanguage()
      );
  }

  const modalPaymentBadgeTexts =
    getPaymentBadgeTexts(
      selectedShop
    );

  if (modalPaymentBadgeTexts.length > 0) {
    modalText +=
      "<br><br>" +
      modalPaymentBadgeTexts.join(
        "　"
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

// /api/weather へのリクエストURLを作る直前にのみ使う丸め桁数。
// api/weather.js側のCOORDINATE_ROUNDING_DECIMAL_PLACESと同じ値(2桁)にすることで、
// 近接する生GPS座標が同一のリクエストURLになり、Vercel/CDNの共有キャッシュで
// 同じ地域の複数ユーザーのリクエストを集約できるようにする。
// userLatitude/userLongitude等の元座標そのものは一切変更しない(現在地表示・
// Google Maps・地域判定・距離計算・✨⚡🔥等は引き続き生座標を使用する)。
const WEATHER_REQUEST_COORDINATE_ROUNDING_DECIMAL_PLACES =
  2;


function roundCoordinateForWeatherRequest(value) {
  const roundingFactor =
    Math.pow(
      10,
      WEATHER_REQUEST_COORDINATE_ROUNDING_DECIMAL_PLACES
    );

  return (
    Math.round(
      value * roundingFactor
    ) / roundingFactor
  );
}


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

  const requestLatitude =
    roundCoordinateForWeatherRequest(
      latitude
    );

  const requestLongitude =
    roundCoordinateForWeatherRequest(
      longitude
    );

  const response =
    await fetch(
      "/api/weather?lat=" +
      encodeURIComponent(requestLatitude) +
      "&lon=" +
      encodeURIComponent(requestLongitude)
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
    return getMachinauTranslation(
      "weather_advice_heat",
      getCurrentMachinauLanguage()
    );
  }

  if (
    weather.uvIndex !== null &&
    weather.uvIndex >= 8
  ) {
    return getMachinauTranslation(
      "weather_advice_uv",
      getCurrentMachinauLanguage()
    );
  }

  if (
    weather.chanceOfRain !== null &&
    weather.chanceOfRain >= 50
  ) {
    return getMachinauTranslation(
      "weather_advice_rain",
      getCurrentMachinauLanguage()
    );
  }

  if (
    weather.windKph !== null &&
    weather.windKph >= 20
  ) {
    return getMachinauTranslation(
      "weather_advice_wind",
      getCurrentMachinauLanguage()
    );
  }

  return "";
}


// WeatherAPI.comへのリクエストはapi/weather.js側でlang=ja固定のまま維持する
// (WeatherAPI資金防衛・15分CDN共有キャッシュ・座標2桁正規化・沖縄範囲判定は
// 一切変更しない。言語ごとにWeatherAPIへ別リクエストを送るとCDNキャッシュキーが
// 分裂し、同じ地域の利用者間でのキャッシュ共有が効かなくなり実アクセスが
// 増えるため、そのような設計は採用しない)。
// 日本語以外を選択した場合は、既存のgetWeatherConditionEmoji()と全く同じ
// conditionCode分類を再利用し、天候概況だけをクライアント側で翻訳する。
// これはAPIレスポンスに既に含まれるconditionCodeを再利用するだけであり、
// WeatherAPIへの追加リクエストは一切発生しない。
// getWeatherConditionEmoji()自体は無変更のまま呼び出すだけ。
function getWeatherConditionDisplayText(weather) {
  const language =
    getCurrentMachinauLanguage();

  if (language === MACHINAU_DEFAULT_LANGUAGE) {
    return weather.conditionText || "";
  }

  const emoji =
    getWeatherConditionEmoji(
      weather.conditionCode
    );

  const conditionTranslationKeysByEmoji = {
    "☀️": "weather_condition_sunny",
    "☁️": "weather_condition_cloudy",
    "☂": "weather_condition_rainy",
    "⛈": "weather_condition_stormy",
    "🌫": "weather_condition_foggy"
  };

  const translationKey =
    conditionTranslationKeysByEmoji[emoji] ||
    "weather_condition_fair";

  return getMachinauTranslation(
    translationKey,
    language
  );
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
    getWeatherConditionDisplayText(weather) +
    "　" +
    temperatureText;

  weatherFeelsLike.textContent =
    weather.feelsLikeC !== null
      ? getMachinauTranslation(
          "weather_feels_like_prefix",
          getCurrentMachinauLanguage()
        ) + Math.round(weather.feelsLikeC) + "℃"
      : "";

  const detailParts = [];

  if (weather.chanceOfRain !== null) {
    detailParts.push(
      getMachinauTranslation(
        "weather_rain_chance_prefix",
        getCurrentMachinauLanguage()
      ) + weather.chanceOfRain + "%"
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


// GPS取得1回ごとに増分するセッションID。古いGPS取得の非同期結果が
// 後から届いても、今のGPS取得と無関係な提案生成を行わないためのガード。
let machinauSuggestionGpsSessionId =
  0;

// 既存fetchWeather()の結果を再利用するための一時保持(再取得はしない)
let latestWeatherForMachinauSuggestion =
  null;

// 既存resolveAreaNameFromCoordinates()が完了したかどうか(成功/失敗を問わない)
let isAreaNameResolvedForMachinauSuggestion =
  false;

// loadApprovedSubmissions()によるshops読み込みが完了したかどうか
// (0件で完了した場合もtrue。読み込み中はfalseのまま)
let isShopsLoadedForMachinauSuggestion =
  false;

// 同じGPSセッションで提案を二重生成しないためのガード
let generatedMachinauSuggestionGpsSessionId =
  null;

// Ver1.8 Phase1｜AIコンシェルジュの状態。GPSセッションが変わる、または
// ページを開き直すとリセットされる(sessionStorageキャッシュとは別に、
// 現在の画面表示用に保持する一時状態)。
// status: "idle" | "loading" | "success" | "unavailable"
// gpsSessionIdがmachinauSuggestionGpsSessionIdと一致する間だけ有効とみなす。
let aiConciergeState =
  {
    gpsSessionId: null,
    status: "idle",
    suggestionsByLanguage: {}
  };


// 「マチナウからの提案」専用の広域グループ判定に使う41市町村→8広域グループ
// 対応表。api/admin-source-collect.js の OKINAWA_MUNICIPALITY_TO_REGION_NAME
// と内容を完全に一致させること。記事単位area判定用のOKINAWA_MUNICIPALITY_NAMES
// (サーバー側、変更禁止)とは別物で、クライアント・サーバー間でコードを
// 共有する仕組みがないため、同じ内容をこちらにも複製している。
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


// 「マチナウからの提案」専用の地域優先度判定。既存のgetAiAreaPriorityRank()
// (無変更、意味も変えない)とは完全に独立した新しい関数で、
// selectSuggestionCandidate()だけが使う。getVisibleShops()・通常カード一覧の
// 並び順には一切使わない。
// 0:市町村完全一致 1:userAreaNameが属する広域グループ 2:沖縄県全域
// 3:それ以外(空欄・未設定を含む)
// userAreaNameがnull/空文字の場合は誤って広域一致させないよう常に3を返す。
function getSuggestionAreaPriorityRank(
  shop
) {
  if (
    shop.postType !== "admin" ||
    userAreaName === null ||
    userAreaName === ""
  ) {
    return 3;
  }

  if (shop.area === userAreaName) {
    return 0;
  }

  const regionNameForUserArea =
    OKINAWA_MUNICIPALITY_TO_REGION_NAME[
      userAreaName
    ];

  if (
    typeof regionNameForUserArea === "string" &&
    shop.area === regionNameForUserArea
  ) {
    return 1;
  }

  if (shop.area === AI_AUTO_POST_WIDE_AREA_NAME) {
    return 2;
  }

  return 3;
}


// 「マチナウからの提案」の通常候補内で、同一の地域優先度
// (getSuggestionAreaPriorityRank)を持つ候補同士だけを並べ替えるための
// カテゴリー優先度。0:イベント 1:観光・体験 2:その他
// 地域優先度より上位のキーとしては絶対に使わない(第2ソートキー専用)。
function getSuggestionCategoryPriorityRank(
  shop
) {
  if (shop.category === "イベント") {
    return 0;
  }

  if (shop.category === "観光・体験") {
    return 1;
  }

  return 2;
}


// getVisibleShops()・shopMatchesFlashBannerKeywords()は一切変更せず、
// その結果を読むだけで「マチナウからの提案」の対象を選ぶ。
// 安全・交通・ライフライン該当の投稿があっても、現在地と無関係な地域
// (getSuggestionAreaPriorityRankが3を返す投稿)は安全最優先候補にしない。
function selectSuggestionCandidate() {
  const adminShops =
    getVisibleShops().filter(
      function(shop) {
        return shop.postType === "admin";
      }
    );

  if (adminShops.length === 0) {
    return null;
  }

  const nearbyAdminShops =
    adminShops
      .filter(
        function(shop) {
          return (
            getSuggestionAreaPriorityRank(
              shop
            ) <= 2
          );
        }
      )
      .sort(
        function(firstShop, secondShop) {
          return (
            getSuggestionAreaPriorityRank(
              firstShop
            ) -
            getSuggestionAreaPriorityRank(
              secondShop
            )
          );
        }
      );

  const safetyShop =
    nearbyAdminShops.find(
      function(shop) {
        return shopMatchesFlashBannerKeywords(
          shop
        );
      }
    );

  if (safetyShop) {
    return {
      shop: safetyShop,
      isSafety: true
    };
  }

  // 安全情報が無い場合だけ、category が「イベント」「観光・体験」の
  // 投稿だけをホワイトリストとして通常候補にする(「お知らせ」は対象外)。
  // 同じ地域優先度の中ではイベント→観光・体験の順に並べ替える。
  // nearbyAdminShops自体(地域優先度の並び)は変更しない。
  const normalCandidates =
    nearbyAdminShops
      .filter(
        function(shop) {
          return (
            shop.category === "イベント" ||
            shop.category === "観光・体験"
          );
        }
      )
      .sort(
        function(firstShop, secondShop) {
          const areaPriorityDifference =
            getSuggestionAreaPriorityRank(
              firstShop
            ) -
            getSuggestionAreaPriorityRank(
              secondShop
            );

          if (areaPriorityDifference !== 0) {
            return areaPriorityDifference;
          }

          return (
            getSuggestionCategoryPriorityRank(
              firstShop
            ) -
            getSuggestionCategoryPriorityRank(
              secondShop
            )
          );
        }
      );

  if (normalCandidates.length === 0) {
    return null;
  }

  return {
    shop: normalCandidates[0],
    isSafety: false
  };
}


// ✨「あなたへの提案」専用の候補選定。selectSuggestionCandidate()本体には
// 一切触れず、店舗一覧のselectedCategoryにも依存しない(getVisibleShops()
// ではなくグローバルshops配列全体を対象にするため、カテゴリー切替・
// お気に入り切替の影響を受けない)。既存のgetSuggestionAreaPriorityRank()・
// getSuggestionCategoryPriorityRank()・shopMatchesFlashBannerKeywords()・
// getDateValue()はいずれも無変更のまま呼び出すだけ。
// 緊急・防災・ライフライン・交通障害(shopMatchesFlashBannerKeywords()一致)は
// 明示的に除外し、この枠では扱わない(将来「今、知っておきたいこと」へ集約)。
// authorType==="admin"(運営手動投稿)も明示的に除外する(🔥今日のマチナウ専用
// にするため、selectTodayMachinauCandidate()との重複を防ぐ)。ただし
// authorType===""(旧admin投稿、authorType未設定)は後方互換のため
// 自動除外しない。
function selectTravelerSuggestionCandidate() {
  const candidates =
    shops
      .filter(function(shop) {
        return (
          shop.postType === "admin" &&
          shop.authorType !== "admin" &&
          getSuggestionAreaPriorityRank(shop) <= 2 &&
          (
            shop.category === "イベント" ||
            shop.category === "観光・体験"
          ) &&
          shopMatchesFlashBannerKeywords(shop) === false
        );
      })
      .sort(function(firstShop, secondShop) {
        const areaPriorityDifference =
          getSuggestionAreaPriorityRank(firstShop) -
          getSuggestionAreaPriorityRank(secondShop);

        if (areaPriorityDifference !== 0) {
          return areaPriorityDifference;
        }

        const categoryPriorityDifference =
          getSuggestionCategoryPriorityRank(firstShop) -
          getSuggestionCategoryPriorityRank(secondShop);

        if (categoryPriorityDifference !== 0) {
          return categoryPriorityDifference;
        }

        return (
          getDateValue(secondShop.createdAt) -
          getDateValue(firstShop.createdAt)
        );
      });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
}


// Ver1.8 Phase1｜AIコンシェルジュへ渡す候補一覧。selectTravelerSuggestionCandidate()
// と全く同じ絞り込み条件・並び順を使うが、先頭1件だけでなく最大
// AI_CONCIERGE_MAX_CANDIDATES件を返す点だけが異なる。selectTravelerSuggestionCandidate()
// 自体は無変更のまま保持し、フォールバック用の候補選定として引き続き使う。
const AI_CONCIERGE_MAX_CANDIDATES =
  5;

// Ver1.8 Phase1(実機不具合調査用・Preview専用診断)｜代表がDevTools/Consoleを
// 開かなくても、スマホ画面を見るだけでAIコンシェルジュの内部状態を判定
// できるようにするための一時的な画面内診断。本番mainへは絶対に入れない
// (このブロックごと削除してからmainへマージする)。Secret・Token・座標・
// 市町村名・個人情報は一切表示しない(真偽値・件数・状態名のみ)。
// このID文字列はgitのcommit hashとは別に、診断コードそのものの版を表す
// (commit前にhashが分からないため)。
const PREVIEW_DIAGNOSTIC_BUILD_LABEL =
  "diag-2026-08-26-01";

function renderPreviewDiagnosticOverlay() {
  let overlay =
    document.getElementById(
      "machinauPreviewDiagnosticOverlay"
    );

  if (!overlay) {
    overlay =
      document.createElement(
        "div"
      );

    overlay.id =
      "machinauPreviewDiagnosticOverlay";

    overlay.style.position =
      "fixed";
    overlay.style.bottom =
      "0";
    overlay.style.left =
      "0";
    overlay.style.right =
      "0";
    overlay.style.zIndex =
      "999999";
    overlay.style.background =
      "rgba(0, 0, 0, 0.78)";
    overlay.style.color =
      "#00ff90";
    overlay.style.fontSize =
      "10px";
    overlay.style.lineHeight =
      "1.4";
    overlay.style.fontFamily =
      "monospace";
    overlay.style.padding =
      "4px 6px";
    overlay.style.whiteSpace =
      "pre-wrap";
    overlay.style.pointerEvents =
      "none";

    document.body.appendChild(
      overlay
    );
  }

  const gpsReadyText =
    Number.isFinite(userLatitude) &&
    Number.isFinite(userLongitude)
      ? "ready"
      : "not-ready";

  const weatherReadyText =
    latestWeatherForMachinauSuggestion !== null
      ? "ready"
      : "not-ready";

  const areaText =
    !isAreaNameResolvedForMachinauSuggestion
      ? "pending"
      : (typeof userAreaName === "string" && userAreaName !== ""
          ? "ready"
          : "resolved-but-unavailable");

  const shopsReadyText =
    isShopsLoadedForMachinauSuggestion
      ? "ready(" + shops.length + ")"
      : "not-ready";

  overlay.textContent =
    "build:" +
    PREVIEW_DIAGNOSTIC_BUILD_LABEL +
    " gps:" +
    gpsReadyText +
    " weather:" +
    weatherReadyText +
    " area:" +
    areaText +
    " shops:" +
    shopsReadyText +
    " gpsSession:" +
    machinauSuggestionGpsSessionId +
    " aiStatus:" +
    aiConciergeState.status +
    " aiSession:" +
    aiConciergeState.gpsSessionId;
}

// Ver1.8 Phase1(実機不具合調査・修正)｜クライアントから/api/moderate-submission
// (mode=aiConcierge)へのfetch()には元々タイムアウトが無く、実ブラウザでの
// 検証で、接続が途中で切れる状況下ではfetch()が拒否されるまで15秒以上かかる
// ことを確認した(サーバー側のAI_CONCIERGE_TIMEOUT_MS=8000より大幅に長い)。
// その間aiConciergeState.statusは"loading"のまま固着し、✨カードが
// 「AIが今のあなたに合う提案を考えています…」表示から進まなくなる。
// サーバー側の時間予算(8秒)に余裕を持たせた値でクライアント側にも
// タイムアウトを設け、必ずunavailable状態へ遷移してフォールバック
// 表示へ進めるようにする。
const AI_CONCIERGE_CLIENT_FETCH_TIMEOUT_MS =
  12000;

// Ver1.8 Phase1(重要情報優先の確認・修正)｜"factual_info"候補にのみ付与する
// 短い事実要約(shop.messageの先頭のみ)の最大文字数。全文送信は行わず、
// トークン増加を抑えるため短く保つ。
const AI_CONCIERGE_FACT_SUMMARY_MAX_LENGTH =
  80;

function selectAiConciergeCandidates() {
  return shops
    .filter(function(shop) {
      return (
        shop.postType === "admin" &&
        shop.authorType !== "admin" &&
        getSuggestionAreaPriorityRank(shop) <= 2 &&
        (
          shop.category === "イベント" ||
          shop.category === "観光・体験"
        ) &&
        shopMatchesFlashBannerKeywords(shop) === false
      );
    })
    .sort(function(firstShop, secondShop) {
      const areaPriorityDifference =
        getSuggestionAreaPriorityRank(firstShop) -
        getSuggestionAreaPriorityRank(secondShop);

      if (areaPriorityDifference !== 0) {
        return areaPriorityDifference;
      }

      const categoryPriorityDifference =
        getSuggestionCategoryPriorityRank(firstShop) -
        getSuggestionCategoryPriorityRank(secondShop);

      if (categoryPriorityDifference !== 0) {
        return categoryPriorityDifference;
      }

      return (
        getDateValue(secondShop.createdAt) -
        getDateValue(firstShop.createdAt)
      );
    })
    .slice(0, AI_CONCIERGE_MAX_CANDIDATES);
}


// Ver1.8 Phase1(設計修正)｜以下4つは、それぞれ⚡🔥の既存候補選定関数
// (selectFactualImportantInfoCandidate()・selectTodayMachinauCandidate())と
// 全く同じ絞り込み条件・並び順を使うが、先頭1件だけでなく複数件を返す点だけが
// 異なる。selectFactualImportantInfoCandidate()・selectTodayMachinauCandidate()
// 自体は無変更のまま保持し、⚡🔥表示用の候補選定として引き続き使う。

// Ver1.8 Phase1(重要情報優先の確認・修正)｜AIコンシェルジュの候補プール
//構築にのみ使う「重要情報」判定。既存のFLASH_BANNER_*_KEYWORDS・
// FACTUAL_IMPORTANT_INFO_SOURCE_TYPESはadmin-source-collect.jsの
// DRAFT_*_KEYWORDSと同期が必要な既存資産のため変更しない。実際の⚡カード
// 表示(selectFactualImportantInfoCandidate())にも一切影響しない。
// 台風・警報等の既存キーワードに加え、休園・臨時休業等の閉鎖・臨時変更を
// 示す語も対象に含め、情報源sourceTypeも「観光施設」(施設公式発表)を
// 追加で許容する(ジャングリア沖縄等の公式発表が「観光施設」区分で
// 登録される可能性があるため)。
// Ver1.8 Phase1(GPSボタン不具合修正)｜AI_CONCIERGE_IMPORTANT_SOURCE_TYPESは
// FACTUAL_IMPORTANT_INFO_SOURCE_TYPES(このファイル下方で定義)を参照するため、
// 定義前参照(TDZ)を避けるためFACTUAL_IMPORTANT_INFO_SOURCE_TYPESの定義直後に
// 移設している(このファイル下方を参照)。

const AI_CONCIERGE_CLOSURE_KEYWORDS =
  [
    "休園", "休館", "臨時休業", "閉園", "閉館",
    "営業時間変更", "時間変更", "中止", "延期"
  ];

function matchesAiConciergeImportantKeywords(
  shop
) {
  const combinedText =
    (shop.title || "") +
    " " +
    (shop.message || "");

  return (
    FLASH_BANNER_EMERGENCY_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    ) ||
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
    AI_CONCIERGE_CLOSURE_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    )
  );
}

function selectFactualImportantInfoCandidatesForAiConcierge() {
  return shops
    .filter(function(shop) {
      if (shop.postType !== "admin") {
        return false;
      }

      if (shop.authorType !== "ai") {
        return false;
      }

      if (
        AI_CONCIERGE_IMPORTANT_SOURCE_TYPES.includes(
          shop.sourceType
        ) === false
      ) {
        return false;
      }

      // Ver1.8 Phase1(重要情報優先の確認・修正)｜AIコンシェルジュ候補プールでは
      // 「重要情報」であることを示すキーワードに一致した場合のみ対象とする
      // (地域優先度によるフォールバック採用はしない。台風・警報・休園等は
      // 地域が多少ずれていても優先して検討させたいため)。
      return matchesAiConciergeImportantKeywords(
        shop
      );
    })
    .sort(function(firstShop, secondShop) {
      const areaPriorityDifference =
        getSuggestionAreaPriorityRank(firstShop) -
        getSuggestionAreaPriorityRank(secondShop);

      if (areaPriorityDifference !== 0) {
        return areaPriorityDifference;
      }

      return (
        getDateValue(secondShop.createdAt) -
        getDateValue(firstShop.createdAt)
      );
    });
}


function selectTodayMachinauCandidatesForAiConcierge() {
  return shops
    .filter(function(shop) {
      return (
        shop.postType === "admin" &&
        shop.authorType === "admin" &&
        getSuggestionAreaPriorityRank(shop) <= 2
      );
    })
    .sort(function(firstShop, secondShop) {
      const areaPriorityDifference =
        getSuggestionAreaPriorityRank(firstShop) -
        getSuggestionAreaPriorityRank(secondShop);

      if (areaPriorityDifference !== 0) {
        return areaPriorityDifference;
      }

      return (
        getDateValue(secondShop.createdAt) -
        getDateValue(firstShop.createdAt)
      );
    });
}


// 一般店舗・施設用。getSuggestionAreaPriorityRank()はpostType!=="admin"の
// shopには常に3(最低)を返す設計(admin/AIコンテンツ専用の地域優先度判定)
// のため、一般店舗の絞り込みには使えない。post.html経由の投稿はarea
// フィールドを持たないことが多いため、既存calculateDistance()による
// 距離順ソートのみを用いる(新しいスコアリングは作らない)。緯度経度が
// 双方とも取得できない店舗は「明らかに無関係かどうか判定できない」ため
// 候補に含めない。
function selectGeneralShopCandidatesForAiConcierge() {
  if (
    !Number.isFinite(userLatitude) ||
    !Number.isFinite(userLongitude)
  ) {
    return [];
  }

  return shops
    .filter(function(shop) {
      return (
        shop.postType !== "admin" &&
        Number.isFinite(shop.latitude) &&
        Number.isFinite(shop.longitude)
      );
    })
    .sort(function(firstShop, secondShop) {
      return (
        calculateDistance(
          userLatitude,
          userLongitude,
          firstShop.latitude,
          firstShop.longitude
        ) -
        calculateDistance(
          userLatitude,
          userLongitude,
          secondShop.latitude,
          secondShop.longitude
        )
      );
    });
}


// 地域おすすめ用。showRegionRecommendationsForArea()が既にisPublished・
// targetAreas(userAreaName一致)で絞り込み済みのregionRecommendationArticles
// をそのまま使う(追加のFirestore読み取り・追加フィルタは行わない)。
function selectRegionRecommendationCandidatesForAiConcierge() {
  return Array.isArray(regionRecommendationArticles)
    ? regionRecommendationArticles
    : [];
}


// Ver1.8 Phase1(設計修正)｜候補1件(shop)をAIコンシェルジュ用の共通形式へ
// 変換する。sourceTypeはAIへの説明用ラベルであり、内部の3枠分離条件には
// 一切使わない(条件は各select...ForAiConcierge()側で既に確定済み)。
function buildAiConciergeCandidateFromShop(
  shop,
  sourceType
) {
  const distanceKm =
    Number.isFinite(userLatitude) &&
    Number.isFinite(userLongitude) &&
    Number.isFinite(shop.latitude) &&
    Number.isFinite(shop.longitude)
      ? calculateDistance(
          userLatitude,
          userLongitude,
          shop.latitude,
          shop.longitude
        )
      : null;

  let availabilityHint =
    "";

  if (shop.isOpen24Hours) {
    availabilityHint =
      "24時間";
  } else if (
    shop.businessStartTime &&
    shop.businessEndTime
  ) {
    availabilityHint =
      shop.businessStartTime +
      "〜" +
      shop.businessEndTime;
  }

  // Ver1.8 Phase1(重要情報優先の確認・修正)｜title/category/availabilityHintだけ
  // では「休園」等の事実が欠落し得るため、"factual_info"(重要情報)候補に限り、
  // 既存shop.message(本文、追加のFirestore取得なし)の先頭のみを短い事実要約
  // として付与する。本文全文は送らず、他のsourceType(shop/traveler_suggestion等、
  // 通常は件数も多い)には付けないことでトークン増加を抑える。
  const factSummary =
    sourceType === "factual_info" &&
    typeof shop.message === "string"
      ? shop.message
          .trim()
          .slice(0, AI_CONCIERGE_FACT_SUMMARY_MAX_LENGTH)
      : "";

  return {
    id: "shop:" + shop.firestoreId,
    sourceType: sourceType,
    title: shop.title,
    category: shop.category,
    area: shop.area,
    distanceKm:
      distanceKm !== null
        ? Math.round(distanceKm * 10) / 10
        : null,
    availabilityHint: availabilityHint,
    factSummary: factSummary
  };
}


// 地域おすすめ1件をAIコンシェルジュ用の共通形式へ変換する。idが
// 取得できない記事(showRegionRecommendationsForArea()の変更前に
// 取得された等)はnullを返し、呼び出し元で除外する。
function buildAiConciergeCandidateFromRegionArticle(
  article
) {
  if (
    !article ||
    typeof article.id !== "string" ||
    article.id === ""
  ) {
    return null;
  }

  return {
    id: "region:" + article.id,
    sourceType: "region_recommendation",
    title:
      typeof article.title === "string"
        ? article.title
        : "",
    category: "",
    area:
      typeof article.regionName === "string"
        ? article.regionName
        : "",
    distanceKm: null,
    availabilityHint: ""
  };
}


// Ver1.8 Phase1(設計修正)｜AIコンシェルジュ専用の候補プール。
// マチナウが既に持っている安全な情報源(⚡→🔥→✨→地域おすすめ→一般店舗の順)
// から、既存の各選定関数(いずれも無変更)をそのまま使って集め、
// 最大AI_CONCIERGE_MAX_CANDIDATES件になった時点で打ち切る。新しい
// スコアリング式は作らず、各情報源が既に持つ並び順(地域優先・緊急度・
// 距離・新しさ)と、この優先順(タプル)だけで絞り込む。IDが重複した場合
// のみ後続を捨てる(実際にはid種別・条件が排他的なため通常は発生しない)。
function buildAiConciergeCandidatePool() {
  const pooledCandidates =
    [];

  const seenCandidateIds =
    {};

  function addCandidateIfRoom(candidate) {
    if (
      !candidate ||
      pooledCandidates.length >= AI_CONCIERGE_MAX_CANDIDATES
    ) {
      return;
    }

    if (seenCandidateIds[candidate.id]) {
      return;
    }

    seenCandidateIds[candidate.id] =
      true;

    pooledCandidates.push(
      candidate
    );
  }

  selectFactualImportantInfoCandidatesForAiConcierge().forEach(
    function(shop) {
      addCandidateIfRoom(
        buildAiConciergeCandidateFromShop(
          shop,
          "factual_info"
        )
      );
    }
  );

  selectTodayMachinauCandidatesForAiConcierge().forEach(
    function(shop) {
      addCandidateIfRoom(
        buildAiConciergeCandidateFromShop(
          shop,
          "official_today"
        )
      );
    }
  );

  selectAiConciergeCandidates().forEach(
    function(shop) {
      addCandidateIfRoom(
        buildAiConciergeCandidateFromShop(
          shop,
          "traveler_suggestion"
        )
      );
    }
  );

  selectRegionRecommendationCandidatesForAiConcierge().forEach(
    function(article) {
      addCandidateIfRoom(
        buildAiConciergeCandidateFromRegionArticle(
          article
        )
      );
    }
  );

  selectGeneralShopCandidatesForAiConcierge().forEach(
    function(shop) {
      addCandidateIfRoom(
        buildAiConciergeCandidateFromShop(
          shop,
          "shop"
        )
      );
    }
  );

  return pooledCandidates;
}


// Ver1.8 Phase1(設計修正)｜AIが返したsuggestedCandidateId(プレフィックス付き)
// から、実在データを解決する。"shop:"はshops配列(Firestore submissions)、
// "region:"はregionRecommendationArticlesを正本とし、いずれも見つからなければ
// nullを返す(呼び出し元が描画を諦めてルールベースへ委ねる)。
function resolveAiConciergeCandidateRealData(
  candidateId
) {
  if (typeof candidateId !== "string") {
    return null;
  }

  if (candidateId.indexOf("shop:") === 0) {
    const firestoreId =
      candidateId.slice("shop:".length);

    const matchedShop =
      shops.find(function(shop) {
        return (
          shop.firestoreId ===
          firestoreId
        );
      });

    if (!matchedShop) {
      return null;
    }

    return {
      title: matchedShop.title,

      openDetail: function() {
        openShopModal(
          matchedShop.firestoreId
        );
      }
    };
  }

  if (candidateId.indexOf("region:") === 0) {
    const articleId =
      candidateId.slice("region:".length);

    const matchedArticle =
      Array.isArray(regionRecommendationArticles)
        ? regionRecommendationArticles.find(
            function(article) {
              return (
                article &&
                article.id === articleId
              );
            }
          )
        : null;

    if (!matchedArticle) {
      return null;
    }

    return {
      title:
        typeof matchedArticle.title === "string"
          ? matchedArticle.title
          : "",

      // 地域おすすめには既存の詳細モーダルが無いため、詳細ボタンは
      // 表示しない(新しいモーダルは作らない)。
      openDetail: null
    };
  }

  return null;
}


// getWeatherConditionEmoji()の分類結果と、buildWeatherAdviceText()と同じ
// heatIndexC(なければtemperatureC)の35℃基準を再利用して天候を分類する。
// getWeatherConditionEmoji()・buildWeatherAdviceText()自体は変更しない。
function resolveSuggestionWeatherCategory(weather) {
  const heatIndexForCategory =
    weather.heatIndexC !== null
      ? weather.heatIndexC
      : weather.temperatureC;

  if (
    heatIndexForCategory !== null &&
    heatIndexForCategory >= 35
  ) {
    return "HOT";
  }

  const conditionEmoji =
    getWeatherConditionEmoji(
      weather.conditionCode
    );

  if (
    conditionEmoji === "☂" ||
    conditionEmoji === "⛈"
  ) {
    return "RAIN";
  }

  if (
    conditionEmoji === "☀️" ||
    conditionEmoji === "☁️"
  ) {
    return "SUNNY";
  }

  return "OTHER";
}


function buildSuggestionMessageText(candidate, weather) {
  const shopTitle =
    candidate.shop.title;

  if (candidate.isSafety) {
    return getMachinauTranslation(
      "suggestion_safety",
      getCurrentMachinauLanguage()
    ).replace(
      "{TITLE}",
      shopTitle
    );
  }

  const weatherCategory =
    resolveSuggestionWeatherCategory(
      weather
    );

  if (weatherCategory === "RAIN") {
    return getMachinauTranslation(
      "suggestion_rain",
      getCurrentMachinauLanguage()
    ).replace(
      "{TITLE}",
      shopTitle
    );
  }

  if (weatherCategory === "HOT") {
    return getMachinauTranslation(
      "suggestion_hot",
      getCurrentMachinauLanguage()
    ).replace(
      "{TITLE}",
      shopTitle
    );
  }

  if (weatherCategory === "SUNNY") {
    return getMachinauTranslation(
      "suggestion_sunny",
      getCurrentMachinauLanguage()
    ).replace(
      "{TITLE}",
      shopTitle
    );
  }

  return getMachinauTranslation(
    "suggestion_general",
    getCurrentMachinauLanguage()
  ).replace(
    "{TITLE}",
    shopTitle
  );
}


function updateSuggestionCard(weather) {
  const suggestionCard =
    document.getElementById("suggestionCard");

  const suggestionMessage =
    document.getElementById("suggestionMessage");

  const suggestionDetailButton =
    document.getElementById("suggestionDetailButton");

  if (
    !suggestionCard ||
    !suggestionMessage ||
    !suggestionDetailButton
  ) {
    return;
  }

  const candidate =
    selectSuggestionCandidate();

  if (!candidate) {
    suggestionCard.style.display = "none";
    suggestionDetailButton.style.display = "none";
    suggestionDetailButton.onclick = null;
    return;
  }

  suggestionMessage.textContent =
    buildSuggestionMessageText(
      candidate,
      weather
    );

  suggestionDetailButton.style.display = "";

  suggestionDetailButton.onclick =
    function() {
      openShopModal(
        candidate.shop.firestoreId
      );
    };

  suggestionCard.style.display = "";
}


// ✨「あなたへの提案」専用の薄い更新関数。updateSuggestionCard()本体には
// 一切触れず、#suggestionCardのDOMだけを再利用する。候補選定は
// selectTravelerSuggestionCandidate()(selectedCategoryに非依存)、
// メッセージ生成は既存buildSuggestionMessageText()をそのまま再利用する
// (isSafetyは常にfalseを渡す。selectTravelerSuggestionCandidate()が
// 安全系を候補から除外済みのため)。
// userAreaName未確定(GPS未取得)、または天候未取得の場合は必ず非表示にする。
// 那覇等へのフォールバック表示は行わない。
function updateTravelerSuggestionCard() {
  // Preview診断用ログ(本番mainへ入れるかは代表判断・後で削除可)。
  // Secret・Token・座標詳細・個人情報は一切出力しない。
  console.log(
    "[AIConcierge Debug] updateTravelerSuggestionCard start status=" +
      aiConciergeState.status
  );

  const suggestionCard =
    document.getElementById("suggestionCard");

  const suggestionMessage =
    document.getElementById("suggestionMessage");

  const suggestionDetailButton =
    document.getElementById("suggestionDetailButton");

  if (
    !suggestionCard ||
    !suggestionMessage ||
    !suggestionDetailButton
  ) {
    return;
  }

  // Ver1.8｜GPS取得前を独立カードとして見せるための追加専用の要素参照。
  // この先の本物の提案ロジック(selectedShop以降)には一切関与しない。
  const suggestionPlaceholderMain =
    document.getElementById("suggestionPlaceholderMain");

  const suggestionPlaceholderCtaButton =
    document.getElementById("suggestionPlaceholderCtaButton");

  if (suggestionPlaceholderMain) {
    suggestionPlaceholderMain.style.display = "none";
  }

  if (suggestionPlaceholderCtaButton) {
    suggestionPlaceholderCtaButton.style.display = "none";
  }

  // Ver1.8 Phase1(プレースホルダー固着修正)｜GPS未取得かどうかは、既存の
  // userLatitude/userLongitude(getLocation()成功時にのみ設定される、
  // getLocation()自体は無変更)で判定する。userAreaNameは地域名解決
  // (resolveAreaNameFromCoordinates())が失敗した場合に空のまま残り得るが、
  // これはGPS未取得とは別の状態のため、プレースホルダー判定には使わない
  // (地域名がnullでもGPS取得済みならAIコンシェルジュ/フォールバックへ進む)。
  const isGpsAcquiredForSuggestion =
    Number.isFinite(userLatitude) &&
    Number.isFinite(userLongitude);

  console.log(
    "[AIConcierge Debug] placeholder gate gpsReady=" +
      isGpsAcquiredForSuggestion +
      " areaNameAvailable=" +
      (typeof userAreaName === "string" && userAreaName !== "")
  );

  // Ver1.8 Phase1(診断ログ・実機切り分け用)｜個人情報・Secret・Token・
  // 緯度経度・市町村名は出さない。
  console.log(
    "[AIConcierge Trace] cardUpdate gpsReady=" +
      isGpsAcquiredForSuggestion +
      " weatherReady=" +
      (latestWeatherForMachinauSuggestion !== null) +
      " status=" +
      aiConciergeState.status
  );

  renderPreviewDiagnosticOverlay();

  if (
    !isGpsAcquiredForSuggestion ||
    latestWeatherForMachinauSuggestion === null
  ) {
    // Ver1.8｜GPS未取得時は非表示にせず、マチナウの提案機能そのものを
    // 独立カードとして案内する。GPS取得成功後はこのifを通らなくなり、
    // 既存ロジックがそのまま本来の提案へ置き換える。
    if (suggestionPlaceholderMain) {
      suggestionPlaceholderMain.style.display = "";
    }

    if (suggestionPlaceholderCtaButton) {
      suggestionPlaceholderCtaButton.style.display = "";
    }

    suggestionMessage.textContent =
      getMachinauTranslation(
        "suggestion_placeholder_message",
        getCurrentMachinauLanguage()
      );

    suggestionDetailButton.style.display = "none";
    suggestionDetailButton.onclick = null;
    suggestionCard.style.display = "";
    return;
  }

  // Ver1.8 Phase1｜AIコンシェルジュの状態がこのGPSセッションのものであれば、
  // ルールベースより先に確認する。この先のルールベース処理
  // (selectTravelerSuggestionCandidate()以降)は一切変更しない。AI側が
  // loading/success以外(unavailable・古いセッション・対象言語の結果なし)
  // の場合は、必ずこの先のルールベース処理まで到達してフォールバックする。
  const currentLanguageForAiConcierge =
    getCurrentMachinauLanguage();

  if (
    aiConciergeState.gpsSessionId ===
    machinauSuggestionGpsSessionId
  ) {
    if (aiConciergeState.status === "loading") {
      suggestionMessage.textContent =
        getMachinauTranslation(
          "suggestion_ai_loading",
          currentLanguageForAiConcierge
        );

      suggestionDetailButton.style.display = "none";
      suggestionDetailButton.onclick = null;
      suggestionCard.style.display = "";
      return;
    }

    // Ver1.8 Phase1(設計修正)｜候補プールが0件だった専用状態。
    // GPS取得前のプレースホルダー(userAreaName未確定時の分岐)へは
    // 戻さず、✨カードを維持したまま専用の案内文を表示する。
    // ルールベースへは進まない(候補プールにはselectTravelerSuggestionCandidate()
    // の対象も含まれているため、ここが0件ならルールベースも通常0件になる)。
    if (aiConciergeState.status === "empty") {
      suggestionMessage.textContent =
        getMachinauTranslation(
          "suggestion_no_candidates_message",
          currentLanguageForAiConcierge
        );

      suggestionDetailButton.style.display = "none";
      suggestionDetailButton.onclick = null;
      suggestionCard.style.display = "";
      return;
    }

    if (aiConciergeState.status === "success") {
      const cachedAiSuggestion =
        aiConciergeState.suggestionsByLanguage[
          currentLanguageForAiConcierge
        ];

      if (cachedAiSuggestion) {
        const didRenderAiSuggestion =
          renderAiConciergeSuggestionContent(
            cachedAiSuggestion,
            suggestionMessage,
            suggestionDetailButton
          );

        if (didRenderAiSuggestion) {
          suggestionCard.style.display = "";
          return;
        }
      }
    }
  }

  // Ver1.8 Phase1(カード非表示禁止の修正)｜ここに到達するのは、AI状態が
  // このセッションにまだ紐付いていない・AI応答が失敗/不正だった・言語別
  // キャッシュが無い等、理由を問わずAI経路で描画できなかった場合。
  // 以前はここで既存の狭いselectTravelerSuggestionCandidate()(postType==="admin"
  // かつイベント/観光・体験限定)だけを見てcandidate無しならカードを
  // display:noneにしていたが、AIコンシェルジュの候補プールが一般店舗・
  // 地域おすすめまで広がった現在、この狭いフォールバックだけでは
  // 「候補は実在するのにカードが消える」状態になり得る。
  // selectTravelerSuggestionCandidate()本体・buildSuggestionMessageText()は
  // 一切変更せず、単にこの最終フォールバックでの呼び出しをやめ、AI
  // コンシェルジュ用の候補プール(buildAiConciergeCandidatePool()、
  // factual_info→今日のマチナウ→従来✨候補→地域おすすめ→一般店舗の
  // 優先順、新しいスコアリングは追加しない)の先頭候補を、AI生成文を
  // 使わず安全に表示する。GPS取得後にこの経路でカードを非表示にする
  // ことはない。
  //
  // Preview診断用｜buildAiConciergeCandidatePool()〜renderAiConciergeFallbackContent()
  // だけをtry/catchで保護する。未捕捉のJavaScript例外があった場合でも
  // ✨カードを消さず、内部事情を含まない安全な専用文言(suggestion_fallback_error_message)
  // へ切り替える。catchした例外はconsole.errorへ出力し、次回の実機確認で
  // 原因を確定できるようにする(Secret・Token・座標詳細・個人情報は出さない)。
  console.log(
    "[AIConcierge Debug] fallback start"
  );

  try {
    const fallbackCandidates =
      buildAiConciergeCandidatePool();

    console.log(
      "[AIConcierge Debug] candidatePool build success size=" +
        fallbackCandidates.length
    );

    if (fallbackCandidates.length === 0) {
      console.log(
        "[AIConcierge Debug] fallbackCandidateFound=false finalCardState=empty"
      );

      suggestionMessage.textContent =
        getMachinauTranslation(
          "suggestion_no_candidates_message",
          currentLanguageForAiConcierge
        );

      suggestionDetailButton.style.display = "none";
      suggestionDetailButton.onclick = null;
      suggestionCard.style.display = "";
      return;
    }

    const fallbackCandidate =
      fallbackCandidates[0];

    console.log(
      "[AIConcierge Debug] fallbackSourceType=" +
        fallbackCandidate.sourceType +
        " fallbackCandidateFound=true"
    );

    console.log(
      "[AIConcierge Debug] render start"
    );

    const didRenderFallback =
      renderAiConciergeFallbackContent(
        fallbackCandidate,
        currentLanguageForAiConcierge,
        suggestionMessage,
        suggestionDetailButton
      );

    console.log(
      "[AIConcierge Debug] render " +
        (didRenderFallback ? "success" : "failed") +
        " finalCardState=" +
        (didRenderFallback ? "fallback_rendered" : "empty_unresolvable")
    );

    if (!didRenderFallback) {
      suggestionMessage.textContent =
        getMachinauTranslation(
          "suggestion_no_candidates_message",
          currentLanguageForAiConcierge
        );

      suggestionDetailButton.style.display = "none";
      suggestionDetailButton.onclick = null;
    }

    suggestionCard.style.display = "";
  } catch (fallbackError) {
    console.error(
      "[AIConcierge Debug] fallback exception:",
      fallbackError
    );

    suggestionMessage.textContent =
      getMachinauTranslation(
        "suggestion_fallback_error_message",
        currentLanguageForAiConcierge
      );

    suggestionDetailButton.style.display = "none";
    suggestionDetailButton.onclick = null;
    suggestionCard.style.display = "";
  }
}


// Ver1.8 Phase1｜AIコンシェルジュがcandidates内から選んだIDを、実際の
// shops配列(Firestore実データ)と突き合わせてから描画する。サーバー側の
// 検証済みの上で、クライアント側でも独立して再検証する(Firestore実データを
// 正本とし、候補外・存在しないIDは描画しない)。事実情報(タイトル等)は
// AIの文章ではなくshopデータから取得する。
function renderAiConciergeSuggestionContent(
  aiSuggestion,
  suggestionMessage,
  suggestionDetailButton
) {
  if (
    !aiSuggestion ||
    typeof aiSuggestion.suggestedCandidateId !== "string" ||
    aiSuggestion.suggestedCandidateId === ""
  ) {
    return false;
  }

  const resolvedCandidate =
    resolveAiConciergeCandidateRealData(
      aiSuggestion.suggestedCandidateId
    );

  if (!resolvedCandidate) {
    return false;
  }

  const reasonText =
    typeof aiSuggestion.reasonShort === "string"
      ? aiSuggestion.reasonShort.trim()
      : "";

  if (reasonText === "") {
    return false;
  }

  suggestionMessage.textContent =
    resolvedCandidate.title +
    "\n" +
    reasonText;

  if (
    typeof resolvedCandidate.openDetail === "function"
  ) {
    suggestionDetailButton.style.display = "";
    suggestionDetailButton.onclick = resolvedCandidate.openDetail;
  } else {
    suggestionDetailButton.style.display = "none";
    suggestionDetailButton.onclick = null;
  }

  return true;
}


// Ver1.8 Phase1(カード非表示禁止の修正)｜AI応答が使えない場合の安全な
// フォールバック描画。AI生成文は一切使わず、候補プールが既に持っている
// 事実(title・factSummary)だけで表示する。新しい事実は生成しない・
// 過度な言い換えもしない。
// - sourceType==="factual_info"(重要情報): title + factSummaryをそのまま
//   短く提示する。factSummaryが無ければtitleのみ。
// - それ以外: 既存事実を超えない汎用の案内文(suggestion_fallback_generic_note)
//   をtitleに添える。
function renderAiConciergeFallbackContent(
  candidate,
  language,
  suggestionMessage,
  suggestionDetailButton
) {
  if (
    !candidate ||
    typeof candidate.id !== "string" ||
    candidate.id === ""
  ) {
    return false;
  }

  const resolvedCandidate =
    resolveAiConciergeCandidateRealData(
      candidate.id
    );

  if (!resolvedCandidate) {
    return false;
  }

  const titleText =
    typeof resolvedCandidate.title === "string" &&
    resolvedCandidate.title.trim() !== ""
      ? resolvedCandidate.title.trim()
      : "";

  if (titleText === "") {
    return false;
  }

  let messageText;

  if (candidate.sourceType === "factual_info") {
    const factLine =
      typeof candidate.factSummary === "string" &&
      candidate.factSummary.trim() !== ""
        ? candidate.factSummary.trim()
        : "";

    messageText =
      factLine !== ""
        ? titleText + "\n" + factLine
        : titleText;
  } else {
    messageText =
      titleText +
      "\n" +
      getMachinauTranslation(
        "suggestion_fallback_generic_note",
        language
      );
  }

  suggestionMessage.textContent =
    messageText;

  if (
    typeof resolvedCandidate.openDetail === "function"
  ) {
    suggestionDetailButton.style.display = "";
    suggestionDetailButton.onclick = resolvedCandidate.openDetail;
  } else {
    suggestionDetailButton.style.display = "none";
    suggestionDetailButton.onclick = null;
  }

  return true;
}


// Ver1.8 Phase1｜AIコンシェルジュの1GPSセッション1回のsessionStorageキャッシュ。
// 既存WEATHER_CACHE_*と同じTTL・座標近似判定パターンを踏襲する
// (WEATHER_CACHE_MAX_COORDINATE_DELTAをそのまま再利用)。言語ごとに結果を
// 分離して保持し、既に取得済みの言語への切り替えではAIを再実行しない。
const AI_CONCIERGE_CACHE_STORAGE_KEY =
  "machinauAiConciergeCache";

// 天気(latestWeatherForMachinauSuggestion、既存15分キャッシュ)がAI判断の
// 主要な入力の1つであるため、同じ15分ウィンドウを踏襲する。
const AI_CONCIERGE_CACHE_MAX_AGE_MILLISECONDS =
  15 * 60 * 1000;

function readAiConciergeCache(
  latitude,
  longitude,
  language
) {
  try {
    const rawCache =
      sessionStorage.getItem(
        AI_CONCIERGE_CACHE_STORAGE_KEY
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
      typeof parsedCache.cachedAt !== "number" ||
      typeof parsedCache.latitude !== "number" ||
      typeof parsedCache.longitude !== "number" ||
      !parsedCache.suggestionsByLanguage ||
      typeof parsedCache.suggestionsByLanguage !== "object"
    ) {
      return null;
    }

    if (
      Date.now() - parsedCache.cachedAt >
      AI_CONCIERGE_CACHE_MAX_AGE_MILLISECONDS
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

    return (
      parsedCache.suggestionsByLanguage[language] ||
      null
    );
  } catch (error) {
    return null;
  }
}


function writeAiConciergeCache(
  latitude,
  longitude,
  language,
  suggestion
) {
  try {
    let existingCache =
      null;

    try {
      const rawExistingCache =
        sessionStorage.getItem(
          AI_CONCIERGE_CACHE_STORAGE_KEY
        );

      if (rawExistingCache) {
        existingCache =
          JSON.parse(
            rawExistingCache
          );
      }
    } catch (readError) {
      existingCache = null;
    }

    const isSameLocationAndFreshCache =
      existingCache &&
      typeof existingCache.cachedAt === "number" &&
      typeof existingCache.latitude === "number" &&
      typeof existingCache.longitude === "number" &&
      existingCache.suggestionsByLanguage &&
      typeof existingCache.suggestionsByLanguage === "object" &&
      (Date.now() - existingCache.cachedAt) <=
        AI_CONCIERGE_CACHE_MAX_AGE_MILLISECONDS &&
      Math.abs(existingCache.latitude - latitude) <=
        WEATHER_CACHE_MAX_COORDINATE_DELTA &&
      Math.abs(existingCache.longitude - longitude) <=
        WEATHER_CACHE_MAX_COORDINATE_DELTA;

    const suggestionsByLanguage =
      isSameLocationAndFreshCache
        ? Object.assign(
            {},
            existingCache.suggestionsByLanguage
          )
        : {};

    suggestionsByLanguage[language] =
      suggestion;

    sessionStorage.setItem(
      AI_CONCIERGE_CACHE_STORAGE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        latitude: latitude,
        longitude: longitude,
        suggestionsByLanguage: suggestionsByLanguage
      })
    );
  } catch (error) {
    // sessionStorageが利用できない環境でもAIコンシェルジュ機能自体は継続する
  }
}


// ブラウザのローカル時刻を"HH:MM"形式(24時間表記)で返す。タイムゾーン変換・
// サーバー側時刻取得は行わない(利用者の体感時刻をそのまま使う)。
function formatCurrentTimeForAiConcierge() {
  const now =
    new Date();

  function pad(number) {
    return number < 10 ? "0" + number : String(number);
  }

  return (
    pad(now.getHours()) +
    ":" +
    pad(now.getMinutes())
  );
}


// Ver1.8 Phase1｜AIコンシェルジュ本体。既存のselectTravelerSuggestionCandidate()
// (ルールベース)は一切変更せず、AIが使えない場合の最終フォールバックとして
// updateTravelerSuggestionCard()内にそのまま残る。ここでの役割は、
// (1)候補が無ければ即座にルールベースへ委ねる、(2)ローディング状態を表示する、
// (3)sessionStorageキャッシュを確認する、(4)無ければAPIを呼び、成功なら
// aiConciergeStateへ結果を格納してupdateTravelerSuggestionCard()を再実行する、
// (5)失敗時は必ずstatus="unavailable"にしてルールベースへフォールバックする、
// の5点のみ。
async function attemptAiConciergeSuggestion(
  gpsSessionId
) {
  const candidates =
    buildAiConciergeCandidatePool();

  // Preview検証用デバッグログ(本番mainへ入れるかは代表判断・後で削除可)。
  // Secret・Token・詳細な緯度経度・個人情報は一切出力しない。
  console.log(
    "[AIConcierge Debug] candidatePool size=" +
      candidates.length
  );

  if (candidates.length === 0) {
    // Ver1.8 Phase1(設計修正)｜候補が1件も無い場合はAI APIを呼ばず、
    // かつGPS取得前のプレースホルダーへも戻さない。専用の
    // status="empty"を使い、updateTravelerSuggestionCard()側で
    // ✨カードを維持したまま専用文言を表示する。
    console.log(
      "[AIConcierge Debug] fallback reason=empty_pool"
    );

    aiConciergeState =
      {
        gpsSessionId: gpsSessionId,
        status: "empty",
        suggestionsByLanguage: {}
      };

    updateTravelerSuggestionCard();
    return;
  }

  aiConciergeState =
    {
      gpsSessionId: gpsSessionId,
      status: "loading",
      suggestionsByLanguage: {}
    };

  updateTravelerSuggestionCard();

  const language =
    getCurrentMachinauLanguage();

  const cachedSuggestion =
    readAiConciergeCache(
      userLatitude,
      userLongitude,
      language
    );

  if (cachedSuggestion) {
    aiConciergeState =
      {
        gpsSessionId: gpsSessionId,
        status: "success",
        suggestionsByLanguage: {
          [language]: cachedSuggestion
        }
      };

    updateTravelerSuggestionCard();
    return;
  }

  let responseSuggestion =
    null;

  console.log(
    "[AIConcierge Debug] AI request started"
  );

  // Ver1.8 Phase1(実機不具合調査・修正)｜接続が途中で切れる等の実ブラウザ
  // 検証で確認した長時間停止を防ぐためのタイムアウト。AbortControllerの
  // 使い方はサーバー側callOpenAiConcierge()と同じパターンを踏襲する。
  const fetchAbortController =
    new AbortController();

  const fetchTimeoutId =
    setTimeout(
      function() {
        fetchAbortController.abort();
      },
      AI_CONCIERGE_CLIENT_FETCH_TIMEOUT_MS
    );

  try {
    const idToken =
      await getAnonymousIdTokenForLocationCollection();

    const response =
      await fetch(
        "/api/moderate-submission",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + idToken
          },
          signal:
            fetchAbortController.signal,
          body: JSON.stringify({
            mode: "aiConcierge",
            language: language,
            currentTime: formatCurrentTimeForAiConcierge(),
            context: {
              // Ver1.8 Phase1(プレースホルダー固着修正)｜地域名解決に失敗した
              // 場合(userAreaNameがnull)でもAIコンシェルジュ処理は継続するため、
              // nullをそのまま送らず安全な空文字にする。サーバー側は元々
              // 非文字列を空文字として扱う設計のため実質的な挙動は変わらない。
              area:
                typeof userAreaName === "string"
                  ? userAreaName
                  : "",
              weather: {
                temperatureC:
                  latestWeatherForMachinauSuggestion.temperatureC,
                feelsLikeC:
                  latestWeatherForMachinauSuggestion.feelsLikeC,
                chanceOfRain:
                  latestWeatherForMachinauSuggestion.chanceOfRain,
                windKph:
                  latestWeatherForMachinauSuggestion.windKph,
                uvIndex:
                  latestWeatherForMachinauSuggestion.uvIndex,
                conditionText:
                  latestWeatherForMachinauSuggestion.conditionText
              }
            },
            // Ver1.8 Phase1(設計修正)｜buildAiConciergeCandidatePool()の
            // 各要素は既にAIへ送る最終形(id/sourceType/title/category/
            // area/distanceKm/availabilityHint)になっているため、
            // ここで改めて変換しない。
            candidates: candidates
          })
        }
      );

    const responseData =
      await response.json();

    if (
      response.ok &&
      responseData &&
      responseData.success === true &&
      responseData.suggestion
    ) {
      responseSuggestion =
        responseData.suggestion;
    } else {
      console.log(
        "[AIConcierge Debug] fallback reason=api_response_not_success"
      );
    }
  } catch (error) {
    console.log(
      "[AIConcierge Debug] fallback reason=network_error_or_exception"
    );

    responseSuggestion =
      null;
  } finally {
    clearTimeout(
      fetchTimeoutId
    );
  }

  // 別のGPS取得が既に始まっていれば、古い応答は反映しない
  if (
    gpsSessionId !==
    machinauSuggestionGpsSessionId
  ) {
    return;
  }

  if (responseSuggestion) {
    aiConciergeState =
      {
        gpsSessionId: gpsSessionId,
        status: "success",
        suggestionsByLanguage: {
          [language]: responseSuggestion
        }
      };

    writeAiConciergeCache(
      userLatitude,
      userLongitude,
      language,
      responseSuggestion
    );
  } else {
    aiConciergeState =
      {
        gpsSessionId: gpsSessionId,
        status: "unavailable",
        suggestionsByLanguage: {}
      };
  }

  updateTravelerSuggestionCard();
}


// fetchWeather()・resolveAreaNameFromCoordinates()を再度呼び出さず、
// GPS成功時に既に実行されている既存呼び出しの結果(latestWeatherForMachinauSuggestion・
// isAreaNameResolvedForMachinauSuggestion)と、shops読み込み完了状態
// (isShopsLoadedForMachinauSuggestion)の3条件がそろった時点で、
// 今回のGPS取得(gpsSessionId)についてのみ提案を1回だけ生成する。
function tryGenerateMachinauSuggestion(gpsSessionId) {
  // Ver1.8 Phase1(診断ログ・実機切り分け用)｜早期returnより前に置き、この
  // 関数自体が呼ばれたかどうか(sessionMatch=falseで弾かれた場合も含め)を
  // 必ず記録する。個人情報・Secret・Token・緯度経度・市町村名は出さない。
  console.log(
    "[AIConcierge Trace] tryGenerate sessionMatch=" +
      (gpsSessionId === machinauSuggestionGpsSessionId) +
      " weatherReady=" +
      (latestWeatherForMachinauSuggestion !== null) +
      " areaReady=" +
      isAreaNameResolvedForMachinauSuggestion +
      " shopsReady=" +
      isShopsLoadedForMachinauSuggestion
  );

  renderPreviewDiagnosticOverlay();

  if (gpsSessionId !== machinauSuggestionGpsSessionId) {
    return;
  }

  // Preview検証用デバッグログ(本番mainへ入れるかは代表判断・後で削除可)。
  // Secret・Token・詳細な緯度経度・個人情報は一切出力しない。3条件ゲートが
  // どの時点で揃っていないかを追跡するためだけの真偽値・件数のみ。
  console.log(
    "[AIConcierge Debug] gate check weatherReady=" +
      (latestWeatherForMachinauSuggestion !== null) +
      " areaReady=" +
      isAreaNameResolvedForMachinauSuggestion +
      " shopsReady=" +
      isShopsLoadedForMachinauSuggestion +
      " shopsCount=" +
      shops.length
  );

  if (
    latestWeatherForMachinauSuggestion === null ||
    !isAreaNameResolvedForMachinauSuggestion ||
    !isShopsLoadedForMachinauSuggestion
  ) {
    return;
  }

  if (
    generatedMachinauSuggestionGpsSessionId ===
    gpsSessionId
  ) {
    return;
  }

  generatedMachinauSuggestionGpsSessionId =
    gpsSessionId;

  // Ver1.8 Phase1(診断ログ・実機切り分け用)
  console.log(
    "[AIConcierge Trace] gatesPassed"
  );

  renderPreviewDiagnosticOverlay();

  // Ver1.8 Phase1｜✨あなたへの提案は、まずAIコンシェルジュ
  // (attemptAiConciergeSuggestion())を試み、候補が無い/AI応答が使えない
  // 場合はupdateTravelerSuggestionCard()内のルールベース処理へ必ず
  // フォールバックする。updateSuggestionCard()本体は無変更のまま保持する
  // (未使用)。selectTravelerSuggestionCandidate()・✨⚡🔥3枠分離ロジックは
  // 一切変更しない。
  attemptAiConciergeSuggestion(
    gpsSessionId
  );

  updateUnifiedImportantInfo();
}

// loadApprovedSubmissions()がshopsの読み込みに成功した後に呼ぶ。
// shopsの内容やloadApprovedSubmissions()の取得処理自体は変更しない。
function markShopsLoadedForMachinauSuggestion() {
  isShopsLoadedForMachinauSuggestion =
    true;

  tryGenerateMachinauSuggestion(
    machinauSuggestionGpsSessionId
  );
}


// 既にFirebase Anonymous Authenticationでサインイン済みならそのユーザーの
// IDトークンをそのまま使い、未サインインの場合のみsignInAnonymously()を呼ぶ。
// 同じ匿名セッションを使い回すことで、GPS取得のたびに新しい匿名ユーザーを
// 作らないようにする。
function getAnonymousIdTokenForLocationCollection() {
  if (
    typeof firebase === "undefined" ||
    !firebase.auth
  ) {
    return Promise.reject(
      new Error(
        "Firebase Authenticationが利用できません。"
      )
    );
  }

  const auth =
    firebase.auth();

  const currentUser =
    auth.currentUser;

  if (currentUser) {
    return currentUser.getIdToken();
  }

  return auth
    .signInAnonymously()
    .then(
      function(credential) {
        return credential.user.getIdToken();
      }
    );
}

// GPSで地域(areaName)が確定した直後に、その地域のaiSourcesだけを対象に
// 既存の自動AI記者フロー(/api/admin-source-collect)を起動するための
// 補助的なトリガー。位置情報起点収集はあくまで補助処理であり、
// 失敗しても現在地表示・天気・地図・マチナウからの提案など、
// 既存のトップページ機能には一切影響させない(すべてのエラーを握りつぶす)。
function triggerLocationBasedCollection(
  areaName
) {
  getAnonymousIdTokenForLocationCollection()
    .then(
      function(idToken) {
        return fetch(
          "/api/admin-source-collect",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + idToken
            },
            body: JSON.stringify(
              {
                mode: "locationCollect",
                targetArea: areaName
              }
            )
          }
        );
      }
    )
    .catch(
      function(error) {
        // 位置情報起点収集は補助処理のため、失敗しても
        // 既存のトップページ機能には影響させない
      }
    );
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
      getMachinauTranslation(
        "location_geolocation_unsupported",
        getCurrentMachinauLanguage()
      );

    fetchWeather(
      NAHA_FALLBACK_LATITUDE,
      NAHA_FALLBACK_LONGITUDE
    )
      .then(function(weather) {
        updateWeatherDisplay(
          weather,
          getMachinauTranslation(
            "weather_location_naha",
            getCurrentMachinauLanguage()
          )
        );
      })
      .catch(function(error) {
        // 天候取得の失敗は既存の位置情報エラー表示に影響させない
      });

    return;
  }

  locationButton.disabled =
    true;

  locationButton.textContent =
    getMachinauTranslation(
      "location_button_checking",
      getCurrentMachinauLanguage()
    );

  locationMessage.textContent =
    getMachinauTranslation(
      "location_message_fetching",
      getCurrentMachinauLanguage()
    );

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

        resetLocationPermissionGuide();

        locationMessage.textContent =
          getMachinauTranslation(
            "location_message_success",
            getCurrentMachinauLanguage()
          );

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
          getMachinauTranslation(
            "location_button_update",
            getCurrentMachinauLanguage()
          );

        showCurrentLocationMarker(
          userLatitude,
          userLongitude
        );

        renderShops();

        machinauSuggestionGpsSessionId += 1;

        const suggestionGpsSessionId =
          machinauSuggestionGpsSessionId;

        // Ver1.8 Phase1(診断ログ・実機切り分け用)｜緯度経度は出さない。
        console.log(
          "[AIConcierge Trace] gpsSuccess session=" +
            suggestionGpsSessionId
        );

        renderPreviewDiagnosticOverlay();

        latestWeatherForMachinauSuggestion =
          null;

        isAreaNameResolvedForMachinauSuggestion =
          false;

        fetchWeather(
          userLatitude,
          userLongitude
        )
          .then(function(weather) {
            updateWeatherDisplay(
              weather,
              getMachinauTranslation(
                "weather_location_current",
                getCurrentMachinauLanguage()
              )
            );

            // Ver1.8 Phase1(診断ログ・実機切り分け用)｜天気の具体的な値は出さない。
            console.log(
              "[AIConcierge Trace] weatherResolved sessionMatch=" +
                (suggestionGpsSessionId ===
                  machinauSuggestionGpsSessionId) +
                " weatherAvailable=" +
                (weather !== null && weather !== undefined)
            );

            renderPreviewDiagnosticOverlay();

            if (
              suggestionGpsSessionId ===
              machinauSuggestionGpsSessionId
            ) {
              latestWeatherForMachinauSuggestion =
                weather;

              tryGenerateMachinauSuggestion(
                suggestionGpsSessionId
              );
            }
          })
          .catch(function(error) {
            // 天候取得の失敗はrenderShops()等の既存フローに影響させない
          });

        resolveAreaNameFromCoordinates(
          userLatitude,
          userLongitude
        )
          .then(function(areaName) {
            // Ver1.8 Phase1(診断ログ・実機切り分け用)｜市町村名・緯度経度は出さない。
            console.log(
              "[AIConcierge Trace] areaResolved sessionMatch=" +
                (suggestionGpsSessionId ===
                  machinauSuggestionGpsSessionId) +
                " areaAvailable=" +
                (typeof areaName === "string" && areaName !== "")
            );

            renderPreviewDiagnosticOverlay();

            if (areaName) {
              userAreaName = areaName;

              renderShops();

              triggerLocationBasedCollection(
                areaName
              );

              loadRegionRecommendations(
                areaName
              );
            }

            if (
              suggestionGpsSessionId ===
              machinauSuggestionGpsSessionId
            ) {
              isAreaNameResolvedForMachinauSuggestion =
                true;

              tryGenerateMachinauSuggestion(
                suggestionGpsSessionId
              );
            }
          })
          .catch(function(error) {
            // Ver1.8 Phase1(診断ログ・実機切り分け用)
            console.log(
              "[AIConcierge Trace] areaRejected sessionMatch=" +
                (suggestionGpsSessionId ===
                  machinauSuggestionGpsSessionId)
            );

            renderPreviewDiagnosticOverlay();

            // 地域名取得の失敗は既存フローに影響させない
          });
      },

      function(error) {
        let message =
          getMachinauTranslation(
            "location_error_generic",
            getCurrentMachinauLanguage()
          );

        resetLocationPermissionGuide();

        if (
          error.code === 1
        ) {
         message =
    message +
    "\n\n" +
    getMachinauTranslation(
      "location_error_permission_denied_guide",
      getCurrentMachinauLanguage()
    );

          showLocationPermissionGuideToggle();
        }

        if (
          error.code === 2
        ) {
          message =
            getMachinauTranslation(
              "location_error_position_unavailable",
              getCurrentMachinauLanguage()
            );
        }

        if (
          error.code === 3
        ) {
          message =
            getMachinauTranslation(
              "location_error_timeout",
              getCurrentMachinauLanguage()
            );
        }

        locationMessage.textContent =
          message;

        locationButton.disabled =
          false;

        locationButton.textContent =
          getMachinauTranslation(
            "location_button_retry",
            getCurrentMachinauLanguage()
          );

        fetchWeather(
          NAHA_FALLBACK_LATITUDE,
          NAHA_FALLBACK_LONGITUDE
        )
          .then(function(weather) {
            updateWeatherDisplay(
              weather,
              getMachinauTranslation(
                "weather_location_naha",
                getCurrentMachinauLanguage()
              )
            );
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


// PERMISSION_DENIED時だけ表示する「位置情報を許可する方法を見る」導線。
// GPS取得の成功・失敗ロジック(userLatitude/userLongitude/userAreaName等)
// には一切触れず、案内UIの表示状態だけを管理する。
function resetLocationPermissionGuide() {
  const locationPermissionGuideToggle =
    document.getElementById(
      "locationPermissionGuideToggle"
    );

  const locationPermissionGuide =
    document.getElementById(
      "locationPermissionGuide"
    );

  if (locationPermissionGuideToggle) {
    locationPermissionGuideToggle.style.display =
      "none";

    locationPermissionGuideToggle.textContent =
      getMachinauTranslation(
        "location_permission_toggle_show",
        getCurrentMachinauLanguage()
      );
  }

  if (locationPermissionGuide) {
    locationPermissionGuide.style.display =
      "none";
  }

  document
    .querySelectorAll(
      ".location-permission-device-panel, .location-permission-os-panel"
    )
    .forEach(
      function(panel) {
        panel.style.display =
          "none";
      }
    );

  document
    .querySelectorAll(
      ".location-permission-device-toggle .location-permission-toggle-icon, .location-permission-os-toggle .location-permission-toggle-icon"
    )
    .forEach(
      function(icon) {
        icon.textContent =
          "▶";
      }
    );
}

function showLocationPermissionGuideToggle() {
  const locationPermissionGuideToggle =
    document.getElementById(
      "locationPermissionGuideToggle"
    );

  if (locationPermissionGuideToggle) {
    locationPermissionGuideToggle.style.display =
      "";
  }
}

const locationPermissionGuideToggleElement =
  document.getElementById(
    "locationPermissionGuideToggle"
  );

if (locationPermissionGuideToggleElement) {
  locationPermissionGuideToggleElement.addEventListener(
    "click",
    function() {
      const locationPermissionGuide =
        document.getElementById(
          "locationPermissionGuide"
        );

      if (!locationPermissionGuide) {
        return;
      }

      const isCurrentlyOpen =
        locationPermissionGuide.style.display !==
        "none";

      locationPermissionGuide.style.display =
        isCurrentlyOpen
          ? "none"
          : "";

      locationPermissionGuideToggleElement.textContent =
        isCurrentlyOpen
          ? getMachinauTranslation(
              "location_permission_toggle_show",
              getCurrentMachinauLanguage()
            )
          : getMachinauTranslation(
              "location_permission_toggle_close",
              getCurrentMachinauLanguage()
            );
    }
  );
}

const locationPermissionGuideElement =
  document.getElementById(
    "locationPermissionGuide"
  );

if (locationPermissionGuideElement) {
  locationPermissionGuideElement.addEventListener(
    "click",
    function(event) {
      const toggleButton =
        event.target.closest(
          ".location-permission-device-toggle, .location-permission-os-toggle"
        );

      if (!toggleButton) {
        return;
      }

      const targetId =
        toggleButton.getAttribute(
          "data-target"
        );

      const targetPanel =
        targetId
          ? document.getElementById(
              targetId
            )
          : null;

      if (!targetPanel) {
        return;
      }

      const toggleIcon =
        toggleButton.querySelector(
          ".location-permission-toggle-icon"
        );

      const isCurrentlyOpen =
        targetPanel.style.display !==
        "none";

      targetPanel.style.display =
        isCurrentlyOpen
          ? "none"
          : "";

      if (toggleIcon) {
        toggleIcon.textContent =
          isCurrentlyOpen
            ? "▶"
            : "▼";
      }
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


// TOPの「もっと見る」・bottom-navigation「見つける」の共通処理。
// scrollToShops()本体は変更せず、最後にそのまま呼び出すだけにする。
function showAllShopCardsAndScrollToShops() {
  isShowingAllShopCards =
    true;

  renderShops();

  scrollToShops();
}

const shopMoreButtonElement =
  document.getElementById(
    "shopMoreButton"
  );

if (shopMoreButtonElement) {
  shopMoreButtonElement.addEventListener(
    "click",
    showAllShopCardsAndScrollToShops
  );
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
  isShowingAllShopCards = false;
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
              getMachinauTranslation(
                "firebase_not_ready_error",
                getCurrentMachinauLanguage()
              )
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

const SUBMISSIONS_CACHE_STORAGE_KEY =
  "machinauSubmissionsCache";

// マチナウは「今」の情報が価値のアプリのため、既存のWEATHER_CACHE(15分)より
// 大幅に短いTTLとする。目的は同一タブでの短時間の連続リロード等による
// 無駄なFirestore再読み込みを防ぐことのみ(新しいタブ・新規訪問者には
// sessionStorageの性質上まったく影響しない)。⚡の防災・気象情報等、
// 鮮度が重要な情報を1分以上古いまま表示し続けないよう60秒とする。
const SUBMISSIONS_CACHE_MAX_AGE_MILLISECONDS =
  60 * 1000;


function readSubmissionsCache() {
  try {
    const rawCache =
      sessionStorage.getItem(
        SUBMISSIONS_CACHE_STORAGE_KEY
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
      typeof parsedCache.cachedAt !== "number" ||
      !Array.isArray(parsedCache.shops) ||
      (parsedCache.nearestExpiryTime !== null &&
        typeof parsedCache.nearestExpiryTime !== "number")
    ) {
      return null;
    }

    if (
      Date.now() - parsedCache.cachedAt >
      SUBMISSIONS_CACHE_MAX_AGE_MILLISECONDS
    ) {
      return null;
    }

    return {
      shops:
        parsedCache.shops,
      nearestExpiryTime:
        parsedCache.nearestExpiryTime
    };
  } catch (error) {
    return null;
  }
}


function writeSubmissionsCache(
  shopsToCache,
  nearestExpiryTime
) {
  try {
    sessionStorage.setItem(
      SUBMISSIONS_CACHE_STORAGE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        shops: shopsToCache,
        nearestExpiryTime: nearestExpiryTime
      })
    );
  } catch (error) {
    // sessionStorageが利用できない環境でも掲載情報表示自体は継続する
  }
}


// loadApprovedSubmissions()のFirestore取得経路・キャッシュ復元経路の
// 両方から呼ばれる共通の反映処理。shops配列への反映・再描画・期限タイマー
// 設定という既存ロジックを1箇所にまとめ、2つの経路で処理内容が
// ずれないようにする。renderShops()等の既存関数自体は一切変更しない。
function applyLoadedSubmissions(
  loadedShops,
  nearestExpiryTime
) {
  shops =
    loadedShops;

  updateTopCounts(
    shops.length
  );

  hideSampleNotice();

  renderShops();

  markShopsLoadedForMachinauSuggestion();

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

  const cachedSubmissions =
    readSubmissionsCache();

  if (cachedSubmissions) {
    console.log(
      "🗂️ セッションキャッシュから掲載情報を復元しました：" +
      cachedSubmissions.shops.length +
      "件"
    );

    applyLoadedSubmissions(
      cachedSubmissions.shops,
      cachedSubmissions.nearestExpiryTime
    );

    return;
  }

  try {
    // 層3：Firestoreへ直接クエリするのをやめ、Vercel CDN共有キャッシュが
    // 効く公開GETエンドポイント(api/moderate-submission.js、認証不要)経由で
    // 取得する。既存のconvertSubmissionToShop()はdocumentSnapshot.data()・
    // documentSnapshot.idしか参照しないため、その形だけを再現する最小限の
    // ラッパーを都度作って渡す(convertSubmissionToShop自体は無変更)。
    const response =
      await fetch(
        "/api/moderate-submission",
        {
          method: "GET"
        }
      );

    let responseData =
      null;

    try {
      responseData =
        await response.json();
    } catch (jsonError) {
      throw new Error(
        "掲載情報の解析に失敗しました。"
      );
    }

    if (
      !response.ok ||
      !responseData ||
      responseData.success !== true ||
      !Array.isArray(
        responseData.submissions
      )
    ) {
      throw new Error(
        responseData &&
        responseData.message
          ? responseData.message
          : "掲載情報を取得できませんでした。"
      );
    }

    const approvedShops =
      [];

    const currentTime =
      Date.now();

    let nearestExpiryTime =
      null;

    responseData.submissions.forEach(
      function(
        submissionItem
      ) {
        const documentSnapshot =
          {
            id:
              submissionItem &&
              typeof submissionItem.id === "string"
                ? submissionItem.id
                : "",

            data:
              function() {
                return (
                  submissionItem &&
                  submissionItem.fields &&
                  typeof submissionItem.fields === "object"
                )
                  ? submissionItem.fields
                  : {};
              }
          };

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

    writeSubmissionsCache(
      approvedShops,
      nearestExpiryTime
    );

    applyLoadedSubmissions(
      approvedShops,
      nearestExpiryTime
    );
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

    initializeMachinauLanguageSwitcher();

    initializeMapLazyLoadObserver();

    // Ver1.8 Phase1(実機不具合調査用・Preview専用診断)｜ページ読み込み直後、
    // GPS操作前から画面下部に診断表示を出す(本番mainへは入れない)。
    renderPreviewDiagnosticOverlay();
  }
);

// ---- Ver1.7｜Google Maps遅延ロード ----
// ページを開いただけではGoogle Maps JavaScript APIを読み込まず、地図セクションが
// 画面に近づいた時、またはGPS/トイレ検索操作時にだけ初回読み込みする。
// initGoogleMap()本体・updateShopMarkers()・showCurrentLocationMarker()・
// showShopInfoWindow()・getLocation()には一切触れない。

const GOOGLE_MAPS_SCRIPT_URL =
  "https://maps.googleapis.com/maps/api/js?key=AIzaSyC7LLuNBYIXKT1YcrIaiuwyFssKQyMMjkU&libraries=places";

let googleMapsLoadPromise = null;

// 1回だけ読み込む(既に読み込み中/読み込み済みなら同じPromiseを返す＝二重ロード防止)。
// 失敗時も例外を投げず必ずresolveする(onclick属性から await せず呼んでも
// 未処理のPromise拒否でconsoleエラーにならないようにするため)。失敗時は
// googleMapsLoadPromiseをリセットし、次回呼び出しで再試行できるようにする。
function ensureGoogleMapsLoaded() {
  if (googleMapsLoadPromise) {
    return googleMapsLoadPromise;
  }

  if (
    typeof google !== "undefined" &&
    google.maps &&
    google.maps.Map
  ) {
    googleMapsLoadPromise = Promise.resolve(true);
    return googleMapsLoadPromise;
  }

  googleMapsLoadPromise = new Promise(function (resolve) {
    window.__machinauHandleGoogleMapsLoaded = function () {
      try {
        initGoogleMap();

        // GPS取得がGoogle Maps読み込み完了より先に成功していた場合、
        // 現在地マーカーを後追いで表示する(getLocation()本体は変更しない、
        // showCurrentLocationMarker()本体も無変更のまま呼び出すだけ)。
        if (
          userLatitude !== null &&
          userLongitude !== null
        ) {
          showCurrentLocationMarker(
            userLatitude,
            userLongitude
          );
        }
      } catch (error) {
        console.error(
          "Google Mapsの初期化に失敗しました：",
          error
        );
      }

      resolve(true);
    };

    const script = document.createElement("script");

    script.src =
      GOOGLE_MAPS_SCRIPT_URL +
      "&callback=__machinauHandleGoogleMapsLoaded";

    script.async = true;
    script.defer = true;

    script.onerror = function () {
      console.error(
        "Google Maps JavaScript APIの読み込みに失敗しました。"
      );

      googleMapsLoadPromise = null;
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

// 地図セクションがビューポート付近(300px手前)へ近づいたら自動的に読み込む。
// IntersectionObserverが無い古いブラウザでは、フォールバックとして
// ページ読み込みから少し待ってから読み込む(常時即ロードよりは遅延させる)。
function initializeMapLazyLoadObserver() {
  const mapSectionElement =
    document.querySelector(".map-section");

  if (!mapSectionElement) {
    return;
  }

  if (typeof IntersectionObserver === "undefined") {
    window.setTimeout(
      ensureGoogleMapsLoaded,
      2000
    );

    return;
  }

  const observer = new IntersectionObserver(
    function (entries) {
      const isNearViewport =
        entries.some(function (entry) {
          return entry.isIntersecting;
        });

      if (isNearViewport) {
        ensureGoogleMapsLoaded();
        observer.disconnect();
      }
    },
    {
      rootMargin: "300px 0px"
    }
  );

  observer.observe(mapSectionElement);
}

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
        ${getMachinauTranslation(
          "shop_detail_button",
          getCurrentMachinauLanguage()
        )}
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
          title: getMachinauTranslation(
            "current_location_marker_title",
            getCurrentMachinauLanguage()
          ),

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


function clearToiletMarkers() {
  toiletMarkers.forEach(
    function(marker) {
      marker.setMap(null);
    }
  );

  toiletMarkers = [];
}


function showToiletInfoWindow(
  toiletName,
  toiletDistanceKm,
  toiletMapUrl,
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
        🚻 ${escapeHtml(toiletName)}
      </strong>
      <p style="margin:0 0 8px; font-size:13px; color:#444;">
        ${getMachinauTranslation(
          "toilet_distance_from_current_location_prefix",
          getCurrentMachinauLanguage()
        )}${escapeHtml(formatDistance(toiletDistanceKm))}
      </p>
      ${
        toiletMapUrl
          ? `
            <a
              href="${escapeHtml(toiletMapUrl)}"
              target="_blank"
              rel="noopener noreferrer"
              style="
                display:block;
                text-align:center;
                padding:6px 10px;
                border-radius:6px;
                background:#0788c9;
                color:#fff;
                font-weight:700;
                text-decoration:none;
              "
            >
              ${getMachinauTranslation(
                "toilet_open_in_google_maps",
                getCurrentMachinauLanguage()
              )}
            </a>
          `
          : ""
      }
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


// 検索結果(Placeの配列)から距離を計算してソートし、
// トイレ専用マーカーとして地図へ描画する。
// 店舗マーカー(shopMarkers)・現在地マーカーには一切触れない。
function renderToiletMarkers(
  toiletPlaces
) {
  const toiletMessage =
    document.getElementById(
      "toiletSearchMessage"
    );

  if (!googleMapInstance) {
    return;
  }

  clearToiletMarkers();

  if (toiletPlaces.length === 0) {
    if (toiletMessage) {
      toiletMessage.textContent =
        getMachinauTranslation(
          "toilet_not_found",
          getCurrentMachinauLanguage()
        );

      toiletMessage.style.display =
        "block";
    }

    return;
  }

  const toiletsWithDistance =
    toiletPlaces
      .filter(
        function(place) {
          return !!place.location;
        }
      )
      .map(
        function(place) {
          const placeLatitude =
            place.location.lat();

          const placeLongitude =
            place.location.lng();

          return {
            place: place,
            latitude: placeLatitude,
            longitude: placeLongitude,

            distanceKm:
              calculateDistance(
                userLatitude,
                userLongitude,
                placeLatitude,
                placeLongitude
              )
          };
        }
      )
      .sort(
        function(firstToilet, secondToilet) {
          return (
            firstToilet.distanceKm -
            secondToilet.distanceKm
          );
        }
      );

  toiletsWithDistance.forEach(
    function(toiletEntry) {
      const toiletName =
        toiletEntry.place.displayName ||
        getMachinauTranslation(
          "toilet_default_name",
          getCurrentMachinauLanguage()
        );

      const toiletMapUrl =
        toiletEntry.place.googleMapsURI ||
        createGoogleMapUrl(
          toiletEntry.latitude,
          toiletEntry.longitude,
          "",
          toiletName
        );

      const marker =
        new google.maps.Marker({
          position: {
            lat: toiletEntry.latitude,
            lng: toiletEntry.longitude
          },

          map: googleMapInstance,
          title: toiletName,

          label: {
            text: "🚻",
            fontSize: "18px"
          }
        });

      marker.addListener(
        "click",
        function() {
          showToiletInfoWindow(
            toiletName,
            toiletEntry.distanceKm,
            toiletMapUrl,
            marker
          );
        }
      );

      toiletMarkers.push(
        marker
      );
    }
  );

  if (toiletMessage) {
    toiletMessage.textContent =
      getMachinauTranslation(
        "toilet_found_count",
        getCurrentMachinauLanguage()
      ).replace(
        "{N}",
        toiletsWithDistance.length
      );

    toiletMessage.style.display =
      "block";
  }
}


// 「🚻 近くのトイレを探す」ボタンから呼び出される。
// ユーザー操作時のみPlaces API (New)のNearby Searchを実行する(自動検索はしない)。
// 直近3分以内・直近検索地点から300m以内の場合はAPIを再呼び出しせず、
// メモリ上に保持したlastToiletPlacesをそのまま再描画する(連打・料金対策)。
async function searchNearbyToilets() {
  const toiletButton =
    document.getElementById(
      "toiletSearchButton"
    );

  const toiletMessage =
    document.getElementById(
      "toiletSearchMessage"
    );

  if (
    !toiletButton ||
    !toiletMessage
  ) {
    return;
  }

  if (
    !Number.isFinite(userLatitude) ||
    !Number.isFinite(userLongitude)
  ) {
    toiletMessage.textContent =
      getMachinauTranslation(
        "toilet_precondition_location",
        getCurrentMachinauLanguage()
      );

    toiletMessage.style.display =
      "block";

    return;
  }

  // Google Mapsが未読込(地図セクション未到達)の場合はここで初回読み込みを待つ。
  // ensureGoogleMapsLoaded()本体は失敗時も例外を投げず必ずresolveするため、
  // このawait自体が失敗することはない(読み込み失敗時はこの後のgoogle参照で
  // 検知され、既存のcatchブロックで案内される)。
  await ensureGoogleMapsLoaded();

  const nowTimestamp =
    Date.now();

  const isCacheStillValid =
    lastToiletSearchAt > 0 &&
    (nowTimestamp - lastToiletSearchAt) < (3 * 60 * 1000) &&
    Number.isFinite(lastToiletSearchLatitude) &&
    Number.isFinite(lastToiletSearchLongitude) &&
    (
      calculateDistance(
        userLatitude,
        userLongitude,
        lastToiletSearchLatitude,
        lastToiletSearchLongitude
      ) * 1000
    ) < 300;

  if (isCacheStillValid) {
    renderToiletMarkers(
      lastToiletPlaces
    );

    return;
  }

  toiletButton.disabled =
    true;

  toiletMessage.textContent =
    getMachinauTranslation(
      "toilet_searching",
      getCurrentMachinauLanguage()
    );

  toiletMessage.style.display =
    "block";

  try {
    const { Place } =
      await google.maps.importLibrary(
        "places"
      );

    const searchRequest = {
      fields: [
        "displayName",
        "location",
        "googleMapsURI"
      ],

      locationRestriction: {
        center: {
          lat: userLatitude,
          lng: userLongitude
        },

        radius: 1000
      },

      includedTypes: [
        "public_bathroom"
      ],

      maxResultCount: 10
    };

    const { places } =
      await Place.searchNearby(
        searchRequest
      );

    const toiletPlaces =
      Array.isArray(places)
        ? places
        : [];

    lastToiletSearchLatitude =
      userLatitude;

    lastToiletSearchLongitude =
      userLongitude;

    lastToiletSearchAt =
      Date.now();

    lastToiletPlaces =
      toiletPlaces;

    renderToiletMarkers(
      toiletPlaces
    );
  } catch (error) {
    console.error(
      "トイレ検索に失敗しました：",
      error
    );

    toiletMessage.textContent =
      getMachinauTranslation(
        "toilet_search_error",
        getCurrentMachinauLanguage()
      );

    toiletMessage.style.display =
      "block";
  } finally {
    toiletButton.disabled =
      false;
  }
}


// 「地域のおすすめ」(regionRecommendations)の取得結果と、
// 「もっと見る」展開状態を保持する。他のどの機能とも共有しない
// このセクション専用の状態。
let regionRecommendationArticles =
  [];

let isRegionRecommendationExpanded =
  false;

const REGION_RECOMMENDATION_INITIAL_COUNT =
  3;


// 1記事分のカードHTMLを組み立てる。画像が無い場合はimg要素自体を出さず、
// websiteUrlが無い/安全でない場合はリンクを出さない(getSafeWebsiteUrl()を再利用)。
// トップカードの本文だけを短文化するための上限。Firestoreへの保存内容
// (article.content、全文)は一切変更しない。表示だけの切り詰め。
const REGION_RECOMMENDATION_CONTENT_PREVIEW_LENGTH =
  150;


function buildRegionRecommendationCardHtml(
  article
) {
  const imageUrls =
    Array.isArray(article.imageUrls)
      ? article.imageUrls
      : [];

  const firstImageUrl =
    imageUrls.length > 0 &&
    typeof imageUrls[0] === "string"
      ? imageUrls[0]
      : "";

  const safeWebsiteUrl =
    getSafeWebsiteUrl(
      article.websiteUrl
    );

  const regionNameLabelHtml =
    typeof article.regionName === "string" &&
    article.regionName.trim() !== ""
      ? `
        <span class="region-recommendation-card-label">
          ${escapeHtml(article.regionName)}
        </span>
      `
      : "";

  const imageHtml =
    firstImageUrl !== ""
      ? `
        <img
          src="${escapeHtml(firstImageUrl)}"
          alt="${escapeHtml(article.title || "")}"
          loading="lazy"
        >
      `
      : "";

  const linkHtml =
    safeWebsiteUrl !== ""
      ? `
        <a
          class="region-recommendation-card-link"
          href="${escapeHtml(safeWebsiteUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${getMachinauTranslation(
            "region_recommendation_link_button",
            getCurrentMachinauLanguage()
          )}
        </a>
      `
      : "";

  const fullContent =
    article.content || "";

  const needsReadMore =
    fullContent.length >
    REGION_RECOMMENDATION_CONTENT_PREVIEW_LENGTH;

  const shortContent =
    needsReadMore
      ? fullContent.slice(
          0,
          REGION_RECOMMENDATION_CONTENT_PREVIEW_LENGTH
        ) + "…"
      : fullContent;

  const readMoreButtonHtml =
    needsReadMore
      ? `
        <button
          type="button"
          class="region-recommendation-read-more-button"
        >
          ${getMachinauTranslation(
            "region_recommendation_read_more_button",
            getCurrentMachinauLanguage()
          )}
        </button>
      `
      : "";

  return `
    <div class="region-recommendation-card">
      ${imageHtml}
      <div class="region-recommendation-card-body">
        ${regionNameLabelHtml}
        <p class="region-recommendation-card-title">
          ${escapeHtml(article.title || "")}
        </p>
        <p class="region-recommendation-card-content region-recommendation-card-content-short">
          ${escapeHtml(shortContent)}
        </p>
        <p
          class="region-recommendation-card-content region-recommendation-card-content-full"
          style="display:none;"
        >
          ${escapeHtml(fullContent)}
        </p>
        ${readMoreButtonHtml}
        ${linkHtml}
      </div>
    </div>
  `;
}


// #regionRecommendationList内の「続きを読む」/「折りたたむ」ボタンを
// イベント委譲で処理する。カードはrenderRegionRecommendationCards()の
// たびに再生成されるため、リスト全体に1回だけ登録すれば、
// 再生成後の新しいボタンにも同じリスナーがそのまま効く。
function handleRegionRecommendationReadMoreClick(
  event
) {
  if (
    !event.target.classList ||
    !event.target.classList.contains(
      "region-recommendation-read-more-button"
    )
  ) {
    return;
  }

  const card =
    event.target.closest(
      ".region-recommendation-card"
    );

  if (!card) {
    return;
  }

  const shortContentElement =
    card.querySelector(
      ".region-recommendation-card-content-short"
    );

  const fullContentElement =
    card.querySelector(
      ".region-recommendation-card-content-full"
    );

  if (
    !shortContentElement ||
    !fullContentElement
  ) {
    return;
  }

  const isCurrentlyExpanded =
    fullContentElement.style.display !==
    "none";

  fullContentElement.style.display =
    isCurrentlyExpanded
      ? "none"
      : "";

  shortContentElement.style.display =
    isCurrentlyExpanded
      ? ""
      : "none";

  event.target.textContent =
    isCurrentlyExpanded
      ? getMachinauTranslation(
          "region_recommendation_read_more_button",
          getCurrentMachinauLanguage()
        )
      : getMachinauTranslation(
          "region_recommendation_collapse_button",
          getCurrentMachinauLanguage()
        );
}


// 現在表示中の地域おすすめが、現在地由来(false)か、
// 「ほかの地域を見る」からの手動選択(true)かを保持する。
// userAreaName自体はここでは一切書き換えない。
let currentRegionRecommendationAreaName =
  null;

let isRegionRecommendationManualSelection =
  false;


// regionRecommendationArticles(取得済み配列)から、展開状態に応じて
// 先頭3件だけ、または全件を描画する。追加のFirestore取得は行わない。
// 手動選択で0件の場合だけ「準備中」表示にし、現在地由来の0件は
// Phase Cと同じくセクション自体を非表示にする。
function renderRegionRecommendationCards() {
  const regionRecommendationSection =
    document.getElementById(
      "regionRecommendationSection"
    );

  const regionRecommendationList =
    document.getElementById(
      "regionRecommendationList"
    );

  const regionRecommendationMoreButton =
    document.getElementById(
      "regionRecommendationMoreButton"
    );

  const regionRecommendationBackToCurrentButton =
    document.getElementById(
      "regionRecommendationBackToCurrentButton"
    );

  if (
    !regionRecommendationSection ||
    !regionRecommendationList ||
    !regionRecommendationMoreButton
  ) {
    return;
  }

  if (regionRecommendationBackToCurrentButton) {
    regionRecommendationBackToCurrentButton.style.display =
      isRegionRecommendationManualSelection
        ? ""
        : "none";
  }

  if (regionRecommendationArticles.length === 0) {
    if (!isRegionRecommendationManualSelection) {
      regionRecommendationSection.style.display =
        "none";

      return;
    }

    regionRecommendationList.innerHTML =
      '<p class="region-recommendation-empty-message">' +
      getMachinauTranslation(
        "region_recommendation_empty_manual",
        getCurrentMachinauLanguage()
      ) +
      '</p>';

    regionRecommendationMoreButton.style.display =
      "none";

    regionRecommendationSection.style.display =
      "";

    return;
  }

  const visibleArticles =
    isRegionRecommendationExpanded
      ? regionRecommendationArticles
      : regionRecommendationArticles.slice(
          0,
          REGION_RECOMMENDATION_INITIAL_COUNT
        );

  regionRecommendationList.innerHTML =
    visibleArticles
      .map(
        buildRegionRecommendationCardHtml
      )
      .join("");

  regionRecommendationMoreButton.style.display =
    !isRegionRecommendationExpanded &&
    regionRecommendationArticles.length >
      REGION_RECOMMENDATION_INITIAL_COUNT
      ? ""
      : "none";

  regionRecommendationSection.style.display =
    "";
}


// 指定した市町村名(areaName)の地域おすすめを取得・描画する共通処理。
// isManualSelectionは「ほかの地域を見る」からの選択かどうかのフラグで、
// userAreaName自体は一切書き換えない(GPS・地図・距離計算・店舗表示に影響なし)。
// Firestore取得に失敗しても、このセクションの表示を変えるだけで
// 他の機能(天気・地図・提案・ゲリラ情報・店舗カード等)には影響させない。
async function showRegionRecommendationsForArea(
  areaName,
  isManualSelection
) {
  const regionRecommendationHeading =
    document.getElementById(
      "regionRecommendationHeading"
    );

  if (
    !window.machinauDb ||
    typeof areaName !== "string" ||
    areaName === ""
  ) {
    return;
  }

  currentRegionRecommendationAreaName =
    areaName;

  isRegionRecommendationManualSelection =
    isManualSelection === true;

  isRegionRecommendationExpanded =
    false;

  if (regionRecommendationHeading) {
    regionRecommendationHeading.textContent =
      getMachinauTranslation(
        "region_recommendation_heading_dynamic",
        getCurrentMachinauLanguage()
      ).replace(
        "{AREA}",
        areaName
      );
  }

  try {
    const querySnapshot =
      await window.machinauDb
        .collection("regionRecommendations")
        .where(
          "isPublished",
          "==",
          true
        )
        .where(
          "targetAreas",
          "array-contains",
          areaName
        )
        .orderBy("sortOrder")
        .get();

    regionRecommendationArticles =
      querySnapshot.docs.map(
        function(documentSnapshot) {
          // Ver1.8 Phase1｜AIコンシェルジュが実データへ戻れるよう、
          // 既存のdocumentSnapshot.data()に加えてdocumentSnapshot.idも
          // 保持する(追加フィールドのみ、既存フィールド・呼び出し元の
          // 描画ロジックには一切影響しない)。
          return Object.assign(
            { id: documentSnapshot.id },
            documentSnapshot.data()
          );
        }
      );

    renderRegionRecommendationCards();
  } catch (error) {
    console.error(
      "地域のおすすめの取得に失敗しました：",
      error
    );

    regionRecommendationArticles =
      [];

    renderRegionRecommendationCards();
  }
}


// userAreaName確定後にgetLocation()から呼ばれる、現在地由来の表示。
// getLocation()側の呼び出し方(loadRegionRecommendations(areaName))は
// Phase Cから変更しない。
async function loadRegionRecommendations(
  areaName
) {
  await showRegionRecommendationsForArea(
    areaName,
    false
  );
}


// 「ほかの地域を見る」の選択肢を、既存のOKINAWA_MUNICIPALITY_TO_REGION_NAME
// (無変更)から8広域グループの見出し付きで組み立てる。この定数自体は
// 一切書き換えない。
function buildRegionRecommendationAreaPickerHtml() {
  const groupNameToMunicipalities =
    {};

  Object.keys(
    OKINAWA_MUNICIPALITY_TO_REGION_NAME
  ).forEach(
    function(municipalityName) {
      const groupName =
        OKINAWA_MUNICIPALITY_TO_REGION_NAME[
          municipalityName
        ];

      if (!groupNameToMunicipalities[groupName]) {
        groupNameToMunicipalities[groupName] =
          [];
      }

      groupNameToMunicipalities[groupName].push(
        municipalityName
      );
    }
  );

  return Object.keys(groupNameToMunicipalities)
    .map(
      function(groupName) {
        const optionsHtml =
          groupNameToMunicipalities[groupName]
            .map(
              function(municipalityName) {
                return (
                  '<button type="button" class="region-recommendation-area-option" data-area="' +
                  escapeHtml(municipalityName) +
                  '">' +
                  escapeHtml(municipalityName) +
                  "</button>"
                );
              }
            )
            .join("");

        return (
          '<div class="region-recommendation-area-group-title">' +
          escapeHtml(groupName) +
          "</div>" +
          optionsHtml
        );
      }
    )
    .join("");
}


const regionRecommendationMoreButtonElement =
  document.getElementById(
    "regionRecommendationMoreButton"
  );

if (regionRecommendationMoreButtonElement) {
  regionRecommendationMoreButtonElement.addEventListener(
    "click",
    function() {
      isRegionRecommendationExpanded =
        true;

      renderRegionRecommendationCards();
    }
  );
}

const regionRecommendationListElement =
  document.getElementById(
    "regionRecommendationList"
  );

if (regionRecommendationListElement) {
  regionRecommendationListElement.addEventListener(
    "click",
    handleRegionRecommendationReadMoreClick
  );
}

const regionRecommendationAreaPickerElement =
  document.getElementById(
    "regionRecommendationAreaPicker"
  );

const regionRecommendationOtherAreaButtonElement =
  document.getElementById(
    "regionRecommendationOtherAreaButton"
  );

const regionRecommendationBackToCurrentButtonElement =
  document.getElementById(
    "regionRecommendationBackToCurrentButton"
  );

if (regionRecommendationAreaPickerElement) {
  regionRecommendationAreaPickerElement.innerHTML =
    buildRegionRecommendationAreaPickerHtml();

  regionRecommendationAreaPickerElement.addEventListener(
    "click",
    function(event) {
      const selectedAreaName =
        event.target.getAttribute(
          "data-area"
        );

      if (!selectedAreaName) {
        return;
      }

      regionRecommendationAreaPickerElement.style.display =
        "none";

      showRegionRecommendationsForArea(
        selectedAreaName,
        true
      );
    }
  );
}

if (
  regionRecommendationOtherAreaButtonElement &&
  regionRecommendationAreaPickerElement
) {
  regionRecommendationOtherAreaButtonElement.addEventListener(
    "click",
    function() {
      regionRecommendationAreaPickerElement.style.display =
        regionRecommendationAreaPickerElement.style.display ===
        "none"
          ? "block"
          : "none";
    }
  );
}

if (regionRecommendationBackToCurrentButtonElement) {
  regionRecommendationBackToCurrentButtonElement.addEventListener(
    "click",
    function() {
      if (
        typeof userAreaName === "string" &&
        userAreaName !== ""
      ) {
        showRegionRecommendationsForArea(
          userAreaName,
          false
        );
      }
    }
  );
}


// 「⚡ 今、知っておきたいこと」統合表示。
// updateFlashBanner()・shopMatchesFlashBannerKeywords()・
// selectSuggestionCandidate()・updateSuggestionCard()のいずれの本体も
// 変更せず、それぞれが使っている選定条件を読み取り専用で再利用して
// 1件だけを新しい統合カードに表示する薄い調整レイヤー。
// authorTypeの有無は一切条件にしないため、authorTypeが存在しない
// 既存admin投稿もこれまで通り候補になれる(後方互換)。


// updateFlashBanner()内の選定ロジック(matchingShops→createdAt降順→先頭1件)
// と完全に同じ条件・同じ並び順を、DOM書き込みを伴わない形で再計算する。
// shopMatchesFlashBannerKeywords()自体は呼び出すだけで変更しない。
function selectFlashCandidateForUnifiedInfo() {
  const matchingShops =
    shops.filter(
      shopMatchesFlashBannerKeywords
    );

  if (matchingShops.length === 0) {
    return null;
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

  return sortedMatchingShops[0];
}


// 緊急・安全・ライフライン判定専用。既存のFLASH_BANNER_EMERGENCY_KEYWORDS・
// FLASH_BANNER_LIFELINE_KEYWORDS(いずれも無変更)を再利用するだけで、
// 新しい複雑なキーワード集合は作らない。shopMatchesFlashBannerKeywords()
// 本体には触れない(こちらは判定用の別関数として独立させる)。
function matchesEmergencyOrLifelineKeywords(
  shop
) {
  const combinedText =
    (shop.title || "") +
    " " +
    (shop.message || "");

  return (
    FLASH_BANNER_EMERGENCY_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    ) ||
    FLASH_BANNER_LIFELINE_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    )
  );
}


function sortShopsByCreatedAtDescending(
  shopList
) {
  return shopList
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
}


// 「⚡ 今、知っておきたいこと」専用の、現在地を考慮したflash候補選定。
// shopMatchesFlashBannerKeywords()・selectFlashCandidateForUnifiedInfo()・
// getSuggestionAreaPriorityRank()本体はいずれも無変更のまま呼び出すだけ。
//
// 1. 緊急・安全・ライフライン候補があれば、地域を問わず新しい順で1件。
// 2. GPS未取得(userAreaNameが未確定)の場合、それ以外(交通等)のflash候補は
//    地域不明のまま無条件表示せず、ここでnullを返す。
// 3. GPS取得後は、それ以外のflash候補のうち
//    getSuggestionAreaPriorityRank(shop) <= 2
//    (同一市町村・同一広域グループ・沖縄県全域)のものだけを対象にし、
//    地域rank→新しさの順で1件選ぶ。地域rank3は除外する。
function selectLocationAwareFlashCandidateForUnifiedInfo() {
  const matchingShops =
    shops.filter(
      shopMatchesFlashBannerKeywords
    );

  if (matchingShops.length === 0) {
    return null;
  }

  const criticalShops =
    matchingShops.filter(
      matchesEmergencyOrLifelineKeywords
    );

  if (criticalShops.length > 0) {
    return sortShopsByCreatedAtDescending(
      criticalShops
    )[0];
  }

  const hasResolvedUserArea =
    typeof userAreaName === "string" &&
    userAreaName !== "";

  if (!hasResolvedUserArea) {
    return null;
  }

  const nearbyOtherShops =
    matchingShops.filter(
      function(shop) {
        return (
          getSuggestionAreaPriorityRank(
            shop
          ) <= 2
        );
      }
    );

  if (nearbyOtherShops.length === 0) {
    return null;
  }

  const sortedNearbyOtherShops =
    nearbyOtherShops
      .slice()
      .sort(
        function(shopA, shopB) {
          const areaPriorityDifference =
            getSuggestionAreaPriorityRank(
              shopA
            ) -
            getSuggestionAreaPriorityRank(
              shopB
            );

          if (areaPriorityDifference !== 0) {
            return areaPriorityDifference;
          }

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

  return sortedNearbyOtherShops[0];
}


// ⚡「今、知っておきたいこと」STEP2専用の候補選定。✨(あなたへの提案)とは
// 役割を完全に分離し、事実・重大情報だけを対象にする。既存の
// shopMatchesFlashBannerKeywords()・matchesEmergencyOrLifelineKeywords()・
// getSuggestionAreaPriorityRank()・getDateValue()はいずれも無変更のまま
// 呼び出すだけ。将来AI判定(例:recommendedSlot==="important"等)へ置き換える
// 際は、この関数の中身だけを差し替えればよい構造にしている。
//
// 候補条件(すべて満たすもの):
// 1. postType === "admin"
// 2. authorType === "ai"(運営手動投稿はsourceTypeが常に空文字のため対象外。
//    特例は追加しない。運営手動の重大情報の扱いはSTEP3以降で再設計する)
// 3. sourceTypeが"行政"/"交通"/"防災・気象"のいずれか(発信元)
// 4. shopMatchesFlashBannerKeywords(shop) === true(内容。発信元だけでは
//    候補にしない。例:sourceType"行政"の祭り告知は対象外)
// 5. 緊急/ライフライン(matchesEmergencyOrLifelineKeywords)は地域を問わず
//    対象、それ以外の交通系はgetSuggestionAreaPriorityRank(shop) <= 2の
//    ものだけを対象にする
//
// 並び順：緊急/ライフライン優先 → 地域rank → 新しさ
const FACTUAL_IMPORTANT_INFO_SOURCE_TYPES = [
  "行政",
  "交通",
  "防災・気象"
];

// Ver1.8 Phase1(GPSボタン不具合修正)｜AI_CONCIERGE_IMPORTANT_SOURCE_TYPESは
// FACTUAL_IMPORTANT_INFO_SOURCE_TYPESの定義後でないとTDZ(定義前参照)エラーに
// なるため、定義直後に配置している。中身はAIコンシェルジュ候補プール構築
// 専用で、selectFactualImportantInfoCandidate()の判定には使用しない(無変更)。
const AI_CONCIERGE_IMPORTANT_SOURCE_TYPES =
  FACTUAL_IMPORTANT_INFO_SOURCE_TYPES.concat(
    ["観光施設"]
  );

function selectFactualImportantInfoCandidate() {
  const candidates =
    shops
      .filter(function(shop) {
        if (shop.postType !== "admin") {
          return false;
        }

        if (shop.authorType !== "ai") {
          return false;
        }

        if (
          FACTUAL_IMPORTANT_INFO_SOURCE_TYPES.includes(
            shop.sourceType
          ) === false
        ) {
          return false;
        }

        if (shopMatchesFlashBannerKeywords(shop) === false) {
          return false;
        }

        if (matchesEmergencyOrLifelineKeywords(shop)) {
          return true;
        }

        return getSuggestionAreaPriorityRank(shop) <= 2;
      })
      .sort(function(firstShop, secondShop) {
        const importanceDifference =
          Number(matchesEmergencyOrLifelineKeywords(secondShop)) -
          Number(matchesEmergencyOrLifelineKeywords(firstShop));

        if (importanceDifference !== 0) {
          return importanceDifference;
        }

        const areaPriorityDifference =
          getSuggestionAreaPriorityRank(firstShop) -
          getSuggestionAreaPriorityRank(secondShop);

        if (areaPriorityDifference !== 0) {
          return areaPriorityDifference;
        }

        return (
          getDateValue(secondShop.createdAt) -
          getDateValue(firstShop.createdAt)
        );
      });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
}


// ⚡「今、知っておきたいこと」はSTEP2でselectFactualImportantInfoCandidate()
// (事実・重大情報専用)のみを対象にする。selectSuggestionCandidate()への
// フォールバックはSTEP2で廃止した(✨と⚡の役割を完全に分離するため)。
// 該当する事実・重大情報が無ければnullを返し、統合枠自体を非表示にする。
// selectLocationAwareFlashCandidateForUnifiedInfo()・selectSuggestionCandidate()
// 本体はいずれも無変更のまま保持する(未使用)。
function resolveUnifiedImportantInfoCandidate() {
  const factualCandidate =
    selectFactualImportantInfoCandidate();

  if (factualCandidate) {
    return {
      shop: factualCandidate,
      isSafety: true
    };
  }

  return null;
}


// 新しい統合カード専用のラベル判定。既存のFLASH_BANNER_*_KEYWORDS
// (無変更、読み取りのみ)とshop.categoryをそのまま利用し、新しい
// 複雑な分類は作らない。
function getUnifiedImportantInfoLabelText(
  shop
) {
  const combinedText =
    (shop.title || "") +
    " " +
    (shop.message || "");

  const matchesEmergencyOrLifeline =
    FLASH_BANNER_EMERGENCY_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    ) ||
    FLASH_BANNER_LIFELINE_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    );

  if (matchesEmergencyOrLifeline) {
    return getMachinauTranslation(
      "unified_info_label_emergency",
      getCurrentMachinauLanguage()
    );
  }

  const matchesTransport =
    FLASH_BANNER_TRANSPORT_KEYWORDS.some(
      function(keyword) {
        return combinedText.includes(keyword);
      }
    );

  if (matchesTransport) {
    return getMachinauTranslation(
      "unified_info_label_transport",
      getCurrentMachinauLanguage()
    );
  }

  if (shop.category === "イベント") {
    return getMachinauTranslation(
      "unified_info_label_event",
      getCurrentMachinauLanguage()
    );
  }

  if (shop.category === "観光・体験") {
    return getMachinauTranslation(
      "unified_info_label_sightseeing",
      getCurrentMachinauLanguage()
    );
  }

  return getMachinauTranslation(
    "unified_info_label_notice",
    getCurrentMachinauLanguage()
  );
}


// GPS取得前・カテゴリー切替・お気に入り操作・提案生成後等、
// renderShops()とtryGenerateMachinauSuggestion()から呼ばれる。
// #suggestionCard・.flash-bannerのDOM/更新処理には一切触れない
// (CSS側で旅行者向け表示だけを止めている)。
function updateUnifiedImportantInfo() {
  const section =
    document.getElementById(
      "unifiedImportantInfoSection"
    );

  const labelElement =
    document.getElementById(
      "unifiedImportantInfoLabel"
    );

  const titleElement =
    document.getElementById(
      "unifiedImportantInfoTitle"
    );

  const contentElement =
    document.getElementById(
      "unifiedImportantInfoContent"
    );

  const areaElement =
    document.getElementById(
      "unifiedImportantInfoArea"
    );

  const detailButton =
    document.getElementById(
      "unifiedImportantInfoDetailButton"
    );

  if (
    !section ||
    !labelElement ||
    !titleElement ||
    !contentElement ||
    !areaElement ||
    !detailButton
  ) {
    return;
  }

  const candidate =
    resolveUnifiedImportantInfoCandidate();

  if (!candidate) {
    section.style.display =
      "none";

    return;
  }

  const candidateShop =
    candidate.shop;

  labelElement.textContent =
    getUnifiedImportantInfoLabelText(
      candidateShop
    );

  section.classList.toggle(
    "unified-important-info-severity-emergency",
    candidate.isSafety === true
  );

  titleElement.textContent =
    candidateShop.title ||
    "";

  contentElement.textContent =
    candidateShop.message ||
    "";

  if (
    typeof candidateShop.area === "string" &&
    candidateShop.area.trim() !== ""
  ) {
    areaElement.textContent =
      "📍 " +
      candidateShop.area;

    areaElement.style.display =
      "";
  } else {
    areaElement.style.display =
      "none";
  }

  detailButton.onclick =
    function() {
      openShopModal(
        candidateShop.firestoreId
      );
    };

  section.style.display =
    "";
}


// 🔥「今日のマチナウ」STEP3専用の候補選定。運営手動投稿
// (postType==="admin" かつ authorType==="admin")だけを対象にし、
// AI自動投稿(authorType==="ai")・一般店舗投稿は一切含めない。
// 既存のgetSuggestionAreaPriorityRank()は無変更のまま呼び出すだけで、
// 新しい地域判定は作らない。rank3(地域外)は候補から除外する。
// GPS未取得(userAreaNameが未確定)の場合、getSuggestionAreaPriorityRank()が
// 常にrank3を返す既存仕様により、この関数自体が自然にnullを返す
// (那覇等へのフォールバックは行わない)。
// 運営が緊急・ライフライン・交通系のキーワードを手動投稿した場合も、
// 現段階では特例を作らずこの関数の候補として扱う(⚡への重複表示はしない、
// ⚡はauthorType==="ai"限定のまま)。
// 並び順：地域rank(0→1→2) → 新しさ。
// 将来AI判定(recommendedSlot/relevanceScore/urgencyScore/areaRelevance等)へ
// 置き換える際は、この関数の中身だけを差し替えればよい構造にしている。
function selectTodayMachinauCandidate() {
  const candidates =
    shops
      .filter(function(shop) {
        return (
          shop.postType === "admin" &&
          shop.authorType === "admin" &&
          getSuggestionAreaPriorityRank(shop) <= 2
        );
      })
      .sort(function(firstShop, secondShop) {
        const areaPriorityDifference =
          getSuggestionAreaPriorityRank(firstShop) -
          getSuggestionAreaPriorityRank(secondShop);

        if (areaPriorityDifference !== 0) {
          return areaPriorityDifference;
        }

        return (
          getDateValue(secondShop.createdAt) -
          getDateValue(firstShop.createdAt)
        );
      });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0];
}


// 🔥「今日のマチナウ」専用の薄い更新関数。#todayMachinauSectionという
// 専用DOMだけを操作し、✨(#suggestionCard)・⚡(#unifiedImportantInfoSection)
// のDOM・更新関数には一切触れない。候補判定ロジックはここに直書きせず、
// selectTodayMachinauCandidate()に閉じ込める。詳細表示は新しいモーダルを
// 作らず、既存のopenShopModal()をそのまま再利用する。
function updateTodayMachinauCard() {
  const section =
    document.getElementById("todayMachinauSection");

  const titleElement =
    document.getElementById("todayMachinauTitle");

  const contentElement =
    document.getElementById("todayMachinauContent");

  const areaElement =
    document.getElementById("todayMachinauArea");

  const detailButton =
    document.getElementById("todayMachinauDetailButton");

  if (
    !section ||
    !titleElement ||
    !contentElement ||
    !areaElement ||
    !detailButton
  ) {
    return;
  }

  const selectedShop =
    selectTodayMachinauCandidate();

  if (!selectedShop) {
    section.style.display = "none";
    return;
  }

  titleElement.textContent =
    selectedShop.title || "";

  contentElement.textContent =
    selectedShop.message || "";

  if (
    typeof selectedShop.area === "string" &&
    selectedShop.area.trim() !== ""
  ) {
    areaElement.textContent =
      "📍 " + selectedShop.area;

    areaElement.style.display = "";
  } else {
    areaElement.style.display = "none";
  }

  detailButton.onclick =
    function() {
      openShopModal(
        selectedShop.firestoreId
      );
    };

  section.style.display = "";
}