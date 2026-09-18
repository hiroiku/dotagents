// gate module のゲート(PreToolUse / PostToolUse の hook)の契約を固定する。
// - ツールごとの規則を持たず、検査の語・対象の指定・実測の時間だけで、作業中の重い検査を止める
// - フォアグラウンドで待つだけのコマンドを止め、短い待ちや起動の確認は通す
// - 配備した位置から、Claude Code と Codex の両方の定義で起動できる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');
const GATE = path.join(REPO, 'modules', 'gate', 'hooks', 'verify-gate.mjs');
const { before, after, describe, findWait, createStore, FINAL, HEAVY_SECONDS } = await import(GATE);

delete process.env.DOTAGENTS_HOME;

// 記録を持つだけの store。実測の値を直接与えて、判定だけを確かめる。
function memoryStore(seconds = {}) {
  const started = [];
  return { scope: () => '.', seconds: (key) => seconds[key] ?? null, start: (id, key) => started.push({ id, key }), finish() {}, started };
}
const pre = (command, { store = memoryStore(), ...rest } = {}) =>
  before({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 't1', transcript_path: '/t.jsonl', cwd: '/', tool_input: { command }, ...rest }, store);

test('検査の語を含むコマンドを、どのエコシステムでも検査として読む', () => {
  for (const command of ['cargo test', 'pytest -x', 'make check', './gradlew test', 'bundle exec rspec', 'dotnet test',
    'mix test', 'swift test', 'bun run check', 'npx tsc --noEmit', 'mvn verify', 'ruff check .']) {
    assert.ok(describe(command), `検査として読むべき: ${command}`);
  }
  for (const command of ['ls -la', 'git checkout main', 'gh pr checks 12 --watch', 'npm install', 'docker build .', 'echo test',
    'docker build -t app:latest .', 'docker inspect web', 'pip install pytest', 'cargo install cargo-nextest', 'npm i -D vitest']) {
    assert.equal(describe(command), null, `検査ではない: ${command}`);
  }
});

test('対象を指定した検査を、絞った確認として読む', () => {
  for (const command of ['pytest tests/test_user.py::test_create', 'cargo test --package api user::create',
    'bunx vitest run --project app test/app/x.spec.ts', 'go test ./internal/user', 'bundle exec rspec spec/user_spec.rb:12',
    'cargo test login', 'cargo test --release login', 'pytest -k login', 'go test -run TestLogin ./...', 'mvn -Dtest=LoginTest test',
    'npm test -- login']) {
    assert.equal(describe(command).targeted, true, `絞った確認: ${command}`);
  }
  for (const command of ['cargo test', 'npx tsc -p tsconfig.json --noEmit', 'bunx vitest run --project app --config vitest.config.ts',
    'bun run test > /tmp/out.txt 2>&1', 'go test ./...', 'ruff check .', 'pytest -n auto', 'npx tsc --noEmit --pretty false',
    'npx eslint src/a.ts && npx tsc --noEmit']) {
    assert.equal(describe(command).targeted, false, `全体への実行: ${command}`);
  }
});

test('同じ検査は、場所の移動や出力の整形が違っても同じ鍵になる', () => {
  const key = describe('cargo test').key;
  assert.equal(describe('cd /repo/.worktrees/issue-1 && cargo test 2>&1 | tail -30').key, key);
  assert.equal(describe(`${FINAL} cargo test`).key, key);
  assert.equal(describe("bash -lc 'cargo test'").key, key);
  assert.equal(describe('cd crates/api && cargo test').cd, 'crates/api', '移動先は場所として別に返す');
  assert.equal(describe('cargo test > out.log 2>&1 &'), null, 'background で切り離した検査は待たないので読まない');
});

test('前回重かった検査を、作業中に対象を絞らず回すと止める', () => {
  const store = memoryStore({ 'make check': HEAVY_SECONDS + 10 });
  const denied = pre('make check', { store });
  assert.match(denied.reason, /make check/);
  assert.ok(denied.reason.includes(FINAL));
});

test('argv の配列で渡されたコマンドも、1 行のコマンドとして読む', () => {
  const store = memoryStore({ 'make check': 300 });
  const argv = (command) => pre('', { store, tool_input: { command } });
  assert.ok(argv(['bash', '-lc', 'make check']), 'シェルの -c の中身を読む');
  assert.ok(argv(['make', 'check']), '引数をつないで読む');
  assert.equal(argv(['rg', 'sleep 45']), null, '引数の中の語をコマンドとして読まない');
});

