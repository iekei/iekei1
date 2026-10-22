/** data/doctrines.js — ドクトリン（学説）ツリー定義：陸・海・空の3系統
 *
 * HOI4 の陸軍/海軍/空軍ドクトリンを再現:
 *  - 各系統は複数の「ルート（樹）」に分かれ、ルートは相互排他。
 *    ひとつのルートを選ぶと他のルートは永続的にロックされる（HOI4 と同じ）。
 *  - ノードは前提ノード（requires）を持ち、XP（陸軍/海軍/空軍経験値）で解禁する。
 *  - 効果はグローバルな戦闘補正として集計され、戦闘計算・師団ステータスに適用される。
 *
 * アイコン: game/assets/doctrine/{land,naval,air}/ の実ファイルを <img> で読み込む。
 */

const D = 'game/assets/doctrine';

/* ============================ ルート定義 ============================ */

/** ルート: { id, name, desc, icon, color } — ルート選択は不可逆（排他） */
export const DOCTRINE_ROUTES = {
  land: [
    { id: 'mass',  name: '人的資源波',       desc: '人的資源と物量で押し切る。攻撃力・戦闘幅に優れる。', icon: `${D}/land/Mass_Assault.png`,        color: '#c08a4a' },
    { id: 'blitz', name: '機動戦（電撃戦）', desc: '装甲部隊の突破力と速度を重視。包囲殲滅向き。',       icon: `${D}/land/Blitzkrieg.png`,          color: '#e6c268' },
    { id: 'gbp',   name: '大規模戦計画',     desc: '計画準備と防御に優れる。長期戦・防衛戦向き。',       icon: `${D}/land/Grand_Battleplan.png`,    color: '#5e9ec7' },
    { id: 'sf',    name: '優勢火力',         desc: '砲兵と火力集中で敵を粉砕する。対人・対装甲が高い。', icon: `${D}/land/Superior_Firepower.png`,  color: '#d05038' },
  ],
  naval: [
    { id: 'fib', name: '決戦艦隊',   desc: '主力艦の火力と装甲を高める。艦隊決戦向き。', icon: `${D}/naval/Fleet_In_Being.png`,       color: '#5e9ec7' },
    { id: 'ti',  name: '通商破壊',   desc: '潜水艦と襲撃艦で敵の補給線を断つ。',         icon: `${D}/naval/Trade_Interdiction.png`,  color: '#c08a4a' },
    { id: 'bs',  name: '基地攻撃',   desc: '空母航空隊と機動部隊を中心とした打撃力。',   icon: `${D}/naval/Base_Strike.png`,         color: '#c8a24a' },
  ],
  air: [
    { id: 'sd', name: '戦略破壊',     desc: '戦略爆撃で敵の産業と都市を破壊する。', icon: `${D}/air/Strategic_Destruction.png`, color: '#d05038' },
    { id: 'bs', name: '戦場支援',     desc: '近接航空支援で地上軍の進撃を助ける。', icon: `${D}/air/Battlefield_Support.png`,   color: '#7ec850' },
    { id: 'oi', name: '作戦管制',     desc: '制空権の獲得と戦闘機の質で空を支配する。', icon: `${D}/air/Air_Superiority.png`,     color: '#5e9ec7' },
  ],
};

/** ルートごとの表示ラベル（UI 用） */
export function doctrineRoute(branch, routeId) {
  return (DOCTRINE_ROUTES[branch] || []).find((r) => r.id === routeId) || null;
}

/* ============================ ノード定義 ============================ */

/**
 * ノード: {
 *   id, branch, route, tier, icon, x, y, cost(XP),
 *   requires[], anyRequires?, group?（同一 group は同時取得不可）,
 *   effects{...}
 * }
 * effects のキー:
 *   org(組織力乗算) / soft(対人) / hard(対装甲) / defense(防御) / breakthrough(突破)
 *   speed(速度) / armor(装甲) / piercing(貫通) / entrench(掘り込み)
 *   maxPlanning(計画準備上限) / planningSpeed(計画準備速度) / combatWidth(戦闘幅)
 *   recovery(組織力回復) / navalHeavy / navalLight / navalHit / navalSpeed / navalRange
 *   submarineAttack / submarineHit / carrierAir / carrierPlanes / escortASW
 *   airAttack / airHit / agility / groundAttack / strategicBombing / bomberSurvival
 */
