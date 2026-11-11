// Run in a source-mounted Node container: node --test game/assets/test-research-tree.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assets = __dirname;
const context = vm.createContext({ window: {}, AssetRegistry: { getLocal: () => null, getGithubFromMapping: () => null } });
vm.runInContext(fs.readFileSync(path.join(assets, 'research-icons.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(assets, 'research-tree.js'), 'utf8'), context);
const tree = context.window.ResearchTreeUI;
const icons = context.window.ResearchIcons;

test('all country/category trees have finite, non-overlapping nodes and forward edges', () => {
  for (const country of ['ger', 'sov', 'jap', 'usa', 'eng', 'fra', 'ita']) {
    for (const category of Object.keys(icons.categories)) {
      const techs = JSON.parse(fs.readFileSync(path.join(assets, '..', country, 'tec/data/tech_' + category + '.json')));
      const layout = tree.layout(techs);
      const positions = [...layout.positions.values()];
      assert.equal(positions.length, techs.length);
      positions.forEach((position, index) => {
        assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
        assert.ok(position.x + tree.width <= layout.width);
        assert.ok(position.y + tree.height <= layout.height);
        positions.slice(index + 1).forEach(other => {
          assert.ok(Math.abs(position.x - other.x) >= tree.width || Math.abs(position.y - other.y) >= tree.height,
            country + '/' + category + ' overlaps');
        });
      });
      techs.forEach(tech => (tech.prerequisites || []).forEach(id => {
        if (!layout.positions.has(id)) return;
        assert.ok(layout.positions.get(tech.id).y > layout.positions.get(id).y, country + '/' + category + ' backwards edge');
      }));
    }
  }
});

test('branching dependencies and joins remain below parents', () => {
  const techs = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B', prerequisites: ['a'] },
    { id: 'c', title: 'C', prerequisites: ['a'] }, { id: 'd', title: 'D', prerequisites: ['b', 'c'] }];
  const { positions } = tree.layout(techs);
  assert.notEqual(positions.get('b').x, positions.get('c').x);
  assert.ok(positions.get('d').y > positions.get('b').y);
});

test('missing references and cycles never recurse indefinitely', () => {
  const { positions } = tree.layout([{ id: 'a', title: 'A', prerequisites: ['b'] },
    { id: 'b', title: 'B', prerequisites: ['a', 'missing'] }]);
  assert.equal(positions.size, 2);
  assert.ok([...positions.values()].every(position => Number.isFinite(position.y)));
});

test('eight category fallbacks are distinct and local asset keys take precedence', () => {
  assert.equal(new Set(Object.keys(icons.categories).map(category => icons.resolve({ id: 'unknown' }, category).src)).size, 8);
  assert.ok(icons.categories.support, '支援カテゴリが登録されている');
  assert.equal(icons.categories.support.label, '支援');
  assert.equal(icons.resolve({ id: 'unknown' }, 'support').source, 'category-drawing');
  context.AssetRegistry.getLocal = (category, key) => category === 'technology_icons' && key === 'kar98k' ? 'assets/technology/Kar98k.png' : null;
  assert.equal(icons.resolve({ id: 'kar98k' }, 'infantry').src, 'assets/technology/Kar98k.png');
  assert.equal(icons.resolve({ id: 'kar98k' }, 'infantry').github, null);
  // ローカル未保存でもGitHub上の同パスへフォールバックする
  context.AssetRegistry.getLocal = () => null;
  context.AssetRegistry.getGithubFromMapping = (category, key) =>
    key === 'kar98k' ? 'https://iekei.github.io/iekei1/game/assets/technology/Kar98k.png' : null;
  const github = icons.resolve({ id: 'kar98k' }, 'infantry');
  assert.equal(github.src, 'https://iekei.github.io/iekei1/game/assets/technology/Kar98k.png');
  assert.equal(github.github, null);
});

test('special-project technologies present special_projects blueprint plates', () => {
  const data = require('./game-asset-data.js');
  const byId = new Map(JSON.parse(require('fs').readFileSync(path.join(assets, '..', 'ger/tec/data/tech_air.json')))
    .map(tech => [tech.id, tech]));
  const air = [...byId.values()];
  const jet = air.find(tech => tech.id === 'sp_centrifugal_jet_tech');
  assert.equal(icons.blueprintFor(jet), 'Sp_air_jet_engine.png');
  assert.ok(data.projects.includes(icons.blueprintFor(jet)), 'plate ships in game/assets/special_projects');

  // designations that keep their plain 64x64 equipment icon must not gain a plate
  assert.equal(icons.blueprintFor(air.find(tech => tech.id === 'fighter1') || { id: 'fighter1' }), null);

  // asset_key 照合 (大文字小文字を無視) — HoI4 側のキーで書かれた記述も引ける
  assert.equal(icons.blueprintFor({ asset_key: 'sp_aircraft_centrifugal_jet' }), 'Sp_air_jet_engine.png');
  assert.equal(icons.blueprintFor({ icon_key: 'SP_AIRCRAFT_CENTRIFUGAL_JET' }), 'Sp_air_jet_engine.png');

  const resolved = icons.withBlueprint(jet, 'air');
  assert.equal(resolved.blueprint, 'Sp_air_jet_engine.png');
  assert.match(resolved.blueprintSrc, /assets\/special_projects\/Sp_air_jet_engine\.png$/);
  // 設計図が無い技術には余計なキーを足さない
  assert.equal(icons.withBlueprint({ id: 'fighter1' }, 'air').blueprint, undefined);
});

test('every mapped blueprint exists in the artwork manifest', () => {
  const data = require('./game-asset-data.js');
  const files = new Set(data.projects);
  const mapped = Object.values(icons.projectBlueprints);
  assert.ok(mapped.length >= 70, 'the special-project map covers the major tech lines');
  mapped.forEach(file => assert.ok(files.has(file), file + ' is missing from game/assets/special_projects'));
});
