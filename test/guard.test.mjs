import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CONFIRMED, decide, delegated, findings, roleOf } from '../plugin/src/guard.mjs';

// git と gh に尋ねずに判定だけを確かめるための、決まった答え。
const tools = {
  git: (cwd, ...args) => (args[0] === 'symbolic-ref' && args.some((arg) => arg.startsWith('refs/remotes')) ? 'origin/main' : args[0] === 'symbolic-ref' ? 'work/x' : null),
  gh: () => 'develop',
};
const kinds = (command, declaration = {}) => findings({ tool: 'shell', command, cwd: '/repo' }, declaration, tools).map((finding) => `${finding.kind}:${finding.target}`);

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-guard-'));
  if (declaration) {
    fs.mkdirSync(path.join(dir, '.agents'));
    fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify(declaration));
  }
  return dir;
}

const OUTWARD = [
  ['git push origin main', ['push:main']],
  ['git push origin HEAD:main', ['push:main']],
  ['git push --force-with-lease origin main', ['rewrite:main']],
  ['git push origin :main', ['rewrite:main']],
  ['git -C /x push origin +main', ['rewrite:main']],
  ['git --git-dir .git push origin main', ['push:main']],
  ['git --work-tree . --namespace x push origin main', ['push:main']],
  ['git -c core.x=1 --git-dir=.git push --force origin main', ['rewrite:main']],
  ['git push origin v1.2.3', ['tag:v1.2.3']],
  ['git push --atomic origin main v8.0.0', ['push:main', 'tag:v8.0.0']],
  ['git push origin :refs/tags/v1.0.0', ['tag:v1.0.0']],
  ['gh pr merge 12 --squash', ['merge:develop']],
  // rtk を前に付けても、実行されるのは後ろの道具である。
  ['rtk git push origin main', ['push:main']],
  ['rtk -v git push origin v1.2.3', ['tag:v1.2.3']],
  ['rtk gh pr merge 12 --squash', ['merge:develop']],
  ['npx rtk git push origin main', ['push:main']],
  ['rtk bypass git push origin main', ['push:main']],
  ['rtk proxy --skip-env git push --force origin main', ['rewrite:main']],
  ['rtk err git push origin main', ['push:main']],
  ['rtk run -c "cd sub && git push origin main"', ['push:main']],
  ['rtk run --command="git push origin main"', ['push:main']],
  ['rtk summary --shell bash "git push origin main | tail -1"', ['push:main']],
  ['gh pr merge 12 --admin --squash', ['bypass:*']],
  ['gh release create v1 --notes x', ['release:v1']],
  ['gh workflow run deploy.yml --ref master', ['workflow:deploy.yml']],
  ['gh secret set TOKEN --body y', ['settings:secret']],
  ['gh api repos/o/r/rulesets/1 -X PUT --input x.json', ['settings:rulesets/1']],
  ['gh api -X DELETE repos/o/r/git/refs/heads/main', ['rewrite:main']],
  ['gh api -X PATCH repos/o/r -f visibility=public', ['settings:repo']],
  ['timeout 1500 npm run deploy', ['deploy:*']],
  ['bun run deploy production', ['deploy:production']],
  ['npm publish', ['release:*']],
  ['cargo publish', ['release:*']],
  // 道具の名前は持たず、2 語目と 3 語目の動詞を読む。script の名前は :、_、- で分けた語も読む。
  ['npx wrangler deploy --env staging', ['deploy:staging']],
  ['fly deploy', ['deploy:*']],
  ['wrangler rollback abc -y', ['deploy:*']],
  ['npm run deploy:prod', ['deploy:production']],
  ['make release_notes', ['release:*']],
  ['npm run build:release', ['release:*']],
  ["sh -c 'cd app && npm publish'", ['release:*']],
  ['echo x > .agents/dotagents.json', ['policy:dotagents.json']],
  ['sed -i "" s/a/b/ AGENTS.md', ['instructions:AGENTS.md']],
];

