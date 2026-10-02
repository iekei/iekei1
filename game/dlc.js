// ==========================================================
// game/dlc.js — 全DLC拡張モジュール
//  1. DoctrineManager        陸/海/空ドクトリン (XP消費・直線ツリーUI)
//  2. EquipmentDesigner      戦車/艦船/航空機 モジュール設計 (Designer)
//  3. IntelligenceManager    諜報機関とスパイ活動 (La Résistance)
//  4. MIOManager             軍需産業組織 + 国際市場 (Arms Against Tyranny)
//  5. PeaceConferenceManager 講和会議の拡張
//  6. GeneralTraitManager    将軍の特性ツリー育成
// ※ツリー接続線は水平・垂直の直線のみ (曲線使用厳禁)
// ==========================================================

// 直角ツリー共通ヘルパー: 2点を水平/垂直の直線のみで結ぶ SVG path
function dlcOrthoPath(x1, y1, x2, y2) {
  const midY = (y1 + y2) / 2;
  return 'M' + x1 + ',' + y1 + ' L' + x1 + ',' + midY + ' L' + x2 + ',' + midY + ' L' + x2 + ',' + y2;
}

// ---- ドクトリンデータ (バニラ+DLC準拠のツリー構造) ----
const DLC_DOCTRINES = {
  land: { label: '陸軍', xpKey: 'army', branches: [
    { id: 'mobile', name: '機動戦争ドクトリン', nodes: [
      { id: 'mob1', name: '機動戦争', cost: 25, req: [], x: 20, y: 10, eff: { armorSpeed: 5 } },
      { id: 'mob2', name: '装甲師団の拡充', cost: 40, req: ['mob1'], x: 20, y: 100, eff: { armorBreakthrough: 5 } },
      { id: 'mob3a', name: '電撃戦教義', cost: 55, req: ['mob2'], x: 0, y: 190, eff: { armorSpeed: 5, armorBreakthrough: 5 } },
      { id: 'mob3b', name: '浸透戦術', cost: 55, req: ['mob2'], x: 160, y: 190, eff: { infantryDefense: 10 } }
    ]},
    { id: 'fire', name: '優勢火力ドクトリン', nodes: [
      { id: 'fw1', name: '優勢火力', cost: 25, req: [], x: 20, y: 10, eff: { infantryDefense: 10 } },
      { id: 'fw2', name: '砲兵連隊の強化', cost: 40, req: ['fw1'], x: 20, y: 100, eff: { infantryDefense: 5, armorBreakthrough: 3 } },
      { id: 'fw3a', name: '圧制砲撃', cost: 55, req: ['fw2'], x: 0, y: 190, eff: { infantryDefense: 10 } },
      { id: 'fw3b', name: '統合火力支援', cost: 55, req: ['fw2'], x: 160, y: 190, eff: { armorBreakthrough: 8 } }
    ]}
  ]},
  sea: { label: '海軍', xpKey: 'navy', branches: [
    { id: 'fleet', name: '存在艦隊ドクトリン', nodes: [
      { id: 'fl1', name: '存在艦隊', cost: 25, req: [], x: 20, y: 10, eff: {} },
      { id: 'fl2', name: '主力艦の近代化', cost: 40, req: ['fl1'], x: 20, y: 100, eff: {} },
      { id: 'fl3a', name: '艦隊決戦訓練', cost: 55, req: ['fl2'], x: 0, y: 190, eff: {} },
      { id: 'fl3b', name: '護衛任務体系', cost: 55, req: ['fl2'], x: 160, y: 190, eff: {} }
    ]},
    { id: 'trade', name: '通商破壊ドクトリン', nodes: [
      { id: 'tr1', name: '通商破壊', cost: 25, req: [], x: 20, y: 10, eff: {} },
      { id: 'tr2', name: '潜水艦戦の発展', cost: 40, req: ['tr1'], x: 20, y: 100, eff: {} },
      { id: 'tr3a', name: '群狼戦術', cost: 55, req: ['tr2'], x: 0, y: 190, eff: {} },
      { id: 'tr3b', name: '機雷戦', cost: 55, req: ['tr2'], x: 160, y: 190, eff: {} }
    ]}
  ]},
  air: { label: '空軍', xpKey: 'air', branches: [
    { id: 'destr', name: '戦略破壊ドクトリン', nodes: [
      { id: 'ds1', name: '戦略破壊', cost: 25, req: [], x: 20, y: 10, eff: {} },
      { id: 'ds2', name: '戦略爆撃機部隊', cost: 40, req: ['ds1'], x: 20, y: 100, eff: {} },
      { id: 'ds3a', name: '本土防空網', cost: 55, req: ['ds2'], x: 0, y: 190, eff: {} },
      { id: 'ds3b', name: '昼夜間精密爆撃', cost: 55, req: ['ds2'], x: 160, y: 190, eff: {} }
    ]},
    { id: 'battle', name: '戦場支援ドクトリン', nodes: [
      { id: 'bt1', name: '戦場支援', cost: 25, req: [], x: 20, y: 10, eff: {} },
      { id: 'bt2', name: '近接航空支援', cost: 40, req: ['bt1'], x: 20, y: 100, eff: {} },
      { id: 'bt3a', name: '制空権確保', cost: 55, req: ['bt2'], x: 0, y: 190, eff: {} },
      { id: 'bt3b', name: '航空要塞化', cost: 55, req: ['bt2'], x: 160, y: 190, eff: {} }
    ]}
  ]}
};

// ---- 諜報オペレーション (La Résistance) ----
const DLC_INTEL_OPS = [
  { id: 'infil', name: '潜入工作', icon: '🥷', dur: 25, desc: '敵国に諜報員を潜入させ情報を収集する。', eff: '政治力+30 / 緊張度+1' },
  { id: 'crypto', name: '暗号解読', icon: '🔐', dur: 35, desc: '敵の暗号を解読し作戦を優位に進める。', eff: '陸軍XP+20 / 戦争協力度+3' },
  { id: 'politics', name: '政治工作', icon: '🗳️', dur: 30, desc: '標的国の世論を操作する。', eff: '安定度+3 / 緊張度+2' },
  { id: 'subvert', name: '騒乱工作', icon: '🔥', dur: 40, desc: '標的国の後方を撹乱する。', eff: '標的安定度低下 / 緊張度+2' }
];

// ---- 軍需産業組織 (MIO) ----
const DLC_MIOS = [
  { id: 'veh', name: '装甲車両工業組織', icon: '🚜', mod: 'armorSpeed', xpPerDay: 0.5, buffPerLevel: 3 },
  { id: 'air', name: '航空機工業組織', icon: '✈️', mod: 'armorBreakthrough', xpPerDay: 0.5, buffPerLevel: 2 },
  { id: 'nav', name: '艦艇工業組織', icon: '⚓', mod: 'landingPrepTime', xpPerDay: 0.5, buffPerLevel: 2 }
];

// ---- 将軍特性ツリー ----
const DLC_TRAIT_TREES = [
  { id: 'atk', name: '攻撃', nodes: [
    { id: 'atk1', name: '猛攻', cost: 30, req: [], x: 20, y: 10, eff: { armorBreakthrough: 4 } },
    { id: 'atk2', name: '巧妙な攻撃', cost: 45, req: ['atk1'], x: 20, y: 100, eff: { armorBreakthrough: 6 } },
    { id: 'atk3', name: '電撃戦指揮官', cost: 60, req: ['atk2'], x: 20, y: 190, eff: { armorSpeed: 6, armorBreakthrough: 6 } }
  ]},
  { id: 'def', name: '防御', nodes: [
    { id: 'def1', name: '防御的即可', cost: 30, req: [], x: 20, y: 10, eff: { infantryDefense: 5 } },
    { id: 'def2', name: '組織的防御', cost: 45, req: ['def1'], x: 20, y: 100, eff: { infantryDefense: 7 } },
    { id: 'def3', name: '鉄壁の指揮官', cost: 60, req: ['def2'], x: 20, y: 190, eff: { infantryDefense: 10, stabilityBonus: 2 } }
  ]},
  { id: 'mob', name: '機動', nodes: [
    { id: 'mob1', name: '快速機動', cost: 30, req: [], x: 20, y: 10, eff: { armorSpeed: 4 } },
    { id: 'mob2', name: '快速行軍', cost: 45, req: ['mob1'], x: 20, y: 100, eff: { armorSpeed: 5 } },
    { id: 'mob3', name: '包囲殲滅の名手', cost: 60, req: ['mob2'], x: 20, y: 190, eff: { armorSpeed: 5, armorBreakthrough: 5 } }
  ]}
];

