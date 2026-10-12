// ==========================================================================
// 今だけ投稿 STEP 3｜カード(タイトル＋紹介文)の英語自動翻訳
// ==========================================================================
// TOPの今だけ投稿カードは原文をすぐ表示し、ここで作った訳が届いたらタイトルと
// 紹介文だけを差し替える(店名・住所・価格・時間・電話・URLは翻訳しない。詳細の
// 本文は対象外)。POST mode=imadakeCardTranslationGet から呼ばれる。
//
// 保存先(書き込みはこのファイルの翻訳専用処理だけ)
//   imadakePosts/{postId}.translations.{language}.card   投稿ごとの訳と状態
//   imadakeTranslationBudgets/{YYYY-MM-DD}               サービス全体の1日の新規翻訳数(日本時間)
//   imadakeTranslationRateLimits/{ipHash}                閲覧者ごとの連打制限(既存claimRateLimit)
//
// 費用の暴走防止
//   ・新規翻訳はサービス全体で1日100件まで。投稿の生成権と同じトランザクションの中で
//     その日の枠を1件確保するので、同時に要求が来ても100件を超えない。枠は生成権を
//     取った時点で消費し、失敗・タイムアウトでも返却しない。
//   ・同じ原文の失敗は3回まで(待ち時間：1回目の後10分、2回目の後1時間)。60秒を過ぎた
//     生成中(応答の途中で止まった等)も失敗1回として数える。
//   ・1リクエスト最大10投稿、匿名認証必須、閲覧者ごとの連打制限。
// 翻訳済み(原文ハッシュ一致)の配信は上限に含めない。このモジュールは先頭が"_"の
// api/_lib配下のためVercel Functionにはならない(Functions本数は増えない)。
// ==========================================================================

import {
  Timestamp
} from "firebase-admin/firestore";

import {
  randomUUID
} from "node:crypto";

import {
  IMADAKE_POSTS_COLLECTION,
  IMADAKE_CARD_TRANSLATION_LANGUAGES,
  isPublishedAndUnexpired,
  getImadakeCardSource,
  computeImadakeCardSourceHash
} from "./imadake.js";

export const IMADAKE_CARD_TRANSLATION_MAX_POSTS_PER_REQUEST =
  10;

export const IMADAKE_CARD_TRANSLATION_DAILY_LIMIT =
  100;

export const IMADAKE_CARD_TRANSLATION_BUDGETS_COLLECTION =
  "imadakeTranslationBudgets";

export const IMADAKE_CARD_TRANSLATION_RATE_LIMITS_COLLECTION =
  "imadakeTranslationRateLimits";

export const IMADAKE_CARD_TRANSLATION_RATE_LIMIT_COOLDOWN_MS =
  5 * 1000;

export const IMADAKE_CARD_TRANSLATION_GENERATING_STALE_MS =
  60 * 1000;

// n回目の失敗の後に待つ時間(1回目10分、2回目1時間)。3回目で打ち止め。
export const IMADAKE_CARD_TRANSLATION_RETRY_DELAYS_MS =
  [10 * 60 * 1000, 60 * 60 * 1000];

export const IMADAKE_CARD_TRANSLATION_MAX_FAILURES =
  3;

// 日付の区切り(初期運用は日本時間)。
const IMADAKE_TRANSLATION_DAY_OFFSET_MS =
  9 * 60 * 60 * 1000;

// 既存の店舗・読みもの翻訳と同じ安価なモデル(定数は独立させる)。
const IMADAKE_CARD_TRANSLATION_MODEL =
  "gpt-4o-mini";

const IMADAKE_CARD_TRANSLATION_ENDPOINT =
  "https://api.openai.com/v1/chat/completions";

const IMADAKE_CARD_TRANSLATION_TIMEOUT_MS =
  20 * 1000;

// 1回の呼び出しの出力トークン上限(1回最大10件。訳はタイトル160字・紹介文400字以内なので
// 通常は数百トークンで収まる)。上限で途中までになった応答は失敗として扱い、保存しない。
export const IMADAKE_CARD_TRANSLATION_MAX_OUTPUT_TOKENS =
  2000;

