// installer の業務契約(所有権の原則)を固定する。
// ここでは installer が製品であり、これらは製品の契約である(足場の検査ではない)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');

function run(home, args, opts = {}) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    if (opts.allowFail) return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
    throw e;
  }
}

function freshHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  return home;
}

function freshProject(prefix = 'dotagents-proj-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const read = (p) => fs.readFileSync(p, 'utf8');
const agentsDir = (home) => path.join(home, '.agents');
const manifest = (root) => JSON.parse(read(path.join(root, '.dotagents.json')));

test('fresh install: 配布物・リンク・環境断片が揃い、status が乖離なしになる', () => {
  const home = freshHome();
  run(home, ['install', 'user']);

  for (const rel of ['AGENTS.md', 'bin/bd', 'bin/git-guard', 'bin/agents-doctor', 'hooks/shellenv.sh', 'agents/agents-reviewer.md']) {
    assert.ok(fs.existsSync(path.join(agentsDir(home), rel)), `${rel} が配布されている`);
  }
  assert.ok(fs.statSync(path.join(agentsDir(home), 'bin/bd')).mode & 0o100, '実行ビットが保存される');
  assert.equal(fs.readlinkSync(path.join(home, '.claude/CLAUDE.md')), path.join(agentsDir(home), 'AGENTS.md'));
  assert.ok(fs.lstatSync(path.join(home, '.claude/agents/agents-reviewer.md')).isSymbolicLink());
  assert.ok(!fs.lstatSync(path.join(home, '.claude/skills')).isSymbolicLink(), 'skills はディレクトリごとリンクしない');
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills/agents-quality-loop')).isSymbolicLink(), 'スキル単位でリンクする');
  assert.match(read(path.join(home, '.zshenv')), /\[ -f "\$HOME\/\.agents\/hooks\/shellenv\.sh" \] && \./);
  const settings = JSON.parse(read(path.join(home, '.claude/settings.json')));
  assert.equal(settings.env.BASH_ENV, path.join(agentsDir(home), 'hooks/shellenv.sh'));
  assert.ok(settings.permissions.ask.includes('Bash(git push:*)'));
  const codexHooks = JSON.parse(read(path.join(home, '.codex/hooks.json')));
  assert.ok(codexHooks.hooks.SessionStart.some((m) => m.hooks.some((h) => h.command.includes('beads-session.sh'))),
    'Codex にも SessionStart 断片が配られる');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /no drift/);
});

test('冪等: 2 回目の install は何も変更しない', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const before = read(path.join(agentsDir(home), '.dotagents.json'));
  const settingsBefore = read(path.join(home, '.claude/settings.json'));
  run(home, ['install', 'user']);
  const after = JSON.parse(read(path.join(agentsDir(home), '.dotagents.json')));
  const beforeObj = JSON.parse(before);
  delete after.installedAt; delete beforeObj.installedAt;
  assert.deepEqual(after, beforeObj);
  assert.equal(read(path.join(home, '.claude/settings.json')), settingsBefore);
});

test('改変保護: ユーザーが編集したファイルは update が触れず警告し、--force でのみ上書きする', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const target = path.join(agentsDir(home), 'AGENTS.md');
  fs.appendFileSync(target, '\n# user edit\n');
  const edited = read(target);

  const r = run(home, ['update', 'user'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.equal(read(target), edited, '改変は保持される');

  run(home, ['update', 'user', '--force']);
  assert.ok(!read(target).includes('# user edit'), '--force で payload の内容に戻る');
});

test('リンク所有権: インストール前から存在した同内容リンクは uninstall が残す', () => {
  const home = freshHome();
  fs.mkdirSync(path.join(agentsDir(home), 'skills'), { recursive: true });
  fs.symlinkSync(path.join(agentsDir(home), 'skills'), path.join(home, '.claude/skills'));
  run(home, ['install', 'user']);
  run(home, ['uninstall', 'user']);
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills')).isSymbolicLink(), '既存リンクは残る');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), '自作リンクは消える');
});

test('外科的 uninstall: 自前スキルを残し、zshenv と settings を原状復帰する', () => {
  const home = freshHome();
  fs.mkdirSync(path.join(agentsDir(home), 'skills/my-own-skill'), { recursive: true });
  fs.writeFileSync(path.join(agentsDir(home), 'skills/my-own-skill/SKILL.md'), '# mine\n');
  fs.writeFileSync(path.join(home, '.zshenv'), 'export MY_VAR=1\n');
  const userSettings = { model: 'opus', permissions: { allow: ['Bash'] } };
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify(userSettings, null, 2) + '\n');
  const userCodexHooks = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'bash /Users/x/herdr.sh session' }] }] } };
  fs.writeFileSync(path.join(home, '.codex/hooks.json'), JSON.stringify(userCodexHooks, null, 2) + '\n');

  run(home, ['install', 'user']);
  run(home, ['uninstall', 'user']);

  assert.ok(fs.existsSync(path.join(agentsDir(home), 'skills/my-own-skill/SKILL.md')), '自前スキルは残る');
  assert.ok(!fs.existsSync(path.join(agentsDir(home), 'AGENTS.md')), '配布物は消える');
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', 'zshenv は原状復帰');
  assert.deepEqual(JSON.parse(read(path.join(home, '.claude/settings.json'))), userSettings, 'settings は原状復帰');
  assert.deepEqual(JSON.parse(read(path.join(home, '.codex/hooks.json'))), userCodexHooks, 'codex hooks は自分の断片だけ除去され原状復帰');
});

