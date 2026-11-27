import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CHECK_STAGES, KEYS } from '../plugin/src/declaration.mjs';
import { DELEGABLE } from '../plugin/src/guard.mjs';
import { parseJsonc } from '../plugin/src/jsonc.mjs';

const read = (path) => fs.readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
const schema = JSON.parse(read('schema/dotagents.schema.json'));
const URL_OF_SCHEMA = 'https://raw.githubusercontent.com/hiroiku/dotagents/master/schema/dotagents.schema.json';

// 依存なしで確かめられる範囲の JSON Schema。この schema が使う語だけを読み、知らない語があれば落とす。
const KEYWORDS = new Set(['$schema', '$id', 'title', 'description', 'type', 'properties', 'additionalProperties', 'items', 'pattern', 'examples']);
function walk(node, where, visit) {
  assert.equal(typeof node, 'object', where);
  for (const key of Object.keys(node)) assert.ok(KEYWORDS.has(key), `${where}: 知らない語 ${key}`);
  visit(node, where);
  for (const [name, child] of Object.entries(node.properties ?? {})) walk(child, `${where}.${name}`, visit);
  if (node.items) walk(node.items, `${where}[]`, visit);
  if (typeof node.additionalProperties === 'object') walk(node.additionalProperties, `${where}.*`, visit);
}

function errors(node, value, where = '$') {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (node.type && node.type !== type) return [`${where}: ${node.type} が要る`];
  const out = [];
  if (node.pattern && typeof value === 'string' && !new RegExp(node.pattern).test(value)) out.push(`${where}: 形が違う`);
  if (type === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (node.properties?.[key]) out.push(...errors(node.properties[key], child, `${where}.${key}`));
      else if (node.additionalProperties === false) out.push(`${where}.${key}: 知らない項目`);
    }
  }
  if (type === 'array' && node.items) value.forEach((item, index) => out.push(...errors(node.items, item, `${where}[${index}]`)));
  return out;
}

test('schema は JSON Schema として読める形で、項目に日本語の説明が付く', () => {
  assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  assert.equal(schema.$id, URL_OF_SCHEMA);
  let described = 0;
  walk(schema, '$', (node, where) => {
    if (node.type !== undefined) assert.ok(['object', 'array', 'string', 'boolean'].includes(node.type), `${where}: type`);
    if (node.pattern !== undefined) assert.doesNotThrow(() => new RegExp(node.pattern), `${where}: pattern`);
    if (node.properties) assert.equal(node.type, 'object', where);
    if (node.items) assert.equal(node.type, 'array', where);
    if (where !== '$') {
      assert.match(node.description ?? '', /[ぁ-ん]/, `${where}: 日本語の説明`);
      described += 1;
    }
  });
  assert.ok(described >= KEYS.length);
});

test('schema の項目は、ハーネスが読む項目と一致する', () => {
  assert.deepEqual(Object.keys(schema.properties).sort(), [...KEYS].sort());
  assert.deepEqual(Object.keys(schema.properties.checks.properties).sort(), [...CHECK_STAGES].sort());
  // 知らない項目は、書き間違いとして示す。もう読まれない style と outward も、ここで示される。
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.checks.additionalProperties, false);
});

test('schema が列挙する任せられる種類は、guard が任せられる種類と一致する', () => {
  const pattern = schema.properties.delegated.items.pattern;
  const listed = pattern.match(/^\^\(([^)]+)\)/)[1].split('|');
  assert.deepEqual([...listed].sort(), [...DELEGABLE].sort());
  for (const ok of ['push', 'push:develop', 'merge:main', 'release:v*', ...DELEGABLE]) assert.equal(new RegExp(pattern).test(ok), true, ok);
  for (const bad of ['rewrite', 'bypass', 'policy', 'pushes', 'push:', 'tag ', '', 'Push']) assert.equal(new RegExp(pattern).test(bad), false, bad);
});

test('README と setup スキルの設定ファイルの例は、schema を通り、先頭に $schema の行がある', () => {
  for (const file of ['README.md', 'docs/README.ja.md', 'plugin/skills/setup/SKILL.md']) {
    const examples = [...read(file).matchAll(/```jsonc\n([\s\S]*?)```/g)].map((match) => match[1]);
    assert.ok(examples.length > 0, file);
    for (const text of examples) {
      assert.deepEqual(errors(schema, parseJsonc(text)), [], `${file}\n${text}`);
      assert.ok(text.includes(`"$schema": "${URL_OF_SCHEMA}"`), file);
    }
  }
});

test('schema は、正しい設定を通し、書き間違いを示す', () => {
  assert.deepEqual(errors(schema, {}), []);
  assert.deepEqual(errors(schema, { $schema: URL_OF_SCHEMA, protected: ['staging'], delegated: ['push:develop'], checks: { push: 'npm run check' }, attribution: false, decisions: ['a'] }), []);
  for (const bad of [{ style: { git: 'trunk' } }, { outward: ['x'] }, { delegate: [] }, { protected: 'main' }, { delegated: ['rewrite'] }, { checks: { deploy: 'x' } }, { checks: { push: 1 } }, { attribution: 'false' }, { decisions: [1] }]) {
    assert.ok(errors(schema, bad).length > 0, JSON.stringify(bad));
  }
});

test('setup スキルの点検が挙げる知っている項目は、読む項目と一致する', () => {
  const line = read('plugin/skills/setup/SKILL.md').split('\n').find((text) => text.includes('知っている項目は'));
  const named = [...line.slice(line.indexOf('知っている項目は')).matchAll(/`([$\w]+)`/g)].map((match) => match[1]);
  assert.deepEqual(named.filter((name) => KEYS.includes(name)).sort(), [...KEYS].sort());
});
