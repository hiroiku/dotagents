// Pi の受け口(plugin/hosts/pi/index.js)の契約を固定する。
// - 常設の文を、役ごとに system prompt へ足す
// - 外へ届く操作は、確かめる手段が無ければ止め、あれば聞く。無害な操作は通す
// - 仕組みの側の例外は、利用者の作業を止めない
// - 編集の検査の出力を、道具の結果へ足す
// - 役を走らせる道具は、進める役にだけ登録する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-pi-home-'));
process.env.DOTAGENTS_HOME = home;
delete process.env.DOTAGENTS_ROLE;
const { default: extension, roleOfName } = await import(path.join(REPO, 'plugin', 'hosts', 'pi', 'index.js'));

const project = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-pi-project-'));
process.on('exit', () => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(project, { recursive: true, force: true });
});

// 登録された受け口と道具を捕まえるだけの pi
function fakePi() {
  const handlers = {};
  const tools = {};
  const pi = { on: (name, handler) => (handlers[name] = handler), registerTool: (tool) => (tools[tool.name] = tool) };
  extension(pi);
  return { handlers, tools };
}
const ui = (answer) => {
  const asked = [];
  return { hasUI: true, cwd: project, ui: { confirm: async (...args) => (asked.push(args), answer) }, asked };
};
const noUi = () => ({ hasUI: false, cwd: project });
const shell = (command, extra = {}) => ({ toolName: 'bash', toolCallId: 't1', input: { command, ...extra } });

function asRole(role, fn) {
  const before = process.env.DOTAGENTS_ROLE;
  if (role) process.env.DOTAGENTS_ROLE = role;
  else delete process.env.DOTAGENTS_ROLE;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.DOTAGENTS_ROLE;
    else process.env.DOTAGENTS_ROLE = before;
  }
}

test('常設の文を system prompt の末尾へ足し、役ごとに違う', async () => {
  const lead = await asRole(null, () => fakePi().handlers.before_agent_start({ systemPrompt: 'BASE' }, noUi()));
  assert.ok(lead.systemPrompt.startsWith('BASE\n\n'));
  assert.ok(lead.systemPrompt.length > 'BASE'.length + 100);
  const again = await asRole(null, () => fakePi().handlers.before_agent_start({ systemPrompt: 'BASE' }, noUi()));
  assert.equal(again.systemPrompt, lead.systemPrompt, '同じ役とプロジェクトなら同じ文');
  const builder = await asRole('builder', () => fakePi().handlers.before_agent_start({ systemPrompt: 'BASE' }, noUi()));
  assert.notEqual(builder.systemPrompt, lead.systemPrompt);
});

test('確かめる手段が無いとき、共有のブランチへの push を止める', async () => {
  const result = await fakePi().handlers.tool_call(shell('git push origin main'), noUi());
  assert.equal(result.block, true);
  assert.match(result.reason, /push/);
});

test('確かめる手段があれば聞き、断られたら止め、了承されたら通す', async () => {
  const { handlers } = fakePi();
  const declined = ui(false);
  const blocked = await handlers.tool_call(shell('git push origin main'), declined);
  assert.equal(declined.asked.length, 1);
  assert.equal(blocked.block, true);
  const accepted = ui(true);
  assert.equal(await handlers.tool_call(shell('git push origin main'), accepted), undefined);
  assert.equal(accepted.asked.length, 1);
});

test('役の子は、画面があっても聞かずに止める', async () => {
  const context = ui(true);
  const result = await asRole('builder', () => fakePi().handlers.tool_call(shell('git push origin main'), context));
  assert.equal(result.block, true);
  assert.equal(context.asked.length, 0);
});

test('無害なコマンドは通す', async () => {
  const context = ui(false);
  assert.equal(await fakePi().handlers.tool_call(shell('ls -la'), context), undefined);
  assert.equal(context.asked.length, 0);
});

test('指示ファイルの書き込みも、確かめる手段が無ければ止める', async () => {
  const result = await fakePi().handlers.tool_call({ toolName: 'write', toolCallId: 't2', input: { path: 'CLAUDE.md', content: 'x' } }, noUi());
  assert.equal(result.block, true);
  assert.equal(await fakePi().handlers.tool_call({ toolName: 'write', toolCallId: 't3', input: { path: 'notes.txt', content: 'x' } }, noUi()), undefined);
});

test('仕組みの側で例外が出ても、呼び出しを止めずに記録する', async () => {
  const context = { hasUI: true, cwd: project, ui: { confirm: async () => { throw new Error('boom'); } } };
  assert.equal(await fakePi().handlers.tool_call(shell('git push origin main'), context), undefined);
  const logs = fs.readdirSync(path.join(home, 'log')).map((name) => fs.readFileSync(path.join(home, 'log', name), 'utf8')).join('');
  assert.match(logs, /"host":"pi","event":"error","message":"boom"/);
  assert.match(logs, /"host":"pi","event":"guard","project":"[^"]+","role":"lead","decision":"ask","kind":"push"/);
});

test('編集の検査が落ちたら、その出力を結果の本文へ足す', async () => {
  fs.mkdirSync(path.join(project, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(project, '.agents', 'dotagents.json'), JSON.stringify({ checks: { edit: 'echo BROKEN {file}; exit 1' } }));
  fs.writeFileSync(path.join(project, 'a.txt'), 'x');
  const { handlers } = fakePi();
  const event = { toolName: 'edit', input: { path: 'a.txt', edits: [] }, isError: false, content: [{ type: 'text', text: 'ok' }] };
  const patched = await handlers.tool_result(event, noUi());
  assert.equal(patched.content[0].text, 'ok');
  assert.match(patched.content[1].text, /BROKEN/);
  assert.equal(await handlers.tool_result({ ...event, isError: true }, noUi()), undefined, '失敗した編集は検査しない');
  fs.rmSync(path.join(project, '.agents'), { recursive: true });
});

test('役を走らせる道具は進める役にだけ登録し、子の指示と道具は役の定義から導く', () => {
  assert.ok(asRole(null, () => fakePi().tools.run_role));
  assert.equal(asRole('builder', () => fakePi().tools.run_role), undefined);
  const builder = roleOfName('builder');
  assert.ok(!builder.body.startsWith('---'));
  assert.ok(!builder.body.includes('model: sonnet'));
  assert.equal(builder.tools, null, '作る役は道具を絞らない');
  assert.deepEqual(roleOfName('reviewer').tools, ['read', 'ls', 'find', 'grep', 'bash'], '確かめる役は書き換える道具を持たない');
});

test('役のコマンドに、時間の上限を足さない', async () => {
  for (const role of ['builder', 'reviewer', null]) {
    const event = { toolName: 'bash', toolCallId: 't', input: { command: 'npm test' } };
    assert.equal(await asRole(role, () => fakePi().handlers.tool_call(event, noUi())), undefined);
    assert.deepEqual(event.input, { command: 'npm test' }, String(role));
  }
});
