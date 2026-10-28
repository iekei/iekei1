/* superweapons.js — HOI4風「特殊計画 (Special Projects)・核開発・ミサイル」
 *
 *  - 研究 → 特殊計画: 基礎研究 (原子物理学 / ロケット工学 / ジェットエンジン) を研究しただけでは使えない。
 *    特殊計画画面で科学者を割り当て、民需工場 (IC) と人的資源を投資して 100% まで進めると実用化技術が解禁される
 *  - 備蓄: 「原子爆弾」完了後、原子炉 (州建物・レベルごと) から核兵器が、「V2ロケット」完了後、ロケット発射施設から
 *    ロケットが自動生産される。上部バーに ☢️ / 🚀 の備蓄を常時表示
 *  - 核攻撃: 制空権 75% 以上・戦略爆撃機 (またはジェット爆撃機) の配備・核備蓄 1 以上。全画面フラッシュ＋キノコ雲、
 *    州の建物を全破壊・州内師団の組織率/充足を 90% カット・対象国の戦争協力度を大幅低下
 *  - ミサイル攻撃: 発射施設の射程内の敵州へ継続爆撃 (毎日ロケットを消費し、インフラ・要塞・師団に損害)
 */
class SuperWeapons {
  static PROJECTS = {
    uranium:  { id: 'uranium',  name: 'ウラン濃縮計画',   icon: '⚛️', img: 'Sp_commercial_nuclear_reactor.png', points: 900,  manpower: 20000, tech: /atomic|nuclear|uranium/i, techName: '原子物理学 (atomic_research)', requires: null,      desc: '原子炉の建設を可能にする。核開発の第一歩。', unlocks: '原子炉の建設' },
    atomic:   { id: 'atomic',   name: '原子爆弾',         icon: '☢️', img: 'Sp_air_earthshaker_bomb.png', points: 1600, manpower: 30000, tech: /atomic|nuclear/i,         techName: '原子物理学',           requires: 'uranium', desc: '原子炉から核兵器を生産できるようになる。', unlocks: '核兵器の生産 (原子炉 Lv1 ごとに 50 日に 1 発)' },
    v2:       { id: 'v2',       name: 'V2ロケット開発',   icon: '🚀', img: 'Sp_naval_nuclear_missile_submarine.png', points: 700,  manpower: 10000, tech: /rocket/i,                 techName: 'ロケット工学 (experimental_rockets)', requires: null,  desc: 'ロケット発射施設の建設と長距離ロケットの生産を解禁。', unlocks: 'ロケット発射施設・ロケット生産 (施設 Lv1 ごとに 0.5 発/日)' },
    ballistic:{ id: 'ballistic', name: '弾道ミサイル',     icon: '🛰️', img: 'Sp_air_intercontinental_bomber.png', points: 1300, manpower: 15000, tech: /rocket/i,                 techName: 'ロケット工学',          requires: 'v2',      desc: '射程 2 倍・威力 1.5 倍のミサイル。核弾頭の搭載も可能に。', unlocks: 'ミサイル射程×2・威力×1.5' },
    jet:      { id: 'jet',      name: 'ジェットエンジン実用化', icon: '✈️', img: 'Sp_air_jet_engine.png', points: 800, manpower: 8000, tech: /jet/i,                 techName: 'ジェットエンジン (sp_centrifugal_jet_tech)', requires: null, desc: 'ジェット爆撃機が核の運搬手段として使用可能になり、戦略爆撃機 +20。', unlocks: 'ジェット爆撃機 (核攻撃の適格機)・戦略爆撃機 +20' },
  };
  static IMG = 'assets/special_projects/';
  static PORTRAIT = 'assets/scientists/';
  /** 科学者の名簿 (game/assets/scientists に肖像があるもののみ)。field: nuclear / rocket / jet / general */
  static ROSTER = [
    // ドイツ
    { id: 'werner_heisenberg', tag: 'GER', file: 'Portrait_GER_werner_heisenberg.png', name: 'ヴェルナー・ハイゼンベルク', title: '理論物理学者', field: 'nuclear', skill: 1.7 },
    { id: 'manfred_von_ardenne', tag: 'GER', file: 'Portrait_GER_manfred_von_ardenne.png', name: 'マンフレート・フォン・アルデンネ', title: '応用物理学者', field: 'nuclear', skill: 1.3 },
    { id: 'gustav_ludwig_hertz', tag: 'GER', file: 'Portrait_GER_gustav_ludwig_hertz.png', name: 'グスタフ・ヘルツ', title: '原子物理学者', field: 'nuclear', skill: 1.4 },
    { id: 'peter_adolf_thiessen', tag: 'GER', file: 'Portrait_GER_peter_adolf_thiessen.png', name: 'ペーター・ティーセン', title: '物理化学者', field: 'nuclear', skill: 1.2 },
    { id: 'wernher_von_braun', tag: 'GER', file: 'Portrait_GER_wernher_von_braun.png', name: 'ヴェルナー・フォン・ブラウン', title: 'ロケット技師', field: 'rocket', skill: 1.8 },
    { id: 'hellmuth_walter', tag: 'GER', file: 'Portrait_GER_hellmuth_walter.png', name: 'ヘルムート・ヴァルター', title: 'ロケット推進技師', field: 'rocket', skill: 1.4 },
    { id: 'max_kramer', tag: 'GER', file: 'Portrait_GER_max_kramer.png', name: 'マックス・クラマー', title: '誘導兵器技師', field: 'rocket', skill: 1.3 },
    { id: 'karl_heinrich_emil_becker', tag: 'GER', file: 'Portrait_GER_karl_heinrich_emil_becker.png', name: 'カール・ベッカー', title: '兵器局長', field: 'rocket', skill: 1.2 },
    { id: 'hans_von_ohain', tag: 'GER', file: 'Portrait_GER_hans_von_ohain.png', name: 'ハンス・フォン・オハイン', title: 'ジェットエンジン技師', field: 'jet', skill: 1.7 },
    { id: 'kurt_tank', tag: 'GER', file: 'Portrait_GER_kurt_tank.png', name: 'クルト・タンク', title: '航空機設計者', field: 'jet', skill: 1.4 },
    { id: 'henrich_focke', tag: 'GER', file: 'Portrait_GER_henrich_focke.png', name: 'ハインリヒ・フォッケ', title: '航空機設計者', field: 'jet', skill: 1.2 },
    { id: 'konrad_zuse', tag: 'GER', file: 'Portrait_GER_konrad_zuse.png', name: 'コンラート・ツーゼ', title: '計算機技術者', field: 'general', skill: 1.1 },
    // アメリカ
    { id: 'robert_oppenheimer', tag: 'USA', file: 'portrait_USA_robert_oppenheimer.png', name: 'ロバート・オッペンハイマー', title: '理論物理学者', field: 'nuclear', skill: 1.8 },
    { id: 'vannevar_bush', tag: 'USA', file: 'portrait_USA_vannevar_bush.png', name: 'ヴァネヴァー・ブッシュ', title: '科学研究開発局長', field: 'general', skill: 1.3 },
    { id: 'robert_goddard', tag: 'USA', file: 'portrait_USA_robert_goddard.png', name: 'ロバート・ゴダード', title: 'ロケット工学者', field: 'rocket', skill: 1.6 },
    { id: 'leslie_skinner', tag: 'USA', file: 'portrait_USA_leslie_skinner.png', name: 'レスリー・スキナー', title: 'ロケット兵器技師', field: 'rocket', skill: 1.2 },
    { id: 'edward_curtis_wells', tag: 'USA', file: 'portrait_USA_edward_curtis_wells.png', name: 'エドワード・ウェルズ', title: '航空機設計者', field: 'jet', skill: 1.4 },
    { id: 'andrew_mckee', tag: 'USA', file: 'portrait_USA_andrew_mckee.png', name: 'アンドリュー・マッキー', title: '造船技師', field: 'general', skill: 1.0 },
    // ソ連
    { id: 'igor_kurchatov', tag: 'SOV', file: 'portrait_SOV_igor_kurchatov.png', name: 'イーゴリ・クルチャトフ', title: '核物理学者', field: 'nuclear', skill: 1.7 },
    { id: 'abram_ioffe', tag: 'SOV', file: 'portrait_SOV_abram_ioffe.png', name: 'アブラム・ヨッフェ', title: '物理学者', field: 'nuclear', skill: 1.3 },
    { id: 'sergei_korolev', tag: 'SOV', file: 'portrait_SOV_sergei_korolev.png', name: 'セルゲイ・コロリョフ', title: 'ロケット設計主任', field: 'rocket', skill: 1.8 },
    { id: 'boris_stechkin', tag: 'SOV', file: 'portrait_SOV_boris_stechkin.png', name: 'ボリス・ステチキン', title: 'エンジン工学者', field: 'jet', skill: 1.5 },
    { id: 'arkady_nazarov', tag: 'SOV', file: 'portrait_SOV_arkady_nazarov.png', name: 'アルカージー・ナザロフ', title: '航空技師', field: 'jet', skill: 1.1 },
    { id: 'vladimir_kotelnikov', tag: 'SOV', file: 'portrait_SOV_vladimir_kotelnikov.png', name: 'ウラジーミル・コテルニコフ', title: '通信工学者', field: 'general', skill: 1.1 },
    // イギリス
    { id: 'james_chadwick', tag: 'ENG', file: 'Portrait_ENG_james_chadwick.png', name: 'ジェームズ・チャドウィック', title: '核物理学者', field: 'nuclear', skill: 1.7 },
    { id: 'john_cockcroft', tag: 'ENG', file: 'Portrait_ENG_john_cockcroft.png', name: 'ジョン・コッククロフト', title: '原子核物理学者', field: 'nuclear', skill: 1.5 },
    { id: 'frank_whittle', tag: 'ENG', file: 'Portrait_ENG_frank_whittle.png', name: 'フランク・ホイットル', title: 'ジェットエンジン発明者', field: 'jet', skill: 1.8 },
    { id: 'nevil_shute', tag: 'ENG', file: 'Portrait_ENG_nevil_shute.png', name: 'ネビル・シュート', title: '航空技師', field: 'rocket', skill: 1.2 },
    { id: 'robert_watson_watt', tag: 'ENG', file: 'Portrait_ENG_robert_watson_watt.png', name: 'ロバート・ワトソン＝ワット', title: 'レーダー工学者', field: 'general', skill: 1.2 },
    { id: 'charles_goodeve', tag: 'ENG', file: 'Portrait_ENG_charles_goodeve.png', name: 'チャールズ・グッドイヴ', title: '化学者', field: 'general', skill: 1.1 },
    // フランス
    { id: 'frederic_joliot_curie', tag: 'FRA', file: 'Portrait_FRA_frederic_joliot_curie.png', name: 'フレデリック・ジョリオ＝キュリー', title: '核物理学者', field: 'nuclear', skill: 1.7 },
    { id: 'irene_joliot_curie', tag: 'FRA', file: 'Portrait_FRA_irene_joliot_curie.png', name: 'イレーヌ・ジョリオ＝キュリー', title: '放射化学者', field: 'nuclear', skill: 1.5 },
    { id: 'henri_edmond_fouche', tag: 'FRA', file: 'Portrait_FRA_henri_edmond_fouche.png', name: 'アンリ・フーシェ', title: '推進工学者', field: 'rocket', skill: 1.2 },
    { id: 'francois_hussenot', tag: 'FRA', file: 'Portrait_FRA_francois_hussenot.png', name: 'フランソワ・ユスノ', title: '航空技師', field: 'jet', skill: 1.2 },
    { id: 'joseph_bethenod', tag: 'FRA', file: 'Portrait_FRA_joseph_bethenod.png', name: 'ジョゼフ・ベトノ', title: '電気工学者', field: 'general', skill: 1.1 },
    { id: 'louis_renault', tag: 'FRA', file: 'Portrait_FRA_louis_renault.png', name: 'ルイ・ルノー', title: '実業家・技術者', field: 'general', skill: 1.0 },
    // イタリア
    { id: 'enrico_fermi', tag: 'ITA', file: 'Portrait_ITA_enrico_fermi.png', name: 'エンリコ・フェルミ', title: '核物理学者', field: 'nuclear', skill: 1.8 },
    { id: 'gaetano_crocco', tag: 'ITA', file: 'Portrait_ITA_gaetano_crocco.png', name: 'ガエターノ・クロッコ', title: 'ロケット・航空工学者', field: 'rocket', skill: 1.5 },
    { id: 'mario_castoldi', tag: 'ITA', file: 'Portrait_ITA_mario_castoldi.png', name: 'マリオ・カストルディ', title: '航空機設計者', field: 'jet', skill: 1.3 },
    { id: 'giovanni_giorgi', tag: 'ITA', file: 'Portrait_ITA_giovanni_giorgi.png', name: 'ジョヴァンニ・ジョルジ', title: '物理学者', field: 'general', skill: 1.1 },
    { id: 'filippo_bonfiglietti', tag: 'ITA', file: 'Portrait_ITA_filippo_bonfiglietti.png', name: 'フィリッポ・ボンフィリエッティ', title: '造船技師', field: 'general', skill: 1.0 },
    // 日本
    { id: 'yoshio_nishina', tag: 'JAP', file: 'portrait_JAP_yoshio_nishina.png', name: '仁科芳雄', title: '原子物理学者', field: 'nuclear', skill: 1.6 },
    { id: 'hideki_yukawa', tag: 'JAP', file: 'Portrait_JAP_hideki_yukawa.png', name: '湯川秀樹', title: '理論物理学者', field: 'nuclear', skill: 1.5 },
    { id: 'hideo_itokawa', tag: 'JAP', file: 'Portrait_JAP_hideo_itokawa.png', name: '糸川英夫', title: 'ロケット工学者', field: 'rocket', skill: 1.6 },
    { id: 'yoji_ito', tag: 'JAP', file: 'portrait_JAP_yoji_ito.png', name: '伊藤庸二', title: '電波兵器技術者', field: 'rocket', skill: 1.1 },
    { id: 'jiro_horikoshi', tag: 'JAP', file: 'portrait_JAP_jiro_horikoshi.png', name: '堀越二郎', title: '航空機設計者', field: 'jet', skill: 1.5 },
    { id: 'keiji_fukuda', tag: 'JAP', file: 'portrait_JAP_keiji_fukuda.png', name: '福田啓二', title: '造船技師', field: 'general', skill: 1.0 },
    { id: 'hideo_iwakuro', tag: 'JAP', file: 'portrait_JAP_hideo_iwakuro_scientist.png', name: '岩畔豪雄', title: '技術将校', field: 'general', skill: 1.0 },
    // ハンガリー
    { id: 'edward_teller', tag: 'HUN', file: 'Portrait_HUN_edward_teller.png', name: 'エドワード・テラー', title: '理論物理学者', field: 'nuclear', skill: 1.6 },
    { id: 'leo_szilard', tag: 'HUN', file: 'Portrait_HUN_leo_szilard.png', name: 'レオ・シラード', title: '核物理学者', field: 'nuclear', skill: 1.6 },
    { id: 'john_von_neumann', tag: 'HUN', file: 'Portrait_HUN_john_von_neumann.png', name: 'ジョン・フォン・ノイマン', title: '数学者', field: 'general', skill: 1.5 },
    { id: 'gyorgy_jendrassik', tag: 'HUN', file: 'Portrait_HUN_gyorgy_jendrassik.png', name: 'イェンドラシク・ジェルジ', title: 'ターボプロップ発明者', field: 'jet', skill: 1.4 },
    { id: 'asboth_oszkar', tag: 'HUN', file: 'Portrait_HUN_asboth_oszkar.png', name: 'アシュボート・オスカール', title: '航空技師', field: 'general', skill: 1.0 },
    // オーストリア
    { id: 'erwin_schrodinger', tag: 'AUS', file: 'portrait_AUS_erwin_schrodinger.png', name: 'エルヴィン・シュレーディンガー', title: '理論物理学者', field: 'nuclear', skill: 1.5 },
    { id: 'egon_schweidler', tag: 'AUS', file: 'Portrait_AUS_egon_schweidler.png', name: 'エゴン・シュヴァイドラー', title: '放射能研究者', field: 'nuclear', skill: 1.2 },
    { id: 'eugen_sanger', tag: 'AUS', file: 'Portrait_AUS_eugen_sanger.png', name: 'オイゲン・ゼンガー', title: 'ロケット工学者', field: 'rocket', skill: 1.6 },
    { id: 'herbert_wagner', tag: 'AUS', file: 'Portrait_AUS_herbert_wagner.png', name: 'ヘルベルト・ワーグナー', title: '誘導ミサイル技師', field: 'rocket', skill: 1.3 },
    { id: 'hedy_lamarr', tag: 'AUS', file: 'Portrait_AUS_hedy_lamarr.png', name: 'ヘディ・ラマー', title: '周波数ホッピング発明者', field: 'general', skill: 1.1 },
    { id: 'paul_eisler', tag: 'AUS', file: 'Portrait_AUS_paul_eisler.png', name: 'パウル・アイスラー', title: '電子工学者', field: 'general', skill: 1.0 },
    // その他
    { id: 'niels_bohr', tag: 'DEN', file: 'Portrait_DEN_niels_bohr.png', name: 'ニールス・ボーア', title: '理論物理学者', field: 'nuclear', skill: 1.8 },
    { id: 'ernest_walton', tag: 'IRE', file: 'Portrait_IRE_ernest_walton.png', name: 'アーネスト・ウォルトン', title: '原子核物理学者', field: 'nuclear', skill: 1.4 },
    { id: 'george_volkoff', tag: 'CAN', file: 'Portrait_CAN_george_volkoff.png', name: 'ジョージ・ヴォルコフ', title: '理論物理学者', field: 'nuclear', skill: 1.3 },
    { id: 'georg_placzek', tag: 'CZE', file: 'Portrait_CZE_georg_placzek.png', name: 'ゲオルク・プラチェク', title: '核物理学者', field: 'nuclear', skill: 1.3 },
    { id: 'alexej_surin', tag: 'CZE', file: 'Portrait_CZE_alexej_surin.png', name: 'アレクセイ・スリン', title: '車両設計者', field: 'general', skill: 1.0 },
    { id: 'antonin_husnik', tag: 'CZE', file: 'Portrait_CZE_antonin_husnik.png', name: 'アントニーン・フスニーク', title: '航空技師', field: 'jet', skill: 1.1 },
    { id: 'karel_bossart', tag: 'BEL', file: 'Portrait_BEL_karel_bossart.png', name: 'カレル・ボサール', title: 'ICBM 設計者', field: 'rocket', skill: 1.6 },
    { id: 'georges_lemaitre', tag: 'BEL', file: 'Portrait_BEL_georges_lemaitre.png', name: 'ジョルジュ・ルメートル', title: '宇宙物理学者', field: 'general', skill: 1.2 },
    { id: 'auguste_piccard', tag: 'BEL', file: 'Portrait_BEL_auguste_piccard.png', name: 'オーギュスト・ピカール', title: '物理学者', field: 'general', skill: 1.1 },
    { id: 'alfred_renard', tag: 'BEL', file: 'Portrait_BEL_alfred_renard.png', name: 'アルフレッド・ルナール', title: '航空機設計者', field: 'jet', skill: 1.1 },
    { id: 'nicolas_florine', tag: 'BEL', file: 'Portrait_BEL_nicolas_florine.png', name: 'ニコラ・フロリーヌ', title: 'ヘリコプター技師', field: 'general', skill: 1.0 },
    { id: 'anthony_fokker', tag: 'HOL', file: 'Portrait_HOL_anthony_fokker.png', name: 'アントニー・フォッカー', title: '航空機設計者', field: 'jet', skill: 1.3 },
    { id: 'mark_oliphant', tag: 'AST', file: 'Portrait_AST_mark_oliphant.png', name: 'マーク・オリファント', title: '核物理学者', field: 'nuclear', skill: 1.5 },
    { id: 'jack_piddington', tag: 'AST', file: 'Portrait_AST_jack_piddington.png', name: 'ジャック・ピディントン', title: '電波物理学者', field: 'general', skill: 1.1 },
    { id: 'lawrence_wackett', tag: 'AST', file: 'Portrait_AST_lawrence_wackett.png', name: 'ローレンス・ワケット', title: '航空技師', field: 'jet', skill: 1.1 },
    { id: 'wang_ganchang', tag: 'CHI', file: 'Portrait_CHI_wang_ganchang.png', name: '王淦昌', title: '核物理学者', field: 'nuclear', skill: 1.5 },
    { id: 'wong_tsu', tag: 'CHI', file: 'Portrait_CHI_wong_tsu.png', name: '王助', title: '航空機設計者', field: 'jet', skill: 1.2 },
    { id: 'chu_chia_jen', tag: 'CHI', file: 'Portrait_CHI_chu_chia_jen.png', name: '朱家仁', title: '航空技師', field: 'general', skill: 1.0 },
    { id: 'xu_tingyao', tag: 'CHI', file: 'Portrait_CHI_xu_tingyao.png', name: '徐庭瑤', title: '機甲兵科将校', field: 'general', skill: 1.0 },
    { id: 'qian_sanqiang', tag: 'PRC', file: 'portrait_PRC_qian_sanqiang.png', name: '銭三強', title: '核物理学者', field: 'nuclear', skill: 1.5 },
    { id: 'he_zehui', tag: 'PRC', file: 'portrait_PRC_he_zehui.png', name: '何沢慧', title: '核物理学者', field: 'nuclear', skill: 1.3 },
    { id: 'qian_xuesan', tag: 'PRC', file: 'portrait_PRC_qian_xuesan.png', name: '銭学森', title: 'ロケット工学者', field: 'rocket', skill: 1.7 },
    { id: 'wang_shusheng', tag: 'PRC', file: 'portrait_PRC_wang_shusheng.png', name: '王樹声', title: '兵器技術将校', field: 'general', skill: 1.0 },
    { id: 'homi_j_bhabha', tag: 'RAJ', file: 'portrait_RAJ_homi_j_bhabha.png', name: 'ホミ・J・バーバー', title: '核物理学者', field: 'nuclear', skill: 1.5 },
    { id: 'emma_rotor', tag: 'PHI', file: 'portrait_PHI_emma_rotor.png', name: 'エマ・ロトル', title: '物理学者', field: 'nuclear', skill: 1.1 },
    { id: 'vecihi_hurkus', tag: 'TUR', file: 'portrait_TUR_vecihi_hurkus.png', name: 'ヴェジヒ・ヒュルクシュ', title: '航空技師', field: 'jet', skill: 1.1 },
  ];
  static FIELD_OF = { uranium: 'nuclear', atomic: 'nuclear', v2: 'rocket', ballistic: 'rocket', jet: 'jet' };
  static FIELD_NAME = { nuclear: '核物理', rocket: 'ロケット', jet: '航空・ジェット', general: '総合' };
  /** 亡命・招聘が可能な中小国の科学者 (自国に該当分野の専門家が居ない場合に利用可) */
  static EMIGRE_TAGS = ['HUN', 'AUS', 'DEN', 'IRE', 'CAN', 'CZE', 'BEL', 'HOL', 'AST', 'PHI', 'RAJ', 'TUR'];
  static fits(sc, projectId) { return sc.field === 'general' || sc.field === SuperWeapons.FIELD_OF[projectId]; }
  /** 自国で雇用可能な科学者: 自国籍 + (自国籍の専門家が居ない分野は亡命者から補充) */
  static SCIENTISTS_FOR(tag = CoreEngine.gameState.country) {
    const own = SuperWeapons.ROSTER.filter(x => x.tag === tag);
    const list = [...own];
    ['nuclear', 'rocket', 'jet'].forEach(f => { if (!own.some(x => x.field === f)) list.push(...SuperWeapons.ROSTER.filter(x => x.tag !== tag && x.field === f && SuperWeapons.EMIGRE_TAGS.includes(x.tag)).sort((a, b) => b.skill - a.skill).slice(0, 2).map(x => ({ ...x, emigre: true }))); });
    if (!own.length) list.push(...SuperWeapons.ROSTER.filter(x => x.field === 'general' && SuperWeapons.EMIGRE_TAGS.includes(x.tag)).slice(0, 1).map(x => ({ ...x, emigre: true })));
    return list;
  }
  static get SCIENTISTS() { return SuperWeapons.SCIENTISTS_FOR(); }
  static portrait(sc, cls = 'sw-portrait') { return '<img class="' + cls + '" src="' + SuperWeapons.PORTRAIT + sc.file + '" alt="" onerror="this.style.visibility=\'hidden\'">'; }
  static projectImg(P) { return '<img class="sw-pimg" src="' + SuperWeapons.IMG + P.img + '" alt="" onerror="this.style.display=\'none\'">'; }
  static NUKE_RATE = 0.02;      // 原子炉 Lv1 あたり /日 (= 50日に1発)
  static ROCKET_RATE = 0.5;     // 発射施設 Lv1 あたり /日
  static MISSILE_RANGE = 900;   // 地図ピクセル
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }
  static nameOf(tag) { return typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(tag) : tag; }
  static sciName(sc) { return sc.name + (sc.emigre ? ' (亡命)' : ''); }

  // ------------------------------------------------------------------
  static init() {
    if (SuperWeapons.installed) return;
    SuperWeapons.installed = true;
    SuperWeapons.data();
    SuperWeapons.installUI();
    SuperWeapons.installHooks();
    CoreEngine.registerTickCallback(() => SuperWeapons.onTick());
    CoreEngine.log('⚛️ 特殊計画・核/ミサイルシステムが有効になりました。');
  }
  static data() {
    const s = CoreEngine.gameState; if (!s.strategy) return null;
    const d = (s.strategy.sw ||= { projects: {}, rockets: 0, missions: [], log: [], strikes: 0 });
    d.projects ||= {}; d.missions ||= []; d.log ||= [];
    // 核攻撃の履歴と、国ごとの戦意/安定度への累積ダメージ (終末兵器ウィンドウ右側)
    d.history ||= []; d.damage ||= {}; d.strikeDay ||= {};
    Object.keys(SuperWeapons.PROJECTS).forEach(id => { d.projects[id] ||= { progress: 0, factories: 0, scientist: null, started: false, done: false, manpowerPaid: false }; });
    if (!Number.isFinite(s.nuclearStockpile)) s.nuclearStockpile = 0;
    return d;
  }
  static installUI() {
    const root = document.getElementById('window-templates');
    if (root && !document.getElementById('tpl-superweapons')) {
      const el = document.createElement('div'); el.className = 'window-template pane-scroll'; el.id = 'tpl-superweapons';
      el.dataset.title = '☢️ 終末兵器・特殊計画 — Nuclear & Strategic Weapons'; el.dataset.w = '1240'; el.dataset.h = '800'; el.innerHTML = '<div id="superweapons-content"></div>'; root.appendChild(el);
    }
    // 上部バーの核備蓄インジケーター (☢ 備蓄数) — クリックで終末兵器ウィンドウ
    const nav = document.querySelector?.('.topbar-nav'); const wt = document.getElementById('world-tension');
    if (nav && !document.getElementById('sw-stock')) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'speed-btn sw-stock'; b.id = 'sw-stock';
      b.title = '核兵器の備蓄 — クリックで「終末兵器・特殊計画」ウィンドウを開く';
      b.setAttribute('aria-label', '核兵器の備蓄');
      b.setAttribute('onclick', "GameUI.switchTab('superweapons')");
      b.innerHTML = '<span class="sw-stock-icon" aria-hidden="true">☢</span><span class="sw-stock-value"><b id="sw-nukes">0</b><small>核備蓄</small></span><span class="sw-rocket" title="ロケット備蓄">🚀 <b id="sw-rockets">0</b></span>';
      if (wt && nav.insertBefore) nav.insertBefore(b, wt); else nav.appendChild(b);
    }
    // 核攻撃モード (照準) を直接起動するボタン
    if (nav && !document.getElementById('sw-target-btn')) {
      const t = document.createElement('button'); t.type = 'button';
      t.className = 'speed-btn sw-target-btn'; t.id = 'sw-target-btn';
      t.title = '核攻撃モード — マップ上の敵州をクリックして核兵器を投下';
      t.setAttribute('aria-label', '核攻撃モード');
      t.setAttribute('onclick', 'SuperWeapons.startTargeting()');
      t.innerHTML = '🎯<small>核攻撃</small>';
      const stock = document.getElementById('sw-stock');
      if (stock && stock.parentNode) stock.parentNode.insertBefore(t, stock.nextSibling); else nav.appendChild(t);
    }
    // ナビボタン (静的に用意されている場合はラベルだけ更新)
    const navbar = document.getElementById('window-nav');
    if (navbar) {
      const b = navbar.querySelector?.('[data-tab="superweapons"]');
      if (b) { b.textContent = '☢️ 終末兵器'; b.title = '終末兵器・特殊計画 (核兵器・ミサイル・原子炉)'; }
      else {
        const nb = document.createElement('button'); nb.className = 'win-btn'; nb.dataset.tab = 'superweapons'; nb.setAttribute('onclick', "GameUI.switchTab('superweapons')"); nb.textContent = '☢️ 終末兵器';
        const ref = navbar.querySelector?.('[data-tab="research"]'); if (ref && ref.nextSibling) navbar.insertBefore(nb, ref.nextSibling); else navbar.appendChild(nb);
      }
    }
    if (typeof GameUI !== 'undefined' && !GameUI._swHooked) {
      GameUI._swHooked = true;
      const orig = GameUI.onWindowOpened.bind(GameUI);
      GameUI.onWindowOpened = (tab) => { orig(tab); if (tab === 'superweapons') SuperWeapons.render(); };
    }
    if (typeof CoreEngine.renderStats === 'function' && !CoreEngine._swHooked) {
      CoreEngine._swHooked = true;
      const orig = CoreEngine.renderStats.bind(CoreEngine);
      CoreEngine.renderStats = () => { orig(); SuperWeapons.renderTopbar(); };
    }
    // マップ左クリック: 核攻撃モード中は州選択ではなく核攻撃の確認へ
    if (typeof MapRenderer !== 'undefined' && !MapRenderer._swClickHooked) {
      MapRenderer._swClickHooked = true;
      const origClick = MapRenderer.handlePrimaryClick.bind(MapRenderer);
      MapRenderer.handlePrimaryClick = function (offsetX, offsetY) {
        if (SuperWeapons.targeting) return SuperWeapons.targetClick(offsetX, offsetY);
        return origClick(offsetX, offsetY);
      };
    }
    // Esc で照準モード解除
    if (typeof document !== 'undefined' && !SuperWeapons._escHooked) {
      SuperWeapons._escHooked = true;
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && SuperWeapons.targeting) {
          SuperWeapons.stopTargeting();
        }
      });
    }
  }

  // ------------------------------------------------------------------
  // 核攻撃ターゲット選択モード (照準カーソル)
  // ------------------------------------------------------------------
  static targeting = false;
  static startTargeting() {
    const s = CoreEngine.gameState;
    if (!MapRenderer.ready) { GameUI.notify('地図を読み込み中です。', 'alert'); return false; }
    if (!SuperWeapons.done('atomic')) {
      GameUI.notify('特殊計画「原子爆弾」を完了すると核攻撃を実行できます。', 'alert');
      GameUI.switchTab('superweapons');
      return false;
    }
    if (SuperWeapons.nukes() < 1) {
      GameUI.notify('核兵器の備蓄がありません (原子炉で生産してください)。', 'alert');
      GameUI.switchTab('superweapons');
      return false;
    }
    if (SuperWeapons.targeting) { SuperWeapons.stopTargeting(); return true; }
    SuperWeapons.targeting = true;
    document.body.classList.add('sw-targeting');
    SuperWeapons.showTargetBanner();
    // マップが隠れないようウィンドウは最小化する
    try { if (WindowManager.isOpen?.('superweapons')) WindowManager.minimize('superweapons'); } catch (error) { /* ignore */ }
    GameUI.notify('🎯 核攻撃モード — マップ上の敵州を左クリック (Esc で解除)', 'alert');
    SuperWeapons.renderTopbar();
    return true;
  }
  static stopTargeting(options = {}) {
    SuperWeapons.targeting = false;
    if (typeof document !== 'undefined' && document && document.body) {
      document.body.classList.remove('sw-targeting');
      try { document.getElementById('sw-target-banner')?.remove(); } catch (error) { /* ignore */ }
    }
    SuperWeapons.renderTopbar();
    if (!options.silent) GameUI.notify('核攻撃モードを解除しました。', 'alert');
  }
  static showTargetBanner() {
    if (typeof document === 'undefined' || !document || !document.body) return;
    document.getElementById('sw-target-banner')?.remove();
    const el = document.createElement('div');
    el.id = 'sw-target-banner';
    el.innerHTML = '<span class="sw-crosshair" aria-hidden="true">🎯</span>' +
      '<div><b>核攻撃モード</b><small>攻撃する敵国の州を左クリック ／ Esc で解除</small></div>' +
      '<span class="sw-banner-stock">☢ 備蓄 ' + SuperWeapons.nukes() + '</span>' +
      '<button type="button" onclick="SuperWeapons.stopTargeting()">解除</button>';
    document.body.appendChild(el);
  }
  static targetClick(offsetX, offsetY) {
    const wp = MapRenderer.screenToWorld(offsetX, offsetY);
    const pid = MapRenderer.provinceAt(wp[0], wp[1]);
    if (!pid) { GameUI.notify('海の上です。敵国の州 (陸地) をクリックしてください。', 'alert'); return true; }
    const sid = MapRenderer.stateOf(pid);
    if (!sid) { GameUI.notify('州を特定できませんでした。', 'alert'); return true; }
    SuperWeapons.stopTargeting({ silent: true });
    SuperWeapons.confirmStrike(String(sid));
    return true;
  }
  static installHooks() {
    // 建設: ロケット発射施設の追加・原子炉のレベル拡張・解禁ゲート
    if (typeof ConstructionManager !== 'undefined' && !ConstructionManager._swHooked) {
      ConstructionManager._swHooked = true;
      const list = ConstructionManager.BUILDINGS;
      const reactor = list.find(b => b.id === 'nuclear_reactor'); if (reactor) reactor.max = 3;
      if (!list.some(b => b.id === 'rocket_site')) { const i = list.findIndex(b => b.id === 'nuclear_reactor'); const def = { id: 'rocket_site', name: 'ロケット発射施設', icon: '🚀', cost: 400, max: 3 }; if (i >= 0) list.splice(i + 1, 0, def); else list.push(def); }
      const orig = ConstructionManager.enqueue.bind(ConstructionManager);
      ConstructionManager.enqueue = (id) => {
        if (id === 'rocket_site' && !SuperWeapons.done('v2')) { GameUI.notify('特殊計画「V2ロケット開発」を完了するとロケット発射施設を建設できます。', 'alert'); return; }
        return orig(id);
      };
    }
    // 旧 NuclearManager の自動生産は停止 (本システムが原子炉から生産)
    if (typeof NuclearManager !== 'undefined' && !NuclearManager._swHooked) {
      NuclearManager._swHooked = true;
      NuclearManager.onTick = () => { if (typeof GameUI !== 'undefined' && GameUI.currentTab === 'nuclear') NuclearManager.render(); };
    }
    // 特殊計画に割り当てた民需工場は他で使えない
    if (typeof FactoryBudget !== 'undefined' && !FactoryBudget._swHooked) {
      FactoryBudget._swHooked = true;
      const orig = FactoryBudget.availableCivilian.bind(FactoryBudget);
      FactoryBudget.availableCivilian = (tag = CoreEngine.gameState.country) => orig(tag) - (tag === CoreEngine.gameState.country ? SuperWeapons.allocated() : 0);
    }
  }

  // ------------------------------------------------------------------
  // 研究・特殊計画
  // ------------------------------------------------------------------
  static researched(re) { try { const set = typeof ResearchManager !== 'undefined' ? ResearchManager.researchedTech : null; if (!set) return false; return [...set].some(id => re.test(String(id))); } catch (e) { return false; } }
  static done(id) { return !!SuperWeapons.data()?.projects[id]?.done; }
  static allocated() { const d = SuperWeapons.data(); if (!d) return 0; return Object.values(d.projects).reduce((a, p) => a + (p.started && !p.done ? (p.factories || 0) : 0), 0); }
  static blocker(id) {
    const P = SuperWeapons.PROJECTS[id], d = SuperWeapons.data();
    if (!SuperWeapons.researched(P.tech)) return '基礎研究「' + P.techName + '」を研究画面で完了してください';
    if (P.requires && !d.projects[P.requires].done) return '特殊計画「' + SuperWeapons.PROJECTS[P.requires].name + '」の完了が必要です';
    return null;
  }
  static scientistOf(id) { const sid = SuperWeapons.data().projects[id].scientist; return SuperWeapons.SCIENTISTS.find(x => x.id === sid) || null; }
  static assign(id, sciId) {
    const d = SuperWeapons.data(); const sc = SuperWeapons.SCIENTISTS.find(x => x.id === sciId);
    if (sciId && !sc) return;
    if (sc && !SuperWeapons.fits(sc, id)) { GameUI.notify(SuperWeapons.sciName(sc) + ' はこの分野の専門家ではありません。', 'alert'); return; }
    Object.values(d.projects).forEach(p => { if (p.scientist === sciId) p.scientist = null; });
    d.projects[id].scientist = sciId || null;
    SuperWeapons.render();
  }
  static setFactories(id, n) {
    const d = SuperWeapons.data(), p = d.projects[id];
    const free = (typeof FactoryBudget !== 'undefined' ? FactoryBudget.availableCivilian() : 10) + (p.started && !p.done ? p.factories : 0);
    p.factories = Math.max(0, Math.min(15, Math.min(free, Math.floor(Number(n) || 0))));
    SuperWeapons.render();
  }
  static start(id) {
    const s = CoreEngine.gameState, d = SuperWeapons.data(), p = d.projects[id], P = SuperWeapons.PROJECTS[id];
    if (p.done || p.started) return;
    const b = SuperWeapons.blocker(id); if (b) { GameUI.notify(b, 'alert'); return; }
    if (!p.scientist) { GameUI.notify('科学者を割り当ててください。', 'alert'); return; }
    if (p.factories < 1) { GameUI.notify('民需工場を 1 以上割り当ててください。', 'alert'); return; }
    if (!p.manpowerPaid) { if ((s.manpower || 0) < P.manpower) { GameUI.notify('人的資源が不足しています (必要 ' + P.manpower.toLocaleString() + ')。', 'alert'); return; } s.manpower -= P.manpower; p.manpowerPaid = true; }
    p.started = true; p.startDay = SuperWeapons.day();
    CoreEngine.log('⚛️ 特殊計画「' + P.name + '」を開始 (工場 ' + p.factories + '・人的資源 ' + P.manpower.toLocaleString() + ')');
    GameUI.notify('⚛️ 特殊計画「' + P.name + '」を開始しました', 'success');
    SuperWeapons.render(); CoreEngine.renderStats?.();
  }
  static pause(id) { const p = SuperWeapons.data().projects[id]; if (p.started && !p.done) { p.started = false; SuperWeapons.render(); } }
  static rate(id) { const p = SuperWeapons.data().projects[id], sc = SuperWeapons.scientistOf(id); const bonus = 1 + (Number(CoreEngine.gameState.cardModifiers?.specialProjectSpeed) || 0); return (p.factories || 0) * (sc ? sc.skill : 1) * bonus; }
  static complete(id) {
    const s = CoreEngine.gameState, d = SuperWeapons.data(), p = d.projects[id], P = SuperWeapons.PROJECTS[id];
    p.done = true; p.started = false; p.doneDay = SuperWeapons.day(); p.progress = P.points;
    if (id === 'uranium') { const lab = window.StrategySystems?.ensureState?.(); if (lab && !lab.unlockedProjects.includes('nuclear_reactor_research')) lab.unlockedProjects.push('nuclear_reactor_research'); s.nuclearTechLevel = Math.max(1, s.nuclearTechLevel || 0); }
    if (id === 'atomic') s.nuclearTechLevel = Math.max(2, s.nuclearTechLevel || 0);
    if (id === 'jet') s.strategicBombers = (s.strategicBombers || 0) + 20;
    d.log.unshift({ day: SuperWeapons.day(), text: '特殊計画「' + P.name + '」完了 — ' + P.unlocks });
    CoreEngine.log('🎉 特殊計画「' + P.name + '」が完了しました！ ' + P.unlocks + ' が解禁');
    GameUI.notify('🎉 特殊計画完了: ' + P.name + ' — ' + P.unlocks, 'success');
    if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) { try { NewsManager.fireCustom({ icon: P.icon, title: P.name + 'が完成', body: SuperWeapons.nameOf(s.country) + ' の科学者たちは「' + P.name + '」を完遂した。' + P.unlocks + '。' }); } catch (e) { /* ignore */ } }
    CoreEngine.addWorldTension?.(id === 'atomic' ? 5 : 2, '特殊計画「' + P.name + '」の完成');
    if (typeof ConstructionManager !== 'undefined' && WindowManager.isOpen?.('construction')) ConstructionManager.render();
  }

  // ------------------------------------------------------------------
  // 施設・備蓄
  // ------------------------------------------------------------------
  static facilities(kind) { const me = CoreEngine.gameState.country; return Object.entries(MapRenderer.states || {}).filter(([, st]) => st.owner === me && (st.b?.[kind] || 0) > 0).map(([sid, st]) => ({ sid, st, level: st.b[kind] })); }
  static reactorLevels() { return SuperWeapons.facilities('nuclear_reactor').reduce((a, f) => a + f.level, 0); }
  static siteLevels() { return SuperWeapons.facilities('rocket_site').reduce((a, f) => a + f.level, 0); }
  static nukes() { return Math.floor(CoreEngine.gameState.nuclearStockpile || 0); }
  static rockets() { return Math.floor(SuperWeapons.data()?.rockets || 0); }
  static missileRange() { return SuperWeapons.MISSILE_RANGE * (SuperWeapons.done('ballistic') ? 2 : 1); }
  static dist(a, b) { const w = MapRenderer.mapW || 0; let dx = Math.abs(a[0] - b[0]); if (w && dx > w / 2) dx = w - dx; return Math.hypot(dx, a[1] - b[1]); }
  /** 対象州に届く最も近い発射施設 */
  static siteFor(sid) {
    const c = MapRenderer.stateCenter.get(String(sid)); if (!c) return null; let best = null;
    SuperWeapons.facilities('rocket_site').forEach(f => { const fc = MapRenderer.stateCenter.get(String(f.sid)); if (!fc) return; const dd = SuperWeapons.dist(fc, c); if (dd <= SuperWeapons.missileRange() && (!best || dd < best.d)) best = { ...f, d: dd }; });
    return best;
  }

  // ------------------------------------------------------------------
  // 毎日
  // ------------------------------------------------------------------
  static onTick() {
    const s = CoreEngine.gameState, d = SuperWeapons.data(); if (!d || !MapRenderer.ready) return;
    const day = SuperWeapons.day(); if (d.lastDay === day) return; d.lastDay = day;
    // 計画の進行
    Object.entries(d.projects).forEach(([id, p]) => { if (!p.started || p.done) return; p.progress += SuperWeapons.rate(id); if (p.progress >= SuperWeapons.PROJECTS[id].points) SuperWeapons.complete(id); });
    // 照準モード中に備蓄が尽きたら解除
    if (SuperWeapons.targeting && SuperWeapons.nukes() < 1) SuperWeapons.stopTargeting({ silent: true });
    // 備蓄の生成
    if (SuperWeapons.done('atomic')) { const lv = SuperWeapons.reactorLevels(); if (lv > 0) { const before = SuperWeapons.nukes(); s.nuclearStockpile = (s.nuclearStockpile || 0) + lv * SuperWeapons.NUKE_RATE; if (SuperWeapons.nukes() > before) { GameUI.notify('☢️ 核兵器が 1 発完成しました (備蓄 ' + SuperWeapons.nukes() + ')', 'success'); d.log.unshift({ day, text: '核兵器 1 発が完成 (備蓄 ' + SuperWeapons.nukes() + ')' }); } } }
    if (SuperWeapons.done('v2')) { const lv = SuperWeapons.siteLevels(); if (lv > 0) d.rockets = (d.rockets || 0) + lv * SuperWeapons.ROCKET_RATE; }
    // ミサイル攻撃の継続
    d.missions = d.missions.filter(m => { const st = MapRenderer.states[m.sid]; return st && (s.atWar || []).includes(st.owner); });
    d.missions.forEach(m => SuperWeapons.missileTick(m));
    SuperWeapons.renderTopbar();
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('superweapons')) SuperWeapons.render();
  }
  static renderTopbar() {
    if (typeof document === 'undefined' || !document) return;
    const nukes = SuperWeapons.nukes(), rockets = SuperWeapons.rockets();
    const n = document.getElementById('sw-nukes'), r = document.getElementById('sw-rockets');
    if (n) n.textContent = nukes;
    if (r) r.textContent = rockets;
    const el = document.getElementById('sw-stock');
    if (el) {
      el.classList.toggle('armed', nukes > 0);
      el.title = '核兵器の備蓄: ' + nukes + ' 発 / ロケット: ' + rockets + ' 発 — クリックで終末兵器ウィンドウ';
      el.setAttribute('aria-label', '核兵器の備蓄 ' + nukes + ' 発');
    }
    const target = document.getElementById('sw-target-btn');
    if (target) {
      const usable = nukes > 0 && SuperWeapons.done('atomic');
      target.classList.toggle('active', SuperWeapons.targeting);
      target.disabled = !usable;
      target.title = usable ? '核攻撃モード — マップ上の敵州をクリック (Esc で解除)' : '核兵器の備蓄と「原子爆弾」の完成が必要です';
    }
    const banner = document.querySelector('#sw-target-banner .sw-banner-stock');
    if (banner) banner.textContent = '☢ 備蓄 ' + nukes;
  }

  // ------------------------------------------------------------------
  // 核攻撃
  // ------------------------------------------------------------------
  /** 対象州が属する戦略空域の制空権 */
  static airInfo(sid) {
    const s = CoreEngine.gameState;
    let pct = Number(s.airSupremacy) || 0, local = false, level = 'none';
    if (typeof AirForce !== 'undefined' && AirForce.superiority) {
      try { const sup = AirForce.superiority(sid); if (sup.contested) { pct = sup.percent; local = true; level = sup.level; } } catch (e) { /* ignore */ }
    }
    const st = MapRenderer.states[sid];
    return { pct, local, level, zone: st?.name || ('州' + sid), jet: SuperWeapons.done('jet') };
  }
  /** 戦略爆撃機 (射程内の航空隊 + 抽象保有数) とミサイル (射程内の発射施設) の配備状況 */
  static deliveryInfo(sid) {
    const s = CoreEngine.gameState, center = MapRenderer.stateCenter.get(String(sid));
    let bomberInRange = 0, bomberNear = 0; const wings = [];
    if (typeof AirForce !== 'undefined' && AirForce.wings) {
      try {
        AirForce.wings().forEach(w => {
          if (w.aircraftType !== 'bomber' || Number(w.aircraftCount) <= 0) return;
          const base = Array.isArray(w.base) ? w.base : (w.baseStateId ? MapRenderer.stateCenter.get(String(w.baseStateId)) : null);
          const range = Math.max(0, Number(w.range) || 450);
          const dist = base && center ? SuperWeapons.dist(base, center) : Infinity;
          const item = { name: w.name || '航空隊', count: Number(w.aircraftCount) || 0, base, dist, range, inRange: dist <= range, jet: !!w.jet };
          wings.push(item);
          if (item.inRange) bomberInRange += item.count; else bomberNear += item.count;
        });
      } catch (e) { /* ignore */ }
    }
    const abstract = Math.max(0, Math.floor(Number(s.strategicBombers) || 0));
    const bombers = bomberInRange + abstract;
    const site = SuperWeapons.siteFor(sid);
    const rockets = SuperWeapons.rockets();
    const missile = !!site && rockets >= 1;
    return { wings, bomberInRange, bomberNear, abstract, bombers, site, rockets, missile, total: bombers + (missile ? rockets : 0) };
  }
  static nukeChecks(sid) {
    const s = CoreEngine.gameState, st = MapRenderer.states[sid];
    const air = SuperWeapons.airInfo(sid), del = SuperWeapons.deliveryInfo(sid);
    const parts = [];
    if (del.bombers) parts.push('戦略爆撃機 ' + del.bombers + ' 機');
    if (del.missile) parts.push('ミサイル ' + del.rockets + ' 発 (射程内の発射施設)');
    return [
      { ok: !!st && (s.atWar || []).includes(st.owner), text: '対象が交戦中の敵国の州' + (st ? ' (' + SuperWeapons.nameOf(st.owner) + ')' : '') },
      { ok: SuperWeapons.done('atomic'), text: '特殊計画「原子爆弾」が完了' },
      { ok: SuperWeapons.nukes() >= 1, text: '核兵器の備蓄 1 以上 (現在 ' + SuperWeapons.nukes() + ')' },
      { ok: air.pct >= 75, text: '戦略空域「' + air.zone + '」の制空権 75% 以上 (現在 ' + Math.round(air.pct) + '%' + (air.local ? '' : '・全国値') + ')' },
      { ok: del.total > 0, text: '戦略爆撃機またはミサイルの配備 (' + (parts.join(' / ') || 'なし') + ')' },
    ];
  }
  static canNuke(sid) { return SuperWeapons.nukeChecks(sid).every(c => c.ok); }
  static missileChecks(sid) {
    const s = CoreEngine.gameState, st = MapRenderer.states[sid], site = SuperWeapons.siteFor(sid);
    return [
      { ok: !!st && (s.atWar || []).includes(st.owner), text: '対象が交戦中の敵国の州' },
      { ok: SuperWeapons.done('v2'), text: '特殊計画「V2ロケット開発」が完了' },
      { ok: SuperWeapons.rockets() >= 1, text: 'ロケットの備蓄 1 以上 (現在 ' + SuperWeapons.rockets() + ')' },
      { ok: !!site, text: '射程 ' + SuperWeapons.missileRange() + ' 内のロケット発射施設' + (site ? ' (' + (site.st.name || '州' + site.sid) + '・距離 ' + Math.round(site.d) + ')' : ' — なし') },
    ];
  }
  static canMissile(sid) { return SuperWeapons.missileChecks(sid).every(c => c.ok); }
  /** 州情報オーバーレイ用 */
  static strikeLine(sid) {
    const s = CoreEngine.gameState, st = MapRenderer.states[sid]; if (!st || !(s.atWar || []).includes(st.owner)) return '';
    const d = SuperWeapons.data(); if (!d) return '';
    const hasAny = SuperWeapons.done('atomic') || SuperWeapons.done('v2'); if (!hasAny) return '';
    const n = SuperWeapons.canNuke(sid), m = SuperWeapons.canMissile(sid), active = d.missions.some(x => x.sid === String(sid));
    return '<button class="map-info-build-btn sw-nuke-btn' + (n ? ' ready' : '') + '" onclick="SuperWeapons.openStrikeModal(\'' + sid + '\')">☢️ 核攻撃' + (n ? '' : ' (条件未達)') + '</button> <button class="map-info-build-btn sw-missile-btn' + (m ? ' ready' : '') + '" onclick="SuperWeapons.openStrikeModal(\'' + sid + '\')">🚀 ' + (active ? 'ミサイル攻撃中' : 'ミサイル攻撃') + '</button>';
  }
  static openStrikeModal(sid) {
    const st = MapRenderer.states[sid]; if (!st) return;
    const d = SuperWeapons.data(), nc = SuperWeapons.nukeChecks(sid), mc = SuperWeapons.missileChecks(sid);
    const canN = nc.every(c => c.ok), canM = mc.every(c => c.ok), active = d.missions.find(x => x.sid === String(sid));
    const b = st.b || {}; const divs = SuperWeapons.divisionsIn(sid);
    const list = (arr) => '<ul class="sw-checks">' + arr.map(c => '<li class="' + (c.ok ? 'ok' : 'ng') + '">' + (c.ok ? '✅' : '❌') + ' ' + SuperWeapons.esc(c.text) + '</li>').join('') + '</ul>';
    GameUI.openModal('🎯 攻撃目標: ' + (st.name || '州' + sid), '<div class="sw-modal"><p class="sw-target">' + SuperWeapons.esc(SuperWeapons.nameOf(st.owner)) + ' 領 ／ 🏭' + (b.industrial_complex || 0) + ' ⚙️' + (b.arms_factory || 0) + ' 🛤️' + (b.infrastructure || 0) + ' 🏰' + (b.fort || 0) + ' ／ 州内師団 ' + divs.length + ' ／ VP ' + Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) + '</p>' +
      '<div class="sw-strike-grid"><div class="sw-strike nuke' + (canN ? ' ready' : '') + '"><h4>☢️ 核攻撃 (Nuke)</h4>' + list(nc) + '<p class="sw-fx">効果: インフラ・民需/軍需工場・合成ゴム工場・原子炉をレベル 0 に破壊／州内と隣接交戦州の敵師団を 90% 以上壊滅／対象国の戦意 −15〜−30%・安定度 −15〜−30%／世界緊張度 +15</p><button class="sw-btn nuke" ' + (canN ? '' : 'disabled') + ' onclick="SuperWeapons.confirmStrike(\'' + sid + '\')">☢️ 核攻撃の確認へ (備蓄 ' + SuperWeapons.nukes() + ')</button></div>' +
      '<div class="sw-strike missile' + (canM ? ' ready' : '') + '"><h4>🚀 ミサイル攻撃 (' + (SuperWeapons.done('ballistic') ? '弾道ミサイル' : 'V2ロケット') + ')</h4>' + list(mc) + '<p class="sw-fx">効果: 毎日ロケット 1 発を消費し、インフラ・要塞・工場に損害、州内師団の組織率 −' + (SuperWeapons.done('ballistic') ? 12 : 8) + '／充足 −' + (SuperWeapons.done('ballistic') ? 4.5 : 3) + '%。備蓄が尽きるか停止するまで継続。</p>' + (active ? '<button class="sw-btn" onclick="SuperWeapons.stopMissile(\'' + sid + '\')">⏹ ミサイル攻撃を停止 (' + active.fired + ' 発発射済み)</button>' : '<button class="sw-btn missile" ' + (canM ? '' : 'disabled') + ' onclick="SuperWeapons.startMissile(\'' + sid + '\')">🚀 ミサイル攻撃を開始 (備蓄 ' + SuperWeapons.rockets() + ')</button>') + '</div></div>' +
      '<div class="sw-actions"><button class="sw-btn" onclick="GameUI.closeModal();SuperWeapons.startTargeting()">🎯 核攻撃モード</button><button class="sw-btn" onclick="GameUI.closeModal();GameUI.switchTab(\'superweapons\')">☢️ 終末兵器画面へ</button><button class="sw-btn" onclick="GameUI.closeModal()">閉じる</button></div></div>');
  }

  /** 確認ダイアログ: 「[州名]へ核兵器を投下しますか？ 使用数: 1」 */
  static confirmStrike(sid) {
    sid = String(sid);
    const st = MapRenderer.states[sid]; if (!st) return;
    const checks = SuperWeapons.nukeChecks(sid), ok = checks.every(c => c.ok);
    const del = SuperWeapons.deliveryInfo(sid), air = SuperWeapons.airInfo(sid);
    const b = st.b || {}, divs = SuperWeapons.divisionsIn(sid), enemies = SuperWeapons.enemyDivisionsIn(sid);
    const target = SuperWeapons.esc(st.name || ('州' + sid));
    const list = (arr) => '<ul class="sw-checks">' + arr.map(c => '<li class="' + (c.ok ? 'ok' : 'ng') + '">' + (c.ok ? '✅' : '❌') + ' ' + SuperWeapons.esc(c.text) + '</li>').join('') + '</ul>';
    const rows = [
      ['インフラ / 民需工場 / 軍需工場', '🛤️' + (b.infrastructure || 0) + ' → 0 ／ 🏭' + (b.industrial_complex || 0) + ' → 0 ／ ⚙️' + (b.arms_factory || 0) + ' → 0'],
      ['合成ゴム工場 / 原子炉', '🛢️' + (b.synthetic_refinery || 0) + ' → 0 ／ ☢️' + (b.nuclear_reactor || 0) + ' → 0'],
      ['州内・隣接交戦州の敵師団', enemies.length + ' 師団 → 組織率・耐久値を 90% 以上カット (' + Math.ceil(enemies.length * 0.9) + ' 師団壊滅)'],
      ['自軍師団 (在留)', divs.length + ' 師団 → 組織率・耐久値 −95% (巻き添え)'],
      ['対象国の戦意 / 安定度', '戦意 −15〜−30% / 安定度 −15〜−30% (降伏に接近)'],
      ['空域の制空権', Math.round(air.pct) + '% (' + SuperWeapons.esc(air.zone) + ') ／ 運搬: ' + (del.bombers ? '爆撃機 ' + del.bombers + ' 機 ' : '') + (del.missile ? 'ミサイル ' + del.rockets + ' 発' : '')],
    ];
    GameUI.openModal('☢️ 核攻撃 — ' + (st.name || ('州' + sid)),
      '<div class="sw-modal sw-confirm">' +
      '<p class="sw-warning">「<b>' + target + '</b>」へ核兵器を投下しますか？ <span class="sw-use">使用数: 1</span> <span class="sw-stock-now">(☢ 備蓄 ' + SuperWeapons.nukes() + ' → ' + Math.max(0, SuperWeapons.nukes() - 1) + ')</span></p>' +
      '<p class="sw-target">' + SuperWeapons.esc(SuperWeapons.nameOf(st.owner)) + ' 領 ／ 州 ID ' + sid + '</p>' +
      '<div class="sw-confirm-grid"><div class="sw-confirm-col"><h4>発動条件 (すべて必須)</h4>' + list(checks) + '</div>' +
      '<div class="sw-confirm-col"><h4>被害予測</h4><table class="sw-table">' + rows.map(([k, v]) => '<tr><th>' + SuperWeapons.esc(k) + '</th><td>' + SuperWeapons.esc(v) + '</td></tr>').join('') + '</table></div></div>' +
      '<div class="sw-actions"><button class="sw-btn" onclick="GameUI.closeModal();SuperWeapons.stopTargeting({silent:true})">中止</button>' +
      '<button class="sw-btn nuke" ' + (ok ? '' : 'disabled') + ' onclick="SuperWeapons.launchNuke(\'' + sid + '\')">' + (ok ? '☢️ 実行' : '⚠️ 条件未達') + '</button></div>' +
      (ok ? '' : '<p class="sw-ng-note">条件を満たしていないため実行できません。制空権 (75% 以上)・戦略爆撃機またはミサイル・核備蓄を確認してください。</p>') +
      '</div>');
  }

  /** 州情報オーバーレイ用: 核攻撃後の廃墟表示 */
  static ruinLine(sid) {
    const st = MapRenderer.states[sid]; if (!st || !st.ruined) return '';
    const day = Number(st.ruined) || 0;
    return '<span class="sw-ruin-note">☠️ 廃墟 — ' + (day ? 'Day ' + day + ' に核攻撃を受け、' : '核攻撃を受け、') + 'インフラ・工場は全壊しています。</span>';
  }
  static divisionsIn(sid) {
    if (typeof ArmyRoster === 'undefined') return [];
    return ArmyRoster.all().filter(d => { const pid = d.pid || (BattlePlanManager.armies || []).find(a => a.divisions.includes(d))?.positionPid; return pid && String(MapRenderer.stateOf(Number(pid))) === String(sid); });
  }
  /** 州に隣接する州 ID */
  static neighboringStates(sid) {
    const st = MapRenderer.states[sid]; if (!st || !st.provinces) return [];
    const set = new Set();
    st.provinces.forEach(pid => (MapRenderer.provNeighbors.get(pid) || []).forEach(n => {
      const nsid = MapRenderer.stateOf(n);
      if (nsid != null && String(nsid) !== String(sid)) set.add(String(nsid));
    }));
    return [...set];
  }
  /** 州内 (および隣接する交戦中の州) にいる敵師団 */
  static enemyDivisionsIn(sid) {
    const s = CoreEngine.gameState, st = MapRenderer.states[sid];
    if (!st || typeof IntelOperations === 'undefined') return [];
    sid = String(sid);
    const neighborStates = new Set(SuperWeapons.neighboringStates(sid));
    const result = [];
    (s.atWar || []).forEach(tag => {
      if (tag === s.country) return;
      let forces = null;
      try { forces = IntelOperations.forces(tag); } catch (e) { forces = null; }
      (forces?.divisions || []).forEach(dv => {
        if (!dv || dv.defeated) return;
        const dvSid = dv.sid != null ? String(dv.sid) : String(MapRenderer.stateOf(dv.pid));
        if (dvSid !== sid) {
          if (!neighborStates.has(dvSid)) return;
          const engaged = (BattleManager.battles || []).some(x =>
            String(x.stateId) === dvSid && (x.attacker === tag || x.defender === tag));
          if (!engaged) return;
        }
        result.push(dv);
      });
    });
    return result;
  }
  /** 核攻撃のデータ被害 (施設・師団・戦意/安定度) */
  static applyNukeDamage(sid) {
    const s = CoreEngine.gameState, d = SuperWeapons.data(), st = MapRenderer.states[sid];
    if (!st) return null;
    sid = String(sid);
    const b = (st.b ||= {});
    // 1. インフラ・工場・合成ゴム・原子炉を完全破壊 (レベル 0)
    const PRIMARY = ['infrastructure', 'industrial_complex', 'arms_factory', 'synthetic_refinery', 'nuclear_reactor'];
    const destroyed = [];
    PRIMARY.forEach(key => {
      if (Number(b[key]) > 0) { destroyed.push({ key, level: Number(b[key]) }); b[key] = 0; }
    });
    // 付随施設 (工廠・要塞・飛行場など) も瓦礫化
    const SECONDARY = ['dockyard', 'air_base', 'land_fort', 'coastal_bunker', 'supply_hub'];
    const wrecked = [];
    SECONDARY.forEach(key => {
      if (Number(b[key]) > 0) { wrecked.push({ key, level: Number(b[key]) }); b[key] = 0; }
    });
    st.supply = 0;
    st.nuked = SuperWeapons.day();
    st.ruined = SuperWeapons.day();
    if (typeof TradeSystem !== 'undefined' && st.res) Object.keys(st.res).forEach(k => { st.res[k] = Math.round(st.res[k] * 0.5); });

    // 2. 師団の壊滅 (組織率・耐久値を 90% 以上カット)
    const ownDivs = SuperWeapons.divisionsIn(sid);
    ownDivs.forEach(dv => {
      dv.org = Math.max(0, (Number(dv.org) || 0) * 0.05);
      dv.equipmentStrength = Math.max(0, (Number.isFinite(dv.equipmentStrength) ? dv.equipmentStrength : 100) * 0.05);
    });
    const enemyDivs = SuperWeapons.enemyDivisionsIn(sid);
    enemyDivs.forEach(dv => {
      dv.org = Math.max(0, (Number.isFinite(dv.org) ? dv.org : 100) * 0.05);
      dv.strength = Math.max(0, (Number.isFinite(dv.strength) ? dv.strength : 100) * 0.05);
      dv.routed = true;
    });
    // 90% 以上を即座に崩壊 (敗走) させる
    // 90% 以上 (端数は切り上げ) を即座に壊滅させる
    const collapse = Math.max(0, Math.ceil(enemyDivs.length * 0.9));
    enemyDivs.slice(0, collapse).forEach(dv => { dv.defeated = true; });

    // 交戦中の州: 防御線が崩壊し攻撃側が突破する
    const battleList = typeof BattleManager !== 'undefined' ? (BattleManager.battles || []) : [];
    const battles = battleList.filter(x =>
      String(x.stateId) === sid || String(MapRenderer.stateOf(x.provId)) === sid);
    battles.forEach(x => {
      x.defense = Math.max(1, (Number(x.defense) || 1) * 0.1);
      x.breakthrough = Math.max(0, (Number(x.breakthrough) || 0) * 0.1);
      x.advantage = Math.min(1, (Number(x.advantage) || 0) + 0.45);
      x.progress = Math.min(0.98, (Number(x.progress) || 0) + 0.35);
    });

    // 3. 戦意 (War Support) と安定度の大幅低下
    const fx = ((s.countryEffects ||= {})[st.owner] ||= { country: st.owner, stability: 50, warSupport: 50, popularity: {} });
    const beforeWs = Number.isFinite(fx.warSupport) ? fx.warSupport : 50;
    const beforeStab = Number.isFinite(fx.stability) ? fx.stability : 50;
    // 戦意・安定度は 15〜30% 低下 (被害の大きさで変動)
    const wsDrop = 15 + Math.floor(Math.random() * 16);
    const stabDrop = 15 + Math.floor(Math.random() * 16);
    fx.warSupport = Math.max(0, beforeWs - wsDrop);
    fx.stability = Math.max(0, beforeStab - stabDrop);
    const wsLoss = Math.round(beforeWs - fx.warSupport);
    const stabLoss = Math.round(beforeStab - fx.stability);

    // 統計 (右側のターゲット履歴・累積ダメージ)
    const dmg = (d.damage[st.owner] ||= { country: st.owner, warSupport: 0, stability: 0, strikes: 0, states: {} });
    dmg.warSupport += wsLoss; dmg.stability += stabLoss; dmg.strikes += 1;
    const entry = (dmg.states[sid] ||= { name: st.name || ('州' + sid), count: 0 });
    entry.count += 1;
    d.history.unshift({
      day: SuperWeapons.day(), sid, name: st.name || ('州' + sid), owner: st.owner,
      warSupport: wsLoss, stability: stabLoss, divisions: enemyDivs.length, collapsed: collapse,
      buildings: destroyed.length + wrecked.length, destroyed, wrecked
    });
    d.history = d.history.slice(0, 60);

    // 敵の抽象戦力にも大打撃
    if (typeof AIManager !== 'undefined' && AIManager.state?.strength?.[st.owner]) AIManager.state.strength[st.owner] *= 0.5;
    if (typeof PeaceSystem !== 'undefined') {
      try {
        const sc = PeaceSystem.score(s.country); sc.vp += 5; sc.kills += Math.max(1, Math.round(enemyDivs.length * 0.5));
        // 戦意・安定度の崩壊で降伏条件 (残存VP 25% 未満) に近づいたかを再判定
        if (typeof PeaceSystem.checkCapitulations === 'function') PeaceSystem.checkCapitulations();
      } catch (e) { /* ignore */ }
    }
    s.warSupport = Math.min(100, (Number(s.warSupport) || 0) + 5);
    s.stability = Math.max(0, (Number(s.stability) || 0) - 3);

    MapRenderer.addNukeEffectAtState?.(sid);
    MapRenderer.invalidateModes?.();
    return { destroyed, wrecked, ownDivs: ownDivs.length, enemyDivs: enemyDivs.length, collapse, battles: battles.length, wsLoss, stabLoss, warSupport: fx.warSupport, stability: fx.stability };
  }
  static launchNuke(sid) {
    sid = String(sid);
    const s = CoreEngine.gameState, d = SuperWeapons.data(), st = MapRenderer.states[sid];
    if (!st || !SuperWeapons.canNuke(sid)) { GameUI.notify('核攻撃の条件を満たしていません。', 'alert'); return false; }
    s.nuclearStockpile = Math.max(0, (Number(s.nuclearStockpile) || 0) - 1);
    d.strikes = (d.strikes || 0) + 1;
    d.strikeDay[sid] = SuperWeapons.day();
    GameUI.closeModal?.();
    SuperWeapons.stopTargeting({ silent: true });
    SuperWeapons.playNukeFX(sid);
    const result = SuperWeapons.applyNukeDamage(sid);
    CoreEngine.addWorldTension?.(15, (st.name || '州' + sid) + ' への核攻撃');
    const destroyedText = result ? result.destroyed.map(item => item.key + '×' + item.level).join(' ') : '';
    d.log.unshift({ day: SuperWeapons.day(), text: '☢️ ' + (st.name || '州' + sid) + ' (' + SuperWeapons.nameOf(st.owner) + ') に核攻撃 — 破壊: ' + (destroyedText || 'なし') + ' ／ 敵師団 ' + (result?.enemyDivs || 0) + ' (壊滅 ' + (result?.collapse || 0) + ') ／ 戦意 −' + (result?.wsLoss || 0) + '%' });
    CoreEngine.log('💥 核攻撃実行！ ' + (st.name || sid) + ' に原子爆弾を投下 — 施設全壊・師団壊滅・' + SuperWeapons.nameOf(st.owner) + ' の戦意 −' + (result?.wsLoss || 0) + '% / 安定度 −' + (result?.stabLoss || 0) + '%');
    GameUI.notify('☢️ ' + (st.name || sid) + ' に核攻撃を実行しました (戦意 −' + (result?.wsLoss || 0) + '%)', 'alert');
    if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) { try { NewsManager.fireCustom({ icon: '☢️', title: '原子爆弾が ' + (st.name || sid) + ' に投下される', body: SuperWeapons.nameOf(s.country) + ' が投下した一発の爆弾が ' + (st.name || sid) + ' を消し去った。' + SuperWeapons.nameOf(st.owner) + ' の士気は大きく揺らいでいる。', reactions: ['恐怖だ…これが新時代か', '研究を急げ!', 'この戦争は終わるだろう'] }); } catch (e) { /* ignore */ } }
    if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'nuclear_strike', target: st.name || sid, attacker: s.country });
    CoreEngine.renderStats?.(); if (typeof BattlePlanManager !== 'undefined') BattlePlanManager.renderPanel?.();
    SuperWeapons.renderTopbar();
    setTimeout(() => { if (WindowManager.isOpen?.('superweapons')) SuperWeapons.render(); }, 100);
    return true;
  }
  /** 全画面フラッシュ＋対象州の中心にキノコ雲＋爆発音 */
  static playNukeFX(sid) {
    if (typeof document === 'undefined' || !document || !document.body?.appendChild) return;
    try { if (typeof NuclearManager !== 'undefined' && NuclearManager.playNukeAnimation) NuclearManager.playNukeAnimation(); } catch (e) { /* ignore */ }
    const point = SuperWeapons.screenPointOf(sid);
    const o = document.createElement('div'); o.className = 'sw-nuke-fx';
    o.style.setProperty('--sw-x', point.x + 'px');
    o.style.setProperty('--sw-y', point.y + 'px');
    o.innerHTML = '<div class="sw-flash"></div><div class="sw-shock"></div><div class="sw-mushroom"><div class="sw-cap"></div><div class="sw-stem"></div><div class="sw-base"></div></div><div class="sw-telop">☢️ NUCLEAR STRIKE ☢️<small>' + SuperWeapons.esc(MapRenderer.states[sid]?.name || '') + '</small></div>';
    document.body.appendChild(o);
    SuperWeapons.playNukeSound();
    setTimeout(() => { try { o.remove(); } catch (e) { /* ignore */ } }, 4200);
  }
  /** 対象州の画面座標 (キノコ雲・衝撃波の基準点) */
  static screenPointOf(sid) {
    const fallback = { x: (typeof window !== 'undefined' ? window.innerWidth : 960) / 2, y: (typeof window !== 'undefined' ? window.innerHeight : 720) * 0.55 };
    try {
      const center = MapRenderer.stateCenter.get(String(sid));
      if (!center || typeof MapRenderer.worldToScreen !== 'function' || !MapRenderer.canvas) return fallback;
      const screen = MapRenderer.worldToScreen(center[0], center[1]);
      const rect = MapRenderer.canvas.getBoundingClientRect();
      const scaleX = MapRenderer.canvas.width ? rect.width / MapRenderer.canvas.width : 1;
      const scaleY = MapRenderer.canvas.height ? rect.height / MapRenderer.canvas.height : 1;
      return { x: rect.left + screen[0] * scaleX, y: rect.top + screen[1] * scaleY };
    } catch (error) { return fallback; }
  }
  /** 爆発音 (WebAudio。音声アセット不要) */
  static playNukeSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      SuperWeapons._audio ||= new AC();
      const ctx = SuperWeapons._audio;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(74, now);
      osc.frequency.exponentialRampToValueAtTime(22, now + 1.5);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.5, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 2.5);
      const frames = Math.floor(ctx.sampleRate * 1.8);
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.2);
      const src = ctx.createBufferSource(); src.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 1.6);
      const noiseGain = ctx.createGain(); noiseGain.gain.setValueAtTime(0.32, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      src.connect(filter); filter.connect(noiseGain); noiseGain.connect(ctx.destination);
      src.start(now);
    } catch (error) { /* 音声が使えない環境では無視 */ }
  }

  // ------------------------------------------------------------------
  // ミサイル攻撃
  // ------------------------------------------------------------------
  static startMissile(sid) {
    const d = SuperWeapons.data(), st = MapRenderer.states[sid];
    if (!st || !SuperWeapons.canMissile(sid)) { GameUI.notify('ミサイル攻撃の条件を満たしていません。', 'alert'); return; }
    if (d.missions.some(m => m.sid === String(sid))) return;
    const site = SuperWeapons.siteFor(sid);
    d.missions.push({ sid: String(sid), from: site.sid, since: SuperWeapons.day(), fired: 0, damage: 0 });
    CoreEngine.log('🚀 ' + (st.name || sid) + ' へのミサイル攻撃を開始 (発射: ' + (site.st.name || site.sid) + ')');
    GameUI.notify('🚀 ' + (st.name || sid) + ' へのミサイル攻撃を開始しました', 'success');
    GameUI.closeModal?.(); SuperWeapons.missileTick(d.missions[d.missions.length - 1]); SuperWeapons.renderTopbar();
  }
  static stopMissile(sid) { const d = SuperWeapons.data(); d.missions = d.missions.filter(m => m.sid !== String(sid)); GameUI.closeModal?.(); CoreEngine.log('🚀 ミサイル攻撃を停止'); SuperWeapons.render(); }
  static missileTick(m) {
    const d = SuperWeapons.data(), st = MapRenderer.states[m.sid]; if (!st || SuperWeapons.rockets() < 1) return;
    if (!SuperWeapons.siteFor(m.sid)) return;   // 射程外 (施設喪失)
    d.rockets -= 1; m.fired++;
    const mult = SuperWeapons.done('ballistic') ? 1.5 : 1, b = (st.b ||= {}); const hits = [];
    const r = Math.random();
    if (r < 0.4 * mult && (b.infrastructure || 0) > 0) { b.infrastructure--; st.supply = Math.max(0, (st.supply || 0) - 1); hits.push('インフラ −1'); }
    else if (r < 0.65 * mult && (b.fort || 0) > 0) { b.fort--; hits.push('要塞 −1'); }
    else if (r < 0.8 * mult && ((b.industrial_complex || 0) + (b.arms_factory || 0)) > 0) { if (b.arms_factory) { b.arms_factory--; hits.push('軍需工場 −1'); } else { b.industrial_complex--; hits.push('民需工場 −1'); } }
    const divs = SuperWeapons.divisionsIn(m.sid); divs.forEach(dv => { dv.org = Math.max(0, (dv.org || 0) - 8 * mult); dv.equipmentStrength = Math.max(0, (Number.isFinite(dv.equipmentStrength) ? dv.equipmentStrength : 100) - 3 * mult); });
    if (divs.length) hits.push('師団 ' + divs.length + ' に損害');
    if (typeof AIManager !== 'undefined' && AIManager.state?.strength?.[st.owner]) AIManager.state.strength[st.owner] *= (1 - 0.005 * mult);
    m.damage += hits.length;
    if (hits.length) { MapRenderer.invalidateModes?.(); d.log.unshift({ day: SuperWeapons.day(), text: '🚀 ' + (st.name || m.sid) + ' にミサイル着弾 — ' + hits.join('・') }); d.log = d.log.slice(0, 60); }
    if (SuperWeapons.rockets() < 1) GameUI.notify('🚀 ロケットの備蓄が尽きました — ミサイル攻撃は再生産まで停止', 'alert');
  }

  // ------------------------------------------------------------------
  // UI: 特殊計画ウィンドウ
  // ------------------------------------------------------------------
  static render() {
    const el = document.getElementById('superweapons-content'); if (!el) return;
    const s = CoreEngine.gameState, d = SuperWeapons.data(); if (!d) return;
    const reactors = SuperWeapons.facilities('nuclear_reactor');
    const sites = SuperWeapons.facilities('rocket_site');
    let html = '<div class="sw-root"><header class="sw-head">' +
      '<div class="sw-mark">☢</div><div class="sw-head-text"><h3>終末兵器・特殊計画 <small>NUCLEAR &amp; STRATEGIC WEAPONS</small></h3>' +
      '<p>原子炉で核兵器を生産し、制空権 75% 以上の戦略空域へ戦略爆撃機／ミサイルで投下します。' +
      '空き民需工場 <b>' + SuperWeapons.allocFree() + '</b> ／ 人的資源 <b>' + Math.floor(s.manpower || 0).toLocaleString() + '</b></p></div>' +
      SuperWeapons.renderKpis(d, reactors, sites) + '</header>' +
      '<div class="sw-layout">' +
      '<section class="sw-col sw-col-left" aria-label="研究・生産進捗">' + SuperWeapons.renderLeftColumn(d, reactors, sites) + '</section>' +
      '<section class="sw-col sw-col-center" aria-label="備蓄・運用">' + SuperWeapons.renderCenterColumn(d, reactors, sites) + '</section>' +
      '<section class="sw-col sw-col-right" aria-label="ターゲット履歴・統計">' + SuperWeapons.renderRightColumn(d) + '</section>' +
      '</div></div>';
    el.innerHTML = html;
  }
  static allocFree() {
    try { return typeof FactoryBudget !== 'undefined' ? FactoryBudget.availableCivilian() : 0; } catch (e) { return 0; }
  }
  static monthlyNukeRate(reactors) {
    if (!SuperWeapons.done('atomic')) return 0;
    return reactors.reduce((sum, f) => sum + f.level, 0) * SuperWeapons.NUKE_RATE * 30;
  }
  static monthlyRocketRate(sites) {
    if (!SuperWeapons.done('v2')) return 0;
    return sites.reduce((sum, f) => sum + f.level, 0) * SuperWeapons.ROCKET_RATE * 30;
  }
  static renderKpis(d, reactors, sites) {
    const nukes = SuperWeapons.nukes(), rockets = SuperWeapons.rockets();
    const reactorLevels = reactors.reduce((sum, f) => sum + f.level, 0);
    return '<div class="sw-kpis">' +
      '<div class="sw-kpi nuke"><small>核兵器の備蓄</small><b>☢ ' + nukes + '</b><span>原子炉 Lv' + reactorLevels + ' → +' + SuperWeapons.monthlyNukeRate(reactors).toFixed(1) + ' /月</span></div>' +
      '<div class="sw-kpi rocket"><small>ロケット備蓄</small><b>🚀 ' + rockets + '</b><span>発射施設 Lv' + sites.reduce((sum, f) => sum + f.level, 0) + ' → +' + SuperWeapons.monthlyRocketRate(sites).toFixed(0) + ' /月</span></div>' +
      '<div class="sw-kpi"><small>核攻撃</small><b>' + (d.strikes || 0) + ' 回</b><span>履歴 ' + (d.history || []).length + ' 件</span></div>' +
      '</div>';
  }

  // ------------------------------------------------------------------
  // 左: 研究・生産進捗
  // ------------------------------------------------------------------
  static renderLeftColumn(d, reactors, sites) {
    const techs = [['原子物理学', /atomic|nuclear|uranium/i], ['ロケット工学', /rocket/i], ['ジェットエンジン', /jet/i]];
    let html = '<div class="sw-panel"><h4>🔬 基礎研究</h4><div class="sw-chips">' +
      techs.map(([name, re]) => '<span class="' + (SuperWeapons.researched(re) ? 'ok' : '') + '">' + (SuperWeapons.researched(re) ? '✅' : '⬜') + ' ' + name + '</span>').join('') +
      '<button class="sw-btn small" onclick="GameUI.switchTab(\'research\')">研究画面</button></div></div>';

    html += '<div class="sw-panel"><h4>⚛️ 特殊計画の進捗 <small>科学者 + 民需工場</small></h4><div class="sw-projects">' +
      Object.values(SuperWeapons.PROJECTS).map(P => SuperWeapons.renderProjectCard(d, P)).join('') + '</div></div>';

    const reactorRate = SuperWeapons.monthlyNukeRate(reactors);
    html += '<div class="sw-panel"><h4>☢️ 原子炉 <small>州ごとの生産</small></h4>' +
      (reactors.length
        ? '<table class="sw-table"><thead><tr><th>州</th><th>Lv</th><th>月産</th></tr></thead><tbody>' +
          reactors.map(f => '<tr><td>' + SuperWeapons.esc(f.st.name || ('州' + f.sid)) + '</td><td>Lv' + f.level + '</td><td>+' + (SuperWeapons.done('atomic') ? (f.level * SuperWeapons.NUKE_RATE * 30).toFixed(1) : '0') + ' 発</td></tr>').join('') +
          '</tbody><tfoot><tr><th>合計</th><th>Lv' + reactors.reduce((n, f) => n + f.level, 0) + '</th><th>+' + reactorRate.toFixed(1) + ' 発/月</th></tr></tfoot></table>'
        : '<p class="sw-help">原子炉がありません。' + (SuperWeapons.done('uranium') ? '建設画面 → 州を選択 → ☢️ 原子炉 (600)。' : '「ウラン濃縮計画」を完了すると建設できます。') + '</p>') +
      '<div class="sw-inline"><button class="sw-btn small" onclick="GameUI.switchTab(\'construction\')">🏗️ 建設画面</button>' +
      '<span class="sw-help">' + (SuperWeapons.done('atomic') ? '核兵器生産中' : '「原子爆弾」完了後に生産開始') + '</span></div></div>';

    html += '<div class="sw-panel"><h4>🚀 ロケット発射施設 <small>射程 ' + SuperWeapons.missileRange() + '</small></h4>' +
      (sites.length
        ? '<table class="sw-table"><thead><tr><th>州</th><th>Lv</th><th>月産</th></tr></thead><tbody>' +
          sites.map(f => '<tr><td>' + SuperWeapons.esc(f.st.name || ('州' + f.sid)) + '</td><td>Lv' + f.level + '</td><td>+' + (f.level * SuperWeapons.ROCKET_RATE * 30).toFixed(0) + ' 発</td></tr>').join('') +
          '</tbody></table>'
        : '<p class="sw-help">発射施設がありません。' + (SuperWeapons.done('v2') ? '建設画面 → 州を選択 → 🚀 ロケット発射施設 (400)。' : '「V2ロケット開発」を完了すると建設できます。') + '</p>') + '</div>';

    const busy = {}; Object.entries(d.projects).forEach(([id, p]) => { if (p.scientist) busy[p.scientist] = id; });
    html += '<details class="sw-panel sw-details"><summary>👩‍🔬 科学者名簿 (' + SuperWeapons.SCIENTISTS.length + ' 名)</summary><div class="sw-roster">' +
      SuperWeapons.SCIENTISTS.map(x => '<div class="sw-sci-card' + (busy[x.id] ? ' busy' : '') + '">' + SuperWeapons.portrait(x) + '<b>' + SuperWeapons.esc(SuperWeapons.sciName(x)) + '</b><small>' + SuperWeapons.esc(x.title) + '</small><span class="sw-field ' + x.field + '">' + SuperWeapons.FIELD_NAME[x.field] + ' ×' + x.skill + '</span>' + (busy[x.id] ? '<em>' + SuperWeapons.esc(SuperWeapons.PROJECTS[busy[x.id]].name) + '</em>' : '') + '</div>').join('') + '</div></details>';
    return html;
  }
  static renderProjectCard(d, P) {
    const p = d.projects[P.id], block = SuperWeapons.blocker(P.id), sc = SuperWeapons.scientistOf(P.id);
    const pct = Math.min(100, p.progress / P.points * 100), rate = SuperWeapons.rate(P.id);
    const eta = p.started && rate > 0 ? Math.ceil((P.points - p.progress) / rate) : null;
    const scis = SuperWeapons.SCIENTISTS.filter(x => SuperWeapons.fits(x, P.id));
    const status = p.done ? '✅ 完了' : p.started ? '🔄 進行中' : block ? '🔒 未解禁' : '待機';
    return '<div class="sw-project' + (p.done ? ' done' : p.started ? ' active' : block ? ' locked' : '') + '">' +
      '<div class="sw-project-head"><span class="sw-ic">' + P.icon + '</span><div><b>' + P.name + '</b><small>' + SuperWeapons.esc(P.desc) + '</small></div><span class="sw-status">' + status + '</span></div>' +
      '<div class="sw-bar"><em style="width:' + pct.toFixed(1) + '%"></em><span>' + pct.toFixed(0) + '% (' + Math.floor(p.progress) + ' / ' + P.points + ')' + (eta ? ' ／ あと ' + eta + ' 日' : '') + '</span></div>' +
      (block && !p.done ? '<p class="sw-req">🔒 ' + SuperWeapons.esc(block) + '</p>' : '') +
      (!p.done
        ? '<div class="sw-controls">' +
          '<label>科学者<select ' + (block ? 'disabled' : '') + ' onchange="SuperWeapons.assign(\'' + P.id + '\', this.value)"><option value="">— 未割り当て —</option>' + scis.map(x => '<option value="' + x.id + '"' + (sc && sc.id === x.id ? ' selected' : '') + '>' + SuperWeapons.esc(SuperWeapons.sciName(x)) + ' (×' + x.skill + ')</option>').join('') + '</select></label>' +
          '<label>民需工場<span class="sw-pm"><button ' + (block ? 'disabled' : '') + ' onclick="SuperWeapons.setFactories(\'' + P.id + '\',' + (p.factories - 1) + ')">−</button><b>' + p.factories + '</b><button ' + (block ? 'disabled' : '') + ' onclick="SuperWeapons.setFactories(\'' + P.id + '\',' + (p.factories + 1) + ')">＋</button></span></label>' +
          '<b class="sw-rate" title="進捗/日">+' + rate.toFixed(1) + '/日</b>' +
          (p.started
            ? '<button class="sw-btn small" onclick="SuperWeapons.pause(\'' + P.id + '\')">⏸ 中断</button>'
            : '<button class="sw-btn small primary" ' + (block ? 'disabled' : '') + ' onclick="SuperWeapons.start(\'' + P.id + '\')">▶ 開始</button>') +
          '</div>'
        : '<p class="sw-unlock">🔓 ' + SuperWeapons.esc(P.unlocks) + '</p>') +
      '</div>';
  }

  // ------------------------------------------------------------------
  // 中央: 備蓄・運用
  // ------------------------------------------------------------------
  static renderCenterColumn(d, reactors, sites) {
    const s = CoreEngine.gameState;
    const nukes = SuperWeapons.nukes();
    const bombs = nukes > 0 ? Array.from({ length: Math.min(nukes, 15) }, () => '<span class="sw-bomb">☢</span>').join('') + (nukes > 15 ? '<span class="sw-more">+' + (nukes - 15) + '</span>' : '') : '<span class="sw-help">備蓄なし</span>';
    let html = '<div class="sw-panel sw-center-nuke"><h4>☢️ 核兵器の備蓄 <small>Nuclear Stockpile</small></h4>' +
      '<div class="sw-stock-summary"><b class="sw-big">' + nukes + '<small>発</small></b><div><span>' + (SuperWeapons.done('atomic') ? '生産 +' + SuperWeapons.monthlyNukeRate(reactors).toFixed(1) + ' 発/月' : '「原子爆弾」未完了') + '</span><span>使用可能: ' + (nukes > 0 ? 'あり' : 'なし') + '</span></div></div>' +
      '<div class="sw-bombs">' + bombs + '</div>' +
      '<button class="sw-launch-btn" onclick="SuperWeapons.startTargeting()" ' + (nukes < 1 || !SuperWeapons.done('atomic') ? 'disabled' : '') + '>🎯 核攻撃モード (Launch Nuke)</button>' +
      '<p class="sw-help">ボタンを押すとカーソルが照準に変わり、マップが核攻撃ターゲット選択状態になります。対象の敵州を左クリック → 確認ダイアログで「実行」。</p></div>';

    // 運搬手段
    const wings = (typeof AirForce !== 'undefined' && AirForce.wings ? AirForce.wings() : []).filter(w => w.aircraftType === 'bomber' && Number(w.aircraftCount) > 0);
    const abstract = Math.max(0, Math.floor(Number(s.strategicBombers) || 0));
    html += '<div class="sw-panel"><h4>✈️ 戦略爆撃機 <small>核運搬手段</small></h4>' +
      '<div class="sw-delivery"><div class="sw-delivery-row"><span>☢️ 戦略爆撃機</span><b>' + (wings.reduce((n, w) => n + (Number(w.aircraftCount) || 0), 0) + abstract) + ' 機</b></div>' +
      (wings.length ? '<div class="sw-wing-list">' + wings.map(w => {
        const base = MapRenderer.states[w.baseStateId]?.name || (w.base ? '前線基地' : '—');
        return '<div class="sw-wing"><span>🛫 ' + SuperWeapons.esc(w.name || '航空隊') + '</span><b>×' + (Number(w.aircraftCount) || 0) + '</b><small>' + SuperWeapons.esc(base) + ' ／ 航続 ' + (Number(w.range) || 450) + '</small></div>';
      }).join('') + '</div>' : '<p class="sw-help">空軍ウィンドウで戦略爆撃機の航空隊を基地へ配備してください。</p>') +
      (abstract ? '<p class="sw-help">予備の戦略爆撃機 ' + abstract + ' 機 (全国値)</p>' : '') +
      '<div class="sw-inline"><button class="sw-btn small" onclick="GameUI.switchTab(\'airforce\')">✈️ 空軍ウィンドウ</button></div></div>';

    html += '<div class="sw-panel"><h4>🚀 ミサイル <small>ロケット / 弾道ミサイル</small></h4>' +
      '<div class="sw-delivery-row"><span>🚀 備蓄ロケット</span><b>' + SuperWeapons.rockets() + ' 発</b></div>' +
      '<div class="sw-delivery-row"><span>🎯 射程内の発射施設</span><b>' + sites.length + ' か所</b></div>' +
      (d.missions.length ? '<h5>進行中のミサイル攻撃</h5>' + d.missions.map(m => {
        const st = MapRenderer.states[m.sid];
        return '<div class="sw-mission"><span>🚀 ' + SuperWeapons.esc(st?.name || m.sid) + ' (' + SuperWeapons.esc(SuperWeapons.nameOf(st?.owner)) + ') ／ 発射 ' + m.fired + ' 発 ／ 命中 ' + m.damage + '</span><button class="sw-btn small" onclick="SuperWeapons.stopMissile(\'' + m.sid + '\')">停止</button></div>';
      }).join('') : '<p class="sw-help">ミサイル攻撃はマップの敵州をクリック →「ミサイル攻撃」から開始します。</p>') + '</div>';

    // 攻撃可能な州 (クイックターゲット)
    const candidates = SuperWeapons.targetCandidates(10);
    html += '<div class="sw-panel"><h4>🎯 攻撃対象候補 <small>敵州 (VP順)</small></h4>' +
      (candidates.length ? '<div class="sw-candidates">' + candidates.map(c =>
        '<button class="sw-candidate' + (c.ready ? ' ready' : '') + '" onclick="SuperWeapons.confirmStrike(\'' + c.sid + '\')">' +
        '<span class="sw-cand-name">' + SuperWeapons.esc(c.name) + '</span>' +
        '<span class="sw-cand-owner">' + SuperWeapons.esc(SuperWeapons.nameOf(c.owner)) + ' · VP' + c.vp + '</span>' +
        '<span class="sw-cand-state">' + (c.ready ? '✅ 発動可能' : '❌ ' + c.okCount + '/' + c.checks.length) + '</span></button>').join('') + '</div>'
        : '<p class="sw-help">交戦中の敵国がありません。</p>') + '</div>';

    html += '<div class="sw-panel"><h4>ℹ️ 発動条件</h4><ol class="sw-help-list">' +
      '<li>国家の核備蓄が 1 以上</li><li>対象州の戦略空域で制空権 75% 以上</li>' +
      '<li>戦略爆撃機またはミサイルが配備されている</li></ol></div>';
    return html;
  }

  // ------------------------------------------------------------------
  // 右: ターゲット履歴・統計
  // ------------------------------------------------------------------
  static renderRightColumn(d) {
    const damage = Object.values(d.damage || {}).sort((a, b) => b.warSupport - a.warSupport);
    let html = '<div class="sw-panel"><h4>📊 累積戦略ダメージ <small>戦意 / 安定度</small></h4>' +
      (damage.length
        ? '<table class="sw-table sw-damage-table"><thead><tr><th>国</th><th>攻撃</th><th>戦意</th><th>安定度</th></tr></thead><tbody>' +
          damage.map(x => '<tr><td>' + SuperWeapons.esc(SuperWeapons.nameOf(x.country)) + '</td><td>' + x.strikes + '</td><td class="down">−' + x.warSupport + '%</td><td class="down">−' + x.stability + '%</td></tr>').join('') +
          '</tbody></table>'
        : '<p class="sw-help">核攻撃の履歴はありません。</p>') + '</div>';

    html += '<div class="sw-panel"><h4>☢️ ターゲット履歴 <small>過去の核攻撃</small></h4>' +
      ((d.history || []).length
        ? '<div class="sw-history">' + d.history.slice(0, 20).map(h =>
          '<div class="sw-history-row"><div><b>' + SuperWeapons.esc(h.name) + '</b> <small>' + SuperWeapons.esc(SuperWeapons.nameOf(h.owner)) + ' · Day ' + h.day + '</small></div>' +
          '<div class="sw-history-fx"><span>戦意 −' + h.warSupport + '%</span><span>安定度 −' + h.stability + '%</span><span>師団 ' + h.divisions + ' (壊滅 ' + h.collapsed + ')</span><span>施設 ' + h.buildings + '</span></div></div>').join('') + '</div>'
        : '<p class="sw-help">まだ核攻撃を行っていません。</p>') + '</div>';

    html += '<div class="sw-panel"><h4>📜 記録 <small>核攻撃 ' + (d.strikes || 0) + ' 回</small></h4><div class="sw-log">' +
      ((d.log || []).length ? d.log.slice(0, 30).map(e => '<div><small>Day ' + e.day + '</small> ' + SuperWeapons.esc(e.text) + '</div>').join('') : '<span class="sw-help">記録はありません。</span>') + '</div></div>';
    return html;
  }
  /** 攻撃対象候補 (交戦中の敵州を VP 順に) */
  static targetCandidates(limit = 12) {
    if (typeof MapRenderer === 'undefined' || !MapRenderer.states) return [];
    const s = CoreEngine.gameState;
    const enemies = new Set(s.atWar || []);
    if (!enemies.size) return [];
    return Object.entries(MapRenderer.states)
      .filter(([, st]) => enemies.has(st.owner))
      .map(([sid, st]) => ({ sid, st, vp: Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) }))
      .sort((a, b) => b.vp - a.vp)
      .slice(0, limit)
      .map(item => {
        let checks = [];
        try { checks = SuperWeapons.nukeChecks(item.sid); } catch (e) { checks = []; }
        const okCount = checks.filter(c => c.ok).length;
        return { sid: item.sid, name: item.st.name || ('州' + item.sid), owner: item.st.owner, vp: item.vp, checks, okCount, ready: checks.length > 0 && okCount === checks.length };
      });
  }
}
if (typeof window !== 'undefined') window.SuperWeapons = SuperWeapons;
