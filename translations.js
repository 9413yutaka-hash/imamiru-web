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
  // トップ画面再設計 STEP3｜旧ヒーロー(hero_heading等、下記に残置)を
  // 廃止し、現在地セクションより前に置いた新しいオープニングの1行。
  // STEP4で実写バナー画像に置き換えたためHTML上の参照は無くなったが、
  // 将来言語ごとのメインコピーをHTML側で表示する余地を残すため残置する。
  opening_heading: {
    ja: "マチナウ、現在の街を見てみよう！",
    en: "Machinau — let's see your city right now!"
  },

  // トップ画面再設計 STEP4｜代表承認済み実写バナー画像(opening-visual-banner.png)
  // のalt文言。画像内には既に日本語で「マチナウ、今の街の声を聞こう！」が
  // 描かれているが、alt自体は画像内日本語だけに意味を依存させないよう
  // 多言語で用意する(スクリーンリーダー・画像読み込み失敗時にも意味が
  // 伝わるようにするため)。
  opening_visual_alt: {
    ja: "マチナウ、今の街の声を聞こう！",
    en: "Machinau — hear what's happening in your city right now"
  },

  // TOPヒーロー緊急変更｜新ヒーロー(背景画像＋本物のHTML)の
  // メイン/サブコピー・4入口(hero_action_*)。下のhero_heading/hero_kicker
  // (STEP3の旧ヒーロー由来、参照箇所なし)とは別物。
  hero_main_copy: {
    ja: "街の今を知れば、<br>もっと、いい旅になる。",
    en: "Know what's happening in town now,<br>and make your trip even better."
  },

  hero_action_today_title: {
    ja: "今いる街の情報",
    en: "About This Town"
  },


  hero_action_nearby_title: {
    ja: "近くで楽しめる場所",
    en: "Fun Spots Nearby"
  },

  hero_action_nearby_caption: {
    ja: "今いる場所から",
    en: "From where you are now"
  },

  hero_action_area_title: {
    ja: "地域から探す",
    en: "Explore by Area"
  },

  hero_action_area_caption: {
    ja: "都道府県・市区町村で",
    en: "By prefecture & city"
  },

  hero_action_reads_title: {
    ja: "マチナウ読みもの",
    en: "Machinau Reads"
  },

  hero_action_reads_caption: {
    ja: "旅のヒント・ストーリー",
    en: "Travel tips & stories"
  },

  // マチナウの楽しみ方｜ヒーロー直下の入口(#howToEntryButton)と説明モーダル
  // (#howToModal)の文言。旅行者が読む言葉だけで書く(内部用語は出さない)。
  how_to_entry_label: {
    ja: "はじめての方へ",
    en: "New here?"
  },

  how_to_entry_question: {
    ja: "マチナウってどう使うの？",
    en: "Not sure how Machinau works?"
  },

  how_to_entry_link: {
    ja: "マチナウの楽しみ方を見る →",
    en: "See how to enjoy it →"
  },

  how_to_title: {
    ja: "マチナウの楽しみ方",
    en: "How to Enjoy Machinau"
  },

  how_to_lead: {
    ja: "<strong>マチナウは「今いる街」を楽しむためのサービスです。</strong><br>街で今起きていることや、近くのお店・施設、街の声や発見などを見ながら、その街をもっと楽しんでみよう。",
    en: "<strong>Machinau helps you enjoy the town you're in right now.</strong><br>See what's happening around town, nearby shops and spots, and what people have noticed — and get more out of every place you visit."
  },

  how_to_step1_title: {
    ja: "① まず現在地を押してみよう",
    en: "① Start with your location"
  },

  how_to_step1_text: {
    ja: "現在地を使うと、あなたの近くにある情報を探せます。お店や街の発見などは、今いる場所から<strong>15km以内</strong>を中心に表示します。",
    en: "Your location lets Machinau find what's around you. Shops, spots and local discoveries are shown mainly <strong>within 15 km</strong> of where you are."
  },

  how_to_step1_note: {
    ja: "位置情報は、近くの情報を探すために使います。",
    en: "Your location is used to find nearby information."
  },

  how_to_step1_button: {
    ja: "📍 現在地から見てみる",
    en: "📍 See what's near me"
  },

  how_to_step2_title: {
    ja: "② これから行く街も見てみよう",
    en: "② Check out where you're heading"
  },

  how_to_step2_text: {
    ja: "今いる場所だけでなく、これから行く街も探せます。少し離れた場所へ行く予定なら「地域から探す」で市区町村を選んでみよう。その街のお店・施設が見られます。",
    en: "You can look up not just where you are, but also the towns you're heading to. Going somewhere a little farther? Pick a city or town in “Explore by Area” to see its shops and spots."
  },

  how_to_step2_compare_location: {
    ja: "<strong>📍 現在地</strong>…今いる場所の近くを見る",
    en: "<strong>📍 My location</strong> — see what's around you now"
  },

  how_to_step2_compare_area: {
    ja: "<strong>🗺️ 地域から探す</strong>…これから行く街のお店・施設を見る",
    en: "<strong>🗺️ Explore by Area</strong> — see shops and spots in the town you're going to"
  },

  how_to_step2_button: {
    ja: "🗺️ 行きたい街を探す",
    en: "🗺️ Find a town to visit"
  },

  how_to_step3_title: {
    ja: "③ 街の「今」をのぞいてみよう",
    en: "③ Peek at what's happening now"
  },

  how_to_step3_text: {
    ja: "近くのお店や施設、街で見つかった出来事など、今いる場所で役立つ情報を見てみよう。",
    en: "Browse nearby shops and spots, things people have spotted around town, and other tips that are handy right where you are."
  },

  how_to_step3_link: {
    ja: "近くで楽しめる場所を見る →",
    en: "See fun spots nearby →"
  },

  how_to_step4_title: {
    ja: "④ 「街の今スレッド」って？",
    en: "④ What are “Town Now Threads”?"
  },

  how_to_step4_text: {
    ja: "<strong>その場所の「今日」を、近くの人に聞ける場所です。</strong>",
    en: "<strong>A place to ask people near a spot what's happening there today.</strong>"
  },

  how_to_step4_examples: {
    ja: "「今、混んでる？」<br>「今日やってる？」<br>「この近くで何かある？」",
    en: "“Is it crowded right now?”<br>“Is it open today?”<br>“Anything going on around here?”"
  },

  how_to_step4_text2: {
    ja: "今いる場所だけでなく、<strong>これから行く街にもスレッドを立てられます。</strong>",
    en: "Not just where you are — <strong>you can also start a thread for a town you're heading to.</strong>"
  },

  // 表示範囲は実装どおり：現在地から立てたスレッド＝その地点から5km以内、
  // 街(市区町村)を選んで立てたスレッド＝その市区町村にいる人。
  how_to_step4_reach: {
    ja: "今いる場所で立てると<strong>5km以内の人へ</strong>、<br>街を選んで立てると<strong>その街にいる人へ</strong>届きます。",
    en: "Start one from your current location and it reaches <strong>people within 5 km</strong>;<br>pick a town and it reaches <strong>people in that town</strong>."
  },

  how_to_step4_author: {
    ja: "立てた人は、離れた場所からでも自分のスレッドを確認できます。",
    en: "If you started a thread, you can still check it even when you're somewhere else."
  },

  how_to_step4_closing: {
    ja: "<strong>今いる人と、これから行く人をつなぐ。</strong><br>それが「街の今スレッド」です。",
    en: "<strong>Connecting people who are there with people on their way.</strong><br>That's what Town Now Threads are for."
  },

  how_to_step4_link: {
    ja: "近くのスレッドを見る →",
    en: "See threads nearby →"
  },

  how_to_step5_title: {
    ja: "⑤ あなたの発見も届けられます",
    en: "⑤ Share what you discover"
  },

  how_to_step5_lead: {
    ja: "<strong>街で見つけた「今」を、写真と一緒に近くの人へ届けられます。</strong>",
    en: "<strong>Share what you find happening around town — with a photo — with people nearby.</strong>"
  },

  how_to_step5_examples: {
    ja: "「こんなイベントやってる！」<br>「景色がきれい！」<br>「こんなお店を見つけた！」<br>「ここ、今すごく賑わってる！」",
    en: "“There's an event going on!”<br>“What a view!”<br>“Found a great little shop!”<br>“It's really lively here right now!”"
  },

  how_to_step5_how: {
    ja: "写真を撮って、ひとこと添えて投稿するだけ。<br>投稿は<strong>3・6・12・24時間</strong>から掲載時間を選べて、近くの旅行者に届きます。",
    en: "Just snap a photo and add a few words.<br>Choose to keep it up for <strong>3, 6, 12 or 24 hours</strong>, and it reaches travelers nearby."
  },

  how_to_step5_text: {
    ja: "<strong>あなたの発見が、次の旅行者の「知っててよかった」になる。</strong>",
    en: "<strong>What you find today could be exactly what the next traveler is glad to know.</strong>"
  },

  how_to_step5_link: {
    ja: "📷 見つけた「今」を投稿する →",
    en: "📷 Share what you found →"
  },

  how_to_step6_title: {
    ja: "⑥ お店・施設の方も参加できます",
    en: "⑥ Shops & venues can join too"
  },

  how_to_step6_text: {
    ja: "登録したお店・施設は、営業情報やイベントなど、今伝えたい情報を自分で発信できます。",
    en: "Registered shops and venues can post their own updates — opening hours, events, and anything they want travelers to know right now."
  },

  how_to_step6_link: {
    ja: "お店・施設の方へ →",
    en: "For shops & venues →"
  },

  how_to_final_location: {
    ja: "📍 現在地からマチナウを使ってみる",
    en: "📍 Start Machinau from my location"
  },

  how_to_final_area: {
    ja: "🗺️ 行きたい街から探す",
    en: "🗺️ Search a town I want to visit"
  },

  how_to_close: {
    ja: "閉じてTOPに戻る",
    en: "Close and go back"
  },

  // トップ画面再設計 STEP3で旧ヒーローのDOMは削除したが、キーは既存の
  // 「削除せず残す」方針に合わせて残置する(参照箇所は無くなったが、
  // データとして残しても実害が無いため)。
  hero_heading: {
    ja: "今、沖縄で<br>何が起きているか。",
    en: "What's happening<br>in Okinawa right now."
  },

  hero_kicker: {
    ja: "沖縄の「今」をリアルタイム配信",
    en: "Live updates on Okinawa, right now"
  },

  // 現在地ファーストUX STEP2｜初めてマチナウを開いた人が「何をすればいいか」
  // 一目で分かる取得前の見出し。取得後はlocation_heading_after(下記)へ
  // JS側(updateLocationButtonLanguage())が切り替える(userLatitudeの有無で
  // 判定、getLocation()本体・地域判定ロジックには一切触れない)。
  location_heading: {
    ja: "今いる街を見る",
    en: "See the town you're in"
  },

  // 現在地取得後の見出し。
  location_heading_after: {
    ja: "今いる街",
    en: "Your area right now"
  },

  location_button_get: {
    ja: "現在地を取得する",
    en: "Get my location"
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

  // 投稿玄関Phase1｜旧shops_general_post_entry_link(👀今ここで見つけた？
  // みんなに知らせる→)を廃止し、投稿できることが一瞬で分かる参加CTAへ
  // 置換。contribute.html自体は既存post.html同様に日本語のみ(post.html側に
  // 多言語対応が無く、遷移先が日本語のみのため、玄関ページだけ英語化しても
  // 一貫した体験にならないという確認済みの理由による)。
  contribute_cta_heading: {
    ja: "📣 あなたの発見を教えて！",
    en: "📣 Tell us what you've found!"
  },

  contribute_cta_message: {
    ja: "あなたが見つけた街の今が、今そこにいる誰かの役に立ちます。",
    en: "What you notice right now could help someone nearby today."
  },

  contribute_cta_button: {
    ja: "見つけた「今」を投稿する →",
    en: "Share what you found →"
  },

  // TOP参加CTA内の店舗・施設向け第2導線(shop.htmlへ)。footer_shop_linkと同じ
  // 考え方の文言。shop.html自体は日本語のみ。
  contribute_cta_shop_link: {
    ja: "お店・施設の方へ｜無料で情報を掲載できます →",
    en: "For shops & venues | List your info for free →"
  },

  category_all: {
    ja: "すべて",
    en: "All"
  },

  category_favorite: {
    ja: "お気に入り",
    en: "Favorites"
  },

  category_power_spot: {
    ja: "パワースポット",
    en: "Power Spots"
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

  // AIコンシェルジュ Phase2｜「店からの提案か、マチナウからの提案か
  // 分かりにくい」問題への対応。本部第一候補をそのまま採用。
  suggestion_heading: {
    ja: "✨ マチナウAI「今どうする？」",
    en: "✨ Machinau AI: What now?"
  },

  // 初心回帰後の新トップ体験 Phase1｜旅行者向けUIから「AI」という言葉・
  // 「マチナウAI」という名称を外すための見出し変更(AI処理自体は裏方として
  // 無変更のまま残す)。
  ai_concierge_chat_heading: {
    ja: "気になることを聞く",
    en: "Ask something"
  },

  // 初心回帰後の新トップ体験 Phase1修正｜第一声はOpenAIを呼ばず、既に
  // 取得済みのuserAreaNameだけでクライアント側テンプレートから組み立てる
  // ({AREA}を地域名で置換)。本部指示により、天気の話題・予定を聞く問いかけ・
  // 回答を要求する言い回しは一切含めない、静かな案内文へ変更した
  // (4キーとも天気による分岐を維持する必要が無くなったため、rain/clearは
  // area_onlyと同じ文言にしている。JSの分岐ロジック自体は変更していない)。
  ai_concierge_initial_rain: {
    ja: "{AREA}にいるんだね。気になることがあれば、ここで聞けるよ。",
    en: "So you're in {AREA}. If anything comes to mind, you can ask here."
  },

  ai_concierge_initial_clear: {
    ja: "{AREA}にいるんだね。気になることがあれば、ここで聞けるよ。",
    en: "So you're in {AREA}. If anything comes to mind, you can ask here."
  },

  ai_concierge_initial_area_only: {
    ja: "{AREA}にいるんだね。気になることがあれば、ここで聞けるよ。",
    en: "So you're in {AREA}. If anything comes to mind, you can ask here."
  },

  ai_concierge_initial_fallback: {
    ja: "気になることがあれば、ここで聞けるよ。",
    en: "If anything comes to mind, you can ask here."
  },

  // トップ画面整理｜旧「近くの『今』」「気になることを聞く」の2枠を
  // 統合した1つの案内枠の文言。下に続く店舗情報・街の声等へ誘導する。
  city_now_guidance_message: {
    ja: "この街の「今」が届いているよ！下をチェック！",
    en: "This city's \"now\" has arrived! Check it out below."
  },

  region_today_info_heading: {
    ja: "今日、この地域で起きていること",
    en: "What's happening in this area today"
  },

  region_today_info_loading: {
    ja: "今日の地域情報を確認しています…",
    en: "Checking today's local information…"
  },

  region_today_info_show_more: {
    ja: "今日の情報をもっと見る",
    en: "See more of today's updates"
  },

  region_today_info_show_less: {
    ja: "閉じる",
    en: "Close"
  },

  region_today_info_official_link: {
    ja: "公式情報を見る",
    en: "View official information"
  },

  region_today_info_detail_link: {
    ja: "詳しく見る",
    en: "See details"
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
    en: "What's happening nearby"
  },

  awareness_notice_factual_info: {
    ja: "⚠️ 近くで大事なお知らせが出てるよ：{TITLE}",
    en: "⚠️ Important notice nearby: {TITLE}"
  },

  awareness_notice_official_today: {
    ja: "📢 近くで今日のお知らせが出てるよ：{TITLE}",
    en: "📢 Today's notice nearby: {TITLE}"
  },

  awareness_notice_traveler_suggestion: {
    ja: "🎉 近くで今日、「{TITLE}」やってるみたい！",
    en: "🎉 Looks like \"{TITLE}\" is happening nearby today!"
  },

  awareness_notice_street_discovery: {
    ja: "📍 この辺に来た人からこんな発見が届いてるよ：{TITLE}",
    en: "📍 Someone nearby shared this discovery: {TITLE}"
  },

  awareness_notice_shop_summary: {
    ja: "🏪 近くのお店から今日の情報が出てるよ。チェックしてね！",
    en: "🏪 Nearby shops have posted today's updates. Check them out!"
  },

  awareness_notices_empty: {
    ja: "近くで気づいた情報はまだ見つかってないよ。",
    en: "Nothing notable found nearby yet."
  },

  // SNS街巡回(socialPatrol) Phase1｜巡回が実際に実行され(checked:true)、
  // それでも何も見つからなかった場合だけ表示する。巡回が未実行/失敗の
  // 場合はawareness_notices_emptyのまま(取得していないものを確認したと
  // 表現しないため)。
  awareness_notices_empty_social_checked: {
    ja: "SNSでは今のところ、旅行者向けに特に気になる情報は見つからなかったよ。",
    en: "Nothing especially traveler-relevant found on social media right now."
  },

  // 初心回帰後の新トップ体験 Phase1｜街情報ボタン。マチナウが全情報を
  // 押し付けず、興味を持った人だけが自分で開く入口の見出し・ラベル。
  area_info_heading: {
    ja: "気になる情報を見る",
    en: "Browse more info"
  },

  area_info_role_label: {
    ja: "🏛️ 地域・行政",
    en: "🏛️ Local & government"
  },

  area_info_tourism_label: {
    ja: "🏝️ 観光施設",
    en: "🏝️ Tourist facilities"
  },

  suggestion_placeholder_main: {
    ja: "このあと、どうする？",
    en: "What should you do next?"
  },

  suggestion_placeholder_message: {
    ja: "現在地を取得すると、今いる場所・周辺の「今」から、あなたに合った行き先を提案します。",
    en: "Share your location and Machinau will suggest what to do next based on where you are and what's happening nearby."
  },

  suggestion_placeholder_cta: {
    ja: "現在地から提案してもらう",
    en: "Get a suggestion near me"
  },

  // AIコンシェルジュ Phase2｜GPS→天気確認→AI判断という流れが伝わるよう、
  // 2段階の待機文言にする(suggestion_ai_checkingが1段階目)。
  suggestion_ai_checking: {
    ja: "街の「今」を確認中…",
    en: "Checking what's happening around you…"
  },

  suggestion_ai_loading: {
    ja: "天気や周辺情報から考えています…",
    en: "Thinking it over based on the weather and what's nearby…"
  },

  // AIコンシェルジュ Phase2｜「また開いて」の実装方式(採用案C)。AIには
  // この文言自体を生成させず、AIが返すshouldReopenLater(構造化値)が
  // trueのときだけ、この固定文をUI側で末尾に付け足す。
  suggestion_reopen_later_note: {
    ja: "天気や場所が変わったら、またマチナウを開いてください。その時の「今」から次を提案します。",
    en: "If the weather or your location changes, open Machinau again — we'll suggest what's next based on that new \"now\"."
  },

  suggestion_no_candidates_message: {
    ja: "今は近くに提案できる情報を見つけられませんでした。\n新しい情報が入り次第、ここから提案します。",
    en: "We couldn't find anything nearby to suggest right now.\nWe'll share a suggestion here as soon as new information comes in."
  },

  suggestion_fallback_generic_note: {
    ja: "現在地の近くにある情報です。",
    en: "This is information near your current location."
  },

  suggestion_fallback_error_message: {
    ja: "現在、提案を準備できませんでした。少し時間をおいて、もう一度現在地を更新してください。",
    en: "We couldn't prepare a suggestion right now. Please wait a moment and refresh your location again."
  },

  factual_heading: {
    ja: "⚡ 今、知っておきたいこと",
    en: "⚡ Good to Know"
  },

  today_machinau_heading: {
    ja: "🔥 今、見てほしい",
    en: "🔥 Worth a Look Now"
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

  // 現在地ファーストUX STEP2｜取得前の説明文。取得後はlocation_message_success
  // (既存、変更なし)へgetLocation()が切り替える。
  location_message_initial: {
    ja: "マチナウは、今いる街の「今」をお届けします。まずは現在地ボタンを押してね。",
    en: "Machinau shows you what's happening in your area right now. Tap the button below to get started."
  },

  location_permission_toggle_show: {
    ja: "📍 位置情報の設定方法を見る",
    en: "📍 Location settings help"
  },

  // 位置情報取得失敗時の離脱防止｜失敗時(拒否・取得不可・時間切れ)に位置情報
  // カード内へ出す補足と「地域から探す」への逃げ道(#locationFailureActions)。
  location_failure_inapp_note: {
    ja: "LINEやInstagramなどのアプリから開いている場合は、SafariやChromeなどのブラウザで開くと位置情報を利用しやすくなります。",
    en: "If you opened Machinau inside an app like LINE or Instagram, opening it in a browser such as Safari or Chrome usually makes location easier to use."
  },

  location_failure_area_note: {
    ja: "位置情報なしでも「地域から探す」からマチナウを利用できます。",
    en: "You can still use Machinau without location — just search by area."
  },

  location_failure_area_button: {
    ja: "🗾 地域から探す",
    en: "🗾 Search by area"
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

  location_permission_android_device_note: {
    ja: "スマホ本体の位置情報がOFFになっている場合は、端末の設定で位置情報をONにしてください（設定画面の名前は機種によって異なります）。",
    en: "If location is turned off on the phone itself, turn it on in your device settings (the menu names differ by model)."
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

  // 地域から探す｜市区町村を選んだ時の店舗セクション。{AREA}は
  // japan-municipalities.jsの市区町村名(日本語のまま)に置き換える。
  shops_region_heading: {
    ja: "{AREA}で楽しめる場所",
    en: "Places to Enjoy in {AREA}"
  },

  shops_region_order: {
    ja: "新しい順",
    en: "Newest First"
  },

  shops_region_note: {
    ja: "選んだ街に掲載中のお店・施設です（現在地からの距離では絞り込んでいません）。",
    en: "Shops and spots listed in the town you picked (not limited by distance from you)."
  },

  shops_region_back_button: {
    ja: "📍 現在地の近くに戻る",
    en: "📍 Back to places near me"
  },

  shops_region_other_button: {
    ja: "🗺️ ほかの地域を選ぶ",
    en: "🗺️ Pick another area"
  },

  shops_region_empty: {
    ja: "現在、この地域に掲載中のお店・施設はありません。",
    en: "There are no shops or spots listed in this area yet."
  },

  shops_loading: {
    ja: "掲載中の情報を読み込んでいます…",
    en: "Loading listings…"
  },

  more_button: {
    ja: "もっと見る",
    en: "Show More"
  },

  // TOP店舗一覧の全件表示中に「もっと見る」ボタンが切り替わる文言
  // (app.jsのrenderShops()がボタンのdata-i18nをmore_button⇔close_buttonで切り替える)。
  close_button: {
    ja: "閉じる",
    en: "Close"
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

  city_info_button: {
    ja: "この街の情報",
    en: "About This City"
  },

  city_info_status_loading: {
    ja: "この街について調べています…",
    en: "Looking up this city…"
  },

  city_info_status_error: {
    ja: "この街の情報を取得できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load city info. Please try again later."
  },

  column_entry_heading: {
    ja: "📖 マチナウ読みもの",
    en: "📖 Machinau Reads"
  },

  column_entry_lead: {
    ja: "今いる街を楽しむためのヒント",
    en: "Tips for enjoying the place you're in"
  },

  // 多言語化 最終仕上げ｜「マチナウ読み物をもっと見る →」(column-list.htmlへの
  // 導線)。既存はハードコードで固定言語スイッチャーに未対応だったため、
  // 他のcolumn_entry_*キーと同じ場所へ追加する。
  column_entry_more_link: {
    ja: "マチナウ読み物をもっと見る →",
    en: "See More Machinau Reads →"
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
    ja: "お問い合わせ・ご意見",
    en: "Contact & Feedback"
  },

  // 投稿玄関Phase1｜旧footer_shop_entry_link/footer_general_post_entry_link
  // (post.htmlへの別々の2導線)を、contribute.htmlへの1つの導線へ統一。
  footer_contribute_link: {
    ja: "街の「今」を投稿する",
    en: "Share what's happening"
  },

  // 店舗・施設参加導線 Phase2｜フッターの店舗・施設向け入口(shop.htmlへ)。
  // shop.html自体は日本語のみ。
  footer_shop_link: {
    ja: "お店・施設の方へ｜マチナウに無料で投稿できます",
    en: "For shops & venues | Post on Machinau for free"
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
    ja: "今いる街の天気",
    en: "Weather in your area"
  },

  location_button_checking: {
    ja: "確認しています…",
    en: "Checking…"
  },

  location_message_fetching: {
    ja: "GPSから現在地を取得しています。",
    en: "Getting your location via GPS…"
  },

  // 画像UX改善Phase2｜GPS確定直後、店舗一覧を距離順へ並び替える一瞬だけ
  // 表示する遷移メッセージ。「原因不明で写真が変わった」という体験を
  // 避けるための表示で、location_message_success(直後に続けて表示)とは別。
  location_message_sorting: {
    ja: "現在地を取得しました。近い順に並び替えています…",
    en: "Location found. Sorting by distance…"
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
    ja: "🔄 もう一度試す",
    en: "🔄 Try Again"
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

  shop_user_post_badge: {
    ja: "マチナウユーザーからの情報",
    en: "Shared by a Machinau user"
  },

  shop_verified_badge: {
    ja: "🏪 お店から",
    en: "🏪 From the shop"
  },

  shop_permanent_ad_badge: {
    ja: "店舗広告",
    en: "Shop advertisement"
  },

  report_toggle_button: {
    ja: "🚩 気になる情報を報告",
    en: "🚩 Report this info"
  },

  report_reason_old_or_wrong: {
    ja: "情報が古い/間違っている",
    en: "Outdated or incorrect"
  },

  report_reason_inappropriate: {
    ja: "不適切な内容",
    en: "Inappropriate content"
  },

  report_reason_spam: {
    ja: "スパム・広告",
    en: "Spam or advertising"
  },

  report_reason_other: {
    ja: "その他",
    en: "Other"
  },

  report_sending_message: {
    ja: "送信しています…",
    en: "Sending…"
  },

  report_submitted_message: {
    ja: "報告を受け付けました。ご協力ありがとうございます。",
    en: "Thanks — your report has been received."
  },

  report_error_message: {
    ja: "報告を送信できませんでした。時間をおいてもう一度お試しください。",
    en: "Couldn't send the report. Please try again later."
  },

  report_already_submitted_message: {
    ja: "この情報はすでに報告済みです。",
    en: "You've already reported this."
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

  // 多言語化 最終Phase(マチナウ読み物)｜TOPの読み物カードのリンク文言。
  column_entry_read_more_link: {
    ja: "読む →",
    en: "Read →"
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

  community_board_heading_dynamic: {
    ja: "📌 {AREA}の掲示板",
    en: "📌 {AREA} Community Board"
  },

  community_board_empty: {
    ja: "この街の掲示板は、まだ投稿がありません。",
    en: "There are no posts on this community board yet."
  },

  community_board_watch_video: {
    ja: "🎥 動画を見る",
    en: "🎥 Watch video"
  },

  street_discovery_heading: {
    ja: "📍 街の発見",
    en: "📍 Spotted Nearby"
  },

  street_discovery_lead: {
    ja: "近くの人が見つけた、今の街の様子です。",
    en: "What people nearby have spotted around town right now."
  },

  community_board_post_link: {
    ja: "今いる街について投稿する",
    en: "Post about the city you're in now"
  },

  community_board_post_link_remote: {
    ja: "{AREA}について投稿する",
    en: "Post about {AREA}"
  },

  community_board_prefecture_label: {
    ja: "都道府県",
    en: "Prefecture"
  },

  community_board_prefecture_placeholder: {
    ja: "選択してください",
    en: "Please select"
  },

  community_board_area_name_label: {
    ja: "市区町村",
    en: "City / Ward / Town / Village"
  },

  community_board_area_name_placeholder: {
    ja: "例：渋谷区",
    en: "e.g. Shibuya-ku"
  },

  community_board_area_name_select_placeholder_before: {
    ja: "先に都道府県を選択してください",
    en: "Please select a prefecture first"
  },

  community_board_area_name_select_placeholder_after: {
    ja: "選択してください",
    en: "Please select"
  },

  community_board_area_search_button: {
    ja: "この街を見る",
    en: "View this city"
  },

  community_board_area_search_error: {
    ja: "街を確認できませんでした。都道府県と市区町村名を確認してください。",
    en: "We couldn't confirm this city. Please check the prefecture and city/ward/town/village name."
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

  // 運営投稿(sourceLabelあり)のwebsiteUrl＝運営が参照した情報元ページ。
  modal_source_page_button: {
    ja: "🔗 情報元ページを見る",
    en: "🔗 View source page"
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
  },

  // 街の今スレッド Phase 1C-2｜TOP一覧＋詳細モーダル(見るだけ)。
  // 文言は仮(代表が実機確認後に最終判断)。投稿本文・返信本文は翻訳しない。
  town_now_heading: {
    ja: "💬 街の今スレッド",
    en: "💬 Town Now Threads"
  },

  town_now_description: {
    ja: "近くにいる人たちの、今日の会話です。",
    en: "Today's conversations from people nearby."
  },

  town_now_empty: {
    ja: "近くでは、まだ今日の会話がありません。",
    en: "No conversations nearby yet today."
  },

  town_now_open_button: {
    ja: "会話を見る",
    en: "View conversation"
  },

  town_now_modal_loading: {
    ja: "読み込み中…",
    en: "Loading…"
  },

  town_now_thread_ended: {
    ja: "この会話は公開を終了しました。",
    en: "This conversation is no longer available."
  },

  town_now_load_error: {
    ja: "会話を読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load this conversation. Please try again later."
  },

  town_now_replies_heading: {
    ja: "返信",
    en: "Replies"
  },

  town_now_replies_empty: {
    ja: "まだ返信はありません。",
    en: "No replies yet."
  },

  // 街の今スレッド Phase 1C-3｜投稿導線・返信。文言は仮(代表が実機確認後に判断)。
  town_now_new_thread_link: {
    ja: "新しいスレッドを立てる",
    en: "Start a new thread"
  },

  town_now_reply_placeholder: {
    ja: "返信を書く",
    en: "Write a reply"
  },

  town_now_reply_button: {
    ja: "返信する",
    en: "Reply"
  },

  town_now_reply_sending: {
    ja: "送信しています…",
    en: "Sending…"
  },

  town_now_reply_pending: {
    ja: "返信を受け付けました。確認後に公開されます。",
    en: "Reply received. It will appear after review."
  },

  town_now_reply_error: {
    ja: "返信できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't send your reply. Please try again later."
  },

  town_now_reply_rate_limited: {
    ja: "短時間に続けて返信されています。少し待ってから、もう一度お試しください。",
    en: "You're replying too quickly. Please wait a moment and try again."
  },

  town_now_reply_invalid: {
    ja: "返信内容を確認してください。",
    en: "Please check your reply."
  },

  // 正式店舗参加基盤 Phase 1｜店舗・施設アカウント画面(store-account.html)の固定UI文言。
  // 認証エラー等はFirebaseのエラーcodeから画面側でこのキーへ対応付ける(内部データには保存しない)。

  store_account_doc_title: {
    ja: "店舗・施設アカウント｜マチナウ",
    en: "Business Account | Machinau"
  },

  store_account_page_label: {
    ja: "マチナウ 店舗・施設アカウント",
    en: "Machinau Business Account"
  },

  store_account_intro: {
    ja: "お店・施設・イベント主催者の方のためのアカウントです。",
    en: "An account for shops, facilities and event organizers."
  },

  store_account_phase_note: {
    ja: "現在ご利用いただけるのは、アカウントの作成・ログインと、店舗・施設の登録です。常設店舗情報の編集や投稿などの機能は、準備ができ次第このアカウントからご利用いただけるようになります。",
    en: "For now, you can create an account, log in and register your shop or facility. Features such as editing your permanent shop information and posting will become available from this account once they are ready."
  },

  store_account_title_login: {
    ja: "ログイン",
    en: "Log in"
  },

  store_account_title_signup: {
    ja: "新規アカウント登録",
    en: "Create an account"
  },

  store_account_title_reset: {
    ja: "パスワード再設定",
    en: "Reset your password"
  },

  store_account_title_account: {
    ja: "アカウント",
    en: "Your account"
  },

  store_account_email_label: {
    ja: "メールアドレス",
    en: "Email address"
  },

  store_account_password_label: {
    ja: "パスワード",
    en: "Password"
  },

  store_account_password_confirm_label: {
    ja: "パスワード（確認）",
    en: "Confirm password"
  },

  store_account_password_hint: {
    ja: "8文字以上で入力してください。",
    en: "Use at least 8 characters."
  },

  store_account_show_password: {
    ja: "パスワードを表示する",
    en: "Show password"
  },

  store_account_agree_prefix: {
    ja: "",
    en: "I agree to the "
  },

  store_account_agree_terms_link: {
    ja: "利用規約",
    en: "Terms of Use"
  },

  store_account_agree_and: {
    ja: "と",
    en: " and the "
  },

  store_account_agree_privacy_link: {
    ja: "プライバシーポリシー",
    en: "Privacy Policy"
  },

  store_account_agree_suffix: {
    ja: "に同意します",
    en: ""
  },

  store_account_legal_ja_only: {
    ja: "",
    en: "(The Terms of Use and Privacy Policy are available in Japanese only.)"
  },

  store_account_signup_button: {
    ja: "アカウントを作成する",
    en: "Create account"
  },

  store_account_login_button: {
    ja: "ログインする",
    en: "Log in"
  },

  store_account_reset_button: {
    ja: "再設定メールを送る",
    en: "Send reset email"
  },

  store_account_reset_intro: {
    ja: "登録したメールアドレスを入力してください。パスワードを再設定するためのメールをお送りします。",
    en: "Enter the email address you registered with. We will send you an email to reset your password."
  },

  store_account_to_signup: {
    ja: "はじめての方：新規アカウント登録",
    en: "New here? Create an account"
  },

  store_account_to_login: {
    ja: "登録済みの方：ログイン",
    en: "Already have an account? Log in"
  },

  store_account_forgot: {
    ja: "パスワードを忘れた方",
    en: "Forgot your password?"
  },

  store_account_back_to_login: {
    ja: "ログイン画面へ戻る",
    en: "Back to log in"
  },

  store_account_logout_button: {
    ja: "ログアウトする",
    en: "Log out"
  },

  store_account_status_logged_in: {
    ja: "ログインしています",
    en: "You are logged in"
  },

  store_account_status_email_label: {
    ja: "メールアドレス",
    en: "Email address"
  },

  store_account_status_verify_label: {
    ja: "メール確認",
    en: "Email verification"
  },

  store_account_status_verified: {
    ja: "確認済み",
    en: "Verified"
  },

  store_account_status_unverified: {
    ja: "未確認",
    en: "Not verified"
  },

  store_account_status_store_link_label: {
    ja: "店舗との紐付け",
    en: "Linked shop"
  },

  store_account_status_store_link_none: {
    ja: "まだありません",
    en: "None yet"
  },

  store_account_verify_sent: {
    ja: "確認メールを送りました。メール内のリンクを開いて、メールアドレスを確認してください。",
    en: "We have sent you a verification email. Open the link in the email to verify your email address."
  },

  store_account_verify_needed: {
    ja: "メールアドレスの確認がまだ完了していません。確認が済むまで、店舗機能はご利用いただけません。",
    en: "Your email address has not been verified yet. Shop features will not be available until it is."
  },

  store_account_verify_spam_hint: {
    ja: "メールが見つからない場合は、迷惑メールフォルダもご確認ください。",
    en: "If you can't find the email, please check your spam folder."
  },

  store_account_resend_button: {
    ja: "確認メールを再送する",
    en: "Resend verification email"
  },

  store_account_resend_wait: {
    ja: "再送は少し時間をおいてからお試しください。",
    en: "Please wait a little before resending."
  },

  store_account_refresh_button: {
    ja: "確認が済んだら：状態を更新する",
    en: "Verified? Refresh status"
  },

  store_account_still_unverified: {
    ja: "まだ確認が完了していません。メール内のリンクを開いてから、もう一度お試しください。",
    en: "Not verified yet. Open the link in the email, then try again."
  },

  store_account_verified_now: {
    ja: "メールアドレスの確認が完了しました。",
    en: "Your email address has been verified."
  },

  store_account_reset_sent: {
    ja: "このメールアドレスが登録されている場合は、パスワード再設定のメールを送りました。メール内のリンクから新しいパスワードを設定してください。",
    en: "If this email address is registered, we have sent a password reset email. Use the link in the email to set a new password."
  },

  store_account_logged_out: {
    ja: "ログアウトしました。",
    en: "You have logged out."
  },

  store_account_processing: {
    ja: "処理中…",
    en: "Processing…"
  },

  store_account_back_to_top: {
    ja: "← マチナウTOPへ",
    en: "← Back to Machinau"
  },

  store_account_err_email_required: {
    ja: "メールアドレスを入力してください。",
    en: "Please enter your email address."
  },

  store_account_err_email_invalid: {
    ja: "メールアドレスの形式が正しくありません。",
    en: "Please enter a valid email address."
  },

  store_account_err_password_required: {
    ja: "パスワードを入力してください。",
    en: "Please enter your password."
  },

  store_account_err_password_short: {
    ja: "パスワードは8文字以上にしてください。",
    en: "Your password must be at least 8 characters."
  },

  store_account_err_password_long: {
    ja: "パスワードは128文字以内にしてください。",
    en: "Your password must be 128 characters or fewer."
  },

  store_account_err_password_same_email: {
    ja: "メールアドレスと同じパスワードは使えません。",
    en: "Your password can't be the same as your email address."
  },

  store_account_err_password_mismatch: {
    ja: "確認用のパスワードが一致しません。",
    en: "The passwords don't match."
  },

  store_account_err_agree_required: {
    ja: "利用規約とプライバシーポリシーへの同意が必要です。",
    en: "Please agree to the Terms of Use and Privacy Policy."
  },

  store_account_err_email_in_use: {
    ja: "このメールアドレスはすでに登録されています。ログインするか、パスワード再設定をご利用ください。",
    en: "This email address is already registered. Please log in or reset your password."
  },

  store_account_err_weak_password: {
    ja: "このパスワードは安全性が低いため使えません。別のパスワードにしてください。",
    en: "This password is too weak. Please choose a different one."
  },

  store_account_err_login_failed: {
    ja: "メールアドレスまたはパスワードが正しくありません。",
    en: "The email address or password is incorrect."
  },

  store_account_err_user_disabled: {
    ja: "このアカウントは現在ご利用いただけません。",
    en: "This account is currently unavailable."
  },

  store_account_err_too_many: {
    ja: "操作が続いたため、一時的に制限されています。しばらくしてからお試しください。",
    en: "Too many attempts. Please wait a while and try again."
  },

  store_account_err_network: {
    ja: "通信できませんでした。電波の良い場所でもう一度お試しください。",
    en: "Couldn't connect. Please check your connection and try again."
  },

  store_account_err_not_allowed: {
    ja: "現在、この操作を受け付けていません。時間をおいてお試しください。",
    en: "This action is not available right now. Please try again later."
  },

  store_account_err_generic: {
    ja: "エラーが発生しました。時間をおいてもう一度お試しください。",
    en: "Something went wrong. Please try again later."
  },

  store_account_err_unavailable: {
    ja: "ただいまアカウント機能を利用できません。ページを再読み込みしてください。",
    en: "The account service is unavailable right now. Please reload the page."
  },

  store_account_verify_preparing: {
    ja: "確認メールを準備しています。数秒後に1回だけ送信します。",
    en: "Preparing your verification email. It will be sent once in a few seconds."
  },

  store_account_verify_preparing_button: {
    ja: "確認メールを送信しています…",
    en: "Sending verification email…"
  },

  store_account_verify_cooldown_active: {
    ja: "このブラウザでは直前に確認メールの送信を行ったため、今は送信していません。再送できるようになったら「確認メールを再送する」を押してください。",
    en: "A verification email was requested from this browser recently, so none was sent now. When resending becomes available, press \"Resend verification email\"."
  },

  store_account_resend_available_in: {
    ja: "再送できるまで あと {time}",
    en: "You can resend in {time}"
  },

  store_account_duration_hours_minutes: {
    ja: "{h}時間{m}分",
    en: "{h}h {m}m"
  },

  store_account_err_verify_too_many: {
    ja: "確認メールの送信が一時的に制限されています。時間を十分に空けてから、再度お試しください。続けて操作しても送信されません。",
    en: "Sending verification emails is temporarily restricted. Please wait a good while before trying again. Repeated attempts will not send an email."
  },

  store_account_status_store_count: {
    ja: "{n}件",
    en: "{n} registered"
  },

  store_account_store_verify_required: {
    ja: "店舗・施設の登録には、メールアドレスの確認が必要です。確認が済んだら「状態を更新する」を押してください。",
    en: "You need to verify your email address before registering a shop or facility. After verifying, press \"Refresh status\"."
  },

  store_account_stores_heading: {
    ja: "あなたの店舗・施設",
    en: "Your shops & facilities"
  },

  store_account_stores_empty: {
    ja: "まだ登録されていません。",
    en: "Nothing registered yet."
  },

  store_account_store_open_form: {
    ja: "店舗・施設を登録する",
    en: "Register a shop or facility"
  },

  store_account_store_form_heading: {
    ja: "店舗・施設の登録",
    en: "Register a shop or facility"
  },

  store_account_store_name_label: {
    ja: "店舗・施設名",
    en: "Shop / facility name"
  },

  store_account_store_category_label: {
    ja: "カテゴリ",
    en: "Category"
  },

  store_account_store_category_placeholder: {
    ja: "選んでください",
    en: "Please choose"
  },

  store_account_store_country_label: {
    ja: "国・地域",
    en: "Country / region"
  },

  store_account_store_address_label: {
    ja: "住所",
    en: "Address"
  },

  store_account_store_address_hint: {
    ja: "番地・建物名まで入力してください。旅行者に表示する場所の基準になります。",
    en: "Enter the full street address, including the building number. This is used as your location for travelers."
  },

  store_account_store_preview_button: {
    ja: "所在地を確認する",
    en: "Check location"
  },

  store_account_store_preview_title: {
    ja: "見つかった所在地",
    en: "Location found"
  },

  store_account_store_preview_partial: {
    ja: "住所の一部だけが一致しました。地図で場所が正しいか必ず確認し、違う場合は住所を詳しく入力し直してください。",
    en: "Only part of the address matched. Please check the map, and if the place is wrong, enter a more detailed address."
  },

  store_account_store_preview_map: {
    ja: "地図で場所を確認する",
    en: "Check on the map"
  },

  store_account_store_preview_confirm_hint: {
    ja: "場所が正しければ「この内容で登録する」を押してください。",
    en: "If the location is correct, press \"Register\"."
  },

  store_account_store_register_button: {
    ja: "この内容で登録する",
    en: "Register"
  },

  store_account_store_cancel_button: {
    ja: "やめる",
    en: "Cancel"
  },

  store_account_category_gourmet: {
    ja: "グルメ",
    en: "Food & dining"
  },

  store_account_category_cafe_sweets: {
    ja: "カフェ・スイーツ",
    en: "Cafés & sweets"
  },

  store_account_category_shopping: {
    ja: "ショッピング",
    en: "Shopping"
  },

  store_account_category_sightseeing_experience: {
    ja: "観光・体験",
    en: "Sightseeing & experiences"
  },

  store_account_category_nightlife: {
    ja: "ナイトスポット",
    en: "Nightlife"
  },

  store_account_category_beauty_relaxation: {
    ja: "美容・リラクゼーション",
    en: "Beauty & relaxation"
  },

  store_account_category_lodging: {
    ja: "宿泊",
    en: "Lodging"
  },

  store_account_category_other: {
    ja: "その他",
    en: "Other"
  },

  store_account_store_status_active: {
    ja: "登録済み",
    en: "Registered"
  },

  store_account_store_status_pending_review: {
    ja: "運営確認中",
    en: "Under review"
  },

  store_account_store_status_rejected: {
    ja: "登録できませんでした",
    en: "Not accepted"
  },

  store_account_store_status_suspended: {
    ja: "停止中",
    en: "Suspended"
  },

  store_account_store_note_active: {
    ja: "常設店舗情報の編集は準備中です。まだ旅行者には表示されません。",
    en: "Editing your permanent shop information is coming soon. It is not shown to travelers yet."
  },

  store_account_store_note_pending_review: {
    ja: "既存の店舗情報との重複がないか等を運営が確認しています。確認が終わるまでお待ちください。",
    en: "Our team is checking this registration (for example, for duplicates of existing listings). Please wait until the check is complete."
  },

  store_account_store_note_rejected: {
    ja: "この登録はご利用いただけません。ご不明な点はマチナウ運営へお問い合わせください。",
    en: "This registration cannot be used. If you have questions, please contact Machinau."
  },

  store_account_store_note_suspended: {
    ja: "この店舗・施設は現在停止しています。マチナウ運営へお問い合わせください。",
    en: "This shop or facility is currently suspended. Please contact Machinau."
  },

  store_account_store_registered_active: {
    ja: "店舗・施設を登録しました。",
    en: "Your shop or facility has been registered."
  },

  store_account_store_registered_pending: {
    ja: "登録を受け付けました。運営の確認が終わるまでお待ちください。",
    en: "Your registration was received. Please wait until our team has checked it."
  },

  store_account_store_err_verify: {
    ja: "メールアドレスの確認が済んでいません。確認後に「状態を更新する」を押してください。",
    en: "Your email address is not verified yet. After verifying, press \"Refresh status\"."
  },

  store_account_store_err_login: {
    ja: "ログインし直してから、もう一度お試しください。",
    en: "Please log in again and try once more."
  },

  store_account_store_err_address_not_found: {
    ja: "住所が見つかりませんでした。選んだ国・地域と住所を確認してください。",
    en: "The address could not be found. Please check the country/region and address."
  },

  store_account_store_err_too_coarse: {
    ja: "場所を特定できませんでした。番地・建物名まで入力してください。",
    en: "The location could not be pinpointed. Please enter the full street address."
  },

  store_account_store_err_country_mismatch: {
    ja: "選んだ国・地域の中で住所が見つかりませんでした。国・地域の選択を確認してください。",
    en: "The address was not found in the selected country/region. Please check your selection."
  },

  store_account_store_err_geocoding: {
    ja: "ただいま所在地を確認できません。時間をおいてお試しください。",
    en: "We can't check locations right now. Please try again later."
  },

  store_account_store_err_already_registered: {
    ja: "この店舗・施設は、すでにこのアカウントで登録されています。",
    en: "This shop or facility is already registered with this account."
  },

  store_account_store_err_rate_limited: {
    ja: "続けて操作されたため、少し時間をおいてからお試しください。",
    en: "Please wait a moment before trying again."
  },

  store_account_store_err_name: {
    ja: "店舗・施設名を60文字以内で入力してください。",
    en: "Please enter a shop/facility name (up to 60 characters)."
  },

  store_account_store_err_category: {
    ja: "カテゴリを選んでください。",
    en: "Please choose a category."
  },

  store_account_store_err_country: {
    ja: "国・地域を選んでください。",
    en: "Please choose a country/region."
  },

  store_account_store_err_address: {
    ja: "住所を200文字以内で入力してください。",
    en: "Please enter an address (up to 200 characters)."
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
