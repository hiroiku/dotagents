// dotagents init。尋ね、書き込み、plugin をインストールし、書き込んだものを見せる。コミットはしない。
//
// 順序が安全を作る。質問と、書き換えの組み立て(読めない設定を見つける)を先にすべて済ませ、そのあとで書く。
// 中断しても、読めない設定があっても、プロジェクトは変わらない。尋ねたときは、書くファイルを見せて、書いてよいかを確かめる。

import { buildPlan } from './changes.mjs';
import { specifies } from './args.mjs';
import { claudeInstalled, findings, git, onPath, repositoryRoot } from './detect.mjs';
import { ask, defaultsOf } from './questions.mjs';
import { DECLARATION, PLUGIN_ID } from './target.mjs';
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
const DECLARATION_NOTE = `${DECLARATION} は、このリポジトリーの dotagents の設定です。コミットして、チームで共有します。`;

function nextSteps(hosts) {
  const steps = [DECLARATION_NOTE];
  if (hosts.includes('codex')) steps.push('Codex: プロジェクトを信頼し、/hooks で dotagents の hook を承認します。plugin の内容が変わるたびに、承認し直します。');
  if (hosts.includes('claude')) steps.push(`チームのほかの人は、各自で ${shown('project')} を 1 回実行します。設定で有効にしただけでは、対話セッションの開始時に plugin が読み込まれません。`);
  steps.push('デプロイや公開を制限したいときは、Claude Code や Codex の権限設定に、自分で追加します。dotagents は、これらの操作を制限しません。');
  steps.push('ARCHITECTURE.md は、エージェントに作成を依頼できます(setup スキルが、architecture スキルに沿って作成することを提案します)。');
  return steps;
}

export async function runInit(options, { cwd, env, stdin, stdout, stderr, run, version, term = terminal(stdout, env) }) {
  const root = repositoryRoot(cwd);
  if (!root) throw new Failure('git リポジトリーの外では実行できません。プロジェクトのリポジトリーの中で実行してください。');
  const attended = Boolean(stdin.isTTY && stdout.isTTY);
  if (!attended && !options.yes && !specifies(options)) {
    throw new Failure('端末ではないため、質問できません。--yes(すべて既定値で実行)か、質問に対応するオプション(--hosts、--git、--architecture、--scope、--check)を指定してください。オプションの一覧は dotagents --help で確認できます。');
  }

  const view = createView({ output: stdout, errput: stderr, term });
  const ui = attended && !options.yes ? createUi({ input: stdin, output: stdout, term }) : null;
  view.intro(version, ui ? '質問に答えて、このリポジトリーに dotagents を設定します' : 'このリポジトリーに dotagents を設定します');
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
      const yes = await ui.confirm({
        message: '書き込みますか',
        description: `上のファイルを書き込みます。コミットはしません。\n${DECLARATION_NOTE}`,
        yes: answers.scope ? 'ファイルを書き込み、plugin をインストールします' : 'ファイルを書き込みます',
        no: '何も書き込まずに終了します',
      });
      if (!yes) {
        view.outro('何も書き込まずに終了しました。');
        return 0;
      }
    }
  } finally {
    ui?.close();
  }

  const { plan, notices } = built;
  plan.apply();
  view.written({ version, root, rows, stat: view.fancy || !rows.length ? null : git(root, 'diff', '--stat', '--', ...rows.map(({ path }) => path)) });

  // plugin をインストールする。すでにインストール済みなら、もう一度は実行しない。claude が無ければ、コマンドを示すだけにする。
  let failed = false;
  let pending = null;
  let installed = false;
  if (answers.scope) {
    const command = shown(answers.scope);
    if (claudeInstalled(root, answers.scope, PLUGIN_ID, env)) view.info(`plugin は、この環境の Claude Code にインストール済みです(${answers.scope})。`);
    else if (!onPath('claude', env)) pending = command;
    else {
      const result = await view.task({ running: `plugin をインストールしています: ${command}`, success: `plugin をインストールしました(${answers.scope})` }, async () => {
        const done = await run('claude', installCommand(answers.scope), { cwd: root });
        return { ok: done.status === 0, reason: reasonOf(done.output), failure: `${command} が失敗しました(終了コード ${done.status ?? '不明'})。書き込んだ設定は残っています。コマンドを手動で実行してください。` };
      });
      installed = result.ok;
      failed = !result.ok;
    }
  }

  view.notices(notices);
  if (pending) view.warn(`claude が PATH に見つからないため、Claude Code の plugin はインストールしていません。次のコマンドを手動で実行してください: ${pending}`);

  const changed = rows.length > 0;
  if (changed || installed || pending) {
    view.steps(nextSteps(answers.hosts));
    view.outro(failed ? '設定は書き込みましたが、plugin はインストールされていません。変更はコミットしていません。' : '設定が完了しました。変更はコミットしていません。', failed ? 'warn' : 'plain');
  } else view.outro('すでに設定済みです。何も書き込んでいません。');
  return failed ? 1 : 0;
}
