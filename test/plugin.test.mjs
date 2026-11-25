import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { largestSize } from '../plugin/src/context.mjs';
import { codexAgent, roles } from '../plugin/src/roles.mjs';
import { catalog } from '../plugin/src/style.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLUGIN = path.join(ROOT, 'plugin');
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));
const NAME = json(PLUGIN, '.claude-plugin', 'plugin.json').name;

test('ホストごとの定義は、同じ名前と版を持つ', () => {
  // 版を上げるときは、この 5 か所をそろえる。インストーラーの版は、入れる plugin の版と同じにする。
  const manifests = [json(PLUGIN, '.claude-plugin', 'plugin.json'), json(PLUGIN, '.codex-plugin', 'plugin.json'), json(PLUGIN, 'package.json'), json(ROOT, 'package.json'), json(ROOT, 'cli', 'package.json')];
  assert.deepEqual([...new Set(manifests.map((manifest) => manifest.version))].length, 1);
  for (const manifest of manifests.slice(0, 3)) assert.equal(manifest.name, NAME);
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
        assert.match(hook.command, new RegExp(` ${host} (session|subagent|tool|stopped)$`));
      }
    }
  }
});

// ホストは、時間切れになった hook を理由を返さずに打ち切る。検査は、その手前で自分から止まって理由を返す。
test('セッションの開始の知らせは、始まり方を選ばずに受ける', () => {
  // 開き直し(resume)を外すと、ハーネスを入れる前や、前の版のころに始まったセッションを開き直しても、いまの文が届かない。
  for (const host of ['claude', 'codex']) {
    for (const entry of json(PLUGIN, 'hosts', host, 'hooks.json').hooks.SessionStart) {
      for (const source of ['startup', 'resume', 'clear', 'compact']) assert.ok(!entry.matcher || new RegExp(entry.matcher).test(source), `${host}: ${source}`);
    }
  }
});

// Codex は、hook が返した文がこの値(バイト数を 4 で割って切り上げた数)を超えると、先頭と末尾の抜粋だけを渡す。
// 日本語は 1 字 3 バイトなので、どのスタイルを選んだときの文も、字数の 3/4 で収まることを確かめる。
test('Codex の hook は、どのスタイルを選んだときの文も切らずに渡す', () => {
  for (const event of ['SessionStart', 'SubagentStart']) {
    for (const hook of json(PLUGIN, 'hosts', 'codex', 'hooks.json').hooks[event].flatMap((group) => group.hooks)) {
      const role = event === 'SessionStart' ? 'orchestrator' : 'reviewer';
      assert.ok(Math.ceil((largestSize(role) * 3) / 4) < hook.additionalContextLimit / 2, `${event}: ${largestSize(role)} 字`);
    }
  }
});

test('marketplace が配るのは plugin のディレクトリーだけで、集計の道具は配らない', () => {
  assert.deepEqual(json(ROOT, '.claude-plugin', 'marketplace.json').plugins.map((plugin) => plugin.source), ['./plugin']);
  assert.deepEqual(json(ROOT, '.agents', 'plugins', 'marketplace.json').plugins.map((plugin) => plugin.source.path), ['./plugin']);
  assert.ok(fs.existsSync(path.join(ROOT, 'tools', 'stats.mjs')));
});

test('編集のたびに検査を回す hook は無い', () => {
  for (const [host, dir] of [['claude', '.claude-plugin'], ['codex', '.codex-plugin']]) {
    const hooks = json(PLUGIN, json(PLUGIN, dir, 'plugin.json').hooks).hooks;
    assert.equal(hooks.PostToolUse, undefined, host);
  }
  assert.equal(fs.existsSync(path.join(PLUGIN, 'src', 'check.mjs')), false);
});

test('スキルとエージェントの定義は、どのホストでも読める形をしている', () => {
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

test('エージェントの文、スタイル、スキルが「〇〇のスキル」と名指すスキルは、すべて配っている', () => {
  const dirs = ['core', 'agents', 'styles/git', 'styles/architecture', ...fs.readdirSync(path.join(PLUGIN, 'skills')).map((name) => `skills/${name}`)];
  const skills = new Set(fs.readdirSync(path.join(PLUGIN, 'skills')));
  const named = new Set();
  for (const dir of dirs) {
    for (const file of fs.readdirSync(path.join(PLUGIN, dir)).filter((name) => name.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(PLUGIN, dir, file), 'utf8');
      for (const [, name] of text.matchAll(/([a-z][a-z0-9-]*) のスキル/g)) named.add(name);
    }
  }
  assert.ok(named.has('architecture'), [...named].join(','));
  for (const name of named) assert.ok(skills.has(name), name);
});

test('プロジェクトに入れる、外す、点検するコマンドは配らない。手順は setup スキルにある', () => {
  for (const file of ['scripts', 'src/install.mjs', 'src/jsontext.mjs']) assert.equal(fs.existsSync(path.join(PLUGIN, file)), false, file);
});

// 入れるときに何を書くかは、インストーラー(cli/)が 1 か所で持つ。setup スキルは、インストーラーを呼ぶ手順と、外すときと点検に
// 要る項目の名前だけを持つので、その名前が manifest、marketplace、インストーラーの指定と食い違わないことを守る。
test('setup スキルが呼ぶインストーラーの名前と指定は、cli/ の定義に合い、書く中身はスキルに持たない', () => {
  const skill = fs.readFileSync(path.join(PLUGIN, 'skills', 'setup', 'SKILL.md'), 'utf8');
  const market = json(ROOT, '.claude-plugin', 'marketplace.json').name;
  assert.equal(json(ROOT, '.agents', 'plugins', 'marketplace.json').name, market);
  const repository = json(PLUGIN, '.claude-plugin', 'plugin.json').repository.replace(/^https:\/\/github\.com\//, '');
  const id = `${NAME}@${market}`;
  assert.ok(skill.includes(`npx ${json(ROOT, 'cli', 'package.json').name} init`));
  const help = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'bin', 'dotagents.mjs'), '--help'], { encoding: 'utf8' }).stdout;
  const flags = new Set(skill.slice(skill.indexOf('## 入れるとき'), skill.indexOf('## 外すとき')).match(/--[a-z]+/g));
  assert.ok(flags.size > 0);
  for (const flag of flags) assert.ok(help.includes(flag), flag);
  assert.doesNotMatch(skill, /```toml|"source": "github"|source_type/, 'ホストの設定に書く中身は、インストーラーが持つ');
  assert.deepEqual([...new Set(skill.match(/\b[\w-]+@[\w-]+\b/g))], [id]);
  assert.ok(skill.includes(`git:github.com/${repository}@`) && skill.includes(`.claude/skills/${NAME}`));
  assert.ok(skill.includes(`[marketplaces.${market}]`));
  for (const names of Object.values(catalog())) for (const name of names) assert.ok(skill.includes(`\`${name}\``), name);
});
