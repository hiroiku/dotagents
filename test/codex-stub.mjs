// テストから本物の Codex CLI を呼ばないよう、PATH の先頭に codex の代役を置く。
// 代役は受けた引数を $CODEX_HOME/stub.log に残し、plugin の追加と削除を Codex と同じ置き場で真似る。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STUB = `#!/bin/sh
h="\${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$h"
echo "$*" >> "$h/stub.log"
case "$1 $2 $3" in
  "plugin marketplace add") echo "$4" > "$h/stub-marketplace" ;;
  "plugin marketplace remove") rm -f "$h/stub-marketplace" ;;
esac
case "$1 $2" in
  "plugin add")
    root=$(cat "$h/stub-marketplace" 2>/dev/null) || exit 1
    name=\${3%@*}; market=\${3#*@}
    src="$root/plugins/$name"
    version=$(sed -n 's/.*"version": *"\\([^"]*\\)".*/\\1/p' "$src/.codex-plugin/plugin.json")
    rm -rf "$h/plugins/cache/$market/$name"
    mkdir -p "$h/plugins/cache/$market/$name"
    cp -R "$src" "$h/plugins/cache/$market/$name/$version" ;;
  "plugin remove") rm -rf "$h/plugins/cache/\${3#*@}" ;;
esac
exit 0
`;

export function installCodexStub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotagents-codex-stub-'));
  fs.writeFileSync(path.join(dir, 'codex'), STUB, { mode: 0o755 });
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  delete process.env.CODEX_HOME;
  return dir;
}

export const codexLog = (home) => {
  try { return fs.readFileSync(path.join(home, '.codex', 'stub.log'), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; }
};

// codex の無いマシンを真似るときの PATH。代役も本物も見えない。
export const pathWithoutCodex = () => process.env.PATH.split(path.delimiter)
  .filter((dir) => !fs.existsSync(path.join(dir, 'codex'))).join(path.delimiter);
