# Game Assets — HoI4 アセット管理システム

## 概要

このディレクトリは HoI4 風ブラウザ戦略ゲームのアセット管理システムを構成する。

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `asset-registry.js` | Paradox Wiki カテゴリベースのアセット定義・マッピング |
| `image-loader.js` | 画像の遅延読み込み・動的ロード・事前読み込み・キャッシュ制御 |
| `topbar-icons.js` | トップバー用インラインSVGアイコン (データURI) |
| `topbar.css` | トップバー・ウィンドウナビゲーションのアイコンスタイル |
| `research-tree.js` / `research-tree.css` | 前提技術のレーン配置・直角接続線・クリック詳細パネル |
| `research-icons.js` | 研究画面を開いた時にWiki索引を読み込み、兵器カテゴリ別アイコンを解決 |

## GitHub 画像アップロード (スクレイピング廃止後の運用)

画像は GitHub リポジトリ **iekei/iekei1** (このリポジトリ) に直接アップロードする。
スクレイピングは廃止済み — 追加取得は不要。

- **保存場所**: `game/assets/<folder>/` 配下 (folder 対応は `asset-registry.js` の `categoryFolders`)
- **ファイル名**: HoI4 データベースの PNG と**完全に同名** (`flags/France.png`、`scientists/Portrait_AST_jack_piddington.png` など)。改名・拡張子の変更は禁止。
- **必要ファイル一覧**: `upload-checklist.json` — 各カテゴリの `files` (全件) / `already_saved` (ローカル済み) / `missing` (未アップロード) を記録。
- **参照URL**: ローカルは `game/assets/<folder>/<ファイル名>`、未アップロード分のフォールバックは `https://iekei.github.io/iekei1/game/assets/<folder>/<ファイル名>` (`AssetRegistry.getLocalAssetUrl` / `getGithubAssetUrl`)。

## アセットカテゴリ (AssetRegistry)

以下の10カテゴリを Paradox Wiki のカテゴリアーカイブに基づいて定義:

1. **operative_portraits** — 諜報機関（雇用スパイ）のポートレート
2. **flags** — 全国家の国旗 (主要国/中小国サブカテゴリ)
3. **technology_icons** — テクノロジーアイコン (歩兵/機甲/砲兵/海軍/空軍/工兵/工業/電子)
4. **equipment_icons** — 兵器設計・モジュール (航空機/艦船/戦車/車両)
5. **national_focus_icons** — 国家方針アイコン (国別・複数ページ対応)
6. **topbar_icons** — トップバーステータスアイコン (preload必須)
7. **top_menu_icons** — トップメニューアイコン (preload必須)
8. **special_project_icons** — 特別研究計画アイコン
9. **scientist_portraits** — 科学者ポートレート
10. **land_unit_icons** — 陸軍ユニットアイコン (戦闘大隊/支援中隊)

## 画像読み込み戦略

### 1. 事前読み込み (Preload)
トップバーなど常に表示される必須UI画像は `ImageLoader.preload()` で初期ロード。
SVGデータURIを使用し外部リクエスト不要。

### 2. 遅延読み込み (Lazy Loading)
`IntersectionObserver` で画面内に表示されるまで画像ロードを保留。
`<img data-src="...">` パターンを使用し、`ImageLoader.observe()` で監視。

### 3. 動的ロード (Dynamic Load)
タブ/画面オープン時にカテゴリ単位で画像をロード。
`ImageLoader.onTabOpen(tabId, callback)` でコールバックを登録し、
`ImageLoader.triggerTabLoad(tabId)` で実行。重複ロードは `loadedCategories` で防止。

### 4. キャッシュ制御
- in-memory `Map` でURL→ロード状態を記録
- URLにバージョンパラメータ (`?v=1`) を付与してブラウザキャッシュを制御
- `ImageLoader.VERSION` を更新することでキャッシュバスティング
