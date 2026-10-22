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
    if (!gs.doctrineRoutes || typeof gs.doctrineRoutes !== 'object') gs.doctrineRoutes = {};
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
      .dlc-badge.negative { background: var(--accent-red, #b03a3a); }
      /* ---- ドクトリンツリー (assets/doctrine-data.js) ---- */
      .doctrine-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
      .doctrine-hint { font-size: 11px; color: var(--text-secondary); margin: 6px 0 10px; line-height: 1.6; }
      .doctrine-routes { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
      .doctrine-route-card { position: relative; width: 190px; padding: 8px 10px; border-radius: 8px; background: var(--bg-panel-light); border: 1px solid var(--border-mil); border-top: 3px solid var(--route-color, #5e9ec7); font-size: 11px; }
      .doctrine-route-card img { position: absolute; right: 6px; top: 6px; width: 34px; height: 26px; object-fit: contain; opacity: .85; }
      .doctrine-route-card .dr-name { font-weight: 700; font-size: 12px; color: var(--text-gold); padding-right: 40px; }
      .doctrine-route-card .dr-desc { color: var(--text-secondary); margin: 4px 0 6px; line-height: 1.5; min-height: 32px; }
      .doctrine-route-card.chosen { border-color: var(--accent-green); box-shadow: inset 0 0 0 1px rgba(74,196,106,.35); }
      .doctrine-route-card.locked { opacity: .45; }
      .doctrine-route-card .dr-state { font-size: 10px; color: var(--accent-green); font-weight: 700; }
      .doctrine-canvas { position: relative; overflow: auto; max-height: 430px; background: radial-gradient(ellipse at center, #111820 0%, #0a0c0f 100%); border: 1px solid var(--border-mil); border-radius: 6px; }
      .doctrine-viewport { position: relative; }
      .doctrine-lines { position: absolute; top: 0; left: 0; pointer-events: none; }
      .doctrine-node { position: absolute; display: flex; align-items: center; gap: 6px; padding: 6px; box-sizing: border-box; border-radius: 7px; background: var(--bg-panel-light); border: 2px solid var(--border-mil); cursor: pointer; transition: border-color .15s, transform .15s; }
      .doctrine-node:hover { border-color: var(--accent-blue); transform: scale(1.02); z-index: 10; }
      .doctrine-node .dn-icon { width: 40px; height: 32px; object-fit: contain; flex: 0 0 40px; background: #0c1116; border-radius: 4px; }
      .doctrine-node .dn-icon.placeholder { display: flex; align-items: center; justify-content: center; font-size: 16px; }
      .doctrine-node .dn-body { flex: 1; min-width: 0; }
      .doctrine-node .dn-title { font-size: 11px; font-weight: 700; line-height: 1.25; color: var(--text-primary); }
      .doctrine-node .dn-effect { font-size: 9px; line-height: 1.3; color: var(--text-secondary); margin-top: 2px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .doctrine-node .dn-cost { font-size: 10px; color: var(--text-gold); margin-top: 2px; }
      .doctrine-node.unlocked { background: #16241a; border-color: var(--accent-green); }
      .doctrine-node.unlocked .dn-cost { color: var(--accent-green); }
      .doctrine-node.selectable { border-color: #4a8f5e; box-shadow: 0 0 6px rgba(74,196,106,.25); }
      .doctrine-node.locked { opacity: .42; cursor: not-allowed; }
      .doctrine-bonus-list { display: flex; gap: 6px; flex-wrap: wrap; }
    `;
    document.head.appendChild(style);

    // ウィンドウテンプレート
    const defs = [
      { tab: 'doctrine', title: '📜 陸海空ドクトリン', w: 820, h: 620 },
      { tab: 'designer', title: '🛠️ 兵器設計 / Equipment Designer', w: 1180, h: 760 },
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

    // ナビレールにボタン���加
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

  // 陸海空XPの基本増加量（1日あたり / 各軍種）
  static XP_PER_DAY = 0.2;

  // XP は 0.2 刻みで貯まるため、小数第1位まで表示する
  static fmtXp(value) {
    const n = Math.round((Number(value) || 0) * 10) / 10;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  // Tickは1時間単位なので、1日ぶんを24分割して加算する（端数はそのまま保持）
  static accrueExperienceXP(gs) {
    if (!gs || !gs.xp) return 0;
    // 同じ時刻で二重に加算しない（手動Tick・マルチプレイ同期の重複対策）
    const stamp = gs.date instanceof Date ? gs.date.getTime() : null;
    if (stamp !== null && DLC._lastXpStamp === stamp) return 0;
    DLC._lastXpStamp = stamp;
    const perHour = DLC.XP_PER_DAY / 24;
    ['army', 'navy', 'air'].forEach(k => {
      gs.xp[k] = Math.min(9999, (Number(gs.xp[k]) || 0) + perHour);
      // トップバー表示用の旧フィールドにも同期（国家方針報酬は両方を更新している）
      gs[k + 'Experience'] = gs.xp[k];
    });
    return perHour;
  }

  static onTick() {
    const gs = CoreEngine.gameState;
    // 陸海空XP: 各軍種 1日 +0.2 XP
    DLC.accrueExperienceXP(gs);
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
      xp: gs.xp, equipment: gs.equipment, doctrine: gs.doctrine, doctrineRoutes: gs.doctrineRoutes,
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
    if (data.doctrineRoutes) gs.doctrineRoutes = data.doctrineRoutes;
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
  static service = 'land';          // land | naval | air
  static NODE_W = 190;
  static NODE_H = 96;
  static COL_GAP = 42;
  static ROW_GAP = 30;

  // ---- データソース: assets/doctrine-data.js (42ノード) ----
  // 未読み込み時は旧 DLC_DOCTRINES を同じ構造へ変換してフォールバックする。
  static _data = null;

  static data() {
    if (DoctrineManager._data) return DoctrineManager._data;
    if (typeof window !== 'undefined' && window.DOCTRINE_DATA?.branches) {
      DoctrineManager._data = window.DOCTRINE_DATA;
      return DoctrineManager._data;
    }
    const branches = {};
    Object.entries(DLC_DOCTRINES || {}).forEach(([key, svc]) => {
      const routes = svc.branches.map(branch => ({ id: branch.id, name: branch.name, desc: '', icon: '', color: '#5e9ec7' }));
      const nodes = svc.branches.flatMap(branch => branch.nodes.map(node => ({
        id: node.id, name: node.name, desc: '', route: branch.id,
        tier: Math.round((node.y || 0) / 100), icon: '', cost: node.cost,
        requires: node.req || [], effects: node.eff || {}
      })));
      branches[key] = { label: svc.label, xpKey: svc.xpKey, routes, nodes };
    });
    DoctrineManager._data = { branches, effectLabels: {} };
    return DoctrineManager._data;
  }

  static branch(service = DoctrineManager.service) {
    return DoctrineManager.data().branches[service] || DoctrineManager.data().branches.land;
  }

  static nodes(service = DoctrineManager.service) {
    return DoctrineManager.branch(service).nodes || [];
  }

  static node(id) {
    for (const service of Object.keys(DoctrineManager.data().branches)) {
      const found = DoctrineManager.nodes(service).find(node => node.id === id);
      if (found) return found;
    }
    return null;
  }

  static xpKey(service = DoctrineManager.service) {
    return DoctrineManager.branch(service).xpKey;
  }

  static ensure() {
    const gs = CoreEngine.gameState;
    if (!Array.isArray(gs.doctrine)) gs.doctrine = [];
    if (!gs.doctrineRoutes || typeof gs.doctrineRoutes !== 'object') gs.doctrineRoutes = {};
    return gs;
  }

  static owned(id) { return DoctrineManager.ensure().doctrine.includes(id); }

  // ---- ルート排他: 一度ルートを選ぶと他ルートは永久ロック (HOI4 仕様) ----
  static chosenRoute(service = DoctrineManager.service) {
    return DoctrineManager.ensure().doctrineRoutes[service] || null;
  }

  static routeLocked(routeId, service = DoctrineManager.service) {
    const chosen = DoctrineManager.chosenRoute(service);
    return !!chosen && chosen !== routeId;
  }

  static isRouteComplete(routeId, service = DoctrineManager.service) {
    return DoctrineManager.nodes(service).filter(node => node.route === routeId)
      .every(node => DoctrineManager.owned(node.id));
  }

  // ---- 前提判定 ----
  static requiresMet(node) {
    const requires = node.requires || [];
    if (!requires.length) return true;
    const owned = requires.filter(id => DoctrineManager.owned(id));
    return node.anyRequires ? owned.length > 0 : owned.length === requires.length;
  }

  // 同一グループ (同時取得不可の分岐) に取得済みノードがあるか
  static groupTaken(node) {
    if (!node.group) return false;
    return DoctrineManager.nodes(DoctrineManager.service)
      .some(other => other.id !== node.id && other.group === node.group && DoctrineManager.owned(other.id));
  }

  static canUnlock(node) {
    if (!node || DoctrineManager.owned(node.id)) return false;
    if (DoctrineManager.routeLocked(node.route)) return false;
    if (!DoctrineManager.requiresMet(node)) return false;
    if (DoctrineManager.groupTaken(node)) return false;
    return Number(CoreEngine.gameState.xp[DoctrineManager.xpKey()] || 0) >= Number(node.cost || 0);
  }

  static statusOf(node) {
    if (DoctrineManager.owned(node.id)) return 'unlocked';
    if (DoctrineManager.routeLocked(node.route)) return 'locked';
    if (DoctrineManager.groupTaken(node)) return 'locked';
    if (!DoctrineManager.requiresMet(node)) return 'locked';
    return 'selectable';
  }

  // ---- XP を消費して解禁 ----
  static unlock(nodeOrId) {
    DoctrineManager.ensure();
    const gs = CoreEngine.gameState;
    const node = typeof nodeOrId === 'string' ? DoctrineManager.node(nodeOrId) : nodeOrId;
    if (!node) return false;
    const service = Object.keys(DoctrineManager.data().branches)
      .find(key => DoctrineManager.nodes(key).some(item => item.id === node.id)) || DoctrineManager.service;
    if (DoctrineManager.owned(node.id)) return false;
    if (DoctrineManager.routeLocked(node.route, service)) {
      GameUI.notify('この系統は選択済みのルートと排他的です。', 'alert');
      return false;
    }
    if (!DoctrineManager.requiresMet(node)) { GameUI.notify('前提ドクトリンが未習得です。', 'alert'); return false; }
    if (DoctrineManager.groupTaken(node)) { GameUI.notify('同じ分岐の別ドクトリンを取得済みです。', 'alert'); return false; }
    const key = DoctrineManager.xpKey(service);
    const cost = Number(node.cost || 0);
    if (Number(gs.xp[key] || 0) < cost) {
      GameUI.notify('XPが不足しています (' + cost + ' XP必要)。', 'alert');
      return false;
    }
    gs.xp[key] = Number(gs.xp[key] || 0) - cost;
    gs.doctrine.push(node.id);
    // 最初のノード取得でルートを確定 (以後、他ルートは永久ロック)
    if (!gs.doctrineRoutes[service]) gs.doctrineRoutes[service] = node.route;
    CoreEngine.log('📜 ドクトリン習得: ' + node.name + ' (-' + cost + ' XP)');
    GameUI.notify('ドクトリン習得: ' + node.name, 'success');
    MultiplayerManager.broadcast({ type: 'doctrine', id: node.id, service, route: gs.doctrineRoutes[service] });
    DoctrineManager.render();
    return true;
  }

  // ルートを先に確定させる (HOI4 の doctrine tree 選択と同じ不可逆操作)
  static chooseRoute(routeId, service = DoctrineManager.service) {
    const gs = DoctrineManager.ensure();
    const chosen = gs.doctrineRoutes[service];
    if (chosen && chosen !== routeId) { GameUI.notify('ルートは変更できません。', 'alert'); return false; }
    if (chosen === routeId) return true;
    gs.doctrineRoutes[service] = routeId;
    const route = DoctrineManager.branch(service).routes.find(item => item.id === routeId);
    CoreEngine.log('📜 ドクトリン系統を選択: ' + (route ? route.name : routeId) + ' (他系統はロックされます)');
    GameUI.notify('ドクトリン系統を選択: ' + (route ? route.name : routeId), 'success');
    MultiplayerManager.broadcast({ type: 'doctrine_route', service, route: routeId });
    DoctrineManager.render();
    return true;
  }

  // ---- 効果集計 ----
  static bonuses(service = DoctrineManager.service) {
    const totals = {};
    DoctrineManager.ensure().doctrine.forEach(id => {
      const node = DoctrineManager.node(id);
      if (!node) return;
      const nodeService = Object.keys(DoctrineManager.data().branches)
        .find(key => DoctrineManager.nodes(key).some(item => item.id === id));
      if (service && nodeService !== service) return;
      Object.entries(node.effects || {}).forEach(([key, value]) => {
        totals[key] = (totals[key] || 0) + Number(value || 0);
      });
    });
    return totals;
  }

  // 戦闘計算から参照される補正値 (乗算用)
  static modifier(service, key) {
    return Number(DoctrineManager.bonuses(service)[key] || 0);
  }

  // 互換 API (game/js/combat.js などが参照する名前)
  static effects(service = 'land') { return DoctrineManager.bonuses(service); }

  static effectText(node) {
    const labels = DoctrineManager.data().effectLabels || {};
    const parts = Object.entries(node.effects || {}).map(([key, value]) => {
      const label = labels[key] || key;
      const abs = Math.abs(Number(value));
      const shown = abs < 1 ? (value > 0 ? '+' : '') + Math.round(value * 100) + '%' : (value > 0 ? '+' : '') + value;
      return label + ' ' + shown;
    });
    return parts.join(' / ') || '効果なし';
  }

  // ---- 描画 ----
  static render() {
    const el = document.getElementById('doctrine-content');
    if (!el) return;
    DoctrineManager.ensure();
    const gs = CoreEngine.gameState;
    const service = DoctrineManager.service;
    const branch = DoctrineManager.branch(service);
    const nodes = DoctrineManager.nodes(service);
    const routes = branch.routes || [];
    const chosen = DoctrineManager.chosenRoute(service);

    let html = '<div class="dlc-section"><div class="doctrine-tabs">';
    Object.entries(DoctrineManager.data().branches).forEach(([key, value]) => {
      html += '<button class="research-tab' + (key === service ? ' active' : '') + '" onclick="DoctrineManager.setService(\'' + key + '\')">' +
        value.label + ' <span style="color:var(--text-gold)">' + DLC.fmtXp(gs.xp[value.xpKey]) + ' XP</span></button>';
    });
    html += '</div>';
    html += '<p class="doctrine-hint">ルート（系統）は相互排他です。最初のノードを取得した系統に<b>永久に固定</b>され、他の系統はロックされます。ノードは XP で解禁します。</p>';

    // ルート選択カード
    html += '<div class="doctrine-routes">';
    routes.forEach(route => {
      const isChosen = chosen === route.id;
      const locked = !!chosen && !isChosen;
      const complete = DoctrineManager.isRouteComplete(route.id, service);
      html += '<div class="doctrine-route-card' + (isChosen ? ' chosen' : '') + (locked ? ' locked' : '') + '" style="--route-color:' + (route.color || '#5e9ec7') + '">' +
        (route.icon ? '<img src="' + route.icon + '" alt="">' : '') +
        '<div class="dr-name">' + GameTools.escape(route.name) + (complete ? ' ✅' : '') + '</div>' +
        '<div class="dr-desc">' + GameTools.escape(route.desc || '') + '</div>' +
        (isChosen
          ? '<span class="dr-state">選択中</span>'
          : locked
            ? '<span class="dr-state">ロック</span>'
            : '<button class="dlc-btn" onclick="DoctrineManager.chooseRoute(\'' + route.id + '\')">この系統を選択</button>') +
        '</div>';
    });
    html += '</div></div>';

    // ツリー本体 (ルート = 列 / tier = 行)
    const colW = DoctrineManager.NODE_W + DoctrineManager.COL_GAP;
    const rowH = DoctrineManager.NODE_H + DoctrineManager.ROW_GAP;
    const maxTier = Math.max(0, ...nodes.map(node => Number(node.tier) || 0));
    const width = routes.length * colW + DoctrineManager.COL_GAP;
    const height = (maxTier + 1) * rowH + DoctrineManager.ROW_GAP;
    const routeIndex = {};
    routes.forEach((route, index) => { routeIndex[route.id] = index; });

    const posOf = node => ({
      x: DoctrineManager.COL_GAP + (routeIndex[node.route] ?? 0) * colW,
      y: DoctrineManager.ROW_GAP + (Number(node.tier) || 0) * rowH
    });

    // 接続線: 必ず「親の下端 → 子の上端」を水平/垂直のみで結ぶ (曲線は使わない)
    let lines = '';
    nodes.forEach(node => {
      const to = posOf(node);
      (node.requires || []).forEach(requiredId => {
        const parent = nodes.find(item => item.id === requiredId);
        if (!parent) return;
        const from = posOf(parent);
        const x1 = from.x + DoctrineManager.NODE_W / 2;
        const y1 = from.y + DoctrineManager.NODE_H;
        const x2 = to.x + DoctrineManager.NODE_W / 2;
        const y2 = to.y;
        let d;
        if (Math.abs(x1 - x2) < 0.5) {
          d = 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
        } else {
          const midY = (y1 + y2) / 2;
          d = 'M' + x1 + ',' + y1 + ' L' + x1 + ',' + midY + ' L' + x2 + ',' + midY + ' L' + x2 + ',' + y2;
        }
        const active = DoctrineManager.owned(requiredId);
        lines += '<path d="' + d + '" stroke="' + (active ? '#4ac46a' : '#3a4a5a') + '" stroke-width="2" fill="none" opacity="' + (active ? '0.9' : '0.55') + '"/>';
      });
    });

    html += '<div class="dlc-section"><div class="doctrine-canvas"><div class="doctrine-viewport" style="width:' + width + 'px;height:' + height + 'px;">';
    html += '<svg class="doctrine-lines" width="' + width + '" height="' + height + '">' + lines + '</svg>';
    nodes.forEach(node => {
      const pos = posOf(node);
      const status = DoctrineManager.statusOf(node);
      const item = node;
      const title = (item.desc ? item.desc + '\n' : '') + DoctrineManager.effectText(item) +
        (status === 'locked' && DoctrineManager.routeLocked(item.route) ? '\n※ 他の系統を選択済みのため取得不可' : '');
      html += '<div class="doctrine-node ' + status + '" style="left:' + pos.x + 'px;top:' + pos.y + 'px;width:' + DoctrineManager.NODE_W + 'px;height:' + DoctrineManager.NODE_H + 'px;"' +
        ' title="' + GameTools.escape(title) + '" onclick="DoctrineManager.unlock(\'' + item.id + '\')">' +
        (item.icon ? '<img class="dn-icon" src="' + item.icon + '" alt="">' : '<span class="dn-icon placeholder">📜</span>') +
        '<div class="dn-body"><div class="dn-title">' + GameTools.escape(item.name || item.id) + '</div>' +
        '<div class="dn-effect">' + GameTools.escape(DoctrineManager.effectText(item)) + '</div>' +
        '<div class="dn-cost">' + (status === 'unlocked' ? '✅ 習得済' : item.cost + ' XP') + '</div></div>' +
        '</div>';
    });
    html += '</div></div></div>';

    // 取得済みボーナス一覧
    const bonuses = DoctrineManager.bonuses(service);
    const labels = DoctrineManager.data().effectLabels || {};
    const entries = Object.entries(bonuses).filter(([, value]) => Number(value) !== 0);
    html += '<div class="dlc-section"><h3>' + branch.label + 'ドクトリン補正 (グローバル)</h3>';
    html += entries.length
      ? '<div class="doctrine-bonus-list">' + entries.map(([key, value]) => {
        const abs = Math.abs(Number(value));
        const shown = abs < 1 ? (value > 0 ? '+' : '') + Math.round(value * 100) + '%' : (value > 0 ? '+' : '') + value;
        return '<span class="dlc-badge' + (value < 0 ? ' negative' : '') + '">' + GameTools.escape(labels[key] || key) + ' ' + shown + '</span>';
      }).join('') + '</div>'
      : '<span style="color:var(--text-secondary);font-size:11px;">まだ習得していません。XPを消費してドクトリンを解禁してください。</span>';
    html += '</div>';

    el.innerHTML = html;
  }

  static setService(k) { DoctrineManager.service = k; DoctrineManager.render(); }
}
if (typeof window !== 'undefined') window.DoctrineManager = DoctrineManager;

// ==========================================================
// 2. EquipmentDesigner — 兵器モジュール設計 (戦車/艦船/航空機)
// ==========================================================
class EquipmentDesigner {
  static designs = [];
  static category = 'tank';
  static draft = { tank: { hull: null, modules: {} }, ship: { hull: null, modules: {} }, plane: { hull: null, modules: {} } };

  // ---- 設計データ: 車体/船体/機体 + モジュール ----
  // requires は実際の技術 ID (ger/tec/data 等に存在するもの) を指定する。
  // 未研究のモジュールはドロップダウンで選択できず、🔒 と必要技術が表示される。
  static DATA = {
    tank: { label: '戦車', xpKey: 'army', hulls: [
      { id: 'lt', name: '軽戦車車体', cost: 10, capacity: 3, weight: 8, baseSpeed: 42, requires: ['basic_light_tank_chassis'] },
      { id: 'mt', name: '中戦車車体', cost: 20, capacity: 5, weight: 18, baseSpeed: 32, requires: ['basic_medium_tank_chassis'] },
      { id: 'ht', name: '重戦車車体', cost: 30, capacity: 7, weight: 32, baseSpeed: 24, requires: ['basic_heavy_tank_chassis'] },
      { id: 'ilt', name: '改良軽戦車車体', cost: 16, capacity: 4, weight: 10, baseSpeed: 48, requires: ['improved_light_tank_chassis'] },
      { id: 'imt', name: '改良中戦車車体', cost: 26, capacity: 6, weight: 20, baseSpeed: 38, requires: ['improved_medium_tank_chassis'] },
      { id: 'iht', name: '改良重戦車車体', cost: 38, capacity: 8, weight: 34, baseSpeed: 27, requires: ['improved_heavy_tank_chassis'] },
      { id: 'amt', name: '先進中戦車車体', cost: 34, capacity: 7, weight: 22, baseSpeed: 42, requires: ['advanced_medium_tank_chassis'] },
      { id: 'mbt', name: '主力戦車車体', cost: 46, capacity: 9, weight: 30, baseSpeed: 40, requires: ['main_battle_tank_chassis'] },
      { id: 'sht', name: '超重戦車車体', cost: 55, capacity: 12, weight: 60, baseSpeed: 18, requires: ['super_heavy_tank_chassis'] }
    ], slots: [
      { id: 'gun', name: '主砲', options: [
        { id: 'how', name: '榴弾砲', cost: 8, weight: 3, power: 4, soft: 12, hard: 6, piercing: 20, requires: ['artillery1'] },
        { id: 'at', name: '対戦車砲', cost: 10, weight: 4, power: 3, soft: 7, hard: 18, piercing: 45, requires: ['artillery2'] },
        { id: 'long', name: '長砲身砲', cost: 14, weight: 5, power: 4, soft: 10, hard: 22, piercing: 60, requires: ['artillery3'] },
        { id: 'heavy', name: '重榴弾砲', cost: 18, weight: 7, power: 5, soft: 20, hard: 12, piercing: 55, requires: ['artillery5'] }
      ] },
      { id: 'turret', name: '砲塔', options: [
        { id: 'std', name: '標準砲塔', cost: 5, weight: 4, power: 2, soft: 2, armor: 2 },
        { id: 'large', name: '大型砲塔', cost: 10, weight: 7, power: 3, soft: 4, hard: 2, reliability: -2 },
        { id: 'oscillating', name: '揺動砲塔', cost: 12, weight: 6, power: 4, hard: 4, reliability: 2, requires: ['armor_tech_2'] }
      ] },
      { id: 'armor', name: '装甲', options: [
        { id: 'steel', name: '均質鋼板', cost: 8, weight: 5, armor: 12, requires: ['armor_tech_1'] },
        { id: 'slope', name: '傾斜装甲', cost: 12, weight: 4, armor: 18, reliability: -2, requires: ['armor_tech_2'] },
        { id: 'welded', name: '溶接装甲', cost: 16, weight: 3, armor: 24, requires: ['armor_tech_3'] },
        { id: 'composite', name: '複合装甲', cost: 22, weight: 3, armor: 32, reliability: 3, requires: ['armor_tech_4'] }
      ] },
      { id: 'engine', name: 'エンジン', options: [
        { id: 'gas', name: 'ガソリン 400馬力', cost: 8, weight: 2, power: 12, engineCapacity: 3, speed: 4, requires: ['engine_tech_1'] },
        { id: 'diesel', name: 'ディーゼル 550馬力', cost: 12, weight: 3, power: 18, engineCapacity: 5, speed: 6, reliability: 2, requires: ['engine_tech_2'] },
        { id: 'high', name: '高出力 700馬力', cost: 18, weight: 3, power: 26, engineCapacity: 7, speed: 9, reliability: -2, requires: ['engine_tech_3'] },
        { id: 'turbine', name: 'ガスタービン', cost: 26, weight: 4, power: 36, engineCapacity: 9, speed: 14, reliability: -4, requires: ['engine_tech_4'] }
      ] },
      { id: 'radio', name: '無線', options: [
        { id: 'none', name: '装備なし', cost: 0, weight: 0 },
        { id: 'radio1', name: '無線機', cost: 5, weight: 1, soft: 2, reliability: 3, requires: ['radio'] },
        { id: 'radio2', name: '改良無線機', cost: 8, weight: 1, soft: 3, hard: 2, reliability: 4, requires: ['improved_radio'] }
      ] },
      { id: 'suspension', name: '足回り', options: [
        { id: 'bogie', name: 'ボギー式', cost: 4, weight: 3, speed: 2, reliability: 1 },
        { id: 'torsion', name: 'トーションバー', cost: 8, weight: 2, speed: 4, reliability: -1, requires: ['engine_tech_2'] }
      ] }
    ] },
    ship: { label: '艦船', xpKey: 'navy', hulls: [
      { id: 'dd', name: '駆逐艦船体', cost: 10, capacity: 4, weight: 12, baseSpeed: 34, requires: ['early_ship_hull_light'] },
      { id: 'cl', name: '巡洋艦船体', cost: 20, capacity: 6, weight: 24, baseSpeed: 28, requires: ['early_ship_hull_cruiser'] },
      { id: 'bb', name: '戦艦船体', cost: 35, capacity: 9, weight: 48, baseSpeed: 22, requires: ['early_ship_hull_heavy'] },
      { id: 'cv', name: '空母船体', cost: 40, capacity: 8, weight: 42, baseSpeed: 25, requires: ['early_ship_hull_carrier'] },
      { id: 'ss', name: '潜水艦船体', cost: 16, capacity: 3, weight: 10, baseSpeed: 18, requires: ['early_ship_hull_submarine'] },
      { id: 'dd2', name: '改良駆逐艦船体', cost: 16, capacity: 5, weight: 13, baseSpeed: 38, requires: ['improved_ship_hull_light'] },
      { id: 'cl2', name: '改良巡洋艦船体', cost: 26, capacity: 7, weight: 26, baseSpeed: 32, requires: ['improved_ship_hull_cruiser'] },
      { id: 'bb2', name: '改良戦艦船体', cost: 44, capacity: 10, weight: 52, baseSpeed: 26, requires: ['improved_ship_hull_heavy'] },
      { id: 'cv2', name: '改良空母船体', cost: 48, capacity: 9, weight: 45, baseSpeed: 29, requires: ['improved_ship_hull_carrier'] },
      { id: 'ss2', name: '改良潜水艦船体', cost: 22, capacity: 4, weight: 11, baseSpeed: 21, requires: ['improved_ship_hull_submarine'] }
    ], slots: [
      { id: 'gun', name: '主砲', options: [
        { id: 'lgun', name: '大口径主砲', cost: 18, weight: 5, power: 4, attack: 22, requires: ['artillery3'] },
        { id: 'ddgun', name: '中口径主砲', cost: 10, weight: 3, power: 2, attack: 12, requires: ['artillery1'] },
        { id: 'aa', name: '対空機銃', cost: 8, weight: 2, attack: 8, defense: 6, requires: ['artillery1'] }
      ] },
      { id: 'torp', name: '魚雷', options: [
        { id: 'none', name: '装備なし', cost: 0, weight: 0 },
        { id: 'tub', name: '53cm 三連装魚雷発射管', cost: 12, weight: 3, attack: 16, requires: ['early_ship_hull_submarine'] },
        { id: 'tub2', name: '53cm 四連装魚雷発射管', cost: 20, weight: 4, attack: 24, requires: ['improved_fire_control_system'] },
        { id: 'tub3', name: '61cm 酸素魚雷発射管', cost: 32, weight: 5, attack: 34, requires: ['advanced_fire_control_system'] }
      ] },
      { id: 'armor', name: '装甲', options: [
        { id: 'light', name: '軽装甲', cost: 8, weight: 6, armor: 8, requires: ['armor_tech_1'] },
        { id: 'heavy', name: '重装甲', cost: 18, weight: 14, armor: 20, speed: -4, requires: ['armor_tech_3'] }
      ] },
      { id: 'radar', name: '電装', options: [
        { id: 'none', name: '装備なし', cost: 0, weight: 0 },
        { id: 'radar', name: 'レーダー', cost: 10, weight: 1, attack: 4, defense: 6, reliability: 3, requires: ['radio'] },
        { id: 'radar2', name: '改良レーダー', cost: 16, weight: 1, attack: 6, defense: 10, reliability: 5, requires: ['improved_radio'] }
      ] },
      { id: 'engine', name: '機関', options: [
        { id: 'steam', name: '蒸気タービン', cost: 12, weight: 4, power: 16, engineCapacity: 5, speed: 2, requires: ['engines_1'] },
        { id: 'diesel', name: '艦用ディーゼル', cost: 16, weight: 3, power: 22, engineCapacity: 7, speed: 4, requires: ['engines_3'] }
      ] }
    ] },
    plane: { label: '航空機', xpKey: 'air', hulls: [
      { id: 'fighter', name: '戦闘機機体', cost: 10, capacity: 3, weight: 4, baseSpeed: 520, requires: ['iw_small_airframe'] },
      { id: 'fighter2', name: '改良戦闘機機体', cost: 16, capacity: 3, weight: 4, baseSpeed: 570, requires: ['basic_small_airframe'] },
      { id: 'fighter3', name: '先進戦闘機機体', cost: 24, capacity: 4, weight: 4, baseSpeed: 640, requires: ['improved_small_airframe'] },
      { id: 'cas', name: '近接航空支援機機体', cost: 18, capacity: 4, weight: 6, baseSpeed: 460, requires: ['iw_medium_airframe'] },
      { id: 'bomber', name: '戦術爆撃機機体', cost: 22, capacity: 5, weight: 9, baseSpeed: 410, requires: ['basic_medium_airframe'] },
      { id: 'strategic', name: '戦略爆撃機機体', cost: 34, capacity: 6, weight: 16, baseSpeed: 380, requires: ['basic_large_airframe'] },
      { id: 'naval', name: '艦上攻撃機機体', cost: 20, capacity: 4, weight: 7, baseSpeed: 450, requires: ['improved_medium_airframe'] }
    ], slots: [
      { id: 'engine', name: 'エンジン', options: [
        { id: 'e1', name: '標準エンジン', cost: 8, weight: 2, power: 14, engineCapacity: 3, speed: 4, requires: ['engine_tech_1'] },
        { id: 'e2', name: '高出力エンジン', cost: 14, weight: 3, power: 24, engineCapacity: 6, speed: 8, reliability: -2, requires: ['engine_tech_2'] },
        { id: 'e3', name: 'ターボ過給エンジン', cost: 20, weight: 3, power: 32, engineCapacity: 8, speed: 12, reliability: -3, requires: ['engine_tech_3'] }
      ] },
      { id: 'weapon', name: '武装', options: [
        { id: 'mg', name: '機銃強化', cost: 8, weight: 1, soft: 8, attack: 10, requires: ['improved_infantry_weapons'] },
        { id: 'cannon', name: '機関砲', cost: 14, weight: 2, soft: 6, hard: 12, attack: 16, requires: ['artillery2'] },
        { id: 'bomb', name: '通常爆弾', cost: 12, weight: 3, soft: 16, hard: 6, requires: ['early_bombs'] },
        { id: 'heavy_bomb', name: '大型爆弾', cost: 20, weight: 5, soft: 24, hard: 10, requires: ['heavy_bombs'] },
        { id: 'torpedo', name: '航空魚雷', cost: 18, weight: 3, attack: 24, requires: ['air_torpedoe_1'] }
      ] },
      { id: 'fuel', name: '燃料タンク / 防弾', options: [
        { id: 'none', name: '標準燃料', cost: 0, weight: 0 },
        { id: 'plate', name: '防弾鋼板', cost: 8, weight: 2, defense: 12, reliability: -2, requires: ['aircraft_construction'] },
        { id: 'drop_tank', name: '増槽（航続距離 +90% / 機動性 -10%）', cost: 10, weight: 2, defense: 2 }
      ] }
    ] }
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

  static performance(cat) {
  const d = EquipmentDesigner.DATA[cat];
  const draft = EquipmentDesigner.draft[cat];
  const hull = d.hulls.find(h => h.id === draft.hull);
  const modules = d.slots.flatMap(slot => {
    const option = slot.options.find(item => item.id === draft.modules[slot.id]);
    return option ? [option] : [];
  });
  const weight = (hull?.weight || 0) + modules.reduce((sum, item) => sum + (item.weight || 0), 0);
  const engine = modules.find(item => item.engineCapacity);
  const capacity = engine?.engineCapacity || hull?.capacity || 0;
  const usedCapacity = modules.length;
  const overload = Math.max(0, usedCapacity - capacity);
  const power = (engine?.power || 0) + modules.reduce((sum, item) => sum + (item.power || 0), 0);
  const baseSpeed = hull?.baseSpeed || 0;
  const speed = Math.max(1, Math.round(baseSpeed * (1 - overload * 0.08) + power * 1.5 - weight * 0.45));
  const attack = modules.reduce((sum, item) => sum + (item.attack || 0), 0);
  const defense = modules.reduce((sum, item) => sum + (item.defense || 0), 0);
  const roles = modules.map(item => item.role).filter(Boolean);
  const overall = Math.max(0, Math.round((speed / (cat === 'plane' ? 10 : 1)) * 0.25 + attack * 1.6 + defense * 1.3 + power * 0.4 - overload * 8));
  return { weight, capacity, usedCapacity, overload, power, speed, attack, defense, roles, overall };
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
    const performance = EquipmentDesigner.performance(cat);
    const design = { id: 'd' + Date.now(), cat: cat, name: hull.name + ' ' + (d.slots.map(s => { const o = s.options.find(o => o.id === draft.modules[s.id]); return o ? o.name : ''; }).filter(Boolean).join('/')), modules: { ...draft.modules }, stats: mods, performance, cost: cost };
    EquipmentDesigner.designs.push(design);
    // 設計の採用だけでは戦力・在庫に反映せず、生産後の装備として配備する。
    CoreEngine.log('🛠️ ' + d.label + '設計完了: ' + design.name + ' (-' + cost + ' XP)');
    GameUI.notify('設計完了: ' + design.name, 'success');
    MultiplayerManager.broadcast({ type: 'design', design: design });
    EquipmentDesigner.render();
  }

  static equipDesign(id) {
    const dsg = EquipmentDesigner.designs.find(x => x.id === id);
    if (!dsg) return;
    WindowManager.open('production');
    ProductionManager.render();
    GameUI.notify('装備生産画面で工場を割り当ててください。');
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
      html += '<button class="research-tab' + (k === cat ? ' active' : '') + '" onclick="EquipmentDesigner.setCategory(\'' + k + '\')">' + v.label + ' <span style="color:var(--text-gold)">' + DLC.fmtXp(gs.xp[v.xpKey]) + 'XP</span></button>';
    });
    html += '</div></div>';

    // 設計エディタ
    html += '<div class="dlc-section"><h3>設計エディタ (XPを消費してモジュールを組み替え)</h3>';
    const perf = EquipmentDesigner.performance(cat);
    const bar = (label, value, max) => '<div class="designer-meter"><span>' + label + '</span><b>' + value + '</b><i><em style="width:' + Math.min(100, Math.max(0, value / max * 100)) + '%"></em></i></div>';
    html += '<div class="designer-performance"><div class="designer-performance-head"><strong>総合性能 ' + perf.overall + '</strong><span>' + (perf.overload ? '積載超過 ' + perf.overload + '枠' : '設計許容内') + '</span></div>' +
      bar('攻撃力', perf.attack, 80) + bar('防御 / 生存性', perf.defense, 80) + bar('速度', perf.speed, cat === 'plane' ? 700 : 60) +
      '<div class="designer-facts"><span>重量 <b>' + perf.weight + ' t</b></span><span>出力 <b>' + perf.power + '</b></span><span>モジュール <b>' + perf.usedCapacity + ' / ' + perf.capacity + '</b></span></div>' +
      '<div class="designer-roles">任務: ' + (perf.roles.length ? perf.roles.join(' / ') : '未選択') + '</div></div>';
    html += '<div class="dlc-card blueprint-card"><h4>設計図 / リアルタイム・ブループリント</h4>' +
      '<canvas id="bp-canvas" width="440" height="250"></canvas>' +
      '<div class="blueprint-caption">選択した車体・エンジン・武装・装甲を図面へ即時反映。破線は未選択のモジュールです。</div></div>';
    html += '<div class="dlc-card"><h4>ベース (車体/船体/機体)</h4>';
    d.hulls.forEach(h => {
      html += '<div class="dlc-row"><input type="radio" ' + (draft.hull === h.id ? 'checked' : '') + ' onchange="EquipmentDesigner.pickHull(\'' + h.id + '\')">' + h.name + ' <span style="color:var(--text-gold)">' + h.cost + 'XP</span></div>';
    });
    html += '</div>';
    d.slots.forEach(s => {
      html += '<div class="dlc-card"><h4>' + s.name + '</h4>';
      s.options.forEach(o => {
        html += '<div class="dlc-row module-option"><input type="radio" ' + (draft.modules[s.id] === o.id ? 'checked' : '') + ' onchange="EquipmentDesigner.pickModule(\'' + s.id + '\',\'' + o.id + '\')"><span>' + o.name + '</span><small>' + (o.weight ? o.weight + 't' : '') + (o.attack ? ' 攻' + o.attack : '') + (o.defense ? ' 防' + o.defense : '') + '</small><span style="color:var(--text-gold)">' + o.cost + 'XP</span></div>';
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
          '<button class="dlc-btn" style="margin-top:6px;" onclick="EquipmentDesigner.equipDesign(\'' + dsg.id + '\')">🏭 生産ラインを割り当て</button></div>';
      });
    }
    html += '</div>';
    el.innerHTML = html;
    // ブループリントを現在の下書きで描画
    BlueprintRenderer.draw(cat, draft, document.getElementById('bp-canvas'));
  }

  static setCategory(k) { EquipmentDesigner.category = k; EquipmentDesigner.render(); }
}

if (typeof window !== 'undefined') window.EquipmentDesigner = EquipmentDesigner;

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
    // ---- 生成した実物風ブループリントを下地にして方眼を重ねる ----
    const blueprintImage = BlueprintRenderer.image || (BlueprintRenderer.image = (() => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = '/game/assets/blueprints/aircraft-blueprint.png';
      image.onload = () => { const current = document.getElementById('bp-canvas'); if (current) BlueprintRenderer.draw(cat, draft, current); };
      return image;
    })());
    ctx.fillStyle = '#14406e';
    ctx.fillRect(0, 0, W, H);
    if (cat === 'plane' && blueprintImage.complete && blueprintImage.naturalWidth) {
      ctx.globalAlpha = 0.72;
      ctx.drawImage(blueprintImage, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
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
  static ensure() { IntelOperations.ensure(); }
  static createAgency() { return IntelOperations.createAgency(); }
  static upgrade() { return IntelOperations.upgrade(); }
  static hireSpy(operativeId) { return IntelOperations.hireSpy(operativeId); }
  static startOp(id) { return IntelOperations.startOp(id); }
  static cancelOp() { IntelOperations.cancelOp(); }
  static onTick() { IntelOperations.tick(); }
  static render() { IntelOperations.render(); }
  static selectTarget(tag) { IntelOperations.selectTarget(tag); }
  static assign(slot,kind,tag) { return IntelOperations.assign(slot,kind,tag); }
  static visibleDivisions() { return IntelOperations.visibleDivisions(); }
  static hasReveal() { return IntelOperations.hasReveal(); }
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
    WindowManager.open('mio');
    MIOManager.render();
  }

  static sell() { MarketManager.list(); }

  static render() {
    if(GameTools.editing('mio-content'))return;
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

    html += MarketManager.markup();
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
    let html = '<div class="dlc-section"><h3>将軍の選択 (陸軍XP: ' + DLC.fmtXp(gs.xp.army) + ')</h3>';
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

// デバッグ・テスト用（classic script のグローバルレキシカル束縛は window から辿れないため）
if (typeof window !== 'undefined') window.DLC = DLC;
