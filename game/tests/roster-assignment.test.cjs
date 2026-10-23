"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fixture } = require("./helpers/strategy-fixture.cjs");
function commanders() {
  const f = fixture();
  f.load("assets/force-systems.js");
  const script = fs.readFileSync(
    path.join(__dirname, "../card/GER/script.js"),
    "utf8",
  );
  f.run(
    `CardSystem.allCards.GER=DataFetcher.parseLeadersArray(${JSON.stringify(script)}).map(c=>({...c,country:'GER'}));CoreEngine.gameState.politicalPower=999;ForceSystems.ensureState();ForceSystems.patchCommanderSlots();`,
  );
  return f;
}
test("a real gacha general keeps its type after hiring and appears in the army commander picker", () => {
  const { run, node } = commanders();
  run(
    `localStorage.setItem('ger_unlocked_cards',JSON.stringify(['rommel']));CardSystem.hireCard('rommel','GER');BattlePlanManager.assignGeneral(1);`,
  );
  assert.equal(run("CardSystem.hiredCards[0].type"), "general");
  assert.equal(run("CardSystem.hiredCards[0].country"), "GER");
  assert.match(node("generic-modal-body").innerHTML, /ロンメル/);
  assert.doesNotMatch(
    node("generic-modal-body").innerHTML,
    /割り当て可能な指揮官カードがありません/,
  );
  assert.equal(
    run("ForceSystems.assignCommander('army',1,'rommel','GER')"),
    true,
  );
  assert.equal(run("BattlePlanManager.armies[0].general.id"), "rommel");
  assert.equal(
    run("ForceSystems.assignCommander('navy','nav1','rommel','GER')"),
    false,
  );
});
test("legacy hired records recover their commander metadata on storage load and direct save restoration", () => {
  const { run } = commanders();
  run(
    `localStorage.setItem(CardSystem.hiredKey,JSON.stringify([{id:'guderian',country:'GER',name:'Old name',rank:'SSR'}]));CardSystem.loadHired();`,
  );
  assert.equal(
    run("ForceSystems.cardType(CardSystem.hiredCards[0])"),
    "army_leader",
  );
  assert.equal(
    run("ForceSystems.assignCommander('army',1,'guderian','GER')"),
    true,
  );
  run(
    `CardSystem.hiredCards=[{id:'rommel',country:'GER',name:'Legacy Rommel',rank:'SSR'}];BattlePlanManager.armies[0].general=null;BattlePlanManager.armies[0].commander=null;`,
  );
  assert.equal(
    run("ForceSystems.assignCommander('army',1,'rommel','GER')"),
    true,
  );
  run(
    "CardSystem.saveHired();CardSystem.hiredCards=[];CardSystem.loadHired();ForceSystems.initializeGroups()",
  );
  assert.equal(run("BattlePlanManager.armies[0].commander.id"), "rommel");
  assert.equal(run("CardSystem.hiredCards[0].type"), "general");
});
test("branch metadata and stats survive normalization while wrong-branch and duplicate assignments are rejected", () => {
  const { run } = commanders();
  run(
    `CardSystem.allCards.GER.push({id:'branch-general',nation:'GER',branch:'army',stats:{attack:7,defense:5,skill:3}});CardSystem.hiredCards=[{id:'branch-general',country:'GER'}];BattlePlanManager.armies.push({id:2,name:'Second',divisions:[]});`,
  );
  assert.equal(
    run("ForceSystems.assignCommander('army',1,'branch-general','GER')"),
    true,
  );
  assert.equal(run("BattlePlanManager.armies[0].commander.stats.attack"), 7);
  assert.equal(
    run("ForceSystems.assignCommander('army',2,'branch-general','GER')"),
    false,
  );
  run(
    `CardSystem.allCards.GER.push({id:'admiral',country:'GER',type:'navy',stats:{attack:4}});CardSystem.hiredCards.push({id:'admiral',country:'GER'});BattlePlanManager.navy=[{id:'nav1',name:'Fleet'}];`,
  );
  assert.equal(
    run("ForceSystems.assignCommander('army',2,'admiral','GER')"),
    false,
  );
  assert.equal(
    run("ForceSystems.assignCommander('navy','nav1','admiral','GER')"),
    true,
  );
});
test("existing annexed string-ID divisions are selectable through the actual checkbox handler", () => {
  const { run } = fixture();
  run(
    `BattlePlanManager.armies[0].frontline=null;CoreEngine.gameState.strategy.reserves=[{id:'POL-0',name:'Absorbed',pid:3,x:30,y:0,org:60,maxOrg:60,comp:{infantry:6}}];var imported=CoreEngine.gameState.strategy.reserves[0];document.querySelectorAll=selector=>selector==='input[name="move-division"]:checked'?[{value:'POL-0'}]:[];`,
  );
  assert.equal(run("ArmyRoster.moveSelected(1)"), true);
  assert.equal(run("CoreEngine.gameState.strategy.reserves.length"), 0);
  assert.equal(
    run(
      "BattlePlanManager.armies[0].divisions.filter(d=>d.id==='POL-0').length",
    ),
    1,
  );
  assert.equal(run("imported.pid"), 3);
  assert.equal(run("ArmyRoster.transfer(['POL-0'],0)"), true);
  assert.equal(run("CoreEngine.gameState.strategy.reserves[0].id"), "POL-0");
});
test("numeric IDs selected by DOM strings still work, active groups are protected, and transfers do not teleport units", () => {
  const { run } = fixture();
  run(
    `BattlePlanManager.armies[0].frontline=null;var original=BattlePlanManager.armies[0].divisions.map(d=>[d.x,d.y]);CoreEngine.gameState.strategy.reserves=[{id:500,name:'Native',pid:2,x:20,y:0,org:60,maxOrg:60}];`,
  );
  assert.equal(run("ArmyRoster.transfer(['500'],1)"), true);
  assert.equal(run("BattlePlanManager.armies[0].divisions.at(-1).x"), 20);
  assert.equal(
    run(
      "BattlePlanManager.armies[0].divisions.slice(0,-1).every((d,i)=>d.x===original[i][0]&&d.y===original[i][1])",
    ),
    true,
  );
  run("BattlePlanManager.armies[0].executing=true");
  assert.equal(run("ArmyRoster.transfer(['500'],0)"), false);
});
test("annexed troops are snapshotted before ownership changes and receive unique assignable local IDs", () => {
  const { run, load } = fixture();
  load("assets/completion-reward.js");
  run(`BattlePlanManager.armies[0].frontline=null;CoreEngine.gameState.strategy.nextDivisionId=1;CoreEngine.gameState.strategy.worldForces={POL:{divisions:[{id:'POL-0',name:'Armor',type:'armor',comp:{armor:4},pid:3,x:30,y:0,org:42,maxOrg:60},{id:'POL-1',name:'Infantry',type:'infantry',pid:4,x:40,y:0},{id:'POL-dead',defeated:true,pid:3,x:30,y:0}],navy:[]}};
 CompletionReward.apply(CoreEngine.gameState,parseCompletionReward('annex_country = { target = POL }')[0]);var absorbed=CoreEngine.gameState.strategy.reserves.slice();`);
  assert.equal(run("absorbed.length"), 2);
  assert.equal(
    run(
      'absorbed.every(d=>Number.isInteger(d.id)&&!d.defeated&&d.country==="GER")',
    ),
    true,
  );
  assert.equal(run("new Set(ArmyRoster.all().map(d=>d.id)).size"), 10);
  assert.equal(run("absorbed[0].comp.armor"), 4);
  assert.equal(run("absorbed[0].org"), 42);
  assert.equal(run("absorbed[0].sourceDivisionId"), "POL-0");
  assert.equal(
    run("CoreEngine.gameState.strategy.worldForces.POL.divisions.length"),
    0,
  );
  run(
    "document.querySelectorAll=selector=>selector==='input[name=\"move-division\"]:checked'?absorbed.map(d=>({value:String(d.id)})):[];",
  );
  assert.equal(run("ArmyRoster.moveSelected(1)"), true);
  assert.equal(run("BattlePlanManager.armies[0].divisions.length"), 10);
  run(
    `CompletionReward.apply(CoreEngine.gameState,parseCompletionReward('annex_country = { target = POL }')[0]);`,
  );
  assert.equal(run("ArmyRoster.all().length"), 10);
  run(
    "var save=JSON.stringify(StrategyGame.collect());StrategyGame.apply(JSON.parse(save));",
  );
  assert.equal(
    run(
      'BattlePlanManager.armies[0].divisions.filter(d=>d.sourceCountry==="POL").length',
    ),
    2,
  );
});
