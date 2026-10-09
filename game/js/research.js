/**
 * research.js — 研究マネージャ（7大国家対応・独自研究日数・MIOアサイン対応）
 *
 * - 研究データは game/eng/tec/data/tech_*.json（HOI Designer準拠: id/title/year/x/y/research_time/prerequisites）
 * - 各技術ノードに独自の研究日数（research_time）を持ち、国家補正を乗算
 * - Tick（1時間）ごとに進捗。1日=24時間。残り日数をリアルタイム表示
 * - 研究枠（スロット）に技術をアサイン。完了時に装備配備解除・MIOに経験値
 */

import { I18N } from './i18n.js';
import { toast } from './util.js';

const TECH_FILES = {
  infantry: 'game/eng/tec/data/tech_infantry.json',
  armor: 'game/eng/tec/data/tech_armor.json',
  artillery: 'game/eng/tec/data/tech_artillery.json',
  air: 'game/eng/tec/data/tech_air.json',
  naval: 'game/eng/tec/data/tech_naval.json',
  industry: 'game/eng/tec/data/tech_industry.json',
  engineering: 'game/eng/tec/data/tech_engineering.json',
  support: 'game/eng/tec/data/tech_support.json',
};

const CATEGORY_ORDER = ['infantry', 'armor', 'artillery', 'air', 'naval', 'industry', 'engineering', 'support'];
const DAY_HOURS = 24;

/** 大文字小文字違い等で直ファイルが無い技術アイコンの補正マップ */
const TECH_ICON_FIX = {
  advanced_centimetric_radar: 'Advanced_centimetric_radar.png',
  advanced_computing_machine: 'Advanced_computing_machine.png',
  advanced_fire_control_system: 'Advanced_fire_control_system.png',
  advanced_rocket_engines: 'Advanced_rocket_engines.png',
  antiair1: 'Antiair1.png', antiair2: 'Antiair2.png',
  antitank2: 'Antitank2.png', antitank3: 'Antitank3.png',
  artillery1: 'Artillery1.png', artillery2: 'Artillery2.png',
  artillery3: 'Artillery3.png', artillery5: 'Artillery5.png',
  atomic_research: 'Atomic_Research.png',
  basic_decryption: 'Basic_decryption.png',
  basic_depth_charges: 'Basic_depth_charges.png',
  basic_fire_control_system: 'Basic_fire_control_system.png',
  basic_submarine: 'Basic_submarine.png',
  basic_submarine_snorkel: 'Basic_submarine_snorkel.png',
  basic_torpedo: 'Basic_torpedo.png',
  centimetric_radar: 'Centimetric_radar.png',
  computing_machine: 'Computing_machine.png',
  decimetric_radar: 'Decimetric_radar.png',
};

/** 技術アイコンのURL（補正マップ優先、なければ asset_key そのまま） */
export function techIconUrl(assetKey) {
  const file = TECH_ICON_FIX[assetKey] || `${assetKey}.png`;
  return `game/assets/technology/${file}`;
}

export class ResearchManager {
  constructor(state, mioManager) {
    this.state = state;
    this.mio = mioManager;
    this.categories = {};   // categoryId -> [nodes]
    this.nodes = {};        // techId -> node
    this.loaded = false;
    // 国家別進捗: tag -> { researched:Set, active:[{techId, progressDays, mioId}|null] }
    this.progress = {};
  }

