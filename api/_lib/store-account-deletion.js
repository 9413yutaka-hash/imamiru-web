// ==========================================================================
// STEP 47 / 47-B｜店舗アカウントの退会(セルフ削除)(サーバー側のみ)
// ==========================================================================
// 代表決定(2026-10-25・2026-10-27 STEP 47-B の10項目)：
//   ①締め前の料金：月末締め・翌月2日請求・支払い完了の後に完全削除する。退会希望の後は新規の有料利用を停止する。
//   ②月額100円：解約を受け付け、当月分の最終清算の後に完全削除する(即時精算はしない)。
//   ③運営無料掲載を引き継いだ店舗：退会時は非公開。紐付けの記録は保持し、運営の確認なしに自動で再公開しない。
//   ④Stripe：登録カードを取り外す。Customer は過去の請求の照合のため保持する。
//   ⑤記録の保存期間は代表の承認まで確定しない(このファイルでは何も消さない＝期間を決めない)。
//   ⑥再ログインなし。ログイン中の本人の2段階確認(画面)と、サーバー側の UID・所有権・請求状態の検証。
//   ⑦削除の履歴は accountDeletions/{uid} に保存する(運営用の履歴画面は後日)。
//   ⑧メール未確認のアカウントも本人が削除できる(店舗・カード・未払い等の紐付けはサーバーで検査する)。
//   ⑨店舗の写真は原則削除。この店舗専用のフォルダーの画像だけを消す(運営掲載の元の画像・他の店舗の画像は消さない)。
//   ⑩カードの取り外しが繰り返し失敗したら止め、運営の確認・再開の手段(adminAccountDeletionResume)を設ける。
//     未払いの判定の強制解除・成功の偽装はしない。
//
// 流れ(accountDeletions/{uid}.status。状態の意味は account-deletion-state.js)：
//   退会の受付(storeAccountDelete)：
//     記録を作る(awaiting_settlement) → 月額プランを解約 → 今だけ投稿の掲載を終える → 店舗情報を非公開・店舗を無効
//     → 運営掲載との紐付けに「店主の退会で非公開」の印 → 清算が済んでいれば、そのまま最終削除へ。
//     清算待ちの間：カードは残す(最後のお支払いのため。変更もできる)。owner の関係も残す(請求先の特定のため)。
//   最終削除(清算が済んだ時。本人の再操作・定期実行 accountDeletionSweep・運営の再開から)：
//     finalizing(以後カードの登録・変更を受け付けない) → もう一度、非公開・掲載終了(後から増えた店舗・投稿も) →
//     清算をもう一度確かめる(未清算なら awaiting_settlement へ戻す) → カードを外す(終わらなければ
//     card_detach_pending、上限に達したら card_detach_failed で停止) → 店舗の写真を消す → owner の関係を外す →
//     カードの記録を消す → ログインを削除(失敗は auth_delete_pending) → completed。
// 残すもの：請求書・料金台帳・利用月の記録・支払いの記録・CV の記録・店舗の文書(無効のまま)・投稿(終了のまま)・
//   運営掲載との紐付け(印つき)・削除の記録(uid・店舗ID・Stripe の顧客ID・日時。メールアドレスは記録しない)・
//   Stripe の顧客(カードだけ取り外す)。
// このファイルはVercel Functionではない(api/moderate-submission.jsから呼ばれる)。
// ==========================================================================

import {
  FieldValue
} from "firebase-admin/firestore";

import {
  ACCOUNT_DELETION_CANCELED_STATUS,
  ACCOUNT_DELETIONS_COLLECTION,
  accountDeletionRef,
  readAccountDeletion
} from "./account-deletion-state.js";

import {
  ACCOUNT_BILLING_COLLECTION,
  STORE_CUSTOM_PLAN_INVOICES_COLLECTION,
  cardSetupOptionsFor,
  readBillingLocks,
  readStripeCardSetupConfig,
  removeAccountCardsForDeletion,
  resetFailedCardDetachForDeletion
} from "./store-billing.js";

import {
  EMPTY_ACTIVE_SLOT_FIELDS,
  IMADAKE_POSTS_COLLECTION,
  IMADAKE_STORE_SLOTS_COLLECTION
} from "./imadake.js";

import {
  IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
  IMADAKE_POST_DAILY_CHARGES_COLLECTION
} from "./imadake-cv.js";

import {
  IMADAKE_MONTHLY_INVOICES_COLLECTION
} from "./imadake-monthly-close.js";

import {
  STORE_CUSTOM_PLAN_USAGE_COLLECTION
} from "./store-custom-plan-billing.js";

import {
  STORE_CUSTOM_PROFILES_COLLECTION,
  cancelStoreCustomPlan,
  isStoreMenuPhotoPublicId
} from "./store-custom-profile.js";

import {
  LISTING_HIDDEN_BY_OWNER_ACCOUNT_DELETION,
  isStorePhotoPublicId
} from "./store-profile.js";

import {
  storeCustomPlanCronSecretsMatch
} from "./store-custom-plan-cron.js";

const STORE_MEMBERS_COLLECTION = "storeMembers";
const STORE_ACCOUNTS_COLLECTION = "storeAccounts";
const STORE_PROFILES_COLLECTION = "storeProfiles";
const STORE_LISTING_LINKS_COLLECTION = "storeListingLinks";
const OPERATORS_COLLECTION = "operators";
// STEP 47-C ④｜退会の取り消し等の履歴(サーバーだけが書く。Rules に許可なし)。
const ACCOUNT_DELETION_EVENTS_COLLECTION = "accountDeletionEvents";
const RATE_LIMITS_COLLECTION = "storeBillingRateLimits";

// 削除の操作は同じアカウントで10秒に1回まで(連打で処理を重ねない)。
const DELETION_COOLDOWN_MS = 10 * 1000;

// 定期実行(accountDeletionSweep)1回で進める件数の上限。
const SWEEP_MAX_RECORDS = 20;

// 掲載を終える今だけ投稿の状態(審査待ちは取り下げ、掲載中は終了)。
const ENDABLE_POST_STATUSES = ["pending", "published"];

// 最終削除の処理中の印の有効時間(同時に2つの最終削除を走らせない。途中で止まっても、この時間の後に再開できる)。
const FINALIZE_LEASE_MS = 60 * 1000;

// 清算(請求とお支払い)が済めば解消する理由。これだけなら退会を受け付けて清算を待つ。
const SETTLEMENT_BLOCKERS = [
  "imadake_invoice_unsettled",
  "imadake_charges_unbilled",
  "custom_plan_unbilled",
  "custom_plan_invoice_unsettled",
  "billing_locked"
];

// 最終削除を進めてよい記録の状態(清算待ち・途中で止まったもの)。card_detach_failed は運営の再開だけが進める。
const ADVANCEABLE_STATUSES = ["awaiting_settlement", "finalizing", "card_detach_pending", "auth_delete_pending"];

