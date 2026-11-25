import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { largestSize } from '../plugin/src/context.mjs';
import { codexAgent, roles } from '../plugin/src/roles.mjs';
import { NAME, doctor, install, uninstall } from '../plugin/scripts/dotagents.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLUGIN = path.join(ROOT, 'plugin');
const json = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));

test('ホストごとの定義は、同じ名前と版を持つ', () => {
  const manifests = [json(PLUGIN, '.claude-plugin', 'plugin.json'), json(PLUGIN, '.codex-plugin', 'plugin.json'), json(PLUGIN, 'package.json'), json(ROOT, 'package.json')];
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
// 日本語は 1 字 3 バイトなので、どの流を選んだときの文も、字数の 3/4 で収まることを確かめる。
test('Codex の hook は、どの流を選んだときの文も切らずに渡す', () => {
  for (const event of ['SessionStart', 'SubagentStart']) {
    for (const hook of json(PLUGIN, 'hosts', 'codex', 'hooks.json').hooks[event].flatMap((group) => group.hooks)) {
      const role = event === 'SessionStart' ? 'lead' : 'reviewer';
      assert.ok(Math.ceil((largestSize(role) * 3) / 4) < hook.additionalContextLimit / 2, `${event}: ${largestSize(role)} 字`);
    }
  }
});

test('marketplace が配るのは plugin のディレクトリーだけで、集計の道具は配らない', () => {
  assert.deepEqual(json(ROOT, '.claude-plugin', 'marketplace.json').plugins.map((plugin) => plugin.source), ['./plugin']);
  assert.deepEqual(json(ROOT, '.agents', 'plugins', 'marketplace.json').plugins.map((plugin) => plugin.source.path), ['./plugin']);
  assert.ok(fs.existsSync(path.join(ROOT, 'tools', 'stats.mjs')));
  assert.doesNotMatch(fs.readFileSync(path.join(PLUGIN, 'scripts', 'dotagents.mjs'), 'utf8'), /stats/);
});

test('編集のたびに検査を回す hook は無い', () => {
  for (const [host, dir] of [['claude', '.claude-plugin'], ['codex', '.codex-plugin']]) {
    const hooks = json(PLUGIN, json(PLUGIN, dir, 'plugin.json').hooks).hooks;
    assert.equal(hooks.PostToolUse, undefined, host);
  }
  assert.equal(fs.existsSync(path.join(PLUGIN, 'src', 'check.mjs')), false);
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

const toml = (dir) => fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');

function existing() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.mkdirSync(path.join(dir, '.codex'));
  fs.mkdirSync(path.join(dir, '.pi'));
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, enabledPlugins: { 'other@market': true } }));
  fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), 'model = "x"\n\n[plugins."other@market"]\nenabled = true\n');
  // 8.x が Pi に書いた、版を固定した package の行。利用者が自分で書いた行は残す。
  fs.writeFileSync(path.join(dir, '.pi', 'settings.json'), JSON.stringify({ theme: 'dark', packages: ['npm:@example/tools', 'git:github.com/hiroiku/dotagents@v8.0.5', 'git:github.com/hiroiku/dotagents'] }));
  return dir;
}

test('参照で入れると、各ホストのプロジェクトの設定に版を固定しない参照を書き、ほかの設定には触れない。外すと元に戻る', () => {
  const dir = existing();
  const before = { claude: json(dir, '.claude', 'settings.json'), codex: toml(dir) };
  const result = install(dir, { style: { git: 'trunk' } });
  assert.equal(result.each.length, 2);
  const settings = json(dir, '.claude', 'settings.json');
  assert.deepEqual(settings.permissions, before.claude.permissions);
  assert.equal(settings.enabledPlugins['other@market'], true);
  assert.equal(settings.enabledPlugins['dotagents@dotagents'], true);
  assert.deepEqual(settings.extraKnownMarketplaces.dotagents.source, { source: 'github', repo: 'hiroiku/dotagents' });
  assert.match(toml(dir), /^model = "x"\n\n\[plugins\."other@market"\]\nenabled = true\n/);
  assert.match(toml(dir), /\[marketplaces\.dotagents\]\nsource_type = "git"\nsource = "https:\/\/github\.com\/hiroiku\/dotagents\.git"\n/);
  assert.doesNotMatch(toml(dir), /ref =/);
  // 9.0.0 は Pi に入れない。8.x が書いた行だけを消す。
  assert.deepEqual(json(dir, '.pi', 'settings.json'), { theme: 'dark', packages: ['npm:@example/tools', 'git:github.com/hiroiku/dotagents'] });
  assert.deepEqual(json(dir, '.agents', 'dotagents.json'), { style: { git: 'trunk' } });
  // 入れ直しても、同じものが 2 つにならない。
  install(dir);
  assert.equal(toml(dir).match(/\[marketplaces\.dotagents\]/g).length, 1);
  assert.equal(fs.existsSync(path.join(dir, '.agents', 'plugins')), false, '写しは置かない');
  uninstall(dir);
  assert.deepEqual(json(dir, '.claude', 'settings.json'), before.claude);
  assert.equal(toml(dir), before.codex);
  assert.deepEqual(json(dir, '.pi', 'settings.json'), { theme: 'dark', packages: ['npm:@example/tools', 'git:github.com/hiroiku/dotagents'] });
  assert.deepEqual(json(dir, '.agents', 'dotagents.json'), { style: { git: 'trunk' } }, '宣言は残す');
});

