import { project } from './geo.js';
/**
 * map-data.js — 世界地図の州（Province）データと地形補正定義
 *
 * HoI4 風に「State（州）」をさらに細かい「Province（プロヴィンス）」に分割し、
 * 各プロヴィンスに地形属性・隣接関係・所有国・航空基地レベル・海軍基地レベルを持たせる。
 * 座標は viewBox 0 0 1200 640 の SVG 座標系。
 */

const PROVINCE_SIZE = 22;

/** 地形ごとの戦闘補正と移動コスト */
export const TERRAIN = {
  plains:    { name: '平地',     attack: 0.00, defense: 0.00,  moveCost: 1.00,  color: '#6a8a5a' },
  forest:    { name: '森林',     attack: -0.10, defense: 0.15, moveCost: 1.25,  color: '#3a6a4a' },
  hills:     { name: '丘陵',     attack: -0.10, defense: 0.15, moveCost: 1.20,  color: '#8a7a5a' },
  mountains: { name: '山岳',     attack: -0.30, defense: 0.30,  moveCost: 2.00,  color: '#7a7a7a' },
  urban:     { name: '市街地',   attack: -0.15, defense: 0.30,  moveCost: 1.50,  color: '#5a5a5a' },
  marsh:     { name: '沼地',     attack: -0.15, defense: 0.10,  moveCost: 1.75,  color: '#5a7a6a' },
  river:     { name: '渡河',     attack: -0.20, defense: 0.10,  moveCost: 1.60,  color: '#5e9ec7' },
  coastal:   { name: '沿岸',     attack: -0.05, defense: 0.05,  moveCost: 1.10,  color: '#4a8aa0' },
  desert:    { name: '砂漠',     attack: 0.00,  defense: -0.05, moveCost: 1.40,  color: '#aa9a5a' },
};

/** 地形 ID からの表示名・補正取得 */
export function terrainInfo(id) { return TERRAIN[id] || TERRAIN.plains; }

