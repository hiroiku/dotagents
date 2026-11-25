// dotagents init を、質問なしの指定で確かめる。選ぶ画面は test/cli-prompt.test.mjs。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ALL, exec, exists, git, read, repo, write } from './cli-harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const DECLARATION = `{
  "style": {
    "git": "trunk",
    "architecture": "layered"
  },
  "checks": {
    "push": "npm run check"
  }
}
`;
const CLAUDE = `{
  "enabledPlugins": {
    "dotagents@dotagents": true
  },
  "extraKnownMarketplaces": {
    "dotagents": {
      "source": {
        "source": "github",
        "repo": "hiroiku/dotagents"
      },
      "autoUpdate": true
    }
  }
}
`;
const CODEX = `[marketplaces.dotagents]
source_type = "git"
source = "https://github.com/hiroiku/dotagents.git"

[plugins."dotagents@dotagents"]
enabled = true
`;
const INSTALL = ['plugin', 'install', 'dotagents@dotagents', '--scope', 'project'];

const snapshot = (dir) => {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else out[path.relative(dir, file)] = fs.readFileSync(file, 'utf8');
    }
  };
  walk(dir);
  return out;
};

test('新しく入れる: 宣言とホストの設定を書き、plugin を入れ、コミットはしない', async () => {
  const dir = repo();
  const result = await exec(dir, ['init', ...ALL]);
  assert.equal(result.code, 0, result.err);
  assert.equal(read(dir, '.agents/dotagents.json'), DECLARATION);
  assert.equal(read(dir, '.claude/settings.json'), CLAUDE);
  assert.equal(read(dir, '.codex/config.toml'), CODEX);
  assert.deepEqual(result.calls, [{ file: 'claude', args: INSTALL, cwd: dir }]);
  assert.match(result.out, /\.agents\/dotagents\.json/);
  assert.match(result.out, /\/hooks/);
  assert.match(result.out, /claude plugin install dotagents@dotagents --scope project/);
  assert.match(result.out, /ARCHITECTURE\.md/);
  assert.throws(() => git(dir, 'rev-parse', 'HEAD'), 'コミットを作らない');
});

test('2 回目は差分が出ない。入っている plugin はもう一度入れない', async () => {
  const dir = repo();
  const first = await exec(dir, ['init', ...ALL]);
  const before = snapshot(dir);
  // claude が入れた記録(project の scope)
  write(first.claudeHome, { 'plugins/installed_plugins.json': JSON.stringify({ plugins: { 'dotagents@dotagents': [{ scope: 'project', projectPath: dir }] } }) });
  const second = await exec(dir, ['init', ...ALL], { claudeHome: first.claudeHome });
  assert.equal(second.code, 0, second.err);
  assert.deepEqual(snapshot(dir), before);
  assert.deepEqual(second.calls, []);
  assert.match(second.out, /変更はありません/);
});

test('ほかの項目と字(字下げ、並び、注釈)は変えず、この道具の項目だけを足す', async () => {
  const claude = `{
    "permissions": { "allow": ["Bash(npm test)"] },
    "enabledPlugins": {
        "other@market": true
    },
    "model": "opus"
}
`;
  const codex = `# 自分の設定
model = "gpt-5"

[projects."/work"]
trust_level = "trusted" # 信頼する
`;
  const declaration = `{
  "decisions": ["色は決まっている。"],
  "delegated": ["tag"],
  "protected": ["staging"],
  "style": { "git": "release-branches" }
}
`;
  const dir = repo({ '.claude/settings.json': claude, '.codex/config.toml': codex, '.agents/dotagents.json': declaration });
  const result = await exec(dir, ['init', '--hosts', 'claude,codex', '--git', 'trunk', '--architecture', 'none', '--scope', 'none', '--check', 'push=npm run check']);
  assert.equal(result.code, 0, result.err);
  assert.equal(
    read(dir, '.claude/settings.json'),
    `{
    "permissions": { "allow": ["Bash(npm test)"] },
    "enabledPlugins": {
        "other@market": true,
        "dotagents@dotagents": true
    },
    "model": "opus",
    "extraKnownMarketplaces": {
        "dotagents": {
            "source": {
                "source": "github",
                "repo": "hiroiku/dotagents"
            },
            "autoUpdate": true
        }
    }
}
`,
  );
  assert.equal(read(dir, '.codex/config.toml'), `${codex}\n${CODEX}`);
  assert.equal(
    read(dir, '.agents/dotagents.json'),
    `{
  "decisions": ["色は決まっている。"],
  "delegated": ["tag"],
  "protected": ["staging"],
  "style": { "git": "trunk" },
  "checks": {
    "push": "npm run check"
  }
}
`,
  );
  assert.deepEqual(result.calls, []);
});

test('Codex の表に利用者が足した行は残し、この道具の鍵の行だけをそろえる', async () => {
  const codex = `[marketplaces.dotagents]
