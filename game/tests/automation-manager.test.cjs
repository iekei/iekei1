'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/strategy-fixture.cjs');

function setup(options = {}) {
  const f = fixture();
  f.load('assets/automation-manager.js');
  if (options.designer) f.load('assets/equipment-designer.js');
  f.run(`
    CoreEngine.gameState.country = 'GER';
    CoreEngine.gameState.paused = false;
    CoreEngine.gameState.date = new Date(1936, 0, 1);
    CoreEngine.gameState.researchSlots = 3;
    CoreEngine.gameState.manpower = 500000;
    CoreEngine.gameState.militaryFactories = 12;
    CoreEngine.gameState.dockyards = 4;
    CoreEngine.gameState.xp = { army: 100, navy: 100, air: 100 };
    CoreEngine.gameState.armyExperience = 100;
    MultiplayerManager.connected = false;
    MultiplayerManager.isHost = false;
    MultiplayerManager.roomId = 'HOST';
    MultiplayerManager.remoteCountries = {};
    MultiplayerManager.broadcast = (msg) => { (CoreEngine.__sent ||= []).push(msg); };
    GameUI.notify = () => {};
    var ResearchTreeUI = { render() {}, closeDetail() {} };
    FocusTreeManager.currentCountry = 'GER';
    FocusTreeManager.countryStates = Object.create(null);
    FocusTreeManager.stateFor('GER');
    FocusTreeManager.focuses = [];
    FocusTreeManager.focusMap = {};
    ResearchManager.currentCountry = 'GER';
    ResearchManager.countryStates = Object.create(null);
    ResearchManager.techData = {};
    ResearchManager.researchedTech = new Set();
    ResearchManager.researching = {};
    DivisionDesigner.currentCountry = 'GER';
    DivisionDesigner.load('GER');
    AutomationManager.started = false;
    AutomationManager.tickRegistered = false;
    AutomationManager.init(CoreEngine.gameState);
  `);
  return f;
}

function enable(f, keys) {
  f.run(`AutomationManager.preset('GER', false); ${keys.map(k => `AutomationManager.setLocalFeature('${k}', true, 'GER');`).join('\n')}`);
}

test('国別デフォルトはすべてOFFで、軍事作戦キーは設定に含まれない', (t) => {
  const f = setup();
  const result = f.run(`
    const ger = AutomationManager.settings('GER');
    const jap = AutomationManager.settings('JAP');
    AutomationManager.setLocalFeature('research', true, 'GER');
    ({ ger: AutomationManager.settings('GER'), jap: AutomationManager.settings('JAP'),
       keys: AutomationManager.KEYS, manual: AutomationManager.MANUAL_ONLY,
       normalized: AutomationManager.normalizeSettings({ research: true, attack: true, frontline: true }) });
  `);
  assert.equal(result.ger.research, true);
  assert.equal(result.jap.research, false);
  assert.equal(JSON.stringify(Object.keys(result.normalized).sort()), JSON.stringify(result.keys.slice().sort()));
  assert.equal(result.normalized.attack, undefined);
  assert.ok(result.manual.includes('frontline') && result.manual.includes('attack'));
});

test('ゲーム開始後は自国以外の設定変更を拒否し、開始前は選択国を設定できる', (t) => {
  const f = setup();
  const result = f.run(`
    AutomationManager.started = false;
    const before = AutomationManager.setLocalFeature('focus', true, 'JAP');
    AutomationManager.started = true;
    const after = AutomationManager.setLocalFeature('focus', true, 'JAP');
    const local = AutomationManager.setLocalFeature('focus', true, 'GER');
    ({ before, after, local, jap: AutomationManager.settings('JAP').focus, ger: AutomationManager.settings('GER').focus });
  `);
  assert.equal(result.before, true);
  assert.equal(result.after, false);
  assert.equal(result.local, true);
  assert.equal(result.jap, true);
  assert.equal(result.ger, true);
});

test('セーブデータ復元は国別フラグを保持し、旧セーブはデフォルトになる', (t) => {
  const f = setup();
  const result = f.run(`
    AutomationManager.setLocalFeature('production', true, 'GER');
    AutomationManager.started = false;
    AutomationManager.setLocalFeature('research', true, 'JAP');
    AutomationManager.started = true;
    const saved = JSON.parse(JSON.stringify(CoreEngine.gameState.countries));
    AutomationManager.restoreCountries(saved, 'GER');
    const restored = { ger: AutomationManager.settings('GER').production, jap: AutomationManager.settings('JAP').research };
    AutomationManager.restoreCountries({}, 'GER');
    const old = AutomationManager.settings('GER').production;
    ({ restored, old });
  `);
  assert.equal(result.restored.ger, true);
  assert.equal(result.restored.jap, true);
  assert.equal(result.old, false);
});

