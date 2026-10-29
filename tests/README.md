# tests/ — マチナウの模擬テスト

本番コードの動作は変えず、Firebase・Stripe・外部APIを**すべて模擬**して確かめるテスト一式。
実際のFirestore・Stripe・OpenAIには接続しない(テスト内のキーはすべて偽物の文字列)。

- このフォルダは `.vercelignore` で公開サイトから除外している(配信しない)。
- `api/` の外にあるため、Vercel Functionの本数には数えられない。
- 絶対パスは書かない。場所は `_paths.mjs` が自分の位置から決める(リポジトリ = このフォルダの1つ上)。
- スクリーンショットはOSの一時フォルダ `machinau-test-shots/` に出る(環境変数 `MACHINAU_TEST_SHOTS_DIR` で変更可)。
- 画面のテストは Chrome を使う(既定 `C:/Program Files/Google/Chrome/Application/chrome.exe`、環境変数 `CHROME_PATH` で変更可)。

## 実行方法(リポジトリの一番上で実行)

`firebase-admin` を模擬に差し替えるため、`--import` で読み込み設定を指定する。

```bash
# Stripe カード登録・変更・旧カード取り外し(STEP 31)
node --import ./tests/mockfa-occ/register.mjs tests/billing-detach-test.mjs
node --import ./tests/mockfa-occ/register.mjs tests/billing-change-test.mjs
node --import ./tests/mockfa-occ/register.mjs tests/billing-server-test.mjs
node --import ./tests/mockfa/register.mjs     tests/billing-ui-test.mjs      # Chrome を使う

# 今だけ投稿の CV・料金台帳・成果レポート
node --import ./tests/mockfa/register.mjs tests/imadake-cv-test.mjs
node --import ./tests/mockfa/register.mjs tests/imadake-cv-report-test.mjs

# 今だけ投稿の月末締め(STEP 32-B：店舗別・月別の請求額の確定、Stripeには接続しない)・月次請求(STEP 32-C：Stripeは模擬)
node --import ./tests/mockfa-occ/register.mjs tests/imadake-monthly-close-test.mjs
node --import ./tests/mockfa-occ/register.mjs tests/imadake-monthly-charge-test.mjs
node --import ./tests/mockfa-occ/register.mjs tests/imadake-billing-overview-test.mjs   # 運営確認一覧(読み取り専用)
node --import ./tests/mockfa-occ/register.mjs tests/imadake-billing-inspect-test.mjs    # 請求書1件とStripeの照合(GETのみ・Stripeは模擬)
node --import ./tests/mockfa-occ/register.mjs tests/imadake-billing-stripe-check-test.mjs  # Stripeとの読み取り接続確認(GET limit=1 のみ・Stripeは模擬)
node --import ./tests/mockfa-occ/register.mjs tests/admin-billing-ui-test.mjs          # 運営確認画面 admin-billing.html(Chrome を使う)

# Preview専用Firebaseへの分離の安全対策(STEP 32-D㉗：サーバーの接続先検査・firebase.jsの接続先の決め方)
node --import ./tests/mockfa-target/register.mjs tests/firebase-target-test.mjs

# シェア(STEP 48：今だけ投稿の詳細・無料店舗の詳細・読みものの記事。共有リンクで開いた時の公開条件・CVは変えない。Chrome を使う)
node --import ./tests/mockfa/register.mjs tests/share-test.mjs

# Preview では本番の GA4 を読み込まない(STEP 48-E：index.html の計測タグは machinau.jp・imamiru-web.vercel.app だけ。Chrome を使う)
node tests/preview-analytics-test.mjs

# Preview専用の課金対象判定(STEP 34-A：machinau-preview に接続した対象ブランチのPreviewだけ、新規の今だけ投稿を課金対象にする)
node --import ./tests/mockfa-occ/register.mjs tests/preview-billing-trial-test.mjs

# 今だけ投稿のカード登録必須(STEP 35-A：課金対象の投稿の作成時だけ、店舗の請求先アカウントの accountBilling を確認。STEP 42-C で1アカウント1枚に変更)
node --import ./tests/mockfa-occ/register.mjs tests/imadake-card-requirement-test.mjs

# 月末締めのPreview試験(STEP 37-C：Preview限定の書き込み許可・運営画面の試算と実行。画面のテストは Chrome を使う)
node --import ./tests/mockfa-occ/register.mjs tests/imadake-monthly-close-preview-trial-test.mjs
node --import ./tests/mockfa/register.mjs     tests/admin-billing-close-trial-ui-test.mjs

# 店舗向けの請求履歴(STEP 38-B：ownerだけ・読み取り専用・課金開始前のProductionでは非表示)
node --import ./tests/mockfa-occ/register.mjs tests/store-billing-invoices-test.mjs
node --import ./tests/mockfa/register.mjs     tests/store-invoice-history-ui-test.mjs   # Chrome を使う

# カード登録が条件の店舗の新規登録・運営掲載の自動引き継ぎ(STEP 42-D：運営の承認なし・文章等の引き継ぎ・写真の複製は承認まで停止)
node --import ./tests/mockfa-occ/register.mjs tests/store-card-registration-test.mjs
node --import ./tests/mockfa-occ/register.mjs tests/store-card-registration-ui-test.mjs   # Chrome を使う

# 店舗アカウントの退会(STEP 47・47-B・47-C：退会の受付→清算待ち→清算の後に自動で最終削除、取り消し、運営アカウントの保護、運営への異常の通知)
# 毎日の定期実行の最後の手順としての最終削除は store-custom-plan-cron-test.mjs で確かめる
node --import ./tests/mockfa-occ/register.mjs tests/store-account-deletion-test.mjs
node --import ./tests/mockfa-occ/register.mjs tests/store-account-deletion-ui-test.mjs   # Chrome を使う

# 既存の回帰(サーバー)
for f in imadake-store-login-test imadake-safety-test imadake-translation-test imadake-nearby-test route-test; do
  node --import ./tests/mockfa/register.mjs tests/$f.mjs
done

# 既存の回帰(画面、Chrome を使う。ローカルに 127.0.0.1:8701 でリポジトリを配信して確認する)
for f in tests3 tests5 tests6 tests7 tests8 tests9 tests10; do
  node --import ./tests/mockfa/register.mjs tests/$f.mjs
done
```

