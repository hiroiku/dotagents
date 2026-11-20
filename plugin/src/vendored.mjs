// プロジェクトに写したハーネス(vendor)の場所と、利用者の環境に入れた側がそのプロジェクトで引き下がる判定。
//
// 同じハーネスが両方にあると、文脈も確かめも二重になる。プロジェクトに入れた版を優先し、利用者の側は
// 何もしない。ホストごとの設定で片方を切る方法は、ホストによって有ったり無かったりするので、ここで決める。

import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './context.mjs';

// 利用者の設定に入れたものと名前を分ける。Claude Code は、同じ名前の plugin が両方にあると、
// プロジェクトの側を読まない。
export const PROFILE_NAME = 'dotagents';
export const VENDORED_NAME = 'dotagents-repo';
export const VENDORED_DIR = path.join('.claude', 'skills', VENDORED_NAME);
export const VENDORED_RECORD = 'VENDORED.json';

export function vendoredRoot(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const root = path.join(dir, VENDORED_DIR);
    if (fs.existsSync(path.join(root, VENDORED_RECORD))) return root;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// 動いているのが写しなら、どの写しであっても引き下がらない。ホストが、worktree ではなく本体の写しを
// 読み込むことがあるからである。
export const standsDown = (cwd) => !fs.existsSync(path.join(PLUGIN_ROOT, VENDORED_RECORD)) && vendoredRoot(cwd) !== null;
