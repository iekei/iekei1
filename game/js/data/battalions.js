/** data/battalions.js — 大隊・支援中隊の基礎ステータス定義（師団設計用） */

const LU = 'game/assets/land_units';

/**
 * stats: org組織力 / hp人員 / soft対人 / hard対装甲 / def防御 / bt突破
 *        piercing貫通 / armor装甲 / width戦闘幅 / supply補給 / speed速度 / ic工場コスト
 * equipment: 生産に必要な装備（キー:個数）
 */
export const BATTALIONS = {
  infantry:       { type: 'infantry', icon: `${LU}/unit_infantry_icon.png`,       stats: { org: 60, hp: 25, soft: 12, hard: 2,  def: 48, bt: 4,  piercing: 5,  armor: 0,  width: 2, supply: 0.20, speed: 4,  ic: 0.6, manpower: 100 }, equipment: { infantry_equipment_1: 100 } },
  motorized:      { type: 'infantry', icon: `${LU}/unit_motorized_icon.png`,      stats: { org: 60, hp: 25, soft: 14, hard: 3,  def: 40, bt: 6,  piercing: 8,  armor: 0,  width: 2, supply: 0.35, speed: 8,  ic: 1.2, manpower: 100 }, equipment: { infantry_equipment_1: 100, motorized_equipment_1: 50 } },
  mechanized:     { type: 'infantry', icon: `${LU}/unit_mechanized_icon.png`,     stats: { org: 50, hp: 25, soft: 15, hard: 8,  def: 45, bt: 8,  piercing: 12, armor: 18, width: 2, supply: 0.40, speed: 8,  ic: 2.5, manpower: 100 }, equipment: { mechanized_equipment_1: 50 } },
  cavalry:        { type: 'infantry', icon: `${LU}/unit_cavalry_icon.png`,       stats: { org: 60, hp: 25, soft: 15, hard: 3,  def: 30, bt: 8,  piercing: 6,  armor: 0,  width: 2, supply: 0.25, speed: 10, ic: 0.8, manpower: 100 }, equipment: { infantry_equipment_1: 80 } },
  paratroopers:   { type: 'infantry', icon: `${LU}/unit_paratroop_icon.png`,     stats: { org: 60, hp: 25, soft: 16, hard: 4,  def: 52, bt: 8,  piercing: 8,  armor: 0,  width: 2, supply: 0.30, speed: 5,  ic: 1.5, manpower: 100 }, equipment: { infantry_equipment_1: 100, support_weapons: 20 } },
  marines:        { type: 'infantry', icon: `${LU}/unit_marine_icon.png`,        stats: { org: 65, hp: 25, soft: 16, hard: 4,  def: 56, bt: 8,  piercing: 8,  armor: 0,  width: 2, supply: 0.30, speed: 4,  ic: 1.5, manpower: 100 }, equipment: { infantry_equipment_1: 100, support_weapons: 20 } },
  mountaineers:   { type: 'infantry', icon: `${LU}/unit_mountain_icon.png`,      stats: { org: 65, hp: 25, soft: 15, hard: 4,  def: 58, bt: 6,  piercing: 8,  armor: 0,  width: 2, supply: 0.25, speed: 3,  ic: 1.2, manpower: 100 }, equipment: { infantry_equipment_1: 100, artillery1: 20 } },
  armored_car:    { type: 'infantry', icon: `${LU}/unit_armored_car_icon.png`,   stats: { org: 50, hp: 20, soft: 14, hard: 6,  def: 35, bt: 12, piercing: 14, armor: 12, width: 2, supply: 0.30, speed: 10, ic: 1.5, manpower: 80 },  equipment: { infantry_equipment_1: 60, motorized_equipment_1: 40 } },
  light_tank:     { type: 'armor',    icon: `${LU}/unit_light_tank_icon.png`,    stats: { org: 50, hp: 25, soft: 15, hard: 10, def: 32, bt: 20, piercing: 28, armor: 30, width: 2, supply: 0.40, speed: 9,  ic: 3.0, manpower: 80 },  equipment: { light_tank_equipment_1: 50 } },
  medium_tank:    { type: 'armor',    icon: `${LU}/unit_medium_tank_icon.png`,   stats: { org: 50, hp: 25, soft: 20, hard: 25, def: 36, bt: 35, piercing: 60, armor: 50, width: 2, supply: 0.50, speed: 8,  ic: 4.0, manpower: 80 },  equipment: { medium_tank_equipment_1: 50 } },
  heavy_tank:     { type: 'armor',    icon: `${LU}/unit_heavy_armor_icon.png`,   stats: { org: 50, hp: 30, soft: 25, hard: 45, def: 40, bt: 50, piercing: 90, armor: 80, width: 2, supply: 0.65, speed: 6,  ic: 6.0, manpower: 80 },  equipment: { heavy_tank_equipment_1: 50 } },
  modern_tank:    { type: 'armor',    icon: `${LU}/unit_modern_armor_icon.png`,  stats: { org: 55, hp: 30, soft: 32, hard: 58, def: 44, bt: 60, piercing: 110, armor: 95, width: 2, supply: 0.70, speed: 9, ic: 8.0, manpower: 80 }, equipment: { modern_tank_equipment_1: 50 } },
  artillery:      { type: 'artillery', icon: `${LU}/unit_art_icon.png`,         stats: { org: 40, hp: 25, soft: 28, hard: 6,  def: 20, bt: 4,  piercing: 10, armor: 0,  width: 3, supply: 0.35, speed: 4,  ic: 2.0, manpower: 100 }, equipment: { artillery1: 60 } },
  rocket_artillery:{ type: 'artillery', icon: `${LU}/unit_rocket_art_icon.png`, stats: { org: 40, hp: 25, soft: 45, hard: 12, def: 20, bt: 4,  piercing: 14, armor: 0,  width: 3, supply: 0.45, speed: 5,  ic: 3.0, manpower: 100 }, equipment: { artillery1: 40, motorized_equipment_1: 40 } },
  sp_artillery:   { type: 'artillery', icon: `${LU}/unit_light_tank_artillery_icon.png`, stats: { org: 45, hp: 25, soft: 36, hard: 14, def: 25, bt: 10, piercing: 30, armor: 20, width: 3, supply: 0.50, speed: 6, ic: 3.5, manpower: 100 }, equipment: { artillery1: 50, light_tank_equipment_1: 20 } },
  anti_tank:      { type: 'artillery', icon: `${LU}/unit_at_icon.png`,          stats: { org: 45, hp: 25, soft: 10, hard: 35, def: 32, bt: 6,  piercing: 45, armor: 0,  width: 2, supply: 0.30, speed: 4,  ic: 1.5, manpower: 100 }, equipment: { antitank1: 60 } },
  anti_air:       { type: 'artillery', icon: `${LU}/unit_anti_air_icon.png`,    stats: { org: 45, hp: 25, soft: 20, hard: 8,  def: 32, bt: 4,  piercing: 20, armor: 0,  width: 2, supply: 0.30, speed: 4,  ic: 1.5, manpower: 100 }, equipment: { antiair1: 60 } },
  tank_destroyer: { type: 'armor',    icon: `${LU}/unit_medium_tank_at_icon.png`, stats: { org: 50, hp: 25, soft: 15, hard: 65, def: 34, bt: 30, piercing: 85, armor: 40, width: 2, supply: 0.50, speed: 6, ic: 4.5, manpower: 80 }, equipment: { medium_tank_equipment_1: 40, antitank2: 40 } },
};

