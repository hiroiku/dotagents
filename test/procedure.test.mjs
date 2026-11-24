import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONFIRMED, decide } from '../plugin/src/guard.mjs';

function project(declaration = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-procedure-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify(declaration));
  return dir;
}

// git と gh の答えを差し替える。branch は今いるブランチ、config は git config の値、pr は gh pr view の答え。
function tools({ branch = 'work/x', remoteHead = 'origin/main', upstream = null, config = {}, pr = null } = {}) {
  const asked = [];
  return {
    asked,
    git: (cwd, ...args) => {
      if (args[0] === 'symbolic-ref') return args.includes('HEAD') ? branch : remoteHead;
      if (args[0] === 'remote') return args[1] === 'get-url' ? 'https://github.com/o/r.git' : 'origin\nupstream';
      if (args[0] === 'config') return config[args[2]] ?? null;
      if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return upstream;
      return null;
    },
    gh: (cwd, ...args) => {
      asked.push(args.join(' '));
      return typeof pr === 'function' ? pr(args) : pr;
    },
  };
}

const run = (command, { role = 'lead', declaration = {}, ...rest } = {}) => decide({ tool: 'shell', command, cwd: project(declaration), role, canAsk: true }, tools(rest));
const kind = (command, options) => run(command, options)?.kind ?? null;

test('作業ブランチの上で、共有のブランチを merge する追従を止め、rebase を案内する', () => {
  const stopped = run('git merge origin/main');
  assert.equal(stopped.decision, 'deny');
  assert.equal(stopped.kind, 'follow');
  assert.match(stopped.reason, /git rebase origin\/main/);
  for (const command of ['git merge main', 'git -C sub merge --no-edit origin/main', 'rtk git merge upstream/main', 'git fetch && git merge -m "x" origin/main']) assert.equal(kind(command), 'follow', command);
  assert.equal(kind('git merge', { upstream: 'origin/main' }), 'follow');
  assert.equal(kind('git merge @{u}', { upstream: 'origin/main' }), 'follow');
  // 流が決める共有のブランチも、宣言の protected も見る。
  assert.equal(kind('git merge origin/release/drive-web/v1.73', { declaration: { style: { git: 'release-branches' } } }), 'follow');
  assert.equal(kind('git merge origin/staging', { declaration: { protected: ['staging'] } }), 'follow');
  for (const command of ['git merge work/y', 'git merge --abort', 'git merge --continue', 'git merge --ff-only origin/main', 'git merge origin/develop', 'git rebase origin/main']) assert.equal(kind(command), null, command);
});

test('共有のブランチの上で、作業ブランチを取り込む merge は止めない', () => {
  assert.equal(kind('git merge --no-ff work/x', { branch: 'main' }), null);
  assert.equal(kind('git merge origin/main', { branch: 'main' }), null);
  assert.equal(kind('git pull', { branch: 'main' }), null);
  assert.equal(kind('git merge work/x', { branch: 'release/drive-web/v1.73', declaration: { style: { git: 'release-branches' } } }), null);
  // 今いるブランチが分からない(HEAD が切り離されている)ときは通す。
  assert.equal(kind('git merge origin/main', { branch: null }), null);
});

test('rebase なしの git pull を止め、pull.rebase が設定されていれば通す', () => {
  assert.equal(kind('git pull'), 'follow');
  assert.equal(kind('git pull origin main'), 'follow');
  assert.equal(kind('git pull --no-rebase'), 'follow');
  assert.equal(kind('git pull --rebase=false'), 'follow');
  assert.match(run('git pull').reason, /git pull --rebase/);
  for (const command of ['git pull --rebase', 'git pull -r origin main', 'git pull --rebase=merges', 'git pull --ff-only']) assert.equal(kind(command), null, command);
  assert.equal(kind('git pull', { config: { 'pull.rebase': 'true' } }), null);
  assert.equal(kind('git pull', { config: { 'branch.work/x.rebase': 'merges' } }), null);
  assert.equal(kind('git pull', { config: { 'pull.ff': 'only' } }), null);
  assert.equal(kind('git pull --no-rebase', { config: { 'pull.rebase': 'true' } }), 'follow');
});

test('追従の merge と PR の base は、利用者が求めたときに進める役だけが印を付けて通せる', () => {
  assert.match(run('git merge origin/main').reason, new RegExp(`${CONFIRMED}=1`));
  assert.equal(kind(`${CONFIRMED}=1 git merge origin/main`), null);
  assert.equal(kind(`${CONFIRMED}=1 git merge origin/main`, { role: 'builder' }), 'follow');
  assert.doesNotMatch(run('git merge origin/main', { role: 'builder' }).reason, new RegExp(CONFIRMED));
  const declaration = { style: { git: 'trunk' } };
  assert.equal(kind(`${CONFIRMED}=1 gh pr create --base develop`, { declaration }), null);
});

