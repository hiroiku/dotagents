// Antigravity の plugin の置き場(antigravity/)を、plugin/ から作る。
//
//   node tools/antigravity.mjs
//
// 正は plugin/ の 1 か所で、antigravity/ は生成物である。手で直さず、plugin/ を直してからこれを実行する。
// 生成し直して差分が出ないことを、テストが守る。
//
// plugin/ をそのまま Antigravity の plugin にはできない。Antigravity は plugin の agents/ を読むが、そこにある Claude Code の
// 定義(モデルと道具の名前)を読めないからである。hook は plugin の根を作業ディレクトリーとして動き、${PLUGIN_ROOT} を
// 使えないので(資料による)、hook の部品(src/、core/)も置き場に入れる。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sharedText } from '../plugin/src/context.mjs';
import { antigravityAgent, roles } from '../plugin/src/roles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN = path.join(ROOT, 'plugin');
export const OUT = path.join(ROOT, 'antigravity');

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function copyTree(files, from, to) {
  for (const entry of fs.readdirSync(path.join(PLUGIN, from), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.DS_Store') continue;
    const source = `${from}/${entry.name}`;
    const target = `${to}/${entry.name}`;
    if (entry.isDirectory()) copyTree(files, source, target);
    else files.set(target, fs.readFileSync(path.join(PLUGIN, source), 'utf8'));
  }
}

const README = `# dotagents for Antigravity

Generated from \`../plugin\` by \`node tools/antigravity.mjs\`. Do not edit these files; change \`plugin/\` and generate again.
See the repository's README for installation and for the rules Antigravity cannot enforce.

このディレクトリーは、\`plugin/\` から \`node tools/antigravity.mjs\` で作った生成物です。手で直さず、\`plugin/\` を直して作り直します。
`;

// 置き場の相対パスと中身。
export function build() {
  const files = new Map();
  const source = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  files.set('plugin.json', json({
    $schema: 'https://antigravity.google/schemas/v1/plugin.json',
    name: source.name,
    displayName: source.name,
    version: source.version,
    description: source.description,
    author: source.author,
    repository: source.repository,
    license: source.license,
  }));
  files.set('README.md', README);
  files.set('hooks.json', fs.readFileSync(path.join(PLUGIN, 'hosts', 'antigravity', 'hooks.json'), 'utf8'));
  // rules/AGENTS.md は、plugin が有効な間、どのセッションにも入る(資料による)。どのロールにも入る文をここに置く。
  files.set('rules/AGENTS.md', `${sharedText()}\n`);
  for (const role of roles()) {
    const { file, content } = antigravityAgent(role);
    files.set(`agents/${file}`, content);
  }
  copyTree(files, 'skills', 'skills');
  copyTree(files, 'core', 'core');
  copyTree(files, 'src', 'src');
  return files;
}

export function write(out = OUT) {
  const files = build();
  fs.rmSync(out, { recursive: true, force: true });
  for (const [file, content] of files) {
    const target = path.join(out, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = write();
  process.stdout.write(`${path.relative(process.cwd(), OUT) || '.'}: ${files.size} files\n`);
}
