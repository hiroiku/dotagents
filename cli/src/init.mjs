// dotagents init。尋ね、書き、plugin を入れ、書いたものを見せる。コミットはしない。
//
// 順序が安全を作る。質問と、書き換えの組み立て(読めない設定を見つける)を先にすべて済ませ、そのあとで書く。
// 中断しても、読めない設定があっても、プロジェクトは変わらない。

import { buildPlan } from './changes.mjs';
import { specifies } from './args.mjs';
import { claudeInstalled, git, onPath, repositoryRoot } from './detect.mjs';
import { ask, defaultsOf } from './questions.mjs';
import { PLUGIN_ID } from './target.mjs';
import { createUi } from './ui.mjs';

export class Failure extends Error {
  name = 'Failure';
}

const installCommand = (scope) => ['plugin', 'install', PLUGIN_ID, '--scope', scope];
const shown = (scope) => `claude ${installCommand(scope).join(' ')}`;

// 書き換えたファイルの一覧と、git diff --stat(追跡しているファイルの分)。
function report(root, summary, out) {
  const rows = [...summary.created.map((file) => ['新規', file]), ...summary.changed.map((file) => ['変更', file]), ...summary.removed.map((file) => ['削除', file])];
  out('書き換えたファイル:');
  for (const [kind, file] of rows) out(`  ${kind}  ${file}`);
  const stat = git(root, 'diff', '--stat', '--', ...rows.map(([, file]) => file));
  if (stat) out(`\n${stat}`);
}

export async function runInit(options, { cwd, env, stdin, stdout, stderr, run, version }) {
  const out = (text = '') => stdout.write(`${text}\n`);
  const root = repositoryRoot(cwd);
  if (!root) throw new Failure('git のリポジトリーの外では実行できない。プロジェクトのリポジトリーの中で実行する。');
  const terminal = Boolean(stdin.isTTY && stdout.isTTY);
  if (!terminal && !options.yes && !specifies(options)) {
    throw new Failure('端末ではないので、質問できない。--yes(すべて既定)か、質問の指定(--hosts、--git、--architecture、--scope、--check)を付ける。dotagents --help に一覧がある。');
  }

  const defaults = defaultsOf(root, env);
  const ui = terminal && !options.yes ? createUi({ input: stdin, output: stdout }) : null;
  let answers;
  try {
    answers = await ask({ options, defaults, ui });
  } finally {
    ui?.close();
  }

  const { plan, notices } = buildPlan(root, answers);
  const summary = plan.summary();
  const changed = summary.created.length + summary.changed.length + summary.removed.length > 0;
  plan.apply();

  // plugin を入れる。すでに入っていれば、もう一度入れない。claude が無ければ、コマンドを示すだけにする。
  let failed = false;
  let pending = null;
  let installed = false;
  if (answers.scope) {
    const command = shown(answers.scope);
    if (claudeInstalled(root, answers.scope, PLUGIN_ID, env)) out(`plugin は、この環境の Claude Code に入っている(${answers.scope})。`);
    else if (!onPath('claude', env)) pending = command;
    else {
      out(`\nplugin を入れる: ${command}`);
      const result = run('claude', installCommand(answers.scope), { cwd: root });
      installed = result.status === 0;
      if (!installed) {
        failed = true;
        stderr.write(`\n${command} が失敗した(終了コード ${result.status ?? '不明'})。書いた設定は残っている。自分で実行する。\n`);
      }
    }
  }

  if (changed) {
    out(`\ndotagents ${version} を ${root} に入れた。コミットはしていない。\n`);
    report(root, summary, out);
  } else out(`\ndotagents ${version}: ${root} の設定は、すでにそろっていて、変更はない。`);
  if (notices.length) {
    out('\n知らせ:');
    for (const notice of notices) out(`  - ${notice}`);
  }
  if (pending) out(`\nClaude Code の plugin は、claude が PATH に無かったので入れていない。自分で実行する: ${pending}`);

  if (changed || installed || pending) {
    out('\n次にすること:');
    if (answers.hosts.includes('codex')) out('  - Codex: プロジェクトを信頼し、/hooks で dotagents の hook を承認する。plugin の中身が変わるたびに承認し直す。');
    if (answers.hosts.includes('claude')) out(`  - ほかの人は、各自 1 回 ${shown('project')} を実行する。設定で有効にしただけでは、対話のセッションの始めに読まれない。`);
    out('  - 配備や公開を守りたいときは、ホストの権限の設定に自分で書く。dotagents は、それらを止めない。');
    out('  - ARCHITECTURE.md は、エージェントに頼める(setup のスキルが、architecture のスキルに沿って作ることを提案する)。');
  }
  return failed ? 1 : 0;
}
