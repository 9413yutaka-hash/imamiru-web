let userLatitude = null;
let userLongitude = null;
let selectedCategory = "すべて";

const favoriteShopIds = new Set();

/*
  data.jsで作られているshops配列へ、
  Firestoreの掲載中広告を入れ直します。
*/

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
    return "場所を確認中";
  }

  if (distanceKm < 1) {
    return (
      Math.round(distanceKm * 1000) +
      "m"
    );
  }

  return distanceKm.toFixed(1) + "km";
}

function estimateWalkingTime(
  distanceKm
) {
  if (
    distanceKm === null ||
    !Number.isFinite(distanceKm)
  ) {
    return "徒歩時間を確認";
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
  longitude
) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return (
      "https://www.google.com/maps/search/" +
      "?api=1&query=沖縄"
    );
  }

  return (
    "https://www.google.com/maps/search/" +
    "?api=1&query=" +
    latitude +
    "," +
    longitude
  );
}

function getCategoryDisplay(
  category
) {
  const settings = {
    グルメ: {
      categoryText:
        "グルメ・飲食店",
      emoji: "🍜",
      visualClass:
        "visual-food"
    },

    カフェ: {
      categoryText:
        "カフェ・スイーツ",
      emoji: "🥭",
      visualClass:
        "visual-cafe"
    },

    居酒屋: {
      categoryText:
        "居酒屋・夜の沖縄",
      emoji: "🍺",
      visualClass:
        "visual-bar"
    },

    イベント: {
      categoryText:
        "イベント・体験",
      emoji: "🎵",
      visualClass:
        "visual-event"
    }
  };

  return (
    settings[category] ||
    {
      categoryText:
        category || "沖縄情報",
      emoji: "🌺",
      visualClass:
        "visual-event"
    }
  );
}

function convertSubmissionToShop(
  documentSnapshot,
  index
) {
  const data =
    documentSnapshot.data();

  const categorySetting =
    getCategoryDisplay(
      data.category
    );

  /*
    現段階の投稿フォームには、
    緯度・経度の入力がありません。

    そのためVer1では那覇中心部を
    仮の位置として使います。
    後で住所・地図機能を追加します。
  */

  const defaultLatitude =
    26.2124;

  const defaultLongitude =
    127.6809;

  return {
    id: index + 1,

    firestoreId:
      documentSnapshot.id,

    name:
      data.shopName ||
      "店舗名未登録",

    category:
      data.category ||
      "グルメ",

    categoryText:
      categorySetting.categoryText,

    emoji:
      categorySetting.emoji,

    visualClass:
      categorySetting.visualClass,

    rating: "NEW",

    status: "掲載中",

    badge:
      data.title ||
      "今だけ情報",

    message:
      data.content ||
      "詳しい情報は店舗へご確認ください。",

    timeMessage:
      "⚡ イマミル掲載中",

    latitude:
      Number.isFinite(
        data.latitude
      )
        ? data.latitude
        : defaultLatitude,

    longitude:
      Number.isFinite(
        data.longitude
      )
        ? data.longitude
        : defaultLongitude,

    createdAt:
      data.createdAt || null
  };
}

function getVisibleShops() {
  let visibleShops =
    shops.filter(
      function(shop) {
        return (
          selectedCategory ===
            "すべて" ||
          shop.category ===
            selectedCategory
        );
      }
    );

  visibleShops =
    visibleShops.map(
      function(shop) {
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
        first,
        second
      ) {
        return (
          first.distanceKm -
          second.distanceKm
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
      Firebaseから掲載情報を
      読み込んでいます…
    </div>
  `;
}

function renderLoadError() {
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
    </div>
  `;
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

  if (
    visibleShops.length === 0
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
          const mapUrl =
            createGoogleMapUrl(
              shop.latitude,
              shop.longitude
            );

          const isFavorite =
            favoriteShopIds.has(
              shop.id
            );

          return `
            <article class="shop-card">

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
                        ${shop.id}
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

                <span class="shop-emoji">
                  ${escapeHtml(
                    shop.emoji
                  )}
                </span>

              </div>

              <div class="shop-body">

                <div class="shop-category">

                  <span>
                    ${escapeHtml(
                      shop.categoryText
                    )}
                  </span>

                  <span class="open-status">
                    ●
                    ${escapeHtml(
                      shop.status
                    )}
                  </span>

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
                    🆕 新着
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

                </div>

                <div class="time-limit">
                  ${escapeHtml(
                    shop.timeMessage
                  )}
                </div>

                <div class="shop-actions">

                  <button
                    class="
                      shop-button
                      detail-button
                    "
                    type="button"
                    onclick="
                      openShopModal(
                        ${shop.id}
                      )
                    "
                  >
                    今の情報を見る
                  </button>

                  <a
                    class="
                      shop-button
                      map-button
                    "
                    href="${mapUrl}"
                    target="_blank"
                    rel="
                      noopener
                      noreferrer
                    "
                  >
                    📍 地図
                  </a>

                </div>

              </div>

            </article>
          `;
        }
      )
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
          .remove("active");
      }
    );

  if (button) {
    button
      .classList
      .add("active");
  }

  renderShops();
}