source_type = "git"
source = "https://example.com/old.git"
ref = "v9"

[plugins."dotagents@dotagents"]
enabled = false
`;
  const dir = repo({ '.codex/config.toml': codex });
  await exec(dir, ['init', '--hosts', 'codex', '--git', 'none', '--architecture', 'none']);
  assert.equal(
    read(dir, '.codex/config.toml'),
    `[marketplaces.dotagents]
source_type = "git"
source = "https://github.com/hiroiku/dotagents.git"
ref = "v9"

[plugins."dotagents@dotagents"]
enabled = true
`,
  );
});

test('選んだホストだけに書く', async () => {
  const dir = repo();
  await exec(dir, ['init', '--hosts', 'codex', '--git', 'none', '--architecture', 'none']);
  assert.equal(exists(dir, '.claude/settings.json'), false);
  assert.equal(read(dir, '.codex/config.toml'), CODEX);
  assert.equal(read(dir, '.agents/dotagents.json'), '{}\n', '何も選ばなくても、宣言は置く(入れる提案を止める)');
});

test('8.x の残り: 印のある写しと、版を固定した Pi の行だけを消す', async () => {
  const dir = repo({
    '.claude/skills/dotagents/VENDORED.json': '{}',
    '.claude/skills/dotagents/SKILL.md': 'x',
    '.claude/skills/mine/SKILL.md': 'y',
    '.pi/settings.json': `{
  "packages": [
    "git:github.com/hiroiku/dotagents@v8.0.0",
    { "source": "git:github.com/hiroiku/dotagents@v8.0.1" },
    "git:github.com/hiroiku/dotagents",
    "npm:other"
  ],
  "theme": "dark"
}
`,
  });
  const result = await exec(dir, ['init', ...ALL]);
  assert.equal(result.code, 0, result.err);
  assert.equal(exists(dir, '.claude/skills/dotagents'), false);
  assert.equal(exists(dir, '.claude/skills/mine/SKILL.md'), true);
  assert.equal(
    read(dir, '.pi/settings.json'),
    `{
  "packages": [
    "git:github.com/hiroiku/dotagents",
    "npm:other"
  ],
  "theme": "dark"
}
`,
  );
});

test('印の無い .claude/skills/dotagents は利用者のものなので消さない', async () => {
  const dir = repo({ '.claude/skills/dotagents/SKILL.md': 'x' });
  await exec(dir, ['init', ...ALL]);
  assert.equal(exists(dir, '.claude/skills/dotagents/SKILL.md'), true);
});

test('7.x の残りは消さず、setup の移行を頼むよう知らせる', async () => {
  const dir = repo({ '.claude/dotagents.json': '{}', '.claude/rules/dotagents/a.md': 'a', '.codex/dotagents/b.md': 'b' });
  const result = await exec(dir, ['init', ...ALL]);
  assert.equal(exists(dir, '.claude/dotagents.json'), true);
  assert.equal(exists(dir, '.claude/rules/dotagents/a.md'), true);
  assert.equal(exists(dir, '.codex/dotagents/b.md'), true);
  assert.match(result.out, /7\.x/);
  assert.match(result.out, /setup/);
  assert.match(result.out, /\.claude\/rules\/dotagents/);
});

test('宣言に outward が残っていれば消さずに、もう読まれないことを知らせる', async () => {
  const dir = repo({ '.agents/dotagents.json': '{\n  "outward": ["push"]\n}\n' });
  const result = await exec(dir, ['init', ...ALL]);
  assert.deepEqual(JSON.parse(read(dir, '.agents/dotagents.json')).outward, ['push']);
  assert.match(result.out, /outward/);
  assert.match(result.out, /もう使われず/);
});

test('JSON として読めない設定は、何も書き換えずに知らせる', async () => {
  const comment = '{\n  // 注釈\n  "model": "opus"\n}\n';
  const dir = repo({ '.claude/settings.json': comment });
  const before = snapshot(dir);
  const result = await exec(dir, ['init', ...ALL]);
  assert.equal(result.code, 1);
  assert.match(result.err, /\.claude\/settings\.json/);
  assert.match(result.err, /読み込めません/);
  assert.deepEqual(snapshot(dir), before, '1 つでも読めなければ、ほかも書かない');
  assert.deepEqual(result.calls, []);
});

test('読めない宣言も書き換えない', async () => {
  const dir = repo({ '.agents/dotagents.json': '{ "style": ' });
  const before = snapshot(dir);
  const result = await exec(dir, ['init', ...ALL]);
  assert.equal(result.code, 1);
  assert.match(result.err, /dotagents\.json/);
  assert.deepEqual(snapshot(dir), before);
});

test('端末でなく、--yes も指定も無ければ、尋ねずにエラーで終える', async () => {
  const dir = repo();
  const result = await exec(dir, ['init']);
  assert.equal(result.code, 1);
  assert.match(result.err, /--yes/);
  assert.deepEqual(snapshot(dir), {});
});

test('git のリポジトリーの外ではエラーで終える', async () => {
  const dir = path.join(repo(), '..', 'outside');
  fs.mkdirSync(dir, { recursive: true });
  const result = await exec(fs.realpathSync(dir), ['init', '--yes']);
  assert.equal(result.code, 1);
  assert.match(result.err, /git/);
  assert.deepEqual(snapshot(dir), {});
});

test('リポジトリーの途中から実行しても、根に書く', async () => {
  const dir = repo({ 'src/deep/.keep': '' });
  const result = await exec(path.join(dir, 'src', 'deep'), ['init', ...ALL]);
  assert.equal(result.code, 0, result.err);
  assert.equal(read(dir, '.agents/dotagents.json'), DECLARATION);
  assert.equal(exists(dir, 'src/deep/.agents'), false);
  assert.equal(result.calls[0].cwd, dir);
});

test('claude が PATH に無ければ、実行するコマンドを示すだけにする', async () => {
  const dir = repo();
  const result = await exec(dir, ['init', ...ALL], { commands: ['codex'] });
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(result.calls, []);
  assert.match(result.out, /claude plugin install dotagents@dotagents --scope project/);
});

test('範囲を user にすると --scope user で入れ、入れないなら実行しない', async () => {
  const user = await exec(repo(), ['init', ...ALL.slice(0, 6), '--scope', 'user', '--check', 'push=npm run check']);
  assert.deepEqual(user.calls[0].args, ['plugin', 'install', 'dotagents@dotagents', '--scope', 'user']);
  const none = await exec(repo(), ['init', ...ALL.slice(0, 6), '--scope', 'none']);
  assert.deepEqual(none.calls, []);
});

test('claude の plugin install が失敗したら、書いた設定は残し、終了コードで知らせる', async () => {
  const dir = repo();
  const result = await exec(dir, ['init', ...ALL], { status: 1 });
  assert.equal(result.code, 1);
  assert.equal(read(dir, '.claude/settings.json'), CLAUDE);
  assert.match(result.err, /claude plugin install dotagents@dotagents --scope project/);
});

test('既定: release/ のブランチがあれば release-branches、無ければ trunk。ホストは PATH と置き場から推す', async () => {
  const plain = repo({ '.codex/.keep': '' });
  await exec(plain, ['init', '--yes'], { commands: ['claude'] });
  assert.deepEqual(JSON.parse(read(plain, '.agents/dotagents.json')).style, { git: 'trunk' });
  assert.equal(exists(plain, '.claude/settings.json'), true, 'PATH の claude');
  assert.equal(exists(plain, '.codex/config.toml'), true, '.codex/ がある');

  const branched = repo({ '.claude/.keep': '' });
  git(branched, 'commit', '--allow-empty', '-q', '-m', 'init');
  git(branched, 'branch', 'release/1.x');
  await exec(branched, ['init', '--yes'], { commands: [] });
  assert.deepEqual(JSON.parse(read(branched, '.agents/dotagents.json')).style, { git: 'release-branches' });
  assert.equal(exists(branched, '.claude/settings.json'), true, '.claude/ がある');
  assert.equal(exists(branched, '.codex/config.toml'), false);
});

test('既定: package.json の scripts からチェックのコマンドを検出する', async () => {
  const dir = repo({
    'package.json': JSON.stringify({ scripts: { check: 'a', 'check:changed': 'b', 'test:e2e': 'c' }, devDependencies: { '@biomejs/biome': '1' } }),
    'pnpm-lock.yaml': '',
  });
  await exec(dir, ['init', '--yes']);
  assert.deepEqual(JSON.parse(read(dir, '.agents/dotagents.json')).checks, {
    edit: 'pnpm exec biome check {file}',
    commit: 'pnpm run check:changed',
    push: 'pnpm run check',
    release: 'pnpm run test:e2e',
  });
});

test('既定: 2 回目は、いまの宣言の値を使う。空にした段は空のまま', async () => {
  const dir = repo({
    'package.json': JSON.stringify({ scripts: { check: 'a' } }),
    '.agents/dotagents.json': '{\n  "style": { "git": "release-branches" },\n  "checks": { "commit": "make fast" }\n}\n',
  });
  await exec(dir, ['init', '--yes']);
  const declaration = JSON.parse(read(dir, '.agents/dotagents.json'));
  assert.deepEqual(declaration.style, { git: 'release-branches' });
  assert.deepEqual(declaration.checks, { commit: 'make fast' }, '宣言にある checks が優先し、推した案を足さない');
});

test('指定した段だけを変え、空の値は段を外す。ほかの鍵(未知の段)は残す', async () => {
  const dir = repo({ '.agents/dotagents.json': '{\n  "checks": { "edit": "e", "push": "p", "extra": "x" }\n}\n' });
  await exec(dir, ['init', '--hosts', 'none', '--git', 'none', '--architecture', 'none', '--check', 'push=', '--check', 'commit=c']);
  assert.deepEqual(JSON.parse(read(dir, '.agents/dotagents.json')), { checks: { edit: 'e', extra: 'x', commit: 'c' } });
});

test('指定の誤りは、何も書かずにエラーで終える', async () => {
  for (const argv of [['--git', 'gitflow'], ['--architecture', 'hexagonal'], ['--scope', 'global'], ['--hosts', 'pi'], ['--check', 'deploy=x'], ['--check', 'push'], ['--nope']]) {
    const dir = repo();
    const result = await exec(dir, ['init', '--yes', ...argv]);
    assert.equal(result.code, 1, argv.join(' '));
    assert.match(result.err, /\S/);
    assert.deepEqual(snapshot(dir), {}, argv.join(' '));
  }
});

test('不明なコマンドと、引数なしは使い方を示して終える。--version は版を出す', async () => {
  const dir = repo();
  const none = await exec(dir, []);
  assert.equal(none.code, 1);
  assert.match(none.err, /dotagents init/);
  const unknown = await exec(dir, ['doctor']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /init/);
  const help = await exec(dir, ['--help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /--yes/);
  const version = await exec(dir, ['--version']);
  assert.equal(version.out.trim(), '9.0.0');
});

// ---------------------------------------------------------------- plugin との食い違い

test('パッケージの定義は、依存を持たない(版は test/plugin.test.mjs が plugin とそろえる)', () => {
  const pkg = json('cli/package.json');
  assert.equal(pkg.name, '@hiroiku/dotagents');
  assert.deepEqual(pkg.bin, { dotagents: './bin/dotagents.mjs' });
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.type, 'module');
  assert.deepEqual([...pkg.files].sort(), ['bin', 'src']);
});

test('書く名前と場所は plugin の定義と食い違わない', async () => {
  const { TARGET, STYLES } = await import('../cli/src/target.mjs');
  const manifest = json('plugin/.claude-plugin/plugin.json');
  const marketplace = json('.claude-plugin/marketplace.json');
  assert.equal(TARGET.plugin, manifest.name);
  assert.equal(TARGET.marketplace, marketplace.name);
  assert.equal(marketplace.plugins.find((plugin) => plugin.name === TARGET.plugin)?.source, './plugin');
  assert.equal(manifest.repository, `https://github.com/${TARGET.repo}`);
  for (const axis of ['git', 'architecture']) {
    const found = fs.readdirSync(path.join(ROOT, 'plugin', 'styles', axis)).map((name) => name.replace(/\.md$/, ''));
    assert.deepEqual([...STYLES[axis]].sort(), found.sort(), axis);
  }
});

// npm のページに出る説明と、配る LICENSE。どちらも、リポジトリーの根と cli/ の 2 か所に要る。
test('配る LICENSE は根のものと同じで、README は使える指定をすべて挙げる', async () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'cli', 'LICENSE'), 'utf8'), fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'));
  const readme = fs.readFileSync(path.join(ROOT, 'cli', 'README.md'), 'utf8');
  const help = (await exec(repo(), ['--help'])).out;
  const flags = new Set(help.match(/--[a-z]+/g));
  for (const flag of ['--yes', '--hosts', '--git', '--architecture', '--scope', '--check']) assert.ok(flags.has(flag), flag);
  for (const flag of flags) if (flag !== '--help' && flag !== '--version') assert.ok(readme.includes(flag), flag);
  assert.ok(readme.includes('npx @hiroiku/dotagents init'));
});