export const DOCTRINE_TREES = {
  land: [
    // ── ルートA: 人的資源波（Mass Assault）──
    { id: 'land_mass_1', branch: 'land', route: 'mass', tier: 0, icon: `${D}/land/Mass_Assault.png`, x: 0, y: 0, cost: 40, requires: [], effects: { org: 0.05, combatWidth: 2 } },
    { id: 'land_mass_2', branch: 'land', route: 'mass', tier: 1, icon: `${D}/land/Grand_Assault.png`, x: 0, y: 1, cost: 70, requires: ['land_mass_1'], effects: { soft: 0.10, breakthrough: 0.05 } },
    { id: 'land_mass_3', branch: 'land', route: 'mass', tier: 2, icon: `${D}/land/People's_Army.png`, x: 0, y: 2, cost: 100, requires: ['land_mass_2'], effects: { soft: 0.10, defense: 0.05, org: 0.05 } },
    { id: 'land_mass_4', name: '人的資源波 IV', desc: '人的資源を総動員し、攻撃力と計画準備をさらに高める。', branch: 'land', route: 'mass', tier: 3, icon: `${D}/land/Human_Wave_Offensive.png`, x: 0, y: 3, cost: 140, requires: ['land_mass_3'], effects: { soft: 0.10, maxPlanning: 0.05 } },

    // ── ルートB: 機動戦（Mobile Warfare / Blitzkrieg）──
    { id: 'land_blitz_1', branch: 'land', route: 'blitz', tier: 0, icon: `${D}/land/Blitzkrieg.png`, x: 1, y: 0, cost: 40, requires: [], effects: { breakthrough: 0.10, org: 0.05, planningSpeed: 0.10 } },
    { id: 'land_blitz_2a', branch: 'land', route: 'blitz', tier: 1, icon: `${D}/land/Armored_Spearhead.png`, x: 1, y: 1, cost: 70, requires: ['land_blitz_1'], group: 'land_mob2', effects: { hard: 0.10, armor: 0.05 } },
    { id: 'land_blitz_2b', branch: 'land', route: 'blitz', tier: 1, icon: `${D}/land/Mechanized_Offensive.png`, x: 1, y: 2, cost: 70, requires: ['land_blitz_1'], group: 'land_mob2', effects: { speed: 0.10, org: 0.05 } },
    { id: 'land_blitz_3', branch: 'land', route: 'blitz', tier: 2, icon: `${D}/land/Modern_Blitzkrieg.png`, x: 1, y: 3, cost: 100, requires: ['land_blitz_2a', 'land_blitz_2b'], anyRequires: true, effects: { breakthrough: 0.15, speed: 0.05, maxPlanning: 0.05 } },

    // ── ルートC: 大規模戦計画（Grand Battleplan）──
    { id: 'land_gbp_1', branch: 'land', route: 'gbp', tier: 0, icon: `${D}/land/Grand_Battleplan.png`, x: 2, y: 0, cost: 40, requires: [], effects: { defense: 0.10, org: 0.10 } },
    { id: 'land_gbp_2a', branch: 'land', route: 'gbp', tier: 1, icon: `${D}/land/Prepared_Defense.png`, x: 2, y: 1, cost: 70, requires: ['land_gbp_1'], group: 'land_def2', effects: { entrench: 0.20, defense: 0.05 } },
    { id: 'land_gbp_2b', branch: 'land', route: 'gbp', tier: 1, icon: `${D}/land/Desperate_Defense.png`, x: 2, y: 2, cost: 70, requires: ['land_gbp_1'], group: 'land_def2', effects: { defense: 0.15, org: -0.10 } },
    { id: 'land_gbp_3', branch: 'land', route: 'gbp', tier: 2, icon: `${D}/land/Defense_in_Depth.png`, x: 2, y: 3, cost: 100, requires: ['land_gbp_2a', 'land_gbp_2b'], anyRequires: true, effects: { defense: 0.10, maxPlanning: 0.10, planningSpeed: 0.25 } },
    { id: 'land_gbp_4', name: '中央集権的計画', desc: '大規模な計画準備を可能にし、組織力を底上げする。', branch: 'land', route: 'gbp', tier: 3, icon: `${D}/land/Central_Planning.png`, x: 2, y: 4, cost: 140, requires: ['land_gbp_3'], effects: { maxPlanning: 0.15, planningSpeed: 0.25, org: 0.05 } },

    // ── ルートD: 優勢火力（Superior Firepower）──
    { id: 'land_sf_1', branch: 'land', route: 'sf', tier: 0, icon: `${D}/land/Superior_Firepower.png`, x: 3, y: 0, cost: 40, requires: [], effects: { soft: 0.05, defense: 0.05 } },
    { id: 'land_sf_2', branch: 'land', route: 'sf', tier: 1, icon: `${D}/land/Fire_Concentration.png`, x: 3, y: 1, cost: 70, requires: ['land_sf_1'], effects: { soft: 0.05, hard: 0.05, piercing: 0.05 } },
    { id: 'land_sf_3', branch: 'land', route: 'sf', tier: 2, icon: `${D}/land/Overwhelming_Firepower.png`, x: 3, y: 2, cost: 100, requires: ['land_sf_2'], effects: { soft: 0.10, hard: 0.05 } },
    { id: 'land_sf_4', name: '集中火力計画', desc: '火力を一点に集中させ、突破力と対人攻撃を高める。', branch: 'land', route: 'sf', tier: 3, icon: `${D}/land/Concentrated_Fire_Plans.png`, x: 3, y: 3, cost: 140, requires: ['land_sf_3'], effects: { soft: 0.10, breakthrough: 0.05, maxPlanning: 0.05 } },
  ],

  naval: [
    // ── ルートA: 決戦艦隊（Fleet in Being）──
    { id: 'naval_fib_1', branch: 'naval', route: 'fib', tier: 0, icon: `${D}/naval/Fleet_In_Being.png`, x: 0, y: 0, cost: 40, requires: [], effects: { navalHeavy: 0.05, navalHit: 0.02 } },
    { id: 'naval_fib_2', branch: 'naval', route: 'fib', tier: 1, icon: `${D}/naval/Fast_Battleships.png`, x: 0, y: 1, cost: 70, requires: ['naval_fib_1'], effects: { navalSpeed: 0.10, navalHeavy: 0.05 } },
    { id: 'naval_fib_3', branch: 'naval', route: 'fib', tier: 2, icon: `${D}/naval/Line_of_Battle.png`, x: 0, y: 2, cost: 100, requires: ['naval_fib_2'], effects: { navalHeavy: 0.10, navalHit: 0.05 } },
    { id: 'naval_fib_4', name: '艦隊作戦', desc: '主力艦の火力と命中をさらに強化する。', branch: 'naval', route: 'fib', tier: 3, icon: `${D}/naval/Fleet_Operations.png`, x: 0, y: 3, cost: 140, requires: ['naval_fib_3'], effects: { navalHeavy: 0.10, navalLight: 0.05, navalHit: 0.03 } },

    // ── ルートB: 通商破壊（Trade Interdiction）──
    { id: 'naval_ti_1', branch: 'naval', route: 'ti', tier: 0, icon: `${D}/naval/Trade_Interdiction.png`, x: 1, y: 0, cost: 40, requires: [], effects: { submarineAttack: 0.10 } },
    { id: 'naval_ti_2', branch: 'naval', route: 'ti', tier: 1, icon: `${D}/naval/Wolfpacks.png`, x: 1, y: 1, cost: 70, requires: ['naval_ti_1'], effects: { submarineAttack: 0.10, submarineHit: 0.10 } },
    { id: 'naval_ti_3', branch: 'naval', route: 'ti', tier: 2, icon: `${D}/naval/Long_Range_Submarines.png`, x: 1, y: 2, cost: 100, requires: ['naval_ti_2'], effects: { navalRange: 0.20, submarineAttack: 0.05 } },
    { id: 'naval_ti_4', name: '先進潜水艦戦', desc: '潜水艦の攻撃力と命中を大幅に高める。', branch: 'naval', route: 'ti', tier: 3, icon: `${D}/naval/Advanced_Submarine_Warfare.png`, x: 1, y: 3, cost: 140, requires: ['naval_ti_3'], effects: { submarineAttack: 0.15, submarineHit: 0.05 } },

    // ── ルートC: 基地攻撃（Base Strike）──
    { id: 'naval_bs_1', branch: 'naval', route: 'bs', tier: 0, icon: `${D}/naval/Base_Strike.png`, x: 2, y: 0, cost: 40, requires: [], effects: { carrierAir: 0.05 } },
    { id: 'naval_bs_2a', branch: 'naval', route: 'bs', tier: 1, icon: `${D}/naval/Carrier_Battlegroups.png`, x: 2, y: 1, cost: 70, requires: ['naval_bs_1'], group: 'naval_bs2', effects: { carrierAir: 0.10 } },
    { id: 'naval_bs_2b', branch: 'naval', route: 'bs', tier: 1, icon: `${D}/naval/Convoy_Escorts.png`, x: 2, y: 2, cost: 70, requires: ['naval_bs_1'], group: 'naval_bs2', effects: { escortASW: 0.15 } },
    { id: 'naval_bs_3', branch: 'naval', route: 'bs', tier: 2, icon: `${D}/naval/Massed_Carrier_Fleet.png`, x: 2, y: 3, cost: 100, requires: ['naval_bs_2a', 'naval_bs_2b'], anyRequires: true, effects: { carrierAir: 0.15, carrierPlanes: 0.20 } },
  ],

  air: [
    // ── ルートA: 戦略破壊（Strategic Destruction）──
    { id: 'air_sd_1', branch: 'air', route: 'sd', tier: 0, icon: `${D}/air/Strategic_Destruction.png`, x: 0, y: 0, cost: 40, requires: [], effects: { strategicBombing: 0.10 } },
    { id: 'air_sd_2', branch: 'air', route: 'sd', tier: 1, icon: `${D}/air/High_Level_Bombing.png`, x: 0, y: 1, cost: 70, requires: ['air_sd_1'], effects: { bomberSurvival: 0.10, strategicBombing: 0.05 } },
    { id: 'air_sd_3', branch: 'air', route: 'sd', tier: 2, icon: `${D}/air/Carpet_Bombing.png`, x: 0, y: 2, cost: 100, requires: ['air_sd_2'], effects: { strategicBombing: 0.15 } },
    { id: 'air_sd_4', name: '夜間戦略爆撃', desc: '夜間爆撃により戦略破壊力と爆撃機の生存性を高める。', branch: 'air', route: 'sd', tier: 3, icon: `${D}/air/Night_Strategic_Bombing.png`, x: 0, y: 3, cost: 140, requires: ['air_sd_3'], effects: { strategicBombing: 0.15, bomberSurvival: 0.10 } },

    // ── ルートB: 戦場支援（Battlefield Support）──
    { id: 'air_bs_1', branch: 'air', route: 'bs', tier: 0, icon: `${D}/air/Battlefield_Support.png`, x: 1, y: 0, cost: 40, requires: [], effects: { groundAttack: 0.10 } },
    { id: 'air_bs_2', branch: 'air', route: 'bs', tier: 1, icon: `${D}/air/Direct_Ground_Support.png`, x: 1, y: 1, cost: 70, requires: ['air_bs_1'], effects: { groundAttack: 0.10, airHit: 0.03 } },
    { id: 'air_bs_3', branch: 'air', route: 'bs', tier: 2, icon: `${D}/air/Tactical_Battlefield_Support.png`, x: 1, y: 2, cost: 100, requires: ['air_bs_2'], effects: { groundAttack: 0.15, airHit: 0.05 } },
    { id: 'air_bs_4', name: '作戦航空支援', desc: '地上軍への近接航空支援を組織的に行う。', branch: 'air', route: 'bs', tier: 3, icon: `${D}/air/Operational_Air_Support.png`, x: 1, y: 3, cost: 140, requires: ['air_bs_3'], effects: { groundAttack: 0.10, airAttack: 0.05 } },

    // ── ルートC: 作戦管制（Operational Integrity / Air Superiority）──
    { id: 'air_as_1', branch: 'air', route: 'oi', tier: 0, icon: `${D}/air/Air_Superiority.png`, x: 2, y: 0, cost: 40, requires: [], effects: { airAttack: 0.05, agility: 0.05 } },
    { id: 'air_as_2a', branch: 'air', route: 'oi', tier: 1, icon: `${D}/air/Fighter_Sweeps.png`, x: 2, y: 1, cost: 70, requires: ['air_as_1'], group: 'air_as2', effects: { airAttack: 0.10 } },
    { id: 'air_as_2b', branch: 'air', route: 'oi', tier: 1, icon: `${D}/air/Fighter_Baiting.png`, x: 2, y: 2, cost: 70, requires: ['air_as_1'], group: 'air_as2', effects: { agility: 0.15 } },
    { id: 'air_as_3', branch: 'air', route: 'oi', tier: 2, icon: `${D}/air/Dogfighting_Experience.png`, x: 2, y: 3, cost: 100, requires: ['air_as_2a', 'air_as_2b'], anyRequires: true, effects: { airAttack: 0.15, agility: 0.10 } },
    { id: 'air_as_4', name: '制空権の支配', desc: '戦闘機の攻撃力・機動性・命中を高め、制空権を確立する。', branch: 'air', route: 'oi', tier: 3, icon: `${D}/air/Airspace_Dominance.png`, x: 2, y: 4, cost: 140, requires: ['air_as_3'], effects: { airAttack: 0.10, agility: 0.10, airHit: 0.05 } },
  ],
};