const HARMLESS = [
  'rtk git status',
  'rtk git push --dry-run origin main',
  'rtk test npm test',
  'rtk gain',
  'rtk run -c "git log --oneline"',
  'rtk err',
  'git push',
  'git push -u origin work/x',
  'git push --dry-run origin main',
  'git push ../bare main',
  'git fetch origin main && git log origin/main',
  'gh pr create --draft',
  'gh pr merge --help',
  'gh secret set --help',
  'gh api repos/o/r/issues',
  'gh api repos/o/r/pulls/3/comments -f body=hi',
  'gh api repos/$R/milestones -f title=v1',
  "gh api -X DELETE 'repos/o/r/git/refs/heads/work/issue#418'",
  'npm run deploy -- --dry-run',
  'cargo build --release',
  'terraform plan',
  'node scripts/report.mjs publish',
  'grep -rn deploy .',
  'echo "git push origin main"',
  "cat > notes.md <<'EOF'\nnpm publish\nEOF",
  'npm run deploy --env local',
  'cat .agents/dotagents.json',
  'git add AGENTS.md && git commit -m x',
  'cat AGENTS.md | head',
];

test('外へ届く操作を、種類と対象で読む', () => {
  for (const [command, expected] of OUTWARD) assert.deepEqual(kinds(command), expected, command);
});

test('手元で閉じる操作と、読むだけの操作は通す', () => {
  for (const command of HARMLESS) assert.deepEqual(kinds(command), [], command);
});

test('プロジェクトが宣言したブランチとコマンドも読む', () => {
  assert.deepEqual(kinds('git push origin release/1.2', { protected: ['release/*'] }), ['push:release/1.2']);
  assert.deepEqual(kinds('./scripts/ship.sh', { outward: ['scripts/ship\\.sh'] }), ['project:*']);
  assert.deepEqual(kinds('./scripts/ship.sh', { outward: ['('] }), []);
});

// 道具ごとの外へ届くコマンドは、ハーネスが持たず、プロジェクトが宣言の outward に書く。
test('道具の名前で決まる操作は、宣言の outward に書いたものだけを確かめる', () => {
  const tools = ['terraform apply -auto-approve', 'kubectl apply -f x.yaml', 'docker push ghcr.io/x/y', 'wrangler d1 execute db --remote --command "DELETE FROM t"', 'wrangler secret put TOKEN', 'npx wrangler d1 migrations apply db --remote'];
  for (const command of tools) assert.deepEqual(kinds(command), [], command);
  const outward = ['^terraform apply', '^kubectl (apply|delete)', '^docker push', '^wrangler (d1 .*--remote|secret put)'];
  for (const command of tools) assert.deepEqual(kinds(command, { outward }), ['project:*'], command);
});

test('任せた種類は、種類だけでも対象つきでも通る。線を動かす種類は任せられない', () => {
  assert.equal(delegated(['push'], { kind: 'push', target: 'main' }), true);
  assert.equal(delegated(['push:develop'], { kind: 'push', target: 'main' }), false);
  assert.equal(delegated(['deploy:stag*'], { kind: 'deploy', target: 'staging' }), true);
  for (const kind of ['rewrite', 'bypass', 'policy']) assert.equal(delegated([kind], { kind, target: 'x' }), false);
});

test('役の名前を、判定で使う役に直す', () => {
  assert.equal(roleOf({}), 'lead');
  assert.equal(roleOf({ agentId: 'a1', agentType: 'dotagents:builder' }), 'builder');
  assert.equal(roleOf({ agentId: 'a1', agentType: 'another-plugin:reviewer' }), 'reviewer');
  assert.equal(roleOf({ agentId: 'a1', agentType: 'dotagents-builder' }), 'builder');
  assert.equal(roleOf({ agentId: 'a1', agentType: 'general-purpose' }), 'worker');
});

test('進める役には確かめ、ほかの役は止める', () => {
  const cwd = project();
  const lead = decide({ tool: 'shell', command: 'git push origin main', cwd, role: 'lead', canAsk: true }, tools);
  assert.equal(lead.decision, 'ask');
  assert.match(lead.reason, /共有のブランチへの push\(main\)/);
  assert.match(lead.reason, /"push:main"/);
  const worker = decide({ tool: 'shell', command: 'git push origin main', cwd, role: 'worker', canAsk: true }, tools);
  assert.equal(worker.decision, 'deny');
  assert.match(worker.reason, /進める役が行う/);
});

