// agents-gate(完了ゲートの機械項目)の判定を固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const GATE = path.join(REPO, 'payload', 'bin', 'agents-gate');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-gate-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'init');
  return { dir, git };
}

function makeBdStub({ children = '[]', inprog = '[]' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-gatestub-'));
  fs.writeFileSync(path.join(dir, 'bd'), `#!/bin/sh
case "$*" in
  children*)                echo '${children}' ;;
  *"--status in_progress"*) echo '${inprog}' ;;
  *) echo '[]' ;;
esac
`, { mode: 0o755 });
  return dir;
}

function runGate(cwd, args, { stubDir, env = {} } = {}) {
  const PATH = `${stubDir ? stubDir + path.delimiter : ''}/usr/bin:/bin`;
  try {
    return { code: 0, out: execFileSync(GATE, args, { cwd, env: { PATH, HOME: os.homedir(), ...env }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('gate: clean な worktree と通過する check は ok、失敗する check は NG', () => {
  const { dir } = makeRepo();
  const pass = runGate(dir, ['--check', 'true']);
  assert.equal(pass.code, 0);
  assert.match(pass.out, /ok {2}worktree clean/);
  assert.match(pass.out, /ok {2}check: true/);
  assert.match(pass.out, /gate: ok/);

  const fail = runGate(dir, ['--check', 'false']);
  assert.equal(fail.code, 1);
  assert.match(fail.out, /NG {2}check: false/);
});

test('gate: 未 commit の変更と、レビュー対象コミットとの不一致を検出する', () => {
  const { dir, git } = makeRepo();
  fs.writeFileSync(path.join(dir, 'x.txt'), 'dirty\n');
  const dirty = runGate(dir, []);
  assert.equal(dirty.code, 1);
  assert.match(dirty.out, /NG {2}worktree に未 commit の変更/);

  fs.rmSync(path.join(dir, 'x.txt'));
  const head = git('rev-parse', 'HEAD').trim();
  assert.equal(runGate(dir, ['--commit', head]).code, 0);
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'next');
  const stale = runGate(dir, ['--commit', head]);
  assert.equal(stale.code, 1);
  assert.match(stale.out, /NG {2}HEAD/);
});

test('gate: issue の子の open 残と、自 actor の in_progress 残置を bd から導出する', () => {
  const { dir } = makeRepo();
  const stub = makeBdStub({
    children: '[{"id":"x-1.1","status":"closed"},{"id":"x-1.2","status":"open"}]',
    inprog: '[{"id":"x-9","assignee":"mgr-me"},{"id":"x-1","assignee":"mgr-me"},{"id":"x-8","assignee":"mgr-other"}]',
  });
  const r = runGate(dir, ['--issue', 'x-1'], { stubDir: stub, env: { BEADS_ACTOR: 'mgr-me' } });
  assert.equal(r.code, 1);
  assert.match(r.out, /NG {2}issue\(x-1\)の子に open \/ in_progress が残っている: x-1\.2/);
  assert.match(r.out, /NG {2}自 actor\(mgr-me\)の in_progress 残置: x-9/);
  assert.ok(!r.out.includes('x-8'), '他 actor の占有は自分の残置に数えない');

  const cleanStub = makeBdStub({
    children: '[{"id":"x-1.1","status":"closed"}]',
    inprog: '[{"id":"x-1","assignee":"mgr-me"}]',
  });
  const okRun = runGate(dir, ['--issue', 'x-1'], { stubDir: cleanStub, env: { BEADS_ACTOR: 'mgr-me' } });
  assert.equal(okRun.code, 0, '対象 issue 自身の占有は残置に数えない');
  assert.match(okRun.out, /gate: ok/);
});
