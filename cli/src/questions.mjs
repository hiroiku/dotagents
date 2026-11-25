// init の質問。指定(引数)があれば尋ねず、無ければ、画面があれば尋ね、無ければ既定で答える。
// 既定は、いまの宣言があればその値、無ければプロジェクトから推した値である。

import { configuredHosts, currentDeclaration, detectChecks, detectGit, detectHosts } from './detect.mjs';
import { AXIS_NAMES, HOST_NAMES, HOSTS, PLUGIN_ID, STAGES, STYLES, TARGET } from './target.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 画面の文。質問ごとに、何を決めるか、答えがどこで使われるか、選ぶと何が起きるかを書く。
// ハーネスの今の振る舞い(plugin/styles、plugin/core、setup のスキル)と合わせる。
const HOST_HINTS = {
  claude: '.claude/settings.json に、plugin の参照を書きます',
  codex: '.codex/config.toml に、plugin の参照を書きます。プロジェクトを信頼し、/hooks で hook を承認すると、各人の操作なしで入ります',
};
const AXIS_TEXT = {
  git: {
    description: 'オーケストレーターが、どのブランチに統合し、PR をどこへ向けるかを決めます。守る共有のブランチも決まります。',
    hints: {
      trunk: '既定のブランチだけに統合し、版は tag で切ります。共有のブランチは、既定のブランチです',
      'release-branches': '開発は trunk と同じで、版の系列ごとに release/ のブランチを切ります。共有のブランチに release/ のブランチが加わります',
    },
    none: 'ブランチの決まりを入れません。共有のブランチは、既定のブランチと main、master だけになります',
  },
  architecture: {
    description: '設計の形を決めます。選んだ形の決まりは、すべてのエージェントの文脈に入ります。',
    hints: { layered: '6 つの層と import の向きの決まりを、すべてのエージェントに入れます。向きを落とす lint は、プロジェクトで用意します' },
    none: '設計の形の決まりは入れません',
  },
};
const NO_CHECK = '。ビルダーが重い検査を回しても止まらなくなります';
const STAGE_TEXT = {
  edit: {
    title: 'ファイルを編集するたびに回すチェック',
    description: 'ビルダーが、ファイルを編集するたびに回す軽いコマンドです。{file} は、編集したファイルに置き換えて回します。',
    example: 'biome check {file}',
    none: '編集のたびのチェックは入れません',
  },
  commit: {
    title: 'コミットの前に回すチェック',
    description: 'ビルダーが、コミットする前に回すコマンドです。変更したファイルと、それに依存するテストに絞った速いものを置きます。',
    example: 'npm run check:changed',
    none: 'コミットの前のチェックは入れません',
  },
  push: {
    title: 'push の前に回すチェック',
    description:
      'オーケストレーターが、バッチを取り込んだあと、バッチごとに 1 回回すコマンドです。型とビルドの全体など、重いものを置きます。ビルダーとレビュアーがそのまま実行すると止まります(引数を足して絞った実行は止まりません)。CI も同じ入口を呼ぶ形にします。',
    example: 'npm run check',
    none: `push の前のチェックは入れません${NO_CHECK}`,
  },
  release: {
    title: '版を切る前に回すチェック',
    description: 'オーケストレーターが、版を切る前に回すコマンドです。通しのテストや E2E を置きます。ビルダーとレビュアーがそのまま実行すると止まります(引数を足して絞った実行は止まりません)。',
    example: 'npm run e2e',
    none: `版を切る前のチェックは入れません${NO_CHECK}`,
  },
};
const SCOPE_CHOICES = [
  { value: 'project', label: 'このプロジェクトだけ', hint: '--scope project。このリポジトリーでだけ有効です。ほかの人は、各自 1 回、同じコマンドを実行します' },
  { value: 'user', label: '自分の全プロジェクト', hint: '--scope user。この環境の、どのリポジトリーでも有効です。ほかの人には効きません' },
  { value: null, label: '入れない', hint: 'claude plugin install を実行しません。設定には参照を書くので、自分や、ほかの人が各自実行すると働きます' },
];