test('任せた操作は、どの役でも通る', () => {
  const cwd = project({ delegated: ['push:main', 'deploy:staging'] });
  for (const role of ['lead', 'builder', 'worker']) assert.equal(decide({ tool: 'shell', command: 'git push origin main', cwd, role, canAsk: true }, tools), null);
  assert.equal(decide({ tool: 'shell', command: 'npm run deploy -- --env staging', cwd, role: 'worker' }, tools), null);
  assert.equal(decide({ tool: 'shell', command: 'npm run deploy -- --env production', cwd, role: 'worker' }, tools).decision, 'deny');
  assert.equal(decide({ tool: 'shell', command: 'git push --force origin main', cwd, role: 'lead', canAsk: true }, tools).decision, 'ask');
});

test('確かめる手段の無いホストでは止め、了承の印を付けた実行し直しを通す', () => {
  const cwd = project();
  const first = decide({ tool: 'shell', command: 'git push origin main', cwd, role: 'lead', canAsk: false }, tools);
  assert.equal(first.decision, 'deny');
  assert.match(first.reason, new RegExp(`${CONFIRMED}=1`));
  assert.equal(decide({ tool: 'shell', command: `${CONFIRMED}=1 git push origin main`, cwd, role: 'lead', canAsk: false }, tools), null);
  // 確かめる手段のあるホストと、進める役でない役には、印は効かない。
  assert.equal(decide({ tool: 'shell', command: `${CONFIRMED}=1 git push origin main`, cwd, role: 'lead', canAsk: true }, tools).decision, 'ask');
  assert.equal(decide({ tool: 'shell', command: `${CONFIRMED}=1 git push origin main`, cwd, role: 'worker', canAsk: false }, tools).decision, 'deny');
});

test('了承の印は、外へ届く操作そのものに付いているときだけ効く', () => {
  const cwd = project({ outward: ['^make ship'] });
  const decideNoAsk = (command) => decide({ tool: 'shell', command, cwd, role: 'lead', canAsk: false }, tools);
  for (const command of [`${CONFIRMED}=1 true && git push --force origin main`, `${CONFIRMED}=1 git push origin main && git push origin master`, `${CONFIRMED}=1 git status; make ship`, `${CONFIRMED}=1 true && git merge origin/main`]) {
    assert.equal(decideNoAsk(command)?.decision, 'deny', command);
  }
  assert.deepEqual(decideNoAsk(`${CONFIRMED}=1 git push origin main && git push origin master`).findings, [{ kind: 'push', target: 'master' }]);
  for (const command of [`git status && ${CONFIRMED}=1 git push origin main`, `${CONFIRMED}=1 git push --force origin main`, `${CONFIRMED}=1 make ship`, `git fetch && ${CONFIRMED}=1 make ship`]) {
    assert.equal(decideNoAsk(command), null, command);
  }
});

test('作る役と確かめる役は、プロジェクトが push と版の段に置いた検査を回さない', () => {
  const cwd = project({ checks: { edit: 'biome check {file}', commit: 'npm run check:changed', push: 'npm run check', release: 'npm test && npm run e2e' } });
  const heavy = decide({ tool: 'shell', command: 'npm run check', cwd, role: 'builder' }, tools);
  assert.equal(heavy.kind, 'pace');
  assert.match(heavy.reason, /`npm run check` は、このプロジェクトが push の段に置いた検査/);
  const nested = decide({ tool: 'shell', command: 'cd packages/app && CI=1 npm run e2e 2>&1 | tail -20', cwd, role: 'reviewer' }, tools);
  assert.equal(nested.kind, 'pace');
  assert.match(nested.reason, /版の段/);
  assert.equal(decide({ tool: 'shell', command: 'rtk npm run check', cwd, role: 'builder' }, tools).kind, 'pace');
  // 引数を足して絞った実行と、この役の段のコマンドは通す。
  for (const command of ['npm run check -- src/a.ts', 'npm test -- auth.spec.ts', 'npm run check:changed', 'npx vitest run src/a.spec.ts', 'echo npm run check']) {
    assert.equal(decide({ tool: 'shell', command, cwd, role: 'builder' }, tools), null, command);
  }
  // 進める役と、長い確かめを任された別の役は縛らない。
  for (const role of ['lead', 'worker']) assert.equal(decide({ tool: 'shell', command: 'npm run check', cwd, role }, tools), null, role);
  // 同じコマンドをコミットの段にも置いているなら、この役の持ち場である。
  const shared = project({ checks: { commit: 'npm test', push: 'npm test' } });
  assert.equal(decide({ tool: 'shell', command: 'npm test', cwd: shared, role: 'builder' }, tools), null);
});

