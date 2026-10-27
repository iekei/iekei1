/**
 * intel.js — 諜報機関（Intelligence Agency）・エージェント・ネットワーク・インテル
 *
 *  ・政治力（PP）を消費して諜報機関を設立し、4 系統のアップグレードツリーを強化する
 *      機関本部 / 暗号解読チーム / 政府への潜入 / 特殊部隊
 *  ・エージェントを雇用し、対象国へ任務（ネットワーク構築 / プロパガンダ / 暗号解読支援 /
 *    破壊工作 / 技術窃取 / クーデター支援）を指示する
 *  ・対象国ごとのネットワーク進捗とインテル値から **インテルレベル（0-100）** を算出し、
 *    政治情報 → 経済情報 → 軍事情報 の順に「見える」情報が増える
 *  ・軍事情報が解禁されると、マップ上に敵の師団配置（推計）が表示される（map-engine が参照）
 *
 *  既存 API（operatives / recruit / assignMission / unassign / tick / missions / targets / intelOn）は
 *  互換のまま、返り値を { ok, reason } 形式に拡張している。
 */

import { I18N } from './i18n.js';
import { clamp, store, toast, uid } from './util.js';
import { OPERATIVES, INTEL_MISSIONS } from './data/operatives.js';
import { MAJORS, NATIONS, nationName } from './data/nations.js';
import { PROVINCES, PROVINCE_BY_ID } from './map-data.js';

const STORE_KEY = 'hoi4.intelAgency.v1';

/* ============================================================
 * 定義
 * ========================================================== */

export const AGENCY_ESTABLISH_COST = 50;
export const OPERATIVE_HIRE_COST = 40;

/** インテル段階（情報の種類） */
export const INTEL_TIERS = ['political', 'economy', 'military'];
export const INTEL_TIER_LABEL = {
  none: '情報なし', political: '政治情報', economy: '経済情報', military: '軍事情報',
};
export const INTEL_TIER_COLOR = {
  none: '#55606a', political: '#e0b93e', economy: '#5e9ec7', military: '#d05038',
};
export const INTEL_TIER_ICON = {
  none: '🔒', political: '🏛', economy: '🏭', military: '⚔',
};

/** 諜報機関アップグレードツリー */
export const AGENCY_BRANCHES = [
  {
    id: 'hq', name: '機関本部', icon: '🏛', maxLevel: 3, requires: null,
    costs: [60, 90, 130],
    desc: 'エージェント枠と基礎インテルを増やす。すべての上位ブランチの前提。',
    effectText: (lv) => `エージェント枠 +${lv} ・ 基礎インテル +${lv * 3}`,
  },
  {
    id: 'crypto', name: '暗号解読チーム', icon: '🔐', maxLevel: 3, requires: { hq: 1 },
    costs: [50, 75, 110],
    desc: '暗号解読の速度と軍事情報の解禁を早める。',
    effectText: (lv) => `解読速度 +${lv * 25}% ・ 軍事情報の閾値 -${lv * 6}`,
  },
  {
    id: 'infiltration', name: '政府への潜入', icon: '🕵', maxLevel: 3, requires: { hq: 1 },
    costs: [45, 70, 100],
    desc: 'ネットワーク構築が早まり、政治・経済情報の閾値が下がる。',
    effectText: (lv) => `ネットワーク構築 +${lv * 4} ・ 政治/経済の閾値 -${lv * 5}`,
  },
  {
    id: 'special_forces', name: '特殊部隊', icon: '🎖', maxLevel: 2, requires: { hq: 1 },
    costs: [75, 120],
    desc: '破壊工作・技術窃取（Lv1）、クーデター支援（Lv2）を解禁する。',
    effectText: (lv) => (lv === 0 ? '破壊工作 / 技術窃取 / クーデター未解禁'
      : `破壊工作・技術窃取${lv >= 2 ? '・クーデター' : ''} 解禁 ・ 成功率 +${lv * 12}%`),
  },
];

/** エージェント技能の表示名 */
export const SKILL_LABELS = {
  spy_master: '諜報長', linguist: '言語学者', saboteur: '破壊工作員',
  code_breaker: '暗号技術者', assassin: '暗殺者', diplomat: '外交官',
};