// 質問ごとの既定。いまの宣言に style か checks があれば、それが既定になる(無い軸と段階は、選ばない、空)。
export function defaultsOf(root, env) {
  const declaration = currentDeclaration(root);
  const name = (axis) => (STYLES[axis].includes(declaration.style?.[axis]) ? declaration.style[axis] : null);
  const declared = isObject(declaration.checks)
    ? Object.fromEntries(STAGES.filter((stage) => typeof declaration.checks[stage] === 'string' && declaration.checks[stage]).map((stage) => [stage, declaration.checks[stage]]))
    : null;
  const configured = configuredHosts(root, PLUGIN_ID, TARGET.marketplace);
  const detected = declared ? null : detectChecks(root);
  return {
    hosts: configured.length ? configured : detectHosts(root, env),
    git: isObject(declaration.style) ? name('git') : detectGit(root),
    architecture: name('architecture'),
    checks: declared ?? detected.checks,
    // 段階ごとの、推した理由(画面で添える)。
    why: Object.fromEntries(Object.keys(declared ?? detected.checks).map((stage) => [stage, declared ? '今の dotagents.json の値です' : `${detected.from[stage]} から推しました`])),
    scope: 'project',
  };
}

const styleChoices = (axis) => [...STYLES[axis].map((value) => ({ value, label: value, hint: AXIS_TEXT[axis].hints[value] })), { value: null, label: '選ばない', hint: AXIS_TEXT[axis].none }];

async function askCheck(ui, stage, candidate, why) {
  const text = STAGE_TEXT[stage];
  const clear = { value: 'clear', label: '使わない', hint: text.none };
  const edit = { value: 'edit', label: '別のコマンドを入力する', hint: `例: ${text.example}` };
  const choice = await ui.select({
    message: `${text.title}  (${stage})`,
    description: text.description,
    choices: candidate ? [{ value: 'keep', label: `${candidate} を使う`, hint: why }, edit, clear] : [clear, edit],
  });
  if (choice === 'keep') return candidate;
  if (choice === 'clear') return '';
  return ui.text({ message: `${text.title}のコマンド  (${stage})`, description: `例: ${text.example}`, initial: candidate ?? '' });
}

// ui が null なら、尋ねずに既定で答える。
export async function ask({ options, defaults, ui }) {
  const hosts =
    options.hosts ??
    (ui
      ? await ui.multiselect({
          message: '入れるホスト',
          description: 'dotagents を使うホストを選びます(複数選べます)。選んだホストの設定ファイルに、plugin への参照を書きます。',
          choices: HOSTS.map((value) => ({ value, label: HOST_NAMES[value], hint: HOST_HINTS[value] })),
          initial: defaults.hosts,
        })
      : defaults.hosts);
  const answer = {};
  for (const axis of ['git', 'architecture']) {
    answer[axis] =
      options[axis] !== undefined
        ? options[axis]
        : ui
          ? await ui.select({ message: AXIS_NAMES[axis], description: AXIS_TEXT[axis].description, choices: styleChoices(axis), initial: defaults[axis], recommended: defaults[axis] ?? undefined })
          : defaults[axis];
  }
  const checks = {};
  for (const stage of STAGES) {
    checks[stage] = options.checks[stage] ?? (ui ? await askCheck(ui, stage, defaults.checks[stage], defaults.why[stage]) : (defaults.checks[stage] ?? ''));
  }
  const scope = !hosts.includes('claude')
    ? null
    : options.scope !== undefined
      ? options.scope
      : ui
        ? await ui.select({
            message: 'plugin を入れる範囲(Claude Code)',
            description: 'この環境の Claude Code に、claude plugin install で plugin を入れます。範囲は、plugin がどこで有効になるかを決めます。',
            choices: SCOPE_CHOICES,
            initial: defaults.scope,
            recommended: defaults.scope,
          })
        : defaults.scope;
  return { hosts, ...answer, checks, scope };
}
