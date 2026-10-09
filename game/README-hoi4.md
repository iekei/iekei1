# 大戦略ゲーム — HOI4風グランドストラテジー UIシステム

Hearts of Iron IV 風の大規模戦略Webゲーム。Vanilla HTML5 / CSS3 / ES6 Modules（ビルド不要）。

## 起動方法

```bash
# 静的サーバー（リポジトリルートから）
python3 -m http.server 8000
# → http://localhost:8000/hoi4.html

# マルチプレイ時間同期サーバー（別ターミナル）
node server/timesync-server.js 8787
```

エントリページは **リポジトリルートの `hoi4.html`**。すべてのアセットは厳密なパス
`game/assets/...`・`game/card/...`・`game/locales/ja.json` を参照する。

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
  css/steel-ui.css            重厚スチールフレーム デザインシステム
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
    designers.js              戦車/艦艇/航空機設計（増槽システム含む）
    combat.js                 戦闘シミュレーター（1時間Tick/ダイスロール/地形ペナルティ）
    doctrine.js               ドクトリン（陸海空/XP/相互排他ルート/軍集団割当）
    intel.js                 諜報機関（諜報員カード/任務タイマー）
    diplomacy.js              外交（プロファイル/政治力消費アクション）
    politics.js               政治（法律/閣僚/占領度統合タイマー/併合）
    data/                     nations / battalions / equipment / mios / doctrines / operatives / cards
    ui/                       topbar.js / modal.js / screens.js / screens2.js / map.js
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
