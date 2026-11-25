// JSON の文書を、変えた値のところだけ書き換える。ほかの文字(字下げ、改行、項目の順、空の入れ物)は、そのまま残す。
// 利用者の設定ファイルに項目を足し引きするときに使う。読めない文書は、書き戻すと利用者の設定が消えるので、止める。

// 文書を読み、値ごとの位置を返す。JSON.parse が通った文書だけを渡す。
function locate(text) {
  let at = 0;
  const space = () => {
    while (at < text.length && ' \t\n\r'.includes(text[at])) at += 1;
  };
  const string = () => {
    const start = at;
    at += 1;
    while (text[at] !== '"') at += text[at] === '\\' ? 2 : 1;
    at += 1;
    return JSON.parse(text.slice(start, at));
  };
  const value = () => {
    space();
    const start = at;
    const open = text[at];
    if (open === '{' || open === '[') {
      const close = open === '{' ? '}' : ']';
      const items = [];
      at += 1;
      space();
      if (text[at] === close) {
        at += 1;
        return { type: open === '{' ? 'object' : 'array', start, end: at, items };
      }
      for (;;) {
        space();
        const itemStart = at;
        const key = open === '{' ? string() : undefined;
        if (open === '{') {
          space();
          at += 1;
        }
        const node = value();
        items.push({ key, start: itemStart, end: node.end, node });
        space();
        const next = text[at];
        at += 1;
        if (next === close) return { type: open === '{' ? 'object' : 'array', start, end: at, items };
      }
    }
    if (open === '"') string();
    else while (at < text.length && !',]} \t\n\r'.includes(text[at])) at += 1;
    return { type: 'scalar', start, end: at };
  };
  return value();
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function same(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => same(item, b[index]));
  if (isObject(a) || isObject(b)) {
    if (!isObject(a) || !isObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]));
  }
  return a === b;
}

// 文書の字下げの 1 段。字下げの無い文書は、1 行に詰めて書く。
function unitOf(text) {
  if (!text.includes('\n')) return null;
  return text.match(/\n([ \t]+)\S/)?.[1] ?? '  ';
}

const lineIndent = (text, at) => text.slice(text.lastIndexOf('\n', at - 1) + 1).match(/^[ \t]*/)[0];

function serialize(value, unit, indent) {
  return unit === null ? JSON.stringify(value) : JSON.stringify(value, null, unit).split('\n').join(`\n${indent}`);
}

const splice = (text, start, end, piece) => `${text.slice(0, start)}${piece}${text.slice(end)}`;

// 入れ物から index 番目を外す。区切りの , と、その前の空白も一緒に外す。
function remove(text, container, index) {
  const { items } = container;
  if (items.length === 1) return splice(text, container.start + 1, container.end - 1, '');
  if (index < items.length - 1) return splice(text, items[index].start, items[index + 1].start, '');
  return splice(text, items[index - 1].end, items[index].end, '');
}

// 入れ物の index 番目に、key と value を入れる。字下げは、並んでいる項目にそろえる。
function insert(text, container, index, key, value) {
  const unit = unitOf(text);
  const { items } = container;
  const head = (indent) => (key === undefined ? '' : `${JSON.stringify(key)}:${unit === null ? '' : ' '}`) + serialize(value, unit, indent);
  if (!items.length) {
    if (unit === null) return splice(text, container.start + 1, container.end - 1, head(''));
    const outer = lineIndent(text, container.start);
    return splice(text, container.start + 1, container.end - 1, `\n${outer}${unit}${head(outer + unit)}\n${outer}`);
  }
  const lead = text.slice(container.start + 1, items[0].start);
  const indent = lead.includes('\n') ? lead.slice(lead.lastIndexOf('\n') + 1) : '';
  const gap = lead.includes('\n') ? lead : lead || (unit === null ? '' : ' ');
  if (index >= items.length) return splice(text, items.at(-1).end, items.at(-1).end, `,${gap}${head(indent)}`);
  return splice(text, items[index].start, items[index].start, `${head(indent)},${gap}`);
}

// 今の文書を target に近づける書き換えを 1 つ返す。同じなら null。
function step(text, node, target) {
  const current = JSON.parse(text.slice(node.start, node.end));
  if (same(current, target)) return null;
  if (node.type === 'object' && isObject(target)) {
    const gone = node.items.findIndex((item) => !Object.hasOwn(target, item.key));
    if (gone >= 0) return remove(text, node, gone);
    for (const item of node.items) {
      const next = step(text, item.node, target[item.key]);
      if (next !== null) return next;
    }
    const added = Object.keys(target).find((key) => !node.items.some((item) => item.key === key));
    return insert(text, node, node.items.length, added, target[added]);
  }
  if (node.type === 'array' && Array.isArray(target)) {
    const values = node.items.map((item) => JSON.parse(text.slice(item.start, item.end)));
    let i = 0;
    let j = 0;
    while (i < values.length && j < target.length && same(values[i], target[j])) {
      i += 1;
      j += 1;
    }
    if (i < values.length && !target.slice(j).some((value) => same(value, values[i]))) return remove(text, node, i);
    if (j < target.length) return insert(text, node, i, undefined, target[j]);
    return remove(text, node, i);
  }
  return splice(text, node.start, node.end, serialize(target, unitOf(text), lineIndent(text, node.start)));
}

// text(無ければ null)を読み、change で変えた値を書いた文書を返す。変わらなければ text をそのまま返し、
// 空のオブジェクトになれば null(ファイルを消す)を返す。読めなければ止める。
export function editJsonText(text, change, file = 'JSON') {
  let data = {};
  if (text !== null) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`${file} を JSON として読み込めません。何も書き込まずに中止します: ${error.message}`);
    }
  }
  if (!isObject(data)) throw new Error(`${file} の中身が JSON のオブジェクトではありません。何も書き込まずに中止します。`);
  const target = structuredClone(data);
  change(target);
  if (same(data, target)) return text;
  if (!Object.keys(target).length) return null;
  if (text === null) return `${JSON.stringify(target, null, 2)}\n`;
  let out = text;
  for (let guard = 0; guard < 10000; guard += 1) {
    const next = step(out, locate(out), target);
    if (next === null) return out;
    out = next;
  }
  throw new Error(`${file} を更新できませんでした。何も書き込まずに中止します。`);
}
