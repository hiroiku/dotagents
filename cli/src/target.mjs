// 入れる先と、選べるものの定義。この道具が書く名前と場所は、ここの 1 か所にだけ持つ。
// plugin 側の定義(manifest、marketplace、styles/)と食い違わないことは、test/cli.test.mjs が守る。

export const TARGET = {
  plugin: 'dotagents',
  marketplace: 'dotagents',
  repo: 'hiroiku/dotagents',
};
export const PLUGIN_ID = `${TARGET.plugin}@${TARGET.marketplace}`;

export const HOSTS = ['claude', 'codex'];
export const HOST_NAMES = { claude: 'Claude Code', codex: 'Codex' };
// スタイルの軸ごとに選べる名前(plugin/styles/<軸>/<名前>.md)。
export const STYLES = { git: ['trunk', 'release-branches'], architecture: ['layered'] };
export const AXIS_NAMES = { git: 'git のスタイル', architecture: 'アーキテクチャのスタイル' };
// チェックの段階。
export const STAGES = ['edit', 'commit', 'push', 'release'];
export const SCOPES = ['project', 'user'];

export const DECLARATION = '.agents/dotagents.json';
export const CLAUDE_SETTINGS = '.claude/settings.json';
export const CODEX_CONFIG = '.codex/config.toml';
