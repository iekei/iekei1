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
  { id: 'ger_berlin',   name: 'ベルリン',        tag: 'GER', x: 560, y: 220, terrain: 'urban',    airbase: 2, naval: 0, vp: 15, capital: true },
  { id: 'ger_hamburg',  name: 'ハンブルク',      tag: 'GER', x: 540, y: 190, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },
  { id: 'ger_munich',   name: 'ミュンヘン',      tag: 'GER', x: 600, y: 270, terrain: 'plains',   airbase: 1, naval: 0, vp: 5,  capital: false },
  { id: 'ger_ruhr',     name: 'ルール地方',      tag: 'GER', x: 520, y: 200, terrain: 'urban',    airbase: 1, naval: 0, vp: 10, capital: false },
  { id: 'ger_east_prussia', name: '東プロイセン', tag: 'GER', x: 720, y: 180, terrain: 'plains',   airbase: 1, naval: 0, vp: 4,  capital: false },

  // ── ソ連領 ──
  { id: 'sov_moscow',   name: 'モスクワ',        tag: 'SOV', x: 1020, y: 160, terrain: 'plains',   airbase: 2, naval: 0, vp: 20, capital: true },
  { id: 'sov_kiev',     name: 'キエフ',          tag: 'SOV', x: 860, y: 260, terrain: 'plains',   airbase: 1, naval: 0, vp: 12, capital: false },
  { id: 'sov_leningrad',name: 'レニングラード',  tag: 'SOV', x: 760, y: 140, terrain: 'marsh',    airbase: 1, naval: 2, vp: 15, capital: false },
  { id: 'sov_stalingrad', name: 'スタリングラード',tag:'SOV', x: 980, y: 240, terrain: 'plains',   airbase: 1, naval: 0, vp: 10, capital: false },
  { id: 'sov_ural',     name: 'ウラル',          tag: 'SOV', x: 1080, y: 180, terrain: 'mountains',airbase: 1, naval: 0, vp: 6,  capital: false },

  // ── イギリス領 ──
  { id: 'eng_london',   name: 'ロンドン',        tag: 'ENG', x: 300, y: 210, terrain: 'urban',    airbase: 2, naval: 3, vp: 18, capital: true },
  { id: 'eng_liverpool',name: 'リバプール',      tag: 'ENG', x: 260, y: 200, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },
  { id: 'eng_scotland', name: 'スコットランド',   tag: 'ENG', x: 280, y: 160, terrain: 'hills',    airbase: 1, naval: 1, vp: 4,  capital: false },

  // ── フランス領 ──
  { id: 'fra_paris',    name: 'パリ',            tag: 'FRA', x: 380, y: 300, terrain: 'urban',    airbase: 2, naval: 0, vp: 18, capital: true },
  { id: 'fra_marseille',name: 'マルセイユ',      tag: 'FRA', x: 420, y: 360, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },
  { id: 'fra_maginot',  name: 'マジノー線地帯',   tag: 'FRA', x: 460, y: 290, terrain: 'fort',    airbase: 1, naval: 0, vp: 6,  capital: false },

  // ── イタリア領 ──
  { id: 'ita_rome',     name: 'ローマ',          tag: 'ITA', x: 520, y: 400, terrain: 'urban',    airbase: 2, naval: 2, vp: 15, capital: true },
  { id: 'ita_milan',    name: 'ミラノ',          tag: 'ITA', x: 490, y: 350, terrain: 'plains',   airbase: 1, naval: 0, vp: 8,  capital: false },
  { id: 'ita_naples',   name: 'ナポリ',          tag: 'ITA', x: 550, y: 430, terrain: 'coastal',  airbase: 1, naval: 2, vp: 7,  capital: false },

  // ── 日本領 ──
  { id: 'jap_tokyo',    name: '東京',            tag: 'JAP', x: 1080, y: 330, terrain: 'urban',    airbase: 2, naval: 2, vp: 18, capital: true },
  { id: 'jap_osaka',    name: '大阪',            tag: 'JAP', x: 1100, y: 360, terrain: 'plains',   airbase: 1, naval: 2, vp: 12, capital: false },
  { id: 'jap_nagoya',   name: '名古屋',          tag: 'JAP', x: 1090, y: 350, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: false },
  { id: 'jap_kyushu',   name: '九州',            tag: 'JAP', x: 1140, y: 400, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: false },

  // ── アメリカ領 ──
  { id: 'usa_washington', name: 'ワシントン',     tag: 'USA', x: 120, y: 280, terrain: 'urban',    airbase: 2, naval: 2, vp: 18, capital: true },
  { id: 'usa_newyork',  name: 'ニューヨーク',     tag: 'USA', x: 160, y: 250, terrain: 'coastal',  airbase: 2, naval: 3, vp: 15, capital: false },
  { id: 'usa_chicago',  name: 'シカゴ',          tag: 'USA', x: 90, y: 240,  terrain: 'plains',   airbase: 1, naval: 0, vp: 8,  capital: false },

  // ── その他中小国 ──
  { id: 'pol_warsaw',   name: 'ワルシャワ',      tag: 'POL', x: 700, y: 240, terrain: 'plains',   airbase: 1, naval: 0, vp: 8,  capital: true },
  { id: 'cze_prague',   name: 'プラハ',          tag: 'CZE', x: 640, y: 280, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: true },
  { id: 'aus_vienna',   name: 'ウィーン',        tag: 'AUS', x: 660, y: 320, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: true },
  { id: 'tur_istanbul', name: 'イスタンブール',   tag: 'TUR', x: 760, y: 400, terrain: 'coastal',  airbase: 1, naval: 2, vp: 8,  capital: true },
  { id: 'egy_cairo',    name: 'カイロ',          tag: 'EGY', x: 700, y: 520, terrain: 'desert',   airbase: 1, naval: 0, vp: 5,  capital: true },
  { id: 'chi_shanghai', name: '上海',            tag: 'CHI', x: 980, y: 380, terrain: 'urban',    airbase: 1, naval: 2, vp: 10, capital: false },
  { id: 'chi_nanjing',  name: '南京',            tag: 'CHI', x: 960, y: 400, terrain: 'plains',   airbase: 1, naval: 0, vp: 6,  capital: true },
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
