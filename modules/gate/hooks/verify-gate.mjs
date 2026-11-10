// testing の規則をすり抜けたコマンドを止める、最後のゲート。作業中に全体へ回された時間のかかる検査と、
// フォアグラウンドで待つだけのコマンドを見つけ、理由と代わりの手を添えてエージェントへ差し戻す。
// 待ち方を取り違えたコマンドも止める: サブエージェントがバックグラウンドで始める検査(完了が届かない)と、
// 対話を担当するセッションがフォアグラウンドで CI を待つコマンド(そのあいだユーザーと会話できない)である。
// ただしサブエージェントには、途中でバックグラウンドへ移されたコマンドを待つための、短い上限の付いた条件つきの待ちを通す。
//
// どの言語・どのツールにも同じように効くよう、ツールごとの規則は持たない。検査かどうかはコマンドに含まれる
// 語で、重いかどうかは同じリポジトリーの同じ場所で直近にかかった実測の時間で見分ける。初めて見る検査は
// 通して時間を記録し、記録がそろってから判定に使う。
//
// 重い検査は、前回の実行からの作業ツリーの状態も見る。HEAD もコミットしていない変更も前回と同じなら、
// 結果は前回と変わらないので止める。同じ状態でも結果が変わりうる検査だけ、宣言を付けて通す。
//
// Claude Code と Codex は同じ入出力(stdin の JSON と hookSpecificOutput)を使うので、1 つで両方に効く。
// 判定できない入力や記録の失敗は必ず通す — ゲートの誤りで作業そのものを止めないため。

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 共有のブランチへ push する前の検査であることの宣言。付ける瞬間に、作業が本当に push できるところまで来たかを判断させる。
export const FINAL = 'DOTAGENTS_VERIFY=final';

// 前回と同じ状態でも結果が変わりうる検査であることの宣言。ネットワークに依存する検査や、不安定なテストの確認に使う。
export const REPEAT = 'DOTAGENTS_REPEAT=1';

// 直近の実行の中央値がこれ以上の検査を、作業中へ回したときに止める。記録が 2 回そろうまで判定せず、
// 中央値を使うのは、キャッシュの切れた 1 回や権限の確認を待った 1 回で、普段は軽い検査まで止めないため。
export const HEAVY_SECONDS = 45;
const RUNS_KEPT = 3;
const RUNS_NEEDED = 2;
// これより短い sleep と、待つ合計がこれより短いループは、正当な短い待ちとして通す。
const LONG_SLEEP_SECONDS = 30;
// Claude Code は、サブエージェントのフォアグラウンドのコマンドを 180 秒でバックグラウンドへ移すことがある。移されたコマンドの
// 終わりは、その手前で終わる待ちを繰り返して待つしかないので、サブエージェントにはこの秒数以内の条件つきの待ちを通す。
export const MOVED_WAIT_SECONDS = 175;
// 実行が終わらなかった呼び出しの記録を、この時間が過ぎたら片付ける。
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
// 作業ツリーの状態を読むのに待つ上限。超えたら状態を見ずに通す。
const STATE_TIMEOUT_MS = 5000;

// 検査を表す語。テスト、静的検査、型チェックの名前は、どのエコシステムでもこれらの語を含む。
// latest と inspect は、語を含んでいても検査ではない。
const CHECK_WORD = /(?<!la)test|(?<!in)spec|check|lint|verify|e2e|tsc|mypy|pyright|clippy/i;
// 出力の整形、移動、表示だけをするコマンド。検査の実体ではないので、記録の鍵から外す。
const NOISE = new Set(['cd', 'pushd', 'popd', 'echo', 'printf', 'tail', 'head', 'grep', 'rg', 'sed', 'awk', 'cat', 'tee',
  'wc', 'sort', 'uniq', 'cut', 'tr', 'jq', 'true', 'false', ':', 'date', 'set', 'export', 'source', '.', 'ls', 'pwd',
  'test', '[', 'sleep', 'mkdir', 'rm', 'touch']);
