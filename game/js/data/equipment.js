/** data/equipment.js — 生産装備 / 戦車・艦艇・航空機の車体とモジュール定義
 *
 * 兵器設計（Equipment Designer）のデータレイヤ。
 *  - 車体/船体/機体（chassis / hull / airframe）とモジュール（slot ごと）を定義
 *  - 各要素は `requires`（技術ID）を持ち、研究完了までは設計に組み込めない
 *  - スロット定義（TANK_SLOTS / NAVAL_SLOTS / AIR_SLOTS）で装着数を制限
 *  - 最終ステータスは calcTankStats / calcNavalStats / calcAirStats で算出
 */

const TECH = 'game/assets/technology';

/* ============================ 生産ライン用 装備 ============================ */

export const EQUIPMENT_ITEMS = {
  infantry_equipment_1: { name: '歩兵装備', icon: `${TECH}/infantry1.png`, type: 'infantry', output: 2.0, ic: 0.5,  resources: { steel: 1 } },
  infantry_equipment_2: { name: '歩兵装備Ⅱ', icon: `${TECH}/infantry2.png`, type: 'infantry', output: 1.6, ic: 0.6,  resources: { steel: 1 } },
  infantry_equipment_3: { name: '歩兵装備Ⅲ', icon: `${TECH}/infantry3.png`, type: 'infantry', output: 1.3, ic: 0.7,  resources: { steel: 1 } },
  support_weapons:      { name: '支援火器', icon: `${TECH}/infantry_weapons.png`, type: 'infantry', output: 1.2, ic: 0.5, resources: { steel: 1 } },
  motorized_equipment_1:{ name: '輸送トラック', icon: `${TECH}/motorized_equipment_1.png`, type: 'motorized', output: 0.8, ic: 1.0, resources: { steel: 1, rubber: 1, oil: 1 } },
  mechanized_equipment_1:{ name: '機械化装備', icon: `${TECH}/mechanized_equipment_1.png`, type: 'mechanized', output: 0.6, ic: 2.0, resources: { steel: 2, chromium: 1 } },
  artillery1:           { name: '野砲', icon: `${TECH}/artillery_equipment.png`, type: 'artillery', output: 0.9, ic: 2.0, resources: { steel: 2 } },
  antiair1:             { name: '対空砲', icon: `${TECH}/Antiair1.png`, type: 'artillery', output: 0.9, ic: 1.5, resources: { steel: 2 } },
  antitank1:             { name: '対戦車砲', icon: `${TECH}/antitank1.png`, type: 'artillery', output: 0.8, ic: 1.5, resources: { steel: 2 } },
  light_tank_equipment_1:  { name: '軽戦車', icon: `${TECH}/basic_light_tank.png`, type: 'tank', output: 0.35, ic: 3.0, resources: { steel: 2, chromium: 1 } },
  medium_tank_equipment_1: { name: '中戦車', icon: `${TECH}/basic_medium_tank.png`, type: 'tank', output: 0.25, ic: 4.0, resources: { steel: 3, tungsten: 1 } },
  heavy_tank_equipment_1:  { name: '重戦車', icon: `${TECH}/basic_heavy_tank.png`, type: 'tank', output: 0.15, ic: 6.0, resources: { steel: 4, tungsten: 2 } },
  fighter_equipment_1:  { name: '戦闘機', icon: `${TECH}/fighter1.png`, type: 'air', output: 1.0, ic: 3.0, resources: { aluminum: 2, oil: 1 } },
  tac_bomber_equipment_1:{ name: '戦術爆撃機', icon: `${TECH}/early_bomber.png`, type: 'air', output: 0.6, ic: 4.0, resources: { aluminum: 3, oil: 1 } },
  strat_bomber_equipment_1:{ name: '戦略爆撃機', icon: `${TECH}/heavy_plane_1.png`, type: 'air', output: 0.3, ic: 6.0, resources: { aluminum: 4, oil: 2 } },
  transport_plane_equipment_1: { name: '輸送機', icon: `${TECH}/heavy_plane_2.png`, type: 'air', output: 0.4, ic: 3.0, resources: { aluminum: 2 } },
  destroyer_equipment_1:   { name: '駆逐艦', icon: `${TECH}/basic_destroyer.png`, type: 'naval', output: 0.12, ic: 5.0, isShip: true, resources: { steel: 3 } },
  submarine_equipment_1:   { name: '潜水艦', icon: `${TECH}/early_submarine.png`, type: 'naval', output: 0.10, ic: 4.0, isShip: true, resources: { steel: 3 } },
  light_cruiser_equipment_1: { name: '軽巡洋艦', icon: `${TECH}/basic_light_cruiser.png`, type: 'naval', output: 0.06, ic: 9.0, isShip: true, resources: { steel: 5 } },
  battleship_equipment_1:  { name: '戦艦', icon: `${TECH}/basic_battleship.png`, type: 'naval', output: 0.03, ic: 18.0, isShip: true, resources: { steel: 8, tungsten: 2 } },
  carrier_equipment_1:     { name: '空母', icon: `${TECH}/basic_carrier.png`, type: 'naval', output: 0.04, ic: 14.0, isShip: true, resources: { steel: 6, aluminum: 2 } },
  train_equipment_1:    { name: '列車', icon: `${TECH}/ENG_train_equipment_1.png`, type: 'support', output: 0.5, ic: 1.5, resources: { steel: 2 } },
  railway_gun:          { name: '列車砲', icon: `${TECH}/ENG_railway_gun.png`, type: 'support', output: 0.3, ic: 3.0, resources: { steel: 3 } },
};

