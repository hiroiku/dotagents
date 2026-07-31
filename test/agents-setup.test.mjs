// installer の業務契約(所有権の原則)を固定する。
// ここでは installer が製品であり、これらは製品の契約である(足場の検査ではない)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CLI = path.join(REPO, 'bin', 'agents-setup');

function run(home, args, opts = {}) {
  try {
    const out = execFileSync(process.execPath, [CLI, ...args], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    return { code: 0, out };
  } catch (e) {
    if (opts.allowFail) return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
    throw e;
  }
}

function freshHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  return home;
}

const read = (p) => fs.readFileSync(p, 'utf8');
const agentsDir = (home) => path.join(home, '.agents');

test('fresh install: 配布物・リンク・環境断片が揃い、status が乖離なしになる', () => {
  const home = freshHome();
  run(home, ['install']);

  for (const rel of ['AGENTS.md', 'bin/bd', 'bin/git-guard', 'bin/agents-doctor', 'hooks/shellenv.sh', 'agents/agents-reviewer.md']) {
    assert.ok(fs.existsSync(path.join(agentsDir(home), rel)), `${rel} が配布されている`);
  }
  assert.ok(fs.statSync(path.join(agentsDir(home), 'bin/bd')).mode & 0o100, '実行ビットが保存される');
  assert.equal(fs.readlinkSync(path.join(home, '.claude/CLAUDE.md')), path.join(agentsDir(home), 'AGENTS.md'));
  assert.ok(fs.lstatSync(path.join(home, '.claude/agents/agents-reviewer.md')).isSymbolicLink());
  assert.ok(!fs.lstatSync(path.join(home, '.claude/skills')).isSymbolicLink(), 'skills はディレクトリごとリンクしない');
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills/agents-quality-loop')).isSymbolicLink(), 'スキル単位でリンクする');
  assert.match(read(path.join(home, '.zshenv')), /\[ -f "\$HOME\/\.agents\/hooks\/shellenv\.sh" \] && \./);
  const settings = JSON.parse(read(path.join(home, '.claude/settings.json')));
  assert.equal(settings.env.BASH_ENV, path.join(agentsDir(home), 'hooks/shellenv.sh'));
  assert.ok(settings.permissions.ask.includes('Bash(git push:*)'));
  const codexHooks = JSON.parse(read(path.join(home, '.codex/hooks.json')));
  assert.ok(codexHooks.hooks.SessionStart.some((m) => m.hooks.some((h) => h.command.includes('beads-session.sh'))),
    'Codex にも SessionStart 断片が配られる');

  const { out } = run(home, ['status']);
  assert.match(out, /乖離なし/);
});

test('冪等: 2 回目の install は何も変更しない', () => {
  const home = freshHome();
  run(home, ['install']);
  const before = read(path.join(agentsDir(home), '.dotagents.json'));
  const settingsBefore = read(path.join(home, '.claude/settings.json'));
  run(home, ['install']);
  const after = JSON.parse(read(path.join(agentsDir(home), '.dotagents.json')));
  const beforeObj = JSON.parse(before);
  delete after.installedAt; delete beforeObj.installedAt;
  assert.deepEqual(after, beforeObj);
  assert.equal(read(path.join(home, '.claude/settings.json')), settingsBefore);
});

test('改変保護: ユーザーが編集したファイルは update が触れず警告し、--force でのみ上書きする', () => {
  const home = freshHome();
  run(home, ['install']);
  const target = path.join(agentsDir(home), 'AGENTS.md');
  fs.appendFileSync(target, '\n# user edit\n');
  const edited = read(target);

  const r = run(home, ['update'], { allowFail: true });
  assert.equal(r.code, 1, '警告で exit 1');
  assert.equal(read(target), edited, '改変は保持される');

  run(home, ['update', '--force']);
  assert.ok(!read(target).includes('# user edit'), '--force で payload の内容に戻る');
});

test('リンク所有権: インストール前から存在した同内容リンクは uninstall が残す', () => {
  const home = freshHome();
  fs.mkdirSync(path.join(agentsDir(home), 'skills'), { recursive: true });
  fs.symlinkSync(path.join(agentsDir(home), 'skills'), path.join(home, '.claude/skills'));
  run(home, ['install']);
  run(home, ['uninstall']);
  assert.ok(fs.lstatSync(path.join(home, '.claude/skills')).isSymbolicLink(), '既存リンクは残る');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), '自作リンクは消える');
});

test('外科的 uninstall: 自前スキルを残し、zshenv と settings を原状復帰する', () => {
  const home = freshHome();
  fs.mkdirSync(path.join(agentsDir(home), 'skills/my-own-skill'), { recursive: true });
  fs.writeFileSync(path.join(agentsDir(home), 'skills/my-own-skill/SKILL.md'), '# mine\n');
  fs.writeFileSync(path.join(home, '.zshenv'), 'export MY_VAR=1\n');
  const userSettings = { model: 'opus', permissions: { allow: ['Bash'] } };
  fs.writeFileSync(path.join(home, '.claude/settings.json'), JSON.stringify(userSettings, null, 2) + '\n');
  const userCodexHooks = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'bash /Users/x/herdr.sh session' }] }] } };
  fs.writeFileSync(path.join(home, '.codex/hooks.json'), JSON.stringify(userCodexHooks, null, 2) + '\n');

  run(home, ['install']);
  run(home, ['uninstall']);

  assert.ok(fs.existsSync(path.join(agentsDir(home), 'skills/my-own-skill/SKILL.md')), '自前スキルは残る');
  assert.ok(!fs.existsSync(path.join(agentsDir(home), 'AGENTS.md')), '配布物は消える');
  assert.equal(read(path.join(home, '.zshenv')), 'export MY_VAR=1\n', 'zshenv は原状復帰');
  assert.deepEqual(JSON.parse(read(path.join(home, '.claude/settings.json'))), userSettings, 'settings は原状復帰');
  assert.deepEqual(JSON.parse(read(path.join(home, '.codex/hooks.json'))), userCodexHooks, 'codex hooks は自分の断片だけ除去され原状復帰');
});

