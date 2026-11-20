// プロジェクトの宣言。プロジェクトが自分で書き、仕組み(hook)が読む。どの項目も省ける。
//
//   protected  共有のブランチとして扱う名前。リモートのデフォルトブランチと main、master は、書かなくても含まれる。
//              `*` が使える。
//   outward    このプロジェクトで外へ届くコマンドの正規表現。
//   delegated  確かめずに進めてよいと、プロジェクトが任せた種類。`種類` か `種類:対象`。
//   checks     検査の段ごとのコマンド(edit、commit、push、release)。edit は編集のたびに hook が実行し、
//              `{file}` は編集したファイルに置き換わる。push と release に置いたコマンドは、作る役と確かめる役が
//              実行すると止まる。
//   decisions  どの役も読む、続いている決定。
//
// decisions のほかは、確かめる線を動かすか、hook が実行するコマンドを決める。書き換えは、それ自体を確かめる
// (guard.mjs の policy)。
//
// 時間や数の上限は、ここに持たない。数値は決まりとして読まれ、状況に合わなくても守られる。上限が要るプロジェクトは、
// 理由と一緒に decisions に書く。

import fs from 'node:fs';
import path from 'node:path';

export const DECLARATION = path.join('.agents', 'dotagents.json');
export const POLICY_KEYS = ['protected', 'outward', 'delegated', 'checks'];

export function parseDeclaration(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('宣言はオブジェクトで書く');
  return value;
}

// cwd から上へたどり、最初に見つかった宣言を読む。worktree の中では、その worktree の宣言が先に見つかる。
export function findDeclaration(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, DECLARATION);
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function readDeclaration(cwd) {
  const file = findDeclaration(cwd);
  if (!file) return { file: null, root: null, value: {} };
  const root = path.dirname(path.dirname(file));
  try {
    return { file, root, value: parseDeclaration(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { file, root, value: {}, error: String(error.message ?? error) };
  }
}

export const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : []);

export const policyOf = (declaration) => JSON.stringify(POLICY_KEYS.map((key) => declaration?.[key] ?? null));
