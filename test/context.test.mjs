import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT, contextFor, coreText } from '../plugin/src/context.mjs';

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.jsonc'), typeof declaration === 'string' ? declaration : JSON.stringify(declaration));
  return dir;
}

test('どのロールにも入る部分はどのロールにも、メインのセッションだけの部分はオーケストレーターにだけ入る', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  const orchestrator = contextFor({ role: 'orchestrator', cwd });
  assert.ok(orchestrator.includes(coreText('principles')) && orchestrator.includes(coreText('progress')));
  for (const role of ['builder', 'reviewer', 'worker']) {
    const text = contextFor({ role, cwd });
    assert.ok(text.includes(coreText('principles')), role);
    assert.ok(!text.includes(coreText('progress')), role);
  }
});

test('プロジェクトの決定とチェックの入口は、どのロールにも届く', () => {
  const cwd = project({ decisions: ['コントラストはデザイナーの指示なので指摘しない'], checks: { edit: 'biome check {file}', push: 'npm run check' }, delegated: ['push:develop'] });
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    const text = contextFor({ role, cwd });
    assert.match(text, /コントラストはデザイナーの指示なので指摘しない/, role);
    assert.match(text, /edit: `biome check \{file\}`/, role);
    assert.match(text, /push: `npm run check`/, role);
  }
  assert.match(contextFor({ role: 'orchestrator', cwd }), /確認せずに進める: push:develop/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /確認せずに進める/);
  // push 時とリリース前のチェックは、ビルダーとレビュアーにだけ、ブロックされることを伝える。
  for (const role of ['builder', 'reviewer']) assert.match(contextFor({ role, cwd }), /push 時のチェックのコマンドは、バッチを push する前に、メインのセッションで 1 回だけ実行する。このエージェントがそのまま実行すると、hook がブロックする。対象を絞った実行はブロックしない。/, role);
  for (const role of ['orchestrator', 'worker']) assert.doesNotMatch(contextFor({ role, cwd }), /hook がブロックする/, role);
  const both = project({ checks: { push: 'npm run check', release: 'npm run e2e' } });
  assert.match(contextFor({ role: 'builder', cwd: both }), /push 時とリリース前のチェックのコマンドは、バッチを push する前とリリースの前に、メインのセッションで 1 回だけ実行する。/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd: project({ checks: { edit: 'biome check {file}' } }) }), /メインのセッションで 1 回だけ実行する/);
});

// 数値は決まりとして読まれ、状況に合わなくても守られる。進め方は、理由と引き換えで書く。
// 計測の結果(何倍、何割)と、仕組みの形(バッチごとに 1 回、エージェント 1 体)は、上限ではないので当たらない。
test('常設の文、エージェントの定義、スキルに、時間や数の上限を書かない', () => {
  const LIMITS = /[0-9]+ ?(?:秒|分|時間|日|週)|[0-9]+ ?(?:つ|体|件|回|本|個)(?:まで|以内|以下|を超え)|(?:上限|最大|目安)は ?[0-9]/;
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name.endsWith('.md')) files.push(path.join(dir, entry.name));
    }
  };
  for (const name of ['core', 'agents', 'skills']) walk(path.join(PLUGIN_ROOT, name));
  assert.ok(files.length >= 8, '読む場所が変わっていないこと');
  for (const file of files) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      assert.doesNotMatch(line, LIMITS, `${path.relative(PLUGIN_ROOT, file)}:${index + 1}`);
    });
  }
});

test('進め方は既定で、利用者とプロジェクトの決めごとが優先すると、どのロールにも届く', () => {
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    assert.match(contextFor({ role, cwd: project({}) }), /ここにある進め方は既定である。利用者の指示、ホストの権限設定[^。]*、プロジェクトの決めごと[^。]*が、これより優先する。食い違うときは、そちらに従い、食い違いを伝える。/, role);
  }
});

