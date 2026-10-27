/** data/operatives.js — 諜報員テンプレート（肖像は game/assets/operatives/ の実ファイル） */

const OP = 'game/assets/operatives';

export const OPERATIVES = [
  { id: 'skorzeny',  name: 'オットー・スコルツェニー', nation: 'GER', portrait: `${OP}/portrait_ger_otto_skorzeny_result.png`, skill: 'saboteur',    skillValue: 4 },
  { id: 'bazna',     name: 'エリエサ・バズナ', nation: 'GER', portrait: `${OP}/portrait_ger_elyesa_bazna_result.png`, skill: 'spy_master', skillValue: 3 },
  { id: 'sorge',     name: 'リヒャルト・ゾルゲ', nation: 'SOV', portrait: `${OP}/portrait_sov_richard_sorge_result.png`, skill: 'spy_master', skillValue: 5 },
  { id: 'philby',    name: 'キム・フィルビー', nation: 'SOV', portrait: `${OP}/portrait_sov_kim_philby_result.png`, skill: 'code_breaker', skillValue: 4 },
  { id: 'baker',     name: 'ジョセフィーヌ・ベイカー', nation: 'USA', portrait: `${OP}/portrait_usa_josephine_baker_result.png`, skill: 'spy_master', skillValue: 4 },
  { id: 'hall',      name: 'ヴァージニア・ホール', nation: 'USA', portrait: `${OP}/portrait_usa_virginia_hall_result.png`, skill: 'linguist', skillValue: 4 },
  { id: 'wake',      name: 'ナンシー・ウェイク', nation: 'ENG', portrait: `${OP}/portrait_eng_nancy_wake_result.png`, skill: 'saboteur', skillValue: 5 },
  { id: 'popov',     name: 'ドゥシュコ・ポポフ', nation: 'ENG', portrait: `${OP}/portrait_eng_dusko_popov_result.png`, skill: 'spy_master', skillValue: 4 },
  { id: 'samson',    name: 'オデット・サムソン', nation: 'FRA', portrait: `${OP}/portrait_fra_odette_samson_result.png`, skill: 'saboteur', skillValue: 4 },
  { id: 'kawashima', name: '川島芳子', nation: 'JAP', portrait: `${OP}/portrait_jap_yoshiko_kawashima_result.png`, skill: 'spy_master', skillValue: 4 },
  { id: 'giglio',    name: 'マウリツィオ・ジリオ', nation: 'ITA', portrait: `${OP}/portrait_ita_maurizio_giglio_result.png`, skill: 'code_breaker', skillValue: 3 },
  { id: 'yoshikawa', name: '吉川猛夫', nation: 'JAP', portrait: `${OP}/portrait_jap_takeo_yoshikawa_result.png`, skill: 'spy_master', skillValue: 4 },
];

/** 任務定義: id → {days（所要日数）, 効果パラメータ, requiresBranch（機関アップグレード要件）} */
export const INTEL_MISSIONS = [
  {
    id: 'build_network', name: 'ネットワーク構築', icon: '🕸', color: '#7ec850',
    days: 30, intelGain: 8, networkGain: 18,
    desc: '対象国にスパイ網を築く。ネットワーク進捗が上がるほどインテルレベルが上昇する。',
  },
  {
    id: 'propaganda', name: 'プロパガンダ', icon: '📢', color: '#e6c268',
    days: 36, intelGain: 6, stabilityDamage: 6, warSupportDamage: 8,
    desc: '世論を扇動し、対象国の安定度と戦争協力度を低下させる。',
  },
  {
    id: 'decrypt', name: '暗号解読支援', icon: '🔐', color: '#5e9ec7',
    days: 21, intelGain: 12, requiresBranch: { crypto: 1 },
    desc: '暗号を解読してインテルを獲得。軍事情報の解禁が早まる（暗号解読チーム Lv1 以上）。',
  },
  {
    id: 'sabotage', name: '破壊工作', icon: '💥', color: '#d05038',
    days: 45, intelGain: 4, factoryPenaltyDays: 30, factoryPenaltyPct: -0.20,
    requiresBranch: { special_forces: 1 },
    desc: '工場・インフラを破壊する（特殊部隊 Lv1 以上）。',
  },
  {
    id: 'steal_tech', name: '技術窃取', icon: '📡', color: '#a06ec8',
    days: 60, intelGain: 6, stealReduction: 0.12,
    requiresBranch: { special_forces: 1 },
    desc: '研究ボーナスを獲得する（特殊部隊 Lv1 以上）。',
  },
  {
    id: 'coup', name: 'クーデター支援', icon: '🏴', color: '#c86a6a',
    days: 90, intelGain: 10, coupChance: 0.35,
    requiresBranch: { special_forces: 2 },
    desc: '政権転覆を画策する（特殊部隊 Lv2 以上）。',
  },
];

export const OPERATIVE_SKILLS = ['spy_master', 'linguist', 'saboteur', 'code_breaker', 'assassin', 'diplomat'];
