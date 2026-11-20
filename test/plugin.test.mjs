import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codexAgent, roles } from '../plugin/src/roles.mjs';
import { PROFILE_NAME, VENDORED_NAME, doctor, stats, unvendor, vendor } from '../plugin/scripts/dotagents.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLUGIN = path.join(ROOT, 'plugin');
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));

test('3 つのホストの定義は、同じ名前と版を持つ', () => {
  const manifests = [json(PLUGIN, '.claude-plugin', 'plugin.json'), json(PLUGIN, '.codex-plugin', 'plugin.json'), json(PLUGIN, 'package.json'), json(ROOT, 'package.json')];
  assert.deepEqual([...new Set(manifests.map((manifest) => manifest.version))].length, 1);
  for (const manifest of manifests.slice(0, 3)) assert.equal(manifest.name, PROFILE_NAME);
  assert.equal(json(ROOT, '.claude-plugin', 'marketplace.json').plugins[0].source, './plugin');
  assert.equal(json(ROOT, '.agents', 'plugins', 'marketplace.json').plugins[0].source.path, './plugin');
});

test('hook の定義が指すファイルは在り、2 つのホストが同じ既定の場所を読み合わない', () => {
  // どちらのホストも hooks/hooks.json を既定で読むので、そこには置かない。
  assert.equal(fs.existsSync(path.join(PLUGIN, 'hooks', 'hooks.json')), false);
  for (const [host, variable] of [['claude', '${CLAUDE_PLUGIN_ROOT}'], ['codex', '${PLUGIN_ROOT}']]) {
    const manifest = json(PLUGIN, host === 'claude' ? '.claude-plugin' : '.codex-plugin', 'plugin.json');
    const hooks = json(PLUGIN, manifest.hooks).hooks;
    for (const groups of Object.values(hooks)) {
      for (const hook of groups.flatMap((group) => group.hooks)) {
        const file = hook.command.match(/"([^"]+\.mjs)"/)[1];
        assert.ok(file.startsWith(variable), hook.command);
        assert.ok(fs.existsSync(path.join(PLUGIN, file.slice(variable.length))), file);
        assert.match(hook.command, new RegExp(` ${host} (session|subagent|tool|edited)$`));
      }
    }
  }
});

test('スキルと役の定義は、どのホストでも読める形をしている', () => {
  for (const name of fs.readdirSync(path.join(PLUGIN, 'skills'))) {
    const text = fs.readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8');
    const front = text.match(/^---\n([\s\S]*?)\n---\n/)[1];
    assert.equal(front.match(/^name: (.+)$/m)[1], name);
    assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    const description = front.match(/^description: (.+)$/m)[1];
    assert.ok(description.length > 0 && description.length <= 1024);
    for (const [, link] of text.matchAll(/\]\((references\/[^)]+)\)/g)) assert.ok(fs.existsSync(path.join(PLUGIN, 'skills', name, link)), link);
  }
  assert.deepEqual(roles().map((role) => role.name), ['builder', 'reviewer']);
  const agent = codexAgent(roles()[0]);
  assert.equal(agent.file, 'dotagents-builder.toml');
  assert.match(agent.content, /^name = "dotagents-builder"\ndescription = ".+"\ndeveloper_instructions = ".+"\n$/);
});

test('プロジェクトに入れると、別の名前の写しと、利用者の側を切る設定が置かれる。外すと元に戻る', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-vendor-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] } }));
  vendor(dir);
  const copy = path.join(dir, '.claude', 'skills', VENDORED_NAME);
  assert.equal(json(copy, '.claude-plugin', 'plugin.json').name, VENDORED_NAME);
  assert.equal(json(copy, 'VENDORED.json').version, json(PLUGIN, 'package.json').version);
  assert.ok(fs.existsSync(path.join(copy, 'src', 'guard.mjs')) && fs.existsSync(path.join(copy, 'skills', 'flow', 'SKILL.md')));
  const settings = json(dir, '.claude', 'settings.json');
  assert.deepEqual(settings.permissions, { allow: ['Bash(ls:*)'] });
  assert.equal(settings.enabledPlugins[`${PROFILE_NAME}@${PROFILE_NAME}`], false);
  assert.deepEqual(json(dir, '.pi', 'settings.json').packages, [`../.claude/skills/${VENDORED_NAME}`]);
  assert.ok(fs.existsSync(path.join(dir, '.codex', 'agents', `${VENDORED_NAME}-builder.toml`)));
  assert.equal(json(dir, '.agents', 'plugins', 'marketplace.json').plugins[0].source.path, `./.claude/skills/${VENDORED_NAME}`);
  vendor(dir);
  assert.equal(json(dir, '.pi', 'settings.json').packages.length, 1);
  assert.equal(json(dir, '.agents', 'plugins', 'marketplace.json').plugins.length, 1);
  assert.ok(doctor(dir, { remote: false }).some((entry) => entry.level === 'ok' && entry.text.includes('プロジェクトに入れた版')));
  unvendor(dir);
  assert.equal(fs.existsSync(copy), false);
  assert.deepEqual(json(dir, '.claude', 'settings.json').enabledPlugins, {});
  assert.deepEqual(json(dir, '.pi', 'settings.json').packages, []);
  assert.equal(fs.existsSync(path.join(dir, '.codex', 'agents', `${VENDORED_NAME}-builder.toml`)), false);
});

test('点検は、宣言の誤りと 7.x の残りを知らせる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-doctor-'));
  assert.ok(doctor(dir, { remote: false }).some((entry) => entry.level === 'info' && entry.text.includes('宣言')));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.mkdirSync(path.join(dir, '.claude', 'rules', 'dotagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify({ outward: ['('], delegated: ['pusg'], extra: 1 }));
  const notes = doctor(dir, { remote: false }).map((entry) => `${entry.level}: ${entry.text}`).join('\n');
  assert.match(notes, /error: outward の正規表現が読めない/);
  assert.match(notes, /warn: delegated に知らない種類がある: pusg/);
  assert.match(notes, /warn: 宣言に知らない項目がある: extra/);
  assert.match(notes, /warn: 7\.x が配ったものが残っている/);
});

test('集計は、記録からプロジェクトごとの回数を出す', () => {
  const previous = process.env.DOTAGENTS_HOME;
  process.env.DOTAGENTS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-stats-'));
  try {
    const now = new Date('2026-11-20T12:00:00Z');
    fs.mkdirSync(path.join(process.env.DOTAGENTS_HOME, 'log'));
    const entry = (value) => JSON.stringify(value);
    fs.writeFileSync(path.join(process.env.DOTAGENTS_HOME, 'log', '2026-11.jsonl'), [
      entry({ t: '2026-11-19T01:00:00Z', event: 'guard', project: 'p', decision: 'ask', kind: 'push' }),
      entry({ t: '2026-11-19T02:00:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'pace' }),
      entry({ t: '2026-11-19T03:00:00Z', event: 'context', project: 'p', role: 'lead', chars: 1400 }),
      entry({ t: '2026-11-01T00:00:00Z', event: 'guard', project: 'p', decision: 'ask', kind: 'push' }),
      'broken line',
    ].join('\n'));
    const result = stats({ days: 7, now });
    assert.deepEqual(result.projects.p.asks, { push: 1 });
    assert.deepEqual(result.projects.p.denies, { pace: 1 });
    assert.deepEqual(result.projects.p.contexts.lead, { count: 1, chars: 1400 });
  } finally {
    if (previous === undefined) delete process.env.DOTAGENTS_HOME;
    else process.env.DOTAGENTS_HOME = previous;
  }
});
