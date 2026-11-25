// 端末の画面を作る部品。依存を持たず、字の幅の数え方、折り返し、色と記号の選び方だけを持つ。
//
// 色は端末の 16 色だけを使う(利用者のテーマに従う)。24bit の色は決め打ちしない。
//
// 画面の出し方は 2 つの事実で決まる。
//
// - fancy: 左の縦線でつなぐ画面を出すか。端末か、FORCE_COLOR のときに出す。パイプと CI は、素の文を出す。
// - color: 色を付けるか。NO_COLOR(空でない)が何より先で、無ければ FORCE_COLOR、無ければ端末かどうか。
//
// NO_COLOR のときは、色の制御列(SGR)を一切出さない。TERM=dumb のときは、罫線と記号を ASCII に落とし、色も付けない。

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export const strip = (text) => text.replace(ANSI, '');

// ---------------------------------------------------------------- 字の幅

const within = (code, ranges) => ranges.some(([from, to]) => code >= from && code <= to);

// 幅を持たない字(結合文字、異体字の選択子、幅の無い空白)。
const ZERO = [[0x0300, 0x036f], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x200b, 0x200f], [0x20d0, 0x20ff], [0x2060, 0x2064], [0x3099, 0x309a], [0xfe00, 0xfe0f], [0xfe20, 0xfe2f], [0xe0100, 0xe01ef]];
// 東アジアの全角と、絵文字の多く。端末は 2 桁で描く。
const WIDE = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0xa4cf],
  [0xa960, 0xa97f],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x2fffd],
  [0x30000, 0x3fffd],
];

function cellWidth(char) {
  const code = char.codePointAt(0);
  if (code < 0x20 || (code >= 0x7f && code < 0xa0) || within(code, ZERO)) return 0;
  return within(code, WIDE) ? 2 : 1;
}

// 端末で占める桁数。全角の文字は 2 桁、結合文字は 0 桁で数える。制御列は数えない。
export function width(text) {
  let total = 0;
  for (const char of strip(String(text))) total += cellWidth(char);
  return total;
}

// 行の頭に置かない字。
const NO_START = new Set([...'、。，．・：；？！）〕］｝〉》」』】ー々ゝゞぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ']);

// 折り返しの単位。空白、半角の連なり(1 語)、全角の 1 字。全角の字の間は、どこでも折り返せる。
function unitsOf(line) {
  const units = [];
  let word = '';
  const flush = () => {
    if (word) units.push({ text: word, width: width(word) });
    word = '';
  };
  for (const char of line) {
    if (/\s/u.test(char)) {
      flush();
      units.push({ text: ' ', width: 1, space: true });
    } else if (cellWidth(char) === 2) {
      flush();
      units.push({ text: char, width: 2 });
    } else word += char;
  }
  flush();
  return units;
}

// 長すぎる 1 語を、桁数に収まる塊に切る。
function pieces(unit, limit) {
  const out = [];
  let text = '';
  let size = 0;
  for (const char of unit.text) {
    const w = cellWidth(char);
    if (size + w > limit && text) {
      out.push({ text, width: size });
      text = '';
      size = 0;
    }
    text += char;
    size += w;
  }
  if (text) out.push({ text, width: size });
  return out;
}

