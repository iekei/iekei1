/** doctrine.js — ドクトリン（学説）マネージャ：陸・海・空タブ / XP / 相互排他ルート / 軍集団割り当て */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import { DOCTRINE_TREES, aggregateDoctrineEffects } from './data/doctrines.js';

export class DoctrineManager {
  constructor(state) {
    this.state = state;
  }

  branches() { return ['land', 'naval', 'air']; }

  nodes(branch) { return DOCTRINE_TREES[branch] || []; }

  xp(branch) { return this.state.doctrine.xp[branch] || 0; }

  unlocked(branch) { return this.state.doctrine.unlocked[branch]; }

  /** 取得可能か（前提充足・相互排他・XP） */
  canTake(branch, nodeId) {
    const node = this.nodes(branch).find((n) => n.id === nodeId);
    if (!node) return { ok: false, reason: 'unknown' };
    const un = this.unlocked(branch);
    if (un.has(nodeId)) return { ok: false, reason: 'taken' };
    if (this.xp(branch) < node.cost) return { ok: false, reason: 'xp' };
    if (node.group && [...un].some((id) => this.nodes(branch).find((n) => n.id === id)?.group === node.group)) {
      return { ok: false, reason: 'exclusive' };
    }
    const reqs = node.requires || [];
    if (reqs.length) {
      const satisfied = node.anyRequires
        ? reqs.some((r) => un.has(r))
        : reqs.every((r) => un.has(r));
      if (!satisfied) return { ok: false, reason: 'requires' };
    }
    return { ok: true };
  }

  take(branch, nodeId) {
    const check = this.canTake(branch, nodeId);
    if (!check.ok) return false;
    const node = this.nodes(branch).find((n) => n.id === nodeId);
    this.state.doctrine.xp[branch] -= node.cost;
    this.unlocked(branch).add(nodeId);
    toast(`${I18N.doctrineName(nodeId)} を習得しました`, 'good');
    this.state.bus.emit('doctrine-changed', { branch, nodeId });
    return true;
  }

  /** 軍集団（グループ）への割り当て: プレースホルダとして1グループ保持 */
  assign(branch, groupName) { this.state.doctrine.assigned[branch] = groupName; }

  /** 指定ブランチの総合効果（師団・戦闘に適用） */
  effects(branch) {
    return aggregateDoctrineEffects(branch, this.unlocked(branch));
  }

  /** Tick: 経験値の獲得（訓練・戦闘の代替として時間経過で蓄積） */
  tick(branch, hours) {
    // 1日あたり +0.2 XP（陸軍は師団数に比例）
    const perDay = branch === 'land' ? 0.2 + this.state.units.army * 0.0005 : 0.1;
    this.state.doctrine.xp[branch] = this.xp(branch) + (hours / 24) * perDay;
    // 既存の陸海空軍XPも上昇
    const xpKey = { land: 'army', naval: 'navy', air: 'air' }[branch];
    this.state.xp[xpKey] = Math.round((this.state.xp[xpKey] + (hours / 24) * 0.5) * 10) / 10;
  }
}
