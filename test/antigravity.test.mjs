import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { coreText } from '../plugin/src/context.mjs';
import { ANTIGRAVITY_TOOLS, roles } from '../plugin/src/roles.mjs';
import { build, OUT } from '../tools/antigravity.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-home-'));

function project(declaration) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-antigravity-'));
  if (declaration) {
    fs.mkdirSync(path.join(dir, '.agents'));
    fs.writeFileSync(path.join(dir, '.agents', 'dotagents.jsonc'), JSON.stringify(declaration));
  }
  return dir;
}

// Antigravity は、plugin の根を作業ディレクトリーにして、hooks.json に書いたコマンドを動かす(資料による)。
// 生成した置き場で、hooks.json に書いたとおりに動かして確かめる。
const hooks = JSON.parse(fs.readFileSync(path.join(OUT, 'hooks.json'), 'utf8')).dotagents;
const commandOf = (event) => (event === 'SessionStart' ? hooks.SessionStart[0] : hooks.PreToolUse[0].hooks[0]).command;
function run(event, input) {
  const words = commandOf(event).split(' ');
  assert.equal(words[0], 'node');
  const result = spawnSync(process.execPath, words.slice(1), { cwd: OUT, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env: { ...process.env, DOTAGENTS_HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

// 資料の stdin の例に沿った形。cwd と、どのエージェントからの呼び出しかは来ない。
const common = (cwd) => ({ conversationId: 'ec33ebf9-0cba-4100-8142-c61503f6c587', workspacePaths: [cwd], transcriptPath: '/nowhere/transcript.jsonl', artifactDirectoryPath: '/nowhere', modelName: 'gemini-3.6-flash-medium' });
const tool = (cwd, name, args) => run('PreToolUse', { ...common(cwd), toolCall: { name, args }, stepIdx: 3 });
const shell = (cwd, command, extra = {}) => tool(cwd, 'run_command', { CommandLine: command, Cwd: cwd, WaitMsBeforeAsync: 5000, ...extra });

test('生成した Antigravity の置き場は、plugin/ から作り直しても差分が出ない', () => {
  const expected = build();
  const actual = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name !== '.DS_Store') actual.set(path.relative(OUT, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8'));
    }
  };
  walk(OUT);
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), 'node tools/antigravity.mjs で作り直す');
  for (const [file, content] of expected) assert.equal(actual.get(file), content, `${file}: node tools/antigravity.mjs で作り直す`);
});

test('Antigravity の置き場は、ルールに共通ルールと設計の形を、エージェントに同じ本文と Antigravity の道具を持つ', () => {
  const files = build();
  assert.equal(files.get('rules/AGENTS.md'), `${coreText('core')}\n\n${coreText('layered')}\n`);
  // 1 つのルールのファイルは、24,000 バイトを超えると切られる(資料による)。
  assert.ok(Buffer.byteLength(files.get('rules/AGENTS.md')) < 24000);
  for (const role of roles()) {
    const text = files.get(`agents/dotagents-${role.name}.md`);
    const [, front, body] = text.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)\n$/);
    assert.equal(body, role.body, role.name);
    assert.match(front, /^model: inherit$/m);
    assert.match(front, /^mainAgent: false$/m);
    assert.match(front, /^subagent: true$/m);
    assert.match(front, /^inheritCustomizations: true$/m);
    const tools = [...front.matchAll(/^ {2}- (\S+)$/gm)].map(([, name]) => name);
    assert.ok(tools.length && tools.every((name) => ANTIGRAVITY_TOOLS.includes(name)), `${role.name}: ${tools}`);
    // 読むだけのエージェントは、書き換える道具を持たない。
    if (role.tools) assert.ok(!tools.some((name) => /write|replace/.test(name)), role.name);
  }
  // hook が入れる文は、hook の部品と一緒に置き場にある。
  for (const event of ['SessionStart', 'PreToolUse']) assert.ok(fs.existsSync(path.join(OUT, commandOf(event).split(' ')[1])), event);
});

