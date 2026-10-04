# HOI4 Tech Tree Converter

HOI4 の Paradox script 形式の技術ファイル (`*_techs.txt`) とスプライト定義ファイル (`Technologies.txt`) を、本ゲームの JSON 技術ツリーデータに変換するツール。

## できること

- HOI4 の技術定義 (technologies = { ... }) を JSON 配列に変換
- スプライト定義 (spriteTypes) から技術 → 画像のマッピングを自動解決
- 保存済みの `game/assets/technology/` と `game/assets/equipment/` のPNGを共通マッピングから解決（ファイル名の大文字小文字を保持）
- `path.leads_to_tech` から `prerequisites` を自動構築（逆向きに変換）
- air / armor / artillery / naval / infantry / engineering / industry など任意のツリーに流用可能
- 全国の `tec/data/` ディレクトリへ一括配置 (`--deploy`)

## 全国家共通の技術ツリー

ゲーム内の7分野は、全7か国で同じ技術・年代・研究日数・前提関係を使います。

| 分野 | 技術数 | 編集元 |
| --- | ---: | --- |
| 歩兵 | 56 | `common-tech-tree.mjs` |
| 装甲 | 26 | 同上 |
| 砲兵 | 16 | 同上 |
| 海軍 | 60 | 同上 |
| 航空 | 41 | `hoi4-source/bba_air_techs.txt` |
| 工学 | 23 | `common-tech-tree.mjs` |
| 産業 | 35 | 同上 |

合計257技術。航空は提供されたHoI4定義を変換し、その他6分野はこのゲーム向けに作成したHoI4風の構成です。原作の全DLC・全バージョンの完全再現ではありません。`effects` は既存の技術詳細で表示する説明であり、この生成処理が新しい生産補正や装備解禁ルールを追加するわけではありません。

`game/` から実行:

```bash
# 画像・ID・前提技術・循環の検査のみ（ファイルは変更しない）
node tools/build-common-tech-trees.mjs --check

# tools/hoi4-output/ に7分野のJSONを出力
node tools/build-common-tech-trees.mjs

# 上記出力と全7か国の tec/data/ を一括更新
node tools/build-common-tech-trees.mjs --deploy
```

全分野の検査が完了してから書き込みます。画像や元の航空定義を更新したら、画像マッピングの再構築後にこの一括生成を実行してください。

旧国家固有ツリーのIDは `legacy-research-ids.json` で同種画像・近い年代の共通技術に対応付けています。生成JSONの `legacy_ids` を使い、セーブ読み込み時に研究済み技術・研究中の進捗率を移行します。旧技術から移行する場合は必要な前提も研究済みにします。廃止された不明IDや重複した研究スロットは除外します。厳密に同一の装備への移行ではなく、共通ツリー内の相当技術への移行です。

## 必要なファイル

| ファイル | 説明 |
|---------|------|
| `*_techs.txt` | HOI4 の技術定義ファイル (例: `air_techs.txt`, `armor_techs.txt`) |
| `Technologies.txt` | HOI4 のスプライト定義ファイル (GFX名 → 画像ファイルの対応表) |

## 使い方

以下は `game/` ディレクトリから実行してください（ツールの実際の場所は `game/tools/` です）。

### 1. 単一ファイルに出力

```bash
node tools/hoi4-tech-converter.mjs \
  --tech    tools/hoi4-source/air_techs.txt \
  --sprites tools/hoi4-source/Technologies.txt \
  --output  ger/tec/data/tech_air.json \
  --category air
```

### 2. 全国の tec/data に一括配置

```bash
node tools/hoi4-tech-converter.mjs \
  --tech    tools/hoi4-source/air_techs.txt \
  --sprites tools/hoi4-source/Technologies.txt \
  --category air --deploy
```

### 3. 画像の存在確認のみ

```bash
node tools/hoi4-tech-converter.mjs \
  --tech    tools/hoi4-source/air_techs.txt \
  --sprites tools/hoi4-source/Technologies.txt \
  --category air --check-images
```

## 他のツリー（armor など）への流用

HOI4 の `armor_techs.txt` などのファイルを入手したら、同じツールで変換できます:

```bash
node tools/hoi4-tech-converter.mjs \
  --tech    tools/hoi4-source/armor_techs.txt \
  --sprites tools/hoi4-source/Technologies.txt \
  --category armor --deploy
```

## 変換マッピング

| HOI4 フィールド | JSON フィールド | 変換内容 |
|----------------|----------------|---------|
| 技術名 (キー名) | `id` | そのまま |
| 技術名 | `title` | humanize (snake_case → Title Case) |
| `start_year` | `year` | そのまま |
| `folder.position.x` | `x` | ×100 (レイアウト関数はソート用途のみ) |
| `folder.position.y` | `y` | ×50 |
| `research_cost` | `research_time` | ×100 (HOI4基準値) |
| `path.leads_to_tech` | `prerequisites` | 逆方向に変換 (A→B を B の前提 = A に) |
| `enable_equipments` | `effects` | "配備可能: <装備名>" |
| `categories` | `effects` | "カテゴリ: <カテゴリ一覧>" |
| スプライト `GFX_<tech>_medium` | `asset_key` | 共通マッピングで解決した画像キー (拡張子なし) |

### 画像解決の仕組み

1. `Technologies.txt` の `GFX_<techId>_medium` → texturefile を読み取ります。
2. `research-icon-catalog.js` がスプライト名・技術ID・PNG/DDS名を共通キーに正規化します。
3. `assets/mappings/technology_icons.json` / `equipment_icons.json` の保存済みPNGを参照します。例: `AT_1_allies.dds` → キー `at_1_allies` → 実ファイル `AT_1_allies.png`。
4. 国家固有の技術ID（`kar98k` など）は `tools/research-icon-overrides.json` の共通兵種画像を使います。この画像対応は旧IDの表示にも利用できます。現行の共通ツリーは上記の一括生成ツールで管理します。
5. 本ゲームの研究画面とドイツ・ソ連の単独技術画面が同じ対応表を使います。既存JSONの `asset_key` が大文字・小文字混在でも読み込めます。

画像不足時は技術IDとキーを表示して終了コード1で停止し、出力先や全国のJSONを上書きしません。カテゴリの代替アイコンで不足を隠してチェックを通すことはありません。

### PNGを追加・対応表を更新するとき

PNGを元のファイル名のまま `assets/technology/` または `assets/equipment/` に配置し、必要なら `tools/research-icon-overrides.json` に `"技術ID": "共通画像キー"` を追加します。その後、次を実行してください。

```bash
node tools/rebuild-research-icons.mjs
node tools/hoi4-tech-converter.mjs \
  --tech tools/hoi4-source/bba_air_techs.txt \
  --sprites tools/hoi4-source/Technologies.txt \
  --category air --check-images
```

再構築はローカルPNGと付属 `Technologies.txt` から行い、画像の取得・改名は行いません。未保存画像を一覧へ残さず、毎回同じ入力から同じJSONを生成します。現在ゲームが使用している航空ツリーは `bba_air_techs.txt` です。全国へ反映する場合は確認後に `--check-images` を `--deploy` に置き換えてください。通常の `air_techs.txt` も変換できますが、航空ツリーの内容が置き換わります。

検証（リポジトリルートから）:

```bash
node --test game/assets/test-research-tree.cjs game/assets/test-research-icons.cjs game/assets/test-common-tech-trees.cjs game/tests/strategy.test.cjs
```

### スキップされる技術

- `folder` エントリがない技術（空母バリアント `cv_*` などのサブ技術）はスキップ
