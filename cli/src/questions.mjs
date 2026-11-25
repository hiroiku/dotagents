// init の質問。指定(引数)があれば尋ねず、無ければ、画面があれば尋ね、無ければ既定で答える。
// 既定は、いまの宣言があればその値、無ければプロジェクトから推した値である。

import { configuredHosts, currentDeclaration, detectChecks, detectGit, detectHosts } from './detect.mjs';
import { AXIS_NAMES, HOST_NAMES, HOSTS, PLUGIN_ID, STAGES, STYLES, TARGET } from './target.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const HOST_FILES = { claude: '.claude/settings.json', codex: '.codex/config.toml' };
const AXIS_HINTS = {
  git: { trunk: '既定のブランチだけに統合し、tag で版を切る', 'release-branches': '開発は trunk と同じで、版の系列ごとに release/ のブランチを切る' },
  architecture: { layered: '層の依存の向きを、外から内へ保つ' },
};
const STAGE_NAMES = { edit: '編集のたび', commit: 'コミットの前', push: 'push の前', release: 'リリースの前' };
const SCOPE_CHOICES = [
  { value: 'project', label: 'このプロジェクトだけ', hint: '--scope project' },
  { value: 'user', label: '自分の全プロジェクト', hint: '--scope user' },
  { value: null, label: '入れない' },
];

// 質問ごとの既定。いまの宣言に style か checks があれば、それが既定になる(無い軸と段階は、選ばない、空)。
export function defaultsOf(root, env) {
  const declaration = currentDeclaration(root);
  const name = (axis) => (STYLES[axis].includes(declaration.style?.[axis]) ? declaration.style[axis] : null);
  const declared = isObject(declaration.checks)
    ? Object.fromEntries(STAGES.filter((stage) => typeof declaration.checks[stage] === 'string' && declaration.checks[stage]).map((stage) => [stage, declaration.checks[stage]]))
    : null;
  const configured = configuredHosts(root, PLUGIN_ID, TARGET.marketplace);
  return {
    hosts: configured.length ? configured : detectHosts(root, env),
    git: isObject(declaration.style) ? name('git') : detectGit(root),
    architecture: name('architecture'),
    checks: declared ?? detectChecks(root),
    scope: 'project',
  };
}

const styleChoices = (axis) => [...STYLES[axis].map((value) => ({ value, label: value, hint: AXIS_HINTS[axis][value] })), { value: null, label: '選ばない' }];

async function askCheck(ui, stage, candidate) {
  const message = `チェックの段階 ${stage}(${STAGE_NAMES[stage]})の入口`;
  const choices = candidate
    ? [{ value: 'keep', label: `そのまま使う: ${candidate}` }, { value: 'edit', label: '書き換える' }, { value: 'clear', label: '空にする' }]
    : [{ value: 'keep', label: '空のまま' }, { value: 'edit', label: '入力する' }];
  const choice = await ui.select({ message, choices });
  if (choice === 'keep') return candidate ?? '';
  if (choice === 'clear') return '';
  return ui.text({ message: `${stage} の入口`, initial: candidate ?? '' });
}

// ui が null なら、尋ねずに既定で答える。
export async function ask({ options, defaults, ui }) {
  const hosts =
    options.hosts ??
    (ui
      ? await ui.multiselect({ message: '入れるホスト', choices: HOSTS.map((value) => ({ value, label: HOST_NAMES[value], hint: HOST_FILES[value] })), initial: defaults.hosts })
      : defaults.hosts);
  const answer = {};
  for (const axis of ['git', 'architecture']) {
    answer[axis] = options[axis] !== undefined ? options[axis] : ui ? await ui.select({ message: AXIS_NAMES[axis], choices: styleChoices(axis), initial: defaults[axis] }) : defaults[axis];
  }
  const checks = {};
  for (const stage of STAGES) {
    checks[stage] = options.checks[stage] ?? (ui ? await askCheck(ui, stage, defaults.checks[stage]) : (defaults.checks[stage] ?? ''));
  }
  const scope = !hosts.includes('claude') ? null : options.scope !== undefined ? options.scope : ui ? await ui.select({ message: 'plugin を入れる範囲(Claude Code)', choices: SCOPE_CHOICES, initial: defaults.scope }) : defaults.scope;
  return { hosts, ...answer, checks, scope };
}
