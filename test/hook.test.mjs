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
  assert.match(builder.additionalContext, /175 秒/);
  assert.equal(fs.existsSync(path.join(codexHome, 'agents')), false, 'Claude Code のセッションでは Codex の設定に触れない');
  assert.match(run('codex', 'session', { cwd }).additionalContext, /# 核/);
  // Codex は plugin で役を運べないので、セッションの開始で役の定義を置く。
  const agent = path.join(codexHome, 'agents', 'dotagents-builder.toml');
  assert.match(fs.readFileSync(agent, 'utf8'), /^name = "dotagents-builder"/);
  fs.writeFileSync(agent, 'stale');
  run('codex', 'session', { cwd });
  assert.match(fs.readFileSync(agent, 'utf8'), /^name = "dotagents-builder"/);
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

test('サブエージェントの外へ届く操作と、長い上限を止める', () => {
  const cwd = project();
  const worker = run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'npm publish' } });
  assert.equal(worker.permissionDecision, 'deny');
  const paced = run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test', timeout: 600000 } });
  assert.equal(paced.permissionDecision, 'deny');
  assert.equal(run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'npm test', timeout: 600000 } }), null);
  // --agent で始めた対話のセッションは、役の名前を持つが、サブエージェントではない。
  assert.equal(run('claude', 'tool', { cwd, agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test', timeout: 600000 } }), null);
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
  assert.ok(lines.every((entry) => !JSON.stringify(entry).includes('npm publish')), 'コマンドの文字列は残さない');
});
