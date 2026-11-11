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
    industry: { label: '産業', keys: ['basic_machine_tools', 'construction1', 'improved_machine_tools'], drawing: '<path d="M8 48V28l15-9v9l15-9v9h18v20zM45 28V9h8v19M17 37h6m8 0h6m8 0h5"/>' },
    // 支援中隊 (工兵・野戦病院・偵察・通信・憲兵・整備・輸送) — 大隊編成の支援枠に対応
    support: { label: '支援', keys: ['support_equipment_1', 'engineers', 'tech_field_hospital', 'recon', 'tech_signal_company'], drawing: '<path d="M9 20h25v25H9zM9 29h25M21 20v25"/><circle cx="46" cy="35" r="11"/><path d="M41 35h10M46 30v10M9 45h25"/>' }
  },
  // ── 技術 → 設計図 (game/assets/special_projects) ────────────────────────
  // 素の技術アイコンが 64x64 の装備写真なのに対し、特別計画の系統は
  // game/assets/special_projects の設計図プレート (161x98) を使う。
  // 並び順が優先順位 (先に一致したものを使う)。値はファイル名。
  // 設計図プレートの対応表。キーは HoI4 の asset_key (データ側はこの名前で持っている)。
  projectBlueprints: {
    advanced_battleship: 'Sp_naval_modern_battleship.png',
    advanced_carrier: 'Sp_naval_modern_carrier.png',
    advanced_centimetric_radar: 'Sp_naval_anechoic_tiles.png',
    advanced_depth_charges: 'Sp_naval_midget_submarine.png',
    advanced_rocket_engines: 'Sp_rocket_ballistic_missile.png',
    advanced_sonar: 'Sp_naval_anechoic_tiles.png',
    advanced_submarine: 'Sp_naval_fleet_submarine.png',
    atomic_research: 'Sp_commercial_nuclear_reactor.png',
    basic_submarine: 'Sp_naval_fleet_submarine.png',
    basic_submarine_snorkel: 'Sp_naval_fleet_submarine.png',
    bba_tech_armor_piercing_bombs: 'Sp_air_bouncing_bomb.png',
    bba_tech_engines_1: 'Sp_air_jet_engine.png',
    bba_tech_engines_2: 'Sp_air_jet_engine.png',
    bba_tech_engines_3: 'Sp_air_axial_jet_engine.png',
    bba_tech_engines_4: 'Sp_air_supersonic_jet.png',
    bba_tech_heavy_bombs: 'Sp_air_bouncing_bomb.png',
    centimetric_radar: 'Sp_naval_anechoic_tiles.png',
    coastal_fort_1: 'Sp_land_stronghold_network.png',
    coastal_fort_2: 'Sp_land_stronghold_network.png',
    early_submarine: 'Sp_naval_fleet_submarine.png',
    engineers: 'Sp_land_military_engineering_vehicles.png',
    engineers2: 'Sp_land_military_engineering_vehicles.png',
    engineers3: 'Sp_land_military_engineering_vehicles.png',
    engineers4: 'Sp_land_military_engineering_vehicles.png',
    experimental_rockets: 'Sp_rocket_v2_ballistic.png',
    fort: 'Sp_land_stronghold_network.png',
    fort_1: 'Sp_land_stronghold_network.png',
    fort_2: 'Sp_land_stronghold_network.png',
    FRA_strategic_bomber1: 'Sp_air_intercontinental_bomber.png',
    generic_heavy_tank_chassis_3: 'Sp_land_land_cruiser.png',
    generic_modern_tank_chassis: 'Sp_land_land_cruiser.png',
    generic_railway_gun: 'Sp_land_super_heavy_railway_gun.png',
    generic_super_heavy_tank_chassis: 'Sp_land_super_heavy_howitzer.png',
    improved_battleship: 'Sp_naval_modern_battleship.png',
    improved_carrier: 'Sp_naval_modern_carrier.png',
    improved_centimetric_radar: 'Sp_naval_anechoic_tiles.png',
    improved_rocket_engines: 'Sp_rocket_v2_ballistic.png',
    improved_sonar: 'Sp_naval_anechoic_tiles.png',
    improved_submarine: 'Sp_naval_fleet_submarine.png',
    improved_submarine_snorkel: 'Sp_naval_fleet_submarine.png',
    modern_depth_charges: 'Sp_naval_midget_submarine.png',
    modern_sonar: 'Sp_naval_anechoic_tiles.png',
    Rocket_Art_1_allies: 'Sp_rocket_v2_ballistic.png',
    Rocket_Art_2_allies: 'Sp_rocket_ballistic_missile.png',
    rocket_artillery2: 'Sp_rocket_v2_ballistic.png',
    rocket_artillery3: 'Sp_rocket_ballistic_missile.png',
    sonar: 'Sp_naval_anechoic_tiles.png',
    sp_advance_sabot_shell: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_aircraft_aerial_hangars: 'Sp_air_helicopter.png',
    sp_aircraft_artillery_observers: 'Sp_air_helicopter.png',
    sp_aircraft_centrifugal_jet: 'Sp_air_jet_engine.png',
    sp_aircraft_med_evac: 'Sp_air_helicopter.png',
    sp_aircraft_miniature_fighters: 'Sp_air_mothership_aircraft.png',
    sp_aircraft_reinforced_wings: 'Sp_air_mothership_aircraft.png',
    sp_aircraft_transport_pods: 'Sp_air_helicopter.png',
    sp_armored_advanced_flamethrower: 'Sp_land_flamethrower_tank.png',
    sp_armored_engineer: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_lc_high_impact_obliterator_cannon: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_armored_lc_naval_engine_conversion: 'Sp_land_land_cruiser.png',
    sp_armored_lc_specialized_field_manuals: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_lc_transmission_improvements: 'Sp_land_land_cruiser.png',
    sp_armored_lc_weapon_fire_control: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_armored_maintenance: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_motorized_military_police: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_signal: 'Sp_land_military_engineering_vehicles.png',
    sp_artillery_purpose_built_gun_motor_carriages: 'Sp_land_self_propelled_super_heavy_howitzer.png',
    sp_artillery_rocket_assisted_projectiles: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_rockets_improved_guidance: 'Sp_rocket_ballistic_missile.png',
    sp_rockets_improved_rocket_bomber: 'Sp_rocket_ballistic_missile.png',
    sp_rockets_rocket_bomber: 'Sp_rocket_v2_ballistic.png',
    sp_submarine_aip_diesel_combination_engines: 'Sp_naval_aip_engine.png',
    sp_submarine_high_speed_walter_engines: 'Sp_naval_aip_engine.png',
    sp_surface_ice_composite_runways: 'Sp_naval_ice_carrier.png',
    sp_surface_refined_pykrete: 'Sp_naval_ice_carrier.png',
    sp_surface_shock_hardening_techniques: 'Sp_land_stronghold_network.png',
    sp_surface_variable_time_fuze_shells: 'Sp_land_stronghold_network.png'
  },
  // asset_key を持たない (または別名の) 技術 ID → 設計図プレート。
  // データの id でも引けるよう blueprintFor() が id → asset_key を先に解決する。
  projectBlueprintAliases: {
    advanced_depth_charges: 'Sp_naval_midget_submarine.png',
    advanced_heavy_tank_chassis: 'Sp_land_land_cruiser.png',
    advanced_ship_hull_carrier: 'Sp_naval_modern_carrier.png',
    advanced_ship_hull_heavy: 'Sp_naval_modern_battleship.png',
    advanced_ship_hull_nuclear_powered_submarine: 'Sp_naval_nuclear_submarine.png',
    advanced_ship_hull_submarine: 'Sp_naval_fleet_submarine.png',
    advanced_sonar: 'Sp_naval_anechoic_tiles.png',
    aerial_hangars: 'Sp_air_helicopter.png',
    armor_piercing_bombs: 'Sp_air_bouncing_bomb.png',
    atomic_research: 'Sp_commercial_nuclear_reactor.png',
    axial_jet_engine: 'Sp_air_axial_jet_engine.png',
    basic_fortification_tech: 'Sp_land_stronghold_network.png',
    basic_ship_hull_submarine: 'Sp_naval_fleet_submarine.png',
    basic_submarine_snorkel: 'Sp_naval_fleet_submarine.png',
    bba_strategic_bomb: 'Sp_air_intercontinental_bomber.png',
    bba_strategic_bomber: 'Sp_air_intercontinental_bomber.png',
    bba_tech_early_bombs: 'Sp_air_bouncing_bomb.png',
    bomber_bomb: 'Sp_air_earthshaker_bomb.png',
    centimetric_radar: 'Sp_naval_anechoic_tiles.png',
    coastal_fort_tech_1: 'Sp_land_stronghold_network.png',
    coastal_fort_tech_2: 'Sp_land_stronghold_network.png',
    cruiser_submarine: 'Sp_naval_cruiser_submarine.png',
    early_ship_hull_submarine: 'Sp_naval_fleet_submarine.png',
    earthshaker_bomb: 'Sp_air_earthshaker_bomb.png',
    engines_1: 'Sp_air_jet_engine.png',
    engines_2: 'Sp_air_jet_engine.png',
    engines_3: 'Sp_air_axial_jet_engine.png',
    engines_4: 'Sp_air_supersonic_jet.png',
    experimental_rockets: 'Sp_rocket_v2_ballistic.png',
    flying_wing: 'Sp_air_supersonic_jet.png',
    heavy_bombs: 'Sp_air_bouncing_bomb.png',
    improved_ship_hull_carrier: 'Sp_naval_modern_carrier.png',
    improved_ship_hull_heavy: 'Sp_naval_modern_battleship.png',
    improved_ship_hull_submarine: 'Sp_naval_fleet_submarine.png',
    improved_sonar: 'Sp_naval_anechoic_tiles.png',
    improved_submarine_snorkel: 'Sp_naval_fleet_submarine.png',
    iw_large_airframe: 'Sp_air_intercontinental_bomber.png',
    land_fort_tech_1: 'Sp_land_stronghold_network.png',
    land_fort_tech_2: 'Sp_land_stronghold_network.png',
    main_battle_tank_chassis: 'Sp_land_land_cruiser.png',
    miniature_fighters: 'Sp_air_mothership_aircraft.png',
    modern_depth_charges: 'Sp_naval_midget_submarine.png',
    modern_sonar: 'Sp_naval_anechoic_tiles.png',
    monopulse_radar: 'Sp_naval_anechoic_tiles.png',
    nuclear_missile_equipment_1: 'Sp_naval_nuclear_missile_submarine.png',
    nuclear_missile_equipment_2: 'Sp_naval_nuclear_submarine.png',
    nuclear_powered_submarine: 'Sp_naval_nuclear_submarine.png',
    nuclear_reactor: 'Sp_commercial_nuclear_reactor.png',
    phased_array: 'Sp_naval_anechoic_tiles.png',
    railway_gun: 'Sp_land_super_heavy_railway_gun.png',
    reinforced_wings_mothership: 'Sp_air_mothership_aircraft.png',
    rocket_artillery: 'Sp_rocket_v2_ballistic.png',
    rocket_artillery2: 'Sp_rocket_v2_ballistic.png',
    rocket_artillery3: 'Sp_rocket_ballistic_missile.png',
    rocket_artillery4: 'Sp_rocket_ballistic_missile.png',
    rocket_interceptor: 'Sp_air_supersonic_jet.png',
    sonar: 'Sp_naval_anechoic_tiles.png',
    sp_advance_sabot_shells: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_aip_engine_advanced_tech: 'Sp_naval_aip_engine.png',
    sp_aip_engine_improved_tech: 'Sp_naval_aip_engine.png',
    sp_armored_advanced_flamethrower_tech: 'Sp_land_flamethrower_tank.png',
    sp_armored_engineer_tech: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_lc_high_impact_obliterator_cannon_tech: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_armored_lc_naval_engine_conversion_tech: 'Sp_land_land_cruiser.png',
    sp_armored_lc_specialized_field_manuals_tech: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_lc_transmission_improvements_tech: 'Sp_land_land_cruiser.png',
    sp_armored_lc_weapon_fire_control_tech: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_armored_maintenance_tech: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_motorized_military_police_tech: 'Sp_land_military_engineering_vehicles.png',
    sp_armored_signal_tech: 'Sp_land_military_engineering_vehicles.png',
    sp_artillery_purpose_built_gun_motor_carriages_tech: 'Sp_land_self_propelled_super_heavy_howitzer.png',
    sp_artillery_rocket_assisted_projectiles_tech: 'Sp_land_multi_charge_large_caliber_gun.png',
    sp_centrifugal_jet_tech: 'Sp_air_jet_engine.png',
    sp_helicopter_artillery_observers_tech: 'Sp_air_helicopter.png',
    sp_helicopter_med_evac_tech: 'Sp_air_helicopter.png',
    sp_helicopter_transport_pods_tech: 'Sp_air_helicopter.png',
    sp_ice_composite_runawayas: 'Sp_naval_ice_carrier.png',
    sp_nuclear_isotope_separation: 'Sp_commercial_nuclear_reactor.png',
    sp_refined_pykrete: 'Sp_naval_ice_carrier.png',
    sp_rockets_dual_chamber_rocket_engine_1: 'Sp_rocket_v2_ballistic.png',
    sp_rockets_dual_chamber_rocket_engine_2: 'Sp_rocket_ballistic_missile.png',
    sp_rockets_improved_guidance: 'Sp_rocket_ballistic_missile.png',
    sp_rockets_improved_rocket_bomber: 'Sp_rocket_ballistic_missile.png',
    sp_rockets_rocket_bomber: 'Sp_rocket_v2_ballistic.png',
    sp_shock_hardening_techniques: 'Sp_land_stronghold_network.png',
    sp_variable_time_fuze_shells: 'Sp_land_stronghold_network.png',
    super_heavy_tank_chassis: 'Sp_land_super_heavy_howitzer.png',
    supersonic_jet: 'Sp_air_supersonic_jet.png',
    tech_engineers: 'Sp_land_military_engineering_vehicles.png',
    tech_engineers2: 'Sp_land_military_engineering_vehicles.png',
    tech_engineers3: 'Sp_land_military_engineering_vehicles.png',
    tech_engineers4: 'Sp_land_military_engineering_vehicles.png'
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

  /**
   * 技術 (id / asset_key / icon_key) に対応する設計図ファイル名を返す。無ければ null。
   * 照合順: asset_key → icon_key → id の別名表。大文字小文字は無視する。
   * `tech.asset_key` を持たない呼び出し元 (テストや最小データ) でも動くよう、
   * id からの逆引きは projectBlueprintAliases に静的に持たせている。
   */
  blueprintFor(tech) {
    if (!tech) return null;
    if (!this.blueprintIndex) {
      this.blueprintIndex = new Map();
      Object.entries(this.projectBlueprints || {})
        .forEach(([key, file]) => this.blueprintIndex.set(key.toLowerCase(), file));
      Object.entries(this.projectBlueprintAliases || {})
        .forEach(([key, file]) => { if (!this.blueprintIndex.has(key.toLowerCase())) this.blueprintIndex.set(key.toLowerCase(), file); });
      if (Array.isArray(this.techIds)) {
        this.techIds.forEach(entry => {
          const file = this.blueprintIndex.get(String(entry.asset_key || '').toLowerCase());
          if (file && entry.id) this.blueprintIndex.set(String(entry.id).toLowerCase(), file);
        });
      }
    }
    for (const key of [tech.asset_key, tech.icon_key, tech.id]) {
      if (!key) continue;
      const hit = this.blueprintIndex.get(String(key).toLowerCase());
      if (hit) return hit;
    }
    return null;
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

  /** resolve() の結果に設計図 (/assets/special_projects) を添える。uibp() が使う */
  withBlueprint(tech, category) {
    const asset = this.resolve(tech, category);
    const file = this.blueprintFor(tech);
    if (!file) return asset;
    const localUrl = typeof AssetRegistry?.getLocalAssetUrl === 'function'
      ? AssetRegistry.getLocalAssetUrl('special_project_icons', file) : 'game/assets/special_projects/' + file;
    return { ...asset, blueprint: file, blueprintSrc: localUrl,
      blueprintGithub: typeof AssetRegistry?.getGithubAssetUrl === 'function'
        ? AssetRegistry.getGithubAssetUrl('special_project_icons', file) : null };
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
