// 選ぶ画面の動きを、入力の流れを差し込んで確かめる。実際の端末は使わない。

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { strip } from '../cli/src/term.mjs';
import { createUi } from '../cli/src/ui.mjs';
import { CTRL_C, DOWN, ENTER, SPACE, UP, collect, exec, exists, read, repo } from './cli-harness.mjs';

function ui(input) {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.end(input);
  const stdout = collect();
  return { ui: createUi({ input: stdin, output: stdout.stream }), out: stdout.text };
}

// 答えをたたんだ行の頭の記号。
const S_DONE = '◇';

const CHOICES = [
  { value: 'a', label: '一つ目' },
  { value: 'b', label: '二つ目' },
  { value: 'c', label: '三つ目' },
];

test('select: 矢印で動き、Enter で決める。端で止まる', async () => {
  assert.equal(await ui(ENTER).ui.select({ message: '選ぶ', choices: CHOICES }), 'a');
  assert.equal(await ui(DOWN + DOWN + ENTER).ui.select({ message: '選ぶ', choices: CHOICES }), 'c');
  assert.equal(await ui(DOWN + DOWN + DOWN + DOWN + ENTER).ui.select({ message: '選ぶ', choices: CHOICES }), 'c');
  assert.equal(await ui(UP + ENTER).ui.select({ message: '選ぶ', choices: CHOICES }), 'a');
  assert.equal(await ui(DOWN + UP + DOWN + ENTER).ui.select({ message: '選ぶ', choices: CHOICES }), 'b');
  assert.equal(await ui(ENTER).ui.select({ message: '選ぶ', choices: CHOICES, initial: 'b' }), 'b', '既定の位置から始める');
});

test('select: 画面に質問と選択肢を出し、決めたあとは答えの 1 行にたたむ', async () => {
  const screen = ui(DOWN + ENTER);
  await screen.ui.select({ message: 'どれにするか', choices: CHOICES });
  assert.match(screen.out(), /どれにするか/);
  assert.match(screen.out(), /一つ目/);
  assert.match(screen.out(), /三つ目/);
  assert.match(screen.out(), /二つ目/);
});

test('multiselect: Space で選び直し、Enter で決める', async () => {
  const none = await ui(ENTER).ui.multiselect({ message: '選ぶ', choices: CHOICES });
  assert.deepEqual(none, []);
  const picked = await ui(SPACE + DOWN + DOWN + SPACE + ENTER).ui.multiselect({ message: '選ぶ', choices: CHOICES });
  assert.deepEqual(picked, ['a', 'c'], '選んだ順ではなく、並びの順');
  const toggled = await ui(SPACE + SPACE + ENTER).ui.multiselect({ message: '選ぶ', choices: CHOICES });
  assert.deepEqual(toggled, []);
  const initial = await ui(DOWN + SPACE + ENTER).ui.multiselect({ message: '選ぶ', choices: CHOICES, initial: ['a', 'b'] });
  assert.deepEqual(initial, ['a'], '既定で選んだものから始め、外せる');
});

test('text: 打った字を受け、Backspace で消し、空のまま Enter で既定を使う', async () => {
  assert.equal(await ui(`npm test${ENTER}`).ui.text({ message: '入力' }), 'npm test');
  assert.equal(await ui(`npm tesx\x7ft${ENTER}`).ui.text({ message: '入力' }), 'npm test');
  assert.equal(await ui(`日本語${ENTER}`).ui.text({ message: '入力' }), '日本語');
  assert.equal(await ui(`${ENTER}`).ui.text({ message: '入力', initial: 'npm run check' }), 'npm run check', '下書きは、enter でそのまま使う');
  assert.equal(await ui(`make${ENTER}`).ui.text({ message: '入力', initial: 'npm run check' }), 'make', '打つと下書きは消え、打った字になる');
  assert.equal(await ui(`\x7f${ENTER}`).ui.text({ message: '入力', initial: 'ab' }), '', '消せば空');
});

test('Ctrl-C と入力の終わりは、中断として投げる', async () => {
  await assert.rejects(ui(CTRL_C).ui.select({ message: '選ぶ', choices: CHOICES }), { name: 'Cancelled' });
  await assert.rejects(ui('').ui.select({ message: '選ぶ', choices: CHOICES }), { name: 'Cancelled' });
  await assert.rejects(ui(`abc${CTRL_C}`).ui.text({ message: '入力' }), { name: 'Cancelled' });
});

// ---------------------------------------------------------------- 質問の流れ

const SCRIPTS = JSON.stringify({ scripts: { check: 'a', lint: 'b' } });

test('既定のまま Enter を続けると、質問なしの --yes と同じ結果になる', async () => {
  const asked = repo({ 'package.json': SCRIPTS });
  const yes = repo({ 'package.json': SCRIPTS });
  const interactive = await exec(asked, ['init'], { tty: true, input: ENTER.repeat(9) });
  assert.equal(interactive.code, 0, interactive.err);
  await exec(yes, ['init', '--yes']);
  for (const file of ['.agents/dotagents.json', '.claude/settings.json', '.codex/config.toml']) assert.equal(read(asked, file), read(yes, file), file);
  assert.deepEqual(JSON.parse(read(asked, '.agents/dotagents.json')), { style: { git: 'trunk' }, checks: { commit: 'npm run lint', push: 'npm run check' } });
  assert.deepEqual(interactive.calls[0].args.slice(-2), ['--scope', 'project']);
});

