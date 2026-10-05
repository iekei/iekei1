'use strict';

// -----------------------------------------------------------------------------
// 1. NFRewardLoader: GitHubからParadox形式の達成報酬データを取得・パースするローダー
// -----------------------------------------------------------------------------
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
    
    // 対象ファイルをフィルタリング
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
    // タブや複数改行を単一のスペースに正規化
    const normalized = block.replace(/\s+/g, ' ').trim();
    
    const regex = /([a-zA-Z0-9_]+)\s*=\s*({[^}]+}|[^{} ]+)/g;
    let match;

    while ((match = regex.exec(normalized))) {
      const type = match[1];
      const raw = match[2].trim();

      if (raw.startsWith('{')) {
        const reward = { type };
        const innerRegex = /([a-zA-Z0-9_]+)\s*=\s*([^{} ]+)/g;
        let innerMatch;
        while ((innerMatch = innerRegex.exec(raw))) {
          reward[innerMatch[1]] = this.scalar(innerMatch[2]);
        }
        rewards.push(reward);
      } else {
        rewards.push({ 
          type, 
          [type === 'add_ideas' ? 'idea' : 'value']: this.scalar(raw.replace(/[{}]/g, '').trim()) 
        });
      }
    }
    return rewards;
  },

  scalar(value) {
    const clean = String(value).replace(/["']/g, '');
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : clean;
  }
};

// -----------------------------------------------------------------------------
// 2. formatCompletionReward: パースした報酬を日本語のツールチップテキストに変換
// -----------------------------------------------------------------------------
window.formatCompletionReward = function rewardText(reward) {
  if (!reward || !reward.type) return '';

  // 内部システムフラグを除外
  const ignoreTypes = new Set([
    'if', 'limit', 'else', 'elseif', 'random', 'random_list', 'every_other_country',
    'set_global_flag', 'clr_global_flag', 'set_country_flag', 'clr_country_flag', 'set_state_flag',
    'custom_effect_tooltip', 'hidden_effect', 'mark_focus_tree_layout_dirty', 'effect_tooltip',
    'sound_effect', 'log', 'set_rule', 'save_event_target_as'
  ]);

  if (ignoreTypes.has(reward.type) || /^[A-Z]{3}$/.test(reward.type) \vert{}\vert{} /^[0-9]+$/.test(reward.type)) {
    return null;
  }

  // Paradox Effectの日本語翻訳辞書
  const labels = {
    add_political_power: '政治力',
    add_stability: '安定度',
    add_war_support: '戦争協力度',
    add_command_power: '指揮力',
    add_ideas: '国家精神を追加',
    remove_ideas: '国家精神を削除',
    swap_ideas: '国家精神の変更',
    add_popularity: '政党支持率',
    set_party_popularity: '政党支持率を変更',
    retire_country_leader: '国家指導者の引退',
    add_named_threat: '国際緊張度',
    add_threat: '国際緊張度',
    add_army_experience: '陸軍経験値',
    army_experience: '陸軍経験値',
    add_navy_experience: '海軍経験値',
    navy_experience: '海軍経験値',
    add_air_experience: '空軍経験値',
    air_experience: '空軍経験値',
    add_research_slot: '研究スロット',
    add_tech_bonus: '研究ボーナス',
    add_doctrine_cost_reduction: 'ドクトリン割引',
    set_technology: '技術の獲得',
    create_wargoal: '開戦事由を作成',
    add_state_claim: '州の請求権',
    add_state_core: '中核州を追加',
    remove_state_core: '中核州を削除',
    declare_war_on: '宣戦布告',
    puppet: '傀儡国化',
    annex_country: '併合',
    white_peace: '白紙和平',
    add_to_faction: '陣営に参加',
    remove_from_faction: '陣営から離脱',
    dismantle_faction: '陣営の解散',
    give_guarantee: '独立保証',
    leave_faction: '陣営を離脱',
    may_provoke_hostility: '敵対的行動の解禁',
    add_offsite_building: 'オフサイト工場',
    add_extra_state_shared_building_slots: '追加建築スロット',
    add_building_construction: '建設',
    add_resource: '資源を追加',
    add_equipment_to_stockpile: '備蓄に装備を追加',
    add_manpower: '人的資源',
    random_owned_controlled_state: 'ランダムな支配州',
    every_owned_state: '全ての所有州',
    load_oob: '部隊の展開',
    create_unit: '師団の編成',
    add_ace: 'エースパイロット'
  };

  if (reward.type === 'add_tech_bonus') {
    const category = reward.category || '全般';
    const bonus = reward.bonus ? ` ${(Number(reward.bonus) * 100).toFixed(0)}%` : '';
    const uses = reward.uses ? `（${reward.uses}回分）` : '';
    return `・研究ボーナス: ${category}${bonus}${uses}`;
  }

  let label = labels[reward.type];
  if (!label) {
    label = reward.type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  let value = reward.value ?? reward.idea ?? reward.amount ?? reward.target ?? reward.building ?? '';

  if (typeof value === 'number' && Math.abs(value) < 1 && value !== 0) {
    return `・${label}: ${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
  }
  if (typeof value === 'number') {
    return `・${label}: ${value >= 0 ? '+' : ''}${value}`;
  }

  return value ? `・${label}: ${value}` : `・${label}`;
};

// -----------------------------------------------------------------------------
// 3. 描画用ヘルパー: 報酬配列からツールチップ用HTMLを生成
// -----------------------------------------------------------------------------
window.generateTooltipHTML = function(rewards) {
  if (!Array.isArray(rewards)) return '';
  const formattedLines = rewards.map(r => window.formatCompletionReward(r)).filter(Boolean);
  return formattedLines.length > 0 ? `【達成報酬】<br>` + formattedLines.join('<br>') : '';
};

// モジュールの準備完了フラグ
window.NFRewardLoaderReady = true;
