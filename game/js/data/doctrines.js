/** data/doctrines.js — ドクトリン（学説）ツリー定義：陸・海・空の3系統
 *  icons: game/assets/doctrine/{land,naval,air}/ の実ファイル
 *  相互排他ルート: group が同じノード同士は同時取得不可
 *  effects: 戦闘・生産への乗算補正（師団ステータス / 戦闘シミュレーターに適用）
 */

const D = 'game/assets/doctrine';

/** ノード定義: {id, icon, x, y(グリッド座標), cost(XP), requires[], group?, effects{}} */
export const DOCTRINE_TREES = {
  land: [
    // ── ルートA: 人的資源波 ──
    { id: 'land_mass_1', icon: `${D}/land/Mass_Assault.png`, x: 0, y: 0, cost: 1, requires: [], effects: { soft: 0.05, combatWidth: 2 } },
    { id: 'land_mass_2', icon: `${D}/land/Grand_Assault.png`, x: 0, y: 1, cost: 1, requires: ['land_mass_1'], effects: { breakthrough: 0.10 } },
    { id: 'land_mass_3', icon: `${D}/land/People's_Army.png`, x: 0, y: 2, cost: 2, requires: ['land_mass_2'], effects: { soft: 0.10, defense: 0.05 } },
    // ── ルートB: 機動戦（電撃戦）─ 相互排他ペアあり ──
    { id: 'land_blitz_1', icon: `${D}/land/Blitzkrieg.png`, x: 2, y: 0, cost: 1, requires: [], effects: { breakthrough: 0.10, org: 0.05 } },
    { id: 'land_blitz_2a', icon: `${D}/land/Armored_Spearhead.png`, x: 1, y: 1, cost: 1, requires: ['land_blitz_1'], group: 'land_mob2', effects: { hard: 0.10, armor: 0.05 } },
    { id: 'land_blitz_2b', icon: `${D}/land/Mechanized_Offensive.png`, x: 3, y: 1, cost: 1, requires: ['land_blitz_1'], group: 'land_mob2', effects: { speed: 0.10 } },
    { id: 'land_blitz_3', icon: `${D}/land/Modern_Blitzkrieg.png`, x: 2, y: 2, cost: 2, requires: ['land_blitz_2a', 'land_blitz_2b'], anyRequires: true, effects: { breakthrough: 0.15, speed: 0.05 } },
    // ── ルートC: 大規模戦計画（防御）─ 相互排他ペアあり ──
    { id: 'land_gbp_1', icon: `${D}/land/Grand_Battleplan.png`, x: 4, y: 0, cost: 1, requires: [], effects: { defense: 0.10, org: 0.10 } },
    { id: 'land_gbp_2a', icon: `${D}/land/Prepared_Defense.png`, x: 3, y: 1, cost: 1, requires: ['land_gbp_1'], group: 'land_def2', effects: { entrench: 0.20 } },
    { id: 'land_gbp_2b', icon: `${D}/land/Desperate_Defense.png`, x: 5, y: 1, cost: 1, requires: ['land_gbp_1'], group: 'land_def2', effects: { defense: 0.15, org: -0.10 } },
    { id: 'land_gbp_3', icon: `${D}/land/Defense_in_Depth.png`, x: 4, y: 2, cost: 2, requires: ['land_gbp_2a', 'land_gbp_2b'], anyRequires: true, effects: { defense: 0.10 } },
    // ── ルートD: 優勢火力 ──
    { id: 'land_sf_1', icon: `${D}/land/Superior_Firepower.png`, x: 6, y: 0, cost: 1, requires: [], effects: { soft: 0.05 } },
    { id: 'land_sf_2', icon: `${D}/land/Fire_Concentration.png`, x: 6, y: 1, cost: 1, requires: ['land_sf_1'], effects: { soft: 0.05, hard: 0.05 } },
    { id: 'land_sf_3', icon: `${D}/land/Overwhelming_Firepower.png`, x: 6, y: 2, cost: 2, requires: ['land_sf_2'], effects: { soft: 0.10, hard: 0.05 } },
  ],
  naval: [
    { id: 'naval_fib_1', icon: `${D}/naval/Fleet_In_Being.png`, x: 0, y: 0, cost: 1, requires: [], effects: { navalHeavy: 0.05 } },
    { id: 'naval_fib_2', icon: `${D}/naval/Fast_Battleships.png`, x: 0, y: 1, cost: 1, requires: ['naval_fib_1'], effects: { navalSpeed: 0.10 } },
    { id: 'naval_fib_3', icon: `${D}/naval/Line_of_Battle.png`, x: 0, y: 2, cost: 2, requires: ['naval_fib_2'], effects: { navalHeavy: 0.10, navalHit: 0.05 } },
    { id: 'naval_ti_1', icon: `${D}/naval/Trade_Interdiction.png`, x: 2, y: 0, cost: 1, requires: [], effects: { submarineAttack: 0.10 } },
    { id: 'naval_ti_2', icon: `${D}/naval/Wolfpacks.png`, x: 2, y: 1, cost: 1, requires: ['naval_ti_1'], effects: { submarineAttack: 0.10, submarineHit: 0.10 } },
    { id: 'naval_ti_3', icon: `${D}/naval/Long_Range_Submarines.png`, x: 2, y: 2, cost: 2, requires: ['naval_ti_2'], effects: { navalRange: 0.20 } },
    { id: 'naval_bs_1', icon: `${D}/naval/Base_Strike.png`, x: 4, y: 0, cost: 1, requires: [], effects: { carrierAir: 0.05 } },
    { id: 'naval_bs_2a', icon: `${D}/naval/Carrier_Battlegroups.png`, x: 3, y: 1, cost: 1, requires: ['naval_bs_1'], group: 'naval_bs2', effects: { carrierAir: 0.10 } },
    { id: 'naval_bs_2b', icon: `${D}/naval/Convoy_Escorts.png`, x: 5, y: 1, cost: 1, requires: ['naval_bs_1'], group: 'naval_bs2', effects: { escortASW: 0.15 } },
    { id: 'naval_bs_3', icon: `${D}/naval/Massed_Carrier_Fleet.png`, x: 4, y: 2, cost: 2, requires: ['naval_bs_2a', 'naval_bs_2b'], anyRequires: true, effects: { carrierAir: 0.15, carrierPlanes: 0.20 } },
  ],
  air: [
    { id: 'air_sd_1', icon: `${D}/air/Strategic_Destruction.png`, x: 0, y: 0, cost: 1, requires: [], effects: { strategicBombing: 0.10 } },
    { id: 'air_sd_2', icon: `${D}/air/High_Level_Bombing.png`, x: 0, y: 1, cost: 1, requires: ['air_sd_1'], effects: { bomberSurvival: 0.10 } },
    { id: 'air_sd_3', icon: `${D}/air/Carpet_Bombing.png`, x: 0, y: 2, cost: 2, requires: ['air_sd_2'], effects: { strategicBombing: 0.15 } },
    { id: 'air_bs_1', icon: `${D}/air/Battlefield_Support.png`, x: 2, y: 0, cost: 1, requires: [], effects: { groundAttack: 0.10 } },
    { id: 'air_bs_2', icon: `${D}/air/Direct_Ground_Support.png`, x: 2, y: 1, cost: 1, requires: ['air_bs_1'], effects: { groundAttack: 0.10 } },
    { id: 'air_bs_3', icon: `${D}/air/Tactical_Battlefield_Support.png`, x: 2, y: 2, cost: 2, requires: ['air_bs_2'], effects: { groundAttack: 0.15, airHit: 0.05 } },
    { id: 'air_as_1', icon: `${D}/air/Air_Superiority.png`, x: 4, y: 0, cost: 1, requires: [], effects: { airAttack: 0.05, agility: 0.05 } },
    { id: 'air_as_2a', icon: `${D}/air/Fighter_Sweeps.png`, x: 3, y: 1, cost: 1, requires: ['air_as_1'], group: 'air_as2', effects: { airAttack: 0.10 } },
    { id: 'air_as_2b', icon: `${D}/air/Fighter_Baiting.png`, x: 5, y: 1, cost: 1, requires: ['air_as_1'], group: 'air_as2', effects: { agility: 0.15 } },
    { id: 'air_as_3', icon: `${D}/air/Dogfighting_Experience.png`, x: 4, y: 2, cost: 2, requires: ['air_as_2a', 'air_as_2b'], anyRequires: true, effects: { airAttack: 0.15, agility: 0.10 } },
  ],
};

/** ノードの総合効果を集計（師団・戦闘計算に使用） */
export function aggregateDoctrineEffects(branch, unlockedIds) {
  const out = {};
  for (const node of DOCTRINE_TREES[branch] || []) {
    if (!unlockedIds.has(node.id)) continue;
    for (const [k, v] of Object.entries(node.effects)) out[k] = (out[k] || 0) + v;
  }
  return out;
}
