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
    add_tech_bonus: { label: '研究ボーナス', unit: '%', valueKey: 'category' }
  };

  function numericValue(reward) {
    const value = reward && (reward.value ?? reward.amount ?? reward.bonus);
    return typeof value === 'number' ? value : Number(value);
  }

  function formatEffect(reward) {
    if (!reward || !reward.type || ignoreTypes.has(reward.type) || /^[A-Z]{3}$/.test(reward.type)) return null;
    const definition = definitions[reward.type] || { label: reward.type.split('_').join(' '), unit: '', signed: true };
    if (definition.valueKey === 'category') {
      const bonus = Number(reward.bonus);
      return `・${definition.label}: ${reward.category || '全般'}${Number.isFinite(bonus) ? ` ${bonus * 100}%` : ''}`;
    }
    if (definition.valueKey === 'idea') return `・${definition.label}: ${reward.idea || reward.value || ''}`.replace(/: $/, '');
    const value = numericValue(reward);
    if (!Number.isFinite(value)) return `・${definition.label}`;
    const display = Math.abs(value) < 1 && value !== 0 ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}` : `${value >= 0 && definition.signed ? '+' : ''}${value}`;
    return `・${definition.label}: ${display}${definition.unit}`;
  }

  function applyEffect(gameState, reward) {
    if (!gameState || !reward || !reward.type) return gameState;
    const value = numericValue(reward);
    switch (reward.type) {
      case 'add_political_power': gameState.politicalPower = (gameState.politicalPower || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_stability': gameState.stability = (gameState.stability || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_war_support': gameState.warSupport = (gameState.warSupport || 0) + (Number.isFinite(value) ? value : 0); break;
      case 'add_army_experience': gameState.armyExperience = (gameState.armyExperience || 0) + (Number.isFinite(value) ? value : 0); if (gameState.xp) gameState.xp.army = (gameState.xp.army || 0) + value; break;
      case 'add_ideas': gameState.ideas = Array.isArray(gameState.ideas) ? gameState.ideas : []; if (reward.idea && !gameState.ideas.includes(reward.idea)) gameState.ideas.push(reward.idea); break;
      default: break;
    }
    return gameState;
  }

  global.HOI4EffectsConfig = { definitions, ignoreTypes, formatEffect, applyEffect };
  global.formatEffect = global.formatEffect || formatEffect;
})(window);
