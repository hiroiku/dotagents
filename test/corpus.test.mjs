// 正本の取得(clone)・追従(pull)・正本外からの委譲・配備の古さ検出の契約を固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// テストは本拠地を HOME か明示の DOTAGENTS_HOME から導くので、走らせる人の設定に
// 引きずられない(pull は corpus の中でテストを走らせる — 混ざると偽の赤になる)。
delete process.env.DOTAGENTS_HOME;

function run(bin, args, { cwd = REPO, env = {} } = {}) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// 追従テスト用の小さな正本: git 上流 + bin/agents-setup(実物のコピー)+ test script 無しの package.json
// withModule を立てると配れる module を 1 つ持つ — 追従が配備まで届くかを見るのに要る。
function makeUpstream({ withModule = false } = {}) {
  const dir = tmp('dotagents-upstream-');
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.copyFileSync(CLI, path.join(dir, 'bin', 'agents-setup'));
  fs.chmodSync(path.join(dir, 'bin', 'agents-setup'), 0o755);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.1' }) + '\n');
  const skill = path.join(dir, 'modules', 'demo', 'skills', 'demo-skill', 'SKILL.md');
  if (withModule) {
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(path.join(dir, 'modules', 'demo', 'module.json'),
      JSON.stringify({ description: '試験用の module' }) + '\n');
    fs.writeFileSync(skill, '---\ndescription: demo\n---\n\n# demo v1\n');
  }
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  const commit = (msg) => {
    fs.appendFileSync(path.join(dir, 'RULES.md'), `${msg}\n`);
    git('add', '.');
    git('commit', '-q', '-m', msg);
  };
  // 配る中身そのものを動かす。追従が配備へ届いたかは、届いた本文でしか確かめられない。
  const editSkill = (body, msg) => {
    fs.writeFileSync(skill, `---\ndescription: demo\n---\n\n# ${body}\n`);
    git('add', '.');
    git('commit', '-q', '-m', msg);
  };
  return { dir, git, commit, editSkill };
}

test('clone: 既定は本拠地の corpus/、名指しもでき、--from の上流から編集可能な git リポジトリを作る', () => {
  const { dir: upstream } = makeUpstream();
  const dest = path.join(tmp('dotagents-clone-'), 'corpus');

  const home = tmp('dotagents-home-');
  const dflt = run(CLI, ['clone', '--from', upstream], { env: { DOTAGENTS_HOME: home } });
  assert.equal(dflt.code, 0, dflt.out);
  assert.ok(fs.existsSync(path.join(home, 'corpus', '.git')), '本拠地の corpus/ に入る');

  const ok = run(CLI, ['clone', dest, '--from', upstream]);
  assert.equal(ok.code, 0, ok.out);
  assert.ok(fs.existsSync(path.join(dest, '.git')), '編集可能な git リポジトリになる');
  assert.ok(fs.existsSync(path.join(dest, 'bin', 'agents-setup')));
  assert.match(ok.out, /corpus cloned/);

  const occupied = run(CLI, ['clone', dest, '--from', upstream]);
  assert.equal(occupied.code, 1, '空でないディレクトリへは取得しない');
});

