// 矢印キーで選ぶ画面。依存を持たず、Node の標準の機能だけで作る。
//
// 入力と出力は差し込める。端末なら入力を生のモードにして 1 キーずつ読み、テストでは、キーの並びを流した Readable を渡す。
// Ctrl-C と入力の終わりは Cancelled で投げる。呼ぶ側は、何も書かないうちに質問を終える。

export class Cancelled extends Error {
  name = 'Cancelled';
}

const ESC = '\x1b[';
// 矢印などの制御列と、そのほかの 1 文字。
const TOKEN = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1bO[@-~]|[\s\S]/gu;

function keyOf(token) {
  switch (token) {
    case '\x1b[A':
    case '\x1bOA':
      return { name: 'up' };
    case '\x1b[B':
    case '\x1bOB':
      return { name: 'down' };
    case '\r':
    case '\n':
      return { name: 'enter' };
    case '\x03':
    case '\x04':
      return { name: 'cancel' };
    case '\x7f':
    case '\b':
      return { name: 'backspace' };
    case '\x15':
      return { name: 'clear' };
    default:
      return token >= ' ' && !token.startsWith('\x1b') ? { name: 'char', char: token } : { name: 'other' };
  }
}

// 入力を 1 キーずつ返す。先に届いたキーは、読まれるまで取っておく。
function keyReader(input) {
  const queue = [];
  let waiting = null;
  let ended = false;
  const raw = Boolean(input.isTTY) && typeof input.setRawMode === 'function';
  const wake = () => {
    if (!waiting) return;
    const resolve = waiting;
    waiting = null;
    resolve();
  };
  const onData = (chunk) => {
    queue.push(...String(chunk).match(TOKEN));
    wake();
  };
  const onEnd = () => {
    ended = true;
    wake();
  };
  input.setEncoding?.('utf8');
  if (raw) input.setRawMode(true);
  input.on('data', onData);
  input.on('end', onEnd);
  input.on('close', onEnd);
  input.resume();
  return {
    async next() {
      while (!queue.length) {
        if (ended) throw new Cancelled('入力が終わった');
        await new Promise((resolve) => {
          waiting = resolve;
        });
      }
      const key = keyOf(queue.shift());
      if (key.name === 'cancel') throw new Cancelled('中断した');
      return key;
    },
    close() {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('close', onEnd);
      if (raw) input.setRawMode(false);
      input.pause();
    },
  };
}

export function createUi({ input, output, color = Boolean(output.isTTY) && !process.env.NO_COLOR }) {
  const reader = keyReader(input);
  const paint = (code, text) => (color ? `${ESC}${code}m${text}${ESC}0m` : text);
  const dim = (text) => paint(2, text);
  const accent = (text) => paint(36, text);

  // 同じ場所に描き直す画面。カーソルは、いつも最後の行の終わりに置く。
  function frame() {
    let drawn = 0;
    const draw = (lines) => {
      output.write(`${drawn > 1 ? `${ESC}${drawn - 1}A` : ''}\r${ESC}J${lines.join('\n')}`);
      drawn = lines.length;
    };
    return {
      draw,
      // 質問をたたんで、答えの 1 行にする。
      done(line) {
        draw([line]);
        output.write('\n');
      },
    };
  }
  const question = (message) => `${accent('?')} ${message}`;
  const answered = (message, answer) => `${accent('✔')} ${message} ${dim('→')} ${answer === '' ? dim('(空)') : answer}`;

  async function choose({ message, choices, initial, multiple, hint }) {
    const screen = frame();
    let at = multiple ? 0 : Math.max(0, choices.findIndex((choice) => choice.value === initial));
    const picked = new Set(multiple ? (initial ?? []) : []);
    output.write(`${ESC}?25l`);
    try {
      for (;;) {
        screen.draw([
          `${question(message)} ${dim(hint)}`,
          ...choices.map((choice, index) => {
            const mark = multiple ? `${picked.has(choice.value) ? '◉' : '◯'} ` : '';
            const line = `${mark}${choice.label}${choice.hint ? ` ${dim(choice.hint)}` : ''}`;
            return index === at ? `${accent('❯')} ${accent(line)}` : `  ${line}`;
          }),
        ]);
        const key = await reader.next();
        if (key.name === 'up' || (key.name === 'char' && key.char === 'k')) at = Math.max(0, at - 1);
        else if (key.name === 'down' || (key.name === 'char' && key.char === 'j')) at = Math.min(choices.length - 1, at + 1);
        else if (multiple && key.name === 'char' && key.char === ' ') {
          const { value } = choices[at];
          if (!picked.delete(value)) picked.add(value);
        } else if (key.name === 'enter') {
          const chosen = choices.filter((choice) => (multiple ? picked.has(choice.value) : choices[at] === choice));
          screen.done(answered(message, chosen.map((choice) => choice.label).join('、') || 'なし'));
          return multiple ? chosen.map((choice) => choice.value) : chosen[0].value;
        }
      }
    } finally {
      output.write(`${ESC}?25h`);
    }
  }

  return {
    // 1 つ選ぶ。choices は { value, label, hint? }。initial は、最初に指す value。
    select: ({ message, choices, initial }) => choose({ message, choices, initial, hint: '(↑↓ で動き、Enter で決める)' }),
    // 複数選ぶ。initial は、最初に選んでおく value の配列。結果は choices の並びで返す。
    multiselect: ({ message, choices, initial }) => choose({ message, choices, initial, multiple: true, hint: '(↑↓ で動き、Space で選び、Enter で決める)' }),
    // 1 行を入力する。initial は、書き換えられる形で最初に入れておく。
    async text({ message, initial = '' }) {
      const screen = frame();
      let value = initial;
      for (;;) {
        screen.draw([`${question(message)} ${dim('›')} ${value}`]);
        const key = await reader.next();
        if (key.name === 'char') value += key.char;
        else if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
        else if (key.name === 'clear') value = '';
        else if (key.name === 'enter') {
          screen.done(answered(message, value.trim()));
          return value.trim();
        }
      }
    },
    close: () => reader.close(),
  };
}
