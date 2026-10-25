// ==========================================================================
// 今だけ投稿 決済 STEP 32-B｜月末締め(店舗別・月別の請求額の確定、サーバー側のみ)
// ==========================================================================
// 料金(代表確定)：1投稿×日本時間の1日に有効CVが1件以上あれば100円(税込)、0件なら0円。
// 同じ投稿・同じ日は何件でも100円。月末に店舗ごとに集計し、翌月に登録カードへ請求する。
//
// このファイルは「請求額の確定」だけを行う。Stripeへの請求(STEP 32-C)はしない(お金は動かない)。
//
// 元データ：日別料金台帳 imadakePostDailyCharges/{postId}_{日本時間の日付}
//   (課金対象の投稿に有効CVがあった日だけ、CV記録と同じトランザクションで作られる。api/_lib/imadake-cv.js)
// 結果：月次請求 imadakeMonthlyInvoices/{storeId}_{YYYY-MM}
//   { storeId, month, lineCount, amountJpy(税込), currency, taxIncluded, status, closeRunId, ... }
//   status: "closing"(締め処理中) → "closed"(請求額確定)。0円の店舗・月は作らない。確定は、台帳を読み直して
//   未請求0件・件数一致などを確かめた後だけ(止めた場合は "closing" のまま理由を報告する)。
//   STEP 32-Cで "closed" の後の状態(請求中・支払い済み等)を追加する。"closed" 以外の確定後の状態には触れない。
// 台帳には、請求にまとめた時に status: "invoiced"・invoiceId・invoicedAt を付ける。
//
// 二重計上の防止：
//   ・請求書IDを {storeId}_{YYYY-MM} に固定(同じ店舗・同じ月は1件)。
//   ・台帳1件ごとに「accrued(未請求)で invoiceId が無い」ことをトランザクション内で確かめ、
//     請求書の件数・金額の加算と台帳の印を同じトランザクションで行う(同時実行・再実行でも1回だけ)。
//   ・途中で止まった場合は請求書が "closing" のまま残り、再実行で残りの台帳だけを加える。
//   ・"closed" の後に未請求の台帳が見つかっても、確定済みの請求書は書き換えずに報告する。
//
// 請求対象外(集計に入れず、理由ごとに件数を返す)：台帳IDの不整合、対象月外、金額が100円・JPYでない、
// 有効CV 0件、投稿が無い、投稿が課金対象(cvBillingEnabled: true)でない、投稿と台帳の店舗が違う、
// テスト店舗(storeAccounts.isTestAccount: true)、想定外の状態。
//
// 既定は試算(dryRun)：読むだけで書き込まない。書き込み(締めの実行)は
// IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED が true の時だけ可能(現在 false＝代表の承認まで実行できない)。
// このファイルはVercel Functionではない(api/moderate-submission.js の mode から呼ばれる)。
// ==========================================================================

import {
  Timestamp
} from "firebase-admin/firestore";

import {
  randomUUID
} from "node:crypto";

import {
  IMADAKE_POSTS_COLLECTION
} from "./imadake.js";

import {
  isPreviewMonthlyCloseTrialEnabled
} from "./firebase-target.js";

import {
  IMADAKE_POST_DAILY_CHARGES_COLLECTION,
  IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
  computeImadakeCvDayKey
} from "./imadake-cv.js";

export const IMADAKE_MONTHLY_INVOICES_COLLECTION =
  "imadakeMonthlyInvoices";

// 締めの実行(Firestoreへの書き込み)の許可。代表の承認があるまで false のまま変えない。
export const IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED =
  false;

// 締めを実行できるのは、対象月の翌月のこの日(日本時間)以降(月末直前のCV記録の完了を待つ)。
export const IMADAKE_MONTHLY_CLOSE_EARLIEST_DAY =
  2;

const MONTH_PATTERN =
  /^(\d{4})-(0[1-9]|1[0-2])$/;

const JST_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

const STORE_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

const POST_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

const STORE_ACCOUNTS_COLLECTION =
  "storeAccounts";

const CHARGE_PAGE_SIZE =
  300;

// 1回のトランザクションで印を付ける台帳の件数(読み取り＋書き込みが上限500件を超えない値)。
const MARK_CHUNK_SIZE =
  200;