/** branch の全ノード（フラット） */
export function nodesOf(branch) { return DOCTRINE_TREES[branch] || []; }

/** ノード ID からノードを取得 */
export function findDoctrineNode(branch, nodeId) {
  return nodesOf(branch).find((n) => n.id === nodeId) || null;
}

/** ノードが属するルート ID */
export function routeOf(branch, nodeId) {
  return findDoctrineNode(branch, nodeId)?.route || null;
}

/** ノードの総合効果を集計（師団・戦闘計算に使用） */
export function aggregateDoctrineEffects(branch, unlockedIds) {
  const out = {};
  for (const node of nodesOf(branch)) {
    if (!unlockedIds.has(node.id)) continue;
    for (const [k, v] of Object.entries(node.effects || {})) out[k] = (out[k] || 0) + v;
  }
  return out;
}

/** 陸・海・空すべての効果を合算 */
export function aggregateAllDoctrineEffects(doctrineState) {
  const out = {};
  for (const branch of ['land', 'naval', 'air']) {
    const un = doctrineState?.unlocked?.[branch];
    if (!un) continue;
    const eff = aggregateDoctrineEffects(branch, un);
    for (const [k, v] of Object.entries(eff)) out[k] = (out[k] || 0) + v;
  }
  return out;
}

/** ルート選択状況（どのルートが選択済み・ロック済みか） */
export function routeStates(branch, selectedRoute, unlockedIds) {
  return DOCTRINE_ROUTES[branch].map((route) => {
    const nodes = nodesOf(branch).filter((n) => n.route === route.id);
    const taken = nodes.filter((n) => unlockedIds.has(n.id)).length;
    const locked = selectedRoute ? selectedRoute !== route.id : false;
    return { ...route, total: nodes.length, taken, locked, selected: selectedRoute === route.id };
  });
}