/** 任務ごとの得意技能（成功時ボーナス） */
const SKILL_AFFINITY = {
  build_network: { spy_master: 4, linguist: 3, diplomat: 3 },
  propaganda: { diplomat: 6, linguist: 3, spy_master: 2 },
  decrypt: { code_breaker: 6, linguist: 2 },
  sabotage: { saboteur: 8, assassin: 3 },
  steal_tech: { code_breaker: 4, spy_master: 2 },
  coup: { diplomat: 5, assassin: 6 },
};

export function skillLabel(skill) {
  return SKILL_LABELS[skill] || skill;
}

export function missionById(id) {
  return INTEL_MISSIONS.find((m) => m.id === id) || null;
}

export function branchById(id) {
  return AGENCY_BRANCHES.find((b) => b.id === id) || null;
}

/** 表示用のインテル段階名（数値から） */
export function tierOf(level, thresholds) {
  if (level >= thresholds.military) return 'military';
  if (level >= thresholds.economy) return 'economy';
  if (level >= thresholds.political) return 'political';
  return 'none';
}

/* ============================================================
 * マネージャ
 * ========================================================== */

export class IntelManager {
  constructor(state, opts = {}) {
    this.state = state;
    this.seed = opts.seed !== false;
    this._forces = new Map();
    this._loaded = false;
    this.ensureState();
    this.load();
    if (!this._loaded && this.seed) this.seedAgency();
    this.syncSlots();
  }

  /* ---------- 状態 ---------- */

  ensureState() {
    const s = this.state;
    if (!s.intel || typeof s.intel !== 'object') s.intel = {};
    const i = s.intel;
    if (!Array.isArray(i.operatives)) i.operatives = [];
    if (!i.intelValue || typeof i.intelValue !== 'object') i.intelValue = {};
    if (!i.networks || typeof i.networks !== 'object') i.networks = {};
    if (!i.decrypted || typeof i.decrypted !== 'object') i.decrypted = {};
    if (!Array.isArray(i.history)) i.history = [];
    if (!i.agency) i.agency = null;
    if (typeof i.showEnemyForces !== 'boolean') i.showEnemyForces = true;
    if (!Number.isFinite(i.slots)) i.slots = 2;
    for (const op of i.operatives) {
      if (!Number.isFinite(op.skillValue)) op.skillValue = 1;
      if (op.mission && !Number.isFinite(op.mission.totalDays)) op.mission = null;
    }
    return i;
  }

  /** プレイヤー国家の初期エージェント（セーブが無いときのみ・雇用費は無料） */
  seedAgency() {
    if (!this.isEstablished()) return;
    if (this.operatives().length >= this.slots()) return;
    const tpl = OPERATIVES.find((o) => o.nation === this.state.playerTag) || OPERATIVES[0];
    if (!tpl || this.operatives().length) return;
    const op = {
      id: uid('op'), templateId: tpl.id, name: tpl.name, portrait: tpl.portrait,
      skill: tpl.skill, skillValue: tpl.skillValue, mission: null, completed: 0,
    };
    this.state.intel.operatives.push(op);
  }

  save() {
    const i = this.state.intel;
    store.set(STORE_KEY, {
      agency: i.agency,
      operatives: i.operatives.map((o) => ({
        id: o.id, templateId: o.templateId, name: o.name, portrait: o.portrait,
        skill: o.skill, skillValue: o.skillValue, mission: o.mission, completed: o.completed || 0,
      })),
      networks: i.networks,
      intelValue: i.intelValue,
      decrypted: i.decrypted,
      history: (i.history || []).slice(0, 30),
      showEnemyForces: i.showEnemyForces,
    });
  }

  load() {
    const data = store.get(STORE_KEY, null);
    if (!data) return false;
    const i = this.state.intel;
    if (data.agency && typeof data.agency === 'object') i.agency = data.agency;
    if (Array.isArray(data.operatives)) i.operatives = data.operatives;
    if (data.networks) i.networks = { ...data.networks };
    if (data.intelValue) i.intelValue = { ...data.intelValue };
    if (data.decrypted) i.decrypted = { ...data.decrypted };
    if (Array.isArray(data.history)) i.history = data.history;
    if (typeof data.showEnemyForces === 'boolean') i.showEnemyForces = data.showEnemyForces;
    this._loaded = true;
    return true;
  }

  /* ---------- 諜報機関 ---------- */