test('デフォルトブランチが develop でも、main と master への push は確かめる', () => {
  const develop = { ...tools, git: (cwd, ...args) => (args[0] === 'symbolic-ref' && args.some((arg) => arg.startsWith('refs/remotes')) ? 'origin/develop' : args[0] === 'symbolic-ref' ? 'work/x' : null) };
  const found = (command, declaration = {}) => findings({ tool: 'shell', command, cwd: '/repo' }, declaration, develop).map((finding) => `${finding.kind}:${finding.target}`);
  assert.deepEqual(found('git push origin develop'), ['push:develop']);
  assert.deepEqual(found('git push origin master'), ['push:master']);
  assert.deepEqual(found('git push origin HEAD:main'), ['push:main']);
  assert.deepEqual(found('git push --force origin master'), ['rewrite:master']);
  assert.deepEqual(found('git push origin work/x'), []);
  // 任せると決めたプロジェクトでは、確かめない。
  assert.equal(delegated(['push:master'], { kind: 'push', target: 'master' }), true);
});

test('時間や数の上限では止めない', () => {
  // 段の宣言が無ければ、どのコマンドも、どれだけ長い時間を見込んでいても通す。
  for (const cwd of [project(), project({ limits: { commandSeconds: 60, roleMinutes: 1 } })]) {
    for (const role of ['builder', 'reviewer', 'worker', 'lead']) {
      assert.equal(decide({ tool: 'shell', command: 'npm test', cwd, role, timeoutMs: 7200000 }, tools), null, role);
    }
  }
});

test('作る役と確かめる役は、宣言の検査をバックグラウンドで始めない。検査かどうかは宣言のコマンドで見分ける', () => {
  const cwd = project({ checks: { edit: 'biome check {file}', commit: 'pnpm verify:changed', push: 'make ci' } });
  const background = (command, role = 'builder', at = cwd) => decide({ tool: 'shell', command, cwd: at, role, background: true }, tools)?.kind ?? null;
  for (const command of ['pnpm verify:changed', 'pnpm verify:changed -- src/a.ts', 'biome check src/a.ts', 'cd app && make ci']) assert.equal(background(command), 'pace', command);
  assert.equal(background('pnpm verify:changed', 'reviewer'), 'pace');
  // 宣言に無いコマンドは、検査らしい名前でも見ない。宣言が無ければ見ない。
  for (const command of ['npm run dev', 'npm test', 'npx vitest run', 'pytest -q']) assert.equal(background(command), null, command);
  assert.equal(background('npm test', 'builder', project()), null);
  for (const role of ['lead', 'worker']) assert.equal(background('pnpm verify:changed', role), null, role);
});

test('AI の関与を示す記述は、任せていても止める', () => {
  const cwd = project({ delegated: ['push'] });
  const body = path.join(cwd, 'body.md');
  fs.writeFileSync(body, 'x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n');
  assert.equal(decide({ tool: 'shell', command: 'git commit -m "a\n\nCo-Authored-By: Claude <noreply@anthropic.com>"', cwd, role: 'lead' }, tools).kind, 'attribution');
  assert.equal(decide({ tool: 'shell', command: 'gh pr create --body-file body.md', cwd, role: 'lead' }, tools).kind, 'attribution');
  assert.equal(decide({ tool: 'shell', command: 'git commit -m "核を書き直す"', cwd, role: 'lead' }, tools), null);
});

