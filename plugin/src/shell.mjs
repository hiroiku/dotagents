// コマンドの文字列を、単純なコマンド(語の並び)に分ける。
//
// hook が知りたいのは「何が実行されるか」だけなので、シェルの文法をすべては読まない。引用符、連結、
// リダイレクト、ヒアドキュメント、`sh -c` の入れ子、前に付く起動の語(env、sudo、npx など)を読み、
// 残りは語のまま返す。読めない形で止めないためである。

import path from 'node:path';

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'time', 'fi', 'done', 'esac']);
// 後ろに続くのがコマンドではなく、繰り返す値や照らし合わせる語である文。
const HEADERS = new Set(['for', 'case', 'select', 'function']);
const PREFIXES = new Set(['sudo', 'command', 'exec', 'nohup', 'builtin']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash']);
// rtk(出力を縮めて別のツールを実行するツール)の、後ろのコマンドをそのまま実行する下位のコマンド。
const RTK_RUNNERS = new Set(['run', 'bypass', 'proxy', 'err', 'test', 'summary']);

// 文字列を、連結の区切りで分けた語の並びにする。リダイレクトの先は語に入れず、並びの targets に集める。
export function parse(text) {
  const commands = [];
  let words = [];
  let targets = [];
  let word = null;
  let skip = false; // 次の語はリダイレクトの先
  let heredocs = [];
  const push = () => {
    if (word === null) return;
    if (skip) {
      targets.push(word);
      skip = false;
    } else {
      words.push(word);
    }
    word = null;
  };
  const end = () => {
    push();
    skip = false;
    if (words.length || targets.length) commands.push(Object.assign(words, { targets }));
    words = [];
    targets = [];
  };
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\\') {
      const next = text[i + 1] ?? '';
      word = (word ?? '') + (next === '\n' ? '' : next);
      i += 2;
    } else if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const stop = close < 0 ? n : close;
      word = (word ?? '') + text.slice(i + 1, stop);
      i = stop + 1;
    } else if (c === '"') {
      let j = i + 1;
      let buffer = '';
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < n && '"\\$`\n'.includes(text[j + 1])) {
          buffer += text[j + 1] === '\n' ? '' : text[j + 1];
          j += 2;
        } else {
          buffer += text[j];
          j += 1;
        }
      }
      word = (word ?? '') + buffer;
      i = j + 1;
    } else if (c === '\n') {
      end();
      i += 1;
      for (const { terminator, strip } of heredocs) i = skipHeredoc(text, i, terminator, strip);
      heredocs = [];
    } else if (c === ' ' || c === '\t') {
      push();
      i += 1;
    } else if (c === '#' && word === null) {
      const eol = text.indexOf('\n', i);
      i = eol < 0 ? n : eol;
    } else if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      push();
      let j = i + 2;
      const strip = text[j] === '-';
      if (strip) j += 1;
      while (text[j] === ' ') j += 1;
      const found = /^(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(text.slice(j));
      if (found) {
        heredocs.push({ terminator: found[2], strip });
        i = j + found[0].length;
      } else {
        i = j;
      }
    } else if (c === '>' || c === '<' || (c === '&' && text[i + 1] === '>')) {
      if (word !== null && /^\d+$/.test(word)) word = null;
      else push();
      let j = i + 1;
      while (j < n && '>&|'.includes(text[j])) j += 1;
      skip = true;
      i = j;
    } else if (c === ';' || c === '(' || c === ')' || c === '`') {
      end();
      i += 1;
    } else if (c === '&') {
      end();
      i += text[i + 1] === '&' ? 2 : 1;
    } else if (c === '|') {
      end();
      i += text[i + 1] === '|' || text[i + 1] === '&' ? 2 : 1;
    } else {
      word = (word ?? '') + c;
      i += 1;
    }
  }
  end();
  return commands;
}

function skipHeredoc(text, from, terminator, strip) {
  let i = from;
  while (i < text.length) {
    const eol = text.indexOf('\n', i);
    const stop = eol < 0 ? text.length : eol;
    const line = text.slice(i, stop);
    i = stop + 1;
    if ((strip ? line.replace(/^\t+/, '') : line) === terminator) break;
  }
  return Math.min(i, text.length);
}

