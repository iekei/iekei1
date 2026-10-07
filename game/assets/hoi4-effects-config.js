'use strict';

// HoI4 completion reward definitions: presentation and state mutation live here.
// This is the single source of truth for both UI display (formatEffect) and
// runtime state application (applyEffect).  Other modules (nf-reward-loader,
// national-focus, ger/script, FocusTreeManager) defer to this config so that
// display text and game-state changes never diverge.
(function (global) {
  // ---- Internal control keys excluded from player-facing display ----
  // if / limit / hidden_effect etc. are Paradox script flow control, not rewards.
  const ignoreTypes = new Set([
    'if', 'limit', 'else', 'elseif', 'random', 'random_list', 'random_chance',
    'every_other_country', 'every_owned_state', 'random_owned_controlled_state',
    'set_global_flag', 'clr_global_flag', 'set_country_flag', 'clr_country_flag',
    'set_state_flag', 'custom_effect_tooltip', 'hidden_effect',
    'mark_focus_tree_layout_dirty', 'effect_tooltip', 'sound_effect', 'log',
    'set_rule', 'save_event_target_as', 'trigger',
    'show_idea_tooltip', 'show_equipment_tooltip', 'show_idea_tooltip', 'show',
    'country_event', 'news_event', 'set_variable', 'clamp_variable', 'change_variable'
  ]);

  // ---- Display + execution definitions for known effect types ----
  // valueKey selects a specialised formatter; signed enables +/- colouring.
  const definitions = {
    add_political_power: { label: '政治力', unit: '', signed: true },
    add_stability: { label: '安定度', unit: '%', signed: true },
    add_war_support: { label: '戦争協力度', unit: '%', signed: true },
    add_command_power: { label: '指揮力', unit: '', signed: true },
    add_army_experience: { label: '陸軍経験値', unit: '', signed: true },
    add_navy_experience: { label: '海軍経験値', unit: '', signed: true },
    add_air_experience: { label: '空軍経験値', unit: '', signed: true },
    add_manpower: { label: '人的資源', unit: '', signed: true },
    add_ideas: { label: '国家精神を追加', unit: '', valueKey: 'idea' },
    remove_ideas: { label: '国家精神を削除', unit: '', valueKey: 'idea' },
    add_research_slot: { label: '研究スロット', unit: '', signed: true },
    add_tech_bonus: { label: '研究ボーナス', unit: '', valueKey: 'category' },
    add_building_construction: { label: '建設', unit: '', valueKey: 'building' },
    building: { label: '建設', unit: '', valueKey: 'building' },
    add_offsite_building: { label: '施設を追加', unit: '', valueKey: 'building' },
    annex_country: { label: '国家を併合', unit: '', valueKey: 'country' },
    annex_target: { label: '対象国を占領', unit: '', valueKey: 'country' },
    occupy_country: { label: '国家を占領', unit: '', valueKey: 'country' },
    add_world_tension: { label: '世界の緊張度', unit: '%', signed: true },
    add_named_threat: { label: '国際緊張度', unit: '%', signed: true },
    add_threat: { label: '国際緊張度', unit: '%', signed: true }
  };

  // ---- Fallback translation table ----
  // Used for building names, country tags, and unknown effect-key words.
  const fallbackTranslations = {
    add_political_power: '政治力', add_stability: '安定度', add_war_support: '戦争協力度',
    add_command_power: '指揮力', add_army_experience: '陸軍経験値', add_navy_experience: '海軍経験値',
    add_air_experience: '空軍経験値', add_manpower: '人的資源',
    add_ideas: '国家精神を追加', remove_ideas: '国家精神を削除', add_research_slot: '研究スロット',
    add_tech_bonus: '研究ボーナス', annex_country: '国家を併合', annex_target: '対象国を占領',
    occupy_country: '国家を占領',
    arms_factory: '軍需工場', industrial_complex: '民需工場', civ_factory: '民需工場',
    dockyard: '海軍造船所', synthetic_refinery: '人造石油施設', infrastructure: 'インフラ',
    air_base: '空軍基地', naval_base: '海軍基地',
    bunker: '陸軍要塞', coastal_bunker: '沿岸要塞', anti_air_building: '対空砲',
    radar_station: 'レーダー基地', fuel_silo: '燃料サイロ', nuclear_reactor: '原子炉',
    rocket_site: 'ロケット発射場',
    add_opinion_modifier: '関係改善補正',
    set_country_flag: '国家フラグを設定', clr_country_flag: '国家フラグを解除',
    set_global_flag: '世界フラグを設定',
    building: '建設', level: 'レベル', state: '州', states: '州', owner: '所有者',
    GER_west_wall_forts: 'ドイツ西部国境要塞', GER_west_wall_tt: '西の壁',
    AUS: 'オーストリア', CZE: 'チェコスロバキア', POL: 'ポーランド', FRA: 'フランス',
    GER: 'ドイツ', JAP: '日本', SOV: 'ソ連', USA: 'アメリカ', ENG: 'イギリス', ITA: 'イタリア',
    HUN: 'ハンガリー', ROM: 'ルーマニア', YUG: 'ユーゴスラビア', BEL: 'ベルギー', HOL: 'オランダ'
  };

  // Word-level dictionary used by translateText for unknown tokens.
  const wordDictionary = {
    political: '政治', power: '力', stability: '安定度', war: '戦争', support: '協力度',
    army: '陸軍', navy: '海軍', air: '空軍', experience: '経験値', manpower: '人的資源',
    research: '研究', slot: 'スロット', bonus: 'ボーナス', tech: '技術',
    add: '追加', remove: '削除', building: '建設', construction: '建設',
    country: '国家', annex: '併合', occupy: '占領', target: '対象',
    world: '世界', tension: '緊張度', threat: '緊張度',
    stability: '安定度', command: '指揮', power: '力',
    ideas: '国家精神', offsite: '離脱', fort: '要塞', bunker: '陸軍要塞',
    coastal: '沿岸', industrial: '民需', complex: '工場', arms: '軍需', factory: '工場',
    dockyard: '造船所', infrastructure: 'インフラ', air: '空軍', base: '基地',
    naval: '海軍', anti: '対', air: '空', radar: 'レーダー', station: '基地',
    fuel: '燃料', silo: 'サイロ', nuclear: '原子', reactor: '炉', rocket: 'ロケット', site: '発射場',
    level: 'レベル', state: '州', states: '州', owner: '所有者'
  };

  function translateText(text) {
    if (!text || typeof text !== 'string') return text || '';
    // Replace known multi-word tokens first, then split remaining snake_case
    // identifiers into readable Japanese via the word dictionary.
    return text.replace(/\b[A-Za-z][A-Za-z0-9_]*\b/g, token => {
      if (fallbackTranslations[token]) return fallbackTranslations[token];
      return token.split('_').map(word => wordDictionary[word.toLowerCase()] || word).join('');
    });
  }

  function numericValue(reward) {
    const value = reward && (reward.value ?? reward.amount ?? reward.bonus);
    return typeof value === 'number' ? value : Number(value);
  }

  // Resolve a building name to a Japanese label, with bunker → 陸軍要塞.
  function buildingLabel(building) {
    if (!building) return '建設';
    return fallbackTranslations[building] || buildingLabelFallback(building);
  }
  function buildingLabelFallback(building) {
    return building.split('_').map(w => wordDictionary[w.toLowerCase()] || w).join('');
  }

  // ---- Core: format a single reward into { text, color } for tooltips ----
  function formatEffect(reward) {
    if (!reward || !reward.type) return null;
    if (ignoreTypes.has(reward.type)) return null;
    // Three-letter country tags (AUS, CZE…) are scope identifiers, not effects.
    if (/^[A-Z]{3}$/.test(reward.type)) return null;
    // Pure-number types are parser artefacts (stray tokens), not real effects.
    if (/^[0-9]+$/.test(reward.type)) return null;

    const definition = definitions[reward.type];

    // Research bonus: ・研究ボーナス: 陸軍 100% (2回分)
    if (definition && definition.valueKey === 'category') {
      const bonus = Number(reward.bonus);
      const pct = Number.isFinite(bonus) ? ` ${Math.round(bonus * 100)}%` : '';
      const uses = reward.uses ? `（${reward.uses}回分）` : '';
      return { text: `・${definition.label}: ${reward.category || '全般'}${pct}${uses}`, color: bonus < 0 ? '#ef4444' : '#22c55e' };
    }

    // National spirit add/remove: ・国家精神を追加: 精神名
    if (definition && definition.valueKey === 'idea') {
      const idea = reward.idea || reward.value || '';
      const text = idea ? `・${definition.label}: ${idea}` : `・${definition.label}`;
      return { text, color: reward.type === 'remove_ideas' ? '#ef4444' : '#22c55e' };
    }

    // Building / construction: ・陸軍要塞 +3 (州: 14)
    if (definition && definition.valueKey === 'building') {
      const building = reward.building || reward.type;
      const level = Number(reward.level ?? reward.value ?? reward.amount ?? 1);
      const label = buildingLabel(building);
      const statePart = reward.state || reward.stateId ? ` (州: ${reward.state || reward.stateId})` : '';
      const regionPart = !statePart && reward.region ? ` (${reward.region})` : '';
      const lvlText = Number.isFinite(level) && level !== 0 ? ` ${level >= 0 ? '+' : ''}${level}` : '';
      return { text: `・${label}${lvlText}を建設${statePart}${regionPart}`, color: level < 0 ? '#ef4444' : '#22c55e' };
    }

    // Country annex/occupy: ・国家を併合: オーストリア
    if (definition && definition.valueKey === 'country') {
      const targets = reward.country || reward.targetCountry || reward.countries || reward.targets;
      const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
      const names = list.map(t => fallbackTranslations[t] || t).join(', ');
      return { text: `・${definition.label}: ${names || '指定国'}`, color: '#22c55e' };
    }

    // Numeric signed effects: ・政治力: +120
    if (definition && definition.signed) {
      const value = numericValue(reward);
      if (!Number.isFinite(value)) return { text: `・${definition.label}`, color: '#22c55e' };
      const isPercent = definition.unit === '%';
      const display = (isPercent && Math.abs(value) < 1 && value !== 0)
        ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}`
        : `${value >= 0 ? '+' : ''}${value}`;
      return { text: `・${definition.label}: ${display}${definition.unit || ''}`, color: value < 0 ? '#ef4444' : '#22c55e' };
    }

    // ---- Fallback for unknown effect keys ----
    // Split the key into words and translate each, producing readable Japanese.
    const label = definition ? definition.label : fallbackLabel(reward.type);
    const value = numericValue(reward);
    if (Number.isFinite(value) && value !== 0) {
      const isPercent = Math.abs(value) < 1 && value !== 0;
      const display = isPercent ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%` : `${value >= 0 ? '+' : ''}${value}`;
      return { text: `・${label}: ${display}`, color: value < 0 ? '#ef4444' : '#22c55e' };
    }
    const ideaVal = reward.idea || reward.building || reward.country || '';
    return { text: ideaVal ? `・${label}: ${fallbackTranslations[ideaVal] || ideaVal}` : `・${label}`, color: '#22c55e' };
  }

  function fallbackLabel(type) {
    if (!type) return '効果';
    if (fallbackTranslations[type]) return fallbackTranslations[type];
    return type.split('_').map(w => wordDictionary[w.toLowerCase()] || w).join('');
  }

  // ---- Runtime: apply a reward to game state ----
  function applyEffect(gameState, reward) {
    if (!gameState || !reward || !reward.type) return gameState;
    if (ignoreTypes.has(reward.type)) return gameState;
    const value = numericValue(reward);
    switch (reward.type) {
      case 'add_political_power':
        gameState.politicalPower = Math.max(0, Math.min(999,
          (Number(gameState.politicalPower) || 0) + (Number.isFinite(value) ? value : 0))); break;
      case 'add_stability':
        gameState.stability = Math.max(0, Math.min(100, (gameState.stability || 0) + (Number.isFinite(value) ? value : 0))); break;
      case 'add_war_support':
        gameState.warSupport = Math.max(0, Math.min(100, (gameState.warSupport || 0) + (Number.isFinite(value) ? value : 0))); break;
      case 'add_command_power':
        gameState.commandPower = (gameState.commandPower || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_army_experience':
        gameState.armyExperience = (gameState.armyExperience || 0) + (Number.isFinite(value) ? value : 0);
        if (gameState.xp) gameState.xp.army = (gameState.xp.army || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_navy_experience':
        gameState.navyExperience = (gameState.navyExperience || 0) + (Number.isFinite(value) ? value : 0);
        if (gameState.xp) gameState.xp.navy = (gameState.xp.navy || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_air_experience':
        gameState.airExperience = (gameState.airExperience || 0) + (Number.isFinite(value) ? value : 0);
        if (gameState.xp) gameState.xp.air = (gameState.xp.air || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_manpower':
        gameState.manpower = (gameState.manpower || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_ideas':
        gameState.ideas = Array.isArray(gameState.ideas) ? gameState.ideas : [];
        if (reward.idea && !gameState.ideas.includes(reward.idea)) gameState.ideas.push(reward.idea); break;
      case 'remove_ideas':
        if (Array.isArray(gameState.ideas)) gameState.ideas = gameState.ideas.filter(idea => idea !== reward.idea); break;
      case 'building':
      case 'add_building_construction':
      case 'add_offsite_building': {
        const building = reward.building || reward.type;
        const level = Number(reward.level ?? reward.value ?? reward.amount ?? 1);
        gameState.buildings = gameState.buildings || {};
        gameState.buildings[building] = (gameState.buildings[building] || 0) + (Number.isFinite(level) ? level : 0);
        if (building === 'bunker') gameState.landFortLevel = (gameState.landFortLevel || 0) + (Number.isFinite(level) ? level : 0);
        if (building === 'coastal_bunker') gameState.coastalFortLevel = (gameState.coastalFortLevel || 0) + (Number.isFinite(level) ? level : 0);
        break;
      }
      case 'annex_country':
      case 'annex_target':
      case 'occupy_country':
        annexOrOccupy(gameState, reward, reward.type === 'occupy_country'); break;
      case 'add_research_slot':
        gameState.researchSlots = (gameState.researchSlots || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_world_tension':
      case 'add_named_threat':
      case 'add_threat':
        gameState.worldTension = Math.max(0, Math.min(100, (gameState.worldTension || 0) + (Number.isFinite(value) ? value : 0))); break;
      case 'add_tech_bonus':
        gameState.techBonuses = Array.isArray(gameState.techBonuses) ? gameState.techBonuses : [];
        gameState.techBonuses.push({ category: reward.category, bonus: reward.bonus, uses: reward.uses }); break;
      default: break;
    }
    return gameState;
  }

  // Annex transfers all states to the player; occupy marks control without ownership.
  function annexOrOccupy(gameState, reward, occupyOnly) {
    const targets = reward.country || reward.targetCountry || reward.countries || reward.targets;
    const targetTags = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
    if (!targetTags.length) return;

    const states = global.MapRenderer && global.MapRenderer.states;
    if (states && typeof global.MapRenderer.captureState === 'function') {
      Object.entries(states).forEach(([stateId, state]) => {
        if (state && targetTags.includes(state.owner)) global.MapRenderer.captureState(stateId, gameState.country);
      });
    }

    gameState.occupiedCountries = Array.isArray(gameState.occupiedCountries) ? gameState.occupiedCountries : [];
    targetTags.forEach(tag => { if (!gameState.occupiedCountries.includes(tag)) gameState.occupiedCountries.push(tag); });
    if (!occupyOnly) {
      gameState.annexedCountries = Array.isArray(gameState.annexedCountries) ? gameState.annexedCountries : [];
      targetTags.forEach(tag => { if (!gameState.annexedCountries.includes(tag)) gameState.annexedCountries.push(tag); });
    }
  }

  // ---- Fallback reward generator ----
  // When external Paradox data is unavailable, derive completion_rewards from
  // the focus id / title / effect text by keyword detection.  This keeps the
  // tooltip and runtime application working with only the in-game data.
  // Country-specific keyword maps for annex/occupy detection.
  const annexKeywords = [
    { re: /anschluss|アンシュルス/, countries: ['AUS'] },
    { re: /sudeten|ズデーテン|ミュンヘン|munich/, countries: ['CZE'] },
    { re: /danzig|ダンツィヒ|ポーランド|poland/, countries: ['POL'] },
    { re: /memel|メーメル/, countries: ['LIT'] },
    { re: /czech|チェコ/, countries: ['CZE'] }
  ];

  function buildRewardsFromFocus(focus, tag) {
    if (!focus) return [];
    // If the focus already carries parsed rewards, keep them.
    const existing = focus.completion_rewards || focus.completionRewards;
    if (Array.isArray(existing) && existing.length) return existing;

    const rewards = [];
    const text = `${focus.id || ''} ${focus.title || focus.name || ''} ${focus.effect || ''}`.toLowerCase();
    const add = (type, value) => { if (value !== undefined && value !== null && Number(value) !== 0) rewards.push({ type, value: Number(value) }); };

    // Numeric effects from structured effect objects (NationalFocusManager.TREES style)
    const eff = focus.effect && typeof focus.effect === 'object' ? focus.effect : {};
    add('add_political_power', eff.politicalPower);
    add('add_stability', eff.stability);
    add('add_war_support', eff.warSupport);
    add('add_army_experience', eff.armyXp);
    add('add_navy_experience', eff.navyXp);
    add('add_air_experience', eff.airXp);
    add('add_research_slot', eff.researchSlots);
    add('add_world_tension', eff.worldTension);
    if (eff.civilianFactories) rewards.push({ type: 'add_building_construction', building: 'industrial_complex', level: Number(eff.civilianFactories) });
    if (eff.militaryFactories) rewards.push({ type: 'add_building_construction', building: 'arms_factory', level: Number(eff.militaryFactories) });
    if (eff.dockyards) rewards.push({ type: 'add_building_construction', building: 'dockyard', level: Number(eff.dockyards) });

    // Fortress / construction detection: bunker → 陸軍要塞, coastal → 沿岸要塞
    const fortLevel = Number(focus.bunkerLevel || focus.forts || focus.level);
    if (/coastal|大西洋の壁|atlantik|沿岸/.test(text)) {
      rewards.push({ type: 'add_building_construction', building: 'coastal_bunker', level: Number.isFinite(fortLevel) && fortLevel > 0 ? fortLevel : 2 });
    } else if (/bunker|west_wall|西の壁|要塞|マジノ|maginot|東の壁|ostwall|防備|fort/.test(text)) {
      rewards.push({ type: 'add_building_construction', building: 'bunker', level: Number.isFinite(fortLevel) && fortLevel > 0 ? fortLevel : 2 });
    }

    // Annex / occupy detection
    for (const entry of annexKeywords) {
      if (entry.re.test(text)) { rewards.push({ type: 'annex_country', country: entry.countries }); break; }
    }

    // Research / industry keywords
    if (/研究|research|技術/.test(text) && !rewards.some(r => r.type === 'add_research_slot')) {
      rewards.push({ type: 'add_tech_bonus', category: '全般', bonus: 1, uses: 1 });
    }

    // Default political power so the tooltip is never empty.
    if (!rewards.length) rewards.push({ type: 'add_political_power', value: tag === 'GER' ? 50 : 25 });
    return rewards;
  }

  global.HOI4EffectsConfig = {
    definitions, ignoreTypes, fallbackTranslations,
    formatEffect, applyEffect, translateText, buildRewardsFromFocus, buildingLabel
  };
  // Consumers can keep working if the config script is loaded after a preview component.
  global.formatEffect = global.formatEffect || formatEffect;
  global.applyEffect = global.applyEffect || applyEffect;
})(window);
