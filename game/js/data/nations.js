/** data/nations.js — 7大国家データ + 資源定義 */

export const MAJORS = ['GER', 'USA', 'ENG', 'SOV', 'JAP', 'ITA', 'FRA'];

export const NATIONS = {
  GER: {
    tag: 'GER', name: 'ドイツ国', nameEn: 'Germany', adjective: 'ドイツ',
    flag: 'game/assets/flags/GER_fascism.png', ideology: 'fascism', color: '#9a9a9a',
    leader: { name: 'アドルフ・ヒトラー', portrait: 'game/card/GER/data/image/cut/hitler.png' },
    ideologySupport: { fascism: 55, neutrality: 25, democratic: 15, communism: 5 },
    // 国家別研究日数補正（小さいほど短い）
    researchBonus: { armor: 0.85, artillery: 0.95, infantry: 1.0, air: 1.0, naval: 1.05, industry: 1.0, engineering: 0.95, support: 1.0 },
    start: { pp: 120, stability: 85, warSupport: 60, manpower: 5200000, civ: 45, mil: 31, dock: 10, convoys: 100, cp: 80, nukes: 0, xp: { army: 120, navy: 60, air: 40 } },
    spirits: [{ id: 'blitzkrieg_theory', name: '電撃戦の理論', desc: '機甲突破+5%' }, { id: 'selective_conscription', name: '選択的徴兵制', desc: '徴兵可能人口+5%' }],
  },
  USA: {
    tag: 'USA', name: 'アメリカ合衆国', nameEn: 'United States', adjective: 'アメリカ',
    flag: 'game/assets/flags/USA_democratic.png', ideology: 'democratic', color: '#7a9bb5',
    leader: { name: 'フランクリン・ルーズベルト', portrait: '' },
    ideologySupport: { democratic: 70, neutrality: 20, communism: 3, fascism: 7 },
    researchBonus: { industry: 0.85, air: 0.9, infantry: 1.0, armor: 1.0, artillery: 1.0, naval: 1.0, engineering: 1.0, support: 1.0 },
    start: { pp: 100, stability: 90, warSupport: 20, manpower: 12000000, civ: 75, mil: 20, dock: 15, convoys: 150, cp: 60, nukes: 0, xp: { army: 60, navy: 100, air: 60 } },
    spirits: [{ id: 'arsenal_democracy', name: '民主主義の兵工廠', desc: '生産効率+5%' }],
  },
  ENG: {
    tag: 'ENG', name: 'イギリス', nameEn: 'United Kingdom', adjective: 'イギリス',
    flag: 'game/assets/flags/ENG_democratic.png', ideology: 'democratic', color: '#b04a4a',
    leader: { name: 'ネヴィル・チェンバレン', portrait: 'game/assets/leaders/chamberlain.jpg' },
    ideologySupport: { democratic: 65, neutrality: 20, fascism: 10, communism: 5 },
    researchBonus: { naval: 0.85, air: 0.9, engineering: 0.9, infantry: 1.0, armor: 1.05, artillery: 1.0, industry: 1.0, support: 1.0 },
    start: { pp: 110, stability: 90, warSupport: 30, manpower: 4800000, civ: 40, mil: 25, dock: 20, convoys: 200, cp: 70, nukes: 0, xp: { army: 60, navy: 120, air: 80 } },
    spirits: [{ id: 'naval_tradition', name: '海洋の覇者', desc: '海軍XP+10%/日' }],
  },
  SOV: {
    tag: 'SOV', name: 'ソビエト連邦', nameEn: 'Soviet Union', adjective: 'ソ連',
    flag: 'game/assets/flags/SOV_communism.png', ideology: 'communism', color: '#c04a4a',
    leader: { name: 'ヨシフ・スターリン', portrait: 'game/card/SOV/data/image/cut/stalin.png' },
    ideologySupport: { communism: 60, fascism: 10, democratic: 10, neutrality: 20 },
    researchBonus: { infantry: 0.85, artillery: 0.9, industry: 1.0, armor: 1.05, air: 1.05, naval: 1.1, engineering: 1.0, support: 1.0 },
    start: { pp: 90, stability: 70, warSupport: 50, manpower: 14000000, civ: 55, mil: 45, dock: 8, convoys: 60, cp: 90, nukes: 0, xp: { army: 100, navy: 40, air: 40 } },
    spirits: [{ id: 'great_patriotic', name: '大祖国戦争の精神', desc: '防御+10%' }],
  },
  JAP: {
    tag: 'JAP', name: '大日本帝国', nameEn: 'Japan', adjective: '日本',
    flag: 'game/assets/flags/JAP_neutrality.png', ideology: 'neutrality', color: '#c8a24a',
    leader: { name: '昭和天皇', portrait: 'game/card/JAP/data/image/cut/hirohito.png' },
    ideologySupport: { neutrality: 45, fascism: 35, democratic: 5, communism: 15 },
    researchBonus: { naval: 0.9, infantry: 0.95, air: 1.0, armor: 1.0, artillery: 1.05, industry: 1.05, engineering: 1.0, support: 1.0 },
    start: { pp: 100, stability: 80, warSupport: 55, manpower: 6800000, civ: 35, mil: 30, dock: 18, convoys: 120, cp: 85, nukes: 0, xp: { army: 80, navy: 80, air: 60 } },
    spirits: [{ id: 'bushido', name: '武士道精神', desc: '組織力回復+10%' }],
  },
  ITA: {
    tag: 'ITA', name: 'イタリア王国', nameEn: 'Italy', adjective: 'イタリア',
    flag: 'game/assets/flags/ITA_fascism.png', ideology: 'fascism', color: '#5a9a5a',
    leader: { name: 'ベニート・ムッソリーニ', portrait: 'game/assets/leaders/mussolini.jpg' },
    ideologySupport: { fascism: 60, neutrality: 25, democratic: 10, communism: 5 },
    researchBonus: { artillery: 0.9, infantry: 1.0, armor: 1.0, air: 1.0, naval: 1.0, industry: 1.05, engineering: 1.0, support: 1.0 },
    start: { pp: 80, stability: 75, warSupport: 45, manpower: 3200000, civ: 30, mil: 22, dock: 12, convoys: 90, cp: 60, nukes: 0, xp: { army: 60, navy: 60, air: 50 } },
    spirits: [{ id: 'romanita', name: 'ローマの末裔', desc: '安定度+5%' }],
  },
  FRA: {
    tag: 'FRA', name: 'フランス共和国', nameEn: 'France', adjective: 'フランス',
    flag: 'game/assets/flags/FRA_democratic.png', ideology: 'democratic', color: '#4a6a9a',
    leader: { name: 'エドゥアール・ダラディエ', portrait: 'game/assets/leaders/daladier.jpg' },
    ideologySupport: { democratic: 45, neutrality: 25, communism: 20, fascism: 10 },
    researchBonus: { armor: 0.9, artillery: 0.95, infantry: 1.0, air: 1.0, naval: 1.0, industry: 1.0, engineering: 1.05, support: 1.0 },
    start: { pp: 95, stability: 65, warSupport: 40, manpower: 4100000, civ: 38, mil: 28, dock: 10, convoys: 110, cp: 65, nukes: 0, xp: { army: 70, navy: 50, air: 50 } },
    spirits: [{ id: 'maginot_mentality', name: 'マジノー精神', desc: '防御+15%' }],
  },
};

