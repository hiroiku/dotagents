// installer の契約(配達先・所有権・引数の形)を固定する。
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
    const out = execFileSync(process.execPath, [opts.cli ?? CLI, ...args], {
      env: { ...process.env, HOME: home, ...opts.env },
      cwd: opts.cwd,
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

// module を 2 つ持つ小さな正本。加算・減算の契約は module が複数ないと確かめられない。
function makeCorpus() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-corpus-'));
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true }); // isCorpus の判定材料
  fs.copyFileSync(CLI, path.join(dir, 'bin', 'agents-setup'));
  fs.copyFileSync(path.join(REPO, 'package.json'), path.join(dir, 'package.json'));
  fs.cpSync(path.join(REPO, 'modules', 'harness'), path.join(dir, 'modules', 'harness'), { recursive: true });
  const demo = path.join(dir, 'modules', 'demo');
  fs.mkdirSync(path.join(demo, 'skills', 'demo-skill'), { recursive: true });
  fs.writeFileSync(path.join(demo, 'module.json'), JSON.stringify({
    description: '試験用の module',
    requires: ['definitely-not-a-real-command'],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(demo, 'skills', 'demo-skill', 'SKILL.md'), '---\ndescription: demo\n---\n\n# demo\n');
  return { dir, cli: path.join(dir, 'bin', 'agents-setup') };
}

const read = (p) => fs.readFileSync(p, 'utf8');
const sha = (p) => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const agentsHome = (home) => path.join(home, '.dotagents');
const stateDir = (home) => path.join(agentsHome(home), 'state');
const personalModules = (home) => path.join(agentsHome(home), 'modules');
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

const MODULE = path.join(REPO, 'modules', 'harness');
const RULES = read(path.join(MODULE, 'AGENTS.md')).trim();
// Claude へ配る plugin の位置(名前空間 dotagents = このディレクトリ名)
const PLUGIN = '.claude/skills/dotagents';

test('fresh install(-g): Claude へは plugin 1 つ、Codex へは素のコピー。.agents も symlink も作らない', () => {
  const home = freshHome();
  run(home, ['install', 'harness', '-g']);

  const skill = path.join(home, PLUGIN, 'skills/prompting/SKILL.md');
  assert.ok(fs.existsSync(skill), 'スキルは plugin の中に実ファイルで入る');
  assert.ok(!fs.lstatSync(path.join(home, PLUGIN)).isSymbolicLink(), 'symlink ではない');
  assert.equal(read(skill), read(path.join(MODULE, 'skills/prompting/SKILL.md')), '内容は正本と同一');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'agents/review.md')), 'エージェント定義も plugin の中');

  const manifest = JSON.parse(read(path.join(home, PLUGIN, '.claude-plugin/plugin.json')));
  assert.equal(manifest.name, 'dotagents', '名前空間は dotagents(/dotagents:* になる)');

  assert.ok(fs.existsSync(path.join(home, '.codex/skills/dotagents-prompting/SKILL.md')),
    'Codex には plugin が無いので、名前空間を名前へ畳んで素で配る');
  assert.ok(!fs.existsSync(path.join(home, '.codex/agents')), 'Codex にエージェント定義の置き場は無い');
  assert.ok(!fs.existsSync(path.join(home, '.claude/skills/prompting')), '名前空間の外にスキルを置かない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/agents')), '名前空間の外にエージェントを置かない');

  const claudeMd = read(path.join(home, '.claude/CLAUDE.md'));
  assert.match(claudeMd, /agents-harness:begin/, 'CLAUDE.md に規則ブロックが入る');
  assert.ok(claudeMd.includes(RULES), 'ブロックの中身は module の AGENTS.md 全文');
  assert.ok(read(path.join(home, '.codex/AGENTS.md')).includes(RULES), '.codex/AGENTS.md にも規則ブロックが入る');

  assert.ok(!fs.existsSync(path.join(home, '.agents')), '.agents は作らない');
  assert.ok(!fs.existsSync(path.join(home, '.zshenv')), 'zshenv に触れない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')), 'settings.json を触らない');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'README.md')), '解説(README)は配備しない');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'docs')), '解説の翻訳も配備しない');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'module.json')), 'module の目録も配備しない');

  const m = userManifest(home);
  assert.equal(m.kind, 'user', 'manifest は ~/.dotagents/state/user.json');
  assert.deepEqual(m.modules, ['harness'], '選んだ module を憶える');
  assert.ok(!fs.existsSync(path.join(home, '.claude/.dotagents.json')), '配備先に manifest を残さない');

  const { out } = run(home, ['status', '-g']);
  assert.match(out, /no drift/);
});

