/* ==========================================================
 * assets/doctrine-data.js — 陸/海/空ドクトリンツリー定義
 * ----------------------------------------------------------
 * HOI4 のドクトリン (Grand Battleplan / Blitzkrieg / Superior Firepower 等)
 * を再現する。3 系統 × 3〜4 ルート。ルート選択は不可逆 (他ルートは永久ロック)、
 * ノードは陸軍/海軍/空軍 XP で解禁し、効果はグローバル補正として戦闘計算に載る。
 *
 * アイコン: assets/doctrine/{land,naval,air}/*.png を <img> で読み込む。
 * ========================================================== */
'use strict';

window.DOCTRINE_DATA = {
  branches: {
    land: {
      label: "陸軍", xpKey: "army",
      routes: [
        { id: "mass", name: "人的資源波", desc: "人的資源と物量で押し切る。攻撃力・戦闘幅に優れる。", icon: "assets/doctrine/land/Mass_Assault.png", color: "#c08a4a" },
        { id: "blitz", name: "機動戦（電撃戦）", desc: "装甲部隊の突破力と速度を重視。包囲殲滅向き。", icon: "assets/doctrine/land/Blitzkrieg.png", color: "#e6c268" },
        { id: "gbp", name: "大規模戦計画", desc: "計画準備と防御に優れる。長期戦・防衛戦向き。", icon: "assets/doctrine/land/Grand_Battleplan.png", color: "#5e9ec7" },
        { id: "sf", name: "優勢火力", desc: "砲兵と火力集中で敵を粉砕する。対人・対装甲が高い。", icon: "assets/doctrine/land/Superior_Firepower.png", color: "#d05038" },
      ],
      nodes: [
        { id: "land_mass_1", name: "人的資源波 I", desc: "人的資源を動員して大規模な攻勢を可能にする。", route: "mass", tier: 0, icon: "assets/doctrine/land/Mass_Assault.png", cost: 40, requires: [], effects: { org: 0.05, combatWidth: 2 } },
        { id: "land_mass_2", name: "大規模攻勢", desc: "歩兵の数量を活かした広正面攻勢を教義化する。", route: "mass", tier: 1, icon: "assets/doctrine/land/Grand_Assault.png", cost: 70, requires: ["land_mass_1"], effects: { soft: 0.1, breakthrough: 0.05 } },
        { id: "land_mass_3", name: "人民軍", desc: "国民総動員による大人数の軍隊を組織する。", route: "mass", tier: 2, icon: "assets/doctrine/land/People's_Army.png", cost: 100, requires: ["land_mass_2"], effects: { soft: 0.1, defense: 0.05, org: 0.05 } },
        { id: "land_mass_4", name: "人的資源波 IV", desc: "人的資源を総動員し、攻撃力と計画準備をさらに高める。", route: "mass", tier: 3, icon: "assets/doctrine/land/Human_Wave_Offensive.png", cost: 140, requires: ["land_mass_3"], effects: { soft: 0.1, maxPlanning: 0.05 } },
        { id: "land_blitz_1", name: "電撃戦", desc: "機甲部隊の速度と突破力を重視する。", route: "blitz", tier: 0, icon: "assets/doctrine/land/Blitzkrieg.png", cost: 40, requires: [], effects: { breakthrough: 0.1, org: 0.05, planningSpeed: 0.1 } },
        { id: "land_blitz_2a", name: "装甲先鋒", desc: "戦車を先頭に立てて敵防御線を突破する。", route: "blitz", tier: 1, icon: "assets/doctrine/land/Armored_Spearhead.png", cost: 70, requires: ["land_blitz_1"], group: "land_mob2", effects: { hard: 0.1, armor: 0.05 } },
        { id: "land_blitz_2b", name: "機械化攻勢", desc: "自動車化・機械化部隊による機動攻勢。", route: "blitz", tier: 1, icon: "assets/doctrine/land/Mechanized_Offensive.png", cost: 70, requires: ["land_blitz_1"], group: "land_mob2", effects: { speed: 0.1, org: 0.05 } },
        { id: "land_blitz_3", name: "現代電撃戦", desc: "装甲と機械化を統合した現代的な電撃戦。", route: "blitz", tier: 2, icon: "assets/doctrine/land/Modern_Blitzkrieg.png", cost: 100, requires: ["land_blitz_2a", "land_blitz_2b"], anyRequires: true, effects: { breakthrough: 0.15, speed: 0.05, maxPlanning: 0.05 } },
        { id: "land_gbp_1", name: "大規模戦計画", desc: "入念な計画準備と統合的指揮で戦う。", route: "gbp", tier: 0, icon: "assets/doctrine/land/Grand_Battleplan.png", cost: 40, requires: [], effects: { defense: 0.1, org: 0.1 } },
        { id: "land_gbp_2a", name: "準備防御", desc: "陣地を構築し敵攻勢を迎え撃つ。", route: "gbp", tier: 1, icon: "assets/doctrine/land/Prepared_Defense.png", cost: 70, requires: ["land_gbp_1"], group: "land_def2", effects: { entrench: 0.2, defense: 0.05 } },
        { id: "land_gbp_2b", name: "絶望的防御", desc: "国土防衛のためあらゆる手段で抵抗する。", route: "gbp", tier: 1, icon: "assets/doctrine/land/Desperate_Defense.png", cost: 70, requires: ["land_gbp_1"], group: "land_def2", effects: { defense: 0.15, org: -0.1 } },
        { id: "land_gbp_3", name: "縦深防御", desc: "複数の防御線で敵の突破を遅滞させる。", route: "gbp", tier: 2, icon: "assets/doctrine/land/Defense_in_Depth.png", cost: 100, requires: ["land_gbp_2a", "land_gbp_2b"], anyRequires: true, effects: { defense: 0.1, maxPlanning: 0.1, planningSpeed: 0.25 } },
        { id: "land_gbp_4", name: "中央集権的計画", desc: "大規模な計画準備を可能にし、組織力を底上げする。", route: "gbp", tier: 3, icon: "assets/doctrine/land/Central_Planning.png", cost: 140, requires: ["land_gbp_3"], effects: { maxPlanning: 0.15, planningSpeed: 0.25, org: 0.05 } },
        { id: "land_sf_1", name: "優勢火力", desc: "砲兵と火力の集中で敵を圧倒する。", route: "sf", tier: 0, icon: "assets/doctrine/land/Superior_Firepower.png", cost: 40, requires: [], effects: { soft: 0.05, defense: 0.05 } },
        { id: "land_sf_2", name: "火力集中", desc: "限られた正面に火力を集中させる。", route: "sf", tier: 1, icon: "assets/doctrine/land/Fire_Concentration.png", cost: 70, requires: ["land_sf_1"], effects: { soft: 0.05, hard: 0.05, piercing: 0.05 } },
        { id: "land_sf_3", name: "圧倒的火力", desc: "あらゆる火器を動員して敵陣地を粉砕する。", route: "sf", tier: 2, icon: "assets/doctrine/land/Overwhelming_Firepower.png", cost: 100, requires: ["land_sf_2"], effects: { soft: 0.1, hard: 0.05 } },
        { id: "land_sf_4", name: "集中火力計画", desc: "火力を一点に集中させ、突破力と対人攻撃を高める。", route: "sf", tier: 3, icon: "assets/doctrine/land/Concentrated_Fire_Plans.png", cost: 140, requires: ["land_sf_3"], effects: { soft: 0.1, breakthrough: 0.05, maxPlanning: 0.05 } },
      ]
    },
    naval: {
      label: "海軍", xpKey: "navy",
      routes: [
        { id: "fib", name: "決戦艦隊", desc: "主力艦の火力と装甲を高める。艦隊決戦向き。", icon: "assets/doctrine/naval/Fleet_In_Being.png", color: "#5e9ec7" },
        { id: "ti", name: "通商破壊", desc: "潜水艦と襲撃艦で敵の補給線を断つ。", icon: "assets/doctrine/naval/Trade_Interdiction.png", color: "#c08a4a" },
        { id: "bs", name: "基地攻撃", desc: "空母航空隊と機動部隊を中心とした打撃力。", icon: "assets/doctrine/naval/Base_Strike.png", color: "#c8a24a" },
      ],
      nodes: [
        { id: "naval_fib_1", name: "決戦艦隊", desc: "主力艦隊による艦隊決戦を重視する。", route: "fib", tier: 0, icon: "assets/doctrine/naval/Fleet_In_Being.png", cost: 40, requires: [], effects: { navalHeavy: 0.05, navalHit: 0.02 } },
        { id: "naval_fib_2", name: "高速戦艦", desc: "高速な主力艦で機動的に決戦を挑む。", route: "fib", tier: 1, icon: "assets/doctrine/naval/Fast_Battleships.png", cost: 70, requires: ["naval_fib_1"], effects: { navalSpeed: 0.1, navalHeavy: 0.05 } },
        { id: "naval_fib_3", name: "戦列", desc: "戦列を組んで斉射する伝統的砲戦術。", route: "fib", tier: 2, icon: "assets/doctrine/naval/Line_of_Battle.png", cost: 100, requires: ["naval_fib_2"], effects: { navalHeavy: 0.1, navalHit: 0.05 } },
        { id: "naval_fib_4", name: "艦隊作戦", desc: "主力艦の火力と命中をさらに強化する。", route: "fib", tier: 3, icon: "assets/doctrine/naval/Fleet_Operations.png", cost: 140, requires: ["naval_fib_3"], effects: { navalHeavy: 0.1, navalLight: 0.05, navalHit: 0.03 } },
        { id: "naval_ti_1", name: "通商破壊", desc: "敵の海上輸送線を攻撃する。", route: "ti", tier: 0, icon: "assets/doctrine/naval/Trade_Interdiction.png", cost: 40, requires: [], effects: { submarineAttack: 0.1 } },
        { id: "naval_ti_2", name: "群狼作戦", desc: "潜水艦の集団攻撃で船団を殲滅する。", route: "ti", tier: 1, icon: "assets/doctrine/naval/Wolfpacks.png", cost: 70, requires: ["naval_ti_1"], effects: { submarineAttack: 0.1, submarineHit: 0.1 } },
        { id: "naval_ti_3", name: "長距離潜水艦", desc: "航続距離を延ばし遠洋で通商破壊を行う。", route: "ti", tier: 2, icon: "assets/doctrine/naval/Long_Range_Submarines.png", cost: 100, requires: ["naval_ti_2"], effects: { navalRange: 0.2, submarineAttack: 0.05 } },
        { id: "naval_ti_4", name: "先進潜水艦戦", desc: "潜水艦の攻撃力と命中を大幅に高める。", route: "ti", tier: 3, icon: "assets/doctrine/naval/Advanced_Submarine_Warfare.png", cost: 140, requires: ["naval_ti_3"], effects: { submarineAttack: 0.15, submarineHit: 0.05 } },
        { id: "naval_bs_1", name: "基地攻撃", desc: "敵基地・港湾への航空打撃を重視する。", route: "bs", tier: 0, icon: "assets/doctrine/naval/Base_Strike.png", cost: 40, requires: [], effects: { carrierAir: 0.05 } },
        { id: "naval_bs_2a", name: "空母打撃群", desc: "空母を中心とした機動打撃群を編成する。", route: "bs", tier: 1, icon: "assets/doctrine/naval/Carrier_Battlegroups.png", cost: 70, requires: ["naval_bs_1"], group: "naval_bs2", effects: { carrierAir: 0.1 } },
        { id: "naval_bs_2b", name: "船団護衛", desc: "護衛艦艇による対潜護衛を強化する。", route: "bs", tier: 1, icon: "assets/doctrine/naval/Convoy_Escorts.png", cost: 70, requires: ["naval_bs_1"], group: "naval_bs2", effects: { escortASW: 0.15 } },
        { id: "naval_bs_3", name: "大規模空母機動部隊", desc: "空母を集中運用し航空打撃力を最大化する。", route: "bs", tier: 2, icon: "assets/doctrine/naval/Massed_Carrier_Fleet.png", cost: 100, requires: ["naval_bs_2a", "naval_bs_2b"], anyRequires: true, effects: { carrierAir: 0.15, carrierPlanes: 0.2 } },
      ]
    },
    air: {
      label: "空軍", xpKey: "air",
      routes: [
        { id: "sd", name: "戦略破壊", desc: "戦略爆撃で敵の産業と都市を破壊する。", icon: "assets/doctrine/air/Strategic_Destruction.png", color: "#d05038" },
        { id: "bs", name: "戦場支援", desc: "近接航空支援で地上軍の進撃を助ける。", icon: "assets/doctrine/air/Battlefield_Support.png", color: "#7ec850" },
        { id: "oi", name: "作戦管制", desc: "制空権の獲得と戦闘機の質で空を支配する。", icon: "assets/doctrine/air/Air_Superiority.png", color: "#5e9ec7" },
      ],
      nodes: [
        { id: "air_sd_1", name: "戦略破壊", desc: "敵の産業と都市を戦略爆撃で破壊する。", route: "sd", tier: 0, icon: "assets/doctrine/air/Strategic_Destruction.png", cost: 40, requires: [], effects: { strategicBombing: 0.1 } },
        { id: "air_sd_2", name: "高高度爆撃", desc: "高高度からの爆撃で生存性を高める。", route: "sd", tier: 1, icon: "assets/doctrine/air/High_Level_Bombing.png", cost: 70, requires: ["air_sd_1"], effects: { bomberSurvival: 0.1, strategicBombing: 0.05 } },
        { id: "air_sd_3", name: "絨毯爆撃", desc: "広範囲を無差別に爆撃し戦略破壊を進める。", route: "sd", tier: 2, icon: "assets/doctrine/air/Carpet_Bombing.png", cost: 100, requires: ["air_sd_2"], effects: { strategicBombing: 0.15 } },
        { id: "air_sd_4", name: "夜間戦略爆撃", desc: "夜間爆撃により戦略破壊力と爆撃機の生存性を高める。", route: "sd", tier: 3, icon: "assets/doctrine/air/Night_Strategic_Bombing.png", cost: 140, requires: ["air_sd_3"], effects: { strategicBombing: 0.15, bomberSurvival: 0.1 } },
        { id: "air_bs_1", name: "戦場支援", desc: "地上軍への近接航空支援を行う。", route: "bs", tier: 0, icon: "assets/doctrine/air/Battlefield_Support.png", cost: 40, requires: [], effects: { groundAttack: 0.1 } },
        { id: "air_bs_2", name: "直接地上支援", desc: "前線直近で敵陣地を攻撃する。", route: "bs", tier: 1, icon: "assets/doctrine/air/Direct_Ground_Support.png", cost: 70, requires: ["air_bs_1"], effects: { groundAttack: 0.1, airHit: 0.03 } },
        { id: "air_bs_3", name: "戦術的戦場支援", desc: "戦術爆撃で敵の後方遮断を行う。", route: "bs", tier: 2, icon: "assets/doctrine/air/Tactical_Battlefield_Support.png", cost: 100, requires: ["air_bs_2"], effects: { groundAttack: 0.15, airHit: 0.05 } },
        { id: "air_bs_4", name: "作戦航空支援", desc: "地上軍への近接航空支援を組織的に行う。", route: "bs", tier: 3, icon: "assets/doctrine/air/Operational_Air_Support.png", cost: 140, requires: ["air_bs_3"], effects: { groundAttack: 0.1, airAttack: 0.05 } },
        { id: "air_as_1", name: "制空", desc: "戦闘機で敵航空戦力を排除する。", route: "oi", tier: 0, icon: "assets/doctrine/air/Air_Superiority.png", cost: 40, requires: [], effects: { airAttack: 0.05, agility: 0.05 } },
        { id: "air_as_2a", name: "戦闘機掃討", desc: "戦闘機を敵空域へ送り込み掃討する。", route: "oi", tier: 1, icon: "assets/doctrine/air/Fighter_Sweeps.png", cost: 70, requires: ["air_as_1"], group: "air_as2", effects: { airAttack: 0.1 } },
        { id: "air_as_2b", name: "戦闘機誘致", desc: "囮で敵戦闘機を誘き出し撃墜する。", route: "oi", tier: 1, icon: "assets/doctrine/air/Fighter_Baiting.png", cost: 70, requires: ["air_as_1"], group: "air_as2", effects: { agility: 0.15 } },
        { id: "air_as_3", name: "空中戦の経験", desc: "実戦経験から空中戦術を洗練する。", route: "oi", tier: 2, icon: "assets/doctrine/air/Dogfighting_Experience.png", cost: 100, requires: ["air_as_2a", "air_as_2b"], anyRequires: true, effects: { airAttack: 0.15, agility: 0.1 } },
        { id: "air_as_4", name: "制空権の支配", desc: "戦闘機の攻撃力・機動性・命中を高め、制空権を確立する。", route: "oi", tier: 3, icon: "assets/doctrine/air/Airspace_Dominance.png", cost: 140, requires: ["air_as_3"], effects: { airAttack: 0.1, agility: 0.1, airHit: 0.05 } },
      ]
    },
  },

  // 効果キー → 日本語ラベル (UI 表示用)
  effectLabels: {
    "org": "組織力",
    "soft": "対人攻撃",
    "hard": "対装甲攻撃",
    "defense": "防御",
    "breakthrough": "突破",
    "speed": "速度",
    "armor": "装甲",
    "piercing": "貫通",
    "entrench": "掘り込み",
    "combatWidth": "戦闘幅",
    "recovery": "組織力回復",
    "maxPlanning": "計画準備上限",
    "planningSpeed": "計画準備速度",
    "navalHeavy": "主力艦攻撃",
    "navalLight": "軽艦攻撃",
    "navalHit": "命中",
    "navalSpeed": "艦速",
    "navalRange": "航続距離",
    "submarineAttack": "潜水艦攻撃",
    "submarineHit": "潜水艦命中",
    "carrierAir": "空母航空攻撃",
    "carrierPlanes": "空母搭載機",
    "escortASW": "護衛対潜",
    "airAttack": "空戦攻撃",
    "airHit": "空中命中",
    "agility": "機動性",
    "groundAttack": "地上攻撃",
    "strategicBombing": "戦略爆撃",
    "bomberSurvival": "爆撃機生存性"
  }
};
