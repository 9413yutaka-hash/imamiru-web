import {
  requireAdminOrEditor
} from "./moderate-submission.js";


export default async function handler(
  request,
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (
    request.method !== "GET"
  ) {
    response.setHeader(
      "Allow",
      "GET"
    );

    return response.status(405).json({
      success: false,
      message:
        "GETのみ利用できます。"
    });
  }

  // 運営投稿担当(Editor)権限 Phase1｜api/moderate-submission.jsの
  // requireAdminOrEditor()を再利用する(edit-ad.jsの既存実例と同じ方法)。
  const authResult =
    await requireAdminOrEditor(
      request
    );

  if (!authResult.ok) {
    return response.status(authResult.status).json({
      success: false,
      message:
        authResult.message
    });
  }

  try {
    const documentId =
      request.query &&
      typeof request.query.id === "string"
        ? request.query.id.trim()
        : "";

    if (documentId === "") {
      return response.status(400).json({
        success: false,
        message:
          "documentIdを指定してください。"
      });
    }

    const database =
      authResult.database;

    const documentSnapshot =
      await database
        .collection(
          "submissions"
        )
        .doc(
          documentId
        )
        .get();

    if (
      !documentSnapshot.exists
    ) {
      return response.status(404).json({
        success: false,
        message:
          "対象の投稿が見つかりませんでした。"
      });
    }

    const data =
      documentSnapshot.data() ||
      {};

    // 常設店舗広告(isPermanentAd:true)はpostTypeを設定しない設計のため、
    // 通常のpostType==="admin"チェックに加えてこちらも許可する
    // (api/admin-submission-update.jsの許可チェックと同じパターン)。
    if (
      data.postType !== "admin" &&
      data.isPermanentAd !== true
    ) {
      return response.status(403).json({
        success: false,
        message:
          "この投稿は編集できません。"
      });
    }

    // 運営投稿担当(Editor)権限 Phase1｜api/admin-submission-update.jsと
    // 同じ制限(常設広告は代表専用、通常投稿は自分が作成したものだけ)を
    // 編集画面の読み込み時点でも適用する(保存時だけ拒否すると、Editorが
    // 他人の下書き内容を一度画面に読み込めてしまうため)。
    if (
      authResult.actor.type !== "admin"
    ) {
      if (
        data.isPermanentAd === true
      ) {
        return response.status(403).json({
          success: false,
          message:
            "常設店舗広告の編集は管理者のみ利用できます。"
        });
      }

      if (
        data.operatorUid !==
        authResult.actor.uid
      ) {
        return response.status(403).json({
          success: false,
          message:
            "この投稿はご自身が作成したものではないため編集できません。"
        });
      }
    }

    const expiresAtValue =
      data.expiresAt &&
      typeof data.expiresAt.toDate === "function"
        ? data.expiresAt
            .toDate()
            .toISOString()
        : null;

    return response.status(200).json({
      success: true,
      submission: {
        id:
          documentSnapshot.id,

        title:
          data.title || "",

        category:
          data.category || "",

        content:
          data.content || "",

        expiresAt:
          expiresAtValue,

        address:
          data.address || "",

        // Ver1.8 Phase2 STEP7-G2A｜既存投稿にareaフィールドが無い場合
        // (このAPI追加より前に作成された投稿等)でも編集画面が壊れないよう、
        // 文字列以外は空文字へ正規化する(address等の既存フィールドと同じ
        // 「|| ""」パターンで統一)。新規Firestore readは追加していない
        // (documentSnapshotから既に取得済みのdataを参照するだけ)。
        area:
          data.area || "",

        latitude:
          typeof data.latitude === "number"
            ? data.latitude
            : null,

        longitude:
          typeof data.longitude === "number"
            ? data.longitude
            : null,

        imageUrls:
          Array.isArray(
            data.imageUrls
          )
            ? data.imageUrls
            : [],

        websiteUrl:
          data.websiteUrl || "",

        sourceLabel:
          data.sourceLabel || "",

        postType:
          data.postType || "",

        isPermanentAd:
          data.isPermanentAd === true
      }
    });
  } catch (error) {
    console.error(
      "運営情報の取得エラー：",
      error
    );

    return response.status(500).json({
      success: false,
      message:
        "投稿内容の取得に失敗しました。時間をおいて、もう一度お試しください。"
    });
  }
}
