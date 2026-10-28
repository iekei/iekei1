// 貿易・6大資源システム (TradeSystem) の回帰テスト
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'game/assets/trade-resources.js'), 'utf8');

function makeWorld(options = {}) {
  const states = {
    '10': { name: 'Ruh', owner: 'GER', initialOwner: 'GER', provinces: [101], b: {} },
    '11': { name: 'Berlin', owner: 'GER', initialOwner: 'GER', provinces: [102], b: {} },
    '20': { name: 'Warsaw', owner: 'POL', initialOwner: 'POL', provinces: [201], b: {} },
    '30': { name: 'New York', owner: 'USA', initialOwner: 'USA', provinces: [301], b: {} },
    '40': { name: 'Paris', owner: 'FRA', initialOwner: 'FRA', provinces: [401], b: {} }
  };
  const provToState = new Map([[101, '10'], [102, '11'], [201, '20'], [301, '30'], [401, '40']]);
  const mapRenderer = {
    ready: true,
    states,
    provNeighbors: new Map([[101, new Set([102, 201])], [102, new Set([101])], [201, new Set([101])], [301, new Set([401])], [401, new Set([301])]]),
    stateOf(pid) { return provToState.get(Number(pid)) || null; },
    ownerOf(pid) { const sid = this.stateOf(pid); return sid ? states[sid].owner : null; }
  };
  const CATALOG = {
    infantry: { name: '歩兵装備', rate: 10, resources: { steel: 7 }, pool: 'military' },
    tank: { name: '戦車', rate: 1, resources: { steel: 14, tungsten: 5, chromium: 10 }, pool: 'military' },
    fighter: { name: '戦闘機', rate: 0.5, resources: { aluminum: 10, rubber: 3 }, pool: 'military' },
    convoys: { name: '輸送船', rate: 1 / 14, resources: { steel: 5 }, pool: 'dockyard' }
  };
  const gameState = {
    country: 'GER', atWar: [], politicalPower: 100, stability: 70, warSupport: 50, manpower: 500000,
    resources: { oil: 100, coal: 80, steel: 100, tungsten: 20, chromium: 10, aluminum: 40, rubber: 5 },
    civilianFactories: 20, militaryFactories: 30, dockyards: 5, convoys: 100,
    strategy: {
      production: [
        { type: 'tank', factories: 10, progress: 0, produced: 0, efficiency: 1 },
        { type: 'fighter', factories: 5, progress: 0, produced: 0, efficiency: 1 }
      ],
      economies: { GER: { civilian: 20, military: 30, dockyards: 5, construction: 0, stock: { convoys: 100, tank: 0, fighter: 0 } } },
      construction: [], trades: [], exportPolicy: 'limited', tradeBlock: {}
    }
  };
  const accounts = {};
  const account = (tag) => (accounts[tag] ||= { initialized: true, civilian: 20, military: 30, dockyards: 5, construction: 0, stock: { convoys: tag === 'GER' ? (options.convoys ?? 100) : 200, tank: 0, fighter: 0 } });
  const ProductionManager = {
    CATALOG,
    account,
    syncLocal() {},
    render() {},
    tick() {},
    freeCivilian() { return Math.max(0, 20 - (gameState.strategy.construction.reduce((n, q) => n + q.factories, 0))); },
    capacity(pool) { return pool === 'dockyard' ? 5 : 30; },
    treatyLimited() { return false; }
  };
  const FactoryBudget = { availableCivilian: () => 20 };
  const notifications = [];
  const content = { innerHTML: '' };
  const document = {
    getElementById(id) { return id === 'trade-content' ? content : null; },
    querySelector() { return null; }
  };
  const sandbox = {
    console, Math, Date, JSON, document,
    CoreEngine: { gameState, log() {}, registerTickCallback() {} },
    MapRenderer: mapRenderer,
    ProductionManager,
    FactoryBudget,
    ConstructionManager: { queue: [], render() {}, selectState() {} },
    PoliticsManager: { currentLaw: () => ({ factoryOutput: 0 }) },
    DiplomacyManager: {
      countries: [
        { id: 'USA', name: 'アメリカ', relation: 10 },
        { id: 'POL', name: 'ポーランド', relation: -20 },
        { id: 'FRA', name: 'フランス', relation: 0 }
      ],
      nameOf: (t) => ({ USA: 'アメリカ', POL: 'ポーランド', FRA: 'フランス', GER: 'ドイツ' }[t] || t)
    },
    GameTools: { escape: (s) => String(s), day: () => 100, editing: () => false },
    GameUI: { notify: (m, t) => notifications.push([t || 'info', m]), switchTab() {} },
    WindowManager: { isOpen: () => false },
    MarketManager: { atWar: () => false },
    ConvoyManager: { consumeForTrade: () => true }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source + '\n;globalThis.TradeSystem = TradeSystem;', sandbox);
  const T = sandbox.TradeSystem;
  T.init();
  return { T, gameState, mapRenderer, states, account, notifications, content, sandbox, FactoryBudget };
}

