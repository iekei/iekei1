# HOI4 再現システム — 作戦計画 / 国家方針報酬 / 兵器設計 / ドクトリン

対象: **`game/index.html`** とその関連 JS (`game/strategy.js` / `game/battle.js` /
`game/dlc.js` / `game/assets/*`)。`hoi4.html` 系のモジュールバンドルは対象外。

起動:

```bash
cd /home/user/iekei1
python3 -m http.server 8765 --bind 0.0.0.0
# → http://localhost:8765/game/index.html
```

---

## 1. 作戦計画 (Battle Plan) — 計画準備ボーナス

### データ構造

```js
// game/strategy.js — class PlanningBonus
PlanningBonus.BASE_CAP     = 0.30;  // 基本上限 +30%
PlanningBonus.MAX_CAP      = 0.60;  // ドクトリン込み上限 +60%
PlanningBonus.GAIN_PER_DAY = 0.02;  // 2%/日
PlanningBonus.DECAY_PER_DAY= 0.05;  // 実行中の減衰 5%/日

// 軍集団 (BattlePlanManager.armies[i]) が保持する計画状態
{
  id, name, base: [x, y], divisions: [...],
  frontline: [[x, y], ...],   // 国境線 (ドラッグ or 自動スナップ)
  arrow: { from:[x,y], to:[x,y] }, targetState, chain: [sid, ...],
  executing: false,
  planning: 0.24,             // ← 計画準備ボーナス (0〜cap)
  planningCap: 0.30,
  planningDays: 12
}
```

### 計算ロジック

```js
cap  = min(0.60, 0.30 + ドクトリン.maxPlanning + cardModifiers.planningBonusMax)
rate = 0.02 * (1 + ドクトリン.planningSpeed)

毎日:
  executing        → planning = max(0, planning - 0.05)
  前線 + 師団あり   → planning = min(cap, planning + rate * (攻撃線あり ? 1 : 0.6))
  前線なし          → planning = 0

戦闘開始時:
  softAttack = attackProfile(army).soft * (1 + planning)
  hardAttack = attackProfile(army).hard * (1 + planning)
  advantage += planning * 0.25
  戦闘進行   *= (1 + planning)   // 準備が整っているほど早期に決着
```

前線・攻撃線を引き直す / 師団を配属替えすると `PlanningBonus.reset(army)` で 0 に戻る
(HOI4 の「計画の作り直し」)。

### 画面操作

| 操作 | 実装 |
| --- | --- |
| 前線を引く (`ArmyRoster.frontTool`) | ドラッグ点を国境プロヴィンスへスナップ (`endDrag` / `autoFrontline`) |
| 前線への自動配備 | `OffensivePlanner.deployAlongFront(army)` — 前線点に対応する自国州へ師団を均等配置 |
| 攻撃線 (矢印) | Shift+右ドラッグ → `buildAttackChain` で陸路の州チェーンを構築 |
| 計画実行 | 軍集団カードの **「計画実行」** ボタン → `OffensivePlanner.execute` |
| 進軍・戦闘 | `OffensivePlanner.next` が隣接州のみ攻撃、`BattleManager.startOffensive` が解決 |

軍集団カードには `計画準備 +24% / 上限 +30%` のバーを表示 (`strategy.css`
`.army-planning`)。戦闘ツールチップにも「計画準備ボーナス」を表示。

---

## 2. 国家方針 completion_reward

- 全 **1,348 方針** (`game/{ger,sov,usa,eng,fra,ita,jap}/data/*_nf_batch*.json`) に
  `cost: 70` (HOI4 既定の 70 日) と `completion_rewards` を付与。
- 生成スクリプト: `game/tools/generate_focus_rewards.py` (決定論的・再実行可能)

```json
{
  "id": "GER_four_year_plan",
  "title": "四ヵ年計画",
  "cost": 70,
  "completion_rewards": [
    { "type": "add_political_power", "value": 110 },
    { "type": "add_building_construction", "building": "industrial_complex", "level": 3 },
    { "type": "add_building_construction", "building": "arms_factory", "level": 2 }
  ]
}
```

### 適用フロー

```
FocusTreeManager.completeFocus()
  → getCompletionRewards(f)            // completion_rewards を正規化
  → FocusTreeManager.applyCompletionRewards()   // ← 新規 (index.html)
      → HOI4EffectsConfig.applyEffect(gameState, reward)
```

`game/index.html` は `national-focus.js` を読み込まないため、従来は報酬が
適用されなかった。`FocusTreeManager.applyCompletionRewards` を追加して直接適用する。

### 対応効果 (`game/assets/hoi4-effects-config.js`)

