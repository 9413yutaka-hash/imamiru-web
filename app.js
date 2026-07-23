let shops = [];

let userLatitude = null;
let userLongitude = null;
let selectedCategory = "すべて";

const favoriteShopIds = new Set();

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
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return (
      "https://www.google.com/maps/search/" +
      "?api=1&query=" +
      encodeURIComponent(
        latitude +
        "," +
        longitude
      )
    );
  }

  const searchText =
    address ||
    shopName ||
    "沖縄";

  return (
    "https://www.google.com/maps/search/" +
    "?api=1&query=" +
    encodeURIComponent(
      searchText
    )
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
        "居酒屋・夜の沖縄",

      emoji:
        "🍺",

      visualClass:
        "visual-bar"
    },

    イベント: {
      categoryText:
        "イベント・体験",

      emoji:
        "🎵",

      visualClass:
        "visual-event"
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
      "⚡ イマミル掲載中"
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

    createdAt:
      data.createdAt ||
      data.submittedAt ||
      data.updatedAt ||
      null
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
            <br><small>
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

  renderShops();
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

  modalVisual.className =
    "modal-visual " +
    selectedShop.visualClass;

  modalEmoji.textContent =
    selectedShop.emoji;

  modalCategory.textContent =
    selectedShop.categoryText +
    "・" +
    selectedShop.status;

  modalTitle.textContent =
    selectedShop.name;

  let modalText =
    "📢 " +
    escapeHtml(
      selectedShop.message
    );

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

  modalMessage.innerHTML =
    modalText;

  modalMapButton.href =
    createGoogleMapUrl(
      selectedShop.latitude,
      selectedShop.longitude,
      selectedShop.address,
      selectedShop.name
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
    behavior:
      "smooth"
  });
}

function scrollToTopPage() {
  window.scrollTo({
    top:
      0,

    behavior:
      "smooth"
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
      totalCount +
      "件";
  }

  if (
    countElements.length >= 2
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
          window.imamiruDb
        ) {
          resolve(
            window.imamiruDb
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
      "✅ 掲載中の広告を読み込みました：" +
      shops.length +
      "件"
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
  }
);

document.addEventListener(
  "DOMContentLoaded",
  function() {
    hideSampleNotice();

    loadApprovedSubmissions();
  }
);