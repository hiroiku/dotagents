import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { budgetOf, contextFor, largestSize } from '../plugin/src/context.mjs';
import { findings } from '../plugin/src/guard.mjs';
import { catalog, chosenStyles, readStyle } from '../plugin/src/style.mjs';

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-style-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.json'), JSON.stringify(declaration));
  return dir;
}

function styles(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-styles-'));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return root;
}

test('どの流を選んでも、役が毎回読む文は上限に収まる', () => {
  for (const role of ['lead', 'builder', 'reviewer', 'worker']) assert.ok(largestSize(role) <= budgetOf(role), `${role}: ${largestSize(role)} 字 > ${budgetOf(role)} 字`);
});

test('流の部品は、入れる役と、仕組みが読む値を持つ', () => {
  const root = styles({
    'git/a.md': '---\nroles: lead\nshared: ["release/*"]\n---\n\n# A\n',
    'architecture/b.md': '---\nroles: all\n---\nB',
    'git/broken.md': '---\nroles: someone\n---\nC',
  });
  const a = readStyle('git', 'a', root);
  assert.deepEqual(a.values, { roles: 'lead', shared: ['release/*'] });
  assert.equal(a.body, '# A');
  assert.deepEqual(catalog(root), { architecture: ['b'], git: ['a', 'broken'] });
  assert.throws(() => readStyle('git', 'broken', root), /roles/);
  // 宣言はプロジェクトが書く。名前の形でないものは、部品の外を読まない。
  for (const [axis, name] of [['git', '../architecture/b'], ['..', 'x'], ['git', 'A']]) assert.equal(readStyle(axis, name, root), null, `${axis}/${name}`);
  const { chosen, unknown } = chosenStyles({ style: { git: 'a', architecture: 'nope', other: 1 } }, root);
  assert.deepEqual(chosen.map((style) => style.name), ['a']);
  assert.deepEqual(unknown, ['architecture: "nope"', 'other: 1']);
  assert.deepEqual(chosenStyles({}, root), { chosen: [], unknown: [] });
  assert.deepEqual(chosenStyles({ style: ['git'] }, root).unknown, ['style はオブジェクトで書く']);
});

test('知らない流は、進める役にだけ知らせ、無いものとして動く', () => {
  // develop-master は 9.0.0 で外した。宣言に残っていても、知らない流として扱う。
  for (const name of ['no-such-flow', 'develop-master']) {
    const cwd = project({ style: { git: name } });
    assert.match(contextFor({ role: 'lead', cwd }), new RegExp(`知らない流がある\\(git: "${name}"\\)`));
    for (const role of ['builder', 'reviewer', 'worker']) assert.doesNotMatch(contextFor({ role, cwd }), /知らない流/, role);
    assert.equal(contextFor({ role: 'builder', cwd }), contextFor({ role: 'builder', cwd: project({}) }));
    assert.doesNotMatch(contextFor({ role: 'lead', cwd }), /# git の流れ/);
  }
  const tools = { git: (cwd, ...args) => (args[0] === 'symbolic-ref' && args.some((arg) => arg.startsWith('refs/remotes')) ? 'origin/main' : args[0] === 'symbolic-ref' ? 'work/x' : null), gh: () => null };
  const pushed = (command) => findings({ tool: 'shell', command, cwd: '/repo' }, { style: { git: 'develop-master' } }, tools).map((finding) => `${finding.kind}:${finding.target}`);
  assert.deepEqual(pushed('git push origin develop'), []);
  assert.deepEqual(pushed('git push origin master'), ['push:master']);
});

test('git の流は、進める役にだけ入る', () => {
  for (const name of ['trunk', 'release-branches']) {
    const cwd = project({ style: { git: name } });
    assert.ok(contextFor({ role: 'lead', cwd }).includes(readStyle('git', name).body), name);
    for (const role of ['builder', 'reviewer', 'worker']) assert.doesNotMatch(contextFor({ role, cwd }), /# git の流れ/, `${name}: ${role}`);
  }
  assert.doesNotMatch(contextFor({ role: 'lead', cwd: project({}) }), /# git の流れ/);
});

test('git の流は、共有のブランチの既定を決め、宣言の protected はそれに足す', () => {
  const tools = { git: (cwd, ...args) => (args[0] === 'symbolic-ref' && args.some((arg) => arg.startsWith('refs/remotes')) ? 'origin/main' : args[0] === 'symbolic-ref' ? 'work/x' : null), gh: () => null };
  const pushed = (command, declaration) => findings({ tool: 'shell', command, cwd: '/repo' }, declaration, tools).map((finding) => `${finding.kind}:${finding.target}`);
  // 入れ子の名前の release ブランチも、共有のブランチである。
  assert.deepEqual(pushed('git push origin release/drive-web/v1.73', { style: { git: 'release-branches' } }), ['push:release/drive-web/v1.73']);
  assert.deepEqual(pushed('git push origin release/drive-web/v1.73', { style: { git: 'trunk' } }), []);
  assert.deepEqual(pushed('git push origin develop', {}), []);
  assert.deepEqual(pushed('git push origin staging', { style: { git: 'trunk' }, protected: ['staging'] }), ['push:staging']);
  assert.deepEqual(pushed('git push origin main', { style: { git: 'trunk' } }), ['push:main']);
});

test('設計の形は、どの役にも入る', () => {
  const cwd = project({ style: { architecture: 'layered' } });
  for (const role of ['lead', 'builder', 'reviewer', 'worker']) assert.match(contextFor({ role, cwd }), /# 設計の形\(layered\)/, role);
});
