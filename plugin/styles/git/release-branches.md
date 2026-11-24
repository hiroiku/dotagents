---
roles: lead
shared: ["release/*"]
---

# git の流れ(release-branches)

開発は trunk と同じく、既定のブランチ 1 本に統合する。違うのは版の切り方で、版の系列ごとに release ブランチを切る。

- 作業ブランチは既定のブランチから切り、取り込む前に最新の既定のブランチへ rebase する。PR の base は既定のブランチにする。
- 版の系列ごとに、既定のブランチから `release/` で始まるブランチを切る。名前の形はプロジェクトの決まりに従う。版の tag は、その release ブランチのコミットに付ける。
- 出した版の直しは、先に既定のブランチに入れ、release ブランチへ `git cherry-pick -x` で移す。release ブランチに直接作ると、次の系列に同じ不具合が残る。移すのは、release ブランチへの push か、base を release ブランチにした PR で行う。
- 共有のブランチは、既定のブランチと `release/` で始まるブランチである。古い release ブランチは、次の系列が出て、tag があることを確かめてから消す。
