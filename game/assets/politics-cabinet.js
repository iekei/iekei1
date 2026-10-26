/* politics-cabinet.js — HOI4風「政治・法案・内閣 (Politics, Laws & Advisors)」
 *
 *  - 政治画面 (左上の国旗 / ナビ「政治」): 上部 = 政治力・安定度・戦争協力度・政党支持率の円グラフ
 *    中央 = 徴兵令 / 経済法 / 貿易法 の3大法案スロット、下部 = 政治顧問・理論家・軍最高司令部・工業企業 のスロット
 *  - スロットをクリックするとポップアップが開き、政治力 (150PP 等) を消費して法案の施行・人物の任命ができる (前提条件つき)
 *  - 任命・施行した補正は PoliticsSystem.modifiers() に集約され、工場出力・建設速度・研究速度・徴兵可能人口・政治力獲得・
 *    攻撃力などの計算に即座に反映される
 */
class PoliticsSystem {
  static PARTIES = {
    fascism:    { name: 'ファシズム', short: 'ファシ', color: '#8b5a2b' },
    communism:  { name: '共産主義',   short: '共産',   color: '#c0392b' },
    democracy:  { name: '民主主義',   short: '民主',   color: '#2d6cdf' },
    neutrality: { name: '中道',       short: '中道',   color: '#8c8c8c' },
  };
  /** 補正キーの表示名 (値は割合: 0.1 = +10%、flat: は実数) */
  static MOD_LABELS = {
    factoryOutput: '工場出力', civConstruction: '民需建設速度', milConstruction: '軍需建設速度', construction: '建設速度',
    research: '研究速度', manpower: '徴兵可能人口', ppGain: '政治力獲得', attack: '師団攻撃力', defense: '師団防御力',
    exportRatio: '資源輸出比率', stabilityFlat: '安定度', warSupportFlat: '戦争協力度', xpGain: '経験値獲得', supply: '補給効率',
    navalProduction: '艦艇生産', airProduction: '航空機生産', armorProduction: '戦車生産', driftFascism: 'ファシズム支持 /日', driftCommunism: '共産主義支持 /日', driftDemocracy: '民主主義支持 /日', driftNeutrality: '中道支持 /日',
  };
  static FLAT = new Set(['stabilityFlat', 'warSupportFlat', 'driftFascism', 'driftCommunism', 'driftDemocracy', 'driftNeutrality']);

  // ------------------------------------------------------------------
  // 3大法案
  // ------------------------------------------------------------------
  static LAWS = {
    conscription: {
      name: '徴兵令', icon: '🪖', desc: '徴兵可能人口の割合を決める。拡大には戦争協力度が必要。',
      list: [
        { id: 'disarmed',  name: '武装解除国家', pop: 1,    mpPerDay: 30,   cost: 150, wsReq: 0,  mods: { factoryOutput: 0.0 }, note: '徴兵可能人口 1%' },
        { id: 'volunteer', name: '志願兵のみ',   pop: 1.5,  mpPerDay: 100,  cost: 150, wsReq: 0,  mods: {}, note: '徴兵可能人口 1.5%' },
        { id: 'limited',   name: '限定徴兵',     pop: 2.5,  mpPerDay: 300,  cost: 150, wsReq: 10, mods: {}, note: '徴兵可能人口 2.5%' },
        { id: 'extensive', name: '大規模徴兵',   pop: 5,    mpPerDay: 600,  cost: 150, wsReq: 25, mods: { xpGain: -0.05 }, note: '徴兵可能人口 5%' },
        { id: 'service',   name: '兵役義務',     pop: 10,   mpPerDay: 1000, cost: 150, wsReq: 50, mods: { xpGain: -0.1 }, note: '徴兵可能人口 10%' },
        { id: 'all_adults', name: '成人皆兵',    pop: 20,   mpPerDay: 1600, cost: 150, wsReq: 70, mods: { factoryOutput: -0.1, construction: -0.1 }, note: '徴兵可能人口 20% / 工場出力 −10%', atWar: true },
        { id: 'scraping',  name: '根こそぎ動員', pop: 25,   mpPerDay: 2500, cost: 150, wsReq: 90, mods: { factoryOutput: -0.3, construction: -0.3, stabilityFlat: -10 }, note: '徴兵可能人口 25% / 工場出力 −30%', atWar: true },
      ],
    },
    economy: {
      name: '経済法', icon: '🏭', desc: '民需・軍需の建設速度と工場出力、民需工場の必要数を決める。',
      list: [
        { id: 'undisturbed', name: '不干渉経済', cost: 150, stabPerDay: 0.02, factoryOutput: -0.05, mods: { civConstruction: 0.1, milConstruction: -0.3, factoryOutput: -0.05 }, note: '民需建設 +10% / 軍需建設 −30%', req: s => (s.atWar || []).length ? '戦時中は不可' : null },
        { id: 'civilian', name: '民間経済', cost: 150, stabPerDay: 0.01, factoryOutput: 0, mods: { civConstruction: 0, milConstruction: -0.2 }, note: '軍需建設 −20%' },
        { id: 'early',    name: '早期動員', cost: 150, stabPerDay: 0, factoryOutput: 0.05, mods: { milConstruction: -0.1, factoryOutput: 0.05 }, note: '軍需建設 −10% / 工場出力 +5%', wsReq: 15 },
        { id: 'partial',  name: '部分動員', cost: 150, stabPerDay: -0.005, factoryOutput: 0.10, mods: { milConstruction: 0.1, factoryOutput: 0.1 }, note: '軍需建設 +10% / 工場出力 +10%', wsReq: 25 },
        { id: 'war',      name: '戦時経済', cost: 150, stabPerDay: -0.01, factoryOutput: 0.15, mods: { milConstruction: 0.2, civConstruction: -0.1, factoryOutput: 0.15 }, note: '軍需建設 +20% / 民需建設 −10% / 工場出力 +15%', wsReq: 50 },
        { id: 'total',    name: '総動員',   cost: 150, stabPerDay: -0.02, factoryOutput: 0.20, mods: { milConstruction: 0.3, civConstruction: -0.2, factoryOutput: 0.2, manpower: -0.05 }, note: '軍需建設 +30% / 民需建設 −20% / 工場出力 +20% / 徴兵 −5%', wsReq: 80, atWar: true },
      ],
    },
    trade: {
      name: '貿易法', icon: '⚖️', desc: '資源の輸出比率。輸出が多いほど研究・建設にボーナス、少ないほど資源を国内に確保。',
      list: [
        { id: 'free',    name: '自由貿易', cost: 150, ratio: 0.8,  policy: 'free',    mods: { exportRatio: 0.8,  research: 0.1,  construction: 0.15, factoryOutput: 0.15 }, note: '輸出 80% / 研究 +10% / 建設・出力 +15%' },
        { id: 'export',  name: '輸出重視', cost: 150, ratio: 0.5,  policy: 'limited', mods: { exportRatio: 0.5,  research: 0.05, construction: 0.1,  factoryOutput: 0.1 }, note: '輸出 50% / 研究 +5% / 建設・出力 +10%' },
        { id: 'limited', name: '輸出制限', cost: 150, ratio: 0.25, policy: 'limited', mods: { exportRatio: 0.25, research: 0.01, construction: 0.05, factoryOutput: 0.05 }, note: '輸出 25% / 建設・出力 +5%' },
        { id: 'closed',  name: '閉鎖経済', cost: 150, ratio: 0,    policy: 'closed',  mods: { exportRatio: 0 }, note: '輸出 0% / ボーナスなし' },
      ],
    },
  };