test('選び直す: ホストを外し、スタイルとチェックのコマンドを変え、範囲を選ぶ', async () => {
  const dir = repo({ 'package.json': SCRIPTS });
  const input = [
    // ホスト: claude を外して codex だけにする(claude, codex の順)
    SPACE,
    ENTER,
    // git: release-branches
    DOWN,
    ENTER,
    // architecture: layered
    UP,
    ENTER,
    // edit: 空のまま、入力する(空のままにする → 入力する)
    DOWN,
    ENTER,
    `npx biome check {file}${ENTER}`,
    // commit: 空にする(そのまま使う → 書き換える → 空にする)
    DOWN,
    DOWN,
    ENTER,
    // push: 書き換える
    DOWN,
    ENTER,
    `\x7f`.repeat(20),
    `make check${ENTER}`,
    // release: そのまま(空のまま)
    ENTER,
    // 書き込みますか: はい
    ENTER,
  ].join('');
  const result = await exec(dir, ['init'], { tty: true, input });
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(read(dir, '.agents/dotagents.json')), {
    style: { git: 'release-branches', architecture: 'layered' },
    checks: { edit: 'npx biome check {file}', push: 'make check' },
  });
  assert.equal(exists(dir, '.claude/settings.json'), false, 'claude を外した');
  assert.equal(exists(dir, '.codex/config.toml'), true);
  assert.deepEqual(result.calls, [], 'claude を選んでいないので、範囲も尋ねず、plugin も入れない');
});

test('指定した質問は尋ねない', async () => {
  const dir = repo();
  // 尋ねるのは、チェックの段階の 4 つと、範囲だけ
  const result = await exec(dir, ['init', '--hosts', 'claude', '--git', 'trunk', '--architecture', 'none'], { tty: true, input: ENTER.repeat(4) + DOWN + ENTER + ENTER });
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(result.calls[0].args.slice(-2), ['--scope', 'user']);
});

test('2 回目: 質問の既定は、いまの宣言の値', async () => {
  const dir = repo({ '.agents/dotagents.json': '{\n  "style": { "git": "release-branches", "architecture": "layered" },\n  "checks": { "push": "make check" }\n}\n' });
  const result = await exec(dir, ['init'], { tty: true, input: ENTER.repeat(9) });
  assert.equal(result.code, 0, result.err);
  assert.equal(read(dir, '.agents/dotagents.json'), '{\n  "style": { "git": "release-branches", "architecture": "layered" },\n  "checks": { "push": "make check" }\n}\n');
});

test('途中で中断したら、何も書かない', async () => {
  const dir = repo();
  const result = await exec(dir, ['init'], { tty: true, input: ENTER + ENTER + CTRL_C });
  assert.equal(result.code, 1);
  assert.equal(exists(dir, '.agents'), false);
  assert.equal(exists(dir, '.claude'), false);
  assert.deepEqual(result.calls, []);
});

// ---------------------------------------------------------------- 答えの保存先と、入力の履歴

test('入力を伴う選択肢は、同じ質問の中で入力に移り、答えの履歴は入力した 1 行になる', async () => {
  const choices = [
    { value: 'keep', label: 'npm run check を使う' },
    { value: null, label: '別のコマンドを入力する', input: { initial: '' } },
  ];
  const screen = ui(`${DOWN}${ENTER}make check${ENTER}`);
  assert.equal(await screen.ui.select({ message: 'push 前のチェック', choices }), 'make check');
  const text = strip(screen.out());
  assert.equal(text.split(S_DONE).length - 1, 1, '答えの行は 1 つだけ');
  assert.match(text, new RegExp(`${S_DONE}  push 前のチェック\\n│  make check\\n`));
  assert.ok(!text.includes(`${S_DONE}  別のコマンドを入力する`), '選んだ項目の行は残らない');

  assert.equal(await ui(ENTER).ui.select({ message: 'push 前のチェック', choices }), 'keep', '入力を伴わない選択肢は、これまでどおり value を返す');
});

test('チェックの別のコマンドを入力して選ぶと、画面に答えの保存先が出て、宣言に入る', async () => {
  const dir = repo();
  const input = [
    ENTER, // ホスト
    ENTER, // git
    ENTER, // architecture
    DOWN + ENTER + `npx biome check {file}${ENTER}`, // edit: 別のコマンドを入力する
    ENTER.repeat(3), // commit、push、release: 空のまま
    ENTER, // 範囲
    ENTER, // 書き込みますか
  ].join('');
  const result = await exec(dir, ['init'], { tty: true, input });
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(read(dir, '.agents/dotagents.json')).checks, { edit: 'npx biome check {file}' });
  const screen = strip(result.out);
  for (const key of ['style.git', 'style.architecture', 'checks.edit', 'checks.commit', 'checks.push', 'checks.release']) assert.ok(screen.includes(`.agents/dotagents.json の ${key} に保存されます`), key);
  assert.match(screen, /チームで共有/, '書き込む前の確認に、設定をチームで共有すると添える');
  assert.equal(screen.split(`${S_DONE}  ファイル編集時に実行するチェック  (edit)`).length - 1, 1, 'edit の答えの行は 1 つ');
});
