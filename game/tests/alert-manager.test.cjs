'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers/strategy-fixture.cjs');
const root = path.resolve(__dirname, '..');

/* AlertManager用の最小DOM。既存fixtureのゲームManagerはそのまま使い、
   DOM増分更新・ツールチップ・タイマー合流だけを検証可能にする。 */
class TestNode {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.id = '';
    this._classes = new Set();
    const self = this;
    this.classList = {
      add(...names) { names.forEach(n => self._classes.add(n)); },
      remove(...names) { names.forEach(n => self._classes.delete(n)); },
      contains(name) { return self._classes.has(name); },
      toggle(name, force) {
        const on = force === undefined ? !self._classes.has(name) : !!force;
        if (on) self._classes.add(name); else self._classes.delete(name);
        return on;
      }
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(value) { this._classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get offsetWidth() { return 320; }
  get offsetHeight() { return 180; }
  appendChild(child) { return this.insertBefore(child, null); }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  insertBefore(child, reference) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = reference ? this.children.indexOf(reference) : -1;
    if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
    child.parentNode = this;
    if (child.id) this.ownerDocument.byId.set(child.id, child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(node) {
    if (node === this) return true;
    return this.children.some(child => child.contains(node));
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') { this.id = String(value); this.ownerDocument.byId.set(this.id, this); }
  }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }
  dispatch(type, event = {}) {
    const payload = Object.assign({ target: this, relatedTarget: null, preventDefault() {}, stopPropagation() {} }, event);
    (this.listeners.get(type) || []).slice().forEach(handler => handler(payload));
  }
  closest(selector) {
    if (selector === '.alert-button' && this.classList.contains('alert-button')) return this;
    return this.parentNode ? this.parentNode.closest(selector) : null;
  }
  getBoundingClientRect() { return { left: 20, right: 86, top: 80, bottom: 124, width: 66, height: 44 }; }
  focus() { this.ownerDocument.activeElement = this; }
}

function makeDocument() {
  const doc = {
    byId: new Map(),
    hidden: false,
    listeners: new Map(),
    createElement(tag) { return new TestNode(tag, doc); },
    getElementById(id) { return doc.byId.get(id) || null; },
    addEventListener(type, handler) {
      if (!doc.listeners.has(type)) doc.listeners.set(type, []);
      doc.listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = doc.listeners.get(type) || [];
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type, event) {
      (doc.listeners.get(type) || []).slice().forEach(handler => handler(event));
    }
  };
  doc.body = new TestNode('body', doc);
  doc.activeElement = doc.body;
  const container = doc.createElement('div'); container.id = 'alert-container'; container.hidden = true;
  const list = doc.createElement('div'); list.id = 'alert-list';
  const total = doc.createElement('span'); total.id = 'alert-total';
  const empty = doc.createElement('span'); empty.id = 'alert-empty'; empty.hidden = true;
  const announcer = doc.createElement('span'); announcer.id = 'alert-announcer';
  container.append(list, total, empty, announcer);
  doc.body.appendChild(container);
  return doc;
}

function setup() {
  const f = fixture();
  const dom = makeDocument();
  const timers = { intervals: [], timeouts: [] };
  f.ctx.document = dom;
  f.ctx.removeEventListener = () => {};
  f.ctx.setInterval = (fn, ms) => { timers.intervals.push({ fn, ms, cleared: false }); return timers.intervals.length; };
  f.ctx.clearInterval = id => { if (timers.intervals[id - 1]) timers.intervals[id - 1].cleared = true; };
  f.ctx.setTimeout = (fn, ms) => { timers.timeouts.push({ fn, ms, cleared: false }); return timers.timeouts.length; };
  f.ctx.clearTimeout = id => { if (timers.timeouts[id - 1]) timers.timeouts[id - 1].cleared = true; };
  f.load('assets/alert-manager.js');
  // アラートが出ない中立状態。各テストで必要な条件だけ有効化する。
  f.run(`
    CoreEngine.gameState.country='GER';
    CoreEngine.gameState.politicalPower=0;
    CoreEngine.gameState.manpower=0;
    CoreEngine.gameState.warSupport=0;
    CoreEngine.gameState.researchSlots=0;
    CoreEngine.gameState.civilianFactories=0;
    CoreEngine.gameState.militaryFactories=0;
    CoreEngine.gameState.dockyards=0;
    CoreEngine.gameState.strategy.production=[];
    CoreEngine.gameState.strategy.reserves=[];
    CoreEngine.gameState.strategy.decisions={};
    CoreEngine.gameState.strategy.tradeLeases=[];
    CoreEngine.gameState.strategy.contracts=[];
    CoreEngine.gameState.recruitQueue=[];
    TrainingManager.queue=CoreEngine.gameState.recruitQueue;
    CoreEngine.gameState.atWar=[];
    CoreEngine.gameState.laws={conscription:'volunteer',economy:'civilian',trade:'export'};
    CoreEngine.gameState.parties={fascism:76,communism:8,democracy:8,neutrality:8};
    CoreEngine.gameState.ideology='fascism';
    FocusTreeManager.currentCountry='GER';
    FocusTreeManager.focuses=[];
    FocusTreeManager.focusMap={};
    FocusTreeManager.countryStates.GER=FocusTreeManager.createCountryState();
    ResearchManager.techData={};
    ResearchManager.researching={};
    ResearchManager.researchedTech=new Set();
    DivisionDesigner.templates=[];
    DivisionDesigner.activeId=null;
    DivisionDesigner.grid=Array(5).fill(null).map(()=>Array(5).fill(null));
    BattlePlanManager.armies=[];
    BattlePlanManager.selectedArmyId=null;
    ConstructionManager.queue=[];
    MapRenderer.ready=true;
  `);
  return { ...f, dom, timers };
}

function evaluate(f) {
  return JSON.parse(f.run('JSON.stringify(new AlertManager(CoreEngine.gameState).evaluate())'));
}
function ids(alerts) { return alerts.map(alert => alert.id).sort(); }
function enableFocus(f, active = false) {
  f.run(`
    FocusTreeManager.focuses=[{id:'GER_test',title:'テスト方針',prerequisites:[]}];
    FocusTreeManager.focusMap={GER_test:FocusTreeManager.focuses[0]};
    FocusTreeManager.activeFocus=${active ? "'GER_test'" : 'null'};
  `);
}
function enableResearch(f, slots = 3, busy = 0) {
  f.run(`
    CoreEngine.gameState.researchSlots=${slots};
    ResearchManager.techData={infantry:[{id:'infantry_weapons',prerequisites:[]},{id:'infantry_weapons2',prerequisites:['infantry_weapons']}]};
    ResearchManager.researchedTech=new Set();
    ResearchManager.researching={};
    for(let i=1;i<=${busy};i++) ResearchManager.researching[i]={techId:'infantry_weapons',progress:0,total:100};
  `);
}
function enableTemplate(f) {
  f.run(`
    DivisionDesigner.templates=[{id:1,name:'歩兵師団',grid:[['infantry','infantry',null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null],[null,null,null,null,null]],support:[null,null,null,null,null]}];
    DivisionDesigner.activeId=1;
    CoreEngine.gameState.manpower=100000;
    ProductionManager.account('GER').stock.infantry=1000;
  `);
}

test('index.html wires the alert container, stylesheet, script and main-loop initialization', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="alert-container"/);
  assert.match(html, /id="alert-list"/);
  assert.match(html, /assets\/alert-manager\.css/);
  assert.match(html, /assets\/alert-manager\.js/);
  assert.match(html, /AlertManager\.init\(CoreEngine\.gameState\)/);
  const order = html.indexOf('AlertManager.init(CoreEngine.gameState)');
  assert.ok(order > html.indexOf('await ForceSystems.init()'));
});