  // ------------------------------------------------------------------
  // 閣僚・企業スロット
  // ------------------------------------------------------------------
  static SLOT_GROUPS = [
    { id: 'advisor', name: '政治顧問', icon: '🎩', slots: 3, cost: 150, pool: 'ADVISORS' },
    { id: 'theorist', name: '理論家', icon: '📐', slots: 1, cost: 150, pool: 'THEORISTS' },
    { id: 'command', name: '軍最高司令部', icon: '⭐', slots: 4, cost: 150, pool: 'COMMAND' },
    { id: 'company', name: '工業企業', icon: '🏢', slots: 4, cost: 150, pool: 'COMPANIES' },
  ];
  static ADVISORS = [
    { id: 'captain_of_industry', name: '産業界の巨頭', icon: '🏗️', mods: { civConstruction: 0.1 }, desc: '民需工場・インフラ・精製所の建設速度 +10%' },
    { id: 'war_industrialist', name: '軍需産業家', icon: '⚙️', mods: { milConstruction: 0.1 }, desc: '軍需工場・造船所・要塞の建設速度 +10%' },
    { id: 'armaments_organizer', name: '軍備統括者', icon: '🔩', mods: { factoryOutput: 0.1 }, desc: '工場出力 +10%' },
    { id: 'silent_workhorse', name: '縁の下の力持ち', icon: '📋', mods: { ppGain: 0.15 }, desc: '政治力獲得 +15%' },
    { id: 'backroom_backstabber', name: '陰謀家', icon: '🗡️', mods: { ppGain: 0.1, stabilityFlat: -5 }, desc: '政治力獲得 +10% / 安定度 −5%', req: s => s.stability < 40 ? '安定度 40% 以上が必要' : null },
    { id: 'popular_figurehead', name: '国民的指導者', icon: '🌟', mods: { stabilityFlat: 15 }, desc: '安定度 +15%' },
    { id: 'prince_of_terror', name: '恐怖政治の君主', icon: '🕯️', mods: { warSupportFlat: 10, manpower: 0.05, stabilityFlat: -5 }, desc: '戦争協力度 +10% / 徴兵可能人口 +5% / 安定度 −5%', req: s => PoliticsSystem.ideology() === 'democracy' ? '民主主義国は任命不可' : null },
    { id: 'ideological_crusader', name: '思想の闘士', icon: '📣', mods: { stabilityFlat: 10, warSupportFlat: 5 }, desc: '安定度 +10% / 戦争協力度 +5% (与党支持率 60% 以上)', req: s => PoliticsSystem.partyShare(PoliticsSystem.ideology()) < 60 ? '与党支持率 60% 以上が必要' : null },
    { id: 'quartermaster_general', name: '兵站総監', icon: '🚚', mods: { supply: 0.1, xpGain: 0.05 }, desc: '補給効率 +10% / 経験値獲得 +5%' },
    { id: 'fascist_demagogue', name: 'ファシストの扇動家', icon: '🦅', mods: { driftFascism: 0.1 }, desc: 'ファシズム支持率 +0.1%/日', req: s => PoliticsSystem.ideology() === 'fascism' ? '既にファシズム政権です' : null },
    { id: 'communist_revolutionary', name: '共産主義の革命家', icon: '⚒️', mods: { driftCommunism: 0.1 }, desc: '共産主義支持率 +0.1%/日', req: s => PoliticsSystem.ideology() === 'communism' ? '既に共産主義政権です' : null },
    { id: 'democratic_reformer', name: '民主主義の改革者', icon: '🕊️', mods: { driftDemocracy: 0.1 }, desc: '民主主義支持率 +0.1%/日', req: s => PoliticsSystem.ideology() === 'democracy' ? '既に民主主義政権です' : null },
  ];
  static THEORISTS = [
    { id: 'military_theorist', name: '軍事理論家', icon: '📚', mods: { research: 0.05, xpGain: 0.1 }, desc: '研究速度 +5% / 陸軍経験値 +10%' },
    { id: 'mobile_warfare_expert', name: '機動戦の専門家', icon: '🚜', mods: { attack: 0.05, armorProduction: 0.05 }, desc: '師団攻撃力 +5% / 戦車生産 +5%' },
    { id: 'grand_battleplan_expert', name: '大規模作戦の専門家', icon: '🗺️', mods: { defense: 0.05, supply: 0.05 }, desc: '師団防御力 +5% / 補給効率 +5%' },
    { id: 'naval_theorist', name: '海軍理論家', icon: '⚓', mods: { navalProduction: 0.1 }, desc: '艦艇生産 +10%' },
    { id: 'air_warfare_theorist', name: '航空戦理論家', icon: '✈️', mods: { airProduction: 0.1 }, desc: '航空機生産 +10%' },
    { id: 'nuclear_scientist', name: '核物理学者', icon: '☢️', mods: { research: 0.1 }, desc: '研究速度 +10% (核研究済み)', req: s => (typeof ResearchManager !== 'undefined' && [...(ResearchManager.researchedTech || [])].some(t => /nuclear|atomic/i.test(String(t)))) ? null : '核関連技術の研究が必要' },
  ];
  static COMMAND = [
    { id: 'army_chief_offensive', name: '陸軍総司令官 (攻勢)', icon: '🎖️', mods: { attack: 0.1 }, desc: '師団攻撃力 +10%' },
    { id: 'army_chief_defensive', name: '陸軍総司令官 (防勢)', icon: '🛡️', mods: { defense: 0.1 }, desc: '師団防御力 +10%' },
    { id: 'army_chief_drill', name: '陸軍総司令官 (訓練)', icon: '🏋️', mods: { xpGain: 0.15, manpower: 0.025 }, desc: '経験値獲得 +15% / 徴兵可能人口 +2.5%' },
    { id: 'navy_chief', name: '海軍総司令官', icon: '⚓', mods: { navalProduction: 0.1 }, desc: '艦艇生産 +10%' },
    { id: 'air_chief', name: '空軍総司令官', icon: '✈️', mods: { airProduction: 0.1 }, desc: '航空機生産 +10%' },
    { id: 'infantry_expert', name: '歩兵専門家', icon: '🪖', mods: { attack: 0.05, defense: 0.05 }, desc: '師団攻撃力・防御力 +5%' },
    { id: 'armor_expert', name: '機甲専門家', icon: '🛞', mods: { attack: 0.08, armorProduction: 0.05 }, desc: '師団攻撃力 +8% / 戦車生産 +5%' },
    { id: 'logistics_expert', name: '兵站専門家', icon: '📦', mods: { supply: 0.15 }, desc: '補給効率 +15%' },
    { id: 'artillery_expert', name: '砲兵専門家', icon: '💥', mods: { attack: 0.07 }, desc: '師団攻撃力 +7%' },
  ];
  static COMPANIES = [
    { id: 'industrial_concern', name: '工業コンツェルン', icon: '🏭', mods: { research: 0.1 }, desc: '研究速度 +10% (工業技術重視)' },
    { id: 'electronics_concern', name: '電子機器企業', icon: '📡', mods: { research: 0.1 }, desc: '研究速度 +10% (電子工学重視)' },
    { id: 'materials_designer', name: '装備設計会社', icon: '🔧', mods: { factoryOutput: 0.05, research: 0.03 }, desc: '工場出力 +5% / 研究速度 +3%' },
    { id: 'tank_designer', name: '戦車設計会社', icon: '🛞', mods: { armorProduction: 0.15, attack: 0.03 }, desc: '戦車生産 +15% / 師団攻撃力 +3%' },
    { id: 'aircraft_designer', name: '航空機設計会社', icon: '✈️', mods: { airProduction: 0.15 }, desc: '航空機生産 +15%' },
    { id: 'naval_designer', name: '艦艇設計会社', icon: '🚢', mods: { navalProduction: 0.15 }, desc: '艦艇生産 +15%' },
    { id: 'motorized_designer', name: '自動車会社', icon: '🚛', mods: { supply: 0.05, attack: 0.02 }, desc: '補給効率 +5% / 師団攻撃力 +2%' },
    { id: 'refinery_concern', name: '化学・精製企業', icon: '🧪', mods: { factoryOutput: 0.03, research: 0.05 }, desc: '工場出力 +3% / 研究速度 +5% (合成資源)' },
  ];
  /** 主要国の固有名 (id → 人物/企業名) */
  static NAMES = {
    GER: { captain_of_industry: 'ヒャルマル・シャハト', war_industrialist: 'アルベルト・シュペーア', armaments_organizer: 'フリッツ・トート', silent_workhorse: 'マルティン・ボルマン', backroom_backstabber: 'ヴィルヘルム・カナリス', popular_figurehead: 'ヘルマン・ゲーリング', prince_of_terror: 'ハインリヒ・ヒムラー', ideological_crusader: 'ヨーゼフ・ゲッベルス', quartermaster_general: 'エドゥアルト・ヴァーグナー', fascist_demagogue: 'ルドルフ・ヘス', communist_revolutionary: 'エルンスト・テールマン', democratic_reformer: 'コンラート・アデナウアー', military_theorist: 'ハインツ・グデーリアン', mobile_warfare_expert: 'エーリヒ・フォン・マンシュタイン', grand_battleplan_expert: 'フランツ・ハルダー', naval_theorist: 'カール・デーニッツ', air_warfare_theorist: 'ヴァルター・ヴェーファー', nuclear_scientist: 'ヴェルナー・ハイゼンベルク', army_chief_offensive: 'ヴァルター・フォン・ブラウヒッチュ', army_chief_defensive: 'ヴィルヘルム・カイテル', army_chief_drill: 'ヴェルナー・フォン・フリッチュ', navy_chief: 'エーリヒ・レーダー', air_chief: 'アルベルト・ケッセルリンク', infantry_expert: 'ヴァルター・モーデル', armor_expert: 'エルヴィン・ロンメル', logistics_expert: 'アルフレート・ヨードル', artillery_expert: 'エーリヒ・ホェプナー', industrial_concern: 'IGファルベン', electronics_concern: 'シーメンス', materials_designer: 'ラインメタル', tank_designer: 'ヘンシェル', aircraft_designer: 'メッサーシュミット', naval_designer: 'ブローム・ウント・フォス', motorized_designer: 'ダイムラー・ベンツ', refinery_concern: 'ルールヘミー' },
    SOV: { captain_of_industry: 'アナスタス・ミコヤン', war_industrialist: 'ニコライ・ヴォズネセンスキー', armaments_organizer: 'ボリス・ヴァンニコフ', silent_workhorse: 'ゲオルギー・マレンコフ', backroom_backstabber: 'ラヴレンチー・ベリヤ', popular_figurehead: 'ミハイル・カリーニン', prince_of_terror: 'ニコライ・エジョフ', ideological_crusader: 'アンドレイ・ジダーノフ', quartermaster_general: 'アンドレイ・フルリョフ', fascist_demagogue: 'コンスタンチン・ロジャエフスキー', communist_revolutionary: 'レフ・トロツキー', democratic_reformer: 'アレクサンドル・ケレンスキー', military_theorist: 'ボリス・シャポシニコフ', mobile_warfare_expert: 'ミハイル・トゥハチェフスキー', grand_battleplan_expert: 'アレクサンドル・ヴァシレフスキー', naval_theorist: 'ニコライ・クズネツォフ', air_warfare_theorist: 'アレクサンドル・ノヴィコフ', nuclear_scientist: 'イーゴリ・クルチャトフ', army_chief_offensive: 'ゲオルギー・ジューコフ', army_chief_defensive: 'セミョーン・チモシェンコ', army_chief_drill: 'クリメント・ヴォロシーロフ', navy_chief: 'イワン・イサコフ', air_chief: 'パーヴェル・ジガレフ', infantry_expert: 'イワン・コーネフ', armor_expert: 'パーヴェル・ロトミストロフ', logistics_expert: 'アレクセイ・アントーノフ', artillery_expert: 'ニコライ・ヴォロノフ', industrial_concern: 'スターリン記念工場', electronics_concern: 'NII-20', materials_designer: 'トゥーラ兵器廠', tank_designer: 'ハリコフ機関車工場', aircraft_designer: 'ヤコヴレフ設計局', naval_designer: 'バルト造船所', motorized_designer: 'GAZ', refinery_concern: 'バクー石油トラスト' },
    USA: { captain_of_industry: 'ヘンリー・モーゲンソー', war_industrialist: 'ヘンリー・カイザー', armaments_organizer: 'ウィリアム・クヌードセン', silent_workhorse: 'ハリー・ホプキンス', backroom_backstabber: 'J・エドガー・フーヴァー', popular_figurehead: 'エレノア・ルーズベルト', prince_of_terror: 'ジョン・ガーナー', ideological_crusader: 'フランシス・パーキンス', quartermaster_general: 'ブレホン・サマーヴェル', fascist_demagogue: 'チャールズ・コフリン', communist_revolutionary: 'アール・ブラウダー', democratic_reformer: 'ヘンリー・ウォレス', military_theorist: 'ジョージ・マーシャル', mobile_warfare_expert: 'ジョージ・パットン', grand_battleplan_expert: 'ドワイト・アイゼンハワー', naval_theorist: 'チェスター・ニミッツ', air_warfare_theorist: 'ヘンリー・アーノルド', nuclear_scientist: 'ロバート・オッペンハイマー', army_chief_offensive: 'ダグラス・マッカーサー', army_chief_defensive: 'マリン・クレイグ', army_chief_drill: 'レズリー・マクネア', navy_chief: 'アーネスト・キング', air_chief: 'カール・スパーツ', infantry_expert: 'オマール・ブラッドレー', armor_expert: 'アドナ・チャーフィー', logistics_expert: 'ジョセフ・スティルウェル', artillery_expert: 'ジェイコブ・ディヴァース', industrial_concern: 'ゼネラル・エレクトリック', electronics_concern: 'ベル研究所', materials_designer: 'スプリングフィールド造兵廠', tank_designer: 'クライスラー', aircraft_designer: 'ボーイング', naval_designer: 'ニューポート・ニューズ', motorized_designer: 'フォード', refinery_concern: 'スタンダード・オイル' },
    ENG: { captain_of_industry: 'キングズリー・ウッド', war_industrialist: 'ビーヴァーブルック卿', armaments_organizer: 'レスリー・ホア＝ベリシャ', silent_workhorse: 'ジョン・アンダーソン', backroom_backstabber: 'スチュワート・メンジーズ', popular_figurehead: 'ジョージ6世', prince_of_terror: 'オズワルド・モズレー', ideological_crusader: 'クレメント・アトリー', quartermaster_general: 'ウォルター・ヴェナブルズ', fascist_demagogue: 'オズワルド・モズレー', communist_revolutionary: 'ハリー・ポリット', democratic_reformer: 'アンソニー・イーデン', military_theorist: 'J・F・C・フラー', mobile_warfare_expert: 'パーシー・ホバート', grand_battleplan_expert: 'アラン・ブルック', naval_theorist: 'アンドリュー・カニンガム', air_warfare_theorist: 'ヒュー・ダウディング', nuclear_scientist: 'ジェームズ・チャドウィック', army_chief_offensive: 'バーナード・モントゴメリー', army_chief_defensive: 'エドマンド・アイアンサイド', army_chief_drill: 'ジョン・ゴート', navy_chief: 'ダドリー・パウンド', air_chief: 'チャールズ・ポータル', infantry_expert: 'ウィリアム・スリム', armor_expert: 'リチャード・オコナー', logistics_expert: 'アーチボルド・ウェーヴェル', artillery_expert: 'ハロルド・アレグザンダー', industrial_concern: 'ICI', electronics_concern: 'マルコーニ', materials_designer: 'ヴィッカース', tank_designer: 'ナフィールド', aircraft_designer: 'スーパーマリン', naval_designer: 'ジョン・ブラウン', motorized_designer: 'ベッドフォード', refinery_concern: 'アングロ・ペルシアン石油' },
    FRA: { captain_of_industry: 'ラウル・ドートリー', war_industrialist: 'ルイ・ルノー', armaments_organizer: 'エドゥアール・ダラディエ', silent_workhorse: 'アルベール・ルブラン', backroom_backstabber: 'ピエール・ラヴァル', popular_figurehead: 'レオン・ブルム', prince_of_terror: 'ジャック・ドリオ', ideological_crusader: 'ジョルジュ・マンデル', quartermaster_general: 'シャルル・アンツィジェール', fascist_demagogue: 'シャルル・モーラス', communist_revolutionary: 'モーリス・トレーズ', democratic_reformer: 'ポール・レイノー', military_theorist: 'シャルル・ド・ゴール', mobile_warfare_expert: 'ジャン・ド・ラトル', grand_battleplan_expert: 'モーリス・ガムラン', naval_theorist: 'フランソワ・ダルラン', air_warfare_theorist: 'ジョゼフ・ヴュイユマン', nuclear_scientist: 'フレデリック・ジョリオ＝キュリー', army_chief_offensive: 'アルフォンス・ジョルジュ', army_chief_defensive: 'マクシム・ウェイガン', army_chief_drill: 'フィリップ・ペタン', navy_chief: 'ジャン・ド・ラボルド', air_chief: 'マルセル・テテュ', infantry_expert: 'アンリ・ジロー', armor_expert: 'ジャン・フラヴィニー', logistics_expert: 'ガストン・ビヨット', artillery_expert: 'ルネ・プリウー', industrial_concern: 'シュネデール', electronics_concern: 'トムソン・ウーストン', materials_designer: 'MAS', tank_designer: 'ソミュア', aircraft_designer: 'ドヴォアチン', naval_designer: 'ブレスト工廠', motorized_designer: 'シトロエン', refinery_concern: 'CFP' },
    ITA: { captain_of_industry: 'アルベルト・ベネドゥーチェ', war_industrialist: 'アルベルト・ピレッリ', armaments_organizer: 'カルロ・ファヴァグロッサ', silent_workhorse: 'ガレアッツォ・チャーノ', backroom_backstabber: 'ディーノ・グランディ', popular_figurehead: 'ヴィットーリオ・エマヌエーレ3世', prince_of_terror: 'ロベルト・ファリナッチ', ideological_crusader: 'アキッレ・スタラーチェ', quartermaster_general: 'ウバルド・ソッドゥ', fascist_demagogue: 'ジュゼッペ・ボッタイ', communist_revolutionary: 'パルミーロ・トリアッティ', democratic_reformer: 'アルチーデ・デ・ガスペリ', military_theorist: 'ジューリオ・ドゥーエ', mobile_warfare_expert: 'ジョヴァンニ・メッセ', grand_battleplan_expert: 'ピエトロ・バドリオ', naval_theorist: 'ドメニコ・カヴァニャーリ', air_warfare_theorist: 'イタロ・バルボ', nuclear_scientist: 'エンリコ・フェルミ', army_chief_offensive: 'ロドルフォ・グラツィアーニ', army_chief_defensive: 'アルベルト・パリアーニ', army_chief_drill: 'ウーゴ・カヴァッレーロ', navy_chief: 'イニーゴ・カンピオーニ', air_chief: 'フランチェスコ・プリコロ', infantry_expert: 'マリオ・ロアッタ', armor_expert: 'エットレ・バスティコ', logistics_expert: 'ガストーネ・ガンバラ', artillery_expert: 'アンニバレ・ベルゴンツォーリ', industrial_concern: 'モンテカティーニ', electronics_concern: 'マニェーティ・マレッリ', materials_designer: 'ベレッタ', tank_designer: 'アンサルド', aircraft_designer: 'マッキ', naval_designer: 'OTO', motorized_designer: 'フィアット', refinery_concern: 'AGIP' },
    JAP: { captain_of_industry: '鮎川義介', war_industrialist: '岸信介', armaments_organizer: '石原莞爾', silent_workhorse: '木戸幸一', backroom_backstabber: '東條英機', popular_figurehead: '近衛文麿', prince_of_terror: '甘粕正彦', ideological_crusader: '大川周明', quartermaster_general: '東條英機', fascist_demagogue: '北一輝', communist_revolutionary: '野坂参三', democratic_reformer: '幣原喜重郎', military_theorist: '石原莞爾', mobile_warfare_expert: '山下奉文', grand_battleplan_expert: '杉山元', naval_theorist: '山本五十六', air_warfare_theorist: '源田実', nuclear_scientist: '仁科芳雄', army_chief_offensive: '寺内寿一', army_chief_defensive: '畑俊六', army_chief_drill: '梅津美治郎', navy_chief: '永野修身', air_chief: '東久邇宮稔彦王', infantry_expert: '今村均', armor_expert: '山下奉文', logistics_expert: '阿南惟幾', artillery_expert: '本間雅晴', industrial_concern: '三井', electronics_concern: '日本電気', materials_designer: '日本製鋼所', tank_designer: '三菱重工業', aircraft_designer: '中島飛行機', naval_designer: '呉海軍工廠', motorized_designer: 'トヨタ自動車', refinery_concern: '日本石油' },
  };
  static displayName(cand) { const n = PoliticsSystem.NAMES[CoreEngine.gameState.country]?.[cand.id]; return n ? n : cand.name; }
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static ideology() { return typeof WarGoals !== 'undefined' ? WarGoals.ideology() : (CoreEngine.gameState.ideology || 'neutrality'); }

