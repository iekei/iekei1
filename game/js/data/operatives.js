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

/** 任務定義: id → {days（所要日数）, effect適用関数用パラメータ} */
export const INTEL_MISSIONS = [
  { id: 'build_network', days: 30,  intelGain: 10, combatBonus: 0.05 },
  { id: 'decrypt',       days: 21,  enemyOrgPct: -0.05 },
  { id: 'sabotage',      days: 45,  factoryPenaltyDays: 30, factoryPenaltyPct: -0.20 },
  { id: 'steal_tech',    days: 60,  stealProgressPct: 0.25 },
  { id: 'propaganda',    days: 40,  stabilityDamage: 5 },
  { id: 'coup',          days: 90,  coupChance: 0.3 },
];

export const OPERATIVE_SKILLS = ['spy_master', 'linguist', 'saboteur', 'code_breaker', 'assassin', 'diplomat'];