// バージョン管理とホスティングの操作は、checkout や pr checks のように検査の語を含んでも検査ではない。
const NOT_CHECK = new Set(['git', 'gh']);
// 道具の導入や更新は、検査の道具の名前を含んでいても検査ではない。
const INSTALL_VERB = new Set(['install', 'i', 'add', 'uninstall', 'remove', 'upgrade', 'update']);
// 設定ファイルの指定は、対象の絞り込みではない。
const CONFIG_LIKE = /config|\.(json|jsonc|json5|toml|ya?ml|ini|cfg|conf|properties|xml)$/i;
// 実行の指示そのもの、今いる場所全体、数や真偽の設定値は、対象の絞り込みではない。
const NOT_TARGET = /^(run|\.\/?|\d+(\.\d+)?%?|true|false|auto|none)$/i;
// 値を取る設定のオプション。その値は、対象の絞り込みではない。
const SETTING_FLAG = /^--?(projects?|reporters?|format|output|out|config|c|workers|max-workers|jobs|j|n|pool|shard|retries|retry|timeout|colou?rs?|pretty|preset|env|environment|mode|profile|log-level|seed|coverage[\w.-]*)$/i;
// 値で対象を選ぶオプション(-k name、--filter=name、-Dtest=Name など)。
const FILTER_FLAG = /test|spec|filter|grep|pattern|match|name|only|focus/i;
// 起動を確かめる手段。待ちのループに含まれていれば、起動待ちとして通す。
const READINESS = /^(curl|wget|nc|lsof|ping)$|ready|health/i;
// 同じ道具を呼ぶ起動の形。どれで呼んでも行う検査は同じなので、記録の鍵では区別しない。
const LAUNCHERS = ['npx', 'bunx', 'bun x', 'bun run', 'npm exec', 'npm run', 'pnpm exec', 'pnpm dlx', 'pnpm run', 'yarn exec',
  'yarn run', 'uv run', 'poetry run', 'pipenv run', 'bundle exec'].map((l) => l.split(' '));
// 出力の形、並列の度合い、最初の失敗で止めるかだけを変え、検査の中身を変えないオプション。値を取るものと取らないもの。
// 記録の鍵から外す。外さないと、付け替えるだけで初めて見る検査として通ってしまう。
const PRESENTATION_VALUE = /^--?(reporters?|format|pretty|colou?rs?|checkers|workers|max-?workers|jobs|j|threads|bail|max-?failures|maxfail)$/i;
const PRESENTATION_SWITCH = /^--?(silent|quiet|q|verbose|v|no-colou?r|x|exitfirst)$/i;
const PRESENTATION_ARG = /^(\d+%?|true|false|auto|[a-z][\w-]*)$/i;
// 既定の設定の場所を明示しただけの指定。
const DEFAULT_PROJECT = /^(\.\/?|(\.\/)?tsconfig\.json)$/;
// ファイルで対象を絞れない、プログラム全体を見る検査。増分で検査する指定が代わりの手になる。
const PROGRAM_WIDE = /tsc|mypy|pyright|typecheck|type-check|\btypes\b|clippy/i;

// ---------------------------------------------------------------- コマンドの読み取り

// ヒアドキュメントの本文はコマンドではない。ファイルへ書き出すスクリプトの中身で誤って止めないよう先に除く。
function stripHeredocs(command) {
  const out = [];
  let delimiter = null;
  for (const line of command.split('\n')) {
    if (delimiter) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }
    out.push(line);
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/);
    if (m) delimiter = m[2];
  }
  return out.join('\n');
}

// 引用符を保ったまま、&& || ; | & 改行 括弧 でコマンドを区切る。2>&1 の & は区切りではない。
// 単独の & で切り離した区切り(括弧でまとめたものを含む)には background の印を付ける。
export function segments(command) {
  const text = stripHeredocs(command);
  const out = [];
  const groups = [];
  let closed = null;
  let current = [];
  let token = '';
  let started = false;
  let quote = null;
  const endToken = () => {
    if (started) current.push(token);
    token = '';
    started = false;
  };
  const endSegment = () => {
    endToken();
    if (current.length) out.push(current);
    current = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < text.length) token += text[++i];
      else token += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; started = true; closed = null; continue; }
    if (c === '\\' && i + 1 < text.length) { token += text[++i]; started = true; closed = null; continue; }
    if (c === ' ' || c === '\t') { endToken(); continue; }
    if (c === '&' && (/[<>]$/.test(token) || text[i + 1] === '>')) { token += c; started = true; continue; }
    if (c === '&' && text[i + 1] !== '&' && text[i - 1] !== '&') {
      endToken();
      if (current.length) current.background = true;
      else if (closed) for (const s of out.slice(closed[0], closed[1])) s.background = true;
      endSegment();
      closed = null;
      continue;
    }
    if (c === '(') { endSegment(); groups.push(out.length); closed = null; continue; }
    if (c === ')') { endSegment(); closed = [groups.pop() ?? 0, out.length]; continue; }
    if ('\n;|&'.includes(c)) { endSegment(); closed = null; continue; }
    token += c;
    started = true;
    closed = null;
  }
  endSegment();
  return out;
}

