#!/usr/bin/env node
/**
 * HOI4 Tech Tree Converter
 * ============================================================================
 * HOI4 の Paradox script 形式の技術ファイル + スプライト定義ファイルを、
 * 本ゲームの JSON 技術ツリーデータに変換するツール。
 *
 * 画像パスは game/assets/technology/ 内の PNG にマッピングされる。
 * air / armor / artillery / naval / infantry / engineering / industry など
 * 任意の技術ツリーに流用可能。
 *
 * Usage:
 *   node tools/hoi4-tech-converter.mjs \
 *     --tech    tools/hoi4-source/air_techs.txt \
 *     --sprites tools/hoi4-source/Technologies.txt \
 *     --output  ger/tec/data/tech_air.json \
 *     --category air
 *
 *   # 全国の tec/data に一括配置:
 *   node tools/hoi4-tech-converter.mjs \
 *     --tech tools/hoi4-source/air_techs.txt \
 *     --sprites tools/hoi4-source/Technologies.txt \
 *     --category air --deploy
 *
 *   # 画像の存在確認のみ:
 *   node tools/hoi4-tech-converter.mjs \
 *     --tech tools/hoi4-source/air_techs.txt \
 *     --sprites tools/hoi4-source/Technologies.txt \
 *     --category air --check-images
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { resolve, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = resolve(__dirname, '..');

// ── 国コード → tec/data ディレクトリ ──
const COUNTRY_DIRS = {
  GER: 'ger/tec/data',
  SOV: 'sov/tec/data',
  JAP: 'jap/tec/data',
  USA: 'usa/tec/data',
  ENG: 'eng/tec/data',
  FRA: 'fra/tec/data',
  ITA: 'ita/tec/data',
};

// ============================================================================
//  Paradox Script Parser
// ============================================================================

/**
 * HOI4 の Paradox script 形式をパースする汎用パーサー。
 * - コメント (# ...) を除外
 * - クォート文字列 "..." を処理
 * - ネストされたブロック { ... } を再帰的にパース
 * - 同名キーの複数出現を配列に変換
 * - ブロック内の bare value（key= ではない値）を __items__ に集約
 * - yes/no → boolean, 数値 → number に変換
 */
class ParadoxParser {
  constructor(text) {
    // コメントを削除（行末の # 以降）
    this.text = text.replace(/#[^\n]*/g, '');
    this.tokens = this.#tokenize();
    this.pos = 0;
  }

  #tokenize() {
    const tokens = [];
    let i = 0;
    const s = this.text;
    while (i < s.length) {
      // 空白をスキップ
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;

      if (s[i] === '{' || s[i] === '}' || s[i] === '=') {
        tokens.push({ type: 'punct', value: s[i] });
        i++;
      } else if (s[i] === '"') {
        let j = i + 1;
        while (j < s.length && s[j] !== '"') j++;
        tokens.push({ type: 'string', value: s.slice(i + 1, j) });
        i = j + 1;
      } else {
        let j = i;
        while (j < s.length && !/[\s{}=#"]/.test(s[j])) j++;
        tokens.push({ type: 'word', value: s.slice(i, j) });
        i = j;
      }
    }
    return tokens;
  }

  parse() {
    return this.#parseBlockContent(false);
  }

  #parseValue() {
    const token = this.tokens[this.pos];
    if (!token) return null;

    if (token.type === 'punct' && token.value === '{') {
      this.pos++; // skip {
      return this.#parseBlockContent(true);
    }
    if (token.type === 'string') {
      this.pos++;
      return token.value;
    }
    if (token.type === 'word') {
      this.pos++;
      if (token.value === 'yes') return true;
      if (token.value === 'no') return false;
      if (/^-?\d+$/.test(token.value)) return parseInt(token.value, 10);
      if (/^-?\d+\.\d+$/.test(token.value)) return parseFloat(token.value);
      return token.value;
    }
    this.pos++;
    return null;
  }

  #parseBlockContent(expectCloseBrace) {
    const result = {};
    const items = [];

    while (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos];
      if (!token) break;

      if (token.type === 'punct' && token.value === '}') {
        this.pos++; // skip }
        break;
      }

      if (token.type === 'word' || token.type === 'string') {
        // 次のトークンが = なら key = value
        const next = this.tokens[this.pos + 1];
        if (next && next.type === 'punct' && next.value === '=') {
          const key = token.value;
          this.pos += 2; // skip key and =
          const value = this.#parseValue();

          if (key in result) {
            if (Array.isArray(result[key])) result[key].push(value);
            else result[key] = [result[key], value];
          } else {
            result[key] = value;
          }
        } else {
          // bare value
          this.pos++;
          items.push(token.value);
        }
      } else {
        this.pos++; // skip unexpected
      }
    }

