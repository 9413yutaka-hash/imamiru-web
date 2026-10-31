// ==========================================================================
// 今だけ投稿 決済 STEP 35-A｜カード登録必須の判定(サーバー側のみ)
// ==========================================================================
// 代表確定仕様：今だけ投稿の利用にはクレジットカード登録が必須。正式な請求先は
// 店舗の請求先アカウントの accountBilling/{uid}.{mode}.paymentMethodId(A案。STEP 42-C で1アカウント1枚に変更)。
//
// このファイルは「課金対象になる今だけ投稿を新しく作る時」の確認だけに使う
// (呼び出すのは api/_lib/imadake.js の handleImadakePostCreate。課金対象でない投稿・運営投稿・
//  一般の投稿・店舗の基本情報では使わない)。
// Firestoreの storeMembers(請求先アカウントの特定)と accountBilling だけを読む。Stripeへは問い合わせない(カードは登録・変更の確定時に
// Stripeで確認済み)。書き込みはしない。カード番号・CVCは扱わない(保存されているのは
// ブランド・下4桁・有効期限の月年だけ)。
//
// 有効な請求先とみなす条件(すべて満たす時だけ。不明・不整合は拒否)：
//   ・Stripeの設定がこの環境で有効(テスト用のみ・Productionでは無効)
//   ・店舗の請求先アカウント(有効な owner が1人)が決まり、accountBilling/{uid} があり、文書の uid が一致する
//   ・その環境のモードの区画に、確定済み(setupStatus "succeeded")の customerId(cus_)と paymentMethodId(pm_)
//   ・paymentMethodId が取り外し待ち(detachPendingPaymentMethods)に入っていない
//   ・保存されている有効期限(月・年)が、日本時間の今月以降
// カード変更の途中(pendingSetupIntentId がある)でも、確定済みの旧カードが上を満たせば有効。
//
// 拒否の理由コード：
//   card_required             未登録・登録途中だけ・その環境のモードの区画が無い
//   card_invalid              確定済みでない・顧客IDやカードの有効期限が読めない等の不整合
//   card_account_mismatch     文書の uid が請求先アカウントと違う
//   card_billing_account_unresolved  店舗の請求先アカウントが決まらない(有効な owner が0人・2人以上)
//   card_retiring             正式なカードが取り外し待ちに入っている
//   card_expired              有効期限切れ
//   card_billing_unavailable  Stripeの設定が無効・確認の部品が無い
//   card_account_deleting     STEP 47-B｜そのアカウントの退会(セルフ削除)を受け付けた後(accountDeletions/{uid} がある)。
//                             新しい店舗の登録・引き継ぎ・課金対象の今だけ投稿・月額プランの申込を受け付けない
// このファイルはVercel Functionではない(api/moderate-submission.js から依存として渡す)。
// ==========================================================================

import {
  readAccountDeletion
} from "./account-deletion-state.js";

import {
  ACCOUNT_BILLING_COLLECTION,
  readStripeCardSetupConfig,
  resolveStoreBillingAccount
} from "./store-billing.js";

const CUSTOMER_ID_PATTERN =
  /^cus_[A-Za-z0-9]+$/;

const PAYMENT_METHOD_ID_PATTERN =
  /^pm_[A-Za-z0-9]+$/;

