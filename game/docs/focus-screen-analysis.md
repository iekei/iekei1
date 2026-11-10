# 国家方針画面の分析 (National Focus Tree)

対象: `game/index.html` の `FocusTreeManager` (約 1579–2170 行)、`tpl-focus` テンプレート、
`assets/focus-routing.js`、`assets/hoi4-effects-config.js`、`assets/nf-reward-loader.js`、
`assets/completion-reward.js`、各国 `data/*_nf_batch*.json` / `data/localisation/`。

---

## 1. データ構造（スキーマ）

方針 1 件は HoI4 の focus をそのまま JSON 化した形。`DataFetcher.fetchFocusTree(tag)` が
`<tag>/data/*.json` を国別パス配列で読み、`flat()` して 1 本の配列にする。

```jsonc
{
  "id": "GER_rhineland",              // 一意。ファイル横断でキーになる
  "title": "ラインラント進駐",          // フォールバック表示名 (日本語)
  "x": 350, "y": 50,                  // データ座標 (ピクセル)。描画で min を引いて正規化
  "cost": 70,                         // 必要日数。無指定は 70
  "days": 70,                         // 旧フィールド。現在は未使用 (cost のみ参照)
  "prerequisites": ["GER_xxx"],        // 前提方針 ID (未完了だと locked)
  "mutually_exclusive": ["GER_ostwall"],// 排他。双方向に書く必要あり
  "completion_rewards": [              // 完了報酬の配列
    { "type": "add_political_power", "value": 120 },
    { "type": "add_building_construction", "state": 64, "building": "arms_factory", "level": 2 }
  ],
  "effect": "政治力: +50 研究スロット: +1", // 旧来の自由文。一部は正規表現で適用
  "loc_key": "GER_rhineland",           // ローカライズキー (任意)
  "desc_key": "...", "country": "GER"
}
```

- **キー**: `completion_rewards`・`effect`・`id`・`loc_key`・`mutually_exclusive`・`prerequisites`・`title`・`x`・`y`・`country`・`cost`・`days`。
- **報酬型は 12 種類**（全 7 カ国 1,659 方針の集計）:
  `add_political_power` 1,348 / `add_building_construction` 330 / `add_tech_bonus` 154 /
  `add_army_experience` 76 / `add_air_experience` 60 / `add_world_tension` 58 /
  `add_stability` 49 / `create_wargoal` 41 / `add_navy_experience` 37 /
  `add_manpower` 17 / `add_war_support` 15 / `annex_country` 5。
- **国別ボリュームと前提の有無**:

  | 国 | 方針数 | ルート (前提なし) | 排他 | 報酬なし |
  |---|---|---|---|---|
  | GER | 126 | 6 | 2 | 0 |
  | SOV | 636 | 16 | 0 | 311 |
  | JAP | 103 | 7 | 0 | 0 |
  | USA | 136 | 5 | 0 | 0 |
  | ENG | 159 | 7 | 0 | 0 |
  | FRA | 185 | 6 | 0 | 0 |
  | ITA | 314 | 10 | 0 | 0 |
  | **計** | **1,659** | 57 | **2** | 311 |

  → 排他分岐はゲーム全体で **GER の「大西洋の壁 ⇔ 東の壁」1 組だけ**。SOV の 311 件は報酬空
  （純粋な中継ノード、または変換漏れ）。
- **コスト**: GER/JAP/USA/ENG/FRA/ITA は全件 `cost: 70`。SOV だけ `70` が 325 件、`10` が 190 件、
  `5` が 120 件、`12` が 1 件という不均一な値（HoI4 側の focus 定義をそのまま取り込んだ名残）。
- **報酬の正規化**: `assets/nf-reward-loader.js` が起動時に `completion_rewards` を補完し、
  `assets/completion-reward.js` が旧 `effect` 文字列から報酬を推定する。ツールチップと適用の両方が
  `window.HOI4EffectsConfig.formatEffect / applyEffect` を通るため、表示と実効果は一致する。

## 2. 描画 (render)

`tpl-focus` は `pane-fill` の 900×640 ウィンドウで、中身は 3 層:

```
#focus-tree-container        … スクロール領域 + 背景グラデーション
  #focus-tree-zoom-controls  … −/100%/＋ (sticky, 右下)
  #focus-tree-viewport       … ズーム後の外形サイズ
    #focus-tree-content      … transform: scale(zoom); transform-origin: top left
      svg#focus-svg-lines    … 接続線 (直角ルーティング、pointer-events: none)
      #focus-nodes           … .focus-node を left/top で絶対配置
#focus-tooltip               … position: fixed (コンテナ外)
```

