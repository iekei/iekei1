# HoI4 Wiki アセット収集

対象の10カテゴリについて、画像一覧・サブカテゴリ一覧・通常ページ一覧の
`filefrom` / `subcatfrom` / `pagefrom` を最後まで巡回します。
サブカテゴリは深さ制限なしで辿り、正規化URLとファイル名で重複・循環を除去します。
正規化URLは重複判定だけに使い、実際の取得ではリンクのパス・引数順・エンコードを保ちます。
サイトのナビゲーションや親カテゴリへのリンクは対象にしません。

## 実行・進捗

```sh
docker compose -f docker-compose.base44.yml --profile assets up -d scraper
docker compose -f docker-compose.base44.yml logs -f scraper
# 通信せずに完了状況だけを確認
docker compose -f docker-compose.base44.yml exec -T scraper python3 game/assets/scraper/scrape_wiki_assets.py --all --status
# コンテナ終了後の再開
docker compose -f docker-compose.base44.yml --profile assets up -d scraper
```

初回起動時に `requirements.txt` から依存をインストールします。
`SCRAPER_MAX_PASSES` の既定は10。HTTP 429では全体を止め、`Retry-After` と段階的な
冷却時間（通常120秒〜1800秒）を尊重して再開します。冷却後は次のカテゴリから処理し、
特定のカテゴリの制限で他カテゴリが永遠に待たされることを防ぎます。上限後は未完了として終了します。
バックグラウンドジョブはサンドボックスが稼働している間だけ動きます。

各ページ・画像の処理後に `.state/` にチェックポイントを保存します（git対象外）。
成功したページを取り直さず、保留ページと未保存画像だけ再試行します。
**完了条件は、全巡回成功かつ全画像の実体保存**です。空の未収録ページ・チャレンジ画面・
名前だけの画像・一部ダウンロード失敗を完了扱いにしません。
既存の旧マッピングは画像名を引き継ぎ、修正版の巡回で改めて検証します。
マッピングと統合インデックスは原子的に、カテゴリごとに更新し、他カテゴリを保持します。

アーカイブに画像URLがなければ `File:` ページの原画像リンクと `Special:FilePath` を試します。
サムネイルの原画像URLを優先し、HTML・不完全な画像は保存しません。
アーカイブに収録されていないページ・画像やアクセス制限は、スクリプトだけでは解消できません。
現行Wikiの全アセット取得を保証するものではありません。

## 部分実行・テスト

コンテナ内で実行するコマンド：

```sh
python3 game/assets/scraper/scrape_wiki_assets.py --only flags,topbar_icons --skip-done
python3 game/assets/scraper/scrape_wiki_assets.py --only flags --dry-run
python3 game/assets/scraper/scrape_wiki_assets.py --only flags --limit 50
python3 -m unittest discover -s game/assets/scraper -p 'test_*.py' -v
```

`--dry-run` は巡回だけで、画像・JSON・チェックポイントを変更しません。
`--limit` は一時的なテスト巡回で、既存マッピング・本番巡回状態を変更しません。
本家へのアクセスが許可される環境では `--mode live` も使えます。
その場合はコンテナ内で `pip install playwright` と
`playwright install --with-deps chromium` を追加で実行してください。
チャレンジが通過しなければ保留とし、成功にはしません。
