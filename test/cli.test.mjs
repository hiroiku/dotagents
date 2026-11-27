import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../cli/dotagents.mjs';
import { ATTRIBUTES_BEGIN, ATTRIBUTES_END, BODY, codexHooks, GITATTRIBUTES, layout, RECORD } from '../cli/project.mjs';

const CLI = fileURLToPath(new URL('../cli/dotagents.mjs', import.meta.url));

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-cli-')));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: dir }).status, 0);
  return dir;
}

function cli(...argv) {
  let out = '';
  let err = '';
  const status = main(argv, { out: { write: (text) => (out += text) }, err: { write: (text) => (err += text) } });
  return { status, out, err };
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

function files(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else out.push(path.relative(root, file).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

// プロジェクトがもともと持つ設定。タブの字下げ、項目の順、ほかの hook を、sync と remove のあとも保つことを確かめる。
const OWN = {
  '.claude/settings.json': '{\n\t"permissions": {\n\t\t"ask": ["Bash(npm publish)"]\n\t},\n\t"enabledPlugins": {\n\t\t"other@market": true\n\t}\n}\n',
  '.codex/hooks.json': '{\n  "hooks": {\n    "PreToolUse": [\n      { "matcher": "^Bash$", "hooks": [{ "type": "command", "command": "./lint.sh" }] }\n    ]\n  }\n}\n',
  '.agents/hooks.json': '{\n    "team-lint": {\n        "PostToolUse": [{ "matcher": "run_command", "hooks": [{ "type": "command", "command": "./lint.sh" }] }]\n    }\n}\n',
  '.agents/dotagents.jsonc': '{ "decisions": ["決定 A"] }\n',
};

test('sync は、無ければ置き、入口の設定に dotagents の項目だけを足し、ほかの項目と書式を保つ', () => {
  const root = repo();
  for (const [rel, text] of Object.entries(OWN)) write(root, rel, text);
  const result = cli('sync', root);
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /\/hooks/);
  const placed = [...layout().keys()];
  assert.deepEqual(files(root), [...new Set([...placed, RECORD, GITATTRIBUTES, ...Object.keys(OWN)])].sort());
  for (const rel of placed) assert.ok(result.out.includes(rel), rel);
  assert.equal(JSON.parse(read(root, RECORD)).version, JSON.parse(read(root, '.agents/dotagents/.claude-plugin/plugin.json')).version);

  const settings = read(root, '.claude/settings.json');
  assert.ok(settings.startsWith('{\n\t"permissions": {\n\t\t"ask": ["Bash(npm publish)"]\n\t},\n\t"enabledPlugins": {\n\t\t"other@market": true,\n\t\t"dotagents@dotagents-project": true\n\t}'), settings);
  assert.deepEqual(JSON.parse(settings).extraKnownMarketplaces, { 'dotagents-project': { source: { source: 'directory', path: './.agents/dotagents' } } });
  // marketplace の根は本体で、plugin はその根にある。
  const market = JSON.parse(read(root, '.agents/dotagents/.claude-plugin/marketplace.json'));
  assert.deepEqual([market.name, market.plugins[0].name, market.plugins[0].source], ['dotagents-project', 'dotagents', './']);
  const codex = JSON.parse(read(root, '.codex/hooks.json')).hooks;
  assert.equal(codex.PreToolUse[0].hooks[0].command, './lint.sh');
  assert.equal(codex.PreToolUse.length, 2);
  assert.ok(read(root, '.agents/hooks.json').startsWith('{\n    "team-lint": {'));
  assert.deepEqual(Object.keys(JSON.parse(read(root, '.agents/hooks.json'))), ['team-lint', 'dotagents']);
  assert.match(read(root, '.agents/rules/dotagents.md'), /^---\ntrigger: always_on\n/);
  assert.match(read(root, '.agents/skills/dotagents-triage/SKILL.md'), /^---\nname: dotagents-triage$/m);

  // 同じバージョンでもう一度実行しても、何も変えない。
  const before = files(root).map((rel) => [rel, read(root, rel)]);
  const again = cli('sync', root);
  assert.equal(again.status, 0);
  assert.doesNotMatch(again.out, /追加|更新|削除/);
  assert.deepEqual(files(root).map((rel) => [rel, read(root, rel)]), before);

  // remove は、置いたものと dotagents の項目だけを消し、もとの設定を字のとおりに戻す。.agents/dotagents.jsonc は残す。
  const removed = cli('remove', root);
  assert.equal(removed.status, 0, removed.err);
  assert.deepEqual(files(root), Object.keys(OWN).sort());
  for (const [rel, text] of Object.entries(OWN)) assert.equal(read(root, rel), text, rel);
});

test('remove は、dotagents だけが書いた設定ファイルを消し、空になったディレクトリーも消す', () => {
  const root = repo();
  assert.equal(cli('sync', root).status, 0);
  write(root, '.agents/dotagents.jsonc', '{}\n');
  assert.equal(cli('remove', root).status, 0);
  assert.deepEqual(files(root), ['.agents/dotagents.jsonc']);
  assert.equal(exists(root, '.codex'), false);
  assert.equal(exists(root, '.claude'), false);
});

test('sync は、前のバージョンで置いたものを置き直し、新しいバージョンに無いファイルを消す', () => {
  const root = repo();
  assert.equal(cli('sync', root).status, 0);
  // 前のバージョンが置いた状態を作る。記録には、前のバージョンの中身のハッシュが入っている。
  const old = { version: '8.9.0', files: { ...JSON.parse(read(root, RECORD)).files } };
  write(root, '.agents/dotagents/agents/builder.md', '前のバージョンの文\n');
  write(root, '.agents/skills/dotagents-old/SKILL.md', '---\nname: dotagents-old\n---\n');
  write(root, '.agents/dotagents/src/old.mjs', 'export {};\n');
  for (const rel of ['.agents/dotagents/agents/builder.md', '.agents/skills/dotagents-old/SKILL.md', '.agents/dotagents/src/old.mjs']) {
    old.files[rel] = crypto.createHash('sha256').update(read(root, rel)).digest('hex');
  }
  write(root, RECORD, JSON.stringify(old));
  const result = cli('sync', root);
  assert.equal(result.status, 0, result.err);
  assert.match(result.out, /8\.9\.0/);
  assert.equal(read(root, '.agents/dotagents/agents/builder.md'), layout().get('.agents/dotagents/agents/builder.md').toString());
  assert.equal(exists(root, '.agents/skills/dotagents-old'), false);
  assert.equal(exists(root, '.agents/dotagents/src/old.mjs'), false);
  assert.notEqual(JSON.parse(read(root, RECORD)).version, '8.9.0');
});

test('sync は、置いたファイルが手で書き換えられていれば、どのファイルかを示して何も変えずに止まり、--force で上書きする', () => {
  const root = repo();
  assert.equal(cli('sync', root).status, 0);
  write(root, '.agents/dotagents/agents/builder.md', '手で直した\n');
  write(root, '.agents/dotagents/agents/extra.md', '手で足した\n');
  fs.rmSync(path.join(root, '.codex/agents/dotagents-builder.toml'));
  fs.rmSync(path.join(root, '.claude/settings.json'));
  const before = files(root).map((rel) => [rel, read(root, rel)]);
  const stopped = cli('sync', root);
  assert.equal(stopped.status, 1);
  for (const rel of ['.agents/dotagents/agents/builder.md', '.agents/dotagents/agents/extra.md', '.codex/agents/dotagents-builder.toml']) assert.ok(stopped.err.includes(rel), rel);
  assert.ok(stopped.err.includes('--force'));
  assert.deepEqual(files(root).map((rel) => [rel, read(root, rel)]), before);

  const forced = cli('sync', root, '--force');
  assert.equal(forced.status, 0, forced.err);
  assert.equal(read(root, '.agents/dotagents/agents/builder.md'), layout().get('.agents/dotagents/agents/builder.md').toString());
  assert.equal(exists(root, '.agents/dotagents/agents/extra.md'), false);
  assert.ok(exists(root, '.codex/agents/dotagents-builder.toml') && exists(root, '.claude/settings.json'));
});

// 9.1.0 までは、本体に plugin/ の中身をすべて置き(src/ のモジュールと core/ の文も)、hook は本体の src/hook.mjs を呼んでいた。
test('9.1.0 までを置いたリポジトリーで sync すると、もう置かないファイルを消し、hook の組を入口のファイルを呼ぶものに置き換える', () => {
  const root = repo();
  assert.equal(cli('sync', root).status, 0);
  const old = { version: '9.1.0', files: { ...JSON.parse(read(root, RECORD)).files } };
  const legacy = ['.agents/dotagents/src/hook.mjs', '.agents/dotagents/core/design.md', '.agents/dotagents/.codex-plugin/plugin.json', '.agents/dotagents/hosts/codex/hooks.json', '.agents/dotagents/package.json', '.agents/dotagents/README.md'];
  for (const rel of legacy) {
    write(root, rel, `${rel}\n`);
    old.files[rel] = crypto.createHash('sha256').update(read(root, rel)).digest('hex');
  }
  write(root, RECORD, JSON.stringify(old));
  const oldCommand = (event) => `"$(command -v bun || command -v node)" "$(git rev-parse --show-toplevel)/.agents/dotagents/src/hook.mjs" codex ${event}`;
  write(root, '.codex/hooks.json', JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: oldCommand('session') }] }], PreToolUse: [{ matcher: '^Bash$', hooks: [{ type: 'command', command: './lint.sh' }] }, { matcher: '^(Bash|apply_patch)$', hooks: [{ type: 'command', command: oldCommand('tool') }] }] } }, null, 2));
  const result = cli('sync', root);
  assert.equal(result.status, 0, result.err);
  for (const rel of legacy) assert.equal(exists(root, rel), false, rel);
  for (const dir of ['src', 'core', '.codex-plugin', 'hosts/codex']) assert.equal(exists(root, `.agents/dotagents/${dir}`), false, dir);
  const codex = JSON.parse(read(root, '.codex/hooks.json')).hooks;
  assert.deepEqual(codex.SessionStart, codexHooks().SessionStart);
  assert.deepEqual(codex.PreToolUse, [{ matcher: '^Bash$', hooks: [{ type: 'command', command: './lint.sh' }] }, ...codexHooks().PreToolUse]);
  assert.ok(!read(root, '.codex/hooks.json').includes('src/hook.mjs'));
});

