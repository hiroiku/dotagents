import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { claudeRun } from '../plugin/src/usage.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-usage-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

let serial = 0;
function transcript(rows) {
  const file = path.join(dir, `agent-${(serial += 1)}.jsonl`);
  fs.writeFileSync(file, rows.map((row) => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n'));
  return file;
}
const at = (seconds) => new Date(Date.parse('2026-11-20T10:00:00Z') + seconds * 1000).toISOString();
const ask = (seconds, content = '依頼') => ({ type: 'user', timestamp: at(seconds), message: { role: 'user', content } });
const result = (seconds) => ({ type: 'user', timestamp: at(seconds), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
const reply = (seconds, id, usage, content = [{ type: 'text', text: 'x' }]) => ({ type: 'assistant', timestamp: at(seconds), message: { id, model: 'model-x', role: 'assistant', content, usage } });
const use = { type: 'tool_use', id: 't', name: 'Bash', input: {} };
const usage = (out, input = 1, write = 0, read = 0) => ({ input_tokens: input, cache_creation_input_tokens: write, cache_read_input_tokens: read, output_tokens: out });

test('1 つの応答が複数の行に分かれていても、1 回だけ数える', () => {
  const run = claudeRun(transcript([
    ask(0),
    reply(2, 'm1', usage(40, 5, 95, 900), [{ type: 'thinking', thinking: '' }]),
    reply(3, 'm1', usage(40, 5, 95, 900), [use]),
    reply(3, 'm1', usage(40, 5, 95, 900), [use]),
    result(30),
    reply(45, 'm2', usage(10, 1, 0, 1000)),
  ]));
  assert.deepEqual(run, { model: 'model-x', seconds: 45, out: 50, in: 101, cached: 1900, tools: 2 });
});

test('続けて頼まれた役は、最後の依頼の分だけを数える', () => {
  const run = claudeRun(transcript([
    ask(0),
    reply(10, 'm1', usage(100)),
    // 止められたときの印は、依頼と同じ形の行で残る。あとに応答が無いので、依頼の始まりには数えない。
    ask(20, [{ type: 'text', text: '[Request interrupted by user]' }]),
    { type: 'attachment', timestamp: at(21) },
    ask(3600),
    { type: 'attachment', timestamp: at(3600) },
    reply(3605, 'm2', usage(7), [use]),
    result(3620),
    reply(3630, 'm3', usage(3)),
  ]));
  assert.deepEqual(run, { model: 'model-x', seconds: 30, out: 10, in: 2, cached: 0, tools: 1 });
});

test('止められたまま終わった記録は、応答のあった最後の依頼を数え、待っていた時間を足さない', () => {
  const run = claudeRun(transcript([ask(0), reply(10, 'm1', usage(100), [use]), result(15), ask(20, [{ type: 'text', text: '[Request interrupted by user]' }]), { type: 'attachment', timestamp: at(9000) }]));
  assert.equal(run.seconds, 15);
  assert.equal(run.out, 100);
});

test('読めない行、ほかの種類の行、欠けた値があっても数える', () => {
  const run = claudeRun(transcript([
    'broken line',
    { type: 'api-request-blob', message: { role: 'assistant', content: [use], usage: usage(999) } },
    ask(0),
    { type: 'assistant', timestamp: at(5), message: { id: 'm1', role: 'assistant', content: 'x', usage: { output_tokens: 4, cache_creation_input_tokens: null } } },
    { type: 'assistant', timestamp: 'not a time', message: { role: 'assistant', content: [] } },
  ]));
  assert.deepEqual(run, { model: undefined, seconds: 5, out: 4, in: 0, cached: 0, tools: 0 });
});

test('記録が無いとき、応答が 1 つも無いときは、数えない', () => {
  assert.equal(claudeRun(path.join(dir, 'missing.jsonl')), null);
  assert.equal(claudeRun(transcript([ask(0)])), null);
  assert.equal(claudeRun(transcript([''])), null);
});

test('家のディレクトリーを ~ で書いた場所も読む', () => {
  const home = os.homedir();
  const inside = fs.mkdtempSync(path.join(home, '.dotagents-usage-test-'));
  try {
    fs.writeFileSync(path.join(inside, 'a.jsonl'), [ask(0), reply(1, 'm1', usage(2))].map((row) => JSON.stringify(row)).join('\n'));
    assert.equal(claudeRun(`~/${path.relative(home, inside)}/a.jsonl`).out, 2);
  } finally {
    fs.rmSync(inside, { recursive: true, force: true });
  }
});