  isEstablished() {
    return Boolean(this.state.intel?.agency);
  }

  agency() {
    return this.state.intel?.agency || null;
  }

  /** ブランチの現在レベル */
  branchLevels() {
    const a = this.agency();
    if (!a) return { hq: 0, crypto: 0, infiltration: 0, special_forces: 0 };
    return {
      hq: a.branches?.hq || 0,
      crypto: a.branches?.crypto || 0,
      infiltration: a.branches?.infiltration || 0,
      special_forces: a.branches?.special_forces || 0,
    };
  }

  /** 機関の設立 */
  canEstablish() {
    if (this.isEstablished()) return { ok: false, reason: '既に諜報機関が設立されています', cost: 0 };
    const cost = AGENCY_ESTABLISH_COST;
    if (this.state.pp < cost) return { ok: false, reason: `政治力が不足しています（必要 ${cost} / 現在 ${Math.floor(this.state.pp)}）`, cost };
    return { ok: true, cost };
  }

  establish(name = null) {
    const chk = this.canEstablish();
    if (!chk.ok) return chk;
    this.state.pp -= chk.cost;
    this.state.intel.agency = {
      name: name || `${this.state.playerTag} 諜報機関`,
      foundedAt: this.state.tickCount || 0,
      branches: { hq: 1, crypto: 0, infiltration: 0, special_forces: 0 },
    };
    this.syncSlots();
    this.seedAgency(); // 設立時に初代エージェントを 1 名無償で配属
    this.save();
    this.state.bus?.emit('intel-changed', { reason: 'established' });
    this.state.bus?.emit('intel-agency-established', this.state.intel.agency);
    return { ok: true, agency: this.state.intel.agency, cost: chk.cost };
  }

  /** ブランチの次レベル費用 */
  nextCost(branchId) {
    const def = branchById(branchId);
    const lv = this.branchLevels()[branchId] || 0;
    if (!def || lv >= def.maxLevel) return null;
    return def.costs[lv];
  }

  canUpgrade(branchId) {
    const def = branchById(branchId);
    if (!def) return { ok: false, reason: '不明なブランチです' };
    if (!this.isEstablished()) return { ok: false, reason: '先に諜報機関を設立してください' };
    const levels = this.branchLevels();
    const lv = levels[branchId] || 0;
    if (lv >= def.maxLevel) return { ok: false, reason: '最大レベルです', level: lv, max: def.maxLevel };
    if (def.requires) {
      for (const [reqId, reqLv] of Object.entries(def.requires)) {
        if ((levels[reqId] || 0) < reqLv) {
          const reqName = branchById(reqId)?.name || reqId;
          return { ok: false, reason: `${reqName} Lv${reqLv} が必要です`, level: lv, max: def.maxLevel };
        }
      }
    }
    const cost = def.costs[lv];
    if (this.state.pp < cost) {
      return { ok: false, reason: `政治力が不足しています（必要 ${cost} / 現在 ${Math.floor(this.state.pp)}）`, cost, level: lv, max: def.maxLevel };
    }
    return { ok: true, cost, level: lv, targetLevel: lv + 1, max: def.maxLevel };
  }

  upgradeBranch(branchId) {
    const chk = this.canUpgrade(branchId);
    if (!chk.ok) return chk;
    this.state.pp -= chk.cost;
    this.state.intel.agency.branches[branchId] = chk.targetLevel;
    this.syncSlots();
    this.save();
    this.state.bus?.emit('intel-changed', { reason: 'upgrade', branch: branchId });
    return { ok: true, level: chk.targetLevel, cost: chk.cost, effect: branchById(branchId).effectText(chk.targetLevel) };
  }

  /** エージェント枠（本部 Lv + 1） */
  slots() {
    const lv = this.branchLevels().hq;
    return Math.max(1, 1 + lv);
  }

  syncSlots() {
    this.state.intel.slots = this.slots();
  }

  /** 機関ボーナスの要約（UI 表示用） */
  agencySummary() {
    const levels = this.branchLevels();
    return {
      established: this.isEstablished(),
      name: this.agency()?.name || null,
      branches: levels,
      slots: this.slots(),
      usedSlots: this.operatives().length,
      intelBonus: (levels.hq || 0) * 3 + (levels.crypto || 0) * 2,
      decryptSpeed: (levels.crypto || 0) * 0.25,
      networkBonus: (levels.infiltration || 0) * 4,
      covertUnlocked: (levels.special_forces || 0) >= 1,
      coupUnlocked: (levels.special_forces || 0) >= 2,
      thresholds: this.thresholds(),
    };
  }

