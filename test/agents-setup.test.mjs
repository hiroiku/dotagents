// installer の契約(配達先・所有権・引数の形)を固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installCodexStub, codexLog, pathWithoutCodex } from './codex-stub.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');

// テストは本拠地を HOME から導くので、走らせる人の DOTAGENTS_HOME に引きずられない。
delete process.env.DOTAGENTS_HOME;
installCodexStub();

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
  for (const m of BASE) fs.cpSync(path.join(REPO, 'modules', m), path.join(dir, 'modules', m), { recursive: true });
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
// 「何も書いていない」が指すのは配備の記録である。見本を置くのは別の行為で、
// どのコマンドより先に済み、コマンドが止まっても取り消されない。
const noDeployment = (home) => !fs.existsSync(path.join(stateDir(home), 'user.json'))
  && !fs.existsSync(path.join(stateDir(home), 'projects'));

function projectManifest(home, proj) {
  const dir = path.join(stateDir(home), 'projects');
  const real = fs.realpathSync(proj);
  for (const f of fs.readdirSync(dir)) {
    const m = JSON.parse(read(path.join(dir, f)));
    if (m.base === real) return m;
  }
  return null;
}

// 配達の三形態(遍在則・役割・瞬間則)を 1 回の install で揃えるには、AGENTS.md と
// agents/ を持つ module と、skills/ を持つ module の両方が要る。
const BASE = ['review', 'prompting'];
const INSTALLED = [...BASE].sort(); // 記録は名前順に正規化される
// module の概念が無かった頃の記録が指していた「全部」。当時の唯一の配布物は 1 つの
// harness で、その中身は今この集合に分かれている。
const LEGACY = ['code', 'git', 'prompting', 'review', 'testing'];
const RULES_MODULE = path.join(REPO, 'modules', 'review');
const SKILL_MODULE = path.join(REPO, 'modules', 'prompting');
const RULES = read(path.join(RULES_MODULE, 'AGENTS.md')).trim();
// Claude へ配る plugin の位置(名前空間 dotagents = このディレクトリ名)
const PLUGIN = '.claude/skills/dotagents';
// 遍在則(module の AGENTS.md)の配達先。どちらもツールのディレクトリーの中にある。
const claudeRules = (base, m = 'review') => path.join(base, '.claude/rules/dotagents', `${m}.md`);
const codexRules = (base, m = 'review') => path.join(base, '.codex/dotagents', m, 'AGENTS.md');
// Codex の hook はマシンに 1 つの plugin に入る。最後の SessionStart が規則を読む。
const codexPlugin = (home) => path.join(home, '.dotagents/codex/plugins/dotagents');
const codexPluginHooks = (home) => JSON.parse(read(path.join(codexPlugin(home), 'hooks/hooks.json'))).hooks;
const codexSessionStart = (home) => codexPluginHooks(home).SessionStart.at(-1);
const codexInstalled = (home) => fs.existsSync(path.join(home, '.codex/plugins/cache/dotagents/dotagents'));
const TRUST = /trust the dotagents hooks once in Codex/;

test('fresh install(-g): Claude へは plugin、Codex へはネイティブのスキルとエージェントを配る', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);

  const skill = path.join(home, PLUGIN, 'skills/prompting/SKILL.md');
  assert.ok(fs.existsSync(skill), 'スキルは plugin の中に実ファイルで入る');
  assert.ok(!fs.lstatSync(path.join(home, PLUGIN)).isSymbolicLink(), 'symlink ではない');
  assert.equal(read(skill), read(path.join(SKILL_MODULE, 'skills/prompting/SKILL.md')), '内容は正本と同一');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'agents/review.md')), 'エージェント定義も plugin の中');

  const manifest = JSON.parse(read(path.join(home, PLUGIN, '.claude-plugin/plugin.json')));
  assert.equal(manifest.name, 'dotagents', '名前空間は dotagents(/dotagents:* になる)');

  assert.ok(fs.existsSync(path.join(home, '.agents/skills/dotagents-prompting/SKILL.md')),
    'Codex が検出する標準のスキル置き場へ配る');
  assert.ok(fs.existsSync(path.join(home, '.codex/agents/dotagents-review.toml')), 'Codex にネイティブのレビュー役を配る');
  assert.ok(!fs.existsSync(path.join(home, '.claude/skills/prompting')), '名前空間の外にスキルを置かない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/agents')), '名前空間の外にエージェントを置かない');

  assert.equal(read(claudeRules(home)).trim(), RULES, '遍在則は Claude の rules に module ごとのファイルで入る');
  assert.equal(read(codexRules(home)).trim(), RULES, 'Codex へも module ごとのファイルで入る');
  const session = codexSessionStart(home);
  assert.equal(session.matcher, '^(startup|clear|compact)$', 'Codex には plugin の SessionStart で読ませる');
  assert.match(session.hooks[0].command, /d="\$HOME".*\.codex\/dotagents\/\*\/AGENTS\.md/, 'マシン全体の規則を先に読む');
  assert.match(session.hooks[1].command, /git rev-parse --show-toplevel/, 'プロジェクトの規則を後に読む');
  assert.ok(codexLog(home).includes('plugin add dotagents@dotagents'), 'plugin を Codex に入れる');
  assert.ok(codexInstalled(home));
  assert.ok(!fs.existsSync(path.join(home, '.codex/hooks.json')), 'Codex の hooks.json は書かない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'ユーザーの規則ファイルは作らない');
  assert.ok(!fs.existsSync(path.join(home, '.codex/AGENTS.md')), 'Codex の規則ファイルも作らない');

  assert.ok(!fs.existsSync(path.join(home, '.agents/.dotagents.json')), '旧レイアウトの manifest は作らない');
  assert.ok(!fs.existsSync(path.join(home, '.zshenv')), 'zshenv に触れない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')), 'settings.json を触らない');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'README.md')), '解説(README)は配備しない');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'docs')), '解説の翻訳も配備しない');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'module.json')), 'module の目録も配備しない');

  const m = userManifest(home);
  assert.equal(m.kind, 'user', 'manifest は ~/.dotagents/state/user.json');
  assert.deepEqual(m.modules, INSTALLED, '選んだ module を憶える');
  assert.ok(!fs.existsSync(path.join(home, '.claude/.dotagents.json')), '配備先に manifest を残さない');

  const { out } = run(home, ['status', '-g']);
  assert.match(out, /no drift/);
});

