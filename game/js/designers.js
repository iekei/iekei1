/**
 * designers.js — 兵器設計マネージャ（戦車 / 艦艇 / 航空機）
 *
 * HOI4 の装備設計画面（Equipment Designer）に相当する。
 *  - 車体/船体/機体（Chassis）を選び、スロットへモジュールを組み込む
 *  - モジュールは研究（ResearchManager）で解禁される: `requires` の技術が未研究なら装着不可
 *  - 装着内容に応じて最終ステータス（速度・信頼性・攻撃力・生産コスト等）を再計算
 *  - 設計は state.equipmentDesigns に保存され、生産ライン/師団に反映できる
 *
 * 研究状況の参照:
 *  - state.researched（ResearchManager.syncPlayerState() が更新する Set）を第一の真実とする
 *  - research マネージャを渡した場合は progressFor(tag).researched も参照する
 */

import { uid } from './util.js';
import {
  TANK_CHASSIS, TANK_MODULES, TANK_SLOTS, calcTankStats,
  NAVAL_HULLS, NAVAL_MODULES, calcNavalStats, navalSlotCaps,
  AIRFRAMES, AIR_MODULES, AIR_SLOTS, calcAirStats,
  requirementsOf,
} from './data/equipment.js';

const KIND_DATA = {
  tank: { chassisList: TANK_CHASSIS, chassisKey: 'chassisId', modules: TANK_MODULES, slots: TANK_SLOTS },
  naval: { chassisList: NAVAL_HULLS, chassisKey: 'hullId', modules: NAVAL_MODULES, slots: null },
  air: { chassisList: AIRFRAMES, chassisKey: 'airframeId', modules: AIR_MODULES, slots: AIR_SLOTS },
};

export class EquipmentDesigner {
  constructor(state, research = null) {
    this.state = state;
    this.research = research;
    // 現在編集中の設計: {chassisId, modules:{slot: id | [ids]}}
    this.current = {
      tank: {
        chassisId: 'light_1',
        modules: {
          gun: 'small_cannon', turret: 'one_man_turret', suspension: 'bogey_suspension',
          engine: 'petrol_engine', armor: 'welded_armor', radio: 'no_radio', special: [],
        },
      },
      naval: {
        hullId: 'destroyer_1',
        modules: {
          main_battery: ['light_main_battery'], secondary: [], anti_air: ['anti_air_battery'],
          torpedo: ['torpedo_tubes'], electronics: [], engine: ['diesel_engine_ship'], armor: [], special: [],
        },
      },
      air: {
        airframeId: 'fighter_1',
        modules: { engine: 'piston_engine', weapons: ['machine_gun_armament'], special: [] },
      },
    };
  }

  /* ================= 研究（アンロック）判定 ================= */

  researchManager() {
    // main.js で後から注入されるケースにも対応
    if (!this.research && this.state?._researchMgr) this.research = this.state._researchMgr;
    return this.research;
  }

  /** 技術が研究済みか */
  isResearched(techId) {
    if (!techId) return true;
    const tag = this.state.playerTag;
    const rm = this.researchManager();
    if (rm && rm.progressFor) {
      try {
        if (rm.progressFor(tag).researched.has(techId)) return true;
      } catch { /* progressFor 未初期化など */ }
    }
    return this.state.researched?.has?.(techId) === true;
  }

  /** 設計要素が解禁済みか（requires を全て満たすこと） */
  isUnlocked(kind, slotOrItem, itemId) {
    const reqs = requirementsOf(kind, slotOrItem, itemId);
    return reqs.every((t) => this.isResearched(t));
  }

  /** 未解禁の必要技術一覧 */
  lockedBy(kind, slotOrItem, itemId) {
    return requirementsOf(kind, slotOrItem, itemId).filter((t) => !this.isResearched(t));
  }

  /** スロットに並べる候補（解禁済みフラグ付き） */
  options(kind, slot) {
    const list = (KIND_DATA[kind]?.modules?.[slot]) || [];
    return list.map((mod) => ({
      ...mod,
      unlocked: this.isUnlocked(kind, slot, mod.id),
      lockedBy: this.lockedBy(kind, slot, mod.id),
    }));
  }

