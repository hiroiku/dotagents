// 規則がどこから来るかの契約を固定する。
// 同梱の module は実装と一緒に配られ、自作の module は使う人の側に残る。
// 更新の経路は npm の 1 本しかないので、取得も追従もこのコマンドの仕事ではない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// この機械の設定に引きずられない。テストは本拠地を自分で決める。
delete process.env.DOTAGENTS_HOME;

function run(bin, args, { env = {} } = {}) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [bin, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// 配布物として動く実装 + 同梱の module。使う人の手元にあるのはこの形である。
function installedPkg(modules = { demo: '# demo v1' }) {
  const dir = tmp('dotagents-pkg-');
  fs.mkdirSync(path.join(dir, 'bin'));
  const bin = path.join(dir, 'bin', 'agents-setup');
  fs.copyFileSync(CLI, bin);
  fs.chmodSync(bin, 0o755);
  fs.copyFileSync(path.join(REPO, 'package.json'), path.join(dir, 'package.json'));
  for (const [name, body] of Object.entries(modules)) writeModule(path.join(dir, 'modules', name), body);
  return bin;
}

function writeModule(dir, body) {
  fs.mkdirSync(path.join(dir, 'skills', `${path.basename(dir)}-skill`), { recursive: true });
  fs.writeFileSync(path.join(dir, 'module.json'), JSON.stringify({ description: `${path.basename(dir)} の説明` }) + '\n');
  fs.writeFileSync(path.join(dir, 'skills', `${path.basename(dir)}-skill`, 'SKILL.md'),
    `---\ndescription: ${path.basename(dir)}\n---\n\n${body}\n`);
}

test('規則は実装と一緒に来る — 取得も追従も要らない', () => {
  const cli = installedPkg();
  const home = tmp('dotagents-home-');
  const proj = tmp('dotagents-proj-');
  const env = { DOTAGENTS_HOME: home };

  // 何も取ってこないまま、いきなり配れる
  const listed = run(cli, ['list'], { env });
  assert.equal(listed.code, 0, listed.out);
  assert.match(listed.out, /demo/);
  // 見本は読みに行く場所ではなく、本拠地へ実体で置かれる。だから消せるし、真似できる。
  assert.match(fs.readFileSync(path.join(home, 'modules', 'demo', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    /demo v1/, '同梱は本拠地へ実体で置かれる');

  const installed = run(cli, ['install', 'demo', '-C', proj], { env });
  assert.equal(installed.code, 0, installed.out);
  const delivered = path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'demo-skill', 'SKILL.md');
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v1/);
  assert.ok(!fs.existsSync(path.join(home, 'corpus')), '規則を取ってくる場所を作らない');
});

test('パッケージが新しくなれば、update で配り直したものも新しくなる', () => {
  const home = tmp('dotagents-home-');
  const proj = tmp('dotagents-proj-');
  const env = { DOTAGENTS_HOME: home };
  const delivered = path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'demo-skill', 'SKILL.md');

  run(installedPkg({ demo: '# demo v1' }), ['install', 'demo', '-C', proj], { env });
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v1/);

  // パッケージを入れ替える = 実装も規則も新しくなる。追従はこのコマンドの外で起きる。
  const newer = installedPkg({ demo: '# demo v2' });
  const updated = run(newer, ['update', '-C', proj], { env });
  assert.equal(updated.code, 0, updated.out);
  assert.match(fs.readFileSync(delivered, 'utf8'), /demo v2/, '新しい同梱が配り直される');
});

test('自作の module は使う人の側に残り、同じコマンドで配られる', () => {
  const cli = installedPkg();
  const home = tmp('dotagents-home-');
  const proj = tmp('dotagents-proj-');
  const env = { DOTAGENTS_HOME: home };
  writeModule(path.join(home, 'modules', 'mine'), '# 自分の規則');

  const listed = run(cli, ['list'], { env });
  assert.match(listed.out, /mine/, '自分で置いた module も同じ一覧に出る');

  const installed = run(cli, ['install', 'mine', 'demo', '-C', proj], { env });
  assert.equal(installed.code, 0, installed.out);
  assert.match(
    fs.readFileSync(path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'mine-skill', 'SKILL.md'), 'utf8'),
    /自分の規則/);
});

test('git で持っていた頃の corpus: 自作の module を写し、残りは知らせるだけ', () => {
  const cli = installedPkg();
  const home = tmp('dotagents-home-');
  const proj = tmp('dotagents-proj-');
  const env = { DOTAGENTS_HOME: home };

  // 旧レイアウト: 規則を clone して corpus に置いていた。同梱と同名の物と、自作の物が混ざる。
  const corpus = path.join(home, 'corpus');
  writeModule(path.join(corpus, 'modules', 'demo'), '# 同梱と同じ名前');
  writeModule(path.join(corpus, 'modules', 'mine'), '# 自作の規則');
  fs.mkdirSync(path.join(corpus, '.git'), { recursive: true });

  // 写すのは、名前が引かれるより前。移行した直後にその名前で呼べる。
  const r = run(cli, ['install', 'mine', 'demo', '-C', proj], { env });
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(home, 'modules', 'mine', 'module.json')), '自作の物は写す');
  assert.match(
    fs.readFileSync(path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'mine-skill', 'SKILL.md'), 'utf8'),
    /自作の規則/, '写した先から配られる');
  assert.match(fs.readFileSync(path.join(home, 'modules', 'demo', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    /demo v1/, '同梱と同じ名前は corpus から写さない — そこは見本が占めている');
  assert.ok(fs.existsSync(path.join(corpus, 'modules', 'mine')), '写しただけで、corpus は壊さない');
  assert.match(r.out, /no longer read/, 'もう読んでいないことを言う');

  // 配られたのは同梱の方
  assert.match(
    fs.readFileSync(path.join(proj, '.claude', 'skills', 'dotagents', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    /demo v1/);
});

test('clone と pull は退役 — 規則の更新はパッケージの更新であると示す', () => {
  const cli = installedPkg();
  const env = { DOTAGENTS_HOME: tmp('dotagents-home-') };
  for (const cmd of ['clone', 'pull']) {
    const r = run(cli, [cmd], { env });
    assert.equal(r.code, 1, `${cmd} は止まる`);
    assert.match(r.out, /retired/);
    assert.match(r.out, /bun add -g|npm i -g/, '行き先を示す');
  }
});
