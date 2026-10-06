'use strict';

// 国家方針の完了報酬を管理するマネージャー。
// 表示フォーマット・状態適用は game/assets/hoi4-effects-config.js が一元管理し、
// このモジュールは国家固有の方針データと報酬の生成・連携を担う。
class NationalFocusManager {
  static TREES = {
    GER: [
      { id: 'ger_rhineland', name: 'ラインラント進駐', days: 70, date: [1936, 3, 1], effect: { politicalPower: 50, worldTension: 2 } },
      { id: 'ger_four_year', name: '四カ年計画', days: 70, requires: ['ger_rhineland'], effect: { civilianFactories: 2 } },
      { id: 'ger_anti_comintern', name: '反コミンテルン協定', days: 70, requires: ['ger_four_year'], effect: { worldTension: 2, politicalPower: 50 } },
      { id: 'ger_anschluss', name: 'アンシュルス', days: 70, requires: ['ger_anti_comintern'], date: [1938, 1, 1], effect: { politicalPower: 120, worldTension: 5 } },
      { id: 'ger_munich', name: 'ミュンヘン会談', days: 70, requires: ['ger_anschluss'], date: [1938, 9, 1], effect: { worldTension: 5, politicalPower: 50 } },
      { id: 'ger_danzig', name: 'ダンツィヒか戦争か', days: 70, requires: ['ger_munich'], date: [1939, 1, 1], effect: { worldTension: 8, armyXp: 20 } },
      { id: 'ger_west_wall', name: '西の壁', days: 70, requires: ['ger_four_year'], effect: {}, bunkerLevel: 3 },
      { id: 'ger_barbarossa', name: 'バルバロッサ', days: 90, requires: ['ger_danzig'], date: [1941, 1, 1], effect: { armyXp: 25, warSupport: 10 } }
    ],
    JAP: [
      { id: 'jap_man_chu', name: '満洲国の強化', days: 70, effect: { militaryFactories: 2, politicalPower: 30 } },
      { id: 'jap_lukou', name: '盧溝橋事件への対応', days: 70, requires: ['jap_man_chu'], date: [1937, 7, 1], effect: { worldTension: 5, armyXp: 15 } },
      { id: 'jap_navy', name: '連合艦隊の拡張', days: 70, requires: ['jap_lukou'], effect: { navyXp: 25, dockyards: 1 } },
      { id: 'jap_south', name: '南進論', days: 70, requires: ['jap_navy'], date: [1940, 1, 1], effect: { worldTension: 5, warSupport: 5 } },
      { id: 'jap_pearl', name: 'Z作戦（真珠湾）', days: 90, requires: ['jap_south'], date: [1941, 10, 1], effect: { navyXp: 40, worldTension: 10, warSupport: 15 } }
    ],
    SOV: [
      { id: 'sov_five_year', name: '五カ年計画', days: 70, effect: { civilianFactories: 3 } },
      { id: 'sov_purge', name: '大粛清', days: 70, requires: ['sov_five_year'], effect: { politicalPower: 80, stability: -10 } },
      { id: 'sov_army', name: '赤軍の再編', days: 70, requires: ['sov_purge'], effect: { armyXp: 30 } },
      { id: 'sov_reform', name: '軍の改革', days: 80, requires: ['sov_army'], date: [1939, 1, 1], effect: { armyXp: 30, warSupport: 5 } },
      { id: 'sov_stalin_line', name: 'スターリン線', days: 70, requires: ['sov_purge'], effect: {}, bunkerLevel: 3 }
    ],
    USA: [
      { id: 'usa_rearm', name: '軍備再建', days: 70, effect: { militaryFactories: 3, politicalPower: 40 } },
      { id: 'usa_arsenal', name: '民主主義の兵器廠', days: 70, requires: ['usa_rearm'], effect: { civilianFactories: 3, armyXp: 15 } },
      { id: 'usa_war_plans', name: 'レンドリース法', days: 70, requires: ['usa_arsenal'], effect: { politicalPower: 50, civilianFactories: 2 } }
    ],
    ENG: [
      { id: 'eng_rearm', name: '再軍備', days: 70, effect: { militaryFactories: 2, politicalPower: 30 } },
      { id: 'eng_empire', name: '帝国の結束', days: 70, requires: ['eng_rearm'], effect: { politicalPower: 60, stability: 5 } },
      { id: 'eng_dunkirk', name: 'ダンケルクの精神', days: 70, requires: ['eng_empire'], effect: { warSupport: 15, navyXp: 20 } }
    ],
    FRA: [
      { id: 'fra_industry', name: '工業への投資', days: 70, effect: { civilianFactories: 2 } },
      { id: 'fra_defense', name: 'マジノ線の拡張', days: 70, requires: ['fra_industry'], effect: { armyXp: 15 }, bunkerLevel: 4 },
      { id: 'fra_reform', name: '軍政改革', days: 70, requires: ['fra_defense'], effect: { politicalPower: 40, armyXp: 20 } }
    ],
    ITA: [
      { id: 'ita_industry', name: '工業化計画', days: 70, effect: { civilianFactories: 2 } },
      { id: 'ita_empire', name: '帝国の野望', days: 70, requires: ['ita_industry'], effect: { worldTension: 5, warSupport: 10 } },
      { id: 'ita_navy', name: '地中海の制海', days: 70, requires: ['ita_empire'], effect: { navyXp: 25, dockyards: 1 } }
    ]
  };