// OpenAI公式の標準単価(既存の店舗翻訳と同じモデル・同じ単価)。
const IMADAKE_CARD_TRANSLATION_INPUT_COST_PER_MILLION_USD =
  0.15;

const IMADAKE_CARD_TRANSLATION_OUTPUT_COST_PER_MILLION_USD =
  0.6;

// 訳の長さの上限(原文はタイトル40字・紹介文80字。英語で長くなる分の余裕)。
const IMADAKE_CARD_TRANSLATED_HEADLINE_MAX_LENGTH =
  160;

const IMADAKE_CARD_TRANSLATED_EXCERPT_MAX_LENGTH =
  400;

const IMADAKE_POST_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

function toMillis(
  value
) {
  return value && typeof value.toMillis === "function"
    ? value.toMillis()
    : null;
}

// 日本時間の日付キー(YYYY-MM-DD)。
export function computeImadakeTranslationDayKey(
  nowMillis
) {
  return new Date(
    nowMillis + IMADAKE_TRANSLATION_DAY_OFFSET_MS
  ).toISOString().slice(0, 10);
}

function getCardTranslationFieldPath(
  language
) {
  return "translations." + language + ".card";
}

function readCardTranslationEntry(
  post,
  language
) {
  return post &&
    post.translations &&
    post.translations[language] &&
    typeof post.translations[language].card === "object"
    ? post.translations[language].card
    : null;
}

// 保存済みの状態から、今回どうするかを決める(書き込みはしない)。
//   ready      原文ハッシュ一致の訳がある
//   generating 60秒以内の生成中がある(別のリクエストが翻訳中)
//   failed     同じ原文で3回失敗した(自動では再試行しない)
//   waiting    失敗後の待ち時間中
//   claimable  生成してよい(上限の確認は別)
export function decideImadakeCardTranslationState(
  entry,
  sourceHash,
  nowMillis
) {
  if (!entry) {
    return "claimable";
  }

  if (
    entry.status === "ready" &&
    entry.sourceHash === sourceHash
  ) {
    return "ready";
  }

  const startedAtMillis =
    toMillis(entry.generatingStartedAt);

  if (
    entry.status === "generating" &&
    startedAtMillis !== null &&
    nowMillis - startedAtMillis < IMADAKE_CARD_TRANSLATION_GENERATING_STALE_MS
  ) {
    return "generating";
  }

  if (entry.sourceHash === sourceHash) {
    const errorCount =
      Number(entry.errorCount) || 0;

    if (
      entry.status === "failed" ||
      errorCount >= IMADAKE_CARD_TRANSLATION_MAX_FAILURES
    ) {
      return "failed";
    }

    const retryAfterMillis =
      toMillis(entry.retryAfter);

    if (
      entry.status !== "generating" &&
      retryAfterMillis !== null &&
      retryAfterMillis > nowMillis
    ) {
      return "waiting";
    }
  }

  return "claimable";
}

function buildFailureEntry(
  sourceHash,
  errorCount,
  nowMillis,
  reason
) {
  if (errorCount >= IMADAKE_CARD_TRANSLATION_MAX_FAILURES) {
    return {
      status: "failed",
      sourceHash: sourceHash,
      errorCount: errorCount,
      lastErrorAt: Timestamp.fromMillis(nowMillis),
      lastErrorReason: reason,
      retryAfter: null
    };
  }

  const delay =
    IMADAKE_CARD_TRANSLATION_RETRY_DELAYS_MS[
      Math.min(errorCount, IMADAKE_CARD_TRANSLATION_RETRY_DELAYS_MS.length) - 1
    ];

  return {
    status: "error",
    sourceHash: sourceHash,
    errorCount: errorCount,
    lastErrorAt: Timestamp.fromMillis(nowMillis),
    lastErrorReason: reason,
    retryAfter: Timestamp.fromMillis(nowMillis + delay)
  };
}

