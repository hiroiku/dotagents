// どのランタイムから起動されても入口になる、という契約を固定する。
// shebang は node があれば node、無ければ bun を選ぶので、片方しか無い機械でも動く。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function which(cmd) {
  try {
    return execFileSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).trim() || null;
  } catch { return null; }
}

// 挙げた実行ファイルだけが載った PATH。shebang が何を見つけるかを機械の事情から切り離す。
function pathWith(...bins) {
  const dir = tmp('dotagents-path-');
  for (const bin of bins) fs.symlinkSync(bin, path.join(dir, path.basename(bin)));
  return dir;
}

// このテスト自身がどちらで走っていても、両方の在処を突き止める。無い物のテストは
// 登録しない — 走れないテストを緑にも赤にもしない。
const NODE = process.versions.bun ? which('node') : process.execPath;
const BUN = process.versions.bun ? process.execPath : which('bun');

// shebang 経由で起動する(process.execPath で呼ぶと shebang を通らない)。
function launch(bin, args, env) {
  try {
    return { code: 0, out: execFileSync(bin, args, { env, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') + (e.message || '') };
  }
}

if (NODE) {
  test('shebang: node しか無い機械で起動する', () => {
    const r = launch(CLI, ['--version'], { PATH: pathWith(NODE), HOME: tmp('dotagents-home-') });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out.trim(), /^\d+\.\d+\.\d+$/);
  });
}

if (BUN) {
  test('shebang: bun しか無い機械でも起動する', () => {
    const r = launch(CLI, ['--version'], { PATH: pathWith(BUN), HOME: tmp('dotagents-home-') });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out.trim(), /^\d+\.\d+\.\d+$/);
  });
}

// 規則が同梱になった今、起動に要るのはランタイムだけ。git も npm も要らない機械で、
// 何も取ってこないまま配れることを確かめる — 入口が外部の道具を前提にしない、という契約。
for (const [name, runtime] of [['node', NODE], ['bun', BUN]]) {
  if (!runtime) continue;
  test(`${name} だけの機械で、git も npm も無しに配れる`, () => {
    const home = tmp('dotagents-home-');
    const proj = tmp('dotagents-proj-');
    const r = launch(CLI, ['install', 'review', '-C', proj],
      { PATH: pathWith(runtime), HOME: home, DOTAGENTS_HOME: path.join(home, '.dotagents') });
    assert.equal(r.code, 0, r.out);
    assert.ok(
      fs.existsSync(path.join(proj, '.claude', 'skills', 'dotagents', '.claude-plugin', 'plugin.json')), r.out);
  });
}