| type | 効果 |
| --- | --- |
| `add_political_power` | 政治力 (0〜999 クランプ) |
| `add_stability` / `add_war_support` | 0〜100 |
| `add_army/navy/air_experience` | `xp.*` と `*Experience` の両方に加算 |
| `add_building_construction` | `industrial_complex` → `civilianFactories`、`arms_factory` → `militaryFactories`、`dockyard` → `dockyards`、`bunker` / `coastal_bunker` → 要塞レベル。`ProductionManager.ensure()` で生産画面へ即時反映 |
| `create_wargoal` / `casus_belli` | `WarGoals.grant(tag, 'focus', 120)` → 外交画面で宣戦可能 |
| `annex_country` | `effectEngine.annexCountry(tag)` → なければ `MapRenderer.annexCountry(tag)` → `captureState` |
| `add_tech_bonus` | `gameState.techBonuses` に積み、`ResearchManager.takeTechBonus` が次回研究時間を `×(1-0.5)` |
| `add_manpower` / `add_ideas` / `add_world_tension` / `add_opinion` | 対応済み |

---

## 3. 兵器設計 (Equipment Designer)

`game/dlc.js` の `EquipmentDesigner.DATA` + `game/assets/equipment-designer.js`。

- **車体/船体/機体 26 種** — すべて実在研究 ID でゲート
  (例: `basic_medium_tank_chassis`, `improved_ship_hull_heavy`, `basic_large_airframe`)
- **モジュール 43 種** — 主砲 / 装甲 / エンジン / 無線 / 足回り / 魚雷 / レーダー / 武装 / 燃料タンク
  (`artillery1..5`, `armor_tech_1..4`, `engine_tech_1..4`, `radio`, `improved_radio`,
  `air_torpedoe_1`, `early_bombs`, `heavy_bombs`, `aircraft_construction` など)
- 未研究の車体・モジュールは 🔒 + 必要技術名を表示し、選択できない
  (`Designer.isUnlocked` は `ResearchManager.researchedTech` を参照)

### 性能計算

```js
weight     = 車体重量 + Σモジュール重量
capacity   = engine.engineCapacity || 車体capacity
overload   = max(0, 使用スロット - capacity)
speed      = 車体baseSpeed + Σspeed + power*0.35 - weight*0.45 - overload*2.5
armor      = 車体基礎装甲 + Σarmor
soft/hard  = Σsoft / Σhard (+基礎値)
fire       = Σattack          // 対艦・空中攻撃
reliability= clamp(70 + Σreliability + (engine?4:-6) - overload*9 - 超過重量*0.4, 0, 100)
cost (IC)  = 車体cost + Σmodule.cost
```

UI はスロットごとの `<select>` (ドロップダウン)、性能表、積載超過警告、
設計一覧、XP 消費ボタンを表示。保存した設計は `StrategySystems.registerDesign` 経由で
生産ラインのカタログに追加される。

---

## 4. ドクトリンツリー

- データ: **`game/assets/doctrine-data.js`** (`window.DOCTRINE_DATA`)
  - 陸軍 17 / 海軍 12 / 空軍 13 = **42 ノード**
  - ルート: 陸 4 (`mass` / `blitz` / `gbp` / `sf`)、海 3 (`fib` / `ti` / `bs`)、空 3 (`sd` / `bs` / `as`)
  - コスト: tier0 40 / tier1 70 / tier2 100 / tier3 140 XP
  - アイコン: `game/assets/doctrine/{land,naval,air}/*.png` を `<img>` で読み込み
- 実装: `game/dlc.js` の `DoctrineManager` (描画・XP・排他制御・集計)
- 保存: `gameState.doctrine` (取得ノード ID) と `gameState.doctrineRoutes` (確定ルート)

### ルート排他 (HOI4 仕様)

```js
unlock(nodeId):
  ルート確定済み && 別ルート → 取得不可 (status 'locked')
  前提未達 / 同一 group 取得済み → 取得不可
  xp[xpKey] < cost → 取得不可
  → xp 減算 / doctrine 追加 / 最初のノードで doctrineRoutes[service] = route
```

### ツリー描画

ルート = 列、tier = 行。ノードは絶対配置 (`190×96px`)、接続線は SVG で
**必ず「親の下端 → 子の上端」を水平・垂直のみで結ぶ** (`M x1,y1 L x1,midY L x2,midY L x2,y2`、
同一列なら直線)。曲線は使用しない。

### 戦闘への反映

```js
BattleManager.attackProfile()  soft *= (1 + land.soft) / hard *= (1 + land.hard)
BattleManager.defenseProfile() defense *= (1 + land.defense + entrench*0.5)
                               breakthrough *= (1 + land.breakthrough)
calcOffensiveAdvantage()       org *= (1 + land.org)
supportBonus()                 air.groundAttack が近接航空支援を増幅
applyForceAction()             air.airAttack/agility → 制空権獲得速度
                               naval.navalHit/navalHeavy → 制海権獲得速度
                               air.strategicBombing → 戦略爆撃間隔
PlanningBonus.cap/rate()       land.maxPlanning / land.planningSpeed
```

---

## テスト

```bash
cd game
node --test tests/*.cjs tests/*.mjs
```

- `tests/hoi4-systems.test.cjs` — ドクトリンデータ (42ノード / 前提 / アイコン)、
  全 1,348 方針の `completion_rewards`、効果適用、兵器設計の技術 ID と性能計算、XP・ルート排他
- `tests/strategy.test.cjs` — 計画準備の蓄積/上限/減衰/リセット、報酬適用、前線自動配備
- 既存の 57 テストも含めて **84 テスト全緑**
