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
import { installCodexStub } from './codex-stub.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');
const GATE = path.join(REPO, 'modules', 'gate', 'hooks', 'verify-gate.mjs');
const { before, after, describe, findWait, findCiWait, boundedWait, createStore, FINAL, REPEAT, HEAVY_SECONDS, MOVED_WAIT_SECONDS } = await import(GATE);

delete process.env.DOTAGENTS_HOME;

// 記録を持つだけの store。実測の値を直接与えて、判定だけを確かめる。
function memoryStore(seconds = {}, { state = null, last = {} } = {}) {
  const started = [];
  return {
    scope: () => '.',
    seconds: (key) => seconds[key] ?? null,
    state: () => (state === null ? null : { tree: '/repo', value: state }),
    unchanged: (key, s) => last[key] === s.value,
    start: (id, key, now, at) => started.push({ id, key, state: at }),
    finish() {},
    started,
  };
}
const pre = (command, { store = memoryStore(), ...rest } = {}) =>
  before({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 't1', transcript_path: '/t.jsonl', cwd: '/', tool_input: { command }, ...rest }, store);

test('検査の語を含むコマンドを、どのエコシステムでも検査として読む', () => {
  for (const command of ['cargo test', 'pytest -x', 'make check', './gradlew test', 'bundle exec rspec', 'dotnet test',
    'mix test', 'swift test', 'bun run check', 'npx eslint .', 'mvn verify', 'ruff check .']) {
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
  for (const command of ['cargo test', 'npx eslint . --format json', 'bunx vitest run --project app --config vitest.config.ts',
    'bun run test > /tmp/out.txt 2>&1', 'go test ./...', 'ruff check .', 'pytest -n auto', 'npx eslint src/a.ts && bun run test']) {
    assert.equal(describe(command).targeted, false, `全体への実行: ${command}`);
  }
});

test('同じ検査は、場所の移動や出力の整形が違っても同じ鍵になる', () => {
  const key = describe('cargo test').key;
  assert.equal(describe('cd /repo/.worktrees/issue-1 && cargo test 2>&1 | tail -30').key, key);
  assert.equal(describe(`${FINAL} cargo test`).key, key);
  assert.equal(describe("bash -lc 'cargo test'").key, key);
  assert.equal(describe('git log --oneline -1 && cargo test').key, key, '検査でない部分を前に付けても同じ検査');
  assert.equal(describe('python3 - && node --version && cargo test').key, key);
  assert.equal(describe('make lint && cargo test').key, 'make lint && cargo test', '検査を 2 つ並べたものは別の検査');
  assert.equal(describe('cd crates/api && cargo test').cd, 'crates/api', '移動先は場所として別に返す');
  assert.equal(describe('cargo test > out.log 2>&1 &'), null, 'background で切り離した検査は待たないので読まない');
});

test('起動の形と、出力や並列の度合いだけを変える指定は、記録の鍵で区別しない', () => {
  // どれも、ゲートに止められたエージェントが同じ全体の検査を言い換える形。
  for (const command of ['bunx vitest run', 'npx vitest run --reporter dot', './node_modules/.bin/vitest run --bail 1',
    'bun run vitest run --silent', 'npx -y vitest run', '/repo/.worktrees/a/node_modules/.bin/vitest run']) {
    assert.equal(describe(command).key, 'vitest run', command);
  }
  assert.equal(describe('bunx vitest run --reporter=dot --bail=1 test/a.spec.ts').key, describe('npx vitest run test/a.spec.ts').key);
  assert.equal(describe('make -j 8 check').key, 'make check');
  assert.equal(describe('npm run check:code').key, describe('bun run check:code').key, 'script の名前が同じなら同じ検査');
  assert.equal(describe('bun run test').key, 'test', 'script の名前が検査の語そのものでも検査として読む');
  for (const [a, b] of [['vitest run --project a', 'vitest run --project b'], ['vitest run --shard=1/2', 'vitest run'],
    ['pytest -m slow', 'pytest'], ['eslint . --max-warnings 0', 'eslint .']]) {
    assert.notEqual(describe(a).key, describe(b).key, `検査の中身が違う: ${a} / ${b}`);
  }
});

test('前回重かった検査を、作業中に対象を絞らず回すと止める', () => {
  const store = memoryStore({ 'make check': HEAVY_SECONDS + 10 });
  const denied = pre('make check', { store });
  assert.match(denied.reason, /make check/);
  assert.match(denied.reason, /変更したファイルだけ/);
  assert.ok(denied.reason.includes(FINAL));
});

test('サブエージェントの重い検査には、push の前の宣言を示さない', () => {
  const store = memoryStore({ 'make check': HEAVY_SECONDS + 10 });
  const denied = pre('make check', { store, agent_id: 'a1' });
  assert.match(denied.reason, /変更したファイルだけ/);
  assert.ok(!denied.reason.includes(FINAL), 'push の前の検査は統合する側が行う');
  assert.match(denied.reason, /統合する側の push の前の検査と CI/);
});

test('型の検査は、検査として読まない', () => {
  // ファイルで絞れず、止めても代わりの手を返せない。増分で実行した検査を、求めた形のまま止め続けていた。
  for (const command of ['npx tsc --noEmit', 'cd /repo/.worktrees/a && timeout 170 bunx tsc --noEmit --incremental; echo "exit=$?"',
    'bun run check:types', 'npm run typecheck', 'pnpm run type-check -- --watch false', 'mypy .', 'pyright', 'cargo clippy',
    'npx vue-tsc --noEmit', 'npx tsc -p tsconfig.test.json', 'npx tsc --noEmit --incremental --tsBuildInfoFile /tmp/s/test.tsbuildinfo -p tsconfig.spec.json']) {
    assert.equal(describe(command), null, command);
    assert.equal(pre(command, { agent_id: 'a1' }), null, command);
  }
  assert.equal(describe('npx eslint src/a.ts && npx tsc --noEmit').key, 'eslint src/a.ts', '並べた型の検査は、記録の鍵に入れない');
  assert.equal(describe('bun run test && bun run typecheck').key, 'test', '並べたテストは、今までどおり検査として読む');
  assert.ok(describe('pytest tests/test_types.py'), '引数に型の語があっても、テストは検査として読む');
  assert.equal(describe('npx prettier --write vitest.config.ts'), null, 'ファイルの名前に検査の語があっても、検査として読まない');
  assert.ok(describe('bunx vitest run --config vitest.config.ts'), '設定ファイルを指定したテストは、検査として読む');
  const heavy = pre('bun run check', { store: memoryStore({ check: HEAVY_SECONDS + 10 }), agent_id: 'a1' });
  assert.match(heavy.reason, /変更したファイルだけ/, '型の検査を含むかもしれない全体の検査は、今までどおり止める');
});

test('argv の配列で渡されたコマンドも、1 行のコマンドとして読む', () => {
  const store = memoryStore({ 'make check': 300 });
  const argv = (command) => pre('', { store, tool_input: { command } });
  assert.ok(argv(['bash', '-lc', 'make check']), 'シェルの -c の中身を読む');
  assert.ok(argv(['make', 'check']), '引数をつないで読む');
  assert.equal(argv(['rg', 'sleep 45']), null, '引数の中の語をコマンドとして読まない');
});

test('初めての検査、軽かった検査、push の前の宣言、絞った確認は通す', () => {
  assert.equal(pre('make check'), null, '初めて見る検査は通して測る');
  assert.equal(pre('make check', { store: memoryStore({ 'make check': HEAVY_SECONDS - 1 }) }), null);
  assert.equal(pre(`${FINAL} make check`, { store: memoryStore({ 'make check': 300 }) }), null);
  assert.equal(pre('pytest tests/test_user.py', { store: memoryStore({ 'pytest tests/test_user.py': 300 }) }), null);
});

test('前回から作業ツリーが変わっていない重い検査は、push の前の宣言があっても止める', () => {
  const heavy = { 'make check': HEAVY_SECONDS + 10 };
  const same = memoryStore(heavy, { state: 'abc', last: { 'make check': 'abc' } });
  const denied = pre(`${FINAL} make check`, { store: same });
  assert.match(denied.reason, /前回の結果/);
  assert.ok(denied.reason.includes(REPEAT), '同じ状態でも結果が変わりうるときの手を添える');
  assert.equal(pre(`${REPEAT} ${FINAL} make check`, { store: same }), null, '宣言を付けた再実行は通す');
  assert.equal(pre(`${FINAL} make check`, { store: memoryStore(heavy, { state: 'def', last: { 'make check': 'abc' } }) }), null,
    '変更があれば通す');
  assert.equal(pre(`${FINAL} make check`, { store: memoryStore(heavy, { state: null, last: { 'make check': 'abc' } }) }), null,
    '状態を読めない場所では判定しない');
  const light = memoryStore({ 'make check': HEAVY_SECONDS - 1 }, { state: 'abc', last: { 'make check': 'abc' } });
  assert.equal(pre('make check', { store: light }), null, '軽い検査は繰り返しても止めない');
  assert.deepEqual(light.started.map((s) => s.state), [null], '軽い検査では状態を読まない');
});

test('作業ツリーの状態は、変更したファイルの中身が違えば違う値になる', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  const repo = tempRepo();
  const store = createStore({ cwd: repo }, { DOTAGENTS_HOME: home });
  const first = store.state(null)?.value;
  assert.ok(first, 'git のある場所では状態を読める');
  assert.equal(store.state(null).tree, repo, 'どの worktree の状態かを持つ');
  assert.equal(store.state(null).value, first, '何もしなければ同じ値');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one');
  const added = store.state(null).value;
  assert.notEqual(added, first, '追跡していないファイルが増えれば変わる');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'two longer');
  assert.notEqual(store.state(null).value, added, '中身が変われば変わる');
  assert.equal(createStore({ cwd: os.tmpdir() }, { DOTAGENTS_HOME: home }).state(null), null, 'git の無い場所では読めない');
});

