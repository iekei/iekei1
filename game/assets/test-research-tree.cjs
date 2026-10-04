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

test('seven category fallbacks are distinct and local asset keys take precedence', () => {
  assert.equal(new Set(Object.keys(icons.categories).map(category => icons.resolve({ id: 'unknown' }, category).src)).size, 7);
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
