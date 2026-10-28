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
    ja: "🧳 旅の保存箱",
    en: "🧳 Travel Box"
  },

  mypage_description: {
    ja: "旅先で見つけた情報を保存して、旅の途中や旅のあとに振り返れます。",
    en: "Save what you find on your trip and look back on it during or after your travels."
  },

  mypage_favorite_empty: {
    ja: "まだ保存したお店・施設はありません。カードの♡を押すと、ここに保存されます。",
    en: "No places saved yet. Tap ♡ on a card to save it here."
  },

  // 旅の保存箱 Phase 1a｜保存の種類ごとの見出しと、保存先の説明。
  // Phase 1b｜代表確定仕様の見出し(❤️ お気に入り／📖 お気に入り読み物)へ変更。
  travel_box_shops_heading: {
    ja: "❤️ お気に入り",
    en: "❤️ Favorites"
  },

  travel_box_articles_heading: {
    ja: "📖 お気に入り読み物",
    en: "📖 Saved Reads"
  },

  // 旅の保存箱 Phase 1b｜読みもの保存の案内・ボタン文言。
  travel_box_articles_empty: {
    ja: "まだ保存した読みものはありません。「マチナウ読みもの」の♡を押すと、ここに保存されます。",
    en: "No reads saved yet. Tap ♡ on a Machinau Reads card to save it here."
  },

  travel_box_articles_loading: {
    ja: "保存した読みものを読み込んでいます…",
    en: "Loading your saved reads…"
  },

  travel_box_articles_load_failed: {
    ja: "読みものを読み込めませんでした。時間をおいて、もう一度開いてください。",
    en: "Couldn't load reads right now. Please try again later."
  },

  column_save_aria_label: {
    ja: "この読みものを旅の保存箱に保存",
    en: "Save this read to your Travel Box"
  },

  column_unsave_aria_label: {
    ja: "この読みものの保存を解除",
    en: "Remove this read from your Travel Box"
  },

  saved_article_remove_button: {
    ja: "保存を解除",
    en: "Remove"
  },

  saved_items_limit_reached: {
    ja: "保存できる読みものは{MAX}件までです。旅の保存箱で保存を解除してから、もう一度お試しください。",
    en: "You can save up to {MAX} reads. Remove some in your Travel Box, then try again."
  },

  saved_items_save_failed: {
    ja: "保存を変更できませんでした。このブラウザでは保存が使えない可能性があります（プライベートブラウズ等）。",
    en: "Couldn't update your saved reads. Saving may be unavailable in this browser (e.g. private browsing)."
  },

  travel_box_storage_note: {
    ja: "保存した内容は、この端末のブラウザに保存されます。別の端末やブラウザには表示されず、閲覧履歴を消すと消えることがあります。",
    en: "Your saved items are stored in this browser on this device. They won't appear on other devices or browsers, and may be removed if you clear your browsing data."
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

  // STEP 43-N｜特定商取引法に基づく表記(tokushoho.html。ページは日本語のみ)。
  footer_tokushoho_link: {
    ja: "特定商取引法に基づく表記",
    en: "Legal Notice (Specified Commercial Transactions Act, Japanese)"
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

  // STEP 40-A｜常設店舗広告の営業時間(閉店が翌日)・定休日(TOPの店舗詳細)。
  shop_hours_range_overnight: {
    ja: "🕘 営業時間 {START}〜翌{END}",
    en: "🕘 Hours: {START}–{END} (next day)"
  },

  shop_closed_days: {
    ja: "🗓 定休日 {DAYS}",
    en: "🗓 Closed: {DAYS}"
  },

  shop_closed_days_separator: {
    ja: "・",
    en: ", "
  },

  shop_closed_days_with_irregular: {
    ja: "{DAYS}（不定休あり）",
    en: "{DAYS} (also irregular holidays)"
  },

  shop_closed_irregular: {
    ja: "不定休",
    en: "Irregular holidays"
  },

  shop_closed_day_mon: { ja: "月", en: "Mon" },
  shop_closed_day_tue: { ja: "火", en: "Tue" },
  shop_closed_day_wed: { ja: "水", en: "Wed" },
  shop_closed_day_thu: { ja: "木", en: "Thu" },
  shop_closed_day_fri: { ja: "金", en: "Fri" },
  shop_closed_day_sat: { ja: "土", en: "Sat" },
  shop_closed_day_sun: { ja: "日", en: "Sun" },

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

  // Phase 2D STEP 4A｜店主が管理する正式店舗のカードのバッジ。
  shop_store_managed_badge: {
    ja: "店舗が管理",
    en: "Managed by the business"
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

  // 街の掲示板 停止防止｜掲示板を取得できなかった時(投稿0件とは別の表示)。
  community_board_load_error: {
    ja: "掲示板を読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't load this community board. Please try again later."
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

  // 今だけ投稿 決済 STEP 31｜お支払い方法(カード登録、store-account.html)。
  store_billing_heading: {
    ja: "お支払い方法",
    en: "Payment method"
  },

  store_billing_test_badge: {
    ja: "テスト環境",
    en: "Test mode"
  },

  store_billing_intro: {
    ja: "今だけ投稿の利用料金（有効な閲覧があった「投稿×1日」ごとに100円・税込、月末締め・翌月まとめてカード請求）に使うカードを登録します。カードは1つのアカウントに1枚で、このアカウントで管理するすべてのお店・施設に共通です。お店・施設の登録と引き継ぎにも、カードの登録が必要です。カードを登録しただけでは料金は発生しません。現在、請求は行っていません。カード番号は決済会社（Stripe）が直接受け取り、マチナウには保存されません（保存するのは、カードのブランド・下4桁・有効期限だけです）。",
    en: "Register the card used for Just for Now fees (¥100 incl. tax per post per day with at least one valid view, billed together monthly). One card per account, shared by all the shops and venues you manage with this account. A card is also required to register or take over a shop or venue. Registering a card does not by itself incur any fee. No charges are being made at this time. Your card number goes directly to our payment provider (Stripe) and is not stored by Machinau (we keep only the card brand, last 4 digits and expiry date)."
  },

  store_billing_store_label: {
    ja: "事業者",
    en: "Business"
  },

  store_billing_card_registered: {
    ja: "登録済みのカード",
    en: "Registered card"
  },

  store_billing_card_none: {
    ja: "カードはまだ登録されていません。",
    en: "No card registered yet."
  },

  store_billing_start_button: {
    ja: "カードを登録する",
    en: "Register a card"
  },

  store_billing_change_button: {
    ja: "カードを変更する",
    en: "Change card"
  },

  store_billing_consent: {
    ja: "利用規約（料金・お支払いの条項を含みます）に同意し、このカードを今だけ投稿の利用料金（月末締め・翌月まとめて請求）の支払いに使うことに同意します。",
    en: "I agree to the Terms of Service (including the fees and payment terms) and that this card will be used to pay Just for Now fees (billed monthly)."
  },

  store_billing_submit_button: {
    ja: "このカードを登録する",
    en: "Register this card"
  },

  // STEP 43-N｜カード登録の欄から、料金・お支払いの表記(利用規約・特定商取引法に基づく表記)へのリンク。
  store_billing_legal_prefix: {
    ja: "料金・お支払いについて：",
    en: "About fees and payment: "
  },

  store_billing_legal_terms_link: {
    ja: "利用規約",
    en: "Terms of Service"
  },

  store_billing_legal_and: {
    ja: "・",
    en: " / "
  },

  store_billing_legal_tokushoho_link: {
    ja: "特定商取引法に基づく表記",
    en: "Legal Notice (Japanese)"
  },

  store_billing_cancel_button: {
    ja: "やめる",
    en: "Cancel"
  },

  store_billing_loading: {
    ja: "カードの入力欄を準備しています…",
    en: "Preparing the card form…"
  },

  store_billing_confirming: {
    ja: "カードを確認しています…",
    en: "Checking your card…"
  },

  store_billing_saved: {
    ja: "カードを登録しました。",
    en: "Your card has been registered."
  },

  store_billing_processing: {
    ja: "カードの確認中です。しばらくしてから、もう一度開いてください。",
    en: "Your card is still being checked. Please reopen this page in a moment."
  },

  store_billing_err_consent: {
    ja: "カードを使うことへの同意にチェックしてください。",
    en: "Please check the box to agree to how your card will be used."
  },

  store_billing_err_requires_action: {
    ja: "カード会社の認証が完了していません。もう一度お試しください。",
    en: "Your card issuer's authentication was not completed. Please try again."
  },

  store_billing_err_failed: {
    ja: "このカードは登録できませんでした。別のカードでお試しください。",
    en: "This card could not be registered. Please try another card."
  },

  store_billing_err_rate_limited: {
    ja: "少し時間をおいて、もう一度お試しください。",
    en: "Please wait a moment and try again."
  },

  store_billing_err_unavailable: {
    ja: "現在、カード登録はご利用いただけません。",
    en: "Card registration is not available right now."
  },

  store_billing_err_stripe: {
    ja: "決済会社との通信に失敗しました。時間をおいて、もう一度お試しください。",
    en: "We couldn't reach the payment provider. Please try again later."
  },

  store_billing_err_retry: {
    ja: "登録の手続きをやり直してください。",
    en: "Please start the registration again."
  },

  store_billing_err_generic: {
    ja: "カードを登録できませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't register your card. Please try again later."
  },

  // 今だけ投稿 決済 STEP 38-B｜ご請求の履歴(store-account.html、読み取りだけ)。
  store_invoice_heading: {
    ja: "ご請求の履歴",
    en: "Billing history"
  },

  store_invoice_intro: {
    ja: "今だけ投稿のご利用料金（有効な閲覧があった「投稿×1日」ごとに100円・税込）です。月末に締めて金額を確定し、翌月にまとめて登録カードへご請求します。直近12か月分を表示します。",
    en: "Fees for Just for Now posts (¥100 incl. tax per post per day with at least one valid view). Amounts are confirmed at month-end and charged together to your registered card the following month. Shows the last 12 months."
  },

  store_invoice_estimate_heading: {
    ja: "見込み（未確定）",
    en: "Estimate (not confirmed)"
  },

  store_invoice_estimate_line: {
    ja: "{month}：{count}件・{amount}（見込み）",
    en: "{month}: {count} item(s), {amount} (estimate)"
  },

  store_invoice_estimate_none: {
    ja: "未確定の見込みはありません。",
    en: "No pending estimate."
  },

  store_invoice_estimate_note: {
    ja: "見込みは月末の締めの後に確定します。確定したご請求額とは別で、合計していません。",
    en: "Estimates are confirmed after the month-end close. They are separate from confirmed charges and not added to them."
  },

  store_invoice_confirmed_heading: {
    ja: "確定したご請求",
    en: "Confirmed charges"
  },

  store_invoice_none: {
    ja: "確定した請求はまだありません。",
    en: "There are no confirmed charges yet."
  },

  store_invoice_month_format: {
    ja: "{year}年{month}月",
    en: "{year}/{month}"
  },

  store_invoice_month_label: {
    ja: "{month}分",
    en: "{month}"
  },

  store_invoice_yen_format: {
    ja: "{amount}円",
    en: "¥{amount}"
  },

  store_invoice_amount_line: {
    ja: "ご請求額：{amount}（税込）・{count}件",
    en: "Amount: {amount} (incl. tax), {count} item(s)"
  },

  store_invoice_closed_at: {
    ja: "確定日：{date}",
    en: "Confirmed on: {date}"
  },

  store_invoice_paid_at: {
    ja: "お支払い日：{date}",
    en: "Paid on: {date}"
  },

  store_invoice_line_no_headline: {
    ja: "（見出しなし）",
    en: "(no headline)"
  },

  store_invoice_lines_truncated: {
    ja: "明細が多いため、一部だけを表示しています。",
    en: "Only part of the details is shown because there are many items."
  },

  store_invoice_aggregating_note: {
    ja: "月末の締めの集計中です。金額は確定後に表示します。",
    en: "The month-end close is in progress. The amount will be shown once confirmed."
  },

  store_invoice_status_aggregating: {
    ja: "集計処理中",
    en: "Calculating"
  },

  store_invoice_status_confirmed_unbilled: {
    ja: "確定済み・カードへのご請求前",
    en: "Confirmed, not yet charged"
  },

  store_invoice_status_processing: {
    ja: "ご請求の処理中",
    en: "Charge in progress"
  },

  store_invoice_status_paid: {
    ja: "お支払い済み",
    en: "Paid"
  },

  store_invoice_status_payment_failed: {
    ja: "カードでのお支払いができませんでした（カードの確認をお願いします）",
    en: "The card payment failed (please check your card)"
  },

  store_invoice_status_requires_action: {
    ja: "カードの本人確認が必要です。運営からご連絡します",
    en: "Card authentication is required. We will contact you."
  },

  store_invoice_status_under_review: {
    ja: "確認中（運営が確認しています）",
    en: "Under review by Machinau"
  },

  store_invoice_err_load: {
    ja: "ご請求の履歴を読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "We couldn't load your billing history. Please try again later."
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
    ja: "常設店舗情報を編集できます。まだ旅行者には表示されません。",
    en: "You can edit your shop profile. It is not shown to travelers yet."
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
  },

  store_profile_doc_title: {
    ja: "常設店舗情報｜マチナウ",
    en: "Shop Profile | Machinau"
  },

  store_profile_heading: {
    ja: "常設店舗情報",
    en: "Shop profile"
  },

  store_profile_not_public_banner: {
    ja: "この情報はまだ旅行者に表示されません。下書きとして保存されます。",
    en: "This information is not shown to travelers yet. It is saved as a draft."
  },

  store_profile_loading: {
    ja: "読み込んでいます…",
    en: "Loading…"
  },

  store_profile_login_required: {
    ja: "店舗・施設アカウントでログインしてから開いてください。",
    en: "Please log in with your business account first."
  },

  store_profile_not_found: {
    ja: "この店舗・施設の情報を開けませんでした。店舗・施設アカウントの画面から開き直してください。",
    en: "This shop or facility could not be opened. Please open it again from your business account page."
  },

  store_profile_basic_heading: {
    ja: "店舗・施設",
    en: "Shop / facility"
  },

  store_profile_location_label: {
    ja: "所在地",
    en: "Location"
  },

  store_profile_name_location_note: {
    ja: "店舗・施設名と所在地は、ここでは変更できません（変更方法は準備中です）。",
    en: "The name and location can't be changed here (a change process is being prepared)."
  },

  store_profile_description_label: {
    ja: "紹介文",
    en: "Description"
  },

  store_profile_description_hint: {
    ja: "お店・施設の特徴や、旅行者に知ってほしいことを書いてください（1,000文字まで）。",
    en: "Describe your shop or facility and what travelers should know (up to 1,000 characters)."
  },

  store_profile_hours_heading: {
    ja: "営業時間",
    en: "Opening hours"
  },

  store_profile_hours_enable: {
    ja: "営業時間を設定する",
    en: "Set opening hours"
  },

  store_profile_hours_hint: {
    ja: "曜日ごとに最大2つの時間帯を設定できます。閉店が翌日になる場合は、そのまま翌日の時刻を入れてください（例：18:00〜02:00）。",
    en: "You can set up to two time ranges per day. If you close after midnight, enter the next-day time as is (e.g. 18:00–02:00)."
  },

  store_profile_hours_note_label: {
    ja: "営業時間の補足",
    en: "Note on opening hours"
  },

  store_profile_hours_note_hint: {
    ja: "例：祝日は不定休、ラストオーダー21:30（100文字まで）",
    en: "e.g. Irregular holidays, last order 21:30 (up to 100 characters)"
  },

  store_profile_day_mon: {
    ja: "月曜日",
    en: "Monday"
  },

  store_profile_day_tue: {
    ja: "火曜日",
    en: "Tuesday"
  },

  store_profile_day_wed: {
    ja: "水曜日",
    en: "Wednesday"
  },

  store_profile_day_thu: {
    ja: "木曜日",
    en: "Thursday"
  },

  store_profile_day_fri: {
    ja: "金曜日",
    en: "Friday"
  },

  store_profile_day_sat: {
    ja: "土曜日",
    en: "Saturday"
  },

  store_profile_day_sun: {
    ja: "日曜日",
    en: "Sunday"
  },

  store_profile_day_closed: {
    ja: "定休日",
    en: "Closed"
  },

  store_profile_day_allday: {
    ja: "24時間",
    en: "Open 24 hours"
  },

  store_profile_add_range: {
    ja: "＋ 時間帯を追加",
    en: "+ Add time range"
  },

  store_profile_contact_heading: {
    ja: "連絡先・リンク",
    en: "Contact & links"
  },

  store_profile_phone_label: {
    ja: "電話番号",
    en: "Phone number"
  },

  store_profile_website_label: {
    ja: "Webサイト",
    en: "Website"
  },

  store_profile_reservation_label: {
    ja: "予約ページ",
    en: "Reservation page"
  },

  store_profile_social_label: {
    ja: "SNS（最大3件）",
    en: "Social media (up to 3)"
  },

  store_profile_social_add: {
    ja: "＋ SNSを追加",
    en: "+ Add social media"
  },

  store_profile_social_hint: {
    ja: "SNSの種類を選んで、ページのURLを入れてください。",
    en: "Choose the type and enter the page URL."
  },

  store_profile_social_remove: {
    ja: "削除",
    en: "Remove"
  },

  store_profile_social_instagram: {
    ja: "Instagram",
    en: "Instagram"
  },

  store_profile_social_x: {
    ja: "X",
    en: "X"
  },

  store_profile_social_facebook: {
    ja: "Facebook",
    en: "Facebook"
  },

  store_profile_social_tiktok: {
    ja: "TikTok",
    en: "TikTok"
  },

  store_profile_social_youtube: {
    ja: "YouTube",
    en: "YouTube"
  },

  store_profile_social_threads: {
    ja: "Threads",
    en: "Threads"
  },

  store_profile_social_line: {
    ja: "LINE",
    en: "LINE"
  },

  store_profile_social_other: {
    ja: "その他",
    en: "Other"
  },

  store_profile_payment_heading: {
    ja: "支払い方法",
    en: "Payment methods"
  },

  store_profile_payment_cash: {
    ja: "現金",
    en: "Cash"
  },

  store_profile_payment_card: {
    ja: "クレジットカード",
    en: "Credit card"
  },

  store_profile_payment_qr: {
    ja: "QRコード決済",
    en: "QR code payment"
  },

  store_profile_save_button: {
    ja: "下書きを保存する",
    en: "Save draft"
  },

  store_profile_reload_button: {
    ja: "最新の内容を読み込む",
    en: "Load the latest version"
  },

  store_profile_back_to_account: {
    ja: "← 店舗・施設アカウントへ戻る",
    en: "← Back to your business account"
  },

  store_profile_saved: {
    ja: "下書きを保存しました。まだ旅行者には表示されません。",
    en: "Draft saved. It is not shown to travelers yet."
  },

  store_profile_not_editable_pending_review: {
    ja: "この店舗・施設は運営が確認中のため、まだ編集できません。",
    en: "This shop or facility is under review, so it can't be edited yet."
  },

  store_profile_not_editable_rejected: {
    ja: "この店舗・施設の登録はご利用いただけないため、編集できません。",
    en: "This registration can't be used, so it can't be edited."
  },

  store_profile_not_editable_suspended: {
    ja: "この店舗・施設は停止中のため、編集できません。",
    en: "This shop or facility is suspended, so it can't be edited."
  },

  store_profile_not_editable_other: {
    ja: "この店舗・施設は現在編集できません。",
    en: "This shop or facility can't be edited right now."
  },

  store_profile_err_not_editable: {
    ja: "この店舗・施設は現在編集できません。",
    en: "This shop or facility can't be edited right now."
  },

  store_profile_err_conflict: {
    ja: "別の画面で先に保存されています。最新の内容を読み込んでから、もう一度保存してください。",
    en: "This was saved from another screen first. Please load the latest version, then save again."
  },

  store_profile_err_content: {
    ja: "掲載できない表現が含まれている可能性があります。紹介文・営業時間の補足を見直してください。",
    en: "The text may contain content that can't be published. Please review the description and the opening-hours note."
  },

  store_profile_err_safety_unavailable: {
    ja: "ただいま内容を確認できないため、保存できませんでした。時間をおいてお試しください。",
    en: "We can't check the content right now, so it was not saved. Please try again later."
  },

  store_profile_err_description: {
    ja: "紹介文は1,000文字以内で入力してください。",
    en: "Please keep the description within 1,000 characters."
  },

  store_profile_err_phone: {
    ja: "電話番号の形式を確認してください。",
    en: "Please check the phone number format."
  },

  store_profile_err_website: {
    ja: "WebサイトのURLを確認してください（https:// から始まるURL）。",
    en: "Please check the website URL (starting with https://)."
  },

  store_profile_err_reservation: {
    ja: "予約ページのURLを確認してください（https:// から始まるURL）。",
    en: "Please check the reservation page URL (starting with https://)."
  },

  store_profile_err_social: {
    ja: "SNSのURLを確認してください（https:// から始まるURL、最大3件）。",
    en: "Please check the social media URLs (starting with https://, up to 3)."
  },

  store_profile_err_hours_note: {
    ja: "営業時間の補足は1行・100文字以内で入力してください。",
    en: "Please keep the opening-hours note to one line and 100 characters."
  },

  store_profile_err_hours: {
    ja: "営業時間を確認してください。開始と終了の両方を入れ、時間帯が重ならないようにしてください。定休日は「定休日」を選んでください。",
    en: "Please check the opening hours. Enter both start and end, without overlapping ranges. For days off, choose \"Closed\"."
  },

  store_profile_edit_link: {
    ja: "常設店舗情報を編集する",
    en: "Edit shop profile"
  },

  store_feature_parking: {
    ja: "駐車場あり",
    en: "Parking"
  },

  store_feature_free_wifi: {
    ja: "無料Wi-Fi",
    en: "Free Wi-Fi"
  },

  store_feature_power_outlets: {
    ja: "電源あり",
    en: "Power outlets"
  },

  store_feature_wheelchair_accessible: {
    ja: "車いす対応",
    en: "Wheelchair accessible"
  },

  store_feature_kid_friendly: {
    ja: "子ども連れ歓迎",
    en: "Kid-friendly"
  },

  store_feature_pet_friendly: {
    ja: "ペット同伴可",
    en: "Pet-friendly"
  },

  store_feature_dine_in: {
    ja: "店内飲食",
    en: "Dine-in"
  },

  store_feature_takeout: {
    ja: "テイクアウト",
    en: "Takeout"
  },

  store_feature_delivery: {
    ja: "配送・デリバリー",
    en: "Delivery"
  },

  store_feature_store_pickup: {
    ja: "店頭受取",
    en: "In-store pickup"
  },

  store_feature_tax_free: {
    ja: "免税対応",
    en: "Tax-free shopping"
  },

  store_profile_features_heading: {
    ja: "設備・サービス",
    en: "Facilities & services"
  },

  store_profile_features_hint: {
    ja: "あるものだけチェックしてください。チェックしない項目は「未登録」として扱われ、旅行者に「なし」とは表示されません。",
    en: "Check only what you offer. Unchecked items are treated as \"not provided\" and will never be shown to travelers as \"not available\"."
  },

  store_profile_features_primary: {
    ja: "よく使われる項目",
    en: "Common for your category"
  },

  store_profile_features_more: {
    ja: "その他の項目",
    en: "More items"
  },

  store_profile_languages_heading: {
    ja: "対応言語",
    en: "Languages spoken"
  },

  store_profile_languages_hint: {
    ja: "お店・施設で対応できる言語を選んでください。",
    en: "Choose the languages your staff can speak with customers."
  },

  // STEP 44-A｜月額100円カスタマイズ(店主の編集画面 store_custom_*・旅行者の詳細 shop_custom_*)。
  // STEP 44-B｜月額100円プランの申込・解約(店主の編集画面)。
  store_custom_plan_none_signup: {
    ja: "未契約です。申し込むと、メニュー・商品紹介、追加リンク、お店のこだわり・ストーリーを編集して旅行者に紹介できます。",
    en: "Not subscribed. Subscribe to edit your menu and products, extra links and story, and show them to travelers."
  },

  store_custom_plan_canceling: {
    ja: "解約手続き済みです。{date}までは利用でき、その後は有料の内容を旅行者に表示しません（データは残ります）。",
    en: "Cancellation requested. You can use the plan until {date}; after that, the paid content is no longer shown to travelers (your data is kept)."
  },

  store_custom_plan_expired: {
    ja: "利用期限（{date}）が終了しました。有料の内容は旅行者に表示されていません。",
    en: "The plan ended on {date}. The paid content is not shown to travelers."
  },

  store_custom_plan_other_active: {
    ja: "このお店の月額100円プランは、別のアカウントが契約しています。このアカウントでは有料の欄を編集できません。",
    en: "This shop's monthly ¥100 plan belongs to another account. This account cannot edit the paid sections."
  },

  store_custom_plan_other_inactive: {
    ja: "以前の契約は、このアカウントには引き継がれません。利用するには、このアカウントで新しく申し込んでください。",
    en: "The previous plan is not transferred to this account. To use the plan, subscribe with this account."
  },

  store_custom_plan_dates_subscribed: {
    ja: "申込：{date}",
    en: "Subscribed: {date}"
  },

  store_custom_plan_dates_until: {
    ja: "利用期限：{date}",
    en: "Available until: {date}"
  },

  store_custom_plan_dates_canceled: {
    ja: "解約手続き：{date}",
    en: "Cancellation requested: {date}"
  },

  store_custom_plan_trial_note: {
    ja: "現在は試験運用中です。申し込んでも料金は請求されません。利用期限は申込から1か月です（試験用の仮の期限）。",
    en: "This is a trial. You will not be charged. The plan is available for one month from sign-up (a temporary trial period)."
  },

  store_custom_plan_card_required: {
    ja: "申し込むには、お支払い方法（クレジットカード）の登録が必要です。",
    en: "A registered payment method (credit card) is required to subscribe."
  },

  store_custom_plan_card_link: {
    ja: "カードを登録する →",
    en: "Register a card →"
  },

  store_custom_plan_subscribe_button: {
    ja: "月額100円プランを申し込む",
    en: "Subscribe to the monthly ¥100 plan"
  },

  store_custom_plan_reactivate_button: {
    ja: "解約を取り消して続ける",
    en: "Undo cancellation and continue"
  },

  store_custom_plan_cancel_button: {
    ja: "解約する",
    en: "Cancel the plan"
  },

  store_custom_plan_cancel_confirm: {
    ja: "月額100円プランを解約しますか？利用期限までは使えます。期限後は有料の内容を旅行者に表示しません（データは残ります）。",
    en: "Cancel the monthly ¥100 plan? You can use it until the end date. After that, the paid content is not shown to travelers (your data is kept)."
  },

  store_custom_plan_subscribed: {
    ja: "申し込みました。{date}まで利用できます。",
    en: "Subscribed. Available until {date}."
  },

  store_custom_plan_reactivated: {
    ja: "解約を取り消しました。{date}まで利用できます。",
    en: "Cancellation undone. Available until {date}."
  },

  store_custom_plan_canceled: {
    ja: "解約手続きをしました。{date}までは利用できます。",
    en: "Cancellation requested. You can use the plan until {date}."
  },

  store_custom_plan_already_canceled: {
    ja: "すでに解約手続き済みです（{date}まで利用できます）。",
    en: "Cancellation was already requested (available until {date})."
  },

  store_custom_plan_err_card: {
    ja: "申し込むには、お支払い方法（クレジットカード）の登録が必要です。",
    en: "A registered payment method (credit card) is required to subscribe."
  },

  store_custom_plan_err_already: {
    ja: "このお店はすでに月額100円プランを契約しています。",
    en: "This shop already has the monthly ¥100 plan."
  },

  store_custom_plan_err_unavailable: {
    ja: "月額100円プランの申し込みは、現在受け付けていません。",
    en: "Sign-up for the monthly ¥100 plan is not available right now."
  },

  store_custom_plan_err_not_active: {
    ja: "解約できる契約がありません。",
    en: "There is no active plan to cancel."
  },

  // STEP 44-C③｜本番の暦月契約・未払いの表示(店主の編集画面)。
  store_custom_plan_monthly_active: {
    ja: "契約中です（解約するまで毎月継続します）。各月の100円（税込）は月末に締めて、翌月2日に請求します。",
    en: "Your plan is active and renews monthly until you cancel. Each month's ¥100 (tax included) is closed at month end and charged on the 2nd of the next month."
  },

  store_custom_plan_monthly_canceling: {
    ja: "解約手続き済みです。{date}（今月末）まで利用でき、翌月からは料金が発生しません。今月分の100円は請求されます。",
    en: "Cancellation requested. You can use the plan until {date} (end of this month); no charges from next month. This month's ¥100 is still charged."
  },

  store_custom_plan_monthly_trial_note: {
    ja: "（試験用の契約のため、実際には請求されません）",
    en: "(This is a trial contract; you will not actually be charged.)"
  },

  store_custom_plan_past_due: {
    ja: "お支払いが確認できていない料金があります。お支払いが完了しないまま一定期間が過ぎると、有料の内容の表示を停止します（データは残ります）。",
    en: "There is an unpaid charge. If it remains unpaid for a certain period, the paid content will stop being shown (your data is kept)."
  },

  store_custom_plan_suspended: {
    ja: "未払いのため、有料の内容の表示を停止しています（データは残っています）。お支払いが完了すると再開できます。",
    en: "The paid content is stopped because of an unpaid charge (your data is kept). It can resume once the payment is completed."
  },

  store_custom_plan_err_unpaid: {
    ja: "お支払いが確認できていない料金があるため、この操作はできません。",
    en: "This action is not available because there is an unpaid charge."
  },

  // STEP 44-C④｜月額100円カスタマイズのご請求・未払い・本人認証(店舗アカウント画面)。
  store_plan_pay_heading: {
    ja: "月額100円カスタマイズのご請求",
    en: "Monthly ¥100 customization charges"
  },

  store_plan_pay_intro: {
    ja: "各月の100円（税込）は月末に締めて、翌月2日に登録のカードへ請求します。",
    en: "Each month's ¥100 (tax included) is closed at month end and charged to your registered card on the 2nd of the next month."
  },

  store_plan_pay_unpaid_total: {
    ja: "未払い：{amount}円",
    en: "Unpaid: ¥{amount}"
  },

  store_plan_pay_line: {
    ja: "{month}　{store}　{amount}円（税込）",
    en: "{month}  {store}  ¥{amount} (tax incl.)"
  },

  store_plan_pay_test_badge: {
    ja: "（試験用の請求）",
    en: "(test charge)"
  },

  store_plan_pay_status_closed: {
    ja: "請求予定（{date}）",
    en: "Scheduled ({date})"
  },

  store_plan_pay_status_charging: {
    ja: "請求の処理中です。",
    en: "The charge is being processed."
  },

  store_plan_pay_status_processing: {
    ja: "決済の処理中です。",
    en: "The payment is processing."
  },

  store_plan_pay_status_requires_action: {
    ja: "本人認証が必要です。下のボタンから認証して支払いを完了してください。",
    en: "Authentication is required. Use the button below to authenticate and complete the payment."
  },

  store_plan_pay_status_payment_failed: {
    ja: "お支払いができませんでした。",
    en: "The payment could not be completed."
  },

  store_plan_pay_status_review: {
    ja: "マチナウ運営が確認しています。",
    en: "Machinau is reviewing this charge."
  },

  store_plan_pay_status_paid: {
    ja: "お支払い済み（{date}）",
    en: "Paid ({date})"
  },

  store_plan_pay_next_retry: {
    ja: "次の自動の再請求：{date}",
    en: "Next automatic retry: {date}"
  },

  store_plan_pay_suspend_at: {
    ja: "{date}までにお支払いが確認できない場合、有料の内容の表示を停止します（データは残ります）。",
    en: "If payment is not confirmed by {date}, the paid content will stop being shown (your data is kept)."
  },

  store_plan_pay_authenticate: {
    ja: "本人認証をして支払う",
    en: "Authenticate and pay"
  },

  store_plan_pay_pay_now: {
    ja: "今すぐ支払う",
    en: "Pay now"
  },

  store_plan_pay_processing: {
    ja: "処理しています…",
    en: "Processing…"
  },

  store_plan_pay_done: {
    ja: "お支払いが完了しました。",
    en: "Payment completed."
  },

  store_plan_pay_auth_incomplete: {
    ja: "本人認証が完了していません。もう一度お試しください。",
    en: "Authentication was not completed. Please try again."
  },

  store_plan_pay_failed: {
    ja: "お支払いができませんでした。カードを確認してください。",
    en: "The payment could not be completed. Please check your card."
  },

  store_plan_pay_error: {
    ja: "お支払いの操作ができませんでした。時間をおいてもう一度お試しください。",
    en: "The payment action could not be completed. Please try again later."
  },

  store_plan_pay_unavailable: {
    ja: "現在、お支払いの操作は利用できません。",
    en: "Payment actions are not available right now."
  },

  store_custom_heading: {
    ja: "月額100円カスタマイズ",
    en: "Monthly ¥100 customization"
  },

  store_custom_intro: {
    ja: "無料の店舗情報に加えて、メニュー・商品紹介、追加リンク、お店のこだわり・ストーリーを旅行者に紹介できます。無料の店舗情報（紹介文・写真10枚・営業時間など）はこれまでどおり無料です。",
    en: "In addition to your free shop information, you can show travelers your menu and products, extra links, and your shop's story. Your free shop information (description, 10 photos, hours, etc.) stays free."
  },

  store_custom_plan_active: {
    ja: "契約中です。{date}まで、保存した内容を旅行者に表示します。",
    en: "Your plan is active. Saved content is shown to travelers until {date}."
  },

  store_custom_plan_none: {
    ja: "このお店は月額100円カスタマイズを契約していません。申し込みの受付は準備中です。",
    en: "This shop does not have the monthly ¥100 customization. Sign-up is being prepared."
  },

  store_custom_plan_kept: {
    ja: "保存済みの内容は削除されていません。契約中だけ旅行者に表示されます。",
    en: "Your saved content has not been deleted. It is shown to travelers only while the plan is active."
  },

  store_custom_not_editable: {
    ja: "この店舗は現在編集できません。",
    en: "This shop cannot be edited right now."
  },

  store_custom_story_label: {
    ja: "お店のこだわり・ストーリー",
    en: "Our story"
  },

  store_custom_story_hint: {
    ja: "お店の歴史・こだわり・大切にしていることなどを紹介できます（{max}字まで）。",
    en: "Share your shop's history, what you care about, and what makes you special (up to {max} characters)."
  },

  store_custom_menu_label: {
    ja: "メニュー・商品紹介",
    en: "Menu and products"
  },

  store_custom_menu_hint: {
    ja: "最大{max}件。商品名は必須、価格と説明は任意です（空欄の項目は表示しません）。写真は1商品に1枚、お店全体で{photos}枚までです（写真の無い商品も登録できます）。",
    en: "Up to {max} items. A name is required; price and description are optional (empty fields are not shown). One photo per item, up to {photos} photos for the whole shop (items without a photo are fine)."
  },

  store_custom_menu_photo_count: {
    ja: "商品写真 {n} / {max}枚",
    en: "Item photos {n} / {max}"
  },

  store_custom_err_photo_max: {
    ja: "商品写真はお店全体で{max}枚までです。ほかの商品の写真を外してから追加してください。",
    en: "You can add up to {max} item photos for the whole shop. Remove a photo from another item first."
  },

  store_custom_menu_add: {
    ja: "＋ 商品を追加",
    en: "+ Add an item"
  },

  store_custom_menu_item_title: {
    ja: "商品 {n}",
    en: "Item {n}"
  },

  store_custom_menu_name: {
    ja: "商品名",
    en: "Name"
  },

  store_custom_menu_price: {
    ja: "価格（任意）",
    en: "Price (optional)"
  },

  store_custom_menu_price_placeholder: {
    ja: "例：¥650",
    en: "e.g. ¥650"
  },

  store_custom_menu_description: {
    ja: "説明（任意）",
    en: "Description (optional)"
  },

  store_custom_menu_photo_add: {
    ja: "写真を選ぶ",
    en: "Choose a photo"
  },

  store_custom_menu_photo_change: {
    ja: "写真を変える",
    en: "Change photo"
  },

  store_custom_menu_photo_remove: {
    ja: "写真を外す",
    en: "Remove photo"
  },

  store_custom_menu_up: {
    ja: "↑ 上へ",
    en: "↑ Up"
  },

  store_custom_menu_down: {
    ja: "↓ 下へ",
    en: "↓ Down"
  },

  store_custom_menu_remove: {
    ja: "この商品を削除",
    en: "Delete this item"
  },

  store_custom_links_label: {
    ja: "追加リンク（SNS・予約先など）",
    en: "Extra links (social media, booking, etc.)"
  },

  store_custom_links_hint: {
    ja: "最大{max}件。https:// で始まるURLだけ登録できます。表示名は任意です（空欄なら種類の名前を表示）。",
    en: "Up to {max} links. Only URLs starting with https:// can be added. The label is optional (the link type is shown if empty)."
  },

  store_custom_links_add: {
    ja: "＋ リンクを追加",
    en: "+ Add a link"
  },

  store_custom_link_label_placeholder: {
    ja: "表示名（任意）",
    en: "Label (optional)"
  },

  store_custom_link_remove: {
    ja: "削除",
    en: "Remove"
  },

  store_custom_link_type_instagram: {
    ja: "Instagram",
    en: "Instagram"
  },

  store_custom_link_type_website: {
    ja: "公式サイト",
    en: "Official website"
  },

  store_custom_link_type_reservation: {
    ja: "予約ページ",
    en: "Booking"
  },

  store_custom_link_type_x: {
    ja: "X",
    en: "X"
  },

  store_custom_link_type_facebook: {
    ja: "Facebook",
    en: "Facebook"
  },

  store_custom_link_type_tiktok: {
    ja: "TikTok",
    en: "TikTok"
  },

  store_custom_link_type_youtube: {
    ja: "YouTube",
    en: "YouTube"
  },

  store_custom_link_type_line: {
    ja: "LINE",
    en: "LINE"
  },

  store_custom_link_type_other: {
    ja: "その他のリンク",
    en: "Other link"
  },

  store_custom_save_button: {
    ja: "カスタマイズを保存する",
    en: "Save customization"
  },

  store_custom_saving_button: {
    ja: "保存しています…",
    en: "Saving…"
  },

  store_custom_saved: {
    ja: "保存しました。",
    en: "Saved."
  },

  store_custom_err_plan: {
    ja: "月額100円カスタマイズの契約が無いため保存できません。",
    en: "You cannot save because this shop does not have the monthly ¥100 customization."
  },

  store_custom_err_menu: {
    ja: "メニュー・商品の内容を確認してください。",
    en: "Please check your menu items."
  },

  store_custom_err_name: {
    ja: "{item}：商品名を入力してください（{max}字まで・改行なし）。",
    en: "{item}: enter a name (up to {max} characters, single line)."
  },

  store_custom_err_description: {
    ja: "{item}：説明が長すぎます（{max}字まで）。",
    en: "{item}: the description is too long (up to {max} characters)."
  },

  store_custom_err_price: {
    ja: "{item}：価格が長すぎます（{max}字まで・改行なし）。",
    en: "{item}: the price is too long (up to {max} characters, single line)."
  },

  store_custom_err_photo: {
    ja: "{item}：写真をもう一度選んでください。",
    en: "{item}: please choose the photo again."
  },

  store_custom_err_link: {
    ja: "リンク{n}：https:// で始まる正しいURLを入力してください（表示名は{max}字まで）。",
    en: "Link {n}: enter a valid URL starting with https:// (label up to {max} characters)."
  },

  store_custom_err_story: {
    ja: "ストーリーが長すぎるか、使えない文字が含まれています（{max}字まで）。",
    en: "The story is too long or contains characters that cannot be used (up to {max} characters)."
  },

  store_custom_err_content: {
    ja: "掲載できない可能性がある表現が含まれているため、保存できませんでした。内容を見直してください。",
    en: "Your text could not be saved because it may contain content we cannot publish. Please review it."
  },

  store_custom_err_photo_content: {
    ja: "掲載できない可能性がある写真が含まれているため、保存できませんでした。写真を見直してください。",
    en: "A photo could not be saved because it may contain content we cannot publish. Please review your photos."
  },

  store_custom_load_error: {
    ja: "月額100円カスタマイズの情報を読み込めませんでした。時間をおいて再読み込みしてください。",
    en: "Could not load the customization information. Please reload later."
  },

  shop_custom_story_heading: {
    ja: "お店のこだわり・ストーリー",
    en: "Our story"
  },

  shop_custom_menu_heading: {
    ja: "メニュー・商品",
    en: "Menu and products"
  },

  shop_custom_links_heading: {
    ja: "リンク",
    en: "Links"
  },

  store_profile_photos_heading: {
    ja: "写真",
    en: "Photos"
  },

  store_profile_photos_hint: {
    ja: "1枚目がメイン写真になります。JPEG・PNG・WebPで1枚10MBまで、最大10枚まで登録できます。写真は、店舗情報を保存した時にアップロードされます。",
    en: "The first photo is the main photo. JPEG, PNG or WebP, up to 10 MB each, up to 10 photos. Photos are uploaded when you save your shop information."
  },

  store_profile_photos_count: {
    ja: "{n} / {max}枚",
    en: "{n} / {max} photos"
  },

  store_profile_photos_add: {
    ja: "＋ 写真を追加",
    en: "+ Add photos"
  },

  store_profile_photos_main_badge: {
    ja: "メイン",
    en: "Main"
  },

  store_profile_photos_make_main: {
    ja: "メインにする",
    en: "Make main"
  },

  store_profile_photos_move_left: {
    ja: "◀ 前へ",
    en: "◀ Earlier"
  },

  store_profile_photos_move_right: {
    ja: "後へ ▶",
    en: "Later ▶"
  },

  store_profile_photos_remove: {
    ja: "削除",
    en: "Remove"
  },

  store_profile_photos_preparing: {
    ja: "準備中…",
    en: "Preparing…"
  },

  store_profile_photos_progress_prepare: {
    ja: "写真を準備しています…",
    en: "Preparing photos…"
  },

  store_profile_photos_progress_upload: {
    ja: "写真をアップロードしています（{done}/{total}枚）…",
    en: "Uploading photos ({done}/{total})…"
  },

  store_profile_photos_progress_saving: {
    ja: "写真の安全確認と保存をしています…",
    en: "Checking the photos and saving…"
  },

  store_profile_progress_saving: {
    ja: "保存しています…",
    en: "Saving…"
  },

  store_profile_saving_button: {
    ja: "保存中…（そのままお待ちください）",
    en: "Saving… (please wait)"
  },

  store_profile_photos_err_type: {
    ja: "写真はJPEG・PNG・WebPで、1枚10MBまでのものを選んでください。",
    en: "Please choose JPEG, PNG or WebP photos up to 10 MB each."
  },

  store_profile_photos_err_max: {
    ja: "写真は最大10枚までです。",
    en: "You can add up to 10 photos."
  },

  store_profile_photos_err_prepare: {
    ja: "写真を読み込めませんでした。別の写真をお試しください。",
    en: "This photo could not be read. Please try another photo."
  },

  store_profile_photos_err_upload: {
    ja: "写真をアップロードできませんでした。通信状況を確認して、もう一度保存してください。",
    en: "The photos could not be uploaded. Please check your connection and save again."
  },

  store_profile_photos_err_content: {
    ja: "掲載できない可能性がある写真が含まれていたため、保存しませんでした。新しく追加した写真を見直してから、もう一度保存してください。",
    en: "Some photos may not be suitable for publishing, so nothing was saved. Please review the newly added photos and save again."
  },

  store_profile_publish_heading: {
    ja: "旅行者への公開",
    en: "Showing to travelers"
  },

  store_profile_publish_state_draft: {
    ja: "非公開（下書き）",
    en: "Not public (draft)"
  },

  store_profile_publish_state_published: {
    ja: "公開中",
    en: "Public"
  },

  store_profile_publish_state_blocked: {
    ja: "公開条件を満たしていないため表示されていません",
    en: "Not shown because the publishing conditions are not met"
  },

  store_profile_publish_note_draft: {
    ja: "公開するまで、この情報は旅行者に表示されません。",
    en: "Travelers won't see this information until you publish it."
  },

  store_profile_publish_note_published: {
    ja: "公開の設定が完了しています。旅行者向け画面への表示は準備中です。",
    en: "Publishing is turned on. Display on the traveler pages is being prepared."
  },

  store_profile_publish_note_blocked: {
    ja: "下の条件をすべて満たすと、操作しなくても表示に戻ります。",
    en: "Once all the conditions below are met, it will be shown again automatically."
  },

  store_profile_publish_checklist_heading: {
    ja: "公開の条件（保存済みの内容で確認します）",
    en: "Conditions for publishing (checked against the saved content)"
  },

  store_profile_publish_cond_photo: {
    ja: "写真が1枚以上ある",
    en: "At least one photo"
  },

  store_profile_publish_cond_description: {
    ja: "紹介文がある",
    en: "A description"
  },

  store_profile_publish_cond_moderation: {
    ja: "保存した内容の確認が済んでいる",
    en: "The saved content has been checked"
  },

  store_profile_publish_cond_owner: {
    ja: "あなたがこの店舗・施設の管理者（オーナー）として有効",
    en: "You are an active owner of this business"
  },

  store_profile_publish_cond_store_active: {
    ja: "店舗・施設の状態が有効",
    en: "The business is active"
  },

  store_profile_publish_cond_location: {
    ja: "所在地の位置情報が有効",
    en: "The location is valid"
  },

  store_profile_publish_cond_country: {
    ja: "公開できる地域にある（現在は日本国内の店舗・施設のみ）",
    en: "In a supported area (currently businesses in Japan only)"
  },

  store_profile_publish_cond_duplicates: {
    ja: "同じ店舗・施設の可能性がある掲載が解決している",
    en: "Possible duplicate listings are resolved"
  },

  store_profile_publish_fix_photo: {
    ja: "「写真」に1枚以上追加して保存してください。",
    en: "Add at least one photo and save."
  },

  store_profile_publish_fix_description: {
    ja: "「紹介文」を入力して保存してください。",
    en: "Enter a description and save."
  },

  store_profile_publish_fix_moderation: {
    ja: "内容をもう一度保存してください。",
    en: "Please save the content again."
  },

  store_profile_publish_fix_owner: {
    ja: "運営へお問い合わせください。",
    en: "Please contact the Machinau team."
  },

  store_profile_publish_fix_store_active: {
    ja: "運営の確認が終わるまでお待ちください。停止中の場合は運営へお問い合わせください。",
    en: "Please wait until the Machinau team finishes its review. If the business is suspended, please contact the Machinau team."
  },

  store_profile_publish_fix_location: {
    ja: "運営へお問い合わせください。",
    en: "Please contact the Machinau team."
  },

  store_profile_publish_fix_country: {
    ja: "現在は日本国内の店舗・施設だけを公開できます。",
    en: "Currently only businesses in Japan can be published."
  },

  store_profile_publish_fix_duplicates: {
    ja: "マチナウに掲載中の同じ店舗・施設がある可能性があります。運営へお問い合わせください。",
    en: "The same business may already be listed on Machinau. Please contact the Machinau team."
  },

  store_profile_publish_save_first: {
    ja: "保存していない変更があります。先に保存してから公開してください。",
    en: "You have unsaved changes. Please save them before publishing."
  },

  store_profile_publish_button: {
    ja: "旅行者に公開する",
    en: "Publish to travelers"
  },

  store_profile_unpublish_button: {
    ja: "非公開に戻す",
    en: "Make private"
  },

  store_profile_publish_confirm: {
    ja: "保存済みの内容を旅行者に公開します。よろしいですか？",
    en: "Publish the saved content to travelers?"
  },

  store_profile_unpublish_confirm: {
    ja: "旅行者への公開をやめて、非公開（下書き）に戻します。よろしいですか？",
    en: "Stop showing this to travelers and make it private (draft)?"
  },

  store_profile_publishing_button: {
    ja: "確認しています…",
    en: "Checking…"
  },

  store_profile_published_message: {
    ja: "公開しました。",
    en: "Published."
  },

  store_profile_unpublished_message: {
    ja: "非公開に戻しました。",
    en: "It is now private."
  },

  store_profile_publish_err_conditions: {
    ja: "公開の条件を満たしていません。条件の一覧を確認してください。",
    en: "The publishing conditions are not met. Please check the list of conditions."
  },

  store_profile_publish_err_content: {
    ja: "店名または紹介文に、掲載できない可能性がある表現が含まれています。紹介文を見直して保存してください。店名については運営へお問い合わせください。",
    en: "The business name or description may contain content that can't be published. Please review the description and save. For the business name, please contact the Machinau team."
  },

  store_profile_save_button_published: {
    ja: "変更を保存する",
    en: "Save changes"
  },

  store_profile_saved_published: {
    ja: "変更を保存しました。",
    en: "Changes saved."
  },

  store_claim_heading: {
    ja: "このお店を管理する（マチナウに掲載中のお店の引き継ぎ）",
    en: "Manage this business (take over a listing on Machinau)"
  },

  store_claim_linked_notice: {
    ja: "このお店は、すでに別の店舗アカウントが管理しているため、引き継げません。ご不明な点はマチナウ運営へお問い合わせください。",
    en: "This listing is already managed by another store account, so it cannot be taken over. Please contact Machinau if you have questions."
  },

  store_claim_process_note: {
    ja: "クレジットカードを登録済みのアカウントなら、マチナウ運営の確認なしで、すぐに引き継ぎが完了します。掲載中の紹介文・営業時間などは、あなたの店舗情報（下書き）に引き継がれます。旅行者への表示は、店舗情報を公開するまで変わりません。",
    en: "If your account has a registered credit card, the takeover completes right away without a review by Machinau. The listing's description, hours, etc. are copied into your store profile draft. What travelers see does not change until you publish your store profile."
  },

  store_claim_target_label: {
    ja: "どのように引き継ぎますか",
    en: "How do you want to take it over?"
  },

  store_claim_target_new: {
    ja: "新しい店舗として引き継ぐ",
    en: "As a new shop"
  },

  store_claim_target_existing: {
    ja: "登録済みの自分の店舗につなぐ",
    en: "Connect it to a shop I already registered"
  },

  store_claim_role_label: {
    ja: "お店でのお立場",
    en: "Your role at the shop"
  },

  store_claim_role_owner: {
    ja: "オーナー",
    en: "Owner"
  },

  store_claim_role_manager: {
    ja: "店長・責任者",
    en: "Manager"
  },

  store_claim_url_label: {
    ja: "お店の公式サイト・公式SNS（任意）",
    en: "Official website or social media (optional)"
  },

  store_claim_url_hint: {
    ja: "お店の公式サイト・公式SNSがあれば入力してください（記録として残します）。",
    en: "Enter your official website or social account if you have one (kept as a record)."
  },

  store_claim_note_label: {
    ja: "ひとこと（任意・200文字まで）",
    en: "Note (optional, up to 200 characters)"
  },

  store_claim_note_hint: {
    ja: "電話番号やメールアドレスなどの連絡先は書かないでください。",
    en: "Please do not include phone numbers, email addresses or other contact details."
  },

  store_claim_submit: {
    ja: "このお店を引き継ぐ",
    en: "Take over this listing"
  },

  store_claim_code_title: {
    ja: "申請コード",
    en: "Request code"
  },

  store_claim_code_hint: {
    ja: "マチナウ運営からお店の公式連絡先へ確認の連絡が届いた時に、このコードの申請であることを確かめてください。このコードを他の人に教えないでください。",
    en: "When Machinau contacts the shop through its official contact details, please check that it refers to this code. Do not share this code with others."
  },

  store_claim_mine_heading: {
    ja: "あなたのオーナー申請",
    en: "Your owner requests"
  },

  store_claim_mine_empty: {
    ja: "オーナー申請はまだありません。",
    en: "No owner requests yet."
  },

  store_claim_status_pending: {
    ja: "運営確認中",
    en: "Under review"
  },

  store_claim_status_approved: {
    ja: "引き継ぎ完了",
    en: "Completed"
  },

  store_claim_status_rejected: {
    ja: "承認されませんでした",
    en: "Not approved"
  },

  store_claim_status_withdrawn: {
    ja: "取り下げ済み",
    en: "Withdrawn"
  },

  store_claim_status_note_pending: {
    ja: "マチナウ運営が、お店の公式連絡先で確認しています。",
    en: "Machinau is checking with the shop's official contact details."
  },

  store_claim_status_note_approved: {
    ja: "このお店の正式な管理者になりました。お店の情報は「あなたの店舗・施設」から管理できます。旅行者への表示はまだ変わりません。",
    en: "You are now the official manager of this shop. Manage it from \"Your shops & facilities\". What travelers see has not changed yet."
  },

  store_claim_status_note_rejected: {
    ja: "お店の公式連絡先で確認できなかったため、承認されませんでした。ご不明な点はマチナウ運営へお問い合わせください。",
    en: "We could not confirm this through the shop's official contact details. Please contact Machinau if you have questions."
  },

  store_claim_status_note_withdrawn: {
    ja: "この申請は取り下げられました。",
    en: "This request was withdrawn."
  },

  store_claim_withdraw: {
    ja: "申請を取り下げる",
    en: "Withdraw request"
  },

  store_claim_withdraw_confirm: {
    ja: "この申請を取り下げますか？",
    en: "Withdraw this request?"
  },

  store_claim_withdrawn: {
    ja: "申請を取り下げました。",
    en: "The request was withdrawn."
  },

  store_claim_sent: {
    ja: "オーナー申請を送りました。マチナウ運営の確認をお待ちください。",
    en: "Your owner request was sent. Please wait for Machinau to review it."
  },

  store_claim_pending_exists_info: {
    ja: "このお店へのオーナー申請は、すでに運営確認中です。",
    en: "Your owner request for this shop is already under review."
  },

  // STEP 42-D｜カード登録 → 店舗の登録・引き継ぎ
  store_claim_completed: {
    ja: "引き継ぎが完了しました。お店の情報は「あなたの店舗・施設」から編集・公開できます。",
    en: "The takeover is complete. You can edit and publish the store information from \"Your shops & venues\"."
  },

  store_claim_err_already_linked: {
    ja: "このお店は、すでに別の店舗アカウントが管理しているため、引き継げません。",
    en: "This listing is already managed by another store account and cannot be taken over."
  },

  store_card_gate_needed: {
    ja: "お店の登録・引き継ぎの前に、クレジットカードの登録が必要です（1つのアカウントに1枚、すべての店舗で共通）。",
    en: "Please register a credit card before registering or taking over a store (one card per account, shared by all your stores)."
  },

  store_card_gate_expired: {
    ja: "登録しているクレジットカードの有効期限が切れています。カードを変更してから、もう一度お試しください。",
    en: "Your registered card has expired. Please change the card and try again."
  },

  store_card_gate_unavailable: {
    ja: "現在、カードの登録を受け付けていないため、お店の登録・引き継ぎはできません。",
    en: "Store registration and takeover are not available because card registration is currently unavailable."
  },

  store_card_gate_link: {
    ja: "カードを登録する ↓",
    en: "Register a card ↓"
  },

  // STEP 47 / 47-B｜アカウントの削除(退会)。未請求・未払いがあれば退会を受け付け、ご請求とお支払いの後に削除する
  store_delete_heading: {
    ja: "アカウントの削除",
    en: "Delete account"
  },

  store_delete_intro: {
    ja: "この店舗・施設のアカウントと登録したクレジットカードを、ご自身で削除（退会）できます。まだご請求していない料金や、お支払いが済んでいないご請求がある場合は、退会を受け付けた後、翌月2日のご請求とお支払いが済んでから削除します。",
    en: "You can delete (close) this business account and its registered credit card yourself. If there are fees not yet billed or charges not yet paid, we accept your request first and delete the account after the billing on the 2nd of the following month and its payment are complete."
  },

  store_delete_check_button: {
    ja: "アカウントの削除へ進む",
    en: "Continue to delete account"
  },

  store_delete_confirm_lead: {
    ja: "このアカウントの現在の状況",
    en: "Current status of this account"
  },

  store_delete_summary_stores: {
    ja: "店舗・施設",
    en: "Businesses"
  },

  store_delete_summary_published: {
    ja: "公開中",
    en: "published"
  },

  store_delete_summary_posts: {
    ja: "掲載中・審査待ちの今だけ投稿",
    en: "Live or pending \"Now only\" posts"
  },

  store_delete_summary_card: {
    ja: "登録カード",
    en: "Registered card"
  },

  store_delete_summary_card_yes: {
    ja: "あり",
    en: "Yes"
  },

  store_delete_summary_card_no: {
    ja: "なし",
    en: "None"
  },

  store_delete_effects_lead: {
    ja: "削除すると、次のようになります。元に戻すことはできません。",
    en: "Deleting the account will do the following. This cannot be undone."
  },

  store_delete_effect_stores: {
    ja: "あなたの店舗・施設の情報は非公開になり、旅行者には表示されなくなります。",
    en: "Your business information becomes private and is no longer shown to travelers."
  },

  store_delete_effect_posts: {
    ja: "掲載中・審査待ちの今だけ投稿は掲載を終了します。",
    en: "Live and pending \"Now only\" posts are ended."
  },

  store_delete_effect_plan: {
    ja: "新しい今だけ投稿・有料のご利用はできなくなります。ご契約中の有料のプランは解約します（その月の分はご請求します）。",
    en: "New \"Now only\" posts and paid features are no longer available. Any paid plan you have is canceled (that month is still billed)."
  },

  store_delete_effect_card: {
    ja: "登録したクレジットカードを削除します（カード番号はマチナウでは保持していません）。",
    en: "Your registered credit card is removed (Machinau does not keep card numbers)."
  },

  store_delete_effect_photos: {
    ja: "店舗・施設の写真を削除します。",
    en: "Photos of your business are deleted."
  },

  store_delete_effect_login: {
    ja: "このアカウントではログインできなくなります。",
    en: "You will no longer be able to log in with this account."
  },

  store_delete_effect_records: {
    ja: "法令上必要な請求・取引の記録は保存します。",
    en: "Billing and transaction records required by law are kept."
  },

  store_delete_confirm_button: {
    ja: "アカウントを削除する",
    en: "Delete account"
  },

  store_delete_cancel_button: {
    ja: "やめる",
    en: "Cancel"
  },

  store_delete_running: {
    ja: "削除しています…",
    en: "Deleting..."
  },

  store_delete_done: {
    ja: "アカウントを削除しました。ご利用ありがとうございました。",
    en: "Your account has been deleted. Thank you for using Machinau."
  },

  store_delete_pending: {
    ja: "削除の手続きを進めています。登録カードの取り外しがまだ完了していないため、しばらくしてから「アカウントの削除へ進む」からもう一度お試しください。",
    en: "Deletion is in progress. Removal of your registered card has not finished yet, so please try again later from \"Continue to delete account\"."
  },

  store_delete_settlement_note: {
    ja: "まだご請求していない料金、またはお支払いが済んでいないご請求があります。退会を受け付けた時点で店舗・施設の情報は非公開になり、残りのご請求とお支払いが済んだ後に、アカウントとカードを削除します。それまではログインして、ご請求の確認とカードの変更ができます。",
    en: "There are fees not yet billed or charges not yet paid. When we accept your request, your business information becomes private, and the account and card are deleted after the remaining charges are billed and paid. Until then you can log in to check charges and change your card."
  },

  store_delete_request_button: {
    ja: "退会を申し込む（清算の後に削除）",
    en: "Request closure (deleted after settlement)"
  },

  store_delete_accepted: {
    ja: "退会を受け付けました。店舗・施設の情報は非公開にしました。残りのご請求とお支払いが済んだ後に、アカウントとカードを削除します。",
    en: "Your request has been accepted. Your business information is now private. The account and card will be deleted after the remaining charges are billed and paid."
  },

  store_delete_status_awaiting: {
    ja: "退会の手続き中です。残りのご請求とお支払いが済んだ後に、アカウントとカードを削除します。",
    en: "Your account closure is in progress. The account and card will be deleted after the remaining charges are billed and paid."
  },

  store_delete_status_operator: {
    ja: "登録カードの取り外しで問題が起きたため、運営が確認しています。確認が済み次第、削除の手続きを進めます。",
    en: "A problem occurred while removing your registered card, and our team is looking into it. We will continue the deletion once it is resolved."
  },

  store_delete_resume_button: {
    ja: "手続きの状況を確認する",
    en: "Check the status"
  },

  store_delete_err_operator: {
    ja: "運営のアカウントは、この画面からは削除できません。",
    en: "Operator accounts cannot be deleted from this page."
  },

  // STEP 47-C ④｜退会の取り消し(最終削除の開始前だけ)
  store_delete_withdraw_button: {
    ja: "退会を取り消す",
    en: "Withdraw closure request"
  },

  store_delete_withdraw_confirm_lead: {
    ja: "退会の申し込みを取り消します。店舗・施設の情報は非公開のままです。終了した今だけ投稿・解約した有料のプランは元に戻りません。退会の前のご請求は、これまでどおりお支払いが必要です。",
    en: "This withdraws your closure request. Your business information stays private. Ended \"Now only\" posts and canceled paid plans are not restored. Charges from before the request still need to be paid."
  },

  store_delete_withdraw_confirm_button: {
    ja: "取り消しを確定する",
    en: "Confirm withdrawal"
  },

  store_delete_withdrawn: {
    ja: "退会の申し込みを取り消しました。引き続きご利用いただくには、次の操作をお願いします。",
    en: "Your closure request has been withdrawn. To continue using Machinau, please do the following."
  },

  store_delete_withdraw_guide_profile: {
    ja: "店舗・施設の情報は非公開になっています。旅行者に表示するには、店舗の一覧の「常設店舗情報を編集する」から公開してください。",
    en: "Your business information is private. To show it to travelers, publish it from \"Edit shop profile\" in your business list."
  },

  store_delete_withdraw_guide_posts: {
    ja: "今だけ投稿は終了したままです。必要な場合は新しく投稿してください。",
    en: "\"Now only\" posts remain ended. Create a new post if needed."
  },

  store_delete_withdraw_guide_plan: {
    ja: "有料のプランをご契約だった場合は解約されています。続ける場合は、「常設店舗情報を編集する」の画面から申し込み直してください。",
    en: "If you had a paid plan, it has been canceled. To continue, sign up again from the \"Edit shop profile\" page."
  },

  store_delete_withdraw_guide_billing: {
    ja: "退会の前に発生したご請求は、これまでどおりお支払いが必要です。",
    en: "Charges incurred before the request still need to be paid as usual."
  },

  store_delete_withdraw_too_late: {
    ja: "削除の手続きがすでに始まっているため、取り消せませんでした。",
    en: "The deletion has already started, so the request could not be withdrawn."
  },

  store_delete_blocked: {
    ja: "現在はアカウントを削除できません。次の点をご確認ください。",
    en: "This account cannot be deleted right now. Please check the following."
  },

  store_delete_blocker_imadake_invoice: {
    ja: "今だけ投稿のご請求に、お支払いが済んでいないもの、または決済結果が確定していないものがあります。",
    en: "A \"Now only\" post charge is unpaid or its payment result is not yet confirmed."
  },

  store_delete_blocker_imadake_unbilled: {
    ja: "今だけ投稿のまだご請求していない料金があります（月末に締め、翌月2日にご請求します）。",
    en: "There are \"Now only\" post fees not yet billed (closed at month end and billed on the 2nd of the following month)."
  },

  store_delete_blocker_plan_unbilled: {
    ja: "有料のプランのまだご請求していない料金があります（月末に締め、翌月2日にご請求します）。",
    en: "There are paid plan fees not yet billed (closed at month end and billed on the 2nd of the following month)."
  },

  store_delete_blocker_plan_invoice: {
    ja: "有料のプランのご請求に、お支払いが済んでいないもの、または決済結果が確定していないものがあります。",
    en: "A paid plan charge is unpaid or its payment result is not yet confirmed."
  },

  store_delete_blocker_billing_locked: {
    ja: "ご請求の処理中です。",
    en: "A charge is being processed."
  },

  store_delete_blocker_card_unavailable: {
    ja: "現在、登録カードを取り外す手続きができません。お問い合わせください。",
    en: "Your registered card cannot be removed right now. Please contact us."
  },

  store_delete_blocker_other: {
    ja: "削除できない理由があります。お問い合わせください。",
    en: "The account cannot be deleted for another reason. Please contact us."
  },

  store_delete_err_generic: {
    ja: "アカウントを削除できませんでした。時間をおいてもう一度お試しください。",
    en: "The account could not be deleted. Please try again later."
  },

  store_delete_err_rate_limited: {
    ja: "続けて操作されたため、少し時間をおいてからお試しください。",
    en: "Too many attempts in a row. Please wait a moment and try again."
  },

  store_steps_account: {
    ja: "① アカウントを作成",
    en: "1. Create an account"
  },

  store_steps_email: {
    ja: "② メールアドレスを確認",
    en: "2. Verify your email"
  },

  store_steps_card: {
    ja: "③ クレジットカードを登録（1アカウント1枚）",
    en: "3. Register a credit card (one per account)"
  },

  store_steps_register: {
    ja: "④ お店を登録、またはマチナウに掲載中のお店を引き継ぐ",
    en: "4. Register a store, or take over a listing on Machinau"
  },

  modal_claim_link: {
    ja: "このお店の方へ：お店の情報を管理する →",
    en: "Own this business? Manage this listing →"
  },

  store_claim_err_listing_not_found: {
    ja: "このお店の掲載は見つかりませんでした。掲載が終了している可能性があります。",
    en: "This listing could not be found. It may no longer be listed."
  },

  store_claim_err_pending_exists: {
    ja: "このお店へのオーナー申請は、すでに運営確認中です。",
    en: "Your owner request for this shop is already under review."
  },

  store_claim_err_already_yours: {
    ja: "このお店は、すでにあなたの店舗に引き継がれています。",
    en: "This shop has already been taken over by your shop."
  },

  store_claim_err_target: {
    ja: "つなぐ店舗を選んでください（オーナーとして登録済みで、利用中の店舗だけ選べます）。",
    en: "Please choose a shop to connect (only active shops you own can be chosen)."
  },

  store_claim_err_too_many: {
    ja: "確認中の申請が多いため、これ以上申請できません。結果をお待ちください。",
    en: "You have too many requests under review. Please wait for the results."
  },

  store_claim_err_url: {
    ja: "公式サイト・SNSのURLを確認してください（https:// から始まるURL）。",
    en: "Please check the website or social media URL (starting with https://)."
  },

  store_claim_err_note: {
    ja: "ひとことは1行・200文字以内で入力してください。",
    en: "Please keep the note to one line and 200 characters."
  },

  // 今だけ投稿 STEP 2｜TOPの独立枠と詳細表示の固定文言。投稿の見出し・本文・店名・
  // 価格等(店舗が書いた内容)はここでは扱わず、原文のまま表示する。
  imadake_heading: {
    ja: "⏰ 今だけ投稿",
    en: "⏰ Just for Now"
  },

  imadake_lead: {
    ja: "近くのお店・施設が「今」を伝えています（掲載は最長24時間）。",
    en: "Nearby shops and places sharing what's on right now (posted for up to 24 hours)."
  },

  imadake_pr_label: {
    ja: "PR・お店の投稿",
    en: "PR · From the shop"
  },

  imadake_read_more: {
    ja: "続きを見る",
    en: "See more"
  },

  imadake_original_language_note: {
    ja: "お店が書いた原文で表示しています",
    en: "Shown as written by the shop"
  },

  // 今だけ投稿 カード翻訳 STEP 3｜タイトル・紹介文を自動翻訳で表示している時の表示と切り替え。
  imadake_auto_translated: {
    ja: "自動翻訳",
    en: "Automatically translated"
  },

  imadake_show_original: {
    ja: "原文を見る",
    en: "See original"
  },

  imadake_show_translation: {
    ja: "翻訳を見る",
    en: "See translation"
  },

  imadake_expires_in_hours: {
    ja: "掲載あと{HOURS}時間",
    en: "{HOURS}h left"
  },

  imadake_expires_in_minutes: {
    ja: "掲載あと{MINUTES}分",
    en: "{MINUTES} min left"
  },

  imadake_available_until: {
    ja: "{TIME}まで",
    en: "Until {TIME}"
  },

  imadake_distance: {
    ja: "約{KM}km",
    en: "{KM} km away"
  },

  imadake_category_restaurant: {
    ja: "飲食店",
    en: "Restaurant"
  },

  imadake_category_food_shop: {
    ja: "食品・テイクアウト",
    en: "Food & takeout"
  },

  imadake_category_retail: {
    ja: "お店",
    en: "Shop"
  },

  imadake_category_event: {
    ja: "イベント",
    en: "Event"
  },

  imadake_category_other: {
    ja: "その他",
    en: "Other"
  },

  imadake_live_stock_available: {
    ja: "在庫あり",
    en: "In stock"
  },

  imadake_live_stock_few: {
    ja: "残りわずか",
    en: "Almost gone"
  },

  imadake_live_stock_sold_out: {
    ja: "売り切れ",
    en: "Sold out"
  },

  imadake_live_seats_available: {
    ja: "空席あり",
    en: "Seats available"
  },

  imadake_live_seats_few: {
    ja: "残り席わずか",
    en: "Few seats left"
  },

  imadake_live_seats_full: {
    ja: "満席",
    en: "Full"
  },

  imadake_live_tickets_available: {
    ja: "チケットあり",
    en: "Tickets available"
  },

  imadake_live_tickets_few: {
    ja: "チケット残りわずか",
    en: "Few tickets left"
  },

  imadake_live_tickets_sold_out: {
    ja: "チケット売り切れ",
    en: "Tickets sold out"
  },

  imadake_live_quantity: {
    ja: "残り{COUNT}",
    en: "{COUNT} left"
  },

  imadake_detail_loading: {
    ja: "読み込んでいます…",
    en: "Loading…"
  },

  imadake_detail_error: {
    ja: "読み込めませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load this post. Please try again later."
  },

  imadake_detail_retry: {
    ja: "もう一度読み込む",
    en: "Try again"
  },

  imadake_detail_ended: {
    ja: "この今だけ投稿の掲載は終了しました。",
    en: "This post is no longer available."
  },

  imadake_detail_price_label: {
    ja: "価格",
    en: "Price"
  },

  imadake_detail_payment_label: {
    ja: "支払い方法",
    en: "Payment"
  },

  imadake_detail_place_label: {
    ja: "場所",
    en: "Location"
  },

  imadake_detail_event_time_label: {
    ja: "時間",
    en: "Time"
  },

  imadake_detail_event_venue_label: {
    ja: "会場",
    en: "Venue"
  },

  imadake_detail_event_fee_label: {
    ja: "料金",
    en: "Fee"
  },

  imadake_detail_check_note: {
    ja: "価格・在庫・時間などの最新の情報は、お店にご確認ください。",
    en: "Please check the latest prices, availability and times with the shop."
  },

  imadake_payment_cash: {
    ja: "現金",
    en: "Cash"
  },

  imadake_payment_card: {
    ja: "カード",
    en: "Card"
  },

  imadake_payment_qr: {
    ja: "QRコード決済",
    en: "QR code payment"
  },

  imadake_feature_takeout: {
    ja: "テイクアウト可",
    en: "Takeout available"
  },

  imadake_feature_same_day_reservation: {
    ja: "当日予約可",
    en: "Same-day booking"
  },

  imadake_feature_hold_available: {
    ja: "取り置き可",
    en: "Can be held for you"
  },

  imadake_feature_new_arrival: {
    ja: "新入荷",
    en: "New arrival"
  },

  imadake_action_phone: {
    ja: "📞 電話する",
    en: "📞 Call"
  },

  imadake_action_reservation: {
    ja: "📅 予約する",
    en: "📅 Book"
  },

  imadake_action_website: {
    ja: "🌐 Webサイト",
    en: "🌐 Website"
  },

  imadake_action_social: {
    ja: "📱 SNS",
    en: "📱 Social media"
  },

  imadake_action_order: {
    ja: "🛒 注文する",
    en: "🛒 Order"
  },

  // 収益化 STEP 4-B｜店舗向け成果レポート(imadake-post.html)。
  imadake_report_heading: {
    ja: "📊 成果レポート",
    en: "📊 Results report"
  },

  imadake_report_lead: {
    ja: "今だけ投稿の「続きを見る」が押された件数（有効CV）を、当月を含む直近3か月分確認できます。",
    en: "See how many travelers opened your posts with “See more” (valid CVs) over the last 3 months, including this month."
  },

  imadake_report_billing_stopped: {
    ja: "現在は課金停止中です。料金は発生しません。",
    en: "Billing is currently paused. No fees are charged."
  },

  imadake_report_loading: {
    ja: "集計しています…",
    en: "Loading the report…"
  },

  imadake_report_error: {
    ja: "成果レポートを取得できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't load the report. Please try again later."
  },

  imadake_report_retry: {
    ja: "もう一度読み込む",
    en: "Try again"
  },

  imadake_report_valid_cv: {
    ja: "有効CV件数",
    en: "Valid CVs"
  },

  imadake_report_actual_charge: {
    ja: "実際の請求額",
    en: "Actual charges"
  },

  imadake_report_actual_charge_note_stopped: {
    ja: "課金停止中のため、請求はありません。",
    en: "Nothing is charged while billing is paused."
  },

  imadake_report_reference: {
    ja: "有料運用時の料金目安",
    en: "Estimated fee if billing were active"
  },

  imadake_report_reference_note: {
    ja: "1投稿×日本時間の1日につき、有効CVが1件以上なら100円。請求額ではありません。",
    en: "¥100 per post per day (Japan time) with at least one valid CV. This is not a charge."
  },

  imadake_report_posts_heading: {
    ja: "投稿ごとの内訳",
    en: "Breakdown by post"
  },

  imadake_report_no_posts: {
    ja: "この月に掲載された今だけ投稿はありません。",
    en: "No posts were live in this month."
  },

  imadake_report_untitled: {
    ja: "（見出しなし）",
    en: "(No headline)"
  },

  imadake_report_status_published: {
    ja: "掲載中",
    en: "Live"
  },

  imadake_report_status_ended: {
    ja: "掲載終了",
    en: "Ended"
  },

  imadake_report_status_expired: {
    ja: "掲載期間終了",
    en: "Expired"
  },

  imadake_report_period: {
    ja: "掲載期間",
    en: "Live period"
  },

  imadake_report_col_date: {
    ja: "日付",
    en: "Date"
  },

  imadake_report_col_cv: {
    ja: "有効CV",
    en: "Valid CVs"
  },

  imadake_report_col_actual: {
    ja: "請求額",
    en: "Charged"
  },

  imadake_report_col_reference: {
    ja: "料金目安",
    en: "Estimate"
  },

  imadake_report_note_cv: {
    ja: "有効CV：旅行者が投稿の「続きを見る」を初めて押した件数です。同じ旅行者の2回目以降と、お店の方ご本人の閲覧は数えません。",
    en: "A valid CV is a traveler's first tap on “See more” for a post. Repeat views by the same traveler and views by your own shop account are not counted."
  },

  imadake_report_note_dates: {
    ja: "日付・月は日本時間で集計しています。",
    en: "Dates and months are counted in Japan time (JST)."
  },

  imadake_report_generated_at: {
    ja: "集計時点",
    en: "As of"
  },

  imadake_report_truncated: {
    ja: "投稿が多いため、新しい200件だけを表示しています。",
    en: "Only the 200 most recent posts are shown."
  },

  // 多言語化｜店舗の今だけ投稿画面(imadake-post.html)。日本語は従来の画面の文言と同じ。
  // {name} は画面側で値を差し込む(語順は言語ごとに訳の中で決める)。
  imadake_post_doc_title: {
    ja: "今だけ投稿｜マチナウ",
    en: "Just for Now | Machinau"
  },

  imadake_post_header_label: {
    ja: "マチナウ｜お店・施設の方へ",
    en: "Machinau | For shops and facilities"
  },

  imadake_post_header_lead: {
    ja: "「今、伝えたいこと」を、24時間だけ旅行者へ届けます。",
    en: "Share what you want travelers to know right now, for 24 hours."
  },

  imadake_post_language_aria: {
    ja: "表示言語",
    en: "Display language"
  },

  imadake_post_loading: {
    ja: "読み込んでいます…",
    en: "Loading…"
  },

  imadake_post_invalid_url: {
    ja: "このURLでは今だけ投稿を開けません。店舗アカウントにログインして、店舗の「今だけ投稿」から開いてください。",
    en: "This link can't open Just for Now posting. Please sign in to your store account and open Just for Now from your store."
  },

  imadake_post_invalid_url_hint: {
    ja: "旧方式の店舗専用URLは終了しました。",
    en: "The old shop URLs are no longer available."
  },

  imadake_post_login_required: {
    ja: "店舗アカウントでログインしてから、もう一度お試しください。",
    en: "Please sign in to your shop account and try again."
  },

  imadake_post_open_store_account: {
    ja: "店舗アカウント画面を開く",
    en: "Open the shop account page"
  },

  imadake_post_store_denied: {
    ja: "この店舗で今だけ投稿を操作する権限がありません。",
    en: "You don't have permission to manage Just for Now posts for this shop."
  },

  imadake_post_back_to_store_account: {
    ja: "店舗アカウント画面へ戻る",
    en: "Back to the shop account page"
  },

  imadake_post_location_label: {
    ja: "掲載場所：",
    en: "Listing location: "
  },

  imadake_post_location_note: {
    ja: "掲載場所の変更はマチナウ運営へご連絡ください。",
    en: "To change the listing location, please contact Machinau."
  },

  imadake_post_location_unregistered: {
    ja: "未登録",
    en: "Not registered"
  },

  // 決済 STEP 35-A｜今だけ投稿のカード登録必須
  imadake_post_error_card_required: {
    ja: "今だけ投稿の利用には、クレジットカードの登録が必要です。店舗アカウント画面でカードを登録してから、もう一度お試しください。",
    en: "A credit card is required to use Just for Now posts. Please register a card on your shop account page and try again."
  },

  imadake_post_error_card_expired: {
    ja: "登録しているクレジットカードの有効期限が切れています。店舗アカウント画面でカードを変更してから、もう一度お試しください。",
    en: "Your registered credit card has expired. Please update your card on your shop account page and try again."
  },

  imadake_post_error_card_unavailable: {
    ja: "ただいまカードの登録状態を確認できません。少し時間をおいてから、もう一度お試しください。",
    en: "We can't check your card status right now. Please wait a moment and try again."
  },

  imadake_post_card_setup_link: {
    ja: "店舗アカウント画面でカードを登録する",
    en: "Register a card on your shop account page"
  },

  imadake_post_no_location: {
    ja: "店舗の掲載場所がまだ登録されていません。運営へお問い合わせください。",
    en: "Your shop's listing location hasn't been registered yet. Please contact Machinau."
  },

  imadake_post_badge_24h: {
    ja: "24時間限定",
    en: "24 hours only"
  },

  imadake_post_about_heading: {
    ja: "今だけ投稿とは",
    en: "About Just for Now"
  },

  imadake_post_about_1: {
    ja: "「今だから役立つ」情報を、近くの旅行者へ届けます",
    en: "Share timely, useful information with travelers nearby"
  },

  imadake_post_about_2: {
    ja: "公開から24時間で自動的に終わります",
    en: "Posts end automatically 24 hours after going live"
  },

  imadake_post_about_3: {
    ja: "1店舗につき、同時に掲載できるのは1件です",
    en: "Each shop can have one post live at a time"
  },

  imadake_post_about_4: {
    ja: "安全確認のあとに公開します（内容によっては運営が確認してから公開します）",
    en: "Posts go live after a safety check (some posts are reviewed by Machinau first)"
  },

  imadake_post_current_heading: {
    ja: "今の今だけ投稿",
    en: "Your current post"
  },

  imadake_post_status_published: {
    ja: "公開中",
    en: "Live"
  },

  imadake_post_status_pending: {
    ja: "運営確認中（まだ公開されていません）",
    en: "Under review (not live yet)"
  },

  imadake_post_meta_pending: {
    ja: "確認が終わると公開され、その時点から24時間掲載されます。",
    en: "Once the review is complete, it will go live for 24 hours from that time."
  },

  imadake_post_meta_published: {
    ja: "掲載終了予定：{time}（公開から24時間）",
    en: "Scheduled to end: {time} (24 hours after going live)"
  },

  imadake_post_end_button: {
    ja: "掲載を終了する",
    en: "End this post"
  },

  imadake_post_withdraw_button: {
    ja: "投稿を取り下げる",
    en: "Withdraw this post"
  },

  imadake_post_new_heading: {
    ja: "新しく投稿する",
    en: "Create a new post"
  },

  imadake_post_required: {
    ja: "必須",
    en: "Required"
  },

  imadake_post_optional: {
    ja: "任意",
    en: "Optional"
  },

  imadake_post_category_label: {
    ja: "どんなお店・催しですか？",
    en: "What kind of shop or event is this?"
  },

  imadake_post_source_language_label: {
    ja: "投稿する言語",
    en: "Language of your post"
  },

  imadake_post_source_language_hint: {
    ja: "見出しと説明を書いた言語を選んでください。旅行者の表示言語に合わせた自動翻訳に使います。",
    en: "Choose the language you wrote the headline and details in. It's used to translate your post automatically for travelers."
  },

  imadake_post_category_aria: {
    ja: "カテゴリー",
    en: "Category"
  },

  imadake_post_category_restaurant: {
    ja: "飲食店",
    en: "Restaurant / café"
  },

  imadake_post_category_food_shop: {
    ja: "食品・スイーツ",
    en: "Food & sweets"
  },

  imadake_post_category_retail: {
    ja: "ショップ・物販",
    en: "Shop / retail"
  },

  imadake_post_category_event: {
    ja: "イベント",
    en: "Event"
  },

  imadake_post_category_other: {
    ja: "その他",
    en: "Other"
  },

  imadake_post_headline_label: {
    ja: "いちばん伝えたいこと",
    en: "Your main message"
  },

  imadake_post_headline_placeholder: {
    ja: "例：本日まだ空席あります",
    en: "e.g. Seats still available today"
  },

  imadake_post_headline_hint: {
    ja: "例：「本日まだ空席あります」「タルト、あと6個です」「新作が入荷しました」「本日17時まで営業」「当日券あります」",
    en: "Examples: “Seats still available today”, “Only 6 tarts left”, “New items just arrived”, “Open until 5 pm today”, “Same-day tickets available”"
  },

  imadake_post_live_label_seats: {
    ja: "今の空席状況",
    en: "Seats right now"
  },

  imadake_post_live_label_stock: {
    ja: "今の在庫・残り状況",
    en: "Stock right now"
  },

  imadake_post_live_label_tickets: {
    ja: "今の当日券の状況",
    en: "Same-day tickets right now"
  },

  imadake_post_live_none: {
    ja: "指定しない",
    en: "Not specified"
  },

  imadake_post_live_seats_available: {
    ja: "空席あり",
    en: "Seats available"
  },

  imadake_post_live_seats_few: {
    ja: "残りわずか",
    en: "Almost full"
  },

  imadake_post_live_seats_full: {
    ja: "満席",
    en: "Full"
  },

  imadake_post_live_stock_available: {
    ja: "あり",
    en: "Available"
  },

  imadake_post_live_stock_few: {
    ja: "残りわずか",
    en: "Only a few left"
  },

  imadake_post_live_stock_sold_out: {
    ja: "売り切れ",
    en: "Sold out"
  },

  imadake_post_live_tickets_available: {
    ja: "当日券あり",
    en: "Same-day tickets available"
  },

  imadake_post_live_tickets_few: {
    ja: "残りわずか",
    en: "Only a few left"
  },

  imadake_post_live_tickets_sold_out: {
    ja: "完売",
    en: "Sold out"
  },

  imadake_post_quantity_label: {
    ja: "残りの数",
    en: "Number left"
  },

  imadake_post_quantity_placeholder: {
    ja: "例：6",
    en: "e.g. 6"
  },

  imadake_post_photos_label: {
    ja: "写真",
    en: "Photos"
  },

  imadake_post_photos_optional: {
    ja: "任意・最大10枚",
    en: "Optional · up to 10"
  },

  imadake_post_photo_add: {
    ja: "📷 写真を選ぶ",
    en: "📷 Choose photos"
  },

  imadake_post_photo_hint_basic: {
    ja: "1枚目がメインの写真になります。",
    en: "The first photo will be the main photo."
  },

  imadake_post_photo_hint_count: {
    ja: "1枚目がメインの写真になります（{count} / 10枚）。",
    en: "The first photo will be the main photo ({count} / 10)."
  },

  imadake_post_photo_hint_max: {
    ja: "写真は最大10枚までです。1枚目がメインの写真になります。",
    en: "You can add up to 10 photos. The first photo will be the main photo."
  },

  imadake_post_photo_main: {
    ja: "メイン",
    en: "Main"
  },

  imadake_post_photo_remove: {
    ja: "この写真を外す",
    en: "Remove this photo"
  },

  imadake_post_photo_rules: {
    ja: "写真はjpeg・png・webpで1枚10MBまで、最大10枚まで選べます。",
    en: "Photos must be JPEG, PNG or WebP, up to 10 MB each. You can choose up to 10."
  },

  imadake_post_body_label: {
    ja: "くわしい説明",
    en: "Details"
  },

  imadake_post_body_placeholder: {
    ja: "今日の様子、限定の内容、時間、おすすめなど",
    en: "Today's situation, what's limited, times, recommendations, etc."
  },

  imadake_post_extra_summary: {
    ja: "追加情報（必要なものだけ）",
    en: "More details (only what you need)"
  },

  imadake_post_field_takeout: {
    ja: "テイクアウトできる",
    en: "Takeout available"
  },

  imadake_post_field_sameDayReservation: {
    ja: "当日予約できる",
    en: "Same-day reservations accepted"
  },

  imadake_post_field_holdAvailable: {
    ja: "取り置きできる",
    en: "Items can be held"
  },

  imadake_post_field_newArrival: {
    ja: "新入荷",
    en: "New arrivals"
  },

  imadake_post_field_startTime: {
    ja: "開始時刻",
    en: "Start time"
  },

  imadake_post_field_endTime: {
    ja: "終了時刻",
    en: "End time"
  },

  imadake_post_field_venue: {
    ja: "会場",
    en: "Venue"
  },

  imadake_post_field_feeText: {
    ja: "料金",
    en: "Fee"
  },

  imadake_post_available_until_label: {
    ja: "何時まで",
    en: "Available until"
  },

  imadake_post_price_label: {
    ja: "価格",
    en: "Price"
  },

  imadake_post_price_placeholder: {
    ja: "例：1個 450円",
    en: "e.g. ¥450 each"
  },

  imadake_post_payment_label: {
    ja: "お支払い",
    en: "Payment"
  },

  imadake_post_payment_cash: {
    ja: "現金",
    en: "Cash"
  },

  imadake_post_payment_card: {
    ja: "カード",
    en: "Card"
  },

  imadake_post_payment_qr: {
    ja: "QR決済",
    en: "QR code payment"
  },

  imadake_post_phone_label: {
    ja: "電話番号",
    en: "Phone number"
  },

  imadake_post_phone_placeholder: {
    ja: "例：098-000-0000",
    en: "e.g. 098-000-0000"
  },

  imadake_post_reservation_label: {
    ja: "予約ページ",
    en: "Reservation page"
  },

  imadake_post_website_label: {
    ja: "お店のページ",
    en: "Shop website"
  },

  imadake_post_social_label: {
    ja: "SNS",
    en: "Social media"
  },

  imadake_post_order_label: {
    ja: "注文ページ",
    en: "Order page"
  },

  imadake_post_submit: {
    ja: "今だけ投稿を届ける",
    en: "Publish your post"
  },

  imadake_post_submitting: {
    ja: "送信しています…",
    en: "Sending…"
  },

  imadake_post_validation_category: {
    ja: "「どんなお店・催しですか？」を選んでください。",
    en: "Please choose “What kind of shop or event is this?”."
  },

  imadake_post_validation_headline: {
    ja: "「いちばん伝えたいこと」を入力してください。",
    en: "Please enter “Your main message”."
  },

  imadake_post_validation_headline_length: {
    ja: "「いちばん伝えたいこと」は40文字以内で入力してください。",
    en: "“Your main message” must be 40 characters or fewer."
  },

  imadake_post_validation_body_length: {
    ja: "「くわしい説明」は3,000文字以内で入力してください。",
    en: "“Details” must be 3,000 characters or fewer."
  },

  imadake_post_progress_upload: {
    ja: "写真をアップロードしています（{current} / {total}）…",
    en: "Uploading photos ({current} / {total})…"
  },

  imadake_post_progress_safety: {
    ja: "安全確認をしています…",
    en: "Running the safety check…"
  },

  imadake_post_result_published: {
    ja: "今だけ投稿を公開しました。",
    en: "Your post is now live."
  },

  imadake_post_result_pending: {
    ja: "内容を運営が確認しています。確認が終わると公開され、その時点から24時間掲載されます（まだ公開されていません）。",
    en: "Machinau is reviewing your post. Once the review is complete, it will go live for 24 hours from that time (not live yet)."
  },

  imadake_post_result_rejected: {
    ja: "この内容は掲載できません。内容を見直して、もう一度投稿してください。",
    en: "This post can't be published. Please revise it and try again."
  },

  imadake_post_result_expires: {
    ja: "24時間限定です。掲載終了予定：{time}",
    en: "It stays live for 24 hours. Scheduled to end: {time}"
  },

  imadake_post_error_active_exists: {
    ja: "すでに公開中の今だけ投稿があります。1店舗につき同時に掲載できるのは1件です。終了してから新しく投稿できます。",
    en: "You already have a live post. Each shop can have one post live at a time. End it before creating a new one."
  },

  imadake_post_error_pending_exists: {
    ja: "運営が確認中の今だけ投稿があります。確認が終わるか、取り下げてから新しく投稿できます。",
    en: "You have a post under review. You can create a new one after the review is complete or after withdrawing it."
  },

  imadake_post_error_safety_unavailable: {
    ja: "ただいま投稿を確認できません。少し時間をおいてから、もう一度お試しください（まだ公開されていません）。",
    en: "We can't check posts right now. Please try again in a little while (not live yet)."
  },

  imadake_post_error_rate_limited: {
    ja: "少し時間をおいてから、もう一度お試しください。",
    en: "Please wait a moment and try again."
  },

  imadake_post_error_invalid_url: {
    ja: "このURLでは今だけ投稿を開けません。店舗アカウントにログインして、店舗の「今だけ投稿」から開いてください。",
    en: "This link can't open Just for Now posting. Please sign in to your store account and open Just for Now from your store."
  },

  imadake_post_error_field: {
    ja: "入力内容を確認してください（{field}）。",
    en: "Please check what you entered ({field})."
  },

  imadake_post_error_post_failed: {
    ja: "投稿できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't publish your post. Please try again later."
  },

  imadake_post_error_compress: {
    ja: "写真を軽量化できませんでした。",
    en: "Couldn't resize the photo."
  },

  imadake_post_error_upload_prepare: {
    ja: "写真のアップロードの準備ができませんでした。",
    en: "Couldn't prepare the photo upload."
  },

  imadake_post_error_upload: {
    ja: "写真をアップロードできませんでした。",
    en: "Couldn't upload the photo."
  },

  imadake_post_confirm_end: {
    ja: "公開中の今だけ投稿の掲載を終了しますか？（旅行者から見えなくなります）",
    en: "End your live post? (Travelers will no longer see it.)"
  },

  imadake_post_confirm_withdraw: {
    ja: "確認中の投稿を取り下げますか？（公開されません）",
    en: "Withdraw the post under review? (It won't be published.)"
  },

  imadake_post_action_failed: {
    ja: "処理できませんでした。",
    en: "Couldn't complete this action."
  },

  imadake_post_action_failed_retry: {
    ja: "処理できませんでした。時間をおいて、もう一度お試しください。",
    en: "Couldn't complete this action. Please try again later."
  },

  imadake_post_withdrawn_done: {
    ja: "確認中の投稿を取り下げました。新しく投稿できます。",
    en: "Your post under review was withdrawn. You can create a new post."
  },

  imadake_post_ended_done: {
    ja: "今だけ投稿の掲載を終了しました。新しく投稿できます。",
    en: "Your post has ended. You can create a new post."
  },

  imadake_post_colon: {
    ja: "：",
    en: ": "
  },

  imadake_post_range_separator: {
    ja: " 〜 ",
    en: " – "
  },

  imadake_report_meta_separator: {
    ja: "・",
    en: " · "
  },

  imadake_report_format_yen: {
    ja: "{amount}円",
    en: "¥{amount}"
  },

  imadake_report_format_count: {
    ja: "{count}件",
    en: "{count}"
  },

  imadake_report_format_month: {
    ja: "{year}年{month}月",
    en: "{monthShort} {year}"
  },

  imadake_report_format_day: {
    ja: "{month}/{day}",
    en: "{monthShort} {day}"
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