const READ_CONCURRENCY =
  25;

// 応答に載せるIDの最大件数(理由ごと)。件数は全件を数える。
const RESPONSE_ID_SAMPLE_LIMIT =
  20;

export function buildImadakeMonthlyInvoiceId(storeId, month) {
  return storeId + "_" + month;
}

// 対象月の日本時間の日付キーの範囲 [startKey, endKeyExclusive) と翌月を返す。不正なら null。
export function computeImadakeMonthRange(month) {
  const match = typeof month === "string" ? month.match(MONTH_PATTERN) : null;

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextMonth = String(nextYear) + "-" + String(nextMonthNumber).padStart(2, "0");

  return {
    month: month,
    startKey: month + "-01",
    endKeyExclusive: nextMonth + "-01",
    nextMonth: nextMonth
  };
}

// 締めを実行してよい時刻か(翌月の IMADAKE_MONTHLY_CLOSE_EARLIEST_DAY 日 0時(日本時間)以降)。
export function isImadakeMonthClosable(month, nowMillis) {
  const range = computeImadakeMonthRange(month);

  if (!range) {
    return false;
  }

  const earliestKey = range.nextMonth + "-" + String(IMADAKE_MONTHLY_CLOSE_EARLIEST_DAY).padStart(2, "0");

  return computeImadakeCvDayKey(nowMillis) >= earliestKey;
}

async function listMonthCharges(database, range) {
  const rows = [];
  let lastSnapshot = null;

  for (;;) {
    let query = database
      .collection(IMADAKE_POST_DAILY_CHARGES_COLLECTION)
      .where("jstDate", ">=", range.startKey)
      .where("jstDate", "<", range.endKeyExclusive)
      .orderBy("jstDate")
      .limit(CHARGE_PAGE_SIZE);

    if (lastSnapshot) {
      query = query.startAfter(lastSnapshot);
    }

    const snapshot = await query.get();

    snapshot.docs.forEach(function(doc) {
      rows.push({ id: doc.id, data: doc.data() || {} });
    });

    if (snapshot.docs.length < CHARGE_PAGE_SIZE) {
      return rows;
    }

    lastSnapshot = snapshot.docs[snapshot.docs.length - 1];
  }
}

async function readDocsById(database, collectionName, ids) {
  const result = new Map();
  const list = Array.from(new Set(ids));

  for (let index = 0; index < list.length; index += READ_CONCURRENCY) {
    const part = list.slice(index, index + READ_CONCURRENCY);
    const snapshots = await Promise.all(part.map(function(id) {
      return database.collection(collectionName).doc(id).get();
    }));

    snapshots.forEach(function(snapshot, offset) {
      result.set(part[offset], snapshot.exists ? snapshot.data() || {} : null);
    });
  }

  return result;
}

// 台帳1件の形を確かめる(投稿・店舗の確認の前に、台帳だけで判定できるもの)。理由が無ければ ""。
function checkChargeShape(row, range) {
  const data = row.data;
  const postId = typeof data.postId === "string" ? data.postId : "";
  const storeId = typeof data.storeId === "string" ? data.storeId : "";
  const jstDate = typeof data.jstDate === "string" ? data.jstDate : "";

  if (
    !POST_ID_PATTERN.test(postId) ||
    !JST_DATE_PATTERN.test(jstDate) ||
    row.id !== postId + "_" + jstDate
  ) {
    return "invalid_charge_id";
  }

  if (jstDate < range.startKey || jstDate >= range.endKeyExclusive) {
    return "out_of_month";
  }

  if (!STORE_ID_PATTERN.test(storeId)) {
    return "invalid_store";
  }

  if (data.amountJpy !== IMADAKE_DAILY_CHARGE_AMOUNT_JPY || data.currency !== "JPY") {
    return "invalid_amount";
  }

  if (!(Number(data.validCvCount) >= 1)) {
    return "no_valid_cv";
  }

  return "";
}

