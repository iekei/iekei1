# HOI4 Tech Tree Converter

HOI4 の Paradox script 形式の技術ファイル (`*_techs.txt`) とスプライト定義ファイル (`Technologies.txt`) を、本ゲームの JSON 技術ツリーデータに変換するツール。

## できること

- HOI4 の技術定義 (technologies = { ... }) を JSON 配列に変換
- スプライト定義 (spriteTypes) から技術 → 画像のマッピングを自動解決
- 画像パスは `game/assets/technology/<basename>.png` に対応
- `path.leads_to_tech` から `prerequisites` を自動構築（逆向きに変換）
- air / armor / artillery / naval / infantry / engineering / industry など任意のツリーに流用可能
- 全国の `tec/data/` ディレクトリへ一括配置 (`--deploy`)

## 必要なファイル

| ファイル | 説明 |
|---------|------|
| `*_techs.txt` | HOI4 の技術定義ファイル (例: `air_techs.txt`, `armor_techs.txt`) |
| `Technologies.txt` | HOI4 のスプライト定義ファイル (GFX名 → 画像ファイルの対応表) |

## 使い方

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
| スプライト `GFX_<tech>_medium` | `asset_key` | texturefile のベース名 (拡張子なし) |

### 画像解決の仕組み

1. `Technologies.txt` から `GFX_<techId>_medium` → texturefile basename を構築
2. 例: `GFX_fighter1_medium` → `fighter1.dds` → `asset_key = "fighter1"`
3. 例: `GFX_interwar_antitank_medium` → `AT_1_allies.dds` → `asset_key = "AT_1_allies"`
4. ゲーム側の `ResearchIcons.resolve()` が `asset_key` で `assets/technology/<asset_key>.png` を検索

### スキップされる技術

- `folder` エントリがない技術（空母バリアント `cv_*` などのサブ技術）はスキップ