  static init() {
    const s = CoreEngine.gameState;
    s.nationalFocus = s.nationalFocus || { active: null, progress: 0, completed: [] };
    CoreEngine.registerTickCallback(() => NationalFocusManager.onTick());
  }

  static tree(tag) {
    const tree = this.TREES[tag] || [
      { id: 'generic_industry', name: '工業化促進', days: 70, effect: { civilianFactories: 1 } },
      { id: 'generic_army', name: '軍備拡張', days: 70, requires: ['generic_industry'], effect: { militaryFactories: 1 } }
    ];
    // 外部読み込みの方針にも、UI表示と実行処理で共通の報酬形式を必ず付与する。
    return tree.map(focus => {
      const existingRewards = focus.completion_rewards || focus.completionRewards;
      return existingRewards?.length
        ? { ...focus, completion_rewards: existingRewards }
        : { ...focus, completion_rewards: this.buildCompletionRewards(focus, tag) };
    });
  }

  // 既存の effect から completion_rewards を生成する。共通処理は HOI4EffectsConfig に委譲し、
  // ここでは国家固有の特別扱い (bunkerLevel 等) を反映してから委譲する。
  static buildCompletionRewards(focus, tag) {
    const builder = window.HOI4EffectsConfig?.buildRewardsFromFocus;
    if (typeof builder === 'function') return builder(focus, tag);
    // フォールバック (config 未読み込み時)
    const effect = (focus.effect && typeof focus.effect === 'object') ? focus.effect : {};
    const rewards = [];
    const add = (type, value) => { if (value !== undefined && value !== null && Number(value) !== 0) rewards.push({ type, value: Number(value) }); };
    add('add_political_power', effect.politicalPower);
    add('add_stability', effect.stability);
    add('add_war_support', effect.warSupport);
    add('add_army_experience', effect.armyXp);
    add('add_navy_experience', effect.navyXp);
    add('add_air_experience', effect.airXp);
    add('add_research_slot', effect.researchSlots);
    add('add_world_tension', effect.worldTension);
    if (effect.civilianFactories) rewards.push({ type: 'add_building_construction', building: 'industrial_complex', level: Number(effect.civilianFactories) });
    if (effect.militaryFactories) rewards.push({ type: 'add_building_construction', building: 'arms_factory', level: Number(effect.militaryFactories) });
    if (effect.dockyards) rewards.push({ type: 'add_building_construction', building: 'dockyard', level: Number(effect.dockyards) });
    if (!rewards.length) rewards.push({ type: 'add_political_power', value: tag === 'GER' ? 50 : 25 });
    return rewards;
  }

  static onTick() {
    const s = CoreEngine.gameState;
    if (!s.ai && s.country !== CoreEngine.gameState.country) return;
    if (!s.nationalFocus) s.nationalFocus = { active: null, progress: 0, completed: [] };
    const state = s.nationalFocus;
    const tree = this.tree(s.country);
    if (!state.active) {
      const next = tree.find(f => !state.completed.includes(f.id) && (!f.requires || f.requires.every(id => state.completed.includes(id))) && this.dateReady(f));
      if (next) state.active = next.id;
    }
    const focus = tree.find(f => f.id === state.active);
    if (!focus) return;
    state.progress += 1 / 24;
    if (state.progress < focus.days) return;
    state.completed.push(focus.id); state.active = null; state.progress = 0;
    this.applyCompletionRewards(focus.completion_rewards || focus.completionRewards || []);
    CoreEngine.log('国家方針完了: ' + focus.name);
  }
  static dateReady(f) { if (!f.date) return true; const d = CoreEngine.gameState.date; return d >= new Date(f.date[0], f.date[1] - 1, f.date[2]); }

  // 共通の報酬適用処理。FocusTreeManager からも呼ばれる。
  // 二重適用を防ぐため、旧来の effect 文字列解析は行わず、completion_rewards のみ適用する。
  static applyCompletionRewards(rewards) {
    const s = CoreEngine.gameState;
    const normalizedRewards = Array.isArray(rewards)
      ? rewards
      : rewards && typeof rewards === 'object'
        ? (rewards.type ? [rewards] : Object.entries(rewards).map(([type, value]) => ({ type, value })))
        : [];
    normalizedRewards.forEach(reward => {
      if (!reward || !reward.type) return;
      const applyEffect = window.HOI4EffectsConfig?.applyEffect || window.applyEffect;
      if (typeof applyEffect === 'function') applyEffect(s, reward);
    });
    if (s.politicalPower < 0) s.politicalPower = 0;
    if (typeof CoreEngine.renderStats === 'function') CoreEngine.renderStats();
  }
}
window.NationalFocusManager = NationalFocusManager;
