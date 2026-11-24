import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONFIRMED, command, DEADLINE_MS, decide } from '../plugin/src/guard.mjs';

const command_ = (file) => command(file, Date.now() + DEADLINE_MS);

function project(declaration = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-procedure-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify(declaration));
  return dir;
}

// git が値を真偽として読むときの答え。読めない値は、git と同じく答えない。
const asBool = (value) => (/^(?:true|yes|on|1)$/i.test(value) ? 'true' : /^(?:false|no|off|0)$/i.test(value) ? 'false' : null);

// git と gh の答えを差し替える。branch は今いるブランチ、remoteHead は手元に残っている origin/HEAD、config は git config の値。
// repo は GitHub が答えるリポジトリーと既定のブランチ、prs は push するブランチごとの開いている PR。
function tools({ branch = 'work/x', remoteHead = 'origin/main', upstream = null, config = {}, repo = { nameWithOwner: 'o/r', defaultBranchRef: { name: 'main' } }, prs = {} } = {}) {
  const asked = [];
  return {
    asked,
    git: (cwd, ...all) => {
      // 大域の指定は外して読む。-c の値は、git config の答えに重ねる。
      const args = [...all];
      const given = {};
      while (args[0]?.startsWith('-')) {
        const word = args.shift();
        if (word === '-c') {
          const [key, ...value] = args.shift().split('=');
          given[key] = value.join('=');
        } else if (['--git-dir', '--work-tree', '--namespace'].includes(word)) args.shift();
      }
      if (args[0] === 'symbolic-ref') return args.includes('HEAD') ? branch : remoteHead;
      if (args[0] === 'remote') return args[1] === 'get-url' ? 'https://github.com/o/r.git' : 'origin\nupstream';
      if (args[0] === 'config') {
        const value = { ...config, ...given }[args.at(-1)];
        if (value === undefined) return null;
        return args.includes('--type=bool') ? asBool(value) : value;
      }
      if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) return upstream;
      return null;
    },
    gh: (cwd, ...args) => {
      asked.push(args.slice(0, 2).join(' '));
      if (args[0] === 'repo' && args[1] === 'view') return repo === null ? null : JSON.stringify(repo);
      if (args[0] === 'api' && args[1] === 'graphql') {
        if (prs === null) return null;
        const branches = args.flatMap((arg, index) => (args[index - 1] === '-f' && /^b\d+=/.test(arg) ? [arg.split('=')] : []));
        return JSON.stringify({ data: { repository: Object.fromEntries(branches.map(([alias, ...name]) => [alias, { nodes: prs[name.join('=')] ? [prs[name.join('=')]] : [] }])) } });
      }
      return null;
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

// GitHub が答える PR の形。workflow の実行ごとに、状態と番号を持つ。
test('PR の base は、手元に残った origin/HEAD ではなく、GitHub の既定のブランチと比べ、答えが無ければ通す', () => {
  const trunk = { style: { git: 'trunk' } };
  // 既定のブランチを master から main に変えたあと、手元の origin/HEAD は master のまま残る。
  const stale = { declaration: trunk, remoteHead: 'origin/master' };
  assert.equal(kind('gh pr create --base master', stale), 'base');
  assert.match(run('gh pr create --base master', stale).reason, /base は main/);
  assert.equal(kind('gh pr create --base main', stale), null);
  assert.equal(kind('gh pr create --base develop', { declaration: trunk, repo: null }), null);
  assert.equal(kind('gh pr create --base develop', { declaration: trunk, repo: { nameWithOwner: 'o/r', defaultBranchRef: null } }), null);
  // GitHub へ尋ねるのは、PR を作る操作のときだけである。
  for (const command of ['git merge work/y', 'git status', 'gh pr view 1', 'gh pr list --base master']) {
    const probe = tools();
    decide({ tool: 'shell', command, cwd: project(trunk), role: 'lead', canAsk: true }, probe);
    assert.ok(!probe.asked.includes('repo view'), command);
  }
});

test('PR を作るリポジトリーを -R でも GH_REPO でも同じに読み、このプロジェクトのリポジトリーなら base を見る', () => {
  const declaration = { style: { git: 'trunk' } };
  for (const command of ['gh pr create --base develop -R o/r', 'gh pr create --repo=github.com/O/R --base develop', 'GH_REPO=o/r gh pr create --base develop', 'gh pr -R o/r create --base develop']) assert.equal(kind(command, { declaration }), 'base', command);
  for (const command of ['gh pr create --base develop -R other/repo', 'GH_REPO=other/repo gh pr create --base develop', 'GH_REPO=https://github.com/other/repo gh pr create --base develop']) assert.equal(kind(command, { declaration }), null, command);
});

test('値を取る git の大域の指定があっても、追従の merge を読む', () => {
  for (const command of ['git --git-dir .git merge main', 'git --git-dir=.git merge main', 'git --work-tree . merge main', 'git --namespace x merge main', 'git --no-pager -C . merge origin/main', 'git -c core.x=1 --git-dir .git merge origin/main']) assert.equal(kind(command), 'follow', command);
  // リモートの名前と origin/HEAD は、リモートの既定のブランチを指す。
  for (const command of ['git merge origin/HEAD', 'git merge origin', 'git merge refs/remotes/origin/HEAD', 'git merge upstream']) assert.equal(kind(command), 'follow', command);
  assert.equal(kind('git --git-dir .git merge work/y'), null);
});

test('rebase で追従する設定と指定は、git が読むとおりに読む', () => {
  for (const value of ['yes', 'on', '1', 'True', 'merges', 'interactive']) assert.equal(kind('git pull', { config: { 'pull.rebase': value } }), null, value);
  for (const value of ['false', 'no', 'off', '0']) assert.equal(kind('git pull', { config: { 'pull.rebase': value } }), 'follow', value);
  assert.equal(kind('git pull', { config: { 'branch.work/x.rebase': 'false', 'pull.rebase': 'true' } }), 'follow');
  assert.equal(kind('git -c pull.rebase=true pull'), null);
  assert.equal(kind('git -c pull.rebase=yes pull origin main'), null);
  assert.equal(kind('git -c pull.ff=only pull'), null);
  for (const command of ['git pull -r --no-rebase', 'git pull --rebase=no', 'git pull --rebase=off', 'git pull --rebase=0']) assert.equal(kind(command), 'follow', command);
  for (const command of ['git pull --no-rebase -r', 'git pull --rebase=yes', 'git pull --rebase=i']) assert.equal(kind(command), null, command);
});

test('本物の git が真偽として読む pull.rebase の値と、-c で渡した値で、rebase の pull を通す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-pull-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'work/x');
  git('remote', 'add', 'origin', 'https://github.com/o/r.git');
  const real = (command) => decide({ tool: 'shell', command, cwd: dir, role: 'lead', canAsk: true }, { git: command_('git'), gh: () => null })?.kind ?? null;
  assert.equal(real('git pull'), 'follow');
  assert.equal(real('git -c pull.rebase=true pull'), null);
  for (const value of ['yes', 'On', '1', 'merges']) {
    git('config', 'pull.rebase', value);
    assert.equal(real('git pull'), null, value);
  }
  git('config', 'pull.rebase', 'off');
  assert.equal(real('git pull'), 'follow');
});

const pr = (...runs) => ({ number: 12, commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: runs } } } }] } });
const run_ = (status, id = 777, name = 'test') => ({ __typename: 'CheckRun', status, checkSuite: { workflowRun: { databaseId: id, workflow: { name } } } });

