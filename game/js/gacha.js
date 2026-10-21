/**
 * gacha.js — 将軍・司令官カードガチャ
 *
 * CardLibrary のカードプールからレアリティ別確率でカードを1枚ずつアンロックし、
 * state.cardCollection に追加する。アンロックした司令官を軍集団・艦隊・航空軍に
 * 配属し、特性（Trait）が戦闘ダイスロールに反映される。
 */

import { weightedPick } from './util.js';
import { toast } from './util.js';
import { COMMANDER_TRAITS } from './data/cards.js';

/** パック定義：{ id, label, costPP, weights: {common,rare,epic,legendary}, guaranteeRareEvery } */
export const PACKS = {
  standard: { id: 'standard', label: '通常パック', costPP: 50, weights: { common: 0.60, rare: 0.30, epic: 0.09, legendary: 0.01 } },
  elite: { id: 'elite', label: 'エリートパック', costPP: 150, weights: { common: 0.20, rare: 0.50, epic: 0.25, legendary: 0.05 } },
  legendary: { id: 'legendary', label: '伝説パック', costPP: 500, weights: { common: 0.05, rare: 0.15, epic: 0.40, legendary: 0.40 } },
};

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

export class GachaManager {
  constructor(state, cardLibrary) {
    this.state = state;
    this.cards = cardLibrary;
    this.openCount = { standard: 0, elite: 0, legendary: 0 };
  }

  /** カードプール（指定ブランチ・国家）を取得 */
  poolFor(branch, nation = null) {
    return this.cards.ofBranch(branch, nation);
  }

  /** レアリティ抽選（保証: エリート以上は10回に1回はレア以上） */
  drawRarity(packId) {
    const pack = PACKS[packId];
    if (!pack) return 'common';
    const count = ++this.openCount[packId];
    const guarantee = packId !== 'standard' && count % 10 === 0;
    const r = Math.random();
    let acc = 0;
    for (const rarity of RARITY_ORDER) {
      acc += pack.weights[rarity] || 0;
      if (r <= acc) return rarity;
    }
    if (guarantee) return 'rare';
    return 'common';
  }

  /** パックを開封して1枚獲得 */
  openPack(packId, branch = null, nation = null) {
    const pack = PACKS[packId];
    if (!pack) return null;
    if (this.state.pp < pack.costPP) {
      toast(`政治力不足（${pack.costPP} PP 必要）`, 'bad');
      return null;
    }
    this.state.pp -= pack.costPP;

    const rarity = this.drawRarity(packId);
    const pool = this.poolFor(branch, nation).filter((c) => {
      // rarity フィールドがないカードは共通カードとして扱う（common に近い扱い）
      return true;
    });
    if (!pool.length) {
      toast('入手可能なカードがありません', 'info');
      this.state.pp += pack.costPP;
      return null;
    }

    // レアリティでフィルタ（カードに rarity が無ければ擬似的に付与）
    const withRarity = pool.map((c) => ({ ...c, _rarity: c.rarity || this._pseudoRarity(c.id) }));
    const filtered = withRarity.filter((c) => c._rarity === rarity);
    const target = filtered.length ? weightedPick(filtered, () => 1) : weightedPick(withRarity, () => 1);

    const card = { ...target, instanceId: `card-${Date.now()}`, level: 1, xp: 0, rarity: target._rarity };
    delete card._rarity;
    this.state.cardCollection.push(card);
    this.state.bus.emit('card-acquired', { card, pack: packId });

    const rarityLabel = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }[card.rarity] || card.rarity;
    toast(`${card.name} を獲得！[${rarityLabel}]`, card.rarity === 'legendary' ? 'good' : card.rarity === 'epic' ? 'good' : 'info');
    return card;
  }

  _pseudoRarity(id) {
    const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const m = hash % 100;
    if (m < 60) return 'common';
    if (m < 90) return 'rare';
    if (m < 98) return 'epic';
    return 'legendary';
  }

  /** 司令官を軍集団・艦隊・航空軍に配属 */
  assignCommander(cardInstanceId, branch) {
    const card = this.state.cardCollection.find((c) => c.instanceId === cardInstanceId);
    if (!card) return false;
    if (card.branch && card.branch !== branch) {
      // 他ブランチからの移動は一度解除
    }
    const prev = this.state.commanders[branch];
    if (prev) {
      prev.assigned = null;
    }
    card.assigned = true;
    card.branch = branch;
    this.state.commanders[branch] = card;
    toast(`${card.name} を${branch}に配属しました`, 'info');
    this.state.bus.emit('commander-assigned', { branch, card });
    return true;
  }

  /** カードの戦闘補正を取得（combat.js の commanderEffects と互換） */
  cardEffects(card) {
    const out = {};
    for (const t of card.traits || []) {
      const e = COMMANDER_TRAITS[t];
      if (!e) continue;
      const mult = card.level >= 3 ? 1.5 : 1;
      for (const [k, v] of Object.entries(e.effects)) out[k] = (out[k] || 0) + v * mult;
    }
    return out;
  }

  /** 所持カード一覧をレアリティ順にソートして返す */
  collection() {
    return [...this.state.cardCollection].sort((a, b) => {
      const order = { legendary: 4, epic: 3, rare: 2, common: 1 };
      return (order[b.rarity] || 0) - (order[a.rarity] || 0);
    });
  }
}

export { PACKS, RARITY_ORDER };
export default GachaManager;