test('作業ツリーの状態は、検査と worktree ごとに、実行した時点のものを覚える', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  const env = { DOTAGENTS_HOME: home };
  const repo = tempRepo();
  const tree = path.join(repo, '.worktrees', 'issue-3');
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'issue-3', tree], { cwd: repo });
  const main = createStore({ cwd: repo }, env);
  const other = createStore({ cwd: tree }, env);
  const here = main.state(null);
  assert.equal(main.unchanged('make check', here), false, '実行していない検査は、同じ状態とみなさない');
  main.start('a', 'make check', 0, here);
  main.finish('a', 90_000);
  assert.equal(main.unchanged('make check', main.state(null)), true);
  other.start('b', 'make check', 0, other.state(null));
  other.finish('b', 90_000);
  assert.equal(main.unchanged('make check', main.state(null)), true, '別の worktree の実行で上書きしない');
  assert.equal(other.unchanged('make check', other.state(null)), true);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'edit');
  assert.equal(main.unchanged('make check', main.state(null)), false, '変更があれば同じ状態ではない');
  assert.equal(other.unchanged('make check', other.state(null)), true, '別の worktree の変更には左右されない');

  execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: repo });
  main.start('c', 'make check', 0, main.state(null));
  main.finish('c', 90_000);
  const kept = JSON.parse(fs.readFileSync(path.join(home, 'cache', 'gate', fs.readdirSync(path.join(home, 'cache', 'gate'))[0], 'durations.json'), 'utf8'));
  assert.deepEqual(Object.keys(kept['make check'].states), [repo], '消えた worktree の状態は持ち越さない');
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
    'end=$((SECONDS+600)); while [ $SECONDS -lt $end ]; do sleep 30; done; echo waited',
    // 包んだり形を変えたりしても待ちは待ちである。どれも、サブエージェントが実際に使った形。
    'timeout 540 tail -f /dev/null; echo waited', 'tail -F build.log', 'sleep infinity',
    "timeout 600 bash -c 'until [ -s /tmp/out ]; do sleep 5; done'; cat /tmp/out",
    'F=/tmp/x.output; timeout 300 zsh -c "until grep -q \'routes exit\' $F; do sleep 10; done"; cat $F',
    // sleep を短く刻んでも、回数を重ねれば待ちになる。
    'for i in $(seq 1 280); do sleep 1; done; echo done', 'until [ -s /tmp/tasks/a1.output ]; do sleep 1; done',
    "timeout 590 bash -c 'while true; do git status --porcelain | wc -l; sleep 2; done'"]) {
    assert.ok(findWait(command), `止めるべき: ${command}`);
  }
  for (const command of ['sleep 2', 'until curl -sf localhost:3000; do sleep 1; done', 'while read l; do echo "$l"; done < list.txt',
    'tail -n 40 build.log', 'timeout 60 tail -f server.log | grep -m1 ready', "bash -c 'until curl -sf localhost:3000; do sleep 1; done'",
    "sh -c 'npm test'", 'tail -f /tmp/x.log &',
    "cat > run.sh <<'EOF'\nsleep 60\nEOF", 'until pg_isready -h localhost; do sleep 3; done', 'until redis-cli ping; do sleep 3; done',
    'until /usr/bin/curl -sf localhost:3000/health; do sleep 5; done', 'for i in $(seq 1 30); do curl -sf localhost:3000 && break; sleep 2; done',
    'for n in 101 102 103; do gh issue close $n; sleep 3; done', 'for i in {1..3}; do make; sleep 5; done',
    './server & PID=$!; (sleep 120 && kill $PID) &', 'sleep 300 &', 'for i in 1 2 3; do make && break; sleep 1; done']) {
    assert.equal(findWait(command), null, `通すべき: ${command}`);
  }
  assert.equal(pre('sleep 1500; date', { tool_input: { command: 'sleep 1500; date', run_in_background: true } }), null);
});

