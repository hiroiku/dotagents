// インストーラーの画面を、文字列として確かめる。色の選びや記号の形は固定しない。確かめるのは、
// 色と制御列を出す条件、書く前の確かめ、字の幅と折り返しが崩れないこと。

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { createUi } from '../cli/src/ui.mjs';
import { strip, terminal, width, wrap } from '../cli/src/term.mjs';
import { DOWN, ENTER, collect, exec, exists, repo } from './cli-harness.mjs';

const SGR = /\x1b\[[0-9;]*m/;
// 罫線、状態の記号、矢印、スピナー、区切りの点。TERM=dumb では、どれも出さない。
const BOX = /[\u2190-\u21ff\u2500-\u25ff\u2800-\u28ff\u00b7]/u;
const SEVEN = { '.claude/dotagents.json': '{}', '.claude/rules/dotagents/a.md': 'a' };
const SCRIPTS = JSON.stringify({ scripts: { check: 'a', lint: 'b' } });
// 画面の幅の確かめに使う、ほぼ全角の長い文を持つ状況(7.x の残りの知らせ)。
const NOISY = { ...SEVEN, 'package.json': SCRIPTS };

// ---------------------------------------------------------------- 字の幅と折り返し

test('width: 全角は 2 桁、半角は 1 桁、結合文字と制御列は数えない', () => {
  assert.equal(width('abc'), 3);
  assert.equal(width('日本語'), 6);
  assert.equal(width('ＡＢ'), 4, '全角の英字');
  assert.equal(width('ｱｲ'), 2, '半角のカナ');
  assert.equal(width('が'), 2, '結合の濁点は幅を持たない');
  assert.equal(width('npm と日本語'), 12);
  assert.equal(width('\x1b[31m赤\x1b[0m'), 2);
  assert.equal(width(''), 0);
});

const TEXTS = [
  '入れるホストを選びます。選んだホストの設定ファイルに、plugin の参照を書きます。',
  'package.json の scripts(check、lint)から npm run check を推しました。dotagents.json に書きます。',
  'averyveryverylongunbreakablecommandline--with-options --and more',
  '一行目\n二行目は、改行のあとに続きます。',
];

test('wrap: どの行も桁数に収まり、字を失わず、全角の文でも折り返せる', () => {
  for (const cols of [8, 11, 20, 33, 80]) {
    for (const text of TEXTS) {
      const lines = wrap(text, cols);
      for (const line of lines) assert.ok(width(line) <= cols, `${cols} 桁: ${JSON.stringify(line)} は ${width(line)} 桁`);
      assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''), `${cols} 桁で字が変わった`);
    }
  }
});

test('wrap: 行の頭に、や。を置かない。字下げ(hang)は 2 行目以降に付き、その分も桁数に含める', () => {
  for (const cols of [10, 12, 14, 15, 16, 18, 21]) {
    const lines = wrap('日本語の文、日本語の文。日本語の文、日本語の文。', cols);
    for (const line of lines.slice(1)) assert.ok(!/^[、。]/.test(line), `${cols} 桁: ${line}`);
  }
  const lines = wrap('一つ目の文は、番号の下に続けて折り返されます。', 20, 3);
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok(width(line) <= 20, line);
  for (const line of lines.slice(1)) assert.ok(line.startsWith('   '), JSON.stringify(line));
  assert.ok(!lines[0].startsWith(' '));
});

// ---------------------------------------------------------------- 色と記号を出す条件

const out = (stream) => ({ isTTY: true, columns: 80, ...stream });

test('terminal: NO_COLOR は色を消し、FORCE_COLOR は端末でなくても色を出し、dumb は ASCII に落とす', () => {
  assert.equal(terminal({ isTTY: true }, {}).color, true);
  assert.equal(terminal({ isTTY: false }, {}).color, false);
  assert.equal(terminal({ isTTY: false }, {}).fancy, false, 'パイプは素の文');
  assert.equal(terminal({ isTTY: true }, { NO_COLOR: '1' }).color, false);
  assert.equal(terminal({ isTTY: true }, { NO_COLOR: '1' }).fancy, true, '色が無くても、縦線の画面は出す');
  assert.equal(terminal({ isTTY: false }, { FORCE_COLOR: '1' }).color, true);
  assert.equal(terminal({ isTTY: false }, { NO_COLOR: '1', FORCE_COLOR: '1' }).color, false, 'NO_COLOR が先');
  assert.equal(terminal({ isTTY: false }, { FORCE_COLOR: '0' }).color, false);
  assert.equal(terminal({ isTTY: true }, { TERM: 'dumb' }).unicode, false);
  assert.equal(terminal({ isTTY: true }, {}).unicode, true);
  assert.equal(terminal({}, {}).columns, 80);
  assert.equal(terminal({ columns: 33 }, {}).columns, 33);
});