// ==========================================================
class DLC {
  static inited = false;

  // ---- ゲーム状態の保証 ----
  static ensureState() {
    const gs = CoreEngine.gameState;
    if (!gs.xp) gs.xp = { army: 20, navy: 20, air: 20 };
    if (gs.equipment === undefined) gs.equipment = 600;
    if (!gs.doctrine) gs.doctrine = [];
    if (!gs.intel) gs.intel = { agency: null, level: 0, spies: 0, op: null };
    if (!gs.puppets) gs.puppets = [];
  }

  // ---- UI (ウィンドウテンプレート・ナビ・CSS) の注入 ----
  static installUI() {
    // CSS
    const style = document.createElement('style');
    style.textContent = `
      .dlc-pane { padding: 12px 16px; overflow: auto; height: 100%; box-sizing: border-box; }
      .dlc-section { margin-bottom: 16px; }
      .dlc-section h3 { color: var(--text-gold); margin: 0 0 8px 0; font-size: 14px; border-bottom: 1px solid var(--border-mil); padding-bottom: 4px; }
      .dlc-tree-canvas { position: relative; overflow: auto; background: radial-gradient(ellipse at center, #111820 0%, #0a0c0f 100%); border: 1px solid var(--border-mil); border-radius: 6px; }
      .dlc-tree-viewport { position: relative; }
      .dlc-svg-lines { position: absolute; top: 0; left: 0; pointer-events: none; }
      .dlc-node { position: absolute; width: 130px; padding: 6px; border-radius: 6px; background: var(--bg-panel-light); border: 2px solid var(--border-mil); cursor: pointer; text-align: center; transition: all 0.15s; }
      .dlc-node:hover { border-color: var(--accent-blue); transform: scale(1.04); z-index: 10; }
      .dlc-node.unlocked { background: #1a2a1a; border-color: var(--accent-green); opacity: .8; }
      .dlc-node.selectable { border-color: var(--accent-green); }
      .dlc-node.locked { opacity: .4; cursor: not-allowed; }
      .dlc-node .dn-title { font-size: 10px; line-height: 1.2; color: var(--text-primary); }
      .dlc-node .dn-cost { font-size: 9px; color: var(--text-gold); margin-top: 2px; }
      .dlc-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid var(--border-mil); font-size: 12px; }
      .dlc-row select, .dlc-row input { background: var(--bg-panel-light); border: 1px solid var(--border-mil); color: var(--text-primary); border-radius: 3px; padding: 3px 6px; font-size: 11px; }
      .dlc-btn { background: var(--accent-blue); color: #fff; border: none; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 11px; }
      .dlc-btn:hover { background: #5a9fd4; }
      .dlc-btn:disabled { background: #333; color: #666; cursor: not-allowed; }
      .dlc-btn.gold { background: var(--accent-orange); }
      .dlc-card { display: inline-block; width: 250px; background: var(--bg-panel-light); border: 1px solid var(--border-mil); border-radius: 8px; padding: 10px; margin: 4px; vertical-align: top; font-size: 11px; }
      .dlc-card h4 { margin: 0 0 6px 0; font-size: 12px; color: var(--text-gold); }
      .dlc-xpbar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; margin: 4px 0; }
      .dlc-xpbar-fill { height: 100%; background: var(--text-gold); }
      .dlc-badge { display: inline-block; background: var(--accent-green); color: #fff; border-radius: 10px; padding: 2px 8px; font-size: 10px; }
    `;
    document.head.appendChild(style);

    // ウィンドウテンプレート
    const defs = [
      { tab: 'doctrine', title: '📜 陸海空ドクトリン', w: 820, h: 620 },
      { tab: 'designer', title: '🛠️ 兵器モジュール設計', w: 900, h: 620 },
      { tab: 'intel', title: '🕵️ 諜報機関 (La Résistance)', w: 780, h: 600 },
      { tab: 'mio', title: '🏭 軍需産業組織・国際市場', w: 860, h: 600 },
      { tab: 'peace', title: '🕊️ 講和会議', w: 780, h: 560 },
      { tab: 'traits', title: '🎖️ 将軍特性ツリー', w: 820, h: 600 }
    ];
    const tplRoot = document.getElementById('window-templates');
    defs.forEach(d => {
      if (document.getElementById('tpl-' + d.tab)) return;
      const el = document.createElement('div');
      el.className = 'window-template pane-scroll';
      el.id = 'tpl-' + d.tab;
      el.dataset.title = d.title;
      el.dataset.w = d.w;
      el.dataset.h = d.h;
      el.innerHTML = '<div class="dlc-pane" id="' + d.tab + '-content"></div>';
      tplRoot.appendChild(el);
    });

    // ナビレールにボタン追加
    const rail = document.getElementById('window-nav');
    const btnDefs = [
      ['doctrine', '📜 ドクトリン'], ['designer', '🛠️ 兵器設計'], ['intel', '🕵️ 諜報'],
      ['mio', '🏭 軍需/市場'], ['peace', '🕊️ 講和会議'], ['traits', '🎖️ 将軍特性']
    ];
    btnDefs.forEach(([tab, label]) => {
      if (rail.querySelector('.win-btn[data-tab="' + tab + '"]')) return;
      const b = document.createElement('button');
      b.className = 'win-btn';
      b.dataset.tab = tab;
      b.textContent = label;
      b.onclick = () => GameUI.switchTab(tab);
      rail.appendChild(b);
    });

    // ウィンドウオープン時の再描画をフック
    const orig = GameUI.onWindowOpened.bind(GameUI);
    GameUI.onWindowOpened = (tab) => {
      orig(tab);
      if (tab === 'doctrine') DoctrineManager.render();
      if (tab === 'designer') EquipmentDesigner.render();
      if (tab === 'intel') IntelligenceManager.render();
      if (tab === 'mio') MIOManager.render();
      if (tab === 'peace') PeaceConferenceManager.render();
      if (tab === 'traits') GeneralTraitManager.render();
    };
  }

  // ---- ゲーム開始時フック (initGame から呼ばれる) ----
  static onGameStart() {
    DLC.ensureState();
    if (!DLC.inited) {
      DLC.installUI();
      DLC.inited = true;
      CoreEngine.registerTickCallback(() => DLC.onTick());
    }
    DoctrineManager.render();
    EquipmentDesigner.render();
    IntelligenceManager.render();
    MIOManager.render();
    PeaceConferenceManager.render();
    GeneralTraitManager.render();
  }

  static onTick() {
    const gs = CoreEngine.gameState;
    // 陸海空XP: 平時+0.8/日, 戦時+2.0/日
    const rate = (gs.atWar && gs.atWar.length) ? 2.0 : 0.8;
    ['army', 'navy', 'air'].forEach(k => { gs.xp[k] = Math.min(9999, (gs.xp[k] || 0) + rate); });
    IntelligenceManager.onTick();
    MIOManager.onTick();
    // 開いているウィンドウの再描画 (スロットル)
    if (!DLC._lastRender || Date.now() - DLC._lastRender > 3000) {
      DLC._lastRender = Date.now();
      const top = WindowManager.topWindow();
      if (top && top.tab === 'peace') PeaceConferenceManager.render();
      if (top && top.tab === 'intel') IntelligenceManager.render();
      if (top && top.tab === 'mio') MIOManager.render();
    }
  }

  // ---- セーブ/ロード対応 ----
  static collect() {
    const gs = CoreEngine.gameState;
    return {
      xp: gs.xp, equipment: gs.equipment, doctrine: gs.doctrine,
      intel: gs.intel, puppets: gs.puppets,
      designs: EquipmentDesigner.designs,
      mio: MIOManager.state,
      traits: GeneralTraitManager.unlocked
    };
  }

  static apply(data) {
    if (!data) return;
    const gs = CoreEngine.gameState;
    if (data.xp) gs.xp = data.xp;
    if (data.equipment !== undefined) gs.equipment = data.equipment;
    if (data.doctrine) gs.doctrine = data.doctrine;
    if (data.intel) gs.intel = data.intel;
    if (data.puppets) gs.puppets = data.puppets;
    if (data.designs) EquipmentDesigner.designs = data.designs;
    if (data.mio) MIOManager.state = data.mio;
    if (data.traits) GeneralTraitManager.unlocked = data.traits;
  }
}

