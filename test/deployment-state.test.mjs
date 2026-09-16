import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const CLI = path.resolve(new URL('../bin/agents-setup', import.meta.url).pathname);
const plugin = '.claude/skills/dotagents';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-states-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home');
  const project = path.join(dir, 'project');
  const pkg = path.join(dir, 'package');
  for (const p of [home, project, path.join(pkg, 'bin')]) fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(project, 'AGENTS.md'), '# project rules\n');
  fs.writeFileSync(path.join(pkg, 'package.json'), '{"version":"1.0.0"}\n');
  const cli = path.join(pkg, 'bin', 'agents-setup');
  fs.copyFileSync(CLI, cli);
  for (const name of ['alpha', 'beta', 'gamma', 'delta']) {
    const root = path.join(pkg, 'modules', name);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'module.json'), JSON.stringify({ description: `${name} description` }));
    if (['gamma', 'delta'].includes(name)) fs.writeFileSync(path.join(root, 'AGENTS.md'), `# ${name} v1\n`);
    else {
      fs.mkdirSync(path.join(root, 'skills', name), { recursive: true });
      fs.writeFileSync(path.join(root, 'skills', name, 'SKILL.md'), `# ${name} v1\n`);
    }
  }
  const env = { ...process.env, HOME: home, DOTAGENTS_HOME: path.join(home, '.dotagents'), NO_COLOR: '1' };
  const run = (...args) => {
    const options = { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    try { return { code: 0, out: execFileSync(process.execPath, [cli, ...args], options) }; }
    catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
  };
  const source = (name, rel = `skills/${name}/SKILL.md`) => path.join(env.DOTAGENTS_HOME, 'modules', name, rel);
  const target = (name) => path.join(project, plugin, 'skills', name, 'SKILL.md');
  const status = () => run('status', '-C', project);
  const install = (...names) => {
    const result = run('install', ...names, '-C', project);
    assert.equal(result.code, 0, result.out);
  };
  return { dir, home, project, pkg, cli, env, run, source, target, status, install };
}

function stateLine(output, name) {
  const line = output.split('\n').find((line) => new RegExp(`^\\s*[○●↑~!] ${name}\\s`).test(line));
  assert.ok(line, `No module summary for ${name}:\n${output}`);
  return line.trim();
}

test('version and documentation changes do not mark unchanged modules as updates', (t) => {
  const f = fixture(t);
  f.install('alpha', 'gamma');
  assert.match(f.status().out, /no drift/);
  fs.writeFileSync(f.source('alpha', 'README.md'), '# documentation only\n');
  fs.writeFileSync(path.join(f.pkg, 'package.json'), '{"version":"2.0.0"}\n');
  const result = f.status();
  assert.match(stateLine(result.out, 'alpha'), /^● alpha\s+installed$/);
  assert.match(stateLine(result.out, 'gamma'), /^● gamma\s+installed$/);
  assert.equal(result.code, 1, 'the shared plugin manifest still needs updating');
  assert.match(result.out, /plugin.json — source changed, run update/);
});

test('content checks distinguish upstream changes, local edits, and both on the same file', (t) => {
  const f = fixture(t);
  f.install('alpha', 'beta', 'gamma', 'delta');
  fs.appendFileSync(f.source('alpha'), '# source change\n');
  fs.appendFileSync(f.target('beta'), '# local edit\n');
  fs.appendFileSync(f.source('gamma', 'AGENTS.md'), '# source rules change\n');
  let result = f.status();
  assert.equal(result.code, 1);
  assert.match(stateLine(result.out, 'alpha'), /↑ alpha\s+update available$/);
  assert.match(stateLine(result.out, 'beta'), /~ beta\s+modified locally$/);
  assert.match(stateLine(result.out, 'gamma'), /↑ gamma\s+update available$/);
  assert.match(stateLine(result.out, 'delta'), /● delta\s+installed$/);
  fs.appendFileSync(f.source('beta'), '# source also changed\n');
  result = f.status();
  assert.match(stateLine(result.out, 'beta'), /modified locally \+ update available/);
  assert.match(result.out, /beta\/SKILL.md — source changed, run update; modified in place/);
  assert.match(fs.readFileSync(f.target('beta'), 'utf8'), /local edit/);
  // The desired contents may already have been copied manually.
  fs.copyFileSync(f.source('alpha'), f.target('alpha'));
  assert.match(stateLine(f.run('status', '-C', f.project, '--agent', 'claude').out, 'alpha'), /installed$/);
});

