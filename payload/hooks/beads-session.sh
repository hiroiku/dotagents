#!/bin/bash
# SessionStart hook。注入するのは次の 4 つ(いずれも検出・観測であり、ガードではない):
#   1. このセッション用の一意な BEADS_ACTOR 候補(常に)
#   2. ハーネス自身の乖離(agents-doctor。乖離があるときだけ — 正常時は 0 トークン)
#   3. bd の in_progress 残置(bd のあるプロジェクトのみ)
#   4. 収束の計器: open の stock と当日 inflow(.beads のあるプロジェクトのみ。
#      判断は期間ではなくこの注入を見た瞬間に行う — 記録は機械、判断はイベント駆動)

input=$(cat)
sid=$(printf '%s' "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
[ -n "$sid" ] || exit 0

echo "BEADS_ACTOR: このセッションの bd への全書き込みには BEADS_ACTOR=mgr-${sid:0:8} を用いる(例: BEADS_ACTOR=mgr-${sid:0:8} bd update <id> --claim)。"

hookdir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
[ -x "$hookdir/../bin/agents-doctor" ] && "$hookdir/../bin/agents-doctor" 2>/dev/null

# 器官の不在検出: bd は必須(台帳プロセスの土台)、codegraph は推奨(探索の導出)。
# ハーネスは導入を代行しない — 不在の事実と導入先だけを伝える。
if command -v codegraph >/dev/null 2>&1; then
  [ -d .codegraph ] && echo "codegraph: このプロジェクトは index 済み。コードの構造の問い(所在・呼び出し経路・影響範囲・同型)は grep/Read の往復ではなく codegraph の explore で導出する。"
else
  echo "codegraph が見つからない(推奨の器官: grep/Read の往復を 1 回の explore に置換する)。導入はユーザーの判断 — https://github.com/colbymchenry/codegraph(codegraph install → プロジェクトで codegraph init)。"
fi

if ! command -v bd >/dev/null 2>&1; then
  echo "bd(beads)が見つからない(必須の器官: 起票・claim・完了ゲート・merge 排他の台帳がこの上に建つ)。導入はユーザーの判断 — https://github.com/gastownhall/beads(brew install beads ほか)。台帳を欠いたまま起票プロセスを進めない。"
  exit 0
fi
if [ ! -d .beads ]; then
  echo "bd: このプロジェクトの台帳は未 init。台帳プロセスに乗せる作業なら bd init から始める。"
  exit 0
fi

inprog=$(bd list --status in_progress 2>/dev/null) || exit 0
count=$(printf '%s\n' "$inprog" | grep -c '^[◐○●]' 2>/dev/null)
if [ "${count:-0}" -gt 0 ]; then
  echo ""
  echo "bd 残置: このプロジェクトに in_progress の issue が ${count} 件ある。自分が占有していないものは着手前にユーザーへ処分を確認する。"
  printf '%s\n' "$inprog" | grep '^[◐○●]' | head -10
fi

# 計器の記録は dotagents の領分(.agents)に置く — bd の領分(.beads)には書かない。
# 記録するのはプロジェクトレベルの install がある場所だけ(ユーザーレベルの root に
# 各プロジェクトの計器を混ぜない)。
root=$(cd "$hookdir/.." && pwd)
kind=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('kind',''))" "$root/.dotagents.json" 2>/dev/null)
[ "$kind" = "project" ] || exit 0

{ bd list --status open --json 2>/dev/null; echo '@@'; bd list --status in_progress --json 2>/dev/null; } | python3 -c '
import json, sys, datetime, os

raw = sys.stdin.read().split("@@")
try:
    opens = json.loads(raw[0] or "[]")
    inprogs = json.loads(raw[1] or "[]") if len(raw) > 1 else []
except Exception:
    raise SystemExit
today = datetime.date.today().isoformat()
created = lambda i: (i.get("created") or i.get("created_at") or "")[:10]
rec = {
    "date": today,
    "open": len(opens),
    "in_progress": len(inprogs),
    "inflow_open": sum(1 for i in opens + inprogs if created(i) == today),
}
path = os.path.join(sys.argv[1], "dotagents-metrics.jsonl")
hist = []
try:
    with open(path) as f:
        hist = [json.loads(l) for l in f if l.strip()]
except FileNotFoundError:
    pass
if not hist or hist[-1]["date"] != today:
    with open(path, "a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    hist.append(rec)
prev = hist[-2] if len(hist) >= 2 else None
if prev:
    prev_date, diff = prev["date"], rec["open"] - prev["open"]
    delta = f"(前回 {prev_date} 比 {diff:+d})"
else:
    delta = "(初回記録)"
n_open, n_inprog, n_inflow = rec["open"], rec["in_progress"], rec["inflow_open"]
print()
print(f"bd 計器: open {n_open} {delta} / in_progress {n_inprog} / 本日起票の未消化 {n_inflow} 件。"
      f"open が増え続けているなら収束規則が敗けている — 観測した時点で対処を判断する。")
' "$root" 2>/dev/null
exit 0
