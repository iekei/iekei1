const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = __dirname;
const data = require('./game-asset-data.js');
const context = vm.createContext({window:{}, GameAssetData:data});
vm.runInContext(fs.readFileSync(path.join(assets,'asset-registry.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(assets,'game-visuals.js'),'utf8'),context);
const visuals = context.window.GameVisuals;
const exists = (folder,file) => assert.ok(fs.existsSync(path.join(assets,folder,file)),folder+'/'+file);

test('uploaded artwork inventory has real PNG files and Japanese identity labels', () => {
  for (const file of data.flags) exists('flags',file);
  for (const file of data.projects) exists('special_projects',file);
  for (const category of ['operatives','scientists']) {
    assert.equal(new Set(data[category].map(p=>p.id)).size,data[category].length);
    for (const person of data[category]) {
      exists(category,person.file);
      assert.match(person.name,/[ぁ-んァ-ヶ一-龠]/,person.file);
    }
  }
  for (const [file,dimensions] of Object.entries(data.units)) {
    const bytes=fs.readFileSync(path.join(assets,'land_units',file));
    assert.equal(bytes.readUInt32BE(16),dimensions.width);
    assert.equal(bytes.readUInt32BE(20),dimensions.height);
  }
});

test('all world-state owner flags and political variants resolve locally', () => {
  const states=JSON.parse(fs.readFileSync(path.join(assets,'../mapdata/states.json')));
  const tags=new Set(Object.values(states).map(s=>s.owner).filter(Boolean));
  assert.ok(tags.size>=80);
  for (const tag of tags) exists('flags',visuals.flagFile(tag));
  assert.equal(visuals.flagFile('GER','fascism'),'GER_fascism.png');
  assert.equal(visuals.flagFile('SOV','communism'),'SOV_communism.png');
  assert.equal(visuals.flagFile('USA','democracy'),'USA_democratic.png');
  assert.equal(visuals.flagFile('../missing'),null);
  assert.doesNotMatch(visuals.flag('<script>'),/<script>/);
});

test('operative choices prefer the current country and exclude recruited identities across aliases', () => {
  assert.equal(visuals.operativeChoices('JAP')[0].country,'JAP');
  const first=visuals.operativeChoices('JAP')[0];
  assert.ok(!visuals.operativeChoices('JAP',[first.id]).some(p=>p.id===first.id));
  assert.ok(!visuals.operativeChoices('USA',['fra_rene_joyeuse']).some(p=>p.name==='ルネ・ジョワユーズ'));
});

test('every existing special project has a matching or labeled generic portrait and local blueprint', () => {
  for (const tag of ['ger','sov','jap','usa','eng','fra','ita']) {
    const science=JSON.parse(fs.readFileSync(path.join(assets,`../${tag}/tec/special/data/science.json`)));
    for (const sci of science.scientists) {
      const person=visuals.scientist(sci);
      exists('scientists',person.file);
      assert.match(person.name,/[ぁ-んァ-ヶ一-龠]/);
      if(person.generic) assert.equal(person.name,sci.name,'Do not label a different real person as this scientist');
      assert.match(visuals.blueprint(sci),/assets\/special_projects\//,sci.id);
      exists('special_projects',visuals.scienceLinks[sci.id][1]);
    }
  }
});

test('battalion sprites use uploaded art; 152px sheets retain full width behind a left 76px viewport', () => {
  for (const id of Object.keys(visuals.unitFiles)) {
    exists('land_units',visuals.unitFiles[id]);
    assert.match(visuals.unit({id,name:'歩兵'}),/assets\/land_units\//);
  }
  const original=data.units['Artillery.png'];
  try {
    data.units['Artillery.png']={width:152,height:42};
    assert.match(visuals.unit({id:'artillery',name:'砲兵'}),/width:152px;left:0px/);
    data.units['Artillery.png']={width:76,height:42};
    assert.match(visuals.unit({id:'artillery',name:'砲兵'}),/width:76px;left:0px/);
  } finally { data.units['Artillery.png']=original; }
  const css=fs.readFileSync(path.join(assets,'game-visuals.css'),'utf8');
  assert.match(css,/\.land-unit-icon\s*\{[^}]*width:76px;[^}]*overflow:hidden/);
});
