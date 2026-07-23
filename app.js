let shops = [];

let userLatitude = null;
let userLongitude = null;
let selectedCategory = "すべて";

const favoriteShopIds = new Set();

let currentModalImages = [];
let currentModalImageIndex = 0;
let modalTouchStartX = null;
let modalTouchEndX = null;
let modalSlideChanging = false;

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

    imageUrls:
      getSubmissionImageUrls(
        data
      ),

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

  renderShops();
}

function removeModalSlider() {
  const oldSlider =
    document.getElementById(
      "imamiruModalSlider"
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
    "imamiruModalSlider";

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
    "imamiruModalSlideImage";

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
    "imamiruModalImageCounter";

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
    "imamiruModalSliderDots";

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
      "imamiruModalPreviousButton";

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
      "imamiruModalNextButton";

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
      "imamiruModalSlideImage"
    );

  const counter =
    document.getElementById(
      "imamiruModalImageCounter"
    );

  const dotsContainer =
    document.getElementById(
      "imamiruModalSliderDots"
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
      "imamiruModalSlideImage"
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

  if (window.imamiruExpiryTimer) {
    window.clearTimeout(
      window.imamiruExpiryTimer
    );

    window.imamiruExpiryTimer =
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

      window.imamiruExpiryTimer =
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
  }
);