// 台帳を分類する。
//   billableByStore         未請求で請求に入れるもの(storeId → 台帳IDの配列)
//   invoicedByStore         この月の請求書に入っている台帳の件数(invoiceIdで数える。投稿・店舗の今の状態に関係なく数える)
//   ineligibleInvoicedByStore  請求書に入っているが、今の投稿・店舗の状態では請求対象外になっている件数
//   excluded                請求に入れない未請求の台帳(理由 → 台帳IDの配列)
async function classifyMonthCharges(database, range, rows) {
  const excluded = {};
  const billableByStore = new Map();
  const invoicedByStore = new Map();
  const ineligibleInvoicedByStore = new Map();
  const shaped = [];

  const exclude = function(reason, id) {
    if (!excluded[reason]) {
      excluded[reason] = [];
    }

    excluded[reason].push(id);
  };

  const increment = function(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
  };

  rows.forEach(function(row) {
    const reason = checkChargeShape(row, range);

    if (reason) {
      exclude(reason, row.id);
    } else {
      shaped.push(row);
    }
  });

  const posts = await readDocsById(database, IMADAKE_POSTS_COLLECTION, shaped.map(function(row) {
    return row.data.postId;
  }));

  const stores = await readDocsById(database, STORE_ACCOUNTS_COLLECTION, shaped.map(function(row) {
    return row.data.storeId;
  }));

  shaped.forEach(function(row) {
    const data = row.data;
    const post = posts.get(data.postId);
    const store = stores.get(data.storeId);
    const invoiceId = buildImadakeMonthlyInvoiceId(data.storeId, range.month);
    let ineligibleReason = "";

    if (!post) {
      ineligibleReason = "post_missing";
    } else if (post.cvBillingEnabled !== true) {
      ineligibleReason = "post_not_billable";
    } else if (post.storeId !== data.storeId) {
      ineligibleReason = "store_mismatch";
    } else if (store && store.isTestAccount === true) {
      ineligibleReason = "test_account";
    }

    if (data.status === "invoiced" && data.invoiceId === invoiceId) {
      increment(invoicedByStore, data.storeId);

      if (ineligibleReason) {
        increment(ineligibleInvoicedByStore, data.storeId);
      }

      return;
    }

    if (ineligibleReason) {
      return exclude(ineligibleReason, row.id);
    }

    if (data.status === "accrued" && !data.invoiceId) {
      if (!billableByStore.has(data.storeId)) {
        billableByStore.set(data.storeId, []);
      }

      billableByStore.get(data.storeId).push(row.id);
      return;
    }

    exclude("unexpected_status", row.id);
  });

  return { billableByStore, invoicedByStore, ineligibleInvoicedByStore, excluded };
}

// 対象月のすべての請求書(状態を問わない)。取り残された "closing" の請求書も見つけるため。
async function listMonthInvoices(database, range) {
  const snapshot = await database
    .collection(IMADAKE_MONTHLY_INVOICES_COLLECTION)
    .where("month", "==", range.month)
    .get();

  const result = new Map();

  snapshot.docs.forEach(function(doc) {
    const data = doc.data() || {};

    if (typeof data.storeId === "string" && doc.id === buildImadakeMonthlyInvoiceId(data.storeId, range.month)) {
      result.set(data.storeId, data);
    }
  });

  return result;
}

// 台帳1件を、トランザクション内でもう一度確かめる(分類後に変わっていないか)。
function isChargeStillBillable(data, storeId, range) {
  return (
    data &&
    data.status === "accrued" &&
    !data.invoiceId &&
    data.storeId === storeId &&
    typeof data.jstDate === "string" &&
    data.jstDate >= range.startKey &&
    data.jstDate < range.endKeyExclusive &&
    data.amountJpy === IMADAKE_DAILY_CHARGE_AMOUNT_JPY &&
    data.currency === "JPY" &&
    Number(data.validCvCount) >= 1
  );
}