test('初めての検査、軽かった検査、仕上げの宣言、絞った確認は通す', () => {
  assert.equal(pre('make check'), null, '初めて見る検査は通して測る');
  assert.equal(pre('make check', { store: memoryStore({ 'make check': HEAVY_SECONDS - 1 }) }), null);
  assert.equal(pre(`${FINAL} make check`, { store: memoryStore({ 'make check': 300 }) }), null);
  assert.equal(pre('pytest tests/test_user.py', { store: memoryStore({ 'pytest tests/test_user.py': 300 }) }), null);
});

test('フォアグラウンドで通した検査だけ、終わりの時間を測れるよう開始を記録する', () => {
  const store = memoryStore();
  pre('cargo test', { store });
  pre('ls', { store });
  pre('cargo test', { store, tool_input: { command: 'cargo test', run_in_background: true } });
  assert.deepEqual(store.started.map((s) => s.key), ['cargo test']);
});

test('フォアグラウンドで待つだけのコマンドを止め、短い待ち、起動の確認、バックグラウンドの待ちは通す', () => {
  for (const command of ['sleep 60', 'sleep 1m', 'until grep -q DONE /tmp/out; do sleep 5; done; cat /tmp/out',
    'for i in $(seq 1 60); do gh run view 1 --json status; sleep 10; done',
    'end=$((SECONDS+600)); while [ $SECONDS -lt $end ]; do sleep 30; done; echo waited']) {
    assert.ok(findWait(command), `止めるべき: ${command}`);
  }
  for (const command of ['sleep 2', 'until curl -sf localhost:3000; do sleep 1; done', 'while read l; do echo "$l"; done < list.txt',
    "cat > run.sh <<'EOF'\nsleep 60\nEOF", 'until pg_isready -h localhost; do sleep 3; done', 'until redis-cli ping; do sleep 3; done',
    'until /usr/bin/curl -sf localhost:3000/health; do sleep 5; done', 'for i in $(seq 1 30); do curl -sf localhost:3000 && break; sleep 2; done',
    'for n in 101 102 103; do gh issue close $n; sleep 3; done', 'for i in {1..3}; do make; sleep 5; done',
    './server & PID=$!; (sleep 120 && kill $PID) &', 'sleep 300 &']) {
    assert.equal(findWait(command), null, `通すべき: ${command}`);
  }
  assert.equal(pre('sleep 1500; date', { tool_input: { command: 'sleep 1500; date', run_in_background: true } }), null);
});

test('待ちの差し戻しは、ユーザーと対話するセッションにだけターンを終えるよう伝える', () => {
  assert.match(pre('sleep 120').reason, /ターンを終えて/);
  const sub = pre('sleep 120', { agent_id: 'a1' });
  assert.doesNotMatch(sub.reason, /ターンを終えて/);
  assert.match(sub.reason, /フォアグラウンドで実行/);
});

function tempRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-gate-')));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir });
  return dir;
}

test('実測は同じリポジトリーの worktree どうしで共有する', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  const env = { DOTAGENTS_HOME: home };
  const repo = tempRepo();
  const tree = path.join(repo, '.worktrees', 'issue-1');
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'issue-1', tree], { cwd: repo });
  const main = createStore({ cwd: repo }, env);
  main.start('t1', 'cargo test', 0);
  main.finish('t1', 90_000);
  assert.equal(main.seconds('cargo test'), null, '1 回の記録では判定しない');
  main.start('t2', 'cargo test', 0);
  main.finish('t2', 80_000);
  assert.equal(createStore({ cwd: tree }, env).seconds('cargo test'), 80);
  assert.equal(createStore({ cwd: path.join(tree, 'src') }, env).seconds('cargo test'), 80, 'サブディレクトリーからも同じ記録を読む');
});

test('1 回だけ遅かった検査では止めない', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  const store = createStore({ cwd: tempRepo() }, { DOTAGENTS_HOME: home });
  const record = (id, ms) => { store.start(id, 'make check', 0); store.finish(id, ms); };
  record('a', 120_000);
  record('b', 5_000);
  assert.equal(store.seconds('make check'), 5, '権限の確認やキャッシュの切れで遅れた 1 回は判定に使わない');
  record('c', 100_000);
  assert.equal(store.seconds('make check'), 100, '遅い回が続けば止める');
});

