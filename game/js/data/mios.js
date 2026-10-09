/** data/mios.js — 軍需産業体（MIO）定義：7大国家 × タイプ別企業 + 特性ツリー */

/** MIOタイプごとの特性ツリー（3段階: 各段階2択の相互排他なし・自由選択） */
export const MIO_TRAIT_TREE = {
  armor: [
    [{ id: 'armor_boost', trait: 'armor_boost' }, { id: 'armor_piercing', trait: 'armor_piercing' }],
    [{ id: 'engine_breakthrough', trait: 'engine_breakthrough' }, { id: 'production_line', trait: 'production_line' }],
    [{ id: 'quality_control', trait: 'quality_control' }, { id: 'mass_production', trait: 'mass_production' }],
  ],
  air: [
    [{ id: 'research_speed', trait: 'research_speed' }, { id: 'air_superiority', trait: 'air_superiority' }],
    [{ id: 'engine_breakthrough', trait: 'engine_breakthrough' }, { id: 'production_line', trait: 'production_line' }],
    [{ id: 'quality_control', trait: 'quality_control' }, { id: 'fuel_economy', trait: 'fuel_economy' }],
  ],
  naval: [
    [{ id: 'naval_engineering', trait: 'naval_engineering' }, { id: 'production_line', trait: 'production_line' }],
    [{ id: 'research_speed', trait: 'research_speed' }, { id: 'quality_control', trait: 'quality_control' }],
    [{ id: 'fuel_economy', trait: 'fuel_economy' }, { id: 'mass_production', trait: 'mass_production' }],
  ],
  industry: [
    [{ id: 'production_line', trait: 'production_line' }, { id: 'mass_production', trait: 'mass_production' }],
    [{ id: 'research_speed', trait: 'research_speed' }, { id: 'fuel_economy', trait: 'fuel_economy' }],
    [{ id: 'quality_control', trait: 'quality_control' }, { id: 'engine_breakthrough', trait: 'engine_breakthrough' }],
  ],
  electronics: [
    [{ id: 'radar_mastery', trait: 'radar_mastery' }, { id: 'cryptography', trait: 'cryptography' }],
    [{ id: 'research_speed', trait: 'research_speed' }, { id: 'quality_control', trait: 'quality_control' }],
    [{ id: 'production_line', trait: 'production_line' }, { id: 'mass_production', trait: 'mass_production' }],
  ],
};

/** 国家別MIO企業リスト（game/card/mio/ のカードと対応） */
export const NATION_MIOS = {
  GER: [
    { id: 'porsche', type: 'armor' }, { id: 'krupp', type: 'armor' },
    { id: 'messerschmitt', type: 'air' }, { id: 'blohm_voss', type: 'naval' },
    { id: 'ig_farben', type: 'electronics' },
  ],
  USA: [
    { id: 'ford', type: 'industry' }, { id: 'general_motors', type: 'armor' },
    { id: 'boeing', type: 'air' }, { id: 'bethlehem_steel', type: 'naval' },
    { id: 'lockheed', type: 'air' },
  ],
  ENG: [
    { id: 'vickers', type: 'armor' }, { id: 'supermarine', type: 'air' },
    { id: 'john_brown', type: 'naval' }, { id: 'hawker', type: 'air' },
  ],
  SOV: [
    { id: 'uralmash', type: 'armor' }, { id: 'tupolev', type: 'air' },
    { id: 'ilinyushin', type: 'air' }, { id: 'gorky_zavod', type: 'industry' },
  ],
  JAP: [
    { id: 'mitsubishi', type: 'air' }, { id: 'nakajima', type: 'air' },
    { id: 'kawasaki', type: 'naval' }, { id: 'aichi', type: 'air' },
  ],
  ITA: [
    { id: 'fiat', type: 'industry' }, { id: 'breda', type: 'armor' },
    { id: 'ansaldo', type: 'naval' }, { id: 'crs4', type: 'air' },
  ],
  FRA: [
    { id: 'renault', type: 'armor' }, { id: 'schneider', type: 'armor' },
    { id: 'fives_lille', type: 'naval' }, { id: 'bloch', type: 'air' },
  ],
};

/** MIOレベルごとの基本効果（レベルは研究/生産完了で上昇、最大Lv5） */
export const MIO_LEVEL_CAP = 5;
export const MIO_XP_PER_LEVEL = 100;

/** 特性の効果値（集計用） */
export const TRAIT_EFFECTS = {
  armor_boost: { armorPct: 0.05, researchSpeedPct: 0.10 },
  armor_piercing: { piercingPct: 0.08 },
  engine_breakthrough: { researchSpeedPct: 0.15, category: 'engine' },
  production_line: { productionEfficiencyPct: 0.10 },
  research_speed: { researchSpeedPct: 0.10 },
  quality_control: { reliabilityPct: 0.10 },
  mass_production: { productionCostPct: -0.08 },
  fuel_economy: { fuelPct: -0.10 },
  air_superiority: { airAttackPct: 0.05, airRangePct: 0.05 },
  naval_engineering: { shipBuildSpeedPct: 0.10 },
  radar_mastery: { researchSpeedPct: 0.15, category: 'electronics' },
  cryptography: { researchSpeedPct: 0.15, category: 'electronics' },
};