  // ------------------------------------------------------------------
  // 初期化・状態
  // ------------------------------------------------------------------
  static init() {
    if (PoliticsSystem.installed) return;
    PoliticsSystem.installed = true;
    PoliticsSystem.ensureState();
    PoliticsSystem.installHooks();
    const tpl = document.getElementById('tpl-politics');
    if (tpl && tpl.dataset) { tpl.dataset.w = '1180'; tpl.dataset.h = '780'; tpl.dataset.title = '🏛️ 政治 — Politics, Laws & Advisors'; }
    CoreEngine.registerTickCallback(() => PoliticsSystem.onTick());
    CoreEngine.log('🏛️ 政治・法案・内閣システムが有効になりました。');
  }
  static ensureState() {
    const s = CoreEngine.gameState; if (!s) return null;
    s.laws ||= {};
    s.laws.conscription ||= 'volunteer'; s.laws.economy ||= 'civilian'; s.laws.trade ||= 'export';
    s.cabinet ||= {};
    if (!s.parties) {
      const rul = PoliticsSystem.ideology();
      s.parties = { fascism: 8, communism: 8, democracy: 8, neutrality: 8 };
      s.parties[rul] = 76;
    }
    return s;
  }
  static installHooks() {
    // 法律テーブルを拡張 (既存 id は維持)
    if (typeof PoliticsManager !== 'undefined' && !PoliticsManager._cabinetHooked) {
      PoliticsManager._cabinetHooked = true;
      PoliticsManager.LAWS.conscription = PoliticsSystem.LAWS.conscription.list;
      PoliticsManager.LAWS.economy = PoliticsSystem.LAWS.economy.list;
      PoliticsManager.LAWS.trade = PoliticsSystem.LAWS.trade.list;
      const origCur = PoliticsManager.currentLaw.bind(PoliticsManager);
      PoliticsManager.currentLaw = (kind) => {
        const law = origCur(kind);
        if (kind !== 'economy' || !law) return law;
        // 工場出力: 経済法 + 顧問・企業・貿易法・徴兵令の補正を合算
        const extra = PoliticsSystem.modifiers(['economy']).factoryOutput || 0;
        return { ...law, factoryOutput: (law.factoryOutput || 0) + extra };
      };
      PoliticsManager.dailyManpowerGain = () => { const law = origCur('conscription'); return Math.max(0, (law?.mpPerDay || 0) * (1 + (PoliticsSystem.modifiers().manpower || 0))); };
      PoliticsManager.enactLaw = (kind) => { const next = PoliticsManager.nextLaw(kind); if (next) PoliticsSystem.enact(kind, next.id); };
      PoliticsManager.render = () => PoliticsSystem.render();
    }
    // 政治力獲得
    if (typeof CoreEngine.accruePoliticalPowerHour === 'function' && !CoreEngine._cabinetHooked) {
      CoreEngine._cabinetHooked = true;
      const orig = CoreEngine.accruePoliticalPowerHour.bind(CoreEngine);
      CoreEngine.accruePoliticalPowerHour = () => { orig(); const g = PoliticsSystem.modifiers().ppGain || 0; if (g) CoreEngine.addPoliticalPower((1 + (Number(CoreEngine.gameState.cardModifiers?.politicalPowerGain) || 0)) * g / 24); };
    }
    // 研究速度
    if (typeof ResearchManager !== 'undefined' && !ResearchManager._cabinetHooked) {
      ResearchManager._cabinetHooked = true;
      const orig = ResearchManager.onTick.bind(ResearchManager);
      ResearchManager.onTick = () => { const r = PoliticsSystem.modifiers().research || 0; if (r) Object.values(ResearchManager.researching || {}).forEach(x => { x.progress += r; }); orig(); };
    }
    // 建設速度 (民需系 / 軍需系)
    if (typeof ConstructionManager !== 'undefined' && !ConstructionManager._cabinetHooked) {
      ConstructionManager._cabinetHooked = true;
      const orig = ConstructionManager.onTick.bind(ConstructionManager);
      ConstructionManager.onTick = () => {
        const q = ConstructionManager.queue?.[0]; const before = q ? q.progress || 0 : 0;
        orig();
        if (q && ConstructionManager.queue?.[0] === q) { const d = (q.progress || 0) - before; if (d > 0) { const b = PoliticsSystem.constructionBonus(q.building); if (b) q.progress += d * b; } }
      };
    }
    // 師団攻撃力・防御力
    if (typeof BattleManager !== 'undefined' && !BattleManager._cabinetHooked) {
      BattleManager._cabinetHooked = true;
      const oa = BattleManager.attackProfile.bind(BattleManager);
      BattleManager.attackProfile = (army) => { const p = oa(army); const m = 1 + (PoliticsSystem.modifiers().attack || 0); return { ...p, soft: p.soft * m, hard: p.hard * m }; };
      if (typeof BattleManager.defenseProfile === 'function') {
        const od = BattleManager.defenseProfile.bind(BattleManager);
        BattleManager.defenseProfile = (st) => { const p = od(st); const m = 1 + (PoliticsSystem.modifiers().defense || 0); return p && typeof p === 'object' ? { ...p, defense: (p.defense || 0) * m } : p; };
      }
    }
  }
  static constructionBonus(building) {
    const m = PoliticsSystem.modifiers();
    const mil = /arms_factory|dockyard|air_base|fort|anti_air|radar|rocket|nuclear/.test(String(building));
    return (m.construction || 0) + (mil ? (m.milConstruction || 0) : (m.civConstruction || 0));
  }
  /** 現在の全補正を集計 (exclude: 'economy' 等、除外する法律種別) */
  static modifiers(exclude = []) {
    const s = PoliticsSystem.ensureState(); const out = {};
    if (!s) return out;
    const add = (mods) => Object.entries(mods || {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
    Object.entries(PoliticsSystem.LAWS).forEach(([kind, def]) => { if (exclude.includes(kind)) return; const law = def.list.find(l => l.id === s.laws[kind]); if (law) add(law.mods); });
    PoliticsSystem.appointed().forEach(c => add(c.mods));
    return out;
  }
  static appointed() {
    const s = PoliticsSystem.ensureState(); const list = [];
    PoliticsSystem.SLOT_GROUPS.forEach(g => { for (let i = 0; i < g.slots; i++) { const id = s.cabinet[g.id + i]; const c = id && PoliticsSystem[g.pool].find(x => x.id === id); if (c) list.push(c); } });
    return list;
  }
  static currentLaw(kind) { const s = PoliticsSystem.ensureState(); return PoliticsSystem.LAWS[kind].list.find(l => l.id === s.laws[kind]) || PoliticsSystem.LAWS[kind].list[0]; }
  static partyShare(id) { return Number(PoliticsSystem.ensureState().parties[id]) || 0; }

  // ------------------------------------------------------------------
  // 法案の施行
  // ------------------------------------------------------------------
  static lawBlocker(kind, law) {
    const s = CoreEngine.gameState;
    if (law.wsReq && s.warSupport < law.wsReq) return '戦争協力度 ' + law.wsReq + '% 以上が必要';
    if (law.atWar && !(s.atWar || []).length) return '戦時中のみ施行可能';
    if (typeof law.req === 'function') { const r = law.req(s); if (r) return r; }
    return null;
  }
  static enact(kind, id) {
    const s = PoliticsSystem.ensureState(); const def = PoliticsSystem.LAWS[kind]; const law = def.list.find(l => l.id === id);
    if (!law || s.laws[kind] === id) return false;
    const cur = PoliticsSystem.currentLaw(kind);
    const block = PoliticsSystem.lawBlocker(kind, law);
    if (block) { GameUI.notify('施行できません: ' + block, 'alert'); return false; }
    if (s.politicalPower < law.cost) { GameUI.notify('政治力が不足しています (必要 ' + law.cost + ')。', 'alert'); return false; }
    s.politicalPower -= law.cost;
    PoliticsSystem.applyFlat(cur.mods, -1); PoliticsSystem.applyFlat(law.mods, +1);
    s.laws[kind] = id;
    if (kind === 'trade' && typeof TradeSystem !== 'undefined') { (s.strategy ||= {}).exportPolicy = law.policy; }
    CoreEngine.log('📜 ' + def.name + 'を「' + law.name + '」に変更しました。');
    GameUI.notify('📜 ' + def.name + ': ' + law.name, 'success');
    if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'law_change', kind, law: id });
    PoliticsSystem.afterChange();
    return true;
  }
  /** 安定度・戦争協力度などの固定値補正は変更時に即時反映 */
  static applyFlat(mods, sign) {
    const s = CoreEngine.gameState;
    if (!mods) return;
    if (mods.stabilityFlat) s.stability = Math.max(0, Math.min(100, s.stability + mods.stabilityFlat * sign));
    if (mods.warSupportFlat) s.warSupport = Math.max(0, Math.min(100, s.warSupport + mods.warSupportFlat * sign));
  }
  static afterChange() {
    GameUI.closeModal?.();
    if (typeof CoreEngine.renderStats === 'function') CoreEngine.renderStats();
    PoliticsSystem.render();
  }

