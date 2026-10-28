// 核攻撃 (終末兵器) と兵器設計のモジュール別ブループリントの回帰テスト
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

/* ------------------------------------------------------------------ */
/* 終末兵器 (SuperWeapons): 発動条件・確認ダイアログ・被害・3列画面      */
/* ------------------------------------------------------------------ */
function loadSuperWeapons() {
  const states = {
    '10': { name: 'Berlin', owner: 'GER', provinces: [101], vp: { 101: 20 }, b: { infrastructure: 5, industrial_complex: 8, arms_factory: 6, synthetic_refinery: 3, nuclear_reactor: 2 }, res: { steel: 100 } },
    '20': { name: 'Warsaw', owner: 'POL', provinces: [201], vp: { 201: 15 }, b: { infrastructure: 4, industrial_complex: 5, arms_factory: 3, synthetic_refinery: 1, nuclear_reactor: 1 }, res: { steel: 50 } }
  };
  const enemyDivisions = [
    { id: 'POL-0', pid: 201, sid: '20', org: 90, strength: 90, defeated: false },
    { id: 'POL-1', pid: 201, sid: '20', org: 90, strength: 90, defeated: false }
  ];
  const mapRenderer = {
    ready: true, mapW: 1000, mapH: 600, states,
    stateCenter: new Map([['10', [100, 100]], ['20', [300, 100]]]),
    provCentroid: new Map([[101, [100, 100]], [201, [300, 100]]]),
    provNeighbors: new Map([[101, new Set([201])], [201, new Set([101])]]),
    provToState: new Map([[101, '10'], [201, '20']]),
    stateOf(pid) { return this.provToState.get(Number(pid)) || null; },
    ownerOf(pid) { const sid = this.stateOf(pid); return sid ? states[sid].owner : null; },
    addNukeEffectAtState() {}, invalidateModes() {},
    worldToScreen(x, y) { return [x, y]; },
    canvas: { width: 1000, height: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }) },
    handlePrimaryClick() {}, screenToWorld(x, y) { return [x, y]; },
    provinceAt(x) { return x === 300 ? 201 : 101; }
  };
  const airForce = {
    wings: () => [{ id: 'air1', name: '第1爆撃航空隊', aircraftType: 'bomber', aircraftCount: 40, base: [100, 100], range: 900, baseStateId: '10' }],
    superiority: () => ({ percent: 82, contested: true, level: 'dominant' })
  };
  const gameState = {
    country: 'GER', atWar: ['POL'], nuclearStockpile: 2, strategicBombers: 12,
    manpower: 500000, politicalPower: 100, civilianFactories: 20, warSupport: 50, stability: 50,
    countryEffects: {}, xp: { army: 0, navy: 0, air: 0 },
    strategy: { sw: { projects: {}, rockets: 4, missions: [], log: [], strikes: 0 }, reserves: [], economies: {}, production: [] }
  };
  const content = { innerHTML: '' };
  const document = {
    getElementById(id) { return id === 'superweapons-content' ? content : null; },
    querySelector() { return null; },
    createElement() { return { style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, setAttribute() {} }; },
    addEventListener() {}, removeEventListener() {},
    body: { classList: { add() {}, remove() {} }, appendChild() {} }
  };
  const notifications = [];
  let modal = null;
  const sandbox = {
    console, Math, Date, JSON, setTimeout, document,
    CoreEngine: {
      gameState, log() {}, renderStats() {}, addWorldTension() {}, registerTickCallback() {}, setSpeed() {}
    },
    MapRenderer: mapRenderer,
    AirForce: airForce,
    IntelOperations: { forces: () => ({ divisions: enemyDivisions, navy: [] }) },
    BattleManager: { battles: [{ stateId: '20', provId: 201, defense: 100, breakthrough: 50, advantage: 0, progress: 0 }] },
    ArmyRoster: { all: () => [] },
    GameUI: {
      notify: (m, t) => notifications.push([t || 'info', m]),
      openModal: (title, html) => { modal = { title, html }; },
      closeModal: () => { modal = null; },
      switchTab() {}, currentTab: null, onWindowOpened() {}, onWindowClosed() {}
    },
    WindowManager: { isOpen: () => false, minimize() {} },
    GameTools: { escape: (s) => String(s), day: () => 100 },
    DiplomacyManager: { nameOf: (t) => t },
    PeaceSystem: { score: () => ({ vp: 0, kills: 0 }), checkCapitulations() {} },
    AIManager: { state: { strength: { POL: 100 } } },
    NewsManager: { fireCustom() {} },
    MultiplayerManager: { broadcast() {} },
    FactoryBudget: { availableCivilian: () => 10 },
    BattlePlanManager: { armies: [], renderPanel() {} },
    NuclearManager: { playNukeAnimation() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('game/assets/superweapons.js') + '\n;globalThis.SuperWeapons = SuperWeapons;', sandbox);
  const SW = sandbox.SuperWeapons;
  SW.data();
  ['uranium', 'atomic', 'v2'].forEach(id => { const d = SW.data().projects[id]; d.done = true; d.progress = SW.PROJECTS[id].points; });
  return { SW, gameState, states, enemyDivisions, airForce, content, notifications, modal: () => modal, sandbox };
}

