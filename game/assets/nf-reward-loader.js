'use strict';

// -----------------------------------------------------------------------------
// NFRewardLoader: GitHubからParadox形式の達成報酬データを取得・パースするローダー
//
// 表示フォーマットと実行処理は game/assets/hoi4-effects-config.js が一元管理する。
// このローダーは外部データの取得・正規化のみを担い、未定義キーや複雑なネスト形式は
// すべて共通フォーマッター (HOI4EffectsConfig.formatEffect / applyEffect) へ渡す。
// 外部データが未読み込みの場合でも、HOI4EffectsConfig.buildRewardsFromFocus による
// フォールバック定義でUI表示・状態更新が動作する。
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
        // 既存の completion_rewards を優先し、外部データが無ければフォールバック生成。
        if (focus.completion_rewards?.length) return focus;
        if (!rewards.has(id)) return focus;
        return { ...focus, completion_rewards: rewards.get(id) };
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
    const source = text.replace(/#[^\r\n]*/g, '');
    const focusPattern = /(?:focus|shared_focus)\s*=\s*\{/g;
    let match;

    while ((match = focusPattern.exec(source))) {
      const open = source.indexOf('{', match.index);
      const end = this.blockEnd(source, open);
      if (end < 0) break;
      const body = source.slice(open + 1, end);

      const idMatch = /(?:^|\s)id\s*=\s*([A-Za-z0-9_:.-]+)/.exec(body);
      if (!idMatch) continue;
      const focusId = idMatch[1];

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

  // 再帰的なブロック解析でネストした { building = bunker level = 3 } を正しく読み取る。
  parseBlock(block) {
    const rewards = [];
    const tokens = this.tokenize(block);
    let i = 0;
    while (i < tokens.length) {
      const type = tokens[i];
      if (!/^[a-zA-Z0-9_]+$/.test(type)) { i += 1; continue; }
      // 次のトークンが "=" なら値ペア、そうでなければフラグ型効果
      if (tokens[i + 1] === '=') {
        const raw = tokens[i + 2];
        if (raw === '{') {
          // ネストブロックを丸ごと抽出して共通フォーマッターへ渡せる形に正規化
          const inner = this.extractBlock(tokens, i + 2);
          const reward = { type };
          this.parseInnerBlock(inner, reward);
          // building = { building = bunker level = 3 } → add_building_construction へ正規化
          if (type === 'building' && reward.building) reward.type = 'add_building_construction';
          rewards.push(reward);
          i = inner.endIndex + 1; // ブロック終端 "}" の次へ
        } else {
          const scalar = this.scalar(raw);
          // add_ideas = idea_name → { type, idea }
          if (type === 'add_ideas' || type === 'remove_ideas') rewards.push({ type, idea: scalar });
          else rewards.push({ type, value: scalar });
          i += 3;
        }
      } else {
        // フラグ型 (例: set_country_flag = なしで単独) は内部制御キーとして無視される
        i += 1;
      }
    }
    return rewards;
  },

  // ブロック内の "key = value" を reward オブジェクトへ格納。
  parseInnerBlock(inner, reward) {
    const tokens = inner.tokens;
    let i = 0;
    while (i < tokens.length) {
      const key = tokens[i];
      if (tokens[i + 1] === '=') {
        const val = tokens[i + 2];
        if (val === '{') {
          // さらにネストしている場合は文字列化して保持 (フォーマッターが解釈)
          const nested = this.extractBlock(tokens, i + 2);
          reward[key] = nested.tokens.join(' ');
          i = nested.endIndex + 1;
        } else {
          reward[key] = this.scalar(val);
          i += 3;
        }
      } else { i += 1; }
    }
  },

  // 字句解析: ブロック・文字列リテラル・識別子・数値・記号をトークン分割。
  tokenize(text) {
    const tokens = [];
    const re = /"([^"]*)"|'([^']*)'|([{}=])|([^\s{}=]+)/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1] !== undefined) tokens.push(m[1]);
      else if (m[2] !== undefined) tokens.push(m[2]);
      else if (m[3] !== undefined) tokens.push(m[3]);
      else tokens.push(m[4]);
    }
    return tokens;
  },

  // "{" の位置から対応する "}" までのトークン列を抽出。
  extractBlock(tokens, openIndex) {
    let depth = 0;
    for (let j = openIndex; j < tokens.length; j += 1) {
      if (tokens[j] === '{') depth += 1;
      else if (tokens[j] === '}') { depth -= 1; if (depth === 0) return { tokens: tokens.slice(openIndex + 1, j), endIndex: j }; }
    }
    return { tokens: tokens.slice(openIndex + 1), endIndex: tokens.length - 1 };
  },

  scalar(value) {
    const clean = String(value).replace(/["']/g, '');
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : clean;
  }
};

// -----------------------------------------------------------------------------
// formatCompletionReward: 報酬1件を日本語テキストへ変換 (共通フォーマッターへ委譲)
// -----------------------------------------------------------------------------
window.formatCompletionReward = function rewardText(reward) {
  if (!reward || !reward.type) return '';
  // 内部制御キーは表示しない
  const ignore = window.HOI4EffectsConfig?.ignoreTypes;
  if (ignore && ignore.has(reward.type)) return null;
  if (/^[A-Z]{3}$/.test(reward.type) || /^[0-9]+$/.test(reward.type)) return null;

  const formatted = window.HOI4EffectsConfig?.formatEffect?.(reward);
  return formatted ? formatted.text : '';
};

// -----------------------------------------------------------------------------
// 描画用ヘルパー: 報酬配列からツールチップ用HTMLを生成 (色付きHoI4風)
// -----------------------------------------------------------------------------
window.generateTooltipHTML = function (rewards) {
  if (!Array.isArray(rewards)) return '';
  const fmt = window.HOI4EffectsConfig?.formatEffect || window.formatEffect;
  const lines = rewards.map(r => fmt(r)).filter(Boolean);
  if (!lines.length) return '';
  return '【達成報酬】<br>' + lines.map(line => {
    const cls = line.color === '#ef4444' ? 'negative' : 'positive';
    return `<span class="tt-reward ${cls}" style="color:${line.color || '#22c55e'}">${line.text}</span>`;
  }).join('<br>');
};

window.NFRewardLoaderReady = true;