/* ============================ 戦車設計 ============================ */

/** 戦車シャシー: requires = 解禁に必要な研究技術ID */
export const TANK_CHASSIS = [
  { id: 'gw_light',    name: '試製軽戦車シャシー', year: 1918, tier: 'light',  requires: 'interwar_artillery',          armor: 8,  speed: 7,  reliability: 0.70, cost: 2.0,  hp: 20, weight: 6,  icon: `${TECH}/generic_inter_war_light_tank_chassis.png` },
  { id: 'light_1',     name: '基本型軽戦車シャシー', year: 1934, tier: 'light',  requires: 'basic_light_tank_chassis',   armor: 15, speed: 9,  reliability: 0.80, cost: 2.5,  hp: 25, weight: 8,  icon: `${TECH}/basic_light_tank.png` },
  { id: 'light_2',     name: '改良型軽戦車シャシー', year: 1936, tier: 'light',  requires: 'improved_light_tank_chassis', armor: 20, speed: 10, reliability: 0.85, cost: 3.0,  hp: 25, weight: 9,  icon: `${TECH}/improved_light_tank.png` },
  { id: 'light_3',     name: '先進軽戦車シャシー', year: 1941, tier: 'light',  requires: 'advanced_light_tank_chassis', armor: 30, speed: 11, reliability: 0.90, cost: 3.5,  hp: 28, weight: 10, icon: `${TECH}/advanced_light_tank.png` },
  { id: 'medium_1',    name: '基本型中戦車シャシー', year: 1938, tier: 'medium', requires: 'basic_medium_tank_chassis',   armor: 40, speed: 8,  reliability: 0.80, cost: 4.0,  hp: 30, weight: 15, icon: `${TECH}/basic_medium_tank.png` },
  { id: 'medium_2',    name: '改良型中戦車シャシー', year: 1940, tier: 'medium', requires: 'improved_medium_tank_chassis', armor: 50, speed: 9,  reliability: 0.85, cost: 4.5,  hp: 32, weight: 18, icon: `${TECH}/improved_medium_tank.png` },
  { id: 'medium_3',    name: '先進中戦車シャシー', year: 1943, tier: 'medium', requires: 'advanced_medium_tank_chassis', armor: 60, speed: 10, reliability: 0.90, cost: 5.0,  hp: 34, weight: 22, icon: `${TECH}/advanced_medium_tank.png` },
  { id: 'heavy_1',     name: '基本型重戦車シャシー', year: 1934, tier: 'heavy',  requires: 'basic_heavy_tank_chassis',    armor: 60, speed: 6,  reliability: 0.75, cost: 6.0,  hp: 35, weight: 30, icon: `${TECH}/basic_heavy_tank.png` },
  { id: 'heavy_2',     name: '改良型重戦車シャシー', year: 1940, tier: 'heavy',  requires: 'improved_heavy_tank_chassis', armor: 75, speed: 7,  reliability: 0.85, cost: 6.5,  hp: 38, weight: 38, icon: `${TECH}/improved_heavy_tank.png` },
  { id: 'heavy_3',     name: '先進重戦車シャシー', year: 1943, tier: 'heavy',  requires: 'advanced_heavy_tank_chassis', armor: 90, speed: 8,  reliability: 0.90, cost: 7.5,  hp: 40, weight: 48, icon: `${TECH}/advanced_heavy_tank.png` },
  { id: 'super_heavy', name: '超重戦車シャシー', year: 1941, tier: 'heavy',  requires: 'super_heavy_tank_chassis',    armor: 110, speed: 5,  reliability: 0.70, cost: 12.0, hp: 50, weight: 70, icon: `${TECH}/advanced_heavy_tank.png` },
  { id: 'mbt_1',       name: '主力戦車シャシー', year: 1945, tier: 'medium', requires: 'main_battle_tank_chassis',     armor: 85, speed: 10, reliability: 0.90, cost: 8.0,  hp: 45, weight: 35, icon: `${TECH}/advanced_medium_tank.png` },
];