    if (items.length) result.__items__ = items;
    return result;
  }
}

// ============================================================================
//  Sprite Mapping Builder
// ============================================================================

/**
 * Technologies.txt (spriteTypes) をパースし、
 * GFX名 → 画像ベース名（拡張子なし）のマッピングを構築する。
 *
 * 例: "GFX_fighter1_medium" → "fighter1"
 *     "GFX_interwar_antitank_medium" → "AT_1_allies"
 */
function buildSpriteMap(spriteFilePath) {
  const text = readFileSync(spriteFilePath, 'utf-8');
  const parsed = new ParadoxParser(text).parse();

  const map = new Map();
  const spriteTypes = parsed?.spriteTypes?.SpriteType;
  if (!spriteTypes) {
    console.warn('⚠ spriteTypes が見つかりません');
    return map;
  }

  const entries = Array.isArray(spriteTypes) ? spriteTypes : [spriteTypes];
  for (const entry of entries) {
    if (!entry?.name || !entry?.texturefile) continue;
    // texturefile: "gfx/interface/technologies/fighter1.dds" → "fighter1"
    const texBase = basename(entry.texturefile, extname(entry.texturefile));
    map.set(entry.name, texBase);
  }

  return map;
}

// ============================================================================
//  Tech Tree Converter
// ============================================================================

/**
 * air_techs.txt などの技術ファイルをパースし、
 * ゲーム用 JSON 配列に変換する。
 */
function convertTechFile(techFilePath, spriteMap, category) {
  const text = readFileSync(techFilePath, 'utf-8');
  const parsed = new ParadoxParser(text).parse();

  const technologies = parsed?.technologies;
  if (!technologies) {
    console.warn('⚠ technologies ブロックが見つかりません');
    return [];
  }

  // ── 前提技術の逆マッピングを構築 ──
  // HOI4では path.leads_to_tech = X は「この技術 → X」を意味する。
  // ゲームでは prerequisites が必要なので、X の前提としてこの技術を登録する。
  const prerequisitesMap = new Map(); // techId → [parentTechId, ...]

  for (const [techId, techData] of Object.entries(technologies)) {
    if (techId === '__items__') continue;
    const paths = Array.isArray(techData?.path) ? techData.path : (techData?.path ? [techData.path] : []);
    for (const p of paths) {
      if (p?.leads_to_tech) {
        const target = p.leads_to_tech;
        if (!prerequisitesMap.has(target)) prerequisitesMap.set(target, []);
        prerequisitesMap.get(target).push(techId);
      }
    }
  }

  // ── 各技術を JSON エントリに変換 ──
  const result = [];

  for (const [techId, techData] of Object.entries(technologies)) {
    if (techId === '__items__') continue;

    // folder がない技術（空母バリアント等のサブ技術）はスキップ
    const folder = techData?.folder;
    if (!folder) continue;

    const pos = folder?.position || {};
    const hoi4X = typeof pos.x === 'number' ? pos.x : 0;
    const hoi4Y = typeof pos.y === 'number' ? pos.y : 0;

    // スプライトから画像キーを解決
    const assetKey = resolveAssetKey(techId, spriteMap);

    // enable_equipments を取得
    const enableEquipments = techData?.enable_equipments?.__items__ || [];

    // research_cost → research_time (HOI4基準値 100日 × cost)
    const researchCost = typeof techData?.research_cost === 'number' ? techData.research_cost : 2;
    const researchTime = Math.round(100 * researchCost);

    // start_year
    const startYear = typeof techData?.start_year === 'number' ? techData.start_year : 1936;

    // prerequisites
    const prerequisites = prerequisitesMap.get(techId) || [];

    // categories
    const categories = techData?.categories?.__items__ || [];

    // effects を構築
    const effects = [];
    if (enableEquipments.length) {
      for (const eq of enableEquipments) {
        effects.push(`配備可能: ${eq}`);
      }
    }
    if (categories.length) {
      effects.push(`カテゴリ: ${categories.join(', ')}`);
    }

    const entry = {
      id: techId,
      title: humanize(techId),
      year: startYear,
      x: hoi4X * 100,
      y: hoi4Y * 50,
      research_time: researchTime,
      reliability: '未研究',
      desc: '',
      asset_key: assetKey,
      effects: effects.length ? effects : ['(効果なし)'],
      prerequisites: prerequisites,
    };

    result.push(entry);
  }

  // x, y でソート（ゲームのレイアウト関数と整合）
  result.sort((a, b) => (a.x || 0) - (b.x || 0) || (a.y || 0) - (b.y || 0));

  return result;
}

