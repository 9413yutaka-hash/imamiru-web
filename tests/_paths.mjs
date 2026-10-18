// テストが使う場所(リポジトリ・このフォルダ・スクリーンショット)を、このファイルの位置から決める。
// どのPC・どの作業フォルダでも同じテストがそのまま動くようにするため、絶対パスは書かない。
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const toSlash = (p) => p.replace(/\\/g, "/");

export const TEST_DIR = toSlash(dirname(fileURLToPath(import.meta.url)));
export const REPO_ROOT = toSlash(resolve(TEST_DIR, ".."));
export const REPO_URL = pathToFileURL(REPO_ROOT).href.replace(/\/$/, "");

// スクリーンショットはリポジトリの外(OSの一時フォルダ)に出す。
export const SHOTS_DIR = toSlash(process.env.MACHINAU_TEST_SHOTS_DIR || join(tmpdir(), "machinau-test-shots"));
mkdirSync(SHOTS_DIR, { recursive: true });
