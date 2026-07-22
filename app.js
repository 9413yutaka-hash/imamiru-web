let userLatitude = null;
    let userLongitude = null;
    let selectedCategory = "すべて";
    const favoriteShopIds = new Set();

    function escapeHtml(text) {
      return String(text)
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
      return (
        "https://www.google.com/maps/search/?api=1&query=" +
        latitude +
        "," +
        longitude
      );
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
        visibleShops.sort(function(first, second) {
          return (
            first.distanceKm -
            second.distanceKm
          );
        });
      }

      return visibleShops;
    }

    function renderShops() {
      const shopsList =
        document.getElementById("shopsList");

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

          return `
            <article class="shop-card">

              <div class="shop-visual ${shop.visualClass}">

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
                    onclick="toggleFavorite(${shop.id})"
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
                    ⭐ ${shop.rating}
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
                    onclick="openShopModal(${shop.id})"
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

    function toggleFavorite(shopId) {
      if (favoriteShopIds.has(shopId)) {
        favoriteShopIds.delete(shopId);
      } else {
        favoriteShopIds.add(shopId);
      }

      renderShops();
    }

    function openShopModal(shopId) {
      const selectedShop =
        shops.find(function(shop) {
          return shop.id === shopId;
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
      if (
        event.target.id === "shopModal"
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

    renderShops();
