# 大戦略ゲーム — HOI4風グランドストラテジー UIシステム

Hearts of Iron IV 風の大規模戦略Webゲーム。Vanilla HTML5 / CSS3 / ES6 Modules（ビルド不要）。

## 起動方法

```bash
# 静的サーバー（リポジトリルートから）
python3 -m http.server 8000
# → http://localhost:8000/hoi4.html          HOI4 単独
# → http://localhost:8000/game/              将軍カードゲーム（H で HOI4 画面）

# マルチプレイ時間同期サーバー（別ターミナル）
node server/timesync-server.js 8787
```

エントリページは **リポジトリルートの `hoi4.html`**。すべてのアセットは厳密なパス
`game/assets/...`・`game/card/...`・`game/locales/ja.json` を参照する。

## 将軍カードゲーム（`game/index.html`）から HOI4 画面を開く

`game/index.html` に **「HOI4 大戦略」全画面レイヤー**を統合済み。カードゲームを
遊びながら、同じタブで HOI4 風の研究・生産・外交・戦闘画面へ切り替えられる。

| 起動方法 | 場所 |
| --- | --- |
| **H キー** | カードゲームのどこからでも（入力欄・IME 変換中を除く） |
| ナビゲーションレール | 「HOI4 大戦略」ボタン（`H` バッジ付き） |
| スタート画面 | 「🧭 HOI4 大戦略画面を開く（H）」 |
| 直接 URL | `game/index.html?screen=hoi4`（開いた状態で起動） |

- **Esc** または右上の「閉じる」でカードゲームへ戻る。HOI4 側の上部メニューにも
  「← 将軍カードゲーム」ボタンが出る（`?embed=1` のときだけ）。
- 選択中の国家タグが `?nation=GER` として引き継がれる（`GER/USA/ENG/SOV/JAP/ITA/FRA`）。
- iframe は初回オープンまで読み込まない。閉じても破棄しないため、HOI4 側の
  研究・生産などの状態は保持されたまま即座に再表示できる。
- 閉じている間は HOI4 の時間進行を自動で一時停止する（再表示で再開。
  ユーザーが自分で一時停止していた場合はそのまま）。
- `game/index.html?screen=hoi4` のように URL でも開ける。開閉時は `screen` パラメータだけを
  `history.replaceState` で付け外しする（他のクエリは保持）。

### なぜ iframe なのか

`hoi4.html` は `game/css/steel-ui.css` で `html` / `body` / `button` / `*` などの
グローバルスタイルを所有している。これをカードゲームの DOM に直接読み込むと
既存 UI の CSS を上書きしてしまうため、DOM・CSS・タイマーを完全に分離し、
`postMessage` で可視状態と「戻る」だけを連携している。

| ファイル | 役割 |
| --- | --- |
| `game/hoi4-screen.js` | 全画面レイヤー / 遅延 iframe / H・Esc / inert / URL 同期 / 国家引き継ぎ |
| `game/css/hoi4-screen.css` | スチール調クローム・ローディング・フッター・起動ボタン |
| `game/js/ui/embed.js` | `?embed=1` 時の親ページ連携（可視状態で時間停止 / Esc / ready 通知） |
| `game/js/ui/topbar.js` | 埋め込み時のみ「← 将軍カードゲーム」ボタンをメニュー末尾に追加 |

## 操作方法（HOI4準拠キーボードショートカット）

| キー | 画面 |
| --- | --- |
| `Q` | 自国政治パネル（スライド表示） |
| `Shift + Q` | ディシジョン |
| `Shift + W` | 諜報機関 |
| `W` | 研究（7大国家タブ / 独自研究日数 / MIOアサイン） |
| `E` | （ダミー枠・機能なし） |
| `R` | 貿易 |
| `T` | 建設 |
| `Y` | 生産 |
| `U` | 兵器設計/展開（師団・戦車・艦艇・航空機・シミュレーター） |
| `I` | 国家方針/補給 |
| `Shift + E` | 軍士気/ドクトリン |
| （ボタンのみ） | 外交 |

## ディレクトリ構成

