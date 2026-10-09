/**
 * designers.js — 兵器設計マネージャ（戦車 / 艦艇 / 航空機）
 *
 * - 車体/船体/機体の選択 + モジュール構成
 * - 全ステータスのリアルタイム計算（calcTankStats / calcNavalStats / calcAirStats を使用）
 * - 航空機: 増槽（Drop Tank）モジュールで航続距離+75%〜100% / 機動性-10% / 生産コスト+15%
 * - 設計は保存され生産ライン・師団に反映可能
 */

import { uid } from './util.js';
import {
  TANK_CHASSIS, TANK_MODULES, calcTankStats,
  NAVAL_HULLS, NAVAL_MODULES, calcNavalStats,
  AIRFRAMES, AIR_MODULES, calcAirStats,
} from './data/equipment.js';

export class EquipmentDesigner {
  constructor(state) {
    this.state = state;
    // 現在編集中の設計: {chassisId, modules:{slot:[ids]}}
    this.current = {
      tank: { chassisId: 'medium_1', modules: { gun: 'medium_cannon', turret: 'two_man_turret', suspension: 'bogie_suspension', engine: 'petrol_engine', armor: 'welded_armor', special: ['smoke_launchers', 'additional_hmg'] } },
      naval: { hullId: 'destroyer_1', modules: { main_battery: ['light_main_battery'], secondary: ['secondary_battery'], anti_air: ['anti_air_battery'], torpedo: ['torpedo_tubes'], electronics: ['naval_sonar'], engine: ['diesel_engine_ship'], armor: [], special: [] } },
      air: { airframeId: 'fighter_1', modules: { engine: 'piston_engine', weapons: ['machine_gun_armament'], special: [] } },
    };
  }

  /* ---------- 戦車 ---------- */
  setTankChassis(id) { this.current.tank.chassisId = id; }
  setTankModule(slot, id) {
    if (slot === 'special') {
      const arr = this.current.tank.modules.special;
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else if (arr.length < 4) arr.push(id);
    } else this.current.tank.modules[slot] = id;
  }
  tankStats() { return calcTankStats(this.current.tank.chassisId, this.current.tank.modules); }
  saveTankDesign(name) {
    const design = {
      id: uid('design'), kind: 'tank', name: name || '新型戦車設計',
      chassisId: this.current.tank.chassisId, modules: JSON.parse(JSON.stringify(this.current.tank.modules)),
      stats: this.tankStats(), nation: this.state.playerTag,
    };
    this.state.equipmentDesigns.tank.push(design);
    return design;
  }

  /* ---------- 艦艇 ---------- */
  setNavalHull(id) { this.current.naval.hullId = id; }
  toggleNavalModule(slot, id) {
    const arr = this.current.naval.modules[slot] || (this.current.naval.modules[slot] = []);
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
  }
  navalStats() { return calcNavalStats(this.current.naval.hullId, this.current.naval.modules); }
  saveNavalDesign(name) {
    const design = {
      id: uid('design'), kind: 'naval', name: name || '新型艦艇設計',
      hullId: this.current.naval.hullId, modules: JSON.parse(JSON.stringify(this.current.naval.modules)),
      stats: this.navalStats(), nation: this.state.playerTag,
    };
    this.state.equipmentDesigns.naval.push(design);
    return design;
  }

  /* ---------- 航空機 ---------- */
  setAirframe(id) { this.current.air.airframeId = id; }
  setAirModule(slot, id) {
    if (slot === 'weapons' || slot === 'special') {
      const arr = this.current.air.modules[slot] || (this.current.air.modules[slot] = []);
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else arr.push(id);
    } else this.current.air.modules[slot] = id;
  }
  airStats() { return calcAirStats(this.current.air.airframeId, this.current.air.modules); }
  saveAirDesign(name) {
    const design = {
      id: uid('design'), kind: 'air', name: name || '新型機設計',
      airframeId: this.current.air.airframeId, modules: JSON.parse(JSON.stringify(this.current.air.modules)),
      stats: this.airStats(), nation: this.state.playerTag,
    };
    this.state.equipmentDesigns.air.push(design);
    return design;
  }

  /** 増槽の効果説明（UI表示用） */
  dropTankInfo() {
    return { rangeMult: '×1.75〜×2.00', agilityPct: -10, costPct: +15 };
  }
}

export { TANK_CHASSIS, TANK_MODULES, NAVAL_HULLS, NAVAL_MODULES, AIRFRAMES, AIR_MODULES };
