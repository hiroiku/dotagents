// コミットメッセージ、PR、issue、リリースに、AI の関与を示す記述が入るのを止める。
// ホストが署名を足すよう促すことがあり、決まりを読んでいても混じる。
//
// 見るのは、それらを書く git と gh の呼び出しだけにする。本文はコマンドの文字列に加え、
// -F や --body-file で渡すファイルの中身も読む。

import fs from 'node:fs';
import path from 'node:path';

const WRITES = [
  /\bgit\b[^|;&]*\bcommit\b/,
  /\bgh\s+(?:pr|issue|release)\s+(?:create|edit|comment|review|merge)\b/,
  /\bgh\s+api\b[^|;&]*\b(?:issues|pulls|releases)\b/,
];

// 署名の行と、セッションの URL
const MARKS = /Generated with \[?(?:Claude Code|Codex|Pi\b)|Co-Authored-By:[^\n]*(?:Claude|Codex|noreply@anthropic\.com|noreply@openai\.com)|claude\.ai\/code\/session/i;

// 本文をファイルで渡す指定。body=@ の形を先に試す。-F の後に body=@ が来たとき、-F <ファイル> と読み違えないため
const FILES = /(?:(?:\s-F|\s-f|\s--field)\s+body=@|\s-F\s+|\s--file[= ]|\s--body-file[= ]|\s--notes-file[= ])(['"]?)([^\s'"]+)\1/g;

export function attribution(command, cwd = process.cwd()) {
  if (!WRITES.some((pattern) => pattern.test(command))) return null;
  let text = command;
  for (const [, , file] of command.matchAll(FILES)) {
    try {
      text += `\n${fs.readFileSync(path.resolve(cwd, file), 'utf8')}`;
    } catch {}
  }
  const hit = text.match(MARKS);
  if (!hit) return null;
  return `コミットメッセージ、PR、issue、リリースに、AI の関与を示す記述(\`${hit[0].trim()}\`)を入れないでください。その行を落としてから実行し直してください。`;
}
