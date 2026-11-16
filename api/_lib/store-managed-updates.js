// 運営管理の代行編集：運営が作る更新案（ドラフト）と、店舗の承認を経て公開するまでの作業管理。
// 流れ：draft（下書き）→ sent（店舗へ送った）→ approved（承認の記録）→ applied（公開に反映）
//       draft／sent → canceled、sent → rejected（承認が得られなかった）
// 承認は公式LINEで取り、返事がなければ公開しない（代表決定 2026-11-16）。このファイルは状態と反映だけを持ち、
// LINEの送信そのものは運営が公式LINEアプリで行う（送った事実を sent として記録する）。
// 対象は有料の内容（ストーリー・メニュー・商品・追加リンク）。商品写真は、既に保存されている写真の
// 使い回し・並べ替え・取り外しだけ（運営による写真の新規追加はこの経路では扱わない）。
// 反映は、店主本人の保存と同じ検証・Moderationを通し、監査ログを残す。
import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp
} from "firebase-admin/firestore";

import {
  STORE_CUSTOM_PLAN_KIND_MANAGED,
  normalizeStoreCustomPlanKind
} from "./store-custom-plan-billing.js";
import {
  STORE_CUSTOM_PROFILES_COLLECTION,
  buildStoreCustomModerationText,
  validateStoreCustomProfileInput
} from "./store-custom-profile.js";
import {
  readStoreCardPlanActive
} from "./store-profile.js";

export const STORE_MANAGED_UPDATES_COLLECTION = "storeManagedUpdates";
export const STORE_MANAGED_AUDIT_LOGS_COLLECTION = "storeManagedAuditLogs";

const STORE_CUSTOM_PLANS_COLLECTION = "storeCustomPlans";
const UPDATE_ID_PATTERN = /^mu_[A-Za-z0-9-]{8,80}$/;
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

function readRevision(customData) {
  return customData && Number.isInteger(customData.revision) ? customData.revision : 0;
}

async function requireAdminDatabase(request, response, deps) {
  const authResult = await deps.requireAdmin(request);

  if (!authResult.ok) {
    response.status(authResult.status).json({ success: false, message: authResult.message });
    return null;
  }

  return authResult.database || deps.getFirestore(deps.getFirebaseAdminApp());
}

async function readManagedPlan(database, storeId) {
  const snapshot = await database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId).get();

  if (!snapshot.exists) {
    return null;
  }

  const plan = snapshot.data() || {};
  return normalizeStoreCustomPlanKind(plan.planKind) === STORE_CUSTOM_PLAN_KIND_MANAGED ? plan : null;
}

function summarizeUpdate(documentSnapshot) {
  const data = documentSnapshot.data() || {};

  return {
    updateId: documentSnapshot.id,
    storeId: typeof data.storeId === "string" ? data.storeId : "",
    status: typeof data.status === "string" ? data.status : "",
    baseRevision: Number.isInteger(data.baseRevision) ? data.baseRevision : 0,
    appliedRevision: Number.isInteger(data.appliedRevision) ? data.appliedRevision : 0,
    createdAtMillis: millisOf(data.createdAt),
    sentAtMillis: millisOf(data.sentAt),
    approvalRecordedAtMillis: data.approval ? millisOf(data.approval.recordedAt) : 0,
    approvalApproved: data.approval ? data.approval.approved === true : null,
    appliedAtMillis: millisOf(data.appliedAt),
    payload: data.payload || null,
    events: Array.isArray(data.events) ? data.events : []
  };
}

function eventOf(type, nowMillis) {
  return { type: type, atMillis: nowMillis };
}

async function loadUpdate(database, updateId) {
  const ref = database.collection(STORE_MANAGED_UPDATES_COLLECTION).doc(updateId);
  const snapshot = await ref.get();
  return snapshot.exists ? { ref: ref, snapshot: snapshot, data: snapshot.data() || {} } : null;
}

function readUpdateId(body) {
  return body && typeof body.updateId === "string" && UPDATE_ID_PATTERN.test(body.updateId) ? body.updateId : "";
}

