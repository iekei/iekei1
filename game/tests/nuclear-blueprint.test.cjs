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
    '10': { name: 'Berlin', owner: 'GER', provinces: [101], vp: { 101: 20 }, b: { infrastructure: 5, industrial_complex: 8, arms_factory: 6, synthetic_refinery: 3, nuclear_reactor: 2, air_base: 3 }, res: { steel: 100 } },
    '20': { name: 'Warsaw', owner: 'POL', provinces: [201, 202], vp: { 201: 15, 202: 3 }, b: { infrastructure: 4, industrial_complex: 5, arms_factory: 3, synthetic_refinery: 1, nuclear_reactor: 1 }, res: { steel: 50 } }
  };
  const enemyDivisions = [
    { id: 'POL-0', pid: 201, sid: '20', org: 90, strength: 90, defeated: false },
    { id: 'POL-1', pid: 201, sid: '20', org: 90, strength: 90, defeated: false }
  ];
  const mapRenderer = {
    ready: true, mapW: 1000, mapH: 600, states,
    stateCenter: new Map([['10', [100, 100]], ['20', [300, 100]]]),
    provCentroid: new Map([[101, [100, 100]], [201, [300, 100]], [202, [320, 130]]]),
    provNeighbors: new Map([[101, new Set([201])], [201, new Set([101])], [202, new Set([201])]]),
    provToState: new Map([[101, '10'], [201, '20'], [202, '20']]),
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
  const battlePlanManager = { armies: [], air: [], renderPanel() {}, missions: { air: [] }, airRange: () => 900 };
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
    BattlePlanManager: battlePlanManager,
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

test('nuclear strike requires war, an atomic bomb project, spare stockpile, 75% air superiority and a bomber airbase', () => {
  const ctx = loadSuperWeapons();
  const { SW, airForce, states } = ctx;
  assert.equal(SW.canNuke('20', 201), true);
  assert.equal(SW.nukeChecks('20', 201).length, 5);

  // 制空権 75% 未満は発令できない
  airForce.superiority = () => ({ percent: 60, contested: true, level: 'advantage' });
  assert.equal(SW.canNuke('20', 201), false);
  assert.match(SW.nukeChecks('20', 201).find(c => /制空権/.test(c.text)).text, /75%/);
  airForce.superiority = () => ({ percent: 82, contested: true, level: 'dominant' });

  // 核備蓄
  ctx.gameState.nuclearStockpile = 0;
  assert.equal(SW.canNuke('20', 201), false);
  assert.match(SW.nukeChecks('20', 201).find(c => /備蓄/.test(c.text)).text, /現在 0/);
  ctx.gameState.nuclearStockpile = 2;

  // 攻撃計画が予約した 1 発は「発令可能」から差し引かれる
  SW.orderStrike(201);
  assert.equal(SW.reservedNukes(), 1);
  assert.equal(SW.availableNukes(), 1);
  ctx.gameState.nuclearStockpile = 1;
  assert.equal(SW.canNuke('20', 202), false, '予約で備蓄が埋まっていれば新規計画は発令できない');
  assert.equal(SW.canNuke('20', 202, { ignoreReserve: true }), true);

  // 交戦していない国は対象外
  ctx.gameState.atWar = [];
  ctx.gameState.nuclearStockpile = 2;
  assert.equal(SW.canNuke('20', 201), false);

  // 飛行場に戦略爆撃機がないと発令できない
  ctx.gameState.atWar = ['POL'];
  states['10'].b.air_base = 0;
  assert.equal(SW.canNuke('20', 202), false);
  assert.match(SW.nukeChecks('20', 202).find(c => /飛行場|戦略爆撃機/.test(c.text)).text, /飛行場/);
});

test('declaring war or being declared on both count as being at war with the target', () => {
  const ctx = loadSuperWeapons();
  const { SW, sandbox } = ctx;
  // 宣戦布告した側 (atWar に相手が入っている)
  ctx.gameState.atWar = ['POL'];
  assert.equal(SW.atWarWith('POL'), true);
  // 宣戦布告された側 (FactionSystem 経由で双方向に判定)
  sandbox.FactionSystem = { atWar: (a, b) => (a === 'GER' && b === 'POL') };
  ctx.gameState.atWar = [];
  assert.equal(SW.atWarWith('POL'), true);
  assert.equal(SW.atWarWith('GER'), false, '自国は対象外');
});

test('the strike planning dialog asks to plan a strike on the province and lists airbase requirements', () => {
  const ctx = loadSuperWeapons();
  ctx.SW.openStrikeModal('20', 201);
  const modal = ctx.modal();
  assert.ok(modal, 'the strike planning dialog is opened');
  assert.match(modal.title, /Warsaw/);
  assert.match(modal.html, /核攻撃計画/);
  assert.match(modal.html, /発進基地/);
  assert.match(modal.html, /攻撃計画を発令/);
  assert.match(modal.html, /30 日/, 'the plan resolves in about one month');
  assert.match(modal.html, /第1爆撃航空隊|Berlin/, 'the launch airbase is selectable');
});

test('issuing a strike plan reserves a bomb and resolves over about 30 days from a bomber airbase', () => {
  const ctx = loadSuperWeapons();
  const { SW, gameState, states } = ctx;
  const before = gameState.nuclearStockpile;
  assert.equal(SW.orderStrike(201, {}), true);
  assert.equal(gameState.nuclearStockpile, before, '発令では備蓄を消費しない (計画に予約するだけ)');
  const plan = SW.data().plans[0];
  assert.equal(plan.status, 'preparing');
  assert.equal(plan.sid, '20');
  assert.equal(plan.baseSid, '10', 'launch airbase is the one hosting the strategic bomber wing');
  assert.equal(plan.days, 30);
  assert.match(plan.baseName, /Berlin/);
  assert.equal(SW.activePlans().length, 1);
  assert.equal(SW.availableNukes(), before - 1, 'one bomb is reserved for the plan');

  // 同一プロヴィンスへ二重発令できない
  assert.equal(SW.orderStrike(201), false);

  // 途中では着弾しない
  for (let i = 0; i < 29; i++) SW.strikePlanTick();
  assert.equal(SW.data().strikes || 0, 0, '29 日目ではまだ着弾しない');
  assert.equal(states['20'].b.infrastructure, 4);

  // 30 日目に着弾し、州が破壊される
  SW.strikePlanTick();
  assert.equal(SW.data().strikes, 1);
  assert.equal(gameState.nuclearStockpile, before - 1, '着弾で備蓄を 1 消費');
  assert.equal(states['20'].b.infrastructure, 0);
  assert.equal(SW.activePlans().length, 0, '計画は完了として片付けられる');
  assert.equal(SW.planFor(201), null);
  assert.ok(SW.data().planHistory.length >= 1, '結果が履歴に残る');
});

test('a strike plan is delayed while air superiority is below 75%', () => {
  const ctx = loadSuperWeapons();
  const { SW, airForce } = ctx;
  SW.orderStrike(201);
  airForce.superiority = () => ({ percent: 40, contested: true, level: 'contested' });
  SW.strikePlanTick();
  const plan = SW.data().plans[0];
  assert.equal(plan.status, 'delayed');
  assert.ok(plan.progress < 1 / 30 * 1.01, '遅延中は進捗が半分');
  for (let i = 0; i < 40; i++) SW.strikePlanTick();
  assert.equal(SW.data().strikes || 0, 0, '制空権不足では 30 日を過ぎても着弾しない');
  airForce.superiority = () => ({ percent: 82, contested: true, level: 'dominant' });
  for (let i = 0; i < 30; i++) SW.strikePlanTick();
  assert.equal(SW.data().strikes, 1, '制空権を回復すると着弾する');
});

test('cancelling a strike plan releases the reserved bomb', () => {
  const ctx = loadSuperWeapons();
  const { SW, gameState } = ctx;
  SW.orderStrike(201);
  const plan = SW.data().plans[0];
  assert.equal(SW.cancelPlan(plan.id), true);
  assert.equal(SW.activePlans().length, 0);
  assert.equal(SW.availableNukes(), gameState.nuclearStockpile);
  assert.equal(SW.data().plans.length, 0);
});

test('a nuke impact destroys the state, routs enemy divisions and lowers war support by 15-30%', () => {
  const ctx = loadSuperWeapons();
  const { SW, states, enemyDivisions, gameState } = ctx;
  const before = gameState.nuclearStockpile;
  assert.equal(SW.launchNuke('20', 201), true);
  assert.equal(gameState.nuclearStockpile, before - 1);
  const b = states['20'].b;
  ['infrastructure', 'industrial_complex', 'arms_factory', 'synthetic_refinery', 'nuclear_reactor'].forEach(key => assert.equal(b[key], 0, key + ' is destroyed'));
  assert.ok(states['20'].ruined, 'the state is marked as ruined (map icon)');
  assert.equal(enemyDivisions.filter(d => d.defeated).length, 2, '90%+ of the divisions are destroyed');
  assert.ok(enemyDivisions.every(d => d.org <= 9 && d.strength <= 9), 'every division loses 90%+ org/strength');
  const d = SW.data();
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].pid, 201, 'the hit province is recorded');
  assert.match(d.history[0].name, /Warsaw/);
  const loss = d.history[0].warSupport;
  assert.ok(loss >= 15 && loss <= 30, 'war support loss is 15-30: ' + loss);
  assert.ok(d.damage.POL.warSupport >= 15 && d.damage.POL.warSupport <= 30);
  assert.ok(d.history[0].stability >= 15 && d.history[0].stability <= 30);
});

