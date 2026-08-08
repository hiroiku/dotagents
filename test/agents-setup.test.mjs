// installer の業務契約(所有権の原則)を固定する。
// ここでは installer が製品であり、これらは製品の契約である(足場の検査ではない)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
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
const sha = (p) => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const stateDir = (home) => path.join(home, '.dotagents');
const userManifest = (home) => JSON.parse(read(path.join(stateDir(home), 'user.json')));

function projectManifest(home, proj) {
  const dir = path.join(stateDir(home), 'projects');
  const real = fs.realpathSync(proj);
  for (const f of fs.readdirSync(dir)) {
    const m = JSON.parse(read(path.join(dir, f)));
    if (m.base === real) return m;
  }
  return null;
}

const RULES = read(path.join(REPO, 'payload', 'AGENTS.md')).trim();

test('fresh install(user): 実ファイルのコピーと規則ブロックだけが入り、.agents も symlink も作らない', () => {
  const home = freshHome();
  run(home, ['install', 'user']);

  const skill = path.join(home, '.claude/skills/dotagents-prompting/SKILL.md');
  assert.ok(fs.existsSync(skill), 'スキルが .claude に実ファイルで入る');
  assert.ok(!fs.lstatSync(path.join(home, '.claude/skills/dotagents-prompting')).isSymbolicLink(), 'symlink ではない');
  assert.equal(read(skill), read(path.join(REPO, 'payload/skills/dotagents-prompting/SKILL.md')), '内容は payload と同一');
  assert.ok(fs.existsSync(path.join(home, '.codex/skills/dotagents-prompting/SKILL.md')), 'Codex にも実ファイルで入る');
  assert.ok(fs.existsSync(path.join(home, '.claude/agents/dotagents-review.md')), 'エージェント定義が入る');
  assert.ok(!fs.existsSync(path.join(home, '.codex/agents')), 'Codex にエージェント定義の置き場は無い');

  const claudeMd = read(path.join(home, '.claude/CLAUDE.md'));
  assert.match(claudeMd, /agents-harness:begin/, 'CLAUDE.md に規則ブロックが入る');
  assert.ok(claudeMd.includes(RULES), 'ブロックの中身は payload/AGENTS.md 全文');
  assert.ok(read(path.join(home, '.codex/AGENTS.md')).includes(RULES), '.codex/AGENTS.md にも規則ブロックが入る');

  assert.ok(!fs.existsSync(path.join(home, '.agents')), '.agents は作らない');
  assert.ok(!fs.existsSync(path.join(home, '.zshenv')), 'zshenv に触れない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/README.md')), '解説(README)は配備しない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/docs')), '解説の翻訳も配備しない');
  assert.equal(userManifest(home).kind, 'user', 'manifest は ~/.dotagents/user.json');
  assert.ok(!fs.existsSync(path.join(home, '.claude/.dotagents.json')), '配備先に manifest を残さない');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /no drift/);
});

test('冪等: 2 回目の install は何も変更しない', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const before = read(path.join(stateDir(home), 'user.json'));
  const claudeMdBefore = read(path.join(home, '.claude/CLAUDE.md'));
  run(home, ['install', 'user']);
  const after = userManifest(home);
  const beforeObj = JSON.parse(before);
  delete after.installedAt; delete beforeObj.installedAt;
  assert.deepEqual(after, beforeObj);
  assert.equal(read(path.join(home, '.claude/CLAUDE.md')), claudeMdBefore, '規則ブロックも書き直さない');
});

