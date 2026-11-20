// Pi の受け口。核(src/)の関数を、Pi の拡張の事象へつなぐ。判定や文の組み立ては核が持ち、ここには持たない。
//
// 受け口は 4 つ: 常設の文、道具の呼び出しの前の判定、編集の直後の検査、役を別の pi で走らせる道具。
// 仕組みの側の例外で利用者の作業を止めないため、どの受け口も例外は記録して通す。

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { editCheck } from '../../src/check.mjs';
import { contextFor } from '../../src/context.mjs';
import { decide } from '../../src/guard.mjs';
import { record } from '../../src/log.mjs';
import { readRole } from '../../src/roles.mjs';
import { piRun } from '../../src/usage.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHELL_TOOLS = new Set(['bash', 'powershell']);
const ROLES = ['builder', 'reviewer'];
// 役の定義(agents/*.md)の tools を、Pi の道具の名前に直す。定義に tools が無い役は、道具を絞らない。
const PI_TOOLS = { Read: ['read', 'ls'], Glob: ['find'], Grep: ['grep'], Bash: ['bash'], Edit: ['edit'], Write: ['write'] };
const OUTPUT_LIMIT = 50000;

// 子のプロセスには DOTAGENTS_ROLE で役を渡す。無ければ進める役である。
const roleNow = () => process.env.DOTAGENTS_ROLE || 'lead';

const fail = (error) => record({ host: 'pi', event: 'error', message: error instanceof Error ? error.message : String(error) });

// 例外は記録して通す。undefined を返せば、呼び出しは止まらず、結果も変わらない。
// 同じハーネスが 2 つ読み込まれることは、Pi が package の同一性で防ぐ。ここでは防がない。
const safe = (handler) => async (event, ctx) => {
  try {
    return await handler(event, ctx);
  } catch (error) {
    fail(error);
    return undefined;
  }
};

// edit の入力(edits[].oldText/newText)を適用した全文。一意に当たらないなら、推測せず undefined にする。
// 全文が分からないとき、判定の側が線が動くものとして確かめる。
function afterOf(event, file) {
  const { toolName, input } = event;
  if (toolName === 'write') return typeof input.content === 'string' ? input.content : undefined;
  if (toolName !== 'edit' || !Array.isArray(input.edits)) return undefined;
  try {
    const original = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replaceAll('\r\n', '\n');
    const spans = input.edits.map(({ oldText, newText }) => {
      const start = original.indexOf(oldText);
      if (typeof oldText !== 'string' || typeof newText !== 'string' || !oldText || start < 0 || original.indexOf(oldText, start + 1) >= 0) throw new Error('unmatched');
      return { start, end: start + oldText.length, newText };
    });
    let text = original;
    for (const span of spans.sort((a, b) => b.start - a.start)) text = text.slice(0, span.start) + span.newText + text.slice(span.end);
    return text;
  } catch {
    return undefined;
  }
}

async function guard(event, ctx) {
  const role = roleNow();
  const isShell = SHELL_TOOLS.has(event.toolName) && typeof event.input?.command === 'string';
  const isEdit = (event.toolName === 'write' || event.toolName === 'edit') && typeof event.input?.path === 'string';
  if (!isShell && !isEdit) return undefined;
  // 確かめる手段が使えるのは、画面のある進める役だけにする。子は誰にも聞けない。
  const canAsk = Boolean(ctx.hasUI) && role === 'lead';
  const request = { cwd: ctx.cwd, role, canAsk };
  if (isShell) {
    Object.assign(request, { tool: 'shell', command: event.input.command });
  } else {
    const file = path.resolve(ctx.cwd, event.input.path);
    const after = afterOf(event, file);
    Object.assign(request, { tool: 'edit', file }, after === undefined ? {} : { after });
  }
  const verdict = decide(request);
  if (!verdict) return undefined;
  record({ host: 'pi', event: 'guard', project: path.basename(ctx.cwd), role, decision: verdict.decision, kind: verdict.kind });
  if (verdict.decision === 'deny') return { block: true, reason: verdict.reason };
  if (verdict.decision === 'ask') {
    const target = isShell ? event.input.command : event.input.path;
    const ok = await ctx.ui.confirm('確認が必要な操作', `${target}\n\n${verdict.reason}`);
    if (!ok) return { block: true, reason: `利用者が許可しませんでした。${verdict.reason}` };
  }
  return undefined;
}

// 検査は、書き換えが成功したときだけ回す。落ちた出力は、結果の本文の末尾に足してモデルへ返す。
async function afterEdit(event, ctx) {
  if ((event.toolName !== 'write' && event.toolName !== 'edit') || event.isError || typeof event.input?.path !== 'string') return undefined;
  const text = editCheck({ file: path.resolve(ctx.cwd, event.input.path), cwd: ctx.cwd });
  if (!text) return undefined;
  return { content: [...(event.content ?? []), { type: 'text', text }] };
}

// 役の定義。本文を子の指示に、tools を子の道具の絞り込みに使う。モデルの名前はホストごとに違うので使わない。
export function roleOfName(role) {
  const definition = readRole(path.join(PLUGIN_ROOT, 'agents', `${role}.md`));
  const tools = definition.tools ? [...new Set(definition.tools.split(',').flatMap((name) => PI_TOOLS[name.trim()] ?? []))] : null;
  return { body: definition.body, tools };
}

