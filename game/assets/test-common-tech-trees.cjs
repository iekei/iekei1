const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Progress = require('./research-progress.js');
const game = path.resolve(__dirname, '..');
const categories = ['infantry','armor','artillery','naval','air','engineering','industry'];
const data = Object.fromEntries(categories.map(category=>[category,JSON.parse(fs.readFileSync(path.join(game,`ger/tec/data/tech_${category}.json`)))]));

test('all seven nations and generated output use the full shared trees', async () => {
  const {buildTrees} = await import('../tools/build-common-tech-trees.mjs');
  const expected = buildTrees();
  for (const category of categories) {
    assert.ok(expected[category].length >= 16, category);
    for (const directory of ['ger/tec/data','sov/tec/data','jap/tec/data','usa/tec/data','eng/tec/data','fra/tec/data','ita/tec/data','tools/hoi4-output']) {
      const actual = JSON.parse(fs.readFileSync(path.join(game,directory,`tech_${category}.json`)));
      assert.deepEqual(actual, expected[category], directory+'/'+category);
    }
  }
});

test('every technology has a unique ID, valid research time and a reachable prerequisite chain', () => {
  const all = Object.values(data).flat();
  assert.equal(new Set(all.map(t=>t.id)).size, all.length);
  for (const [category,techs] of Object.entries(data)) {
    const unlocked = new Set();
    for (let pass=0;pass<techs.length;pass++) {
      for (const tech of techs) {
        assert.ok(Number.isFinite(tech.year) && tech.title && tech.asset_key);
        assert.ok(Number.isInteger(tech.research_time) && tech.research_time>0);
        if (tech.prerequisites.every(id=>unlocked.has(id))) unlocked.add(tech.id);
      }
    }
    assert.equal(unlocked.size,techs.length,category);
    for (const tech of techs) for (const id of tech.prerequisites) assert.ok(techs.some(t=>t.id===id),id);
  }
});

test('every retained legacy ID translates to a current technology', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(game,'tools/legacy-research-ids.json')));
  for (const [oldId,newId] of Object.entries(legacy)) {
    assert.ok(Progress.restore({researched:[oldId]},data).researched.includes(newId),oldId);
  }
});

test('save migration keeps completion, prerequisite access and active progress; removes stale/duplicate slots', () => {
  const old = {researched:['kar98k'],researching:{1:{techId:'mg42',progress:50,total:100},2:{techId:'mg42',progress:75,total:100},3:{techId:'missing',progress:10,total:100},6:{techId:'radio',progress:1,total:100}}};
  const saved = JSON.stringify(old);
  const result = Progress.restore(old,data,5);
  assert.equal(JSON.stringify(old),saved);
  assert.ok(result.researched.includes('infantry_weapons'));
  assert.ok(result.researched.includes('infantry_equipment_0'));
  assert.deepEqual(Object.keys(result.researching),['1']);
  const active = result.researching[1];
  assert.equal(active.techId,'support_weapons3');
  assert.equal(active.progress,active.total/2);
  assert.ok(result.researched.includes('support_weapons2'));
  assert.deepEqual(Progress.restore(result,data,5),result);
});

test('modern save progress survives unchanged, invalid progress is bounded', () => {
  const result = Progress.restore({researched:['radio'],researching:{1:{techId:'radio_detection',progress:25,total:125},2:{techId:'nuclear_reactor',progress:Infinity,total:0}}},data,5);
  assert.equal(result.researching[1].progress,25);
  assert.equal(result.researching[2].progress,0);
  assert.deepEqual(result.researched,['radio']);
});

test('real ResearchManager locks prerequisites, finishes research and unlocks the next tier', () => {
  const vm = require('node:vm');
  const html = fs.readFileSync(path.join(game,'index.html'),'utf8');
  const manager = html.slice(html.indexOf('class ResearchManager {'),html.indexOf('// Module 15b:'));
  const context = vm.createContext({
    CoreEngine:{gameState:{researchSlots:3},log(){}},
    GameUI:{notify(){},currentTab:'research'}, MultiplayerManager:{broadcast(){}},
    WindowManager:{windows:new Map()},ResearchTreeUI:{render(){}},
    document:{getElementById(){return {innerHTML:''};}}
  });
  vm.runInContext(manager+'\nglobalThis.Manager = ResearchManager;',context);
  const Manager = context.Manager;
  Manager.techData = data;
  const root = Manager.findTech('infantry_equipment_0');
  const next = Manager.findTech('infantry_weapons');
  Manager.selectTech(next);
  assert.equal(Object.keys(Manager.researching).length,0);
  Manager.selectTech(root);
  assert.equal(Manager.researching[1].techId,root.id);
  for(let day=0;day<root.research_time;day++) Manager.onTick();
  assert.equal(Manager.researchedTech.has(root.id),true);
  assert.equal(Object.keys(Manager.researching).length,0);
  Manager.selectTech(next);
  assert.equal(Manager.researching[1].techId,next.id);
});