// 投稿1件の生成権とその日の新規翻訳枠を、1つのトランザクションでまとめて確保する。
async function claimImadakeCardTranslation(
  database,
  postId,
  language,
  nowMillis,
  claimId
) {
  const postRef =
    database
      .collection(IMADAKE_POSTS_COLLECTION)
      .doc(postId);

  const dayKey =
    computeImadakeTranslationDayKey(nowMillis);

  const budgetRef =
    database
      .collection(IMADAKE_CARD_TRANSLATION_BUDGETS_COLLECTION)
      .doc(dayKey);

  return database.runTransaction(
    async function(transaction) {
      const postSnapshot =
        await transaction.get(postRef);

      const budgetSnapshot =
        await transaction.get(budgetRef);

      const post =
        postSnapshot.exists
          ? postSnapshot.data() || {}
          : null;

      if (
        post === null ||
        !isPublishedAndUnexpired(post, nowMillis) ||
        post.sourceLanguage === language
      ) {
        return { outcome: "unavailable" };
      }

      const source =
        getImadakeCardSource(post);

      if (source.headline === "") {
        return { outcome: "unavailable" };
      }

      const sourceHash =
        computeImadakeCardSourceHash(source);

      const entry =
        readCardTranslationEntry(post, language);

      const state =
        decideImadakeCardTranslationState(
          entry,
          sourceHash,
          nowMillis
        );

      if (state === "ready") {
        return {
          outcome: "ready",
          headline: entry.headline,
          excerpt: entry.excerpt
        };
      }

      if (state !== "claimable") {
        return { outcome: state };
      }

      let errorCount =
        entry && entry.sourceHash === sourceHash
          ? Number(entry.errorCount) || 0
          : 0;

      // 60秒を過ぎた生成中(前回の翻訳が途中で止まった)は、失敗1回として数える。
      if (
        entry &&
        entry.status === "generating" &&
        entry.sourceHash === sourceHash
      ) {
        errorCount += 1;

        if (errorCount >= IMADAKE_CARD_TRANSLATION_MAX_FAILURES) {
          transaction.update(postRef, {
            [getCardTranslationFieldPath(language)]:
              buildFailureEntry(sourceHash, errorCount, nowMillis, "stale_generating")
          });

          return { outcome: "failed" };
        }
      }

      const budgetData =
        budgetSnapshot.exists
          ? budgetSnapshot.data() || {}
          : {};

      const usedCount =
        Number(budgetData.count) || 0;

      if (usedCount >= IMADAKE_CARD_TRANSLATION_DAILY_LIMIT) {
        return { outcome: "limited" };
      }

      transaction.set(
        budgetRef,
        {
          dayKey: dayKey,
          count: usedCount + 1,
          limit: IMADAKE_CARD_TRANSLATION_DAILY_LIMIT,
          updatedAt: Timestamp.fromMillis(nowMillis)
        },
        { merge: true }
      );

      transaction.update(postRef, {
        [getCardTranslationFieldPath(language)]: {
          status: "generating",
          sourceHash: sourceHash,
          claimId: claimId,
          generatingStartedAt: Timestamp.fromMillis(nowMillis),
          errorCount: errorCount,
          retryAfter: null
        }
      });

      return {
        outcome: "claimed",
        sourceHash: sourceHash,
        source: source,
        errorCount: errorCount
      };
    }
  );
}

// 自分の生成権のまま・公開中で期限内・原文が同じ時だけ結果を保存する。それ以外は捨てる。
async function saveImadakeCardTranslationResult(
  database,
  postId,
  language,
  claim,
  claimId,
  nowMillis,
  result
) {
  const postRef =
    database
      .collection(IMADAKE_POSTS_COLLECTION)
      .doc(postId);

  return database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(postRef);

      const post =
        snapshot.exists
          ? snapshot.data() || {}
          : null;

      const entry =
        readCardTranslationEntry(post, language);

      if (
        post === null ||
        !entry ||
        entry.status !== "generating" ||
        entry.claimId !== claimId
      ) {
        return { saved: false };
      }

      const stillValid =
        isPublishedAndUnexpired(post, nowMillis) &&
        computeImadakeCardSourceHash(getImadakeCardSource(post)) === claim.sourceHash;

      if (!stillValid) {
        // 公開終了・期限切れ・原文の変更：訳は保存しない(次回は新しい原文で判断する)。
        transaction.update(postRef, {
          [getCardTranslationFieldPath(language)]:
            buildFailureEntry(claim.sourceHash, claim.errorCount + 1, nowMillis, "source_changed_or_ended")
        });

        return { saved: false };
      }

      if (result.ok) {
        transaction.update(postRef, {
          [getCardTranslationFieldPath(language)]: {
            status: "ready",
            sourceHash: claim.sourceHash,
            headline: result.headline,
            excerpt: result.excerpt,
            model: IMADAKE_CARD_TRANSLATION_MODEL,
            generatedAt: Timestamp.fromMillis(nowMillis),
            usage: result.usage || null,
            estimatedCostUsd:
              typeof result.estimatedCostUsd === "number"
                ? result.estimatedCostUsd
                : null,
            errorCount: claim.errorCount,
            retryAfter: null
          }
        });

        return { saved: true };
      }

      transaction.update(postRef, {
        [getCardTranslationFieldPath(language)]:
          buildFailureEntry(claim.sourceHash, claim.errorCount + 1, nowMillis, result.reason || "error")
      });

      return { saved: false };
    }
  );
}

