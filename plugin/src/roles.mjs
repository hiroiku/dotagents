// エージェントの定義(agents/*.md)を読み、ホストごとの形に直す。正は agents/*.md の 1 か所で、ほかはここから導く。

import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './root.mjs';

export function readRole(file) {
  const match = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`エージェントの定義に frontmatter が無い: ${file}`);
  const fields = Object.fromEntries([...match[1].matchAll(/^([A-Za-z-]+): *(.+)$/gm)].map(([, key, value]) => [key, value.trim()]));
  if (!fields.name || !fields.description) throw new Error(`エージェントの定義に name か description が無い: ${file}`);
  return { ...fields, body: match[2].trim() };
}

export function roles(root = PLUGIN_ROOT) {
  const dir = path.join(root, 'agents');
  return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => readRole(path.join(dir, name)));
}

// Codex は plugin でエージェントを運べないので、エージェントごとの TOML を置く。モデルの名前はホストごとに違うので、写さない。
export function codexAgent(role, prefix = 'dotagents') {
  const fields = { name: `${prefix}-${role.name}`, description: role.description, developer_instructions: role.body };
  return { file: `${fields.name}.toml`, content: `${Object.entries(fields).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n` };
}

// Antigravity のツールの名前(資料による、実機で未確認)。資料は、知らない名前を許可の並びに書くと、サブエージェントが止まったまま
// 進まないことがあると書く。ここに無い名前は書かない。
const ANTIGRAVITY_BY_CLAUDE = {
  Read: ['view_file'],
  Glob: ['find_by_name', 'list_dir'],
  Grep: ['grep_search'],
  Bash: ['run_command', 'manage_task'],
  Edit: ['replace_file_content', 'multi_replace_file_content'],
  Write: ['write_to_file'],
  WebFetch: ['read_url_content'],
  WebSearch: ['search_web'],
};
export const ANTIGRAVITY_TOOLS = [...new Set(Object.values(ANTIGRAVITY_BY_CLAUDE).flat())];

// Antigravity は plugin の agents/ を読む。Claude Code の定義(モデルとツールの名前)はそのまま読めないので、frontmatter を直す。
// ツールを決めていないエージェントにも、許可の並びを書く。並びを省いたときの既定は、資料の頁によって「すべて」と「無し」に分かれる。
// ルールと hook がサブエージェントに届くよう、inheritCustomizations を書く(既定でも true と資料にある)。
export function antigravityAgent(role, prefix = 'dotagents') {
  const named = role.tools ? role.tools.split(',').map((name) => name.trim()).filter(Boolean) : Object.keys(ANTIGRAVITY_BY_CLAUDE);
  const tools = [...new Set(named.flatMap((name) => {
    if (!ANTIGRAVITY_BY_CLAUDE[name]) throw new Error(`Antigravity のツール名に変換できない: ${name}(${role.name})`);
    return ANTIGRAVITY_BY_CLAUDE[name];
  }))];
  const name = `${prefix}-${role.name}`;
  const front = [`name: ${name}`, `description: ${JSON.stringify(role.description)}`, 'model: inherit', 'mainAgent: false', 'subagent: true', 'inheritCustomizations: true', 'tools:', ...tools.map((tool) => `  - ${tool}`)];
  return { file: `${name}.md`, content: `---\n${front.join('\n')}\n---\n\n${role.body}\n` };
}