test('shell スコープ: 強制則の層だけが入り、プロンプトへの影響を持たず、外科的に戻る', () => {
  const home = freshHome();
  run(home, ['install', 'shell']);

  assert.ok(fs.existsSync(path.join(home, '.agents/bin/bd')), 'ガードは入る');
  assert.ok(fs.existsSync(path.join(home, '.agents/hooks/shellenv.sh')), '配達フックは入る');
  assert.ok(!fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'プロンプトは入らない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'リンクを張らない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')), 'settings 断片を書かない');
  assert.match(read(path.join(home, '.zshenv')), /agents-harness/, 'zshenv 行だけが環境断片');
  assert.equal(manifest(agentsDir(home)).scope, 'shell');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /scope=shell/);
  assert.match(out, /no drift/);

  run(home, ['uninstall', 'user']);
  assert.ok(!fs.existsSync(path.join(home, '.agents')));
  assert.ok(!read(path.join(home, '.zshenv')).includes('agents-harness'));
});

test('settings 断片: defs から消えた自分所有の ask ルールだけを update が刈り込む', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const sPath = path.join(home, '.claude/settings.json');
  const s = JSON.parse(read(sPath));
  s.permissions.ask.push('Bash(git merge:*)');   // 旧世代で自分が足した扱いにする
  s.permissions.ask.push('Bash(gh pr merge:*)'); // ユーザー自身のルール(所有外)
  fs.writeFileSync(sPath, JSON.stringify(s, null, 2) + '\n');
  const mPath = path.join(home, '.agents/.dotagents.json');
  const m = JSON.parse(read(mPath));
  m.fragments.ask.push('Bash(git merge:*)');
  fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');

  run(home, ['update', 'user']);
  const after = JSON.parse(read(sPath)).permissions.ask;
  assert.ok(!after.includes('Bash(git merge:*)'), '所有していた旧ルールは刈り込まれる');
  assert.ok(after.includes('Bash(git push:*)'), '現行 defs のルールは残る');
  assert.ok(after.includes('Bash(gh pr merge:*)'), '所有外のユーザールールには触れない');
});

test('shell スコープ: update はスコープを維持し、install(--user)で全量へ拡大する', () => {
  const home = freshHome();
  run(home, ['install', 'shell']);
  run(home, ['update', 'user']);
  assert.equal(manifest(agentsDir(home)).scope, 'shell', 'update は縮小スコープを保つ');
  assert.ok(!fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'プロンプトは入ってこない');
  run(home, ['install', 'user']);
  assert.equal(manifest(agentsDir(home)).scope, 'full', 'install で全量へ拡大');
  assert.ok(fs.existsSync(path.join(home, '.agents/AGENTS.md')));
});

test('project(git repo): 配布物の .agents/.gitignore がマシン固有の生成物を版管理から外す', () => {
  const home = freshHome();
  const proj = freshProject('dotagents-gitproj-');
  execFileSync('git', ['init', '-q'], { cwd: proj });
  run(home, ['install', 'project', proj]);

  assert.ok(fs.existsSync(path.join(proj, '.agents/.gitignore')), '.gitignore が配布される');
  const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: proj, encoding: 'utf8' });
  assert.ok(!status.includes('.dotagents.json'), 'manifest は untracked に現れない');
  assert.ok(status.includes('.agents/AGENTS.md'), '配布物自体は版管理の対象に見える');

  run(home, ['uninstall', 'project', proj]);
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.gitignore ごと外科的に消える');
});