test('冪等: 2 回目の install は何も変更しない', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);
  const before = read(path.join(stateDir(home), 'user.json'));
  const calls = codexLog(home).length;
  const { out } = run(home, ['install', ...BASE, '-g']);
  const after = userManifest(home);
  const beforeObj = JSON.parse(before);
  delete after.installedAt; delete beforeObj.installedAt;
  assert.deepEqual(after, beforeObj);
  assert.equal(codexLog(home).length, calls, '入っている plugin のために Codex を呼ばない');
  assert.doesNotMatch(out, TRUST, '変わっていない hook の信頼を求めない');
});

test('改変保護: ユーザーが編集したファイルは update が触れず警告し、--force でのみ上書きする', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);
  const target = path.join(home, PLUGIN, 'skills/prompting/SKILL.md');
  fs.appendFileSync(target, '\n# user edit\n');
  const edited = read(target);

  const r = run(home, ['update', '-g'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.equal(read(target), edited, '改変は保持される');

  run(home, ['update', '-g', '--force']);
  assert.ok(!read(target).includes('# user edit'), '--force で正本の内容に戻る');
});

test('ユーザーの規則ファイル: CLAUDE.md と .codex/AGENTS.md には install から uninstall まで触れない', () => {
  const home = freshHome();
  const own = '# my own global rules\n\n- be nice\n';
  fs.writeFileSync(path.join(home, '.claude/CLAUDE.md'), own);
  fs.writeFileSync(path.join(home, '.codex/AGENTS.md'), own);

  const first = run(home, ['install', ...BASE, '-g']);
  assert.match(first.out, TRUST, '初めて入れた plugin の hook の信頼を求める');
  run(home, ['update', '-g']);
  for (const rel of ['.claude/CLAUDE.md', '.codex/AGENTS.md']) assert.equal(read(path.join(home, rel)), own, `${rel} はそのまま`);
  assert.ok(fs.existsSync(claudeRules(home)), '規則は自分の置き場へ入る');

  run(home, ['uninstall', '-g']);
  for (const rel of ['.claude/CLAUDE.md', '.codex/AGENTS.md']) assert.equal(read(path.join(home, rel)), own, `${rel} はそのまま`);
  assert.ok(!fs.existsSync(path.join(home, '.claude/rules')), '自分の置き場は空になれば消える');
  assert.ok(!fs.existsSync(path.join(home, '.codex/dotagents')));
  assert.ok(!codexInstalled(home), 'Codex を使う配備が無くなれば plugin も外す');
  assert.ok(codexLog(home).includes('plugin remove dotagents@dotagents'));
  assert.ok(!fs.existsSync(path.join(home, '.dotagents/codex')));
});

test('ユーザーの hooks.json: Codex の hook は plugin に入るので、.codex/hooks.json には触れない', () => {
  const home = freshHome();
  const own = JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }, null, 2) + '\n';
  fs.writeFileSync(path.join(home, '.codex/hooks.json'), own);

  run(home, ['install', ...BASE, '-g']);
  assert.equal(read(path.join(home, '.codex/hooks.json')), own, 'ユーザーの hook はそのまま');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
  run(home, ['uninstall', '-g']);
  assert.equal(read(path.join(home, '.codex/hooks.json')), own);
});

