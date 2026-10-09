/**
 * division.js — 師団テンプレート（HOI Designer準拠 5×5大隊グリッド + 1×5支援中隊）
 *  全ステータスをリアルタイム再計算する DivisionTemplate クラス
 */

import { uid, clamp } from './util.js';
import { BATTALIONS, SUPPORT_COMPANIES } from './data/battalions.js';

export const GRID_W = 5, GRID_H = 5, SUPPORT_SLOTS = 5;

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
  addSupport(i, id) { if (i >= 0 && i < SUPPORT_SLOTS) this.support[i] = id; this._recalc(); }
  removeSupport(i) { if (i >= 0 && i < SUPPORT_SLOTS) this.support[i] = null; this._recalc(); }
  clear() { this.grid.fill(null); this.support.fill(null); this._recalc(); }

  _inGrid(i) { return Number.isInteger(i) && i >= 0 && i < this.grid.length; }

  get battalions() { return this.grid.filter(Boolean); }
  get supports() { return this.support.filter(Boolean); }

  /** 全ステータスのリアルタイム再計算 */
  _recalc() {
    const st = {
      org: 0, hp: 0, soft: 0, hard: 0, defense: 0, breakthrough: 0,
      piercing: 0, armor: 0, combatWidth: 0, supply: 0, speed: 99,
      ic: 0, manpower: 0,
    };
    const equipReq = {};
    let armorHp = 0, piercingHp = 0;
    for (const id of this.battalions) {
      const b = BATTALIONS[id];
      if (!b) continue;
      const s = b.stats;
      st.org += s.org; st.hp += s.hp;
      st.soft += s.soft; st.hard += s.hard;
      st.defense += s.def; st.breakthrough += s.bt;
      st.combatWidth += s.width; st.supply += s.supply;
      st.speed = Math.min(st.speed, s.speed);
      st.ic += s.ic; st.manpower += s.manpower;
      armorHp += s.armor * s.hp;
      st.piercing += s.piercing * (s.hp / 25);
      for (const [k, v] of Object.entries(b.equipment || {})) equipReq[k] = (equipReq[k] || 0) + v;
    }
    st.armor = st.hp > 0 ? Math.round(armorHp / st.hp) : 0;
    st.piercing = Math.round(st.piercing);
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
    const orgRate = st.org > 0 ? (50 + st.org) / 100 : 0.5; // 組織力による戦闘補正係数
    st.softAttack = Math.round(st.soft * orgRate * 10) / 10;
    st.hardAttack = Math.round(st.hard * orgRate * 10) / 10;
    st.breakthrough = Math.round(st.breakthrough * orgRate * 10) / 10;
    st.defense = Math.round(st.defense * orgRate * 10) / 10;
    st.supplyUse = Math.round(st.supply * (1 + (mod.supply || 0)) * 100) / 100;
    st.speed = st.speed === 99 ? 0 : Math.round(st.speed * 10) / 10;
    st.maxOrg = Math.round(st.org * (1 + (mod.org || 0)));
    st.armor = Math.round(st.armor * (1 + (mod.armor || 0)));
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

  static fromJSON(o) {
    const t = new DivisionTemplate(o.name, o.id);
    t.grid = [...o.grid];
    t.support = [...o.support];
    t.count = o.count || 0;
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
  const inf = bs.length - armor - arty;
  if (armor >= 8) return 'armor';
  if (armor >= 4) return 'mixed';
  if (arty >= 6) return 'artillery';
  return 'infantry';
}