test('入れるときに選んだ流を宣言に書き、知らない流は書かずに止める。プロジェクトに検査の道具は置かない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify({ decisions: ['a'], style: { git: 'trunk' } }));
  assert.throws(() => install(dir, { style: { git: 'gitflow' } }), /gitflow という流は無い/);
  assert.throws(() => install(dir, { style: { git: 'develop-master' } }), /develop-master という流は無い/);
  install(dir, { style: { architecture: 'layered' } });
  assert.deepEqual(json(dir, '.agents', 'dotagents.json'), { decisions: ['a'], style: { git: 'trunk', architecture: 'layered' } });
  assert.equal(fs.existsSync(path.join(dir, 'scripts')), false);
});

test('入れ方は参照だけで、写して入れる道具は無い', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  for (const command of ['vendor', 'unvendor']) {
    const result = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', 'dotagents.mjs'), command, dir], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, command);
    assert.match(`${result.stdout}${result.stderr}`, /使い方/);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('8.x が Pi の設定に書いた package の行は、外すときにも消し、点検で知らせる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-pi-'));
  fs.mkdirSync(path.join(dir, '.pi'));
  fs.writeFileSync(path.join(dir, '.pi', 'settings.json'), JSON.stringify({ packages: ['git:github.com/hiroiku/dotagents@v8.0.5', 'npm:@example/tools'] }));
  assert.match(doctor(dir, { remote: false }).map((entry) => `${entry.level}: ${entry.text}`).join('\n'), /warn: 8\.x が Pi の設定/);
  uninstall(dir);
  assert.deepEqual(json(dir, '.pi', 'settings.json'), { packages: ['npm:@example/tools'] });
  assert.doesNotMatch(doctor(dir, { remote: false }).map((entry) => entry.text).join('\n'), /Pi/);
});

test('読めない設定は書き換えずに止め、関係の無い設定は外すときにも書き直さない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), '{ "permissions": { // 手で書いた\n} }');
  assert.throws(() => install(dir), /JSON として読めない/);
  assert.equal(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), '{ "permissions": { // 手で書いた\n} }');
  const tidy = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  fs.mkdirSync(path.join(tidy, '.codex'));
  fs.mkdirSync(path.join(tidy, '.pi'));
  fs.writeFileSync(path.join(tidy, '.codex', 'config.toml'), 'model = "x"\n\n\n\n[a]\nb = 1');
  fs.writeFileSync(path.join(tidy, '.pi', 'settings.json'), '{"theme":"dark"}');
  uninstall(tidy);
  assert.equal(fs.readFileSync(path.join(tidy, '.codex', 'config.toml'), 'utf8'), 'model = "x"\n\n\n\n[a]\nb = 1');
  assert.equal(fs.readFileSync(path.join(tidy, '.pi', 'settings.json'), 'utf8'), '{"theme":"dark"}');
  assert.equal(fs.existsSync(path.join(tidy, '.claude')), false);
});

// ディレクトリーの中のファイルと中身。8.x の写しの中身は数えない。
function snapshot(dir) {
  const files = {};
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name);
      if (entry.isDirectory()) {
        if (fs.existsSync(path.join(file, 'VENDORED.json'))) files[`${path.relative(dir, file)}/`] = fs.readFileSync(path.join(file, 'VENDORED.json'), 'utf8');
        else walk(file);
      } else files[path.relative(dir, file)] = fs.readFileSync(file, 'utf8');
    }
  };
  walk(dir);
  return files;
}

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