  /** シャシー/船体/機体の候補（解禁済みフラグ付き） */
  chassisOptions(kind) {
    const list = KIND_DATA[kind]?.chassisList || [];
    const key = kind === 'naval' ? 'hull' : kind === 'air' ? 'airframe' : 'chassis';
    return list.map((c) => ({
      ...c,
      unlocked: this.isUnlocked(kind, key, c.id),
      lockedBy: this.lockedBy(kind, key, c.id),
    }));
  }

  /* ================= 共通: スロット操作 ================= */

  _slotDef(kind, slot) {
    return (KIND_DATA[kind]?.slots || []).find((s) => s.id === slot) || null;
  }

  /** スロットへの装着（単選/複選/上限チェック/研究チェック） */
  equip(kind, slot, moduleId) {
    const def = KIND_DATA[kind];
    if (!def) return { ok: false, reason: 'unknown-kind' };
    const mod = (def.modules[slot] || []).find((m) => m.id === moduleId);
    if (!mod) return { ok: false, reason: 'unknown-module' };
    if (!this.isUnlocked(kind, slot, moduleId)) {
      return { ok: false, reason: 'locked', requires: this.lockedBy(kind, slot, moduleId) };
    }
    const cur = this.current[kind];
    const slotDef = this._slotDef(kind, slot);
    const multi = slotDef ? slotDef.type === 'multi' : Array.isArray(cur.modules[slot]);

    if (multi) {
      const arr = Array.isArray(cur.modules[slot]) ? cur.modules[slot] : (cur.modules[slot] = []);
      const max = slotDef?.max ?? (kind === 'naval' ? (navalSlotCaps(cur.hullId)[slot] ?? 1) : 2);
      if (arr.includes(moduleId)) { arr.splice(arr.indexOf(moduleId), 1); return { ok: true, action: 'removed' }; }
      if (arr.length >= max) {
        // 上限に達したら古いものと入れ替え（HOI4 のスロット入れ替えに相当）
        arr.shift();
      }
      arr.push(moduleId);
      return { ok: true, action: 'added' };
    }
    cur.modules[slot] = moduleId;
    return { ok: true, action: 'set' };
  }

  unequip(kind, slot, moduleId = null) {
    const cur = this.current[kind];
    if (!cur) return false;
    const arr = cur.modules[slot];
    if (Array.isArray(arr)) {
      if (moduleId == null) cur.modules[slot] = [];
      else cur.modules[slot] = arr.filter((x) => x !== moduleId);
    } else if (slot === 'special') {
      cur.modules[slot] = (cur.modules[slot] || []).filter((x) => x !== moduleId);
    } else {
      delete cur.modules[slot];
    }
    return true;
  }

  /** シャシー/船体/機体の変更（解禁チェック） */
  setChassis(kind, id) {
    const def = KIND_DATA[kind];
    const item = def?.chassisList.find((c) => c.id === id);
    if (!item) return { ok: false, reason: 'unknown' };
    const key = kind === 'naval' ? 'hull' : kind === 'air' ? 'airframe' : 'chassis';
    if (!this.isUnlocked(kind, key, id)) return { ok: false, reason: 'locked', requires: this.lockedBy(kind, key, id) };
    this.current[kind][def.chassisKey] = id;
    // スロット上限が変わったら超過分を落とす
    if (kind === 'naval') this._trimNaval();
    return { ok: true };
  }

  _trimNaval() {
    const caps = navalSlotCaps(this.current.naval.hullId);
    for (const [slot, list] of Object.entries(this.current.naval.modules)) {
      if (!Array.isArray(list)) continue;
      const cap = caps[slot] ?? 0;
      if (list.length > cap) this.current.naval.modules[slot] = list.slice(0, cap);
    }
  }

  /* ================= 戦車 ================= */

