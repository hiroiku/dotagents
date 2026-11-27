// TOML の文書から、表を外す。外した表のほかの字(ほかの表、注釈、空行、書式)は変えない。
//
// 表は、見出しの行から、次の見出しの前にある最後の値の行までとする。利用者が表に足した行も含む。見出しの直前の空行 1 つも外す。
// 表の後ろの注釈と空行は、次の表か利用者のものなので残す。複数行の文字列と、複数行にまたがる配列の中の行は、見出しとして読まない。
// 見出しの鍵が読めない、文字列や配列が閉じていないなど、表の境目を決められない文書は、書き換えずに止める。

const MULTILINE = ['"""', "'''"];

export class TomlShapeError extends Error {}

// 行ごとに、文字列と配列の外(TOML の一番上の段)で始まるかを返す。
function topLevel(lines) {
  let open = null;
  let depth = 0;
  const top = lines.map((line, row) => {
    const starts = open === null && depth === 0;
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
        if (at >= line.length) throw new TomlShapeError(`${row + 1} 行目の文字列が閉じていません`);
      } else if (line[at] === '[') depth += 1;
      else if (line[at] === ']') depth = Math.max(0, depth - 1);
    }
    return starts;
  });
  if (open !== null) throw new TomlShapeError('複数行の文字列が閉じていません');
  if (depth !== 0) throw new TomlShapeError('配列が閉じていません');
  return top;
}

// 見出し([a."b".c] の中身)を、鍵の並びに直す。
function keyPath(text, row) {
  const keys = [];
  let at = 0;
  const fail = () => {
    throw new TomlShapeError(`${row + 1} 行目の見出しを読めません`);
  };
  for (;;) {
    while (text[at] === ' ' || text[at] === '\t') at += 1;
    if (text[at] === '"') {
      const end = text.slice(at + 1).search(/(?<!\\)"/);
      if (end < 0) fail();
      try {
        keys.push(JSON.parse(text.slice(at, at + end + 2)));
      } catch {
        fail();
      }
      at += end + 2;
    } else if (text[at] === "'") {
      const end = text.indexOf("'", at + 1);
      if (end < 0) fail();
      keys.push(text.slice(at + 1, end));
      at = end + 1;
    } else {
      const bare = text.slice(at).match(/^[A-Za-z0-9_-]+/);
      if (!bare) fail();
      keys.push(bare[0]);
      at += bare[0].length;
    }
    while (text[at] === ' ' || text[at] === '\t') at += 1;
    if (at >= text.length) return keys;
    if (text[at] !== '.') fail();
    at += 1;
  }
}

// 1 行の値が文字列だけのとき、その文字列を返す。ほかの形は undefined。
function stringValue(raw) {
  const value = raw.trim().replace(/\s+#.*$/, '');
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return /^'[^']*'$/.test(value) ? value.slice(1, -1) : undefined;
}

// 表ごとに、見出しの行、最後の値の行、鍵の並び、1 行の値を返す。
export function tablesIn(text) {
  const lines = text.split('\n');
  const top = topLevel(lines);
  const headers = lines.flatMap((line, row) => (top[row] && /^\s*\[/.test(line) ? [row] : []));
  return {
    lines,
    tables: headers.map((start, index) => {
      const header = lines[start].trim().replace(/\s+#.*$/, '');
      const array = header.startsWith('[[');
      if (!(array ? /^\[\[.*\]\]$/ : /^\[.*\]$/).test(header)) throw new TomlShapeError(`${start + 1} 行目の見出しを読めません`);
      const keys = keyPath(header.slice(array ? 2 : 1, array ? -2 : -1), start);
      let end = start;
      const values = new Map();
      for (let row = start + 1; row < (headers[index + 1] ?? lines.length); row += 1) {
        const trimmed = lines[row].trim();
        if (!top[row] || (trimmed && !trimmed.startsWith('#'))) end = row;
        const pair = top[row] && lines[row].match(/^\s*([A-Za-z0-9_-]+)\s*=(.*)$/);
        if (pair) values.set(pair[1], pair[2]);
      }
      return { start, end, header, array, keys, string: (key) => (values.has(key) ? stringValue(values.get(key)) : undefined), has: (key) => values.has(key) };
    }),
  };
}

// 選んだ表を外した文書を返す。何も外さなければ text をそのまま、何も残らなければ null を返す。
export function dropTables(text, pick) {
  const { lines, tables } = tablesIn(text);
  const drop = new Set();
  const dropped = [];
  for (const table of tables) {
    if (!pick(table)) continue;
    dropped.push(table);
    for (let row = table.start; row <= table.end; row += 1) drop.add(row);
    if (table.start > 0 && !lines[table.start - 1].trim() && !drop.has(table.start - 1)) drop.add(table.start - 1);
  }
  if (!dropped.length) return { text, dropped };
  const kept = lines.filter((_, row) => !drop.has(row)).join('\n');
  return { text: kept.trim() ? kept : null, dropped };
}
