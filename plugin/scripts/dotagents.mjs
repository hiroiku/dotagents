#!/usr/bin/env node
// ホストの仕組みが持たない仕事だけを行う、小さな道具。
//
//   vendor [dir]        プロジェクトに入れる。pull した人のセッションにも届く形で、この plugin を写す。
//   unvendor [dir]      プロジェクトに入れたものを外す。
//   doctor [dir]        プロジェクトの宣言、ブランチの保護、置いたものの版を点検する。
//   stats [--days n]    仕組みが何をしたかの記録を集計する。
//
// 取得、版、更新は、各ホストの仕組み(marketplace、package)が持つ。ここでは持たない。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUDGET, PLUGIN_ROOT, coreText } from '../src/context.mjs';
import { DECLARATION, POLICY_KEYS, list, readDeclaration } from '../src/declaration.mjs';
import { KIND_LABELS } from '../src/guard.mjs';
import { logDir } from '../src/log.mjs';
import { codexAgent, roles } from '../src/roles.mjs';

// プロジェクトに置く写しは、利用者の設定に入れたものと名前を分ける。Claude Code は、同じ名前の plugin が
// 両方にあると、プロジェクトの側を読まないからである。
export const PROFILE_NAME = 'dotagents';
export const VENDORED_NAME = 'dotagents-repo';
const VENDORED_DIR = path.join('.claude', 'skills', VENDORED_NAME);
const RECORD = 'VENDORED.json';
const KNOWN_KEYS = new Set([...POLICY_KEYS, 'decisions']);

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const version = () => readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), {}).version;

// JSON の設定に 1 つの値を置く。ほかの値には触れない。値が undefined なら、その鍵を消す。
function setIn(file, keys, value) {
  const data = readJson(file, {});
  let node = data;
  for (const key of keys.slice(0, -1)) node = node[key] && typeof node[key] === 'object' ? node[key] : (node[key] = {});
  if (value === undefined) delete node[keys.at(-1)];
  else node[keys.at(-1)] = value;
  writeJson(file, data);
}

// ---------------------------------------------------------------- vendor

