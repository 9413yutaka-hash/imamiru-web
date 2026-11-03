// ==========================================================================
// STEP 56｜店舗ごとの固定の公開ページ(月額100円の店舗カードの標準の店舗プロフィール)
// ==========================================================================
// 正式な URL：https://machinau.jp/shop/{storeId}
//   vercel.json の rewrite で GET mode=renderStorePage&storeId= がここへ届く(読み取りだけ)。
//   storeId は storeAccounts の文書 ID(登録・引き継ぎの時にサーバーが作る。店名・写真・紹介文を
//   変えても変わらない)。新規登録の店舗も、運営掲載を引き継いだ店舗も同じ形。
//   運営による無料掲載(submissions)にはこのページを作らない(無料掲載の表示は TOP の一覧・共有リンクのまま)。
//
// 表示してよい店舗・項目は、旅行者向けの一覧(publicStoreProfiles)と同じ：
//   公開中(status "published")で公開条件(月額100円の店舗カード契約・店主・写真・紹介文・審査・所在地など)を
//   すべて満たす店舗だけ。項目は store-profile.js の許可リスト(buildPublicStoreProfile)と、
//   利用権限がある店舗の有料の内容(store-custom-profile.js の buildPublicStoreCustomProfile)だけ。
//   STEP 57｜店主が公開用に入力した電話・予約先・SNS・対応言語(buildPublicStoreContact)も、このページだけに出す
//   (登録がある項目だけ。電話は tel: で発信、URL は http/https だけを新しいタブで開く)。
//   店主・契約・請求の情報と、店主が入力した住所の文字列は載せない(一覧と同じ)。
// それ以外(存在しない・下書き・非公開・契約なし・停止・退会)は、区別せず同じ 404 の終了表示
// (店舗の有無・状態を漏らさない。noindex)。
//
// 検索：公開中の店舗だけ index。title・description・canonical・OGP・構造化データ(LocalBusiness)を店舗ごとに出す。
// 英語の表示(?lang=en)は画面の文言だけ英語(店舗の文章は店主が書いたまま＝未翻訳)のため noindex、
// canonical は日本語のページ。キャッシュは共有リンクと同じく短い(60秒＋60秒)。
// このファイルは Vercel Function ではない(api/moderate-submission.js から呼ばれる)。
// ==========================================================================

import {
  PUBLIC_STORE_ID_PREFIX,
  STORE_WEEKDAY_CODES,
  readPublicStoreProfileForShare
} from "./store-profile.js";

export const STORE_PAGE_ORIGIN =
  "https://machinau.jp";

export const STORE_PAGE_PATH_PREFIX =
  "/shop/";

export const STORE_PAGE_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=60";

const STORE_PAGE_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

const STORE_PAGE_DESCRIPTION_LENGTH =
  120;

const STORE_PAGE_DEFAULT_IMAGE =
  "https://machinau.jp/icon-512.png?v=2";

const STORE_PAGE_IMAGE_PREFIX =
  "https://res.cloudinary.com/";

const SITE_NAME =
  "マチナウ";

