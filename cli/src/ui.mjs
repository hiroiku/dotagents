// 質問の画面。左の縦線でつなぎ、記号で状態を示す。依存を持たず、Node の標準の機能だけで作る。
//
// 入力と出力は差し込める。端末なら入力を生のモードにして 1 キーずつ読み、テストでは、キーの並びを流した Readable を渡す。
// Ctrl-C と入力の終わりは Cancelled で投げる。呼ぶ側は、何も書かないうちに質問を終える。
// 質問の途中で中断したときは、描いていた質問を消してから投げる。

import { terminal, themeOf, width, wrap } from './term.mjs';

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

export function createUi({ input, output, term = terminal(output, {}) }) {
  const reader = keyReader(input);
  const { S, c, inner, row, text, head, foot } = themeOf(term);
  let asked = 0;

  // 同じ場所に描き直す画面。カーソルは、いつも最後の行の終わりに置く。
  function frame() {
    let drawn = 0;
    const draw = (lines) => {
      output.write(`${drawn > 1 ? `${ESC}${drawn - 1}A` : ''}\r${ESC}J${lines.join('\n')}`);
      drawn = lines.length;
    };
    return {
      draw,
      // 質問をたたんで、答えの行にする。縦線を 1 行足して、次へつなぐ。
      done(lines) {
        draw([...lines, row()]);
        output.write('\n');
      },
      // 描いた質問を消す。中断のとき、答えの途中の画面を残さない。
      clear() {
        draw([]);
      },
    };
  }

  const opening = (message, description) => [...head(c.accent(S.active), message), ...(description ? text(description, c.dim) : [])];
  const closing = (message, answer) => [...head(c.green(S.done), message), ...text(answer, c.dim)];

  // 選択肢の 1 つ。記号と題を先に、説明は淡い色で同じ行に添える。収まらなければ、題の下に回す。
  function option(choice, { mark, current, note }) {
    const lead = width(mark) + 1;
    const label = wrap(choice.label, inner - lead);
    const hint = [choice.hint, note].filter(Boolean).join('');
    const strong = (value) => (current ? c.accent(value) : value);
    const markOf = current ? c.accent(mark) : c.dim(mark);
    if (hint && label.length === 1 && lead + width(label[0]) + 2 + width(hint) <= inner) return [`${markOf} ${strong(label[0])}  ${c.dim(hint)}`];
    const pad = ' '.repeat(lead);
    return [
      ...label.map((line, index) => `${index === 0 ? markOf : ' '.repeat(width(mark))} ${strong(line)}`),
      ...(hint ? wrap(hint, inner - lead).map((line) => `${pad}${c.dim(line)}`) : []),
    ];
  }

  async function choose({ message, description, choices, initial, multiple, recommended }) {
    asked += 1;
    const screen = frame();
    let at = multiple ? 0 : Math.max(0, choices.findIndex((choice) => choice.value === initial));
    const picked = new Set(multiple ? (initial ?? []) : []);
    const keys = multiple ? `${S.arrows} 選ぶ ${S.dot} space 切り替え ${S.dot} enter 決める` : `${S.arrows} 選ぶ ${S.dot} enter 決める`;
    output.write(`${ESC}?25l`);
    try {
      for (;;) {
        screen.draw([
          ...opening(message, description),
          ...choices.flatMap((choice, index) => {
            const on = multiple ? picked.has(choice.value) : index === at;
            const mark = multiple ? (on ? S.checkOn : S.checkOff) : on ? S.on : S.off;
            return option(choice, { mark, current: index === at, note: !multiple && recommended !== undefined && choice.value === recommended ? '(推奨)' : '' }).map(row);
          }),
          ...foot(keys),
        ]);
        const key = await reader.next();
        if (key.name === 'up' || (key.name === 'char' && key.char === 'k')) at = Math.max(0, at - 1);
        else if (key.name === 'down' || (key.name === 'char' && key.char === 'j')) at = Math.min(choices.length - 1, at + 1);
        else if (multiple && key.name === 'char' && key.char === ' ') {
          const { value } = choices[at];
          if (!picked.delete(value)) picked.add(value);
        } else if (key.name === 'enter') {
          const chosen = choices.filter((choice) => (multiple ? picked.has(choice.value) : choices[at] === choice));
          screen.done(closing(message, chosen.map((choice) => choice.label).join('、') || 'なし'));
          return multiple ? chosen.map((choice) => choice.value) : chosen[0].value;
        }
      }
    } catch (error) {
      if (error instanceof Cancelled) screen.clear();
      throw error;
    } finally {
      output.write(`${ESC}?25h`);
    }
  }

  return {
    // 1 つ選ぶ。choices は { value, label, hint? }。initial は最初に指す value、recommended は「(推奨)」を添える value。
    // description は、見出しの下に置く説明。
    select: ({ message, description, choices, initial, recommended }) => choose({ message, description, choices, initial, recommended }),
    // 複数選ぶ。initial は、最初に選んでおく value の配列。結果は choices の並びで返す。
    multiselect: ({ message, description, choices, initial }) => choose({ message, description, choices, initial, multiple: true }),
    // はい / いいえ。
    confirm: ({ message, description, yes, no, initial = true }) =>
      choose({
        message,
        description,
        choices: [
          { value: true, label: 'はい', hint: yes },
          { value: false, label: 'いいえ', hint: no },
        ],
        initial,
      }),
    // 1 行を入力する。initial は淡い色の下書きで、何も打たずに enter を押せば、それを使う。打てば下書きは消え、打った字になる。
    // 下書きを消す(Backspace、Ctrl-U)と、空で決まる。
    async text({ message, description, initial = '' }) {
      asked += 1;
      const screen = frame();
      let value = '';
      let touched = false;
      const cursor = term.color ? c.inverse(' ') : S.cursor;
      output.write(`${ESC}?25l`);
      try {
        for (;;) {
          const shown = touched ? value : initial;
          const lines = wrap(shown, inner - 1);
          const body = lines.map((line, index) => `${index === 0 && !touched ? cursor : ''}${touched ? line : c.dim(line)}${index === lines.length - 1 && touched ? cursor : ''}`);
          screen.draw([...opening(message, description), ...body.map(row), ...foot(!touched && initial ? 'enter でそのまま使う · 打つと書き換える' : 'enter 決める')]);
          const key = await reader.next();
          if (key.name === 'char') {
            value = touched ? value + key.char : key.char;
            touched = true;
          } else if (key.name === 'backspace') {
            value = touched ? Array.from(value).slice(0, -1).join('') : '';
            touched = true;
          } else if (key.name === 'clear') {
            value = '';
            touched = true;
          } else if (key.name === 'enter') {
            const answer = (touched ? value : initial).trim();
            screen.done(closing(message, answer === '' ? '(空)' : answer));
            return answer;
          }
        }
      } catch (error) {
        if (error instanceof Cancelled) screen.clear();
        throw error;
      } finally {
        output.write(`${ESC}?25h`);
      }
    },
    // これまでに出した質問の数。
    asked: () => asked,
    close: () => reader.close(),
  };
}