test('push するブランチの PR で workflow が走っている間は、push を止め、待つか止めるかを案内する', () => {
  const stopped = run('git push origin work/x', { prs: { 'work/x': pr(run_('IN_PROGRESS')) } });
  assert.equal(stopped.decision, 'deny');
  assert.equal(stopped.kind, 'ci');
  assert.match(stopped.reason, /PR #12/);
  assert.match(stopped.reason, /gh run cancel 777/);
  assert.equal(kind('git push', { prs: { 'work/x': pr(run_('QUEUED')) }, upstream: 'origin/work/x' }), 'ci');
  assert.equal(kind('git push -u origin HEAD', { prs: { 'work/x': pr(run_('QUEUED')) } }), 'ci');
  // 利用者に確かめる操作ではないので、了承の印でも通さない。
  assert.equal(kind(`${CONFIRMED}=1 git push origin work/x`, { prs: { 'work/x': pr(run_('IN_PROGRESS')) } }), 'ci');
  assert.equal(kind('git push origin work/x', { role: 'builder', prs: { 'work/x': pr(run_('IN_PROGRESS')) } }), 'ci');
});

test('workflow が終わっている、PR が無い、gh の答えが読めないときは、push を止めない', () => {
  for (const prs of [{ 'work/x': pr(run_('COMPLETED')) }, { 'work/x': pr({ __typename: 'StatusContext', context: 'ci/x', state: 'PENDING' }) }, { 'work/x': { number: 1, commits: { nodes: [{ commit: { statusCheckRollup: null } }] } } }, {}, null]) {
    assert.equal(kind('git push origin work/x', { prs }), null, JSON.stringify(prs));
  }
  const running = { 'work/x': pr(run_('IN_PROGRESS')) };
  for (const command of ['git push --dry-run origin work/x', 'git push origin v1.2.3', 'git push origin --delete work/x', 'git push origin :work/x']) assert.notEqual(kind(command, { prs: running }), 'ci', command);
});

test('push するブランチがいくつあっても、GitHub へは 1 回だけ尋ね、外へ届く操作が見つかれば尋ねない', () => {
  const probe = tools({ prs: { 'work/b': pr(run_('IN_PROGRESS', 778, 'e2e')) } });
  const stopped = decide({ tool: 'shell', command: 'git push origin work/a work/b', cwd: project(), role: 'lead', canAsk: true }, probe);
  assert.equal(stopped.kind, 'ci');
  assert.match(stopped.reason, /work\/b.*e2e.*gh run cancel 778/);
  assert.deepEqual(probe.asked, ['api graphql']);
  // 共有のブランチへの push は利用者に確かめるので、CI の状態は尋ねない。尋ねている間に hook の時間が切れると、確かめが届かない。
  const outward = tools({ prs: { 'work/b': pr(run_('IN_PROGRESS')) } });
  assert.equal(decide({ tool: 'shell', command: 'git push origin work/a work/b main', cwd: project(), role: 'lead', canAsk: true }, outward).decision, 'ask');
  assert.deepEqual(outward.asked, []);
});

test('git と gh への問い合わせは、締め切りを過ぎたら答えを待たずに通す', () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-slow-'));
  const slow = path.join(bin, 'gh');
  fs.writeFileSync(slow, '#!/bin/sh\nexec sleep 5\n', { mode: 0o755 });
  const started = Date.now();
  assert.equal(command(slow, started + 300)('.', 'pr', 'view'), null);
  assert.ok(Date.now() - started < 2000, `${Date.now() - started}ms`);
  // 締め切りを過ぎていれば、始めもしない。
  assert.equal(command(slow, started - 1)('.', 'pr', 'view'), null);
  // hook の上限より十分短くする。上限を過ぎると、外へ届く操作の確かめそのものが届かない。
  for (const host of ['claude', 'codex']) {
    const hooks = JSON.parse(fs.readFileSync(new URL(`../plugin/hosts/${host}/hooks.json`, import.meta.url), 'utf8'));
    const limit = hooks.hooks.PreToolUse.flatMap((entry) => entry.hooks).map((hook) => hook.timeout);
    for (const seconds of limit) assert.ok(DEADLINE_MS <= seconds * 1000 / 2, `${host}: ${seconds}s`);
  }
});
