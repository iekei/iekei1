const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
test('historical map has real geographic countries and pre-Anschluss Austria', () => {
  const geo = JSON.parse(fs.readFileSync(path.join(root,'game/data/maps/world-1936.geojson')));
  assert.equal(geo.metadata.projection, 'EPSG:4326');
  const names = new Set(geo.features.map(f => f.properties.name));
  for (const name of ['Austria','Czechoslovakia','Germany','Ethiopia','USSR','Manchukuo']) assert.ok(names.has(name));
  assert.ok(geo.features.length > 200);
});
test('seven focus trees have unique IDs, own-country prerequisites, no cycles', async () => {
  const source = fs.readFileSync(path.join(root,'game/js/data/major-focuses.js'),'utf8');
  const { MAJOR_FOCUSES: trees } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  assert.equal(Object.keys(trees).length,7);
  const ids = new Set();
  for (const [tag,nodes] of Object.entries(trees)) {
    const byId = Object.fromEntries(nodes.map(n => [n.id,n]));
    const visit = (n, stack = new Set()) => {
      assert.ok(!stack.has(n.id));
      for (const pre of n.prerequisites) { assert.ok(byId[pre]); visit(byId[pre], new Set(stack).add(n.id)); }
    };
    for (const n of nodes) { assert.equal(n.tag,tag); assert.ok(!ids.has(n.id)); ids.add(n.id); assert.ok(n.cost>0); visit(n); }
  }
});

test('completion_reward objects and HOI reward scripts change actual resources', async () => {
  let source = fs.readFileSync(path.join(root,'game/js/effects.js'),'utf8').replace(/^import .*;$/gm,'');
  source = "const toast=()=>{}; const I18N={t:x=>x}; const nationName=x=>x;\n"+source;
  const { EffectEngine } = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const state = { factories:{civ:10,mil:5,dock:2},convoys:{total:20,used:5},fuel:{stock:100,max:10000},pp:0,manpower:1000,stability:50,warSupport:40,bus:{emit(){}} };
  const effects = new EffectEngine(state);
  effects.execute({add_civilian_factories:2,add_military_factories:3,add_dockyards:1,add_fuel:400,add_convoys:30,add_manpower:50000});
  assert.deepEqual(state.factories,{civ:12,mil:8,dock:3}); assert.equal(state.convoys.total,50); assert.equal(state.fuel.stock,500); assert.equal(state.manpower,51000);
  effects.execute('completion_reward = { add_stability = 5; add_war_support = 8; add_command_power = 25 }');
  assert.equal(state.stability,55); assert.equal(state.warSupport,48); assert.equal(state.commandPower,25);
  effects.execute('add_political_power = 50; add_stability = 3');
  assert.equal(state.pp,50); assert.equal(state.stability,58);
  effects.execute({add_fuel:999999}); assert.equal(state.fuel.stock,10000);
});