/** 戦車モジュール。slot は TANK_SLOTS と対応。requires が無ければ初期解禁 */
export const TANK_MODULES = {
  gun: [
    { id: 'small_cannon',       name: '小口径砲',     soft: 15, hard: 5,  piercing: 25, cost: 0.5, weight: 1 },
    { id: 'close_support_gun',  name: '近接支援砲',   soft: 20, hard: 4,  piercing: 15, cost: 0.7, weight: 1.5, requires: 'interwar_artillery' },
    { id: 'medium_cannon',      name: '中口径砲',     soft: 24, hard: 12, piercing: 55, cost: 1.0, weight: 3,   requires: 'artillery1' },
    { id: 'high_velocity_gun',  name: '高初速砲',     soft: 28, hard: 22, piercing: 80, cost: 1.5, weight: 4,   requires: 'artillery2' },
    { id: 'heavy_cannon',       name: '重砲',         soft: 32, hard: 30, piercing: 95, cost: 2.0, weight: 6,   requires: 'artillery3' },
  ],
  turret: [
    { id: 'one_man_turret',     name: '1人乗り砲塔',   cost: 0.3, weight: 1, armor: 5,  speed: 0 },
    { id: 'two_man_turret',     name: '2人乗り砲塔',   cost: 0.6, weight: 2, armor: 15, speed: -1 },
    { id: 'three_man_turret',   name: '3人乗り砲塔',   cost: 1.0, weight: 4, armor: 25, speed: -2, requires: 'basic_medium_tank_chassis' },
    { id: 'fixed_superstructure', name: '固定式戦闘室', cost: 0.5, weight: 3, armor: 20, speed: 0, requires: 'basic_heavy_tank_chassis' },
  ],
  suspension: [
    { id: 'bogie_suspension',      name: 'ボギー懸架',       cost: 0.4, weight: 2, speed: 0, reliability: 0.00 },
    { id: 'christie_suspension',   name: 'クリスティー懸架', cost: 0.8, weight: 3, speed: 2, reliability: -0.05, requires: 'improved_light_tank_chassis' },
    { id: 'torsion_bar',           name: 'トーションバー',   cost: 1.0, weight: 3, speed: 1, reliability: 0.05,  requires: 'improved_medium_tank_chassis' },
    { id: 'interleaved_suspension', name: 'インターリーブ懸架', cost: 1.4, weight: 5, speed: 1, reliability: -0.10, requires: 'advanced_heavy_tank_chassis' },
  ],
  engine: [
    { id: 'petrol_engine',  name: 'ガソリンエンジン', cost: 0.5, weight: 2, speed: 0, fuel: 1.0 },
    { id: 'diesel_engine',  name: 'ディーゼルエンジン', cost: 1.0, weight: 4, speed: 1, fuel: -0.3, requires: 'engine_tech_1' },
    { id: 'turbine_engine_tank', name: 'ガスタービン', cost: 2.0, weight: 5, speed: 3, fuel: 0.4, requires: 'engine_tech_3' },
  ],
  armor: [
    { id: 'welded_armor',      name: '溶接装甲',   cost: 0.4, weight: 1, armor: 10 },
    { id: 'cast_armor',        name: '鋳造装甲',   cost: 0.8, weight: 2, armor: 20, speed: -1, requires: 'armor_tech_1' },
    { id: 'extra_armor_plates', name: '増加装甲板', cost: 0.6, weight: 3, armor: 15, speed: -1, requires: 'armor_tech_2' },
    { id: 'sloped_armor',      name: '傾斜装甲',   cost: 1.0, weight: 2, armor: 30, speed: -1, requires: 'armor_tech_3' },
  ],
  radio: [
    { id: 'no_radio',        name: '無線なし',    cost: 0,   weight: 0,  reliability: -0.05 },
    { id: 'basic_radio_set', name: '基本無線機',  cost: 0.3, weight: 0.5, breakthrough: 2, reliability: 0.03, requires: 'radio' },
    { id: 'improved_radio_set', name: '改良無線機', cost: 0.5, weight: 0.5, breakthrough: 5, reliability: 0.05, requires: 'improved_radio' },
  ],
  special: [
    { id: 'smoke_launchers',       name: '発煙弾発射機',   cost: 0.3, weight: 0.5 },
    { id: 'dozer_blade',           name: 'ドーザーブレード', cost: 0.3, weight: 1, requires: 'tech_engineers' },
    { id: 'amphibious_drive_module', name: '浮航装置',      cost: 0.8, weight: 2, speed: -2, amphibious: true, requires: 'amphibious_drive' },
    { id: 'extra_ammo_storage',    name: '追加弾薬庫',     cost: 0.3, weight: 1 },
    { id: 'wet_ammo_storage',      name: '防湿弾薬庫',     cost: 0.4, weight: 1, reliability: 0.10, requires: 'improved_medium_tank_chassis' },
    { id: 'additional_hmg',        name: '追加重機関銃',   cost: 0.3, weight: 0.5, soft: 4, requires: 'infantry_weapons' },
  ],
};

