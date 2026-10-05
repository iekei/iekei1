#!/usr/bin/env node
/** Merge completion_reward blocks from HOI4 national-focus files into nf_batch JSON files. */
import fs from 'node:fs';
import path from 'node:path';

const [, , sourceDir, dataRoot] = process.argv;
if (!sourceDir || !dataRoot) {
  console.error('Usage: node tools/nf-reward-converter.mjs <national_focus_dir> <game_data_root>');
  process.exit(1);
}

const number = value => /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
const scalar = value => number(String(value).replace(/["\']/g, ''));

function balancedBlock(text, start) {
  const open = text.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return '';
}

function parseRewards(block) {
  const rewards = [];
  const lines = block.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!match) continue;
    const [, type, raw] = match;
    if (raw.startsWith('{')) {
      const reward = { type };
      for (const pair of raw.matchAll(/(\w+)\s*=\s*([^\s}]+)/g)) reward[pair[1]] = scalar(pair[2]);
      rewards.push(reward);
    } else {
      const value = scalar(raw.replace(/[{}]/g, '').trim());
      const key = type === 'add_ideas' ? 'idea' : 'value';
      rewards.push({ type, [key]: value });
    }
  }
  return rewards;
}

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : /\.(txt|json)$/i.test(entry.name) ? [full] : [];
  });
}

const rewardsById = new Map();
for (const file of collectFiles(sourceDir)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const focus of text.matchAll(/(\w+)\s*=\s*\{[\s\S]*?completion_reward\s*=\s*\{/g)) {
    const start = focus.index + focus[0].lastIndexOf('completion_reward');
    const rewards = parseRewards(balancedBlock(text, start));
    if (rewards.length) rewardsById.set(focus[1], rewards);
  }
}

let updated = 0;
for (const file of collectFiles(dataRoot).filter(file => /_nf_batch\d+\.json$/i.test(file))) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  for (const focus of data) {
    const rewards = rewardsById.get(focus.id || focus.focus_id);
    if (!rewards) continue;
    focus.completion_rewards = rewards;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    updated += 1;
  }
}
console.log(`Merged ${rewardsById.size} focuses into ${updated} nf_batch files.`);

function formatCompletionReward(reward) {
  const labels = { add_political_power: '政治力', add_war_support: '戦争協力度', add_stability: '安定度', add_research_slot: '研究スロット', add_army_experience: '陸軍経験値', add_navy_experience: '海軍経験値', add_air_experience: '空軍経験値', add_ideas: '国家精神' };
  const label = labels[reward.type] || reward.type;
  const value = reward.value ?? reward.idea ?? reward.bonus ?? '';
  const display = typeof value === 'number' && Math.abs(value) < 1 ? `${(value * 100).toFixed(2)}%` : value;
  return `・${label}: +${display}`;
}

// Keep the formatter available to browser-side loaders when this file is copied for tooling.
export { parseRewards, formatCompletionReward };

function installBrowserFormatter() {
  if (typeof window !== 'undefined') window.formatCompletionReward = formatCompletionReward;
}
installBrowserFormatter();
