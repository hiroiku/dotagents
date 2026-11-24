---
roles: lead
integration: develop
shared: ["develop", "master"]
pulls: ["develop -> master"]
---

# git の流れ(develop-master)

開発は `develop` に統合し、`master` へは `develop` から上げる。

- 作業ブランチは `develop` から切り、取り込む前に最新の `develop` へ rebase する。PR の base は `develop` にする。
- `master` へは、`develop` から `master` への PR で上げる。作業ブランチから `master` へは PR を出さない。
- 版の tag は、上げたあとの `master` のコミットに付ける。
- 共有のブランチは `develop` と `master` である。