test('Antigravity のセッションの開始では、オーケストレーターの文と dotagents.jsonc の事実を入れ、ルールと同じ文は入れない', () => {
  const cwd = project({ decisions: ['決定 A'], checks: { push: 'npm test' }, delegated: ['tag'] });
  const output = run('SessionStart', common(cwd));
  assert.equal(output.injectSteps.length, 1);
  const text = output.injectSteps[0].systemMessage.systemMessage;
  assert.match(text, /# オーケストレーター/);
  assert.match(text, /決定 A/);
  assert.match(text, /push: `npm test`/);
  assert.match(text, /確認せずに進める: tag/);
  assert.ok(!text.includes(coreText('core')) && !text.includes(coreText('layered')));
  const broken = project();
  fs.mkdirSync(path.join(broken, '.agents'));
  fs.writeFileSync(path.join(broken, '.agents', 'dotagents.jsonc'), '{');
  assert.match(run('SessionStart', common(broken)).injectSteps[0].systemMessage.systemMessage, /dotagents\.jsonc を読めなかった/);
});

test('Antigravity では、外へ届く操作を毎回確かめ、止める手順は理由と一緒に止め、ほかは利用者の許可の流れに任せる', () => {
  const cwd = project();
  const push = shell(cwd, 'git push origin main');
  assert.equal(push.decision, 'force_ask');
  assert.match(push.reason, /共有ブランチへの push/);
  const signed = shell(cwd, 'git commit -m "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"');
  assert.equal(signed.decision, 'deny');
  assert.match(signed.reason, /AI の関与/);
  // allow は、ほかの hook と既定の許可の流れに任せる。auto_approve は確かめを飛ばすので返さない(資料による)。
  assert.deepEqual(shell(cwd, 'ls -la'), { decision: 'allow' });
  // Cwd が無ければ、最初のワークスペースで読む。
  assert.equal(tool(cwd, 'run_command', { CommandLine: 'gh release create v1' }).decision, 'force_ask');
});

test('Antigravity の編集の道具は、dotagents.jsonc の確かめる線を動かすときと、指示ファイルのときだけ確かめる', () => {
  const cwd = project({ delegated: ['push:develop'], decisions: ['a'] });
  const file = path.join(cwd, '.agents', 'dotagents.jsonc');
  assert.equal(tool(cwd, 'write_to_file', { TargetFile: file, CodeContent: '{}', Overwrite: true }).decision, 'force_ask');
  assert.equal(tool(cwd, 'replace_file_content', { TargetFile: file, TargetContent: '"a"', ReplacementContent: '"a","b"', AllowMultiple: false }).decision, 'allow');
  assert.equal(tool(cwd, 'replace_file_content', { TargetFile: file, TargetContent: 'push:develop', ReplacementContent: 'push', AllowMultiple: false }).decision, 'force_ask');
  assert.equal(tool(cwd, 'multi_replace_file_content', { TargetFile: file, ReplacementChunks: [{ TargetContent: '"a"', ReplacementContent: '"b"' }] }).decision, 'allow');
  // 書き換える場所が 1 つに決まらないときは、線が動くものとして確かめる。
  assert.equal(tool(cwd, 'replace_file_content', { TargetFile: file, TargetContent: '"', ReplacementContent: "'", AllowMultiple: false }).decision, 'force_ask');
  assert.equal(tool(cwd, 'write_to_file', { TargetFile: path.join(cwd, 'AGENTS.md'), CodeContent: 'x' }).decision, 'force_ask');
  assert.deepEqual(tool(cwd, 'write_to_file', { TargetFile: path.join(cwd, 'src.ts'), CodeContent: 'x' }), { decision: 'allow' });
});

test('Antigravity の受け口は、読めない入力でも決定を返し、確かめと文を記録に残す', () => {
  assert.deepEqual(run('PreToolUse', 'not json'), { decision: 'allow' });
  assert.deepEqual(run('PreToolUse', {}), { decision: 'allow' });
  const lines = fs.readdirSync(path.join(home, 'log')).flatMap((name) => fs.readFileSync(path.join(home, 'log', name), 'utf8').trim().split('\n').map((line) => JSON.parse(line)));
  assert.ok(lines.some((entry) => entry.host === 'antigravity' && entry.event === 'guard' && entry.decision === 'ask' && entry.kind === 'push'));
  assert.ok(lines.some((entry) => entry.host === 'antigravity' && entry.event === 'context' && entry.role === 'orchestrator'));
  assert.ok(lines.every((entry) => !/git push origin main|Co-Authored/.test(JSON.stringify(entry))), 'コマンドの文字列を残さない');
});

test('Antigravity の manifest は、資料の schema が許す項目だけを持つ', () => {
  const manifest = JSON.parse(build().get('plugin.json'));
  const allowed = ['$schema', 'name', 'displayName', 'description', 'version', 'disabled', 'logo', 'suggestedPrompts', 'skills', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'];
  assert.deepEqual(Object.keys(manifest).filter((key) => !allowed.includes(key)), []);
  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.equal(fs.existsSync(path.join(ROOT, 'antigravity', 'plugin.json')), true);
});