// 画面の文言(translations.js の同じキーの文言と同じ。試験で一致を確かめる)。
export const STORE_PAGE_LABELS = {
  ja: {
    category: {
      gourmet: "グルメ",
      cafe_sweets: "カフェ・スイーツ",
      shopping: "ショッピング",
      sightseeing_experience: "観光・体験",
      nightlife: "ナイトスポット",
      beauty_relaxation: "美容・リラクゼーション",
      lodging: "宿泊",
      other: "その他"
    },
    day: {
      mon: "月曜日",
      tue: "火曜日",
      wed: "水曜日",
      thu: "木曜日",
      fri: "金曜日",
      sat: "土曜日",
      sun: "日曜日"
    },
    closed: "定休日",
    allday: "24時間",
    payment: {
      cash: "現金",
      card: "クレジットカード",
      qr: "QRコード決済"
    },
    feature: {
      parking: "駐車場あり",
      free_wifi: "無料Wi-Fi",
      power_outlets: "電源あり",
      wheelchair_accessible: "車いす対応",
      kid_friendly: "子ども連れ歓迎",
      pet_friendly: "ペット同伴可",
      dine_in: "店内飲食",
      takeout: "テイクアウト",
      delivery: "配送・デリバリー",
      store_pickup: "店頭受取",
      tax_free: "免税対応"
    },
    social: {
      instagram: "Instagram",
      x: "X",
      facebook: "Facebook",
      tiktok: "TikTok",
      youtube: "YouTube",
      threads: "Threads",
      line: "LINE",
      other: "その他のSNS"
    },
    linkType: {
      instagram: "Instagram",
      website: "公式サイト",
      reservation: "予約ページ",
      x: "X",
      facebook: "Facebook",
      tiktok: "TikTok",
      youtube: "YouTube",
      line: "LINE",
      other: "その他のリンク"
    },
    headingAbout: "お店・施設の紹介",
    headingLocation: "所在地",
    headingHours: "営業時間",
    headingPayment: "支払い方法",
    headingFeatures: "設備・サービス",
    headingStory: "こだわり・ストーリー",
    headingMenu: "メニュー・商品",
    headingLinks: "リンク",
    headingContact: "電話・予約・SNS",
    headingLanguages: "対応言語",
    phone: "電話番号",
    reservation: "予約ページ",
    website: "公式サイト",
    openMap: "地図で見る",
    openMachinau: "マチナウで近くの「今」を見る",
    hoursNotice: "営業時間・内容は変わることがあります。お出かけの前にお店・施設にご確認ください。",
    ownerNotice: "このページの情報は、お店・施設が登録・管理しています。",
    forOwners: "お店・施設の方へ",
    terms: "利用規約",
    privacy: "プライバシーポリシー",
    notFoundTitle: "このお店・施設のページは表示できません",
    notFoundBody: "ページが公開されていないか、掲載が終了しました。URLが正しいかもご確認ください。",
    unavailableTitle: "ただいま表示できません",
    unavailableBody: "時間をおいて、もう一度お試しください。",
    backToTop: "マチナウのトップへ"
  },
  en: {
    category: {
      gourmet: "Food & dining",
      cafe_sweets: "Cafés & sweets",
      shopping: "Shopping",
      sightseeing_experience: "Sightseeing & experiences",
      nightlife: "Nightlife",
      beauty_relaxation: "Beauty & relaxation",
      lodging: "Lodging",
      other: "Other"
    },
    day: {
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday",
      sun: "Sunday"
    },
    closed: "Closed",
    allday: "Open 24 hours",
    payment: {
      cash: "Cash",
      card: "Credit card",
      qr: "QR code payment"
    },
    feature: {
      parking: "Parking",
      free_wifi: "Free Wi-Fi",
      power_outlets: "Power outlets",
      wheelchair_accessible: "Wheelchair accessible",
      kid_friendly: "Kid-friendly",
      pet_friendly: "Pet-friendly",
      dine_in: "Dine-in",
      takeout: "Takeout",
      delivery: "Delivery",
      store_pickup: "In-store pickup",
      tax_free: "Tax-free shopping"
    },
    social: {
      instagram: "Instagram",
      x: "X",
      facebook: "Facebook",
      tiktok: "TikTok",
      youtube: "YouTube",
      threads: "Threads",
      line: "LINE",
      other: "Other social media"
    },
    linkType: {
      instagram: "Instagram",
      website: "Official website",
      reservation: "Booking",
      x: "X",
      facebook: "Facebook",
      tiktok: "TikTok",
      youtube: "YouTube",
      line: "LINE",
      other: "Other link"
    },
    headingAbout: "About",
    headingLocation: "Location",
    headingHours: "Opening hours",
    headingPayment: "Payment methods",
    headingFeatures: "Facilities & services",
    headingStory: "Our story",
    headingMenu: "Menu & products",
    headingLinks: "Links",
    headingContact: "Phone, booking & social media",
    headingLanguages: "Languages spoken",
    phone: "Phone number",
    reservation: "Reservation page",
    website: "Official website",
    openMap: "View on map",
    openMachinau: "See what's happening nearby on Machinau",
    hoursNotice: "Hours and details may change. Please check with the shop before you go.",
    ownerNotice: "The information on this page is registered and managed by the shop or facility.",
    forOwners: "For shops and facilities",
    terms: "Terms of Use",
    privacy: "Privacy Policy",
    notFoundTitle: "This page isn't available",
    notFoundBody: "The page isn't public or the listing has ended. Please also check that the URL is correct.",
    unavailableTitle: "This page can't be shown right now",
    unavailableBody: "Please try again later.",
    backToTop: "Go to the Machinau top page"
  }
};

function escapeStorePageHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isStorePageId(value) {
  return typeof value === "string" && STORE_PAGE_ID_PATTERN.test(value);
}

// 店舗の固定の公開 URL(店舗 ID だけから作る。店名・写真・紹介文は使わない)。
export function buildStorePageUrl(storeId) {
  return isStorePageId(storeId)
    ? STORE_PAGE_ORIGIN + STORE_PAGE_PATH_PREFIX + encodeURIComponent(storeId)
    : "";
}

function readStorePageLanguage(value) {
  return value === "en" ? "en" : "ja";
}

// 紹介の冒頭(改行・連続空白を1つにまとめ、120文字で切る)。
function buildStorePageDescription(text, fallback) {
  const normalized = readText(text).replace(/\s+/g, " ");
  const characters = Array.from(normalized);

  if (characters.length === 0) {
    return fallback;
  }

  return characters.length > STORE_PAGE_DESCRIPTION_LENGTH
    ? characters.slice(0, STORE_PAGE_DESCRIPTION_LENGTH).join("") + "…"
    : normalized;
}

function isSafeImageUrl(url) {
  return typeof url === "string" && url.indexOf(STORE_PAGE_IMAGE_PREFIX) === 0 && !/[\s"'<>]/.test(url);
}

function isSafeHttpsUrl(url) {
  if (typeof url !== "string" || /[\s"'<>]/.test(url)) {
    return false;
  }

  try {
    return new URL(url).protocol === "https:";
  } catch (error) {
    return false;
  }
}

// STEP 57｜店主が入力した外部の URL(公式サイト・予約先・SNS)。http/https だけ・認証情報なし・空白や引用符なし
// (保存の時の検証と同じ条件を、表示の前にもう一度確かめる。javascript: などは出さない)。
function isSafeExternalUrl(url) {
  if (typeof url !== "string" || url.length > 2000 || /[\s"'<>\\]/.test(url)) {
    return false;
  }

  try {
    const parsed = new URL(url);

    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.hostname.includes(".")
    );
  } catch (error) {
    return false;
  }
}

// 電話番号の発信用(tel:)。先頭の + と数字だけにする(9〜15桁でなければ発信のリンクにしない)。
function buildTelHref(phone) {
  const text = readText(phone);

  if (!/^\+?[0-9()\-\s]+$/.test(text)) {
    return "";
  }

  const digits = text.replace(/[^0-9]/g, "");

  return digits.length >= 9 && digits.length <= 15
    ? "tel:" + (text.charAt(0) === "+" ? "+" : "") + digits
    : "";
}

function readLanguageDisplayName(code, language) {
  try {
    const name = new Intl.DisplayNames([language], { type: "language" }).of(code);
    return name && name !== code ? name : code;
  } catch (error) {
    return code;
  }
}

function buildAreaText(location) {
  return [readText(location && location.prefecture), readText(location && location.city)].join("");
}

function isAllDay(range) {
  return range.open === "00:00" && range.close === "24:00";
}

function buildHoursRowsHtml(businessHours, labels) {
  if (!businessHours || !businessHours.weekly) {
    return "";
  }

  const rows = STORE_WEEKDAY_CODES.map(function(day) {
    const ranges = Array.isArray(businessHours.weekly[day]) ? businessHours.weekly[day] : [];
    const text = ranges.length === 0
      ? labels.closed
      : ranges.map(function(range) {
        return isAllDay(range) ? labels.allday : range.open + "–" + range.close;
      }).join(" / ");

    return "<tr><th scope=\"row\">" + escapeStorePageHtml(labels.day[day]) + "</th><td>" + escapeStorePageHtml(text) + "</td></tr>";
  });

  const note = readText(businessHours.note);

  return (
    "<table class=\"hours\">" + rows.join("") + "</table>" +
    (note !== "" ? "<p class=\"note\">" + escapeStorePageHtml(note) + "</p>" : "")
  );
}

// 構造化データ(schema.org の LocalBusiness)。表示している公開の項目だけを使う。
function buildStructuredData(store, custom, pageUrl) {
  const location = store.location || {};
  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: store.storeName,
    url: pageUrl
  };

  const description = readText(store.description);

  if (description !== "") {
    data.description = description;
  }

  const images = (store.photos || []).map(function(photo) { return photo.url; }).filter(isSafeImageUrl);

  if (images.length > 0) {
    data.image = images;
  }

  const address = { "@type": "PostalAddress" };

  if (readText(location.countryCode) !== "") {
    address.addressCountry = location.countryCode;
  }

  if (readText(location.prefecture) !== "") {
    address.addressRegion = location.prefecture;
  }

  if (readText(location.city) !== "") {
    address.addressLocality = location.city;
  }

  if (readText(location.formattedAddress) !== "") {
    address.streetAddress = location.formattedAddress;
  }

  data.address = address;

  if (typeof location.latitude === "number" && typeof location.longitude === "number") {
    data.geo = { "@type": "GeoCoordinates", latitude: location.latitude, longitude: location.longitude };
  }

  const dayNames = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  const hours = [];

  if (store.businessHours && store.businessHours.weekly) {
    STORE_WEEKDAY_CODES.forEach(function(day) {
      (store.businessHours.weekly[day] || []).forEach(function(range) {
        hours.push({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "https://schema.org/" + dayNames[day],
          opens: range.open,
          closes: range.close === "24:00" ? "23:59" : range.close
        });
      });
    });
  }

  if (hours.length > 0) {
    data.openingHoursSpecification = hours;
  }

  const contact = store.contact || {};
  const telHref = buildTelHref(contact.phone);

  if (telHref !== "") {
    data.telephone = telHref.slice(4);
  }

  const sameAs = [];

  if (isSafeHttpsUrl(store.websiteUrl)) {
    sameAs.push(store.websiteUrl);
  }

  (contact.socialLinks || []).forEach(function(link) {
    if (link && isSafeHttpsUrl(link.url) && !sameAs.includes(link.url)) {
      sameAs.push(link.url);
    }
  });

  if (sameAs.length > 0) {
    data.sameAs = sameAs;
  }

  // JSON を <script> に埋め込むため、"<" を文字参照にする(</script> で閉じられない)。
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const STORE_PAGE_STYLE = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif; color: #15233a; background: #f5f8fb; line-height: 1.7; }
    header.site { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #e2e8f0; }
    header.site a.brand { color: #0788c9; font-weight: 700; text-decoration: none; font-size: 18px; }
    nav.lang a { color: #15233a; font-size: 14px; margin-left: 10px; }
    nav.lang a[aria-current="true"] { font-weight: 700; text-decoration: none; }
    main { max-width: 760px; margin: 0 auto; padding: 16px; }
    .hero { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 14px; background: #dfe7ef; display: block; }
    .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-top: 8px; }
    .thumbs img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; display: block; }
    h1 { font-size: 24px; line-height: 1.4; margin: 16px 0 4px; overflow-wrap: anywhere; }
    .meta { color: #4a5a70; font-size: 14px; margin: 0 0 12px; }
    section.block { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin: 12px 0; }
    section.block h2 { font-size: 17px; margin: 0 0 8px; }
    .text { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
    table.hours { border-collapse: collapse; width: 100%; font-size: 15px; }
    table.hours th { text-align: left; font-weight: 600; padding: 4px 12px 4px 0; white-space: nowrap; width: 7em; }
    table.hours td { padding: 4px 0; }
    .note { color: #4a5a70; font-size: 14px; margin: 8px 0 0; overflow-wrap: anywhere; }
    ul.tags { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    ul.tags li { background: #eef5fb; border-radius: 999px; padding: 2px 12px; font-size: 14px; }
    ul.menu { list-style: none; padding: 0; margin: 0; }
    ul.menu li { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid #eef2f6; }
    ul.menu li:first-child { border-top: none; }
    ul.menu img { width: 88px; height: 88px; object-fit: cover; border-radius: 10px; flex: none; }
    ul.menu .name { font-weight: 700; margin: 0; overflow-wrap: anywhere; }
    ul.menu .price { color: #0b6b3a; margin: 0; }
    ul.menu .desc { margin: 2px 0 0; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
    ul.links { padding-left: 1.2em; margin: 0; }
    ul.contact { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    ul.contact li a { display: block; padding: 10px 14px; border: 1px solid #cfe3f2; border-radius: 12px; text-decoration: none; font-weight: 700; min-height: 44px; }
    ul.contact li .label { display: block; color: #4a5a70; font-size: 13px; margin-bottom: 2px; }
    a { color: #0788c9; overflow-wrap: anywhere; }
    .actions { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; }
    .actions a { display: block; text-align: center; padding: 12px; border-radius: 12px; text-decoration: none; font-weight: 700; }
    .actions a.primary { background: #0788c9; color: #ffffff; }
    .actions a.secondary { background: #ffffff; color: #0788c9; border: 1px solid #0788c9; }
    footer.site { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; font-size: 13px; color: #4a5a70; }
    footer.site a { margin-right: 12px; }
`;

function buildLanguageNavHtml(storeId, language) {
  const base = STORE_PAGE_PATH_PREFIX + encodeURIComponent(storeId);

  return (
    "<nav class=\"lang\" aria-label=\"Language\">" +
      "<a href=\"" + escapeStorePageHtml(base) + "\" hreflang=\"ja\" lang=\"ja\"" + (language === "ja" ? " aria-current=\"true\"" : "") + ">日本語</a>" +
      "<a href=\"" + escapeStorePageHtml(base + "?lang=en") + "\" hreflang=\"en\" lang=\"en\"" + (language === "en" ? " aria-current=\"true\"" : "") + ">English</a>" +
    "</nav>"
  );
}

function buildFooterHtml(labels) {
  return (
    "<footer class=\"site\">" +
      "<p>" + escapeStorePageHtml(labels.ownerNotice) + "</p>" +
      "<p><a href=\"/shop.html\">" + escapeStorePageHtml(labels.forOwners) + "</a>" +
      "<a href=\"/terms.html\">" + escapeStorePageHtml(labels.terms) + "</a>" +
      "<a href=\"/privacy.html\">" + escapeStorePageHtml(labels.privacy) + "</a></p>" +
    "</footer>"
  );
}

// store：buildPublicStoreProfile の許可リストの形。custom：buildPublicStoreCustomProfile の形または null。
export function buildStorePageHtml(storeId, store, custom, languageValue) {
  const language = readStorePageLanguage(languageValue);
  const labels = STORE_PAGE_LABELS[language];
  const pageUrl = buildStorePageUrl(storeId);
  const selfUrl = language === "en" ? pageUrl + "?lang=en" : pageUrl;
  const location = store.location || {};
  const areaText = buildAreaText(location);
  const categoryText = labels.category[store.categoryCode] || labels.category.other;
  const name = readText(store.storeName);
  const title = name + (areaText !== "" ? "（" + areaText + "）" : "") + "｜" + SITE_NAME;
  const fallbackDescription = name + (areaText !== "" ? "（" + areaText + "・" + categoryText + "）" : "（" + categoryText + "）");
  const description = buildStorePageDescription(store.description, fallbackDescription);
  const photos = (store.photos || []).map(function(photo) { return photo && photo.url; }).filter(isSafeImageUrl);
  const image = photos.length > 0 ? photos[0] : STORE_PAGE_DEFAULT_IMAGE;

  const sections = [];

  if (readText(store.description) !== "") {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingAbout) + "</h2>" +
      "<p class=\"text\">" + escapeStorePageHtml(readText(store.description)) + "</p></section>"
    );
  }

  if (custom && readText(custom.story) !== "") {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingStory) + "</h2>" +
      "<p class=\"text\">" + escapeStorePageHtml(readText(custom.story)) + "</p></section>"
    );
  }

  if (custom && Array.isArray(custom.menuItems) && custom.menuItems.length > 0) {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingMenu) + "</h2><ul class=\"menu\">" +
      custom.menuItems.map(function(item) {
        return (
          "<li>" +
            (isSafeImageUrl(item.photoUrl) ? "<img src=\"" + escapeStorePageHtml(item.photoUrl) + "\" alt=\"" + escapeStorePageHtml(item.name) + "\" loading=\"lazy\">" : "") +
            "<div><p class=\"name\">" + escapeStorePageHtml(item.name) + "</p>" +
            (readText(item.priceText) !== "" ? "<p class=\"price\">" + escapeStorePageHtml(item.priceText) + "</p>" : "") +
            (readText(item.description) !== "" ? "<p class=\"desc\">" + escapeStorePageHtml(item.description) + "</p>" : "") +
            "</div>" +
          "</li>"
        );
      }).join("") +
      "</ul></section>"
    );
  }

  const hoursHtml = buildHoursRowsHtml(store.businessHours, labels);

  if (hoursHtml !== "") {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingHours) + "</h2>" + hoursHtml +
      "<p class=\"note\">" + escapeStorePageHtml(labels.hoursNotice) + "</p></section>"
    );
  }

  const hasCoordinates = typeof location.latitude === "number" && typeof location.longitude === "number";
  const mapUrl = hasCoordinates
    ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(location.latitude + "," + location.longitude)
    : "";

  sections.push(
    "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingLocation) + "</h2>" +
    "<p class=\"text\">" + escapeStorePageHtml(readText(location.formattedAddress) || areaText) + "</p>" +
    (mapUrl !== "" ? "<p class=\"note\"><a href=\"" + escapeStorePageHtml(mapUrl) + "\" target=\"_blank\" rel=\"noopener\">" + escapeStorePageHtml(labels.openMap) + "</a></p>" : "") +
    "</section>"
  );

  const payments = (store.paymentMethodCodes || []).map(function(code) { return labels.payment[code]; }).filter(Boolean);

  if (payments.length > 0) {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingPayment) + "</h2><ul class=\"tags\">" +
      payments.map(function(text) { return "<li>" + escapeStorePageHtml(text) + "</li>"; }).join("") +
      "</ul></section>"
    );
  }

  const features = (store.featureCodes || []).map(function(code) { return labels.feature[code]; }).filter(Boolean);

  if (features.length > 0) {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingFeatures) + "</h2><ul class=\"tags\">" +
      features.map(function(text) { return "<li>" + escapeStorePageHtml(text) + "</li>"; }).join("") +
      "</ul></section>"
    );
  }

  // STEP 57｜電話・予約先・公式サイト・SNS(登録がある項目だけ)。
  const contact = store.contact || {};
  const contactRows = [];
  const telHref = buildTelHref(contact.phone);

  if (telHref !== "") {
    contactRows.push(
      "<li><span class=\"label\">" + escapeStorePageHtml(labels.phone) + "</span>" +
      "<a href=\"" + escapeStorePageHtml(telHref) + "\" data-contact=\"phone\">" + escapeStorePageHtml(readText(contact.phone)) + "</a></li>"
    );
  }

  if (isSafeExternalUrl(contact.reservationUrl)) {
    contactRows.push(
      "<li><a href=\"" + escapeStorePageHtml(contact.reservationUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer nofollow\" data-contact=\"reservation\">" +
      escapeStorePageHtml(labels.reservation) + "</a></li>"
    );
  }

  if (isSafeExternalUrl(store.websiteUrl)) {
    contactRows.push(
      "<li><a href=\"" + escapeStorePageHtml(store.websiteUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\" data-contact=\"website\">" +
      escapeStorePageHtml(labels.website) + "</a></li>"
    );
  }

  (contact.socialLinks || []).forEach(function(link) {
    if (link && isSafeExternalUrl(link.url)) {
      contactRows.push(
        "<li><a href=\"" + escapeStorePageHtml(link.url) + "\" target=\"_blank\" rel=\"noopener noreferrer nofollow\" data-contact=\"social\">" +
        escapeStorePageHtml(labels.social[link.type] || labels.social.other) + "</a></li>"
      );
    }
  });

  if (contactRows.length > 0) {
    sections.push(
      "<section class=\"block\" id=\"contact\"><h2>" + escapeStorePageHtml(labels.headingContact) + "</h2>" +
      "<ul class=\"contact\">" + contactRows.join("") + "</ul></section>"
    );
  }

  const languageNames = (contact.supportedLanguageCodes || []).map(function(code) {
    return readLanguageDisplayName(code, language);
  });

  if (languageNames.length > 0) {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingLanguages) + "</h2><ul class=\"tags\">" +
      languageNames.map(function(text) { return "<li>" + escapeStorePageHtml(text) + "</li>"; }).join("") +
      "</ul></section>"
    );
  }

  // 有料の追加リンク(利用権限がある間だけ)。公式サイトは上の連絡先に出す。
  const links = [];

  if (custom && Array.isArray(custom.links)) {
    custom.links.forEach(function(link) {
      if (isSafeHttpsUrl(link.url)) {
        links.push({ label: readText(link.label) || labels.linkType[link.type] || labels.linkType.other, url: link.url });
      }
    });
  }

  if (links.length > 0) {
    sections.push(
      "<section class=\"block\"><h2>" + escapeStorePageHtml(labels.headingLinks) + "</h2><ul class=\"links\">" +
      links.map(function(link) {
        return "<li><a href=\"" + escapeStorePageHtml(link.url) + "\" target=\"_blank\" rel=\"noopener\">" + escapeStorePageHtml(link.label) + "</a></li>";
      }).join("") +
      "</ul></section>"
    );
  }

  const photosHtml = photos.length > 0
    ? "<img class=\"hero\" src=\"" + escapeStorePageHtml(photos[0]) + "\" alt=\"" + escapeStorePageHtml(name) + "\">" +
      (photos.length > 1
        ? "<div class=\"thumbs\">" + photos.slice(1).map(function(url) {
          return "<img src=\"" + escapeStorePageHtml(url) + "\" alt=\"" + escapeStorePageHtml(name) + "\" loading=\"lazy\">";
        }).join("") + "</div>"
        : "")
    : "";

  const machinauUrl = "/?shop=" + encodeURIComponent(PUBLIC_STORE_ID_PREFIX + storeId);

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${language === "en" ? "<meta name=\"robots\" content=\"noindex\">" : ""}
  <title>${escapeStorePageHtml(title)}</title>
  <meta name="description" content="${escapeStorePageHtml(description)}">
  <link rel="canonical" href="${escapeStorePageHtml(pageUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="${language === "en" ? "en_US" : "ja_JP"}">
  <meta property="og:title" content="${escapeStorePageHtml(title)}">
  <meta property="og:description" content="${escapeStorePageHtml(description)}">
  <meta property="og:url" content="${escapeStorePageHtml(pageUrl)}">
  <meta property="og:image" content="${escapeStorePageHtml(image)}">
  <meta name="twitter:card" content="${photos.length > 0 ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeStorePageHtml(title)}">
  <meta name="twitter:description" content="${escapeStorePageHtml(description)}">
  <meta name="twitter:image" content="${escapeStorePageHtml(image)}">
  <link rel="icon" type="image/png" href="/favicon.png?v=2">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script type="application/ld+json">${buildStructuredData(store, custom, pageUrl)}</script>
  <style>${STORE_PAGE_STYLE}</style>
</head>
<body>
  <header class="site">
    <a class="brand" href="/">${SITE_NAME}</a>
    ${buildLanguageNavHtml(storeId, language)}
  </header>
  <main data-store-page="${escapeStorePageHtml(storeId)}" data-self-url="${escapeStorePageHtml(selfUrl)}">
    ${photosHtml}
    <h1>${escapeStorePageHtml(name)}</h1>
    <p class="meta">${escapeStorePageHtml(categoryText)}${areaText !== "" ? "・" + escapeStorePageHtml(areaText) : ""}</p>
    ${sections.join("\n    ")}
    <div class="actions">
      <a class="primary" href="${escapeStorePageHtml(machinauUrl)}">${escapeStorePageHtml(labels.openMachinau)}</a>
    </div>
  </main>
  ${buildFooterHtml(labels)}
</body>
</html>
`;
}

// 存在しない・非公開・退会済みなどの終了表示(区別しない)。kind "unavailable" は読み取りの失敗(一時的)。
export function buildStorePageEndHtml(languageValue, kind) {
  const language = readStorePageLanguage(languageValue);
  const labels = STORE_PAGE_LABELS[language];
  const heading = kind === "unavailable" ? labels.unavailableTitle : labels.notFoundTitle;
  const body = kind === "unavailable" ? labels.unavailableBody : labels.notFoundBody;

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${escapeStorePageHtml(heading)}｜${SITE_NAME}</title>
  <link rel="icon" type="image/png" href="/favicon.png?v=2">
  <style>${STORE_PAGE_STYLE}</style>
</head>
<body>
  <header class="site">
    <a class="brand" href="/">${SITE_NAME}</a>
  </header>
  <main>
    <section class="block">
      <h1>${escapeStorePageHtml(heading)}</h1>
      <p>${escapeStorePageHtml(body)}</p>
      <p><a href="/">${escapeStorePageHtml(labels.backToTop)}</a></p>
    </section>
  </main>
</body>
</html>
`;
}

// 1店舗を、旅行者向けの一覧と同じ条件で読む(公開中でなければ null)。有料の内容は利用権限がある時だけ。
export async function readPublicStorePage(database, storeId, deps) {
  if (!isStorePageId(storeId)) {
    return null;
  }

  const store = await readPublicStoreProfileForShare(database, storeId, { includeContact: true });

  if (!store) {
    return null;
  }

  let custom = null;

  if (deps && typeof deps.readPublicStoreCustomProfiles === "function") {
    try {
      const customByStore = await deps.readPublicStoreCustomProfiles(database, [storeId]);
      custom = customByStore.get(storeId) || null;
    } catch (customError) {
      // 有料の内容を読めない時も、店舗の基本の情報は表示する(一覧と同じ)。
      console.error("店舗ページ：カスタマイズの読み取りエラー：", customError && customError.message);
    }
  }

  return { store: store, custom: custom };
}

function sendStorePageEnd(response, status, language, kind) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", kind === "unavailable" ? "no-store" : STORE_PAGE_CACHE_CONTROL);
  response.setHeader("X-Robots-Tag", "noindex");

  return response.status(status).send(buildStorePageEndHtml(language, kind));
}

// GET mode=renderStorePage&storeId=&lang=
export async function handleRenderStorePage(request, response, deps) {
  const query = request.query || {};
  const storeId = typeof query.storeId === "string" ? query.storeId.trim() : "";
  const language = readStorePageLanguage(query.lang);

  // 共有リンクの形(sp_{storeId})で開かれた時は、正式な URL へ移す。
  if (storeId.indexOf(PUBLIC_STORE_ID_PREFIX) === 0 && isStorePageId(storeId.slice(PUBLIC_STORE_ID_PREFIX.length))) {
    const target = STORE_PAGE_PATH_PREFIX + encodeURIComponent(storeId.slice(PUBLIC_STORE_ID_PREFIX.length)) + (language === "en" ? "?lang=en" : "");

    response.setHeader("Location", target);
    response.setHeader("Cache-Control", STORE_PAGE_CACHE_CONTROL);
    return response.status(301).send("");
  }

  if (!isStorePageId(storeId)) {
    return sendStorePageEnd(response, 404, language, "not_found");
  }

  let page = null;

  try {
    page = await readPublicStorePage(deps.getFirestore(deps.getFirebaseAdminApp()), storeId, deps);
  } catch (error) {
    console.error("店舗ページ：読み取りエラー：", error && error.message);
    return sendStorePageEnd(response, 503, language, "unavailable");
  }

  if (!page) {
    return sendStorePageEnd(response, 404, language, "not_found");
  }

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", STORE_PAGE_CACHE_CONTROL);

  if (language === "en") {
    response.setHeader("X-Robots-Tag", "noindex");
  }

  return response.status(200).send(buildStorePageHtml(storeId, page.store, page.custom, language));
}

// sitemap 用：公開中の店舗ページの URL(旅行者向けの一覧と同じ判定)。
export function buildStorePageSitemapEntries(stores) {
  return (stores || [])
    .map(function(store) {
      const id = store && typeof store.id === "string" && store.id.indexOf(PUBLIC_STORE_ID_PREFIX) === 0
        ? store.id.slice(PUBLIC_STORE_ID_PREFIX.length)
        : "";

      return id !== "" ? { loc: buildStorePageUrl(id), lastmod: null } : null;
    })
    .filter(function(entry) { return !!entry && entry.loc !== ""; });
}