/** 戦車スロット定義（slot / 表示名 / 選択方式 / 最大装着数） */
export const TANK_SLOTS = [
  { id: 'gun',        label: '主砲',       type: 'single' },
  { id: 'turret',     label: '砲塔',       type: 'single' },
  { id: 'suspension', label: '懸架装置',   type: 'single' },
  { id: 'engine',     label: 'エンジン',   type: 'single' },
  { id: 'armor',      label: '装甲',       type: 'single' },
  { id: 'radio',      label: '無線機',     type: 'single' },
  { id: 'special',    label: '特殊装備',   type: 'multi', max: 4 },
];

/** 戦車ステータス計算（設計の最終値） */
export function calcTankStats(chassisId, modules = {}) {
  const ch = TANK_CHASSIS.find((c) => c.id === chassisId);
  if (!ch) return null;
  const m = (slot) => (TANK_MODULES[slot] || []).find((x) => x.id === modules[slot]) || null;
  const gun = m('gun'), tur = m('turret'), sus = m('suspension'), eng = m('engine'), arm = m('armor'), rad = m('radio');
  const specials = (modules.special || []).map((id) => TANK_MODULES.special.find((x) => x.id === id)).filter(Boolean);

  let weight = ch.weight;
  let cost = ch.cost, armor = ch.armor, speed = ch.speed, reliability = ch.reliability;
  let soft = 0, hard = 0, piercing = 0, breakthroughMod = 0;
  for (const mod of [gun, tur, sus, eng, arm, rad, ...specials]) {
    if (!mod) continue;
    weight += mod.weight || 0;
    cost += mod.cost || 0;
    armor += mod.armor || 0;
    speed += mod.speed || 0;
    reliability += mod.reliability || 0;
    soft += mod.soft || 0;
    hard += mod.hard || 0;
    piercing += mod.piercing || 0;
    breakthroughMod += mod.breakthrough || 0;
  }
  // 馬力重量比 → 速度補正（重いほど遅い）
  const powerRatio = 10 / Math.max(1, weight / 5);
  speed = Math.max(3, speed + (powerRatio - 2));
  reliability = Math.min(0.97, Math.max(0.4, reliability));
  const breakthrough = Math.round(hard * 0.6 + soft * 0.2 + breakthroughMod);
  const defense = Math.round(30 + armor * 0.3);
  const fuelUse = Math.max(0.5, weight * 0.08 * (eng && eng.fuel !== undefined ? 1 + eng.fuel : 1));
  return {
    softAttack: Math.round(soft * 10) / 10,
    hardAttack: Math.round(hard * 10) / 10,
    breakthrough, defense, piercing,
    armor: Math.round(armor),
    maxSpeed: Math.round(speed * 10) / 10,
    reliability: Math.round(reliability * 100),
    productionCost: Math.round(cost * 100) / 100,
    hp: ch.hp,
    fuelUsePerHour: Math.round(fuelUse * 10) / 10,
    amphibious: specials.some((s) => s.amphibious),
    weight: Math.round(weight * 10) / 10,
    slotsUsed: ['gun', 'turret', 'suspension', 'engine', 'armor', 'radio'].filter((s) => modules[s]).length + specials.length,
  };
}

/* ============================ 艦艇設計 ============================ */