// STEP 47-D｜本番(Production)での自動の最終削除の許可(コード内の固定値)。本番の定期実行の登録を代表が承認するまで
// false のまま変えない。false の間、本番では単独の入口(accountDeletionSweep)も毎日の定期実行の手順も動かない
// (店主本人の操作による退会・削除と、運営の再開は従来どおり)。
export const ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED =
  false;

// 自動の最終削除を、この環境で動かしてよいか(本番は上の許可が true の時だけ)。
export function isAccountDeletionSweepAllowed(env) {
  return !(env && env.VERCEL_ENV === "production") || ACCOUNT_DELETION_SWEEP_PRODUCTION_ENABLED === true;
}

// STEP 47-C ②｜自動の最終削除(定期実行)の排他。同時に2つの定期実行が走っても、片方だけが進める。
const SWEEP_LOCK_COLLECTION = "accountDeletionSweepLocks";
const SWEEP_LOCK_ID = "main";
const SWEEP_LOCK_LEASE_MS = 5 * 60 * 1000;
// 1回の定期実行で使う時間の目安(Vercel の実行時間の上限より十分短く)。過ぎたら残りは次の実行に回す。
const SWEEP_TIME_BUDGET_MS = 20 * 1000;

// STEP 47-C ③｜運営への異常の通知。operatorAlerts/{種類}_{uid} に1件だけ作る(同じ異常は二度通知しない)。
// 通知そのものは、定期実行の応答を「失敗(500 operator_attention_required)」にして、呼び出し側の定期実行の仕組み
// (GitHub Actions・cron-job.org)が送る失敗のメールで知らせる(新しい契約・秘密値は不要)。応答・記録には
// 異常の種類と件数だけを入れ、メールアドレス・カードの情報・店舗名は入れない。
const OPERATOR_ALERTS_COLLECTION = "operatorAlerts";
// 最終削除の同じ段階が、この回数を超えて進まなければ「停止」として通知する。
const STALL_ATTEMPTS = 3;

function sendError(response, status, reason, extra) {
  return response.status(status).json(Object.assign({ success: false, reason: reason }, extra || {}));
}

// このアカウントが有効な owner の店舗(storeMembers の role owner・status active)。
async function findOwnedStoreIds(database, uid) {
  const snapshot = await database.collection(STORE_MEMBERS_COLLECTION).where("uid", "==", uid).get();
  const storeIds = [];

  snapshot.docs.forEach(function(doc) {
    const member = doc.data() || {};

    if (
      member.uid === uid &&
      member.role === "owner" &&
      member.status === "active" &&
      typeof member.storeId === "string" &&
      member.storeId !== "" &&
      doc.id === member.storeId + "_" + uid &&
      !storeIds.includes(member.storeId)
    ) {
      storeIds.push(member.storeId);
    }
  });

  return storeIds;
}

// 記録にある店舗のうち、今もこのアカウントが owner(有効、または退会で外した関係)のものだけ。後から別の人の
// 店舗になった店舗の写真・掲載には触れない。
async function filterFormerOwnStores(database, uid, storeIds) {
  const result = [];

  for (const storeId of Array.from(new Set(storeIds))) {
    if (typeof storeId !== "string" || storeId === "" || storeId.includes("/")) {
      continue;
    }

    const member = await database.collection(STORE_MEMBERS_COLLECTION).doc(storeId + "_" + uid).get();
    const data = member.exists ? member.data() || {} : {};

    if (
      data.uid === uid &&
      data.role === "owner" &&
      (data.status === "active" || (data.status === "removed" && data.removedReason === "account_deletion"))
    ) {
      const others = await database.collection(STORE_MEMBERS_COLLECTION).where("storeId", "==", storeId).get();
      const otherActiveOwner = others.docs.some(function(doc) {
        const other = doc.data() || {};
        return other.uid !== uid && other.role === "owner" && other.status === "active";
      });

      if (!otherActiveOwner) {
        result.push(storeId);
      }
    }
  }

  return result;
}

// 月末締めが請求に入れる条件(imadake-monthly-close.js)を満たす未請求の料金か。請求されない行(課金対象でない投稿・
// テスト店舗・形の合わない行)は清算の対象にならないため、削除を止める理由にしない。
function isUnbilledImadakeCharge(data, storeId, post, store) {
  return (
    data.status === "accrued" &&
    !data.invoiceId &&
    data.storeId === storeId &&
    data.amountJpy === IMADAKE_DAILY_CHARGE_AMOUNT_JPY &&
    data.currency === "JPY" &&
    Number(data.validCvCount) >= 1 &&
    Boolean(post) &&
    post.cvBillingEnabled === true &&
    post.storeId === storeId &&
    !(store && store.isTestAccount === true)
  );
}

function hasCardOrUnfinishedDetach(section) {
  const pending = Array.isArray(section.detachPendingPaymentMethods) ? section.detachPendingPaymentMethods : [];

  return (
    (typeof section.paymentMethodId === "string" && section.paymentMethodId.startsWith("pm_")) ||
    pending.some(function(entry) { return entry && ["pending", "detaching", "failed"].includes(entry.state); })
  );
}

// この環境でカードを Stripe から取り外せる設定(カード登録の設定)。本人の操作では本人のログイン(actor)から、
// 定期実行・運営の再開では本人がいないため先行テストの扱いなし(cardLiveTrial false)で決める。
function readDeletionCardConfig(deps, actor) {
  return readStripeCardSetupConfig(deps.env, cardSetupOptionsFor(deps, actor));
}

// 削除できない理由の一覧(空なら削除できる)。読むだけで何も書かない。
export async function findAccountDeletionBlockers(database, uid, storeIds, usableMode) {
  const blockers = new Set();

  const imadakeInvoiceQueries = storeIds.map(function(storeId) {
    return database.collection(IMADAKE_MONTHLY_INVOICES_COLLECTION).where("storeId", "==", storeId).get();
  });
  imadakeInvoiceQueries.push(
    database.collection(IMADAKE_MONTHLY_INVOICES_COLLECTION).where("chargeBillingAccountUid", "==", uid).get()
  );

  (await Promise.all(imadakeInvoiceQueries)).forEach(function(snapshot) {
    snapshot.docs.forEach(function(doc) {
      if ((doc.data() || {}).status !== "paid") {
        blockers.add("imadake_invoice_unsettled");
      }
    });
  });

  for (const storeId of storeIds) {
    const charges = await database
      .collection(IMADAKE_POST_DAILY_CHARGES_COLLECTION)
      .where("storeId", "==", storeId)
      .where("status", "==", "accrued")
      .get();

    if (charges.empty) {
      continue;
    }

    const store = await database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId).get();
    const posts = new Map();

    for (const doc of charges.docs) {
      const data = doc.data() || {};
      const postId = typeof data.postId === "string" ? data.postId : "";

      if (postId !== "" && !posts.has(postId)) {
        const post = await database.collection(IMADAKE_POSTS_COLLECTION).doc(postId).get();
        posts.set(postId, post.exists ? post.data() || {} : null);
      }

      if (isUnbilledImadakeCharge(data, storeId, posts.get(postId), store.exists ? store.data() || {} : null)) {
        blockers.add("imadake_charges_unbilled");
        break;
      }
    }
  }

  const planUsage = await database
    .collection(STORE_CUSTOM_PLAN_USAGE_COLLECTION)
    .where("billingAccountUid", "==", uid)
    .where("status", "==", "accrued")
    .get();

  if (!planUsage.empty) {
    blockers.add("custom_plan_unbilled");
  }

  const planInvoices = await database
    .collection(STORE_CUSTOM_PLAN_INVOICES_COLLECTION)
    .where("billingAccountUid", "==", uid)
    .get();

  planInvoices.docs.forEach(function(doc) {
    if ((doc.data() || {}).status !== "paid") {
      blockers.add("custom_plan_invoice_unsettled");
    }
  });

  const billing = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid).get();
  const billingData = billing.exists ? billing.data() || {} : {};

  ["test", "live"].forEach(function(mode) {
    const section = billingData[mode] && typeof billingData[mode] === "object" ? billingData[mode] : {};

    if (readBillingLocks(section).length > 0) {
      blockers.add("billing_locked");
    }

    // 本番(live)のカードがあるのに、この環境で本番のカード登録の設定が使えない時は、Stripe から取り外せない
    // (実際のカードを残したまま記録だけを消さない)。
    if (mode === "live" && usableMode !== "live" && hasCardOrUnfinishedDetach(section)) {
      blockers.add("live_card_removal_unavailable");
    }
  });

  return Array.from(blockers);
}

