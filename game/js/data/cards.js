/**
 * data/cards.js — 指揮官カード / MIOカード ローダー
 *  game/card/manifest.json を読み込み、army / navy / air / mio 各ブランチの
 *  カードデータを取得する。（顔画像は game/card 配下の獲得済みアセット）
 */

import { uid } from '../util.js';

export class CardLibrary {
  constructor() {
    this.byBranch = { army: [], navy: [], air: [], mio: [] };
    this.loaded = false;
  }

  async load() {
    try {
      const res = await fetch('game/card/manifest.json', { cache: 'no-cache' });
      const manifest = await res.json();
      const jobs = [];
      for (const [branch, files] of Object.entries(manifest.branches || {})) {
        for (const path of files) {
          jobs.push(fetch(path).then((r) => r.json()).then((data) => {
            if (this.byBranch[branch]) this.byBranch[branch].push({ ...data, branch });
          }).catch(() => {}));
        }
      }
      await Promise.all(jobs);
    } catch (e) {
      console.warn('[cards] カードの読み込みに失敗しました', e);
    }
    this.loaded = true;
    return this;
  }

  /** ブランチでフィルタ（海軍には navy のみ、空軍には air のみ…） */
  ofBranch(branch, nation = null) {
    return this.byBranch[branch].filter((c) => !nation || c.nation === nation || c.nation === 'WORLD');
  }

  /** プレイヤーの所持カード（初期は自国軍の全カード＋MIOカードを付与） */
  initialCollection(playerTag) {
    const out = [];
    for (const c of this.byBranch.army) if (c.nation === playerTag) out.push(this._instantiate(c));
    for (const c of this.byBranch.navy) if (c.nation === playerTag) out.push(this._instantiate(c));
    for (const c of this.byBranch.air) if (c.nation === playerTag) out.push(this._instantiate(c));
    for (const c of this.byBranch.mio) if (c.nation === playerTag) out.push(this._instantiate(c));
    return out;
  }

  _instantiate(template) {
    return { ...template, instanceId: uid('card'), level: 1, xp: 0 };
  }
}

/** レアリティの色 */
export const RARITY_COLORS = {
  common: '#8b96a0', rare: '#5e9ec7', epic: '#a06ec8', legendary: '#e6c268',
};

/** 指揮官特性 → 戦闘補正 */
export const COMMANDER_TRAITS = {
  armor_officer: { name: '装甲指揮官', effects: { armorPct: 0.10, hardPct: 0.05 } },
  infantry_officer: { name: '歩兵指揮官', effects: { softPct: 0.10, orgRecovery: 0.05 } },
  cavalry_officer: { name: '騎兵指揮官', effects: { speedPct: 0.10, breakthroughPct: 0.05 } },
  organizer: { name: '組織者', effects: { orgPct: 0.10, planningPct: 0.05 } },
  naval_commander: { name: '艦隊司令官', effects: { navalAttackPct: 0.08, navalDefensePct: 0.05 } },
  submarine_specialist: { name: '潜水艦専門家', effects: { submarineAttackPct: 0.15 } },
  escort_specialist: { name: '護衛専門家', effects: { escortScreeningPct: 0.15, escortASWPct: 0.10 } },
  carrier_specialist: { name: '空母専門家', effects: { carrierAirPct: 0.10 } },
  air_commander: { name: '航空司令官', effects: { airAttackPct: 0.08, agilityPct: 0.05 } },
  fighter_general: { name: '戦闘機指揮官', effects: { airAttackPct: 0.10, agilityPct: 0.05 } },
  ground_support_expert: { name: '地上支援専門家', effects: { groundAttackPct: 0.12 } },
  strategic_bomber_expert: { name: '戦略爆撃専門家', effects: { strategicBombingPct: 0.12 } },
  naval_aviation: { name: '海軍航空専門家', effects: { navalAttackPct: 0.10, carrierAirPct: 0.05 } },
  fleet_logistics: { name: '艦隊兵站家', effects: { navalRangePct: 0.10, supplyPct: -0.10 } },
};

/** カードの特性から戦闘補正を集計 */
export function commanderEffects(card) {
  const out = {};
  for (const t of card?.traits || []) {
    const e = COMMANDER_TRAITS[t]?.effects;
    if (!e) continue;
    for (const [k, v] of Object.entries(e)) out[k] = (out[k] || 0) + v * (card.level || 1 >= 3 ? 1.5 : 1);
  }
  return out;
}