// リダイレクトの行き先は対象の指定ではない。> out.txt を絞り込みと読み違えないよう除く。
function stripRedirections(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^(\d*|&)(>>?|<)$/.test(t)) { i++; continue; }
    if (/^(\d*|&)(>>?|<)/.test(t)) continue;
    out.push(t);
  }
  return out;
}

// 環境変数の代入、シェルの制御語、timeout などの包みを外し、実際に走るコマンドを先頭に出す。
function unwrap(tokens) {
  const t = stripRedirections(tokens);
  for (;;) {
    while (t.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]) || ['do', 'then', 'else', 'elif', '{', '!'].includes(t[0]))) t.shift();
    const head = t[0];
    if (head === 'env') {
      t.shift();
      while (t.length && (t[0].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]))) { if (t[0] === '-u') t.shift(); t.shift(); }
      continue;
    }
    if (head === 'timeout') {
      t.shift();
      while (t.length && t[0].startsWith('-')) { if (t[0] === '-k' || t[0] === '-s') t.shift(); t.shift(); }
      t.shift();
      continue;
    }
    if (['time', 'command', 'exec', 'nohup'].includes(head)) {
      t.shift();
      while (t.length && t[0].startsWith('-')) t.shift();
      continue;
    }
    if (head === 'nice') {
      t.shift();
      if (t[0] === '-n') t.splice(0, 2);
      continue;
    }
    // 依存に入れた道具をパスで直接呼んでも、道具の名前で呼んだのと同じコマンドである。
    if (head?.includes('node_modules/.bin/')) t[0] = path.basename(head);
    return t;
  }
}

// sh -c '…' の中身も 1 つのコマンドとして読む。background で切り離した区切りは、待たないので読まない。
function expand(command) {
  return segments(command).filter((s) => !s.background).flatMap((tokens) => {
    const t = unwrap(tokens);
    const k = ['sh', 'bash', 'zsh'].includes(t[0]) ? t.findIndex((a) => /^-[a-z]*c$/.test(a)) : -1;
    return k > 0 && t[k + 1] ? expand(t[k + 1]) : [t];
  });
}

// ./... のような「すべて」を表す指定は、パスの形でも絞り込みではない。
const isPathLike = (a) => !a.startsWith('-') && !CONFIG_LIKE.test(a) && !a.endsWith('...') &&
  (a.includes('/') || a.includes('::') || /\.[A-Za-z][A-Za-z0-9]*(:\d+)?$/.test(a));

// 検査の語を持つ語の位置。導入や更新の動詞が先に来るなら、検査ではない。
function checkIndex(tokens) {
  if (NOT_CHECK.has(tokens[0])) return -1;
  const i = tokens.findIndex((a) => !a.startsWith('-') && !isPathLike(a) && CHECK_WORD.test(a));
  return i >= 0 && !tokens.slice(0, i).some((a) => INSTALL_VERB.has(a)) ? i : -1;
}

// 名前で対象を選ぶオプション(--filter=name、-Dtest=Name など)。
function filters(a) {
  const eq = a.indexOf('=');
  return a.startsWith('-') && eq > 0 && FILTER_FLAG.test(a.slice(0, eq)) && eq + 1 < a.length;
}

// 検査の語より後ろに、対象を選ぶ指定があるか。パス、テスト名、名前で選ぶオプションの値を絞り込みとして読む。
// 設定のオプションの値、数や真偽、設定ファイルは読まない。迷う指定は絞り込みとして通す側に倒す。
function narrows(tokens) {
  const at = checkIndex(tokens);
  if (tokens.slice(0, at).some(filters)) return true;
  const args = tokens.slice(at + 1);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') continue;
    if (a.startsWith('-')) {
      if (filters(a)) return true;
      if (!a.includes('=') && SETTING_FLAG.test(a) && args[i + 1] && !args[i + 1].startsWith('-')) i++;
      continue;
    }
    if (isPathLike(a)) return true;
    if (NOT_TARGET.test(a) || CONFIG_LIKE.test(a) || a.endsWith('...')) continue;
    return true;
  }
  return false;
}

