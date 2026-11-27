// この plugin の根。ほかのモジュールは、ここから中身の場所を導く。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// プロジェクトのリポジトリーに置いたときの、本体の場所(ルートからの相対パス)と、置いたファイルの記録。
// 記録は CLI(cli/)が書き、置いたファイルのハッシュと配ったバージョンを持つ。hook は、記録の有無だけを読む。
export const PLACED_DIR = '.agents/dotagents';
export const PLACED_RECORD = 'placed.json';

// この plugin が、プロジェクトのリポジトリーに置いたものかどうか。個人の環境にインストールした plugin には、記録が無い。
export const PLACED = fs.existsSync(path.join(PLUGIN_ROOT, PLACED_RECORD));

// cwd から上へたどり、dotagents を置いたリポジトリーの中かを返す。git のルート(.git がある場所)で止める。
export function placedProject(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(dir, PLACED_DIR, PLACED_RECORD))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || fs.existsSync(path.join(dir, '.git'))) return null;
    dir = parent;
  }
}