// mode: adminManagedUpdateCreate (POST、運営のみ) { storeId, custom: { story, menuItems, links } }
// 更新案を作る。検証は店主本人の保存と同じものを通す。新しい商品写真は受け付けない。
export async function handleAdminManagedUpdateCreate(request, response, deps) {
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

    if (!(await readManagedPlan(database, storeId))) {
      return sendError(response, 409, "managed_plan_required");
    }

    const custom = body.custom && typeof body.custom === "object" ? body.custom : {};
    const input = validateStoreCustomProfileInput(custom, storeId);

    if (!input.ok) {
      return sendError(response, 400, "invalid_input",
        input.index !== undefined ? { field: input.field, index: input.index } : { field: input.field });
    }

    const customSnapshot = await database.collection(STORE_CUSTOM_PROFILES_COLLECTION).doc(storeId).get();
    const customData = customSnapshot.exists ? customSnapshot.data() || {} : {};
    const storedPhotoIds = new Set(
      (Array.isArray(customData.menuItems) ? customData.menuItems : [])
        .map(function(item) { return item && item.photo ? item.photo.publicId : ""; })
        .filter(function(id) { return typeof id === "string" && id !== ""; })
    );

    for (const item of input.fields.menuItems) {
      if (item.photo && !storedPhotoIds.has(item.photo.publicId)) {
        return sendError(response, 400, "managed_update_new_photo_not_supported");
      }
    }

    const nowMillis = readNowMillis(deps);
    const updateRef = database.collection(STORE_MANAGED_UPDATES_COLLECTION).doc("mu_" + randomUUID());

    await updateRef.set({
      storeId: storeId,
      status: "draft",
      payload: {
        story: input.fields.story,
        menuItems: input.fields.menuItems,
        links: input.fields.links
      },
      baseRevision: readRevision(customData),
      appliedRevision: 0,
      sentAt: null,
      approval: null,
      appliedAt: null,
      events: [eventOf("created", nowMillis)],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    const created = await updateRef.get();
    return response.status(200).json({ success: true, update: summarizeUpdate(created) });
  } catch (error) {
    console.error("運営代行：更新案の作成エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminManagedUpdateMarkSent (POST、運営のみ) { updateId }
// 店舗へ更新内容を送った（公式LINE）ことを記録する。
export async function handleAdminManagedUpdateMarkSent(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const updateId = readUpdateId(body);

    if (updateId === "") {
      return sendError(response, 400, "invalid_input", { field: "updateId" });
    }

    const loaded = await loadUpdate(database, updateId);

    if (!loaded) {
      return sendError(response, 404, "update_not_found");
    }

    if (loaded.data.status !== "draft") {
      return sendError(response, 409, "update_not_sendable");
    }

    const nowMillis = readNowMillis(deps);
    const events = (Array.isArray(loaded.data.events) ? loaded.data.events : []).concat([eventOf("sent", nowMillis)]);

    await loaded.ref.update({
      status: "sent",
      sentAt: Timestamp.fromMillis(nowMillis),
      events: events,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updated = await loaded.ref.get();
    return response.status(200).json({ success: true, update: summarizeUpdate(updated) });
  } catch (error) {
    console.error("運営代行：送信の記録エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminManagedUpdateRecordApproval (POST、運営のみ) { updateId, approved, note? }
// 公式LINEで得た店舗の返事を記録する。承認が無いままでは反映できない。
export async function handleAdminManagedUpdateRecordApproval(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const updateId = readUpdateId(body);

    if (updateId === "") {
      return sendError(response, 400, "invalid_input", { field: "updateId" });
    }

    if (body.approved !== true && body.approved !== false) {
      return sendError(response, 400, "invalid_input", { field: "approved" });
    }

    const loaded = await loadUpdate(database, updateId);

    if (!loaded) {
      return sendError(response, 404, "update_not_found");
    }

    if (loaded.data.status !== "sent") {
      return sendError(response, 409, "update_not_awaiting_approval");
    }

    const nowMillis = readNowMillis(deps);
    const note = typeof body.note === "string" ? body.note.trim().slice(0, NOTE_MAX_LENGTH) : "";
    const events = (Array.isArray(loaded.data.events) ? loaded.data.events : [])
      .concat([eventOf(body.approved ? "approved" : "rejected", nowMillis)]);

    await loaded.ref.update({
      status: body.approved ? "approved" : "rejected",
      approval: {
        approved: body.approved,
        source: "line",
        note: note,
        recordedAt: Timestamp.fromMillis(nowMillis)
      },
      events: events,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updated = await loaded.ref.get();
    return response.status(200).json({ success: true, update: summarizeUpdate(updated) });
  } catch (error) {
    console.error("運営代行：承認の記録エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminManagedUpdateApply (POST、運営のみ) { updateId }
// 承認済みの更新案を公開内容へ反映する。店主本人の保存と同じ検証・Moderationを通し、監査ログを残す。
export async function handleAdminManagedUpdateApply(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const updateId = readUpdateId(body);

    if (updateId === "") {
      return sendError(response, 400, "invalid_input", { field: "updateId" });
    }

    const loaded = await loadUpdate(database, updateId);

    if (!loaded) {
      return sendError(response, 404, "update_not_found");
    }

    if (loaded.data.status !== "approved" || !loaded.data.approval || loaded.data.approval.approved !== true) {
      return sendError(response, 409, "update_not_approved");
    }

    const storeId = loaded.data.storeId;
    const payload = loaded.data.payload || {};
    const input = validateStoreCustomProfileInput(payload, storeId);

    if (!input.ok) {
      return sendError(response, 400, "invalid_input",
        input.index !== undefined ? { field: input.field, index: input.index } : { field: input.field });
    }

    const customRef = database.collection(STORE_CUSTOM_PROFILES_COLLECTION).doc(storeId);
    const customSnapshot = await customRef.get();
    const customBefore = customSnapshot.exists ? customSnapshot.data() || {} : {};

    if (readRevision(customBefore) !== loaded.data.baseRevision) {
      return sendError(response, 409, "managed_update_conflict", { currentRevision: readRevision(customBefore) });
    }

    // 文章が確認済みの内容から変わった時だけ Moderation を呼ぶ（店主本人の保存と同じ）。
    const nextText = buildStoreCustomModerationText(input.fields);
    const textBefore = typeof customBefore.moderatedText === "string" ? customBefore.moderatedText : null;
    let moderationUpdate = {};

    if (nextText !== textBefore) {
      if (nextText !== "") {
        let flagged;

        try {
          const accountSnapshot = await database.collection("storeAccounts").doc(storeId).get();
          const results = await deps.callOpenAiModeration(
            deps.buildModerationInput({
              shopName: accountSnapshot.exists ? (accountSnapshot.data() || {}).storeName || "" : "",
              title: "",
              content: nextText
            })
          );

          if (!Array.isArray(results) || results.length === 0) {
            throw new Error("moderation response was empty");
          }

          flagged = !results.every(function(result) { return result && result.flagged === false; });
        } catch (moderationError) {
          console.error("運営代行：Moderationエラー：", deps.classifyModerationError(moderationError));
          return sendError(response, 503, "safety_check_unavailable");
        }

        if (flagged) {
          return sendError(response, 400, "content_not_allowed");
        }
      }

      moderationUpdate = {
        moderationStatus: "passed",
        moderatedText: nextText,
        moderationCheckedAt: FieldValue.serverTimestamp()
      };
    }

    const storedPhotoStatus = new Map(
      (Array.isArray(customBefore.menuItems) ? customBefore.menuItems : [])
        .filter(function(item) { return item && item.photo && item.photo.publicId; })
        .map(function(item) { return [item.photo.publicId, item.photo.moderationStatus]; })
    );
    const menuItems = input.fields.menuItems.map(function(item) {
      return {
        name: item.name,
        description: item.description,
        priceText: item.priceText,
        photo: item.photo
          ? {
              url: item.photo.url,
              publicId: item.photo.publicId,
              moderationStatus: storedPhotoStatus.get(item.photo.publicId) || "passed"
            }
          : null
      };
    });

    const nowMillis = readNowMillis(deps);
    let appliedRevision = 0;
    let outcome = null;

    await database.runTransaction(async function(transaction) {
      const snapshots = await Promise.all([
        transaction.get(database.collection(STORE_CUSTOM_PLANS_COLLECTION).doc(storeId)),
        transaction.get(customRef),
        transaction.get(loaded.ref)
      ]);
      const planData = snapshots[0].exists ? snapshots[0].data() || {} : null;

      if (!planData || normalizeStoreCustomPlanKind(planData.planKind) !== STORE_CUSTOM_PLAN_KIND_MANAGED) {
        outcome = { status: 409, reason: "managed_plan_required" };
        return;
      }

      if (!(await readStoreCardPlanActive(database, storeId, nowMillis, transaction))) {
        outcome = { status: 403, reason: "plan_required" };
        return;
      }

      const current = snapshots[1].exists ? snapshots[1].data() || {} : {};

      if (readRevision(current) !== loaded.data.baseRevision) {
        outcome = { status: 409, reason: "managed_update_conflict" };
        return;
      }

      const updateNow = snapshots[2].exists ? snapshots[2].data() || {} : {};

      if (updateNow.status !== "approved") {
        outcome = { status: 409, reason: "update_not_approved" };
        return;
      }

      appliedRevision = readRevision(current) + 1;
      const saved = Object.assign({}, current, {
        menuItems: menuItems,
        links: input.fields.links,
        story: input.fields.story,
        revision: appliedRevision
      }, moderationUpdate, { updatedAt: FieldValue.serverTimestamp() });
      transaction.set(customRef, saved);

      const events = (Array.isArray(updateNow.events) ? updateNow.events : []).concat([eventOf("applied", nowMillis)]);
      transaction.update(loaded.ref, {
        status: "applied",
        appliedAt: Timestamp.fromMillis(nowMillis),
        appliedRevision: appliedRevision,
        events: events,
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.set(database.collection(STORE_MANAGED_AUDIT_LOGS_COLLECTION).doc("ma_" + randomUUID()), {
        storeId: storeId,
        updateId: updateId,
        action: "managed_update_applied",
        appliedRevision: appliedRevision,
        at: FieldValue.serverTimestamp()
      });
    });

    if (outcome) {
      return sendError(response, outcome.status, outcome.reason);
    }

    const updated = await loaded.ref.get();
    return response.status(200).json({ success: true, update: summarizeUpdate(updated) });
  } catch (error) {
    console.error("運営代行：反映エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminManagedUpdateCancel (POST、運営のみ) { updateId }
export async function handleAdminManagedUpdateCancel(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const updateId = readUpdateId(body);

    if (updateId === "") {
      return sendError(response, 400, "invalid_input", { field: "updateId" });
    }

    const loaded = await loadUpdate(database, updateId);

    if (!loaded) {
      return sendError(response, 404, "update_not_found");
    }

    if (loaded.data.status !== "draft" && loaded.data.status !== "sent") {
      return sendError(response, 409, "update_not_cancelable");
    }

    const nowMillis = readNowMillis(deps);
    const events = (Array.isArray(loaded.data.events) ? loaded.data.events : []).concat([eventOf("canceled", nowMillis)]);

    await loaded.ref.update({
      status: "canceled",
      events: events,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updated = await loaded.ref.get();
    return response.status(200).json({ success: true, update: summarizeUpdate(updated) });
  } catch (error) {
    console.error("運営代行：取消エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}

// mode: adminManagedUpdateList (POST、運営のみ) { storeId? }
export async function handleAdminManagedUpdateList(request, response, deps) {
  try {
    const database = await requireAdminDatabase(request, response, deps);

    if (!database) {
      return;
    }

    const body = deps.readRequestBody(request) || {};
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    let query = database.collection(STORE_MANAGED_UPDATES_COLLECTION);

    if (storeId !== "") {
      if (!STORE_ID_PATTERN.test(storeId)) {
        return sendError(response, 400, "invalid_input", { field: "storeId" });
      }

      query = query.where("storeId", "==", storeId);
    }

    const snapshot = await query.get();
    const updates = snapshot.docs
      .map(summarizeUpdate)
      .sort((a, b) => b.createdAtMillis - a.createdAtMillis)
      .slice(0, LIST_LIMIT);

    return response.status(200).json({ success: true, updates: updates });
  } catch (error) {
    console.error("運営代行：一覧エラー：", error && error.message);
    return sendError(response, 500, "server_error");
  }
}
