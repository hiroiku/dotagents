import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EDIT_CHECK_SECONDS } from '../plugin/src/check.mjs';
import { largestSize } from '../plugin/src/context.mjs';
import { codexAgent, roles } from '../plugin/src/roles.mjs';
import { NAME, doctor, install, stats, uninstall, unvendor, vendor } from '../plugin/scripts/dotagents.mjs';

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
        assert.match(hook.command, new RegExp(` ${host} (session|subagent|tool|edited|stopped)$`));
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

test('編集の段の検査は、ホストが hook を打ち切るより先に、自分で止まる', () => {
  for (const [host, dir] of [['claude', '.claude-plugin'], ['codex', '.codex-plugin']]) {
    const hooks = json(PLUGIN, json(PLUGIN, dir, 'plugin.json').hooks).hooks;
    const edited = Object.values(hooks).flat().flatMap((group) => group.hooks).filter((hook) => hook.command.endsWith(' edited'));
    assert.ok(edited.length > 0, host);
    for (const hook of edited) assert.ok(hook.timeout > EDIT_CHECK_SECONDS, `${host}: ${hook.timeout} 秒`);
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

test('入れるときに選んだ流を宣言に書き、知らない流は書かずに止める。雛形は無いものだけを写す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify({ decisions: ['a'], style: { git: 'trunk' } }));
  assert.throws(() => install(dir, { style: { git: 'gitflow' } }), /gitflow という流は無い/);
  const result = install(dir, { style: { architecture: 'layered' } });
  assert.deepEqual(json(dir, '.agents', 'dotagents.json'), { decisions: ['a'], style: { git: 'trunk', architecture: 'layered' } });
  assert.deepEqual(result.placed.sort(), ['scripts/layers/check.mjs', 'scripts/layers/layers.json']);
  fs.writeFileSync(path.join(dir, 'scripts', 'layers', 'layers.json'), '{"mine":true}');
  assert.deepEqual(install(dir).skipped.sort(), ['scripts/layers/check.mjs', 'scripts/layers/layers.json']);
  assert.equal(fs.readFileSync(path.join(dir, 'scripts', 'layers', 'layers.json'), 'utf8'), '{"mine":true}', '写したあとはプロジェクトのもの');
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-install-'));
  assert.deepEqual(install(other, { style: { architecture: 'layered' }, template: false }).placed, []);
  assert.equal(fs.existsSync(path.join(other, 'scripts')), false);
});

test('写して入れると、リポジトリーの中の marketplace に置き、各ホストの設定がそこを指す。外すと元に戻る', () => {
  const dir = existing();
  const before = { claude: json(dir, '.claude', 'settings.json'), codex: toml(dir) };
  // 8.x の写しは、置き換える。
  fs.mkdirSync(path.join(dir, '.claude', 'skills', NAME), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'skills', NAME, 'VENDORED.json'), '{"version":"8.0.5"}');
  install(dir);
  vendor(dir);
  const copy = path.join(dir, '.agents', 'plugins', NAME);
  assert.equal(json(copy, 'VENDORED.json').version, json(PLUGIN, 'package.json').version);
  assert.ok(fs.existsSync(path.join(copy, 'src', 'guard.mjs')) && fs.existsSync(path.join(copy, 'hosts', 'codex', 'hooks.json')));
  assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills', NAME)), false);
  const claudeMarket = json(dir, '.agents', 'plugins', '.claude-plugin', 'marketplace.json');
  assert.deepEqual(claudeMarket.plugins.map((plugin) => [plugin.name, plugin.source]), [[NAME, './dotagents']]);
  const settings = json(dir, '.claude', 'settings.json');
  assert.deepEqual(settings.extraKnownMarketplaces, { [claudeMarket.name]: { source: { source: 'directory', path: './.agents/plugins' } } });
  assert.deepEqual(Object.keys(settings.enabledPlugins).sort(), [`dotagents@${claudeMarket.name}`, 'other@market']);
  const codexMarket = json(dir, '.agents', 'plugins', 'marketplace.json');
  assert.equal(codexMarket.plugins[0].source.path, './.agents/plugins/dotagents');
  assert.match(toml(dir), new RegExp(`\\[plugins\\."dotagents@${codexMarket.name}"\\]\\nenabled = true`));
  assert.doesNotMatch(toml(dir), /\[marketplaces\.dotagents\]/);
  unvendor(dir);
  assert.equal(fs.existsSync(path.join(dir, '.agents', 'plugins')), false);
  assert.deepEqual(json(dir, '.claude', 'settings.json'), before.claude);
  assert.equal(toml(dir), before.codex);
  assert.deepEqual(json(dir, '.pi', 'settings.json').packages, ['npm:@example/tools', 'git:github.com/hiroiku/dotagents']);
});

test('8.x が Pi の設定に書いた package の行は、外すときにも消し、点検で知らせる', () => {
  for (const remove of [uninstall, unvendor]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-pi-'));
    fs.mkdirSync(path.join(dir, '.pi'));
    fs.writeFileSync(path.join(dir, '.pi', 'settings.json'), JSON.stringify({ packages: ['git:github.com/hiroiku/dotagents@v8.0.5', 'npm:@example/tools'] }));
    assert.match(doctor(dir, { remote: false }).map((entry) => `${entry.level}: ${entry.text}`).join('\n'), /warn: 8\.x が Pi の設定/);
    remove(dir);
    assert.deepEqual(json(dir, '.pi', 'settings.json'), { packages: ['npm:@example/tools'] });
    assert.doesNotMatch(doctor(dir, { remote: false }).map((entry) => entry.text).join('\n'), /Pi/);
  }
});

// ホストは marketplace の置き場を名前ごとに 1 つだけ覚える。名前が同じだと、別のプロジェクトの写しの hook が動く。
test('写しの marketplace の名前は、プロジェクトごとに違い、利用者が登録した dotagents とも違い、写し直しても変わらない', () => {
  const names = ['a', 'b'].map(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-vendor-'));
    vendor(dir);
    const name = json(dir, '.agents', 'plugins', '.claude-plugin', 'marketplace.json').name;
    vendor(dir);
    assert.equal(json(dir, '.agents', 'plugins', 'marketplace.json').name, name);
    assert.equal(json(dir, '.agents', 'plugins', '.claude-plugin', 'marketplace.json').name, name);
    return name;
  });
  assert.notEqual(names[0], names[1]);
  for (const name of names) assert.notEqual(name, 'dotagents');
  const cloned = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-vendor-'));
  execFileSync('git', ['init', '-q'], { cwd: cloned });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:Kuden-World/kuden-drive.git'], { cwd: cloned });
  vendor(cloned);
  assert.equal(json(cloned, '.agents', 'plugins', 'marketplace.json').name, 'dotagents-kuden-world-kuden-drive');
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
  unvendor(tidy);
  assert.equal(fs.readFileSync(path.join(tidy, '.codex', 'config.toml'), 'utf8'), 'model = "x"\n\n\n\n[a]\nb = 1');
  assert.equal(fs.readFileSync(path.join(tidy, '.pi', 'settings.json'), 'utf8'), '{"theme":"dark"}');
  assert.equal(fs.existsSync(path.join(tidy, '.claude')), false);
});

