// hook の受け口。Claude Code と Codex は同じ入出力(stdin の JSON と hookSpecificOutput)を使い、Antigravity は別の形を使う。
//
//   node hook.mjs <claude|codex> <session|subagent|tool>
//   node hook.mjs antigravity <session|tool>
//
// ここは、ホストの言葉を判定の言葉に直すだけにする。判定は guard.mjs、文は context.mjs が持つ。
// 受け口の誤りで作業そのものを止めない。読めない入力と例外は、飲み込んで通す。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { contextFor } from './context.mjs';
import { decide, roleOf } from './guard.mjs';
import { CODEX_MARK, codexAgent, roles } from './roles.mjs';
import { PLACED, placedProject } from './root.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

const roleFrom = (input) => roleOf({ agentId: input.agent_id, agentType: input.agent_id ? input.agent_type : undefined });

// 書き換えたあとの全文。`dotagents.jsonc` の書き換えが、確認ルールを動かすかどうかを見るために使う。
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

// Codex は plugin でエージェントを運べない。個人の環境にインストールしたときは、エージェントの定義から導いた TOML を、
// 利用者の設定に置き、バージョンが変わったら置き直す。リポジトリーに置いたときは、CLI が .codex/agents/ に置くので、ここは動かさない。
// 手で置く手順にすると、plugin のバージョンとエージェントの定義がずれる。書き換えるのは、無いファイル、印のあるファイル、
// 印を入れる前のバージョンが書いた中身と一致するファイルだけである。同じ名前で利用者が置いたファイルは上書きしない。
export function syncCodexAgents(home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')) {
  const dir = path.join(home, 'agents');
  for (const role of roles()) {
    const { file, content, legacy } = codexAgent(role);
    const target = path.join(dir, file);
    let current = null;
    try {
      current = fs.readFileSync(target, 'utf8');
    } catch {}
    if (current === content) continue;
    if (current !== null && !current.startsWith(`${CODEX_MARK}\n`) && current !== legacy) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, content);
  }
}

// 1 回のツールの呼び出しを、判定に掛ける要求の並びに直す。
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
    return [{ ...base, tool: 'shell', command: toolInput.command }];
  }
  const file = toolInput.file_path ?? toolInput.notebook_path;
  if (EDIT_TOOLS.has(name) && typeof file === 'string') return [{ ...base, tool: 'edit', file, after: afterOf(name, toolInput, path.resolve(cwd, file)) }];
  if (typeof name === 'string' && name.startsWith('mcp__')) return [{ ...base, tool: 'connector', name }];
  return [];
}

// ---------------------------------------------------------------- Antigravity
//
// 形は資料による(https://antigravity.google/docs/hooks/)。実機では確かめていない。
// - cwd と、どのエージェントからの呼び出しかは来ない。シェルはツールの Cwd、ほかは最初のワークスペースで読む。hook そのものは
//   plugin の根で動くので、process.cwd() は使わない。
// - ロールは見分けられないので、常にオーケストレーターとして判定する。サブエージェントの外部に影響する操作も、止めずに利用者に確かめる。
// - 既定のルールのうちどのロールにも入る部分は、plugin のルール(rules/AGENTS.md)がどのエージェントにも入れる。hook が入れるのは、メインのセッションだけの部分(「(続き)」)と、プロジェクトの設定である。

const ANTIGRAVITY_EDITS = new Set(['write_to_file', 'replace_file_content', 'multi_replace_file_content']);

const antigravityCwd = (input) => {
  const args = input.toolCall?.args ?? {};
  if (typeof args.Cwd === 'string' && args.Cwd) return args.Cwd;
  const [workspace] = Array.isArray(input.workspacePaths) ? input.workspacePaths : [];
  return typeof workspace === 'string' && workspace ? workspace : process.cwd();
};

// 書き換えたあとの全文。置き換える文字列が 1 か所に決まらないとき(行の範囲で選ぶとき)は、分からないものとして返す。
// 分からなければ、判定は確認ルールが動くものとして扱う。ReplacementChunks の中の形は、資料に無いので、replace_file_content と同じ名前で読む。
function antigravityAfter(name, args, file) {
  if (name === 'write_to_file') return typeof args.CodeContent === 'string' ? args.CodeContent : undefined;
  const chunks = name === 'replace_file_content' ? [args] : Array.isArray(args.ReplacementChunks) ? args.ReplacementChunks : [];
  if (!chunks.length) return undefined;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  for (const chunk of chunks) {
    if (typeof chunk?.TargetContent !== 'string' || !chunk.TargetContent || typeof chunk.ReplacementContent !== 'string') return undefined;
    const parts = text.split(chunk.TargetContent);
    if (parts.length < 2 || (parts.length > 2 && chunk.AllowMultiple !== true)) return undefined;
    text = parts.join(chunk.ReplacementContent);
  }
  return text;
}

