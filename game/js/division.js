/**
 * division.js — 師団テンプレート（HOI Designer準拠 5×5大隊グリッド + 1×5支援中隊）
 *  全ステータスをリアルタイム再計算する DivisionTemplate クラス
 *
 *  計算モデル（HOI4 準拠の簡易版）
 *    ・攻撃 / 防御 / 突破 / 貫通 : 大隊ごとの値を合計（支援中隊の直接値も加算）
 *    ・組織力                    : 大隊の平均値に支援中隊の乗算補正を適用
 *    ・装甲 / 硬度 / 貫通        : 人員（HP）で加重平均
 *    ・速度                      : 大隊のうち最も遅いもの（支援中隊の補正を適用）
 *    ・戦闘幅 / 補給 / コスト    : 合計
 *  支援中隊の `mod` は師団全体への乗算補正（0.10 = +10%）。
 */

import { uid, clamp } from './util.js';
import { BATTALIONS, SUPPORT_COMPANIES } from './data/battalions.js';

export const GRID_W = 5, GRID_H = 5, SUPPORT_SLOTS = 5;
export const MAX_BATTALIONS = GRID_W * GRID_H;

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

export class DivisionTemplate {
  constructor(name = '新型師団', id = null) {
    this.id = id || uid('div');
    this.name = name;
    this.grid = new Array(GRID_W * GRID_H).fill(null); // 大隊ID
    this.support = new Array(SUPPORT_SLOTS).fill(null); // 支援中隊ID
    this.count = 0; // 配備済み師団数
    this._recalc(); // 初期ステータス計算
  }

  add(i, battalionId) { if (this._inGrid(i)) this.grid[i] = battalionId; this._recalc(); }
  remove(i) { if (this._inGrid(i)) { this.grid[i] = null; } this._recalc(); }
  toggle(i, battalionId) { if (this.grid[i] === battalionId) this.remove(i); else this.add(i, battalionId); }

  /** 支援中隊を配置（同じ中隊の重複は自動的に取り除く） */
  addSupport(i, id) {
    if (i < 0 || i >= SUPPORT_SLOTS) return;
    const prev = this.support.indexOf(id);
    if (prev >= 0 && prev !== i) this.support[prev] = null;
    this.support[i] = id;
    this._recalc();
  }
  removeSupport(i) { if (i >= 0 && i < SUPPORT_SLOTS) this.support[i] = null; this._recalc(); }

  clear() { this.grid.fill(null); this.support.fill(null); this._recalc(); }

  _inGrid(i) { return Number.isInteger(i) && i >= 0 && i < this.grid.length; }

  get battalions() { return this.grid.filter(Boolean); }
  get supports() { return this.support.filter(Boolean); }
  get battalionCount() { return this.battalions.length; }
  get supportCount() { return this.supports.length; }
  get isEmpty() { return this.battalionCount === 0; }

  /** 大隊ごとの内訳（UI のツールチップ用） */
  composition() {
    const comp = {};
    for (const id of this.battalions) comp[id] = (comp[id] || 0) + 1;
    return comp;
  }