test('冪等: 2 回目の install は何も変更しない', () => {
  const home = freshHome();
  run(home, ['install', 'harness', '-g']);
  const before = read(path.join(stateDir(home), 'user.json'));
  const claudeMdBefore = read(path.join(home, '.claude/CLAUDE.md'));
  run(home, ['install', 'harness', '-g']);
  const after = userManifest(home);
  const beforeObj = JSON.parse(before);
  delete after.installedAt; delete beforeObj.installedAt;
  assert.deepEqual(after, beforeObj);
  assert.equal(read(path.join(home, '.claude/CLAUDE.md')), claudeMdBefore, '規則ブロックも書き直さない');
});

test('改変保護: ユーザーが編集したファイルは update が触れず警告し、--force でのみ上書きする', () => {
  const home = freshHome();
  run(home, ['install', 'harness', '-g']);
  const target = path.join(home, PLUGIN, 'skills/prompting/SKILL.md');
  fs.appendFileSync(target, '\n# user edit\n');
  const edited = read(target);

  const r = run(home, ['update', '-g'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.equal(read(target), edited, '改変は保持される');

  run(home, ['update', '-g', '--force']);
  assert.ok(!read(target).includes('# user edit'), '--force で正本の内容に戻る');
});

test('規則ブロックの共存: 既存の CLAUDE.md には追記し、uninstall で原状復帰する', () => {
  const home = freshHome();
  const own = '# my own global rules\n\n- be nice\n';
  fs.writeFileSync(path.join(home, '.claude/CLAUDE.md'), own);

  run(home, ['install', 'harness', '-g']);
  const t = read(path.join(home, '.claude/CLAUDE.md'));
  assert.ok(t.startsWith('# my own global rules'), 'ユーザーの記述が先頭に残る');
  assert.ok(t.includes(RULES), '規則ブロックが追記される');

  run(home, ['update', '-g']);
  assert.equal((read(path.join(home, '.claude/CLAUDE.md')).match(/agents-harness:begin/g) || []).length, 1, '冪等');

  run(home, ['uninstall', '-g']);
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

  run(home, ['install', 'harness', '-g']);
  run(home, ['uninstall', '-g']);

  assert.ok(fs.existsSync(path.join(home, '.claude/skills/my-own-skill/SKILL.md')), '自前スキルは残る');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN)), 'plugin ごと消える');
  assert.ok(!fs.existsSync(path.join(home, '.codex/skills/dotagents-prompting')), 'Codex 側も消える');
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', 'zshenv は原状のまま');
  assert.deepEqual(JSON.parse(read(path.join(home, '.claude/settings.json'))), userSettings, 'settings は原状のまま');
  assert.ok(fs.existsSync(path.join(home, '.codex')), '既存の .codex は空になっても残る');
  assert.ok(!fs.existsSync(stateDir(home)), '記録が尽きたら state も残さない');
});

test('外科的 uninstall: 改変された配布ファイルは残す', () => {
  const home = freshHome();
  run(home, ['install', 'harness', '-g']);
  const target = path.join(home, PLUGIN, 'skills/prompting/SKILL.md');
  fs.appendFileSync(target, '\n# user edit\n');
  run(home, ['uninstall', '-g']);
  assert.ok(fs.existsSync(target), '改変ファイルは消さない');
  assert.ok(read(target).includes('# user edit'), '内容もそのまま');
});

// ---------------------------------------------------------------- module の加算と減算