- **座標**: `x/y` の最小値を引き、`margin 50px` を足して 140×78 のノードを置く。
  `focusBounds` から content / viewport / svg のサイズを決める。**データ座標は並び順のヒントで、
  依存関係の深さは使っていない**（研究ツリーの `ResearchTreeUI.layout` と対照的）。
- **接続線**: `FocusRouting.route()` が親の下端ポート → 子の上端ポートへ直角パスを引き、
  ルートごとに専用レーンを割り当てて重なりを避ける。色は親が完了なら緑 `#4ac46a`、それ以外 `#3a4a5a`。
- **ノード**: 状態クラス `completed` / `active` / `available` / `locked` の 4 種。
  中身は **タイトル 12 文字で切り詰め**（`…` 付与）+ `📅70日` + アクティブ時のみ進捗バー。
  `tabindex=0` と `aria-label` があり、`pointerenter / focusin` でツールチップ、`click` で選択。
- **アイコンは無い**: `AssetRegistry.getFocusIconUrl(focusId)` が実装済みなのに `render()` は
  一度も呼んでいない（HoI4 の象徴的な方針アイコンが出ない最大の理由）。
- **ズーム**: `zoom` は 0.4–1.5 にクランプ。ボタン以外に `Ctrl+ホイール` / ドラッグ移動は無い。
  中央ボタンは `zoom` を 1 に戻すだけで、選択中ノードへフォーカスする機能は無い。
- **再描画**: `onTick` は進捗が残っている間 `render()` を呼び、さらに `CoreEngine.tick()` 側でも
  `activeFocus` があるたびに `render()` している（**同じ 1 時間に 2 回**）。SOV の 636 ノードでは
  DOM 全再構築が毎時走り、スクロール位置とホバー状態が失われる。

## 3. ツールチップ

`#focus-tooltip` は `document.body` ではなく `tpl-focus` の外（fixed）にあり、`moveTooltip()` が
`clientX+14 / clientY+14` を画面端でクランプする。中身は 3 段:

1. `.tt-title` … `localizedTitle(f)`（`loc_key` → `l10n.t` → `title` の順で解決）
2. `.tt-time` … `必要日数: cost 日`
3. `.tt-effect` … 説明文（`desc_key` → `effect` 文字列）＋ `.tt-effect-label「完了報酬」` ＋
   `formatEffect()` の結果を 1 行ずつ。色は `rewardClass()` が
   `add_ideas / annex_country / add_research_slot / add_tech_bonus / add_building_construction …`
   を positive、`value < 0` を negative、それ以外を neutral に割り当てる。

- **欠けている情報**: 前提方針名、排他相手の名前、未達理由（`getFocusBlockReason()` は
  クリック時に notify するだけでツールチップには出ない）、選択中の排他グループ、
  報酬の「いつ効くか（即時／建設キュー）」。
- **ローカライズ漏れ**: `loc_key` が無い（または辞書に無い）ノードは `title` をそのまま出す。
  SOV には `[GetFinishTheFiveYearPlanName]` のような **スクリプト化トークンが未解決のまま**
  残る箇所がある（`l10n.resolve` は `$KEY$` と `[Token]` を解決するが、辞書に無いと原文のまま）。

## 4. 選択・進行・排他分岐

- `isFocusAvailable(f)`: 完了/ロック済みでない → 排他グループで他を選んでいない →
  （`noChecks` / `autocomplete` デバッグフラグが立っていなければ）全 `prerequisites` が完了。
- `selectFocus(id)`: 同じ方針を再クリックで**中断**。`autocomplete` 時は即完了。
  通常は `chooseExclusiveBranch()` → `activeFocus` 設定 → `focusDaysTotal = cost || 70`。
- `onTick()`: **1 tick (1 ゲーム時間) ごとに `focusProgress++`** し、`focusDaysTotal` に達したら
  `completeFocus()`。つまり **「日数」ではなく「ゲーム内時間」として加算されている**。
  `CoreEngine.tick()` は 1 回で 1 時間進むので、`cost: 70` は現状 **70 ゲーム時間 ≒ 3 日**
  (実時間では速度 5 で約 120 秒) で完了してしまう（下表 #1）。
- `completeFocus()`: 完了集合へ追加 → `applyFocusEffect(f)`（旧 `effect` 文字列の正規表現適用）→
  `getCompletionRewards()` → `applyCompletionRewards()`（HOI4EffectsConfig）→ `DecisionManager.onFocus(f)`。
  完了時は `MultiplayerManager.broadcast({type:'focus_complete'})` で全クライアントへ同期。
