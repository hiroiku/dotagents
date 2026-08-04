# dotagents

AI エージェントハーネス(Claude Code / Codex 共用)の正本リポジトリ。
プロンプト・スキル・enforcement をここで版管理し、[bin/agents-setup](./bin/agents-setup) で各環境へ配布する。

## コンセプト

このハーネスが作るのは「1 つの有能なエージェント」ではなく、**限られた注意(コンテキスト)を役割で分割し、外部記録で接続した組織**である。個々の規則はすべて 1 つの前提から導かれる — context は有限で、セッションと共に消える。

### 規則の三層 — 遍在則・瞬間則・強制則

規則は内容より先に、**配達のされ方**で性質が決まる。

- **遍在則**(コア = AGENTS.md)— 常時注入。全セッションの注意を常に消費し、守られるかは注意の配分に依存する**ベストエフォート**である。だからここに置けるのは、観測の瞬間を選ばない少数の規則だけ
- **瞬間則**(スキル)— just-in-time 注入。その瞬間が来たときだけ context に入るので、詳細に書いても他の瞬間の注意を奪わない
- **強制則**(enforcement = hooks / bin / permissions)— 注入されない。仕組みが判定するので注意を消費せず、破られない(または破れば痕跡が残る)

**落下則**: 規則は可能な限り下の層へ落とす。下へ行くほど保証が強くなり、同時に注意コストが消える — 強度と費用が同時に改善する一方通行の坂である。プロンプトとは「まだ仕組みに落とせていない規則の待機場所」に過ぎない。

### 分離 — 重複を作らない境界

サブエージェントは能力ではなく**重複が起きない境界**で切る: 判断材料(context)・探索範囲・書き込み先(worktree)が交差しない単位。同じ情報を 2 つの context に持たせれば注意を二重に払い、同じ場所を 2 つが書けば合流点が生まれる。構造で消せない合流点(統合ブランチと台帳)だけを、排他で守る。

分離は隠蔽でもある。実装の事情を知らないことがレビューの検出力であり、**「渡さない」は「渡す」と同じ強さの設計判断**である。

### 器官 — 宣言と導出を分ける

道具は「答えられる問い」を 1 種類ずつ持つ器官として使い分け、器官のネイティブ機能を他で再実装しない。分類の軸は**宣言か導出か**:

- **宣言の記録**(決めたことは導出できないから、記録する): bd = 意思と状態の台帳(何をやると決めたか・誰が何を・なぜ止まっているか)、ADR = 判断の経緯、用語の正本 = ユビキタス言語
- **導出**(実物から機械が導けるものは、手で記録しない): codegraph = コードの現在の構造(シンボル・呼び出し経路・影響範囲)、git = 変更の履歴

導出できるものを手で書いた瞬間から乖離が始まる。記憶も同じ軸の上にある: 状態は導出(bd prime のクエリ注入)、不変事項だけが宣言(bd remember)。セッション間で文脈を運ぶのは会話の転写ではなく、住所を持つ外部記録である(**コンテキストブリッジ**)。

codegraph は普段の探索で常用する器官であり、その遍在則(まず explore で導出する)は**ツール説明(MCP サーバー指示)が配達する** — プロンプトに書き写さない(codegraph 側の更新に置いていかれる写しになる)。ツール選択は機械判定できないので強制則にも落とせない — 注入コストゼロのツール層が、この規則の最下層である。ハーネスのプロンプトが明文化するのは、使わないことが契約違反になる義務の瞬間(凍結前の土地勘・横展開スイープの導出・reviewer の走査)だけ。配線(`codegraph install`)と index(`codegraph init`)は codegraph 自身の責務で、ハーネスは検査も再実装もしない — SessionStart が `.codegraph/` の存在を検出して想起の 1 行を注入するのみ。

### 敵対的レビュー — 欠落は探さないと存在しない

AI エージェント特有の失敗は「終わっていないのに完了しました」であり、その正体は嘘ではなく**欠落**である — 書いた物しか context に無い者には、書かなかった物が見えない。

だからレビューは検品(できた物を眺めて良し悪しを言う)ではなく **存在証明** にする: 要件を起点に「それを満たす実装と検証が実物に存在するか」を探させる、逆方向の走査。レビュアーに差分を先に見せないのは、注意が「書かれた物」の検証に占有されると「書かれなかった物」の探索が消えるからである。

### 沈降 — 知識を沈めるからループが終わる