// ディレクトリーの中のファイルと中身。写しの中身は数えない。
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

test('読めない設定が 1 つでもあれば、ほかの設定も写しも、何も変えずに止める', () => {
  const unreadable = '{ "permissions": {}, // 手で書いた\n}';
  // 宣言は入れるときにだけ書くので、写すときには読まない。
  for (const [file, runs] of [['.claude/settings.json', ['install', 'vendor']], ['.agents/dotagents.json', ['install']], ['.agents/plugins/marketplace.json', ['install', 'vendor', 'unvendor']]]) {
    const dir = project({ '.codex/config.toml': 'model = "x"\n', '.claude/skills/dotagents/VENDORED.json': '{}', [file]: unreadable });
    const before = snapshot(dir);
    for (const name of runs) {
      assert.throws(() => ({ install, vendor, unvendor })[name](dir, { style: { git: 'trunk' } }), /JSON として読めない/, `${file}: ${name}`);
      assert.deepEqual(snapshot(dir), before, `${file}: ${name}`);
    }
  }
  // 写して入れたあとに設定が読めなくなっても、写しと目録を先に消さない。
  const vendored = project({ '.claude/settings.json': '{"a":1}' });
  vendor(vendored);
  fs.writeFileSync(path.join(vendored, '.claude', 'settings.json'), unreadable);
  const before = snapshot(vendored);
  for (const run of [install, uninstall, unvendor]) {
    assert.throws(() => run(vendored), /JSON として読めない/);
    assert.deepEqual(snapshot(vendored), before, run.name);
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
  // 書いた表の後ろに利用者が足したものは、外すときに残す。
  install(dir);
  fs.appendFileSync(path.join(dir, '.codex', 'config.toml'), '# 手で足した\nnotify = ["x"]\n');
  uninstall(dir);
  assert.match(toml(dir), /# 手で足した\nnotify = \["x"\]\n$/);
  vendor(dir);
  const vendored = snapshot(dir);
  vendor(dir);
  assert.deepEqual(snapshot(dir), vendored, '写し直しても変わらない');
  unvendor(dir);
  assert.equal(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), claude);
});

test('この道具の印が無い marketplace の目録は、入れても外しても消さない', () => {
  // dotagents のリポジトリー自身の目録。名前が写しの形ではない。
  const own = JSON.stringify({ name: 'dotagents', plugins: [{ name: 'dotagents', source: { source: 'local', path: './plugin' } }] }, null, 2);
  const dir = project({ '.agents/plugins/marketplace.json': own });
  for (const run of [install, uninstall, unvendor]) {
    run(dir);
    assert.equal(fs.readFileSync(path.join(dir, '.agents', 'plugins', 'marketplace.json'), 'utf8'), own, run.name);
  }
});

test('origin の無いプロジェクトでも、同じ名前のディレクトリーどうしで写しの marketplace の名前が重ならない', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-vendor-'));
  const names = ['x', 'y'].map((parent) => {
    const dir = path.join(base, parent, 'app');
    fs.mkdirSync(dir, { recursive: true });
    vendor(dir);
    return json(dir, '.agents', 'plugins', 'marketplace.json').name;
  });
  assert.notEqual(names[0], names[1]);
  for (const name of names) assert.match(name, /^dotagents-app-[0-9a-f]+$/);
});

