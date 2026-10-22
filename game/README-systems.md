# 4大システム実装ノート（作戦計画 / 国家方針報酬 / 兵器設計 / ドクトリン）

対象エントリ: リポジトリルートの `hoi4.html`（`game/index.html` からは H キー / 「HOI4 大戦略」で開く）。
ビルド不要（ネイティブ ES Modules）。新しい CSS は `game/css/systems.css` のみで、`hoi4.html` が読み込む。

| システム | ロジック | データ | UI | スタイル |
| --- | --- | --- | --- | --- |
| 作戦計画 | `js/battle-plan.js` | `js/map-data.js`（州・隣接・地形） | `js/ui/battle-plan-ui.js` + `js/map-engine.js` | `css/systems.css`（`.plan-*`） |
| 国家方針報酬 | `js/effects.js` / `js/national-focus.js` / `js/research.js` | `js/data/major-focuses.js` | `js/ui/screens3.js`（focus） | 既存 `steel-ui.css` |
| 兵器設計 | `js/designers.js` | `js/data/equipment.js` | `js/ui/designer-ui.js` | `.eqd-*` |
| ドクトリン | `js/doctrine.js` | `js/data/doctrines.js` | `js/ui/doctrine-ui.js` | `.doc-*` |

---

## 1. 作戦計画（Battle Plans）

### データ構造

作戦計画は `state.battlePlans` に配列で保持される（国ごとに `tag` で絞り込み）。

```js
{
  id: 'plan-xxxx',
  tag: 'GER',
  name: '第1軍集団 作戦計画',
  frontline: ['ger_berlin', 'ger_east_prussia', ...], // 前線州（描画順に整列済み）
  autoFront: true,                  // 占領で前線を自動更新するか
  divisions: ['div-GER-1', ...],    // 配属師団ID（最大 24）
  goals: [                          // 攻撃線（矢印）
    {
      id: 'goal-xxxx',
      fromId: 'ger_east_prussia',   // 前線側の起点
      targetId: 'pol_warsaw',       // 敵領の目標州
      path: ['ger_east_prussia', 'pol_warsaw'], // Dijkstra の経路
      done: false,
    },
  ],
  orders: {                         // 師団ごとの進軍状態
    'div-GER-1': { goalId, path, idx, progress, waiting },
  },
  planning: 0.18,                   // 計画準備ボーナス（0.0〜0.6）
  stance: 'prepare' | 'hold' | 'advance',
  executing: false,
  lastMessage: '',
}
```

### 主要 API（`BattlePlanManager`）

| メソッド | 説明 |
| --- | --- |
| `createPlan({name, autoFront})` | 計画を作成し、前線と師団を自動配置 |
| `autoFrontline(planId)` | 敵と陸接する**自国州**から前線を自動生成 |
| `setFrontline(planId, ids)` / `toggleFrontlineProvince(planId, id)` | 前線の設定・塗り足し/解除 |
| `addGoal(planId, provinceId)` | 前線から Dijkstra で経路探索し攻撃線を追加（最大4本） |
| `assignDivisions(planId, ids?)` | 師団を前線へ配置（省略時は利用可能師団を自動配分） |
| `execute(planId)` / `halt(planId)` | 計画実行 / 停止（停止時は交戦も解除） |
| `tick(hours)` | 1時間ぶんの計画準備・進軍・戦闘を処理 |
| `status(plan)` | UI 用スナップショット（planning / 師団数 / 交戦数 …） |
| `maxPlanningBonus()` | 上限 = `min(0.60, 0.30 + doctrine.maxPlanningBonus())` |

### 計算式

- **計画準備**: 前線＋攻撃線があり未実行なら `+0.06/日 × ドクトリン planningSpeed`、実行中は `-0.22/日`。
  上限は基本 30%（ドクトリン・国家方針 `add_max_planning_bonus` で最大 60%）。
- **移動時間**: `MOVE_HOURS_BASE(8h) × 地形 moveCost ÷ (師団速度 × 補給)`。
- **戦闘幅**: 地形ごとに同時攻撃できる師団数（平地 6 / 森林 4 / 山地 3 …）を超えた師団は予備。
- **攻撃力**: `Σ 師団基本攻撃 × 組織率係数 × (1 + 計画準備) × ドクトリン補正 × 精神補正`。
- **守備隊**: `power = (18 + VP×2.6) × (1 + 地形防御)`、`org = 70 + VP×4`。
- 防御組織力が 0 になると占領 → `province.tag` を更新し `province-captured` を発火、
  陸軍 XP を +12、前線を自動更新（`autoFront` 時）。