test('Codex plugin: hook の定義が変わったときだけ入れ直して信頼を求め、規則の変更では Codex を呼ばない', () => {
  const home = freshHome();
  run(home, ['install', 'gate', 'review', '-g']);
  const calls = codexLog(home).length;

  fs.appendFileSync(path.join(personalModules(home), 'review', 'AGENTS.md'), '\n- 規則を 1 行足す。\n');
  const rules = run(home, ['update', '-g']);
  assert.match(read(codexRules(home)), /規則を 1 行足す/, '規則のファイルは配り直す');
  assert.equal(codexLog(home).length, calls, '規則は hook が読むので、plugin は変わらない');
  assert.doesNotMatch(rules.out, TRUST);

  const gate = path.join(personalModules(home), 'gate', 'codex', 'hooks.json');
  const hooks = JSON.parse(read(gate));
  hooks.hooks.PreToolUse[0].hooks[0].timeout = 11;
  fs.writeFileSync(gate, JSON.stringify(hooks, null, 2) + '\n');
  const changed = run(home, ['update', '-g']);
  assert.ok(codexLog(home).length > calls, 'hook の定義が変われば入れ直す');
  assert.equal(codexPluginHooks(home).PreToolUse[0].hooks[0].timeout, 11);
  assert.match(changed.out, TRUST, '変わった hook の信頼を求める');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('Codex plugin: Codex を使う配備が 1 つでも残る間は外さない', () => {
  const home = freshHome();
  const [a, b] = [freshProject(), freshProject()];
  for (const proj of [a, b]) run(home, ['install', 'review', '--agent', 'codex', '-C', proj]);
  run(home, ['install', 'review', '--agent', 'claude', '-g']);
  run(home, ['uninstall', '-C', a]);
  assert.ok(codexInstalled(home), 'b が Codex を使っている');
  run(home, ['uninstall', '-C', b]);
  assert.ok(!codexInstalled(home), 'Claude だけの配備には plugin は要らない');
  assert.ok(!fs.existsSync(path.join(stateDir(home), 'codex-plugin.json')));
});

test('Codex plugin: codex の無いマシンでは知らせて配備は続け、status が差分として報告する', () => {
  const home = freshHome();
  const env = { PATH: pathWithoutCodex() };
  const r = run(home, ['install', ...BASE, '-g'], { env });
  assert.equal(r.code, 0, '依存の不在は配備の失敗ではない');
  assert.match(r.out, /Codex CLI not found/);
  assert.ok(fs.existsSync(codexRules(home)), 'プロジェクトへの配達は届く');
  const st = run(home, ['status', '-g'], { env, allowFail: true });
  assert.equal(st.code, 1);
  assert.match(st.out, /Codex plugin dotagents@dotagents — not installed, run update/);
  run(home, ['update', '-g']);
  assert.match(run(home, ['status', '-g']).out, /no drift/, 'codex が入れば update で入る');
});

test('6.0 の移行: プロジェクトへ生成していた .codex/hooks.json は、触られていなければ update が刈り込む', () => {
  const home = freshHome();
  const proj = freshProject();
  run(home, ['install', 'review', '--agent', 'codex', '-C', proj]);
  const old = path.join(proj, '.codex/hooks.json');
  fs.writeFileSync(old, '{"hooks":{"SessionStart":[]}}\n');
  const manifest = projectManifest(home, proj);
  manifest.files['.codex/hooks.json'] = { hash: sha(old), module: null, agent: 'codex' };
  const file = path.join(stateDir(home), 'projects', fs.readdirSync(path.join(stateDir(home), 'projects'))[0]);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');

  run(home, ['update', '-C', proj]);
  assert.ok(!fs.existsSync(old), '配っていた hooks.json は消える');
  assert.match(run(home, ['status', '-C', proj]).out, /no drift/);
});

test('外科的 uninstall: 自前スキルとユーザーの設定に触れず、配布物だけが消える', () => {
  const home = freshHome();
  fs.mkdirSync(path.join(home, '.claude/skills/my-own-skill'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/skills/my-own-skill/SKILL.md'), '# mine\n');
  fs.writeFileSync(path.join(home, '.zshenv'), 'export MY_VAR=1\n');
  const userSettings = { model: 'opus', permissions: { allow: ['Bash'] } };
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify(userSettings, null, 2) + '\n');

  run(home, ['install', ...BASE, '-g']);
  run(home, ['uninstall', '-g']);

  assert.ok(fs.existsSync(path.join(home, '.claude/skills/my-own-skill/SKILL.md')), '自前スキルは残る');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN)), 'plugin ごと消える');
  assert.ok(!fs.existsSync(path.join(home, '.codex/skills/dotagents-prompting')), 'Codex 側も消える');
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', 'zshenv は原状のまま');
  assert.deepEqual(JSON.parse(read(path.join(home, '.claude/settings.json'))), userSettings, 'settings は原状のまま');
  assert.ok(fs.existsSync(path.join(home, '.codex')), '既存の .codex は空になっても残る');
  assert.ok(noDeployment(home), '配備の記録が尽きたら、その記録は残さない');
});

test('配達先までの経路に切れたリンクが挟まっていても、配り直せる', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);

  // 配達単位そのものではなく、その 1 段下を切れたリンクにする(旧レイアウトの置き土産)。
  // recursive な mkdir でもこの先は作れないので、掃除が届かなければ install ごと落ちる。
  const inner = path.join(home, PLUGIN, 'skills');
  fs.rmSync(inner, { recursive: true });
  fs.symlinkSync(path.join(home, '.agents', 'old-skills'), inner);
  assert.ok(!fs.existsSync(inner), '行き先の無いリンクになっている');

  const again = run(home, ['install', ...BASE, '-g'], { allowFail: true });
  assert.equal(again.code, 0, again.out);
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '配達は届く');
  assert.ok(!fs.lstatSync(inner).isSymbolicLink(), '切れたリンクは実体に置き換わる');
});

test('外科的 uninstall: 改変された配布ファイルは残す', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);
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

  run(home, ['install', ...BASE, '-g'], { cli });
  run(home, ['install', 'demo', '-g'], { cli });
  assert.deepEqual(userManifest(home).modules, ['demo', ...INSTALLED], '足した module が記録に加わる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/demo-skill/SKILL.md')), '足した module が配られる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '前からの module は残る');

  run(home, ['update', '-g'], { cli });
  assert.deepEqual(userManifest(home).modules, ['demo', ...INSTALLED], 'update は module 名を要らず、集合を保つ');
  assert.match(run(home, ['status', '-g'], { cli }).out, /no drift/);
});