  /* ---------- エージェント ---------- */

  operatives() {
    return this.state.intel.operatives;
  }

  /** 雇用可能なテンプレート（未雇用のもの） */
  availableOperatives() {
    return OPERATIVES.filter((o) => o.nation === this.state.playerTag || o.nation === 'WORLD');
  }

  canRecruit(opId) {
    if (!this.isEstablished()) return { ok: false, reason: '先に諜報機関を設立してください' };
    const tpl = OPERATIVES.find((o) => o.id === opId);
    if (!tpl) return { ok: false, reason: 'エージェントが見つかりません' };
    if (this.operatives().some((o) => o.templateId === opId)) return { ok: false, reason: '既に雇用しています' };
    if (this.operatives().length >= this.slots()) {
      return { ok: false, reason: `エージェント枠が満杯です（${this.operatives().length} / ${this.slots()}）` };
    }
    if (this.state.pp < OPERATIVE_HIRE_COST) {
      return { ok: false, reason: `政治力が不足しています（必要 ${OPERATIVE_HIRE_COST}）` };
    }
    return { ok: true, cost: OPERATIVE_HIRE_COST, template: tpl };
  }

  hire(opId) {
    const chk = this.canRecruit(opId);
    if (!chk.ok) return chk;
    const tpl = chk.template;
    this.state.pp -= chk.cost;
    const op = {
      id: uid('op'), templateId: tpl.id, name: tpl.name, portrait: tpl.portrait,
      skill: tpl.skill, skillValue: tpl.skillValue, mission: null, completed: 0,
    };
    this.state.intel.operatives.push(op);
    this.save();
    this.state.bus?.emit('intel-changed', { reason: 'hired', operative: op });
    return { ok: true, operative: op, cost: chk.cost };
  }

  /** 旧 API 互換 */
  recruit(opId) {
    const r = this.hire(opId);
    return r.ok ? r.operative : null;
  }

  dismiss(opId) {
    const idx = this.operatives().findIndex((o) => o.id === opId);
    if (idx < 0) return { ok: false };
    const [op] = this.state.intel.operatives.splice(idx, 1);
    this.save();
    this.state.bus?.emit('intel-changed', { reason: 'dismissed', operative: op });
    return { ok: true, operative: op };
  }

  operativeById(id) {
    return this.operatives().find((o) => o.id === id) || null;
  }

  /* ---------- 任務 ---------- */

  missions() {
    return INTEL_MISSIONS;
  }

  /** 任務の解禁状況 */
  missionAvailable(mission) {
    if (!mission.requiresBranch) return { ok: true };
    const levels = this.branchLevels();
    for (const [id, lv] of Object.entries(mission.requiresBranch)) {
      if ((levels[id] || 0) < lv) {
        return { ok: false, reason: `${branchById(id)?.name || id} Lv${lv} 以上で解禁` };
      }
    }
    return { ok: true };
  }

  /** 対象国の名前（UI 用） */
  targetName(tag) {
    return nationName(tag);
  }

  targets() {
    return MAJORS.filter((t) => t !== this.state.playerTag);
  }

  /** エージェントの技能に応じた任務ボーナス（日数短縮・効果増） */
  skillBonus(op, missionId) {
    const affinity = SKILL_AFFINITY[missionId] || {};
    return (affinity[op.skill] || 0) + Math.max(0, (Number(op.skillValue) || 1) - 1) * 0.5;
  }

  /** 任務の所要日数（技能・機関ボーナスで短縮） */
  missionDays(op, mission) {
    const b = this.branchLevels();
    const skill = Number(op?.skillValue) || 1;
    let days = mission.days * (1 - Math.min(0.35, 0.04 * skill));
    days *= 1 - Math.min(0.3, this.skillBonus(op, mission.id) * 0.03);
    if (mission.id === 'decrypt') days /= 1 + 0.25 * (b.crypto || 0);
    if (mission.id === 'build_network') days /= 1 + 0.12 * (b.infiltration || 0);
    return Math.max(5, Math.round(days));
  }