test('改変保護: ユーザーが編集したファイルは update が触れず警告し、--force でのみ上書きする', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const target = path.join(home, '.claude/skills/dotagents-prompting/SKILL.md');
  fs.appendFileSync(target, '\n# user edit\n');
  const edited = read(target);

  const r = run(home, ['update', 'user'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.equal(read(target), edited, '改変は保持される');

  run(home, ['update', 'user', '--force']);
  assert.ok(!read(target).includes('# user edit'), '--force で payload の内容に戻る');
});

test('規則ブロックの共存: 既存の CLAUDE.md には追記し、uninstall で原状復帰する', () => {
  const home = freshHome();
  const own = '# my own global rules\n\n- be nice\n';
  fs.writeFileSync(path.join(home, '.claude/CLAUDE.md'), own);

  run(home, ['install', 'user']);
  const t = read(path.join(home, '.claude/CLAUDE.md'));
  assert.ok(t.startsWith('# my own global rules'), 'ユーザーの記述が先頭に残る');
  assert.ok(t.includes(RULES), '規則ブロックが追記される');

  run(home, ['update', 'user']);
  assert.equal((read(path.join(home, '.claude/CLAUDE.md')).match(/agents-harness:begin/g) || []).length, 1, '冪等');

  run(home, ['uninstall', 'user']);
  assert.equal(read(path.join(home, '.claude/CLAUDE.md')), own, 'ユーザーのファイルは原状復帰');
  assert.ok(!fs.existsSync(path.join(home, '.codex/AGENTS.md')), '自分が作った規則ファイルはファイルごと消える');
});

test('外科的 uninstall: 自前スキルとユーザーの設定に触れず、配布物だけが消える', () => {
  const home = freshHome();
  fs.mkdirSync(path.join(home, '.claude/skills/my-own-skill'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/skills/my-own-skill/SKILL.md'), '# mine\n');
  fs.writeFileSync(path.join(home, '.zshenv'), 'export MY_VAR=1\n');
  const userSettings = { model: 'opus', permissions: { allow: ['Bash'] } };
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify(userSettings, null, 2) + '\n');

  run(home, ['install', 'user']);
  run(home, ['uninstall', 'user']);

  assert.ok(fs.existsSync(path.join(home, '.claude/skills/my-own-skill/SKILL.md')), '自前スキルは残る');
  assert.ok(!fs.existsSync(path.join(home, '.claude/skills/dotagents-prompting')), '配布スキルは消える');
  assert.ok(!fs.existsSync(path.join(home, '.claude/agents/dotagents-review.md')), 'エージェント定義も消える');
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', 'zshenv は原状のまま');
  assert.deepEqual(JSON.parse(read(path.join(home, '.claude/settings.json'))), userSettings, 'settings は原状のまま');
  assert.ok(fs.existsSync(path.join(home, '.codex')), '既存の .codex は空になっても残る');
  assert.ok(!fs.existsSync(stateDir(home)), '記録が尽きたら ~/.dotagents も残さない');
});

test('外科的 uninstall: 改変された配布ファイルは残す', () => {
  const home = freshHome();
  run(home, ['install', 'user']);
  const target = path.join(home, '.claude/skills/dotagents-prompting/SKILL.md');
  fs.appendFileSync(target, '\n# user edit\n');
  run(home, ['uninstall', 'user']);
  assert.ok(fs.existsSync(target), '改変ファイルは消さない');
  assert.ok(read(target).includes('# user edit'), '内容もそのまま');
});

test('旧レイアウトの移行: .agents・symlink・zshenv 行・settings 断片を update が刈り込み、新レイアウトを敷く', () => {
  const home = freshHome();
  const root = path.join(home, '.agents');

  // 旧世代の install が置いた物を再現する(所有記録付き)
  fs.mkdirSync(path.join(root, 'skills/dotagents-prompting'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'payload/AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.copyFileSync(path.join(REPO, 'payload/skills/dotagents-prompting/SKILL.md'),
    path.join(root, 'skills/dotagents-prompting/SKILL.md'));
  const links = [
    { link: path.join(home, '.claude/CLAUDE.md'), target: path.join(root, 'AGENTS.md'), created: true },
    { link: path.join(home, '.claude/skills/dotagents-prompting'), target: path.join(root, 'skills/dotagents-prompting'), created: true },
    { link: path.join(home, '.codex/AGENTS.md'), target: path.join(root, 'AGENTS.md'), created: true },
  ];
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  for (const l of links) fs.symlinkSync(l.target, l.link);
  const marker = '# agents-harness';
  fs.writeFileSync(path.join(home, '.zshenv'),
    `export MY_VAR=1\n[ -f "$HOME/.agents/hooks/shellenv.sh" ] && . "$HOME/.agents/hooks/shellenv.sh" ${marker}\n`);
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify({
    env: { BASH_ENV: path.join(root, 'hooks/shellenv.sh') },
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: path.join(root, 'hooks/beads-session.sh') }] }] },
    permissions: { ask: ['Bash(git push:*)', 'Bash(gh pr merge:*)'] },
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(home, '.codex/hooks.json'), JSON.stringify({
    hooks: { SessionStart: [
      { hooks: [{ type: 'command', command: 'bash /Users/x/herdr.sh session' }] },
      { hooks: [{ type: 'command', command: path.join(root, 'hooks/beads-session.sh'), timeout: 10 }] },
    ] },
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, '.dotagents.json'), JSON.stringify({
    schema: 1, kind: 'user', scope: 'full', version: '1.0.0', source: REPO,
    files: {
      'AGENTS.md': sha(path.join(root, 'AGENTS.md')),
      'skills/dotagents-prompting/SKILL.md': sha(path.join(root, 'skills/dotagents-prompting/SKILL.md')),
    },
    links,
    fragments: { bashEnv: true, sessionStart: true, ask: ['Bash(git push:*)'], codexSessionStart: true, refBlock: false },
  }, null, 2) + '\n');

  run(home, ['update', 'user']);

  assert.ok(!fs.existsSync(root), '.agents はディレクトリごと消える');
  assert.ok(!fs.lstatSync(path.join(home, '.claude/CLAUDE.md')).isSymbolicLink(), 'CLAUDE.md は実ファイルになる');
  assert.ok(read(path.join(home, '.claude/CLAUDE.md')).includes(RULES), '規則ブロックが入る');
  assert.ok(!fs.lstatSync(path.join(home, '.claude/skills/dotagents-prompting')).isSymbolicLink(), 'スキルは実体になる');
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', '管理行は除去され、ユーザーの行は残る');
  const s = JSON.parse(read(path.join(home, '.claude/settings.json')));
  assert.equal(s.env?.BASH_ENV, undefined, '所有していた BASH_ENV は除去される');
  assert.equal(s.hooks, undefined, '所有していた SessionStart は除去される');
  assert.deepEqual(s.permissions.ask, ['Bash(gh pr merge:*)'], '所有していた ask だけが刈り込まれる');
  const cx = JSON.parse(read(path.join(home, '.codex/hooks.json')));
  assert.equal(cx.hooks.SessionStart.length, 1, 'codex は自分の断片だけ除去する');
  assert.match(cx.hooks.SessionStart[0].hooks[0].command, /herdr/, 'ユーザーの hook は残る');

  const { out } = run(home, ['status', 'user']);
  assert.match(out, /no drift/, '移行後は乖離なし');
});

