/** Technology presentation assets: local file index first, Wiki mappings next, category drawings otherwise. */
const ResearchIcons = {
  // Case-insensitive index of technology image files (built from GameAssetData.technology)
  techFileIndex: null,

  buildTechIndex() {
    if (this.techFileIndex) return this.techFileIndex;
    this.techFileIndex = new Map();
    const files = (typeof GameAssetData !== 'undefined' && GameAssetData.technology) || [];
    for (const file of files) {
      const key = file.replace(/\.png$/i, '').toLowerCase();
      this.techFileIndex.set(key, file);
    }
    return this.techFileIndex;
  },

  // Resolve a tech asset_key to an actual file name in game/assets/technology/
  resolveTechFile(key) {
    const index = this.buildTechIndex();
    return index.get(String(key).toLowerCase()) || null;
  },

  categories: {
    infantry: { label: '歩兵', keys: ['infantry_weapons1', 'infantry_weapons', 'infantry_equipment_1'], drawing: '<path d="M5 34L56 13M9 38l8-3-4-7-8 5M37 21l8 10M47 17l-4-6"/>' },
    armor: { label: '装甲', keys: ['armor', 'basic_light_tank_chassis', 'light_tank_equipment_1'], drawing: '<rect x="7" y="30" width="50" height="15" rx="7"/><path d="M15 30l5-12h19l6 12M38 22h21"/><circle cx="19" cy="38" r="3"/><circle cx="32" cy="38" r="3"/><circle cx="45" cy="38" r="3"/>' },
    artillery: { label: '砲兵', keys: ['artillery1', 'art_1_comintern', 'anti_air'], drawing: '<path d="M15 32L51 13M43 18l5 8M23 29l12 14h18M22 38L9 45"/><circle cx="22" cy="36" r="8"/>' },
    naval: { label: '海軍', keys: ['early_destroyer', 'destroyer_1', 'light_battery'], drawing: '<path d="M7 35h50l-9 10H17zM20 35V23h23v12M31 23V10M31 14h14M5 50h54"/>' },
    air: { label: '航空', keys: ['ger_fighter1', 'fighter1', 'light_plane_1'], drawing: '<path d="M30 7h4l3 20 22 12v4l-23-6-1 12 7 6H22l7-6-1-12-23 6v-4l22-12z"/>' },
    engineering: { label: '工学', keys: ['advanced_computing_machine', 'electronic_mechanical_engineering', 'advanced_centimetric_radar'], drawing: '<rect x="16" y="15" width="32" height="32"/><path d="M23 8v7m9-7v7m9-7v7M23 47v8m9-8v8m9-8v8M8 23h8m-8 9h8m-8 9h8m32-18h8m-8 9h8m-8 9h8"/><path d="M24 24h16v16H24z"/>' },
    industry: { label: '産業', keys: ['basic_machine_tools', 'construction1', 'improved_machine_tools'], drawing: '<path d="M8 48V28l15-9v9l15-9v9h18v20zM45 28V9h8v19M17 37h6m8 0h6m8 0h5"/>' }
  },
  ready: null,
  fallbacks: {},

  load() {
    if (!this.ready) this.ready = Promise.all([
      AssetRegistry.loadCategoryMapping('technology_icons'),
      AssetRegistry.loadCategoryMapping('equipment_icons')
    ]);
    return this.ready;
  },

  resolve(tech, category) {
    const definition = this.categories[category] || this.categories.infantry;
    const keys = [tech.asset_key, tech.icon_key, tech.id, ...definition.keys].filter(Boolean);
    for (const key of keys) {
      // 1. Direct file lookup (case-insensitive) — the asset_key usually matches a PNG in game/assets/technology/
      const file = this.resolveTechFile(key);
      if (file) {
        const src = AssetRegistry.getLocalAssetUrl('technology_icons', file);
        const github = AssetRegistry.getGithubAssetUrl('technology_icons', file);
        return { src, key, source: 'technology_icons', github };
      }
      // 2. Wiki mapping lookup
      for (const mapping of ['technology_icons', 'equipment_icons']) {
        const local = AssetRegistry.getLocal(mapping, key);
        if (local) return { src: local, key, source: mapping, github: AssetRegistry.getGithubFromMapping(mapping, key) };
        const github = AssetRegistry.getGithubFromMapping(mapping, key);
        if (github) return { src: github, key, source: mapping, github: null };
      }
    }
    return { src: this.fallback(category), key: category, source: 'category-drawing' };
  },

  fallback(category) {
    if (!this.fallbacks[category]) {
      const drawing = (this.categories[category] || this.categories.infantry).drawing;
      this.fallbacks[category] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#d1c39a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + drawing + '</svg>'
      );
    }
    return this.fallbacks[category];
  }
};
if (typeof window !== 'undefined') window.ResearchIcons = ResearchIcons;
