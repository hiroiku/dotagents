import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codexAgent, roles } from '../plugin/src/roles.mjs';
import { PLACED_DIR, PLACED_RECORD } from '../plugin/src/root.mjs';

const HOOK = fileURLToPath(new URL('../plugin/src/hook.mjs', import.meta.url));
const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-codex-'));

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-hook-'));
  if (declaration) {
    fs.mkdirSync(path.join(dir, '.agents'));
    fs.writeFileSync(path.join(dir, '.agents', 'dotagents.jsonc'), JSON.stringify(declaration));
  }
  return dir;
}

// 受け口は、ホストが呼ぶのと同じ形(別のプロセス、stdin の JSON)で確かめる。
function run(host, event, input) {
  const result = spawnSync(process.execPath, [HOOK, host, event], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : null;
}

test('dotagents.jsonc の無いリポジトリーでも、Claude Code のどの開始でも、利用者の画面への知らせを返さない', () => {
  const raw = (host, event, input) => JSON.parse(spawnSync(process.execPath, [HOOK, host, event], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CODEX_HOME: codexHome } }).stdout);
  const repo = project();
  fs.mkdirSync(path.join(repo, '.git'));
  for (const source of ['startup', 'resume', 'compact']) assert.equal(raw('claude', 'session', { cwd: repo, hook_event_name: 'SessionStart', source }).systemMessage, undefined, source);
  assert.equal(raw('claude', 'subagent', { cwd: repo, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'dotagents:builder' }).systemMessage, undefined);
});

test('セッションの開始ではメインのセッションの既定のルールを、サブエージェントの開始ではそのサブエージェントの文を返す', () => {
  const cwd = project({ decisions: ['決定 A'] });
  const orchestrator = run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'startup' });
  assert.equal(orchestrator.hookEventName, 'SessionStart');
  assert.match(orchestrator.additionalContext, /## 進行/);
  assert.match(orchestrator.additionalContext, /決定 A/);
  const builder = run('claude', 'subagent', { cwd, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'dotagents:builder' });
  assert.equal(builder.hookEventName, 'SubagentStart');
  assert.doesNotMatch(builder.additionalContext, /## 進行/);
  assert.doesNotMatch(builder.additionalContext, /上限/);
  assert.equal(fs.existsSync(path.join(codexHome, 'agents')), false, 'Claude Code のセッションでは Codex の設定に触れない');
  assert.match(run('codex', 'session', { cwd }).additionalContext, /# dotagents の既定のルール/);
  // Codex は plugin でエージェントを運べないので、セッションの開始でエージェントの定義を置く。
  const agent = path.join(codexHome, 'agents', 'dotagents-builder.toml');
  assert.match(fs.readFileSync(agent, 'utf8'), /^name = "dotagents-builder"/m);
  // dotagents が書いたファイル(印がある、または印を入れる前の中身と一致する)は書き換え、利用者が置いたファイルは残す。
  const { content, legacy } = codexAgent(roles().find((role) => role.name === 'builder'), 'plugin');
  for (const old of [`${content.split('\n')[0]}\nstale\n`, legacy]) {
    fs.writeFileSync(agent, old);
    run('codex', 'session', { cwd });
    assert.equal(fs.readFileSync(agent, 'utf8'), content);
  }
  fs.writeFileSync(agent, 'name = "dotagents-builder"\n# 利用者が書いた定義\n');
  run('codex', 'session', { cwd });
  assert.equal(fs.readFileSync(agent, 'utf8'), 'name = "dotagents-builder"\n# 利用者が書いた定義\n');
});

test('サブエージェントの文脈が作り直されたときは、メインのセッションの既定のルールではなく、そのサブエージェントの文を返す', () => {
  const cwd = project();
  // Claude Code は、作り直しのあと、サブエージェントの中でセッションの開始を知らせる。エージェントの ID と種類が付く。
  const rebuilt = (agentType) => run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'compact', agent_id: 'a1', agent_type: agentType });
  const start = (agentType) => run('claude', 'subagent', { cwd, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: agentType });
  for (const agentType of ['general-purpose', 'dotagents:builder', 'dotagents:reviewer']) {
    const output = rebuilt(agentType);
    assert.equal(output.hookEventName, 'SessionStart');
    assert.doesNotMatch(output.additionalContext, /## 進行/, agentType);
    assert.equal(output.additionalContext, start(agentType).additionalContext, `${agentType}: 始まったときと同じ文`);
  }
  // エージェントとして起こしたメインのセッション(claude --agent)は、ID を持たない。オーケストレーターのままである。
  assert.match(run('claude', 'session', { cwd, hook_event_name: 'SessionStart', source: 'compact', agent_type: 'general-purpose' }).additionalContext, /## 進行/);
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

test('サブエージェントの外部に影響する操作と、オーケストレーターが回すチェックを止める', () => {
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

test('編集の道具は、dotagents.jsonc と指示ファイルのときだけ確かめる', () => {
  const cwd = project({ delegated: ['push:develop'], decisions: ['a'] });
  const file = path.join(cwd, '.agents', 'dotagents.jsonc');
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
      assert.match(run(host, 'session', { cwd: dir }).additionalContext, /# dotagents の既定のルール/);
      assert.notEqual(run(host, 'tool', { cwd: dir, tool_name: 'Bash', tool_input: { command: 'gh release create v1' } }), null);
    }
  }
});

// リポジトリーに置いたもの(CLI が書いた記録がある)は、チームがそろえたバージョンなので、個人の環境の plugin が譲る。
test('dotagents を置いたリポジトリーの中では、個人の環境にインストールした plugin の hook は何もしない', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-codex-'));
  const cwd = project();
  fs.mkdirSync(path.join(cwd, '.git'));
  fs.mkdirSync(path.join(cwd, PLACED_DIR), { recursive: true });
  fs.writeFileSync(path.join(cwd, PLACED_DIR, PLACED_RECORD), '{}');
  const nested = path.join(cwd, 'packages', 'app');
  fs.mkdirSync(nested, { recursive: true });
  const raw = (host, event, input) => {
    const result = spawnSync(process.execPath, [HOOK, host, event], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CODEX_HOME: home } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout ? JSON.parse(result.stdout) : null;
  };
  const release = 'gh release create v1';
  for (const host of ['claude', 'codex']) {
    assert.equal(raw(host, 'session', { cwd: nested, hook_event_name: 'SessionStart' }), null, host);
    assert.equal(raw(host, 'subagent', { cwd: nested, agent_id: 'a1', agent_type: 'dotagents:builder' }), null, host);
    assert.equal(raw(host, 'tool', { cwd: nested, tool_name: 'Bash', tool_input: { command: release } }), null, host);
  }
  assert.deepEqual(fs.readdirSync(home), [], '個人の環境の Codex の設定にも書かない');
  assert.equal(raw('antigravity', 'session', { workspacePaths: [nested] }), null);
  assert.deepEqual(raw('antigravity', 'tool', { workspacePaths: [nested], toolCall: { name: 'run_command', args: { CommandLine: release, Cwd: nested } } }), { decision: 'allow' });
  // 置いていないリポジトリーでは、これまでどおり動く。
  assert.equal(raw('claude', 'tool', { cwd: project(), tool_name: 'Bash', tool_input: { command: release } }).hookSpecificOutput.permissionDecision, 'ask');
});