test('dotagents.jsonc の無いリポジトリーでも、入れる提案は入らず、空の dotagents.jsonc と同じ文脈で動く', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  fs.mkdirSync(path.join(repo, '.git'));
  fs.mkdirSync(path.join(repo, 'src'));
  const declared = project({});
  fs.mkdirSync(path.join(declared, '.git'));
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    for (const cwd of [repo, path.join(repo, 'src')]) assert.equal(contextFor({ role, cwd }), contextFor({ role, cwd: declared }), role);
  }
});

test('読めない dotagents.jsonc は、行と列を添えて、オーケストレーターに知らせる', () => {
  const cwd = project('{\n  "decisions": ["a"],\n  "checks": ,\n}');
  assert.match(contextFor({ role: 'orchestrator', cwd }), /dotagents\.jsonc を読めなかった[^\n]*\n\nエラー: 3 行 13 列: /);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /dotagents.jsonc を読めなかった/);
  assert.equal(contextFor({ role: 'builder', cwd }), contextFor({ role: 'builder', cwd: project({}) }));
});

test('dotagents.jsonc は注釈と末尾のカンマを許し、古い dotagents.json は読まない', () => {
  const cwd = project('// このプロジェクトの決めごと\n{\n  "decisions": ["コントラストは指摘しない", /* 理由はデザイナーの指示 */],\n  "checks": { "push": "npm run check", },\n}\n');
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    assert.match(contextFor({ role, cwd }), /コントラストは指摘しない/, role);
    assert.match(contextFor({ role, cwd }), /push: `npm run check`/, role);
  }
  // 名前が .json のままのファイルは、読まない。知らせもしない。
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  fs.mkdirSync(path.join(old, '.agents'));
  fs.writeFileSync(path.join(old, '.agents', 'dotagents.json'), JSON.stringify({ decisions: ['古い名前の決定'], checks: { push: 'make' } }));
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    assert.doesNotMatch(contextFor({ role, cwd: old }), /古い名前の決定|push: `make`/, role);
    assert.equal(contextFor({ role, cwd: old }), contextFor({ role, cwd: project({}) }), role);
  }
});

// 見出しは、H1 が出どころ(既定のルールとプロジェクトの設定)、H2 が分野、H3 が話題で、H4 は使わない。
test('ロールごとに入る分野は、メインのセッションと、サブエージェントで分かれ、H1 は 2 つまでで、H4 を使わない', () => {
  const cwd = project({ decisions: ['a'], checks: { push: 'npm test' }, delegated: ['tag'] });
  const headings = (text, level) => text.split('\n').filter((line) => line.startsWith(`${'#'.repeat(level)} `)).map((line) => line.slice(level + 1));
  assert.deepEqual(headings(contextFor({ role: 'orchestrator', cwd }), 1), ['dotagents の既定のルール', 'このプロジェクトの設定(.agents/dotagents.jsonc)']);
  assert.deepEqual(headings(contextFor({ role: 'orchestrator', cwd }), 2), ['基本方針', '設計', '決定と記録', '進行', 'Git', 'GitHub', '決定事項', 'チェックのコマンド', '委任された操作']);
  for (const role of ['builder', 'reviewer', 'worker']) {
    assert.deepEqual(headings(contextFor({ role, cwd }), 2), ['基本方針', '設計', '決定と記録', 'Git', '決定事項', 'チェックのコマンド'], role);
    assert.deepEqual(headings(contextFor({ role, cwd }), 3), ['判断基準', 'レイヤー構成(layered)', 'テスト', 'ARCHITECTURE.md', '記録の置き場所', 'コミット'], role);
  }
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    for (const where of [project({}), cwd]) {
      const text = contextFor({ role, cwd: where });
      assert.ok(headings(text, 1).length <= 2, role);
      assert.doesNotMatch(text, /^#### /m, role);
    }
  }
  // 設定が何も無ければ、プロジェクトの設定の H1 は出さない。
  assert.doesNotMatch(contextFor({ role: 'orchestrator', cwd: project({}) }), /# このプロジェクトの設定/);
});