test('pull: 上流の差分をコミットタイトルで提示して取り込み、無ければその旨、dirty なら止まる', () => {
  const { dir: upstream, commit } = makeUpstream();
  const work = path.join(tmp('dotagents-work-'), 'corpus');
  execFileSync('git', ['clone', '-q', upstream, work]);
  const cli = path.join(work, 'bin', 'agents-setup');

  const upToDate = run(cli, ['pull'], { cwd: work });
  assert.equal(upToDate.code, 0, upToDate.out);
  assert.match(upToDate.out, /nothing new upstream/);

  commit('停止則の外部記録化');
  commit('回収のセッション入口反転');
  const pulled = run(cli, ['pull'], { cwd: work });
  assert.equal(pulled.code, 0, pulled.out);
  assert.match(pulled.out, /停止則の外部記録化/, 'コミットタイトルが changelog として出る');
  assert.match(pulled.out, /pulled 2 commits/);
  const head = execFileSync('git', ['-C', work, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  assert.equal(head, '回収のセッション入口反転', '取り込みまで完了する');

  fs.appendFileSync(path.join(work, 'RULES.md'), 'local edit\n');
  commit('三度目の上流変更');
  const dirty = run(cli, ['pull'], { cwd: work });
  assert.equal(dirty.code, 1);
  assert.match(dirty.out, /uncommitted changes/, '未コミットの上に取り込まない');
});

test('入口は実装を持たず、正本へ渡す — 無ければ取ってきてから渡し、行き止まりにしない', () => {
  const notCorpus = tmp('dotagents-cache-');
  fs.mkdirSync(path.join(notCorpus, 'bin'));
  const cachedCli = path.join(notCorpus, 'bin', 'agents-setup');
  fs.copyFileSync(CLI, cachedCli);
  fs.chmodSync(cachedCli, 0o755);

  // 正本を知らない機械。初回だけ別の手順、という段差を作らない。
  const { dir: upstream } = makeUpstream();
  const orphanHome = tmp('dotagents-home-');
  const fresh = run(cachedCli, ['status', '-g', '--from', upstream], { env: { HOME: orphanHome } });
  assert.match(fresh.out, /getting one first/, '取ってくることを告げる');
  assert.ok(fs.existsSync(path.join(orphanHome, '.dotagents', 'corpus', '.git')), '本拠地に正本ができる');
  assert.match(fresh.out, /delegating to/, '取ってきた正本へ渡す');

  // 既に在るなら、二度は取らずにそこへ渡す。
  const again = run(cachedCli, ['status', '-g'], { env: { HOME: orphanHome } });
  assert.doesNotMatch(again.out, /getting one first/, '在る正本を取り直さない');
  assert.match(again.out, /delegating to/);

  // 旧レイアウトの記録しか無い機械でも、その正本へ渡す。
  const knownHome = tmp('dotagents-home-');
  fs.mkdirSync(path.join(knownHome, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(knownHome, '.agents', '.dotagents.json'), JSON.stringify({ source: REPO }) + '\n');
  const delegated = run(cachedCli, ['status', '-g'], { env: { HOME: knownHome } });
  assert.match(delegated.out, /delegating to/, '既知の正本の agents-setup へ委譲する');
});

test('上流の差分は知らせるだけ — 知らせても、取り込みも配り直しもしない', () => {
  const { dir: upstream, editSkill } = makeUpstream({ withModule: true });
  const work = path.join(tmp('dotagents-work-'), 'corpus');
  execFileSync('git', ['clone', '-q', upstream, work]);
  const cli = path.join(work, 'bin', 'agents-setup');
  const home = tmp('dotagents-home-');
  const proj = tmp('dotagents-proj-');
  const env = { HOME: home };
  const delivered = path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'demo-skill', 'SKILL.md');

  run(cli, ['install', 'demo', '-C', proj], { cwd: work, env });
  editSkill('demo v2', '規則を書き換える');

  // 上流を見るのは 1 日 1 回。直前に見たばかりなら、その差分はまだ知らない。
  const cache = path.join(work, '.git', 'dotagents-upstream.json');
  assert.ok(fs.existsSync(cache), '知らせの記録は正本のキャッシュとして持つ');
  assert.ok(!fs.existsSync(path.join(home, '.dotagents', 'state', 'upstream.json')),
    '配備の記録には混ぜない');
  const quiet = run(cli, ['status', '-C', proj], { cwd: work, env });
  assert.doesNotMatch(quiet.out, /commit upstream/, '毎回は上流を見に行かない');

  // 1 日経ったことにすると、見に行って知らせる
  fs.writeFileSync(cache, JSON.stringify({ checkedAt: Date.now() - 25 * 60 * 60 * 1000, behind: 0 }));
  const checked = run(cli, ['status', '-C', proj], { cwd: work, env });
  assert.match(checked.out, /1 commit upstream/, '在ることは伝える');

  // 伝えるだけで、正本も配備も動かさない
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v1/, '規則は勝手に変わらない');
  const head = execFileSync('git', ['-C', work, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  assert.equal(head, 'init', '正本も動かさない');
});

test('update: 追従してから配り直す。追従できない事情は配備まで止めない', () => {
  const { dir: upstream, editSkill } = makeUpstream({ withModule: true });
  const work = path.join(tmp('dotagents-work-'), 'corpus');
  execFileSync('git', ['clone', '-q', upstream, work]);
  const cli = path.join(work, 'bin', 'agents-setup');
  const home = tmp('dotagents-home-');
  const proj = tmp('dotagents-proj-');
  const env = { HOME: home };
  const delivered = path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'demo-skill', 'SKILL.md');

  const installed = run(cli, ['install', 'demo', '-C', proj], { cwd: work, env });
  assert.equal(installed.code, 0, installed.out);
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v1/);

  // 上流で規則そのものが動く → update ひとつで、追従も配り直しも済む
  editSkill('demo v2', '規則を書き換える');
  const updated = run(cli, ['update', '-C', proj], { cwd: work, env });
  assert.equal(updated.code, 0, updated.out);
  assert.match(updated.out, /規則を書き換える/, '取り込む前にコミットタイトルを見せる');
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v2/, '追従が配備まで届く');

  // 手元で正本を編集している間も、配備は動かせる
  editSkill('demo v3', 'さらに書き換える');
  fs.appendFileSync(path.join(work, 'RULES.md'), 'local edit\n');
  const dirty = run(cli, ['update', '-C', proj], { cwd: work, env });
  assert.equal(dirty.code, 0, dirty.out);
  assert.match(dirty.out, /not following upstream/, '追従できない事情はそう言う');
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v2/, '配り直しは進む(正本は動いていない)');

  // --no-follow は上流を見ない
  const held = run(cli, ['update', '-C', proj, '--no-follow'], { cwd: work, env });
  assert.equal(held.code, 0, held.out);
  assert.doesNotMatch(held.out, /not following upstream/);
});

