// プロジェクトの `.agents/dotagents.jsonc`。プロジェクトが自分で書き、仕組み(hook)が読む。どの項目も省ける。
// コメント(`//`、`/* */`)と末尾のカンマを書ける(jsonc.mjs)。古い名前の `dotagents.json` は読まない。
//
//   protected  共有ブランチとして扱う名前。リモートのデフォルトブランチと main、master は、書かなくても含まれる。
//              `*` が使える。
//   delegated  確かめずに進めてよいと、プロジェクトが任せた種類。`種類` か `種類:対象`。
//   checks     チェックごとのコマンド(edit、commit、push、release)。エージェントのコンテキストにチェックのコマンドとして入る。
//              hook はチェックを実行しない。push と release に置いたコマンドは、ビルダーとレビュアーが実行すると止まり、
//              どの段階のコマンドも、ビルダーとレビュアーがバックグラウンドで始めると止まる。
//   decisions  どのエージェントも読む、続いている決定。
//
// decisions のほかは、確認ルールを動かすか、hook が実行するコマンドを決める。書き換えは、それ自体を確かめる
// (guard.mjs の policy)。
//
// `style`(git と設計のスタイルの選択)は、もう読まない。残っていても、エラーにも、確認ルールの変更にもしない。
//
// 時間や数の上限は、ここに持たない。数値は決まりとして読まれ、状況に合わなくても守られる。上限が要るプロジェクトは、
// 理由と一緒に decisions に書く。

import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc.mjs';

export const DECLARATION = path.join('.agents', 'dotagents.jsonc');
// 読む項目。schema/dotagents.schema.json の項目と一致することを、テストが守る。`$schema` はエディターのための指定で、読まない。
export const KEYS = ['$schema', 'protected', 'delegated', 'checks', 'decisions'];
export const CHECK_STAGES = ['edit', 'commit', 'push', 'release'];
const POLICY_KEYS = ['protected', 'delegated', 'checks'];

// コメントと末尾のカンマを許す。読めなければ、行と列を添えて投げる。
export function parseDeclaration(text) {
  const value = parseJsonc(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('dotagents.jsonc は、全体を 1 つのオブジェクト({ … })で書いてください');
  return value;
}

// cwd から上へたどり、最初に見つかった `dotagents.jsonc` を読む。worktree の中では、その worktree のものが先に見つかる。
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