export const NAVAL_HULLS = [
  { id: 'destroyer_1', name: '駆逐艦（1936）', type: 'destroyer', year: 1936, requires: 'early_ship_hull_light', hp: 400, lightAttack: 12, heavyAttack: 4, antiAir: 10, torpedo: 12, armor: 8, speed: 36, range: 2500, visibility: 8, screening: 30, cost: 5,  icon: `${TECH}/basic_destroyer.png` },
  { id: 'destroyer_2', name: '駆逐艦（1939）', type: 'destroyer', year: 1939, requires: 'basic_ship_hull_light', hp: 480, lightAttack: 16, heavyAttack: 6, antiAir: 14, torpedo: 18, armor: 10, speed: 37, range: 3000, visibility: 8, screening: 35, cost: 6, icon: `${TECH}/improved_destroyer.png` },
  { id: 'destroyer_3', name: '駆逐艦（1943）', type: 'destroyer', year: 1943, requires: 'improved_ship_hull_light', hp: 560, lightAttack: 22, heavyAttack: 8, antiAir: 20, torpedo: 24, armor: 12, speed: 38, range: 3500, visibility: 9, screening: 40, cost: 7, icon: `${TECH}/advanced_destroyer.png` },
  { id: 'light_cruiser_1', name: '軽巡洋艦（1936）', type: 'light_cruiser', year: 1936, requires: 'early_ship_hull_cruiser', hp: 1200, lightAttack: 30, heavyAttack: 10, antiAir: 20, torpedo: 10, armor: 25, speed: 32, range: 5000, visibility: 10, screening: 20, cost: 9, icon: `${TECH}/basic_light_cruiser.png` },
  { id: 'light_cruiser_2', name: '軽巡洋艦（1939）', type: 'light_cruiser', year: 1939, requires: 'basic_ship_hull_cruiser', hp: 1400, lightAttack: 40, heavyAttack: 14, antiAir: 28, torpedo: 14, armor: 30, speed: 33, range: 6000, visibility: 10, screening: 25, cost: 11, icon: `${TECH}/improved_light_cruiser.png` },
  { id: 'heavy_cruiser_1', name: '重巡洋艦（1936）', type: 'heavy_cruiser', year: 1936, requires: 'early_ship_hull_heavy', hp: 2200, lightAttack: 45, heavyAttack: 30, antiAir: 25, torpedo: 12, armor: 60, speed: 30, range: 7000, visibility: 12, screening: 15, cost: 14, icon: `${TECH}/basic_heavy_cruiser.png` },
  { id: 'heavy_cruiser_2', name: '重巡洋艦（1943）', type: 'heavy_cruiser', year: 1943, requires: 'improved_ship_hull_heavy', hp: 2800, lightAttack: 60, heavyAttack: 45, antiAir: 40, torpedo: 18, armor: 75, speed: 31, range: 8000, visibility: 12, screening: 18, cost: 18, icon: `${TECH}/advanced_heavy_cruiser.png` },
  { id: 'battleship_1', name: '戦艦（1936）', type: 'battleship', year: 1936, requires: 'basic_ship_hull_heavy', hp: 6000, lightAttack: 60, heavyAttack: 120, antiAir: 30, torpedo: 0, armor: 180, speed: 26, range: 9000, visibility: 16, screening: 5, cost: 18, icon: `${TECH}/basic_battleship.png` },
  { id: 'battleship_2', name: '戦艦（1939）', type: 'battleship', year: 1939, requires: 'improved_ship_hull_heavy', hp: 7500, lightAttack: 80, heavyAttack: 150, antiAir: 45, torpedo: 0, armor: 220, speed: 27, range: 10000, visibility: 16, screening: 6, cost: 24, icon: `${TECH}/improved_battleship.png` },
  { id: 'carrier_1', name: '空母（1936）', type: 'carrier', year: 1936, requires: 'early_ship_hull_carrier', hp: 4500, lightAttack: 20, heavyAttack: 5, antiAir: 40, torpedo: 0, armor: 80, speed: 28, range: 12000, visibility: 14, screening: 10, cost: 14, airSlots: 60, icon: `${TECH}/basic_carrier.png` },
  { id: 'carrier_2', name: '空母（1939）', type: 'carrier', year: 1939, requires: 'basic_ship_hull_carrier', hp: 5500, lightAttack: 30, heavyAttack: 8, antiAir: 55, torpedo: 0, armor: 100, speed: 29, range: 14000, visibility: 14, screening: 12, cost: 18, airSlots: 80, icon: `${TECH}/improved_carrier.png` },
  { id: 'submarine_1', name: '潜水艦（1936）', type: 'submarine', year: 1936, requires: 'early_ship_hull_submarine', hp: 300, lightAttack: 6, heavyAttack: 2, antiAir: 2, torpedo: 30, armor: 4, speed: 16, range: 8000, visibility: 4, subDetection: 5, cost: 4, icon: `${TECH}/early_submarine.png` },
  { id: 'submarine_2', name: '潜水艦（1939）', type: 'submarine', year: 1939, requires: 'basic_ship_hull_submarine', hp: 380, lightAttack: 8, heavyAttack: 3, antiAir: 3, torpedo: 40, armor: 6, speed: 17, range: 12000, visibility: 4, subDetection: 7, cost: 5, icon: `${TECH}/Basic_submarine.png` },
  { id: 'submarine_3', name: '潜水艦（1943）', type: 'submarine', year: 1943, requires: 'improved_ship_hull_submarine', hp: 460, lightAttack: 10, heavyAttack: 4, antiAir: 4, torpedo: 50, armor: 8, speed: 18, range: 16000, visibility: 3, subDetection: 9, cost: 6, icon: `${TECH}/advanced_submarine.png` },
];

