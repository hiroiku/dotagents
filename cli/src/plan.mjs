// 書き換えの計画。読むことと組み立ては先にすべて済ませ、書くのは apply だけにする。
// 組み立ての途中で止まっても、プロジェクトの設定は変わらない。

import fs from 'node:fs';
import path from 'node:path';
import { editJsonText } from './jsontext.mjs';

export function planOf(root) {
  const texts = new Map();
  const removed = new Set();
  const read = (relative) => {
    if (texts.has(relative)) return texts.get(relative);
    const file = path.join(root, relative);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };
  const onDisk = (relative) => {
    const file = path.join(root, relative);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };
  const exists = (relative) => fs.existsSync(path.join(root, relative));
  return {
    root,
    read,
    exists,
    set: (relative, text) => texts.set(relative, text),
    // JSON の設定を change で変える。読めなければ止める。
    json: (relative, change) => texts.set(relative, editJsonText(read(relative), change, relative)),
    remove: (relative) => removed.add(relative),
    // 書く(または消す)ファイルを、新しいもの、変わるもの、消えるものに分けて返す。
    summary() {
      const created = [];
      const changed = [];
      const gone = [...removed].filter(exists);
      for (const [relative, text] of texts) {
        const now = onDisk(relative);
        if (text === now) continue;
        if (text === null) gone.push(relative);
        else (now === null ? created : changed).push(relative);
      }
      return { created, changed, removed: gone };
    },
    apply() {
      for (const relative of removed) fs.rmSync(path.join(root, relative), { recursive: true, force: true });
      for (const [relative, text] of texts) {
        const file = path.join(root, relative);
        if (text === onDisk(relative)) continue;
        if (text === null) fs.rmSync(file);
        else {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, text);
        }
      }
    },
  };
}
