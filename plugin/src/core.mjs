// core/ の文(常時読み込まれる既定のルールの部分)を、名前で引く。
//
// 開発中は core/ のファイルを読む。hook の入口(dotagents.mjs)では、tools/bundle.mjs がこのモジュールを、文を埋め込んだものに
// 置き換える。入口はファイルを読まずに動き、core/ を一緒に置かなくてよい。どちらの経路でも同じ文になることを、テストが守る。

import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './root.mjs';

export const coreText = (name) => fs.readFileSync(path.join(PLUGIN_ROOT, 'core', `${name}.md`), 'utf8').trim();