/** 占領地・傀儡サンプル用の準国家（実在フラグを使用） */
export const MINOR_STATES = {
  POL: { name: 'ポーランド', flag: 'game/assets/flags/POL_KINGDOM_fascism.png', factories: 12 },
  CZE: { name: 'チェコスロバキア', flag: 'game/assets/flags/CZE_CEF_fascism.png', factories: 18 },
  HUN: { name: 'ハンガリー', flag: 'game/assets/flags/HUN_EMPIRE_fascism.png', factories: 8 },
  ROM: { name: 'ルーマニア', flag: 'game/assets/flags/ROM_fascism.png', factories: 10 },
  YUG: { name: 'ユーゴスラビア', flag: 'game/assets/flags/YUG_communism.png', factories: 9 },
};

export const RESOURCES = [
  { id: 'oil',      icon: 'game/card/GER/data/image/item/oil.png' },
  { id: 'rubber',   icon: 'game/card/GER/data/image/item/rubber.png' },
  { id: 'steel',    icon: 'game/card/GER/data/image/item/steel.png' },
  { id: 'aluminum', icon: 'game/card/GER/data/image/item/aluminum.png' },
  { id: 'tungsten', icon: 'game/card/GER/data/image/item/tungsten.png' },
  { id: 'chromium', icon: 'game/card/GER/data/image/item/chromium.png' },
];

export const IDEOLOGIES = [
  { id: 'fascism',    color: '#8a5a3a' },
  { id: 'communism',  color: '#b03a3a' },
  { id: 'democratic', color: '#4a7ab0' },
  { id: 'neutrality', color: '#7a8a5a' },
];

export function nationName(tag) {
  return NATIONS[tag]?.name || MINOR_STATES[tag]?.name || tag;
}

export function nationFlag(tag) {
  return NATIONS[tag]?.flag || MINOR_STATES[tag]?.flag || '';
}
