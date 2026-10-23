"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/strategy-fixture.cjs");
function setup({
  width = 7,
  height = 5,
  front = [0, 1, 2, 3, 4],
  goals = [0, 1, 2, 3, 4],
  divisions = 10,
} = {}) {
  const f = fixture();
  f.load("assets/area-battle-plan.js");
  f.run(`
 var W=${width},H=${height};var pidAt=(x,y)=>1+y*W+x;
 MapRenderer.mapW=W*10;MapRenderer.mapH=H*10;MapRenderer.provinces={types:['land','sea'],terr:['plains'],p:{}};
 MapRenderer.provNeighbors=new Map();MapRenderer.provCentroid=new Map();MapRenderer.provToState=new Map();MapRenderer.stateCenter=new Map();MapRenderer.provinceBoundarySegments=new Map();
 MapRenderer.states={'1':{owner:'GER',name:'Home',provinces:[],b:{}},'2':{owner:'POL',name:'Goal',provinces:[],b:{}}};
 CoreEngine.gameState.strategy.provinceOwners={};CoreEngine.gameState.atWar=['POL'];CoreEngine.gameState.date=new Date(1936,0,1);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=pidAt(x,y),sid=x<2?'1':'2';MapRenderer.provinces.p[p]=[0,0,0,0,0,0];MapRenderer.provCentroid.set(p,[x*10+5,y*10+5]);MapRenderer.provToState.set(p,sid);MapRenderer.states[sid].provinces.push(p);MapRenderer.provNeighbors.set(p,new Set([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([xx,yy])=>xx>=0&&xx<W&&yy>=0&&yy<H).map(([xx,yy])=>pidAt(xx,yy))));}
 MapRenderer.provinceAt=(x,y)=>{const xx=Math.floor(x/10),yy=Math.floor(y/10);return xx>=0&&xx<W&&yy>=0&&yy<H?pidAt(xx,yy):null;};
 var frontRows=${JSON.stringify(front)},goalRows=${JSON.stringify(goals)};
 var areaArmy={id:1,name:'Area Army',base:[15,frontRows[0]*10+5],positionPid:pidAt(1,frontRows[0]),frontline:frontRows.map(y=>[15,y*10+5]),offensiveLine:{pids:goalRows.map(y=>pidAt(W-1,y)),points:goalRows.map(y=>[(W-1)*10+5,y*10+5])},arrow:{from:[15,5],to:[(W-1)*10+5,goalRows[0]*10+5]},divisions:Array.from({length:${divisions}},(_,i)=>{const y=frontRows[i%frontRows.length];return {id:i+1,pid:pidAt(1,y),x:15,y:y*10+5,org:60,maxOrg:60,comp:{infantry:6}};}),executing:false,planning:.2};
 BattlePlanManager.armies=[areaArmy];BattlePlanManager.selectedArmyId=1;BattleManager.battles=[];
 var advance=()=>{for(const battle of [...BattleManager.battles]){battle.advantage=.8;BattleManager.resolve(battle);}AreaBattlePlan.tick(areaArmy,24);};
 `);
  return f;
}
test("area offensive starts concurrent province battles with disjoint participants and partial firepower", () => {
  const { run } = setup();
  assert.equal(run("AreaBattlePlan.execute(1)"), true);
  assert.ok(run("BattleManager.battles.length") >= 3);
  assert.equal(
    run("new Set(BattleManager.battles.flatMap(b=>b.divisionIds)).size"),
    run("BattleManager.battles.reduce((n,b)=>n+b.divisionIds.length,0)"),
  );
  assert.equal(
    run(
      "BattleManager.battles.every(b=>b.divisionIds.every(id=>MapRenderer.provNeighbors.get(areaArmy.divisions.find(d=>d.id===id).pid).has(b.provId)))",
    ),
    true,
  );
  assert.equal(
    run(
      "BattleManager.battles.every(b=>b.softAttack<BattleManager.attackProfile(areaArmy).soft*(1+areaArmy.planning))",
    ),
    true,
  );
  assert.equal(run("areaArmy.route"), null);
});
test("a local victory moves only its participants and losses affect only that group", () => {
  const { run } = setup();
  run(
    "AreaBattlePlan.execute(1);var battle=BattleManager.battles[0];var ids=battle.divisionIds.slice();var before=new Map(areaArmy.divisions.map(d=>[d.id,d.pid]));battle.advantage=.8;BattleManager.resolve(battle);",
  );
  assert.equal(
    run(
      "areaArmy.divisions.filter(d=>!ids.includes(d.id)).every(d=>d.pid===before.get(d.id)&&d.org===60&&d.equipmentStrength===undefined)",
    ),
    true,
  );
  assert.equal(
    run(
      "areaArmy.divisions.filter(d=>ids.includes(d.id)).every(d=>d.pid===battle.provId&&d.org===50&&d.equipmentStrength<100)",
    ),
    true,
  );
  assert.equal(run("MapRenderer.ownerOf(battle.provId)"), "GER");
  assert.equal(run("MapRenderer.ownerOf(pidAt(3,0))"), "POL");
});
test("province graph offensive spreads to every target lane and holds captured ground", () => {
  const { run } = setup();
  run(
    "AreaBattlePlan.execute(1);for(let i=0;i<60&&areaArmy.executing;i++)advance();",
  );
  assert.equal(
    run('areaArmy.offensiveLine.pids.every(p=>MapRenderer.ownerOf(p)==="GER")'),
    true,
  );
  assert.equal(
    run('areaArmy.areaPlan.corridor.every(p=>MapRenderer.ownerOf(p)==="GER")'),
    true,
  );
  assert.equal(run("areaArmy.executing"), false);
  assert.equal(run("areaArmy.progress"), 100);
  run(
    "var held=areaArmy.divisions.map(d=>d.pid);for(let i=0;i<5;i++)AreaBattlePlan.tick(areaArmy,24)",
  );
  assert.equal(run("areaArmy.divisions.every((d,i)=>d.pid===held[i])"), true);
});
test("fan-out and convergence adapt frontier width in graph space, not a single arrow", () => {
  for (const spec of [
    { front: [2], goals: [0, 1, 2, 3, 4] },
    { front: [0, 1, 2, 3, 4], goals: [2] },
  ]) {
    const { run } = setup(spec);
    assert.equal(run("AreaBattlePlan.execute(1)"), true);
    assert.equal(run("areaArmy.areaPlan.sources.length"), spec.front.length);
    assert.equal(run("areaArmy.areaPlan.goals.length"), spec.goals.length);
    run("for(let i=0;i<100&&areaArmy.executing;i++)advance()");
    assert.equal(
      run(
        'areaArmy.offensiveLine.pids.every(p=>MapRenderer.ownerOf(p)==="GER")',
      ),
      true,
      JSON.stringify(spec),
    );
    assert.equal(run("areaArmy.executing"), false);
  }
});
test("front edges stay scoped and every segment separates adjacent owned/enemy provinces", () => {
  const { run } = setup({ front: [1], goals: [1], divisions: 2 });
  run("AreaBattlePlan.execute(1);advance();");
  assert.equal(
    run(
      'areaArmy.areaPlan.edgePairs.every(([a,b])=>MapRenderer.ownerOf(a)==="GER"&&MapRenderer.ownerOf(b)==="POL"&&MapRenderer.provNeighbors.get(a).has(b)&&areaArmy.areaPlan.corridor.includes(a)&&areaArmy.areaPlan.corridor.includes(b))',
    ),
    true,
  );
  assert.equal(run("areaArmy.areaPlan.frontier.includes(pidAt(1,4))"), false);
  assert.equal(
    run("areaArmy.areaPlan.edgePairs.some(([a])=>a===pidAt(2,1))"),
    true,
  );
});
test("neutral provinces, water, disconnected islands and peace block offensive execution", () => {
  for (const obstacle of [
    "CoreEngine.gameState.atWar=[]",
    "for(let y=0;y<H;y++)CoreEngine.gameState.strategy.provinceOwners[pidAt(3,y)]='SOV'",
    "for(let y=0;y<H;y++)MapRenderer.provinces.p[pidAt(3,y)][3]=1",
  ]) {
    const { run } = setup();
    run(obstacle);
    assert.equal(run("AreaBattlePlan.execute(1)"), false, obstacle);
    assert.equal(run("BattleManager.battles.length"), 0);
  }
});
test("redeployment advances only one adjacent owned province per movement day", () => {
  const { run } = setup();
  run(
    "areaArmy.divisions.forEach(d=>{d.pid=pidAt(0,0);d.x=5;d.y=5;});AreaBattlePlan.stage(areaArmy);var before=areaArmy.divisions.map(d=>d.pid);AreaBattlePlan.tick(areaArmy,1);",
  );
  assert.equal(
    run(
      "areaArmy.divisions.every((d,i)=>d.pid===before[i]||MapRenderer.provNeighbors.get(before[i]).has(d.pid))",
    ),
    true,
  );
  run(
    "var once=areaArmy.divisions.map(d=>d.pid);AreaBattlePlan.tick(areaArmy,1);",
  );
  assert.equal(run("areaArmy.divisions.every((d,i)=>d.pid===once[i])"), true);
});
test("defeat pauses only participating divisions; abort cancels every parallel battle", () => {
  const { run } = setup();
  run(
    "AreaBattlePlan.execute(1);var failed=BattleManager.battles[0];failed.advantage=-.5;BattleManager.resolve(failed);",
  );
  assert.equal(run("areaArmy.executing"), true);
  assert.ok(run("BattleManager.battles.length") > 0);
  assert.equal(
    run(
      "areaArmy.divisions.filter(d=>failed.divisionIds.includes(d.id)).every(d=>d.planCooldown===24)",
    ),
    true,
  );
  run(
    "BattlePlanManager.abort(1);var held=areaArmy.divisions.map(d=>d.pid);AreaBattlePlan.tick(areaArmy,24)",
  );
  assert.equal(run("BattleManager.battles.length"), 0);
  assert.equal(run("areaArmy.divisions.every((d,i)=>d.pid===held[i])"), true);
});
test("saved area plans and participant battles round-trip as JSON and resume", () => {
  const { run } = setup();
  run(
    "AreaBattlePlan.execute(1);var saved=JSON.stringify(StrategyGame.collect());StrategyGame.apply(JSON.parse(saved));areaArmy=BattlePlanManager.armies[0];for(let i=0;i<80&&areaArmy.executing;i++)advance();",
  );
  assert.equal(run("areaArmy.executing"), false);
  assert.equal(
    run('areaArmy.areaPlan.goals.every(p=>MapRenderer.ownerOf(p)==="GER")'),
    true,
  );
});
test("target stroke selects multiple touching provinces; dragging the line never executes an order", () => {
  const { run } = setup();
  assert.equal(run("AreaBattlePlan.setLine(areaArmy,[[65,5],[65,45]])"), true);
  assert.equal(run("areaArmy.offensiveLine.pids.length"), 5);
  assert.equal(run("areaArmy.executing"), false);
  assert.equal(run("BattleManager.battles.length"), 0);
});
test("pixel adjacency is symmetric and boundaries follow exact shared raster edges including wrap", () => {
  const { run } = setup();
  run(
    "MapRenderer.mapW=3;MapRenderer.mapH=2;MapRenderer.idMap=new Uint16Array([1,1,2,1,3,2]);MapRenderer.buildAdjacency();",
  );
  assert.equal(
    run(
      "[...MapRenderer.provNeighbors].every(([a,ns])=>[...ns].every(b=>MapRenderer.provNeighbors.get(b).has(a)))",
    ),
    true,
  );
  assert.equal(
    run('MapRenderer.provinceBoundarySegments.get("1:2").includes(2)'),
    true,
  );
  assert.equal(
    run('MapRenderer.provinceBoundarySegments.get("1:2").length>4'),
    true,
  );
});
test("a narrow initial front expands only as provinces are reached, then converges for a narrow goal", () => {
  const narrow = setup({ front: [2], goals: [0, 1, 2, 3, 4] });
  narrow.run(
    "AreaBattlePlan.execute(1);var initialWidth=areaArmy.areaPlan.frontier.length;var widest=initialWidth;for(let i=0;i<45&&areaArmy.executing;i++){advance();widest=Math.max(widest,areaArmy.areaPlan.frontier.length);}",
  );
  assert.equal(narrow.run("initialWidth"), 1);
  assert.ok(narrow.run("widest") > 1);
  const broad = setup({ front: [0, 1, 2, 3, 4], goals: [2] });
  broad.run(
    "AreaBattlePlan.execute(1);var initialWidth=areaArmy.areaPlan.frontier.length;var lateWidth=99;for(let i=0;i<70&&areaArmy.executing;i++){advance();const forward=areaArmy.areaPlan.frontier.filter(p=>(p-1)%W>=W-2);if(forward.length)lateWidth=Math.min(lateWidth,new Set(forward.map(p=>Math.floor((p-1)/W))).size);}",
  );
  assert.equal(broad.run("initialWidth"), 5);
  assert.ok(broad.run("lateWidth") < 5);
});
test("peace stops the plan and removes pending attacks without capturing neutral provinces", () => {
  const { run } = setup();
  run(
    "AreaBattlePlan.execute(1);var target=BattleManager.battles[0].provId;CoreEngine.gameState.atWar=[];AreaBattlePlan.tick(areaArmy,24);",
  );
  assert.equal(run("areaArmy.executing"), false);
  assert.equal(run("BattleManager.battles.length"), 0);
  assert.equal(run("MapRenderer.ownerOf(target)"), "POL");
});
test("late or repeated battle results cannot duplicate captures or equipment losses", () => {
  const { run } = setup();
  run(
    "AreaBattlePlan.execute(1);var done=BattleManager.battles[0];done.advantage=.8;BattleManager.resolve(done);var captured=areaArmy.areaPlan.captured;var strengths=areaArmy.divisions.map(d=>d.equipmentStrength);BattleManager.resolve(done);",
  );
  assert.equal(run("areaArmy.areaPlan.captured"), run("captured"));
  assert.equal(
    run("areaArmy.divisions.every((d,i)=>d.equipmentStrength===strengths[i])"),
    true,
  );
});
test("drawing disjoint province boundaries never connects their centers or bridges separate fronts", () => {
  const { run } = setup();
  run(
    `var strokes=[],pen;var ctx={save(){},restore(){},setLineDash(){},beginPath(){},moveTo(x,y){pen=[x,y]},lineTo(x,y){strokes.push([pen,[x,y]])},stroke(){}};MapRenderer.provinceBoundarySegments=new Map([['1:2',[10,0,10,1]],['5:6',[60,40,60,41]]]);AreaBattlePlan.drawPairs(ctx,(x,y)=>[x,y],[[1,2],[5,6]],'#0f0',3);`,
  );
  assert.equal(run("strokes.length"), 2);
  assert.equal(
    run("JSON.stringify(strokes)"),
    "[[[10,0],[10,1]],[[60,40],[60,41]]]",
  );
});
test("the actual drag handler stores a multi-province offensive line rather than an army route", () => {
  const { run } = setup();
  run(
    "BattlePlanManager.activeForce='army';BattlePlanManager.dragMode='arrow';BattlePlanManager.dragPoints=[[65,5],[65,45]];BattlePlanManager.endDrag()",
  );
  assert.equal(run("areaArmy.offensiveLine.pids.length"), 5);
  assert.equal(run("areaArmy.route"), null);
  assert.equal(run("BattlePlanManager.dragMode"), null);
  assert.equal(run("areaArmy.executing"), false);
});
