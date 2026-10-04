# HoI4 Wiki アセット収集

元の10カテゴリに加え、`Icons`・`Portraits` の親カテゴリと
`Leader_portraits`・`Ace_portraits` を対象にします。親カテゴリからすべての
子・孫カテゴリを深さ制限なしで発見し、フラグ・アイコン・指導者・エース・
諜報員・科学者のポートレートを収集します。

画像・サブカテゴリ・通常ページの `filefrom` / `subcatfrom` / `pagefrom` を
最後まで辿ります。正規化URLは重複・循環判定だけに使い、実際の取得では
リンクのパス・引数順・エンコードを保持します。親カテゴリへのナビゲーションは辿りません。

## 実行・進捗

```sh
docker compose -f docker-compose.base44.yml --profile assets up -d scraper
docker compose -f docker-compose.base44.yml logs -f scraper
# 通信せずに完了状況・保留数を確認（未完了なら終了コード1）
docker compose -f docker-compose.base44.yml exec -T scraper python3 game/assets/scraper/scrape_wiki_assets.py --all --status
# 機械可読の、カテゴリ別保留URL・画像名・エラーを含むレポート
docker compose -f docker-compose.base44.yml exec -T scraper python3 game/assets/scraper/scrape_wiki_assets.py --all --status --json
# コンテナ終了後もチェックポイントから再開
docker compose -f docker-compose.base44.yml --profile assets up -d scraper
```

Composeは起動時に `requirements.txt` の固定バージョンをインストールします。
バックグラウンドジョブはサンドボックスが稼働している間だけ動きます。

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

新しいスナップショットを先に試し、チャレンジ画面・欠落・取得失敗なら2024年の
スナップショットを試します。カテゴリのルートだけは `index.php?title=...` も照会します。
`Operative_portraits` の過去の名称 `Operatives_portraits` もフォールバックで照会します。
最初のリクエストは常に発見したURLそのものです。429時に別URLへ逃げて再試行しません。
テキストだけのファイル名でも、MediaWikiの公開原画像パス、`File:` ページ、
`Special:FilePath` を試し、発見したファイルを名前だけで落としません。

## 完了条件とゲーム用索引

各ページ・画像後に `.state/` のチェックポイントを保存します（git対象外）。
成功したページや有効な保存済み画像は取り直さず、保留分だけを処理します。
バージョン5では複合カーソルの巡回を再検証するためページ情報を再収集しますが、
旧チェックポイントのファイル名や保存済み画像は引き継ぎます。
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
現行Wikiの完全な収集には、アクセスが許可される環境での live モード実行、または
Wiki管理者からのカテゴリ／メディアのエクスポートが必要です。

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
# 通信なしの回帰テスト
python3 -m unittest discover -s game/assets/scraper -p 'test_*.py' -v
```

live モードではコンテナ内で `pip install playwright` と
`playwright install --with-deps chromium` を追加し、`SCRAPER_MODE=live` で実行してください。
チャレンジを通過できなければ保留です。アクセス制限を回避する処理はありません。