// 記録の鍵にする語の並び。起動の形と、検査の中身を変えないオプションを外す。
function keyTokens(tokens) {
  let t = [...tokens];
  const launcher = LAUNCHERS.find((l) => l.every((w, i) => t[i] === w));
  if (launcher) {
    t = t.slice(launcher.length);
    while (t.length > 1 && t[0].startsWith('-')) t.shift();
  }
  const out = [];
  for (let i = 0; i < t.length; i++) {
    const a = t[i];
    const eq = a.indexOf('=');
    if (PRESENTATION_SWITCH.test(a)) continue;
    if (PRESENTATION_VALUE.test(eq > 0 ? a.slice(0, eq) : a)) {
      if (eq < 0 && PRESENTATION_ARG.test(t[i + 1] ?? '')) i++;
      continue;
    }
    if ((a === '-p' || a === '--project') && DEFAULT_PROJECT.test(t[i + 1] ?? '')) { i++; continue; }
    out.push(a);
  }
  return out;
}

// 検査の実体になる区切りだけを残し、同じ検査が毎回同じ鍵になるよう並べる。cd の行き先は、場所として別に返す。
export function describe(command) {
  const all = expand(command);
  let cd = null;
  for (const t of all) {
    if (checkIndex(t) >= 0) break;
    if (['cd', 'pushd'].includes(t[0]) && t[1] && !/[$`]/.test(t[1]) && t[1] !== '-') cd = cd && !path.isAbsolute(t[1]) && !t[1].startsWith('~') ? path.join(cd, t[1]) : t[1];
  }
  const checks = all.filter((t) => t.length && !NOISE.has(t[0]) && checkIndex(t) >= 0);
  if (!checks.length) return null;
  return {
    // 検査でない部分(git log、python3 - など)を前に付けても、起動の形や出力の指定を変えても、同じ検査として測る。
    key: checks.map((t) => keyTokens(t).join(' ')).join(' && '),
    targeted: checks.every(narrows),
    cd,
  };
}

const timeUnit = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };
function sleepSeconds(tokens) {
  if (tokens[0] !== 'sleep') return 0;
  return tokens.slice(1).reduce((sum, a) => {
    if (a === 'infinity') return Infinity;
    const m = a.match(/^(\d+(?:\.\d+)?)([smhd]?)$/);
    return m ? sum + Number(m[1]) * timeUnit[m[2]] : sum;
  }, 0);
}

// tail -f は出力を待ち続け、自分では終わらない。timeout で包んでも、決めた時間だけ待つ処理になる。
const follows = (tokens) => tokens[0] === 'tail' && tokens.slice(1).some((a) => /^-[a-zA-Z]*[fF]/.test(a) || /^--follow(=|$)/.test(a));
// caffeinate -w と tail --pid は、指定したプロセスが終わるまで待つ。
const waitsForProcess = (tokens) => (tokens[0] === 'caffeinate' && tokens.slice(1).some((a) => /^-[a-zA-Z]*w$/.test(a))) ||
  (tokens[0] === 'tail' && tokens.slice(1).some((a) => /^--pid(=|$)/.test(a)));
const shellBody = (tokens) => {
  const k = ['sh', 'bash', 'zsh'].includes(tokens[0]) ? tokens.findIndex((a) => /^-[a-z]*c$/.test(a)) : -1;
  return k > 0 ? tokens[k + 1] ?? null : null;
};

// for の反復が書かれた値の並びなら、その回数を返す。変数や展開で決まるなら null(上限が読めない)。
function iterations(head, next) {
  if (head[0] !== 'for' || head[2] !== 'in') return null;
  const list = head.slice(3);
  if (list.length === 1 && list[0] === '$' && next?.[0] === 'seq') {
    const n = next.slice(1).map(Number);
    if (!n.length || n.some(Number.isNaN)) return null;
    const [first, step, last] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n;
    return step ? Math.max(0, Math.floor((last - first) / step) + 1) : null;
  }
  let count = 0;
  for (const a of list) {
    const range = a.match(/^\{(-?\d+)\.\.(-?\d+)\}$/);
    if (range) count += Math.abs(Number(range[2]) - Number(range[1])) + 1;
    else if (/[$`*?[{]/.test(a)) return null;
    else count++;
  }
  return count;
}

// フォアグラウンドで待つだけのコマンドを見つける。起動を確かめるループと、待つ合計の短い繰り返しは通す。
// sh -c '…' の中身も読む。包んでも、待つことに変わりはない。sleep を短く刻んでも、回数を重ねれば待ちになる。
export function findWait(command) {
  const raw = segments(command).filter((s) => !s.background);
  const segs = raw.map(unwrap);
  for (const body of segs.map(shellBody)) {
    const inner = body && findWait(body);
    if (inner) return inner;
  }
  const readiness = segs.some((s) => s.some((t) => READINESS.test(path.basename(t))));
  if (!readiness && segs.some(follows)) return 'tail -f で出力を待ち続ける処理';
  if (segs.some(waitsForProcess)) return 'プロセスの終わりを待つ処理';
  const longest = Math.max(0, ...segs.map(sleepSeconds));
  if (longest === Infinity) return '終わりの無い sleep';
  const loops = raw.map((s, i) => (['until', 'while', 'for'].includes(s[0]) ? iterations(s, raw[i + 1]) : undefined))
    .filter((n) => n !== undefined);
  if (!loops.length) return longest >= LONG_SLEEP_SECONDS ? `${longest} 秒の sleep` : null;
  if (longest === 0 || readiness) return null;
  if (loops.some((n) => n === null)) return 'sleep を挟んで状態を確かめ続けるループ';
  const total = Math.max(...loops) * longest;
  return total >= LONG_SLEEP_SECONDS ? `sleep を挟んで ${total} 秒ほど待つループ` : null;
}

// CI の完了を待つコマンド。対話を担当するセッションでは、バックグラウンドへ回せば完了が通知で届く。
export function findCiWait(command) {
  const watches = (t) => t[0] === 'gh' && ((t[1] === 'run' && t[2] === 'watch') ||
    (t[1] === 'pr' && t[2] === 'checks' && t.some((a) => a === '--watch' || a.startsWith('--watch='))));
  return expand(command).some(watches) ? 'CI の完了を待つコマンド' : null;
}

// timeout で包んだ区切りなら、その秒数。
function timeoutSeconds(tokens) {
  const t = stripRedirections(tokens);
  let i = 0;
  while (i < t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i])) i++;
  if (t[i++] !== 'timeout') return null;
  while (i < t.length && t[i].startsWith('-')) { if (t[i] === '-k' || t[i] === '-s') i++; i++; }
  const m = t[i]?.match(/^(\d+(?:\.\d+)?)([smhd]?)$/);
  return m ? Number(m[1]) * timeUnit[m[2]] : null;
}

