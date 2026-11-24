#!/usr/bin/env node
// ホストの仕組みが持たない仕事だけを行う、小さな道具。
//
//   install [dir] [--git <流>] [--architecture <流>] [--no-template]
//                       プロジェクトに入れる。宣言に流を書き、各ホストのプロジェクトの設定に、この plugin への参照を書く。
//                       選んだ流に雛形があれば、プロジェクトに無いものだけを写す。
//   uninstall [dir]     参照を外す。宣言と、写した雛形は残す。
//   vendor [dir]        リポジトリーの中の marketplace に写して入れる。利用者が写しを選んだときだけ使う。
//   unvendor [dir]      写しを外す。
//   doctor [dir]        プロジェクトの宣言、流、入れ方、ブランチの保護を点検する。
//   stats [--days n]    仕組みが何をしたかの記録を集計する。
//
// 取得、版、更新は、各ホストの仕組み(marketplace、package)が持つ。ここでは持たない。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PLUGIN_ROOT, budgetOf, standingSize } from '../src/context.mjs';
import { DECLARATION, POLICY_KEYS, list, readDeclaration } from '../src/declaration.mjs';
import { KIND_LABELS, PROCEDURE_LABELS, styleValues } from '../src/guard.mjs';
import { NAME, claudeInstalled, install, installed, uninstall, unvendor, vendor, version } from '../src/install.mjs';
import { logDir } from '../src/log.mjs';
import { catalog, chosenStyles } from '../src/style.mjs';

export { NAME, install, uninstall, unvendor, vendor };

const KNOWN_KEYS = new Set([...POLICY_KEYS, 'decisions']);

// ---------------------------------------------------------------- doctor