test('install は加算: 後から足しても前の module は残り、update は憶えている集合に効く', () => {
  const home = freshHome();
  const { cli } = makeCorpus();

  run(home, ['install', 'harness', '-g'], { cli });
  run(home, ['install', 'demo', '-g'], { cli });
  assert.deepEqual(userManifest(home).modules, ['demo', 'harness'], '足した module が記録に加わる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/demo-skill/SKILL.md')), '足した module が配られる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '前からの module は残る');

  run(home, ['update', '-g'], { cli });
  assert.deepEqual(userManifest(home).modules, ['demo', 'harness'], 'update は module 名を要らず、集合を保つ');
  assert.match(run(home, ['status', '-g'], { cli }).out, /no drift/);
});

test('uninstall は減算: 名前を挙げた module だけが消え、残りは配られたまま', () => {
  const home = freshHome();
  const { cli } = makeCorpus();
  run(home, ['install', 'harness', 'demo', '-g'], { cli });

  run(home, ['uninstall', 'demo', '-g'], { cli });
  assert.deepEqual(userManifest(home).modules, ['harness'], '外した module だけが記録から消える');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'skills/demo-skill')), '外した module のファイルは刈られる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '残りは配られたまま');
  assert.ok(read(path.join(home, '.claude/CLAUDE.md')).includes(RULES), '規則ブロックも残る');
  assert.match(run(home, ['status', '-g'], { cli }).out, /no drift/);

  const r = run(home, ['uninstall', 'demo', '-g'], { cli, allowFail: true });
  assert.equal(r.code, 1, '入っていない module は外せない');
  assert.match(r.out, /not installed here: demo/);
});

test('供給元から消えた module: update が記録から落として刈り、残りは配られたまま', () => {
  const home = freshHome();
  const { dir, cli } = makeCorpus();
  run(home, ['install', 'harness', 'demo', '-g'], { cli });

  fs.rmSync(path.join(dir, 'modules', 'demo'), { recursive: true });

  const st = run(home, ['status', '-g'], { cli, allowFail: true });
  assert.equal(st.code, 1, '消えた module は乖離');
  assert.match(st.out, /module demo — no longer available/);
  assert.match(st.out, /skills\/demo-skill\/SKILL\.md — no longer delivered/, '消えた module のファイルだけを名指しする');
  assert.doesNotMatch(st.out, /skills\/prompting\/SKILL\.md — no longer delivered/, '無事な module のファイルを巻き込まない');

  run(home, ['update', '-g'], { cli });
  assert.deepEqual(userManifest(home).modules, ['harness'], '記録から落ちる');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'skills/demo-skill')), '消えた module のファイルは刈られる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '残りは配られたまま');
  assert.match(run(home, ['status', '-g'], { cli }).out, /no drift/);
});

test('list: 正本が提供する module と、要る外部コマンドの有無を示す(導入は代行しない)', () => {
  const home = freshHome();
  const { cli } = makeCorpus();
  const { out } = run(home, ['list'], { cli });
  assert.match(out, /^  harness/m, 'module が並ぶ');
  assert.match(out, /^  demo/m);
  assert.match(out, /requires definitely-not-a-real-command/, '要るコマンドを示す');
  assert.match(out, /missing/, '無いことを伝える');

  // 依存が無くても配備は通る
  const r = run(home, ['install', 'demo', '-g'], { cli });
  assert.equal(r.code, 0, '依存の不在は配備を止めない');
  assert.match(r.out, /expects definitely-not-a-real-command/, '不在は伝える');
});

// ---------------------------------------------------------------- 本拠地