test('読めない設定が 1 つでもあれば、ほかの設定も 8.x の写しも、何も変えずに止める', () => {
  const unreadable = '{ "permissions": {}, // 手で書いた\n}';
  // 宣言は入れるときにだけ書くので、外すときには読まない。
  for (const [file, runs] of [['.claude/settings.json', [install, uninstall]], ['.agents/dotagents.json', [install]]]) {
    const dir = project({ '.codex/config.toml': 'model = "x"\n', '.claude/skills/dotagents/VENDORED.json': '{}', [file]: unreadable });
    const before = snapshot(dir);
    for (const run of runs) {
      assert.throws(() => run(dir, { style: { git: 'trunk' } }), /JSON として読めない/, `${file}: ${run.name}`);
      assert.deepEqual(snapshot(dir), before, `${file}: ${run.name}`);
    }
  }
});

test('入れて外すと、ほかの設定は 1 文字も変わらない', () => {
  const claude = '{\n    "env": {},\n    "hooks": {},\n    "permissions": { "allow": ["Bash(ls:*)"] }\n}\n';
  const codex = 'model = "x"\n\n[profiles.a]\ndeveloper_instructions = """\nfirst\n\n\n\n[not a table]\nsecond\n"""\n';
  const pi = '{\n\t"theme": "dark",\n\t"packages": ["npm:@example/tools", "git:github.com/hiroiku/dotagents@v8.0.5"]\n}\n';
  const dir = project({ '.claude/settings.json': claude, '.codex/config.toml': codex, '.pi/settings.json': pi });
  install(dir);
  const settings = fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8');
  assert.match(settings, /^\{\n {4}"env": \{\},\n {4}"hooks": \{\},\n {4}"permissions": \{ "allow": \["Bash\(ls:\*\)"\] \},\n {4}"/);
  assert.equal(json(dir, '.claude', 'settings.json').enabledPlugins['dotagents@dotagents'], true);
  assert.ok(toml(dir).startsWith(codex), toml(dir));
  assert.equal(fs.readFileSync(path.join(dir, '.pi', 'settings.json'), 'utf8'), '{\n\t"theme": "dark",\n\t"packages": ["npm:@example/tools"]\n}\n');
  const installed = snapshot(dir);
  install(dir);
  assert.deepEqual(snapshot(dir), installed, '入れ直しても変わらない');
  uninstall(dir);
  assert.equal(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), claude);
  assert.equal(toml(dir), codex);
  // 書いた表の後ろに利用者が足した注釈は、外すときに残す。
  install(dir);
  fs.appendFileSync(path.join(dir, '.codex', 'config.toml'), '\n# 手で足した\n');
  uninstall(dir);
  assert.equal(toml(dir), `${codex}\n# 手で足した\n`);
});

test('Codex の設定で、この道具の表に利用者が足した行は、入れ直すときは表の中に残し、外すときは表ごと外す', () => {
  const codex = '[profiles.a]\nmodel = "x"\n';
  const dir = project({ '.codex/config.toml': codex });
  install(dir);
  const pinned = toml(dir).replace('[marketplaces.dotagents]\n', '[marketplaces.dotagents]\nref = "v9.0.0"\n');
  fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), pinned);
  install(dir);
  assert.equal(toml(dir), pinned, '入れ直しても、表の中の利用者の行は動かない');
  uninstall(dir);
  assert.equal(toml(dir), codex, 'ほかの表の字は変わらない');
});

test('プロジェクトの marketplace の目録は、入れても外しても触れない', () => {
  // dotagents のリポジトリー自身の目録。
  const own = JSON.stringify({ name: 'dotagents', plugins: [{ name: 'dotagents', source: { source: 'local', path: './plugin' } }] }, null, 2);
  const dir = project({ '.agents/plugins/marketplace.json': own });
  for (const run of [install, uninstall]) {
    run(dir);
    assert.equal(fs.readFileSync(path.join(dir, '.agents', 'plugins', 'marketplace.json'), 'utf8'), own, run.name);
  }
});

