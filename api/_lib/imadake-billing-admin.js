// ==========================================================================
// 今だけ投稿 決済 STEP 32-D⑤｜月次請求の運営確認一覧(読み取り専用、サーバー側のみ)
// ==========================================================================
// 運営が対応すべき月次請求を見つけるための一覧。Firestoreを読むだけで、書き込みは一切しない。
// 一覧(imadakeBillingOverview)はStripeに接続しない。1件ずつの照合(imadakeBillingInspect)はStripeへGETだけを送る。支払い確定・再請求・ロック解除・カード
// 取り外しの操作はこのファイルに置かない。
//
// 読み取り範囲：請求書 imadakeMonthlyInvoices と支払い情報 accountBilling(STEP 42-C：1アカウント1枚)を、文書ID順に
// ページ分割して読む。1回の呼び出しで読む件数には上限があり、残りは続きの位置(cursor)として返す。
// 全件を読み終えていない・読み取りに失敗した・照合を省略した場合は complete:false を返し、
// 警告が0件でも「問題なし」(problemFree:true)とは返さない。
//
// 警告の日数は暫定値(定数)。正式な締め・請求の日程は未決定(「翌月2日以降に締める」も仮の仕様)。
// このファイルはVercel Functionではない(api/moderate-submission.js の mode から呼ばれる)。
// ==========================================================================

import {
  FieldPath
} from "firebase-admin/firestore";

import {
  IMADAKE_DAILY_CHARGE_AMOUNT_JPY,
  IMADAKE_POST_DAILY_CHARGES_COLLECTION
} from "./imadake-cv.js";

import {
  readStripeChargeConfig
} from "./store-billing.js";

const INVOICES_COLLECTION =
  "imadakeMonthlyInvoices";

// STEP 42-C｜アカウント単位の支払い情報(store-billing.js の ACCOUNT_BILLING_COLLECTION と同じ)。
const ACCOUNT_BILLING_COLLECTION =
  "accountBilling";

// ---- 警告の暫定値(正式な請求日・運用は未決定。変更する時はこの値だけを変える) ----
// closed(請求額確定)のまま請求されていない日数。
export const BILLING_OVERVIEW_CLOSED_UNCHARGED_WARN_MS =
  3 * 24 * 60 * 60 * 1000;

// 請求中ロック(billingLocks の各請求書)が続いている時間。
export const BILLING_OVERVIEW_LOCK_WARN_MS =
  24 * 60 * 60 * 1000;

// closing(締め処理中)のまま止まっている時間。
export const BILLING_OVERVIEW_CLOSING_WARN_MS =
  24 * 60 * 60 * 1000;

// ---- 1回の呼び出しで読む件数の上限 ----
const INVOICE_PAGE_SIZE =
  200;

const INVOICE_MAX_PAGES_PER_CALL =
  5;

const BILLING_PAGE_SIZE =
  200;

const BILLING_MAX_PAGES_PER_CALL =
  3;

// 日別台帳の件数照合(count()、1請求書あたり1読み取り)の上限。対象は締め以降の未解決・締め済みの請求書だけ。
const LEDGER_COUNT_MAX_PER_CALL =
  50;

// ロックが指す請求書・未解決の請求書の店舗を、個別に読む件数の上限。
const LINKED_DOC_READS_MAX_PER_CALL =
  200;

const ITEMS_MAX =
  500;

const KNOWN_STATUSES =
  ["closing", "closed", "charging", "processing", "requires_action", "needs_review", "payment_failed", "charge_error", "paid"];

// 請求中ロックを持つべき状態(imadake-monthly-charge.js と同じ)。
const LOCK_HOLDING_STATUSES =
  ["charging", "processing", "requires_action", "needs_review"];

// それ自体が運営の対応を必要とする状態。
const ATTENTION_STATUSES =
  ["needs_review", "requires_action", "processing", "payment_failed", "charge_error"];

// 台帳の件数を照合する状態(締め以降で、請求書に入れた台帳があるはずのもの)。
const LEDGER_CHECK_STATUSES =
  ["closed", "charging", "processing", "requires_action", "needs_review", "payment_failed", "charge_error"];

const CURSOR_PATTERN =
  /^[A-Za-z0-9_-]{1,200}$/;

const MODE_KEYS =
  ["test", "live"];

function millisOf(value) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (value && typeof value.ms === "number") {
    return value.ms;
  }

  return Number.isFinite(value) ? value : 0;
}

function hoursSince(nowMs, thenMs) {
  return thenMs > 0 ? Math.floor((nowMs - thenMs) / (60 * 60 * 1000)) : null;
}

async function scanCollection(database, collectionName, cursor, pageSize, maxPages) {
  const docs = [];
  let last = cursor || "";

  for (let page = 0; page < maxPages; page++) {
    let query = database.collection(collectionName).orderBy(FieldPath.documentId()).limit(pageSize);

    if (last) {
      query = query.startAfter(last);
    }

    const snapshot = await query.get();

    snapshot.docs.forEach(function(doc) {
      docs.push({ id: doc.id, data: doc.data() || {} });
    });

    if (snapshot.docs.length < pageSize) {
      return { docs: docs, reachedEnd: true, nextCursor: "" };
    }

    last = snapshot.docs[snapshot.docs.length - 1].id;
  }

  return { docs: docs, reachedEnd: false, nextCursor: last };
}

