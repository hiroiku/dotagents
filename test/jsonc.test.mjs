import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJsonc } from '../plugin/src/jsonc.mjs';

const failure = (text) => {
  try {
    parseJsonc(text);
  } catch (error) {
    return error;
  }
  assert.fail(`読めてはいけない: ${JSON.stringify(text)}`);
};

test('注釈と末尾のカンマを読み、ふつうの JSON は JSON.parse と同じに読む', () => {
  const text = `// 先頭の注釈
{
  /* ブロックの注釈
     複数行 */
  "protected": ["staging", /* 途中の注釈 */ "release/*",], // 行末の注釈
  "checks": { "push": "npm run check", },
}
`;
  assert.deepEqual(parseJsonc(text), { protected: ['staging', 'release/*'], checks: { push: 'npm run check' } });
  for (const plain of ['{}', '[]', '{"a":[1,-2.5e3,true,false,null,"x"],"b":{"c":{}}}', ' \n\t[ 0 , 1 ] \r\n', '"\\u3042\\n\\"\\\\\\/"', '1e-7', '-0']) {
    assert.deepEqual(parseJsonc(plain), JSON.parse(plain), plain);
  }
  assert.deepEqual(parseJsonc('﻿{"a":1}'), { a: 1 });
});

test('文字列の中の // と /* と、エスケープした引用符は、注釈として読まない', () => {
  const url = 'https://raw.githubusercontent.com/hiroiku/dotagents/master/schema/dotagents.schema.json';
  assert.deepEqual(parseJsonc(`{ "$schema": "${url}", // 注釈\n "decisions": ["a // b", "c /* d */ e", "引用符 \\" // まだ文字列", "\\\\"] }`), {
    $schema: url,
    decisions: ['a // b', 'c /* d */ e', '引用符 " // まだ文字列', '\\'],
  });
});

test('__proto__ の鍵を、プロトタイプの書き換えにしない', () => {
  const value = parseJsonc('{"__proto__": {"polluted": true}}');
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.keys(value).length, 1);
});

test('読めないときは、行と列を添えて投げる', () => {
  // 位置は、読めなくなった文字の、1 から数える行と列(列は文字数)である。
  const cases = [
    ['{\n  "a": 1,\n  "b": ,\n}', 3, 8],
    ['{"a": 1,, }', 1, 9],
    ['[1 2]', 1, 4],
    ['{\n  // 注釈\n  /* 閉じない\n}', 3, 3],
    ['{"a": "閉じない\n}', 1, 12],
    ["{'a': 1}", 1, 2],
    ['{"a": NaN}', 1, 7],
    ['{"a": 01}', 1, 8],
    ['{"a": 1} x', 1, 10],
    ['', 1, 1],
    ['{"a": "\\x"}', 1, 9],
    ['{"a": "\\u12"}', 1, 10],
    ['{"a" 1}', 1, 6],
    ['[,1]', 1, 2],
  ];
  for (const [text, line, column] of cases) {
    const error = failure(text);
    assert.match(error.message, new RegExp(`^${line} 行 ${column} 列: `), `${JSON.stringify(text)} → ${error.message}`);
  }
});

test('深すぎる入れ子は、スタックを溢れさせず、読めないものとして投げる', () => {
  assert.match(failure('['.repeat(5000)).message, /入れ子/);
});