```
hoi4.html                     エントリページ（リポジトリルート）
game/
  index.html                  将軍カードゲーム本体（HOI4 画面の起動元 / ?screen=hoi4）
  hoi4-screen.js              HOI4 全画面レイヤー（H・Esc・遅延iframe・国家引き継ぎ）
  css/steel-ui.css            重厚スチールフレーム デザインシステム
  css/hoi4-screen.css         game/index.html 側の全画面クローム / 起動ボタン
  css/systems.css             作戦計画パネル / 兵器設計 / ドクトリンツリーのスタイル
  README-systems.md           4大システム（作戦計画/方針報酬/兵器設計/ドクトリン）の実装ノート
  locales/ja.json             日本語ローカライズ辞書（hoidesigner.com準拠・全294技術名収録）
  js/
    i18n.js                   辞書ロード / data-i18n DOM適用 / techName等の日本語解決
    util.js                   el/fmt/Bus/store/img/imgChain/toast 等
    state.js                  GameState（資源・工場・備蓄・外交・占領地等）
    time.js                   TimeEngine（1Tick=1時間）/ TimeSync（時間同期）
    research.js               研究マネージャ（8分野×独自研究日数・国家補正・MIOボーナス）
    mio.js                    MIOマネージャ（アサイン/レベル/XP/特性ツリー）
    economy.js                生産ライン・貿易・燃料・建設キュー
    division.js               DivisionTemplate（5×5＋1×5 全ステータスリアルタイム再計算）
    designers.js              戦車/艦艇/航空機設計（研究アンロック/スロット上限/増槽システム含む）
    battle-plan.js            作戦計画（前線/攻撃線/経路探索/計画準備/自動進軍・戦闘）
    effects.js                国家方針 completion_reward のエフェクトエンジン（併合/研究ボーナス/精神/XP等）
    combat.js                 戦闘シミュレーター（1時間Tick/ダイスロール/地形ペナルティ）
    doctrine.js               ドクトリン（陸海空/XP/相互排他ルート/軍集団割当）
    intel.js                 諜報機関（諜報員カード/任務タイマー）
    diplomacy.js              外交（プロファイル/政治力消費アクション）
    politics.js               政治（法律/閣僚/占領度統合タイマー/併合）
    data/                     nations / battalions / equipment / mios / doctrines / major-focuses / operatives / cards
    ui/                       topbar.js / modal.js / screens.js / screens2.js / screens3.js / map.js / embed.js
                              battle-plan-ui.js / designer-ui.js / doctrine-ui.js
server/timesync-server.js     マルチプレイ時間同期 WebSocket サーバー（依存なし）
```

## 主要システム

- **統一スチールフレームUI**: 全モーダルが金属フレーム＋リベット＋金文字タイトル＋閉じるボタン。
  3D金属ボタン / LEDインジケーター / インセット型入力フィールド。
- **トップバー**: 最上段ステータスバー（国旗Q・政治力・安定度・戦争協力度・徴兵可能人口・
  工場数・燃料残日数・装備充足率LED・輸送船 / 指揮力・陸海空XP・核弾頭）＋2段目メニュー。
- **研究**: `game/eng/tec/data/tech_*.json`（294ノード）を読み込み、国家別補正で独自研究日数を算出。
  Tickでカウントダウン。MIOアサインで研究加速。
- **MIO**: 研究/生産完了でXP蓄積→レベルアップ（最大Lv5）→3段階の特性ツリーを選択。
- **師団設計**: 5×5大隊グリッド＋1×5支援中隊。全ステータスを配置と同時に再計算。
- **兵器設計**: 戦車（車体＋主砲/砲塔/懸架/エンジン/装甲/特殊）、艦艇（船体＋主砲/対空/魚雷/ソナー/
  レーダー/機関/装甲）、航空機（機体＋エンジン/武装/特殊）。
- **増槽（Drop Tank）**: 航続距離+75%〜100% / 機動性-10% / 生産コスト+15%。
  航空機設計タブで装着するとマップ上に出撃可能半径を円表示。
- **戦闘シミュレーター**: 攻撃側/防御側の編成・地形・天候・戦術・指揮官・掘り込みを設定し、
  1Tick（1時間）ごとにダイスロール戦闘。組織力/HPバーのアニメーション＋日本語戦闘ログ。
- **諜報機関**:諜報員カード（`game/assets/operatives/`肖像）を敵国へ派遣。
  「諜報網構築」「暗号解読」「破壊工作」等の任務をタイマー進行。
