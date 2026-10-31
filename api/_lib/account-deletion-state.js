// ==========================================================================
// STEP 47｜店舗アカウントの退会(セルフ削除)の手続き中かどうか(サーバー側のみ)
// ==========================================================================
// 記録 accountDeletions/{uid}(サーバーだけが読み書きする。Firestore Rules に許可の指定は無い＝ブラウザ不可)。
// 状態：
//   awaiting_settlement  退会を受け付けた。最後のご請求とお支払いが済むまで待つ(カードは残す＝変更もできる)
//   finalizing           清算を確かめて削除を進めている(カード・写真・ログインの削除)
//   card_detach_pending  カードの取り外しが終わっていない(時間をおいて再実行で続き)
//   card_detach_failed   カードの取り外しが繰り返し失敗して停止(運営の確認・復旧が必要)
//   auth_delete_pending  ログインの削除だけが残っている
//   completed            削除が完了
//   operator_protected   STEP 47-C｜運営のアカウントだったため最終削除を止めた(運営の確認が必要)
//   canceled             STEP 47-C｜最終削除の開始前に本人が取り消した(履歴として残す。退会中としては扱わない)
// 記録がある間(canceled 以外のどの状態でも)：新しい店舗の登録・引き継ぎ・今だけ投稿・月額プランの申込を受け付けない。
// カードの登録・変更は awaiting_settlement の間だけ受け付ける(最後のお支払いのため)。それ以降は受け付けない。
// このファイルはVercel Functionではない。
// ==========================================================================

export const ACCOUNT_DELETIONS_COLLECTION =
  "accountDeletions";

export const ACCOUNT_DELETION_CARD_LOCKED_STATUSES = Object.freeze([
  "finalizing",
  "card_detach_pending",
  "card_detach_failed",
  "auth_delete_pending",
  "operator_protected",
  "completed"
]);

// STEP 47-C｜本人が取り消した記録(退会中としては扱わない)。
export const ACCOUNT_DELETION_CANCELED_STATUS =
  "canceled";

export function accountDeletionRef(database, uid) {
  return database.collection(ACCOUNT_DELETIONS_COLLECTION).doc(uid);
}

// 退会の記録(無ければ null。取り消し済み(canceled)も null＝退会中ではない)。transaction を渡すとトランザクションの中で読む(書き込みとの競合を検知させる)。
export async function readAccountDeletion(database, uid, transaction) {
  if (typeof uid !== "string" || uid === "") {
    return null;
  }

  const ref = accountDeletionRef(database, uid);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  const record = snapshot.exists ? snapshot.data() || {} : null;
  return record && record.status !== ACCOUNT_DELETION_CANCELED_STATUS ? record : null;
}

// 新しいカードの登録・確定を止める状態か。
export function isCardChangeLockedByDeletion(record) {
  return Boolean(record) && ACCOUNT_DELETION_CARD_LOCKED_STATUSES.includes(record.status);
}
