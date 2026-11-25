// .codex/config.toml に、この道具の表を足す。ほかの表と字(並び、字下げ、注釈)は変えない。
//
// - 表が無ければ、ファイルの終わりに、空の行を 1 つ挟んで足す。
// - 表があれば、表の中の、この道具が書く鍵の行だけをそろえる。利用者が表に足した行は残す。
//
// 複数行の文字列と、複数行にまたがる配列の中の行は、見出しとして読まない。

import { PLUGIN_ID, TARGET } from './target.mjs';

const tables = () => [
  [`[marketplaces.${TARGET.marketplace}]`, [['source_type', '"git"'], ['source', `"https://github.com/${TARGET.repo}.git"`]]],
  [`[plugins."${PLUGIN_ID}"]`, [['enabled', 'true']]],
];

const MULTILINE = ['"""', "'''"];

// 行ごとに、文字列と配列の外(TOML の一番上の段)で始まるかを返す。
function topLevel(lines) {
  let open = null;
  let depth = 0;
  return lines.map((line) => {
    const top = open === null && depth === 0;
    for (let at = 0; at < line.length; at += 1) {
      if (open !== null) {
        if (open === MULTILINE[0] && line[at] === '\\') at += 1;
        else if (line.startsWith(open, at)) {
          at += 2;
          open = null;
        }
      } else if (line[at] === '#') break;
      else if (MULTILINE.some((mark) => line.startsWith(mark, at))) {
        open = line.slice(at, at + 3);
        at += 2;
      } else if (line[at] === '"' || line[at] === "'") {
        const quote = line[at];
        for (at += 1; at < line.length && line[at] !== quote; at += 1) if (quote === '"' && line[at] === '\\') at += 1;
      } else if (line[at] === '[') depth += 1;
      else if (line[at] === ']') depth = Math.max(0, depth - 1);
    }
    return top;
  });
}

// 表ごとに、見出しの行と、最後の値の行を返す。
function tablesIn(lines) {
  const top = topLevel(lines);
  const headers = lines.flatMap((line, at) => (top[at] && /^\s*\[/.test(line) ? [at] : []));
  return headers.map((start, index) => {
    let end = start;
    for (let at = start + 1; at < (headers[index + 1] ?? lines.length); at += 1) {
      const text = lines[at].trim();
      if (!top[at] || (text && !text.startsWith('#'))) end = at;
    }
    const keyAt = (key) => lines.slice(start + 1, end + 1).findIndex((line, offset) => top[start + 1 + offset] && new RegExp(`^\\s*${key}\\s*=`).test(line));
    return { start, header: lines[start].trim(), keyAt };
  });
}

// text(無ければ null)に、この道具の表を足した文書を返す。変わらなければ text をそのまま返す。
export function editCodexConfig(text) {
  const lines = text === null ? [] : text.split('\n');
  const replace = new Map();
  const after = new Map();
  const present = new Set();
  for (const table of tablesIn(lines)) {
    const keys = tables().find(([header]) => header === table.header)?.[1];
    if (!keys || present.has(table.header)) continue;
    present.add(table.header);
    const missing = [];
    for (const [key, value] of keys) {
      const offset = table.keyAt(key);
      const line = `${key} = ${value}`;
      if (offset < 0) missing.push(line);
      else if (lines[table.start + 1 + offset] !== line) replace.set(table.start + 1 + offset, line);
    }
    if (missing.length) after.set(table.start, missing);
  }
  const add = tables().filter(([header]) => !present.has(header));
  if (!replace.size && !after.size && !add.length) return text;
  const kept = lines.flatMap((line, at) => [replace.get(at) ?? line, ...(after.get(at) ?? [])]).join('\n');
  const blocks = add.map(([header, keys]) => [header, ...keys.map(([key, value]) => `${key} = ${value}`)].join('\n'));
  const body = kept.trim() ? `${kept.endsWith('\n') ? kept : `${kept}\n`}${blocks.length ? '\n' : ''}` : '';
  return blocks.length ? `${body}${blocks.join('\n\n')}\n` : kept;
}
