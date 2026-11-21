// ==========================================================================
// 店主の店舗カード(正式店舗)の紹介文の英語自動翻訳(2026-11-07 代表承認 G案)
// ==========================================================================
// TOPの店舗カード・詳細は紹介文の原文をすぐ表示し、ここで作った訳が届いたら紹介文だけを
// 差し替える。店名・住所・営業時間・電話・URL・有料の内容(custom)は翻訳しない。
// POST mode=storeProfileTranslationGet から呼ばれる。原文(storeProfiles.description)は変えない。
//
// 対象：旅行者向けの一覧(publicStoreProfiles)と同じ判定で公開中の店舗だけ
//   (readPublicStoreProfileForShare。下書き・非公開・契約なし・停止・退会は訳さず、有無も返さない)。
//
// 保存先(書き込みはこのファイルの翻訳専用処理だけ。ブラウザからは読めない＝Firestore Rulesで拒否)
//   storeProfiles/{storeId}.translations.{language}.description   店舗ごとの訳と状態
//   storeProfileTranslationBudgets/{YYYY-MM-DD}                   サービス全体の1日の新規翻訳数(日本時間)
//   storeProfileTranslationRateLimits/{ipHash}                    閲覧者ごとの連打制限(既存claimRateLimit)
//   店主の内容の保存は merge のため、訳の欄は消えず、原文が変わったかは原文ハッシュで判断する。
//
// 費用の暴走防止(今だけ投稿の翻訳 imadake-translation.js と同じ仕組み・同じ状態判定を再利用)
//   ・新規翻訳はサービス全体で1日50件まで。店舗の生成権と同じトランザクションでその日の枠を
//     1件確保する(同時の要求でも超えない)。枠は生成権を取った時点で消費し、失敗でも返さない。
//   ・1リクエスト最大10店舗、そのうち新しく訳すのは最大5店舗(残りは pending＝少し後に頼み直し)。
//   ・同じ原文の失敗は3回まで(待ち時間：10分、1時間)。60秒を過ぎた生成中も失敗1回。
//   ・出力トークンの上限。上限で途中までになった応答・数字が原文と違う訳は保存しない。
//   ・匿名認証必須、閲覧者ごとの連打制限。訳済み(原文ハッシュ一致)の配信は上限に含めない。
// このモジュールは api/_lib 配下のため Vercel Function にはならない(Functions本数は増えない)。
// ==========================================================================

import {
  Timestamp
} from "firebase-admin/firestore";

import {
  createHash,
  randomUUID
} from "node:crypto";

import {
  PUBLIC_STORE_ID_PREFIX
} from "./store-profile.js";

import {
  computeImadakeTranslationDayKey,
  decideImadakeCardTranslationState,
  buildFailureEntry,
  extractImadakeDigitGroups
} from "./imadake-translation.js";

export const STORE_PROFILE_TRANSLATION_LANGUAGES =
  ["en", "zh-TW"];

export const STORE_PROFILE_TRANSLATION_MAX_STORES_PER_REQUEST =
  10;

export const STORE_PROFILE_TRANSLATION_MAX_NEW_PER_REQUEST =
  5;

export const STORE_PROFILE_TRANSLATION_DAILY_LIMIT =
  50;

export const STORE_PROFILE_TRANSLATION_BUDGETS_COLLECTION =
  "storeProfileTranslationBudgets";

export const STORE_PROFILE_TRANSLATION_RATE_LIMITS_COLLECTION =
  "storeProfileTranslationRateLimits";

export const STORE_PROFILE_TRANSLATION_RATE_LIMIT_COOLDOWN_MS =
  5 * 1000;

const STORE_PROFILES_COLLECTION =
  "storeProfiles";

// 既存の店舗・今だけ投稿の翻訳と同じ安価なモデル(定数は独立させる)。
const STORE_PROFILE_TRANSLATION_MODEL =
  "gpt-4o-mini";

const STORE_PROFILE_TRANSLATION_ENDPOINT =
  "https://api.openai.com/v1/chat/completions";

const STORE_PROFILE_TRANSLATION_TIMEOUT_MS =
  25 * 1000;

// 1回の呼び出しの出力トークン上限(1回最大5店舗。紹介文は最大1,000字で、英訳は1件
// 多くても千トークン前後)。上限で途中までになった応答は失敗として扱い、保存しない。
export const STORE_PROFILE_TRANSLATION_MAX_OUTPUT_TOKENS =
  6000;