/**
 * 技術IDからスプライト名を構築し、画像ベース名を解決する。
 * 試行順: GFX_<techId>_medium → GFX_<techId> → techId (フォールバック)
 */
function resolveAssetKey(techId, spriteMap) {
  const candidates = [
    `GFX_${techId}_medium`,
    `GFX_${techId}`,
  ];
  for (const name of candidates) {
    if (spriteMap.has(name)) {
      return spriteMap.get(name);
    }
  }
  // スプライトに無ければ techId をそのまま画像キーとして使う
  // (assets/technology/<techId>.png が存在すれば解決される)
  return techId;
}

/**
 * 技術名を人間可読なタイトルに変換。
 * early_fighter → Early Fighter
 * fighter1 → Fighter 1
 * CAS1 → CAS 1
 */
function humanize(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-zA-Z])(\d+)/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================================
//  Image Checker
// ============================================================================

/**
 * 変換結果の各技術の asset_key に対応する PNG が
 * assets/technology/ に存在するか確認し、レポートを出力する。
 */
function checkImages(techs) {
  const techDir = resolve(GAME_ROOT, 'assets/technology');
  if (!existsSync(techDir)) {
    console.log('\n📷 assets/technology/ ディレクトリが見つかりません');
    return { found: 0, missing: techs.length, missingList: [] };
  }
  const available = new Set(readdirSync(techDir).filter(f => f.endsWith('.png')));

  let found = 0, missing = 0;
  const missingList = [];

  for (const tech of techs) {
    const fileName = tech.asset_key + '.png';
    if (available.has(fileName)) {
      found++;
    } else {
      missing++;
      missingList.push({ id: tech.id, asset_key: tech.asset_key, file: fileName });
    }
  }

  console.log(`\n📷 画像チェック結果 (assets/technology/):`);
  console.log(`  ✅ 存在: ${found} 件`);
  console.log(`  ❌ 不足: ${missing} 件`);
  if (missingList.length) {
    console.log(`  不足一覧:`);
    for (const m of missingList) {
      console.log(`    ${m.id} → ${m.file}`);
    }
  }
  return { found, missing, missingList };
}

// ============================================================================
//  CLI
// ============================================================================

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key] = val;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.tech || !args.sprites) {
    console.error('使用法: node tools/hoi4-tech-converter.mjs --tech <file> --sprites <file> --output <file> --category <name> [--deploy] [--check-images]');
    process.exit(1);
  }

  const techFile = resolve(args.tech);
  const spriteFile = resolve(args.sprites);
  const category = args.category || 'armor';

  console.log(`🔧 HOI4 Tech Tree Converter`);
  console.log(`  技術ファイル: ${techFile}`);
  console.log(`  スプライトファイル: ${spriteFile}`);
  console.log(`  カテゴリ: ${category}`);

  // スプライトマッピングを構築
  console.log('\n📋 スプライトマッピングを構築中...');
  const spriteMap = buildSpriteMap(spriteFile);
  console.log(`  ${spriteMap.size} 個のスプライト定義を検出`);

  // 技術ツリーを変換
  console.log('\n🔄 技術ツリーを変換中...');
  const techs = convertTechFile(techFile, spriteMap, category);
  console.log(`  ${techs.length} 個の技術を変換`);

  // 画像チェック
  if (args['check-images'] || args.deploy || args.output) {
    checkImages(techs);
  }

  // --check-images のみなら終了
  if (args['check-images'] && !args.output && !args.deploy) {
    return;
  }

  const json = JSON.stringify(techs, null, 2);

  // --deploy: 全国の tec/data に配置
  if (args.deploy) {
    console.log('\n📦 全国の tec/data に配置中...');
    for (const [country, dir] of Object.entries(COUNTRY_DIRS)) {
      const outDir = resolve(GAME_ROOT, dir);
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
        console.log(`  ${country}: ディレクトリ作成 ${dir}`);
      }
      const outPath = resolve(outDir, `tech_${category}.json`);
      writeFileSync(outPath, json + '\n', 'utf-8');
      console.log(`  ${country}: ${dir}/tech_${category}.json ✓`);
    }
    console.log(`\n✅ ${techs.length} 技術を ${Object.keys(COUNTRY_DIRS).length} カ国に配置完了`);
    return;
  }

  // 単一出力
  const outputPath = args.output
    ? resolve(args.output)
    : resolve(GAME_ROOT, `tools/hoi4-output/tech_${category}.json`);

  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  writeFileSync(outputPath, json + '\n', 'utf-8');
  console.log(`\n✅ 出力: ${outputPath} (${techs.length} 技術)`);
}

main();
