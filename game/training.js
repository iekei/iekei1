/* ==========================================================
 * training.js — TrainingManager: 徴兵・訓練システム
 * ----------------------------------------------------------
 * - 師団は「徴兵 → 訓練」を経ないと増えない
 * - 徴兵には人的資源 (トップバー表示) と兵器 (師団編成で必要量が変動) が必要
 * - 兵員・兵器が集まり次第、訓練が開始される (2〜5ヶ月: 師団編成で変動)
 * - 兵器の生産は軍需工場が行うが、資源 (鋼鉄・タングステン・クロム) が
 *   足りないと生産できない
 * ========================================================== */
'use strict';

class TrainingManager {
  static nextId = 1;
  static targetArmyId = null;
  static trainingStateId = null;

  // 大隊1個あたりの装備ロードアウト。徴兵・補充で同じ表を使う。
  static BATTALION_EQUIPMENT = {
    infantry: { infantry: 100 }, engineer: { infantry: 100 }, recon: { infantry: 100 },
    ranger: { infantry: 100 }, mountaineer: { infantry: 100 }, paratrooper: { infantry: 100 }, marine: { infantry: 100 },
    anti_tank: { artillery: 150 }, anti_air: { artillery: 150 }, artillery: { artillery: 200 },
    armor: { tank: 350 }, land_battleship: { tank: 380 },
    jet_fighter: { fighter: 300 }, v2_rocket: { artillery: 320 }, nuke_battalion: { infantry: 400 }
  };

  static init() {
    const gs = CoreEngine.gameState;
    if (!Array.isArray(gs.recruitQueue)) gs.recruitQueue = [];
    TrainingManager.queue = gs.recruitQueue;
    CoreEngine.registerTickCallback(() => TrainingManager.onTick());
    TrainingManager.renderQueue();
    CoreEngine.log('📋 徴兵・訓練システム: 師団は徴兵と訓練でのみ増えます');
  }

  static availableTrainingStates() {
    const player=CoreEngine.gameState.country;
    return Object.entries(MapRenderer.states||{}).filter(([,state])=>
      state.provinces?.some(pid=>OffensivePlanner.isLand(pid)&&MapRenderer.ownerOf(pid)===player));
  }

  static trainingProvince(stateId) {
    const state=MapRenderer.states?.[stateId],player=CoreEngine.gameState.country;
    if(!state) return null;
    const owned=state.provinces.filter(pid=>OffensivePlanner.isLand(pid)&&MapRenderer.ownerOf(pid)===player);
    if(!owned.length) return null;
    const victoryPoint=Object.entries(state.vp||{})
      .map(([pid,value])=>[Number(pid),Number(value)||0])
      .filter(([pid])=>owned.includes(pid))
      .sort((a,b)=>b[1]-a[1])[0]?.[0];
    return victoryPoint||owned[0];
  }

  static fallbackTrainingProvince() {
    const capital=ArmyRoster.capitalProvince();
    if(capital&&MapRenderer.ownerOf(capital)===CoreEngine.gameState.country) return capital;
    const capitalCenter=capital&&MapRenderer.provCentroid.get(Number(capital));
    return OffensivePlanner.nearest(capitalCenter||[MapRenderer.mapW/2,MapRenderer.mapH/2],
      pid=>MapRenderer.ownerOf(pid)===CoreEngine.gameState.country);
  }

  // ---- 現在の師団テンプレート (DivisionDesigner の5×5グリッド) から必要量を算出 ----
  static requirements() {
    const comp = {};
    let count = 0;
    DivisionDesigner.grid.forEach(row => row.forEach(c => {
      if (c) { comp[c.id] = (comp[c.id] || 0) + 1; count++; }
    }));
    if (!count) return null;
    const equipmentNeeds = TrainingManager.equipmentNeedsFor(comp);
    const equipNeed = Object.values(equipmentNeeds).reduce((sum, amount) => sum + amount, 0);
    // 訓練期間: 基礎2ヶ月 (60日) — 機甲・砲兵・特別大隊が多いほど長い (最大5ヶ月)
    const trainDays = Math.min(150, Math.round(60 +
      (comp.armor || 0) * 9 + (comp.artillery || 0) * 5 +
      (comp.jet_fighter || 0) * 7 + (comp.v2_rocket || 0) * 7 +
      (comp.nuke_battalion || 0) * 10 + (comp.land_battleship || 0) * 8));
    return { comp, count, equipNeed, equipmentNeeds, trainDays, manpowerNeed: count * 10000 };
  }

