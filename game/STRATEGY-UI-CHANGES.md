# hoi4.html：戦略UIの拡張

ビルド不要。リポジトリのルートで `python3 -m http.server 8000 --bind 0.0.0.0` を実行し、`/hoi4.html` を開きます。file:// では fetch / ES Modules が動作しません。

## ファイルと設計

| 要件 | 実装 |
|---|---|
| ベクターマップ | `data/maps/provinces.geojson` を `js/ui/strategy-map.js` が fetch し、SVG path に変換。`js/map-engine.js` から起動 |
| タッチ操作 | `js/ui/touch-viewport.js`：touchstart/move/end/cancel、ピンチ中心ズーム、1指パン、ドラッグ後の誤クリック抑止 |
| ガチャ iframe | `js/ui/screens3.js` の renderGachaScreen が `game/card/index.html` を title 付き iframe で表示 |
| 7ヵ国国家方針 | `js/data/major-focuses.js`：GER/USA/SOV/ENG/JAP/ITA/FRA 各9ノード。`js/national-focus.js` が国別読み込み・開始・進捗・報酬を管理 |
| 陸海空モード | `js/ui/strategy-map.js`：既存 AIR_REGIONS / NAVAL_REGIONS を描く airLayer/navalLayer と師団の表示を切り替え |
| 研究レイアウト | `js/ui/screens.js`：依存の深さごとの行、横210px・縦160px間隔、技術名表示、専用スクロール領域 |
| 共通CSS | `css/steel-ui.css` 末尾に境界強調、ツリー、iframe用スタイル追加 |

エントリの `hoi4.html` は既存のCSS・JSを読み込むため変更不要です。

### GeoJSONについて

既存ゲームの都市座標は実世界の経緯度ではありません。今回のデータはその座標を維持し、各都市の周囲を最大65pxの範囲でVoronoi分割した**模式図**です。1936年の海岸線・国境・全世界のプロヴィンスを再現するデータではありません。`geometry.coordinates` は SVG 1200×640 のゲーム座標です。既存の師団、基地、作戦ルートとずれずに動作します。

共有辺の両側のtagが異なる場合（または外周）に太い国境線を描きます。細い州境界とは別に強調できます。ホバーで同国の領域と対象州を強調、タップで既存の州クリック処理へ渡します。取得に失敗した場合は理由を表示し、従来の都市表示を継続します。

歴史的地図へ移行する際は、都市・基地・空海域・作戦座標を共通の地理投影に移す必要があります。単に経緯度GeoJSONを差し替えるだけでは整合しません。また現在の国色・国境は初期tagに基づき、領土割譲後の動的所有権表示は未実装です。

### 国家方針

`MAJOR_FOCUSES[tag]` の各ノードは `{ id, tag, title, x, y, cost, prerequisites, effect }` です。各国3系統×3段階のスターターツリーを用意しました。効果は既存EffectEngine対応の政治力+50で統一し、独自名・依存関係を持ちます。本家の完全なツリー・固有イベントや併合効果の再現ではありません。他国タブは閲覧専用です。以前の英国データを誤って他国に割り当てる処理は廃止しました。旧方針IDとのセーブ移行処理はありません。

### ガチャ

埋め込み先は独立した既存ページです。大戦略側の政治力消費・指揮官コレクションとの自動同期は追加していません（旧画面を置き換えます）。再オープン時はiframeが再生成されます。CSSの衝突を避けるため別文書として表示します。

### 操作・手動確認

1. マップの州領域が表示されること、国境／州境界強調ボタン、表示リセットを確認。
2. 陸軍→海軍→空軍で海域・空域と凡例が切り替わることを確認。
3. タッチ端末で地図・研究・国家方針を1指パン、2指ピンチ。パン後に誤クリックしないことを確認。
4. 研究は通常ホイールでスクロール、Ctrl+ホイールでズーム。依存線と技術名の間隔を確認。
5. 方針の7タブに別々の名前が表示されること、自国のみ開始でき前提未完了は開始不可であることを確認。
6. ガチャでカードパック選択ページを表示し、モーダルの閉じるボタンで戻れることを確認。

## 自動確認

`node --test game/tests/strategy-ui.test.cjs`

GeoJSONと全州IDの対応、閉じたポリゴンと範囲、7ヵ国の方針ID一意性・前提参照・非循環を検証。変更モジュールは `node --input-type=module --check < ファイル名` で構文検証できます。実機ブラウザでの描画・タッチ操作検証は別途必要です。

## 地理地図・completion_reward 更新（前述の模式図仕様を置き換え）

- 模式図 `provinces.geojson` を廃止し、`world-1936.geojson` をSVG描画。実在の海岸線・歴史国境を表示。出典と復元方法・史実との未検証点は `data/maps/README.md` を参照。**1938/1930年データからの概略復元であり、1936年国境の完全再現ではありません。** 架空の州境界を除去したため州境界強調ボタンは廃止。
- `js/geo.js` の共通投影へ都市・基地・空海域・航空射程を移行。地理座標の原本は `data/maps/province-locations.json`。
- 方針の `effect` 固定報酬を `completion_reward` オブジェクトに変更。`reward_description` をノードと進捗パネルへ表示。
- 産業系は民需／軍需工場、陸軍系は人的資源／指揮力／戦争協力度、海軍系は造船所／輸送船／燃料など。民需・軍需・造船所は `state.factories`、輸送船は `state.convoys.total`、燃料は `state.fuel.stock` に即時加算。燃料上限を適用。
- `EffectEngine.execute` は報酬オブジェクト、従来の文字列／配列、`completion_reward = { ... }` に対応。従来の複数エフェクト文字列が先頭しか適用されない問題も修正。
- テスト: `node --test game/tests/strategy-ui.test.cjs`。歴史地図の主要国、ツリー整合性、複数形式の報酬反映・上限を検証。実機での描画・操作の目視確認は未実施。