  canAssign(opId, missionId, targetTag) {
    if (!this.isEstablished()) return { ok: false, reason: '先に諜報機関を設立してください' };
    const op = this.operativeById(opId);
    if (!op) return { ok: false, reason: 'エージェントが見つかりません' };
    if (op.mission) return { ok: false, reason: '既に任務に就いています' };
    const mission = missionById(missionId);
    if (!mission) return { ok: false, reason: '不明な任務です' };
    const avail = this.missionAvailable(mission);
    if (!avail.ok) return { ok: false, reason: avail.reason };
    if (!targetTag || targetTag === this.state.playerTag) return { ok: false, reason: '対象国が不正です' };
    if (!NATIONS[targetTag]) return { ok: false, reason: '対象国が見つかりません' };
    return { ok: true, days: this.missionDays(op, mission), mission, operative: op };
  }

  assignMission(opId, missionId, targetTag) {
    const chk = this.canAssign(opId, missionId, targetTag);
    if (!chk.ok) return chk;
    const op = chk.operative;
    op.mission = {
      missionId, target: targetTag,
      daysLeft: chk.days, totalDays: chk.days,
      startedAt: this.state.tickCount || 0,
      progress: 0,
    };
    this.save();
    this.state.bus?.emit('intel-changed', { reason: 'mission', operative: op });
    return { ok: true, mission: op.mission, days: chk.days };
  }

  unassign(opId) {
    const op = this.operativeById(opId);
    if (!op) return { ok: false, reason: 'エージェントが見つかりません' };
    const had = Boolean(op.mission);
    op.mission = null;
    this.save();
    this.state.bus?.emit('intel-changed', { reason: 'unassign', operative: op });
    return { ok: true, hadMission: had };
  }

  /** Tick: 任務タイマー進行 → 完了処理 */
  tick(hours) {
    const dayFrac = Math.max(0, hours) / 24;
    if (dayFrac <= 0) return { completed: 0 };
    let completed = 0;
    for (const op of this.operatives()) {
      if (!op.mission) continue;
      op.mission.daysLeft -= dayFrac;
      op.mission.progress = clamp(1 - op.mission.daysLeft / Math.max(1, op.mission.totalDays), 0, 1);
      this.state.bus?.emit('intel-progress', { operative: op, progress: op.mission.progress });
      if (op.mission.daysLeft <= 0) {
        this._completeMission(op);
        completed += 1;
      }
    }
    if (completed) {
      this.save();
      this.state.bus?.emit('intel-changed', { reason: 'completed', completed });
    }
    return { completed };
  }

  _completeMission(op) {
    const mission = missionById(op.mission?.missionId);
    if (!mission) { op.mission = null; return; }
    const target = op.mission.target;
    const i = this.state.intel;
    const b = this.branchLevels();
    const bonus = this.skillBonus(op, mission.id);
    const result = { missionId: mission.id, target, at: this.state.tickCount || 0, days: mission.days };

    // ネットワーク構築
    if (mission.networkGain) {
      const gain = Math.round(mission.networkGain + bonus + (b.infiltration || 0) * 3);
      i.networks[target] = clamp((i.networks[target] || 0) + gain, 0, 100);
      result.networkGain = gain;
      result.network = i.networks[target];
    }

    // インテル値（すべての任務で獲得）
    if (mission.intelGain) {
      const gain = Math.round(mission.intelGain + bonus * 0.5 + (mission.id === 'decrypt' ? (b.crypto || 0) * 3 : 0));
      i.intelValue[target] = (i.intelValue[target] || 0) + gain;
      result.intelGain = gain;
      result.intelLevel = this.intelLevel(target);
    }

    // 暗号解読：以降の軍事情報解禁が早まる
    if (mission.id === 'decrypt') {
      i.decrypted[target] = (i.decrypted[target] || 0) + 1;
      result.decrypted = i.decrypted[target];
      this.state.bus?.emit('intel-decrypted', { target, level: i.decrypted[target] });
    }

    // プロパガンダ
    if (mission.stabilityDamage || mission.warSupportDamage) {
      this.state.bus?.emit('enemy-instability', {
        target,
        amount: mission.stabilityDamage || 0,
        warSupport: mission.warSupportDamage || 0,
      });
      result.stabilityDamage = mission.stabilityDamage || 0;
    }

    // 破壊工作
    if (mission.factoryPenaltyDays) {
      this.state.bus?.emit('enemy-sabotaged', {
        target, days: mission.factoryPenaltyDays, pct: mission.factoryPenaltyPct,
      });
    }

    // 技術窃取（研究ボーナス）
    if (mission.stealReduction) {
      const reduction = mission.stealReduction + (mission.stealReduction * (b.special_forces || 0) * 0.25);
      this.state.addResearchBonus?.({
        scope: 'any', reduction, uses: 1,
        label: `技術窃取（${nationName(target)}）`,
      });
      result.stealReduction = reduction;
    }

    // クーデター
    if (mission.coupChance) {
      const chance = clamp(mission.coupChance + (b.special_forces || 0) * 0.06 + bonus * 0.01, 0, 0.9);
      const success = Math.random() < chance;
      result.coup = { chance, success };
      this.state.bus?.emit('intel-coup', { target, success, chance });
    }

    op.completed = (op.completed || 0) + 1;
    op.mission = null;
    op.lastMission = result;

    i.history.unshift(result);
    if (i.history.length > 30) i.history.length = 30;

    this.state.bus?.emit('intel-mission-complete', result);
    toast(`諜報任務完了：${mission.name}（${nationName(target)}）`, 'info');
    return result;
  }