test('8.x の写しは、入れても外しても消え、ほかのスキルと .claude/skills は残る', () => {
  for (const run of [install, uninstall]) {
    const dir = project({ '.claude/skills/dotagents/VENDORED.json': '{"version":"8.0.5"}', '.claude/skills/dotagents/core.md': 'x', '.claude/skills/mine/SKILL.md': 'mine' });
    run(dir);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills', 'dotagents')), false, run.name);
    assert.equal(fs.readFileSync(path.join(dir, '.claude', 'skills', 'mine', 'SKILL.md'), 'utf8'), 'mine', run.name);
  }
  const alone = project({ '.claude/skills/dotagents/VENDORED.json': '{"version":"8.0.5"}' });
  uninstall(alone);
  assert.equal(fs.existsSync(path.join(alone, '.claude', 'skills', 'dotagents')), false);
  assert.ok(fs.existsSync(path.join(alone, '.claude', 'skills')));
  // 印の無いものは、8.x の写しの置き場にあっても消さない。
  const mine = project({ '.claude/skills/dotagents/SKILL.md': 'mine' });
  install(mine);
  assert.equal(fs.readFileSync(path.join(mine, '.claude', 'skills', 'dotagents', 'SKILL.md'), 'utf8'), 'mine');
});

// 参照を設定に書いただけでは、対話のセッションの始めに読まれない。各人が 1 回入れる。
test('参照で入れたプロジェクトの点検は、この環境の Claude Code に入っているかを知らせる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-doctor-'));
  install(dir);
  const settings = json(dir, '.claude', 'settings.json');
  // 各人の claude plugin install --scope project が同じ順に書き直すので、差分ができない。
  assert.deepEqual(Object.keys(settings), ['enabledPlugins', 'extraKnownMarketplaces']);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-claude-'));
  const level = () => doctor(dir, { remote: false, claudeHome: home }).find((entry) => /Claude Code (に|には)入|Claude Code に入っているか/.test(entry.text))?.level;
  assert.equal(level(), 'info');
  const record = (entries) => {
    fs.mkdirSync(path.join(home, 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(home, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'dotagents@dotagents': entries } }));
  };
  record([{ scope: 'project', projectPath: '/somewhere/else' }]);
  assert.equal(level(), 'warn');
  assert.match(doctor(dir, { remote: false, claudeHome: home }).find((entry) => entry.level === 'warn' && /Claude Code/.test(entry.text)).text, /claude plugin install dotagents@dotagents --scope project/);
  record([{ scope: 'project', projectPath: dir }]);
  assert.equal(level(), 'ok');
  record([{ scope: 'user' }]);
  assert.equal(level(), 'ok');
});

test('点検は、宣言の誤り、流と検査の入口と参照が無いこと、8.x と 7.x の残りを知らせる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-doctor-'));
  const levels = (pattern) => doctor(dir, { remote: false }).filter((entry) => pattern.test(entry.text)).map((entry) => entry.level);
  assert.deepEqual(levels(/宣言\(/), ['info']);
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.mkdirSync(path.join(dir, '.claude', 'rules', 'dotagents'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills', NAME), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'skills', NAME, 'VENDORED.json'), '{"version":"8.0.5"}');
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify({ outward: ['('], delegated: ['pusg'], extra: 1, style: { git: 'nope' } }));
  const notes = doctor(dir, { remote: false }).map((entry) => `${entry.level}: ${entry.text}`).join('\n');
  assert.match(notes, /error: outward の正規表現が読めない/);
  assert.match(notes, /warn: delegated に知らない種類がある: pusg/);
  assert.match(notes, /warn: 宣言に知らない項目がある: extra/);
  assert.match(notes, /warn: style に知らない流がある: git: "nope"/);
  assert.match(notes, /warn: 宣言に checks が無い/);
  assert.match(notes, /info: 流を選んでいない軸: architecture、git/);
  assert.match(notes, /warn: どのホストの設定にも、この plugin への参照が無い/);
  assert.match(notes, /warn: 8\.x の写しが残っている/);
  assert.match(notes, /warn: 7\.x が配ったものが残っている/);
  install(dir, { style: { git: 'trunk', architecture: 'layered' } });
  const after = doctor(dir, { remote: false }).map((entry) => `${entry.level}: ${entry.text}`).join('\n');
  assert.doesNotMatch(after, /参照が無い|8\.x の写し|流を選んでいない|知らない流/);
  assert.ok(doctor(dir, { remote: false }).filter((entry) => /毎回読む文/.test(entry.text)).every((entry) => entry.level === 'ok'));
});
