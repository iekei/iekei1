/** Game-specific shared research trees. Air is imported separately from the supplied BBA source. */
export function commonTechTrees() {
  const trees = { infantry: [], armor: [], artillery: [], naval: [], engineering: [], industry: [] };
  const branchCounts = {};
  function chain(category, branch, ids, titles, years, description, parent = null) {
    const x = (branchCounts[category] = (branchCounts[category] || 0) + 1) * 200;
    ids.forEach((id, i) => trees[category].push({
      id, title: titles[i], year: years[i], x, y: (years[i] - 1918) * 50,
      branch, research_time: 100 + i * 25, reliability: '未研究', desc: description,
      asset_key: id, effects: [titles[i] + 'の研究'],
      prerequisites: i ? [ids[i - 1]] : parent ? [parent] : []
    }));
  }
  const years = [1936, 1939, 1942, 1945];
  const levels = (name, count) => Array.from({length:count}, (_, i) => name + ' ' + ['I','II','III','IV','V'][i]);
  const numbered = (key, count) => Array.from({length:count}, (_, i) => key + (i ? i + 1 : ''));
  chain('infantry','歩兵火器',['infantry_equipment_0','infantry_weapons','infantry_weapons2','infantry_weapons3'],['基本歩兵装備','歩兵装備 I','歩兵装備 II','歩兵装備 III'],[1918,1936,1939,1942],'小銃から自動火器へ、歩兵の標準装備を更新する。');
  chain('infantry','支援火器',numbered('support_weapons',4),levels('支援火器',4),[1918,1936,1939,1942],'機関銃と迫撃砲による歩兵の支援火力を研究する。');
  chain('infantry','歩兵対戦車装備',['infantry_at','infantry_at2'],levels('歩兵対戦車装備',2),[1942,1943],'歩兵が携行する対戦車火器を研究する。','infantry_weapons2');
  chain('infantry','自動車化',['motorised_infantry','mechanised_infantry','mechanised_infantry2','mechanised_infantry3'],['自動車化歩兵','機械化歩兵 I','機械化歩兵 II','機械化歩兵 III'],[1936,1940,1942,1944],'トラックと装甲輸送車による歩兵輸送を研究する。');
  for (const [id,name] of [['engineers','工兵中隊'],['recon','偵察中隊'],['tech_logistics_company','補給中隊'],['tech_maintenance_company','整備中隊'],['tech_field_hospital','野戦病院'],['tech_signal_company','通信中隊'],['tech_military_police','憲兵中隊']]) {
    chain('infantry',name,numbered(id,4),levels(name,4),years,name+'の装備と運用を段階的に改善する。');
  }
  for (const [id,name] of [['marines','海兵隊'],['mountain','山岳兵'],['paratroopers','空挺兵'],['rangers_tech','レンジャー']]) {
    const ids=id==='rangers_tech'?['rangers_tech1','rangers_tech2','rangers_tech3']:numbered(id,3);
    chain('infantry',name,ids,levels(name,3),[1936,1939,1942],name+'の訓練と専用装備を研究する。');
  }
  chain('infantry','夜間戦闘',['night_vision','night_vision2'],['暗視装置 I','暗視装置 II'],[1943,1945],'夜間に目標を観測する装備を研究する。');

  for (const [kind,name] of [['light','軽戦車'],['medium','中戦車'],['heavy','重戦車']]) {
    chain('armor',name,['basic_'+kind+'_tank','improved_'+kind+'_tank','advanced_'+kind+'_tank'],[name+' I',name+' II',name+' III'],kind==='medium'?[1939,1941,1943]:[1934,1936,1941],name+'の車体・火力・防御を更新する。');
  }
  chain('armor','主力戦車',['generic_modern_tank'],['現代型主力戦車'],[1945],'機動力と防御を両立する戦後型戦車を研究する。','advanced_medium_tank');
  chain('armor','超重戦車',['super_heavy_tank'],['超重戦車'],[1943],'重装甲の突破用戦車を研究する。','improved_heavy_tank');
  chain('armor','装輪装甲車',['armored_car_equipment_1','armored_car_equipment_2','armored_car_equipment_3'],levels('装輪装甲車',3),[1936,1940,1942],'偵察と警備のための装輪装甲車を研究する。');
  chain('armor','装甲技術',['nsb_armor_tech_1','nsb_armor_tech_2','nsb_armor_tech_3','nsb_armor_tech_4'],levels('装甲技術',4),[1936,1939,1942,1945],'装甲板と車体構造の改良を研究する。');
  chain('armor','戦車エンジン',['nsb_engine_tech_1','nsb_engine_tech_2','nsb_engine_tech_3','nsb_engine_tech_4'],levels('戦車エンジン',4),[1936,1939,1942,1945],'戦車用機関と駆動系を研究する。');
  for (const [id,name,parent] of [['subtech_td','駆逐戦車','basic_medium_tank'],['subtech_art','自走砲','basic_medium_tank'],['subtech_aa','対空戦車','basic_light_tank'],['nsb_amphibious_drive_tech','水陸両用駆動装置','improved_light_tank']]) {
    chain('armor',name,[id],[name],[1940],name+'への車体転用を研究する。',parent);
  }

  chain('artillery','野戦砲',['interwar_artillery','artillery1','artillery2','artillery3','artillery5'],['戦間期野戦砲','基本野戦砲','改良型野戦砲','発展型野戦砲','最新型野戦砲'],[1918,1936,1939,1942,1945],'榴弾砲と野砲による間接射撃を研究する。');
  chain('artillery','対戦車砲',['interwar_antitank','antitank2','antitank3','antitank4'],levels('対戦車砲',4),[1936,1939,1942,1945],'牽引式対戦車砲を研究する。');
  chain('artillery','対空砲',['antiair1','antiair2','antiair3'],levels('対空砲',3),[1936,1940,1943],'地上部隊と拠点を守る対空砲を研究する。');
  chain('artillery','ロケット砲',['rocket_artillery2','rocket_artillery3','rocket_artillery4'],levels('ロケット砲',3),[1940,1943,1945],'多数のロケット弾による面制圧を研究する。');
  chain('artillery','自走ロケット砲',['motorized_rocket_unit'],['自走ロケット砲'],[1941],'車載ロケット発射機を研究する。','rocket_artillery2');

  for (const [kind,name] of [['destroyer','駆逐艦'],['light_cruiser','軽巡洋艦'],['heavy_cruiser','重巡洋艦'],['battlecruiser','巡洋戦艦'],['battleship','戦艦'],['carrier','航空母艦'],['submarine','潜水艦']]) {
    chain('naval',name,['early','basic','improved','advanced'].map(era=>era+'_'+kind),['初期型','基本型','改良型','発展型'].map(era=>era+name),[1922,1936,1940,1944],name+'の船体を段階的に更新する。');
  }
  chain('naval','揚陸装備',['transport','landing_craft','tank_landing_craft'],['輸送船','上陸用舟艇','戦車揚陸艇'],[1922,1940,1944],'上陸部隊を海岸へ運ぶ装備を研究する。');
  for (const [id,name] of [['light_battery','小型艦砲'],['medium_battery','中型艦砲'],['heavy_battery','大型艦砲'],['fire_control_system','射撃管制'],['depth_charges','爆雷'],['sonar','ソナー'],['naval_mines','機雷']]) {
    chain('naval',name,['basic','improved','advanced'].map(era=>era+'_'+id),levels(name,3),[1936,1940,1944],name+'の性能と運用を研究する。');
  }
  chain('naval','魚雷',['basic_torpedo','improved_torpedo_launcher','advanced_torpedo_launcher'],levels('魚雷兵装',3),[1936,1940,1944],'艦艇用魚雷と発射装置を研究する。');
  chain('naval','潜水艦シュノーケル',['basic_submarine_snorkel','improved_submarine_snorkel'],levels('シュノーケル',2),[1940,1944],'潜航中の吸排気装置を研究する。');
  chain('naval','ダメージコントロール',['damage_control_1','damage_control_2','damage_control_3'],levels('ダメージコントロール',3),[1936,1939,1942],'艦内の防火・浸水対策を研究する。');

  chain('engineering','電子工学',['electronic_mechanical_engineering','computing_machine','improved_computing_machine','advanced_computing_machine'],['電子機械工学','計算機','改良型計算機','発展型計算機'],[1936,1938,1940,1942],'計測・計算のための電子装置を研究する。');
  chain('engineering','無線とレーダー',['radio','radio_detection','decimetric_radar','improved_decimetric_radar','centimetric_radar','improved_centimetric_radar','advanced_centimetric_radar'],['無線','電波探知','デシメートル波レーダー','改良型デシメートル波レーダー','センチメートル波レーダー','改良型センチメートル波レーダー','発展型センチメートル波レーダー'],[1936,1937,1939,1940,1941,1943,1944],'無線通信から高精度の電波探知へ発展する。');
  for (const [id,name] of [['encryption','暗号化'],['decryption','暗号解読']]) chain('engineering',name,['basic','improved','advanced'].map(era=>era+'_'+id),levels(name,3),[1936,1939,1942],name+'の装置と手法を研究する。');
  chain('engineering','ロケット工学',['rocket_engines','improved_rocket_engines','advanced_rocket_engines'],['ロケットエンジン','改良型ロケットエンジン','発展型ロケットエンジン'],[1940,1943,1945],'ロケット推進と誘導の基礎技術を研究する。');
  chain('engineering','原子力',['atomic_research','nuclear_reactor','nukes'],['原子核研究','原子炉','核兵器'],[1940,1943,1945],'核反応の研究から原子炉と核兵器へ進む。');

  chain('industry','工作機械',['basic_machine_tools','improved_machine_tools','advanced_machine_tools'],['基本工作機械','改良型工作機械','発展型工作機械'],[1936,1937,1939],'工場の工作機械を更新する。');
  chain('industry','建設',['basic_construction','improved_construction','advanced_construction'],['建設 I','建設 II','建設 III'],[1936,1939,1942],'建築技術と工程管理を改善する。');
  for (const [id,name] of [['concentrated_industry','集中工業'],['dispersed_industry','分散工業']]) chain('industry',name,numbered(id,5),levels(name,5),[1936,1937,1939,1941,1943],name+'の工場配置と生産管理を研究する。');
  chain('industry','資源採掘',['excavation1','excavation2','excavation3','excavation4','excavation5'],levels('資源採掘',5),[1936,1937,1939,1941,1943],'採掘・選鉱技術を改善する。');
  chain('industry','合成燃料',['synth_oil_experiments','oil_processing','improved_oil_processing','advanced_oil_processing','modern_oil_processing'],['合成石油実験','石油加工 I','石油加工 II','石油加工 III','石油加工 IV'],[1936,1937,1939,1941,1943],'合成石油の精製工程を研究する。');
  chain('industry','合成ゴム',['rubber_processing','improved_rubber_processing','advanced_rubber_processing','modern_rubber_processing'],levels('ゴム加工',4),[1937,1939,1941,1943],'合成ゴムの製造工程を研究する。');
  chain('industry','燃料精製',['fuel_refining1','fuel_refining2','fuel_refining3','fuel_refining4','fuel_refining5'],levels('燃料精製',5),[1936,1937,1939,1941,1943],'石油から利用可能な燃料を取り出す技術を研究する。');
  return trees;
}