const tryRun = (cwd, file, ...args) => {
  try {
    return execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

export function doctor(dir, { remote = true, claudeHome } = {}) {
  const root = path.resolve(dir);
  const notes = [];
  const note = (level, text) => notes.push({ level, text });

  const { file, value, error } = readDeclaration(root);
  const { chosen, unknown } = chosenStyles(value);
  for (const [role, label] of [['lead', '進める役'], ['builder', '作る役'], ['reviewer', '確かめる役']]) {
    const size = standingSize(role, chosen);
    note(size > budgetOf(role) ? 'error' : 'ok', `${label}が毎回読む文: ${size} 字(上限 ${budgetOf(role)} 字)`);
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
    if (tiers.length === 4) note('warn', '宣言に checks が無い。編集の段の検査は動かず、作る役が push の段の検査を回しても止まらない。script と workflow から当てはめる。');
    else if (tiers.length) note('info', `検査の段のうち、宣言に入口が無いもの: ${tiers.join('、')}`);
    const axes = Object.keys(catalog()).filter((axis) => !chosen.some((style) => style.axis === axis));
    if (axes.length) note('info', `流を選んでいない軸: ${axes.join('、')}。選ばなければ、その軸の文も決まりも入らない。`);
  }

  const { hosts, copy, oldCopy, oldPi } = installed(root);
  const missing = Object.entries(hosts).filter(([, mode]) => !mode).map(([host]) => host);
  if (missing.length === Object.keys(hosts).length) note('warn', 'どのホストの設定にも、この plugin への参照が無い。各人が自分の環境に入れていなければ、このプロジェクトでは働かない。install で書く。');
  else if (missing.length) note('info', `参照の設定が無いホスト: ${missing.join('、')}`);
  if (hosts['Claude Code'] === 'reference') {
    const here = claudeInstalled(root, claudeHome);
    if (here === true) note('ok', 'この環境の Claude Code に入っている。');
    else if (here === false) note('warn', `この環境の Claude Code には入っていない。設定で有効にしただけでは、対話のセッションの始めに読まれない。1 回 claude plugin install ${NAME}@${NAME} --scope project を実行する(すべてのプロジェクトで使うなら --scope user)。`);
    else note('info', 'この環境の Claude Code に入っているかを、確かめられなかった。');
  }
  if (copy) note(copy.version === version() ? 'ok' : 'warn', `リポジトリーに写した版: ${copy.version}(この道具の版: ${version()})`);
  if (oldCopy) note('warn', `8.x の写しが残っている: .claude/skills/${NAME}(${oldCopy.version})。install か vendor で置き換える。`);
  if (oldPi) note('warn', `8.x が Pi の設定(.pi/settings.json)に書いた package が残っている。9.0.0 は Pi に対応しない。install、vendor、uninstall のどれかで消える。`);
  for (const old of [path.join('.claude', 'dotagents.json'), path.join('.claude', 'rules', 'dotagents'), path.join('.codex', 'dotagents')]) {
    if (fs.existsSync(path.join(root, old))) note('warn', `7.x が配ったものが残っている: ${old}`);
  }

  // 共有のブランチが GitHub の側で守られているか。守られていなければ、ハーネスを入れていない人と道具は止まらない。
  if (remote && tryRun(root, 'git', 'rev-parse', '--git-dir')) {
    const head = tryRun(root, 'git', 'symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD');
    const branches = [...new Set([head?.replace(/^origin\//, ''), ...styleValues(value).shared, ...list(value.protected)].filter((name) => name && !name.includes('*')))];
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

// 止めた理由の名前。外へ届く操作の種類、止める手順、役の持ち場、AI の署名。
const LABELS = { ...KIND_LABELS, ...PROCEDURE_LABELS, pace: '進める役が回す検査', attribution: 'AI の関与を示す記述' };

function printStats(result) {
  const sum = (bucket) => Object.values(bucket).reduce((total, count) => total + count, 0);
  const each = (bucket) => Object.entries(bucket).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${LABELS[kind] ?? kind} ${count}`).join('、') || 'なし';
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

function option(rest, name) {
  const at = rest.indexOf(name);
  return at >= 0 ? rest[at + 1] : rest.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function main(argv) {
  const [command, ...rest] = argv;
  const valued = new Set(['--git', '--architecture', '--days']);
  const dir = rest.find((arg, index) => !arg.startsWith('-') && !valued.has(rest[index - 1])) ?? process.cwd();
  const tell = (result) => {
    for (const file of result.placed ?? []) console.log(`雛形を写した: ${file}`);
    for (const file of result.skipped ?? []) console.log(`すでにあるので写さなかった: ${file}`);
    console.log('書き換えたものをコミットする。各人がすることは次のとおり。');
    for (const line of result.each) console.log(`- ${line}`);
  };
  if (command === 'install') {
    tell(install(dir, { style: { git: option(rest, '--git'), architecture: option(rest, '--architecture') }, template: !rest.includes('--no-template') }));
  } else if (command === 'uninstall') {
    uninstall(dir);
    console.log('参照を外した。宣言と、写した雛形は残した。');
  } else if (command === 'vendor') {
    const result = vendor(dir);
    console.log(`${result.target} に ${result.version} を写した。`);
    tell(result);
  } else if (command === 'unvendor') {
    unvendor(dir);
    console.log('写しを外した。');
  } else if (command === 'doctor') {
    const notes = doctor(dir, { remote: !rest.includes('--offline') });
    const marks = { ok: '✓', info: '・', warn: '!', error: '✗' };
    for (const { level, text } of notes) console.log(`${marks[level]} ${text}`);
    process.exitCode = notes.some((entry) => entry.level === 'error') ? 1 : 0;
  } else if (command === 'stats') {
    const at = rest.indexOf('--days');
    printStats(stats({ days: at >= 0 ? Number(rest[at + 1]) || 7 : 7 }));
  } else {
    console.log('使い方: dotagents.mjs <install|uninstall|vendor|unvendor|doctor|stats> [dir]');
    process.exitCode = command ? 1 : 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