// 前に付く語(代入、env、sudo、timeout、npx、rtk など)を外し、実行されるツールを先頭にする。
// 代入は assignments に集める。
export function unwrap(input) {
  const words = input.slice();
  const assignments = {};
  const dropFlags = (valued) => {
    while (words[0]?.startsWith('-')) {
      const flag = words.shift();
      if (valued.includes(flag)) words.shift();
    }
  };
  for (;;) {
    const head = words[0];
    if (head === undefined) break;
    if (HEADERS.has(head)) {
      words.length = 0;
    } else if (ASSIGNMENT.test(head)) {
      const at = head.indexOf('=');
      assignments[head.slice(0, at)] = head.slice(at + 1);
      words.shift();
    } else if (KEYWORDS.has(head) || PREFIXES.has(head)) {
      words.shift();
      if (head === 'sudo') dropFlags(['-u', '-g', '-C', '-h', '-p']);
    } else if (head === 'env') {
      words.shift();
      while (words[0] && (words[0].startsWith('-') || ASSIGNMENT.test(words[0]))) {
        const item = words.shift();
        if (item === '-u' || item === '-C' || item === '-S') words.shift();
        else if (ASSIGNMENT.test(item)) assignments[item.slice(0, item.indexOf('='))] = item.slice(item.indexOf('=') + 1);
      }
    } else if (head === 'timeout' || head === 'gtimeout') {
      words.shift();
      dropFlags(['-s', '-k', '--signal', '--kill-after']);
      words.shift();
    } else if (head === 'rtk') {
      // `rtk git push` は git push を実行する。rtk を外して、実行されるツールを読む。
      // 文字列で渡す形(`rtk run -c '…'`、`rtk err --shell sh '…'`)は、シェルに渡す形へ直して、中身を読ませる。
      words.shift();
      dropFlags([]);
      if (RTK_RUNNERS.has(words[0])) {
        words.shift();
        let script;
        let viaShell = false;
        while (words[0]?.startsWith('-')) {
          const flag = words.shift();
          if (flag === '-c' || flag === '--command') script = words.shift();
          else if (flag.startsWith('--command=')) script = flag.slice('--command='.length);
          else if (flag === '--shell') viaShell = Boolean(words.shift());
          else if (flag.startsWith('--shell=')) viaShell = true;
        }
        if (script === undefined && viaShell && words.length) script = words.join(' ');
        if (script !== undefined) words.splice(0, words.length, 'sh', '-c', script);
      }
    } else if (head === 'nice') {
      words.shift();
      if (words[0] === '-n') words.splice(0, 2);
      else if (/^-\d+$/.test(words[0] ?? '')) words.shift();
    } else if (head === 'npx' || head === 'bunx' || head === 'pnpx') {
      words.shift();
      dropFlags(['-p', '--package', '-c']);
    } else if ((head === 'pnpm' || head === 'yarn') && (words[1] === 'exec' || words[1] === 'dlx')) {
      words.splice(0, 2);
    } else if (head === 'bun' && words[1] === 'x') {
      words.splice(0, 2);
    } else {
      break;
    }
  }
  if (words.length) words[0] = path.basename(words[0]);
  return { words, assignments };
}

// 文字列に含まれる単純なコマンドを、実行される場所(cwd)と一緒に順に返す。
// `cd` は後ろのコマンドの場所を変え、`sh -c '…'` と `eval` は中身を読む。
export function simpleCommands(text, cwd = process.cwd(), depth = 0) {
  const out = [];
  let here = cwd;
  for (const raw of parse(text)) {
    const { words, assignments } = unwrap(raw);
    if (!words.length) {
      if (raw.targets?.length) out.push({ words, assignments, targets: raw.targets, cwd: here });
      continue;
    }
    const head = words[0];
    if (head === 'cd' && words[1] && !words[1].startsWith('-')) {
      here = path.resolve(here, words[1]);
      continue;
    }
    if (depth < 3 && SHELLS.has(head)) {
      const at = words.findIndex((word, index) => index > 0 && /^-[a-z]*c[a-z]*$/.test(word));
      if (at > 0 && words[at + 1] !== undefined) {
        out.push(...simpleCommands(words[at + 1], here, depth + 1));
        continue;
      }
    }
    if (depth < 3 && head === 'eval' && words.length > 1) {
      out.push(...simpleCommands(words.slice(1).join(' '), here, depth + 1));
      continue;
    }
    out.push({ words, assignments, targets: raw.targets ?? [], cwd: here });
  }
  return out;
}