各テストは最後に `TOTAL n  PASS n  FAIL n` を出す。

## 中身

| ファイル | 内容 |
|---|---|
| `mockfa/` | firebase-admin(app・auth・firestore)の模擬。メモリ上のFirestore |
| `mockfa-occ/` | 上と同じ。トランザクションが実Firestoreのように競合を検知してやり直す(同時操作のテスト用) |
| `lib.mjs`・`lib-auth.mjs` | ローカル配信・Chrome操作の共通部品(`lib-auth.mjs` は店舗ログインの模擬つき) |
| `cvmock.mjs`・`reportfixtures.mjs` | CV・成果レポートの模擬データ |
| `columns.json` | 公開済みの読みもの一覧(公開APIの応答の写し)。画面テストの固定データ |
| `billing-*-test.mjs` | STEP 31：カード登録(SetupIntent)・カード変更(トランザクション・cardVersion)・旧カードの取り外し(確保・照会・detach・冪等キー) |
| `store-billing-invoices-test.mjs`・`store-invoice-history-ui-test.mjs` | STEP 38-B：店舗向けの請求履歴(mode storeBillingInvoices)。ownerだけ・editor/旧token/他店は拒否・直近12か月・状態の表示・見込みと確定の分離・内部情報の非公開・XSS・読み取り専用・課金開始前のProductionでは読まずに非表示 |
| `imadake-*-test.mjs` | 今だけ投稿：店舗ログイン・CV記録と日別料金台帳・成果レポート・月末締め(請求額の確定)・安全審査・翻訳・近くの判定 |
| `route-test.mjs` | `api/moderate-submission.js` の mode 振り分け |
| `tests3〜10.mjs` | 今だけ投稿のTOP枠・詳細・店舗画面・成果レポート・日英表示(画面) |

## 注意

- 既知の環境ノイズ：ローカルではGoogle Mapsのキーが許可されていないため `RefererNotAllowedMapError` が出ることがある(本番コードの不具合ではない)。
- `imadake-safety-test.mjs` は実行時に `tests/_safety_harness.mjs` を作る(`.gitignore` で除外)。
- 2026-10-17 に一時フォルダから移した。経緯は保管庫「今だけ投稿 決済設計 STEP1」第16章。
