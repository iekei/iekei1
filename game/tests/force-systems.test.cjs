'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ForceSystems = require('../assets/force-systems.js');
const root = path.resolve(__dirname, '..');

test('doctrine JSON contains complete force-specific effects and local icons', () => {
  const payload = JSON.parse(fs.readFileSync(path.join(root, 'assets/doctrine_data.json'), 'utf8'));
  const effects = {
    army: ['orgRecovery', 'softAttack', 'hardAttack', 'breakthrough', 'defense'],
    navy: ['visibility', 'fleetAttack', 'submarineAttack', 'antiSubmarine', 'carrierSortie'],
    air: ['airSuperiority', 'casDamage', 'bombingAccuracy', 'dogfightEvasion', 'allWeather']
  };
  for (const [force, keys] of Object.entries(effects)) {
    const doctrines = payload.doctrines.filter(item => item.force === force);
    assert.ok(doctrines.length > 0);
    for (const doctrine of doctrines) {
      for (const key of keys) assert.equal(typeof doctrine.effects[key], 'number');
      assert.ok(fs.existsSync(path.join(root, doctrine.icon)));
    }
  }
});

test('commander type filtering accepts explicit categories and known legacy types only', () => {
  assert.equal(ForceSystems.cardType({ type: 'army_leader' }), 'army_leader');
  assert.equal(ForceSystems.cardType({ type: 'navy_leader' }), 'navy_leader');
  assert.equal(ForceSystems.cardType({ type: 'air_leader' }), 'air_leader');
  assert.equal(ForceSystems.cardType({ type: 'general' }), 'army_leader');
  assert.equal(ForceSystems.cardType({ type: 'navy' }), 'navy_leader');
  assert.equal(ForceSystems.cardType({ type: 'air' }), 'air_leader');
  assert.equal(ForceSystems.cardType({ type: 'politician' }), null);
  assert.equal(ForceSystems.cardType({}), null);
});

test('air range blocks distant targets unless the selected design has a drop tank', () => {
  global.CoreEngine = { gameState: { country: 'GER', forceSystems: { doctrines: {} } } };
  global.EquipmentDesigner = {
    designs: [{ id: 'tank-range', cat: 'plane', modules: { fuel: 'drop_tank' } }]
  };
  global.MapRenderer = { mapW: 4000 };
  const wing = { id: 'air1', type: 'air', base: [100, 100], aircraftCount: 10 };
  global.BattlePlanManager = {
    air: [wing],
    airWingReady: unit => Number(unit.aircraftCount) > 0,
    execute() {},
    endDrag() {}
  };
  ForceSystems.patchAirRange();
  assert.equal(BattlePlanManager.airRange(wing), 320);
  assert.equal(BattlePlanManager.checkAirRange(wing, [500, 100]), false);
  wing.designId = 'tank-range';
  assert.equal(BattlePlanManager.airRange(wing), 608);
  assert.equal(BattlePlanManager.checkAirRange(wing, [500, 100]), true);
  assert.equal(BattlePlanManager.checkAirRange(wing, [800, 100]), false);
  assert.equal(BattlePlanManager.checkAirRange(wing, { x1: 100, y1: 100, x2: 900, y2: 100 }), false);
  assert.equal(BattlePlanManager.checkAirRange(wing, { x1: 200, y1: 200, x2: 400, y2: 400 }), true);
});

test('commander assignment rejects mismatched categories and prevents duplicate appointments', () => {
  global.CoreEngine = { gameState: { country: 'GER', forceSystems: { doctrines: {} } } };
  global.BattlePlanManager = {
    armies: [{ id: 1 }, { id: 2 }], navy: [{ id: 'nav1' }], air: [{ id: 'air1' }],
    renderPanel() {}
  };
  global.CardSystem = {
    hiredCards: [
      { id: 'land', country: 'GER', type: 'army_leader', name: 'Land', stats: { attack: 5 } },
      { id: 'sea', country: 'GER', type: 'navy_leader', name: 'Sea' }
    ]
  };
  global.MultiplayerManager = { broadcast() {} };
  global.GameUI = { notify() {}, closeModal() {} };
  global.document = { getElementById() { return null; } };
  assert.equal(ForceSystems.assignCommander('navy', 'nav1', 'land', 'GER'), false);
  assert.equal(ForceSystems.assignCommander('army', 1, 'land', 'GER'), true);
  assert.equal(ForceSystems.assignCommander('army', 2, 'land', 'GER'), false);
  assert.equal(ForceSystems.assignCommander('navy', 'nav1', 'sea', 'GER'), true);
});

test('occupation integration progresses three points per fourteen game days', () => {
  const date = new Date(1936, 0, 1);
  global.CoreEngine = {
    gameState: {
      country: 'JAP', date, puppets: [{ tag: 'MAN', overlord: 'JAP' }],
      forceSystems: { doctrines: {}, occupations: {}, unifiedCountries: [], lastOccupationDay: null }
    }
  };
  global.MapRenderer = {
    states: { man: { owner: 'MAN', name: 'Manchukuo', b: { arms_factory: 2, industrial_complex: 3 } } }
  };
  global.WindowManager = { windows: new Map() };
  ForceSystems.onTick();
  assert.equal(CoreEngine.gameState.forceSystems.occupations.MAN.progress, 0);
  date.setDate(date.getDate() + 14);
  ForceSystems.onTick();
  assert.equal(CoreEngine.gameState.forceSystems.occupations.MAN.progress, 3);
  date.setDate(date.getDate() + 28);
  ForceSystems.onTick();
  assert.equal(CoreEngine.gameState.forceSystems.occupations.MAN.progress, 9);
});

test('unification transfers subject states and factories exactly once', () => {
  global.CoreEngine = {
    gameState: {
      country: 'JAP', civilianFactories: 4, militaryFactories: 5, dockyards: 1,
      resources: { oil: 2 }, strategy: { provinceOwners: { 7: 'MAN' } },
      puppets: [{ tag: 'MAN', overlord: 'JAP' }],
      forceSystems: {
        doctrines: {}, occupations: { MAN: { progress: 100, nextDay: 1, stateIds: ['man'] } },
        unifiedCountries: [], lastOccupationDay: 1
      }
    },
    renderStats() {}
  };
  const state = {
    owner: 'MAN', puppetOf: 'JAP', provinces: [7],
    b: { arms_factory: 2, industrial_complex: 3, dockyard: 1 },
    resources: { oil: 4 }
  };
  global.MapRenderer = { states: { man: state }, invalidateModes() {} };
  global.MultiplayerManager = { broadcast() {} };
  global.GameUI = { notify() {} };
  global.document = { getElementById() { return null; } };
  assert.equal(ForceSystems.unifyCountry('MAN'), true);
  assert.equal(state.owner, 'JAP');
  assert.equal(CoreEngine.gameState.civilianFactories, 7);
  assert.equal(CoreEngine.gameState.militaryFactories, 7);
  assert.equal(CoreEngine.gameState.dockyards, 2);
  assert.equal(CoreEngine.gameState.resources.oil, 6);
  assert.equal(ForceSystems.unifyCountry('MAN'), false);
  assert.equal(CoreEngine.gameState.civilianFactories, 7);
  ForceSystems.ensureState();
  assert.equal(ForceSystems.subjectTags().includes('MAN'), false);
});