test('uninstall は減算: 名前を挙げた module だけが消え、残りは配られたまま', () => {
  const home = freshHome();
  const { cli } = makeCorpus();
  run(home, ['install', ...BASE, 'demo', '-g'], { cli });

  run(home, ['uninstall', 'demo', '-g'], { cli });
  assert.deepEqual(userManifest(home).modules, INSTALLED, '外した module だけが記録から消える');
  assert.ok(!fs.existsSync(path.join(home, PLUGIN, 'skills/demo-skill')), '外した module のファイルは刈られる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '残りは配られたまま');
  assert.equal(read(claudeRules(home)).trim(), RULES, '規則のファイルも残る');
  assert.match(run(home, ['status', '-g'], { cli }).out, /no drift/);

  const r = run(home, ['uninstall', 'demo', '-g'], { cli, allowFail: true });
  assert.equal(r.code, 1, '入っていない module は外せない');
  assert.match(r.out, /not installed here: demo/);
});

test('置き場から消した module: 配達物は消さず残して検証できないと言い、消すのは uninstall だけ', () => {
  const home = freshHome();
  const { cli } = makeCorpus();
  run(home, ['install', ...BASE, 'demo', '-g'], { cli });
  const delivered = path.join(home, PLUGIN, 'skills/demo-skill/SKILL.md');

  // 置き場のディレクトリを消すのは軽い操作である。それが配達先を書き換えてよい理由にはならない。
  fs.rmSync(path.join(personalModules(home), 'demo'), { recursive: true });

  const up = run(home, ['update', '-g'], { cli, allowFail: true });
  assert.equal(up.code, 1, '検証できない物が残るなら警告として exit 1');
  assert.ok(fs.existsSync(delivered), '配達物は残る');
  assert.deepEqual(userManifest(home).modules, ['demo', ...INSTALLED],
    '記録も残る — そこに置きたかったという意思である');
  assert.match(up.out, /demo is gone from .*kept \d+ delivered file/, '残したことと理由を言う');
  assert.match(up.out, /uninstall demo/, '消し方を示す');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '残りは配られたまま');

  const st = run(home, ['status', '-g'], { cli, allowFail: true });
  assert.equal(st.code, 1, '照合する元が無い状態は乖離である');
  assert.match(st.out, /module demo — gone from .*unverifiable/);
  assert.doesNotMatch(st.out, /demo-skill\/SKILL\.md — no longer delivered/, 'ファイルを並べ直さない');

  run(home, ['uninstall', 'demo', '-g'], { cli });
  assert.ok(!fs.existsSync(delivered), '明示した uninstall でだけ消える');
  assert.deepEqual(userManifest(home).modules, INSTALLED);
  assert.match(run(home, ['status', '-g'], { cli }).out, /no drift/);
});

test('置き場から消した module: 遍在則のファイルも黙って消えない', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);
  fs.rmSync(path.join(personalModules(home), 'review'), { recursive: true });

  run(home, ['update', '-g'], { allowFail: true });
  assert.equal(read(claudeRules(home)).trim(), RULES, '照合元が無くても、配ったファイルは残る');
  assert.equal(read(codexRules(home)).trim(), RULES);
});

test('分解された module: 憶えていた名前が消えても、行き先へ引き継がれ配達は保たれる', () => {
  const home = freshHome();
  run(home, ['install', ...LEGACY, '-g']);
  // 4.x の記録が憶えているのは harness という 1 つの名前である。中身は今この 5 つに分かれている。
  const m = userManifest(home);
  delete m.agentModules;
  delete m.agentRulesBodies;
  fs.writeFileSync(path.join(stateDir(home), 'user.json'),
    JSON.stringify({ ...m, modules: ['harness'] }, null, 2) + '\n');

  const r = run(home, ['update', '-g']);
  assert.match(r.out, /module harness → code git prompting review testing/, '行き先を黙って引き継がない');
  assert.deepEqual(userManifest(home).modules, LEGACY, '記録は今の語彙に直る');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/testing/SKILL.md')), '配達は保たれる — 名前が変わっただけである');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('名前の受け継ぎを宣言するのは module である: 私的な module でも同じように効く', () => {
  const home = freshHome();
  // mine は、正本に無い gone という名前と、生きている review の両方を受け継ぐと言い張る。
  const mine = path.join(personalModules(home), 'mine');
  fs.mkdirSync(path.join(mine, 'skills', 'mine-skill'), { recursive: true });
  fs.writeFileSync(path.join(mine, 'module.json'),
    JSON.stringify({ description: '私的な module', replaces: ['gone', 'review'] }) + '\n');
  fs.writeFileSync(path.join(mine, 'skills', 'mine-skill', 'SKILL.md'), '---\ndescription: mine\n---\n\n# mine\n');

  run(home, ['install', 'mine', '-g']);
  const m = userManifest(home);
  delete m.agentModules;
  delete m.agentRulesBodies;
  fs.writeFileSync(path.join(stateDir(home), 'user.json'),
    JSON.stringify({ ...m, modules: ['gone', 'review'] }, null, 2) + '\n');

  const r = run(home, ['update', '-g']);
  assert.match(r.out, /module gone → mine \(it was renamed\)/, '1 対 1 の受け継ぎは改名と言う');
  assert.deepEqual(userManifest(home).modules, ['mine', 'review'],
    '正本に生きている名前は横取りされない — 受け継げるのは消えた名前だけである');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('退役した名前: エイリアスとして生かさず、行き先を名指しして止まる', () => {
  const home = freshHome();

  const inst = run(home, ['install', 'harness', '-g'], { allowFail: true });
  assert.equal(inst.code, 1, '別名としては動かない');
  assert.match(inst.out, /harness is retired — it was split into code git prompting review testing/,
    '知っている行き先を黙らない');
  assert.ok(noDeployment(home), '止まった以上、配備の記録は書いていない');

  run(home, ['install', 'review', '-g']);
  const un = run(home, ['uninstall', 'harness', '-g'], { allowFail: true });
  assert.equal(un.code, 1);
  assert.match(un.out, /harness is retired — its rules are now code git prompting review testing/,
    '外し方も、今の名前で示す');
});

test('書き込みは原子的: 途中の状態が配達先に残らない', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);
  const strays = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.includes('.dotagents-')) strays.push(p);
    }
  };
  for (const d of ['.claude', '.codex']) walk(path.join(home, d));
  walk(agentsHome(home));
  assert.deepEqual(strays, [], '一時ファイルは rename で消え、後には残らない');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('status は記録の古さで落ちない: 正本に無い module も乖離として数え、最後まで報告する', () => {
  const home = freshHome();
  const { cli } = makeCorpus();
  run(home, ['install', ...BASE, 'demo', '-g'], { cli });
  fs.rmSync(path.join(personalModules(home), 'demo'), { recursive: true });

  const r = run(home, ['status', '-g'], { cli, allowFail: true });
  assert.equal(r.code, 1, '乖離として exit 1');
  assert.doesNotMatch(r.out, /unknown module/, '例外で途中で黙らない');
  assert.match(r.out, /module demo — gone from/);
  assert.match(r.out, /drift: \d+/, '最後の数え上げまで届く');
});

