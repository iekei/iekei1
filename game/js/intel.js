/** intel.js — 諜報機関マネージャ：諜報員カードの敵国派遣・任務タイマー進行 */

import { I18N } from './i18n.js';
import { toast, uid } from './util.js';
import { OPERATIVES, INTEL_MISSIONS } from './data/operatives.js';
import { MAJORS } from './data/nations.js';

export class IntelManager {
  constructor(state) {
    this.state = state;
  }

  /** 雇用可能な諜報員テンプレート（プレイヤー国家の諜報機関向け） */
  availableOperatives() {
    return OPERATIVES.filter((o) => o.nation === this.state.playerTag || o.nation === 'WORLD');
  }

  operatives() { return this.state.intel.operatives; }

  recruit(opId) {
    const tpl = OPERATIVES.find((o) => o.id === opId);
    if (!tpl) return null;
    if (this.operatives().length >= this.state.intel.slots) return null;
    const cost = 50;
    if (this.state.pp < cost) return null;
    this.state.pp -= cost;
    const op = {
      id: uid('op'), templateId: opId, name: tpl.name, portrait: tpl.portrait,
      skill: tpl.skill, skillValue: tpl.skillValue,
      mission: null, // {missionId, target, daysLeft, totalDays}
    };
    this.state.intel.operatives.push(op);
    this.state.bus.emit('intel-changed');
    return op;
  }

  /** 任務をアサイン（タイマー進行開始） */
  assignMission(opId, missionId, targetTag) {
    const op = this.operatives().find((o) => o.id === opId);
    const mission = INTEL_MISSIONS.find((m) => m.id === missionId);
    if (!op || !mission || op.mission) return false;
    if (targetTag === this.state.playerTag) return false;
    op.mission = { missionId, target: targetTag, daysLeft: mission.days, totalDays: mission.days };
    this.state.bus.emit('intel-changed');
    return true;
  }

  unassign(opId) {
    const op = this.operatives().find((o) => o.id === opId);
    if (op) { op.mission = null; this.state.bus.emit('intel-changed'); }
  }

  /** Tick: 任務タイマー進行 */
  tick(hours) {
    const dayFrac = hours / 24;
    for (const op of this.operatives()) {
      if (!op.mission) continue;
      op.mission.daysLeft -= dayFrac;
      if (op.mission.daysLeft <= 0) this._completeMission(op);
    }
  }

  _completeMission(op) {
    const m = INTEL_MISSIONS.find((x) => x.id === op.templateId ? false : x.id === op.mission.missionId);
    const mission = m || {};
    const target = op.mission.target;
    const name = I18N.t(`intel.missions.${op.mission.missionId}.name`);
    toast(I18N.t('intel.mission_done', { mission: name, target }), 'info');
    // 効果適用
    if (mission.intelGain) {
      this.state.intel.intelValue[target] = (this.state.intel.intelValue[target] || 0) + mission.intelGain;
    }
    if (mission.factoryPenaltyDays) {
      this.state.bus.emit('enemy-sabotaged', { target, days: mission.factoryPenaltyDays, pct: mission.factoryPenaltyPct });
    }
    if (mission.stabilityDamage) {
      this.state.bus.emit('enemy-instability', { target, amount: mission.stabilityDamage });
    }
    op.mission = null;
    this.state.bus.emit('intel-changed');
  }

  /** 特定国家に対する諜報価値（戦闘シミュレーターの優位補正に使用） */
  intelOn(targetTag) {
    return this.state.intel.intelValue[targetTag] || 0;
  }

  missions() { return INTEL_MISSIONS; }
  targets() { return MAJORS.filter((t) => t !== this.state.playerTag); }
}