// 請求書1件の問題(理由)を調べる(Firestoreの請求書だけで判断できるもの)。
function inspectInvoice(id, invoice, nowMs) {
  const reasons = [];
  const status = typeof invoice.status === "string" ? invoice.status : "";
  const storeId = typeof invoice.storeId === "string" ? invoice.storeId : "";
  const month = typeof invoice.month === "string" ? invoice.month : "";

  if (!storeId || !month || id !== storeId + "_" + month) {
    reasons.push("invalid_invoice_id");
  }

  if (!KNOWN_STATUSES.includes(status)) {
    reasons.push("unknown_status");
  }

  if (ATTENTION_STATUSES.includes(status)) {
    reasons.push("status_" + status);
  }

  const lineCount = Number(invoice.lineCount);
  const amountJpy = Number(invoice.amountJpy);

  if (!Number.isInteger(lineCount) || lineCount < 0 || amountJpy !== lineCount * IMADAKE_DAILY_CHARGE_AMOUNT_JPY) {
    reasons.push("amount_mismatch");
  }

  if (status === "charging") {
    if (invoice.chargeOutcomeUnknown === true) {
      reasons.push("charging_outcome_unknown");
    }

    if (!(Number(invoice.chargeLeaseUntilMs) > nowMs)) {
      reasons.push("charging_lease_expired");
    }
  }

  if (status === "closing") {
    const sinceMs = millisOf(invoice.updatedAt) || millisOf(invoice.createdAt);

    if (!sinceMs || nowMs - sinceMs > BILLING_OVERVIEW_CLOSING_WARN_MS) {
      reasons.push("closing_stale");
    }
  }

  if (status === "closed") {
    const closedMs = millisOf(invoice.closedAt);

    if (!closedMs || nowMs - closedMs > BILLING_OVERVIEW_CLOSED_UNCHARGED_WARN_MS) {
      reasons.push("closed_uncharged");
    }
  }

  if (status === "paid" && !(typeof invoice.paymentIntentId === "string" && invoice.paymentIntentId.startsWith("pi_"))) {
    reasons.push("paid_without_payment_intent");
  }

  if (LOCK_HOLDING_STATUSES.includes(status) && !(typeof invoice.chargePaymentMethodId === "string" && invoice.chargePaymentMethodId.startsWith("pm_"))) {
    reasons.push("charge_card_unknown");
  }

  return reasons;
}

function describeInvoice(id, invoice, nowMs) {
  const lastError = invoice.lastChargeError && typeof invoice.lastChargeError === "object" ? invoice.lastChargeError : {};

  return {
    kind: "invoice",
    invoiceId: id,
    storeId: typeof invoice.storeId === "string" ? invoice.storeId : "",
    month: typeof invoice.month === "string" ? invoice.month : "",
    status: typeof invoice.status === "string" ? invoice.status : "",
    lineCount: Number(invoice.lineCount) || 0,
    amountJpy: Number(invoice.amountJpy) || 0,
    chargeAttempt: Number.isInteger(invoice.chargeAttempt) ? invoice.chargeAttempt : 0,
    paymentIntentId: typeof invoice.paymentIntentId === "string" ? invoice.paymentIntentId.slice(0, 120) : "",
    paymentIntentStatus: typeof invoice.paymentIntentStatus === "string" ? invoice.paymentIntentStatus : "",
    chargeReviewReason: typeof invoice.chargeReviewReason === "string" ? invoice.chargeReviewReason : "",
    chargeErrorReason: typeof invoice.chargeErrorReason === "string" ? invoice.chargeErrorReason : "",
    lastErrorCode: typeof lastError.code === "string" ? lastError.code : "",
    lastErrorDeclineCode: typeof lastError.declineCode === "string" ? lastError.declineCode : "",
    hoursSinceUpdate: hoursSince(nowMs, millisOf(invoice.chargeUpdatedAt) || millisOf(invoice.updatedAt) || millisOf(invoice.closedAt)),
    reasons: []
  };
}

// 店舗の支払い情報(モードごと)の請求中ロックを調べる。
// 請求書ごとのロック(billingLocks)を1件ずつ確かめる。
function inspectLocks(section, nowMs) {
  const locks = section && section.billingLocks && typeof section.billingLocks === "object" ? section.billingLocks : {};

  return Object.keys(locks).map(function(lockInvoiceId) {
    const lock = locks[lockInvoiceId] && typeof locks[lockInvoiceId] === "object" ? locks[lockInvoiceId] : {};
    const reasons = [];
    const sinceMs = Number(lock.sinceMs) || 0;

    if (!lockInvoiceId) {
      reasons.push("lock_without_invoice");
    }

    if (!sinceMs || nowMs - sinceMs > BILLING_OVERVIEW_LOCK_WARN_MS) {
      reasons.push("lock_stale");
    }

    return { lockInvoiceId: lockInvoiceId, sinceMs: sinceMs, reasons: reasons };
  });
}

async function readDocOrError(database, collectionName, id) {
  try {
    const snapshot = await database.collection(collectionName).doc(id).get();
    return { ok: true, exists: snapshot.exists, data: snapshot.exists ? snapshot.data() || {} : null };
  } catch (error) {
    return { ok: false, exists: false, data: null };
  }
}

async function countLedger(database, invoiceId) {
  const query = database.collection(IMADAKE_POST_DAILY_CHARGES_COLLECTION).where("invoiceId", "==", invoiceId);
  const result = await query.count().get();
  return Number(result.data().count) || 0;
}

