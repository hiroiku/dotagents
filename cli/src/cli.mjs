// dotagents の入口。引数を読み、init を呼び、終了コードを返す。画面、ファイル、claude の実行は差し込める。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { parseArgs, UsageError } from './args.mjs';
import { Failure, runInit } from './init.mjs';
import { Cancelled } from './ui.mjs';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const USAGE = `使い方: dotagents init [指定]

dotagents(Claude Code と Codex 向けのハーネスの plugin)を、プロジェクトに入れる。
入れるときにも、設定を変えるときにも使う。参照だけを書き、ハーネスはリポジトリーに写さない。
git のリポジトリーの中で実行する(途中のディレクトリーからでも、根に書く)。コミットはしない。

指定(省いた質問は、端末なら尋ねる。端末でなければ既定で答える):
  --yes, -y                      尋ねず、指定の無い質問をすべて既定で答える
  --hosts claude,codex           入れるホスト(none で入れない)
  --git trunk|release-branches   git のスタイル(none で選ばない)
  --architecture layered         アーキテクチャのスタイル(none で選ばない)
  --scope project|user           plugin を入れる範囲(none で入れない)
  --check 段階=コマンド          チェックの段階(edit、commit、push、release)ごとの入口。空にするなら push=
                                 例: --check push="npm run check"

既定は、いまの .agents/dotagents.json の値。無ければ、PATH とプロジェクトから推した値。
端末でなく、--yes も指定も無いときは、尋ねずにエラーで終える。

  --help, -h     この説明
  --version, -v  版`;

const realRun = (file, args, { cwd }) => spawnSync(file, args, { cwd, stdio: 'inherit' });

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
    if (options.command === null) throw new UsageError('コマンドを指定する。\n\n' + USAGE);
    if (options.command !== 'init') throw new UsageError(`${options.command} というコマンドは無い。あるのは init だけである。\n\n${USAGE}`);
    return await runInit(options, context);
  } catch (error) {
    if (error instanceof Cancelled) stderr.write('\n中断した。何も書いていない。\n');
    else if (error instanceof UsageError || error instanceof Failure) stderr.write(`${error.message}\n`);
    else stderr.write(`dotagents: ${error.message}\n${context.env.DEBUG ? `${error.stack}\n` : ''}`);
    return 1;
  }
}
