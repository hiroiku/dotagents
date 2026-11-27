# レイヤー構成(layered)

層は `app-kernel`、`domain`、`application`、`interface`、`infrastructure`、`frameworks` の 6 つで、依存は外側から内側へ向ける。

import してよい層:

- `app-kernel`: なし
- `domain`: `app-kernel`
- `application`: `app-kernel`、`domain`
- `interface`: `app-kernel`、`application`
- `infrastructure`: `app-kernel`、`application`
- `frameworks`: `app-kernel`、`interface`(コンポジションルートは例外)

`domain` は、ほかの bounded context も import しない。

外部パッケージは、性質によって扱いを分ける。

- 純粋な計算のパッケージ(金額の 10 進数計算、日付の計算、検証など)は、`domain` と `application` でも使ってよい。どれを許すかは、プロジェクトが lint の許可リストで決める。ライブラリの型は `domain` の公開する型に出さず、値オブジェクトで包む。
- 実行のたびに結果が変わるもの(UUID の生成、現在時刻、乱数)は、`domain` の中で生成しない。ポートで受け取るか、`application` で生成して渡す。テストで値を固定できるようにするためである。
- I/O、フレームワーク、ベンダーの SDK は、`domain` と `application` で import しない。import するのは `infrastructure` と `frameworks` だけである。

依存の向き、下に書くファイルの配置と命名は、文やレビューではなく、プロジェクトの lint かチェックで検出する。チェックを通すために例外を追加しない。

- ファイルは `src/<層>/<種類>/<context>/<名前>.<種類>.ts` に置くのを既定にする。
- `domain` は業務の概念と規則を持ち、bounded context ごとに分ける。bounded context をまたぐ調整は `application` が持つ。
- `application` はユースケースを持つ。外部への依存は `application/ports/` に業務の言葉で宣言し、実装(アダプター)は `infrastructure` に置く。1 つのアダプターは 1 つのポートを実装する。
- アダプターのクラス名とファイル名は、ポートの名前の先頭に、接続先の製品やサービスの名前を付けたものにする。ORM やクライアントライブラリの名前ではなく接続先の名前を使い、外部に接続しない実装には方式の名前を付ける。例: ポート `UserRepository` には `PostgresUserRepository` と `InMemoryUserRepository`、ポート `Mailer` には `SesMailer`。`PostgresUserRepository` のファイルは `src/infrastructure/repository/account/postgres-user.repository.ts` に置く。
- `app-kernel` は、この形を動かす部品(`Result`、基底のエラー型)だけを持つ。別のプロダクトに持っていくときに名前を変えなければならないものは置かない。利用箇所が多いというだけでは、ここへ移す理由にならない。
- 技術やベンダーの名前は、`infrastructure` と `frameworks` にだけ現れる。識別子、型名、ファイル名、コメント、エラーの文も同じである。例外は lint で許可した純粋な計算のパッケージで、その名前は `domain` と `application` の import と、値オブジェクトの実装の中にだけ現れてよい。
- 層をまたいで組み立てるのは、デプロイ単位ごとに 1 つのコンポジションルートだけにする。内側は依存を引数で受け取る。コンテナーやリゾルバーを内側へ渡すと、import の関係が実際の依存を表さなくなる。
- 型とヘルパーは、所有するもののそばに置く。ユースケースの入出力はユースケース、外部とのやりとりの型はポート、行や SDK の型は実装の中が持つ。`dtos/` や `types/` のようなディレクトリーを作らない。
- 契約に含まれる失敗は `Result` で返し、`throw` は壊れた不変条件にだけ使う。層ごとのエラーは、境界で外側のエラーに包み直し、元のエラーを `cause` に残す。
- テストは `test/<層>/` に `src/<層>/` と同じ構成で置き、その層と `app-kernel` だけを import する。