// 一覧の本体。options: { invoiceCursor?, billingCursor?, nowMillis? }
export async function buildImadakeBillingOverview(database, options) {
  const nowMs = Number.isFinite(options && options.nowMillis) ? options.nowMillis : Date.now();
  const invoiceCursor = options && typeof options.invoiceCursor === "string" ? options.invoiceCursor : "";
  const billingCursor = options && typeof options.billingCursor === "string" ? options.billingCursor : "";
  // 前の呼び出しで読み終えた側は読まない(空の位置は「最初から」の意味なので、終わりを別に伝える)。
  const invoicesDone = Boolean(options && options.invoicesDone === true);
  const billingDone = Boolean(options && options.billingDone === true);
  const errors = [];
  const items = [];
  let complete = true;

  if ((invoiceCursor && !CURSOR_PATTERN.test(invoiceCursor)) || (billingCursor && !CURSOR_PATTERN.test(billingCursor))) {
    return { ok: false, reason: "invalid_cursor" };
  }

  // ---- 請求書 ----
  let invoiceScan = { docs: [], reachedEnd: false, nextCursor: invoiceCursor };

  try {
    invoiceScan = invoicesDone
      ? { docs: [], reachedEnd: true, nextCursor: "" }
      : await scanCollection(database, INVOICES_COLLECTION, invoiceCursor, INVOICE_PAGE_SIZE, INVOICE_MAX_PAGES_PER_CALL);
  } catch (error) {
    errors.push({ scope: "invoices", reason: "read_failed" });
    complete = false;
  }

  if (!invoiceScan.reachedEnd) {
    complete = false;
  }

  const invoicesById = new Map();
  let ledgerCounts = 0;
  let linkedReads = 0;
  let ledgerSkipped = 0;
  let linkedSkipped = 0;

  invoiceScan.docs.forEach(function(doc) {
    invoicesById.set(doc.id, doc.data);
  });

  // 照合の上限に達したら、その請求書の手前で止め、続きの位置をそこにする(照合していない請求書を
  // 読み飛ばさない。次の呼び出しはその請求書から読み直す)。
  let invoiceStoppedAt = null;
  let lastInvoiceProcessed = invoiceCursor;
  let invoicesProcessed = 0;

  for (const doc of invoiceScan.docs) {
    const status = typeof doc.data.status === "string" ? doc.data.status : "";
    const needsLedger = LEDGER_CHECK_STATUSES.includes(status) || !KNOWN_STATUSES.includes(status);
    const needsLinked = LOCK_HOLDING_STATUSES.includes(status) && typeof doc.data.storeId === "string" && doc.data.storeId !== "";

    // 返す一覧が上限に達した時も同じく手前で止める(上限を超えた分を読み飛ばさない)。
    if (items.length >= ITEMS_MAX) {
      invoiceStoppedAt = lastInvoiceProcessed;
      break;
    }

    if ((needsLedger && ledgerCounts >= LEDGER_COUNT_MAX_PER_CALL) || (needsLinked && linkedReads >= LINKED_DOC_READS_MAX_PER_CALL)) {
      invoiceStoppedAt = lastInvoiceProcessed;
      if (needsLedger && ledgerCounts >= LEDGER_COUNT_MAX_PER_CALL) {
        ledgerSkipped++;
      } else {
        linkedSkipped++;
      }
      break;
    }

    const entry = describeInvoice(doc.id, doc.data, nowMs);
    entry.reasons = inspectInvoice(doc.id, doc.data, nowMs);

    // 日別台帳の件数照合(上限あり)。
    if (needsLedger) {
      {
        ledgerCounts++;

        try {
          const counted = await countLedger(database, doc.id);
          entry.ledgerLineCount = counted;

          if (counted !== entry.lineCount) {
            entry.reasons.push("ledger_count_mismatch");
          }
        } catch (error) {
          entry.reasons.push("ledger_count_unavailable");
          complete = false;
        }
      }
    }

    // ロックを持つべき請求書：確保の時に記録した請求先アカウントの支払い情報に、この請求書のロックがあるか。
    if (needsLinked) {
      const billingAccountUid = typeof doc.data.chargeBillingAccountUid === "string" ? doc.data.chargeBillingAccountUid : "";

      if (!billingAccountUid) {
        entry.reasons.push("invoice_without_billing_account");
      } else {
        linkedReads++;
        const billing = await readDocOrError(database, ACCOUNT_BILLING_COLLECTION, billingAccountUid);

        if (!billing.ok) {
          entry.reasons.push("account_billing_unavailable");
          complete = false;
        } else {
          const mode = typeof doc.data.chargeMode === "string" ? doc.data.chargeMode : "";
          const section = billing.data && billing.data[mode] && typeof billing.data[mode] === "object" ? billing.data[mode] : {};
          const locks = section.billingLocks && typeof section.billingLocks === "object" ? section.billingLocks : {};

          if (!Object.prototype.hasOwnProperty.call(locks, doc.id)) {
            entry.reasons.push("invoice_without_lock");
          }
        }
      }
    }

    if (entry.reasons.length > 0) {
      items.push(entry);
    }

    lastInvoiceProcessed = doc.id;
    invoicesProcessed++;
  }

  if (invoiceStoppedAt !== null) {
    invoiceScan = { ...invoiceScan, reachedEnd: false, nextCursor: invoiceStoppedAt };
    complete = false;
  }

  // ---- アカウントの支払い情報(請求書ごとの請求中ロック) ----
  let billingScan = { docs: [], reachedEnd: false, nextCursor: billingCursor };

  try {
    billingScan = billingDone || invoiceStoppedAt !== null
      ? (billingDone ? { docs: [], reachedEnd: true, nextCursor: "" } : { docs: [], reachedEnd: false, nextCursor: billingCursor })
      : await scanCollection(database, ACCOUNT_BILLING_COLLECTION, billingCursor, BILLING_PAGE_SIZE, BILLING_MAX_PAGES_PER_CALL);
  } catch (error) {
    errors.push({ scope: "accountBilling", reason: "read_failed" });
    complete = false;
  }

  if (!billingScan.reachedEnd) {
    complete = false;
  }

  let billingStoppedAt = null;
  let lastBillingProcessed = billingCursor;
  let billingProcessed = 0;

  for (const doc of billingScan.docs) {
    const docLocks = MODE_KEYS.map(function(mode) {
      const section = doc.data[mode] && typeof doc.data[mode] === "object" ? doc.data[mode] : null;
      return { mode: mode, locks: section ? inspectLocks(section, nowMs) : [] };
    });
    const lockCount = docLocks.reduce(function(sum, entry) { return sum + entry.locks.length; }, 0);
    const neededReads = docLocks.reduce(function(sum, entry) {
      return sum + entry.locks.filter(function(lock) { return lock.lockInvoiceId && !invoicesById.has(lock.lockInvoiceId); }).length;
    }, 0);

    if (items.length + lockCount > ITEMS_MAX) {
      billingStoppedAt = lastBillingProcessed;
      break;
    }

    if (neededReads > 0 && linkedReads + neededReads > LINKED_DOC_READS_MAX_PER_CALL) {
      billingStoppedAt = lastBillingProcessed;
      linkedSkipped++;
      break;
    }

    for (const lockEntry of docLocks) {
      const mode = lockEntry.mode;

      for (const lock of lockEntry.locks) {
        const entry = {
          kind: "account_billing",
          accountUid: doc.id,
          mode: mode,
          lockInvoiceId: lock.lockInvoiceId,
          lockHours: hoursSince(nowMs, lock.sinceMs),
          reasons: lock.reasons.slice()
        };

        if (lock.lockInvoiceId) {
          let invoice = invoicesById.has(lock.lockInvoiceId) ? { ok: true, exists: true, data: invoicesById.get(lock.lockInvoiceId) } : null;

          if (!invoice) {
            linkedReads++;
            invoice = await readDocOrError(database, INVOICES_COLLECTION, lock.lockInvoiceId);
          }

          if (invoice && !invoice.ok) {
            entry.reasons.push("lock_invoice_unavailable");
            complete = false;
          } else if (invoice && !invoice.exists) {
            entry.reasons.push("lock_invoice_missing");
          } else if (invoice) {
            const status = invoice.data.status;

            if (!LOCK_HOLDING_STATUSES.includes(status)) {
              entry.reasons.push("lock_invoice_not_holding");
            }

            if (invoice.data.chargeBillingAccountUid !== doc.id) {
              entry.reasons.push("lock_invoice_other_account");
            }

            entry.lockStoreId = typeof invoice.data.storeId === "string" ? invoice.data.storeId : "";

            if (!(typeof invoice.data.chargePaymentMethodId === "string" && invoice.data.chargePaymentMethodId.startsWith("pm_"))) {
              entry.reasons.push("lock_invoice_without_card");
            }

            entry.lockInvoiceStatus = typeof status === "string" ? status : "";
          }
        }

        if (entry.reasons.length > 0) {
          items.push(entry);
        }
      }
    }

    lastBillingProcessed = doc.id;
    billingProcessed++;
  }

  if (billingStoppedAt !== null) {
    billingScan = { ...billingScan, reachedEnd: false, nextCursor: billingStoppedAt };
    complete = false;
  }

  const truncated = items.length > ITEMS_MAX;

  if (truncated) {
    complete = false;
  }

  return {
    ok: true,
    generatedAtMs: nowMs,
    complete: complete,
    // 全対象を確かめ終え、問題が0件の時だけ true。
    problemFree: complete && items.length === 0,
    attentionCount: items.length,
    items: items.slice(0, ITEMS_MAX),
    truncated: truncated,
    errors: errors,
    scanned: {
      // 確認を終えた件数(途中で止めた場合、その先は次の呼び出しで確認する)。
      invoices: invoicesProcessed,
      accountBilling: billingProcessed,
      // 実際に読んだ文書数(止めた先の分を含む。読み取り費用の目安)。
      invoiceDocsRead: invoiceScan.docs.length,
      accountBillingDocsRead: billingScan.docs.length,
      ledgerCounts: ledgerCounts,
      linkedReads: linkedReads,
      // 上限で照合を省略した件数(0でなければ complete:false。次の呼び出しでは同じ範囲を読み直す必要がある)。
      ledgerSkipped: ledgerSkipped,
      linkedSkipped: linkedSkipped
    },
    next: {
      invoiceCursor: invoiceScan.reachedEnd ? "" : invoiceScan.nextCursor,
      billingCursor: billingScan.reachedEnd ? "" : billingScan.nextCursor,
      // true の側は読み終えた(次の呼び出しでは invoicesDone / billingDone として渡す)。
      invoicesDone: invoiceScan.reachedEnd === true,
      billingDone: billingScan.reachedEnd === true
    },
    thresholds: {
      closedUnchargedWarnHours: BILLING_OVERVIEW_CLOSED_UNCHARGED_WARN_MS / 3600000,
      lockWarnHours: BILLING_OVERVIEW_LOCK_WARN_MS / 3600000,
      closingWarnHours: BILLING_OVERVIEW_CLOSING_WARN_MS / 3600000,
      provisional: true
    },
    limits: {
      invoicesPerCall: INVOICE_PAGE_SIZE * INVOICE_MAX_PAGES_PER_CALL,
      accountBillingPerCall: BILLING_PAGE_SIZE * BILLING_MAX_PAGES_PER_CALL,
      ledgerCountsPerCall: LEDGER_COUNT_MAX_PER_CALL,
      linkedReadsPerCall: LINKED_DOC_READS_MAX_PER_CALL,
      itemsMax: ITEMS_MAX
    }
  };
}

