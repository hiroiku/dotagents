import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('../plugin/src/hook.mjs', import.meta.url));
// 入れ方として知らせる実行は、cli/ が配る名前の init である。
const INSTALL = `npx ${JSON.parse(fs.readFileSync(new URL('../cli/package.json', import.meta.url), 'utf8')).name} init`;
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

test('dotagents.json の無いリポジトリーで Claude Code のセッションを始めると、利用者の画面に入れ方を知らせる', () => {
  const raw = (host, event, input) => JSON.parse(spawnSync(process.execPath, [HOOK, host, event], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, DOTAGENTS_HOME: home, CODEX_HOME: codexHome } }).stdout);
  const repo = project();
  fs.mkdirSync(path.join(repo, '.git'));
  assert.ok(raw('claude', 'session', { cwd: repo, hook_event_name: 'SessionStart', source: 'startup' }).systemMessage.includes(INSTALL));
  assert.equal(raw('claude', 'session', { cwd: repo, hook_event_name: 'SessionStart', source: 'compact' }).systemMessage, undefined);
  assert.equal(raw('claude', 'subagent', { cwd: repo, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'dotagents:builder' }).systemMessage, undefined);
  const declared = project({});
  fs.mkdirSync(path.join(declared, '.git'));
  assert.equal(raw('claude', 'session', { cwd: declared, hook_event_name: 'SessionStart', source: 'startup' }).systemMessage, undefined);
});

test('セッションの開始ではオーケストレーターの文を、サブエージェントの開始ではそのサブエージェントの文を返す', () => {
  const cwd = project({ decisions: ['決定 A'] });
  const orchestrator = run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(orchestrator.hookEventName, 'SessionStart');
  assert.match(orchestrator.additionalContext, /# オーケストレーター/);
  assert.match(orchestrator.additionalContext, /決定 A/);
  const builder = run('claude', 'subagent', { cwd, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'dotagents:builder' });
  assert.equal(builder.hookEventName, 'SubagentStart');
  assert.doesNotMatch(builder.additionalContext, /# オーケストレーター/);
  assert.doesNotMatch(builder.additionalContext, /上限/);
  assert.equal(fs.existsSync(path.join(codexHome, 'agents')), false, 'Claude Code のセッションでは Codex の設定に触れない');
  assert.match(run('codex', 'session', { cwd }).additionalContext, /# 共通ルール/);
  // Codex は plugin でエージェントを運べないので、セッションの開始でエージェントの定義を置く。
  const agent = path.join(codexHome, 'agents', 'dotagents-builder.toml');
  assert.match(fs.readFileSync(agent, 'utf8'), /^name = "dotagents-builder"/);
  fs.writeFileSync(agent, 'stale');
  run('codex', 'session', { cwd });
  assert.match(fs.readFileSync(agent, 'utf8'), /^name = "dotagents-builder"/);
});

test('サブエージェントの文脈が作り直されたときは、オーケストレーターの文ではなく、そのサブエージェントの文を返す', () => {
  const cwd = project();
  // Claude Code は、作り直しのあと、サブエージェントの中でセッションの開始を知らせる。エージェントの ID と種類が付く。
  const rebuilt = (agentType) => run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'compact', agent_id: 'a1', agent_type: agentType });
  const start = (agentType) => run('claude', 'subagent', { cwd, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: agentType });
  for (const agentType of ['general-purpose', 'dotagents:builder', 'dotagents:reviewer']) {
    const output = rebuilt(agentType);
    assert.equal(output.hookEventName, 'SessionStart');
    assert.doesNotMatch(output.additionalContext, /# オーケストレーター/, agentType);
    assert.equal(output.additionalContext, start(agentType).additionalContext, `${agentType}: 始まったときと同じ文`);
  }
  // エージェントとして起こしたメインのセッション(claude --agent)は、ID を持たない。オーケストレーターのままである。
  assert.match(run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'compact', agent_type: 'general-purpose' }).additionalContext, /# オーケストレーター/);
});

test('Claude Code では確かめ、Codex では止める', () => {
  const cwd = project();
  const input = { cwd, tool_name: 'Bash', tool_input: { command: 'gh release create v1' } };
  assert.equal(run('claude', 'tool', input).permissionDecision, 'ask');
  const codex = run('codex', 'tool', input);
  assert.equal(codex.permissionDecision, 'deny');
  assert.match(codex.permissionDecisionReason, /DOTAGENTS_CONFIRMED=1/);
  assert.equal(run('codex', 'tool', { ...input, tool_input: { command: 'DOTAGENTS_CONFIRMED=1 gh release create v1' } }), null);
});

test('サブエージェントの外へ届く操作と、オーケストレーターが回すチェックを止める', () => {
  const cwd = project({ checks: { push: 'npm test' } });
  const worker = run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'gh release create v1' } });
  assert.equal(worker.permissionDecision, 'deny');
  const paced = run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test' } });
  assert.equal(paced.permissionDecision, 'deny');
  // 絞った実行は、長い時間を見込んでいても通す。時間では止めない。
  assert.equal(run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test -- a.spec.ts', timeout: 600000 } }), null);
  assert.equal(run('claude', 'tool', { cwd, agent_id: 'a1', agent_type: 'general-purpose', tool_name: 'Bash', tool_input: { command: 'npm test', timeout: 600000 } }), null);
  // --agent で始めた対話のセッションは、エージェントの名前を持つが、サブエージェントではない。
  assert.equal(run('claude', 'tool', { cwd, agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'npm test', timeout: 600000 } }), null);
});