- `buildExclusiveGroups()`: `mutually_exclusive` を双方向グラフにして連結成分を作り、
  **成分 ID を `id|id|…` の文字列**として `exclusiveGroupById` に持つ。選択すると
  グループ内の他ノードを `state.locked` に入れ、`clearExclusiveBranch()` で選択変更時に戻せる
  （完了済みが混ざっていると解除しない）。
- **排他が実質 1 組しかない理由**: データ側に `mutually_exclusive` がほぼ無いため。
  UI とロジックは複数グループ対応済みなので、**データを足せばそのまま機能する**。

## 5. 気づいた不整合（修正候補）

| # | 症状 | 原因 | 影響 |
|---|---|---|---|
| 1 | 70 日のはずの方針が **70 ゲーム時間 (約 3 日)** で完了する | `FocusTreeManager.onTick` が `focusProgress++` を毎 tick (= 1 時間) 実行し、`focusDaysTotal` と直接比較 | 全方針が実質 3 日で完了。研究 (日単位) とのテンポが合わない |
| 2 | `days` フィールドが完全に無視される | `cost` のみ参照（`f.cost \|\| 70`） | データの `days: 70` が意味を持たない |
| 3 | 方針アイコンが一切出ない | `AssetRegistry.getFocusIconUrl()` を `render()` が呼んでいない | HoI4 らしさが大きく損なわれる |
| 4 | 排他分岐が 1 組しか体験できない | データの `mutually_exclusive` が GER の 2 件のみ | 分岐選択の面白さが無い |
| 5 | SOV の 311 件が報酬ゼロ | 変換時に `completion_rewards` が空 | 選ぶ意味の薄いノードが多い |
| 6 | SOV に `[GetFinishTheFiveYearPlanName]` 等が露出 | スクリプト化ローカライズ未解決 | タイトルがそのまま記号列で表示される |
| 7 | タイトルが 12 文字で切れる | `titleShort` の固定切り詰め | 長い日本語名が判別不能。ツールチップでしか読めない |
| 8 | SOV の 636 ノードで毎時全再構築 | `onTick` → `render()` | スクロール位置・ホバーが失われ、操作感が悪い |
| 9 | 前提・排他の説明がツールチップに無い | `showTooltip` が報酬だけ整形 | なぜ選べないのか分からない |
| 10 | 座標が依存関係と無関係 | `x/y` をそのまま使い、深さで再配置していない | データ次第で線が交差・逆流する（`focus-routing` が緩和） |

## 6. 改善提案（優先順）

1. **進行速度の修正**（#1）: `focusProgress` を「時間」で持つなら `focusDaysTotal * 24`、
   あるいは 1 日 1 回だけ加算する `lastFocusDay` ガードを入れる。既存セーブは
   `progress` を `×24` して移行する。
2. **アイコンの復活**（#3）: `node.innerHTML` に `AssetRegistry.getFocusIconUrl(f.id)` の
   `<img class="fn-icon">` を追加。失敗時は `ResearchIcons.fallback` 相当の SVG にフォールバック。
3. **ツールチップの情報量**（#9）: 前提名・排他相手・未達理由・報酬の適用タイミングを追加。
4. **差分描画**（#8）: `onTick` では進捗バーの `style.width` と状態クラスだけ更新し、
   構造変更（完了・選択）時のみ全 `render()`。
5. **データ整備**（#4/#5/#6）: SOV の報酬空ノードに `add_political_power` 等を補完、
   スクリプト化トークンの解決、各国の `mutually_exclusive` 追加。
6. **タイトル折り返し**（#7）: 12 文字切り詰めをやめ、`-webkit-line-clamp: 2` で 2 行表示。
7. **キーボード/マウス操作**（§2 ズーム）: ホイールズーム、中ドラッグのパン、
   選択ノードへのセンタリング。

---

### 参考: 関連ファイル

- `game/index.html` … `FocusTreeManager`（描画・ツールチップ・排他・報酬適用）、`tpl-focus`
- `game/assets/focus-routing.js` … 直角コネクタのルーティング
- `game/assets/hoi4-effects-config.js` … `formatEffect` / `applyEffect` / `buildRewardsFromFocus`
- `game/assets/nf-reward-loader.js` / `completion-reward.js` … 報酬の補完・正規化
- `game/{ger,sov,jap,usa,eng,fra,ita}/data/*.json` … 方針データ（計 1,659 件）
- `game/data/localisation/japanese/*_focus_l_japanese.yml` … 方針名・説明の辞書