// ==========================================================
// 1. DoctrineManager — 陸/海/空ドクトリン
// ==========================================================
class DoctrineManager {
  static service = 'land';   // land | sea | air
  static branchIdx = 0;

  static unlock(node, branch, service) {
    const gs = CoreEngine.gameState;
    if (gs.doctrine.includes(node.id)) return;
    const okReq = node.req.every(r => gs.doctrine.includes(r));
    if (!okReq) { GameUI.notify('前提ドクトリンが未習得です。', 'alert'); return; }
    if (gs.xp[branch.xpKey] < node.cost) { GameUI.notify('XPが不足しています (' + node.cost + ' XP必要)。', 'alert'); return; }
    gs.xp[branch.xpKey] -= node.cost;
    gs.doctrine.push(node.id);
    Object.entries(node.eff).forEach(([k, v]) => {
      gs.cardModifiers[k] = (gs.cardModifiers[k] || 0) + v;
    });
    CoreEngine.log('📜 ドクトリン習得: ' + node.name + ' (-' + node.cost + ' XP)');
    GameUI.notify('ドクトリン習得: ' + node.name, 'success');
    MultiplayerManager.broadcast({ type: 'doctrine', id: node.id });
    DoctrineManager.render();
  }

  static render() {
    const el = document.getElementById('doctrine-content');
    if (!el) return;
    const gs = CoreEngine.gameState;
    const svc = DLC_DOCTRINES[DoctrineManager.service];
    // タブ
    let html = '<div class="dlc-section"><div style="display:flex;gap:4px;margin-bottom:8px;">';
    Object.entries(DLC_DOCTRINES).forEach(([key, s]) => {
      html += '<button class="research-tab' + (key === DoctrineManager.service ? ' active' : '') + '" onclick="DoctrineManager.setService(\'' + key + '\')">' + s.label + ' <span style="color:var(--text-gold)">' + Math.floor(gs.xp[s.xpKey]) + 'XP</span></button>';
    });
    html += '</div>';
    // 分岐選択
    svc.branches.forEach((br, i) => {
      html += '<button class="research-tab' + (i === DoctrineManager.branchIdx ? ' active' : '') + '" onclick="DoctrineManager.setBranch(' + i + ')">' + br.name + '</button> ';
    });
    html += '</div>';

    // ツリー (直線のみで描画)
    const br = svc.branches[DoctrineManager.branchIdx] || svc.branches[0];
    html += '<div class="dlc-section"><div class="dlc-tree-canvas" style="height:360px;"><div class="dlc-tree-viewport" style="width:340px;height:270px;">';
    let lines = '';
    br.nodes.forEach(n => n.req.forEach(r => {
      const pre = br.nodes.find(x => x.id === r);
      if (pre) lines += '<path d="' + dlcOrthoPath(pre.x + 65, pre.y + 38, n.x + 65, n.y + 10) + '" stroke="' + (gs.doctrine.includes(r) ? '#4ac46a' : '#3a4a5a') + '" stroke-width="2" fill="none" opacity="0.7"/>';
    }));
    html += '<svg class="dlc-svg-lines" width="340" height="270">' + lines + '</svg>';
    br.nodes.forEach(n => {
      const unlocked = gs.doctrine.includes(n.id);
      const selectable = !unlocked && n.req.every(r => gs.doctrine.includes(r));
      let cls = 'dlc-node' + (unlocked ? ' unlocked' : selectable ? ' selectable' : ' locked');
      html += '<div class="' + cls + '" style="left:' + n.x + 'px;top:' + n.y + 'px;" onclick="DoctrineManager.unlock(' + 'DLC_DOCTRINES.' + DoctrineManager.service + '.branches[' + DoctrineManager.branchIdx + '].nodes[' + br.nodes.indexOf(n) + '], DLC_DOCTRINES.' + DoctrineManager.service + '.branches[' + DoctrineManager.branchIdx + '], \'' + DoctrineManager.service + '\')">' +
        '<div class="dn-title">' + n.name + '</div>' +
        '<div class="dn-cost">' + (unlocked ? '✅ 習得済' : n.cost + ' XP') + '</div></div>';
    });
    html += '</div></div></div>';

    // 効果説明
    html += '<div class="dlc-section"><h3>習得済み効果</h3>';
    const done = br.nodes.filter(n => gs.doctrine.includes(n.id));
    html += done.length ? done.map(n => '<span class="dlc-badge">' + n.name + '</span> ').join('') : '<span style="color:var(--text-secondary);font-size:11px;">まだありません</span>';
    html += '</div>';
    el.innerHTML = html;
  }

  static setService(k) { DoctrineManager.service = k; DoctrineManager.branchIdx = 0; DoctrineManager.render(); }
  static setBranch(i) { DoctrineManager.branchIdx = i; DoctrineManager.render(); }
}

// ==========================================================
// 2. EquipmentDesigner — 兵器モジュール設計 (戦車/艦船/航空機)
// ==========================================================
class EquipmentDesigner {
  static designs = [];
  static category = 'tank';
  static draft = { tank: { hull: null, modules: {} }, ship: { hull: null, modules: {} }, plane: { hull: null, modules: {} } };

  static DATA = {
    tank: { label: '🚜 戦車', xpKey: 'army', hulls: [
      { id: 'lt', name: '軽戦車', cost: 10 }, { id: 'mt', name: '中戦車', cost: 20 }, { id: 'ht', name: '重戦車', cost: 30 }],
      slots: [
        { id: 'gun', name: '主砲', options: [{ id: 'how', name: '榴弾砲', cost: 15, stat: 'soft' }, { id: 'at', name: '対戦車砲', cost: 15, stat: 'hard' }, { id: 'aa', name: '高射砲', cost: 12, stat: 'aa' }] },
        { id: 'armor', name: '装甲', options: [{ id: 'steel', name: '均質鋼板', cost: 10, stat: 'armor' }, { id: 'slope', name: '傾斜装甲', cost: 18, stat: 'armor+' }] },
        { id: 'engine', name: 'エンジン', options: [{ id: 'gas', name: 'ガソリン', cost: 10, stat: 'speed' }, { id: 'diesel', name: 'ディーゼル', cost: 14, stat: 'speed+' }] }
      ]},
    ship: { label: '⚓ 艦船', xpKey: 'navy', hulls: [
      { id: 'dd', name: '駆逐艦', cost: 10 }, { id: 'cl', name: '巡洋艦', cost: 20 }, { id: 'bb', name: '戦艦', cost: 35 }, { id: 'cv', name: '空母', cost: 40 }],
      slots: [
        { id: 'gun', name: '主砲', options: [{ id: 'lgun', name: '大口径主砲', cost: 18, stat: 'fire' }, { id: 'aa', name: '対空機銃', cost: 10, stat: 'aa' }] },
        { id: 'torp', name: '魚雷', options: [{ id: 'tub', name: '魚雷発射管', cost: 12, stat: 'torp' }, { id: 'none', name: '装備なし', cost: 0, stat: '' }] },
        { id: 'radar', name: '電装', options: [{ id: 'radar', name: 'レーダー', cost: 20, stat: 'spot' }, { id: 'none2', name: '装備なし', cost: 0, stat: '' }] }
      ]},
    plane: { label: '✈️ 航空機', xpKey: 'air', hulls: [
      { id: 'fighter', name: '戦闘機', cost: 10 }, { id: 'bomber', name: '爆撃機', cost: 20 }, { id: 'carrier', name: '艦上機', cost: 18 }],
      slots: [
        { id: 'engine', name: 'エンジン', options: [{ id: 'e1', name: '標準エンジン', cost: 10, stat: 'speed' }, { id: 'e2', name: '高出力エンジン', cost: 18, stat: 'speed+' }] },
        { id: 'weapon', name: '武装', options: [{ id: 'mg', name: '機銃強化', cost: 10, stat: 'aa' }, { id: 'rocket', name: 'ロケット弾', cost: 16, stat: 'hard' }] },
        { id: 'armor', name: '防弾', options: [{ id: 'plate', name: '防弾鋼板', cost: 10, stat: 'armor' }, { id: 'none3', name: 'なし', cost: 0, stat: '' }] }
      ]}
  };

