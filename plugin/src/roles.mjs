// エージェントの定義(agents/*.md)を読み、ホストごとの形に直す。正は agents/*.md の 1 か所で、ほかはここから導く。

import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT } from './root.mjs';
import { nameSkills } from './skills.mjs';

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

// Codex の利用者の設定に置く TOML の先頭の行。この行があるファイルだけを、dotagents が書いたものとして書き換える。
export const CODEX_MARK = '# dotagents が生成したファイル。dotagents の更新で書き換わるので、手で編集しない。';

// Codex は plugin でエージェントを運べないので、エージェントごとの TOML を置く。モデルは書かず、利用者の Codex の設定に従わせる。
// legacy は、印を入れる前のバージョンが同じ定義から書いた中身である。naming は、本文がスキルを指す名前の付け方(skills.mjs)。
export function codexAgent(role, naming, prefix = 'dotagents') {
  const fields = { name: `${prefix}-${role.name}`, description: role.description, developer_instructions: nameSkills(role.body, naming) };
  const body = `${Object.entries(fields).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n`;
  return { file: `${fields.name}.toml`, content: `${CODEX_MARK}\n${body}`, legacy: body };
}

// リポジトリーに置くときの Claude Code のエージェントの定義(.claude/agents/)。plugin の定義と同じ形で、名前に prefix を付け、
// 本文がスキルを指す名前を naming にする。frontmatter のほかの項目(ツールの許可)は、そのまま写す。
export function claudeAgent(role, naming, prefix = 'dotagents') {
  const { body, ...fields } = role;
  const name = `${prefix}-${role.name}`;
  const front = Object.entries({ ...fields, name }).map(([key, value]) => `${key}: ${value}`);
  return { file: `${name}.md`, content: `---\n${front.join('\n')}\n---\n\n${nameSkills(body, naming)}\n` };
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
export function antigravityAgent(role, naming, prefix = 'dotagents') {
  const named = role.tools ? role.tools.split(',').map((name) => name.trim()).filter(Boolean) : Object.keys(ANTIGRAVITY_BY_CLAUDE);
  const tools = [...new Set(named.flatMap((name) => {
    if (!ANTIGRAVITY_BY_CLAUDE[name]) throw new Error(`Antigravity のツール名に変換できない: ${name}(${role.name})`);
    return ANTIGRAVITY_BY_CLAUDE[name];
  }))];
  const name = `${prefix}-${role.name}`;
  const front = [`name: ${name}`, `description: ${JSON.stringify(role.description)}`, 'model: inherit', 'mainAgent: false', 'subagent: true', 'inheritCustomizations: true', 'tools:', ...tools.map((tool) => `  - ${tool}`)];
  return { file: `${name}.md`, content: `---\n${front.join('\n')}\n---\n\n${nameSkills(role.body, naming)}\n` };
}