test('new deliveries are updates; deleted recorded files are missing; symlinks are blocked', (t) => {
  const f = fixture(t);
  f.install('alpha', 'beta');
  fs.writeFileSync(f.source('alpha', 'skills/alpha/new.md'), '# new file\n');
  fs.unlinkSync(f.target('beta'));
  let result = f.status();
  assert.match(stateLine(result.out, 'alpha'), /update available/);
  assert.match(stateLine(result.out, 'beta'), /missing files/);
  assert.match(result.out, /new.md — new delivery, run update/);
  fs.symlinkSync(f.source('beta'), f.target('beta'));
  result = f.status();
  assert.match(stateLine(result.out, 'beta'), /blocked/);
  assert.match(result.out, /a symlink is in the way/);
});

test('shared rules report edits without attributing them to an unrelated file module', (t) => {
  const f = fixture(t);
  f.install('alpha', 'gamma', 'delta');
  const rules = path.join(f.project, 'AGENTS.md');
  fs.appendFileSync(rules, '\n# outside the managed block\n');
  assert.equal(f.status().code, 0, 'unmanaged rules are not drift');
  fs.writeFileSync(rules, fs.readFileSync(rules, 'utf8').replace('# gamma v1', '# local rules edit'));
  fs.appendFileSync(f.source('gamma', 'AGENTS.md'), '# upstream rules change\n');
  const result = f.status();
  assert.match(stateLine(result.out, 'alpha'), /installed$/);
  assert.match(stateLine(result.out, 'gamma'), /shared rules changed \+ update available/);
  assert.match(stateLine(result.out, 'delta'), /shared rules changed$/);
  assert.match(result.out, /shared rules differ \(modified in place\)/);
  fs.unlinkSync(rules);
  assert.match(stateLine(f.status().out, 'gamma'), /missing files/);
});

test('removing source rules stays visible until update removes their managed block', (t) => {
  const f = fixture(t);
  f.install('gamma');
  fs.unlinkSync(f.source('gamma', 'AGENTS.md'));
  const result = f.status();
  assert.equal(result.code, 1);
  assert.match(stateLine(result.out, 'gamma'), /update available/);
});