test('neutral state produces no alerts and evaluation does not mutate game state', () => {
  const f = setup();
  const before = f.run('JSON.stringify(CoreEngine.gameState)');
  assert.deepEqual(evaluate(f), []);
  assert.equal(f.run('JSON.stringify(CoreEngine.gameState)'), before);
});

test('all eight requested conditions are monitored independently', () => {
  const f = setup();
  enableFocus(f);
  enableResearch(f, 3, 1);
  enableTemplate(f);
  f.run(`
    CoreEngine.gameState.civilianFactories=4;
    CoreEngine.gameState.militaryFactories=6;
    CoreEngine.gameState.dockyards=2;
    CoreEngine.gameState.politicalPower=300;
    CoreEngine.gameState.warSupport=60;
    CoreEngine.gameState.atWar=['POL'];
    CoreEngine.gameState.strategy.reserves=[{id:1,name:'第1師団',comp:{artillery:6},equipmentStrength:40},{id:2,name:'第2師団',comp:{infantry:6}}];
    ResearchManager.researchedTech.add('infantry_weapons');
    ResearchManager.researchedTech.add('improved_infantry_weapons');
    CoreEngine.gameState.strategy.production=[{type:'infantry',factories:2}];
    CoreEngine.gameState.recruitQueue=[{id:1,phase:'gathering',comp:{artillery:6},equipmentNeeds:{artillery:600},manpowerNeed:60000}];
    TrainingManager.queue=CoreEngine.gameState.recruitQueue;
  `);
  // 訓練キューが空でない場合、訓練アラートは解消している必要がある。
  let alerts = evaluate(f);
  assert.ok(!ids(alerts).includes('training'));
  f.run('CoreEngine.gameState.recruitQueue=[];TrainingManager.queue=CoreEngine.gameState.recruitQueue;');
  alerts = evaluate(f);
  assert.deepEqual(ids(alerts), ['decisions', 'factories', 'focus', 'obsolete', 'research', 'shortage', 'training', 'unassigned']);
  const byId = Object.fromEntries(alerts.map(alert => [alert.id, alert]));
  assert.equal(byId.research.count, 2);
  assert.equal(byId.unassigned.severity, 'critical');
  assert.equal(byId.shortage.severity, 'critical');
  assert.equal(byId.focus.severity, 'warning');
});