export const NAVAL_MODULES = {
  main_battery: [
    { id: 'light_main_battery',  name: '軽主砲', lightAttack: 8, cost: 1, weight: 200 },
    { id: 'medium_main_battery', name: '中主砲', lightAttack: 12, heavyAttack: 6, cost: 2, weight: 600, requires: 'early_ship_hull_cruiser' },
    { id: 'heavy_main_battery',  name: '重主砲', lightAttack: 14, heavyAttack: 18, cost: 4, weight: 1500, requires: 'early_ship_hull_heavy' },
  ],
  secondary: [
    { id: 'secondary_battery', name: '副砲', lightAttack: 6, antiAir: 4, cost: 1, weight: 300, requires: 'basic_ship_hull_light' },
  ],
  anti_air: [
    { id: 'anti_air_battery',  name: '対空砲', antiAir: 10, cost: 1, weight: 150 },
    { id: 'dual_purpose_battery', name: '両用砲', lightAttack: 4, antiAir: 16, cost: 1.5, weight: 260, requires: 'improved_ship_hull_light' },
  ],
  torpedo: [
    { id: 'torpedo_tubes', name: '魚雷発射管', torpedo: 12, cost: 1, weight: 100 },
    { id: 'depth_charges', name: '爆雷', antiSub: 8, cost: 0.5, weight: 50, requires: 'basic_depth_charges' },
  ],
  electronics: [
    { id: 'naval_sonar',         name: 'ソナー',     subDetection: 3, surfaceDetection: 2, cost: 1, weight: 80, requires: 'sonar' },
    { id: 'naval_radar',         name: 'レーダー',   surfaceDetection: 4, antiAir: 4, cost: 1.5, weight: 120, requires: 'centimetric_radar' },
    { id: 'fire_control_system', name: '射撃管制',   lightAttack: 4, heavyAttack: 6, cost: 2, weight: 200, requires: 'basic_fire_control_system' },
  ],
  engine: [
    { id: 'diesel_engine_ship', name: 'ディーゼル機関', speed: 2, range: 1500, cost: 1, weight: 800 },
    { id: 'turbine_engine',     name: '蒸気タービン',   speed: 4, range: 1000, cost: 2, weight: 1200, requires: 'basic_ship_hull_cruiser' },
  ],
  armor: [
    { id: 'armor_scheme',        name: '装甲方式',     armor: 20, cost: 2, weight: 1000, speed: -1, requires: 'basic_cruiser_armor_scheme' },
    { id: 'heavy_armor_scheme',  name: '重装甲方式',   armor: 45, cost: 4, weight: 2200, speed: -2, requires: 'basic_heavy_armor_scheme' },
  ],
  special: [
    { id: 'smoke_generator_ship', name: '発煙装置',       visibility: -2, cost: 0.5, weight: 50, requires: 'smoke_generator' },
    { id: 'minelaying_rails',     name: '機雷敷設レール', minelaying: 20, cost: 0.5, weight: 80 },
  ],
};

/** 艦種ごとのスロット上限（HOI4 の設計枠に相当） */
const NAVAL_CAPS_BY_TYPE = {
  destroyer:     { main_battery: 1, secondary: 1, anti_air: 1, torpedo: 2, electronics: 1, engine: 1, armor: 0, special: 2 },
  light_cruiser: { main_battery: 2, secondary: 2, anti_air: 2, torpedo: 2, electronics: 2, engine: 1, armor: 1, special: 2 },
  heavy_cruiser: { main_battery: 2, secondary: 2, anti_air: 2, torpedo: 1, electronics: 2, engine: 1, armor: 1, special: 2 },
  battleship:    { main_battery: 3, secondary: 2, anti_air: 3, torpedo: 0, electronics: 2, engine: 1, armor: 1, special: 2 },
  carrier:       { main_battery: 1, secondary: 2, anti_air: 3, torpedo: 0, electronics: 2, engine: 1, armor: 1, special: 2 },
  submarine:     { main_battery: 0, secondary: 0, anti_air: 1, torpedo: 2, electronics: 2, engine: 1, armor: 0, special: 2 },
};

export function navalSlotCaps(hullId) {
  const h = NAVAL_HULLS.find((x) => x.id === hullId);
  if (!h) return {};
  return NAVAL_CAPS_BY_TYPE[h.type] || NAVAL_CAPS_BY_TYPE.destroyer;
}

export function calcNavalStats(hullId, modules = {}) {
  const h = NAVAL_HULLS.find((x) => x.id === hullId);
  if (!h) return null;
  const caps = navalSlotCaps(hullId);
  const out = {
    lightAttack: h.lightAttack, heavyAttack: h.heavyAttack, antiAir: h.antiAir,
    torpedo: h.torpedo, armor: h.armor, speed: h.speed, range: h.range,
    visibility: h.visibility, screening: h.screening, hp: h.hp,
    productionCost: h.cost, subDetection: h.subDetection || 0,
    surfaceDetection: 0, airSlots: h.airSlots || 0, weight: 5000, antiSub: 0, minelaying: 0,
  };
  const overflow = [];
  for (const [slot, list] of Object.entries(modules)) {
    const cap = caps[slot] ?? 0;
    (list || []).forEach((id, idx) => {
      const mod = (NAVAL_MODULES[slot] || []).find((x) => x.id === id);
      if (!mod) return;
      if (idx >= cap) { overflow.push({ slot, id, cap }); return; }
      out.lightAttack += mod.lightAttack || 0;
      out.heavyAttack += mod.heavyAttack || 0;
      out.antiAir += mod.antiAir || 0;
      out.torpedo += mod.torpedo || 0;
      out.armor += mod.armor || 0;
      out.speed += mod.speed || 0;
      out.range += mod.range || 0;
      out.visibility += mod.visibility || 0;
      out.subDetection += mod.subDetection || 0;
      out.surfaceDetection += mod.surfaceDetection || 0;
      out.antiSub += mod.antiSub || 0;
      out.minelaying += mod.minelaying || 0;
      out.productionCost += mod.cost || 0;
      out.weight += mod.weight || 0;
    });
  }
  out.speed = Math.max(8, out.speed);
  out.range = Math.max(1000, out.range);
  for (const k of ['lightAttack', 'heavyAttack', 'antiAir', 'torpedo', 'armor', 'speed', 'range', 'visibility', 'subDetection', 'surfaceDetection', 'productionCost', 'weight', 'antiSub', 'minelaying', 'screening', 'hp']) {
    out[k] = Math.round(out[k] * 10) / 10;
  }
  out.overflow = overflow;
  return out;
}