  /* ---------- インテル ---------- */

  /** 対象国のネットワーク進捗（0-100） */
  network(tag) {
    return clamp(Number(this.state.intel.networks?.[tag]) || 0, 0, 100);
  }

  /** インテル獲得の累積値（旧 intelValue 互換） */
  intelOn(tag) {
    return this.state.intel.intelValue?.[tag] || 0;
  }

  /** 情報解禁の閾値（機関アップグレードで低下） */
  thresholds() {
    const b = this.branchLevels();
    return {
      political: Math.max(8, 20 - (b.infiltration || 0) * 5),
      economy: Math.max(18, 45 - (b.infiltration || 0) * 4 - (b.crypto || 0) * 3),
      military: Math.max(32, 70 - (b.crypto || 0) * 6 - (b.infiltration || 0) * 2),
    };
  }

  /** インテルレベル（0-100） */
  intelLevel(tag) {
    if (!NATIONS[tag]) return 0;
    const b = this.branchLevels();
    const net = this.network(tag);
    const points = this.intelOn(tag);
    const decrypted = (this.state.intel.decrypted?.[tag] || 0) * 6;
    const base = this.isEstablished() ? 2 + (b.hq || 0) * 3 + (b.crypto || 0) * 2 : 0;
    const level = net * 0.62 + points * 0.55 + decrypted + base;
    return clamp(Math.round(level), 0, 100);
  }

  intelTier(tag) {
    return tierOf(this.intelLevel(tag), this.thresholds());
  }

  /** 特定カテゴリの情報が見えるか（政治 < 経済 < 軍事） */
  hasIntel(tag, kind = 'political') {
    const tier = this.intelTier(tag);
    const order = { none: 0, political: 1, economy: 2, military: 3 };
    return order[tier] >= order[kind];
  }

  /** 対象国の推計師団配置（軍事情報で公開） */
  enemyForces(tag) {
    if (this._forces.has(tag)) return this._forces.get(tag);
    const provs = PROVINCES.filter((p) => p.tag === tag);
    const nat = NATIONS[tag];
    if (!provs.length || !nat) { this._forces.set(tag, []); return []; }
    const total = Math.max(2, Math.round(((nat.start.mil || 20) * 0.6 + (nat.start.civ || 20) * 0.3) / 2));
    const weightSum = provs.reduce((sum, p) => sum + (p.vp || 3), 0) || 1;
    const types = ['infantry', 'infantry', 'armor', 'garrison', 'artillery', 'infantry'];
    const forces = provs.map((p, idx) => {
      const share = (p.vp || 3) / weightSum;
      return {
        id: `ef-${tag}-${p.id}`,
        provinceId: p.id,
        provinceName: p.name,
        tag,
        type: types[idx % types.length],
        count: Math.max(0, Math.round(total * share)),
        strength: Math.round((0.62 + ((idx * 7) % 30) / 100) * 100) / 100,
      };
    }).filter((f) => f.count > 0);
    this._forces.set(tag, forces);
    return forces;
  }

