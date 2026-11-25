// 仕組みが何をしたかを、1 行ずつ残す。ハーネスそのものを測るための記録である(dotagents のリポジトリーの tools/stats.mjs が読む)。
// コマンドの文字列やファイルの中身は残さない。残すのは、いつ、どのプロジェクトで、どのロールが、何をしたかだけである。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const home = () => (process.env.DOTAGENTS_HOME ? path.resolve(process.env.DOTAGENTS_HOME) : path.join(os.homedir(), '.dotagents'));
export const logDir = () => path.join(home(), 'log');

export function record(entry) {
  try {
    const now = new Date();
    fs.mkdirSync(logDir(), { recursive: true });
    fs.appendFileSync(path.join(logDir(), `${now.toISOString().slice(0, 7)}.jsonl`), `${JSON.stringify({ t: now.toISOString(), ...entry })}\n`);
  } catch {}
}