// ==========================================================================
// STEP 32-D⑧｜請求書1件とStripeのPaymentIntentの照合(読み取り専用)
// ==========================================================================
// StripeにはGETだけを送る(PaymentIntentの作成・確定・再試行・取消・返金はしない)。Firestoreには書かない。
// 食い違いを見つけても請求書の状態・needs_review・billingLock は変えない(表示するだけ)。
// 照会に失敗した・一覧を読み切れなかった場合は complete:false(照合未完了)。0件は「この顧客・この期間の
// 範囲では見つからない」であり、Stripe上に支払いが無いことの証明ではない(未請求とは判定しない)。
// 返すのは許可した項目だけ(client_secret・請求先情報・カード詳細・応答全文・キー・冪等キーは返さない)。
const INSPECT_INVOICE_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}_\d{4}-(0[1-9]|1[0-2])$/;

const STRIPE_API_BASE =
  "https://api.stripe.com/v1";

const INSPECT_STRIPE_TIMEOUT_MS =
  15 * 1000;

const INSPECT_LIST_PAGE_SIZE =
  100;

const INSPECT_LIST_MAX_PAGES =
  10;

const INSPECT_HISTORY_RETRIEVE_MAX =
  10;

// 一覧を探す期間：請求書の作成(締め)日時のこの時間前から。
const INSPECT_LIST_LOOKBACK_MS =
  7 * 24 * 60 * 60 * 1000;

