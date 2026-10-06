# 国家方針ツリー — データモデル & 択一選択（相互排他）仕様書

## 1. 概要

7大国（GER/SOV/FRA/ENG/USA/JAP/ITA）すべてで再利用可能な国家方針システム。
「択一選択（相互排他 / Mutually Exclusive）」と「ローカライズ（多言語対応）」を
データ駆動で実現する。

## 2. コアモジュール

| ファイル | 役割 |
|---------|------|
| `game/assets/localization-manager.js` | HoI4 `.yml` ローカライズファイルをパースし、キー→テキストを解決する `LocalizationManager` |
| `game/assets/focus-tree-core.js` | 国家ごとに独立した状態を管理し、相互排他・前提判定・ツールチップ生成を行う `FocusTreeCore` |
| `game/assets/hoi4-effects-config.js` | 完了報酬のフォーマット（表示）とゲーム状態への適用（実行）を一元管理（既存） |
| `game/assets/nf-reward-loader.js` | GitHub から Paradox 形式の報酬データを取得・パース（既存） |

## 3. データモデル（1ノードの構造）

```json
{
  "id": "GER_atlantikwall",
  "country": "GER",
  "loc_key": "GER_atlantikwall",
  "x": 50,
  "y": 310,
  "cost": 70,
  "prerequisites": ["GER_west_wall"],
  "mutually_exclusive": ["GER_ostwall"],
  "completion_rewards": [
    { "type": "add_building_construction", "building": "coastal_bunker", "level": 3 }
  ]
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | ✅ | ノードの一意識別子。国家プレフィックス推奨（`GER_` / `SOV_`…） |
| `country` | string | ✅ | 所属国家タグ。他国の状態と混ざらないための鍵 |
| `loc_key` | string | — | ローカライズキー。省略時は `id` を使用。名称はここから解決 |
| `x`, `y` | number | — | UI 上の座標（ピクセル） |
| `cost` | number | — | 完了までの日数（デフォルト 70） |
| `prerequisites` | string[] | — | 前提ノードIDの配列。**すべて**完了済みが必要 |
| `mutually_exclusive` | string[] | — | 排他ノードIDの配列。こちらを完了すると相手がロックされる |
| `completion_rewards` | object[] | — | 完了時の効果。`HOI4EffectsConfig` 形式 |

### 名称・説明文の解決ルール

- **名称**: `loc_key` → LocalizationManager で解決 → 失敗時は `title`（後方互換） → 最後に `id`
- **説明文**: `loc_key + "_desc"` → LocalizationManager で解決 → 失敗時は `effect`（後方互換）
- `title` / `effect` 内の `$KEY$` や `[ScriptedToken]` も自動解決される

## 4. 択一選択（相互排他）の仕組み

### 概念

```
        GER_west_wall（前提・共通）
              |
       +------+------+
       |             |
 GER_atlantikwall  GER_ostwall
   (大西洋の壁)      (東の壁)
       ⇆  排他  ⇆
```

- `GER_atlantikwall` と `GER_ostwall` は互いに `mutually_exclusive` で参照し合う
- どちらかを完了すると、もう一方が `locked` Set に追加される
- ロックされたノードは `isAvailable()` で永続的に `false` を返す

### 国家ごとの独立管理

`FocusTreeCore` は国家タグごとに独立した状態オブジェクトを持つ：

```javascript
state[country] = {
  completed: Set,   // 完了済みノードID
  locked: Set,      // 排他ロック中ノードID
  active: null,     // 進行中ノードID
  progress: 0       // 進行度
}
```

→ ドイツの完了状況がソ連のツリーに影響することは**絶対にない**。

## 5. ローカライズファイル形式（HoI4 .yml）

```yaml
l_japanese:
 GER_atlantikwall:0 "大西洋の壁"
 GER_atlantikwall_desc:0 "西ヨーロッパを征服した今…"
```

- `l_japanese:` で言語ブロックを宣言
- `KEY:0 "テキスト"` の形式（`:0` はバージョン番号）
- `LocalizationManager.parseYml()` がこの形式をパースする

### 参考リソース
- [HoI4 日本語ローカライズデータ](https://github.com/cbrzeczysz/hoi4-history/tree/main/localisation/japanese)
- このリポジトリの `.yml` を `LocalizationManager.load()` で fetch → parse する想定

## 6. 使い方（統合例）

```javascript
// 1. ローカライズを読み込む
await l10n.load('./data/localisation/GER_focuses_l_japanese.yml', 'GER');

// 2. 方針ツリーを登録
const nodes = await fetch('./data/GER_nf_batch1.json').then(r => r.json());
focusTree.registerTree('GER', nodes);

// 3. 選択可能か判定
const available = focusTree.isAvailable('GER', 'GER_atlantikwall');

// 4. ノードを完了（排他ロック + 報酬適用が自動実行）
focusTree.complete('GER', 'GER_atlantikwall', gameState);
// → GER_ostwall が locked に追加される

// 5. ツールチップを生成（ローカライズ済み）
const tooltip = focusTree.buildTooltip('GER', 'GER_atlantikwall');
```

## 7. 7大国への拡張

各国家ディレクトリに同じ構造を作るだけで拡張可能：

```
game/ger/data/GER_nf_batch*.json          # 方針データ
game/ger/data/localisation/GER_*.yml      # ローカライズ
game/sov/data/SOV_nf_batch*.json
game/sov/data/localisation/SOV_*.yml
game/fra/data/FRA_nf_batch*.json
game/fra/data/localisation/FRA_*.yml
...（ENG, USA, JAP, ITA も同様）
```

各ページの `script.js` で `focusTree.registerTree(tag, nodes)` を呼ぶだけで、
相互排他・前提判定・ツールチップ生成がすべて共通ロジックで動作する。