test('出どころ: 置き場は 1 つなので、見本のままか・手を入れたか・自分の物かで示す', () => {
  const home = freshHome();
  run(home, ['list']); // 見本が置かれる
  const mine = path.join(personalModules(home), 'mine');
  fs.mkdirSync(path.join(mine, 'skills', 'mine-skill'), { recursive: true });
  fs.writeFileSync(path.join(mine, 'module.json'), JSON.stringify({ description: '私的な module' }) + '\n');
  fs.writeFileSync(path.join(mine, 'skills', 'mine-skill', 'SKILL.md'), '---\ndescription: mine\n---\n\n# mine\n');
  fs.appendFileSync(path.join(personalModules(home), 'git', 'AGENTS.md'), '\n- 社内では squash しない\n');

  const lines = run(home, ['list']).out.split('\n');
  const noteFor = (name) => lines[lines.findIndex((l) => l.startsWith(`  ${name} `)) + 1] ?? '';
  assert.match(noteFor('review'), /from hiroiku$/, '見本のままの物は配布元の名で示す');
  assert.match(noteFor('git'), /from hiroiku, edited by you/, '手を入れた物は区別して示す');
  assert.doesNotMatch(noteFor('mine'), /from hiroiku/, '自分で置いた物に配布元は付かない');
});

test('list: 正本が提供する module と、要る外部コマンドの有無を示す(導入は代行しない)', () => {
  const home = freshHome();
  const { cli } = makeCorpus();
  const { out } = run(home, ['list'], { cli });
  assert.match(out, /^  review/m, 'module が並ぶ');
  assert.match(out, /^  demo/m);
  assert.match(out, /requires definitely-not-a-real-command/, '要るコマンドを示す');
  assert.match(out, /missing/, '無いことを伝える');

  // 依存が無くても配備は通る
  const r = run(home, ['install', 'demo', '-g'], { cli });
  assert.equal(r.code, 0, '依存の不在は配備を止めない');
  assert.match(r.out, /expects definitely-not-a-real-command/, '不在は伝える');
});

// ---------------------------------------------------------------- 本拠地