  /** 軍事情報の要約 */
  enemyMilitary(tag) {
    const nat = NATIONS[tag];
    const forces = this.enemyForces(tag);
    const divisions = forces.reduce((n, f) => n + f.count, 0);
    return {
      divisions,
      forces,
      army: nat?.start.manpower || 0,
      factories: (nat?.start.civ || 0) + (nat?.start.mil || 0) + (nat?.start.dock || 0),
      readiness: Math.round(72 + (forces.length % 5) * 3),
      air: nat?.start.xp?.air || 0,
      navy: nat?.start.xp?.navy || 0,
    };
  }

  /** 対象国のインテルダッシュボード */
  intelData(tag) {
    const nat = NATIONS[tag];
    if (!nat) return null;
    const level = this.intelLevel(tag);
    const thresholds = this.thresholds();
    const tier = tierOf(level, thresholds);
    const political = this.hasIntel(tag, 'political');
    const economy = this.hasIntel(tag, 'economy');
    const military = this.hasIntel(tag, 'military');
    const start = nat.start;
    return {
      tag,
      name: nationName(tag),
      nation: nat,
      level,
      tier,
      tierLabel: INTEL_TIER_LABEL[tier],
      tierColor: INTEL_TIER_COLOR[tier],
      network: this.network(tag),
      intelPoints: this.intelOn(tag),
      decrypted: this.state.intel.decrypted?.[tag] || 0,
      thresholds,
      political: political ? {
        ideology: nat.ideology,
        leader: nat.leader?.name || '—',
        stability: start.stability,
        warSupport: start.warSupport,
        pp: start.pp,
        spirits: (nat.spirits || []).map((s) => s.name),
      } : null,
      economy: economy ? {
        civ: start.civ, mil: start.mil, dock: start.dock,
        factories: start.civ + start.mil + start.dock,
        convoys: start.convoys,
        manpower: start.manpower,
        resources: nat.resources || null,
      } : null,
      military: military ? this.enemyMilitary(tag) : null,
      operatives: this.operatives().filter((o) => o.mission?.target === tag).length,
      history: (this.state.intel.history || []).filter((h) => h.target === tag).slice(0, 3),
    };
  }

  /** 全対象国の一覧（UI 用） */
  intelOverview() {
    return this.targets().map((t) => this.intelData(t));
  }

  summary() {
    const targets = this.intelOverview();
    const levels = targets.map((t) => t.level);
    const avg = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 0;
    return {
      established: this.isEstablished(),
      agencyName: this.agency()?.name || null,
      branches: this.branchLevels(),
      slots: this.slots(),
      operatives: this.operatives().length,
      activeOps: this.operatives().filter((o) => o.mission).length,
      avgIntel: avg,
      maxIntel: levels.length ? Math.max(...levels) : 0,
      revealed: {
        political: targets.filter((t) => t.political).length,
        economy: targets.filter((t) => t.economy).length,
        military: targets.filter((t) => t.military).length,
      },
      networks: targets.filter((t) => t.network > 0).length,
      history: (this.state.intel.history || []).length,
    };
  }

  /** マップ上の師団配置表示 ON/OFF */
  toggleEnemyForces(value = null) {
    const i = this.state.intel;
    i.showEnemyForces = value == null ? !i.showEnemyForces : Boolean(value);
    this.save();
    this.state.bus?.emit('intel-changed', { reason: 'display' });
    return i.showEnemyForces;
  }
}

/* ============================================================
 * インストール
 * ========================================================== */

export function installIntelAgency(state, opts = {}) {
  if (state._intelMgr) return state._intelMgr;
  const mgr = new IntelManager(state, opts);
  state._intelMgr = mgr;
  state.intelMgr = mgr;
  return mgr;
}

/** セーブ形式（デバッグ / テスト用） */
export function intelStateJSON(state) {
  const i = state.intel || {};
  return {
    agency: i.agency,
    slots: i.slots,
    operatives: (i.operatives || []).map((o) => ({
      id: o.id, templateId: o.templateId, skill: o.skill, skillValue: o.skillValue,
      mission: o.mission, completed: o.completed || 0,
    })),
    networks: { ...(i.networks || {}) },
    intelValue: { ...(i.intelValue || {}) },
    decrypted: { ...(i.decrypted || {}) },
  };
}
