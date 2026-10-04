const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const Catalog = require('./research-icon-catalog.js');
const game = path.resolve(__dirname, '..');
const mappings = ['technology_icons', 'equipment_icons'].map(id => JSON.parse(fs.readFileSync(path.join(__dirname, `mappings/${id}.json`))));
const catalog = Catalog.create(mappings);
const countries = ['ger', 'sov', 'jap', 'usa', 'eng', 'fra', 'ita'];
const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

test('every mapping and alias references an uploaded PNG with the exact filename', () => {
  for (const mapping of mappings) {
    assert.equal(mapping.count, mapping.images.length);
    assert.equal(new Set(mapping.images.map(image => image.key)).size, mapping.count);
    for (const image of mapping.images) {
      assert.equal(path.basename(image.local), image.name);
      const bytes = fs.readFileSync(path.join(game, image.local));
      assert.deepEqual(bytes.subarray(0, 8), pngSignature, image.local);
      assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, image.local);
    }
    for (const [alias, key] of Object.entries(mapping.aliases || {})) {
      assert.ok(catalog.resolve([alias]), `${alias} → ${key}`);
    }
  }
});

test('all 49 country/category datasets have exact images without category fallback', () => {
  const context = vm.createContext({ window: {}, ResearchIconCatalog: Catalog });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'research-icons.js'), 'utf8'), context);
  const icons = context.window.ResearchIcons;
  icons.catalog = catalog;
  for (const country of countries) for (const category of categories) {
    const techs = JSON.parse(fs.readFileSync(path.join(game, country, `tec/data/tech_${category}.json`)));
    for (const tech of techs) {
      const image = icons.resolve(tech, category);
      assert.equal(image.matched, true, `${country}/${category}/${tech.id}`);
      assert.ok(fs.existsSync(path.join(game, image.src)), image.src);
    }
  }
});

test('texture paths, case, extensions, sprite names and technology aliases resolve identically', () => {
  for (const key of ['light_plane_3', 'Light_Plane_3.PNG', 'gfx\\interface\\technologies\\light_plane_3.dds', 'GFX_basic_small_airframe_medium', 'basic_small_airframe']) {
    assert.equal(catalog.resolve([key]).local, 'assets/technology/light_plane_3.png');
  }
  assert.equal(catalog.resolve(['kar98k']).key, 'infantry_weapons');
  assert.equal(catalog.resolve(['type38_rifle']).key, 'infantry_weapons');
  assert.equal(catalog.resolve(['unknown_texture']), null);
});

test('bundled standard and BBA sources convert to fully mapped images', async () => {
  const converter = await import('../tools/hoi4-tech-converter.mjs');
  const sprites = converter.buildSpriteMap(path.join(game, 'tools/hoi4-source/Technologies.txt'));
  for (const [file, count] of [['air_techs.txt', 30], ['bba_air_techs.txt', 41]]) {
    const techs = converter.convertTechFile(path.join(game, 'tools/hoi4-source', file), sprites, 'air');
    assert.equal(techs.length, count);
    assert.equal(converter.checkImages(techs).missing, 0);
    for (const tech of techs) assert.ok(catalog.resolve([tech.asset_key]));
    assert.ok(techs.some(tech => tech.prerequisites.length));
  }
});

test('missing converter images fail the CLI and preserve the existing output', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'research-icons-'));
  try {
    fs.writeFileSync(path.join(temp, 'tech.txt'), 'technologies = { unknown_test_tech = { folder = { position = { x = 1 y = 1 } } } }');
    fs.writeFileSync(path.join(temp, 'sprites.txt'), 'spriteTypes = {}');
    const output = path.join(temp, 'existing.json');
    fs.writeFileSync(output, 'preserve me');
    const result = spawnSync(process.execPath, [path.join(game, 'tools/hoi4-tech-converter.mjs'), '--tech', path.join(temp, 'tech.txt'), '--sprites', path.join(temp, 'sprites.txt'), '--output', output], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unknown_test_tech/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'preserve me');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