/** 支援中隊: mod =師団全体への乗算補正 */
export const SUPPORT_COMPANIES = {
  engineer:         { icon: `${LU}/unit_engineer_icon.png`, stats: {}, mod: { org: 0.10, entrench: 1 }, support: { engineer: 1 } },
  recon:            { icon: `${LU}/support_unit_motorized_recon_icon.png`, stats: { soft: 4, hard: 1, def: 4 }, mod: { soft: 0.05, defense: 0.05, speed: 0.05 } },
  artillery_support:{ icon: `${LU}/support_unit_art_icon.png`, stats: { soft: 12, hard: 2 }, mod: { soft: 0.10 } },
  anti_air_support: { icon: `${LU}/support_unit_anti_air_icon.png`, stats: { soft: 6 }, mod: { air_defense: 0.10 } },
  anti_tank_support:{ icon: `${LU}/support_unit_at_icon.png`, stats: { hard: 8, piercing: 6 }, mod: { hard: 0.05 } },
  field_hospital:   { icon: `${LU}/support_unit_field_hospital_icon.png`, stats: {}, mod: { hp_recovery: 0.10 } },
  logistics:        { icon: `${LU}/support_unit_logistics_company_icon.png`, stats: {}, mod: { supply: -0.15, org: 0.05 } },
  signal:           { icon: `${LU}/support_unit_signal_company_icon.png`, stats: {}, mod: { org: 0.05, defense: 0.05 } },
  maintenance:      { icon: `${LU}/support_unit_maintenance_company_icon.png`, stats: {}, mod: { reliability: 0.10 } },
  military_police:  { icon: `${LU}/support_unit_military_police_icon.png`, stats: {}, mod: { stability: 0.05, suppression: 1 } },
};

export function battalionIcon(id) {
  const b = BATTALIONS[id];
  return b ? b.icon : '';
}
export function supportIcon(id) {
  const s = SUPPORT_COMPANIES[id];
  if (!s) return '';
  return s.icon;
}
