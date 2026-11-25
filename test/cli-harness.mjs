// cli のテストが共有する道具。テストの入口(test/*.test.mjs)には入らない。
// 実際の端末も、実際の claude も使わない。入力の流れと、claude の実行を差し込む。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { main } from '../cli/src/cli.mjs';

export const UP = '\x1b[A';
export const DOWN = '\x1b[B';
export const ENTER = '\r';
export const SPACE = ' ';
export const CTRL_C = '\x03';

const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'dotagents-cli-'));
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));
let serial = 0;
const fresh = (name) => {
  const dir = path.join(scratch, `${name}-${(serial += 1)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });

export function write(dir, files) {
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

export const read = (dir, relative) => (fs.existsSync(path.join(dir, relative)) ? fs.readFileSync(path.join(dir, relative), 'utf8') : null);
export const exists = (dir, relative) => fs.existsSync(path.join(dir, relative));

// git のリポジトリーを作る。files は { 相対パス: 中身 }。
export function repo(files = {}) {
  const dir = fresh('repo');
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, files);
  return dir;
}

// PATH に置く、実行できる偽のコマンド。
export function bin(...names) {
  const dir = fresh('bin');
  for (const name of names) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(file, 0o755);
  }
  return dir;
}

export function collect() {
  const stream = new PassThrough();
  let text = '';
  stream.on('data', (chunk) => {
    text += chunk;
  });
  return { stream, text: () => text };
}

// main を実行する。tty が true なら、input を端末の入力として流す。
//   commands  PATH に置くコマンド(既定は claude と codex)
//   status    claude の実行の終了コード。output は、claude が出した文(失敗の理由になる)
//   claudeHome  claude の記録の置き場(CLAUDE_CONFIG_DIR)
//   env       足す環境変数(NO_COLOR、FORCE_COLOR、TERM)。columns は端末の桁数
export async function exec(dir, argv, { input = '', tty = false, commands = ['claude', 'codex'], status = 0, output = '', env = {}, columns, claudeHome = fresh('claude-home') } = {}) {
  const stdin = new PassThrough();
  stdin.isTTY = tty;
  stdin.setRawMode = () => stdin;
  stdin.end(input);
  const stdout = collect();
  const stderr = collect();
  const calls = [];
  const code = await main(argv, {
    cwd: dir,
    env: { PATH: bin(...commands), CLAUDE_CONFIG_DIR: claudeHome, ...env },
    stdin,
    stdout: Object.assign(stdout.stream, { isTTY: tty, columns }),
    stderr: stderr.stream,
    run: (file, args, options) => {
      calls.push({ file, args, cwd: options.cwd });
      return { status, output };
    },
  });
  return { code, out: stdout.text(), err: stderr.text(), calls, claudeHome };
}

export const ALL = ['--hosts', 'claude,codex', '--git', 'trunk', '--architecture', 'layered', '--scope', 'project', '--check', 'push=npm run check'];