test('道具の呼び出しが続いても、時間を理由に文を足さない', () => {
  const cwd = project();
  for (let i = 0; i < 3; i += 1) {
    assert.equal(run('claude', 'tool', { cwd, agent_id: 'a2', agent_type: 'dotagents:builder', tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
  }
  assert.equal(fs.existsSync(path.join(home, 'state')), false, 'ロールごとの状態を持たない');
});

test('サブエージェントが止まったときに、使った時間とトークンを記録に残す', () => {
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
  assert.equal(run('claude', 'stopped', stop), null, 'サブエージェントの終わり方を変えない');
  // 名前の無いエージェント(ホストが自分の機能のために走らせたもの)と、読めない記録は数えない。
  assert.equal(run('claude', 'stopped', { ...stop, agent_type: '' }), null);
  assert.equal(run('claude', 'stopped', { ...stop, agent_transcript_path: path.join(home, 'missing.jsonl') }), null);
  const entries = fs.readdirSync(path.join(home, 'log')).flatMap((name) => fs.readFileSync(path.join(home, 'log', name), 'utf8').trim().split('\n').map((line) => JSON.parse(line))).filter((entry) => entry.event === 'role');
  assert.equal(entries.length, 1);
  const { t, ...entry } = entries[0];
  assert.deepEqual(entry, { host: 'claude', event: 'role', project: path.basename(cwd), role: 'builder', agentType: 'dotagents:builder', model: 'model-x', seconds: 60, out: 100, in: 200, cached: 2000, tools: 1 });
});

test('編集の道具は、dotagents.json と指示ファイルのときだけ確かめる', () => {
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
  assert.ok(lines.every((entry) => !/gh release create v1|secret-command|依頼の文/.test(JSON.stringify(entry))), 'コマンドの文字列も、依頼の文も残さない');
});

test('スキルの読み込みは、判定せずに数える', () => {
  const cwd = project();
  assert.equal(run('claude', 'tool', { cwd, tool_name: 'Skill', tool_input: { skill: 'dotagents:releases' } }), null);
  const lines = fs.readFileSync(path.join(home, 'log', fs.readdirSync(path.join(home, 'log'))[0]), 'utf8');
  assert.match(lines, /"event":"skill","project":"[^"]+","role":"orchestrator","name":"releases"/);
});

// 8.x の写しが読み込まれているかは、ファイルの有無からは分からない(信頼されていないフォルダー、下のディレクトリーで
// 始めたセッション、写しを読まないホスト)。譲ると、どちらも働かない場合ができる。
test('プロジェクトに 8.x の写しが残っていても、受け口は譲らない', () => {
  const cwd = project();
  fs.mkdirSync(path.join(cwd, '.claude', 'skills', 'dotagents'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.claude', 'skills', 'dotagents', 'VENDORED.json'), '{}');
  const nested = path.join(cwd, 'packages', 'app');
  fs.mkdirSync(nested, { recursive: true });
  for (const dir of [cwd, nested]) {
    for (const host of ['claude', 'codex']) {
      assert.match(run(host, 'session', { cwd: dir }).additionalContext, /# 共通ルール/);
      assert.notEqual(run(host, 'tool', { cwd: dir, tool_name: 'Bash', tool_input: { command: 'gh release create v1' } }), null);
    }
  }
});