/* ============================ 航空機設計 ============================ */

export const AIRFRAMES = [
  { id: 'fighter_1', name: '軽戦闘機（1936）', role: 'fighter', year: 1936, requires: 'iw_small_airframe', hp: 100, speed: 480, agility: 90, range: 600,  attack: 8,  cost: 3,  icon: `${TECH}/fighter1.png` },
  { id: 'fighter_2', name: '軽戦闘機（1940）', role: 'fighter', year: 1940, requires: 'basic_small_airframe', hp: 120, speed: 540, agility: 85, range: 750,  attack: 12, cost: 4,  icon: `${TECH}/fighter2.png` },
  { id: 'fighter_3', name: '軽戦闘機（1944）', role: 'fighter', year: 1944, requires: 'improved_small_airframe', hp: 150, speed: 620, agility: 80, range: 900,  attack: 18, cost: 5,  icon: `${TECH}/fighter3.png` },
  { id: 'heavy_fighter_1', name: '重戦闘機（1939）', role: 'fighter', year: 1939, requires: 'basic_medium_airframe', hp: 160, speed: 460, agility: 65, range: 800, attack: 20, cost: 5, icon: `${TECH}/heavy_plane_1.png` },
  { id: 'tac_bomber_1', name: '戦術爆撃機（1936）', role: 'tac_bomber', year: 1936, requires: 'iw_medium_airframe', hp: 140, speed: 380, agility: 60, range: 800, attack: 6, bombing: 12, cost: 4, icon: `${TECH}/early_bomber.png` },
  { id: 'tac_bomber_2', name: '戦術爆撃機（1940）', role: 'tac_bomber', year: 1940, requires: 'improved_medium_airframe', hp: 180, speed: 420, agility: 55, range: 1000, attack: 8, bombing: 20, cost: 5, icon: `${TECH}/medium_plane_2.png` },
  { id: 'strat_bomber_1', name: '戦略爆撃機（1939）', role: 'strat_bomber', year: 1939, requires: 'basic_large_airframe', hp: 260, speed: 340, agility: 40, range: 2000, attack: 4, bombing: 10, strategic: 25, cost: 6, icon: `${TECH}/heavy_plane_1.png` },
  { id: 'strat_bomber_2', name: '戦略爆撃機（1943）', role: 'strat_bomber', year: 1943, requires: 'improved_large_airframe', hp: 320, speed: 380, agility: 42, range: 2600, attack: 6, bombing: 14, strategic: 40, cost: 8, icon: `${TECH}/heavy_plane_3.png` },
  { id: 'naval_bomber_1', name: '艦上爆撃機（1939）', role: 'naval_bomber', year: 1939, requires: 'basic_medium_airframe', hp: 160, speed: 320, agility: 55, range: 900, attack: 8, bombing: 10, navalAttack: 14, cost: 5, icon: `${TECH}/ENG_naval_bomber1.png` },
  { id: 'transport_1', name: '輸送機（1936）', role: 'transport', year: 1936, requires: 'bba_early_transport_plane', hp: 120, speed: 280, agility: 40, range: 1200, attack: 0, cost: 3, icon: `${TECH}/heavy_plane_2.png` },
];

export const AIR_MODULES = {
  engine: [
    { id: 'piston_engine',  name: 'ピストンエンジン', speed: 0,   agility: 0,  cost: 0.5, fuel: 1.0 },
    { id: 'inline_engine',  name: '直列エンジン',     speed: 40,  agility: 5,  cost: 1.0, fuel: 0.2, requires: 'engines_1' },
    { id: 'radial_engine',  name: '星型エンジン',     speed: 60,  agility: 8,  cost: 1.2, fuel: 0.3, requires: 'engines_2' },
    { id: 'jet_engine',     name: 'ジェットエンジン', speed: 120, agility: -5, cost: 2.5, fuel: 0.8, requires: 'sp_centrifugal_jet_tech' },
  ],
  weapons: [
    { id: 'machine_gun_armament', name: '機銃武装',   attack: 4,  cost: 0.3 },
    { id: 'cannon_armament',      name: '機関砲武装', attack: 10, cost: 0.8, agility: -5, requires: 'aa_cannon_1' },
    { id: 'bomb_locks',           name: '爆弾架',     bombing: 8, cost: 0.5, agility: -3, requires: 'early_bombs' },
    { id: 'torpedo_mounts',       name: '魚雷架',     navalAttack: 12, cost: 0.8, agility: -5, requires: 'air_torpedoe_1' },
  ],
  special: [
    { id: 'drop_tank',          name: '増槽（Drop Tank）', rangeMult: 1.9, rangeBonus: 400, agility: -10, costMult: 1.15, cost: 0.5, requires: 'range_improvements' },
    { id: 'self_sealing_tanks', name: '自動防漏タンク', hp: 20, cost: 0.4, requires: 'survivability_studies' },
    { id: 'armor_plates',       name: '装甲板', hp: 30, agility: -8, cost: 0.6, requires: 'survivability_studies' },
    { id: 'air_radar',          name: '機上レーダー', detection: 10, cost: 0.7, agility: -3, requires: 'radio' },
    { id: 'extra_fuel_tank',    name: '増設燃料タンク', rangeBonus: 250, agility: -5, cost: 0.3 },
    { id: 'radio_navigation',   name: '電波航法装置', rangeBonus: 120, detection: 4, cost: 0.3, requires: 'improved_radio' },
  ],
};