test('shell スコープ: 強制則の層だけが入り、プロンプトへの影響を持たず、外科的に戻る', () => {
  const home = freshHome();
  run(home, ['install', '--shell']);

  assert.ok(fs.existsSync(path.join(home, '.agents/bin/bd')), 'ガードは入る');
  assert.ok(fs.existsSync(path.join(home, '.agents/hooks/shellenv.sh')), '配達フックは入る');
  assert.ok(!fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'プロンプトは入らない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/CLAUDE.md')), 'リンクを張らない');
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')), 'settings 断片を書かない');
  assert.match(read(path.join(home, '.zshenv')), /agents-harness/, 'zshenv 行だけが環境断片');
  assert.equal(JSON.parse(read(path.join(home, '.agents/.dotagents.json'))).scope, 'shell');

  const { out } = run(home, ['status']);
  assert.match(out, /scope=shell/);
  assert.match(out, /乖離なし/);

  run(home, ['uninstall']);
  assert.ok(!fs.existsSync(path.join(home, '.agents')));
  assert.ok(!read(path.join(home, '.zshenv')).includes('agents-harness'));
});

test('settings 断片: defs から消えた自分所有の ask ルールだけを update が刈り込む', () => {
  const home = freshHome();
  run(home, ['install']);
  const sPath = path.join(home, '.claude/settings.json');
  const s = JSON.parse(read(sPath));
  s.permissions.ask.push('Bash(git merge:*)');   // 旧世代で自分が足した扱いにする
  s.permissions.ask.push('Bash(gh pr merge:*)'); // ユーザー自身のルール(所有外)
  fs.writeFileSync(sPath, JSON.stringify(s, null, 2) + '\n');
  const mPath = path.join(home, '.agents/.dotagents.json');
  const m = JSON.parse(read(mPath));
  m.fragments.ask.push('Bash(git merge:*)');
  fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');

  run(home, ['update']);
  const after = JSON.parse(read(sPath)).permissions.ask;
  assert.ok(!after.includes('Bash(git merge:*)'), '所有していた旧ルールは刈り込まれる');
  assert.ok(after.includes('Bash(git push:*)'), '現行 defs のルールは残る');
  assert.ok(after.includes('Bash(gh pr merge:*)'), '所有外のユーザールールには触れない');
});

test('shell スコープ: update はスコープを維持し、install(フラグなし)で全量へ拡大する', () => {
  const home = freshHome();
  run(home, ['install', '--shell']);
  run(home, ['update']);
  assert.equal(JSON.parse(read(path.join(home, '.agents/.dotagents.json'))).scope, 'shell', 'update は縮小スコープを保つ');
  assert.ok(!fs.existsSync(path.join(home, '.agents/AGENTS.md')), 'プロンプトは入ってこない');
  run(home, ['install']);
  assert.equal(JSON.parse(read(path.join(home, '.agents/.dotagents.json'))).scope, 'full', 'install で全量へ拡大');
  assert.ok(fs.existsSync(path.join(home, '.agents/AGENTS.md')));
});

test('project(git repo): 配布物の .agents/.gitignore がマシン固有の生成物を版管理から外す', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-gitproj-'));
  execFileSync('git', ['init', '-q'], { cwd: proj });
  run(os.homedir(), ['install', '--project', proj]);

  assert.ok(fs.existsSync(path.join(proj, '.agents/.gitignore')), '.gitignore が配布される');
  const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: proj, encoding: 'utf8' });
  assert.ok(!status.includes('.dotagents.json'), 'manifest は untracked に現れない');
  assert.ok(status.includes('.agents/AGENTS.md'), '配布物自体は版管理の対象に見える');

  run(os.homedir(), ['uninstall', '--project', proj]);
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.gitignore ごと外科的に消える');
});

test('project モード: 相対リンクで張り、断片は settings.local.json に書く', () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-proj-'));
  run(os.homedir(), ['install', '--project', proj]);
  assert.equal(fs.readlinkSync(path.join(proj, '.claude/CLAUDE.md')), '../.agents/AGENTS.md');
  assert.equal(fs.readlinkSync(path.join(proj, '.claude/skills/agents-kickoff')), '../../.agents/skills/agents-kickoff');
  assert.ok(fs.existsSync(path.join(proj, '.claude/settings.local.json')));
  assert.ok(!fs.existsSync(path.join(proj, '.claude/settings.json')), '版管理対象の settings.json には書かない');
  run(os.homedir(), ['uninstall', '--project', proj]);
  assert.ok(!fs.existsSync(path.join(proj, '.agents')), '.agents ごと消える');
});