const PI_ID_PATTERN =
  /^pi_[A-Za-z0-9_]{1,100}$/;

const ACTIVE_PI_STATUSES =
  ["succeeded", "processing", "requires_capture"];

async function stripeGet(config, deps, path, params) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(function() {
    abortController.abort();
  }, INSPECT_STRIPE_TIMEOUT_MS);

  const query = new URLSearchParams();

  Object.keys(params || {}).forEach(function(key) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
      query.append(key, String(params[key]));
    }
  });

  const url = STRIPE_API_BASE + path + (query.toString() ? "?" + query.toString() : "");

  try {
    // 読み取りだけ(GET)。本文・冪等キーは送らない。
    const response = await deps.fetch(url, {
      method: "GET",
      headers: { "Authorization": "Bearer " + config.serverKey },
      signal: abortController.signal
    });
    let data = null;

    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (response.ok && data && !data.error) {
      return { ok: true, status: response.status, data: data };
    }

    const stripeError = data && data.error && typeof data.error === "object" ? data.error : {};
    return {
      ok: false,
      status: response.status,
      code: typeof stripeError.code === "string" ? stripeError.code.slice(0, 60) : "",
      type: typeof stripeError.type === "string" ? stripeError.type.slice(0, 60) : ""
    };
  } catch (error) {
    return { ok: false, status: 0, code: "", type: "network_error" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function idOf(value) {
  if (typeof value === "string") {
    return value;
  }

  return value && typeof value.id === "string" ? value.id : "";
}

// Stripeの応答から、照合に必要な項目だけを取り出す(許可リスト)。
function pickPaymentIntent(pi, source) {
  const metadata = pi && pi.metadata && typeof pi.metadata === "object" ? pi.metadata : {};
  const lastError = pi && pi.last_payment_error && typeof pi.last_payment_error === "object" ? pi.last_payment_error : {};
  const str = function(value, max) {
    return typeof value === "string" ? value.slice(0, max) : "";
  };

  return {
    id: str(pi.id, 120),
    status: str(pi.status, 40),
    amount: Number.isFinite(pi.amount) ? pi.amount : null,
    amountReceived: Number.isFinite(pi.amount_received) ? pi.amount_received : null,
    currency: str(pi.currency, 10),
    livemode: pi.livemode === true,
    createdMs: Number.isFinite(pi.created) ? pi.created * 1000 : null,
    metadata: {
      invoiceId: str(metadata.invoiceId, 120),
      storeId: str(metadata.storeId, 120),
      month: str(metadata.month, 10),
      chargeAttempt: str(String(metadata.chargeAttempt === undefined ? "" : metadata.chargeAttempt), 10),
      machinauMode: str(metadata.machinauMode, 10)
    },
    lastErrorCode: str(lastError.code, 60),
    lastDeclineCode: str(lastError.decline_code, 60),
    sources: [source],
    // 照合用(応答には含めない。後で真偽値に変える)。
    _customer: idOf(pi.customer),
    _paymentMethod: idOf(pi.payment_method)
  };
}

function compareToInvoice(entry, invoice, invoiceId, mode) {
  const mismatches = [];
  const attemptNumber = Number(entry.metadata.chargeAttempt);
  const invoiceAttempt = Number.isInteger(invoice.chargeAttempt) ? invoice.chargeAttempt : 0;

  if (entry.amount !== Number(invoice.amountJpy)) {
    mismatches.push("amount");
  }

  if (entry.status === "succeeded" && entry.amountReceived !== Number(invoice.amountJpy)) {
    mismatches.push("amount_received");
  }

  if (entry.currency !== "jpy") {
    mismatches.push("currency");
  }

  if (!invoice.chargeCustomerId || entry._customer !== invoice.chargeCustomerId) {
    mismatches.push("customer");
  }

  if (entry.metadata.invoiceId !== invoiceId) {
    mismatches.push("metadata_invoice");
  }

  if (entry.metadata.storeId !== invoice.storeId) {
    mismatches.push("metadata_store");
  }

  if (entry.metadata.month !== invoice.month) {
    mismatches.push("metadata_month");
  }

  if (entry.metadata.machinauMode !== mode) {
    mismatches.push("metadata_mode");
  }

  if (entry.livemode !== (mode === "live")) {
    mismatches.push("livemode");
  }

  if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > invoiceAttempt) {
    mismatches.push("attempt");
  } else if (attemptNumber === invoiceAttempt && (!invoice.chargePaymentMethodId || entry._paymentMethod !== invoice.chargePaymentMethodId)) {
    // 今の試行の支払いだけ、記録したカードと照合する(前の試行は別のカードの場合がある)。
    mismatches.push("payment_method");
  }

  return mismatches;
}

function finding(code, severity) {
  return { code: code, severity: severity };
}

// 照合の本体(読み取りだけ)。deps: { fetch, env }
export async function inspectImadakeInvoice(database, deps, invoiceId, nowMs) {
  if (typeof invoiceId !== "string" || !INSPECT_INVOICE_ID_PATTERN.test(invoiceId)) {
    return { ok: false, reason: "invalid_invoice_id" };
  }

  let invoiceSnapshot;

  try {
    invoiceSnapshot = await database.collection(INVOICES_COLLECTION).doc(invoiceId).get();
  } catch (error) {
    return { ok: false, reason: "firestore_unavailable" };
  }

  if (!invoiceSnapshot.exists) {
    return { ok: true, invoiceFound: false, invoiceId: invoiceId, complete: true, verdict: "invoice_not_found", findings: [], paymentIntents: [] };
  }

  const invoice = invoiceSnapshot.data() || {};
  const summary = describeInvoice(invoiceId, invoice, nowMs);
  delete summary.reasons;
  const findings = [];
  const result = {
    ok: true,
    invoiceFound: true,
    invoiceId: invoiceId,
    invoice: summary,
    stripe: { checked: false, mode: "", customersChecked: 0, rangeStartMs: null, listPagesRead: 0, listComplete: false, retrieved: 0 },
    paymentIntents: [],
    findings: findings,
    complete: false,
    verdict: "incomplete"
  };

  const config = readStripeChargeConfig(deps.env);

  if (!config.ok) {
    findings.push(finding("stripe_unavailable_" + config.reason, "incomplete"));
    return result;
  }

  result.stripe.mode = config.mode;

  if (invoice.chargeMode && invoice.chargeMode !== config.mode) {
    findings.push(finding("mode_mismatch", "severe"));
    result.verdict = "mode_mismatch";
    return result;
  }

  // 照会する顧客：請求に使った顧客と、今の支払い情報の顧客(違う場合は両方)。
  const customers = new Set();

  if (typeof invoice.chargeCustomerId === "string" && invoice.chargeCustomerId.startsWith("cus_")) {
    customers.add(invoice.chargeCustomerId);
  }

  // 今の支払い情報：確保の時に記録した請求先アカウント(記録が無ければ照会しない)。
  const billingAccountUid = typeof invoice.chargeBillingAccountUid === "string" ? invoice.chargeBillingAccountUid : "";

  if (billingAccountUid) {
    try {
      const billingSnapshot = await database.collection(ACCOUNT_BILLING_COLLECTION).doc(billingAccountUid).get();
      const section = billingSnapshot.exists && billingSnapshot.data() ? billingSnapshot.data()[config.mode] : null;

      if (section && typeof section.customerId === "string" && section.customerId.startsWith("cus_")) {
        customers.add(section.customerId);
      }
    } catch (error) {
      findings.push(finding("account_billing_unavailable", "incomplete"));
    }
  }

  const knownIds = new Set();

  if (typeof invoice.paymentIntentId === "string" && PI_ID_PATTERN.test(invoice.paymentIntentId)) {
    knownIds.add(invoice.paymentIntentId);
  }

  (Array.isArray(invoice.chargeHistory) ? invoice.chargeHistory : []).forEach(function(entry) {
    if (entry && typeof entry.paymentIntentId === "string" && PI_ID_PATTERN.test(entry.paymentIntentId)) {
      knownIds.add(entry.paymentIntentId);
    }
  });

  result.stripe.checked = true;
  const byId = new Map();
  let complete = true;

  const addPi = function(pi, source) {
    const entry = pickPaymentIntent(pi, source);

    if (!entry.id) {
      return;
    }

    if (byId.has(entry.id)) {
      if (!byId.get(entry.id).sources.includes(source)) {
        byId.get(entry.id).sources.push(source);
      }

      return;
    }

    byId.set(entry.id, entry);
  };

  // ① 記録されたIDで照会(paymentIntentId を最初に)。
  const orderedKnown = Array.from(knownIds).sort(function(a, b) {
    return a === invoice.paymentIntentId ? -1 : b === invoice.paymentIntentId ? 1 : 0;
  }).slice(0, INSPECT_HISTORY_RETRIEVE_MAX);

  if (knownIds.size > INSPECT_HISTORY_RETRIEVE_MAX) {
    findings.push(finding("history_retrieve_limit", "incomplete"));
    complete = false;
  }

  for (const id of orderedKnown) {
    const fetched = await stripeGet(config, deps, "/payment_intents/" + id, {});
    result.stripe.retrieved++;

    if (fetched.ok) {
      addPi(fetched.data, id === invoice.paymentIntentId ? "id" : "history");
    } else if (fetched.status === 404) {
      findings.push(finding(id === invoice.paymentIntentId ? "recorded_payment_intent_not_found" : "history_payment_intent_not_found", "severe"));
    } else {
      findings.push(finding("retrieve_failed", "incomplete"));
      complete = false;
    }
  }

  // ② 顧客の支払い一覧(全ページ、上限あり)から、この請求書の支払いを探す。
  const createdBaseMs = millisOf(invoice.createdAt) || millisOf(invoice.closedAt) || 0;
  const rangeStartMs = createdBaseMs ? createdBaseMs - INSPECT_LIST_LOOKBACK_MS : null;
  result.stripe.rangeStartMs = rangeStartMs;
  result.stripe.customersChecked = customers.size;
  let listComplete = customers.size > 0;

  if (customers.size === 0) {
    findings.push(finding("no_customer_to_search", "incomplete"));
    complete = false;
  }

  const unlinked = [];

  for (const customerId of customers) {
    let startingAfter = "";
    let finished = false;

    for (let page = 0; page < INSPECT_LIST_MAX_PAGES; page++) {
      const listed = await stripeGet(config, deps, "/payment_intents", {
        "customer": customerId,
        "created[gte]": rangeStartMs ? Math.floor(rangeStartMs / 1000) : "",
        "limit": INSPECT_LIST_PAGE_SIZE,
        "starting_after": startingAfter
      });
      result.stripe.listPagesRead++;

      if (!listed.ok) {
        findings.push(finding("list_failed", "incomplete"));
        listComplete = false;
        finished = true;
        break;
      }

      const data = Array.isArray(listed.data.data) ? listed.data.data : [];

      data.forEach(function(pi) {
        const metadata = pi && pi.metadata && typeof pi.metadata === "object" ? pi.metadata : {};

        if (metadata.invoiceId === invoiceId) {
          addPi(pi, "list");
        } else if (!metadata.invoiceId && pi.status === "succeeded" && pi.amount === Number(invoice.amountJpy)) {
          // 請求書IDの無い同額の成功した支払い(参考。断定しない)。
          unlinked.push(pickPaymentIntent(pi, "list_unlinked"));
        }
      });

      if (!listed.data.has_more || data.length === 0) {
        finished = true;
        break;
      }

      startingAfter = idOf(data[data.length - 1]);
    }

    if (!finished) {
      findings.push(finding("list_page_limit", "incomplete"));
      listComplete = false;
    }
  }

  result.stripe.listComplete = listComplete;

  if (!listComplete) {
    complete = false;
  }

  if (!rangeStartMs) {
    findings.push(finding("range_start_unknown", "info"));
  }

  // ③ 1件ずつ照合する。
  const mode = config.mode;
  const entries = Array.from(byId.values());

  entries.forEach(function(entry) {
    entry.mismatches = compareToInvoice(entry, invoice, invoiceId, mode);
    entry.recorded = knownIds.has(entry.id);
  });

  if (entries.some(function(entry) { return entry.mismatches.includes("livemode") || entry.mismatches.includes("metadata_mode"); })) {
    findings.push(finding("mode_mismatch", "severe"));
  }

  if (entries.some(function(entry) {
    return entry.mismatches.some(function(m) { return m !== "livemode" && m !== "metadata_mode"; });
  })) {
    findings.push(finding("payment_intent_mismatch", "severe"));
  }

  const active = entries.filter(function(entry) { return ACTIVE_PI_STATUSES.includes(entry.status); });
  const succeeded = entries.filter(function(entry) { return entry.status === "succeeded"; });
  const received = succeeded.reduce(function(sum, entry) { return sum + (Number(entry.amountReceived) || 0); }, 0);

  if (active.length >= 2) {
    findings.push(finding("duplicate_charge_suspected", "severe"));
  }

  if (received > Number(invoice.amountJpy)) {
    findings.push(finding("received_exceeds_invoice", "severe"));
  }

  if (entries.some(function(entry) { return !entry.recorded; })) {
    findings.push(finding("unrecorded_payment_intent", "warning"));
  }

  if (unlinked.length > 0) {
    findings.push(finding("possible_unlinked_payment", "info"));
  }

  // ④ 請求書の状態との対応(自動では直さない)。
  // 「見つからない」ことを根拠にする判定は、照会が完了した時だけ行う(照会できなかった分を「無い」と扱わない)。
  const status = invoice.status;
  const recordedEntry = typeof invoice.paymentIntentId === "string" ? byId.get(invoice.paymentIntentId) : null;

  if (status === "paid") {
    if (recordedEntry && recordedEntry.status !== "succeeded") {
      findings.push(finding("paid_not_confirmed", "severe"));
    } else if (complete && !(succeeded.length === 1 && recordedEntry)) {
      findings.push(finding("paid_not_confirmed", "severe"));
    }
  } else if (status === "closed" || status === "closing") {
    if (entries.length > 0) {
      findings.push(finding("payment_exists_for_unbilled_invoice", "severe"));
    }
  } else if (status === "payment_failed") {
    if (succeeded.length > 0) {
      findings.push(finding("succeeded_but_marked_failed", "severe"));
    }
  } else if (status === "charging" || status === "needs_review") {
    if (active.length > 0) {
      findings.push(finding("stripe_has_active_payment", "warning"));
    }
  } else if (status === "processing" || status === "requires_action") {
    if (!recordedEntry) {
      if (complete) {
        findings.push(finding("recorded_payment_intent_missing", "warning"));
      }
    } else if (!(status === "processing" ? ["processing"] : ["requires_action", "requires_payment_method", "requires_confirmation"]).includes(recordedEntry.status)) {
      findings.push(finding("status_differs", "warning"));
    }
  } else if (status === "charge_error") {
    if (entries.length > 0) {
      findings.push(finding("payment_exists_for_charge_error", "warning"));
    }
  }

  if (recordedEntry && invoice.paymentIntentStatus && recordedEntry.status !== invoice.paymentIntentStatus && status !== "paid") {
    findings.push(finding("recorded_status_outdated", "info"));
  }

  if (entries.length === 0 && complete) {
    findings.push(finding("not_found_in_range", "info"));
  }

  // 応答から照合用の内部項目を外し、真偽値だけ残す。
  result.paymentIntents = entries.map(function(entry) {
    const out = { ...entry };
    delete out._customer;
    delete out._paymentMethod;
    return out;
  });
  result.unlinkedCandidates = unlinked.slice(0, 20).map(function(entry) {
    const out = { ...entry };
    delete out._customer;
    delete out._paymentMethod;
    return out;
  });
  result.complete = complete;

  const has = function(severity) {
    return findings.some(function(f) { return f.severity === severity; });
  };

  if (findings.some(function(f) { return f.code === "mode_mismatch"; })) {
    result.verdict = "mode_mismatch";
  } else if (has("severe")) {
    result.verdict = "mismatch";
  } else if (!complete || has("incomplete")) {
    result.verdict = "incomplete";
  } else if (has("warning")) {
    result.verdict = "attention";
  } else if (entries.length === 0) {
    result.verdict = "not_found_in_range";
  } else {
    result.verdict = "verified";
  }

  return result;
}

// mode: imadakeBillingInspect (POST、運営のみ、読み取り専用)
//   入力 { invoiceId }。Stripeには GET だけ。Firestoreには書かない。
export async function handleImadakeBillingInspect(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    const result = await inspectImadakeInvoice(authResult.database, deps, invoiceId, Date.now());

    if (!result.ok) {
      return response.status(result.reason === "invalid_invoice_id" ? 400 : 503).json({ success: false, reason: result.reason });
    }

    return response.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("今だけ投稿 月次請求のStripe照合エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}

// ==========================================================================
// STEP 32-D⑩｜Stripeとの読み取り接続の確認(運営のみ)
// ==========================================================================
// GET /v1/payment_intents?limit=1 を1回だけ送り、読み取り権限・応答の形・本番/テストを確かめる。
// 請求書もPaymentIntentも作らない。Firestoreには触れない。PaymentIntentの中身は返さない(件数だけ)。
// Stripeの設定が無効(Production・キー未設定・本番キー等)なら接続しない。
export async function checkStripeReadConnection(deps, nowMs) {
  const config = readStripeChargeConfig(deps.env);
  const base = { ok: true, checkedAtMs: nowMs, connected: false, testMode: null, mode: "", httpStatus: null, sampleCount: null };

  if (!config.ok) {
    return { ...base, status: "stripe_disabled", configReason: config.reason };
  }

  base.mode = config.mode;
  base.testMode = config.mode === "test";
  const fetched = await stripeGet(config, deps, "/payment_intents", { "limit": 1 });
  base.httpStatus = fetched.status;

  if (!fetched.ok) {
    if (fetched.status === 0) {
      return { ...base, status: "network_error" };
    }

    if (fetched.status === 401) {
      return { ...base, status: "unauthorized" };
    }

    if (fetched.status === 403) {
      // 制限付きキーに PaymentIntents の読み取り権限が無い場合など。
      return { ...base, status: "forbidden", errorCode: fetched.code || "" };
    }

    if (fetched.status === 429) {
      return { ...base, status: "rate_limited" };
    }

    if (fetched.status >= 200 && fetched.status < 300) {
      return { ...base, status: "invalid_response" };
    }

    return { ...base, status: "stripe_error", errorCode: fetched.code || "" };
  }

  const data = fetched.data;

  if (!data || data.object !== "list" || !Array.isArray(data.data) || typeof data.has_more !== "boolean") {
    return { ...base, status: "invalid_response" };
  }

  base.sampleCount = data.data.length;

  if (data.data.length > 0) {
    const sample = data.data[0];

    if (!sample || typeof sample.livemode !== "boolean") {
      return { ...base, status: "invalid_response" };
    }

    if (sample.livemode !== (config.mode === "live")) {
      return { ...base, status: "mode_mismatch" };
    }
  }

  return { ...base, status: "connected", connected: true };
}

// mode: imadakeBillingStripeCheck (POST、運営のみ、StripeへGETを1回だけ)
export async function handleImadakeBillingStripeCheck(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const result = await checkStripeReadConnection(deps, Date.now());
    return response.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("今だけ投稿 Stripe接続確認エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}

// mode: imadakeBillingOverview (POST、運営のみ、読み取り専用)
//   入力 { invoiceCursor?, billingCursor?, invoicesDone?, billingDone? }(前回の応答の next をそのまま渡すと続きを読む)。
//   全体の確認が終わったのは、next.invoicesDone と next.billingDone が両方 true になった時。
export async function handleImadakeBillingOverview(request, response, deps) {
  try {
    const authResult = await deps.requireAdmin(request);

    if (!authResult.ok) {
      return response.status(authResult.status).json({ success: false, message: authResult.message });
    }

    const body = deps.readRequestBody(request) || {};
    const result = await buildImadakeBillingOverview(authResult.database, {
      invoiceCursor: typeof body.invoiceCursor === "string" ? body.invoiceCursor.trim() : "",
      invoicesDone: body.invoicesDone === true,
      billingDone: body.billingDone === true,
      billingCursor: typeof body.billingCursor === "string" ? body.billingCursor.trim() : "",
      nowMillis: Date.now()
    });

    if (!result.ok) {
      return response.status(400).json({ success: false, reason: result.reason });
    }

    return response.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("今だけ投稿 月次請求の確認一覧エラー：", error && error.message);
    return response.status(500).json({ success: false, reason: "server_error" });
  }
}