test('マルチプレイ同期は他国設定だけを保存し、自国設定と実行対象を汚染しない', (t) => {
  const f = setup();
  const result = f.run(`
    CoreEngine.__sent = [];
    MultiplayerManager.connected = true;
    MultiplayerManager.isHost = true;
    MultiplayerManager.remoteCountries = { peerJAP: 'JAP' };
    AutomationManager.setLocalFeature('research', true, 'GER');
    const spoof = AutomationManager.receiveMessage({ type:'automation_settings', country:'GER', revision: Date.now()+10, automation:{ research:true, production:true } }, 'peerJAP');
    const wrong = AutomationManager.receiveMessage({ type:'automation_settings', country:'FRA', revision: Date.now()+10, automation:{ research:true } }, 'peerJAP');
    const ok = AutomationManager.receiveMessage({ type:'automation_settings', country:'JAP', revision: Date.now()+10, automation:{ research:true, attack:true } }, 'peerJAP');
    const jap = AutomationManager.settings('JAP');
    const ger = AutomationManager.settings('GER');
    const executed = [];
    const original = AutomationManager.runFeature;
    AutomationManager.runFeature = (key, state, record) => { executed.push(record.tag + ':' + key); };
    AutomationManager.onTick(true);
    AutomationManager.runFeature = original;
    ({ spoof, wrong, ok, jap, ger, executed, relayed: CoreEngine.__sent.some(m => m.type === 'automation_settings' && m.country === 'JAP') });
  `);
  assert.equal(result.spoof, true);
  assert.equal(result.wrong, true);
  assert.equal(result.ok, true);
  assert.equal(result.jap.research, true);
  assert.equal(result.jap.attack, undefined);
  assert.equal(result.ger.production, false);
  assert.equal(result.relayed, true);
  assert.ok(result.executed.every(item => item.startsWith('GER:')));
});

test('ゲストはホスト以外からの他国設定を無視する', (t) => {
  const f = setup();
  const result = f.run(`
    MultiplayerManager.connected = true;
    MultiplayerManager.isHost = false;
    MultiplayerManager.roomId = 'HOST';
    AutomationManager.receiveMessage({ type:'automation_settings', country:'JAP', revision: Date.now(), automation:{ focus:true } }, 'PEER');
    const ignored = AutomationManager.settings('JAP').focus;
    AutomationManager.receiveMessage({ type:'automation_settings', country:'JAP', revision: Date.now(), automation:{ focus:true } }, 'HOST');
    const accepted = AutomationManager.settings('JAP').focus;
    ({ ignored, accepted });
  `);
  assert.equal(result.ignored, false);
  assert.equal(result.accepted, true);
});

test('国家方針アシストは空きスロットに非軍事方針だけを選び、実行中の方針は中断しない', (t) => {
  const f = setup();
  const result = f.run(`
    FocusTreeManager.focuses = [
      { id:'war', title:'宣戦', prerequisites:[], completion_rewards:[{type:'create_wargoal', country:'POL'}] },
      { id:'industry', title:'工業', prerequisites:[], cost:35, completion_rewards:[{type:'add_military_factory', value:2}] },
      { id:'locked', title:'前提', prerequisites:['missing'] }
    ];
    FocusTreeManager.focusMap = Object.fromEntries(FocusTreeManager.focuses.map(f => [f.id, f]));
    enable = null;
    AutomationManager.setLocalFeature('focus', true, 'GER');
    AutomationManager.onTick(true);
    const first = FocusTreeManager.activeFocus;
    AutomationManager.onTick(true);
    const second = FocusTreeManager.activeFocus;
    ({ first, second });
  `);
  assert.equal(result.first, 'industry');
  assert.equal(result.second, 'industry');
});