// 数字の並び(全角は半角に、桁区切りのカンマは外す)が原文と訳で同じかを確かめる。
// 価格・時間・数量の誤訳を防ぐため、一致しない訳は失敗として扱う。
export function extractImadakeDigitGroups(
  text
) {
  const normalized =
    String(text || "")
      .replace(/[０-９]/g, function(character) {
        return String.fromCharCode(character.charCodeAt(0) - 0xfee0);
      })
      .replace(/(\d)[,，](?=\d{3}(\D|$))/g, "$1");

  return (normalized.match(/\d+/g) || [])
    .map(function(group) {
      return String(Number(group));
    })
    .sort();
}

export function validateImadakeCardTranslation(
  source,
  translated
) {
  if (
    !translated ||
    typeof translated.headline !== "string" ||
    typeof translated.excerpt !== "string"
  ) {
    return { ok: false, reason: "shape" };
  }

  const headline =
    translated.headline.trim();

  const excerpt =
    translated.excerpt.trim();

  if (
    headline === "" ||
    headline.length > IMADAKE_CARD_TRANSLATED_HEADLINE_MAX_LENGTH ||
    excerpt.length > IMADAKE_CARD_TRANSLATED_EXCERPT_MAX_LENGTH ||
    (source.excerpt !== "" && excerpt === "")
  ) {
    return { ok: false, reason: "length" };
  }

  const sameDigits =
    JSON.stringify(extractImadakeDigitGroups(source.headline)) ===
      JSON.stringify(extractImadakeDigitGroups(headline)) &&
    JSON.stringify(extractImadakeDigitGroups(source.excerpt)) ===
      JSON.stringify(extractImadakeDigitGroups(excerpt));

  if (!sameDigits) {
    return { ok: false, reason: "digits_mismatch" };
  }

  return { ok: true, headline: headline, excerpt: excerpt };
}

function buildImadakeCardTranslationPrompt(
  items,
  targetLanguage
) {
  return {
    systemInstruction:
      "You translate short shop posts for travelers. Translate each item's \"headline\" and \"excerpt\" from Japanese into natural " +
      (targetLanguage === "en" ? "English" : targetLanguage) +
      ". Rules: keep every number, price, currency symbol, time, date, quantity and unit exactly as written (same digits); " +
      "keep shop names, place names, product names, phone numbers and URLs unchanged; do not add, remove or guess information; " +
      "the excerpt may be cut off mid-sentence, so translate the fragment as it is without completing it. " +
      "Return only JSON: {\"items\":[{\"id\":\"...\",\"headline\":\"...\",\"excerpt\":\"...\"}]} with the same ids in the same order.",
    userContent:
      JSON.stringify({
        items: items.map(function(item) {
          return {
            id: item.id,
            headline: item.headline,
            excerpt: item.excerpt
          };
        })
      })
  };
}

