# レイヤー構成(layered)

層は `app-kernel`、`domain`、`application`、`interface`、`infrastructure`、`frameworks` の 6 つで、依存は外側から内側へ向ける。import してよいのは次の層だけである。

- `app-kernel` は、ほかの層を import しない。
- `domain` は `app-kernel` だけ。外部パッケージと、ほかの bounded context も import しない。
- `application` は `domain` と `app-kernel`。外部パッケージは import しない。
- `interface` と `infrastructure` は `application` と `app-kernel`。
- `frameworks` は `interface` と `app-kernel`。例外は、下に書くコンポジションルートだけである。

この向きは、文やレビューではなく、プロジェクトの lint かチェックで検出する。チェックを通すために例外を追加しない。

- ファイルは `src/<層>/<種類>/<context>/<名前>.<種類>.ts` に置くのを既定にする。
- `domain` は業務の概念と規則を持ち、bounded context ごとに分ける。bounded context をまたぐ調整は `application` が持つ。
- `application` はユースケースを持つ。外部への依存は `application/ports/` に業務の言葉で宣言し、実装は `infrastructure` に置く。1 つのアダプターは 1 つのポートを実装し、名前の先頭に技術名を付ける。
- `app-kernel` は、この形を動かす部品(`Result`、基底のエラー型)だけを持つ。別のプロダクトに持っていくときに名前を変えなければならないものは置かない。利用箇所が多いというだけでは、ここへ移す理由にならない。
- 技術やベンダーの名前は、`infrastructure` と `frameworks` にだけ現れる。識別子、型名、ファイル名、コメント、エラーの文も同じである。
- 層をまたいで組み立てるのは、デプロイ単位ごとに 1 つのコンポジションルートだけにする。内側は依存を引数で受け取る。コンテナーやリゾルバーを内側へ渡すと、import の関係が実際の依存を表さなくなる。
- 型とヘルパーは、所有するもののそばに置く。ユースケースの入出力はユースケース、外部とのやりとりの型はポート、行や SDK の型は実装の中が持つ。`dtos/` や `types/` のようなディレクトリーを作らない。
- 契約に含まれる失敗は `Result` で返し、`throw` は壊れた不変条件にだけ使う。層ごとのエラーは、境界で外側のエラーに包み直し、元のエラーを `cause` に残す。
- テストは `test/<層>/` に `src/<層>/` と同じ構成で置き、その層と `app-kernel` だけを import する。