// リポジトリーの本体には、Claude Code が plugin として探すものと、hook の入口と schema だけを置く。
test('本体に置くのは、Claude Code が plugin として探すファイルと、hook の入口、schema、記録だけである', () => {
  const root = repo();
  assert.equal(cli('sync', root).status, 0);
  const body = files(root).filter((rel) => rel.startsWith('.agents/dotagents/')).map((rel) => rel.slice('.agents/dotagents/'.length));
  const skills = fs.readdirSync(fileURLToPath(new URL('../plugin/skills', import.meta.url))).filter((name) => !name.startsWith('.')).sort();
  assert.deepEqual(body, [
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    'agents/builder.md',
    'agents/reviewer.md',
    'dotagents.mjs',
    'hosts/claude/hooks.json',
    'placed.json',
    'schema/dotagents.schema.json',
    ...skills.map((name) => `skills/${name}/SKILL.md`),
  ].sort());
  assert.ok(BODY.includes('dotagents.mjs'));
});

// 置いたファイルは、GitHub で生成物として扱う。.gitattributes のほかの行には触れない。
test('sync は .gitattributes に、置いたファイルを生成物とする行を区画にまとめて書き、remove はその区画だけを外す', () => {
  const generated = (text) => text.split('\n').filter((line) => line.endsWith(' linguist-generated=true')).map((line) => line.slice(0, -' linguist-generated=true'.length));
  // 無いリポジトリーでは作り、remove で消す。
  const none = repo();
  assert.equal(cli('sync', none).status, 0);
  const created = read(none, GITATTRIBUTES);
  assert.ok(created.startsWith(`${ATTRIBUTES_BEGIN}\n`) && created.endsWith(`\n${ATTRIBUTES_END}\n`), created);
  const outside = [...layout().keys()].filter((rel) => !rel.startsWith('.agents/dotagents/'));
  assert.deepEqual(generated(created), ['.agents/dotagents/**', ...outside.sort()]);
  for (const rel of ['.codex/agents/dotagents-builder.toml', '.agents/skills/dotagents-triage/SKILL.md', '.agents/agents/dotagents-reviewer.md', '.agents/rules/dotagents.md']) assert.ok(generated(created).includes(rel), rel);
  assert.ok(!cli('sync', none).out.includes(GITATTRIBUTES), '2 回目は変えない');
  assert.equal(cli('remove', none).status, 0);
  assert.equal(exists(none, GITATTRIBUTES), false);

  // あるリポジトリーでは、ほかの行を保って末尾に足し、remove で元の字のとおりに戻す。改行の形も保つ。
  for (const own of ['*.png binary\ndocs/** linguist-documentation\n', '* text=auto eol=lf\r\n*.sh text eol=lf\r\n']) {
    const root = repo();
    write(root, GITATTRIBUTES, own);
    const result = cli('sync', root);
    assert.equal(result.status, 0, result.err);
    assert.ok(result.out.includes(GITATTRIBUTES));
    const text = read(root, GITATTRIBUTES);
    const eol = own.includes('\r\n') ? '\r\n' : '\n';
    assert.ok(text.startsWith(`${own}${eol}${ATTRIBUTES_BEGIN}${eol}`), JSON.stringify(text));
    assert.ok(text.endsWith(`${ATTRIBUTES_END}${eol}`));
    // 区画の後ろに利用者が足した行も、置き直しと remove のあとに残る。
    write(root, GITATTRIBUTES, `${text}*.lock -diff${eol}`);
    assert.equal(cli('sync', root).status, 0);
    assert.equal(read(root, GITATTRIBUTES), `${text}*.lock -diff${eol}`);
    assert.equal(cli('remove', root).status, 0);
    assert.equal(read(root, GITATTRIBUTES), `${own}${eol}*.lock -diff${eol}`);
  }
  const plain = repo();
  write(plain, GITATTRIBUTES, '*.png binary\n');
  assert.equal(cli('sync', plain).status, 0);
  assert.equal(cli('remove', plain).status, 0);
  assert.equal(read(plain, GITATTRIBUTES), '*.png binary\n');

  // 区画の始まりと終わりがそろっていなければ、どこまでが dotagents の行か分からないので、何も変えずに止まる。
  for (const broken of [`${ATTRIBUTES_BEGIN}\n*.png binary\n`, `*.png binary\n${ATTRIBUTES_END}\n`, `${ATTRIBUTES_BEGIN}\n${ATTRIBUTES_END}\n${ATTRIBUTES_BEGIN}\n${ATTRIBUTES_END}\n`]) {
    const root = repo();
    write(root, GITATTRIBUTES, broken);
    const result = cli('sync', root);
    assert.equal(result.status, 1, broken);
    assert.ok(result.err.includes(GITATTRIBUTES));
    assert.deepEqual(files(root), [GITATTRIBUTES]);
  }
});

