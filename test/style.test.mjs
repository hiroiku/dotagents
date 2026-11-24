import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { budgetOf, contextFor, largestSize } from '../plugin/src/context.mjs';
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
    'git/a.md': '---\nroles: lead\nintegration: develop\nshared: ["develop", "master"]\n---\n\n# A\n',
    'architecture/b.md': '---\nroles: all\n---\nB',
    'git/broken.md': '---\nroles: someone\n---\nC',
  });
  const a = readStyle('git', 'a', root);
  assert.deepEqual(a.values, { roles: 'lead', integration: 'develop', shared: ['develop', 'master'] });
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
  const cwd = project({ style: { git: 'no-such-flow' } });
  assert.match(contextFor({ role: 'lead', cwd }), /知らない流がある\(git: "no-such-flow"\)/);
  for (const role of ['builder', 'reviewer', 'worker']) assert.doesNotMatch(contextFor({ role, cwd }), /知らない流/, role);
  assert.equal(contextFor({ role: 'builder', cwd }), contextFor({ role: 'builder', cwd: project({}) }));
});
