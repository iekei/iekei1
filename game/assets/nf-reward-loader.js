'use strict';

// Loads Paradox completion_reward blocks from the public hoi4-history repository.
// Local nf_batch JSON remains the first source; remote rewards only fill missing data.
window.NFRewardLoader = {
  API: 'https://api.github.com/repos/cbrzeczysz/hoi4-history/git/trees/main?recursive=1',
  RAW: 'https://raw.githubusercontent.com/cbrzeczysz/hoi4-history/main/',
  countryFiles: {
    GER: ['germany', 'german'], JAP: ['japan'], SOV: ['soviet', 'ussr'],
    USA: ['usa', 'united_states'], ENG: ['britain', 'united_kingdom'],
    FRA: ['france'], ITA: ['italy']
  },
  cache: new Map(),
  async enrich(country, focuses) {
    if (!Array.isArray(focuses) || !focuses.length) return focuses || [];
    try {
      const rewards = await this.load(country);
      return focuses.map(focus => {
        const id = focus.id || focus.focus_id;
        return focus.completion_rewards?.length || !rewards.has(id)
          ? focus
          : { ...focus, completion_rewards: rewards.get(id) };
      });
    } catch (error) {
      console.warn('[NFRewardLoader] 達成報酬の外部読み込みをスキップ:', error.message);
      return focuses;
    }
  },
  async load(country) {
    if (this.cache.has(country)) return this.cache.get(country);
    const response = await fetch(this.API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`GitHub tree HTTP ${response.status}`);
    const tree = await response.json();
    const names = this.countryFiles[country] || [];
    const files = (tree.tree || []).filter(item => item.type === 'blob' && /common\/national_focus\/.+\.(txt|json)$/i.test(item.path) && names.some(name => item.path.toLowerCase().includes(`/${name}`)));
    const merged = new Map();
    for (const file of files) {
      const textResponse = await fetch(this.RAW + file.path);
      if (!textResponse.ok) continue;
      this.parse(await textResponse.text(), merged);
    }
    this.cache.set(country, merged);
    return merged;
  },
  parse(text, output) {
    const focusPattern = /(\w+)\s*=\s*\{/g;
    let match;
    while ((match = focusPattern.exec(text))) {
      const end = this.blockEnd(text, focusPattern.lastIndex - 1);
      if (end < 0) break;
      const block = text.slice(focusPattern.lastIndex, end);
      const rewardStart = block.search(/completion_reward\s*=\s*\{/);
      if (rewardStart >= 0) {
        const absolute = focusPattern.lastIndex + rewardStart;
        const rewardEnd = this.blockEnd(text, text.indexOf('{', absolute));
        if (rewardEnd >= 0) output.set(match[1], this.parseBlock(text.slice(text.indexOf('{', absolute) + 1, rewardEnd)));
      }
      focusPattern.lastIndex = end + 1;
    }
  },
  blockEnd(text, open) {
    if (open < 0 || text[open] !== '{') return -1;
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}' && --depth === 0) return index;
    }
    return -1;
  },
  parseBlock(block) {
    const rewards = [];
    for (const line of block.split(/\r?\n/).map(value => value.replace(/#.*/, '').trim()).filter(Boolean)) {
      const match = line.match(/^(\w+)\s*=\s*(.+)$/);
      if (!match) continue;
      const [, type, raw] = match;
      if (raw.startsWith('{')) {
        const reward = { type };
        for (const pair of raw.matchAll(/(\w+)\s*=\s*([^\s}]+)/g)) reward[pair[1]] = this.scalar(pair[2]);
        rewards.push(reward);
      } else rewards.push({ type, [type === 'add_ideas' ? 'idea' : 'value']: this.scalar(raw.replace(/[{}]/g, '').trim()) });
    }
    return rewards;
  },
  scalar(value) {
    const clean = String(value).replace(/["']/g, '');
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : clean;
  }
};

window.formatCompletionReward = function rewardText(reward) {
  const labels = { add_political_power: '政治力', add_war_support: '戦争協力度', add_stability: '安定度', add_research_slot: '研究スロット', add_army_experience: '陸軍経験値', add_navy_experience: '海軍経験値', add_air_experience: '空軍経験値', add_ideas: '国家精神', add_tech_bonus: '研究ボーナス' };
  const label = labels[reward.type] || reward.type;
  if (reward.type === 'add_tech_bonus') return `・${label}: ${reward.category || '全般'} ${(Number(reward.bonus || 0) * 100).toFixed(0)}%${reward.uses ? `（${reward.uses}回分）` : ''}`;
  const value = reward.value ?? reward.idea ?? '';
  const display = typeof value === 'number' && Math.abs(value) < 1 ? `${(value * 100).toFixed(2)}%` : value;
  return `・${label}: ${typeof display === 'number' && display >= 0 ? '+' : ''}${display}`;
};

window.NFRewardLoaderReady = true;
