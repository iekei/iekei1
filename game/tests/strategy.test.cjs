'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function fixture() {
  const nodes=new Map(),storage=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return true;}},appendChild(){},addEventListener(){},querySelectorAll(){return[];},querySelector(sel){return node(id+sel);}});return nodes.get(id);};
  const sandbox={console,Date,Math,crypto:require('node:crypto').webcrypto,setInterval(){return 1;},clearInterval(){},setTimeout(){},requestAnimationFrame(){},
    document:{getElementById:node,querySelectorAll(){return[];},querySelector(){return null;},createElement(){return node(Math.random());},addEventListener(){},head:{appendChild(){}},body:{appendChild(){}}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  sandbox.structuredClone=structuredClone;sandbox.window=sandbox;sandbox.addEventListener=()=>{};
  const ctx=vm.createContext(sandbox);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).join('\n');
  vm.runInContext(inline,ctx,{filename:'index.html:inline'});
  for(const name of ['battle','news','ai','training','dlc','strategy'])vm.runInContext(fs.readFileSync(path.join(root,name+'.js'),'utf8'),ctx,{filename:name+'.js'});
  const run=source=>vm.runInContext(source,ctx);
  run(`
    StrategyGame.prepare();IntelOperations.ensure();DLC.ensureState();
    AIManager.state={focus:{},wars:[],doneEvents:[],spyDay:0};
    DiplomacyManager.countries=['POL','SOV','FRA','FIN','CHI','DEN'].map(id=>({id,name:id}));
    MapRenderer.ready=true;MapRenderer.canvas={width:1440,height:1000};MapRenderer.mapW=100;MapRenderer.mapH=100;
    MapRenderer.provinces={types:['land','sea'],terr:['plains','forest','mountain'],p:{}};
    MapRenderer.states={'1':{owner:'GER',name:'Home',provinces:[1,2],b:{}},'2':{owner:'POL',name:'Border',provinces:[3,4],b:{}},'3':{owner:'POL',name:'Goal',provinces:[5,6],b:{}}};
    MapRenderer.provNeighbors=new Map();MapRenderer.provCentroid=new Map();MapRenderer.provToState=new Map();MapRenderer.stateCenter=new Map();
    for(let p=1;p<=6;p++){MapRenderer.provinces.p[p]=[0,0,0,0,0,0];MapRenderer.provCentroid.set(p,[p*10,0]);MapRenderer.provNeighbors.set(p,new Set([p-1,p+1].filter(n=>n>=1&&n<=6)));MapRenderer.provToState.set(p,String(Math.ceil(p/2)));}
    MapRenderer.stateCenter=new Map([['1',[15,0]],['2',[35,0]],['3',[55,0]]]);
    MapRenderer.provinceAt=(x,y)=>Math.round(x/10);
    const army={id:1,name:'Test Army',base:[10,0],positionPid:1,divisions:Array.from({length:8},(_,i)=>({id:i+1,org:60,maxOrg:60,x:10,y:0,comp:{infantry:6}})),frontline:[[20,0]],arrow:{from:[20,0],to:[60,0]},executing:false};
    BattlePlanManager.armies=[army];BattlePlanManager.selectedArmyId=1;
    CoreEngine.gameState.atWar=['POL'];CoreEngine.gameState.recruitQueue=[];TrainingManager.queue=CoreEngine.gameState.recruitQueue;
  `);
  return {run,node,ctx};
}
test('offensive occupies adjacent provinces one by one, holds gains and continues after recovery',()=>{
  const {run}=fixture();run('OffensivePlanner.execute(1)');
  assert.equal(run('BattlePlanManager.armies[0].positionPid'),1);
  run('OffensivePlanner.tickArmy(BattlePlanManager.armies[0])');
  assert.equal(run('BattleManager.battles[0].provId'),3);
  assert.equal(run('MapRenderer.ownerOf(3)'),'POL');
  run('BattleManager.battles[0].advantage=.8;BattleManager.resolve(BattleManager.battles[0])');
  assert.equal(run('MapRenderer.ownerOf(3)'),'GER');assert.equal(run('MapRenderer.ownerOf(4)'),'POL');assert.equal(run('MapRenderer.states["2"].owner'),'POL');
  for(let i=0;i<40;i++)run('OffensivePlanner.tickArmy(BattlePlanManager.armies[0]);if(BattleManager.battles[0]){BattleManager.battles[0].advantage=.8;BattleManager.resolve(BattleManager.battles[0]);}');
  assert.equal(run('MapRenderer.ownerOf(6)'),'GER');assert.equal(run('BattlePlanManager.armies[0].positionPid'),6);assert.equal(run('BattlePlanManager.armies[0].executing'),false);
  run('for(let i=0;i<100;i++)OffensivePlanner.tickArmy(BattlePlanManager.armies[0])');assert.equal(run('BattlePlanManager.armies[0].base[0]'),60);
});
test('neutral land and disconnected territory cannot be crossed; defeat does not grant a whole state',()=>{
  const {run}=fixture();run('MapRenderer.states["2"].owner="DEN";OffensivePlanner.execute(1)');assert.equal(run('BattleManager.battles.length'),0);assert.equal(run('BattlePlanManager.armies[0].executing'),false);
  run('MapRenderer.states["2"].owner="POL";OffensivePlanner.execute(1);OffensivePlanner.tickArmy(BattlePlanManager.armies[0]);BattleManager.battles[0].advantage=-.8;BattleManager.resolve(BattleManager.battles[0])');
  assert.equal(run('MapRenderer.states["1"].owner'),'GER');assert.equal(run('BattlePlanManager.armies[0].positionPid'),2);
});
test('initial rosters preserve exact totals and transfers cannot duplicate or move active divisions',()=>{
  const {run}=fixture();for(const [tag,total] of Object.entries({SOV:135,JAP:30,GER:38,FRA:28,ITA:30,ENG:10,USA:8})){
    run(`CoreEngine.gameState.country='${tag}';CoreEngine.gameState.divisions=${total};CoreEngine.gameState.strategy.reserves=[];BattlePlanManager.armies=[];ArmyRoster.initialize()`);
    assert.equal(run('ArmyRoster.all().length'),total);
    run('ArmyRoster.transfer(CoreEngine.gameState.strategy.reserves.slice(0,3).map(d=>d.id),1)');assert.equal(run('BattlePlanManager.armies[0].divisions.length'),3);assert.equal(run('ArmyRoster.all().length'),total);
    run('BattlePlanManager.armies[0].executing=true');assert.equal(run('ArmyRoster.transfer(BattlePlanManager.armies[0].divisions.map(d=>d.id),0)'),false);
    assert.equal(run('BattlePlanManager.armies[0].divisions.length'),3);
  }
});
test('production slots are shared, consume weekly real resources and stop cleanly on shortage',()=>{
  const {run}=fixture();assert.equal(run('ProductionManager.allocate("tank",1)'),true);assert.equal(run('ProductionManager.allocate("infantry",100)'),false);
  const before=run('CoreEngine.gameState.resources.chromium');run('for(let i=0;i<7;i++)ProductionManager.tick()');assert.ok(Math.abs(run('CoreEngine.gameState.resources.chromium')-(before-10))<1e-8);
  run('CoreEngine.gameState.resources.chromium=0');const stock=run('ProductionManager.account("GER").stock.tank');run('ProductionManager.tick()');assert.equal(run('ProductionManager.account("GER").stock.tank'),stock);
  assert.equal(run('ProductionManager.allocate("tank",NaN)'),false);
});
test('imports scale by ten and lease factories; new factories require completed construction',()=>{
  const {run}=fixture();const before=run('CoreEngine.gameState.resources.tungsten');assert.equal(run('TradeManager.import("tungsten","タングステン",2)'),true);assert.equal(run('CoreEngine.gameState.resources.tungsten'),before+20);
  const factories=run('CoreEngine.gameState.militaryFactories');run('ConstructionManager.selectedStateId="1";ConstructionManager.enqueue("arms_factory")');assert.equal(run('CoreEngine.gameState.militaryFactories'),factories);
  run('for(let i=0;i<360;i++)ConstructionManager.onTick()');assert.equal(run('CoreEngine.gameState.militaryFactories'),factories+1);
});
test('market escrow conserves inventory and only a purchase creates a temporary factory payment',()=>{
  const {run}=fixture();const original=run('ProductionManager.account("GER").stock.infantry');
  assert.equal(run('MarketManager.process("list",{type:"infantry",quantity:100},"GER")'),true);assert.equal(run('CoreEngine.gameState.strategy.contracts.length'),0);
  assert.equal(run('MarketManager.process("buy",{id:1,quantity:101},"FRA")'),false);
  assert.equal(run('MarketManager.process("buy",{id:1,quantity:40},"FRA","tx1")'),true);assert.equal(run('MarketManager.process("buy",{id:1,quantity:40},"FRA","tx1")'),false);
  assert.equal(run('ProductionManager.account("FRA").stock.infantry'),40);assert.equal(run('CoreEngine.gameState.strategy.contracts.length'),1);assert.equal(run('FactoryBudget.availableCivilian("GER")'),21);
  run('MarketManager.process("cancel",{id:1},"GER")');assert.equal(run('ProductionManager.account("GER").stock.infantry'),original-40);
});
test('ideology, aggressor status, goal expiry and wartime acceleration gate declarations',()=>{
  const {run}=fixture();run('CoreEngine.gameState.atWar=[];CoreEngine.gameState.ideology="democracy";CoreEngine.gameState.worldTension=100');assert.match(run('WarGoals.restriction("POL")'),/生んだ/);
  run('CoreEngine.gameState.strategy.tensionByCountry.POL=15');assert.equal(run('WarGoals.restriction("POL")'),'');assert.equal(run('WarGoals.restriction("SOV")').length>0,true);
  run('CoreEngine.gameState.justified.SOV=true');assert.equal(run('WarGoals.canDeclare("SOV")'),false);
  run('WarGoals.grant("POL","justification");CoreEngine.gameState.date.setDate(CoreEngine.gameState.date.getDate()+121)');assert.equal(run('WarGoals.declare("POL")'),false);
  run('CoreEngine.gameState.ideology="fascism";CoreEngine.gameState.worldTension=0;CoreEngine.gameState.atWar=["POL"]');assert.equal(run('WarGoals.duration()'),30);
  run('CoreEngine.gameState.ideology="communism"');assert.equal(run('WarGoals.duration()'),90);
  run('CoreEngine.gameState.ideology="neutrality"');assert.match(run('WarGoals.restriction("SOV")'),/50/);
});
test('intelligence requires preparation, network and a successful dial/typewriter mission',()=>{
  const {run,node}=fixture();run('CoreEngine.gameState.atWar=[];CoreEngine.gameState.politicalPower=900;IntelOperations.createAgency()');assert.equal(run('CoreEngine.gameState.intel.agency'),null);
  run('for(let i=0;i<30;i++)IntelOperations.tick();IntelOperations.hireSpy();for(let i=0;i<30;i++)IntelOperations.tick()');assert.equal(run('CoreEngine.gameState.intel.spies'),1);
  run('CoreEngine.gameState.intel.level=2;CoreEngine.gameState.intel.spies=2;IntelOperations.assign(1,"network","POL");IntelOperations.target("POL").network=60;IntelOperations.assign(0,"decrypt","POL")');
  run('for(let i=0;i<209;i++)IntelOperations.tick()');assert.equal(run('IntelOperations.target("POL").decoded'),false);run('IntelOperations.tick()');assert.equal(run('IntelOperations.target("POL").decoded'),true);
  assert.equal(run('IntelOperations.hasReveal()'),false);run('IntelOperations.mission("POL")');node('cipher-word').value='wrong';assert.equal(run('IntelOperations.submit()'),false);
  node('cipher-word').value=run('IntelOperations.challenge.word');run('IntelOperations.challenge.values=IntelOperations.challenge.digits.split("").map(Number)');assert.equal(run('IntelOperations.submit()'),true);assert.equal(run('IntelOperations.hasReveal()'),true);
  assert.equal(run('IntelOperations.visibleDivisions().length>0'),true);run('CoreEngine.gameState.date.setDate(CoreEngine.gameState.date.getDate()+8)');assert.equal(run('IntelOperations.hasReveal()'),false);
});
test('five special divisions includes reserves and training reservations',()=>{
  const {run}=fixture();run('BattlePlanManager.armies=[];CoreEngine.gameState.strategy.reserves=[];DivisionDesigner.grid[0][0]=DivisionDesigner.availableBattalions.find(b=>b.id==="ranger")');
  run('for(let i=0;i<6;i++)TrainingManager.recruit()');assert.equal(run('TrainingManager.queue.length'),5);assert.equal(run('ArmyRoster.specialCount()'),5);
});
test('save/load restores occupied provinces, armies, production, market escrow and preparation',()=>{
  const {run}=fixture();run('OffensivePlanner.capture(3,"GER");ProductionManager.allocate("tank",2);MarketManager.process("list",{type:"infantry",quantity:100},"GER");IntelOperations.target("POL").network=55;CoreEngine.gameState.speed=3;CoreEngine.gameState.paused=false;globalThis.saved=JSON.parse(JSON.stringify(SaveLoadManager.collect()))');
  run('CoreEngine.gameState.strategy.provinceOwners={};BattlePlanManager.armies=[];CoreEngine.gameState.strategy.offers=[];CoreEngine.gameState.strategy.production=[];SaveLoadManager.apply(saved)');
  assert.equal(run('CoreEngine.gameState.speed'),0);assert.equal(run('CoreEngine.gameState.paused'),true);assert.equal(run('MapRenderer.ownerOf(3)'),'GER');assert.equal(run('BattlePlanManager.armies.length'),1);assert.equal(run('CoreEngine.gameState.strategy.offers[0].remaining'),100);assert.equal(run('CoreEngine.gameState.strategy.production[0].factories'),2);assert.equal(run('IntelOperations.target("POL").network'),55);
});
test('stale multiplayer economy updates cannot restore escrow and clients cannot alter another country',()=>{
  const {run}=fixture();run(`MultiplayerManager.isHost=true;globalThis.packet={type:'strategy_public',country:'FRA',economy:structuredClone(ProductionManager.account('FRA')),divisions:[],navy:[]};packet.economy.stock.infantry=200;StrategyGame.onMessage(packet,'peer-fra')`);
  run(`StrategyGame.onMessage({type:'market_request',country:'FRA',action:'list',payload:{type:'infantry',quantity:100},requestId:'r1'},'peer-fra');StrategyGame.onMessage(packet,'peer-fra')`);
  assert.equal(run(`ProductionManager.account('FRA').stock.infantry`),100);
  run(`StrategyGame.onMessage({type:'market_request',country:'GER',action:'list',payload:{type:'infantry',quantity:100},requestId:'spoof'},'peer-fra')`);
  assert.equal(run('CoreEngine.gameState.strategy.offers.length'),1);
  run(`MultiplayerManager.onData({type:'recruit_add',order:{id:99}},'peer-fra')`);assert.equal(run('TrainingManager.queue.length'),0);
});
test('naval treaty removal takes political power and preparation before large ship production',()=>{
  const {run}=fixture();run(`CoreEngine.gameState.country='JAP';CoreEngine.gameState.politicalPower=900;ProductionManager.ensure()`);
  assert.equal(run(`ProductionManager.allocate('battleship',1)`),false);
  assert.equal(run(`DecisionManager.start('naval_treaty')`),true);run('for(let i=0;i<29;i++)DecisionManager.tick()');assert.equal(run(`ProductionManager.allocate('battleship',1)`),false);
  run('DecisionManager.tick()');assert.equal(run(`ProductionManager.allocate('battleship',1)`),true);
});
test('special terrain bonuses and airdrops require supremacy, transports and preparation',()=>{
  const {run}=fixture();run(`MapRenderer.provinces.p[3][5]=1;BattlePlanManager.armies[0].divisions[0].comp={ranger:6}`);assert.equal(run('OffensivePlanner.duration(BattlePlanManager.armies[0],3,10)'),7);
  run(`MapRenderer.provinces.p[3][5]=2;BattlePlanManager.armies[0].divisions[0].comp={mountaineer:6}`);assert.equal(run('OffensivePlanner.duration(BattlePlanManager.armies[0],3,10)'),7);
  run(`BattlePlanManager.armies[0].divisions.forEach(d=>d.comp={paratrooper:6});ArmyRoster.airdrop(6)`);assert.equal(run('BattleManager.battles.length'),0);
  run(`BattlePlanManager.air=[{executing:true,mission:'air_sup',zone:{x:60,y:0}}];CoreEngine.gameState.airSupremacy=70;ProductionManager.account('GER').stock.transport=1;ArmyRoster.airdrop(6)`);
  assert.equal(run('BattleManager.battles[0].preparation'),7);run('for(let i=0;i<7;i++)BattleManager.onTick()');assert.equal(run('BattleManager.battles[0].progress'),0);
  run('BattleManager.onTick()');assert.ok(run('BattleManager.battles[0].progress')>0);
});
test('AI fronts take a single adjacent province and cannot jump to unconnected territory',()=>{
  const {run}=fixture();run(`AIManager.advanceWar({a:'GER',b:'POL'})`);assert.equal(run('MapRenderer.ownerOf(3)'),'GER');assert.equal(run('MapRenderer.ownerOf(4)'),'POL');
  run(`AIManager.advanceWar({a:'GER',b:'POL'})`);assert.equal(run('MapRenderer.ownerOf(4)'),'GER');assert.equal(run('MapRenderer.ownerOf(5)'),'POL');
});
test('multiplayer clients follow host ticks once and keep their own economy and focus',()=>{
  const {run}=fixture();run(`MultiplayerManager.connected=true;MultiplayerManager.isHost=false;MultiplayerManager.roomId='host';CoreEngine.gameState.speed=1;CoreEngine.gameState.paused=false;globalThis.startDate=CoreEngine.gameState.date.getTime();globalThis.nextDate=new Date(startDate+86400000).toISOString();globalThis.ppBefore=CoreEngine.gameState.politicalPower;MultiplayerManager.onData({type:'tick',date:nextDate,state:{country:'FRA',pp:0}},'host')`);
  assert.equal(run('CoreEngine.gameState.date.getTime()'),run('startDate+86400000'));assert.equal(run('CoreEngine.gameState.politicalPower'),run('ppBefore+1'));
  run(`MultiplayerManager.onData({type:'tick',date:nextDate},'host');CoreEngine.tick()`);assert.equal(run('CoreEngine.gameState.date.getTime()'),run('startDate+86400000'));
});
test('paused asynchronous map startup populates target countries and country switches rebuild them',()=>{
  const {run}=fixture();run(`DiplomacyManager.countries=[];DiplomacyManager._ownerSig='';StrategyGame.onMapReady()`);assert.equal(run(`WarGoals.validTarget('SOV')`),true);
  run(`CoreEngine.gameState.country='JAP';DiplomacyManager.rebuildCountries()`);assert.equal(run(`DiplomacyManager.countries.some(c=>c.id==='GER')`),true);assert.equal(run(`DiplomacyManager.countries.some(c=>c.id==='JAP')`),false);
});
test('two country sessions authenticate, settle consecutive listings and purchases without duplicating stock',()=>{
  const host=fixture(),client=fixture(),messages=[];
  host.ctx.deliver=data=>messages.push({side:'client',data:JSON.parse(JSON.stringify(data))});
  client.ctx.deliver=data=>messages.push({side:'host',data:JSON.parse(JSON.stringify(data))});
  host.run(`MultiplayerManager.connected=true;MultiplayerManager.isHost=true;MultiplayerManager.roomId='host';MultiplayerManager.roomHash=MultiplayerManager.hashPassword('');MultiplayerManager.connections={client:{authOk:false,send:data=>deliver(data)}};ProductionManager.account('FRA').aiInitialized=true;ProductionManager.account('FRA').marketVersion=5;ProductionManager.account('FRA').stock.infantry=5000`);
  client.run(`CoreEngine.gameState.country='FRA';ProductionManager.ensure();MultiplayerManager.connected=true;MultiplayerManager.isHost=false;MultiplayerManager.roomId='host';MultiplayerManager.connections={host:{authOk:true,send:data=>deliver(data)}}`);
  const flush=()=>{let limit=100;while(messages.length&&limit--){const m=messages.shift(),side=m.side==='host'?host:client;side.ctx.incoming=m.data;side.run(`MultiplayerManager.onData(incoming,'${m.side==='host'?'client':'host'}')`);}assert.ok(limit>0,'message loop');};
  host.run(`MultiplayerManager.onData({type:'auth_resp',password:''},'client')`);flush();
  assert.equal(host.run(`ProductionManager.account('FRA').stock.infantry`),2500);assert.equal(client.run(`ProductionManager.account('FRA').stock.infantry`),2500);
  client.run(`MarketManager.request('list',{type:'infantry',quantity:100});MarketManager.request('list',{type:'infantry',quantity:100})`);flush();
  assert.equal(host.run(`ProductionManager.account('FRA').stock.infantry`),2300);assert.equal(client.run(`ProductionManager.account('FRA').stock.infantry`),2300);assert.equal(host.run('CoreEngine.gameState.strategy.offers.length'),2);
  const before=host.run(`ProductionManager.account('GER').stock.infantry`);host.run(`MarketManager.request('buy',{id:1,quantity:100})`);flush();
  assert.equal(host.run(`ProductionManager.account('GER').stock.infantry`),before+100);assert.equal(client.run(`FactoryBudget.availableCivilian()`),21);assert.equal(client.run(`CoreEngine.gameState.strategy.offers[0].remaining`),0);
});
