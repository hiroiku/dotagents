// agents-reap(git 在庫の分類と回収)の契約を固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const REAP = path.join(REPO, 'payload', 'bin', 'agents-reap');

// develop を統合ブランチとする repo。x-merged(取り込み済み)、x-unmerged(未取り込み)、
// x-live(未取り込み)の 3 branch と、それぞれの worktree を持つ。
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-reap-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'develop');
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');

  const branch = (name, file) => {
    git('checkout', '-q', '-b', name);
    fs.writeFileSync(path.join(dir, file), `${name}\n`);
    git('add', '.');
    git('commit', '-q', '-m', name);
    git('checkout', '-q', 'develop');
  };
  branch('actor/x-merged', 'merged.txt');
  git('merge', '-q', '--no-ff', 'actor/x-merged');
  branch('actor/x-unmerged', 'unmerged.txt');
  branch('actor/x-live', 'live.txt');

  const wt = (name, branchName) => {
    const p = path.join(dir, '.worktrees', name);
    git('worktree', 'add', '-q', p, branchName);
    return p;
  };
  return { dir, git, wt };
}

// bd stub: id ごとの status を JSON で返す(show <id> --json だけを解釈する)
function makeBdStub(statuses) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-reapstub-'));
  const lines = Object.entries(statuses)
    .map(([id, st]) => `  "show ${id} --json") echo '[{"id":"${id}","status":"${st}"}]' ;;`)
    .join('\n');
  fs.writeFileSync(path.join(dir, 'bd'), `#!/bin/sh
case "$*" in
${lines}
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  return dir;
}

function runReap(cwd, args, { stubDir } = {}) {
  const PATH = `${stubDir ? stubDir + path.delimiter : ''}/usr/bin:/bin`;
  try {
    return { code: 0, out: execFileSync(REAP, args, { cwd, env: { PATH, HOME: os.homedir() }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const withBeads = (dir) => {
  fs.mkdirSync(path.join(dir, '.beads'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.beads', 'issues.jsonl'), '{"id":"x-merged"}\n');
};

test('reap: 取り込み済み+closed は回収可、closed 未取り込みは reap-closed、生きている issue は keep', () => {
  const { dir, wt } = makeRepo();
  withBeads(dir);
  wt('x-merged', 'actor/x-merged');
  wt('x-unmerged', 'actor/x-unmerged');
  wt('x-live', 'actor/x-live');
  const stub = makeBdStub({ 'x-merged': 'closed', 'x-unmerged': 'closed', 'x-live': 'in_progress' });

  const r = runReap(dir, [], { stubDir: stub });
  assert.equal(r.code, 0);
  assert.match(r.out, /reap {9}worktree .*x-merged \+ branch actor\/x-merged {2}develop へ取り込み済み/);
  assert.match(r.out, /reap-closed {2}worktree .*x-unmerged \+ branch actor\/x-unmerged {2}issue は closed/);
  assert.match(r.out, /keep {9}worktree .*x-live {2}issue が生きている\(x-live: in_progress\)/);
  assert.match(r.out, /reap: keep 1 \/ 回収可 1 \/ closed 未取り込み 1 \/ 要確認 0/, 'worktree で数えた branch は重複して数えない');
  assert.match(r.out, /報告のみ/);
});

test('reap: --apply は reap だけを回収し、--apply-closed が reap-closed も回収する', () => {
  const { dir, git, wt } = makeRepo();
  withBeads(dir);
  wt('x-merged', 'actor/x-merged');
  wt('x-unmerged', 'actor/x-unmerged');
  const stub = makeBdStub({ 'x-merged': 'closed', 'x-unmerged': 'closed' });

  const first = runReap(dir, ['--apply'], { stubDir: stub });
  assert.equal(first.code, 0, first.out);
  const branches = () => git('branch', '--format=%(refname:short)').trim().split('\n');
  assert.ok(!branches().includes('actor/x-merged'), '取り込み済み branch は消える');
  assert.ok(branches().includes('actor/x-unmerged'), 'closed 未取り込みは --apply では残る');
  assert.ok(!fs.existsSync(path.join(dir, '.worktrees', 'x-merged')));

  const second = runReap(dir, ['--apply', '--apply-closed'], { stubDir: stub });
  assert.equal(second.code, 0, second.out);
  assert.ok(!branches().includes('actor/x-unmerged'), '--apply-closed で回収される');
  assert.ok(!fs.existsSync(path.join(dir, '.worktrees', 'x-unmerged')));
  assert.ok(branches().includes('develop'), '統合ブランチには触れない');
});

test('reap: issue の終わった dirty worktree は surface で、--apply でも触れない', () => {
  const { dir, wt } = makeRepo();
  withBeads(dir);
  const p = wt('x-merged', 'actor/x-merged');
  fs.writeFileSync(path.join(p, 'wip.txt'), 'wip\n');
  const stub = makeBdStub({ 'x-merged': 'closed' });

  const r = runReap(dir, ['--apply', '--apply-closed'], { stubDir: stub });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /surface {6}worktree .*x-merged {2}issue は終わっている(.|\n)*未 commit の変更が残っている/);
  assert.ok(fs.existsSync(path.join(p, 'wip.txt')), 'surface は回収しない');
});

test('reap: 生きている issue の worktree は dirty でも keep(作業中の未 commit は正常)', () => {
  const { dir, wt } = makeRepo();
  withBeads(dir);
  const p = wt('x-live', 'actor/x-live');
  fs.writeFileSync(path.join(p, 'wip.txt'), 'wip\n');
  const stub = makeBdStub({ 'x-live': 'in_progress' });

  const r = runReap(dir, [], { stubDir: stub });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /keep {9}worktree .*x-live {2}issue が生きている\(x-live: in_progress\)/);
  assert.ok(!r.out.includes('surface      worktree'), 'dirty でも要確認に上げない');
});

test('reap: detached の補助 worktree は issue が生きていれば keep、閉じていれば回収する', () => {
  const { dir, git } = makeRepo();
  withBeads(dir);
  const head = git('rev-parse', 'HEAD').trim();
  git('worktree', 'add', '-q', '--detach', path.join(dir, '.worktrees', 'review-live'), head);
  git('worktree', 'add', '-q', '--detach', path.join(dir, '.worktrees', 'review-merged'), head);
  // prefix(x)との結合照合: review-live → x-live, review-merged → x-merged
  const stub = makeBdStub({ 'x-live': 'in_progress', 'x-merged': 'closed' });

  const r = runReap(dir, ['--apply'], { stubDir: stub });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /keep {9}worktree .*review-live/);
  assert.match(r.out, /reap {9}worktree .*review-merged {2}役目を終えた補助 worktree/);
  assert.ok(fs.existsSync(path.join(dir, '.worktrees', 'review-live')));
  assert.ok(!fs.existsSync(path.join(dir, '.worktrees', 'review-merged')));
});

test('reap: bd の照合が無い名前は、取り込み済みなら回収・未取り込みなら surface', () => {
  const { dir } = makeRepo();
  // .beads なし = bd 照合なし
  const r = runReap(dir, []);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /reap {9}branch actor\/x-merged {2}develop へ取り込み済み/);
  assert.match(r.out, /surface {6}branch actor\/x-unmerged {2}issue に紐づかず/);
  assert.match(r.out, /bd 不在のため issue 照合なし/);
});
