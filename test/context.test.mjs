import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PLUGIN_ROOT, contextFor, coreText } from '../plugin/src/context.mjs';

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), typeof declaration === 'string' ? declaration : JSON.stringify(declaration));
  return dir;
}

test('共通ルールはどのロールにも入り、オーケストレーターの文はオーケストレーターにだけ入る', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  const orchestrator = contextFor({ role: 'orchestrator', cwd });
  assert.ok(orchestrator.includes(coreText('core')) && orchestrator.includes(coreText('orchestrator')));
  for (const role of ['builder', 'reviewer', 'worker']) {
    const text = contextFor({ role, cwd });
    assert.ok(text.includes(coreText('core')), role);
    assert.ok(!text.includes(coreText('orchestrator')), role);
  }
});

test('プロジェクトの決定と検査の入口は、どのロールにも届く', () => {
  const cwd = project({ decisions: ['コントラストはデザイナーの指示なので指摘しない'], checks: { edit: 'biome check {file}', push: 'npm run check' }, delegated: ['push:develop'] });
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    const text = contextFor({ role, cwd });
    assert.match(text, /コントラストはデザイナーの指示なので指摘しない/, role);
    assert.match(text, /edit: `biome check \{file\}`/, role);
    assert.match(text, /push: `npm run check`/, role);
  }
  assert.match(contextFor({ role: 'orchestrator', cwd }), /確かめずに進める: push:develop/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /確かめずに進める/);
  // オーケストレーターが回す段階は、ビルダーとレビュアーにだけ、止まることを知らせる。
  for (const role of ['builder', 'reviewer']) assert.match(contextFor({ role, cwd }), /push の段階のコマンドは、オーケストレーターが回す。このエージェントがそのまま実行すると止まる。対象を絞った実行は止まらない。/, role);
  for (const role of ['orchestrator', 'worker']) assert.doesNotMatch(contextFor({ role, cwd }), /実行すると止まる/, role);
  const both = project({ checks: { push: 'npm run check', release: 'npm run e2e' } });
  assert.match(contextFor({ role: 'builder', cwd: both }), /push の段階と release の段階のコマンドは、オーケストレーターが回す。/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd: project({ checks: { edit: 'biome check {file}' } }) }), /オーケストレーターが回す/);
});

// 数値は決まりとして読まれ、状況に合わなくても守られる。進め方は、理由と引き換えで書く。
// 計測の結果(何倍、何割)と、仕組みの形(バッチごとに 1 回、エージェント 1 体)は、上限ではないので当たらない。
test('常設の文、エージェントの定義、スタイル、スキルに、時間や数の上限を書かない', () => {
  const LIMITS = /[0-9]+ ?(?:秒|分|時間|日|週)|[0-9]+ ?(?:つ|体|件|回|本|個)(?:まで|以内|以下|を超え)|(?:上限|最大|目安)は ?[0-9]/;
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name.endsWith('.md')) files.push(path.join(dir, entry.name));
    }
  };
  for (const name of ['core', 'agents', 'skills', 'styles']) walk(path.join(PLUGIN_ROOT, name));
  assert.ok(files.length >= 8, '読む場所が変わっていないこと');
  for (const file of files) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      assert.doesNotMatch(line, LIMITS, `${path.relative(PLUGIN_ROOT, file)}:${index + 1}`);
    });
  }
});

test('進め方は既定で、利用者とプロジェクトの決めごとが優先すると、どのロールにも届く', () => {
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    assert.match(contextFor({ role, cwd: project({}) }), /進め方は既定である。利用者の指示やプロジェクトの決めごとと食い違うときは、そちらに従い、食い違いを知らせる。/, role);
  }
});

test('dotagents.json の無いリポジトリーでは、オーケストレーターが setup で入れることを提案する。空の dotagents.json を置けば提案しない', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  fs.mkdirSync(path.join(repo, '.git'));
  fs.mkdirSync(path.join(repo, 'src'));
  for (const cwd of [repo, path.join(repo, 'src')]) assert.match(contextFor({ role: 'orchestrator', cwd }), /setup のスキル/, cwd);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd: repo }), /setup のスキル/);
  const declined = project({});
  fs.mkdirSync(path.join(declined, '.git'));
  assert.doesNotMatch(contextFor({ role: 'orchestrator', cwd: declined }), /setup のスキル/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  assert.doesNotMatch(contextFor({ role: 'orchestrator', cwd: outside }), /setup のスキル/);
});

test('読めない dotagents.json は、オーケストレーターに知らせる', () => {
  const cwd = project('{ broken');
  assert.match(contextFor({ role: 'orchestrator', cwd }), /dotagents.json が読めない/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /dotagents.json が読めない/);
});
