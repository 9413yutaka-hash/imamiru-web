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
// 対応言語は ja / en / zh-TW の3つです。将来 ko 等を追加する場合は、
// 各キーへ "zh-TW": "...", ko: "..." を追加するだけで拡張できる構造にしています
// (ロジック側の変更は不要です)。

const MACHINAU_TRANSLATIONS = {
  // トップ画面再設計 STEP3｜旧ヒーロー(hero_heading等、下記に残置)を
  // 廃止し、現在地セクションより前に置いた新しいオープニングの1行。
  // STEP4で実写バナー画像に置き換えたためHTML上の参照は無くなったが、
  // 将来言語ごとのメインコピーをHTML側で表示する余地を残すため残置する。
  opening_heading: {
    ja: "マチナウ、現在の街を見てみよう！",
    en: "Machinau — let's see your city right now!",
    "zh-TW": "Machinau，一起來看看目前這座城市吧！"
  },

  // トップ画面再設計 STEP4｜代表承認済み実写バナー画像(opening-visual-banner.png)
  // のalt文言。画像内には既に日本語で「マチナウ、今の街の声を聞こう！」が
  // 描かれているが、alt自体は画像内日本語だけに意味を依存させないよう
  // 多言語で用意する(スクリーンリーダー・画像読み込み失敗時にも意味が
  // 伝わるようにするため)。
  opening_visual_alt: {
    ja: "マチナウ、今の街の声を聞こう！",
    en: "Machinau — hear what's happening in your city right now",
    "zh-TW": "Machinau，來聽聽現在這座城市的聲音吧！"
  },

  // TOPヒーロー緊急変更｜新ヒーロー(背景画像＋本物のHTML)の
  // メイン/サブコピー・4入口(hero_action_*)。下のhero_heading/hero_kicker
  // (STEP3の旧ヒーロー由来、参照箇所なし)とは別物。
  // サイト全体改善 第5弾｜代表採用のファーストビュー(見出し・補足・主ボタン「現在地から探す」)。
  hero_main_copy: {
    ja: "街の今を知れば、<br>もっと、<span class=\"hero-hl\">いい旅</span>になる。",
    en: "Know what's happening in town, for an even better <span class=\"hero-hl\">trip</span>.",
    "zh-TW": "了解城市的現況，<br>讓<span class=\"hero-hl\">旅程</span>更加美好。"
  },

  // トップページ改修フェーズ1(モカ案ブレンド)｜主文と分けたサブコピーを
  // ヒーローの <p class="hero-sub-copy" data-i18n="hero_lead"> で復活使用する。
  hero_lead: {
    ja: "街の今を知れば、もっと、いい旅になる。",
    en: "Discover what's happening in town right now.",
    "zh-TW": "了解這座城市的現況，就能讓旅程更美好。"
  },

  // トップページ改修(モカ案ブレンド・見た目)｜ヒーローのリード文。
  hero_lead2: {
    ja: "店の今、今日のイベント、地元の声。今いる街の「今」を、近い順に1本で届けます。",
    en: "Shop updates, today's events, local voices — the town's “now”, in one feed, closest first.",
    "zh-TW": "店家的最新消息、今天的活動、在地人的聲音。把你所在城市的「現況」，依距離由近到遠，一次送到你面前。"
  },

  // ヒーローの「他の地域を見てみる」ボタン(2026-11-15 検索窓を廃止)。
  hero_area_button: {
    ja: "他の地域を見てみる",
    en: "See other areas",
    "zh-TW": "看看其他地區"
  },

  // ヘッダーの投稿CTA(赤ピル)とセクション移動チップ行。
  header_post_cta: {
    ja: "発見を投稿する",
    en: "Post a discovery",
    "zh-TW": "發布發現"
  },

  nav_feed: {
    ja: "今日のフィード",
    en: "Today's feed",
    "zh-TW": "今日動態"
  },

  nav_board: {
    ja: "掲示板",
    en: "Board",
    "zh-TW": "留言板"
  },

  nav_shops: {
    ja: "お店",
    en: "Shops",
    "zh-TW": "店家"
  },

  nav_columns: {
    ja: "読みもの",
    en: "Stories",
    "zh-TW": "文章"
  },

  // 03 今日のフィード(TODAYブロック・チップ・カード・空状態)。
  feed_sec_label: {
    ja: "03 — TODAY",
    en: "03 — TODAY",
    "zh-TW": "03 — TODAY"
  },

  feed_today_label: {
    ja: "TODAY — 今日できること",
    en: "TODAY — What you can do today",
    "zh-TW": "TODAY — 今天可以做的事"
  },

  feed_today_copy_title: {
    ja: "今日の街を、近い順に。",
    en: "Today's town, closest first.",
    "zh-TW": "今天的城市，依距離由近到遠。"
  },

  feed_tomorrow_copy_title: {
    ja: "明日の街を、近い順に。",
    en: "Tomorrow's town, closest first.",
    "zh-TW": "明天的城市，依距離由近到遠。"
  },

  feed_weekend_copy_title: {
    ja: "週末の街を、近い順に。",
    en: "The weekend's town, closest first.",
    "zh-TW": "週末的城市，依距離由近到遠。"
  },

  feed_today_copy_text: {
    ja: "お店からのお知らせ、<br>今日のイベント、<br>街の人の投稿が、ここに集まります。",
    en: "Shop announcements,<br>today's events,<br>and local posts — all here.",
    "zh-TW": "店家的消息、<br>今天的活動、<br>在地人的貼文，都匯集在這裡。"
  },

  feed_radius_label: {
    ja: "表示範囲",
    en: "Area",
    "zh-TW": "顯示範圍"
  },

  feed_radius_value: {
    ja: "半径 15km",
    en: "Within 15 km",
    "zh-TW": "半徑 15 公里"
  },

  feed_order_note: {
    ja: "距離順・新しい順",
    en: "By distance & freshness",
    "zh-TW": "依距離・由新到舊"
  },

  feed_when_label: {
    ja: "いつの街？",
    en: "When?",
    "zh-TW": "哪個時間的城市？"
  },

  feed_chip_today: {
    ja: "今日",
    en: "Today",
    "zh-TW": "今天"
  },

  feed_chip_tomorrow: {
    ja: "明日",
    en: "Tomorrow",
    "zh-TW": "明天"
  },

  feed_chip_weekend: {
    ja: "週末",
    en: "Weekend",
    "zh-TW": "週末"
  },

  feed_chip_soon_note: {
    ja: "明日・週末は準備中です",
    en: "Tomorrow & weekend are coming soon",
    "zh-TW": "明天・週末即將推出"
  },

  feed_filter_label: {
    ja: "種類で絞る",
    en: "Filter",
    "zh-TW": "依類型篩選"
  },

  feed_filter_all: {
    ja: "すべて",
    en: "All",
    "zh-TW": "全部"
  },

  feed_filter_imadake: {
    ja: "今だけ投稿",
    en: "Live posts",
    "zh-TW": "今日限定貼文"
  },

  feed_filter_event: {
    ja: "イベント",
    en: "Events",
    "zh-TW": "活動"
  },

  feed_filter_voice: {
    ja: "地元の声",
    en: "Local voices",
    "zh-TW": "在地人的聲音"
  },

  feed_filter_discovery: {
    ja: "街の発見",
    en: "Discoveries",
    "zh-TW": "街頭發現"
  },

  feed_badge_imadake: {
    ja: "今だけ投稿",
    en: "Live post",
    "zh-TW": "今日限定貼文"
  },

  feed_badge_event: {
    ja: "イベント",
    en: "Event",
    "zh-TW": "活動"
  },

  feed_badge_notice: {
    ja: "お知らせ",
    en: "Notice",
    "zh-TW": "消息"
  },

  feed_badge_discovery: {
    ja: "街の発見",
    en: "Discovery",
    "zh-TW": "街頭發現"
  },

  feed_badge_voice: {
    ja: "地元の声",
    en: "Local voice",
    "zh-TW": "在地人的聲音"
  },

  feed_badge_board: {
    ja: "掲示板",
    en: "Board",
    "zh-TW": "留言板"
  },

  feed_see_source: {
    ja: "この枠で見る →",
    en: "View in its section →",
    "zh-TW": "在這個專區查看 →"
  },

  feed_empty_location: {
    ja: "現在地を取得するか街を選ぶと、今日の「今」がここに集まります。",
    en: "Get your location or pick a town, and today's “now” will gather here.",
    "zh-TW": "取得目前位置或選擇城市後，今天的「現況」就會匯集在這裡。"
  },

  feed_empty_none: {
    ja: "今日の「今」は、まだ届いていません。",
    en: "Nothing new for today yet.",
    "zh-TW": "今天的「現況」還沒有新消息。"
  },

  feed_empty_tomorrow: {
    ja: "明日の「今」は、まだ届いていません。",
    en: "Nothing for tomorrow yet.",
    "zh-TW": "明天的「現況」還沒有新消息。"
  },

  feed_empty_weekend: {
    ja: "週末の「今」は、まだ届いていません。",
    en: "Nothing for the weekend yet.",
    "zh-TW": "週末的「現況」還沒有新消息。"
  },

  feed_day_loading: {
    ja: "その日の情報を用意しています…",
    en: "Preparing that day's updates…",
    "zh-TW": "正在準備當天的資訊…"
  },

  feed_empty_filter: {
    ja: "この条件の「今」はまだありません。種類を変えてみてください。",
    en: "Nothing matches this filter yet. Try another type.",
    "zh-TW": "符合這個條件的「現況」還沒有。請試著換個類型看看。"
  },

  feed_empty_filter_imadake: {
    ja: "今だけ投稿は、まだ届いていません。",
    en: "No time-limited posts yet.",
    "zh-TW": "今日限定貼文還沒有新消息。"
  },

  feed_empty_filter_event: {
    ja: "イベントは、まだ届いていません。",
    en: "No events yet.",
    "zh-TW": "活動還沒有新消息。"
  },

  feed_empty_filter_voice: {
    ja: "地元の声は、まだ届いていません。",
    en: "No local voices yet.",
    "zh-TW": "在地人的聲音還沒有新消息。"
  },

  feed_empty_filter_discovery: {
    ja: "街の発見は、まだ届いていません。",
    en: "No town discoveries yet.",
    "zh-TW": "街頭發現還沒有新消息。"
  },

  feed_empty_keyword: {
    ja: "「{term}」に合う今日の「今」は見つかりませんでした。",
    en: "Nothing for today matches “{term}” yet.",
    "zh-TW": "找不到符合「{term}」的今日「現況」。"
  },

  feed_keyword_bar: {
    ja: "「{term}」で絞り込み中",
    en: "Showing results for “{term}”",
    "zh-TW": "以「{term}」篩選中"
  },

  feed_keyword_clear: {
    ja: "解除する",
    en: "Clear",
    "zh-TW": "清除"
  },

  feed_ticker_today: {
    ja: "本日",
    en: "Today",
    "zh-TW": "今天"
  },

  // 今だけ投稿が0件の日の「今日の今」(ページ内の既存の枠への移動だけ)。
  today_now_empty_heading: {
    ja: "今日の今だけ投稿",
    en: "Today's limited-time posts",
    "zh-TW": "今天的今日限定貼文"
  },

  today_now_empty_text: {
    ja: "近くでは、まだ掲載中の「今だけ投稿」がありません。",
    en: "There are no limited-time posts nearby yet.",
    "zh-TW": "附近還沒有刊登中的「今日限定貼文」。"
  },

  today_now_empty_link_region: {
    ja: "今日、この地域で起きていること",
    en: "What's happening in this area today",
    "zh-TW": "今天這個地區發生的事"
  },

  today_now_empty_link_shops: {
    ja: "近くで楽しめるお店・施設",
    en: "Places to enjoy nearby",
    "zh-TW": "附近值得一去的店家・設施"
  },

  today_now_empty_link_threads: {
    ja: "近くの人の今日の会話（街の今スレッド）",
    en: "Today's local conversations (Town Now)",
    "zh-TW": "附近的人今天的對話（城市現況討論串）"
  },

  today_now_empty_link_reads: {
    ja: "街を楽しむヒント（マチナウ読み物）",
    en: "Tips for enjoying the town (Machinau Reads)",
    "zh-TW": "享受城市的小提示（Machinau 文章）"
  },

  // TOP・街ページ統合改善(ヘッダー・ヒーロー・位置情報の代替手段・街ページ・広告枠)。
  hero_area_badge: {
    ja: "沖縄からエリア拡大中",
    en: "Starting in Okinawa, expanding across Japan",
    "zh-TW": "從沖繩開始，地區持續擴大中"
  },

  hero_action_today_caption: {
    ja: "街のスレッドへ",
    en: "Go to town threads",
    "zh-TW": "前往城市討論串"
  },

  hero_board_title: {
    ja: "街の掲示板",
    en: "Town Board",
    "zh-TW": "城市留言板"
  },

  hero_board_caption: {
    ja: "この街を訪れる人へ、地元のひとことを残す場所",
    en: "Where locals leave a word for visitors to this town",
    "zh-TW": "讓在地人為造訪這座城市的人留下一句話的地方"
  },

  hero_card_more: {
    ja: "見る →",
    en: "View →",
    "zh-TW": "查看 →"
  },

  how_to_entry_title: {
    ja: "マチナウの楽しみ方",
    en: "How to enjoy Machinau",
    "zh-TW": "如何享受 Machinau"
  },

  location_alternatives_toggle: {
    ja: "位置情報が使えない場合はこちら",
    en: "Can't use your location? Tap here",
    "zh-TW": "無法使用定位時請點這裡"
  },

  location_alternatives_heading: {
    ja: "位置情報を使わずに探す",
    en: "Explore without your location",
    "zh-TW": "不使用定位來探索"
  },

  location_retry_button: {
    ja: "もう一度現在地を取得する",
    en: "Try getting my location again",
    "zh-TW": "再取得一次目前位置"
  },

  shops_newest_order: {
    ja: "新しい順",
    en: "Newest First",
    "zh-TW": "由新到舊"
  },

  shop_imadake_chip: {
    ja: "今だけ投稿あり・{AGO}",
    en: "Live update · {AGO}",
    "zh-TW": "有今日限定貼文・{AGO}"
  },

  shop_time_ago_now: {
    ja: "たった今",
    en: "just now",
    "zh-TW": "剛剛"
  },

  shop_time_ago_minutes: {
    ja: "{N}分前",
    en: "{N} min ago",
    "zh-TW": "{N} 分鐘前"
  },

  shop_time_ago_hours: {
    ja: "{N}時間前",
    en: "{N} hr ago",
    "zh-TW": "{N} 小時前"
  },

  community_board_loading: {
    ja: "掲示板を読み込んでいます…",
    en: "Loading the community board…",
    "zh-TW": "正在載入留言板…"
  },

  community_board_open_link: {
    ja: "{SITE} を開く",
    en: "Open {SITE}",
    "zh-TW": "開啟 {SITE}"
  },

  community_board_author_operator: {
    ja: "運営",
    en: "Machinau team",
    "zh-TW": "營運團隊"
  },

  town_now_loading: {
    ja: "スレッドを読み込んでいます…",
    en: "Loading threads…",
    "zh-TW": "正在載入討論串…"
  },

  town_now_list_load_error: {
    ja: "スレッドを読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load the threads. Please try again later.",
    "zh-TW": "無法載入討論串。請稍後再試一次。"
  },

  town_now_empty_region: {
    ja: "この街では、まだ今日の会話がありません。",
    en: "No conversations in this town yet today.",
    "zh-TW": "這座城市今天還沒有任何對話。"
  },

  town_now_empty_hint: {
    ja: "新しいスレッドは、下の「あなたの発見を教えて！」から立てられます。",
    en: "You can start a new thread from \"Tell us what you've found!\" below.",
    "zh-TW": "可以從下方的「告訴我們你的發現！」建立新的討論串。"
  },

  town_now_area_note_prefix: {
    ja: "選んだ街「",
    en: "Today's threads in ",
    "zh-TW": "所選城市「"
  },

  town_now_area_note_suffix: {
    ja: "」の今日のスレッドです。",
    en: " (the town you picked).",
    "zh-TW": "」今天的討論串。"
  },

  column_entry_published_label: {
    ja: "公開日",
    en: "Published",
    "zh-TW": "發布日期"
  },

  // お店・施設の方へ(モカ案07｜トップのお店一覧の直後の紺カード)。
  shop_owner_cta_heading: {
    ja: "お店・施設の方へ",
    en: "For shops and facilities",
    "zh-TW": "給店家・設施業者"
  },

  shop_owner_cta_text: {
    ja: "マチナウは、旅行者と地元の人に「街の今」を届ける場所です。あなたのお店の「今」も、ここから届けられます。",
    en: "Machinau brings what's happening in town to travelers and locals. Your shop's latest news can reach them from here, too.",
    "zh-TW": "Machinau 是把「城市現況」傳遞給旅客和在地人的地方。你店家的「現況」，也可以從這裡傳遞出去。"
  },

  shop_owner_cta_button: {
    ja: "掲載について見る",
    en: "See how to get listed",
    "zh-TW": "查看刊登方式"
  },

  ad_slot_label: {
    ja: "広告",
    en: "Ad",
    "zh-TW": "廣告"
  },

  ad_house_shop_title: {
    ja: "お店・施設を募集中",
    en: "Calling all shops & venues",
    "zh-TW": "店家・設施招募中"
  },

  ad_house_shop_text: {
    ja: "旅行者に、今のお店の情報を届けませんか。",
    en: "Share what's happening at your place with travelers nearby.",
    "zh-TW": "把店家現在的資訊，傳遞給旅客吧。"
  },

  // 広告枠の募集文言。2026-11-19 代表決定：この枠は地元の大きな会社向けに
  // 都道府県単位で売る。最大3社のスライド表示で、同業種は1社だけ(地域の
  // 小枠は作らない)。以前の「この街のお店を募集中」という小さなお店向け
  // 文言(16項目⑮)から差し替え。スライドの仕組み自体は広告主が決まった時に作る。
  ad_slot_recruit_tag: {
    ja: "広告主募集中",
    en: "Advertisers wanted",
    "zh-TW": "廣告主招募中"
  },

  ad_slot_recruit_title: {
    ja: "沖縄県内、3枠だけ。先着順です。",
    en: "Only 3 slots for all of Okinawa. First come, first served.",
    "zh-TW": "沖繩縣內，只有 3 個名額。先到先得。"
  },

  ad_slot_recruit_text_audience: {
    ja: "この広告枠は、沖縄県内のマチナウの全ページにスライドで出ます。",
    en: "These ads rotate on every Machinau page across Okinawa.",
    "zh-TW": "這個廣告版位會在沖繩縣內 Machinau 的所有頁面輪播顯示。"
  },

  ad_slot_recruit_text_order: {
    ja: "枠は最大3社まで。同業種は1社だけです。旅行者にも、地元の人にも届きます。",
    en: "Up to 3 companies, one per industry. Reaching travelers and locals alike.",
    "zh-TW": "名額最多 3 家公司，同一業種僅限 1 家。可以同時觸及旅客和在地人。"
  },

  ad_slot_recruit_button: {
    ja: "広告掲載のお問い合わせ →",
    en: "Advertise with us →",
    "zh-TW": "廣告刊登聯絡 →"
  },

  ad_house_reads_title: {
    ja: "マチナウ読み物",
    en: "Machinau Reads",
    "zh-TW": "Machinau 文章"
  },

  ad_house_reads_text: {
    ja: "旅のヒント・ストーリーを読んでみよう。",
    en: "Read travel tips and stories.",
    "zh-TW": "來讀讀旅行小提示和故事吧。"
  },

  ad_house_how_to_title: {
    ja: "マチナウの楽しみ方",
    en: "How to enjoy Machinau",
    "zh-TW": "如何享受 Machinau"
  },

  ad_house_how_to_text: {
    ja: "現在地・地域・スレッドの使い方をまとめました。",
    en: "A quick guide to location, areas and threads.",
    "zh-TW": "整理了目前位置、地區和討論串的使用方式。"
  },

  ad_house_more: {
    ja: "詳しく見る →",
    en: "Learn more →",
    "zh-TW": "查看詳情 →"
  },

  hero_action_today_title: {
    ja: "今いる街の情報",
    en: "About This Town",
    "zh-TW": "目前所在城市的資訊"
  },


  hero_action_nearby_title: {
    ja: "近くで楽しめる場所",
    en: "Fun Spots Nearby",
    "zh-TW": "附近值得一去的地方"
  },

  hero_action_nearby_caption: {
    ja: "お店・観光・体験",
    en: "Shops, sights & experiences",
    "zh-TW": "店家・觀光・體驗"
  },

  hero_action_area_title: {
    ja: "地域から探す",
    en: "Explore by Area",
    "zh-TW": "依地區搜尋"
  },

  hero_action_area_caption: {
    ja: "都道府県・市区町村で",
    en: "By prefecture & city",
    "zh-TW": "依都道府縣・市區町村"
  },

  hero_action_reads_title: {
    ja: "マチナウ読み物",
    en: "Machinau Reads",
    "zh-TW": "Machinau 文章"
  },

  hero_action_reads_caption: {
    ja: "旅のヒント・ストーリー",
    en: "Travel tips & stories",
    "zh-TW": "旅行小提示・故事"
  },

  // マチナウの楽しみ方｜ヒーロー直下の入口(#howToEntryButton)と説明モーダル
  // (#howToModal)の文言。旅行者が読む言葉だけで書く(内部用語は出さない)。
  how_to_entry_label: {
    ja: "はじめての方へ",
    en: "New here?",
    "zh-TW": "給第一次使用的人"
  },

  how_to_entry_question: {
    ja: "マチナウってどう使うの？",
    en: "Not sure how Machinau works?",
    "zh-TW": "Machinau 要怎麼用呢？"
  },

  how_to_entry_link: {
    ja: "マチナウの楽しみ方を見る →",
    en: "See how to enjoy it →",
    "zh-TW": "查看如何享受 Machinau →"
  },

  how_to_title: {
    ja: "マチナウの楽しみ方",
    en: "How to Enjoy Machinau",
    "zh-TW": "如何享受 Machinau"
  },

  how_to_lead: {
    ja: "<strong>マチナウは「今いる街」を楽しむためのサービスです。</strong><br>街で今起きていることや、近くのお店・施設、街の声や発見などを見ながら、その街をもっと楽しんでみよう。",
    en: "<strong>Machinau helps you enjoy the town you're in right now.</strong><br>See what's happening around town, nearby shops and spots, and what people have noticed — and get more out of every place you visit.",
    "zh-TW": "<strong>Machinau 是讓你享受「目前所在城市」的服務。</strong><br>一邊看看城市裡現在發生的事、附近的店家・設施，以及在地人的聲音和發現，一邊更盡興地享受這座城市吧。"
  },

  how_to_step1_title: {
    ja: "① まず現在地を押してみよう",
    en: "① Start with your location",
    "zh-TW": "① 先按下目前位置試試"
  },

  how_to_step1_text: {
    ja: "現在地を使うと、あなたの近くにある情報を探せます。お店や街の発見などは、今いる場所から<strong>15km以内</strong>を中心に表示します。",
    en: "Your location lets Machinau find what's around you. Shops, spots and local discoveries are shown mainly <strong>within 15 km</strong> of where you are.",
    "zh-TW": "使用目前位置，就能找到你附近的資訊。店家和街頭發現等內容，會以你目前所在位置<strong>15 公里內</strong>為主來顯示。"
  },

  how_to_step1_note: {
    ja: "位置情報は、近くの情報を探すために使います。",
    en: "Your location is used to find nearby information.",
    "zh-TW": "定位資訊用於尋找附近的資訊。"
  },

  how_to_step1_button: {
    ja: "📍 現在地から見てみる",
    en: "📍 See what's near me",
    "zh-TW": "📍 從目前位置看看"
  },

  how_to_step2_title: {
    ja: "② これから行く街も見てみよう",
    en: "② Check out where you're heading",
    "zh-TW": "② 也看看接下來要去的城市"
  },

  how_to_step2_text: {
    ja: "今いる場所だけでなく、これから行く街も探せます。少し離れた場所へ行く予定なら「地域から探す」で市区町村を選んでみよう。その街のお店・施設が見られます。",
    en: "You can look up not just where you are, but also the towns you're heading to. Going somewhere a little farther? Pick a city or town in “Explore by Area” to see its shops and spots.",
    "zh-TW": "不只目前所在的地方，也可以搜尋接下來要去的城市。如果計畫去稍遠一點的地方，就在「依地區搜尋」裡選擇市區町村看看吧。可以看到那座城市的店家・設施。"
  },

  how_to_step2_compare_location: {
    ja: "<strong>📍 現在地</strong>…今いる場所の近くを見る",
    en: "<strong>📍 My location</strong> — see what's around you now",
    "zh-TW": "<strong>📍 目前位置</strong>…查看目前所在位置的附近"
  },

  how_to_step2_compare_area: {
    ja: "<strong>🗺️ 地域から探す</strong>…これから行く街のお店・施設を見る",
    en: "<strong>🗺️ Explore by Area</strong> — see shops and spots in the town you're going to",
    "zh-TW": "<strong>🗺️ 依地區搜尋</strong>…查看接下來要去的城市的店家・設施"
  },

  how_to_step2_button: {
    ja: "🗺️ 行きたい街を探す",
    en: "🗺️ Find a town to visit",
    "zh-TW": "🗺️ 搜尋想去的城市"
  },

  how_to_step3_title: {
    ja: "③ 街の「今」をのぞいてみよう",
    en: "③ Peek at what's happening now",
    "zh-TW": "③ 來瞧瞧城市的「現況」"
  },

  how_to_step3_text: {
    ja: "近くのお店や施設、街で見つかった出来事など、今いる場所で役立つ情報を見てみよう。",
    en: "Browse nearby shops and spots, things people have spotted around town, and other tips that are handy right where you are.",
    "zh-TW": "來看看附近的店家和設施、在城市裡發現的新鮮事等，在目前所在位置用得上的資訊吧。"
  },

  how_to_step3_link: {
    ja: "近くで楽しめる場所を見る →",
    en: "See fun spots nearby →",
    "zh-TW": "查看附近值得一去的地方 →"
  },

  how_to_step4_title: {
    ja: "④ 「街の今スレッド」って？",
    en: "④ What are “Town Now Threads”?",
    "zh-TW": "④ 什麼是「城市現況討論串」？"
  },

  how_to_step4_text: {
    ja: "<strong>その場所の「今日」を、近くの人に聞ける場所です。</strong>",
    en: "<strong>A place to ask people near a spot what's happening there today.</strong>",
    "zh-TW": "<strong>可以向那個地方附近的人，詢問那裡「今天」狀況的地方。</strong>"
  },

  how_to_step4_examples: {
    ja: "「今、混んでる？」<br>「今日やってる？」<br>「この近くで何かある？」",
    en: "“Is it crowded right now?”<br>“Is it open today?”<br>“Anything going on around here?”",
    "zh-TW": "「現在人多嗎？」<br>「今天有營業嗎？」<br>「這附近有什麼活動嗎？」"
  },

  how_to_step4_text2: {
    ja: "今いる場所だけでなく、<strong>これから行く街にもスレッドを立てられます。</strong>",
    en: "Not just where you are — <strong>you can also start a thread for a town you're heading to.</strong>",
    "zh-TW": "不只目前所在的地方，<strong>也可以為接下來要去的城市建立討論串。</strong>"
  },

  // 表示範囲は実装どおり：現在地から立てたスレッド＝その地点から5km以内、
  // 街(市区町村)を選んで立てたスレッド＝その市区町村にいる人。
  how_to_step4_reach: {
    ja: "今いる場所で立てると<strong>5km以内の人へ</strong>、<br>街を選んで立てると<strong>その街にいる人へ</strong>届きます。",
    en: "Start one from your current location and it reaches <strong>people within 5 km</strong>;<br>pick a town and it reaches <strong>people in that town</strong>.",
    "zh-TW": "在目前所在位置建立時，會傳送給<strong>5 公里內的人</strong>；<br>選擇城市建立時，則會傳送給<strong>在那座城市的人</strong>。"
  },

  how_to_step4_author: {
    ja: "立てた人は、離れた場所からでも自分のスレッドを確認できます。",
    en: "If you started a thread, you can still check it even when you're somewhere else.",
    "zh-TW": "建立討論串的人，即使到了遠方，也能查看自己的討論串。"
  },

  // 16項目⑥｜店舗の詳細の電話番号(常設店舗広告、運営が入力)。
  // 16項目⑨｜正式店舗の詳細から、その店舗の今だけ投稿(TOP の枠のカード)へ移るボタン。
  shop_modal_imadake_link: {
    ja: "この店舗の今だけ投稿を見る →",
    en: "See this shop's limited-time post →",
    "zh-TW": "查看這家店的今日限定貼文 →"
  },

  shop_phone_label: {
    ja: "電話：",
    en: "Phone: ",
    "zh-TW": "電話："
  },

  how_to_threads_board_note: {
    ja: "※スレッドと掲示板は、現在地を取得するか、「地域から探す」で街を選ぶと表示されます。",
    en: "* Threads and the board appear once you get your location or pick a town in “Explore by Area.”",
    "zh-TW": "※討論串和留言板，在取得目前位置，或在「依地區搜尋」選擇城市後就會顯示。"
  },

  how_to_step4_closing: {
    ja: "<strong>今いる人と、これから行く人をつなぐ。</strong><br>それが「街の今スレッド」です。",
    en: "<strong>Connecting people who are there with people on their way.</strong><br>That's what Town Now Threads are for.",
    "zh-TW": "<strong>連結正在當地的人，和即將前往的人。</strong><br>這就是「城市現況討論串」。"
  },

  how_to_step4_link: {
    ja: "近くのスレッドを見る →",
    en: "See threads nearby →",
    "zh-TW": "查看附近的討論串 →"
  },

  how_to_step5_title: {
    ja: "⑤ あなたの発見も届けられます",
    en: "⑤ Share what you discover",
    "zh-TW": "⑤ 你也可以分享你的發現"
  },

  how_to_step5_lead: {
    ja: "<strong>街で見つけた「今」を、写真と一緒に近くの人へ届けられます。</strong>",
    en: "<strong>Share what you find happening around town — with a photo — with people nearby.</strong>",
    "zh-TW": "<strong>可以把在城市裡發現的「現況」，連同照片一起分享給附近的人。</strong>"
  },

  how_to_step5_examples: {
    ja: "「こんなイベントやってる！」<br>「景色がきれい！」<br>「こんなお店を見つけた！」<br>「ここ、今すごく賑わってる！」",
    en: "“There's an event going on!”<br>“What a view!”<br>“Found a great little shop!”<br>“It's really lively here right now!”",
    "zh-TW": "「這裡有這樣的活動！」<br>「景色好美！」<br>「發現了這樣一家店！」<br>「這裡現在超熱鬧！」"
  },

  how_to_step5_how: {
    ja: "写真を撮って、ひとこと添えて投稿するだけ。<br>投稿は<strong>3・6・12・24時間</strong>から掲載時間を選べて、近くの旅行者に届きます。",
    en: "Just snap a photo and add a few words.<br>Choose to keep it up for <strong>3, 6, 12 or 24 hours</strong>, and it reaches travelers nearby.",
    "zh-TW": "只要拍張照片、加上一句話發布就好。<br>貼文可以從<strong>3・6・12・24 小時</strong>中選擇刊登時間，並傳遞給附近的旅客。"
  },

  how_to_step5_text: {
    ja: "<strong>あなたの発見が、次の旅行者の「知っててよかった」になる。</strong>",
    en: "<strong>What you find today could be exactly what the next traveler is glad to know.</strong>",
    "zh-TW": "<strong>你的發現，會成為下一位旅客的「還好有先知道」。</strong>"
  },

  how_to_step5_link: {
    ja: "📷 見つけた「今」を投稿する →",
    en: "📷 Share what you found →",
    "zh-TW": "📷 發布發現的「現況」 →"
  },

  how_to_step6_title: {
    ja: "⑥ お店・施設の方も参加できます",
    en: "⑥ Shops & venues can join too",
    "zh-TW": "⑥ 店家・設施業者也可以參加"
  },

  how_to_step6_text: {
    ja: "登録したお店・施設は、営業情報やイベントなど、今伝えたい情報を自分で発信できます。",
    en: "Registered shops and venues can post their own updates — opening hours, events, and anything they want travelers to know right now.",
    "zh-TW": "已註冊的店家與設施可以自行發布營業資訊、活動等現在想傳達的資訊。"
  },

  how_to_step6_link: {
    ja: "お店・施設の方へ →",
    en: "For shops & venues →",
    "zh-TW": "店家・設施專區 →"
  },

  how_to_final_location: {
    ja: "📍 現在地からマチナウを使ってみる",
    en: "📍 Start Machinau from my location",
    "zh-TW": "📍 從目前位置開始使用 Machinau"
  },

  how_to_final_area: {
    ja: "🗺️ 行きたい街から探す",
    en: "🗺️ Search a town I want to visit",
    "zh-TW": "🗺️ 從想去的城市搜尋"
  },

  how_to_close: {
    ja: "閉じてTOPに戻る",
    en: "Close and go back",
    "zh-TW": "關閉並返回首頁"
  },

  // トップ画面再設計 STEP3で旧ヒーローのDOMは削除したが、キーは既存の
  // 「削除せず残す」方針に合わせて残置する(参照箇所は無くなったが、
  // データとして残しても実害が無いため)。
  hero_heading: {
    ja: "今、沖縄で<br>何が起きているか。",
    en: "What's happening<br>in Okinawa right now.",
    "zh-TW": "現在，沖繩<br>正在發生什麼。"
  },

  hero_kicker: {
    ja: "沖縄の「今」をリアルタイム配信",
    en: "Live updates on Okinawa, right now",
    "zh-TW": "即時播報沖繩的「現況」"
  },

  // 現在地ファーストUX STEP2｜初めてマチナウを開いた人が「何をすればいいか」
  // 一目で分かる取得前の見出し。取得後はlocation_heading_after(下記)へ
  // JS側(updateLocationButtonLanguage())が切り替える(userLatitudeの有無で
  // 判定、getLocation()本体・地域判定ロジックには一切触れない)。
  location_heading: {
    ja: "あなたの街の「今」",
    en: "What's happening in your town",
    "zh-TW": "你所在城市的「現況」"
  },

  // 現在地取得後の見出し。
  location_heading_after: {
    ja: "今いる街",
    en: "Your area right now",
    "zh-TW": "目前所在的城市"
  },

  location_button_get: {
    ja: "現在地を取得する",
    en: "Get my location",
    "zh-TW": "取得目前位置"
  },

  location_button_update: {
    ja: "現在地を更新",
    en: "Update Location",
    "zh-TW": "更新目前位置"
  },

  shops_heading: {
    ja: "今、近くで楽しめる場所",
    en: "Nearby Right Now",
    "zh-TW": "現在，附近好玩的地方"
  },

  shops_description: {
    ja: "お店・観光・体験",
    en: "Shops, sightseeing & experiences",
    "zh-TW": "店家・觀光・體驗"
  },

  // 投稿玄関Phase1｜旧shops_general_post_entry_link(👀今ここで見つけた？
  // みんなに知らせる→)を廃止し、投稿できることが一瞬で分かる参加CTAへ
  // 置換。contribute.html自体は既存post.html同様に日本語のみ(post.html側に
  // 多言語対応が無く、遷移先が日本語のみのため、玄関ページだけ英語化しても
  // 一貫した体験にならないという確認済みの理由による)。
  contribute_cta_heading: {
    ja: "あなたの発見を教えて！",
    en: "Tell us what you've found!",
    "zh-TW": "告訴我們你的發現！"
  },

  contribute_cta_message: {
    ja: "あなたが見つけた街の今が、今そこにいる誰かの役に立ちます。",
    en: "What you notice right now could help someone nearby today.",
    "zh-TW": "你發現的城市現況，能幫助現在就在那裡的某個人。"
  },

  contribute_cta_button: {
    ja: "見つけた「今」を投稿する →",
    en: "Share what you found →",
    "zh-TW": "發布你發現的「現況」 →"
  },

  // TOP参加CTA内の店舗・施設向け第2導線(shop.htmlへ)。footer_shop_linkと同じ
  // 考え方の文言。shop.html自体は日本語のみ。
  contribute_cta_shop_link: {
    ja: "お店・施設の方へ｜店舗カード・今だけ投稿のご案内 →",
    en: "For shops & venues | Store cards and Just for Now posts →",
    "zh-TW": "店家・設施專區｜店家卡片・今日限定貼文介紹 →"
  },

  category_all: {
    ja: "すべて",
    en: "All",
    "zh-TW": "全部"
  },

  category_favorite: {
    ja: "お気に入り",
    en: "Favorites",
    "zh-TW": "收藏"
  },

  category_power_spot: {
    ja: "パワースポット",
    en: "Power Spots",
    "zh-TW": "能量景點"
  },

  category_gourmet: {
    ja: "グルメ",
    en: "Food",
    "zh-TW": "美食"
  },

  category_cafe_sweets: {
    ja: "カフェ・スイーツ",
    en: "Cafe & Sweets",
    "zh-TW": "咖啡・甜點"
  },

  category_shopping: {
    ja: "ショッピング",
    en: "Shopping",
    "zh-TW": "購物"
  },

  category_event: {
    ja: "イベント",
    en: "Events",
    "zh-TW": "活動"
  },

  category_sightseeing: {
    ja: "観光・体験",
    en: "Sightseeing",
    "zh-TW": "觀光・體驗"
  },

  category_nightlife: {
    ja: "ナイトスポット",
    en: "Nightlife",
    "zh-TW": "夜生活"
  },

  category_beauty: {
    ja: "美容・リラクゼーション",
    en: "Beauty & Spa",
    "zh-TW": "美容・放鬆"
  },

  category_lodging: {
    ja: "宿泊",
    en: "Stay",
    "zh-TW": "住宿"
  },

  category_notice: {
    ja: "お知らせ",
    en: "Notice",
    "zh-TW": "消息"
  },

  // AIコンシェルジュ Phase2｜「店からの提案か、マチナウからの提案か
  // 分かりにくい」問題への対応。本部第一候補をそのまま採用。
  suggestion_heading: {
    ja: "マチナウAI「今どうする？」",
    en: "Machinau AI: What now?",
    "zh-TW": "Machinau AI「現在該做什麼？」"
  },

  // 初心回帰後の新トップ体験 Phase1｜旅行者向けUIから「AI」という言葉・
  // 「マチナウAI」という名称を外すための見出し変更(AI処理自体は裏方として
  // 無変更のまま残す)。
  ai_concierge_chat_heading: {
    ja: "気になることを聞く",
    en: "Ask something",
    "zh-TW": "詢問想知道的事"
  },

  // 初心回帰後の新トップ体験 Phase1修正｜第一声はOpenAIを呼ばず、既に
  // 取得済みのuserAreaNameだけでクライアント側テンプレートから組み立てる
  // ({AREA}を地域名で置換)。本部指示により、天気の話題・予定を聞く問いかけ・
  // 回答を要求する言い回しは一切含めない、静かな案内文へ変更した
  // (4キーとも天気による分岐を維持する必要が無くなったため、rain/clearは
  // area_onlyと同じ文言にしている。JSの分岐ロジック自体は変更していない)。
  ai_concierge_initial_rain: {
    ja: "{AREA}にいるんだね。気になることがあれば、ここで聞けるよ。",
    en: "So you're in {AREA}. If anything comes to mind, you can ask here.",
    "zh-TW": "你在 {AREA} 呢。如果有想知道的事，可以在這裡詢問喔。"
  },

  ai_concierge_initial_clear: {
    ja: "{AREA}にいるんだね。気になることがあれば、ここで聞けるよ。",
    en: "So you're in {AREA}. If anything comes to mind, you can ask here.",
    "zh-TW": "你在 {AREA} 呢。如果有想知道的事，可以在這裡詢問喔。"
  },

  ai_concierge_initial_area_only: {
    ja: "{AREA}にいるんだね。気になることがあれば、ここで聞けるよ。",
    en: "So you're in {AREA}. If anything comes to mind, you can ask here.",
    "zh-TW": "你在 {AREA} 呢。如果有想知道的事，可以在這裡詢問喔。"
  },

  ai_concierge_initial_fallback: {
    ja: "気になることがあれば、ここで聞けるよ。",
    en: "If anything comes to mind, you can ask here.",
    "zh-TW": "如果有想知道的事，可以在這裡詢問喔。"
  },

  // トップ画面整理｜旧「近くの『今』」「気になることを聞く」の2枠を
  // 統合した1つの案内枠の文言。下に続く店舗情報・街の声等へ誘導する。
  city_now_guidance_message: {
    ja: "この街の「今」が届いているよ！下をチェック！",
    en: "This city's \"now\" has arrived! Check it out below.",
    "zh-TW": "這座城市的「現況」已經送達了！往下看看吧！"
  },

  region_today_info_heading: {
    ja: "今日、この地域で起きていること",
    en: "What's happening in this area today",
    "zh-TW": "今天，這個地區正在發生的事"
  },

  region_today_info_loading: {
    ja: "今日の地域情報を確認しています…",
    en: "Checking today's local information…",
    "zh-TW": "正在確認今天的地區資訊…"
  },

  // OpenAI API安全対策 STEP 2-B 修正(2026-11-12)｜新しい作成の休止中・1日の上限の時の案内。
  region_today_info_paused: {
    ja: "今日の地域情報は、ただいま新しい作成を受け付けていません。時間をおいてご覧ください。",
    en: "Today's local information isn't being updated right now. Please check back later.",
    "zh-TW": "今天的地區資訊目前暫停更新。請稍後再回來查看。"
  },

  region_today_info_show_more: {
    ja: "今日の情報をもっと見る",
    en: "See more of today's updates",
    "zh-TW": "查看更多今天的資訊"
  },

  region_today_info_show_less: {
    ja: "閉じる",
    en: "Close",
    "zh-TW": "關閉"
  },

  region_today_info_official_link: {
    ja: "公式情報を見る",
    en: "View official information",
    "zh-TW": "查看官方資訊"
  },

  region_today_info_detail_link: {
    ja: "詳しく見る",
    en: "See details",
    "zh-TW": "查看詳情"
  },

  // 初心回帰後の新トップ体験 Phase1｜「近くの『今』」パネルの見出しと、
  // 種類ごとの短い一言テンプレート({TITLE}を実際のタイトルで置換)。
  // AIが自然文を生成するのではなく、既存データのタイトルを固定テンプレート
  // へ差し込むだけ(OpenAI呼び出しなし)。STEP後のトップ画面整理で
  // #awarenessNoticesSection自体はDOMから削除したが、キーは既存の
  // 「削除せず残す」方針に合わせて残置する(参照箇所は無くなったが、
  // データとして残しても実害が無いため)。
  awareness_notices_heading: {
    ja: "近くの「今」",
    en: "What's happening nearby",
    "zh-TW": "附近的「現況」"
  },

  awareness_notice_factual_info: {
    ja: "⚠️ 近くで大事なお知らせが出てるよ：{TITLE}",
    en: "⚠️ Important notice nearby: {TITLE}",
    "zh-TW": "⚠️ 附近有重要消息：{TITLE}"
  },

  awareness_notice_official_today: {
    ja: "📢 近くで今日のお知らせが出てるよ：{TITLE}",
    en: "📢 Today's notice nearby: {TITLE}",
    "zh-TW": "📢 附近有今天的公告：{TITLE}"
  },

  awareness_notice_traveler_suggestion: {
    ja: "🎉 近くで今日、「{TITLE}」やってるみたい！",
    en: "🎉 Looks like \"{TITLE}\" is happening nearby today!",
    "zh-TW": "🎉 附近今天好像有「{TITLE}」！"
  },

  awareness_notice_street_discovery: {
    ja: "📍 この辺に来た人からこんな発見が届いてるよ：{TITLE}",
    en: "📍 Someone nearby shared this discovery: {TITLE}",
    "zh-TW": "📍 來過這附近的人分享了這樣的發現：{TITLE}"
  },

  awareness_notice_shop_summary: {
    ja: "🏪 近くのお店から今日の情報が出てるよ。チェックしてね！",
    en: "🏪 Nearby shops have posted today's updates. Check them out!",
    "zh-TW": "🏪 附近的店家發布了今天的資訊。快來看看吧！"
  },

  awareness_notices_empty: {
    ja: "近くで気づいた情報はまだ見つかってないよ。",
    en: "Nothing notable found nearby yet.",
    "zh-TW": "目前還沒有發現附近值得注意的資訊。"
  },

  // SNS街巡回(socialPatrol) Phase1｜巡回が実際に実行され(checked:true)、
  // それでも何も見つからなかった場合だけ表示する。巡回が未実行/失敗の
  // 場合はawareness_notices_emptyのまま(取得していないものを確認したと
  // 表現しないため)。
  awareness_notices_empty_social_checked: {
    ja: "SNSでは今のところ、旅行者向けに特に気になる情報は見つからなかったよ。",
    en: "Nothing especially traveler-relevant found on social media right now.",
    "zh-TW": "目前在社群媒體上，還沒有找到特別值得旅客注意的資訊。"
  },

  // 初心回帰後の新トップ体験 Phase1｜街情報ボタン。マチナウが全情報を
  // 押し付けず、興味を持った人だけが自分で開く入口の見出し・ラベル。
  area_info_heading: {
    ja: "気になる情報を見る",
    en: "Browse more info",
    "zh-TW": "查看感興趣的資訊"
  },

  area_info_role_label: {
    ja: "🏛️ 地域・行政",
    en: "🏛️ Local & government",
    "zh-TW": "🏛️ 地區・行政"
  },

  area_info_tourism_label: {
    ja: "🏝️ 観光施設",
    en: "🏝️ Tourist facilities",
    "zh-TW": "🏝️ 觀光設施"
  },

  suggestion_placeholder_main: {
    ja: "このあと、どうする？",
    en: "What should you do next?",
    "zh-TW": "接下來要做什麼？"
  },

  suggestion_placeholder_message: {
    ja: "現在地を取得すると、今いる場所・周辺の「今」から、あなたに合った行き先を提案します。",
    en: "Share your location and Machinau will suggest what to do next based on where you are and what's happening nearby.",
    "zh-TW": "取得目前位置後，我們會根據你所在的地方與周邊的「現況」，為你推薦適合的目的地。"
  },

  suggestion_placeholder_cta: {
    ja: "現在地から提案してもらう",
    en: "Get a suggestion near me",
    "zh-TW": "從目前位置獲得推薦"
  },

  // AIコンシェルジュ Phase2｜GPS→天気確認→AI判断という流れが伝わるよう、
  // 2段階の待機文言にする(suggestion_ai_checkingが1段階目)。
  suggestion_ai_checking: {
    ja: "街の「今」を確認中…",
    en: "Checking what's happening around you…",
    "zh-TW": "正在確認城市的「現況」…"
  },

  suggestion_ai_loading: {
    ja: "天気や周辺情報から考えています…",
    en: "Thinking it over based on the weather and what's nearby…",
    "zh-TW": "正在根據天氣和周邊資訊思考…"
  },

  // AIコンシェルジュ Phase2｜「また開いて」の実装方式(採用案C)。AIには
  // この文言自体を生成させず、AIが返すshouldReopenLater(構造化値)が
  // trueのときだけ、この固定文をUI側で末尾に付け足す。
  suggestion_reopen_later_note: {
    ja: "天気や場所が変わったら、またマチナウを開いてください。その時の「今」から次を提案します。",
    en: "If the weather or your location changes, open Machinau again — we'll suggest what's next based on that new \"now\".",
    "zh-TW": "如果天氣或地點改變了，請再次打開 Machinau。我們會根據當時的「現況」為你推薦下一步。"
  },

  suggestion_no_candidates_message: {
    ja: "今は近くに提案できる情報を見つけられませんでした。\n新しい情報が入り次第、ここから提案します。",
    en: "We couldn't find anything nearby to suggest right now.\nWe'll share a suggestion here as soon as new information comes in.",
    "zh-TW": "目前找不到可以在附近推薦的資訊。\n一有新資訊，我們就會在這裡推薦給你。"
  },

  suggestion_fallback_generic_note: {
    ja: "現在地の近くにある情報です。",
    en: "This is information near your current location.",
    "zh-TW": "這是你目前位置附近的資訊。"
  },

  suggestion_fallback_error_message: {
    ja: "現在、提案を準備できませんでした。少し時間をおいて、もう一度現在地を更新してください。",
    en: "We couldn't prepare a suggestion right now. Please wait a moment and refresh your location again.",
    "zh-TW": "目前無法準備推薦。請稍等一下，再重新更新你的目前位置。"
  },

  factual_heading: {
    ja: "今、知っておきたいこと",
    en: "Good to Know",
    "zh-TW": "現在值得知道的事"
  },

  today_machinau_heading: {
    ja: "今、見てほしい",
    en: "Worth a Look Now",
    "zh-TW": "現在值得一看"
  },

  today_machinau_label: {
    ja: "運営情報",
    en: "Official",
    "zh-TW": "營運團隊資訊"
  },

  detail_button: {
    ja: "この情報を見る",
    en: "View Details",
    "zh-TW": "查看這則資訊"
  },

  nav_home: {
    ja: "ホーム",
    en: "Home",
    "zh-TW": "首頁"
  },

  nav_find: {
    ja: "お店・施設",
    en: "Shops & Spots",
    "zh-TW": "店家・設施"
  },

  nav_location: {
    ja: "現在地",
    en: "Location",
    "zh-TW": "目前位置"
  },

  nav_mypage: {
    ja: "保存箱",
    en: "Saved",
    "zh-TW": "收藏箱"
  },

  brand_caption: {
    ja: "街の「今」がわかる案内所",
    en: "Your guide to what's happening in town",
    "zh-TW": "讓你掌握城市「現況」的嚮導"
  },

  live_chip_label: {
    ja: "今を配信中",
    en: "Live Now",
    "zh-TW": "現況播報中"
  },

  hero_description: {
    ja: "近くのお店、今日だけのイベント、旅先の<span class=\"hero-description-emphasis\">偶然の寄り道</span>。 今の沖縄が、ひと目でわかる。",
    en: "Nearby shops, one-day-only events, and <span class=\"hero-description-emphasis\">happy detours</span> along the way — Okinawa's \"right now,\" at a glance.",
    "zh-TW": "附近的店家、今天限定的活動、旅途中<span class=\"hero-description-emphasis\">意外的繞道小旅行</span>。 現在的沖繩，一眼就懂。"
  },

  // 現在地ファーストUX STEP2｜取得前の説明文。取得後はlocation_message_success
  // (既存、変更なし)へgetLocation()が切り替える。
  location_message_initial: {
    ja: "今いる街の「今」をお届けします。まずは下のボタンを押してみてください。",
    en: "We'll show you what's happening right now in the town you're in. Start by tapping the button below.",
    "zh-TW": "我們會為你送上目前所在城市的「現況」。先點下面的按鈕試試吧。"
  },

  location_permission_toggle_show: {
    ja: "許可し直す方法を見る",
    en: "How to allow location again",
    "zh-TW": "查看重新允許的方法"
  },

  // 位置情報取得失敗時の離脱防止｜失敗時(拒否・取得不可・時間切れ)に位置情報
  // カード内へ出す補足と「地域から探す」への逃げ道(#locationFailureActions)。
  location_failure_inapp_note: {
    ja: "LINEやInstagramなどのアプリから開いている場合は、SafariやChromeなどのブラウザで開くと位置情報を利用しやすくなります。",
    en: "If you opened Machinau inside an app like LINE or Instagram, opening it in a browser such as Safari or Chrome usually makes location easier to use.",
    "zh-TW": "如果你是從 LINE 或 Instagram 等 App 內開啟的，改用 Safari 或 Chrome 等瀏覽器開啟，會比較容易使用位置資訊。"
  },

  location_failure_area_note: {
    ja: "位置情報なしでも「地域から探す」からマチナウを利用できます。",
    en: "You can still use Machinau without location — just search by area.",
    "zh-TW": "即使沒有位置資訊，也可以從「從地區搜尋」使用 Machinau。"
  },

  location_failure_area_button: {
    ja: "都道府県・市区町村から",
    en: "By prefecture & city",
    "zh-TW": "依都道府縣・市區町村"
  },

  location_permission_device_pc_label: {
    ja: "💻 パソコン",
    en: "💻 Computer",
    "zh-TW": "💻 電腦"
  },

  location_permission_iphone_safari_method1_title: {
    ja: "方法1：マチナウを開いたまま変更する",
    en: "Method 1: Change settings without closing Machinau",
    "zh-TW": "方法1：保持 Machinau 開啟並更改設定"
  },

  location_permission_iphone_safari_method1_step1: {
    ja: "① Safariで<strong>マチナウを開いたまま</strong>にします",
    en: "① Keep <strong>Machinau open</strong> in Safari",
    "zh-TW": "① 在 Safari 中<strong>保持 Machinau 開啟</strong>"
  },

  location_permission_iphone_safari_method1_step2: {
    ja: "② アドレスバー付近にある<strong>ページメニューのボタン</strong>を押します",
    en: "② Tap the <strong>page menu button</strong> near the address bar",
    "zh-TW": "② 點按網址列附近的<strong>頁面選單按鈕</strong>"
  },

  location_permission_iphone_safari_method1_step3: {
    ja: "③ <strong>「Webサイトの設定」</strong>に進みます",
    en: "③ Go to <strong>\"Website Settings\"</strong>",
    "zh-TW": "③ 進入<strong>「網站設定」</strong>"
  },

  location_permission_iphone_safari_method1_step4: {
    ja: "④ <strong>「位置情報」</strong>を押します",
    en: "④ Tap <strong>\"Location\"</strong>",
    "zh-TW": "④ 點按<strong>「位置資訊」</strong>"
  },

  location_permission_iphone_safari_method1_step5: {
    ja: "⑤ <strong>「許可」</strong>を選びます",
    en: "⑤ Select <strong>\"Allow\"</strong>",
    "zh-TW": "⑤ 選擇<strong>「允許」</strong>"
  },

  location_permission_iphone_safari_method1_step6: {
    ja: "⑥ マチナウの画面へ戻ります",
    en: "⑥ Return to the Machinau screen",
    "zh-TW": "⑥ 返回 Machinau 畫面"
  },

  location_permission_iphone_safari_method1_step7: {
    ja: "⑦ <strong>「もう一度試す」</strong>を押します",
    en: "⑦ Tap <strong>\"Try Again\"</strong>",
    "zh-TW": "⑦ 點按<strong>「再試一次」</strong>"
  },

  location_permission_iphone_safari_method1_note: {
    ja: "※iOSのバージョンにより、「…」などの追加操作が入る場合があります",
    en: "※ Depending on your iOS version, you may see an extra step such as tapping \"…\"",
    "zh-TW": "※依 iOS 版本不同，可能需要點按「…」等額外操作"
  },

  location_permission_iphone_safari_method2_title: {
    ja: "それでも取得できない場合<br>方法2：iPhone本体の設定を確認",
    en: "Still not working?<br>Method 2: Check your iPhone's settings",
    "zh-TW": "還是無法取得時<br>方法2：檢查 iPhone 本身的設定"
  },

  location_permission_iphone_safari_method2_step1: {
    ja: "① iPhoneの<strong>「設定」</strong>を開きます",
    en: "① Open <strong>\"Settings\"</strong> on your iPhone",
    "zh-TW": "① 開啟 iPhone 的<strong>「設定」</strong>"
  },

  location_permission_iphone_safari_method2_step2: {
    ja: "② <strong>「プライバシーとセキュリティ」</strong>を押します",
    en: "② Tap <strong>\"Privacy & Security\"</strong>",
    "zh-TW": "② 點按<strong>「隱私權與安全性」</strong>"
  },

  location_permission_iphone_safari_method2_step3: {
    ja: "③ <strong>「位置情報サービス」</strong>を押します",
    en: "③ Tap <strong>\"Location Services\"</strong>",
    "zh-TW": "③ 點按<strong>「定位服務」</strong>"
  },

  location_permission_iphone_safari_method2_step4: {
    ja: "④ 画面上部の<strong>「位置情報サービス」がON</strong>になっているか確認します",
    en: "④ Check that <strong>\"Location Services\" is ON</strong> at the top of the screen",
    "zh-TW": "④ 確認畫面上方的<strong>「定位服務」已開啟</strong>"
  },

  location_permission_iphone_safari_method2_step5: {
    ja: "⑤ Safariに関係する位置情報設定を確認します",
    en: "⑤ Check the location setting for Safari",
    "zh-TW": "⑤ 檢查與 Safari 相關的位置資訊設定"
  },

  location_permission_iphone_safari_method2_step6: {
    ja: "⑥ 位置情報を利用できる設定に変更します",
    en: "⑥ Change it to allow location access",
    "zh-TW": "⑥ 改為允許使用位置資訊的設定"
  },

  location_permission_iphone_safari_method2_step7: {
    ja: "⑦ マチナウへ戻ります",
    en: "⑦ Return to Machinau",
    "zh-TW": "⑦ 返回 Machinau"
  },

  location_permission_iphone_safari_method2_step8: {
    ja: "⑧ <strong>「もう一度試す」</strong>を押します",
    en: "⑧ Tap <strong>\"Try Again\"</strong>",
    "zh-TW": "⑧ 點按<strong>「再試一次」</strong>"
  },

  location_permission_iphone_safari_method2_note: {
    ja: "※iOSのバージョンにより、ボタン名や表示位置が少し異なる場合があります。",
    en: "※ Button names and positions may vary slightly depending on your iOS version.",
    "zh-TW": "※依 iOS 版本不同，按鈕名稱和顯示位置可能略有不同。"
  },

  location_permission_iphone_chrome_step1: {
    ja: "① iPhoneの<strong>「設定」</strong>を開きます",
    en: "① Open <strong>\"Settings\"</strong> on your iPhone",
    "zh-TW": "① 開啟 iPhone 的<strong>「設定」</strong>"
  },

  location_permission_iphone_chrome_step2: {
    ja: "② 下へスクロールして<strong>「Chrome」</strong>を探して押します",
    en: "② Scroll down and tap <strong>\"Chrome\"</strong>",
    "zh-TW": "② 向下捲動，找到並點按<strong>「Chrome」</strong>"
  },

  location_permission_iphone_chrome_step3: {
    ja: "③ <strong>「位置情報」</strong>を押します",
    en: "③ Tap <strong>\"Location\"</strong>",
    "zh-TW": "③ 點按<strong>「位置資訊」</strong>"
  },

  location_permission_iphone_chrome_step4: {
    ja: "④ 位置情報を許可する設定を選びます",
    en: "④ Select the setting that allows location access",
    "zh-TW": "④ 選擇允許位置資訊的設定"
  },

  location_permission_iphone_chrome_step5: {
    ja: "⑤ マチナウへ戻ります",
    en: "⑤ Return to Machinau",
    "zh-TW": "⑤ 返回 Machinau"
  },

  location_permission_iphone_chrome_step6: {
    ja: "⑥ <strong>「もう一度試す」</strong>を押します",
    en: "⑥ Tap <strong>\"Try Again\"</strong>",
    "zh-TW": "⑥ 點按<strong>「再試一次」</strong>"
  },

  location_permission_iphone_chrome_note: {
    ja: "※「位置情報」が表示されない場合は、iPhone本体の『設定 → プライバシーとセキュリティ → 位置情報サービス』も確認してください",
    en: "※ If you don't see \"Location,\" also check Settings → Privacy & Security → Location Services on your iPhone",
    "zh-TW": "※如果沒有顯示「位置資訊」，也請檢查 iPhone 本身的『設定 → 隱私權與安全性 → 定位服務』"
  },

  location_permission_android_step1: {
    ja: "① Chromeで<strong>マチナウを開いたまま</strong>にします",
    en: "① Keep <strong>Machinau open</strong> in Chrome",
    "zh-TW": "① 在 Chrome 中<strong>保持 Machinau 開啟</strong>"
  },

  location_permission_android_step2: {
    ja: "② アドレスバー左側の<strong>サイト情報アイコン</strong>を押します",
    en: "② Tap the <strong>site info icon</strong> on the left of the address bar",
    "zh-TW": "② 點按網址列左側的<strong>網站資訊圖示</strong>"
  },

  location_permission_android_step3: {
    ja: "③ <strong>「権限」</strong>を押します",
    en: "③ Tap <strong>\"Permissions\"</strong>",
    "zh-TW": "③ 點按<strong>「權限」</strong>"
  },

  location_permission_android_step4: {
    ja: "④ <strong>「位置情報」</strong>を押します",
    en: "④ Tap <strong>\"Location\"</strong>",
    "zh-TW": "④ 點按<strong>「位置資訊」</strong>"
  },

  location_permission_android_step5: {
    ja: "⑤ <strong>「許可」</strong>へ変更します",
    en: "⑤ Change it to <strong>\"Allow\"</strong>",
    "zh-TW": "⑤ 改為<strong>「允許」</strong>"
  },

  location_permission_android_step6: {
    ja: "⑥ マチナウへ戻ります",
    en: "⑥ Return to Machinau",
    "zh-TW": "⑥ 返回 Machinau"
  },

  location_permission_android_step7: {
    ja: "⑦ <strong>「もう一度試す」</strong>を押します",
    en: "⑦ Tap <strong>\"Try Again\"</strong>",
    "zh-TW": "⑦ 點按<strong>「再試一次」</strong>"
  },

  location_permission_android_note1: {
    ja: "※端末やChromeのバージョンによって、鍵マーク・調整アイコン・サイト情報など、アイコンや名称が異なる場合があります。",
    en: "※ Depending on your device and Chrome version, the icon may appear as a lock mark, sliders icon, or \"Site info\" instead.",
    "zh-TW": "※依裝置和 Chrome 版本不同，圖示可能顯示為鎖頭標誌、調整圖示或「網站資訊」等不同名稱。"
  },

  location_permission_android_note2: {
    ja: "それでも直らない場合は、Chromeの<strong>︙ → 設定 → サイトの設定 → 位置情報</strong>から確認する方法もあります。",
    en: "If that doesn't help, you can also check via Chrome's <strong>︙ → Settings → Site settings → Location</strong>.",
    "zh-TW": "如果還是無法解決，也可以從 Chrome 的<strong>︙ → 設定 → 網站設定 → 位置資訊</strong>檢查。"
  },

  location_permission_android_device_note: {
    ja: "スマホ本体の位置情報がOFFになっている場合は、端末の設定で位置情報をONにしてください（設定画面の名前は機種によって異なります）。",
    en: "If location is turned off on the phone itself, turn it on in your device settings (the menu names differ by model).",
    "zh-TW": "如果手機本身的位置資訊已關閉，請在裝置設定中開啟位置資訊（設定畫面的名稱依機型而異）。"
  },

  location_permission_pc_step1: {
    ja: "① Chromeで<strong>マチナウを開いたまま</strong>にします",
    en: "① Keep <strong>Machinau open</strong> in Chrome",
    "zh-TW": "① 在 Chrome 中<strong>保持 Machinau 開啟</strong>"
  },

  location_permission_pc_step2: {
    ja: "② アドレスバー左側の<strong>サイト情報アイコン</strong>をクリックします",
    en: "② Click the <strong>site info icon</strong> on the left of the address bar",
    "zh-TW": "② 點擊網址列左側的<strong>網站資訊圖示</strong>"
  },

  location_permission_pc_step3: {
    ja: "③ <strong>「サイトの設定」</strong>をクリックします",
    en: "③ Click <strong>\"Site settings\"</strong>",
    "zh-TW": "③ 點擊<strong>「網站設定」</strong>"
  },

  location_permission_pc_step4: {
    ja: "④ <strong>「位置情報」</strong>を探します",
    en: "④ Find <strong>\"Location\"</strong>",
    "zh-TW": "④ 找到<strong>「位置資訊」</strong>"
  },

  location_permission_pc_step5: {
    ja: "⑤ <strong>「許可」</strong>へ変更します",
    en: "⑤ Change it to <strong>\"Allow\"</strong>",
    "zh-TW": "⑤ 改為<strong>「允許」</strong>"
  },

  location_permission_pc_step6: {
    ja: "⑥ マチナウの画面へ戻ります",
    en: "⑥ Return to the Machinau screen",
    "zh-TW": "⑥ 返回 Machinau 畫面"
  },

  location_permission_pc_step7: {
    ja: "⑦ 必要であればページを再読み込みします",
    en: "⑦ Reload the page if needed",
    "zh-TW": "⑦ 如有需要，重新載入頁面"
  },

  location_permission_pc_step8: {
    ja: "⑧ <strong>「もう一度試す」</strong>を押します",
    en: "⑧ Click <strong>\"Try Again\"</strong>",
    "zh-TW": "⑧ 點擊<strong>「再試一次」</strong>"
  },

  location_permission_pc_note1: {
    ja: "それでも直らない場合は、Chromeの<strong>︙ → 設定 → プライバシーとセキュリティ → サイトの設定 → 位置情報</strong>も確認してください。",
    en: "If that doesn't help, also check via Chrome's <strong>︙ → Settings → Privacy and security → Site settings → Location</strong>.",
    "zh-TW": "如果還是無法解決，也請檢查 Chrome 的<strong>︙ → 設定 → 隱私權與安全性 → 網站設定 → 位置資訊</strong>。"
  },

  location_permission_pc_note2: {
    ja: "Windows / Mac本体の位置情報がOFFの場合は、ブラウザ側だけでは取得できない場合があるため、パソコン本体の位置情報設定も確認してください。",
    en: "If location is turned off in your Windows or Mac system settings, the browser alone can't access it — please check your computer's system-level location settings too.",
    "zh-TW": "如果 Windows / Mac 本身的位置資訊已關閉，僅靠瀏覽器可能無法取得，請也檢查電腦本身的位置資訊設定。"
  },

  location_permission_guide_footer: {
    ja: "設定を変更したら、この画面に戻って「もう一度試す」を押してください。",
    en: "After changing the setting, come back to this screen and tap \"Try Again.\"",
    "zh-TW": "更改設定後，請回到這個畫面並點按「再試一次」。"
  },

  shops_current_location_order: {
    ja: "現在地から近い順",
    en: "Nearest First",
    "zh-TW": "依距離由近到遠"
  },

  // 地域から探す｜市区町村を選んだ時の店舗セクション。{AREA}は
  // japan-municipalities.jsの市区町村名(日本語のまま)に置き換える。
  shops_region_heading: {
    ja: "{AREA}で楽しめる場所",
    en: "Places to Enjoy in {AREA}",
    "zh-TW": "{AREA} 好玩的地方"
  },

  shops_region_order: {
    ja: "新しい順",
    en: "Newest First",
    "zh-TW": "依最新順序"
  },

  shops_region_note: {
    ja: "選んだ街に掲載中のお店・施設です（現在地からの距離では絞り込んでいません）。",
    en: "Shops and spots listed in the town you picked (not limited by distance from you).",
    "zh-TW": "這是你所選城市中刊登的店家・設施（並未依與目前位置的距離篩選）。"
  },

  shops_region_back_button: {
    ja: "📍 現在地の近くに戻る",
    en: "📍 Back to places near me",
    "zh-TW": "📍 回到目前位置附近"
  },

  shops_region_other_button: {
    ja: "🗺️ ほかの地域を選ぶ",
    en: "🗺️ Pick another area",
    "zh-TW": "🗺️ 選擇其他地區"
  },

  shops_nearby_empty: {
    ja: "現在地から15km以内に、掲載中のお店・施設はまだありません。ほかの地域のお店・施設は「地域から探す」で見られます。",
    en: "There are no listed places within 15 km of you yet. You can browse other areas with \"Explore by Area.\"",
    "zh-TW": "目前位置 15 公里內還沒有刊登的店家・設施。其他地區的店家・設施可以從「從地區搜尋」查看。"
  },
  shops_nearby_empty_area_button: {
    ja: "地域から探す",
    en: "Explore by Area",
    "zh-TW": "從地區搜尋"
  },
  shops_region_empty: {
    ja: "現在、この地域に掲載中のお店・施設はありません。",
    en: "There are no shops or spots listed in this area yet.",
    "zh-TW": "目前這個地區沒有刊登的店家・設施。"
  },

  shops_loading: {
    ja: "掲載中の情報を読み込んでいます…",
    en: "Loading listings…",
    "zh-TW": "正在載入刊登中的資訊…"
  },

  more_button: {
    ja: "もっと見る",
    en: "Show More",
    "zh-TW": "查看更多"
  },

  // TOP店舗一覧の全件表示中に「もっと見る」ボタンが切り替わる文言
  // (app.jsのrenderShops()がボタンのdata-i18nをmore_button⇔close_buttonで切り替える)。
  close_button: {
    ja: "閉じる",
    en: "Close",
    "zh-TW": "關閉"
  },

  // サイト全体改善 G｜旅の保存箱の共有。送るのは公開中のお店・施設の ID だけ(位置情報・利用者の情報は含めない)。
  travel_box_share_button: {
    ja: "保存したお店・施設をシェアする",
    en: "Share saved shops & places",
    "zh-TW": "分享收藏的店家・設施"
  },
  travel_box_share_note: {
    ja: "送れるのは公開中のお店・施設だけで、一度に最大30件までです。リンクに位置情報やあなたの情報は含まれません。",
    en: "Only places that are currently listed are sent, up to 30 at a time. The link doesn't include your location or any personal information.",
    "zh-TW": "可傳送的僅限公開中的店家與設施，一次最多 30 件。連結中不包含位置資訊或您的個人資訊。"
  },
  // サイト全体改善 第3弾｜TOP のフッターの名前・読みもの一覧(column-list.html)・投稿の入口(contribute.html)。
  footer_brand: {
    ja: "マチナウ",
    en: "Machinau",
    "zh-TW": "Machinau"
  },
  column_list_doc_title: {
    ja: "マチナウ読み物 一覧｜マチナウ",
    en: "Machinau Reads | Machinau",
    "zh-TW": "Machinau 文章列表｜Machinau"
  },
  column_list_brand: {
    ja: "マチナウ読み物",
    en: "Machinau Reads",
    "zh-TW": "Machinau 文章"
  },
  column_list_heading: {
    ja: "読み物を探す",
    en: "Find an article",
    "zh-TW": "尋找文章"
  },
  column_list_month_label: {
    ja: "掲載年月",
    en: "Month published",
    "zh-TW": "刊登年月"
  },
  column_list_category_label: {
    ja: "カテゴリー",
    en: "Category",
    "zh-TW": "分類"
  },
  column_list_all: {
    ja: "すべて",
    en: "All",
    "zh-TW": "全部"
  },
  column_list_reset: {
    ja: "条件をリセット",
    en: "Clear filters",
    "zh-TW": "重設條件"
  },
  column_list_loading: {
    ja: "読み込んでいます…",
    en: "Loading…",
    "zh-TW": "載入中…"
  },
  column_list_no_match: {
    ja: "この条件に一致する読み物はまだありません。",
    en: "No articles match these filters yet.",
    "zh-TW": "目前尚無符合此條件的文章。"
  },
  column_list_load_error: {
    ja: "読み物を読み込めませんでした。時間をおいて再度お試しください。",
    en: "We couldn't load the articles. Please try again later.",
    "zh-TW": "無法載入文章。請稍後再試一次。"
  },
  column_list_language_note: {
    ja: "",
    en: "Some titles and summaries are shown in Japanese because an English version isn't ready yet. Open an article to read it in English.",
    "zh-TW": "部分標題與摘要尚無繁體中文版本，因此以日文顯示。開啟文章即可閱讀繁體中文版。"
  },
  column_list_back: {
    ja: "← マチナウTOPへ戻る",
    en: "← Back to Machinau",
    "zh-TW": "← 返回 Machinau 首頁"
  },
  "column_category_街を知る": {
    ja: "街を知る",
    en: "Know the Town",
    "zh-TW": "認識城市"
  },
  "column_category_街を歩く": {
    ja: "街を歩く",
    en: "Walk the Town",
    "zh-TW": "漫步城市"
  },
  "column_category_食べる・飲む": {
    ja: "食べる・飲む",
    en: "Eat & Drink",
    "zh-TW": "美食與飲品"
  },
  "column_category_見る・遊ぶ": {
    ja: "見る・遊ぶ",
    en: "See & Do",
    "zh-TW": "觀光・遊樂"
  },
  "column_category_地元のくらし": {
    ja: "地元のくらし",
    en: "Local Life",
    "zh-TW": "在地生活"
  },
  "column_category_旅のヒント": {
    ja: "旅のヒント",
    en: "Travel Tips",
    "zh-TW": "旅行小提示"
  },
  "column_category_ちょっと深掘り": {
    ja: "ちょっと深掘り",
    en: "A Little Deeper",
    "zh-TW": "深入一點"
  },
  contribute_doc_title: {
    ja: "この街で、何か見つけた？｜マチナウ",
    en: "Found something in town? | Machinau",
    "zh-TW": "在這座城市，有什麼新發現嗎？｜Machinau"
  },
  contribute_brand_caption: {
    ja: "街の「今」がわかる案内所",
    en: "Your guide to what's happening in town",
    "zh-TW": "讓你掌握城市「現況」的資訊站"
  },
  contribute_home_link: {
    ja: "← トップへ戻る",
    en: "← Back to top",
    "zh-TW": "← 返回首頁"
  },
  contribute_hero_label: {
    ja: "街のみんなで届ける",
    en: "Shared by the people in town",
    "zh-TW": "由城市裡的大家一起傳遞"
  },
  contribute_heading: {
    ja: "この街で、何か見つけた？",
    en: "Found something in town?",
    "zh-TW": "在這座城市，有什麼新發現嗎？"
  },
  contribute_lead: {
    ja: "イベント、お店、景色、街のちょっとした変化。\n見つけた「今」を、写真付きでも投稿できます。",
    en: "Events, shops, views, little changes around town.\nShare what you found right now, with or without photos.",
    "zh-TW": "活動、店家、風景、城市裡的小小變化。\n找到的「現況」，也可以附上照片發布。"
  },
  contribute_street_heading: {
    ja: "投稿してみませんか？",
    en: "Anything to share?",
    "zh-TW": "要不要來發布看看？"
  },
  contribute_street_text: {
    ja: "景色、お店、イベント、ちょっとした発見など。\n写真なしでも、写真を付けても投稿できます。",
    en: "A view, a shop, an event, a small discovery.\nYou can post with or without photos.",
    "zh-TW": "風景、店家、活動、小小的發現等等。\n沒有照片也可以發布，也可以附上照片。"
  },
  contribute_street_message: {
    ja: "あなたが今見つけたものが、次の旅行者の「知っててよかった」になる。",
    en: "What you found today could be what the next traveler is glad to know.",
    "zh-TW": "你現在找到的東西，將成為下一位旅行者「幸好有知道」的事。"
  },
  contribute_street_cta: {
    ja: "街の「今」を投稿する →",
    en: "Post what's happening now →",
    "zh-TW": "發布城市的「現況」 →"
  },
  contribute_thread_heading: {
    ja: "街の今スレッド",
    en: "Town Now Threads",
    "zh-TW": "城市現況討論串"
  },
  contribute_thread_text: {
    ja: "その場所について、聞きたいこと・伝えたいことを書いて、近くの人と話せます。\n会話はその日の0時まで。",
    en: "Ask or share something about a place and talk with people nearby.\nConversations end at midnight that day.",
    "zh-TW": "關於那個地方，可以寫下想問的事、想傳達的事，和附近的人聊聊。\n對話到當天凌晨 0 點為止。"
  },
  contribute_thread_cta: {
    ja: "新しいスレッドを立てる →",
    en: "Start a new thread →",
    "zh-TW": "建立新的討論串 →"
  },
  contribute_shop_heading: {
    ja: "お店・施設の方へ",
    en: "For shops & venues",
    "zh-TW": "致店家・設施業者"
  },
  contribute_shop_text: {
    ja: "お店・施設からは、店舗アカウントで今だけ投稿ができます（有効な閲覧があった日だけ1投稿100円・税込）。",
    en: "Shops and venues can post \"Just for Now\" updates from a business account. Details and fees are explained on the next page (in Japanese).",
    "zh-TW": "店家與設施可透過店家帳號發布今日限定貼文（僅在有有效瀏覽的日子收費，每則貼文 100 日圓，含稅）。"
  },
  contribute_shop_cta: {
    ja: "投稿について詳しく見る →",
    en: "Learn more (in Japanese) →",
    "zh-TW": "查看發布的詳細說明 →"
  },
  contribute_rules_heading: {
    ja: "投稿する前に",
    en: "Before you post",
    "zh-TW": "發布前須知"
  },
  contribute_rule_photo: {
    ja: "写真は自分で撮影したもの、または投稿権限があるものをお使いください",
    en: "Use photos you took yourself or have permission to post.",
    "zh-TW": "請使用您自己拍攝的照片，或您有權發布的照片"
  },
  contribute_rule_privacy: {
    ja: "個人が特定できる写真や、プライバシーへの配慮をお願いします",
    en: "Please respect privacy and avoid photos that identify people.",
    "zh-TW": "請避免使用可辨識個人的照片，並請注意隱私"
  },
  contribute_rule_review: {
    ja: "投稿内容は確認のうえ公開される場合があります",
    en: "Posts may be reviewed before they are published.",
    "zh-TW": "發布內容可能會在確認後才公開"
  },
  contribute_rule_emergency: {
    ja: "危険情報・緊急を要する情報は、まず消防・警察等の公的機関へご連絡ください",
    en: "For dangers or emergencies, contact the fire department, police or other authorities first.",
    "zh-TW": "如有危險資訊或緊急資訊，請先聯絡消防、警察等政府機關"
  },
  contribute_rule_false: {
    ja: "虚偽の情報や、他者の権利を侵害する投稿はご遠慮ください",
    en: "Do not post false information or anything that infringes others' rights.",
    "zh-TW": "請勿發布不實資訊，或侵害他人權利的內容"
  },
  contribute_rules_more_before: {
    ja: "詳しくは",
    en: "See the ",
    "zh-TW": "詳情請參閱"
  },
  contribute_terms_link: {
    ja: "利用規約",
    en: "Terms of Service",
    "zh-TW": "使用條款"
  },
  contribute_rules_more_and: {
    ja: "・",
    en: " and ",
    "zh-TW": "・"
  },
  contribute_privacy_link: {
    ja: "プライバシーポリシー",
    en: "Privacy Policy",
    "zh-TW": "隱私權政策"
  },
  contribute_rules_more_after: {
    ja: "をご覧ください。",
    en: " (in Japanese).",
    "zh-TW": "。"
  },
  contribute_back: {
    ja: "← マチナウTOPへ戻る",
    en: "← Back to Machinau",
    "zh-TW": "← 返回 Machinau 首頁"
  },
  // サイト全体改善 第4弾｜town-now-post.html の固定の文言(英語の TOP から移っても日本語に戻らない)。
  townnow_post_heading: {
    ja: "街の今スレッド",
    en: "Town Now Threads",
    "zh-TW": "城市現況討論串"
  },
  townnow_post_lead: {
    ja: "その場所について、聞きたいこと・伝えたいことを書いてください。話題の場所の近くにいる人に表示され、その日の0時に公開を終了します。",
    en: "Ask or share something about a place. Your post is shown to people near that place and stays up until midnight that day.",
    "zh-TW": "請寫下關於那個地方想問的事、想傳達的事。內容會顯示給在話題地點附近的人，並於當天凌晨 0 點結束公開。"
  },
  townnow_post_place_label: {
    ja: "どこの話？",
    en: "Which place?",
    "zh-TW": "是哪裡的話題？"
  },
  townnow_post_use_current_location: {
    ja: "現在地を使う",
    en: "Use my location",
    "zh-TW": "使用目前位置"
  },
  townnow_post_choose_place: {
    ja: "場所を選ぶ",
    en: "Choose a place",
    "zh-TW": "選擇地點"
  },
  townnow_post_prefecture_label: {
    ja: "都道府県",
    en: "Prefecture",
    "zh-TW": "都道府縣"
  },
  townnow_post_municipality_label: {
    ja: "市区町村",
    en: "City / town",
    "zh-TW": "市區町村"
  },
  townnow_post_select_placeholder: {
    ja: "選択してください",
    en: "Please choose",
    "zh-TW": "請選擇"
  },
  townnow_post_prefecture_first: {
    ja: "先に都道府県を選んでください",
    en: "Choose a prefecture first",
    "zh-TW": "請先選擇都道府縣"
  },
  townnow_post_confirm_place: {
    ja: "この場所にする",
    en: "Use this place",
    "zh-TW": "就選這個地點"
  },
  townnow_post_place_hint: {
    ja: "施設の場所が分からない場合は、所在地の市区町村を調べて選んでください。",
    en: "If you're not sure where a place is, look up its city or town and choose that.",
    "zh-TW": "如果不知道設施的位置，請查詢其所在的市區町村並選擇。"
  },
  townnow_post_text_label: {
    ja: "何を聞く・伝える？",
    en: "What do you want to ask or share?",
    "zh-TW": "想問什麼・想傳達什麼？"
  },
  townnow_post_submit: {
    ja: "投稿する",
    en: "Post",
    "zh-TW": "發布"
  },
  townnow_post_back_top: {
    ja: "マチナウTOPへ戻る",
    en: "Back to Machinau",
    "zh-TW": "返回 Machinau 首頁"
  },
  townnow_post_back_top_arrow: {
    ja: "← マチナウTOPへ戻る",
    en: "← Back to Machinau",
    "zh-TW": "← 返回 Machinau 首頁"
  },
  townnow_post_text_placeholder: {
    ja: "例：今から沖縄ワールド行くけど、おすすめある？",
    en: "e.g. Heading to Okinawa World now. Any tips?",
    "zh-TW": "例：現在要去沖繩世界，有什麼推薦的嗎？"
  },
  townnow_post_error_no_geolocation: {
    ja: "この端末では現在地を取得できません。「場所を選ぶ」をお使いください。",
    en: "This device can't get your location. Please use \"Choose a place\".",
    "zh-TW": "此裝置無法取得目前位置。請使用「選擇地點」。"
  },
  townnow_post_locating: {
    ja: "現在地を取得しています…",
    en: "Getting your location…",
    "zh-TW": "正在取得目前位置…"
  },
  townnow_post_error_maps: {
    ja: "地図情報の読み込みに失敗しました。時間をおいて、もう一度お試しください。",
    en: "We couldn't load the map data. Please try again later.",
    "zh-TW": "無法載入地圖資訊。請稍後再試一次。"
  },
  townnow_post_error_region: {
    ja: "現在地の市区町村を特定できませんでした。「場所を選ぶ」をお使いください。",
    en: "We couldn't find the city or town for your location. Please use \"Choose a place\".",
    "zh-TW": "無法確定目前位置的市區町村。請使用「選擇地點」。"
  },
  townnow_post_error_location: {
    ja: "現在地を取得できませんでした。位置情報の利用を許可するか、「場所を選ぶ」をお使いください。",
    en: "We couldn't get your location. Allow location access or use \"Choose a place\".",
    "zh-TW": "無法取得目前位置。請允許使用位置資訊，或使用「選擇地點」。"
  },
  townnow_post_checking_place: {
    ja: "場所を確認しています…",
    en: "Checking the place…",
    "zh-TW": "正在確認地點…"
  },
  townnow_post_error_place: {
    ja: "この場所を確認できませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't confirm this place. Please try again later.",
    "zh-TW": "無法確認這個地點。請稍後再試一次。"
  },
  townnow_post_sending: {
    ja: "送信しています…",
    en: "Sending…",
    "zh-TW": "傳送中…"
  },
  townnow_post_done_visible: {
    ja: "投稿しました。話題の場所の近くにいる人に表示されます。",
    en: "Posted. It's shown to people near the place.",
    "zh-TW": "已發布。內容會顯示給在話題地點附近的人。"
  },
  townnow_post_done_review: {
    ja: "投稿を受け付けました。確認後に公開されます。",
    en: "Thanks! Your post will be published after review.",
    "zh-TW": "已收到您的發布。確認後將會公開。"
  },
  townnow_post_error_rate: {
    ja: "短時間に続けて投稿されています。少し待ってから、もう一度お試しください。",
    en: "You're posting too often. Please wait a moment and try again.",
    "zh-TW": "您在短時間內連續發布。請稍等一下再試一次。"
  },
  townnow_post_error_invalid: {
    ja: "投稿できませんでした。場所と内容を確認して、もう一度お試しください。",
    en: "We couldn't post this. Check the place and your message, then try again.",
    "zh-TW": "無法發布。請確認地點與內容後再試一次。"
  },
  townnow_post_error_generic: {
    ja: "投稿できませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't post this. Please try again later.",
    "zh-TW": "無法發布。請稍後再試一次。"
  },
  townnow_post_place_selected: {
    ja: "どこの話：{place}",
    en: "Place: {place}",
    "zh-TW": "話題地點：{place}"
  },
  townnow_post_place_current: {
    ja: "{place}（現在地）",
    en: "{place} (your location)",
    "zh-TW": "{place}（目前位置）"
  },
  townnow_post_current_location: {
    ja: "現在地",
    en: "Your location",
    "zh-TW": "目前位置"
  },
  townnow_post_doc_title: {
    ja: "街の今スレッド｜マチナウ",
    en: "Town Now Threads | Machinau",
    "zh-TW": "城市現況討論串｜Machinau"
  },
  // サイト全体改善 第4弾｜community-board-post.html の固定の文言(英語の TOP から移っても日本語に戻らない)。
  board_post_label: {
    ja: "街の掲示板",
    en: "Community Board",
    "zh-TW": "城市留言板"
  },
  board_post_heading: {
    ja: "この街を訪れる人に、知ってほしいことを残そう",
    en: "Leave a tip for people visiting this town",
    "zh-TW": "為造訪這座城市的人，留下你希望他們知道的事"
  },
  board_post_lead: {
    ja: "「豊見城といえばマンゴーだよ」「ここから見る夕日がきれいだよ」など、旅行者や次にこの街を訪れる人へ伝えたいひとことを投稿できます。内容を確認のうえ、街の掲示板に掲載します。",
    en: "Share a short tip for travelers and the next visitors, like \"Tomigusuku is all about mangoes\" or \"The sunset from here is beautiful.\" We review posts before they appear on the board.",
    "zh-TW": "您可以發布想傳達給旅行者或下一位造訪這座城市的人的一句話，例如「說到豐見城就是芒果喔」「從這裡看的夕陽很美喔」。內容經確認後，將刊登在城市留言板上。"
  },
  board_post_current_location_label: {
    ja: "現在地",
    en: "Your location",
    "zh-TW": "目前位置"
  },
  board_post_detect_location: {
    ja: "現在地から対象の街を調べる",
    en: "Find the town from my location",
    "zh-TW": "從目前位置查詢目標城市"
  },
  board_post_text_label: {
    ja: "投稿内容",
    en: "Your message",
    "zh-TW": "發布內容"
  },
  board_post_submit: {
    ja: "投稿する",
    en: "Post",
    "zh-TW": "發布"
  },
  board_post_back_top_arrow: {
    ja: "← マチナウTOPへ戻る",
    en: "← Back to Machinau",
    "zh-TW": "← 返回 Machinau 首頁"
  },
  board_post_done: {
    ja: "投稿ありがとうございます。\n内容を確認後、街の掲示板に掲載します。",
    en: "Thank you for posting.\nIt will appear on the board after review.",
    "zh-TW": "感謝您的發布。\n內容確認後，將刊登在城市留言板上。"
  },
  board_post_text_placeholder: {
    ja: "例：豊見城といえばマンゴーだよ。ぜひ食べてみて！",
    en: "e.g. Tomigusuku is famous for mangoes. Be sure to try one!",
    "zh-TW": "例：說到豐見城就是芒果喔。一定要吃吃看！"
  },
  board_post_error_no_geolocation: {
    ja: "この端末では現在地を取得できません。",
    en: "This device can't get your location.",
    "zh-TW": "此裝置無法取得目前位置。"
  },
  board_post_locating: {
    ja: "現在地を取得しています…",
    en: "Getting your location…",
    "zh-TW": "正在取得目前位置…"
  },
  board_post_error_timeout: {
    ja: "現在地を取得できませんでした（時間切れ）。もう一度お試しいただくか、TOPの「ほかの地域を見る」から地域を選んで投稿してください。",
    en: "We couldn't get your location in time. Try again, or choose an area from \"See other areas\" on the top page to post.",
    "zh-TW": "無法取得目前位置（逾時）。請再試一次，或從首頁的「查看其他地區」選擇地區後發布。"
  },
  board_post_error_no_response: {
    ja: "対象の街を確認できませんでした（応答がありません）。時間をおいてもう一度お試しいただくか、TOPの「ほかの地域を見る」から地域を選んで投稿してください。",
    en: "We couldn't confirm the town (no response). Try again later, or choose an area from \"See other areas\" on the top page to post.",
    "zh-TW": "無法確認目標城市（沒有回應）。請稍後再試一次，或從首頁的「查看其他地區」選擇地區後發布。"
  },
  board_post_error_maps: {
    ja: "地図情報の読み込みに失敗しました。時間をおいて、もう一度お試しください。",
    en: "We couldn't load the map data. Please try again later.",
    "zh-TW": "無法載入地圖資訊。請稍後再試一次。"
  },
  board_post_error_region: {
    ja: "対象の街を特定できませんでした。",
    en: "We couldn't identify the town.",
    "zh-TW": "無法確定目標城市。"
  },
  board_post_error_location: {
    ja: "現在地を取得できませんでした。位置情報の利用を許可してください。",
    en: "We couldn't get your location. Please allow location access.",
    "zh-TW": "無法取得目前位置。請允許使用位置資訊。"
  },
  board_post_error_auth_unavailable: {
    ja: "Firebase Authenticationが利用できません。",
    en: "Sign-in isn't available right now. Please try again later.",
    "zh-TW": "無法使用 Firebase Authentication。"
  },
  board_post_error_auth_timeout: {
    ja: "ログイン状態の確認が時間内に終わりませんでした。",
    en: "Checking your session took too long. Please try again.",
    "zh-TW": "無法在時間內完成登入狀態的確認。"
  },
  board_post_error_auth: {
    ja: "ログイン状態を確認できませんでした。",
    en: "We couldn't confirm your session.",
    "zh-TW": "無法確認登入狀態。"
  },
  board_post_error_auth_reload: {
    ja: "ログイン状態を確認できませんでした。ページを読み込み直してから、もう一度お試しください。",
    en: "We couldn't confirm your session. Reload the page and try again.",
    "zh-TW": "無法確認登入狀態。請重新載入頁面後再試一次。"
  },
  board_post_error_prepare: {
    ja: "投稿の準備ができませんでした。",
    en: "We couldn't prepare your post. Please try again.",
    "zh-TW": "無法準備發布。"
  },
  board_post_error_need_region: {
    ja: "先に現在地から対象の街を調べてください。",
    en: "First find the town from your location.",
    "zh-TW": "請先從目前位置查詢目標城市。"
  },
  board_post_error_empty: {
    ja: "投稿内容を入力してください。",
    en: "Please enter your message.",
    "zh-TW": "請輸入發布內容。"
  },
  board_post_sending: {
    ja: "送信しています…",
    en: "Sending…",
    "zh-TW": "傳送中…"
  },
  board_post_error_send: {
    ja: "投稿の送信に失敗しました。",
    en: "We couldn't send your post. Please try again.",
    "zh-TW": "發布傳送失敗。"
  },
  board_post_remote_heading: {
    ja: "{region}の掲示板に投稿",
    en: "Post to the {region} board",
    "zh-TW": "發布到 {region} 的留言板"
  },
  board_post_remote_lead: {
    ja: "{region}について知っていること、今の情報、おすすめなどを教えてください。",
    en: "Share what you know about {region}: what's happening now, tips and recommendations.",
    "zh-TW": "請告訴我們您所知道的關於 {region} 的事、最新資訊、推薦景點等等。"
  },
  board_post_region_result: {
    ja: "対象の街：{region}",
    en: "Town: {region}",
    "zh-TW": "目標城市：{region}"
  },
  board_post_server_auth: {
    ja: "認証情報がありません。",
    en: "We couldn't confirm your session. Reload the page and try again.",
    "zh-TW": "沒有驗證資訊。"
  },
  board_post_server_invalid: {
    ja: "入力内容を確認してください。",
    en: "Please check your message and try again.",
    "zh-TW": "請確認輸入內容。"
  },
  board_post_server_url: {
    ja: "URLを含む投稿はできません。URLを除いて投稿してください。",
    en: "Posts can't include links. Remove the URL and try again.",
    "zh-TW": "無法發布包含 URL 的內容。請移除 URL 後再發布。"
  },
  board_post_server_rate: {
    ja: "短時間に続けて投稿されています。少し待ってから、もう一度お試しください。",
    en: "You're posting too often. Please wait a moment and try again.",
    "zh-TW": "您在短時間內連續發布。請稍等一下再試一次。"
  },
  board_post_server_region: {
    ja: "地域情報を確認できませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't confirm the area. Please try again later.",
    "zh-TW": "無法確認地區資訊。請稍後再試一次。"
  },
  board_post_server_error: {
    ja: "投稿の送信中にエラーが発生しました。時間をおいて、もう一度お試しください。",
    en: "Something went wrong while sending your post. Please try again later.",
    "zh-TW": "傳送發布時發生錯誤。請稍後再試一次。"
  },
  board_post_doc_title: {
    ja: "街の掲示板投稿｜マチナウ",
    en: "Post to the Community Board | Machinau",
    "zh-TW": "城市留言板發布｜Machinau"
  },
  // サイト全体改善 第4弾｜contact.html の固定の文言(英語の TOP から移っても日本語に戻らない)。
  contact_brand_caption: {
    ja: "街の「今」がわかる案内所",
    en: "Your guide to what's happening in town",
    "zh-TW": "讓你掌握城市「現況」的資訊站"
  },
  contact_home_link: {
    ja: "← マチナウTOPへ",
    en: "← Machinau top",
    "zh-TW": "← Machinau 首頁"
  },
  contact_hero_label: {
    ja: "マチナウ運営へ",
    en: "To the Machinau team",
    "zh-TW": "致 Machinau 營運團隊"
  },
  contact_heading: {
    ja: "お問い合わせ・ご意見",
    en: "Contact & Feedback",
    "zh-TW": "聯絡・意見"
  },
  contact_free_badge: {
    ja: "旅行者・地域の方・お店・施設の方、どなたでもご利用いただけます。",
    en: "Open to everyone: travelers, locals, shops and venues.",
    "zh-TW": "旅行者、在地居民、店家與設施業者，任何人都可以使用。"
  },
  contact_form_heading: {
    ja: "お問い合わせフォーム",
    en: "Contact form",
    "zh-TW": "聯絡表單"
  },
  contact_form_lead: {
    ja: "掲載内容の変更・訂正、不具合のご報告、機能へのご意見・ご要望など、マチナウ運営へお気軽にお送りください。",
    en: "Send the Machinau team changes or corrections to listings, bug reports, or feedback and requests about features.",
    "zh-TW": "刊登內容的變更・更正、問題回報、對功能的意見・需求等等，歡迎隨時傳送給 Machinau 營運團隊。"
  },
  contact_required: {
    ja: "必須",
    en: "Required",
    "zh-TW": "必填"
  },
  contact_optional: {
    ja: "任意",
    en: "Optional",
    "zh-TW": "選填"
  },
  contact_category_placeholder: {
    ja: "選んでください",
    en: "Please choose",
    "zh-TW": "請選擇"
  },
  contact_category_shop: {
    ja: "お店・施設について",
    en: "About a shop or venue",
    "zh-TW": "關於店家・設施"
  },
  contact_category_listing_change: {
    ja: "掲載内容・写真の変更",
    en: "Change listing details or photos",
    "zh-TW": "變更刊登內容・照片"
  },
  contact_category_correction: {
    ja: "情報の訂正",
    en: "Correct information",
    "zh-TW": "資訊更正"
  },
  contact_category_bug: {
    ja: "不具合の報告",
    en: "Report a problem",
    "zh-TW": "問題回報"
  },
  contact_category_feedback: {
    ja: "ご意見・ご要望",
    en: "Feedback or requests",
    "zh-TW": "意見・需求"
  },
  contact_category_other: {
    ja: "その他",
    en: "Other",
    "zh-TW": "其他"
  },
  contact_email_hint: {
    ja: "返信をご希望の場合は入力してください。",
    en: "Enter this if you'd like a reply.",
    "zh-TW": "如果希望收到回覆，請填寫。"
  },
  contact_message_hint: {
    ja: "写真の添付には対応していません。掲載写真の変更をご希望の場合は、その旨と返信先メールアドレスをご記入ください。運営からご連絡します。",
    en: "Photo attachments aren't supported. To change a listing photo, say so and include your email address. We'll get in touch.",
    "zh-TW": "不支援附加照片。如果希望變更刊登照片，請註明並填寫回覆用的電子郵件地址。營運團隊將與您聯絡。"
  },
  contact_honeypot_label: {
    ja: "確認用（入力しないでください）",
    en: "For verification (leave blank)",
    "zh-TW": "確認用（請勿填寫）"
  },
  contact_submit: {
    ja: "この内容で送信する",
    en: "Send",
    "zh-TW": "以此內容傳送"
  },
  contact_done_heading: {
    ja: "お問い合わせを受け付けました。",
    en: "We received your message.",
    "zh-TW": "已收到您的聯絡訊息。"
  },
  contact_done_text: {
    ja: "マチナウ運営へ届きました。ありがとうございます。返信先をご記入いただいた場合は、必要に応じて運営からご連絡します。",
    en: "It has reached the Machinau team. Thank you. If you left an email address, we'll contact you if needed.",
    "zh-TW": "訊息已送達 Machinau 營運團隊。謝謝您。如果您有填寫回覆地址，營運團隊將視需要與您聯絡。"
  },
  contact_back_top_arrow: {
    ja: "← マチナウTOPへ戻る",
    en: "← Back to Machinau",
    "zh-TW": "← 返回 Machinau 首頁"
  },
  contact_footer: {
    ja: "マチナウ\n街の今を知れば、もっと、いい旅になる。",
    en: "Machinau\nKnow what's happening in town now, and make your trip even better.",
    "zh-TW": "Machinau\n知道這座城市的現況，就能讓旅程更美好。"
  },
  contact_email_placeholder: {
    ja: "例：info@example.com",
    en: "e.g. info@example.com",
    "zh-TW": "例：info@example.com"
  },
  contact_error_category: {
    ja: "お問い合わせ種別を選んでください。",
    en: "Please choose a type of inquiry.",
    "zh-TW": "請選擇聯絡類別。"
  },
  contact_error_message: {
    ja: "お問い合わせ内容を入力してください。",
    en: "Please enter your message.",
    "zh-TW": "請輸入聯絡內容。"
  },
  contact_error_email: {
    ja: "メールアドレスの形式を確認してください。",
    en: "Please check the email address format.",
    "zh-TW": "請確認電子郵件地址的格式。"
  },
  contact_sending: {
    ja: "送信しています…",
    en: "Sending…",
    "zh-TW": "傳送中…"
  },
  contact_error_network: {
    ja: "送信できませんでした。通信状況を確認して、もう一度お試しください。",
    en: "We couldn't send your message. Check your connection and try again.",
    "zh-TW": "無法傳送。請確認連線狀況後再試一次。"
  },
  contact_label_category: {
    ja: "お問い合わせ種別",
    en: "Type of inquiry",
    "zh-TW": "聯絡類別"
  },
  contact_label_name: {
    ja: "お名前 または 店舗・施設名",
    en: "Your name or shop / venue name",
    "zh-TW": "姓名或店家・設施名稱"
  },
  contact_label_email: {
    ja: "返信先メールアドレス",
    en: "Email for reply",
    "zh-TW": "回覆用電子郵件地址"
  },
  contact_label_message: {
    ja: "お問い合わせ内容",
    en: "Message",
    "zh-TW": "聯絡內容"
  },
  contact_privacy_note: {
    ja: "ご記入いただいたお名前・メールアドレス・お問い合わせ内容は、お問い合わせへの対応とサービス改善のためにのみ使用し、公開されることはありません。",
    en: "Your name, email address and message are used only to respond to your inquiry and improve the service, and are never made public.",
    "zh-TW": "您填寫的姓名、電子郵件地址與聯絡內容，僅用於回覆您的聯絡事項及改善服務，不會公開。"
  },
  contact_privacy_more_before: {
    ja: "詳しくは",
    en: "See the ",
    "zh-TW": "詳情請參閱"
  },
  contact_privacy_link: {
    ja: "プライバシーポリシー",
    en: "Privacy Policy",
    "zh-TW": "隱私權政策"
  },
  contact_privacy_more_after: {
    ja: "をご覧ください。",
    en: " (in Japanese) for details.",
    "zh-TW": "。"
  },
  contact_server_busy: {
    ja: "ただいまお問い合わせが集中しています。時間をおいて、もう一度お試しください。",
    en: "We're receiving many inquiries right now. Please try again later.",
    "zh-TW": "目前聯絡訊息較多。請稍後再試一次。"
  },
  contact_server_rate: {
    ja: "短時間に続けて送信されています。3分ほど時間をおいて、もう一度お試しください。",
    en: "You're sending too often. Please wait about 3 minutes and try again.",
    "zh-TW": "您在短時間內連續傳送。請等待約 3 分鐘後再試一次。"
  },
  contact_error_send: {
    ja: "送信できませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't send your message. Please try again later.",
    "zh-TW": "無法傳送。請稍後再試一次。"
  },
  contact_error_too_long: {
    ja: "{field}は{max}文字以内で入力してください。",
    en: "{field} must be {max} characters or fewer.",
    "zh-TW": "{field}請輸入 {max} 個字以內。"
  },
  contact_field_name: {
    ja: "お名前・店舗名",
    en: "Name",
    "zh-TW": "姓名・店家名稱"
  },
  contact_field_email: {
    ja: "メールアドレス",
    en: "Email address",
    "zh-TW": "電子郵件地址"
  },
  contact_field_message: {
    ja: "お問い合わせ内容",
    en: "Message",
    "zh-TW": "聯絡內容"
  },
  contact_doc_title: {
    ja: "お問い合わせ・ご意見｜マチナウ",
    en: "Contact & Feedback | Machinau",
    "zh-TW": "聯絡・意見回饋｜Machinau"
  },
  // 広告専用フォーム(ad-contact.html)の固定の文言(2026-11-21追加)。
  ad_contact_doc_title: {
    ja: "広告掲載のお問い合わせ｜マチナウ",
    en: "Advertise with us | Machinau",
    "zh-TW": "廣告刊登聯絡｜Machinau"
  },
  ad_contact_hero_label: {
    ja: "広告掲載について",
    en: "Advertising",
    "zh-TW": "關於廣告刊登"
  },
  ad_contact_heading: {
    ja: "広告掲載のお問い合わせ",
    en: "Advertise with us",
    "zh-TW": "廣告刊登聯絡"
  },
  ad_contact_badge: {
    ja: "広告枠は都道府県ごとに最大3社まで。同業種は1社だけ、先着順です。",
    en: "Up to 3 advertisers per prefecture, one per industry, first come first served.",
    "zh-TW": "每個都道府縣最多 3 家，同一業種僅限 1 家，先到先得。"
  },
  ad_contact_form_heading: {
    ja: "広告掲載フォーム",
    en: "Advertising inquiry form",
    "zh-TW": "廣告刊登表單"
  },
  ad_contact_form_lead: {
    ja: "マチナウへの広告掲載のご相談はこちらからお送りください。料金・期間は、お問い合わせの内容を確認してからご案内します。",
    en: "Send us your advertising inquiry here. We will reply with pricing and period details after reviewing your message.",
    "zh-TW": "廣告刊登的諮詢請從這裡送出。我們確認內容後，會回覆費用與期間的說明。"
  },
  ad_contact_label_company: {
    ja: "会社名",
    en: "Company name",
    "zh-TW": "公司名稱"
  },
  ad_contact_label_name: {
    ja: "担当者名",
    en: "Contact person",
    "zh-TW": "聯絡人姓名"
  },
  ad_contact_label_email: {
    ja: "返信先メールアドレス",
    en: "Reply email address",
    "zh-TW": "回覆用電子郵件"
  },
  ad_contact_email_hint: {
    ja: "料金・期間のご案内は、このアドレスへお送りします。",
    en: "We will send pricing and period details to this address.",
    "zh-TW": "費用與期間的說明會寄到這個信箱。"
  },
  ad_contact_label_phone: {
    ja: "電話番号",
    en: "Phone number",
    "zh-TW": "電話號碼"
  },
  ad_contact_label_industry: {
    ja: "業種",
    en: "Industry",
    "zh-TW": "業種"
  },
  ad_contact_industry_hint: {
    ja: "広告枠は同業種1社までのため、確認に使います。",
    en: "Slots are limited to one advertiser per industry, so we use this to check.",
    "zh-TW": "廣告名額同一業種僅限 1 家，因此用於確認。"
  },
  ad_contact_industry_placeholder: {
    ja: "例：ホテル・旅館",
    en: "e.g. Hotels and inns",
    "zh-TW": "例：飯店・旅館"
  },
  ad_contact_label_area: {
    ja: "掲載希望エリア",
    en: "Preferred area",
    "zh-TW": "希望刊登的地區"
  },
  ad_contact_area_hint: {
    ja: "広告枠は都道府県ごとです。",
    en: "Slots are per prefecture.",
    "zh-TW": "廣告名額以都道府縣為單位。"
  },
  ad_contact_area_placeholder: {
    ja: "例：沖縄県",
    en: "e.g. Okinawa",
    "zh-TW": "例：沖繩縣"
  },
  ad_contact_message_hint: {
    ja: "掲載したい内容や時期など、分かる範囲でご記入ください。",
    en: "Tell us what you would like to advertise and your timing, as far as you know.",
    "zh-TW": "請填寫想刊登的內容與時期等已知資訊。"
  },
  ad_contact_privacy_note: {
    ja: "ご記入いただいた会社名・担当者名・メールアドレス・お問い合わせ内容は、広告掲載への対応のためにのみ使用し、公開されることはありません。",
    en: "Your company name, contact person, email address and message are used only to respond to your advertising inquiry and are never made public.",
    "zh-TW": "您填寫的公司名稱、聯絡人、電子郵件與內容僅用於回覆廣告刊登事宜，不會公開。"
  },
  ad_contact_done_heading: {
    ja: "お問い合わせを受け付けました。",
    en: "Thank you, we received your inquiry.",
    "zh-TW": "已收到您的聯絡。"
  },
  ad_contact_done_text: {
    ja: "マチナウ運営へ届きました。ありがとうございます。内容を確認して、料金・期間のご案内をメールでお送りします。",
    en: "Your inquiry has reached the Machinau team. We will review it and email you the pricing and period details.",
    "zh-TW": "已送達 Machinau 營運團隊。我們確認內容後，會以電子郵件寄送費用與期間的說明。"
  },
  ad_contact_error_company: {
    ja: "会社名を入力してください。",
    en: "Please enter your company name.",
    "zh-TW": "請輸入公司名稱。"
  },
  ad_contact_error_name: {
    ja: "担当者名を入力してください。",
    en: "Please enter the contact person's name.",
    "zh-TW": "請輸入聯絡人姓名。"
  },
  ad_contact_error_email_required: {
    ja: "メールアドレスを入力してください。",
    en: "Please enter your email address.",
    "zh-TW": "請輸入電子郵件。"
  },
  ad_contact_error_industry: {
    ja: "業種を入力してください。",
    en: "Please enter your industry.",
    "zh-TW": "請輸入業種。"
  },
  ad_contact_error_area: {
    ja: "掲載希望エリアを入力してください。",
    en: "Please enter your preferred area.",
    "zh-TW": "請輸入希望刊登的地區。"
  },
  ad_contact_error_message: {
    ja: "お問い合わせ内容を入力してください。",
    en: "Please enter your message.",
    "zh-TW": "請輸入聯絡內容。"
  },
  ad_contact_field_name: {
    ja: "担当者名",
    en: "Contact person",
    "zh-TW": "聯絡人姓名"
  },
  ad_contact_field_company: {
    ja: "会社名",
    en: "Company name",
    "zh-TW": "公司名稱"
  },
  ad_contact_field_phone: {
    ja: "電話番号",
    en: "Phone number",
    "zh-TW": "電話號碼"
  },
  ad_contact_field_industry: {
    ja: "業種",
    en: "Industry",
    "zh-TW": "業種"
  },
  ad_contact_field_area: {
    ja: "掲載希望エリア",
    en: "Preferred area",
    "zh-TW": "希望刊登的地區"
  },
  // サイト全体改善 第4弾｜post.html の固定の文言(英語の TOP から移っても日本語に戻らない)。
  post_brand_caption: {
    ja: "街の「今」がわかる案内所",
    en: "Your guide to what's happening in town",
    "zh-TW": "了解城市現況的指南"
  },
  post_home_link: {
    ja: "← トップへ戻る",
    en: "← Back to top",
    "zh-TW": "← 返回首頁"
  },
  post_hero_label: {
    ja: "街の「今」を届ける",
    en: "Share what's happening",
    "zh-TW": "傳遞城市的「現況」"
  },
  post_hero_lead: {
    ja: "タイムセール、限定メニュー、イベントだけでなく、 街で見つけた出来事の共有もできます。 地元の人も、旅行中の人も。",
    en: "Not just sales, limited menus and events: you can also share things you spotted around town. Locals and travelers alike.",
    "zh-TW": "不只是限時特賣、限定菜單和活動，也可以分享在街上發現的新鮮事。在地人和旅行中的人都可以。"
  },
  post_form_heading: {
    ja: "今の情報を届ける",
    en: "Share what's happening now",
    "zh-TW": "傳遞最新資訊"
  },
  post_form_lead: {
    ja: "投稿後、マチナウ運営による確認を行います。 承認された情報だけがトップページに掲載されます。",
    en: "After you post, the Machinau team reviews it. Only approved posts appear on the top page.",
    "zh-TW": "發布後，將由 Machinau 營運團隊進行確認。只有通過審核的資訊才會刊登在首頁。"
  },
  post_mode_question: {
    ja: "どんな「今」を届けますか？",
    en: "What would you like to share?",
    "zh-TW": "您想傳遞什麼樣的「現況」？"
  },
  post_shop_unavailable: {
    ja: "店舗・施設からの投稿は現在準備中です。「街で見つけた！」からの投稿はご利用いただけます。",
    en: "Posts from shops and venues aren't available yet. You can post with \"Spotted in town!\"",
    "zh-TW": "店家・設施的發布功能目前準備中。您可以使用「在街上發現了！」來發布。"
  },
  post_mode_shop: {
    ja: "お店・施設からのお知らせ",
    en: "News from a shop or venue",
    "zh-TW": "店家・設施的消息"
  },
  post_mode_street: {
    ja: "街で見つけた！",
    en: "Spotted in town!",
    "zh-TW": "在街上發現了！"
  },
  post_mode_reselect: {
    ja: "選び直す",
    en: "Change",
    "zh-TW": "重新選擇"
  },
  post_photo_notice: {
    ja: "写真は最大5枚まで選択できます。 1枚目の写真がトップページのメイン画像になります。 写真を付けずに投稿することもできます。",
    en: "You can choose up to 5 photos. The first photo becomes the main image on the top page. You can also post without photos.",
    "zh-TW": "照片最多可選擇 5 張。第 1 張照片將成為首頁的主圖。也可以不附照片發布。"
  },
  post_label_shop_name: {
    ja: "店舗・イベント名",
    en: "Shop or event name",
    "zh-TW": "店家・活動名稱"
  },
  post_required: {
    ja: "必須",
    en: "Required",
    "zh-TW": "必填"
  },
  post_optional: {
    ja: "任意",
    en: "Optional",
    "zh-TW": "選填"
  },
  post_optional_photos: {
    ja: "任意・最大5枚",
    en: "Optional, up to 5",
    "zh-TW": "選填・最多 5 張"
  },
  post_shop_name_help: {
    ja: "お客様に表示される正式な名称を入力してください。 お店・イベント名だけでなく、見つけた場所や出来事の名前でも構いません。",
    en: "Enter the name people will see. It can be a shop or event, or the name of a place or thing you found.",
    "zh-TW": "請輸入會向顧客顯示的正式名稱。不只是店家・活動名稱，也可以是發現的地點或事物的名稱。"
  },
  post_select_placeholder: {
    ja: "選択してください",
    en: "Please choose",
    "zh-TW": "請選擇"
  },
  post_duration_3: {
    ja: "3時間",
    en: "3 hours",
    "zh-TW": "3 小時"
  },
  post_duration_6: {
    ja: "6時間",
    en: "6 hours",
    "zh-TW": "6 小時"
  },
  post_duration_12: {
    ja: "12時間",
    en: "12 hours",
    "zh-TW": "12 小時"
  },
  post_duration_24: {
    ja: "24時間（今日いっぱい）",
    en: "24 hours (the rest of today)",
    "zh-TW": "24 小時（今天一整天）"
  },
  post_label_content: {
    ja: "内容",
    en: "Details",
    "zh-TW": "內容"
  },
  post_address_help: {
    ja: "入力すると、トップページの地図ボタンから Googleマップで検索できるようになります。",
    en: "If you enter it, people can search it on Google Maps from the map button on the top page.",
    "zh-TW": "輸入後，可從首頁的地圖按鈕在 Google 地圖上搜尋。"
  },
  post_location_help: {
    ja: "現在地から設定すると、住所入力を省略できます。 ここで設定するのは「この情報がある場所」であり、投稿者本人の居場所を公開するものではありません。",
    en: "Setting it from your location lets you skip the address. This is where the information is about, and your own location is not published.",
    "zh-TW": "從目前位置設定，可以省略輸入地址。這裡設定的是「這則資訊所在的地點」，並不會公開發布者本人的位置。"
  },
  post_street_location_hint: {
    ja: "場所を入れると、近くにいる人に見つけてもらいやすくなります。",
    en: "Adding the place helps people nearby find your post.",
    "zh-TW": "填寫地點後，更容易被附近的人發現。"
  },
  post_location_button: {
    ja: "この場所を現在地から設定",
    en: "Set this place from my location",
    "zh-TW": "從目前位置設定這個地點"
  },
  post_image_upload_title: {
    ja: "写真を選択（任意）",
    en: "Choose photos (optional)",
    "zh-TW": "選擇照片（選填）"
  },
  post_image_select: {
    ja: "＋ 写真を選ぶ",
    en: "+ Choose photos",
    "zh-TW": "＋ 選擇照片"
  },
  post_agreement: {
    ja: "入力内容に虚偽がなく、第三者の権利を侵害する 写真や文章を投稿していないことを確認しました。",
    en: "I confirm the information is true and my photos and text don't infringe anyone's rights.",
    "zh-TW": "我確認輸入內容沒有不實，且未發布侵害第三方權利的照片或文字。"
  },
  post_street_safety_note: {
    ja: "人の顔や子ども、車のナンバー、個人のお宅など、個人が特定できるものの掲載にはご注意ください。",
    en: "Be careful not to post anything that identifies people, such as faces, children, license plates or private homes.",
    "zh-TW": "請注意不要刊登可識別個人身分的內容，例如人臉、孩童、車牌號碼或私人住宅等。"
  },
  post_terms_link: {
    ja: "利用規約",
    en: "Terms of Service",
    "zh-TW": "使用條款"
  },
  post_privacy_link: {
    ja: "プライバシーポリシー",
    en: "Privacy Policy",
    "zh-TW": "隱私權政策"
  },
  post_submit: {
    ja: "この内容で掲載を申し込む",
    en: "Submit",
    "zh-TW": "以此內容申請刊登"
  },
  post_preparing: {
    ja: "投稿の準備をしています…",
    en: "Preparing your post…",
    "zh-TW": "正在準備發布…"
  },
  post_back_home: {
    ja: "トップページへ戻る",
    en: "Back to the top page",
    "zh-TW": "返回首頁"
  },
  post_new_post: {
    ja: "続けて投稿する",
    en: "Post another",
    "zh-TW": "繼續發布"
  },
  post_edit_post: {
    ja: "内容を編集する",
    en: "Edit post",
    "zh-TW": "編輯內容"
  },
  post_end_post: {
    ja: "掲載を終了する",
    en: "End listing",
    "zh-TW": "結束刊登"
  },
  post_security_note: {
    ja: "投稿された情報は、マチナウ運営の確認後に公開されます。このページで、パスワードやカード情報を入力することはありません。",
    en: "Posts are published after the Machinau team reviews them. You will never be asked for passwords or card details on this page.",
    "zh-TW": "發布的資訊將在 Machinau 營運團隊確認後公開。這個頁面不會要求您輸入密碼或信用卡資訊。"
  },
  post_hero_heading: {
    ja: "街の「今」を、\nみんなへ届けよう。",
    en: "Share what's happening\nin town right now.",
    "zh-TW": "把城市的「現況」，\n傳遞給大家。"
  },
  post_duration_help: {
    ja: "運営による承認後、選択した時間が経過すると、 トップページから自動で非表示になります。\n※この時間と営業時間は別です。実際のお店の営業時間は、下の「店舗の営業時間」で設定してください。",
    en: "After approval, your post is hidden from the top page automatically once the selected time has passed.\nThis is separate from business hours.",
    "zh-TW": "經營運團隊審核通過後，經過所選時間，將自動從首頁隱藏。\n※這個時間與營業時間無關。店家的實際營業時間請在下方的「店家營業時間」中設定。"
  },
  post_image_upload_description: {
    ja: "JPG・PNG・WEBPに対応しています。\n1枚につき10MB以内、最大5枚まで選択できます。\n自分で撮影した写真、または掲載する権利のある写真のみご利用ください。",
    en: "JPG, PNG and WEBP are supported.\nUp to 10 MB each, and up to 5 photos.\nUse only photos you took or have the right to post.",
    "zh-TW": "支援 JPG、PNG、WEBP。\n每張 10MB 以內，最多可選擇 5 張。\n請僅使用您自己拍攝的照片，或您有權刊登的照片。"
  },
  post_footer: {
    ja: "マチナウ\n沖縄の「今」を、みんなへ。",
    en: "Machinau\nWhat's happening in Okinawa, for everyone.",
    "zh-TW": "Machinau\n把沖繩的「現況」，傳遞給大家。"
  },
  post_label_duration: {
    ja: "いつまで役立つ情報ですか？",
    en: "How long is this useful?",
    "zh-TW": "這則資訊的有效期限是多久？"
  },
  post_label_address: {
    ja: "住所・場所",
    en: "Address or place",
    "zh-TW": "地址・地點"
  },
  post_label_location: {
    ja: "この情報がある場所",
    en: "Where is this?",
    "zh-TW": "這則資訊所在的地點"
  },
  post_label_photos: {
    ja: "掲載写真",
    en: "Photos",
    "zh-TW": "刊登照片"
  },
  post_legal_before: {
    ja: "投稿することで、",
    en: "By posting, you agree to the",
    "zh-TW": "發布即表示您同意"
  },
  post_legal_and: {
    ja: "および",
    en: "and",
    "zh-TW": "與"
  },
  post_legal_after: {
    ja: "に同意したものとみなされます。",
    en: "(in Japanese).",
    "zh-TW": "。"
  },
  post_shop_name_placeholder: {
    ja: "例：南国食堂",
    en: "e.g. Nangoku Diner",
    "zh-TW": "例：南國食堂"
  },
  post_content_placeholder: {
    ja: "例：本日限定でハマチのお刺身を半額で提供します。売り切れ次第終了です！",
    en: "e.g. Today only: yellowtail sashimi at half price, while it lasts!",
    "zh-TW": "例：今日限定，青甘生魚片半價供應。售完為止！"
  },
  post_address_placeholder: {
    ja: "例：沖縄県那覇市〇〇1-2-3",
    en: "e.g. 1-2-3 ○○, Naha, Okinawa",
    "zh-TW": "例：沖繩縣那霸市〇〇1-2-3"
  },
  post_label_street_name: {
    ja: "何を見つけた？",
    en: "What did you find?",
    "zh-TW": "發現了什麼？"
  },
  post_street_name_placeholder: {
    ja: "例：きれいなハイビスカス",
    en: "e.g. Beautiful hibiscus",
    "zh-TW": "例：漂亮的扶桑花"
  },
  post_label_street_content: {
    ja: "ひとこと",
    en: "A few words",
    "zh-TW": "一句話"
  },
  post_selected_street: {
    ja: "選択中：街で見つけた！",
    en: "Selected: Spotted in town!",
    "zh-TW": "已選擇：在街上發現了！"
  },
  post_selected_shop: {
    ja: "選択中：お店・施設からのお知らせ",
    en: "Selected: News from a shop or venue",
    "zh-TW": "已選擇：店家・設施的消息"
  },
  post_copy_failed: {
    ja: "コピーできませんでした",
    en: "Couldn't copy",
    "zh-TW": "無法複製"
  },
  post_copied: {
    ja: "コピーしました",
    en: "Copied",
    "zh-TW": "已複製"
  },
  post_published_street: {
    ja: "内容の安全確認後、トップページの「街の発見」に、近く（15km以内）にいる方向けに掲載されます。反映まで少し時間がかかる場合があります。",
    en: "After a safety check, it appears in \"Spotted Nearby\" on the top page for people within 15 km. It may take a little while to show up.",
    "zh-TW": "內容通過安全確認後，將刊登在首頁的「街頭發現」，供附近（15 公里以內）的人查看。顯示可能需要一點時間。"
  },
  post_published_shop: {
    ja: "内容の安全確認後、トップページに掲載されます。",
    en: "After a safety check, it appears on the top page.",
    "zh-TW": "內容通過安全確認後，將刊登在首頁。"
  },
  post_received_html: {
    ja: "投稿を受け付けました。<br><br>",
    en: "Thanks! We received your post.<br><br>",
    "zh-TW": "已收到您的發布。<br><br>"
  },
  post_auto_end: {
    ja: "選択した掲載時間が経過すると、自動的に掲載終了します。",
    en: " It ends automatically once the selected time has passed.",
    "zh-TW": "經過所選的刊登時間後，將自動結束刊登。"
  },
  post_sending: {
    ja: "送信しています…",
    en: "Sending…",
    "zh-TW": "傳送中…"
  },
  post_error_image_type: {
    ja: "は対応していない画像形式です。",
    en: ": this image format isn't supported.",
    "zh-TW": "是不支援的圖片格式。"
  },
  post_error_image_size: {
    ja: "は10MBを超えています。",
    en: " is larger than 10 MB.",
    "zh-TW": "超過 10MB。"
  },
  post_error_image_max: {
    ja: "写真は最大5枚まで選択できます。",
    en: "You can choose up to 5 photos.",
    "zh-TW": "照片最多可選擇 5 張。"
  },
  post_image_add: {
    ja: "＋ 写真を追加する",
    en: "+ Add photos",
    "zh-TW": "＋ 新增照片"
  },
  post_image_full: {
    ja: "写真を5枚選択済み",
    en: "5 photos selected",
    "zh-TW": "已選擇 5 張照片"
  },
  post_image_alt: {
    ja: "選択した写真",
    en: "Selected photo ",
    "zh-TW": "所選照片"
  },
  post_image_first: {
    ja: "トップ画像",
    en: "Cover photo",
    "zh-TW": "封面照片"
  },
  post_error_firebase: {
    ja: "Firebaseへ接続できませんでした。",
    en: "We couldn't connect. Please try again later.",
    "zh-TW": "無法連接到 Firebase。"
  },
  post_error_resize: {
    ja: "写真を軽量化できませんでした。",
    en: "We couldn't resize the photo.",
    "zh-TW": "無法壓縮照片。"
  },
  post_error_upload_prepare: {
    ja: "画像アップロードの準備ができませんでした。",
    en: "We couldn't prepare the photo upload.",
    "zh-TW": "無法準備圖片上傳。"
  },
  post_error_upload_prepare_failed: {
    ja: "画像アップロードの準備に失敗しました。",
    en: "We couldn't prepare the photo upload.",
    "zh-TW": "無法準備圖片上傳。"
  },
  post_resizing: {
    ja: "写真を軽量化しています…",
    en: "Resizing photos…",
    "zh-TW": "正在壓縮照片…"
  },
  post_error_upload_response: {
    ja: "画像アップロードの応答を読み取れませんでした。",
    en: "We couldn't read the upload response.",
    "zh-TW": "無法讀取上傳回應。"
  },
  post_error_upload: {
    ja: "画像をアップロードできませんでした。",
    en: "We couldn't upload the photo.",
    "zh-TW": "無法上傳圖片。"
  },
  post_error_upload_url: {
    ja: "画像URLを取得できませんでした。",
    en: "We couldn't get the photo URL.",
    "zh-TW": "無法取得圖片 URL。"
  },
  post_error_maps_not_ready: {
    ja: "地図機能の準備が完了していません。少し待ってから、もう一度お試しください。",
    en: "The map isn't ready yet. Please wait a moment and try again.",
    "zh-TW": "地圖功能尚未準備完成。請稍等一下再試一次。"
  },
  post_error_address: {
    ja: "入力された住所の場所を確認できませんでした。住所を詳しく入力してください。",
    en: "We couldn't find that address. Please enter it in more detail.",
    "zh-TW": "無法確認所輸入地址的位置。請更詳細地輸入地址。"
  },
  post_error_no_geolocation: {
    ja: "このブラウザでは位置情報を利用できません。",
    en: "This browser can't use location.",
    "zh-TW": "此瀏覽器無法使用定位資訊。"
  },
  post_locating: {
    ja: "取得しています…",
    en: "Getting location…",
    "zh-TW": "正在取得位置…"
  },
  post_location_retry: {
    ja: "現在地を再取得",
    en: "Get my location again",
    "zh-TW": "重新取得目前位置"
  },
  post_error_location: {
    ja: "位置情報を取得できませんでした。",
    en: "We couldn't get your location.",
    "zh-TW": "無法取得定位資訊。"
  },
  post_error_location_denied: {
    ja: "位置情報の利用が許可されませんでした。ブラウザの設定から位置情報を許可してください。",
    en: "Location access wasn't allowed. Please allow it in your browser settings.",
    "zh-TW": "未允許使用定位資訊。請在瀏覽器設定中允許定位。"
  },
  post_error_location_unavailable: {
    ja: "現在地を取得できませんでした。電波状況の良い場所でもう一度お試しください。",
    en: "We couldn't get your location. Please try again where the signal is better.",
    "zh-TW": "無法取得目前位置。請在訊號良好的地方再試一次。"
  },
  post_error_location_timeout: {
    ja: "取得に時間がかかりました。もう一度お試しください。",
    en: "Getting your location took too long. Please try again.",
    "zh-TW": "取得位置花費太久。請再試一次。"
  },
  post_error_name: {
    ja: "店舗・イベント名を入力してください。",
    en: "Please enter a name.",
    "zh-TW": "請輸入店家・活動名稱。"
  },
  post_error_title: {
    ja: "タイトルを入力してください。",
    en: "Please enter a title.",
    "zh-TW": "請輸入標題。"
  },
  post_error_category: {
    ja: "カテゴリーを選択してください。",
    en: "Please choose a category.",
    "zh-TW": "請選擇類別。"
  },
  post_error_duration: {
    ja: "掲載時間を選択してください。",
    en: "Please choose how long it's useful.",
    "zh-TW": "請選擇刊登時間。"
  },
  post_error_content: {
    ja: "内容を入力してください。",
    en: "Please enter the details.",
    "zh-TW": "請輸入內容。"
  },
  post_error_url: {
    ja: "ページのアドレスは「https://」または「http://」から始まる形で貼り付けてください。\nわからない場合は、空欄のままで大丈夫です。",
    en: "Paste the page address starting with \"https://\" or \"http://\".\nIf you're not sure, leave it blank.",
    "zh-TW": "請貼上以「https://」或「http://」開頭的頁面網址。\n如果不清楚，留空也可以。"
  },
  post_error_hours: {
    ja: "営業開始時刻と営業終了時刻は両方入力するか、両方空欄にしてください。",
    en: "Enter both opening and closing times, or leave both blank.",
    "zh-TW": "營業開始時間與結束時間請兩者都輸入，或兩者都留空。"
  },
  post_error_agreement: {
    ja: "確認事項への同意が必要です。",
    en: "Please check the confirmation box.",
    "zh-TW": "需要同意確認事項。"
  },
  post_error_bullet: {
    ja: "・",
    en: "• ",
    "zh-TW": "・"
  },
  post_error_check: {
    ja: "入力内容を確認してください。\n",
    en: "Please check the following:\n",
    "zh-TW": "請確認輸入內容：\n"
  },
  post_completed: {
    ja: "投稿が完了しました。",
    en: "Your post is complete.",
    "zh-TW": "發布完成。"
  },
  post_sending_to_machinau: {
    ja: "情報をマチナウへ送信しています…",
    en: "Sending to Machinau…",
    "zh-TW": "正在將資訊傳送至 Machinau…"
  },
  post_count_title: {
    ja: "{count} / 50文字",
    en: "{count} / 50 characters",
    "zh-TW": "{count} / 50 字"
  },
  post_count_content: {
    ja: "{count} / 300文字",
    en: "{count} / 300 characters",
    "zh-TW": "{count} / 300 字"
  },
  post_image_count: {
    ja: "{count} / {max}枚",
    en: "{count} / {max} photos",
    "zh-TW": "{count} / {max} 張"
  },
  post_image_remove: {
    ja: "写真{number}を削除",
    en: "Remove photo {number}",
    "zh-TW": "刪除照片 {number}"
  },
  post_progress_uploading: {
    ja: "{count}枚の写真を軽量化・アップロードしています…",
    en: "Resizing and uploading {count} photos…",
    "zh-TW": "正在壓縮並上傳 {count} 張照片…"
  },
  post_progress_uploaded: {
    ja: "写真{done} / {total}枚のアップロードが完了しました。",
    en: "Uploaded {done} of {total} photos.",
    "zh-TW": "已完成上傳 {done} / {total} 張照片。"
  },
  post_location_done_inaccurate: {
    ja: "現在地を取得しました(誤差 約{meters}m)。位置の誤差が大きいため、電波状況の良い場所で再取得することをおすすめします。",
    en: "Got your location (accuracy about {meters} m). It's not very precise, so try again where the signal is better.",
    "zh-TW": "已取得目前位置（誤差約 {meters} 公尺）。由於位置誤差較大，建議在訊號良好的地方重新取得。"
  },
  post_location_done: {
    ja: "現在地を取得しました(誤差 約{meters}m)。",
    en: "Got your location (accuracy about {meters} m).",
    "zh-TW": "已取得目前位置（誤差約 {meters} 公尺）。"
  },
  post_error_submit: {
    ja: "投稿に失敗しました。もう一度お試しください。",
    en: "We couldn't submit your post. Please try again.",
    "zh-TW": "發布失敗。請再試一次。"
  },
  post_server_auth: {
    ja: "認証情報がありません。",
    en: "We couldn't confirm your session. Reload the page and try again.",
    "zh-TW": "沒有驗證資訊。"
  },
  post_error_upload_prepare_later: {
    ja: "画像アップロードの準備ができませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't prepare the photo upload. Please try again later.",
    "zh-TW": "無法準備圖片上傳。請稍後再試一次。"
  },
  post_doc_title: {
    ja: "今の情報を投稿する｜マチナウ",
    en: "Share what's happening | Machinau",
    "zh-TW": "發布最新資訊｜Machinau"
  },
  travel_box_share_limit: {
    ja: "保存した{N}件のうち、上から30件を送ります。",
    en: "You have {N} saved places. The first 30 will be sent.",
    "zh-TW": "在已儲存的 {N} 件中，將傳送前 30 件。"
  },
  travel_box_share_empty: {
    ja: "送れるお店・施設がまだありません。カードの♡で保存してください。",
    en: "There are no places to send yet. Tap ♡ on a card to save one.",
    "zh-TW": "還沒有可傳送的店家・設施。請點卡片上的 ♡ 儲存。"
  },
  travel_box_share_title: {
    ja: "マチナウ 旅のリスト",
    en: "Machinau trip list",
    "zh-TW": "Machinau 旅行清單"
  },
  shared_trip_heading: {
    ja: "共有された旅のリスト",
    en: "A shared trip list",
    "zh-TW": "分享的旅行清單"
  },
  shared_trip_lead: {
    ja: "{N}件のお店・施設が届きました。押すと詳しく見られます。",
    en: "{N} places were shared with you. Tap one to see the details.",
    "zh-TW": "已收到 {N} 間店家・設施。點選即可查看詳情。"
  },
  shared_trip_unavailable: {
    ja: "共有されたお店・施設は、今は掲載されていません。",
    en: "The shared places aren't listed right now.",
    "zh-TW": "分享的店家・設施目前未刊登。"
  },
  shared_trip_save_all: {
    ja: "まとめて自分の保存箱に保存",
    en: "Save all to my Travel Box",
    "zh-TW": "一次全部儲存到我的收藏箱"
  },
  shared_trip_saved: {
    ja: "旅の保存箱に保存しました。",
    en: "Saved to your Travel Box.",
    "zh-TW": "已儲存至旅行收藏箱。"
  },
  shared_trip_close: {
    ja: "閉じる",
    en: "Close",
    "zh-TW": "關閉"
  },

  mypage_heading: {
    ja: "保存箱",
    en: "Saved Box",
    "zh-TW": "收藏箱"
  },

  mypage_description: {
    ja: "旅先で見つけた情報を保存して、旅の途中や旅のあとに振り返れます。",
    en: "Save what you find on your trip and look back on it during or after your travels.",
    "zh-TW": "儲存旅途中發現的資訊，在旅程中或旅程結束後都能回顧。"
  },

  mypage_favorite_empty: {
    ja: "まだ保存したお店・施設はありません。カードの♡を押すと、ここに保存されます。",
    en: "No places saved yet. Tap ♡ on a card to save it here.",
    "zh-TW": "目前還沒有儲存的店家・設施。點選卡片上的♡，就會儲存到這裡。"
  },

  // 旅の保存箱 Phase 1a｜保存の種類ごとの見出しと、保存先の説明。
  // Phase 1b｜代表確定仕様の見出し(❤️ お気に入り／📖 お気に入り読み物)へ変更。
  travel_box_shops_heading: {
    ja: "お気に入り",
    en: "Favorites",
    "zh-TW": "收藏"
  },

  travel_box_articles_heading: {
    ja: "お気に入り読み物",
    en: "Saved Reads",
    "zh-TW": "收藏的文章"
  },

  // 旅の保存箱 Phase 1b｜読みもの保存の案内・ボタン文言。
  travel_box_articles_empty: {
    ja: "まだ保存した読み物はありません。「マチナウ読み物」の♡を押すと、ここに保存されます。",
    en: "No reads saved yet. Tap ♡ on a Machinau Reads card to save it here.",
    "zh-TW": "目前還沒有儲存的文章。點選「Machinau 文章」的♡，就會儲存到這裡。"
  },

  travel_box_articles_loading: {
    ja: "保存した読み物を読み込んでいます…",
    en: "Loading your saved reads…",
    "zh-TW": "正在載入儲存的文章…"
  },

  travel_box_articles_load_failed: {
    ja: "読み物を読み込めませんでした。時間をおいて、もう一度開いてください。",
    en: "Couldn't load reads right now. Please try again later.",
    "zh-TW": "無法載入文章。請稍後再重新開啟。"
  },

  column_save_aria_label: {
    ja: "この読み物を旅の保存箱に保存",
    en: "Save this read to your Travel Box",
    "zh-TW": "將這篇文章儲存至旅行收藏箱"
  },

  column_unsave_aria_label: {
    ja: "この読み物の保存を解除",
    en: "Remove this read from your Travel Box",
    "zh-TW": "取消收藏這篇文章"
  },

  saved_article_remove_button: {
    ja: "保存を解除",
    en: "Remove",
    "zh-TW": "取消收藏"
  },

  saved_items_limit_reached: {
    ja: "保存できる読み物は{MAX}件までです。旅の保存箱で保存を解除してから、もう一度お試しください。",
    en: "You can save up to {MAX} reads. Remove some in your Travel Box, then try again.",
    "zh-TW": "最多可收藏 {MAX} 篇文章。請先在旅行收藏箱中取消收藏，再試一次。"
  },

  saved_items_save_failed: {
    ja: "保存を変更できませんでした。このブラウザでは保存が使えない可能性があります（プライベートブラウズ等）。",
    en: "Couldn't update your saved reads. Saving may be unavailable in this browser (e.g. private browsing).",
    "zh-TW": "無法變更收藏。這個瀏覽器可能無法使用儲存功能（例如無痕瀏覽等）。"
  },

  travel_box_storage_note: {
    ja: "保存した内容は、この端末のブラウザに保存されます。別の端末やブラウザには表示されず、閲覧履歴を消すと消えることがあります。",
    en: "Your saved items are stored in this browser on this device. They won't appear on other devices or browsers, and may be removed if you clear your browsing data.",
    "zh-TW": "儲存的內容會保存在這台裝置的瀏覽器中。不會顯示在其他裝置或瀏覽器上，清除瀏覽記錄後可能會消失。"
  },

  mypage_favorite_list_button: {
    ja: "❤️ お気に入り一覧",
    en: "❤️ View Favorites",
    "zh-TW": "❤️ 收藏清單"
  },

  map_heading: {
    ja: "今いる場所の近くを地図で見る",
    en: "See What's Nearby on the Map",
    "zh-TW": "在地圖上查看目前位置附近"
  },

  toilet_search_button: {
    ja: "🚻 近くのトイレを探す",
    en: "🚻 Find Nearby Restrooms",
    "zh-TW": "🚻 尋找附近的廁所"
  },

  current_map_link: {
    ja: "🗺️ 現在地をGoogleマップで開く",
    en: "🗺️ Open Current Location in Google Maps",
    "zh-TW": "🗺️ 在 Google 地圖開啟目前位置"
  },

  region_recommendation_heading_default: {
    ja: "この地域のおすすめ",
    en: "Recommended in This Area",
    "zh-TW": "本地區推薦"
  },

  city_info_button: {
    ja: "この街の情報",
    en: "About This City",
    "zh-TW": "這座城市的資訊"
  },

  city_info_status_loading: {
    ja: "この街について調べています…",
    en: "Looking up this city…",
    "zh-TW": "正在查詢這座城市…"
  },

  city_info_status_error: {
    ja: "この街の情報を取得できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load city info. Please try again later.",
    "zh-TW": "無法取得這座城市的資訊。請稍後再試一次。"
  },

  // OpenAI API安全対策 STEP 2-B 修正(2026-11-12)｜新しい作成をしなかった理由ごとの案内。
  city_info_status_limited: {
    ja: "今日は「この街の情報」の新しい作成の受付を終了しました。明日、もう一度お試しください。",
    en: "We've reached today's limit for new city info. Please try again tomorrow.",
    "zh-TW": "今天「這座城市的資訊」的新建立已結束受理。請明天再試一次。"
  },

  city_info_status_paused: {
    ja: "ただいま「この街の情報」の新しい作成を休止しています。時間をおいて、もう一度お試しください。",
    en: "Creating new city info is paused right now. Please try again later.",
    "zh-TW": "目前「這座城市的資訊」的新建立已暫停。請稍後再試一次。"
  },

  city_info_status_preparing: {
    ja: "この街の情報を準備しています。1〜2分ほどおいて、もう一度お試しください。",
    en: "We're preparing info for this city. Please try again in a minute or two.",
    "zh-TW": "正在準備這座城市的資訊。請等 1〜2 分鐘後再試一次。"
  },

  city_info_status_unsupported: {
    ja: "この地域の「この街の情報」は、まだご用意できていません。",
    en: "City info for this area isn't available yet.",
    "zh-TW": "本地區的「這座城市的資訊」尚未提供。"
  },

  column_entry_heading: {
    ja: "マチナウ読み物",
    en: "Machinau Reads",
    "zh-TW": "Machinau 文章"
  },

  column_entry_lead: {
    ja: "旅のヒント・ストーリー",
    en: "Travel tips & stories",
    "zh-TW": "旅行提示・故事"
  },

  // 多言語化 最終仕上げ｜「マチナウ読み物をもっと見る →」(column-list.htmlへの
  // 導線)。既存はハードコードで固定言語スイッチャーに未対応だったため、
  // 他のcolumn_entry_*キーと同じ場所へ追加する。
  column_entry_more_link: {
    ja: "マチナウ読み物をもっと見る →",
    en: "See More Machinau Reads →",
    "zh-TW": "查看更多 Machinau 文章 →"
  },

  region_recommendation_other_area_button: {
    ja: "ほかの地域を見る",
    en: "See Other Areas",
    "zh-TW": "查看其他地區"
  },

  region_recommendation_back_to_current_button: {
    ja: "現在地のおすすめに戻る",
    en: "Back to Current Area",
    "zh-TW": "返回目前位置的推薦"
  },

  modal_close_aria_label: {
    ja: "閉じる",
    en: "Close",
    "zh-TW": "關閉"
  },

  modal_category_placeholder: {
    ja: "沖縄の今",
    en: "Okinawa Now",
    "zh-TW": "沖繩現況"
  },

  modal_title_placeholder: {
    ja: "店舗名",
    en: "Shop Name",
    "zh-TW": "店家名稱"
  },

  modal_message_placeholder: {
    ja: "店舗情報",
    en: "Shop Info",
    "zh-TW": "店家資訊"
  },

  modal_map_button: {
    ja: "📍 Googleマップで場所を見る",
    en: "📍 View Location on Google Maps",
    "zh-TW": "📍 在 Google 地圖查看位置"
  },

  footer_tagline: {
    ja: "街の今を知れば、もっと、いい旅になる。",
    en: "Know what's happening in town now, and make your trip even better.",
    "zh-TW": "了解城市現況，讓旅行更加美好。"
  },

  // サイト全体改善 F｜フッターの出典のラベル(データの名前「Geolonia 住所データ」は出典の表記のまま)。
  footer_data_credit_label: {
    ja: "市区町村データ：",
    en: "Municipality data: ",
    "zh-TW": "市町村資料："
  },

  footer_terms_link: {
    ja: "利用規約",
    en: "Terms of Service",
    "zh-TW": "使用條款"
  },

  footer_privacy_link: {
    ja: "プライバシーポリシー",
    en: "Privacy Policy",
    "zh-TW": "隱私權政策"
  },

  footer_contact_link: {
    ja: "お問い合わせ・ご意見",
    en: "Contact & Feedback",
    "zh-TW": "聯絡・意見"
  },

  // STEP 43-N｜特定商取引法に基づく表記(tokushoho.html。ページは日本語のみ)。
  footer_tokushoho_link: {
    ja: "特定商取引法に基づく表記",
    en: "Legal Notice (Specified Commercial Transactions Act, Japanese)",
    "zh-TW": "依《特定商取引法》之標示"
  },

  // 投稿玄関Phase1｜旧footer_shop_entry_link/footer_general_post_entry_link
  // (post.htmlへの別々の2導線)を、contribute.htmlへの1つの導線へ統一。
  footer_contribute_link: {
    ja: "街の「今」を投稿する",
    en: "Share what's happening",
    "zh-TW": "發布城市的「現況」"
  },

  // 店舗・施設参加導線 Phase2｜フッターの店舗・施設向け入口(shop.htmlへ)。
  // shop.html自体は日本語のみ。
  footer_shop_link: {
    ja: "お店・施設の方へ｜店舗カード・今だけ投稿のご案内",
    en: "For shops & venues | Store cards and Just for Now posts",
    "zh-TW": "店家・設施專區｜店家卡・今日限定貼文介紹"
  },

  location_geolocation_unsupported: {
    ja: "このブラウザでは位置情報を利用できません。",
    en: "This browser doesn't support location access.",
    "zh-TW": "這個瀏覽器無法使用定位資訊。"
  },

  weather_location_naha: {
    ja: "那覇の天気",
    en: "Naha Weather",
    "zh-TW": "那霸的天氣"
  },

  weather_location_current: {
    ja: "今いる街の天気",
    en: "Weather in your area",
    "zh-TW": "目前所在城市的天氣"
  },

  location_button_checking: {
    ja: "確認しています…",
    en: "Checking…",
    "zh-TW": "確認中…"
  },

  location_message_fetching: {
    ja: "GPSから現在地を取得しています。",
    en: "Getting your location via GPS…",
    "zh-TW": "正在透過 GPS 取得目前位置。"
  },

  // 画像UX改善Phase2｜GPS確定直後、店舗一覧を距離順へ並び替える一瞬だけ
  // 表示する遷移メッセージ。「原因不明で写真が変わった」という体験を
  // 避けるための表示で、location_message_success(直後に続けて表示)とは別。
  location_message_sorting: {
    ja: "現在地を取得しました。近い順に並び替えています…",
    en: "Location found. Sorting by distance…",
    "zh-TW": "已取得目前位置。正在依距離排序…"
  },

  location_message_success: {
    ja: "現在地を取得しました。近い順に表示しています。",
    en: "Location found. Showing nearby spots first.",
    "zh-TW": "已取得目前位置。依距離由近至遠顯示。"
  },

  location_error_generic: {
    ja: "位置情報を取得できませんでした。",
    en: "Couldn't get your location.",
    "zh-TW": "無法取得位置資訊。"
  },

  location_error_permission_denied_guide: {
    ja: "① ブラウザの位置情報を「許可」に変更してください。\n② この画面に戻って「もう一度試す」を押してください。",
    en: "① Change your browser's location setting to \"Allow.\"\n② Come back to this screen and tap \"Try Again.\"",
    "zh-TW": "① 請將瀏覽器的定位設定改為「允許」。\n② 回到這個畫面，按下「再試一次」。"
  },

  location_error_position_unavailable: {
    ja: "現在地を確認できませんでした。",
    en: "Couldn't determine your location.",
    "zh-TW": "無法確認目前位置。"
  },

  location_error_timeout: {
    ja: "取得に時間がかかりました。もう一度お試しください。",
    en: "It's taking too long. Please try again.",
    "zh-TW": "取得時間過長。請再試一次。"
  },

  location_button_retry: {
    ja: "🔄 もう一度試す",
    en: "🔄 Try Again",
    "zh-TW": "🔄 再試一次"
  },

  weather_advice_heat: {
    ja: "🌡 こまめな水分補給を",
    en: "🌡 Stay hydrated",
    "zh-TW": "🌡 請勤補充水分"
  },

  weather_advice_uv: {
    ja: "☀️ 紫外線対策を",
    en: "☀️ Watch out for strong UV",
    "zh-TW": "☀️ 請做好防曬"
  },

  weather_advice_rain: {
    ja: "☂ 傘があると安心",
    en: "☂ Bring an umbrella",
    "zh-TW": "☂ 帶把傘比較安心"
  },

  weather_advice_wind: {
    ja: "🌬 強風に注意",
    en: "🌬 Watch for strong wind",
    "zh-TW": "🌬 注意強風"
  },

  weather_feels_like_prefix: {
    ja: "体感 ",
    en: "Feels like ",
    "zh-TW": "體感 "
  },

  weather_rain_chance_prefix: {
    ja: "☂ 降水",
    en: "☂ Rain ",
    "zh-TW": "☂ 降雨"
  },

  shop_status_open: {
    ja: "営業中",
    en: "Open",
    "zh-TW": "營業中"
  },

  shop_status_listed: {
    ja: "掲載中",
    en: "Listed",
    "zh-TW": "刊登中"
  },

  shop_status_closed: {
    ja: "営業時間外",
    en: "Closed",
    "zh-TW": "非營業時間"
  },

  shop_expiry_new: {
    ja: "🆕 新着",
    en: "🆕 New",
    "zh-TW": "🆕 新上架"
  },

  // サイト全体改善 第5弾｜実際の掲載期限までの残り時間(期限の無い掲載には出さない)。
  shop_expiry_minutes_left: {
    ja: "掲載はあと{N}分",
    en: "Listed for {N} more min",
    "zh-TW": "刊登還剩 {N} 分鐘"
  },

  shop_expiry_hours_left: {
    ja: "掲載はあと{N}時間",
    en: "Listed for {N} more hr",
    "zh-TW": "刊登還剩 {N} 小時"
  },

  shop_expiry_today_only: {
    ja: "🔥 今日だけ",
    en: "🔥 Today Only",
    "zh-TW": "🔥 僅限今天"
  },

  shop_closing_minutes: {
    ja: "⚡ 営業終了まであと{N}分",
    en: "⚡ Closing in {N} min",
    "zh-TW": "⚡ 距離結束營業還剩 {N} 分鐘"
  },

  shop_closing_hours: {
    ja: "⏰ 営業終了まであと{N}時間",
    en: "⏰ Closing in {N} hr",
    "zh-TW": "⏰ 距離結束營業還剩 {N} 小時"
  },

  shop_opens_today_at: {
    ja: "🕘 本日は{START}から営業します",
    en: "🕘 Opens today at {START}",
    "zh-TW": "🕘 今天 {START} 開始營業"
  },

  shop_closed_today: {
    ja: "🌙 本日の営業は終了しました",
    en: "🌙 Closed for today",
    "zh-TW": "🌙 今天的營業已結束"
  },

  shop_hours_24: {
    ja: "🕘 24時間営業",
    en: "🕘 Open 24 Hours",
    "zh-TW": "🕘 24 小時營業"
  },

  shop_hours_range: {
    ja: "🕘 営業時間 {START}〜{END}",
    en: "🕘 Hours: {START}–{END}",
    "zh-TW": "🕘 營業時間 {START}〜{END}"
  },

  // STEP 40-A｜常設店舗広告の営業時間(閉店が翌日)・定休日(TOPの店舗詳細)。
  shop_hours_range_overnight: {
    ja: "🕘 営業時間 {START}〜翌{END}",
    en: "🕘 Hours: {START}–{END} (next day)",
    "zh-TW": "🕘 營業時間 {START}〜隔天 {END}"
  },

  shop_closed_days: {
    ja: "🗓 定休日 {DAYS}",
    en: "🗓 Closed: {DAYS}",
    "zh-TW": "🗓 公休日 {DAYS}"
  },

  shop_closed_days_separator: {
    ja: "・",
    en: ", ",
    "zh-TW": "、"
  },

  shop_closed_days_with_irregular: {
    ja: "{DAYS}（不定休あり）",
    en: "{DAYS} (also irregular holidays)",
    "zh-TW": "{DAYS}（另有不定期公休）"
  },

  shop_closed_irregular: {
    ja: "不定休",
    en: "Irregular holidays",
    "zh-TW": "不定期公休"
  },

  shop_closed_day_mon: { ja: "月", en: "Mon", "zh-TW": "週一" },
  shop_closed_day_tue: { ja: "火", en: "Tue", "zh-TW": "週二" },
  shop_closed_day_wed: { ja: "水", en: "Wed", "zh-TW": "週三" },
  shop_closed_day_thu: { ja: "木", en: "Thu", "zh-TW": "週四" },
  shop_closed_day_fri: { ja: "金", en: "Fri", "zh-TW": "週五" },
  shop_closed_day_sat: { ja: "土", en: "Sat", "zh-TW": "週六" },
  shop_closed_day_sun: { ja: "日", en: "Sun", "zh-TW": "週日" },

  shop_walking_distance_unknown: {
    ja: "距離を確認",
    en: "Check Distance",
    "zh-TW": "查看距離"
  },

  // 距離が分からない時(現在地が未取得)の表示。ボタンの文言(現在地を取得する)を
  // 流用すると押せるものに見えるため、状態を表す言葉にする(2026-11-15 運営決定)。
  shop_distance_unknown: {
    ja: "現在地未取得",
    en: "Location not set",
    "zh-TW": "尚未取得目前位置"
  },

  // 店舗カードの写真に重ねるタグ(見せ方だけ・2026-11-17 代表提案)。
  // 距離は formatDistance() の結果(例: 1.2km / 850m)を {distance} に入れる。
  shop_photo_tag_distance: {
    ja: "あと{distance}",
    en: "{distance} away",
    "zh-TW": "距離 {distance}"
  },

  shop_walking_car_recommended: {
    ja: "車での移動推奨",
    en: "Drive Recommended",
    "zh-TW": "建議開車前往"
  },

  shop_walking_minutes: {
    ja: "徒歩 約{N}分",
    en: "About {N} min walk",
    "zh-TW": "步行約 {N} 分鐘"
  },

  shop_payment_card: {
    ja: "💳 カードOK",
    en: "💳 Card OK",
    "zh-TW": "💳 可刷卡"
  },

  shop_payment_qr: {
    ja: "📱 QR決済OK",
    en: "📱 QR Pay OK",
    "zh-TW": "📱 可用 QR 付款"
  },

  shop_payment_cash_only: {
    ja: "💴 現金のみ",
    en: "💴 Cash Only",
    "zh-TW": "💴 僅收現金"
  },

  shop_takeout_ok: {
    ja: "🥡 テイクアウトOK",
    en: "🥡 Takeout OK",
    "zh-TW": "🥡 可外帶"
  },
  // 2026-11-07 C案｜日本語以外の表示で、店舗の住所(日本語のまま)の前に添える案内。
  // 日本語の表示では出さない(app.js getShopAddressHtml)。
  shop_address_in_japanese_label: {
    ja: "住所（日本語）",
    en: "Address (in Japanese)",
    "zh-TW": "地址（日文）"
  },

  shop_admin_badge: {
    ja: "🌺 マチナウ運営より",
    en: "🌺 From Machinau",
    "zh-TW": "🌺 來自 Machinau 營運團隊"
  },

  shop_user_post_badge: {
    ja: "マチナウユーザーからの情報",
    en: "Shared by a Machinau user",
    "zh-TW": "Machinau 使用者提供的資訊"
  },

  shop_verified_badge: {
    ja: "🏪 お店から",
    en: "🏪 From the shop",
    "zh-TW": "🏪 來自店家"
  },

  shop_permanent_ad_badge: {
    ja: "店舗広告",
    en: "Shop advertisement",
    "zh-TW": "店家廣告"
  },

  // Phase 2D STEP 4A｜店主が管理する正式店舗のカードのバッジ。
  shop_store_managed_badge: {
    ja: "店舗が管理",
    en: "Managed by the business",
    "zh-TW": "由店家管理"
  },

  // 一覧の差別化(2026-11-15 代表決定)｜専用ページ(/shop/…)が公開されている
  // お店だけに付ける印。一覧に出る正式店舗は公開条件(有料プラン有効を含む)を
  // 満たした店だけなので、正式店舗のカードには常に出してよい。
  shop_store_page_badge: {
    ja: "専用ページあり",
    en: "Store page",
    "zh-TW": "有專屬頁面"
  },

  report_toggle_button: {
    ja: "🚩 気になる情報を報告",
    en: "🚩 Report this info",
    "zh-TW": "🚩 檢舉這則資訊"
  },

  report_reason_old_or_wrong: {
    ja: "情報が古い/間違っている",
    en: "Outdated or incorrect",
    "zh-TW": "資訊過時/不正確"
  },

  report_reason_inappropriate: {
    ja: "不適切な内容",
    en: "Inappropriate content",
    "zh-TW": "不當內容"
  },

  report_reason_spam: {
    ja: "スパム・広告",
    en: "Spam or advertising",
    "zh-TW": "垃圾訊息・廣告"
  },

  report_reason_other: {
    ja: "その他",
    en: "Other",
    "zh-TW": "其他"
  },

  report_sending_message: {
    ja: "送信しています…",
    en: "Sending…",
    "zh-TW": "傳送中…"
  },

  report_submitted_message: {
    ja: "報告を受け付けました。ご協力ありがとうございます。",
    en: "Thanks — your report has been received.",
    "zh-TW": "已收到您的檢舉。感謝您的協助。"
  },

  report_error_message: {
    ja: "報告を送信できませんでした。時間をおいてもう一度お試しください。",
    en: "Couldn't send the report. Please try again later.",
    "zh-TW": "無法傳送檢舉。請稍後再試一次。"
  },

  report_already_submitted_message: {
    ja: "この情報はすでに報告済みです。",
    en: "You've already reported this.",
    "zh-TW": "這則資訊已被檢舉過了。"
  },

  shop_detail_button: {
    ja: "今の情報を見る",
    en: "View Details",
    "zh-TW": "查看目前資訊"
  },

  shop_map_button: {
    ja: "📍 地図",
    en: "📍 Map",
    "zh-TW": "📍 地圖"
  },

  shop_source_link_button: {
    ja: "🔗 情報元を見る",
    en: "🔗 View Source",
    "zh-TW": "🔗 查看資訊來源"
  },

  shop_favorite_aria_label: {
    ja: "お気に入り",
    en: "Favorite",
    "zh-TW": "收藏"
  },

  shop_load_error: {
    ja: "掲載情報を読み込めませんでした。<br>少し時間を置いて、もう一度ページを更新してください。",
    en: "Couldn't load listings.<br>Please wait a moment and refresh the page.",
    "zh-TW": "無法載入刊登資訊。<br>請稍等一下，再重新整理頁面。"
  },

  suggestion_safety: {
    ja: "現在、移動や安全に関する情報があります。\n出発前に最新情報を確認してください。\n『{TITLE}』",
    en: "There's important travel or safety information right now.\nPlease check the latest details before heading out.\n\"{TITLE}\"",
    "zh-TW": "目前有關於交通與安全的資訊。\n出發前請確認最新資訊。\n『{TITLE}』"
  },

  suggestion_rain: {
    ja: "☔ 今は雨です。\n近くで『{TITLE}』があります。\n雨宿りも兼ねて、少し寄り道しませんか？",
    en: "☔ It's raining right now.\n\"{TITLE}\" is nearby.\nWhy not stop by while you wait out the rain?",
    "zh-TW": "☔ 現在正在下雨。\n附近有『{TITLE}』。\n何不順便繞過去躲雨呢？"
  },

  suggestion_hot: {
    ja: "🥵 暑さが厳しくなっています。\n無理のない移動をしながら『{TITLE}』をチェックしてみませんか？",
    en: "🥵 It's getting really hot out there.\nWhy not check out \"{TITLE}\" while taking it easy?",
    "zh-TW": "🥵 天氣越來越熱了。\n何不輕鬆移動，順便看看『{TITLE}』呢？"
  },

  suggestion_sunny: {
    ja: "☀️ 今は天気が良さそうです。\n『{TITLE}』をチェックしてみませんか？",
    en: "☀️ The weather looks great right now.\nWhy not check out \"{TITLE}\"?",
    "zh-TW": "☀️ 現在天氣看起來不錯。\n何不看看『{TITLE}』呢？"
  },

  suggestion_general: {
    ja: "📍 今いるエリアで『{TITLE}』の情報があります。\n少しチェックしてみませんか？",
    en: "📍 There's info about \"{TITLE}\" in your current area.\nWhy not take a look?",
    "zh-TW": "📍 您目前所在的地區有『{TITLE}』的資訊。\n何不看一下呢？"
  },

  unified_info_label_emergency: {
    ja: "🚨 緊急",
    en: "🚨 Urgent",
    "zh-TW": "🚨 緊急"
  },

  unified_info_label_transport: {
    ja: "🚧 交通",
    en: "🚧 Transport",
    "zh-TW": "🚧 交通"
  },

  unified_info_label_event: {
    ja: "🎵 イベント",
    en: "🎵 Event",
    "zh-TW": "🎵 活動"
  },

  unified_info_label_sightseeing: {
    ja: "🏝️ 観光・体験",
    en: "🏝️ Sightseeing",
    "zh-TW": "🏝️ 觀光・體驗"
  },

  unified_info_label_notice: {
    ja: "📢 お知らせ",
    en: "📢 Notice",
    "zh-TW": "📢 公告"
  },

  region_recommendation_link_button: {
    ja: "🔗 くわしく見る",
    en: "🔗 Learn More",
    "zh-TW": "🔗 查看詳情"
  },

  region_recommendation_read_more_button: {
    ja: "続きを読む",
    en: "Read More",
    "zh-TW": "繼續閱讀"
  },

  // 多言語化 最終Phase(マチナウ読み物)｜TOPの読み物カードのリンク文言。
  column_entry_read_more_link: {
    ja: "読む →",
    en: "Read →",
    "zh-TW": "閱讀 →"
  },

  region_recommendation_collapse_button: {
    ja: "閉じる",
    en: "Close",
    "zh-TW": "關閉"
  },

  region_recommendation_empty_manual: {
    ja: "この地域のおすすめは準備中です。",
    en: "Recommendations for this area are coming soon.",
    "zh-TW": "本地區的推薦正在準備中。"
  },

  region_recommendation_heading_dynamic: {
    ja: "{AREA}のおすすめ",
    en: "Recommendations in {AREA}",
    "zh-TW": "{AREA}的推薦"
  },

  community_board_heading_dynamic: {
    ja: "{AREA}の掲示板",
    en: "{AREA} Community Board",
    "zh-TW": "{AREA} 的留言板"
  },

  // 掲示板の専用画面(board.html)への導線(モカ案作り変え第2弾 2026-11-15)。
  community_board_more_link: {
    ja: "掲示板の投稿をもっと見る",
    en: "See more board posts",
    "zh-TW": "查看更多留言板貼文"
  },

  board_page_doc_title: {
    ja: "街の掲示板｜マチナウ",
    en: "Community Board | Machinau",
    "zh-TW": "城市留言板｜Machinau"
  },

  board_page_label: {
    ja: "街の掲示板",
    en: "Community Board",
    "zh-TW": "城市留言板"
  },

  board_page_lead: {
    ja: "この街を訪れる人へ、地元のひとことを残す場所です。",
    en: "A place where locals leave a few words for people visiting this town.",
    "zh-TW": "這是當地人為造訪這座城市的人留下一句話的地方。"
  },

  board_page_loading: {
    ja: "読み込み中…",
    en: "Loading…",
    "zh-TW": "載入中…"
  },

  board_page_no_area: {
    ja: "街が選ばれていません。トップページで現在地を取得するか、「地域から探す」で街を選んでから、もう一度開いてください。",
    en: "No town is selected yet. Get your location on the top page, or choose a town from “Search by area”, then open this page again.",
    "zh-TW": "尚未選擇城市。請在首頁取得目前位置，或從「依地區搜尋」選擇城市後，再重新開啟此頁面。"
  },

  // 街の掲示板 停止防止｜掲示板を取得できなかった時(投稿0件とは別の表示)。
  community_board_load_error: {
    ja: "掲示板を読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't load this community board. Please try again later.",
    "zh-TW": "無法載入留言板。請稍後再試一次。"
  },

  community_board_empty: {
    ja: "この街の掲示板は、まだ投稿がありません。",
    en: "There are no posts on this community board yet.",
    "zh-TW": "這個城市的留言板還沒有貼文。"
  },

  community_board_watch_video: {
    ja: "🎥 動画を見る",
    en: "🎥 Watch video",
    "zh-TW": "🎥 觀看影片"
  },

  street_discovery_heading: {
    ja: "街の発見",
    en: "Spotted Nearby",
    "zh-TW": "街頭發現"
  },

  street_discovery_lead: {
    ja: "近くの人が見つけた、今の街の様子です。",
    en: "What people nearby have spotted around town right now.",
    "zh-TW": "這是附近的人所發現的，這座城市現在的模樣。"
  },

  street_discovery_empty: {
    ja: "近くでは、まだ発見がありません。",
    en: "No discoveries nearby yet.",
    "zh-TW": "附近還沒有任何發現。"
  },

  street_discovery_empty_region: {
    ja: "この街では、まだ発見がありません。",
    en: "No discoveries in this town yet.",
    "zh-TW": "這個城市還沒有任何發現。"
  },

  street_discovery_area_note_prefix: {
    ja: "選んだ街「",
    en: "Discoveries in ",
    "zh-TW": "您選擇的城市「"
  },

  street_discovery_area_note_suffix: {
    ja: "」の発見です。",
    en: " (the town you picked).",
    "zh-TW": "」的發現。"
  },

  community_board_post_link: {
    ja: "今いる街について投稿する",
    en: "Post about the city you're in now",
    "zh-TW": "發布關於目前所在城市的貼文"
  },

  community_board_post_link_remote: {
    ja: "{AREA}について投稿する",
    en: "Post about {AREA}",
    "zh-TW": "發布關於 {AREA} 的貼文"
  },

  area_search_coverage_note: {
    ja: "いま情報が集まっているのは沖縄県です。他の都道府県は、これから広げていきます。",
    en: "Listings are currently available in Okinawa only. Other prefectures will be added over time.",
    "zh-TW": "目前有資訊的地區是沖繩縣。其他都道府縣今後將陸續增加。"
  },

  community_board_prefecture_label: {
    ja: "都道府県",
    en: "Prefecture",
    "zh-TW": "都道府縣"
  },

  community_board_prefecture_placeholder: {
    ja: "選択してください",
    en: "Please select",
    "zh-TW": "請選擇"
  },

  community_board_area_name_label: {
    ja: "市区町村",
    en: "City / Ward / Town / Village",
    "zh-TW": "市區町村"
  },

  community_board_area_name_placeholder: {
    ja: "例：渋谷区",
    en: "e.g. Shibuya-ku",
    "zh-TW": "例：澀谷區"
  },

  community_board_area_name_select_placeholder_before: {
    ja: "先に都道府県を選択してください",
    en: "Please select a prefecture first",
    "zh-TW": "請先選擇都道府縣"
  },

  community_board_area_name_select_placeholder_after: {
    ja: "選択してください",
    en: "Please select",
    "zh-TW": "請選擇"
  },

  community_board_area_search_button: {
    ja: "この街を見る",
    en: "View this city",
    "zh-TW": "查看這個城市"
  },

  community_board_area_search_error: {
    ja: "街を確認できませんでした。都道府県と市区町村名を確認してください。",
    en: "We couldn't confirm this city. Please check the prefecture and city/ward/town/village name.",
    "zh-TW": "無法確認該城市。請確認都道府縣與市區町村名稱。"
  },

  slider_prev_button: {
    ja: "前の写真",
    en: "Previous photo",
    "zh-TW": "上一張照片"
  },

  slider_next_button: {
    ja: "次の写真",
    en: "Next photo",
    "zh-TW": "下一張照片"
  },

  slider_dot_button: {
    ja: "写真{N}を表示",
    en: "Show photo {N}",
    "zh-TW": "顯示照片 {N}"
  },

  shop_image_alt: {
    ja: "{SHOP_NAME}の掲載写真",
    en: "Photo of {SHOP_NAME}",
    "zh-TW": "{SHOP_NAME} 的刊登照片"
  },

  modal_slider_image_alt: {
    ja: "店舗の掲載写真",
    en: "Shop photo",
    "zh-TW": "店家的刊登照片"
  },

  location_permission_toggle_close: {
    ja: "閉じる",
    en: "Close",
    "zh-TW": "關閉"
  },

  toilet_default_name: {
    ja: "トイレ",
    en: "Restroom",
    "zh-TW": "廁所"
  },

  toilet_found_count: {
    ja: "近くのトイレ {N}件が見つかりました。",
    en: "Found {N} restrooms nearby.",
    "zh-TW": "附近找到 {N} 間廁所。"
  },

  toilet_not_found: {
    ja: "半径1km以内にトイレ情報が見つかりませんでした。",
    en: "No restrooms found within 1km.",
    "zh-TW": "半徑 1km 內找不到廁所資訊。"
  },

  toilet_precondition_location: {
    ja: "先に現在地を取得してください。",
    en: "Please get your location first.",
    "zh-TW": "請先取得目前位置。"
  },

  toilet_searching: {
    ja: "近くのトイレを検索しています…",
    en: "Searching for nearby restrooms…",
    "zh-TW": "正在搜尋附近的廁所…"
  },

  toilet_search_error: {
    ja: "トイレ情報の取得に失敗しました。しばらくしてから再度お試しください。",
    en: "Couldn't find restroom info. Please try again later.",
    "zh-TW": "無法取得廁所資訊。請稍後再試一次。"
  },

  toilet_open_in_google_maps: {
    ja: "Google Mapsで開く",
    en: "Open in Google Maps",
    "zh-TW": "在 Google Maps 中開啟"
  },

  toilet_distance_from_current_location_prefix: {
    ja: "現在地から ",
    en: "From your location, ",
    "zh-TW": "距離目前位置 "
  },

  weather_condition_sunny: {
    ja: "晴れ",
    en: "Sunny",
    "zh-TW": "晴天"
  },

  weather_condition_cloudy: {
    ja: "くもり",
    en: "Cloudy",
    "zh-TW": "多雲"
  },

  weather_condition_rainy: {
    ja: "雨",
    en: "Rainy",
    "zh-TW": "雨"
  },

  weather_condition_stormy: {
    ja: "雷雨",
    en: "Stormy",
    "zh-TW": "雷雨"
  },

  weather_condition_foggy: {
    ja: "霧",
    en: "Foggy",
    "zh-TW": "霧"
  },

  weather_condition_fair: {
    ja: "変わりやすい天気",
    en: "Fair",
    "zh-TW": "天氣多變"
  },

  shop_empty_category_notice: {
    ja: "現在、このカテゴリーに掲載中の情報はありません。",
    en: "No listings in this category right now.",
    "zh-TW": "目前這個分類沒有刊登中的資訊。"
  },

  flash_banner_breaking_prefix: {
    ja: "🚨 速報：",
    en: "🚨 Breaking: ",
    "zh-TW": "🚨 速報："
  },

  flash_banner_default_title: {
    ja: "今日だけの沖縄を、見逃さない。",
    en: "Don't miss today's Okinawa moments.",
    "zh-TW": "不要錯過今天的沖繩。"
  },

  flash_banner_default_message: {
    ja: "タイムセールや限定イベントなど、今しか出会えない情報を配信します。",
    en: "We share time-limited deals and events you won't find anywhere else.",
    "zh-TW": "為您送上限時特賣與限定活動等，只有現在才遇得到的資訊。"
  },

  modal_website_button: {
    ja: "🔗 お店のページを見る",
    en: "🔗 View shop page",
    "zh-TW": "🔗 查看店家頁面"
  },

  // 運営投稿(sourceLabelあり)のwebsiteUrl＝運営が参照した情報元ページ。
  modal_source_page_button: {
    ja: "🔗 情報元ページを見る",
    en: "🔗 View source page",
    "zh-TW": "🔗 查看資訊來源頁面"
  },

  firebase_not_ready_error: {
    ja: "Firebaseの準備が完了しませんでした。",
    en: "Firebase failed to initialize in time.",
    "zh-TW": "Firebase 的準備未完成。"
  },

  shop_name_fallback: {
    ja: "店舗名未登録",
    en: "Shop name unavailable",
    "zh-TW": "尚未登記店家名稱"
  },

  shop_title_fallback: {
    ja: "今だけの情報",
    en: "Limited-time info",
    "zh-TW": "今日限定資訊"
  },

  shop_content_fallback: {
    ja: "詳しい情報は店舗へご確認ください。",
    en: "Please check with the shop for details.",
    "zh-TW": "詳細資訊請向店家確認。"
  },

  shop_time_message_fallback: {
    ja: "⚡ マチナウ掲載中",
    en: "⚡ Now on Machinau",
    "zh-TW": "⚡ Machinau 刊登中"
  },

  current_location_marker_title: {
    ja: "現在地",
    en: "Current location",
    "zh-TW": "目前位置"
  },

  // 街の今スレッド Phase 1C-2｜TOP一覧＋詳細モーダル(見るだけ)。
  // 文言は仮(代表が実機確認後に最終判断)。投稿本文・返信本文は翻訳しない。
  town_now_heading: {
    ja: "街の今スレッド",
    en: "Town Now Threads",
    "zh-TW": "城市現況討論串"
  },

  town_now_description: {
    ja: "近くにいる人たちの、今日の会話です。",
    en: "Today's conversations from people nearby.",
    "zh-TW": "附近的人今天的對話。"
  },

  town_now_empty: {
    ja: "近くでは、まだ今日の会話がありません。",
    en: "No conversations nearby yet today.",
    "zh-TW": "附近今天還沒有任何對話。"
  },

  town_now_open_button: {
    ja: "会話を見る",
    en: "View conversation",
    "zh-TW": "查看對話"
  },

  town_now_modal_loading: {
    ja: "読み込み中…",
    en: "Loading…",
    "zh-TW": "載入中…"
  },

  town_now_thread_ended: {
    ja: "この会話は公開を終了しました。",
    en: "This conversation is no longer available.",
    "zh-TW": "這個對話已結束公開。"
  },

  town_now_load_error: {
    ja: "会話を読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load this conversation. Please try again later.",
    "zh-TW": "無法載入對話。請稍後再試一次。"
  },

  town_now_replies_heading: {
    ja: "返信",
    en: "Replies",
    "zh-TW": "回覆"
  },

  town_now_replies_empty: {
    ja: "まだ返信はありません。",
    en: "No replies yet.",
    "zh-TW": "還沒有回覆。"
  },

  // 街の今スレッド Phase 1C-3｜投稿導線・返信。文言は仮(代表が実機確認後に判断)。
  town_now_new_thread_link: {
    ja: "新しいスレッドを立てる",
    en: "Start a new thread",
    "zh-TW": "建立新的討論串"
  },

  town_now_reply_placeholder: {
    ja: "返信を書く",
    en: "Write a reply",
    "zh-TW": "寫下回覆"
  },

  town_now_reply_button: {
    ja: "返信する",
    en: "Reply",
    "zh-TW": "回覆"
  },

  town_now_reply_sending: {
    ja: "送信しています…",
    en: "Sending…",
    "zh-TW": "傳送中…"
  },

  town_now_reply_pending: {
    ja: "返信を受け付けました。確認後に公開されます。",
    en: "Reply received. It will appear after review.",
    "zh-TW": "已收到您的回覆。確認後將會公開。"
  },

  town_now_reply_error: {
    ja: "返信できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't send your reply. Please try again later.",
    "zh-TW": "無法傳送回覆。請稍後再試一次。"
  },

  town_now_reply_rate_limited: {
    ja: "短時間に続けて返信されています。少し待ってから、もう一度お試しください。",
    en: "You're replying too quickly. Please wait a moment and try again.",
    "zh-TW": "您在短時間內連續回覆。請稍等一下再試一次。"
  },

  town_now_reply_invalid: {
    ja: "返信内容を確認してください。",
    en: "Please check your reply.",
    "zh-TW": "請確認回覆內容。"
  },

  // 正式店舗参加基盤 Phase 1｜店舗・施設アカウント画面(store-account.html)の固定UI文言。
  // 認証エラー等はFirebaseのエラーcodeから画面側でこのキーへ対応付ける(内部データには保存しない)。

  store_account_doc_title: {
    ja: "店舗・施設アカウント｜マチナウ",
    en: "Business Account | Machinau",
    "zh-TW": "店家・設施帳號｜Machinau"
  },

  store_account_page_label: {
    ja: "マチナウ 店舗・施設アカウント",
    en: "Machinau Business Account",
    "zh-TW": "Machinau 店家・設施帳號"
  },

  store_account_intro: {
    ja: "お店・施設・イベント主催者の方のためのアカウントです。",
    en: "An account for shops, facilities and event organizers.",
    "zh-TW": "這是供店家、設施與活動主辦單位使用的帳號。"
  },

  store_account_phase_note: {
    ja: "このアカウントで、お店・施設の登録や引き継ぎ、基本情報の編集・公開、今だけ投稿ができます。",
    en: "With this account, you can register or take over a shop or facility, edit and publish its basic information, and make Just for Now posts.",
    "zh-TW": "使用這個帳號，您可以註冊或接手店家・設施、編輯與公開基本資訊，以及發布今日限定貼文。"
  },

  store_account_title_login: {
    ja: "ログイン",
    en: "Log in",
    "zh-TW": "登入"
  },

  store_account_title_signup: {
    ja: "新規アカウント登録",
    en: "Create an account",
    "zh-TW": "註冊新帳號"
  },

  store_account_title_reset: {
    ja: "パスワード再設定",
    en: "Reset your password",
    "zh-TW": "重設密碼"
  },

  store_account_title_account: {
    ja: "アカウント",
    en: "Your account",
    "zh-TW": "帳號"
  },

  store_account_email_label: {
    ja: "メールアドレス",
    en: "Email address",
    "zh-TW": "電子郵件地址"
  },

  store_account_password_label: {
    ja: "パスワード",
    en: "Password",
    "zh-TW": "密碼"
  },

  store_account_password_confirm_label: {
    ja: "パスワード（確認）",
    en: "Confirm password",
    "zh-TW": "確認密碼"
  },

  store_account_password_hint: {
    ja: "8文字以上で入力してください。",
    en: "Use at least 8 characters.",
    "zh-TW": "請輸入至少 8 個字元。"
  },

  store_account_show_password: {
    ja: "パスワードを表示する",
    en: "Show password",
    "zh-TW": "顯示密碼"
  },

  store_account_agree_prefix: {
    ja: "",
    en: "I agree to the ",
    "zh-TW": ""
  },

  store_account_agree_terms_link: {
    ja: "利用規約",
    en: "Terms of Use",
    "zh-TW": "使用條款"
  },

  store_account_agree_and: {
    ja: "と",
    en: " and the ",
    "zh-TW": "與"
  },

  store_account_agree_privacy_link: {
    ja: "プライバシーポリシー",
    en: "Privacy Policy",
    "zh-TW": "隱私權政策"
  },

  store_account_agree_suffix: {
    ja: "に同意します",
    en: "",
    "zh-TW": "，我同意。"
  },

  store_account_legal_ja_only: {
    ja: "",
    en: "(The Terms of Use and Privacy Policy are available in Japanese only.)",
    "zh-TW": ""
  },

  store_account_signup_button: {
    ja: "アカウントを作成する",
    en: "Create account",
    "zh-TW": "建立帳號"
  },

  store_account_login_button: {
    ja: "ログインする",
    en: "Log in",
    "zh-TW": "登入"
  },

  store_account_reset_button: {
    ja: "再設定メールを送る",
    en: "Send reset email",
    "zh-TW": "寄送重設郵件"
  },

  store_account_reset_intro: {
    ja: "登録したメールアドレスを入力してください。パスワードを再設定するためのメールをお送りします。",
    en: "Enter the email address you registered with. We will send you an email to reset your password.",
    "zh-TW": "請輸入您註冊的電子郵件地址。我們會寄送一封讓您重設密碼的郵件。"
  },

  store_account_to_signup: {
    ja: "はじめての方：新規アカウント登録",
    en: "New here? Create an account",
    "zh-TW": "第一次使用：註冊新帳號"
  },

  store_account_to_login: {
    ja: "登録済みの方：ログイン",
    en: "Already have an account? Log in",
    "zh-TW": "已註冊：登入"
  },

  store_account_forgot: {
    ja: "パスワードを忘れた方",
    en: "Forgot your password?",
    "zh-TW": "忘記密碼了嗎"
  },

  store_account_back_to_login: {
    ja: "ログイン画面へ戻る",
    en: "Back to log in",
    "zh-TW": "返回登入畫面"
  },

  store_account_logout_button: {
    ja: "ログアウトする",
    en: "Log out",
    "zh-TW": "登出"
  },

  store_account_status_logged_in: {
    ja: "ログインしています",
    en: "You are logged in",
    "zh-TW": "已登入"
  },

  store_account_status_email_label: {
    ja: "メールアドレス",
    en: "Email address",
    "zh-TW": "電子郵件地址"
  },

  store_account_status_verify_label: {
    ja: "メール確認",
    en: "Email verification",
    "zh-TW": "電子郵件確認"
  },

  store_account_status_verified: {
    ja: "確認済み",
    en: "Verified",
    "zh-TW": "已確認"
  },

  store_account_status_unverified: {
    ja: "未確認",
    en: "Not verified",
    "zh-TW": "未確認"
  },

  store_account_status_store_link_label: {
    ja: "店舗との紐付け",
    en: "Linked shop",
    "zh-TW": "與店家的綁定"
  },

  store_account_status_store_link_none: {
    ja: "まだありません",
    en: "None yet",
    "zh-TW": "尚無"
  },

  store_account_verify_sent: {
    ja: "確認メールを送りました。メール内のリンクを開いて、メールアドレスを確認してください。",
    en: "We have sent you a verification email. Open the link in the email to verify your email address.",
    "zh-TW": "已寄送確認郵件。請開啟郵件中的連結，確認您的電子郵件地址。"
  },

  store_account_verify_needed: {
    ja: "メールアドレスの確認がまだ完了していません。確認が済むまで、店舗機能はご利用いただけません。",
    en: "Your email address has not been verified yet. Shop features will not be available until it is.",
    "zh-TW": "您的電子郵件地址尚未完成確認。在確認完成之前，無法使用店家功能。"
  },

  store_account_verify_spam_hint: {
    ja: "メールが見つからない場合は、迷惑メールフォルダもご確認ください。",
    en: "If you can't find the email, please check your spam folder.",
    "zh-TW": "如果找不到郵件，請也檢查垃圾郵件資料夾。"
  },

  store_account_resend_button: {
    ja: "確認メールを再送する",
    en: "Resend verification email",
    "zh-TW": "重新寄送確認郵件"
  },

  store_account_resend_wait: {
    ja: "再送は少し時間をおいてからお試しください。",
    en: "Please wait a little before resending.",
    "zh-TW": "重新寄送請稍等一段時間後再試。"
  },

  store_account_refresh_button: {
    ja: "確認が済んだら：状態を更新する",
    en: "Verified? Refresh status",
    "zh-TW": "確認完成後：更新狀態"
  },

  store_account_still_unverified: {
    ja: "まだ確認が完了していません。メール内のリンクを開いてから、もう一度お試しください。",
    en: "Not verified yet. Open the link in the email, then try again.",
    "zh-TW": "確認尚未完成。請開啟郵件中的連結後，再試一次。"
  },

  store_account_verified_now: {
    ja: "メールアドレスの確認が完了しました。",
    en: "Your email address has been verified.",
    "zh-TW": "電子郵件地址確認已完成。"
  },

  store_account_reset_sent: {
    ja: "このメールアドレスが登録されている場合は、パスワード再設定のメールを送りました。メール内のリンクから新しいパスワードを設定してください。",
    en: "If this email address is registered, we have sent a password reset email. Use the link in the email to set a new password.",
    "zh-TW": "如果這個電子郵件地址已註冊，我們已寄送密碼重設郵件。請透過郵件中的連結設定新密碼。"
  },

  store_account_logged_out: {
    ja: "ログアウトしました。",
    en: "You have logged out.",
    "zh-TW": "已登出。"
  },

  store_account_processing: {
    ja: "処理中…",
    en: "Processing…",
    "zh-TW": "處理中…"
  },

  store_account_back_to_top: {
    ja: "← マチナウTOPへ",
    en: "← Back to Machinau",
    "zh-TW": "← 回到 Machinau 首頁"
  },

  store_account_err_email_required: {
    ja: "メールアドレスを入力してください。",
    en: "Please enter your email address.",
    "zh-TW": "請輸入電子郵件地址。"
  },

  store_account_err_email_invalid: {
    ja: "メールアドレスの形式が正しくありません。",
    en: "Please enter a valid email address.",
    "zh-TW": "電子郵件地址格式不正確。"
  },

  store_account_err_password_required: {
    ja: "パスワードを入力してください。",
    en: "Please enter your password.",
    "zh-TW": "請輸入密碼。"
  },

  store_account_err_password_short: {
    ja: "パスワードは8文字以上にしてください。",
    en: "Your password must be at least 8 characters.",
    "zh-TW": "密碼必須至少 8 個字元。"
  },

  store_account_err_password_long: {
    ja: "パスワードは128文字以内にしてください。",
    en: "Your password must be 128 characters or fewer.",
    "zh-TW": "密碼必須在 128 個字元以內。"
  },

  store_account_err_password_same_email: {
    ja: "メールアドレスと同じパスワードは使えません。",
    en: "Your password can't be the same as your email address.",
    "zh-TW": "密碼不能與電子郵件地址相同。"
  },

  store_account_err_password_mismatch: {
    ja: "確認用のパスワードが一致しません。",
    en: "The passwords don't match.",
    "zh-TW": "確認用密碼不一致。"
  },

  store_account_err_agree_required: {
    ja: "利用規約とプライバシーポリシーへの同意が必要です。",
    en: "Please agree to the Terms of Use and Privacy Policy.",
    "zh-TW": "需要同意使用條款與隱私權政策。"
  },

  store_account_err_email_in_use: {
    ja: "このメールアドレスはすでに登録されています。ログインするか、パスワード再設定をご利用ください。",
    en: "This email address is already registered. Please log in or reset your password.",
    "zh-TW": "這個電子郵件地址已經註冊。請登入或使用密碼重設。"
  },

  store_account_err_weak_password: {
    ja: "このパスワードは安全性が低いため使えません。別のパスワードにしてください。",
    en: "This password is too weak. Please choose a different one.",
    "zh-TW": "這個密碼安全性太低，無法使用。請改用其他密碼。"
  },

  store_account_err_login_failed: {
    ja: "メールアドレスまたはパスワードが正しくありません。",
    en: "The email address or password is incorrect.",
    "zh-TW": "電子郵件地址或密碼不正確。"
  },

  store_account_err_user_disabled: {
    ja: "このアカウントは現在ご利用いただけません。",
    en: "This account is currently unavailable.",
    "zh-TW": "這個帳號目前無法使用。"
  },

  store_account_err_too_many: {
    ja: "操作が続いたため、一時的に制限されています。しばらくしてからお試しください。",
    en: "Too many attempts. Please wait a while and try again.",
    "zh-TW": "操作次數過多，已暫時受到限制。請稍後再試。"
  },

  store_account_err_network: {
    ja: "通信できませんでした。電波の良い場所でもう一度お試しください。",
    en: "Couldn't connect. Please check your connection and try again.",
    "zh-TW": "無法連線。請到訊號良好的地方再試一次。"
  },

  store_account_err_not_allowed: {
    ja: "現在、この操作を受け付けていません。時間をおいてお試しください。",
    en: "This action is not available right now. Please try again later.",
    "zh-TW": "目前不接受此操作。請稍後再試。"
  },

  store_account_err_generic: {
    ja: "エラーが発生しました。時間をおいてもう一度お試しください。",
    en: "Something went wrong. Please try again later.",
    "zh-TW": "發生錯誤。請稍後再試一次。"
  },

  store_account_err_unavailable: {
    ja: "ただいまアカウント機能を利用できません。ページを再読み込みしてください。",
    en: "The account service is unavailable right now. Please reload the page.",
    "zh-TW": "目前無法使用帳號功能。請重新載入頁面。"
  },

  store_account_verify_preparing: {
    ja: "確認メールを準備しています。数秒後に1回だけ送信します。",
    en: "Preparing your verification email. It will be sent once in a few seconds.",
    "zh-TW": "正在準備驗證郵件。將在幾秒後只傳送一次。"
  },

  store_account_verify_preparing_button: {
    ja: "確認メールを送信しています…",
    en: "Sending verification email…",
    "zh-TW": "正在傳送驗證郵件…"
  },

  store_account_verify_cooldown_active: {
    ja: "このブラウザでは、直前に確認メールを送ったばかりのため、今は送信していません。再送できるようになったら、「確認メールを再送する」を押してください。",
    en: "A verification email was just sent from this browser, so no email was sent this time. When you can resend, press \"Resend verification email\".",
    "zh-TW": "此瀏覽器剛傳送過驗證郵件，因此這次沒有傳送。等到可以重新傳送時，請按下「重新傳送驗證郵件」。"
  },

  store_account_resend_available_in: {
    ja: "再送できるまで あと {time}",
    en: "You can resend in {time}",
    "zh-TW": "距離可重新傳送還剩 {time}"
  },

  store_account_duration_hours_minutes: {
    ja: "{h}時間{m}分",
    en: "{h}h {m}m",
    "zh-TW": "{h}小時{m}分"
  },

  store_account_err_verify_too_many: {
    ja: "確認メールの送信が一時的に制限されています。時間を十分に空けてから、再度お試しください。続けて操作しても送信されません。",
    en: "Sending verification emails is temporarily restricted. Please wait a good while before trying again. Repeated attempts will not send an email.",
    "zh-TW": "驗證郵件的傳送暫時受到限制。請間隔足夠的時間後再試一次。即使繼續操作也不會傳送。"
  },

  store_account_status_store_count: {
    ja: "{n}件",
    en: "{n} registered",
    "zh-TW": "{n}件"
  },

  store_account_store_verify_required: {
    ja: "店舗・施設の登録には、メールアドレスの確認が必要です。確認が済んだら「状態を更新する」を押してください。",
    en: "You need to verify your email address before registering a shop or facility. After verifying, press \"Refresh status\".",
    "zh-TW": "註冊店家・設施需要驗證電子郵件地址。驗證完成後，請按下「更新狀態」。"
  },

  store_account_stores_heading: {
    ja: "あなたの店舗・施設",
    en: "Your shops & facilities",
    "zh-TW": "您的店家・設施"
  },

  store_account_stores_empty: {
    ja: "まだ登録されていません。",
    en: "Nothing registered yet.",
    "zh-TW": "尚未註冊。"
  },

  store_account_store_open_form: {
    ja: "店舗・施設を登録する",
    en: "Register a shop or facility",
    "zh-TW": "註冊店家・設施"
  },

  store_account_store_form_heading: {
    ja: "店舗・施設の登録",
    en: "Register a shop or facility",
    "zh-TW": "註冊店家・設施"
  },

  store_account_store_name_label: {
    ja: "店舗・施設名",
    en: "Shop / facility name",
    "zh-TW": "店家・設施名稱"
  },

  store_account_store_category_label: {
    ja: "カテゴリ",
    en: "Category",
    "zh-TW": "類別"
  },

  store_account_store_category_placeholder: {
    ja: "選んでください",
    en: "Please choose",
    "zh-TW": "請選擇"
  },

  store_account_store_country_label: {
    ja: "国・地域",
    en: "Country / region",
    "zh-TW": "國家・地區"
  },

  store_account_store_address_label: {
    ja: "住所",
    en: "Address",
    "zh-TW": "地址"
  },

  store_account_store_address_hint: {
    ja: "番地・建物名まで入力してください。旅行者に表示する場所の基準になります。",
    en: "Enter the full street address, including the building number. This is used as your location for travelers.",
    "zh-TW": "請輸入到門牌號碼・建築物名稱為止。這將成為向遊客顯示位置的基準。"
  },

  store_account_store_preview_button: {
    ja: "所在地を確認する",
    en: "Check location",
    "zh-TW": "確認所在地"
  },

  store_account_store_preview_title: {
    ja: "見つかった所在地",
    en: "Location found",
    "zh-TW": "找到的所在地"
  },

  store_account_store_preview_partial: {
    ja: "住所の一部だけが一致しました。地図で場所が正しいか必ず確認し、違う場合は住所を詳しく入力し直してください。",
    en: "Only part of the address matched. Please check the map, and if the place is wrong, enter a more detailed address.",
    "zh-TW": "地址只有一部分相符。請務必在地圖上確認位置是否正確，若不正確，請重新輸入更詳細的地址。"
  },

  store_account_store_preview_map: {
    ja: "地図で場所を確認する",
    en: "Check on the map",
    "zh-TW": "在地圖上確認位置"
  },

  store_account_store_preview_confirm_hint: {
    ja: "場所が正しければ「この内容で登録する」を押してください。",
    en: "If the location is correct, press \"Register\".",
    "zh-TW": "如果位置正確，請按下「以此內容註冊」。"
  },

  store_account_store_register_button: {
    ja: "この内容で登録する",
    en: "Register",
    "zh-TW": "以此內容註冊"
  },

  store_account_store_register_with_plan: {
    ja: "同意して登録し、月額100円（税込）を申し込む",
    en: "Agree, register and subscribe (¥100/month, tax included)",
    "zh-TW": "同意並註冊，申請每月 100 日圓（含稅）"
  },
  store_account_store_register_submit: {
    ja: "お店を登録する",
    en: "Register your shop",
    "zh-TW": "註冊我的店家"
  },

  store_signup_plan_note: {
    ja: "登録だけでは契約は成立しません。お店を公開する時に、月額100円（税込）の契約を申し込みます。",
    en: "Registering alone does not start a contract. You subscribe to the ¥100/month plan (tax included) when you publish your shop.",
    "zh-TW": "僅註冊並不會成立合約。在公開店家時，才會申請每月 100 日圓（含稅）的合約。"
  },

  store_signup_consent_required: {
    ja: "月額100円（税込）の料金と条件を確認し、同意のチェックを入れてください。",
    en: "Please check the ¥100/month fee and terms (tax included) and tick the box to agree.",
    "zh-TW": "請確認每月 100 日圓（含稅）的費用與條件，並勾選同意。"
  },

  store_signup_unavailable: {
    ja: "いまは月額100円のプランの申し込みを受け付けていないため、登録・引き継ぎができません。時間をおいてお試しください。",
    en: "Sign-up for the ¥100/month plan is not available right now, so registering or taking over a shop is not possible. Please try again later.",
    "zh-TW": "目前未受理每月 100 日圓方案的申請，因此無法註冊・接手。請稍後再試。"
  },

  store_claim_plan_note: {
    ja: "引き継ぎだけでは契約は成立しません。お店を公開する時に、月額100円（税込）の契約を申し込みます。",
    en: "Taking over a listing alone does not start a contract. You subscribe to the ¥100/month plan (tax included) when you publish your shop.",
    "zh-TW": "僅接手並不會成立合約。在公開店家時，才會申請每月 100 日圓（含稅）的合約。"
  },

  store_claim_err_plan_required: {
    ja: "選んだ店舗は月額100円の契約が有効ではないため、つなげません。新しい店舗として引き継ぐか、その店舗の「店舗カードの編集・申し込み」から申し込んでください。",
    en: "The shop you selected has no active ¥100/month contract, so the listing cannot be connected to it. Take it over as a new shop, or subscribe from that shop's \"Edit store card / subscribe\".",
    "zh-TW": "您選擇的店家沒有有效的每月 100 日圓合約，因此無法連結。請將其作為新店家接手，或從該店家的「店家卡片的編輯・申請」進行申請。"
  },

  store_account_store_cancel_button: {
    ja: "やめる",
    en: "Cancel",
    "zh-TW": "取消"
  },

  store_account_category_gourmet: {
    ja: "グルメ",
    en: "Food & dining",
    "zh-TW": "美食"
  },

  store_account_category_cafe_sweets: {
    ja: "カフェ・スイーツ",
    en: "Cafés & sweets",
    "zh-TW": "咖啡・甜點"
  },

  store_account_category_shopping: {
    ja: "ショッピング",
    en: "Shopping",
    "zh-TW": "購物"
  },

  store_account_category_sightseeing_experience: {
    ja: "観光・体験",
    en: "Sightseeing & experiences",
    "zh-TW": "觀光・體驗"
  },

  store_account_category_nightlife: {
    ja: "ナイトスポット",
    en: "Nightlife",
    "zh-TW": "夜生活景點"
  },

  store_account_category_beauty_relaxation: {
    ja: "美容・リラクゼーション",
    en: "Beauty & relaxation",
    "zh-TW": "美容・放鬆"
  },

  store_account_category_lodging: {
    ja: "宿泊",
    en: "Lodging",
    "zh-TW": "住宿"
  },

  // 今だけ投稿 決済 STEP 31｜お支払い方法(カード登録、store-account.html)。
  store_billing_heading: {
    ja: "お支払い方法",
    en: "Payment method",
    "zh-TW": "付款方式"
  },

  store_billing_test_badge: {
    ja: "テスト環境",
    en: "Test mode",
    "zh-TW": "測試環境"
  },

  // LEGAL-CORRECTION｜STEP 52-F 2026年10月30日の告知（施行予定日 11月7日）の訂正(店舗アカウントの画面)。新しい日付は書かない。
  // 店舗カードの月額料金の請求の開始と規約B案の事前告知(施行日の版で外す)。
  store_account_billing_notice_title: {
    ja: "お知らせ：店舗カードの月額料金の請求の開始と、利用規約・特定商取引法に基づく表記の改定について",
    en: "Notice: the store card monthly fee will start being charged, and our Terms of Service and Specified Commercial Transactions Act disclosure are being revised",
    "zh-TW": "公告：關於店家卡片每月費用開始收費，以及使用條款・依特定商取引法之標示的修訂"
  },
  store_account_billing_notice_start: {
    ja: "店舗カードの月額契約（1つのお店・施設につき月額100円・税込）の月額料金は、2026年11月分から請求します。11月分は2026年11月30日に締め、2026年12月2日に、登録されたクレジットカードへ請求します。月額契約を申し込んでいないお店・施設に料金が発生することはありません。申し込みより前の月の月額料金は請求しません。",
    en: "The store card monthly fee (¥100 per shop or venue per month, tax included) will be charged from November 2026. November is closed on November 30, 2026 and charged to your registered credit card on December 2, 2026. Shops and venues without a monthly plan are not charged. We do not charge for months before you subscribed.",
    "zh-TW": "店家卡片每月合約（每個店家・設施每月 100 日圓・含稅）的每月費用，將從 2026 年 11 月份開始收費。11 月份將於 2026 年 11 月 30 日結算，並於 2026 年 12 月 2 日向您註冊的信用卡收費。未申請每月合約的店家・設施不會產生費用。申請月份之前的每月費用不會收費。"
  },
  store_account_billing_notice_revision: {
    ja: "あわせて、利用料金をお支払いいただく時期（予定日に請求できなかった場合の扱い）と、店舗カードの月額料金の請求の開始の記載を改定します。改定後の内容は利用規約・特定商取引法に基づく表記の各ページの上部のお知らせのとおりで、下記の施行日から適用します。施行日の前日までは、改定前の内容（現在の本文）が適用されます。",
    en: "We are also revising when fees are charged (what happens if a charge cannot be made on the scheduled day) and the start of store card billing. The revised text is shown in the notice at the top of the Terms of Service and the Specified Commercial Transactions Act disclosure and applies from the effective date below. Until the day before, the current text applies.",
    "zh-TW": "同時，我們將修訂支付使用費用的時間（若在預定日期無法收費時的處理方式），以及店家卡片每月費用開始收費的相關記載。修訂後的內容如使用條款・依特定商取引法之標示各頁面上方的公告所示，並自下述生效日期起適用。在生效日期前一天之前，適用修訂前的內容（目前的正文）。"
  },
  store_account_billing_notice_date: {
    ja: "施行日：2026年12月1日",
    en: "Effective date: December 1, 2026",
    "zh-TW": "生效日期：2026 年 12 月 1 日"
  },
  store_account_billing_notice_tokushoho_link: {
    ja: "特定商取引法に基づく表記",
    en: "Specified Commercial Transactions Act disclosure",
    "zh-TW": "依特定商取引法之標示"
  },

  store_account_legal_correction_title: {
    ja: "お知らせ（訂正）：2026年10月30日の「店舗アカウントの退会機能の追加と、利用規約・プライバシーポリシーの改定」のお知らせについて",
    en: "Correction to our notice of October 30, 2026 (account closure and revised Terms of Service / Privacy Policy)",
    "zh-TW": "公告（更正）：關於 2026 年 10 月 30 日「新增店家帳號註銷功能，以及使用條款・隱私權政策修訂」的公告"
  },
  store_account_legal_correction_body: {
    ja: "このお知らせでご案内した施行予定日（2026年11月7日）を変更しました。改定後の利用規約・プライバシーポリシー（店舗アカウントの退会、規約の変更の手続き、店舗カードの月額料金の追加など）は、下記の施行日から適用します。施行日の前日までは、改定前の利用規約・プライバシーポリシーが適用されます。改定後の内容は、各ページの本文のとおりです。",
    en: "The planned effective date in that notice (November 7, 2026) has been changed. The revised Terms of Service and Privacy Policy (account closure, the procedure for changing the terms, the addition of the store card monthly fee, etc.) apply from the effective date below. Until the day before the effective date, the Terms of Service and Privacy Policy before the revision apply. The revised text is as shown on each page.",
    "zh-TW": "我們變更了該公告中所通知的預定生效日期（2026 年 11 月 7 日）。修訂後的使用條款・隱私權政策（店家帳號註銷、條款變更程序、新增店家卡片每月費用等）將自下述生效日期起適用。在生效日期前一天之前，適用修訂前的使用條款・隱私權政策。修訂後的內容如各頁面正文所示。"
  },
  store_account_legal_correction_date: {
    ja: "施行日：2026年11月1日",
    en: "Effective date: November 1, 2026",
    "zh-TW": "生效日期：2026 年 11 月 1 日"
  },
  store_account_legal_correction_contract: {
    ja: "既存の店舗アカウントの方に、店舗カードの月額料金が自動で発生することはありません。店舗カードの月額契約（1つのお店・施設につき月額100円・税込）は、施行日以降に店舗アカウントの画面で料金と条件を確認し、同意して申し込んだ場合にだけ成立します。契約の無い店舗カードは、施行日から旅行者に公開されません（保存した内容は消えません）。店舗アカウントの退会は、施行日からこの画面で申し込めます。",
    en: "No store card monthly fee is charged automatically to existing business accounts. A store card monthly contract (¥100 per shop or venue per month, tax included) is made only when you check the fee and terms on the business account page and agree and apply on or after the effective date. Store cards without a contract are not shown to travelers from the effective date (your saved content is kept). From the effective date, you can request the closure of your business account on this page.",
    "zh-TW": "既有的店家帳號不會自動產生店家卡片的每月費用。店家卡片每月合約（每個店家・設施每月 100 日圓・含稅），僅在生效日期之後，於店家帳號畫面確認費用與條件並同意申請時才成立。沒有合約的店家卡片，自生效日期起不會向遊客公開（已儲存的內容不會消失）。店家帳號的註銷，自生效日期起可在此畫面申請。"
  },

  store_billing_intro: {
    ja: "店舗カードの月額料金（1店舗・月額100円・税込）と、今だけ投稿の利用料金（旅行者が「続きを見る」を押した「投稿×1日」ごとに100円・税込）のお支払いに使うカードを登録します。どちらも月末締め・翌月2日にカードへ請求します（別々に請求します）。カードは1つのアカウントに1枚で、このアカウントで管理するすべてのお店・施設に共通です。お店・施設を公開する時の月額契約の申込みにも、カードの登録が必要です。カードを登録しただけでは料金は発生しません。店舗カードの月額料金は、月額契約を申し込んだお店・施設についてだけ請求します。カード番号は決済会社（Stripe）が直接受け取り、マチナウには保存されません（保存するのは、カードのブランド・下4桁・有効期限だけです）。",
    en: "Register the card used to pay the store card fee (¥100 per shop per month, tax included) and Just for Now fees (¥100 incl. tax for each post × day when a traveler tapped to read more). Both are closed at month end and charged to the card on the 2nd of the next month (billed separately). One card per account, shared by all the shops and venues you manage with this account. A card is also required when you subscribe to the monthly plan to publish a shop or venue. Registering a card does not by itself incur any fee. The store card monthly fee is charged only for shops and venues that have a monthly contract. Your card number goes directly to our payment provider (Stripe) and is not stored by Machinau (we keep only the card brand, last 4 digits and expiry date).",
    "zh-TW": "註冊用於支付店家卡片每月費用（每家店每月 100 日圓・含稅），以及今日限定貼文使用費（遊客按下「查看更多」的每個「貼文×1天」100 日圓・含稅）的信用卡。兩者皆為每月月底結算，於次月 2 日向信用卡收費（分別收費）。每個帳號只能註冊一張信用卡，且為此帳號所管理的所有店家・設施共用。在公開店家・設施申請每月合約時，也需要註冊信用卡。僅註冊信用卡不會產生費用。店家卡片的每月費用，僅向已申請每月合約的店家・設施收費。卡號由支付公司（Stripe）直接接收，Machinau 不會儲存（僅儲存卡片品牌、末 4 碼與有效期限）。"
  },

  store_billing_store_label: {
    ja: "事業者",
    en: "Business",
    "zh-TW": "業者"
  },

  store_billing_card_registered: {
    ja: "登録済みのカード",
    en: "Registered card",
    "zh-TW": "已註冊的信用卡"
  },

  store_billing_card_none: {
    ja: "カードはまだ登録されていません。",
    en: "No card registered yet.",
    "zh-TW": "尚未註冊信用卡。"
  },

  store_billing_start_button: {
    ja: "カードを登録する",
    en: "Register a card",
    "zh-TW": "註冊信用卡"
  },

  store_billing_change_button: {
    ja: "カードを変更する",
    en: "Change card",
    "zh-TW": "變更信用卡"
  },

  store_billing_consent: {
    ja: "利用規約（料金・お支払いの条項を含みます）に同意し、このカードを今だけ投稿の利用料金（月末締め・翌月まとめて請求）の支払いに使うことに同意します。",
    en: "I agree to the Terms of Service (including the fees and payment terms) and that this card will be used to pay Just for Now fees (billed monthly).",
    "zh-TW": "我同意使用條款（包含費用與付款條款），並同意將此信用卡用於支付今日限定貼文的使用費（每月月底結算、次月合併收費）。"
  },

  store_billing_submit_button: {
    ja: "このカードを登録する",
    en: "Register this card",
    "zh-TW": "註冊此信用卡"
  },

  // STEP 43-N｜カード登録の欄から、料金・お支払いの表記(利用規約・特定商取引法に基づく表記)へのリンク。
  store_billing_legal_prefix: {
    ja: "料金・お支払いについて：",
    en: "About fees and payment: ",
    "zh-TW": "關於費用・付款："
  },

  store_billing_legal_terms_link: {
    ja: "利用規約",
    en: "Terms of Service",
    "zh-TW": "使用條款"
  },

  store_billing_legal_and: {
    ja: "・",
    en: " / ",
    "zh-TW": "・"
  },

  store_billing_legal_tokushoho_link: {
    ja: "特定商取引法に基づく表記",
    en: "Legal Notice (Japanese)",
    "zh-TW": "依特定商取引法之標示"
  },

  store_billing_cancel_button: {
    ja: "やめる",
    en: "Cancel",
    "zh-TW": "取消"
  },

  store_billing_loading: {
    ja: "カードの入力欄を準備しています…",
    en: "Preparing the card form…",
    "zh-TW": "正在準備信用卡輸入欄…"
  },

  store_billing_confirming: {
    ja: "カードを確認しています…",
    en: "Checking your card…",
    "zh-TW": "正在確認信用卡…"
  },

  store_billing_saved: {
    ja: "カードを登録しました。",
    en: "Your card has been registered.",
    "zh-TW": "已註冊信用卡。"
  },

  store_billing_processing: {
    ja: "カードの確認中です。しばらくしてから、もう一度開いてください。",
    en: "Your card is still being checked. Please reopen this page in a moment.",
    "zh-TW": "信用卡正在確認中。請稍後再次開啟此頁面。"
  },

  store_billing_err_consent: {
    ja: "カードを使うことへの同意にチェックしてください。",
    en: "Please check the box to agree to how your card will be used.",
    "zh-TW": "請勾選同意使用信用卡。"
  },

  store_billing_err_requires_action: {
    ja: "カード会社の認証が完了していません。もう一度お試しください。",
    en: "Your card issuer's authentication was not completed. Please try again.",
    "zh-TW": "信用卡公司的驗證尚未完成。請再試一次。"
  },

  store_billing_err_failed: {
    ja: "このカードは登録できませんでした。別のカードでお試しください。",
    en: "This card could not be registered. Please try another card.",
    "zh-TW": "無法註冊此信用卡。請改用其他信用卡再試。"
  },

  store_billing_err_rate_limited: {
    ja: "少し時間をおいて、もう一度お試しください。",
    en: "Please wait a moment and try again.",
    "zh-TW": "請稍等片刻後再試一次。"
  },

  store_billing_err_unavailable: {
    ja: "現在、カード登録はご利用いただけません。",
    en: "Card registration is not available right now.",
    "zh-TW": "目前無法使用信用卡註冊。"
  },

  store_billing_err_stripe: {
    ja: "決済会社との通信に失敗しました。時間をおいて、もう一度お試しください。",
    en: "We couldn't reach the payment provider. Please try again later.",
    "zh-TW": "與支付公司的通訊失敗。請稍後再試一次。"
  },

  store_billing_err_retry: {
    ja: "登録の手続きをやり直してください。",
    en: "Please start the registration again.",
    "zh-TW": "請重新進行註冊手續。"
  },

  store_billing_err_generic: {
    ja: "カードを登録できませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't register your card. Please try again later.",
    "zh-TW": "無法註冊信用卡。請稍後再試一次。"
  },

  // 今だけ投稿 決済 STEP 38-B｜ご請求の履歴(store-account.html、読み取りだけ)。
  store_invoice_heading: {
    ja: "ご請求の履歴",
    en: "Billing history",
    "zh-TW": "收費記錄"
  },

  store_invoice_intro: {
    ja: "今だけ投稿のご利用料金（有効な閲覧があった「投稿×1日」ごとに100円・税込）です。月末に締めて金額を確定し、翌月にまとめて登録カードへご請求します。直近12か月分を表示します。",
    en: "Fees for Just for Now posts (¥100 incl. tax per post per day with at least one valid view). Amounts are confirmed at month-end and charged together to your registered card the following month. Shows the last 12 months.",
    "zh-TW": "今日限定貼文的使用費（有有效瀏覽的每個「貼文×1天」100 日圓・含稅）。於每月月底結算並確定金額，次月合併向註冊的信用卡收費。顯示最近 12 個月。"
  },

  store_invoice_estimate_heading: {
    ja: "見込み（未確定）",
    en: "Estimate (not confirmed)",
    "zh-TW": "預估（未確定）"
  },

  store_invoice_estimate_line: {
    ja: "{month}：{count}件・{amount}（見込み）",
    en: "{month}: {count} item(s), {amount} (estimate)",
    "zh-TW": "{month}：{count}件・{amount}（預估）"
  },

  store_invoice_estimate_none: {
    ja: "未確定の見込みはありません。",
    en: "No pending estimate.",
    "zh-TW": "沒有未確定的預估。"
  },

  store_invoice_estimate_note: {
    ja: "見込みは月末の締めの後に確定します。確定したご請求額とは別で、合計していません。",
    en: "Estimates are confirmed after the month-end close. They are separate from confirmed charges and not added to them.",
    "zh-TW": "預估將在每月月底結算後確定。與已確定的收費金額分開，並未合計。"
  },

  store_invoice_confirmed_heading: {
    ja: "確定したご請求",
    en: "Confirmed charges",
    "zh-TW": "已確定的收費"
  },

  store_invoice_none: {
    ja: "確定した請求はまだありません。",
    en: "There are no confirmed charges yet.",
    "zh-TW": "尚無已確定的收費。"
  },

  store_invoice_month_format: {
    ja: "{year}年{month}月",
    en: "{year}/{month}",
    "zh-TW": "{year}年{month}月"
  },

  store_invoice_month_label: {
    ja: "{month}分",
    en: "{month}",
    "zh-TW": "{month}份"
  },

  store_invoice_yen_format: {
    ja: "{amount}円",
    en: "¥{amount}",
    "zh-TW": "{amount} 日圓"
  },

  store_invoice_amount_line: {
    ja: "ご請求額：{amount}（税込）・{count}件",
    en: "Amount: {amount} (incl. tax), {count} item(s)",
    "zh-TW": "收費金額：{amount}（含稅）・{count}件"
  },

  store_invoice_closed_at: {
    ja: "確定日：{date}",
    en: "Confirmed on: {date}",
    "zh-TW": "確定日期：{date}"
  },

  store_invoice_paid_at: {
    ja: "お支払い日：{date}",
    en: "Paid on: {date}",
    "zh-TW": "付款日期：{date}"
  },

  store_invoice_line_no_headline: {
    ja: "（見出しなし）",
    en: "(no headline)",
    "zh-TW": "（無標題）"
  },

  store_invoice_lines_truncated: {
    ja: "明細が多いため、一部だけを表示しています。",
    en: "Only part of the details is shown because there are many items.",
    "zh-TW": "由於明細很多，僅顯示一部分。"
  },

  store_invoice_aggregating_note: {
    ja: "月末の締めの集計中です。金額は確定後に表示します。",
    en: "The month-end close is in progress. The amount will be shown once confirmed.",
    "zh-TW": "正在進行每月月底結算的統計。金額將在確定後顯示。"
  },

  store_invoice_status_aggregating: {
    ja: "集計処理中",
    en: "Calculating",
    "zh-TW": "統計處理中"
  },

  store_invoice_status_confirmed_unbilled: {
    ja: "確定済み・カードへのご請求前",
    en: "Confirmed, not yet charged",
    "zh-TW": "已確定・尚未向信用卡收費"
  },

  store_invoice_status_processing: {
    ja: "ご請求の処理中",
    en: "Charge in progress",
    "zh-TW": "收費處理中"
  },

  store_invoice_status_paid: {
    ja: "お支払い済み",
    en: "Paid",
    "zh-TW": "已付款"
  },

  store_invoice_status_payment_failed: {
    ja: "カードでのお支払いができませんでした（カードの確認をお願いします）",
    en: "The card payment failed (please check your card)",
    "zh-TW": "信用卡付款失敗（請確認您的信用卡）"
  },

  store_invoice_status_requires_action: {
    ja: "カードの本人確認が必要です。運営からご連絡します",
    en: "Card authentication is required. We will contact you.",
    "zh-TW": "需要信用卡的本人驗證。營運團隊將與您聯絡"
  },

  store_invoice_status_under_review: {
    ja: "確認中（運営が確認しています）",
    en: "Under review by Machinau",
    "zh-TW": "確認中（營運團隊正在確認）"
  },

  store_invoice_err_load: {
    ja: "ご請求の履歴を読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't load your billing history. Please try again later.",
    "zh-TW": "無法載入收費記錄。請稍後再試一次。"
  },

  store_account_category_other: {
    ja: "その他",
    en: "Other",
    "zh-TW": "其他"
  },

  store_account_store_status_active: {
    ja: "登録済み",
    en: "Registered",
    "zh-TW": "已註冊"
  },

  store_account_store_status_pending_review: {
    ja: "運営確認中",
    en: "Under review",
    "zh-TW": "營運團隊確認中"
  },

  store_account_store_status_rejected: {
    ja: "登録できませんでした",
    en: "Not accepted",
    "zh-TW": "無法註冊"
  },

  store_account_store_status_suspended: {
    ja: "停止中",
    en: "Suspended",
    "zh-TW": "已停止"
  },

  store_account_store_note_active: {
    ja: "店舗カードを編集できます。旅行者への公開には、月額100円（税込）の申し込みが必要です。",
    en: "You can edit your store card. To show it to travelers, a ¥100/month (tax included) subscription is required.",
    "zh-TW": "您可以編輯店家卡片。若要向遊客公開，需要申請每月 100 日圓（含稅）。"
  },

  store_account_store_note_active_contracted: {
    ja: "店舗カードを編集できます。",
    en: "You can edit your store card.",
    "zh-TW": "您可以編輯店家卡片。"
  },

  store_account_store_note_pending_review: {
    ja: "すでに登録されている店舗情報と重複していないかなどを、運営が確認しています。確認が終わるまでお待ちください。",
    en: "Our team is checking that this registration does not duplicate an existing listing. Please wait until the check is complete.",
    "zh-TW": "營運團隊正在確認此註冊是否與已註冊的店家資訊重複等。請等到確認完成。"
  },

  store_account_store_note_rejected: {
    ja: "この登録はご利用いただけません。ご不明な点はマチナウ運営へお問い合わせください。",
    en: "This registration cannot be used. If you have questions, please contact Machinau.",
    "zh-TW": "此註冊無法使用。如有任何疑問，請聯絡 Machinau 營運團隊。"
  },

  store_account_store_note_suspended: {
    ja: "この店舗・施設は現在停止しています。マチナウ運営へお問い合わせください。",
    en: "This shop or facility is currently suspended. Please contact Machinau.",
    "zh-TW": "此店家・設施目前已停止。請聯絡 Machinau 營運團隊。"
  },

  store_account_store_registered_active: {
    ja: "店舗・施設を登録しました（下書き）。「店舗カードの編集・申し込み」から店舗情報を編集し、月額100円（税込）の契約を申し込んで公開すると、旅行者に表示されます。",
    en: "Your shop or venue is registered (as a draft). Edit its details from \"Edit / subscribe to the store card\", subscribe to the ¥100/month plan (tax included) and publish to show it to travelers.",
    "zh-TW": "已註冊店家・設施（草稿）。從「店家卡片的編輯・申請」編輯店家資訊，申請每月 100 日圓（含稅）的合約並公開後，就會向遊客顯示。"
  },

  store_account_store_registered_pending: {
    ja: "登録を受け付けました。運営の確認が終わるまでお待ちください。",
    en: "Your registration was received. Please wait until our team has checked it.",
    "zh-TW": "已受理註冊。請等到營運團隊確認完成。"
  },

  store_account_store_err_verify: {
    ja: "メールアドレスの確認が済んでいません。確認後に「状態を更新する」を押してください。",
    en: "Your email address is not verified yet. After verifying, press \"Refresh status\".",
    "zh-TW": "電子郵件地址尚未完成驗證。驗證後請按下「更新狀態」。"
  },

  store_account_store_err_login: {
    ja: "ログインし直してから、もう一度お試しください。",
    en: "Please log in again and try once more.",
    "zh-TW": "請重新登入後再試一次。"
  },

  store_account_store_err_address_not_found: {
    ja: "住所が見つかりませんでした。選んだ国・地域と住所を確認してください。",
    en: "The address could not be found. Please check the country/region and address.",
    "zh-TW": "找不到地址。請確認所選的國家・地區與地址。"
  },

  store_account_store_err_too_coarse: {
    ja: "場所を特定できませんでした。番地・建物名まで入力してください。",
    en: "The location could not be pinpointed. Please enter the full street address.",
    "zh-TW": "無法確定位置。請輸入到門牌號碼・建築物名稱為止。"
  },

  store_account_store_err_country_mismatch: {
    ja: "選んだ国・地域の中で住所が見つかりませんでした。国・地域の選択を確認してください。",
    en: "The address was not found in the selected country/region. Please check your selection.",
    "zh-TW": "在所選的國家・地區內找不到該地址。請確認國家・地區的選擇。"
  },

  store_account_store_err_geocoding: {
    ja: "ただいま所在地を確認できません。時間をおいてお試しください。",
    en: "We can't check locations right now. Please try again later.",
    "zh-TW": "目前無法確認所在地。請稍後再試。"
  },

  store_account_store_err_already_registered: {
    ja: "この店舗・施設は、すでにこのアカウントで登録されています。",
    en: "This shop or facility is already registered with this account.",
    "zh-TW": "此店家・設施已以此帳號註冊。"
  },

  store_account_store_err_rate_limited: {
    ja: "続けて操作されたため、少し時間をおいてからお試しください。",
    en: "Please wait a moment before trying again.",
    "zh-TW": "由於連續操作，請稍等片刻後再試。"
  },

  store_account_store_err_name: {
    ja: "店舗・施設名を60文字以内で入力してください。",
    en: "Please enter a shop/facility name (up to 60 characters).",
    "zh-TW": "請以 60 個字元以內輸入店家・設施名稱。"
  },

  store_account_store_err_category: {
    ja: "カテゴリを選んでください。",
    en: "Please choose a category.",
    "zh-TW": "請選擇類別。"
  },

  store_account_store_err_country: {
    ja: "国・地域を選んでください。",
    en: "Please choose a country/region.",
    "zh-TW": "請選擇國家・地區。"
  },

  store_account_store_err_address: {
    ja: "住所を200文字以内で入力してください。",
    en: "Please enter an address (up to 200 characters).",
    "zh-TW": "請以 200 個字元以內輸入地址。"
  },

  store_profile_doc_title: {
    ja: "お店の基本情報｜マチナウ",
    en: "Basic Shop Information | Machinau",
    "zh-TW": "店家基本資訊｜Machinau"
  },

  store_profile_heading: {
    ja: "お店の基本情報",
    en: "Basic shop information",
    "zh-TW": "店家基本資訊"
  },
  store_profile_heading_note: {
    ja: "ここに入力した内容は、お店のページに常に載る内容です。期間限定のお知らせは『今だけ投稿』から出せます。",
    en: "Everything you enter here always appears on your shop page. For limited-time announcements, use an Imadake (now) post.",
    "zh-TW": "在此輸入的內容，會一直顯示在店家頁面上。期間限定的公告可從「今日限定貼文」發布。"
  },

  store_profile_flow_steps: {
    ja: "①お店の基本 → ②くわしい情報 → ③確認と公開",
    en: "① Basics → ② More details → ③ Check and publish",
    "zh-TW": "①店家基本資訊 → ②詳細資訊 → ③確認與公開"
  },

  store_profile_block_basic: {
    ja: "① お店の基本（公開に必要なもの）",
    en: "① Basics (needed to publish)",
    "zh-TW": "① 店家基本資訊（公開所需）"
  },

  store_profile_block_detail: {
    ja: "② くわしい情報（任意・後からでもOK）",
    en: "② More details (optional — add anytime)",
    "zh-TW": "② 詳細資訊（選填・之後也可以）"
  },

  store_profile_block_publish: {
    ja: "③ 確認と公開",
    en: "③ Check and publish",
    "zh-TW": "③ 確認與公開"
  },

  store_profile_not_public_banner: {
    ja: "まだ公開されていません。入力した内容は下書きとして残ります。",
    en: "Not published yet. What you enter stays saved as a draft.",
    "zh-TW": "尚未公開。輸入的內容將保留為草稿。"
  },

  store_profile_loading: {
    ja: "読み込んでいます…",
    en: "Loading…",
    "zh-TW": "載入中…"
  },

  store_profile_login_required: {
    ja: "店舗・施設アカウントでログインしてから開いてください。",
    en: "Please log in with your business account first.",
    "zh-TW": "請以店家・設施帳號登入後再開啟。"
  },

  store_profile_not_found: {
    ja: "この店舗・施設の情報を開けませんでした。店舗・施設アカウントの画面から開き直してください。",
    en: "This shop or facility could not be opened. Please open it again from your business account page.",
    "zh-TW": "無法開啟此店家・設施的資訊。請從店家・設施帳號畫面重新開啟。"
  },

  store_profile_basic_heading: {
    ja: "店舗・施設",
    en: "Shop / facility",
    "zh-TW": "店家・設施"
  },

  store_profile_location_label: {
    ja: "所在地",
    en: "Location",
    "zh-TW": "所在地"
  },

  store_profile_name_location_note: {
    ja: "店舗・施設名と所在地は、下の「変更する」ボタンから変えられます。変えても、お店のページのURL（アドレス）は変わりません。",
    en: "You can change the shop name and location with the \"Change\" button below. Your shop page URL (address) will not change.",
    "zh-TW": "店家・設施名稱與所在地，可透過下方的「變更」按鈕更改。即使更改，店家頁面的網址（URL）也不會改變。"
  },

  // STEP 56｜店舗・施設名と所在地の変更(店主本人)・お店ごとの固定の公開ページ
  store_identity_edit_button: {
    ja: "変更する",
    en: "Change",
    "zh-TW": "變更"
  },
  store_identity_address_label: {
    ja: "住所",
    en: "Address",
    "zh-TW": "地址"
  },
  store_identity_note: {
    ja: "住所は、保存の時に地図上の位置を確かめます（国・地域は変わりません）。同じ名前のお店が近くに掲載されている時は、確認が済むまで旅行者に表示されないことがあります。",
    en: "When you save, we check the address on the map (the country/region stays the same). If a shop with the same name is listed nearby, your shop may not be shown to travelers until this is resolved.",
    "zh-TW": "地址會在儲存時於地圖上確認位置（國家・地區不會變更）。若附近已刊登同名的店家，在確認完成前，可能不會顯示給旅客。"
  },
  store_identity_save_button: {
    ja: "変更を保存する",
    en: "Save changes",
    "zh-TW": "儲存變更"
  },
  store_identity_cancel_button: {
    ja: "やめる",
    en: "Cancel",
    "zh-TW": "取消"
  },
  store_identity_saved: {
    ja: "店舗・施設名と所在地を保存しました。お店のページのURLは変わりません。",
    en: "The name and location have been saved. The URL of your shop page stays the same.",
    "zh-TW": "已儲存店家・設施名稱與所在地。店家頁面的 URL 不會變更。"
  },
  store_identity_saved_duplicate: {
    ja: "保存しました。同じ名前のお店が近くに掲載されているため、公開の条件をご確認ください。",
    en: "Saved. A shop with the same name is listed nearby, so please check the publishing conditions.",
    "zh-TW": "已儲存。由於附近已刊登同名的店家，請確認公開的條件。"
  },
  store_identity_err_account_deleting: {
    ja: "退会の手続き中のため、変更できません。",
    en: "This can't be changed while your account closure is in progress.",
    "zh-TW": "退會手續進行中，無法變更。"
  },
  store_identity_err_conflict: {
    ja: "別の画面で内容が変わりました。ページを読み込み直してから、もう一度お試しください。",
    en: "The details were changed on another screen. Please reload the page and try again.",
    "zh-TW": "內容已在其他畫面變更。請重新載入頁面後再試一次。"
  },
  store_page_url_label: {
    ja: "お店のページのURL（アドレス）",
    en: "Your shop page (permanent URL)",
    "zh-TW": "店家頁面的 URL（網址）"
  },
  store_page_copy_button: {
    ja: "URLをコピー",
    en: "Copy URL",
    "zh-TW": "複製 URL"
  },
  store_page_copied: {
    ja: "URLをコピーしました。",
    en: "URL copied.",
    "zh-TW": "已複製 URL。"
  },
  store_page_copy_failed: {
    ja: "コピーできませんでした。上のURLを長押し・選択してコピーしてください。",
    en: "Couldn't copy. Please press and hold or select the URL above to copy it.",
    "zh-TW": "無法複製。請長按・選取上方的 URL 來複製。"
  },
  store_page_note_published: {
    ja: "公開中です。このURLをLINE・Instagram・SNS・QRコードで共有できます。店舗・施設名・写真・紹介文を変えても、URLは変わりません。",
    en: "Published. You can share this URL on LINE, Instagram, other social media or as a QR code. It stays the same even if you change the name, photos or description.",
    "zh-TW": "目前公開中。您可以透過 LINE、Instagram、SNS、QR 碼分享此 URL。即使變更店家・設施名稱、照片、介紹文，URL 也不會改變。"
  },
  store_page_note_draft: {
    ja: "公開されている間だけ、このURLでお店のページが開きます（今は開けません）。",
    en: "Your shop page opens at this URL only while it is published (it can't be opened right now).",
    "zh-TW": "只有在公開期間，才能透過此 URL 開啟店家頁面（目前無法開啟）。"
  },
  store_management_pricing_note: {
    ja: "マチナウの店舗管理サービスは月額100円（税込）です。新規店舗登録も、掲載済み店舗の引き継ぎも、同じ料金・同じ条件です。お店の登録と店舗情報の編集は、メールアドレスの確認だけでできます（下書きとして保存され、旅行者には表示されません）。お店を公開するには、クレジットカードの登録と月額100円の契約が必要です。アカウントの作成とクレジットカードの登録だけでは料金はかかりません。料金は、公開の申込みの時に申し込む月額100円の契約からかかります。",
    en: "Machinau's store management service is ¥100/month (tax included) per shop. Registering a new shop and taking over a shop already listed on Machinau cost the same, with the same conditions. You can register a shop and edit its details with just a confirmed email address (saved as a draft that travelers cannot see). To publish a shop you need a registered credit card and the ¥100/month contract. Creating an account and registering a credit card alone are free of charge. Charges start with the ¥100/month contract you sign up for when you publish.",
    "zh-TW": "Machinau 的店家管理服務為每月 100 日圓（含稅）。新店家註冊與已刊登店家的接手，價格與條件相同。店家註冊與店家資訊的編輯，只需確認電子郵件地址即可進行（會儲存為草稿，不會顯示給旅客）。若要公開店家，需要註冊信用卡並簽訂每月 100 日圓的合約。僅建立帳號與註冊信用卡不會產生費用。費用將從您在申請公開時所簽訂的每月 100 日圓合約開始收取。"
  },

  store_profile_description_label: {
    ja: "紹介文",
    en: "Description",
    "zh-TW": "介紹文"
  },

  store_profile_description_placeholder: {
    ja: "久茂地の小さな食堂です。平日のランチは近所で働く人にも人気で、夜は地元の食材の一品料理が中心です。",
    en: "A small diner in Kumoji. Weekday lunches are popular with people working nearby, and in the evening we mainly serve dishes made with local ingredients.",
    "zh-TW": "位於久茂地的小食堂。平日的午餐深受附近上班族歡迎，晚上則以使用在地食材的一品料理為主。"
  },
  store_profile_description_hint: {
    ja: "お店の特徴や、お客さんに知ってほしいことを書いてください（1,000文字まで）。何のお店か、おすすめは何か、どんなときに使えるか、を書くと伝わります。",
    en: "Write what makes your shop special and what customers should know (up to 1,000 characters). It helps to say what kind of shop it is, what you recommend, and when people can enjoy it.",
    "zh-TW": "請寫下店家的特色與希望顧客知道的內容（最多 1,000 字）。寫明這是什麼樣的店家、推薦什麼、適合什麼時候使用，會更容易傳達。"
  },

  store_profile_hours_heading: {
    ja: "営業時間",
    en: "Opening hours",
    "zh-TW": "營業時間"
  },

  store_profile_hours_enable: {
    ja: "営業時間を設定する",
    en: "Set opening hours",
    "zh-TW": "設定營業時間"
  },

  store_profile_hours_hint: {
    ja: "曜日ごとに最大2つの時間帯を設定できます。閉店が翌日になる場合は、そのまま翌日の時刻を入れてください（例：18:00〜02:00）。",
    en: "You can set up to two time ranges per day. If you close after midnight, enter the next-day time as is (e.g. 18:00–02:00).",
    "zh-TW": "每個星期最多可設定 2 個時段。若打烊時間為隔日，請直接輸入隔日的時間（例：18:00〜02:00）。"
  },

  store_profile_hours_note_label: {
    ja: "営業時間の補足",
    en: "Note on opening hours",
    "zh-TW": "營業時間補充說明"
  },

  store_profile_hours_note_hint: {
    ja: "例：祝日は不定休、ラストオーダー21:30（100文字まで）",
    en: "e.g. Irregular holidays, last order 21:30 (up to 100 characters)",
    "zh-TW": "例：國定假日不定期公休、最後點餐 21:30（最多 100 字）"
  },

  store_profile_preview_heading: {
    ja: "プレビュー（公開したときの見え方）",
    en: "Preview (how it looks when published)",
    "zh-TW": "預覽（公開時的顯示方式）"
  },

  store_profile_preview_note: {
    ja: "上の入力に合わせて、その場で変わります。保存する前の内容も出るので、公開したときの見え方を確認しながら直せます。並び順は実際の公開ページと同じです。",
    en: "It updates as you type in the fields above, including changes you have not saved yet, so you can fix things while checking how the published page will look. Sections are in the same order as the real page.",
    "zh-TW": "會依上方的輸入即時變更。尚未儲存的內容也會顯示，因此可以一邊確認公開時的顯示方式一邊修改。排列順序與實際公開頁面相同。"
  },

  store_profile_preview_empty: {
    ja: "まだ表示できる内容がありません。写真と紹介文を入れると、ここに表示されます。",
    en: "Nothing to show yet. Add a photo and a description and they will appear here.",
    "zh-TW": "目前沒有可顯示的內容。加入照片與介紹文後，就會顯示在這裡。"
  },

  store_profile_preview_about: {
    ja: "お店・施設の紹介",
    en: "About",
    "zh-TW": "店家・設施介紹"
  },

  store_profile_preview_photos: {
    ja: "写真",
    en: "Photos",
    "zh-TW": "照片"
  },

  store_profile_preview_story: {
    ja: "こだわり・ストーリー",
    en: "Our story",
    "zh-TW": "堅持・故事"
  },

  store_profile_preview_menu: {
    ja: "メニュー・商品",
    en: "Menu & items",
    "zh-TW": "菜單・商品"
  },

  store_profile_preview_hours: {
    ja: "営業時間",
    en: "Opening hours",
    "zh-TW": "營業時間"
  },

  store_profile_preview_hours_draft: {
    ja: "営業時間は入力中です。保存できる形になると、ここに表示されます。",
    en: "Opening hours are still being entered. They will appear here once they are complete.",
    "zh-TW": "營業時間尚在輸入中。成為可儲存的形式後，就會顯示在這裡。"
  },

  store_profile_preview_location: {
    ja: "所在地",
    en: "Location",
    "zh-TW": "所在地"
  },

  store_profile_preview_info: {
    ja: "お店の情報",
    en: "Shop info",
    "zh-TW": "店家資訊"
  },

  store_profile_preview_contact: {
    ja: "電話・予約・SNS",
    en: "Phone, bookings & social",
    "zh-TW": "電話・預約・SNS"
  },

  store_profile_category_hint: {
    ja: "お店の種類です。お店のページと、一覧のカードに表示されます。",
    en: "The type of your shop. Shown on your shop page and on listing cards.",
    "zh-TW": "這是店家的類型。會顯示在店家頁面與列表的卡片上。"
  },

  store_profile_contact_hint: {
    ja: "電話番号・予約ページ・SNSは、お店のページの「電話・予約・SNS」に出ます。お客さんがそのまま電話や予約に進めます。",
    en: "Your phone number, booking page and social links appear under \"Phone, bookings & social\" on your page, so customers can call or book right away.",
    "zh-TW": "電話號碼・預約頁面・SNS 會顯示在店家頁面的「電話・預約・SNS」。顧客可以直接撥打電話或進行預約。"
  },

  store_profile_payment_hint: {
    ja: "お店のページの「お店の情報」に、選んだ支払い方法が表示されます。",
    en: "The payment methods you select appear under \"Shop info\" on your page.",
    "zh-TW": "您選擇的付款方式會顯示在店家頁面的「店家資訊」。"
  },

  store_profile_day_mon: {
    ja: "月曜日",
    en: "Monday",
    "zh-TW": "星期一"
  },

  store_profile_day_tue: {
    ja: "火曜日",
    en: "Tuesday",
    "zh-TW": "星期二"
  },

  store_profile_day_wed: {
    ja: "水曜日",
    en: "Wednesday",
    "zh-TW": "星期三"
  },

  store_profile_day_thu: {
    ja: "木曜日",
    en: "Thursday",
    "zh-TW": "星期四"
  },

  store_profile_day_fri: {
    ja: "金曜日",
    en: "Friday",
    "zh-TW": "星期五"
  },

  store_profile_day_sat: {
    ja: "土曜日",
    en: "Saturday",
    "zh-TW": "星期六"
  },

  store_profile_day_sun: {
    ja: "日曜日",
    en: "Sunday",
    "zh-TW": "星期日"
  },

  store_profile_day_closed: {
    ja: "定休日",
    en: "Closed",
    "zh-TW": "公休日"
  },

  store_profile_day_allday: {
    ja: "24時間",
    en: "Open 24 hours",
    "zh-TW": "24 小時"
  },

  store_profile_add_range: {
    ja: "＋ 時間帯を追加",
    en: "+ Add time range",
    "zh-TW": "＋ 新增時段"
  },

  store_profile_contact_heading: {
    ja: "連絡先・リンク",
    en: "Contact & links",
    "zh-TW": "聯絡方式・連結"
  },

  store_profile_phone_label: {
    ja: "電話番号",
    en: "Phone number",
    "zh-TW": "電話號碼"
  },

  store_profile_website_label: {
    ja: "Webサイト",
    en: "Website",
    "zh-TW": "網站"
  },

  store_profile_reservation_label: {
    ja: "予約ページ",
    en: "Reservation page",
    "zh-TW": "預約頁面"
  },

  store_profile_social_label: {
    ja: "SNS（最大3件）",
    en: "Social media (up to 3)",
    "zh-TW": "SNS（最多 3 件）"
  },

  store_profile_social_add: {
    ja: "＋ SNSを追加",
    en: "+ Add social media",
    "zh-TW": "＋ 新增 SNS"
  },

  store_profile_social_hint: {
    ja: "SNSの種類を選んで、ページのURLを入れてください。",
    en: "Choose the type and enter the page URL.",
    "zh-TW": "請選擇 SNS 的類型，並輸入頁面的 URL。"
  },

  store_profile_social_remove: {
    ja: "削除",
    en: "Remove",
    "zh-TW": "刪除"
  },

  store_profile_social_instagram: {
    ja: "Instagram",
    en: "Instagram",
    "zh-TW": "Instagram"
  },

  store_profile_social_x: {
    ja: "X",
    en: "X",
    "zh-TW": "X"
  },

  store_profile_social_facebook: {
    ja: "Facebook",
    en: "Facebook",
    "zh-TW": "Facebook"
  },

  store_profile_social_tiktok: {
    ja: "TikTok",
    en: "TikTok",
    "zh-TW": "TikTok"
  },

  store_profile_social_youtube: {
    ja: "YouTube",
    en: "YouTube",
    "zh-TW": "YouTube"
  },

  store_profile_social_threads: {
    ja: "Threads",
    en: "Threads",
    "zh-TW": "Threads"
  },

  store_profile_social_line: {
    ja: "LINE",
    en: "LINE",
    "zh-TW": "LINE"
  },

  store_profile_social_other: {
    ja: "その他",
    en: "Other",
    "zh-TW": "其他"
  },

  store_profile_payment_heading: {
    ja: "支払い方法",
    en: "Payment methods",
    "zh-TW": "付款方式"
  },

  store_profile_payment_cash: {
    ja: "現金",
    en: "Cash",
    "zh-TW": "現金"
  },

  store_profile_payment_card: {
    ja: "クレジットカード",
    en: "Credit card",
    "zh-TW": "信用卡"
  },

  store_profile_payment_qr: {
    ja: "QRコード決済",
    en: "QR code payment",
    "zh-TW": "QR 碼付款"
  },

  store_profile_save_button: {
    ja: "下書きを保存する",
    en: "Save draft",
    "zh-TW": "儲存草稿"
  },

  store_profile_reload_button: {
    ja: "最新の内容を読み込む",
    en: "Load the latest version",
    "zh-TW": "載入最新內容"
  },

  store_profile_back_to_account: {
    ja: "← 店舗・施設アカウントへ戻る",
    en: "← Back to your business account",
    "zh-TW": "← 返回店家・設施帳號"
  },

  store_profile_saved: {
    ja: "下書きを保存しました。まだ旅行者には表示されません。",
    en: "Draft saved. It is not shown to travelers yet.",
    "zh-TW": "已儲存草稿。目前尚未顯示給旅客。"
  },

  store_profile_not_editable_pending_review: {
    ja: "この店舗・施設は運営が確認中のため、まだ編集できません。",
    en: "This shop or facility is under review, so it can't be edited yet.",
    "zh-TW": "此店家・設施正由營運團隊確認中，目前無法編輯。"
  },

  store_profile_not_editable_rejected: {
    ja: "この店舗・施設の登録はご利用いただけないため、編集できません。",
    en: "This registration can't be used, so it can't be edited.",
    "zh-TW": "此店家・設施的註冊無法使用，因此無法編輯。"
  },

  store_profile_not_editable_suspended: {
    ja: "この店舗・施設は停止中のため、編集できません。",
    en: "This shop or facility is suspended, so it can't be edited.",
    "zh-TW": "此店家・設施已停止使用，因此無法編輯。"
  },

  store_profile_not_editable_other: {
    ja: "この店舗・施設は現在編集できません。",
    en: "This shop or facility can't be edited right now.",
    "zh-TW": "此店家・設施目前無法編輯。"
  },

  store_profile_not_editable_plan: {
    ja: "店舗情報の保存・編集は、このお店の月額100円（税込）の契約中だけできます。下の「店舗カード（月額100円・税込）」から料金と条件を確認して申し込んでください。",
    en: "You can save and edit shop details only while this shop's ¥100/month contract (tax included) is active. Check the fee and terms under \"Store card (¥100/month, tax included)\" below and subscribe.",
    "zh-TW": "店家資訊的儲存・編輯，僅能在此店家每月 100 日圓（含稅）的合約期間內進行。請從下方的「店家卡片（每月 100 日圓・含稅）」確認價格與條件後申請。"
  },

  store_profile_err_not_editable: {
    ja: "この店舗・施設は現在編集できません。",
    en: "This shop or facility can't be edited right now.",
    "zh-TW": "此店家・設施目前無法編輯。"
  },

  store_profile_err_conflict: {
    ja: "別の画面で先に保存されています。最新の内容を読み込んでから、もう一度保存してください。",
    en: "This was saved from another screen first. Please load the latest version, then save again.",
    "zh-TW": "已先在其他畫面儲存。請載入最新內容後，再儲存一次。"
  },

  store_profile_err_content: {
    ja: "掲載できない表現が含まれている可能性があります。紹介文・営業時間の補足を見直してください。",
    en: "The text may contain content that can't be published. Please review the description and the opening-hours note.",
    "zh-TW": "可能包含無法刊登的表現。請重新檢視介紹文・營業時間的補充說明。"
  },

  store_profile_err_safety_unavailable: {
    ja: "ただいま内容を確認できないため、保存できませんでした。時間をおいてお試しください。",
    en: "We can't check the content right now, so it was not saved. Please try again later.",
    "zh-TW": "目前無法確認內容，因此無法儲存。請稍後再試。"
  },

  store_profile_err_description: {
    ja: "紹介文は1,000文字以内で入力してください。",
    en: "Please keep the description within 1,000 characters.",
    "zh-TW": "介紹文請在 1,000 字以內輸入。"
  },

  store_profile_err_phone: {
    ja: "電話番号の形式を確認してください。",
    en: "Please check the phone number format.",
    "zh-TW": "請確認電話號碼的格式。"
  },

  store_profile_err_website: {
    ja: "WebサイトのURLを確認してください（https:// から始まるURL）。",
    en: "Please check the website URL (starting with https://).",
    "zh-TW": "請確認網站的 URL（以 https:// 開頭的 URL）。"
  },

  store_profile_err_reservation: {
    ja: "予約ページのURLを確認してください（https:// から始まるURL）。",
    en: "Please check the reservation page URL (starting with https://).",
    "zh-TW": "請確認預約頁面的 URL（以 https:// 開頭的 URL）。"
  },

  store_profile_err_social: {
    ja: "SNSのURLを確認してください（https:// から始まるURL、最大3件）。",
    en: "Please check the social media URLs (starting with https://, up to 3).",
    "zh-TW": "請確認 SNS 的 URL（以 https:// 開頭的 URL，最多 3 件）。"
  },

  store_profile_err_hours_note: {
    ja: "営業時間の補足は1行・100文字以内で入力してください。",
    en: "Please keep the opening-hours note to one line and 100 characters.",
    "zh-TW": "營業時間的補充說明請在 1 行・100 字以內輸入。"
  },

  store_profile_err_hours: {
    ja: "営業時間を確認してください。開始と終了の両方を入れ、時間帯が重ならないようにしてください。定休日は「定休日」を選んでください。",
    en: "Please check the opening hours. Enter both start and end, without overlapping ranges. For days off, choose \"Closed\".",
    "zh-TW": "請確認營業時間。請輸入開始與結束兩者，並避免時段重疊。公休日請選擇「公休日」。"
  },

  store_profile_edit_link: {
    ja: "店舗カードの編集・申し込み",
    en: "Edit store card / subscribe",
    "zh-TW": "店家卡片的編輯・申請"
  },

  store_feature_parking: {
    ja: "駐車場あり",
    en: "Parking",
    "zh-TW": "有停車場"
  },

  store_feature_free_wifi: {
    ja: "無料Wi-Fi",
    en: "Free Wi-Fi",
    "zh-TW": "免費 Wi-Fi"
  },

  store_feature_power_outlets: {
    ja: "電源あり",
    en: "Power outlets",
    "zh-TW": "有電源插座"
  },

  store_feature_wheelchair_accessible: {
    ja: "車いす対応",
    en: "Wheelchair accessible",
    "zh-TW": "輪椅友善"
  },

  store_feature_kid_friendly: {
    ja: "子ども連れ歓迎",
    en: "Kid-friendly",
    "zh-TW": "歡迎兒童同行"
  },

  store_feature_pet_friendly: {
    ja: "ペット同伴可",
    en: "Pet-friendly",
    "zh-TW": "可攜帶寵物"
  },

  store_feature_dine_in: {
    ja: "店内飲食",
    en: "Dine-in",
    "zh-TW": "店內用餐"
  },

  store_feature_takeout: {
    ja: "テイクアウト",
    en: "Takeout",
    "zh-TW": "外帶"
  },

  store_feature_delivery: {
    ja: "配送・デリバリー",
    en: "Delivery",
    "zh-TW": "配送・外送"
  },

  store_feature_store_pickup: {
    ja: "店頭受取",
    en: "In-store pickup",
    "zh-TW": "店面取貨"
  },

  store_feature_tax_free: {
    ja: "免税対応",
    en: "Tax-free shopping",
    "zh-TW": "提供免稅"
  },
  store_profile_feature_group_dining: {
    ja: "食べ方・受け取り",
    en: "Dining & takeout",
    "zh-TW": "用餐方式・取貨"
  },
  store_profile_feature_group_seats: {
    ja: "席",
    en: "Seating",
    "zh-TW": "座位"
  },
  store_profile_feature_group_parking: {
    ja: "駐車場",
    en: "Parking",
    "zh-TW": "停車場"
  },
  store_profile_feature_group_kids: {
    ja: "子ども連れ",
    en: "With children",
    "zh-TW": "兒童同行"
  },
  store_profile_feature_group_smoking: {
    ja: "たばこ",
    en: "Smoking",
    "zh-TW": "香菸"
  },
  store_profile_feature_group_facilities: {
    ja: "設備",
    en: "Facilities",
    "zh-TW": "設備"
  },
  store_profile_feature_group_other: {
    ja: "予約・その他",
    en: "Reservations & other",
    "zh-TW": "預約・其他"
  },
  store_profile_save_all_note: {
    ja: "押すと、このページの内容すべてが下書きとして保存されます。",
    en: "Pressing this saves everything on this page as a draft.",
    "zh-TW": "按下後，此頁面的所有內容都會儲存為草稿。"
  },
  store_feature_parking_free: {
    ja: "無料駐車場",
    en: "Free parking",
    "zh-TW": "免費停車場"
  },
  store_feature_parking_paid: {
    ja: "有料駐車場",
    en: "Paid parking",
    "zh-TW": "付費停車場"
  },
  store_feature_barrier_free: {
    ja: "バリアフリー対応",
    en: "Barrier-free access",
    "zh-TW": "無障礙友善"
  },
  store_feature_no_smoking: {
    ja: "禁煙",
    en: "No smoking",
    "zh-TW": "禁菸"
  },
  store_feature_smoking: {
    ja: "喫煙",
    en: "Smoking",
    "zh-TW": "可吸菸"
  },
  store_feature_table_seats: {
    ja: "テーブル席",
    en: "Table seating",
    "zh-TW": "桌席"
  },
  store_feature_counter_seats: {
    ja: "カウンター席",
    en: "Counter seating",
    "zh-TW": "吧檯座位"
  },
  store_feature_terrace_seats: {
    ja: "テラス席",
    en: "Terrace seating",
    "zh-TW": "露台座位"
  },
  store_feature_tatami_seats: {
    ja: "畳席",
    en: "Tatami seating",
    "zh-TW": "榻榻米座位"
  },
  store_feature_private_room: {
    ja: "個室",
    en: "Private room",
    "zh-TW": "包廂"
  },
  store_feature_kids_menu: {
    ja: "キッズメニュー",
    en: "Kids menu",
    "zh-TW": "兒童菜單"
  },
  store_feature_baby_chair: {
    ja: "ベビーチェア",
    en: "Baby chairs",
    "zh-TW": "嬰兒椅"
  },
  store_feature_diaper_changing: {
    ja: "おむつ替えスペース",
    en: "Diaper changing space",
    "zh-TW": "尿布更換空間"
  },
  store_feature_reservations_ok: {
    ja: "予約可",
    en: "Reservations accepted",
    "zh-TW": "可預約"
  },
  store_feature_private_rental: {
    ja: "貸切可",
    en: "Private hire available",
    "zh-TW": "可包場"
  },
  store_feature_english_menu: {
    ja: "英語メニュー",
    en: "English menu",
    "zh-TW": "英文菜單"
  },
  store_feature_allergy_friendly: {
    ja: "アレルギー対応",
    en: "Allergy information available",
    "zh-TW": "提供過敏資訊"
  },

  store_profile_features_heading: {
    ja: "設備・サービス",
    en: "Facilities & services",
    "zh-TW": "設備・服務"
  },

  store_profile_features_hint: {
    ja: "あてはまるものだけチェックしてください。チェックしない項目は「未登録」として扱われ、お客さんには非表示となります。",
    en: "Check only what applies. Unchecked items are treated as not registered and are not shown to customers.",
    "zh-TW": "請只勾選符合的項目。未勾選的項目將視為「未註冊」，不會顯示給顧客。"
  },

  store_profile_features_primary: {
    ja: "よく使われる項目",
    en: "Common for your category",
    "zh-TW": "常用項目"
  },

  store_profile_features_more: {
    ja: "その他の項目",
    en: "More items",
    "zh-TW": "其他項目"
  },

  store_profile_languages_heading: {
    ja: "対応言語",
    en: "Languages spoken",
    "zh-TW": "對應語言"
  },

  store_profile_languages_hint: {
    ja: "お店・施設で対応できる言語を選んでください。",
    en: "Choose the languages your staff can speak with customers.",
    "zh-TW": "請選擇店家・設施可對應的語言。"
  },

  // STEP 44-A｜月額100円カスタマイズ(店主の編集画面 store_custom_*・旅行者の詳細 shop_custom_*)。
  // STEP 44-B｜月額100円プランの申込・解約(店主の編集画面)。
  store_custom_plan_none_signup: {
    ja: "未契約です。店舗カードは旅行者に表示されていません（非公開）。店舗情報の保存・編集には月額100円（税込）の契約が必要です。料金と条件を確認して申し込むと、編集・公開できるようになります。",
    en: "Not subscribed. Your store card is not shown to travelers (not public). Saving and editing your shop details require the ¥100/month contract (tax included). Check the fee and terms below and subscribe to edit and publish.",
    "zh-TW": "尚未簽約。店家卡片不會顯示給旅客（未公開）。店家資訊的儲存・編輯需要每月 100 日圓（含稅）的合約。確認價格與條件並申請後，即可編輯・公開。"
  },

  store_custom_plan_canceling: {
    ja: "解約手続き済みです。{date}までは利用でき、その後は店舗カードを旅行者に表示しません（データは残ります）。",
    en: "Cancellation requested. You can use the store card until {date}; after that, it is no longer shown to travelers (your data is kept).",
    "zh-TW": "已完成取消手續。在 {date} 之前可以使用，之後店家卡片將不再顯示給旅客（資料會保留）。"
  },

  store_custom_plan_expired: {
    ja: "利用期限（{date}）が終了しました。店舗カードは旅行者に表示されていません（非公開）。",
    en: "The contract ended on {date}. Your store card is not shown to travelers (not public).",
    "zh-TW": "使用期限（{date}）已結束。店家卡片不會顯示給旅客（未公開）。"
  },

  store_custom_plan_other_active: {
    ja: "このお店の店舗カードの月額契約は、別のアカウントが契約しています。この画面での保存・編集はできますが、このアカウントでは申し込めません。",
    en: "This shop's store card contract belongs to another account. You can still save and edit here, but this account cannot subscribe.",
    "zh-TW": "此店家的店家卡片每月合約由其他帳號簽訂。在此畫面可以儲存・編輯，但此帳號無法申請。"
  },

  store_custom_plan_other_inactive: {
    ja: "以前の契約は、このアカウントには引き継がれません。店舗カードを公開するには、このアカウントで新しく申し込んでください。",
    en: "The previous contract is not transferred to this account. To make the store card public, subscribe with this account.",
    "zh-TW": "先前的合約不會移轉至此帳號。若要公開店家卡片，請以此帳號重新申請。"
  },

  store_custom_plan_dates_subscribed: {
    ja: "申込：{date}",
    en: "Subscribed: {date}",
    "zh-TW": "申請：{date}"
  },

  store_custom_plan_dates_until: {
    ja: "利用期限：{date}",
    en: "Available until: {date}",
    "zh-TW": "使用期限：{date}"
  },

  store_custom_plan_dates_canceled: {
    ja: "解約手続き：{date}",
    en: "Cancellation requested: {date}",
    "zh-TW": "取消手續：{date}"
  },

  store_custom_plan_trial_note: {
    ja: "現在は試験運用中です。申し込んでも料金は請求されません。利用期限は申込から1か月です（試験用の仮の期限）。",
    en: "This is a trial. You will not be charged. The plan is available for one month from sign-up (a temporary trial period).",
    "zh-TW": "目前為試營運中。即使申請也不會收取費用。使用期限為申請起 1 個月（試用用的暫定期限）。"
  },

  store_custom_plan_card_required: {
    ja: "申し込むには、お支払い方法（クレジットカード）の登録が必要です。",
    en: "A registered payment method (credit card) is required to subscribe.",
    "zh-TW": "申請時需要註冊付款方式（信用卡）。"
  },

  store_custom_plan_card_link: {
    ja: "カードを登録する →",
    en: "Register a card →",
    "zh-TW": "註冊信用卡 →"
  },

  store_custom_plan_subscribe_button: {
    ja: "店舗カードを申し込む（月額100円・税込）",
    en: "Subscribe to the store card (¥100/month, tax included)",
    "zh-TW": "申請店家卡（每月 100 日圓・含稅）"
  },

  store_custom_plan_reactivate_button: {
    ja: "解約を取り消して続ける",
    en: "Undo cancellation and continue",
    "zh-TW": "撤銷取消並繼續使用"
  },

  store_custom_plan_cancel_button: {
    ja: "解約する",
    en: "Cancel the plan",
    "zh-TW": "取消合約"
  },

  store_custom_plan_cancel_confirm: {
    ja: "店舗カードの月額契約を解約しますか？利用期限までは使えます。期限後は店舗カードを旅行者に表示しません（データは残ります）。",
    en: "Cancel the store card contract? You can use it until the end date. After that, your store card is not shown to travelers (your data is kept).",
    "zh-TW": "要取消店家卡的每月合約嗎？在到期日之前仍可使用。到期後，店家卡將不會顯示給旅客（資料會保留）。"
  },

  store_custom_plan_subscribed: {
    ja: "申し込みました。{date}まで利用できます。",
    en: "Subscribed. Available until {date}.",
    "zh-TW": "已完成申請。可使用至 {date}。"
  },

  store_custom_plan_reactivated: {
    ja: "解約を取り消しました。{date}まで利用できます。",
    en: "Cancellation undone. Available until {date}.",
    "zh-TW": "已撤銷取消。可使用至 {date}。"
  },

  store_custom_plan_canceled: {
    ja: "解約手続きをしました。{date}までは利用できます。",
    en: "Cancellation requested. You can use the plan until {date}.",
    "zh-TW": "已辦理取消手續。可使用至 {date}。"
  },

  store_custom_plan_already_canceled: {
    ja: "すでに解約手続き済みです（{date}まで利用できます）。",
    en: "Cancellation was already requested (available until {date}).",
    "zh-TW": "已經辦理取消手續（可使用至 {date}）。"
  },

  store_custom_plan_err_card: {
    ja: "申し込むには、お支払い方法（クレジットカード）の登録が必要です。",
    en: "A registered payment method (credit card) is required to subscribe.",
    "zh-TW": "申請時需要先註冊付款方式（信用卡）。"
  },

  store_custom_plan_err_already: {
    ja: "このお店はすでに店舗カードの月額契約をしています。",
    en: "This shop already has a store card contract.",
    "zh-TW": "這家店已經有店家卡的每月合約。"
  },

  store_custom_plan_err_unavailable: {
    ja: "店舗カードの月額契約の申し込みは、現在受け付けていません。",
    en: "Sign-up for the store card contract is not available right now.",
    "zh-TW": "店家卡每月合約目前不受理申請。"
  },

  store_custom_plan_err_not_active: {
    ja: "解約できる契約がありません。",
    en: "There is no active plan to cancel.",
    "zh-TW": "沒有可取消的合約。"
  },

  store_custom_plan_err_consent: {
    ja: "料金と条件を確認し、同意のチェックを入れてから申し込んでください。",
    en: "Please check the fee and terms and tick the consent box before subscribing.",
    "zh-TW": "請確認價格與條件，並勾選同意後再申請。"
  },

  store_card_plan_terms_heading: {
    ja: "料金と条件（店舗カード）",
    en: "Fee and terms (store card)",
    "zh-TW": "價格與條件（店家卡）"
  },

  store_card_plan_terms_fee: {
    ja: "料金は1店舗につき月額100円（税込）です。店舗カードの新規作成・引き継ぎのどちらも同じ料金です。",
    en: "The fee is ¥100 per shop per month (tax included), whether you create a new store card or take over a listing.",
    "zh-TW": "每家店每月 100 日圓（含稅）。無論是新建立店家卡或接手既有店家卡，價格都相同。"
  },

  store_card_plan_terms_scope: {
    ja: "基本情報（紹介文・写真・営業時間など）と、メニュー・商品紹介、追加リンク、お店のこだわり・ストーリーをすべて含みます。追加の料金はありません。",
    en: "It includes the basic information (description, photos, hours, etc.) and your menu and products, extra links and story. There are no extra fees.",
    "zh-TW": "包含基本資訊（介紹文、照片、營業時間等），以及菜單・商品介紹、追加連結、店家的堅持・故事。沒有額外費用。"
  },

  store_card_plan_terms_billing: {
    ja: "毎月末に締めて、翌月2日に登録したクレジットカードへ請求します。",
    en: "Each month is closed at month end and charged to your registered credit card on the 2nd of the next month.",
    "zh-TW": "每月月底結算，於次月 2 日向您註冊的信用卡收費。"
  },

  store_card_plan_terms_proration: {
    ja: "申し込んだ月・解約した月とも日割りはありません（その月の100円がかかります）。",
    en: "There is no proration for the month you subscribe or cancel (¥100 is charged for that month).",
    "zh-TW": "申請當月與取消當月均不按日計算（該月收取 100 日圓）。"
  },

  store_card_plan_terms_separate: {
    ja: "今だけ投稿の料金とは別の料金・別の請求です。",
    en: "This is a separate fee and a separate charge from Imadake posts.",
    "zh-TW": "這與今日限定貼文的費用是不同的費用、不同的收費。"
  },

  store_card_plan_terms_cancel: {
    ja: "いつでも解約でき、解約した月の月末まで利用できます。",
    en: "You can cancel at any time and use the store card until the end of the month you cancel.",
    "zh-TW": "隨時可以取消，可使用至取消當月的月底。"
  },

  store_card_plan_consent_label: {
    ja: "上の料金と条件を確認し、店舗カードの月額契約（月額100円・税込）に同意します。",
    en: "I have checked the fee and terms above and agree to the store card contract (¥100/month, tax included).",
    "zh-TW": "我已確認上述價格與條件，並同意店家卡每月合約（每月 100 日圓・含稅）。"
  },

  // STEP 44-C③｜本番の暦月契約・未払いの表示(店主の編集画面)。
  store_custom_plan_monthly_active: {
    ja: "契約中です（解約するまで毎月継続します）。各月の100円（税込）は月末に締めて、翌月2日に請求します。",
    en: "Your plan is active and renews monthly until you cancel. Each month's ¥100 (tax included) is closed at month end and charged on the 2nd of the next month.",
    "zh-TW": "合約進行中（在取消前每月自動延續）。每月的 100 日圓（含稅）於月底結算，次月 2 日收費。"
  },

  store_managed_plan_heading: {
    ja: "運営管理（月額500円・税込）",
    en: "Managed plan (¥500/month, tax included)",
    "zh-TW": "營運管理（每月 500 日圓・含稅）"
  },

  store_managed_plan_intro: {
    ja: "お店のページの情報の更新を、運営が代わりに行います。写真や文章などの素材は、公式LINEで送ってください。",
    en: "Our team updates your shop page for you. Send photos and text materials via the official LINE account.",
    "zh-TW": "店家頁面的資訊更新由營運團隊代為處理。照片和文字等素材，請透過官方 LINE 傳送。"
  },

  store_managed_plan_active_note: {
    ja: "運営管理の契約中です。情報の更新は、公式LINEで素材を送ってください。",
    en: "Your managed plan is active. Send materials via the official LINE account to update your page.",
    "zh-TW": "營運管理合約進行中。如需更新資訊，請透過官方 LINE 傳送素材。"
  },

  store_managed_plan_terms_fee: {
    ja: "月額500円（税込）です。店舗カードの月額料金100円を含みます。",
    en: "¥500/month (tax included). This includes the ¥100 store card monthly fee.",
    "zh-TW": "每月 500 日圓（含稅）。包含店家卡每月費用 100 日圓。"
  },

  store_managed_plan_terms_scope: {
    ja: "運営が代行するのは、お店のページの情報の更新（月1回まで）です。今だけ投稿は代行の対象外で、お店ご自身で行います。",
    en: "We update your shop page information up to once a month. 'Now only' posts are not included; please post those yourself.",
    "zh-TW": "營運團隊代為處理的是店家頁面的資訊更新（每月最多 1 次）。今日限定貼文不在代辦範圍內，請店家自行發布。"
  },

  store_managed_plan_terms_approval: {
    ja: "更新の内容は、公開する前に公式LINEでお送りします。承認の返事をいただいてから公開し、返事がない場合は公開しません。",
    en: "We send the updated content via LINE before publishing, and publish only after your approval. If we receive no reply, we do not publish.",
    "zh-TW": "更新內容在公開前會透過官方 LINE 傳送給您。收到您的同意回覆後才會公開；若沒有回覆，則不會公開。"
  },

  store_managed_plan_terms_change: {
    ja: "月1回を超える更新の依頼は、変更依頼として1回1,000円（税込）です。料金は作業が完了した時点で確定し、完了しなければ請求しません。",
    en: "Extra updates are change requests at ¥1,000 each (tax included). The fee is fixed when the work is completed; if the work is not completed, you are not charged.",
    "zh-TW": "超過每月 1 次的更新請求，屬於變更請求，每次 1,000 日圓（含稅）。費用在作業完成時確定；若未完成，則不會收費。"
  },

  store_managed_plan_terms_billing: {
    ja: "月額料金は月末に締めて、翌月2日に登録されたクレジットカードへ請求します。100円プランから切り替えた月は、500円だけを請求します。",
    en: "The monthly fee is closed at month end and charged to your registered card on the 2nd of the next month. In the month you switch from the ¥100 plan, only ¥500 is charged.",
    "zh-TW": "每月費用於月底結算，次月 2 日向您註冊的信用卡收費。從 100 日圓方案切換的當月，只收取 500 日圓。"
  },

  store_managed_plan_terms_cancel: {
    ja: "解約はこの画面からいつでも申し込めます。解約の効力はその月の末日に生じ、日割りはありません。解約した後、店舗カードの月額契約に移行しない場合は、お店のページは非公開になります（保存した内容は消えません）。",
    en: "You can cancel anytime from this page. Cancellation takes effect at the end of that month, with no proration. If you do not switch to the store card monthly plan after canceling, your shop page will be unpublished (your saved content is kept).",
    "zh-TW": "隨時可從這個畫面申請取消。取消於當月最後一天生效，不按日計算。取消後，若未轉移到店家卡每月合約，店家頁面將變為不公開（已儲存的內容不會消失）。"
  },

  store_managed_plan_consent_label: {
    ja: "上の料金と条件を確認し、運営管理（月額500円・税込）に同意します。",
    en: "I have checked the fee and terms above and agree to the managed plan (¥500/month, tax included).",
    "zh-TW": "我已確認上述價格與條件，並同意營運管理（每月 500 日圓・含稅）。"
  },

  store_managed_plan_subscribe_button: {
    ja: "運営管理を申し込む",
    en: "Subscribe to the managed plan",
    "zh-TW": "申請營運管理"
  },

  store_managed_plan_upgrade_button: {
    ja: "運営管理に切り替える",
    en: "Switch to the managed plan",
    "zh-TW": "切換至營運管理"
  },

  store_managed_plan_subscribed: {
    ja: "運営管理の申し込みを受け付けました。",
    en: "Your managed plan subscription is complete.",
    "zh-TW": "已收到營運管理的申請。"
  },

  store_managed_plan_upgraded: {
    ja: "運営管理に切り替えました。",
    en: "Switched to the managed plan.",
    "zh-TW": "已切換至營運管理。"
  },

  store_managed_plan_monthly_active: {
    ja: "契約中です（運営管理・解約するまで毎月継続します）。各月の500円（税込）は月末に締めて、翌月2日に請求します。",
    en: "Your managed plan is active and renews monthly until you cancel. Each month's ¥500 (tax included) is closed at month end and charged on the 2nd of the next month.",
    "zh-TW": "合約進行中（營運管理・在取消前每月自動延續）。每月的 500 日圓（含稅）於月底結算，次月 2 日收費。"
  },

  store_managed_plan_monthly_canceling: {
    ja: "解約手続き済みです（運営管理）。{date}（今月末）まで運営管理が続き、今月分の500円は請求されます。",
    en: "Cancellation requested (managed plan). The managed service continues until {date} (end of this month); this month's ¥500 is still charged.",
    "zh-TW": "已辦理取消手續（營運管理）。營運管理將持續至 {date}（本月月底），本月的 500 日圓仍會收費。"
  },

  store_custom_plan_monthly_canceling: {
    ja: "解約手続き済みです。{date}（今月末）まで利用でき、翌月からは料金が発生しません。今月分の100円は請求されます。",
    en: "Cancellation requested. You can use the plan until {date} (end of this month); no charges from next month. This month's ¥100 is still charged.",
    "zh-TW": "已辦理取消手續。可使用至 {date}（本月月底），次月起不再產生費用。本月的 100 日圓仍會收費。"
  },

  store_custom_plan_monthly_trial_note: {
    ja: "（試験用の契約のため、実際には請求されません）",
    en: "(This is a trial contract; you will not actually be charged.)",
    "zh-TW": "（因為是測試用合約，實際上不會收費）"
  },

  store_custom_plan_past_due: {
    ja: "お支払いが確認できていない料金があります。お支払いが完了しないまま一定期間が過ぎると、店舗カードの表示を停止します（データは残ります）。",
    en: "There is an unpaid charge. If it remains unpaid for a certain period, your store card will stop being shown (your data is kept).",
    "zh-TW": "有尚未確認付款的費用。若經過一段時間仍未完成付款，將停止顯示店家卡（資料會保留）。"
  },

  store_custom_plan_suspended: {
    ja: "未払いのため、店舗カードの表示を停止しています（データは残っています）。お支払いが完了すると再開できます。",
    en: "Your store card is not shown because of an unpaid charge (your data is kept). It can resume once the payment is completed.",
    "zh-TW": "因未付款，目前已停止顯示店家卡（資料仍保留）。付款完成後即可恢復。"
  },

  store_custom_plan_err_unpaid: {
    ja: "お支払いが確認できていない料金があるため、この操作はできません。",
    en: "This action is not available because there is an unpaid charge.",
    "zh-TW": "因為有尚未確認付款的費用，無法執行此操作。"
  },

  // STEP 44-C④｜月額100円カスタマイズのご請求・未払い・本人認証(店舗アカウント画面)。
  store_plan_pay_heading: {
    ja: "店舗カード（月額100円）のご請求",
    en: "Store card (¥100/month) charges",
    "zh-TW": "店家卡（每月 100 日圓）的收費"
  },

  store_plan_pay_intro: {
    ja: "各月の100円（税込）は月末に締めて、翌月2日に登録のカードへ請求します。",
    en: "Each month's ¥100 (tax included) is closed at month end and charged to your registered card on the 2nd of the next month.",
    "zh-TW": "每月的 100 日圓（含稅）於月底結算，次月 2 日向您註冊的卡片收費。"
  },

  store_plan_pay_unpaid_total: {
    ja: "未払い：{amount}円",
    en: "Unpaid: ¥{amount}",
    "zh-TW": "未付款：{amount} 日圓"
  },

  store_plan_pay_line: {
    ja: "{month}　{store}　{amount}円（税込）",
    en: "{month}  {store}  ¥{amount} (tax incl.)",
    "zh-TW": "{month}　{store}　{amount} 日圓（含稅）"
  },

  store_plan_pay_test_badge: {
    ja: "（試験用の請求）",
    en: "(test charge)",
    "zh-TW": "（測試用收費）"
  },

  store_plan_pay_status_closed: {
    ja: "請求予定（{date}）",
    en: "Scheduled ({date})",
    "zh-TW": "預定收費（{date}）"
  },

  store_plan_pay_status_charging: {
    ja: "請求の処理中です。",
    en: "The charge is being processed.",
    "zh-TW": "正在處理收費。"
  },

  store_plan_pay_status_processing: {
    ja: "決済の処理中です。",
    en: "The payment is processing.",
    "zh-TW": "正在處理付款。"
  },

  store_plan_pay_status_requires_action: {
    ja: "本人認証が必要です。下のボタンから認証して支払いを完了してください。",
    en: "Authentication is required. Use the button below to authenticate and complete the payment.",
    "zh-TW": "需要身分驗證。請使用下方按鈕完成驗證與付款。"
  },

  store_plan_pay_status_payment_failed: {
    ja: "お支払いができませんでした。",
    en: "The payment could not be completed.",
    "zh-TW": "無法完成付款。"
  },

  store_plan_pay_status_review: {
    ja: "マチナウ運営が確認しています。",
    en: "Machinau is reviewing this charge.",
    "zh-TW": "Machinau 營運團隊正在確認中。"
  },

  store_plan_pay_status_paid: {
    ja: "お支払い済み（{date}）",
    en: "Paid ({date})",
    "zh-TW": "已付款（{date}）"
  },

  store_plan_pay_next_retry: {
    ja: "次の自動の再請求：{date}",
    en: "Next automatic retry: {date}",
    "zh-TW": "下一次自動重新收費：{date}"
  },

  store_plan_pay_suspend_at: {
    ja: "{date}までにお支払いが確認できない場合、有料の内容の表示を停止します（データは残ります）。",
    en: "If payment is not confirmed by {date}, the paid content will stop being shown (your data is kept).",
    "zh-TW": "若在 {date} 之前仍無法確認付款，將停止顯示付費內容（資料會保留）。"
  },
  store_plan_pay_suspend_paused: {
    ja: "現在、運営の都合でお支払いの受付を一時停止しています。この間、店舗カードの公開は止まりません。受付の再開後、停止までの期限は止めていた日数だけ延びます。",
    en: "Payments are temporarily paused on our side. Your store card stays public during this time. When payments resume, the deadline is extended by the number of days they were paused.",
    "zh-TW": "目前因營運方面的因素，暫時停止受理付款。在此期間，店家卡的公開不會停止。付款受理恢復後，停止顯示的期限將延長暫停的天數。"
  },

  store_plan_pay_authenticate: {
    ja: "本人認証をして支払う",
    en: "Authenticate and pay",
    "zh-TW": "進行身分驗證並付款"
  },

  store_plan_pay_pay_now: {
    ja: "今すぐ支払う",
    en: "Pay now",
    "zh-TW": "立即付款"
  },

  store_plan_pay_processing: {
    ja: "処理しています…",
    en: "Processing…",
    "zh-TW": "處理中…"
  },

  store_plan_pay_done: {
    ja: "お支払いが完了しました。",
    en: "Payment completed.",
    "zh-TW": "付款已完成。"
  },

  // STEP 54｜支払い済みの請求の領収書(store-receipt.html)への入口。
  store_plan_pay_receipt_link: {
    ja: "領収書を見る",
    en: "View receipt",
    "zh-TW": "查看收據"
  },

  // STEP 54-B｜返金の記録(運営が Stripe に照会して記録したもの)。
  store_plan_pay_refund_full: {
    ja: "全額返金済み（{amount}円）",
    en: "Fully refunded (¥{amount})",
    "zh-TW": "已全額退款（{amount} 日圓）"
  },

  store_plan_pay_refund_partial: {
    ja: "一部返金済み（{amount}円）",
    en: "Partially refunded (¥{amount})",
    "zh-TW": "已部分退款（{amount} 日圓）"
  },

  store_plan_pay_refund_pending: {
    ja: "返金の処理中です",
    en: "Refund in progress",
    "zh-TW": "正在處理退款"
  },

  store_plan_pay_auth_incomplete: {
    ja: "本人認証が完了していません。もう一度お試しください。",
    en: "Authentication was not completed. Please try again.",
    "zh-TW": "身分驗證尚未完成。請再試一次。"
  },

  store_plan_pay_failed: {
    ja: "お支払いができませんでした。カードを確認してください。",
    en: "The payment could not be completed. Please check your card.",
    "zh-TW": "無法完成付款。請確認您的卡片。"
  },

  store_plan_pay_error: {
    ja: "お支払いの操作ができませんでした。時間をおいてもう一度お試しください。",
    en: "The payment action could not be completed. Please try again later.",
    "zh-TW": "無法完成付款操作。請稍後再試一次。"
  },

  store_plan_pay_unavailable: {
    ja: "現在、お支払いの操作は利用できません。",
    en: "Payment actions are not available right now.",
    "zh-TW": "目前無法使用付款操作。"
  },

  store_custom_heading: {
    ja: "店舗カード（月額100円・税込）",
    en: "Store card (¥100/month, tax included)",
    "zh-TW": "店家卡（每月 100 日圓・含稅）"
  },

  store_custom_intro: {
    ja: "店主が作成・引き継ぎ・管理する店舗カードは、1店舗につき月額100円（税込）です。基本情報（紹介文・写真・営業時間など）と、メニュー・商品紹介、追加リンク、お店のこだわり・ストーリーをすべて含みます。契約が有効な間だけ、店舗カードを旅行者に公開できます。",
    en: "A store card that you create, take over or manage costs ¥100 per shop per month (tax included). It includes the basic information (description, photos, hours, etc.) and your menu and products, extra links and story. Your store card can be shown to travelers only while the contract is active.",
    "zh-TW": "由店主建立・接手・管理的店家卡，每家店每月 100 日圓（含稅）。包含基本資訊（介紹文・照片・營業時間等），以及菜單・商品介紹、追加連結、店家的堅持・故事。僅在合約有效期間，店家卡才能公開給旅客。"
  },

  store_custom_plan_active: {
    ja: "契約中です。{date}まで、店舗カードを旅行者に公開できます。",
    en: "Your contract is active. Your store card can be shown to travelers until {date}.",
    "zh-TW": "合約進行中。至 {date} 為止，店家卡可公開給旅客。"
  },

  store_custom_plan_none: {
    ja: "このお店は店舗カードの月額契約をしていません（非公開）。契約が無いため、店舗情報の保存・編集はできません。申し込みの受付は準備中です。",
    en: "This shop has no store card contract (not public). Without a contract, shop details cannot be saved or edited. Sign-up is being prepared.",
    "zh-TW": "這家店沒有店家卡每月合約（不公開）。因為沒有合約，無法儲存・編輯店家資訊。申請受理正在準備中。"
  },

  store_custom_plan_kept: {
    ja: "保存済みの内容は削除されていません。契約中だけ旅行者に表示されます。",
    en: "Your saved content has not been deleted. It is shown to travelers only while the plan is active.",
    "zh-TW": "已儲存的內容不會被刪除。僅在合約期間顯示給旅客。"
  },

  store_custom_not_editable: {
    ja: "この店舗は現在編集できません。",
    en: "This shop cannot be edited right now.",
    "zh-TW": "這家店目前無法編輯。"
  },

  store_custom_story_label: {
    ja: "お店のこだわり・ストーリー",
    en: "Our story",
    "zh-TW": "店家的堅持・故事"
  },

  store_custom_story_placeholder: {
    ja: "1980年に久茂地で創業しました。初代の味を守りながら、二代目の今は地元の食材を使った一品を増やしています。",
    en: "We opened in Kumoji in 1980. While keeping the founder's flavors, the second generation now serves more dishes made with local ingredients.",
    "zh-TW": "1980 年在久茂地創業。在守護第一代味道的同時，第二代的現在增加了使用在地食材的菜色。"
  },
  store_custom_story_hint: {
    ja: "お店の歴史・こだわり・大切にしていることなどを紹介できます（{max}字まで）。紹介文が『今のお店の案内』、こちらは『お店の歩みや、大切にしていること』です。",
    en: "Share your shop's history, what you care about, and what makes you special (up to {max} characters). Your description is the guide to your shop today; this is for your shop's story and what you value.",
    "zh-TW": "可以介紹店家的歷史・堅持・重視的事情等（最多 {max} 個字）。介紹文是「現在店家的指南」，這裡是「店家的歷程與重視的事情」。"
  },

  store_custom_menu_label: {
    ja: "メニュー・商品紹介",
    en: "Menu and products",
    "zh-TW": "菜單・商品介紹"
  },

  store_custom_menu_allergens_label: {
    ja: "含まれる原材料（アレルギー）",
    en: "Contains (allergens)",
    "zh-TW": "含有原料（過敏原）"
  },

  store_custom_menu_allergens_hint: {
    ja: "含まれるものだけを選んでください。分かる範囲で正確に。分からないものは選ばなくて大丈夫です。選ばなかったものが「含まれていない」という意味にはなりません。",
    en: "Select only what the item contains, as accurately as you can. It is fine to leave items unselected when unsure; unselected items are not shown as 'not contained'.",
    "zh-TW": "只需勾選有含的原料，請盡量正確。不確定可以不勾選；未勾選不代表「不含」。"
  },

  store_custom_err_allergens: {
    ja: "{item}のアレルギーの選択が正しくありません。",
    en: "The allergen selection for {item} is invalid.",
    "zh-TW": "{item}的過敏原選擇不正確。"
  },

  store_custom_menu_hint: {
    ja: "最大{max}件。商品名は必須、価格と説明は任意です（空欄の項目は表示しません）。写真は1商品に1枚、お店全体で{photos}枚までです（写真の無い商品も登録できます）。「↑前へ」「↓後へ」で商品の並び順を変えられます。公開ページではこの順番で表示され、一番上の商品は一覧のカードにも出ます。",
    en: "Up to {max} items. A name is required; price and description are optional (empty fields are not shown). One photo per item, up to {photos} photos for the whole shop (items without a photo are fine). Use the Earlier and Later buttons to change the order: your page shows items in this order, and the first item also appears on listing cards.",
    "zh-TW": "最多 {max} 件。商品名稱必填，價格與說明選填（空白的項目不會顯示）。照片每件商品 1 張，全店最多 {photos} 張（沒有照片的商品也可以註冊）。使用「↑ 往前」「↓ 往後」可以變更商品的排列順序。公開頁面會依此順序顯示，最上方的商品也會出現在列表的卡片上。"
  },

  store_custom_menu_photo_count: {
    ja: "商品写真 {n} / {max}枚",
    en: "Item photos {n} / {max}",
    "zh-TW": "商品照片 {n} / {max} 張"
  },

  store_custom_err_photo_max: {
    ja: "商品写真はお店全体で{max}枚までです。ほかの商品の写真を外してから追加してください。",
    en: "You can add up to {max} item photos for the whole shop. Remove a photo from another item first.",
    "zh-TW": "全店的商品照片最多 {max} 張。請先移除其他商品的照片再新增。"
  },

  store_custom_menu_add: {
    ja: "＋ 商品を追加",
    en: "+ Add an item",
    "zh-TW": "＋ 新增商品"
  },

  store_custom_menu_item_title: {
    ja: "商品 {n}",
    en: "Item {n}",
    "zh-TW": "商品 {n}"
  },

  store_custom_menu_name: {
    ja: "商品名",
    en: "Name",
    "zh-TW": "商品名稱"
  },

  store_custom_menu_price: {
    ja: "価格（任意）",
    en: "Price (optional)",
    "zh-TW": "價格（選填）"
  },

  store_custom_menu_price_placeholder: {
    ja: "例：¥650",
    en: "e.g. ¥650",
    "zh-TW": "例：¥650"
  },

  store_custom_menu_description: {
    ja: "説明（任意）",
    en: "Description (optional)",
    "zh-TW": "說明（選填）"
  },

  store_custom_menu_photo_add: {
    ja: "写真を選ぶ",
    en: "Choose a photo",
    "zh-TW": "選擇照片"
  },

  store_custom_menu_photo_change: {
    ja: "写真の変更",
    en: "Change photo",
    "zh-TW": "更換照片"
  },

  store_custom_menu_photo_remove: {
    ja: "写真を消す",
    en: "Delete photo",
    "zh-TW": "刪除照片"
  },

  store_custom_menu_up: {
    ja: "↑ 前へ",
    en: "↑ Earlier",
    "zh-TW": "↑ 往前"
  },

  store_custom_menu_down: {
    ja: "↓ 後へ",
    en: "↓ Later",
    "zh-TW": "↓ 往後"
  },

  store_custom_menu_remove: {
    ja: "この商品を削除",
    en: "Delete this item",
    "zh-TW": "刪除這個商品"
  },

  store_custom_links_label: {
    ja: "追加リンク（SNS・予約先など）",
    en: "Extra links (social media, booking, etc.)",
    "zh-TW": "追加連結（社群媒體・預約管道等）"
  },

  store_custom_links_hint: {
    ja: "最大{max}件。https:// で始まるURLだけ登録できます。表示名は任意です（空欄なら種類の名前を表示）。",
    en: "Up to {max} links. Only URLs starting with https:// can be added. The label is optional (the link type is shown if empty).",
    "zh-TW": "最多 {max} 件。只能註冊以 https:// 開頭的網址。顯示名稱選填（空白時顯示類型名稱）。"
  },

  store_custom_links_add: {
    ja: "＋ リンクを追加",
    en: "+ Add a link",
    "zh-TW": "＋ 新增連結"
  },

  store_custom_link_label_placeholder: {
    ja: "表示名（任意）",
    en: "Label (optional)",
    "zh-TW": "顯示名稱（選填）"
  },

  store_custom_link_remove: {
    ja: "削除",
    en: "Remove",
    "zh-TW": "刪除"
  },

  store_custom_link_type_instagram: {
    ja: "Instagram",
    en: "Instagram",
    "zh-TW": "Instagram"
  },

  store_custom_link_type_website: {
    ja: "公式サイト",
    en: "Official website",
    "zh-TW": "官方網站"
  },

  store_custom_link_type_reservation: {
    ja: "予約ページ",
    en: "Booking",
    "zh-TW": "預約頁面"
  },

  store_custom_link_type_x: {
    ja: "X",
    en: "X",
    "zh-TW": "X"
  },

  store_custom_link_type_facebook: {
    ja: "Facebook",
    en: "Facebook",
    "zh-TW": "Facebook"
  },

  store_custom_link_type_tiktok: {
    ja: "TikTok",
    en: "TikTok",
    "zh-TW": "TikTok"
  },

  store_custom_link_type_youtube: {
    ja: "YouTube",
    en: "YouTube",
    "zh-TW": "YouTube"
  },

  store_custom_link_type_line: {
    ja: "LINE",
    en: "LINE",
    "zh-TW": "LINE"
  },

  store_custom_link_type_other: {
    ja: "その他のリンク",
    en: "Other link",
    "zh-TW": "其他連結"
  },

  store_custom_save_button: {
    ja: "下書きを保存する",
    en: "Save menu, links and story",
    "zh-TW": "儲存草稿"
  },

  store_custom_saving_button: {
    ja: "保存しています…",
    en: "Saving…",
    "zh-TW": "儲存中…"
  },

  store_custom_saved: {
    ja: "保存しました。",
    en: "Saved.",
    "zh-TW": "已儲存。"
  },

  store_custom_err_plan: {
    ja: "店舗カードの月額契約が無いため、この欄は保存できません。",
    en: "You cannot save this section because this shop has no store card contract.",
    "zh-TW": "因為沒有店家卡每月合約，無法儲存這個欄位。"
  },

  store_custom_err_menu: {
    ja: "メニュー・商品の内容を確認してください。",
    en: "Please check your menu items.",
    "zh-TW": "請確認菜單・商品的內容。"
  },

  store_custom_err_name: {
    ja: "{item}：商品名を入力してください（{max}字まで・改行なし）。",
    en: "{item}: enter a name (up to {max} characters, single line).",
    "zh-TW": "{item}：請輸入商品名稱（最多 {max} 個字・不可換行）。"
  },

  store_custom_err_description: {
    ja: "{item}：説明が長すぎます（{max}字まで）。",
    en: "{item}: the description is too long (up to {max} characters).",
    "zh-TW": "{item}：說明太長（最多 {max} 個字）。"
  },

  store_custom_err_price: {
    ja: "{item}：価格が長すぎます（{max}字まで・改行なし）。",
    en: "{item}: the price is too long (up to {max} characters, single line).",
    "zh-TW": "{item}：價格太長（最多 {max} 個字・不可換行）。"
  },

  store_custom_err_photo: {
    ja: "{item}：写真をもう一度選んでください。",
    en: "{item}: please choose the photo again.",
    "zh-TW": "{item}：請重新選擇照片。"
  },

  store_custom_err_link: {
    ja: "リンク{n}：https:// で始まる正しいURLを入力してください（表示名は{max}字まで）。",
    en: "Link {n}: enter a valid URL starting with https:// (label up to {max} characters).",
    "zh-TW": "連結 {n}：請輸入以 https:// 開頭的正確網址（顯示名稱最多 {max} 個字）。"
  },

  store_custom_err_story: {
    ja: "ストーリーが長すぎるか、使えない文字が含まれています（{max}字まで）。",
    en: "The story is too long or contains characters that cannot be used (up to {max} characters).",
    "zh-TW": "故事太長，或包含無法使用的文字（最多 {max} 個字）。"
  },

  store_custom_err_content: {
    ja: "掲載できない可能性がある表現が含まれているため、保存できませんでした。内容を見直してください。",
    en: "Your text could not be saved because it may contain content we cannot publish. Please review it.",
    "zh-TW": "因為包含可能無法刊登的表現，無法儲存。請檢查內容。"
  },

  store_custom_err_photo_content: {
    ja: "掲載できない可能性がある写真が含まれているため、保存できませんでした。写真を見直してください。",
    en: "A photo could not be saved because it may contain content we cannot publish. Please review your photos.",
    "zh-TW": "因為包含可能無法刊登的照片，無法儲存。請檢查照片。"
  },

  store_custom_load_error: {
    ja: "店舗カードの契約の情報を読み込めませんでした。時間をおいて再読み込みしてください。",
    en: "Could not load the store card contract information. Please reload later.",
    "zh-TW": "無法載入店家卡合約資訊。請稍後重新載入。"
  },

  shop_custom_story_heading: {
    ja: "お店のこだわり・ストーリー",
    en: "Our story",
    "zh-TW": "店家的堅持・故事"
  },

  shop_custom_menu_heading: {
    ja: "メニュー・商品",
    en: "Menu and products",
    "zh-TW": "菜單・商品"
  },

  shop_custom_allergens_heading: {
    ja: "含まれる原材料（アレルギー）",
    en: "Contains (allergens)",
    "zh-TW": "含有原料（過敏原）"
  },

  shop_custom_allergy_note: {
    ja: "原材料の一部を表示しています。詳しくはお店にご確認ください。",
    en: "Only some ingredients are listed. Please ask the shop for details.",
    "zh-TW": "僅標示部分原料，詳情請向店家確認。"
  },

  shop_allergen_shrimp: {
    ja: "えび",
    en: "Shrimp",
    "zh-TW": "蝦"
  },

  shop_allergen_crab: {
    ja: "かに",
    en: "Crab",
    "zh-TW": "蟹"
  },

  shop_allergen_walnut: {
    ja: "くるみ",
    en: "Walnut",
    "zh-TW": "核桃"
  },

  shop_allergen_wheat: {
    ja: "小麦",
    en: "Wheat",
    "zh-TW": "小麥"
  },

  shop_allergen_buckwheat: {
    ja: "そば",
    en: "Buckwheat",
    "zh-TW": "蕎麥"
  },

  shop_allergen_egg: {
    ja: "卵",
    en: "Egg",
    "zh-TW": "雞蛋"
  },

  shop_allergen_milk: {
    ja: "乳",
    en: "Milk",
    "zh-TW": "牛奶"
  },

  shop_allergen_peanut: {
    ja: "落花生",
    en: "Peanut",
    "zh-TW": "花生"
  },

  shop_custom_links_heading: {
    ja: "リンク",
    en: "Links",
    "zh-TW": "連結"
  },

  store_profile_photos_heading: {
    ja: "写真",
    en: "Photos",
    "zh-TW": "照片"
  },

  store_profile_photos_hint: {
    ja: "お店の写真は最大10枚まで。1枚目はメイン写真として、お店のページの先頭と、お店が一覧に並ぶときのカードに出ます。見え方は、このページの下のほうにあるプレビューで確認できます。追加した写真は、下の『下書きを保存する』を押したときに登録されます。",
    en: "Up to 10 photos of your shop. The first photo is the main photo, shown at the top of your shop page and on the card when your shop appears in listings. You can check how they look in the preview near the bottom of this page. Added photos are registered when you press Save draft below.",
    "zh-TW": "店家照片最多 10 張。第 1 張是主要照片，會顯示在店家頁面的最上方，以及店家出現在列表時的卡片上。顯示方式可以在這個頁面下方的預覽中確認。新增的照片會在按下下方的「儲存草稿」時註冊。"
  },

  store_profile_photos_count: {
    ja: "{n} / {max}枚",
    en: "{n} / {max} photos",
    "zh-TW": "{n} / {max} 張"
  },

  store_profile_photos_add: {
    ja: "＋ 写真を追加",
    en: "+ Add photos",
    "zh-TW": "＋ 新增照片"
  },

  store_profile_photos_main_badge: {
    ja: "メイン",
    en: "Main",
    "zh-TW": "主要"
  },

  store_profile_photos_make_main: {
    ja: "メインにする",
    en: "Make main",
    "zh-TW": "設為主要"
  },

  store_profile_photos_move_left: {
    ja: "◀ 前へ",
    en: "◀ Earlier",
    "zh-TW": "◀ 往前"
  },

  store_profile_photos_move_right: {
    ja: "後へ ▶",
    en: "Later ▶",
    "zh-TW": "往後 ▶"
  },

  store_profile_photos_remove: {
    ja: "削除",
    en: "Remove",
    "zh-TW": "刪除"
  },

  store_profile_photos_preparing: {
    ja: "準備中…",
    en: "Preparing…",
    "zh-TW": "準備中…"
  },

  store_profile_photos_progress_prepare: {
    ja: "写真を準備しています…",
    en: "Preparing photos…",
    "zh-TW": "正在準備照片…"
  },

  store_profile_photos_progress_upload: {
    ja: "写真をアップロードしています（{done}/{total}枚）…",
    en: "Uploading photos ({done}/{total})…",
    "zh-TW": "正在上傳照片（{done}/{total} 張）…"
  },

  store_profile_photos_progress_saving: {
    ja: "写真の安全確認と保存をしています…",
    en: "Checking the photos and saving…",
    "zh-TW": "正在進行照片的安全確認與儲存…"
  },

  store_profile_progress_saving: {
    ja: "保存しています…",
    en: "Saving…",
    "zh-TW": "儲存中…"
  },

  store_profile_saving_button: {
    ja: "保存中…（そのままお待ちください）",
    en: "Saving… (please wait)",
    "zh-TW": "儲存中…（請稍候）"
  },

  store_profile_photos_err_type: {
    ja: "写真はJPEG・PNG・WebPで、1枚10MBまでのものを選んでください。",
    en: "Please choose JPEG, PNG or WebP photos up to 10 MB each.",
    "zh-TW": "請選擇 JPEG、PNG 或 WebP 格式的照片，每張不超過 10MB。"
  },

  store_profile_photos_err_max: {
    ja: "写真は最大10枚までです。",
    en: "You can add up to 10 photos.",
    "zh-TW": "照片最多 10 張。"
  },

  store_profile_photos_err_prepare: {
    ja: "写真を読み込めませんでした。別の写真をお試しください。",
    en: "This photo could not be read. Please try another photo.",
    "zh-TW": "無法讀取這張照片。請換一張照片試試。"
  },

  store_profile_photos_err_upload: {
    ja: "写真をアップロードできませんでした。通信状況を確認して、もう一度保存してください。",
    en: "The photos could not be uploaded. Please check your connection and save again.",
    "zh-TW": "無法上傳照片。請確認連線狀況後，再儲存一次。"
  },

  store_profile_photos_err_content: {
    ja: "掲載できない可能性がある写真が含まれていたため、保存しませんでした。新しく追加した写真を見直してから、もう一度保存してください。",
    en: "Some photos may not be suitable for publishing, so nothing was saved. Please review the newly added photos and save again.",
    "zh-TW": "其中可能包含無法刊登的照片，因此未儲存。請檢視新加入的照片後，再儲存一次。"
  },

  store_profile_publish_heading: {
    ja: "公開",
    en: "Publish",
    "zh-TW": "公開"
  },

  store_profile_publish_state_draft: {
    ja: "非公開（下書き）",
    en: "Not public (draft)",
    "zh-TW": "未公開（草稿）"
  },

  store_profile_publish_state_published: {
    ja: "公開中",
    en: "Public",
    "zh-TW": "公開中"
  },

  store_profile_publish_state_blocked: {
    ja: "公開条件を満たしていないため表示されていません",
    en: "Not shown because the publishing conditions are not met",
    "zh-TW": "未符合公開條件，因此未顯示"
  },

  store_profile_publish_note_draft: {
    ja: "公開するまで、この情報はお客さんに表示されません。",
    en: "Travelers won't see this information until you publish it.",
    "zh-TW": "在公開之前，這些資訊不會顯示給顧客看。"
  },

  store_profile_publish_note_published: {
    ja: "公開中です。お店の専用ページと、トップページのお店一覧に表示されています。",
    en: "Your shop is public. It appears on its own page and in the shop listings on the top page.",
    "zh-TW": "目前公開中。會顯示在店家的專屬頁面，以及首頁的店家列表中。"
  },

  store_profile_publish_note_blocked: {
    ja: "下の条件をすべて満たすと、操作しなくても表示に戻ります。",
    en: "Once all the conditions below are met, it will be shown again automatically.",
    "zh-TW": "只要符合以下所有條件，就會自動恢復顯示，無需任何操作。"
  },

  store_profile_publish_checklist_intro: {
    ja: "✓はできていること、×はあと必要なことです。×の下に、直し方が書いてあります。",
    en: "✓ means done, × means still needed. How to fix each × is written under it.",
    "zh-TW": "✓ 表示已完成，× 表示還需要完成的事項。每個 × 的下方都寫有修正方法。"
  },
  store_profile_publish_checklist_heading: {
    ja: "公開の条件（保存した内容で判定します）",
    en: "Conditions for publishing (checked against the saved content)",
    "zh-TW": "公開條件（依已儲存的內容判定）"
  },

  store_profile_publish_cond_photo: {
    ja: "写真が1枚以上保存されている",
    en: "At least one photo is saved",
    "zh-TW": "已儲存 1 張以上的照片"
  },

  store_profile_publish_cond_description: {
    ja: "紹介文が保存されている",
    en: "A description is saved",
    "zh-TW": "已儲存介紹文"
  },

  store_profile_publish_cond_moderation: {
    ja: "自動チェック（不適切な内容が含まれていないかの確認）が済んでいる",
    en: "The automatic check (for inappropriate content) is done",
    "zh-TW": "已完成自動檢查（確認是否含有不適當內容）"
  },

  store_profile_publish_cond_owner: {
    ja: "あなたがこのお店の管理者として登録されている",
    en: "You are registered as this shop's manager",
    "zh-TW": "您已註冊為這家店的管理者"
  },

  store_profile_publish_cond_store_active: {
    ja: "お店の登録が有効になっている",
    en: "The shop's registration is active",
    "zh-TW": "店家的註冊已生效"
  },

  store_profile_publish_cond_location: {
    ja: "お店の場所が地図で登録されている",
    en: "The shop's location is set on the map",
    "zh-TW": "店家的位置已在地圖上註冊"
  },

  store_profile_publish_cond_country: {
    ja: "公開できる地域にある（現在は日本国内の店舗・施設のみ）",
    en: "In a supported area (currently businesses in Japan only)",
    "zh-TW": "位於可公開的地區（目前僅限日本國內的店家・設施）"
  },

  store_profile_publish_cond_duplicates: {
    ja: "同じお店の掲載が重なっていない",
    en: "There is no duplicate listing for this shop",
    "zh-TW": "沒有重複刊登同一家店"
  },

  store_profile_publish_cond_plan: {
    ja: "店舗カードの月額契約（100円・税込）が有効",
    en: "The store card contract (¥100/month, tax included) is active",
    "zh-TW": "店家卡片的每月合約（100 日圓・含稅）有效"
  },

  store_profile_publish_fix_photo: {
    ja: "『写真』に1枚以上追加して、『下書きを保存する』を押してください。",
    en: "Add at least one photo under Photos, then press Save draft.",
    "zh-TW": "請在「照片」加入 1 張以上的照片，然後按下「儲存草稿」。"
  },

  store_profile_publish_fix_description: {
    ja: "『紹介文』を入力して、『下書きを保存する』を押してください。",
    en: "Write a description, then press Save draft.",
    "zh-TW": "請輸入「介紹文」，然後按下「儲存草稿」。"
  },

  store_profile_publish_fix_moderation: {
    ja: "『下書きを保存する』をもう一度押してください。",
    en: "Press Save draft once more.",
    "zh-TW": "請再按一次「儲存草稿」。"
  },

  store_profile_publish_fix_owner: {
    ja: "運営へお問い合わせください。",
    en: "Please contact the Machinau team.",
    "zh-TW": "請聯絡營運團隊。"
  },

  store_profile_publish_fix_store_active: {
    ja: "運営の確認が終わるまでお待ちください。停止中の場合は運営へお問い合わせください。",
    en: "Please wait until the Machinau team finishes its review. If the business is suspended, please contact the Machinau team.",
    "zh-TW": "請等候營運團隊確認完成。若目前處於停止狀態，請聯絡營運團隊。"
  },

  store_profile_publish_fix_location: {
    ja: "運営へお問い合わせください。",
    en: "Please contact the Machinau team.",
    "zh-TW": "請聯絡營運團隊。"
  },

  store_profile_publish_fix_country: {
    ja: "現在は日本国内の店舗・施設だけを公開できます。",
    en: "Currently only businesses in Japan can be published.",
    "zh-TW": "目前僅能公開日本國內的店家・設施。"
  },

  store_profile_publish_fix_duplicates: {
    ja: "マチナウに掲載中の同じ店舗・施設がある可能性があります。運営へお問い合わせください。",
    en: "The same business may already be listed on Machinau. Please contact the Machinau team.",
    "zh-TW": "Machinau 上可能已有刊登中的相同店家・設施。請聯絡營運團隊。"
  },

  store_profile_publish_fix_plan: {
    ja: "月額100円の申込が必要です。このページの『店舗カード（月額100円・税込）』から申し込んでください。",
    en: "You need the ¥100 monthly plan. Apply from Store card (¥100/month, tax incl.) on this page.",
    "zh-TW": "需要申請每月 100 日圓的方案。請從本頁的「店家卡片（每月 100 日圓・含稅）」申請。"
  },
  store_profile_publish_fix_photo_unsaved: {
    ja: "写真は入っていますが、まだ保存されていません。『下書きを保存する』を押してください。",
    en: "Your photo is added but not saved yet. Press Save draft.",
    "zh-TW": "照片已加入，但尚未儲存。請按下「儲存草稿」。"
  },
  store_profile_publish_fix_photo_check: {
    ja: "写真は保存されていますが、確認が通っていません。『下書きを保存する』をもう一度押してください。",
    en: "Your photo is saved but has not passed the check. Press Save draft once more.",
    "zh-TW": "照片已儲存，但尚未通過確認。請再按一次「儲存草稿」。"
  },
  store_profile_publish_fix_description_unsaved: {
    ja: "紹介文は入力されていますが、まだ保存されていません。『下書きを保存する』を押してください。",
    en: "Your description is written but not saved yet. Press Save draft.",
    "zh-TW": "介紹文已輸入，但尚未儲存。請按下「儲存草稿」。"
  },

  store_profile_publish_save_first: {
    ja: "保存していない変更があります。『下書きを保存する』を押してから、公開してください。",
    en: "You have unsaved changes. Press \"Save draft\" first, then publish.",
    "zh-TW": "有尚未儲存的變更。請先按下「儲存草稿」，然後再公開。"
  },

  store_profile_publish_button: {
    ja: "公開する",
    en: "Publish",
    "zh-TW": "公開"
  },

  store_profile_unpublish_button: {
    ja: "非公開に戻す",
    en: "Make private",
    "zh-TW": "改回未公開"
  },

  store_profile_publish_confirm: {
    ja: "保存済みの内容を旅行者に公開します。よろしいですか？",
    en: "Publish the saved content to travelers?",
    "zh-TW": "要將已儲存的內容公開給遊客看嗎？"
  },

  store_profile_unpublish_confirm: {
    ja: "旅行者への公開をやめて、非公開（下書き）に戻します。よろしいですか？",
    en: "Stop showing this to travelers and make it private (draft)?",
    "zh-TW": "要停止向遊客公開，改回未公開（草稿）嗎？"
  },

  store_profile_publishing_button: {
    ja: "確認しています…",
    en: "Checking…",
    "zh-TW": "確認中…"
  },

  store_profile_published_message: {
    ja: "公開しました。",
    en: "Published.",
    "zh-TW": "已公開。"
  },

  store_profile_unpublished_message: {
    ja: "非公開に戻しました。",
    en: "It is now private.",
    "zh-TW": "已改回未公開。"
  },

  store_profile_publish_err_conditions: {
    ja: "公開の条件を満たしていません。条件の一覧を確認してください。",
    en: "The publishing conditions are not met. Please check the list of conditions.",
    "zh-TW": "尚未符合公開條件。請確認條件列表。"
  },

  store_profile_publish_err_content: {
    ja: "店名または紹介文に、掲載できない可能性がある表現が含まれています。紹介文を見直して保存してください。店名については運営へお問い合わせください。",
    en: "The business name or description may contain content that can't be published. Please review the description and save. For the business name, please contact the Machinau team.",
    "zh-TW": "店名或介紹文中可能含有無法刊登的表述。請檢視介紹文後儲存。關於店名，請聯絡營運團隊。"
  },

  store_profile_save_button_published: {
    ja: "変更を保存する",
    en: "Save changes",
    "zh-TW": "儲存變更"
  },

  store_profile_saved_published: {
    ja: "変更を保存しました。",
    en: "Changes saved.",
    "zh-TW": "已儲存變更。"
  },

  store_claim_heading: {
    ja: "このお店を管理する（マチナウに掲載中のお店の引き継ぎ）",
    en: "Manage this business (take over a listing on Machinau)",
    "zh-TW": "管理這家店（接手 Machinau 刊登中的店家）"
  },

  store_claim_linked_notice: {
    ja: "このお店は、すでに別の店舗アカウントが管理しているため、引き継げません。ご不明な点はマチナウ運営へお問い合わせください。",
    en: "This listing is already managed by another store account, so it cannot be taken over. Please contact Machinau if you have questions.",
    "zh-TW": "這家店已由另一個店家帳號管理，因此無法接手。如有任何疑問，請聯絡 Machinau 營運團隊。"
  },

  store_claim_process_note: {
    ja: "申請すると、マチナウ運営の確認なしで、すぐに引き継ぎが完了します。掲載中の紹介文・営業時間などは、あなたの店舗情報（非公開の下書き）に引き継がれます。旅行者への表示は、店舗情報を公開するまで変わりません。引き継ぎだけでは月額100円（税込）の契約は成立せず、契約はお店を公開する時に申し込みます。",
    en: "Submitting completes the takeover right away, without a review by Machinau. The listing's description, hours, etc. are copied into your store profile (a draft that is not public). What travelers see does not change until you publish your store profile. The takeover alone does not start the ¥100/month contract (tax included); you subscribe when you publish the shop.",
    "zh-TW": "申請後，無需 Machinau 營運團隊確認，即可立即完成接手。刊登中的介紹文、營業時間等，會複製到您的店家資訊（未公開的草稿）中。在您公開店家資訊之前，遊客看到的內容不會改變。僅接手並不會成立每月 100 日圓（含稅）的合約，合約是在公開店家時申請。"
  },

  store_claim_target_label: {
    ja: "どのように引き継ぎますか",
    en: "How do you want to take it over?",
    "zh-TW": "您想如何接手？"
  },

  store_claim_target_new: {
    ja: "新しい店舗として引き継ぐ",
    en: "As a new shop",
    "zh-TW": "以新店家的身分接手"
  },

  store_claim_target_existing: {
    ja: "登録済みの自分の店舗につなぐ",
    en: "Connect it to a shop I already registered",
    "zh-TW": "連結到我已註冊的店家"
  },

  store_claim_role_label: {
    ja: "お店でのお立場",
    en: "Your role at the shop",
    "zh-TW": "您在店裡的身分"
  },

  store_claim_role_owner: {
    ja: "オーナー",
    en: "Owner",
    "zh-TW": "老闆"
  },

  store_claim_role_manager: {
    ja: "店長・責任者",
    en: "Manager",
    "zh-TW": "店長・負責人"
  },

  store_claim_url_label: {
    ja: "お店の公式サイト・公式SNS（任意）",
    en: "Official website or social media (optional)",
    "zh-TW": "店家的官方網站・官方社群帳號（選填）"
  },

  store_claim_url_hint: {
    ja: "お店の公式サイト・公式SNSがあれば入力してください（記録として残します）。",
    en: "Enter your official website or social account if you have one (kept as a record).",
    "zh-TW": "如果店家有官方網站或官方社群帳號，請輸入（會保留為紀錄）。"
  },

  store_claim_note_label: {
    ja: "ひとこと（任意・200文字まで）",
    en: "Note (optional, up to 200 characters)",
    "zh-TW": "留言（選填・最多 200 字）"
  },

  store_claim_note_hint: {
    ja: "電話番号やメールアドレスなどの連絡先は書かないでください。",
    en: "Please do not include phone numbers, email addresses or other contact details.",
    "zh-TW": "請勿填寫電話號碼、電子郵件地址等聯絡資訊。"
  },

  store_claim_submit: {
    ja: "このお店を引き継ぐ",
    en: "Take over this listing",
    "zh-TW": "接手這家店"
  },

  store_claim_code_title: {
    ja: "申請コード",
    en: "Request code",
    "zh-TW": "申請代碼"
  },

  store_claim_code_hint: {
    ja: "マチナウ運営からお店の公式連絡先に確認の連絡が届いたら、その連絡がこのコードについてのものかどうかを確かめてください。このコードは、他の人に教えないでください。",
    en: "When Machinau contacts the shop through its official contact details, please check that the message is about this code. Do not share this code with anyone else.",
    "zh-TW": "當 Machinau 營運團隊透過店家的官方聯絡方式與您聯繫時，請確認該聯繫是否與此代碼有關。請勿將此代碼告訴任何人。"
  },

  store_claim_mine_heading: {
    ja: "あなたのオーナー申請",
    en: "Your owner requests",
    "zh-TW": "您的店主申請"
  },

  store_claim_mine_empty: {
    ja: "オーナー申請はまだありません。",
    en: "No owner requests yet.",
    "zh-TW": "目前還沒有店主申請。"
  },

  store_claim_status_pending: {
    ja: "運営確認中",
    en: "Under review",
    "zh-TW": "營運團隊確認中"
  },

  store_claim_status_approved: {
    ja: "引き継ぎ完了",
    en: "Completed",
    "zh-TW": "接手完成"
  },

  store_claim_status_rejected: {
    ja: "承認されませんでした",
    en: "Not approved",
    "zh-TW": "未獲核准"
  },

  store_claim_status_withdrawn: {
    ja: "取り下げ済み",
    en: "Withdrawn",
    "zh-TW": "已撤回"
  },

  store_claim_status_note_pending: {
    ja: "マチナウ運営が、お店の公式連絡先で確認しています。",
    en: "Machinau is checking with the shop's official contact details.",
    "zh-TW": "Machinau 營運團隊正在透過店家的官方聯絡方式確認。"
  },

  store_claim_status_note_approved: {
    ja: "このお店の正式な管理者になりました。お店の情報は「あなたの店舗・施設」から管理できます。旅行者への表示はまだ変わりません。",
    en: "You are now the official manager of this shop. Manage it from \"Your shops & facilities\". What travelers see has not changed yet.",
    "zh-TW": "您已成為這家店的正式管理者。您可以從「您的店家・設施」管理店家資訊。遊客看到的內容尚未改變。"
  },

  store_claim_status_note_rejected: {
    ja: "お店の公式連絡先で確認できなかったため、承認されませんでした。ご不明な点はマチナウ運営へお問い合わせください。",
    en: "We could not confirm this through the shop's official contact details. Please contact Machinau if you have questions.",
    "zh-TW": "由於無法透過店家的官方聯絡方式確認，因此未獲核准。如有任何疑問，請聯絡 Machinau 營運團隊。"
  },

  store_claim_status_note_withdrawn: {
    ja: "この申請は取り下げられました。",
    en: "This request was withdrawn.",
    "zh-TW": "這項申請已撤回。"
  },

  store_claim_withdraw: {
    ja: "申請を取り下げる",
    en: "Withdraw request",
    "zh-TW": "撤回申請"
  },

  store_claim_withdraw_confirm: {
    ja: "この申請を取り下げますか？",
    en: "Withdraw this request?",
    "zh-TW": "要撤回這項申請嗎？"
  },

  store_claim_withdrawn: {
    ja: "申請を取り下げました。",
    en: "The request was withdrawn.",
    "zh-TW": "已撤回申請。"
  },

  store_claim_sent: {
    ja: "オーナー申請を送りました。マチナウ運営の確認をお待ちください。",
    en: "Your owner request was sent. Please wait for Machinau to review it.",
    "zh-TW": "已送出店主申請。請等候 Machinau 營運團隊確認。"
  },

  store_claim_pending_exists_info: {
    ja: "このお店へのオーナー申請は、すでに運営確認中です。",
    en: "Your owner request for this shop is already under review.",
    "zh-TW": "您對這家店的店主申請已在營運團隊確認中。"
  },

  // STEP 42-D｜カード登録 → 店舗の登録・引き継ぎ
  store_claim_completed: {
    ja: "引き継ぎが完了しました。「あなたの店舗・施設」の「店舗カードの編集・申し込み」から店舗情報を編集し、月額100円（税込）の契約を申し込んで公開すると、旅行者に表示されます。公開するまでは、運営による無料掲載がそのまま表示されます。",
    en: "The takeover is complete. Edit your store details from \"Edit / subscribe to the store card\" under \"Your shops & venues\", subscribe to the ¥100/month plan (tax included) and publish to show it to travelers. Until you publish, the free listing by Machinau stays as it is.",
    "zh-TW": "接手已完成。請從「您的店家・設施」中的「店家卡片的編輯・申請」編輯店家資訊，申請每月 100 日圓（含稅）的合約並公開後，就會顯示給遊客看。在公開之前，營運團隊的免費刊登會維持原樣顯示。"
  },

  store_claim_err_already_linked: {
    ja: "このお店は、すでに別の店舗アカウントが管理しているため、引き継げません。",
    en: "This listing is already managed by another store account and cannot be taken over.",
    "zh-TW": "這家店已由另一個店家帳號管理，因此無法接手。"
  },

  store_card_gate_needed: {
    ja: "お店の登録・引き継ぎの前に、クレジットカードの登録が必要です（1つのアカウントに1枚、すべての店舗で共通）。",
    en: "Please register a credit card before registering or taking over a store (one card per account, shared by all your stores).",
    "zh-TW": "在註冊・接手店家之前，需要先註冊信用卡（每個帳號 1 張，所有店家共用）。"
  },

  store_card_gate_expired: {
    ja: "登録しているクレジットカードの有効期限が切れています。カードを変更してから、もう一度お試しください。",
    en: "Your registered card has expired. Please change the card and try again.",
    "zh-TW": "您註冊的信用卡已過期。請更換信用卡後再試一次。"
  },

  store_card_gate_unavailable: {
    ja: "現在、カードの登録を受け付けていないため、お店の登録・引き継ぎはできません。",
    en: "Store registration and takeover are not available because card registration is currently unavailable.",
    "zh-TW": "目前不受理信用卡註冊，因此無法註冊・接手店家。"
  },

  store_card_gate_link: {
    ja: "カードを登録する ↓",
    en: "Register a card ↓",
    "zh-TW": "註冊信用卡 ↓"
  },

  // STEP 47 / 47-B｜アカウントの削除(退会)。未請求・未払いがあれば退会を受け付け、ご請求とお支払いの後に削除する
  store_delete_heading: {
    ja: "アカウントの削除",
    en: "Delete account",
    "zh-TW": "刪除帳號"
  },

  store_delete_intro: {
    ja: "この店舗・施設のアカウントと登録したクレジットカードを、ご自身で削除（退会）できます。まだご請求していない料金や、お支払いが済んでいないご請求がある場合は、退会を受け付けた後、翌月2日のご請求とお支払いが済んでから削除します。",
    en: "You can delete (close) this business account and its registered credit card yourself. If there are fees not yet billed or charges not yet paid, we accept your request first and delete the account after the billing on the 2nd of the following month and its payment are complete.",
    "zh-TW": "您可以自行刪除（退會）這個店家・設施的帳號以及註冊的信用卡。若有尚未收費的費用，或尚未付款的收費，我們會先受理您的退會申請，待隔月 2 日的收費與付款完成後再刪除。"
  },

  store_delete_check_button: {
    ja: "アカウントの削除へ進む",
    en: "Continue to delete account",
    "zh-TW": "前往刪除帳號"
  },

  store_delete_confirm_lead: {
    ja: "このアカウントの現在の状況",
    en: "Current status of this account",
    "zh-TW": "這個帳號目前的狀況"
  },

  store_delete_summary_stores: {
    ja: "店舗・施設",
    en: "Businesses",
    "zh-TW": "店家・設施"
  },

  store_delete_summary_published: {
    ja: "公開中",
    en: "published",
    "zh-TW": "公開中"
  },

  store_delete_summary_posts: {
    ja: "掲載中・審査待ちの今だけ投稿",
    en: "Live or pending \"Now only\" posts",
    "zh-TW": "刊登中・審核中的今日限定貼文"
  },

  store_delete_summary_card: {
    ja: "登録カード",
    en: "Registered card",
    "zh-TW": "已註冊的信用卡"
  },

  store_delete_summary_card_yes: {
    ja: "あり",
    en: "Yes",
    "zh-TW": "有"
  },

  store_delete_summary_card_no: {
    ja: "なし",
    en: "None",
    "zh-TW": "無"
  },

  store_delete_effects_lead: {
    ja: "削除すると、次のようになります。元に戻すことはできません。",
    en: "Deleting the account will do the following. This cannot be undone.",
    "zh-TW": "刪除後將會如下。無法復原。"
  },

  store_delete_effect_stores: {
    ja: "あなたの店舗・施設の情報は非公開になり、旅行者には表示されなくなります。",
    en: "Your business information becomes private and is no longer shown to travelers.",
    "zh-TW": "您的店家・設施資訊將變為未公開，不再顯示給遊客看。"
  },

  store_delete_effect_posts: {
    ja: "掲載中・審査待ちの今だけ投稿は掲載を終了します。",
    en: "Live and pending \"Now only\" posts are ended.",
    "zh-TW": "刊登中・審核中的今日限定貼文將結束刊登。"
  },

  store_delete_effect_plan: {
    ja: "新しい今だけ投稿・有料のご利用はできなくなります。ご契約中の有料のプランは解約します（その月の分はご請求します）。",
    en: "New \"Now only\" posts and paid features are no longer available. Any paid plan you have is canceled (that month is still billed).",
    "zh-TW": "將無法再發布新的今日限定貼文，也無法使用付費功能。合約中的付費方案將取消（當月費用仍會收費）。"
  },

  store_delete_effect_card: {
    ja: "登録したクレジットカードを削除します（カード番号はマチナウでは保持していません）。",
    en: "Your registered credit card is removed (Machinau does not keep card numbers).",
    "zh-TW": "將刪除您註冊的信用卡（Machinau 不會保存卡號）。"
  },

  store_delete_effect_photos: {
    ja: "店舗・施設の写真を削除します。",
    en: "Photos of your business are deleted.",
    "zh-TW": "將刪除店家・設施的照片。"
  },

  store_delete_effect_login: {
    ja: "このアカウントではログインできなくなります。",
    en: "You will no longer be able to log in with this account.",
    "zh-TW": "將無法再用這個帳號登入。"
  },

  store_delete_effect_records: {
    ja: "法令上必要な請求・取引の記録は保存します。",
    en: "Billing and transaction records required by law are kept.",
    "zh-TW": "法律上必要的收費・交易紀錄將會保存。"
  },

  store_delete_confirm_button: {
    ja: "アカウントを削除する",
    en: "Delete account",
    "zh-TW": "刪除帳號"
  },

  store_delete_cancel_button: {
    ja: "やめる",
    en: "Cancel",
    "zh-TW": "取消"
  },

  store_delete_running: {
    ja: "削除しています…",
    en: "Deleting...",
    "zh-TW": "刪除中…"
  },

  store_delete_done: {
    ja: "アカウントを削除しました。ご利用ありがとうございました。",
    en: "Your account has been deleted. Thank you for using Machinau.",
    "zh-TW": "已刪除帳號。感謝您的使用。"
  },

  store_delete_pending: {
    ja: "削除の手続きを進めています。登録カードの取り外しがまだ完了していないため、しばらくしてから「アカウントの削除へ進む」からもう一度お試しください。",
    en: "Deletion is in progress. Removal of your registered card has not finished yet, so please try again later from \"Continue to delete account\".",
    "zh-TW": "正在進行刪除手續。由於註冊信用卡的移除尚未完成，請稍後再從「前往刪除帳號」試一次。"
  },

  store_delete_settlement_note: {
    ja: "まだご請求していない料金、またはお支払いが済んでいないご請求があります。退会を受け付けた時点で店舗・施設の情報は非公開になり、残りのご請求とお支払いが済んだ後に、アカウントとカードを削除します。それまではログインして、ご請求の確認とカードの変更ができます。",
    en: "There are fees not yet billed or charges not yet paid. When we accept your request, your business information becomes private, and the account and card are deleted after the remaining charges are billed and paid. Until then you can log in to check charges and change your card.",
    "zh-TW": "有尚未收費的費用，或尚未付款的收費。在受理退會申請時，店家・設施資訊將變為未公開，待剩餘的收費與付款完成後，再刪除帳號與信用卡。在此之前，您可以登入確認收費並更換信用卡。"
  },

  store_delete_request_button: {
    ja: "退会を申し込む（清算の後に削除）",
    en: "Request closure (deleted after settlement)",
    "zh-TW": "申請退會（結算後刪除）"
  },

  store_delete_accepted: {
    ja: "退会を受け付けました。店舗・施設の情報は非公開にしました。残りのご請求とお支払いが済んだ後に、アカウントとカードを削除します。",
    en: "Your request has been accepted. Your business information is now private. The account and card will be deleted after the remaining charges are billed and paid.",
    "zh-TW": "已受理退會申請。店家・設施資訊已設為未公開。待剩餘的收費與付款完成後，將刪除帳號與信用卡。"
  },

  store_delete_status_awaiting: {
    ja: "退会の手続き中です。残りのご請求とお支払いが済んだ後に、アカウントとカードを削除します。",
    en: "Your account closure is in progress. The account and card will be deleted after the remaining charges are billed and paid.",
    "zh-TW": "退會手續進行中。待剩餘的收費與付款完成後，將刪除帳號與信用卡。"
  },

  store_delete_status_operator: {
    ja: "登録カードの取り外しで問題が起きたため、運営が確認しています。確認が済み次第、削除の手続きを進めます。",
    en: "A problem occurred while removing your registered card, and our team is looking into it. We will continue the deletion once it is resolved.",
    "zh-TW": "移除註冊信用卡時發生問題，營運團隊正在確認。確認完成後，將繼續進行刪除手續。"
  },

  store_delete_resume_button: {
    ja: "手続きの状況を確認する",
    en: "Check the status",
    "zh-TW": "確認手續狀況"
  },

  store_delete_err_operator: {
    ja: "運営のアカウントは、この画面からは削除できません。",
    en: "Operator accounts cannot be deleted from this page.",
    "zh-TW": "營運團隊的帳號無法從這個畫面刪除。"
  },

  // STEP 47-C ④｜退会の取り消し(最終削除の開始前だけ)
  store_delete_withdraw_button: {
    ja: "退会を取り消す",
    en: "Withdraw closure request",
    "zh-TW": "取消退會"
  },

  store_delete_withdraw_confirm_lead: {
    ja: "退会の申し込みを取り消します。店舗・施設の情報は非公開のままです。終了した今だけ投稿・解約した有料のプランは元に戻りません。退会の前のご請求は、これまでどおりお支払いが必要です。",
    en: "This withdraws your closure request. Your business information stays private. Ended \"Now only\" posts and canceled paid plans are not restored. Charges from before the request still need to be paid.",
    "zh-TW": "要取消退會申請。店家・設施資訊將維持未公開。已結束的今日限定貼文、已取消的付費方案無法復原。退會之前的收費仍需照常付款。"
  },

  store_delete_withdraw_confirm_button: {
    ja: "取り消しを確定する",
    en: "Confirm withdrawal",
    "zh-TW": "確定取消"
  },

  store_delete_withdrawn: {
    ja: "退会の申し込みを取り消しました。引き続きご利用いただくには、次の操作をお願いします。",
    en: "Your closure request has been withdrawn. To continue using Machinau, please do the following.",
    "zh-TW": "已取消退會申請。若要繼續使用，請進行以下操作。"
  },

  store_delete_withdraw_guide_profile: {
    ja: "店舗・施設の情報は非公開になっています。旅行者に表示するには、店舗の一覧の「お店の基本情報を編集する」から公開してください。",
    en: "Your business information is private. To show it to travelers, publish it from \"Edit shop profile\" in your business list.",
    "zh-TW": "店家・設施資訊目前為未公開。若要顯示給遊客看，請從店家列表的「編輯店家基本資訊」公開。"
  },

  store_delete_withdraw_guide_posts: {
    ja: "今だけ投稿は終了したままです。必要な場合は新しく投稿してください。",
    en: "\"Now only\" posts remain ended. Create a new post if needed.",
    "zh-TW": "今日限定貼文仍維持結束狀態。如有需要，請重新發布。"
  },

  store_delete_withdraw_guide_plan: {
    ja: "有料のプランをご契約だった場合は解約されています。続ける場合は、「お店の基本情報を編集する」の画面から申し込み直してください。",
    en: "If you had a paid plan, it has been canceled. To continue, sign up again from the \"Edit shop profile\" page.",
    "zh-TW": "若您曾簽約付費方案，該方案已取消。若要繼續，請從「編輯店家基本資訊」畫面重新申請。"
  },

  store_delete_withdraw_guide_billing: {
    ja: "退会の前に発生したご請求は、これまでどおりお支払いが必要です。",
    en: "Charges incurred before the request still need to be paid as usual.",
    "zh-TW": "退會之前產生的收費，仍需照常付款。"
  },

  store_delete_withdraw_too_late: {
    ja: "削除の手続きがすでに始まっているため、取り消せませんでした。",
    en: "The deletion has already started, so the request could not be withdrawn.",
    "zh-TW": "刪除手續已經開始，因此無法取消。"
  },

  store_delete_blocked: {
    ja: "現在はアカウントを削除できません。次の点をご確認ください。",
    en: "This account cannot be deleted right now. Please check the following.",
    "zh-TW": "目前無法刪除帳號。請確認以下事項。"
  },

  store_delete_blocker_imadake_invoice: {
    ja: "今だけ投稿のご請求に、お支払いが済んでいないもの、または決済結果が確定していないものがあります。",
    en: "A \"Now only\" post charge is unpaid or its payment result is not yet confirmed.",
    "zh-TW": "今日限定貼文的收費中，有尚未付款，或付款結果尚未確定的項目。"
  },

  store_delete_blocker_imadake_unbilled: {
    ja: "今だけ投稿のまだご請求していない料金があります（月末に締め、翌月2日にご請求します）。",
    en: "There are \"Now only\" post fees not yet billed (closed at month end and billed on the 2nd of the following month).",
    "zh-TW": "今日限定貼文有尚未收費的費用（月底結算，隔月 2 日收費）。"
  },

  store_delete_blocker_plan_unbilled: {
    ja: "有料のプランのまだご請求していない料金があります（月末に締め、翌月2日にご請求します）。",
    en: "There are paid plan fees not yet billed (closed at month end and billed on the 2nd of the following month).",
    "zh-TW": "付費方案有尚未收費的費用（月底結算，隔月 2 日收費）。"
  },

  store_delete_blocker_plan_invoice: {
    ja: "有料のプランのご請求に、お支払いが済んでいないもの、または決済結果が確定していないものがあります。",
    en: "A paid plan charge is unpaid or its payment result is not yet confirmed.",
    "zh-TW": "付費方案的收費中，有尚未付款，或付款結果尚未確定的項目。"
  },

  store_delete_blocker_billing_locked: {
    ja: "ご請求の処理中です。",
    en: "A charge is being processed.",
    "zh-TW": "正在處理收費。"
  },

  store_delete_blocker_card_unavailable: {
    ja: "現在、登録カードを取り外す手続きができません。お問い合わせください。",
    en: "Your registered card cannot be removed right now. Please contact us.",
    "zh-TW": "目前無法進行移除註冊信用卡的手續。請聯絡我們。"
  },

  store_delete_blocker_other: {
    ja: "削除できない理由があります。お問い合わせください。",
    en: "The account cannot be deleted for another reason. Please contact us.",
    "zh-TW": "有其他無法刪除的原因。請聯絡我們。"
  },

  store_delete_err_generic: {
    ja: "アカウントを削除できませんでした。時間をおいてもう一度お試しください。",
    en: "The account could not be deleted. Please try again later.",
    "zh-TW": "無法刪除帳號。請稍後再試一次。"
  },

  store_delete_err_rate_limited: {
    ja: "続けて操作されたため、少し時間をおいてからお試しください。",
    en: "Too many attempts in a row. Please wait a moment and try again.",
    "zh-TW": "由於連續操作，請稍等片刻後再試。"
  },

  store_steps_account: {
    ja: "① アカウントを作成",
    en: "1. Create an account",
    "zh-TW": "① 建立帳號"
  },

  store_steps_email: {
    ja: "② メールアドレスを確認",
    en: "2. Verify your email",
    "zh-TW": "② 確認電子郵件地址"
  },

  store_steps_card: {
    ja: "④ クレジットカードを登録する（1つのアカウントに1枚。公開の申込みに必要です）",
    en: "4. Register a credit card (one per account; needed when you subscribe to publish)",
    "zh-TW": "④ 註冊信用卡（每個帳號 1 張。申請公開時需要）"
  },

  store_steps_register: {
    ja: "③ お店を登録する、またはマチナウに掲載中のお店を引き継ぐ（下書きができます）",
    en: "3. Register a shop, or take over a listing on Machinau (starts as a draft)",
    "zh-TW": "③ 註冊店家，或接手 Machinau 刊登中的店家（可建立草稿）"
  },

  // STEP 57｜手順の続き(月額プランの申し込みと公開)・店舗ごとの状態・引き継ぎの再開・管理の案内

  store_steps_publish: {
    ja: "⑤ 月額100円（税込）に同意して申し込み、お店を公開する",
    en: "5. Agree to the ¥100/month fee (tax included), subscribe, and publish your shop",
    "zh-TW": "⑤ 同意每月 100 日圓（含稅）並申請，公開您的店家"
  },

  store_list_public_visible: {
    ja: "公開中",
    en: "Published",
    "zh-TW": "公開中"
  },

  store_list_public_hidden: {
    ja: "まだ公開されていません",
    en: "Not published yet",
    "zh-TW": "尚未公開"
  },

  store_list_plan_managed_active: {
    ja: "運営管理プラン：契約中",
    en: "Managed plan: active",
    "zh-TW": "營運管理方案：合約中"
  },

  store_list_plan_managed_canceling: {
    ja: "運営管理プラン：解約済み（{date}まで）",
    en: "Managed plan: canceled (until {date})",
    "zh-TW": "營運管理方案：已取消（至{date}）"
  },

  store_list_plan_active: {
    ja: "月額100円プラン：契約中",
    en: "¥100/month plan: subscribed",
    "zh-TW": "每月100日圓方案：合約中"
  },

  store_list_plan_canceling: {
    ja: "月額100円プラン：解約済み（{date}まで公開できます）",
    en: "¥100/month plan: canceled (can stay public until {date})",
    "zh-TW": "每月100日圓方案：已取消（可公開至{date}）"
  },

  store_list_plan_unpaid: {
    ja: "月額100円プラン：未払いのため停止中です。下の「店舗カード（月額100円）のご請求」からお支払いください。",
    en: "¥100/month plan: paused because of an unpaid charge. Please pay under \"Store card (¥100/month) charges\" below.",
    "zh-TW": "每月100日圓方案：因未付款而暫停。請從下方的「店家卡片（每月100日圓）的收費」進行付款。"
  },

  store_list_plan_none: {
    ja: "月額100円プラン：未契約（店舗情報の編集・公開には「店舗カードの編集・申し込み」からの申し込みが必要です）",
    en: "¥100/month plan: not subscribed (editing and publishing your shop details require subscribing from \"Edit store card / subscribe\")",
    "zh-TW": "每月100日圓方案：未簽約（編輯與公開店家資訊，需要從「店家卡片的編輯・申請」進行申請）"
  },

  // 店主向け「この街のマチナウ利用状況」｜TOP の現在地ボタンの下の説明(計測のスイッチ ON の時だけ表示)。
  location_area_usage_note: {
    ja: "現在地から分かった市区町村名（座標は残しません）は、地域ごとの利用統計にも使います。",
    en: "The municipality name found from your location (your coordinates are not kept) is also used for area usage statistics.",
    "zh-TW": "由目前位置得知的市区町村名稱（不會保存座標），也會用於各區的使用統計。"
  },

  location_area_usage_note_link: {
    ja: "詳しく見る／利用を停止する",
    en: "Details / turn off",
    "zh-TW": "查看詳情／停止使用"
  },

  // 店主向け「この街のマチナウ利用状況」(代表決定 2026-11-05)｜store-account.html の店舗管理画面の上部。
  area_usage_heading: {
    ja: "この街のマチナウ利用状況",
    en: "Machinau use in your town",
    "zh-TW": "這座城市的 Machinau 使用狀況"
  },

  area_usage_intro: {
    ja: "この街で、マチナウがどれくらい利用されているかをご確認いただけます。地域の利用状況を参考に、お店の情報発信にお役立てください。",
    en: "See how much Machinau is being used in your town. Use it as a guide when sharing your shop's information.",
    "zh-TW": "您可以確認 Machinau 在這座城市的使用情況。請參考地區的使用狀況，運用於店家的資訊發布。"
  },

  area_usage_store_label: {
    ja: "店舗・施設",
    en: "Shop / facility",
    "zh-TW": "店家・設施"
  },

  area_usage_period_today: {
    ja: "今日",
    en: "Today",
    "zh-TW": "今天"
  },

  area_usage_period_7days: {
    ja: "過去7日間",
    en: "Last 7 days",
    "zh-TW": "過去7天"
  },

  area_usage_period_30days: {
    ja: "過去30日間",
    en: "Last 30 days",
    "zh-TW": "過去30天"
  },

  area_usage_users_label: {
    ja: "利用人数",
    en: "People",
    "zh-TW": "使用人數"
  },

  area_usage_events_label: {
    ja: "利用回数",
    en: "Times",
    "zh-TW": "使用次數"
  },

  area_usage_users_value: {
    ja: "{n}人",
    en: "{n}",
    "zh-TW": "{n}人"
  },

  area_usage_events_value: {
    ja: "約{n}回",
    en: "About {n}",
    "zh-TW": "約{n}次"
  },

  area_usage_events_zero: {
    ja: "0回",
    en: "0",
    "zh-TW": "0次"
  },

  area_usage_users_under_min: {
    ja: "10人未満",
    en: "Fewer than 10",
    "zh-TW": "未滿10人"
  },

  area_usage_value_hidden: {
    ja: "表示なし",
    en: "Not shown",
    "zh-TW": "不顯示"
  },

  area_usage_range: {
    ja: "集計対象：{start}〜{end}",
    en: "Period: {start} – {end}",
    "zh-TW": "統計期間：{start}〜{end}"
  },

  area_usage_range_from_start: {
    ja: "集計対象：{start}（計測の開始日）〜{end}",
    en: "Period: {start} (when measurement started) – {end}",
    "zh-TW": "統計期間：{start}（測量開始日）〜{end}"
  },

  area_usage_updated: {
    ja: "最終更新：{time}",
    en: "Last updated: {time}",
    "zh-TW": "最後更新：{time}"
  },

  area_usage_status_loading: {
    ja: "利用状況を読み込んでいます…",
    en: "Loading…",
    "zh-TW": "正在載入使用狀況…"
  },

  area_usage_status_under_min: {
    ja: "人数が少ないため、人数は「10人未満」とだけ表示し、回数は表示していません。",
    en: "Because the number of people is small, we only show \"fewer than 10\" and do not show the number of times.",
    "zh-TW": "由於人數較少，人數僅顯示為「未滿10人」，次數不顯示。"
  },

  area_usage_status_withheld: {
    ja: "集計の仕組み上、人数が少ない時などは数値が表示されないことがあります（0人という意味ではありません）。",
    en: "The figures may not be shown when, for example, the number of people is small (this does not mean zero).",
    "zh-TW": "由於統計方式的關係，在人數較少等情況下，數值可能不會顯示（並不代表是0人）。"
  },

  area_usage_status_stale: {
    ja: "集計の更新が遅れています。表示は最終更新の時点の数値です。",
    en: "Updates are running late. The figures are as of the last update.",
    "zh-TW": "統計更新延遲。目前顯示的是最後更新時間點的數值。"
  },

  area_usage_status_refresh_failed: {
    ja: "最新の集計を取得できませんでした。表示は最終更新の時点の数値です。",
    en: "We could not get the latest figures. The figures are as of the last update.",
    "zh-TW": "無法取得最新統計。目前顯示的是最後更新時間點的數值。"
  },

  area_usage_status_not_started: {
    ja: "計測を始めたばかりで、まだ集計できる利用のデータがありません。データが集まると、ここに数値を表示します（Google Analyticsへの反映には数時間かかることがあります）。",
    en: "Measurement has just started and there is no usage data to count yet. Figures will appear here as data comes in (it can take a few hours to reach Google Analytics).",
    "zh-TW": "測量才剛開始，目前還沒有可統計的使用資料。資料累積後，數值會顯示在這裡（反映到 Google Analytics 可能需要數小時）。"
  },

  area_usage_status_preparing: {
    ja: "利用状況の集計は準備中です。集計が始まると、ここに数値を表示します。",
    en: "Usage figures are being prepared. They will appear here once counting starts.",
    "zh-TW": "使用狀況的統計正在準備中。統計開始後，數值會顯示在這裡。"
  },

  area_usage_status_not_covered: {
    ja: "{city}は、まだ集計の対象の地域ではありません。対象の地域は沖縄県の市町村から順に広げていきます。",
    en: "{city} is not covered yet. We are starting with the municipalities of Okinawa and will expand from there.",
    "zh-TW": "{city}還不是統計對象地區。對象地區將從沖繩縣的市区町村開始依序擴大。"
  },

  area_usage_status_area_unknown: {
    ja: "お店の所在地の市町村を確認できないため、利用状況を表示できません。",
    en: "We cannot show usage because the municipality of your shop's address could not be confirmed.",
    "zh-TW": "由於無法確認店家所在地的市区町村，無法顯示使用狀況。"
  },

  area_usage_status_load_failed: {
    ja: "利用状況を読み込めませんでした。時間をおいて、この画面を開き直してください。",
    en: "We could not load the usage figures. Please reopen this page later.",
    "zh-TW": "無法載入使用狀況。請稍後重新開啟此頁面。"
  },

  area_usage_note_users: {
    ja: "利用人数は、この市町村でマチナウの現在地の取得に成功した方の人数です（同じ方は1人として数えます）。Google アナリティクスの集計による推定値です。",
    en: "People: the number of people whose current location was found in this municipality on Machinau (each person counted once). It is an estimate from Google Analytics.",
    "zh-TW": "使用人數是指在這個市区町村內，成功取得 Machinau 目前位置的人數（同一人只計算1次）。這是依據 Google Analytics 統計的推估值。"
  },

  area_usage_note_events: {
    ja: "利用回数は、この市町村で現在地の判定に成功した回数です（同じ方の複数回を含みます）。",
    en: "Times: how many times a current location was found in this municipality (including repeat times by the same person).",
    "zh-TW": "使用次數是指在這個市区町村內，成功判定目前位置的次數（包含同一人的多次）。"
  },

  area_usage_note_not_visits: {
    ja: "表示される数値はマチナウの利用状況であり、実際の来店人数ではありません。来店の回数や、ページが見られた回数でもありません。",
    en: "These figures show how Machinau is used. They are not the number of visitors to your shop, store visits or page views.",
    "zh-TW": "顯示的數值是 Machinau 的使用狀況，並非實際的來店人數。也不是來店次數或頁面瀏覽次數。"
  },

  area_usage_note_delay: {
    ja: "数値は30分ごとに更新しますが、集計に時間がかかるため、今日の数値は数時間遅れて反映されることがあります。",
    en: "Figures are updated every 30 minutes, but today's figures can take a few hours to appear because counting takes time.",
    "zh-TW": "數值每30分鐘更新一次，但由於統計需要時間，今天的數值可能延遲數小時才反映。"
  },

  area_usage_note_small: {
    ja: "個人の行動が分からないよう、人数が10人未満の時は「10人未満」と表示し、回数は表示しません。回数は10回単位の概数です。",
    en: "To protect privacy, fewer than 10 people is shown as \"fewer than 10\" without the number of times. Times are rounded to the nearest 10.",
    "zh-TW": "為了不讓個人行為被辨識，人數未滿10人時顯示為「未滿10人」，且不顯示次數。次數為以10次為單位的概數。"
  },

  store_management_help_note: {
    ja: "お店ごとの店舗情報の編集は、契約の前でもできます。公開と、プランの申し込み・解約は「店舗カードの編集・申し込み」から行えます。ご請求・領収書は「ご請求の履歴」と「店舗カード（月額100円）のご請求」から確認できます。カードの変更は「お支払い方法」から、退会は一番下の「アカウントの削除」から行えます。",
    en: "You can edit each shop's details even before subscribing. Publish a shop, and subscribe to or cancel its plan, from \"Edit / subscribe to the store card\". Check invoices and receipts under \"Billing history\" and \"Store card (¥100/month) invoices\". Change your card under \"Payment method\", and close your account from \"Delete account\" at the bottom.",
    "zh-TW": "每間店家的店家資訊，即使在簽訂合約前也可以編輯。公開以及方案的申請・取消，可從「店家卡片的編輯・申請」進行。收費・收據可從「收費紀錄」和「店家卡片（每月100日圓）的收費」確認。信用卡的變更可從「付款方式」進行，退會可從最下方的「刪除帳號」進行。"
  },

  store_claim_resume_text: {
    ja: "マチナウに掲載中のお店の引き継ぎの途中です。",
    en: "You were in the middle of taking over a listing on Machinau.",
    "zh-TW": "您正在進行接手 Machinau 上刊登中店家的程序。"
  },

  store_claim_resume_link: {
    ja: "引き継ぎの手続きを続ける →",
    en: "Continue taking over the listing →",
    "zh-TW": "繼續接手程序 →"
  },

  store_claim_resume_dismiss: {
    ja: "この案内を消す",
    en: "Dismiss",
    "zh-TW": "關閉這則提示"
  },

  modal_claim_link: {
    ja: "このお店の方へ：お店の情報を管理する →",
    en: "Own this business? Manage this listing →",
    "zh-TW": "這間店家的業者：管理店家資訊 →"
  },

  store_claim_err_listing_not_found: {
    ja: "このお店の掲載は見つかりませんでした。掲載が終了している可能性があります。",
    en: "This listing could not be found. It may no longer be listed.",
    "zh-TW": "找不到這間店家的刊登資訊。刊登可能已經結束。"
  },

  store_claim_err_pending_exists: {
    ja: "このお店へのオーナー申請は、すでに運営確認中です。",
    en: "Your owner request for this shop is already under review.",
    "zh-TW": "這間店家的店主申請，已在營運團隊確認中。"
  },

  store_claim_err_already_yours: {
    ja: "このお店は、すでにあなたの店舗に引き継がれています。",
    en: "This shop has already been taken over by your shop.",
    "zh-TW": "這間店家已經由您的店家接手。"
  },

  store_claim_err_target: {
    ja: "つなぐ店舗を選んでください（オーナーとして登録済みで、利用中の店舗だけ選べます）。",
    en: "Please choose a shop to connect (only active shops you own can be chosen).",
    "zh-TW": "請選擇要連結的店家（只能選擇已註冊為店主、且使用中的店家）。"
  },

  store_claim_err_too_many: {
    ja: "確認中の申請が多いため、これ以上申請できません。結果をお待ちください。",
    en: "You have too many requests under review. Please wait for the results.",
    "zh-TW": "由於確認中的申請過多，無法再提出申請。請等待結果。"
  },

  store_claim_err_url: {
    ja: "公式サイト・SNSのURLを確認してください（https:// から始まるURL）。",
    en: "Please check the website or social media URL (starting with https://).",
    "zh-TW": "請確認官方網站・SNS 的 URL（以 https:// 開頭的 URL）。"
  },

  store_claim_err_note: {
    ja: "ひとことは1行・200文字以内で入力してください。",
    en: "Please keep the note to one line and 200 characters.",
    "zh-TW": "簡短留言請以1行、200個字以內輸入。"
  },

  // 今だけ投稿 STEP 2｜TOPの独立枠と詳細表示の固定文言。投稿の見出し・本文・店名・
  // 価格等(店舗が書いた内容)はここでは扱わず、原文のまま表示する。
  imadake_heading: {
    ja: "今だけ投稿",
    en: "Just for Now",
    "zh-TW": "今日限定貼文"
  },

  // TOPの今だけ投稿の枠の見出し(投稿がある時・0件の時で共通)。
  // imadake_heading(機能の名前)は店舗アカウント側のリンク文言にも使うため、枠の見出しはこちらで分ける。
  imadake_frame_heading: {
    ja: "店舗・施設・イベントからの<br>今だけ投稿",
    en: "Limited-time posts<br>from shops, facilities & events",
    "zh-TW": "來自店家、設施與活動的<br>今日限定貼文"
  },

  imadake_lead: {
    ja: "近くのお店・施設が「今」を伝えています（掲載は最長24時間）。",
    en: "Nearby shops and places sharing what's on right now (posted for up to 24 hours).",
    "zh-TW": "附近的店家與設施正在分享「現況」（刊登時間最長24小時）。"
  },

  imadake_pr_label: {
    ja: "PR・お店の投稿",
    en: "PR · From the shop",
    "zh-TW": "PR・店家的貼文"
  },

  imadake_read_more: {
    ja: "続きを見る",
    en: "See more",
    "zh-TW": "查看更多"
  },

  imadake_original_language_note: {
    ja: "お店が書いた原文で表示しています",
    en: "Shown as written by the shop",
    "zh-TW": "以店家撰寫的原文顯示"
  },

  // 今だけ投稿 カード翻訳 STEP 3｜タイトル・紹介文を自動翻訳で表示している時の表示と切り替え。
  imadake_auto_translated: {
    ja: "自動翻訳",
    en: "Automatically translated",
    "zh-TW": "自動翻譯"
  },

  imadake_show_original: {
    ja: "原文を見る",
    en: "See original",
    "zh-TW": "查看原文"
  },

  imadake_show_translation: {
    ja: "翻訳を見る",
    en: "See translation",
    "zh-TW": "查看翻譯"
  },

  imadake_expires_in_hours: {
    ja: "掲載あと{HOURS}時間",
    en: "{HOURS}h left",
    "zh-TW": "還剩{HOURS}小時"
  },

  imadake_expires_in_minutes: {
    ja: "掲載あと{MINUTES}分",
    en: "{MINUTES} min left",
    "zh-TW": "還剩{MINUTES}分鐘"
  },

  imadake_available_until: {
    ja: "{TIME}まで",
    en: "Until {TIME}",
    "zh-TW": "至{TIME}"
  },

  imadake_distance: {
    ja: "約{KM}km",
    en: "{KM} km away",
    "zh-TW": "約{KM}公里"
  },

  imadake_category_restaurant: {
    ja: "飲食店",
    en: "Restaurant",
    "zh-TW": "餐廳"
  },

  imadake_category_food_shop: {
    ja: "食品・テイクアウト",
    en: "Food & takeout",
    "zh-TW": "食品・外帶"
  },

  imadake_category_retail: {
    ja: "お店",
    en: "Shop",
    "zh-TW": "店家"
  },

  imadake_category_event: {
    ja: "イベント",
    en: "Event",
    "zh-TW": "活動"
  },

  imadake_category_other: {
    ja: "その他",
    en: "Other",
    "zh-TW": "其他"
  },

  imadake_live_stock_available: {
    ja: "在庫あり",
    en: "In stock",
    "zh-TW": "有庫存"
  },

  imadake_live_stock_few: {
    ja: "残りわずか",
    en: "Almost gone",
    "zh-TW": "數量所剩不多"
  },

  imadake_live_stock_sold_out: {
    ja: "売り切れ",
    en: "Sold out",
    "zh-TW": "售完"
  },

  imadake_live_seats_available: {
    ja: "空席あり",
    en: "Seats available",
    "zh-TW": "有空位"
  },

  imadake_live_seats_few: {
    ja: "残り席わずか",
    en: "Few seats left",
    "zh-TW": "空位所剩不多"
  },

  imadake_live_seats_full: {
    ja: "満席",
    en: "Full",
    "zh-TW": "客滿"
  },

  imadake_live_tickets_available: {
    ja: "チケットあり",
    en: "Tickets available",
    "zh-TW": "有票券"
  },

  imadake_live_tickets_few: {
    ja: "チケット残りわずか",
    en: "Few tickets left",
    "zh-TW": "票券所剩不多"
  },

  imadake_live_tickets_sold_out: {
    ja: "チケット売り切れ",
    en: "Tickets sold out",
    "zh-TW": "票券售完"
  },

  imadake_live_quantity: {
    ja: "残り{COUNT}",
    en: "{COUNT} left",
    "zh-TW": "剩餘{COUNT}"
  },

  imadake_detail_loading: {
    ja: "読み込んでいます…",
    en: "Loading…",
    "zh-TW": "載入中…"
  },

  imadake_detail_error: {
    ja: "読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load this post. Please try again later.",
    "zh-TW": "無法載入。請稍後再試一次。"
  },

  imadake_detail_retry: {
    ja: "もう一度読み込む",
    en: "Try again",
    "zh-TW": "重新載入"
  },

  imadake_detail_ended: {
    ja: "この今だけ投稿の掲載は終了しました。",
    en: "This post is no longer available.",
    "zh-TW": "這則今日限定貼文已結束刊登。"
  },

  imadake_detail_price_label: {
    ja: "価格",
    en: "Price",
    "zh-TW": "價格"
  },

  imadake_detail_payment_label: {
    ja: "支払い方法",
    en: "Payment",
    "zh-TW": "付款方式"
  },

  imadake_detail_place_label: {
    ja: "場所",
    en: "Location",
    "zh-TW": "地點"
  },

  imadake_detail_event_time_label: {
    ja: "時間",
    en: "Time",
    "zh-TW": "時間"
  },

  imadake_detail_event_venue_label: {
    ja: "会場",
    en: "Venue",
    "zh-TW": "會場"
  },

  imadake_detail_event_fee_label: {
    ja: "料金",
    en: "Fee",
    "zh-TW": "費用"
  },

  imadake_detail_check_note: {
    ja: "価格・在庫・時間などの最新の情報は、お店にご確認ください。",
    en: "Please check the latest prices, availability and times with the shop.",
    "zh-TW": "價格、庫存、時間等最新資訊，請向店家確認。"
  },

  imadake_payment_cash: {
    ja: "現金",
    en: "Cash",
    "zh-TW": "現金"
  },

  imadake_payment_card: {
    ja: "カード",
    en: "Card",
    "zh-TW": "信用卡"
  },

  imadake_payment_qr: {
    ja: "QRコード決済",
    en: "QR code payment",
    "zh-TW": "QR Code 付款"
  },

  imadake_feature_takeout: {
    ja: "テイクアウト可",
    en: "Takeout available",
    "zh-TW": "可外帶"
  },

  imadake_feature_same_day_reservation: {
    ja: "当日予約可",
    en: "Same-day booking",
    "zh-TW": "可當日預約"
  },

  imadake_feature_hold_available: {
    ja: "取り置き可",
    en: "Can be held for you",
    "zh-TW": "可預留"
  },

  imadake_feature_new_arrival: {
    ja: "新入荷",
    en: "New arrival",
    "zh-TW": "新到貨"
  },

  imadake_action_phone: {
    ja: "📞 電話する",
    en: "📞 Call",
    "zh-TW": "📞 打電話"
  },

  imadake_action_reservation: {
    ja: "📅 予約する",
    en: "📅 Book",
    "zh-TW": "📅 預約"
  },

  imadake_action_website: {
    ja: "🌐 Webサイト",
    en: "🌐 Website",
    "zh-TW": "🌐 網站"
  },

  imadake_action_social: {
    ja: "📱 SNS",
    en: "📱 Social media",
    "zh-TW": "📱 SNS"
  },

  imadake_action_order: {
    ja: "🛒 注文する",
    en: "🛒 Order",
    "zh-TW": "🛒 訂購"
  },

  // 収益化 STEP 4-B｜店舗向け成果レポート(imadake-post.html)。
  imadake_report_heading: {
    ja: "📊 成果レポート",
    en: "📊 Results report",
    "zh-TW": "📊 成果報告"
  },

  imadake_report_lead: {
    ja: "今だけ投稿の「続きを見る」が押された件数（有効CV）を、当月を含む直近3か月分確認できます。",
    en: "See how many travelers opened your posts with “See more” (valid CVs) over the last 3 months, including this month.",
    "zh-TW": "可以確認今日限定貼文的「查看更多」被點擊的次數（有效 CV），包含本月在內的最近3個月。"
  },

  imadake_report_billing_stopped: {
    ja: "現在は課金停止中です。料金は発生しません。",
    en: "Billing is currently paused. No fees are charged.",
    "zh-TW": "目前停止收費。不會產生費用。"
  },

  imadake_report_loading: {
    ja: "集計しています…",
    en: "Loading the report…",
    "zh-TW": "統計中…"
  },

  imadake_report_error: {
    ja: "成果レポートを取得できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load the report. Please try again later.",
    "zh-TW": "無法取得成果報告。請稍後再試一次。"
  },

  imadake_report_retry: {
    ja: "もう一度読み込む",
    en: "Try again",
    "zh-TW": "重新載入"
  },

  imadake_report_valid_cv: {
    ja: "有効CV件数",
    en: "Valid CVs",
    "zh-TW": "有效 CV 件數"
  },

  imadake_report_actual_charge: {
    ja: "実際の請求額",
    en: "Actual charges",
    "zh-TW": "實際收費金額"
  },

  imadake_report_actual_charge_note_stopped: {
    ja: "課金停止中のため、請求はありません。",
    en: "Nothing is charged while billing is paused.",
    "zh-TW": "由於停止收費中，不會產生收費。"
  },

  imadake_report_reference: {
    ja: "有料運用時の料金目安",
    en: "Estimated fee if billing were active",
    "zh-TW": "付費運作時的費用參考"
  },

  imadake_report_reference_note: {
    ja: "1投稿×日本時間の1日につき、有効CVが1件以上なら100円。請求額ではありません。",
    en: "¥100 per post per day (Japan time) with at least one valid CV. This is not a charge.",
    "zh-TW": "每則貼文×日本時間1天，若有效 CV 達1件以上則為100日圓。這不是收費金額。"
  },

  imadake_report_posts_heading: {
    ja: "投稿ごとの内訳",
    en: "Breakdown by post",
    "zh-TW": "各貼文明細"
  },

  imadake_report_no_posts: {
    ja: "この月に掲載された今だけ投稿はありません。",
    en: "No posts were live in this month.",
    "zh-TW": "本月沒有刊登的今日限定貼文。"
  },

  imadake_report_untitled: {
    ja: "（見出しなし）",
    en: "(No headline)",
    "zh-TW": "（無標題）"
  },

  imadake_report_status_published: {
    ja: "掲載中",
    en: "Live",
    "zh-TW": "刊登中"
  },

  imadake_report_status_ended: {
    ja: "掲載終了",
    en: "Ended",
    "zh-TW": "刊登結束"
  },

  imadake_report_status_expired: {
    ja: "掲載期間終了",
    en: "Expired",
    "zh-TW": "刊登期間結束"
  },

  imadake_report_period: {
    ja: "掲載期間",
    en: "Live period",
    "zh-TW": "刊登期間"
  },

  imadake_report_col_date: {
    ja: "日付",
    en: "Date",
    "zh-TW": "日期"
  },

  imadake_report_col_cv: {
    ja: "有効CV",
    en: "Valid CVs",
    "zh-TW": "有效 CV"
  },

  imadake_report_col_actual: {
    ja: "請求額",
    en: "Charged",
    "zh-TW": "收費金額"
  },

  imadake_report_col_reference: {
    ja: "料金目安",
    en: "Estimate",
    "zh-TW": "費用參考"
  },

  imadake_report_note_cv: {
    ja: "有効CV：旅行者が投稿の「続きを見る」を初めて押した件数です。同じ旅行者の2回目以降と、お店の方ご本人の閲覧は数えません。",
    en: "A valid CV is a traveler's first tap on “See more” for a post. Repeat views by the same traveler and views by your own shop account are not counted.",
    "zh-TW": "有效 CV：旅客第一次點擊貼文「查看更多」的次數。同一位旅客的第二次以後，以及店主本人的瀏覽不計算在內。"
  },

  imadake_report_note_dates: {
    ja: "日付・月は日本時間で集計しています。",
    en: "Dates and months are counted in Japan time (JST).",
    "zh-TW": "日期與月份以日本時間統計。"
  },

  imadake_report_generated_at: {
    ja: "集計時点",
    en: "As of",
    "zh-TW": "統計截至"
  },

  imadake_report_truncated: {
    ja: "投稿が多いため、新しい200件だけを表示しています。",
    en: "Only the 200 most recent posts are shown.",
    "zh-TW": "由於貼文數量眾多，僅顯示最新的200則。"
  },

  // 多言語化｜店舗の今だけ投稿画面(imadake-post.html)。日本語は従来の画面の文言と同じ。
  // {name} は画面側で値を差し込む(語順は言語ごとに訳の中で決める)。
  imadake_post_doc_title: {
    ja: "今だけ投稿｜マチナウ",
    en: "Just for Now | Machinau",
    "zh-TW": "今日限定貼文｜Machinau"
  },

  imadake_post_header_label: {
    ja: "マチナウ｜お店・施設の方へ",
    en: "Machinau | For shops and facilities",
    "zh-TW": "Machinau｜給店家與設施"
  },

  imadake_post_header_lead: {
    ja: "「今、伝えたいこと」を、24時間だけ旅行者へ届けます。",
    en: "Share what you want travelers to know right now, for 24 hours.",
    "zh-TW": "把「現在想傳達的訊息」，僅在24小時內傳遞給旅客。"
  },

  imadake_post_language_aria: {
    ja: "表示言語",
    en: "Display language",
    "zh-TW": "顯示語言"
  },

  imadake_post_loading: {
    ja: "読み込んでいます…",
    en: "Loading…",
    "zh-TW": "載入中…"
  },

  imadake_post_invalid_url: {
    ja: "このURLでは今だけ投稿を開けません。店舗アカウントにログインして、店舗の「今だけ投稿」から開いてください。",
    en: "This link can't open Just for Now posting. Please sign in to your store account and open Just for Now from your store.",
    "zh-TW": "無法用這個 URL 開啟今日限定貼文。請登入店家帳號，從店家的「今日限定貼文」開啟。"
  },

  imadake_post_invalid_url_hint: {
    ja: "旧方式の店舗専用URLは終了しました。",
    en: "The old shop URLs are no longer available.",
    "zh-TW": "舊方式的店家專用 URL 已停止使用。"
  },

  imadake_post_login_required: {
    ja: "店舗アカウントでログインしてから、もう一度お試しください。",
    en: "Please sign in to your shop account and try again.",
    "zh-TW": "請先登入店家帳號，再試一次。"
  },

  imadake_post_open_store_account: {
    ja: "店舗アカウント画面を開く",
    en: "Open the shop account page",
    "zh-TW": "開啟店家帳號頁面"
  },

  imadake_post_store_denied: {
    ja: "この店舗で今だけ投稿を操作する権限がありません。",
    en: "You don't have permission to manage Just for Now posts for this shop.",
    "zh-TW": "您沒有權限操作這間店家的今日限定貼文。"
  },

  imadake_post_back_to_store_account: {
    ja: "店舗アカウント画面へ戻る",
    en: "Back to the shop account page",
    "zh-TW": "返回店家帳號頁面"
  },

  imadake_post_location_label: {
    ja: "掲載場所：",
    en: "Listing location: ",
    "zh-TW": "刊登地點："
  },

  imadake_post_location_note: {
    ja: "掲載場所の変更はマチナウ運営へご連絡ください。",
    en: "To change the listing location, please contact Machinau.",
    "zh-TW": "如需變更刊登地點，請聯絡 Machinau 營運團隊。"
  },

  imadake_post_location_unregistered: {
    ja: "未登録",
    en: "Not registered",
    "zh-TW": "尚未註冊"
  },

  // 決済 STEP 35-A｜今だけ投稿のカード登録必須
  imadake_post_error_card_required: {
    ja: "今だけ投稿の利用には、クレジットカードの登録が必要です。店舗アカウント画面でカードを登録してから、もう一度お試しください。",
    en: "A credit card is required to use Just for Now posts. Please register a card on your shop account page and try again.",
    "zh-TW": "使用今日限定貼文需要註冊信用卡。請先在店家帳號頁面註冊信用卡，再重新嘗試。"
  },

  imadake_post_error_card_expired: {
    ja: "登録しているクレジットカードの有効期限が切れています。店舗アカウント画面でカードを変更してから、もう一度お試しください。",
    en: "Your registered credit card has expired. Please update your card on your shop account page and try again.",
    "zh-TW": "您註冊的信用卡已過期。請在店家帳號頁面變更信用卡，再重新嘗試。"
  },

  imadake_post_error_card_unavailable: {
    ja: "ただいまカードの登録状態を確認できません。少し時間をおいてから、もう一度お試しください。",
    en: "We can't check your card status right now. Please wait a moment and try again.",
    "zh-TW": "目前無法確認您的信用卡註冊狀態。請稍後再重新嘗試。"
  },

  imadake_post_card_setup_link: {
    ja: "店舗アカウント画面でカードを登録する",
    en: "Register a card on your shop account page",
    "zh-TW": "在店家帳號頁面註冊信用卡"
  },

  imadake_post_no_location: {
    ja: "店舗の掲載場所がまだ登録されていません。運営へお問い合わせください。",
    en: "Your shop's listing location hasn't been registered yet. Please contact Machinau.",
    "zh-TW": "您的店家尚未註冊刊登地點。請聯絡營運團隊。"
  },

  imadake_post_badge_24h: {
    ja: "24時間限定",
    en: "24 hours only",
    "zh-TW": "限時24小時"
  },

  imadake_post_about_heading: {
    ja: "今だけ投稿とは",
    en: "About Just for Now",
    "zh-TW": "什麼是今日限定貼文"
  },

  imadake_post_about_1: {
    ja: "「今だから役立つ」情報を、近くの旅行者へ届けます",
    en: "Share timely, useful information with travelers nearby",
    "zh-TW": "將「現在才有用」的資訊，傳遞給附近的旅客"
  },

  imadake_post_about_2: {
    ja: "公開から24時間で自動的に終わります",
    en: "Posts end automatically 24 hours after going live",
    "zh-TW": "公開後24小時自動結束"
  },

  imadake_post_about_3: {
    ja: "1店舗につき、同時に掲載できるのは1件です",
    en: "Each shop can have one post live at a time",
    "zh-TW": "每間店家同時只能刊登1則"
  },

  imadake_post_about_4: {
    ja: "安全確認のあとに公開します（内容によっては運営が確認してから公開します）",
    en: "Posts go live after a safety check (some posts are reviewed by Machinau first)",
    "zh-TW": "通過安全確認後公開（視內容而定，可能會由營運團隊確認後再公開）"
  },

  imadake_post_current_heading: {
    ja: "今の今だけ投稿",
    en: "Your current post",
    "zh-TW": "目前的今日限定貼文"
  },

  imadake_post_status_published: {
    ja: "公開中",
    en: "Live",
    "zh-TW": "公開中"
  },

  imadake_post_status_pending: {
    ja: "運営確認中（まだ公開されていません）",
    en: "Under review (not live yet)",
    "zh-TW": "營運團隊確認中（尚未公開）"
  },

  imadake_post_meta_pending: {
    ja: "確認が終わると公開され、その時点から24時間掲載されます。",
    en: "Once the review is complete, it will go live for 24 hours from that time.",
    "zh-TW": "確認完成後即會公開，並從該時間起刊登24小時。"
  },

  imadake_post_meta_published: {
    ja: "掲載終了予定：{time}（公開から24時間）",
    en: "Scheduled to end: {time} (24 hours after going live)",
    "zh-TW": "預定結束刊登：{time}（公開後24小時）"
  },

  imadake_post_end_button: {
    ja: "掲載を終了する",
    en: "End this post",
    "zh-TW": "結束刊登"
  },

  imadake_post_withdraw_button: {
    ja: "投稿を取り下げる",
    en: "Withdraw this post",
    "zh-TW": "撤下貼文"
  },

  imadake_post_new_heading: {
    ja: "新しく投稿する",
    en: "Create a new post",
    "zh-TW": "新增貼文"
  },

  imadake_post_required: {
    ja: "必須",
    en: "Required",
    "zh-TW": "必填"
  },

  imadake_post_optional: {
    ja: "任意",
    en: "Optional",
    "zh-TW": "選填"
  },

  imadake_post_category_label: {
    ja: "どんなお店・催しですか？",
    en: "What kind of shop or event is this?",
    "zh-TW": "這是什麼樣的店家或活動呢？"
  },

  imadake_post_source_language_label: {
    ja: "投稿する言語",
    en: "Language of your post",
    "zh-TW": "發布使用的語言"
  },

  imadake_post_source_language_hint: {
    ja: "見出しと説明を書いた言語を選んでください。旅行者の表示言語に合わせた自動翻訳に使います。",
    en: "Choose the language you wrote the headline and details in. It's used to translate your post automatically for travelers.",
    "zh-TW": "請選擇您撰寫標題和說明的語言。這將用於依旅客的顯示語言自動翻譯您的貼文。"
  },

  imadake_post_category_aria: {
    ja: "カテゴリー",
    en: "Category",
    "zh-TW": "類別"
  },

  imadake_post_category_restaurant: {
    ja: "飲食店",
    en: "Restaurant / café",
    "zh-TW": "餐飲店"
  },

  imadake_post_category_food_shop: {
    ja: "食品・スイーツ",
    en: "Food & sweets",
    "zh-TW": "食品・甜點"
  },

  imadake_post_category_retail: {
    ja: "ショップ・物販",
    en: "Shop / retail",
    "zh-TW": "商店・零售"
  },

  imadake_post_category_event: {
    ja: "イベント",
    en: "Event",
    "zh-TW": "活動"
  },

  imadake_post_category_other: {
    ja: "その他",
    en: "Other",
    "zh-TW": "其他"
  },

  imadake_post_headline_label: {
    ja: "いちばん伝えたいこと",
    en: "Your main message",
    "zh-TW": "最想傳達的事"
  },

  imadake_post_headline_placeholder: {
    ja: "例：本日まだ空席あります",
    en: "e.g. Seats still available today",
    "zh-TW": "例：今天還有空位"
  },

  imadake_post_headline_hint: {
    ja: "例：「本日まだ空席あります」「タルト、あと6個です」「新作が入荷しました」「本日17時まで営業」「当日券あります」",
    en: "Examples: “Seats still available today”, “Only 6 tarts left”, “New items just arrived”, “Open until 5 pm today”, “Same-day tickets available”",
    "zh-TW": "例：「今天還有空位」「塔派只剩6個」「新品到貨」「今天營業到17點」「有當日票」"
  },

  imadake_post_live_label_seats: {
    ja: "今の空席状況",
    en: "Seats right now",
    "zh-TW": "目前的空位狀況"
  },

  imadake_post_live_label_stock: {
    ja: "今の在庫・残り状況",
    en: "Stock right now",
    "zh-TW": "目前的庫存・剩餘狀況"
  },

  imadake_post_live_label_tickets: {
    ja: "今の当日券の状況",
    en: "Same-day tickets right now",
    "zh-TW": "目前的當日票狀況"
  },

  imadake_post_live_none: {
    ja: "指定しない",
    en: "Not specified",
    "zh-TW": "不指定"
  },

  imadake_post_live_seats_available: {
    ja: "空席あり",
    en: "Seats available",
    "zh-TW": "有空位"
  },

  imadake_post_live_seats_few: {
    ja: "残りわずか",
    en: "Almost full",
    "zh-TW": "只剩少量"
  },

  imadake_post_live_seats_full: {
    ja: "満席",
    en: "Full",
    "zh-TW": "客滿"
  },

  imadake_post_live_stock_available: {
    ja: "あり",
    en: "Available",
    "zh-TW": "有"
  },

  imadake_post_live_stock_few: {
    ja: "残りわずか",
    en: "Only a few left",
    "zh-TW": "只剩少量"
  },

  imadake_post_live_stock_sold_out: {
    ja: "売り切れ",
    en: "Sold out",
    "zh-TW": "售完"
  },

  imadake_post_live_tickets_available: {
    ja: "当日券あり",
    en: "Same-day tickets available",
    "zh-TW": "有當日票"
  },

  imadake_post_live_tickets_few: {
    ja: "残りわずか",
    en: "Only a few left",
    "zh-TW": "只剩少量"
  },

  imadake_post_live_tickets_sold_out: {
    ja: "完売",
    en: "Sold out",
    "zh-TW": "售完"
  },

  imadake_post_quantity_label: {
    ja: "残りの数",
    en: "Number left",
    "zh-TW": "剩餘數量"
  },

  imadake_post_quantity_placeholder: {
    ja: "例：6",
    en: "e.g. 6",
    "zh-TW": "例：6"
  },

  imadake_post_photos_label: {
    ja: "写真",
    en: "Photos",
    "zh-TW": "照片"
  },

  imadake_post_photos_optional: {
    ja: "任意・最大10枚",
    en: "Optional · up to 10",
    "zh-TW": "選填・最多10張"
  },

  imadake_post_photo_add: {
    ja: "写真を選ぶ",
    en: "Choose photos",
    "zh-TW": "選擇照片"
  },

  imadake_post_photo_hint_basic: {
    ja: "1枚目がメインの写真になります。",
    en: "The first photo will be the main photo.",
    "zh-TW": "第1張照片將成為主要照片。"
  },

  imadake_post_photo_hint_count: {
    ja: "1枚目がメインの写真になります（{count} / 10枚）。",
    en: "The first photo will be the main photo ({count} / 10).",
    "zh-TW": "第1張照片將成為主要照片（{count} / 10張）。"
  },

  imadake_post_photo_hint_max: {
    ja: "写真は最大10枚までです。1枚目がメインの写真になります。",
    en: "You can add up to 10 photos. The first photo will be the main photo.",
    "zh-TW": "照片最多10張。第1張照片將成為主要照片。"
  },

  imadake_post_photo_main: {
    ja: "メイン",
    en: "Main",
    "zh-TW": "主要"
  },

  imadake_post_photo_remove: {
    ja: "この写真を外す",
    en: "Remove this photo",
    "zh-TW": "移除這張照片"
  },

  imadake_post_photo_rules: {
    ja: "写真はjpeg・png・webpで1枚10MBまで、最大10枚まで選べます。",
    en: "Photos must be JPEG, PNG or WebP, up to 10 MB each. You can choose up to 10.",
    "zh-TW": "照片可使用 jpeg・png・webp，每張最多10MB，最多可選10張。"
  },

  imadake_post_body_label: {
    ja: "くわしい説明",
    en: "Details",
    "zh-TW": "詳細說明"
  },

  imadake_post_body_placeholder: {
    ja: "今日の様子、限定の内容、時間、おすすめなど",
    en: "Today's situation, what's limited, times, recommendations, etc.",
    "zh-TW": "今天的情況、限定內容、時間、推薦等"
  },

  imadake_post_extra_summary: {
    ja: "追加情報（必要なものだけ）",
    en: "More details (only what you need)",
    "zh-TW": "追加資訊（只填需要的）"
  },

  imadake_post_field_takeout: {
    ja: "テイクアウトできる",
    en: "Takeout available",
    "zh-TW": "可外帶"
  },

  imadake_post_field_sameDayReservation: {
    ja: "当日予約できる",
    en: "Same-day reservations accepted",
    "zh-TW": "可當日預約"
  },

  imadake_post_field_holdAvailable: {
    ja: "取り置きできる",
    en: "Items can be held",
    "zh-TW": "可保留商品"
  },

  imadake_post_field_newArrival: {
    ja: "新入荷",
    en: "New arrivals",
    "zh-TW": "新到貨"
  },

  imadake_post_field_startTime: {
    ja: "開始時刻",
    en: "Start time",
    "zh-TW": "開始時間"
  },

  imadake_post_field_endTime: {
    ja: "終了時刻",
    en: "End time",
    "zh-TW": "結束時間"
  },

  imadake_post_field_venue: {
    ja: "会場",
    en: "Venue",
    "zh-TW": "會場"
  },

  imadake_post_field_feeText: {
    ja: "料金",
    en: "Fee",
    "zh-TW": "費用"
  },

  imadake_post_available_until_label: {
    ja: "何時まで",
    en: "Available until",
    "zh-TW": "到幾點為止"
  },

  imadake_post_price_label: {
    ja: "価格",
    en: "Price",
    "zh-TW": "價格"
  },

  imadake_post_price_placeholder: {
    ja: "例：1個 450円",
    en: "e.g. ¥450 each",
    "zh-TW": "例：1個 450 日圓"
  },

  imadake_post_payment_label: {
    ja: "お支払い",
    en: "Payment",
    "zh-TW": "付款方式"
  },

  imadake_post_payment_cash: {
    ja: "現金",
    en: "Cash",
    "zh-TW": "現金"
  },

  imadake_post_payment_card: {
    ja: "カード",
    en: "Card",
    "zh-TW": "信用卡"
  },

  imadake_post_payment_qr: {
    ja: "QR決済",
    en: "QR code payment",
    "zh-TW": "QR 碼付款"
  },

  imadake_post_phone_label: {
    ja: "電話番号",
    en: "Phone number",
    "zh-TW": "電話號碼"
  },

  imadake_post_phone_placeholder: {
    ja: "例：098-000-0000",
    en: "e.g. 098-000-0000",
    "zh-TW": "例：098-000-0000"
  },

  imadake_post_reservation_label: {
    ja: "予約ページ",
    en: "Reservation page",
    "zh-TW": "預約頁面"
  },

  imadake_post_website_label: {
    ja: "お店のページ",
    en: "Shop website",
    "zh-TW": "店家頁面"
  },

  imadake_post_social_label: {
    ja: "SNS",
    en: "Social media",
    "zh-TW": "SNS"
  },

  imadake_post_order_label: {
    ja: "注文ページ",
    en: "Order page",
    "zh-TW": "訂購頁面"
  },

  imadake_post_submit: {
    ja: "今だけ投稿を届ける",
    en: "Publish your post",
    "zh-TW": "發布今日限定貼文"
  },

  imadake_post_submitting: {
    ja: "送信しています…",
    en: "Sending…",
    "zh-TW": "傳送中…"
  },

  imadake_post_validation_category: {
    ja: "「どんなお店・催しですか？」を選んでください。",
    en: "Please choose “What kind of shop or event is this?”.",
    "zh-TW": "請選擇「這是什麼樣的店家或活動呢？」。"
  },

  imadake_post_validation_headline: {
    ja: "「いちばん伝えたいこと」を入力してください。",
    en: "Please enter “Your main message”.",
    "zh-TW": "請輸入「最想傳達的事」。"
  },

  imadake_post_validation_headline_length: {
    ja: "「いちばん伝えたいこと」は40文字以内で入力してください。",
    en: "“Your main message” must be 40 characters or fewer.",
    "zh-TW": "「最想傳達的事」請在40個字以內輸入。"
  },

  imadake_post_validation_body_length: {
    ja: "「くわしい説明」は3,000文字以内で入力してください。",
    en: "“Details” must be 3,000 characters or fewer.",
    "zh-TW": "「詳細說明」請在3,000個字以內輸入。"
  },

  imadake_post_progress_upload: {
    ja: "写真をアップロードしています（{current} / {total}）…",
    en: "Uploading photos ({current} / {total})…",
    "zh-TW": "正在上傳照片（{current} / {total}）…"
  },

  imadake_post_progress_safety: {
    ja: "安全確認をしています…",
    en: "Running the safety check…",
    "zh-TW": "正在進行安全確認…"
  },

  imadake_post_result_published: {
    ja: "今だけ投稿を公開しました。",
    en: "Your post is now live.",
    "zh-TW": "已公開今日限定貼文。"
  },

  imadake_post_result_pending: {
    ja: "内容を運営が確認しています。確認が終わると公開され、その時点から24時間掲載されます（まだ公開されていません）。",
    en: "Machinau is reviewing your post. Once the review is complete, it will go live for 24 hours from that time (not live yet).",
    "zh-TW": "營運團隊正在確認內容。確認完成後即會公開，並從該時間起刊登24小時（尚未公開）。"
  },

  imadake_post_result_rejected: {
    ja: "この内容は掲載できません。内容を見直して、もう一度投稿してください。",
    en: "This post can't be published. Please revise it and try again.",
    "zh-TW": "此內容無法刊登。請修改內容後重新發布。"
  },

  imadake_post_result_expires: {
    ja: "24時間限定です。掲載終了予定：{time}",
    en: "It stays live for 24 hours. Scheduled to end: {time}",
    "zh-TW": "限時24小時。預定結束刊登：{time}"
  },

  imadake_post_error_active_exists: {
    ja: "すでに公開中の今だけ投稿があります。1店舗につき同時に掲載できるのは1件です。終了してから新しく投稿できます。",
    en: "You already have a live post. Each shop can have one post live at a time. End it before creating a new one.",
    "zh-TW": "已經有一則公開中的今日限定貼文。每間店家同時只能刊登1則。結束刊登後即可新增貼文。"
  },

  imadake_post_error_pending_exists: {
    ja: "運営が確認中の今だけ投稿があります。確認が終わるか、取り下げてから新しく投稿できます。",
    en: "You have a post under review. You can create a new one after the review is complete or after withdrawing it.",
    "zh-TW": "有一則今日限定貼文正在由營運團隊確認中。確認完成或撤下後即可新增貼文。"
  },

  imadake_post_error_safety_unavailable: {
    ja: "ただいま投稿を確認できません。少し時間をおいてから、もう一度お試しください（まだ公開されていません）。",
    en: "We can't check posts right now. Please try again in a little while (not live yet).",
    "zh-TW": "目前無法確認貼文。請稍後再重新嘗試（尚未公開）。"
  },

  imadake_post_error_rate_limited: {
    ja: "少し時間をおいてから、もう一度お試しください。",
    en: "Please wait a moment and try again.",
    "zh-TW": "請稍後再重新嘗試。"
  },

  imadake_post_error_invalid_url: {
    ja: "このURLでは今だけ投稿を開けません。店舗アカウントにログインして、店舗の「今だけ投稿」から開いてください。",
    en: "This link can't open Just for Now posting. Please sign in to your store account and open Just for Now from your store.",
    "zh-TW": "無法用此連結開啟今日限定貼文。請登入店家帳號，從店家的「今日限定貼文」開啟。"
  },

  imadake_post_error_field: {
    ja: "入力内容を確認してください（{field}）。",
    en: "Please check what you entered ({field}).",
    "zh-TW": "請確認輸入內容（{field}）。"
  },

  imadake_post_error_post_failed: {
    ja: "投稿できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't publish your post. Please try again later.",
    "zh-TW": "無法發布。請稍後再重新嘗試。"
  },

  imadake_post_error_compress: {
    ja: "写真を軽量化できませんでした。",
    en: "Couldn't resize the photo.",
    "zh-TW": "無法壓縮照片。"
  },

  imadake_post_error_upload_prepare: {
    ja: "写真のアップロードの準備ができませんでした。",
    en: "Couldn't prepare the photo upload.",
    "zh-TW": "無法準備照片上傳。"
  },

  imadake_post_error_upload: {
    ja: "写真をアップロードできませんでした。",
    en: "Couldn't upload the photo.",
    "zh-TW": "無法上傳照片。"
  },

  imadake_post_confirm_end: {
    ja: "公開中の今だけ投稿の掲載を終了しますか？（旅行者から見えなくなります）",
    en: "End your live post? (Travelers will no longer see it.)",
    "zh-TW": "要結束公開中的今日限定貼文刊登嗎？（旅客將看不到）"
  },

  imadake_post_confirm_withdraw: {
    ja: "確認中の投稿を取り下げますか？（公開されません）",
    en: "Withdraw the post under review? (It won't be published.)",
    "zh-TW": "要撤下確認中的貼文嗎？（將不會公開）"
  },

  imadake_post_action_failed: {
    ja: "処理できませんでした。",
    en: "Couldn't complete this action.",
    "zh-TW": "無法處理。"
  },

  imadake_post_action_failed_retry: {
    ja: "処理できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't complete this action. Please try again later.",
    "zh-TW": "無法處理。請稍後再重新嘗試。"
  },

  imadake_post_withdrawn_done: {
    ja: "確認中の投稿を取り下げました。新しく投稿できます。",
    en: "Your post under review was withdrawn. You can create a new post.",
    "zh-TW": "已撤下確認中的貼文。可以新增貼文了。"
  },

  imadake_post_ended_done: {
    ja: "今だけ投稿の掲載を終了しました。新しく投稿できます。",
    en: "Your post has ended. You can create a new post.",
    "zh-TW": "已結束今日限定貼文的刊登。可以新增貼文了。"
  },

  imadake_post_colon: {
    ja: "：",
    en: ": ",
    "zh-TW": "："
  },

  imadake_post_range_separator: {
    ja: " 〜 ",
    en: " – ",
    "zh-TW": " 〜 "
  },

  imadake_report_meta_separator: {
    ja: "・",
    en: " · ",
    "zh-TW": "・"
  },

  imadake_report_format_yen: {
    ja: "{amount}円",
    en: "¥{amount}",
    "zh-TW": "{amount} 日圓"
  },

  imadake_report_format_count: {
    ja: "{count}件",
    en: "{count}",
    "zh-TW": "{count} 件"
  },

  imadake_report_format_month: {
    ja: "{year}年{month}月",
    en: "{monthShort} {year}",
    "zh-TW": "{year}年{month}月"
  },

  imadake_report_format_day: {
    ja: "{month}/{day}",
    en: "{monthShort} {day}",
    "zh-TW": "{month}/{day}"
  },

  // STEP 48｜シェア(今だけ投稿の詳細・無料店舗の詳細)。共有するURLは https://machinau.jp の
  // 投稿・店舗のIDだけ(位置情報・利用者のIDは含めない)。
  share_button: {
    ja: "🔗 シェア",
    en: "🔗 Share",
    "zh-TW": "🔗 分享"
  },

  share_copied: {
    ja: "リンクをコピーしました。LINEやメールなどに貼り付けて送れます。",
    en: "Link copied. Paste it into a message or email to send it.",
    "zh-TW": "已複製連結。可以貼到 LINE 或電子郵件等傳送。"
  },

  share_copy_failed: {
    ja: "リンクをコピーできませんでした。下のリンクを長押し（または選択）してコピーしてください。",
    en: "Couldn't copy the link. Press and hold (or select) the link below to copy it.",
    "zh-TW": "無法複製連結。請長按（或選取）下方連結來複製。"
  },

  share_link_label: {
    ja: "共有するリンク",
    en: "Link to share",
    "zh-TW": "要分享的連結"
  },

  share_shop_unavailable: {
    ja: "共有された店舗・施設の情報は、現在掲載されていません。",
    en: "The shared place is not listed at the moment.",
    "zh-TW": "分享的店家・設施資訊目前未刊登。"
  },
  site_share_button: {
    ja: "🔗 マチナウをシェア",
    en: "🔗 Share Machinau",
    "zh-TW": "🔗 分享 Machinau"
  },
  site_share_title: {
    ja: "マチナウ",
    en: "Machinau",
    "zh-TW": "Machinau"
  },
  site_share_text: {
    ja: "街の今を知れば、もっと、いい旅になる。\n\n今いる街のお店や、今日だけの情報、地元の発見が見つかる「マチナウ」。",
    en: "Know what's happening in town right now, and your trip gets even better.\n\nMachinau shows you shops, today-only news and local finds in the town you're in.",
    "zh-TW": "知道這座城市的現況，旅行就會變得更好。\n\n在「Machinau」可以找到您所在城市的店家、今日限定資訊和在地發現。"
  },
  share_post_unavailable: {
    ja: "共有された投稿の掲載は終了しました。",
    en: "The shared post is no longer listed.",
    "zh-TW": "分享的貼文已結束刊登。"
  },

  share_notice_close: {
    ja: "閉じる",
    en: "Close",
    "zh-TW": "關閉"
  }
};

// この配列に無い値は必ずMACHINAU_DEFAULT_LANGUAGEへフォールバックする。
const MACHINAU_SUPPORTED_LANGUAGES = ["ja", "en", "zh-TW"];

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
