// JSONC(コメントと末尾のカンマを許す JSON)の文書で、一番外のオブジェクトの 1 つの項目だけを書き換える。
// ほかの字(コメント、字下げ、項目の順)は変えない。parseJsonc が読める文書だけを渡す。

// 一番外のオブジェクトの項目ごとに、鍵の始まり、値の始まりと終わり、後ろのカンマの位置を返す。
function members(text) {
  let at = 0;
  const skip = () => {
    for (;;) {
      if (/\s/.test(text[at] ?? '')) at += 1;
      else if (text.startsWith('//', at)) at = text.indexOf('\n', at) < 0 ? text.length : text.indexOf('\n', at);
      else if (text.startsWith('/*', at)) at = text.indexOf('*/', at + 2) + 2;
      else return;
    }
  };
  const string = () => {
    const start = at;
    for (at += 1; text[at] !== '"'; at += 1) if (text[at] === '\\') at += 1;
    at += 1;
    return JSON.parse(text.slice(start, at));
  };
  // 値を 1 つ読み飛ばす。中の入れ物は、文字列とコメントを読み分けて、閉じるまで進む。
  const value = () => {
    if (text[at] === '"') return string();
    if (text[at] !== '{' && text[at] !== '[') {
      while (at < text.length && !/[\s,\]}/]/.test(text[at])) at += 1;
      return undefined;
    }
    let depth = 0;
    do {
      if (text[at] === '"') {
        string();
        continue;
      }
      if (text.startsWith('//', at) || text.startsWith('/*', at)) {
        skip();
        continue;
      }
      if (text[at] === '{' || text[at] === '[') depth += 1;
      if (text[at] === '}' || text[at] === ']') depth -= 1;
      at += 1;
    } while (depth > 0);
    return undefined;
  };
  if (text.charCodeAt(0) === 0xfeff) at = 1;
  skip();
  const open = at;
  at += 1;
  const items = [];
  for (;;) {
    skip();
    if (text[at] === '}') return { open, close: at, items };
    const keyStart = at;
    const key = string();
    skip();
    at += 1;
    skip();
    const valueStart = at;
    const parsed = value();
    const item = { key, keyStart, valueStart, valueEnd: at, value: parsed, comma: -1 };
    items.push(item);
    skip();
    if (text[at] === ',') {
      item.comma = at;
      at += 1;
    }
  }
}

export const topLevelString = (text, key) => members(text).items.find((item) => item.key === key)?.value;

const lineStart = (text, at) => text.lastIndexOf('\n', at - 1) + 1;

// key に文字列の値を書く。無ければ、最初の項目の前に、その項目と同じ字下げで足す。
export function setTopLevelString(text, key, value) {
  const { open, close, items } = members(text);
  const literal = JSON.stringify(value);
  const found = items.find((item) => item.key === key);
  if (found) return `${text.slice(0, found.valueStart)}${literal}${text.slice(found.valueEnd)}`;
  const pair = `${JSON.stringify(key)}: ${literal}`;
  if (!items.length) return `${text.slice(0, open + 1)}${text.slice(open + 1, close).includes('\n') ? `\n  ${pair}` : ` ${pair} `}${text.slice(open + 1)}`;
  const first = items[0].keyStart;
  const head = text.slice(lineStart(text, first), first);
  const gap = /^[ \t]*$/.test(head) ? `\n${head}` : ' ';
  return `${text.slice(0, first)}${pair},${gap}${text.slice(first)}`;
}

// key の項目を外す。1 行に 1 つの項目なら、その行ごと外す。
export function removeTopLevel(text, key) {
  const { items } = members(text);
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) return text;
  const item = items[index];
  let start = item.keyStart;
  let end = item.comma >= 0 ? item.comma + 1 : item.valueEnd;
  // 最後の項目なら、前の項目の後ろのカンマを外す(末尾のカンマが無いとき)。
  let previousComma = -1;
  if (item.comma < 0 && index > 0) previousComma = items[index - 1].comma;
  const before = text.slice(lineStart(text, start), start);
  const after = text.slice(end).match(/^[ \t]*(?:\r?\n|$)/);
  if (/^[ \t]*$/.test(before) && after) {
    start = lineStart(text, start);
    end += after[0].length;
  } else {
    end += text.slice(end).match(/^[ \t]*/)[0].length;
  }
  let out = `${text.slice(0, start)}${text.slice(end)}`;
  if (previousComma >= 0) out = `${out.slice(0, previousComma)}${out.slice(previousComma + 1)}`;
  return out;
}