  static cost(cat) {
    const d = EquipmentDesigner.DATA[cat];
    const draft = EquipmentDesigner.draft[cat];
    let c = draft.hull ? d.hulls.find(h => h.id === draft.hull).cost : 0;
    d.slots.forEach(s => {
      const mid = draft.modules[s.id];
      if (mid) { const o = s.options.find(o => o.id === mid); c += o ? o.cost : 0; }
    });
    return c;
  }

  static pickHull(hullId) {
    EquipmentDesigner.draft[EquipmentDesigner.category].hull = hullId;
    EquipmentDesigner.render();
  }

  static pickModule(slotId, optId) {
    EquipmentDesigner.draft[EquipmentDesigner.category].modules[slotId] = optId;
    EquipmentDesigner.render();
  }

  static saveDesign() {
    const cat = EquipmentDesigner.category;
    const draft = EquipmentDesigner.draft[cat];
    if (!draft.hull) { GameUI.notify('車体/船体/機体を選択してください。', 'alert'); return; }
    const gs = CoreEngine.gameState;
    const d = EquipmentDesigner.DATA[cat];
    const cost = EquipmentDesigner.cost(cat);
    if (gs.xp[d.xpKey] < cost) { GameUI.notify('XPが不足しています (' + cost + ' XP必要)。', 'alert'); return; }
    gs.xp[d.xpKey] -= cost;
    const hull = d.hulls.find(h => h.id === draft.hull);
    const mods = d.slots.map(s => {
      const mid = draft.modules[s.id];
      const o = mid ? s.options.find(o => o.id === mid) : null;
      return o ? s.name + ': ' + o.name : s.name + ': —';
    });
    const design = { id: 'd' + Date.now(), cat: cat, name: hull.name + ' ' + (d.slots.map(s => { const o = s.options.find(o => o.id === draft.modules[s.id]); return o ? o.name : ''; }).filter(Boolean).join('/')), stats: mods, cost: cost };
    EquipmentDesigner.designs.push(design);
    // 設計採用 → 兵器バフ (戦闘力に反映)
    if (cat === 'tank') gs.cardModifiers.armorBreakthrough += 3 + Math.floor(cost / 10);
    if (cat === 'plane') gs.cardModifiers.armorSpeed += 3 + Math.floor(cost / 10);
    if (cat === 'ship') gs.convoys += 20;
    CoreEngine.log('🛠️ ' + d.label + '設計完了: ' + design.name + ' (-' + cost + ' XP)');
    GameUI.notify('設計完了: ' + design.name, 'success');
    MultiplayerManager.broadcast({ type: 'design', design: design });
    EquipmentDesigner.render();
  }

  static equipDesign(id) {
    const dsg = EquipmentDesigner.designs.find(x => x.id === id);
    if (!dsg) return;
    const gs = CoreEngine.gameState;
    if (gs.equipment < 100) { GameUI.notify('装備が不足しています (100必要)。', 'alert'); return; }
    gs.equipment -= 100;
    CoreEngine.log('🛠️ ' + dsg.name + ' を100装備生産 (装備残: ' + gs.equipment + ')');
    GameUI.notify('生産開始: ' + dsg.name, 'success');
    EquipmentDesigner.render();
  }

  static render() {
    const el = document.getElementById('designer-content');
    if (!el) return;
    const gs = CoreEngine.gameState;
    const cat = EquipmentDesigner.category;
    const d = EquipmentDesigner.DATA[cat];
    const draft = EquipmentDesigner.draft[cat];
    let html = '<div class="dlc-section"><div style="display:flex;gap:4px;margin-bottom:8px;">';
    Object.entries(EquipmentDesigner.DATA).forEach(([k, v]) => {
      html += '<button class="research-tab' + (k === cat ? ' active' : '') + '" onclick="EquipmentDesigner.setCategory(\'' + k + '\')">' + v.label + ' <span style="color:var(--text-gold)">' + Math.floor(gs.xp[v.xpKey]) + 'XP</span></button>';
    });
    html += '</div></div>';

    // 設計エディタ
    html += '<div class="dlc-section"><h3>設計エディタ (XPを消費してモジュールを組み替え)</h3>';
    // ---- ブループリント (設計するにつれて図面が変わる) ----
    html += '<div class="dlc-card"><h4>📐 設計図 (ブループリント)</h4>' +
      '<canvas id="bp-canvas" width="440" height="250" style="width:100%;max-width:440px;height:auto;border:1px solid var(--border-mil,#3a4a5a);border-radius:6px;display:block;margin:6px 0 10px;"></canvas>' +
      '<div style="font-size:10px;color:var(--text-secondary);">車体・モジュールを選ぶと図面が変化します (破線=未選択)</div></div>';
    html += '<div class="dlc-card"><h4>ベース (車体/船体/機体)</h4>';
    d.hulls.forEach(h => {
      html += '<div class="dlc-row"><input type="radio" ' + (draft.hull === h.id ? 'checked' : '') + ' onchange="EquipmentDesigner.pickHull(\'' + h.id + '\')">' + h.name + ' <span style="color:var(--text-gold)">' + h.cost + 'XP</span></div>';
    });
    html += '</div>';
    d.slots.forEach(s => {
      html += '<div class="dlc-card"><h4>' + s.name + '</h4>';
      s.options.forEach(o => {
        html += '<div class="dlc-row"><input type="radio" ' + (draft.modules[s.id] === o.id ? 'checked' : '') + ' onchange="EquipmentDesigner.pickModule(\'' + s.id + '\',\'' + o.id + '\')">' + o.name + ' <span style="color:var(--text-gold)">' + o.cost + 'XP</span></div>';
      });
      html += '</div>';
    });
    html += '<div style="clear:both;"></div>';
    html += '<div style="margin-top:10px;"><button class="dlc-btn gold" onclick="EquipmentDesigner.saveDesign()">✔ 設計を確定 (' + EquipmentDesigner.cost(cat) + ' XP)</button></div>';
    html += '</div>';

    // 保存済み設計
    html += '<div class="dlc-section"><h3>設計一覧 (装備在庫: ' + Math.floor(gs.equipment) + ')</h3>';
    if (EquipmentDesigner.designs.length === 0) {
      html += '<span style="color:var(--text-secondary);font-size:11px;">まだ設計がありません。</span>';
    } else {
      EquipmentDesigner.designs.forEach(dsg => {
        html += '<div class="dlc-card"><h4>' + (EquipmentDesigner.DATA[dsg.cat] ? EquipmentDesigner.DATA[dsg.cat].label : dsg.cat) + ' — ' + dsg.name + '</h4>' +
          '<div>' + (dsg.stats || []).join('<br>') + '</div>' +
          '<button class="dlc-btn" style="margin-top:6px;" onclick="EquipmentDesigner.equipDesign(\'' + dsg.id + '\')">🏭 100装備生産</button></div>';
      });
    }
    html += '</div>';
    el.innerHTML = html;
    // ブループリントを現在の下書きで描画
    BlueprintRenderer.draw(cat, draft, document.getElementById('bp-canvas'));
  }

  static setCategory(k) { EquipmentDesigner.category = k; EquipmentDesigner.render(); }
}

// ==========================================================
// BlueprintRenderer — 設計図 (ブループリント) の動的描画
//   青い下地に白線で兵器を描く。選択したモジュールが
//   「設計するにつれて」図面に反映される (未選択部分は破線の仮置き)
// ==========================================================
class BlueprintRenderer {
  static INK = '#dceafc';
  static FAINT = 'rgba(220,240,255,0.35)';
  static FILL = 'rgba(220,240,255,0.08)';

  static draw(cat, draft, canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // ---- 青い下地 + 方眼 ----
    ctx.fillStyle = '#14406e';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120,175,225,0.22)';
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 20; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // 外枠 (図面枠)
    ctx.strokeStyle = BlueprintRenderer.FAINT;
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    // タイトルブロック
    ctx.font = '10px monospace';
    ctx.fillStyle = BlueprintRenderer.FAINT;
    ctx.textAlign = 'left';
    ctx.fillText('DESIGN NO. ' + (draft.hull || '----').toUpperCase() + '-' + String(Object.keys(draft.modules).length).padStart(2, '0'), 16, 22);

