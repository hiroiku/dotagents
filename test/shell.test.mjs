import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse, simpleCommands, unwrap } from '../plugin/src/shell.mjs';

const heads = (text) => simpleCommands(text, '/repo').map((command) => command.words.join(' '));

test('連結、引用符、リダイレクトを読み分ける', () => {
  assert.deepEqual(heads('a b && c "d e" | f; g'), ['a b', 'c d e', 'f', 'g']);
  assert.deepEqual(heads("echo 'x; y' > out.txt 2>&1"), ['echo x; y']);
  assert.deepEqual(parse('echo hi > a.txt >> b.txt')[0].targets, ['a.txt', 'b.txt']);
  assert.deepEqual(heads('# comment\nls # trailing'), ['ls']);
});

test('ヒアドキュメントの中身をコマンドとして読まない', () => {
  assert.deepEqual(heads("cat > f.txt <<'EOF'\ngit push origin main\nEOF\nls"), ['cat', 'ls']);
  assert.deepEqual(heads('python3 - <<E\nimport os\nE'), ['python3 -']);
});

test('前に付く語を外し、代入を集める', () => {
  const { words, assignments } = unwrap(['A=1', 'env', 'B=2', 'timeout', '90', 'npx', 'wrangler', 'deploy']);
  assert.deepEqual(words, ['wrangler', 'deploy']);
  assert.deepEqual(assignments, { A: '1', B: '2' });
  assert.deepEqual(unwrap(['sudo', '-u', 'x', '/usr/bin/git', 'push']).words, ['git', 'push']);
  assert.deepEqual(unwrap(['node_modules/.bin/wrangler', 'deploy']).words, ['wrangler', 'deploy']);
});

test('cd と sh -c を追う', () => {
  const commands = simpleCommands("cd app && sh -c 'cd sub && npm publish'", '/repo');
  assert.equal(commands[0].words.join(' '), 'npm publish');
  assert.equal(commands[0].cwd, '/repo/app/sub');
  assert.deepEqual(heads('if true; then git push; fi'), ['true', 'git push']);
});

test('閉じていない引用符や壊れた入力で落ちない', () => {
  assert.doesNotThrow(() => simpleCommands('echo "unterminated', '/repo'));
  assert.doesNotThrow(() => simpleCommands("cat <<EOF\nno end", '/repo'));
  assert.deepEqual(simpleCommands('', '/repo'), []);
});
