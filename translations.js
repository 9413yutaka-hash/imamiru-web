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

  hero_kicker: {
    ja: "沖縄の「今」をリアルタイム配信",
    en: "Live updates on Okinawa, right now"
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

  suggestion_placeholder_main: {
    ja: "このあと、どうする？",
    en: "What should you do next?"
  },

  suggestion_placeholder_message: {
    ja: "現在地を取得すると、今いる場所・天気・周辺の「今」から、あなたに合った行き先を提案します。",
    en: "Share your location and Machinau will suggest what to do next based on where you are, the weather, and what's happening nearby."
  },

  suggestion_placeholder_cta: {
    ja: "現在地から提案してもらう",
    en: "Get a suggestion near me"
  },

  suggestion_ai_loading: {
    ja: "AIが今のあなたに合う提案を考えています…",
    en: "Machinau AI is finding a suggestion for you…"
  },

  suggestion_no_candidates_message: {
    ja: "今は近くに提案できる情報を見つけられませんでした。\n新しい情報が入り次第、ここから提案します。",
    en: "We couldn't find anything nearby to suggest right now.\nWe'll share a suggestion here as soon as new information comes in."
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
  },

  brand_caption: {
    ja: "リアルタイム観光コンシェルジュ",
    en: "Real-time Okinawa Travel Guide"
  },

  live_chip_label: {
    ja: "今を配信中",
    en: "Live Now"
  },

  hero_description: {
    ja: "近くのお店、今日だけのイベント、旅先の<span class=\"hero-description-emphasis\">偶然の寄り道</span>。 今の沖縄が、ひと目でわかる。",
    en: "Nearby shops, one-day-only events, and <span class=\"hero-description-emphasis\">happy detours</span> along the way — Okinawa's \"right now,\" at a glance."
  },

  location_message_initial: {
    ja: "現在地を取得すると、近い順に表示します。",
    en: "Get your location to see what's nearby first."
  },

  location_permission_toggle_show: {
    ja: "位置情報を許可する方法を見る",
    en: "How to enable location access"
  },

  location_permission_device_pc_label: {
    ja: "💻 パソコン",
    en: "💻 Computer"
  },

  location_permission_iphone_safari_method1_title: {
    ja: "方法1：マチナウを開いたまま変更する",
    en: "Method 1: Change settings without closing Machinau"
  },

  location_permission_iphone_safari_method1_step1: {
    ja: "① Safariで<strong>マチナウを開いたまま</strong>にします",
    en: "① Keep <strong>Machinau open</strong> in Safari"
  },

  location_permission_iphone_safari_method1_step2: {
    ja: "② アドレスバー付近にある<strong>ページメニューのボタン</strong>を押します",
    en: "② Tap the <strong>page menu button</strong> near the address bar"
  },

  location_permission_iphone_safari_method1_step3: {
    ja: "③ <strong>「Webサイトの設定」</strong>に進みます",
    en: "③ Go to <strong>\"Website Settings\"</strong>"
  },

  location_permission_iphone_safari_method1_step4: {
    ja: "④ <strong>「位置情報」</strong>を押します",
    en: "④ Tap <strong>\"Location\"</strong>"
  },

  location_permission_iphone_safari_method1_step5: {
    ja: "⑤ <strong>「許可」</strong>を選びます",
    en: "⑤ Select <strong>\"Allow\"</strong>"
  },

  location_permission_iphone_safari_method1_step6: {
    ja: "⑥ マチナウの画面へ戻ります",
    en: "⑥ Return to the Machinau screen"
  },

  location_permission_iphone_safari_method1_step7: {
    ja: "⑦ <strong>「もう一度試す」</strong>を押します",
    en: "⑦ Tap <strong>\"Try Again\"</strong>"
  },

  location_permission_iphone_safari_method1_note: {
    ja: "※iOSのバージョンにより、「…」などの追加操作が入る場合があります",
    en: "※ Depending on your iOS version, you may see an extra step such as tapping \"…\""
  },

  location_permission_iphone_safari_method2_title: {
    ja: "それでも取得できない場合<br>方法2：iPhone本体の設定を確認",
    en: "Still not working?<br>Method 2: Check your iPhone's settings"
  },

  location_permission_iphone_safari_method2_step1: {
    ja: "① iPhoneの<strong>「設定」</strong>を開きます",
    en: "① Open <strong>\"Settings\"</strong> on your iPhone"
  },

  location_permission_iphone_safari_method2_step2: {
    ja: "② <strong>「プライバシーとセキュリティ」</strong>を押します",
    en: "② Tap <strong>\"Privacy & Security\"</strong>"
  },

  location_permission_iphone_safari_method2_step3: {
    ja: "③ <strong>「位置情報サービス」</strong>を押します",
    en: "③ Tap <strong>\"Location Services\"</strong>"
  },

  location_permission_iphone_safari_method2_step4: {
    ja: "④ 画面上部の<strong>「位置情報サービス」がON</strong>になっているか確認します",
    en: "④ Check that <strong>\"Location Services\" is ON</strong> at the top of the screen"
  },

  location_permission_iphone_safari_method2_step5: {
    ja: "⑤ Safariに関係する位置情報設定を確認します",
    en: "⑤ Check the location setting for Safari"
  },

  location_permission_iphone_safari_method2_step6: {
    ja: "⑥ 位置情報を利用できる設定に変更します",
    en: "⑥ Change it to allow location access"
  },

  location_permission_iphone_safari_method2_step7: {
    ja: "⑦ マチナウへ戻ります",
    en: "⑦ Return to Machinau"
  },

  location_permission_iphone_safari_method2_step8: {
    ja: "⑧ <strong>「もう一度試す」</strong>を押します",
    en: "⑧ Tap <strong>\"Try Again\"</strong>"
  },

  location_permission_iphone_safari_method2_note: {
    ja: "※iOSのバージョンにより、ボタン名や表示位置が少し異なる場合があります。",
    en: "※ Button names and positions may vary slightly depending on your iOS version."
  },

  location_permission_iphone_chrome_step1: {
    ja: "① iPhoneの<strong>「設定」</strong>を開きます",
    en: "① Open <strong>\"Settings\"</strong> on your iPhone"
  },

  location_permission_iphone_chrome_step2: {
    ja: "② 下へスクロールして<strong>「Chrome」</strong>を探して押します",
    en: "② Scroll down and tap <strong>\"Chrome\"</strong>"
  },

  location_permission_iphone_chrome_step3: {
    ja: "③ <strong>「位置情報」</strong>を押します",
    en: "③ Tap <strong>\"Location\"</strong>"
  },

  location_permission_iphone_chrome_step4: {
    ja: "④ 位置情報を許可する設定を選びます",
    en: "④ Select the setting that allows location access"
  },

  location_permission_iphone_chrome_step5: {
    ja: "⑤ マチナウへ戻ります",
    en: "⑤ Return to Machinau"
  },

  location_permission_iphone_chrome_step6: {
    ja: "⑥ <strong>「もう一度試す」</strong>を押します",
    en: "⑥ Tap <strong>\"Try Again\"</strong>"
  },

  location_permission_iphone_chrome_note: {
    ja: "※「位置情報」が表示されない場合は、iPhone本体の『設定 → プライバシーとセキュリティ → 位置情報サービス』も確認してください",
    en: "※ If you don't see \"Location,\" also check Settings → Privacy & Security → Location Services on your iPhone"
  },

  location_permission_android_step1: {
    ja: "① Chromeで<strong>マチナウを開いたまま</strong>にします",
    en: "① Keep <strong>Machinau open</strong> in Chrome"
  },

  location_permission_android_step2: {
    ja: "② アドレスバー左側の<strong>サイト情報アイコン</strong>を押します",
    en: "② Tap the <strong>site info icon</strong> on the left of the address bar"
  },

  location_permission_android_step3: {
    ja: "③ <strong>「権限」</strong>を押します",
    en: "③ Tap <strong>\"Permissions\"</strong>"
  },

  location_permission_android_step4: {
    ja: "④ <strong>「位置情報」</strong>を押します",
    en: "④ Tap <strong>\"Location\"</strong>"
  },

  location_permission_android_step5: {
    ja: "⑤ <strong>「許可」</strong>へ変更します",
    en: "⑤ Change it to <strong>\"Allow\"</strong>"
  },

  location_permission_android_step6: {
    ja: "⑥ マチナウへ戻ります",
    en: "⑥ Return to Machinau"
  },

  location_permission_android_step7: {
    ja: "⑦ <strong>「もう一度試す」</strong>を押します",
    en: "⑦ Tap <strong>\"Try Again\"</strong>"
  },

  location_permission_android_note1: {
    ja: "※端末やChromeのバージョンによって、鍵マーク・調整アイコン・サイト情報など、アイコンや名称が異なる場合があります。",
    en: "※ Depending on your device and Chrome version, the icon may appear as a lock mark, sliders icon, or \"Site info\" instead."
  },

  location_permission_android_note2: {
    ja: "それでも直らない場合は、Chromeの<strong>︙ → 設定 → サイトの設定 → 位置情報</strong>から確認する方法もあります。",
    en: "If that doesn't help, you can also check via Chrome's <strong>︙ → Settings → Site settings → Location</strong>."
  },

  location_permission_pc_step1: {
    ja: "① Chromeで<strong>マチナウを開いたまま</strong>にします",
    en: "① Keep <strong>Machinau open</strong> in Chrome"
  },

  location_permission_pc_step2: {
    ja: "② アドレスバー左側の<strong>サイト情報アイコン</strong>をクリックします",
    en: "② Click the <strong>site info icon</strong> on the left of the address bar"
  },

  location_permission_pc_step3: {
    ja: "③ <strong>「サイトの設定」</strong>をクリックします",
    en: "③ Click <strong>\"Site settings\"</strong>"
  },

  location_permission_pc_step4: {
    ja: "④ <strong>「位置情報」</strong>を探します",
    en: "④ Find <strong>\"Location\"</strong>"
  },

  location_permission_pc_step5: {
    ja: "⑤ <strong>「許可」</strong>へ変更します",
    en: "⑤ Change it to <strong>\"Allow\"</strong>"
  },

  location_permission_pc_step6: {
    ja: "⑥ マチナウの画面へ戻ります",
    en: "⑥ Return to the Machinau screen"
  },

  location_permission_pc_step7: {
    ja: "⑦ 必要であればページを再読み込みします",
    en: "⑦ Reload the page if needed"
  },

  location_permission_pc_step8: {
    ja: "⑧ <strong>「もう一度試す」</strong>を押します",
    en: "⑧ Click <strong>\"Try Again\"</strong>"
  },

  location_permission_pc_note1: {
    ja: "それでも直らない場合は、Chromeの<strong>︙ → 設定 → プライバシーとセキュリティ → サイトの設定 → 位置情報</strong>も確認してください。",
    en: "If that doesn't help, also check via Chrome's <strong>︙ → Settings → Privacy and security → Site settings → Location</strong>."
  },

  location_permission_pc_note2: {
    ja: "Windows / Mac本体の位置情報がOFFの場合は、ブラウザ側だけでは取得できない場合があるため、パソコン本体の位置情報設定も確認してください。",
    en: "If location is turned off in your Windows or Mac system settings, the browser alone can't access it — please check your computer's system-level location settings too."
  },

  location_permission_guide_footer: {
    ja: "設定を変更したら、この画面に戻って「もう一度試す」を押してください。",
    en: "After changing the setting, come back to this screen and tap \"Try Again.\""
  },

  shops_current_location_order: {
    ja: "現在地順",
    en: "Sorted by Distance"
  },

  shops_loading: {
    ja: "掲載中の情報を読み込んでいます…",
    en: "Loading listings…"
  },

  more_button: {
    ja: "もっと見る",
    en: "Show More"
  },

  mypage_heading: {
    ja: "👤 マイページ",
    en: "👤 My Page"
  },

  mypage_description: {
    ja: "お気に入りに登録した情報を確認できます。",
    en: "See the places and info you've saved."
  },

  mypage_favorite_empty: {
    ja: "まだお気に入りはありません。",
    en: "You haven't saved any favorites yet."
  },

  mypage_favorite_list_button: {
    ja: "❤️ お気に入り一覧",
    en: "❤️ View Favorites"
  },

  map_heading: {
    ja: "📍 今いる場所の近くを地図で見る",
    en: "📍 See What's Nearby on the Map"
  },

  toilet_search_button: {
    ja: "🚻 近くのトイレを探す",
    en: "🚻 Find Nearby Restrooms"
  },

  current_map_link: {
    ja: "🗺️ 現在地をGoogleマップで開く",
    en: "🗺️ Open Current Location in Google Maps"
  },

  region_recommendation_heading_default: {
    ja: "📍 この地域のおすすめ",
    en: "📍 Recommended in This Area"
  },

  region_recommendation_other_area_button: {
    ja: "ほかの地域を見る",
    en: "See Other Areas"
  },

  region_recommendation_back_to_current_button: {
    ja: "現在地のおすすめに戻る",
    en: "Back to Current Area"
  },

  modal_close_aria_label: {
    ja: "閉じる",
    en: "Close"
  },

  modal_category_placeholder: {
    ja: "沖縄の今",
    en: "Okinawa Now"
  },

  modal_title_placeholder: {
    ja: "店舗名",
    en: "Shop Name"
  },

  modal_message_placeholder: {
    ja: "店舗情報",
    en: "Shop Info"
  },

  modal_map_button: {
    ja: "📍 Googleマップで場所を見る",
    en: "📍 View Location on Google Maps"
  },

  footer_tagline: {
    ja: "今、何が起きているかを見つけよう。",
    en: "Discover what's happening right now."
  },

  footer_terms_link: {
    ja: "利用規約",
    en: "Terms of Service"
  },

  footer_privacy_link: {
    ja: "プライバシーポリシー",
    en: "Privacy Policy"
  },

  footer_contact_link: {
    ja: "お問い合わせ",
    en: "Contact Us"
  },

  footer_shop_entry_link: {
    ja: "お店・施設の方へ｜今の情報を掲載する",
    en: "For shops & venues: Post your latest info"
  },

  location_geolocation_unsupported: {
    ja: "このブラウザでは位置情報を利用できません。",
    en: "This browser doesn't support location access."
  },

  weather_location_naha: {
    ja: "那覇の天気",
    en: "Naha Weather"
  },

  weather_location_current: {
    ja: "現在地の天気",
    en: "Current Location Weather"
  },

  location_button_checking: {
    ja: "確認しています…",
    en: "Checking…"
  },

  location_message_fetching: {
    ja: "GPSから現在地を取得しています。",
    en: "Getting your location via GPS…"
  },

  location_message_success: {
    ja: "現在地を取得しました。近い順に表示しています。",
    en: "Location found. Showing nearby spots first."
  },

  location_error_generic: {
    ja: "位置情報を取得できませんでした。",
    en: "Couldn't get your location."
  },

  location_error_permission_denied_guide: {
    ja: "① ブラウザの位置情報を「許可」に変更してください。\n② この画面に戻って「もう一度試す」を押してください。",
    en: "① Change your browser's location setting to \"Allow.\"\n② Come back to this screen and tap \"Try Again.\""
  },

  location_error_position_unavailable: {
    ja: "現在地を確認できませんでした。",
    en: "Couldn't determine your location."
  },

  location_error_timeout: {
    ja: "取得に時間がかかりました。もう一度お試しください。",
    en: "It's taking too long. Please try again."
  },

  location_button_retry: {
    ja: "もう一度試す",
    en: "Try Again"
  },

  weather_advice_heat: {
    ja: "🌡 こまめな水分補給を",
    en: "🌡 Stay hydrated"
  },

  weather_advice_uv: {
    ja: "☀️ 紫外線対策を",
    en: "☀️ Watch out for strong UV"
  },

  weather_advice_rain: {
    ja: "☂ 傘があると安心",
    en: "☂ Bring an umbrella"
  },

  weather_advice_wind: {
    ja: "🌬 強風に注意",
    en: "🌬 Watch for strong wind"
  },

  weather_feels_like_prefix: {
    ja: "体感 ",
    en: "Feels like "
  },

  weather_rain_chance_prefix: {
    ja: "☂ 降水",
    en: "☂ Rain "
  },

  shop_status_open: {
    ja: "営業中",
    en: "Open"
  },

  shop_status_listed: {
    ja: "掲載中",
    en: "Listed"
  },

  shop_status_closed: {
    ja: "営業時間外",
    en: "Closed"
  },

  shop_expiry_new: {
    ja: "🆕 新着",
    en: "🆕 New"
  },

  shop_expiry_minutes_left: {
    ja: "⚡ あと{N}分",
    en: "⚡ {N} min left"
  },

  shop_expiry_today_only: {
    ja: "🔥 今日だけ",
    en: "🔥 Today Only"
  },

  shop_closing_minutes: {
    ja: "⚡ 営業終了まであと{N}分",
    en: "⚡ Closing in {N} min"
  },

  shop_closing_hours: {
    ja: "⏰ 営業終了まであと{N}時間",
    en: "⏰ Closing in {N} hr"
  },

  shop_opens_today_at: {
    ja: "🕘 本日は{START}から営業します",
    en: "🕘 Opens today at {START}"
  },

  shop_closed_today: {
    ja: "🌙 本日の営業は終了しました",
    en: "🌙 Closed for today"
  },

  shop_hours_24: {
    ja: "🕘 24時間営業",
    en: "🕘 Open 24 Hours"
  },

  shop_hours_range: {
    ja: "🕘 営業時間 {START}〜{END}",
    en: "🕘 Hours: {START}–{END}"
  },

  shop_walking_distance_unknown: {
    ja: "距離を確認",
    en: "Check Distance"
  },

  shop_walking_car_recommended: {
    ja: "車での移動推奨",
    en: "Drive Recommended"
  },

  shop_walking_minutes: {
    ja: "徒歩 約{N}分",
    en: "About {N} min walk"
  },

  shop_payment_card: {
    ja: "💳 カードOK",
    en: "💳 Card OK"
  },

  shop_payment_qr: {
    ja: "📱 QR決済OK",
    en: "📱 QR Pay OK"
  },

  shop_payment_cash_only: {
    ja: "💴 現金のみ",
    en: "💴 Cash Only"
  },

  shop_takeout_ok: {
    ja: "🥡 テイクアウトOK",
    en: "🥡 Takeout OK"
  },

  shop_admin_badge: {
    ja: "🌺 マチナウ運営より",
    en: "🌺 From Machinau"
  },

  shop_detail_button: {
    ja: "今の情報を見る",
    en: "View Details"
  },

  shop_map_button: {
    ja: "📍 地図",
    en: "📍 Map"
  },

  shop_source_link_button: {
    ja: "🔗 情報元を見る",
    en: "🔗 View Source"
  },

  shop_favorite_aria_label: {
    ja: "お気に入り",
    en: "Favorite"
  },

  shop_load_error: {
    ja: "掲載情報を読み込めませんでした。<br>少し時間を置いて、もう一度ページを更新してください。",
    en: "Couldn't load listings.<br>Please wait a moment and refresh the page."
  },

  suggestion_safety: {
    ja: "現在、移動や安全に関する情報があります。\n出発前に最新情報を確認してください。\n『{TITLE}』",
    en: "There's important travel or safety information right now.\nPlease check the latest details before heading out.\n\"{TITLE}\""
  },

  suggestion_rain: {
    ja: "☔ 今は雨です。\n近くで『{TITLE}』があります。\n雨宿りも兼ねて、少し寄り道しませんか？",
    en: "☔ It's raining right now.\n\"{TITLE}\" is nearby.\nWhy not stop by while you wait out the rain?"
  },

  suggestion_hot: {
    ja: "🥵 暑さが厳しくなっています。\n無理のない移動をしながら『{TITLE}』をチェックしてみませんか？",
    en: "🥵 It's getting really hot out there.\nWhy not check out \"{TITLE}\" while taking it easy?"
  },

  suggestion_sunny: {
    ja: "☀️ 今は天気が良さそうです。\n『{TITLE}』をチェックしてみませんか？",
    en: "☀️ The weather looks great right now.\nWhy not check out \"{TITLE}\"?"
  },

  suggestion_general: {
    ja: "📍 今いるエリアで『{TITLE}』の情報があります。\n少しチェックしてみませんか？",
    en: "📍 There's info about \"{TITLE}\" in your current area.\nWhy not take a look?"
  },

  unified_info_label_emergency: {
    ja: "🚨 緊急",
    en: "🚨 Urgent"
  },

  unified_info_label_transport: {
    ja: "🚧 交通",
    en: "🚧 Transport"
  },

  unified_info_label_event: {
    ja: "🎵 イベント",
    en: "🎵 Event"
  },

  unified_info_label_sightseeing: {
    ja: "🏝️ 観光・体験",
    en: "🏝️ Sightseeing"
  },

  unified_info_label_notice: {
    ja: "📢 お知らせ",
    en: "📢 Notice"
  },

  region_recommendation_link_button: {
    ja: "🔗 くわしく見る",
    en: "🔗 Learn More"
  },

  region_recommendation_read_more_button: {
    ja: "続きを読む",
    en: "Read More"
  },

  region_recommendation_collapse_button: {
    ja: "閉じる",
    en: "Close"
  },

  region_recommendation_empty_manual: {
    ja: "この地域のおすすめは準備中です。",
    en: "Recommendations for this area are coming soon."
  },

  region_recommendation_heading_dynamic: {
    ja: "📍 {AREA}のおすすめ",
    en: "📍 Recommendations in {AREA}"
  },

  slider_prev_button: {
    ja: "前の写真",
    en: "Previous photo"
  },

  slider_next_button: {
    ja: "次の写真",
    en: "Next photo"
  },

  slider_dot_button: {
    ja: "写真{N}を表示",
    en: "Show photo {N}"
  },

  shop_image_alt: {
    ja: "{SHOP_NAME}の掲載写真",
    en: "Photo of {SHOP_NAME}"
  },

  modal_slider_image_alt: {
    ja: "店舗の掲載写真",
    en: "Shop photo"
  },

  location_permission_toggle_close: {
    ja: "閉じる",
    en: "Close"
  },

  toilet_default_name: {
    ja: "トイレ",
    en: "Restroom"
  },

  toilet_found_count: {
    ja: "近くのトイレ {N}件が見つかりました。",
    en: "Found {N} restrooms nearby."
  },

  toilet_not_found: {
    ja: "半径1km以内にトイレ情報が見つかりませんでした。",
    en: "No restrooms found within 1km."
  },

  toilet_precondition_location: {
    ja: "先に現在地を取得してください。",
    en: "Please get your location first."
  },

  toilet_searching: {
    ja: "近くのトイレを検索しています…",
    en: "Searching for nearby restrooms…"
  },

  toilet_search_error: {
    ja: "トイレ情報の取得に失敗しました。しばらくしてから再度お試しください。",
    en: "Couldn't find restroom info. Please try again later."
  },

  toilet_open_in_google_maps: {
    ja: "Google Mapsで開く",
    en: "Open in Google Maps"
  },

  toilet_distance_from_current_location_prefix: {
    ja: "現在地から ",
    en: "From your location, "
  },

  weather_condition_sunny: {
    ja: "晴れ",
    en: "Sunny"
  },

  weather_condition_cloudy: {
    ja: "くもり",
    en: "Cloudy"
  },

  weather_condition_rainy: {
    ja: "雨",
    en: "Rainy"
  },

  weather_condition_stormy: {
    ja: "雷雨",
    en: "Stormy"
  },

  weather_condition_foggy: {
    ja: "霧",
    en: "Foggy"
  },

  weather_condition_fair: {
    ja: "変わりやすい天気",
    en: "Fair"
  },

  shop_empty_category_notice: {
    ja: "現在、このカテゴリーに掲載中の情報はありません。",
    en: "No listings in this category right now."
  },

  flash_banner_breaking_prefix: {
    ja: "🚨 速報：",
    en: "🚨 Breaking: "
  },

  flash_banner_default_title: {
    ja: "今日だけの沖縄を、見逃さない。",
    en: "Don't miss today's Okinawa moments."
  },

  flash_banner_default_message: {
    ja: "タイムセールや限定イベントなど、今しか出会えない情報を配信します。",
    en: "We share time-limited deals and events you won't find anywhere else."
  },

  modal_website_button: {
    ja: "🔗 お店のページを見る",
    en: "🔗 View shop page"
  },

  firebase_not_ready_error: {
    ja: "Firebaseの準備が完了しませんでした。",
    en: "Firebase failed to initialize in time."
  },

  shop_name_fallback: {
    ja: "店舗名未登録",
    en: "Shop name unavailable"
  },

  shop_title_fallback: {
    ja: "今だけの情報",
    en: "Limited-time info"
  },

  shop_content_fallback: {
    ja: "詳しい情報は店舗へご確認ください。",
    en: "Please check with the shop for details."
  },

  shop_time_message_fallback: {
    ja: "⚡ マチナウ掲載中",
    en: "⚡ Now on Machinau"
  },

  current_location_marker_title: {
    ja: "現在地",
    en: "Current location"
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
