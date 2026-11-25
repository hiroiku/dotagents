// 役が 1 回の依頼で使った時間とトークンを数える。上限を掛けるためではない。
//
// 役に渡すか、束を並べるか、確かめを頼むかは、速さや確かさを、利用者の時間と費用で買う決定である。
// 何をどれだけ買ったかを、ハーネスの記録(dotagents のリポジトリーの tools/stats.mjs)で見えるようにする。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const expand = (file) => (file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file);
const count = (value) => (Number.isFinite(value) ? value : 0);

// Claude Code がサブエージェントごとに残す記録(JSONL)から、最後の依頼の分を数える。
//
// - 依頼は、道具の結果ではない user の行で始まる(最初の依頼と、続けて頼まれた依頼)。その行のあとに応答が無ければ、
//   依頼の始まりとは数えない(止められたときの印が、同じ形で残る)。
// - 1 つの応答は、内容のブロックごとに複数の行へ分かれ、どの行も同じ usage を持つ。応答の id ごとに 1 回だけ数える。
// - in は新しく読ませた入力(キャッシュへの書き込みを含む)、cached はキャッシュから読んだ入力である。
export function claudeRun(transcriptPath) {
  let text;
  try {
    text = fs.readFileSync(expand(transcriptPath), 'utf8');
  } catch {
    return null;
  }
  let run = null;
  let opening = null;
  for (const line of text.split('\n')) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Date.parse(entry.timestamp);
    const message = entry.message;
    if (entry.type === 'user' && message) {
      const isResult = Array.isArray(message.content) && message.content.some((block) => block?.type === 'tool_result');
      if (!isResult) opening = Number.isFinite(at) ? at : opening;
      else if (run && opening === null && Number.isFinite(at)) run.end = at;
    } else if (entry.type === 'assistant' && message) {
      if (opening !== null) {
        run = { start: opening, end: opening, responses: new Map(), tools: 0 };
        opening = null;
      }
      if (!run) continue;
      if (message.usage) run.responses.set(message.id ?? entry.uuid, message);
      for (const block of Array.isArray(message.content) ? message.content : []) if (block?.type === 'tool_use') run.tools += 1;
      if (Number.isFinite(at)) run.end = at;
    }
  }
  if (!run) return null;
  const responses = [...run.responses.values()];
  const sum = (key) => responses.reduce((total, message) => total + count(message.usage[key]), 0);
  return {
    model: responses.at(-1)?.model,
    seconds: Math.max(0, Math.round((run.end - run.start) / 1000)),
    out: sum('output_tokens'),
    in: sum('input_tokens') + sum('cache_creation_input_tokens'),
    cached: sum('cache_read_input_tokens'),
    tools: run.tools,
  };
}