test('git の流を選んだプロジェクトでは、PR の base が既定のブランチでなければ止め、流が共有する base は通す', () => {
  const trunk = { style: { git: 'trunk' } };
  const stopped = run('gh pr create --draft --base develop', { declaration: trunk });
  assert.equal(stopped.kind, 'base');
  assert.match(stopped.reason, /trunk.*base は main/);
  assert.equal(kind('gh pr create --base main', { declaration: trunk }), null);
  assert.equal(kind('gh pr create --fill', { declaration: trunk }), null);
  assert.equal(kind('gh pr create -Bmain', { declaration: trunk }), null);
  assert.equal(kind('gh pr create --base release/v1', { declaration: trunk }), 'base');
  const release = { style: { git: 'release-branches' } };
  assert.equal(kind('gh pr create --base release/drive-web/v1.73', { declaration: release }), null);
  assert.equal(kind('gh pr create --base release/v1 --head work/fix', { declaration: release }), null);
  assert.equal(kind('gh pr create', { declaration: release }), null);
  assert.equal(kind('gh pr create --base=develop', { declaration: release }), 'base');
  assert.match(run('gh pr create --base develop', { declaration: release }).reason, /release-branches.*base は main.*release\/\*/);
  // git の流を選んでいなければ、base は見ない。別のリポジトリーへの PR も見ない。
  assert.equal(kind('gh pr create --base anything'), null);
  assert.equal(kind('gh pr create --base anything', { declaration: { style: { git: 'develop-master' } } }), null);
  assert.equal(kind('gh pr create --base x -R other/repo', { declaration: trunk }), null);
});

const rollup = (status, extra = {}) => ({ number: 12, state: 'OPEN', statusCheckRollup: [{ __typename: 'CheckRun', name: 'node', workflowName: 'test', status, detailsUrl: 'https://github.com/o/r/actions/runs/777/job/1', ...extra }] });

test('push するブランチの PR で workflow が走っている間は、push を止め、待つか止めるかを案内する', () => {
  const stopped = run('git push origin work/x', { pr: JSON.stringify(rollup('IN_PROGRESS')) });
  assert.equal(stopped.decision, 'deny');
  assert.equal(stopped.kind, 'ci');
  assert.match(stopped.reason, /PR #12/);
  assert.match(stopped.reason, /gh run cancel 777/);
  assert.equal(kind('git push', { pr: JSON.stringify(rollup('QUEUED')), upstream: 'origin/work/x' }), 'ci');
  assert.equal(kind('git push -u origin HEAD', { pr: JSON.stringify(rollup('QUEUED')) }), 'ci');
  // 利用者に確かめる操作ではないので、了承の印でも通さない。
  assert.equal(kind(`${CONFIRMED}=1 git push origin work/x`, { pr: JSON.stringify(rollup('IN_PROGRESS')) }), 'ci');
  assert.equal(kind('git push origin work/x', { role: 'builder', pr: JSON.stringify(rollup('IN_PROGRESS')) }), 'ci');
});

test('workflow が終わっている、PR が無い、gh の答えが読めないときは、push を止めない', () => {
  for (const pr of [JSON.stringify(rollup('COMPLETED')), JSON.stringify({ ...rollup('IN_PROGRESS'), state: 'MERGED' }), JSON.stringify({ number: 1, state: 'OPEN', statusCheckRollup: [{ __typename: 'StatusContext', context: 'ci/x', state: 'PENDING' }] }), null, 'not json', '{}']) {
    assert.equal(kind('git push origin work/x', { pr }), null, String(pr));
  }
  const running = JSON.stringify(rollup('IN_PROGRESS'));
  for (const command of ['git push --dry-run origin work/x', 'git push origin v1.2.3', 'git push origin --delete work/x', 'git push origin :work/x']) assert.notEqual(kind(command, { pr: running }), 'ci', command);
  // 尋ねるのは push するブランチの PR だけである。
  const probe = tools({ pr: null });
  decide({ tool: 'shell', command: 'git push origin work/x', cwd: project(), role: 'lead', canAsk: true }, probe);
  assert.deepEqual(probe.asked, ['pr view work/x --json number,state,statusCheckRollup']);
});
