import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { contextFor, coreText, SCHEMA_FILE, sharedText } from '../plugin/src/context.mjs';
import { findings } from '../plugin/src/guard.mjs';

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-standing-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.jsonc'), JSON.stringify(declaration));
  return dir;
}

const ROLES = ['orchestrator', 'builder', 'reviewer', 'worker'];

test('dotagents.jsonc に何も書かなくても、git は trunk、設計は layered の文が入り、trunk の文はオーケストレーターにだけ入る', () => {
  const cwd = project({});
  const trunk = coreText('branches');
  assert.match(trunk, /リリースは、デフォルトブランチのコミットに tag を付けて行う/);
  assert.match(contextFor({ role: 'orchestrator', cwd }), /リリースは、デフォルトブランチのコミットに tag を付けて行う/);
  for (const role of ['builder', 'reviewer', 'worker']) assert.doesNotMatch(contextFor({ role, cwd }), /リリースは、デフォルトブランチのコミットに tag を付けて行う/, role);
  for (const role of ROLES) assert.ok(contextFor({ role, cwd }).includes(coreText('layered')), role);
  assert.match(coreText('layered'), /app-kernel/);
});

test('古い dotagents.jsonc に style が残っていても、読まず、知らせもせず、文も変えない', () => {
  const plain = project({});
  for (const style of [{ git: 'release-branches', architecture: 'layered' }, { git: 'no-such-flow' }, ['git'], 'trunk']) {
    const cwd = project({ style });
    for (const role of ROLES) {
      assert.equal(contextFor({ role, cwd }), contextFor({ role, cwd: plain }), role);
      assert.doesNotMatch(contextFor({ role, cwd }), /スタイル/, role);
    }
    assert.doesNotMatch(contextFor({ role: 'orchestrator', cwd }), /release-branches|release ブランチ/);
  }
});

test('共有ブランチは、リモートのデフォルトブランチ、main、master、protected で、style に release-branches と書いても release/ は加わらない', () => {
  const tools = { git: (cwd, ...args) => (args[0] === 'symbolic-ref' && args.some((arg) => arg.startsWith('refs/remotes')) ? 'origin/main' : args[0] === 'symbolic-ref' ? 'work/x' : null), gh: () => null };
  const pushed = (command, declaration) => findings({ tool: 'shell', command, cwd: '/repo' }, declaration, tools).map((finding) => `${finding.kind}:${finding.target}`);
  assert.deepEqual(pushed('git push origin release/drive-web/v1.73', { style: { git: 'release-branches' } }), []);
  assert.deepEqual(pushed('git push origin release/drive-web/v1.73', {}), []);
  assert.deepEqual(pushed('git push origin release/drive-web/v1.73', { protected: ['release/*'] }), ['push:release/drive-web/v1.73']);
  assert.deepEqual(pushed('git push origin develop', {}), []);
  assert.deepEqual(pushed('git push origin staging', { protected: ['staging'] }), ['push:staging']);
  assert.deepEqual(pushed('git push origin main', {}), ['push:main']);
  assert.deepEqual(pushed('git push origin master', { style: { git: 'develop-master' } }), ['push:master']);
});

test('設定ファイルが無いプロジェクトでも、どのロールにも、dotagents.jsonc の項目と書き方がある schema の場所が入る', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-standing-'));
  assert.ok(fs.existsSync(SCHEMA_FILE));
  assert.match(SCHEMA_FILE, /plugin[\\/]schema[\\/]dotagents\.schema\.json$/);
  for (const role of ROLES) assert.match(contextFor({ role, cwd: empty }), new RegExp(`## 基本方針\n[\\s\\S]*\`.agents/dotagents.jsonc\` の項目と書き方は \`${SCHEMA_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\` にある。\n\n## 設計`), role);
  // パスはインストールした場所で決まるので、場所を選べない静的なルール(Antigravity の rules/AGENTS.md)には入れない。
  assert.ok(!sharedText().includes(SCHEMA_FILE));
});
