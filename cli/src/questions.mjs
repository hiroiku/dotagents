// init の質問。オプションの指定があれば尋ねず、無ければ、画面があれば尋ね、無ければ既定で答える。
// 既定は、いまの宣言があればその値、無ければプロジェクトから検出した値である。

import { configuredHosts, currentDeclaration, detectChecks, detectGit, detectHosts } from './detect.mjs';
import { AXIS_NAMES, DECLARATION, HOST_NAMES, HOSTS, PLUGIN_ID, STAGES, STYLES, TARGET } from './target.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// 画面の文。質問ごとに、何を決めるか、答えがどこに保存されるか、選ぶと何が起きるかを書く。
// ハーネスの今の振る舞い(plugin/styles、plugin/core、setup のスキル)と合わせる。
const saved = (key) => `答えは ${DECLARATION} の ${key} に保存されます。`;
const HOST_HINTS = {
  claude: '.claude/settings.json に、plugin への参照を書き込みます',
  codex: '.codex/config.toml に、plugin への参照を書き込みます。プロジェクトを信頼し、/hooks で hook を承認すると、各自で操作しなくても有効になります',
};
const AXIS_TEXT = {
  git: {
    description: `オーケストレーターが、どのブランチに統合し、PR をどのブランチに向けるかを決めます。保護するブランチも、この選択で決まります。\n${saved('style.git')}`,
    hints: {
      trunk: '既定のブランチだけに統合し、リリースは tag で切ります。保護するブランチは、既定のブランチです',
      'release-branches': '統合先は trunk と同じです。バージョンの系列ごとに release/ ブランチを作ります。保護するブランチに、release/ で始まるブランチが加わります',
    },
    none: 'ブランチの決まりを設定しません。保護するブランチは、既定のブランチと main、master だけになります',
  },
  architecture: {
    description: `設計の形を決めます。選んだ形の決まりは、すべてのエージェントの文脈に追加されます。\n${saved('style.architecture')}`,
    hints: { layered: '6 つの層と import の向きの決まりを、すべてのエージェントに渡します。依存の向きの違反を検出する lint は、プロジェクトで用意してください' },
    none: '設計の形の決まりを設定しません',
  },
};
const NO_CHECK = 'ビルダーが重いチェックを実行しても、止められなくなります。';
const STAGE_TEXT = {
  edit: {
    title: 'ファイル編集時に実行するチェック',
    description: 'ビルダーが、ファイルを編集するたびに実行する軽いコマンドです。{file} は、編集したファイルのパスに置き換えられます。',
    example: 'biome check {file}',
    none: '編集時のチェックを設定しません',
  },
  commit: {
    title: 'コミット前に実行するチェック',
    description: 'ビルダーが、コミットする前に実行するコマンドです。変更したファイルと、それに依存するテストに絞った、速いものを設定します。',
    example: 'npm run check:changed',
    none: 'コミット前のチェックを設定しません',
  },
  push: {
    title: 'push 前に実行するチェック',
    description:
      'オーケストレーターが、バッチを取り込んだあと、バッチごとに 1 回実行するコマンドです。型チェックやビルド全体など、重いものを設定します。ビルダーとレビュアーがそのまま実行すると、止められます(引数を足して絞り込んだ実行は止まりません)。CI からも、同じコマンドを呼ぶようにします。',
    example: 'npm run check',
    none: `push 前のチェックを設定しません。${NO_CHECK}`,
  },
  release: {
    title: 'リリース前に実行するチェック',
    description: 'オーケストレーターが、リリースする前に実行するコマンドです。通しのテストや E2E を設定します。ビルダーとレビュアーがそのまま実行すると、止められます(引数を足して絞り込んだ実行は止まりません)。',
    example: 'npm run e2e',
    none: `リリース前のチェックを設定しません。${NO_CHECK}`,
  },
};
const SCOPE_CHOICES = [
  { value: 'project', label: 'このプロジェクトだけ', hint: '--scope project。このリポジトリーでだけ有効になります。ほかの人は、各自で同じコマンドを 1 回実行します' },
  { value: 'user', label: '自分のすべてのプロジェクト', hint: '--scope user。この環境のすべてのリポジトリーで有効になります。ほかの人には影響しません' },
  { value: null, label: 'インストールしない', hint: 'claude plugin install を実行しません。設定には plugin への参照を書き込むので、自分やほかの人が各自で実行すると有効になります' },
];

// 質問ごとの既定。いまの宣言に style か checks があれば、それが既定になる(無い軸と段階は、なし、空)。
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
    // 段階ごとの、既定にした理由(画面で添える)。
    why: Object.fromEntries(Object.keys(declared ?? detected.checks).map((stage) => [stage, declared ? `現在の ${DECLARATION} の値です` : `${detected.from[stage]} から検出しました`])),
    scope: 'project',
  };
}

const styleChoices = (axis) => [...STYLES[axis].map((value) => ({ value, label: value, hint: AXIS_TEXT[axis].hints[value] })), { value: null, label: 'なし', hint: AXIS_TEXT[axis].none }];

// 「別のコマンドを入力する」は、同じ質問の画面で入力に移る。答えの履歴は、入力したコマンドの 1 行になる。
async function askCheck(ui, stage, candidate, why) {
  const text = STAGE_TEXT[stage];
  const clear = { value: '', label: '使わない', hint: text.none };
  const edit = { value: null, label: '別のコマンドを入力する', hint: `例: ${text.example}`, input: { initial: candidate ?? '', description: `例: ${text.example}\n${saved(`checks.${stage}`)}` } };
  return ui.select({
    message: `${text.title}  (${stage})`,
    description: `${text.description}\n${saved(`checks.${stage}`)}`,
    choices: candidate ? [{ value: candidate, label: `${candidate} を使う`, hint: why }, edit, clear] : [clear, edit],
  });
}

// ui が null なら、尋ねずに既定で答える。
export async function ask({ options, defaults, ui }) {
  const hosts =
    options.hosts ??
    (ui
      ? await ui.multiselect({
          message: '対象のツール',
          description: 'dotagents を使うツールを選びます(複数選択できます)。選んだツールの設定ファイルに、plugin への参照を書き込みます。',
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
            message: 'plugin のインストール範囲(Claude Code)',
            description: 'この環境の Claude Code に、claude plugin install で plugin をインストールします。範囲によって、plugin が有効になる場所が変わります。',
            choices: SCOPE_CHOICES,
            initial: defaults.scope,
            recommended: defaults.scope,
          })
        : defaults.scope;
  return { hosts, ...answer, checks, scope };
}
