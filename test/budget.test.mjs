import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.DOTAGENTS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-budget-'));
const { prune, roleMinutes, tick } = await import('../plugin/src/budget.mjs');
const { handle } = await import('../plugin/src/hook.mjs');

const MINUTE = 60000;

test('働いた時間が見込みを超えたときに、1 回だけ知らせる', () => {
  let now = 1_000_000_000_000;
  assert.equal(tick('a1', 90, now), null);
  for (let i = 0; i < 89; i += 1) assert.equal(tick('a1', 90, (now += MINUTE)), null, `${i + 1} 分`);
  assert.match(tick('a1', 90, (now += MINUTE)), /90 分たっています\(見込みは 90 分\)/);
  assert.equal(tick('a1', 90, (now += MINUTE)), null, '同じ段では繰り返さない');
  for (let i = 0; i < 88; i += 1) tick('a1', 90, (now += MINUTE));
  assert.match(tick('a1', 90, (now += MINUTE)), /180 分/);
});

test('続きを頼まれるまで待っていた時間は数えない', () => {
  let now = 1_000_000_000_000;
  tick('a2', 90, now);
  for (let i = 0; i < 30; i += 1) tick('a2', 90, (now += MINUTE));
  assert.equal(tick('a2', 90, (now += 300 * MINUTE)), null, '5 時間あとに再開しても、働いたのは 30 分');
  for (let i = 0; i < 59; i += 1) assert.equal(tick('a2', 90, (now += MINUTE)), null);
  assert.match(tick('a2', 90, (now += MINUTE)), /90 分/);
});

test('役の名前が使えない形のときと、役でないときは数えない', () => {
  assert.equal(tick('../x', 90), null);
  assert.equal(tick(undefined, 90), null);
  assert.equal(roleMinutes({ limits: { roleMinutes: 30 } }), 30);
  assert.equal(roleMinutes({}), 90);
});

test('受け口は、サブエージェントの道具の呼び出しで数え、知らせる文を文脈に足す', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-budget-project-'));
  fs.mkdirSync(path.join(cwd, '.agents'));
  fs.writeFileSync(path.join(cwd, '.agents', 'dotagents.json'), JSON.stringify({ limits: { roleMinutes: 2 } }));
  const input = { cwd, agent_id: 'b1', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'ls' } };
  let now = 1_000_000_000_000;
  assert.equal(handle('claude', 'tool', input, now), null);
  assert.equal(handle('claude', 'tool', input, (now += MINUTE)), null);
  const told = handle('claude', 'tool', input, (now += MINUTE));
  assert.equal(told.hookSpecificOutput.permissionDecision, undefined, '止めない');
  assert.match(told.hookSpecificOutput.additionalContext, /見込みは 2 分/);
  // 進める役は数えない。
  for (let i = 0; i < 5; i += 1) assert.equal(handle('claude', 'tool', { ...input, agent_id: undefined, agent_type: undefined }, (now += MINUTE)), null);
});

test('古い記録は消す', () => {
  const dir = path.join(process.env.DOTAGENTS_HOME, 'state', 'roles');
  const old = path.join(dir, 'old.json');
  fs.writeFileSync(old, '{}');
  fs.utimesSync(old, new Date(Date.now() - 8 * 86400000), new Date(Date.now() - 8 * 86400000));
  prune();
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(path.join(dir, 'a1.json')), true);
});
