# エージェントセッションのシェルが起動時に読むファイル。
# bash は BASH_ENV 経由、zsh は ~/.zshenv の管理行(bin/agents-setup が管理)経由で source される。
# bd をシェル関数として定義し、enforcement ラッパー(bin/bd)へ委譲する。
# 関数はシェルの PATH 解決に常に優先するため、後続の rc ファイルやシェルスナップショットの
# PATH 操作(前置・絶対代入)に影響されない — PATH 上の順序を争わない。
# 外部コマンドに依存しない(制限された PATH の下でも安全に動く)。それ以外のことはしない。

if [ -n "${BASH_SOURCE:-}" ]; then
  _agents_src="${BASH_SOURCE[0]}"
elif [ -n "${ZSH_VERSION:-}" ]; then
  # zsh は FUNCTION_ARGZERO(既定で有効)により source 中の $0 が sourced ファイル名になる
  _agents_src="$0"
else
  _agents_src=""
fi

case "$_agents_src" in
  */hooks/*)
    _agents_wrapper="${_agents_src%/hooks/*}/bin/bd"
    if [ -x "$_agents_wrapper" ]; then
      eval "bd() { \"$_agents_wrapper\" \"\$@\"; }"
    fi
    ;;
esac
unset _agents_src _agents_wrapper