test('プロセスの終わりを待つコマンドも待ちとして読む', () => {
  for (const command of ['caffeinate -w 123', 'timeout 900 caffeinate -w 51529; grep -E "Tests " /tmp/related.log', 'caffeinate -i -w 9']) {
    assert.equal(findWait(command), 'プロセスの終わりを待つ処理', command);
  }
  assert.equal(findWait('caffeinate -i make'), null, '眠らせないだけなら待ちではない');
});

test('サブエージェントには、移されたコマンドを待つ、短い上限の付いた条件つきの待ちを通す', () => {
  const sub = (command) => pre(command, { agent_id: 'a1' });
  const allowed = ["for i in $(seq 1 34); do grep -q 'Test Files' /tmp/tasks/b1.output && break; sleep 5; done",
    "timeout 170 sh -c 'until grep -q exit= /tmp/related.log; do sleep 5; done'; tail -20 /tmp/related.log",
    `cd /repo && timeout ${MOVED_WAIT_SECONDS} bash -c 'while ! grep -q exit= /tmp/x.log; do sleep 10; done'`,
    'timeout 170 caffeinate -w 51529; grep -E "Tests " /tmp/related.log', 'timeout 170 tail --pid=4242 -f /dev/null; echo done',
    'for i in {1..17}; do [ -s /tmp/x.output ] && break; sleep 10; done; cat /tmp/x.output'];
  for (const command of allowed) {
    assert.ok(findWait(command), `待ちには変わりない: ${command}`);
    assert.ok(boundedWait(command), `上限と条件が読める: ${command}`);
    assert.equal(sub(command), null, `サブエージェントには通す: ${command}`);
    assert.match(pre(command).reason, /ターンを終えて/, `対話を担当するセッションでは止める: ${command}`);
  }
  const denied = ["until grep -q 'Test Files' /tmp/x.output; do sleep 5; done", // 上限が無い
    "timeout 600 sh -c 'until grep -q exit= /tmp/x.log; do sleep 5; done'", // 移されるまでの時間を超える
    'for i in $(seq 1 60); do grep -q x /tmp/x.output && break; sleep 5; done', // 回数 × sleep が長い
    'for i in $(seq 1 34); do sleep 5; done', // 条件が無い
    'timeout 170 sleep 170', "timeout 170 sh -c 'while true; do sleep 5; done'", 'timeout 170 tail -f /tmp/x.log',
    'timeout 900 caffeinate -w 51529', "timeout 170 sh -c 'until grep -q x f; do sleep 5; done'; sleep 60"];
  for (const command of denied) {
    assert.equal(boundedWait(command), false, `通さない: ${command}`);
    assert.ok(sub(command), `サブエージェントでも止める: ${command}`);
  }
  const reason = sub('sleep 120').reason;
  assert.match(reason, /バックグラウンドへ移されたら/);
  assert.ok(reason.includes(`${MOVED_WAIT_SECONDS} 秒以内`));
});

