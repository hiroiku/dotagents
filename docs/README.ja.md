# dotagents

AI エージェントハーネス(Claude Code と Codex の共用)の正本。
プロンプト・スキル・enforcement をここで版管理し、
[bin/agents-setup](../bin/agents-setup) で各環境へ配備する。

[English](../README.md) | 日本語 | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

## クイックスタート

前提: git、Node.js ≥ 18、そしてハーネスが乗る器官 —
**[bd (beads)](https://github.com/gastownhall/beads) は必須**
(起票・claim・完了ゲート・merge 排他がこの上に建つ issue の台帳)、
**[codegraph](https://github.com/colbymchenry/codegraph) は推奨**
(構造への問い合わせ。配線は `codegraph install`、
index はプロジェクトごとに `codegraph init`)。ハーネスは導入を代行しない —
installer と毎回の SessionStart が不在を検出して伝える。

```sh
# 取得(初回): 正本は自分が所有し編集する git リポジトリとして手元に届く
npx @hiroiku/dotagents clone ~/dotagents

# 配備: 対象を明示するか、省略して対話で選ぶ
~/dotagents/bin/agents-setup install project /path/to/project   # プロジェクト単体(<dir>/.agents)
~/dotagents/bin/agents-setup install user                       # ユーザーレベル(~/.agents)
~/dotagents/bin/agents-setup install shell                      # ガードのみ(hooks/bin + ~/.zshenv の 1 行)

# 追従(繰り返し): 上流のコミットタイトルを見せ、rebase し、テストを走らせる
~/dotagents/bin/agents-setup pull

# 保守
~/dotagents/bin/agents-setup update  project   # 正本の変更を反映し、payload から消えた物を刈り込む
~/dotagents/bin/agents-setup status  project   # manifest・payload・実体・リンク・断片を検査する
~/dotagents/bin/agents-setup --help            # コマンド・対象・オプション・例
```

動詞は三層に分かれる: **clone(取得・初回)/ pull(追従・繰り返し)/
install・update(配備)**。これは消費するライブラリではなく運転しながら編集する
規則集なので、正本は常に自分が編集できる git リポジトリである。npx のキャッシュや
展開した tarball から黙って配備する経路は無い — 正本の外では、配備系コマンドは
マシンが既に知っている正本へ委譲するか、`clone` への案内を出して止まる。

配備の再同期は push しない: 正本が先に進むと、各セッション入口の計器
(agents-doctor)が「配備が正本より古い」と報告するので、そのプロジェクトで
`update` を実行する。

追従はわざと自動化していない。取り込むのは自分のエージェントの挙動を支配する
規則文なので、`pull` は必ず入ってくる差分を先に見せ(コミットタイトルはドメイン
言語で書かれ、changelog として読める)、rebase で統合してから、正本自身の
テストを走らせる。自分の個人化はコミットとして積み、上流の上に乗る。

**対象は位置引数 1 つ**(`user` / `project [dir]` / `shell`)で、既定値では
決まらない。明示するか対話で選ぶかのどちらかであり、非対話(CI・パイプ)で
省略すれば何も書かずに止まる — 指定し忘れが黙って別の場所を書き換える経路は
無い。位置が 1 つしか無いので「user と project の同時指定」はそもそも
書けない — 排他は実行時の検証ではなく構文が保証する。

対話プロンプトは矢印キーのセレクター(`↑/↓` 移動・`enter` 決定・`ctrl-c` 中止)で、
決めた後は選んだ結果を示す 1 行だけが残る。出力は色つきで、`NO_COLOR` か
非 TTY では自動的に色を落とす。

## installer が行うこと(すべて冪等)

- `payload/` → `.agents/` のコピー(内容ハッシュを manifest `.dotagents.json`
  に記録)
- symlink: `.claude/CLAUDE.md → .agents/AGENTS.md`。スキル
  (`.claude/skills/<name>`)とエージェント定義(`.claude/agents/<name>.md`)は
  **常に 1 件ずつリンク**し、自分で書いたエントリと同居させる(ディレクトリ
  単位のリンクは張らない)。Codex は `.codex/` が存在する環境にのみ同じ形で
  張る
- `~/.zshenv` にガード付きの管理行を 1 行追加(ユーザーレベルのみ。source 先の
  ファイルが無ければ何もしない)
- `settings.json` 断片: `env.BASH_ENV`、`hooks.SessionStart`、
  `permissions.ask`(push のみ — merge は `AGENTS_MERGE_SLOT_OK` ガードが
  受け持つ)。Codex には `.codex/` がある環境にのみ、`.codex/hooks.json` に
  同じ SessionStart 断片が入る
- マシン固有の生成物(manifest・計器のメトリクスファイル)は、payload に
  同梱される `.agents/.gitignore` が版管理から外す。dotagents が生成する物は
  すべて自分の領分(`.agents/`)の中にとどまる — bd が書くのは `.beads/`
  だけ、codegraph は `.codegraph/` だけ

所有権の原則: installer が触れるのは、自分が置いて今もハッシュが一致する
物だけである。自分で書いたスキルには一切触れず、配備先で改変したファイルは
残して警告し(`--force` で上書き)、除去されるのも自分が追加した settings
断片だけである。

### シェル層 — 1 つしかない共有資源

ガード(git-guard、bd ラッパー)がセッションに届く経路は `hooks/shellenv.sh`
だけであり、zsh にはプロジェクトごとの起動ファイルが無いため、この層は
ハーネスを使うプロジェクトの数によらず**マシンあたり 1 つ**しか存在しない。
installer は両側から面倒を見るので、順序が運用知識になることはない:
`install project` はシェル層が無ければ最小の shell スコープを補い、
`uninstall user` は他のプロジェクトが共有している物を取り上げる前に確認し
(`--keep-shell` で非対話でも残せる)、`uninstall project` はシェル層に
一切触れない。

### 後からの導入とチーム展開

- **導入の順序に依存しない**: bd や codegraph を後から入れても再配備は
  要らない — 器官・台帳・index の検出は毎セッションの開始時に動的に行われる。
  `bd init` が作った既存の root AGENTS.md は奪わず、管理下の参照ブロックだけを
  足す
- **届き方は二層**: プロンプト層(`.agents/` の payload・リンク・参照
  ブロック)は版管理に乗り、**clone するだけで効く**。注入と強制則の層
  (manifest・settings 断片・zshenv 行・シェルガード)はマシン固有で、
  **各マシンで installer が敷く**
- **2 人目以降**: プロジェクトを clone、dotagents を clone、
  `bin/agents-setup install project <project>` を叩く — これだけの
  1 コマンドで、シェル層も無ければその途中で補われる。installer は冪等で
  ハッシュ照合するので、版管理が届けた物と衝突しない

## コンセプト

このハーネスが作るのは「1 つの有能なエージェント」ではなく、**限られた注意
(コンテキスト)を役割で分割し、外部記録で接続した組織**である。以下の規則は
すべて 1 つの前提から導かれる — context は有限で、セッションと共に消える。

### 規則の三層 — 遍在則・瞬間則・強制則

規則は内容より先に、**配達のされ方**で性質が決まる。

- **遍在則**(コア = AGENTS.md)— 常時注入。全セッションの注意を常に消費し、
  守られるかは注意の配分に依存する**ベストエフォート**である。だからここに
  置けるのは、観測の瞬間を選べない少数の規則だけ
- **瞬間則**(スキル)— just-in-time 注入。その瞬間が来たときだけ context に
  入るので、詳細に書いても他の瞬間の注意を奪わない
- **強制則**(hooks / bin / permissions)— 注入されない。仕組みが判定するので
  注意を消費せず、破られない(または破れば痕跡が残る)

**落下則**: 規則は可能な限り下の層へ落とす。下へ行くほど保証が強くなり、
同時に注意コストが消える — 強度と費用が同時に改善する一方通行の坂である。
プロンプトとは「まだ仕組みに落とせていない規則の待機場所」に過ぎない。

### 分離 — 重複を作らない境界

サブエージェントは能力ではなく**重複が起きない境界**で切る: 判断材料
(context)・探索範囲・書き込み先(worktree)が交差しない単位。同じ情報を
2 つの context に持たせれば注意を二重に払い、同じ場所を 2 つが書けば合流点が
生まれる。構造で消せない合流点(統合ブランチと台帳)だけを、排他で守る。

分離は隠蔽でもある。実装の事情を知らないことがレビューの検出力であり、
**「渡さない」は「渡す」と同じ強さの設計判断**である。

### 器官 — 宣言と導出を分ける

道具は「答えられる問い」を 1 種類ずつ持つ器官として使い分け、器官のネイティブ
機能を他で再実装しない。分類の軸は**宣言か導出か**:

- **宣言の記録**(決めたことは導出できないから、記録する): bd = 意思と状態の
  台帳(何をやると決めたか・誰が何を・なぜ止まっているか)、ADR = 判断の経緯、
  用語の正本 = ユビキタス言語
- **導出**(実物から機械が導けるものは、手で記録しない): codegraph = コードの
  現在の構造(シンボル・呼び出し経路・影響範囲)、git = 変更の履歴

導出できるものを手で書いた瞬間から乖離が始まる。記憶も同じ軸の上にある:
状態は導出(bd prime のクエリ注入)、不変事項だけが宣言(bd remember)。
セッション間で文脈を運ぶのは会話の転写ではなく、住所を持つ外部記録である
(**コンテキストブリッジ**)。

codegraph は普段の探索で常用する器官であり、その遍在則(まず explore で
導出する)は**ツール説明(MCP サーバー指示)が配達する** — プロンプトに
書き写さない(codegraph 側の更新に置いていかれる写しになる)。ツール選択は
機械判定できないので強制則にも落とせない — 注入コストゼロのツール層が、この
規則の最下層である。ハーネスのプロンプトが明文化するのは、使わないことが
契約違反になる義務の瞬間(凍結前の土地勘・横展開スイープの導出・reviewer の
走査)だけ。配線(`codegraph install`)と index(`codegraph init`)は codegraph
自身の責務で、ハーネスは検査も再実装もしない — SessionStart が `.codegraph/`
の存在を検出して想起の 1 行を注入するのみ。

### 敵対的レビュー — 欠落は探さないと存在しない

AI エージェント特有の失敗は「終わっていないのに完了しました」であり、その
正体は嘘ではなく**欠落**である — 書いた物しか context に無い者には、書かなか
った物が見えない。

だからレビューは検品(できた物を眺めて良し悪しを言う)ではなく **存在証明**
にする: 要件を起点に「それを満たす実装と検証が実物に存在するか」を探させる、
逆方向の走査。レビュアーに差分を先に見せないのは、注意が「書かれた物」の
検証に占有されると「書かれなかった物」の探索が消えるからである。

### 沈降 — 知識を沈めるからループが終わる

レビューを繰り返すだけでは発散する(指摘は無限に湧く)。ループが収束するのは、
ラウンドごとに知識が層を**沈降**するからである: 個別の指摘 → 欠陥クラス
(壊れた契約)としての言語化 → 強制則(構造・型・ガード 1 本)へ。沈んだ仮説は
憲章から取り除かれ、レビューの燃料は回を追って減る。同じ欠陥クラスが二度
浮上したら、直し方ではなく**沈め方**が間違っている合図である。

issue の台帳も同じ原理で収束させる: 観測を open に積み上げるのではなく、
決めた事だけを open にし、同型は畳み、起票時に消化の経路を与える。

### テスト — 件数は守りの量ではない

テストが固定してよいのは**契約**(業務にとっての約束)だけであり、症状の写しは
退行から何も守らない。第一の防御は壊せない構造(発生条件を持てない設計・型)
であり、テストは構造で封じられない契約のための最後の手段である。

### 見張りと列挙 — メタな品質チェックを作らない

監視の監視・テストのテスト・ガードのガードのような、業務の契約を守らない
メタな検査は増殖しやすく、何も守らないまま維持費だけを食う。3 つの原則で
排除する:

- **見張りは足さず、沈める** — ガードを見張りたくなるのは層が高すぎる徴候で
  ある。応答は監視の追加ではなく落下則の適用: 下げれば見張る対象そのものが
  消える
- **検出は一段まで** — 構造で閉じられない契約だけが検出型を持てる。検出の
  検出は作らない。検出器が壊れたら気づけないことはこの設計の対価であり、
  だから検出器は最小・単純に保つ
- **列挙で守らない** — 守備範囲・修正対象・監視対象が人の列挙で決まる仕組みは、
  足し忘れが静かな空白になる漏れの温床。構造そのものが定義になる形(payload
  方式)か、列挙を機械が副産物として導出する形(manifest 方式)に寄せる

規則の本文はここに書かない(payload と二重管理になり、複製は黙って古くなる)。
正本の索引: 役割・品質の不変条件・Git 権限・beads の遍在則は
[AGENTS.md](../payload/AGENTS.md)、着手前と組成は
[agents-kickoff](../payload/skills/agents-kickoff/SKILL.md)、品質ループの
運転は [agents-quality-loop](../payload/skills/agents-quality-loop/SKILL.md)、
bd 運用と記憶の線引きは
[agents-beads-ops](../payload/skills/agents-beads-ops/SKILL.md)、テスト設計は
[agents-test-design](../payload/skills/agents-test-design/SKILL.md)、三層配置と
アブレーションの規律は
[prompt-guidelines.md](../payload/docs/prompt-guidelines.md)。

## 構成

```
bin/agents-setup      installer CLI(clone / pull / install / update / uninstall / status)
test/                 installer と強制則の契約テスト(npm test)
payload/              配布物の唯一の定義。この木がそのまま .agents/ になる
├── AGENTS.md         遍在則(全セッションが常時読む)
├── skills/           瞬間則(その瞬間が来たときだけ読む)
├── agents/           役割定義(reviewer / verifier。ツール制限つき)
├── hooks/            shellenv.sh(ガードのシェル配達)/ beads-session.sh(SessionStart 注入)
├── bin/              強制則(bd、git-guard、agents-gate、agents-reap)と自己検査(agents-doctor)
└── docs/             プロンプト更新のガイドライン
```

[payload/](../payload/) が配布物の正本の定義であり、installer 側に配布物の
列挙は存在しない(列挙の複製は黙って古くなるため — [package.json](../package.json)
の `files` は `bin` と `payload` の 2 項のみ)。

## プロンプトの更新

[payload/docs/prompt-guidelines.md](../payload/docs/prompt-guidelines.md) に
従う。編集は必ずこのリポジトリで行い、`agents-setup update` で配る — 配備先を
直接編集すると、`update` がそのファイルを保護して警告するようになる。それが
乖離の検出が働いている証拠である。

## 検討中

- 既存の台帳を持つプロジェクトへハーネスを導入する際の、既存 open issue の
  一括トリアージ(`AGENTS_BD_OPEN_OK=1` の包括承認つき)
- 造語の見直しと、AGENTS.md の `<beads>` 断片のさらなるスリム化 — 計器が
  観測を蓄積してから
