// ==========================================================================
// STEP 48-B｜共有リンクのプレビュー(OGP)のページ(サーバー側のみ。Vercel Function ではない)
// ==========================================================================
// 共有するURL(vercel.json の rewrite でここへ届く)：
//   https://machinau.jp/share/imadake/{投稿ID} → GET mode=renderShareImadake&postId=
//   https://machinau.jp/share/shop/{ID}        → GET mode=renderShareShop&shopId=(正式店舗は sp_{storeId})
// LINE・X・Facebook 等は JavaScript を動かさずに HTML の OGP(og:title・og:image 等)を読むため、
// 投稿・店舗ごとの題名・写真を載せた小さな HTML を返す。人が開いた時は、すぐに TOP の
// 直接表示(/?imadake= ・ /?shop=、app.js の STEP 48)へ移る(JavaScript の location.replace。meta refresh は
// 一部のクローラーが転送として辿り TOP の OGP を読んでしまうため使わない。JavaScript が無い時はリンクを押す)。
//
// 載せてよいのは、TOP の公開一覧が既に公開している値だけ：
//   今だけ投稿：公開中かつ期限内の投稿の見出し・店名・本文の冒頭80文字(カードの紹介文)・写真1枚。
//     本文の全文・住所・連絡先・価格は載せない。CV・料金台帳は記録しない(読み取りだけ)。
//   店舗：公開一覧と同じ条件の運営掲載(常設店舗広告)・正式店舗の店名・紹介の冒頭80文字・写真1枚。
//     引き継ぎ済みの運営掲載で、引き継いだ正式店舗が公開中なら、正式店舗の内容を載せる(一覧と同じ)。
// 公開中でない・期限切れ・削除済み・存在しない・形の違うIDは、マチナウの共通の題名・画像だけ
// (固有の写真・本文は出さない)。位置情報・利用者のID・認証情報は URL にも HTML にも含めない。
// キャッシュは短く(60秒＋60秒)。掲載が終わった後は、遅くとも約2分で共通の表示に変わる
// (SNS 側が持つ控えは、SNS 側の仕組みで更新される)。検索には登録させない(noindex)。
// ==========================================================================

import {
  IMADAKE_POSTS_COLLECTION,
  isPublishedAndUnexpired,
  buildImadakeCardExcerpt
} from "./imadake.js";

import {
  readPublicStoreProfileForShare
} from "./store-profile.js";

export const SHARE_PREVIEW_ORIGIN =
  "https://machinau.jp";

export const SHARE_PREVIEW_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=60";

const SHARE_PREVIEW_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

const SHARE_PREVIEW_IMAGE_PREFIX =
  "https://res.cloudinary.com/";

const SHARE_PREVIEW_DESCRIPTION_LENGTH =
  80;

// TOP(index.html)の OGP と同じ共通の表示。
export const SHARE_PREVIEW_DEFAULT = {
  title: "マチナウ｜今、何が起きているかを見つけよう",
  description: "沖縄の今だけ楽しめる店舗情報、イベント、タイムセールを見つけられるリアルタイム観光コンシェルジュです。",
  image: "https://machinau.jp/icon-512.png?v=2"
};

const SITE_NAME =
  "マチナウ";

function escapeShareHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(values) {
  for (const value of values) {
    const text = readText(value);

    if (text !== "") {
      return text;
    }
  }

  return "";
}

// 紹介文は、カードと同じ作り方(改行・連続空白を1つにまとめ、80文字で切る)。
function buildShareDescription(text) {
  const excerpt =
    buildImadakeCardExcerpt(text);

  return excerpt.excerpt + (excerpt.excerptTruncated ? "…" : "");
}