test('sync は、入口の設定ファイルが JSON として読めなければ、何も変えずに止まる', () => {
  for (const rel of ['.claude/settings.json', '.codex/hooks.json', '.agents/hooks.json']) {
    const root = repo();
    write(root, rel, '{ "a": 1, }\n');
    const result = cli('sync', root);
    assert.equal(result.status, 1, rel);
    assert.ok(result.err.includes(rel), rel);
    assert.deepEqual(files(root), [rel]);
  }
  const root = repo();
  write(root, '.codex/hooks.json', '{ "hooks": [] }\n');
  assert.equal(cli('sync', root).status, 1);
  assert.deepEqual(files(root), ['.codex/hooks.json']);
});

// 設定ファイルの $schema は、置いた本体の schema を指す。master の URL は、置いたバージョンとずれ、push の前には読めない。
test('sync は、設定ファイルの $schema を置いた本体の schema に向け、コメントと書式を保つ。remove は相対パスの $schema を外す', () => {
  const RELATIVE = './dotagents/schema/dotagents.schema.json';
  const DECLARATION = '.agents/dotagents.jsonc';
  // 無ければ、$schema だけを持つファイルを作る。作ったままなら、remove がファイルごと消す。
  const none = repo();
  assert.equal(cli('sync', none).status, 0);
  assert.deepEqual(JSON.parse(read(none, DECLARATION)), { $schema: RELATIVE });
  assert.ok(exists(none, `.agents/${RELATIVE}`), '相対パスの先に schema がある');
  assert.equal(cli('remove', none).status, 0);
  assert.deepEqual(files(none), []);

  const cases = [
    // 無いときは、最初の項目の前に、同じ字下げで足す。
    ['{\n    // 決定\n    "decisions": ["a"], // 行末の注釈\n}\n', `{\n    // 決定\n    "$schema": "${RELATIVE}",\n    "decisions": ["a"], // 行末の注釈\n}\n`],
    // このリポジトリーの schema の URL は、その 1 行の値だけを書き換える。
    ['{\n\t/* 先頭 */\n\t"$schema": "https://raw.githubusercontent.com/hiroiku/dotagents/master/plugin/schema/dotagents.schema.json",\n\t"protected": ["staging"]\n}\n', `{\n\t/* 先頭 */\n\t"$schema": "${RELATIVE}",\n\t"protected": ["staging"]\n}\n`],
    // ほかを指していれば変えない。
    ['{ "$schema": "https://example.com/my.schema.json", "decisions": [] }\n', null],
  ];
  for (const [before, after] of cases) {
    const root = repo();
    write(root, DECLARATION, before);
    const result = cli('sync', root);
    assert.equal(result.status, 0, result.err);
    assert.equal(read(root, DECLARATION), after ?? before);
    assert.equal(result.out.includes(DECLARATION), after !== null, before);
    // 2 回目は変えない。
    assert.ok(!cli('sync', root).out.includes(DECLARATION));
    // remove は、相対パスの $schema だけを外し、ほかの行は残す。
    assert.equal(cli('remove', root).status, 0);
    if (after === null) assert.equal(read(root, DECLARATION), before);
    else {
      const removed = read(root, DECLARATION);
      assert.ok(!removed.includes('$schema'), removed);
      assert.deepEqual(removed.split('\n').filter((line) => !line.includes('$schema')), after.split('\n').filter((line) => !line.includes('$schema')));
    }
  }
});