function onlySettlementBlockers(blockers) {
  return blockers.every(function(blocker) { return SETTLEMENT_BLOCKERS.includes(blocker); });
}

// 画面の確認用の要約(件数と、カードの有無だけ。カードの番号や Stripe の ID は返さない)。
async function summarizeAccount(database, uid, storeIds) {
  let publishedStoreCount = 0;
  let activePostCount = 0;

  for (const storeId of storeIds) {
    const profile = await database.collection(STORE_PROFILES_COLLECTION).doc(storeId).get();

    if (profile.exists && (profile.data() || {}).status === "published") {
      publishedStoreCount++;
    }

    const posts = await database.collection(IMADAKE_POSTS_COLLECTION).where("storeId", "==", storeId).get();

    posts.docs.forEach(function(doc) {
      if (ENDABLE_POST_STATUSES.includes((doc.data() || {}).status)) {
        activePostCount++;
      }
    });
  }

  const billing = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid).get();
  const billingData = billing.exists ? billing.data() || {} : {};
  const hasCard = ["test", "live"].some(function(mode) {
    const section = billingData[mode];
    return Boolean(section) && typeof section.paymentMethodId === "string" && section.paymentMethodId.startsWith("pm_");
  });

  return {
    storeCount: storeIds.length,
    publishedStoreCount: publishedStoreCount,
    activePostCount: activePostCount,
    hasCard: hasCard
  };
}