/** プロヴィンス定義 */
export const PROVINCES = [
  // ── ドイツ領 ──
  { id: 'ger_berlin',   name: 'ベルリン',        tag: 'GER', ...project(13.405, 52.52), lon: 13.405, lat: 52.52, terrain: 'urban',    airbase: 2, naval: 0, vp: 15, capital: true },
  { id: 'ger_hamburg',  name: 'ハンブルク',      tag: 'GER', ...project(9.994, 53.55), lon: 9.994, lat: 53.55, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },
  { id: 'ger_munich',   name: 'ミュンヘン',      tag: 'GER', ...project(11.58, 48.14), lon: 11.58, lat: 48.14, terrain: 'plains',   airbase: 1, naval: 0, vp: 5,  capital: false },
  { id: 'ger_ruhr',     name: 'ルール地方',      tag: 'GER', ...project(7.01, 51.45), lon: 7.01, lat: 51.45, terrain: 'urban',    airbase: 1, naval: 0, vp: 10, capital: false },
  { id: 'ger_east_prussia', name: '東プロイセン', tag: 'GER', ...project(20.5, 54.71), lon: 20.5, lat: 54.71, terrain: 'plains',   airbase: 1, naval: 0, vp: 4,  capital: false },

  // ── ソ連領 ──
  { id: 'sov_moscow',   name: 'モスクワ',        tag: 'SOV', ...project(37.62, 55.75), lon: 37.62, lat: 55.75, terrain: 'plains',   airbase: 2, naval: 0, vp: 20, capital: true },
  { id: 'sov_kiev',     name: 'キエフ',          tag: 'SOV', ...project(30.52, 50.45), lon: 30.52, lat: 50.45, terrain: 'plains',   airbase: 1, naval: 0, vp: 12, capital: false },
  { id: 'sov_leningrad',name: 'レニングラード',  tag: 'SOV', ...project(30.32, 59.93), lon: 30.32, lat: 59.93, terrain: 'marsh',    airbase: 1, naval: 2, vp: 15, capital: false },
  { id: 'sov_stalingrad', name: 'スタリングラード',tag:'SOV', ...project(44.51, 48.71), lon: 44.51, lat: 48.71, terrain: 'plains',   airbase: 1, naval: 0, vp: 10, capital: false },
  { id: 'sov_ural',     name: 'ウラル',          tag: 'SOV', ...project(60.6, 56.84), lon: 60.6, lat: 56.84, terrain: 'mountains',airbase: 1, naval: 0, vp: 6,  capital: false },

  // ── イギリス領 ──
  { id: 'eng_london',   name: 'ロンドン',        tag: 'ENG', ...project(-0.128, 51.507), lon: -0.128, lat: 51.507, terrain: 'urban',    airbase: 2, naval: 3, vp: 18, capital: true },
  { id: 'eng_liverpool',name: 'リバプール',      tag: 'ENG', ...project(-2.98, 53.41), lon: -2.98, lat: 53.41, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },
  { id: 'eng_scotland', name: 'スコットランド',   tag: 'ENG', ...project(-3.19, 55.95), lon: -3.19, lat: 55.95, terrain: 'hills',    airbase: 1, naval: 1, vp: 4,  capital: false },

  // ── フランス領 ──
  { id: 'fra_paris',    name: 'パリ',            tag: 'FRA', ...project(2.35, 48.86), lon: 2.35, lat: 48.86, terrain: 'urban',    airbase: 2, naval: 0, vp: 18, capital: true },
  { id: 'fra_marseille',name: 'マルセイユ',      tag: 'FRA', ...project(5.37, 43.3), lon: 5.37, lat: 43.3, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },
  { id: 'fra_maginot',  name: 'マジノー線地帯',   tag: 'FRA', ...project(7.26, 48.58), lon: 7.26, lat: 48.58, terrain: 'fort',    airbase: 1, naval: 0, vp: 6,  capital: false },

  // ── イタリア領 ──
  { id: 'ita_rome',     name: 'ローマ',          tag: 'ITA', ...project(12.5, 41.9), lon: 12.5, lat: 41.9, terrain: 'urban',    airbase: 2, naval: 2, vp: 15, capital: true },
  { id: 'ita_milan',    name: 'ミラノ',          tag: 'ITA', ...project(9.19, 45.46), lon: 9.19, lat: 45.46, terrain: 'plains',   airbase: 1, naval: 0, vp: 8,  capital: false },
  { id: 'ita_naples',   name: 'ナポリ',          tag: 'ITA', ...project(14.27, 40.85), lon: 14.27, lat: 40.85, terrain: 'coastal',  airbase: 1, naval: 2, vp: 7,  capital: false },

  // ── 日本領 ──
  { id: 'jap_tokyo',    name: '東京',            tag: 'JAP', ...project(139.69, 35.68), lon: 139.69, lat: 35.68, terrain: 'urban',    airbase: 2, naval: 2, vp: 18, capital: true },
  { id: 'jap_osaka',    name: '大阪',            tag: 'JAP', ...project(135.5, 34.69), lon: 135.5, lat: 34.69, terrain: 'plains',   airbase: 1, naval: 2, vp: 12, capital: false },
  { id: 'jap_nagoya',   name: '名古屋',          tag: 'JAP', ...project(136.91, 35.18), lon: 136.91, lat: 35.18, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: false },
  { id: 'jap_kyushu',   name: '九州',            tag: 'JAP', ...project(130.4, 33.59), lon: 130.4, lat: 33.59, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },

  // ── アメリカ領 ──
  { id: 'usa_washington', name: 'ワシントン',     tag: 'USA', ...project(-77.04, 38.91), lon: -77.04, lat: 38.91, terrain: 'urban',    airbase: 2, naval: 2, vp: 18, capital: true },
  { id: 'usa_newyork',  name: 'ニューヨーク',     tag: 'USA', ...project(-74.01, 40.71), lon: -74.01, lat: 40.71, terrain: 'coastal',  airbase: 2, naval: 3, vp: 15, capital: false },
  { id: 'usa_chicago',  name: 'シカゴ',          tag: 'USA', ...project(-87.63, 41.88), lon: -87.63, lat: 41.88,  terrain: 'plains',   airbase: 1, naval: 0, vp: 8,  capital: false },

  // ── その他中小国 ──
  { id: 'pol_warsaw',   name: 'ワルシャワ',      tag: 'POL', ...project(21.01, 52.23), lon: 21.01, lat: 52.23, terrain: 'plains',   airbase: 1, naval: 0, vp: 8,  capital: true },
  { id: 'cze_prague',   name: 'プラハ',          tag: 'CZE', ...project(14.42, 50.08), lon: 14.42, lat: 50.08, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: true },
  { id: 'aus_vienna',   name: 'ウィーン',        tag: 'AUS', ...project(16.37, 48.21), lon: 16.37, lat: 48.21, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: true },
  { id: 'tur_istanbul', name: 'イスタンブール',   tag: 'TUR', ...project(28.98, 41.01), lon: 28.98, lat: 41.01, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: true },
  { id: 'egy_cairo',    name: 'カイロ',          tag: 'EGY', ...project(31.24, 30.04), lon: 31.24, lat: 30.04, terrain: 'desert',   airbase: 1, naval: 0, vp: 5,  capital: true },
  { id: 'chi_shanghai', name: '上海',            tag: 'CHI', ...project(121.47, 31.23), lon: 121.47, lat: 31.23, terrain: 'urban',    airbase: 1, naval: 2, vp: 10, capital: false },
  { id: 'chi_nanjing',  name: '南京',            tag: 'CHI', ...project(118.8, 32.06), lon: 118.8, lat: 32.06, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: true },
];