// 1店舗・1か月の請求書を用意し(①)、未請求の台帳を加える(②)。確定(③)はしない。
// 戻り値 { outcome, addedLines, lateChargeCount? }
//   outcome: "added"(締め処理中のまま、確定は後の確認で判断) / "already_closed" / "late_charges"
//            / "invoice_locked"(締め後の状態) / "invoice_inconsistent"(想定外のデータ)
async function addStoreMonthLines(database, storeId, range, chargeIds, context) {
  const invoiceId = buildImadakeMonthlyInvoiceId(storeId, range.month);
  const invoiceRef = database.collection(IMADAKE_MONTHLY_INVOICES_COLLECTION).doc(invoiceId);
  const nowTimestamp = Timestamp.fromMillis(context.nowMillis);

  // ① 請求書を用意する(無ければ "closing" で作る。加える台帳が無い店舗では作らない)。
  const opened = await database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(invoiceRef);
    const invoice = snapshot.exists ? snapshot.data() || {} : null;

    if (!invoice) {
      if (chargeIds.length === 0) {
        return { status: "absent" };
      }

      transaction.set(invoiceRef, {
        storeId: storeId,
        month: range.month,
        status: "closing",
        lineCount: 0,
        amountJpy: 0,
        currency: "JPY",
        taxIncluded: true,
        unitAmountJpy: IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
        periodStart: range.startKey,
        periodEndExclusive: range.endKeyExclusive,
        createdAt: nowTimestamp,
        updatedAt: nowTimestamp,
        closeRunId: context.runId,
        closedByUid: context.actorUid
      });

      return { status: "closing" };
    }

    if (invoice.storeId !== storeId || invoice.month !== range.month) {
      return { status: "inconsistent" };
    }

    return { status: invoice.status };
  });

  if (opened.status === "absent") {
    return { outcome: "no_invoice", addedLines: 0 };
  }

  if (opened.status === "inconsistent") {
    return { outcome: "invoice_inconsistent", addedLines: 0 };
  }

  if (opened.status === "closed") {
    return chargeIds.length > 0
      ? { outcome: "late_charges", addedLines: 0, lateChargeCount: chargeIds.length }
      : { outcome: "already_closed", addedLines: 0 };
  }

  if (opened.status !== "closing") {
    return { outcome: "invoice_locked", addedLines: 0 };
  }

  // ② 台帳を少しずつ請求書へ加える(加算と台帳の印は同じトランザクション)。
  let addedLines = 0;

  for (let index = 0; index < chargeIds.length; index += MARK_CHUNK_SIZE) {
    const part = chargeIds.slice(index, index + MARK_CHUNK_SIZE);

    const added = await database.runTransaction(async function(transaction) {
      const invoiceSnapshot = await transaction.get(invoiceRef);
      const invoice = invoiceSnapshot.exists ? invoiceSnapshot.data() || {} : null;

      if (!invoice || invoice.status !== "closing") {
        return -1;
      }

      const refs = part.map(function(id) {
        return database.collection(IMADAKE_POST_DAILY_CHARGES_COLLECTION).doc(id);
      });

      const snapshots = [];

      for (const ref of refs) {
        snapshots.push(await transaction.get(ref));
      }

      let count = 0;

      snapshots.forEach(function(snapshot, offset) {
        const data = snapshot.exists ? snapshot.data() || {} : null;

        if (!isChargeStillBillable(data, storeId, range)) {
          return;
        }

        transaction.update(refs[offset], {
          status: "invoiced",
          invoiceId: invoiceId,
          invoicedAt: nowTimestamp
        });

        count++;
      });

      if (count > 0) {
        transaction.update(invoiceRef, {
          lineCount: (Number(invoice.lineCount) || 0) + count,
          amountJpy: (Number(invoice.amountJpy) || 0) + count * IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
          updatedAt: nowTimestamp
        });
      }

      return count;
    });

    if (added < 0) {
      // 別の締め処理が先に確定した(または締め後の状態に進んだ)。この処理では何も書かない。
      return { outcome: "invoice_not_closing", addedLines: addedLines };
    }

    addedLines += added;
  }

  return { outcome: "added", addedLines: addedLines };
}

// 確定(③ "closing" → "closed")してよいかを、②の後に読み直した台帳で判断する。止める理由の配列を返す。
function findCloseBlockers(verification) {
  const reasons = [];

  if (verification.pendingLines > 0) {
    reasons.push("pending_lines_remaining");
  }

  if (verification.ineligibleInvoicedLines > 0) {
    reasons.push("invoiced_lines_now_ineligible");
  }

  if (verification.invoiceLineCount !== verification.invoicedLines) {
    reasons.push("line_count_mismatch");
  }

  if (verification.invoiceLineCount === 0) {
    reasons.push("empty_invoice");
  }

  if (verification.invoiceAmountJpy !== verification.invoiceLineCount * IMADAKE_DAILY_CHARGE_AMOUNT_JPY) {
    reasons.push("amount_mismatch");
  }

  return reasons;
}

