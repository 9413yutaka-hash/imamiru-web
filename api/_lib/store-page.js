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
// 英語の表示(?lang=en)は画面の文言は英語、紹介文は保存済みの自動翻訳があればその訳(無ければ原文)、ストーリー・メニューは原文のため noindex、
// canonical は日本語のページ。キャッシュは共有リンクと同じく短い(60秒＋60秒)。
// このファイルは Vercel Function ではない(api/moderate-submission.js から呼ばれる)。
// ==========================================================================

import {
  PUBLIC_STORE_ID_PREFIX,
  STORE_WEEKDAY_CODES,
  readPublicStoreProfileForShare
} from "./store-profile.js";

import {
  computeStoreProfileDescriptionHash
} from "./store-profile-translation.js";

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
    headingInfo: "お店の情報",
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
    backToTop: "マチナウのトップへ",
    // 2026-11-08｜LP級の店舗ページ(ファーストビューの操作・今日の営業時間・写真・共有)
    quickNav: "このお店への操作",
    actionMap: "地図",
    actionCall: "電話",
    actionReserve: "予約",
    actionShare: "共有",
    today: "今日",
    todayHours: "今日の営業時間",
    headingPhotos: "写真",
    headingShare: "このページを共有",
    shareNote: "このページのURLです。LINE・SNS・QRコードで共有できます。",
    shareLine: "LINEで送る",
    shareX: "Xでポスト",
    photoAlt: "{NAME}の写真{N}",
    menuPhotoAlt: "{NAME}の写真",
    addressNote: "",
    translatedNote: ""
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
    headingInfo: "Shop information",
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
    backToTop: "Go to the Machinau top page",
    quickNav: "Actions for this shop",
    actionMap: "Map",
    actionCall: "Call",
    actionReserve: "Book",
    actionShare: "Share",
    today: "Today",
    todayHours: "Today's hours",
    headingPhotos: "Photos",
    headingShare: "Share this page",
    shareNote: "This is the page's URL. You can share it on LINE, social media or as a QR code.",
    shareLine: "Send on LINE",
    shareX: "Post on X",
    photoAlt: "Photo {N} of {NAME}",
    menuPhotoAlt: "Photo of {NAME}",
    // C案と同じ案内(TOP の shop_address_in_japanese_label と同じ文言)。住所は日本語のまま。
    addressNote: "Address (in Japanese)",
    // G案の保存済みの自動翻訳を出した時だけ添える。
    translatedNote: "Automatically translated from Japanese."
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

