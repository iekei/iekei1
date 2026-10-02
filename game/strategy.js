/* Strategy systems: province offensives, army roster, diplomacy and economy. */
'use strict';
const GameTools = {
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  day() { return Math.floor(Date.UTC(CoreEngine.gameState.date.getFullYear(), CoreEngine.gameState.date.getMonth(), CoreEngine.gameState.date.getDate()) / 86400000 + 25567); },
  integer(value, min, max) { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : null; },
  button(label, action, disabled = false) { return '<button class="army-btn" onclick="' + action + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>'; },
  editing(id) { const el=document.getElementById(id);return !!el?.contains?.(document.activeElement)&&!!document.activeElement?.matches?.('input,select,textarea'); },
  card(id, tag) { return (CardSystem.allCards[tag] || []).find(c => c.id === id); },
  portrait(card, alt) { return card?.imgUrl ? '<img src="' + GameTools.escape(card.imgUrl) + '" alt="' + GameTools.escape(alt) + '">' : '<span class="portrait-placeholder">🎖️</span>'; },
  window(tab, title, render, width = 860) {
    if (!document.getElementById('tpl-' + tab)) {
      const tpl = document.createElement('div');
      tpl.id = 'tpl-' + tab; tpl.className = 'window-template pane-scroll';
      Object.assign(tpl.dataset, {title, w: width, h: 620});
      tpl.innerHTML = '<div id="' + tab + '-content"></div>';
      document.getElementById('window-templates').appendChild(tpl);
      const btn = document.createElement('button'); btn.className = 'win-btn'; btn.dataset.tab = tab;
      btn.textContent = title; btn.onclick = () => { WindowManager.open(tab); render(); };
      document.getElementById('window-nav').appendChild(btn);
    }
    render();
  }
};

class StrategyGame {
  static INITIAL = { SOV: 135, JAP: 30, GER: 38, FRA: 28, ITA: 30, ENG: 10, USA: 8 };
  static ready = false;
  static prepare() {
    const s = CoreEngine.gameState;
    if (!s.strategy) {
      s.strategy = { provinceOwners: {}, reserves: [], nextDivisionId: 1, resourceScale: 10,
        economies: {}, production: [], offers: [], contracts: [], marketNextId: 1,
        decisions: {}, tensionByCountry: {}, warGoals: {}, publicCountries: {}, peers: {}, processed: [] };
      Object.keys(s.resources).forEach(k => { s.resources[k] *= 10; });
      s.divisions = StrategyGame.INITIAL[s.country] || 20;
    }
    ProductionManager.ensure();
    WarGoals.ensure();
  }
  static init() {
    StrategyGame.prepare();
    GameTools.window('production', '⚙️ 装備生産', () => ProductionManager.render());
    GameTools.window('decisions', '📜 ディシジョン', () => DecisionManager.render());
    IntelligenceManager.ensure();
    ArmyRoster.install();
    if (!StrategyGame.ready) {
      document.addEventListener('keydown', StrategyGame.keyboard);
      CoreEngine.registerTickCallback(() => StrategyGame.tick());
      StrategyGame.ready = true;
    }
    ProductionManager.render(); DecisionManager.render(); IntelligenceManager.render();
    if (MapRenderer.ready) StrategyGame.onMapReady();
    StrategyGame.publish();
  }
  static onMapReady() {
    if (!CoreEngine.gameState.strategy) return;
    if (StrategyGame.pending) { const data = StrategyGame.pending; StrategyGame.pending = null; StrategyGame.apply(data); }
    DiplomacyManager.rebuildCountries();
    ArmyRoster.render();IntelOperations.render();DecisionManager.render();
  }
  static keyboard(e) {
    if (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const el = e.target;
    if (el?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return;
    if (!document.getElementById('start-screen').classList.contains('hidden')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (NewsManager.showing || IntelOperations.challenge) return;
      const s = CoreEngine.gameState;
      if (s.speed) { StrategyGame.lastSpeed = s.speed; CoreEngine.setSpeed(0); }
      else CoreEngine.setSpeed(StrategyGame.lastSpeed || 1);
    } else if (e.key === 'Enter' && NewsManager.showing) { e.preventDefault(); NewsManager.react(); }
  }
  static tick() {
    DecisionManager.tick(); MarketManager.tick();
    if (WindowManager.isOpen('production')) ProductionManager.render();
    if (WindowManager.isOpen('decisions')) DecisionManager.render();
    StrategyGame.publish();
  }
  static collect() {
    return { armies: BattlePlanManager.armies, navy: BattlePlanManager.navy, air: BattlePlanManager.air,
      selectedArmy: BattlePlanManager.selectedArmyId, battles: BattleManager.battles,
      construction: ConstructionManager.queue,
      owners: MapRenderer.states ? Object.fromEntries(Object.entries(MapRenderer.states).map(([id,st])=>[id,st.owner])) : {} };
  }
  static apply(data) {
    StrategyGame.prepare(); IntelligenceManager.ensure();
    if (!data) return;
    if (!MapRenderer.ready) { StrategyGame.pending = data; return; }
    IntelOperations.challenge=null;
    if(!MultiplayerManager.connected)CoreEngine.gameState.strategy.peers={};
    if (Array.isArray(data.armies)) BattlePlanManager.armies = data.armies;
    if (data.navy) BattlePlanManager.navy = data.navy;
    if (data.air) BattlePlanManager.air = data.air;
    BattlePlanManager.selectedArmyId = data.selectedArmy || BattlePlanManager.armies[0]?.id;
    BattleManager.battles = data.battles || [];
    BattleManager.nextId = Math.max(0, ...BattleManager.battles.map(b => b.id)) + 1;
    ConstructionManager.queue = data.construction || [];
    Object.entries(data.owners || {}).forEach(([id,owner]) => { if (MapRenderer.states[id]) MapRenderer.states[id].owner = owner; });
    TrainingManager.queue = CoreEngine.gameState.recruitQueue || [];
    TrainingManager.nextId = Math.max(0, ...TrainingManager.queue.map(o=>o.id)) + 1;
    AIManager.state = CoreEngine.gameState.ai || AIManager.state;
    NewsManager.shownIds = new Set(CoreEngine.gameState.newsShown || []);
    NewsManager.queue = []; NewsManager.showing = false; NewsManager._wasSpeed = null;
    const overlay = document.getElementById('news-popup-overlay'); if (overlay) overlay.style.display = 'none';
    MapRenderer.invalidateModes(); DiplomacyManager.rebuildCountries(); ProductionManager.ensure(); ArmyRoster.render();
    ProductionManager.render(); IntelligenceManager.render(); DecisionManager.render();
  }
  static publish() {
    if (!MultiplayerManager.connected) return;
    const s = CoreEngine.gameState;
    MultiplayerManager.broadcast({type:'strategy_public', country:s.country, focus:FocusTreeManager.focusMap[FocusTreeManager.activeFocus]?.title || '未選択',
      leader:CountryDossier.LEADERS[s.country]?.[0],
      economy:ProductionManager.account(s.country), divisions:ArmyRoster.all().map(d=>({id:d.id,pid:d.pid,x:d.x,y:d.y,type:d.type,mission:BattlePlanManager.armies.find(a=>a.divisions.includes(d))?.status||'予備'})),
      navy:BattlePlanManager.navy.map(n=>({id:n.id,base:n.base,zone:n.zone,mission:n.mission}))});
  }
  static onMessage(data, peer) {
    const s = CoreEngine.gameState;
    if (!s.strategy) return false;
    if (data.type === 'strategy_public') {
      if (!/^[A-Z]{3}$/.test(data.country)) return true;
      const relayed=!MultiplayerManager.isHost&&peer===MultiplayerManager.roomId&&data.relayed;
      const first=!relayed&&!s.strategy.peers[peer];
      if (!relayed) {
        if (s.strategy.peers[peer] && s.strategy.peers[peer]!==data.country) return true;
        s.strategy.peers[peer] = data.country;
      }
      s.strategy.publicCountries[data.country] = {focus:data.focus,leader:data.leader,divisions:Array.isArray(data.divisions)?data.divisions:[],navy:Array.isArray(data.navy)?data.navy:[]};
      if (data.economy && data.country !== s.country && MultiplayerManager.isHost) {
        const incoming=data.economy, current=s.strategy.economies[data.country];
        // An old public update must not put escrowed or purchased weapons back in stock.
        if ((!current || (first&&current.aiInitialized) || (incoming.marketVersion||0)===(current.marketVersion||0)) &&
            ['civilian','military','dockyards','construction'].every(k=>Number.isFinite(incoming[k])&&incoming[k]>=0) &&
            Object.keys(ProductionManager.CATALOG).every(k=>Number.isFinite(incoming.stock?.[k])&&incoming.stock[k]>=0)) {
          if(first&&current?.aiInitialized)s.strategy.offers=s.strategy.offers.filter(o=>o.seller!==data.country);
          s.strategy.economies[data.country]=structuredClone(incoming);
        }
      }
      if(MultiplayerManager.isHost){StrategyGame.relay({...data,relayed:true},peer);if(first)MarketManager.broadcast();}
      return true;
    }
    if (data.type === 'market_request') {
      if (!MultiplayerManager.isHost || s.strategy.peers[peer] !== data.country) return true;
      if (!data.payload || typeof data.requestId!=='string') return true;
      MarketManager.process(data.action, data.payload, data.country, data.requestId);
      MarketManager.broadcast(); return true;
    }
    if (data.type === 'market_snapshot') {
      if (MultiplayerManager.isHost || peer !== MultiplayerManager.roomId) return true;
      s.strategy.offers = data.offers; s.strategy.contracts = data.contracts;
      if (data.economies) s.strategy.economies = data.economies;
      ProductionManager.syncLocal(); MarketManager.render(); CoreEngine.renderStats(); return true;
    }
    if (data.type === 'declare_war') {
      const attacker=!MultiplayerManager.isHost&&peer===MultiplayerManager.roomId&&data.attacker?data.attacker:s.strategy.peers[peer];
      if(attacker && data.target===s.country && !s.atWar.includes(attacker)) {s.atWar.push(attacker);DiplomacyManager.render();}
      if(MultiplayerManager.isHost&&attacker)StrategyGame.relay({...data,attacker},peer);
      return true;
    }
    if (data.type === 'province_capture') {
      if(data.owner===s.strategy.peers[peer] || (!MultiplayerManager.isHost&&peer===MultiplayerManager.roomId)) {OffensivePlanner.capture(data.pid,data.owner,false);if(MultiplayerManager.isHost)StrategyGame.relay(data,peer);}
      return true;
    }
    return StrategyGame.privateEvents.has(data.type) && s.strategy.peers[peer]!==s.country;
  }
  static relay(data,exclude) {Object.entries(MultiplayerManager.connections).forEach(([id,conn])=>{if(id!==exclude&&conn.authOk!==false){try{conn.send(data);}catch{}}});}
  static privateEvents=new Set(['focus_select','focus_complete','research_start','research_complete','sp_hire','sp_phase','card_hire','battle_front','battle_arrow','battle_start','battle_end','force_zone','recruit_add','army_general']);
}

class OffensivePlanner {
  static isLand(pid) { const pd = MapRenderer.provinces?.p[pid]; return !!pd && MapRenderer.provinces.types[pd[3]] === 'land'; }
  static nearest(point, predicate = () => true) {
    let result = null, distance = Infinity;
    MapRenderer.provCentroid.forEach((c,pid) => {
      if (!OffensivePlanner.isLand(pid) || !predicate(pid)) return;
      const d = Math.hypot(c[0]-point[0],c[1]-point[1]);
      if (d < distance) { result=pid; distance=d; }
    }); return result;
  }
  static path(start, goal, country = CoreEngine.gameState.country, ownOnly=false) {
    start = Number(start); goal = Number(goal);
    const prev = new Map([[goal,null]]), queue = [goal];
    const canPass = pid => { const o = MapRenderer.ownerOf(pid); return OffensivePlanner.isLand(pid) && (o===country || (!ownOnly&&CoreEngine.gameState.atWar.includes(o))); };
    if (!canPass(start) || !canPass(goal)) return [];
    for (let i=0; i<queue.length && !prev.has(start); i++) {
      for (const next of MapRenderer.provNeighbors.get(queue[i]) || []) {
        if (!prev.has(next) && canPass(next)) { prev.set(next,queue[i]); queue.push(next); }
      }
    }
    if (!prev.has(start)) return [];
    const route=[]; for(let p=start;p!=null;p=prev.get(p)) route.push(p);
    return route;
  }
  static execute(id) {
    const army=BattlePlanManager.armies.find(a=>a.id===id), s=CoreEngine.gameState;
    if (!army || army.executing) return;
    if (!army.divisions.length) { GameUI.notify('師団を配属してください。','alert'); return; }
    if (!army.arrow || !army.frontline?.length) { GameUI.notify('前線と攻撃矢印を設定してください。','alert'); return; }
    const goal=MapRenderer.provinceAt(...army.arrow.to);
    if (!goal || !s.atWar.includes(MapRenderer.ownerOf(goal))) { GameUI.notify('目標国との有効な戦争が必要です。','alert'); return; }
    let start=army.positionPid;
    if (!start || MapRenderer.ownerOf(start)!==s.country) start=OffensivePlanner.nearest(army.base,p=>MapRenderer.ownerOf(p)===s.country);
    const fronts=army.frontline.map(point=>OffensivePlanner.nearest(point,p=>MapRenderer.ownerOf(p)===s.country&&[...(MapRenderer.provNeighbors.get(p)||[])].some(n=>s.atWar.includes(MapRenderer.ownerOf(n))))).filter(Boolean);
    fronts.sort((a,b)=>{const ac=MapRenderer.provCentroid.get(a),bc=MapRenderer.provCentroid.get(b),from=army.arrow.from;return Math.hypot(ac[0]-from[0],ac[1]-from[1])-Math.hypot(bc[0]-from[0],bc[1]-from[1]);});
    const entry=fronts[0],approach=entry?OffensivePlanner.path(start,entry,s.country,true):[],attack=entry?OffensivePlanner.path(entry,goal):[];
    const route=approach.length&&attack.length?[...approach,...attack.slice(1)]:[];
    if (!route.length) { GameUI.notify('前線から目標まで陸路がありません。中立国・海を横断できません。','alert'); return; }
    army.positionPid=start; army.route=route.slice(1); army.goalPid=goal; army.executing=true; army.status='進軍'; army.progress=0;
    OffensivePlanner.next(army); BattlePlanManager.renderPanel();
  }
  static next(army) {
    if (!army.executing || BattleManager.battles.some(b=>b.attackerArmyId===army.id)) return;
    const s=CoreEngine.gameState;
    if (!army.route?.length) { army.executing=false; army.status='目標到達・駐留'; army.progress=100; return; }
    if (army.divisions.reduce((n,d)=>n+d.org,0)/Math.max(1,army.divisions.length)<50) { army.status='組織力回復'; return; }
    const pid=army.route[0];
    if (!(MapRenderer.provNeighbors.get(army.positionPid)||new Set()).has(pid)) { army.executing=false; army.status='経路が切断'; return; }
    const owner=MapRenderer.ownerOf(pid);
    if (owner===s.country) { army.status='行軍'; return; }
    if (!s.atWar.includes(owner)) { army.executing=false; army.status='中立国の前で停止'; return; }
    army.status='戦闘';
    BattleManager.startOffensive(army,pid,MapRenderer.stateOf(pid));
  }
  static hold(army,pid) {
    const c=MapRenderer.provCentroid.get(pid); if (!c) return;
    army.positionPid=pid; army.base=c.slice();
    army.divisions.forEach((d,i)=>{ d.x=c[0]+(i%5-2)*3; d.y=c[1]+(Math.floor(i/5)%5-2)*3; d.pid=pid; });
  }
  static tickArmy(army) {
    const b=BattleManager.battles.find(b=>b.attackerArmyId===army.id);
    if (b) { army.progress=Math.round(b.progress*100); return; }
    army.divisions.forEach(d=>{d.org=Math.min(d.maxOrg,d.org+(army.executing?2:3));});
    if (!army.executing) return; // Occupied ground is held; never return to the old base.
    if (army.status==='行軍' && army.route?.length) {
      const next=army.route[0];
      if (MapRenderer.ownerOf(next)===CoreEngine.gameState.country) { army.route.shift(); OffensivePlanner.hold(army,next); }
    }
    OffensivePlanner.next(army);
  }
  static capture(pid,owner,broadcast=true) {
    pid=Number(pid); if (!OffensivePlanner.isLand(pid)) return false;
    const s=CoreEngine.gameState; s.strategy.provinceOwners[pid]=owner;
    const sid=MapRenderer.stateOf(pid),st=MapRenderer.states[sid];
    if (st && st.provinces.filter(OffensivePlanner.isLand).every(p=>MapRenderer.ownerOf(p)===owner)) {
      st.owner=owner; st.provinces.forEach(p=>{delete s.strategy.provinceOwners[p];});
    }
    MapRenderer.invalidateModes();
    if (broadcast) MultiplayerManager.broadcast({type:'province_capture',pid,owner});
    return true;
  }
  static result(b) {
    const army=BattlePlanManager.armies.find(a=>a.id===b.attackerArmyId);
    if (!army) return;
    army.divisions.forEach(d=>{d.org=Math.max(0,d.org-10);});
    if (b.advantage>=0.1) {
      OffensivePlanner.capture(b.provId,b.attacker);
      OffensivePlanner.hold(army,b.provId);
      if (army.route?.[0]===b.provId) army.route.shift();
      // The active line follows the connected bridgehead, not the initial border.
      const owned=[b.provId,...(MapRenderer.provNeighbors.get(b.provId)||[])].filter(p=>MapRenderer.ownerOf(p)===b.attacker);
      army.frontline=owned.filter(p=>[...(MapRenderer.provNeighbors.get(p)||[])].some(n=>CoreEngine.gameState.atWar.includes(MapRenderer.ownerOf(n))))
        .map(p=>MapRenderer.provCentroid.get(p)).filter(Boolean);
      CoreEngine.log('🏆 '+army.name+'がプロビンス '+b.provId+'を占領。ここを足場に次の地域へ進軍します。');
      if (b.invasion || b.airdrop) { army.executing=false; army.status='橋頭堡を確保・駐留'; army.route=null; }
      else { army.executing=true; OffensivePlanner.next(army); }
    } else { army.executing=false; army.status=b.advantage<=-.1?'攻撃失敗・駐留':'膠着・駐留'; }
    army.progress=0;
  }
  static duration(army,pid,base) {
    const terrain=MapRenderer.provinces.terr[MapRenderer.provinces.p[pid]?.[5]];
    const comp=army.divisions.flatMap(d=>Object.keys(d.comp||{}));
    const fast=(terrain==='mountain' && comp.includes('mountaineer')) || (['forest','jungle','marsh','river'].includes(terrain)&&comp.includes('ranger'));
    return Math.max(2,Math.round(base*(fast ? 0.65 : 1)));
  }
}

class ArmyRoster {
  static frontTool=false;
  static airdropTool=false;
  static all() { return [...(CoreEngine.gameState.strategy?.reserves||[]),...BattlePlanManager.armies.flatMap(a=>a.divisions)]; }
  static initialize() {
    const s=CoreEngine.gameState;
    StrategyGame.prepare();
    if (BattlePlanManager.armies.length) return;
    const base=OffensivePlanner.nearest([MapRenderer.mapW/2,MapRenderer.mapH/2],p=>MapRenderer.ownerOf(p)===s.country);
    const c=MapRenderer.provCentroid.get(base)||[0,0];
    BattlePlanManager.armies=[{id:1,name:'第1軍集団',base:c.slice(),positionPid:base,divisions:[],frontline:null,arrow:null,executing:false,progress:0}];
    if (!s.strategy.reserves.length) s.strategy.reserves=Array.from({length:s.divisions},(_,i)=>{
      const type=s.country==='JAP' && i<2?'mountaineer':i%12===10?'armor':i%10===8?'cavalry':'infantry';
      return {id:s.strategy.nextDivisionId++, name:'第'+(i+1)+'師団',org:60,maxOrg:60,x:c[0],y:c[1],pid:base,type,comp:{[type]:6}};
    });
    BattlePlanManager.selectedArmyId=1;
  }
  static specialCount() {
    const isSpecial = comp => ['ranger','mountaineer','paratrooper','marine'].some(k=>comp?.[k]);
    return ArmyRoster.all().filter(d=>isSpecial(d.comp)).length+(CoreEngine.gameState.recruitQueue||[]).filter(o=>!o.done && isSpecial(o.comp)).length;
  }
  static install() { document.getElementById('army-panel').classList.add('army-dock'); }
  static toggleFront() { ArmyRoster.frontTool=!ArmyRoster.frontTool; ArmyRoster.airdropTool=false; ArmyRoster.render(); }
  static placeFront(pid) {
    const player=CoreEngine.gameState.country;
    const neighbors=MapRenderer.provNeighbors.get(pid)||new Set();
    let other=MapRenderer.ownerOf(pid);
    if (other===player) other=[...neighbors].map(p=>MapRenderer.ownerOf(p)).find(o=>o && o!==player);
    const border=MapRenderer.ownerOf(pid)===player || [...neighbors].some(p=>MapRenderer.ownerOf(p)===player);
    if (!other || other===player || !border || !OffensivePlanner.isLand(pid)) { GameUI.notify('自国と他国が接する陸の国境をクリックしてください。','alert'); return; }
    BattlePlanManager.autoFrontline(other); ArmyRoster.frontTool=false; ArmyRoster.render();
  }
  static assignModal() {
    const target=BattlePlanManager.selectedArmy(); if (!target) return;
    let html='<p>配属する師団を選択してください。作戦中の軍集団への移動はできません。</p><div class="division-picker">';
    const reserves=CoreEngine.gameState.strategy.reserves;
    [{name:'未所属',divisions:reserves},...BattlePlanManager.armies].forEach(a=>{
      html+='<h4>'+a.name+' ('+a.divisions.length+')</h4>';
      a.divisions.forEach(d=>{html+='<label><input type="checkbox" name="move-division" value="'+d.id+'"'+(a.executing||a.id===target.id?' disabled':'')+'>'+GameTools.escape(d.name||'師団 '+d.id)+'</label>';});
    });
    html+='</div>'+GameTools.button('選択した師団を '+target.name+' に配属','ArmyRoster.moveSelected('+target.id+')',target.executing);
    GameUI.openModal('師団の配属',html);
  }
  static moveSelected(targetId) {
    const ids=[...document.querySelectorAll('input[name="move-division"]:checked')].map(e=>Number(e.value));
    ArmyRoster.transfer(ids,targetId); GameUI.closeModal(); ArmyRoster.render();
  }
  static transfer(ids,targetId) {
    const target=targetId===0?null:BattlePlanManager.armies.find(a=>a.id===targetId);
    if ((targetId!==0&&!target)||target?.executing) return false;
    const reserve=CoreEngine.gameState.strategy.reserves, wanted=new Set(ids);
    const sources=[{divisions:reserve},...BattlePlanManager.armies];
    const moved=[];
    sources.forEach(a=>{if(a.executing || a===target) return; a.divisions=a.divisions.filter(d=>{if(wanted.has(d.id)){moved.push(d);return false;}return true;});});
    CoreEngine.gameState.strategy.reserves=sources[0].divisions;
    (target?target.divisions:CoreEngine.gameState.strategy.reserves).push(...moved);
    if(target){const pid=target.positionPid||OffensivePlanner.nearest(target.base,p=>MapRenderer.ownerOf(p)===CoreEngine.gameState.country);if(pid)OffensivePlanner.hold(target,pid);}
    return moved.length>0;
  }
  static airdrop(pid) {
    const army=BattlePlanManager.selectedArmy(),s=CoreEngine.gameState;
    if (!army || army.executing || !army.divisions.length || !army.divisions.every(d=>d.comp?.paratrooper)) { GameUI.notify('空挺兵だけを編成した待機中の軍集団を選んでください。','alert'); return; }
    const c=MapRenderer.provCentroid.get(pid);
    const air=BattlePlanManager.air.some(u=>u.executing&&u.mission==='air_sup'&&u.zone&&c&&Math.hypot(u.zone.x-c[0],u.zone.y-c[1])<220);
    if (!air || s.airSupremacy<60 || (s.strategy.economies[s.country]?.stock.transport||0)<1) { GameUI.notify('対象地域での制空任務・制空権60%・輸送機が必要です。','alert'); return; }
    if (!s.atWar.includes(MapRenderer.ownerOf(pid)) || !OffensivePlanner.isLand(pid)) return;
    const b=BattleManager.startOffensive(army,pid,MapRenderer.stateOf(pid),{airdrop:true});
    if (b) {army.executing=true; ArmyRoster.airdropTool=false; b.preparation=7; ArmyRoster.render();}
  }
  static render() {
    const el=document.getElementById('army-panel'); if (!el || !CoreEngine.gameState.strategy) return;
    BattlePlanManager._lastRender=Date.now();
    let html='<div class="army-tools">'+['army','navy','air'].map((f,i)=>GameTools.button(['陸軍','海軍','空軍'][i],"BattlePlanManager.setForce('"+f+"')")).join('');
    if (BattlePlanManager.activeForce!=='army') {
      const list=BattlePlanManager.activeForce==='navy'?BattlePlanManager.navy:BattlePlanManager.air;
      html+='</div><div class="army-strip">'+list.map(u=>'<div class="army-tile">'+GameTools.button(u.name,"BattlePlanManager.selectUnit('"+u.id+"')")+'<p>'+Math.floor((BattlePlanManager.activeForce==='navy'?CoreEngine.gameState.ships:CoreEngine.gameState.planes)/Math.max(1,list.length))+' / '+GameTools.escape(u.mission)+'</p>'+GameTools.button(u.executing?'中止':'任務開始',"BattlePlanManager."+(u.executing?'abort':'execute')+"('"+u.id+"')")+'<select onchange="BattlePlanManager.selectUnit(\''+u.id+'\');BattlePlanManager.setMission(this.value)">'+BattlePlanManager.missions[u.type].map(m=>'<option value="'+m.id+'"'+(m.id===u.mission?' selected':'')+'>'+m.label+'</option>').join('')+'</select></div>').join('')+'</div>';
    } else {
      html+=GameTools.button('＋軍集団','BattlePlanManager.addArmy()')+GameTools.button('師団を配属 ('+CoreEngine.gameState.strategy.reserves.length+' 未所属)','ArmyRoster.assignModal()');
      html+=GameTools.button(ArmyRoster.frontTool?'前線指定中…':'前線を引く','ArmyRoster.toggleFront()')+GameTools.button('攻撃線: Shift＋右ドラッグ','GameUI.notify(\'前線から敵地へShift＋右ドラッグしてください\')');
      html+=GameTools.button('強襲上陸','BattlePlanManager.toggleInvasion()')+GameTools.button('空挺降下','ArmyRoster.airdropTool=!ArmyRoster.airdropTool;ArmyRoster.frontTool=false;ArmyRoster.render()');
      html+='<span>Space: 時間停止/再開　Enter: ニュースを閉じる</span></div><div class="army-strip">';
      BattlePlanManager.armies.forEach(a=>{
        const card=GameTools.card(a.general?.id,CoreEngine.gameState.country),org=a.divisions.reduce((n,d)=>n+d.org,0)/Math.max(1,a.divisions.length);
        html+='<div class="army-tile'+(a.id===BattlePlanManager.selectedArmyId?' selected':'')+'"><button class="army-portrait" onclick="BattlePlanManager.selectArmy('+a.id+')">'+GameTools.portrait(card,a.general?.name||'将軍未配置')+'<strong>'+a.divisions.length+' 師団</strong></button><div class="army-tile-info"><b>'+a.name+'</b><p>'+GameTools.escape(a.general?.name||'将軍未配置')+'</p><p>'+GameTools.escape(a.status||'待機')+' / 組織力 '+Math.round(org)+'</p>'+GameTools.button('将軍','BattlePlanManager.assignGeneral('+a.id+')')+GameTools.button(a.executing?'中止':'作戦開始','BattlePlanManager.'+(a.executing?'abort':'execute')+'('+a.id+')',!a.executing&&(!a.arrow||!a.divisions.length))+GameTools.button('未所属へ','ArmyRoster.transfer(BattlePlanManager.armies.find(a=>a.id==='+a.id+').divisions.map(d=>d.id),0);ArmyRoster.render()',a.executing)+'</div></div>';
      }); html+='</div>';
    }
    el.innerHTML=html;
  }
}

class FactoryBudget {
  static availableCivilian(tag=CoreEngine.gameState.country) {
    const s=CoreEngine.gameState,a=ProductionManager.account(tag),day=GameTools.day();
    let total=tag===s.country?Math.floor(s.civilianFactories):Math.floor(a.civilian);
    (s.strategy.contracts||[]).filter(c=>c.expires>day).forEach(c=>{if(c.buyer===tag)total-=c.factories;if(c.seller===tag)total+=c.factories;});
    if(tag===s.country && s.intel?.building) total-=2;
    if(tag===s.country) total-=(s.strategy.tradeLeases||[]).filter(c=>c.expires>day).reduce((n,c)=>n+c.factories,0);
    return Math.max(0,total);
  }
}
class ProductionManager {
  static CATALOG={
    infantry:{name:'歩兵装備',rate:10,resources:{steel:7},pool:'military'},
    rifle_old:{name:'旧式歩兵装備',rate:6,resources:{steel:5},pool:'military'},
    artillery:{name:'野砲',rate:2,resources:{steel:10,tungsten:3},pool:'military'},
    tank:{name:'戦車',rate:1,resources:{steel:14,tungsten:5,chromium:10},pool:'military'},
    fighter:{name:'戦闘機',rate:.5,resources:{aluminum:10,rubber:3},pool:'military'},
    transport:{name:'輸送機',rate:.2,resources:{aluminum:12,rubber:3},pool:'military'},
    destroyer:{name:'駆逐艦',rate:1/60,resources:{steel:10,chromium:2},pool:'dockyard'},
    submarine:{name:'潜水艦',rate:1/45,resources:{steel:7,chromium:2},pool:'dockyard'},
    battleship:{name:'戦艦',rate:1/240,resources:{steel:18,chromium:7},pool:'dockyard'}
  };
  static ensure() {
    const s=CoreEngine.gameState;if(!s.strategy) return;
    s.strategy.production ||= [];
    const a=ProductionManager.account(s.country);
    a.civilian=s.civilianFactories;a.military=s.militaryFactories;a.dockyards=s.dockyards;a.construction=ConstructionManager.queue.reduce((n,q)=>n+q.factories,0);
    if (!a.initialized) {a.stock.infantry=s.equipment??2500;a.stock.fighter=s.planes||50;a.stock.destroyer=s.ships||20;a.stock.artillery=100;a.stock.tank=40;a.initialized=true;}
    ProductionManager.syncLocal();
  }
  static account(tag) {
    const s=CoreEngine.gameState;
    s.strategy.economies ||= {};
    if (!s.strategy.economies[tag]) s.strategy.economies[tag]={civilian:20,military:15,dockyards:5,construction:0,marketVersion:0,stock:Object.fromEntries(Object.keys(ProductionManager.CATALOG).map(k=>[k,0]))};
    return s.strategy.economies[tag];
  }
  static freeCivilian(tag=CoreEngine.gameState.country) {
    const reserved=tag===CoreEngine.gameState.country?ConstructionManager.queue.reduce((n,q)=>n+q.factories,0):(ProductionManager.account(tag).construction||0);
    return Math.max(0,FactoryBudget.availableCivilian(tag)-reserved);
  }
  static treatyLimited() {return ['JAP','USA','ENG','FRA','ITA'].includes(CoreEngine.gameState.country)&&!CoreEngine.gameState.strategy.navalTreatyBroken;}
  static capacity(pool) { const s=CoreEngine.gameState;return Math.max(0,Math.floor(pool==='dockyard'?s.dockyards:s.militaryFactories)); }
  static allocate(type,value) {
    const def=ProductionManager.CATALOG[type],n=GameTools.integer(value,0,200);if(!def||n===null) return false;
    if(n>0 && type==='battleship' && ProductionManager.treatyLimited()){GameUI.notify('大型艦の生産にはディシジョンで海軍軍縮条約を破棄してください。','alert');ProductionManager.render();return false;}
    const lines=CoreEngine.gameState.strategy.production;
    const others=lines.filter(l=>l.type!==type&&ProductionManager.CATALOG[l.type]?.pool===def.pool).reduce((t,l)=>t+l.factories,0);
    if(others+n>ProductionManager.capacity(def.pool)){GameUI.notify('利用可能な工場・造船所を超えています。追加するには建設してください。','alert');ProductionManager.render();return false;}
    const line=lines.find(l=>l.type===type);
    if(line) line.factories=n;else lines.push({type,factories:n,progress:0,produced:0});
    ProductionManager.render();StrategyGame.publish();return true;
  }
  static tick() {
    const s=CoreEngine.gameState,a=ProductionManager.account(s.country),used={military:0,dockyard:0};
    a.civilian=s.civilianFactories;a.military=s.militaryFactories;a.dockyards=s.dockyards;a.construction=ConstructionManager.queue.reduce((n,q)=>n+q.factories,0);
    for (const line of s.strategy.production) {
      const def=ProductionManager.CATALOG[line.type];if(!def || (line.type==='battleship'&&ProductionManager.treatyLimited())) continue;
      const count=Math.max(0,Math.min(line.factories,ProductionManager.capacity(def.pool)-used[def.pool])); used[def.pool]+=count;
      const need=Object.fromEntries(Object.entries(def.resources).map(([k,v])=>[k,v*count/7]));
      line.shortage=Object.keys(need).filter(k=>(s.resources[k]||0)+1e-9<need[k]);
      if(!count || line.shortage.length) continue;
      Object.entries(need).forEach(([k,v])=>{s.resources[k]=Math.max(0,s.resources[k]-v);});
      const law=PoliticsManager.currentLaw('economy');
      line.progress=(line.progress||0)+def.rate*count*(1+(law.factoryOutput||0));
      const whole=Math.floor(line.progress+1e-9);line.progress-=whole;line.produced=(line.produced||0)+whole;a.stock[line.type]=(a.stock[line.type]||0)+whole;
    }
    ProductionManager.syncLocal();
  }
  static syncLocal() {
    const s=CoreEngine.gameState,a=ProductionManager.account(s.country);
    s.equipment=(a.stock.infantry||0)+(a.stock.rifle_old||0);
    s.planes=(a.stock.fighter||0)+(a.stock.transport||0);
    s.ships=(a.stock.destroyer||0)+(a.stock.submarine||0)+(a.stock.battleship||0);
  }
  static canConsume(needs) {
    const stock=ProductionManager.account(CoreEngine.gameState.country).stock;
    return Object.entries(needs).every(([k,n])=>(k==='infantry'?(stock.infantry||0)+(stock.rifle_old||0):(stock[k]||0))>=n);
  }
  static consume(needs) {
    if (!ProductionManager.canConsume(needs))return false;
    const stock=ProductionManager.account(CoreEngine.gameState.country).stock;
    Object.entries(needs).forEach(([k,n])=>{if(k==='infantry'){const old=Math.min(stock.rifle_old||0,n);stock.rifle_old-=old;stock.infantry-=n-old;}else stock[k]-=n;});
    ProductionManager.syncLocal();return true;
  }
  static render() {
    const el=document.getElementById('production-content');if(!el||!CoreEngine.gameState.strategy||GameTools.editing('production-content'))return;
    const s=CoreEngine.gameState,stock=ProductionManager.account(s.country).stock,law=PoliticsManager.currentLaw('economy');
    let html='<h3>⚙️ 装備生産</h3><p>軍需工場 '+s.militaryFactories+' / 造船所 '+s.dockyards+'。資源は実数を消費します。追加工場は「建設」で完成させてください。</p><div class="production-table">';
    Object.entries(ProductionManager.CATALOG).forEach(([type,d])=>{
      const line=s.strategy.production.find(l=>l.type===type),n=line?.factories||0,rate=d.rate*n*(1+(law.factoryOutput||0));
      html+='<div class="production-row"><b>'+d.name+(type==='battleship'&&ProductionManager.treatyLimited()?'（条約制限）':'')+'</b><span>在庫 '+Math.floor(stock[type]||0)+'</span><label>'+ (d.pool==='dockyard'?'造船所':'軍需工場')+' <input type="number" min="0" max="'+ProductionManager.capacity(d.pool)+'" value="'+n+'" onchange="ProductionManager.allocate(\''+type+'\',this.value)"></label><span>'+rate.toFixed(2)+'/日・'+(rate*7).toFixed(2)+'/週</span><small>週の消費: '+Object.entries(d.resources).map(([k,v])=>(ResourceManager.TRADE_RESOURCES.find(r=>r.id===k)?.name||k)+' '+(v*n).toFixed(1)).join(' / ')+(line?.shortage?.length?' — 資源不足で停止':'')+'</small></div>';
    });el.innerHTML=html+'</div>';
  }
}
class TradeManager {
  static import(type,name,value) {
    const s=CoreEngine.gameState,n=GameTools.integer(value??document.getElementById('import-'+type)?.value??8,1,100);
    if(!ResourceManager.TRADE_RESOURCES.some(r=>r.id===type)||n===null)return false;
    const factories=Math.ceil(n/8);
    if(ProductionManager.freeCivilian()<factories || s.convoys<5){GameUI.notify('空き民需工場または輸送船が不足しています。','alert');return false;}
    s.strategy.tradeLeases ||= [];s.strategy.tradeLeases.push({factories,expires:GameTools.day()+7});
    s.convoys-=5;s.resources[type]=(s.resources[type]||0)+n*10;
    CoreEngine.log(name+'を '+n+'口 = '+n*10+' 輸入しました（民需工場を7日間使用）。');TradeManager.render();return true;
  }
  static export(type,name) {
    const s=CoreEngine.gameState;if((s.resources[type]||0)<100)return;
    s.resources[type]-=100;s.politicalPower=Math.min(999,s.politicalPower+5);TradeManager.render();
  }
  static render() {
    const el=document.getElementById('trade-content');if(!el||!CoreEngine.gameState.strategy)return;
    const s=CoreEngine.gameState;
    el.innerHTML='<h3>資源・貿易</h3><p>1口 = 資源10。2口の輸入なら20増加します。生産の消費量は実数です。空き民需工場: '+FactoryBudget.availableCivilian()+'</p>'+ResourceManager.TRADE_RESOURCES.map(r=>'<div class="trade-row"><span>'+r.name+' 在庫 '+(s.resources[r.id]||0).toFixed(1)+'</span><label>輸入口数 <input id="import-'+r.id+'" type="number" min="1" max="100" value="8"></label>'+GameTools.button('輸入（8口につき工場1・7日間）',"ResourceManager.importResource('"+r.id+"','"+r.name+"')")+GameTools.button('100を輸出（政治力5）',"ResourceManager.exportResource('"+r.id+"','"+r.name+"')",s.resources[r.id]<100)+'</div>').join('');
  }
}

class MarketManager {
  static request(action,payload) {
    const s=CoreEngine.gameState;
    if(MultiplayerManager.connected&&!MultiplayerManager.isHost){
      StrategyGame.publish();MultiplayerManager.broadcast({type:'market_request',action,payload,country:s.country,requestId:crypto.randomUUID()});return;
    }
    if(!MarketManager.process(action,payload,s.country))GameUI.notify('取引できません。数量・在庫・空き民需工場を確認してください。','alert');
    MarketManager.broadcast();
  }
  static process(action,payload,tag,requestId) {
    const s=CoreEngine.gameState,st=s.strategy;
    if(!payload || !/^[A-Z]{3}$/.test(tag))return false;
    if(requestId && st.processed.includes(requestId)) return false;
    const a=ProductionManager.account(tag);let ok=false;
    if(action==='list') {
      const qty=GameTools.integer(payload.quantity,1,100000),def=ProductionManager.CATALOG[payload.type];
      if(qty!==null && def && (a.stock[payload.type]||0)>=qty){
        a.stock[payload.type]-=qty;st.offers.push({id:st.marketNextId++,seller:tag,type:payload.type,quantity:qty,remaining:qty});ok=true;
      }
    } else if(action==='cancel') {
      const offer=st.offers.find(o=>o.id===Number(payload.id)&&o.seller===tag);
      if(offer){a.stock[offer.type]=(a.stock[offer.type]||0)+offer.remaining;st.offers=st.offers.filter(o=>o!==offer);ok=true;}
    } else if(action==='buy') {
      const offer=st.offers.find(o=>o.id===Number(payload.id)),qty=GameTools.integer(payload.quantity,1,100000);
      if(offer && offer.seller!==tag && qty!==null && offer.remaining>=qty && !MarketManager.atWar(tag,offer.seller)) {
        const factories=Math.ceil(qty/100);
        if(ProductionManager.freeCivilian(tag)>=factories) {
          offer.remaining-=qty;a.stock[offer.type]=(a.stock[offer.type]||0)+qty;
          ProductionManager.account(offer.seller).marketVersion=(ProductionManager.account(offer.seller).marketVersion||0)+1;
          st.contracts.push({id:st.marketNextId++,seller:offer.seller,buyer:tag,quantity:qty,type:offer.type,factories,expires:GameTools.day()+30});ok=true;
        }
      }
    }
    if(ok)a.marketVersion=(a.marketVersion||0)+1;
    if(requestId){st.processed.push(requestId);if(st.processed.length>1000)st.processed.shift();}
    ProductionManager.syncLocal();MarketManager.render();return ok;
  }
  static atWar(a,b) {const s=CoreEngine.gameState;return a===s.country?s.atWar.includes(b):b===s.country?s.atWar.includes(a):AIManager.warActive(a,b);}
  static list() {MarketManager.request('list',{type:document.getElementById('market-type').value,quantity:Number(document.getElementById('market-quantity').value)});}
  static buy(id) {MarketManager.request('buy',{id,quantity:Number(document.getElementById('buy-'+id).value)});}
  static tick() {
    if(MultiplayerManager.connected&&!MultiplayerManager.isHost)return;
    const s=CoreEngine.gameState,st=s.strategy;
    st.contracts=st.contracts.filter(c=>c.expires>GameTools.day());
    if(GameTools.day()%7!==0)return;
    const humans=new Set([s.country,...Object.values(st.peers)]);
    Object.keys(StrategyGame.INITIAL).filter(t=>!humans.has(t)).forEach(tag=>{
      const a=ProductionManager.account(tag);
      if(!a.aiInitialized){if(!a.initialized){a.stock.rifle_old=1500;a.stock.infantry=3000;a.stock.artillery=400;a.stock.tank=120;a.stock.fighter=250;a.stock.destroyer=25;}a.aiInitialized=true;}
      a.stock.infantry+=70;
      if(!st.offers.some(o=>o.seller===tag&&o.remaining>0)){
        const threshold={rifle_old:200,infantry:3500,artillery:250,tank:80,fighter:150,destroyer:20};
        const type=Object.keys(threshold).find(k=>a.stock[k]>threshold[k]);
        if(type)MarketManager.process('list',{type,quantity:Math.min(300,a.stock[type]-threshold[type])},tag);
      }
      // Real inventory demand: wartime armies use rifles; AI does not purchase every listing.
      if(s.atWar.includes(tag)||AIManager.state?.wars.some(w=>w.a===tag||w.b===tag))a.stock.infantry=Math.max(0,a.stock.infantry-100);
      if(a.stock.infantry+a.stock.rifle_old<3000){
        const offer=st.offers.filter(o=>o.seller!==tag&&o.remaining>0&&['infantry','rifle_old'].includes(o.type)&&!MarketManager.atWar(tag,o.seller)).sort((a,b)=>Number(humans.has(b.seller))-Number(humans.has(a.seller)))[0];
        if(offer)MarketManager.process('buy',{id:offer.id,quantity:Math.min(100,offer.remaining)},tag);
      }
    });MarketManager.broadcast();
  }
  static broadcast() {
    if(!MultiplayerManager.connected||!MultiplayerManager.isHost)return;
    const st=CoreEngine.gameState.strategy;
    MultiplayerManager.broadcast({type:'market_snapshot',offers:st.offers,contracts:st.contracts,economies:st.economies});
  }
  static markup() {
    const s=CoreEngine.gameState,st=s.strategy,stock=ProductionManager.account(s.country).stock;
    let html='<h3>国際市場</h3><p>出品時に装備を取り置きします。購入成立後に100個につき民需工場1を30日間借りられます。出品だけでは対価は発生しません。</p><div class="market-form"><label>兵器 <select id="market-type">'+Object.entries(ProductionManager.CATALOG).map(([k,d])=>'<option value="'+k+'">'+d.name+'（在庫'+Math.floor(stock[k]||0)+'）</option>').join('')+'</select></label><label>数量 <input id="market-quantity" type="number" min="1" max="100000" value="100"></label>'+GameTools.button('出品','MarketManager.list()')+'</div>';
    st.offers.filter(o=>o.remaining>0).forEach(o=>{html+='<div class="trade-row"><span>'+o.seller+' — '+ProductionManager.CATALOG[o.type]?.name+' 残り '+o.remaining+'</span>'+(o.seller===s.country?GameTools.button('出品取消',"MarketManager.request('cancel',{id:"+o.id+"})"):'<label>数量 <input id="buy-'+o.id+'" type="number" min="1" max="'+o.remaining+'" value="'+Math.min(100,o.remaining)+'"></label>'+GameTools.button('購入','MarketManager.buy('+o.id+')',MarketManager.atWar(s.country,o.seller)))+'</div>';});
    html+='<h4>成立した契約</h4>'+st.contracts.filter(c=>c.buyer===s.country||c.seller===s.country).map(c=>'<p>'+c.seller+' → '+c.buyer+' : '+c.quantity+'個 / 民需工場 '+c.factories+' / 残り'+(c.expires-GameTools.day())+'日</p>').join('');return html;
  }
  static render() { if(WindowManager.isOpen('mio'))MIOManager.render(); }
}

class WarGoals {
  static IDEOLOGY={GER:'fascism',ITA:'fascism',JAP:'fascism',SOV:'communism',USA:'democracy',ENG:'democracy',FRA:'democracy',POL:'neutrality',CHI:'neutrality'};
  static ensure() {
    const st=CoreEngine.gameState.strategy;st.warGoals ||= {};st.tensionByCountry ||= {};
  }
  static ideology() {return CoreEngine.gameState.ideology||WarGoals.IDEOLOGY[CoreEngine.gameState.country]||'neutrality';}
  static validTarget(tag) {return tag!==CoreEngine.gameState.country && /^[A-Z]{3}$/.test(tag) && DiplomacyManager.countries.some(c=>c.id===tag);}
  static restriction(tag) {
    const s=CoreEngine.gameState,ideology=WarGoals.ideology();
    if(!WarGoals.validTarget(tag))return '有効な他国を選択してください';
    if(DiplomacyManager.factions.some(f=>f.members.includes(tag)&&f.members.includes(s.country)))return '同じ陣営の国です';
    if(ideology==='neutrality' && s.worldTension<50)return '中道は国際緊張度50%以上が必要';
    if(ideology==='democracy') {
      if(s.worldTension<100)return '民主主義は国際緊張度100%が必要';
      if(!(s.strategy.tensionByCountry[tag]>0))return '民主主義は国際緊張度を生んだ国のみ正当化可能';
    }
    return '';
  }
  static duration() {const s=CoreEngine.gameState,i=WarGoals.ideology();return s.atWar.length?(i==='fascism'?30:i==='communism'?90:180):180;}
  static justify(tag) {
    const s=CoreEngine.gameState,reason=WarGoals.restriction(tag);
    if(reason){GameUI.notify(reason,'alert');return false;}
    if(s.atWar.includes(tag)||s.justifying[tag]||WarGoals.canDeclare(tag))return false;
    if(s.politicalPower<25){GameUI.notify('政治力25が必要です。','alert');return false;}
    s.politicalPower-=25;s.justifying[tag]=WarGoals.duration();
    CoreEngine.addWorldTension(10,'戦争目標の正当化');s.strategy.tensionByCountry[s.country]=(s.strategy.tensionByCountry[s.country]||0)+10;
    CoreEngine.log(tag+'への正当化を開始（'+s.justifying[tag]+'日）。');DiplomacyManager.render();return true;
  }
  static grant(tag,source,days=120) {
    if(!WarGoals.validTarget(tag))return;
    CoreEngine.gameState.strategy.warGoals[tag]={source,expires:GameTools.day()+days};
    CoreEngine.gameState.justified[tag]=true;
  }
  static canDeclare(tag) {
    const s=CoreEngine.gameState,g=s.strategy?.warGoals[tag];
    return !!g && g.expires>GameTools.day() && WarGoals.validTarget(tag) && !s.atWar.includes(tag) && !WarGoals.allied(tag) && (g.source!=='justification'||!WarGoals.restriction(tag));
  }
  static declare(tag) {
    if(!WarGoals.canDeclare(tag)){GameUI.notify('対象国への有効な戦争目標が必要です。期限・政体・陣営条件を確認してください。','alert');return false;}
    return WarGoals.start(tag);
  }
  static allied(tag) {return DiplomacyManager.factions.some(f=>f.members.includes(tag)&&f.members.includes(CoreEngine.gameState.country));}
  static start(tag) {
    const s=CoreEngine.gameState;if(!WarGoals.validTarget(tag)||WarGoals.allied(tag)||s.atWar.includes(tag))return false;
    s.atWar.push(tag);delete s.justified[tag];delete s.justifying[tag];delete s.strategy.warGoals[tag];
    s.strategy.tensionByCountry[s.country]=(s.strategy.tensionByCountry[s.country]||0)+15;
    CoreEngine.addWorldTension(15,tag+'への宣戦布告');s.warSupport=Math.min(100,s.warSupport+5);
    CoreEngine.log(tag+'との戦争が始まりました。');DiplomacyManager.render();
    MultiplayerManager.broadcast({type:'declare_war',target:tag});return true;
  }
  static tick() {
    const s=CoreEngine.gameState;
    Object.keys(s.justifying).forEach(tag=>{
      s.justifying[tag]--;
      if(s.justifying[tag]<=0){delete s.justifying[tag];WarGoals.grant(tag,'justification');GameUI.notify(tag+'への正当化が完了。戦争目標は120日間有効です。','success');}
    });
    Object.entries(s.strategy.warGoals).forEach(([tag,g])=>{if(g.expires<=GameTools.day()){delete s.strategy.warGoals[tag];delete s.justified[tag];}});
    if(WindowManager.isOpen('diplomacy'))DiplomacyManager.renderCountryList();
  }
  static button(tag) {
    const reason=WarGoals.restriction(tag);
    return GameTools.button('正当化（政治力25・'+WarGoals.duration()+'日）',"DiplomacyManager.justifyWarGoal('"+tag+"')",!!reason)+(reason?'<p class="rule-note">'+reason+'</p>':'');
  }
}
class DecisionManager {
  static DEFS=[
    {id:'naval_treaty',name:'海軍軍縮条約を破棄',cost:100,days:30,tags:['JAP','USA','ENG','FRA','ITA'],desc:'大型艦の建造制限を解除。国際緊張度+5%。'},
    {id:'marco_polo',name:'盧溝橋で国境紛争',cost:50,days:30,tags:['JAP'],desc:'国境紛争を準備。その後「中国へのルビコン川」で戦争を拡大。'},
    {id:'rubicon',name:'中国へのルビコン川',cost:100,days:30,tags:['JAP'],requires:'marco_polo',desc:'事態を拡大し、中国との全面戦争に移行。'},
    {id:'winter_demand',name:'フィンランドへの領土要求',cost:75,days:45,tags:['SOV'],desc:'拒否された場合は即座に冬戦争を開始。'},
    {id:'danzig_demand',name:'ダンツィヒの割譲要求',cost:75,days:45,tags:['GER'],focus:'GER_danzig_or_war',desc:'ダンツィヒか戦争かの方針取得後に要求。拒否されると即時開戦。'},
    {id:'peace_mission',name:'和平外交を展開',cost:75,days:60,desc:'史実と異なる外交路線。国際緊張度-5%、安定度+5%。',repeatable:true},
    {id:'defense_drill',name:'全国防衛演習',cost:50,days:60,desc:'戦争協力度+5%、組織力を回復。',repeatable:true},
    {id:'revision_claim',name:'国境改定の要求',cost:150,days:180,desc:'中道・ファシズム・共産主義向け。選択した国への120日間の戦争目標。',target:true}
  ];
  static available(d) {
    const s=CoreEngine.gameState,states=s.strategy.decisions;
    if(d.tags&&!d.tags.includes(s.country))return '自国向けではありません';
    if(d.requires&&!states[d.requires]?.done)return '先に '+d.requires+' を完了してください';
    if(d.focus&&!FocusTreeManager.completedFocuses.has(d.focus))return '必要な国家方針を取得してください';
    if(d.target&&WarGoals.ideology()==='democracy')return '民主主義はこの領土要求を実行できません';
    if(states[d.id]?.remaining>0)return '準備中';
    if(states[d.id]?.done&&!d.repeatable)return '実行済み';return '';
  }
  static start(id) {
    const d=DecisionManager.DEFS.find(x=>x.id===id),s=CoreEngine.gameState;if(!d||DecisionManager.available(d))return false;
    const target=d.target?document.getElementById('decision-target').value:null;
    if(d.target&&(!WarGoals.validTarget(target)||WarGoals.restriction(target))){GameUI.notify(WarGoals.restriction(target),'alert');return false;}
    if(s.politicalPower<d.cost){GameUI.notify('政治力が不足しています。','alert');return false;}
    s.politicalPower-=d.cost;s.strategy.decisions[id]={remaining:d.days,target,done:false};DecisionManager.render();return true;
  }
  static tick() {
    const s=CoreEngine.gameState;
    Object.entries(s.strategy.decisions).forEach(([id,r])=>{if(r.remaining<=0||r.done)return;r.remaining--;if(r.remaining===0){r.done=true;DecisionManager.finish(id,r);}});
  }
  static finish(id,r) {
    const s=CoreEngine.gameState;
    if(id==='naval_treaty'){s.strategy.navalTreatyBroken=true;CoreEngine.addWorldTension(5,'海軍軍縮条約の破棄');s.strategy.tensionByCountry[s.country]=(s.strategy.tensionByCountry[s.country]||0)+5;}
    if(id==='danzig_demand')DecisionManager.demand('POL','ダンツィヒの割譲要求');
    if(id==='winter_demand')DecisionManager.demand('FIN','フィンランドへの要求');
    if(id==='rubicon')WarGoals.start('CHI');
    if(id==='revision_claim')WarGoals.grant(r.target,'decision');
    if(id==='peace_mission'){s.worldTension=Math.max(0,s.worldTension-5);s.stability=Math.min(100,s.stability+5);}
    if(id==='defense_drill'){s.warSupport=Math.min(100,s.warSupport+5);ArmyRoster.all().forEach(d=>d.org=Math.min(d.maxOrg,d.org+10));}
    CoreEngine.log('ディシジョン完了: '+DecisionManager.DEFS.find(d=>d.id===id)?.name);
  }
  static demand(tag,title) {
    const s=CoreEngine.gameState;if(!WarGoals.validTarget(tag)||s.atWar.includes(tag))return;
    const sid=Object.keys(MapRenderer.states).find(id=>MapRenderer.states[id].owner===tag&&(/danzig|gdansk|カレリア|karelia/i.test(MapRenderer.states[id].name))) || Object.keys(MapRenderer.states).find(id=>MapRenderer.states[id].owner===tag);
    const accepted=Math.random()<.15;
    if(accepted&&sid){MapRenderer.captureState(sid,s.country);NewsManager.fireCustom({id:'demand-'+tag+'-'+GameTools.day(),title,body:tag+'は割譲を受諾しました。戦争は回避されました。'});}
    else {WarGoals.start(tag);NewsManager.fireCustom({id:'demand-'+tag+'-'+GameTools.day(),title,body:tag+'は要求を拒否しました。イベントの結果、両国は直ちに戦争状態に入りました。'});}
  }
  static onFocus(f) {
    if(f.id==='GER_danzig_or_war'){CoreEngine.gameState.strategy.decisions.danzig_demand={done:true,remaining:0};DecisionManager.demand('POL','ダンツィヒか戦争か');}
    if(['SOV_secure_leningrad','SOV_secure_finland'].includes(f.id))DecisionManager.demand('FIN','フィンランドへの要求');
    if(/marco_polo/i.test(f.id))CoreEngine.gameState.strategy.decisions.marco_polo={done:true,remaining:0};
  }
  static render() {
    const el=document.getElementById('decisions-content');if(!el||!CoreEngine.gameState.strategy||GameTools.editing('decisions-content'))return;
    const s=CoreEngine.gameState;
    el.innerHTML='<h3>ディシジョン</h3><p>政治力を消費し、準備期間の完了後に効果が発生します。</p><label>領土要求の対象 <select id="decision-target">'+DiplomacyManager.countries.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('')+'</select></label>'+DecisionManager.DEFS.filter(d=>!d.tags||d.tags.includes(s.country)).map(d=>{const r=s.strategy.decisions[d.id],reason=DecisionManager.available(d);return '<div class="dlc-card"><h4>'+d.name+'</h4><p>'+d.desc+'</p><p>政治力 '+d.cost+' / 準備 '+d.days+'日'+(r?.remaining?' / 残り'+r.remaining+'日':'')+'</p>'+GameTools.button(reason||'準備開始',"DecisionManager.start('"+d.id+"')",!!reason)+'</div>';}).join('');
  }
}
class CountryDossier {
  static PORTRAITS=Object.fromEntries(['baldwin','lebrun','fdr','mussolini'].map(id=>[id,'assets/leaders/'+id+'.jpg']));
  static LEADERS={GER:['hitler','アドルフ・ヒトラー'],SOV:['stalin','ヨシフ・スターリン'],JAP:['hirohito','昭和天皇'],USA:['fdr','フランクリン・ルーズベルト'],ITA:['mussolini','ベニート・ムッソリーニ'],ENG:['baldwin','スタンリー・ボールドウィン'],FRA:['lebrun','アルベール・ルブラン']};
  static open(tag) {
    const s=CoreEngine.gameState,publicInfo=s.strategy.publicCountries[tag],def=CountryDossier.LEADERS[tag]||[null,DiplomacyManager.nameOf(tag)+'の指導者'];
    const id=publicInfo?.leader||def[0];
    const existing=GameTools.card(id,tag)||GameTools.card(id,'WORLD'),card={...existing,imgUrl:existing?.imgUrl||CountryDossier.PORTRAITS[id]};
    const ai=AIManager.aiOf(tag),focus=AIManager.focusList(tag)[ai.idx]?.name||'国家方針完了';
    GameUI.openModal(DiplomacyManager.nameOf(tag)+' — 政府情報','<div class="foreign-portrait">'+GameTools.portrait(card,def[1])+'<h3>'+GameTools.escape(card?.name||def[1])+'</h3></div><h4>現在の国家方針</h4><p>'+GameTools.escape(publicInfo?.focus||focus)+'</p><p>内政・工場・兵器・兵力の詳細は非公開です。</p>'+GameTools.button('外交画面へ',"GameUI.closeModal();WindowManager.open('diplomacy')")+GameTools.button('諜報を確認',"GameUI.closeModal();WindowManager.open('intel');IntelligenceManager.selectTarget('"+tag+"')"));
  }
}

class IntelOperations {
  static ensure() {
    const s=CoreEngine.gameState;
    s.intel ||= {agency:null,level:0,spies:0,op:null};
    s.intel.assignments ||= [];
    s.intel.targets ||= {};
    s.strategy.worldForces ||= {};
    s.intel.recruiting ||= [];
  }
  static target(tag) {IntelOperations.ensure();return CoreEngine.gameState.intel.targets[tag] ||= {network:0,decrypt:0,decoded:false,revealUntil:0};}
  static selectTarget(tag) {CoreEngine.gameState.intel.selected=tag;IntelOperations.render();}
  static createAgency() {
    const s=CoreEngine.gameState;IntelOperations.ensure();
    if(s.intel.agency||s.intel.building)return false;
    if(s.politicalPower<50||ProductionManager.freeCivilian()<2){GameUI.notify('政治力50・空き民需工場2が必要です。','alert');return false;}
    s.politicalPower-=50;s.intel.building={days:30,kind:'create'};IntelOperations.render();return true;
  }
  static upgrade() {
    const s=CoreEngine.gameState;
    if(!s.intel.agency||s.intel.building||s.intel.level>=5||ProductionManager.freeCivilian()<2||s.politicalPower<100*s.intel.level)return false;
    s.politicalPower-=100*s.intel.level;s.intel.building={days:60,kind:'upgrade'};IntelOperations.render();return true;
  }
  static hireSpy() {
    const s=CoreEngine.gameState;
    if(!s.intel.agency||s.intel.spies+s.intel.recruiting.length>=s.intel.level*2||s.politicalPower<75)return false;
    s.politicalPower-=75;s.intel.recruiting.push({days:30});IntelOperations.render();return true;
  }
  static assign(slot,kind,tag) {
    const intel=CoreEngine.gameState.intel;
    if(!GameTools.integer(slot,0,intel.spies-1)&&slot!==0)return false;
    if(slot<0||slot>=intel.spies||!['idle','counter','network','decrypt'].includes(kind))return false;
    if(['network','decrypt'].includes(kind)&&!WarGoals.validTarget(tag))return false;
    if(intel.op?.slots.includes(slot))return false;
    if(kind==='decrypt'&&(intel.level<2||IntelOperations.target(tag).network<40)){GameUI.notify('暗号解読には機関Lv2・対象国の情報網40%以上が必要です。','alert');return false;}
    intel.assignments[slot]={kind,target:tag,preparation:30};IntelOperations.render();return true;
  }
  static counterPower() {return (CoreEngine.gameState.intel?.assignments||[]).filter(a=>a.kind==='counter'&&a.preparation<=0).length;}
  static startOp(id) {
    const s=CoreEngine.gameState,tag=s.intel.selected,def=DLC_INTEL_OPS.find(o=>o.id===id);
    if(id==='crypto') { const slot=s.intel.assignments.findIndex(a=>a.kind==='idle');return IntelOperations.assign(slot,'decrypt',tag); }
    const idle=Array.from({length:s.intel.spies},(_,i)=>i).filter(i=>(!s.intel.assignments[i]||s.intel.assignments[i].kind==='idle'));
    if(!def||s.intel.op||!tag||idle.length<2||IntelOperations.target(tag).network<50||s.politicalPower<50){GameUI.notify('情報網50%・待機諜報員2名・政治力50が必要です。','alert');return false;}
    s.politicalPower-=50;s.intel.op={id,target:tag,slots:idle.slice(0,2),preparation:45,progress:0,dur:90};IntelOperations.render();return true;
  }
  static cancelOp() {CoreEngine.gameState.intel.op=null;IntelOperations.render();}
  static tick() {
    IntelOperations.ensure();const s=CoreEngine.gameState,intel=s.intel;
    if(intel.building) {
      intel.building.days--;
      if(intel.building.days<=0){if(intel.building.kind==='create'){intel.agency=s.country+'諜報総局';intel.level=1;}else intel.level++;intel.building=null;}
    }
    intel.recruiting.forEach(r=>r.days--);
    intel.recruiting.filter(r=>r.days<=0).forEach(()=>{intel.assignments[intel.spies++]={kind:'idle',preparation:0};});
    intel.recruiting=intel.recruiting.filter(r=>r.days>0);
    intel.assignments.forEach((a,i)=>{
      if(intel.op?.slots.includes(i)||a.kind==='idle')return;
      if(a.preparation>0){a.preparation--;return;}
      if(a.kind==='counter')return;
      const t=IntelOperations.target(a.target);
      if(a.kind==='network') t.network=Math.min(100,t.network+.55+intel.level*.05);
      if(a.kind==='decrypt'&&t.network>=40) {t.decrypt++;if(t.decrypt>=Math.max(120,210-intel.level*15)){t.decoded=true;}}
    });
    Object.entries(intel.targets).forEach(([tag,t])=>{
      if(!intel.assignments.some(a=>a.kind==='network'&&a.target===tag))t.network=Math.max(0,t.network-.15);
    });
    if(intel.op){const op=intel.op;if(op.preparation>0)op.preparation--;else op.progress++;
      if(op.progress>=op.dur){
        if(op.id==='infil')IntelOperations.target(op.target).network=Math.min(100,IntelOperations.target(op.target).network+20);
        if(op.id==='politics')s.stability=Math.min(100,s.stability+3);
        if(op.id==='subvert')s.warSupport=Math.min(100,s.warSupport+3);
        CoreEngine.log('諜報作戦完了: '+op.target);intel.op=null;
      }
    }
  }
  static mission(tag) {
    const t=IntelOperations.target(tag);
    if(!t.decoded||t.network<40){GameUI.notify('情報網40%以上と暗号解読の完了が必要です。','alert');return false;}
    const digits=String(Math.floor(Math.random()*10000)).padStart(4,'0'),word=Array.from({length:4},()=> 'abcd'[Math.floor(Math.random()*4)]).join('');
    IntelOperations.resumeSpeed=CoreEngine.gameState.speed; CoreEngine.setSpeed(0);
    IntelOperations.challenge={tag,digits,word,values:Array.from({length:4},()=>Math.floor(Math.random()*10))};
    GameUI.openModal('暗号通信の照合','<div id="crypto-mission"><h3>通信照合任務</h3><p>傍受番号 <strong class="cipher-code">'+digits+'</strong> に4つのダイヤルを合わせ、通信文 <strong class="cipher-code">'+word+'</strong> をタイプしてください。</p><div class="cipher-dials">'+Array.from({length:4},(_,i)=>'<div class="cipher-dial"><button aria-label="'+(i+1)+'桁目を戻す" onclick="IntelOperations.rotate('+i+',-1)">−</button><output id="dial-'+i+'">'+IntelOperations.challenge.values[i]+'</output><button aria-label="'+(i+1)+'桁目を進める" onclick="IntelOperations.rotate('+i+',1)">＋</button></div>').join('')+'</div><label>タイプライター <input id="cipher-word" maxlength="4" autocomplete="off" spellcheck="false" aria-label="傍受した英字4文字"></label><p id="cipher-result" role="status"></p>'+GameTools.button('照合する','IntelOperations.submit()')+'</div>');
    document.querySelectorAll('.cipher-dial').forEach((el,i)=>el.addEventListener('wheel',e=>{e.preventDefault();IntelOperations.rotate(i,e.deltaY>0?1:-1);},{passive:false}));return true;
  }
  static closeMission() {
    if(!IntelOperations.challenge) return;
    IntelOperations.challenge=null;
    const speed=IntelOperations.resumeSpeed;IntelOperations.resumeSpeed=0;
    if(speed && !NewsManager.showing) CoreEngine.setSpeed(speed);
  }
  static rotate(i,delta) {
    const c=IntelOperations.challenge;if(!c)return;c.values[i]=(c.values[i]+delta+10)%10;
    const el=document.getElementById('dial-'+i);if(el)el.textContent=c.values[i];
  }
  static submit() {
    const c=IntelOperations.challenge;if(!c)return false;
    const input=document.getElementById('cipher-word').value.trim().toLowerCase();
    if(c.values.join('')!==c.digits||input!==c.word){document.getElementById('cipher-result').textContent='照合失敗。ダイヤルと通信文を再確認してください。';return false;}
    const t=IntelOperations.target(c.tag);if(!t.decoded||t.network<40)return false;
    t.revealUntil=GameTools.day()+7;BattlePlanManager._enemyDivTick=0;GameUI.closeModal();
    MapRenderer.centerOn(c.tag);GameUI.notify('通信照合成功。7日間、敵の師団・艦隊位置と任務を地図で確認できます。','success');IntelOperations.render();return true;
  }
  static forces(tag) {
    const s=CoreEngine.gameState;
    if(tag===s.country)return {divisions:ArmyRoster.all(),navy:BattlePlanManager.navy};
    const remote=s.strategy.publicCountries[tag];if(remote?.divisions)return {divisions:remote.divisions,navy:remote.navy||[]};
    const st=s.strategy.worldForces;
    const states=Object.entries(MapRenderer.states||{}).filter(([id,t])=>t.owner===tag);
    if(!st[tag]) {
      const centers=states.map(([sid,t])=>({sid,pid:t.provinces.find(OffensivePlanner.isLand)})).filter(x=>x.pid);
      const count=StrategyGame.INITIAL[tag]||20;
      st[tag]={divisions:centers.length?Array.from({length:count},(_,i)=>{const pt=centers[i%centers.length],c=MapRenderer.provCentroid.get(pt.pid);return {id:tag+'-'+i,pid:pt.pid,sid:pt.sid,x:c?.[0]||0,y:c?.[1]||0,type:'infantry',mission:s.atWar.includes(tag)?'前線防衛':'駐屯'};}):[],navy:[]};
      const coast=states.find(([id,t])=>t.provinces.some(p=>MapRenderer.provinces.p[p]?.[4]));
      if(coast){const base=MapRenderer.stateCenter.get(coast[0]);if(base)st[tag].navy=[{id:tag+'-fleet',name:tag+'艦隊',count:tag==='JAP'||tag==='ENG'?40:15,base:base.slice(),mission:'patrol'}];}
    }
    // Troops displaced by an actual capture relocate to the nearest remaining territory.
    st[tag].divisions.forEach(d=>{if(MapRenderer.ownerOf(d.pid)!==tag){const next=OffensivePlanner.nearest([d.x,d.y],p=>MapRenderer.ownerOf(p)===tag);if(next){const c=MapRenderer.provCentroid.get(next);d.pid=next;d.x=c[0];d.y=c[1];}else d.defeated=true;}});
    return st[tag];
  }
  static hasReveal() {return Object.values(CoreEngine.gameState.intel?.targets||{}).some(t=>t.revealUntil>GameTools.day());}
  static visibleDivisions() {
    if(!MapRenderer.ready||!CoreEngine.gameState.strategy)return [];
    const s=CoreEngine.gameState,tags=new Set([...s.atWar,...Object.entries(s.intel?.targets||{}).filter(([tag,t])=>t.revealUntil>GameTools.day()).map(([tag])=>tag)]),result=[];
    tags.forEach(tag=>{
      const full=IntelOperations.target(tag).revealUntil>GameTools.day();
      const groups=new Map();
      IntelOperations.forces(tag).divisions.filter(d=>!d.defeated).forEach(d=>{
        const pid=d.pid||OffensivePlanner.nearest([d.x,d.y]);
        const visible=full||[...(MapRenderer.provNeighbors.get(pid)||[])].some(n=>MapRenderer.ownerOf(n)===s.country);
        if(!visible)return;
        const key=pid;if(!groups.has(key))groups.set(key,{tag,sid:MapRenderer.stateOf(pid),x:d.x,y:d.y,count:0,mission:full?(d.mission||'駐屯'):null});groups.get(key).count++;
      });result.push(...groups.values());
    });return result;
  }
  static draw(ctx,worldToScreen) {
    Object.entries(CoreEngine.gameState.intel?.targets||{}).filter(([tag,t])=>t.revealUntil>GameTools.day()).forEach(([tag])=>{
      IntelOperations.forces(tag).navy.forEach(n=>{const p=n.zone?[n.zone.x,n.zone.y]:n.base;if(!p)return;const c=worldToScreen(...p);ctx.fillStyle='#e5c274';ctx.font='bold 12px sans-serif';ctx.fillText('⚓ '+tag+' '+(n.mission||'待機'),c[0],c[1]);});
    });
  }
  static render() {
    const el=document.getElementById('intel-content');if(!el||!CoreEngine.gameState.strategy||GameTools.editing('intel-content'))return;IntelOperations.ensure();
    const s=CoreEngine.gameState,i=s.intel;
    let html='<h3>諜報機関</h3><p>機関設立30日、諜報員の養成30日、任務配置30日。情報網の構築と暗号解読には長い準備が必要です。</p>';
    if(!i.agency){el.innerHTML=html+(i.building?'<p>機関設立まで '+i.building.days+'日</p>':GameTools.button('設立（政治力50）','IntelligenceManager.createAgency()'));return;}
    html+='<p>'+i.agency+' Lv'+i.level+' / 諜報員 '+i.spies+'名 / 養成中 '+i.recruiting.map(r=>r.days+'日').join(', ')+'</p>'+GameTools.button('拡張（政治力'+(i.level*100)+'・60日）','IntelligenceManager.upgrade()',!!i.building||i.level>=5)+GameTools.button('諜報員養成（政治力75・30日）','IntelligenceManager.hireSpy()');
    if(i.building)html+='<p>拡張まで '+i.building.days+'日</p>';
    const tag=i.selected||DiplomacyManager.countries[0]?.id;if(tag)i.selected=tag;
    html+='<label>対象国 <select onchange="IntelligenceManager.selectTarget(this.value)">'+DiplomacyManager.countries.map(c=>'<option value="'+c.id+'"'+(c.id===tag?' selected':'')+'>'+c.name+'</option>').join('')+'</select></label>';
    if(tag){const t=IntelOperations.target(tag);html+='<p>情報網 '+t.network.toFixed(1)+'% / 暗号解読 '+t.decrypt+'/'+Math.max(120,210-i.level*15)+'日 '+(t.decoded?'完了':'')+'</p>'+GameTools.button('情報を見る（通信照合任務）',"IntelOperations.mission('"+tag+"')",!t.decoded||t.network<40)+'<p>情報公開の残り '+Math.max(0,t.revealUntil-GameTools.day())+'日</p>';
      if(t.revealUntil>GameTools.day()){const f=IntelOperations.forces(tag);html+='<p>傍受情報: 師団 '+f.divisions.filter(d=>!d.defeated).length+' / 艦隊 '+f.navy.length+'。地図上で位置と任務を確認できます。</p>';}}
    for(let slot=0;slot<i.spies;slot++){
      const a=i.assignments[slot]||{kind:'idle',preparation:0};
      html+='<div class="dlc-row">諜報員 '+(slot+1)+' — '+GameTools.escape(a.kind)+(a.target?' / '+a.target:'')+(a.preparation>0?' 準備 '+a.preparation+'日':'')+'<select onchange="IntelligenceManager.assign('+slot+',this.value,\''+(tag||'')+'\')"'+(i.op?.slots.includes(slot)?' disabled':'')+'>'+[['idle','待機'],['counter','防諜'],['network','情報網構築'],['decrypt','暗号解読']].map(([v,n])=>'<option value="'+v+'"'+(a.kind===v?' selected':'')+'>'+n+'</option>').join('')+'</select></div>';
    }
    html+='<h4>潜入オペレーション</h4><p>情報網50%以上・待機諜報員2名・政治力50。準備45日＋実行90日。</p>';
    if(i.op)html+='<p>'+i.op.target+' / '+i.op.id+' 準備残り'+i.op.preparation+'日 実行 '+i.op.progress+'/'+i.op.dur+'日</p>'+GameTools.button('中止','IntelligenceManager.cancelOp()');
    else html+=DLC_INTEL_OPS.filter(o=>o.id!=='crypto').map(o=>GameTools.button(o.name,"IntelligenceManager.startOp('"+o.id+"')")).join('');
    el.innerHTML=html;
  }
}