// decisions は 9.1.0 で非推奨(10.0.0 で読まなくなる)。AGENTS.md は利用者の指示ファイルなので、sync は案内だけを出し、書き換えない。
test('sync は、設定ファイルに decisions が残っていれば、AGENTS.md に貼れる形で移す案内を出し、AGENTS.md を書き換えない', () => {
  const root = repo();
  const agents = '# 既存の指示\n\n- 既存の決めごと\n';
  write(root, 'AGENTS.md', agents);
  write(root, '.agents/dotagents.jsonc', '{ // 注釈\n  "decisions": ["決定 A。理由 A。", "決定 B\\n続き", "", 1],\n}\n');
  for (const times of [1, 2]) {
    const result = cli('sync', root);
    assert.equal(result.status, 0, result.err);
    assert.match(result.out, /decisions は非推奨です。[^\n]*10\.0\.0 で読まれなくなります。[^\n]*AGENTS\.md に書いてください。/, `${times} 回目`);
    assert.ok(result.out.includes('\n## 決定事項\n\n- 決定 A。理由 A。\n- 決定 B\n  続き\n'), `${times} 回目\n${result.out}`);
    assert.equal(read(root, 'AGENTS.md'), agents);
  }
  // 変えるファイルが無いときも出す。
  assert.match(cli('sync', root).out, /変えるファイルはありません[\s\S]*## 決定事項/);
  // AGENTS.md が無いプロジェクトにも、作らない。
  const bare = repo();
  write(bare, '.agents/dotagents.jsonc', '{ "decisions": ["決定 A"] }\n');
  assert.equal(cli('sync', bare).status, 0);
  assert.ok(!exists(bare, 'AGENTS.md'));
  // 無い、空、読めないときは、案内を出さない。
  for (const text of [null, '{ "decisions": [] }\n', '{ "protected": ["staging"] }\n', '{ "decisions": ["a", ,] }']) {
    const other = repo();
    if (text !== null) write(other, '.agents/dotagents.jsonc', text);
    const result = cli('sync', other);
    assert.equal(result.status, 0, result.err);
    assert.doesNotMatch(result.out, /非推奨|決定事項/, String(text));
  }
});

// 8.x までは、プロジェクトの設定に GitHub のこのリポジトリーを marketplace として入れる参照を書いていた。残ると、置いたものと両方が有効になる。
test('sync は、GitHub のこのリポジトリーを指す古い参照を、名前によらず外し、ほかの項目と書式を保つ。remove は戻さない', () => {
  const root = repo();
  write(root, '.claude/settings.json', [
    '{',
    '    "permissions": { "allow": [] },',
    '    "extraKnownMarketplaces": {',
    '        "team": { "source": { "source": "github", "repo": "acme/tools" } },',
    '        "dots": { "source": { "source": "git", "url": "git@github.com:hiroiku/dotagents.git" }, "autoUpdate": true }',
    '    },',
    '    "enabledPlugins": {',
    '        "lint@team": true,',
    '        "dotagents@dots": true',
    '    }',
    '}',
    '',
  ].join('\n'));
  const head = 'model = "o3"\n\n# チームの marketplace\n[marketplaces.team]\nsource_type = "git"\nsource = "https://example.com/team.git"\n';
  const tail = '\n[plugins."lint@team"]\nenabled = true\n';
  write(root, '.codex/config.toml', [
    head,
    '[marketplaces.dotagents]',
    'source_type = "git"',
    'source = "https://github.com/hiroiku/dotagents.git"',
    'note = """利用者が表に足した行',
    '[plugins."x@y"]',
    '"""',
    '# 表の後ろの注釈',
    '',
    '[plugins."dotagents@dotagents"]',
    'enabled = true',
    tail,
  ].join('\n'));
  const result = cli('sync', root);
  assert.equal(result.status, 0, result.err);
  for (const item of ['extraKnownMarketplaces の dots', 'enabledPlugins の dotagents@dots', '[marketplaces.dotagents]', '[plugins."dotagents@dotagents"]']) assert.ok(result.out.includes(item), item);

  const settings = read(root, '.claude/settings.json');
  assert.ok(settings.startsWith('{\n    "permissions": { "allow": [] },\n    "extraKnownMarketplaces": {\n        "team": { "source": { "source": "github", "repo": "acme/tools" } },\n'), settings);
  assert.deepEqual(Object.keys(JSON.parse(settings).extraKnownMarketplaces), ['team', 'dotagents-project']);
  assert.deepEqual(JSON.parse(settings).enabledPlugins, { 'lint@team': true, 'dotagents@dotagents-project': true });
  assert.equal(read(root, '.codex/config.toml'), `${head}# 表の後ろの注釈\n${tail}`);

  assert.equal(cli('remove', root).status, 0);
  assert.deepEqual(JSON.parse(read(root, '.claude/settings.json')).extraKnownMarketplaces, { team: { source: { source: 'github', repo: 'acme/tools' } } });
  assert.equal(read(root, '.codex/config.toml'), `${head}# 表の後ろの注釈\n${tail}`);
});

test('sync は、古い参照があるかを .codex/config.toml の形から判断できなければ、何も変えずに止まる', () => {
  for (const text of ['[marketplaces.dotagents]\nsource = """\nhiroiku/dotagents\n', 'marketplaces = { dotagents = { source = "hiroiku/dotagents" } }\n', '[marketplaces.dotagents\nsource = "hiroiku/dotagents"\n']) {
    const root = repo();
    write(root, '.codex/config.toml', text);
    const result = cli('sync', root);
    assert.equal(result.status, 1, text);
    assert.ok(result.err.includes('.codex/config.toml'), text);
    assert.deepEqual(files(root), ['.codex/config.toml']);
    assert.equal(read(root, '.codex/config.toml'), text);
  }
});

test('置く場所は git のリポジトリーのルートに限り、知らないコマンドは使い方を示す', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'sub'));
  assert.equal(cli('sync', path.join(root, 'sub')).status, 1);
  assert.equal(cli('sync', fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-nogit-'))).status, 1);
  assert.deepEqual(files(root), []);
  assert.equal(cli('install', root).status, 2);
  assert.equal(cli('sync', root, '--yes').status, 2);
  assert.deepEqual(files(root), []);
});