  setTankChassis(id) { return this.setChassis('tank', id); }
  setTankModule(slot, id) { return this.equip('tank', slot, id); }
  tankStats() { return calcTankStats(this.current.tank.chassisId, this.current.tank.modules); }

  saveTankDesign(name) {
    return this._save('tank', name || '新型戦車設計');
  }

  /* ================= 艦艇 ================= */

  setNavalHull(id) { return this.setChassis('naval', id); }
  toggleNavalModule(slot, id) { return this.equip('naval', slot, id); }
  navalStats() { return calcNavalStats(this.current.naval.hullId, this.current.naval.modules); }

  saveNavalDesign(name) {
    return this._save('naval', name || '新型艦艇設計');
  }

  /* ================= 航空機 ================= */

  setAirframe(id) { return this.setChassis('air', id); }
  setAirModule(slot, id) { return this.equip('air', slot, id); }
  airStats() { return calcAirStats(this.current.air.airframeId, this.current.air.modules); }

  saveAirDesign(name) {
    return this._save('air', name || '新型機設計');
  }

  /* ================= 保存・検証 ================= */

  _save(kind, name) {
    const cur = this.current[kind];
    const def = KIND_DATA[kind];
    const design = {
      id: uid('design'),
      kind,
      name,
      [def.chassisKey]: cur[def.chassisKey],
      modules: JSON.parse(JSON.stringify(cur.modules)),
      stats: this.stats(kind),
      nation: this.state.playerTag,
      date: this.state.dateLabel,
      issues: this.validate(kind).issues,
    };
    if (!this.state.equipmentDesigns[kind]) this.state.equipmentDesigns[kind] = [];
    this.state.equipmentDesigns[kind].push(design);
    this.state.bus?.emit?.('design-saved', { kind, design });
    return design;
  }

  stats(kind) {
    if (kind === 'tank') return this.tankStats();
    if (kind === 'naval') return this.navalStats();
    if (kind === 'air') return this.airStats();
    return null;
  }

  /** 設計の妥当性（未解禁モジュール・スロット超過など） */
  validate(kind) {
    const cur = this.current[kind];
    const def = KIND_DATA[kind];
    if (!cur || !def) return { ok: false, issues: ['unknown-kind'] };
    const issues = [];
    const key = kind === 'naval' ? 'hull' : kind === 'air' ? 'airframe' : 'chassis';
    if (!this.isUnlocked(kind, key, cur[def.chassisKey])) {
      issues.push(`ベース未解禁: ${this.lockedBy(kind, key, cur[def.chassisKey]).join(', ')}`);
    }
    for (const [slot, val] of Object.entries(cur.modules)) {
      const list = Array.isArray(val) ? val : (val ? [val] : []);
      for (const id of list) {
        if (!this.isUnlocked(kind, slot, id)) {
          issues.push(`${slot}: ${id} は未研究（${this.lockedBy(kind, slot, id).join(', ')}）`);
        }
      }
    }
    if (kind === 'naval') {
      const caps = navalSlotCaps(cur.hullId);
      for (const [slot, val] of Object.entries(cur.modules)) {
        const cap = caps[slot] ?? 0;
        if ((val || []).length > cap) issues.push(`${slot}: 上限 ${cap} を超過`);
      }
    }
    return { ok: issues.length === 0, issues };
  }

  /** 設計の要約（UI 用: ステータス + 研究状況） */
  summary(kind) {
    const stats = this.stats(kind);
    const validation = this.validate(kind);
    return { kind, stats, ...validation };
  }

  /** 増槽の効果説明（UI表示用） */
  dropTankInfo() {
    return { rangeMult: '×1.75〜×2.00', agilityPct: -10, costPct: +15 };
  }
}

export {
  TANK_CHASSIS, TANK_MODULES, TANK_SLOTS,
  NAVAL_HULLS, NAVAL_MODULES, navalSlotCaps,
  AIRFRAMES, AIR_MODULES, AIR_SLOTS,
  calcTankStats, calcNavalStats, calcAirStats,
};
