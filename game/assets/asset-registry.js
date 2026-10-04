/**
 * asset-registry.js
 * HoI4 アセットカテゴリ定義 — Paradox Wiki カテゴリアーカイブベース
 *
 * 各カテゴリは Wiki URL を参照元として持ち、サブカテゴリ分岐を動的に辿れる
 * データ構造を提供する。実際の画像パスは ImageLoader が解決する。
 *
 * 画像参照元: https://hoi4.paradoxwikis.com/
 * ローカルフォールバック: game/data/image/ および各国ディレクトリ
 */

const AssetRegistry = {

  // ── Paradox Wiki ベースURL ──
  WIKI_BASE: 'https://hoi4.paradoxwikis.com',
  WIKI_FILE_BASE: 'https://hoi4.paradoxwikis.com/Special:FilePath/',
  GITHUB_RAW: 'https://raw.githubusercontent.com/cbrzeczysz/hoi4-history/main',

  // ── カテゴリ定義 ──
  // 各カテゴリ: { id, label, wikiCategory, wikiUrl, subcategories, localBase, preload }
  //   preload: true → トップバーなど常に表示される必須UI画像（初期ロード対象）
  //   preload: false → タブ/画面オープン時に動的ロード
  categories: {

    // 1. 諜報機関（雇用スパイ）のポートレート
    operative_portraits: {
      id: 'operative_portraits',
      label: '諜報機関ポートレート',
      wikiCategory: 'Operative_portraits',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Operative_portraits',
      localBase: 'data/image/operatives/',
      preload: false,
      subcategories: {} // 国別に分岐する可能性
    },

    // 2. 全国家の国旗
    flags: {
      id: 'flags',
      label: '国旗',
      wikiCategory: 'Flags',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Flags',
      localBase: null, // フラグは国旗絵文字または動的生成
      preload: true,   // トップバーの国旗ボタンで使用
      subcategories: {
        // 大国・主要国の国旗はサブカテゴリとして管理
        major: { label: '主要国', tags: ['GER', 'SOV', 'JAP', 'USA', 'ENG', 'FRA', 'ITA'] },
        minor: { label: '中小国', tags: ['POL', 'CZE', 'HUN', 'ROM', 'YUG', 'SWE', 'NOR', 'DEN', 'HOL', 'BEL', 'SWI', 'FIN', 'TUR', 'CHI', 'BRA', 'CAN', 'AST'] }
      }
    },

    // 3. テクノロジー（研究）アイコン — サブカテゴリ分岐あり
    technology_icons: {
      id: 'technology_icons',
      label: 'テクノロジーアイコン',
      wikiCategory: 'Technology_icons',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Technology_icons',
      localBase: null, // 国別ディレクトリから動的取得
      preload: false,
      // サブカテゴリ: 歩兵装備、戦闘機など兵器種別
      subcategories: {
        infantry:       { label: '歩兵装備', wikiSub: 'Infantry_technology_icons', localPattern: 'infantry' },
        armor:          { label: '機甲',     wikiSub: 'Armor_technology_icons',    localPattern: 'armor' },
        artillery:      { label: '砲兵',     wikiSub: 'Artillery_technology_icons', localPattern: 'artillery' },
        naval:          { label: '海軍',     wikiSub: 'Naval_technology_icons',    localPattern: 'naval' },
        air:            { label: '空軍',     wikiSub: 'Air_technology_icons',      localPattern: 'air' },
        engineering:    { label: '工兵',     wikiSub: 'Engineering_technology_icons', localPattern: 'engineering' },
        industry:       { label: '工業',     wikiSub: 'Industry_technology_icons',  localPattern: 'industry' },
        electronics:    { label: '電子工学', wikiSub: 'Electronics_technology_icons', localPattern: 'electronics' }
      }
    },

    // 4. 兵器設計・モジュールアイコン — サブカテゴリ分岐あり
    equipment_icons: {
      id: 'equipment_icons',
      label: '兵器設計・モジュール',
      wikiCategory: 'Equipment_icons',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Equipment_icons',
      localBase: null,
      preload: false,
      subcategories: {
        plane_modules:  { label: '航空機モジュール', wikiSub: 'Plane_module_icons', localPattern: 'plane_module' },
        ship_modules:   { label: '艦船モジュール',   wikiSub: 'Ship_module_icons',  localPattern: 'ship_module' },
        tank_modules:   { label: '戦車モジュール',   wikiSub: 'Tank_module_icons',   localPattern: 'tank_module' },
        vehicle_modules:{ label: '車両モジュール',   wikiSub: 'Vehicle_module_icons', localPattern: 'vehicle_module' }
      }
    },

    // 5. 国家方針（ナショナル・フォーカス）アイコン — 複数ページ前提
    national_focus_icons: {
      id: 'national_focus_icons',
      label: '国家方針アイコン',
      wikiCategory: 'National_focus_icons',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:National_focus_icons',
      localBase: 'data/image/goals/', // 既存: 3298枚の focus_XXX_result.png
      preload: false,
      // 複数ページに分かれている前提のデータ構造
      subcategories: {
        // 国タグごとのフォーカスツリーアイコン
        GER: { label: 'ドイツ', localBase: 'data/image/goals/', prefix: 'focus_GER_' },
        SOV: { label: 'ソ連',   localBase: 'data/image/goals/', prefix: 'focus_SOV_' },
        JAP: { label: '日本',   localBase: 'data/image/goals/', prefix: 'focus_JAP_' },
        USA: { label: 'アメリカ', localBase: 'data/image/goals/', prefix: 'focus_USA_' },
        ENG: { label: 'イギリス', localBase: 'data/image/goals/', prefix: 'focus_ENG_' },
        FRA: { label: 'フランス', localBase: 'data/image/goals/', prefix: 'focus_FRA_' },
        ITA: { label: 'イタリア', localBase: 'data/image/goals/', prefix: 'focus_ITA_' },
        AFG: { label: 'アフガニスタン', localBase: 'data/image/goals/', prefix: 'focus_AFG_' }
        // 他国も動的に追加可能
      },
      // Wiki上の複数ページ参照 (ページ番号で動的参照)
      wikiPages: true
    },

    // 6. トップバー ステータスアイコン — 常時表示（preload必須）
    topbar_icons: {
      id: 'topbar_icons',
      label: 'トップバーステータス',
      wikiCategory: 'Topbar_icons',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Topbar_icons',
      localBase: null, // SVGデータURIでインライン生成 (TopbarIcons参照)
      preload: true,
      subcategories: {
        political_power: { label: '政治力',     iconKey: 'pp' },
        stability:       { label: '安定度',     iconKey: 'stab' },
        war_support:     { label: '戦争協力度', iconKey: 'ws' },
        manpower:        { label: '人的資源',   iconKey: 'mp' },
        factories:       { label: '工場数',     iconKey: 'fac' },
        fuel:            { label: '燃料',       iconKey: 'fuel' },
        convoys:         { label: '輸送船',     iconKey: 'convoy' }
      }
    },

    // 7. トップメニュー（画面切り替え）アイコン
    top_menu_icons: {
      id: 'top_menu_icons',
      label: 'トップメニューアイコン',
      wikiCategory: 'Top_menu_icons',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Top_menu_icons',
      localBase: null, // SVGデータURIでインライン生成
      preload: true,
      subcategories: {
        research:    { label: '研究',       iconKey: 'research',    tab: 'research' },
        focus:       { label: '国家方針',   iconKey: 'focus',       tab: 'focus' },
        special:     { label: '特別研究',   iconKey: 'special',     tab: 'special' },
        nuclear:     { label: '核攻撃',     iconKey: 'nuclear',     tab: 'nuclear' },
        construction:{ label: '建設',       iconKey: 'construction', tab: 'construction' },
        trade:       { label: '貿易',       iconKey: 'trade',       tab: 'trade' },
        diplomacy:   { label: '外交',       iconKey: 'diplomacy',   tab: 'diplomacy' },
        cards:       { label: '将軍カード', iconKey: 'cards',       tab: 'cards' },
        division:   { label: '師団編成',   iconKey: 'division',   tab: 'division' },
        multiplayer:{ label: 'マルチプレイ', iconKey: 'multiplayer', tab: 'multiplayer' },
        nation:     { label: '固有システム', iconKey: 'nation',     tab: 'nation' },
        winsave:    { label: 'セーブ/ロード', iconKey: 'winsave',   tab: 'winsave' },
        politics:   { label: '政治',       iconKey: 'politics',    tab: 'politics' }
      }
    },

    // 8. 特別研究計画アイコン
    special_project_icons: {
      id: 'special_project_icons',
      label: '特別研究計画アイコン',
      wikiCategory: 'Special_project_icons',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Special_project_icons',
      localBase: null, // 国別ディレクトリから動的取得
      preload: false,
      subcategories: {} // カテゴリごとに動的拡張
    },

    // 9. 科学者ポートレート
    scientist_portraits: {
      id: 'scientist_portraits',
      label: '科学者ポートレート',
      wikiCategory: 'Scientist_portraits',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Scientist_portraits',
      localBase: 'data/image/scientists/',
      preload: false,
      subcategories: {}
    },

    // 10. 師団編成の中隊（陸軍ユニット）アイコン
    land_unit_icons: {
      id: 'land_unit_icons',
      label: '陸軍ユニットアイコン',
      wikiCategory: 'Land_unit_icons',
      wikiUrl: 'https://hoi4.paradoxwikis.com/Category:Land_unit_icons',
      localBase: null,
      preload: false,
      // 師団テンプレート作成・編集画面の各大隊・支援中隊スロットに割り当て
      subcategories: {
        combat_battalions: { label: '戦闘大隊', items: [
          'infantry', 'cavalry', 'motorized', 'mechanized', 'light_tank',
          'medium_tank', 'heavy_tank', 'modern_tank', 'amphibious'
        ]},
        support_companies: { label: '支援中隊', items: [
          'artillery', 'anti_air', 'anti_tank', 'engineer', 'recon',
          'signal', 'logistics', 'maintenance', 'field_hospital', 'military_police'
        ]}
      }
    }
  },

  // ── スクレイピング済みマッピング統合 ──
  // scraper (assets/scraper/) が生成した asset-mapping.json / mappings/*.json
  scrapedIndex: null,
  scrapedMappings: {},

  /** asset-mapping.json (カテゴリ索引) を読み込む。2回目以降はキャッシュを返す */
  async loadScrapedMapping() {
    if (this.scrapedIndex) return this.scrapedIndex;
    try {
      const res = await fetch('assets/asset-mapping.json', { cache: 'no-cache' });
      if (!res.ok) return null;
      this.scrapedIndex = await res.json();
      return this.scrapedIndex;
    } catch (e) {
      console.warn('[AssetRegistry] asset-mapping.json 読み込み失敗', e);
      return null;
    }
  },

  /** カテゴリ1件分のマッピングJSON (mappings/<id>.json) を遅延読み込み */
  async loadCategoryMapping(categoryId) {
    if (this.scrapedMappings[categoryId]) return this.scrapedMappings[categoryId];
    const index = await this.loadScrapedMapping();
    const entry = index && index.categories && index.categories[categoryId];
    if (!entry || !entry.mapping_file) return null;
    try {
      const res = await fetch(entry.mapping_file, { cache: 'no-cache' });
      if (!res.ok) return null;
      const mapping = await res.json();
      // key → ローカル相対パス の辞書に整形 (ローカル未保存分は除く)
      const locals = {};
      (mapping.images || []).forEach(img => {
        if (img.local) locals[img.key] = img.local;
      });
      this.scrapedMappings[categoryId] = { mapping, locals };
      return this.scrapedMappings[categoryId];
    } catch (e) {
      console.warn('[AssetRegistry] ' + categoryId + ' マッピング読み込み失敗', e);
      return null;
    }
  },

  /**
   * カテゴリ内の画像パスを解決する (同期的 — 事前に loadCategoryMapping 済みのこと)
   * 返り値: ローカル相対パス | null (未収録)
   */
  getLocal(categoryId, nameOrKey) {
    const m = this.scrapedMappings[categoryId];
    if (!m) return null;
    const key = String(nameOrKey).replace(/\.[^.]+$/, '').toLowerCase().replace(/[\s]+/g, '_');
    return m.locals[key] || null;
  },

  // ── 補助メソッド ──

  /** カテゴリIDから定義を取得 */
  getCategory(id) {
    return this.categories[id] || null;
  },

  /** カテゴリの全サブカテゴリを配列で取得 */
  getSubcategories(id) {
    const cat = this.getCategory(id);
    if (!cat || !cat.subcategories) return [];
    return Object.entries(cat.subcategories).map(([key, val]) => ({ key, ...val }));
  },

  /** Wiki上のファイルURLを生成 (Special:FilePath経由でリダイレクト解決) */
  getWikiFileUrl(fileName) {
    return this.WIKI_FILE_BASE + encodeURIComponent(fileName);
  },

  /** GitHub raw URLを生成 (hoi4-historyリポジトリ) */
  getGithubRawUrl(path) {
    return this.GITHUB_RAW + '/' + path;
  },

  /** フォーカスアイコンURLを解決 (ローカル優先 → GitHubフォールバック) */
  getFocusIconUrl(focusId) {
    const iconFile = focusId.replace(/^(GER|SOV|JAP|USA|ENG|FRA|ITA)_/, '');
    // ローカルの data/image/goals/ に focus_XXX_result.png が存在する可能性
    return 'data/image/goals/focus_' + iconFile + '_result.png';
  },

  /** リソースアイコンURL */
  getResourceIconUrl(resource) {
    return 'card/GER/data/image/item/' + resource + '.png';
  },

  /** 国旗URL (Paradox Wiki形式: <TAG>.png) */
  getFlagUrl(tag) {
    return this.WIKI_FILE_BASE + encodeURIComponent(tag + '.png');
  }
};

// グローバル公開
if (typeof window !== 'undefined') window.AssetRegistry = AssetRegistry;
