import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { layout, PLUGIN_ID } from '../cli/project.mjs';
import { contextFor, standingSize } from '../plugin/src/context.mjs';
import { codexAgent, roles } from '../plugin/src/roles.mjs';
import { NAMING, namingFor, SKILL_REF, skillNames } from '../plugin/src/skills.mjs';
import { build as buildAntigravity } from '../tools/antigravity.mjs';

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
        assert.match(hook.command, new RegExp(` ${host} (session|subagent|tool)$`));
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
      // サブエージェントの開始では、いちばん長いサブエージェントの文で確かめる。
      const size = event === 'SessionStart' ? standingSize('orchestrator') : Math.max(...['builder', 'reviewer', 'worker'].map(standingSize));
      assert.ok(Math.ceil((size * 3) / 4) < hook.additionalContextLimit / 2, `${event}: ${size} 字`);
    }
  }
});

test('marketplace が配るのは plugin のディレクトリーだけである', () => {
  assert.deepEqual(json(ROOT, '.claude-plugin', 'marketplace.json').plugins.map((plugin) => plugin.source), ['./plugin']);
  assert.deepEqual(json(ROOT, '.agents', 'plugins', 'marketplace.json').plugins.map((plugin) => plugin.source.path), ['./plugin']);
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
  const agent = codexAgent(roles()[0], 'plugin');
  assert.equal(agent.file, 'dotagents-builder.toml');
  assert.match(agent.content, /^# dotagents が生成したファイル。[^\n]*\nname = "dotagents-builder"\ndescription = ".+"\ndeveloper_instructions = ".+"\n$/);
  assert.doesNotMatch(agent.content, /^model/m, 'モデルは利用者の Codex の設定に従う');
});

// 文はスキルを Claude Code の plugin での名前(`dotagents:<スキル>`)で書き、ほかのホストに渡すときにそのホストでの名前に置き換える。
const SOURCE_DIRS = () => ['core', 'agents', ...fs.readdirSync(path.join(PLUGIN, 'skills')).map((name) => `skills/${name}`)];
const sourceTexts = () => SOURCE_DIRS().flatMap((dir) => fs.readdirSync(path.join(PLUGIN, dir)).filter((name) => name.endsWith('.md')).map((file) => [`${dir}/${file}`, fs.readFileSync(path.join(PLUGIN, dir, file), 'utf8')]));
// 「`名前` のスキル」と書かれた名前。
const named = (text) => [...text.matchAll(/`([^`\s]+)` のスキル/g)].map(([, name]) => name);

test('文は、スキルを決まった書き方だけで指し、指すスキルはすべて配っている', () => {
  const skills = new Set(skillNames());
  const refs = new Set();
  for (const [file, text] of sourceTexts()) {
    assert.doesNotMatch(text.replace(SKILL_REF, ''), /[a-z][a-z0-9-]*`? ?のスキル/, `${file}: スキルは \`dotagents:<スキル>\` と書く`);
    for (const [, name] of text.matchAll(SKILL_REF)) refs.add(name);
  }
  assert.ok(refs.has('architecture'), [...refs].join(','));
  for (const name of refs) assert.ok(skills.has(name), name);
});

test('ホストに渡す文は、スキルをそのホストで見える名前で指す', () => {
  const expect = (naming, text, where) => {
    const names = named(text);
    for (const name of names) assert.ok(skillNames().map(NAMING[naming]).includes(name), `${where}: ${name}`);
    if (naming !== 'plugin') assert.doesNotMatch(text, SKILL_REF, where);
    return names.length;
  };
  let seen = 0;
  // hook が入れる文(個人の環境の plugin)。
  for (const host of ['claude', 'codex', 'antigravity']) seen += expect(namingFor(host, false), contextFor({ role: 'orchestrator', cwd: os.tmpdir(), host }), host);
  // Antigravity の plugin の生成物。
  for (const [file, text] of buildAntigravity()) if (file.endsWith('.md') && !file.startsWith('core/')) seen += expect('bare', text, `antigravity/${file}`);
  // リポジトリーに置くファイル。どのホストも、dotagents-<スキル> の名前で置いたスキルを読む。
  for (const [file, content] of layout()) {
    if (!file.endsWith('.md') && !file.endsWith('.toml')) continue;
    seen += expect('placed', content.toString('utf8'), file);
  }
  assert.ok(seen > 0);
});

// プロジェクトに置く、外すコマンドは、npm のパッケージの CLI(cli/)が持つ。ホストが読む plugin には入れない。
test('plugin にはプロジェクトに置くコマンドを入れず、パッケージは CLI と plugin だけを配る', () => {
  for (const file of ['scripts', 'cli', 'src/install.mjs', 'src/jsontext.mjs']) assert.equal(fs.existsSync(path.join(PLUGIN, file)), false, file);
  assert.equal(fs.existsSync(path.join(PLUGIN, 'skills', 'setup')), false);
  const pkg = json(ROOT, 'package.json');
  assert.deepEqual(pkg.files, ['cli/', 'plugin/']);
  for (const bin of Object.values(pkg.bin)) assert.ok(fs.existsSync(path.join(ROOT, bin)), bin);
});

// README は、plugin の入れ方と外し方を手順として持つ。そこに書く名前が、manifest、marketplace の定義、パッケージ、
// CLI がリポジトリーに書く名前と食い違わないことを守る。
test('README に書く plugin とパッケージの名前と置き場は、manifest、marketplace の定義、CLI に合う', () => {
  const market = json(ROOT, '.claude-plugin', 'marketplace.json').name;
  assert.equal(json(ROOT, '.agents', 'plugins', 'marketplace.json').name, market);
  const repository = json(PLUGIN, '.claude-plugin', 'plugin.json').repository.replace(/^https:\/\/github\.com\//, '');
  const id = `${NAME}@${market}`;
  const npx = `npx ${json(ROOT, 'package.json').name}@latest`;
  for (const file of ['README.md', 'docs/README.ja.md']) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(text.includes(`claude plugin uninstall ${id}`) && text.includes(`codex plugin add ${id}`), file);
    assert.ok(text.includes(`marketplace add ${repository}`), file);
    assert.ok(text.includes(`[marketplaces.${market}]`) && text.includes(`[plugins."${id}"]`), file);
    assert.ok(text.includes(`${npx} sync`) && text.includes(`${npx} remove`), file);
    assert.ok(text.includes(PLUGIN_ID), file);
    assert.deepEqual([...new Set(text.replaceAll(npx, '').match(/\b[\w-]+@[\w-]+\b/g))].sort(), [id, PLUGIN_ID].sort(), file);
  }
});