// ③ 確定する。トランザクション内で、請求書の件数・金額が確認時の値から変わっていないことも確かめる
// (確認の後に別の締め処理が台帳を加えていたら、確定せずに止める)。
async function finalizeStoreMonth(database, storeId, range, expectedLineCount, context) {
  const invoiceRef = database
    .collection(IMADAKE_MONTHLY_INVOICES_COLLECTION)
    .doc(buildImadakeMonthlyInvoiceId(storeId, range.month));
  const nowTimestamp = Timestamp.fromMillis(context.nowMillis);

  return database.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(invoiceRef);
    const invoice = snapshot.exists ? snapshot.data() || {} : null;

    if (!invoice) {
      return { outcome: "invoice_inconsistent", reasons: ["invoice_missing"] };
    }

    const lineCount = Number(invoice.lineCount) || 0;
    const amountJpy = Number(invoice.amountJpy) || 0;

    if (invoice.status === "closed") {
      return { outcome: "already_closed", reasons: [], lineCount: lineCount, amountJpy: amountJpy };
    }

    if (invoice.status !== "closing") {
      return { outcome: "invoice_locked", reasons: [], lineCount: lineCount, amountJpy: amountJpy };
    }

    if (lineCount !== expectedLineCount || amountJpy !== lineCount * IMADAKE_DAILY_CHARGE_AMOUNT_JPY || lineCount === 0) {
      return { outcome: "close_blocked", reasons: ["changed_after_verification"], lineCount: lineCount, amountJpy: amountJpy };
    }

    transaction.update(invoiceRef, {
      status: "closed",
      closedAt: nowTimestamp,
      updatedAt: nowTimestamp,
      closeRunId: context.runId,
      closedByUid: context.actorUid
    });

    return { outcome: "closed", reasons: [], lineCount: lineCount, amountJpy: amountJpy };
  });
}

function sampleIds(ids) {
  return ids.slice(0, RESPONSE_ID_SAMPLE_LIMIT);
}

// 対象月の台帳・請求書を読んで、店舗ごとの状態をまとめる(試算・確定前の確認の両方で使う)。
async function inspectMonth(database, range) {
  const rows = await listMonthCharges(database, range);
  const classified = await classifyMonthCharges(database, range, rows);
  const invoices = await listMonthInvoices(database, range);
  const storeIds = Array.from(new Set([
    ...classified.billableByStore.keys(),
    ...classified.invoicedByStore.keys(),
    ...invoices.keys()
  ])).sort();

  const byStore = new Map();

  storeIds.forEach(function(storeId) {
    const invoice = invoices.get(storeId) || null;
    const pendingIds = classified.billableByStore.get(storeId) || [];
    const invoicedLines = classified.invoicedByStore.get(storeId) || 0;

    byStore.set(storeId, {
      storeId: storeId,
      invoiceId: buildImadakeMonthlyInvoiceId(storeId, range.month),
      pendingIds: pendingIds,
      pendingLines: pendingIds.length,
      invoicedLines: invoicedLines,
      ineligibleInvoicedLines: classified.ineligibleInvoicedByStore.get(storeId) || 0,
      invoiceStatus: invoice ? invoice.status || "" : "",
      invoiceLineCount: invoice ? Number(invoice.lineCount) || 0 : 0,
      invoiceAmountJpy: invoice ? Number(invoice.amountJpy) || 0 : 0
    });
  });

  return { rows: rows, classified: classified, byStore: byStore, storeIds: storeIds };
}

