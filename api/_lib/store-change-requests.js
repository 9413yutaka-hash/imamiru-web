// 運営管理の変更依頼(月1回を超える更新の依頼・1回1,000円・税込)の台帳。
// 状態：requested(受付) → completed(作業完了・料金が確定) → invoiced(月末締めで請求書に合算済み)
//       requested → canceled(取り消し・請求しない)
// 料金の確定は作業が完了した時点。完了していなければ請求しない(代表決定 2026-11-16)。
// 締めでの合算は store-custom-plan-billing.js の月末締めが行う。ここは台帳の状態操作(運営のみ)。
import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  STORE_CHANGE_REQUESTS_COLLECTION,
  STORE_CHANGE_REQUEST_FEE_JPY,
  STORE_CUSTOM_PLAN_KIND_MANAGED,
  jstMonthKey,
  normalizeStoreCustomPlanKind
} from "./store-custom-plan-billing.js";

const STORE_CUSTOM_PLANS_COLLECTION = "storeCustomPlans";
const REQUEST_ID_PATTERN = /^cr_[A-Za-z0-9-]{8,80}$/;
const STORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const NOTE_MAX_LENGTH = 200;
const LIST_LIMIT = 100;

function sendError(response, status, reason, extra) {
  return response.status(status).json(Object.assign({ success: false, reason: reason }, extra || {}));
}

function readNowMillis(deps) {
  return deps && typeof deps.now === "function" ? deps.now() : Date.now();
}

function millisOf(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function summarizeChangeRequest(documentSnapshot) {
  const data = documentSnapshot.data() || {};

  return {
    requestId: documentSnapshot.id,
    storeId: typeof data.storeId === "string" ? data.storeId : "",
    status: typeof data.status === "string" ? data.status : "",
    feeJpy: Number.isInteger(data.feeJpy) ? data.feeJpy : 0,
    note: typeof data.note === "string" ? data.note : "",
    requestedAtMillis: millisOf(data.requestedAt),
    completedAtMillis: millisOf(data.completedAt),
    completedMonth: typeof data.completedMonth === "string" ? data.completedMonth : "",
    canceledAtMillis: millisOf(data.canceledAt),
    invoiceId: typeof data.invoiceId === "string" ? data.invoiceId : ""
  };
}

async function requireAdminDatabase(request, response, deps) {
  const authResult = await deps.requireAdmin(request);

  if (!authResult.ok) {
    response.status(authResult.status).json({ success: false, message: authResult.message });
    return null;
  }

  return authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
}

function readRequestId(body) {
  return body && typeof body.requestId === "string" && REQUEST_ID_PATTERN.test(body.requestId) ? body.requestId : "";
}

// mode: adminStoreChangeRequestCreate (POST、運営のみ) { storeId, note? }
// 運営管理の契約がある店舗だけ受け付ける。
export async function handleAdminStoreChangeRequestCreate(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const storeId = typeof body.storeId === "string" ? body.storeId : "";

    if (!STORE_ID_PATTERN.test(storeId)) {
      return sendError(response, 400, "invalid_input", { field: "storeId" });
    }

    const note = typeof body.note === "string" ? body.note.trim().slice(0, NOTE_MAX_LENGTH) : "";
    const planSnapshot = await database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId).get();
    const plan = planSnapshot.exists ? planSnapshot.data() || {} : null;

    if (!plan || normalizeStoreCustomPlanKind(plan.planKind) !== STORE_CUSTOM_PLAN_KIND_MANAGED ||
        (plan.status !== "active" && plan.status !== "canceling")) {
      return sendError(response, 409, "change_request_plan_required");
    }

    const nowMillis = readNowMillis(deps);
    const requestRef = database.collection(STORE_CHANGE_REQUESTS_COLLECTION).doc("cr_" + randomUUID());

    await requestRef.set({
      storeId: storeId,
      status: "requested",
      feeJpy: 0,
      note: note,
      requestedAt: Timestamp.fromMillis(nowMillis),
      completedAt: null,
      completedMonth: "",
      canceledAt: null,
      invoiceId: "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    const created = await requestRef.get();
    return response.status(200).json({ success: true, request: summarizeChangeRequest(created) });
  } catch (error) {
    console.error("変更依頼：受付エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminStoreChangeRequestComplete (POST、運営のみ) { requestId }
// 作業の完了を記録し、この時点で料金(1,000円)が確定する。完了した月が請求の月になる。
export async function handleAdminStoreChangeRequestComplete(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const requestId = readRequestId(body);

    if (requestId === "") {
      return sendError(response, 400, "invalid_input", { field: "requestId" });
    }

    const requestRef = database.collection(STORE_CHANGE_REQUESTS_COLLECTION).doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return sendError(response, 404, "request_not_found");
    }

    if ((snapshot.data() || {}).status !== "requested") {
      return sendError(response, 409, "request_not_completable");
    }

    const nowMillis = readNowMillis(deps);

    await requestRef.update({
      status: "completed",
      feeJpy: STORE_CHANGE_REQUEST_FEE_JPY,
      completedAt: Timestamp.fromMillis(nowMillis),
      completedMonth: jstMonthKey(nowMillis),
      updatedAt: FieldValue.serverTimestamp()
    });

    const updated = await requestRef.get();
    return response.status(200).json({ success: true, request: summarizeChangeRequest(updated) });
  } catch (error) {
    console.error("変更依頼：完了エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminStoreChangeRequestCancel (POST、運営のみ) { requestId }
// 着手前・着手後のどちらでも、完了していなければ請求しない(代表決定 2026-11-16)。
export async function handleAdminStoreChangeRequestCancel(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const requestId = readRequestId(body);

    if (requestId === "") {
      return sendError(response, 400, "invalid_input", { field: "requestId" });
    }

    const requestRef = database.collection(STORE_CHANGE_REQUESTS_COLLECTION).doc(requestId);
    const snapshot = await requestRef.get();

    if (!snapshot.exists) {
      return sendError(response, 404, "request_not_found");
    }

    if ((snapshot.data() || {}).status !== "requested") {
      return sendError(response, 409, "request_not_cancelable");
    }

    await requestRef.update({
      status: "canceled",
      canceledAt: Timestamp.fromMillis(readNowMillis(deps)),
      updatedAt: FieldValue.serverTimestamp()
    });

    const updated = await requestRef.get();
    return response.status(200).json({ success: true, request: summarizeChangeRequest(updated) });
  } catch (error) {
    console.error("変更依頼：取消エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminStoreChangeRequestList (POST、運営のみ) { storeId? }
export async function handleAdminStoreChangeRequestList(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    let query = database.collection(STORE_CHANGE_REQUESTS_COLLECTION);

    if (storeId !== "") {
      if (!STORE_ID_PATTERN.test(storeId)) {
        return sendError(response, 400, "invalid_input", { field: "storeId" });
      }

      query = query.where("storeId", "==", storeId);
    }

    const snapshot = await query.get();
    const requests = snapshot.docs
      .map(summarizeChangeRequest)
      .sort((a, b) => b.requestedAtMillis - a.requestedAtMillis)
      .slice(0, LIST_LIMIT);

    return response.status(200).json({ success: true, requests: requests });
  } catch (error) {
    console.error("変更依頼：一覧エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
