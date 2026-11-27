// プロジェクトの `.agents/dotagents.jsonc`。プロジェクトが自分で書き、仕組み(hook)が読む。どの項目も省ける。
// コメント(`//`、`/* */`)と末尾のカンマを書ける(jsonc.mjs)。古い名前の `dotagents.json` は読まない。
//
//   protected  共有ブランチとして扱う名前。リモートのデフォルトブランチと main、master は、書かなくても含まれる。
//              `*` が使える。
//   delegated  確かめずに進めてよいと、プロジェクトが任せた種類。`種類` か `種類:対象`。
//   checks     チェックごとのコマンド(edit、commit、push、release)。エージェントのコンテキストにチェックのコマンドとして入る。
//              hook はチェックを実行しない。push と release に置いたコマンドは、ビルダーとレビュアーが実行するとブロックする。
//   allowAiAttribution  true と書くと、コミット、PR、issue、リリースに AI の関与を示す記述を書くコマンドを通す。書かなければブロックする。
//   decisions  非推奨。プロジェクトの決めごとは、作業の手順なら AGENTS.md に、技術の選定や構成なら ARCHITECTURE.md に書く。
//              9.x のあいだは、どのエージェントも読む。10.0.0 で読まなくなる。
//
// decisions のほかは、確認ルールを動かすか、hook が実行するコマンドを決める。書き換えは、それ自体を確かめる
// (guard.mjs の policy)。
//
// `style`(git と設計のスタイルの選択)は、もう読まない。残っていても、エラーにも、確認ルールの変更にもしない。
//
// 時間や数の上限は、ここに持たない。数値は決まりとして読まれ、状況に合わなくても守られる。上限が要るプロジェクトは、
// 理由と一緒に AGENTS.md に書く。

import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc.mjs';

export const DECLARATION = path.join('.agents', 'dotagents.jsonc');
// 読む項目。schema/dotagents.schema.json の項目と一致することを、テストが守る。`$schema` はエディターのための指定で、読まない。
export const KEYS = ['$schema', 'protected', 'delegated', 'checks', 'allowAiAttribution', 'decisions'];
export const CHECK_STAGES = ['edit', 'commit', 'push', 'release'];
const POLICY_KEYS = ['protected', 'delegated', 'checks', 'allowAiAttribution'];

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