// 待つ条件があるか。until・while の判定、break、プロセスの終わり。条件の無い待ちは、決めた時間を待ち過ごす。
function conditional(segs) {
  return segs.some((s) => (s[0] === 'until' && s[1] !== 'false') || (s[0] === 'while' && !['true', ':'].includes(s[1])) ||
    s[0] === 'break' || waitsForProcess(s));
}

// サブエージェントが、途中でバックグラウンドへ移されたコマンドを待つ形か。待ちがどれも条件つきで、移されるまでの時間の
// 手前で終わることが読めるものに限る。上限は、timeout で包んだ区切りならその値、回数の決まった for ならその回数 × sleep。
export function boundedWait(command) {
  const raw = segments(command).filter((s) => !s.background);
  const segs = raw.map(unwrap);
  const wrapped = [];
  const free = [];
  raw.forEach((s, i) => {
    const body = shellBody(segs[i]);
    const waits = body ? Boolean(findWait(body)) : waitsForProcess(segs[i]) || sleepSeconds(segs[i]) > 0 || follows(segs[i]);
    if (waits && timeoutSeconds(s) !== null) wrapped.push({ limit: timeoutSeconds(s), body, tokens: segs[i] });
    else free.push(i);
  });
  for (const w of wrapped) {
    if (w.limit > MOVED_WAIT_SECONDS) return false;
    if (!conditional(w.body ? segments(w.body).filter((s) => !s.background).map(unwrap) : [w.tokens])) return false;
  }
  const rest = free.map((i) => segs[i]);
  if (rest.some((s) => follows(s) || waitsForProcess(s) || (shellBody(s) && findWait(shellBody(s))))) return false;
  const loops = free.map((i) => (['until', 'while', 'for'].includes(raw[i][0]) ? iterations(raw[i], raw[i + 1]) : undefined))
    .filter((n) => n !== undefined);
  const longest = Math.max(0, ...rest.map(sleepSeconds));
  if (!loops.length) return wrapped.length > 0 && longest < LONG_SLEEP_SECONDS;
  if (loops.some((n) => n === null) || !rest.some((s) => s[0] === 'break')) return false;
  return Math.max(...loops) * longest <= MOVED_WAIT_SECONDS;
}

