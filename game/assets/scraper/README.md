# HoI4 Wiki アセット収集

Composeでは科学者・兵器モジュール・国旗の3カテゴリを優先して収集します。
各ラウンドは指定された全対象の巡回・発見を先に進め、
その後で画像本体を取得するため、遅い画像取得で後続カテゴリの発見が止まりません。
`Equipment_icons` の `Module_slot_icons`・`Plane_module_icons`・`Ship_module_icons`・
`Tank_module_icons` も、親カテゴリのリンクから発見して収集します。

CLIは従来の全14カテゴリにも対応します。親カテゴリからすべての子・孫カテゴリを
深さ制限なしで発見し、フラグ・アイコン・指導者・エース・諜報員・科学者の
ポートレートを収集します。

画像・サブカテゴリ・通常ページの `filefrom` / `subcatfrom` / `pagefrom` を
最後まで辿ります。正規化URLは重複・循環判定だけに使い、実際の取得では
リンクのパス・引数順・エンコードを保持します。親カテゴリへのナビゲーションは辿りません。

## 実行・進捗

```sh
docker compose -f docker-compose.base44.yml --profile assets up -d scraper
docker compose -f docker-compose.base44.yml logs -f scraper
# 通信せずに完了状況・保留数を確認（未完了なら終了コード1）
docker compose -f docker-compose.base44.yml exec -T scraper python3 game/assets/scraper/scrape_wiki_assets.py --mode reader --only scientist_portraits,equipment_icons,flags --status
# 機械可読の、カテゴリ別保留URL・画像名・エラーを含むレポート
docker compose -f docker-compose.base44.yml exec -T scraper python3 game/assets/scraper/scrape_wiki_assets.py --mode reader --only scientist_portraits,equipment_icons,flags --status --json
# コンテナ終了後もチェックポイントから再開
docker compose -f docker-compose.base44.yml --profile assets up -d scraper
```

Composeは起動時に `requirements.txt` の固定バージョンをインストールします。
バックグラウンドジョブはサンドボックスが稼働している間だけ動きます。

既定のComposeジョブは `SCRAPER_MODE=reader` と
`SCRAPER_ONLY=scientist_portraits,equipment_icons,flags`（対象3カテゴリ）で動きます。
他カテゴリのチェックポイントも維持されます。全14カテゴリを再開する場合は
Composeの `SCRAPER_ONLY` を空にしてください。
CLIは `.state/writer.lock` により全モード共通の排他的書き込みを行います。
公開のJina Readerから `X-Return-Format: html` で完全なカテゴリHTMLを取得し、
元のWiki URLを基準に解析します。チャレンジ画面を成功扱いにせず、429時は停止します。
画像本体はWikiの原画像を優先し、失敗時はWaybackを照会します。
`thumb.php?f=...` の画像も、ファイル名から原画像のURLを解決して照会します。
`reader` と `wayback` の巡回状態・冷却時刻は別々です。

収集先は `assets/scientists/`・`assets/equipment/`・`assets/flags/`、索引はそれぞれ
`assets/mappings/scientist_portraits.json`・`equipment_icons.json`・`flags.json` です。
国旗の既存索引にしかない古い画像名も維持するため、索引の発見件数が現行カテゴリの
公表件数を上回ることがあります。発見件数とローカル保存件数は区別してください。
同じ索引を書き換える複数の収集プロセスを同時に走らせないでください。

### 公平な再開・アクセス制限

1回・1カテゴリ当たり、既定でページ2件と画像10件を処理し、次のカテゴリに進みます。
大量の国旗やフォーカスの取得中でも他のカテゴリが待ち続けません。
失敗画像もダウンロードカーソルを進め、次回は続きから処理します。
画像は公開されているWikiの原画像を優先し、取得できなければアーカイブを使います。
HTML・壊れた画像・SVGファイルへのPNGサムネイル保存は拒否します。

`SCRAPER_MAX_PASSES=0` は**検証済み全件完了まで再開を続ける**設定です。
正の値にするとその回数で停止し、未取得分があれば終了コード1になります。
進捗があるときは通常のリクエスト間隔で次のラウンドに進みます。
進捗がないときは120～1800秒のバックオフを使います。
HTTP 429は直ちに全体を止め、`Retry-After` と保存した冷却時刻を守ります。
冷却後は次のカテゴリから処理し、制限のかかった最初のカテゴリによる停滞を防ぎます。

