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