### マップ操作（`BattlePlanUI`）

- マップ左の `.plan-panel`：軍集団セレクト / 計画準備バー / 前線・攻撃線モード / 計画実行ボタン。
- 「前線を引く」→ 自国州をクリック or ドラッグで塗る（クリックは追加/解除のトグル）。
- 「攻撃線を引く」→ 敵州をクリック or ドラッグで攻撃線を追加。経路は自動計算。
- 描画は `mapEngine.renderBattlePlans()`：前線ポリライン（`.plan-frontline`）、
  攻撃線 `<path>` + 矢印マーカー（`#plan-arrow-player`）、計画準備ラベル。
- 交戦中は `state.combatBubbles` 経由で戦闘バブルが表示される。

---

## 2. 国家方針（National Focus）の completion_reward

`js/data/major-focuses.js` の `MAJOR_FOCUSES` に 7 カ国 × 9 ノード（計 63）を定義。
全ノードが `cost: 70`（日）と `completion_reward` / `reward_description` を持つ。

```js
{
  id: 'ger_focus_6', tag: 'GER', title: 'アンシュルス', x: 2, y: 2,
  cost: 70, prerequisites: ['ger_focus_3', 'ger_focus_5'],
  completion_reward: {
    annex: 'AUS',
    add_political_power: 50,
    add_ideas: { id: 'ostmark', name: 'オストマルク', modifiers: { manpower: 0.05 } },
    add_army_xp: 40,
  },
  reward_description: 'オーストリアを併合／政治力 +50 …',
}
```

### 対応エフェクト（`EffectEngine.set(key, fn)`）

| キー | 内容 |
| --- | --- |
| `add_political_power` / `add_stability` / `add_war_support` / `add_manpower` | 数値加算 |
| `add_civilian_factories` / `add_military_factories` / `add_dockyards` / `add_convoys` / `add_fuel` | 生産基盤 |
| `add_research_bonus` / `research_bonus` / `add_tech_bonus` | `{scope:'tech'|'category'|'any', match, reduction:0.5, uses}` |
| `add_research_slot` | 研究枠 +N |
| `add_army_xp` / `add_navy_xp` / `add_air_xp` / `add_doctrine_xp` | ドクトリンXP |
| `add_max_planning_bonus` | 計画準備上限 +N |
| `add_ideas` / `add_country_spirit` / `remove_country_spirit` | 国家的精神（`state.politics.spirits` → `state.getModifier(key)`） |
| `annex` / `annex_country` | `EffectEngine.annexCountry(tag, {force:true})`（既存の併合処理を再利用） |
| `puppet` | `PoliticsManager.createPuppet(tag)` |
| `create_wargoal` | `state.warGoals[tag] = {justified, type, at}` |
| `add_core` / `add_opinion` / `add_world_tension` / `add_equipment` | 補助 |

研究ボーナスは `state.addResearchBonus()` に積まれ、`ResearchManager.researchDays()` が
`days × (1 - reduction)` で短縮。消費は研究完了時に `state.consumeResearchBonus(id)`。

国家的精神の補正は以下で実際に使用される：
`factoryOutput`（`economy.js` の生産量）、`researchSpeed`（研究日数）、
`soft` / `breakthrough` / `org` / `defense`（作戦計画の戦闘計算）。

---

## 3. 兵器設計（Equipment Designer）

### データ

```js
// TANK_CHASSIS / NAVAL_HULLS / AIRFRAMES
{ id: 'medium_2', name: '改良型中戦車シャシー', year: 1940, tier: 'medium',
  requires: 'improved_medium_tank_chassis',   // 研究ID（配列も可）
  armor: 50, speed: 9, reliability: 0.85, cost: 4.5, hp: 32, weight: 18, icon: '…' }

// TANK_MODULES / NAVAL_MODULES / AIR_MODULES（スロット → 配列）
{ id: 'medium_cannon', name: '中口径砲', requires: ['artillery2'],
  stats: { softAttack: 22, hardAttack: 10, piercing: 40 },
  cost: 1.2, weight: 2.5 }
```