export function vendor(dir) {
  const root = path.resolve(dir);
  const target = path.join(root, VENDORED_DIR);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(PLUGIN_ROOT, target, { recursive: true, filter: (source) => !['node_modules', '.DS_Store'].includes(path.basename(source)) });
  for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', 'package.json']) setIn(path.join(target, manifest), ['name'], VENDORED_NAME);
  writeJson(path.join(target, RECORD), { from: PROFILE_NAME, version: version() });

  // Claude Code: 置いた場所から読み込まれる。利用者の設定に入れた同じハーネスは、このプロジェクトでは切る。
  setIn(path.join(root, '.claude', 'settings.json'), ['enabledPlugins', `${PROFILE_NAME}@${PROFILE_NAME}`], false);

  // Pi: 置いた場所を package として宣言する。
  const piSettings = path.join(root, '.pi', 'settings.json');
  const source = path.join('..', VENDORED_DIR).split(path.sep).join('/');
  const packages = list(readJson(piSettings, {}).packages).filter((entry) => entry !== source);
  setIn(piSettings, ['packages'], [...packages, source]);

  // Codex: 役は TOML で、スキルは置いた場所へのリンクで届ける。hook は、置いた場所を plugin として入れると動く。
  const agentsDir = path.join(root, '.codex', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const role of roles(target)) {
    const { file, content } = codexAgent(role, VENDORED_NAME);
    fs.writeFileSync(path.join(agentsDir, file), content);
  }
  const market = path.join(root, '.agents', 'plugins', 'marketplace.json');
  const catalog = readJson(market, { name: path.basename(root), interface: { displayName: path.basename(root) }, plugins: [] });
  catalog.plugins = [
    ...(catalog.plugins ?? []).filter((plugin) => plugin.name !== VENDORED_NAME),
    { name: VENDORED_NAME, source: { source: 'local', path: `./${VENDORED_DIR.split(path.sep).join('/')}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' },
  ];
  writeJson(market, catalog);
  return { target, version: version() };
}

export function unvendor(dir) {
  const root = path.resolve(dir);
  fs.rmSync(path.join(root, VENDORED_DIR), { recursive: true, force: true });
  setIn(path.join(root, '.claude', 'settings.json'), ['enabledPlugins', `${PROFILE_NAME}@${PROFILE_NAME}`], undefined);
  const piSettings = path.join(root, '.pi', 'settings.json');
  const source = path.join('..', VENDORED_DIR).split(path.sep).join('/');
  if (fs.existsSync(piSettings)) setIn(piSettings, ['packages'], list(readJson(piSettings, {}).packages).filter((entry) => entry !== source));
  for (const role of roles()) fs.rmSync(path.join(root, '.codex', 'agents', codexAgent(role, VENDORED_NAME).file), { force: true });
  const market = path.join(root, '.agents', 'plugins', 'marketplace.json');
  const catalog = readJson(market, null);
  if (catalog) writeJson(market, { ...catalog, plugins: (catalog.plugins ?? []).filter((plugin) => plugin.name !== VENDORED_NAME) });
}

// ---------------------------------------------------------------- doctor

const tryRun = (cwd, file, ...args) => {
  try {
    return execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

export function doctor(dir, { remote = true } = {}) {
  const root = path.resolve(dir);
  const notes = [];
  const note = (level, text) => notes.push({ level, text });

  for (const [name, limit] of Object.entries(BUDGET)) {
    const size = coreText(name).length;
    note(size > limit ? 'error' : 'ok', `常設の文 ${name}: ${size} 字(上限 ${limit} 字)`);
  }

  const { file, value, error } = readDeclaration(root);
  if (!file) note('info', `プロジェクトの宣言(${DECLARATION})が無い。外へ届く操作は、すべて確かめる。`);
  else if (error) note('error', `プロジェクトの宣言が読めない: ${error}`);
  else {
    for (const key of Object.keys(value)) if (!KNOWN_KEYS.has(key)) note('warn', `宣言に知らない項目がある: ${key}`);
    for (const source of list(value.outward)) {
      try {
        new RegExp(source);
      } catch {
        note('error', `outward の正規表現が読めない: ${source}`);
      }
    }
    for (const entry of list(value.delegated)) if (!KIND_LABELS[entry.split(':')[0]]) note('warn', `delegated に知らない種類がある: ${entry}`);
    const tiers = ['edit', 'commit', 'push', 'release'].filter((tier) => !value.checks?.[tier]);
    if (tiers.length) note('info', `検査の段のうち、宣言に入口が無いもの: ${tiers.join('、')}`);
  }

  const vendored = readJson(path.join(root, VENDORED_DIR, RECORD), null);
  if (vendored) note(vendored.version === version() ? 'ok' : 'warn', `プロジェクトに入れた版: ${vendored.version}(この道具の版: ${version()})`);
  for (const old of [path.join('.claude', 'dotagents.json'), path.join('.claude', 'rules', 'dotagents'), path.join('.codex', 'dotagents')]) {
    if (fs.existsSync(path.join(root, old))) note('warn', `7.x が配ったものが残っている: ${old}`);
  }

  // 共有のブランチが GitHub の側で守られているか。守られていなければ、ハーネスを入れていない人と道具は止まらない。
  if (remote && tryRun(root, 'git', 'rev-parse', '--git-dir')) {
    const head = tryRun(root, 'git', 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD');
    const branches = [...new Set([head?.replace(/^origin\//, ''), ...list(value.protected).filter((name) => !name.includes('*'))].filter(Boolean))];
    for (const branch of branches) {
      const rules = tryRun(root, 'gh', 'api', `repos/{owner}/{repo}/rules/branches/${branch}`, '--jq', 'length');
      const legacy = tryRun(root, 'gh', 'api', `repos/{owner}/{repo}/branches/${branch}/protection`, '--jq', '.url');
      if (rules === null && legacy === null) note('info', `${branch}: GitHub の保護を確かめられなかった`);
      else if (Number(rules) > 0 || legacy) note('ok', `${branch}: GitHub で守られている`);
      else note('warn', `${branch}: GitHub で守られていない。このハーネスを入れていない人と道具は、確かめなしで push できる。`);
    }
  }
  return notes;
}

// ---------------------------------------------------------------- stats

export function stats({ days = 7, now = new Date() } = {}) {
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const entries = [];
  const dir = logDir();
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.jsonl')).sort() : []) {
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.t >= since) entries.push(entry);
      } catch {}
    }
  }
  const projects = {};
  for (const entry of entries) {
    const project = (projects[entry.project ?? '(不明)'] ??= { asks: {}, denies: {}, checks: 0, contexts: {}, errors: 0 });
    if (entry.event === 'guard') {
      const bucket = entry.decision === 'ask' ? project.asks : project.denies;
      bucket[entry.kind] = (bucket[entry.kind] ?? 0) + 1;
    } else if (entry.event === 'check') project.checks += 1;
    else if (entry.event === 'context') {
      const role = (project.contexts[entry.role] ??= { count: 0, chars: 0 });
      role.count += 1;
      role.chars = Math.max(role.chars, entry.chars ?? 0);
    } else if (entry.event === 'error') project.errors += 1;
  }
  return { days, since, projects };
}

function printStats(result) {
  const sum = (bucket) => Object.values(bucket).reduce((total, count) => total + count, 0);
  const each = (bucket) => Object.entries(bucket).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${KIND_LABELS[kind] ?? kind} ${count}`).join('、') || 'なし';
  console.log(`直近 ${result.days} 日`);
  for (const [name, project] of Object.entries(result.projects)) {
    console.log(`\n${name}`);
    console.log(`  確かめた: ${sum(project.asks)} 回(1 日 ${(sum(project.asks) / result.days).toFixed(1)} 回) ${each(project.asks)}`);
    console.log(`  止めた: ${sum(project.denies)} 回 ${each(project.denies)}`);
    console.log(`  編集の段の検査が落ちた: ${project.checks} 回`);
    console.log(`  常設の文: ${Object.entries(project.contexts).map(([role, value]) => `${role} ${value.count} 回・${value.chars} 字`).join('、') || 'なし'}`);
    if (project.errors) console.log(`  受け口の例外: ${project.errors} 回`);
  }
  if (!Object.keys(result.projects).length) console.log('記録が無い。');
}

// ---------------------------------------------------------------- main

function main(argv) {
  const [command, ...rest] = argv;
  const dir = rest.find((arg) => !arg.startsWith('-')) ?? process.cwd();
  if (command === 'vendor') {
    const result = vendor(dir);
    console.log(`${result.target} に ${result.version} を置いた。置いたものと、書き換えた設定をコミットする。`);
    console.log(`Codex の hook は、利用者ごとに 1 回 \`codex plugin add ${VENDORED_NAME}\` で入れる。`);
  } else if (command === 'unvendor') {
    unvendor(dir);
    console.log('外した。');
  } else if (command === 'doctor') {
    const notes = doctor(dir, { remote: !rest.includes('--offline') });
    const marks = { ok: '✓', info: '・', warn: '!', error: '✗' };
    for (const { level, text } of notes) console.log(`${marks[level]} ${text}`);
    process.exitCode = notes.some((entry) => entry.level === 'error') ? 1 : 0;
  } else if (command === 'stats') {
    const at = rest.indexOf('--days');
    printStats(stats({ days: at >= 0 ? Number(rest[at + 1]) || 7 : 7 }));
  } else {
    console.log('使い方: dotagents.mjs <vendor|unvendor|doctor|stats> [dir]');
    process.exitCode = command ? 1 : 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