// OpenAI公式の標準単価(既存の店舗翻訳と同じモデル・同じ単価)。
const STORE_PROFILE_TRANSLATION_INPUT_COST_PER_MILLION_USD =
  0.15;

const STORE_PROFILE_TRANSLATION_OUTPUT_COST_PER_MILLION_USD =
  0.6;

// 訳の長さの上限(原文は最大1,000字。英語で長くなる分の余裕)。
export const STORE_PROFILE_TRANSLATED_DESCRIPTION_MAX_LENGTH =
  3000;

// メニュー一式の翻訳(2026-11-21追加、仕様は store-menu-translation-spec-20261121.md)。
// 1回の呼び出しで1店舗分のメニュー(最大20項目)をまとめて訳すため、紹介文より大きな出力上限。
export const STORE_MENU_TRANSLATION_MAX_OUTPUT_TOKENS =
  8000;

// 訳した料理名の長さの上限(原文は最大40字。補足が付く分の余裕)。
export const STORE_MENU_TRANSLATED_NAME_MAX_LENGTH =
  160;

// メニュー項目の最大数(店舗カスタマイズの上限と同じ)。
const STORE_MENU_TRANSLATION_MAX_ITEMS =
  20;

const STORE_CUSTOM_PROFILES_COLLECTION_FOR_MENU =
  "storeCustomProfiles";

const STORE_ID_PATTERN =
  /^[A-Za-z0-9_-]{1,100}$/;

function getDescriptionTranslationFieldPath(
  language
) {
  return "translations." + language + ".description";
}

function getMenuTranslationFieldPath(
  language
) {
  return "translations." + language + ".menuItems";
}

function readMenuTranslationEntry(
  profile,
  language
) {
  return profile &&
    profile.translations &&
    profile.translations[language] &&
    typeof profile.translations[language].menuItems === "object"
    ? profile.translations[language].menuItems
    : null;
}

// メニュー項目の原文ハッシュ(名前と説明の組)。項目ごとに訳と対応づけるため、
// 並べ替え・追加・削除があっても古い訳が別の項目に付かない。
export function computeStoreMenuItemSourceHash(
  name,
  description
) {
  return computeStoreProfileDescriptionHash(
    (typeof name === "string" ? name : "") +
      "\n" +
      (typeof description === "string" ? description : "")
  );
}

// メニュー一式のハッシュ(項目のハッシュを並べたもの)。生成権の判定に使う。
export function computeStoreMenuSetHash(
  items
) {
  return computeStoreProfileDescriptionHash(
    items
      .map(function(item) {
        return computeStoreMenuItemSourceHash(item.name, item.description);
      })
      .join("\n")
  );
}

// 翻訳に渡すメニュー項目の形にそろえる(名前が空の項目は除く)。
export function normalizeStoreMenuItemsForTranslation(
  rawItems
) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .slice(0, STORE_MENU_TRANSLATION_MAX_ITEMS)
    .map(function(item) {
      return {
        name:
          item && typeof item.name === "string" ? item.name.trim() : "",
        description:
          item && typeof item.description === "string" ? item.description.trim() : ""
      };
    })
    .filter(function(item) {
      return item.name !== "";
    });
}

function readDescriptionTranslationEntry(
  profile,
  language
) {
  return profile &&
    profile.translations &&
    profile.translations[language] &&
    typeof profile.translations[language].description === "object"
    ? profile.translations[language].description
    : null;
}

// 旅行者向けの一覧と同じ取り出し方(buildPublicStoreProfile の description)。
function readProfileDescription(
  profile
) {
  return profile && typeof profile.description === "string"
    ? profile.description.trim()
    : "";
}

export function computeStoreProfileDescriptionHash(
  description
) {
  return createHash("sha256")
    .update(description, "utf8")
    .digest("hex");
}

// 店舗の原文の言語(未設定は日本語)。表示言語と同じなら訳さない。
function readSourceLanguage(
  profile
) {
  return profile && typeof profile.sourceLanguage === "string" && profile.sourceLanguage !== ""
    ? profile.sourceLanguage
    : "ja";
}

