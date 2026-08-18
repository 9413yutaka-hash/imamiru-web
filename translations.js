// マチナウ Ver1.7｜固定UI文言専用の翻訳辞書(translations.js)
//
// このファイルが扱うのは画面の「固定UI文言」だけです。
// 店舗投稿・運営投稿・地域おすすめ等、Firestoreに保存された本文(title/content/
// shopName/area等)は絶対にここで扱いません。日本語を正本として、翻訳せず
// そのまま表示し続けます。
//
// category / area / sourceType / postType / authorType / selectedCategory
// といった内部判定用の値は、この辞書とは完全に別物であり、一切変更しません。
// このファイルはあくまで「画面に見せるラベル文字列」だけを言語別に保持します。
//
// 対応言語は現在 ja / en の2つです。将来 zh-TW / ko を追加する場合は、
// 各キーへ "zh-TW": "...", ko: "..." を追加するだけで拡張できる構造にしています
// (ロジック側の変更は不要です)。

const MACHINAU_TRANSLATIONS = {
  hero_heading: {
    ja: "今、沖縄で<br>何が起きているか。",
    en: "What's happening<br>in Okinawa right now."
  },

  location_heading: {
    ja: "あなたの現在地",
    en: "Your Location"
  },

  location_button_get: {
    ja: "現在地を取得",
    en: "Get Location"
  },

  location_button_update: {
    ja: "現在地を更新",
    en: "Update Location"
  },

  shops_heading: {
    ja: "今、近くで楽しめる場所",
    en: "Nearby Right Now"
  },

  shops_description: {
    ja: "気になるカテゴリーを選んでください。",
    en: "Choose a category to explore."
  },

  category_all: {
    ja: "すべて",
    en: "All"
  },

  category_favorite: {
    ja: "お気に入り",
    en: "Favorites"
  },

  category_gourmet: {
    ja: "グルメ",
    en: "Food"
  },

  category_cafe_sweets: {
    ja: "カフェ・スイーツ",
    en: "Cafe & Sweets"
  },

  category_shopping: {
    ja: "ショッピング",
    en: "Shopping"
  },

  category_event: {
    ja: "イベント",
    en: "Events"
  },

  category_sightseeing: {
    ja: "観光・体験",
    en: "Sightseeing"
  },

  category_nightlife: {
    ja: "ナイトスポット",
    en: "Nightlife"
  },

  category_beauty: {
    ja: "美容・リラクゼーション",
    en: "Beauty & Spa"
  },

  category_lodging: {
    ja: "宿泊",
    en: "Stay"
  },

  category_notice: {
    ja: "お知らせ",
    en: "Notice"
  },

  suggestion_heading: {
    ja: "✨ あなたへの提案",
    en: "✨ Suggested for You"
  },

  factual_heading: {
    ja: "⚡ 今、知っておきたいこと",
    en: "⚡ Good to Know"
  },

  today_machinau_heading: {
    ja: "🔥 今日のマチナウ",
    en: "🔥 Today's Machinau"
  },

  today_machinau_label: {
    ja: "運営情報",
    en: "Official"
  },

  detail_button: {
    ja: "この情報を見る",
    en: "View Details"
  },

  nav_home: {
    ja: "ホーム",
    en: "Home"
  },

  nav_find: {
    ja: "見つける",
    en: "Explore"
  },

  nav_location: {
    ja: "現在地",
    en: "Location"
  },

  nav_mypage: {
    ja: "マイページ",
    en: "My Page"
  }
};

// この配列に無い値は必ずMACHINAU_DEFAULT_LANGUAGEへフォールバックする。
const MACHINAU_SUPPORTED_LANGUAGES = ["ja", "en"];

const MACHINAU_DEFAULT_LANGUAGE = "ja";

// key未定義・その言語の訳が未定義の場合は必ずjaへフォールバックする(空表示を避ける)。
function getMachinauTranslation(key, language) {
  const entry = MACHINAU_TRANSLATIONS[key];

  if (!entry) {
    return "";
  }

  if (typeof entry[language] === "string") {
    return entry[language];
  }

  return entry[MACHINAU_DEFAULT_LANGUAGE] || "";
}