test('同じコマンドでも、作業ツリーの中の場所が違えば別の検査として測る', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  const env = { DOTAGENTS_HOME: home };
  const repo = tempRepo();
  const tree = path.join(repo, '.worktrees', 'issue-2');
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'issue-2', tree], { cwd: repo });
  fs.mkdirSync(path.join(tree, 'packages', 'api'), { recursive: true });
  const store = createStore({ cwd: repo }, env);
  assert.equal(store.scope(null), '.');
  assert.equal(store.scope('packages/big'), 'packages/big');
  assert.equal(store.scope(tree), '.', 'worktree の最上位へ移っても、同じ場所として読む');
  assert.equal(createStore({ cwd: path.join(tree, 'packages', 'api') }, env).scope(null), path.join('packages', 'api'));

  const input = (id, command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: id, cwd: repo, tool_input: { command } });
  for (const [id, at] of [['a', 0], ['b', 0]]) {
    assert.equal(before(input(id, 'cd packages/big && npm test'), store, at), null);
    after(input(id, ''), store, at + 90_000);
  }
  assert.ok(before(input('c', 'cd packages/big && npm test'), store), '重かった場所では止める');
  assert.equal(before(input('d', 'cd packages/small && npm test'), store), null, '別の場所の記録で止めない');
});

function runHook(command, input, opts) {
  return spawnSync('sh', ['-c', command], { input: JSON.stringify(input), encoding: 'utf8', cwd: opts.cwd, env: { ...process.env, ...opts.env } });
}

test('install した位置から、Claude Code と Codex の hook 定義で測って止める', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const proj = tempRepo();
  execFileSync(process.execPath, [CLI, 'install', 'gate', '--agent', 'claude,codex', '-C', proj], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const hookCommand = (file, event) => JSON.parse(fs.readFileSync(file, 'utf8')).hooks[event][0].hooks[0].command;
  const pluginRoot = path.join(proj, '.claude', 'skills', 'dotagents');
  const claudeHooks = path.join(pluginRoot, 'hooks', 'hooks.json');
  const codexHooks = path.join(proj, '.codex', 'hooks.json');
  assert.ok(fs.existsSync(path.join(proj, '.codex', 'dotagents', 'gate', 'verify-gate.mjs')), 'Codex にも実行ファイルが届く');
  assert.ok(!fs.existsSync(path.join(proj, '.codex', 'dotagents', 'gate', 'hooks.json')), 'Claude の定義は Codex へ運ばない');

  const env = { HOME: home, CLAUDE_PLUGIN_ROOT: pluginRoot };
  const input = (event, id) => ({ hook_event_name: event, tool_name: 'Bash', tool_use_id: id, cwd: proj, tool_input: { command: 'make check' } });
  assert.equal(runHook(hookCommand(claudeHooks, 'PreToolUse'), input('PreToolUse', 'a'), { cwd: proj, env }).stdout, '', '初回は通す');
  // 実行に時間がかかったことにする: 開始の記録を過去へずらしてから、終わりの hook を走らせる
  const pending = path.join(home, '.dotagents', 'cache', 'gate');
  const [id] = fs.readdirSync(pending);
  const file = path.join(pending, id, 'pending', 'a.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), at: Date.now() - 120_000 }));
  runHook(hookCommand(claudeHooks, 'PostToolUseFailure'), input('PostToolUseFailure', 'a'), { cwd: proj, env });
  assert.equal(runHook(hookCommand(claudeHooks, 'PreToolUse'), input('PreToolUse', 'a2'), { cwd: proj, env }).stdout, '', '1 回の記録では止めない');
  const file2 = path.join(pending, id, 'pending', 'a2.json');
  fs.writeFileSync(file2, JSON.stringify({ ...JSON.parse(fs.readFileSync(file2, 'utf8')), at: Date.now() - 120_000 }));
  runHook(hookCommand(claudeHooks, 'PostToolUse'), input('PostToolUse', 'a2'), { cwd: proj, env });

  const claude = runHook(hookCommand(claudeHooks, 'PreToolUse'), input('PreToolUse', 'b'), { cwd: proj, env });
  assert.equal(JSON.parse(claude.stdout).hookSpecificOutput.permissionDecision, 'deny');

  const sub = path.join(proj, 'src');
  fs.mkdirSync(sub);
  // hook の定義は、サブディレクトリーで起動されても配備した実行ファイルを見つける
  const codex = runHook(hookCommand(codexHooks, 'PreToolUse'), input('PreToolUse', 'c'), { cwd: sub, env: { HOME: home } });
  assert.equal(JSON.parse(codex.stdout).hookSpecificOutput.permissionDecision, 'deny', 'Codex からも同じ記録で止める');
});

test('読めない入力でも、hook は何も出さずに 0 で終わる', () => {
  const r = spawnSync(process.execPath, [GATE], { input: '{not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