    ctx.save();
    ctx.strokeStyle = BlueprintRenderer.INK;
    ctx.fillStyle = BlueprintRenderer.FILL;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.font = '10px sans-serif';
    if (cat === 'tank') BlueprintRenderer.drawTank(ctx, W, H, draft);
    else if (cat === 'ship') BlueprintRenderer.drawShip(ctx, W, H, draft);
    else BlueprintRenderer.drawPlane(ctx, W, H, draft);
    ctx.restore();
  }

  // ---- 破線の仮置き (未選択スロット) ----
  static placeholder(ctx, x, y, w, h, label) {
    ctx.save();
    ctx.strokeStyle = BlueprintRenderer.FAINT;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = BlueprintRenderer.FAINT;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - h / 2 - 4);
    ctx.restore();
  }

  static dashedCircle(ctx, x, y, r, label) {
    ctx.save();
    ctx.strokeStyle = BlueprintRenderer.FAINT;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = BlueprintRenderer.FAINT;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - r - 4);
    ctx.restore();
  }

  // ================= 戦車 =================
  static drawTank(ctx, W, H, draft) {
    const cx = W / 2, gy = H * 0.72;
    const sizes = { lt: 100, mt: 132, ht: 168 };
    const hw = sizes[draft.hull];
    if (!hw) {
      BlueprintRenderer.placeholder(ctx, cx, gy - 20, 150, 46, '車体未選択');
      BlueprintRenderer.dashedCircle(ctx, cx, gy - 48, 18, '砲塔未選択');
      return;
    }
    const hh = draft.hull === 'ht' ? 30 : 24;
    // 転輪 (キャタピラ)
    const wheels = draft.hull === 'ht' ? 6 : 5;
    const wr = 6.5, span = hw * 0.82;
    ctx.beginPath();
    for (let i = 0; i < wheels; i++) {
      const x = cx - span / 2 + i * (span / (wheels - 1));
      ctx.moveTo(x + wr, gy);
      ctx.arc(x, gy, wr, 0, Math.PI * 2);
    }
    ctx.stroke();
    // キャタピラ外周
    ctx.beginPath();
    const ty = gy - wr - 2.5;
    ctx.roundRect(cx - span / 2 - wr, ty, span + wr * 2, wr * 2 + 5, 5);
    ctx.stroke();
    // 車体
    ctx.beginPath();
    if (draft.hull === 'lt') {
      ctx.roundRect(cx - hw / 2, gy - hh, hw, hh, 6);
    } else if (draft.hull === 'mt') {
      ctx.moveTo(cx - hw / 2, gy);
      ctx.lineTo(cx - hw / 2 - 4, gy - hh * 0.55);
      ctx.lineTo(cx - hw / 2 + 8, gy - hh);
      ctx.lineTo(cx + hw / 2, gy - hh);
      ctx.lineTo(cx + hw / 2, gy);
    } else {
      ctx.moveTo(cx - hw / 2, gy);
      ctx.lineTo(cx - hw / 2, gy - hh * 0.4);
      ctx.lineTo(cx - hw / 2 + 14, gy - hh);
      ctx.lineTo(cx + hw / 2, gy - hh);
      ctx.lineTo(cx + hw / 2, gy);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // ---- 主砲/砲塔 ----
    const gy2 = gy - hh;
    const gun = draft.modules.gun;
    if (!gun) {
      BlueprintRenderer.dashedCircle(ctx, cx, gy2 - 12, 16, '主砲未選択');
    } else {
      // 砲塔形状 (榴弾砲=角い大型 / 対戦車砲=六角 / 高射砲=小型円形)
      ctx.beginPath();
      if (gun === 'how') {
        ctx.roundRect(cx - 26, gy2 - 22, 52, 22, 5);
      } else if (gun === 'at') {
        ctx.moveTo(cx - 20, gy2); ctx.lineTo(cx - 13, gy2 - 20); ctx.lineTo(cx + 13, gy2 - 20);
        ctx.lineTo(cx + 20, gy2); ctx.closePath();
      } else {
        ctx.arc(cx, gy2 - 11, 12, Math.PI, 0); ctx.closePath();
      }
      ctx.fill(); ctx.stroke();
      // 砲身 (種類で長さが変わる)
      let bl = 30, bt = 3;
      if (gun === 'at') { bl = 52; bt = 2.5; }
      if (gun === 'aa') { bl = 22; bt = 2.5; }
      ctx.beginPath();
      if (gun === 'aa') {
        ctx.roundRect(cx + 8, gy2 - 17, bl, 3, 2);
        ctx.roundRect(cx + 8, gy2 - 11, bl, 3, 2);
      } else {
        ctx.roundRect(cx + 10, gy2 - 14 - bt / 2, bl, bt, 2);
        if (gun === 'how') { ctx.roundRect(cx + 10 + bl, gy2 - 17, 4, 8, 1); }   // 砲口制退器
      }
      ctx.stroke();
    }
    // ---- 装甲 ----
    const armor = draft.modules.armor;
    if (armor === 'steel') {
      ctx.beginPath();
      ctx.moveTo(cx - hw / 2 + 4, gy - 4); ctx.lineTo(cx - hw / 2 + 4, gy - hh + 3);
      ctx.moveTo(cx + hw / 2 - 4, gy - 4); ctx.lineTo(cx + hw / 2 - 4, gy - hh + 3);
      ctx.stroke();
    } else if (armor === 'slope') {
      ctx.beginPath();
      ctx.moveTo(cx - hw / 2 - 2, gy);
      ctx.lineTo(cx - hw / 2 + 16, gy - hh - 2);
      ctx.moveTo(cx - hw / 2 - 2, gy - 6);
      ctx.lineTo(cx - hw / 2 + 16, gy - hh - 8);
      ctx.stroke();
    }
    // ---- エンジン (後部の換気・排気) ----
    if (draft.modules.engine) {
      ctx.beginPath();
      ctx.moveTo(cx + hw / 2 - 12, gy - hh - 3); ctx.lineTo(cx + hw / 2 - 4, gy - hh - 3);
      ctx.moveTo(cx + hw / 2 - 12, gy - hh - 7); ctx.lineTo(cx + hw / 2 - 4, gy - hh - 7);
      ctx.moveTo(cx + hw / 2 - 2, gy - hh - 6); ctx.lineTo(cx + hw / 2 + 10, gy - hh - 10);
      ctx.stroke();
      ctx.font = '8px monospace';
      ctx.fillStyle = BlueprintRenderer.INK;
      ctx.fillText(draft.modules.engine === 'diesel' ? 'DIESEL' : 'GASOLINE', cx + hw / 2 + 4, gy - hh - 16);
    }
  }

  // ================= 艦船 =================
  static drawShip(ctx, W, H, draft) {
    const cx = W / 2, wy = H * 0.68;
    const spec = { dd: [130, 16], cl: [180, 22], bb: [230, 30], cv: [220, 24] }[draft.hull];
    if (!spec) {
      BlueprintRenderer.placeholder(ctx, cx, wy - 14, 200, 34, '船体未選択');
      BlueprintRenderer.dashedCircle(ctx, cx, wy - 48, 12, '主砲未選択');
      return;
    }
    const [len, dep] = spec;
    // 船体 (側面輪郭)
    ctx.beginPath();
    ctx.moveTo(cx - len / 2, wy - dep);
    ctx.lineTo(cx + len / 2 - 14, wy - dep);
    ctx.lineTo(cx + len / 2 + 10, wy - dep * 0.35);
    ctx.lineTo(cx + len / 2 - 6, wy);
    ctx.lineTo(cx - len / 2, wy);
    ctx.lineTo(cx - len / 2 + 10, wy - dep * 0.4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 水線
    ctx.beginPath();
    ctx.setLineDash([7, 5]);
    ctx.moveTo(cx - len / 2 - 16, wy + 4);
    ctx.lineTo(cx + len / 2 + 22, wy + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    // ---- 主砲 (艦砲塔) ----
    const gun = draft.modules.gun;
    const turretN = draft.hull === 'bb' ? 3 : draft.hull === 'cv' ? 0 : 2;
    if (!gun && draft.hull !== 'cv') {
      BlueprintRenderer.dashedCircle(ctx, cx - len * 0.2, wy - dep - 12, 10, '主砲未選択');
    } else if (gun === 'lgun') {
      for (let i = 0; i < turretN; i++) {
        const tx = cx - len * 0.32 + i * len * 0.28;
        ctx.beginPath();
        ctx.roundRect(tx - 9, wy - dep - 13, 18, 13, 3);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(tx + 7, wy - dep - 10, 16, 2.5, 1);
        ctx.roundRect(tx + 7, wy - dep - 6, 16, 2.5, 1);
        ctx.stroke();
      }
    } else if (gun === 'aa') {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const tx = cx - len * 0.3 + i * len * 0.3;
        ctx.moveTo(tx, wy - dep); ctx.lineTo(tx, wy - dep - 9);
        ctx.moveTo(tx - 5, wy - dep - 9); ctx.lineTo(tx + 5, wy - dep - 9);
      }
      ctx.stroke();
    }
    // ---- 魚雷発射管 ----
    if (draft.modules.torp === 'tub') {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.roundRect(cx + len * 0.12 + i * 12, wy - dep - 4, 10, 5, 2);
      }
      ctx.stroke();
      ctx.font = '8px monospace'; ctx.fillStyle = BlueprintRenderer.INK;
      ctx.fillText('TORPEDO', cx + len * 0.2, wy - dep - 12);
    }
    // ---- 電装 (レーダーマスト) ----
    if (draft.modules.radar === 'radar') {
      const mx = draft.hull === 'cv' ? cx + len * 0.25 : cx - len * 0.02;
      ctx.beginPath();
      ctx.moveTo(mx, wy - dep); ctx.lineTo(mx, wy - dep - 26);
      ctx.moveTo(mx - 7, wy - dep - 18); ctx.lineTo(mx + 7, wy - dep - 18);
      ctx.stroke();
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = BlueprintRenderer.FAINT;
      ctx.beginPath();
      ctx.arc(mx, wy - dep - 22, 12, -Math.PI * 0.9, -Math.PI * 0.1);
      ctx.stroke();
      ctx.restore();
    }
    // ---- 空母: 飛行甲板 + 艦橋 ----
    if (draft.hull === 'cv') {
      ctx.beginPath();
      ctx.moveTo(cx - len / 2 - 6, wy - dep - 8);
      ctx.lineTo(cx + len / 2 + 6, wy - dep - 8);
      ctx.moveTo(cx - len / 2 - 6, wy - dep - 20);
      ctx.lineTo(cx + len / 2 + 6, wy - dep - 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(cx + len * 0.16, wy - dep - 24, 12, 20, 2);
      ctx.stroke();
    }
  }

  // ================= 航空機 =================
  static drawPlane(ctx, W, H, draft) {
    const cx = W / 2, cy = H * 0.55;
    if (!draft.hull) {
      BlueprintRenderer.placeholder(ctx, cx, cy, 150, 40, '機体未選択');
      return;
    }
    const len = draft.hull === 'bomber' ? 130 : draft.hull === 'carrier' ? 110 : 100;
    const fh = draft.hull === 'bomber' ? 22 : 14;
    // 主翼 (上から見た断面)
    const wingSpan = draft.hull === 'bomber' ? 70 : draft.hull === 'carrier' ? 55 : 48;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy + wingSpan * 0.55);
    ctx.lineTo(cx - 2, cy - fh);
    ctx.lineTo(cx + 10, cy - fh);
    ctx.lineTo(cx + 16, cy + wingSpan * 0.55);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 胴体
    ctx.beginPath();
    ctx.ellipse(cx, cy, len / 2, fh, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 尾翼
    ctx.beginPath();
    ctx.moveTo(cx - len / 2 + 4, cy - 2);
    ctx.lineTo(cx - len / 2 - 8, cy + wingSpan * 0.28);
    ctx.lineTo(cx - len / 2 + 12, cy + wingSpan * 0.28);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // ---- エンジン/プロペラ ----
    const eng = draft.modules.engine;
    if (!eng) {
      BlueprintRenderer.dashedCircle(ctx, cx + len / 2 + 10, cy, 9, 'エンジン未選択');
    } else {
      ctx.beginPath();
      ctx.arc(cx + len / 2 + 6, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = eng === 'e2' ? BlueprintRenderer.INK : BlueprintRenderer.FAINT;
      ctx.beginPath();
      ctx.arc(cx + len / 2 + 6, cy, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // ---- 武装 ----
    const wp = draft.modules.weapon;
    if (wp === 'mg') {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.arc(cx + len / 2 - 14, cy - fh + 4 + i * 6, 2, 0, Math.PI * 2);
      }
      ctx.stroke();
    } else if (wp === 'rocket') {
      ctx.beginPath();
      ctx.roundRect(cx - 6, cy + wingSpan * 0.4, 14, 4, 2);
      ctx.roundRect(cx + 4, cy + wingSpan * 0.45, 14, 4, 2);
      ctx.stroke();
      ctx.font = '8px monospace'; ctx.fillStyle = BlueprintRenderer.INK;
      ctx.fillText('ROCKET', cx - 2, cy + wingSpan * 0.4 + 14);
    }
    // ---- 防弾 (コクピット装甲) ----
    if (draft.modules.armor === 'plate') {
      ctx.beginPath();
      ctx.roundRect(cx + 6, cy - fh - 3, 16, fh + 6, 3);
      ctx.stroke();
      ctx.font = '8px monospace'; ctx.fillStyle = BlueprintRenderer.INK;
      ctx.fillText('ARMOR', cx + 14, cy - fh - 8);
    }
  }
}

window.BlueprintRenderer = BlueprintRenderer;

// ==========================================================
// 3. IntelligenceManager — 諜報機関とスパイ活動 (La Résistance)
// ==========================================================
class IntelligenceManager {
  static createAgency() {
    const gs = CoreEngine.gameState;
    if (gs.politicalPower < 50) { GameUI.notify('政治力が不足しています (50必要)。', 'alert'); return; }
    gs.politicalPower -= 50;
    gs.intel.agency = gs.country + '諜報総局';
    gs.intel.level = 1;
    CoreEngine.log('🕵️ 諜報機関を設立: ' + gs.intel.agency);
    GameUI.notify('諜報機関を設立しました', 'success');
    IntelligenceManager.render();
  }

  static upgrade() {
    const gs = CoreEngine.gameState;
    const cost = 100 * gs.intel.level;
    if (gs.politicalPower < cost) { GameUI.notify('政治力が不足しています (' + cost + '必要)。', 'alert'); return; }
    gs.politicalPower -= cost;
    gs.intel.level = Math.min(5, gs.intel.level + 1);
    CoreEngine.log('🕵️ 諜報機関を拡張 (Lv.' + gs.intel.level + ')');
    IntelligenceManager.render();
  }

  static hireSpy() {
    const gs = CoreEngine.gameState;
    if (gs.intel.spies >= gs.intel.level * 2) { GameUI.notify('諜報機関のレベルを上げる必要があります。', 'alert'); return; }
    if (gs.politicalPower < 75) { GameUI.notify('政治力が不足しています (75必要)。', 'alert'); return; }
    gs.politicalPower -= 75;
    gs.intel.spies++;
    CoreEngine.log('🕵️ スパイを雇用 (諜報員: ' + gs.intel.spies + '名)');
    IntelligenceManager.render();
  }

  static startOp(opId) {
    const gs = CoreEngine.gameState;
    if (gs.intel.op) { GameUI.notify('既にオペレーション実行中です。', 'alert'); return; }
    if (gs.intel.spies < 1) { GameUI.notify('スパイを雇用してください。', 'alert'); return; }
    const op = DLC_INTEL_OPS.find(o => o.id === opId);
    gs.intel.op = { id: opId, progress: 0, dur: Math.max(10, op.dur - gs.intel.level * 4) };
    CoreEngine.log('🕵️ オペレーション開始: ' + op.name);
    IntelligenceManager.render();
  }

  static cancelOp() { CoreEngine.gameState.intel.op = null; IntelligenceManager.render(); }

  static onTick() {
    const gs = CoreEngine.gameState;
    const op = gs.intel.op;
    if (!op) return;
    op.progress += 1;
    if (op.progress >= op.dur) {
      gs.intel.op = null;
      if (op.id === 'infil') { gs.politicalPower += 30; gs.worldTension = Math.min(100, gs.worldTension + 1); }
      if (op.id === 'crypto') { gs.xp.army += 20; gs.warSupport = Math.min(100, gs.warSupport + 3); }
      if (op.id === 'politics') { gs.stability = Math.min(100, gs.stability + 3); gs.worldTension = Math.min(100, gs.worldTension + 2); }
      if (op.id === 'subvert') { gs.worldTension = Math.min(100, gs.worldTension + 2); gs.warSupport = Math.min(100, gs.warSupport + 2); }
      CoreEngine.log('🕵️ オペレーション完了: ' + (DLC_INTEL_OPS.find(o => o.id === op.id) || {}).name);
      GameUI.notify('諜報オペレーション完了！', 'success');
    }
  }

  static render() {
    const el = document.getElementById('intel-content');
    if (!el) return;
    const gs = CoreEngine.gameState;
    let html = '';
    if (!gs.intel.agency) {
      html += '<div class="dlc-section"><h3>諜報機関の設立</h3><p style="font-size:12px;">政治力50を消費して諜報機関を設立すると、スパイの雇用とオペレーションが可能になります。</p>' +
        '<button class="dlc-btn gold" onclick="IntelligenceManager.createAgency()">🕵️ 諜報機関を設立 (50 PP)</button></div>';
    } else {
      html += '<div class="dlc-section"><h3>' + gs.intel.agency + ' (Lv.' + gs.intel.level + '/5)</h3>' +
        '<div class="dlc-row">スパイ: ' + gs.intel.spies + ' / 最大 ' + (gs.intel.level * 2) + '名</div>' +
        '<button class="dlc-btn" onclick="IntelligenceManager.upgrade()">拡張 (' + (100 * gs.intel.level) + ' PP)</button> ' +
        '<button class="dlc-btn" onclick="IntelligenceManager.hireSpy()">スパイ雇用 (75 PP)</button></div>';
      html += '<div class="dlc-section"><h3>オペレーション</h3>';
      const op = gs.intel.op;
      if (op) {
        const def = DLC_INTEL_OPS.find(o => o.id === op.id);
        html += '<div class="dlc-card"><h4>' + def.icon + ' ' + def.name + ' — 実行中</h4>' +
          '<div class="dlc-xpbar"><div class="dlc-xpbar-fill" style="width:' + (op.progress / op.dur * 100) + '%"></div></div>' +
          '<div>' + op.progress + ' / ' + op.dur + '日</div>' +
          '<button class="dlc-btn" style="margin-top:6px;" onclick="IntelligenceManager.cancelOp()">中止</button></div>';
      } else {
        DLC_INTEL_OPS.forEach(o => {
          html += '<div class="dlc-card"><h4>' + o.icon + ' ' + o.name + '</h4><div>' + o.desc + '</div>' +
            '<div style="color:var(--text-gold);margin-top:4px;">効果: ' + o.eff + '</div>' +
            '<button class="dlc-btn" style="margin-top:6px;" onclick="IntelligenceManager.startOp(\'' + o.id + '\')">開始</button></div>';
        });
      }
      html += '</div>';
    }
    el.innerHTML = html;
  }
}

// ==========================================================
// 4. MIOManager — 軍需産業組織 + 国際市場 (Arms Against Tyranny)
// ==========================================================
class MIOManager {
  static state = { assigned: null, mios: DLC_MIOS.map(m => ({ id: m.id, xp: 0, level: 1 })) };

  static assign(mioId) {
    MIOManager.state.assigned = mioId;
    CoreEngine.log('🏭 軍需産業組織を主力に指定: ' + (DLC_MIOS.find(m => m.id === mioId) || {}).name);
    MIOManager.render();
  }

  static onTick() {
    MIOManager.state.mios.forEach(m => {
      const def = DLC_MIOS.find(d => d.id === m.id);
      if (m.level >= 5) return;
      m.xp += def.xpPerDay;
      if (m.xp >= 100) {
        m.xp -= 100;
        m.level++;
        CoreEngine.gameState.cardModifiers[def.mod] = (CoreEngine.gameState.cardModifiers[def.mod] || 0) + def.buffPerLevel;
        CoreEngine.log('🏭 ' + def.name + ' がLv.' + m.level + ' に成長');
      }
    });
  }

  static buy(tag) {
    const gs = CoreEngine.gameState;
    const offers = { USA: 40, GER: 35, SOV: 30, ENG: 35, ITA: 25 };
    const cost = offers[tag] || 30;
    if (gs.politicalPower < cost) { GameUI.notify('政治力が不足しています (' + cost + '必要)。', 'alert'); return; }
    gs.politicalPower -= cost;
    gs.equipment = (gs.equipment || 0) + 500;
    CoreEngine.log('📦 国際市場: ' + tag + ' から装備500を輸入 (-' + cost + ' PP)');
    GameUI.notify('装備500を輸入しました', 'success');
    MIOManager.render();
  }

  static sell() {
    const gs = CoreEngine.gameState;
    if ((gs.equipment || 0) < 500) { GameUI.notify('装備が不足しています (500必要)。', 'alert'); return; }
    gs.equipment -= 500;
    gs.politicalPower += 25;
    CoreEngine.log('📦 国際市場: 装備500を輸出 (+25 PP)');
    GameUI.notify('装備500を輸出しました', 'success');
    MIOManager.render();
  }

  static render() {
    const el = document.getElementById('mio-content');
    if (!el) return;
    const gs = CoreEngine.gameState;
    let html = '<div class="dlc-section"><h3>軍需産業組織 (MIO)</h3>';
    MIOManager.state.mios.forEach(m => {
      const def = DLC_MIOS.find(d => d.id === m.id);
      html += '<div class="dlc-card"><h4>' + def.icon + ' ' + def.name + ' <span class="dlc-badge">Lv.' + m.level + '</span></h4>' +
        '<div class="dlc-xpbar"><div class="dlc-xpbar-fill" style="width:' + m.xp + '%"></div></div>' +
        (MIOManager.state.assigned === m.id ? '<div style="color:var(--text-gold);">★ 主力指定中 (生産バフ適用中)</div>' : '<button class="dlc-btn" onclick="MIOManager.assign(\'' + m.id + '\')">主力に指定</button>') +
        '</div>';
    });
    html += '</div>';

    html += '<div class="dlc-section"><h3>国際市場 (装備在庫: ' + Math.floor(gs.equipment || 0) + ')</h3>';
    html += '<div class="dlc-row"><b>輸入</b><span style="color:var(--text-secondary);font-size:11px;">民需工場を対価に装備を購入</span></div>';
    ['USA', 'GER', 'SOV', 'ENG', 'ITA'].forEach(tag => {
      const flag = DataFetcher.getCountryFlag ? DataFetcher.getCountryFlag(tag) : tag;
      html += '<div class="dlc-row">' + flag + ' ' + tag + ' — 装備500 <button class="dlc-btn" onclick="MIOManager.buy(\'' + tag + '\')">輸入 (35~40 PP)</button></div>';
    });
    html += '<div class="dlc-row"><b>輸出</b><span style="color:var(--text-secondary);font-size:11px;">装備500を売却し+25 PP</span> <button class="dlc-btn" onclick="MIOManager.sell()">輸出</button></div>';
    html += '</div>';
    el.innerHTML = html;
  }
}

// ==========================================================
// 5. PeaceConferenceManager — 講和会議の拡張
// ==========================================================
class PeaceConferenceManager {
  static render() {
    const el = document.getElementById('peace-content');
    if (!el) return;
    const gs = CoreEngine.gameState;
    if (!MapRenderer.ready) { el.innerHTML = '<p style="color:var(--text-secondary);padding:12px;">地図読込中...</p>'; return; }
    const enemies = gs.atWar || [];
    let html = '<div class="dlc-section"><h3>講和会議 — 交戦国: ' + (enemies.length ? enemies.join(', ') : 'なし') + '</h3>';
    if (enemies.length === 0) {
      html += '<p style="font-size:12px;color:var(--text-secondary);">現在講和会議を開ける交戦国がありません。宣戦布告または占領後に利用できます。</p></div>';
    } else {
      // 各交戦国ごとの講和/州併合
      enemies.forEach(tag => {
        const ppCost = 25;
        html += '<div class="dlc-card"><h4>' + tag + '</h4>' +
          '<button class="dlc-btn gold" onclick="PeaceConferenceManager.peaceOut(\'' + tag + '\')">🕊️ 白紙講和 (' + ppCost + ' PP / 緊張度-5)</button></div>';
      });
      html += '</div>';
      // 占領済み/占領可能な州
      html += '<div class="dlc-section"><h3>領土要求 (占領州の処理)</h3>';
      const targetStates = Object.entries(MapRenderer.states).filter(([sid, st]) => enemies.includes(st.owner));
      if (targetStates.length === 0) html += '<span style="color:var(--text-secondary);font-size:11px;">該当州なし</span>';
      targetStates.slice(0, 40).forEach(([sid, st]) => {
        const vp = Math.max(0, ...Object.values(st.vp || {}));
        const cost = Math.round(10 + vp * 10);
        html += '<div class="dlc-row"><span style="flex:1;">' + st.name + ' (' + st.owner + ')</span>' +
          '<button class="dlc-btn" onclick="PeaceConferenceManager.annex(\'' + sid + '\')">併合 (' + cost + ' PP)</button> ' +
          '<button class="dlc-btn" onclick="PeaceConferenceManager.puppet(\'' + sid + '\')">傀儡化 (40 PP)</button></div>';
      });
      html += '</div>';
    }
    el.innerHTML = html;
  }

  static peaceOut(tag) {
    const gs = CoreEngine.gameState;
    if (gs.politicalPower < 25) { GameUI.notify('政治力が不足しています (25必要)。', 'alert'); return; }
    gs.politicalPower -= 25;
    gs.atWar = gs.atWar.filter(t => t !== tag);
    gs.worldTension = Math.max(0, gs.worldTension - 5);
    CoreEngine.log('🕊️ ' + tag + ' と講和条約を締結しました。');
    GameUI.notify('講和成立: ' + tag, 'success');
    MultiplayerManager.broadcast({ type: 'peace', tag: tag });
    PeaceConferenceManager.render();
  }

  static annex(sid) {
    const gs = CoreEngine.gameState;
    const st = MapRenderer.states[sid];
    if (!st) return;
    const vp = Math.max(0, ...Object.values(st.vp || {}));
    const cost = Math.round(10 + vp * 10);
    if (gs.politicalPower < cost) { GameUI.notify('政治力が不足しています (' + cost + '必要)。', 'alert'); return; }
    gs.politicalPower -= cost;
    MapRenderer.captureState(sid, gs.country);
    gs.worldTension = Math.min(100, gs.worldTension + 2);
    CoreEngine.log('🕊️ 講和会議: ' + st.name + ' を併合しました。');
    GameUI.notify('併合: ' + st.name, 'success');
    MultiplayerManager.broadcast({ type: 'state_capture', state: sid, owner: gs.country });
    PeaceConferenceManager.render();
  }

  static puppet(sid) {
    const gs = CoreEngine.gameState;
    const st = MapRenderer.states[sid];
    if (!st) return;
    if (gs.politicalPower < 40) { GameUI.notify('政治力が不足しています (40必要)。', 'alert'); return; }
    gs.politicalPower -= 40;
    gs.puppets.push(sid);
    CoreEngine.log('🕊️ 講和会議: ' + st.name + ' を傀儡化しました (資源の一部が自国に流入)。');
    GameUI.notify('傀儡化: ' + st.name, 'success');
    PeaceConferenceManager.render();
  }
}

// ==========================================================
// 6. GeneralTraitManager — 将軍の特性ツリー育成
// ==========================================================
class GeneralTraitManager {
  static unlocked = [];   // trait node ids
  static selected = null; // general id

  static generals() {
    const list = [];
    (BattlePlanManager.armies || []).forEach(a => {
      list.push({ id: 'army' + a.id, name: a.name + '司令官', src: 'army' });
    });
    (CardSystem.hiredCards || []).forEach(c => {
      const role = (c.role || c.type || '').toString();
      if (/将軍|general|提督|admiral|政治家/i.test(role + ' ' + (c.name || ''))) {
        list.push({ id: 'card' + c.id, name: c.name, src: 'card' });
      }
    });
    return list;
  }

  static unlock(node) {
    const gs = CoreEngine.gameState;
    if (GeneralTraitManager.unlocked.includes(node.id)) return;
    const okReq = node.req.every(r => GeneralTraitManager.unlocked.includes(r));
    if (!okReq) { GameUI.notify('前提特性が未習得です。', 'alert'); return; }
    if (gs.xp.army < node.cost) { GameUI.notify('陸軍XPが不足しています。', 'alert'); return; }
    gs.xp.army -= node.cost;
    GeneralTraitManager.unlocked.push(node.id);
    Object.entries(node.eff).forEach(([k, v]) => {
      gs.cardModifiers[k] = (gs.cardModifiers[k] || 0) + v;
    });
    CoreEngine.log('🎖️ 将軍特性習得: ' + node.name + ' (-' + node.cost + ' XP)');
    GameUI.notify('特性習得: ' + node.name, 'success');
    GeneralTraitManager.render();
  }

  static render() {
    const el = document.getElementById('traits-content');
    if (!el) return;
    const gs = CoreEngine.gameState;
    const gens = GeneralTraitManager.generals();
    let html = '<div class="dlc-section"><h3>将軍の選択 (陸軍XP: ' + Math.floor(gs.xp.army) + ')</h3>';
    if (gens.length === 0) html += '<span style="color:var(--text-secondary);font-size:11px;">将軍がいません。カードを雇用するか軍集団を編成してください。</span>';
    gens.forEach(g => {
      html += '<button class="research-tab' + (GeneralTraitManager.selected === g.id ? ' active' : '') + '" onclick="GeneralTraitManager.select(\'' + g.id + '\')">' + g.name + '</button> ';
    });
    html += '</div>';

    if (GeneralTraitManager.selected && gens.find(g => g.id === GeneralTraitManager.selected)) {
      html += '<div class="dlc-section"><h3>特性ツリー</h3><div class="dlc-tree-canvas" style="height:300px;"><div class="dlc-tree-viewport" style="width:280px;height:240px;">';
      let lines = '';
      DLC_TRAIT_TREES.forEach(tr => tr.nodes.forEach(n => n.req.forEach(r => {
        const pre = tr.nodes.find(x => x.id === r);
        if (pre) lines += '<path d="' + dlcOrthoPath(pre.x + 65, pre.y + 38, n.x + 65, n.y + 10) + '" stroke="' + (GeneralTraitManager.unlocked.includes(r) ? '#4ac46a' : '#3a4a5a') + '" stroke-width="2" fill="none" opacity="0.7"/>';
      })));
      html += '<svg class="dlc-svg-lines" width="280" height="240">' + lines + '</svg>';
      DLC_TRAIT_TREES.forEach((tr, ti) => {
        tr.nodes.forEach(n => {
          const unlocked = GeneralTraitManager.unlocked.includes(n.id);
          const selectable = !unlocked && n.req.every(r => GeneralTraitManager.unlocked.includes(r));
          let cls = 'dlc-node' + (unlocked ? ' unlocked' : selectable ? ' selectable' : ' locked');
          html += '<div class="' + cls + '" style="left:' + (n.x + ti * 150) + 'px;top:' + n.y + 'px;" onclick="GeneralTraitManager.unlock(' + 'DLC_TRAIT_TREES[' + ti + '].nodes[' + tr.nodes.indexOf(n) + '])">' +
            '<div class="dn-title">' + tr.name + ' / ' + n.name + '</div>' +
            '<div class="dn-cost">' + (unlocked ? '✅' : n.cost + ' XP') + '</div></div>';
        });
      });
      html += '</div></div></div>';
      html += '<div class="dlc-section"><h3>習得済み特性</h3>';
      const done = [];
      DLC_TRAIT_TREES.forEach(tr => tr.nodes.forEach(n => { if (GeneralTraitManager.unlocked.includes(n.id)) done.push(tr.name + '/' + n.name); }));
      html += done.length ? done.map(n => '<span class="dlc-badge">' + n + '</span> ').join('') : '<span style="color:var(--text-secondary);font-size:11px;">まだありません</span>';
      html += '</div>';
    }
    el.innerHTML = html;
  }

  static select(id) { GeneralTraitManager.selected = id; GeneralTraitManager.render(); }
}