  static equipmentNeedsFor(comp, missingPercent = 100) {
    const needs = {};
    Object.entries(comp || {}).forEach(([id, count]) => {
      const loadout = TrainingManager.BATTALION_EQUIPMENT[id] || { infantry: 100 };
      Object.entries(loadout).forEach(([type, amount]) => {
        needs[type] = (needs[type] || 0) + amount * count * missingPercent / 100;
      });
    });
    return needs;
  }

  // ---- 徴兵命令を作成 (兵員・兵器が集まり次第訓練開始) ----
  static recruit() {
    const s = CoreEngine.gameState;
    const req = TrainingManager.requirements();
    if (!req) { GameUI.notify('先に師団編成エディターで大隊を配置してください。', 'alert'); return; }
    if (['ranger','mountaineer','paratrooper','marine'].some(k => req.comp[k]) && ArmyRoster.specialCount() >= 5) { GameUI.notify('特殊部隊は全軍で5師団までです（訓練中を含みます）。', 'alert'); return; }
    if (TrainingManager.queue.length >= 10) { GameUI.notify('徴兵キューが満杯です。', 'alert'); return; }
    const selectedState=document.getElementById('recruit-training-state')?.value||
      TrainingManager.trainingStateId||MapRenderer.stateOf(ArmyRoster.capitalProvince())||
      TrainingManager.availableTrainingStates()[0]?.[0];
    const trainingPid=TrainingManager.trainingProvince(String(selectedState||''));
    if(!trainingPid) {GameUI.notify('自国が支配する訓練地点を選択してください。','alert');return;}
    const order = {
      id: TrainingManager.nextId++,
      name: '新編師団 #' + TrainingManager.nextId,
      comp: req.comp, count: req.count,
      manpowerNeed: req.manpowerNeed, equipmentNeed: req.equipNeed, equipmentNeeds: req.equipmentNeeds,
      trainDays: req.trainDays,
      phase: 'gathering',   // gathering (資源待ち) → training (訓練中)
      progress: 0,
      targetArmyId: TrainingManager.targetArmyId,
      trainingStateId: String(selectedState)
    };
    TrainingManager.queue.push(order);
    CoreEngine.log('📝 ' + order.name + 'を徴兵リストに追加 (兵員 ' + (req.manpowerNeed / 10000) + '万 / 兵器 ' + req.equipNeed + ' / 訓練約' + req.trainDays + '日)');
    GameUI.notify('📝 徴兵リスト追加: ' + order.name + ' — 兵員・兵器が揃い次第訓練開始', 'success');
    TrainingManager.renderQueue();
    MultiplayerManager.broadcast({ type: 'recruit_add', order: order });
  }

  static cancel(orderId) {
    TrainingManager.queue = TrainingManager.queue.filter(o => o.id !== orderId);
    CoreEngine.gameState.recruitQueue = TrainingManager.queue;
    CoreEngine.log('徴兵命令を取り消しました。');
    TrainingManager.renderQueue();
  }

  // ---- 毎ゲーム日: 兵器生産 (資源ゲート) + 徴兵キュー処理 ----
  static onTick() {
    const s = CoreEngine.gameState;
    if (s.recruitQueue !== TrainingManager.queue) TrainingManager.queue = s.recruitQueue;  // ロード後の再接続
    TrainingManager.tickProduction();
    let changed = TrainingManager.reinforce();
    TrainingManager.queue.forEach(o => {
      if (o.phase === 'gathering') {
        // 兵員 (人的資源) と兵器が揃い次第訓練開始 — ここで両方を消費する
        if (s.manpower >= o.manpowerNeed && ProductionManager.canConsume(o.equipmentNeeds || { infantry: o.equipmentNeed })) {
          s.manpower -= o.manpowerNeed;
          ProductionManager.consume(o.equipmentNeeds || { infantry: o.equipmentNeed });
          o.phase = 'training';
          o.progress = 0;
          CoreEngine.log('🎓 ' + o.name + ' — 兵員・兵器が揃い訓練開始 (約' + o.trainDays + '日)');
          GameUI.notify('🎓 ' + o.name + 'の訓練を開始 (' + o.trainDays + '日)', 'success');
          changed = true;
        }
      } else {
        o.progress++;
        if (o.progress >= o.trainDays) {
          o.done = true;
          s.divisions = (s.divisions || 0) + 1;
          const a = (BattlePlanManager.armies || []).find(x => x.id === o.targetArmyId);
          const spawnPid=TrainingManager.trainingProvince(o.trainingStateId)||
            TrainingManager.fallbackTrainingProvince();
          const spawnCenter=MapRenderer.provCentroid.get(Number(spawnPid))||[0,0];
          const division = {
            id: s.strategy.nextDivisionId++, name: o.name, comp: o.comp,
            org: 30, maxOrg: 60, equipmentStrength: 100,
            equipmentNeeds: TrainingManager.equipmentNeedsFor(o.comp), type: Object.keys(o.comp)[0],
            x: a?.base[0] ?? spawnCenter[0], y: a?.base[1] ?? spawnCenter[1],
            pid: a?.positionPid || Number(spawnPid)
          };
          if (a && !a.executing) a.divisions.push(division);
          else s.strategy.reserves.push(division);
          BattlePlanManager.renderPanel();
          CoreEngine.log('🎖️ ' + o.name + 'の訓練完了 — 師団数 ' + s.divisions);
          GameUI.notify('🎖️ ' + o.name + 'の訓練完了！ 師団が編入されました', 'success');
          changed = true;
        }
      }
    });
    TrainingManager.queue = TrainingManager.queue.filter(o => !o.done);
    CoreEngine.gameState.recruitQueue = TrainingManager.queue;   // セーブ/ロード同期
    TrainingManager.renderQueue();
    if (changed) CoreEngine.renderStats();
  }