// 日本時間の今日の曜日(店舗ページの公開は日本の店舗だけ＝STORE_PUBLISH_COUNTRY_CODES)。
// ページは最大約2分キャッシュされるため、日付が変わった直後は前の日の表示が残ることがある。
const STORE_PAGE_WEEKDAY_BY_SHORT_NAME = { Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun" };

export function readStorePageTodayCode(nowMillis) {
  try {
    const shortName = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Tokyo" }).format(new Date(nowMillis));
    return STORE_PAGE_WEEKDAY_BY_SHORT_NAME[shortName] || "";
  } catch (error) {
    return "";
  }
}

function buildDayHoursText(businessHours, day, labels) {
  const ranges = Array.isArray(businessHours.weekly[day]) ? businessHours.weekly[day] : [];

  return ranges.length === 0
    ? labels.closed
    : ranges.map(function(range) {
      return isAllDay(range) ? labels.allday : range.open + "–" + range.close;
    }).join(" / ");
}

function buildHoursRowsHtml(businessHours, labels, todayCode) {
  if (!businessHours || !businessHours.weekly) {
    return "";
  }

  const rows = STORE_WEEKDAY_CODES.map(function(day) {
    const isToday = day === todayCode;

    return (
      "<tr" + (isToday ? " class=\"today\" aria-current=\"date\"" : "") + "><th scope=\"row\">" + escapeStorePageHtml(labels.day[day]) +
      (isToday ? " <span class=\"today-mark\">" + escapeStorePageHtml(labels.today) + "</span>" : "") +
      "</th><td>" + escapeStorePageHtml(buildDayHoursText(businessHours, day, labels)) + "</td></tr>"
    );
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

// 2026-11-08｜LP級の店舗ページ。写真が主役のファーストビュー(店名・種類・地域)、すぐ下に地図・電話・予約・共有の操作、
// 今日の営業時間、紹介、写真、ストーリー、メニュー、営業時間、アクセス、お店の情報、連絡先、共有の順。
// スクリプトは使わない(共有は URL の表示と LINE・X の共有の画面へのリンク)。色・角丸・影は TOP と同じ系統。
// 写真は Cloudinary の配信用の変換(TOP と同じ f_auto,q_auto,c_limit,w_)で必要な幅だけ読み込み、先頭の写真以外は遅延読み込み。
const STORE_PAGE_STYLE = `
    :root {
      color-scheme: light;
      --ink: #102a43; --sub: #52667a; --line: #e3eaf1; --surface: #ffffff; --ground: #f4f8fb;
      --brand: #0788c9; --brand-deep: #066fa6; --brand-soft: #e8f4fb; --accent: #ef7d3c; --ok: #127a46;
      --radius-card: 20px; --radius-inner: 16px; --radius-control: 14px;
      --shadow-card: 0 10px 30px rgba(16, 42, 67, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; color: var(--ink); background: var(--ground); line-height: 1.75; -webkit-text-size-adjust: 100%; }
    a { color: var(--brand); overflow-wrap: anywhere; }
    a:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
    header.site { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 6px max(16px, env(safe-area-inset-right)) 6px max(16px, env(safe-area-inset-left)); background: rgba(255, 255, 255, 0.94); border-bottom: 1px solid var(--line); backdrop-filter: blur(8px); }
    header.site a.brand { color: var(--brand); font-weight: 800; text-decoration: none; font-size: 18px; letter-spacing: 0.02em; }
    nav.lang { display: flex; gap: 4px; }
    nav.lang a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 10px; color: var(--sub); font-size: 14px; text-decoration: none; border-radius: 999px; }
    nav.lang a[aria-current="true"] { color: var(--ink); font-weight: 700; background: var(--brand-soft); }
    main { max-width: 760px; margin: 0 auto; padding: 0 16px 24px; }
    .hero { position: relative; margin: 0 -16px; aspect-ratio: 4 / 3; max-height: 70vh; overflow: hidden; background: linear-gradient(135deg, #cfe8f5, #8cc9e6); }
    .hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero::after { content: ""; position: absolute; inset: 40% 0 0 0; background: linear-gradient(to bottom, rgba(6, 22, 38, 0), rgba(6, 22, 38, 0.72)); }
    .hero .hero-text { position: absolute; left: 0; right: 0; bottom: 0; z-index: 1; padding: 0 20px 40px; color: #ffffff; }
    .hero.no-photo { aspect-ratio: auto; min-height: 200px; display: flex; align-items: flex-end; }
    .hero.no-photo::after { display: none; }
    .hero.no-photo .hero-text { position: relative; color: var(--ink); }
    .eyebrow { margin: 0 0 4px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; opacity: 0.95; }
    h1 { font-size: 28px; line-height: 1.3; margin: 0; overflow-wrap: anywhere; text-wrap: balance; }
    .hero:not(.no-photo) h1 { text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35); }
    nav.quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; margin: -22px 0 0; position: relative; z-index: 2; padding: 10px; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
    nav.quick a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 60px; padding: 6px 4px; border-radius: var(--radius-control); background: var(--brand-soft); color: var(--brand-deep); font-size: 13px; font-weight: 700; text-decoration: none; text-align: center; }
    nav.quick a svg { width: 22px; height: 22px; }
    nav.quick a.primary { background: var(--brand); color: #ffffff; }
    .today-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 16px 2px 0; font-size: 15px; }
    .today-line .label { color: var(--sub); font-size: 13px; font-weight: 700; }
    .today-line strong { font-variant-numeric: tabular-nums; }
    section.block { margin: 28px 0 0; }
    section.block > h2 { font-size: 19px; line-height: 1.4; margin: 0 0 12px; padding-left: 12px; border-left: 4px solid var(--brand); }
    .panel { background: var(--surface); border-radius: var(--radius-card); padding: 16px 18px; box-shadow: var(--shadow-card); }
    .lead { font-size: 16px; }
    .text { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
    .story { position: relative; padding: 18px 20px; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
    .story .text { font-size: 15px; }
    .note { color: var(--sub); font-size: 13px; margin: 10px 0 0; overflow-wrap: anywhere; }
    .gallery { display: flex; align-items: flex-start; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 0 -16px; padding: 0 16px 6px; -webkit-overflow-scrolling: touch; }
    .gallery img { flex: none; width: 78%; max-width: 440px; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--radius-inner); scroll-snap-align: start; background: #dfe7ef; display: block; }
    ul.menu { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    ul.menu li { display: flex; gap: 14px; padding: 12px; background: var(--surface); border-radius: var(--radius-inner); box-shadow: var(--shadow-card); }
    ul.menu img { width: 96px; height: 96px; object-fit: cover; border-radius: 12px; flex: none; background: #dfe7ef; }
    ul.menu .item { min-width: 0; flex: 1; }
    ul.menu .head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; }
    ul.menu .name { font-weight: 700; margin: 0; overflow-wrap: anywhere; }
    ul.menu .price { color: var(--accent); font-weight: 800; margin: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
    ul.menu .desc { margin: 4px 0 0; color: var(--sub); font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
    table.hours { border-collapse: collapse; width: 100%; font-size: 15px; font-variant-numeric: tabular-nums; }
    table.hours th { text-align: left; font-weight: 600; padding: 7px 12px 7px 8px; white-space: nowrap; width: 8.5em; }
    table.hours td { padding: 7px 8px 7px 0; }
    table.hours tr + tr th, table.hours tr + tr td { border-top: 1px solid var(--line); }
    table.hours tr.today { background: var(--brand-soft); font-weight: 700; }
    .today-mark { display: inline-block; margin-left: 4px; padding: 0 8px; border-radius: 999px; background: var(--brand); color: #ffffff; font-size: 11px; line-height: 1.8; vertical-align: 1px; }
    .address-note { display: block; color: var(--sub); font-size: 13px; font-weight: 700; }
    .button-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    a.button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 10px 18px; border-radius: var(--radius-control); font-weight: 700; text-decoration: none; background: var(--surface); color: var(--brand-deep); border: 1px solid #bfdcee; }
    a.button.primary { background: linear-gradient(135deg, var(--brand), #10a9d4); color: #ffffff; border: none; box-shadow: 0 8px 18px rgba(5, 144, 194, 0.18); }
    .facts { display: grid; gap: 16px; }
    .facts h3 { font-size: 14px; color: var(--sub); margin: 0 0 6px; }
    ul.tags { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    ul.tags li { background: var(--brand-soft); color: var(--ink); border-radius: 999px; padding: 4px 12px; font-size: 14px; }
    ul.contact { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    ul.contact li a { display: flex; flex-direction: column; justify-content: center; min-height: 52px; padding: 10px 16px; background: var(--surface); border: 1px solid #cfe3f2; border-radius: var(--radius-control); text-decoration: none; font-weight: 700; }
    ul.contact li .label { display: block; color: var(--sub); font-size: 12px; font-weight: 600; }
    .share-url { display: block; padding: 10px 12px; background: var(--ground); border-radius: 10px; font-size: 14px; overflow-wrap: anywhere; user-select: all; -webkit-user-select: all; }
    .actions { display: flex; flex-direction: column; gap: 8px; margin: 32px 0 8px; }
    .actions a { display: flex; align-items: center; justify-content: center; text-align: center; min-height: 52px; padding: 12px; border-radius: var(--radius-control); text-decoration: none; font-weight: 700; }
    .actions a.primary { background: linear-gradient(135deg, var(--brand), #10a9d4); color: #ffffff; }
    .actions a.secondary { background: #ffffff; color: var(--brand); border: 1px solid var(--brand); }
    footer.site { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; font-size: 13px; color: var(--sub); }
    footer.site a { display: inline-flex; align-items: center; min-height: 44px; margin-right: 14px; }
    @media (min-width: 701px) {
      main { padding: 20px 18px 32px; }
      .hero { margin: 0; border-radius: var(--radius-card); aspect-ratio: 16 / 9; }
      .hero .hero-text { padding: 0 28px 48px; }
      h1 { font-size: 34px; }
      nav.quick { margin: -26px 20px 0; }
      .gallery { margin: 0; padding: 0 0 6px; }
      .gallery img { width: 46%; }
      .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (prefers-reduced-motion: no-preference) {
      .gallery { scroll-behavior: smooth; }
    }
`;

// 操作のアイコン(装飾。文字のラベルを必ず並べる)。
const STORE_PAGE_ICONS = {
  map: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z\"/><circle cx=\"12\" cy=\"9.5\" r=\"2.5\"/></svg>",
  call: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z\"/></svg>",
  reserve: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4\"/></svg>",
  share: "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"18\" cy=\"5\" r=\"3\"/><circle cx=\"6\" cy=\"12\" r=\"3\"/><circle cx=\"18\" cy=\"19\" r=\"3\"/><path d=\"M8.6 13.5l6.8 4M15.4 6.5l-6.8 4\"/></svg>"
};

// TOP の buildOptimizedImageUrl と同じ変換(保存済みの URL は変えず、表示の URL だけ)。
function buildStorePageImageUrl(url, width) {
  const marker = "/image/upload/";
  const index = url.indexOf(marker);

  if (index === -1) {
    return url;
  }

  const position = index + marker.length;

  return url.slice(0, position) + "f_auto,q_auto,c_limit,w_" + width + "/" + url.slice(position);
}

function fillLabel(template, values) {
  return String(template).replace("{NAME}", values.name).replace("{N}", values.n);
}

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

// 英語の表示で使える紹介文の訳(G案で保存済み・今の原文と一致する時だけ。ここから翻訳は頼まない)。
function readStorePageTranslatedDescription(store, language) {
  const entry = store.descriptionTranslations && store.descriptionTranslations[language];
  const original = readText(store.description);

  if (!entry || original === "" || typeof entry.description !== "string" || readText(entry.description) === "") {
    return "";
  }

  return entry.sourceHash === computeStoreProfileDescriptionHash(original) ? readText(entry.description) : "";
}

function buildSectionHtml(heading, bodyHtml, id) {
  return (
    "<section class=\"block\"" + (id ? " id=\"" + id + "\"" : "") + "><h2>" + escapeStorePageHtml(heading) + "</h2>" + bodyHtml + "</section>"
  );
}

function buildTagListHtml(texts) {
  return "<ul class=\"tags\">" + texts.map(function(text) { return "<li>" + escapeStorePageHtml(text) + "</li>"; }).join("") + "</ul>";
}

// store：buildPublicStoreProfile の許可リストの形。custom：buildPublicStoreCustomProfile の形または null。
// options.nowMillis：今日の曜日の判定(試験用。省略時は今)。
export function buildStorePageHtml(storeId, store, custom, languageValue, options) {
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
  const todayCode = readStorePageTodayCode(options && Number.isFinite(options.nowMillis) ? options.nowMillis : Date.now());
  const contact = store.contact || {};
  const telHref = buildTelHref(contact.phone);
  const reservationUrl = isSafeExternalUrl(contact.reservationUrl) ? contact.reservationUrl : "";
  const hasCoordinates = typeof location.latitude === "number" && typeof location.longitude === "number";
  const mapUrl = hasCoordinates
    ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(location.latitude + "," + location.longitude)
    : "";
  const machinauUrl = "/?shop=" + encodeURIComponent(PUBLIC_STORE_ID_PREFIX + storeId);

  // ---- ファーストビュー：写真(1枚目)・種類と地域・店名 ----
  const eyebrow = categoryText + (areaText !== "" ? "・" + areaText : "");
  const heroHtml = photos.length > 0
    ? "<div class=\"hero\">" +
        "<img src=\"" + escapeStorePageHtml(buildStorePageImageUrl(photos[0], 1200)) + "\" alt=\"" + escapeStorePageHtml(fillLabel(labels.photoAlt, { name: name, n: 1 })) + "\" fetchpriority=\"high\" decoding=\"async\">" +
        "<div class=\"hero-text\"><p class=\"eyebrow\">" + escapeStorePageHtml(eyebrow) + "</p><h1>" + escapeStorePageHtml(name) + "</h1></div>" +
      "</div>"
    : "<div class=\"hero no-photo\"><div class=\"hero-text\"><p class=\"eyebrow\">" + escapeStorePageHtml(eyebrow) + "</p><h1>" + escapeStorePageHtml(name) + "</h1></div></div>";

  // ---- すぐ下の操作：地図・電話・予約・共有(登録がある項目だけ) ----
  const quick = [];

  if (mapUrl !== "") {
    quick.push("<a class=\"primary\" href=\"" + escapeStorePageHtml(mapUrl) + "\" target=\"_blank\" rel=\"noopener\" data-quick=\"map\">" + STORE_PAGE_ICONS.map + escapeStorePageHtml(labels.actionMap) + "</a>");
  }

  if (telHref !== "") {
    quick.push("<a href=\"" + escapeStorePageHtml(telHref) + "\" data-quick=\"phone\">" + STORE_PAGE_ICONS.call + escapeStorePageHtml(labels.actionCall) + "</a>");
  }

  if (reservationUrl !== "") {
    quick.push("<a href=\"" + escapeStorePageHtml(reservationUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer nofollow\" data-quick=\"reservation\">" + STORE_PAGE_ICONS.reserve + escapeStorePageHtml(labels.actionReserve) + "</a>");
  }

  quick.push("<a href=\"#share\" data-quick=\"share\">" + STORE_PAGE_ICONS.share + escapeStorePageHtml(labels.actionShare) + "</a>");

  const quickHtml = "<nav class=\"quick\" aria-label=\"" + escapeStorePageHtml(labels.quickNav) + "\">" + quick.join("") + "</nav>";

  const hasHours = !!(store.businessHours && store.businessHours.weekly);
  const todayHtml = hasHours && todayCode !== ""
    ? "<p class=\"today-line\"><span class=\"label\">" + escapeStorePageHtml(labels.todayHours) + "</span><strong>" + escapeStorePageHtml(buildDayHoursText(store.businessHours, todayCode, labels)) + "</strong></p>"
    : "";

  const sections = [];

  // ---- 紹介(英語の表示は保存済みの訳があれば訳、無ければ原文) ----
  const originalDescription = readText(store.description);

  if (originalDescription !== "") {
    const translated = language === "ja" ? "" : readStorePageTranslatedDescription(store, language);
    const bodyHtml = translated !== ""
      ? "<p class=\"text lead\">" + escapeStorePageHtml(translated) + "</p><p class=\"note\">" + escapeStorePageHtml(labels.translatedNote) + "</p>"
      : "<p class=\"text lead\"" + (language === "ja" ? "" : " lang=\"ja\"") + ">" + escapeStorePageHtml(originalDescription) + "</p>";

    sections.push(buildSectionHtml(labels.headingAbout, "<div class=\"panel\">" + bodyHtml + "</div>"));
  }

  // ---- 写真(2枚目以降。横に送って見る) ----
  if (photos.length > 1) {
    sections.push(buildSectionHtml(
      labels.headingPhotos,
      "<div class=\"gallery\">" + photos.slice(1).map(function(url, index) {
        return "<img src=\"" + escapeStorePageHtml(buildStorePageImageUrl(url, 900)) + "\" alt=\"" + escapeStorePageHtml(fillLabel(labels.photoAlt, { name: name, n: index + 2 })) + "\" loading=\"lazy\" decoding=\"async\">";
      }).join("") + "</div>"
    ));
  }

  const jaAttribute = language === "ja" ? "" : " lang=\"ja\"";

  if (custom && readText(custom.story) !== "") {
    sections.push(buildSectionHtml(
      labels.headingStory,
      "<div class=\"story\"><p class=\"text\"" + jaAttribute + ">" + escapeStorePageHtml(readText(custom.story)) + "</p></div>"
    ));
  }

  if (custom && Array.isArray(custom.menuItems) && custom.menuItems.length > 0) {
    sections.push(buildSectionHtml(
      labels.headingMenu,
      "<ul class=\"menu\"" + jaAttribute + ">" +
      custom.menuItems.map(function(item) {
        return (
          "<li>" +
            (isSafeImageUrl(item.photoUrl) ? "<img src=\"" + escapeStorePageHtml(buildStorePageImageUrl(item.photoUrl, 300)) + "\" alt=\"" + escapeStorePageHtml(fillLabel(labels.menuPhotoAlt, { name: item.name, n: "" })) + "\" loading=\"lazy\" decoding=\"async\">" : "") +
            "<div class=\"item\"><div class=\"head\"><p class=\"name\">" + escapeStorePageHtml(item.name) + "</p>" +
            (readText(item.priceText) !== "" ? "<p class=\"price\">" + escapeStorePageHtml(item.priceText) + "</p>" : "") + "</div>" +
            (readText(item.description) !== "" ? "<p class=\"desc\">" + escapeStorePageHtml(item.description) + "</p>" : "") +
            "</div>" +
          "</li>"
        );
      }).join("") +
      "</ul>"
    ));
  }

  const hoursHtml = buildHoursRowsHtml(store.businessHours, labels, todayCode);

  if (hoursHtml !== "") {
    sections.push(buildSectionHtml(
      labels.headingHours,
      "<div class=\"panel\">" + hoursHtml + "<p class=\"note\">" + escapeStorePageHtml(labels.hoursNotice) + "</p></div>"
    ));
  }

  // ---- 所在地(住所は日本語のまま。英語の表示は C案の案内を添える) ----
  const addressText = readText(location.formattedAddress) || areaText;
  sections.push(buildSectionHtml(
    labels.headingLocation,
    "<div class=\"panel\">" +
      (labels.addressNote !== "" ? "<span class=\"address-note\">" + escapeStorePageHtml(labels.addressNote) + "</span>" : "") +
      "<p class=\"text\"" + jaAttribute + ">" + escapeStorePageHtml(addressText) + "</p>" +
      (mapUrl !== "" ? "<div class=\"button-row\"><a class=\"button primary\" href=\"" + escapeStorePageHtml(mapUrl) + "\" target=\"_blank\" rel=\"noopener\">" + escapeStorePageHtml(labels.openMap) + "</a></div>" : "") +
    "</div>"
  ));

  // ---- お店の情報：支払い方法・設備・対応言語(登録がある項目だけ) ----
  const facts = [];
  const payments = (store.paymentMethodCodes || []).map(function(code) { return labels.payment[code]; }).filter(Boolean);
  const features = (store.featureCodes || []).map(function(code) { return labels.feature[code]; }).filter(Boolean);
  const languageNames = (contact.supportedLanguageCodes || []).map(function(code) { return readLanguageDisplayName(code, language); });

  if (payments.length > 0) {
    facts.push("<div><h3>" + escapeStorePageHtml(labels.headingPayment) + "</h3>" + buildTagListHtml(payments) + "</div>");
  }

  if (features.length > 0) {
    facts.push("<div><h3>" + escapeStorePageHtml(labels.headingFeatures) + "</h3>" + buildTagListHtml(features) + "</div>");
  }

  if (languageNames.length > 0) {
    facts.push("<div><h3>" + escapeStorePageHtml(labels.headingLanguages) + "</h3>" + buildTagListHtml(languageNames) + "</div>");
  }

  if (facts.length > 0) {
    sections.push(buildSectionHtml(labels.headingInfo, "<div class=\"panel facts\">" + facts.join("") + "</div>"));
  }

  // ---- 電話・予約・公式サイト・SNS・有料の追加リンク(登録がある項目だけ) ----
  const contactRows = [];

  if (telHref !== "") {
    contactRows.push(
      "<li><a href=\"" + escapeStorePageHtml(telHref) + "\" data-contact=\"phone\"><span class=\"label\">" + escapeStorePageHtml(labels.phone) + "</span>" + escapeStorePageHtml(readText(contact.phone)) + "</a></li>"
    );
  }

  if (reservationUrl !== "") {
    contactRows.push(
      "<li><a href=\"" + escapeStorePageHtml(reservationUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer nofollow\" data-contact=\"reservation\">" +
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

  // 有料の追加リンク(利用権限がある間だけ)。同じ見た目のボタンで並べる。
  if (custom && Array.isArray(custom.links)) {
    custom.links.forEach(function(link) {
      if (isSafeHttpsUrl(link.url)) {
        contactRows.push(
          "<li><a href=\"" + escapeStorePageHtml(link.url) + "\" target=\"_blank\" rel=\"noopener\" data-contact=\"link\"" + jaAttribute + ">" +
          escapeStorePageHtml(readText(link.label) || labels.linkType[link.type] || labels.linkType.other) + "</a></li>"
        );
      }
    });
  }

  if (contactRows.length > 0) {
    sections.push(buildSectionHtml(labels.headingContact, "<ul class=\"contact\">" + contactRows.join("") + "</ul>", "contact"));
  }

  // ---- 共有：固定の URL(選んでコピーできる)と LINE・X の共有の画面へのリンク ----
  const shareText = name + "｜" + SITE_NAME;
  sections.push(buildSectionHtml(
    labels.headingShare,
    "<div class=\"panel\"><p class=\"note\" style=\"margin-top:0\">" + escapeStorePageHtml(labels.shareNote) + "</p>" +
      "<code class=\"share-url\">" + escapeStorePageHtml(pageUrl) + "</code>" +
      "<div class=\"button-row\">" +
        "<a class=\"button\" href=\"https://social-plugins.line.me/lineit/share?url=" + escapeStorePageHtml(encodeURIComponent(pageUrl)) + "\" target=\"_blank\" rel=\"noopener noreferrer\" data-share=\"line\">" + escapeStorePageHtml(labels.shareLine) + "</a>" +
        "<a class=\"button\" href=\"https://twitter.com/intent/tweet?url=" + escapeStorePageHtml(encodeURIComponent(pageUrl)) + "&amp;text=" + escapeStorePageHtml(encodeURIComponent(shareText)) + "\" target=\"_blank\" rel=\"noopener noreferrer\" data-share=\"x\">" + escapeStorePageHtml(labels.shareX) + "</a>" +
      "</div></div>",
    "share"
  ));

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
  <meta name="theme-color" content="#0788c9">
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
    ${heroHtml}
    ${quickHtml}
    ${todayHtml}
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

  const store = await readPublicStoreProfileForShare(database, storeId, { includeContact: true, includeDescriptionTranslations: ["en"] });

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
