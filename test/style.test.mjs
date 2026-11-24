import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('git の流は、進める役にだけ入る', () => {
  for (const name of ['trunk', 'release-branches', 'develop-master']) {
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
  assert.deepEqual(pushed('git push origin develop', { style: { git: 'develop-master' } }), ['push:develop']);
  assert.deepEqual(pushed('git push origin develop', {}), []);
  assert.deepEqual(pushed('git push origin staging', { style: { git: 'develop-master' }, protected: ['staging'] }), ['push:staging']);
  assert.deepEqual(pushed('git push origin main', { style: { git: 'trunk' } }), ['push:main']);
});

test('設計の形は、どの役にも入る', () => {
  const cwd = project({ style: { architecture: 'layered' } });
  for (const role of ['lead', 'builder', 'reviewer', 'worker']) assert.match(contextFor({ role, cwd }), /# 設計の形\(layered\)/, role);
});

// 雛形はプロジェクトへ写して使う。写したときと同じ置き方で、node だけで動かす。
test('層の検査の雛形は、依存の向き、コンテキストのまたぎ、外のパッケージを落とし、ファイルを渡せばそれだけを見る', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-layers-'));
  const template = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'plugin', 'styles', 'architecture', 'layered');
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  for (const name of ['check.mjs', 'layers.json']) write(`scripts/layers/${name}`, fs.readFileSync(path.join(template, name), 'utf8'));
  write('src/app-kernel/result.ts', 'export type Result = unknown;\n');
  write('src/domain/entities/user/user.entity.ts', "import type { Result } from '../../../app-kernel/result';\n// import { x } from '../../../interface/x';\n");
  write('src/application/use-cases/user/sign-up.use-case.ts', "import { User } from '@/domain/entities/user/user.entity';\n");
  write('src/frameworks/web/composition-root.ts', "import { Store } from '@/infrastructure/repositories/user/store';\n");
  const check = (...files) => spawnSync(process.execPath, [path.join(root, 'scripts', 'layers', 'check.mjs'), ...files], { cwd: root, encoding: 'utf8' });
  assert.equal(check().status, 0, check().stdout);
  write('src/domain/entities/order/order.entity.ts', "import { User } from '../user/user.entity';\nimport { z } from 'zod';\nexport * from '../../../interface/presenters/x';\n");
  write('src/frameworks/web/page.ts', "const u = await import('@/application/use-cases/user/sign-up.use-case');\n");
  const failed = check();
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /src\/domain\/entities\/order\/order\.entity\.ts:1: domain のコンテキスト order は、user を import しない/);
  assert.match(failed.stdout, /order\.entity\.ts:2: domain は外のパッケージ zod を import しない/);
  assert.match(failed.stdout, /order\.entity\.ts:3: domain は interface を import しない/);
  assert.match(failed.stdout, /src\/frameworks\/web\/page\.ts:1: frameworks は application を import しない/);
  assert.equal(failed.stdout.match(/import しない/g).length, 4);
  const one = check('src/frameworks/web/page.ts');
  assert.equal(one.status, 1);
  assert.doesNotMatch(one.stdout, /order\.entity/);
  assert.equal(check('src/application/use-cases/user/sign-up.use-case.ts').status, 0);
});
