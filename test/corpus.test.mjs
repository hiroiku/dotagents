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

// 配布物として動く実装。modules を持たないので「開発中の自分」ではなく、本拠地の
// 正本を規則の出どころにする — 使う人の手元で起きることと同じ形になる。
function installedCli() {
  const dir = tmp('dotagents-pkg-');
  fs.mkdirSync(path.join(dir, 'bin'));
  const bin = path.join(dir, 'bin', 'agents-setup');
  fs.copyFileSync(CLI, bin);
  fs.chmodSync(bin, 0o755);
  fs.copyFileSync(path.join(REPO, 'package.json'), path.join(dir, 'package.json'));
  return bin;
}

// 追従テスト用の小さな上流: 規則だけを持つ git リポジトリ。実装は同居しない。
function makeUpstream({ withModule = true } = {}) {
  const dir = tmp('dotagents-upstream-');
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  const skill = path.join(dir, 'modules', 'demo', 'skills', 'demo-skill', 'SKILL.md');
  if (withModule) {
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(path.join(dir, 'modules', 'demo', 'module.json'),
      JSON.stringify({ description: '試験用の module' }) + '\n');
    fs.writeFileSync(skill, '---\ndescription: demo\n---\n\n# demo v1\n');
  } else {
    fs.mkdirSync(path.join(dir, 'modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'modules', '.keep'), '');
  }
  fs.writeFileSync(path.join(dir, 'RULES.md'), '# rules\n');
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

  const ok = run(CLI, ['clone', dest, '--from', upstream], { env: { DOTAGENTS_HOME: tmp('dotagents-home-') } });
  assert.equal(ok.code, 0, ok.out);
  assert.ok(fs.existsSync(path.join(dest, '.git')), '編集可能な git リポジトリになる');
  assert.ok(fs.existsSync(path.join(dest, 'modules')), '規則が入っている');
  assert.match(ok.out, /corpus cloned/);

  const occupied = run(CLI, ['clone', dest, '--from', upstream]);
  assert.equal(occupied.code, 1, '空でないディレクトリへは取得しない');
});

test('clone: 名指しで別の場所へ置いても、以後のコマンドはそこを見る', () => {
  const { dir: upstream } = makeUpstream();
  const dest = path.join(tmp('dotagents-elsewhere-'), 'rules');
  const home = tmp('dotagents-home-');
  const env = { DOTAGENTS_HOME: home };
  const cli = installedCli();

  assert.equal(run(cli, ['clone', dest, '--from', upstream], { env }).code, 0);
  const listed = run(cli, ['list'], { env });
  assert.match(listed.out, /demo/, '名指しした場所の規則が見えている');
  assert.match(listed.out, new RegExp(dest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(!fs.existsSync(path.join(home, 'corpus')), '既定の場所へ取り直さない');
});

test('pull: 上流の差分をコミットタイトルで提示して取り込み、無ければその旨、dirty なら止まる', () => {
  const { dir: upstream, commit } = makeUpstream();
  const home = tmp('dotagents-home-');
  const work = path.join(home, 'corpus');
  execFileSync('git', ['clone', '-q', upstream, work]);
  const cli = installedCli();
  const env = { DOTAGENTS_HOME: home };

  const upToDate = run(cli, ['pull'], { env });
  assert.equal(upToDate.code, 0, upToDate.out);
  assert.match(upToDate.out, /nothing new upstream/);

  commit('停止則の外部記録化');
  commit('回収のセッション入口反転');
  const pulled = run(cli, ['pull'], { env });
  assert.equal(pulled.code, 0, pulled.out);
  assert.match(pulled.out, /停止則の外部記録化/, 'コミットタイトルが changelog として出る');
  assert.match(pulled.out, /pulled 2 commits/);
  const head = execFileSync('git', ['-C', work, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  assert.equal(head, '回収のセッション入口反転', '取り込みまで完了する');

  fs.appendFileSync(path.join(work, 'RULES.md'), 'local edit\n');
  commit('三度目の上流変更');
  const dirty = run(cli, ['pull'], { env });
  assert.equal(dirty.code, 1);
  assert.match(dirty.out, /uncommitted changes/, '未コミットの上に取り込まない');
});

test('実装は手元にあり、取ってくるのは規則だけ — 誰にも渡さず、行き止まりにもならない', () => {
  const cli = installedCli();
  const { dir: upstream } = makeUpstream();
  const home = tmp('dotagents-home-');
  const env = { DOTAGENTS_HOME: home };

  // 規則を知らない機械。初回だけ別の手順、という段差を作らない。
  const fresh = run(cli, ['list', '--from', upstream], { env });
  assert.equal(fresh.code, 0, fresh.out);
  assert.match(fresh.out, /getting them first/, '取ってくることを告げる');
  assert.ok(fs.existsSync(path.join(home, 'corpus', 'modules')), '本拠地に規則が入る');
  assert.match(fresh.out, /demo/, '取ってきた規則がそのまま見える');
  assert.doesNotMatch(fresh.out, /delegating/, '実装は手元にあるので、渡す相手はいない');

  // 二度は取らない
  const again = run(cli, ['list'], { env });
  assert.doesNotMatch(again.out, /getting them first/, '在る規則を取り直さない');
  assert.match(again.out, /demo/);

  // 取ってくるのは規則だけで、実装は同居しない
  assert.ok(!fs.existsSync(path.join(home, 'corpus', 'bin')), '規則の側に実装を置かない');
});

test('上流の差分は知らせるだけ — 知らせても、取り込みも配り直しもしない', () => {
  const { dir: upstream, editSkill } = makeUpstream();
  const home = tmp('dotagents-home-');
  const work = path.join(home, 'corpus');
  execFileSync('git', ['clone', '-q', upstream, work]);
  const cli = installedCli();
  const proj = tmp('dotagents-proj-');
  const env = { DOTAGENTS_HOME: home };
  const delivered = path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'demo-skill', 'SKILL.md');

  run(cli, ['install', 'demo', '-C', proj], { env });
  editSkill('demo v2', '規則を書き換える');

  // 上流を見るのは 1 日 1 回。直前に見たばかりなら、その差分はまだ知らない。
  const cache = path.join(work, '.git', 'dotagents-upstream.json');
  assert.ok(fs.existsSync(cache), '知らせの記録は正本のキャッシュとして持つ');
  assert.ok(!fs.existsSync(path.join(home, 'state', 'upstream.json')),
    '配備の記録には混ぜない');
  const quiet = run(cli, ['status', '-C', proj], { env });
  assert.doesNotMatch(quiet.out, /commit upstream/, '毎回は上流を見に行かない');

  // 1 日経ったことにすると、見に行って知らせる
  fs.writeFileSync(cache, JSON.stringify({ checkedAt: Date.now() - 25 * 60 * 60 * 1000, behind: 0 }));
  const checked = run(cli, ['status', '-C', proj], { env });
  assert.match(checked.out, /1 commit upstream/, '在ることは伝える');

  // 伝えるだけで、正本も配備も動かさない
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v1/, '規則は勝手に変わらない');
  const head = execFileSync('git', ['-C', work, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  assert.equal(head, 'init', '正本も動かさない');
});

test('update: 追従してから配り直す。追従できない事情は配備まで止めない', () => {
  const { dir: upstream, editSkill } = makeUpstream();
  const home = tmp('dotagents-home-');
  const work = path.join(home, 'corpus');
  execFileSync('git', ['clone', '-q', upstream, work]);
  const cli = installedCli();
  const proj = tmp('dotagents-proj-');
  const env = { DOTAGENTS_HOME: home };
  const delivered = path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'demo-skill', 'SKILL.md');

  const installed = run(cli, ['install', 'demo', '-C', proj], { env });
  assert.equal(installed.code, 0, installed.out);
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v1/);

  // 上流で規則そのものが動く → update ひとつで、追従も配り直しも済む
  editSkill('demo v2', '規則を書き換える');
  const updated = run(cli, ['update', '-C', proj], { env });
  assert.equal(updated.code, 0, updated.out);
  assert.match(updated.out, /規則を書き換える/, '取り込む前にコミットタイトルを見せる');
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v2/, '追従が配備まで届く');

  // 手元で正本を編集している間も、配備は動かせる
  editSkill('demo v3', 'さらに書き換える');
  fs.appendFileSync(path.join(work, 'RULES.md'), 'local edit\n');
  const dirty = run(cli, ['update', '-C', proj], { env });
  assert.equal(dirty.code, 0, dirty.out);
  assert.match(dirty.out, /not following upstream/, '追従できない事情はそう言う');
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v2/, '配り直しは進む(正本は動いていない)');

  // --no-follow は上流を見ない
  const held = run(cli, ['update', '-C', proj, '--no-follow'], { env });
  assert.equal(held.code, 0, held.out);
  assert.doesNotMatch(held.out, /not following upstream/);
});

