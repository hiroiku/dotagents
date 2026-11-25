#!/usr/bin/env node
// ハーネスが何をしたかの記録を集計する。ハーネスを作る側が、このリポジトリーで使う道具なので、plugin には入れない。
// 記録は、plugin の hook(src/log.mjs、src/usage.mjs)が、各人の ~/.dotagents/log に残す。
// 古い記録のロール名 `lead` は、`orchestrator` として数える。
//
//   node tools/stats.mjs [--days n]

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KIND_LABELS, PROCEDURE_LABELS } from '../plugin/src/guard.mjs';
import { logDir } from '../plugin/src/log.mjs';
import { PLUGIN_ROOT } from '../plugin/src/root.mjs';

export function stats({ days = 7, now = new Date() } = {}) {
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const entries = [];
  const dir = logDir();
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.jsonl')).sort() : []) {
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.t >= since) entries.push(entry.role === 'lead' ? { ...entry, role: 'orchestrator' } : entry);
      } catch {}
    }
  }
  const projects = {};
  for (const entry of entries) {
    const project = (projects[entry.project ?? '(不明)'] ??= { asks: {}, denies: {}, roles: {}, skills: {}, contexts: {}, errors: 0 });
    if (entry.event === 'guard') {
      const bucket = entry.decision === 'ask' ? project.asks : project.denies;
      bucket[entry.kind] = (bucket[entry.kind] ?? 0) + 1;
    } else if (entry.event === 'role') {
      // エージェントの名前とモデルごとに足す。同じエージェントでも、モデルが違えば費用が違う。
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

// 止めた理由の名前。外へ届く操作の種類、止める手順、エージェントの持ち場、AI の署名。
const LABELS = { ...KIND_LABELS, ...PROCEDURE_LABELS, pace: 'オーケストレーターが回す検査', attribution: 'AI の関与を示す記述' };

function printStats(result) {
  const sum = (bucket) => Object.values(bucket).reduce((total, count) => total + count, 0);
  const each = (bucket) => Object.entries(bucket).sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${LABELS[kind] ?? kind} ${count}`).join('、') || 'なし';
  console.log(`直近 ${result.days} 日`);
  for (const [name, project] of Object.entries(result.projects)) {
    console.log(`\n${name}`);
    console.log(`  確かめた: ${sum(project.asks)} 回(1 日 ${(sum(project.asks) / result.days).toFixed(1)} 回) ${each(project.asks)}`);
    console.log(`  止めた: ${sum(project.denies)} 回 ${each(project.denies)}`);
    for (const [role, used] of Object.entries(project.roles).sort((a, b) => b[1].out - a[1].out)) {
      console.log(`  エージェントが使った分: ${role} ${used.count} 回、${Math.round(used.seconds / 60)} 分、出力 ${amount(used.out)}、入力 ${amount(used.in)}、キャッシュから ${amount(used.cached)}`);
    }
    console.log(`  スキルの読み込み: ${skillNames().map((name) => `${name} ${project.skills[name] ?? 0}`).join('、')}`);
    console.log(`  常設の文: ${Object.entries(project.contexts).map(([role, value]) => `${role} ${value.count} 回・${value.chars} 字`).join('、') || 'なし'}`);
    if (project.errors) console.log(`  受け口の例外: ${project.errors} 回`);
  }
  if (!Object.keys(result.projects).length) console.log('記録が無い。');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const at = process.argv.indexOf('--days');
  printStats(stats({ days: at >= 0 ? Number(process.argv[at + 1]) || 7 : 7 }));
}