test('focus alert waits for the current country tree and hides when a focus is active or unavailable', () => {
  const f = setup();
  assert.deepEqual(evaluate(f), []);
  enableFocus(f);
  assert.deepEqual(ids(evaluate(f)), ['focus']);
  f.run("FocusTreeManager.currentCountry='JAP'");
  assert.deepEqual(evaluate(f), []);
  f.run("FocusTreeManager.currentCountry='GER'");
  enableFocus(f, true);
  assert.deepEqual(evaluate(f), []);
  f.run("FocusTreeManager.activeFocus=null;FocusTreeManager.completedFocuses.add('GER_test')");
  assert.deepEqual(evaluate(f), []);
});

test('research alert counts only unlocked empty slots with a researchable candidate', () => {
  const f = setup();
  enableResearch(f, 5, 2);
  let alert = evaluate(f).find(a => a.id === 'research');
  assert.equal(alert.count, 3); // 解放済み5枠 - 使用中2枠 = 空き3
  f.run('CoreEngine.gameState.researchSlots=3');
  alert = evaluate(f).find(a => a.id === 'research');
  assert.equal(alert.count, 1);
  f.run('ResearchManager.researching[3]={techId:"infantry_weapons",progress:0,total:100}');
  assert.deepEqual(evaluate(f), []);
  f.run('ResearchManager.researching={};ResearchManager.researchedTech=new Set(["infantry_weapons","infantry_weapons2"])');
  assert.deepEqual(evaluate(f), []);
});