レビューを繰り返すだけでは発散する(指摘は無限に湧く)。ループが収束するのは、ラウンドごとに知識が層を**沈降**するからである: 個別の指摘 → 欠陥クラス(壊れた契約)としての言語化 → 強制則(構造・型・ガード 1 本)へ。沈んだ仮説は憲章から取り除かれ、レビューの燃料は回を追って減る。同じ欠陥クラスが二度浮上したら、直し方ではなく**沈め方**が間違っている合図である。

issue の台帳も同じ原理で収束させる: 観測を open に積み上げるのではなく、決めた事だけを open にし、同型は畳み、起票時に消化の経路を与える。

### テスト — 件数は守りの量ではない

テストが固定してよいのは**契約**(業務にとっての約束)だけであり、症状の写しは退行から何も守らない。第一の防御は壊せない構造(発生条件を持てない設計・型)であり、テストは構造で封じられない契約のための最後の手段である。

### 見張りと列挙 — メタな品質チェックを作らない

監視の監視・テストのテスト・ガードのガードのような、業務の契約を守らないメタな検査は増殖しやすく、何も守らないまま維持費だけを食う。3 つの原則で排除する:

- **見張りは足さず、沈める** — ガードを見張りたくなるのは層が高すぎる徴候である。応答は監視の追加ではなく落下則の適用: 下げれば見張る対象そのものが消える
- **検出は一段まで** — 構造で閉じられない契約だけが検出型を持てる。検出の検出は作らない。検出器が壊れたら気づけないことはこの設計の対価であり、だから検出器は最小・単純に保つ
- **列挙で守らない** — 守備範囲・修正対象・監視対象が人の列挙で決まる仕組みは、足し忘れが静かな空白になる漏れの温床。構造そのものが定義になる形(payload 方式)か、列挙を機械が副産物として導出する形(manifest 方式)に寄せる

規則の本文はここに書かない(payload と二重管理になり、複製は黙って古くなる)。正本の索引:
役割・品質評価・Git 権限・Beads の遍在規則は [AGENTS.md](./payload/AGENTS.md)、
着手前と組成は [agents-kickoff](./payload/skills/agents-kickoff/SKILL.md)、
品質ループの運転は [agents-quality-loop](./payload/skills/agents-quality-loop/SKILL.md)、
bd 運用と記憶の線引きは [agents-beads-ops](./payload/skills/agents-beads-ops/SKILL.md)、
テスト設計は [agents-test-design](./payload/skills/agents-test-design/SKILL.md)、
三層配置とアブレーションの規律は [prompt-guidelines.md](./payload/docs/prompt-guidelines.md)。

### 検討中(未実装・未決)

- kuden-os の既存 open の一括トリアージ(`AGENTS_BD_OPEN_OK=1` の包括承認つき、kuden-os のセッションで実施)
- ~~ユーザーレベル install の実施~~ → 運用モデル決定: **プロンプトはプロジェクトごと(`--project`)、ユーザーレベルは shell スコープ(ガード)だけ**。フルのユーザーレベル install は CLI としては提供する(対象を既定値で決めない以上、対等に選べる必要がある)が、運用では使わない
- ~~`permissions.ask` の merge 断片の撤去~~ → 実施(2026-08-01): ガードの稼働確認(テスト・Codex 実発火)をもって撤去。update が旧断片を自動で刈り込む
- 造語の見直しと AGENTS.md `<beads>` のさらなるスリム化 — 移行後、計器の観測が付いてから
- ~~Codex の強制則配達~~ → 実測で解決(2026-08-01): Codex の実行シェルは zsh で、shell スコープの zshenv 配達がそのまま届く。マーカーは `CODEX_SANDBOX=seatbelt` が Codex 自身により設定され、git-guard が発火することを確認。残る未確認は sandbox 無効時のマーカー有無のみ
- ~~dotagents 自体の bd 台帳を init するか~~ → 決定: 持たない。器官は各プロジェクトの中で独立して運用され、dotagents は自分のリポジトリも特別扱いしない(必要になったら他のプロジェクトと同じ資格で init する)
- ~~npm publish 時の `payload/.gitignore` 同梱対策~~ → 解決: payload では無印 `gitignore` で持ち、installer が配布時に `.gitignore` へ写像する(npm が剥ぎ取れない名前で運ぶ)

## 構成