test('待ちの差し戻しは、ユーザーと対話するセッションにだけターンを終えるよう伝える', () => {
  assert.match(pre('sleep 120').reason, /ターンを終えて/);
  const sub = pre('sleep 120', { agent_id: 'a1' });
  assert.doesNotMatch(sub.reason, /ターンを終えて/, 'サブエージェントはターンを終えると親へ戻ってしまう');
  assert.match(sub.reason, /フォアグラウンドで実行/);
  assert.match(sub.reason, /エージェントを 1 つのメッセージでまとめてフォアグラウンドで起動/, '子のエージェントの待ち方を示す');
});

test('ユーザーと対話するセッションがフォアグラウンドで CI を待つと止め、バックグラウンドへ回すよう伝える', () => {
  for (const command of ['timeout 590 gh run watch 42155677190 --exit-status 2>&1 | tail -5', 'gh pr checks 12 --watch',
    "bash -c 'gh run watch 1'"]) {
    assert.equal(findCiWait(command), 'CI の完了を待つコマンド', command);
    const denied = pre(command);
    assert.match(denied.reason, /バックグラウンドで実行/, command);
    assert.match(denied.reason, /ターンを終えて/, command);
  }
  for (const command of ['gh pr checks 12', 'gh run view 1 --json status', 'gh run list --branch develop', 'gh run watch 1 &']) {
    assert.equal(findCiWait(command), null, command);
  }
  assert.equal(pre('gh run watch 1', { agent_id: 'a1' }), null, 'サブエージェントは CI をフォアグラウンドで待ってよい');
  assert.equal(pre('gh run watch 1', { tool_input: { command: 'gh run watch 1', run_in_background: true } }), null);
});

