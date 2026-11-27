// 注釈(`//` と `/* */`)と、末尾のカンマを許す JSON の読み取り。依存を持たない。
//
// 文字列を読み分けるので、文字列の中の `//` やエスケープした引用符は壊さない。ほかは JSON と同じ文法で、読めないときは、
// 読めなくなった文字の行と列(1 から数える。列は UTF-16 の単位)を添えて投げる。
// JSON.parse の誤りの文は、実行環境ごとに違う。位置を自分で持つために、読み取りは自分で書く。

const MAX_DEPTH = 64;
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseJsonc(text) {
  const source = String(text);
  let at = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  function fail(message, position = at) {
    const before = source.slice(0, position);
    const line = before.split('\n').length;
    const column = position - (before.lastIndexOf('\n') + 1) + 1;
    throw new SyntaxError(`${line} 行 ${column} 列: ${message}`);
  }

  // 空白と注釈を読み飛ばす。
  function skip() {
    for (;;) {
      const char = source[at];
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') at += 1;
      else if (char === '/' && source[at + 1] === '/') {
        const end = source.indexOf('\n', at);
        at = end < 0 ? source.length : end + 1;
      } else if (char === '/' && source[at + 1] === '*') {
        const end = source.indexOf('*/', at + 2);
        if (end < 0) fail('注釈が閉じていません', at);
        at = end + 2;
      } else return;
    }
  }

  function string() {
    at += 1;
    let out = '';
    for (;;) {
      const char = source[at];
      if (char === undefined || char === '\n' || char === '\r') fail('文字列が閉じていません');
      if (char === '"') {
        at += 1;
        return out;
      }
      if (char < ' ') fail('文字列に、改行などの制御文字は書けません');
      if (char !== '\\') {
        out += char;
        at += 1;
        continue;
      }
      const next = source[at + 1];
      if (next === 'u') {
        const hex = source.slice(at + 2, at + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('\\u の後ろには 16 進数の 4 桁が要ります', at + 2);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        at += 6;
      } else if (next !== undefined && Object.hasOwn(ESCAPES, next)) {
        out += ESCAPES[next];
        at += 2;
      } else fail('書けないエスケープです', at + 1);
    }
  }

  function number() {
    NUMBER.lastIndex = at;
    const found = NUMBER.exec(source);
    if (!found) fail('値が読めません');
    at += found[0].length;
    if (/[\w.+-]/.test(source[at] ?? '')) fail('数が読めません');
    return Number(found[0]);
  }

  function literal(word, value) {
    if (!source.startsWith(word, at) || /[\w$]/.test(source[at + word.length] ?? '')) fail('値が読めません');
    at += word.length;
    return value;
  }

  // 要素の並び。open の直後から、close の直前まで読む。末尾のカンマは許す。
  function sequence(close, item) {
    at += 1;
    skip();
    while (source[at] !== close) {
      item();
      skip();
      if (source[at] === ',') {
        at += 1;
        skip();
      } else if (source[at] !== close) fail(`',' か '${close}' が要ります`);
    }
    at += 1;
  }

  function value(depth) {
    skip();
    if (depth > MAX_DEPTH) fail('入れ子が深すぎます');
    const char = source[at];
    if (char === '{') {
      const object = {};
      sequence('}', () => {
        if (source[at] !== '"') fail('鍵は " で囲んだ文字列で書きます');
        const key = string();
        skip();
        if (source[at] !== ':') fail("':' が要ります");
        at += 1;
        // __proto__ も、ふつうの鍵として持つ。代入にすると、プロトタイプを書き換える。
        Object.defineProperty(object, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
      });
      return object;
    }
    if (char === '[') {
      const array = [];
      sequence(']', () => array.push(value(depth + 1)));
      return array;
    }
    if (char === '"') return string();
    if (char === 't') return literal('true', true);
    if (char === 'f') return literal('false', false);
    if (char === 'n') return literal('null', null);
    return number();
  }

  const result = value(0);
  skip();
  if (at < source.length) fail('値のあとに余分な文字があります');
  return result;
}
