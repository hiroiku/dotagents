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

function run(bin, args, { cwd = REPO, env = {} } = {}) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [bin, ...args], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// 追従テスト用の小さな正本: git 上流 + bin/agents-setup(実物のコピー)+ test script 無しの package.json
function makeUpstream() {
  const dir = tmp('dotagents-upstream-');
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.copyFileSync(CLI, path.join(dir, 'bin', 'agents-setup'));
  fs.chmodSync(path.join(dir, 'bin', 'agents-setup'), 0o755);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.1' }) + '\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  const commit = (msg) => {
    fs.appendFileSync(path.join(dir, 'RULES.md'), `${msg}\n`);
    git('add', '.');
    git('commit', '-q', '-m', msg);
  };
  return { dir, git, commit };
}

test('clone: 取得先は明示か対話のみ、--from の上流から編集可能な git リポジトリを作る', () => {
  const { dir: upstream } = makeUpstream();
  const dest = path.join(tmp('dotagents-clone-'), 'corpus');

  const noDir = run(CLI, ['clone', '--from', upstream]);
  assert.equal(noDir.code, 1, '非対話で取得先の省略は止まる');
  assert.match(noDir.out, /no directory given/);

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

test('正本の外では配備しない: 既知の正本へ委譲し、無ければ clone への案内で止まる', () => {
  const notCorpus = tmp('dotagents-cache-');
  fs.mkdirSync(path.join(notCorpus, 'bin'));
  const cachedCli = path.join(notCorpus, 'bin', 'agents-setup');
  fs.copyFileSync(CLI, cachedCli);
  fs.chmodSync(cachedCli, 0o755);

  const orphanHome = tmp('dotagents-home-');
  const guided = run(cachedCli, ['status', '-g'], { env: { HOME: orphanHome } });
  assert.equal(guided.code, 1, '正本が無ければ配備系は止まる');
  assert.match(guided.out, /npx @hiroiku\/dotagents clone/, 'clone への案内を出す');

  const knownHome = tmp('dotagents-home-');
  fs.mkdirSync(path.join(knownHome, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(knownHome, '.agents', '.dotagents.json'), JSON.stringify({ source: REPO }) + '\n');
  const delegated = run(cachedCli, ['status', '-g'], { env: { HOME: knownHome } });
  assert.match(delegated.out, /delegating to/, '既知の正本の agents-setup へ委譲する');
});

