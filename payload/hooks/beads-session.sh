#!/bin/bash
# SessionStart hook: このセッション用の一意な BEADS_ACTOR 候補を常に注入し、
# bd と db があるプロジェクトでは前セッションからの in_progress 残置も併せて注入する。

input=$(cat)
sid=$(printf '%s' "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
[ -n "$sid" ] || exit 0

echo "BEADS_ACTOR: このセッションの bd への全書き込みには BEADS_ACTOR=mgr-${sid:0:8} を用いる(例: BEADS_ACTOR=mgr-${sid:0:8} bd update <id> --claim)。"

command -v bd >/dev/null 2>&1 || exit 0
inprog=$(bd list --status in_progress 2>/dev/null) || exit 0
count=$(printf '%s\n' "$inprog" | grep -c '^[◐○●]' 2>/dev/null)
if [ "${count:-0}" -gt 0 ]; then
  echo ""
  echo "bd 残置: このプロジェクトに in_progress の issue が ${count} 件ある。自分が占有していないものは着手前にユーザーへ処分を確認する。"
  printf '%s\n' "$inprog" | grep '^[◐○●]' | head -10
fi
exit 0
