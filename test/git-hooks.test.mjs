// git module の hook: コミットメッセージ、PR、issue に AI の関与を示す記述を入れさせない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check } from '../modules/git/hooks/no-ai-attribution.mjs';

const HOOK = new URL('../modules/git/hooks/no-ai-attribution.mjs', import.meta.url).pathname;
const SIGN = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

test('コミット、PR、issue の本文に署名やセッションの URL があれば止める', () => {
  assert.ok(check(`git commit -m "直す\n\n${SIGN}"`));
  assert.ok(check(`git -C /tmp/x commit -q -m "$(cat <<'X'\n直す\n\n${SIGN}\nX\n)"`));
  assert.ok(check('gh pr create --title t --body "🤖 Generated with [Claude Code](https://claude.com/claude-code)"'));
  assert.ok(check('gh issue comment 3 --body "https://claude.ai/code/session_abc"'));
  assert.ok(check(`gh api repos/o/r/issues/3/comments -f body="${SIGN}"`));
});

test('本文をファイルで渡しても、ファイルの中身を読んで止める', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-ai-'));
  fs.writeFileSync(path.join(dir, 'msg.txt'), `直す\n\n${SIGN}\n`);
  assert.ok(check('git commit -F msg.txt', dir));
  assert.ok(check('gh pr create --title t --body-file msg.txt', dir));
  assert.ok(check('gh issue create --title t -F body=@msg.txt', dir));
});

test('署名の無い本文と、本文を書かないコマンドは通す', () => {
  assert.equal(check('git commit -m "直す"'), null);
  assert.equal(check('gh pr create --title t --body "変更の説明"'), null);
  assert.equal(check(`echo "${SIGN}" > note.txt`), null, 'git や gh で書くのでなければ見ない');
  assert.equal(check(`git log --grep "${SIGN}"`), null);
});

test('止めるときは PreToolUse の拒否を返し、読めない入力は通す', () => {
  const run = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' }).stdout;
  const out = JSON.parse(run(JSON.stringify({ tool_input: { command: `git commit -m "x\n\n${SIGN}"` } })));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(run('{not json'), '');
  assert.equal(run(JSON.stringify({ tool_input: { command: 'git status' } })), '');
});