export function antigravityRequests(input) {
  const name = input.toolCall?.name;
  const args = input.toolCall?.args ?? {};
  const cwd = antigravityCwd(input);
  // 確かめる画面は、Antigravity が出す(資料による)。
  const base = { cwd, role: 'orchestrator', canAsk: true };
  if (name === 'run_command' && typeof args.CommandLine === 'string') return [{ ...base, tool: 'shell', command: args.CommandLine }];
  if (ANTIGRAVITY_EDITS.has(name) && typeof args.TargetFile === 'string') {
    return [{ ...base, tool: 'edit', file: args.TargetFile, after: antigravityAfter(name, args, path.resolve(cwd, args.TargetFile)) }];
  }
  return [];
}

// PreToolUse は decision を必ず返す。通すときは allow を返す。allow は、ほかの hook と既定の許可の流れに任せる。
// auto_approve は、利用者に確かめるはずの呼び出しを確かめずに通すので返さない。
// 確かめるときは force_ask を返す。ask は、利用者が前に「常に許可」した操作を確かめずに通すからである。
export const ANTIGRAVITY_PASS = { decision: 'allow' };

function antigravity(event, input) {
  const cwd = antigravityCwd(input);
  if (yields(cwd)) return event === 'tool' ? ANTIGRAVITY_PASS : null;
  if (event === 'session') return { injectSteps: [{ systemMessage: { systemMessage: contextFor({ role: 'orchestrator', cwd, shared: false }) } }] };
  if (event !== 'tool') return null;
  for (const request of antigravityRequests(input)) {
    const result = decide(request);
    if (!result) continue;
    return { decision: result.decision === 'ask' ? 'force_ask' : 'deny', reason: result.reason };
  }
  return ANTIGRAVITY_PASS;
}

// 個人の環境にインストールした plugin は、dotagents を置いたリポジトリーの中では何もしない。両方が動くと、同じ文を 2 回読み込ませ、
// 同じ操作を 2 回確かめる。リポジトリーに置いたものは、チームがそろえたバージョンなので、そちらに譲る。
// 譲るかは、置いたファイルの記録の有無だけで決める。リポジトリーに置いたものが動かない間(Codex で /hooks の承認の前など)は、
// どちらも動かない。README と CLI の表示が、承認の手順を伝える。
const yields = (cwd) => !PLACED && placedProject(cwd) !== null;

export function handle(host, event, input) {
  if (host === 'antigravity') return antigravity(event, input);
  const cwd = input.cwd ?? process.cwd();
  if (yields(cwd)) return null;
  if (event === 'session' || event === 'subagent') {
    if (host === 'codex' && event === 'session' && !PLACED) syncCodexAgents();
    // Claude Code は、サブエージェントのコンテキストを作り直したときにも、そのサブエージェントの中でセッションの開始を知らせる。
    // その知らせにはエージェントの ID が付く。ID が付いた知らせにメインのセッションだけの部分を返すと、作り直しのあと、サブエージェントがオーケストレーターとして振る舞う。
    const role = event === 'session' && !input.agent_id ? 'orchestrator' : roleOf({ agentId: input.agent_id ?? 'subagent', agentType: input.agent_type });
    return { hookSpecificOutput: { hookEventName: input.hook_event_name ?? (event === 'session' ? 'SessionStart' : 'SubagentStart'), additionalContext: contextFor({ role, cwd }) } };
  }
  if (event === 'tool') {
    for (const request of requests(host, input)) {
      const result = decide(request);
      if (!result) continue;
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: result.reason } };
    }
    return null;
  }
  return null;
}

function main() {
  const [host, event] = process.argv.slice(2);
  // Antigravity の PreToolUse は、読めない入力と例外でも決定を返す。返さないときの扱いは、資料に無い。
  const fallback = host === 'antigravity' && event === 'tool' ? ANTIGRAVITY_PASS : null;
  const write = (output) => {
    if (output) process.stdout.write(JSON.stringify(output));
  };
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    if (!input || typeof input !== 'object') throw new Error('入力がオブジェクトではない');
  } catch {
    write(fallback);
    return;
  }
  try {
    write(handle(host, event, input));
  } catch {
    write(fallback);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
