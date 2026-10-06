/* ==========================================================
 * research-i18n.js — 研究システム日本語化 & 火力データ
 * ----------------------------------------------------------
 * - 英語の技術タイトルを日本語に翻訳 (国別の兵器名付き)
 * - 1936年以前の技術はゲーム開始時に研究済みとする
 * - 各技術に火力 (firepower) 数値を付与し、戦闘の優劣に反映
 * - 技術を年代順にソート
 * ========================================================== */
'use strict';

const ResearchI18n = {
  // ---- 国別の歩兵装備名 (年代順) ----
  INFANTRY_WEAPONS: {
    GER: [
      { year: 1918, name: 'Gewehr 98' },
      { year: 1936, name: 'Kar98k' },
      { year: 1939, name: 'Kar98k改良型' },
      { year: 1942, name: 'StG44突撃銃' }
    ],
    JAP: [
      { year: 1918, name: '30式歩兵銃' },
      { year: 1936, name: '38式歩兵銃' },
      { year: 1939, name: '99式小銃' },
      { year: 1942, name: '100式機関短銃' }
    ],
    SOV: [
      { year: 1918, name: 'Mosin-Nagant M1891' },
      { year: 1936, name: 'Mosin-Nagant M1891/30' },
      { year: 1939, name: 'SVT-40' },
      { year: 1942, name: 'PPSh-41' }
    ],
    USA: [
      { year: 1918, name: 'M1903 Springfield' },
      { year: 1936, name: 'M1 Garand' },
      { year: 1939, name: 'M1 Carbine' },
      { year: 1942, name: 'M2 Carbine' }
    ],
    ENG: [
      { year: 1918, name: 'Lee-Enfield No.1' },
      { year: 1936, name: 'Lee-Enfield No.4' },
      { year: 1939, name: 'Sten MK-II' },
      { year: 1942, name: 'Sten MK-V' }
    ],
    FRA: [
      { year: 1918, name: 'Lebel 1886' },
      { year: 1936, name: 'MAS-36' },
      { year: 1939, name: 'MAS-38' },
      { year: 1942, name: 'MAS-44' }
    ],
    ITA: [
      { year: 1918, name: 'Carcano 1891' },
      { year: 1936, name: 'Carcano M38' },
      { year: 1939, name: 'Beretta M38' },
      { year: 1942, name: 'Beretta M38/42' }
    ]
  },

  // ---- 汎用技術タイトル翻訳 (カテゴリ別) ----
  // tech ID のパターンに基づいて日本語名を生成
  TITLE_MAP: {
    // 歩兵
    infantry_weapons: '歩兵装備',
    tech_trucks: 'トラック技術',
    infantry_weapons1: '歩兵装備I',
    infantry_weapons2: '歩兵装備II',
    infantry_weapons3: '歩兵装備III',
    infantry_weapons4: '歩兵装備IV',
    infantry_weapons5: '歩兵装備V',
    // 機甲
    armor: '戦車',
    basic_armor: '基本戦車',
    improved_armor: '改良戦車',
    advanced_armor: '発展型戦車',
    modern_armor: '現代戦車',
    super_heavy_armor: '超重戦車',
    heavy_armor: '重戦車',
    medium_armor: '中戦車',
    light_armor: '軽戦車',
    // 砲兵
    artillery: '砲兵',
    basic_artillery: '基本野砲',
    improved_artillery: '改良野砲',
    advanced_artillery: '発展型野砲',
    rocket_artillery: 'ロケット砲',
    anti_air: '対空砲',
    anti_tank: '対戦車砲',
    // 海軍
    small_ship_1: '1936年型基本型駆逐艦船体',
    small_ship_2: '1940年型改良型駆逐艦船体',
    basic_ship: '基本艦船',
    naval: '海軍',
    basic_ship: '基本艦船',
    improved_ship: '改良艦船',
    advanced_ship: '発展型艦船',
    destroyer: '駆逐艦',
    cruiser: '巡洋艦',
    battleship: '戦艦',
    carrier: '航空母艦',
    submarine: '潜水艦',
    // 空軍
    air: '空軍',
    basic_fighter: '基本戦闘機',
    improved_fighter: '改良戦闘機',
    advanced_fighter: '発展型戦闘機',
    jet_fighter: 'ジェット戦闘機',
    cas: '近接航空支援機',
    tac_bomber: '戦術爆撃機',
    strat_bomber: '戦略爆撃機',
    // 工兵
    engineering: '工兵',
    basic_engineering: '基本工兵',
    improved_engineering: '改良工兵',
    advanced_engineering: '発展型工兵',
    construction: '建設技術',
    // 産業
    industry: '産業',
    basic_industry: '基本産業',
    improved_industry: '改良産業',
    advanced_industry: '発展型産業',
    construction1: '建設I',
    construction2: '建設II',
    construction3: '建設III',
    production: '生産技術',
    tools: '工作機械',
    oil_processing: '石油精製'
  },

  // ---- カテゴリ別の火力基準値 ----
  // 各技術に付与される火力値 (高いほど戦闘で優勢になる)
  FIREPOWER_BASE: {
    infantry: 10,    // 歩兵装備: 基礎火力 10
    armor: 25,       // 戦車: 基礎火力 25
    artillery: 15,   // 砲兵: 基礎火力 15
    naval: 20,       // 海軍: 基礎火力 20
    air: 18,         // 空軍: 基礎火力 18
    engineering: 5,  // 工兵: 基礎火力 5
    industry: 0      // 産業: 火力なし (生産力に影響)
  },

  // ---- 技術の火力を計算 (カテゴリ + 技術レベル) ----
  calcFirepower(tech, category) {
    const base = ResearchI18n.FIREPOWER_BASE[category] || 0;
    if (base === 0) return 0;
    // 技術IDからレベルを推定 (数字が大きいほど上位)
    const levelMatch = tech.id?.match(/(\d+)$/);
    const level = levelMatch ? parseInt(levelMatch[1]) : 0;
    // 基礎火力 + レベル × 5 (上位技術ほど火力が高い)
    return Math.round(base + level * 5);
  },

  // ---- 歩兵装備の国別名を取得 ----
  infantryWeaponName(country, year) {
    const list = ResearchI18n.INFANTRY_WEAPONS[country] || ResearchI18n.INFANTRY_WEAPONS.GER;
    // 指定年以下で最も新しい装備名を返す
    let best = list[0];
    for (const w of list) {
      if (w.year <= year) best = w;
    }
    return best.name;
  },

  localizedText(keys, country) {
    const l10n = window.l10n;
    if (!l10n) return null;
    for (const key of keys.filter(Boolean)) {
      const text = l10n.t(key, country);
      if (text && text !== key) return text;
    }
    return null;
  },

  // ---- 技術タイトルを日本語化 ----
  translateTitle(tech, category, country) {
    const localized = ResearchI18n.localizedText([
      tech.loc_key,
      tech.localization_key,
      tech.id
    ], country);
    if (localized) return localized;

    // 歩兵装備系は国別の兵器名を使用
    if (category === 'infantry' && /infantry_weapons\d*/.test(tech.id || '')) {
      const year = tech.year || 1936;
      return ResearchI18n.infantryWeaponName(country, year);
    }
    // マッピングから検索
    const mapped = ResearchI18n.TITLE_MAP[tech.id];
    if (mapped) return mapped;
    // IDのパターンマッチング
    const id = tech.id || '';
    if (id.includes('armor')) return '戦車技術';
    if (id.includes('artillery')) return '砲兵技術';
    if (id.includes('naval') || id.includes('ship')) return '海軍技術';
    if (id.includes('air') || id.includes('fighter') || id.includes('bomber')) return '航空技術';
    if (id.includes('engineer')) return '工兵技術';
    if (id.includes('industry') || id.includes('production')) return '産業技術';
    // 元のタイトルが日本語でなければ汎用翻訳
    const title = tech.title || id;
    if (/^[A-Za-z\s\d]+$/.test(title)) {
      // 英語タイトルは技術IDベースの日本語名に
      return ResearchI18n.TITLE_MAP[category] || title;
    }
    return title;
  },

  // ---- 技術データを日本語化 & 火力付与 & ソート ----
  processTechData(techData, category, country) {
    if (!Array.isArray(techData)) return [];
    return techData.map(tech => {
      const translated = ResearchI18n.translateTitle(tech, category, country);
      const locKey = tech.loc_key || tech.localization_key || tech.id;
      const description = ResearchI18n.localizedText([
        tech.desc_key,
        locKey && locKey + '_desc',
        tech.id && tech.id + '_desc'
      ], country) || tech.desc || tech.description || '';
      const firepower = ResearchI18n.calcFirepower(tech, category);
      return {
        ...tech,
        title: translated,
        desc: description,
        originalTitle: tech.title,
        firepower,
        effects: (tech.effects || []).map(eff => {
          // 効果説明も日本語化
          if (eff.includes('配備可能')) {
            const weapon = category === 'infantry' ? translated : eff.replace('配備可能: ', '');
            return '配備可能: ' + weapon;
          }
          return eff;
        })
      };
    }).sort((a, b) => (a.year || 1936) - (b.year || 1936));
  },

  // ---- 1936年以前の技術を研究済みとしてマーク ----
  preWarTechs(techData) {
    const set = new Set();
    if (!Array.isArray(techData)) return set;
    techData.forEach(tech => {
      if ((tech.year || 1936) < 1936) {
        set.add(tech.id);
      }
    });
    return set;
  },

  // ---- 全カテゴリの技術データを処理 ----
  processAll(allTechData, country) {
    const result = {};
    const preWar = new Set();
    for (const [cat, techs] of Object.entries(allTechData)) {
      result[cat] = ResearchI18n.processTechData(techs, cat, country);
      ResearchI18n.preWarTechs(techs).forEach(id => preWar.add(id));
    }
    return { techData: result, preWarTechs: preWar };
  }
};

if (typeof window !== 'undefined') window.ResearchI18n = ResearchI18n;