test('自分の module: 置き場へディレクトリを置くだけで、見本と同じように配られる', () => {
  const home = freshHome();
  const mine = path.join(personalModules(home), 'mine');
  fs.mkdirSync(path.join(mine, 'skills', 'mine-skill'), { recursive: true });
  fs.writeFileSync(path.join(mine, 'module.json'), JSON.stringify({ description: '私的な module' }) + '\n');
  fs.writeFileSync(path.join(mine, 'skills', 'mine-skill', 'SKILL.md'), '---\ndescription: mine\n---\n\n# mine\n');

  const listed = run(home, ['list']);
  assert.match(listed.out, /^  mine/m, '見本の隣に並ぶ');

  run(home, ['install', ...BASE, 'mine', '-g']);
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/mine-skill/SKILL.md')), '自分の module も配られる');
  assert.ok(fs.existsSync(path.join(home, PLUGIN, 'skills/prompting/SKILL.md')), '見本の module と一緒に配られる');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('見本は置き場へ実体で置かれる: 消したら戻らず、編集は残り、触っていない写しだけが追従する', () => {
  const home = freshHome();
  const first = run(home, ['list']);
  assert.match(first.out, /yours now/, '置いたことと、その人の物であることを言う');
  const seeded = path.join(personalModules(home), 'review');
  assert.ok(fs.existsSync(path.join(seeded, 'README.md')), '解説ごと置く — 真似する材料になる');

  // 消したものは、見本が新しくなっても戻らない
  fs.rmSync(path.join(personalModules(home), 'github'), { recursive: true });
  // 編集したものは残る
  const edited = path.join(personalModules(home), 'git', 'AGENTS.md');
  fs.appendFileSync(edited, '\n- 社内では squash しない\n');

  const again = run(home, ['list']);
  assert.ok(!fs.existsSync(path.join(personalModules(home), 'github')), '消したものは作り直さない');
  assert.match(read(edited), /squash しない/, '編集は残る');
  assert.match(again.out, /kept your edits in git/, '残したことを言う');

  run(home, ['list', '--force']);
  assert.doesNotMatch(read(edited), /squash しない/, '--force で見本の内容に戻る');
});

test('DOTAGENTS_HOME: 本拠地ごと移せる', () => {
  const home = freshHome();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-elsewhere-'));
  run(home, ['install', ...BASE, '-g'], { env: { DOTAGENTS_HOME: elsewhere } });

  assert.ok(fs.existsSync(path.join(elsewhere, 'state', 'user.json')), '記録は指定した本拠地に置かれる');
  assert.ok(!fs.existsSync(agentsHome(home)), '既定の場所には何も作らない');
  assert.match(run(home, ['status', '-g'], { env: { DOTAGENTS_HOME: elsewhere } }).out, /no drift/);
});

test('記録の移行: 本拠地の直下にあった manifest は state/ へ引き取られる', () => {
  const home = freshHome();
  run(home, ['install', ...BASE, '-g']);
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
  fs.copyFileSync(path.join(SKILL_MODULE, 'skills/prompting/SKILL.md'), oldSkill);
  fs.copyFileSync(path.join(RULES_MODULE, 'agents/review.md'), oldAgent);
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
  assert.deepEqual(userManifest(home).modules, LEGACY, 'module を持たない記録は、当時の唯一の配布物とみなす');
  assert.match(run(home, ['status', '-g']).out, /no drift/);
});

test('旧レイアウトの移行: .agents・symlink・zshenv 行・settings 断片を update が刈り込み、新レイアウトを敷く', () => {
  const home = freshHome();
  const root = path.join(home, '.agents');

  // 旧レイアウトの install が置いた物を再現する(所有記録付き)
  fs.mkdirSync(path.join(root, 'skills/dotagents-prompting'), { recursive: true });
  fs.copyFileSync(path.join(RULES_MODULE, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.copyFileSync(path.join(SKILL_MODULE, 'skills/prompting/SKILL.md'),
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

  assert.ok(!fs.existsSync(path.join(root, '.dotagents.json')), '旧レイアウトの記録は消える');
  assert.ok(fs.existsSync(path.join(root, 'skills/dotagents-prompting/SKILL.md')), 'Codex のネイティブスキルは新しく配られる');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), '自分が張った CLAUDE.md のリンクは消え、作り直さない');
  assert.ok(!fs.existsSync(path.join(home, '.codex/AGENTS.md')), '.codex/AGENTS.md のリンクも同じ');
  assert.equal(read(claudeRules(home)).trim(), RULES, '規則は rules に入る');
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
  fs.copyFileSync(path.join(RULES_MODULE, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
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
  fs.copyFileSync(path.join(RULES_MODULE, 'AGENTS.md'), path.join(root, 'AGENTS.md'));
  fs.copyFileSync(path.join(SKILL_MODULE, 'skills/prompting/SKILL.md'),
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

  assert.ok(!fs.existsSync(path.join(root, '.dotagents.json')), '旧レイアウトの記録は消える');
  assert.ok(fs.lstatSync(path.join(home, '.claude/CLAUDE.md')).isSymbolicLink(), 'CLAUDE.md は配達先ではないので、手張りのリンクに触れない');
  assert.ok(!fs.lstatSync(path.join(home, PLUGIN)).isSymbolicLink(), '配達先を塞ぐ切れたリンクは実体に置き換わる');
  const { out } = run(home, ['status', '-g']);
  assert.match(out, /no drift/, '移行後は乖離なし');
});

test('旧プロジェクトの移行: 所有記録のある .agents は刈り込み、記録に無いリンクには触れない', () => {
  const home = freshHome();
  const proj = freshProject();
  const root = path.join(proj, '.agents');
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(proj, '.claude'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), RULES);
  fs.symlinkSync('../.agents/AGENTS.md', path.join(proj, '.claude/CLAUDE.md'));
  fs.writeFileSync(path.join(root, '.dotagents.json'), JSON.stringify({
    schema: 1, kind: 'project', scope: 'full', version: '1.0.0', source: REPO,
    files: { 'AGENTS.md': sha(path.join(root, 'AGENTS.md')) },
    links: [],
    fragments: {},
  }) + '\n');

  run(home, ['update', '-C', proj]);
  assert.ok(!fs.existsSync(root), '旧配布物とその記録を除去する');
  assert.equal(fs.readlinkSync(path.join(proj, '.claude/CLAUDE.md')), '../.agents/AGENTS.md', 'プロジェクトのリンクはそのまま');
  assert.equal(read(claudeRules(proj)).trim(), RULES);
  assert.match(run(home, ['status', '-C', proj]).out, /no drift/);
});

test('生きた手張り symlink は上書きせず、警告して退く', () => {
  const home = freshHome();
  const mine = path.join(home, 'my-plugin');
  fs.mkdirSync(mine, { recursive: true });
  fs.writeFileSync(path.join(mine, 'SKILL.md'), '# my very own\n');
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(mine, path.join(home, '.claude/skills/dotagents'));

  const r = run(home, ['install', ...BASE, '-g'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills/dotagents')).isSymbolicLink(), 'リンクは残る');
  assert.equal(read(path.join(mine, 'SKILL.md')), '# my very own\n', 'リンク先を書き換えない');
  assert.equal(userManifest(home).files[`${PLUGIN}/skills/prompting/SKILL.md`], undefined, '所有記録に入れない');
});

function shareProjectRules(proj, text) {
  const canonical = path.join(proj, '.agents/AGENTS.md');
  fs.mkdirSync(path.dirname(canonical), { recursive: true });
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  fs.writeFileSync(canonical, text);
  for (const [rel, target] of [['AGENTS.md', '.agents/AGENTS.md'], ['.claude/CLAUDE.md', '../.agents/AGENTS.md']]) {
    fs.rmSync(path.join(proj, rel), { force: true });
    fs.symlinkSync(target, path.join(proj, rel));
  }
  return canonical;
}

test('プロジェクトの指示: ルートの AGENTS.md・CLAUDE.md とそのリンクには、install から uninstall まで触れない', () => {
  const home = freshHome();
  const proj = freshProject();
  fs.mkdirSync(path.join(proj, '.codex'));
  const own = '# プロジェクトの規則\n\n- 業務の言葉を保つ。\n';
  const canonical = shareProjectRules(proj, own);
  const untouched = () => {
    assert.equal(read(canonical), own);
    assert.equal(fs.readlinkSync(path.join(proj, 'AGENTS.md')), '.agents/AGENTS.md');
    assert.equal(fs.readlinkSync(path.join(proj, '.claude/CLAUDE.md')), '../.agents/AGENTS.md');
  };

  run(home, ['install', ...BASE, '-C', proj]);
  untouched();
  assert.equal(read(claudeRules(proj)).trim(), RULES, 'Claude には rules のファイルで届く');
  assert.equal(read(codexRules(proj)).trim(), RULES, 'Codex には自分の置き場のファイルで届く');
  assert.ok(!fs.existsSync(path.join(proj, '.codex/hooks.json')), 'Codex の hook はプロジェクトに置かない');
  const st = run(home, ['status', '-C', proj]);
  assert.match(st.out, /no drift/);
  assert.doesNotMatch(st.out, /reads this instead of AGENTS\.md/, '同じ実体を指す CLAUDE.md は知らせない');

  run(home, ['update', '-C', proj]);
  untouched();
  run(home, ['uninstall', '-C', proj]);
  untouched();
  assert.ok(!fs.existsSync(path.join(proj, '.claude/rules')));
  assert.ok(!fs.existsSync(path.join(proj, '.codex/dotagents')));
});

test('プロジェクトの指示: 中身の違う CLAUDE.md があれば、Claude Code が AGENTS.md を読まないことを status が知らせる', () => {
  const home = freshHome();
  const proj = freshProject();
  fs.writeFileSync(path.join(proj, 'AGENTS.md'), '# プロジェクトの規則\n');
  fs.writeFileSync(path.join(proj, 'README.md'), '# 説明\n');
  fs.symlinkSync('README.md', path.join(proj, 'CLAUDE.md'));
  run(home, ['install', ...BASE, '-C', proj]);
  const st = run(home, ['status', '-C', proj]);
  assert.equal(st.code, 0, '差分には数えない');
  assert.match(st.out, /CLAUDE\.md — Claude Code reads this instead of AGENTS\.md/);
});

// 5.x はプロジェクトの規則ファイルへ管理ブロックを書いていた。その記録を持つ配備を再現する。
const BLOCK = `<!-- agents-harness:begin (managed by dotagents; edits here are overwritten) -->\n${RULES}\n<!-- agents-harness:end -->\n`;
function oldBlockDeployment(home, proj, blocks) {
  const dir = path.join(stateDir(home), 'projects');
  fs.mkdirSync(dir, { recursive: true });
  const base = fs.realpathSync(proj);
  const name = `${path.basename(base)}-${crypto.createHash('sha256').update(base).digest('hex').slice(0, 12)}.json`;
  fs.writeFileSync(path.join(dir, name), JSON.stringify({
    schema: 5, kind: 'project', base, modules: INSTALLED,
    agentModules: { claude: INSTALLED, codex: INSTALLED }, version: '5.8.1', files: {},
    rulesBodies: { review: RULES }, rulesBlocks: blocks,
  }, null, 2) + '\n');
}

test('旧・規則ブロック: update は記録にあるブロックを剥がし、プロジェクトの記述を残す', () => {
  const home = freshHome();
  const proj = freshProject();
  fs.mkdirSync(path.join(proj, '.codex'));
  const own = '# プロジェクトの規則\n';
  const canonical = shareProjectRules(proj, `${own}\n${BLOCK}`);
  fs.mkdirSync(path.join(proj, '.claude/sub'), { recursive: true });
  const created = path.join(proj, '.claude/sub/CLAUDE.md');
  fs.writeFileSync(created, BLOCK);
  oldBlockDeployment(home, proj, [
    { file: '.agents/AGENTS.md', createdFile: false, agents: ['claude', 'codex'] },
    { file: '.claude/sub/CLAUDE.md', createdFile: true, agents: ['claude'] },
  ]);

  const st = run(home, ['status', '-C', proj], { allowFail: true });
  assert.equal(st.code, 1);
  assert.match(st.out, /rules block \.agents\/AGENTS\.md — the old layout, run update to remove/);

  run(home, ['update', '-C', proj]);
  assert.equal(read(canonical), own, 'ブロックだけが剥がれる');
  assert.equal(fs.readlinkSync(path.join(proj, 'AGENTS.md')), '.agents/AGENTS.md', 'リンクはそのまま');
  assert.ok(!fs.existsSync(created), '自分が作ったファイルは空になれば消える');
  assert.equal(read(claudeRules(proj)).trim(), RULES, '規則は新しい置き場へ入る');
  assert.equal(read(codexRules(proj)).trim(), RULES);
  assert.equal(projectManifest(home, proj).rulesBlocks, undefined, 'ブロックの記録は消える');
  assert.match(run(home, ['status', '-C', proj]).out, /no drift/);
});

test('旧・規則ブロック: 片方のツールだけを update するあいだは、両方が読むブロックを残す', () => {
  const home = freshHome();
  const proj = freshProject();
  fs.mkdirSync(path.join(proj, '.codex'));
  const canonical = shareProjectRules(proj, `# 規則\n\n${BLOCK}`);
  oldBlockDeployment(home, proj, [{ file: '.agents/AGENTS.md', createdFile: false, agents: ['claude', 'codex'] }]);

  run(home, ['update', '--agent', 'claude', '-C', proj]);
  assert.ok(read(canonical).includes(RULES), 'Codex はまだこのブロックで規則を読んでいる');
  assert.equal(projectManifest(home, proj).rulesBlocks.length, 1);
  run(home, ['update', '-C', proj]);
  assert.equal(read(canonical), '# 規則\n');
});

for (const redirected of ['ファイル', 'ディレクトリー']) {
  test(`旧・規則ブロック: 記録にある${redirected}が外へのリンクに変わっていたら、書き換えず記録に残す`, () => {
    const home = freshHome();
    const proj = freshProject();
    fs.mkdirSync(path.join(proj, '.codex'));
    const canonical = shareProjectRules(proj, `# 規則\n\n${BLOCK}`);
    oldBlockDeployment(home, proj, [{ file: '.agents/AGENTS.md', createdFile: false, agents: ['claude', 'codex'] }]);
    const externalDir = freshProject();
    const external = path.join(externalDir, 'AGENTS.md');
    const before = read(canonical);
    fs.writeFileSync(external, before);
    if (redirected === 'ファイル') {
      fs.unlinkSync(canonical);
      fs.symlinkSync(external, canonical);
    } else {
      fs.rmSync(path.dirname(canonical), { recursive: true });
      fs.symlinkSync(externalDir, path.dirname(canonical));
    }

    const up = run(home, ['update', '-C', proj], { allowFail: true });
    assert.equal(up.code, 1, up.out);
    assert.match(up.out, /leaving the old rules block/);
    assert.equal(read(external), before, 'リンクの先は書き換えない');
    assert.equal(projectManifest(home, proj).rulesBlocks.length, 1, '剥がせなかった記録は残る');
    assert.equal(run(home, ['status', '-C', proj], { allowFail: true }).code, 1);
  });
}

// ---------------------------------------------------------------- 配備先

test('project install(既定): プロジェクトの .claude/ に入り、マシン固有の物を何も残さない', () => {
  const home = freshHome();
  const proj = freshProject();
  execFileSync('git', ['init', '-q'], { cwd: proj });
  run(home, ['install', ...BASE], { cwd: proj });

  assert.ok(fs.existsSync(path.join(proj, PLUGIN, 'skills/prompting/SKILL.md')), 'plugin が実ファイルで入る');
  assert.equal(read(claudeRules(proj)).trim(), RULES, '規則は .claude/rules に入る');
  assert.ok(!fs.existsSync(path.join(proj, '.claude/CLAUDE.md')), 'CLAUDE.md は作らない');
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.agents は作らない');
  assert.ok(!fs.existsSync(path.join(proj, '.codex')), '.codex が無いプロジェクトには作らない');
  assert.ok(!fs.existsSync(path.join(proj, 'AGENTS.md')), 'root AGENTS.md が無いプロジェクトには作らない');

  const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: proj, encoding: 'utf8' });
  assert.ok(!status.includes('dotagents.json'), 'manifest はプロジェクトに現れない(本拠地に置く)');
  assert.ok(status.split('\n').filter(Boolean).every((l) => l.includes('.claude/')), '増えるのは .claude/ 配下だけ');
  assert.equal(projectManifest(home, proj).kind, 'project');
  assert.ok(!fs.existsSync(path.join(home, '.claude/rules')), 'user レベルには何も敷かない');

  run(home, ['uninstall'], { cwd: proj });
  assert.ok(!fs.existsSync(path.join(proj, '.claude/rules')), '規則のファイルは消える');
  assert.ok(!fs.existsSync(path.join(proj, PLUGIN)), 'plugin も消える');
});

test('-C は場所を名指しする。-g との併用は矛盾なので止まる', () => {
  const home = freshHome();
  const proj = freshProject();
  run(home, ['install', ...BASE, '-C', proj]);
  assert.ok(fs.existsSync(path.join(proj, PLUGIN, 'skills/prompting/SKILL.md')), '-C の場所に入る');
  assert.equal(projectManifest(home, proj).kind, 'project');

  const r = run(home, ['install', ...BASE, '-g', '-C', proj], { allowFail: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /-g and -C are exclusive/);
});

test('既定の配備先は名指しを要る場合がある: git リポジトリでない場所は非対話で止まる', () => {
  const home = freshHome();
  const loose = freshProject('dotagents-loose-');
  const r = run(home, ['install', ...BASE], { cwd: loose, allowFail: true });
  assert.equal(r.code, 1, '無関係な場所に黙って書かない');
  assert.match(r.out, /not a git repository/);
  assert.ok(!fs.existsSync(path.join(loose, '.claude')), '止まった以上、何も書いていない');

  run(home, ['install', ...BASE, '-C', loose]);
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
  assert.match(r.out, /agents-setup install review/, '選べる module を示す');
  assert.ok(noDeployment(home), '止まった以上、配備の記録は書いていない');
  assert.ok(!fs.existsSync(path.join(proj, '.claude')));
});

test('引数の形: 不明な module・対象を取らないコマンドへの module 指定は、何も書かずに止まる', () => {
  const home = freshHome();
  const cases = [
    [['install', 'nosuch'], /unknown module: nosuch/],
    [['update', 'review'], /`update` takes no module names/],
    [['status', 'review'], /`status` takes no module names/],
    [['list', 'review'], /`list` takes no arguments/],
    [['install', '--bogus'], /unknown argument/],
    [['install', '-C'], /-C takes a value/],
  ];
  for (const [args, pattern] of cases) {
    const r = run(home, args, { allowFail: true });
    assert.equal(r.code, 1, `${args.join(' ')} は止まる`);
    assert.match(r.out, pattern, `${args.join(' ')} は理由を示す`);
  }
  assert.ok(noDeployment(home), '止まった以上、配備の記録は書いていない');
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
  assert.ok(noDeployment(home), '止まった以上、配備の記録は書いていない');
});

test('help: 対象ごとに語彙を分けて示し、コマンドごとの説明も引ける', () => {
  const home = freshHome();
  const overall = run(home, ['--help']);
  assert.match(overall.out, /agents-setup <command> \[module\.\.\.\] \[options\]/);
  assert.match(overall.out, /The rules/, '規則の出どころを束ねて示す');
  assert.match(overall.out, /Deployments/, '配備の語彙を分けて示す');
  for (const cmd of ['list', 'install', 'update', 'uninstall', 'status']) {
    assert.match(overall.out, new RegExp(`^  ${cmd}\\b`, 'm'), `${cmd} が一覧に出る`);
  }
  for (const gone of ['--keep-shell', 'clone', 'pull']) {
    assert.ok(!overall.out.includes(gone), `退役した ${gone} の語彙は出ない`);
  }

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
