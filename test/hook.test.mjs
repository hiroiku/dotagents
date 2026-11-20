import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../plugin/src/hook.mjs', import.meta.url));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-codex-'));

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-hook-'));
  if (declaration) {
    fs.mkdirSync(path.join(dir, '.agents'));
    fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify(declaration));
  }
  return dir;
}

// 受け口は、ホストが呼ぶのと同じ形(別のプロセス、stdin の JSON)で確かめる。
function run(host, event, input) {
  const result = spawnSync(process.execPath, [HOOK, host, event], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: { ...process.env, DOTAGENTS_HOME: home, CODEX_HOME: codexHome } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : null;
}

test('セッションの開始では進める役の文を、サブエージェントの開始では役の文を返す', () => {
  const cwd = project({ decisions: ['決定 A'] });
  const lead = run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(lead.hookEventName, 'SessionStart');
  assert.match(lead.additionalContext, /# 進める役/);
  assert.match(lead.additionalContext, /決定 A/);
  const builder = run('claude', 'subagent', { cwd, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'dotagents:builder' });
  assert.equal(builder.hookEventName, 'SubagentStart');
  assert.doesNotMatch(builder.additionalContext, /# 進める役/);
  assert.doesNotMatch(builder.additionalContext, /上限/);
  assert.equal(fs.existsSync(path.join(codexHome, 'agents')), false, 'Claude Code のセッションでは Codex の設定に触れない');
  assert.match(run('codex', 'session', { cwd }).additionalContext, /# 核/);
  // Codex は plugin で役を運べないので、セッションの開始で役の定義を置く。
  const agent = path.join(codexHome, 'agents', 'dotagents-builder.toml');
  assert.match(fs.readFileSync(agent, 'utf8'), /^name = "dotagents-builder"/);
  fs.writeFileSync(agent, 'stale');
  run('codex', 'session', { cwd });
  assert.match(fs.readFileSync(agent, 'utf8'), /^name = "dotagents-builder"/);
});

test('サブエージェントの文脈が作り直されたときは、進める役の文ではなく、その役の文を返す', () => {
  const cwd = project();
  // Claude Code は、作り直しのあと、サブエージェントの中でセッションの開始を知らせる。役の ID と種類が付く。
  const rebuilt = (agentType) => run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'compact', agent_id: 'a1', agent_type: agentType });
  const start = (agentType) => run('claude', 'subagent', { cwd, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: agentType });
  for (const agentType of ['general-purpose', 'dotagents:builder', 'dotagents:reviewer']) {
    const output = rebuilt(agentType);
    assert.equal(output.hookEventName, 'SessionStart');
    assert.doesNotMatch(output.additionalContext, /# 進める役/, agentType);
    assert.equal(output.additionalContext, start(agentType).additionalContext, `${agentType}: 始まったときと同じ文`);
  }
  // 役として起こしたメインのセッション(claude --agent)は、ID を持たない。進める役のままである。
  assert.match(run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'compact', agent_type: 'general-purpose' }).additionalContext, /# 進める役/);
});

test('Claude Code では確かめ、Codex では止める', () => {
  const cwd = project();
  const input = { cwd, tool_name: 'Bash', tool_input: { command: 'npm publish' } };
  assert.equal(run('claude', 'tool', input).permissionDecision, 'ask');
  const codex = run('codex', 'tool', input);
  assert.equal(codex.permissionDecision, 'deny');
  assert.match(codex.permissionDecisionReason, /DOTAGENTS_CONFIRMED=1/);
  assert.equal(run('codex', 'tool', { ...input, tool_input: { command: 'DOTAGENTS_CONFIRMED=1 npm publish' } }), null);
});

test('サブエージェントの外へ届く操作と、進める役が回す検査を止める', () => {
  const cwd = project({ checks: { push: 'npm test' } });
  const worker = run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'npm publish' } });
  assert.equal(worker.permissionDecision, 'deny');
  const paced = run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test' } });
  assert.equal(paced.permissionDecision, 'deny');
  // 絞った実行は、長い時間を見込んでいても通す。時間では止めない。
  assert.equal(run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test -- a.spec.ts', timeout: 600000 } }), null);
  assert.equal(run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'npm test', timeout: 600000 } }), null);
  // --agent で始めた対話のセッションは、役の名前を持つが、サブエージェントではない。
  assert.equal(run('claude', 'tool', { cwd, agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test', timeout: 600000 } }), null);
});

test('道具の呼び出しが続いても、時間を理由に文を足さない', () => {
  const cwd = project();
  for (let i = 0; i < 3; i += 1) {
    assert.equal(run('claude', 'tool', { cwd, agent_id: 'a2', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
  }
  assert.equal(fs.existsSync(path.join(home, 'state')), false, '役ごとの状態を持たない');
});

test('役が止まったときに、使った時間とトークンを記録に残す', () => {
  const cwd = project();
  const transcript = path.join(home, 'agent-a9.jsonl');
  const usage = { input_tokens: 10, cache_creation_input_tokens: 90, cache_read_input_tokens: 1000, output_tokens: 50 };
  fs.writeFileSync(transcript, [
    { type: 'user', timestamp: '2026-11-20T10:00:00.000Z', message: { role: 'user', content: '依頼の文' } },
    { type: 'assistant', timestamp: '2026-11-20T10:00:05.000Z', message: { id: 'm1', model: 'model-x', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'secret-command' } }], usage } },
    { type: 'user', timestamp: '2026-11-20T10:00:20.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
    { type: 'assistant', timestamp: '2026-11-20T10:01:00.000Z', message: { id: 'm2', model: 'model-x', role: 'assistant', content: [{ type: 'text', text: '報告' }], usage } },
  ].map((row) => JSON.stringify(row)).join('\n'));
  const stop = { cwd, hook_event_name: 'SubagentStop', agent_id: 'a9', agent_type: 'dotagents:builder', agent_transcript_path: transcript };
  assert.equal(run('claude', 'stopped', stop), null, '役の終わり方を変えない');
  // 名前の無いエージェント(ホストが自分の機能のために走らせたもの)と、読めない記録は数えない。
  assert.equal(run('claude', 'stopped', { ...stop, agent_type: '' }), null);
  assert.equal(run('claude', 'stopped', { ...stop, agent_transcript_path: path.join(home, 'missing.jsonl') }), null);
  const entries = fs.readdirSync(path.join(home, 'log')).flatMap((name) => fs.readFileSync(path.join(home, 'log', name), 'utf8').trim().split('\n').map((line) => JSON.parse(line))).filter((entry) => entry.event === 'role');
  assert.equal(entries.length, 1);
  const { t, ...entry } = entries[0];
  assert.deepEqual(entry, { host: 'claude', event: 'role', project: path.basename(cwd), role: 'builder', agentType: 'dotagents:builder', model: 'model-x', seconds: 60, out: 100, in: 200, cached: 2000, tools: 1 });
});

test('編集の道具は、宣言と指示ファイルのときだけ確かめる', () => {
  const cwd = project({ delegated: ['push:develop'], decisions: ['a'] });
  const file = path.join(cwd, '.agents', 'dotagents.json');
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'Edit', tool_input: { file_path: file, old_string: '"a"', new_string: '"a","b"' } }), null);
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'Edit', tool_input: { file_path: file, old_string: 'push:develop', new_string: 'push' } }).permissionDecision, 'ask');
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'Write', tool_input: { file_path: file, content: '{}' } }).permissionDecision, 'ask');
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'Write', tool_input: { file_path: path.join(cwd, 'CLAUDE.md'), content: 'x' } }).permissionDecision, 'ask');
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'Write', tool_input: { file_path: path.join(cwd, 'src.ts'), content: 'x' } }), null);
  assert.equal(run('codex', 'tool', { cwd, tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: AGENTS.md\n@@\n-a\n+b\n*** End Patch' } }).permissionDecision, 'deny');
  assert.equal(run('codex', 'tool', { cwd, tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** End Patch' } }), null);
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'mcp__claude_ai_Gmail__send_message', tool_input: {} }).permissionDecision, 'ask');
});

test('編集のあとの検査は、落ちたときだけ出力を返す', () => {
  const cwd = project({ checks: { edit: 'grep -q ok {file} || { echo "ok が無い: {file}"; exit 1; }' } });
  fs.writeFileSync(path.join(cwd, 'good file.txt'), 'ok\n');
  fs.writeFileSync(path.join(cwd, 'bad.txt'), 'ng\n');
  assert.equal(run('claude', 'edited', { cwd, tool_name: 'Write', tool_input: { file_path: path.join(cwd, 'good file.txt') } }), null);
  const failed = run('claude', 'edited', { cwd, tool_name: 'Edit', tool_input: { file_path: path.join(cwd, 'bad.txt') } });
  assert.equal(failed.hookEventName, 'PostToolUse');
  assert.match(failed.additionalContext, /ok が無い: 'bad.txt'|ok が無い: bad.txt/);
  assert.equal(run('claude', 'edited', { cwd: project(), tool_name: 'Write', tool_input: { file_path: 'x.txt' } }), null);
});

test('読めない入力と、判定に関係しない道具は通す', () => {
  assert.equal(run('claude', 'tool', 'not json'), null);
  assert.equal(run('claude', 'tool', {}), null);
  assert.equal(run('claude', 'tool', { cwd: project(), tool_name: 'Read', tool_input: { file_path: 'AGENTS.md' } }), null);
  assert.equal(run('claude', 'unknown', { cwd: project() }), null);
});

test('確かめた回数と止めた回数が、記録に残る', () => {
  const lines = fs.readdirSync(path.join(home, 'log')).flatMap((name) => fs.readFileSync(path.join(home, 'log', name), 'utf8').trim().split('\n').map((line) => JSON.parse(line)));
  assert.ok(lines.some((entry) => entry.event === 'guard' && entry.decision === 'ask' && entry.kind === 'release'));
  assert.ok(lines.some((entry) => entry.event === 'guard' && entry.decision === 'deny' && entry.kind === 'pace'));
  assert.ok(lines.some((entry) => entry.event === 'context' && entry.role === 'builder'));
  assert.ok(lines.every((entry) => !/npm publish|secret-command|依頼の文/.test(JSON.stringify(entry))), 'コマンドの文字列も、依頼の文も残さない');
});

test('スキルの読み込みは、判定せずに数える', () => {
  const cwd = project();
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'Skill', tool_input: { skill: 'dotagents:flow' } }), null);
  const lines = fs.readFileSync(path.join(home, 'log', fs.readdirSync(path.join(home, 'log'))[0]), 'utf8');
  assert.match(lines, /"event":"skill","project":"[^"]+","role":"lead","name":"flow"/);
});

// 写しが読み込まれているかは、ファイルの有無からは分からない(信頼されていないフォルダー、下のディレクトリーで
// 始めたセッション、写しを読まないホスト)。譲ると、どちらも働かない場合ができる。重なりは、ホストが名前で防ぐ。
test('プロジェクトにハーネスの写しがあっても、受け口は譲らない', () => {
  const cwd = project();
  fs.mkdirSync(path.join(cwd, '.claude', 'skills', 'dotagents'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.claude', 'skills', 'dotagents', 'VENDORED.json'), '{}');
  const nested = path.join(cwd, 'packages', 'app');
  fs.mkdirSync(nested, { recursive: true });
  for (const dir of [cwd, nested]) {
    for (const host of ['claude', 'codex']) {
      assert.match(run(host, 'session', { cwd: dir }).additionalContext, /# 核/);
      assert.notEqual(run(host, 'tool', { cwd: dir, tool_name: 'Bash', tool_input: { command: 'npm publish' } }), null);
    }
  }
});