test('six resources are defined and states produce them from the country profile', () => {
  const { T } = makeWorld();
  assert.equal(T.ORDER.join(','), 'oil,steel,aluminum,tungsten,rubber,chromium');
  assert.equal(T.UNIT, 8, 'HOI4 base rate: 1 civilian factory = 8 resources');
  const res = T.stateResources('11');
  assert.ok(Object.keys(res).length > 0, 'Berlin produces at least one resource');
  const prod = T.production('GER');
  const total = Object.values(prod).reduce((a, b) => a + b, 0);
  assert.ok(total > 0, 'Germany produces resources: ' + JSON.stringify(prod));
  assert.equal(T.production('POL').steel > 0, true);
});

test('production lines consume resources per factory (tank: steel 2 / tungsten 0.7 / chromium 1.4)', () => {
  const { T } = makeWorld();
  const cost = T.lineCost('tank');
  assert.equal(cost.steel, 2);
  assert.equal(cost.tungsten, 0.71);
  assert.equal(cost.chromium, 1.43);
  const lines = T.demandLines('GER');
  assert.equal(lines.length, 2);
  const tank = lines.find(l => l.type === 'tank');
  assert.equal(tank.factories, 10);
  assert.equal(tank.total.steel, 20);
  assert.ok(Math.abs(tank.total.tungsten - 7.1) < 1e-9);
  assert.ok(Math.abs(tank.total.chromium - 14.3) < 1e-9);
  // 航空機ラインは鉄を必要としない (アルミ/ゴムのみ)
  const fighter = lines.find(l => l.type === 'fighter');
  assert.ok(Math.abs(fighter.total.aluminum - 7.15) < 1e-9, 'aluminum: ' + fighter.total.aluminum);
  assert.ok(Math.abs(fighter.total.rubber - 2.15) < 1e-9, 'rubber: ' + fighter.total.rubber);
  assert.equal(fighter.total.steel, undefined);
  const demand = T.demand('GER');
  assert.equal(demand.steel, 20);
  assert.ok(Math.abs(demand.aluminum - 7.15) < 1e-9);
});

test('a resource shortage lowers production efficiency proportionally, capped at -80%', () => {
  const { T, gameState } = makeWorld();
  // 資源ごとの効率: 充足率 0 → 20%（−80%）、0.5 → 60%、1 → 100%
  assert.equal(T.resourceEfficiency(1), 1);
  assert.ok(Math.abs(T.resourceEfficiency(0.5) - 0.6) < 1e-9);
  assert.ok(Math.abs(T.resourceEfficiency(0) - 0.2) < 1e-9, 'the penalty never exceeds -80%');
  // 生産ラインの効率は、そのラインが使う資源の使用量で重み付けした平均
  assert.ok(Math.abs(T.lineEfficiency({ steel: 14, tungsten: 5, chromium: 10 }, { steel: 1, tungsten: 0.5, chromium: 0 }) - (14 + 5 * 0.6 + 10 * 0.2) / 29) < 1e-9);

  // 備蓄があれば不足を補える (効率は落ちない)
  gameState.resources.steel = 1000; gameState.resources.tungsten = 1000; gameState.resources.chromium = 1000;
  T.production = () => Object.fromEntries(T.ORDER.map(k => [k, 0]));
  T.invalidate();
  T.productionTick();
  assert.ok(gameState.strategy.production.find(l => l.type === 'tank').efficiency > 0.999, 'a large stockpile prevents the penalty');

  // 備蓄も供給もゼロ → すべてのラインが下限 20%
  T.ORDER.forEach(k => { gameState.resources[k] = 0; });
  T.invalidate();
  T.productionTick();
  const tank = gameState.strategy.production.find(l => l.type === 'tank');
  assert.ok(Math.abs(tank.efficiency - 0.2) < 1e-9, 'efficiency bottoms out at 20%: ' + tank.efficiency);
  assert.ok(tank.shortage.includes('steel'));
  assert.ok(tank.shortage.includes('tungsten'));
  assert.ok(tank.shortage.includes('chromium'));

  // 鉄以外は十分、クロムだけ 0 → クロムの使用分だけ低下
  T.production = () => Object.fromEntries(T.ORDER.map(k => [k, k === 'chromium' ? 0 : 500]));
  T.invalidate();
  T.productionTick();
  const partial = gameState.strategy.production.find(l => l.type === 'tank');
  assert.equal(partial.shortage.join(','), 'chromium');
  assert.ok(Math.abs(partial.efficiency - (14 + 5 + 10 * 0.2) / 29) < 1e-9, 'only the chromium share is penalised: ' + partial.efficiency);

  // 完全充足 → 100% (ペナルティなし)
  T.production = () => Object.fromEntries(T.ORDER.map(k => [k, 500]));
  T.invalidate();
  T.productionTick();
  assert.equal(gameState.strategy.production.find(l => l.type === 'tank').efficiency, 1);
  assert.equal(gameState.strategy.production.find(l => l.type === 'tank').shortage.length, 0);
});