test('端末でない出力には、制御列も縦線も出さず、読める素の文を出す', async () => {
  const result = await exec(repo(), ['init', '--yes']);
  assert.equal(result.code, 0, result.err);
  assert.ok(!result.out.includes('\x1b'), JSON.stringify(result.out));
  assert.ok(!BOX.test(result.out), result.out);
  assert.match(result.out, /コミットはしていません/);
  assert.match(result.out, /次にすること/);
});

test('NO_COLOR は、端末でも制御列を一切出さない。FORCE_COLOR は、端末でなくても色を出す', async () => {
  const quiet = await exec(repo({ 'package.json': SCRIPTS }), ['init', '--yes'], { tty: true, env: { NO_COLOR: '1' } });
  assert.equal(quiet.code, 0, quiet.err);
  assert.ok(!quiet.out.includes('\x1b'), JSON.stringify(quiet.out));
  assert.match(quiet.out, /次にすること/);

  const colored = await exec(repo({ 'package.json': SCRIPTS }), ['init', '--yes'], { tty: false, env: { FORCE_COLOR: '1' } });
  assert.match(colored.out, SGR);

  const plain = await exec(repo({ 'package.json': SCRIPTS }), ['init', '--yes'], { tty: true });
  assert.match(plain.out, SGR, '端末では色が付く');
});

test('NO_COLOR で質問に答えるときも、色の制御列を出さない', async () => {
  const dir = repo();
  const result = await exec(dir, ['init'], { tty: true, input: ENTER.repeat(9), env: { NO_COLOR: '1' } });
  assert.equal(result.code, 0, result.err);
  assert.ok(!SGR.test(result.out), '色の制御列');
  assert.ok(exists(dir, '.agents/dotagents.json'));
});

test('TERM=dumb は、罫線と記号を ASCII に落とす', async () => {
  const done = await exec(repo(NOISY), ['init', '--yes'], { tty: true, env: { TERM: 'dumb', NO_COLOR: '1' } });
  assert.equal(done.code, 0, done.err);
  assert.match(done.out, /^\+  dotagents/m, '縦線の画面は出る(ASCII で)');
  assert.ok(!BOX.test(done.out), '罫線と状態の記号');

  const asked = await exec(repo(), ['init'], { tty: true, input: ENTER.repeat(9), env: { TERM: 'dumb' } });
  assert.equal(asked.code, 0, asked.err);
  assert.ok(!BOX.test(asked.out), '質問の画面');
});

// ---------------------------------------------------------------- 書く前の確かめ

test('書く前に、書くファイルを見せて尋ねる。いいえなら何も書かず、plugin も入れず、成功で終える', async () => {
  const dir = repo({ 'package.json': SCRIPTS });
  const result = await exec(dir, ['init'], { tty: true, input: ENTER.repeat(8) + DOWN + ENTER });
  assert.equal(result.code, 0, result.err);
  assert.equal(exists(dir, '.agents'), false);
  assert.equal(exists(dir, '.claude'), false);
  assert.equal(exists(dir, '.codex'), false);
  assert.deepEqual(result.calls, []);
  const screen = strip(result.out);
  assert.match(screen, /dotagents\.json/, '書くファイルの一覧');
  assert.match(screen, /\.claude\/settings\.json/);
  assert.match(screen, /書き込みますか/);
  assert.ok(screen.indexOf('書き込みますか') > screen.indexOf('.claude/settings.json'), '一覧を見せてから尋ねる');
  assert.match(screen, /何も書かず/);
});

test('はいを選べば書く。書いたあとは、次にすることを出し、コミットしていないと終える', async () => {
  const dir = repo({ 'package.json': SCRIPTS });
  const result = await exec(dir, ['init'], { tty: true, input: ENTER.repeat(9) });
  assert.equal(result.code, 0, result.err);
  assert.equal(exists(dir, '.agents/dotagents.json'), true);
  assert.equal(result.calls.length, 1);
  const screen = strip(result.out);
  assert.match(screen, /次にすること/);
  assert.match(screen, /コミットはしていません/);
  assert.ok(screen.indexOf('書き込みますか') < screen.indexOf('次にすること'));
});

test('--yes と、質問をすべて指定した実行は、書く前に尋ねない', async () => {
  const yes = repo();
  const a = await exec(yes, ['init', '--yes'], { tty: true, input: '' });
  assert.equal(a.code, 0, a.err);
  assert.equal(exists(yes, '.agents/dotagents.json'), true);
  assert.ok(!strip(a.out).includes('書き込みますか'));

  const all = repo();
  const b = await exec(all, ['init', '--hosts', 'codex', '--git', 'trunk', '--architecture', 'none', '--scope', 'none', '--check', 'edit=', '--check', 'commit=', '--check', 'push=npm test', '--check', 'release='], { tty: true, input: '' });
  assert.equal(b.code, 0, b.err);
  assert.equal(exists(all, '.codex/config.toml'), true);
});