// OpenAIでまとめて翻訳する(サーバー側だけ)。件数・idの対応が合わない時は例外。
export async function callOpenAiImadakeCardTranslation(
  items,
  targetLanguage
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY が設定されていません。");
  }

  const prompt =
    buildImadakeCardTranslationPrompt(items, targetLanguage);

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(function() {
      controller.abort();
    }, IMADAKE_CARD_TRANSLATION_TIMEOUT_MS);

  let response;

  try {
    response =
      await fetch(
        IMADAKE_CARD_TRANSLATION_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
          },
          body: JSON.stringify({
            model: IMADAKE_CARD_TRANSLATION_MODEL,
            max_completion_tokens: IMADAKE_CARD_TRANSLATION_MAX_OUTPUT_TOKENS,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: prompt.systemInstruction },
              { role: "user", content: prompt.userContent }
            ]
          }),
          signal: controller.signal
        }
      );
  } catch (fetchError) {
    throw new Error(
      fetchError && fetchError.name === "AbortError"
        ? "今だけ投稿の翻訳がタイムアウトしました。"
        : "今だけ投稿の翻訳呼び出しに失敗しました。"
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error("OpenAI APIがエラーを返しました。status=" + response.status);
  }

  const responseData =
    await response.json();

  // 出力上限で途中までになった応答は、JSONとして読めても使わない(不完全な訳を表示しない)。
  const finishReason =
    responseData &&
    Array.isArray(responseData.choices) &&
    responseData.choices[0]
      ? responseData.choices[0].finish_reason
      : "";

  if (finishReason === "length") {
    const truncatedError =
      new Error("今だけ投稿の翻訳が出力上限で途中までになりました。");

    truncatedError.reason =
      "output_truncated";

    throw truncatedError;
  }

  const messageContent =
    responseData &&
    Array.isArray(responseData.choices) &&
    responseData.choices[0] &&
    responseData.choices[0].message &&
    typeof responseData.choices[0].message.content === "string"
      ? responseData.choices[0].message.content
      : "";

  const parsed =
    JSON.parse(messageContent);

  const outputItems =
    parsed && Array.isArray(parsed.items)
      ? parsed.items
      : [];

  if (outputItems.length !== items.length) {
    throw new Error("今だけ投稿の翻訳結果の件数が一致しませんでした。");
  }

  const byId =
    {};

  outputItems.forEach(function(outputItem) {
    if (outputItem && typeof outputItem.id === "string") {
      byId[outputItem.id] = {
        headline: outputItem.headline,
        excerpt: outputItem.excerpt
      };
    }
  });

  const usage =
    responseData.usage
      ? {
          inputTokens: Number(responseData.usage.prompt_tokens) || 0,
          outputTokens: Number(responseData.usage.completion_tokens) || 0
        }
      : null;

  return {
    byId: byId,
    usage: usage,
    estimatedCostUsd:
      usage
        ? (usage.inputTokens * IMADAKE_CARD_TRANSLATION_INPUT_COST_PER_MILLION_USD +
            usage.outputTokens * IMADAKE_CARD_TRANSLATION_OUTPUT_COST_PER_MILLION_USD) / 1000000
        : null
  };
}

function readRequestedPostIds(
  value
) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > IMADAKE_CARD_TRANSLATION_MAX_POSTS_PER_REQUEST
  ) {
    return null;
  }

  const postIds =
    [];

  for (const postId of value) {
    if (
      typeof postId !== "string" ||
      !IMADAKE_POST_ID_PATTERN.test(postId)
    ) {
      return null;
    }

    if (!postIds.includes(postId)) {
      postIds.push(postId);
    }
  }

  return postIds;
}