// Exercise the real CLI key handling and output over pipes, with only TTY capabilities
// supplied by a preload. No shell, terminal emulator, or external dependency is needed.
function picker(t, f, { command = 'install', args = ['-C', f.project], columns = 100, rows = 30, color = true } = {}) {
  const preload = path.join(f.dir, 'tty.cjs');
  fs.writeFileSync(preload, `
Object.defineProperty(process.stdin, 'isTTY', { value: true });
Object.defineProperty(process.stdout, 'isTTY', { value: true });
process.stdin.setRawMode = () => {};
process.stdout.columns = ${columns};
process.stdout.rows = ${rows};
`);
  const env = { ...f.env, NO_COLOR: color ? '' : '1', TERM: 'xterm-256color' };
  delete env.FORCE_COLOR;
  const child = spawn(process.execPath, ['--require', preload, f.cli, command, ...args], { env, stdio: 'pipe' });
  t.after(() => child.kill());
  const exited = once(child, 'close');
  let output = '';
  let error = '';
  let consumed = 0;
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { error += chunk; });
  const frame = () => new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', check); };
    const check = () => {
      const next = output.slice(consumed);
      if (!stripVTControlCharacters(next).endsWith('ctrl-c cancel\n')) return;
      cleanup();
      consumed = output.length;
      resolve({ raw: next, text: stripVTControlCharacters(next) });
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Picker did not render:\n${output}\n${error}`)); }, 5000);
    child.stdout.on('data', check);
    check();
  });
  return {
    frame,
    send: (keys) => child.stdin.write(keys),
    done: async () => { child.stdin.end(); const [code] = await exited; return { code, out: stripVTControlCharacters(output + error) }; },
  };
}

test('picker separates selection from installed state and keeps unchecked installed modules', { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  f.install('alpha');
  const p = picker(t, f);
  let frame = await p.frame();
  assert.match(frame.text, /project →/);
  assert.match(frame.text, /\[ \] ● alpha\s+installed/);
  assert.match(frame.text, /\[ \] ○ beta\s+available/);
  assert.match(frame.text, /0 selected/);
  assert.match(frame.raw, /\x1b\[32m●\x1b\[39m/);
  p.send(' ');
  frame = await p.frame();
  assert.match(frame.text, /\[x\] ● alpha\s+installed/);
  assert.match(frame.raw, /\x1b\[32m●\x1b\[39m/, 'selecting does not recolor the state');
  p.send(' ');
  await p.frame();
  p.send('\x1b[B');
  await p.frame();
  p.send(' ');
  frame = await p.frame();
  assert.match(frame.text, /\[x\] ○ beta\s+available/);
  p.send('\r');
  frame = await p.frame();
  assert.match(frame.text, /Install into which agents/);
  p.send(' ');
  await p.frame();
  p.send('\r');
  const done = await p.done();
  assert.equal(done.code, 0, done.out);
  const result = f.status();
  assert.match(stateLine(result.out, 'alpha'), /installed$/);
  assert.match(stateLine(result.out, 'beta'), /installed$/);
});

test('picker and status agree on update, edit, and missing indicators', { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  f.install('alpha', 'beta', 'gamma');
  fs.appendFileSync(f.source('alpha'), '# source change\n');
  fs.appendFileSync(f.target('beta'), '# local change\n');
  fs.unlinkSync(path.join(f.project, 'AGENTS.md'));
  const p = picker(t, f);
  const frame = await p.frame();
  assert.match(frame.text, /\[ \] ↑ alpha\s+update available/);
  assert.match(frame.text, /\[ \] ~ beta\s+modified locally/);
  assert.match(frame.text, /\[ \] ! gamma\s+missing files/);
  assert.match(frame.raw, /\x1b\[33m↑/);
  assert.match(frame.raw, /\x1b\[34m~/);
  assert.match(frame.raw, /\x1b\[31m!/);
  p.send('\x03');
  assert.equal((await p.done()).code, 1);
});

test('global picker uses global records, and narrow NO_COLOR output remains navigable', { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  assert.equal(f.run('install', 'alpha', '-g').code, 0);
  const p = picker(t, f, { args: ['-g'], columns: 32, rows: 24, color: false });
  let frame = await p.frame();
  assert.match(frame.text, /global →/);
  assert.match(frame.text, /\[ \] ● alpha/);
  assert.doesNotMatch(frame.raw, /\x1b\[[0-9;]*m/, 'NO_COLOR omits SGR colors');
  for (const line of frame.text.split('\n')) assert.ok([...line].length < 32, line);
  p.send('\x1b[A');
  frame = await p.frame();
  assert.match(frame.text, /❯ \[ \] ○ gamma/);
  assert.ok(frame.text.split('\n').length <= 24, 'the frame fits without terminal scrolling');
  p.send('\x03');
  await p.done();
  const project = picker(t, f);
  frame = await project.frame();
  assert.match(frame.text, /\[ \] ○ alpha\s+available/, 'global installation is not a project installation');
  project.send('\x03');
  await project.done();
});

const read = (file) => fs.readFileSync(file, 'utf8');
const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const codexTarget = (f, name) => path.join(f.project, '.agents', 'skills', `dotagents-${name}`, 'SKILL.md');
const manifestFile = (f) => path.join(f.env.DOTAGENTS_HOME, 'state', 'projects', fs.readdirSync(path.join(f.env.DOTAGENTS_HOME, 'state', 'projects'))[0]);
const record = (f) => JSON.parse(read(manifestFile(f)));
function command(f, ...args) {
  const result = f.run(...args, '-C', f.project);
  assert.equal(result.code, 0, result.out);
  return result.out;
}

test('Codex-only creates native skills, agents and project rules in a fresh project', (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.project, 'AGENTS.md'));
  const module = path.join(f.pkg, 'modules', 'gamma');
  put(path.join(module, 'agents', 'review.md'), '---\nname: review\ndescription: "Review code and tests"\ntools: Read, Glob, Grep, Bash\nmodel: claude-only-model\n---\n\nRead files, then report findings.\n');
  put(path.join(f.pkg, 'modules/alpha/skills/alpha/SKILL.md'), '---\nname: alpha\ndescription: Alpha skill\n---\n\n# alpha v1\n');
  command(f, 'install', 'alpha', 'gamma', '--agent', 'codex');
  assert.equal(fs.existsSync(path.join(f.project, '.claude')), false);
  assert.match(read(codexTarget(f, 'alpha')), /^---\nname: dotagents-alpha\ndescription: Alpha skill/);
  const agent = read(path.join(f.project, '.codex/agents/dotagents-review.toml'));
  const fields = Object.fromEntries(agent.trim().split('\n').map((line) => {
    const [key, value] = line.split(' = '); return [key, JSON.parse(value)];
  }));
  assert.deepEqual(fields, { name: 'dotagents-review', description: 'Review code and tests', sandbox_mode: 'read-only', developer_instructions: 'Read files, then report findings.' });
  assert.match(read(path.join(f.project, 'AGENTS.md')), /# gamma v1/);
  assert.deepEqual(record(f).agentModules, { codex: ['alpha', 'gamma'] });
  assert.match(command(f, 'status', '--agent', 'codex'), /no drift/);
});

test('each tool remembers its own modules across install, update and uninstall', (t) => {
  const f = fixture(t);
  command(f, 'install', 'alpha', 'gamma', '--agent', 'claude');
  assert.equal(read(path.join(f.project, 'AGENTS.md')), '# project rules\n');
  fs.appendFileSync(f.source('alpha'), '# upstream alpha\n');
  command(f, 'install', 'beta', 'delta', '--agent', 'codex');
  assert.doesNotMatch(read(f.target('alpha')), /upstream/);
  assert.equal(fs.existsSync(codexTarget(f, 'alpha')), false);
  assert.equal(fs.existsSync(f.target('beta')), false);
  assert.deepEqual(record(f).agentModules, { claude: ['alpha', 'gamma'], codex: ['beta', 'delta'] });
  assert.match(command(f, 'status', '--agent', 'codex'), /no drift/);
  assert.match(stateLine(f.run('status', '-C', f.project, '--agent', 'claude').out, 'alpha'), /update available/);
  command(f, 'update', '--agent', 'codex');
  assert.doesNotMatch(read(f.target('alpha')), /upstream/);
  command(f, 'update');
  assert.match(read(f.target('alpha')), /upstream/);
  const codexRules = read(path.join(f.project, 'AGENTS.md'));
  command(f, 'uninstall', '--agent', 'claude');
  assert.equal(fs.existsSync(f.target('alpha')), false);
  assert.match(read(codexTarget(f, 'beta')), /beta v1/);
  assert.equal(read(path.join(f.project, 'AGENTS.md')), codexRules);
  assert.deepEqual(record(f).agentModules, { codex: ['beta', 'delta'] });
  command(f, 'uninstall');
  assert.equal(read(path.join(f.project, 'AGENTS.md')), '# project rules\n');
  assert.equal(fs.existsSync(codexTarget(f, 'beta')), false);
});

test('same module can be independently removed from one tool', (t) => {
  const f = fixture(t);
  command(f, 'install', 'alpha', 'gamma', '--agent', 'all');
  command(f, 'uninstall', 'alpha', '--agent', 'codex');
  assert.equal(fs.existsSync(codexTarget(f, 'alpha')), false);
  assert.equal(fs.existsSync(f.target('alpha')), true);
  assert.deepEqual(record(f).agentModules, { claude: ['alpha', 'gamma'], codex: ['gamma'] });
  command(f, 'install', 'alpha', '--agent', 'codex');
  assert.match(command(f, 'status'), /no drift/);
});

test('default updates keep recorded targets even when another tool directory appears', (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.project, 'AGENTS.md'));
  command(f, 'install', 'alpha', 'gamma');
  fs.mkdirSync(path.join(f.project, '.codex'));
  command(f, 'update');
  command(f, 'install', 'beta');
  assert.deepEqual(record(f).agentModules, { claude: ['alpha', 'beta', 'gamma'] });
  assert.equal(fs.existsSync(codexTarget(f, 'alpha')), false);
  const before = read(manifestFile(f));
  assert.equal(f.run('update', '--agent', 'codex', '-C', f.project).code, 1);
  assert.equal(read(manifestFile(f)), before);
});

test('shared canonical rules retain both module sets and do not roll back a shared update', (t) => {
  const f = fixture(t);
  const canonical = path.join(f.project, '.agents/AGENTS.md');
  put(canonical, '# personal rules\n');
  fs.unlinkSync(path.join(f.project, 'AGENTS.md'));
  fs.symlinkSync('.agents/AGENTS.md', path.join(f.project, 'AGENTS.md'));
  fs.mkdirSync(path.join(f.project, '.claude'));
  fs.symlinkSync('../.agents/AGENTS.md', path.join(f.project, '.claude/CLAUDE.md'));
  command(f, 'install', 'gamma', '--agent', 'claude');
  command(f, 'install', 'gamma', 'delta', '--agent', 'codex');
  fs.appendFileSync(f.source('gamma', 'AGENTS.md'), '# gamma v2\n');
  command(f, 'update', '--agent', 'claude');
  assert.match(read(canonical), /gamma v2/);
  assert.match(read(canonical), /delta v1/);
  assert.match(command(f, 'status', '--agent', 'codex'), /no drift/);
  command(f, 'uninstall', '--agent', 'claude');
  assert.match(read(canonical), /gamma v2/);
  command(f, 'uninstall', 'gamma', '--agent', 'codex');
  assert.doesNotMatch(read(canonical), /gamma/);
  assert.match(read(canonical), /delta v1/);
  command(f, 'uninstall', '--agent', 'codex');
  assert.equal(read(canonical), '# personal rules\n');
  assert.equal(fs.readlinkSync(path.join(f.project, 'AGENTS.md')), '.agents/AGENTS.md');
});

test('Codex update migrates schema 4 skill paths without touching Claude or edited old skills', (t) => {
  const f = fixture(t);
  command(f, 'install', 'alpha', 'beta', '--agent', 'all');
  const old = record(f);
  delete old.agentModules; delete old.agentRulesBodies;
  old.schema = 4;
  for (const [rel, value] of Object.entries(old.files)) {
    delete value.agent;
    if (!rel.startsWith('.agents/skills/')) continue;
    const legacy = rel.replace('.agents/skills/', '.codex/skills/');
    put(path.join(f.project, legacy), read(path.join(f.project, rel)));
    fs.unlinkSync(path.join(f.project, rel));
    old.files[legacy] = value; delete old.files[rel];
  }
  put(manifestFile(f), JSON.stringify(old));
  const edited = path.join(f.project, '.codex/skills/dotagents-beta/SKILL.md');
  fs.appendFileSync(edited, '# local legacy edit\n');
  const claude = read(f.target('alpha'));
  const result = f.run('update', '--agent', 'codex', '-C', f.project);
  assert.equal(result.code, 1, 'the preserved legacy edit is reported');
  assert.equal(fs.existsSync(path.join(f.project, '.codex/skills/dotagents-alpha/SKILL.md')), false);
  assert.match(read(edited), /local legacy edit/);
  assert.match(read(codexTarget(f, 'alpha')), /name: dotagents-alpha/);
  assert.equal(read(f.target('alpha')), claude);
  assert.deepEqual(record(f).agentModules, { claude: ['alpha', 'beta'], codex: ['alpha', 'beta'] });
});

test('Codex drift detects generated role changes and preserves edits unless forced', (t) => {
  const f = fixture(t);
  put(path.join(f.pkg, 'modules/gamma/agents/review.md'), '---\nname: review\ndescription: Review\n---\nCheck v1.\n');
  command(f, 'install', 'gamma', '--agent', 'codex');
  fs.appendFileSync(f.source('gamma', 'agents/review.md'), 'Check v2.\n');
  const role = path.join(f.project, '.codex/agents/dotagents-review.toml');
  fs.appendFileSync(role, '# local edit\n');
  assert.match(stateLine(f.status().out, 'gamma'), /modified locally \+ update available/);
  assert.equal(f.run('update', '--agent', 'codex', '-C', f.project).code, 1);
  assert.match(read(role), /local edit/);
  put(path.join(f.pkg, 'modules/gamma/agents/review.md'), read(f.source('gamma', 'agents/review.md')));
  command(f, 'update', '--agent', 'codex', '--force');
  assert.match(read(role), /Check v2/);
  assert.doesNotMatch(read(role), /local edit/);
});

test('native Codex assets stay out of Claude and preserve existing user configuration', (t) => {
  const f = fixture(t);
  const native = path.join(f.pkg, 'modules/gamma/codex');
  put(path.join(native, 'hooks.json'), '{"hooks":{}}\n');
  put(path.join(native, 'agents/custom.toml'), 'name = "custom"\ndescription = "Custom"\ndeveloper_instructions = "Review"\n');
  put(path.join(f.project, '.codex/hooks.json'), '{"user":"keep"}\n');
  command(f, 'install', 'gamma', '--agent', 'claude');
  assert.equal(fs.existsSync(path.join(f.project, plugin, 'codex')), false);
  const result = f.run('install', 'gamma', '--agent', 'codex', '-C', f.project);
  assert.equal(result.code, 1);
  assert.equal(read(path.join(f.project, '.codex/hooks.json')), '{"user":"keep"}\n');
  assert.match(read(path.join(f.project, '.codex/agents/custom.toml')), /name = "custom"/);
});

test('unselected tools are not validated or changed by a targeted operation', (t) => {
  const f = fixture(t);
  command(f, 'install', 'gamma', '--agent', 'codex');
  put(f.source('gamma', 'agents/invalid.md'), 'not a supported agent definition');
  command(f, 'install', 'alpha', '--agent', 'claude');
  assert.match(command(f, 'status', '--agent', 'claude'), /no drift/);
});

test('Codex delivery and uninstall never follow live symlink parents', (t) => {
  const f = fixture(t);
  const outside = path.join(f.dir, 'outside');
  const sentinel = path.join(outside, 'skills/dotagents-alpha/SKILL.md');
  put(sentinel, 'keep me\n');
  fs.symlinkSync(outside, path.join(f.project, '.agents'));
  const result = f.run('install', 'alpha', '--agent', 'codex', '--force', '-C', f.project);
  assert.equal(result.code, 1);
  assert.equal(read(sentinel), 'keep me\n');
  assert.match(stateLine(f.status().out, 'alpha'), /blocked/);
  command(f, 'uninstall', '--agent', 'codex');
  assert.equal(read(sentinel), 'keep me\n');
});

test('agent flags accept multiple targets and reject invalid targets before deployment', (t) => {
  const f = fixture(t);
  for (const args of [['--agent', 'unknown'], ['--agent'], ['--agent', 'claude,unknown']]) {
    const result = f.run('install', 'alpha', ...args, '-C', f.project);
    assert.equal(result.code, 1, result.out);
    assert.equal(fs.existsSync(path.join(f.project, '.claude')), false);
  }
  command(f, 'install', 'alpha', '--agent', 'claude', '--agent', 'codex');
  assert.deepEqual(record(f).agentModules, { claude: ['alpha'], codex: ['alpha'] });
});

test('second picker supports Codex-only and displays installation state for each tool', { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  command(f, 'install', 'alpha', '--agent', 'claude');
  const p = picker(t, f);
  await p.frame(); p.send(' '); await p.frame(); p.send('\r');
  let frame = await p.frame();
  assert.match(frame.text, /Install into which agents/);
  assert.match(frame.text, /\[ \] ● Claude Code\s+1\/1 installed/);
  assert.match(frame.text, /\[ \] ○ Codex\s+0\/1 installed/);
  p.send('\x1b[B'); await p.frame(); p.send(' ');
  frame = await p.frame();
  assert.match(frame.text, /\[x\] ○ Codex/);
  p.send('\r');
  assert.equal((await p.done()).code, 0);
  assert.equal(fs.existsSync(codexTarget(f, 'alpha')), true);
});

for (const key of ['\x03', '\r']) {
  test(`cancelling or leaving the second picker empty writes no deployment (${JSON.stringify(key)})`, { timeout: 10000 }, async (t) => {
    const f = fixture(t);
    const p = picker(t, f);
    await p.frame(); p.send(' '); await p.frame(); p.send('\r'); await p.frame(); p.send(key);
    assert.equal((await p.done()).code, 1);
    assert.equal(fs.existsSync(f.target('alpha')), false);
    assert.equal(fs.existsSync(codexTarget(f, 'alpha')), false);
    assert.equal(fs.existsSync(path.join(f.env.DOTAGENTS_HOME, 'state/projects')), false);
  });
}

test('global Codex installation creates its directories and leaves global Claude untouched', (t) => {
  const f = fixture(t);
  const result = f.run('install', 'alpha', 'gamma', '-g', '--agent', 'codex');
  assert.equal(result.code, 0, result.out);
  assert.match(read(path.join(f.home, '.agents/skills/dotagents-alpha/SKILL.md')), /name: dotagents-alpha/);
  assert.match(read(path.join(f.home, '.codex/AGENTS.md')), /gamma v1/);
  assert.equal(fs.existsSync(path.join(f.home, '.claude')), false);
  assert.equal(f.run('status', '-g', '--agent', 'codex').code, 0);
  assert.equal(f.run('uninstall', '-g', '--agent', 'codex').code, 0);
  assert.equal(fs.existsSync(path.join(f.home, '.codex/AGENTS.md')), false);
});

test('native role override supports metadata that is not automatically convertible', (t) => {
  const f = fixture(t);
  const source = path.join(f.pkg, 'modules/gamma');
  put(path.join(source, 'agents/review.md'), '---\nname: review\ndescription: >\n  A complex description\n---\nReview.\n');
  const native = 'name = "dotagents-review"\ndescription = "Native review"\ndeveloper_instructions = "Check carefully"\n';
  put(path.join(source, 'codex/agents/dotagents-review.toml'), native);
  command(f, 'install', 'gamma', '--agent', 'codex');
  assert.equal(read(path.join(f.project, '.codex/agents/dotagents-review.toml')), native);
  assert.match(command(f, 'status'), /no drift/);
});

test('Claude-only hooks are reported as incomplete in Codex until native hooks are provided', (t) => {
  const f = fixture(t);
  put(path.join(f.pkg, 'modules/gamma/hooks/hooks.json'), '{"hooks":{}}\n');
  const result = f.run('install', 'gamma', '--agent', 'codex', '-C', f.project);
  assert.equal(result.code, 1);
  assert.match(result.out, /Claude hooks need native codex\/hooks.json/);
  assert.match(stateLine(f.status().out, 'gamma'), /blocked/);
  put(f.source('gamma', 'codex/hooks.json'), '{"hooks":{}}\n');
  command(f, 'update', '--agent', 'codex');
  assert.match(command(f, 'status'), /no drift/);
});

test('second picker can select both destinations in one installation', { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  const p = picker(t, f);
  await p.frame(); p.send(' '); await p.frame(); p.send('\r'); await p.frame();
  p.send(' '); await p.frame(); p.send('\x1b[B'); await p.frame(); p.send(' ');
  const frame = await p.frame();
  assert.match(frame.text, /2 selected/);
  p.send('\r'); assert.equal((await p.done()).code, 0);
  assert.deepEqual(record(f).agentModules, { claude: ['alpha'], codex: ['alpha'] });
  assert.equal(fs.existsSync(f.target('alpha')), true);
  assert.equal(fs.existsSync(codexTarget(f, 'alpha')), true);
});

test('an untracked legacy layout must migrate before selecting only one agent', (t) => {
  const f = fixture(t);
  const legacy = path.join(f.project, '.agents/.dotagents.json');
  put(legacy, '{"modules":["alpha"],"files":{},"links":[],"fragments":{}}\n');
  const result = f.run('install', 'alpha', '--agent', 'codex', '-C', f.project);
  assert.equal(result.code, 1);
  assert.match(result.out, /run update without --agent/);
  assert.equal(fs.existsSync(legacy), true);
  assert.equal(fs.existsSync(codexTarget(f, 'alpha')), false);
});

test('install touches only the named modules and leaves pending updates to update', (t) => {
  const f = fixture(t);
  put(path.join(f.pkg, 'modules/alpha/skills/alpha/old.md'), '# retired file\n');
  f.install('alpha', 'gamma');
  const retired = path.join(path.dirname(f.target('alpha')), 'old.md');
  fs.unlinkSync(path.join(f.pkg, 'modules/alpha/skills/alpha/old.md'));
  fs.appendFileSync(f.source('alpha'), '# upstream alpha\n');
  fs.appendFileSync(f.source('gamma', 'AGENTS.md'), '# upstream gamma\n');
  const rules = path.join(f.project, 'AGENTS.md');

  const result = f.run('install', 'beta', '-C', f.project);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /alpha gamma left as delivered — `agents-setup update` applies their updates/);
  assert.equal(fs.existsSync(f.target('beta')), true);
  assert.doesNotMatch(read(f.target('alpha')), /upstream/);
  assert.equal(fs.existsSync(retired), true, 'files of an untouched module are not pruned');
  assert.doesNotMatch(read(rules), /upstream gamma/);
  let status = f.status().out;
  assert.match(stateLine(status, 'alpha'), /update available$/);
  assert.match(stateLine(status, 'beta'), /installed$/);

  f.install('alpha');
  assert.match(read(f.target('alpha')), /upstream/, 'naming an installed module refreshes it');
  assert.equal(fs.existsSync(retired), false);
  assert.doesNotMatch(read(rules), /upstream gamma/);
  command(f, 'update');
  assert.match(read(rules), /upstream gamma/);
  assert.match(f.status().out, /no drift/);
});

test('uninstall removes only the named modules and leaves pending updates to update', (t) => {
  const f = fixture(t);
  f.install('alpha', 'beta');
  fs.appendFileSync(f.source('beta'), '# upstream beta\n');
  assert.match(command(f, 'uninstall', 'alpha'), /beta left as delivered/);
  assert.equal(fs.existsSync(f.target('alpha')), false);
  assert.doesNotMatch(read(f.target('beta')), /upstream/);
  assert.match(stateLine(f.status().out, 'beta'), /update available$/);
});

test('uninstall picker offers installed modules and removes only the checked ones', { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  command(f, 'install', 'alpha', 'beta', 'gamma', '--agent', 'claude');
  const p = picker(t, f, { command: 'uninstall' });
  let frame = await p.frame();
  assert.match(frame.text, /Which modules to remove\?/);
  assert.match(frame.text, /\[ \] ● alpha\s+installed/);
  assert.doesNotMatch(frame.text, /delta/, 'modules that are not installed are not offered');
  p.send('\x1b[B'); await p.frame(); p.send(' ');
  frame = await p.frame();
  assert.match(frame.text, /\[x\] ● beta/);
  p.send('\r');
  const done = await p.done();
  assert.equal(done.code, 0, done.out);
  assert.doesNotMatch(done.out, /Remove from which agents/, 'a single destination leaves nothing to choose');
  assert.deepEqual(record(f).agentModules, { claude: ['alpha', 'gamma'] });
  assert.equal(fs.existsSync(f.target('beta')), false);
  assert.equal(fs.existsSync(f.target('alpha')), true);
});

test('uninstall picker asks for agents when the selection is installed in both', { timeout: 10000 }, async (t) => {
  const f = fixture(t);
  command(f, 'install', 'alpha', '--agent', 'all');
  command(f, 'install', 'gamma', '--agent', 'claude');
  const p = picker(t, f, { command: 'uninstall' });
  await p.frame(); p.send(' ');
  await p.frame(); p.send('\x1b[B');
  await p.frame(); p.send(' ');
  await p.frame(); p.send('\r');
  let frame = await p.frame();
  assert.match(frame.text, /Remove from which agents\?/);
  assert.match(frame.text, /\[ \] ● Claude Code\s+2\/2 installed/);
  assert.match(frame.text, /\[ \] ● Codex\s+1\/2 installed/);
  p.send('\x1b[B'); await p.frame(); p.send(' ');
  frame = await p.frame();
  assert.match(frame.text, /\[x\] ● Codex/);
  p.send('\r');
  const done = await p.done();
  assert.equal(done.code, 0, done.out);
  assert.deepEqual(record(f).agentModules, { claude: ['alpha', 'gamma'] });
  assert.equal(fs.existsSync(codexTarget(f, 'alpha')), false);
  assert.equal(fs.existsSync(f.target('alpha')), true);
});

for (const key of ['\x03', '\r']) {
  test(`cancelling or confirming an empty uninstall picker removes nothing (${JSON.stringify(key)})`, { timeout: 10000 }, async (t) => {
    const f = fixture(t);
    f.install('alpha');
    const before = read(manifestFile(f));
    const p = picker(t, f, { command: 'uninstall' });
    await p.frame(); p.send(key);
    assert.equal((await p.done()).code, 1);
    assert.equal(read(manifestFile(f)), before);
    assert.equal(fs.existsSync(f.target('alpha')), true);
  });
}