// ---------------------------------------------------------------- 置いたものから動く hook

// 置いたあとのプロジェクトで、各ホストの入口に書いたコマンドを、ホストと同じようにシェルで動かす。
// Codex はサブディレクトリーから始まることがあり、Antigravity は hook の cwd が分からないので、サブディレクトリーで動かす。
function placedProject() {
  const root = repo();
  write(root, '.agents/dotagents.jsonc', JSON.stringify({ decisions: ['決定 A'] }));
  assert.equal(cli('sync', root).status, 0);
  fs.mkdirSync(path.join(root, 'packages', 'app'), { recursive: true });
  return { root, sub: path.join(root, 'packages', 'app'), codexHome: fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-codex-')) };
}

function shell(command, input, { cwd, env = {}, codexHome }) {
  const result = spawnSync('sh', ['-c', command], { cwd, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

const RELEASE = 'gh release create v1';

test('置いたものから、Claude Code、Codex、Antigravity の hook が動く', () => {
  const project = placedProject();
  const { root, sub, codexHome } = project;
  const options = { cwd: sub, codexHome };

  // Claude Code は、本体を plugin として読み、${CLAUDE_PLUGIN_ROOT} に本体の場所を渡す。
  const claude = JSON.parse(read(root, '.agents/dotagents/hosts/claude/hooks.json')).hooks;
  const claudeEnv = { ...options, env: { CLAUDE_PLUGIN_ROOT: path.join(root, '.agents/dotagents') } };
  const claudeSession = shell(claude.SessionStart[0].hooks[0].command, { cwd: sub, hook_event_name: 'SessionStart', source: 'startup' }, claudeEnv);
  assert.match(claudeSession.hookSpecificOutput.additionalContext, /決定 A/);
  // スキルは、ホストで見える名前で指す。Claude Code は plugin のスキル、Codex と Antigravity は .agents/skills/ に置いたスキル。
  assert.ok(claudeSession.hookSpecificOutput.additionalContext.includes('`dotagents:releases`'));
  assert.ok(claudeSession.hookSpecificOutput.additionalContext.includes(path.join(root, '.agents/dotagents/schema/dotagents.schema.json')));
  assert.equal(shell(claude.PreToolUse[0].hooks[0].command, { cwd: sub, tool_name: 'Bash', tool_input: { command: RELEASE } }, claudeEnv).hookSpecificOutput.permissionDecision, 'ask');

  const codex = JSON.parse(read(root, '.codex/hooks.json')).hooks;
  const codexSession = shell(codex.SessionStart[0].hooks[0].command, { cwd: sub, hook_event_name: 'SessionStart' }, options).hookSpecificOutput.additionalContext;
  assert.match(codexSession, /決定 A/);
  assert.ok(codexSession.includes('`dotagents-releases`') && exists(root, '.agents/skills/dotagents-releases/SKILL.md'));
  assert.equal(shell(codex.PreToolUse[0].hooks[0].command, { cwd: sub, tool_name: 'Bash', tool_input: { command: RELEASE } }, options).hookSpecificOutput.permissionDecision, 'deny');
  // リポジトリーに置いたときは、エージェントの定義を利用者の設定(~/.codex/agents/)に書かない。
  assert.deepEqual(fs.readdirSync(codexHome), []);

  const antigravity = JSON.parse(read(root, '.agents/hooks.json')).dotagents;
  const common = { conversationId: 'c1', workspacePaths: [root] };
  const antigravitySession = shell(antigravity.SessionStart[0].command, common, options).injectSteps[0].systemMessage.systemMessage;
  assert.match(antigravitySession, /決定 A/);
  assert.ok(antigravitySession.includes('`dotagents-releases`'));
  assert.equal(shell(antigravity.PreToolUse[0].hooks[0].command, { ...common, toolCall: { name: 'run_command', args: { CommandLine: RELEASE, Cwd: sub } } }, options).decision, 'force_ask');
});

test('CLI は、npx が起こすのと同じく、リンクからコマンドとして動く', () => {
  const root = repo();
  const bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-bin-')), 'dotagents');
  fs.symlinkSync(CLI, bin);
  const result = spawnSync(process.execPath, [bin, 'sync'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(exists(root, RECORD));
});