test('nuclear strike requires war, an atomic bomb project, stockpile, 75% air superiority and a delivery means', () => {
  const ctx = loadSuperWeapons();
  const { SW, airForce } = ctx;
  assert.equal(SW.canNuke('20'), true);
  assert.equal(SW.nukeChecks('20').length, 5);

  airForce.superiority = () => ({ percent: 60, contested: true, level: 'advantage' });
  assert.equal(SW.canNuke('20'), false);
  assert.match(SW.nukeChecks('20').find(c => /制空権/.test(c.text)).text, /75%/);

  airForce.superiority = () => ({ percent: 82, contested: true, level: 'dominant' });
  ctx.gameState.nuclearStockpile = 0;
  assert.equal(SW.canNuke('20'), false);
  assert.match(SW.nukeChecks('20').find(c => /備蓄/.test(c.text)).text, /現在 0/);

  ctx.gameState.nuclearStockpile = 2;
  ctx.gameState.atWar = [];
  assert.equal(SW.canNuke('20'), false);
});

test('confirm dialog asks to drop one bomb on the state and lists the requirements', () => {
  const ctx = loadSuperWeapons();
  ctx.SW.confirmStrike('20');
  const modal = ctx.modal();
  assert.ok(modal, 'confirmation dialog is opened');
  assert.match(modal.title, /Warsaw/);
  assert.match(modal.html, /へ核兵器を投下しますか/);
  assert.match(modal.html, /使用数: 1/);
  assert.match(modal.html, /被害予測/);
});

test('a launched nuke destroys the state, routs enemy divisions and lowers war support by 15-30%', () => {
  const ctx = loadSuperWeapons();
  const { SW, states, enemyDivisions, gameState } = ctx;
  const before = gameState.nuclearStockpile;
  assert.equal(SW.launchNuke('20'), true);
  assert.equal(gameState.nuclearStockpile, before - 1);
  const b = states['20'].b;
  ['infrastructure', 'industrial_complex', 'arms_factory', 'synthetic_refinery', 'nuclear_reactor'].forEach(key => assert.equal(b[key], 0, key + ' is destroyed'));
  assert.ok(states['20'].ruined, 'the state is marked as ruined (map icon)');
  assert.equal(enemyDivisions.filter(d => d.defeated).length, 2, '90%+ of the divisions are destroyed');
  assert.ok(enemyDivisions.every(d => d.org <= 9 && d.strength <= 9), 'every division loses 90%+ org/strength');
  const d = SW.data();
  assert.equal(d.history.length, 1);
  const loss = d.history[0].warSupport;
  assert.ok(loss >= 15 && loss <= 30, 'war support loss is 15-30: ' + loss);
  assert.ok(d.damage.POL.warSupport >= 15 && d.damage.POL.warSupport <= 30);
  assert.ok(d.history[0].stability >= 15 && d.history[0].stability <= 30);
});