/** 航空機スロット定義 */
export const AIR_SLOTS = [
  { id: 'engine',  label: 'エンジン', type: 'single' },
  { id: 'weapons', label: '武装',     type: 'multi', max: 2 },
  { id: 'special', label: '特殊装備', type: 'multi', max: 2 },
];

/**
 * 航空機ステータス計算
 * 【重要】増槽（Drop Tank）: 航続距離+75%〜100% / 機動性-10% / 生産コスト+15%
 */
export function calcAirStats(airframeId, modules = {}) {
  const af = AIRFRAMES.find((a) => a.id === airframeId);
  if (!af) return null;
  const out = {
    speed: af.speed, agility: af.agility, range: af.range, attack: af.attack || 0,
    bombing: af.bombing || 0, navalAttack: af.navalAttack || 0, strategic: af.strategic || 0,
    hp: af.hp, cost: af.cost, detection: 0,
  };
  let agilityPct = 0, rangeMult = 1, rangeBonus = 0, costMult = 1;
  const apply = (mod) => {
    if (!mod) return;
    out.speed += mod.speed || 0;
    out.attack += mod.attack || 0;
    out.bombing += mod.bombing || 0;
    out.navalAttack += mod.navalAttack || 0;
    out.hp += mod.hp || 0;
    out.cost += mod.cost || 0;
    out.detection += mod.detection || 0;
    if (mod.agility) {
      if (mod.id === 'drop_tank') agilityPct += mod.agility; // -10%（%補正）
      else out.agility += mod.agility;
    }
    if (mod.rangeMult) rangeMult *= mod.rangeMult;
    if (mod.rangeBonus) rangeBonus += mod.rangeBonus;
    if (mod.costMult) costMult *= mod.costMult;
  };
  apply((AIR_MODULES.engine || []).find((x) => x.id === modules.engine));
  for (const id of (modules.weapons || []).slice(0, 2)) apply(AIR_MODULES.weapons.find((x) => x.id === id));
  const dropTanks = (modules.special || []).filter((id) => id === 'drop_tank').length;
  for (const id of (modules.special || []).slice(0, 2)) {
    const mod = AIR_MODULES.special.find((x) => x.id === id);
    if (!mod) continue;
    if (mod.id === 'drop_tank') {
      // 2基目以降は乗算を弱める（1基目 ×1.9 / 2基目 ×1.05）
      rangeMult *= dropTanks > 1 ? 1.05 : mod.rangeMult;
      rangeBonus += mod.rangeBonus;
      agilityPct += mod.agility;
      costMult *= mod.costMult;
      out.cost += mod.cost;
      continue;
    }
    apply(mod);
  }
  out.range = Math.round(af.range * Math.min(rangeMult, 2.0) + rangeBonus);
  out.agility = Math.round(out.agility * (1 + agilityPct / 100));
  out.cost = Math.round(out.cost * costMult * 100) / 100;
  out.speed = Math.round(out.speed);
  out.agility = Math.max(10, out.agility);
  out.hasDropTank = dropTanks > 0;
  return out;
}

/* ============================ 解禁判定ユーティリティ ============================ */

/** 設計要素（シャシー/モジュール/船体/機体）が必要とする技術IDの配列 */
export function requirementsOf(kind, slotOrItem, itemId) {
  let item = null;
  if (kind === 'tank') {
    if (slotOrItem === 'chassis') item = TANK_CHASSIS.find((x) => x.id === itemId);
    else item = (TANK_MODULES[slotOrItem] || []).find((x) => x.id === itemId);
  } else if (kind === 'naval') {
    if (slotOrItem === 'hull') item = NAVAL_HULLS.find((x) => x.id === itemId);
    else item = (NAVAL_MODULES[slotOrItem] || []).find((x) => x.id === itemId);
  } else if (kind === 'air') {
    if (slotOrItem === 'airframe') item = AIRFRAMES.find((x) => x.id === itemId);
    else item = (AIR_MODULES[slotOrItem] || []).find((x) => x.id === itemId);
  }
  if (!item || !item.requires) return [];
  return Array.isArray(item.requires) ? item.requires : [item.requires];
}