test('旧レイアウトの残存: status は乖離として報告し、uninstall は legacy だけでも外科的に外す', () => {
  const home = freshHome();
  const root = path.join(home, '.agents');
  fs.mkdirSync(root, { recursive: true });
  fs.copyFileSync(path.join(REPO, 'payload/AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.symlinkSync(path.join(root, 'AGENTS.md'), path.join(home, '.claude/CLAUDE.md'));
  fs.writeFileSync(path.join(root, '.dotagents.json'), JSON.stringify({
    schema: 1, kind: 'user', scope: 'full', version: '1.0.0', source: REPO,
    files: { 'AGENTS.md': sha(path.join(root, 'AGENTS.md')) },
    links: [{ link: path.join(home, '.claude/CLAUDE.md'), target: path.join(root, 'AGENTS.md'), created: true }],
    fragments: {},
  }, null, 2) + '\n');

  const st = run(home, ['status', 'user'], { allowFail: true });
  assert.equal(st.code, 1, '旧レイアウトの残存は乖離');
  assert.match(st.out, /legacy layout/);

  run(home, ['uninstall', 'user']);
  assert.ok(!fs.existsSync(root), '.agents ごと消える');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), '旧リンクも消える');
});

test('移行の頑健性: 所有記録に無い .agents 向き symlink が残っていても、update は完走して実体を敷く', () => {
  const home = freshHome();
  const root = path.join(home, '.agents');
  fs.mkdirSync(path.join(root, 'skills/dotagents-prompting'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'payload/AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.copyFileSync(path.join(REPO, 'payload/skills/dotagents-prompting/SKILL.md'),
    path.join(root, 'skills/dotagents-prompting/SKILL.md'));
  // ユーザーの手張り(旧 manifest の links に記録が無い)symlink
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(path.join(root, 'AGENTS.md'), path.join(home, '.claude/CLAUDE.md'));
  fs.symlinkSync(path.join(root, 'skills/dotagents-prompting'), path.join(home, '.claude/skills/dotagents-prompting'));
  fs.writeFileSync(path.join(root, '.dotagents.json'), JSON.stringify({
    schema: 1, kind: 'user', scope: 'full', version: '1.0.0', source: REPO,
    files: {
      'AGENTS.md': sha(path.join(root, 'AGENTS.md')),
      'skills/dotagents-prompting/SKILL.md': sha(path.join(root, 'skills/dotagents-prompting/SKILL.md')),
    },
    links: [],
    fragments: {},
  }, null, 2) + '\n');

  run(home, ['update', 'user']);

  assert.ok(!fs.existsSync(root), '.agents は消える');
  assert.ok(!fs.lstatSync(path.join(home, '.claude/CLAUDE.md')).isSymbolicLink(), '切れたリンクは実体に置き換わる');
  assert.ok(!fs.lstatSync(path.join(home, '.claude/skills/dotagents-prompting')).isSymbolicLink(), 'スキルも実体になる');
  const { out } = run(home, ['status', 'user']);
  assert.match(out, /no drift/, '移行後は乖離なし');
});

test('生きた手張り symlink は上書きせず、警告して退く', () => {
  const home = freshHome();
  const mine = path.join(home, 'my-skills/dotagents-prompting');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'SKILL.md'), '# my very own\n');
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(mine, path.join(home, '.claude/skills/dotagents-prompting'));

  const r = run(home, ['install', 'user'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills/dotagents-prompting')).isSymbolicLink(), 'リンクは残る');
  assert.equal(read(path.join(mine, 'SKILL.md')), '# my very own\n', 'リンク先を書き換えない');
  assert.equal(userManifest(home).files['.claude/skills/dotagents-prompting/SKILL.md'], undefined, '所有記録に入れない');
});

test('project install: プロジェクトの .claude/ に実ファイルで入り、マシン固有の物を何も残さない', () => {
  const home = freshHome();
  const proj = freshProject();
  execFileSync('git', ['init', '-q'], { cwd: proj });
  run(home, ['install', 'project', proj]);

  assert.ok(fs.existsSync(path.join(proj, '.claude/skills/dotagents-prompting/SKILL.md')), 'スキルが実ファイルで入る');
  assert.ok(!fs.lstatSync(path.join(proj, '.claude/skills/dotagents-prompting')).isSymbolicLink(), 'symlink ではない');
  assert.ok(read(path.join(proj, '.claude/CLAUDE.md')).includes(RULES), 'CLAUDE.md が作られブロックが入る');
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.agents は作らない');
  assert.ok(!fs.existsSync(path.join(proj, '.codex')), '.codex が無いプロジェクトには作らない');
  assert.ok(!fs.existsSync(path.join(proj, 'AGENTS.md')), 'root AGENTS.md が無いプロジェクトには作らない');
  assert.ok(!fs.existsSync(path.join(proj, '.claude/README.md')), '解説は配備しない');

  const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: proj, encoding: 'utf8' });
  assert.ok(!status.includes('dotagents.json'), 'manifest はプロジェクトに現れない(~/.dotagents に置く)');
  assert.ok(status.split('\n').filter(Boolean).every((l) => l.includes('.claude/')), '増えるのは .claude/ 配下だけ');
  assert.equal(projectManifest(home, proj).kind, 'project');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'user レベルには何も敷かない');

  run(home, ['uninstall', 'project', proj]);
  assert.ok(!fs.existsSync(path.join(proj, '.claude/CLAUDE.md')), '自分が作った規則ファイルは消える');
  assert.ok(!fs.existsSync(path.join(proj, '.claude/skills/dotagents-prompting')), 'スキルも消える');
});