```
bin/agents-setup      インストーラー CLI(install / update / uninstall / status)
test/                 installer と強制則の契約テスト(npm test)
payload/              配布物の唯一の定義。この木がそのまま .agents/ になる
├── AGENTS.md         遍在則(全セッションが常時読む)
├── skills/           瞬間則(その瞬間が来たときだけ読む)
├── agents/           役割定義(reviewer / verifier。ツール制限つき)
├── hooks/            shellenv.sh(ガードのシェル配達)/ beads-session.sh(SessionStart 注入)
├── bin/              強制則(bd / git-guard)と自己検査(agents-doctor)
└── docs/             プロンプト更新のガイドライン
```

[payload/](./payload/) が配布物の正であり、installer 側に配布物の列挙は存在しない
(列挙の複製は黙って古くなるため。[package.json](./package.json) の `files` は `bin` と `payload` の 2 項のみ)。

## インストール

動詞は三層に分かれる: **clone(取得・初回)/ pull(追従・繰り返し)/ install・update(配備)**。
これは消費するライブラリではなく運転しながら編集する規則集なので、正本は常に自分の編集可能な
git リポジトリであり、npx のキャッシュや tarball 展開(使い捨てコピー)から黙って配備する経路は無い —
正本の外で配備系コマンドを叩くと、既知の正本へ委譲するか clone への案内で止まる。

```sh
# 取得(初回): 正本を自分の編集可能な git リポジトリとして手元に置く
npx dotagents clone ~/dotagents

# 追従(繰り返し): 上流の差分をコミットタイトルで確認してから取り込み、テストで検証する
~/dotagents/bin/agents-setup pull

# 配備の再同期は push しない: 正本が進むと各セッション入口の計器(agents-doctor)が
# 「配備が正本より古い」を注入するので、そのプロジェクトで update すればよい
```

追従は自動化しない設計である。取り込むのは自分のエージェントの挙動を支配する規則文なので、
pull は必ず差分(コミットタイトル = ドメイン言語の changelog)を提示してから統合し、
取り込み後に正本自身のテストを通す。ローカルの個人化はコミットとして積み、rebase で上流に載せ替える。

前提の器官(ハーネスは導入を代行せず、installer と SessionStart が不在を検出して伝える):

