# game/index.html: 国家方針・報酬・諜報機関

対象は将軍カードゲーム `game/index.html`。ルートの `hoi4.html` / `game/js/` の別ゲームは変更していません。ビルド不要です。

## 読み込み

- `assets/hoi4-effects-config.js` の後に `assets/completion-reward.js` を読み込み、既存の `applyEffect` / `formatEffect` を拡張します。
- `assets/focus-routing.js` は国家方針カードの境界を障害物とする直交可視グリッドを構築し、A*で経路を求めます。座標はズーム前のツリー内座標です。分岐は共通幹線を共有する場合があります。カードが重なる不正な入力では、経路がなければ警告し、カードを貫通する線は描きません。
- `assets/intelligence-agency.js` は既存の `IntelOperations` に接続します。永続データは `CoreEngine.gameState.intel` に格納します。`agencyLastDay` により同日24回の時刻Tickを一度の日次処理にまとめます。
- CSSは `assets/intelligence-agency.css`。HTMLパネルは既存の `#intel-content` に描画します。

## 報酬API

```js
const rewards = parseCompletionReward(`completion_reward = {
  add_political_power = 50
  add_stability = 0.05
  42 = {
    add_extra_state_shared_building_slots = 1
    add_building_construction = {
      type = industrial_complex
      amount = 2
    }
    add_core_of = GER
  }
}`);
for (const reward of rewards) {
  console.log(CompletionReward.format(reward).text);
  CompletionReward.apply(CoreEngine.gameState, reward);
}
```

解析は順序・同名コマンドの繰り返し・コメント・引用文字列・数値州スコープ・国家タグスコープを保持します。スクリプトの安定度 `0.05` は既存ゲームの0〜100単位へ変換し、`5` として正規化します。従来のJSON報酬の百分率は変換しません。

建設は州の `b` と国家の工場数へ反映します。枠外施設は `offsiteBuildings`、研究特典は既存の `techBonuses`、装備は生産管理の備蓄へ反映します。州未指定での中核化・請求権・スロット追加は対象を推測せず `unappliedRewards` に保持します。

**スクリプトエンジンの境界:** 指定された効果コマンドの実装であり、Paradoxの全トリガー・変数・イベント実行環境ではありません。`if` / `random_list` / 州イテレーターなどはツールチップに未対応警告を出し、内部の報酬を無条件適用しません。国家タグスコープは `countryEffects[TAG]` に隔離します（別プレイヤーへの遠隔効果配信は行いません）。ローカライズ未登録の識別子は元のIDを表示します。

## 諜報機関

1. 設立後「機関本部」で5部門を開発。民需5工場を30日予約し、完了時に解放します。
2. 「諜報員・任務」で自国の既存ポートレイト付き候補を養成し、諜報員→対象国→任務の順で選択します。防諜は自国・同陣営国のみです。
3. 「作戦」で必要網強度を満たす作戦の準備モーダルを開き、重複しない1〜2名を指定します。歩兵装備500・支援装備100は開始時に一度だけ消費します。中止時の返却はありません。
4. 「暗号解読」で対象国を指定して解読を開始。解読力5/日（暗号部門取得後10/日）を敵暗号強度（既定600）まで蓄積します。暴露後は対象国に30日間、攻撃効率+15%を適用します。

ゲームに合わせた簡略化ルールです。作戦の成功率・工場費用等は本家の全DLC/バージョンの値を再現するものではありません。捕獲状態の表示と任務禁止は実装済みですが、救出作戦は対象外です。プロパガンダ/政党支持/協力度/サボタージュは `countryEffects[TAG]` に保持します。サボタージュ対象の国家状態に同データがある場合、生産出力を30日間25%減少します。マルチプレイでの敵プレイヤー状態への効果配送・ホスト検証は別途必要です。

## 検証

```sh
node --test game/tests/*.test.cjs game/tests/*.test.mjs
```

追加テストは `game/tests/reward-agency.test.cjs`。7大国の実データで全接続が得られ、直交し、他カードの内部を通らないこと、コマンドの状態更新と説明、日次工場予約、暗号暴露期限、作戦装備消費・捕獲を検証します。