- **占領地・傀儡国**: 占領度が2週間ごとに+3%。100%で「国家統一」（併合・コア化）ボタン。
- **マルチプレイ時間同期**: HOSTのTickを標準軸に `TIME_SYNC_TICK` を全Clientへ配信。
  一時停止/倍速もブロードキャスト。遅延時はCatch-up補正。
  - 同一ブラウザの別タブ間: BroadcastChannel で同期（サーバ不要）
  - クロスデバイス: WebSocket（`server/timesync-server.js`、既定ポート8787）

### マルチプレイの使い方

```
# ホスト（時間の標準軸）
http://localhost:8000/hoi4.html?mp=host&room=room1
# クライアント（ホストへ時間同期）
http://localhost:8000/hoi4.html?mp=client&room=room1
```

## カードアセット（`game/card/`）

`game/card/manifest.json` を起点に `army/` `navy/` `air/` `mio/` 各ブランチの
JSONをロード。海軍/空軍の指揮官スロットには該当ブランチのカードのみ配属可能。
顔画像は `game/card/<TAG>/data/image/` および `game/assets/` の獲得済みアセットを使用。

## テスト

```bash
# ロジック スモークテスト（76項目）
node /tmp/smoke.mjs
# E2E UIテスト（jsdom + vm.SourceTextModule、52項目）
cd /tmp/uitest && node --experimental-vm-modules e2e.mjs
# 時間同期テスト（実WebSocketサーバー使用）
node server/timesync-server.js 8787
```

## 更新履歴

### 2026-10-22 — 4大システム（作戦計画 / 国家方針報酬 / 兵器設計 / ドクトリン）
- `js/battle-plan.js` + `js/ui/battle-plan-ui.js`: 前線ドラッグ設定・攻撃線（Dijkstra 経路）・
  計画準備ボーナス・計画実行による自動進軍/戦闘/占領。`map-engine.js` に前線ポリラインと矢印描画
- `js/effects.js`: `completion_reward` のエフェクトエンジン（併合・傀儡・宣戦事由・研究ボーナス・
  国家的精神・XP）。`js/data/major-focuses.js`: 7カ国×9ノード（計63）に史実寄りの報酬
- `js/data/equipment.js` + `js/designers.js` + `js/ui/designer-ui.js`: 車体/船体/機体＋モジュール設計。
  研究完了でモジュール解禁、ドラッグ＆ドロップ/クリック装着、スロット上限、ステータス差分表示
- `js/data/doctrines.js` + `js/doctrine.js` + `js/ui/doctrine-ui.js`: 陸海空42ノード/10ルート。
  XP消費・ルート排他・ツリーSVG配線・`game/assets/doctrine/` のPNGアイコン表示
- `game/tests/systems.test.mjs`: 上記4システムの回帰テスト17件
- 詳細は `README-systems.md` を参照

### 2026-10-20 — game/index.html への HOI4 画面移植
- `game/hoi4-screen.js` + `game/css/hoi4-screen.css`: 将軍カードゲームから
  `../hoi4.html` を全画面表示するレイヤー（H キー / ナビ / スタート画面 / `?screen=hoi4`）
- 国家タグ引き継ぎ (`?nation=`)、遅延 iframe、閉じても状態保持、背景 `inert` 化、
  フォーカス返却、Esc・別タブリンク・読み込み失敗フォールバック
- `game/js/ui/embed.js`: `?embed=1` 時の親ページ連携。閉じている間は HOI4 の時間を自動停止
- `game/js/ui/topbar.js`: 埋め込み時のみ「← 将軍カードゲーム」ボタンを追加
- `game/index.html`: ナビレール / スタート画面に HOI4 起動ボタン、操作方法に追記

### 2026-10-09 — HOI4風 UIシステム一式 (a1399a0)
- `hoi4.html` エントリページ追加（`game/` 配下の厳密パス参照）
- `game/css/steel-ui.css` 重厚スチールフレーム デザインシステム
- `game/js/ui/topbar.js` トップバー（政治力・安定度・戦争協力度・徴兵可能人口・工場数・燃料・装備充足率・輸送船／指揮力・XP・核弾頭）+ キーボードショートカット
- `game/locales/ja.json` 日本語ローカライズ（全294研究技術名）
- 研究 / MIO / 師団設計 (5×5+1×5) / 兵器設計+増槽 / 戦闘シミュレーター / 生産・貿易 / ドクトリン・諜報・外交・政治 / 指揮官カード53枚 / マルチプレイ時間同期
- `server/timesync-server.js` WebSocketリレー

Ref: arena/d5009569-iekei1 (#46) と同内容を a1399a0 ブランチからPR化
