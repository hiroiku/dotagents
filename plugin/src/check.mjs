// 編集の段の検査。ファイルを書き換えた直後に、プロジェクトが宣言したコマンドを 1 回だけ回し、
// 落ちたときだけ出力をモデルへ返す。型や lint の誤りを、重い検査やレビューに届く前に落とすためである。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readDeclaration } from './declaration.mjs';

const LIMIT_MS = 20000;
const TAIL = 2000;
const quote = (word) => `'${word.replaceAll("'", `'\\''`)}'`;

export function editCheck({ file, cwd }) {
  if (!file) return null;
  const target = path.resolve(cwd, file);
  const { value, root } = readDeclaration(path.dirname(target));
  const command = value.checks?.edit;
  if (typeof command !== 'string' || !command || !root) return null;
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || !fs.existsSync(target)) return null;
  const result = spawnSync('sh', ['-c', command.replaceAll('{file}', quote(relative))], { cwd: root, encoding: 'utf8', timeout: LIMIT_MS });
  if (result.status === 0 || result.error?.code === 'ENOENT') return null;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const reason = result.error?.code === 'ETIMEDOUT' ? `${LIMIT_MS / 1000} 秒で終わらなかった。編集の段には、数秒で終わる検査だけを置く。` : output.slice(-TAIL);
  return `編集の段の検査(\`${command}\`)が ${relative} で落ちた。\n\n${reason}`;
}
