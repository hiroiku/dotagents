import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as source from '../plugin/src/context.mjs';
import { NAMING } from '../plugin/src/skills.mjs';
import { bundle, OUT } from '../tools/bundle.mjs';

const PLUGIN = fileURLToPath(new URL('../plugin', import.meta.url));

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-bundle-'));
  fs.mkdirSync(path.join(dir, '.agents'));
  fs.writeFileSync(path.join(dir, '.agents', 'dotagents.jsonc'), JSON.stringify(declaration));
  return dir;
}

test('hook の入口は、src/ と core/ から作り直しても差分が出ない', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), bundle(), 'node tools/bundle.mjs で作り直す');
});

// 入口は core/ の文とスキルの名前を埋め込み、ファイルを読まずに動く。src/、core/、skills/ を置かない場所(リポジトリーの本体)に
// 入口だけを写して、src/ から組み立てた文脈と同じになることを確かめる。schema のパスだけは、置いた場所によって変わる。
// agents/ は、字数を数える standingSize だけが読む。
test('入口だけを置いた場所でも、src/ から直接動かすときと同じ文脈を組み立てる', async () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-bundle-plugin-')));
  for (const part of ['dotagents.mjs', 'agents', 'schema']) fs.cpSync(path.join(PLUGIN, part), path.join(dir, part), { recursive: true });
  const bundled = await import(pathToFileURL(path.join(dir, 'dotagents.mjs')).href);
  const same = (text) => text.replaceAll(dir, PLUGIN);
  const cwd = project({ decisions: ['決定 A'], checks: { edit: 'lint {file}', push: 'npm test', release: 'npm run e2e' }, delegated: ['tag'] });
  let compared = 0;
  for (const role of ['orchestrator', 'builder', 'reviewer', 'worker']) {
    for (const host of ['claude', 'codex', 'antigravity']) {
      for (const shared of [true, false]) {
        assert.equal(same(bundled.contextFor({ role, cwd, host, shared })), source.contextFor({ role, cwd, host, shared }), `${role} ${host} ${shared}`);
        compared += 1;
      }
    }
    assert.equal(bundled.standingSize(role), source.standingSize(role) + (dir.length - PLUGIN.length), role);
  }
  for (const naming of Object.keys(NAMING)) assert.equal(bundled.sharedText(naming), source.sharedText(naming), naming);
  for (const name of fs.readdirSync(path.join(PLUGIN, 'core')).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3))) assert.equal(bundled.coreText(name), source.coreText(name), name);
  assert.equal(bundled.PLUGIN_ROOT, dir);
  assert.ok(compared > 0);
});
