/** politics.js — 自国政治マネージャ：法律・閣僚（政治力消費）/ 占領地・傀儡国管理（統合タイマー） */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import { MINOR_STATES } from './data/nations.js';

export const INTEGRATION_DAYS = 14; // 2週間ごとに占領度+3%
export const INTEGRATION_STEP = 3;

export class PoliticsManager {
  constructor(state) {
    this.state = state;
  }

  /** 法律変更（PP消費） */
  changeLaw(kind, lawId, cost = 50) {
    if (this.state.pp < cost) return false;
    this.state.pp -= cost;
    this.state.politics.laws[kind] = lawId;
    toast(`法律を変更しました: ${kind === 'conscription' ? '徴兵法' : '経済法'} → ${lawId}`, 'info');
    this.state.bus.emit('politics-changed');
    return true;
  }

  /** 閣僚任命（PP消費） */
  appointMinister(name, cost = 50) {
    if (this.state.pp < cost) return false;
    this.state.pp -= cost;
    this.state.politics.ministers.push({ name, appointedAt: this.state.dateLabel });
    toast(`閣僚を任命しました: ${name}`, 'info');
    this.state.bus.emit('politics-changed');
    return true;
  }

  /** Tick: 占領度の統合タイマー（2週間ごとに+3%） */
  tick(hours) {
    const s = this.state;
    for (const occ of s.occupations) {
      if (occ.compliance >= 100) continue;
      occ.sinceDays = (occ.sinceDays || 0) + hours / 24;
      while (occ.sinceDays + 1e-9 >= INTEGRATION_DAYS && occ.compliance < 100) {
        occ.sinceDays -= INTEGRATION_DAYS;
        occ.compliance = Math.min(100, occ.compliance + INTEGRATION_STEP);
      }
    }
    // 政治力の自然回復（1日+2）
    s.pp = Math.min(500, s.pp + (hours / 24) * 2);
    // 安定度・戦争協力度の微増減
    s.stability = Math.max(0, Math.min(100, s.stability + (hours / 24) * 0.01));
    s.commandPower = Math.min(200, s.commandPower + (hours / 24) * 0.5);
    s.manpower = Math.min(20000000, s.manpower + (hours / 24) * 50);
    s.bus.emit('politics-tick', { hours });
  }

  /** 国家統一（併合・コア化）: 占領度100%で実行可能 */
  integrate(tag) {
    const occ = this.state.occupations.find((o) => o.tag === tag);
    if (!occ || occ.compliance < 100) return false;
    const minor = MINOR_STATES[tag];
    this.state.factories.mil += Math.floor((occ.factories || minor?.factories || 0) * 0.5);
    this.state.factories.civ += Math.floor((occ.factories || minor?.factories || 0) * 0.5);
    this.state.occupations = this.state.occupations.filter((o) => o.tag !== tag);
    toast(I18N.t('politics.occupation.annexed', { name: minor?.name || tag, factories: occ.factories }), 'good');
    this.state.bus.emit('territory-annexed', { tag });
    return true;
  }

  /** 傀儡政権樹立（占領地から） */
  createPuppet(tag) {
    const occ = this.state.occupations.find((o) => o.tag === tag && o.kind === 'occupied');
    if (!occ || occ.compliance < 50) return false;
    occ.kind = 'puppet';
    toast(`${MINOR_STATES[tag]?.name || tag} に傀儡政権を樹立しました`, 'info');
    this.state.bus.emit('puppet-created', { tag });
    return true;
  }
}
