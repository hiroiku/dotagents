import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { BUDGET, contextFor, coreText } from '../plugin/src/context.mjs';

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-context-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), typeof declaration === 'string' ? declaration : JSON.stringify(declaration));
  return dir;
}

test('常設の文は上限に収まる', () => {
  for (const [name, limit] of Object.entries(BUDGET)) assert.ok(coreText(name).length <= limit, `${name}: ${coreText(name).length} 字 > ${limit} 字`);
});

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
  const cwd = project({ decisions: ['コントラストはデザイナーの指示なので指摘しない'], checks: { edit: 'biome check {file}', push: 'npm run check' }, delegated: ['push:develop'], limits: { commandSeconds: 300 } });
  for (const role of ['lead', 'builder', 'reviewer', 'worker']) {
    const text = contextFor({ role, cwd });
    assert.match(text, /コントラストはデザイナーの指示なので指摘しない/, role);
    assert.match(text, /編集: `biome check \{file\}`/, role);
    assert.match(text, /push: `npm run check`/, role);
  }
  assert.match(contextFor({ role: 'lead', cwd }), /確かめずに進める: push:develop/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /確かめずに進める/);
  assert.match(contextFor({ role: 'builder', cwd }), /300 秒/);
  assert.doesNotMatch(contextFor({ role: 'worker', cwd }), /1 コマンドの上限/);
});

test('読めない宣言は、進める役に知らせる', () => {
  const cwd = project('{ broken');
  assert.match(contextFor({ role: 'lead', cwd }), /宣言が読めない/);
  assert.doesNotMatch(contextFor({ role: 'builder', cwd }), /宣言が読めない/);
});
