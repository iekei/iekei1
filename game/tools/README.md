# HOI4 Tech Tree Converter

HOI4 の Paradox script 形式の技術ファイル (`*_techs.txt`) とスプライト定義ファイル (`Technologies.txt`) を、本ゲームの JSON 技術ツリーデータに変換するツール。

## できること

- HOI4 の技術定義 (technologies = { ... }) を JSON 配列に変換
- スプライト定義 (spriteTypes) から技術 → 画像のマッピングを自動解決
- 保存済みの `game/assets/technology/` と `game/assets/equipment/` のPNGを共通マッピングから解決（ファイル名の大文字小文字を保持）
- `path.leads_to_tech` から `prerequisites` を自動構築（逆向きに変換）
- air / armor / artillery / naval / infantry / engineering / industry など任意のツリーに流用可能
- 全国の `tec/data/` ディレクトリへ一括配置 (`--deploy`)

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
4. 国家固有の技術ID（`kar98k` など）は `tools/research-icon-overrides.json` の共通兵種画像を使います。国家ごとの研究効果や前提条件は変更しません。
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
node --test game/assets/test-research-tree.cjs game/assets/test-research-icons.cjs
```

### スキップされる技術

- `folder` エントリがない技術（空母バリアント `cv_*` などのサブ技術）はスキップ
