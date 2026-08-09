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
const GIT = which('git');

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

// 検証の道具を PATH から引くのは node で走るときだけ。bun は自分自身で走らせるので、
// 道具が欠けるという状態にならない。
if (!process.versions.bun && NODE && GIT) {
  test('pull: 検証の道具が無いとき、赤い corpus と混同しない', () => {
    const upstream = tmp('dotagents-upstream-');
    const g = (...args) =>
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: upstream, encoding: 'utf8' });
    g('init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(upstream, 'bin'));
    fs.copyFileSync(CLI, path.join(upstream, 'bin', 'agents-setup'));
    fs.chmodSync(path.join(upstream, 'bin', 'agents-setup'), 0o755);
    // テストを持つと宣言する corpus — pull はこの宣言を見て検証に入る。
    fs.writeFileSync(path.join(upstream, 'package.json'),
      JSON.stringify({ name: 'x', version: '0.0.1', scripts: { test: 'node --test' } }) + '\n');
    g('add', '.');
    g('commit', '-q', '-m', 'init');

    const work = path.join(tmp('dotagents-work-'), 'corpus');
    execFileSync('git', ['clone', '-q', upstream, work]);
    fs.appendFileSync(path.join(upstream, 'RULES.md'), 'change\n');
    g('add', '.');
    g('commit', '-q', '-m', '上流の変更');

    // git と node は在るが npm は無い機械。取り込みは通り、検証だけが立たない。
    const r = launch(path.join(work, 'bin', 'agents-setup'), ['pull'],
      { PATH: pathWith(GIT, NODE), HOME: tmp('dotagents-home-') });
    assert.equal(r.code, 1);
    assert.match(r.out, /unverified/, '走らせられなかったことを、そのまま言う');
    assert.doesNotMatch(r.out, /fails its own tests/, 'テストが落ちたとは言わない');
    const head = execFileSync('git', ['-C', work, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
    assert.equal(head, '上流の変更', '取り込み自体は済んでいる');
  });
}