// 桁数 cols に収まるよう折り返した行の配列を返す。hang は、2 行目以降の字下げ(番号の下げ)。
// 改行は、そのまま改行になる。行の頭に、、。などを置かない。
export function wrap(text, cols, hang = 0) {
  const limit = Math.max(cols, 4);
  const indent = Math.min(hang, limit - 2);
  const lines = [];
  for (const source of String(text).split('\n')) {
    let row = [];
    let size = 0;
    let first = true;
    const room = () => limit - (first ? 0 : indent);
    const emit = () => {
      const body = row.map((unit) => unit.text).join('').trimEnd();
      lines.push(first ? body : ' '.repeat(indent) + body);
      first = false;
      row = [];
      size = 0;
    };
    for (const unit of unitsOf(source)) {
      if (unit.space && !row.length) continue;
      for (const part of unit.width > room() ? pieces(unit, room()) : [unit]) {
        if (size + part.width > room() && row.length) {
          // 行の頭に置けない字が来たら、直前の 1 語を一緒に次の行へ送る。
          const last = row[row.length - 1];
          const carry = NO_START.has([...part.text][0]) && row.length > 1 && !last.space && last.width + part.width <= limit - indent ? row.pop() : null;
          emit();
          if (carry) {
            row.push(carry);
            size = carry.width;
          }
          if (part.space) continue;
        }
        row.push(part);
        size += part.width;
      }
    }
    if (row.length || first) emit();
  }
  return lines;
}

// ---------------------------------------------------------------- 端末の事実

const truthy = (value) => value !== undefined && value !== '' && value !== '0' && value !== 'false';

// output の事実と環境変数から、画面の出し方を決める。env は差し込む(process.env を直接読まない)。
export function terminal(output, env = {}) {
  const tty = Boolean(output.isTTY);
  const dumb = env.TERM === 'dumb';
  const forced = truthy(env.FORCE_COLOR);
  const off = Boolean(env.NO_COLOR);
  const color = !off && (forced || (tty && !dumb));
  return {
    fancy: tty || (forced && !off),
    color,
    unicode: !dumb,
    // 同じ行を描き直す動き(スピナー)。色と同じく、端末のときだけ。
    animate: tty && color,
    columns: Number.isInteger(output.columns) && output.columns > 0 ? output.columns : 80,
  };
}

const UNICODE = {
  start: '┌', bar: '│', end: '└', active: '◆', done: '◇', error: '■', warn: '▲', on: '●', off: '○', checkOn: '◼', checkOff: '◻',
  line: '─', corner: '╮', join: '├', close: '╯', dot: '·', arrows: '↑↓', cursor: '▏', spin: [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'], new: '+', change: '~', remove: '-',
};
const ASCII = {
  start: '+', bar: '|', end: '+', active: '*', done: 'o', error: 'x', warn: '!', on: '(*)', off: '( )', checkOn: '[x]', checkOff: '[ ]',
  line: '-', corner: '+', join: '+', close: '+', dot: '|', arrows: '^v', cursor: '_', spin: [...'-\\|/'], new: '+', change: '~', remove: '-',
};

// 記号と色。色は、color が偽なら字をそのまま返す。入れ子にはしない。
export function themeOf(term) {
  const S = term.unicode ? UNICODE : ASCII;
  const paint = (code) => (text) => (term.color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const c = { dim: paint(2), bold: paint(1), accent: paint(36), green: paint(32), yellow: paint(33), red: paint(31), inverse: paint(7) };
  // 縦線と 2 つの空白の右に残る、文の幅。
  const inner = Math.max(8, term.columns - 3);
  const bar = c.dim(S.bar);
  // 縦線に続けて文を置く行。空の行は、縦線だけにする。
  const row = (text = '') => (text === '' ? bar : `${bar}  ${text}`);
  // 縦線の右に置く文を、幅に収めて、色を付けて、行にする。hang は 2 行目以降の字下げ。
  const text = (value, style = (line) => line, hang = 0) => wrap(value, inner, hang).map((line) => row(line === '' ? '' : style(line)));
  // 記号と題の行。題が折り返すときは、2 行目以降を縦線に続ける。
  const head = (symbol, title) => wrap(title, inner).map((line, index) => (index === 0 ? `${symbol}  ${line}` : row(line)));
  // 質問の終わりの行。縦線を閉じる記号に続けて、操作の案内を置く。
  const foot = (value) => wrap(value, inner).map((line, index) => (index === 0 ? `${c.dim(S.end)}  ${c.dim(line)}` : `   ${c.dim(line)}`));
  return { S, c, inner, bar, row, text, head, foot };
}