function describeStore(entry) {
  const expectedLineCount = entry.pendingLines + entry.invoicedLines;
  const hasInvoice = entry.invoiceStatus !== "";

  return {
    storeId: entry.storeId,
    invoiceId: entry.invoiceId,
    pendingLines: entry.pendingLines,
    invoicedLines: entry.invoicedLines,
    ineligibleInvoicedLines: entry.ineligibleInvoicedLines,
    expectedLineCount: expectedLineCount,
    expectedAmountJpy: expectedLineCount * IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
    invoiceStatus: entry.invoiceStatus,
    invoiceLineCount: entry.invoiceLineCount,
    invoiceAmountJpy: entry.invoiceAmountJpy,
    // 既にある請求書の件数と、その請求書に入っている台帳の件数が合わない。
    invoiceMismatch: hasInvoice && entry.invoiceLineCount !== entry.invoicedLines,
    // "closing" のまま、請求書に1件も入っていない(取り残し)。
    staleEmptyClosing: entry.invoiceStatus === "closing" && entry.invoiceLineCount === 0 && entry.invoicedLines === 0 && entry.pendingLines === 0
  };
}

// 月末締めの本体。options: { month, nowMillis, dryRun, allowWrite, actorUid }
// 戻り値 { ok, reason?, month, dryRun, closable, totals, stores, excluded }
//
// 確定の保証範囲：②の後に対象月の台帳をもう一度すべて読み、その店舗に未請求の台帳が0件・請求書の件数が
// 請求済み台帳の件数と一致することを確かめてから、件数が変わっていないことをトランザクション内で確かめて確定する。
// 読み直しの後に、通常の経路以外で対象月の台帳が新しく作られた場合は、確定を防げない(次の実行で
// late_charges として報告される)。通常の経路(CV記録)は、締めの時期(翌月2日以降)には対象月の台帳を作らない。
export async function runImadakeMonthlyClose(database, options) {
  const range = computeImadakeMonthRange(options.month);

  if (!range) {
    return { ok: false, reason: "invalid_month" };
  }

  const nowMillis = Number.isFinite(options.nowMillis) ? options.nowMillis : Date.now();
  const dryRun = options.dryRun !== false;
  const closable = isImadakeMonthClosable(range.month, nowMillis);

  if (!dryRun && !options.allowWrite) {
    return { ok: false, reason: "close_writes_disabled", month: range.month };
  }

  if (!dryRun && !closable) {
    return { ok: false, reason: "month_not_closable", month: range.month, closable: false };
  }

  const context = {
    nowMillis: nowMillis,
    runId: typeof options.runId === "string" && options.runId ? options.runId : randomUUID(),
    actorUid: typeof options.actorUid === "string" ? options.actorUid : ""
  };

  const first = await inspectMonth(database, range);
  const stores = first.storeIds.map(function(storeId) {
    return describeStore(first.byStore.get(storeId));
  });

  if (!dryRun) {
    // ①② すべての店舗について、未請求の台帳を請求書へ加える。
    const addResults = new Map();

    for (const storeId of first.storeIds) {
      const entry = first.byStore.get(storeId);
      addResults.set(storeId, await addStoreMonthLines(database, storeId, range, entry.pendingIds, context));
    }

    // 確定前の確認：台帳と請求書を読み直す。
    const second = await inspectMonth(database, range);

    for (const store of stores) {
      const added = addResults.get(store.storeId) || { outcome: "no_invoice", addedLines: 0 };
      const verifiedEntry = second.byStore.get(store.storeId);
      const verified = verifiedEntry ? describeStore(verifiedEntry) : null;

      store.addedLines = added.addedLines;

      if (added.lateChargeCount) {
        store.lateChargeCount = added.lateChargeCount;
      }

      if (added.outcome !== "added") {
        store.outcome = added.outcome === "invoice_not_closing" ? (verified && verified.invoiceStatus === "closed" ? "already_closed" : "invoice_locked") : added.outcome;
      } else if (!verified || verified.invoiceStatus !== "closing") {
        store.outcome = verified && verified.invoiceStatus === "closed" ? "already_closed" : "invoice_inconsistent";
      } else {
        const blockers = findCloseBlockers(verified);

        if (blockers.length > 0) {
          store.outcome = "close_blocked";
          store.blockReasons = blockers;
        } else {
          const finished = await finalizeStoreMonth(database, store.storeId, range, verified.invoiceLineCount, context);
          store.outcome = finished.outcome;

          if (finished.reasons.length > 0) {
            store.blockReasons = finished.reasons;
          }
        }
      }

      // 報告は確定前の確認の値で出す(確定した場合は状態を closed にする)。
      if (verified) {
        store.pendingLines = verified.pendingLines;
        store.invoicedLines = verified.invoicedLines;
        store.ineligibleInvoicedLines = verified.ineligibleInvoicedLines;
        store.invoiceStatus = store.outcome === "closed" ? "closed" : verified.invoiceStatus;
        store.invoiceLineCount = verified.invoiceLineCount;
        store.invoiceAmountJpy = verified.invoiceAmountJpy;
        store.invoiceMismatch = verified.invoiceMismatch;
        store.staleEmptyClosing = verified.staleEmptyClosing;
      }
    }
  }

  const excludedSummary = {};

  Object.keys(first.classified.excluded).sort().forEach(function(reason) {
    excludedSummary[reason] = {
      count: first.classified.excluded[reason].length,
      sampleIds: sampleIds(first.classified.excluded[reason])
    };
  });

  const totals = stores.reduce(function(sum, entry) {
    sum.storeCount += 1;
    sum.expectedLineCount += entry.expectedLineCount;
    sum.expectedAmountJpy += entry.expectedAmountJpy;
    sum.attentionCount += entry.invoiceMismatch || entry.staleEmptyClosing || entry.ineligibleInvoicedLines > 0 ||
      (entry.outcome && !["closed", "already_closed", "no_invoice"].includes(entry.outcome)) ? 1 : 0;
    return sum;
  }, {
    storeCount: 0,
    expectedLineCount: 0,
    expectedAmountJpy: 0,
    attentionCount: 0,
    chargeDocsRead: first.rows.length
  });

  return {
    ok: true,
    month: range.month,
    period: { startKey: range.startKey, endKeyExclusive: range.endKeyExclusive },
    dryRun: dryRun,
    closable: closable,
    runId: dryRun ? "" : context.runId,
    unitAmountJpy: IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
    taxIncluded: true,
    totals: totals,
    stores: stores,
    excluded: excludedSummary
  };
}

