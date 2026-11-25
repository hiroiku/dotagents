// 質問以外の画面。始まりの見出し、見つけたもの、書くファイルの枠、スピナー、知らせ、次にすること、終わり。
//
// 端末(縦線でつなぐ画面)と、端末でない出力(素の文)で、同じ呼び出しに別の出し方を持つ。呼ぶ側は、どちらかを知らない。
// 端末でない出力と NO_COLOR には、色の制御列を一切出さない(themeOf が色を消す)。同じ行を描き直すスピナーは、
// 色が出せる端末だけで回し、そうでなければ、始まりと終わりの 2 行を出す。

import { strip, themeOf, width, wrap } from './term.mjs';

const REASON_LIMIT = 160;

// claude が出した文から、失敗の理由として見せる 1 行を取る。最後の空でない行。
export function reasonOf(output) {
  const last = strip(String(output ?? '')).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) ?? '';
  return last.length > REASON_LIMIT ? `${last.slice(0, REASON_LIMIT)}…` : last;
}

export function createView({ output, errput = output, term }) {
  const { S, c, inner, bar, row, text, head } = themeOf(term);
  const write = (value) => output.write(value);
  const lines = (list) => write(`${list.join('\n')}\n`);
  const fancy = term.fancy;
  let boxed = false;

  // 縦線から右へ張り出す枠。題の右から枠を閉じ、行の右の縁をそろえる。
  // items: { text, prefix?, paint?, hang? }。prefix は、行頭の印(+ 新規)で、paint で色を付ける。
  function box(title, items) {
    const room = Math.max(10, term.columns - 6);
    const body = items.flatMap(({ text: value, prefix, paint, hang = 0 }) => wrap(value, room, hang).map((line, index) => (index === 0 && prefix ? paint(prefix) + line.slice(prefix.length) : line)));
    const size = Math.min(room, Math.max(width(title), ...body.map(width)));
    const blank = `${bar}${' '.repeat(size + 4)}${c.dim(S.bar)}`;
    return [
      `${c.green(S.done)}  ${title} ${c.dim(S.line.repeat(size + 1 - width(title)) + S.corner)}`,
      blank,
      ...body.map((line) => `${bar}  ${line}${' '.repeat(size - width(line))}  ${c.dim(S.bar)}`),
      blank,
      `${c.dim(S.join + S.line.repeat(size + 4) + S.close)}`,
      row(),
    ];
  }

  // 1 つの記号に続く文。記号の行の下に、2 行目以降を縦線でつなぐ。
  const entry = (symbol, value, style) => [...wrap(value, inner).map((line, index) => (index === 0 ? `${symbol}  ${style(line)}` : row(style(line)))), row()];

  const kinds = { new: ['新規', S.new, c.green], change: ['変更', S.change, c.yellow], remove: ['削除', S.remove, c.red] };

  return {
    fancy,

    // 始まり。
    intro(version, subtitle) {
      if (!fancy) return;
      lines([`${c.dim(S.start)}  ${c.bold('dotagents')} ${version}`, ...text(subtitle), row()]);
    },

    // プロジェクトから見つけたもの。
    found(facts) {
      if (!fancy || !facts.length) return;
      lines([...head(c.green(S.done), '見つけたもの'), ...text(facts.join(` ${S.dot} `), c.dim), row()]);
    },

    // 書くファイルを 1 つの枠にまとめて見せる。変更が無いときは、何も出さない。
    plan(rows, title = '書くファイル') {
      if (!fancy || !rows.length) return;
      boxed = true;
      lines(box(title, rows.map(({ kind, path }) => {
        const [name, mark, paint] = kinds[kind];
        return { text: `${mark} ${name}  ${path}`, prefix: `${mark} ${name}`, paint, hang: 2 };
      })));
    },

    // 書き終えたあとの知らせ。素の文では、ここで書いたファイルと git diff --stat を出す。
    written({ version, root, rows, stat }) {
      if (!rows.length) {
        if (fancy) lines(entry(c.green(S.done), '設定は、すでにそろっていて、変更はありません。', (line) => line));
        else write(`\ndotagents ${version}: ${root} の設定は、すでにそろっていて、変更はありません。\n`);
        return;
      }
      if (fancy) {
        if (!boxed) this.plan(rows, '書いたファイル');
        return;
      }
      const label = { new: '新規', change: '変更', remove: '削除' };
      write(`\ndotagents ${version} を ${root} に入れました。コミットはしていません。\n\n書き換えたファイル:\n`);
      for (const { kind, path } of rows) write(`  ${label[kind]}  ${path}\n`);
      if (stat) write(`\n${stat}\n`);
    },

    // 状況を 1 行で伝える。
    info(value) {
      if (fancy) lines(entry(c.green(S.done), value, (line) => line));
      else write(`${value}\n`);
    },

    // 利用者が自分ですること、気をつけること。
    warn(value) {
      if (fancy) lines(entry(c.yellow(S.warn), value, (line) => line));
      else write(`\n${value}\n`);
    },

    notices(list) {
      if (!list.length) return;
      if (fancy) for (const value of list) this.warn(value);
      else write(`\n知らせ:\n${list.map((value) => `  - ${value}`).join('\n')}\n`);
    },

    // 時間のかかる仕事。work は { ok, reason?, failure? } を返す。色が出せる端末では、スピナーを回す。
    // 終われば、成功は緑の記号と success、失敗は赤の記号と failure と短い理由に変える。
    async task({ running, success }, work) {
      if (!fancy) {
        write(`\n${running}\n`);
        const result = await work();
        if (!result.ok) errput.write(`\n${result.failure}${result.reason ? `\n${result.reason}` : ''}\n`);
        return result;
      }
      const label = width(running) > inner - 2 ? `${wrap(running, inner - 3)[0]}…` : running;
      let timer = null;
      let frame = 0;
      if (term.animate) {
        const paint = () => write(`\r\x1b[2K${c.accent(S.spin[frame % S.spin.length])}  ${label}`);
        paint();
        timer = setInterval(() => {
          frame += 1;
          paint();
        }, 80);
      } else write(`${c.accent(S.active)}  ${label}\n`);
      let result;
      try {
        result = await work();
      } finally {
        if (timer) {
          clearInterval(timer);
          write('\r\x1b[2K');
        }
      }
      lines(result.ok ? entry(c.green(S.done), success, (line) => line) : [...head(c.red(S.error), result.failure), ...(result.reason ? text(result.reason, c.dim) : []), row()]);
      return result;
    },

    // 次にすること。番号を付けた枠にする。
    steps(items) {
      if (!items.length) return;
      if (fancy) lines(box('次にすること', items.map((item, index) => ({ text: `${index + 1}. ${item}`, hang: 3 }))));
      else write(`\n次にすること:\n${items.map((item) => `  - ${item}`).join('\n')}\n`);
    },

    // 終わり。tone が warn なら黄、plain なら色なし。
    outro(value, tone = 'plain') {
      if (!fancy) return;
      const style = tone === 'warn' ? c.yellow : (line) => line;
      write(`${wrap(value, inner).map((line, index) => (index === 0 ? `${c.dim(S.end)}  ${style(line)}` : `   ${style(line)}`)).join('\n')}\n`);
    },
  };
}

// 失敗と中断を、端末では赤の記号で出す。素の出力では、文をそのまま出す。
export function errorLines(term, message) {
  if (!term.fancy) return `${message}\n`;
  const { S, c, inner } = themeOf(term);
  return `${wrap(message, inner).map((line, index) => (index === 0 ? `${c.red(S.error)}  ${c.red(line)}` : `   ${line}`)).join('\n')}\n`;
}