test('変更が無いときは、確かめずに、変更が無いと伝える', async () => {
  const dir = repo();
  await exec(dir, ['init', '--yes']);
  const again = await exec(dir, ['init'], { tty: true, input: ENTER.repeat(9), commands: ['claude', 'codex'] });
  assert.equal(again.code, 0, again.err);
  assert.ok(!strip(again.out).includes('書き込みますか'));
  assert.match(strip(again.out), /変更はありません|そろって/);
});

test('plugin の導入に失敗したら、短い理由を添えて知らせ、終了コードは 1 のまま', async () => {
  const tty = await exec(repo(), ['init', '--yes', '--scope', 'project'], { tty: true, status: 1, output: 'Installing...\nerror: network unreachable\n' });
  assert.equal(tty.code, 1);
  assert.match(strip(tty.out), /network unreachable/);
  assert.match(strip(tty.out), /claude plugin install dotagents@dotagents --scope project/);

  const piped = await exec(repo(), ['init', '--yes', '--scope', 'project'], { status: 1, output: 'error: network unreachable\n' });
  assert.equal(piped.code, 1);
  assert.match(piped.err, /network unreachable/);
});

test('Ctrl-C は、何も書いていないと伝えて終える', async () => {
  const dir = repo();
  const result = await exec(dir, ['init'], { tty: true, input: `${ENTER}\x03` });
  assert.equal(result.code, 1);
  assert.match(strip(result.err), /中断しました。何も書いていません。/);
  assert.equal(exists(dir, '.agents'), false);
});

// ---------------------------------------------------------------- 幅

const lines = (text) => strip(text).split('\n');

test('--yes の画面は、桁数が狭くても、どの行も収まり、枠の右の縁がそろう', async () => {
  for (const columns of [30, 44, 60, 100]) {
    const result = await exec(repo(NOISY), ['init', '--yes'], { tty: true, columns, env: { NO_COLOR: '1' } });
    assert.equal(result.code, 0, result.err);
    for (const line of lines(result.out)) assert.ok(width(line) <= columns, `${columns} 桁: ${line}(${width(line)})`);
    // 枠ごとに、上の縁から下の縁まで、右の縁がそろう。
    let top = null;
    let checked = 0;
    for (const line of lines(result.out)) {
      if (/^◇  .* ─+╮$/.test(line)) top = width(line);
      else if (/^├─+╯$/.test(line)) {
        assert.equal(width(line), top, `${columns} 桁: 下の縁`);
        top = null;
      } else if (top !== null) {
        assert.equal(width(line), top, `${columns} 桁: ${line}`);
        checked += 1;
      }
    }
    assert.ok(checked > 8, '枠の行がある');
  }
});

// 描き直しのたびに、先頭は \r で始まる。その区切りで、1 枚ずつの画面に分ける。
function screenOf(input, columns) {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.end(input);
  const stdout = collect();
  const ui = createUi({ input: stdin, output: stdout.stream, term: terminal({ isTTY: true, columns }, { NO_COLOR: '1' }) });
  return { ui, frames: () => stdout.text().split('\r') };
}

test('質問の画面は、説明が折り返されても、どの描き直しも桁数に収まる', async () => {
  for (const columns of [24, 40, 80]) {
    const { ui, frames } = screenOf(`${DOWN}${ENTER}`, columns);
    await ui.select({
      message: 'ファイルを編集するたびに回すチェック  (edit)',
      description: 'ビルダーが、編集したファイルだけに回す軽いコマンドです。{file} は、編集したファイルに置き換えて回します。',
      choices: [
        { value: 'a', label: 'npm run lint を使う', hint: 'package.json の lint から推しました' },
        { value: 'b', label: '別のコマンドを入力する', hint: '例: biome check {file}' },
      ],
    });
    ui.close();
    const drawn = frames().flatMap(lines);
    assert.ok(drawn.length > 6);
    for (const line of drawn) assert.ok(width(line) <= columns, `${columns} 桁: ${line}`);
    assert.match(strip(frames().join('')).replace(/\n(│  |   )/g, ''), /編集したファイルだけに回す軽いコマンド/, '説明が出る');
  }
});

test('下書きを見せる 1 行入力は、enter でそのまま使える', async () => {
  const { ui, frames } = screenOf(ENTER, 80);
  assert.equal(await ui.text({ message: '入口', initial: 'npm run check' }), 'npm run check');
  ui.close();
  assert.match(strip(frames().join('')), /npm run check/);
});