test('私的な module: ~/.dotagents/modules/ の物も同じように配られ、正本と混ぜられる', () => {
  const home = freshHome();
  const mine = path.join(personalModules(home), 'mine');
  fs.mkdirSync(path.join(mine, 'skills', 'mine-skill'), { recursive: true });
  fs.writeFileSync(path.join(mine, 'module.json'), JSON.stringify({ description: '私的な module' }) + '\n');
  fs.writeFileSync(path.join(mine, 'skills', 'mine-skill', 'SKILL.md'), '---\ndescription: mine\n---\n\n# mine\n');

  const listed = run(home, ['list']);
  assert.match(listed.out, /personal/, '出典を分けて示す');
  assert.match(listed.out, /^  mine/m);

  run(home, ['install', 'harness', 'mine', '-g']);
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/mine-skill/SKILL.md')), '私的 module も配られる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '正本の module と混ざる');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('名前の衝突: 同じ名前が正本と私的の両方にあれば、黙って選ばずに止まる', () => {
  const home = freshHome();
  const dup = path.join(personalModules(home), 'harness');
  fs.mkdirSync(dup, { recursive: true });
  fs.writeFileSync(path.join(dup, 'module.json'), JSON.stringify({ description: 'ぶつかる' }) + '\n');

  const r = run(home, ['list'], { allowFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /two modules are named harness/);
  assert.ok(!fs.existsSync(stateDir(home)), '止まった以上、何も書いていない');
});

test('DOTAGENTS_HOME: 本拠地ごと移せる', () => {
  const home = freshHome();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-elsewhere-'));
  run(home, ['install', 'harness', '-g'], { env: { DOTAGENTS_HOME: elsewhere } });

  assert.ok(fs.existsSync(path.join(elsewhere, 'state', 'user.json')), '記録は指定した本拠地に置かれる');
  assert.ok(!fs.existsSync(agentsHome(home)), '既定の場所には何も作らない');
  assert.match(run(home, ['status', '-g'], { env: { DOTAGENTS_HOME: elsewhere } }).out, /no drift/);
});

test('記録の移行: 本拠地の直下にあった manifest は state/ へ引き取られる', () => {
  const home = freshHome();
  run(home, ['install', 'harness', '-g']);
  // 旧世代は本拠地の直下に置いていた
  fs.renameSync(path.join(stateDir(home), 'user.json'), path.join(agentsHome(home), 'user.json'));
  fs.rmSync(stateDir(home), { recursive: true, force: true });

  const { out } = run(home, ['status', '-g']);
  assert.match(out, /no drift/, '移行して読めるようになる');
  assert.ok(fs.existsSync(path.join(stateDir(home), 'user.json')), 'state/ へ移る');
  assert.ok(!fs.existsSync(path.join(agentsHome(home), 'user.json')), '古い位置には残らない');
});

// ---------------------------------------------------------------- 旧レイアウトの移行

test('1.0.0 からの移行: 名前空間の外に置かれた素のコピーを update が刈り、plugin へ移す', () => {
  const home = freshHome();
  // 1.0.0 が置いた配置(.claude/skills/<prefixed>/ と .claude/agents/)を所有記録付きで再現する
  const oldSkill = path.join(home, '.claude/skills/dotagents-prompting/SKILL.md');
  const oldAgent = path.join(home, '.claude/agents/dotagents-review.md');
  fs.mkdirSync(path.dirname(oldSkill), { recursive: true });
  fs.mkdirSync(path.dirname(oldAgent), { recursive: true });
  fs.copyFileSync(path.join(MODULE, 'skills/prompting/SKILL.md'), oldSkill);
  fs.copyFileSync(path.join(MODULE, 'agents/review.md'), oldAgent);
  fs.mkdirSync(stateDir(home), { recursive: true });
  fs.writeFileSync(path.join(stateDir(home), 'user.json'), JSON.stringify({
    schema: 2, kind: 'user', base: home, version: '1.0.0', source: REPO,
    files: {
      '.claude/skills/dotagents-prompting/SKILL.md': sha(oldSkill),
      '.claude/agents/dotagents-review.md': sha(oldAgent),
    },
    rulesBlocks: [],
  }, null, 2) + '\n');

  run(home, ['update', '-g']);

  assert.ok(!fs.existsSync(path.join(home, '.claude/skills/dotagents-prompting')), '旧配置のスキルは刈られる');
  assert.ok(!fs.existsSync(oldAgent), '旧配置のエージェントも刈られる — 残ると同名の plugin 側を上書きしてしまう');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), 'plugin へ移る');
  assert.deepEqual(userManifest(home).modules, ['harness'], 'module を持たない記録は harness とみなす');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('旧レイアウトの移行: .agents・symlink・zshenv 行・settings 断片を update が刈り込み、新レイアウトを敷く', () => {
  const home = freshHome();
  const root = path.join(home, '.agents');

  // 旧レイアウトの install が置いた物を再現する(所有記録付き)
  fs.mkdirSync(path.join(root, 'skills/dotagents-prompting'), { recursive: true });
  fs.copyFileSync(path.join(MODULE, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.copyFileSync(path.join(MODULE, 'skills/prompting/SKILL.md'),
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

  run(home, ['update', '-g']);

  assert.ok(!fs.existsSync(root), '.agents はディレクトリごと消える');
  assert.ok(!fs.lstatSync(path.join(home, '.claude/CLAUDE.md')).isSymbolicLink(), 'CLAUDE.md は実ファイルになる');
  assert.ok(read(path.join(home, '.claude/CLAUDE.md')).includes(RULES), '規則ブロックが入る');
  assert.ok(!fs.existsSync(path.join(home, '.claude/skills/dotagents-prompting')), '旧スキルのリンクは消える');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), 'スキルは plugin の中に実体で入る');
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', '管理行は除去され、ユーザーの行は残る');
  const s = JSON.parse(read(path.join(home, '.claude/settings.json')));
  assert.equal(s.env?.BASH_ENV, undefined, '所有していた BASH_ENV は除去される');
  assert.equal(s.hooks, undefined, '所有していた SessionStart は除去される');
  assert.deepEqual(s.permissions.ask, ['Bash(gh pr merge:*)'], '所有していた ask だけが刈り込まれる');
  const cx = JSON.parse(read(path.join(home, '.codex/hooks.json')));
  assert.equal(cx.hooks.SessionStart.length, 1, 'codex は自分の断片だけ除去する');
  assert.match(cx.hooks.SessionStart[0].hooks[0].command, /herdr/, 'ユーザーの hook は残る');

  const { out } = run(home, ['status', '-g']);
  assert.match(out, /no drift/, '移行後は乖離なし');
});

test('旧レイアウトの残存: status は乖離として報告し、uninstall は legacy だけでも外科的に外す', () => {
  const home = freshHome();
  const root = path.join(home, '.agents');
  fs.mkdirSync(root, { recursive: true });
  fs.copyFileSync(path.join(MODULE, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.symlinkSync(path.join(root, 'AGENTS.md'), path.join(home, '.claude/CLAUDE.md'));
  fs.writeFileSync(path.join(root, '.dotagents.json'), JSON.stringify({
    schema: 1, kind: 'user', scope: 'full', version: '1.0.0', source: REPO,
    files: { 'AGENTS.md': sha(path.join(root, 'AGENTS.md')) },
    links: [{ link: path.join(home, '.claude/CLAUDE.md'), target: path.join(root, 'AGENTS.md'), created: true }],
    fragments: {},
  }, null, 2) + '\n');

  const st = run(home, ['status', '-g'], { allowFail: true });
  assert.equal(st.code, 1, '旧レイアウトの残存は乖離');
  assert.match(st.out, /legacy layout/);

  run(home, ['uninstall', '-g']);
  assert.ok(!fs.existsSync(root), '.agents ごと消える');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), '旧リンクも消える');
});

test('移行の頑健性: 所有記録に無い .agents 向き symlink が残っていても、update は完走して実体を敷く', () => {
  const home = freshHome();
  const root = path.join(home, '.agents');
  fs.mkdirSync(path.join(root, 'skills/dotagents-prompting'), { recursive: true });
  fs.copyFileSync(path.join(MODULE, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.copyFileSync(path.join(MODULE, 'skills/prompting/SKILL.md'),
    path.join(root, 'skills/dotagents-prompting/SKILL.md'));
  // ユーザーの手張り(旧 manifest の links に記録が無い)symlink
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(path.join(root, 'AGENTS.md'), path.join(home, '.claude/CLAUDE.md'));
  fs.symlinkSync(path.join(root, 'skills'), path.join(home, '.claude/skills/dotagents'));
  fs.writeFileSync(path.join(root, '.dotagents.json'), JSON.stringify({
    schema: 1, kind: 'user', scope: 'full', version: '1.0.0', source: REPO,
    files: {
      'AGENTS.md': sha(path.join(root, 'AGENTS.md')),
      'skills/dotagents-prompting/SKILL.md': sha(path.join(root, 'skills/dotagents-prompting/SKILL.md')),
    },
    links: [],
    fragments: {},
  }, null, 2) + '\n');

  run(home, ['update', '-g']);

  assert.ok(!fs.existsSync(root), '.agents は消える');
  assert.ok(!fs.lstatSync(path.join(home, '.claude/CLAUDE.md')).isSymbolicLink(), '切れたリンクは実体に置き換わる');
  assert.ok(!fs.lstatSync(path.join(home, PLUGIN)).isSymbolicLink(), 'plugin の場所も実体になる');
  const { out } = run(home, ['status', '-g']);
  assert.match(out, /no drift/, '移行後は乖離なし');
});

test('生きた手張り symlink は上書きせず、警告して退く', () => {
  const home = freshHome();
  const mine = path.join(home, 'my-plugin');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'SKILL.md'), '# my very own\n');
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(mine, path.join(home, '.claude/skills/dotagents'));

  const r = run(home, ['install', 'harness', '-g'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills/dotagents')).isSymbolicLink(), 'リンクは残る');
  assert.equal(read(path.join(mine, 'SKILL.md')), '# my very own\n', 'リンク先を書き換えない');
  assert.equal(userManifest(home).files[`${PLUGIN}/skills/prompting/SKILL.md`], undefined, '所有記録に入れない');
});

// ---------------------------------------------------------------- 配備先

test('project install(既定): プロジェクトの .claude/ に入り、マシン固有の物を何も残さない', () => {
  const home = freshHome();
  const proj = freshProject();
  execFileSync('git', ['init', '-q'], { cwd: proj });
  run(home, ['install', 'harness'], { cwd: proj });

  assert.ok(fs.existsSync(path.join(proj, PLUGIN, 'skills/prompting/SKILL.md')), 'plugin が実ファイルで入る');
  assert.ok(read(path.join(proj, '.claude/CLAUDE.md')).includes(RULES), 'CLAUDE.md が作られブロックが入る');
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.agents は作らない');
  assert.ok(!fs.existsSync(path.join(proj, '.codex')), '.codex が無いプロジェクトには作らない');
  assert.ok(!fs.existsSync(path.join(proj, 'AGENTS.md')), 'root AGENTS.md が無いプロジェクトには作らない');

  const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: proj, encoding: 'utf8' });
  assert.ok(!status.includes('dotagents.json'), 'manifest はプロジェクトに現れない(本拠地に置く)');
  assert.ok(status.split('\n').filter(Boolean).every((l) => l.includes('.claude/')), '増えるのは .claude/ 配下だけ');
  assert.equal(projectManifest(home, proj).kind, 'project');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'user レベルには何も敷かない');

  run(home, ['uninstall'], { cwd: proj });
  assert.ok(!fs.existsSync(path.join(proj, '.claude/CLAUDE.md')), '自分が作った規則ファイルは消える');
  assert.ok(!fs.existsSync(path.join(proj, PLUGIN)), 'plugin も消える');
});

test('-C は場所を名指しする。-g との併用は矛盾なので止まる', () => {
  const home = freshHome();
  const proj = freshProject();
  run(home, ['install', 'harness', '-C', proj]);
  assert.ok(fs.existsSync(path.join(proj, PLUGIN, 'skills/git/SKILL.md')), '-C の場所に入る');
  assert.equal(projectManifest(home, proj).kind, 'project');

  const r = run(home, ['install', 'harness', '-g', '-C', proj], { allowFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /-g and -C are exclusive/);
});

test('既定の配備先は名指しを要る場合がある: git リポジトリでない場所は非対話で止まる', () => {
  const home = freshHome();
  const loose = freshProject('dotagents-loose-');
  const r = run(home, ['install', 'harness'], { cwd: loose, allowFail: true });
  assert.equal(r.code, 1, '無関係な場所に黙って書かない');
  assert.match(r.out, /not a git repository/);
  assert.ok(!fs.existsSync(path.join(loose, '.claude')), '止まった以上、何も書いていない');

  run(home, ['install', 'harness', '-C', loose]);
  assert.ok(fs.existsSync(path.join(loose, PLUGIN)), '名指しすれば入る');
});

// ---------------------------------------------------------------- 引数の契約

test('何を入れるかは既定値で決まらない: module 名なしの install は非対話で止まる', () => {
  const home = freshHome();
  const proj = freshProject();
  execFileSync('git', ['init', '-q'], { cwd: proj });
  const r = run(home, ['install'], { cwd: proj, allowFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /no module given for `install`/);
  assert.match(r.out, /agents-setup install harness/, '選べる module を示す');
  assert.ok(!fs.existsSync(stateDir(home)), '止まった以上、何も書いていない');
  assert.ok(!fs.existsSync(path.join(proj, '.claude')));
});

test('引数の形: 不明な module・対象を取らないコマンドへの module 指定は、何も書かずに止まる', () => {
  const home = freshHome();
  const cases = [
    [['install', 'nosuch'], /unknown module: nosuch/],
    [['update', 'harness'], /`update` takes no module names/],
    [['status', 'harness'], /`status` takes no module names/],
    [['list', 'harness'], /`list` takes no arguments/],
    [['install', '--bogus'], /unknown argument/],
    [['install', '-C'], /-C takes a value/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(home, args, { allowFail: true });
    assert.equal(r.code, 1, `${args.join(' ')} は止まる`);
    assert.match(r.out, pattern, `${args.join(' ')} は理由を示す`);
  }
  assert.ok(!fs.existsSync(stateDir(home)), '止まった以上、何も書いていない');
});

test('廃止インタフェース: エイリアスとして生かさず、正しい形へ案内する', () => {
  const home = freshHome();
  for (const flag of ['--user', '--project', '--shell']) {
    const r = run(home, ['install', flag], { allowFail: true });
    assert.equal(r.code, 1, `${flag} は動作しない`);
    assert.match(r.out, /is retired/);
    assert.match(r.out, /\[-g\] \[-C <dir>\]/, '新しい形を示す');
  }
  for (const target of ['user', 'project', 'shell']) {
    const r = run(home, ['install', target], { allowFail: true });
    assert.equal(r.code, 1, `位置引数の ${target} は動作しない`);
    assert.match(r.out, /target is retired/);
    assert.match(r.out, /-g/, 'フラグになったことを示す');
  }
  const ks = run(home, ['uninstall', '--keep-shell'], { allowFail: true });
  assert.equal(ks.code, 1, '--keep-shell は動作しない');
  assert.match(ks.out, /--keep-shell is retired/, '理由と正しい形を案内する');
  assert.ok(!fs.existsSync(stateDir(home)), '止まった以上、何も書いていない');
});

test('help: 対象ごとに語彙を分けて示し、コマンドごとの説明も引ける', () => {
  const home = freshHome();
  const overall = run(home, ['--help']);
  assert.match(overall.out, /agents-setup <command> \[module\.\.\.\] \[options\]/);
  assert.match(overall.out, /The corpus/, '正本の語彙(clone / pull / list)を束ねて示す');
  assert.match(overall.out, /Deployments/, '配備の語彙を分けて示す');
  for (const cmd of ['clone', 'pull', 'list', 'install', 'update', 'uninstall', 'status']) {
    assert.match(overall.out, new RegExp(`^  ${cmd}\\b`, 'm'), `${cmd} が一覧に出る`);
  }
  assert.ok(!overall.out.includes('--keep-shell'), '廃止した shell 層の語彙は出ない');

  for (const args of [['install', '--help'], ['install', '-h']]) {
    const r = run(home, args);
    assert.match(r.out, /agents-setup install \[module\.\.\.\] \[options\]/, `${args.join(' ')} は install の説明を出す`);
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