test('idle factories subtract construction, trade and market reservations and split by pool', () => {
  const f = setup();
  f.run(`
    CoreEngine.gameState.civilianFactories=10;
    CoreEngine.gameState.militaryFactories=8;
    CoreEngine.gameState.dockyards=3;
    ConstructionManager.queue=[{factories:3}];
    CoreEngine.gameState.strategy.tradeLeases=[{factories:2,expires:GameTools.day()+5}];
    CoreEngine.gameState.strategy.contracts=[{buyer:'GER',seller:'POL',factories:1,expires:GameTools.day()+5}];
    CoreEngine.gameState.strategy.production=[{type:'infantry',factories:5},{type:'destroyer',factories:1}];
  `);
  const alert = evaluate(f).find(a => a.id === 'factories');
  assert.deepEqual(alert.payload, { civilian: 4, military: 3, dockyard: 2 });
  assert.equal(alert.count, 9);
  assert.equal(alert.screen, 'production');
  f.run(`
    CoreEngine.gameState.militaryFactories=5;
    CoreEngine.gameState.dockyards=1;
    CoreEngine.gameState.strategy.production=[{type:'infantry',factories:5},{type:'destroyer',factories:1}];
  `);
  const civilianOnly = evaluate(f).find(a => a.id === 'factories');
  assert.equal(civilianOnly.screen, 'construction');
  assert.equal(civilianOnly.count, 4);
});

test('training alert requires an empty queue plus sufficient manpower and equipment', () => {
  const f = setup();
  enableTemplate(f);
  assert.deepEqual(ids(evaluate(f)), ['training']);
  f.run('CoreEngine.gameState.manpower=0');
  assert.deepEqual(evaluate(f), []);
  f.run('CoreEngine.gameState.manpower=100000;ProductionManager.account("GER").stock.infantry=0');
  assert.deepEqual(evaluate(f), []);
  f.run('ProductionManager.account("GER").stock.infantry=1000;CoreEngine.gameState.recruitQueue=[{id:1,phase:"training",done:false}];TrainingManager.queue=CoreEngine.gameState.recruitQueue');
  assert.deepEqual(evaluate(f), []);
});

test('obsolete production alert follows researched upgrade chains and ignores zero-factory lines', () => {
  const f = setup();
  f.run(`
    ResearchManager.researchedTech=new Set(['infantry_weapons']);
    CoreEngine.gameState.strategy.production=[{type:'rifle_old',factories:2}];
  `);
  let alert = evaluate(f).find(a => a.id === 'obsolete');
  assert.equal(alert.count, 1);
  assert.match(alert.details[0], /旧式歩兵装備 → 歩兵装備/);
  f.run("ResearchManager.researchedTech.add('improved_infantry_weapons')");
  alert = evaluate(f).find(a => a.id === 'obsolete');
  assert.match(alert.details[0], /旧式歩兵装備 → 歩兵装備 II/);
  f.run('CoreEngine.gameState.strategy.production[0].factories=0');
  assert.deepEqual(evaluate(f), []);
});

test('unassigned alert counts reserves and idle armies without commanders or orders only', () => {
  const f = setup();
  f.run(`
    CoreEngine.gameState.strategy.reserves=[{id:1},{id:2},{id:3,defeated:true}];
    BattlePlanManager.armies=[
      {id:1,name:'待機軍',divisions:[{id:4},{id:5}]},
      {id:2,name:'将軍あり',general:{id:'g'},divisions:[{id:6}]},
      {id:3,name:'前線あり',frontline:[[1,2]],divisions:[{id:7}]},
      {id:4,name:'実行中',executing:true,divisions:[{id:8}]},
      {id:5,name:'死守',holdOrder:true,divisions:[{id:9}]}
    ];
  `);
  let alert = evaluate(f).find(a => a.id === 'unassigned');
  assert.equal(alert.count, 4);
  assert.equal(alert.payload.reserveCount, 2);
  assert.equal(alert.payload.armyId, 1);
  assert.equal(alert.severity, 'warning');
  f.run("CoreEngine.gameState.atWar=['POL']");
  assert.equal(evaluate(f).find(a => a.id === 'unassigned').severity, 'critical');
  f.run('MapRenderer.ready=false');
  assert.deepEqual(evaluate(f), []);
});

