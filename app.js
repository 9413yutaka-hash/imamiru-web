let userLatitude = null;
let userLongitude = null;
let selectedCategory = "すべて";

let shops = [];

const favoriteShopIds = new Set();

const sampleShops = [
  {
    id: "sample-1",
    name: "沖縄そば イマミル食堂",
    category: "グルメ",
    categoryText: "沖縄料理・沖縄そば",
    emoji: "🍜",
    visualClass: "visual-food",
    rating: 4.8,
    status: "営業中",
    badge: "本日限定",
    message:
      "本日限定の三枚肉そばがあります。売り切れ次第終了です！",
    timeMessage:
      "⏰ 限定20食・なくなり次第終了",
    latitude: 26.2124,
    longitude: 127.6809
  },
  {
    id: "sample-2",
    name: "Cafe Blue Okinawa",
    category: "カフェ",
    categoryText: "カフェ・スイーツ",
    emoji: "🥭",
    visualClass: "visual-cafe",
    rating: 4.6,
    status: "営業中",
    badge: "旅人おすすめ",
    message:
      "沖縄県産マンゴーを使ったスムージーが、今日のおすすめです。",
    timeMessage:
      "🥭 本日のマンゴーがなくなり次第終了",
    latitude: 26.2167,
    longitude: 127.6873
  },
  {
    id: "sample-3",
    name: "島酒場 ゆんたく",
    category: "居酒屋",
    categoryText: "沖縄居酒屋",
    emoji: "🍺",
    visualClass: "visual-bar",
    rating: 4.9,
    status: "営業中",
    badge: "今夜開催",
    message:
      "19時から三線ライブを開催します。予約なしでも参加できます。",
    timeMessage:
      "🎵 三線ライブ 19:00スタート",
    latitude: 26.2078,
    longitude: 127.6765
  },
  {
    id: "sample-4",
    name: "国際通り 島唄ナイト",
    category: "イベント",
    categoryText: "音楽・文化イベント",
    emoji: "🎤",
    visualClass: "visual-event",
    rating: 4.7,
    status: "受付中",
    badge: "参加無料",
    message:
      "沖縄の島唄を気軽に楽しめる、旅行者向けのミニライブです。",
    timeMessage:
      "🌙 本日20:00から開催",
    latitude: 26.2149,
    longitude: 127.6842
  }
];

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
    degreesToRadians(latitude2 - latitude1);

  const longitudeDifference =
    degreesToRadians(longitude2 - longitude1);

  const firstLatitude =
    degreesToRadians(latitude1);

  const secondLatitude =
    degreesToRadians(latitude2);

  const calculation =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
    Math.cos(secondLatitude) *
    Math.sin(longitudeDifference / 2) ** 2;

  const angle =
    2 * Math.atan2(
      Math.sqrt(calculation),
      Math.sqrt(1 - calculation)
    );

  return earthRadiusKm * angle;
}

function formatDistance(distanceKm) {
  if (distanceKm === null) {
    return "距離を確認";
  }

  if (distanceKm < 1) {
    return Math.round(distanceKm * 1000) + "m";
  }

  return distanceKm.toFixed(1) + "km";
}

function estimateWalkingTime(distanceKm) {
  if (distanceKm === null) {
    return "徒歩時間";
  }

  const walkingMinutes =
    Math.max(
      1,
      Math.round(distanceKm / 0.08)
    );

  if (walkingMinutes >= 120) {
    return "車での移動推奨";
  }

  return "徒歩 約" + walkingMinutes + "分";
}

function createGoogleMapUrl(
  latitude,
  longitude
) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number"
  ) {
    return "https://www.google.com/maps";
  }

  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    latitude +
    "," +
    longitude
  );
}

function getCategoryAppearance(category) {
  const appearances = {
    グルメ: {
      categoryText: "グルメ・飲食店",
      emoji: "🍜",
      visualClass: "visual-food"
    },
    カフェ: {
      categoryText: "カフェ・スイーツ",
      emoji: "🥭",
      visualClass: "visual-cafe"
    },
    居酒屋: {
      categoryText: "居酒屋・ナイト",
      emoji: "🍺",
      visualClass: "visual-bar"
    },
    イベント: {
      categoryText: "イベント・体験",
      emoji: "🎤",
      visualClass: "visual-event"
    }
  };

  return appearances[category] || appearances.グルメ;
}

function convertAdvertisementToShop(
  documentId,
  advertisement
) {
  const category =
    advertisement.category || "グルメ";

  const appearance =
    getCategoryAppearance(category);

  const latitudeNumber =
    Number(advertisement.latitude);

  const longitudeNumber =
    Number(advertisement.longitude);

  return {
    id: documentId,

    name:
      advertisement.shopName ||
      advertisement.name ||
      "店舗名未設定",

    category: category,

    categoryText:
      advertisement.categoryText ||
      appearance.categoryText,

    emoji:
      advertisement.emoji ||
      appearance.emoji,

    visualClass:
      advertisement.visualClass ||
      appearance.visualClass,

    rating:
      Number(advertisement.rating) || 4.5,

    status:
      advertisement.status ||
      "掲載中",

    badge:
      advertisement.badge ||
      advertisement.title ||
      "新着情報",

    message:
      advertisement.content ||
      advertisement.message ||
      "詳しい情報は店舗へお問い合わせください。",

    timeMessage:
      advertisement.timeMessage ||
      advertisement.title ||
      "📢 最新情報を掲載中",

    latitude:
      Number.isFinite(latitudeNumber)
        ? latitudeNumber
        : 26.2124,

    longitude:
      Number.isFinite(longitudeNumber)
        ? longitudeNumber
        : 127.6809,

    createdAt:
      advertisement.createdAt || null
  };
}