test('参照ブロック: 既存の root AGENTS.md にだけマーカー付きで足し、uninstall で原状復帰する', () => {
  const home = freshHome();
  const proj = freshProject('dotagents-refproj-');
  fs.writeFileSync(path.join(proj, 'AGENTS.md'), '# my project rules\n');
  run(home, ['install', 'project', proj]);
  const t = read(path.join(proj, 'AGENTS.md'));
  assert.match(t, /agents-harness:begin/);
  assert.match(t, /\.agents\/AGENTS\.md/);

  run(home, ['update', 'project', proj]);
  assert.equal((read(path.join(proj, 'AGENTS.md')).match(/agents-harness:begin/g) || []).length, 1, '冪等');

  run(home, ['uninstall', 'project', proj]);
  assert.equal(read(path.join(proj, 'AGENTS.md')), '# my project rules\n', '原状復帰');

  const proj2 = freshProject('dotagents-refproj-');
  run(home, ['install', 'project', proj2]);
  assert.ok(!fs.existsSync(path.join(proj2, 'AGENTS.md')), '無いプロジェクトには作らない');
  run(home, ['uninstall', 'project', proj2]);
});

test('project モード: 相対リンクで張り、断片は settings.local.json に書く', () => {
  const home = freshHome();
  const proj = freshProject();
  run(home, ['install', 'project', proj]);
  assert.equal(fs.readlinkSync(path.join(proj, '.claude/CLAUDE.md')), '../.agents/AGENTS.md');
  assert.equal(fs.readlinkSync(path.join(proj, '.claude/skills/agents-kickoff')), '../../.agents/skills/agents-kickoff');
  assert.ok(fs.existsSync(path.join(proj, '.claude/settings.local.json')));
  assert.ok(!fs.existsSync(path.join(proj, '.claude/settings.json')), '版管理対象の settings.json には書かない');
  run(home, ['uninstall', 'project', proj]);
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.agents ごと消える');
});

// ---------------------------------------------------------------- 対象の確定

test('対象は既定値で決まらない: 非対話でフラグを欠くと、何も書かずに止まる', () => {
  const home = freshHome();
  for (const cmd of ['install', 'update', 'uninstall', 'status']) {
    const r = run(home, [cmd], { allowFail: true });
    assert.equal(r.code, 1, `${cmd} は対象未指定で止まる`);
    assert.match(r.out, /no target given/, `${cmd} は対象の指定を促す`);
    assert.match(r.out, new RegExp(`agents-setup ${cmd} user`), `${cmd} は正しい形を示す`);
    assert.match(r.out, new RegExp(`agents-setup ${cmd} project`));
  }
  assert.ok(!fs.existsSync(agentsDir(home)), '止まった以上、何も書いていない');
  assert.ok(!fs.existsSync(path.join(home, '.zshenv')));
});

