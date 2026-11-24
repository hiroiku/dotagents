#!/usr/bin/env node
// ホストの仕組みが持たない仕事だけを行う、小さな道具。
//
//   vendor [dir]        プロジェクトに入れる。自分では入れていない人のセッションにも届くよう、この plugin を写す。
//   unvendor [dir]      プロジェクトに入れたものを外す。
//   doctor [dir]        プロジェクトの宣言、ブランチの保護、置いたものの版を点検する。
//   stats [--days n]    仕組みが何をしたかの記録を集計する。
//
// 取得、版、更新は、各ホストの仕組み(marketplace、package)が持つ。ここでは持たない。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGIN_ROOT, budgetOf, standingSize } from '../src/context.mjs';
import { DECLARATION, POLICY_KEYS, list, readDeclaration } from '../src/declaration.mjs';
import { catalog, chosenStyles } from '../src/style.mjs';
import { KIND_LABELS } from '../src/guard.mjs';
import { logDir } from '../src/log.mjs';

export const NAME = 'dotagents';
const VENDORED_DIR = path.join('.claude', 'skills', NAME);
const RECORD = 'VENDORED.json';
const PI_SETTINGS = path.join('.pi', 'settings.json');
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

// 同じハーネスを 2 つ読み込ませない仕事は、ホストに任せる。ここで片方を切ると、もう片方が読み込まれなかった
// ときに、どちらも働かない。
//
// - Claude Code: 写しを、利用者が自分の環境に入れたものと同じ名前にする。同じ名前の plugin が両方にあると、
//   利用者の環境のものだけを読む。写しは、自分では入れていない人のための控えになる。
// - Pi: 写しの場所ではなく、同じリポジトリーの版の tag を宣言する。同じリポジトリーの package が両方に
//   宣言されていると、プロジェクトの側だけを読む。
// - Codex: リポジトリーに置いた plugin を読まないので、何も置かない。
const piPackage = () => `git:${String(readJson(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), {}).repository).replace(/^https?:\/\//, '').replace(/\.git$/, '')}`;
const otherPiPackages = (settings) => {
  const packages = readJson(settings, {}).packages;
  const source = (entry) => String(typeof entry === 'string' ? entry : entry?.source);
  return (Array.isArray(packages) ? packages : []).filter((entry) => source(entry) !== piPackage() && !source(entry).startsWith(`${piPackage()}@`));
};

export function vendor(dir) {
  const root = path.resolve(dir);
  const target = path.join(root, VENDORED_DIR);
  if (target === PLUGIN_ROOT) throw new Error('写し自身から、同じ場所へは入れ直せない。入れてある plugin の道具から実行する。');
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, RECORD))) throw new Error(`${target} に、この道具が置いたのではないものがある。7.x の残りなら、先に消す。`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(PLUGIN_ROOT, target, { recursive: true, filter: (source) => !['node_modules', '.DS_Store'].includes(path.basename(source)) });
  writeJson(path.join(target, RECORD), { version: version() });

  const settings = path.join(root, PI_SETTINGS);
  setIn(settings, ['packages'], [...otherPiPackages(settings), `${piPackage()}@v${version()}`]);
  return { target, version: version() };
}

export function unvendor(dir) {
  const root = path.resolve(dir);
  const target = path.join(root, VENDORED_DIR);
  if (fs.existsSync(path.join(target, RECORD))) fs.rmSync(target, { recursive: true, force: true });
  const settings = path.join(root, PI_SETTINGS);
  if (fs.existsSync(settings)) setIn(settings, ['packages'], otherPiPackages(settings));
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

  const { file, value, error } = readDeclaration(root);
  const { chosen, unknown } = chosenStyles(value);
  for (const role of ['lead', 'builder', 'reviewer']) {
    const size = standingSize(role, chosen);
    note(size > budgetOf(role) ? 'error' : 'ok', `${role} が毎回読む文: ${size} 字(上限 ${budgetOf(role)} 字)`);
  }

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
    for (const entry of unknown) note('warn', `style に知らない流がある: ${entry}(選べるもの: ${Object.entries(catalog()).map(([axis, names]) => `${axis} は ${names.join('、')}`).join('。')})`);
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
    const project = (projects[entry.project ?? '(不明)'] ??= { asks: {}, denies: {}, checks: 0, roles: {}, skills: {}, contexts: {}, errors: 0 });
    if (entry.event === 'guard') {
      const bucket = entry.decision === 'ask' ? project.asks : project.denies;
      bucket[entry.kind] = (bucket[entry.kind] ?? 0) + 1;
    } else if (entry.event === 'check') project.checks += 1;
    else if (entry.event === 'role') {
      // 役の名前とモデルごとに足す。同じ役でも、モデルが違えば費用が違う。
      const name = `${entry.agentType ?? entry.role ?? '(不明)'}${entry.model ? `(${entry.model})` : ''}`;
      const role = (project.roles[name] ??= { count: 0, seconds: 0, out: 0, in: 0, cached: 0 });
      role.count += 1;
      for (const key of ['seconds', 'out', 'in', 'cached']) role[key] += Number.isFinite(entry[key]) ? entry[key] : 0;
    }
    else if (entry.event === 'skill') project.skills[entry.name] = (project.skills[entry.name] ?? 0) + 1;
    else if (entry.event === 'context') {
      const role = (project.contexts[entry.role] ??= { count: 0, chars: 0 });
      role.count += 1;
      role.chars = Math.max(role.chars, entry.chars ?? 0);
    } else if (entry.event === 'error') project.errors += 1;
  }
  return { days, since, projects };
}

// 1 回も読まれていないスキルも並べる。読まれないスキルは、説明が合っていないか、要らない。
const skillNames = () => fs.readdirSync(path.join(PLUGIN_ROOT, 'skills')).sort();

// トークンの数を、桁が一目で分かる形にする。
const amount = (value) => (value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${Math.round(value / 1e3)}k` : String(value));

function printStats(result) {
  const sum = (bucket) => Object.values(bucket).reduce((total, count) => total + count, 0);
  const each = (bucket) => Object.entries(bucket).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${KIND_LABELS[kind] ?? kind} ${count}`).join('、') || 'なし';
  console.log(`直近 ${result.days} 日`);
  for (const [name, project] of Object.entries(result.projects)) {
    console.log(`\n${name}`);
    console.log(`  確かめた: ${sum(project.asks)} 回(1 日 ${(sum(project.asks) / result.days).toFixed(1)} 回) ${each(project.asks)}`);
    console.log(`  止めた: ${sum(project.denies)} 回 ${each(project.denies)}`);
    console.log(`  編集の段の検査が落ちた: ${project.checks} 回`);
    for (const [role, used] of Object.entries(project.roles).sort((a, b) => b[1].out - a[1].out)) {
      console.log(`  役が使った分: ${role} ${used.count} 回、${Math.round(used.seconds / 60)} 分、出力 ${amount(used.out)}、入力 ${amount(used.in)}、キャッシュから ${amount(used.cached)}`);
    }
    console.log(`  スキルの読み込み: ${skillNames().map((name) => `${name} ${project.skills[name] ?? 0}`).join('、')}`);
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
