/* peace-conference.js — HOI4風「傀儡国・講和会議 (Puppets & Peace Conference)」
 *
 *  - 戦勝点 (War Score): 敵師団の撃破数 / 占領したVP / 受けた被害 から交戦国ごとに自動集計
 *  - 降伏判定: 敵国の残存VPが元の25%未満 (または領土喪失) で降伏。敵陣営の全主要国 (陣営が無ければ当該国) が降伏すると
 *    全画面の講和会議が自動で開く (ゲームは一時停止)
 *  - 講和会議: 左に戦勝国と残余戦勝点、中央に国家/州リスト (地図クリックでも選択可)、右に要求 (併合/傀儡化/政府転覆/賠償金)。
 *    ターン制 — 全戦勝国がパスするか戦勝点を使い切ると条約確定、地図の国境と所有権を即座に書き換える
 *  - 傀儡国と自治度: 傀儡国 → 被保護国 → 植民地 → 自治領 → 独立。工場建設支援 / 資源供給 / 人手徴用 / 自治度抑圧 で変動、
 *    自治度0で完全併合、1000で独立
 */
class PeaceSystem {
  static MAJORS = ['GER', 'SOV', 'USA', 'ENG', 'FRA', 'ITA', 'JAP'];
  static LEVELS = [
    { id: 'puppet',       name: '傀儡国',   icon: '🎭', min: 0,   max: 249, resourceShare: 0.75, manpowerShare: 0.5,  desc: '宗主国に完全従属。資源の75%・人的資源の50%を供出。' },
    { id: 'protectorate', name: '被保護国', icon: '🛡️', min: 250, max: 499, resourceShare: 0.5,  manpowerShare: 0.3,  desc: '外交・軍事を宗主国が管理。資源の50%を供出。' },
    { id: 'colony',       name: '植民地',   icon: '🏝️', min: 500, max: 749, resourceShare: 0.35, manpowerShare: 0.15, desc: '内政は半独立。資源の35%を供出。' },
    { id: 'dominion',     name: '自治領',   icon: '🏛️', min: 750, max: 999, resourceShare: 0.15, manpowerShare: 0.05, desc: 'ほぼ独立。資源の15%のみ供出。1000で独立。' },
  ];
  static DEMANDS = {
    annex:   { id: 'annex',   name: '領土併合', icon: '🗺️', scope: 'state',   desc: '選択した州を自国領に編入する。コストは州のVPに比例。' },
    puppet:  { id: 'puppet',  name: '傀儡化',   icon: '🎭', scope: 'country', desc: '敗戦国を傀儡国として存続させる (残存州数に比例)。自治度 200 から開始。' },
    regime:  { id: 'regime',  name: '政府転覆', icon: '🗳️', scope: 'country', desc: '敗戦国の政体を自国と同じ体制に変える。関係 +50。' },
    reparations: { id: 'reparations', name: '賠償金請求', icon: '💰', scope: 'country', desc: '民需工場 2 を獲得し、5年間 毎日 資源と政治力を受け取る。' },
  };
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static nameOf(tag) { return typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(tag) : tag; }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }

  // ==========================================================
  // 初期化
  // ==========================================================
  static init() {
    if (PeaceSystem.installed) return;
    PeaceSystem.installed = true;
    PeaceSystem.installUI();
    PeaceSystem.installHooks();
    CoreEngine.registerTickCallback(() => PeaceSystem.onTick());
    CoreEngine.log('🕊️ 講和会議・傀儡国システムが有効になりました。');
  }
  static data() {
    const s = CoreEngine.gameState; if (!s.strategy) return null;
    const p = (s.strategy.peace ||= { warScore: {}, subjects: {}, origVP: {}, reparations: [], history: [], conference: null });
    p.warScore ||= {}; p.subjects ||= {}; p.origVP ||= {}; p.reparations ||= []; p.history ||= [];
    return p;
  }
  static installUI() {
    const root = document.getElementById('window-templates');
    if (root && !document.getElementById('tpl-subjects')) {
      const el = document.createElement('div');
      el.className = 'window-template pane-scroll'; el.id = 'tpl-subjects';
      el.dataset.title = '🏛️ 自治度 — Subject Status'; el.dataset.w = '1100'; el.dataset.h = '720';
      el.innerHTML = '<div id="subjects-content"></div>';
      root.appendChild(el);
    }
    if (typeof GameUI !== 'undefined' && !GameUI._peaceHooked) {
      GameUI._peaceHooked = true;
      const orig = GameUI.onWindowOpened.bind(GameUI);
      GameUI.onWindowOpened = (tab) => { orig(tab); if (tab === 'subjects') PeaceSystem.renderSubjects(); };
    }
  }
  static installHooks() {
    // 外交画面に「自治度」ボタン
    if (typeof DiplomacyManager !== 'undefined' && !DiplomacyManager._peaceHooked) {
      DiplomacyManager._peaceHooked = true;
      const orig = DiplomacyManager.render.bind(DiplomacyManager);
      DiplomacyManager.render = () => {
        orig();
        const c = document.getElementById('diplomacy-content'); if (!c || typeof c.insertAdjacentHTML !== 'function') return;
        const n = Object.keys(PeaceSystem.subjectsOf(CoreEngine.gameState.country)).length;
        c.insertAdjacentHTML('afterbegin', '<div class="pc-diplo-bar"><button class="pc-btn primary" onclick="GameUI.switchTab(\'subjects\')">🏛️ 自治度 (Subject Status) — 属国 ' + n + 'か国</button>' +
          '<button class="pc-btn" onclick="PeaceSystem.openScoreModal()">🏆 戦勝点を確認</button>' + (PeaceSystem.data()?.conference ? '<button class="pc-btn danger" onclick="PeaceSystem.renderConference()">🕊️ 講和会議を再開</button>' : '') + '</div>');
      };
    }
    // 戦勝点: 戦闘結果
    if (typeof BattleManager !== 'undefined' && !BattleManager._peaceHooked) {
      BattleManager._peaceHooked = true;
      const orig = BattleManager.resolve.bind(BattleManager);
      BattleManager.resolve = (b) => { try { PeaceSystem.onBattleResolved(b); } catch (e) { /* ignore */ } orig(b); };
    }
    // 戦勝点: VP 占領
    if (typeof OffensivePlanner !== 'undefined' && !OffensivePlanner._peaceHooked) {
      OffensivePlanner._peaceHooked = true;
      const orig = OffensivePlanner.capture.bind(OffensivePlanner);
      OffensivePlanner.capture = (pid, owner, broadcast) => {
        const prev = MapRenderer.ownerOf(Number(pid));
        const ok = orig(pid, owner, broadcast);
        if (ok && prev && prev !== owner) PeaceSystem.onCapture(Number(pid), prev, owner);
        return ok;
      };
    }
    // 地図クリック → 講和会議の州選択 / 属国の州情報
    if (typeof MapRenderer !== 'undefined' && !MapRenderer._peaceHooked) {
      MapRenderer._peaceHooked = true;
      const orig = MapRenderer.selectProvince.bind(MapRenderer);
      MapRenderer.selectProvince = (pid) => {
        orig(pid);
        const c = PeaceSystem.data()?.conference;
        if (c && PeaceSystem.pickingOnMap) {
          const sid = String(MapRenderer.stateOf(pid) || '');
          if (sid && c.defeated.includes(MapRenderer.states[sid]?.owner)) { c.selectedState = sid; c.selectedCountry = MapRenderer.states[sid].owner; }
          PeaceSystem.pickingOnMap = false;
          PeaceSystem.renderConference();
        }
      };
    }
  }

  // ==========================================================
  // 戦勝点
  // ==========================================================
  static score(tag) { const p = PeaceSystem.data(); return (p.warScore[tag] ||= { kills: 0, vp: 0, damage: 0, states: 0 }); }
  static vpOf(pid, st) { return Number(st?.vp?.[pid] || 0); }
  static onBattleResolved(b) {
    const s = CoreEngine.gameState, me = s.country;
    if (b.kind === 'offensive' && b.attacker === me) {
      const sc = PeaceSystem.score(me);
      if (b.advantage >= 0.1) sc.kills += 1 + Math.floor(Math.random() * 2); else sc.damage += 1;
    } else if (b.kind === 'defense' && b.defender === me) {
      const sc = PeaceSystem.score(me);
      if (b.advantage > -0.1) sc.kills += 1; else sc.damage += 2;
    }
  }
  static onCapture(pid, prev, owner) {
    const sid = MapRenderer.stateOf(pid), st = MapRenderer.states[sid];
    const vp = PeaceSystem.vpOf(pid, st);
    const sc = PeaceSystem.score(owner);
    if (vp > 0) sc.vp += vp;
    if (st && st.owner === owner) sc.states += 1;
    if (prev === CoreEngine.gameState.country) PeaceSystem.score(prev).damage += 1 + vp;
  }
  /** 戦勝点 = 撃破×4 + 占領VP×2 + 占領州×3 − 被害×1 (最低 0) */
  static warScore(tag) {
    const sc = PeaceSystem.score(tag);
    return Math.max(0, Math.round(sc.kills * 4 + sc.vp * 2 + sc.states * 3 - sc.damage));
  }
  /** AI 戦勝国の推定戦勝点: 敗戦国の元領土をどれだけ保持しているか */
  static estimateScore(tag, defeated) {
    let pts = 0;
    Object.entries(MapRenderer.states || {}).forEach(([sid, st]) => {
      if (st.owner === tag && defeated.includes(st.initialOwner || st.owner) && st.owner !== (st.initialOwner || st.owner)) pts += 3 + Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) * 2;
    });
    return Math.round(pts + (PeaceSystem.MAJORS.includes(tag) ? 20 : 8));
  }
  static openScoreModal() {
    const s = CoreEngine.gameState, sc = PeaceSystem.score(s.country);
    const enemies = (s.atWar || []).map(t => { const o = PeaceSystem.origVPOf(t), cur = PeaceSystem.currentVP(t); return '<tr><td>' + PeaceSystem.esc(PeaceSystem.nameOf(t)) + '</td><td>' + cur + ' / ' + o + '</td><td>' + (o ? Math.round(cur / o * 100) : 0) + '%</td><td>' + (PeaceSystem.capitulated(t) ? '🏳️ 降伏' : '抗戦中') + '</td></tr>'; }).join('');
    GameUI.openModal('🏆 戦勝点 (War Score)', '<div class="pc-modal"><div class="pc-score-big">' + PeaceSystem.warScore(s.country) + ' <small>pt</small></div>' +
      '<table class="pc-table"><tr><th>敵師団の撃破</th><td>' + sc.kills + ' × 4</td></tr><tr><th>占領したVP</th><td>' + sc.vp + ' × 2</td></tr><tr><th>占領した州</th><td>' + sc.states + ' × 3</td></tr><tr><th>受けた被害</th><td>− ' + sc.damage + '</td></tr></table>' +
      (enemies ? '<h4>交戦国の状況 (残存VP / 元のVP)</h4><table class="pc-table">' + enemies + '</table><p class="sn-help">残存VPが25%未満で降伏。敵陣営の主要国が全て降伏すると講和会議が開きます。</p>' : '<p class="sn-help">現在交戦中の国はありません。</p>') + '</div>');
  }

  // ==========================================================
  // 降伏判定・会議の自動開催
  // ==========================================================
  static currentVP(tag) { let v = 0; Object.values(MapRenderer.states || {}).forEach(st => { if (st.owner === tag) v += Object.values(st.vp || {}).reduce((a, x) => a + Number(x || 0), 0) + 1; }); return v; }
  static origVPOf(tag) { const p = PeaceSystem.data(); if (!p.origVP[tag]) p.origVP[tag] = PeaceSystem.currentVP(tag); return p.origVP[tag]; }
  static capitulated(tag) { const o = PeaceSystem.origVPOf(tag); const cur = PeaceSystem.currentVP(tag); return cur === 0 || (o > 0 && cur / o < 0.25); }
  static factionOf(tag) { return (typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.factions : []).find(f => f.members.includes(tag)) || null; }
  static checkCapitulations() {
    const s = CoreEngine.gameState, p = PeaceSystem.data();
    if (p.conference || !(s.atWar || []).length) return;
    const enemies = s.atWar.filter(t => t !== s.country);
    enemies.forEach(t => PeaceSystem.origVPOf(t));
    const groups = new Map();   // 陣営 (または単独国) ごと
    enemies.forEach(t => { const f = PeaceSystem.factionOf(t); const key = f ? 'F:' + f.name : 'S:' + t; if (!groups.has(key)) groups.set(key, { faction: f, members: [] }); groups.get(key).members.push(t); });
    for (const [, g] of groups) {
      const all = g.faction ? g.faction.members.filter(m => enemies.includes(m)) : g.members;
      const majors = all.filter(m => PeaceSystem.MAJORS.includes(m));
      const must = majors.length ? majors : all;
      if (!must.length || !must.every(m => PeaceSystem.capitulated(m))) continue;
      const defeated = all.filter(m => PeaceSystem.capitulated(m) || !majors.length || PeaceSystem.MAJORS.includes(m));
      PeaceSystem.openConference(defeated, g.faction ? g.faction.name : null);
      return;
    }
  }
  static winnersAgainst(defeated) {
    const s = CoreEngine.gameState, me = s.country, set = new Set([me]);
    const myF = PeaceSystem.factionOf(me); if (myF) myF.members.forEach(m => set.add(m));
    if (typeof AIManager !== 'undefined' && AIManager.state?.wars) AIManager.state.wars.forEach(w => { if (defeated.includes(w.b) && !defeated.includes(w.a)) set.add(w.a); if (defeated.includes(w.a) && !defeated.includes(w.b)) set.add(w.b); });
    defeated.forEach(d => set.delete(d));
    return [...set];
  }
  static openConference(defeated, factionName) {
    const s = CoreEngine.gameState, p = PeaceSystem.data();
    if (p.conference) return;
    const winners = PeaceSystem.winnersAgainst(defeated);
    const points = {};
    winners.forEach(w => { points[w] = w === s.country ? Math.max(30, PeaceSystem.warScore(w)) : PeaceSystem.estimateScore(w, defeated); });
    const order = [...winners].sort((a, b) => points[b] - points[a]);
    p.conference = { defeated, factionName, winners: order, points, initial: { ...points }, turn: 0, passed: {}, demands: [], round: 1, selectedCountry: defeated[0], selectedState: null, log: [] };
    PeaceSystem.resumeSpeed = s.speed; CoreEngine.setSpeed(0);
    CoreEngine.log('🕊️ 講和会議が開催されました: ' + defeated.map(PeaceSystem.nameOf).join('・') + ' が降伏');
    GameUI.notify('🕊️ ' + (factionName ? '陣営「' + factionName + '」' : PeaceSystem.nameOf(defeated[0])) + ' が降伏 — 講和会議を開始します', 'success');
    if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) { try { NewsManager.fireCustom({ icon: '🕊️', title: '講和会議開催', body: defeated.map(PeaceSystem.nameOf).join('・') + 'の降伏を受け、戦勝国による講和会議が開かれます。' }); } catch (e) { /* ignore */ } }
    PeaceSystem.renderConference();
    PeaceSystem.runAITurns();
  }

  // ==========================================================
  // 要求とターン
  // ==========================================================
  static demandCost(type, target) {
    const st = MapRenderer.states[target];
    if (type === 'annex') return st ? 6 + Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) * 3 + (st.b?.industrial_complex || 0) + (st.b?.arms_factory || 0) : 999;
    const states = Object.values(MapRenderer.states || {}).filter(x => x.owner === target).length;
    if (type === 'puppet') return 20 + states * 4;
    if (type === 'regime') return 15 + Math.floor(states * 1.5);
    if (type === 'reparations') return 12;
    return 999;
  }
  static currentWinner() { const c = PeaceSystem.data()?.conference; return c ? c.winners[c.turn % c.winners.length] : null; }
  static isPlayerTurn() { return PeaceSystem.currentWinner() === CoreEngine.gameState.country; }
  static demandsOn(target) { const c = PeaceSystem.data()?.conference; return c ? c.demands.filter(d => d.target === target) : []; }
  static addDemand(type, target, by) {
    const c = PeaceSystem.data()?.conference; if (!c) return false;
    by = by || CoreEngine.gameState.country;
    const def = PeaceSystem.DEMANDS[type]; if (!def) return false;
    if (PeaceSystem.currentWinner() !== by) { GameUI.notify('現在は ' + PeaceSystem.nameOf(PeaceSystem.currentWinner()) + ' のターンです。', 'alert'); return false; }
    if (def.scope === 'state') {
      const st = MapRenderer.states[target]; if (!st || !c.defeated.includes(st.owner)) return false;
      if (c.demands.some(d => d.type === 'annex' && d.target === target)) { GameUI.notify('その州は既に要求されています。', 'alert'); return false; }
    } else {
      if (!c.defeated.includes(target)) return false;
      if (c.demands.some(d => d.type === type && d.target === target)) { GameUI.notify('同じ要求が既に提出されています。', 'alert'); return false; }
      if (type === 'puppet' && c.demands.some(d => d.type === 'puppet' && d.target === target && d.by !== by)) return false;
    }
    const cost = PeaceSystem.demandCost(type, target);
    if ((c.points[by] || 0) < cost) { if (by === CoreEngine.gameState.country) GameUI.notify('戦勝点が不足しています (必要 ' + cost + ' / 残り ' + c.points[by] + ')。', 'alert'); return false; }
    c.points[by] -= cost;
    c.demands.push({ type, target, by, cost, round: c.round });
    c.passed[by] = false;
    const label = def.scope === 'state' ? PeaceSystem.esc(MapRenderer.states[target].name) : PeaceSystem.esc(PeaceSystem.nameOf(target));
    c.log.unshift(PeaceSystem.nameOf(by) + ': ' + def.icon + ' ' + def.name + ' — ' + label + ' (' + cost + 'pt)');
    if (by === CoreEngine.gameState.country) PeaceSystem.renderConference();
    return true;
  }
  static removeDemand(idx) {
    const c = PeaceSystem.data()?.conference; if (!c) return;
    const d = c.demands[idx]; if (!d || d.by !== CoreEngine.gameState.country) return;
    c.points[d.by] += d.cost; c.demands.splice(idx, 1);
    PeaceSystem.renderConference();
  }
  static minCost() { return 6; }
  static pass() {
    const c = PeaceSystem.data()?.conference; if (!c || !PeaceSystem.isPlayerTurn()) return;
    c.passed[CoreEngine.gameState.country] = true;
    PeaceSystem.advanceTurn();
  }
  static endTurn() {
    const c = PeaceSystem.data()?.conference; if (!c || !PeaceSystem.isPlayerTurn()) return;
    PeaceSystem.advanceTurn();
  }
  static advanceTurn() {
    const c = PeaceSystem.data()?.conference; if (!c) return;
    const done = c.winners.every(w => c.passed[w] || c.points[w] < PeaceSystem.minCost());
    if (done) { PeaceSystem.finalize(); return; }
    // 次の (まだ行動できる) 戦勝国へ
    for (let i = 0; i < c.winners.length; i++) {
      c.turn++;
      if (c.turn % c.winners.length === 0) c.round++;
      const w = PeaceSystem.currentWinner();
      if (!c.passed[w] && c.points[w] >= PeaceSystem.minCost()) break;
    }
    PeaceSystem.renderConference();
    PeaceSystem.runAITurns();
  }
  /** AI 戦勝国のターン: 隣接・高VPの州を併合、余れば賠償金 */
  static runAITurns() {
    const c = PeaceSystem.data()?.conference; if (!c) return;
    let guard = 0;
    while (c && !PeaceSystem.isPlayerTurn() && guard++ < 50) {
      const ai = PeaceSystem.currentWinner();
      if (c.passed[ai] || c.points[ai] < PeaceSystem.minCost()) { c.passed[ai] = true; PeaceSystem.advanceTurnSilent(); continue; }
      const candidates = Object.entries(MapRenderer.states || {}).filter(([sid, st]) => c.defeated.includes(st.owner) && !c.demands.some(d => d.type === 'annex' && d.target === sid) && !c.demands.some(d => d.type === 'puppet' && d.target === st.owner))
        .map(([sid, st]) => { const adj = (st.provinces || []).some(p => [...(MapRenderer.provNeighbors.get(p) || [])].some(n => MapRenderer.ownerOf(n) === ai)); return { sid, st, cost: PeaceSystem.demandCost('annex', sid), value: Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) + (adj ? 6 : 0) }; })
        .filter(x => x.cost <= c.points[ai]).sort((a, b) => b.value - a.value);
      let acted = false;
      if (candidates.length && (candidates[0].value >= 6 || Math.random() < 0.5)) acted = PeaceSystem.addDemand('annex', candidates[0].sid, ai);
      if (!acted) { const t = c.defeated.find(d => !c.demands.some(x => x.type === 'reparations' && x.target === d) && PeaceSystem.demandCost('reparations', d) <= c.points[ai]); if (t) acted = PeaceSystem.addDemand('reparations', t, ai); }
      if (!acted) c.passed[ai] = true;
      PeaceSystem.advanceTurnSilent();
      if (!PeaceSystem.data()?.conference) return;
    }
    PeaceSystem.renderConference();
  }
  static advanceTurnSilent() {
    const c = PeaceSystem.data()?.conference; if (!c) return;
    if (c.winners.every(w => c.passed[w] || c.points[w] < PeaceSystem.minCost())) { PeaceSystem.finalize(); return; }
    for (let i = 0; i < c.winners.length; i++) {
      c.turn++;
      if (c.turn % c.winners.length === 0) c.round++;
      const w = PeaceSystem.currentWinner();
      if (!c.passed[w] && c.points[w] >= PeaceSystem.minCost()) break;
    }
  }
  /** 条約確定: 地図と所有権を書き換える */
  static finalize() {
    const s = CoreEngine.gameState, p = PeaceSystem.data(), c = p.conference; if (!c) return;
    const me = s.country, summary = [];
    // 1. 傀儡化・政府転覆・賠償 (国単位)
    c.demands.filter(d => d.type === 'puppet').forEach(d => { PeaceSystem.makeSubject(d.target, d.by, 200); summary.push(PeaceSystem.nameOf(d.by) + ' が ' + PeaceSystem.nameOf(d.target) + ' を傀儡化'); });
    c.demands.filter(d => d.type === 'regime').forEach(d => { if (typeof WarGoals !== 'undefined') WarGoals.IDEOLOGY[d.target] = d.by === me ? (s.ideology || 'neutrality') : (WarGoals.IDEOLOGY[d.by] || 'neutrality'); const rel = (DiplomacyManager.countries || []).find(x => x.id === d.target); if (rel && d.by === me) rel.relation = Math.min(100, (rel.relation || 0) + 50); summary.push(PeaceSystem.nameOf(d.target) + ' の政権交代'); });
    c.demands.filter(d => d.type === 'reparations').forEach(d => { if (d.by === me) { s.civilianFactories = (s.civilianFactories || 0) + 2; p.reparations.push({ from: d.target, until: PeaceSystem.day() + 365 * 5 }); } else { const a = ProductionManager.account(d.by); a.civilian = (a.civilian || 20) + 2; } summary.push(PeaceSystem.nameOf(d.target) + ' → ' + PeaceSystem.nameOf(d.by) + ' 賠償金'); });
    // 2. 州の併合
    c.demands.filter(d => d.type === 'annex').forEach(d => {
      const st = MapRenderer.states[d.target]; if (!st) return;
      st.initialOwner ||= st.owner;
      MapRenderer.captureState(d.target, d.by);
      if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'state_capture', state: d.target, owner: d.by });
    });
    const annexed = c.demands.filter(d => d.type === 'annex').length; if (annexed) summary.push(annexed + ' 州の割譲');
    // 3. 要求されなかった州: 傀儡化されていれば存続、それ以外は消滅国の州を最大戦勝国へ (領土が残っていれば独立存続)
    c.defeated.forEach(tag => {
      const left = Object.entries(MapRenderer.states || {}).filter(([, st]) => st.owner === tag);
      if (!left.length) { summary.push(PeaceSystem.nameOf(tag) + ' は消滅'); PeaceSystem.removeSubject(tag); }
    });
    // 4. 戦争終結
    c.defeated.forEach(tag => {
      s.atWar = (s.atWar || []).filter(t => t !== tag);
      if (typeof AIManager !== 'undefined' && AIManager.state?.wars) AIManager.state.wars = AIManager.state.wars.filter(w => w.a !== tag && w.b !== tag);
      if (typeof DiplomacyManager !== 'undefined') DiplomacyManager.factions.forEach(f => { f.members = f.members.filter(m => m !== tag); });
      if (p.warScore[tag]) delete p.warScore[tag];
      delete p.origVP[tag];
    });
    if (typeof DiplomacyManager !== 'undefined') DiplomacyManager.factions = DiplomacyManager.factions.filter(f => f.members.length);
    p.warScore[me] = { kills: 0, vp: 0, damage: 0, states: 0 };
    s.worldTension = Math.max(0, (s.worldTension || 0) - 10);
    p.history.unshift({ day: PeaceSystem.day(), defeated: c.defeated, winners: c.winners, demands: c.demands.length, summary });
    p.conference = null;
    PeaceSystem.pickingOnMap = false;
    PeaceSystem.removeOverlay();
    MapRenderer.invalidateModes?.();
    if (typeof DiplomacyManager !== 'undefined') { DiplomacyManager._ownerSig = ''; DiplomacyManager.rebuildCountries?.(); }
    if (typeof CoreEngine.renderStats === 'function') CoreEngine.renderStats();
    CoreEngine.log('🕊️ 講和条約が締結されました: ' + summary.join(' / '));
    GameUI.openModal('🕊️ 講和条約の締結', '<div class="pc-modal"><h3>条約が確定し、世界地図が書き換えられました</h3><ul class="pc-ul">' + (summary.length ? summary.map(x => '<li>' + PeaceSystem.esc(x) + '</li>').join('') : '<li>白紙講和 (要求なし)</li>') + '</ul><div class="pc-actions"><button class="pc-btn primary" onclick="GameUI.closeModal()">閉じる</button></div></div>');
    const sp = PeaceSystem.resumeSpeed; PeaceSystem.resumeSpeed = 0; if (sp) CoreEngine.setSpeed(sp);
    if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'sync', state: CoreEngine.getSyncState?.(), date: s.date?.toISOString?.() });
  }

  // ==========================================================
  // 講和会議 UI (全画面)
  // ==========================================================
  static removeOverlay() { const o = document.getElementById('pc-overlay'); if (o && typeof o.remove === 'function') o.remove(); }
  static pickOnMap() { PeaceSystem.pickingOnMap = true; document.getElementById('pc-overlay')?.classList.add('minimized'); GameUI.notify('🗺️ 地図上で敗戦国の州をクリックしてください。', 'success'); }
  static selectCountry(tag) { const c = PeaceSystem.data()?.conference; if (!c) return; c.selectedCountry = tag; c.selectedState = null; PeaceSystem.renderConference(); }
  static selectState(sid) { const c = PeaceSystem.data()?.conference; if (!c) return; c.selectedState = String(sid); c.selectedCountry = MapRenderer.states[sid]?.owner || c.selectedCountry; PeaceSystem.renderConference(); }
  static renderConference() {
    const s = CoreEngine.gameState, c = PeaceSystem.data()?.conference;
    PeaceSystem.removeOverlay();
    if (!c) return;
    const me = s.country, cur = PeaceSystem.currentWinner(), myTurn = cur === me;
    const el = document.createElement('div'); el.id = 'pc-overlay'; el.className = 'pc-overlay';
    const country = c.selectedCountry || c.defeated[0];
    const states = Object.entries(MapRenderer.states || {}).filter(([, st]) => st.owner === country).sort((a, b) => Object.values(b[1].vp || {}).reduce((x, v) => x + Number(v || 0), 0) - Object.values(a[1].vp || {}).reduce((x, v) => x + Number(v || 0), 0));
    const sel = c.selectedState && MapRenderer.states[c.selectedState] ? MapRenderer.states[c.selectedState] : null;
    const left = '<aside class="pc-left"><h3>戦勝国</h3>' + c.winners.map((w, i) => '<div class="pc-winner' + (w === cur ? ' turn' : '') + (c.passed[w] ? ' passed' : '') + '"><span class="pc-flag">' + (typeof DataFetcher !== 'undefined' && DataFetcher.getCountryFlagImage ? DataFetcher.getCountryFlagImage(w) : '') + '</span><div><b>' + PeaceSystem.esc(PeaceSystem.nameOf(w)) + (w === me ? ' (自国)' : '') + '</b><small>' + (c.passed[w] ? 'パス済' : w === cur ? '▶ 行動中' : '待機') + '</small></div><div class="pc-pts"><b>' + c.points[w] + '</b><small>/ ' + c.initial[w] + ' pt</small></div></div>').join('') +
      '<h3>敗戦国</h3>' + c.defeated.map(d => '<div class="pc-defeated' + (country === d ? ' on' : '') + '" onclick="PeaceSystem.selectCountry(\'' + d + '\')"><b>🏳️ ' + PeaceSystem.esc(PeaceSystem.nameOf(d)) + '</b><small>' + Object.values(MapRenderer.states || {}).filter(st => st.owner === d).length + ' 州 ／ 要求 ' + PeaceSystem.demandsOn(d).length + (c.demands.some(x => x.type === 'puppet' && x.target === d) ? ' ／ 🎭傀儡化予定' : '') + '</small></div>').join('') +
      '<h3>会議ログ</h3><div class="pc-log">' + (c.log.length ? c.log.slice(0, 30).map(l => '<div>' + PeaceSystem.esc(l) + '</div>').join('') : '<span class="sn-help">まだ要求はありません。</span>') + '</div></aside>';
    const center = '<section class="pc-center"><div class="pc-center-head"><h3>' + PeaceSystem.esc(PeaceSystem.nameOf(country)) + ' の領土 <small>' + states.length + ' 州</small></h3><button class="pc-btn" onclick="PeaceSystem.pickOnMap()">🗺️ 地図で州を選択</button></div>' +
      '<div class="pc-states">' + states.map(([sid, st]) => { const vp = Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0); const d = c.demands.find(x => x.type === 'annex' && x.target === sid); return '<div class="pc-state' + (c.selectedState === sid ? ' on' : '') + (d ? ' claimed' : '') + '" onclick="PeaceSystem.selectState(\'' + sid + '\')"><b>' + PeaceSystem.esc(st.name || '州' + sid) + '</b><small>VP ' + vp + ' ／ 工場 ' + ((st.b?.industrial_complex || 0) + (st.b?.arms_factory || 0)) + ' ／ 併合 ' + PeaceSystem.demandCost('annex', sid) + 'pt</small>' + (d ? '<em>→ ' + PeaceSystem.esc(PeaceSystem.nameOf(d.by)) + '</em>' : '') + '</div>'; }).join('') + '</div></section>';
    const right = '<aside class="pc-right"><h3>要求を提出 <small>ラウンド ' + c.round + '</small></h3>' +
      '<div class="pc-target">' + (sel ? '選択中の州: <b>' + PeaceSystem.esc(sel.name) + '</b>' : '州が未選択 (国家単位の要求は可能)') + '</div>' +
      Object.values(PeaceSystem.DEMANDS).map(d => { const target = d.scope === 'state' ? c.selectedState : country; const cost = target ? PeaceSystem.demandCost(d.type || d.id, target) : null; const can = myTurn && target && cost <= c.points[me]; return '<div class="pc-demand"><div class="pc-demand-head"><span>' + d.icon + '</span><b>' + d.name + '</b><span class="pc-cost">' + (cost != null ? cost + ' pt' : '—') + '</span></div><p>' + d.desc + '</p><button class="pc-btn small' + (can ? ' primary' : '') + '" ' + (can ? '' : 'disabled') + ' onclick="PeaceSystem.addDemand(\'' + d.id + '\',\'' + (target || '') + '\')">' + (d.scope === 'state' ? '選択した州に' : PeaceSystem.esc(PeaceSystem.nameOf(country)) + ' に') + '要求</button></div>'; }).join('') +
      '<h3>提出済みの要求 <small>' + c.demands.length + '</small></h3><div class="pc-demands">' + (c.demands.length ? c.demands.map((d, i) => '<div class="pc-demand-row"><span>' + PeaceSystem.DEMANDS[d.type].icon + ' ' + PeaceSystem.esc(PeaceSystem.nameOf(d.by)) + ' → ' + (d.type === 'annex' ? PeaceSystem.esc(MapRenderer.states[d.target]?.name) : PeaceSystem.esc(PeaceSystem.nameOf(d.target))) + ' <small>' + d.cost + 'pt</small></span>' + (d.by === me && myTurn ? '<button class="pc-btn small" onclick="PeaceSystem.removeDemand(' + i + ')">取消</button>' : '') + '</div>').join('') : '<span class="sn-help">なし</span>') + '</div>' +
      '<div class="pc-foot">' + (myTurn ? '<button class="pc-btn" onclick="PeaceSystem.pass()">⏭ パス (以後の要求を放棄)</button><button class="pc-btn primary" onclick="PeaceSystem.endTurn()">✅ ターン終了</button>' : '<span class="sn-help">' + PeaceSystem.esc(PeaceSystem.nameOf(cur)) + ' のターンです…</span><button class="pc-btn" onclick="PeaceSystem.runAITurns()">進める</button>') + '</div>' +
      '<p class="sn-help">全戦勝国がパスするか戦勝点を使い切ると条約が確定し、地図が書き換わります。</p></aside>';
    el.innerHTML = '<div class="pc-window"><header class="pc-header"><div class="pc-mark">🕊️</div><div><h2>講和会議 <small>PEACE CONFERENCE</small></h2><p>' + (c.factionName ? '陣営「' + PeaceSystem.esc(c.factionName) + '」の降伏' : PeaceSystem.esc(PeaceSystem.nameOf(c.defeated[0])) + ' の降伏') + ' ／ 自国の戦勝点 <b>' + c.points[me] + '</b> pt ／ ' + (myTurn ? '<span class="pc-turn">あなたのターン</span>' : PeaceSystem.esc(PeaceSystem.nameOf(cur)) + ' のターン') + '</p></div><button class="pc-btn" onclick="document.getElementById(\'pc-overlay\').classList.toggle(\'minimized\')">🗕 地図を見る / 戻る</button></header><div class="pc-body">' + left + center + right + '</div></div><button class="pc-restore" onclick="document.getElementById(\'pc-overlay\').classList.remove(\'minimized\');PeaceSystem.pickingOnMap=false;">🕊️ 講和会議に戻る</button>';
    document.body.appendChild(el);
  }

  // ==========================================================
  // 傀儡国・自治度
  // ==========================================================
  static subjects() { return PeaceSystem.data()?.subjects || {}; }
  static subjectsOf(overlord) { return Object.fromEntries(Object.entries(PeaceSystem.subjects()).filter(([, v]) => v.overlord === overlord)); }
  static subject(tag) { return PeaceSystem.subjects()[tag] || null; }
  static levelOf(sub) { return PeaceSystem.LEVELS.find(l => sub.autonomy >= l.min && sub.autonomy <= l.max) || PeaceSystem.LEVELS[PeaceSystem.LEVELS.length - 1]; }
  static makeSubject(tag, overlord, autonomy = 200) {
    const p = PeaceSystem.data();
    p.subjects[tag] = { overlord, autonomy, since: PeaceSystem.day(), supplyResources: false, factoriesBuilt: 0, manpowerTaken: 0, log: [] };
    const s = CoreEngine.gameState;
    s.atWar = (s.atWar || []).filter(t => t !== tag);
    if (typeof AIManager !== 'undefined' && AIManager.state?.wars) AIManager.state.wars = AIManager.state.wars.filter(w => !((w.a === tag && w.b === overlord) || (w.b === tag && w.a === overlord)));
    const rel = (DiplomacyManager.countries || []).find(x => x.id === tag); if (rel) rel.relation = 80;
    return p.subjects[tag];
  }
  static removeSubject(tag) { const p = PeaceSystem.data(); delete p.subjects[tag]; }
  static subjectStates(tag) { return Object.entries(MapRenderer.states || {}).filter(([, st]) => st.owner === tag); }
  /** 宗主国の操作 */
  static act(tag, action) {
    const s = CoreEngine.gameState, sub = PeaceSystem.subject(tag);
    if (!sub || sub.overlord !== s.country) return;
    const lv = PeaceSystem.levelOf(sub), states = PeaceSystem.subjectStates(tag);
    const note = (m, delta) => { sub.log.unshift(PeaceSystem.day() + ': ' + m + (delta ? ' (自治度 ' + (delta > 0 ? '+' : '') + delta + ')' : '')); sub.log = sub.log.slice(0, 20); CoreEngine.log('🏛️ ' + PeaceSystem.nameOf(tag) + ': ' + m); };
    if (action === 'build') {
      if ((s.politicalPower || 0) < 25) return GameUI.notify('政治力 25 が必要です。', 'alert');
      if (!states.length) return GameUI.notify('属国に州がありません。', 'alert');
      s.politicalPower -= 25;
      const [sid, st] = states[Math.floor(Math.random() * states.length)]; st.b ||= {}; st.b.industrial_complex = (st.b.industrial_complex || 0) + 1;
      const a = ProductionManager.account(tag); a.civilian = (a.civilian || 20) + 1;
      sub.factoriesBuilt++; sub.autonomy = Math.min(1000, sub.autonomy + 60);
      MapRenderer.invalidateModes?.();
      note('工場の建設支援 — ' + (st.name || '州' + sid) + ' に民需工場を建設', +60);
    } else if (action === 'resources') {
      sub.supplyResources = !sub.supplyResources;
      note(sub.supplyResources ? '資源の供給を開始 (毎日 自治度 −1.5、資源を宗主国へ追加供出)' : '資源の供給を停止');
    } else if (action === 'manpower') {
      if (sub.manpowerCooldown > PeaceSystem.day()) return GameUI.notify('人手の徴用は ' + (sub.manpowerCooldown - PeaceSystem.day()) + ' 日後に再び可能です。', 'alert');
      const mp = 5000 * Math.max(1, states.length);
      s.manpower = (s.manpower || 0) + mp; sub.manpowerTaken += mp; sub.manpowerCooldown = PeaceSystem.day() + 60;
      sub.autonomy = Math.max(0, sub.autonomy - 80);
      note('人手の徴用 — 人的資源 +' + mp.toLocaleString(), -80);
    } else if (action === 'suppress') {
      if ((s.politicalPower || 0) < 50) return GameUI.notify('政治力 50 が必要です。', 'alert');
      s.politicalPower -= 50; sub.autonomy = Math.max(0, sub.autonomy - 120);
      note('自治度の抑圧 (政治力 50)', -120);
    } else if (action === 'grant') {
      if ((s.politicalPower || 0) < 30) return GameUI.notify('政治力 30 が必要です。', 'alert');
      s.politicalPower -= 30; sub.autonomy = Math.min(1000, sub.autonomy + 150);
      note('自治権の付与 (政治力 30)', +150);
    } else if (action === 'annex') {
      if (sub.autonomy > 0 || lv.id !== 'puppet') return GameUI.notify('完全併合には自治度 0 (傀儡国) が必要です。', 'alert');
      if ((s.politicalPower || 0) < 100) return GameUI.notify('政治力 100 が必要です。', 'alert');
      s.politicalPower -= 100;
      states.forEach(([sid]) => MapRenderer.captureState(sid, s.country));
      PeaceSystem.removeSubject(tag);
      CoreEngine.log('🏛️ ' + PeaceSystem.nameOf(tag) + ' を完全併合しました (' + states.length + ' 州)');
      GameUI.notify('🏛️ ' + PeaceSystem.nameOf(tag) + ' を完全併合しました', 'success');
      if (typeof DiplomacyManager !== 'undefined') { DiplomacyManager._ownerSig = ''; DiplomacyManager.rebuildCountries?.(); }
    } else if (action === 'release') {
      PeaceSystem.removeSubject(tag);
      const rel = (DiplomacyManager.countries || []).find(x => x.id === tag); if (rel) rel.relation = Math.max(rel.relation || 0, 60);
      CoreEngine.log('🏛️ ' + PeaceSystem.nameOf(tag) + ' の独立を承認しました');
    }
    PeaceSystem.renderSubjects();
    if (typeof CoreEngine.renderStats === 'function') CoreEngine.renderStats();
  }
  /** 毎日: 自治度の変動・供出・賠償 */
  static dailySubjects() {
    const s = CoreEngine.gameState, p = PeaceSystem.data(), me = s.country;
    Object.entries(p.subjects).forEach(([tag, sub]) => {
      const lv = PeaceSystem.levelOf(sub), states = PeaceSystem.subjectStates(tag);
      if (!states.length) { PeaceSystem.removeSubject(tag); return; }
      // 自然変動: 属国は徐々に自治を求める (+0.4/日)、資源供給中は −1.5/日、宗主国と交戦中なら即独立
      let delta = 0.4 + states.length * 0.05;
      if (sub.supplyResources) delta -= 1.5;
      sub.autonomy = Math.max(0, Math.min(1000, sub.autonomy + delta));
      if (sub.overlord === me) {
        // 資源供出 (州産出 × 供出率 → 宗主国の備蓄)
        if (typeof TradeSystem !== 'undefined') {
          const prod = TradeSystem.production(tag), share = lv.resourceShare + (sub.supplyResources ? 0.25 : 0);
          Object.entries(prod).forEach(([k, v]) => { if (v > 0) s.resources[k] = (Number(s.resources[k]) || 0) + v * share; });
        }
        // 人的資源の供出
        s.manpower = (s.manpower || 0) + Math.round(40 * states.length * lv.manpowerShare);
        // 独立
        if (sub.autonomy >= 1000) {
          PeaceSystem.removeSubject(tag);
          CoreEngine.log('🏛️ ' + PeaceSystem.nameOf(tag) + ' が自治度上昇により独立しました');
          GameUI.notify('🏛️ ' + PeaceSystem.nameOf(tag) + ' が独立しました', 'alert');
          if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) { try { NewsManager.fireCustom({ icon: '🏛️', title: PeaceSystem.nameOf(tag) + 'が独立', body: '自治度の上昇により ' + PeaceSystem.nameOf(tag) + ' は ' + PeaceSystem.nameOf(me) + ' から独立しました。' }); } catch (e) { /* ignore */ } }
          return;
        }
        const newLv = PeaceSystem.levelOf(sub);
        if (sub.lastLevel && sub.lastLevel !== newLv.id) GameUI.notify('🏛️ ' + PeaceSystem.nameOf(tag) + ' の自治度が「' + newLv.name + '」になりました', 'success');
        sub.lastLevel = newLv.id;
      }
    });
    // 賠償金
    p.reparations = p.reparations.filter(r => r.until > PeaceSystem.day());
    p.reparations.forEach(r => { s.politicalPower = Math.min(999, (s.politicalPower || 0) + 0.1); if (typeof TradeSystem !== 'undefined') { const prod = TradeSystem.production(r.from); Object.entries(prod).forEach(([k, v]) => { if (v > 0) s.resources[k] = (Number(s.resources[k]) || 0) + v * 0.25; }); } });
  }
  static onTick() {
    const s = CoreEngine.gameState, p = PeaceSystem.data();
    if (!p || !MapRenderer.ready) return;
    const day = PeaceSystem.day();
    if (p.lastDay === day) return;
    p.lastDay = day;
    Object.values(MapRenderer.states || {}).forEach(st => { st.initialOwner ||= st.owner; });
    PeaceSystem.checkCapitulations();
    PeaceSystem.dailySubjects();
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen('subjects')) PeaceSystem.renderSubjects();
  }
  static subjectLine(sid) {
    const st = MapRenderer.states[sid]; if (!st) return '';
    const sub = PeaceSystem.subject(st.owner); if (!sub) return '';
    const lv = PeaceSystem.levelOf(sub);
    return '<span style="font-size:11px;color:#c9b27a">' + lv.icon + ' ' + PeaceSystem.esc(PeaceSystem.nameOf(sub.overlord)) + ' の' + lv.name + ' (自治度 ' + Math.round(sub.autonomy) + ')</span>' + (sub.overlord === CoreEngine.gameState.country ? ' <button class="map-info-build-btn" onclick="GameUI.switchTab(\'subjects\')">🏛️ 自治度</button>' : '');
  }
  static renderSubjects() {
    const el = document.getElementById('subjects-content'); if (!el) return;
    const s = CoreEngine.gameState, me = s.country, subs = Object.entries(PeaceSystem.subjectsOf(me)), p = PeaceSystem.data();
    if (!PeaceSystem.selectedSubject || !subs.some(([t]) => t === PeaceSystem.selectedSubject)) PeaceSystem.selectedSubject = subs[0]?.[0] || null;
    let html = '<div class="pc-root"><div class="pc-head"><div class="pc-mark">🏛️</div><div><h3>自治度 <small>SUBJECT STATUS</small></h3><p>属国 ' + subs.length + 'か国 ／ 政治力 ' + Math.floor(s.politicalPower || 0) + ' ／ 人的資源 ' + Math.floor(s.manpower || 0).toLocaleString() + '</p></div>' +
      '<div class="pc-scale">' + PeaceSystem.LEVELS.map(l => '<span>' + l.icon + ' ' + l.name + '<small>' + l.min + '–' + l.max + '</small></span>').join('<i>→</i>') + '<i>→</i><span>🕊️ 独立<small>1000</small></span></div></div><div class="pc-sub-body">';
    html += '<div class="pc-sub-list">' + (subs.length ? subs.map(([tag, sub]) => { const lv = PeaceSystem.levelOf(sub); return '<div class="pc-sub' + (PeaceSystem.selectedSubject === tag ? ' on' : '') + '" onclick="PeaceSystem.selectedSubject=\'' + tag + '\';PeaceSystem.renderSubjects()"><b>' + lv.icon + ' ' + PeaceSystem.esc(PeaceSystem.nameOf(tag)) + '</b><small>' + lv.name + ' ／ ' + PeaceSystem.subjectStates(tag).length + ' 州</small><div class="pc-bar"><em style="width:' + (sub.autonomy / 10) + '%"></em></div><small>自治度 ' + Math.round(sub.autonomy) + ' / 1000</small></div>'; }).join('') : '<p class="sn-help">属国がありません。講和会議で「傀儡化」を要求すると、ここで自治度を管理できます。</p>') +
      (p.history.length ? '<h4>講和の記録</h4>' + p.history.slice(0, 5).map(h => '<div class="pc-sub"><small>' + h.defeated.map(PeaceSystem.nameOf).join('・') + ' の降伏 ／ 要求 ' + h.demands + '</small><small>' + (h.summary || []).slice(0, 3).join(' / ') + '</small></div>').join('') : '') + '</div>';
    const tag = PeaceSystem.selectedSubject, sub = tag ? PeaceSystem.subject(tag) : null;
    if (sub) {
      const lv = PeaceSystem.levelOf(sub), states = PeaceSystem.subjectStates(tag), prod = typeof TradeSystem !== 'undefined' ? TradeSystem.production(tag) : {};
      const share = lv.resourceShare + (sub.supplyResources ? 0.25 : 0);
      html += '<div class="pc-sub-detail"><div class="pc-sub-title"><h3>' + lv.icon + ' ' + PeaceSystem.esc(PeaceSystem.nameOf(tag)) + ' <small>' + lv.name + '</small></h3><p>' + lv.desc + '</p></div>' +
        '<div class="pc-autonomy"><div class="pc-bar big"><em style="width:' + (sub.autonomy / 10) + '%"></em>' + PeaceSystem.LEVELS.slice(1).map(l => '<i style="left:' + (l.min / 10) + '%" title="' + l.name + '"></i>').join('') + '<span>自治度 ' + Math.round(sub.autonomy) + ' / 1000</span></div>' +
        '<div class="pc-auto-row"><span>日次変動</span><b>' + ((0.4 + states.length * 0.05 - (sub.supplyResources ? 1.5 : 0)) > 0 ? '+' : '') + (0.4 + states.length * 0.05 - (sub.supplyResources ? 1.5 : 0)).toFixed(2) + ' / 日</b><span>自治度 0 → 完全併合可</span><span>1000 → 独立</span></div></div>' +
        '<div class="pc-grid"><div class="pc-card"><h4>供出 (毎日)</h4><table class="pc-table">' + Object.entries(prod).filter(([, v]) => v > 0).map(([k, v]) => '<tr><th>' + (typeof TradeSystem !== 'undefined' ? TradeSystem.icon(k, 16) + ' ' + TradeSystem.RESOURCES[k].name : k) + '</th><td>' + v + ' × ' + Math.round(share * 100) + '% = <b>' + (v * share).toFixed(1) + '</b></td></tr>').join('') + '<tr><th>人的資源</th><td><b>+' + Math.round(40 * states.length * lv.manpowerShare) + '</b> / 日</td></tr></table></div>' +
        '<div class="pc-card"><h4>領土 (' + states.length + ' 州)</h4><div class="pc-state-chips">' + states.map(([sid, st]) => '<span onclick="ConstructionManager.selectState(\'' + sid + '\')">' + PeaceSystem.esc(st.name || '州' + sid) + '</span>').join('') + '</div><small>建設支援 ' + sub.factoriesBuilt + ' 工場 ／ 徴用済み人的資源 ' + sub.manpowerTaken.toLocaleString() + '</small></div></div>' +
        '<h4>宗主国の行動</h4><div class="pc-actions-grid">' +
        '<div class="pc-action"><b>🏭 工場の建設支援</b><p>属国に民需工場を建設 (政治力 25)。自治度 <em class="up">+60</em></p><button class="pc-btn" onclick="PeaceSystem.act(\'' + tag + '\',\'build\')">実行</button></div>' +
        '<div class="pc-action"><b>⛏️ 資源の供給' + (sub.supplyResources ? ' <span class="pc-on">ON</span>' : '') + '</b><p>供出率 +25%、毎日 自治度 <em class="down">−1.5</em></p><button class="pc-btn' + (sub.supplyResources ? ' on' : '') + '" onclick="PeaceSystem.act(\'' + tag + '\',\'resources\')">' + (sub.supplyResources ? '停止' : '開始') + '</button></div>' +
        '<div class="pc-action"><b>🪖 人手の徴用</b><p>人的資源 +' + (5000 * Math.max(1, states.length)).toLocaleString() + ' (60日に1回)。自治度 <em class="down">−80</em></p><button class="pc-btn" ' + (sub.manpowerCooldown > PeaceSystem.day() ? 'disabled' : '') + ' onclick="PeaceSystem.act(\'' + tag + '\',\'manpower\')">' + (sub.manpowerCooldown > PeaceSystem.day() ? (sub.manpowerCooldown - PeaceSystem.day()) + '日後' : '実行') + '</button></div>' +
        '<div class="pc-action"><b>👊 自治度の抑圧</b><p>政治力 50。自治度 <em class="down">−120</em></p><button class="pc-btn" onclick="PeaceSystem.act(\'' + tag + '\',\'suppress\')">実行</button></div>' +
        '<div class="pc-action"><b>📜 自治権の付与</b><p>政治力 30。自治度 <em class="up">+150</em> (関係改善)</p><button class="pc-btn" onclick="PeaceSystem.act(\'' + tag + '\',\'grant\')">実行</button></div>' +
        '<div class="pc-action final"><b>🗺️ 完全併合</b><p>自治度 0 の傀儡国を政治力 100 で併合。全州が自国領に</p><button class="pc-btn danger" ' + (sub.autonomy <= 0 && lv.id === 'puppet' ? '' : 'disabled') + ' onclick="PeaceSystem.act(\'' + tag + '\',\'annex\')">併合</button></div>' +
        '<div class="pc-action final"><b>🕊️ 独立の承認</b><p>属国関係を解消し独立国とする</p><button class="pc-btn" onclick="PeaceSystem.act(\'' + tag + '\',\'release\')">承認</button></div></div>' +
        '<h4>記録</h4><div class="pc-log">' + (sub.log.length ? sub.log.map(l => '<div>' + PeaceSystem.esc(l) + '</div>').join('') : '<span class="sn-help">なし</span>') + '</div></div>';
    } else html += '<div class="pc-sub-detail"><p class="sn-help">左の一覧から属国を選択してください。</p>' + '</div>';
    html += '</div></div>';
    el.innerHTML = html;
  }
}
if (typeof window !== 'undefined') window.PeaceSystem = PeaceSystem;