// 1店舗の今だけ投稿の掲載を終える(審査待ちは取り下げ、掲載中は終了)。投稿の文書は消さない。
async function endStorePosts(database, storeId, uid) {
  const posts = await database.collection(IMADAKE_POSTS_COLLECTION).where("storeId", "==", storeId).get();
  const slotRef = database.collection(IMADAKE_STORE_SLOTS_COLLECTION).doc(storeId);

  for (const doc of posts.docs) {
    if (!ENDABLE_POST_STATUSES.includes((doc.data() || {}).status)) {
      continue;
    }

    const postRef = database.collection(IMADAKE_POSTS_COLLECTION).doc(doc.id);

    await database.runTransaction(async function(transaction) {
      // STEP 47-C ④｜本人が取り消した後は掲載を終えない(取り消しとの競合)。
      if (!(await readAccountDeletion(database, uid, transaction))) {
        return;
      }

      const postSnapshot = await transaction.get(postRef);
      const slotSnapshot = await transaction.get(slotRef);
      const post = postSnapshot.exists ? postSnapshot.data() || {} : {};
      const slot = slotSnapshot.exists ? slotSnapshot.data() || {} : {};

      if (post.storeId !== storeId || !ENDABLE_POST_STATUSES.includes(post.status)) {
        return;
      }

      transaction.update(postRef, {
        status: post.status === "pending" ? "withdrawn" : "ended",
        endedAt: FieldValue.serverTimestamp(),
        endedByType: "account_deletion",
        statusChangedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      const slotUpdate = {};

      if (slot.pendingPostId === doc.id) {
        slotUpdate.pendingPostId = "";
      }

      if (slot.activePostId === doc.id) {
        Object.assign(slotUpdate, EMPTY_ACTIVE_SLOT_FIELDS);
      }

      if (Object.keys(slotUpdate).length > 0) {
        transaction.set(slotRef, { ...slotUpdate, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    });
  }
}

// 1店舗を旅行者から見えなくする：店舗情報を非公開(draft)にし、店舗を無効にする。文書は消さない。
async function hideStore(database, storeId, uid) {
  const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
  const profileRef = database.collection(STORE_PROFILES_COLLECTION).doc(storeId);

  await database.runTransaction(async function(transaction) {
    // STEP 47-C ④｜本人が取り消した後は非公開にしない(取り消しとの競合)。
    if (!(await readAccountDeletion(database, uid, transaction))) {
      return;
    }

    const snapshots = await Promise.all([transaction.get(accountRef), transaction.get(profileRef)]);
    const account = snapshots[0].exists ? snapshots[0].data() || {} : null;
    const profile = snapshots[1].exists ? snapshots[1].data() || {} : null;

    if (profile && profile.status === "published") {
      transaction.update(profileRef, {
        status: "draft",
        unpublishedAt: FieldValue.serverTimestamp(),
        unpublishedByUid: uid,
        unpublishedReason: "account_deletion"
      });
    }

    // 退会の前から無効だった店舗(運営による停止等)は、その理由を上書きしない(取り消しの時に戻す対象を区別する)。
    if (account && account.enabled !== false) {
      transaction.update(accountRef, {
        enabled: false,
        disabledReason: "owner_account_deleted",
        ownerAccountDeletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  });
}

// ③運営掲載との有効な紐付けに「店主の退会で非公開」の印を付ける(紐付け自体は外さない＝他の人は引き継げず、
// 旅行者向けの一覧からも外れたまま)。再掲載は運営が紐付けを解除した時(既存の adminStoreListingLinkRevoke)。
async function markListingLinksWithdrawn(database, storeId) {
  const links = await database.collection(STORE_LISTING_LINKS_COLLECTION).where("storeId", "==", storeId).get();

  for (const doc of links.docs) {
    const link = doc.data() || {};

    if (link.status === "active" && link.listingHiddenReason !== LISTING_HIDDEN_BY_OWNER_ACCOUNT_DELETION) {
      await database.collection(STORE_LISTING_LINKS_COLLECTION).doc(doc.id).update({
        listingHiddenReason: LISTING_HIDDEN_BY_OWNER_ACCOUNT_DELETION,
        listingHiddenAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  }
}

async function hideStores(database, storeIds, uid) {
  for (const storeId of storeIds) {
    await endStorePosts(database, storeId, uid);
    await hideStore(database, storeId, uid);
    await markListingLinksWithdrawn(database, storeId);
  }
}

// ②月額100円カスタマイズを解約する(当月分は請求に残る。翌月以降は発生しない)。契約が無い店舗は何もしない。
async function cancelCustomPlans(database, storeIds, uid, nowMillis) {
  for (const storeId of storeIds) {
    // STEP 47-C ④｜本人が取り消した後は解約しない(取り消しとの競合)。
    if (!(await readAccountDeletion(database, uid))) {
      return;
    }

    await cancelStoreCustomPlan(database, storeId, uid, nowMillis);
  }
}

// ⑨店舗の写真(無料の店舗写真・月額プランの商品写真)を Cloudinary から消し、文書から外す。
// 消すのは、その店舗専用のフォルダー(machinau_store_profiles/{storeId}/…)の画像だけ。運営掲載の元の画像・
// 今だけ投稿・他の店舗の画像はフォルダーが違うため対象にならない(引き継ぎ時の写真は店舗フォルダーへの複製)。
// 消せなかった画像は文書に残し、記録に件数を残す(店舗は非公開のため旅行者には出ない)。
async function deleteStorePhotosForDeletion(database, deps, storeIds) {
  let deleted = 0;
  const failedIds = [];

  if (typeof deps.destroyStorePhotoImages !== "function") {
    return { deleted: 0, failedIds: [], unavailable: true };
  }

  for (const storeId of storeIds) {
    const profileRef = database.collection(STORE_PROFILES_COLLECTION).doc(storeId);
    const customRef = database.collection(STORE_CUSTOM_PROFILES_COLLECTION).doc(storeId);
    const snapshots = await Promise.all([profileRef.get(), customRef.get()]);
    const profile = snapshots[0].exists ? snapshots[0].data() || {} : null;
    const custom = snapshots[1].exists ? snapshots[1].data() || {} : null;
    const photoIds = (profile && Array.isArray(profile.photos) ? profile.photos : [])
      .map(function(photo) { return photo && photo.publicId; })
      .filter(function(publicId) { return isStorePhotoPublicId(publicId, storeId); });
    const menuIds = (custom && Array.isArray(custom.menuItems) ? custom.menuItems : [])
      .map(function(item) { return item && item.photo && item.photo.publicId; })
      .filter(function(publicId) { return isStoreMenuPhotoPublicId(publicId, storeId); });
    const targets = photoIds.concat(menuIds);

    if (targets.length === 0) {
      continue;
    }

    let results;

    try {
      results = await deps.destroyStorePhotoImages(targets);
    } catch (error) {
      console.error("アカウントの削除：写真の削除エラー：", JSON.stringify({ storeId: storeId, detail: error && error.message }));
      results = targets.map(function(publicId) { return { publicId: publicId, ok: false }; });
    }

    const removed = new Set(
      (Array.isArray(results) ? results : [])
        .filter(function(result) { return result && result.ok === true; })
        .map(function(result) { return result.publicId; })
    );

    targets.forEach(function(publicId) {
      if (removed.has(publicId)) {
        deleted++;
      } else {
        failedIds.push(publicId);
      }
    });

    if (removed.size === 0) {
      continue;
    }

    if (profile && photoIds.some(function(publicId) { return removed.has(publicId); })) {
      await profileRef.update({
        photos: profile.photos.filter(function(photo) { return !(photo && removed.has(photo.publicId)); }),
        photosDeletedForAccountDeletionAt: FieldValue.serverTimestamp()
      });
    }

    if (custom && menuIds.some(function(publicId) { return removed.has(publicId); })) {
      await customRef.update({
        menuItems: custom.menuItems.map(function(item) {
          return item && item.photo && removed.has(item.photo.publicId) ? { ...item, photo: null } : item;
        }),
        photosDeletedForAccountDeletionAt: FieldValue.serverTimestamp()
      });
    }
  }

  return { deleted: deleted, failedIds: failedIds };
}

// このアカウントの店舗との関係(storeMembers)を外す。文書は消さず、状態だけを変える(履歴として残す)。
async function removeMemberships(database, uid) {
  const snapshot = await database.collection(STORE_MEMBERS_COLLECTION).where("uid", "==", uid).get();

  for (const doc of snapshot.docs) {
    const member = doc.data() || {};

    if (member.status === "active") {
      await database.collection(STORE_MEMBERS_COLLECTION).doc(doc.id).update({
        status: "removed",
        removedReason: "account_deletion",
        removedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  }
}

async function writeDeletionRecord(deletionRef, fields) {
  await deletionRef.set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

function isAuthUserMissing(error) {
  const code = error && (error.code || (error.errorInfo && error.errorInfo.code));
  return code === "auth/user-not-found";
}

function readNowMillis(deps) {
  return deps && typeof deps.now === "function" ? deps.now() : Date.now();
}

// 運営のアカウント(代表＝ADMIN_EMAIL・Editor)は、店舗画面からは削除しない(管理本部に入れなくなるため)。
async function isOperatorAccount(database, actor) {
  if (actor.adminEmailAccount === true) {
    return true;
  }

  const operator = await database.collection(OPERATORS_COLLECTION).doc(actor.uid).get();
  return operator.exists;
}

// STEP 47-C ①｜ログインの無い処理(定期実行・運営の再開)でも、最終削除の前に運営のアカウントかを確かめる
// (Editor＝operators/{uid}、代表＝ログインの登録メールが ADMIN_EMAIL。確かめられない時は運営とみなして止める)。
async function isOperatorUid(database, deps, uid) {
  const operator = await database.collection(OPERATORS_COLLECTION).doc(uid).get();

  if (operator.exists) {
    return true;
  }

  if (typeof deps.isAdminUid !== "function") {
    return false;
  }

  try {
    return (await deps.isAdminUid(uid)) === true;
  } catch (error) {
    if (isAuthUserMissing(error)) {
      return false;
    }

    console.error("アカウントの削除：運営のアカウントかを確認できませんでした：", error && error.message);
    return true;
  }
}

function operatorAlertRef(database, kind, uid) {
  return database.collection(OPERATOR_ALERTS_COLLECTION).doc("account_deletion_" + kind + "_" + uid);
}

// 運営の対応が必要な異常を1件だけ記録する(既に未解決の同じ異常があれば何もしない＝重複の通知をしない)。
// 記録の失敗は削除の処理を止めない(安全側の状態は accountDeletions に残っている)。
async function raiseOperatorAlert(database, kind, uid, detail) {
  try {
    const ref = operatorAlertRef(database, kind, uid);

    await database.runTransaction(async function(transaction) {
      const snapshot = await transaction.get(ref);

      if (snapshot.exists && (snapshot.data() || {}).status === "open") {
        return;
      }

      transaction.set(ref, {
        source: "account_deletion",
        kind: kind,
        subjectUid: uid,
        detail: detail || "",
        status: "open",
        signaledAt: null,
        raisedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
  } catch (error) {
    console.error("アカウントの削除：運営への異常の記録に失敗：", kind, error && error.message);
  }
}

// この退会の未解決の異常を解決済みにする(完了・取り消し・運営の再開の時)。
async function resolveOperatorAlerts(database, uid, kinds) {
  for (const kind of kinds) {
    try {
      const ref = operatorAlertRef(database, kind, uid);
      const snapshot = await ref.get();

      if (snapshot.exists && (snapshot.data() || {}).status === "open") {
        await ref.update({ status: "resolved", resolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      }
    } catch (error) {
      console.error("アカウントの削除：運営への異常の解決の記録に失敗：", kind, error && error.message);
    }
  }
}

const ALERT_KINDS = ["card_detach_failed", "final_deletion_stalled", "operator_account_protected"];

// まだ知らせていない未解決の異常を「知らせた」にして、その種類ごとの件数を返す(1件につき1回だけ知らせる)。
async function claimUnsignaledOperatorAlerts(database) {
  const snapshot = await database
    .collection(OPERATOR_ALERTS_COLLECTION)
    .where("source", "==", "account_deletion")
    .where("status", "==", "open")
    .get();
  const kinds = {};

  for (const doc of snapshot.docs) {
    const claimed = await database.runTransaction(async function(transaction) {
      const current = await transaction.get(doc.ref);
      const data = current.exists ? current.data() || {} : {};

      if (data.status !== "open" || data.signaledAt) {
        return "";
      }

      transaction.update(doc.ref, { signaledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return typeof data.kind === "string" ? data.kind : "unknown";
    });

    if (claimed !== "") {
      kinds[claimed] = (kinds[claimed] || 0) + 1;
    }
  }

  return kinds;
}

// 最終削除(清算が済んだ時だけ進む)。actor は本人のログイン、または { uid, cardLiveTrial: false }。
// 戻り値 { httpStatus, status, blockers? }
export async function finalizeAccountDeletion(database, deps, actor) {
  const uid = actor.uid;
  const deletionRef = accountDeletionRef(database, uid);

  const nowMillis = readNowMillis(deps);

  // finalizing にする(以後カードの登録・変更を受け付けない)。進められない状態・別の処理が進めている間は何もしない。
  const started = await database.runTransaction(async function(transaction) {
    const record = await readAccountDeletion(database, uid, transaction);

    if (!record || !ADVANCEABLE_STATUSES.includes(record.status)) {
      return record;
    }

    if (record.status === "finalizing" && Number(record.finalizeLeaseUntilMs) > nowMillis) {
      return { ...record, status: "busy" };
    }

    transaction.set(deletionRef, {
      status: "finalizing",
      finalizeLeaseUntilMs: nowMillis + FINALIZE_LEASE_MS,
      finalizeAttempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { ...record, status: "finalizing" };
  });

  if (!started) {
    return { httpStatus: 404, status: "", reason: "deletion_not_requested" };
  }

  if (started.status === "busy") {
    return { httpStatus: 202, status: "finalizing" };
  }

  if (started.status !== "finalizing") {
    return { httpStatus: started.status === "completed" ? 200 : 202, status: started.status };
  }

  // ①運営のアカウントは、ログインの無い処理からでも削除しない(止めて運営に知らせる)。
  if (await isOperatorUid(database, deps, uid)) {
    await writeDeletionRecord(deletionRef, { status: "operator_protected", blockers: [] });
    await raiseOperatorAlert(database, "operator_account_protected", uid, "");
    return { httpStatus: 409, status: "operator_protected" };
  }

  const config = readDeletionCardConfig(deps, actor);
  const usableMode = config.ok ? config.mode : "";
  const ownedStoreIds = await findOwnedStoreIds(database, uid);
  const storeIds = await filterFormerOwnStores(database, uid, [
    ...(Array.isArray(started.storeIds) ? started.storeIds : []),
    ...ownedStoreIds
  ]);

  // 受付の後に増えた店舗・投稿も、非公開・掲載終了にする(同時の操作の取りこぼしを防ぐ)。
  await hideStores(database, ownedStoreIds, uid);

  // 清算をもう一度確かめる(finalizing の後なので、新しいカードで請求が始まることはない)。
  const blockers = await findAccountDeletionBlockers(database, uid, ownedStoreIds, usableMode);

  if (blockers.length > 0) {
    await writeDeletionRecord(deletionRef, { status: "awaiting_settlement", blockers: blockers, storeIds: storeIds });

    // 清算では解消しない理由(本番のカードをこの環境で外せない等)は、運営の対応が必要。
    if (!onlySettlementBlockers(blockers)) {
      await raiseOperatorAlert(database, "final_deletion_stalled", uid, "card_removal_unavailable");
    }

    return { httpStatus: 202, status: "awaiting_settlement", blockers: blockers };
  }

  // ④カードを外す(Customer は残す)。
  const cards = await removeAccountCardsForDeletion(database, deps, uid, config);

  if (cards.customerIds && Object.keys(cards.customerIds).length > 0) {
    await writeDeletionRecord(deletionRef, { stripeCustomerIds: cards.customerIds });
  }

  if (!cards.ok) {
    if (cards.reason === "card_detach_pending") {
      await writeDeletionRecord(deletionRef, { status: "card_detach_pending", blockers: [] });
      return { httpStatus: 202, status: "card_detach_pending" };
    }

    if (cards.reason === "card_detach_failed") {
      // ⑩自動の再試行はここで止める。運営が原因を確かめて adminAccountDeletionResume で再開する。
      await writeDeletionRecord(deletionRef, {
        status: "card_detach_failed",
        blockers: [],
        operatorAttention: { reason: "card_detach_failed", at: FieldValue.serverTimestamp() }
      });
      console.error("アカウントの削除：カードの取り外しが上限まで失敗して停止しました(運営の確認が必要)。");
      await raiseOperatorAlert(database, "card_detach_failed", uid, "");
      return { httpStatus: 202, status: "card_detach_failed" };
    }

    // 請求中のロック・本番のカードを外せない環境：清算待ちに戻す(カードの記録は変えていない)。
    await writeDeletionRecord(deletionRef, { status: "awaiting_settlement", blockers: [cards.reason] });

    if (cards.reason !== "billing_locked") {
      await raiseOperatorAlert(database, "final_deletion_stalled", uid, "card_removal_unavailable");
    }

    return { httpStatus: 202, status: "awaiting_settlement", blockers: [cards.reason] };
  }

  // ⑨写真を消す(消せなかった画像は記録に残して先へ進む)。
  const photos = await deleteStorePhotosForDeletion(database, deps, storeIds);
  await writeDeletionRecord(deletionRef, {
    photosDeletedCount: FieldValue.increment(photos.deleted),
    photoDeleteFailedIds: photos.failedIds
  });

  // owner の関係を外す → カードの記録を消す → ログインを削除する(最後。元に戻せないため)。
  await removeMemberships(database, uid);
  await database.collection(ACCOUNT_BILLING_COLLECTION).doc(uid).delete();

  try {
    await deps.deleteAuthUser(uid);
  } catch (error) {
    if (!isAuthUserMissing(error)) {
      await writeDeletionRecord(deletionRef, { status: "auth_delete_pending" });

      // 何度試してもログインを削除できない：運営に知らせる(カード・関係は既に外れている)。
      if ((Number(started.finalizeAttempts) || 0) + 1 >= STALL_ATTEMPTS) {
        await raiseOperatorAlert(database, "final_deletion_stalled", uid, "auth_delete");
      }

      throw error;
    }
  }

  await writeDeletionRecord(deletionRef, {
    status: "completed",
    blockers: [],
    operatorAttention: FieldValue.delete(),
    completedAt: FieldValue.serverTimestamp()
  });
  await resolveOperatorAlerts(database, uid, ALERT_KINDS);
  return { httpStatus: 200, status: "completed" };
}

// 退会の受付(本人の操作)。戻り値 { httpStatus, status, reason?, blockers? }
export async function requestAccountDeletion(database, deps, actor) {
  const uid = actor.uid;
  const deletionRef = accountDeletionRef(database, uid);
  const record = await readAccountDeletion(database, uid);

  if (record && record.status === "completed") {
    return { httpStatus: 200, status: "completed" };
  }

  // ⑩運営の確認待ち：本人の操作では再試行しない。
  if (record && record.status === "card_detach_failed") {
    return { httpStatus: 202, status: "card_detach_failed" };
  }

  if (!record) {
    const config = readDeletionCardConfig(deps, actor);
    const storeIds = await findOwnedStoreIds(database, uid);
    const blockers = await findAccountDeletionBlockers(database, uid, storeIds, config.ok ? config.mode : "");

    // 清算で解消しない理由(本番のカードをこの環境で外せない等)があれば、何も変えずに止める。
    if (!onlySettlementBlockers(blockers)) {
      return { httpStatus: 409, status: "", reason: "not_deletable", blockers: blockers };
    }

    // 記録を作る(同時の受付は1つだけ。記録がある間は店舗の登録・引き継ぎ・課金対象の投稿・月額プランの申込を止める)。
    await database.runTransaction(async function(transaction) {
      if (await readAccountDeletion(database, uid, transaction)) {
        return;
      }

      transaction.set(deletionRef, {
        uid: uid,
        status: "awaiting_settlement",
        blockers: blockers,
        storeIds: storeIds,
        requestedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });
  }

  const current = await readAccountDeletion(database, uid);
  const storeIds = Array.from(new Set([
    ...(Array.isArray(current && current.storeIds) ? current.storeIds : []),
    ...(await findOwnedStoreIds(database, uid))
  ]));

  // ①②新規の有料利用を止める：月額プランを解約し、今だけ投稿の掲載を終え、店舗を非公開・無効にする(③の印も付ける)。
  await cancelCustomPlans(database, storeIds, uid, readNowMillis(deps));
  await hideStores(database, storeIds, uid);
  await writeDeletionRecord(deletionRef, { storeIds: storeIds });

  return finalizeAccountDeletion(database, deps, actor);
}

// STEP 47-C ④｜退会の取り消し(最終削除の開始前＝awaiting_settlement の間だけ。本人の操作)。
// 取り消しと最終削除はどちらも退会の記録のトランザクションで状態を確かめるため、同時でも片方だけが成立する
// (最終削除が先に finalizing にしていれば取り消せない。取り消しが先なら最終削除は進まない)。
// 取り消しで戻すもの：退会で無効にした店舗の「無効」だけ(店舗情報は非公開のまま＝本人が公開し直す)。
// 戻さないもの：終了した今だけ投稿・解約した月額プラン(本人が投稿・申込をし直す)・運営掲載の非公開の印・
//   退会の前に発生した請求(請求書・料金台帳はそのまま。お支払いの義務は残る)。
export async function cancelAccountDeletion(database, deps, uid) {
  const deletionRef = accountDeletionRef(database, uid);
  const nowMillis = readNowMillis(deps);

  const outcome = await database.runTransaction(async function(transaction) {
    const record = await readAccountDeletion(database, uid, transaction);

    if (!record) {
      return { httpStatus: 409, reason: "deletion_not_requested" };
    }

    if (record.status !== "awaiting_settlement") {
      return { httpStatus: 409, reason: "deletion_in_progress", status: record.status };
    }

    transaction.set(deletionRef, {
      status: ACCOUNT_DELETION_CANCELED_STATUS,
      previousStatus: record.status,
      canceledAt: FieldValue.serverTimestamp(),
      canceledByUid: uid,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(database.collection(ACCOUNT_DELETION_EVENTS_COLLECTION).doc(uid + "_" + nowMillis + "_canceled"), {
      uid: uid,
      event: "canceled",
      storeIds: Array.isArray(record.storeIds) ? record.storeIds : [],
      blockersAtCancel: Array.isArray(record.blockers) ? record.blockers : [],
      requestedAt: record.requestedAt || null,
      at: FieldValue.serverTimestamp()
    });
    return { httpStatus: 200 };
  });

  if (outcome.httpStatus !== 200) {
    return outcome;
  }

  let reopenedStoreCount = 0;

  for (const storeId of await findOwnedStoreIds(database, uid)) {
    const accountRef = database.collection(STORE_ACCOUNTS_COLLECTION).doc(storeId);
    const reopened = await database.runTransaction(async function(transaction) {
      // 取り消しの後にもう一度退会を申し込まれていれば戻さない。
      if (await readAccountDeletion(database, uid, transaction)) {
        return false;
      }

      const snapshot = await transaction.get(accountRef);
      const account = snapshot.exists ? snapshot.data() || {} : null;

      if (!account || account.enabled !== false || account.disabledReason !== "owner_account_deleted") {
        return false;
      }

      transaction.update(accountRef, {
        enabled: true,
        disabledReason: "",
        ownerAccountDeletedAt: FieldValue.delete(),
        reenabledAfterDeletionCancelAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return true;
    });

    if (reopened) {
      reopenedStoreCount++;
    }
  }

  await resolveOperatorAlerts(database, uid, ALERT_KINDS);
  return { httpStatus: 200, status: ACCOUNT_DELETION_CANCELED_STATUS, reopenedStoreCount: reopenedStoreCount };
}

// 要求の本人(店舗アカウントのログイン。⑧メール確認の有無は問わない)。
async function requireStoreUserForDeletion(request, response, deps) {
  const result = await deps.resolveStoreUserActor(request);

  if (!result.ok) {
    sendError(response, result.status, result.status === 401 ? "login_required" : "store_account_required");
    return null;
  }

  return result.actor;
}

function publicStatusBody(result) {
  return Object.assign(
    { success: true, status: result.status },
    Array.isArray(result.blockers) ? { blockers: result.blockers } : {}
  );
}

// mode: storeAccountDeletionCheck (POST)
// {} → { success, deletable, blockers, deletionStatus, summary }(読むだけ。何も変えない)
//   deletable：退会を受け付けられるか(清算待ちになる場合も true。settlementRequired で区別する)
export async function handleStoreAccountDeletionCheck(request, response, deps) {
  try {
    const actor = await requireStoreUserForDeletion(request, response, deps);

    if (!actor) {
      return;
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());

    if (await isOperatorAccount(database, actor)) {
      return sendError(response, 403, "operator_account");
    }

    const storeIds = await findOwnedStoreIds(database, actor.uid);
    const config = readDeletionCardConfig(deps, actor);
    const blockers = await findAccountDeletionBlockers(database, actor.uid, storeIds, config.ok ? config.mode : "");
    const record = await readAccountDeletion(database, actor.uid);

    return response.status(200).json({
      success: true,
      deletable: onlySettlementBlockers(blockers),
      settlementRequired: blockers.length > 0 && onlySettlementBlockers(blockers),
      blockers: blockers,
      deletionStatus: record ? record.status || "" : "",
      // STEP 47-C ④｜取り消せるのは最終削除の開始前(清算待ち)の間だけ。
      cancelable: Boolean(record) && record.status === "awaiting_settlement",
      summary: await summarizeAccount(database, actor.uid, storeIds)
    });
  } catch (error) {
    console.error("アカウントの削除：確認エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: storeAccountDelete (POST)
// { confirm: true } → 200 { status: "completed" }
//                   / 202 { status: "awaiting_settlement", blockers }(退会を受け付けた。清算の後に削除)
//                   / 202 { status: "card_detach_pending" | "card_detach_failed" }
//                   / 409 { reason: "not_deletable", blockers }(何も変えていない)
// 退会の受付の後にもう一度呼ぶと、清算が済んでいれば最終削除へ進む。
export async function handleStoreAccountDelete(request, response, deps) {
  try {
    const actor = await requireStoreUserForDeletion(request, response, deps);

    if (!actor) {
      return;
    }

    const body = deps.readRequestBody(request) || {};

    if (body.confirm !== true) {
      return sendError(response, 400, "confirm_required");
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());

    if (await isOperatorAccount(database, actor)) {
      return sendError(response, 403, "operator_account");
    }

    const allowed = await deps.claimRateLimit(
      database,
      RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("accountDeletion", actor.uid),
      DELETION_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const result = await requestAccountDeletion(database, deps, actor);

    if (result.httpStatus === 409) {
      return sendError(response, 409, result.reason || "not_deletable", { blockers: result.blockers || [] });
    }

    return response.status(result.httpStatus).json(publicStatusBody(result));
  } catch (error) {
    console.error("アカウントの削除：エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// STEP 47-C ②｜定期実行の排他(同時に2つの定期実行が走っても片方だけが進める。止まっても5分で外れる)。
async function acquireSweepLock(database, runId, nowMillis) {
  const lockRef = database.collection(SWEEP_LOCK_COLLECTION).doc(SWEEP_LOCK_ID);

  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(lockRef);
    const lock = snapshot.exists ? snapshot.data() || {} : {};

    if (lock.runId && Number(lock.leaseUntilMs) > nowMillis) {
      return false;
    }

    transaction.set(lockRef, { runId: runId, leaseUntilMs: nowMillis + SWEEP_LOCK_LEASE_MS, acquiredAt: FieldValue.serverTimestamp() });
    return true;
  });
}

async function releaseSweepLock(database, runId) {
  const lockRef = database.collection(SWEEP_LOCK_COLLECTION).doc(SWEEP_LOCK_ID);

  await database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(lockRef);

    if (snapshot.exists && (snapshot.data() || {}).runId === runId) {
      transaction.set(lockRef, { runId: "", leaseUntilMs: 0, releasedAt: FieldValue.serverTimestamp() });
    }
  });
}

// mode: storeAccountDeletionCancel (POST) { confirm: true } → 200 { status: "canceled", reopenedStoreCount }
//   / 409 { reason: "deletion_not_requested" | "deletion_in_progress" }(最終削除が始まっていれば取り消せない)
export async function handleStoreAccountDeletionCancel(request, response, deps) {
  try {
    const actor = await requireStoreUserForDeletion(request, response, deps);

    if (!actor) {
      return;
    }

    const body = deps.readRequestBody(request) || {};

    if (body.confirm !== true) {
      return sendError(response, 400, "confirm_required");
    }

    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const allowed = await deps.claimRateLimit(
      database,
      RATE_LIMITS_COLLECTION,
      deps.computeRateLimitIdentifier("accountDeletionCancel", actor.uid),
      DELETION_COOLDOWN_MS
    );

    if (!allowed) {
      return sendError(response, 429, "rate_limited");
    }

    const result = await cancelAccountDeletion(database, deps, actor.uid);

    if (result.httpStatus !== 200) {
      return sendError(response, result.httpStatus, result.reason, result.status ? { status: result.status } : {});
    }

    return response.status(200).json({ success: true, status: result.status, reopenedStoreCount: result.reopenedStoreCount });
  } catch (error) {
    console.error("アカウントの削除：取り消しエラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// 清算待ち・途中で止まった記録を進める(定期実行の本体)。card_detach_failed・operator_protected は進めない
// (運営の確認だけ)。どの記録も最終削除の直前に清算をもう一度確かめる(未払い・結果不明・請求中は削除しない)。
// 戻り値には件数と異常の種類だけを入れる(uid・メール・カードの情報は入れない)。
//   operatorAttention：今回はじめて知らせる異常の種類ごとの件数(空なら知らせることは無い)。
export async function runAccountDeletionSweep(database, deps) {
  const nowMillis = readNowMillis(deps);
  const deadline = Date.now() + SWEEP_TIME_BUDGET_MS;
  const runId = (typeof deps.randomId === "function" ? deps.randomId() : String(nowMillis) + "_" + Math.random().toString(36).slice(2));

  if (!(await acquireSweepLock(database, runId, nowMillis))) {
    return { status: "locked", processed: 0, deferred: 0, counts: {}, operatorAttention: {} };
  }

  const counts = {};
  let processed = 0;
  let deferred = 0;

  try {
    const snapshot = await database
      .collection(ACCOUNT_DELETIONS_COLLECTION)
      .where("status", "in", ADVANCEABLE_STATUSES)
      .get();

    for (const doc of snapshot.docs) {
      if (processed >= SWEEP_MAX_RECORDS || Date.now() > deadline) {
        deferred++;
        continue;
      }

      processed++;
      let status = "error";

      try {
        const result = await finalizeAccountDeletion(database, deps, { uid: doc.id, cardLiveTrial: false });
        status = result.status || "unknown";
      } catch (error) {
        console.error("アカウントの削除：定期実行の1件でエラー：", error && error.message);
        const record = (doc.data() || {});
        const errorCount = (Number(record.sweepErrorCount) || 0) + 1;

        await writeDeletionRecord(accountDeletionRef(database, doc.id), { sweepErrorCount: errorCount }).catch(function() {});

        if (errorCount >= STALL_ATTEMPTS) {
          await raiseOperatorAlert(database, "final_deletion_stalled", doc.id, "repeated_error");
        }
      }

      counts[status] = (counts[status] || 0) + 1;
    }

    // 停止している記録(運営の確認待ち)も、異常として記録されているかを確かめる(取りこぼし防止)。
    const stopped = await database
      .collection(ACCOUNT_DELETIONS_COLLECTION)
      .where("status", "in", ["card_detach_failed", "operator_protected"])
      .get();

    for (const doc of stopped.docs) {
      await raiseOperatorAlert(
        database,
        (doc.data() || {}).status === "operator_protected" ? "operator_account_protected" : "card_detach_failed",
        doc.id,
        ""
      );
    }

    // 通知の取り出しに失敗しても、削除の結果は変えない(異常は未通知のまま残り、次の実行で知らせる)。
    let operatorAttention = {};

    try {
      operatorAttention = await claimUnsignaledOperatorAlerts(database);
    } catch (error) {
      console.error("アカウントの削除：運営への通知の準備に失敗(次の実行で再度知らせる)：", error && error.message);
    }

    return { status: deferred > 0 ? "partial" : "done", processed: processed, deferred: deferred, counts: counts, operatorAttention: operatorAttention };
  } finally {
    await releaseSweepLock(database, runId).catch(function(error) {
      console.error("アカウントの削除：定期実行のロック解除エラー：", error && error.message);
    });
  }
}

export function hasOperatorAttention(result) {
  return Boolean(result) && Boolean(result.operatorAttention) && Object.keys(result.operatorAttention).length > 0;
}

// mode: accountDeletionSweep (POST、合言葉 X-Machinau-Cron-Secret で認証。AI_COLLECT_CRON_SECRET を再利用)
// 清算(翌月2日の請求とお支払い)が済んだ退会を最終削除へ進める。本番の定期実行には未登録(代表の承認待ち)。
// 応答：200 { success, status, processed, deferred, counts, operatorAttention:{} }
//       500 { success:false, reason:"operator_attention_required", operatorAttention } … 運営の対応が必要な異常を
//           今回はじめて見つけた(定期実行の仕組みが失敗のメールを送る＝運営への通知。同じ異常では二度と 500 にしない)。
export async function handleAccountDeletionSweep(request, response, deps) {
  const expected = deps.env ? deps.env.AI_COLLECT_CRON_SECRET : "";

  if (typeof expected !== "string" || expected === "") {
    return response.status(503).json({ success: false, reason: "cron_secret_not_configured" });
  }

  const provided = request.headers && request.headers["x-machinau-cron-secret"];

  if (!storeCustomPlanCronSecretsMatch(typeof provided === "string" ? provided : "", expected)) {
    return response.status(401).json({ success: false, reason: "unauthorized" });
  }

  if (!isAccountDeletionSweepAllowed(deps.env)) {
    return response.status(403).json({ success: false, reason: "sweep_disabled" });
  }

  try {
    const database = deps.getFirestore(deps.getFirebaseAdminApp());
    const result = await runAccountDeletionSweep(database, deps);

    if (hasOperatorAttention(result)) {
      return response.status(500).json(Object.assign({ success: false, reason: "operator_attention_required" }, result));
    }

    return response.status(200).json(Object.assign({ success: true }, result));
  } catch (error) {
    console.error("アカウントの削除：定期実行エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}

// mode: adminAccountDeletionList (POST、運営のみ・読み取り専用)
// 完了していない退会の記録(清算待ち・途中・運営の確認が必要)。カードの番号・メールアドレスは返さない。
export async function handleAdminAccountDeletionList(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult || !authResult.ok) {
      return response.status((authResult && authResult.status) || 403).json({ success: false, message: (authResult && authResult.message) || "" });
    }

    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const snapshot = await database.collection(ACCOUNT_DELETIONS_COLLECTION).get();
    const records = snapshot.docs
      .map(function(doc) {
        const data = doc.data() || {};
        return {
          uid: doc.id,
          status: data.status || "",
          blockers: Array.isArray(data.blockers) ? data.blockers : [],
          storeIds: Array.isArray(data.storeIds) ? data.storeIds : [],
          needsOperator: data.status === "card_detach_failed" || data.status === "operator_protected",
          photoDeleteFailedCount: Array.isArray(data.photoDeleteFailedIds) ? data.photoDeleteFailedIds.length : 0
        };
      })
      .filter(function(record) { return (record.status !== "completed" && record.status !== "canceled") || record.photoDeleteFailedCount > 0; });

    const alerts = await database.collection(OPERATOR_ALERTS_COLLECTION).where("source", "==", "account_deletion").get();
    const openAlerts = alerts.docs
      .map(function(doc) { return doc.data() || {}; })
      .filter(function(alert) { return alert.status === "open"; })
      .map(function(alert) { return { kind: alert.kind || "", uid: alert.subjectUid || "", detail: alert.detail || "" }; });

    return response.status(200).json({ success: true, records: records, openAlerts: openAlerts });
  } catch (error) {
    console.error("アカウントの削除：運営の一覧エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminAccountDeletionResume (POST、運営のみ) { uid }
// ⑩カードの取り外しが上限まで失敗して止まった退会(card_detach_failed)だけを再開する：失敗したカードを
// 再試行できる状態に戻し、最終削除をもう1回だけ試す(また失敗すれば、再び card_detach_failed で止まる)。
// 未払いの判定・清算の確認は通常どおり行う(強制解除・成功の偽装はしない)。
export async function handleAdminAccountDeletionResume(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult || !authResult.ok) {
      return response.status((authResult && authResult.status) || 403).json({ success: false, message: (authResult && authResult.message) || "" });
    }

    const body = deps.readRequestBody(request) || {};
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";

    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
      return sendError(response, 400, "invalid_input");
    }

    const database = authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
    const deletionRef = accountDeletionRef(database, uid);
    const actor = { uid: uid, cardLiveTrial: false };
    const config = readDeletionCardConfig(deps, actor);

    if (!config.ok) {
      return sendError(response, 503, "billing_unavailable");
    }

    const reopened = await database.runTransaction(async function(transaction) {
      const record = await readAccountDeletion(database, uid, transaction);

      if (!record || record.status !== "card_detach_failed") {
        return false;
      }

      transaction.set(deletionRef, {
        status: "card_detach_pending",
        resumedByUid: authResult.actor && authResult.actor.uid ? authResult.actor.uid : "",
        resumedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    });

    if (!reopened) {
      return sendError(response, 409, "not_resumable");
    }

    const resetCount = await resetFailedCardDetachForDeletion(database, uid, config.mode);
    // 再開したので、この異常はいったん解決済みにする(再び止まれば、新しい異常として知らせる)。
    await resolveOperatorAlerts(database, uid, ["card_detach_failed"]);
    const result = await finalizeAccountDeletion(database, deps, actor);

    return response.status(200).json({ success: true, resetCount: resetCount, status: result.status });
  } catch (error) {
    console.error("アカウントの削除：運営の再開エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