test('decisions alert respects PP, prerequisites, valid targets, laws and government support', () => {
  const f = setup();
  f.run(`
    CoreEngine.gameState.politicalPower=150;
    CoreEngine.gameState.warSupport=30;
    CoreEngine.gameState.country='GER';
    DiplomacyManager.countries=[{id:'POL',name:'ポーランド'}];
    CoreEngine.gameState.worldTension=0;
  `);
  let alert = evaluate(f).find(a => a.id === 'decisions');
  assert.ok(alert);
  assert.equal(alert.payload.decisions >= 2, true); // peace_mission + defense_drill
  assert.equal(alert.payload.laws >= 1, true);
  f.run("CoreEngine.gameState.strategy.decisions.peace_mission={remaining:10};CoreEngine.gameState.strategy.decisions.defense_drill={remaining:10};DiplomacyManager.countries=[]");
  alert = evaluate(f).find(a => a.id === 'decisions');
  assert.equal(alert.payload.decisions, 0);
  assert.equal(alert.screen, 'politics');
  f.run('CoreEngine.gameState.politicalPower=0');
  assert.deepEqual(evaluate(f), []);
  f.run("CoreEngine.gameState.politicalPower=200;CoreEngine.gameState.parties.democracy=60");
  alert = evaluate(f).find(a => a.id === 'decisions');
  assert.equal(alert.payload.governments, 1);
});

test('equipment shortage accepts upgraded inventory groups but not zero-factory lines', () => {
  const f = setup();
  f.run(`
    CoreEngine.gameState.recruitQueue=[{id:1,phase:'gathering',comp:{infantry:6},equipmentNeeds:{infantry:600}}];
    TrainingManager.queue=CoreEngine.gameState.recruitQueue;
    CoreEngine.gameState.strategy.reserves=[{id:1,comp:{infantry:6},equipmentStrength:50}];
    CoreEngine.gameState.strategy.production=[{type:'infantry_2',factories:2}];
  `);
  assert.ok(!ids(evaluate(f)).includes('shortage'));
  f.run('CoreEngine.gameState.strategy.production[0].factories=0');
  const alert = evaluate(f).find(a => a.id === 'shortage');
  assert.equal(alert.count, 1);
  assert.equal(alert.severity, 'critical');
  assert.match(alert.details[0], /徴兵待ち 1・補充待ち 1/);
  f.run('CoreEngine.gameState.recruitQueue=[];TrainingManager.queue=CoreEngine.gameState.recruitQueue;CoreEngine.gameState.strategy.reserves=[]');
  assert.deepEqual(evaluate(f), []);
});

test('DOM updates reuse unchanged buttons, update counts in place and remove resolved alerts', () => {
  const f = setup();
  enableFocus(f);
  enableResearch(f, 3, 0);
  const manager = f.run('AlertManager.init()');
  assert.equal(manager.entries.size, 2);
  const focusButton = manager.entries.get('focus').button;
  const researchButton = manager.entries.get('research').button;
  manager.update();
  assert.equal(manager.entries.get('focus').button, focusButton);
  assert.equal(manager.entries.get('research').button, researchButton);
  assert.equal(researchButton.children[1].textContent, '3');
  f.run('CoreEngine.gameState.researchSlots=2');
  manager.update();
  assert.equal(manager.entries.get('research').button, researchButton);
  assert.equal(researchButton.children[1].textContent, '2');
  manager.showTooltip('research');
  assert.equal(manager.tooltip.hidden, false);
  f.run('ResearchManager.researching={1:{techId:"infantry_weapons"},2:{techId:"infantry_weapons"}}');
  manager.update();
  assert.equal(manager.entries.has('research'), false);
  assert.equal(manager.tooltip.hidden, true);
  assert.equal(manager.entries.get('focus').button, focusButton);
  enableFocus(f, true);
  manager.update();
  assert.equal(manager.entries.size, 0);
  assert.equal(manager.container.classList.contains('is-clear'), true);
  assert.equal(manager.emptyEl.hidden, false);
  manager.destroy();
});

