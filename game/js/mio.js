/**
 * mio.js — 軍需産業体（MIO）マネージャ
 *
 * - 研究スロット / 生産ラインへMIOをアサイン
 * - 研究・生産の完了でMIO経験値が蓄積しレベルアップ（最大Lv5）
 * - レベル解放時に特性ツリー（3段階）から特性を選択
 * - 特性とレベルから研究速度/生産効率などの補正を集計
 */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import { NATION_MIOS, MIO_TRAIT_TREE, MIO_LEVEL_CAP, MIO_XP_PER_LEVEL, TRAIT_EFFECTS } from './data/mios.js';

export class MIOManager {
  constructor(state, cards) {
    this.state = state;
    this.cards = cards;
    this._cache = null;
  }

  /** プレイヤー国家のMIO企業リスト（初期化つき） */
  list(tag = this.state.playerTag) {
    if (!this.state.mios[tag]) {
      this.state.mios[tag] = {};
      for (const def of NATION_MIOS[tag] || []) {
        this.state.mios[tag][def.id] = { id: def.id, type: def.type, level: 1, xp: 0, traits: [], assignment: null };
      }
    }
    return Object.values(this.state.mios[tag]);
  }

  get(mioId, tag = this.state.playerTag) {
    return this.list(tag).find((m) => m.id === mioId) || null;
  }

  /** MIOカード定義（game/card/mio/）を取得 */
  cardFor(mioId) {
    return this.cards?.byBranch?.mio?.find((c) => c.id === mioId) || null;
  }

  /** 研究スロットへアサイン */
  assignToResearch(mioId, slot) {
    const mio = this.get(mioId);
    if (!mio) return false;
    this.unassign(mioId);
    mio.assignment = { type: 'research', ref: slot };
    return true;
  }

  /** 生産ラインへアサイン */
  assignToProduction(mioId, lineId) {
    const mio = this.get(mioId);
    if (!mio) return false;
    this.unassign(mioId);
    mio.assignment = { type: 'production', ref: lineId };
    return true;
  }

  unassign(mioId) {
    for (const m of this.list()) if (m.assignment) m.assignment = null;
    const mio = this.get(mioId);
    if (mio) mio.assignment = null;
  }

  /** 経験値獲得 → レベルアップ処理 */
  gainXP(mioId, amount, tag = this.state.playerTag) {
    const mio = this.get(mioId, tag);
    if (!mio) return;
    // 他国のMIOには入らない簡易ルール: プレイヤー国家のMIOのみ対象だが、参照は許す
    mio.xp += amount;
    while (mio.level < MIO_LEVEL_CAP && mio.xp >= mio.level * MIO_XP_PER_LEVEL) {
      mio.xp -= mio.level * MIO_XP_PER_LEVEL;
      mio.level += 1;
      toast(I18N.t('mio.level_up', { name: I18N.mioName(mioId), lv: mio.level }), 'good');
    }
  }

  /** 特性を選択（段階 = 添字。未解放レベルの段階は選択不可） */
  chooseTrait(mioId, tierIndex, optionIndex) {
    const mio = this.get(mioId);
    if (!mio) return false;
    if (mio.level < tierIndex + 1) return false; // レベル不足
    const tree = MIO_TRAIT_TREE[mio.type] || [];
    const options = tree[tierIndex] || [];
    const opt = options[optionIndex];
    if (!opt) return false;
    mio.traits = mio.traits.filter((t) => !tree[tierIndex].some((o) => o.id === t));
    mio.traits.push(opt.id);
    return true;
  }

  /** 特性の効果を集計 */
  traitEffects(mioId) {
    const mio = this.get(mioId);
    const out = {};
    if (!mio) return out;
    for (const t of mio.traits) {
      const e = TRAIT_EFFECTS[t];
      if (!e) continue;
      for (const [k, v] of Object.entries(e)) {
        if (k === 'category') continue;
        out[k] = (out[k] || 0) + v;
      }
    }
    return out;
  }

  /** レベルによる基礎ボーナス（研究速度+2%/Lv, 生産効率+2%/Lv） */
  levelBonus(mioId) {
    const mio = this.get(mioId);
    if (!mio) return { research: 0, production: 0 };
    return { research: 0.02 * (mio.level - 1), production: 0.02 * (mio.level - 1) };
  }

  /** 研究速度ボーナス（アサイン中のMIO） */
  researchSpeedBonus(mioId) {
    if (!mioId) return 0;
    const lv = this.levelBonus(mioId);
    const tr = this.traitEffects(mioId);
    return lv.research + (tr.researchSpeedPct || 0);
  }

  /** 生産効率ボーナス（アサイン中のMIO） */
  productionEfficiencyBonus(mioId) {
    if (!mioId) return 0;
    const lv = this.levelBonus(mioId);
    const tr = this.traitEffects(mioId);
    return lv.production + (tr.productionEfficiencyPct || 0);
  }

  productionCostMultiplier(mioId) {
    const tr = this.traitEffects(mioId);
    return 1 + (tr.productionCostPct || 0);
  }

  /** 特性ツリーの解放状況（UI用） */
  traitTreeStatus(mioId) {
    const mio = this.get(mioId);
    if (!mio) return [];
    const tree = MIO_TRAIT_TREE[mio.type] || [];
    return tree.map((options, tierIndex) => ({
      tier: tierIndex,
      unlocked: mio.level >= tierIndex + 1,
      options: options.map((o) => ({
        ...o,
        chosen: mio.traits.includes(o.id),
        name: I18N.mioTraitName(o.trait),
        desc: I18N.mioTraitDesc(o.trait),
      })),
    }));
  }
}