test('研究アシストは空きスロットだけを埋め、前提・重複・先取りペナルティを尊重する', (t) => {
  const f = setup();
  const result = f.run(`
    ResearchManager.techData = { infantry: [
      { id:'infantry_weapons', title:'歩兵装備', prerequisites:[], year:1936, research_time:80 },
      { id:'infantry_weapons2', title:'改良歩兵', prerequisites:['infantry_weapons'], year:1936, research_time:90 },
      { id:'future', title:'未来技術', prerequisites:[], year:1945, research_time:50 },
      { id:'support', title:'支援装備', prerequisites:[], year:1936, research_time:70, category:'industry' },
      { id:'construction1', title:'建設技術', prerequisites:[], year:1936, research_time:60, category:'industry' }
    ]};
    ResearchManager.researching = { 1: { techId:'infantry_weapons', progress:1, total:80 } };
    AutomationManager.setLocalFeature('research', true, 'GER');
    AutomationManager.onTick(true);
    const slots = Object.values(ResearchManager.researching).map(r => r.techId).sort();
    const count = Object.keys(ResearchManager.researching).length;
    ({ slots, count });
  `);
  assert.equal(result.count, 3);
  assert.ok(result.slots.includes('infantry_weapons'));
  assert.ok(result.slots.includes('support'));
  assert.ok(!result.slots.includes('future'));
  assert.ok(!result.slots.includes('infantry_weapons2'));
});

test('研究アシストは他国の研究中データに書き込まない', (t) => {
  const f = setup();
  const result = f.run(`
    ResearchManager.currentCountry = 'JAP';
    ResearchManager.techData = { infantry: [{ id:'jp_tech', prerequisites:[], year:1936 }] };
    AutomationManager.setLocalFeature('research', true, 'GER');
    AutomationManager.onTick(true);
    Object.keys(ResearchManager.researching).length;
  `);
  assert.equal(result, 0);
});

test('生産アシストは研究済み装備だけを生産し、工場容量を超えない', (t) => {
  const f = setup();
  const result = f.run(`
    ResearchManager.techData = { infantry: [{ id:'infantry_weapons' }, { id:'gw_artillery' }, { id:'tech_support' }, { id:'iw_small_airframe' }] };
    ResearchManager.researchedTech = new Set(['infantry_weapons', 'gw_artillery', 'tech_support', 'iw_small_airframe']);
    CoreEngine.gameState.strategy.production = [];
    CoreEngine.gameState.militaryFactories = 10;
    CoreEngine.gameState.dockyards = 3;
    AutomationManager.setLocalFeature('production', true, 'GER');
    AutomationManager.onTick(true);
    const lines = CoreEngine.gameState.strategy.production;
    const mil = lines.filter(l => ProductionManager.CATALOG[l.type].pool === 'military').reduce((n, l) => n + l.factories, 0);
    const sea = lines.filter(l => ProductionManager.CATALOG[l.type].pool === 'dockyard').reduce((n, l) => n + l.factories, 0);
    ({ types: lines.map(l => l.type).sort(), mil, sea });
  `);
  assert.ok(result.types.includes('infantry'));
  assert.ok(result.types.includes('artillery'));
  assert.ok(!result.types.includes('tank'));
  assert.ok(result.mil <= 10);
  assert.ok(result.sea <= 3);
});

test('徴兵アシストは装備・兵員が足りるときだけ予備配置で訓練を開始する', (t) => {
  const f = setup();
  const result = f.run(`
    ResearchManager.techData = { infantry: [{ id:'infantry_weapons' }] };
    ResearchManager.researchedTech = new Set(['infantry_weapons']);
    const account = ProductionManager.account('GER');
    account.stock.infantry = 5000;
    account.stock.artillery = 1000;
    account.stock.support_equipment = 1000;
    CoreEngine.gameState.manpower = 200000;
    TrainingManager.targetArmyId = 1;
    AutomationManager.setLocalFeature('recruitment', true, 'GER');
    AutomationManager.onTick(true);
    const order = TrainingManager.queue[0];
    ({ count: TrainingManager.queue.length, target: order && order.targetArmyId, country: order && order.country, stateId: order && order.trainingStateId });
  `);
  assert.equal(result.count, 1);
  assert.equal(result.target, null);
  assert.equal(result.country, 'GER');
  assert.equal(result.stateId, '1');
});

test('徴兵アシストは装備不足では徴兵しない', (t) => {
  const f = setup();
  const result = f.run(`
    const account = ProductionManager.account('GER');
    account.stock.infantry = 0;
    account.stock.artillery = 0;
    account.stock.support_equipment = 0;
    AutomationManager.setLocalFeature('recruitment', true, 'GER');
    AutomationManager.onTick(true);
    TrainingManager.queue.length;
  `);
  assert.equal(result, 0);
});