  // ------------------------------------------------------------------
  // 任命・解任
  // ------------------------------------------------------------------
  static appoint(slotKey, id) {
    const s = PoliticsSystem.ensureState();
    const g = PoliticsSystem.SLOT_GROUPS.find(x => slotKey.startsWith(x.id)); if (!g) return false;
    const cand = PoliticsSystem[g.pool].find(x => x.id === id); if (!cand) return false;
    if (Object.values(s.cabinet).includes(id)) { GameUI.notify('既に任命されています。', 'alert'); return false; }
    const block = typeof cand.req === 'function' ? cand.req(s) : null;
    if (block) { GameUI.notify('任命できません: ' + block, 'alert'); return false; }
    const cost = g.cost;
    if (s.politicalPower < cost) { GameUI.notify('政治力が不足しています (必要 ' + cost + ')。', 'alert'); return false; }
    const prev = s.cabinet[slotKey] && PoliticsSystem[g.pool].find(x => x.id === s.cabinet[slotKey]);
    if (prev) PoliticsSystem.applyFlat(prev.mods, -1);
    s.politicalPower -= cost;
    s.cabinet[slotKey] = id;
    PoliticsSystem.applyFlat(cand.mods, +1);
    CoreEngine.log('🎩 ' + g.name + 'に ' + PoliticsSystem.displayName(cand) + ' (' + cand.name + ') を任命しました。');
    GameUI.notify('🎩 任命: ' + PoliticsSystem.displayName(cand) + ' — ' + cand.desc, 'success');
    PoliticsSystem.afterChange();
    return true;
  }
  static dismiss(slotKey) {
    const s = PoliticsSystem.ensureState();
    const g = PoliticsSystem.SLOT_GROUPS.find(x => slotKey.startsWith(x.id)); if (!g) return;
    const prev = s.cabinet[slotKey] && PoliticsSystem[g.pool].find(x => x.id === s.cabinet[slotKey]);
    if (!prev) return;
    PoliticsSystem.applyFlat(prev.mods, -1);
    delete s.cabinet[slotKey];
    CoreEngine.log('🎩 ' + PoliticsSystem.displayName(prev) + ' を解任しました。');
    PoliticsSystem.afterChange();
  }
  /** 政権交代: 支持率 50% 超の政党へ (PP 100) */
  static changeGovernment(id) {
    const s = PoliticsSystem.ensureState();
    if (PoliticsSystem.partyShare(id) <= 50) { GameUI.notify('支持率 50% 超の政党のみ政権を取れます。', 'alert'); return; }
    if (s.politicalPower < 100) { GameUI.notify('政治力 100 が必要です。', 'alert'); return; }
    s.politicalPower -= 100; s.ideology = id;
    if (typeof WarGoals !== 'undefined') WarGoals.IDEOLOGY[s.country] = id;
    s.stability = Math.max(0, s.stability - 10);
    CoreEngine.log('🗳️ 政権交代: ' + PoliticsSystem.PARTIES[id].name + ' が政権を獲得しました。');
    GameUI.notify('🗳️ ' + PoliticsSystem.PARTIES[id].name + ' 政権が成立しました (安定度 −10%)', 'success');
    PoliticsSystem.afterChange();
  }

