/* frontline-command.js — HOI4風 前線・攻撃線・動的前線・司令階層 (元帥/将軍)・強襲上陸 (Naval Invasion)
 *
 *  操作:
 *   - 左クリック: 師団マーカーを選択 → その軍を選択 / (上陸計画モード) 自国の港を起点に指定
 *   - 右クリック (ドラッグ無し): 国境の自国プロヴィンス → 前線を自動生成し師団を均等配備
 *                                 敵の沿岸プロヴィンス (上陸計画中) → 上陸目標を指定
 *   - Shift+右ドラッグ: 攻撃線 (既存)  /  軍集団パネル「▶ 作戦実行」
 *  システム:
 *   - 動的前線: プロヴィンス controller が変わるたび (占領/喪失) に全軍の前線を再計算・前方へシフト、隙間を再配置
 *   - 計画準備度: 待機中 +2%/日、最大 +50% (元帥/将軍の特性で加速)
 *   - 包囲: 敵の首都から陸路で切断された敵プロヴィンス群 = 包囲ポケット。攻撃時 +25%、斜線で描画
 *   - 司令階層: 軍集団 (元帥) ⊃ 軍 (将軍, 最大 24 師団)。特性バフが配下全師団の戦闘計算に反映
 *   - 強襲上陸: 港 → 敵海岸、輸送船消費、準備期間、経由海域の制海権 50% 判定、上陸ペナルティ、橋頭堡と増援
 */
