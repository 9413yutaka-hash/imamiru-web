let shops = [];

let userLatitude = null;
let userLongitude = null;
let userAreaName = null;
let selectedCategory = "すべて";

// TOP店舗カード(最大6件・横スクロール)か、見つける全件表示(1列リッチカード)かを
// 切り替えるフラグ。selectCategory()等では変更しない(切替はもっと見る/
// bottom-navigation「見つける」/「ホーム」からのみ)。
let isShowingAllShopCards = false;

// 多言語化 Phase B｜renderShops()が直近に実際へ描画した店舗IDの一覧
// (見えている店舗だけを翻訳対象にするため)。
let lastRenderedShopCardIds = [];

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

// #locationButton・#locationHeadingはgetLocation()(本体は変更しない)が
// GPS成功時に文言を直接書き換えるため、data-i18n属性の一括置換だけでは
// 正しい状態を追従できない。userLatitudeの有無で現在の状態を判定し、
// ここでだけ個別に文言を決める(getLocation()本体には一切触れない)。
// 現在地ファーストUX STEP2｜取得後は見出しも切り替えるため、対象へ
// #locationHeadingを追加した(#locationMessageはgetLocation()が
// sorting→successの遷移メッセージを自分で管理しているため対象外のまま)。
function updateLocationButtonLanguage(language) {
  const locationButton = document.getElementById("locationButton");
  const locationHeading = document.getElementById("locationHeading");

  const isLocationAcquired =
    userLatitude !== null;

  if (locationButton) {
    const buttonTranslationKey =
      isLocationAcquired
        ? "location_button_update"
        : "location_button_get";

    const translatedButtonText =
      getMachinauTranslation(buttonTranslationKey, language);

    if (translatedButtonText) {
      locationButton.textContent = translatedButtonText;
    }
  }

  if (locationHeading) {
    const headingTranslationKey =
      isLocationAcquired
        ? "location_heading_after"
        : "location_heading";

    const translatedHeadingText =
      getMachinauTranslation(headingTranslationKey, language);

    if (translatedHeadingText) {
      locationHeading.textContent = translatedHeadingText;
    }
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

  // トップ画面再設計 STEP4｜上記aria-label方式と全く同じ考え方をimgの
  // alt属性にも適用する。対象はdata-i18n-alt属性を持つ要素のみで、
  // 既存のdata-i18n(innerHTML)・data-i18n-aria-labelの挙動には一切
  // 影響しない(オープニングのバナー画像alt文言を多言語化するために追加、
  // 画像内日本語だけに意味を依存させない構造にする本部指示に対応)。
  document.querySelectorAll("[data-i18n-alt]").forEach(function (element) {
    const key = element.getAttribute("data-i18n-alt");
    const translatedText = getMachinauTranslation(key, language);

    if (translatedText) {
      element.setAttribute("alt", translatedText);
    }
  });

  // 街の掲示板 Phase10｜上記aria-label/alt方式と全く同じ考え方をinput要素の
  // placeholder属性にも適用する。対象はdata-i18n-placeholder属性を持つ
  // 要素のみで、既存のdata-i18n(innerHTML)・data-i18n-aria-label・
  // data-i18n-altの挙動には一切影響しない(全国街名検索フォームの入力欄
  // placeholderを多言語化するために追加)。
  document.querySelectorAll("[data-i18n-placeholder]").forEach(function (element) {
    const key = element.getAttribute("data-i18n-placeholder");
    const translatedText = getMachinauTranslation(key, language);

    if (translatedText) {
      element.setAttribute("placeholder", translatedText);
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

    // 多言語化 Phase B｜timeMessageが投稿者入力ではなく固定fallback文言
    // だった場合だけ、同じ考え方で現在言語へ再計算する(投稿者の自由入力
    // 本文はここでは書き換えない)。
    if (shop.isTimeMessageFallback) {
      shop.timeMessage =
        getMachinauTranslation(
          "shop_time_message_fallback",
          getCurrentMachinauLanguage()
        );
    }
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

  // 初心回帰後の新トップ体験 Phase1｜「近くの『今』」パネル・街情報ボタンの
  // 一覧内テキストは、data-i18n属性ではなくbuildAwarenessNoticeText()等が
  // 都度組み立てる文字列のため、applyMachinauLanguage()のdata-i18n一括置換
  // だけでは切り替わらない。地域おすすめと同じ理由・同じパターンで、
  // Firestore再取得なしに既存shops配列から再描画するだけ(新しいAPI呼び出し
  // は発生しない)。
  renderAwarenessNotices();

  renderAreaInfoButtons();

  // Hero写真のalt文言(shop_image_altキー)を現在言語へ即時反映する。
  // 候補選定・画像URL・Firestore再取得は発生しない(既存候補を再利用するだけ)。
  updateHeroPhoto();

  // 多言語化 Phase A｜regionTodayInfoはFirestore由来の動的コンテンツ
  // (日本語原文そのもの)のため、他の項目と違って既に取得済みのデータを
  // 再描画するだけでは正しい言語にならない。既存APIへ選択言語を伝えて
  // 再取得する(サーバー側の翻訳キャッシュがあればOpenAI再実行は発生しない)。
  refreshRegionTodayInfoForCurrentLanguage();

  // 多言語化 Phase C｜「この街の情報」もFirestore由来の動的コンテンツ
  // (Terraが生成した日本語原文)のため、regionTodayInfoと同じ理由で
  // 既存APIへ選択言語を伝えて再取得する(表示済みの場合のみ、未表示なら
  // 何もしない)。
  refreshCityInfoForCurrentLanguage();

  // 多言語化 最終Phase(マチナウ読み物)｜新しいFirestore取得は発生させず、
  // 既に取得済みのlastLoadedDynamicColumnArticlesを現在言語で再描画する
  // だけ(まだ一度も読み込まれていない場合は関数内で自然に何もしない)。
  renderDynamicColumnEntries();
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

// Ver1.8 Phase2 STEP5-D｜通報機能用。現在開いているモーダルの投稿IDと、
// 一般投稿(postType!=="admin")かどうかを保持する。admin投稿は通報対象外。
let currentModalReportShopId = null;
let currentModalReportIsGeneralPost = false;
let hasSubmittedReportThisModalSession = false;
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

// 画像UX改善Phase2｜Firestoreに保存済みのsecure_urlそのものは書き換えず、
// 表示のたびにCloudinaryの配信用変換(f_auto/q_auto/w_.../c_limit)を
// 差し込んだURLを生成するだけの共通ヘルパー。Cloudinary以外の画像URL
// (将来別サービス・外部URLの可能性)はres.cloudinary.com上の
// "/image/upload/"を含むURLかどうかで判定し、該当しなければ元のURLの
// まま返す(壊さない)。c_limitは元画像より大きくアップスケールしない
// ためのCloudinary標準の指定で、追加の契約・有料機能は不要。
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

// 画像UX改善Phase2｜表示場所ごとに必要十分な配信幅(px、Retina考慮済みの
// 実配信px数)。値を大きくし過ぎると転送量が増え、小さ過ぎると
// 高解像度端末でぼやけるため、実際の表示サイズを基準に選定。
const OPTIMIZED_IMAGE_WIDTH_CARD = 360;
const OPTIMIZED_IMAGE_WIDTH_HERO = 520;
const OPTIMIZED_IMAGE_WIDTH_MODAL = 1000;
const OPTIMIZED_IMAGE_WIDTH_REGION_RECOMMENDATION = 700;
const OPTIMIZED_IMAGE_WIDTH_FAVORITE_LIST = 400;

// 画像UX改善Phase2｜画像URLが壊れている場合に、壊れた画像アイコンを
// そのまま見せないための共通フォールバック。既存の壊れ方に応じた
// 個別fallbackが無かったため、ニュートラルなプレースホルダー画像
// (外部通信を伴わないdata URI)へ差し替えるだけの安全な処理にする。
const BROKEN_IMAGE_PLACEHOLDER_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<rect width="240" height="240" fill="#e9f1f5"/>' +
      '<text x="120" y="136" font-size="64" text-anchor="middle" fill="#0788c9" font-family="sans-serif">🌺</text>' +
    "</svg>"
  );

function handleBrokenImage(
  imageElement
) {
  if (!imageElement) {
    return;
  }

  imageElement.onerror =
    null;

  imageElement.src =
    BROKEN_IMAGE_PLACEHOLDER_DATA_URL;
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
  shop,
  isAboveFold
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

  // 画像UX改善Phase2｜above-the-fold(初期表示で見える先頭カード)だけ
  // eager+fetchpriority=highにし、残りは既存通りlazyのまま
  // (全カードをeagerにすると逆に初期表示が遅くなるため使い過ぎない)。
  const loadingAttributeHtml =
    isAboveFold
      ? 'loading="eager" fetchpriority="high"'
      : 'loading="lazy"';

  return `
    <img
      src="${escapeHtml(
        buildOptimizedImageUrl(
          firstImageUrl,
          { width: OPTIMIZED_IMAGE_WIDTH_CARD }
        )
      )}"
      alt="${getMachinauTranslation(
        "shop_image_alt",
        getCurrentMachinauLanguage()
      ).replace(
        "{SHOP_NAME}",
        escapeHtml(shop.name)
      )}"
      ${loadingAttributeHtml}
      onerror="handleBrokenImage(this)"
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

  // 多言語化 Phase B｜timeMessageが投稿者入力(data.timeMessage等)から来て
  // いるか、翻訳キー由来のfallback文言かを記録する。fallbackの場合だけ
  // 言語切替時に再計算できるようにするため(投稿者の自由入力本文は
  // ここでは書き換えない、AI翻訳の対象は別途shop.messageで扱う)。
  const hasRealTimeMessage =
    [
      data.timeMessage,
      data.period,
      data.eventTime,
      data.openingHours
    ].some(
      function(value) {
        return (
          typeof value === "string" &&
          value.trim() !== ""
        );
      }
    );

  const timeMessage =
    hasRealTimeMessage
      ? getFirstText(
          [
            data.timeMessage,
            data.period,
            data.eventTime,
            data.openingHours
          ],
          ""
        )
      : getMachinauTranslation(
          "shop_time_message_fallback",
          getCurrentMachinauLanguage()
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

    // 多言語化 Phase B｜言語切替時にtimeMessageを再計算してよいかの判定用。
    isTimeMessageFallback:
      !hasRealTimeMessage,

    // 多言語化 Phase B｜shop.message(説明文)のAI翻訳結果を言語コードごとに
    // 保持するキャッシュ({en:"...", ...}のように増やせる構造)。
    // fetchShopTranslationsForVisibleShops()が取得後に書き込む。
    translatedMessages:
      {},

    // 多言語化 Phase D｜shop.title(街を見るAI由来の見出し)のAI翻訳結果を
    // 言語コードごとに保持するキャッシュ。translatedMessagesとは完全に
    // 独立したフィールド・独立したFirestore側sourceHashで管理する
    // (title/messageのどちらか一方だけが変わっても、もう一方の既存
    // キャッシュを無効化しないため)。地域のおすすめ(街を見るAI由来の
    // アイテム)のtitle表示にのみ使う。
    translatedTitles:
      {},

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
        : "",

    // 情報源の信用区分 Phase1｜submissions.sourceTrust("official"/
    // "self_reported"/"third_party"、または未設定を表す空文字)をそのまま
    // 通す。authorType(誰がマチナウ上で投稿を作成したか)とは別軸のため、
    // 意味を混同しない。値の厳格な検証はapi/moderate-submission.jsの
    // sanitizeAiConciergeCandidate()側で行う。
    sourceTrust:
      typeof data.sourceTrust === "string"
        ? data.sourceTrust.trim()
        : "",

    isPermanentAd:
      data.isPermanentAd === true,

    // 発信元表示Phase1｜api/moderate-submission.jsのhandleShopSubmissionCreateRequest()
    // だけがサーバー側で設定する値("verified_shop")をそのまま通す。
    // submissionType/storeId単独では発信元表示を判定しない(本部指示)。
    publisherType:
      typeof data.publisherType === "string"
        ? data.publisherType.trim()
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
    buildOptimizedImageUrl(
      candidate.imageUrls[0],
      { width: OPTIMIZED_IMAGE_WIDTH_HERO }
    );

  if (heroPhotoImage.src !== photoUrl) {
    heroPhotoImage.src = photoUrl;
  }

  heroPhotoImage.onerror =
    function() {
      handleBrokenImage(
        heroPhotoImage
      );
    };

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

  // 多言語化 Phase B｜実際に画面へ描画される店舗IDだけを覚えておく
  // (fetchShopTranslationsForVisibleShops()が「今表示されている店舗」
  // だけを対象に翻訳を取得するため。見えていない店舗まで一気に翻訳しない)。
  lastRenderedShopCardIds =
    topShopCardCandidates.map(
      function(shop) {
        return shop.firestoreId;
      }
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

  const shopCardsHtml =
    topShopCardCandidates
      .map(
        function(shop, shopCardIndex) {
          const isFavorite =
            favoriteShopIds.has(
              shop.firestoreId
            );

          // 多言語化 Phase B｜翻訳キャッシュ(shop.translatedMessages)が
          // あればそれを表示し、無ければ原文(日本語)のまま表示する。
          // 翻訳の取得はfetchShopTranslationsForVisibleShops()が別途行う。
          const currentCardLanguage =
            getCurrentMachinauLanguage();

          const displayMessage =
            currentCardLanguage !== MACHINAU_DEFAULT_LANGUAGE &&
            shop.translatedMessages &&
            typeof shop.translatedMessages[currentCardLanguage] === "string" &&
            shop.translatedMessages[currentCardLanguage] !== ""
              ? shop.translatedMessages[currentCardLanguage]
              : shop.message;

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
              data-shop-id="${escapeHtml(
                shop.firestoreId
              )}"
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
                  shop,
                  shopCardIndex < 2
                )}

              </div>

              <div class="shop-body">

                <h3 class="shop-name">
                  ${escapeHtml(
                    shop.name
                  )}
                </h3>

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

                ${
                  isAdminPost
                    ? ""
                    : shop.isPermanentAd
                      ? `
                        <div class="user-post-badge-row">
                          <span class="user-post-badge">
                            ${getMachinauTranslation(
                              "shop_permanent_ad_badge",
                              getCurrentMachinauLanguage()
                            )}
                          </span>
                        </div>
                      `
                      : shop.publisherType === "verified_shop"
                        ? `
                          <div class="user-post-badge-row">
                            <span class="user-post-badge">
                              ${getMachinauTranslation(
                                "shop_verified_badge",
                                getCurrentMachinauLanguage()
                              )}
                            </span>
                          </div>
                        `
                        : `
                      <div class="user-post-badge-row">
                        <span class="user-post-badge">
                          ${getMachinauTranslation(
                            "shop_user_post_badge",
                            getCurrentMachinauLanguage()
                          )}
                        </span>
                      </div>
                    `
                }

                <p class="shop-description">
                  ${escapeHtml(
                    displayMessage
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

  // 画像UX改善Phase2｜カテゴリー切替・お気に入り切替・60秒ごとの
  // 期限表示更新タイマー(startExpiryDisplayRefreshTimer)等、renderShops()は
  // 高頻度に呼ばれるが、その都度shopsList.innerHTMLを丸ごと作り直すと、
  // 内容が変わっていない店舗カードの<img>まで毎回作り直され、
  // 同じ写真が一瞬ちらつく原因になる。内容(HTML)が前回と一致する
  // カードはDOMノードをそのまま使い回すことで、無駄な再描画を減らす
  // (GPS取得直後の距離順並び替えは、GPS成功時のコールバック側で
  // 別途「並び替え中」の遷移を挟んでおり、そちらで対応済み)。
  renderShopCardsHtmlIntoList(
    shopsList,
    shopCardsHtml
  );

  // 多言語化 Phase B｜日本語以外が選択されている場合だけ、今回描画した
  // 店舗のうち未翻訳のものをまとめて1回のリクエストで取得する
  // (既に翻訳済み・取得中のものは内部でスキップされ、重複実行しない)。
  refreshShopTranslationsIfNeeded();
}

// renderShops()専用。data-shop-id属性を持つ新しいHTML文字列を、
// 前回描画時と内容が一致するカードは既存DOMノードを再利用しながら
// 反映する。data-shop-id属性が無いノードは常に新規ノードを使う
// (フォールバック、既存の描画結果を壊さない)。
let lastRenderedShopCardHtmlById =
  new Map();

function renderShopCardsHtmlIntoList(
  container,
  cardsHtml
) {
  const temporaryContainer =
    document.createElement(
      "div"
    );

  temporaryContainer.innerHTML =
    cardsHtml;

  const existingNodesByShopId =
    new Map();

  Array.prototype.forEach.call(
    container.children,
    function(existingNode) {
      const shopId =
        existingNode.getAttribute &&
        existingNode.getAttribute(
          "data-shop-id"
        );

      if (shopId) {
        existingNodesByShopId.set(
          shopId,
          existingNode
        );
      }
    }
  );

  const fragment =
    document.createDocumentFragment();

  const nextRenderedHtmlById =
    new Map();

  Array.prototype.forEach.call(
    temporaryContainer.children,
    function(newNode) {
      const shopId =
        newNode.getAttribute(
          "data-shop-id"
        );

      const newNodeHtml =
        newNode.outerHTML;

      if (shopId) {
        nextRenderedHtmlById.set(
          shopId,
          newNodeHtml
        );
      }

      const existingNode =
        shopId
          ? existingNodesByShopId.get(
              shopId
            )
          : null;

      const previousNodeHtml =
        shopId
          ? lastRenderedShopCardHtmlById.get(
              shopId
            )
          : null;

      if (
        existingNode &&
        previousNodeHtml ===
          newNodeHtml
      ) {
        fragment.appendChild(
          existingNode
        );
      } else {
        fragment.appendChild(
          newNode
        );
      }
    }
  );

  container.replaceChildren(
    fragment
  );

  lastRenderedShopCardHtmlById =
    nextRenderedHtmlById;
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
              src="${escapeHtml(
                buildOptimizedImageUrl(
                  firstImageUrl,
                  { width: OPTIMIZED_IMAGE_WIDTH_FAVORITE_LIST }
                )
              )}"
              alt="${getMachinauTranslation(
                "shop_image_alt",
                getCurrentMachinauLanguage()
              ).replace(
                "{SHOP_NAME}",
                escapeHtml(shop.name)
              )}"
              loading="lazy"
              onerror="handleBrokenImage(this)"
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

  // 画像UX改善Phase2｜詳細モーダルは「写真全体を見る」ことを優先するため
  // coverからcontainへ変更(.modal-visualの背景色#e9f1f5が余白として
  // 自然に見える。CSS側の高さもmin(58vh,440px)へ拡張済み)。
  image.style.objectFit =
    "contain";

  image.onerror =
    function() {
      handleBrokenImage(
        image
      );
    };

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

// 画像UX改善Phase2｜次画像/前画像への切替を速くするため、現在表示中の
// 1枚に加えて隣接する最大2枚(次・前)だけをブラウザキャッシュへ
// 先読みする。全件一括プリロードは通信量を無駄に増やすため行わない。
// buildOptimizedImageUrl()で生成するURLは実際に<img>へ設定するURLと
// 完全に一致させ、キャッシュヒットするようにする。
function preloadAdjacentModalImages(
  centerIndex
) {
  const imageCount =
    currentModalImages.length;

  if (imageCount <= 1) {
    return;
  }

  const relativeOffsetsToPreload =
    [1, -1];

  relativeOffsetsToPreload.forEach(
    function(offset) {
      const preloadIndex =
        (
          centerIndex +
          offset +
          imageCount
        ) %
        imageCount;

      const preloadUrl =
        buildOptimizedImageUrl(
          currentModalImages[
            preloadIndex
          ],
          { width: OPTIMIZED_IMAGE_WIDTH_MODAL }
        );

      const preloadImage =
        new Image();

      preloadImage.src =
        preloadUrl;
    }
  );
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
    buildOptimizedImageUrl(
      currentModalImages[
        currentModalImageIndex
      ],
      { width: OPTIMIZED_IMAGE_WIDTH_MODAL }
    );

  preloadAdjacentModalImages(
    currentModalImageIndex
  );

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

      // 画像UX改善Phase2｜image.srcの設定はupdateModalSliderDisplay()側
      // (最適化URL生成・プリロードと同じ場所)に一本化し、ここでの
      // 未最適化URLへの二重代入(無駄な読み込み)をなくす。
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

  // Ver1.8 Phase2 STEP5-D｜通報導線は一般投稿のみに表示する
  // (admin/AI収集投稿は対象外)。モーダルを開き直すたびに
  // 通報導線の表示状態と理由リストの開閉状態をリセットする。
  currentModalReportShopId =
    selectedShop.firestoreId;

  currentModalReportIsGeneralPost =
    !isAdminPost;

  hasSubmittedReportThisModalSession =
    false;

  const modalReportSection =
    document.getElementById(
      "modalReportSection"
    );

  const modalReportReasons =
    document.getElementById(
      "modalReportReasons"
    );

  const modalReportStatus =
    document.getElementById(
      "modalReportStatus"
    );

  if (modalReportSection) {
    modalReportSection.style.display =
      currentModalReportIsGeneralPost
        ? ""
        : "none";
  }

  if (modalReportReasons) {
    modalReportReasons.style.display =
      "none";
  }

  if (modalReportStatus) {
    modalReportStatus.textContent =
      "";
  }

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

  const modalCurrentLanguage =
    getCurrentMachinauLanguage();

  // 多言語化 Phase B｜翻訳キャッシュ(shop.translatedMessages)があれば
  // それを表示し、無ければ既存どおり原文(日本語)をそのまま表示する。
  // 翻訳の取得・生成自体はfetchShopTranslationsForVisibleShops()が
  // 別途行う(このモーダル関数は取得済みの結果を読むだけ)。
  const modalDisplayMessage =
    modalCurrentLanguage !== MACHINAU_DEFAULT_LANGUAGE &&
    selectedShop.translatedMessages &&
    typeof selectedShop.translatedMessages[modalCurrentLanguage] === "string" &&
    selectedShop.translatedMessages[modalCurrentLanguage] !== ""
      ? selectedShop.translatedMessages[modalCurrentLanguage]
      : selectedShop.message;

  let modalText =
    "📢 " +
    escapeHtml(
      modalDisplayMessage
    );

  if (
    selectedShop.sourceLabel
  ) {
    // 多言語化 Phase B｜sourceLabelはFirestoreに常に固定文字列
    // ("マチナウ運営より")として保存された運営情報ラベルであり、AI翻訳
    // すべき自由入力本文ではない。既存の店舗一覧カードと同じ意味の
    // shop_admin_badge翻訳キー(0円の固定UI翻訳)をそのまま使う。
    modalText +=
      "<br><br>" +
      escapeHtml(
        getMachinauTranslation(
          "shop_admin_badge",
          modalCurrentLanguage
        )
      );
  } else if (
    selectedShop.isPermanentAd
  ) {
    modalText +=
      "<br><br>" +
      escapeHtml(
        getMachinauTranslation(
          "shop_permanent_ad_badge",
          getCurrentMachinauLanguage()
        )
      );
  } else if (
    selectedShop.publisherType === "verified_shop"
  ) {
    // 発信元表示Phase1｜TOPカード(renderShops())と同じ条件・同じ優先順位
    // (sourceLabel／isPermanentAdの後、一般ユーザー投稿フォールバックの前)
    // で判定する。TOPで「🏪 お店から」なのにモーダルで「マチナウユーザー
    // からの情報」に戻る不整合を作らない(本部指示)。
    modalText +=
      "<br><br>" +
      escapeHtml(
        getMachinauTranslation(
          "shop_verified_badge",
          getCurrentMachinauLanguage()
        )
      );
  } else if (
    !isAdminPost
  ) {
    // Ver1.8 Phase2 STEP5-D｜一般利用者投稿には店舗公式・運営公式と
    // 誤認させないラベルを表示する(sourceLabelがある admin投稿とは
    // 排他的、一般投稿にsourceLabelが設定されることは無いため衝突しない)。
    modalText +=
      "<br><br>" +
      escapeHtml(
        getMachinauTranslation(
          "shop_user_post_badge",
          getCurrentMachinauLanguage()
        )
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

// Ver1.8 Phase2 STEP5-D｜通報機能。「気になる情報を報告」を押した時に
// 理由選択を開閉するだけの表示切替。まだFirestoreへは書き込まない。
function toggleModalReportReasons() {
  const modalReportReasons =
    document.getElementById(
      "modalReportReasons"
    );

  if (!modalReportReasons) {
    return;
  }

  modalReportReasons.style.display =
    modalReportReasons.style.display ===
    "none"
      ? "flex"
      : "none";
}

// getAnonymousIdTokenForLocationCollection()と同じ「既にサインイン済みなら
// 使い回す」方針だが、通報にはIDトークン自体は不要でuidのみ使うため、
// signInAnonymously()の完了を待ってauth.currentUserを返す専用関数とする。
function getAnonymousUserForReport() {
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

  if (auth.currentUser) {
    return Promise.resolve(
      auth.currentUser
    );
  }

  return auth
    .signInAnonymously()
    .then(
      function(credential) {
        return credential.user;
      }
    );
}

// 通報をFirestoreの`reports`コレクションへ保存する。ドキュメントIDを
// "{submissionId}_{uid}"に固定することで、同一匿名ユーザーが同じ投稿を
// 複数回通報してもドキュメントが1件のまま上書きされるだけになり、
// 新しいカウント/重複防止ロジックを追加しなくても「1人1回」を強制できる。
// 通報された投稿自体はここでは一切変更しない(自動非表示・自動削除はしない、
// STEP5-C仕様の「1件の悪意ある通報で正常投稿を消せない設計」を踏襲)。
//
// 【重要・代表への申し送り事項】このコードはFirestoreの`reports`
// コレクションへの新規書き込みを行う。既存の`submissions`コレクションと
// 同様に、Firestore Security Rules側で
// `match /reports/{reportId} { allow create: if request.auth != null; }`
// 相当のルールが無いと、この書き込みは権限エラーで失敗する。このルール
// 追加はFirebase Console側の作業であり、本ラウンドのコード変更には
// 含まれていない(コードからは変更・確認ができないため)。
function submitModalReport(
  reason
) {
  if (
    !currentModalReportShopId ||
    !currentModalReportIsGeneralPost
  ) {
    return;
  }

  const modalReportStatus =
    document.getElementById(
      "modalReportStatus"
    );

  if (
    hasSubmittedReportThisModalSession
  ) {
    if (modalReportStatus) {
      modalReportStatus.textContent =
        getMachinauTranslation(
          "report_already_submitted_message",
          getCurrentMachinauLanguage()
        );
    }

    return;
  }

  if (
    !window.machinauDb ||
    typeof firebase === "undefined"
  ) {
    if (modalReportStatus) {
      modalReportStatus.textContent =
        getMachinauTranslation(
          "report_error_message",
          getCurrentMachinauLanguage()
        );
    }

    return;
  }

  const reportReasonButtons =
    document.querySelectorAll(
      ".modal-report-reason-button"
    );

  // Ver1.8 Phase2 STEP5-D(不具合修正)｜匿名Firebase Authのサインイン
  // 往復に数秒かかり、その間ボタン押下直後は画面上何も変化しないため
  // 「反応していない」ように見えていた(代表実機確認で判明)。クリック
  // 直後に即座に「送信しています…」を表示し、理由ボタンを一時的に
  // 無効化することで、押下が受理されたことを即時に伝える。
  if (modalReportStatus) {
    modalReportStatus.textContent =
      getMachinauTranslation(
        "report_sending_message",
        getCurrentMachinauLanguage()
      );
  }

  reportReasonButtons.forEach(
    function(button) {
      button.disabled =
        true;
    }
  );

  const submissionIdAtSubmitTime =
    currentModalReportShopId;

  getAnonymousUserForReport()
    .then(
      function(user) {
        const reportDocId =
          submissionIdAtSubmitTime +
          "_" +
          user.uid;

        return window.machinauDb
          .collection(
            "reports"
          )
          .doc(
            reportDocId
          )
          .set(
            {
              submissionId:
                submissionIdAtSubmitTime,

              reporterUid:
                user.uid,

              reason:
                reason,

              createdAt:
                firebase.firestore.FieldValue.serverTimestamp()
            }
          );
      }
    )
    .then(
      function() {
        hasSubmittedReportThisModalSession =
          true;

        const modalReportReasons =
          document.getElementById(
            "modalReportReasons"
          );

        if (modalReportReasons) {
          modalReportReasons.style.display =
            "none";
        }

        if (modalReportStatus) {
          modalReportStatus.textContent =
            getMachinauTranslation(
              "report_submitted_message",
              getCurrentMachinauLanguage()
            );
        }
      }
    )
    .catch(
      function(error) {
        console.error(
          "通報の送信に失敗しました：",
          error
        );

        if (modalReportStatus) {
          modalReportStatus.textContent =
            getMachinauTranslation(
              "report_error_message",
              getCurrentMachinauLanguage()
            );
        }

        // 送信に失敗した場合のみ再試行できるようボタンを復帰させる
        // (成功時は理由セクション自体を非表示にするため復帰不要)。
        reportReasonButtons.forEach(
          function(button) {
            button.disabled =
              false;
          }
        );
      }
    );
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


// AIコンシェルジュ Phase2｜沖縄本島 北部/中部/南部の代表地点。
// 「市町村ごとの正確な天気」として断定表示するものではなく、AIが
// 「移動する/しない」を判断するための広域の目安として扱う(プロンプト側にも
// 明記)。離島は今回対象外。選定理由(完了報告に記載)：
// 北部＝名護市(本島北部の行政的中心地)、中部＝沖縄市(本島中部の主要都市、
// 名称もそのまま「本島中部側」の目安として分かりやすい)、
// 南部＝那覇市(県庁所在地、本島南部の代表地点として最も自然)。
// 過度な細分化(市町村ごと等)はしない。
const WEATHER_REGIONAL_POINTS =
  [
    { region: "北部", label: "本島北部側", latitude: 26.5911, longitude: 127.9761 },
    { region: "中部", label: "本島中部側", latitude: 26.3344, longitude: 127.8056 },
    { region: "南部", label: "本島南部側", latitude: 26.2124, longitude: 127.6809 }
  ];

// 地域天気は利用者ごとの現在地キャッシュ(readWeatherCache/writeWeatherCache、
// 1件しか保持しない設計)とは別物として扱う。固定3地点の座標をそのまま
// /api/weather.jsへ渡すため、Vercel/CDN側の共有キャッシュ(15分)が
// 全利用者で自然に共有され、利用者ごとのセッションキャッシュを新たに
// 作る必要がない(PV増がAPIコール数増に直結しない設計)。
async function fetchRegionalWeatherForAiConcierge() {
  const results =
    await Promise.all(
      WEATHER_REGIONAL_POINTS.map(
        async function(point) {
          try {
            const response =
              await fetch(
                "/api/weather?lat=" +
                encodeURIComponent(point.latitude) +
                "&lon=" +
                encodeURIComponent(point.longitude)
              );

            const responseData =
              await response.json();

            if (
              !response.ok ||
              !responseData ||
              responseData.success !== true ||
              !responseData.weather
            ) {
              return null;
            }

            return {
              region: point.label,
              conditionText:
                typeof responseData.weather.conditionText === "string"
                  ? responseData.weather.conditionText
                  : "",
              chanceOfRain: responseData.weather.chanceOfRain,
              temperatureC: responseData.weather.temperatureC
            };
          } catch (error) {
            // 1地点の取得に失敗しても他の地点・現在地天気・AI提案全体には
            // 影響させない(段階的劣化、地域比較なしで提案を続行する)。
            return null;
          }
        }
      )
    );

  return results.filter(
    function(regionResult) {
      return regionResult !== null;
    }
  );
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
// Ver1.8 Phase1(実機不具合調査・修正)｜実スマホ(モバイルUA・低速回線相当)での
// 実機検証で、Google Maps APIキーのreferrer制限(RefererNotAllowedMapError)発生時に
// geocoder.geocode()のコールバックが一度も呼ばれず、resolveAreaNameFromCoordinates()の
// Promiseが無期限にハングすることを確認した(デスクトップ環境では同エラーでも
// 数秒以内にコールバックが呼ばれていたため、これまでの調査では再現しなかった)。
// これによりisAreaNameResolvedForMachinauSuggestionが永久にfalseのままとなり、
// ✨カードがGPS前プレースホルダーに固着する。
const AREA_NAME_RESOLUTION_TIMEOUT_MS =
  6000;

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

    // geocode()のコールバックが一定時間内に呼ばれなければnullで確定させる。
    // Promiseは最初のresolve()以降は無視される仕様のため、後から本物の
    // コールバックが届いても安全(二重解決にはならない)。
    const timeoutId =
      setTimeout(
        function() {
          resolve(null);
        },
        AREA_NAME_RESOLUTION_TIMEOUT_MS
      );

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
          clearTimeout(
            timeoutId
          );

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
      clearTimeout(
        timeoutId
      );

      resolve(null);
    }
  });
}


// Ver1.8 Phase2(マチナウ読み物・地域連動基盤)｜resolveAreaNameFromCoordinates()
// (既存、localityのみ取得、userAreaName/getSuggestionAreaPriorityRank()等
// 沖縄専用の既存ロジックが広く依存しているため一切変更しない)とは完全に
// 独立した、読み物の地域マッチング専用の新しい関数。同じGeocoder結果から
// country(shortName、ロケール非依存のISOコード)・prefecture
// (administrative_area_level_1のlongName)・city(localityのlongName)の
// 3階層を取り出す。既存のuserAreaName・地域優先度判定・AIコンシェルジュ・
// 常設広告判定等、他のどの機能にも一切使わない(読み物一覧の取得だけに使う)。
//
// 広域region×localDate共有AI地域情報 Phase1｜既存の戻り値(country/
// prefecture/city)・既存呼び出し元(loadDynamicColumnEntries())は一切
// 変更せず、後方互換のまま以下を追加する(同じ1回のGeocoderレスポンスを
// 再利用するだけで、新しいReverse Geocoding呼び出しは増やさない)。
// - countryCode：countryと同じ値(短縮名)。新機能側の呼び名を明確にするため
// - countryName：countryのlong_name(表示用)
// - regionKey：address_componentsのplace_idではなく、results配列の中で
//   types自体がadministrative_area_level_1を含む「result本体」の
//   place_id(Production実測で取得可能と確認済み、言語非依存の安定識別子)
// - regionName：prefectureと同じ値(表示用、新機能側の呼び名を明確にするため)
// - municipality：cityと同じ値(新機能側の呼び名を明確にするため)
function resolveLocationHierarchyFromCoordinates(
  latitude,
  longitude
) {
  return new Promise(
    function(resolve) {
      if (
        typeof google === "undefined" ||
        !google.maps ||
        !google.maps.Geocoder
      ) {
        resolve(
          {
            country: "",
            prefecture: "",
            city: "",
            countryCode: "",
            countryName: "",
            regionKey: "",
            regionName: "",
            municipality: "",
            municipalityPlaceId: ""
          }
        );
        return;
      }

      const timeoutId =
        setTimeout(
          function() {
            resolve(
              {
                country: "",
                prefecture: "",
                city: "",
                countryCode: "",
                countryName: "",
                regionKey: "",
                regionName: "",
                municipality: "",
                municipalityPlaceId: ""
              }
            );
          },
          AREA_NAME_RESOLUTION_TIMEOUT_MS
        );

      function findComponent(
        addressComponents,
        typeName
      ) {
        if (
          !Array.isArray(
            addressComponents
          )
        ) {
          return null;
        }

        return (
          addressComponents.find(
            function(component) {
              return (
                Array.isArray(
                  component.types
                ) &&
                component.types.includes(
                  typeName
                )
              );
            }
          ) ||
          null
        );
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
            clearTimeout(
              timeoutId
            );

            if (
              status !== "OK" ||
              !Array.isArray(results) ||
              results.length === 0
            ) {
              resolve(
                {
                  country: "",
                  prefecture: "",
                  city: "",
                  countryCode: "",
                  countryName: "",
                  regionKey: "",
                  regionName: "",
                  municipality: "",
                  municipalityPlaceId: ""
                }
              );
              return;
            }

            let countryValue =
              "";

            let countryNameValue =
              "";

            let prefectureValue =
              "";

            let cityValue =
              "";

            let regionKeyValue =
              "";

            let municipalityPlaceIdValue =
              "";

            results.forEach(
              function(result) {
                const components =
                  result.address_components;

                if (
                  countryValue === ""
                ) {
                  const countryComponent =
                    findComponent(
                      components,
                      "country"
                    );

                  if (
                    countryComponent &&
                    typeof countryComponent.short_name === "string"
                  ) {
                    countryValue =
                      countryComponent.short_name;
                  }

                  if (
                    countryComponent &&
                    typeof countryComponent.long_name === "string"
                  ) {
                    countryNameValue =
                      countryComponent.long_name;
                  }
                }

                if (
                  prefectureValue === ""
                ) {
                  const prefectureComponent =
                    findComponent(
                      components,
                      "administrative_area_level_1"
                    );

                  if (
                    prefectureComponent &&
                    typeof prefectureComponent.long_name === "string"
                  ) {
                    prefectureValue =
                      prefectureComponent.long_name;
                  }
                }

                if (
                  cityValue === ""
                ) {
                  const cityComponent =
                    findComponent(
                      components,
                      "locality"
                    );

                  if (
                    cityComponent &&
                    typeof cityComponent.long_name === "string"
                  ) {
                    cityValue =
                      cityComponent.long_name;
                  }
                }

                // regionKeyはaddress_components内のplace_idではなく、
                // result自身がadministrative_area_level_1を表す場合の
                // result.place_id(言語非依存でProduction実測済み)を使う。
                if (
                  regionKeyValue === "" &&
                  Array.isArray(
                    result.types
                  ) &&
                  result.types.includes(
                    "administrative_area_level_1"
                  ) &&
                  typeof result.place_id === "string" &&
                  result.place_id !== ""
                ) {
                  regionKeyValue =
                    result.place_id;
                }

                // 街の掲示板 Phase3｜同じ考え方で、市区町村(locality)を
                // 表すresult自身のplace_idも追加で取り出す(Phase0で実機
                // 確認済みの手法)。既存のregionKeyValue(都道府県レベル)・
                // cityValue(locality長い表示名)には一切触れず、新しい
                // フィールドとして追加するだけ(既存呼び出し元
                // loadDynamicColumnEntries()・triggerRegionTodayInfo()の
                // 既存挙動には影響しない)。
                if (
                  municipalityPlaceIdValue === "" &&
                  Array.isArray(
                    result.types
                  ) &&
                  result.types.includes(
                    "locality"
                  ) &&
                  typeof result.place_id === "string" &&
                  result.place_id !== ""
                ) {
                  municipalityPlaceIdValue =
                    result.place_id;
                }
              }
            );

            resolve(
              {
                country: countryValue,
                prefecture: prefectureValue,
                city: cityValue,
                countryCode: countryValue,
                countryName: countryNameValue,
                regionKey: regionKeyValue,
                regionName: prefectureValue,
                municipality: cityValue,
                municipalityPlaceId: municipalityPlaceIdValue
              }
            );
          }
        );
      } catch (error) {
        clearTimeout(
          timeoutId
        );

        resolve(
          {
            country: "",
            prefecture: "",
            city: "",
            countryCode: "",
            countryName: "",
            regionKey: "",
            regionName: "",
            municipality: "",
            municipalityPlaceId: ""
          }
        );
      }
    }
  );
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


// Ver1.8 Phase2 STEP4-D｜常設店舗広告(isPermanentAd:true)が✨の一般候補に
// なれるかを判定する専用関数。postType!=="admin"のため既存の
// getSuggestionAreaPriorityRank()(admin専用ゲート)は使わず、この関数だけで
// 独立して判定する。新しい地域判定体系は作らず、既存のuserAreaName解決結果
// (resolveAreaNameFromCoordinates()、Google Geocoderのlocality名)と
// shop.area(convertSubmissionToShop()で既にtrim済み)を、既存の
// getSuggestionAreaPriorityRank()と同じ「文字列の完全一致」だけで比較する。
// admin投稿のlatitude/longitudeは店舗所在地を保証しない(運営担当者が
// 投稿作成時にいた場所になり得る)ため、意図的に緯度経度・距離計算は
// 一切使わない。areaが空、または広域を示す特別値
// AI_AUTO_POST_WIDE_AREA_NAME("沖縄県全域")の場合は、単一店舗の常設広告としては
// 現在地との関連を確認できないため、安全側(候補外)に倒す。
function isPermanentAdRelevantToUserArea(shop) {
  if (
    typeof userAreaName !== "string" ||
    userAreaName === ""
  ) {
    return false;
  }

  if (
    typeof shop.area !== "string" ||
    shop.area === ""
  ) {
    return false;
  }

  if (shop.area === AI_AUTO_POST_WIDE_AREA_NAME) {
    return false;
  }

  return shop.area === userAreaName;
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
// Ver1.8 Phase2 STEP4-D｜上記の公式イベント/観光候補が1件も無い場合に限り、
// 常設店舗広告(isPermanentAd:true かつisPermanentAdRelevantToUserArea()が
// true)をフォールバック候補にする。公式候補が既にある場合は常設広告を
// 一切見ない(常設広告が公式候補を押し退けることはない)。
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

  if (candidates.length > 0) {
    return candidates[0];
  }

  const permanentAdCandidates =
    shops
      .filter(function(shop) {
        return (
          shop.isPermanentAd === true &&
          isPermanentAdRelevantToUserArea(shop)
        );
      })
      .sort(function(firstShop, secondShop) {
        return (
          getDateValue(secondShop.createdAt) -
          getDateValue(firstShop.createdAt)
        );
      });

  if (permanentAdCandidates.length === 0) {
    return null;
  }

  return permanentAdCandidates[0];
}


// Ver1.8 Phase1｜AIコンシェルジュへ渡す候補一覧。selectTravelerSuggestionCandidate()
// と全く同じ絞り込み条件・並び順を使うが、先頭1件だけでなく最大
// AI_CONCIERGE_MAX_CANDIDATES件を返す点だけが異なる。selectTravelerSuggestionCandidate()
// 自体は無変更のまま保持し、フォールバック用の候補選定として引き続き使う。
const AI_CONCIERGE_MAX_CANDIDATES =
  5;

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

// AIコンシェルジュ Phase2｜api/moderate-submission.jsのAI_CONCIERGE_FIELD_
// MAX_LENGTHSと同じ値(サーバー側で再度クリップされるための安全網であり、
// ここでの値はネットワーク送信量を抑えるための1次的な切り詰め)。
const AI_CONCIERGE_CONTENT_EXCERPT_MAX_LENGTH =
  180;

const AI_CONCIERGE_LOCATION_LABEL_MAX_LENGTH =
  60;

// Ver1.8 Phase2 STEP4-D｜selectTravelerSuggestionCandidate()と同じ思想で、
// 公式のイベント/観光候補を優先し、その件数がAI_CONCIERGE_MAX_CANDIDATESに
// 満たない場合だけ、残り枠を常設店舗広告(isPermanentAdRelevantToUserArea()が
// trueのもの)で埋める。公式候補を後ろへ押し出すことはなく、常時
// 常設広告だけでAIコンシェルジュ候補を占有することもない。
function selectAiConciergeCandidates() {
  const officialCandidates = shops
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

  if (officialCandidates.length >= AI_CONCIERGE_MAX_CANDIDATES) {
    return officialCandidates.slice(0, AI_CONCIERGE_MAX_CANDIDATES);
  }

  const permanentAdCandidates = shops
    .filter(function(shop) {
      return (
        shop.isPermanentAd === true &&
        isPermanentAdRelevantToUserArea(shop)
      );
    })
    .sort(function(firstShop, secondShop) {
      return (
        getDateValue(secondShop.createdAt) -
        getDateValue(firstShop.createdAt)
      );
    });

  return officialCandidates
    .concat(permanentAdCandidates)
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


// マチナウAI一本化「お知らせ」接続｜街を見るAIが収集・投稿まで成功させた
// authorType:"ai"かつcategory:"お知らせ"(resolveDraftCategory()の既定/
// 安全キーワード一致カテゴリー、api/admin-source-collect.js参照)は、
// 従来この関数の対象外だったため、重要安全情報(factual_info)以外は
// buildAiConciergeCandidatePool()のどのsourceTypeにも該当せず、マチナウAI
// へ一切届いていなかった。既存のadmin投稿(shop.authorType==="admin")の
// 条件は変更せず、この1条件だけを additional で許可する(既存経路は無変更)。
function selectTodayMachinauCandidatesForAiConcierge() {
  return shops
    .filter(function(shop) {
      return (
        shop.postType === "admin" &&
        (
          shop.authorType === "admin" ||
          (
            shop.authorType === "ai" &&
            shop.category === "お知らせ"
          )
        ) &&
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

  // AIコンシェルジュ Phase2｜候補の「事実落ち」対策。既存のshop.message
  // (本文)・shop.address(場所)・shop.websiteUrl(情報元)・shop.expiresAt
  // (有効期限)は、いずれもconvertSubmissionToShop()が既に持っている
  // 実在のフィールドで、新しいデータは作らない。factSummaryとは異なり
  // sourceTypeを問わず付与する(factSummaryはfactual_info専用のまま
  // 無変更で残す)。
  const contentExcerpt =
    typeof shop.message === "string"
      ? shop.message
          .trim()
          .slice(0, AI_CONCIERGE_CONTENT_EXCERPT_MAX_LENGTH)
      : "";

  const locationLabel =
    typeof shop.address === "string"
      ? shop.address
          .trim()
          .slice(0, AI_CONCIERGE_LOCATION_LABEL_MAX_LENGTH)
      : "";

  const sourceUrl =
    typeof shop.websiteUrl === "string"
      ? shop.websiteUrl
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
    factSummary: factSummary,
    shopName:
      typeof shop.name === "string"
        ? shop.name
        : "",
    contentExcerpt: contentExcerpt,
    locationLabel: locationLabel,
    validUntilHint:
      buildAiConciergeValidUntilHint(
        shop.expiresAt
      ),
    sourceUrl: sourceUrl,

    // マチナウAI一本化「お知らせ」接続｜新しいFirestoreフィールドは作らず、
    // 既存のshop.authorType(submissionsに既に保存済み)をそのまま
    // candidateへ通す。Terra側でadmin(運営が直接投稿)とai(街を見るAIが
    // 自動収集)を区別できるようにするためだけの追加(buildAiConcierge
    // ChatInstructions()参照)。
    authorType:
      typeof shop.authorType === "string"
        ? shop.authorType
        : "",

    // 情報源の信用区分 Phase1｜新しいFirestoreフィールドは作らず、既存の
    // shop.sourceTrust(convertSubmissionToShop()が既にsubmissions.
    // sourceTrustから通してきた値)をそのままcandidateへ渡す。authorTypeとは
    // 別軸。値の厳格な検証はapi/moderate-submission.jsのsanitizeAiConcierge
    // Candidate()側で行う(未知の値はそこで空文字に落ちる)。
    sourceTrust:
      typeof shop.sourceTrust === "string"
        ? shop.sourceTrust
        : ""
  };
}


// AIコンシェルジュ Phase2｜期限切れの除外自体は既存の候補選定ロジック
// (getVisibleShops()等、この関数より前の段階)で完了済み。ここで作るのは
// 「あとどれくらい有効か」という付随ヒントのみで、AI自身に有効/無効の
// 判定をさせるためのものではない(プロンプト側にも明記)。既存の
// getDateValue()をそのまま再利用し、新しい日付解析ロジックは作らない。
function buildAiConciergeValidUntilHint(
  expiresAt
) {
  const expiresAtMillis =
    getDateValue(
      expiresAt
    );

  if (expiresAtMillis === 0) {
    return "";
  }

  const remainingMillis =
    expiresAtMillis -
    Date.now();

  if (remainingMillis <= 0) {
    return "";
  }

  const remainingHours =
    remainingMillis /
    (60 * 60 * 1000);

  if (remainingHours < 24) {
    return (
      "あと約" +
      Math.max(1, Math.round(remainingHours)) +
      "時間"
    );
  }

  return (
    "あと約" +
    Math.round(remainingHours / 24) +
    "日"
  );
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

  // AIコンシェルジュ Phase2｜地域おすすめにはexpiresAt相当のフィールドが
  // 存在しない(既存調査で確認済み)ため、validUntilHintは付与しない
  // (存在しないフィールドを推測で作らない)。content/websiteUrlは
  // Firestoreの実フィールド(admin-region-picks.htmlが保存)であり、
  // showRegionRecommendationsForArea()が取得したarticleに既に含まれている。
  const contentExcerpt =
    typeof article.content === "string"
      ? article.content
          .trim()
          .slice(0, AI_CONCIERGE_CONTENT_EXCERPT_MAX_LENGTH)
      : "";

  const sourceUrl =
    typeof article.websiteUrl === "string"
      ? article.websiteUrl
      : "";

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
    availabilityHint: "",
    contentExcerpt: contentExcerpt,
    sourceUrl: sourceUrl
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
  const suggestionCard =
    document.getElementById("suggestionCard");

  // マチナウAI一本化 Phase1修正｜本カードは廃止済みのため常に非表示にする。
  // 呼び出し元(renderShops()等)がどの経路からこの関数を呼んでも再表示
  // されないよう、関数の先頭でガードする。以下の既存ロジック(ルールベース
  // フォールバック含む)は削除・変更せずそのまま残すが、この時点で
  // returnするため到達しなくなるだけにする。
  if (suggestionCard) {
    suggestionCard.style.display = "none";
  }

  return;

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
      // AIコンシェルジュ Phase2｜GPS→天気→AI判断という複数ステップの
      // 待機中に「マチナウが今どうするか考えている」ことが伝わるよう、
      // 2段階の文言に分ける(大規模なレイアウト変更は行わず、既存の
      // suggestionMessage 1箇所のテキストだけを差し替える)。
      suggestionMessage.textContent =
        getMachinauTranslation(
          aiConciergeState.loadingPhase === "thinking"
            ? "suggestion_ai_loading"
            : "suggestion_ai_checking",
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
  // buildAiConciergeCandidatePool()〜renderAiConciergeFallbackContent()だけを
  // try/catchで保護する。未捕捉のJavaScript例外があった場合でも✨カードを
  // 消さず、内部事情を含まない安全な専用文言(suggestion_fallback_error_message)
  // へ切り替える。catchした例外はconsole.errorへ出力し、障害発生時に原因を
  // 追えるようにする(Secret・Token・座標詳細・個人情報は出さない)。
  try {
    const fallbackCandidates =
      buildAiConciergeCandidatePool();

    if (fallbackCandidates.length === 0) {
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

    const didRenderFallback =
      renderAiConciergeFallbackContent(
        fallbackCandidate,
        currentLanguageForAiConcierge,
        suggestionMessage,
        suggestionDetailButton
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

  // AIコンシェルジュ Phase2｜「また開いて」の実装方式(採用案C)。
  // AIには文言そのものを毎回自由生成させず、AIが返す構造化値
  // shouldReopenLater(boolean)だけを見て、実際の文言はUI側の固定翻訳
  // (suggestion_reopen_later_note)で出し分ける。AI応答にこの値が
  // 無い/不正な場合はfalse相当として扱われる(サーバー側で安全に
  // デフォルト化済み)ため、既存のfallback経路が壊れることはない。
  const reopenNoteText =
    aiSuggestion.shouldReopenLater === true
      ? getMachinauTranslation(
          "suggestion_reopen_later_note",
          getCurrentMachinauLanguage()
        )
      : "";

  suggestionMessage.textContent =
    resolvedCandidate.title +
    "\n" +
    reasonText +
    (
      reopenNoteText !== ""
        ? "\n\n" + reopenNoteText
        : ""
    );

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


// ============================================================
// 会話型マチナウAI Phase1(MVP)
// ============================================================
// 既存の✨単発提案(aiConciergeState/updateTravelerSuggestionCard/
// buildAiConciergeCandidatePool等)には一切手を入れない。候補プールの
// 構築ロジックだけをそのまま再利用し、新しいチャットUI・会話状態を
// 追加するだけにとどめる。

// 最初のAIメッセージは固定UI文言(本部指示)。このためだけにAPIは呼ばない。
const AI_CONCIERGE_CHAT_INITIAL_MESSAGE =
  "今日はどんな予定？";

// サーバー側のAI_CONCIERGE_CHAT_TIMEOUT_MS(20000ms)より長く確保する
// (Web検索を伴うため既存の単発提案より時間がかかる想定)。
const AI_CONCIERGE_CHAT_CLIENT_FETCH_TIMEOUT_MS =
  25000;

// 送信するhistoryの上限(サーバー側AI_CONCIERGE_CHAT_MAX_HISTORY_ITEMSと
// 同じ考え方。直近6往復相当)。無限にmessagesを増やさない。
const AI_CONCIERGE_CHAT_MAX_HISTORY_ITEMS_TO_SEND =
  12;

let aiConciergeChatHistory =
  [
    { role: "assistant", text: AI_CONCIERGE_CHAT_INITIAL_MESSAGE }
  ];

let aiConciergeChatInFlight =
  false;

function renderAiConciergeChatMessages() {
  const messagesContainer =
    document.getElementById(
      "aiConciergeChatMessages"
    );

  if (!messagesContainer) {
    return;
  }

  messagesContainer.innerHTML =
    "";

  aiConciergeChatHistory.forEach(
    function(historyItem) {
      const bubble =
        document.createElement(
          "div"
        );

      bubble.className =
        "ai-concierge-chat-bubble " +
        (
          historyItem.role === "user"
            ? "ai-concierge-chat-bubble-user"
            : "ai-concierge-chat-bubble-assistant"
        );

      bubble.textContent =
        historyItem.text;

      if (
        historyItem.role === "assistant" &&
        typeof historyItem.imageUrl === "string" &&
        historyItem.imageUrl !== ""
      ) {
        const image =
          document.createElement(
            "img"
          );

        image.className =
          "ai-concierge-chat-bubble-image";

        image.src =
          historyItem.imageUrl;

        image.alt =
          "";

        image.loading =
          "lazy";

        bubble.appendChild(
          image
        );
      }

      messagesContainer.appendChild(
        bubble
      );
    }
  );

  messagesContainer.scrollTop =
    messagesContainer.scrollHeight;
}

// AIの返答テキストに、候補プール中の店舗・施設名(shopName優先、無ければ
// title)が実際に含まれているかを調べ、含まれていれば既存のshops配列
// (resolveAiConciergeCandidateRealData()と同じ考え方)から画像を取得する。
// AI自身には画像URLを一切渡さない(トークン節約・存在しないものを
// AIに判断させないため)。一致が無い、または画像が無い場合はnullを返し、
// その場合はテキストだけで正常動作する(本部指示)。
function findAiConciergeChatReferencedImageUrl(
  replyText,
  candidatePool
) {
  if (
    typeof replyText !== "string" ||
    replyText === ""
  ) {
    return null;
  }

  for (
    let candidateIndex = 0;
    candidateIndex < candidatePool.length;
    candidateIndex += 1
  ) {
    const candidate =
      candidatePool[candidateIndex];

    const nameToMatch =
      (
        candidate.shopName ||
        candidate.title ||
        ""
      ).trim();

    if (
      nameToMatch === "" ||
      candidate.id.indexOf("shop:") !== 0
    ) {
      continue;
    }

    if (replyText.indexOf(nameToMatch) === -1) {
      continue;
    }

    const firestoreId =
      candidate.id.slice(
        "shop:".length
      );

    const matchedShop =
      shops.find(
        function(shop) {
          return (
            shop.firestoreId ===
            firestoreId
          );
        }
      );

    if (
      matchedShop &&
      Array.isArray(matchedShop.imageUrls) &&
      matchedShop.imageUrls.length > 0
    ) {
      return matchedShop.imageUrls[0];
    }
  }

  return null;
}

function setAiConciergeChatStatus(
  statusText
) {
  const statusElement =
    document.getElementById(
      "aiConciergeChatStatus"
    );

  if (!statusElement) {
    return;
  }

  if (
    typeof statusText === "string" &&
    statusText !== ""
  ) {
    statusElement.textContent =
      statusText;

    statusElement.style.display =
      "";
  } else {
    statusElement.textContent =
      "";

    statusElement.style.display =
      "none";
  }
}

// 本部方針「1ユーザーメッセージ＝原則1 Responses API call、ページ表示
// だけでは呼ばない」を満たすため、この関数はチャット送信ボタン/フォーム
// 送信からしか呼ばれない(DOMContentLoaded等の自動初期化からは呼ばない)。
async function sendAiConciergeChatMessage(
  userText
) {
  const trimmedUserText =
    typeof userText === "string"
      ? userText.trim()
      : "";

  if (
    trimmedUserText === "" ||
    aiConciergeChatInFlight
  ) {
    return;
  }

  aiConciergeChatInFlight =
    true;

  const sendButton =
    document.getElementById(
      "aiConciergeChatSendButton"
    );

  if (sendButton) {
    sendButton.disabled =
      true;
  }

  aiConciergeChatHistory.push(
    { role: "user", text: trimmedUserText }
  );

  renderAiConciergeChatMessages();

  setAiConciergeChatStatus(
    "調べています…"
  );

  // 既存の候補プール構築(buildAiConciergeCandidatePool())をそのまま
  // 再利用する。街を見るAIの重要情報・今日のマチナウ・イベント/観光・
  // 地域おすすめ・一般店舗投稿が既に同じ枠組みで揃っている。
  const candidatePool =
    buildAiConciergeCandidatePool();

  const historyToSend =
    aiConciergeChatHistory
      .slice(0, aiConciergeChatHistory.length - 1)
      .slice(-AI_CONCIERGE_CHAT_MAX_HISTORY_ITEMS_TO_SEND)
      .map(
        function(historyItem) {
          return {
            role: historyItem.role,
            text: historyItem.text
          };
        }
      );

  const language =
    (
      typeof getCurrentMachinauLanguage === "function" &&
      getCurrentMachinauLanguage() === "en"
    )
      ? "en"
      : "ja";

  const fetchAbortController =
    new AbortController();

  const fetchTimeoutId =
    setTimeout(
      function() {
        fetchAbortController.abort();
      },
      AI_CONCIERGE_CHAT_CLIENT_FETCH_TIMEOUT_MS
    );

  let replyText =
    null;

  try {
    const regionalWeather =
      await fetchRegionalWeatherForAiConcierge();

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
            mode: "aiConciergeChat",
            language: language,
            currentTime: formatCurrentTimeForAiConcierge(),
            context: {
              area:
                typeof userAreaName === "string"
                  ? userAreaName
                  : "",
              weather: {
                temperatureC:
                  latestWeatherForMachinauSuggestion.temperatureC,
                feelsLikeC:
                  latestWeatherForMachinauSuggestion.feelsLikeC,
                // マチナウAI旅行相棒化 Phase1｜既存fetchWeather()が既に
                // 取得済みだが今まで会話AIへ渡していなかった項目
                // (追加のAPI呼び出しは発生しない)。
                heatIndexC:
                  latestWeatherForMachinauSuggestion.heatIndexC,
                gustKph:
                  latestWeatherForMachinauSuggestion.gustKph,
                chanceOfRain:
                  latestWeatherForMachinauSuggestion.chanceOfRain,
                windKph:
                  latestWeatherForMachinauSuggestion.windKph,
                uvIndex:
                  latestWeatherForMachinauSuggestion.uvIndex,
                conditionText:
                  latestWeatherForMachinauSuggestion.conditionText,
                sunset:
                  typeof latestWeatherForMachinauSuggestion.sunset === "string"
                    ? latestWeatherForMachinauSuggestion.sunset
                    : "",
                sunrise:
                  typeof latestWeatherForMachinauSuggestion.sunrise === "string"
                    ? latestWeatherForMachinauSuggestion.sunrise
                    : ""
              },
              nextHours:
                Array.isArray(
                  latestWeatherForMachinauSuggestion.nextHours
                )
                  ? latestWeatherForMachinauSuggestion.nextHours
                  : [],
              // マチナウAI旅行相棒化 Phase1.1｜「今日の夜のnextHoursを
              // 明日の判断に誤用する」事故への根本対応。api/weather.jsが
              // 既に取得済み(追加fetchなし)のforecastday[1]由来データを
              // 日付付きのまま別フィールドとして渡す(nextHoursとは混ぜない)。
              tomorrowHours:
                Array.isArray(
                  latestWeatherForMachinauSuggestion.tomorrowHours
                )
                  ? latestWeatherForMachinauSuggestion.tomorrowHours
                  : [],
              tomorrowSunset:
                typeof latestWeatherForMachinauSuggestion.tomorrowSunset === "string"
                  ? latestWeatherForMachinauSuggestion.tomorrowSunset
                  : "",
              tomorrowSunrise:
                typeof latestWeatherForMachinauSuggestion.tomorrowSunrise === "string"
                  ? latestWeatherForMachinauSuggestion.tomorrowSunrise
                  : "",
              regionalWeather:
                regionalWeather
            },
            candidates: candidatePool,
            history: historyToSend,
            message: trimmedUserText
          })
        }
      );

    const responseData =
      await response.json();

    if (
      response.ok &&
      responseData &&
      responseData.success === true &&
      typeof responseData.reply === "string" &&
      responseData.reply.trim() !== ""
    ) {
      replyText =
        responseData.reply.trim();
    }
  } catch (error) {
    replyText =
      null;
  } finally {
    clearTimeout(
      fetchTimeoutId
    );
  }

  setAiConciergeChatStatus(
    ""
  );

  if (replyText) {
    aiConciergeChatHistory.push(
      {
        role: "assistant",
        text: replyText,
        imageUrl:
          findAiConciergeChatReferencedImageUrl(
            replyText,
            candidatePool
          )
      }
    );
  } else {
    // 本部方針｜OpenAI失敗・Web検索失敗・レスポンス異常等でも、既存TOP・
    // 既存✨(aiConciergeState)には一切触れない。チャット欄だけに簡潔な
    // 再試行案内を表示する。
    aiConciergeChatHistory.push(
      {
        role: "assistant",
        text: "ごめんね、うまく答えられなかったみたい。もう一度送ってみて。"
      }
    );
  }

  renderAiConciergeChatMessages();

  aiConciergeChatInFlight =
    false;

  if (sendButton) {
    sendButton.disabled =
      false;
  }
}

// マチナウAI一本化 Phase1｜第一声はOpenAI/Terraを一切呼ばず、既に取得済みの
// userAreaName・latestWeatherForMachinauSuggestion(いずれも既存のGPS/天気
// 取得処理がそのまま持っている値、追加のAPI呼び出しは発生しない)だけを
// 使ってテンプレートから組み立てる。天気の晴雨判定は既存の
// resolveSuggestionWeatherCategory()をそのまま再利用し、新しい判定ロジック
// は作らない。ユーザーが既に1件でも発言している場合(aiConciergeChatHistory
// の先頭がassistant・件数1件、という初期状態でなくなっている場合)は、
// 進行中の会話を壊さないよう上書きしない。
function updateAiConciergeChatInitialMessage() {
  if (
    !Array.isArray(aiConciergeChatHistory) ||
    aiConciergeChatHistory.length !== 1 ||
    aiConciergeChatHistory[0].role !== "assistant"
  ) {
    return;
  }

  const language =
    getCurrentMachinauLanguage();

  const areaName =
    typeof userAreaName === "string" && userAreaName !== ""
      ? userAreaName
      : "";

  let translationKey;

  if (
    areaName !== "" &&
    latestWeatherForMachinauSuggestion !== null
  ) {
    const weatherCategory =
      resolveSuggestionWeatherCategory(
        latestWeatherForMachinauSuggestion
      );

    translationKey =
      weatherCategory === "RAIN"
        ? "ai_concierge_initial_rain"
        : "ai_concierge_initial_clear";
  } else if (areaName !== "") {
    translationKey =
      "ai_concierge_initial_area_only";
  } else {
    translationKey =
      "ai_concierge_initial_fallback";
  }

  const messageText =
    getMachinauTranslation(
      translationKey,
      language
    ).replace(
      "{AREA}",
      areaName
    );

  aiConciergeChatHistory[0] =
    { role: "assistant", text: messageText };

  renderAiConciergeChatMessages();
}

function initializeAiConciergeChat() {
  const chatForm =
    document.getElementById(
      "aiConciergeChatForm"
    );

  const chatInput =
    document.getElementById(
      "aiConciergeChatInput"
    );

  if (
    !chatForm ||
    !chatInput
  ) {
    return;
  }

  renderAiConciergeChatMessages();

  // マチナウAI一本化 Phase1｜第一声をOpenAIなしでできる範囲まで具体化する。
  // この時点でuserAreaName/latestWeatherForMachinauSuggestionが未確定
  // (GPS前)でも、updateAiConciergeChatInitialMessage()自身が
  // ai_concierge_initial_fallbackへ安全にフォールバックする。
  updateAiConciergeChatInitialMessage();

  chatForm.addEventListener(
    "submit",
    function(submitEvent) {
      submitEvent.preventDefault();

      const messageToSend =
        chatInput.value;

      chatInput.value =
        "";

      sendAiConciergeChatMessage(
        messageToSend
      );
    }
  );

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

  if (candidates.length === 0) {
    // Ver1.8 Phase1(設計修正)｜候補が1件も無い場合はAI APIを呼ばず、
    // かつGPS取得前のプレースホルダーへも戻さない。専用の
    // status="empty"を使い、updateTravelerSuggestionCard()側で
    // ✨カードを維持したまま専用文言を表示する。
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
      loadingPhase: "checking",
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

  // AIコンシェルジュ Phase2｜キャッシュに無かった場合(=実際にAIを呼ぶ場合)
  // だけ、本島北中南の地域天気を取得する。キャッシュ命中時はこの取得
  // 自体を行わないため、無駄なAPIコールは発生しない。1地点でも失敗して
  // 良い(fetchRegionalWeatherForAiConcierge()自身が段階的に劣化する)。
  const regionalWeather =
    await fetchRegionalWeatherForAiConcierge();

  if (
    gpsSessionId !==
    machinauSuggestionGpsSessionId
  ) {
    return;
  }

  aiConciergeState =
    {
      gpsSessionId: gpsSessionId,
      status: "loading",
      loadingPhase: "thinking",
      suggestionsByLanguage: {}
    };

  updateTravelerSuggestionCard();

  let responseSuggestion =
    null;

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
              },
              // AIコンシェルジュ Phase2｜api/weather.jsが既存の1回の
              // forecast.json呼び出しから抽出済みの当日時間別予報を
              // そのまま中継する(追加のAPIコールはしていない)。
              nextHours:
                Array.isArray(
                  latestWeatherForMachinauSuggestion.nextHours
                )
                  ? latestWeatherForMachinauSuggestion.nextHours
                  : [],
              // AIコンシェルジュ Phase2｜本島北中南の代表地点(固定座標、
              // 全利用者で/api/weather.jsの共有キャッシュを再利用)。
              regionalWeather:
                regionalWeather
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
  if (gpsSessionId !== machinauSuggestionGpsSessionId) {
    return;
  }

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

  // マチナウAI一本化 Phase1｜✨「今どうする？」(旧attemptAiConciergeSuggestion()
  // 経由のgpt-4o-mini自動呼び出し)は「🤖マチナウAI」(aiConciergeChat)へ
  // 一本化したため停止する。#suggestionCard自体もdisplay:noneのため
  // この呼び出し結果を表示する場所が無い。attemptAiConciergeSuggestion()・
  // buildAiConciergeCandidatePool()等の関数本体は削除しない(本部指示：
  // 安全優先、大規模削除・整理はしない)。
  // attemptAiConciergeSuggestion(gpsSessionId);

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

// 「この街の情報」Phase1｜regionProfiles/regionRecommendations/
// regionEditorialのいずれにも依存しない独立機能。GPSでuserAreaNameが
// 確定した時点ではボタンを表示するだけ(showCityInfoSection())で、AIは
// 一切呼ばない(本部指示)。実際に/api/moderate-submission
// (mode:"cityInfoGet")を呼ぶのはボタン押下時(handleCityInfoButtonClick())
// のみ。認証はaiConciergeChatと同じgetAnonymousIdTokenForLocationCollection()
// をそのまま再利用する(新しい認証方式を作らない)。
let cityInfoCurrentAreaName =
  null;

function showCityInfoSection(
  areaName
) {
  const cityInfoSection =
    document.getElementById("cityInfoSection");

  if (!cityInfoSection) {
    return;
  }

  cityInfoCurrentAreaName =
    areaName;

  cityInfoSection.style.display =
    "";

  const cityInfoStatus =
    document.getElementById("cityInfoStatus");

  const cityInfoResult =
    document.getElementById("cityInfoResult");

  const cityInfoButton =
    document.getElementById("cityInfoButton");

  if (cityInfoStatus) {
    cityInfoStatus.textContent =
      "";
  }

  if (cityInfoResult) {
    cityInfoResult.style.display =
      "none";
  }

  if (cityInfoButton) {
    cityInfoButton.disabled =
      false;
  }
}

async function handleCityInfoButtonClick() {
  if (!cityInfoCurrentAreaName) {
    return;
  }

  const cityInfoButton =
    document.getElementById("cityInfoButton");

  const cityInfoStatus =
    document.getElementById("cityInfoStatus");

  const cityInfoResult =
    document.getElementById("cityInfoResult");

  const cityInfoTitle =
    document.getElementById("cityInfoTitle");

  const cityInfoContent =
    document.getElementById("cityInfoContent");

  if (
    !cityInfoButton ||
    !cityInfoStatus ||
    !cityInfoResult ||
    !cityInfoTitle ||
    !cityInfoContent
  ) {
    return;
  }

  cityInfoButton.disabled =
    true;

  cityInfoResult.style.display =
    "none";

  cityInfoStatus.textContent =
    getMachinauTranslation(
      "city_info_status_loading",
      getCurrentMachinauLanguage()
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

          body: JSON.stringify({
            mode: "cityInfoGet",
            targetArea: cityInfoCurrentAreaName,

            // 多言語化 Phase C｜独自の言語状態は作らず、既存の
            // getCurrentMachinauLanguage()をそのまま使う(本部指示)。
            language:
              getCurrentMachinauLanguage()
          })
        }
      );

    let responseData =
      null;

    try {
      responseData =
        await response.json();
    } catch (jsonError) {
      throw new Error("応答を読み取れませんでした。");
    }

    if (
      !response.ok ||
      !responseData ||
      responseData.success !== true
    ) {
      throw new Error(
        (responseData && responseData.message) ||
          "この街の情報を取得できませんでした。"
      );
    }

    cityInfoStatus.textContent =
      "";

    cityInfoTitle.textContent =
      responseData.title || "";

    cityInfoContent.textContent =
      responseData.content || "";

    cityInfoResult.style.display =
      "";
  } catch (error) {
    console.error(
      "この街の情報の取得に失敗しました",
      error
    );

    cityInfoStatus.textContent =
      getMachinauTranslation(
        "city_info_status_error",
        getCurrentMachinauLanguage()
      );
  } finally {
    cityInfoButton.disabled =
      false;
  }
}

// 多言語化 Phase C｜言語切替のたびに新しい生成は発生させない。既に
// 「この街の情報」を表示済み(cityInfoResultが表示中)の場合だけ、
// handleCityInfoButtonClick()をそのまま再利用して現在言語で再取得する
// (取得先は既存のcityInfoGetそのもの、新しい取得経路は作らない)。
// サーバー側が既にその言語の翻訳キャッシュを持っていれば、OpenAI翻訳APIは
// 呼ばれずFirestoreの保存済み結果がそのまま返る(本部指示：言語切替の
// たびにAI翻訳APIを呼ばない)。まだ一度も「この街の情報」ボタンを押して
// いない場合は何もしない(cityInfoResultセクション自体がまだ表示されて
// いないため、Phase Aのregion TodayInfoと同じ考え方)。
// この街の情報はモーダルではなく常時DOM上に存在するセクションのため、
// handleCityInfoButtonClick()が成功時にcityInfoTitle/cityInfoContentへ
// 直接書き込むだけで画面へ自動反映される(Phase Bの店舗詳細モーダルで
// 判明した「非同期完了後にUIが自動更新されない」問題は、ここでは構造上
// 発生しない)。
function refreshCityInfoForCurrentLanguage() {
  const cityInfoResult =
    document.getElementById("cityInfoResult");

  if (
    !cityInfoResult ||
    cityInfoResult.style.display === "none"
  ) {
    return;
  }

  handleCityInfoButtonClick();
}

const cityInfoButtonElement =
  document.getElementById("cityInfoButton");

if (cityInfoButtonElement) {
  cityInfoButtonElement.addEventListener(
    "click",
    handleCityInfoButtonClick
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

  // 現在地ファーストUX STEP2｜取得前/取得後で見出しを切り替えるための
  // 参照。既存の必須要素チェック(直後のif)には加えない(見出し要素が
  // 万一無くても、既存のGPS取得処理自体は今まで通り動くようにするため)。
  const locationHeading =
    document.getElementById(
      "locationHeading"
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

        // 現在地ファーストUX STEP2｜取得成功と同時に見出しも「取得後」
        // 状態へ切り替える(location_message自体はこの後もsorting→success
        // の遷移を続けるため、ここでは変更しない)。
        if (locationHeading) {
          locationHeading.textContent =
            getMachinauTranslation(
              "location_heading_after",
              getCurrentMachinauLanguage()
            );
        }

        showCurrentLocationMarker(
          userLatitude,
          userLongitude
        );

        // 画像UX改善Phase2｜GPS確定直後にshopsListを距離順で即時全面再描画
        // すると、直前まで見えていた写真が別店舗の写真へ入れ替わったように
        // 見える(距離未確定→確定で並びが変わること自体は正しい挙動)。
        // 「並び替え中」であることを明示する短い遷移を挟むことで、
        // 「原因不明で写真が変わった」という体験を「現在地に合わせて
        // 更新された」という体験に変える。距離順ロジック・再描画方式
        // 自体は変更しない(最も安全で小さい実装、という指示に基づく採用。
        // 完了報告のOption A参照)。
        locationMessage.textContent =
          getMachinauTranslation(
            "location_message_sorting",
            getCurrentMachinauLanguage()
          );

        window.setTimeout(
          function() {
            renderShops();

            locationMessage.textContent =
              getMachinauTranslation(
                "location_message_success",
                getCurrentMachinauLanguage()
              );
          },
          450
        );

        machinauSuggestionGpsSessionId += 1;

        const suggestionGpsSessionId =
          machinauSuggestionGpsSessionId;

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

            if (
              suggestionGpsSessionId ===
              machinauSuggestionGpsSessionId
            ) {
              latestWeatherForMachinauSuggestion =
                weather;

              tryGenerateMachinauSuggestion(
                suggestionGpsSessionId
              );

              // マチナウAI一本化 Phase1｜天気が確定した時点でも、
              // OpenAIを呼ばずに第一声を更新する(area未確定ならarea無しの
              // 文言のまま、area確定済みなら天気を反映した文言へ)。
              updateAiConciergeChatInitialMessage();
            }
          })
          .catch(function(error) {
            // 天候取得の失敗はrenderShops()等の既存フローに影響させない
          });

        // Ver1.8 Phase2(地域連動基盤)｜resolveAreaNameFromCoordinates()
        // (直下)とは別の独立したGeocoder呼び出し。マチナウ読み物の
        // 地域マッチングだけに使い、userAreaName等の既存状態には一切書き込まない。
        // 失敗してもTOPの他機能に影響しない(loadDynamicColumnEntries()自身が
        // 例外を握りつぶす設計のため、ここでもcatchのみ)。
        resolveLocationHierarchyFromCoordinates(
          userLatitude,
          userLongitude
        )
          .then(
            function(locationHierarchy) {
              loadDynamicColumnEntries(
                locationHierarchy
              );

              // 広域region×localDate共有AI地域情報 Phase1｜同じGeocoder
              // 結果をそのまま再利用するだけで、新しいGeocoding呼び出しは
              // 増やさない。失敗してもTOPの他機能には一切影響させない
              // (triggerRegionTodayInfo自身が例外を握りつぶす設計)。
              triggerRegionTodayInfo(
                userLatitude,
                userLongitude,
                locationHierarchy,
                suggestionGpsSessionId
              );

              // 街の掲示板 Phase3｜同じGeocoder結果(locationHierarchy)を
              // そのまま再利用するだけで、新しいGeocoding呼び出しは増やさない。
              // municipalityPlaceIdが取得できなかった場合(古いブラウザ・
              // Geocoder失敗等)はloadCommunityBoardForCurrentArea()内で
              // 何もせず終わる(既存のisPermanentAd等、他の描画処理に
              // 影響させない)。
              loadCommunityBoardForCurrentArea(
                locationHierarchy.municipalityPlaceId,
                locationHierarchy.countryCode,
                locationHierarchy.municipality
              );
            }
          )
          .catch(
            function(error) {
              // 読み物の地域連動表示に失敗しても、TOPの他機能には影響させない
            }
          );

        resolveAreaNameFromCoordinates(
          userLatitude,
          userLongitude
        )
          .then(function(areaName) {
            if (areaName) {
              userAreaName = areaName;

              renderShops();

              // 初心回帰後の新トップ体験 Phase1｜現在地取得・更新の
              // タイミングでのみ「気づきの一言」を再判定する(移動だけでの
              // 自動更新はしない、60秒タイマー等のrenderShops()呼び出しでは
              // 再描画しない)。新しいFirestore読み取り・API呼び出しは
              // 発生しない(既にロード済みのshops配列から組み立てるのみ)。
              renderAwarenessNotices();

              // 初心回帰後の新トップ体験 Phase1｜街情報ボタンも同じ
              // タイミングでのみ再判定する(新しいFirestore読み取り・
              // API呼び出しは発生しない、既にロード済みのshops配列から
              // 組み立てるのみ)。
              renderAreaInfoButtons();

              // トップ画面整理｜旧「近くの『今』」「気になることを聞く」の
              // 統合案内枠も同じタイミングでのみ表示判定する(新しい
              // Firestore読み取り・API呼び出しは発生しない)。
              renderCityNowGuidance();

              // SNS街巡回(socialPatrol) Phase1｜新しい地域が確定した
              // 時点で、前の地域のSNS巡回結果をいったんクリアしてから
              // (古い地域の話題を新しい地域の下に出し続けない)、新しい
              // 地域について非同期でSNS街巡回を開始する。結果は
              // triggerSocialPatrolForArea()内でgpsSessionIdを確認した
              // 上で反映される。
              currentSocialPatrolFindings =
                [];

              currentSocialPatrolChecked =
                false;

              if (SOCIAL_PATROL_TRAVELER_DISPLAY_ENABLED) {
                triggerSocialPatrolForArea(
                  areaName,
                  suggestionGpsSessionId
                );
              }

              triggerLocationBasedCollection(
                areaName
              );

              // 街の掲示板 Phase3｜現在地の主表示をregionRecommendations
              // からcommunityBoardPostsへ切り替えるため、GPS確定時の自動呼び出しを
              // ここでは停止する。loadRegionRecommendations()/
              // showRegionRecommendationsForArea()自体・regionRecommendations
              // コレクション・翻訳キャッシュ・admin-region-picks.html等の
              // 管理機能は一切削除せず残す(「ほかの地域を見る」「現在地の
              // おすすめに戻る」からは引き続き呼ばれる、本部指示)。現在地の
              // 掲示板表示はresolveLocationHierarchyFromCoordinates()の
              // .then()内、loadCommunityBoardForCurrentArea()で行う。
              // loadRegionRecommendations(areaName);

              // 「この街の情報」Phase1｜ここではボタンを表示するだけで、
              // AIは一切呼ばない(本部指示：GPS取得時にはAIを呼ばない)。
              // 実際の生成・取得はshowCityInfoSection()内ではなく、
              // ボタン押下時のhandleCityInfoButtonClick()でのみ行う。
              showCityInfoSection(
                areaName
              );

              // マチナウAI一本化 Phase1｜地域名が確定した時点でも、
              // OpenAIを呼ばずに第一声を更新する(天気未確定なら
              // 「地域名だけ」の文言、天気確定済みなら天気を反映した文言)。
              updateAiConciergeChatInitialMessage();
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

        // 常設店舗広告(isPermanentAd:true)はexpiresAtを保存しないため、
        // expiryTimeが常に0になる。expiryTime > currentTimeだけで判定すると
        // 常設広告が無条件で除外されてしまう(api/moderate-submission.jsは
        // isPermanentAd==trueを別クエリで正しく取得しているにも関わらず)ため、
        // isPermanentAdの場合はexpiresAtの有無に関わらず掲載対象とする。
        const isPermanentAd =
          submissionData.isPermanentAd === true;

        const isStillPublished =
          isPermanentAd ||
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

        // 常設広告はexpiryTimeが実際の期限ではない(常に0)ため、次回の
        // 期限再確認タイマー(nearestExpiryTime)の算出対象からは除外する。
        // 含めてしまうとnearestExpiryTimeが0に固定され、再取得タイマーが
        // 1秒間隔で回り続けてしまう。
        if (
          !isPermanentAd &&
          (nearestExpiryTime === null ||
            expiryTime < nearestExpiryTime)
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

    loadDynamicColumnEntries();

    initializeAiConciergeChat();

    initializeAwarenessNoticesInteractions();

    initializeAreaInfoInteractions();

    initializeRegionTodayInfoInteractions();
  }
);


// マチナウ読み物投稿機能(Phase1)｜既存の静的カード(typhoon-okinawa-travel、
// index.html内に直接記述、無変更)に追加して、admin-column.html経由で
// Firestoreへ公開されたマチナウ読み物のカードを動的に追加する。取得に
// 失敗しても既存の静的カードの表示には一切影響させない(catchのみ)。
// 新しい読み物を追加するたびにindex.htmlを編集する必要をなくすための対応。
// Ver1.8 Phase2(地域連動基盤)｜TOPの表示総数(既存の静的カード1件＋動的
// カード)を3件程度に抑える指示のため、動的カードはこの件数までに切り詰める。
const TOP_DYNAMIC_COLUMN_ENTRY_MAX_COUNT =
  2;

// 多言語化 最終Phase(マチナウ読み物)｜loadDynamicColumnEntries()が
// 最後に取得した生データ(日本語原文)を覚えておく。言語切替のたびに
// Firestore再取得しない(renderDynamicColumnEntries()が既存データを
// 現在言語で再描画するだけにするため)。
let lastLoadedDynamicColumnArticles =
  [];

// 多言語化 最終Phase｜columnArticles由来のsummary(title+description)
// 翻訳キャッシュ。{ [slug]: { [language]: {title, description} } }の形。
let columnArticleSummaryTranslationsCache =
  {};

// TOPカード・記事詳細ページの言語伝達方式(本部指示)：現在言語がSource
// 言語(ja)ならクエリパラメータ無し、それ以外は?lang={language}を付ける。
// REGION_TODAY_INFO_SUPPORTED_LANGUAGESと同じ言語コードをそのまま使う
// (en専用のif分岐を増やさない、サーバー側buildColumnArticleUrlForLanguage()
// と同じ考え方)。
function buildColumnArticleUrlForLanguage(
  slug,
  language
) {
  const basePath =
    "column/" +
    encodeURIComponent(
      slug
    ) +
    ".html";

  if (language === MACHINAU_DEFAULT_LANGUAGE) {
    return basePath;
  }

  return (
    basePath +
    "?lang=" +
    encodeURIComponent(
      language
    )
  );
}

// viewerLocation(country/prefecture/city、いずれも省略可)を渡すと、
// resolveLocationHierarchyFromCoordinates()(このファイル内、既存の
// userAreaName等とは独立)で取得した現在地に関連する読み物を優先表示する。
// 省略時(GPS未取得時等)は単純な新着順にフォールバックする
// (現在地が取得できない場合でも壊れないように)。
async function loadDynamicColumnEntries(
  viewerLocation
) {
  const columnEntryCardList =
    document.getElementById(
      "columnEntryCardList"
    );

  if (!columnEntryCardList) {
    return;
  }

  try {
    const searchParams =
      new URLSearchParams(
        {
          mode: "publicListPublishedColumns"
        }
      );

    if (
      viewerLocation &&
      viewerLocation.country
    ) {
      searchParams.set(
        "viewerCountry",
        viewerLocation.country
      );
    }

    if (
      viewerLocation &&
      viewerLocation.prefecture
    ) {
      searchParams.set(
        "viewerPrefecture",
        viewerLocation.prefecture
      );
    }

    if (
      viewerLocation &&
      viewerLocation.city
    ) {
      searchParams.set(
        "viewerCity",
        viewerLocation.city
      );
    }

    const response =
      await fetch(
        "/api/moderate-submission?" +
          searchParams.toString()
      );

    const responseData =
      await response.json();

    if (
      !response.ok ||
      !responseData ||
      responseData.success !== true ||
      !Array.isArray(
        responseData.articles
      )
    ) {
      return;
    }

    lastLoadedDynamicColumnArticles =
      responseData.articles;

    renderDynamicColumnEntries();
  } catch (error) {
    console.error(
      "マチナウ読み物の動的一覧取得に失敗しました(既存の表示には影響しません)：",
      error
    );
  }
}

// 多言語化 最終Phase｜lastLoadedDynamicColumnArticles(取得済みの日本語
// 原文配列)から、現在言語に応じてカードを再描画する。新しいFirestore
// 取得は行わない(loadDynamicColumnEntries()が既に取得済みのデータを
// 使うだけ)。言語切替時にswitchMachinauLanguage()から直接呼ばれる。
function renderDynamicColumnEntries() {
  const columnEntryCardList =
    document.getElementById(
      "columnEntryCardList"
    );

  if (!columnEntryCardList) {
    return;
  }

  // 呼び出しのたびに動的カードだけを作り直す(GPS取得前のfallback表示を
  // GPS成功後の現在地優先表示へ置き換える、または言語切替時の再描画に
  // 対応するため)。既存の静的カード(typhoon-okinawa-travel、
  // data-column-entry-dynamic属性を持たない)は一切削除しない。
  columnEntryCardList
    .querySelectorAll(
      "[data-column-entry-dynamic]"
    )
    .forEach(
      function(existingCard) {
        existingCard.remove();
      }
    );

  const currentLanguage =
    getCurrentMachinauLanguage();

  const visibleSlugs =
    [];

  lastLoadedDynamicColumnArticles
    .slice(
      0,
      TOP_DYNAMIC_COLUMN_ENTRY_MAX_COUNT
    )
    .forEach(
      function(article) {
        const slug =
          typeof article.slug === "string"
            ? article.slug
            : "";

        if (slug === "") {
          return;
        }

        visibleSlugs.push(
          slug
        );

        // 多言語化 最終Phase｜翻訳キャッシュ(columnArticleSummaryTranslations
        // Cache)があればそれを表示し、無ければ原文(日本語)のまま表示する。
        // 翻訳の取得はrefreshColumnEntryTranslationsIfNeeded()が別途行う。
        const cachedTranslationsForArticle =
          columnArticleSummaryTranslationsCache[slug];

        const cachedTranslation =
          cachedTranslationsForArticle &&
          cachedTranslationsForArticle[currentLanguage];

        const displayTitle =
          currentLanguage !== MACHINAU_DEFAULT_LANGUAGE &&
          cachedTranslation &&
          typeof cachedTranslation.title === "string" &&
          cachedTranslation.title !== ""
            ? cachedTranslation.title
            : article.title;

        const displayDescription =
          currentLanguage !== MACHINAU_DEFAULT_LANGUAGE &&
          cachedTranslation &&
          typeof cachedTranslation.description === "string" &&
          cachedTranslation.description !== ""
            ? cachedTranslation.description
            : article.description;

        const cardElement =
          document.createElement(
            "div"
          );

        cardElement.className =
          "region-recommendation-card";

        cardElement.setAttribute(
          "data-column-entry-dynamic",
          "true"
        );

        cardElement.innerHTML = `
          <div class="region-recommendation-card-body">
            <p class="region-recommendation-card-title">
              ${escapeHtml(
                displayTitle
              )}
            </p>
            <p class="region-recommendation-card-content">
              ${escapeHtml(
                displayDescription
              )}
            </p>
            <a
              class="region-recommendation-card-link"
              href="${escapeHtml(
                buildColumnArticleUrlForLanguage(
                  slug,
                  currentLanguage
                )
              )}"
              onclick="if (typeof gtag === 'function' && (location.hostname === 'machinau.jp' || location.hostname === 'imamiru-web.vercel.app')) { gtag('event', 'column_entry_click', { article_slug: '${slug}' }); }"
            >${escapeHtml(
              getMachinauTranslation(
                "column_entry_read_more_link",
                currentLanguage
              )
            )}</a>
          </div>
        `;

        columnEntryCardList.appendChild(
          cardElement
        );
      }
    );

  // 多言語化 最終Phase｜日本語以外が選択されている場合だけ、今回描画した
  // カードのうち未翻訳のものをまとめて取得する(既に翻訳済み・取得中の
  // ものは内部でスキップされ、重複実行しない)。
  refreshColumnEntryTranslationsIfNeeded(
    visibleSlugs
  );
}

// 多言語化 最終Phase｜表示中の読み物カードの未翻訳summaryだけをまとめて
// 取得する(Phase B/Dと同じ「表示分だけbatch」方式)。
let columnEntrySummaryTranslationFetchInFlightKey =
  null;

function refreshColumnEntryTranslationsIfNeeded(
  visibleSlugs
) {
  const language =
    getCurrentMachinauLanguage();

  if (language === MACHINAU_DEFAULT_LANGUAGE) {
    return;
  }

  const slugsNeedingTranslation =
    visibleSlugs.filter(
      function(slug) {
        const cachedTranslationsForArticle =
          columnArticleSummaryTranslationsCache[slug];

        return !(
          cachedTranslationsForArticle &&
          cachedTranslationsForArticle[language]
        );
      }
    );

  if (slugsNeedingTranslation.length === 0) {
    return;
  }

  const fetchKey =
    language +
    ":" +
    slugsNeedingTranslation
      .slice()
      .sort()
      .join(",");

  if (
    columnEntrySummaryTranslationFetchInFlightKey ===
    fetchKey
  ) {
    return;
  }

  columnEntrySummaryTranslationFetchInFlightKey =
    fetchKey;

  fetchColumnArticleSummaryTranslations(
    slugsNeedingTranslation,
    language
  )
    .then(
      function(translationsBySlug) {
        columnEntrySummaryTranslationFetchInFlightKey =
          null;

        if (!translationsBySlug) {
          return;
        }

        let didUpdateAnyArticle =
          false;

        Object.keys(
          translationsBySlug
        ).forEach(
          function(slug) {
            const translation =
              translationsBySlug[slug];

            if (
              !translation ||
              typeof translation.title !== "string" ||
              typeof translation.description !== "string"
            ) {
              return;
            }

            if (!columnArticleSummaryTranslationsCache[slug]) {
              columnArticleSummaryTranslationsCache[slug] =
                {};
            }

            columnArticleSummaryTranslationsCache[slug][language] =
              translation;

            didUpdateAnyArticle =
              true;
          }
        );

        if (didUpdateAnyArticle) {
          // Phase B/Dの店舗カード・地域のおすすめと同じ考え方：再描画時に
          // renderDynamicColumnEntries()が末尾で再度この関数を呼ぶが、
          // 取得済みの記事は既にキャッシュを持つため対象から外れ、
          // 無限ループにはならない。
          renderDynamicColumnEntries();
        }
      }
    )
    .catch(
      function(error) {
        columnEntrySummaryTranslationFetchInFlightKey =
          null;
      }
    );
}

async function fetchColumnArticleSummaryTranslations(
  slugs,
  language
) {
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

        body: JSON.stringify({
          mode: "columnArticleTranslationGet",
          firestoreIds: slugs,
          language: language
        })
      }
    );

  let responseData =
    null;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    return null;
  }

  if (
    !response.ok ||
    !responseData ||
    responseData.success !== true ||
    !responseData.translations ||
    typeof responseData.translations !== "object"
  ) {
    return null;
  }

  return responseData.translations;
}

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

// 多言語化 Phase D｜直近にrenderRegionRecommendationCards()が実際に
// 描画した記事の一覧(regionRecommendations由来・submissions由来の両方を
// 含む)。表示されていない記事まで一気に翻訳しないため。
let lastRenderedRegionRecommendationArticles =
  [];

// 多言語化 Phase D｜regionRecommendations由来の記事のtitle/content翻訳
// キャッシュ。{ [articleId]: { [language]: {title, content} } }の形。
// submissions由来のtitle/contentはこことは別に、Phase Bと共有する
// shop.translatedTitles/translatedMessagesの方を使う(同じ原文を二重に
// キャッシュしない)。
let regionRecommendationTranslationsCache =
  {};


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
          src="${escapeHtml(
            buildOptimizedImageUrl(
              firstImageUrl,
              { width: OPTIMIZED_IMAGE_WIDTH_REGION_RECOMMENDATION }
            )
          )}"
          alt="${escapeHtml(article.title || "")}"
          loading="lazy"
          onerror="handleBrokenImage(this)"
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

  // 多言語化 Phase D｜翻訳の取得対象を「今回実際に描画する記事だけ」に
  // 絞り込むため、直近の描画対象idを覚えておく(Phase Bのshop-card
  // 一覧と同じ考え方)。
  lastRenderedRegionRecommendationArticles =
    visibleArticles;

  const currentLanguage =
    getCurrentMachinauLanguage();

  regionRecommendationList.innerHTML =
    visibleArticles
      .map(
        function(article) {
          return buildRegionRecommendationCardHtml(
            resolveRegionRecommendationDisplayArticle(
              article,
              currentLanguage
            )
          );
        }
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

  // 多言語化 Phase D｜日本語以外が選択されている場合だけ、今回描画した
  // 記事のうち未翻訳のものをまとめて取得する(既に翻訳済み・取得中のものは
  // 内部でスキップされ、重複実行しない)。
  refreshRegionRecommendationTranslationsIfNeeded();
}

// 多言語化 Phase D｜言語がja以外のとき、article(regionRecommendations
// 由来またはsubmissions由来)を、翻訳が既にキャッシュ済みならその内容へ、
// 無ければ原文のまま差し替えたコピーを返す。元のregionRecommendationArticles
// 配列・shops配列そのものは書き換えない(常に新しいオブジェクトを返す)。
function resolveRegionRecommendationDisplayArticle(
  article,
  language
) {
  if (language === MACHINAU_DEFAULT_LANGUAGE) {
    return article;
  }

  if (article.sourceCollection === "regionRecommendations") {
    const cachedTranslationsForArticle =
      regionRecommendationTranslationsCache[article.id];

    const cachedTranslation =
      cachedTranslationsForArticle &&
      cachedTranslationsForArticle[language];

    if (
      cachedTranslation &&
      typeof cachedTranslation.title === "string" &&
      typeof cachedTranslation.content === "string"
    ) {
      return Object.assign(
        {},
        article,
        {
          title: cachedTranslation.title,
          content: cachedTranslation.content
        }
      );
    }

    return article;
  }

  if (article.sourceCollection === "submissions") {
    const shop =
      shops.find(
        function(candidateShop) {
          return (
            candidateShop.firestoreId ===
            article.id
          );
        }
      );

    if (!shop) {
      return article;
    }

    const translatedTitle =
      shop.translatedTitles &&
      typeof shop.translatedTitles[language] === "string" &&
      shop.translatedTitles[language] !== ""
        ? shop.translatedTitles[language]
        : article.title;

    // 多言語化 Phase D｜このcontentはshop.messageと同一原文のため、
    // Phase Bが既に持っているtranslatedMessagesキャッシュをそのまま
    // 読むだけで、新しい翻訳キャッシュは作らない(本部指示：同じ原文を
    // 別機能でもう一度AI翻訳しない)。
    const translatedContent =
      shop.translatedMessages &&
      typeof shop.translatedMessages[language] === "string" &&
      shop.translatedMessages[language] !== ""
        ? shop.translatedMessages[language]
        : article.content;

    return Object.assign(
      {},
      article,
      {
        title: translatedTitle,
        content: translatedContent
      }
    );
  }

  return article;
}


// 街の掲示板(仮称) Phase3｜既存regionRecommendations(showRegionRecommendations
// ForArea()、この直後の関数)は削除・変更せず、その関数はそのまま残す
// (「ほかの地域を見る」「現在地のおすすめに戻る」からは引き続き呼ばれる、
// 本部指示)。現在地(GPS)から得られた市区町村を旅行者へ表示する主表示だけを、
// この新しい関数群でcommunityBoardPostsベースへ切り替える。
// regionRecommendationSection/regionRecommendationHeading/
// regionRecommendationListという既存のDOM/CSSクラスをそのまま再利用し、
// 新しいデザイン体系は作らない。

// 「現在地のおすすめに戻る」ボタンから、現在地の掲示板を再取得できるよう
// 直近に解決したgooglePlaceId/countryCode/表示名を保持しておく。
let currentCommunityBoardGooglePlaceId =
  "";

let currentCommunityBoardCountryCode =
  "";

let currentCommunityBoardRegionName =
  "";

function escapeHtmlForCommunityBoard(
  text
) {
  return escapeHtml(
    typeof text === "string"
      ? text
      : ""
  );
}

function buildCommunityBoardPostItemHtml(
  post
) {
  return (
    '<div class="community-board-post-item">' +
      '<p class="community-board-post-text">' +
      escapeHtmlForCommunityBoard(
        post.text
      ) +
      '</p>' +
    '</div>'
  );
}

// communityBoardPostCreate/community-board-post.htmlと同じ、既存の匿名
// Firebase Authentication単発ヘルパーをそのまま再利用する(新しい認証方式は
// 作らない)。
// 街の掲示板 Phase5｜戻り値を{posts, imageUrl}へ拡張する(地域代表画像)。
// imageUrlは投稿とは別の「地域」単位の情報のため、posts配列の要素には
// 含めない(サーバー側communityBoardPostsListの設計とも一致)。
async function fetchCommunityBoardPostsForCurrentArea(
  googlePlaceId,
  countryCode
) {
  const emptyResult =
    {
      posts: [],
      imageUrl: ""
    };

  if (
    !window.firebase ||
    !firebase.auth ||
    googlePlaceId === "" ||
    countryCode === ""
  ) {
    return emptyResult;
  }

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

          body: JSON.stringify(
            {
              mode: "communityBoardPostsList",
              googlePlaceId: googlePlaceId,
              countryCode: countryCode
            }
          )
        }
      );

    const responseData =
      await response.json();

    if (
      !response.ok ||
      !responseData ||
      responseData.success !== true ||
      !Array.isArray(responseData.posts)
    ) {
      return emptyResult;
    }

    return {
      posts: responseData.posts,

      imageUrl:
        typeof responseData.regionImageUrl === "string"
          ? responseData.regionImageUrl
          : ""
    };
  } catch (error) {
    // 掲示板の取得に失敗しても、TOPの他機能には一切影響させない
    // (既存regionRecommendations取得の失敗時と同じ方針)。
    return emptyResult;
  }
}

// 現在地(GPS)由来の掲示板を、既存regionRecommendationSectionへ描画する。
// 「ほかの地域を見る」経由の表示(showRegionRecommendationsForArea())とは
// 完全に独立した別経路で、互いのDOM書き込みは競合しない
// (呼ばれるタイミングが重ならない：GPS確定時と手動選択時のみ)。
// 街の掲示板 Phase4｜この関数は現在地表示(isManualSelection=false)と、
// 「ほかの地域を見る」からの手動選択表示(isManualSelection=true)の
// 両方から共有で呼ばれる(関数名・既存呼び出し元は変更しない、最小実装)。
// 手動選択時は「戻る」ボタンを表示し、現在地投稿専用の「今いる街について
// 投稿する」リンクは非表示にする(遠隔地投稿はまだ実装しないため、
// 誤解を招くリンクを出さない、本部指示)。
// 街の掲示板 Phase5｜imageUrlは地域代表画像(1地域につき1枚、投稿カードの
// 中には入れない)。空文字/未指定の場合はimg要素自体を生成しない
// (壊れた画像アイコンや空枠を出さない、本部指示)。
// 街の掲示板 Phase6｜remoteRegionInfoは「ほかの地域を見る」経由の場合だけ
// {googlePlaceId, countryCode, administrativeLevel}を渡す(現在地表示では
// 未指定のまま、既存呼び出し元loadCommunityBoardForCurrentArea()は無変更)。
// 投稿リンクの遷移先URLを組み立てるためだけに使い、regionIdの解決自体は
// 引き続きサーバー側(communityBoardPostCreate→resolveOrCreateCommunityBoardRegion())
// が行う。
function renderCommunityBoardForCurrentArea(
  regionName,
  posts,
  isManualSelection,
  imageUrl,
  remoteRegionInfo
) {
  const section =
    document.getElementById(
      "regionRecommendationSection"
    );

  const heading =
    document.getElementById(
      "regionRecommendationHeading"
    );

  const imageBox =
    document.getElementById(
      "communityBoardRegionImageBox"
    );

  const list =
    document.getElementById(
      "regionRecommendationList"
    );

  const moreButton =
    document.getElementById(
      "regionRecommendationMoreButton"
    );

  const backButton =
    document.getElementById(
      "regionRecommendationBackToCurrentButton"
    );

  if (
    !section ||
    !heading ||
    !list
  ) {
    return;
  }

  const currentLanguage =
    getCurrentMachinauLanguage();

  heading.textContent =
    getMachinauTranslation(
      "community_board_heading_dynamic",
      currentLanguage
    ).replace(
      "{AREA}",
      regionName
    );

  if (imageBox) {
    const safeRegionImageUrl =
      getSafeImageUrl(
        imageUrl
      );

    imageBox.innerHTML =
      safeRegionImageUrl !== ""
        ? '<img class="community-board-region-image" src="' +
          escapeHtmlForCommunityBoard(
            buildOptimizedImageUrl(
              safeRegionImageUrl,
              { width: OPTIMIZED_IMAGE_WIDTH_REGION_RECOMMENDATION }
            )
          ) +
          '" alt="" loading="lazy" onerror="handleBrokenImage(this)">'
        : "";
  }

  if (moreButton) {
    // Phase3では上位10件の固定表示のみ(ページネーション未実装)。
    moreButton.style.display =
      "none";
  }

  if (backButton) {
    backButton.style.display =
      isManualSelection
        ? ""
        : "none";
  }

  const postLink =
    document.getElementById(
      "communityBoardPostLink"
    );

  if (postLink) {
    if (
      isManualSelection &&
      remoteRegionInfo &&
      remoteRegionInfo.googlePlaceId
    ) {
      // 街の掲示板 Phase6｜遠隔地表示中は「○○について投稿する」に文言を
      // 差し替え、投稿先地域をURLパラメータで渡す(community-board-post.html
      // 側でこれを読み取り、サーバーへ送るgooglePlaceId/countryCode/
      // regionName/administrativeLevelとして使う。regionId自体はここでは
      // 一切扱わない、サーバー側で毎回解決する、本部指示)。data-i18nを
      // 一時的に外し、静的翻訳の巻き戻りで文言が消えないようにする。
      postLink.removeAttribute(
        "data-i18n"
      );

      postLink.textContent =
        getMachinauTranslation(
          "community_board_post_link_remote",
          currentLanguage
        ).replace(
          "{AREA}",
          regionName
        );

      const remotePostParams =
        new URLSearchParams(
          {
            googlePlaceId: remoteRegionInfo.googlePlaceId,
            countryCode: remoteRegionInfo.countryCode || "",
            regionName: regionName || "",
            administrativeLevel: remoteRegionInfo.administrativeLevel || ""
          }
        );

      postLink.setAttribute(
        "href",
        "community-board-post.html?" +
          remotePostParams.toString()
      );

      postLink.style.display =
        "";
    } else if (isManualSelection) {
      // 遠隔地の地域解決に失敗した場合は、誤った投稿先を示さないよう
      // リンク自体を出さない(本部指示：投稿先を間違えないUI)。
      postLink.style.display =
        "none";
    } else {
      // 現在地表示：既存Phase3の「今いる街について投稿する」に戻す
      // (data-i18nを再度付け直し、通常の多言語切り替えに追従させる)。
      postLink.setAttribute(
        "data-i18n",
        "community_board_post_link"
      );

      postLink.textContent =
        getMachinauTranslation(
          "community_board_post_link",
          currentLanguage
        );

      postLink.setAttribute(
        "href",
        "community-board-post.html"
      );

      postLink.style.display =
        "";
    }
  }

  if (
    !Array.isArray(posts) ||
    posts.length === 0
  ) {
    list.innerHTML =
      '<p class="region-recommendation-empty-message">' +
      escapeHtmlForCommunityBoard(
        getMachinauTranslation(
          "community_board_empty",
          currentLanguage
        )
      ) +
      '</p>';
  } else {
    list.innerHTML =
      posts
        .map(
          buildCommunityBoardPostItemHtml
        )
        .join("");
  }

  section.style.display =
    "";
}

// GPS確定時のcommunityBoardPosts取得・描画をまとめる。呼び出し元
// (resolveLocationHierarchyFromCoordinates().then())からgooglePlaceId等が
// 渡された場合だけ実行し、取得できなかった場合はセクション自体に触れない
// (既存のisPermanentAd等、他の描画処理に影響させない)。
async function loadCommunityBoardForCurrentArea(
  googlePlaceId,
  countryCode,
  regionName
) {
  if (
    googlePlaceId === "" ||
    countryCode === "" ||
    regionName === ""
  ) {
    return;
  }

  currentCommunityBoardGooglePlaceId =
    googlePlaceId;

  currentCommunityBoardCountryCode =
    countryCode;

  currentCommunityBoardRegionName =
    regionName;

  const fetchResult =
    await fetchCommunityBoardPostsForCurrentArea(
      googlePlaceId,
      countryCode
    );

  renderCommunityBoardForCurrentArea(
    regionName,
    fetchResult.posts,
    false,
    fetchResult.imageUrl
  );
}


// 街の掲示板 Phase4｜「ほかの地域を見る」で選択された市区町村名を、
// 現在地経路(resolveLocationHierarchyFromCoordinates())と全く同じ考え方
// (locality result自身のplace_id)でgooglePlaceIdへ解決する。Phase0で
// Production実機確認済みの順方向Geocoderの使い方(geocode({address:...}))
// をそのまま使い、新しいGoogle APIは追加しない。既存のGPS用関数
// (resolveAreaNameFromCoordinates()等)は一切変更しない、完全に独立した
// 関数。
//
// 沖縄限定の住所補完(", 沖縄県, 日本")は、現在の地域ピッカーUIが
// OKINAWA_MUNICIPALITY_TO_REGION_NAME(沖縄41市町村)のみを選択肢にしている
// ことに合わせた、今回のUI範囲内の一時的な補完。OKINAWA_MUNICIPALITY_TO_
// REGION_NAME自体はcommunityBoardPostsの地域IDには使わず、選択肢生成にしか
// 使わない(本部指示)。将来ピッカーが全国・世界対応になった時点で、この
// 補完文字列の組み立て方だけを見直せばよく、地域ID自体の設計
// (countryCode+googlePlaceId→Machinau regionId)には影響しない。
function resolveGooglePlaceIdForAreaName(
  areaName
) {
  return new Promise(
    function(resolve) {
      if (
        typeof google === "undefined" ||
        !google.maps ||
        !google.maps.Geocoder
      ) {
        resolve(null);
        return;
      }

      const timeoutId =
        setTimeout(
          function() {
            resolve(null);
          },
          AREA_NAME_RESOLUTION_TIMEOUT_MS
        );

      function findComponent(
        addressComponents,
        typeName
      ) {
        if (
          !Array.isArray(
            addressComponents
          )
        ) {
          return null;
        }

        return (
          addressComponents.find(
            function(component) {
              return (
                Array.isArray(
                  component.types
                ) &&
                component.types.includes(
                  typeName
                )
              );
            }
          ) ||
          null
        );
      }

      try {
        const geocoder =
          new google.maps.Geocoder();

        geocoder.geocode(
          {
            address:
              areaName +
              ", 沖縄県, 日本"
          },
          function(results, status) {
            clearTimeout(
              timeoutId
            );

            if (
              status !== "OK" ||
              !Array.isArray(results)
            ) {
              resolve(null);
              return;
            }

            const localityResult =
              results.find(
                function(result) {
                  return (
                    Array.isArray(result.types) &&
                    result.types.includes("locality") &&
                    typeof result.place_id === "string" &&
                    result.place_id !== ""
                  );
                }
              );

            if (!localityResult) {
              resolve(null);
              return;
            }

            const countryComponent =
              findComponent(
                localityResult.address_components,
                "country"
              );

            const localityComponent =
              findComponent(
                localityResult.address_components,
                "locality"
              );

            const countryCode =
              countryComponent &&
              typeof countryComponent.short_name === "string"
                ? countryComponent.short_name
                : "";

            const regionName =
              localityComponent &&
              typeof localityComponent.long_name === "string"
                ? localityComponent.long_name
                : areaName;

            if (countryCode === "") {
              resolve(null);
              return;
            }

            resolve(
              {
                googlePlaceId: localityResult.place_id,
                countryCode: countryCode,
                regionName: regionName,

                // 街の掲示板 Phase6｜このresolveGooglePlaceIdForAreaName()は
                // localityタイプのresultにしかマッチしないため、常に
                // "locality"で確定できる(community-board-post.htmlの
                // 現在地取得処理と同じ既存の考え方をそのまま踏襲、
                // 国・都道府県名の新規ハードコードではない)。
                administrativeLevel: "locality"
              }
            );
          }
        );
      } catch (error) {
        clearTimeout(
          timeoutId
        );

        resolve(null);
      }
    }
  );
}

// 街の掲示板 Phase10｜「ほかの地域を見る」の全国対応(都道府県＋市区町村検索)
// 用の新しい地域解決関数。Phase10-Aで実測した以下の結果を踏まえる：
//   ・渋谷区/墨田区/札幌市/八重瀬町 → locality型resultとして単体で取得できる
//   ・横浜市中区/大阪市北区 → locality型resultは存在せず、
//     sublocality_level_1型resultとしてのみ取得できる(区自身のplace_id)
//   ・都道府県を付けずに「中央区」等を検索すると、Googleが複数候補を
//     返さず1件へ黙って絞り込む場合がある(誤爆リスク実測済み)
// そのため、この関数は必ず「都道府県名＋街名」で検索し、返ってきた
// resultのadministrative_area_level_1が選択都道府県と一致するものだけを
// 候補とする(STEP8)。既存resolveGooglePlaceIdForAreaName()(沖縄県固定、
// locality限定、Phase10時点で唯一の呼び出し元だったloadCommunityBoard
// ForSelectedArea()がこちらの新関数を使うよう切り替わるため未使用になるが、
// 本部指示によりこの関数自体・OKINAWA_MUNICIPALITY_TO_REGION_NAME・
// 「マチナウからの提案」等の既存利用箇所は一切削除しない)とは完全に独立した
// 新規関数として追加する。
function resolveGooglePlaceIdForPrefectureAndAreaName(
  prefectureName,
  areaName
) {
  return new Promise(
    async function(resolve) {
      const safePrefectureName =
        typeof prefectureName === "string"
          ? prefectureName.trim()
          : "";

      const safeAreaName =
        typeof areaName === "string"
          ? areaName.trim()
          : "";

      if (
        safePrefectureName === "" ||
        safeAreaName === ""
      ) {
        resolve(null);
        return;
      }

      // ensureGoogleMapsLoaded()は失敗時も例外を投げず必ずresolveするため、
      // ここでもawaitするだけで安全に使える(既存триggerRegionTodayInfo()等
      // と同じ既存の考え方)。「ほかの地域を見る」はGPS取得より先に押される
      // 場合があり、地図セクションの遅延読み込みが未実行のままの可能性がある。
      await ensureGoogleMapsLoaded();

      if (
        typeof google === "undefined" ||
        !google.maps ||
        !google.maps.Geocoder
      ) {
        resolve(null);
        return;
      }

      const timeoutId =
        setTimeout(
          function() {
            resolve(null);
          },
          AREA_NAME_RESOLUTION_TIMEOUT_MS
        );

      function findComponent(
        addressComponents,
        typeName
      ) {
        if (
          !Array.isArray(
            addressComponents
          )
        ) {
          return null;
        }

        return (
          addressComponents.find(
            function(component) {
              return (
                Array.isArray(
                  component.types
                ) &&
                component.types.includes(
                  typeName
                )
              );
            }
          ) ||
          null
        );
      }

      try {
        const geocoder =
          new google.maps.Geocoder();

        // 街の掲示板 Phase10 STEP4｜検索文字列は「都道府県＋街名＋, 日本」に
        // 固定する(Phase10-Aで確認済みの、都道府県を付けない検索がGoogle側で
        // 黙って1件に絞り込まれてしまうリスクを避けるため)。
        const searchAddress =
          safePrefectureName +
          safeAreaName +
          ", 日本";

        geocoder.geocode(
          {
            address: searchAddress
          },
          function(results, status) {
            clearTimeout(
              timeoutId
            );

            if (
              status !== "OK" ||
              !Array.isArray(results) ||
              results.length === 0
            ) {
              resolve(null);
              return;
            }

            // 街の掲示板 Phase10 STEP8/STEP10｜results[0]を無条件採用せず、
            // country==JP かつ administrative_area_level_1が選択都道府県と
            // 一致するresultだけを候補にする(都道府県整合性確認)。
            const validCandidates =
              results.filter(
                function(result) {
                  const countryComponent =
                    findComponent(
                      result.address_components,
                      "country"
                    );

                  const prefectureComponent =
                    findComponent(
                      result.address_components,
                      "administrative_area_level_1"
                    );

                  const isJapan =
                    countryComponent &&
                    typeof countryComponent.short_name === "string" &&
                    countryComponent.short_name === "JP";

                  const prefectureMatches =
                    prefectureComponent &&
                    typeof prefectureComponent.long_name === "string" &&
                    prefectureComponent.long_name === safePrefectureName;

                  return (
                    isJapan &&
                    prefectureMatches
                  );
                }
              );

            // 街の掲示板 Phase10 STEP5｜locality優先、無ければ
            // sublocality_level_1(Phase10-Aで実測できたのはこの2種類のみ。
            // sublocalityは実データで確認していないため推測で追加しない)。
            const localityCandidate =
              validCandidates.find(
                function(result) {
                  return (
                    Array.isArray(result.types) &&
                    result.types.includes("locality")
                  );
                }
              );

            const subLocalityLevel1Candidate =
              validCandidates.find(
                function(result) {
                  return (
                    Array.isArray(result.types) &&
                    result.types.includes("sublocality_level_1")
                  );
                }
              );

            const chosenResult =
              localityCandidate ||
              subLocalityLevel1Candidate;

            if (
              !chosenResult ||
              typeof chosenResult.place_id !== "string" ||
              chosenResult.place_id === ""
            ) {
              resolve(null);
              return;
            }

            const administrativeLevel =
              localityCandidate
                ? "locality"
                : "sublocality_level_1";

            const countryComponent =
              findComponent(
                chosenResult.address_components,
                "country"
              );

            const countryCode =
              countryComponent &&
              typeof countryComponent.short_name === "string"
                ? countryComponent.short_name
                : "";

            let regionName =
              "";

            if (administrativeLevel === "locality") {
              const localityComponent =
                findComponent(
                  chosenResult.address_components,
                  "locality"
                );

              regionName =
                localityComponent &&
                typeof localityComponent.long_name === "string"
                  ? localityComponent.long_name
                  : "";
            } else {
              // 街の掲示板 Phase10 STEP6｜sublocality_level_1(政令指定都市の
              // 区等)は、同じresult内のlocality(親市名)＋sublocality_level_1
              // (区名)を組み合わせる。Phase10-A実測(横浜市中区/大阪市北区)で、
              // この2つが同一result内の別コンポーネントとして重複なく
              // 存在することを確認済み。
              const parentCityComponent =
                findComponent(
                  chosenResult.address_components,
                  "locality"
                );

              const wardComponent =
                findComponent(
                  chosenResult.address_components,
                  "sublocality_level_1"
                );

              if (
                parentCityComponent &&
                typeof parentCityComponent.long_name === "string" &&
                wardComponent &&
                typeof wardComponent.long_name === "string"
              ) {
                regionName =
                  parentCityComponent.long_name +
                  wardComponent.long_name;
              }
            }

            if (
              countryCode === "" ||
              regionName === ""
            ) {
              resolve(null);
              return;
            }

            resolve(
              {
                googlePlaceId: chosenResult.place_id,
                countryCode: countryCode,
                regionName: regionName,
                administrativeLevel: administrativeLevel
              }
            );
          }
        );
      } catch (error) {
        clearTimeout(
          timeoutId
        );

        resolve(null);
      }
    }
  );
}

// 「ほかの地域を見る」から選択された地域の掲示板を取得・描画する。
// 街の掲示板 Phase10｜全国対応に伴い、resolveGooglePlaceIdForAreaName()
// (沖縄県固定)からresolveGooglePlaceIdForPrefectureAndAreaName()
// (都道府県＋街名)へ切り替える。また、解決に失敗した場合の挙動も変更する：
// 従来は「まだ投稿がありません」で掲示板を表示する安全側フォールバックだったが、
// 全国自由入力では誤った街の掲示板を開いたと誤解されるリスクがあるため、
// 掲示板側には一切進まず、呼び出し元(検索フォーム)がエラー文言を表示できる
// よう戻り値で成否を返すだけにする(本部指示)。
async function loadCommunityBoardForSelectedArea(
  prefectureName,
  areaName
) {
  const resolvedRegion =
    await resolveGooglePlaceIdForPrefectureAndAreaName(
      prefectureName,
      areaName
    );

  if (!resolvedRegion) {
    return false;
  }

  const fetchResult =
    await fetchCommunityBoardPostsForCurrentArea(
      resolvedRegion.googlePlaceId,
      resolvedRegion.countryCode
    );

  renderCommunityBoardForCurrentArea(
    resolvedRegion.regionName,
    fetchResult.posts,
    true,
    fetchResult.imageUrl,
    resolvedRegion
  );

  return true;
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

  // 街の情報基盤 Phase1｜街を見るAI由来の「今」は、既に読み込み済みの
  // shops配列から同期的に取り出せるため、Firestore取得(下のtry節)の
  // 成否とは independent に先に計算しておく。regionRecommendationsの
  // 取得が失敗した場合でも、この「今」の情報だけは表示できるようにする
  // (既存機能を壊さない・段階的縮退の原則)。
  const aiAreaInformation =
    selectActiveAiAreaInformation(
      areaName
    );

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

    const legacyArticles =
      querySnapshot.docs.map(
        function(documentSnapshot) {
          // Ver1.8 Phase1｜AIコンシェルジュが実データへ戻れるよう、
          // 既存のdocumentSnapshot.data()に加えてdocumentSnapshot.idも
          // 保持する(追加フィールドのみ、既存フィールド・呼び出し元の
          // 描画ロジックには一切影響しない)。
          // 多言語化 Phase D｜このアイテムがregionRecommendations由来で
          // あることを示す(submissions由来のAI情報と翻訳キャッシュの
          // 置き場所を区別するため)。
          return Object.assign(
            {
              id: documentSnapshot.id,
              sourceCollection: "regionRecommendations"
            },
            documentSnapshot.data()
          );
        }
      );

    // 街の情報基盤 Phase1｜同じ情報がregionRecommendations(人間が書いた
    // 中長期情報)とAI由来submissionsの両方にある場合の重複表示を避ける。
    // 複雑な判定はせず、websiteUrl完全一致(既存のgetSafeWebsiteUrl()で
    // 正規化済みの値同士の比較)のみで判定する。URLが無い記事同士は
    // 重複判定の対象にしない(誤って別々の情報を同一視しないため)。
    const legacyWebsiteUrls =
      new Set(
        legacyArticles
          .map(
            function(article) {
              return getSafeWebsiteUrl(
                article.websiteUrl
              );
            }
          )
          .filter(
            function(safeUrl) {
              return safeUrl !== "";
            }
          )
      );

    const dedupedAiAreaInformation =
      aiAreaInformation.filter(
        function(article) {
          const safeUrl =
            getSafeWebsiteUrl(
              article.websiteUrl
            );

          return (
            safeUrl === "" ||
            !legacyWebsiteUrls.has(
              safeUrl
            )
          );
        }
      );

    // 「街の今」(AI由来、安全・交通等を優先した並び)を先に、
    // 「中長期の地域情報」(regionRecommendations、既存のsortOrder順)を
    // 後に並べる。ユーザーからはひとつの「今知っておくといいこと」の
    // 一覧として見える(データ源の違いをUI上で分けない)。
    regionRecommendationArticles =
      dedupedAiAreaInformation.concat(
        legacyArticles
      );

    renderRegionRecommendationCards();
  } catch (error) {
    console.error(
      "地域のおすすめの取得に失敗しました：",
      error
    );

    // regionRecommendationsの取得だけが失敗した場合でも、既に計算済みの
    // AI由来の「今」があればそれだけは表示する(空配列に戻して消さない)。
    regionRecommendationArticles =
      aiAreaInformation;

    renderRegionRecommendationCards();
  }
}


// 街の情報基盤 Phase1｜街を見るAIが収集し、現在も有効(status:"approved"
// かつexpiresAt>now、既存のloadApprovedSubmissions()が取得する時点で
// この条件を満たすものしかshopsに入らない)と判定されているAI由来の
// 地域情報を、指定エリアぶんだけ取り出す。新しいFirestoreクエリ・
// 新しいFunctionは使わず、既に読み込み済みのshops配列をJavaScript側で
// 絞り込むだけ。将来マチナウAI自身が「(area)の今を見て」という形で
// 再利用できるよう、UI専用の使い捨て処理にせず独立した関数にする
// (関数名・置き場所は既存のselect...ForAiConcierge()系の命名・構成に合わせた)。
//
// 対象は「街を見るAIが自動収集・自動投稿した情報」のみ(postType:"admin"
// かつauthorType:"ai")。一般の店舗投稿・街の声はここには混ぜない
// (本部指示により今回は対象外、将来別途統合)。
//
// 並び順は、⚡「今知っておきたいこと」で既に使われている
// matchesAiConciergeImportantKeywords()(安全・ライフライン・交通・休業等の
// キーワード判定)をそのまま再利用し、安全・交通等に関わる情報を先に、
// それ以外は新しい順に並べる。同じキーワード判定ロジックを複製しない。
function selectActiveAiAreaInformation(
  areaName
) {
  if (
    typeof areaName !== "string" ||
    areaName === ""
  ) {
    return [];
  }

  return shops
    .filter(
      function(shop) {
        return (
          shop.postType === "admin" &&
          shop.authorType === "ai" &&
          shop.area === areaName
        );
      }
    )
    .sort(
      function(firstShop, secondShop) {
        const firstIsImportant =
          matchesAiConciergeImportantKeywords(
            firstShop
          );

        const secondIsImportant =
          matchesAiConciergeImportantKeywords(
            secondShop
          );

        if (
          firstIsImportant !==
          secondIsImportant
        ) {
          return firstIsImportant
            ? -1
            : 1;
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
    )
    .map(
      function(shop) {
        // buildRegionRecommendationCardHtml()が読む項目(title/content/
        // websiteUrl/imageUrls)だけを持つ、既存regionRecommendations記事と
        // 同じ形のオブジェクトに変換する。regionNameは付けない(市町村名の
        // ラベルは「他の地域を見る」の見出し自体に既に出ているため)。
        return {
          // 初心回帰後の新トップ体験 Phase1｜以前の全配線調査で判明した
          // 不具合修正：idが無いとbuildAiConciergeCandidateFromRegionArticle()
          // のガード(article.idが無ければnullを返す)で弾かれ、街を見るAI
          // 由来のこの情報がregion_recommendation候補としてTerraへ一切
          // 届かなかった。新しいFirestoreフィールドは使わず、既存の
          // shop.firestoreIdをそのままidとして使う(表示用オブジェクトの
          // 他フィールドは無変更)。
          id:
            shop.firestoreId,

          // 多言語化 Phase D｜このアイテムがsubmissions(街を見るAI由来)で
          // あることを示す。翻訳表示時、regionRecommendationsとは別の
          // キャッシュ置き場所(shop.translatedMessages/translatedTitles、
          // Phase Bと共有)を参照するために使う。
          sourceCollection:
            "submissions",

          title:
            shop.title,

          content:
            shop.message,

          websiteUrl:
            shop.websiteUrl,

          imageUrls:
            shop.imageUrls
        };
      }
    );
}


// 初心回帰後の新トップ体験 Phase1｜「聞かせる」のではなく「気づかせる」。
// 会話を介さず、現在地×現在時刻×情報管理室から短い一言で直接届けるための
// 候補集約。新しいFirestore読み取り・新しいOpenAI呼び出しは一切行わず、
// 既にshops配列(getVisibleShops()が期限切れ・未承認を除外済み)から候補を
// 取り出す既存4関数(factual_info/official_today/traveler_suggestion/
// 一般店舗)をそのまま優先順に再利用するだけ。同じ店舗が複数の枠に重複
// 該当する場合はfirestoreId単位で先勝ちにする。regionRecommendation
// (地域のおすすめ)は既存の別セクションで既に表示されているため、今回の
// 「気づきの一言」には二重表示しない。
function selectAwarenessNoticesForCurrentArea() {
  if (
    typeof userAreaName !== "string" ||
    userAreaName === ""
  ) {
    return {
      headlineNotices: [],
      hasGeneralShopInfo: false
    };
  }

  const seenFirestoreIds =
    {};

  const headlineNotices =
    [];

  function addHeadlineNotices(
    shopList,
    kind
  ) {
    shopList.forEach(
      function(shop) {
        if (
          !shop.firestoreId ||
          seenFirestoreIds[shop.firestoreId]
        ) {
          return;
        }

        seenFirestoreIds[shop.firestoreId] =
          true;

        headlineNotices.push(
          {
            kind: kind,
            shop: shop
          }
        );
      }
    );
  }

  // 優先順位：1.知らないと困る(安全) 2.今しかない(お知らせ・イベント)
  // 3.知ってたら得する(街の発見)。一般店舗投稿は個別の一言にはせず、
  // 後述のhasGeneralShopInfoによる要約1行にまとめる(羅列を避けるため)。
  addHeadlineNotices(
    selectFactualImportantInfoCandidatesForAiConcierge(),
    "factual_info"
  );

  addHeadlineNotices(
    selectTodayMachinauCandidatesForAiConcierge(),
    "official_today"
  );

  // 「近くの『今』」Phase1修正｜Production実データ確認により、
  // selectAiConciergeCandidates()が返す候補には、本来のイベント/観光・体験
  // (category==="イベント"|"観光・体験"、街を見るAI由来)に加えて、
  // 「常設店舗広告」(shop.isPermanentAd===true、自動失効しない通常営業の
  // 店舗広告枠、無条件に埋め合わせとして混ざる)も含まれることを確認した。
  // 後者は「今日だけ」の情報ではないため、個別の「今日、○○やってるみたい」
  // という一言にはしない(isPermanentAd===trueを除外する)。この店舗広告は
  // 既にselectGeneralShopCandidatesForAiConcierge()経由でhasGeneralShopInfo
  // (一般店舗の要約導線)側に自然に含まれるため、情報自体は失われない。
  addHeadlineNotices(
    selectAiConciergeCandidates().filter(
      function(shop) {
        return shop.isPermanentAd !== true;
      }
    ),
    "traveler_suggestion"
  );

  const generalShopCandidates =
    selectGeneralShopCandidatesForAiConcierge();

  const streetDiscoveryCandidates =
    generalShopCandidates.filter(
      function(shop) {
        return shop.category === "街の発見";
      }
    );

  addHeadlineNotices(
    streetDiscoveryCandidates,
    "street_discovery"
  );

  const hasGeneralShopInfo =
    generalShopCandidates.some(
      function(shop) {
        return (
          shop.category !== "街の発見" &&
          !seenFirestoreIds[shop.firestoreId]
        );
      }
    );

  return {
    headlineNotices: headlineNotices,
    hasGeneralShopInfo: hasGeneralShopInfo
  };
}


// 種類ごとの短い一言テンプレートへ、実際のタイトルを差し込むだけ
// (OpenAI呼び出しなし、AIが文章を生成するわけではない)。
function buildAwarenessNoticeText(
  notice
) {
  const language =
    getCurrentMachinauLanguage();

  const title =
    typeof notice.shop.title === "string" &&
    notice.shop.title !== ""
      ? notice.shop.title
      : (
          typeof notice.shop.name === "string"
            ? notice.shop.name
            : ""
        );

  const templateKeyByKind =
    {
      factual_info: "awareness_notice_factual_info",
      official_today: "awareness_notice_official_today",
      traveler_suggestion: "awareness_notice_traveler_suggestion",
      street_discovery: "awareness_notice_street_discovery"
    };

  const templateKey =
    templateKeyByKind[notice.kind] ||
    "awareness_notice_official_today";

  return getMachinauTranslation(
    templateKey,
    language
  ).replace(
    "{TITLE}",
    title
  );
}


// 「気づきの一言」パネルの描画。GPSで現在地取得・更新された時にだけ
// getLocation()から呼ばれる(60秒タイマー等での自動再判定はしない)。
// タップ先は既存openShopModal()/scrollToShops()のみで、AIチャットへは
// 一切遷移させない。
// SNS街巡回(socialPatrol) Phase1｜本部指示による最小feature flag。
// 「実装できた」と「Productionで実際にSNSを巡回できた」は別物であり、
// 実地試験で意味のある話題を発見できると確認できるまで、一般旅行者の
// 画面には一切表示しない。falseの間はtriggerSocialPatrolForArea()自体を
// 呼び出さない(サーバー側api/moderate-submission.jsのmode:"socialPatrol"
// 自体は生きたまま、Claude Code側からの直接呼び出しによる実地試験は可能)。
// trueへ切り替えるのは本部の判断のみ。
const SOCIAL_PATROL_TRAVELER_DISPLAY_ENABLED =
  false;

// SNS街巡回(socialPatrol) Phase1｜GPS取得のたびに毎回このセッション内で
// 結果を保持し直す(古いGPSセッションの応答が後から届いても上書きしない
// よう、machinauSuggestionGpsSessionIdと同じ考え方でガードする)。
let currentSocialPatrolFindings =
  [];

let currentSocialPatrolChecked =
  false;

function renderAwarenessNotices() {
  const section =
    document.getElementById(
      "awarenessNoticesSection"
    );

  const list =
    document.getElementById(
      "awarenessNoticesList"
    );

  const emptyMessage =
    document.getElementById(
      "awarenessNoticesEmptyMessage"
    );

  if (
    !section ||
    !list ||
    !emptyMessage
  ) {
    return;
  }

  if (
    typeof userAreaName !== "string" ||
    userAreaName === ""
  ) {
    section.style.display =
      "none";

    return;
  }

  const language =
    getCurrentMachinauLanguage();

  const awarenessResult =
    selectAwarenessNoticesForCurrentArea();

  const itemsHtml =
    [];

  awarenessResult.headlineNotices.forEach(
    function(notice) {
      itemsHtml.push(
        '<button type="button" class="awareness-notice-item" data-action="detail" data-firestore-id="' +
        escapeHtml(notice.shop.firestoreId || "") +
        '">' +
        escapeHtml(
          buildAwarenessNoticeText(
            notice
          )
        ) +
        "</button>"
      );
    }
  );

  if (awarenessResult.hasGeneralShopInfo) {
    itemsHtml.push(
      '<button type="button" class="awareness-notice-item awareness-notice-shop-summary" data-action="scroll-shops">' +
      escapeHtml(
        getMachinauTranslation(
          "awareness_notice_shop_summary",
          language
        )
      ) +
      "</button>"
    );
  }

  // SNS街巡回(socialPatrol) Phase1｜見つかった話題は、SNS投稿本文の転載を
  // しないため既存openShopModal()等のタップ詳細は持たせず、非対話の
  // <p>としてそのまま追加する(タップ先が無いことをボタンにしない見た目で
  // 明示する)。findingsは既にサーバー側sanitizeSocialPatrolFinding()で
  // 検証済みの短文のみ。
  currentSocialPatrolFindings.forEach(
    function(finding) {
      itemsHtml.push(
        '<p class="awareness-notice-item awareness-notice-social">' +
        escapeHtml(finding.summary) +
        "</p>"
      );
    }
  );

  if (itemsHtml.length === 0) {
    list.innerHTML =
      "";

    // SNS巡回が実際に実行され(checked:true)、それでも何も見つからなかった
    // 場合だけ、SNSに言及した空メッセージへ切り替える。巡回が未実行/失敗
    // (checked:false)の場合は、取得していないものを「確認した」と
    // 表現しないため、既存の中立な空メッセージを維持する(本部指示)。
    emptyMessage.textContent =
      getMachinauTranslation(
        currentSocialPatrolChecked
          ? "awareness_notices_empty_social_checked"
          : "awareness_notices_empty",
        language
      );

    emptyMessage.style.display =
      "";

    section.style.display =
      "";

    return;
  }

  emptyMessage.style.display =
    "none";

  list.innerHTML =
    itemsHtml.join("");

  section.style.display =
    "";
}


// awarenessNoticesListへのクリックをイベント委譲で処理する。一覧を
// renderAwarenessNotices()が再描画するたびにリスナーを付け直す必要が
// ないよう、親要素固定のリスナーを1回だけ登録する。
function initializeAwarenessNoticesInteractions() {
  const list =
    document.getElementById(
      "awarenessNoticesList"
    );

  if (!list) {
    return;
  }

  list.addEventListener(
    "click",
    function(clickEvent) {
      const button =
        clickEvent.target.closest(
          ".awareness-notice-item"
        );

      if (!button) {
        return;
      }

      const action =
        button.getAttribute(
          "data-action"
        );

      if (action === "scroll-shops") {
        scrollToShops();

        return;
      }

      if (action === "detail") {
        const firestoreId =
          button.getAttribute(
            "data-firestore-id"
          );

        if (firestoreId) {
          openShopModal(
            firestoreId
          );
        }
      }
    }
  );
}


// SNS街巡回(socialPatrol) Phase1｜GPS取得/更新のたびに呼ぶ(移動だけでの
// 自動再取得はしない、既存の「近くの今」パネルと同じトリガー方針)。
// サーバー側(api/moderate-submission.js、mode:"socialPatrol")が地域単位の
// Firestoreキャッシュ(3時間)を持つため、同じ地域への短時間の連続アクセス
// でOpenAI呼び出しが重複することはない。応答が届いた時点でgpsSessionIdが
// 既に古くなっていれば(別の場所へ移動済み)、結果は反映しない。
async function triggerSocialPatrolForArea(
  areaName,
  gpsSessionId
) {
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

          body: JSON.stringify({
            mode: "socialPatrol",
            targetArea: areaName
          })
        }
      );

    let responseData =
      null;

    try {
      responseData =
        await response.json();
    } catch (jsonError) {
      return;
    }

    if (
      gpsSessionId !==
      machinauSuggestionGpsSessionId
    ) {
      // 応答が届く間に別の場所へ移動済み。古い地域の結果を今の画面へ
      // 反映しない。
      return;
    }

    if (
      !response.ok ||
      !responseData ||
      responseData.success !== true
    ) {
      // 失敗時は「巡回していない」既存の中立表示のまま何もしない
      // (取得できていないものを取得したように見せない)。
      return;
    }

    currentSocialPatrolChecked =
      responseData.checked === true;

    currentSocialPatrolFindings =
      Array.isArray(responseData.findings)
        ? responseData.findings
        : [];

    renderAwarenessNotices();
  } catch (error) {
    // SNS街巡回は補助機能のため、失敗しても「近くの今」の既存表示
    // (街を見るAI・店舗由来)には一切影響させない。
  }
}


// 広域region×localDate共有AI地域情報 Phase1(本番機能)＋Phase1 UI｜
// 「今日、この地域で起きていること」。ここではPhase1で実装済みの
// キャッシュ/Luna調査ロジック(mode:"regionTodayInfoGet"自体)には一切
// 触れず、既に返ってくるfindingsの取得・少数回polling・最小表示だけを
// 行う。既存の店舗・天気・読み物・cityInfo・おすすめ・AIコンシェルジュ等、
// 他のどの既存処理にも一切触れない・依存しない(失敗しても他機能に
// 影響させない設計は既存のtriggerSocialPatrolForArea()と同じ考え方)。
let currentRegionTodayInfoStatus =
  null;

let currentRegionTodayInfoFindings =
  [];

let currentRegionTodayInfoMunicipality =
  "";

let isRegionTodayInfoExpanded =
  false;

// status:"generating"のときだけ短時間間隔で少数回だけ再取得する
// (無限pollingは行わない)。Luna生成は最大90秒程度かかり得るため、
// 5秒間隔×5回(追加で最大25秒)というLunaのタイムアウトより短い、
// 安全側の小さな値にとどめる。それでもreadyにならない場合は
// エラー表示にはせず、このセクションだけ静かに非表示にする。
const REGION_TODAY_INFO_POLL_INTERVAL_MS =
  5000;

const REGION_TODAY_INFO_MAX_POLL_ATTEMPTS =
  5;

async function fetchRegionTodayInfoOnce(
  latitude,
  longitude,
  locationHierarchy
) {
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

        body: JSON.stringify({
          mode: "regionTodayInfoGet",
          latitude: latitude,
          longitude: longitude,
          countryCode: locationHierarchy.countryCode,
          countryName: locationHierarchy.countryName,
          regionKey: locationHierarchy.regionKey,
          regionName: locationHierarchy.regionName,
          municipality: locationHierarchy.municipality,

          // 多言語化 Phase A｜独自の言語状態は作らず、既存の
          // getCurrentMachinauLanguage()をそのまま使う(本部指示)。
          language:
            getCurrentMachinauLanguage()
        })
      }
    );

  let responseData =
    null;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    responseData =
      null;
  }

  if (
    !response.ok ||
    !responseData ||
    responseData.success !== true
  ) {
    return null;
  }

  return responseData;
}

function waitForMilliseconds(
  milliseconds
) {
  return new Promise(
    function(resolve) {
      window.setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

// 多言語化 Phase A｜言語切替時に再取得するため、直近のGPS取得結果を
// 覚えておく(新しいGPS取得は発生させない、既存のuserLatitude/
// userLongitude等とは別に、regionTodayInfo専用の値として保持する)。
let lastRegionTodayInfoLatitude =
  null;

let lastRegionTodayInfoLongitude =
  null;

let lastRegionTodayInfoLocationHierarchy =
  null;

async function triggerRegionTodayInfo(
  latitude,
  longitude,
  locationHierarchy,
  gpsSessionId
) {
  if (
    !locationHierarchy ||
    typeof locationHierarchy.countryCode !== "string" ||
    locationHierarchy.countryCode === "" ||
    typeof locationHierarchy.regionKey !== "string" ||
    locationHierarchy.regionKey === "" ||
    typeof locationHierarchy.regionName !== "string" ||
    locationHierarchy.regionName === ""
  ) {
    // regionKey等が取得できなかった場合は静かに諦める(既存の
    // resolveLocationHierarchyFromCoordinates()の失敗時フォールバックと
    // 同じ考え方)。
    return;
  }

  lastRegionTodayInfoLatitude =
    latitude;

  lastRegionTodayInfoLongitude =
    longitude;

  lastRegionTodayInfoLocationHierarchy =
    locationHierarchy;

  currentRegionTodayInfoMunicipality =
    typeof locationHierarchy.municipality === "string"
      ? locationHierarchy.municipality
      : "";

  isRegionTodayInfoExpanded =
    false;

  currentRegionTodayInfoStatus =
    "loading";

  currentRegionTodayInfoFindings =
    [];

  renderRegionTodayInfo();

  try {
    for (
      let attemptIndex = 0;
      attemptIndex < REGION_TODAY_INFO_MAX_POLL_ATTEMPTS;
      attemptIndex += 1
    ) {
      if (
        gpsSessionId !==
        machinauSuggestionGpsSessionId
      ) {
        // 応答を待つ間に別の場所へ移動済み。古い地域の結果を今の画面へ
        // 反映しない。
        return;
      }

      const responseData =
        await fetchRegionTodayInfoOnce(
          latitude,
          longitude,
          locationHierarchy
        );

      if (
        gpsSessionId !==
        machinauSuggestionGpsSessionId
      ) {
        return;
      }

      if (!responseData) {
        currentRegionTodayInfoStatus =
          "error";

        renderRegionTodayInfo();
        renderCityNowGuidance();

        return;
      }

      if (responseData.status === "ready") {
        currentRegionTodayInfoStatus =
          "ready";

        currentRegionTodayInfoFindings =
          Array.isArray(responseData.findings)
            ? responseData.findings
            : [];

        renderRegionTodayInfo();
        renderCityNowGuidance();

        return;
      }

      if (responseData.status === "generating") {
        currentRegionTodayInfoStatus =
          "generating";

        renderRegionTodayInfo();

        if (
          attemptIndex <
          REGION_TODAY_INFO_MAX_POLL_ATTEMPTS - 1
        ) {
          await waitForMilliseconds(
            REGION_TODAY_INFO_POLL_INTERVAL_MS
          );

          continue;
        }

        // 少数回のpollingでもreadyにならなかった場合、エラーを大きく
        // 表示せず、このセクションだけ静かに非表示にする(本部指示)。
        currentRegionTodayInfoStatus =
          "error";

        renderRegionTodayInfo();
        renderCityNowGuidance();

        return;
      }

      // status:"error"等の想定外の応答も同様に静かに非表示にする。
      currentRegionTodayInfoStatus =
        "error";

      renderRegionTodayInfo();
      renderCityNowGuidance();

      return;
    }
  } catch (error) {
    // 広域地域情報は補助機能のため、失敗しても既存のTOP画面表示には
    // 一切影響させない。
    currentRegionTodayInfoStatus =
      "error";

    renderRegionTodayInfo();
    renderCityNowGuidance();
  }
}

// 多言語化 Phase A｜言語切替のたびに新しいGPS取得は発生させず、直近の
// 緯度経度・地域階層情報をそのまま使って再取得する。取得先は既存の
// triggerRegionTodayInfo()そのもの(新しい取得経路は作らない)。サーバー側が
// 既にその言語の翻訳キャッシュを持っていれば、OpenAI翻訳APIは呼ばれず
// Firestoreの保存済み結果がそのまま返る(本部指示：言語切替のたびにAI翻訳
// APIを呼ばない)。GPSがまだ一度も成功していない場合は何もしない
// (regionTodayInfoセクション自体がまだ表示されていないため)。
function refreshRegionTodayInfoForCurrentLanguage() {
  if (
    lastRegionTodayInfoLatitude === null ||
    lastRegionTodayInfoLongitude === null ||
    !lastRegionTodayInfoLocationHierarchy
  ) {
    return;
  }

  triggerRegionTodayInfo(
    lastRegionTodayInfoLatitude,
    lastRegionTodayInfoLongitude,
    lastRegionTodayInfoLocationHierarchy,
    machinauSuggestionGpsSessionId
  );
}

// 多言語化 Phase B(店舗情報)｜「今、近くで楽しめる場所」で実際に画面に
// 表示されている店舗の説明文(shop.message)だけを、選択言語がja以外の
// ときだけまとめて1回のリクエストで翻訳取得する。日本語選択時は一切
// 呼び出さない(AI翻訳費0円)。既に翻訳済み・現在取得中の店舗は
// サーバー側で判断されるが、無駄なリクエスト自体を減らすため、
// クライアント側でも「まだ翻訳を持っていない店舗」だけに絞り込む。
// 同じ組み合わせ(言語＋店舗ID集合)を取得中は多重リクエストしない
// (shopTranslationFetchInFlightKeyによる簡易ガード)。
let shopTranslationFetchInFlightKey =
  null;

function refreshShopTranslationsIfNeeded() {
  const language =
    getCurrentMachinauLanguage();

  if (language === MACHINAU_DEFAULT_LANGUAGE) {
    return;
  }

  const shopIdsNeedingTranslation =
    lastRenderedShopCardIds.filter(
      function(firestoreId) {
        const shop =
          shops.find(
            function(candidateShop) {
              return (
                candidateShop.firestoreId ===
                firestoreId
              );
            }
          );

        return (
          shop &&
          typeof shop.message === "string" &&
          shop.message.trim() !== "" &&
          !(
            shop.translatedMessages &&
            typeof shop.translatedMessages[language] === "string" &&
            shop.translatedMessages[language] !== ""
          )
        );
      }
    );

  if (shopIdsNeedingTranslation.length === 0) {
    return;
  }

  const fetchKey =
    language +
    ":" +
    shopIdsNeedingTranslation
      .slice()
      .sort()
      .join(",");

  if (
    shopTranslationFetchInFlightKey ===
    fetchKey
  ) {
    // 同じ店舗集合・同じ言語のリクエストが既に進行中。
    return;
  }

  shopTranslationFetchInFlightKey =
    fetchKey;

  fetchShopTranslations(
    shopIdsNeedingTranslation,
    language
  )
    .then(
      function(translationsByShopId) {
        shopTranslationFetchInFlightKey =
          null;

        if (!translationsByShopId) {
          return;
        }

        let didUpdateAnyShop =
          false;

        Object.keys(
          translationsByShopId
        ).forEach(
          function(firestoreId) {
            const shop =
              shops.find(
                function(candidateShop) {
                  return (
                    candidateShop.firestoreId ===
                    firestoreId
                  );
                }
              );

            if (!shop) {
              return;
            }

            if (!shop.translatedMessages) {
              shop.translatedMessages =
                {};
            }

            shop.translatedMessages[language] =
              translationsByShopId[firestoreId];

            didUpdateAnyShop =
              true;
          }
        );

        if (didUpdateAnyShop) {
          // 取得済みの翻訳をカード・モーダルへ反映するための再描画。
          // renderShops()は末尾で再度refreshShopTranslationsIfNeeded()を
          // 呼ぶが、今回取得した店舗は既にtranslatedMessagesを持つため、
          // shopIdsNeedingTranslationが空になり、無限ループにはならない。
          renderShops();
        }
      }
    )
    .catch(
      function(error) {
        // 店舗説明の翻訳は補助機能のため、失敗しても既存のTOP画面表示
        // (日本語原文の表示)には一切影響させない。
        shopTranslationFetchInFlightKey =
          null;
      }
    );
}

async function fetchShopTranslations(
  firestoreIds,
  language
) {
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

        body: JSON.stringify({
          mode: "shopTranslationGet",
          firestoreIds: firestoreIds,
          language: language
        })
      }
    );

  let responseData =
    null;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    return null;
  }

  if (
    !response.ok ||
    !responseData ||
    responseData.success !== true ||
    !responseData.translations ||
    typeof responseData.translations !== "object"
  ) {
    return null;
  }

  return responseData.translations;
}

// 多言語化 Phase D｜shopTranslationGetのtitle専用拡張。既存の
// fetchShopTranslations()(message専用、Phase B、無変更)とは別の
// リクエストとして送る(本部指示：titleが無いからといってmessageまで
// 再翻訳させない。逆にmessage取得のためだけにtitleリクエストを送らない)。
async function fetchShopTitleTranslations(
  firestoreIds,
  language
) {
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

        body: JSON.stringify({
          mode: "shopTranslationGet",
          titleFirestoreIds: firestoreIds,
          language: language
        })
      }
    );

  let responseData =
    null;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    return null;
  }

  if (
    !response.ok ||
    !responseData ||
    responseData.success !== true ||
    !responseData.titleTranslations ||
    typeof responseData.titleTranslations !== "object"
  ) {
    return null;
  }

  return responseData.titleTranslations;
}

// 多言語化 Phase D｜regionRecommendations由来の記事のtitle/content翻訳を
// 取得する。新しいVercel Functionは作らず、既存/api/moderate-submissionへ
// mode追加で対応する(regionTodayInfoGet/cityInfoGet/shopTranslationGetと
// 同じ構成)。clientはfirestoreId(regionRecommendationsのdocument ID)と
// languageだけを送り、実際のtitle/content原文はサーバー側が
// regionRecommendationsから取得する(クライアント本文は信用しない)。
async function fetchRegionRecommendationTranslations(
  firestoreIds,
  language
) {
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

        body: JSON.stringify({
          mode: "regionRecommendationTranslationGet",
          firestoreIds: firestoreIds,
          language: language
        })
      }
    );

  let responseData =
    null;

  try {
    responseData =
      await response.json();
  } catch (jsonError) {
    return null;
  }

  if (
    !response.ok ||
    !responseData ||
    responseData.success !== true ||
    !responseData.translations ||
    typeof responseData.translations !== "object"
  ) {
    return null;
  }

  return responseData.translations;
}

// 多言語化 Phase D｜「地域のおすすめ」の未翻訳分をまとめて取得する。
// 対象を3系統に分ける：
// 1) regionRecommendations由来のtitle+content(このセクション専用の
//    新しいキャッシュ、regionRecommendationTranslationsCache)。
// 2) submissions由来のtitle(Phase Bのtranslated Messagesとは独立した
//    shop.translatedTitles、shopTranslationGetのtitleFirestoreIds経由)。
// 3) submissions由来のcontent(=shop.message)。Phase Bのtranslated
//    Messagesをそのまま参照するだけで、未取得ならPhase Bと全く同じ
//    fetchShopTranslations()を呼ぶ(新しい翻訳経路を作らない、同じ原文を
//    二重にOpenAIへ送らない)。
// 日本語選択時は何もしない(AI翻訳費0円)。
let regionRecommendationLegacyTranslationFetchInFlightKey =
  null;

let regionRecommendationAiTitleTranslationFetchInFlightKey =
  null;

function refreshRegionRecommendationTranslationsIfNeeded() {
  const language =
    getCurrentMachinauLanguage();

  if (language === MACHINAU_DEFAULT_LANGUAGE) {
    return;
  }

  const legacyArticleIdsNeedingTranslation =
    [];

  const aiArticleIdsNeedingTitleTranslation =
    [];

  const aiArticleIdsNeedingMessageTranslation =
    [];

  lastRenderedRegionRecommendationArticles.forEach(
    function(article) {
      if (article.sourceCollection === "regionRecommendations") {
        const cachedTranslationsForArticle =
          regionRecommendationTranslationsCache[article.id];

        const hasCachedTranslation =
          Boolean(
            cachedTranslationsForArticle &&
            cachedTranslationsForArticle[language]
          );

        if (!hasCachedTranslation) {
          legacyArticleIdsNeedingTranslation.push(
            article.id
          );
        }

        return;
      }

      if (article.sourceCollection === "submissions") {
        const shop =
          shops.find(
            function(candidateShop) {
              return (
                candidateShop.firestoreId ===
                article.id
              );
            }
          );

        if (!shop) {
          return;
        }

        const hasTranslatedTitle =
          shop.translatedTitles &&
          typeof shop.translatedTitles[language] === "string" &&
          shop.translatedTitles[language] !== "";

        if (
          !hasTranslatedTitle &&
          typeof shop.title === "string" &&
          shop.title.trim() !== ""
        ) {
          aiArticleIdsNeedingTitleTranslation.push(
            article.id
          );
        }

        const hasTranslatedMessage =
          shop.translatedMessages &&
          typeof shop.translatedMessages[language] === "string" &&
          shop.translatedMessages[language] !== "";

        if (
          !hasTranslatedMessage &&
          typeof shop.message === "string" &&
          shop.message.trim() !== ""
        ) {
          aiArticleIdsNeedingMessageTranslation.push(
            article.id
          );
        }
      }
    }
  );

  if (legacyArticleIdsNeedingTranslation.length > 0) {
    const fetchKey =
      language +
      ":" +
      legacyArticleIdsNeedingTranslation
        .slice()
        .sort()
        .join(",");

    if (
      regionRecommendationLegacyTranslationFetchInFlightKey !==
      fetchKey
    ) {
      regionRecommendationLegacyTranslationFetchInFlightKey =
        fetchKey;

      fetchRegionRecommendationTranslations(
        legacyArticleIdsNeedingTranslation,
        language
      )
        .then(
          function(translationsByArticleId) {
            regionRecommendationLegacyTranslationFetchInFlightKey =
              null;

            if (!translationsByArticleId) {
              return;
            }

            let didUpdateAnyArticle =
              false;

            Object.keys(
              translationsByArticleId
            ).forEach(
              function(articleId) {
                const translation =
                  translationsByArticleId[articleId];

                if (
                  !translation ||
                  typeof translation.title !== "string" ||
                  typeof translation.content !== "string"
                ) {
                  return;
                }

                if (!regionRecommendationTranslationsCache[articleId]) {
                  regionRecommendationTranslationsCache[articleId] =
                    {};
                }

                regionRecommendationTranslationsCache[articleId][language] =
                  translation;

                didUpdateAnyArticle =
                  true;
              }
            );

            if (didUpdateAnyArticle) {
              // Phase Bの店舗カードと同じ考え方：再描画時にrender...()が
              // 末尾で再度この関数を呼ぶが、取得済みの記事は既に
              // キャッシュを持つため対象から外れ、無限ループにはならない。
              renderRegionRecommendationCards();
            }
          }
        )
        .catch(
          function(error) {
            regionRecommendationLegacyTranslationFetchInFlightKey =
              null;
          }
        );
    }
  }

  if (aiArticleIdsNeedingTitleTranslation.length > 0) {
    const fetchKey =
      language +
      ":" +
      aiArticleIdsNeedingTitleTranslation
        .slice()
        .sort()
        .join(",");

    if (
      regionRecommendationAiTitleTranslationFetchInFlightKey !==
      fetchKey
    ) {
      regionRecommendationAiTitleTranslationFetchInFlightKey =
        fetchKey;

      fetchShopTitleTranslations(
        aiArticleIdsNeedingTitleTranslation,
        language
      )
        .then(
          function(titleTranslationsByShopId) {
            regionRecommendationAiTitleTranslationFetchInFlightKey =
              null;

            if (!titleTranslationsByShopId) {
              return;
            }

            let didUpdateAnyShop =
              false;

            Object.keys(
              titleTranslationsByShopId
            ).forEach(
              function(firestoreId) {
                const shop =
                  shops.find(
                    function(candidateShop) {
                      return (
                        candidateShop.firestoreId ===
                        firestoreId
                      );
                    }
                  );

                if (!shop) {
                  return;
                }

                if (!shop.translatedTitles) {
                  shop.translatedTitles =
                    {};
                }

                shop.translatedTitles[language] =
                  titleTranslationsByShopId[firestoreId];

                didUpdateAnyShop =
                  true;
              }
            );

            if (didUpdateAnyShop) {
              renderRegionRecommendationCards();
            }
          }
        )
        .catch(
          function(error) {
            regionRecommendationAiTitleTranslationFetchInFlightKey =
              null;
          }
        );
    }
  }

  if (aiArticleIdsNeedingMessageTranslation.length > 0) {
    // Phase Bのshop.translatedMessagesをそのまま共有するため、Phase Bの
    // fetchShopTranslations()・shop.translatedMessages書き込みロジックを
    // そのまま再利用する(新しい翻訳経路・新しいキャッシュを作らない)。
    // Phase Bの店舗一覧側のin-flightガード(shopTranslationFetchInFlightKey)
    // とは別のガードを使うが、実際の重複翻訳防止はサーバー側のtransaction
    // lock(claimShopTranslationGeneration)が担うため、ここでの多重リクエスト
    // 自体は安全側(コストは発生しない)。
    fetchShopTranslations(
      aiArticleIdsNeedingMessageTranslation,
      language
    )
      .then(
        function(translationsByShopId) {
          if (!translationsByShopId) {
            return;
          }

          let didUpdateAnyShop =
            false;

          Object.keys(
            translationsByShopId
          ).forEach(
            function(firestoreId) {
              const shop =
                shops.find(
                  function(candidateShop) {
                    return (
                      candidateShop.firestoreId ===
                      firestoreId
                    );
                  }
                );

              if (!shop) {
                return;
              }

              if (!shop.translatedMessages) {
                shop.translatedMessages =
                  {};
              }

              shop.translatedMessages[language] =
                translationsByShopId[firestoreId];

              didUpdateAnyShop =
                true;
            }
          );

          if (didUpdateAnyShop) {
            renderRegionRecommendationCards();
          }
        }
      )
      .catch(
        function(error) {
          // 街の情報の翻訳は補助機能のため、失敗しても既存表示には
          // 一切影響させない。
        }
      );
  }
}

// 件数を含む「もっと見る」ボタン文言。既存の翻訳方式は固定文言のみを
// 対象とするため、件数部分だけは既存の管理画面(例：admin-post.html
// existingImageNote)と同じ「翻訳済みの地の文＋数値の連結」方式で組み立てる。
function buildRegionTodayInfoShowMoreLabel(
  totalCount,
  language
) {
  const baseLabel =
    getMachinauTranslation(
      "region_today_info_show_more",
      language
    );

  return language === "ja"
    ? baseLabel + "（" + totalCount + "件）"
    : baseLabel + " (" + totalCount + ")";
}

// findingのsourceが実際に安全なhttp/httpsのURLである場合だけリンクを
// 出す(既存のgetSafeWebsiteUrl()をそのまま再利用、javascript:/data:等の
// 危険schemeはこの時点で自動的に除外される)。URLではない文字列(情報源の
// 名称のみ等)の場合はリンクを出さない。
function buildRegionTodayInfoCardHtml(
  finding,
  language
) {
  const htmlParts =
    [
      '<article class="region-today-info-card">'
    ];

  if (
    typeof finding.area === "string" &&
    finding.area.trim() !== ""
  ) {
    htmlParts.push(
      '<div class="region-today-info-area">' +
        escapeHtml(finding.area) +
        "</div>"
    );
  }

  if (
    typeof finding.name === "string" &&
    finding.name.trim() !== ""
  ) {
    htmlParts.push(
      '<h3 class="region-today-info-name">' +
        escapeHtml(finding.name) +
        "</h3>"
    );
  }

  const metaValues =
    [
      finding.time,
      finding.place
    ].filter(
      function(value) {
        return (
          typeof value === "string" &&
          value.trim() !== ""
        );
      }
    );

  if (metaValues.length > 0) {
    htmlParts.push(
      '<div class="region-today-info-meta">' +
        escapeHtml(
          metaValues.join(" / ")
        ) +
        "</div>"
    );
  }

  if (
    typeof finding.description === "string" &&
    finding.description.trim() !== ""
  ) {
    htmlParts.push(
      '<p class="region-today-info-description">' +
        escapeHtml(finding.description) +
        "</p>"
    );
  }

  const sourceUrl =
    getSafeWebsiteUrl(
      finding.source
    );

  if (sourceUrl !== "") {
    const linkLabel =
      finding.isOfficial === true
        ? getMachinauTranslation(
            "region_today_info_official_link",
            language
          )
        : getMachinauTranslation(
            "region_today_info_detail_link",
            language
          );

    htmlParts.push(
      '<a class="region-today-info-source-link" href="' +
        escapeHtml(sourceUrl) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(linkLabel) +
        "</a>"
    );
  }

  htmlParts.push("</article>");

  return htmlParts.join("");
}

const REGION_TODAY_INFO_INITIAL_VISIBLE_COUNT =
  3;

function renderRegionTodayInfo() {
  const section =
    document.getElementById(
      "regionTodayInfoSection"
    );

  const loadingElement =
    document.getElementById(
      "regionTodayInfoLoading"
    );

  const listElement =
    document.getElementById(
      "regionTodayInfoList"
    );

  const toggleButton =
    document.getElementById(
      "regionTodayInfoToggleButton"
    );

  if (
    !section ||
    !loadingElement ||
    !listElement ||
    !toggleButton
  ) {
    return;
  }

  if (
    currentRegionTodayInfoStatus === "loading" ||
    currentRegionTodayInfoStatus === "generating"
  ) {
    section.style.display =
      "";

    loadingElement.style.display =
      "";

    listElement.innerHTML =
      "";

    toggleButton.style.display =
      "none";

    return;
  }

  if (currentRegionTodayInfoStatus !== "ready") {
    // null(未取得)・error等はセクションごと静かに非表示にする
    // (本部指示：TOP全体にエラー表示を出さない)。
    section.style.display =
      "none";

    loadingElement.style.display =
      "none";

    listElement.innerHTML =
      "";

    toggleButton.style.display =
      "none";

    return;
  }

  loadingElement.style.display =
    "none";

  const validFindings =
    currentRegionTodayInfoFindings.filter(
      function(finding) {
        return (
          finding &&
          finding.isDateValid === true
        );
      }
    );

  if (validFindings.length === 0) {
    section.style.display =
      "none";

    listElement.innerHTML =
      "";

    toggleButton.style.display =
      "none";

    return;
  }

  // finding.areaと現在地municipalityが完全一致する場合だけ先頭側へ
  // 優先する(本部指示：曖昧な文字列類似判定・距離推測は行わない、
  // 安定ソートで元の順序自体は保つ)。
  const matchedFindings =
    [];

  const otherFindings =
    [];

  validFindings.forEach(
    function(finding) {
      if (
        currentRegionTodayInfoMunicipality !== "" &&
        finding.area ===
          currentRegionTodayInfoMunicipality
      ) {
        matchedFindings.push(
          finding
        );
      } else {
        otherFindings.push(
          finding
        );
      }
    }
  );

  const orderedFindings =
    matchedFindings.concat(
      otherFindings
    );

  const visibleCount =
    isRegionTodayInfoExpanded
      ? orderedFindings.length
      : Math.min(
          REGION_TODAY_INFO_INITIAL_VISIBLE_COUNT,
          orderedFindings.length
        );

  const language =
    getCurrentMachinauLanguage();

  listElement.innerHTML =
    orderedFindings
      .slice(0, visibleCount)
      .map(
        function(finding) {
          return buildRegionTodayInfoCardHtml(
            finding,
            language
          );
        }
      )
      .join("");

  section.style.display =
    "";

  if (
    orderedFindings.length >
    REGION_TODAY_INFO_INITIAL_VISIBLE_COUNT
  ) {
    toggleButton.style.display =
      "";

    toggleButton.textContent =
      isRegionTodayInfoExpanded
        ? getMachinauTranslation(
            "region_today_info_show_less",
            language
          )
        : buildRegionTodayInfoShowMoreLabel(
            orderedFindings.length,
            language
          );
  } else {
    toggleButton.style.display =
      "none";
  }
}

function initializeRegionTodayInfoInteractions() {
  const toggleButton =
    document.getElementById(
      "regionTodayInfoToggleButton"
    );

  if (!toggleButton) {
    return;
  }

  toggleButton.addEventListener(
    "click",
    function() {
      isRegionTodayInfoExpanded =
        !isRegionTodayInfoExpanded;

      renderRegionTodayInfo();
    }
  );
}


// 初心回帰後の新トップ体験 Phase1｜街情報ボタン。マチナウが全情報を旅行者へ
// 押し付けず、興味を持った人だけが自分で開く入口。既存データを無理に
// 3分類(地域・役所/商業施設/観光施設)へ当てはめず、実際にaiSources.
// sourceTypeで確実に区別できる2分類(行政/観光施設)だけを採用した
// (商業施設に相当する既存フィールドは無いため今回は見送り)。対象は
// 街を見るAIが自動収集した情報(authorType:"ai")のみで、既存の
// getSuggestionAreaPriorityRank()による地域絞り込みも他の候補選定と統一する。
function selectAreaInfoBySourceType(
  targetSourceType
) {
  if (
    typeof userAreaName !== "string" ||
    userAreaName === ""
  ) {
    return [];
  }

  return shops
    .filter(
      function(shop) {
        return (
          shop.postType === "admin" &&
          shop.authorType === "ai" &&
          shop.sourceType === targetSourceType &&
          getSuggestionAreaPriorityRank(shop) <= 2
        );
      }
    )
    .sort(
      function(firstShop, secondShop) {
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
      }
    );
}


// 1分類ぶんのボタン+一覧を描画する。0件の場合はボタンごと非表示にする
// (情報が存在するように見せないため。既存regionRecommendationSection等の
// 「空なら非表示」という既存の慣習に合わせた)。戻り値はこの分類に表示する
//情報が1件以上あったかどうか。
function renderAreaInfoCategoryButton(
  buttonElementId,
  listElementId,
  targetSourceType
) {
  const button =
    document.getElementById(
      buttonElementId
    );

  const list =
    document.getElementById(
      listElementId
    );

  if (
    !button ||
    !list
  ) {
    return false;
  }

  const candidates =
    selectAreaInfoBySourceType(
      targetSourceType
    );

  if (candidates.length === 0) {
    button.style.display =
      "none";

    list.style.display =
      "none";

    list.innerHTML =
      "";

    return false;
  }

  button.style.display =
    "";

  // 現在地取得のたびに再判定するため、開閉状態は毎回閉じた状態へ戻す。
  list.style.display =
    "none";

  list.innerHTML =
    candidates
      .map(
        function(shop) {
          return (
            '<button type="button" class="awareness-notice-item" data-action="detail" data-firestore-id="' +
            escapeHtml(shop.firestoreId || "") +
            '">' +
            escapeHtml(shop.title || "") +
            "</button>"
          );
        }
      )
      .join("");

  return true;
}


// 街情報ボタン全体の描画。GPSで現在地取得・更新された時にだけ
// getLocation()から呼ばれる(awarenessNoticesと同じタイミング)。
function renderAreaInfoButtons() {
  const section =
    document.getElementById(
      "areaInfoSection"
    );

  if (!section) {
    return;
  }

  if (
    typeof userAreaName !== "string" ||
    userAreaName === ""
  ) {
    section.style.display =
      "none";

    return;
  }

  const hasRoleInfo =
    renderAreaInfoCategoryButton(
      "areaInfoRoleButton",
      "areaInfoRoleList",
      "行政"
    );

  const hasTourismInfo =
    renderAreaInfoCategoryButton(
      "areaInfoTourismButton",
      "areaInfoTourismList",
      "観光施設"
    );

  section.style.display =
    (hasRoleInfo || hasTourismInfo)
      ? ""
      : "none";
}


// トップ画面整理｜旧「近くの『今』」「気になることを聞く」の2枠を統合した
// 案内枠の表示制御。文言自体はdata-i18nの一括置換で言語切替に追従する
// (buildAwarenessNoticeText()のような動的組み立てが無いため、既存の
// renderAwarenessNotices()と違いswitchMachinauLanguage()側の再描画呼び出し
// は不要)。
// 広域region×localDate共有AI地域情報 Phase1 UI｜この帯は元々
// userAreaNameの有無だけで表示していたが、「下をチェック！」の主な誘導先が
// regionTodayInfo(今日、この地域で起きていること)になったため、
// regionTodayInfoが実際にready・かつ表示対象(isDateValid:trueの
// finding)が1件以上あるときだけ表示するよう条件を調整する(本部指示：
// 0件/error時に「届いているよ」と表示したままにしない)。文言自体は
// 変更しない。userAreaName確定直後(regionTodayInfo未確定)の初回呼び出しでは
// 非表示になるが、triggerRegionTodayInfo()側でregionTodayInfoが確定した
// 時点にも本関数を再度呼ぶため、確定後は正しく表示される。
function renderCityNowGuidance() {
  const section =
    document.getElementById(
      "cityNowGuidanceSection"
    );

  if (!section) {
    return;
  }

  const hasAreaName =
    typeof userAreaName === "string" &&
    userAreaName !== "";

  const hasReadyRegionTodayInfo =
    currentRegionTodayInfoStatus === "ready" &&
    Array.isArray(
      currentRegionTodayInfoFindings
    ) &&
    currentRegionTodayInfoFindings.some(
      function(finding) {
        return (
          finding &&
          finding.isDateValid === true
        );
      }
    );

  section.style.display =
    (
      hasAreaName &&
      hasReadyRegionTodayInfo
    )
      ? ""
      : "none";
}


// areaInfoButtonsContainerへのクリックをイベント委譲で処理する。
// カテゴリーボタン押下は対応する一覧の開閉のみ(新しい取得は発生しない、
// 既にrenderAreaInfoButtons()が組み立て済みのHTMLを表示/非表示にするだけ)。
// 一覧内の項目タップは既存openShopModal()による詳細表示のみで、
// AIチャットへは一切遷移させない。
function initializeAreaInfoInteractions() {
  const container =
    document.getElementById(
      "areaInfoButtonsContainer"
    );

  if (!container) {
    return;
  }

  container.addEventListener(
    "click",
    function(clickEvent) {
      const categoryButton =
        clickEvent.target.closest(
          ".area-info-category-button"
        );

      if (categoryButton) {
        const listId =
          categoryButton.getAttribute(
            "data-list-id"
          );

        const list =
          listId
            ? document.getElementById(listId)
            : null;

        if (list) {
          list.style.display =
            list.style.display === "none"
              ? ""
              : "none";
        }

        return;
      }

      const detailButton =
        clickEvent.target.closest(
          ".area-info-category-list .awareness-notice-item"
        );

      if (detailButton) {
        const firestoreId =
          detailButton.getAttribute(
            "data-firestore-id"
          );

        if (firestoreId) {
          openShopModal(
            firestoreId
          );
        }
      }
    }
  );
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


// 街の掲示板 Phase10｜全国対応の都道府県選択に使う47都道府県の固定配列。
// 全国約1,700自治体マスタは作らず、Firestoreにも保存しない、クライアント
// だけの小さな定数(本部指示)。OKINAWA_MUNICIPALITY_TO_REGION_NAME・
// buildRegionRecommendationAreaPickerHtml()は削除せず、掲示板の地域選択
// UIから使われなくなるだけ(既存Phase4と同じ考え方)。
const JAPAN_PREFECTURES =
  [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ];

// 街の掲示板 Phase10｜「ほかの地域を見る」の入口を、沖縄41市町村固定ボタン
// (buildRegionRecommendationAreaPickerHtml())から、都道府県選択＋市区町村
// 名入力の全国検索フォームへ差し替える。旅行者にlocality/sublocality_level_1
// 等のGoogle内部の行政レベルを意識させない、シンプルな2項目＋ボタンのみの
// 構成にする(本部指示)。
function buildCommunityBoardAreaSearchFormHtml() {
  const prefectureOptionsHtml =
    JAPAN_PREFECTURES
      .map(
        function(prefectureName) {
          return (
            '<option value="' +
            escapeHtml(prefectureName) +
            '">' +
            escapeHtml(prefectureName) +
            "</option>"
          );
        }
      )
      .join("");

  return (
    '<div class="community-board-area-search-field">' +
      '<label for="communityBoardPrefectureSelect" data-i18n="community_board_prefecture_label">都道府県</label>' +
      '<select id="communityBoardPrefectureSelect" class="community-board-area-search-select">' +
        '<option value="" data-i18n="community_board_prefecture_placeholder">選択してください</option>' +
        prefectureOptionsHtml +
      "</select>" +
    "</div>" +
    '<div class="community-board-area-search-field">' +
      '<label for="communityBoardAreaNameInput" data-i18n="community_board_area_name_label">市区町村</label>' +
      '<input type="text" id="communityBoardAreaNameInput" class="community-board-area-search-input" data-i18n-placeholder="community_board_area_name_placeholder" placeholder="例：渋谷区">' +
    "</div>" +
    '<button type="button" id="communityBoardAreaSearchButton" class="location-button" data-i18n="community_board_area_search_button">この街を見る</button>' +
    '<p id="communityBoardAreaSearchError" class="community-board-area-search-error" style="display:none;"></p>'
  );
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
  // 街の掲示板 Phase10｜沖縄41市町村固定ボタン(buildRegionRecommendation
  // AreaPickerHtml())の代わりに、全国対応の都道府県＋市区町村検索フォームを
  // 描画する。showRegionRecommendationsForArea()・regionRecommendations
  // コレクション・admin-region-picks.html・OKINAWA_MUNICIPALITY_TO_
  // REGION_NAME・buildRegionRecommendationAreaPickerHtml()自体は一切削除
  // せず残す(呼ばれなくなるだけ、本部指示)。
  regionRecommendationAreaPickerElement.innerHTML =
    buildCommunityBoardAreaSearchFormHtml();

  const communityBoardPrefectureSelectElement =
    document.getElementById(
      "communityBoardPrefectureSelect"
    );

  const communityBoardAreaNameInputElement =
    document.getElementById(
      "communityBoardAreaNameInput"
    );

  const communityBoardAreaSearchButtonElement =
    document.getElementById(
      "communityBoardAreaSearchButton"
    );

  const communityBoardAreaSearchErrorElement =
    document.getElementById(
      "communityBoardAreaSearchError"
    );

  function showCommunityBoardAreaSearchError() {
    if (!communityBoardAreaSearchErrorElement) {
      return;
    }

    communityBoardAreaSearchErrorElement.textContent =
      getMachinauTranslation(
        "community_board_area_search_error",
        getCurrentMachinauLanguage()
      );

    communityBoardAreaSearchErrorElement.style.display =
      "";
  }

  function hideCommunityBoardAreaSearchError() {
    if (!communityBoardAreaSearchErrorElement) {
      return;
    }

    communityBoardAreaSearchErrorElement.style.display =
      "none";
  }

  // 街の掲示板 Phase10 STEP9｜解決に失敗した場合は掲示板API・投稿APIへは
  // 一切進まず、検索フォームの下にエラー文言を表示するだけにする
  // (誤った街の掲示板を開かない、本部指示)。二重送信防止のため、
  // 実行中はボタンを無効化する(community-board-post.htmlの既存submit
  // ボタン無効化と同じ考え方)。
  async function handleCommunityBoardAreaSearchSubmit() {
    if (
      !communityBoardAreaSearchButtonElement ||
      communityBoardAreaSearchButtonElement.disabled
    ) {
      return;
    }

    hideCommunityBoardAreaSearchError();

    const selectedPrefectureName =
      communityBoardPrefectureSelectElement
        ? communityBoardPrefectureSelectElement.value
        : "";

    const enteredAreaName =
      communityBoardAreaNameInputElement
        ? communityBoardAreaNameInputElement.value.trim()
        : "";

    if (
      selectedPrefectureName === "" ||
      enteredAreaName === ""
    ) {
      showCommunityBoardAreaSearchError();
      return;
    }

    communityBoardAreaSearchButtonElement.disabled =
      true;

    const succeeded =
      await loadCommunityBoardForSelectedArea(
        selectedPrefectureName,
        enteredAreaName
      );

    communityBoardAreaSearchButtonElement.disabled =
      false;

    if (succeeded) {
      regionRecommendationAreaPickerElement.style.display =
        "none";
    } else {
      showCommunityBoardAreaSearchError();
    }
  }

  if (communityBoardAreaSearchButtonElement) {
    communityBoardAreaSearchButtonElement.addEventListener(
      "click",
      handleCommunityBoardAreaSearchSubmit
    );
  }

  if (communityBoardAreaNameInputElement) {
    communityBoardAreaNameInputElement.addEventListener(
      "keydown",
      function(event) {
        if (event.key === "Enter") {
          event.preventDefault();
          handleCommunityBoardAreaSearchSubmit();
        }
      }
    );
  }
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
      // 街の掲示板 Phase3｜「現在地のおすすめに戻る」は、現在地の主表示が
      // 掲示板へ切り替わったことに合わせて、直近に解決済みのgooglePlaceId等
      // (loadCommunityBoardForCurrentArea()が保持)を使って現在地の掲示板へ
      // 戻す。showRegionRecommendationsForArea()自体は変更しない。
      if (
        currentCommunityBoardGooglePlaceId !== ""
      ) {
        // loadCommunityBoardForCurrentArea()は内部でisManualSelection:false
        // を渡すため、「戻る」ボタン・投稿リンクの表示状態も正しく現在地
        // 表示用に戻る。
        loadCommunityBoardForCurrentArea(
          currentCommunityBoardGooglePlaceId,
          currentCommunityBoardCountryCode,
          currentCommunityBoardRegionName
        );
      } else if (
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


// TOPヒーロー緊急変更｜新ヒーローの4入口(#heroActionToday/#heroActionNearby/
// #heroActionArea/#heroActionReads)を、既存の各セクション・既存処理へ
// 接続する。新しい機能・新しいGPS/地域選択ロジックは一切作らず、
// 既存の該当要素をsmooth scrollまたはclick代理実行するだけの薄い配線。
// TOPヒーロー緊急変更｜「今日の沖縄」無反応バグの修正。
// #regionTodayInfoSectionは、GPS未取得・情報未取得・エラー時は
// style.display="none"のまま(renderRegionTodayInfo()の既存挙動、無変更)。
// そのため単純にscrollIntoView()するだけでは、非表示要素には何も
// スクロールが起きず「無反応」に見えていた(調査で確認した実際の原因)。
// 修正は「既にregionTodayInfoが表示可能ならそのままscroll、まだなら
// 既存#locationButtonの処理(GPS取得→triggerRegionTodayInfo())をそのまま
// 再利用して起動し、セクションが表示された時点で自動的にscrollする」の
// 2分岐にする。GPS取得ロジック・regionTodayInfo生成ロジックは一切
// 複製しない(既存要素のclick代理実行のみ)。
let heroActionTodayPendingObserver =
  null;

// regionTodayInfoSectionのstyle.display変化(renderRegionTodayInfo()が
// 既に行っている既存の表示切り替え)を監視するだけの薄いオブザーバー。
// 表示された瞬間に1回だけscrollし、自分自身を切断する。GPS許可待ちが
// 極端に長引く/情報が結局表示されない場合に備え、一定時間で監視を
// 打ち切る(タイムアウト時も新しいエラー表示は出さない、既存の
// 「エラーを大きく表示しない」方針に合わせる)。
function waitForRegionTodayInfoSectionAndScrollIntoView() {
  const targetSection =
    document.getElementById(
      "regionTodayInfoSection"
    );

  if (!targetSection) {
    return;
  }

  if (heroActionTodayPendingObserver) {
    heroActionTodayPendingObserver.disconnect();

    heroActionTodayPendingObserver =
      null;
  }

  const observer =
    new MutationObserver(
      function() {
        if (targetSection.style.display !== "none") {
          targetSection.scrollIntoView(
            {
              behavior: "smooth",
              block: "start"
            }
          );

          observer.disconnect();

          if (heroActionTodayPendingObserver === observer) {
            heroActionTodayPendingObserver =
              null;
          }
        }
      }
    );

  observer.observe(
    targetSection,
    {
      attributes: true,
      attributeFilter: ["style"]
    }
  );

  heroActionTodayPendingObserver =
    observer;

  window.setTimeout(
    function() {
      if (heroActionTodayPendingObserver === observer) {
        observer.disconnect();

        heroActionTodayPendingObserver =
          null;
      }
    },
    45000
  );
}

const heroActionTodayElement =
  document.getElementById(
    "heroActionToday"
  );

if (heroActionTodayElement) {
  heroActionTodayElement.addEventListener(
    "click",
    function() {
      const targetSection =
        document.getElementById(
          "regionTodayInfoSection"
        );

      if (!targetSection) {
        return;
      }

      if (targetSection.style.display !== "none") {
        // ①既にregionTodayInfoが表示可能(loading/generating/ready、
        // renderRegionTodayInfo()の既存状態管理をそのまま利用)。
        targetSection.scrollIntoView(
          {
            behavior: "smooth",
            block: "start"
          }
        );

        return;
      }

      // ②まだ表示可能になっていない(GPS未取得、または取得済みでも
      // 情報未取得/エラー)。既存#locationButtonのonclick
      // (ensureGoogleMapsLoaded(); getLocation())をそのまま起動する
      // (GPS取得ロジックの複製はしない)。取得中である旨は既存の
      // locationButton/locationMessageの表示切り替え(getLocation()が
      // 既に行っている)でユーザーに伝わる。
      const locationButtonElement =
        document.getElementById(
          "locationButton"
        );

      if (locationButtonElement) {
        locationButtonElement.scrollIntoView(
          {
            behavior: "smooth",
            block: "center"
          }
        );

        locationButtonElement.click();
      }

      // regionTodayInfoSectionが表示された時点(triggerRegionTodayInfo()の
      // 既存処理がstatusを更新し、renderRegionTodayInfo()が既存どおり
      // 表示を切り替えるタイミング)で自動的にそこへ移動する。
      waitForRegionTodayInfoSectionAndScrollIntoView();
    }
  );
}

const heroActionNearbyElement =
  document.getElementById(
    "heroActionNearby"
  );

if (heroActionNearbyElement) {
  heroActionNearbyElement.addEventListener(
    "click",
    function() {
      // 既存locationButtonのonclick(ensureGoogleMapsLoaded()＋
      // getLocation())をそのまま起動する。GPS取得ロジック自体は
      // 複製しない。
      const locationButtonElement =
        document.getElementById(
          "locationButton"
        );

      if (locationButtonElement) {
        locationButtonElement.scrollIntoView(
          {
            behavior: "smooth",
            block: "center"
          }
        );

        locationButtonElement.click();
      }
    }
  );
}

const heroActionAreaElement =
  document.getElementById(
    "heroActionArea"
  );

if (heroActionAreaElement) {
  heroActionAreaElement.addEventListener(
    "click",
    function() {
      const targetSection =
        document.getElementById(
          "regionRecommendationSection"
        );

      if (!targetSection) {
        return;
      }

      // TOPヒーロー緊急変更｜「エリアから探す」無反応バグの修正。
      // #regionRecommendationSectionはGPS未取得時style.display="none"の
      // ままで、その中にある#regionRecommendationOtherAreaButton／
      // 地域選択ピッカー(#regionRecommendationAreaPicker)も非表示領域内に
      // 埋もれて画面上どこにも現れず、クリックしても無反応だった
      // (調査で確認した実際の原因)。
      // showRegionRecommendationsForArea()自体はGPS(userLatitude等)に
      // 一切依存せず、areaName文字列とFirestore(window.machinauDb)だけで
      // 動く。地域選択ピッカーの各ボタンもページ読み込み時に
      // buildRegionRecommendationAreaPickerHtml()で既に描画済み(GPS非依存)。
      // 唯一の問題は親sectionが隠れていたことだけなので、GPSを起動せず、
      // このsection自体をここで可視化するだけにする(選択ロジック自体は
      // 複製しない)。renderRegionRecommendationCards()は次に実行された
      // 時点で改めてstyle.displayを実データに応じて設定し直すため、
      // ここでの一時的な可視化と競合しない。
      if (targetSection.style.display === "none") {
        targetSection.style.display =
          "";
      }

      targetSection.scrollIntoView(
        {
          behavior: "smooth",
          block: "start"
        }
      );

      // 既存の「ほかの地域を見る」トグル処理(表示/非表示の切替のみ)を
      // そのまま起動する。地域選択ロジック自体は複製しない。
      const otherAreaButtonElement =
        document.getElementById(
          "regionRecommendationOtherAreaButton"
        );

      if (otherAreaButtonElement) {
        otherAreaButtonElement.click();
      }
    }
  );
}

const heroActionReadsElement =
  document.getElementById(
    "heroActionReads"
  );

if (heroActionReadsElement) {
  heroActionReadsElement.addEventListener(
    "click",
    function() {
      const targetSection =
        document.getElementById(
          "columnEntrySection"
        );

      if (targetSection) {
        targetSection.scrollIntoView(
          {
            behavior: "smooth",
            block: "start"
          }
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