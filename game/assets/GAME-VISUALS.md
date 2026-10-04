# ゲーム画面のローカル画像

`game-visuals.js` と `game-visuals.css` が国旗、人物、特別研究の参考設計図、師団アイコンを表示します。ファイル名の大小文字を保持し、AssetRegistry経由で画像URLを生成します。

## 画像と日本語名の追加

1. 画像を既存の `flags/`、`operatives/`、`scientists/`、`special_projects/`、`land_units/` に配置します。
2. 人物の名前は `game/tools/person-names-ja.json` に追加します。キーは画像ファイル名の人物部分です。
3. リポジトリルートで `node game/tools/build-game-visuals.mjs` を実行します。

生成される `game-asset-data.js` は、保存済みファイルのみを含みます。人物名が未登録の場合は生成を中止します。画像の取得や改名は行いません。

## 国旗

全国家で同じ解決処理を使い、政体指定のPNG → 基本PNG → 保存済みの政体別PNGの順で選びます。ゲームの `democracy` はファイル名の `democratic` に対応します。自国の政体はゲーム状態、他国は既存の政体設定を参照します。政体未設定の国家は基本旗、または保存済みの中道旗を優先します。

HTML表示には `DataFetcher.getCountryFlagImage`、ログ・通知には `getCountryFlag` の `[TAG]` マーカーを使います。ログ内の他のテキストはHTMLとして解釈しません。

## 諜報員

71件のアップロード済み肖像に日本語名を対応付けています。養成画面は自国に対応するファイルを先頭に並べ、人物を選択できます。ファイルの国コードは画像の分類であり、人物の出身国を断定するものではありません。

採用したIDは `intel.recruiting[].operativeId` → `intel.roster[]` に引き継ぎ、既存のセーブ機構で保存されます。同一人物の重複採用は防止します。旧セーブの匿名諜報員・養成中の人物にもIDを補います。

## 科学者と参考設計図

75件の科学者肖像に日本語名を対応付けています。既存の特別研究は `GameVisuals.scienceLinks` で本人の肖像と関連する設計図を指定します。データの `portrait_id` で追加登録した科学者を指定することもできます。

既存27名のうち本人の画像がある7名にはその肖像を使います。残り20名には `Portrait_generic_europe_male_04_scientist.png` を使い、「本人画像未収録・汎用肖像」と表示します。他の実在人物の写真を本人として表示しません。既存の研究者名と研究の内容は保持します。

ブループリントは `special_projects/` の保存済み画像を使います。元の研究内容に完全一致する画像がない場合もあるため、画面では「関連分野の参考設計図」と明記します。

## 師団アイコン

`GameVisuals.unitFiles` が兵種と `land_units/` の画像を対応付けます。歩兵・山岳兵など専用画像がない兵種には、保存済みの民兵・突撃部隊など近い区分の画像を割り当てています。

表示枠は横76pxで `overflow:hidden`。元画像が152pxなら縮小せず左側の0～75pxを表示します。現時点の28画像はすべて76px以下の緑色版なので、さらに半分にはしません。元PNGは変更しません。

## 確認

```bash
node --test game/assets/test-game-visuals.cjs game/tests/strategy.test.cjs game/assets/test-research-tree.cjs
```
