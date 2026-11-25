#!/usr/bin/env node
// ホストの仕組みが持たない仕事だけを行う、小さな道具。
//
//   install [dir] [--git <流>] [--architecture <流>]
//                       プロジェクトに入れる。宣言に流を書き、各ホストのプロジェクトの設定に、この plugin への参照を書く。
//   uninstall [dir]     参照を外す。宣言は残す。
//   doctor [dir]        プロジェクトの宣言、流、入れ方、ブランチの保護を点検する。
//
// 取得、版、更新は、各ホストの仕組み(marketplace、package)が持つ。ここでは持たない。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { budgetOf, standingSize } from '../src/context.mjs';
import { DECLARATION, POLICY_KEYS, list, readDeclaration } from '../src/declaration.mjs';
import { KIND_LABELS, styleValues } from '../src/guard.mjs';
import { NAME, claudeInstalled, install, installed, uninstall } from '../src/install.mjs';
import { catalog, chosenStyles } from '../src/style.mjs';

export { NAME, install, uninstall };

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
    if (tiers.length === 4) note('warn', '宣言に checks が無い。役の文脈に検査の入口が入らず、作る役が push の段の検査を回しても止まらない。script と workflow から当てはめる。');
    else if (tiers.length) note('info', `検査の段のうち、宣言に入口が無いもの: ${tiers.join('、')}`);
    const axes = Object.keys(catalog()).filter((axis) => !chosen.some((style) => style.axis === axis));
    if (axes.length) note('info', `流を選んでいない軸: ${axes.join('、')}。選ばなければ、その軸の文も決まりも入らない。`);
  }

  const { hosts, oldCopy, oldPi } = installed(root);
  const missing = Object.entries(hosts).filter(([, written]) => !written).map(([host]) => host);
  if (missing.length === Object.keys(hosts).length) note('warn', 'どのホストの設定にも、この plugin への参照が無い。各人が自分の環境に入れていなければ、このプロジェクトでは働かない。install で書く。');
  else if (missing.length) note('info', `参照の設定が無いホスト: ${missing.join('、')}`);
  if (hosts['Claude Code']) {
    const here = claudeInstalled(root, claudeHome);
    if (here === true) note('ok', 'この環境の Claude Code に入っている。');
    else if (here === false) note('warn', `この環境の Claude Code には入っていない。設定で有効にしただけでは、対話のセッションの始めに読まれない。1 回 claude plugin install ${NAME}@${NAME} --scope project を実行する(すべてのプロジェクトで使うなら --scope user)。`);
    else note('info', 'この環境の Claude Code に入っているかを、確かめられなかった。');
  }
  if (oldCopy) note('warn', `8.x の写しが残っている: .claude/skills/${NAME}(${oldCopy.version})。install で参照に置き換える。`);
  if (oldPi) note('warn', `8.x が Pi の設定(.pi/settings.json)に書いた package が残っている。9.0.0 は Pi に対応しない。install か uninstall で消える。設定が JSON として読めなければ、手で消す。`);
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

// ---------------------------------------------------------------- main

function option(rest, name) {
  const at = rest.indexOf(name);
  return at >= 0 ? rest[at + 1] : rest.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function main(argv) {
  const [command, ...rest] = argv;
  const valued = new Set(['--git', '--architecture']);
  const dir = rest.find((arg, index) => !arg.startsWith('-') && !valued.has(rest[index - 1])) ?? process.cwd();
  const tell = (result) => {
    console.log('書き換えたものをコミットする。各人がすることは次のとおり。');
    for (const line of result.each) console.log(`- ${line}`);
  };
  if (command === 'install') {
    tell(install(dir, { style: { git: option(rest, '--git'), architecture: option(rest, '--architecture') } }));
  } else if (command === 'uninstall') {
    uninstall(dir);
    console.log('参照を外した。宣言は残した。');
  } else if (command === 'doctor') {
    const notes = doctor(dir, { remote: !rest.includes('--offline') });
    const marks = { ok: '✓', info: '・', warn: '!', error: '✗' };
    for (const { level, text } of notes) console.log(`${marks[level]} ${text}`);
    process.exitCode = notes.some((entry) => entry.level === 'error') ? 1 : 0;
  } else {
    console.log('使い方: dotagents.mjs <install|uninstall|doctor> [dir]');
    process.exitCode = command ? 1 : 0;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