### アーカイブの回復

カテゴリページ・画像本体とも、新しいスナップショットを先に試し、
チャレンジ画面・欠落・取得失敗なら2024年のスナップショットを試します。
画像は発見元の保存日時→最新→2024年の順に、重複を除いて照会します。
HTTP 429の場合は過去スナップショットへ進まず、冷却を守ります。
カテゴリのルートだけは `index.php?title=...` も照会します。
`Operative_portraits` の過去の名称 `Operatives_portraits` もフォールバックで照会します。
最初のリクエストは常に発見したURLそのものです。429時に別URLへ逃げて再試行しません。
テキストだけのファイル名でも、MediaWikiの公開原画像パス、`File:` ページ、
`Special:FilePath` を試し、発見したファイルを名前だけで落としません。

## 完了条件とゲーム用索引

各ページ・画像後に `.state/` のチェックポイントを保存します（git対象外）。
成功したページや有効な保存済み画像は取り直さず、保留分だけを処理します。
バージョン6では画像・子カテゴリに加えて通常ページの公表件数も照合し、
`pagefrom` が欠落したカテゴリを完了にしません。ページ情報は再収集しますが、
旧チェックポイントのファイル名や保存済み画像は引き継ぎます。
複数カテゴリが共有する有効な保存済み原画像はローカルで再利用します。
他セクションの `*until` が付いた次ページも辿り、変化しない `*from` を持つ戻りリンクは
次ページと誤認しません。失敗ページが別名カテゴリからのリダイレクトで取得できた場合は、
同じラウンドで保留とエラーを解消します。

**完了は、全巡回成功・カテゴリの公表画像／子カテゴリ件数を満たすこと・全画像の
有効なローカル保存をすべて満たしたときだけです。**
続きリンクが欠落して公表件数に届かなければ、そのカテゴリを保留して再巡回します。
空カテゴリは確認できたときだけ完了します。チャレンジ・未収録・画像名だけ・失敗画像を
完了にしません。キャッシュ検証はファイルの更新時刻・サイズごとに結果だけを保持します。

`assets/mappings/<id>.json` と `assets/asset-mapping.json` は原子的に更新し、
他カテゴリや既存画像を保持します。各 `images[].local` は `game/index.html` からの
URLエンコード済み相対パスです。ゲームは既存の `AssetRegistry.loadScrapedMapping()` と
`loadCategoryMapping(id)` / `getLocal(id, key)` でカテゴリを遅延読み込みできます。
追加カテゴリも統合索引から読めます。UI・ゲームロジックは変更しません。

**アーカイブ完了は収録された時点のカテゴリについての完了であり、現行Wikiの全画像を
保証するものではありません。** アーカイブに収録されていないページ・画像やWikiの
アクセス制限は、再試行を増やしても解消できません。レポートに未完了として残します。
reader モードで取得できたカテゴリについては、ページの公表件数と巡回件数を照合します。
ただし画像本体の取得可否は別問題です。原画像もアーカイブも取得できない場合は、
アクセスが許可される環境での live モード実行、またはWiki管理者からのメディアの
エクスポートが必要です。

## 部分実行・テスト

コンテナ内で実行するコマンド：

```sh
# 1ラウンド。既定のバッチで公平に進める
python3 game/assets/scraper/scrape_wiki_assets.py --only flags,topbar_icons --skip-done
# 発見のみ。チェックポイントもマッピングも変更しない
python3 game/assets/scraper/scrape_wiki_assets.py --only flags --dry-run
# 一時テスト。実際の巡回状態・マッピングは変更しない
python3 game/assets/scraper/scrape_wiki_assets.py --only flags --limit 50
# バッチ数はCLIで調整可能
python3 game/assets/scraper/scrape_wiki_assets.py --all --page-budget 2 --download-budget 10
# 巡回・発見を保存するが、画像本体はまだ取得しない（完了扱いではない）
python3 game/assets/scraper/scrape_wiki_assets.py --mode reader --all --download-budget 0
# 通信なしの回帰テスト
python3 -m unittest discover -s game/assets/scraper -p 'test_*.py' -v
```

live モードではコンテナ内で `pip install playwright` と
`playwright install --with-deps chromium` を追加し、`SCRAPER_MODE=live` で実行してください。
チャレンジを通過できなければ保留です。アクセス制限を回避する処理はありません。