  /** 全ステータスのリアルタイム再計算 */
  _recalc() {
    const st = {
      org: 0, hp: 0, soft: 0, hard: 0, defense: 0, breakthrough: 0,
      piercing: 0, armor: 0, hardness: 0, combatWidth: 0, supply: 0, speed: 0,
      ic: 0, manpower: 0, trainDays: 0,
    };
    const equipReq = {};
    let armorHp = 0, piercingHp = 0, hardnessHp = 0;
    let orgSum = 0, battalions = 0, armorCount = 0, artilleryCount = 0, specialCount = 0;
    let minSpeed = Infinity;

    for (const id of this.battalions) {
      const b = BATTALIONS[id];
      if (!b) continue;
      const s = b.stats;
      battalions += 1;
      orgSum += s.org;
      st.hp += s.hp;
      st.soft += s.soft;
      st.hard += s.hard;
      st.defense += s.def;
      st.breakthrough += s.bt;
      st.combatWidth += s.width;
      st.supply += s.supply;
      st.ic += s.ic;
      st.manpower += s.manpower;
      // 装甲 / 貫通 / 硬度は HP で加重平均
      const hardness = b.type === 'armor' ? 0.9 : (id === 'mechanized' || id === 'armored_car' ? 0.55 : 0);
      armorHp += (s.armor || 0) * s.hp;
      piercingHp += (s.piercing || 0) * s.hp;
      hardnessHp += hardness * s.hp;
      if (b.type === 'armor') armorCount += 1;
      else if (b.type === 'artillery') artilleryCount += 1;
      else if (['paratroopers', 'marines', 'mountaineers'].includes(id)) specialCount += 1;
      minSpeed = Math.min(minSpeed, s.speed);
      for (const [k, v] of Object.entries(b.equipment || {})) equipReq[k] = (equipReq[k] || 0) + v;
    }
    st.org = battalions > 0 ? orgSum / battalions : 0;
    st.armor = st.hp > 0 ? armorHp / st.hp : 0;
    st.piercing = st.hp > 0 ? piercingHp / st.hp : 0;
    st.hardness = st.hp > 0 ? hardnessHp / st.hp : 0;
    st.speed = battalions > 0 ? minSpeed : 0;

    // 支援中隊: 乗算補正 + 直接ステータス
    const mod = {};
    for (const id of this.supports) {
      const c = SUPPORT_COMPANIES[id];
      if (!c) continue;
      for (const [k, v] of Object.entries(c.mod || {})) mod[k] = (mod[k] || 0) + v;
      if (c.stats) {
        st.soft += c.stats.soft || 0;
        st.hard += c.stats.hard || 0;
        st.defense += c.stats.def || 0;
        st.piercing += c.stats.piercing || 0;
      }
    }

    // 表示用（支援補正を適用した最終値）
    st.maxOrg = Math.round(st.org * (1 + (mod.org || 0)));
    st.softAttack = r1(st.soft * (1 + (mod.soft || 0)));
    st.hardAttack = r1(st.hard * (1 + (mod.hard || 0)));
    st.breakthrough = r1(st.breakthrough);
    st.defense = r1(st.defense * (1 + (mod.defense || 0)));
    st.piercing = Math.round(st.piercing);
    st.armor = Math.round(st.armor * (1 + (mod.armor || 0)));
    st.hardness = Math.round(st.hardness * 100);
    st.combatWidth = Math.round(st.combatWidth);
    st.supply = r2(st.supply);
    st.supplyUse = r2(st.supply * (1 + (mod.supply || 0)));
    st.speed = battalions > 0 ? r1(minSpeed * (1 + (mod.speed || 0))) : 0;
    st.ic = r1(st.ic);
    st.buildCost = st.ic;
    st.manpower = Math.round(st.manpower);
    // 訓練日数: 基礎60日 + 機甲・砲兵・特殊大隊で延長（最大180日）
    st.trainDays = battalions > 0
      ? clamp(Math.round(60 + armorCount * 9 + artilleryCount * 4 + specialCount * 6), 60, 180)
      : 0;
    // 組織率: 満編成（組織力60）に対する割合
    st.orgRate = battalions > 0 ? clamp(Math.round((st.maxOrg / 60) * 100), 0, 120) : 0;
    // 装備充足に必要な合計数
    st.equipmentTotal = Object.values(equipReq).reduce((a, b) => a + b, 0);

    this.stats = st;
    this.equipment = equipReq;
    this.modifiers = mod;
  }

  /** 複製 */
  clone(name) {
    const t = new DivisionTemplate(name || `${this.name}（複製）`);
    t.grid = [...this.grid];
    t.support = [...this.support];
    t._recalc();
    return t;
  }

  /** JSON へ書き出し（保存用） */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      grid: [...this.grid],
      support: [...this.support],
      count: this.count || 0,
      stats: { ...this.stats },
      equipment: { ...this.equipment },
    };
  }

  static fromJSON(o) {
    const t = new DivisionTemplate(o?.name || '新型師団', o?.id);
    const grid = Array.isArray(o?.grid) ? o.grid.slice(0, GRID_W * GRID_H) : [];
    t.grid = new Array(GRID_W * GRID_H).fill(null);
    grid.forEach((id, i) => { if (id && BATTALIONS[id]) t.grid[i] = id; });
    const sup = Array.isArray(o?.support) ? o.support.slice(0, SUPPORT_SLOTS) : [];
    t.support = new Array(SUPPORT_SLOTS).fill(null);
    sup.forEach((id, i) => { if (id && SUPPORT_COMPANIES[id]) t.support[i] = id; });
    t.count = Math.max(0, Number(o?.count) || 0);
    t._recalc();
    return t;
  }
}

/** HOI4風師団タイプの判定（表示用） */
export function divisionType(tpl) {
  const bs = tpl.battalions;
  if (!bs.length) return 'empty';
  const armor = bs.filter((b) => BATTALIONS[b]?.type === 'armor').length;
  const arty = bs.filter((b) => BATTALIONS[b]?.type === 'artillery').length;
  const motorized = bs.filter((b) => ['motorized', 'mechanized', 'armored_car'].includes(b)).length;
  const inf = bs.length - armor - arty - motorized;
  if (armor >= 5) return 'armor';
  if (armor >= 2) return 'mixed';
  if (motorized >= 5) return 'motorized';
  if (arty >= 6) return 'artillery';
  if (inf === 0 && arty > 0) return 'artillery';
  return 'infantry';
}

/** 師団タイプの日本語ラベル */
export const DIVISION_TYPE_LABELS = {
  empty: '未編成',
  infantry: '歩兵師団',
  armor: '装甲師団',
  mixed: '機械化師団',
  motorized: '自動車化師団',
  artillery: '砲兵師団',
};

/** 師団タイプに応じたアイコン（UI 用） */
export function divisionTypeIcon(type) {
  const LU = 'game/assets/land_units';
  switch (type) {
    case 'armor': return `${LU}/unit_medium_tank_icon.png`;
    case 'mixed': return `${LU}/unit_mechanized_icon.png`;
    case 'motorized': return `${LU}/unit_motorized_icon.png`;
    case 'artillery': return `${LU}/unit_art_icon.png`;
    case 'infantry': return `${LU}/unit_infantry_icon.png`;
    default: return '';
  }
}