// mode: imadakeCardTranslationGet (POST、匿名認証必須)
//   入力 { postIds: [最大10件], language: "en" }
//   出力 { success, translations: { postId: { headline, excerpt } }, pending: [postId], limited }
//   pendingは別のリクエストが翻訳中(少し後にもう一度頼めば届く可能性がある)。
//   limitedは今日の新規翻訳の上限に達した(原文のまま表示を続ける)。
export async function handleImadakeCardTranslationGet(
  request,
  response,
  deps
) {
  response.setHeader("Cache-Control", "no-store");

  try {
    const idToken =
      deps.readBearerToken(request);

    if (idToken === "") {
      return response.status(401).json({
        success: false,
        message: "認証情報がありません。"
      });
    }

    const app =
      deps.getFirebaseAdminApp();

    try {
      await deps.verifyIdToken(app, idToken);
    } catch (verifyError) {
      return response.status(401).json({
        success: false,
        message: "認証情報が正しくありません。"
      });
    }

    const requestBody =
      deps.readRequestBody(request) || {};

    const language =
      typeof requestBody.language === "string"
        ? requestBody.language
        : "";

    const postIds =
      readRequestedPostIds(requestBody.postIds);

    if (
      !IMADAKE_CARD_TRANSLATION_LANGUAGES.includes(language) ||
      postIds === null
    ) {
      return response.status(400).json({
        success: false,
        message: "入力内容を確認してください。"
      });
    }

    const database =
      deps.getFirestore(app);

    const allowed =
      await deps.claimRateLimit(
        database,
        IMADAKE_CARD_TRANSLATION_RATE_LIMITS_COLLECTION,
        deps.hashClientIpAddress(request),
        IMADAKE_CARD_TRANSLATION_RATE_LIMIT_COOLDOWN_MS
      );

    if (!allowed) {
      return response.status(429).json({
        success: false,
        rateLimited: true,
        message: "少し時間をおいてから、もう一度お試しください。"
      });
    }

    const now =
      typeof deps.now === "function"
        ? deps.now
        : Date.now;

    const newClaimId =
      typeof deps.randomId === "function"
        ? deps.randomId
        : randomUUID;

    const translations =
      {};

    const pending =
      [];

    let limited =
      false;

    const claimedItems =
      [];

    // 生成権と1日の枠は1件ずつ確保する(同じ日の枠のドキュメントを共有するため)。
    for (const postId of postIds) {
      const claimId =
        newClaimId();

      let claim;

      try {
        claim =
          await claimImadakeCardTranslation(
            database,
            postId,
            language,
            now(),
            claimId
          );
      } catch (claimError) {
        console.error("今だけ投稿の翻訳：生成権の確保に失敗：", claimError);
        continue;
      }

      if (claim.outcome === "ready") {
        translations[postId] = {
          headline: claim.headline,
          excerpt: claim.excerpt
        };
      } else if (claim.outcome === "generating") {
        pending.push(postId);
      } else if (claim.outcome === "limited") {
        limited = true;
      } else if (claim.outcome === "claimed") {
        claimedItems.push({
          postId: postId,
          claimId: claimId,
          claim: claim
        });
      }
    }

    if (claimedItems.length > 0) {
      let batchResult =
        null;

      let batchErrorReason =
        "";

      try {
        batchResult =
          await deps.translateCards(
            claimedItems.map(function(item) {
              return {
                id: item.postId,
                headline: item.claim.source.headline,
                excerpt: item.claim.source.excerpt
              };
            }),
            language
          );
      } catch (translationError) {
        console.error("今だけ投稿の翻訳：生成エラー：", translationError);
        batchErrorReason =
          translationError && translationError.reason === "output_truncated"
            ? "output_truncated"
            : "translation_error";
      }

      for (const item of claimedItems) {
        let result;

        if (batchResult === null) {
          result = { ok: false, reason: batchErrorReason };
        } else {
          const validation =
            validateImadakeCardTranslation(
              item.claim.source,
              batchResult.byId[item.postId]
            );

          result =
            validation.ok
              ? {
                  ok: true,
                  headline: validation.headline,
                  excerpt: validation.excerpt,
                  usage: batchResult.usage,
                  estimatedCostUsd:
                    typeof batchResult.estimatedCostUsd === "number"
                      ? batchResult.estimatedCostUsd / claimedItems.length
                      : null
                }
              : validation;
        }

        try {
          const saved =
            await saveImadakeCardTranslationResult(
              database,
              item.postId,
              language,
              item.claim,
              item.claimId,
              now(),
              result
            );

          if (saved.saved && result.ok) {
            translations[item.postId] = {
              headline: result.headline,
              excerpt: result.excerpt
            };
          }
        } catch (saveError) {
          console.error("今だけ投稿の翻訳：結果の保存に失敗：", saveError);
        }
      }
    }

    return response.status(200).json({
      success: true,
      translations: translations,
      pending: pending,
      limited: limited
    });
  } catch (error) {
    console.error("今だけ投稿の翻訳に失敗しました：", error);

    return response.status(500).json({
      success: false,
      message: "翻訳を取得できませんでした。"
    });
  }
}