// ---------------------------------------------------------------- 実測の記録

// worktree を含め、同じリポジトリーのセッションは同じ記録を読む。top は作業ツリーの最上位、root は共有の本体。
function locate(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const git = path.join(dir, '.git');
    let st = null;
    try { st = fs.statSync(git); } catch { st = null; }
    if (st?.isDirectory()) return { top: dir, root: dir };
    if (st?.isFile()) {
      const gitdir = fs.readFileSync(git, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
      if (!gitdir) return { top: dir, root: dir };
      const resolved = path.resolve(dir, gitdir);
      try {
        return { top: dir, root: path.dirname(path.resolve(resolved, fs.readFileSync(path.join(resolved, 'commondir'), 'utf8').trim())) };
      } catch {
        return { top: dir, root: dir };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return { top: path.resolve(cwd), root: path.resolve(cwd) };
    dir = parent;
  }
}

// 作業ツリーの状態を 1 つの値にまとめる。HEAD と、コミットしていない変更(追跡していないファイルを含む)の
// 名前・大きさ・更新時刻から作る。git が答えないときは null を返し、同じ状態かどうかを判定しない。
function fingerprint(top) {
  const git = (args) => {
    const r = spawnSync('git', ['-C', top, ...args], { encoding: 'utf8', timeout: STATE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    return r.status === 0 ? r.stdout : null;
  };
  const head = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain=v1', '-z', '-uall', '--no-renames']);
  if (head === null || status === null) return null;
  const hash = crypto.createHash('sha256').update(head).update(status);
  for (const entry of status.split('\0')) {
    const rel = entry.slice(3);
    if (!rel) continue;
    try {
      const st = fs.statSync(path.join(top, rel));
      hash.update(`\0${st.size}\0${st.mtimeMs}`);
    } catch {
      hash.update('\0-');
    }
  }
  return hash.digest('hex').slice(0, 32);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

// 偶数個なら小さい側を取る。2 回の記録のうち 1 回だけ遅くても、止める理由にしない。
function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
}

const pendingFile = (dir, id) => path.join(dir, 'pending', `${String(id).replace(/[^\w-]/g, '_')}.json`);

export function createStore(input, env = process.env) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const { top, root } = locate(cwd);
  const home = env.DOTAGENTS_HOME ? path.resolve(env.DOTAGENTS_HOME) : path.join(os.homedir(), '.dotagents');
  const dir = path.join(home, 'cache', 'gate', crypto.createHash('sha256').update(root).digest('hex').slice(0, 16));
  const durations = path.join(dir, 'durations.json');
  // 検査が走る場所と、その作業ツリーの最上位。
  const at = (cd) => {
    const where = cd ? path.resolve(cwd, cd.replace(/^~(?=$|\/)/, os.homedir())) : cwd;
    return { where, top: cd ? locate(where).top : top };
  };
  return {
    // 同じコマンドでも、実行する場所(作業ツリーの最上位からの相対)が違えば別の検査として測る。
    scope(cd) {
      const { where, top: base } = at(cd);
      const rel = path.relative(base, where);
      return rel.startsWith('..') || path.isAbsolute(rel) ? where : rel || '.';
    },
    // 直近の実行の中央値。記録がそろうまでは判定しない。
    seconds(key) {
      const runs = readJson(durations, {})[key]?.runs ?? [];
      return runs.length >= RUNS_NEEDED ? median(runs) : null;
    },
    // いまの作業ツリーの状態。worktree ごとに別の値として扱う。
    state(cd) {
      const tree = at(cd).top;
      const value = fingerprint(tree);
      return value === null ? null : { tree, value };
    },
    // この検査を、同じ worktree で最後に実行したときと同じ状態か。並行する別の worktree の実行には左右されない。
    unchanged(key, state) { return readJson(durations, {})[key]?.states?.[state.tree] === state.value; },
    start(id, key, now, state = null) { writeJson(pendingFile(dir, id), { key, at: now, state }); },
    finish(id, now) {
      const file = pendingFile(dir, id);
      const pending = readJson(file, null);
      if (!pending) return;
      fs.rmSync(file, { force: true });
      const all = readJson(durations, {});
      const runs = [...(all[pending.key]?.runs ?? []), Math.round((now - pending.at) / 1000)].slice(-RUNS_KEPT);
      // 消えた worktree の状態は持ち越さない。
      const states = Object.fromEntries(Object.entries(all[pending.key]?.states ?? {}).filter(([tree]) => fs.existsSync(tree)));
      if (pending.state) states[pending.state.tree] = pending.state.value;
      all[pending.key] = { runs, at: now, states };
      writeJson(durations, all);
      for (const f of fs.readdirSync(path.dirname(file))) {
        const p = path.join(path.dirname(file), f);
        if (now - fs.statSync(p).mtimeMs > PENDING_TTL_MS) fs.rmSync(p, { force: true });
      }
    },
  };
}

// ---------------------------------------------------------------- 判定

// 型の検査のようにファイルで絞れない検査に「変更したファイルだけ」と返すと、言い換えてすり抜けるか、検査をやめてしまう。
// push の前の検査は統合する側が行う。サブエージェントに宣言を示すと、絞った実行にまで付けるようになる。
function heavyMessage(command, seconds, key, sub) {
  const instead = PROGRAM_WIDE.test(key)
    ? 'プログラム全体を見る検査は、作業中は増分で検査する指定(前回の結果を再利用する指定)で実行してください。'
    : '作業中は、変更したファイルだけを検査してください。絞り方は testing スキルにあります。';
  const final = sub
    ? 'サブエージェントは push の前の検査を行いません。全体の結果は、統合する側の push の前の検査と CI が確かめます。'
    : `統合する側が共有のブランチへ push する前に行う検査なら、コマンドの先頭に \`${FINAL}\` を付けて実行し直してください。`;
  return `直近の実行で ${seconds} 秒ほどかかっている検査を、対象を絞らずに実行しようとしています(\`${command.trim()}\`)。${instead}${final}`;
}

// サブエージェントのフォアグラウンドのコマンドが途中でバックグラウンドへ移されたときの待ち方。のぞき直しや決めた時間の
// 待ちは、終わった後も待ち過ごすか、何度もやりとりを重ねる。
const MOVED = 'フォアグラウンドのコマンドが途中でバックグラウンドへ移されたら(Claude Code では 180 秒を超えると移されることがあります)、' +
  `その出力のファイルに終わりの印が出るまで待つ 1 つのコマンドを、${MOVED_WAIT_SECONDS} 秒以内の上限を付けて実行し、終わるまで繰り返してください。` +
  "例: `for i in $(seq 1 34); do grep -q '<終わりの印>' <出力のファイル> && break; sleep 5; done`。" +
  '出力を何度ものぞき直したり、決めた時間を待ったりはしないでください。';

function backgroundMessage(command) {
  return `サブエージェントが、検査をバックグラウンドで始めようとしています(\`${command.trim()}\`)。` +
    'サブエージェントはターンを終えると親へ戻るので、バックグラウンドに回した検査の完了は、ターンを終えた後には届きません。' +
    '検査は、時間の上限(ツールの timeout か、コマンド自身の待ち時間の指定)を付けてフォアグラウンドで実行してください。' + MOVED +
    '上限に収まらない全体の検査は作業中には実行せず、push の前の検査に任せてください。';
}

function repeatMessage(command) {
  return `前回の実行から作業ツリーが変わっていない検査を、もう一度実行しようとしています(\`${command.trim()}\`)。` +
    'HEAD もコミットしていない変更も前回と同じなので、結果は前回と変わりません。前回の結果をそのまま使ってください。' +
    `ネットワークに依存する検査や、不安定なテストの確認のように、同じ状態でも結果が変わりうる場合だけ、コマンドの先頭に \`${REPEAT}\` を付けて実行し直してください。`;
}

// サブエージェントはターンを終えると親へ戻り、バックグラウンドに回した物の完了は届かない。だから自分で
// 待つ形を示す。エージェントは前面で起動すれば、終わった時点で結果が返り、決めた時間を待ち過ごさない。
function waitMessage(kind, main) {
  return main
    ? `待つための処理です(${kind})。サブエージェント、CI、時間のかかるコマンドは、バックグラウンドで実行すれば終わったときに通知が届きます。` +
      'CI の完了を待つコマンドも、バックグラウンドで実行してください。待つあいだはターンを終えて、ユーザーと会話できる状態に戻ってください。'
    : `待つための処理です(${kind})。エージェントの完了を待つなら、並行させるエージェントを 1 つのメッセージでまとめてフォアグラウンドで起動してください。終わった時点で結果が返ります。` +
      '自分で待つ必要がある処理は、処理そのものを時間の上限を付けてフォアグラウンドで実行してください。CI は、CI の完了を待つコマンドで待てます。' + MOVED;
}

// Claude Code は subagent からの呼び出しにだけ agent_id を付ける。Codex の入力には transcript_path が無い。
const isMainSession = (input) => !input.agent_id && typeof input.transcript_path === 'string';

// argv の配列で渡されたら、シェルの -c の中身か、引数をつないだ 1 行として読む。
const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replaceAll("'", "'\\''")}'`);
function commandOf(input) {
  const c = input?.tool_input?.command;
  if (!Array.isArray(c)) return c;
  const argv = c.map(String);
  const k = ['sh', 'bash', 'zsh'].includes(path.basename(argv[0] ?? '')) ? argv.findIndex((a) => /^-[a-z]*c$/.test(a)) : -1;
  return k > 0 ? argv[k + 1] : argv.map(quote).join(' ');
}

// PreToolUse: 止めるなら理由を返す。通す検査は、終わったときに時間を測れるよう開始を記録する。
export function before(input, store, now = Date.now()) {
  const command = commandOf(input);
  if (typeof command !== 'string' || !command.trim()) return null;
  const background = input.tool_input?.run_in_background === true;
  const main = isMainSession(input);
  if (!background) {
    const wait = findWait(command) ?? (main ? findCiWait(command) : null);
    if (wait && !(input.agent_id && boundedWait(command))) return { reason: waitMessage(wait, main) };
  }
  const check = describe(command);
  if (!check) return null;
  if (background && input.agent_id) return { reason: backgroundMessage(command) };
  const scope = store.scope(check.cd);
  const key = scope === '.' ? check.key : `${scope}: ${check.key}`;
  const seconds = store.seconds(key);
  // 状態を読むのは重い検査のときだけにする。軽い検査のたびに git を呼ぶと、その分だけ全体が遅くなる。
  let state = null;
  if (seconds !== null && seconds >= HEAVY_SECONDS) {
    state = store.state(check.cd);
    if (state && !command.includes(REPEAT) && store.unchanged(key, state)) {
      return { reason: repeatMessage(command) };
    }
    if (!command.includes(FINAL) && !check.targeted) return { reason: heavyMessage(command, seconds, check.key, Boolean(input.agent_id)) };
  }
  // background の呼び出しは起動した時点で終わるので、所要時間を測れない。
  if (!background && input.tool_use_id) store.start(input.tool_use_id, key, now, state);
  return null;
}

// PostToolUse: 開始を記録した呼び出しなら、かかった時間を残す。
export function after(input, store, now = Date.now()) {
  if (input.tool_use_id) store.finish(input.tool_use_id, now);
}

function isEntry() {
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isEntry()) {
  let output = '';
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    if ((input.tool_name ?? 'Bash') === 'Bash') {
      const store = createStore(input);
      if (input.hook_event_name === 'PreToolUse') {
        const result = before(input, store);
        if (result) {
          output = JSON.stringify({
            hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: result.reason },
          });
        }
      } else {
        after(input, store);
      }
    }
  } catch {
    output = '';
  }
  if (output) process.stdout.write(output + '\n');
}