test('the endgame weapons window renders three columns with stockpile, launch button, history and damage', () => {
  const ctx = loadSuperWeapons();
  ctx.SW.render();
  const html = ctx.content.innerHTML;
  assert.match(html, /sw-col-left/);
  assert.match(html, /sw-col-center/);
  assert.match(html, /sw-col-right/);
  assert.match(html, /核攻撃モード \(Launch Nuke\)/);
  assert.match(html, /ターゲット履歴/);
  assert.match(html, /累積戦略ダメージ/);
  assert.match(html, /原子炉/);
});

/* ------------------------------------------------------------------ */
/* 兵器設計: モジュールごとに設計図 (ブループリント) が切り替わる          */
/* ------------------------------------------------------------------ */
function loadDesigner() {
  const host = { innerHTML: '', querySelector: () => null };
  const document = {
    getElementById: (id) => (id === 'designer-content' ? host : null),
    querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {}, addEventListener() {} }),
    head: { appendChild() {} },
    body: { appendChild() {} },
    addEventListener() {}, removeEventListener() {}
  };
  const sandbox = {
    console, document, Math, Date, JSON, setTimeout,
    GameUI: { notify() {} },
    CoreEngine: { gameState: { xp: { army: 100, navy: 100, air: 100 }, country: 'JAP', date: new Date(1941, 0, 1) }, log() {} },
    MultiplayerManager: { broadcast() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('game/dlc.js'), sandbox);
  vm.runInContext(read('game/assets/equipment-designer.js'), sandbox);
  const Designer = sandbox.EquipmentDesigner;
  const techs = new Set();
  ['tank', 'ship', 'plane'].forEach(cat => {
    const data = Designer.DATA[cat];
    data.hulls.forEach(h => (h.requires || []).forEach(t => techs.add(t)));
    data.slots.forEach(slot => slot.options.forEach(o => (o.requires || []).forEach(t => techs.add(t))));
  });
  sandbox.ResearchManager = { researchedTech: techs };
  Designer.category = 'tank';
  Designer.render();
  return { Designer, host };
}

test('equipment designer shows a separate blueprint for each module (engine, chassis, gun, ...)', () => {
  const { Designer, host } = loadDesigner();
  assert.match(host.innerHTML, /eqd-bp-tabs/);
  assert.ok(host.innerHTML.includes('data-eqd-bp="engine"'), 'engine blueprint tab exists');
  assert.ok(host.innerHTML.includes('data-eqd-bp="hull"'), 'chassis blueprint tab exists');

  Designer.setBlueprintFocus('tank', 'engine');
  assert.equal(Designer.blueprintFocus('tank'), 'engine');
  assert.match(host.innerHTML, /eqd-svg-module/);
  assert.match(host.innerHTML, /CYLINDER BLOCK/);

  Designer.setBlueprintFocus('tank', 'gun');
  assert.match(host.innerHTML, /砲身長/);

  Designer.setBlueprintFocus('tank', 'hull');
  assert.match(host.innerHTML, /車体設計図/);

  // モジュールを装着すると、そのモジュールの設計図へ自動的に切り替わる
  Designer.pickModule('engine', 'diesel');
  assert.equal(Designer.blueprintFocus('tank'), 'engine');
  assert.match(host.innerHTML, /ディーゼル/);
});

/* ------------------------------------------------------------------ */
/* 諜報員: 自国の人物のみ雇用できる                                     */
/* ------------------------------------------------------------------ */
test('espionage candidates are restricted to the player country', () => {
  const sandbox = {
    console, Math, JSON, document: undefined,
    AssetRegistry: { getLocalAssetUrl: (category, file) => file }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const code = [read('game/assets/game-asset-data.js'), read('game/assets/game-visuals.js')].join('\n') + '\n;globalThis.GameVisuals = GameVisuals;';
  vm.runInContext(code, sandbox);
  const GV = sandbox.GameVisuals;
  const own = GV.operativeChoices('JAP', [], true);
  assert.ok(own.length > 0);
  assert.ok(own.every(person => person.country === 'JAP'));
  assert.ok(GV.operativeChoices('JAP', [], false).length > own.length);
  assert.equal(GV.operativeChoices('JAP', own.map(p => p.id), true).length, 0);
});