function updateInformationCount() {
  const countElements =
    document.querySelectorAll(
      ".mini-info-value"
    );

  if (countElements.length >= 1) {
    countElements[0].textContent =
      shops.length + "件";
  }

  if (countElements.length >= 2) {
    countElements[1].textContent =
      shops.length + "件";
  }
}

function updateSampleNotice(message) {
  const notice =
    document.querySelector(
      ".sample-notice"
    );

  if (!notice) {
    return;
  }

  notice.textContent = message;
}

function showLoadingMessage() {
  const shopsList =
    document.getElementById("shopsList");

  if (!shopsList) {
    return;
  }

  shopsList.innerHTML = `
    <div class="sample-notice">
      Firebaseから最新情報を読み込んでいます…
    </div>
  `;
}

async function loadAdvertisementsFromFirestore() {
  showLoadingMessage();

  if (!window.imamiruDb) {
    console.warn(
      "Firebaseが利用できないため、サンプルデータを表示します。"
    );

    shops = [...sampleShops];

    updateInformationCount();

    updateSampleNotice(
      "Firebaseに接続できなかったため、現在はサンプル情報を表示しています。"
    );

    renderShops();

    return;
  }

  try {
    const querySnapshot =
      await window.imamiruDb
        .collection("advertisements")
        .get();

    const firestoreShops = [];

    querySnapshot.forEach(
      function(documentSnapshot) {
        const advertisement =
          documentSnapshot.data();

        firestoreShops.push(
          convertAdvertisementToShop(
            documentSnapshot.id,
            advertisement
          )
        );
      }
    );

    if (firestoreShops.length === 0) {
      shops = [...sampleShops];

      updateSampleNotice(
        "Firestoreに広告がないため、現在はサンプル情報を表示しています。"
      );
    } else {
      shops = firestoreShops;

      updateSampleNotice(
        "現在表示されている情報は、Firestoreから取得しています。"
      );
    }

    updateInformationCount();
    renderShops();

    console.log(
      "✅ Firestoreから広告を読み込みました:",
      firestoreShops.length + "件"
    );
  } catch (error) {
    console.error(
      "❌ Firestoreの広告読み込みに失敗しました",
      error
    );

    shops = [...sampleShops];

    updateInformationCount();

    updateSampleNotice(
      "Firestoreの読み込みに失敗したため、現在はサンプル情報を表示しています。"
    );

    renderShops();
  }
}

function getVisibleShops() {
  let visibleShops =
    shops.filter(function(shop) {
      return (
        selectedCategory === "すべて" ||
        shop.category === selectedCategory
      );
    });

  visibleShops =
    visibleShops.map(function(shop) {
      let distanceKm = null;

      if (
        userLatitude !== null &&
        userLongitude !== null
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
        distanceKm: distanceKm
      };
    });

  if (
    userLatitude !== null &&
    userLongitude !== null
  ) {
    visibleShops.sort(
      function(first, second) {
        return (
          first.distanceKm -
          second.distanceKm
        );
      }
    );
  }

  return visibleShops;
}

function renderShops() {
  const shopsList =
    document.getElementById("shopsList");

  if (!shopsList) {
    return;
  }

  const visibleShops =
    getVisibleShops();

  if (visibleShops.length === 0) {
    shopsList.innerHTML = `
      <div class="sample-notice">
        このカテゴリーの情報は、
        まだ登録されていません。
      </div>
    `;

    return;
  }

  shopsList.innerHTML =
    visibleShops.map(function(shop) {
      const mapUrl =
        createGoogleMapUrl(
          shop.latitude,
          shop.longitude
        );

      const isFavorite =
        favoriteShopIds.has(shop.id);

      const shopIdForHtml =
        encodeURIComponent(
          String(shop.id)
        );

      return `
        <article class="shop-card">

          <div class="shop-visual ${escapeHtml(shop.visualClass)}">

            <div class="shop-badges">

              <span class="event-badge">
                ⚡ ${escapeHtml(shop.badge)}
              </span>

              <button
                class="favorite-button ${
                  isFavorite ? "active" : ""
                }"
                type="button"
                aria-label="お気に入り"
                onclick="toggleFavorite('${shopIdForHtml}')"
              >
                ${
                  isFavorite ? "♥" : "♡"
                }
              </button>

            </div>

            <span class="shop-emoji">
              ${escapeHtml(shop.emoji)}
            </span>

          </div>

          <div class="shop-body">

            <div class="shop-category">
              <span>
                ${escapeHtml(shop.categoryText)}
              </span>

              <span class="open-status">
                ● ${escapeHtml(shop.status)}
              </span>
            </div>

            <h3 class="shop-name">
              ${escapeHtml(shop.name)}
            </h3>

            <p class="shop-description">
              ${escapeHtml(shop.message)}
            </p>

            <div class="shop-info-row">

              <span class="info-chip">
                ⭐ ${escapeHtml(shop.rating)}
              </span>

              <span class="info-chip">
                📍 ${formatDistance(shop.distanceKm)}
              </span>

              <span class="info-chip">
                🚶 ${estimateWalkingTime(shop.distanceKm)}
              </span>

            </div>

            <div class="time-limit">
              ${escapeHtml(shop.timeMessage)}
            </div>

            <div class="shop-actions">

              <button
                class="shop-button detail-button"
                type="button"
                onclick="openShopModal('${shopIdForHtml}')"
              >
                今の情報を見る
              </button>

              <a
                class="shop-button map-button"
                href="${mapUrl}"
                target="_blank"
                rel="noopener noreferrer"
              >
                📍 地図
              </a>

            </div>

          </div>
        </article>
      `;
    }).join("");
}