test('師団テンプレートアシストは陸軍XPを消費して支援中隊を追加し、編集中の下書きは触らない', (t) => {
  const f = setup();
  const result = f.run(`
    const tpl = DivisionDesigner.activeTemplate();
    tpl.support = [null, null, null, null, null];
    DivisionDesigner.persist();
    const xpBefore = AutomationManager.armyXp(CoreEngine.gameState);
    AutomationManager.setLocalFeature('division', true, 'GER');
    AutomationManager.onTick(true);
    const after = DivisionDesigner.activeTemplate().support.filter(Boolean);
    const xpAfter = AutomationManager.armyXp(CoreEngine.gameState);
    DivisionDesigner.dirty = true;
    const dirtyBefore = JSON.stringify(DivisionDesigner.activeTemplate());
    AutomationManager.onTick(true);
    const dirtyAfter = JSON.stringify(DivisionDesigner.activeTemplate());
    DivisionDesigner.dirty = false;
    ({ after, xpBefore, xpAfter, dirtyBefore, dirtyAfter });
  `);
  assert.ok(result.after.includes('engineer'));
  assert.equal(result.xpBefore - result.xpAfter, 5);
  assert.equal(result.dirtyBefore, result.dirtyAfter);
});

test('装備設計アシストは研究済みモジュールで設計を保存し、XPを消費し、プレイヤーの下書きを復元する', (t) => {
  const f = setup({ designer: true });
  const result = f.run(`
    ResearchManager.techData = { infantry: [{ id:'basic_light_tank_chassis' }, { id:'artillery1' }, { id:'armor_tech_1' }, { id:'engine_tech_1' }, { id:'radio' }] };
    ResearchManager.researchedTech = new Set(['basic_light_tank_chassis', 'artillery1', 'armor_tech_1', 'engine_tech_1', 'radio']);
    CoreEngine.gameState.xp = { army: 100, navy: 100, air: 100 };
    EquipmentDesigner.draft.tank = { hull: 'lt', modules: { gun:'how' }, name: 'プレイヤー下書き' };
    const before = JSON.stringify(EquipmentDesigner.draft.tank);
    const designsBefore = EquipmentDesigner.designs.length;
    AutomationManager.setLocalFeature('design', true, 'GER');
    AutomationManager.onTick(true);
    const after = JSON.stringify(EquipmentDesigner.draft.tank);
    const saved = EquipmentDesigner.designs[EquipmentDesigner.designs.length - 1];
    ({ before, after, designsBefore, designsAfter: EquipmentDesigner.designs.length,
       saved: saved && { cat: saved.cat, country: saved.country, automated: saved.automated },
       xp: CoreEngine.gameState.xp.army });
  `);
  assert.equal(result.before, result.after);
  assert.equal(result.designsAfter, result.designsBefore + 1);
  assert.equal(result.saved.cat, 'tank');
  assert.equal(result.saved.country, 'GER');
  assert.equal(result.saved.automated, true);
  assert.ok(result.xp < 100);
});

test('全アシストをONにしても軍事作戦APIは呼ばれない', (t) => {
  const f = setup({ designer: true });
  const result = f.run(`
    const calls = [];
    const guard = (obj, name) => { if (obj && typeof obj[name] === 'function') { const orig = obj[name]; obj[name] = (...args) => { calls.push(name); return orig.apply(obj, args); }; } };
    ['execute','abort','toggleInvasion'].forEach(n => guard(BattlePlanManager, n));
    ['toggleMove','toggleFront','airdropTool','assignModal','transfer'].forEach(n => guard(ArmyRoster, n));
    FocusTreeManager.focuses = [{ id:'peace', title:'平和', prerequisites:[], completion_rewards:[{type:'add_political_power', value:10}] }];
    FocusTreeManager.focusMap = { peace: FocusTreeManager.focuses[0] };
    ResearchManager.techData = { infantry: [{ id:'infantry_weapons', prerequisites:[], year:1936 }] };
    ResearchManager.researchedTech = new Set(['infantry_weapons']);
    ProductionManager.account('GER').stock.infantry = 5000;
    AutomationManager.preset('GER', true);
    AutomationManager.onTick(true);
    AutomationManager.onTick(true);
    calls;
  `);
  assert.equal(JSON.stringify(result), '[]');
});
