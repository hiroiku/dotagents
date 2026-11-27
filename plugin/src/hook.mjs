// Claude Code と Codex の hook の受け口。2 つのホストは同じ入出力(stdin の JSON と hookSpecificOutput)を使う。
//
//   node hook.mjs <claude|codex> <session|subagent|tool|stopped>
//
// ここは、ホストの言葉を判定の言葉に直すだけにする。判定は guard.mjs、文は context.mjs が持つ。
// 受け口の誤りで作業そのものを止めない。読めない入力と例外は通し、例外は記録に残す。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { contextFor } from './context.mjs';
import { decide, roleOf } from './guard.mjs';
import { record } from './log.mjs';
import { codexAgent, roles } from './roles.mjs';
import { claudeRun } from './usage.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

const roleFrom = (input) => roleOf({ agentId: input.agent_id, agentType: input.agent_id ? input.agent_type : undefined });

// 書き換えたあとの全文。`dotagents.json` の書き換えが、確かめる線を動かすかどうかを見るために使う。
function afterOf(name, toolInput, file) {
  if (name === 'Write') return typeof toolInput.content === 'string' ? toolInput.content : undefined;
  if (name !== 'Edit' || typeof toolInput.old_string !== 'string' || typeof toolInput.new_string !== 'string') return undefined;
  try {
    const current = fs.readFileSync(file, 'utf8');
    return toolInput.replace_all ? current.split(toolInput.old_string).join(toolInput.new_string) : current.replace(toolInput.old_string, () => toolInput.new_string);
  } catch {
    return undefined;
  }
}

// Codex は plugin でエージェントを運べない。エージェントの定義から導いた TOML を、利用者の設定に置き、版が変わったら置き直す。
// 手で置く手順にすると、plugin の版とエージェントの定義がずれる。
export function syncCodexAgents(home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')) {
  const dir = path.join(home, 'agents');
  for (const role of roles()) {
    const { file, content } = codexAgent(role);
    const target = path.join(dir, file);
    let current = null;
    try {
      current = fs.readFileSync(target, 'utf8');
    } catch {}
    if (current === content) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, content);
  }
}

// 1 回の道具の呼び出しを、判定に掛ける要求の並びに直す。
export function requests(host, input) {
  const name = input.tool_name;
  const toolInput = input.tool_input ?? {};
  const cwd = input.cwd ?? process.cwd();
  const role = roleFrom(input);
  // 確かめる画面を出せるのは Claude Code だけである。Codex は ask を受け取ると、止めずに通してしまう。
  const base = { cwd, role, canAsk: host === 'claude' };
  if (host === 'codex' && name === 'apply_patch') {
    return [...String(toolInput.command ?? '').matchAll(PATCH_FILE)].map(([, file]) => ({ ...base, tool: 'edit', file: file.trim() }));
  }
  if (name === 'Bash' && typeof toolInput.command === 'string') {
    return [{ ...base, tool: 'shell', command: toolInput.command, background: toolInput.run_in_background === true }];
  }
  const file = toolInput.file_path ?? toolInput.notebook_path;
  if (EDIT_TOOLS.has(name) && typeof file === 'string') return [{ ...base, tool: 'edit', file, after: afterOf(name, toolInput, path.resolve(cwd, file)) }];
  if (typeof name === 'string' && name.startsWith('mcp__')) return [{ ...base, tool: 'connector', name }];
  return [];
}

export function handle(host, event, input) {
  const cwd = input.cwd ?? process.cwd();
  const project = path.basename(cwd);
  if (event === 'session' || event === 'subagent') {
    if (host === 'codex' && event === 'session') syncCodexAgents();
    // Claude Code は、サブエージェントの文脈を作り直したときにも、そのサブエージェントの中でセッションの開始を知らせる。
    // その知らせにはエージェントの ID が付く。ID が付いた知らせにオーケストレーターの文を返すと、作り直しのあと、サブエージェントがオーケストレーターとして振る舞う。
    const role = event === 'session' && !input.agent_id ? 'orchestrator' : roleOf({ agentId: input.agent_id ?? 'subagent', agentType: input.agent_type });
    const text = contextFor({ role, cwd });
    record({ host, event: 'context', project, role, agentType: input.agent_type, chars: text.length });
    return { hookSpecificOutput: { hookEventName: input.hook_event_name ?? (event === 'session' ? 'SessionStart' : 'SubagentStart'), additionalContext: text } };
  }
  if (event === 'tool') {
    // スキルの読み込みは、判定せずに数えるだけにする。読まれないスキルを見つけるためである。
    if (input.tool_name === 'Skill') {
      record({ host, event: 'skill', project, role: roleFrom(input), name: String(input.tool_input?.skill ?? '').split(':').pop() });
      return null;
    }
    for (const request of requests(host, input)) {
      const result = decide(request);
      if (!result) continue;
      record({ host, event: 'guard', project, role: request.role, agentType: input.agent_type, decision: result.decision, kind: result.kind, targets: result.findings?.map((finding) => `${finding.kind}:${finding.target}`) });
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: result.reason } };
    }
    return null;
  }
  if (event === 'stopped') {
    // エージェントが使った時間とトークンを数えて残す。何も返さないので、終わり方は変わらない。
    // 名前の無いものは、ホストが自分の機能のために走らせたエージェントなので数えない。
    if (!input.agent_type || typeof input.agent_transcript_path !== 'string') return null;
    const run = claudeRun(input.agent_transcript_path);
    if (run) record({ host, event: 'role', project, role: roleOf({ agentId: input.agent_id ?? 'subagent', agentType: input.agent_type }), agentType: input.agent_type, ...run });
    return null;
  }
  return null;
}

function main() {
  const [host, event] = process.argv.slice(2);
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return;
  }
  try {
    const output = handle(host, event, input);
    if (output) process.stdout.write(JSON.stringify(output));
  } catch (error) {
    record({ host, event: 'error', where: event, message: String(error?.message ?? error).slice(0, 300) });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
