'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function assertNoSharedSegments(paths) {
  const segments=paths.flatMap((path,route)=> {
    const points=[...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match=>[Number(match[1]),Number(match[2])]);
    return points.slice(1).map((point,index)=>({route,a:points[index],b:point}));
  }).filter(segment=>segment.a[0]===segment.b[0]||segment.a[1]===segment.b[1]);
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++) {
    const a=segments[i],b=segments[j];
    if(a.route===b.route)continue;
    if(a.a[0]===a.b[0]&&b.a[0]===b.b[0]&&a.a[0]===b.a[0]) {
      assert.ok(Math.min(Math.max(a.a[1],a.b[1]),Math.max(b.a[1],b.b[1]))-
        Math.max(Math.min(a.a[1],a.b[1]),Math.min(b.a[1],b.b[1]))<=0,'vertical segments overlap');
    }
    if(a.a[1]===a.b[1]&&b.a[1]===b.b[1]&&a.a[1]===b.a[1]) {
      assert.ok(Math.min(Math.max(a.a[0],a.b[0]),Math.max(b.a[0],b.b[0]))-
        Math.max(Math.min(a.a[0],a.b[0]),Math.min(b.a[0],b.b[0]))<=0,'horizontal segments overlap');
    }
  }
}
function fixture() {
  const nodes=new Map(),storage=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',style:{},dataset:{},children:[],listeners:{},offsetWidth:300,offsetHeight:260,clientWidth:800,clientHeight:600,scrollLeft:0,scrollTop:0,classList:{added:[],removed:[],add(name){this.added.push(name);},remove(name){this.removed.push(name);},toggle(){},contains(){return true;}},appendChild(child){this.children.push(child);},replaceChildren(){this.children=[];},addEventListener(name,handler){this.listeners[name]=handler;},setAttribute(){},querySelectorAll(){return[];},querySelector(sel){return node(id+sel);}});return nodes.get(id);};
  const sandbox={TopbarUI:{render(){}},console,Date,Math,innerWidth:1280,innerHeight:800,crypto:require('node:crypto').webcrypto,setInterval(){return 1;},clearInterval(){},setTimeout(){},requestAnimationFrame(){},
    document:{createTextNode:text=>({textContent:text}),getElementById:node,querySelectorAll(selector){return selector==='input[name="move-division"]'?sandbox.selectionInputs:[];},querySelector(){return null;},createElement(){return node(Math.random());},addEventListener(){},head:{appendChild(){}},body:{appendChild(){}}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  sandbox.structuredClone=structuredClone;sandbox.selectionInputs=[];sandbox.window=sandbox;sandbox.addEventListener=()=>{};
  const ctx=vm.createContext(sandbox);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim()).join('\n');
  for (const file of ['asset-registry','game-asset-data','game-visuals','hoi4-effects-config']) vm.runInContext(fs.readFileSync(path.join(root,'assets',file+'.js'),'utf8'),ctx,{filename:file+'.js'});
  vm.runInContext(inline,ctx,{filename:'index.html:inline'});
  for(const name of ['battle','news','ai','training','dlc','strategy','war-systems'])vm.runInContext(fs.readFileSync(path.join(root,name+'.js'),'utf8'),ctx,{filename:name+'.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/strategy-systems.js'),'utf8'),ctx,{filename:'strategy-systems.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/MultiplayerTimeManager.js'),'utf8'),ctx,{filename:'MultiplayerTimeManager.js'});
  const run=source=>vm.runInContext(source,ctx);
  run(`
    MultiplayerTimeManager.init();StrategyGame.prepare();IntelOperations.ensure();DLC.ensureState();
    AIManager.state={focus:{},wars:[],doneEvents:[],spyDay:0};
    DiplomacyManager.countries=['POL','SOV','FRA','FIN','CHI','DEN'].map(id=>({id,name:id}));
    MapRenderer.ready=true;MapRenderer.canvas={width:1440,height:1000};MapRenderer.mapW=100;MapRenderer.mapH=100;
    MapRenderer.provinces={types:['land','sea'],terr:['plains','forest','mountain'],p:{}};
    MapRenderer.states={'1':{owner:'GER',name:'Home',provinces:[1,2],b:{}},'2':{owner:'POL',name:'Border',provinces:[3,4],b:{}},'3':{owner:'POL',name:'Goal',provinces:[5,6],b:{}}};
    MapRenderer.provNeighbors=new Map();MapRenderer.provCentroid=new Map();MapRenderer.provToState=new Map();MapRenderer.stateCenter=new Map();
    for(let p=1;p<=6;p++){MapRenderer.provinces.p[p]=[0,0,0,0,0,0];MapRenderer.provCentroid.set(p,[p*10,0]);MapRenderer.provNeighbors.set(p,new Set([p-1,p+1].filter(n=>n>=1&&n<=6)));MapRenderer.provToState.set(p,String(Math.ceil(p/2)));}
    MapRenderer.stateCenter=new Map([['1',[15,0]],['2',[35,0]],['3',[55,0]]]);
    MapRenderer.provinceAt=(x,y)=>{
      const mapW=MapRenderer.mapW||1, mapH=MapRenderer.mapH||1;
      const rawX=Math.floor(x), rawY=Math.floor(y);
      if(rawY<0||rawY>=mapH)return null;
      const wx=((rawX % mapW)+mapW)%mapW;
      return MapRenderer.idMap ? MapRenderer.idMap[rawY * mapW + wx] ?? null : Math.round(x/10);
    };
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

test('map wraps horizontally only and convoy losses scale with naval pressure',()=>{
  const {run}=fixture();
  run(`MapRenderer.mapW=3;MapRenderer.mapH=2;MapRenderer.idMap = new Uint16Array([10,11,12,20,21,22]);`);
  assert.equal(run('MapRenderer.provinceAt(4, 1)'), 21);
  assert.equal(run('MapRenderer.provinceAt(3, 2)'), null);
  assert.equal(run('MapRenderer.provinceAt(0, -1)'), null);
  run('MapRenderer.cam={x:0,y:10,scale:2};');
  assert.equal(run('MapRenderer.worldToScreen(0,10)[1]'),30);
  run('MapRenderer.canvas={width:1440,height:1000};MapRenderer.mapH=2;MapRenderer.cam={x:0,y:900,scale:2};MapRenderer.clampCameraY()');
  assert.equal(run('MapRenderer.cam.y'),498);
  run('MapRenderer.cam.scale=600;MapRenderer.cam.y=900;MapRenderer.clampCameraY()');
  assert.equal(run('MapRenderer.cam.y'),0);
  run('MapRenderer.cam.y=-900;MapRenderer.clampCameraY()');
  assert.equal(run('MapRenderer.cam.y'),-200);
  run('CoreEngine.gameState.convoys = 100; CoreEngine.gameState.navalSupremacy = 60;');
  assert.equal(run('typeof BattlePlanManager.applyConvoyDamage'), 'function');
  const before = run('CoreEngine.gameState.convoys');
  run('BattlePlanManager.applyConvoyDamage("POL", 0.8);');
  assert.ok(run('CoreEngine.gameState.convoys') < before);
  assert.ok(run('CoreEngine.gameState.convoys') >= 0);
});
test('division counters aggregate armies at province centers',()=>{
  const {run}=fixture();
  run(`BattlePlanManager.armies=[
    {id:1,positionPid:3,divisions:[{id:1,x:9,y:8,org:30,maxOrg:60},{id:2,x:11,y:9,org:60,maxOrg:60}]},
    {id:2,positionPid:3,divisions:[{id:3,x:12,y:10,org:45,maxOrg:60}]},
    {id:3,positionPid:4,divisions:[{id:4,x:42,y:10,org:50,maxOrg:60}]}
  ];BattlePlanManager.selectedArmyId=2;MapRenderer.provCentroid.set(3,[31,17]);MapRenderer.provCentroid.set(4,[43,19]);`);
  const markers=JSON.parse(run('JSON.stringify(BattlePlanManager.divisionMarkers())'));
  assert.equal(markers.length,2);
  assert.deepEqual(markers[0],{pid:3,x:31,y:17,count:3,org:135,maxOrg:180,selected:true});
  assert.deepEqual(markers[1],{pid:4,x:43,y:19,count:1,org:50,maxOrg:60,selected:false});
});
test('division markers scale down when zoomed out and up when zoomed in within readable bounds',()=>{
  const {run}=fixture();
  const scales=JSON.parse(run(`JSON.stringify([1,2.5,5].map(scale=>{MapRenderer.cam.scale=scale;return BattlePlanManager.unitMarkerScale()}))`));
  assert.ok(scales[0]<scales[1]);
  assert.ok(scales[1]<scales[2]);
  assert.ok(scales.every(scale=>scale>=0.7&&scale<=1.2));
});
test('map labels use localized state names for non-VP land and Japanese IDs for sea',()=>{
  const {run,node}=fixture();
  run(`window.l10n={t:key=>key==='STATE_2'?'国境州':key};MapRenderer.states['2'].vp={};`);
  assert.equal(run(`WarSystems.provinceName(3)`),'国境州');
  assert.equal(run(`WarSystems.provinceName(999)`),'海域 999');
  run(`MapRenderer.selectProvince(999);`);
  assert.match(node('map-info-overlay').innerHTML,/<strong>海域 999<\/strong>/);
});
test('air wings require an owned airbase and allocated planes and respect wrapped range',()=>{
  const {run}=fixture();
  run(`MapRenderer.states['1'].b.air_base=2;MapRenderer.stateCenter.set('1',[15,10]);CoreEngine.gameState.planes=20;MapRenderer.mapW=100;BattlePlanManager.air=[{id:'air1',type:'air',base:null,baseStateId:null,aircraftCount:0,range:30},{id:'air2',type:'air',base:null,baseStateId:null,aircraftCount:0,range:30}];`);
  assert.equal(run(`BattlePlanManager.assignAirbase('air1','1')`),true);
  assert.equal(run(`BattlePlanManager.airWingReady(BattlePlanManager.air[0])`),false);
  assert.equal(run(`BattlePlanManager.setAirWingAircraft('air1',12)`),true);
  assert.equal(run(`BattlePlanManager.airWingReady(BattlePlanManager.air[0])`),true);
  assert.equal(run(`BattlePlanManager.airTargetInRange(BattlePlanManager.air[0],[95,10])`),true);
  assert.equal(run(`BattlePlanManager.airTargetInRange(BattlePlanManager.air[0],[60,10])`),false);
  assert.equal(run(`BattlePlanManager.setAirWingAircraft('air2',9)`),false);
  assert.equal(run(`BattlePlanManager.setAirWingAircraft('air2',8)`),true);
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
test('production panel adds only unlocked equipment and adjusts/removes factory-assigned lines',()=>{
  const {run,node}=fixture();
  assert.equal(run(`ProductionManager.isUnlocked('infantry_2')`),false);
  run(`ResearchManager.researchedTech.add('improved_infantry_weapons')`);
  assert.equal(run(`ProductionManager.isUnlocked('infantry_2')`),true);
  assert.equal(run(`ProductionManager.addLine('infantry_2')`),true);
  assert.equal(run(`ProductionManager.adjustFactories('infantry_2',5)`),true);
  assert.equal(run(`CoreEngine.gameState.strategy.production[0].factories`),5);
  run(`ProductionManager.render()`);
  assert.match(node('production-content').innerHTML,/生産ラインを追加/);
  assert.match(node('production-content').innerHTML,/軍需工場/);
  assert.equal(run(`ProductionManager.removeLine('infantry_2')`),true);
  assert.equal(run(`CoreEngine.gameState.strategy.production.length`),0);
});
test('new-game divisions start on the capital VP province for every playable country',()=>{
  const {run}=fixture();
  run(`globalThis.capitals={GER:'Brandenburg',SOV:'Moscow Area',JAP:'Japan',USA:'Maryland',ENG:'Greater London Area',FRA:'Ile de France',ITA:'Italy'};
    for(const [country,name] of Object.entries(capitals)){
      const pid=70+Object.keys(capitals).indexOf(country);
      MapRenderer.provinces.p[pid]=[0,0,0,0,0,0];MapRenderer.provCentroid.set(pid,[pid,0]);
      MapRenderer.provToState.set(pid,String(pid));MapRenderer.states={[pid]:{name,owner:country,provinces:[pid],vp:{[pid]:10}}};
      CoreEngine.gameState.country=country;CoreEngine.gameState.divisions=2;
      CoreEngine.gameState.strategy.reserves=[];BattlePlanManager.armies=[];ArmyRoster.initialize();
      if(BattlePlanManager.armies[0].positionPid!==pid||CoreEngine.gameState.strategy.reserves.some(d=>d.pid!==pid))throw new Error(country+' capital placement failed');
    }`);
  assert.equal(run(`CoreEngine.gameState.strategy.reserves.every(d=>d.pid===76)`),true);
});
test('convoys are integer inventory produced only by dockyards and shortage is reported',()=>{
  const {run}=fixture();
  run('ProductionManager.account("GER").stock.convoys=18.9;ProductionManager.ensure()');
  assert.equal(run('CoreEngine.gameState.convoys'),18);
  assert.equal(run('ProductionManager.CATALOG.convoys.pool'),'dockyard');
  run('CoreEngine.gameState.dockyards=2;CoreEngine.gameState.militaryFactories=100');
  assert.equal(run('ProductionManager.allocate("convoys",3)'),false);
  assert.equal(run('ProductionManager.allocate("convoys",2)'),true);
  run('ProductionManager.account("GER").stock.convoys=4;ProductionManager.syncLocal()');
  assert.equal(run('ConvoyManager.checkShortage()'),1);
  assert.equal(run('TradeManager.import("steel","鋼鉄",1)'),false);
  assert.equal(run('CoreEngine.gameState.convoys'),4);
});
test('army routes require war or explicit military access for every foreign province',()=>{
  const {run}=fixture();
  run('MapRenderer.states["2"].owner="DEN";CoreEngine.gameState.atWar=["POL"];');
  assert.equal(run('OffensivePlanner.path(1,5).length'),0);
  run('CoreEngine.gameState.militaryAccess={DEN:true};');
  assert.equal(run('OffensivePlanner.path(1,5).length'),5);
  run('CoreEngine.gameState.militaryAccess.DEN=false;');
  assert.equal(run('OffensivePlanner.path(1,5).length'),0);
});
test('strategic move command follows owned land provinces and halts at the selected destination',()=>{
  const {run}=fixture();
  run(`MapRenderer.states['2'].owner='GER';MapRenderer.states['3'].owner='GER';
    BattlePlanManager.armies[0].positionPid=1;BattlePlanManager.armies[0].base=[10,0]`);
  assert.equal(run(`ArmyRoster.moveTo(6)`),true);
  assert.equal(run(`BattlePlanManager.armies[0].executing`),true);
  run(`for(let i=0;i<5;i++)OffensivePlanner.tickArmy(BattlePlanManager.armies[0])`);
  assert.equal(run(`BattlePlanManager.armies[0].positionPid`),6);
  assert.equal(run(`BattlePlanManager.armies[0].executing`),false);
  assert.equal(run(`BattlePlanManager.armies[0].status`),'目標到達・駐留');
});
test('construction is coastal-gated for dockyards and processes only the queue head',()=>{
  const {run}=fixture();
  run('ConstructionManager.selectedStateId="1";MapRenderer.provinces.p[1][4]=0;');
  run('ConstructionManager.enqueue("dockyard")');
  assert.equal(run('ConstructionManager.queue.length'),0);
  run(`MapRenderer.provinces.p[1][4]=1;ConstructionManager.enqueue("dockyard");
    ConstructionManager.queue.push({stateId:"1",building:"air_base",progress:0,factories:1,cost:240});
    ConstructionManager.onTick()`);
  assert.ok(run('ConstructionManager.queue[0].progress')>0);
  assert.equal(run('ConstructionManager.queue[1].progress'),0);
});
test('construction costs advance in game days rather than hourly ticks',()=>{
  const {run}=fixture();
  run(`ConstructionManager.selectedStateId='1';ConstructionManager.enqueue('arms_factory');
    for(let i=0;i<24;i++)ConstructionManager.onTick()`);
  assert.ok(Math.abs(run('ConstructionManager.queue[0].progress')-1)<1e-9);
  run('for(let i=0;i<359*24;i++)ConstructionManager.onTick()');
  assert.equal(run('CoreEngine.gameState.militaryFactories'),16);
});
test('focus tree uses card-edge orthogonal connections, expands to its data bounds and supports zoom without images',()=>{
  const {run,node}=fixture();
  run(`FocusTreeManager.focuses=[
    {id:'root',title:'Root',x:100,y:100,prerequisites:[]},
    {id:'child',title:'Child',x:300,y:250,prerequisites:['root']}
  ];FocusTreeManager.focusMap=Object.fromEntries(FocusTreeManager.focuses.map(f=>[f.id,f]));
    FocusTreeManager.countryStates.GER=FocusTreeManager.createCountryState();FocusTreeManager.render()`);
  assert.equal(node('focus-nodes').children.length,2);
  assert.ok(node('focus-svg-lines').innerHTML.includes('M120,128 L120,164 L320,164 L320,200'));
  assert.ok(!node('focus-nodes').children.some(child=>/<img\\b/i.test(child.innerHTML)));
  assert.equal(run('Number.parseInt(document.getElementById("focus-tree-viewport").style.height)'),328);
  run('FocusTreeManager.setZoom(.8)');
  assert.equal(run('FocusTreeManager.zoom'),.8);
  assert.equal(run('Number.parseInt(document.getElementById("focus-tree-viewport").style.height)'),263);
  assert.match(run('FocusTreeManager.render.toString()'),/focus-tree-content/);
});
test('focus routes use distinct endpoints and never share a horizontal or vertical segment',()=>{
  const {run}=fixture();
  run(`globalThis.routeNodes=[
    {id:'root',x:0,y:0,prerequisites:[]},
    {id:'left',x:260,y:0,prerequisites:['root']},
    {id:'right',x:520,y:0,prerequisites:['root']},
    {id:'leftNext',x:260,y:180,prerequisites:['left','right']},
    {id:'rightNext',x:520,y:180,prerequisites:['left','right']}
  ];globalThis.routePositions=f=>({x:f.x,y:f.y});
    globalThis.routes=FocusTreeManager.routeConnections(routeNodes,Object.fromEntries(routeNodes.map(f=>[f.id,f])),routePositions,140,78)`);
  const routes=JSON.parse(run('JSON.stringify(routes.map(route=>route.path))'));
  assert.equal(routes.length,6);
  assertNoSharedSegments(routes);
});
test('no focus-tree dependency paths overlap across any playable country dataset',()=>{
  const {run}=fixture();
  for(const tag of ['ger','sov','jap','usa','eng','fra','ita']) {
    const files=fs.readdirSync(path.join(root,tag,'data')).filter(file=>/_nf_batch\d+\.json$/.test(file));
    const focuses=files.flatMap(file=>JSON.parse(fs.readFileSync(path.join(root,tag,'data',file),'utf8')));
    const serialized=JSON.stringify(focuses);
    const routes=JSON.parse(run(`(()=>{const nodes=${serialized};const byId=Object.fromEntries(nodes.map(f=>[f.id,f]));
      return JSON.stringify(FocusTreeManager.routeConnections(nodes,byId,f=>({x:Number(f.x)||0,y:Number(f.y)||0}),140,78).map(route=>route.path))})()`));
    assertNoSharedSegments(routes);
  }
});
test('focus descriptions appear on hover, follow the pointer, and hide on leave',()=>{
  const {run,node}=fixture();
  run(`FocusTreeManager.focuses=[{id:'hover-focus',title:'Hovered focus',x:0,y:0,cost:30,effect:'説明の確認',prerequisites:[]}];
    FocusTreeManager.focusMap={'hover-focus':FocusTreeManager.focuses[0]};FocusTreeManager.render()`);
  const focus=node('focus-nodes').children[0],tooltip=node('focus-tooltip');
  assert.equal(typeof focus.listeners.pointerenter,'function');
  assert.equal(typeof focus.listeners.pointerleave,'function');
  focus.listeners.pointerenter({clientX:1200,clientY:760});
  assert.ok(tooltip.classList.removed.includes('hidden'));
  assert.equal(node('focus-tooltip.tt-title').textContent,'Hovered focus');
  assert.match(node('focus-tooltip.tt-effect').innerHTML,/説明の確認/);
  assert.ok(Number.parseFloat(tooltip.style.left)+tooltip.offsetWidth<=1280);
  assert.ok(Number.parseFloat(tooltip.style.top)+tooltip.offsetHeight<=800);
  focus.listeners.pointerleave();
  assert.ok(tooltip.classList.added.includes('hidden'));
});
test('political power earns one point per day by default, honors daily modifiers, and is capped',()=>{
  const {run}=fixture();
  assert.equal(run('CoreEngine.gameState.cardModifiers.politicalPowerGain'),0);
  run('CoreEngine.gameState.politicalPower=0;for(let i=0;i<24;i++)CoreEngine.accruePoliticalPowerHour()');
  assert.ok(Math.abs(run('CoreEngine.gameState.politicalPower')-1)<1e-9);
  run('CoreEngine.gameState.cardModifiers.politicalPowerGain=.5;for(let i=0;i<24;i++)CoreEngine.accruePoliticalPowerHour()');
  assert.ok(Math.abs(run('CoreEngine.gameState.politicalPower')-2.5)<1e-9);
  run('CoreEngine.gameState.politicalPower=998.99;for(let i=0;i<24;i++)CoreEngine.accruePoliticalPowerHour()');
  assert.equal(run('CoreEngine.gameState.politicalPower'),999);
  run(`HOI4EffectsConfig.applyEffect(CoreEngine.gameState,{type:'add_political_power',value:100})`);
  assert.equal(run('CoreEngine.gameState.politicalPower'),999);
});
test('division assignment modal can select all eligible divisions or a deterministic half',()=>{
  const {run,node}=fixture();
  run(`ArmyRoster.assignModal()`);
  assert.match(node('generic-modal-body').innerHTML,/全選択/);
  assert.match(node('generic-modal-body').innerHTML,/半数を選択/);
  run(`selectionInputs=[
    {disabled:false,checked:false},{disabled:false,checked:false},{disabled:true,checked:false},
    {disabled:false,checked:false},{disabled:false,checked:false},{disabled:false,checked:false}
  ];ArmyRoster.selectAvailable(true)`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(selectionInputs.map(input=>input.checked))')),[true,true,false,true,false,false]);
  run('ArmyRoster.selectAvailable(false)');
  assert.deepEqual(JSON.parse(run('JSON.stringify(selectionInputs.map(input=>input.checked))')),[true,true,false,true,true,true]);
});
test('all playable nations receive multiple exclusive branches and Japanese routes lock immediately',()=>{
  const {run}=fixture();
  run(`StrategySystems.patchFocusTree()`);
  for(const tag of ['GER','SOV','JAP','USA','ENG','FRA','ITA']) {
    const ids=run(`(()=>{
      FocusTreeManager.currentCountry='${tag}';
      FocusTreeManager.focuses=[{id:'${tag}_root',title:'Root',x:100,y:100,prerequisites:[]}];
      FocusTreeManager.focusMap={'${tag}_root':FocusTreeManager.focuses[0]};
      FocusTreeManager.countryStates['${tag}']=FocusTreeManager.createCountryState();
      StrategySystems.addExclusiveBranches();
      return FocusTreeManager.focuses.filter(f=>f.id.startsWith('${tag.toLowerCase()}_exclusive_') || f.id.startsWith('jap_kodoha_')).map(f=>f.id);
    })()`);
    assert.equal(ids.length,6,`${tag} has three exclusive choices`);
    for(const id of ids) {
      assert.equal(run(`FocusTreeManager.focusMap['${id}'].prerequisites.join(',')`),`${tag}_root`);
      assert.ok(run(`FocusTreeManager.focusMap['${id}'].exclusiveWith.length>0`));
    }
  }
  run(`FocusTreeManager.currentCountry='JAP';FocusTreeManager.focuses=[];FocusTreeManager.focusMap={};
    FocusTreeManager.countryStates.JAP=FocusTreeManager.createCountryState();StrategySystems.addExclusiveBranches()`);
  run(`FocusTreeManager.selectFocus('jap_kodoha_support');`);
  assert.equal(run(`FocusTreeManager.stateFor('JAP').activeFocus`),'jap_kodoha_support');
  assert.equal(run(`FocusTreeManager.stateFor('JAP').locked.has('jap_kodoha_purge')`),true);
  run(`FocusTreeManager.selectFocus('jap_kodoha_support');`);
  assert.equal(run(`FocusTreeManager.stateFor('JAP').locked.has('jap_kodoha_purge')`),true);
  run(`FocusTreeManager.selectFocus('jap_kodoha_purge');`);
  assert.equal(run(`FocusTreeManager.stateFor('JAP').activeFocus`),null);
});
test('facility experts generate points every sixty game days and projects consume points',()=>{
  const {run}=fixture();
  run(`StrategySystems.ensureState();MapRenderer.states['1'].b.land_experiment_facility=1;
    StrategySystems.facilityCompleted('land_experiment_facility','1');
    CoreEngine.gameState.politicalPower=300;StrategySystems.hireScientist('land');
    CoreEngine.gameState.labState.lastTickDay=GameTools.day();
    CoreEngine.gameState.date.setDate(CoreEngine.gameState.date.getDate()+30);
    StrategySystems.tick()`);
  assert.equal(run('CoreEngine.gameState.labState.points.land'),0);
  run(`CoreEngine.gameState.date.setDate(CoreEngine.gameState.date.getDate()+30);StrategySystems.tick()`);
  assert.equal(run('CoreEngine.gameState.labState.points.land'),30);
  run(`CoreEngine.gameState.labState.points.land=20;StrategySystems.unlockProject('land_prototype')`);
  assert.equal(run('CoreEngine.gameState.labState.points.land'),0);
  assert.equal(run(`CoreEngine.gameState.labState.unlockedProjects.includes('land_prototype')`),true);
});
test('nuclear reactors remain locked until the nuclear lab completes reactor research',()=>{
  const {run}=fixture();
  run(`ConstructionManager.selectedStateId='1';
    CoreEngine.gameState.politicalPower=500;
    MapRenderer.states['1'].b.nuclear_experiment_facility=1;
    StrategySystems.facilityCompleted('nuclear_experiment_facility','1')`);
  assert.equal(run(`StrategySystems.canBuildNuclearReactor()`),false);
  run(`ConstructionManager.enqueue('nuclear_reactor')`);
  assert.equal(run(`ConstructionManager.queue.length`),0);
  run(`ConstructionManager.render()`);
  assert.match(run(`document.getElementById('construction-content').innerHTML`),/原子力実験施設で「原子炉研究」を完了/);
  run(`StrategySystems.hireScientist('nuclear');
    CoreEngine.gameState.labState.lastTickDay=GameTools.day();
    CoreEngine.gameState.date.setDate(CoreEngine.gameState.date.getDate()+30);StrategySystems.tick()`);
  assert.equal(run(`CoreEngine.gameState.labState.points.nuclear`),0);
  run(`CoreEngine.gameState.date.setDate(CoreEngine.gameState.date.getDate()+30);StrategySystems.tick()`);
  assert.equal(run(`CoreEngine.gameState.labState.points.nuclear`),30);
  run(`StrategySystems.unlockProject('nuclear_reactor_research')`);
  assert.equal(run(`StrategySystems.canBuildNuclearReactor()`),true);
  run(`ConstructionManager.enqueue('nuclear_reactor')`);
  assert.equal(run(`ConstructionManager.queue[0].building`),'nuclear_reactor');
});
test('strategy feature initialization wires every named game-state surface and equipment shortage lowers strength',()=>{
  const {run}=fixture();
  run('StrategySystems.init()');
  for(const key of ['countryState','diplomacyState','unitState','productionState','constructionQueue','labState','designerState','focusTreeState']) {
    assert.equal(run(`Object.prototype.hasOwnProperty.call(CoreEngine.gameState,'${key}')`),true,key);
  }
  run(`CoreEngine.gameState.strategy.readinessDay=null;
    ProductionManager.account('GER').stock.infantry=0;
    ArmyRoster.all().forEach(division=>division.equipmentStrength=100);
    TrainingManager.onTick()`);
  assert.ok(run('ArmyRoster.all()[0].equipmentStrength')<100);
});
test('designed equipment needs a production line and stocked inventory before recruitment',()=>{
  const {run}=fixture();
  run(`StrategySystems.ensureState();StrategySystems.patchEquipmentNeeds();
    StrategySystems.registerDesign({id:'design-test',cat:'tank',name:'試製戦車',modules:{}});
    StrategySystems.selectDesign('tank','design_design-test')`);
  assert.equal(run(`ProductionManager.CATALOG['design_design-test'].pool`),'military');
  assert.equal(run(`TrainingManager.equipmentNeedsFor({armor:1})['design_design-test']`),350,run(`JSON.stringify({selected:CoreEngine.gameState.designerState.selectedByCategory,needs:TrainingManager.equipmentNeedsFor({armor:1})})`));
  assert.equal(run(`ProductionManager.canConsume(TrainingManager.equipmentNeedsFor({armor:1}))`),false);
  run(`ProductionManager.account('GER').stock['design_design-test']=350`);
  assert.equal(run(`ProductionManager.canConsume(TrainingManager.equipmentNeedsFor({armor:1}))`),true);
});
test('research replacement preserves allocated factories and production progress',()=>{
  const {run}=fixture();
  run(`CoreEngine.gameState.strategy.production=[{type:'infantry',factories:3,progress:.75,produced:12,priority:4}];
    StrategySystems.upgradeProduction({old:'infantry',next:'infantry_2',name:'歩兵装備 II',rate:12,resources:{steel:8}})`);
  assert.equal(run(`CoreEngine.gameState.strategy.production[0].type`),'infantry_2');
  assert.equal(run(`CoreEngine.gameState.strategy.production[0].factories`),3);
  assert.equal(run(`CoreEngine.gameState.strategy.production[0].progress`),0.75);
  assert.equal(run(`CoreEngine.gameState.strategy.production[0].priority`),4);
});
test('imports scale by ten and lease factories; new factories require completed construction',()=>{
  const {run}=fixture();const before=run('CoreEngine.gameState.resources.tungsten');assert.equal(run('TradeManager.import("tungsten","タングステン",2)'),true);assert.equal(run('CoreEngine.gameState.resources.tungsten'),before+20);
  const factories=run('CoreEngine.gameState.militaryFactories');run('ConstructionManager.selectedStateId="1";ConstructionManager.enqueue("arms_factory")');assert.equal(run('CoreEngine.gameState.militaryFactories'),factories);
  run('for(let i=0;i<360*24;i++)ConstructionManager.onTick()');assert.equal(run('CoreEngine.gameState.militaryFactories'),factories+1);
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
test('trained reserve divisions deploy at the selected owned training province',()=>{
  const {run}=fixture();
  run(`MapRenderer.states['1'].vp={2:5};MapRenderer.provCentroid.set(2,[20,0]);
    DivisionDesigner.grid=Array.from({length:5},()=>Array(5).fill(null));
    DivisionDesigner.grid[0][0]={id:'infantry'};
    TrainingManager.trainingStateId='1';TrainingManager.targetArmyId=null;
    CoreEngine.gameState.manpower=50000;TrainingManager.recruit();
    TrainingManager.queue[0].phase='training';TrainingManager.queue[0].progress=59;
    TrainingManager.queue[0].trainDays=60;`);
  run(`TrainingManager.onTick()`);
  assert.equal(run(`CoreEngine.gameState.strategy.reserves.at(-1).pid`),2);
  assert.equal(run(`CoreEngine.gameState.strategy.reserves.at(-1).x`),20);
});
test('save/load restores occupied provinces, armies, production, market escrow and preparation',()=>{
  const {run}=fixture();run('OffensivePlanner.capture(3,"GER");ProductionManager.allocate("tank",2);MarketManager.process("list",{type:"infantry",quantity:100},"GER");IntelOperations.target("POL").network=55;CoreEngine.gameState.speed=3;CoreEngine.gameState.paused=false;globalThis.saved=JSON.parse(JSON.stringify(SaveLoadManager.collect()))');
  run('saved.core.cardModifiers.politicalPowerGain=24;CoreEngine.gameState.strategy.provinceOwners={};BattlePlanManager.armies=[];CoreEngine.gameState.strategy.offers=[];CoreEngine.gameState.strategy.production=[];SaveLoadManager.apply(saved)');
  assert.equal(run('CoreEngine.gameState.speed'),0);assert.equal(run('CoreEngine.gameState.paused'),true);assert.equal(run('MapRenderer.ownerOf(3)'),'GER');assert.equal(run('BattlePlanManager.armies.length'),1);assert.equal(run('CoreEngine.gameState.strategy.offers[0].remaining'),100);assert.equal(run('CoreEngine.gameState.strategy.production[0].factories'),2);assert.equal(run('IntelOperations.target("POL").network'),55);
  assert.equal(run('CoreEngine.gameState.cardModifiers.politicalPowerGain'),0);
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
  assert.equal(run('CoreEngine.gameState.date.getTime()'),run('startDate+86400000'));assert.ok(Math.abs(run('CoreEngine.gameState.politicalPower')-run('ppBefore+1/24'))<1e-9);
  run(`MultiplayerManager.onData({type:'tick',date:nextDate},'host');CoreEngine.tick()`);assert.equal(run('CoreEngine.gameState.date.getTime()'),run('startDate+86400000'));
});
test('multiplayer time sync catches up missing hourly ticks without starting a client timer',()=>{
  const {run}=fixture();
  run(`MultiplayerManager.connected=true;MultiplayerManager.isHost=false;MultiplayerManager.roomId='host';
    CoreEngine.gameState.speed=1;CoreEngine.gameState.paused=false;
    globalThis.startDate=CoreEngine.gameState.date.getTime();globalThis.ppBefore=CoreEngine.gameState.politicalPower;
    globalThis.targetTick=MultiplayerTimeManager.currentTick+3;
    globalThis.targetDate=new Date(startDate+3*3600000).toISOString();
    MultiplayerTimeManager.receive({type:'TIME_SYNC_TICK',currentTick:targetTick,gameSpeed:2,
      isPaused:false,timestamp:Date.now(),date:targetDate},'host')`);
  assert.equal(run('MultiplayerTimeManager.currentTick'),run('targetTick'));
  assert.equal(run('CoreEngine.gameState.date.toISOString()'),run('targetDate'));
  assert.ok(run('CoreEngine.gameState.politicalPower') > run('ppBefore'));
  assert.equal(run('CoreEngine.timer'),null);
  run(`MultiplayerTimeManager.receive({type:'TIME_SYNC_TICK',currentTick:targetTick-1,gameSpeed:2,
    isPaused:false,timestamp:Date.now(),date:new Date(startDate).toISOString()},'host')`);
  assert.equal(run('CoreEngine.gameState.date.toISOString()'),run('targetDate'));
  run('CoreEngine.tick()');
  assert.equal(run('CoreEngine.gameState.date.toISOString()'),run('targetDate'));
});
test('multiplayer pause and speed requests require authenticated peers and are host-authoritative',()=>{
  const {run}=fixture();
  run(`MultiplayerManager.connected=true;MultiplayerManager.isHost=true;MultiplayerManager.roomId='room';
    CoreEngine.gameState.speed=1;CoreEngine.gameState.paused=false;
    globalThis.sent=[];MultiplayerManager.connections.peer={authOk:false,send:data=>sent.push(data)};
    globalThis.unauthorized=MultiplayerTimeManager.receiveRequest({type:'REQUEST_PAUSE_TOGGLE',isPaused:true},'peer')`);
  assert.equal(run('unauthorized'),false);
  assert.equal(run('CoreEngine.gameState.paused'),false);
  run(`MultiplayerManager.connections.peer.authOk=true;
    MultiplayerTimeManager.receiveRequest({type:'REQUEST_PAUSE_TOGGLE',isPaused:true},'peer')`);
  assert.equal(run('CoreEngine.gameState.paused'),true);
  assert.ok(run(`sent.some(message=>message.type==='BROADCAST_PAUSE_STATE'&&message.isPaused)`));
  run(`MultiplayerTimeManager.receiveRequest({type:'UPDATE_GAME_SPEED',gameSpeed:3},'peer')`);
  assert.ok(run(`sent.some(message=>message.type==='UPDATE_GAME_SPEED'&&message.gameSpeed===3)`));

  run(`MultiplayerManager.isHost=false;MultiplayerManager.roomId='host';
    MultiplayerManager.connections.host={open:true,send:data=>sent.push(data)};
    CoreEngine.setSpeed(4)`);
  assert.ok(run(`sent.some(message=>message.type==='UPDATE_GAME_SPEED'&&message.gameSpeed===4)`));
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

test('named operatives retain identities through recruitment, assignment and save/load',()=>{
  const {run}=fixture();
  run('CoreEngine.gameState.intel={agency:"Test",level:3,spies:0,assignments:[],recruiting:[]};CoreEngine.gameState.politicalPower=1000;globalThis.person=GameVisuals.operativeChoices("GER")[0].id');
  assert.equal(run('IntelOperations.hireSpy(person)'),true);
  assert.equal(run('IntelOperations.hireSpy(person)'),false);
  assert.equal(run('CoreEngine.gameState.intel.recruiting[0].operativeId'),run('person'));
  run('for(let i=0;i<30;i++)IntelOperations.tick()');
  assert.equal(run('CoreEngine.gameState.intel.roster[0]'),run('person'));
  run('IntelOperations.assign(0,"counter");globalThis.saved=JSON.parse(JSON.stringify(SaveLoadManager.collect()));CoreEngine.gameState.intel.roster=[];SaveLoadManager.apply(saved)');
  assert.equal(run('CoreEngine.gameState.intel.roster[0]'),run('person'));
  assert.equal(run('CoreEngine.gameState.intel.assignments[0].kind'),'counter');
});

test('legacy anonymous spies and queued recruits receive distinct persistent identities',()=>{
  const {run}=fixture();
  run('CoreEngine.gameState.intel={agency:"Test",level:3,spies:2,assignments:[],recruiting:[{days:10}]};IntelOperations.ensure();globalThis.ids=JSON.stringify(CoreEngine.gameState.intel.roster);IntelOperations.ensure()');
  assert.equal(run('JSON.stringify(CoreEngine.gameState.intel.roster)'),run('ids'));
  assert.equal(run('new Set([...CoreEngine.gameState.intel.roster,CoreEngine.gameState.intel.recruiting[0].operativeId]).size'),3);
});

test('disconnect releases the peer country back to AI control',()=>{
  const {run}=fixture();
  run(`MultiplayerManager.isHost=true;MultiplayerManager.remoteCountries={};CoreEngine.gameState.strategy.peers.peerA='FRA';`);
  run(`MultiplayerManager.handleDisconnect('peerA');`);
  assert.equal(run(`CoreEngine.gameState.strategy.peers.peerA`),undefined);
  assert.equal(run(`AIManager.state.focus.FRA !== undefined`),true);
});
test('client continues locally after host disconnects',()=>{
  const {run}=fixture();
  run(`MultiplayerManager.connected=true;MultiplayerManager.isHost=false;MultiplayerManager.roomId='host';MultiplayerManager.remoteCountries.host='SOV';CoreEngine.gameState.speed=2;CoreEngine.gameState.paused=false;MultiplayerManager.handleDisconnect('host');`);
  assert.equal(run('MultiplayerManager.connected'),false);
  assert.equal(run('MultiplayerManager.roomId'),null);
  assert.equal(run('CoreEngine.timer'),1);
  assert.equal(run('CoreEngine.gameState.paused'),false);
  assert.equal(run('AIManager.state.focus.SOV !== undefined'),true);
});