test('対象は 1 つしか書けない: 複数の対象・余剰引数・不明な引数は何も書かずに止まる', () => {
  const home = freshHome();
  const cases = [
    [['install', 'user', 'project'], /pick exactly one target/],
    [['install', 'shell', 'project'], /pick exactly one target/],
    [['install', 'user', '/tmp/x'], /only `project` takes a directory/],
    [['install', 'shell', '/tmp/x'], /only `project` takes a directory/],
    [['install', 'project', '/tmp/x', 'extra'], /too many arguments/],
    [['install', 'nowhere'], /unknown target/],
    [['install', '--bogus'], /unknown argument/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(home, args, { allowFail: true });
    assert.equal(r.code, 1, `${args.join(' ')} は止まる`);
    assert.match(r.out, pattern, `${args.join(' ')} は理由を示す`);
  }
  assert.ok(!fs.existsSync(agentsDir(home)), '止まった以上、何も書いていない');
});

test('廃止フラグ: 旧インタフェースはエイリアスとして生かさず、正しい形へ案内する', () => {
  const home = freshHome();
  for (const flag of ['--user', '--project', '--shell']) {
    const r = run(home, ['install', flag], { allowFail: true });
    assert.equal(r.code, 1, `${flag} は動作しない`);
    assert.match(r.out, /is retired/);
    assert.match(r.out, /user \| project \[<dir>\] \| shell/, '位置引数の形を示す');
  }
  assert.ok(!fs.existsSync(agentsDir(home)), '止まった以上、何も書いていない');
});

test('project のディレクトリは省略できる(カレントディレクトリ)。後続のフラグは値にならない', () => {
  const home = freshHome();
  const proj = freshProject();
  execFileSync(process.execPath, [CLI, 'install', 'project', '--force'], {
    env: { ...process.env, HOME: home }, cwd: proj, encoding: 'utf8',
  });
  assert.ok(fs.existsSync(path.join(proj, '.agents/AGENTS.md')), 'cwd がプロジェクトになる');
  assert.equal(manifest(path.join(proj, '.agents')).kind, 'project');
});

test('help: 全体とコマンドごとの両方が --help / -h で引ける', () => {
  const home = freshHome();
  const overall = run(home, ['--help']);
  assert.match(overall.out, /agents-setup <command> \[target\] \[options\]/);
  for (const cmd of ['install', 'update', 'uninstall', 'status']) {
    assert.match(overall.out, new RegExp(`^  ${cmd}\\b`, 'm'), `${cmd} が一覧に出る`);
  }

  for (const args of [['install', '--help'], ['install', '-h']]) {
    const r = run(home, args);
    assert.match(r.out, /agents-setup install <target> \[options\]/, `${args.join(' ')} は install の説明を出す`);
    assert.match(r.out, /--force/, 'そのコマンドのオプションを出す');
    assert.ok(!r.out.includes('--keep-shell'), '他コマンドのオプションは出さない');
  }
  assert.match(run(home, ['uninstall', '--help']).out, /--keep-shell/);
  assert.ok(!run(home, ['uninstall', '--help']).out.includes('--force'), 'uninstall に --force は出さない');

  assert.equal(run(home, []).out, overall.out, '引数なしは --help と同じ');
  assert.match(run(home, ['--version']).out.trim(), /^\d+\.\d+\.\d+$/);
  assert.ok(!fs.existsSync(agentsDir(home)), 'ヘルプは何も書かない');
});

test('unknown command: 使い方を丸ごと吐かず、理由と入口だけを示して止まる', () => {
  const r = run(freshHome(), ['bogus'], { allowFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /unknown command: bogus/);
  assert.match(r.out, /agents-setup --help/);
});

// ---------------------------------------------------------------- シェル層(共有資源)

test('シェル層の補完: project install はユーザーレベルのガード配達を最小形で敷く', () => {
  const home = freshHome();
  const proj = freshProject();
  run(home, ['install', 'project', proj]);

  assert.ok(fs.existsSync(path.join(home, '.agents/hooks/shellenv.sh')), '配達フックが補完される');
  assert.ok(fs.existsSync(path.join(home, '.agents/bin/git-guard')), 'ガードが補完される');
  assert.match(read(path.join(home, '.zshenv')), /agents-harness/, 'zsh への配達行が入る');
  assert.equal(manifest(agentsDir(home)).scope, 'shell', '補完は最小形(プロンプトは持ち込まない)');
  assert.ok(!fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'ユーザーレベルにプロンプトは入らない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'ユーザーレベルにリンクは張らない');

  // 2 回目は既に ok なので何も足さない
  const before = read(path.join(home, '.zshenv'));
  run(home, ['install', 'project', freshProject()]);
  assert.equal(read(path.join(home, '.zshenv')), before, '冪等(管理行は 1 本のまま)');
});

test('シェル層の補完: 既存のユーザーレベル full を shell へ縮小しない', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  fs.writeFileSync(path.join(home, '.zshenv'), 'export MY_VAR=1\n'); // 配達行だけ失われた状態

  run(home, ['install', 'project', freshProject()]);

  assert.match(read(path.join(home, '.zshenv')), /agents-harness/, '欠けた配達行は修復される');
  assert.equal(manifest(agentsDir(home)).scope, 'full', 'scope は full のまま');
  assert.ok(fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'プロンプト層は失われない');
  assert.ok(fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'リンクも失われない');
});

test('シェル層の保護: project の uninstall は共有資源に触れない', () => {
  const home = freshHome();
  const proj = freshProject();
  run(home, ['install', 'project', proj]);
  run(home, ['uninstall', 'project', proj]);

  assert.ok(!fs.existsSync(path.join(proj, '.agents')), 'プロジェクト側は消える');
  assert.ok(fs.existsSync(path.join(home, '.agents/hooks/shellenv.sh')), '他プロジェクトが使う配達は残る');
  assert.match(read(path.join(home, '.zshenv')), /agents-harness/, 'zshenv 管理行も残る');
});

test('シェル層の保護: uninstall --user --keep-shell はプロンプト層だけ外し、ガードを残す', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  run(home, ['uninstall', 'user', '--keep-shell']);

  assert.ok(!fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'プロンプトは消える');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'リンクは消える');
  assert.ok(!JSON.parse(read(path.join(home, '.claude/settings.json'))).env?.BASH_ENV, 'settings 断片も消える');
  assert.ok(fs.existsSync(path.join(home, '.agents/hooks/shellenv.sh')), 'ガード配達は残る');
  assert.ok(fs.existsSync(path.join(home, '.agents/bin/git-guard')), 'ガード本体も残る');
  assert.match(read(path.join(home, '.zshenv')), /agents-harness/, 'zshenv 管理行も残る');
  assert.equal(manifest(agentsDir(home)).scope, 'shell', '最小形へ縮小して所有を保つ');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /no drift/, '残した層は所有として整合している');

  run(home, ['uninstall', 'user']);
  assert.ok(!fs.existsSync(path.join(home, '.agents')), '最終的には外科的に消える');
});
