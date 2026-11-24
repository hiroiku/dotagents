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

test('核はどの役にも入り、進める役の文は進める役にだけ入る', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  const lead = contextFor({ role: 'lead', cwd });
  assert.ok(lead.includes(coreText('core')) && lead.includes(coreText('lead')));
  for (const role of ['builder', 'reviewer', 'worker']) {
    const text = contextFor({ role, cwd });
    assert.ok(text.includes(coreText('core')), role);
    assert.ok(!text.includes(coreText('lead')), role);
  }
});

test('プロジェクトの決定と検査の入口は、どの役にも届く', () => {
  const cwd = project({ decisions: ['コントラストはデザイナーの指示なので指摘しない'], checks: { edit: 'biome check {file}', push: 'npm run check' }, delegated: ['push:develop'] });
  for (const role of ['lead', 'builder', 'reviewer', 'worker']) {
    const text = contextFor({ role, cwd });
    assert.match(text, /コントラストはデザイナーの指示なので指摘しない/, role);
    assert.match(text, /編集: `biome check \{file\}`/, role);
    assert.match(text, /push: `npm run check`/, role);
  }
  assert.match(contextFor({ role: 'lead', cwd }), /確かめずに進める: push:develop/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /確かめずに進める/);
  // 進める役が回す段は、作る役と確かめる役にだけ、止まることを知らせる。
  for (const role of ['builder', 'reviewer']) assert.match(contextFor({ role, cwd }), /push の段のコマンドは、進める役が回す。この役がそのまま実行すると止まる。対象を絞った実行は止まらない。/, role);
  for (const role of ['lead', 'worker']) assert.doesNotMatch(contextFor({ role, cwd }), /実行すると止まる/, role);
  const both = project({ checks: { push: 'npm run check', release: 'npm run e2e' } });
  assert.match(contextFor({ role: 'builder', cwd: both }), /push の段と版の段のコマンドは、進める役が回す。/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd: project({ checks: { edit: 'biome check {file}' } }) }), /進める役が回す/);
});

// 数値は決まりとして読まれ、状況に合わなくても守られる。進め方は、理由と引き換えで書く。
// 計測の結果(何倍、何割)と、仕組みの形(束ごとに 1 回、役 1 体)は、上限ではないので当たらない。
test('常設の文、役の定義、流、スキルに、時間や数の上限を書かない', () => {
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

test('進め方は既定で、利用者とプロジェクトの決めごとが優先すると、どの役にも届く', () => {
  for (const role of ['lead', 'builder', 'reviewer', 'worker']) {
    assert.match(contextFor({ role, cwd: project({}) }), /進め方は既定である。利用者の指示やプロジェクトの決めごとと食い違うときは、そちらに従い、食い違いを知らせる。/, role);
  }
});

test('読めない宣言は、進める役に知らせる', () => {
  const cwd = project('{ broken');
  assert.match(contextFor({ role: 'lead', cwd }), /宣言が読めない/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /宣言が読めない/);
});