function readShareImage(urls) {
  const list =
    Array.isArray(urls) ? urls : [];

  for (const url of list) {
    if (
      typeof url === "string" &&
      url.indexOf(SHARE_PREVIEW_IMAGE_PREFIX) === 0 &&
      !/[\s"'<>]/.test(url)
    ) {
      return url;
    }
  }

  return "";
}

// preview：{ title, description, image }(固有の内容)または null(共通の表示)。
export function buildSharePreviewHtml(sharePath, landingPath, preview) {
  const content =
    preview || SHARE_PREVIEW_DEFAULT;

  const image =
    preview && preview.image !== ""
      ? preview.image
      : SHARE_PREVIEW_DEFAULT.image;

  const hasOwnImage =
    !!(preview && preview.image !== "");

  const pageTitle =
    preview
      ? content.title + "｜" + SITE_NAME
      : content.title;

  const shareUrl =
    SHARE_PREVIEW_ORIGIN + sharePath;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${escapeShareHtml(pageTitle)}</title>
  <meta name="description" content="${escapeShareHtml(content.description)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:title" content="${escapeShareHtml(pageTitle)}">
  <meta property="og:description" content="${escapeShareHtml(content.description)}">
  <meta property="og:url" content="${escapeShareHtml(shareUrl)}">
  <meta property="og:image" content="${escapeShareHtml(image)}">
  <meta name="twitter:card" content="${hasOwnImage ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeShareHtml(pageTitle)}">
  <meta name="twitter:description" content="${escapeShareHtml(content.description)}">
  <meta name="twitter:image" content="${escapeShareHtml(image)}">
  <link rel="icon" type="image/png" href="/favicon.png?v=2">
  <script>location.replace(${JSON.stringify(landingPath).replace(/</g, "\\u003c")});</script>
</head>
<body style="font-family: sans-serif; text-align: center; padding: 60px 20px; color: #15233a;">
  <p><a href="${escapeShareHtml(landingPath)}" style="color: #0788c9;">マチナウで見る / Open in Machinau</a></p>
</body>
</html>
`;
}

// 今だけ投稿：公開中かつ期限内の時だけ固有の内容(見出し・店名・紹介文80文字・写真1枚)。
export async function readImadakeSharePreview(database, postId, nowMillis) {
  if (!SHARE_PREVIEW_ID_PATTERN.test(postId)) {
    return null;
  }

  const snapshot =
    await database.collection(IMADAKE_POSTS_COLLECTION).doc(postId).get();

  const post =
    snapshot.exists ? snapshot.data() || {} : null;

  if (!post || !isPublishedAndUnexpired(post, nowMillis)) {
    return null;
  }

  const headline =
    readText(post.headline);

  if (headline === "") {
    return null;
  }

  const storeName =
    readText(post.storeNameSnapshot);

  const excerpt =
    buildShareDescription(post.body);

  return {
    title: headline,
    description:
      storeName !== "" && excerpt !== ""
        ? storeName + "｜" + excerpt
        : storeName || excerpt || SHARE_PREVIEW_DEFAULT.description,
    image: readShareImage(post.imageUrls)
  };
}

function buildStoreProfileSharePreview(store) {
  return {
    title: store.storeName,
    description:
      buildShareDescription(store.description) ||
      SHARE_PREVIEW_DEFAULT.description,
    image: readShareImage(
      (store.photos || []).map(function(photo) {
        return photo && photo.url;
      })
    )
  };
}

// 店舗：TOP の公開一覧と同じ条件の運営掲載(常設店舗広告)・正式店舗の時だけ固有の内容。
export async function readShopSharePreview(database, shopId) {
  if (!SHARE_PREVIEW_ID_PATTERN.test(shopId)) {
    return null;
  }

  if (shopId.indexOf("sp_") === 0) {
    const store =
      await readPublicStoreProfileForShare(database, shopId.slice(3));

    return store ? buildStoreProfileSharePreview(store) : null;
  }

  const snapshots =
    await Promise.all([
      database.collection("submissions").doc(shopId).get(),
      database.collection("storeListingLinks").doc(shopId).get()
    ]);

  const listing =
    snapshots[0].exists ? snapshots[0].data() || {} : null;

  // 公開一覧の常設店舗広告の条件(status approved・isPermanentAd)と、TOPの「無料店舗」と同じ判定(authorType shopAd)。
  if (
    !listing ||
    listing.status !== "approved" ||
    listing.isPermanentAd !== true ||
    listing.authorType !== "shopAd"
  ) {
    return null;
  }

  // 引き継ぎ済みで、引き継いだ正式店舗が公開中なら、一覧と同じく正式店舗の内容にする。
  const link =
    snapshots[1].exists ? snapshots[1].data() || {} : null;

  if (link && link.status === "active" && typeof link.storeId === "string" && link.storeId !== "") {
    const store =
      await readPublicStoreProfileForShare(database, link.storeId);

    if (store && (store.linkedListingIds || []).includes(shopId)) {
      return buildStoreProfileSharePreview(store);
    }
  }

  const name =
    firstText([listing.shopName, listing.storeName, listing.name, listing.businessName]);

  if (name === "") {
    return null;
  }

  return {
    title: name,
    description:
      buildShareDescription(firstText([listing.content, listing.message, listing.description, listing.details])) ||
      SHARE_PREVIEW_DEFAULT.description,
    image: readShareImage(listing.imageUrls)
  };
}

async function sendSharePreview(response, kind, id, readPreview) {
  const validId =
    SHARE_PREVIEW_ID_PATTERN.test(id);

  let preview =
    null;

  if (validId) {
    try {
      preview = await readPreview();
    } catch (error) {
      console.error("共有リンクのプレビューを作れませんでした(共通の表示にします)：", kind, error && error.message);
      preview = null;
    }
  }

  const encodedId =
    encodeURIComponent(id);

  const sharePath =
    validId ? "/share/" + kind + "/" + encodedId : "/";

  const landingPath =
    validId ? "/?" + kind + "=" + encodedId : "/";

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", SHARE_PREVIEW_CACHE_CONTROL);
  response.setHeader("X-Robots-Tag", "noindex");

  return response.status(200).send(
    buildSharePreviewHtml(sharePath, landingPath, preview)
  );
}

// GET mode=renderShareImadake&postId=
export async function handleRenderShareImadake(request, response, deps) {
  const postId =
    request.query && typeof request.query.postId === "string"
      ? request.query.postId.trim()
      : "";

  return sendSharePreview(response, "imadake", postId, function() {
    const database =
      deps.getFirestore(deps.getFirebaseAdminApp());

    return readImadakeSharePreview(
      database,
      postId,
      typeof deps.now === "function" ? deps.now() : Date.now()
    );
  });
}

// GET mode=renderShareShop&shopId=
export async function handleRenderShareShop(request, response, deps) {
  const shopId =
    request.query && typeof request.query.shopId === "string"
      ? request.query.shopId.trim()
      : "";

  return sendSharePreview(response, "shop", shopId, function() {
    const database =
      deps.getFirestore(deps.getFirebaseAdminApp());

    return readShopSharePreview(database, shopId);
  });
}
