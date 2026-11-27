#!/usr/bin/env node
// dotagents をプロジェクトのリポジトリーに置く CLI。対話はしない。
//
//   npx @hiroiku/dotagents@latest sync [<プロジェクトのパス>] [--force]
//   npx @hiroiku/dotagents@latest remove [<プロジェクトのパス>]
//
// 置く中身と手順は project.mjs が持つ。ここは引数を読み、結果を利用者に示すだけにする。

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPOSITORY, remove, StopError, sync, VERSION } from './project.mjs';

const USAGE = `使い方: npx @hiroiku/dotagents@latest <コマンド> [<プロジェクトのパス>] [--force]

コマンド:
  sync     dotagents をプロジェクトのリポジトリーに置きます。置いてあれば、このバージョン(${VERSION})に置き直します。
  remove   置いたファイルと、設定ファイルと .gitattributes の dotagents の項目を消します。.agents/dotagents.jsonc は、sync が作ったままなら消し、
           項目を書いてあれば $schema の行だけを外して残します。

プロジェクトのパスを省くと、今のディレクトリーに置きます。パスは、git のリポジトリーのルートを指定します。

オプション:
  --force    sync で、dotagents が置いたファイルが手で書き換えられていても、上書きします。
  --help     この説明を表示します。
  --version  バージョンを表示します。
`;

const EDIT_KIND = {
  変更: '書き換えられています',
  削除: '消されています',
  追加: 'dotagents が置いていないファイルです',
  既存: 'dotagents が置くファイルと同じ名前の、別のファイルがあります',
};

function changeLines(changes) {
  if (!changes.length) return [];
  return [`変わったファイル(${changes.length} 件):`, ...changes.map((change) => `  ${change.action}  ${change.rel}`)];
}

// 外した古い参照。変わったファイルの一覧とは別に示す。
function oldLines(old) {
  if (!old.length) return [];
  return ['', `古い参照を外しました。GitHub の ${REPOSITORY} から入れる参照で、リポジトリーに置いたものと両方が有効になるためです(remove では元に戻しません):`, ...old.flatMap(({ rel, items }) => items.map((item) => `  ${rel}: ${item}`))];
}

// 設定ファイルの decisions は非推奨。AGENTS.md か ARCHITECTURE.md に貼れる形で示す。どちらも書き換えない。
function decisionsLines(decisions) {
  if (!decisions.length) return [];
  const bullet = (text) => `- ${text.trim().split(/\r?\n/).join('\n  ')}`;
  return [
    '',
    '設定ファイル(dotagents.jsonc)の decisions は非推奨です。9.x のあいだは読み込みますが、10.0.0 で読まれなくなります。プロジェクトの決めごとは、作業の手順なら AGENTS.md に、技術の選定、構成、配置、不変条件なら ARCHITECTURE.md に書いてください。',
    '次の内容を、AGENTS.md か ARCHITECTURE.md に、中身に合わせて移し、移したら decisions を消してください。AGENTS.md と ARCHITECTURE.md は書き換えていません。',
    '',
    '## 決定事項',
    '',
    ...decisions.map(bullet),
  ];
}

function syncReport({ root, from, to, changes, old, decisions }) {
  if (!changes.length) return [`dotagents ${to} は ${root} に置かれていて、変えるファイルはありません。`, ...decisionsLines(decisions)];
  const head = from === null ? `dotagents ${to} を ${root} に置きました。` : from === to ? `dotagents ${to} を ${root} に置き直しました。` : `dotagents を ${from} から ${to} に置き直しました(${root})。`;
  return [
    head,
    '',
    ...changeLines(changes),
    ...oldLines(old),
    '',
    '次の手順:',
    '- 変わったファイルをコミットし、PR にしてください。',
    '- Codex を使う人は、取り込んだあとに Codex で /hooks を開き、dotagents の hook を承認し直す必要があります。承認するまで、Codex では dotagents の hook が動きません。',
    ...decisionsLines(decisions),
  ];
}

function removeReport({ root, from, changes, left }) {
  const lines = [changes.length ? `dotagents${from ? ` ${from}` : ''} を ${root} から外しました。` : `${root} には、外す dotagents のファイルと項目がありません。`];
  if (changes.length) lines.push('', ...changeLines(changes));
  if (left.length) lines.push('', 'dotagents が置いていないファイルは、消さずに残しました:', ...left.map((rel) => `  ${rel}`));
  if (changes.length) {
    if (fs.existsSync(path.join(root, '.agents', 'dotagents.jsonc'))) lines.push('', '.agents/dotagents.jsonc は残しています。要らなければ削除してください。');
    lines.push('', '変わったファイルをコミットし、PR にしてください。');
  }
  return lines;
}

export function main(argv, { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const flags = argv.filter((arg) => arg.startsWith('-'));
  const [command, target, ...extra] = argv.filter((arg) => !arg.startsWith('-'));
  const print = (stream, lines) => stream.write(`${lines.join('\n')}\n`);
  if (flags.includes('--help') || flags.includes('-h')) {
    print(out, [USAGE.trimEnd()]);
    return 0;
  }
  if (flags.includes('--version')) {
    print(out, [VERSION]);
    return 0;
  }
  const unknown = flags.filter((flag) => flag !== '--force');
  if (!['sync', 'remove'].includes(command) || extra.length || unknown.length || (command === 'remove' && flags.includes('--force'))) {
    const reason = unknown.length ? `知らないオプションです: ${unknown.join(' ')}` : command ? (extra.length ? `パスは 1 つだけ指定できます: ${[target, ...extra].join(' ')}` : `知らないコマンドです: ${command}`) : 'コマンドを指定してください。';
    print(err, [reason, '', USAGE.trimEnd()]);
    return 2;
  }
  const dir = path.resolve(cwd, target ?? '.');
  try {
    if (command === 'sync') print(out, syncReport(sync(dir, { force: flags.includes('--force') })));
    else print(out, removeReport(remove(dir)));
    return 0;
  } catch (error) {
    if (!(error instanceof StopError)) throw error;
    print(err, [error.message, ...error.details.map((edit) => `  ${edit.rel}(${EDIT_KIND[edit.kind]})`)]);
    return 1;
  }
}

// npx は node_modules/.bin のリンクから起こすので、リンクをたどった先で比べる。
const invoked = (() => {
  try {
    return pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return null;
  }
})();
if (import.meta.url === invoked) process.exitCode = main(process.argv.slice(2));
