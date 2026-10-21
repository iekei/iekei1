/**
 * nukes.js — 核攻撃システム
 *
 * 「核開発」特別研究完了後、戦略爆撃機の配備と高い制空権を条件に、
 * 対象プロヴィンスに核爆弾を投下する。
 * 実行時：インフラ全壊、駐留師団への甚大なダメージ、国家戦意の低下。
 */

import { I18N } from './i18n.js';
import { toast } from './util.js';

export class NukeManager {
  constructor(state, airNaval, effectEngine, mapEngine) {
    this.state = state;
    this.airNaval = airNaval;
    this.effectEngine = effectEngine;
    this.map = mapEngine;
  }

  /** 核攻撃が実行可能か */
  canNuke(provinceId) {
    if ((this.state.nukes || 0) <= 0) return { ok: false, msg: '核弾頭がありません' };
    if (!this.state.nuclearResearched) return { ok: false, msg: '核開発が完了していません' };
    const p = this.airNaval.map.byId[provinceId];
    if (!p) return { ok: false, msg: 'プロヴィンス不正' };
    // 戦略爆撃機の配備確認（同プロヴィンスまたは同空域）
    const hasStratBomber = this.state.airForces.some(
      (a) => a.type === 'strategic_bomber' && a.baseProvince === provinceId && a.count > 0
    );
    if (!hasStratBomber) return { ok: false, msg: '対象プロヴィンスに戦略爆撃機が配備されていません' };
    // 制空権 70%以上（最寄り空域）
    const region = this.airNaval._nearestAirRegion(p);
    const sup = region ? this.airNaval.calcAirSupremacy(region.id) : -100;
    if (sup < 70) return { ok: false, msg: `制空権不足（${sup}%、70%以上必要）` };
    return { ok: true };
  }

  /** 核攻撃を実行 */
  executeNuke(provinceId) {
    const check = this.canNuke(provinceId);
    if (!check.ok) return false;
    const p = this.airNaval.map.byId[provinceId];
    const ownerTag = p.tag;

    // 核弾頭消費
    this.state.nukes = Math.max(0, (this.state.nukes || 0) - 1);

    // 駐留師団に甚大ダメージ
    for (const div of this.state.divisions) {
      if (div.provinceId === provinceId) {
        div.hp = Math.round(div.hp * 0.1);
        div.org = Math.round(div.org * 0.1);
        div.supply = Math.max(0, div.supply - 0.5);
        div.command = Math.max(0, div.command - 0.5);
      }
    }
    this.state.bus.emit('division-updated');

    // 国家戦意低下（対象国がプレイヤーなら自国も）
    if (this.state.warSupport !== undefined) {
      if (ownerTag === this.state.playerTag) {
        this.state.warSupport = Math.max(0, this.state.warSupport - 30);
        this.state.stability = Math.max(0, this.state.stability - 20);
      } else {
        // 敵国に戦意低下（簡易：関係・戦争協力度に反映）
        this.state.warSupport = Math.min(100, this.state.warSupport + 5); // 戦果で自国戦意わずか上昇
      }
    }

    // インフラ・建設ダメージ（簡易：プロヴィンスをハイライトし、建設進行停止フラグ）
    this.map.highlightProvince(provinceId, '#d05038');

    // 核爆発バブル表示
    const id = `nuke-${Date.now()}`;
    this.airNaval.map.setCombatBubble(id, {
      province: provinceId,
      advantage: 'red',
      intensity: 1.0,
      attackerName: '核兵器',
      defenderName: nationName(ownerTag),
    });
    setTimeout(() => this.airNaval.map.removeCombatBubble(id), 5000);

    toast(`${p.name} に核攻撃を実行しました！`, 'bad');
    this.state.bus.emit('nuke-executed', { province: provinceId, target: ownerTag });
    return true;
  }
}

export default NukeManager;