class FrontCommand {
  static PLANNING_CAP = 0.50;
  static DIV_LIMIT = 24;
  static INVASION_BASE_LIMIT = 10;
  static TRAITS = {
    offensive:  { id: 'offensive',  name: '攻勢ドクトリン', icon: '⚔️', attack: 0.10 },
    defensive:  { id: 'defensive',  name: '防勢の達人',     icon: '🛡️', defense: 0.15 },
    planner:    { id: 'planner',    name: '計画の名手',     icon: '📐', planningSpeed: 0.50, planningCap: 0.10 },
    panzer:     { id: 'panzer',     name: '機甲戦の雄',     icon: '🛞', breakthrough: 0.15, attack: 0.05 },
    logistics:  { id: 'logistics',  name: '兵站の魔術師',   icon: '📦', orgRegen: 1, supply: 0.2 },
    amphibious: { id: 'amphibious', name: '水陸両用作戦',   icon: '🌊', invasionPenalty: -0.35, invasionPrep: -0.3 },
    trickster:  { id: 'trickster',  name: '奇襲の名人',     icon: '🎭', attack: 0.05, encircle: 0.15 },
    inspiring:  { id: 'inspiring',  name: '兵の心を掴む',   icon: '📣', orgRegen: 1, defense: 0.05 },
  };
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }
  static s() { return CoreEngine.gameState; }
  static data() {
    const s = FrontCommand.s(); if (!s.strategy) return null;
    const d = (s.strategy.command ||= { groups: [], nextGroup: 1, encircled: {}, invasions: [], log: [] });
    d.groups ||= []; d.encircled ||= {}; d.log ||= [];
    return d;
  }

  // ==========================================================
  static init() {
    if (FrontCommand.installed) return; FrontCommand.installed = true;
    if (typeof PlanningBonus !== 'undefined') { PlanningBonus.BASE_CAP = FrontCommand.PLANNING_CAP; PlanningBonus.MAX_CAP = Math.max(PlanningBonus.MAX_CAP, 0.6); }
    FrontCommand.installHooks();
    FrontCommand.installUI();
    CoreEngine.registerTickCallback(() => FrontCommand.onTick());
    CoreEngine.log('🎖️ 前線・司令階層・強襲上陸システムが有効になりました。');
  }
  static installHooks() {
    // --- 占領: controller 更新 → 即座に塗り替え + 全軍の動的前線更新 ---
    if (typeof OffensivePlanner !== 'undefined' && !OffensivePlanner._fcHooked) {
      OffensivePlanner._fcHooked = true;
      const cap = OffensivePlanner.capture.bind(OffensivePlanner);
      OffensivePlanner.capture = (pid, owner, broadcast) => { const prev = MapRenderer.ownerOf(Number(pid)); const ok = cap(pid, owner, broadcast); if (ok) FrontCommand.onCapture(Number(pid), owner, prev); return ok; };
      const hold = OffensivePlanner.hold.bind(OffensivePlanner);
      OffensivePlanner.hold = (army, pid) => { hold(army, pid); army.holdPid = pid; };
      const result = OffensivePlanner.result.bind(OffensivePlanner);
      OffensivePlanner.result = (b) => {
        const army = BattlePlanManager.armies.find(a => a.id === b.attackerArmyId);
        result(b);
        if (!army) return;
        if (b.invasion && b.advantage >= 0.1) FrontCommand.onLanded(army, b);
        else if (b.invasion && army.invasion) { army.invasion.status = 'failed'; FrontCommand.logLine('🌊 ' + army.name + ' の上陸は撃退された'); }
        // 攻撃線完遂 → 攻撃線モード解除 + 防衛前線を展開
        if (!army.executing && army.goalPid && MapRenderer.ownerOf(army.goalPid) === FrontCommand.s().country) FrontCommand.convertToDefense(army, '目標到達・防衛前線を展開');
      };
    }
    // --- 戦闘計算: 指揮官特性・包囲・上陸ペナルティ・死守 ---
    if (typeof BattleManager !== 'undefined' && !BattleManager._fcHooked) {
      BattleManager._fcHooked = true;
      const off = BattleManager.calcOffensiveAdvantage.bind(BattleManager);
      BattleManager.calcOffensiveAdvantage = (army, st) => {
        let adv = off(army, st);
        const real = BattlePlanManager.armies.find(a => a.id === army.id) || army;
        const m = FrontCommand.modifiers(real);
        adv += m.attack + m.breakthrough * 0.5;
        if (st && FrontCommand.stateEncircled(st)) adv += 0.25 + m.encircle;
        if (real.divisions.length > FrontCommand.DIV_LIMIT) adv -= 0.2 * Math.min(1, (real.divisions.length - FrontCommand.DIV_LIMIT) / 12);
        return Math.max(-1, Math.min(1, adv));
      };
      const def = BattleManager.calcDefenseAdvantage.bind(BattleManager);
      BattleManager.calcDefenseAdvantage = (sid) => { let adv = def(sid); const armies = FrontCommand.armiesInState(sid); armies.forEach(a => { const m = FrontCommand.modifiers(a); adv += m.defense + (a.holdOrder ? 0.15 : 0); }); return Math.max(-1, Math.min(1, adv)); };
      const start = BattleManager.startOffensive.bind(BattleManager);
      BattleManager.startOffensive = (army, pid, sid, options = {}) => {
        const b = start(army, pid, sid, options); if (!b) return b;
        if (options.invasion) {
          // 上陸ペナルティ: 攻撃・突破 −60%。艦砲射撃 / CAS / 水陸両用特性で軽減
          const m = FrontCommand.modifiers(army);
          let pen = 0.6 + (m.invasionPenalty || 0);
          const shore = FrontCommand.shoreBombardment(pid); const cas = typeof AirForce !== 'undefined' ? (AirForce.casBonus({ stateId: sid, attacker: FrontCommand.s().country }) || 0) : 0;
          pen -= Math.min(0.25, shore) + Math.min(0.15, cas);
          pen = Math.max(0.05, Math.min(0.75, pen));
          b.softAttack *= 1 - pen; b.hardAttack *= 1 - pen; b.advantage = Math.max(-1, b.advantage - pen * 0.6 + (army.divisions.some(d => d.comp?.marine) ? 0.15 : 0));
          b.invasionPenalty = pen; b.shoreSupport = shore; b.casSupport = cas;
          CoreEngine.log('🌊 上陸ペナルティ −' + Math.round(pen * 100) + '% (艦砲射撃 +' + Math.round(shore * 100) + '% / CAS +' + Math.round(cas * 100) + '%)');
        }
        return b;
      };
    }
    if (typeof PlanningBonus !== 'undefined' && !PlanningBonus._fcHooked) {
      PlanningBonus._fcHooked = true;
      const tick = PlanningBonus.tick.bind(PlanningBonus);
      PlanningBonus.tick = (army) => { const m = FrontCommand.modifiers(army); const r = PlanningBonus.GAIN_PER_DAY; PlanningBonus.GAIN_PER_DAY = r * (1 + m.planningSpeed); const base = PlanningBonus.BASE_CAP; PlanningBonus.BASE_CAP = base + m.planningCap; const v = tick(army); PlanningBonus.GAIN_PER_DAY = r; PlanningBonus.BASE_CAP = base; return v; };
    }
    // --- 師団配属: 将軍の指揮上限 24 ---
    if (typeof ArmyRoster !== 'undefined' && !ArmyRoster._fcHooked) {
      ArmyRoster._fcHooked = true;
      const tr = ArmyRoster.transfer.bind(ArmyRoster);
      ArmyRoster.transfer = (ids, targetId) => { const ok = tr(ids, targetId); const t = BattlePlanManager.armies.find(a => a.id === targetId); if (ok && t && t.divisions.length > FrontCommand.DIV_LIMIT) GameUI.notify('⚠️ ' + t.name + ' は指揮上限 ' + FrontCommand.DIV_LIMIT + ' 師団を超過 (' + t.divisions.length + ') — 統率ペナルティが発生します', 'alert'); return ok; };
      const render = ArmyRoster.render.bind(ArmyRoster);
      ArmyRoster.render = () => { render(); FrontCommand.decoratePanel(); };
    }
    if (typeof BattlePlanManager !== 'undefined' && !BattlePlanManager._fcHooked) {
      BattlePlanManager._fcHooked = true;
      const draw = BattlePlanManager.drawOverlay.bind(BattlePlanManager);
      BattlePlanManager.drawOverlay = (ctx, cam, w2s) => { FrontCommand.drawUnder(ctx, w2s); draw(ctx, cam, w2s); FrontCommand.drawOver(ctx, w2s); };
      const exec = BattlePlanManager.execute.bind(BattlePlanManager);
      BattlePlanManager.execute = (id) => { const a = BattlePlanManager.armies.find(x => x.id === id); if (a && a.invasion && a.invasion.status !== 'landed') { FrontCommand.launchInvasion(a.id); return; } if (a) a.holdOrder = false; return exec(id); };
      const abort = BattlePlanManager.abort.bind(BattlePlanManager);
      BattlePlanManager.abort = (id) => { const a = BattlePlanManager.armies.find(x => x.id === id); if (a && a.invasion && a.invasion.status === 'sailing') { FrontCommand.cancelInvasion(a.id, true); return; } return abort(id); };
    }
  }
  static installUI() {
    if (typeof GameTools !== 'undefined' && document.getElementById('window-templates')) {
      GameTools.window('command', '🎖️ 司令部', () => FrontCommand.render(), 1100);
      const tpl = document.getElementById('tpl-command'); if (tpl) tpl.dataset.h = '760';
    }
    if (typeof GameUI !== 'undefined' && !GameUI._fcHooked) { GameUI._fcHooked = true; const o = GameUI.onWindowOpened.bind(GameUI); GameUI.onWindowOpened = (t) => { o(t); if (t === 'command') FrontCommand.render(); }; }
  }
  static logLine(text) { const d = FrontCommand.data(); if (!d) return; d.log.unshift({ day: FrontCommand.day(), text }); d.log = d.log.slice(0, 50); CoreEngine.log(text); }

  // ==========================================================
  // 指揮官・階層
  // ==========================================================
  static group(id) { return FrontCommand.data().groups.find(g => g.id === id) || null; }
  static groupOf(army) { return FrontCommand.data()?.groups.find(g => g.armyIds.includes(army.id)) || null; }
  static createGroup() {
    const d = FrontCommand.data(); const id = d.nextGroup++;
    d.groups.push({ id, name: '第' + id + '軍集団司令部', marshal: null, armyIds: [] });
    GameUI.notify('🎖️ 第' + id + '軍集団司令部を設置しました', 'success'); FrontCommand.render();
  }
  static renameGroup(id) { const g = FrontCommand.group(id); if (!g) return; const n = prompt('軍集団司令部の名称', g.name); if (n && n.trim()) { g.name = n.trim().slice(0, 24); FrontCommand.render(); } }
  static disbandGroup(id) { const d = FrontCommand.data(); d.groups = d.groups.filter(g => g.id !== id); FrontCommand.render(); }
  static attach(armyId, groupId) {
    const d = FrontCommand.data(); d.groups.forEach(g => { g.armyIds = g.armyIds.filter(x => x !== armyId); });
    const g = FrontCommand.group(Number(groupId)); if (g) g.armyIds.push(armyId);
    FrontCommand.render();
  }
  static traitsOf(card) {
    if (!card) return [];
    if (Array.isArray(card.traits) && card.traits.length) return card.traits.map(t => FrontCommand.TRAITS[t]).filter(Boolean);
    const keys = Object.keys(FrontCommand.TRAITS); let h = 0; String(card.id || card.name || '').split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
    const n = card.rank === 'SSR' ? 3 : card.rank === 'SR' ? 2 : 1; const out = [];
    for (let i = 0; out.length < n && i < keys.length * 2; i++) { const t = FrontCommand.TRAITS[keys[(h + i * 7) % keys.length]]; if (!out.includes(t)) out.push(t); }
    return out;
  }
  static sumTraits(traits) { const m = { attack: 0, defense: 0, breakthrough: 0, planningSpeed: 0, planningCap: 0, orgRegen: 0, supply: 0, invasionPenalty: 0, invasionPrep: 0, encircle: 0 }; traits.forEach(t => Object.keys(m).forEach(k => { m[k] += t[k] || 0; })); return m; }
  /** 軍 (将軍) + 所属軍集団 (元帥) の合算補正 */
  static modifiers(army) {
    const empty = FrontCommand.sumTraits([]); if (!army) return empty;
    const traits = [...FrontCommand.traitsOf(army.general)];
    const g = FrontCommand.groupOf(army); if (g && g.marshal) FrontCommand.traitsOf(g.marshal).forEach(t => traits.push({ ...t, attack: (t.attack || 0) * 0.5, defense: (t.defense || 0) * 0.5, planningSpeed: (t.planningSpeed || 0) * 0.5 }));
    const m = FrontCommand.sumTraits(traits);
    if (g && g.marshal) { const r = (typeof BattleManager !== 'undefined' ? BattleManager.GENERAL_BONUS[g.marshal.rank] : 0) || 0; m.attack += r * 0.5; m.defense += r * 0.5; }
    return m;
  }
  static assignMarshal(groupId) {
    const g = FrontCommand.group(groupId); if (!g) return;
    const player = FrontCommand.s().country; const used = new Set([...BattlePlanManager.armies.map(a => a.general?.id), ...FrontCommand.data().groups.map(x => x.marshal?.id)].filter(Boolean));
    const pool = (CardSystem.hiredCards || []).filter(c => c.country === player && (!used.has(c.id) || c.id === g.marshal?.id));
    let html = '<p class="fc-help">雇用済みカードから元帥 (軍集団司令官) を任命します。元帥の特性は配下の全軍に半分の効果で適用されます。</p>';
    if (g.marshal) html += '<div class="army-row"><div class="army-name">🎖️ 現在: ' + FrontCommand.esc(g.marshal.name) + '</div><button class="army-btn abort" onclick="FrontCommand.pickMarshal(' + g.id + ',null)">✕ 解任</button></div>';
    html += pool.length ? pool.map(c => '<div class="army-row fc-pick" onclick="FrontCommand.pickMarshal(' + g.id + ',\'' + c.id + '\')"><div class="army-name">' + FrontCommand.esc(c.name) + ' <span style="color:var(--accent-orange)">(' + c.rank + ')</span></div><div class="army-info">' + FrontCommand.traitsOf(c).map(t => t.icon + t.name).join(' ') + '</div></div>').join('') : '<p class="fc-help">任命できるカードがありません。将軍カードを雇用してください。</p>';
    GameUI.openModal('🎖️ ' + g.name + ' — 元帥の任命', html);
  }
  static pickMarshal(groupId, cardId) { const g = FrontCommand.group(groupId); if (!g) return; const c = cardId ? (CardSystem.hiredCards || []).find(x => x.id === cardId) : null; g.marshal = c ? { id: c.id, name: c.name, rank: c.rank, imgUrl: c.imgUrl } : null; GameUI.closeModal(); FrontCommand.render(); if (c) FrontCommand.logLine('🎖️ ' + c.name + ' を ' + g.name + ' の元帥に任命'); }
  // 一括司令
  static groupCommand(groupId, cmd) {
    const g = FrontCommand.group(groupId); if (!g) return; const armies = g.armyIds.map(id => BattlePlanManager.armies.find(a => a.id === id)).filter(Boolean);
    let n = 0;
    armies.forEach(a => {
      if (cmd === 'execute') { if (!a.executing && (a.invasion ? a.invasion.status === 'ready' : (a.arrow && a.frontline))) { BattlePlanManager.execute(a.id); n++; } }
      else if (cmd === 'stop') { if (a.executing) { BattlePlanManager.abort(a.id); n++; } a.holdOrder = false; }
      else if (cmd === 'hold') { if (a.executing) BattlePlanManager.abort(a.id); a.holdOrder = true; a.status = '死守'; a.arrow = null; a.chain = null; a.targetState = null; n++; }
    });
    GameUI.notify({ execute: '▶ 作戦実行: ', stop: '⏸ 計画停止: ', hold: '🛡️ 全員その場で死守: ' }[cmd] + n + ' 軍', 'success');
    FrontCommand.render(); BattlePlanManager.renderPanel();
  }
  static holdArmy(id) { const a = BattlePlanManager.armies.find(x => x.id === id); if (!a) return; if (a.executing) BattlePlanManager.abort(id); a.holdOrder = !a.holdOrder; a.status = a.holdOrder ? '死守' : '待機'; BattlePlanManager.renderPanel(); FrontCommand.render(); }
  static armiesInState(sid) { return BattlePlanManager.armies.filter(a => a.divisions.some(d => String(MapRenderer.stateOf(Number(d.pid || a.positionPid))) === String(sid))); }

  // ==========================================================
  // 操作導線
  // ==========================================================
  /** 右クリック (ドラッグなし)。true を返すと外交画面は開かない */
  static rightClick(pid, wp) {
    const s = FrontCommand.s(), player = s.country; if (!pid) return false;
    const army = BattlePlanManager.selectedArmy();
    const owner = MapRenderer.ownerOf(pid);
    // 上陸計画中: 敵の海岸を右クリック → 目標
    if (army && army.invasion && army.invasion.status === 'origin' && owner !== player) return FrontCommand.setInvasionTarget(army, pid);
    if (!army || BattlePlanManager.activeForce !== 'army') return false;
    const pd = MapRenderer.provinces.p[pid]; if (!pd || MapRenderer.provinces.types[pd[3]] !== 'land') return false;
    const nbrs = [...(MapRenderer.provNeighbors.get(pid) || [])];
    let enemy = null;
    if (owner === player) enemy = nbrs.filter(n => OffensivePlanner.isLand(n)).map(n => MapRenderer.ownerOf(n)).find(o => o && o !== player);
    else if (nbrs.some(n => MapRenderer.ownerOf(n) === player)) enemy = owner;
    if (!enemy) return false;
    if (army.executing) { GameUI.notify('この軍は作戦実行中です。', 'alert'); return true; }
    army.holdOrder = false;
    BattlePlanManager.autoFrontline(enemy);
    return true;
  }
  /** 左クリック。true を返すと通常の州選択をスキップ */
  static leftClick(pid, wp) {
    const army = BattlePlanManager.selectedArmy();
    if (army && army.invasion && army.invasion.status === 'pick_port') return FrontCommand.setInvasionOrigin(army, pid);
    // 師団マーカーの選択
    const scale = BattlePlanManager.unitMarkerScale(); const r = 14 * scale / Math.max(0.05, MapRenderer.cam.scale);
    let hit = null;
    BattlePlanManager.armies.forEach(a => a.divisions.forEach(d => { const p = (a.executing ? a.positionPid : d.pid) || a.positionPid; const c = p ? MapRenderer.provCentroid.get(Number(p)) : [d.x, d.y]; if (c && Math.hypot(c[0] - wp[0], c[1] - wp[1]) <= r) hit = a; }));
    if (hit && hit.id !== BattlePlanManager.selectedArmyId) { BattlePlanManager.selectArmy(hit.id); GameUI.notify('🪖 ' + hit.name + ' を選択 — 国境を右クリックで前線、Shift+右ドラッグで攻撃線', 'success'); return false; }
    return false;
  }

  // ==========================================================
  // 動的前線 / 占領 / 包囲
  // ==========================================================
  static onCapture(pid, owner, prev) {
    const s = FrontCommand.s();
    MapRenderer.invalidateModes?.();
    // 全軍の前線を再計算 (前進した側へシフト) + 隙間を再配置
    BattlePlanManager.armies.forEach(a => {
      if (!a.frontline || !a.frontline.length) return;
      if (!a.frontEnemy) a.frontEnemy = prev !== s.country ? prev : owner;
      OffensivePlanner.updateFrontline(a);
      if (!a.executing) OffensivePlanner.redistribute?.(a);
    });
    FrontCommand.recomputeEncirclement();
    if (owner === s.country) FrontCommand.data().captured = (FrontCommand.data().captured || 0) + 1;
    BattlePlanManager.renderPanel();
  }
  static convertToDefense(army, why) {
    army.arrow = null; army.chain = null; army.targetState = null; army.route = null; army.executing = false;
    const s = FrontCommand.s(); const pid = army.positionPid; const nbrs = pid ? [...(MapRenderer.provNeighbors.get(Number(pid)) || [])] : [];
    const enemy = nbrs.map(n => MapRenderer.ownerOf(n)).find(o => o && s.atWar.includes(o)) || army.frontEnemy;
    if (enemy) { army.frontEnemy = enemy; OffensivePlanner.updateFrontline(army); OffensivePlanner.redistribute?.(army); }
    army.status = why || '防衛前線を展開';
    FrontCommand.logLine('🛡️ ' + army.name + ': ' + army.status);
  }
  /** 前線の鮮度チェック: 前線点のプロヴィンスが国境でなくなっていれば再計算 */
  static refreshFronts() {
    const s = FrontCommand.s(), player = s.country;
    BattlePlanManager.armies.forEach(a => {
      if (!a.frontline || !a.frontline.length || !a.frontEnemy) return;
      const stale = a.frontline.some(pt => { const pid = MapRenderer.provinceAt(pt[0], pt[1]); if (!pid) return true; if (MapRenderer.ownerOf(pid) !== player) return true; return ![...(MapRenderer.provNeighbors.get(pid) || [])].some(n => s.atWar.includes(MapRenderer.ownerOf(n)) || MapRenderer.ownerOf(n) === a.frontEnemy); });
      if (stale) { OffensivePlanner.updateFrontline(a); if (!a.executing) OffensivePlanner.redistribute?.(a); }
    });
  }
  /** 敵国ごとに首都 (最大 VP 州) から陸路で到達できないプロヴィンス = 包囲ポケット */
  static recomputeEncirclement() {
    const s = FrontCommand.s(), d = FrontCommand.data(); if (!d) return; d.encircled = {};
    (s.atWar || []).forEach(tag => {
      const owned = []; MapRenderer.provNeighbors.forEach((set, pid) => { if (OffensivePlanner.isLand(pid) && MapRenderer.ownerOf(pid) === tag) owned.push(pid); });
      if (!owned.length) return;
      let capPid = null; try { capPid = ArmyRoster.capitalProvince(tag); } catch (e) { /* ignore */ }
      if (!capPid || MapRenderer.ownerOf(capPid) !== tag) { // 最大 VP の州
        let best = null, bv = -1; Object.entries(MapRenderer.states).forEach(([sid, st]) => { if (st.owner !== tag) return; const v = Object.values(st.vp || {}).reduce((a, x) => a + Number(x || 0), 0); if (v > bv) { bv = v; best = st; } });
        capPid = best ? (best.provinces || []).find(p => MapRenderer.ownerOf(p) === tag && OffensivePlanner.isLand(p)) : owned[0];
      }
      const seen = new Set([capPid]); const q = [capPid];
      while (q.length) { const c = q.pop(); for (const n of MapRenderer.provNeighbors.get(c) || []) { if (!seen.has(n) && OffensivePlanner.isLand(n) && MapRenderer.ownerOf(n) === tag) { seen.add(n); q.push(n); } } }
      // 海岸に面したポケットは海上補給があるので半分のペナルティ (isolated=0.5)
      owned.forEach(p => { if (!seen.has(p)) d.encircled[p] = MapRenderer.provinces.p[p]?.[4] ? 0.5 : 1; });
    });
  }
  static stateEncircled(st) { const d = FrontCommand.data(); if (!d || !st) return false; const land = (st.provinces || []).filter(OffensivePlanner.isLand); return land.length > 0 && land.every(p => d.encircled[p]); }
  static encircledCount() { return Object.keys(FrontCommand.data()?.encircled || {}).length; }

  // ==========================================================
  // 強襲上陸
  // ==========================================================
  static invasionLimit() {
    let n = FrontCommand.INVASION_BASE_LIMIT;
    try { const set = ResearchManager.researchedTech; if (set) { if ([...set].some(id => /amphib|landing_craft|marines?_2|naval_invasion/i.test(String(id)))) n += 10; if ([...set].some(id => /marine|amphibious_tank|mechanized_amphibious/i.test(String(id)))) n += 5; } } catch (e) { /* ignore */ }
    return n;
  }
  static convoyStock() { try { return Math.floor(Number(ProductionManager.account(FrontCommand.s().country).stock.convoys ?? FrontCommand.s().convoys) || 0); } catch (e) { return Math.floor(FrontCommand.s().convoys || 0); } }
  static takeConvoys(n) { try { const st = ProductionManager.account(FrontCommand.s().country).stock; st.convoys = Math.max(0, Math.floor(Number(st.convoys ?? FrontCommand.s().convoys) || 0) - n); ProductionManager.syncLocal(); } catch (e) { FrontCommand.s().convoys = Math.max(0, (FrontCommand.s().convoys || 0) - n); } }
  static giveConvoys(n) { try { const st = ProductionManager.account(FrontCommand.s().country).stock; st.convoys = Math.floor(Number(st.convoys ?? 0) || 0) + n; ProductionManager.syncLocal(); } catch (e) { FrontCommand.s().convoys = (FrontCommand.s().convoys || 0) + n; } }
  static beginInvasionPlan(armyId) {
    const army = BattlePlanManager.armies.find(a => a.id === (armyId ?? BattlePlanManager.selectedArmyId)); if (!army) { GameUI.notify('軍集団パネルから軍を選択してください。', 'alert'); return; }
    if (army.executing) { GameUI.notify('この軍は作戦実行中です。', 'alert'); return; }
    if (!army.divisions.length) { GameUI.notify('上陸する師団を配属してください。', 'alert'); return; }
    if (army.divisions.length > FrontCommand.invasionLimit()) { GameUI.notify('1 回の上陸作戦に割り当てられるのは最大 ' + FrontCommand.invasionLimit() + ' 師団です (技術で拡張)。', 'alert'); return; }
    if (army.invasion && army.invasion.convoys) FrontCommand.giveConvoys(army.invasion.convoys);
    BattlePlanManager.selectedArmyId = army.id; BattlePlanManager.invasionMode = false; ArmyRoster.frontTool = false; ArmyRoster.moveTool = false;
    army.invasion = { status: 'pick_port', originSid: null, originPid: null, targetPid: null, targetSid: null, convoys: 0, prep: 0, prepNeeded: 0, route: [], progress: 0 };
    army.frontline = null; army.arrow = null; army.chain = null;
    GameUI.notify('⚓ 上陸計画: 自国または同盟国の「港」(海軍基地のある州の海岸) を左クリックして出発港を指定', 'success');
    BattlePlanManager.renderPanel(); FrontCommand.render();
  }
  static ownPorts() {
    const s = FrontCommand.s(), me = s.country; const allies = new Set([me, ...((typeof FactionSystem !== 'undefined' && FactionSystem.factionOf ? FactionSystem.factionOf(me)?.members : null) || []), ...Object.keys(s.militaryAccess || {}).filter(k => s.militaryAccess[k])]);
    const out = [];
    Object.entries(MapRenderer.states || {}).forEach(([sid, st]) => { if (!allies.has(st.owner) || !(st.b?.naval_base > 0)) return; const coast = (st.provinces || []).filter(p => MapRenderer.provinces.p[p]?.[4]); if (coast.length) out.push({ sid, st, coast, level: st.b.naval_base }); });
    return out;
  }
  static setInvasionOrigin(army, pid) {
    const sid = MapRenderer.stateOf(pid); const port = FrontCommand.ownPorts().find(p => String(p.sid) === String(sid));
    if (!port) { GameUI.notify('⚓ 海軍基地 (港) のある自国/同盟国の沿岸州をクリックしてください。', 'alert'); return true; }
    const coast = port.coast.includes(pid) ? pid : port.coast[0];
    army.invasion.originSid = String(sid); army.invasion.originPid = coast; army.invasion.status = 'origin';
    GameUI.notify('⚓ 出発港: ' + (port.st.name || sid) + ' (Lv' + port.level + ') — 敵国の海岸プロヴィンスを右クリックして上陸目標を指定', 'success');
    BattlePlanManager.renderPanel(); FrontCommand.render(); return true;
  }
  static setInvasionTarget(army, pid) {
    const s = FrontCommand.s(); const pd = MapRenderer.provinces.p[pid]; const owner = MapRenderer.ownerOf(pid);
    if (!pd || !pd[4] || MapRenderer.provinces.types[pd[3]] !== 'land') { GameUI.notify('🌊 上陸目標は敵の海岸プロヴィンスを指定してください。', 'alert'); return true; }
    if (!s.atWar.includes(owner)) { GameUI.notify('⚔️ ' + (typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(owner) : owner) + ' とは開戦していません。', 'alert'); return true; }
    const route = FrontCommand.seaRoute(army.invasion.originPid, pid);
    if (!route.length) { GameUI.notify('🌊 出発港から目標まで海路が見つかりません。', 'alert'); return true; }
    const inv = army.invasion; inv.targetPid = pid; inv.targetSid = String(MapRenderer.stateOf(pid)); inv.route = route;
    const n = army.divisions.length; const m = FrontCommand.modifiers(army);
    inv.convoys = n; inv.prepNeeded = Math.max(3, Math.round((7 + n * 2) * (1 + (m.invasionPrep || 0)) * (army.divisions.every(d => d.comp?.marine) ? 0.8 : 1))); inv.prep = 0; inv.status = 'preparing';
    const stock = FrontCommand.convoyStock();
    if (stock < n) { GameUI.notify('🚢 輸送船が不足しています (必要 ' + n + ' / 保有 ' + stock + ')。', 'alert'); inv.status = 'origin'; return true; }
    FrontCommand.takeConvoys(n);
    const st = MapRenderer.states[inv.targetSid];
    FrontCommand.logLine('🌊 ' + army.name + ' の強襲上陸計画: ' + (MapRenderer.states[inv.originSid]?.name || inv.originSid) + ' → ' + (st?.name || inv.targetSid) + ' (' + n + ' 師団・輸送船 ' + n + '・準備 ' + inv.prepNeeded + ' 日・経由海域 ' + route.length + ')');
    GameUI.notify('🌊 上陸計画を立案 — 準備 ' + inv.prepNeeded + ' 日。経由海域の制海権 50% 以上を確保してください', 'success');
    BattlePlanManager.renderPanel(); FrontCommand.render(); return true;
  }
  /** 海プロヴィンスの BFS 経路 (出発海岸の隣接海域 → 目標海岸の隣接海域) */
  static seaRoute(fromPid, toPid) {
    const types = MapRenderer.provinces.types; const isSea = p => { const pd = MapRenderer.provinces.p[p]; return pd && types[pd[3]] === 'sea'; };
    const starts = [...(MapRenderer.provNeighbors.get(Number(fromPid)) || [])].filter(isSea); const goals = new Set([...(MapRenderer.provNeighbors.get(Number(toPid)) || [])].filter(isSea));
    if (!starts.length || !goals.size) return [];
    const prev = new Map(); const q = []; starts.forEach(p => { prev.set(p, null); q.push(p); });
    let end = null;
    for (let i = 0; i < q.length && end === null; i++) { const c = q[i]; if (goals.has(c)) { end = c; break; } for (const n of MapRenderer.provNeighbors.get(c) || []) if (isSea(n) && !prev.has(n)) { prev.set(n, c); q.push(n); } }
    if (end === null) return [];
    const route = []; for (let p = end; p != null; p = prev.get(p)) route.push(p); return route.reverse();
  }
  /** 経由海域の制海権 (最小値) — 10 区画ごとにサンプリング */
  static routeSuperiority(route) {
    if (typeof NavalForce === 'undefined' || !route?.length) return { min: FrontCommand.s().navalSupremacy || 0, worst: null };
    let min = 100, worst = null; const step = Math.max(1, Math.floor(route.length / 8));
    for (let i = 0; i < route.length; i += step) { const sup = NavalForce.superiorityAt(route[i]); const pct = sup.level === 'none' ? (FrontCommand.s().navalSupremacy || 0) : sup.percent; if (pct < min) { min = pct; worst = route[i]; } }
    const last = NavalForce.superiorityAt(route[route.length - 1]); const lp = last.level === 'none' ? (FrontCommand.s().navalSupremacy || 0) : last.percent; if (lp < min) { min = lp; worst = route[route.length - 1]; }
    return { min, worst };
  }
  static shoreBombardment(pid) {
    if (typeof NavalForce === 'undefined') return 0; const c = MapRenderer.provCentroid.get(Number(pid)); if (!c) return 0;
    return NavalForce.tfs().filter(tf => tf.executing && (tf.mission === 'shore' || tf.mission === 'strike') && NavalForce.inZone(tf, c[0], c[1], (NavalForce.RADIUS || 120) * 1.5)).reduce((n, tf) => n + Math.min(0.15, NavalForce.stats(tf).power / 400), 0);
  }
  static invasionChecks(army) {
    const inv = army.invasion; if (!inv) return [];
    const sup = FrontCommand.routeSuperiority(inv.route);
    return [
      { ok: inv.status !== 'pick_port' && !!inv.originPid, text: '出発港の指定' + (inv.originSid ? ' (' + (MapRenderer.states[inv.originSid]?.name || inv.originSid) + ')' : '') },
      { ok: !!inv.targetPid, text: '上陸目標の指定' + (inv.targetSid ? ' (' + (MapRenderer.states[inv.targetSid]?.name || inv.targetSid) + ')' : '') },
      { ok: army.divisions.length >= 1 && army.divisions.length <= FrontCommand.invasionLimit(), text: '師団数 ' + army.divisions.length + ' / 上限 ' + FrontCommand.invasionLimit() },
      { ok: inv.convoys >= army.divisions.length, text: '輸送船 ' + inv.convoys + ' 隻を割当 (保有 ' + FrontCommand.convoyStock() + ')' },
      { ok: inv.prepNeeded > 0 && inv.prep >= inv.prepNeeded, text: '準備 ' + (inv.prepNeeded ? Math.min(100, Math.round(inv.prep / inv.prepNeeded * 100)) : 0) + '% (' + Math.min(inv.prep, inv.prepNeeded) + '/' + inv.prepNeeded + ' 日)' },
      { ok: sup.min >= 50, text: '経由海域の制海権 ≥50% (最低 ' + Math.round(sup.min) + '%)' },
    ];
  }
  static launchInvasion(armyId) {
    const army = BattlePlanManager.armies.find(a => a.id === armyId); if (!army || !army.invasion) return;
    const checks = FrontCommand.invasionChecks(army); const ng = checks.find(c => !c.ok);
    if (ng) { GameUI.notify('🌊 上陸作戦を実行できません: ' + ng.text, 'alert'); return; }
    const inv = army.invasion; inv.status = 'sailing'; inv.progress = 0; inv.days = Math.max(2, Math.ceil(inv.route.length / 6));
    army.executing = true; army.status = '海上輸送中'; army.progress = 0; army.holdOrder = false;
    FrontCommand.logLine('🚢 ' + army.name + ' が出撃 — ' + (MapRenderer.states[inv.targetSid]?.name || inv.targetSid) + ' へ強襲上陸 (航海 ' + inv.days + ' 日)');
    GameUI.notify('🚢 上陸部隊が出撃しました (航海 ' + inv.days + ' 日)', 'success');
    BattlePlanManager.renderPanel(); FrontCommand.render();
  }
  static cancelInvasion(armyId, silent) {
    const army = BattlePlanManager.armies.find(a => a.id === armyId); if (!army || !army.invasion) return;
    if (army.invasion.convoys && army.invasion.status !== 'landed') FrontCommand.giveConvoys(army.invasion.convoys);
    army.invasion = null; army.executing = false; army.status = '待機'; BattleManager.battles = BattleManager.battles.filter(b => b.attackerArmyId !== army.id);
    if (!silent) GameUI.notify('上陸計画を取り消しました (輸送船を返却)');
    BattlePlanManager.renderPanel(); FrontCommand.render();
  }
  static invasionTick(army) {
    const inv = army.invasion; if (!inv) return;
    if (inv.status === 'preparing') { inv.prep = Math.min(inv.prepNeeded, inv.prep + 1); if (inv.prep >= inv.prepNeeded) { inv.status = 'ready'; GameUI.notify('🌊 ' + army.name + ' の上陸準備が完了 — 作戦実行で出撃', 'success'); } return; }
    if (inv.status !== 'sailing') return;
    const sup = FrontCommand.routeSuperiority(inv.route);
    if (sup.min < 50) {
      // 制海権喪失: 海上で損害、輸送船を失い帰港
      const lost = Math.max(1, Math.round(inv.convoys * 0.3)); inv.convoys = Math.max(0, inv.convoys - lost);
      army.divisions.forEach(d => { d.org = Math.max(0, d.org - 25); d.equipmentStrength = Math.max(10, (Number.isFinite(d.equipmentStrength) ? d.equipmentStrength : 100) - 20); });
      inv.status = 'preparing'; inv.prep = Math.floor(inv.prepNeeded * 0.5); army.executing = false; army.status = '海上で迎撃され帰港';
      FrontCommand.logLine('💥 ' + army.name + ' の輸送船団が迎撃された — 輸送船 ' + lost + ' 隻喪失、帰港 (制海権 ' + Math.round(sup.min) + '%)');
      GameUI.notify('💥 上陸船団が迎撃されました (制海権 ' + Math.round(sup.min) + '%) — 輸送船 ' + lost + ' 隻喪失', 'alert');
      return;
    }
    inv.progress = Math.min(1, inv.progress + 1 / inv.days); army.progress = Math.round(inv.progress * 100);
    const idx = Math.min(inv.route.length - 1, Math.floor(inv.progress * (inv.route.length - 1))); const c = MapRenderer.provCentroid.get(inv.route[idx]); if (c) { army.seaPos = c; }
    if (inv.progress >= 1) {
      const owner = MapRenderer.ownerOf(inv.targetPid);
      if (owner === FrontCommand.s().country) { FrontCommand.onLanded(army, { provId: inv.targetPid }); return; }
      if (!FrontCommand.s().atWar.includes(owner)) { inv.status = 'ready'; army.executing = false; army.status = '目標国と非交戦・待機'; return; }
      if (BattleManager.battles.some(b => b.attackerArmyId === army.id)) return;
      inv.status = 'assault'; army.status = '強襲上陸中';
      const b = BattleManager.startOffensive(army, inv.targetPid, Number(inv.targetSid), { invasion: true }); if (b) b.invasion = true;
    }
  }
  static onLanded(army, b) {
    const inv = army.invasion; const pid = Number(b.provId);
    OffensivePlanner.hold(army, pid); army.seaPos = null; army.executing = false; army.bridgehead = pid; army.status = '橋頭堡を確保';
    if (inv) { inv.status = 'landed'; inv.landedDay = FrontCommand.day(); }
    const sid = MapRenderer.stateOf(pid); const st = MapRenderer.states[sid];
    const port = st && st.b?.naval_base > 0 && st.owner === FrontCommand.s().country;
    FrontCommand.logLine('🏖️ ' + army.name + ' が ' + (st?.name || sid) + ' に橋頭堡を確保' + (port ? ' — 港を獲得、通常補給が可能' : ' — 隣接する港を占領するか、輸送船で増援を送ってください'));
    GameUI.notify('🏖️ 橋頭堡を確保: ' + (st?.name || sid), 'success');
    // 上陸後は防衛前線に移行
    const s = FrontCommand.s(); const enemy = [...(MapRenderer.provNeighbors.get(pid) || [])].map(n => MapRenderer.ownerOf(n)).find(o => s.atWar.includes(o));
    if (enemy) { army.frontEnemy = enemy; OffensivePlanner.updateFrontline(army); }
    MapRenderer.invalidateModes?.(); FrontCommand.render();
  }
  /** 橋頭堡へ輸送船で増援 (未所属の予備師団を送り込む) */
  static reinforceBridgehead(armyId) {
    const army = BattlePlanManager.armies.find(a => a.id === armyId); if (!army || !army.bridgehead) return;
    const s = FrontCommand.s(); const reserves = s.strategy.reserves || []; if (!reserves.length) { GameUI.notify('未所属の予備師団がありません (師団を配属画面で未所属に戻してください)。', 'alert'); return; }
    const n = Math.min(reserves.length, Math.max(0, FrontCommand.invasionLimit() - 0), FrontCommand.convoyStock());
    if (n < 1) { GameUI.notify('🚢 輸送船が不足しています。', 'alert'); return; }
    const sup = FrontCommand.routeSuperiority(army.invasion?.route || []); if (sup.min < 50) { GameUI.notify('🌊 海路の制海権が 50% 未満のため増援を送れません。', 'alert'); return; }
    const moved = reserves.splice(0, n); FrontCommand.takeConvoys(n);
    const c = MapRenderer.provCentroid.get(Number(army.bridgehead));
    moved.forEach((d, i) => { d.pid = army.bridgehead; if (c) { d.x = c[0] + (i % 5 - 2) * 3; d.y = c[1] + (Math.floor(i / 5) % 5 - 2) * 3; } d.org = Math.min(d.maxOrg || 60, d.org || 0); });
    army.divisions.push(...moved); if (army.invasion) army.invasion.convoys += n;
    FrontCommand.logLine('🚢 ' + army.name + ' の橋頭堡へ増援 ' + n + ' 師団を海上輸送 (輸送船 ' + n + ')');
    GameUI.notify('🚢 増援 ' + n + ' 師団を橋頭堡へ送りました', 'success');
    ArmyRoster.render(); FrontCommand.render();
  }

  // ==========================================================
  // 毎日
  // ==========================================================
  static onTick() {
    if (!MapRenderer.ready || !FrontCommand.data()) return;
    const day = FrontCommand.day(); const d = FrontCommand.data(); if (d.lastDay === day) return; d.lastDay = day;
    BattlePlanManager.armies.forEach(a => {
      if (a.invasion) FrontCommand.invasionTick(a);
      // 指揮官の組織率回復特性 / 死守の塹壕
      const m = FrontCommand.modifiers(a); if (m.orgRegen) a.divisions.forEach(dv => { dv.org = Math.min(dv.maxOrg || 60, dv.org + m.orgRegen); });
      if (a.holdOrder) a.entrench = Math.min(10, (a.entrench || 0) + 1); else a.entrench = 0;
      // 包囲ポケットの自軍師団: 補給切れペナルティ
      a.divisions.forEach(dv => { const p = Number(dv.pid || a.positionPid); if (p && MapRenderer.ownerOf(p) !== FrontCommand.s().country && !a.invasion) dv.org = Math.max(0, dv.org - 1); });
    });
    FrontCommand.refreshFronts();
    if (day % 3 === 0) FrontCommand.recomputeEncirclement();
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('command')) FrontCommand.render();
  }

  // ==========================================================
  // 描画
  // ==========================================================
  static drawUnder(ctx, w2s) {
    const d = FrontCommand.data(); if (!d) return;
    // 包囲ポケット: 赤の斜線マーカー
    const keys = Object.keys(d.encircled); if (keys.length) {
      ctx.save(); ctx.strokeStyle = 'rgba(255,80,80,0.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      keys.forEach(p => { const c = MapRenderer.provCentroid.get(Number(p)); if (!c) return; const s = w2s(c[0], c[1]); const r = 7 * MapRenderer.cam.scale; ctx.beginPath(); ctx.moveTo(s[0] - r, s[1] + r); ctx.lineTo(s[0] + r, s[1] - r); ctx.moveTo(s[0] - r, s[1] - r); ctx.lineTo(s[0] + r, s[1] + r); ctx.stroke(); });
      ctx.restore();
    }
  }
  static drawOver(ctx, w2s) {
    BattlePlanManager.armies.forEach(a => {
      const inv = a.invasion; if (!inv) return;
      ctx.save();
      if (inv.originPid) { const c = MapRenderer.provCentroid.get(inv.originPid); if (c) { const s = w2s(c[0], c[1]); ctx.fillStyle = '#5ab0ff'; ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('⚓', s[0] - 5, s[1] + 4); } }
      if (inv.route && inv.route.length) {
        const pts = [MapRenderer.provCentroid.get(inv.originPid), ...inv.route.map(p => MapRenderer.provCentroid.get(p)), MapRenderer.provCentroid.get(inv.targetPid)].filter(Boolean);
        ctx.strokeStyle = inv.status === 'sailing' ? 'rgba(255,200,80,0.95)' : inv.status === 'ready' ? 'rgba(120,220,255,0.95)' : 'rgba(120,180,255,0.8)'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]);
        ctx.beginPath(); pts.forEach((p, i) => { const s = w2s(p[0], p[1]); if (i === 0) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]); }); ctx.stroke(); ctx.setLineDash([]);
        const last = pts[pts.length - 1], prev = pts[pts.length - 2] || last; const e = w2s(last[0], last[1]), p0 = w2s(prev[0], prev[1]); const ang = Math.atan2(e[1] - p0[1], e[0] - p0[0]);
        ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(e[0] - 12 * Math.cos(ang - 0.4), e[1] - 12 * Math.sin(ang - 0.4)); ctx.lineTo(e[0] - 12 * Math.cos(ang + 0.4), e[1] - 12 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
        // 準備バー
        const mid = pts[Math.floor(pts.length / 2)]; const ms = w2s(mid[0], mid[1]); const pct = inv.status === 'sailing' ? inv.progress : inv.prepNeeded ? Math.min(1, inv.prep / inv.prepNeeded) : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(ms[0] - 26, ms[1] - 16, 52, 8); ctx.fillStyle = inv.status === 'sailing' ? '#ffc850' : '#5ad0ff'; ctx.fillRect(ms[0] - 25, ms[1] - 15, 50 * pct, 6);
        ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.fillText(inv.status === 'sailing' ? '🚢 航海中' : inv.status === 'ready' ? '準備完了' : inv.status === 'landed' ? '🏖️ 橋頭堡' : '準備 ' + Math.round(pct * 100) + '%', ms[0] - 24, ms[1] - 20);
      }
      if (inv.status === 'sailing' && a.seaPos) { const s = w2s(a.seaPos[0], a.seaPos[1]); ctx.fillStyle = '#ffc850'; ctx.beginPath(); ctx.arc(s[0], s[1], 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#222'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(String(a.divisions.length), s[0] - 3, s[1] + 4); }
      ctx.restore();
    });
    // 死守中の軍: 盾マーク
    BattlePlanManager.armies.forEach(a => { if (!a.holdOrder || !a.positionPid) return; const c = MapRenderer.provCentroid.get(Number(a.positionPid)); if (!c) return; const s = w2s(c[0], c[1]); ctx.font = '12px sans-serif'; ctx.fillText('🛡️', s[0] + 8, s[1] - 8); });
  }

  // ==========================================================
  // UI
  // ==========================================================
  /** 陸軍パネルに追加ボタン */
  static decoratePanel() {
    const el = document.getElementById('army-panel'); if (!el || !el.querySelector) return; const tools = el.querySelector('.army-tools'); if (!tools || BattlePlanManager.activeForce !== 'army') return;
    const a = BattlePlanManager.selectedArmy();
    const span = document.createElement('span'); span.className = 'fc-tools';
    span.innerHTML = '<button class="army-btn" onclick="FrontCommand.beginInvasionPlan()" ' + (!a || a.executing ? 'disabled' : '') + '>⚓ 上陸計画</button>' +
      (a && a.invasion ? '<button class="army-btn" onclick="FrontCommand.cancelInvasion(' + a.id + ')">✕ 上陸取消</button>' : '') +
      '<button class="army-btn" onclick="FrontCommand.holdArmy(' + (a ? a.id : 0) + ')" ' + (!a ? 'disabled' : '') + '>' + (a && a.holdOrder ? '🛡️ 死守中' : '🛡️ 死守') + '</button>' +
      '<button class="army-btn" onclick="WindowManager.open(\'command\');FrontCommand.render()">🎖️ 司令部</button>' +
      (a ? '<small class="fc-status">' + FrontCommand.esc(a.status || '待機') + (a.invasion ? ' ／ 🌊 ' + FrontCommand.invasionLabel(a.invasion) : '') + ' ／ 計画 ' + (typeof PlanningBonus !== 'undefined' ? PlanningBonus.label(a) : '') + '</small>' : '');
    try { const first = tools.querySelector('span'); if (first && tools.insertBefore) tools.insertBefore(span, first); else tools.appendChild(span); } catch (e) { /* fake DOM */ }
  }
  static invasionLabel(inv) { return { pick_port: '出発港を左クリック', origin: '敵海岸を右クリック', preparing: '準備 ' + Math.round(inv.prep / Math.max(1, inv.prepNeeded) * 100) + '%', ready: '準備完了 ▶ 作戦実行', sailing: '航海中 ' + Math.round(inv.progress * 100) + '%', assault: '強襲上陸中', landed: '橋頭堡', failed: '上陸失敗' }[inv.status] || inv.status; }
  static render() {
    const el = document.getElementById('command-content'); if (!el) return; const d = FrontCommand.data(); if (!d) return;
    const armies = BattlePlanManager.armies; const grouped = new Set(d.groups.flatMap(g => g.armyIds));
    const armyCard = (a) => {
      const m = FrontCommand.modifiers(a); const traits = FrontCommand.traitsOf(a.general); const over = a.divisions.length > FrontCommand.DIV_LIMIT;
      const inv = a.invasion; const checks = inv ? FrontCommand.invasionChecks(a) : [];
      return '<div class="fc-army' + (a.id === BattlePlanManager.selectedArmyId ? ' selected' : '') + '" onclick="BattlePlanManager.selectArmy(' + a.id + ');FrontCommand.render()">' +
        '<div class="fc-army-head"><span class="fc-portrait">' + (typeof GameTools !== 'undefined' ? GameTools.portrait(GameTools.card(a.general?.id, FrontCommand.s().country), a.general?.name) : '') + '</span><div><b>' + FrontCommand.esc(a.name) + '</b><small>将軍: ' + (a.general ? FrontCommand.esc(a.general.name) + ' (' + a.general.rank + ')' : '未任命') + '</small><small>' + traits.map(t => t.icon + t.name).join(' ') + '</small></div>' +
        '<span class="fc-badge' + (over ? ' over' : '') + '">' + a.divisions.length + '/' + FrontCommand.DIV_LIMIT + ' 師団</span></div>' +
        '<div class="fc-army-stats"><span>攻撃 +' + Math.round(m.attack * 100) + '%</span><span>防御 +' + Math.round(m.defense * 100) + '%</span><span>計画速度 +' + Math.round(m.planningSpeed * 100) + '%</span><span>計画準備 ' + (typeof PlanningBonus !== 'undefined' ? PlanningBonus.label(a) : '') + '</span><span>' + FrontCommand.esc(a.status || '待機') + (a.executing ? ' ▶' : '') + (a.holdOrder ? ' 🛡️' : '') + '</span></div>' +
        (inv ? '<div class="fc-inv"><b>🌊 強襲上陸: ' + FrontCommand.invasionLabel(inv) + '</b><ul>' + checks.map(c => '<li class="' + (c.ok ? 'ok' : 'ng') + '">' + (c.ok ? '✅' : '❌') + ' ' + FrontCommand.esc(c.text) + '</li>').join('') + '</ul>' +
          (inv.status === 'ready' ? '<button class="army-btn" onclick="event.stopPropagation();FrontCommand.launchInvasion(' + a.id + ')">▶ 上陸作戦を実行</button>' : '') + (inv.status === 'landed' ? '<button class="army-btn" onclick="event.stopPropagation();FrontCommand.reinforceBridgehead(' + a.id + ')">🚢 橋頭堡へ増援 (予備 ' + (FrontCommand.s().strategy.reserves || []).length + ')</button>' : '') + '<button class="army-btn abort" onclick="event.stopPropagation();FrontCommand.cancelInvasion(' + a.id + ')">✕ 取消</button></div>' : '') +
        '<div class="fc-army-actions"><button class="army-btn" onclick="event.stopPropagation();BattlePlanManager.assignGeneral(' + a.id + ')">🎖️ 将軍</button>' +
        '<button class="army-btn" onclick="event.stopPropagation();BattlePlanManager.' + (a.executing ? 'abort' : 'execute') + '(' + a.id + ');FrontCommand.render()">' + (a.executing ? '⏸ 停止' : '▶ 作戦実行') + '</button>' +
        '<button class="army-btn" onclick="event.stopPropagation();FrontCommand.holdArmy(' + a.id + ')">' + (a.holdOrder ? '🛡️ 死守解除' : '🛡️ 死守') + '</button>' +
        '<button class="army-btn" onclick="event.stopPropagation();FrontCommand.beginInvasionPlan(' + a.id + ')">⚓ 上陸計画</button>' +
        '<select onclick="event.stopPropagation()" onchange="FrontCommand.attach(' + a.id + ', this.value)"><option value="">軍集団に所属…</option>' + d.groups.map(g => '<option value="' + g.id + '"' + (g.armyIds.includes(a.id) ? ' selected' : '') + '>' + FrontCommand.esc(g.name) + '</option>').join('') + '</select></div></div>';
    };
    let html = '<div class="fc-root"><div class="fc-head"><div><h3>🎖️ 司令部 <small>ARMY GROUP COMMAND</small></h3><p>元帥 (軍集団司令官) → 将軍 (軍・最大 ' + FrontCommand.DIV_LIMIT + ' 師団) の階層。特性バフは配下全師団の戦闘計算に即時反映。計画準備度は待機中 +2%/日 (最大 +' + Math.round(FrontCommand.PLANNING_CAP * 100) + '%)。</p></div>' +
      '<div class="fc-kpis"><span>包囲中の敵プロヴィンス <b>' + FrontCommand.encircledCount() + '</b></span><span>輸送船 <b>' + FrontCommand.convoyStock() + '</b></span><span>上陸上限 <b>' + FrontCommand.invasionLimit() + '</b> 師団</span><span>占領 <b>' + (d.captured || 0) + '</b></span></div></div>' +
      '<div class="fc-help">🖱️ 左クリック: 師団を選択 ／ 右クリック: 国境 → 前線を自動生成 ／ Shift+右ドラッグ: 攻撃線 ／ ⚓ 上陸計画: 港を左クリック → 敵海岸を右クリック → 準備 100% → ▶ 作戦実行</div>' +
      '<div class="fc-bar"><button class="army-btn" onclick="FrontCommand.createGroup()">＋ 軍集団司令部を設置</button><button class="army-btn" onclick="BattlePlanManager.addArmy();FrontCommand.render()">＋ 軍を新設</button></div>';
    d.groups.forEach(g => {
      const gArmies = g.armyIds.map(id => armies.find(a => a.id === id)).filter(Boolean); const traits = FrontCommand.traitsOf(g.marshal);
      html += '<div class="fc-group"><div class="fc-group-head"><span class="fc-portrait big">' + (typeof GameTools !== 'undefined' ? GameTools.portrait(GameTools.card(g.marshal?.id, FrontCommand.s().country), g.marshal?.name) : '') + '</span><div><b onclick="FrontCommand.renameGroup(' + g.id + ')" title="クリックで改名">' + FrontCommand.esc(g.name) + '</b><small>元帥: ' + (g.marshal ? FrontCommand.esc(g.marshal.name) + ' (' + g.marshal.rank + ')' : '未任命') + '</small><small>' + (traits.length ? traits.map(t => t.icon + t.name).join(' ') : '') + '</small></div>' +
        '<div class="fc-group-cmds"><button class="army-btn" onclick="FrontCommand.assignMarshal(' + g.id + ')">🎖️ 元帥を任命</button><button class="army-btn go" onclick="FrontCommand.groupCommand(' + g.id + ',\'execute\')">▶ 全軍 作戦実行</button><button class="army-btn" onclick="FrontCommand.groupCommand(' + g.id + ',\'stop\')">⏸ 計画停止</button><button class="army-btn" onclick="FrontCommand.groupCommand(' + g.id + ',\'hold\')">🛡️ 全員その場で死守</button><button class="army-btn abort" onclick="FrontCommand.disbandGroup(' + g.id + ')">解散</button></div></div>' +
        '<div class="fc-armies">' + (gArmies.length ? gArmies.map(armyCard).join('') : '<p class="fc-help">配下の軍がありません。各軍のカードから所属させてください。</p>') + '</div></div>';
    });
    const free = armies.filter(a => !grouped.has(a.id));
    html += '<div class="fc-group plain"><div class="fc-group-head"><div><b>独立軍 (軍集団未所属)</b><small>' + free.length + ' 軍</small></div></div><div class="fc-armies">' + (free.length ? free.map(armyCard).join('') : '<p class="fc-help">なし</p>') + '</div></div>';
    html += '<div class="fc-group plain"><div class="fc-group-head"><div><b>📜 作戦記録</b></div></div><div class="fc-log">' + (d.log.length ? d.log.slice(0, 25).map(e => '<div><small>Day ' + e.day + '</small> ' + FrontCommand.esc(e.text) + '</div>').join('') : '<span class="fc-help">記録なし</span>') + '</div></div></div>';
    el.innerHTML = html;
  }
}
if (typeof window !== 'undefined') window.FrontCommand = FrontCommand;