function toggleFavorite(
  shopId
) {
  if (
    favoriteShopIds.has(
      shopId
    )
  ) {
    favoriteShopIds.delete(
      shopId
    );
  } else {
    favoriteShopIds.add(
      shopId
    );
  }

  renderShops();
}

function openShopModal(
  shopId
) {
  const selectedShop =
    shops.find(
      function(shop) {
        return (
          shop.id ===
          shopId
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

  if (
    !modal ||
    !modalVisual
  ) {
    return;
  }

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
    escapeHtml(
      selectedShop.message
    ) +
    "<br><br>" +
    escapeHtml(
      selectedShop.timeMessage
    );

  document.getElementById(
    "modalMapButton"
  ).href =
    createGoogleMapUrl(
      selectedShop.latitude,
      selectedShop.longitude
    );

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
            userLongitude
          );

        currentMapLink.style.display =
          "block";

        locationButton.disabled =
          false;

        locationButton.textContent =
          "現在地を更新";

        renderShops();
      },

      function(error) {
        let message =
          "位置情報を取得できませんでした。";

        if (
          error.code === 1
        ) {
          message =
            "ブラウザで位置情報を許可してください。";
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

function updateTopCounts(
  totalCount
) {
  const countElements =
    document.querySelectorAll(
      ".mini-info-value"
    );

  if (
    countElements.length >= 1
  ) {
    countElements[0]
      .textContent =
      totalCount + "件";
  }

  if (
    countElements.length >= 2
  ) {
    countElements[1]
      .textContent =
      totalCount + "件";
  }
}

async function loadApprovedSubmissions() {
  renderLoading();

  if (
    !window.imamiruDb
  ) {
    console.error(
      "Firestoreへ接続できません。"
    );

    renderLoadError();

    return;
  }

  try {
    const querySnapshot =
      await window.imamiruDb
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

    querySnapshot.forEach(
      function(
        documentSnapshot
      ) {
        approvedShops.push(
          convertSubmissionToShop(
            documentSnapshot,
            approvedShops.length
          )
        );
      }
    );

    approvedShops.sort(
      function(
        first,
        second
      ) {
        const firstTime =
          first.createdAt &&
          typeof first
            .createdAt
            .toMillis ===
            "function"
            ? first
                .createdAt
                .toMillis()
            : 0;

        const secondTime =
          second.createdAt &&
          typeof second
            .createdAt
            .toMillis ===
            "function"
            ? second
                .createdAt
                .toMillis()
            : 0;

        return (
          secondTime -
          firstTime
        );
      }
    );

    /*
      data.jsで作られた配列を
      Firestoreの掲載中データへ
     丸ごと入れ替えます。
    */

    shops.splice(
      0,
      shops.length,
      ...approvedShops
    );

    updateTopCounts(
      shops.length
    );

    renderShops();

    console.log(
      "✅ Firestoreから掲載中の広告を読み込みました：" +
      shops.length +
      "件"
    );
  } catch (error) {
    console.error(
      "❌ 掲載中の広告を読み込めませんでした",
      error
    );

    renderLoadError();
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
  }
);

document.addEventListener(
  "DOMContentLoaded",
  function() {
    loadApprovedSubmissions();
  }
);