- **bd(beads)— 必須**。台帳プロセス(起票・claim・完了ゲート・merge 排他)がこの上に建つ — [gastownhall/beads](https://github.com/gastownhall/beads)
- **codegraph — 推奨**。探索の導出 — [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph)(配線は `codegraph install`、index はプロジェクトごとに `codegraph init`)

```sh
# 対象を聞く(ターミナルなら対話。ユーザーレベルか、カレントディレクトリか)
bin/agents-setup install

# プロジェクトレベル(<dir>/.agents。リンクは相対。dir の省略はカレントディレクトリ)
bin/agents-setup install project /path/to/project

# ユーザーレベル(~/.agents)
bin/agents-setup install user

# シェル層のみ(強制則 hooks / bin + zshenv 行。プロンプト・リンク・settings 断片なし)
bin/agents-setup install shell
```

**対象は位置引数 1 つ**(`user` / `project [dir]` / `shell`)で、既定値では決まらない。
明示するか対話で選ぶかのどちらかであり、非対話(CI・パイプ)で省略すれば何も書かずに止まる —
指定し忘れが黙って別の場所を書き換える経路を作らないため。

位置は 1 つしか無いので「`user` と `project` の同時指定」は**書こうとしても書けない**。
排他を実行時の検証で弾くのではなく、構文が保証する形に寄せてある(`--force` / `--keep-shell`
は対象ではなく動作の修飾なので、フラグのまま)。

対話は矢印キーで選ぶセレクター(`↑/↓` 移動・`enter` 決定・`ctrl-c` 中止)で、決めた後は
選んだ結果の 1 行だけが残る。CLI の表示は英語・色つきで、`NO_COLOR` と非 TTY では
自動的に色を落とす。ヘルプは `--help` / `-h` で、コマンドごとにも引ける:

```sh
bin/agents-setup --help              # 全体(コマンド一覧・対象・オプション)
bin/agents-setup install --help      # そのコマンドの説明・対象・オプション・例(-h も可)
bin/agents-setup --version           # 版
```

installer が行うこと(すべて冪等):

- `payload/` → `.agents/` のコピー(manifest `.dotagents.json` に内容ハッシュを記録)
- symlink: `.claude/CLAUDE.md → .agents/AGENTS.md`。スキル(`.claude/skills/<name>`)と
  エージェント定義(`.claude/agents/<name>.md`)は**常に単体リンク**で、自前の実体と同居する
  (ディレクトリごとのリンクは張らない)。Codex は `.codex/` が存在する環境にのみ同形で張る
- `~/.zshenv` にガード付き管理行を追加(ユーザーレベルのみ。ファイルが無ければ何も起きない形):
  `[ -f "$HOME/.agents/hooks/shellenv.sh" ] && . "$HOME/.agents/hooks/shellenv.sh" # agents-harness`
- `settings.json` 断片: `env.BASH_ENV`、`hooks.SessionStart`、`permissions.ask`(push のみ —
  merge は `AGENTS_MERGE_SLOT_OK` ガードが覆うため持たない)。
  Codex には `.codex/hooks.json` に同形の SessionStart 断片(`.codex` がある環境のみ)
- マシン固有の生成物(manifest `.dotagents.json`・計器 `dotagents-metrics.jsonl`)は、
  配布物に含まれる `.agents/.gitignore` が自動で版管理から外す。生成物も ignore も
  すべて dotagents の領分(`.agents/`)で完結する — bd は `.beads/`、codegraph は
  `.codegraph/`、dotagents は `.agents/` にしか書かない

### シェル層 — 1 つしかない共有資源

ガード(git-guard / bd ラッパー)がセッションに届く経路は `hooks/shellenv.sh` だけであり、
zsh の起動ファイルがユーザーグローバル(`~/.zshenv`)にしか無いため、**この層はプロジェクトの
数によらず 1 つしか存在しない**(`settings.json` の `env.BASH_ENV` は bash 専用で、
エージェントのツールシェルが zsh の環境には届かない)。共有資源なので、順序と回数を運用知識に
させず installer が両側から面倒を見る:

- `install project` は、シェル層が無ければユーザーレベルへ最小形(shell スコープ)で**補う**。
  既にユーザーレベルが full なら縮小せず、欠けた配達行だけを直す
- `uninstall user` は、消す前に**ガードを残すか確認する**(`--keep-shell` で非対話でも残せる)。
  残す場合はプロンプト層だけを外し、シェル層を最小形で敷き直す
- `uninstall project` はシェル層に触れない(他のプロジェクトが共有しているため)

### 後からの導入・チーム展開

- **導入の順序に依存しない**: bd / codegraph を後から入れても installer の再実行は不要 —
  器官・台帳・index の検出は毎セッション動的に行われる。bd だけの既存環境へ後から
  ハーネスを入れる場合も同じ。`bd init` が生成した既存の root AGENTS.md は奪わず、
  参照ブロックだけを管理する(bd 公式の「気軽に起票する」文化とハーネスの起票反転は
  思想が異なるため、重複する記述は導入時に読み比べて整理するとよい — ハーネスは検出しない)
- **届き方は二層**: プロンプト層(`.agents/` 配布物・リンク・参照ブロック)は版管理に乗り、
  **clone だけで効く**。注入と強制則(manifest・settings 断片・zshenv 行・シェルガード)は
  マシン固有で、**各マシンで installer が敷く**
- **2 人目以降の手順**: プロジェクトを clone → dotagents を clone →
  `bin/agents-setup install project <プロジェクト>` の 1 本。シェル層はこのとき
  無ければ補完されるので、順序も回数も覚えなくてよい。installer は冪等でハッシュ照合する
  ため、版管理で届いた配布物と衝突しない

## 更新・照合・アンインストール

```sh
bin/agents-setup update    project   # payload の変更を反映し、payload から消えた配布物を刈り込む
bin/agents-setup status    project   # manifest・payload・実体・リンク・断片を照合(乖離時 exit 1)
bin/agents-setup uninstall project   # 自分が置いたものだけを除去する
```

対象の指定は install と同じ規則(`user` / `project [dir]` / `shell`、省略時は対話)で、
4 コマンドとも共通。

所有権の原則: installer が触れるのは「自分が置き、内容ハッシュが一致するもの」だけ。

- `.agents/skills/` 内の自前スキル(manifest に無い entry)には一切触れない
- インストール先で改変されたファイルは残して警告する(`--force` で上書き)
- settings.json は「自分が追加した断片」だけを manifest に覚え、それだけを除去する

## プロンプトの更新

`payload/docs/prompt-guidelines.md` に従う。編集は必ずこのリポジトリで行い、
各環境へは `agents-setup update` で配る(インストール先を直接編集すると update が保護して
警告するようになる — それが乖離の検出である)。
