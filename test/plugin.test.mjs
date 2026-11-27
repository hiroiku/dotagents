import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { standingSize } from '../plugin/src/context.mjs';
import { codexAgent, roles } from '../plugin/src/roles.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLUGIN = path.join(ROOT, 'plugin');
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));
const NAME = json(PLUGIN, '.claude-plugin', 'plugin.json').name;

test('ホストごとの定義は、同じ名前と版を持つ', () => {
  // 版を上げるときは、この 4 か所をそろえ、node tools/antigravity.mjs で Antigravity の manifest を作り直す。
  const manifests = [json(PLUGIN, '.claude-plugin', 'plugin.json'), json(PLUGIN, '.codex-plugin', 'plugin.json'), json(PLUGIN, 'package.json'), json(ROOT, 'antigravity', 'plugin.json'), json(ROOT, 'package.json')];
  assert.deepEqual([...new Set(manifests.map((manifest) => manifest.version))].length, 1);
  for (const manifest of manifests.slice(0, 4)) assert.equal(manifest.name, NAME);
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

// ホストは、時間切れになった hook を理由を返さずに打ち切る。チェックは、その手前で自分から止まって理由を返す。
test('セッションの開始の知らせは、始まり方を選ばずに受ける', () => {
  // 開き直し(resume)を外すと、ハーネスを入れる前や、前の版のころに始まったセッションを開き直しても、いまの文が届かない。
  for (const host of ['claude', 'codex']) {
    for (const entry of json(PLUGIN, 'hosts', host, 'hooks.json').hooks.SessionStart) {
      for (const source of ['startup', 'resume', 'clear', 'compact']) assert.ok(!entry.matcher || new RegExp(entry.matcher).test(source), `${host}: ${source}`);
    }
  }
});

// Codex は、hook が返した文がこの値(バイト数を 4 で割って切り上げた数)を超えると、先頭と末尾の抜粋だけを渡す。
// 日本語は 1 字 3 バイトなので、常設の文が、字数の 3/4 で収まることを確かめる。
test('Codex の hook は、常設の文を切らずに渡す', () => {
  for (const event of ['SessionStart', 'SubagentStart']) {
    for (const hook of json(PLUGIN, 'hosts', 'codex', 'hooks.json').hooks[event].flatMap((group) => group.hooks)) {
      const role = event === 'SessionStart' ? 'orchestrator' : 'reviewer';
      assert.ok(Math.ceil((standingSize(role) * 3) / 4) < hook.additionalContextLimit / 2, `${event}: ${standingSize(role)} 字`);
    }
  }
});

test('marketplace が配るのは plugin のディレクトリーだけで、集計の道具は配らない', () => {
  assert.deepEqual(json(ROOT, '.claude-plugin', 'marketplace.json').plugins.map((plugin) => plugin.source), ['./plugin']);
  assert.deepEqual(json(ROOT, '.agents', 'plugins', 'marketplace.json').plugins.map((plugin) => plugin.source.path), ['./plugin']);
  assert.ok(fs.existsSync(path.join(ROOT, 'tools', 'stats.mjs')));
});

test('編集のたびにチェックを回す hook は無い', () => {
  for (const [host, dir] of [['claude', '.claude-plugin'], ['codex', '.codex-plugin']]) {
    const hooks = json(PLUGIN, json(PLUGIN, dir, 'plugin.json').hooks).hooks;
    assert.equal(hooks.PostToolUse, undefined, host);
  }
  assert.equal(json(PLUGIN, 'hosts', 'antigravity', 'hooks.json').dotagents.PostToolUse, undefined, 'antigravity');
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

test('常設の文、エージェントの文、スキルが「〇〇のスキル」と名指すスキルは、すべて配っている', () => {
  const dirs = ['core', 'agents', ...fs.readdirSync(path.join(PLUGIN, 'skills')).map((name) => `skills/${name}`)];
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

// setup スキルは、plugin の入れ方、外し方、8.x の残りの消し方を手順として持つ。そこに書く名前が、manifest と marketplace の定義と
// 食い違わないことを守る。インストーラーは無いので、スキルがインストーラーを呼ぶ手順を持たないことも守る。
test('setup スキルに書く plugin の名前と置き場は、manifest と marketplace の定義に合い、インストーラーを呼ばない', () => {
  const skill = fs.readFileSync(path.join(PLUGIN, 'skills', 'setup', 'SKILL.md'), 'utf8');
  const market = json(ROOT, '.claude-plugin', 'marketplace.json').name;
  assert.equal(json(ROOT, '.agents', 'plugins', 'marketplace.json').name, market);
  const repository = json(PLUGIN, '.claude-plugin', 'plugin.json').repository.replace(/^https:\/\/github\.com\//, '');
  const id = `${NAME}@${market}`;
  assert.doesNotMatch(skill, /npx |インストーラー/);
  assert.equal(fs.existsSync(path.join(ROOT, 'cli')), false);
  assert.ok(skill.includes(`claude plugin install ${id}`) && skill.includes(`codex plugin add ${id}`));
  assert.ok(skill.includes(`marketplace add ${repository}`));
  assert.deepEqual([...new Set(skill.match(/\b[\w-]+@[\w-]+\b/g))], [id]);
  assert.ok(skill.includes(`git:github.com/${repository}@`) && skill.includes(`.claude/skills/${NAME}`));
  assert.ok(skill.includes(`[marketplaces.${market}]`));
});