/** UI 表示用の効果ラベル */
export const DOCTRINE_EFFECT_LABELS = {
  org: '組織力', soft: '対人攻撃', hard: '対装甲攻撃', defense: '防御', breakthrough: '突破',
  speed: '速度', armor: '装甲', piercing: '貫通', entrench: '掘り込み', combatWidth: '戦闘幅',
  recovery: '組織力回復', maxPlanning: '計画準備上限', planningSpeed: '計画準備速度',
  navalHeavy: '主力艦攻撃', navalLight: '軽艦攻撃', navalHit: '命中', navalSpeed: '艦速',
  navalRange: '航続距離', submarineAttack: '潜水艦攻撃', submarineHit: '潜水艦命中',
  carrierAir: '空母航空攻撃', carrierPlanes: '空母搭載機', escortASW: '護衛対潜',
  airAttack: '空戦攻撃', airHit: '空中命中', agility: '機動性', groundAttack: '地上攻撃',
  strategicBombing: '戦略爆撃', bomberSurvival: '爆撃機生存性',
};

/** 効果値を人間向け文字列に（% か絶対値か） */
export function formatDoctrineEffect(key, value) {
  const abs = new Set(['combatWidth']);
  if (abs.has(key)) return `${value > 0 ? '+' : ''}${value}`;
  return `${value > 0 ? '+' : ''}${Math.round(value * 100)}%`;
}
