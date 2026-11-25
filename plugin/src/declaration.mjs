// プロジェクトの `dotagents.json`。プロジェクトが自分で書き、仕組み(hook)が読む。どの項目も省ける。
//
//   protected  共有のブランチとして扱う名前。リモートのデフォルトブランチと main、master は、書かなくても含まれる。
//              `*` が使える。
//   delegated  確かめずに進めてよいと、プロジェクトが任せた種類。`種類` か `種類:対象`。
//   checks     チェックの段階ごとのコマンド(edit、commit、push、release)。エージェントの文脈に検査の入口として入る。
//              hook は検査を実行しない。push と release に置いたコマンドは、ビルダーとレビュアーが実行すると止まり、
//              どの段階のコマンドも、ビルダーとレビュアーがバックグラウンドで始めると止まる。
//   style      選んだスタイル。軸ごとに名前を 1 つ(git、architecture)。部品は styles/ にあり、git のスタイルによって、
//              共有のブランチの既定と、PR の base にしてよいブランチが決まる(style.mjs)。
//   decisions  どのエージェントも読む、続いている決定。
//
// decisions のほかは、確かめる線を動かすか、hook が実行するコマンドを決める。書き換えは、それ自体を確かめる
// (guard.mjs の policy)。
//
// 時間や数の上限は、ここに持たない。数値は決まりとして読まれ、状況に合わなくても守られる。上限が要るプロジェクトは、
// 理由と一緒に decisions に書く。

import fs from 'node:fs';
import path from 'node:path';

export const DECLARATION = path.join('.agents', 'dotagents.json');
const POLICY_KEYS = ['protected', 'delegated', 'checks', 'style'];

export function parseDeclaration(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('dotagents.json はオブジェクトで書く');
  return value;
}

// cwd から上へたどり、最初に見つかった `dotagents.json` を読む。worktree の中では、その worktree のものが先に見つかる。
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
