// dotagents の入口。引数を読み、init を呼び、終了コードを返す。画面、ファイル、claude の実行は差し込める。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { parseArgs, UsageError } from './args.mjs';
import { Failure, runInit } from './init.mjs';
import { terminal } from './term.mjs';
import { Cancelled } from './ui.mjs';
import { errorLines } from './view.mjs';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const USAGE = `使い方: dotagents init [オプション]

dotagents(Claude Code と Codex 向けのハーネス)を、プロジェクトに設定します。
初回のセットアップにも、設定の変更にも使えます。plugin への参照だけを書き込み、ハーネス本体はリポジトリーにコピーしません。
質問に答えた場合は、書き込む前にファイルの一覧を表示して、確認します(--yes を付けた場合と、すべての質問をオプションで指定した場合は、確認しません)。
git リポジトリーの中で実行してください(サブディレクトリーからでも、リポジトリーのルートに書き込みます)。コミットはしません。

オプション(指定した質問は表示しません。指定しない質問は、端末なら質問し、端末でなければ既定値で答えます):
  --yes, -y                      質問せず、指定のない項目をすべて既定値にします
  --hosts claude,codex           対象のツール(none で設定しない)
  --git trunk|release-branches   git のスタイル(none で使わない)
  --architecture layered         アーキテクチャのスタイル(none で使わない)
  --scope project|user           plugin のインストール範囲(none でインストールしない)
  --check 段階=コマンド          チェックの段階(edit、commit、push、release)ごとのコマンド。空にするときは push=
                                 例: --check push="npm run check"

既定値は、現在の .agents/dotagents.json の値です。ない場合は、PATH とプロジェクトの内容から検出した値になります。
端末ではなく、--yes もオプションの指定もないときは、質問せずにエラーで終了します。

  --help, -h     このヘルプを表示します
  --version, -v  バージョンを表示します`;

// claude を実行して、終わりを待つ。出力は取っておき(スピナーの画面を崩さない)、失敗の理由に使う。
const realRun = (file, args, { cwd }) =>
  new Promise((resolve) => {
    let output = '';
    const child = spawn(file, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => resolve({ status: null, output: error.message }));
    child.on('close', (status) => resolve({ status, output }));
  });

export async function main(argv, io = {}) {
  const context = {
    cwd: process.cwd(),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    run: realRun,
    ...io,
    version: VERSION,
  };
  const { stdout, stderr } = context;
  context.term = terminal(stdout, context.env);
  try {
    const options = parseArgs(argv);
    if (options.version) {
      stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (options.help) {
      stdout.write(`${USAGE}\n`);
      return 0;
    }
    if (options.command === null) throw new UsageError('コマンドを指定してください。\n\n' + USAGE);
    if (options.command !== 'init') throw new UsageError(`${options.command} は不明なコマンドです。使えるのは init だけです。\n\n${USAGE}`);
    return await runInit(options, context);
  } catch (error) {
    const { term } = context;
    if (error instanceof Cancelled) stderr.write(term.fancy ? errorLines(term, '中断しました。何も書き込んでいません。') : '\n中断しました。何も書き込んでいません。\n');
    else if (error instanceof UsageError || error instanceof Failure) stderr.write(errorLines(term, error.message));
    else stderr.write(`${errorLines(term, term.fancy ? error.message : `dotagents: ${error.message}`)}${context.env.DEBUG ? `${error.stack}\n` : ''}`);
    return 1;
  }
}
