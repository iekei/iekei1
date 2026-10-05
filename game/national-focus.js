'use strict';

class NationalFocusManager {
  static TREES = {
    GER: [
      { id: 'ger_rhineland', name: 'ラインラント進駐', days: 70, date: [1936, 3, 1], effect: { politicalPower: 50, worldTension: 2 } },
      { id: 'ger_four_year', name: '四カ年計画', days: 70, requires: ['ger_rhineland'], effect: { civilianFactories: 2 } },
      { id: 'ger_anti_comintern', name: '反コミンテルン協定', days: 70, requires: ['ger_four_year'], effect: { worldTension: 2 } },
      { id: 'ger_anschluss', name: 'アンシュルス', days: 70, requires: ['ger_anti_comintern'], date: [1938, 1, 1], effect: { politicalPower: 120, worldTension: 5 } },
      { id: 'ger_munich', name: 'ミュンヘン会談', days: 70, requires: ['ger_anschluss'], date: [1938, 9, 1], effect: { worldTension: 5 } },
      { id: 'ger_danzig', name: 'ダンツィヒか戦争か', days: 70, requires: ['ger_munich'], date: [1939, 1, 1], effect: { worldTension: 8 } },
      { id: 'ger_barbarossa', name: 'バルバロッサ', days: 90, requires: ['ger_danzig'], date: [1941, 1, 1], effect: { armyXp: 25 } }
    ],
    JAP: [
      { id: 'jap_man_chu', name: '満洲国の強化', days: 70, effect: { militaryFactories: 2 } },
      { id: 'jap_lukou', name: '盧溝橋事件への対応', days: 70, requires: ['jap_man_chu'], date: [1937, 7, 1], effect: { worldTension: 5 } },
      { id: 'jap_navy', name: '連合艦隊の拡張', days: 70, requires: ['jap_lukou'], effect: { navyXp: 25 } },
      { id: 'jap_south', name: '南進論', days: 70, requires: ['jap_navy'], date: [1940, 1, 1], effect: { worldTension: 5 } },
      { id: 'jap_pearl', name: 'Z作戦（真珠湾）', days: 90, requires: ['jap_south'], date: [1941, 10, 1], effect: { navyXp: 40, worldTension: 10 } }
    ],
    SOV: [
      { id: 'sov_five_year', name: '五カ年計画', days: 70, effect: { civilianFactories: 3 } },
      { id: 'sov_purge', name: '大粛清', days: 70, requires: ['sov_five_year'], effect: { politicalPower: 80 } },
      { id: 'sov_army', name: '赤軍の再編', days: 70, requires: ['sov_purge'], effect: { armyXp: 30 } },
      { id: 'sov_reform', name: '軍の改革', days: 80, requires: ['sov_army'], date: [1939, 1, 1], effect: { armyXp: 30 } }
    ],
    USA: [{ id: 'usa_rearm', name: '軍備再建', days: 70, effect: { militaryFactories: 3 } }, { id: 'usa_arsenal', name: '民主主義の兵器廠', days: 70, requires: ['usa_rearm'], effect: { civilianFactories: 3 } }],
    ENG: [{ id: 'eng_rearm', name: '再軍備', days: 70, effect: { militaryFactories: 2 } }, { id: 'eng_empire', name: '帝国の結束', days: 70, requires: ['eng_rearm'], effect: { politicalPower: 60 } }],
    FRA: [{ id: 'fra_industry', name: '工業への投資', days: 70, effect: { civilianFactories: 2 } }, { id: 'fra_defense', name: 'マジノ線の拡張', days: 70, requires: ['fra_industry'], effect: { armyXp: 15 } }],
    ITA: [{ id: 'ita_industry', name: '工業化計画', days: 70, effect: { civilianFactories: 2 } }, { id: 'ita_empire', name: '帝国の野望', days: 70, requires: ['ita_industry'], effect: { worldTension: 5 } }]
  };

  static init() {
    const s = CoreEngine.gameState;
    s.nationalFocus = s.nationalFocus || { active: null, progress: 0, completed: [] };
    CoreEngine.registerTickCallback(() => NationalFocusManager.onTick());
  }

  static tree(tag) { return this.TREES[tag] || [{ id: 'generic_industry', name: '工業化促進', days: 70, effect: { civilianFactories: 1 } }, { id: 'generic_army', name: '軍備拡張', days: 70, requires: ['generic_industry'], effect: { militaryFactories: 1 } }]; }
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
    this.applyEffect(focus.effect || {});
    CoreEngine.log('国家方針完了: ' + focus.name);
  }
  static dateReady(f) { if (!f.date) return true; const d = CoreEngine.gameState.date; return d >= new Date(f.date[0], f.date[1] - 1, f.date[2]); }
  static applyEffect(effect) {
    const s = CoreEngine.gameState;
    Object.entries(effect).forEach(([key, value]) => {
      if (key === 'worldTension') s.worldTension = Math.min(100, s.worldTension + value);
      else if (key === 'armyXp') s.xp.army = Math.min(9999, (s.xp.army || 0) + value);
      else if (key === 'navyXp') s.xp.navy = Math.min(9999, (s.xp.navy || 0) + value);
      else if (typeof s[key] === 'number') s[key] += value;
    });
  }
}
window.NationalFocusManager = NationalFocusManager;