  // ------------------------------------------------------------------
  // 毎日: 支持率ドリフト
  // ------------------------------------------------------------------
  static onTick() {
    const s = PoliticsSystem.ensureState(); if (!s) return;
    const day = typeof GameTools !== 'undefined' ? GameTools.day() : 0;
    if (s._cabinetDay === day) return; s._cabinetDay = day;
    const m = PoliticsSystem.modifiers(), p = s.parties, rul = PoliticsSystem.ideology();
    const drift = { fascism: m.driftFascism || 0, communism: m.driftCommunism || 0, democracy: m.driftDemocracy || 0, neutrality: m.driftNeutrality || 0 };
    drift[rul] += 0.03;                                                     // 与党は緩やかに支持を固める
    if (s.stability < 40) drift[rul] -= 0.1;                                // 低安定度は与党離れ
    if ((s.atWar || []).length && s.warSupport < 30) drift[rul] -= 0.05;
    Object.keys(p).forEach(k => { p[k] = Math.max(0, p[k] + drift[k]); });
    const total = Object.values(p).reduce((a, b) => a + b, 0) || 1;
    Object.keys(p).forEach(k => { p[k] = p[k] / total * 100; });
    if (typeof WindowManager !== 'undefined' && WindowManager.windows?.get('politics')) PoliticsSystem.render();
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  static modsText(mods) {
    return Object.entries(mods || {}).filter(([, v]) => v).map(([k, v]) => { const flat = PoliticsSystem.FLAT.has(k); const val = flat ? (v > 0 ? '+' : '') + v + (k.startsWith('drift') ? '%' : '%') : (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; return '<span class="pl-mod ' + (v > 0 ? 'up' : 'down') + '">' + (PoliticsSystem.MOD_LABELS[k] || k) + ' ' + val + '</span>'; }).join('');
  }
  static pie() {
    const p = PoliticsSystem.ensureState().parties; let acc = 0; const stops = [];
    Object.entries(PoliticsSystem.PARTIES).forEach(([k, d]) => { const v = p[k] || 0; stops.push(d.color + ' ' + acc + '% ' + (acc + v) + '%'); acc += v; });
    return '<div class="pl-pie" style="background:conic-gradient(' + stops.join(',') + ')"><div class="pl-pie-hole"><b>' + Math.round(p[PoliticsSystem.ideology()] || 0) + '%</b><small>与党</small></div></div>';
  }
  static render() {
    const el = document.getElementById('politics-content'); if (!el) return;
    const s = PoliticsSystem.ensureState(); const m = PoliticsSystem.modifiers(); const rul = PoliticsSystem.ideology();
    const nation = typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(s.country) : s.country;
    const flag = typeof DataFetcher !== 'undefined' && DataFetcher.getCountryFlagImage ? DataFetcher.getCountryFlagImage(s.country) : '';
    const ppGain = (1 + (Number(s.cardModifiers?.politicalPowerGain) || 0)) * (1 + (m.ppGain || 0));
    // ---- 上部: 国家基本情報 ----
    let html = '<div class="pl-root"><div class="pl-head"><div class="pl-flag">' + flag + '</div><div class="pl-title"><h3>' + PoliticsSystem.esc(nation) + ' <small>' + PoliticsSystem.PARTIES[rul].name + '政権</small></h3><p>政治力を使って法案を施行し、閣僚や企業を任命して国家全体に補正を適用します。</p></div>' +
      '<div class="pl-stats"><div class="pl-stat"><small>政治力</small><b>' + Math.floor(s.politicalPower) + '</b><span>+' + ppGain.toFixed(2) + ' /日</span></div>' +
      '<div class="pl-stat"><small>安定度</small><b>' + Math.round(s.stability) + '%</b><div class="pl-bar"><em style="width:' + Math.round(s.stability) + '%;background:#7fc46a"></em></div></div>' +
      '<div class="pl-stat"><small>戦争協力度</small><b>' + Math.round(s.warSupport) + '%</b><div class="pl-bar"><em style="width:' + Math.round(s.warSupport) + '%;background:#e04a3c"></em></div></div></div>' +
      '<div class="pl-parties">' + PoliticsSystem.pie() + '<div class="pl-legend">' + Object.entries(PoliticsSystem.PARTIES).map(([k, d]) => '<div class="pl-leg' + (k === rul ? ' rul' : '') + '"><i style="background:' + d.color + '"></i>' + d.name + ' <b>' + (s.parties[k] || 0).toFixed(1) + '%</b>' + (k !== rul && s.parties[k] > 50 ? '<button class="pl-btn small" onclick="PoliticsSystem.changeGovernment(\'' + k + '\')">政権交代 (PP100)</button>' : '') + '</div>').join('') + '</div></div></div>';
    // ---- 有効な補正 ----
    const modList = Object.entries(m).filter(([, v]) => v);
    html += '<div class="pl-section"><h4>📊 国家補正 (有効中)</h4><div class="pl-modsum">' + (modList.length ? PoliticsSystem.modsText(m) : '<span class="sn-help">補正なし</span>') + '</div></div>';
    // ---- 中央: 3大法案 ----
    html += '<div class="pl-section"><h4>📜 法案</h4><div class="pl-laws">' + Object.entries(PoliticsSystem.LAWS).map(([kind, def]) => { const cur = PoliticsSystem.currentLaw(kind); return '<div class="pl-law" onclick="PoliticsSystem.openLawModal(\'' + kind + '\')"><div class="pl-law-ic">' + def.icon + '</div><div class="pl-law-body"><small>' + def.name + '</small><b>' + cur.name + '</b><span>' + PoliticsSystem.esc(cur.note || '') + '</span><div>' + PoliticsSystem.modsText(cur.mods) + '</div></div><div class="pl-law-cta">変更 ▸</div></div>'; }).join('') + '</div></div>';
    // ---- 下部: 閣僚・企業スロット ----
    html += '<div class="pl-section"><h4>🎩 閣僚・企業</h4><div class="pl-groups">' + PoliticsSystem.SLOT_GROUPS.map(g => {
      let slots = '';
      for (let i = 0; i < g.slots; i++) { const key = g.id + i; const id = s.cabinet[key]; const c = id && PoliticsSystem[g.pool].find(x => x.id === id);
        slots += c ? '<div class="pl-slot filled" onclick="PoliticsSystem.openSlotModal(\'' + key + '\')"><div class="pl-avatar">' + c.icon + '</div><b>' + PoliticsSystem.esc(PoliticsSystem.displayName(c)) + '</b><small>' + c.name + '</small><div>' + PoliticsSystem.modsText(c.mods) + '</div></div>'
                   : '<div class="pl-slot empty" onclick="PoliticsSystem.openSlotModal(\'' + key + '\')"><div class="pl-avatar">＋</div><b>空席</b><small>' + g.name + ' を任命 (PP' + g.cost + ')</small></div>'; }
      return '<div class="pl-group"><h5>' + g.icon + ' ' + g.name + ' <small>' + g.slots + ' 枠</small></h5><div class="pl-slots">' + slots + '</div></div>'; }).join('') + '</div></div>';
    // ---- 既存の国家精神・指導者カード ----
    if (typeof CardSystem !== 'undefined' && (CardSystem.hiredCards || []).length) {
      html += '<div class="pl-section"><h4>👤 配備中の指導者カード</h4><div class="pl-leaders">' + CardSystem.hiredCards.map(c => { const ab = CardSystem.ABILITIES?.[c.id] || CardSystem.DEFAULT_GENERAL_ABILITY; return '<div class="pl-leader"><b>' + PoliticsSystem.esc(c.name || c.id) + '</b><small>' + (ab ? PoliticsSystem.esc(ab.name) + ' — ' + PoliticsSystem.esc(ab.desc) : '') + '</small></div>'; }).join('') + '</div></div>';
    }
    const spirits = [];
    const ns = s.nationSystems || {};
    if (ns.mefoIssued) spirits.push(['MEFO手形 (有効)', '建設コスト −20%・特別研究促進']);
    if (ns.paranoia !== undefined) spirits.push(['スターリンのパラノイア (' + Math.round(ns.paranoia) + ')', '高まると将軍カードが粛清されるリスク']);
    if (ns.armyInfluence !== undefined) spirits.push(['陸海軍の対立 (陸軍 ' + Math.round(ns.armyInfluence) + ')', '陸海軍の影響力バランスが補正に影響']);
    if (ns.congressDem !== undefined) spirits.push(['連邦議会 (与党 ' + Math.round(ns.congressDem) + '議席)', '議会多数派で安定度ボーナス']);
    if ((s.atWar || []).length) spirits.push(['戦時中 (' + s.atWar.join(', ') + ')', '戦争協力度ボーナス・経済ペナルティ']);
    html += '<div class="pl-section"><h4>🌠 国家精神</h4>' + (spirits.length ? spirits.map(([n, d]) => '<span class="politics-spirit" title="' + PoliticsSystem.esc(d) + '"><b style="color:var(--text-gold)">' + PoliticsSystem.esc(n) + '</b><br><span style="color:var(--text-secondary)">' + PoliticsSystem.esc(d) + '</span></span>').join('') : '<span class="politics-spirit">精神的安定 — ペナルティ/ボーナスなし</span>') + '</div></div>';
    el.innerHTML = html;
  }
  static openLawModal(kind) {
    const s = PoliticsSystem.ensureState(); const def = PoliticsSystem.LAWS[kind]; const cur = PoliticsSystem.currentLaw(kind);
    const html = '<div class="pl-modal"><p class="pl-modal-desc">' + def.desc + ' 現在: <b>' + cur.name + '</b> ／ 政治力 <b>' + Math.floor(s.politicalPower) + '</b></p><div class="pl-options">' + def.list.map(l => {
      const active = l.id === cur.id; const block = active ? null : PoliticsSystem.lawBlocker(kind, l); const can = !active && !block && s.politicalPower >= l.cost;
      return '<div class="pl-opt' + (active ? ' active' : '') + (block ? ' locked' : '') + '"><div class="pl-opt-ic">' + def.icon + '</div><div class="pl-opt-body"><b>' + l.name + (active ? ' <em>施行中</em>' : '') + '</b><small>' + PoliticsSystem.esc(l.note || '') + '</small><div>' + PoliticsSystem.modsText(l.mods) + (kind === 'conscription' ? '<span class="pl-mod">人的資源 +' + l.mpPerDay + '/日</span>' : '') + '</div>' + (block ? '<span class="pl-req">🔒 ' + PoliticsSystem.esc(block) + '</span>' : (l.wsReq ? '<span class="pl-req ok">前提: 戦争協力度 ' + l.wsReq + '%' + (l.atWar ? '・戦時中' : '') + '</span>' : '')) + '</div>' +
        '<button class="pl-btn' + (can ? ' primary' : '') + '" ' + (can ? '' : 'disabled') + ' onclick="PoliticsSystem.enact(\'' + kind + '\',\'' + l.id + '\')">' + (active ? '施行中' : '施行 (PP' + l.cost + ')') + '</button></div>'; }).join('') + '</div></div>';
    GameUI.openModal(def.icon + ' ' + def.name, html);
  }
  static openSlotModal(slotKey) {
    const s = PoliticsSystem.ensureState(); const g = PoliticsSystem.SLOT_GROUPS.find(x => slotKey.startsWith(x.id)); if (!g) return;
    const curId = s.cabinet[slotKey]; const used = Object.values(s.cabinet);
    const html = '<div class="pl-modal"><p class="pl-modal-desc">' + g.name + ' — 任命には政治力 <b>' + g.cost + '</b> が必要です (所持 ' + Math.floor(s.politicalPower) + ')。' + (curId ? ' <button class="pl-btn small danger" onclick="PoliticsSystem.dismiss(\'' + slotKey + '\')">現在の人物を解任</button>' : '') + '</p><div class="pl-options">' + PoliticsSystem[g.pool].map(c => {
      const active = c.id === curId; const elsewhere = !active && used.includes(c.id); const block = active ? null : elsewhere ? '他のスロットで任命中' : (typeof c.req === 'function' ? c.req(s) : null); const can = !active && !block && s.politicalPower >= g.cost;
      return '<div class="pl-opt' + (active ? ' active' : '') + (block ? ' locked' : '') + '"><div class="pl-opt-ic">' + c.icon + '</div><div class="pl-opt-body"><b>' + PoliticsSystem.esc(PoliticsSystem.displayName(c)) + (active ? ' <em>任命中</em>' : '') + '</b><small>' + c.name + ' — ' + PoliticsSystem.esc(c.desc) + '</small><div>' + PoliticsSystem.modsText(c.mods) + '</div>' + (block ? '<span class="pl-req">🔒 ' + PoliticsSystem.esc(block) + '</span>' : '') + '</div>' +
        '<button class="pl-btn' + (can ? ' primary' : '') + '" ' + (can ? '' : 'disabled') + ' onclick="PoliticsSystem.appoint(\'' + slotKey + '\',\'' + c.id + '\')">' + (active ? '任命中' : '任命 (PP' + g.cost + ')') + '</button></div>'; }).join('') + '</div></div>';
    GameUI.openModal(g.icon + ' ' + g.name + ' — 任命', html);
  }
}
if (typeof window !== 'undefined') window.PoliticsSystem = PoliticsSystem;