test('サブエージェントがバックグラウンドで始める検査を止め、フォアグラウンドで実行するよう伝える', () => {
  const bg = (command, rest = {}) => pre(command, { tool_input: { command, run_in_background: true }, ...rest });
  const denied = bg('bun run vitest run --project app', { agent_id: 'a1' });
  assert.match(denied.reason, /フォアグラウンドで実行/);
  assert.match(denied.reason, /push の前の検査に任せて/);
  assert.match(denied.reason, /バックグラウンドへ移されたら/, '移されたときの待ち方を示す');
  assert.equal(bg('bun run dev --port 3000', { agent_id: 'a1' }), null, '検査でない処理は、バックグラウンドで動かしてよい');
  assert.equal(bg('bun run vitest run --project app'), null, '対話を担当するセッションには完了が通知で届く');
  assert.equal(pre('bun run vitest run --project app', { agent_id: 'a1' }), null, 'フォアグラウンドの検査は通す');
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
  installCodexStub();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const proj = tempRepo();
  execFileSync(process.execPath, [CLI, 'install', 'gate', '--agent', 'claude,codex', '-C', proj], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const hookCommand = (file, event) => JSON.parse(fs.readFileSync(file, 'utf8')).hooks[event][0].hooks[0].command;
  const pluginRoot = path.join(proj, '.claude', 'skills', 'dotagents');
  const claudeHooks = path.join(pluginRoot, 'hooks', 'hooks.json');
  const codexHooks = path.join(home, '.dotagents', 'codex', 'plugins', 'dotagents', 'hooks', 'hooks.json');
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