test('importing resources transfers civilian factories to the seller and adds 8 resources per factory', () => {
  const { T, gameState, FactoryBudget } = makeWorld();
  const before = FactoryBudget.availableCivilian();
  const ok = T.setDealAmount('USA', 'steel', 16);
  assert.equal(ok, true);
  const deal = T.deal('GER', 'USA', 'steel');
  assert.ok(deal);
  assert.equal(deal.amount, 16);
  assert.equal(deal.factories, 2);
  assert.equal(T.imports('GER').steel, 16);
  assert.equal(T.factoryDelta('GER'), -2, 'the buyer locks two factories');
  assert.equal(T.factoryDelta('USA'), 2, 'the seller gains the factory use');
  // 8 の倍数に丸められる (9 → 8)
  T.setDealAmount('USA', 'steel', 9);
  assert.equal(T.deal('GER', 'USA', 'steel').amount, 8);
  assert.equal(T.deal('GER', 'USA', 'steel').factories, 1);
  // 契約解除で工場が戻る
  T.setDealAmount('USA', 'steel', 0);
  assert.equal(T.deal('GER', 'USA', 'steel'), null);
  assert.equal(T.factoryDelta('GER'), 0);
  assert.ok(before > 0);
  assert.equal(gameState.strategy.trades.length, 0);
});

test('requested amounts are capped by the seller surplus pool', () => {
  const { T, notifications } = makeWorld();
  const surplus = T.surplus('USA');
  const total = Object.values(surplus).reduce((a, b) => a + b, 0);
  assert.ok(total >= 8, 'the USA has a large surplus pool: ' + JSON.stringify(surplus));
  T.setDealAmount('USA', 'steel', 99999);
  const deal = T.deal('GER', 'USA', 'steel');
  assert.ok(deal, 'a capped deal is still created');
  assert.equal(deal.amount, Math.floor(surplus.steel / T.UNIT) * T.UNIT, 'capped to the surplus pool: ' + deal.amount);
  assert.equal(deal.amount % T.UNIT, 0, 'always a multiple of 8');
  assert.ok(notifications.some(([, m]) => /超えています|不足/.test(m)), 'the player is warned when the request is trimmed');
});

test('overseas trade requires convoys and lower efficiency when they are short', () => {
  const probe = makeWorld();
  assert.equal(probe.T.overseas('GER', 'USA'), true, 'Germany and the USA are not land connected');
  assert.equal(probe.T.overseas('GER', 'POL'), false, 'POL is land connected via province adjacency');
  assert.equal(probe.T.overseas('GER', 'FRA'), true, 'FRA is separated by other countries');
  const pool = probe.T.surplus('USA');
  const res = probe.T.ORDER.find(k => pool[k] >= 8);
  assert.ok(res, 'the USA exposes an exportable pool: ' + JSON.stringify(pool));
  const amount = Math.floor(pool[res] / 8) * 8;
  const needed = amount / 8;

  const short = makeWorld({ convoys: 0 });
  short.T.setDealAmount('USA', res, amount);
  const info = short.T.convoyInfo('GER');
  assert.equal(info.needed, needed);
  assert.equal(info.available, 0);
  assert.equal(info.efficiency, 0, 'no convoys => no effective imports');
  assert.equal(short.T.importsEffective('GER')[res], 0);
  assert.equal(short.T.imports('GER')[res], amount, 'the contract itself still exists');

  const ok = makeWorld({ convoys: 50 });
  ok.T.setDealAmount('USA', res, amount);
  assert.equal(ok.T.convoyInfo('GER').efficiency, 1);
  assert.equal(ok.T.importsEffective('GER')[res], amount);
});

test('trade window renders the six resource summary, country table, sliders and convoy status', () => {
  const { T, content } = makeWorld();
  T.render();
  const html = content.innerHTML;
  for (const name of ['石油', '鉄', 'アルミニウム', 'タングステン', 'ゴム', 'クロム']) {
    assert.ok(html.includes(name), 'summary lists ' + name);
  }
  assert.match(html, /tr-summary/);
  assert.match(html, /国家別 貿易一覧/);
  assert.match(html, /アメリカ/);
  assert.match(html, /ポーランド/);
  assert.match(html, /フランス/);
  assert.match(html, /type="range"/);
  assert.match(html, /type="number"/);
  assert.match(html, /輸送船/);
  assert.match(html, /総生産/);
  assert.match(html, /輸入/);
  assert.match(html, /輸出/);
  assert.match(html, /利用可能/);
});

test('daily tick accrues resource stock from production, imports and exports', () => {
  const { T, gameState } = makeWorld();
  T.production = () => Object.fromEntries(T.ORDER.map(k => [k, k === 'steel' ? 24 : 0]));
  T.demand = () => Object.fromEntries(T.ORDER.map(k => [k, 0]));
  T.invalidate();
  const before = gameState.resources.steel;
  T.onTick();
  assert.ok(gameState.resources.steel > before, 'steel stock grows: ' + before + ' -> ' + gameState.resources.steel);
});
