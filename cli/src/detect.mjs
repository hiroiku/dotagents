// プロジェクトを見て、質問の既定にする値を推す。読むのは、PATH と、ホストの置き場と、ブランチと、
// package.json の scripts と、Makefile の対象だけである。配備のコマンドや ARCHITECTURE.md は扱わない。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DECLARATION, STAGES } from './target.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function onPath(name, env = process.env, platform = process.platform) {
  const extensions = platform === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  for (const dir of String(env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      try {
        const file = path.join(dir, name + extension);
        fs.accessSync(file, fs.constants.X_OK);
        if (fs.statSync(file).isFile()) return true;
      } catch {}
    }
  }
  return false;
}

// git の出力。git が無い、リポジトリーでないときは null。
export function git(cwd, ...args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// git のリポジトリーの根。リポジトリーの外なら null。
export const repositoryRoot = (cwd) => {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  return top ? path.resolve(top) : null;
};

// PATH にあるコマンドと、すでにある置き場から、入れるホストを推す。どちらも見つからなければ、両方。
export function detectHosts(root, env) {
  const found = [
    ['claude', onPath('claude', env) || fs.existsSync(path.join(root, '.claude'))],
    ['codex', onPath('codex', env) || fs.existsSync(path.join(root, '.codex'))],
  ].filter(([, there]) => there).map(([host]) => host);
  return found.length ? found : ['claude', 'codex'];
}

// release/ で始まるブランチが、ローカルかリモートにあれば release-branches。
export function detectGit(root) {
  const refs = git(root, 'for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes') ?? '';
  return refs.split('\n').some((ref) => /^refs\/(heads|remotes\/[^/]+)\/release\//.test(ref)) ? 'release-branches' : 'trunk';
}

// ---------------------------------------------------------------- 検査の入口

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

// ロックファイルから、パッケージマネージャーを推す。
function manager(root) {
  const has = (name) => fs.existsSync(path.join(root, name));
  if (has('pnpm-lock.yaml')) return { run: (script) => `pnpm run ${script}`, exec: 'pnpm exec' };
  if (has('bun.lock') || has('bun.lockb')) return { run: (script) => `bun run ${script}`, exec: 'bunx' };
  if (has('yarn.lock')) return { run: (script) => `yarn ${script}`, exec: 'yarn' };
  return { run: (script) => (script === 'test' ? 'npm test' : `npm run ${script}`), exec: 'npx' };
}

// 段階ごとに、先に見つかった script を入口にする。
const SCRIPTS = {
  commit: ['check:changed', 'check:staged', 'lint:staged', 'precommit', 'lint'],
  push: ['check', 'ci', 'verify', 'test'],
  release: ['test:e2e', 'e2e', 'release:check', 'prerelease'],
};
// 編集したファイルを {file} で受けられる、軽い検査。
const EDITORS = [
  ['@biomejs/biome', 'biome check {file}'],
  ['eslint', 'eslint {file}'],
];

export function detectChecks(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  const scripts = isObject(pkg.scripts) ? pkg.scripts : {};
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  const tool = manager(root);
  const checks = {};
  for (const [stage, names] of Object.entries(SCRIPTS)) {
    const name = names.find((script) => typeof scripts[script] === 'string');
    if (name) checks[stage] = tool.run(name);
  }
  const editor = EDITORS.find(([name]) => name in dependencies);
  if (editor) checks.edit = `${tool.exec} ${editor[1]}`;
  if (!checks.push) {
    try {
      const make = fs.readFileSync(path.join(root, 'Makefile'), 'utf8');
      const target = ['check', 'test'].find((name) => new RegExp(`^${name}\\s*:`, 'm').test(make));
      if (target) checks.push = `make ${target}`;
    } catch {}
  }
  return Object.fromEntries(STAGES.filter((stage) => checks[stage]).map((stage) => [stage, checks[stage]]));
}

// ---------------------------------------------------------------- いまの宣言と設定

// いまの宣言(.agents/dotagents.json)。読めなければ投げる(宣言は書き換えもするので、先に止める)。
export function currentDeclaration(root) {
  const file = path.join(root, DECLARATION);
  if (!fs.existsSync(file)) return {};
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${DECLARATION} が JSON として読めないので、書き換えない: ${error.message}`);
  }
  if (!isObject(value)) throw new Error(`${DECLARATION} がオブジェクトではないので、書き換えない。`);
  return value;
}

// すでに参照を書いてあるホスト。
export function configuredHosts(root, pluginId, marketplace) {
  const hosts = [];
  const settings = readJson(path.join(root, '.claude', 'settings.json'));
  if (isObject(settings.enabledPlugins) && settings.enabledPlugins[pluginId] === true) hosts.push('claude');
  try {
    const toml = fs.readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8');
    if (toml.includes(`[plugins."${pluginId}"]`) && toml.includes(`[marketplaces.${marketplace}]`)) hosts.push('codex');
  } catch {}
  return hosts;
}

// この環境の Claude Code に、この plugin が入っているか。参照を設定に書いただけでは、対話のセッションの始めに読まれない。
// scope が user の記録があれば、どの範囲でも入っている。project の範囲は、このプロジェクトの project か local の記録でも入っている。
// 記録が読めなければ false。
export function claudeInstalled(root, scope, pluginId, env = process.env) {
  const home = env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
  const entries = readJson(path.join(home, 'plugins', 'installed_plugins.json')).plugins?.[pluginId];
  if (!Array.isArray(entries)) return false;
  const real = (file) => {
    try {
      return fs.realpathSync(file);
    } catch {
      return path.resolve(file);
    }
  };
  return entries.some((entry) => entry?.scope === 'user' || (scope === 'project' && (entry?.scope === 'project' || entry?.scope === 'local') && typeof entry.projectPath === 'string' && real(entry.projectPath) === real(root)));
}
