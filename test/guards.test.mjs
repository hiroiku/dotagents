// 強制則(bd ラッパー / git-guard)の argv・環境変数判定を固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const BD = path.join(REPO, 'payload', 'bin', 'bd');
const GIT_GUARD = path.join(REPO, 'payload', 'bin', 'git-guard');

// PATH 先頭に置くスタブ: 実行された事実と argv をそのまま出力する
function makeStubs({ bdJson } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-stub-'));
  const bdBody = bdJson
    ? `#!/bin/sh\ncase "$*" in *"merge-slot check"*) echo '${bdJson}' ;; *) echo "REAL-BD: $*" ;; esac\n`
    : '#!/bin/sh\necho "REAL-BD: $*"\n';
  fs.writeFileSync(path.join(dir, 'bd'), bdBody, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'git'), '#!/bin/sh\necho "REAL-GIT: $*"\n', { mode: 0o755 });
  return dir;
}

function run(cmd, args, env = {}, stubDir) {
  const base = { ...process.env, PATH: `${stubDir}${path.delimiter}${process.env.PATH}` };
  delete base.CLAUDECODE; delete base.CLAUDE_CODE; delete base.CODEX_HOME; delete base.CODEX_SANDBOX;
  delete base.BD_OPEN_OK; delete base.BD_MEMO_OK; delete base.BD_READONLY; delete base.MERGE_SLOT_OK;
  try {
    return { code: 0, out: execFileSync(cmd, args, { env: { ...base, ...env }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('bd: 消化の経路の無い create は止まり、経路か BD_OPEN_OK で通る', () => {
  const stub = makeStubs();
  assert.equal(run(BD, ['create', '観測'], {}, stub).code, 2);
  assert.equal(run(BD, ['new', '観測'], {}, stub).code, 2, 'alias new も同じ');
  assert.match(run(BD, ['create', '子', '--parent', 'x-1'], {}, stub).out, /REAL-BD: create/);
  assert.match(run(BD, ['create', '後で', '--defer', '+1w'], {}, stub).out, /REAL-BD: create/);
  assert.match(run(BD, ['create', '決定'], { BD_OPEN_OK: '1' }, stub).out, /REAL-BD: create/);
  assert.match(run(BD, ['list'], {}, stub).out, /REAL-BD: list/, 'create 以外は素通り');
});

test('bd: remember は BD_MEMO_OK が無ければ止まる', () => {
  const stub = makeStubs();
  assert.equal(run(BD, ['remember', 'x'], {}, stub).code, 2);
  assert.match(run(BD, ['remember', 'x'], { BD_MEMO_OK: '1' }, stub).out, /REAL-BD: remember/);
});

test('bd: BD_READONLY=1 は --readonly を強制する', () => {
  const stub = makeStubs();
  assert.match(run(BD, ['list'], { BD_READONLY: '1' }, stub).out, /REAL-BD: --readonly list/);
});

test('git-guard: エージェントセッション以外は merge も透過', () => {
  const stub = makeStubs();
  assert.match(run(GIT_GUARD, ['merge', 'f'], {}, stub).out, /REAL-GIT: merge f/);
});

test('git-guard: エージェントの merge は MERGE_SLOT_OK が無ければ止まり、merge 以外は透過', () => {
  const stub = makeStubs();
  assert.equal(run(GIT_GUARD, ['merge', 'f'], { CLAUDECODE: '1' }, stub).code, 2);
  assert.match(run(GIT_GUARD, ['status'], { CLAUDECODE: '1' }, stub).out, /REAL-GIT: status/);
});

test('git-guard: 宣言と事実の突き合わせ(bd 照合)', () => {
  const env = { CLAUDECODE: '1', MERGE_SLOT_OK: '1', BEADS_ACTOR: 'mgr-me' };
  const held = makeStubs({ bdJson: '{"available": false, "holder": "other", "id": "x-merge-slot"}' });
  assert.equal(run(GIT_GUARD, ['merge', 'f'], env, held).code, 2, '別 actor 保持は止まる');
  const free = makeStubs({ bdJson: '{"available": true, "holder": null, "id": "x-merge-slot"}' });
  assert.equal(run(GIT_GUARD, ['merge', 'f'], env, free).code, 2, '未取得は止まる');
  const mine = makeStubs({ bdJson: '{"available": false, "holder": "mgr-me", "id": "x-merge-slot"}' });
  assert.match(run(GIT_GUARD, ['merge', 'f'], env, mine).out, /REAL-GIT: merge f/, '自 actor 保持は通る');
  const unknown = makeStubs({ bdJson: 'not-json' });
  assert.match(run(GIT_GUARD, ['merge', 'f'], env, unknown).out, /REAL-GIT: merge f/, '状態不明は宣言で通す(fail-open)');
});
