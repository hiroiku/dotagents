// dotagents init。尋ね、書き、plugin を入れ、書いたものを見せる。コミットはしない。
//
// 順序が安全を作る。質問と、書き換えの組み立て(読めない設定を見つける)を先にすべて済ませ、そのあとで書く。
// 中断しても、読めない設定があっても、プロジェクトは変わらない。尋ねたときは、書くファイルを見せて、書いてよいかを確かめる。

import { buildPlan } from './changes.mjs';
import { specifies } from './args.mjs';
import { claudeInstalled, findings, git, onPath, repositoryRoot } from './detect.mjs';
import { ask, defaultsOf } from './questions.mjs';
import { PLUGIN_ID } from './target.mjs';
import { terminal } from './term.mjs';
import { createUi } from './ui.mjs';
import { createView, reasonOf } from './view.mjs';

export class Failure extends Error {
  name = 'Failure';
}

const installCommand = (scope) => ['plugin', 'install', PLUGIN_ID, '--scope', scope];
const shown = (scope) => `claude ${installCommand(scope).join(' ')}`;

const rowsOf = (summary) => [
  ...summary.created.map((path) => ({ kind: 'new', path })),
  ...summary.changed.map((path) => ({ kind: 'change', path })),
  ...summary.removed.map((path) => ({ kind: 'remove', path })),
];

// 次にすること。
function nextSteps(hosts) {
  const steps = [];
  if (hosts.includes('codex')) steps.push('Codex: プロジェクトを信頼し、/hooks で dotagents の hook を承認します。plugin の中身が変わるたびに、承認し直します。');
  if (hosts.includes('claude')) steps.push(`ほかの人は、各自 1 回 ${shown('project')} を実行します。設定で有効にしただけでは、対話のセッションの始めに読まれません。`);
  steps.push('配備や公開を守りたいときは、ホストの権限の設定に自分で書きます。dotagents は、それらを止めません。');
  steps.push('ARCHITECTURE.md は、エージェントに頼めます(setup のスキルが、architecture のスキルに沿って作ることを提案します)。');
  return steps;
}

export async function runInit(options, { cwd, env, stdin, stdout, stderr, run, version, term = terminal(stdout, env) }) {
  const root = repositoryRoot(cwd);
  if (!root) throw new Failure('git のリポジトリーの外では実行できない。プロジェクトのリポジトリーの中で実行する。');
  const attended = Boolean(stdin.isTTY && stdout.isTTY);
  if (!attended && !options.yes && !specifies(options)) {
    throw new Failure('端末ではないので、質問できない。--yes(すべて既定)か、質問の指定(--hosts、--git、--architecture、--scope、--check)を付ける。dotagents --help に一覧がある。');
  }

  const view = createView({ output: stdout, errput: stderr, term });
  const ui = attended && !options.yes ? createUi({ input: stdin, output: stdout, term }) : null;
  view.intro(version, ui ? 'このリポジトリーに入れる設定を決めます' : 'このリポジトリーに設定を入れます');
  const defaults = defaultsOf(root, env);
  view.found(findings(root, env));

  let answers;
  let built;
  let rows;
  try {
    answers = await ask({ options, defaults, ui });
    built = buildPlan(root, answers);
    rows = rowsOf(built.plan.summary());
    // 尋ねたときは、書く前に、書くファイルを見せて確かめる。質問なしの実行は、尋ねない。
    if (ui && ui.asked() > 0 && rows.length) {
      view.plan(rows);
      const yes = await ui.confirm({ message: '書き込みますか', description: '上のファイルを書き換えます。コミットはしません。', yes: 'ファイルを書き、plugin を入れます', no: '何も書かずに終わります' });
      if (!yes) {
        view.outro('何も書かずに終わりました。');
        return 0;
      }
    }
  } finally {
    ui?.close();
  }

  const { plan, notices } = built;
  plan.apply();
  view.written({ version, root, rows, stat: view.fancy || !rows.length ? null : git(root, 'diff', '--stat', '--', ...rows.map(({ path }) => path)) });

  // plugin を入れる。すでに入っていれば、もう一度入れない。claude が無ければ、コマンドを示すだけにする。
  let failed = false;
  let pending = null;
  let installed = false;
  if (answers.scope) {
    const command = shown(answers.scope);
    if (claudeInstalled(root, answers.scope, PLUGIN_ID, env)) view.info(`plugin は、この環境の Claude Code に入っています(${answers.scope})。`);
    else if (!onPath('claude', env)) pending = command;
    else {
      const result = await view.task({ running: `plugin を入れる: ${command}`, success: `plugin を入れました(${answers.scope})` }, async () => {
        const done = await run('claude', installCommand(answers.scope), { cwd: root });
        return { ok: done.status === 0, reason: reasonOf(done.output), failure: `${command} が失敗しました(終了コード ${done.status ?? '不明'})。書いた設定は残っています。自分で実行してください。` };
      });
      installed = result.ok;
      failed = !result.ok;
    }
  }

  view.notices(notices);
  if (pending) view.warn(`Claude Code の plugin は、claude が PATH に無かったので入れていません。自分で実行してください: ${pending}`);

  const changed = rows.length > 0;
  if (changed || installed || pending) {
    view.steps(nextSteps(answers.hosts));
    view.outro(failed ? '設定は書きましたが、plugin は入っていません。コミットはしていません。' : '入れ終わりました。コミットはしていません。', failed ? 'warn' : 'plain');
  } else view.outro('すでにそろっていました。何も書いていません。');
  return failed ? 1 : 0;
}
