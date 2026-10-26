/* superweapons.js — HOI4風「特殊計画 (Special Projects)・核開発・ミサイル」
 *
 *  - 研究 → 特殊計画: 基礎研究 (原子物理学 / ロケット工学 / ジェットエンジン) を研究しただけでは使えない。
 *    特殊計画画面で科学者を割り当て、民需工場 (IC) と人的資源を投資して 100% まで進めると実用化技術が解禁される
 *  - 備蓄: 「原子爆弾」完了後、原子炉 (州建物・レベルごと) から核兵器が、「V2ロケット」完了後、ロケット発射施設から
 *    ロケットが自動生産される。上部バーに ☢️ / 🚀 の備蓄を常時表示
 *  - 核攻撃: 制空権 75% 以上・戦略爆撃機 (またはジェット爆撃機) の配備・核備蓄 1 以上。全画面フラッシュ＋キノコ雲、
 *    州の建物を全破壊・州内師団の組織率/充足を 90% カット・対象国の戦争協力度を大幅低下
 *  - ミサイル攻撃: 発射施設の射程内の敵州へ継続爆撃 (毎日ロケットを消費し、インフラ・要塞・師団に損害)
 */
class SuperWeapons {
  static PROJECTS = {
    uranium:  { id: 'uranium',  name: 'ウラン濃縮計画',   icon: '⚛️', points: 900,  manpower: 20000, tech: /atomic|nuclear|uranium/i, techName: '原子物理学 (atomic_research)', requires: null,      desc: '原子炉の建設を可能にする。核開発の第一歩。', unlocks: '原子炉の建設' },
    atomic:   { id: 'atomic',   name: '原子爆弾',         icon: '☢️', points: 1600, manpower: 30000, tech: /atomic|nuclear/i,         techName: '原子物理学',           requires: 'uranium', desc: '原子炉から核兵器を生産できるようになる。', unlocks: '核兵器の生産 (原子炉 Lv1 ごとに 50 日に 1 発)' },
    v2:       { id: 'v2',       name: 'V2ロケット開発',   icon: '🚀', points: 700,  manpower: 10000, tech: /rocket/i,                 techName: 'ロケット工学 (experimental_rockets)', requires: null,  desc: 'ロケット発射施設の建設と長距離ロケットの生産を解禁。', unlocks: 'ロケット発射施設・ロケット生産 (施設 Lv1 ごとに 0.5 発/日)' },
    ballistic:{ id: 'ballistic', name: '弾道ミサイル',     icon: '🛰️', points: 1300, manpower: 15000, tech: /rocket/i,                 techName: 'ロケット工学',          requires: 'v2',      desc: '射程 2 倍・威力 1.5 倍のミサイル。核弾頭の搭載も可能に。', unlocks: 'ミサイル射程×2・威力×1.5' },
    jet:      { id: 'jet',      name: 'ジェットエンジン実用化', icon: '✈️', points: 800, manpower: 8000, tech: /jet/i,                 techName: 'ジェットエンジン (sp_centrifugal_jet_tech)', requires: null, desc: 'ジェット爆撃機が核の運搬手段として使用可能になり、戦略爆撃機 +20。', unlocks: 'ジェット爆撃機 (核攻撃の適格機)・戦略爆撃機 +20' },
  };
  static SCIENTISTS = [
    { id: 'phys1', name: '理論物理学者', icon: '👨‍🔬', skill: 1.6, field: ['uranium', 'atomic'] },
    { id: 'phys2', name: '核化学者',     icon: '👩‍🔬', skill: 1.3, field: ['uranium', 'atomic'] },
    { id: 'rock1', name: 'ロケット技師', icon: '🧑‍🚀', skill: 1.6, field: ['v2', 'ballistic'] },
    { id: 'rock2', name: '弾道学者',     icon: '🧮', skill: 1.3, field: ['v2', 'ballistic'] },
    { id: 'aero1', name: '航空工学者',   icon: '🛠️', skill: 1.5, field: ['jet'] },
    { id: 'gen1',  name: '総合研究所長', icon: '🎓', skill: 1.1, field: ['uranium', 'atomic', 'v2', 'ballistic', 'jet'] },
  ];
  static NAMES = {
    GER: { phys1: 'ヴェルナー・ハイゼンベルク', phys2: 'オットー・ハーン', rock1: 'ヴェルナー・フォン・ブラウン', rock2: 'ヴァルター・ドルンベルガー', aero1: 'ハンス・フォン・オハイン', gen1: 'ヴァルター・ゲルラッハ' },
    USA: { phys1: 'ロバート・オッペンハイマー', phys2: 'エンリコ・フェルミ', rock1: 'ロバート・ゴダード', rock2: 'セオドア・フォン・カルマン', aero1: 'フランク・ホイットル (招聘)', gen1: 'ヴァネヴァー・ブッシュ' },
    SOV: { phys1: 'イーゴリ・クルチャトフ', phys2: 'ユーリ・ハリトン', rock1: 'セルゲイ・コロリョフ', rock2: 'ヴァレンティン・グルシュコ', aero1: 'アルヒープ・リューリカ', gen1: 'アブラム・ヨッフェ' },
    ENG: { phys1: 'ジェームズ・チャドウィック', phys2: 'ルドルフ・パイエルス', rock1: 'アルウィン・クロウ', rock2: 'ウィリアム・クック', aero1: 'フランク・ホイットル', gen1: 'ヘンリー・ティザード' },
    JAP: { phys1: '仁科芳雄', phys2: '荒勝文策', rock1: '糸川英夫', rock2: '三木忠直', aero1: '種子島時休', gen1: '湯川秀樹' },
    FRA: { phys1: 'フレデリック・ジョリオ＝キュリー', phys2: 'イレーヌ・ジョリオ＝キュリー', rock1: 'ジャン＝ジャック・バール', rock2: 'ロベール・エスノー＝ペルトリ', aero1: 'ルネ・ルデュック', gen1: 'ポール・ランジュバン' },
    ITA: { phys1: 'エンリコ・フェルミ', phys2: 'エドアルド・アマルディ', rock1: 'ガエターノ・アルトゥーロ・クロッコ', rock2: 'ルイジ・ブロリオ', aero1: 'セコンド・カンピーニ', gen1: 'グリエルモ・マルコーニ' },
  };
  static NUKE_RATE = 0.02;      // 原子炉 Lv1 あたり /日 (= 50日に1発)
  static ROCKET_RATE = 0.5;     // 発射施設 Lv1 あたり /日
  static MISSILE_RANGE = 900;   // 地図ピクセル
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }
  static nameOf(tag) { return typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(tag) : tag; }
  static sciName(sc) { return SuperWeapons.NAMES[CoreEngine.gameState.country]?.[sc.id] || sc.name; }

  // ------------------------------------------------------------------
  static init() {
    if (SuperWeapons.installed) return;
    SuperWeapons.installed = true;
    SuperWeapons.data();
    SuperWeapons.installUI();
    SuperWeapons.installHooks();
    CoreEngine.registerTickCallback(() => SuperWeapons.onTick());
    CoreEngine.log('⚛️ 特殊計画・核/ミサイルシステムが有効になりました。');
  }
  static data() {
    const s = CoreEngine.gameState; if (!s.strategy) return null;
    const d = (s.strategy.sw ||= { projects: {}, rockets: 0, missions: [], log: [], strikes: 0 });
    d.projects ||= {}; d.missions ||= []; d.log ||= [];
    Object.keys(SuperWeapons.PROJECTS).forEach(id => { d.projects[id] ||= { progress: 0, factories: 0, scientist: null, started: false, done: false, manpowerPaid: false }; });
    if (!Number.isFinite(s.nuclearStockpile)) s.nuclearStockpile = 0;
    return d;
  }
  static installUI() {
    const root = document.getElementById('window-templates');
    if (root && !document.getElementById('tpl-superweapons')) {
      const el = document.createElement('div'); el.className = 'window-template pane-scroll'; el.id = 'tpl-superweapons';
      el.dataset.title = '⚛️ 特殊計画 — Special Projects・核・ミサイル'; el.dataset.w = '1180'; el.dataset.h = '780'; el.innerHTML = '<div id="superweapons-content"></div>'; root.appendChild(el);
    }
    // 上部バーの備蓄表示
    const nav = document.querySelector?.('.topbar-nav'); const wt = document.getElementById('world-tension');
    if (nav && !document.getElementById('sw-stock')) {
      const b = document.createElement('button'); b.className = 'speed-btn sw-stock'; b.id = 'sw-stock'; b.title = '核兵器・ロケットの備蓄 — クリックで特殊計画';
      b.setAttribute('onclick', "GameUI.switchTab('superweapons')");
      b.innerHTML = '<span class="sw-nuke">☢️ <b id="sw-nukes">0</b></span><span class="sw-rocket">🚀 <b id="sw-rockets">0</b></span>';
      if (wt && nav.insertBefore) nav.insertBefore(b, wt); else nav.appendChild(b);
    }
    // ナビボタン
    const navbar = document.getElementById('window-nav');
    if (navbar && !navbar.querySelector?.('[data-tab="superweapons"]')) {
      const b = document.createElement('button'); b.className = 'win-btn'; b.dataset.tab = 'superweapons'; b.setAttribute('onclick', "GameUI.switchTab('superweapons')"); b.textContent = '⚛️ 特殊計画';
      const ref = navbar.querySelector?.('[data-tab="special"]'); if (ref && ref.nextSibling) navbar.insertBefore(b, ref.nextSibling); else navbar.appendChild(b);
    }
    if (typeof GameUI !== 'undefined' && !GameUI._swHooked) {
      GameUI._swHooked = true;
      const orig = GameUI.onWindowOpened.bind(GameUI);
      GameUI.onWindowOpened = (tab) => { orig(tab); if (tab === 'superweapons') SuperWeapons.render(); };
    }
    if (typeof CoreEngine.renderStats === 'function' && !CoreEngine._swHooked) {
      CoreEngine._swHooked = true;
      const orig = CoreEngine.renderStats.bind(CoreEngine);
      CoreEngine.renderStats = () => { orig(); SuperWeapons.renderTopbar(); };
    }
  }
  static installHooks() {
    // 建設: ロケット発射施設の追加・原子炉のレベル拡張・解禁ゲート
    if (typeof ConstructionManager !== 'undefined' && !ConstructionManager._swHooked) {
      ConstructionManager._swHooked = true;
      const list = ConstructionManager.BUILDINGS;
      const reactor = list.find(b => b.id === 'nuclear_reactor'); if (reactor) reactor.max = 3;
      if (!list.some(b => b.id === 'rocket_site')) { const i = list.findIndex(b => b.id === 'nuclear_reactor'); const def = { id: 'rocket_site', name: 'ロケット発射施設', icon: '🚀', cost: 400, max: 3 }; if (i >= 0) list.splice(i + 1, 0, def); else list.push(def); }
      const orig = ConstructionManager.enqueue.bind(ConstructionManager);
      ConstructionManager.enqueue = (id) => {
        if (id === 'rocket_site' && !SuperWeapons.done('v2')) { GameUI.notify('特殊計画「V2ロケット開発」を完了するとロケット発射施設を建設できます。', 'alert'); return; }
        return orig(id);
      };
    }
    // 旧 NuclearManager の自動生産は停止 (本システムが原子炉から生産)
    if (typeof NuclearManager !== 'undefined' && !NuclearManager._swHooked) {
      NuclearManager._swHooked = true;
      NuclearManager.onTick = () => { if (typeof GameUI !== 'undefined' && GameUI.currentTab === 'nuclear') NuclearManager.render(); };
    }
    // 特殊計画に割り当てた民需工場は他で使えない
    if (typeof FactoryBudget !== 'undefined' && !FactoryBudget._swHooked) {
      FactoryBudget._swHooked = true;
      const orig = FactoryBudget.availableCivilian.bind(FactoryBudget);
      FactoryBudget.availableCivilian = (tag = CoreEngine.gameState.country) => orig(tag) - (tag === CoreEngine.gameState.country ? SuperWeapons.allocated() : 0);
    }
  }

  // ------------------------------------------------------------------
  // 研究・特殊計画
  // ------------------------------------------------------------------
  static researched(re) { try { const set = typeof ResearchManager !== 'undefined' ? ResearchManager.researchedTech : null; if (!set) return false; return [...set].some(id => re.test(String(id))); } catch (e) { return false; } }
  static done(id) { return !!SuperWeapons.data()?.projects[id]?.done; }
  static allocated() { const d = SuperWeapons.data(); if (!d) return 0; return Object.values(d.projects).reduce((a, p) => a + (p.started && !p.done ? (p.factories || 0) : 0), 0); }
  static blocker(id) {
    const P = SuperWeapons.PROJECTS[id], d = SuperWeapons.data();
    if (!SuperWeapons.researched(P.tech)) return '基礎研究「' + P.techName + '」を研究画面で完了してください';
    if (P.requires && !d.projects[P.requires].done) return '特殊計画「' + SuperWeapons.PROJECTS[P.requires].name + '」の完了が必要です';
    return null;
  }
  static scientistOf(id) { const sid = SuperWeapons.data().projects[id].scientist; return SuperWeapons.SCIENTISTS.find(x => x.id === sid) || null; }
  static assign(id, sciId) {
    const d = SuperWeapons.data(); const sc = SuperWeapons.SCIENTISTS.find(x => x.id === sciId);
    if (sciId && !sc) return;
    if (sc && !sc.field.includes(id)) { GameUI.notify(SuperWeapons.sciName(sc) + ' はこの分野の専門家ではありません。', 'alert'); return; }
    Object.values(d.projects).forEach(p => { if (p.scientist === sciId) p.scientist = null; });
    d.projects[id].scientist = sciId || null;
    SuperWeapons.render();
  }
  static setFactories(id, n) {
    const d = SuperWeapons.data(), p = d.projects[id];
    const free = (typeof FactoryBudget !== 'undefined' ? FactoryBudget.availableCivilian() : 10) + (p.started && !p.done ? p.factories : 0);
    p.factories = Math.max(0, Math.min(15, Math.min(free, Math.floor(Number(n) || 0))));
    SuperWeapons.render();
  }
  static start(id) {
    const s = CoreEngine.gameState, d = SuperWeapons.data(), p = d.projects[id], P = SuperWeapons.PROJECTS[id];
    if (p.done || p.started) return;
    const b = SuperWeapons.blocker(id); if (b) { GameUI.notify(b, 'alert'); return; }
    if (!p.scientist) { GameUI.notify('科学者を割り当ててください。', 'alert'); return; }
    if (p.factories < 1) { GameUI.notify('民需工場を 1 以上割り当ててください。', 'alert'); return; }
    if (!p.manpowerPaid) { if ((s.manpower || 0) < P.manpower) { GameUI.notify('人的資源が不足しています (必要 ' + P.manpower.toLocaleString() + ')。', 'alert'); return; } s.manpower -= P.manpower; p.manpowerPaid = true; }
    p.started = true; p.startDay = SuperWeapons.day();
    CoreEngine.log('⚛️ 特殊計画「' + P.name + '」を開始 (工場 ' + p.factories + '・人的資源 ' + P.manpower.toLocaleString() + ')');
    GameUI.notify('⚛️ 特殊計画「' + P.name + '」を開始しました', 'success');
    SuperWeapons.render(); CoreEngine.renderStats?.();
  }
  static pause(id) { const p = SuperWeapons.data().projects[id]; if (p.started && !p.done) { p.started = false; SuperWeapons.render(); } }
  static rate(id) { const p = SuperWeapons.data().projects[id], sc = SuperWeapons.scientistOf(id); const bonus = 1 + (Number(CoreEngine.gameState.cardModifiers?.specialProjectSpeed) || 0); return (p.factories || 0) * (sc ? sc.skill : 1) * bonus; }
  static complete(id) {
    const s = CoreEngine.gameState, d = SuperWeapons.data(), p = d.projects[id], P = SuperWeapons.PROJECTS[id];
    p.done = true; p.started = false; p.doneDay = SuperWeapons.day(); p.progress = P.points;
    if (id === 'uranium') { const lab = window.StrategySystems?.ensureState?.(); if (lab && !lab.unlockedProjects.includes('nuclear_reactor_research')) lab.unlockedProjects.push('nuclear_reactor_research'); s.nuclearTechLevel = Math.max(1, s.nuclearTechLevel || 0); }
    if (id === 'atomic') s.nuclearTechLevel = Math.max(2, s.nuclearTechLevel || 0);
    if (id === 'jet') s.strategicBombers = (s.strategicBombers || 0) + 20;
    d.log.unshift({ day: SuperWeapons.day(), text: '特殊計画「' + P.name + '」完了 — ' + P.unlocks });
    CoreEngine.log('🎉 特殊計画「' + P.name + '」が完了しました！ ' + P.unlocks + ' が解禁');
    GameUI.notify('🎉 特殊計画完了: ' + P.name + ' — ' + P.unlocks, 'success');
    if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) { try { NewsManager.fireCustom({ icon: P.icon, title: P.name + 'が完成', body: SuperWeapons.nameOf(s.country) + ' の科学者たちは「' + P.name + '」を完遂した。' + P.unlocks + '。' }); } catch (e) { /* ignore */ } }
    CoreEngine.addWorldTension?.(id === 'atomic' ? 5 : 2, '特殊計画「' + P.name + '」の完成');
    if (typeof ConstructionManager !== 'undefined' && WindowManager.isOpen?.('construction')) ConstructionManager.render();
  }

  // ------------------------------------------------------------------
  // 施設・備蓄
  // ------------------------------------------------------------------
  static facilities(kind) { const me = CoreEngine.gameState.country; return Object.entries(MapRenderer.states || {}).filter(([, st]) => st.owner === me && (st.b?.[kind] || 0) > 0).map(([sid, st]) => ({ sid, st, level: st.b[kind] })); }
  static reactorLevels() { return SuperWeapons.facilities('nuclear_reactor').reduce((a, f) => a + f.level, 0); }
  static siteLevels() { return SuperWeapons.facilities('rocket_site').reduce((a, f) => a + f.level, 0); }
  static nukes() { return Math.floor(CoreEngine.gameState.nuclearStockpile || 0); }
  static rockets() { return Math.floor(SuperWeapons.data()?.rockets || 0); }
  static missileRange() { return SuperWeapons.MISSILE_RANGE * (SuperWeapons.done('ballistic') ? 2 : 1); }
  static dist(a, b) { const w = MapRenderer.mapW || 0; let dx = Math.abs(a[0] - b[0]); if (w && dx > w / 2) dx = w - dx; return Math.hypot(dx, a[1] - b[1]); }
  /** 対象州に届く最も近い発射施設 */
  static siteFor(sid) {
    const c = MapRenderer.stateCenter.get(String(sid)); if (!c) return null; let best = null;
    SuperWeapons.facilities('rocket_site').forEach(f => { const fc = MapRenderer.stateCenter.get(String(f.sid)); if (!fc) return; const dd = SuperWeapons.dist(fc, c); if (dd <= SuperWeapons.missileRange() && (!best || dd < best.d)) best = { ...f, d: dd }; });
    return best;
  }

  // ------------------------------------------------------------------
  // 毎日
  // ------------------------------------------------------------------
  static onTick() {
    const s = CoreEngine.gameState, d = SuperWeapons.data(); if (!d || !MapRenderer.ready) return;
    const day = SuperWeapons.day(); if (d.lastDay === day) return; d.lastDay = day;
    // 計画の進行
    Object.entries(d.projects).forEach(([id, p]) => { if (!p.started || p.done) return; p.progress += SuperWeapons.rate(id); if (p.progress >= SuperWeapons.PROJECTS[id].points) SuperWeapons.complete(id); });
    // 備蓄の生成
    if (SuperWeapons.done('atomic')) { const lv = SuperWeapons.reactorLevels(); if (lv > 0) { const before = SuperWeapons.nukes(); s.nuclearStockpile = (s.nuclearStockpile || 0) + lv * SuperWeapons.NUKE_RATE; if (SuperWeapons.nukes() > before) { GameUI.notify('☢️ 核兵器が 1 発完成しました (備蓄 ' + SuperWeapons.nukes() + ')', 'success'); d.log.unshift({ day, text: '核兵器 1 発が完成 (備蓄 ' + SuperWeapons.nukes() + ')' }); } } }
    if (SuperWeapons.done('v2')) { const lv = SuperWeapons.siteLevels(); if (lv > 0) d.rockets = (d.rockets || 0) + lv * SuperWeapons.ROCKET_RATE; }
    // ミサイル攻撃の継続
    d.missions = d.missions.filter(m => { const st = MapRenderer.states[m.sid]; return st && (s.atWar || []).includes(st.owner); });
    d.missions.forEach(m => SuperWeapons.missileTick(m));
    SuperWeapons.renderTopbar();
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('superweapons')) SuperWeapons.render();
  }
  static renderTopbar() {
    const n = document.getElementById('sw-nukes'), r = document.getElementById('sw-rockets'); if (!n || !r) return;
    n.textContent = SuperWeapons.nukes(); r.textContent = SuperWeapons.rockets();
    const el = document.getElementById('sw-stock'); if (el && el.classList) { el.classList.toggle('armed', SuperWeapons.nukes() > 0); }
  }

  // ------------------------------------------------------------------
  // 核攻撃
  // ------------------------------------------------------------------
  static airInfo(sid) {
    const s = CoreEngine.gameState; let pct = Number(s.airSupremacy) || 0, local = false;
    if (typeof AirForce !== 'undefined' && AirForce.superiority) { try { const sup = AirForce.superiority(sid); if (sup.contested) { pct = sup.percent; local = true; } } catch (e) { /* ignore */ } }
    let bombers = 0, inZone = false;
    if (typeof AirForce !== 'undefined' && AirForce.wings) { try { AirForce.wings().forEach(w => { if (w.aircraftType === 'bomber' && w.aircraftCount > 0) { bombers += w.aircraftCount; if (w.executing && String(AirForce.zoneSid(w)) === String(sid)) inZone = true; } }); } catch (e) { /* ignore */ } }
    bombers += Number(s.strategicBombers) || 0;
    return { pct, local, bombers, inZone, jet: SuperWeapons.done('jet') };
  }
  static nukeChecks(sid) {
    const s = CoreEngine.gameState, st = MapRenderer.states[sid], air = SuperWeapons.airInfo(sid);
    return [
      { ok: !!st && (s.atWar || []).includes(st.owner), text: '対象が交戦中の敵国の州' },
      { ok: SuperWeapons.done('atomic'), text: '特殊計画「原子爆弾」が完了' },
      { ok: SuperWeapons.nukes() >= 1, text: '核兵器の備蓄 1 以上 (現在 ' + SuperWeapons.nukes() + ')' },
      { ok: air.pct >= 75, text: '対象空域の制空権 75% 以上 (現在 ' + Math.round(air.pct) + '%' + (air.local ? '' : '・全国値') + ')' },
      { ok: air.bombers > 0 && (air.inZone || !air.local || air.jet), text: '戦略爆撃機' + (air.jet ? '／ジェット爆撃機' : '') + 'の配備 (' + air.bombers + ' 機' + (air.inZone ? '・空域に展開中' : '') + ')' },
    ];
  }
  static canNuke(sid) { return SuperWeapons.nukeChecks(sid).every(c => c.ok); }
  static missileChecks(sid) {
    const s = CoreEngine.gameState, st = MapRenderer.states[sid], site = SuperWeapons.siteFor(sid);
    return [
      { ok: !!st && (s.atWar || []).includes(st.owner), text: '対象が交戦中の敵国の州' },
      { ok: SuperWeapons.done('v2'), text: '特殊計画「V2ロケット開発」が完了' },
      { ok: SuperWeapons.rockets() >= 1, text: 'ロケットの備蓄 1 以上 (現在 ' + SuperWeapons.rockets() + ')' },
      { ok: !!site, text: '射程 ' + SuperWeapons.missileRange() + ' 内のロケット発射施設' + (site ? ' (' + (site.st.name || '州' + site.sid) + '・距離 ' + Math.round(site.d) + ')' : ' — なし') },
    ];
  }
  static canMissile(sid) { return SuperWeapons.missileChecks(sid).every(c => c.ok); }
  /** 州情報オーバーレイ用 */
  static strikeLine(sid) {
    const s = CoreEngine.gameState, st = MapRenderer.states[sid]; if (!st || !(s.atWar || []).includes(st.owner)) return '';
    const d = SuperWeapons.data(); if (!d) return '';
    const hasAny = SuperWeapons.done('atomic') || SuperWeapons.done('v2'); if (!hasAny) return '';
    const n = SuperWeapons.canNuke(sid), m = SuperWeapons.canMissile(sid), active = d.missions.some(x => x.sid === String(sid));
    return '<button class="map-info-build-btn sw-nuke-btn' + (n ? ' ready' : '') + '" onclick="SuperWeapons.openStrikeModal(\'' + sid + '\')">☢️ 核攻撃' + (n ? '' : ' (条件未達)') + '</button> <button class="map-info-build-btn sw-missile-btn' + (m ? ' ready' : '') + '" onclick="SuperWeapons.openStrikeModal(\'' + sid + '\')">🚀 ' + (active ? 'ミサイル攻撃中' : 'ミサイル攻撃') + '</button>';
  }
  static openStrikeModal(sid) {
    const st = MapRenderer.states[sid]; if (!st) return;
    const d = SuperWeapons.data(), nc = SuperWeapons.nukeChecks(sid), mc = SuperWeapons.missileChecks(sid), canN = nc.every(c => c.ok), canM = mc.every(c => c.ok), active = d.missions.find(x => x.sid === String(sid));
    const b = st.b || {}; const divs = SuperWeapons.divisionsIn(sid);
    const list = (arr) => '<ul class="sw-checks">' + arr.map(c => '<li class="' + (c.ok ? 'ok' : 'ng') + '">' + (c.ok ? '✅' : '❌') + ' ' + SuperWeapons.esc(c.text) + '</li>').join('') + '</ul>';
    GameUI.openModal('🎯 攻撃目標: ' + (st.name || '州' + sid), '<div class="sw-modal"><p class="sw-target">' + SuperWeapons.esc(SuperWeapons.nameOf(st.owner)) + ' 領 ／ 🏭' + (b.industrial_complex || 0) + ' ⚙️' + (b.arms_factory || 0) + ' 🛤️' + (b.infrastructure || 0) + ' 🏰' + (b.fort || 0) + ' ／ 州内師団 ' + divs.length + ' ／ VP ' + Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) + '</p>' +
      '<div class="sw-strike-grid"><div class="sw-strike nuke' + (canN ? ' ready' : '') + '"><h4>☢️ 核攻撃 (Nuke)</h4>' + list(nc) + '<p class="sw-fx">効果: 全インフラ・工場・要塞をレベル 0 に／州内の全師団の組織率・充足を 90% カット／対象国の戦争協力度 −30%・安定度 −10%／世界緊張度 +15</p><button class="sw-btn nuke" ' + (canN ? '' : 'disabled') + ' onclick="SuperWeapons.launchNuke(\'' + sid + '\')">☢️ 核攻撃を実行 (備蓄 ' + SuperWeapons.nukes() + ')</button></div>' +
      '<div class="sw-strike missile' + (canM ? ' ready' : '') + '"><h4>🚀 ミサイル攻撃 (' + (SuperWeapons.done('ballistic') ? '弾道ミサイル' : 'V2ロケット') + ')</h4>' + list(mc) + '<p class="sw-fx">効果: 毎日ロケット 1 発を消費し、インフラ・要塞・工場に損害、州内師団の組織率 −' + (SuperWeapons.done('ballistic') ? 12 : 8) + '／充足 −' + (SuperWeapons.done('ballistic') ? 4.5 : 3) + '%。備蓄が尽きるか停止するまで継続。</p>' + (active ? '<button class="sw-btn" onclick="SuperWeapons.stopMissile(\'' + sid + '\')">⏹ ミサイル攻撃を停止 (' + active.fired + ' 発発射済み)</button>' : '<button class="sw-btn missile" ' + (canM ? '' : 'disabled') + ' onclick="SuperWeapons.startMissile(\'' + sid + '\')">🚀 ミサイル攻撃を開始 (備蓄 ' + SuperWeapons.rockets() + ')</button>') + '</div></div>' +
      '<div class="sw-actions"><button class="sw-btn" onclick="GameUI.switchTab(\'superweapons\')">⚛️ 特殊計画画面へ</button><button class="sw-btn" onclick="GameUI.closeModal()">閉じる</button></div></div>');
  }
  static divisionsIn(sid) {
    if (typeof ArmyRoster === 'undefined') return [];
    return ArmyRoster.all().filter(d => { const pid = d.pid || (BattlePlanManager.armies || []).find(a => a.divisions.includes(d))?.positionPid; return pid && String(MapRenderer.stateOf(Number(pid))) === String(sid); });
  }
  static launchNuke(sid) {
    const s = CoreEngine.gameState, d = SuperWeapons.data(), st = MapRenderer.states[sid];
    if (!st || !SuperWeapons.canNuke(sid)) { GameUI.notify('核攻撃の条件を満たしていません。', 'alert'); return false; }
    s.nuclearStockpile -= 1; d.strikes = (d.strikes || 0) + 1;
    GameUI.closeModal?.();
    SuperWeapons.playNukeFX(sid);
    // 州の破壊
    st.b ||= {}; const destroyed = Object.entries(st.b).filter(([, v]) => v > 0).map(([k, v]) => k + '×' + v); Object.keys(st.b).forEach(k => { st.b[k] = 0; });
    st.supply = 0; st.nuked = SuperWeapons.day();
    if (typeof TradeSystem !== 'undefined' && st.res) Object.keys(st.res).forEach(k => { st.res[k] = Math.round(st.res[k] * 0.5); });
    // 師団 (敵 AI 師団は抽象化されているため、州内のプレイヤー/同盟師団を含む全師団に適用)
    const divs = SuperWeapons.divisionsIn(sid); divs.forEach(dv => { dv.org = Math.max(0, (dv.org || 0) * 0.1); dv.equipmentStrength = Math.max(0, (Number.isFinite(dv.equipmentStrength) ? dv.equipmentStrength : 100) * 0.1); });
    // 敵 AI の戦力 (抽象) にも損害
    if (typeof AIManager !== 'undefined' && AIManager.state?.strength?.[st.owner]) AIManager.state.strength[st.owner] *= 0.85;
    // 対象国の戦意
    const fx = ((s.countryEffects ||= {})[st.owner] ||= { country: st.owner, stability: 50, warSupport: 50, popularity: {} });
    fx.warSupport = Math.max(0, (fx.warSupport ?? 50) - 30); fx.stability = Math.max(0, (fx.stability ?? 50) - 10);
    if (typeof PeaceSystem !== 'undefined') { const sc = PeaceSystem.score(s.country); sc.vp += 5; }
    s.warSupport = Math.min(100, s.warSupport + 10); s.stability = Math.max(0, s.stability - 3);
    CoreEngine.addWorldTension?.(15, (st.name || '州' + sid) + ' への核攻撃');
    MapRenderer.addNukeEffectAtState?.(sid); MapRenderer.invalidateModes?.();
    d.log.unshift({ day: SuperWeapons.day(), text: '☢️ ' + (st.name || '州' + sid) + ' (' + SuperWeapons.nameOf(st.owner) + ') に核攻撃 — 破壊: ' + (destroyed.join(' ') || 'なし') + ' ／ 師団 ' + divs.length });
    CoreEngine.log('💥 核攻撃実行！ ' + (st.name || sid) + ' に原子爆弾を投下 — 施設全壊・師団壊滅・' + SuperWeapons.nameOf(st.owner) + ' の戦争協力度 −30%');
    GameUI.notify('☢️ ' + (st.name || sid) + ' に核攻撃を実行しました', 'alert');
    if (typeof NewsManager !== 'undefined' && NewsManager.fireCustom) { try { NewsManager.fireCustom({ icon: '☢️', title: '原子爆弾が ' + (st.name || sid) + ' に投下される', body: SuperWeapons.nameOf(s.country) + ' が投下した一発の爆弾が ' + (st.name || sid) + ' を消し去った。' + SuperWeapons.nameOf(st.owner) + ' の士気は大きく揺らいでいる。', reactions: ['恐怖だ…これが新時代か', '研究を急げ!', 'この戦争は終わるだろう'] }); } catch (e) { /* ignore */ } }
    if (typeof MultiplayerManager !== 'undefined') MultiplayerManager.broadcast({ type: 'nuclear_strike', target: st.name || sid, attacker: s.country });
    CoreEngine.renderStats?.(); if (typeof BattlePlanManager !== 'undefined') BattlePlanManager.renderPanel?.();
    setTimeout(() => { if (WindowManager.isOpen?.('superweapons')) SuperWeapons.render(); }, 100);
    return true;
  }
  /** 全画面フラッシュ＋キノコ雲 */
  static playNukeFX(sid) {
    if (typeof document === 'undefined' || !document.body?.appendChild) return;
    try { if (typeof NuclearManager !== 'undefined' && NuclearManager.playNukeAnimation) NuclearManager.playNukeAnimation(); } catch (e) { /* ignore */ }
    const o = document.createElement('div'); o.className = 'sw-nuke-fx';
    o.innerHTML = '<div class="sw-flash"></div><div class="sw-shock"></div><div class="sw-mushroom"><div class="sw-cap"></div><div class="sw-stem"></div><div class="sw-base"></div></div><div class="sw-telop">☢️ NUCLEAR STRIKE ☢️<small>' + SuperWeapons.esc(MapRenderer.states[sid]?.name || '') + '</small></div>';
    document.body.appendChild(o);
    setTimeout(() => { try { o.remove(); } catch (e) { /* ignore */ } }, 4200);
  }

  // ------------------------------------------------------------------
  // ミサイル攻撃
  // ------------------------------------------------------------------
  static startMissile(sid) {
    const d = SuperWeapons.data(), st = MapRenderer.states[sid];
    if (!st || !SuperWeapons.canMissile(sid)) { GameUI.notify('ミサイル攻撃の条件を満たしていません。', 'alert'); return; }
    if (d.missions.some(m => m.sid === String(sid))) return;
    const site = SuperWeapons.siteFor(sid);
    d.missions.push({ sid: String(sid), from: site.sid, since: SuperWeapons.day(), fired: 0, damage: 0 });
    CoreEngine.log('🚀 ' + (st.name || sid) + ' へのミサイル攻撃を開始 (発射: ' + (site.st.name || site.sid) + ')');
    GameUI.notify('🚀 ' + (st.name || sid) + ' へのミサイル攻撃を開始しました', 'success');
    GameUI.closeModal?.(); SuperWeapons.missileTick(d.missions[d.missions.length - 1]); SuperWeapons.renderTopbar();
  }
  static stopMissile(sid) { const d = SuperWeapons.data(); d.missions = d.missions.filter(m => m.sid !== String(sid)); GameUI.closeModal?.(); CoreEngine.log('🚀 ミサイル攻撃を停止'); SuperWeapons.render(); }
  static missileTick(m) {
    const d = SuperWeapons.data(), st = MapRenderer.states[m.sid]; if (!st || SuperWeapons.rockets() < 1) return;
    if (!SuperWeapons.siteFor(m.sid)) return;   // 射程外 (施設喪失)
    d.rockets -= 1; m.fired++;
    const mult = SuperWeapons.done('ballistic') ? 1.5 : 1, b = (st.b ||= {}); const hits = [];
    const r = Math.random();
    if (r < 0.4 * mult && (b.infrastructure || 0) > 0) { b.infrastructure--; st.supply = Math.max(0, (st.supply || 0) - 1); hits.push('インフラ −1'); }
    else if (r < 0.65 * mult && (b.fort || 0) > 0) { b.fort--; hits.push('要塞 −1'); }
    else if (r < 0.8 * mult && ((b.industrial_complex || 0) + (b.arms_factory || 0)) > 0) { if (b.arms_factory) { b.arms_factory--; hits.push('軍需工場 −1'); } else { b.industrial_complex--; hits.push('民需工場 −1'); } }
    const divs = SuperWeapons.divisionsIn(m.sid); divs.forEach(dv => { dv.org = Math.max(0, (dv.org || 0) - 8 * mult); dv.equipmentStrength = Math.max(0, (Number.isFinite(dv.equipmentStrength) ? dv.equipmentStrength : 100) - 3 * mult); });
    if (divs.length) hits.push('師団 ' + divs.length + ' に損害');
    if (typeof AIManager !== 'undefined' && AIManager.state?.strength?.[st.owner]) AIManager.state.strength[st.owner] *= (1 - 0.005 * mult);
    m.damage += hits.length;
    if (hits.length) { MapRenderer.invalidateModes?.(); d.log.unshift({ day: SuperWeapons.day(), text: '🚀 ' + (st.name || m.sid) + ' にミサイル着弾 — ' + hits.join('・') }); d.log = d.log.slice(0, 60); }
    if (SuperWeapons.rockets() < 1) GameUI.notify('🚀 ロケットの備蓄が尽きました — ミサイル攻撃は再生産まで停止', 'alert');
  }

  // ------------------------------------------------------------------
  // UI: 特殊計画ウィンドウ
  // ------------------------------------------------------------------
  static render() {
    const el = document.getElementById('superweapons-content'); if (!el) return;
    const s = CoreEngine.gameState, d = SuperWeapons.data(); if (!d) return;
    const free = typeof FactoryBudget !== 'undefined' ? FactoryBudget.availableCivilian() : 0;
    const reactors = SuperWeapons.facilities('nuclear_reactor'), sites = SuperWeapons.facilities('rocket_site');
    let html = '<div class="sw-root"><div class="sw-head"><div class="sw-mark">⚛️</div><div><h3>特殊計画 <small>SPECIAL PROJECTS</small></h3><p>基礎研究 → 科学者を割り当て、民需工場 (IC) と人的資源を投資 → 100% で実用化。空き民需工場 <b>' + free + '</b> ／ 人的資源 <b>' + Math.floor(s.manpower || 0).toLocaleString() + '</b></p></div>' +
      '<div class="sw-kpis"><div class="sw-kpi nuke"><small>核兵器備蓄</small><b>☢️ ' + SuperWeapons.nukes() + '</b><span>' + (SuperWeapons.done('atomic') ? '原子炉 Lv' + SuperWeapons.reactorLevels() + ' → +' + (SuperWeapons.reactorLevels() * SuperWeapons.NUKE_RATE).toFixed(2) + ' /日' : '「原子爆弾」未完了') + '</span></div><div class="sw-kpi rocket"><small>ロケット備蓄</small><b>🚀 ' + SuperWeapons.rockets() + '</b><span>' + (SuperWeapons.done('v2') ? '発射施設 Lv' + SuperWeapons.siteLevels() + ' → +' + (SuperWeapons.siteLevels() * SuperWeapons.ROCKET_RATE).toFixed(1) + ' /日' : '「V2ロケット開発」未完了') + '</span></div></div></div>';
    // 基礎研究
    const techs = [['原子物理学', /atomic|nuclear|uranium/i], ['ロケット工学', /rocket/i], ['ジェットエンジン', /jet/i]];
    html += '<div class="sw-panel"><h4>🔬 基礎研究 (研究画面)</h4><div class="sw-chips">' + techs.map(([n, re]) => '<span class="' + (SuperWeapons.researched(re) ? 'ok' : '') + '">' + (SuperWeapons.researched(re) ? '✅' : '⬜') + ' ' + n + '</span>').join('') + '<button class="sw-btn small" onclick="GameUI.switchTab(\'research\')">研究画面を開く</button></div><p class="sw-help">研究ツリーの「原子物理学 (atomic_research)」「ロケット工学 (experimental_rockets)」「ジェットエンジン (sp_centrifugal_jet_tech)」などの基礎研究を完了すると、対応する特殊計画を開始できます。</p></div>';
    // 計画カード
    html += '<div class="sw-panel"><h4>⚛️ 計画</h4><div class="sw-projects">' + Object.values(SuperWeapons.PROJECTS).map(P => {
      const p = d.projects[P.id], block = SuperWeapons.blocker(P.id), sc = SuperWeapons.scientistOf(P.id), pct = Math.min(100, p.progress / P.points * 100), rate = SuperWeapons.rate(P.id), eta = p.started && rate > 0 ? Math.ceil((P.points - p.progress) / rate) : null;
      const scis = SuperWeapons.SCIENTISTS.filter(x => x.field.includes(P.id));
      return '<div class="sw-project' + (p.done ? ' done' : p.started ? ' active' : block ? ' locked' : '') + '"><div class="sw-project-head"><span class="sw-ic">' + P.icon + '</span><div><b>' + P.name + '</b><small>' + SuperWeapons.esc(P.desc) + '</small></div><span class="sw-status">' + (p.done ? '✅ 完了' : p.started ? '🔄 進行中' : block ? '🔒' : '待機') + '</span></div>' +
        '<div class="sw-bar"><em style="width:' + pct.toFixed(1) + '%"></em><span>' + pct.toFixed(0) + '% (' + Math.floor(p.progress) + ' / ' + P.points + ')' + (eta ? ' ／ あと ' + eta + ' 日' : '') + '</span></div>' +
        (block && !p.done ? '<p class="sw-req">🔒 ' + SuperWeapons.esc(block) + '</p>' : '') +
        (!p.done ? '<div class="sw-controls"><label>科学者<select ' + (block ? 'disabled' : '') + ' onchange="SuperWeapons.assign(\'' + P.id + '\', this.value)"><option value="">— 未割り当て —</option>' + scis.map(x => '<option value="' + x.id + '"' + (sc && sc.id === x.id ? ' selected' : '') + '>' + x.icon + ' ' + SuperWeapons.esc(SuperWeapons.sciName(x)) + ' (' + x.name + ' ×' + x.skill + ')</option>').join('') + '</select></label>' +
          '<label>民需工場 (IC)<span class="sw-pm"><button ' + (block ? 'disabled' : '') + ' onclick="SuperWeapons.setFactories(\'' + P.id + '\',' + (p.factories - 1) + ')">−</button><b>' + p.factories + '</b><button ' + (block ? 'disabled' : '') + ' onclick="SuperWeapons.setFactories(\'' + P.id + '\',' + (p.factories + 1) + ')">＋</button></span></label>' +
          '<label>人的資源<b>' + (p.manpowerPaid ? '支払済' : P.manpower.toLocaleString()) + '</b></label><label>進捗/日<b>' + rate.toFixed(1) + '</b></label>' +
          (p.started ? '<button class="sw-btn small" onclick="SuperWeapons.pause(\'' + P.id + '\')">⏸ 中断</button>' : '<button class="sw-btn small primary" ' + (block ? 'disabled' : '') + ' onclick="SuperWeapons.start(\'' + P.id + '\')">▶ 計画を開始</button>') + '</div>' : '<p class="sw-unlock">🔓 解禁: ' + SuperWeapons.esc(P.unlocks) + '</p>') + '</div>'; }).join('') + '</div></div>';
    // 施設
    html += '<div class="sw-grid"><div class="sw-panel"><h4>☢️ 原子炉 <small>建設画面で州ごとに最大 Lv3</small></h4>' + (reactors.length ? '<table class="sw-table">' + reactors.map(f => '<tr><td>' + SuperWeapons.esc(f.st.name || '州' + f.sid) + '</td><td>Lv' + f.level + '</td><td>+' + (SuperWeapons.done('atomic') ? (f.level * SuperWeapons.NUKE_RATE).toFixed(2) : '0') + ' 発/日</td></tr>').join('') + '</table>' : '<p class="sw-help">原子炉がありません。' + (SuperWeapons.done('uranium') ? '建設画面 → 州を選択 → ☢️ 原子炉 (600)。' : '「ウラン濃縮計画」を完了すると建設できます。') + '</p>') + '<button class="sw-btn small" onclick="GameUI.switchTab(\'construction\')">🏗️ 建設画面へ</button></div>' +
      '<div class="sw-panel"><h4>🚀 ロケット発射施設 <small>射程 ' + SuperWeapons.missileRange() + '</small></h4>' + (sites.length ? '<table class="sw-table">' + sites.map(f => '<tr><td>' + SuperWeapons.esc(f.st.name || '州' + f.sid) + '</td><td>Lv' + f.level + '</td><td>+' + (f.level * SuperWeapons.ROCKET_RATE).toFixed(1) + ' 発/日</td></tr>').join('') + '</table>' : '<p class="sw-help">発射施設がありません。' + (SuperWeapons.done('v2') ? '建設画面 → 州を選択 → 🚀 ロケット発射施設 (400)。' : '「V2ロケット開発」を完了すると建設できます。') + '</p>') + '</div></div>';
    // 攻撃
    html += '<div class="sw-panel"><h4>🎯 攻撃</h4><p class="sw-help">地図上で交戦中の敵国の州をクリックすると、州情報に「☢️ 核攻撃」「🚀 ミサイル攻撃」ボタンが表示されます。核攻撃の条件: 制空権 75% 以上・戦略爆撃機 (またはジェット爆撃機) の配備・核備蓄 1 以上。</p>' +
      (d.missions.length ? '<h5>進行中のミサイル攻撃</h5>' + d.missions.map(m => { const st = MapRenderer.states[m.sid]; return '<div class="sw-mission"><span>🚀 ' + SuperWeapons.esc(st?.name || m.sid) + ' (' + SuperWeapons.esc(SuperWeapons.nameOf(st?.owner)) + ') ← ' + SuperWeapons.esc(MapRenderer.states[m.from]?.name || m.from) + ' ／ 発射 ' + m.fired + ' 発 ／ 命中 ' + m.damage + '</span><button class="sw-btn small" onclick="SuperWeapons.stopMissile(\'' + m.sid + '\')">停止</button></div>'; }).join('') : '') +
      '<h5>記録 <small>核攻撃 ' + (d.strikes || 0) + ' 回</small></h5><div class="sw-log">' + (d.log.length ? d.log.slice(0, 30).map(e => '<div><small>Day ' + e.day + '</small> ' + SuperWeapons.esc(e.text) + '</div>').join('') : '<span class="sw-help">記録はありません。</span>') + '</div></div></div>';
    el.innerHTML = html;
  }
}
if (typeof window !== 'undefined') window.SuperWeapons = SuperWeapons;