// 日本時間の年・月(1〜12)。
function jstYearMonth(nowMillis) {
  const d = new Date(nowMillis + 9 * 60 * 60 * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// accountBilling の文書(データ)から判定する(読み取り済みのデータを渡す。純粋な関数)。
export function evaluateImadakeBillingCard(billingData, uid, mode, nowMillis) {
  if (!billingData || typeof billingData !== "object") {
    return { ok: false, reason: "card_required" };
  }

  if (billingData.uid !== uid) {
    return { ok: false, reason: typeof billingData.uid === "string" && billingData.uid !== "" ? "card_account_mismatch" : "card_invalid" };
  }

  const section = billingData[mode];

  if (!section || typeof section !== "object") {
    return { ok: false, reason: "card_required" };
  }

  if (typeof section.paymentMethodId !== "string" || section.paymentMethodId === "") {
    return { ok: false, reason: "card_required" };
  }

  if (
    !PAYMENT_METHOD_ID_PATTERN.test(section.paymentMethodId) ||
    typeof section.customerId !== "string" ||
    !CUSTOMER_ID_PATTERN.test(section.customerId) ||
    section.setupStatus !== "succeeded"
  ) {
    return { ok: false, reason: "card_invalid" };
  }

  const pending = Array.isArray(section.detachPendingPaymentMethods) ? section.detachPendingPaymentMethods : [];

  if (pending.some(function(entry) { return entry && entry.paymentMethodId === section.paymentMethodId; })) {
    return { ok: false, reason: "card_retiring" };
  }

  const card = section.card && typeof section.card === "object" ? section.card : null;
  const expMonth = card ? Number(card.expMonth) : NaN;
  const expYear = card ? Number(card.expYear) : NaN;

  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear) || expYear < 2000) {
    return { ok: false, reason: "card_invalid" };
  }

  const now = jstYearMonth(Number.isFinite(nowMillis) ? nowMillis : Date.now());

  if (expYear < now.year || (expYear === now.year && expMonth < now.month)) {
    return { ok: false, reason: "card_expired" };
  }

  return { ok: true, reason: "", paymentMethodId: section.paymentMethodId };
}

function readMode(options) {
  // STEP 43-B｜カードの保存先(test／live)はカード登録用の設定で決める(請求用の設定とは別)。
  const config = readStripeCardSetupConfig((options && options.env) || process.env, options);
  return config.ok ? config.mode : null;
}

// STEP 42-D｜アカウントのカードが有効か(店舗の新規登録・引き継ぎの条件)。accountBilling/{uid} だけを読む。
export async function checkAccountBillingCard(database, uid, options) {
  const mode = readMode(options);

  if (!mode) {
    return { ok: false, reason: "card_billing_unavailable" };
  }

  if (typeof uid !== "string" || uid === "") {
    return { ok: false, reason: "card_required" };
  }

  if (await readAccountDeletion(database, uid)) {
    return { ok: false, reason: "card_account_deleting" };
  }

  const snapshot = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid).get();

  return evaluateImadakeBillingCard(snapshot.exists ? snapshot.data() || {} : null, uid, mode, options && options.nowMillis);
}

// 投稿作成の前の確認(トランザクションの外)。
export async function checkImadakeBillingCard(database, storeId, options) {
  const mode = readMode(options);

  if (!mode) {
    return { ok: false, reason: "card_billing_unavailable" };
  }

  const account = await resolveStoreBillingAccount(database, storeId);

  if (!account.ok) {
    return { ok: false, reason: "card_billing_account_unresolved" };
  }

  if (await readAccountDeletion(database, account.uid)) {
    return { ok: false, reason: "card_account_deleting" };
  }

  const snapshot = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(account.uid).get();

  return evaluateImadakeBillingCard(snapshot.exists ? snapshot.data() || {} : null, account.uid, mode, options && options.nowMillis);
}

// 保存のトランザクションの中での確認(確認と保存の間のカード変更・取り外しとの競合を防ぐ)。
export async function checkImadakeBillingCardInTransaction(transaction, database, storeId, options) {
  const mode = readMode(options);

  if (!mode) {
    return { ok: false, reason: "card_billing_unavailable" };
  }

  const account = await resolveStoreBillingAccount(database, storeId, transaction);

  if (!account.ok) {
    return { ok: false, reason: "card_billing_account_unresolved" };
  }

  // STEP 47-B｜退会の受付と同時の投稿でも、退会の記録と同じトランザクションで確かめる。
  if (await readAccountDeletion(database, account.uid, transaction)) {
    return { ok: false, reason: "card_account_deleting" };
  }

  const snapshot = await transaction.get(database.collection(ACCOUNT_BILLING_COLLECTION).doc(account.uid));

  return evaluateImadakeBillingCard(snapshot.exists ? snapshot.data() || {} : null, account.uid, mode, options && options.nowMillis);
}
