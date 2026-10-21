/**
 * peace-conference.js — 講和会議システム
 *
 * 主要国が降伏（主要VP喪失）した際に開くUI。
 * 参戦国の「戦勝点（War Score）」を消費して、対象州の
 * 「領土割譲（Annex）」「傀儡化（Puppet）」「解放（Liberate）」を行う。
 */

import { el } from './util.js';
import { I18N } from './i18n.js';
import { nationName } from './data/nations.js';

export class PeaceConferenceManager {
  constructor(state, diplomacy, effectEngine) {
    this.state = state;
    this.diplomacy = diplomacy;
    this.effectEngine = effectEngine;
    this.openTarget = null; // 降伏国タグ
  }

  /** 講和会議を開く（対象: 降伏国タグ） */
  open(targetTag) {
    this.openTarget = targetTag;
  }

  close() { this.openTarget = null; }

  isOpen() { return !!this.openTarget; }

  /** 参加国の戦勝点一覧（開戦国のみ） */
  participants() {
    const atWar = [...this.state.atWarWith];
    if (!atWar.length) return [];
    return atWar.map((tag) => ({
      tag,
      name: nationName(tag),
      score: this.state.warScore[tag] || 0,
    })).sort((a, b) => b.score - a.score);
  }

  /** 総戦勝点 */
  totalScore() {
    return this.participants().reduce((s, p) => s + p.score, 0);
  }

  /** 対象州を割り当て（プレイヤーが実行） */
  takeState(provinceId, action) {
    const target = this.openTarget;
    if (!target) return false;
    const myScore = this.state.warScore[this.state.playerTag] || 0;
    const cost = { annex: 50, puppet: 30, liberate: 20 }[action] || 30;
    if (myScore < cost) return false;

    const p = { annex: 'annex', puppet: 'puppet', liberate: 'liberate' }[action];
    // エフェクトエンジンで実行
    if (p === 'annex') {
      this.effectEngine.execute(`annex = ${target}`);
    } else if (p === 'puppet') {
      this.effectEngine.execute(`puppet = ${target}`);
    } else {
      // 解放：降伏を解除し、関係を回復
      this.state.surrendered.delete(target);
      this.state.atWarWith.delete(target);
      this.diplomacy.addRelations(target, 20);
    }
    this.state.warScore[this.state.playerTag] = myScore - cost;
    this.state.bus.emit('peace-action', { target, action: p, province: provinceId });
    this.close();
    return true;
  }
}

export default PeaceConferenceManager;
