---
name: beads
description: bd の起票と監査ログに、そのセッションを指す actor を刻む。
requires: bd
---

エージェントが立てた issue の `created_by` と `.beads/interactions.jsonl` に、セッションを一意に指す
actor が入る。issue の 1 行からそのセッションの記録へ辿れる。

設定の詳細は [README.md](README.md) にある。
