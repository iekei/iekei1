'use strict';

// HoI4 completion reward definitions: presentation and state mutation live here.
(function (global) {
  const ignoreTypes = new Set([
    'if', 'limit', 'else', 'elseif', 'random', 'random_list', 'every_other_country',
    'set_global_flag', 'clr_global_flag', 'set_country_flag', 'clr_country_flag', 'set_state_flag',
    'custom_effect_tooltip', 'hidden_effect', 'mark_focus_tree_layout_dirty', 'effect_tooltip',
    'sound_effect', 'log', 'set_rule', 'save_event_target_as'
  ]);

  const definitions = {
    add_political_power: { label: '政治力', unit: '', signed: true },
    add_stability: { label: '安定度', unit: '%', signed: true },
    add_war_support: { label: '戦争協力度', unit: '%', signed: true },
    add_army_experience: { label: '陸軍経験値', unit: '', signed: true },
    add_navy_experience: { label: '海軍経験値', unit: '', signed: true },
    add_air_experience: { label: '空軍経験値', unit: '', signed: true },
    add_ideas: { label: '国家精神を追加', unit: '', valueKey: 'idea' },
    remove_ideas: { label: '国家精神を削除', unit: '', valueKey: 'idea' },
    add_research_slot: { label: '研究スロット', unit: '', signed: true },
    add_tech_bonus: { label: '研究ボーナス', unit: '%', valueKey: 'category' },
    annex_country: { label: '国家を併合', unit: '', valueKey: 'country' },
    annex_target: { label: '対象国を占領', unit: '', valueKey: 'country' }
  };

  const fallbackTranslations = {
    add_political_power: '政治力', add_stability: '安定度', add_war_support: '戦争協力度',
    add_army_experience: '陸軍経験値', add_navy_experience: '海軍経験値', add_air_experience: '空軍経験値',
    add_ideas: '国家精神を追加', remove_ideas: '国家精神を削除', add_research_slot: '研究スロット',
    add_tech_bonus: '研究ボーナス', annex_country: '国家を併合', annex_target: '対象国を占領',
    arms_factory: '軍需工場', civ_factory: '民需工場', dockyard: '海軍造船所', add_opinion_modifier: '関係改善補正',
    set_country_flag: '国家フラグを設定', clr_country_flag: '国家フラグを解除', set_global_flag: '世界フラグを設定',
    GER_flag: 'ドイツ国家フラグ', JAP: '日本', AUS: 'オーストリア', CZE: 'チェコスロバキア'
  };

  function translateText(text) {
    if (!text || typeof text !== 'string') return text || '';
    return text.replace(/\\b[A-Za-z][A-Za-z0-9_]*\\b/g, token => fallbackTranslations[token] || token.split('_').join(' '));
  }

  function numericValue(reward) {
    const value = reward && (reward.value ?? reward.amount ?? reward.bonus);
    return typeof value === 'number' ? value : Number(value);
  }

  function formatEffect(reward) {
    if (!reward || !reward.type || ignoreTypes.has(reward.type) || /^[A-Z]{3}$/.test(reward.type)) return null;
    const definition = definitions[reward.type] || { label: reward.type.split('_').join(' '), unit: '', signed: true };
    if (definition.valueKey === 'category') {
      const bonus = Number(reward.bonus);
      return { text: `・${definition.label}: ${reward.category || '全般'}${Number.isFinite(bonus) ? ` ${bonus * 100}%` : ''}`, color: bonus < 0 ? '#ef4444' : '#22c55e' };
    }
    if (definition.valueKey === 'idea') return { text: `・${definition.label}: ${reward.idea || reward.value || ''}`.replace(/: $/, ''), color: reward.type === 'remove_ideas' ? '#ef4444' : '#22c55e' };
    if (definition.valueKey === 'country') {
      const targets = reward.country || reward.targetCountry || reward.countries || reward.targets;
      const targetText = (Array.isArray(targets) ? targets : [targets]).filter(Boolean).join(', ');
      return { text: `・${definition.label}: ${targetText || '指定国'}`, color: '#22c55e' };
    }
    const value = numericValue(reward);
    if (!Number.isFinite(value)) return { text: `・${definition.label}`, color: '#22c55e' };
    const display = Math.abs(value) < 1 && value !== 0 ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}` : `${value >= 0 && definition.signed ? '+' : ''}${value}`;
    return { text: `・${definition.label}: ${display}${definition.unit}`, color: value < 0 ? '#ef4444' : '#22c55e' };
  }

  function annexCountries(gameState, reward) {
    const targets = reward.country || reward.targetCountry || reward.countries || reward.targets;
    const targetTags = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
    if (!targetTags.length) return;

    // MapRenderer is optional so this effect also works in the v0 preview/dummy state.
    const states = global.MapRenderer && global.MapRenderer.states;
    if (states && typeof global.MapRenderer.captureState === 'function') {
      Object.entries(states).forEach(([stateId, state]) => {
        if (state && targetTags.includes(state.owner)) global.MapRenderer.captureState(stateId, gameState.country);
      });
    }

    gameState.occupiedCountries = Array.isArray(gameState.occupiedCountries) ? gameState.occupiedCountries : [];
    targetTags.forEach(tag => {
      if (!gameState.occupiedCountries.includes(tag)) gameState.occupiedCountries.push(tag);
    });
    gameState.annexedCountries = Array.isArray(gameState.annexedCountries) ? gameState.annexedCountries : [];
    targetTags.forEach(tag => {
      if (!gameState.annexedCountries.includes(tag)) gameState.annexedCountries.push(tag);
    });
  }

  function applyEffect(gameState, reward) {
    if (!gameState || !reward || !reward.type) return gameState;
    const value = numericValue(reward);
    switch (reward.type) {
      case 'add_political_power': gameState.politicalPower = (gameState.politicalPower || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_stability': gameState.stability = (gameState.stability || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_war_support': gameState.warSupport = (gameState.warSupport || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_army_experience': gameState.armyExperience = (gameState.armyExperience || 0) + (Number.isFinite(value) ? value : 0); if (gameState.xp) gameState.xp.army = (gameState.xp.army || 0) + value; break;
      case 'add_navy_experience': gameState.navyExperience = (gameState.navyExperience || 0) + (Number.isFinite(value) ? value : 0); if (gameState.xp) gameState.xp.navy = (gameState.xp.navy || 0) + value; break;
      case 'add_air_experience': gameState.airExperience = (gameState.airExperience || 0) + (Number.isFinite(value) ? value : 0); if (gameState.xp) gameState.xp.air = (gameState.xp.air || 0) + value; break;
      case 'add_ideas': gameState.ideas = Array.isArray(gameState.ideas) ? gameState.ideas : []; if (reward.idea && !gameState.ideas.includes(reward.idea)) gameState.ideas.push(reward.idea); break;
      case 'remove_ideas': if (Array.isArray(gameState.ideas)) gameState.ideas = gameState.ideas.filter(idea => idea !== reward.idea); break;
      case 'annex_country':
      case 'annex_target': annexCountries(gameState, reward); break;
      case 'add_research_slot': gameState.researchSlots = (gameState.researchSlots || 0) + (Number.isFinite(value) ? value : 0); break;
      default: break;
    }
    return gameState;
  }

  global.HOI4EffectsConfig = { definitions, ignoreTypes, formatEffect, applyEffect, translateText, fallbackTranslations };
  // Consumers can keep working if the config script is loaded after a preview component.
  global.formatEffect = global.formatEffect || formatEffect;
  global.applyEffect = global.applyEffect || applyEffect;
})(window);
