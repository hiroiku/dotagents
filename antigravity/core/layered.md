# 設計の形(layered)

層は `app-kernel`、`domain`、`application`、`interface`、`infrastructure`、`frameworks` の 6 つで、依存は外から内へ向ける。import してよいのは次の層だけである。

- `app-kernel` は、ほかの層を import しない。
- `domain` は `app-kernel` だけ。外のパッケージと、ほかのコンテキストも import しない。
- `application` は `domain` と `app-kernel`。外のパッケージは import しない。
- `interface` と `infrastructure` は `application` と `app-kernel`。
- `frameworks` は `interface` と `app-kernel`。例外は、下に書くコンポジションルートだけである。

この向きは、文やレビューではなく、プロジェクトの lint かチェックで落とす。チェックを通すために例外を足さない。

- 置き場は `src/<層>/<種類>/<コンテキスト>/<名前>.<種類>.ts` を既定にする。
- `domain` は業務の概念と規則を持ち、bounded context ごとに分ける。コンテキストをまたぐ調整は `application` が持つ。
- `application` はユースケースを持つ。外に求めるものは `application/ports/` に業務の言葉で宣言し、実装は `infrastructure` に置く。1 つのアダプターは 1 つのポートを実装し、名前の前に技術名を付ける。
- `app-kernel` は、この形を動かす部品(`Result`、基底のエラー型)だけを持つ。無関係な製品へ持ち込むときに名前を変える必要があるものは置かない。使う場所が多いことは、ここへ移す理由にならない。
- 技術やベンダーの名前は、`infrastructure` と `frameworks` にだけ現れる。識別子、型名、ファイル名、コメント、エラーの文も同じである。
- 層をまたいで組み立てるのは、配備の単位ごとに 1 つのコンポジションルートだけにする。内側は依存を引数で受け取る。コンテナーやリゾルバーを内側へ渡すと、import のつながりが依存の実態を表さなくなる。
- 型とヘルパーは、所有するもののそばに置く。ユースケースの入出力はユースケース、外とのやりとりの型はポート、行や SDK の型は実装の中が持つ。`dtos/` や `types/` のような置き場を作らない。
- 契約に含まれる失敗は `Result` で返し、`throw` は壊れた不変条件にだけ使う。層ごとのエラーは、境界で外側のエラーへ包み直し、元を `cause` に残す。
- テストは `test/<層>/` に写して置き、写した層と `app-kernel` だけを import する。