// mode: imadakeMonthlyClose (POST、運営のみ)
//   入力 { month: "YYYY-MM", dryRun?: boolean }。dryRun は省略時 true(試算：読むだけ)。
//   締めの実行(dryRun:false)は IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED が true の時だけ(現在は403)。
//   Stripeには一切接続しない。
export async function handleImadakeMonthlyClose(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const month = typeof body.month === "string" ? body.month.trim() : "";
    const dryRun = body.dryRun !== false;

    if (!computeImadakeMonthRange(month)) {
      return response.status(400).json({ success: false, reason: "invalid_month" });
    }

    // STEP 37-C｜書き込みを許すのは、従来のフラグ(false)か、Previewの試験環境(サーバー側で確認：Preview・
    // 対象ブランチ・サーバーの鍵が machinau-preview)の時だけ。Production・別ブランチ・接続先の不一致では拒否。
    // この許可は月末締めの書き込みだけに使い、月次請求(Stripe)の実行には作用しない。
    const writesAllowed =
      IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED === true ||
      isPreviewMonthlyCloseTrialEnabled(deps.env || process.env);

    if (!dryRun && !writesAllowed) {
      return response.status(403).json({ success: false, reason: "close_writes_disabled" });
    }

    const actor = authResult.actor || {};
    const result = await runImadakeMonthlyClose(authResult.database, {
      month: month,
      nowMillis: Date.now(),
      dryRun: dryRun,
      allowWrite: writesAllowed,
      actorUid: typeof actor.uid === "string" ? actor.uid : ""
    });

    if (!result.ok) {
      return response.status(result.reason === "month_not_closable" ? 409 : 400).json({ success: false, reason: result.reason });
    }

    // 画面が「締めを実行できるか」を判断できるよう、書き込みの可否と、それがPreview試験によるものかを返す。
    return response.status(200).json({
      success: true,
      ...result,
      writeAllowed: writesAllowed,
      previewTrial: IMADAKE_MONTHLY_CLOSE_WRITES_ENABLED !== true && writesAllowed
    });
  } catch (error) {
    console.error("今だけ投稿 月末締めエラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}