  async load() {
    const entries = await Promise.all(Object.entries(TECH_FILES).map(async ([cat, url]) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        return [cat, await res.json()];
      } catch (e) {
        console.warn('[research] ロード失敗:', url, e);
        return [cat, []];
      }
    }));
    for (const [cat, nodes] of entries) {
      this.categories[cat] = nodes;
      for (const n of nodes) this.nodes[n.id] = { ...n, category: cat };
    }
    this.loaded = true;
    return this;
  }

  /** 国家別の研究進捗オブジェクトを取得（なければ初期化） */
  progressFor(tag) {
    if (!this.progress[tag]) {
      this.progress[tag] = { researched: new Set(), active: [null, null, null, null] };
    }
    return this.progress[tag];
  }

  /** 国家補正を反映した研究日数（独自日数） */
  researchDays(techId, tag) {
    const node = this.nodes[techId];
    if (!node) return 0;
    const nation = this.state.nation && tag === this.state.playerTag ? this.state.nation : null;
    const bonus = (nation?.researchBonus?.[node.category]) ?? 1.0;
    return Math.round(node.research_time * bonus);
  }

  /** 前提充足チェック */
  canResearch(techId, tag) {
    const node = this.nodes[techId];
    if (!node) return false;
    const prog = this.progressFor(tag);
    if (prog.researched.has(techId)) return false;
    return (node.prerequisites || []).every((p) => prog.researched.has(p));
  }

  /** スロットにアサイン（MIOアサイン付き） */
  assign(tag, slot, techId, mioId = null) {
    const prog = this.progressFor(tag);
    if (!this.canResearch(techId, tag)) return false;
    // 他スロットで研究中なら取り消し
    for (let i = 0; i < prog.active.length; i++) {
      if (prog.active[i]?.techId === techId && i !== slot) prog.active[i] = null;
    }
    prog.active[slot] = { techId, progressDays: 0, mioId };
    return true;
  }

  unassign(tag, slot) {
    const prog = this.progressFor(tag);
    prog.active[slot] = null;
  }

  /** 研究中スロットのMIOを変更 */
  assignMio(tag, slot, mioId) {
    const prog = this.progressFor(tag);
    if (prog.active[slot]) prog.active[slot].mioId = mioId;
  }

  /** 残り日数（MIOボーナス反映） */
  daysRemaining(techId, tag, slot = 0) {
    const node = this.nodes[techId];
    const prog = this.progressFor(tag);
    const active = prog.active[slot];
    if (!node) return 0;
    const total = this.researchDays(techId, tag);
    const done = active?.techId === techId ? active.progressDays : 0;
    const rate = this._rate(tag, active?.mioId);
    return Math.max(0, (total - done) / rate);
  }

  /** 1スロットの研究速度（1日あたりの研究日数） */
  _rate(tag, mioId) {
    let rate = 1.0; // 基本: 1スロット = 1日/研究日
    if (mioId && this.mio) {
      const mio = this.mio.get(mioId);
      if (mio) rate *= 1 + mio.researchSpeedBonus();
    }
    return rate;
  }

  /** Tick処理: hours 時間ぶん研究を進める */
  tick(tag, hours) {
    const prog = this.progressFor(tag);
    for (let slot = 0; slot < prog.active.length; slot++) {
      const a = prog.active[slot];
      if (!a) continue;
      const node = this.nodes[a.techId];
      if (!node) { prog.active[slot] = null; continue; }
      const total = this.researchDays(a.techId, tag);
      a.progressDays += (hours / DAY_HOURS) * this._rate(tag, a.mioId);
      if (a.progressDays >= total) {
        this._complete(tag, slot, a);
      }
    }
  }

  _complete(tag, slot, a) {
    const prog = this.progressFor(tag);
    prog.researched.add(a.techId);
    prog.active[slot] = null;
    const node = this.nodes[a.techId];
    const name = I18N.techName(a.techId, node.title);
    toast(I18N.t('research.completed', { name }), 'good');
    // 装備配備解除
    for (const eff of node.effects || []) {
      const m = /^配備可能: (.+)$/.exec(eff);
      if (m && tag === this.state.playerTag) {
        this.state.bus.emit('equipment-unlocked', m[1]);
      }
    }
    // MIOに経験値
    if (a.mioId && this.mio) this.mio.gainXP(a.mioId, 25, tag);
    this.state.bus.emit('research-completed', { tag, techId: a.techId, slot });
  }

  /** 国家変更時などにプレイヤー状態を同期 */
  syncPlayerState() {
    const prog = this.progressFor(this.state.playerTag);
    this.state.researched = prog.researched;
    this.state.research = { slots: prog.active.length, active: prog.active.slice(0, 2).map((a) => a ? { techId: a.techId, progressDays: a.progressDays, mioId: a.mioId } : null) };
  }

  categoryList() { return CATEGORY_ORDER; }

  nodesOf(category) { return this.categories[category] || []; }
}