test('root AGENTS.md ブロック: 既存のファイルにだけ足し、uninstall で原状復帰する', () => {
  const home = freshHome();
  const proj = freshProject('dotagents-refproj-');
  fs.writeFileSync(path.join(proj, 'AGENTS.md'), '# my project rules\n');
  run(home, ['install', 'project', proj]);
  const t = read(path.join(proj, 'AGENTS.md'));
  assert.match(t, /agents-harness:begin/);
  assert.ok(t.includes(RULES), '参照ではなく規則の全文が入る');

  run(home, ['update', 'project', proj]);
  assert.equal((read(path.join(proj, 'AGENTS.md')).match(/agents-harness:begin/g) || []).length, 1, '冪等');

  run(home, ['uninstall', 'project', proj]);
  assert.equal(read(path.join(proj, 'AGENTS.md')), '# my project rules\n', '原状復帰');
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
  assert.ok(!fs.existsSync(stateDir(home)), '止まった以上、何も書いていない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')));
});

test('対象は 1 つしか書けない: 複数の対象・余剰引数・不明な引数は何も書かずに止まる', () => {
  const home = freshHome();
  const cases = [
    [['install', 'user', 'project'], /pick exactly one target/],
    [['install', 'user', '/tmp/x'], /only `project` takes a directory/],
    [['install', 'project', '/tmp/x', 'extra'], /too many arguments/],
    [['install', 'nowhere'], /unknown target: nowhere \(expected user or project\)/],
    [['install', 'shell'], /`shell` target is retired/],
    [['install', '--bogus'], /unknown argument/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(home, args, { allowFail: true });
    assert.equal(r.code, 1, `${args.join(' ')} は止まる`);
    assert.match(r.out, pattern, `${args.join(' ')} は理由を示す`);
  }
  assert.ok(!fs.existsSync(stateDir(home)), '止まった以上、何も書いていない');
});

test('廃止フラグ: 旧インタフェースはエイリアスとして生かさず、正しい形へ案内する', () => {
  const home = freshHome();
  for (const flag of ['--user', '--project', '--shell']) {
    const r = run(home, ['install', flag], { allowFail: true });
    assert.equal(r.code, 1, `${flag} は動作しない`);
    assert.match(r.out, /is retired/);
    assert.match(r.out, /user \| project \[<dir>\]/, '位置引数の形を示す');
  }
  const ks = run(home, ['uninstall', 'user', '--keep-shell'], { allowFail: true });
  assert.equal(ks.code, 1, '--keep-shell は動作しない');
  assert.match(ks.out, /--keep-shell is retired/, '理由と正しい形を案内する');
  assert.ok(!fs.existsSync(stateDir(home)), '止まった以上、何も書いていない');
});

test('project のディレクトリは省略できる(カレントディレクトリ)。後続のフラグは値にならない', () => {
  const home = freshHome();
  const proj = freshProject();
  execFileSync(process.execPath, [CLI, 'install', 'project', '--force'], {
    env: { ...process.env, HOME: home }, cwd: proj, encoding: 'utf8',
  });
  assert.ok(fs.existsSync(path.join(proj, '.claude/CLAUDE.md')), 'cwd がプロジェクトになる');
  assert.equal(projectManifest(home, proj).kind, 'project');
});

test('help: 全体とコマンドごとの両方が --help / -h で引ける', () => {
  const home = freshHome();
  const overall = run(home, ['--help']);
  assert.match(overall.out, /agents-setup <command> \[target\] \[options\]/);
  for (const cmd of ['install', 'update', 'uninstall', 'status']) {
    assert.match(overall.out, new RegExp(`^  ${cmd}\\b`, 'm'), `${cmd} が一覧に出る`);
  }
  assert.ok(!overall.out.includes('--keep-shell'), '廃止した shell 層の語彙は出ない');

  for (const args of [['install', '--help'], ['install', '-h']]) {
    const r = run(home, args);
    assert.match(r.out, /agents-setup install <target> \[options\]/, `${args.join(' ')} は install の説明を出す`);
    assert.match(r.out, /--force/, 'そのコマンドのオプションを出す');
  }
  assert.ok(!run(home, ['uninstall', '--help']).out.includes('--force'), 'uninstall に --force は出さない');

  assert.equal(run(home, []).out, overall.out, '引数なしは --help と同じ');
  assert.match(run(home, ['--version']).out.trim(), /^\d+\.\d+\.\d+$/);
  assert.ok(!fs.existsSync(stateDir(home)), 'ヘルプは何も書かない');
});

test('unknown command: 使い方を丸ごと吐かず、理由と入口だけを示して止まる', () => {
  const r = run(freshHome(), ['bogus'], { allowFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /unknown command: bogus/);
  assert.match(r.out, /agents-setup --help/);
});
