---
name: prompting
description: プロンプト、指示ファイル、エージェントの定義、スキルを書くとき、直すときに読む。
---

# 指示を書く

書く前に、次のガイドラインを読む。

- [2025/09/29: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [2026/07/24: The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models)
- [2026/08/14: Maximizing the value of your Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions)

## 入り口を決める

指示は、どこから文脈に入るかを先に決めてから書く。同じことを 2 つの入り口に書くと、片方だけが直されて食い違う。上から順に当てはめ、最初に当てはまった 1 か所にだけ置く。

1. 仕組みで落とせる決まりは、文に書かずに、hook、型、lint、テストにする。
2. どのエージェントにも常に要ることだけを、常設の共通ルールに置く。共通ルールには文字数の上限があり、テストが守っている。
3. 特定のサブエージェントにだけ要ることは、そのサブエージェントの定義に置く。オーケストレーターにだけ要ることは、オーケストレーターの文に置く。
4. プロジェクトが選ぶスタイル(git の流れ、設計の形)によって違うことは、そのスタイルの部品に置く。
5. 利用者が頼んだ場面でだけ要る手順は、スキルに置く。
6. プロジェクトの作り(部品、境界、インフラ)は `ARCHITECTURE.md` に、ほかのプロジェクトによって違う事実は、プロジェクトの AGENTS.md と `dotagents.json` に置く。

ファイルを見れば分かること(コマンド、設定の値、フレームワークの一般的な知識)は、どこにも書かない。

## 書き方

- 方法ではなく、目的、判断の基準、理由を書く。理由があると、書いていない場面でも同じ向きに判断できる。
- 例は、1 つだと写される。挙げるなら、形の違うものを複数挙げるか、基準を言葉で書く。
- 「必ず」のような強い言葉に頼らない。守られなかった指示は、言い直して足す前に、入り口が合っているかを疑う。
- 足す前に消す。常設の文は、足すたびに、ほかの文が読まれる度合いを下げる。