/** プロヴィンス間の隣接（陸路移動・前線接続） */
export const PROVINCE_LINKS = [
  ['ger_berlin','ger_hamburg'], ['ger_berlin','ger_munich'], ['ger_berlin','ger_ruhr'],
  ['ger_berlin','ger_east_prussia'], ['ger_ruhr','ger_munich'],
  ['ger_east_prussia','pol_warsaw'], ['pol_warsaw','cze_prague'], ['cze_prague','ger_berlin'],
  ['cze_prague','aus_vienna'], ['aus_vienna','ita_milan'], ['ita_milan','ita_rome'],
  ['ita_rome','ita_naples'], ['ita_rome','tur_istanbul'],
  ['sov_moscow','sov_kiev'], ['sov_moscow','sov_ural'], ['sov_kiev','sov_stalingrad'],
  ['sov_leningrad','sov_moscow'], ['sov_leningrad','ger_east_prussia'],
  ['eng_london','eng_liverpool'], ['eng_london','eng_scotland'],
  ['fra_paris','fra_marseille'], ['fra_paris','fra_maginot'], ['fra_maginot','ger_ruhr'],
  ['eng_london','fra_paris'], ['eng_london','ger_berlin'],
  ['jap_tokyo','jap_osaka'], ['jap_osaka','jap_nagoya'], ['jap_nagoya','jap_kyushu'],
  ['jap_tokyo','chi_shanghai'], ['chi_shanghai','chi_nanjing'],
  ['usa_washington','usa_newyork'], ['usa_newyork','usa_chicago'],
  ['tur_istanbul','egy_cairo'], ['tur_istanbul','sov_moscow'],
];

/** プロヴィンス ID -> 定義 */
export const PROVINCE_BY_ID = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));

/** 所有タグ -> その国のプロヴィンス ID 配列 */
export function provincesByTag(tag) {
  return PROVINCES.filter((p) => p.tag === tag).map((p) => p.id);
}

/** 隣接プロヴィンス ID 取得 */
export function neighbors(provinceId) {
  const out = [];
  for (const [a, b] of PROVINCE_LINKS) {
    if (a === provinceId) out.push(b);
    else if (b === provinceId) out.push(a);
  }
  return out;
}

/** 距離（px） */
export function distance(p1, p2) {
  const dx = p1.x - p2.x, dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 地形補正による移動速度倍率（1.0 = 基準） */
export function moveSpeedMultiplier(terrainId) {
  return 1.0 / (TERRAIN[terrainId]?.moveCost || 1.0);
}
