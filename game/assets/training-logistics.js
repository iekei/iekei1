/* training-logistics.js — HOI4風「訓練・装備備蓄・補充 (Training & Logistics Stockpile)」
 *
 *  - 🎓 徴兵・訓練: 師団テンプレートを選び、並列訓練数・配置州 (中核州)・配属軍を指定して徴兵。
 *    訓練が進むと練度が上がり (新兵→訓練兵→一般)、完了で配置。途中で「緊急配置」も可能 (練度が低いまま配置)
 *  - 📦 兵站: 全装備の 生産量/日・前線の要求量・備蓄・欠乏 を一覧。軍ごとに補充優先度 (優先/標準/低) と
 *    アップグレード優先度を設定。補充は優先度順に備蓄から配分、アップグレードは改良型装備 (infantry_2 等) を消費
 *  - 練度 (xp 0–100) は戦闘力に補正: 新兵 −30% … 一般 ±0 … 精鋭 +75%。戦闘参加で上昇、演習でも上昇
 */
class TrainingLogistics {
  static LEVELS = [
    { id: 'green',    name: '新兵',   icon: '🟤', min: 0,  factor: 0.7 },
    { id: 'trained',  name: '訓練兵', icon: '⚪', min: 25, factor: 0.85 },
    { id: 'regular',  name: '一般',   icon: '🟢', min: 50, factor: 1.0 },
    { id: 'seasoned', name: '熟練',   icon: '🔵', min: 70, factor: 1.25 },
    { id: 'veteran',  name: '歴戦',   icon: '🟣', min: 85, factor: 1.5 },
    { id: 'elite',    name: '精鋭',   icon: '🟡', min: 95, factor: 1.75 },
  ];
  static PRIORITY = { high: { name: '優先', icon: '🔺', order: 0 }, normal: { name: '標準', icon: '▪️', order: 1 }, low: { name: '低', icon: '🔻', order: 2 } };
  static UPGRADES = { infantry: 'infantry_2', artillery: 'artillery_2', tank: 'tank_2', fighter: 'fighter_2' };
  static LAND_EQUIP = ['infantry', 'infantry_2', 'rifle_old', 'support_equipment', 'artillery', 'artillery_2', 'tank', 'tank_2', 'fighter', 'fighter_2', 'transport', 'convoys'];
  static EQUIP_ICON = { infantry: '🔫', infantry_2: '🔫', rifle_old: '🪖', support_equipment: '🧰', artillery: '💥', artillery_2: '💥', tank: '🛞', tank_2: '🛞', fighter: '✈️', fighter_2: '✈️', transport: '🚛', convoys: '🚢' };
  static MAX_QUEUE = 30;
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }

  // ------------------------------------------------------------------
  static init() {
    if (TrainingLogistics.installed) return;
    TrainingLogistics.installed = true;
    TrainingLogistics.installUI();
    TrainingLogistics.installHooks();
    CoreEngine.registerTickCallback(() => TrainingLogistics.onTick());
    CoreEngine.log('🎓 訓練・兵站システムが有効になりました (練度・補充優先度・緊急配置)。');
  }
  static installUI() {
    const root = document.getElementById('window-templates');
    [['training', '🎓 徴兵・訓練 — Recruitment & Training', '1100', '760', 'training-content'], ['logistics', '📦 兵站・装備備蓄 — Logistics & Stockpile', '1100', '760', 'logistics-content']].forEach(([id, title, w, h, inner]) => {
      if (root && !document.getElementById('tpl-' + id)) {
        const el = document.createElement('div'); el.className = 'window-template pane-scroll'; el.id = 'tpl-' + id;
        el.dataset.title = title; el.dataset.w = w; el.dataset.h = h; el.innerHTML = '<div id="' + inner + '"></div>'; root.appendChild(el);
      }
    });
    if (typeof GameUI !== 'undefined' && !GameUI._tlHooked) {
      GameUI._tlHooked = true;
      const orig = GameUI.onWindowOpened.bind(GameUI);
      GameUI.onWindowOpened = (tab) => { orig(tab); if (tab === 'training') TrainingLogistics.renderTraining(); if (tab === 'logistics') TrainingLogistics.renderLogistics(); };
    }
  }
  static installHooks() {
    // 戦闘力: 練度補正
    if (typeof BattleManager !== 'undefined' && !BattleManager._tlHooked) {
      BattleManager._tlHooked = true;
      const oa = BattleManager.attackProfile.bind(BattleManager);
      BattleManager.attackProfile = (army) => { const p = oa(army); const m = TrainingLogistics.armyFactor(army); return { ...p, soft: p.soft * m, hard: p.hard * m }; };
      const od = BattleManager.calcDefenseAdvantage.bind(BattleManager);
      BattleManager.calcDefenseAdvantage = (sid) => { const adv = od(sid); const divs = TrainingLogistics.divisionsInState(sid); const m = divs.length ? divs.reduce((a, d) => a + TrainingLogistics.factor(d), 0) / divs.length : 1; return Math.max(-1, Math.min(1, adv + (m - 1) * 0.3)); };
      const ol = BattleManager.applyEquipmentLosses.bind(BattleManager);
      BattleManager.applyEquipmentLosses = (b) => {
        const attackerArmy = (BattlePlanManager.armies || []).find(a => a.id === b.attackerArmyId);
        const affected = b.kind === 'offensive' ? (attackerArmy?.divisions || []).filter(d => !b.areaPlan || (b.divisionIds || []).includes(d.id)) : (typeof ArmyRoster !== 'undefined' ? ArmyRoster.all().filter(d => Number(d.pid) === Number(b.provId)) : []);
        affected.forEach(d => { TrainingLogistics.gainXp(d, 3 + Math.random() * 3); });   // 実戦経験
        return ol(b);
      };
    }
    // 補充: 優先度順 + アップグレード
    if (typeof TrainingManager !== 'undefined' && !TrainingManager._tlHooked) {
      TrainingManager._tlHooked = true;
      TrainingManager.reinforce = () => TrainingLogistics.reinforce();
      const oq = TrainingManager.renderQueue.bind(TrainingManager);
      TrainingManager.renderQueue = () => { oq(); if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('training')) TrainingLogistics.renderTraining(); };
    }
  }

  // ------------------------------------------------------------------
  // 練度
  // ------------------------------------------------------------------
  static xpOf(d) { if (!d) return 50; if (!Number.isFinite(d.xp)) d.xp = 50; return d.xp; }
  static levelOf(d) { const xp = typeof d === 'number' ? d : TrainingLogistics.xpOf(d); let lv = TrainingLogistics.LEVELS[0]; TrainingLogistics.LEVELS.forEach(l => { if (xp >= l.min) lv = l; }); return lv; }
  /** 戦闘力係数: 0 → 0.7, 50 → 1.0, 100 → 1.75 (区分線形) */
  static factor(d) { const xp = typeof d === 'number' ? d : TrainingLogistics.xpOf(d); const base = xp <= 50 ? 0.7 + xp / 50 * 0.3 : 1 + (xp - 50) / 50 * 0.75; return base * (1 + (d && d.upgraded ? 0.1 : 0)); }
  static armyFactor(army) { const divs = army?.divisions || []; if (!divs.length) return 1; return divs.reduce((a, d) => a + TrainingLogistics.factor(d), 0) / divs.length; }
  static gainXp(d, n) { d.xp = Math.max(0, Math.min(100, TrainingLogistics.xpOf(d) + n)); }
  static divisionsInState(sid) { if (typeof ArmyRoster === 'undefined') return []; return ArmyRoster.all().filter(d => { const pid = d.pid || (BattlePlanManager.armies || []).find(a => a.divisions.includes(d))?.positionPid; return pid && String(MapRenderer.stateOf(Number(pid))) === String(sid); }); }
  static toggleExercise(armyId) { const a = (BattlePlanManager.armies || []).find(x => x.id === armyId); if (!a) return; a.exercising = !a.exercising; TrainingLogistics.renderTraining(); }

  // ------------------------------------------------------------------
  // 徴兵 (並列訓練)
  // ------------------------------------------------------------------
  static coreStates() {
    const me = CoreEngine.gameState.country;
    const all = typeof TrainingManager !== 'undefined' ? TrainingManager.availableTrainingStates() : [];
    const core = all.filter(([, st]) => !st.initialOwner || st.initialOwner === me);
    return core.length ? core : all;
  }
  static recruitBatch() {
    const s = CoreEngine.gameState;
    const tplId = document.getElementById('tl-template')?.value || TrainingLogistics.selTemplate;
    const count = Math.max(1, Math.min(20, parseInt(document.getElementById('tl-count')?.value) || TrainingLogistics.count || 1));
    const stateId = document.getElementById('tl-state')?.value || TrainingLogistics.coreStates()[0]?.[0];
    const armyId = parseInt(document.getElementById('tl-army')?.value) || null;
    const tpl = (DivisionDesigner.templates || []).find(t => String(t.id) === String(tplId)) || DivisionDesigner.activeTemplate?.();
    if (!tpl) { GameUI.notify('師団テンプレートがありません。師団編成で作成してください。', 'alert'); return; }
    const comp = DivisionDesigner.compositionOf(tpl);
    const req = TrainingManager.requirements(comp);
    if (!req) { GameUI.notify('このテンプレートには戦列大隊がありません。', 'alert'); return; }
    if (!TrainingManager.trainingProvince(String(stateId || ''))) { GameUI.notify('自国が支配する配置州を選択してください。', 'alert'); return; }
    const free = TrainingLogistics.MAX_QUEUE - TrainingManager.queue.length;
    if (free <= 0) { GameUI.notify('訓練キューが満杯です (' + TrainingLogistics.MAX_QUEUE + ')。', 'alert'); return; }
    const n = Math.min(count, free);
    for (let i = 0; i < n; i++) {
      const id = TrainingManager.nextId++;
      TrainingManager.queue.push({ id, name: tpl.name + ' #' + id, templateId: tpl.id, comp: req.comp, count: req.count, manpowerNeed: req.manpowerNeed, equipmentNeed: req.equipNeed, equipmentNeeds: req.equipmentNeeds, trainDays: req.trainDays, phase: 'gathering', progress: 0, targetArmyId: armyId, trainingStateId: String(stateId), batch: TrainingLogistics.day() });
    }
    s.recruitQueue = TrainingManager.queue;
    CoreEngine.log('📝 ' + tpl.name + ' × ' + n + ' を並列訓練に追加 (各 兵員 ' + (req.manpowerNeed / 10000) + '万・装備 ' + req.equipNeed + '・訓練 ' + req.trainDays + '日)');
    GameUI.notify('📝 ' + tpl.name + ' × ' + n + ' の徴兵を開始しました', 'success');
    TrainingManager.renderQueue(); TrainingLogistics.renderTraining();
  }
  /** 緊急配置: 訓練途中で配置 (練度は進捗に比例) */
  static deployNow(orderId) {
    const o = TrainingManager.queue.find(x => x.id === orderId);
    if (!o || o.phase !== 'training') { GameUI.notify('訓練中の師団のみ緊急配置できます (資源待ちは不可)。', 'alert'); return; }
    const xp = Math.round(5 + (o.progress / Math.max(1, o.trainDays)) * 45);
    TrainingLogistics.spawn(o, xp);
    TrainingManager.queue = TrainingManager.queue.filter(x => x.id !== orderId); CoreEngine.gameState.recruitQueue = TrainingManager.queue;
    GameUI.notify('🚨 ' + o.name + ' を緊急配置 (練度 ' + TrainingLogistics.levelOf(xp).name + ' ' + xp + ')', 'alert');
    TrainingManager.renderQueue(); TrainingLogistics.renderTraining(); CoreEngine.renderStats?.();
  }
  static spawn(o, xp) {
    const s = CoreEngine.gameState;
    s.divisions = (s.divisions || 0) + 1;
    const a = (BattlePlanManager.armies || []).find(x => x.id === o.targetArmyId);
    const spawnPid = TrainingManager.trainingProvince(o.trainingStateId) || TrainingManager.fallbackTrainingProvince();
    const c = MapRenderer.provCentroid.get(Number(spawnPid)) || [0, 0];
    const division = { id: s.strategy.nextDivisionId++, name: o.name, comp: o.comp, org: Math.round(10 + xp * 0.4), maxOrg: 60, equipmentStrength: 100, equipmentNeeds: TrainingManager.equipmentNeedsFor(o.comp), type: Object.keys(o.comp).find(k => !TrainingManager.SUPPORT_IDS.has(k)) || Object.keys(o.comp)[0], templateId: o.templateId || null, x: a?.base[0] ?? c[0], y: a?.base[1] ?? c[1], pid: a?.positionPid || Number(spawnPid), xp };
    if (a && !a.executing) a.divisions.push(division); else s.strategy.reserves.push(division);
    BattlePlanManager.renderPanel?.();
    CoreEngine.log('🎖️ ' + o.name + ' を配置 (練度 ' + TrainingLogistics.levelOf(xp).name + ')');
    return division;
  }

  // ------------------------------------------------------------------
  // 補充 (優先度順) とアップグレード
  // ------------------------------------------------------------------
  static groupOf(d) { return (BattlePlanManager.armies || []).find(a => a.divisions.includes(d)) || null; }
  static priorityOf(d) { const g = TrainingLogistics.groupOf(d); return (g ? g.reinforcePriority : CoreEngine.gameState.strategy?.reservePriority) || 'normal'; }
  static upgradeOf(d) { const g = TrainingLogistics.groupOf(d); return (g ? g.upgradePriority : CoreEngine.gameState.strategy?.reserveUpgrade) || 'normal'; }
  static setPriority(armyId, kind, v) {
    const s = CoreEngine.gameState;
    if (armyId === 'reserve') { if (kind === 'reinforce') s.strategy.reservePriority = v; else s.strategy.reserveUpgrade = v; }
    else { const a = (BattlePlanManager.armies || []).find(x => x.id === Number(armyId)); if (a) { if (kind === 'reinforce') a.reinforcePriority = v; else a.upgradePriority = v; } }
    TrainingLogistics.renderLogistics();
  }
  static inventory(stock, t) { const types = typeof ProductionManager.inventoryTypes === 'function' ? ProductionManager.inventoryTypes(t) : [t]; return types.reduce((a, k) => a + (stock[k] || 0), 0); }
  static reinforce() {
    if (typeof ArmyRoster === 'undefined' || typeof ProductionManager === 'undefined') return false;
    const stock = ProductionManager.account(CoreEngine.gameState.country).stock;
    let changed = false;
    const divs = ArmyRoster.all().filter(d => d.comp && (Number.isFinite(d.equipmentStrength) ? d.equipmentStrength : 100) < 100)
      .sort((a, b) => TrainingLogistics.PRIORITY[TrainingLogistics.priorityOf(a)].order - TrainingLogistics.PRIORITY[TrainingLogistics.priorityOf(b)].order || a.equipmentStrength - b.equipmentStrength);
    const reserveFor = {};   // 低優先は備蓄の 20% を残す
    divs.forEach(d => {
      const pr = TrainingLogistics.priorityOf(d), strength = d.equipmentStrength, missing = 100 - strength;
      const needs = TrainingManager.equipmentNeedsFor(d.comp, missing);
      const ratio = Math.min(1, ...Object.entries(needs).map(([t, amt]) => { if (amt <= 0) return 1; let have = TrainingLogistics.inventory(stock, t); if (pr === 'low') { reserveFor[t] ??= have * 0.2; have -= reserveFor[t]; } return Math.max(0, have / amt); }));
      if (!(ratio > 0)) return;
      const consumed = Object.fromEntries(Object.entries(needs).map(([t, a]) => [t, a * ratio]));
      if (!ProductionManager.consume(consumed)) return;
      d.equipmentStrength = Math.min(100, strength + missing * ratio); d.equipmentNeeds = TrainingManager.equipmentNeedsFor(d.comp); d.lastReinforced = TrainingLogistics.day();
      changed = true;
    });
    // アップグレード: 改良型装備の備蓄があれば優先度順に換装 (+10% 戦闘力)
    const ups = ArmyRoster.all().filter(d => d.comp && !d.upgraded && TrainingLogistics.upgradeOf(d) !== 'low')
      .sort((a, b) => TrainingLogistics.PRIORITY[TrainingLogistics.upgradeOf(a)].order - TrainingLogistics.PRIORITY[TrainingLogistics.upgradeOf(b)].order);
    ups.forEach(d => {
      const base = TrainingManager.equipmentNeedsFor(d.comp);
      const need = {}; Object.entries(base).forEach(([t, a]) => { const u = TrainingLogistics.UPGRADES[t]; if (u && a > 0) need[u] = a * 0.5; });
      if (!Object.keys(need).length) return;
      if (!ProductionManager.canConsume(need)) return;
      ProductionManager.consume(need); d.upgraded = true; d.upgradedDay = TrainingLogistics.day(); changed = true;
      CoreEngine.log('🔧 ' + (d.name || '師団') + ' を改良型装備に換装しました');
    });
    return changed;
  }
  static onTick() {
    const s = CoreEngine.gameState; if (!s.strategy || !MapRenderer.ready) return;
    const day = TrainingLogistics.day(); if (s.strategy._tlDay === day) return; s.strategy._tlDay = day;
    // 演習: 装備を少し消耗して練度上昇 (上限 70)。平時の自然低下は無し
    (BattlePlanManager.armies || []).forEach(a => {
      if (!a.exercising) return;
      a.divisions.forEach(d => { if (TrainingLogistics.xpOf(d) < 70) { TrainingLogistics.gainXp(d, 0.4); d.equipmentStrength = Math.max(60, (Number.isFinite(d.equipmentStrength) ? d.equipmentStrength : 100) - 0.3); } });
    });
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('logistics')) TrainingLogistics.renderLogistics();
  }

  // ------------------------------------------------------------------
  // 兵站の集計
  // ------------------------------------------------------------------
  static productionPerDay(type) {
    const s = CoreEngine.gameState, def = ProductionManager.CATALOG[type]; if (!def) return 0;
    const law = typeof PoliticsManager !== 'undefined' ? PoliticsManager.currentLaw('economy') : { factoryOutput: 0 };
    return (s.strategy.production || []).filter(l => l.type === type).reduce((a, l) => a + def.rate * (l.factories || 0) * (1 + (law.factoryOutput || 0)) * (l.efficiency == null ? 1 : l.efficiency), 0);
  }
  static demand() {
    const need = {};
    const add = (obj, mult = 1) => Object.entries(obj || {}).forEach(([k, v]) => { need[k] = (need[k] || 0) + v * mult; });
    if (typeof ArmyRoster !== 'undefined') ArmyRoster.all().forEach(d => { const st = Number.isFinite(d.equipmentStrength) ? d.equipmentStrength : 100; if (d.comp && st < 100) add(TrainingManager.equipmentNeedsFor(d.comp, 100 - st)); });
    (TrainingManager.queue || []).filter(o => o.phase === 'gathering').forEach(o => add(o.equipmentNeeds || { infantry: o.equipmentNeed }));
    const occ = CoreEngine.gameState.strategy?.occupation; if (occ && occ.needEquip) { const gt = occ.garrisonType === 'armored' ? 'tank' : 'infantry'; need[gt] = (need[gt] || 0) + Math.max(0, occ.needEquip - (occ.assigned?.equip || 0)); }
    return need;
  }

  // ------------------------------------------------------------------
  // UI: 徴兵・訓練
  // ------------------------------------------------------------------
  static tplStats(tpl) { const comp = DivisionDesigner.compositionOf(tpl); const req = TrainingManager.requirements(comp); return { comp, req }; }
  static renderTraining() {
    const el = document.getElementById('training-content'); if (!el) return;
    const s = CoreEngine.gameState, tpls = DivisionDesigner.templates || [];
    if (!TrainingLogistics.selTemplate || !tpls.some(t => String(t.id) === String(TrainingLogistics.selTemplate))) TrainingLogistics.selTemplate = (DivisionDesigner.activeTemplate?.() || tpls[0])?.id;
    const sel = tpls.find(t => String(t.id) === String(TrainingLogistics.selTemplate));
    const st = sel ? TrainingLogistics.tplStats(sel) : null;
    const count = TrainingLogistics.count || 1;
    const queue = TrainingManager.queue || [];
    const stock = ProductionManager.account(s.country).stock;
    let html = '<div class="tl-root"><div class="tl-head"><div class="tl-mark">🎓</div><div><h3>徴兵・訓練 <small>RECRUITMENT &amp; TRAINING</small></h3><p>兵員 <b>' + Math.floor(s.manpower || 0).toLocaleString() + '</b> ／ 師団 <b>' + (s.divisions || 0) + '</b> ／ 訓練キュー <b>' + queue.length + '</b> / ' + TrainingLogistics.MAX_QUEUE + '</p></div>' +
      '<div class="tl-levels">' + TrainingLogistics.LEVELS.map(l => '<span>' + l.icon + ' ' + l.name + '<small>' + l.min + '+ ／ ×' + l.factor + '</small></span>').join('') + '</div></div>';
    html += '<div class="tl-grid">';
    // 左: テンプレート
    html += '<div class="tl-panel"><h4>師団テンプレート</h4><div class="tl-tpls">' + (tpls.length ? tpls.map(t => { const { req } = TrainingLogistics.tplStats(t); return '<div class="tl-tpl' + (sel && t.id === sel.id ? ' on' : '') + '" onclick="TrainingLogistics.selTemplate=\'' + t.id + '\';TrainingLogistics.renderTraining()"><b>' + TrainingLogistics.esc(t.name) + '</b><small>' + (req ? '大隊 ' + req.count + ' ／ 兵員 ' + (req.manpowerNeed / 1000) + 'k ／ 装備 ' + req.equipNeed + ' ／ ' + req.trainDays + '日' : '戦列大隊なし') + '</small></div>'; }).join('') : '<p class="tl-help">テンプレートがありません。「師団編成」で作成してください。</p>') + '</div>' +
      '<button class="tl-btn" onclick="GameUI.switchTab(\'division\')">⚔️ 師団編成を開く</button></div>';
    // 中央: 徴兵設定
    html += '<div class="tl-panel"><h4>徴兵命令</h4>';
    if (st && st.req) {
      const r = st.req, lack = Object.entries(r.equipmentNeeds).filter(([k, v]) => (stock[k] || 0) < v * count);
      html += '<div class="tl-form"><label>テンプレート<select id="tl-template" onchange="TrainingLogistics.selTemplate=this.value;TrainingLogistics.renderTraining()">' + tpls.map(t => '<option value="' + t.id + '"' + (t.id === sel.id ? ' selected' : '') + '>' + TrainingLogistics.esc(t.name) + '</option>').join('') + '</select></label>' +
        '<label>並列訓練数<input id="tl-count" type="number" min="1" max="20" value="' + count + '" onchange="TrainingLogistics.count=parseInt(this.value)||1;TrainingLogistics.renderTraining()"></label>' +
        '<label>配置州 (中核州)<select id="tl-state">' + TrainingLogistics.coreStates().map(([sid, x]) => '<option value="' + sid + '"' + (String(TrainingManager.trainingStateId) === String(sid) ? ' selected' : '') + '>' + TrainingLogistics.esc(x.name || '州' + sid) + '</option>').join('') + '</select></label>' +
        '<label>配属先<select id="tl-army"><option value="">予備 (未配属)</option>' + (BattlePlanManager.armies || []).map(a => '<option value="' + a.id + '">' + TrainingLogistics.esc(a.name) + ' (' + a.divisions.length + '師団)</option>').join('') + '</select></label></div>' +
        '<table class="tl-table"><tr><th>必要兵員 (合計)</th><td>' + (r.manpowerNeed * count).toLocaleString() + ' <small>/ 保有 ' + Math.floor(s.manpower || 0).toLocaleString() + '</small></td></tr>' + Object.entries(r.equipmentNeeds).map(([k, v]) => '<tr><th>' + (TrainingLogistics.EQUIP_ICON[k] || '') + ' ' + (ProductionManager.CATALOG[k]?.name || k) + '</th><td' + ((stock[k] || 0) < v * count ? ' class="red"' : '') + '>' + Math.round(v * count) + ' <small>/ 備蓄 ' + Math.floor(stock[k] || 0) + '</small></td></tr>').join('') + '<tr><th>訓練期間</th><td>' + r.trainDays + ' 日 → 配置時 練度 <b>一般 (50)</b></td></tr></table>' +
        (lack.length ? '<p class="tl-warn">⚠ 装備が不足しています — 兵站画面で生産ラインを確認してください。資源待ちのまま訓練が始まりません。</p>' : '') +
        '<button class="tl-btn primary big" onclick="TrainingLogistics.recruitBatch()">🎓 ' + count + ' 師団の訓練を開始</button>';
    } else html += '<p class="tl-help">テンプレートを選択してください。</p>';
    html += '</div>';
    // 右: キュー
    html += '<div class="tl-panel"><h4>訓練キュー <small>' + queue.length + '</small></h4><div class="tl-queue">' + (queue.length ? queue.map(o => { const prog = o.phase === 'training' ? o.progress / o.trainDays : 0; const xp = Math.round(5 + prog * 45); const lv = TrainingLogistics.levelOf(xp); return '<div class="tl-order' + (o.phase === 'training' ? ' training' : '') + '"><div class="tl-order-top"><b>' + TrainingLogistics.esc(o.name) + '</b><span>' + (o.phase === 'training' ? '🎓 訓練中 ' + o.progress + '/' + o.trainDays + '日' : '⏳ 兵員・装備待ち') + '</span></div><div class="tl-bar"><em style="width:' + Math.round(prog * 100) + '%"></em></div><small>配置: ' + TrainingLogistics.esc(MapRenderer.states[o.trainingStateId]?.name || '州') + ' ／ 現在の練度 ' + lv.icon + lv.name + ' (' + xp + ')</small><div class="tl-order-btns">' + (o.phase === 'training' ? '<button class="tl-btn small danger" onclick="TrainingLogistics.deployNow(' + o.id + ')">🚨 緊急配置</button>' : '') + '<button class="tl-btn small" onclick="TrainingManager.cancel(' + o.id + ');TrainingLogistics.renderTraining()">✕ 取消</button></div></div>'; }).join('') : '<p class="tl-help">訓練中の師団はありません。</p>') + '</div></div>';
    html += '</div>';
    // 配備済み師団の練度一覧
    const groups = [...(BattlePlanManager.armies || []).map(a => ({ id: a.id, name: a.name, divs: a.divisions, army: a })), { id: 'reserve', name: '予備', divs: s.strategy?.reserves || [] }];
    html += '<div class="tl-panel"><h4>配備済み師団の練度</h4><div class="tl-armies">' + groups.map(g => { if (!g.divs.length) return ''; const avg = g.divs.reduce((a, d) => a + TrainingLogistics.xpOf(d), 0) / g.divs.length; const lv = TrainingLogistics.levelOf(avg); const counts = TrainingLogistics.LEVELS.map(l => [l, g.divs.filter(d => TrainingLogistics.levelOf(d).id === l.id).length]).filter(([, n]) => n); return '<div class="tl-army"><div class="tl-army-head"><b>' + TrainingLogistics.esc(g.name) + '</b><span>' + g.divs.length + ' 師団 ／ 平均練度 ' + lv.icon + lv.name + ' (' + Math.round(avg) + ') ／ 戦闘力 ×' + (g.divs.reduce((a, d) => a + TrainingLogistics.factor(d), 0) / g.divs.length).toFixed(2) + '</span>' + (g.army ? '<button class="tl-btn small' + (g.army.exercising ? ' on' : '') + '" onclick="TrainingLogistics.toggleExercise(' + g.id + ')">' + (g.army.exercising ? '🏋️ 演習中 (停止)' : '🏋️ 演習を開始') + '</button>' : '') + '</div><div class="tl-chips">' + counts.map(([l, n]) => '<span>' + l.icon + ' ' + l.name + ' × ' + n + '</span>').join('') + '</div><div class="tl-divs">' + g.divs.slice(0, 40).map(d => { const l = TrainingLogistics.levelOf(d); return '<span title="' + TrainingLogistics.esc(d.name || '') + ' 練度 ' + Math.round(TrainingLogistics.xpOf(d)) + ' ／ 充足 ' + Math.round(d.equipmentStrength ?? 100) + '%">' + l.icon + (d.upgraded ? '🔧' : '') + '</span>'; }).join('') + (g.divs.length > 40 ? ' …' : '') + '</div></div>'; }).join('') + '</div><p class="tl-help">練度は実戦で上昇 (戦闘ごとに +3〜6)。演習は装備を少し消耗しながら 70 まで上げられます。新兵は戦闘力 −30%、精鋭は +75%。</p></div></div>';
    el.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // UI: 兵站・装備備蓄
  // ------------------------------------------------------------------
  static renderLogistics() {
    const el = document.getElementById('logistics-content'); if (!el) return;
    const s = CoreEngine.gameState, stock = ProductionManager.account(s.country).stock, demand = TrainingLogistics.demand();
    const types = [...new Set([...TrainingLogistics.LAND_EQUIP, ...Object.keys(ProductionManager.CATALOG)])].filter(t => ProductionManager.CATALOG[t]);
    const rows = types.map(t => { const def = ProductionManager.CATALOG[t], prod = TrainingLogistics.productionPerDay(t), own = Math.floor(stock[t] || 0), have = demand[t] ? Math.floor(TrainingLogistics.inventory(stock, t)) : own, need = Math.round(demand[t] || 0), gap = have - need; return { t, def, prod, have, own, need, gap }; });
    const shortages = rows.filter(r => r.gap < 0);
    const divs = typeof ArmyRoster !== 'undefined' ? ArmyRoster.all() : [];
    const avgStr = divs.length ? divs.reduce((a, d) => a + (Number.isFinite(d.equipmentStrength) ? d.equipmentStrength : 100), 0) / divs.length : 100;
    let html = '<div class="tl-root"><div class="tl-head"><div class="tl-mark">📦</div><div><h3>兵站・装備備蓄 <small>LOGISTICS &amp; STOCKPILE</small></h3><p>師団 <b>' + divs.length + '</b> ／ 平均充足率 <b>' + Math.round(avgStr) + '%</b> ／ 欠乏装備 <b class="' + (shortages.length ? 'red' : '') + '">' + shortages.length + ' 種</b> ／ 軍需工場 <b>' + Math.floor(s.militaryFactories || 0) + '</b></p></div><button class="tl-btn" onclick="GameUI.switchTab(\'production\')">🏭 生産画面へ</button></div>';
    html += '<div class="tl-panel"><h4>装備一覧</h4><table class="tl-stock"><thead><tr><th>装備</th><th>生産量 /日</th><th>前線の要求量</th><th>備蓄</th><th>欠乏</th><th>充足まで</th></tr></thead><tbody>' + rows.map(r => '<tr class="' + (r.gap < 0 ? 'short' : '') + '"><td><b>' + (TrainingLogistics.EQUIP_ICON[r.t] || '📦') + ' ' + TrainingLogistics.esc(r.def.name) + '</b><small>' + r.t + (r.def.pool === 'dockyard' ? ' ／ 造船所' : '') + '</small></td><td>' + (r.prod ? '+' + r.prod.toFixed(1) : '<span class="dim">—</span>') + '</td><td>' + r.need.toLocaleString() + '</td><td>' + r.own.toLocaleString() + (r.have !== r.own ? '<small>互換含む ' + r.have.toLocaleString() + '</small>' : '') + '</td><td class="' + (r.gap < 0 ? 'red' : 'ok') + '">' + (r.gap < 0 ? r.gap.toLocaleString() : '+' + r.gap.toLocaleString()) + '</td><td>' + (r.gap >= 0 ? '—' : r.prod > 0 ? Math.ceil(-r.gap / r.prod) + ' 日' : '<span class="red">生産なし</span>') + '</td></tr>').join('') + '</tbody></table><p class="tl-help">要求量 = 前線師団の補充不足分 ＋ 資源待ちの徴兵命令 ＋ 鎮圧師団の不足分。欠乏 (赤字) の装備は生産ラインの増設が必要です。</p></div>';
    // 優先度
    const groups = [...(BattlePlanManager.armies || []).map(a => ({ id: a.id, name: a.name, divs: a.divisions, rp: a.reinforcePriority || 'normal', up: a.upgradePriority || 'normal' })), { id: 'reserve', name: '予備 (未配属)', divs: s.strategy?.reserves || [], rp: s.strategy?.reservePriority || 'normal', up: s.strategy?.reserveUpgrade || 'normal' }];
    const sel = (gid, kind, cur) => '<select onchange="TrainingLogistics.setPriority(\'' + gid + '\',\'' + kind + '\',this.value)">' + Object.entries(TrainingLogistics.PRIORITY).map(([k, p]) => '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + p.icon + ' ' + p.name + '</option>').join('') + '</select>';
    html += '<div class="tl-panel"><h4>補充・アップグレードの優先度</h4><table class="tl-stock"><thead><tr><th>軍</th><th>師団</th><th>平均充足率</th><th>換装済み</th><th>補充の優先度</th><th>アップグレード優先度</th></tr></thead><tbody>' + groups.map(g => { const str = g.divs.length ? g.divs.reduce((a, d) => a + (Number.isFinite(d.equipmentStrength) ? d.equipmentStrength : 100), 0) / g.divs.length : 100; return '<tr><td><b>' + TrainingLogistics.esc(g.name) + '</b></td><td>' + g.divs.length + '</td><td><div class="tl-bar sm"><em style="width:' + Math.round(str) + '%;background:' + (str < 70 ? '#e04a3c' : '#7fc46a') + '"></em></div>' + Math.round(str) + '%</td><td>' + g.divs.filter(d => d.upgraded).length + ' / ' + g.divs.length + '</td><td>' + sel(g.id, 'reinforce', g.rp) + '</td><td>' + sel(g.id, 'upgrade', g.up) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="tl-help">補充は「優先」の軍から順に備蓄を配分し、「低」の軍は備蓄の 20% を残して補充します。アップグレードは改良型装備 (歩兵装備 II・改良型野砲・改良型戦車・改良型戦闘機) を消費して換装し、戦闘力 +10%。「低」の軍は換装しません。</p></div>';
    const short = divs.filter(d => (Number.isFinite(d.equipmentStrength) ? d.equipmentStrength : 100) < 70).sort((a, b) => a.equipmentStrength - b.equipmentStrength).slice(0, 12);
    if (short.length) html += '<div class="tl-panel"><h4>充足率の低い師団</h4><div class="tl-chips">' + short.map(d => '<span class="red">' + TrainingLogistics.esc(d.name || '師団') + ' ' + Math.round(d.equipmentStrength) + '%</span>').join('') + '</div></div>';
    html += '</div>';
    el.innerHTML = html;
  }
}
if (typeof window !== 'undefined') window.TrainingLogistics = TrainingLogistics;