// 実行中の pi と同じものを子にも使う。見つからなければ PATH の pi に任せる。
function piInvocation(args) {
  const script = process.argv[1];
  if (script && fs.existsSync(script)) return { command: process.execPath, args: [script, ...args] };
  return { command: 'pi', args };
}

// JSON モードの出力から、最後の assistant の本文を取る。
function finalText(messages) {
  for (const message of messages.toReversed()) {
    if (message.role !== 'assistant') continue;
    const text = (message.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim();
    if (text) return text;
  }
  return '';
}

async function runRole({ role, task, cwd }, signal, ctx) {
  if (!ROLES.includes(role)) throw new Error(`role は ${ROLES.join(' か ')} のどちらかです: ${role}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-pi-'));
  try {
    const definition = roleOfName(role);
    const promptFile = path.join(dir, `${role}.md`);
    fs.writeFileSync(promptFile, definition.body, { mode: 0o600 });
    const args = ['--mode', 'json', '-p', '--no-session', '--append-system-prompt', promptFile];
    // 子は親のモデルと思考の度合いを引き継ぐ
    if (ctx.model) args.push('--model', `${ctx.model.provider}/${ctx.model.id}`);
    if (ctx.thinkingLevel) args.push('--thinking', ctx.thinkingLevel);
    if (definition.tools?.length) args.push('--tools', definition.tools.join(','));
    // 子は印字モードで聞けない。親が信頼済みのときだけ、プロジェクトの拡張と宣言も子へ効かせる
    if (ctx.isProjectTrusted?.()) args.push('--approve');
    args.push(`Task: ${task}`);
    const invocation = piInvocation(args);
    const messages = [];
    const started = Date.now();
    let stderr = '';
    const outcome = await new Promise((resolve) => {
      const child = spawn(invocation.command, invocation.args, { cwd, env: { ...process.env, DOTAGENTS_ROLE: role }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let buffer = '';
      const line = (text) => {
        try {
          const event = JSON.parse(text);
          if (event.type === 'message_end' && event.message?.role === 'assistant') messages.push(event.message);
        } catch {}
      };
      child.stdout.on('data', (data) => {
        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        lines.forEach(line);
      });
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      child.on('error', (error) => resolve({ error }));
      child.on('close', (code, killed) => {
        if (buffer.trim()) line(buffer);
        resolve({ code, killed });
      });
      const abort = () => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000).unref();
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
    // 役が使った時間とトークンを残す。失敗した実行も、使った分は数える。
    record({ host: 'pi', event: 'role', project: path.basename(cwd), role, agentType: role, ...piRun(messages, Math.round((Date.now() - started) / 1000)) });
    const last = messages.at(-1);
    const answer = finalText(messages);
    if (outcome.error) throw new Error(`子の pi を起動できませんでした: ${outcome.error.message}`);
    if (outcome.killed || outcome.code !== 0 || last?.stopReason === 'error' || last?.stopReason === 'aborted') {
      throw new Error(`${role} の実行が失敗しました(終了 ${outcome.code ?? outcome.killed})。${last?.errorMessage ?? ''}\n${answer || stderr.trim()}`.trim());
    }
    return answer.length > OUTPUT_LIMIT ? `${answer.slice(0, OUTPUT_LIMIT)}\n…(長いので切りました)` : answer || '(出力なし)';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export default function (pi) {
  const recorded = new Set();
  // 文は役とプロジェクトで決まる定数にして、プロンプトの先頭を毎回同じに保つ
  pi.on('before_agent_start', safe((event, ctx) => {
    const role = roleNow();
    const text = contextFor({ role, cwd: ctx.cwd });
    // 文はエージェントの実行のたびに足すが、記録は役ごとに 1 回にする。
    if (!recorded.has(role)) record({ host: 'pi', event: 'context', project: path.basename(ctx.cwd), role, chars: text.length });
    recorded.add(role);
    return { systemPrompt: `${event.systemPrompt}\n\n${text}` };
  }));
  pi.on('tool_call', safe(guard));
  pi.on('tool_result', safe(afterEdit));

  // 役の子が、さらに子を呼べないようにする。孫を許すと、確かめる手段の無い層が深くなる。
  if (roleNow() !== 'lead') return;
  pi.registerTool({
    name: 'run_role',
    label: 'Run role',
    description: '役(builder か reviewer)を、別の pi のプロセスで 1 つの依頼として走らせ、最後の報告を返す。依頼の文には、役が必要とする前提をすべて書く。',
    promptSnippet: '役(builder / reviewer)に依頼を渡して走らせる',
    promptGuidelines: ['作る仕事や確かめる仕事を役に任せるときは、run_role を使う。'],
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ROLES, description: '走らせる役' },
        task: { type: 'string', description: '役へ渡す依頼' },
        cwd: { type: 'string', description: '役の作業ディレクトリ(省略時は今のもの)' },
      },
      required: ['role', 'task'],
      additionalProperties: false,
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = await runRole({ role: params.role, task: params.task, cwd: path.resolve(ctx.cwd, params.cwd ?? '.') }, signal, ctx);
      return { content: [{ type: 'text', text }], details: {} };
    },
  });
}