test('the endgame weapons window keeps its three columns and adds the special-research view', () => {
  const ctx = loadSuperWeapons();
  ctx.SW.render();
  const html = ctx.content.innerHTML;
  assert.match(html, /sw-col-left/);
  assert.match(html, /sw-col-center/);
  assert.match(html, /sw-col-right/);
  assert.match(html, /攻撃計画モード \(Plan Strike\)/);
  assert.match(html, /攻撃計画/);
  assert.match(html, /ターゲット履歴/);
  assert.match(html, /累積戦略ダメージ/);
  assert.match(html, /原子炉/);

  // 特別研究ビュー: 科学者の肖像 + 設計図 + 科学者名簿
  ctx.SW.setView('research');
  const research = ctx.content.innerHTML;
  assert.match(research, /特別研究/);
  assert.match(research, /sw-roster/);
  assert.match(research, /sw-projects wide/);
  assert.match(research, /assets\/scientists\//, 'scientist portraits are rendered');
  assert.match(research, /assets\/special_projects\//, 'blueprint art is rendered');
  assert.match(research, /sw-bp/, 'blueprint figure');
  assert.match(research, /原子爆弾/);
  ctx.SW.setView('arsenal');
  assert.match(ctx.content.innerHTML, /sw-col-left/);
});

test('every special project shows a scientist portrait and a project-specific blueprint', () => {
  const ctx = loadSuperWeapons();
  const { SW } = ctx;
  ctx.SW.setView('research');
  const html = ctx.content.innerHTML;
  Object.values(SW.PROJECTS).forEach(P => {
    assert.ok(html.includes(P.img), P.id + ' blueprint ' + P.img + ' is rendered');
    assert.ok(P.img.toLowerCase().includes(P.id === 'uranium' ? 'nuclear'
      : P.id === 'atomic' ? 'bomb'
      : P.id === 'v2' ? 'v2'
      : P.id === 'ballistic' ? 'ballistic'
      : 'jet'), P.id + ' uses a matching blueprint: ' + P.img);
  });
  // 計画カードごとに肖像 (担当 or 筆頭候補) が出る
  assert.ok((html.match(/class="sw-portrait/g) || []).length >= Object.keys(SW.PROJECTS).length,
    'each project card renders a scientist portrait');
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