// 店舗1件の生成権とその日の新規翻訳枠を、1つのトランザクションでまとめて確保する。
// expectedHash は公開の確認(readPublicStoreProfileForShare)の時点の原文ハッシュ。
// 確認の後に原文が変わった・非公開になった時は訳さない。
async function claimStoreProfileTranslation(
  database,
  storeId,
  language,
  expectedHash,
  nowMillis,
  claimId,
  allowNewClaim
) {
  const profileRef =
    database
      .collection(STORE_PROFILES_COLLECTION)
      .doc(storeId);

  const dayKey =
    computeImadakeTranslationDayKey(nowMillis);

  const budgetRef =
    database
      .collection(STORE_PROFILE_TRANSLATION_BUDGETS_COLLECTION)
      .doc(dayKey);

  return database.runTransaction(
    async function(transaction) {
      const profileSnapshot =
        await transaction.get(profileRef);

      const budgetSnapshot =
        await transaction.get(budgetRef);

      const profile =
        profileSnapshot.exists
          ? profileSnapshot.data() || {}
          : null;

      if (
        profile === null ||
        profile.status !== "published" ||
        readSourceLanguage(profile) === language
      ) {
        return { outcome: "unavailable" };
      }

      const description =
        readProfileDescription(profile);

      if (description === "") {
        return { outcome: "unavailable" };
      }

      const sourceHash =
        computeStoreProfileDescriptionHash(description);

      if (sourceHash !== expectedHash) {
        return { outcome: "unavailable" };
      }

      const entry =
        readDescriptionTranslationEntry(profile, language);

      const state =
        decideImadakeCardTranslationState(
          entry,
          sourceHash,
          nowMillis
        );

      if (state === "ready") {
        return {
          outcome: "ready",
          description: entry.description
        };
      }

      if (state !== "claimable") {
        return { outcome: state };
      }

      // 1リクエストで新しく訳す店舗数の上限に達した：今回は訳さず、少し後に頼み直してもらう。
      if (!allowNewClaim) {
        return { outcome: "deferred" };
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

        const staleFailure =
          buildFailureEntry(sourceHash, errorCount, nowMillis, "stale_generating");

        if (staleFailure.status === "failed") {
          transaction.update(profileRef, {
            [getDescriptionTranslationFieldPath(language)]: staleFailure
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

      if (usedCount >= STORE_PROFILE_TRANSLATION_DAILY_LIMIT) {
        return { outcome: "limited" };
      }

      transaction.set(
        budgetRef,
        {
          dayKey: dayKey,
          count: usedCount + 1,
          limit: STORE_PROFILE_TRANSLATION_DAILY_LIMIT,
          updatedAt: Timestamp.fromMillis(nowMillis)
        },
        { merge: true }
      );

      transaction.update(profileRef, {
        [getDescriptionTranslationFieldPath(language)]: {
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
        description: description,
        errorCount: errorCount
      };
    }
  );
}

// 自分の生成権のまま・公開中・原文が同じ時だけ結果を保存する。それ以外は捨てる。
async function saveStoreProfileTranslationResult(
  database,
  storeId,
  language,
  claim,
  claimId,
  nowMillis,
  result
) {
  const profileRef =
    database
      .collection(STORE_PROFILES_COLLECTION)
      .doc(storeId);

  return database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(profileRef);

      const profile =
        snapshot.exists
          ? snapshot.data() || {}
          : null;

      const entry =
        readDescriptionTranslationEntry(profile, language);

      if (
        profile === null ||
        !entry ||
        entry.status !== "generating" ||
        entry.claimId !== claimId
      ) {
        return { saved: false };
      }

      const stillValid =
        profile.status === "published" &&
        computeStoreProfileDescriptionHash(readProfileDescription(profile)) === claim.sourceHash;

      if (!stillValid) {
        // 非公開・原文の変更：訳は保存しない(次回は新しい原文で判断する)。
        transaction.update(profileRef, {
          [getDescriptionTranslationFieldPath(language)]:
            buildFailureEntry(claim.sourceHash, claim.errorCount + 1, nowMillis, "source_changed_or_unpublished")
        });

        return { saved: false };
      }

      if (result.ok) {
        transaction.update(profileRef, {
          [getDescriptionTranslationFieldPath(language)]: {
            status: "ready",
            sourceHash: claim.sourceHash,
            description: result.description,
            model: STORE_PROFILE_TRANSLATION_MODEL,
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

      transaction.update(profileRef, {
        [getDescriptionTranslationFieldPath(language)]:
          buildFailureEntry(claim.sourceHash, claim.errorCount + 1, nowMillis, result.reason || "error")
      });

      return { saved: false };
    }
  );
}

// メニュー一式の生成権とその日の新規翻訳枠を確保する(紹介文と同じ枠・同じ数え方で、
// 1店舗×1言語のメニュー一式を1件とする)。原文(項目の一覧)は公開用の読み取り結果を渡す。
async function claimStoreMenuTranslation(
  database,
  storeId,
  language,
  menuItems,
  nowMillis,
  claimId,
  allowNewClaim
) {
  const profileRef =
    database
      .collection(STORE_PROFILES_COLLECTION)
      .doc(storeId);

  const dayKey =
    computeImadakeTranslationDayKey(nowMillis);

  const budgetRef =
    database
      .collection(STORE_PROFILE_TRANSLATION_BUDGETS_COLLECTION)
      .doc(dayKey);

  const setHash =
    computeStoreMenuSetHash(menuItems);

  return database.runTransaction(
    async function(transaction) {
      const profileSnapshot =
        await transaction.get(profileRef);

      const budgetSnapshot =
        await transaction.get(budgetRef);

      const profile =
        profileSnapshot.exists
          ? profileSnapshot.data() || {}
          : null;

      if (
        profile === null ||
        profile.status !== "published"
      ) {
        return { outcome: "unavailable" };
      }

      const entry =
        readMenuTranslationEntry(profile, language);

      const state =
        decideImadakeCardTranslationState(
          entry,
          setHash,
          nowMillis
        );

      if (state === "ready") {
        return {
          outcome: "ready",
          items: Array.isArray(entry.items) ? entry.items : []
        };
      }

      if (state !== "claimable") {
        return { outcome: state };
      }

      if (!allowNewClaim) {
        return { outcome: "deferred" };
      }

      let errorCount =
        entry && entry.sourceHash === setHash
          ? Number(entry.errorCount) || 0
          : 0;

      if (
        entry &&
        entry.status === "generating" &&
        entry.sourceHash === setHash
      ) {
        errorCount += 1;

        const staleFailure =
          buildFailureEntry(setHash, errorCount, nowMillis, "stale_generating");

        if (staleFailure.status === "failed") {
          transaction.update(profileRef, {
            [getMenuTranslationFieldPath(language)]: staleFailure
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

      if (usedCount >= STORE_PROFILE_TRANSLATION_DAILY_LIMIT) {
        return { outcome: "limited" };
      }

      transaction.set(
        budgetRef,
        {
          dayKey: dayKey,
          count: usedCount + 1,
          limit: STORE_PROFILE_TRANSLATION_DAILY_LIMIT,
          updatedAt: Timestamp.fromMillis(nowMillis)
        },
        { merge: true }
      );

      transaction.update(profileRef, {
        [getMenuTranslationFieldPath(language)]: {
          status: "generating",
          sourceHash: setHash,
          claimId: claimId,
          generatingStartedAt: Timestamp.fromMillis(nowMillis),
          errorCount: errorCount,
          retryAfter: null
        }
      });

      return {
        outcome: "claimed",
        sourceHash: setHash,
        errorCount: errorCount
      };
    }
  );
}

// 自分の生成権のまま・公開中・メニューの原文が同じ時だけ結果を保存する。
// 原文の確認はカスタマイズ文書(storeCustomProfiles/{storeId})を同じトランザクションで読む。
async function saveStoreMenuTranslationResult(
  database,
  storeId,
  language,
  claim,
  claimId,
  nowMillis,
  result
) {
  const profileRef =
    database
      .collection(STORE_PROFILES_COLLECTION)
      .doc(storeId);

  const customRef =
    database
      .collection(STORE_CUSTOM_PROFILES_COLLECTION_FOR_MENU)
      .doc(storeId);

  return database.runTransaction(
    async function(transaction) {
      const snapshot =
        await transaction.get(profileRef);

      const customSnapshot =
        await transaction.get(customRef);

      const profile =
        snapshot.exists
          ? snapshot.data() || {}
          : null;

      const entry =
        readMenuTranslationEntry(profile, language);

      if (
        profile === null ||
        !entry ||
        entry.status !== "generating" ||
        entry.claimId !== claimId
      ) {
        return { saved: false };
      }

      const currentItems =
        normalizeStoreMenuItemsForTranslation(
          customSnapshot.exists
            ? (customSnapshot.data() || {}).menuItems
            : null
        );

      const stillValid =
        profile.status === "published" &&
        currentItems.length > 0 &&
        computeStoreMenuSetHash(currentItems) === claim.sourceHash;

      if (!stillValid) {
        transaction.update(profileRef, {
          [getMenuTranslationFieldPath(language)]:
            buildFailureEntry(claim.sourceHash, claim.errorCount + 1, nowMillis, "source_changed_or_unpublished")
        });

        return { saved: false };
      }

      if (result.ok) {
        transaction.update(profileRef, {
          [getMenuTranslationFieldPath(language)]: {
            status: "ready",
            sourceHash: claim.sourceHash,
            items: result.items,
            model: STORE_PROFILE_TRANSLATION_MODEL,
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

      transaction.update(profileRef, {
        [getMenuTranslationFieldPath(language)]:
          buildFailureEntry(claim.sourceHash, claim.errorCount + 1, nowMillis, result.reason || "error")
      });

      return { saved: false };
    }
  );
}

// メニューの訳の検証。件数・空・長すぎ・数字の並び(価格・数量)が原文と違う訳は失敗として扱う。
export function validateStoreMenuTranslation(
  sourceItems,
  translatedItems
) {
  if (
    !Array.isArray(translatedItems) ||
    translatedItems.length !== sourceItems.length
  ) {
    return { ok: false, reason: "shape" };
  }

  const items = [];

  for (let index = 0; index < sourceItems.length; index += 1) {
    const source = sourceItems[index];
    const translated = translatedItems[index] || {};

    const name =
      typeof translated.name === "string" ? translated.name.trim() : "";

    const description =
      typeof translated.description === "string" ? translated.description.trim() : "";

    if (
      name === "" ||
      name.length > STORE_MENU_TRANSLATED_NAME_MAX_LENGTH ||
      description.length > STORE_PROFILE_TRANSLATED_DESCRIPTION_MAX_LENGTH
    ) {
      return { ok: false, reason: "length" };
    }

    if (source.description !== "" && description === "") {
      return { ok: false, reason: "shape" };
    }

    if (
      JSON.stringify(extractImadakeDigitGroups(source.name)) !==
        JSON.stringify(extractImadakeDigitGroups(name)) ||
      JSON.stringify(extractImadakeDigitGroups(source.description)) !==
        JSON.stringify(extractImadakeDigitGroups(description))
    ) {
      return { ok: false, reason: "digits_mismatch" };
    }

    items.push({
      sourceHash: computeStoreMenuItemSourceHash(source.name, source.description),
      sourceName: source.name,
      sourceDescription: source.description,
      name: name,
      description: description
    });
  }

  return { ok: true, items: items };
}

function buildStoreMenuTranslationPrompt(
  items,
  targetLanguage
) {
  return {
    systemInstruction:
      "You translate restaurant menu items written by shop owners for travelers. Translate each item's \"name\" and \"description\" from Japanese into natural " +
      (targetLanguage === "en" ? "English" : targetLanguage === "zh-TW" ? "Traditional Chinese (Taiwan)" : targetLanguage) +
      ". Rules: for dish names, prefer a translation or transliteration that tells the traveler what the dish is; " +
      "keep every number, price, currency symbol, quantity and unit exactly as written (same digits); " +
      "do not add ingredients, cooking methods or information that are not in the source; do not remove information; keep it concise. " +
      "Return only JSON: {\"items\":[{\"id\":\"...\",\"name\":\"...\",\"description\":\"...\"}]} with the same ids in the same order.",
    userContent:
      JSON.stringify({
        items: items.map(function(item, index) {
          return {
            id: String(index),
            name: item.name,
            description: item.description
          };
        })
      })
  };
}

// OpenAIで1店舗分のメニューをまとめて翻訳する(サーバー側だけ)。件数が合わない時は例外。
export async function callOpenAiStoreMenuTranslation(
  items,
  targetLanguage
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY が設定されていません。");
  }

  const prompt =
    buildStoreMenuTranslationPrompt(items, targetLanguage);

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(function() {
      controller.abort();
    }, STORE_PROFILE_TRANSLATION_TIMEOUT_MS);

  let response;

  try {
    response =
      await fetch(
        STORE_PROFILE_TRANSLATION_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
          },
          body: JSON.stringify({
            model: STORE_PROFILE_TRANSLATION_MODEL,
            max_completion_tokens: STORE_MENU_TRANSLATION_MAX_OUTPUT_TOKENS,
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
        ? "店舗メニューの翻訳がタイムアウトしました。"
        : "店舗メニューの翻訳呼び出しに失敗しました。"
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error("OpenAI APIがエラーを返しました。status=" + response.status);
  }

  const responseData =
    await response.json();

  const finishReason =
    responseData &&
    Array.isArray(responseData.choices) &&
    responseData.choices[0]
      ? responseData.choices[0].finish_reason
      : "";

  if (finishReason === "length") {
    const truncatedError =
      new Error("店舗メニューの翻訳が出力上限で途中までになりました。");

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
    throw new Error("店舗メニューの翻訳結果の件数が一致しませんでした。");
  }

  const translatedItems =
    outputItems.map(function(outputItem) {
      return {
        name:
          outputItem && typeof outputItem.name === "string" ? outputItem.name : "",
        description:
          outputItem && typeof outputItem.description === "string" ? outputItem.description : ""
      };
    });

  const usage =
    responseData.usage
      ? {
          inputTokens: Number(responseData.usage.prompt_tokens) || 0,
          outputTokens: Number(responseData.usage.completion_tokens) || 0
        }
      : null;

  return {
    items: translatedItems,
    usage: usage,
    estimatedCostUsd:
      usage
        ? (usage.inputTokens * STORE_PROFILE_TRANSLATION_INPUT_COST_PER_MILLION_USD +
            usage.outputTokens * STORE_PROFILE_TRANSLATION_OUTPUT_COST_PER_MILLION_USD) / 1000000
        : null
  };
}

// 訳の検証。空・長すぎ・数字の並び(価格・時間・数量)が原文と違う訳は失敗として扱う。
export function validateStoreProfileDescriptionTranslation(
  sourceDescription,
  translatedDescription
) {
  if (typeof translatedDescription !== "string") {
    return { ok: false, reason: "shape" };
  }

  const description =
    translatedDescription.trim();

  if (
    description === "" ||
    description.length > STORE_PROFILE_TRANSLATED_DESCRIPTION_MAX_LENGTH
  ) {
    return { ok: false, reason: "length" };
  }

  if (
    JSON.stringify(extractImadakeDigitGroups(sourceDescription)) !==
      JSON.stringify(extractImadakeDigitGroups(description))
  ) {
    return { ok: false, reason: "digits_mismatch" };
  }

  return { ok: true, description: description };
}

function buildStoreProfileTranslationPrompt(
  items,
  targetLanguage
) {
  return {
    systemInstruction:
      "You translate shop introductions written by shop owners for travelers. Translate each item's \"description\" from Japanese into natural " +
      (targetLanguage === "en" ? "English" : targetLanguage === "zh-TW" ? "Traditional Chinese (Taiwan)" : targetLanguage) +
      ". Rules: keep every number, price, currency symbol, time, date, quantity and unit exactly as written (same digits); " +
      "keep shop names, place names, product names, phone numbers and URLs unchanged; do not add, remove, exaggerate or guess information; " +
      "keep the line breaks. " +
      "Return only JSON: {\"items\":[{\"id\":\"...\",\"description\":\"...\"}]} with the same ids in the same order.",
    userContent:
      JSON.stringify({
        items: items.map(function(item) {
          return {
            id: item.id,
            description: item.description
          };
        })
      })
  };
}

// OpenAIでまとめて翻訳する(サーバー側だけ)。件数が合わない時は例外。
export async function callOpenAiStoreProfileTranslation(
  items,
  targetLanguage
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY が設定されていません。");
  }

  const prompt =
    buildStoreProfileTranslationPrompt(items, targetLanguage);

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(function() {
      controller.abort();
    }, STORE_PROFILE_TRANSLATION_TIMEOUT_MS);

  let response;

  try {
    response =
      await fetch(
        STORE_PROFILE_TRANSLATION_ENDPOINT,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
          },
          body: JSON.stringify({
            model: STORE_PROFILE_TRANSLATION_MODEL,
            max_completion_tokens: STORE_PROFILE_TRANSLATION_MAX_OUTPUT_TOKENS,
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
        ? "店舗の紹介文の翻訳がタイムアウトしました。"
        : "店舗の紹介文の翻訳呼び出しに失敗しました。"
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
      new Error("店舗の紹介文の翻訳が出力上限で途中までになりました。");

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
    throw new Error("店舗の紹介文の翻訳結果の件数が一致しませんでした。");
  }

  const byId =
    {};

  outputItems.forEach(function(outputItem) {
    if (outputItem && typeof outputItem.id === "string") {
      byId[outputItem.id] = outputItem.description;
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
        ? (usage.inputTokens * STORE_PROFILE_TRANSLATION_INPUT_COST_PER_MILLION_USD +
            usage.outputTokens * STORE_PROFILE_TRANSLATION_OUTPUT_COST_PER_MILLION_USD) / 1000000
        : null
  };
}

// 画面の店舗ID(sp_{storeId})を受け取り、storeIdの一覧にする。形が違えば null(400)。
function readRequestedStoreIds(
  value
) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > STORE_PROFILE_TRANSLATION_MAX_STORES_PER_REQUEST
  ) {
    return null;
  }

  const storeIds =
    [];

  for (const publicId of value) {
    if (
      typeof publicId !== "string" ||
      publicId.indexOf(PUBLIC_STORE_ID_PREFIX) !== 0
    ) {
      return null;
    }

    const storeId =
      publicId.slice(PUBLIC_STORE_ID_PREFIX.length);

    if (!STORE_ID_PATTERN.test(storeId)) {
      return null;
    }

    if (!storeIds.includes(storeId)) {
      storeIds.push(storeId);
    }
  }

  return storeIds;
}

// mode: storeProfileTranslationGet (POST、匿名認証必須)
//   入力 { storeIds: ["sp_..."(最大10件)], language: "en" }
//   出力 { success, translations: { "sp_...": description }, pending: ["sp_..."], limited }
//   pendingは別のリクエストが翻訳中、または今回の新規翻訳の上限で後回しにした店舗
//   (少し後にもう一度頼めば届く可能性がある)。limitedは今日の新規翻訳の上限に達した。
//   公開中でない店舗・訳せない店舗は、どこにも入れない(店舗の有無・状態を返さない)。
export async function handleStoreProfileTranslationGet(
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

    const storeIds =
      readRequestedStoreIds(requestBody.storeIds);

    if (
      !STORE_PROFILE_TRANSLATION_LANGUAGES.includes(language) ||
      storeIds === null
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
        STORE_PROFILE_TRANSLATION_RATE_LIMITS_COLLECTION,
        deps.hashClientIpAddress(request),
        STORE_PROFILE_TRANSLATION_RATE_LIMIT_COOLDOWN_MS
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
    for (const storeId of storeIds) {
      const publicId =
        PUBLIC_STORE_ID_PREFIX + storeId;

      let publicStore;

      try {
        publicStore =
          await deps.readPublicStore(database, storeId);
      } catch (readError) {
        console.error("店舗の紹介文の翻訳：公開状態の確認に失敗：", readError && readError.message);
        continue;
      }

      if (
        !publicStore ||
        typeof publicStore.description !== "string" ||
        publicStore.description === ""
      ) {
        continue;
      }

      const claimId =
        newClaimId();

      let claim;

      try {
        claim =
          await claimStoreProfileTranslation(
            database,
            storeId,
            language,
            computeStoreProfileDescriptionHash(publicStore.description),
            now(),
            claimId,
            claimedItems.length < STORE_PROFILE_TRANSLATION_MAX_NEW_PER_REQUEST
          );
      } catch (claimError) {
        console.error("店舗の紹介文の翻訳：生成権の確保に失敗：", claimError && claimError.message);
        continue;
      }

      if (claim.outcome === "ready") {
        translations[publicId] = claim.description;
      } else if (
        claim.outcome === "generating" ||
        claim.outcome === "deferred"
      ) {
        pending.push(publicId);
      } else if (claim.outcome === "limited") {
        limited = true;
      } else if (claim.outcome === "claimed") {
        claimedItems.push({
          storeId: storeId,
          publicId: publicId,
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
          await deps.translateDescriptions(
            claimedItems.map(function(item) {
              return {
                id: item.publicId,
                description: item.claim.description
              };
            }),
            language
          );
      } catch (translationError) {
        console.error("店舗の紹介文の翻訳：生成エラー：", translationError && translationError.message);
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
            validateStoreProfileDescriptionTranslation(
              item.claim.description,
              batchResult.byId[item.publicId]
            );

          result =
            validation.ok
              ? {
                  ok: true,
                  description: validation.description,
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
            await saveStoreProfileTranslationResult(
              database,
              item.storeId,
              language,
              item.claim,
              item.claimId,
              now(),
              result
            );

          if (saved.saved && result.ok) {
            translations[item.publicId] = result.description;
          }
        } catch (saveError) {
          console.error("店舗の紹介文の翻訳：結果の保存に失敗：", saveError && saveError.message);
        }
      }
    }

    // メニュー一式の翻訳(2026-11-21追加)。紹介文と同じ要求で、同じ上限を共用する。
    // 公開メニューの読み取り手段が無い環境(試験など)では、メニューは扱わない。
    const menuTranslations =
      {};

    const menuPending =
      [];

    if (typeof deps.readPublicMenuItems === "function") {
      const translateMenuItems =
        typeof deps.translateMenuItems === "function"
          ? deps.translateMenuItems
          : callOpenAiStoreMenuTranslation;

      let newClaimsUsed =
        claimedItems.length;

      const claimedMenuItems =
        [];

      for (const storeId of storeIds) {
        const publicId =
          PUBLIC_STORE_ID_PREFIX + storeId;

        let menuItems;

        try {
          menuItems =
            normalizeStoreMenuItemsForTranslation(
              await deps.readPublicMenuItems(
                database,
                storeId,
                now()
              )
            );
        } catch (readError) {
          console.error("店舗メニューの翻訳：公開メニューの確認に失敗：", readError && readError.message);
          continue;
        }

        if (menuItems.length === 0) {
          continue;
        }

        const claimId =
          newClaimId();

        let claim;

        try {
          claim =
            await claimStoreMenuTranslation(
              database,
              storeId,
              language,
              menuItems,
              now(),
              claimId,
              newClaimsUsed < STORE_PROFILE_TRANSLATION_MAX_NEW_PER_REQUEST
            );
        } catch (claimError) {
          console.error("店舗メニューの翻訳：生成権の確保に失敗：", claimError && claimError.message);
          continue;
        }

        if (claim.outcome === "ready") {
          menuTranslations[publicId] = claim.items;
        } else if (
          claim.outcome === "generating" ||
          claim.outcome === "deferred"
        ) {
          menuPending.push(publicId);
        } else if (claim.outcome === "limited") {
          limited = true;
        } else if (claim.outcome === "claimed") {
          claimedMenuItems.push({
            storeId: storeId,
            publicId: publicId,
            claimId: claimId,
            claim: claim,
            menuItems: menuItems
          });

          newClaimsUsed += 1;
        }
      }

      for (const item of claimedMenuItems) {
        let result;

        try {
          const translated =
            await translateMenuItems(
              item.menuItems,
              language
            );

          const validation =
            validateStoreMenuTranslation(
              item.menuItems,
              translated && translated.items
            );

          result =
            validation.ok
              ? {
                  ok: true,
                  items: validation.items,
                  usage: translated.usage,
                  estimatedCostUsd:
                    typeof translated.estimatedCostUsd === "number"
                      ? translated.estimatedCostUsd
                      : null
                }
              : validation;
        } catch (translationError) {
          console.error("店舗メニューの翻訳：生成エラー：", translationError && translationError.message);
          result = {
            ok: false,
            reason:
              translationError && translationError.reason === "output_truncated"
                ? "output_truncated"
                : "translation_error"
          };
        }

        try {
          const saved =
            await saveStoreMenuTranslationResult(
              database,
              item.storeId,
              language,
              item.claim,
              item.claimId,
              now(),
              result
            );

          if (saved.saved && result.ok) {
            menuTranslations[item.publicId] = result.items;
          }
        } catch (saveError) {
          console.error("店舗メニューの翻訳：結果の保存に失敗：", saveError && saveError.message);
        }
      }
    }

    return response.status(200).json({
      success: true,
      translations: translations,
      pending: pending,
      limited: limited,
      menuTranslations: menuTranslations,
      menuPending: menuPending
    });
  } catch (error) {
    console.error("店舗の紹介文の翻訳に失敗しました：", error && error.message);

    return response.status(500).json({
      success: false,
      message: "翻訳を取得できませんでした。"
    });
  }
}