- `requirementsOf(kind, slot, id)` が文字列/配列の `requires` を配列へ正規化。
- 研究済み判定は `EquipmentDesigner.isResearched(techId)`（`state.researched` / 研究マネージャ）。
- 船体は `navalSlotCaps(hullId)` でスロット上限（例：駆逐艦は主砲1・魚雷2）を決定。
- 最終ステータスは `calcTankStats / calcNavalStats / calcAirStats` が純関数で算出し、
  `designer.stats(kind)` / `validate(kind)` / `saveTankDesign(name)` などを通じて UI と保存に使う。

### UI（`renderTankDesigner` / `renderNavalDesigner` / `renderAirDesigner`）

3カラム構成（ベース選択 / スロット＋モジュールパレット / ステータス＋保存）。

- モジュールは **ドラッグ＆ドロップ** と **クリック** の両対応（タッチ・キーボードでも操作可）。
- 未研究モジュールは 🔒 表示で装着不可、ツールチップに必要技術IDを表示。
- ステータスはベース値との差分を色付き（良/悪）で表示。生産コスト・信頼性・重量も反映。
- 単選スロット（主砲など）は空にできず、別モジュールを選ぶと置換。

---

## 4. ドクトリンツリー

### データ（`js/data/doctrines.js`）

```js
{ id: 'land_gbp_2a', branch: 'land', route: 'gbp', tier: 2,
  icon: 'game/assets/doctrine/land/Prepared_Defense.png',
  x: 1, y: 2,                          // ツリー上のグリッド座標
  cost: 100,                           // 陸軍XP
  requires: ['land_gbp_1'],
  group: 'gbp_t2',                     // 同一groupは相互排他
  effects: { defense: 0.10, org: 0.05 } }
```

- 10 ルート（陸4 / 海3 / 空3）、42 ノード。すべてローカルPNGアイコン。
- `DOCTRINE_ROUTES[branch]` に `[{id, name, desc, icon}]`。
- コストは tier に応じて 40 / 70 / 100 / 140 XP。

### ルール（`DoctrineManager`）

- `pickRoute(branch, routeId)`：ルート選択は**不可逆**。ノード取得後は変更不可。
- ルート選択後、他ルートのノードは `reason:'route-locked'` で恒久ロック。
- `take(branch, nodeId)`：`canTake()` の判定（取得済み / ルート / XP / group排他 / 前提）を通った場合のみ、
  **XPを消費**して解禁。XP は `state.xp.army|navy|air` が正で、`state.doctrine.xp` はミラー。
- `tick(branch, hours)`：時間経過でXPが微増（陸 1.2/日 + 師団数×0.02、海空 0.8/日）。
  演習ボタン（政治力25 → XP+30）や国家方針報酬、占領（+12）でも増える。
- `effects(branch)` / `allEffects()`：取得済みノードの効果を合算。
- 適用先：`CombatSimulator`（`cfg.doctrine`）、作戦計画の攻撃力、
  `maxPlanningBonus()` / `planningSpeedMultiplier()`、`applyToDivisionStats()`。

### UI（`renderDoctrineScreen`）

- 陸/海/空タブ＋XPバー＋演習ボタン。
- ルートカード（選択・ロック・取得済み表示）。
- SVG の接続線（前提）＋ HTML ノード（`<img src="game/assets/doctrine/…">`）。
- ノードクリックで詳細カード（効果内訳・前提・習得ボタン）を表示。
- 取得済みノードは緑、ルート外はグレー、習得可能は金枠。

---

## 検証

```bash
# ロジック回帰テスト（17件）
cd /home/user/iekei1 && node --test game/tests/systems.test.mjs

# 既存テスト
node --test game/tests/*.cjs

# 起動確認
python3 -m http.server 8765   # → http://localhost:8765/hoi4.html?nation=GER
```

`game/tests/systems.test.mjs` は DOM を使わずに、以下を検証する：
技術ID整合 / ドクトリンアイコン・前提 / 全63方針の報酬実行 / 研究ボーナス短縮 /
装備の研究ロック / ステータス差分 / スロット上限 / ルート排他 / XP消費 /
戦闘計算への反映 / 前線自動生成 / 経路探索 / 計画準備の増減 / 実行→占領 / 停止。
