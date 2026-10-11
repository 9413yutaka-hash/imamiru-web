// マチナウ｜旅の保存箱の保存処理(TOPのapp.jsと、読みもの全文ページの両方で使う)。
//
// 保存は端末のブラウザ内(localStorage "machinauSavedItems")だけで行い、通信はしない。
// 画面の描き方は各ページ側が持ち、このファイルは「読む・書く・保存/解除の切り替え」
// だけを持つ(TOPと全文ページで保存のルールが食い違わないようにするため)。
// 店舗のお気に入り(machinauFavoriteShopIds)とは別のキーで、互いに読み書きしない。
//
// 保存形式：{ version: 1, items: [{ type, id, savedAt, title }] }
//   type    "column"(読みもの)。将来の保存対象(掲示板等)は別のtypeで同じ配列に足す
//   id      読みものはslug
//   savedAt 保存した日時(ミリ秒)
//   title   保存時の記事タイトル(原文。表示は各ページが最新の記事一覧から作る。控えとして残すだけ)
// 同じtype＋idは1件だけ保存する。
(function () {
  const STORAGE_KEY =
    "machinauSavedItems";

  // 読めない保存データを上書きする前に、元の文字列をそのまま退避するキー。
  const BACKUP_STORAGE_KEY =
    "machinauSavedItemsBackup";

  const VERSION =
    1;

  const TYPE_COLUMN =
    "column";

  const MAX_PER_TYPE =
    100;

  const TITLE_MAX_LENGTH =
    120;

  function isValidItem(
    item
  ) {
    return (
      item !== null &&
      typeof item === "object" &&
      typeof item.type === "string" &&
      item.type !== "" &&
      typeof item.id === "string" &&
      item.id !== ""
    );
  }

  // 戻り値のstatus：
  //   "ok"          読めた(まだ何も保存していない場合も含む)
  //   "unavailable" localStorageが使えない
  //   "corrupt"     JSONが壊れている・形が違う(元の文字列はrawに残す)
  //   "newer"       この版より新しいversionの保存データ(この版では書き込まない)
  // needsBackupは、書き込むと元データの一部(読めない要素)が失われる時にtrue。
  function read() {
    let raw = null;

    try {
      raw =
        localStorage.getItem(
          STORAGE_KEY
        );
    } catch (error) {
      return {
        status: "unavailable",
        items: [],
        raw: null,
        needsBackup: false
      };
    }

    if (raw === null || raw === "") {
      return {
        status: "ok",
        items: [],
        raw: raw,
        needsBackup: false
      };
    }

    let parsed = null;

    try {
      parsed =
        JSON.parse(raw);
    } catch (error) {
      parsed = null;
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.version !== "number" ||
      !Array.isArray(parsed.items)
    ) {
      return {
        status: "corrupt",
        items: [],
        raw: raw,
        needsBackup: true
      };
    }

    // 1件ずつ形を確かめ、壊れた要素だけを読み飛ばす。同じtype＋idは先の1件だけ使う
    // (重複をまとめても失われる内容は無いため、退避の対象は壊れた要素だけ)。
    const seenKeys =
      new Set();

    let invalidItemCount =
      0;

    const items =
      parsed.items.filter(function (item) {
        if (!isValidItem(item)) {
          invalidItemCount += 1;
          return false;
        }

        const key =
          item.type + "\n" + item.id;

        if (seenKeys.has(key)) {
          return false;
        }

        seenKeys.add(key);
        return true;
      });

    return {
      status:
        parsed.version > VERSION
          ? "newer"
          : "ok",
      items: items,
      raw: raw,
      needsBackup:
        invalidItemCount > 0
    };
  }

  function write(
    items
  ) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: VERSION,
          items: items
        })
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  // 読めない保存データの元の文字列を退避する。前に退避したものは上書きせず、後ろに足す
  // (同じ内容が既に退避済みなら何もしない)。退避できなかった時はfalse(呼び出し側は保存しない)。
  function backupRaw(
    raw
  ) {
    try {
      const existingBackup =
        localStorage.getItem(
          BACKUP_STORAGE_KEY
        );

      if (
        typeof existingBackup === "string" &&
        existingBackup !== ""
      ) {
        if (existingBackup.includes(raw)) {
          return true;
        }

        localStorage.setItem(
          BACKUP_STORAGE_KEY,
          existingBackup + "\n" + raw
        );
        return true;
      }

      localStorage.setItem(
        BACKUP_STORAGE_KEY,
        raw
      );
      return true;
    } catch (error) {
      return false;
    }
  }

  function getItemsOfType(
    type
  ) {
    return read()
      .items
      .filter(function (item) {
        return item.type === type;
      });
  }

  function getIdSetOfType(
    type
  ) {
    return new Set(
      getItemsOfType(type).map(function (item) {
        return item.id;
      })
    );
  }

  // 保存していなければ保存、保存済みなら解除する。何も書き込めなかった時はok:falseと理由を返す
  // (呼び出し側は表示を変えずに案内を出す)。
  //   reason "failed" localStorageが使えない・新しいversion・退避や書き込みに失敗
  //   reason "limit"  そのtypeの保存がMAX_PER_TYPE件に達している
  function toggle(
    type,
    id,
    title
  ) {
    const readResult =
      read();

    if (
      readResult.status === "unavailable" ||
      readResult.status === "newer"
    ) {
      return { ok: false, reason: "failed" };
    }

    // 読めない保存データは消さず、上書きの前に元の文字列を退避する(退避できなければ保存しない)。
    if (
      readResult.needsBackup &&
      !backupRaw(readResult.raw)
    ) {
      return { ok: false, reason: "failed" };
    }

    const items =
      readResult.items;

    const isSaved =
      items.some(function (item) {
        return item.type === type && item.id === id;
      });

    let nextItems;

    if (isSaved) {
      nextItems =
        items.filter(function (item) {
          return !(item.type === type && item.id === id);
        });
    } else {
      const savedCount =
        items.filter(function (item) {
          return item.type === type;
        }).length;

      if (savedCount >= MAX_PER_TYPE) {
        return { ok: false, reason: "limit" };
      }

      nextItems =
        [
          {
            type: type,
            id: id,
            savedAt: Date.now(),
            title:
              typeof title === "string"
                ? title.slice(0, TITLE_MAX_LENGTH)
                : ""
          }
        ].concat(items);
    }

    if (!write(nextItems)) {
      return { ok: false, reason: "failed" };
    }

    return { ok: true, saved: !isSaved };
  }

  window.MachinauSavedItems = {
    STORAGE_KEY: STORAGE_KEY,
    TYPE_COLUMN: TYPE_COLUMN,
    MAX_PER_TYPE: MAX_PER_TYPE,
    read: read,
    getItemsOfType: getItemsOfType,
    getIdSetOfType: getIdSetOfType,
    toggle: toggle
  };
})();