  // ---- 兵器の生産: 軍需工場が資源を消費して装備を生産 (資源不足では生産不可) ----
  static tickProduction() {
    ProductionManager.tick();
  }

  static reinforce() {
    if (typeof ArmyRoster === 'undefined' || typeof ProductionManager === 'undefined') return false;
    const stock = ProductionManager.account(CoreEngine.gameState.country).stock;
    let changed = false;
    ArmyRoster.all().forEach(division => {
      const strength = Number.isFinite(division.equipmentStrength) ? division.equipmentStrength : 100;
      if (strength >= 100 || !division.comp) return;
      const missing = 100 - strength;
      const fullNeeds = TrainingManager.equipmentNeedsFor(division.comp, missing);
      const ratio = Math.min(1, ...Object.entries(fullNeeds).map(([type, amount]) =>
        amount > 0 ? (stock[type] || 0) / amount : 1));
      if (!(ratio > 0)) return;
      const consumed = Object.fromEntries(Object.entries(fullNeeds).map(([type, amount]) => [type, amount * ratio]));
      if (!ProductionManager.consume(consumed)) return;
      division.equipmentStrength = Math.min(100, strength + missing * ratio);
      division.equipmentNeeds = TrainingManager.equipmentNeedsFor(division.comp);
      changed = true;
    });
    return changed;
  }

  // ---- 徴兵キューUI (師団編成ウィンドウ内) ----
  static renderQueue() {
    const el = document.getElementById('training-queue');
    if (!el) return;
    if (!Array.isArray(TrainingManager.queue)) TrainingManager.queue = [];
    const s = CoreEngine.gameState;
    let html = '<div class="sp-section"><h3>📋 徴兵・訓練キュー (装備在庫: ' + Math.floor(s.equipment || 0) + ' / 兵員: ' + Math.floor(s.manpower).toLocaleString() + ')</h3>';
    if (TrainingManager.queue.length === 0) {
      html += '<p style="font-size:12px;color:var(--text-secondary);">徴兵命令はありません。「この編成で徴兵」で師団を徴兵できます。</p>';
    }
    TrainingManager.queue.forEach(o => {
      html += '<div class="con-queue-item"><div class="cq-top"><span>' + (o.phase === 'gathering' ? '⏳ 資源待ち' : '🎓 訓練中') + ' — ' + o.name + ' (大隊' + o.count + ')</span>' +
        '<button class="army-btn abort" onclick="TrainingManager.cancel(' + o.id + ')">✕ 取消</button></div>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">訓練地点: ' +
        GameTools.escape(MapRenderer.states[o.trainingStateId]?.name||'指定州')+' — ' +
        (o.phase === 'gathering'
          ? '兵員 ' + Math.floor(s.manpower).toLocaleString() + ' / ' + Math.floor(o.manpowerNeed).toLocaleString() + ' — 兵器 ' + Math.floor(s.equipment || 0) + ' / ' + o.equipmentNeed
          : '訓練 ' + o.progress + ' / ' + o.trainDays + '日 (あと' + (o.trainDays - o.progress) + '日)') + '</div>' +
        '<div class="cq-progress"><div class="cq-progress-fill" style="width:' +
        (o.phase === 'gathering'
          ? Math.min(100, Math.min(s.manpower / o.manpowerNeed, (s.equipment || 0) / o.equipmentNeed) * 100)
          : (o.progress / o.trainDays * 100)) + '%"></div></div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }
}

window.TrainingManager = TrainingManager;