test('8.x の写しは、入れても外しても消え、ほかのスキルと .claude/skills は残る', () => {
  for (const run of [install, vendor, uninstall, unvendor]) {
    const dir = project({ '.claude/skills/dotagents/VENDORED.json': '{"version":"8.0.5"}', '.claude/skills/dotagents/core.md': 'x', '.claude/skills/mine/SKILL.md': 'mine' });
    run(dir);
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'skills', 'dotagents')), false, run.name);
    assert.equal(fs.readFileSync(path.join(dir, '.claude', 'skills', 'mine', 'SKILL.md'), 'utf8'), 'mine', run.name);
  }
  const alone = project({ '.claude/skills/dotagents/VENDORED.json': '{"version":"8.0.5"}' });
  unvendor(alone);
  assert.equal(fs.existsSync(path.join(alone, '.claude', 'skills', 'dotagents')), false);
  assert.ok(fs.existsSync(path.join(alone, '.claude', 'skills')));
});

test('写して入れたあとに参照で入れ直すと、写しと目録が消える', () => {
  const dir = project({});
  vendor(dir);
  install(dir);
  assert.equal(fs.existsSync(path.join(dir, '.agents', 'plugins')), false);
  assert.deepEqual(Object.keys(json(dir, '.claude', 'settings.json').enabledPlugins), ['dotagents@dotagents']);
  assert.doesNotMatch(toml(dir), /dotagents-/);
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

test('この道具が置いたのではないものがある場所と、プロジェクトの marketplace には、写さない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-vendor-'));
  const own = path.join(dir, '.agents', 'plugins', NAME, 'skills', 'mine', 'SKILL.md');
  fs.mkdirSync(path.dirname(own), { recursive: true });
  fs.writeFileSync(own, 'x');
  assert.throws(() => vendor(dir), /置いたのではないもの/);
  unvendor(dir);
  assert.equal(fs.readFileSync(own, 'utf8'), 'x');
  const market = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-vendor-'));
  fs.mkdirSync(path.join(market, '.agents', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(market, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({ name: 'team-tools', plugins: [{ name: 'lint' }] }));
  assert.throws(() => vendor(market), /プロジェクトの marketplace\(team-tools\)/);
  unvendor(market);
  assert.deepEqual(json(market, '.agents', 'plugins', 'marketplace.json').plugins, [{ name: 'lint' }]);
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
      entry({ t: '2026-11-19T02:10:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'follow' }),
      entry({ t: '2026-11-19T02:20:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'ci' }),
      entry({ t: '2026-11-19T02:30:00Z', event: 'guard', project: 'p', decision: 'deny', kind: 'ci' }),
      entry({ t: '2026-11-19T03:00:00Z', event: 'context', project: 'p', role: 'lead', chars: 1400 }),
      entry({ t: '2026-11-19T04:00:00Z', event: 'role', project: 'p', role: 'builder', agentType: 'dotagents:builder', model: 'm', seconds: 600, out: 1000, in: 200, cached: 5000, tools: 9 }),
      entry({ t: '2026-11-19T05:00:00Z', event: 'role', project: 'p', role: 'builder', agentType: 'dotagents:builder', model: 'm', seconds: 300, out: 500, in: 100, cached: 4000 }),
      entry({ t: '2026-11-19T06:00:00Z', event: 'role', project: 'p', role: 'worker', agentType: 'Explore' }),
      entry({ t: '2026-11-01T00:00:00Z', event: 'guard', project: 'p', decision: 'ask', kind: 'push' }),
      'broken line',
    ].join('\n'));
    const result = stats({ days: 7, now });
    assert.deepEqual(result.projects.p.asks, { push: 1 });
    assert.deepEqual(result.projects.p.denies, { pace: 1, follow: 1, ci: 2 });
    assert.deepEqual(result.projects.p.contexts.lead, { count: 1, chars: 1400 });
    assert.deepEqual(result.projects.p.roles, { 'dotagents:builder(m)': { count: 2, seconds: 900, out: 1500, in: 300, cached: 9000 }, Explore: { count: 1, seconds: 0, out: 0, in: 0, cached: 0 } });
  } finally {
    if (previous === undefined) delete process.env.DOTAGENTS_HOME;
    else process.env.DOTAGENTS_HOME = previous;
  }
});