function selectCategory(
  category,
  button
) {
  selectedCategory = category;

  document
    .querySelectorAll(".category-button")
    .forEach(function(categoryButton) {
      categoryButton.classList.remove("active");
    });

  button.classList.add("active");

  renderShops();
}

function toggleFavorite(encodedShopId) {
  const shopId =
    decodeURIComponent(encodedShopId);

  if (favoriteShopIds.has(shopId)) {
    favoriteShopIds.delete(shopId);
  } else {
    favoriteShopIds.add(shopId);
  }

  renderShops();
}

function openShopModal(encodedShopId) {
  const shopId =
    decodeURIComponent(encodedShopId);

  const selectedShop =
    shops.find(function(shop) {
      return String(shop.id) === shopId;
    });

  if (!selectedShop) {
    return;
  }

  const modal =
    document.getElementById("shopModal");

  const modalVisual =
    document.getElementById("modalVisual");

  modalVisual.className =
    "modal-visual " +
    selectedShop.visualClass;

  document.getElementById(
    "modalEmoji"
  ).textContent =
    selectedShop.emoji;

  document.getElementById(
    "modalCategory"
  ).textContent =
    selectedShop.categoryText +
    "・" +
    selectedShop.status;

  document.getElementById(
    "modalTitle"
  ).textContent =
    selectedShop.name;

  document.getElementById(
    "modalMessage"
  ).innerHTML =
    "📢 " +
    escapeHtml(selectedShop.message) +
    "<br><br>" +
    escapeHtml(selectedShop.timeMessage);

  document.getElementById(
    "modalMapButton"
  ).href =
    createGoogleMapUrl(
      selectedShop.latitude,
      selectedShop.longitude
    );

  modal.classList.add("visible");

  document.body.style.overflow =
    "hidden";
}

function closeShopModal() {
  document
    .getElementById("shopModal")
    .classList.remove("visible");

  document.body.style.overflow = "";
}

function closeModalOutside(event) {
  if (event.target.id === "shopModal") {
    closeShopModal();
  }
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

  if (!navigator.geolocation) {
    locationMessage.textContent =
      "このブラウザでは位置情報を利用できません。";

    return;
  }

  locationButton.disabled = true;

  locationButton.textContent =
    "確認しています…";

  locationMessage.textContent =
    "GPSから現在地を取得しています。";

  navigator.geolocation.getCurrentPosition(
    function(position) {
      userLatitude =
        position.coords.latitude;

      userLongitude =
        position.coords.longitude;

      locationMessage.textContent =
        "現在地を取得しました。近い順に表示しています。";

      currentMapLink.href =
        createGoogleMapUrl(
          userLatitude,
          userLongitude
        );

      currentMapLink.style.display =
        "block";

      locationButton.disabled = false;

      locationButton.textContent =
        "現在地を更新";

      renderShops();
    },

    function(error) {
      let message =
        "位置情報を取得できませんでした。";

      if (error.code === 1) {
        message =
          "ブラウザで位置情報を許可してください。";
      }

      if (error.code === 2) {
        message =
          "現在地を確認できませんでした。";
      }

      if (error.code === 3) {
        message =
          "取得に時間がかかりました。もう一度お試しください。";
      }

      locationMessage.textContent =
        message;

      locationButton.disabled = false;

      locationButton.textContent =
        "もう一度試す";
    },

    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    }
  );
}

function scrollToShops() {
  document
    .getElementById("shopsSection")
    .scrollIntoView({
      behavior: "smooth"
    });
}

function scrollToTopPage() {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function showComingSoon() {
  alert(
    "マイページは今後追加予定です。"
  );
}

document.addEventListener(
  "keydown",
  function(event) {
    if (event.key === "Escape") {
      closeShopModal();
    }
  }
);

document.addEventListener(
  "DOMContentLoaded",
  function() {
    loadAdvertisementsFromFirestore();
  }
);