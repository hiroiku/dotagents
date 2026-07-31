// SessionStart hook(器官の不在検出・計器)と agents-doctor(乖離の自己検出)の契約を固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const HOOK = path.join(REPO, 'payload', 'hooks', 'beads-session.sh');
const CLI = path.join(REPO, 'bin', 'agents-setup');

const BASE_PATH = '/usr/bin:/bin'; // bd も codegraph も見えない素の PATH
const utcToday = () => new Date().toISOString().slice(0, 10); // 計器は UTC で日付を揃える

function runHook({ cwd, stubDir }) {
  return execFileSync('/bin/bash', [HOOK], {
    input: '{"session_id":"abcd1234efgh"}',
    cwd,
    env: { PATH: stubDir ? `${stubDir}:${BASE_PATH}` : BASE_PATH, HOME: os.homedir() },
    encoding: 'utf8',
  });
}

function makeBdStub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-hookstub-'));
  fs.writeFileSync(path.join(dir, 'bd'), `#!/bin/sh
case "$*" in
  *"--status open"*)        echo '[{"id":"x-1","created":"${utcToday()}T00:00:01Z"},{"id":"x-2","created":"2026-06-30T05:00:00Z"}]' ;;
  *"--status in_progress"*) echo '[]' ;;
  *) echo '[]' ;;
esac
`, { mode: 0o755 });
  return dir;
}

test('hook: session_id を渡さないハーネスでも一意 actor を注入する', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-proj-'));
  const out = execFileSync('/bin/bash', [HOOK], {
    input: '{}',
    cwd: proj,
    env: { PATH: BASE_PATH, HOME: os.homedir() },
    encoding: 'utf8',
  });
  assert.match(out, /BEADS_ACTOR=mgr-[0-9a-f]{8} /);
});

test('hook: bd(必須)と codegraph(推奨)の不在を伝える', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-proj-'));
  const out = runHook({ cwd: proj });
  assert.match(out, /bd(.|\n)*必須の器官/);
  assert.match(out, /codegraph が見つからない(.|\n)*推奨の器官/);
});

test('hook: bd はあるが台帳が未 init なら bd init を案内する', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-proj-'));
  const out = runHook({ cwd: proj, stubDir: makeBdStub() });
  assert.match(out, /未 init(.|\n)*bd init/);
});

test('hook: 計器は dotagents の領分(.agents)に日次で 1 回記録し、前回比を注入する', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-proj-'));
  execFileSync(process.execPath, [CLI, 'install', '--project', proj], { encoding: 'utf8' });
  fs.mkdirSync(path.join(proj, '.beads'));
  const metrics = path.join(proj, '.agents', 'dotagents-metrics.jsonl');
  fs.writeFileSync(metrics, JSON.stringify({ date: '2026-07-01', open: 160, in_progress: 7, inflow_open: 22 }) + '\n');
  const stub = makeBdStub();
  const installedHook = path.join(proj, '.agents', 'hooks', 'beads-session.sh');

  const runInstalled = () => execFileSync('/bin/bash', [installedHook], {
    input: '{"session_id":"abcd1234efgh"}',
    cwd: proj,
    env: { PATH: `${stub}:${BASE_PATH}`, HOME: os.homedir() },
    encoding: 'utf8',
  });

  const out = runInstalled();
  assert.match(out, /bd 計器: open 2 \(前回 2026-07-01 比 -158\)/);
  assert.match(out, /本日起票の未消化 1 件/);
  assert.equal(fs.readFileSync(metrics, 'utf8').trim().split('\n').length, 2, '当日分が 1 行追記される');
  assert.ok(!fs.existsSync(path.join(proj, '.beads', 'dotagents-metrics.jsonl')), 'bd の領分(.beads)には書かない');

  runInstalled();
  assert.equal(fs.readFileSync(metrics, 'utf8').trim().split('\n').length, 2, '同日 2 回目は追記しない');
});

test('doctor: 正常時は無音 exit 0、改変を検出して exit 1、未インストールの木では黙る', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  execFileSync(process.execPath, [CLI, 'install'], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  const doctor = path.join(home, '.agents', 'bin', 'agents-doctor');
  const env = { PATH: process.env.PATH, HOME: home };

  assert.equal(execFileSync(doctor, { env, encoding: 'utf8' }), '', '正常時は無音');

  fs.appendFileSync(path.join(home, '.agents', 'AGENTS.md'), '\n# drift\n');
  let failed = null;
  try { execFileSync(doctor, { env, encoding: 'utf8' }); } catch (e) { failed = e; }
  assert.ok(failed, '乖離で exit 1');
  assert.match(failed.stdout, /AGENTS\.md — インストール先で改変/);

  const payloadDoctor = path.join(REPO, 'payload', 'bin', 'agents-doctor');
  assert.equal(execFileSync(payloadDoctor, { env, encoding: 'utf8' }), '', '正本 payload(manifest 無し)では黙る');
});
