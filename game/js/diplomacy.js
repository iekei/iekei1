/** diplomacy.js — 外交マネージャ：国家プロファイル表示・政治力を消費する外交アクション */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import { MAJORS, NATIONS, nationName } from './data/nations.js';

export class DiplomacyManager {
  constructor(state) {
    this.state = state;
  }

  others() { return MAJORS.filter((t) => t !== this.state.playerTag); }

  relations(tag) { return this.state.diplomacy.relations[tag] ?? 0; }

  isAtWar(tag) { return this.state.atWarWith.has(tag); }

  /** 関係変更 */
  addRelations(tag, amount) {
    const r = this.state.diplomacy.relations;
    r[tag] = Math.max(-100, Math.min(100, (r[tag] ?? 0) + amount));
    this.state.bus.emit('diplomacy-changed', { tag });
  }

  /** 武官派遣（10 PP: 関係+15, 諜報価値+5） */
  sendAttache(tag) {
    if (this.state.pp < 10) return false;
    this.state.pp -= 10;
    this.addRelations(tag, 15);
    this.state.intel.intelValue[tag] = (this.state.intel.intelValue[tag] || 0) + 5;
    toast(`${nationName(tag)} へ武官を派遣しました`, 'info');
    return true;
  }

  /** 関係改善（25 PP: 関係+20） */
  improveRelations(tag) {
    if (this.state.pp < 25) return false;
    this.state.pp -= 25;
    this.addRelations(tag, 20);
    toast(`${nationName(tag)} との関係が改善しました`, 'good');
    return true;
  }

  /** 戦争目標の正当化（100 PP: 戦争協力度+10） */
  justifyWarGoal(tag) {
    if (this.state.pp < 100) return false;
    this.state.pp -= 100;
    this.state.warSupport = Math.min(100, this.state.warSupport + 10);
    toast(`${nationName(tag)} への戦争目標を正当化しました（戦争協力度+10%）`, 'info');
    return true;
  }

  /** 独立保障（25 PP） */
  guarantee(tag) {
    if (this.state.pp < 25) return false;
    this.state.pp -= 25;
    this.state.diplomacy.guarantees.add(tag);
    toast(`${nationName(tag)} の独立を保障しました`, 'info');
    return true;
  }

  /** 宣戦布告（戦争協力度25%消費） */
  declareWar(tag) {
    const cost = 25;
    if (this.state.warSupport < cost) return false;
    this.state.warSupport -= cost;
    this.state.atWarWith.add(tag);
    this.state.diplomacy.wars.add(tag);
    this.addRelations(tag, -100);
    toast(`${nationName(tag)} に宣戦布告しました！`, 'bad');
    this.state.bus.emit('war-declared', { target: tag });
    return true;
  }

  /**講和（戦争協力度10%消費） */
  makePeace(tag) {
    if (this.state.warSupport < 10) return false;
    this.state.warSupport -= 10;
    this.state.atWarWith.delete(tag);
    this.state.diplomacy.wars.delete(tag);
    this.addRelations(tag, 30);
    toast(`${nationName(tag)} と講和しました`, 'info');
    return true;
  }

  /** プロファイル（UI用） */
  profile(tag) {
    const n = NATIONS[tag];
    if (!n) return null;
    return {
      tag, name: n.name, flag: n.flag, ideology: n.ideology,
      leader: n.leader, relations: this.relations(tag),
      atWar: this.isAtWar(tag),
      ideologySupport: n.ideologySupport,
    };
  }
}
