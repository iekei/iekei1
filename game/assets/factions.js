/* factions.js — HOI4風「陣営・陣営加入・陣営創設 (Factions & Ideology Tension)」
 *
 *  - 世界緊張度: 正当化 / 宣戦布告 / 併合 / 講和 / 陣営参戦 などで上昇 (CoreEngine.addWorldTension をラップして履歴を記録)。
 *    上部バーに大きく表示し、クリックで変動履歴ウィンドウを開く
 *  - 陣営タブ (外交画面): 自国陣営の状況、創設 (PP50 / 国家方針で解禁)、改名、招待、加入申請、追放、指導権の譲渡、離脱、独立保障
 *    民主主義国は世界緊張度 25% 未満では陣営の創設・加入・保障ができない
 *  - 集団安全保障: 陣営メンバーまたは保障国が宣戦布告されると他の加盟国へ「参戦要請 (Call to Arms)」。
 *    AI は自動で判断、プレイヤーには通知＋モーダル。承諾すると戦争が陣営全体 vs 敵 (と敵陣営) に拡大する
 */
class FactionSystem {
  static MAJORS = ['GER', 'SOV', 'USA', 'ENG', 'FRA', 'ITA', 'JAP'];
  static HISTORICAL = [
    { name: '枢軸国', leader: 'GER', members: ['GER', 'ITA'], ideology: 'fascism' },
    { name: '連合国', leader: 'ENG', members: ['ENG', 'FRA'], ideology: 'democracy' },
    { name: 'コミンテルン', leader: 'SOV', members: ['SOV', 'MON'], ideology: 'communism' },
  ];
  static NAME_IDEAS = { fascism: ['枢軸国', '新秩序同盟', '鋼鉄協約'], communism: ['コミンテルン', 'インターナショナル', '赤色同盟'], democracy: ['連合国', '自由世界同盟', '民主主義連合'], neutrality: ['大東亜共栄圏', '中立諸国会議', '非同盟同盟'] };
  static IDEOLOGY_NAME = { fascism: 'ファシズム', communism: '共産主義', democracy: '民主主義', neutrality: '中道' };
  static DEMOCRACY_TENSION = 25;
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }
  static nameOf(tag) { return typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(tag) : tag; }
  static flag(tag) { return typeof DataFetcher !== 'undefined' && DataFetcher.getCountryFlagImage ? DataFetcher.getCountryFlagImage(tag) : ''; }
  static ideologyOf(tag) { const s = CoreEngine.gameState; if (tag === s.country && s.ideology) return s.ideology; return (typeof WarGoals !== 'undefined' && WarGoals.IDEOLOGY[tag]) || 'neutrality'; }

  // ------------------------------------------------------------------
  static init() {
    if (FactionSystem.installed) return;
    FactionSystem.installed = true;
    FactionSystem.data();
    FactionSystem.installUI();
    FactionSystem.installHooks();
    CoreEngine.registerTickCallback(() => FactionSystem.onTick());
    CoreEngine.log('🏰 陣営・世界緊張度システムが有効になりました。');
  }
  static data() {
    const s = CoreEngine.gameState; if (!s.strategy) return null;
    const f = (s.strategy.factionSys ||= { tensionLog: [], calls: [], guarantees: [], invites: [], unlocked: false, historicalDone: false });
    f.tensionLog ||= []; f.calls ||= []; f.guarantees ||= []; f.invites ||= [];
    return f;
  }
  static installUI() {
    const root = document.getElementById('window-templates');
    if (root && !document.getElementById('tpl-tension')) {
      const el = document.createElement('div'); el.className = 'window-template pane-scroll'; el.id = 'tpl-tension';
      el.dataset.title = '🌡️ 世界緊張度 — World Tension'; el.dataset.w = '760'; el.dataset.h = '620'; el.innerHTML = '<div id="tension-content"></div>'; root.appendChild(el);
    }
    const btn = document.getElementById('world-tension');
    if (btn) { btn.setAttribute('onclick', "GameUI.switchTab('tension')"); btn.classList.add('fs-tension-big'); btn.title = '世界緊張度 — クリックで変動履歴'; }
    if (typeof GameUI !== 'undefined' && !GameUI._fsHooked) {
      GameUI._fsHooked = true;
      const orig = GameUI.onWindowOpened.bind(GameUI);
      GameUI.onWindowOpened = (tab) => { orig(tab); if (tab === 'tension') FactionSystem.renderTension(); };
    }
  }
  static installHooks() {
    // 世界緊張度の履歴
    if (!CoreEngine._fsHooked) {
      CoreEngine._fsHooked = true;
      const orig = CoreEngine.addWorldTension.bind(CoreEngine);
      CoreEngine.addWorldTension = (delta, reason, source) => {
        const f = FactionSystem.data(); const before = CoreEngine.gameState.worldTension || 0;
        orig(delta, reason);
        if (f && delta) { f.tensionLog.unshift({ day: FactionSystem.day(), date: CoreEngine.gameState.date ? new Date(CoreEngine.gameState.date).toLocaleDateString('ja-JP') : '', delta, reason: reason || '', source: source || CoreEngine.gameState.country, after: CoreEngine.gameState.worldTension }); f.tensionLog = f.tensionLog.slice(0, 200); }
        FactionSystem.renderTopbar();
        if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('tension')) FactionSystem.renderTension();
        return before;
      };
      const origRender = CoreEngine.renderWorldTension.bind(CoreEngine);
      CoreEngine.renderWorldTension = () => { origRender(); FactionSystem.renderTopbar(); };
    }
    // 外交画面に陣営タブ
    if (typeof DiplomacyManager !== 'undefined' && !DiplomacyManager._fsHooked) {
      DiplomacyManager._fsHooked = true;
      const orig = DiplomacyManager.render.bind(DiplomacyManager);
      DiplomacyManager.render = () => {
        orig();
        const c = document.getElementById('diplomacy-content'); if (!c || typeof c.innerHTML !== 'string') return;
        const html = c.innerHTML;
        const i = html.indexOf('<div class="faction-panel"><h3>🏰'), j = html.indexOf('<div class="faction-panel"><h3>📦');
        const stripped = (i >= 0 && j > i) ? html.slice(0, i) + html.slice(j) : html;
        const tab = FactionSystem.tab || 'relations';
        const calls = (FactionSystem.data()?.calls || []).length;
        const bar = '<div class="fs-tabs"><button class="fs-tab' + (tab === 'relations' ? ' on' : '') + '" onclick="FactionSystem.switchTab(\'relations\')">🌍 外交関係</button><button class="fs-tab' + (tab === 'faction' ? ' on' : '') + '" onclick="FactionSystem.switchTab(\'faction\')">🏰 陣営 (Faction)' + (calls ? '<span class="fs-badge">' + calls + '</span>' : '') + '</button><span class="fs-tension-mini">🌡️ 世界緊張度 <b>' + Math.round(CoreEngine.gameState.worldTension || 0) + '%</b></span></div>';
        c.innerHTML = bar + (tab === 'faction' ? FactionSystem.factionTabHTML() : stripped);
        if (tab === 'relations' && typeof DiplomacyManager.renderCountryList === 'function') DiplomacyManager.renderCountryList();
      };
      const origCreate = DiplomacyManager.createFaction.bind(DiplomacyManager);
      DiplomacyManager.createFaction = () => FactionSystem.create();
      DiplomacyManager.inviteToFaction = (tag) => FactionSystem.invite(tag);
    }
    // 宣戦布告 → 参戦要請
    if (typeof WarGoals !== 'undefined' && !WarGoals._fsHooked) {
      WarGoals._fsHooked = true;
      const orig = WarGoals.start.bind(WarGoals);
      WarGoals.start = (tag) => { const ok = orig(tag); if (ok) FactionSystem.onWarStart(CoreEngine.gameState.country, tag); return ok; };
    }
    if (typeof AIManager !== 'undefined' && !AIManager._fsHooked) {
      AIManager._fsHooked = true;
      const orig = AIManager.startWar.bind(AIManager);
      AIManager.startWar = (a, b) => { const already = FactionSystem.atWar(a, b); orig(a, b); if (!already && a !== b) { CoreEngine.addWorldTension(FactionSystem.MAJORS.includes(a) ? 8 : 4, FactionSystem.nameOf(a) + ' が ' + FactionSystem.nameOf(b) + ' に宣戦布告', a); FactionSystem.onWarStart(a, b); } };
    }
    // 併合 → 緊張度
    if (typeof MapRenderer !== 'undefined' && !MapRenderer._fsHooked) {
      MapRenderer._fsHooked = true;
      const orig = MapRenderer.annexCountry.bind(MapRenderer);
      MapRenderer.annexCountry = (tag) => { const r = orig(tag); CoreEngine.addWorldTension(10, FactionSystem.nameOf(tag) + ' の併合'); return r; };
    }
    if (typeof PeaceSystem !== 'undefined' && !PeaceSystem._fsHooked) {
      PeaceSystem._fsHooked = true;
      const orig = PeaceSystem.finalize.bind(PeaceSystem);
      PeaceSystem.finalize = () => { const c = PeaceSystem.data()?.conference; const n = c ? c.demands.filter(d => d.type === 'annex').length : 0; orig(); if (n) CoreEngine.addWorldTension(Math.min(15, n * 2), '講和条約による領土併合 (' + n + ' 州)'); };
    }
  }

  // ------------------------------------------------------------------
  // 陣営の基本操作
  // ------------------------------------------------------------------
  static factions() { return DiplomacyManager.factions; }
  static factionOf(tag) { return DiplomacyManager.factions.find(f => f.members.includes(tag)) || null; }
  static mine() { return FactionSystem.factionOf(CoreEngine.gameState.country); }
  static isLeader() { const f = FactionSystem.mine(); return !!f && f.leader === CoreEngine.gameState.country; }
  static sameFaction(a, b) { const f = FactionSystem.factionOf(a); return !!f && f.members.includes(b); }
  static atWar(a, b) { const s = CoreEngine.gameState; if (a === s.country) return (s.atWar || []).includes(b); if (b === s.country) return (s.atWar || []).includes(a); return typeof AIManager !== 'undefined' && AIManager.warActive?.(a, b); }
  static relationOf(tag) { return (DiplomacyManager.countries || []).find(c => c.id === tag)?.relation ?? 0; }
  static adjustRelation(tag, d) { const c = (DiplomacyManager.countries || []).find(x => x.id === tag); if (c) c.relation = Math.max(-100, Math.min(100, (c.relation || 0) + d)); }
  /** 民主主義制限: 世界緊張度 25% 未満では陣営関連の行動不可 */
  static democracyBlock(tag) { if (FactionSystem.ideologyOf(tag) === 'democracy' && (CoreEngine.gameState.worldTension || 0) < FactionSystem.DEMOCRACY_TENSION) return '民主主義国は世界緊張度 ' + FactionSystem.DEMOCRACY_TENSION + '% 以上でなければ陣営に参加・保障できません'; return null; }
  static unlocked() {
    const f = FactionSystem.data(); if (f.unlocked) return true;
    try { const done = typeof FocusTreeManager !== 'undefined' ? FocusTreeManager.completedFocuses : null; if (done && [...done].some(id => /faction|alliance|axis|allies|comintern|pact|sphere|同盟|陣営/i.test(String(id)))) { f.unlocked = true; return true; } } catch (e) { /* ignore */ }
    return false;
  }
  static create(nameArg) {
    const s = CoreEngine.gameState, f = FactionSystem.data();
    if (FactionSystem.mine()) { GameUI.notify('既に陣営に所属しています。', 'alert'); return false; }
    const block = FactionSystem.democracyBlock(s.country); if (block) { GameUI.notify(block, 'alert'); return false; }
    const cost = FactionSystem.unlocked() ? 0 : 50;
    if (s.politicalPower < cost) { GameUI.notify('陣営の創設には政治力 ' + cost + ' が必要です (国家方針で解禁すると無料)。', 'alert'); return false; }
    const def = (FactionSystem.NAME_IDEAS[FactionSystem.ideologyOf(s.country)] || ['新陣営'])[0];
    const name = (nameArg || (typeof prompt === 'function' ? prompt('陣営名を入力してください:', def) : def) || '').trim();
    if (!name) return false;
    s.politicalPower -= cost;
    const faction = { name, leader: s.country, members: [s.country], founded: FactionSystem.day(), ideology: FactionSystem.ideologyOf(s.country) };
    DiplomacyManager.factions.push(faction);
    CoreEngine.addWorldTension(3, '陣営「' + name + '」の創設');
    CoreEngine.log('🏰 陣営「' + name + '」を創設しました。'); GameUI.notify('🏰 陣営「' + name + '」を創設しました！', 'success');
    if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'faction_create', faction });
    FactionSystem.refresh(); return true;
  }
  static rename(nameArg) {
    const s = CoreEngine.gameState, f = FactionSystem.mine();
    if (!f || f.leader !== s.country) { GameUI.notify('陣営の盟主のみ改名できます。', 'alert'); return; }
    const name = (nameArg || (typeof prompt === 'function' ? prompt('新しい陣営名:', f.name) : '') || '').trim(); if (!name || name === f.name) return;
    if (s.politicalPower < 10) { GameUI.notify('政治力 10 が必要です。', 'alert'); return; }
    s.politicalPower -= 10; const old = f.name; f.name = name;
    (DiplomacyManager.countries || []).forEach(c => { if (c.faction === old) c.faction = name; });
    CoreEngine.log('🏰 陣営「' + old + '」を「' + name + '」に改名しました。'); FactionSystem.refresh();
  }
  static disband() {
    const s = CoreEngine.gameState, f = FactionSystem.mine();
    if (!f || f.leader !== s.country) return;
    if (typeof confirm === 'function' && !confirm('陣営「' + f.name + '」を解散しますか？')) return;
    DiplomacyManager.factions = DiplomacyManager.factions.filter(x => x !== f);
    CoreEngine.log('🏰 陣営「' + f.name + '」を解散しました。'); FactionSystem.refresh();
  }
  static leave() {
    const s = CoreEngine.gameState, f = FactionSystem.mine(); if (!f) return;
    if (f.leader === s.country) { GameUI.notify('盟主は離脱できません。指導権を譲渡するか解散してください。', 'alert'); return; }
    f.members = f.members.filter(m => m !== s.country);
    FactionSystem.adjustRelation(f.leader, -30); s.stability = Math.max(0, s.stability - 5);
    CoreEngine.log('🏰 陣営「' + f.name + '」から離脱しました。'); FactionSystem.refresh();
  }
  static kick(tag) {
    const s = CoreEngine.gameState, f = FactionSystem.mine();
    if (!f || f.leader !== s.country || tag === s.country) return;
    if (s.politicalPower < 20) { GameUI.notify('追放には政治力 20 が必要です。', 'alert'); return; }
    s.politicalPower -= 20; f.members = f.members.filter(m => m !== tag);
    const c = (DiplomacyManager.countries || []).find(x => x.id === tag); if (c) { c.faction = null; c.relation = Math.max(-100, (c.relation || 0) - 40); }
    CoreEngine.log('🏰 ' + FactionSystem.nameOf(tag) + ' を陣営「' + f.name + '」から追放しました。'); GameUI.notify('🏰 ' + FactionSystem.nameOf(tag) + ' を追放しました', 'alert');
    FactionSystem.refresh();
  }
  static transfer(tag) {
    const s = CoreEngine.gameState, f = FactionSystem.mine();
    if (!f || f.leader !== s.country || !f.members.includes(tag) || tag === s.country) return;
    if (typeof confirm === 'function' && !confirm(FactionSystem.nameOf(tag) + ' に陣営「' + f.name + '」の指導権を譲渡しますか？')) return;
    f.leader = tag; CoreEngine.log('🏰 陣営「' + f.name + '」の指導権を ' + FactionSystem.nameOf(tag) + ' に譲渡しました。'); FactionSystem.refresh();
  }
  /** AI の受諾判定 (招待・加入申請共通) */
  static aiAccepts(tag, faction) {
    const s = CoreEngine.gameState;
    if (FactionSystem.democracyBlock(tag)) return { ok: false, why: FactionSystem.nameOf(tag) + ' は民主主義国のため世界緊張度 ' + FactionSystem.DEMOCRACY_TENSION + '% 未満では加入しません' };
    if (FactionSystem.atWar(tag, faction.leader) || faction.members.some(m => FactionSystem.atWar(tag, m))) return { ok: false, why: '交戦中の国とは同盟できません' };
    const rel = FactionSystem.relationOf(tag), same = FactionSystem.ideologyOf(tag) === (faction.ideology || FactionSystem.ideologyOf(faction.leader));
    const threatened = (s.atWar || []).length || (typeof AIManager !== 'undefined' && (AIManager.state?.wars || []).some(w => w.a === tag || w.b === tag));
    const score = rel + (same ? 30 : -25) + (threatened ? 20 : 0) + (s.worldTension || 0) * 0.2 + (FactionSystem.MAJORS.includes(faction.leader) ? 10 : 0);
    return score >= 50 ? { ok: true, score } : { ok: false, score, why: '承諾見込み ' + Math.round(Math.max(0, Math.min(100, score))) + '% — 関係改善や同じ政体、脅威の高まりで上がります (必要 50)' };
  }
  static invite(tag) {
    const s = CoreEngine.gameState, f = FactionSystem.mine();
    if (!f || f.leader !== s.country) { GameUI.notify('招待は陣営の盟主のみ行えます。', 'alert'); return false; }
    if (f.members.includes(tag)) return false;
    if (FactionSystem.factionOf(tag)) { GameUI.notify(FactionSystem.nameOf(tag) + ' は既に他の陣営に所属しています。', 'alert'); return false; }
    if (s.politicalPower < 25) { GameUI.notify('招待には政治力 25 が必要です。', 'alert'); return false; }
    s.politicalPower -= 25;
    const r = FactionSystem.aiAccepts(tag, f);
    if (!r.ok) { GameUI.notify('❌ ' + FactionSystem.nameOf(tag) + ' は招待を拒否しました — ' + r.why, 'alert'); FactionSystem.adjustRelation(tag, 5); FactionSystem.refresh(); return false; }
    FactionSystem.join(tag, f, '招待');
    return true;
  }
  static join(tag, f, how) {
    if (f.members.includes(tag)) return;
    const old = FactionSystem.factionOf(tag); if (old) old.members = old.members.filter(m => m !== tag);
    f.members.push(tag);
    const c = (DiplomacyManager.countries || []).find(x => x.id === tag); if (c) c.faction = f.name;
    CoreEngine.addWorldTension(FactionSystem.MAJORS.includes(tag) ? 3 : 1, FactionSystem.nameOf(tag) + ' が陣営「' + f.name + '」に加盟 (' + how + ')', tag);
    CoreEngine.log('🏰 ' + FactionSystem.nameOf(tag) + ' が陣営「' + f.name + '」に加盟しました (' + how + ')。'); GameUI.notify('🏰 ' + FactionSystem.nameOf(tag) + ' が陣営「' + f.name + '」に加盟！', 'success');
    if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'faction_join', countryId: tag, factionName: f.name });
    FactionSystem.refresh();
  }
  /** プレイヤーが他陣営に加入申請 */
  static apply(factionName) {
    const s = CoreEngine.gameState, f = DiplomacyManager.factions.find(x => x.name === factionName); if (!f) return;
    if (FactionSystem.mine()) { GameUI.notify('既に陣営に所属しています。先に離脱してください。', 'alert'); return; }
    const block = FactionSystem.democracyBlock(s.country); if (block) { GameUI.notify(block, 'alert'); return; }
    if (s.politicalPower < 25) { GameUI.notify('加入申請には政治力 25 が必要です。', 'alert'); return; }
    if (f.members.some(m => (s.atWar || []).includes(m))) { GameUI.notify('交戦中の国が所属する陣営には加入できません。', 'alert'); return; }
    s.politicalPower -= 25;
    const rel = FactionSystem.relationOf(f.leader), same = FactionSystem.ideologyOf(s.country) === (f.ideology || FactionSystem.ideologyOf(f.leader));
    const score = rel + (same ? 30 : -30) + (s.worldTension || 0) * 0.2 + ((s.atWar || []).some(e => f.members.some(m => FactionSystem.atWar(m, e))) ? 25 : 0);
    if (score < 50) { GameUI.notify('❌ 陣営「' + f.name + '」は加入申請を却下しました (見込み ' + Math.round(Math.max(0, Math.min(100, score))) + '% / 必要 50)', 'alert'); FactionSystem.refresh(); return; }
    FactionSystem.join(s.country, f, '加入申請');
  }
  static guarantee(tag) {
    const s = CoreEngine.gameState, d = FactionSystem.data();
    if (d.guarantees.includes(tag)) { d.guarantees = d.guarantees.filter(t => t !== tag); CoreEngine.log('🛡️ ' + FactionSystem.nameOf(tag) + ' への独立保障を撤回'); FactionSystem.refresh(); return; }
    const block = FactionSystem.democracyBlock(s.country); if (block) { GameUI.notify(block, 'alert'); return; }
    if (s.politicalPower < 25) { GameUI.notify('独立保障には政治力 25 が必要です。', 'alert'); return; }
    s.politicalPower -= 25; d.guarantees.push(tag); FactionSystem.adjustRelation(tag, 20);
    CoreEngine.addWorldTension(2, FactionSystem.nameOf(tag) + ' の独立保障');
    CoreEngine.log('🛡️ ' + FactionSystem.nameOf(tag) + ' の独立を保障しました。攻撃されれば参戦要請が届きます。'); FactionSystem.refresh();
  }
  static refresh() { if (typeof CoreEngine.renderStats === 'function') CoreEngine.renderStats(); if (typeof DiplomacyManager !== 'undefined') DiplomacyManager.render(); }
  static switchTab(t) { FactionSystem.tab = t; DiplomacyManager.render(); }

  // ------------------------------------------------------------------
  // 集団安全保障 — 参戦要請
  // ------------------------------------------------------------------
  static makeWar(x, y) {
    const s = CoreEngine.gameState; if (x === y || FactionSystem.atWar(x, y) || FactionSystem.sameFaction(x, y)) return false;
    if (x === s.country || y === s.country) { const other = x === s.country ? y : x; if (!s.atWar.includes(other)) s.atWar.push(other); }
    else if (typeof AIManager !== 'undefined') { AIManager.state ||= { wars: [] }; AIManager.state.wars ||= []; if (!AIManager.warActive(x, y)) AIManager.state.wars.push({ a: x, b: y, day: FactionSystem.day() }); }
    return true;
  }
  /** 宣戦布告の発生 → 双方の陣営・保障国へ参戦要請 */
  static onWarStart(attacker, defender) {
    const s = CoreEngine.gameState, d = FactionSystem.data(); if (!d) return;
    const fa = FactionSystem.factionOf(attacker), fd = FactionSystem.factionOf(defender);
    const guarantors = attacker !== s.country && defender !== s.country ? [] : [];
    const defenders = new Set([defender]), attackers = new Set([attacker]);
    const playerCalls = [];
    // 防衛側の呼集 (同盟国 + 保障国)
    const defCandidates = new Set([...(fd ? fd.members : []), ...(d.guarantees.includes(defender) ? [s.country] : [])]);
    defCandidates.forEach(m => {
      if (m === defender || attackers.has(m)) return;
      if (m === s.country) { playerCalls.push({ from: defender, enemy: attacker, side: 'defend', faction: fd?.name }); return; }
      if (FactionSystem.aiJoins(m, defender, attacker, fd)) defenders.add(m);
    });
    // 攻撃側の呼集 (攻撃側陣営)
    (fa ? fa.members : []).forEach(m => {
      if (m === attacker || defenders.has(m)) return;
      if (m === s.country) { playerCalls.push({ from: attacker, enemy: defender, side: 'attack', faction: fa?.name }); return; }
      if (FactionSystem.aiJoins(m, attacker, defender, fa)) attackers.add(m);
    });
    // 戦争の拡大: 参戦した全ての組み合わせ
    let joined = 0;
    attackers.forEach(a => defenders.forEach(b => { if (FactionSystem.makeWar(a, b)) joined++; }));
    const joinedNames = [...attackers, ...defenders].filter(t => t !== attacker && t !== defender);
    if (joinedNames.length) {
      CoreEngine.addWorldTension(Math.min(10, joinedNames.length * 2), '陣営の参戦による戦争の拡大 (' + joinedNames.map(FactionSystem.nameOf).join('・') + ')');
      CoreEngine.log('⚔️ 参戦要請に応じ ' + joinedNames.map(FactionSystem.nameOf).join('・') + ' が参戦 — 戦争が拡大しました');
      GameUI.notify('⚔️ ' + joinedNames.map(FactionSystem.nameOf).join('・') + ' が参戦 — 戦争が陣営全体に拡大', 'alert');
      if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) { try { NewsManager.fireCustom({ icon: '⚔️', title: '戦争の拡大', body: FactionSystem.nameOf(attacker) + ' の ' + FactionSystem.nameOf(defender) + ' への宣戦布告を受け、' + joinedNames.map(FactionSystem.nameOf).join('・') + ' が参戦しました。' }); } catch (e) { /* ignore */ } }
    }
    // プレイヤーへの参戦要請
    playerCalls.forEach(c => {
      if (d.calls.some(x => x.from === c.from && x.enemy === c.enemy)) return;
      const enemies = [...(c.side === 'defend' ? attackers : defenders)];
      const call = { id: Date.now() + Math.floor(Math.random() * 1000), ...c, enemies, day: FactionSystem.day(), expires: FactionSystem.day() + 30 };
      d.calls.push(call);
      GameUI.notify('📯 参戦要請: ' + FactionSystem.nameOf(c.from) + ' が ' + FactionSystem.nameOf(c.enemy) + ' との戦争への参戦を求めています', 'alert');
      CoreEngine.log('📯 参戦要請 (Call to Arms): ' + FactionSystem.nameOf(c.from) + ' → 対 ' + enemies.map(FactionSystem.nameOf).join('・'));
      FactionSystem.openCallModal(call);
    });
    if (typeof CoreEngine.renderStats === 'function') CoreEngine.renderStats();
    if (typeof DiplomacyManager !== 'undefined' && WindowManager.isOpen?.('diplomacy')) DiplomacyManager.render();
  }
  static aiJoins(member, ally, enemy, faction) {
    if (faction && faction.leader === member) return true;             // 盟主は必ず応じる
    if (faction && faction.leader === ally) return Math.random() < 0.85; // 盟主の戦争には高確率で応じる
    return Math.random() < 0.6;
  }
  static openCallModal(call) {
    if (typeof GameUI === 'undefined' || !GameUI.openModal) return;
    const s = CoreEngine.gameState;
    GameUI.openModal('📯 参戦要請 — Call to Arms', '<div class="fs-modal"><div class="fs-call-head">' + FactionSystem.flag(call.from) + '<div><b>' + FactionSystem.esc(FactionSystem.nameOf(call.from)) + '</b>' + (call.faction ? '<small>陣営「' + FactionSystem.esc(call.faction) + '」</small>' : '<small>独立保障国</small>') + '</div></div>' +
      '<p>' + FactionSystem.esc(FactionSystem.nameOf(call.from)) + ' は <b>' + FactionSystem.esc(FactionSystem.nameOf(call.enemy)) + '</b> と戦争状態に入りました。' + (call.side === 'defend' ? '集団安全保障に基づき' : '陣営の盟約に基づき') + '参戦を要請しています。</p>' +
      '<p class="fs-enemies">承諾すると次の国と戦争状態になります: ' + call.enemies.map(t => '<span>' + FactionSystem.flag(t) + ' ' + FactionSystem.esc(FactionSystem.nameOf(t)) + '</span>').join(' ') + '</p>' +
      '<p class="fs-help">拒否すると陣営内の関係が悪化し (−30)、安定度が低下します (−5)。要請は 30 日で失効します。</p>' +
      '<div class="fs-actions"><button class="fs-btn primary" onclick="FactionSystem.acceptCall(' + call.id + ')">⚔️ 参戦する</button><button class="fs-btn" onclick="FactionSystem.declineCall(' + call.id + ')">拒否する</button><button class="fs-btn" onclick="GameUI.closeModal()">後で決める</button></div></div>');
  }
  static acceptCall(id) {
    const s = CoreEngine.gameState, d = FactionSystem.data(); const call = d.calls.find(c => c.id === id); if (!call) return;
    d.calls = d.calls.filter(c => c.id !== id);
    const added = [];
    call.enemies.forEach(e => { if (!FactionSystem.sameFaction(s.country, e) && !s.atWar.includes(e)) { s.atWar.push(e); added.push(e); } });
    // 自国の陣営も連鎖的に参戦
    const f = FactionSystem.mine();
    (f ? f.members : []).forEach(m => { if (m === s.country) return; call.enemies.forEach(e => { if (Math.random() < 0.7) FactionSystem.makeWar(m, e); }); });
    s.warSupport = Math.min(100, s.warSupport + 5);
    CoreEngine.addWorldTension(5, '参戦要請の承諾 — 対 ' + added.map(FactionSystem.nameOf).join('・'));
    CoreEngine.log('⚔️ 参戦要請を承諾: ' + added.map(FactionSystem.nameOf).join('・') + ' と戦争状態に入りました。');
    GameUI.notify('⚔️ 参戦! ' + added.map(FactionSystem.nameOf).join('・') + ' と戦争状態', 'alert');
    GameUI.closeModal?.(); FactionSystem.refresh();
    if (typeof MultiplayerManager !== 'undefined') added.forEach(t => MultiplayerManager.broadcast({ type: 'declare_war', target: t }));
  }
  static declineCall(id) {
    const s = CoreEngine.gameState, d = FactionSystem.data(); const call = d.calls.find(c => c.id === id); if (!call) return;
    d.calls = d.calls.filter(c => c.id !== id);
    FactionSystem.adjustRelation(call.from, -30); s.stability = Math.max(0, s.stability - 5);
    CoreEngine.log('📯 ' + FactionSystem.nameOf(call.from) + ' の参戦要請を拒否しました (関係 −30・安定度 −5)。');
    GameUI.closeModal?.(); FactionSystem.refresh();
  }

  // ------------------------------------------------------------------
  // 毎日
  // ------------------------------------------------------------------
  static onTick() {
    const s = CoreEngine.gameState, d = FactionSystem.data(); if (!d || !MapRenderer.ready) return;
    const day = FactionSystem.day(); if (d.lastDay === day) return; d.lastDay = day;
    // 史実陣営 (プレイヤーを含まないもの) を初期化
    if (!d.historicalDone) {
      d.historicalDone = true;
      const tags = new Set(Object.values(MapRenderer.states || {}).map(st => st.owner));
      FactionSystem.HISTORICAL.forEach(h => {
        if (h.members.includes(s.country) || DiplomacyManager.factions.some(f => f.name === h.name || f.members.includes(h.leader))) return;
        const members = h.members.filter(m => tags.has(m) && !FactionSystem.factionOf(m)); if (!members.includes(h.leader)) return;
        DiplomacyManager.factions.push({ name: h.name, leader: h.leader, members, founded: day, ideology: h.ideology });
        members.forEach(m => { const c = (DiplomacyManager.countries || []).find(x => x.id === m); if (c) c.faction = h.name; });
      });
    }
    // 参戦要請の失効
    const before = d.calls.length; d.calls = d.calls.filter(c => c.expires > day);
    if (d.calls.length !== before) GameUI.notify('📯 参戦要請が失効しました', 'alert');
    // 緊張度の自然減衰 (戦争がなければ 0.02/日)
    const anyWar = (s.atWar || []).length || (typeof AIManager !== 'undefined' && (AIManager.state?.wars || []).length);
    if (!anyWar && s.worldTension > 0) { s.worldTension = Math.max(0, s.worldTension - 0.02); if (Math.round(s.worldTension * 100) % 100 === 0) FactionSystem.renderTopbar(); }
    // AI 陣営の拡大: 盟主が同じ政体の近隣国を招き入れる (低頻度)
    if (day % 30 === 0) {
      DiplomacyManager.factions.forEach(f => {
        if (f.leader === s.country || Math.random() > 0.5) return;
        const cand = (DiplomacyManager.countries || []).map(c => c.id).filter(t => t !== s.country && !FactionSystem.factionOf(t) && FactionSystem.ideologyOf(t) === (f.ideology || FactionSystem.ideologyOf(f.leader)) && !FactionSystem.democracyBlock(t));
        if (!cand.length) return;
        const t = cand[Math.floor(Math.random() * cand.length)];
        if (Math.random() < 0.35 + (s.worldTension || 0) / 200) FactionSystem.join(t, f, '盟主の招待');
      });
      // AI 盟主からプレイヤーへの招待
      if (!FactionSystem.mine() && !FactionSystem.democracyBlock(s.country)) {
        const f = DiplomacyManager.factions.find(x => (x.ideology || FactionSystem.ideologyOf(x.leader)) === FactionSystem.ideologyOf(s.country) && FactionSystem.relationOf(x.leader) >= 40 && !x.members.some(m => (s.atWar || []).includes(m)));
        if (f && Math.random() < 0.4 && !d.invites.some(i => i.faction === f.name)) { d.invites.push({ faction: f.name, from: f.leader, day, expires: day + 60 }); GameUI.notify('✉️ 陣営「' + f.name + '」から加盟の招待が届きました (外交 → 陣営タブ)', 'success'); }
      }
    }
    d.invites = d.invites.filter(i => i.expires > day && DiplomacyManager.factions.some(f => f.name === i.faction));
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('tension')) FactionSystem.renderTension();
  }
  static acceptInvite(name) { const d = FactionSystem.data(); const inv = d.invites.find(i => i.faction === name); const f = DiplomacyManager.factions.find(x => x.name === name); if (!inv || !f) return; const block = FactionSystem.democracyBlock(CoreEngine.gameState.country); if (block) { GameUI.notify(block, 'alert'); return; } d.invites = d.invites.filter(i => i !== inv); FactionSystem.join(CoreEngine.gameState.country, f, '招待を承諾'); }
  static declineInvite(name) { const d = FactionSystem.data(); d.invites = d.invites.filter(i => i.faction !== name); FactionSystem.refresh(); }

  // ------------------------------------------------------------------
  // UI: 上部バー・緊張度ウィンドウ
  // ------------------------------------------------------------------
  static levelOf(t) { return t >= 75 ? { name: '大戦前夜', color: '#ff5a4a' } : t >= 50 ? { name: '危機', color: '#ff9a3c' } : t >= 25 ? { name: '緊迫', color: '#e3c06a' } : { name: '平穏', color: '#9fd98a' }; }
  static renderTopbar() {
    const el = document.getElementById('world-tension'); if (!el) return;
    const t = Number(CoreEngine.gameState.worldTension || 0), lv = FactionSystem.levelOf(t);
    const v = el.querySelector?.('.wt-val'); if (v) { v.textContent = Math.round(t) + '%'; if (v.style) v.style.color = lv.color; }
    const l = el.querySelector?.('.tension-label'); if (l) l.textContent = '世界緊張度 ' + lv.name;
    if (el.style) el.style.borderColor = lv.color;
  }
  static renderTension() {
    const el = document.getElementById('tension-content'); if (!el) return;
    const s = CoreEngine.gameState, d = FactionSystem.data(), t = Number(s.worldTension || 0), lv = FactionSystem.levelOf(t);
    const by = Object.entries(s.strategy?.tensionByCountry || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const spark = [...d.tensionLog].reverse().slice(-60);
    let html = '<div class="fs-root"><div class="fs-tension-hero" style="--c:' + lv.color + '"><div class="fs-tension-num">' + t.toFixed(1) + '<small>%</small></div><div><h3>世界緊張度 <small>WORLD TENSION</small></h3><p>状態: <b style="color:' + lv.color + '">' + lv.name + '</b></p><div class="fs-bar"><em style="width:' + t + '%;background:' + lv.color + '"></em><i style="left:25%" title="25%: 民主主義国の陣営加入・保障が可能"></i><i style="left:50%" title="50%: 中道国の正当化が可能"></i><i style="left:100%" title="100%: 民主主義国の正当化が可能"></i></div></div></div>';
    html += '<div class="fs-grid"><div class="fs-panel"><h4>しきい値</h4><table class="fs-table"><tr><th>25%</th><td>民主主義国が陣営に加入・独立保障を行える</td><td>' + (t >= 25 ? '✅' : '—') + '</td></tr><tr><th>50%</th><td>中道国が戦争目標を正当化できる</td><td>' + (t >= 50 ? '✅' : '—') + '</td></tr><tr><th>100%</th><td>民主主義国が戦争目標を正当化できる</td><td>' + (t >= 100 ? '✅' : '—') + '</td></tr></table>' +
      '<h4>緊張度を生んだ国</h4>' + (by.length ? '<div class="fs-chips">' + by.map(([tag, v]) => '<span>' + FactionSystem.flag(tag) + ' ' + FactionSystem.esc(FactionSystem.nameOf(tag)) + ' <b>+' + Math.round(v) + '</b></span>').join('') + '</div>' : '<p class="fs-help">まだ記録がありません。</p>') + '</div>' +
      '<div class="fs-panel"><h4>推移 (直近 ' + spark.length + ' 件)</h4><div class="fs-spark">' + spark.map(e => '<i style="height:' + Math.max(2, e.after) + '%;background:' + FactionSystem.levelOf(e.after).color + '" title="' + FactionSystem.esc(e.reason) + ' → ' + Math.round(e.after) + '%"></i>').join('') + '</div><p class="fs-help">正当化 +10、宣戦布告 +15、併合 +10、講和での割譲、陣営加盟・参戦などで上昇。戦争がない期間は 1 日 0.02% ずつ低下します。</p></div></div>';
    html += '<div class="fs-panel"><h4>変動履歴</h4><table class="fs-log"><thead><tr><th>日付</th><th>変動</th><th>理由</th><th>発生国</th><th>結果</th></tr></thead><tbody>' + (d.tensionLog.length ? d.tensionLog.slice(0, 80).map(e => '<tr><td>' + FactionSystem.esc(e.date || ('Day ' + e.day)) + '</td><td class="' + (e.delta > 0 ? 'up' : 'down') + '">' + (e.delta > 0 ? '+' : '') + Number(e.delta).toFixed(1) + '%</td><td>' + FactionSystem.esc(e.reason) + '</td><td>' + (e.source ? FactionSystem.flag(e.source) + ' ' + FactionSystem.esc(FactionSystem.nameOf(e.source)) : '') + '</td><td>' + Math.round(e.after) + '%</td></tr>').join('') : '<tr><td colspan="5" class="fs-help">変動はまだありません。</td></tr>') + '</tbody></table></div></div>';
    el.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // UI: 陣営タブ
  // ------------------------------------------------------------------
  static factionTabHTML() {
    const s = CoreEngine.gameState, d = FactionSystem.data(), me = s.country, mine = FactionSystem.mine(), leader = FactionSystem.isLeader(), t = s.worldTension || 0;
    const block = FactionSystem.democracyBlock(me);
    let html = '<div class="fs-root">';
    // 参戦要請・招待
    if (d.calls.length) html += '<div class="fs-panel alert"><h4>📯 参戦要請 (Call to Arms)</h4>' + d.calls.map(c => '<div class="fs-call"><span>' + FactionSystem.flag(c.from) + ' <b>' + FactionSystem.esc(FactionSystem.nameOf(c.from)) + '</b> → 対 ' + c.enemies.map(e => FactionSystem.flag(e) + ' ' + FactionSystem.esc(FactionSystem.nameOf(e))).join('・') + ' <small>(あと ' + (c.expires - FactionSystem.day()) + ' 日)</small></span><span><button class="fs-btn primary small" onclick="FactionSystem.acceptCall(' + c.id + ')">⚔️ 参戦</button><button class="fs-btn small" onclick="FactionSystem.declineCall(' + c.id + ')">拒否</button></span></div>').join('') + '</div>';
    if (d.invites.length) html += '<div class="fs-panel"><h4>✉️ 陣営からの招待</h4>' + d.invites.map(i => '<div class="fs-call"><span>' + FactionSystem.flag(i.from) + ' 陣営「<b>' + FactionSystem.esc(i.faction) + '</b>」 <small>(あと ' + (i.expires - FactionSystem.day()) + ' 日)</small></span><span><button class="fs-btn primary small" onclick="FactionSystem.acceptInvite(\'' + FactionSystem.esc(i.faction) + '\')">加盟</button><button class="fs-btn small" onclick="FactionSystem.declineInvite(\'' + FactionSystem.esc(i.faction) + '\')">辞退</button></span></div>').join('') + '</div>';
    // 自国の陣営
    html += '<div class="fs-panel"><h4>🏰 自国の陣営</h4>';
    if (!mine) {
      html += '<p class="fs-help">所属する陣営はありません。' + (block ? '<span class="fs-red">' + block + ' (現在 ' + Math.round(t) + '%)</span>' : '') + '</p><div class="fs-actions"><button class="fs-btn primary" ' + (block ? 'disabled' : '') + ' onclick="FactionSystem.create()">🏰 オリジナル陣営を創設 (' + (FactionSystem.unlocked() ? '国家方針で解禁済み・無料' : 'PP50') + ')</button></div><p class="fs-help">陣営名の例: ' + (FactionSystem.NAME_IDEAS[FactionSystem.ideologyOf(me)] || []).join(' / ') + ' — 創設後も盟主は改名できます。</p>';
    } else {
      html += '<div class="fs-faction-card"><div class="fs-faction-head"><div><b>' + FactionSystem.esc(mine.name) + '</b><small>盟主: ' + FactionSystem.flag(mine.leader) + ' ' + FactionSystem.esc(FactionSystem.nameOf(mine.leader)) + ' ／ ' + mine.members.length + ' か国 ／ ' + (FactionSystem.IDEOLOGY_NAME[mine.ideology || FactionSystem.ideologyOf(mine.leader)] || '') + '</small></div><div class="fs-actions">' + (leader ? '<button class="fs-btn small" onclick="FactionSystem.rename()">✏️ 改名 (PP10)</button><button class="fs-btn small danger" onclick="FactionSystem.disband()">解散</button>' : '<button class="fs-btn small danger" onclick="FactionSystem.leave()">陣営を離脱</button>') + '</div></div>' +
        '<div class="fs-members">' + mine.members.map(m => '<div class="fs-member' + (m === mine.leader ? ' leader' : '') + '">' + FactionSystem.flag(m) + '<b>' + FactionSystem.esc(FactionSystem.nameOf(m)) + '</b><small>' + (m === mine.leader ? '👑 盟主' : (FactionSystem.IDEOLOGY_NAME[FactionSystem.ideologyOf(m)] || '')) + (m !== me ? ' ／ 関係 ' + FactionSystem.relationOf(m) : ' (自国)') + ((s.atWar || []).length && m !== me ? ' ／ ' + ((s.atWar || []).some(e => FactionSystem.atWar(m, e)) ? '⚔️ 共同交戦中' : '非交戦') : '') + '</small>' + (leader && m !== me ? '<div class="fs-actions"><button class="fs-btn small" onclick="FactionSystem.transfer(\'' + m + '\')">👑 指導権を譲渡</button><button class="fs-btn small danger" onclick="FactionSystem.kick(\'' + m + '\')">追放 (PP20)</button></div>' : '') + '</div>').join('') + '</div></div>';
    }
    html += '</div>';
    // 世界の陣営
    const others = DiplomacyManager.factions.filter(f => f !== mine);
    html += '<div class="fs-panel"><h4>🌐 世界の陣営</h4>' + (others.length ? others.map(f => '<div class="fs-faction-card other"><div class="fs-faction-head"><div><b>' + FactionSystem.esc(f.name) + '</b><small>盟主: ' + FactionSystem.flag(f.leader) + ' ' + FactionSystem.esc(FactionSystem.nameOf(f.leader)) + ' ／ ' + (FactionSystem.IDEOLOGY_NAME[f.ideology || FactionSystem.ideologyOf(f.leader)] || '') + ' ／ 盟主との関係 ' + FactionSystem.relationOf(f.leader) + '</small></div>' + (!mine ? '<button class="fs-btn small primary" ' + (block ? 'disabled' : '') + ' onclick="FactionSystem.apply(\'' + FactionSystem.esc(f.name) + '\')">加入申請 (PP25)</button>' : '') + '</div><div class="fs-chips">' + f.members.map(m => '<span>' + FactionSystem.flag(m) + ' ' + FactionSystem.esc(FactionSystem.nameOf(m)) + '</span>').join('') + '</div></div>').join('') : '<p class="fs-help">他の陣営はまだありません。</p>') + '</div>';
    // 招待・保障
    const cands = (DiplomacyManager.countries || []).filter(c => !FactionSystem.factionOf(c.id) && !(s.atWar || []).includes(c.id)).sort((a, b) => b.relation - a.relation);
    const q = (FactionSystem.search || '').toLowerCase();
    html += '<div class="fs-panel"><h4>✉️ 招待・独立保障</h4><input class="fs-search" placeholder="🔍 国名で検索" value="' + FactionSystem.esc(FactionSystem.search || '') + '" oninput="FactionSystem.search=this.value;FactionSystem.renderCands()"><div id="fs-cands">' + FactionSystem.candsHTML(cands, q) + '</div><p class="fs-help">招待は盟主のみ (PP25)。承諾見込み = 関係 ＋ 同じ政体 +30 (異なる −25) ＋ 脅威 +20 ＋ 緊張度×0.2 ≥ 50。独立保障 (PP25) した国が攻撃されると参戦要請が届きます。' + (block ? ' <span class="fs-red">' + block + '</span>' : '') + '</p></div></div>';
    return html;
  }
  static candsHTML(cands, q) {
    const s = CoreEngine.gameState, d = FactionSystem.data(), mine = FactionSystem.mine(), leader = FactionSystem.isLeader();
    const list = cands.filter(c => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 40);
    return '<table class="fs-log"><thead><tr><th>国</th><th>政体</th><th>関係</th><th>承諾見込み</th><th></th></tr></thead><tbody>' + list.map(c => { const est = mine ? FactionSystem.aiAccepts(c.id, mine) : null; const g = d.guarantees.includes(c.id); return '<tr><td>' + FactionSystem.flag(c.id) + ' ' + FactionSystem.esc(c.name) + '</td><td>' + (FactionSystem.IDEOLOGY_NAME[FactionSystem.ideologyOf(c.id)] || '') + '</td><td>' + c.relation + '</td><td>' + (est ? (est.ok ? '<span class="up">承諾</span>' : '<span class="fs-red">' + Math.round(Math.max(0, Math.min(100, est.score || 0))) + '%</span>') : '—') + '</td><td><button class="fs-btn small" ' + (leader ? '' : 'disabled') + ' onclick="FactionSystem.invite(\'' + c.id + '\')">招待</button><button class="fs-btn small' + (g ? ' on' : '') + '" onclick="FactionSystem.guarantee(\'' + c.id + '\')">' + (g ? '🛡️ 保障中' : '独立保障') + '</button></td></tr>'; }).join('') + '</tbody></table>';
  }
  static renderCands() { const el = document.getElementById('fs-cands'); if (!el) return; const s = CoreEngine.gameState; const cands = (DiplomacyManager.countries || []).filter(c => !FactionSystem.factionOf(c.id) && !(s.atWar || []).includes(c.id)).sort((a, b) => b.relation - a.relation); el.innerHTML = FactionSystem.candsHTML(cands, (FactionSystem.search || '').toLowerCase()); }
}
if (typeof window !== 'undefined') window.FactionSystem = FactionSystem;