test('alert clicks open the matching existing screen and deployment opens the assignment modal', () => {
  const f = setup();
  enableFocus(f);
  enableResearch(f, 3, 0);
  f.run(`
    CoreEngine.gameState.militaryFactories=2;
    CoreEngine.gameState.strategy.production=[];
    CoreEngine.gameState.strategy.reserves=[{id:1},{id:2}];
    BattlePlanManager.armies=[{id:7,name:'第7軍',divisions:[],executing:false}];
    globalThis.__opened=[];
    GameUI.switchTab=id=>__opened.push(id);
    GameUI.onWindowOpened=()=>{};
    BattlePlanManager.setForce=()=>{};
    BattlePlanManager.selectArmy=id=>{BattlePlanManager.selectedArmyId=id;};
    ArmyRoster.assignModal=()=>__opened.push('assignModal');
  `);
  const manager = f.run('AlertManager.init()');
  manager.activate('focus');
  manager.activate('research');
  manager.activate('factories');
  manager.activate('unassigned');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(__opened)')), ['focus', 'research', 'production', 'assignModal']);
  assert.equal(f.run('BattlePlanManager.selectedArmyId'), 7);
  manager.destroy();
});

test('tooltip is accessible, follows hover/focus and closes on Escape', () => {
  const f = setup();
  enableFocus(f);
  const manager = f.run('AlertManager.init()');
  const button = manager.entries.get('focus').button;
  manager.list.dispatch('mouseover', { target: button });
  assert.equal(manager.tooltip.hidden, false);
  assert.equal(button.attributes['aria-describedby'], 'alert-tooltip');
  assert.equal(manager.tooltipParts.title.textContent, '国家方針が未設定です');
  f.dom.dispatch('keydown', { key: 'Escape' });
  assert.equal(manager.tooltip.hidden, true);
  assert.equal(button.attributes['aria-describedby'], undefined);
  button.focus();
  manager.list.dispatch('focusin', { target: button });
  assert.equal(manager.tooltip.hidden, false);
  manager.list.dispatch('focusout', { target: button, relatedTarget: f.dom.body });
  assert.equal(manager.tooltip.hidden, true);
  manager.destroy();
});

test('tick integration is registered once, high-frequency requests coalesce, and destroy cleans up', () => {
  const f = setup();
  const before = f.run('CoreEngine.tickCallbacks.length');
  const manager = f.run('AlertManager.init()');
  assert.equal(f.run('CoreEngine.tickCallbacks.length'), before + 1);
  f.run('AlertManager.init()');
  assert.equal(f.run('CoreEngine.tickCallbacks.length'), before + 1);
  assert.equal(f.timers.intervals.length, 1);
  assert.equal(f.timers.intervals[0].ms, 250);
  manager.requestUpdate();
  manager.requestUpdate();
  manager.requestUpdate();
  const pending = f.timers.timeouts.filter(timer => !timer.cleared);
  assert.equal(pending.length, 1);
  pending[0].fn();
  assert.equal(manager.pending, null);
  // 一時停止中でも定期ポーリングで条件解消を反映する。
  enableFocus(f);
  manager.update();
  assert.equal(manager.entries.has('focus'), true);
  enableFocus(f, true);
  f.timers.intervals[0].fn();
  const pausedPending = f.timers.timeouts.filter(timer => !timer.cleared).pop();
  pausedPending.fn();
  assert.equal(manager.entries.has('focus'), false);
  manager.destroy();
  assert.equal(f.timers.intervals[0].cleared, true);
  assert.equal(manager.container.hidden, true);
  assert.equal(manager.entries.size, 0);
  assert.equal(f.run('AlertManager.instance'), null);
});
