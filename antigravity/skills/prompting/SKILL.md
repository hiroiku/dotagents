---
name: prompting
description: プロンプト、指示ファイル、エージェントの定義、スキルを書くとき、修正するときに読む。
---

# 指示ファイルの書き方

書く前に、次のガイドラインを読む。

- [2025/09/29: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [2026/07/24: The new rules of context engineering for Claude 5 generation models](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models)
- [2026/08/14: Maximizing the value of your Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions)

## 記述場所

指示は、どこからコンテキストに入るかを先に決めてから書く。同じことを 2 か所に書くと、片方だけが更新されて食い違う。上から順に当てはめ、最初に当てはまった 1 か所にだけ置く。

1. 仕組みで検出できる決まりは、文に書かずに、hook、型、lint、テストにする。
2. エージェントが毎回要る作業の手順(環境の準備、ファイルからは読み取れない道具の使い方、作業の進め方、レビューで見ないもの)だけを、常時読み込まれる指示ファイル(プロジェクトの AGENTS.md)に置く。
3. 特定のサブエージェントにだけ要ることは、そのサブエージェントの定義に置く。
4. 利用者が頼んだ場面でだけ要る手順は、スキルに置く。
5. 技術の選定、構成(部品、境界、配置、インフラ)、不変条件は、理由と見直す条件を添えて `ARCHITECTURE.md` に、詳しい仕様は docs に置き、AGENTS.md からリンクする。

ファイルを見れば分かること(コマンド、設定の値、フレームワークの一般的な知識)は、どこにも書かない。

## 記述の方針

- 手順ではなく、目的、判断の基準、理由を書く。理由があれば、書いていない場面でも同じ方針で判断できる。
- 例を 1 つだけ挙げると、そのまま真似される。挙げるなら、形の違うものを複数挙げるか、基準を言葉で書く。
- 「必ず」のような強い言葉に頼らない。守られなかった指示は、言い直して追加する前に、置き場所が合っているかを疑う。
- 追加する前に、削れるものを探す。常時読み込まれる文は、追加するたびに、ほかの文が読まれる度合いを下げる。
