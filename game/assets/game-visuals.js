/** Shared local artwork for country flags, personnel, projects and battalion sprites. */
const GameVisuals = {
  baseURL: typeof document !== 'undefined' && document.currentScript?.src ? new URL('../', document.currentScript.src).href : null,
  flagFiles: new Set(GameAssetData.flags),
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); },
  url(category, file) {
    const path = AssetRegistry.getLocalAssetUrl(category, file).replace(/^game\//, '');
    return this.baseURL ? new URL(path, this.baseURL).href : path;
  },
  flagFile(tag, ideology) {
    if (!/^[A-Z0-9_]+$/.test(tag || '')) return null;
    const political = ideology === 'democracy' ? 'democratic' : ideology;
    return [`${tag}_${political}.png`,`${tag}.png`,`${tag}_neutrality.png`,`${tag}_democratic.png`,`${tag}_fascism.png`,`${tag}_communism.png`]
      .find(file => this.flagFiles.has(file)) || null;
  },
  flag(tag, ideology) {
    const file = this.flagFile(tag, ideology);
    return file ? '<img class="country-flag" src="'+this.escape(this.url('flags',file))+'" alt="'+this.escape(tag)+' 国旗" decoding="async" onerror="this.hidden=true">' : '<span class="country-flag-missing">'+this.escape(tag || '不明')+'</span>';
  },
  // Logs and notifications remain text-safe; only registered [TAG] markers become images.
  countryText(element, text) {
    element.replaceChildren();
    String(text).split(/(\[[A-Z]{3}\])/g).forEach(part => {
      const tag = /^\[([A-Z]{3})\]$/.exec(part)?.[1];
      if (tag && this.flagFile(tag)) {
        const span = document.createElement('span');
        span.innerHTML = DataFetcher.getCountryFlagImage(tag);
        element.appendChild(span);
      } else element.appendChild(document.createTextNode(part));
    });
  },
  operative(id) { return GameAssetData.operatives.find(person => person.id === id) || null; },
  operativeChoices(country, used = []) {
    const occupied = new Set(used);
    const names = new Set(used.map(id => this.operative(id)?.name).filter(Boolean));
    return GameAssetData.operatives.filter(person => !occupied.has(person.id) && !names.has(person.name)).sort((a,b) => Number(b.country === country)-Number(a.country === country) || a.id.localeCompare(b.id));
  },
  person(person, category = 'operative_portraits', className = 'person-portrait') {
    return person ? '<img class="'+className+'" src="'+this.escape(this.url(category,person.file))+'" alt="'+this.escape(person.name)+'" decoding="async" onerror="this.hidden=true">' : '';
  },
  scienceLinks: {
    von_braun: ['ger_wernher_von_braun','Sp_air_axial_jet_engine.png'],
    heisenberg: ['ger_werner_heisenberg','Sp_commercial_nuclear_reactor.png'],
    kurt_tank: ['ger_kurt_tank','Sp_air_jet_engine.png'],
    messerschmitt: [null,'Sp_air_axial_jet_engine.png'],
    porsche: ['ger_ferdinand_porsche','Sp_land_land_cruiser.png'],
    otto_hahn: [null,'Sp_commercial_nuclear_reactor.png'],
    boris_stechkin: [null,'Sp_air_jet_engine.png'],
    sergey_korolyov: [null,'Sp_air_axial_jet_engine.png'],
    arkady_nazarov: [null,'Sp_air_supersonic_jet.png'],
    igor_kurchatov: [null,'Sp_commercial_nuclear_reactor.png'],
    abram_ioffe: [null,'Sp_naval_nuclear_submarine.png'],
    vladimir_kotelnikov: [null,'Sp_land_stronghold_network.png'],
    jiro_horikoshi: [null,'Sp_air_supersonic_jet.png'],
    kuroda_nagamichi: [null,'Sp_land_land_cruiser.png'],
    okochi_masatoshi: [null,'Sp_land_military_engineering_vehicles.png'],
    yoshio_nishina: [null,'Sp_commercial_nuclear_reactor.png'],
    oppenheimer: [null,'Sp_commercial_nuclear_reactor.png'],
    groves: [null,'Sp_commercial_nuclear_reactor.png'],
    northrop: [null,'Sp_air_intercontinental_bomber.png'],
    pershing_tank: [null,'Sp_land_land_cruiser.png'],
    rupert_tube: [null,'Sp_commercial_nuclear_reactor.png'],
    frank_whittle: ['eng_frank_whittle','Sp_air_jet_engine.png'],
    mullins_barnes: [null,'Sp_air_bouncing_bomb.png'],
    joliot_curie: ['fra_frederic_joliot_curie','Sp_commercial_nuclear_reactor.png'],
    morane_saulnier: [null,'Sp_air_supersonic_jet.png'],
    fermi_ita: ['ita_enrico_fermi','Sp_commercial_nuclear_reactor.png'],
    caproni: [null,'Sp_air_jet_engine.png']
  },
  scientist(sci) {
    const link = this.scienceLinks[sci.id];
    const person = GameAssetData.scientists.find(person => person.id === (sci.portrait_id || link?.[0]));
    const generic = GameAssetData.scientists.find(person => person.country === 'GENERIC');
    return { ...(person || generic), name: person?.name || sci.name, generic: !person };
  },
  blueprint(sci) {
    const file = this.scienceLinks[sci.id]?.[1];
    if (!file || !GameAssetData.projects.includes(file)) return '';
    return '<figure class="project-blueprint"><img src="'+this.escape(this.url('special_project_icons',file))+'" alt="'+this.escape(sci.category_name || '特別研究')+'の参考設計図" loading="lazy"><figcaption>関連分野の参考設計図</figcaption></figure>';
  },
  unitFiles: {
    infantry:'unit_infantry_icon.png', artillery:'support_unit_field_guns_icon.png', armor:'unit_heavy_armor_icon.png',
    anti_tank:'support_unit_at_icon.png', anti_air:'unit_anti_air_icon.png', engineer:'unit_engineer_icon.png', recon:'unit_recon_icon.png',
    ranger:'unit_ranger_battalion_icon.png', mountaineer:'unit_mountain_icon.png', paratrooper:'support_unit_airborne_armored_recon_icon.png', marine:'unit_amphibious_mechanized_icon.png',
    jet_fighter:'support_unit_airborne_armored_recon_icon.png', v2_rocket:'support_unit_rocket_art_icon.png', nuke_battalion:'support_unit_field_guns_icon.png', land_battleship:'unit_heavy_armor_icon.png'
  },
  unit(battalion) {
    const file = this.unitFiles[battalion.id] || this.unitFiles.infantry;
    const dimensions = GameAssetData.units[file] || { width: 76, height: 42 };
    // 152px two-state sheets use x=0..75. Existing <=76px PNGs are already green-only.
    const width = dimensions.width;
    const left = width > 76 ? 0 : Math.floor((76-width)/2);
    return '<span class="land-unit-icon" role="img" aria-label="'+this.escape(battalion.name)+'"><img src="'+this.escape(this.url('land_unit_icons',file))+'" alt="" style="width:'+width+'px;left:'+left+'px" decoding="async" onerror="this.hidden=true"></span>';
  }
};
if (typeof module !== 'undefined') module.exports = GameVisuals;
if (typeof window !== 'undefined') window.GameVisuals = GameVisuals;