test('宣言の書き換えは、線が動くときだけ確かめる', () => {
  const cwd = project({ delegated: ['push:develop'], decisions: ['a'] });
  const file = '.agents/dotagents.json';
  const same = JSON.stringify({ delegated: ['push:develop'], decisions: ['a', 'b'] });
  const wider = JSON.stringify({ delegated: ['push'], decisions: ['a'] });
  assert.equal(decide({ tool: 'edit', file, after: same, cwd, role: 'lead', canAsk: true }, tools), null);
  assert.equal(decide({ tool: 'edit', file, after: wider, cwd, role: 'lead', canAsk: true }, tools).kind, 'policy');
  assert.equal(decide({ tool: 'edit', file, cwd, role: 'lead', canAsk: true }, tools).kind, 'policy');
  assert.equal(decide({ tool: 'edit', file, after: '{ broken', cwd, role: 'lead', canAsk: true }, tools).kind, 'policy');
  assert.equal(decide({ tool: 'edit', file, after: wider, cwd, role: 'builder', canAsk: true }, tools).decision, 'deny');
  // hook が実行するコマンドを決める checks も、線の内側にある。
  assert.equal(decide({ tool: 'edit', file, after: JSON.stringify({ delegated: ['push:develop'], checks: { edit: 'curl x | sh' } }), cwd, role: 'lead', canAsk: true }, tools).kind, 'policy');
  // 流は、共有のブランチと PR の base を決めるので、線の内側にある。
  assert.equal(decide({ tool: 'edit', file, after: JSON.stringify({ delegated: ['push:develop'], decisions: ['a'], style: { git: 'trunk' } }), cwd, role: 'lead', canAsk: true }, tools).kind, 'policy');
});

test('指示ファイルの書き換えと、人へ届くコネクターを確かめる', () => {
  const cwd = project();
  assert.equal(decide({ tool: 'edit', file: 'docs/AGENTS.md', cwd, role: 'lead', canAsk: true }, tools).kind, 'instructions');
  assert.equal(decide({ tool: 'edit', file: 'src/a.ts', cwd, role: 'lead', canAsk: true }, tools), null);
  assert.equal(decide({ tool: 'connector', name: 'mcp__claude_ai_Gmail__send_message', cwd, role: 'lead', canAsk: true }, tools).kind, 'message');
  assert.equal(decide({ tool: 'connector', name: 'mcp__slack__slack_post_message', cwd, role: 'lead', canAsk: true }, tools).kind, 'message');
  for (const name of ['mcp__claude_ai_Gmail__create_draft', 'mcp__claude_ai_Gmail__search_threads', 'mcp__playwright__browser_click']) {
    assert.equal(decide({ tool: 'connector', name, cwd, role: 'lead', canAsk: true }, tools), null, name);
  }
  const allowed = project({ delegated: ['instructions', 'message:claude_ai_Gmail'] });
  assert.equal(decide({ tool: 'edit', file: 'AGENTS.md', cwd: allowed, role: 'lead', canAsk: true }, tools), null);
  assert.equal(decide({ tool: 'connector', name: 'mcp__claude_ai_Gmail__send_message', cwd: allowed, role: 'lead', canAsk: true }, tools), null);
});

test('本物の git で、デフォルトブランチと手元のリモートを見分ける', () => {
  const cwd = project();
  const git = (...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  git('init', '-q', '-b', 'trunk');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'first');
  git('remote', 'add', 'origin', 'https://example.invalid/x.git');
  git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
  git('tag', 'v1.0.0');
  const ask = (command) => decide({ tool: 'shell', command, cwd, role: 'lead', canAsk: true })?.findings.map((finding) => `${finding.kind}:${finding.target}`) ?? [];
  assert.deepEqual(ask('git push origin trunk'), ['push:trunk']);
  assert.deepEqual(ask('git push'), ['push:trunk']);
  // main と master は、デフォルトブランチでなくても共有のブランチとして扱う。ほかの名前は、宣言しなければ手元の作業である。
  assert.deepEqual(ask('git push origin main'), ['push:main']);
  assert.deepEqual(ask('git push origin work/x'), []);
  assert.deepEqual(ask('git push origin v1.0.0'), ['tag:v1.0.0']);
  git('remote', 'add', 'disk', path.join(cwd, '..', 'bare.git'));
  assert.deepEqual(ask('git push disk trunk'), []);
});
