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

test('fresh install: 配布物とリンクだけが入り、シェル層の配線は張られず、status が乖離なしになる', () => {
  const home = freshHome();
  run(home, ['install', 'user']);

  for (const rel of ['AGENTS.md', 'skills/dotagents-prompting/SKILL.md', '.gitignore']) {
    assert.ok(fs.existsSync(path.join(agentsDir(home), rel)), `${rel} が配布されている`);
  }
  assert.equal(fs.readlinkSync(path.join(home, '.claude/CLAUDE.md')), path.join(agentsDir(home), 'AGENTS.md'));
  assert.ok(!fs.lstatSync(path.join(home, '.claude/skills')).isSymbolicLink(), 'skills はディレクトリごとリンクしない');
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills/dotagents-prompting')).isSymbolicLink(), 'スキル単位でリンクする');
  assert.ok(fs.lstatSync(path.join(home, '.codex/AGENTS.md')).isSymbolicLink(), 'Codex にも AGENTS.md を張る');
  assert.ok(fs.lstatSync(path.join(home, '.codex/skills/dotagents-prompting')).isSymbolicLink(), 'Codex にもスキルを張る');

  // payload にフックが無い以上、環境断片はどこにも書かれない
  assert.ok(!fs.existsSync(path.join(home, '.zshenv')), 'zshenv は作らない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')), 'settings 断片を書かない');
  assert.ok(!fs.existsSync(path.join(home, '.codex/hooks.json')), 'codex hooks 断片を書かない');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /no drift/);
});

test('冪等: 2 回目の install は何も変更しない', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const before = read(path.join(agentsDir(home), '.dotagents.json'));
  run(home, ['install', 'user']);
  const after = JSON.parse(read(path.join(agentsDir(home), '.dotagents.json')));
  const beforeObj = JSON.parse(before);
  delete after.installedAt; delete beforeObj.installedAt;
  assert.deepEqual(after, beforeObj);
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')), '2 回目も settings を書かない');
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

test('外科的 uninstall: 自前スキルとユーザーの設定に触れず、配布物だけが消える', () => {
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
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', 'zshenv は原状のまま');
  assert.deepEqual(JSON.parse(read(path.join(home, '.claude/settings.json'))), userSettings, 'settings は原状のまま');
  assert.deepEqual(JSON.parse(read(path.join(home, '.codex/hooks.json'))), userCodexHooks, 'codex hooks は原状のまま');
});

test('旧世代の刈り込み: 過去に自分が張ったシェル層の配線は、フックの消えた payload での update が除去する', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const root = agentsDir(home);

  // 旧世代の install が張った配線を再現する(所有記録付き)
  const marker = '# agents-harness';
  fs.writeFileSync(path.join(home, '.zshenv'),
    `export MY_VAR=1\n[ -f "$HOME/.agents/hooks/shellenv.sh" ] && . "$HOME/.agents/hooks/shellenv.sh" ${marker}\n`);
  const sPath = path.join(home, '.claude/settings.json');
  fs.writeFileSync(sPath, JSON.stringify({
    env: { BASH_ENV: path.join(root, 'hooks/shellenv.sh') },
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: path.join(root, 'hooks/beads-session.sh') }] }] },
    permissions: { ask: ['Bash(git push:*)', 'Bash(gh pr merge:*)'] },
  }, null, 2) + '\n');
  const cxPath = path.join(home, '.codex/hooks.json');
  fs.writeFileSync(cxPath, JSON.stringify({
    hooks: { SessionStart: [
      { hooks: [{ type: 'command', command: 'bash /Users/x/herdr.sh session' }] },
      { hooks: [{ type: 'command', command: path.join(root, 'hooks/beads-session.sh'), timeout: 10 }] },
    ] },
  }, null, 2) + '\n');
  const mPath = path.join(root, '.dotagents.json');
  const m = JSON.parse(read(mPath));
  m.fragments = { bashEnv: true, sessionStart: true, ask: ['Bash(git push:*)'], codexSessionStart: true, refBlock: false };
  fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');

  run(home, ['update', 'user']);

  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', '管理行は除去され、ユーザーの行は残る');
  const s = JSON.parse(read(sPath));
  assert.equal(s.env?.BASH_ENV, undefined, '所有していた BASH_ENV は除去される');
  assert.equal(s.hooks, undefined, '所有していた SessionStart は除去される');
  assert.deepEqual(s.permissions.ask, ['Bash(gh pr merge:*)'], '所有していた ask だけが刈り込まれ、ユーザーのルールは残る');
  const cx = JSON.parse(read(cxPath));
  assert.equal(cx.hooks.SessionStart.length, 1, 'codex は自分の断片だけ除去する');
  assert.match(cx.hooks.SessionStart[0].hooks[0].command, /herdr/, 'ユーザーの hook は残る');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /no drift/, '刈り込み後は乖離なし');
});

test('shell スコープ: payload にシェル層が無ければ何も配らず、外科的に戻る', () => {
  const home = freshHome();
  run(home, ['install', 'shell']);

  assert.equal(manifest(agentsDir(home)).scope, 'shell');
  assert.deepEqual(manifest(agentsDir(home)).files, {}, '配る物が無い');
  assert.ok(!fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'プロンプトは入らない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'リンクを張らない');
  assert.ok(!fs.existsSync(path.join(home, '.zshenv')), 'zshenv 行も作らない');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /scope=shell/);
  assert.match(out, /no drift/);

  run(home, ['uninstall', 'user']);
  assert.ok(!fs.existsSync(path.join(home, '.agents')));
});

test('shell スコープ: update はスコープを維持し、install(user)で全量へ拡大する', () => {
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

test('project モード: 相対リンクで張り、user レベルには何も敷かない', () => {
  const home = freshHome();
  const proj = freshProject();
  run(home, ['install', 'project', proj]);
  assert.equal(fs.readlinkSync(path.join(proj, '.claude/CLAUDE.md')), '../.agents/AGENTS.md');
  assert.equal(fs.readlinkSync(path.join(proj, '.claude/skills/dotagents-prompting')), '../../.agents/skills/dotagents-prompting');
  assert.ok(!fs.existsSync(path.join(proj, '.claude/settings.local.json')), '書く断片が無ければ settings も作らない');
  assert.ok(!fs.existsSync(path.join(home, '.agents')), 'payload にシェル層が無ければ user レベルに補完しない');
  assert.ok(!fs.existsSync(path.join(home, '.zshenv')), 'zshenv にも触れない');
  run(home, ['uninstall', 'project', proj]);
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.agents ごと消える');
});

test('uninstall --keep-shell: 残すシェル層が payload に無ければ、全てが外科的に外れる', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  run(home, ['uninstall', 'user', '--keep-shell']);
  assert.ok(!fs.existsSync(path.join(home, '.agents')), '敷き直すシェル層が無いので全て消える');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'リンクも消える');
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
