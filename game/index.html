'use strict';

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
    
    // 対象ファイルをフィルタリング（germany.txt など）
    const files = (tree.tree || []).filter(item => 
      item.type === 'blob' && 
      /common\/national_focus\/.+\.(txt|json)$/i.test(item.path) && 
      names.some(name => item.path.toLowerCase().includes(name))
    );
    
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
    // 1. コメント(# 以降)をすべて除去
    const source = text.replace(/#[^\r\n]*/g, '');
    
    // 2. focus = { ... } または shared_focus = { ... } を探索
    const focusPattern = /(?:focus|shared_focus)\s*=\s*\{/g;
    let match;

    while ((match = focusPattern.exec(source))) {
      const open = source.indexOf('{', match.index);
      const end = this.blockEnd(source, open);
      if (end < 0) break;

      const body = source.slice(open + 1, end);

      // 3. ブロック内から id を抽出 (例: id = GER_rhineland)
      const idMatch = /(?:^|\s)id\s*=\s*([A-Za-z0-9_:.-]+)/.exec(body);
      if (!idMatch) continue;
      const focusId = idMatch[1];

      // 4. ブロック内から completion_reward を抽出
      const rewardMatch = /(?:^|\s)completion_reward\s*=\s*\{/.exec(body);
      if (rewardMatch) {
        const rewardOpen = body.indexOf('{', rewardMatch.index);
        const rewardEnd = this.blockEnd(body, rewardOpen);
        if (rewardEnd >= 0) {
          const rewardBlock = body.slice(rewardOpen + 1, rewardEnd);
          output.set(focusId, this.parseBlock(rewardBlock));
        }
      }
    }
  },

  // カッコ { } の深さを計算して、ブロックの終端を見つける関数
  blockEnd(text, open) {
    if (open < 0 || text[open] !== '{') return -1;
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}' && --depth === 0) return index;
    }
    return -1;
  },

  // completion_reward の中身を解析する関数（改行・空白の乱れに強い設計）
  parseBlock(block) {
    const rewards = [];
    // タブや複数改行を単一のスペースに正規化（Paradox構文の乱れを吸収）
    const normalized = block.replace(/\s+/g, ' ').trim();
    
    // key = value または key = { ... } をマッチさせる正規表現
    const regex = /([a-zA-Z0-9_]+)\s*=\s*({[^}]+}|[^{} ]+)/g;
    let match;

    while ((match = regex.exec(normalized))) {
      const type = match[1];
      const raw = match[2].trim();

      if (raw.startsWith('{')) {
        // { name = XYZ bonus = 1.0 } のような入れ子ブロックの処理
        const reward = { type };
        const innerRegex = /([a-zA-Z0-9_]+)\s*=\s*([^{} ]+)/g;
        let innerMatch;
        while ((innerMatch = innerRegex.exec(raw))) {
          reward[innerMatch[1]] = this.scalar(innerMatch[2]);
        }
        rewards.push(reward);
      } else {
        // 通常の key = value の処理
        rewards.push({ 
          type, 
          [type === 'add_ideas' ? 'idea' : 'value']: this.scalar(raw.replace(/[{}]/g, '').trim()) 
        });
      }
    }
    return rewards;
  },

  // 数値化できるものは数値(Number)に、それ以外は文字列(String)にする関数
  scalar(value) {
    const clean = String(value).replace(/["']/g, '');
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : clean;
  }
};

window.formatCompletionReward = function rewardText(reward) {
  const labels = { 
    add_political_power: '政治力', add_war_support: '戦争協力度', 
    add_stability: '安定度', add_research_slot: '研究スロット', 
    add_army_experience: '陸軍経験値', add_navy_experience: '海軍経験値', 
    add_air_experience: '空軍経験値', add_ideas: '国家精神', 
    add_tech_bonus: '研究ボーナス' 
  };
  const label = labels[reward.type] || reward.type;
  if (reward.type === 'add_tech_bonus') {
    return `・${label}: ${reward.category || '全般'} ${(Number(reward.bonus || 0) * 100).toFixed(0)}%${reward.uses ? `（${reward.uses}回分）` : ''}`;
  }
  const value = reward.value ?? reward.idea ?? '';
  const display = typeof value === 'number' && Math.abs(value) < 1 ? `${(value * 100).toFixed(2)}%` : value;
  return `・${label}: ${typeof display === 'number' && display >= 0 ? '+' : ''}${display}`;
};

window.NFRewardLoaderReady = true;
