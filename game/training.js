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
  static targetArmyId = null;   // 徴兵した師団の配備先軍集団 (null = 自動配備)

  // 大隊ごとの兵器消費量 (師団編成によって必要装備が変わる)
  static BATTALION_COST = {
    infantry: 100, engineer: 100, recon: 100,
    anti_tank: 150, anti_air: 150,
    artillery: 200,
    armor: 350,
    jet_fighter: 300, v2_rocket: 320, nuke_battalion: 400, land_battleship: 380
  };

  static init() {
    const gs = CoreEngine.gameState;
    if (!Array.isArray(gs.recruitQueue)) gs.recruitQueue = [];
    TrainingManager.queue = gs.recruitQueue;
    CoreEngine.registerTickCallback(() => TrainingManager.onTick());
    TrainingManager.renderQueue();
    CoreEngine.log('📋 徴兵・訓練システム: 師団は徴兵と訓練でのみ増えます');
  }

  // ---- 現在の師団テンプレート (DivisionDesigner の5×5グリッド) から必要量を算出 ----
  static requirements() {
    const comp = {};
    let count = 0;
    DivisionDesigner.grid.forEach(row => row.forEach(c => {
      if (c) { comp[c.id] = (comp[c.id] || 0) + 1; count++; }
    }));
    if (!count) return null;
    let equipNeed = 0;
    Object.entries(comp).forEach(([id, n]) => {
      equipNeed += (TrainingManager.BATTALION_COST[id] || 100) * n;
    });
    // 訓練期間: 基礎2ヶ月 (60日) — 機甲・砲兵・特別大隊が多いほど長い (最大5ヶ月)
    const trainDays = Math.min(150, Math.round(60 +
      (comp.armor || 0) * 9 + (comp.artillery || 0) * 5 +
      (comp.jet_fighter || 0) * 7 + (comp.v2_rocket || 0) * 7 +
      (comp.nuke_battalion || 0) * 10 + (comp.land_battleship || 0) * 8));
    return { comp, count, equipNeed, trainDays, manpowerNeed: count * 10000 };
  }

  // ---- 徴兵命令を作成 (兵員・兵器が集まり次第訓練開始) ----
  static recruit() {
    const s = CoreEngine.gameState;
    const req = TrainingManager.requirements();
    if (!req) { GameUI.notify('先に師団編成エディターで大隊を配置してください。', 'alert'); return; }
    if (TrainingManager.queue.length >= 10) { GameUI.notify('徴兵キューが満杯です。', 'alert'); return; }
    const order = {
      id: TrainingManager.nextId++,
      name: '新編師団 #' + TrainingManager.nextId,
      comp: req.comp, count: req.count,
      manpowerNeed: req.manpowerNeed, equipmentNeed: req.equipNeed,
      trainDays: req.trainDays,
      phase: 'gathering',   // gathering (資源待ち) → training (訓練中)
      progress: 0,
      targetArmyId: TrainingManager.targetArmyId   // 配備先軍集団
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
    let changed = false;
    TrainingManager.queue.forEach(o => {
      if (o.phase === 'gathering') {
        // 兵員 (人的資源) と兵器が揃い次第訓練開始 — ここで両方を消費する
        if (s.manpower >= o.manpowerNeed && (s.equipment || 0) >= o.equipmentNeed) {
          s.manpower -= o.manpowerNeed;
          s.equipment -= o.equipmentNeed;
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
          // 新師団を指定の軍集団に配属 (未指定なら最も少ない軍集団)
          const armies = BattlePlanManager.armies || [];
          if (armies.length) {
            let a;
            if (o.targetArmyId != null) {
              a = armies.find(x => x.id === o.targetArmyId);
            }
            if (!a) a = armies.reduce((m, x) => x.divisions.length < m.divisions.length ? x : m, armies[0]);
            a.divisions.push({
              id: s.divisions, org: 30, maxOrg: 60,
              x: a.base[0], y: a.base[1]
            });
          }
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
    const s = CoreEngine.gameState;
    const eco = typeof PoliticsManager !== 'undefined' ? PoliticsManager.currentLaw('economy') : null;
    const out = (eco ? eco.factoryOutput : 0);
    // 軍需工場1つあたり: 鋼鉄0.2 / タングステン0.08 / クロム0.04 を消費
    const steelNeed = s.militaryFactories * 0.2;
    const tungstenNeed = s.militaryFactories * 0.08;
    const chromiumNeed = s.militaryFactories * 0.04;
    const short = [];
    if ((s.resources.steel || 0) < steelNeed) short.push('鋼鉄');
    if ((s.resources.tungsten || 0) < tungstenNeed) short.push('タングステン');
    if ((s.resources.chromium || 0) < chromiumNeed) short.push('クロム');
    if (short.length) {
      // 資源が足りない → 兵器は生産できない
      if (!TrainingManager._shortNotified || Date.now() - TrainingManager._shortNotified > 60000) {
        TrainingManager._shortNotified = Date.now();
        GameUI.notify('⚠️ 資源不足 (' + short.join('・') + ') — 兵器の生産が停止中', 'alert');
        CoreEngine.log('⚠️ 資源不足のため兵器の生産が停止しています (' + short.join('・') + ')');
      }
      return;
    }
    s.resources.steel -= steelNeed;
    s.resources.tungsten -= tungstenNeed;
    s.resources.chromium -= chromiumNeed;
    s.equipment = (s.equipment || 0) + s.militaryFactories * 0.4 * (1 + out);
  }

  // ---- 徴兵キューUI (師団編成ウィンドウ内) ----
  static renderQueue() {
    const el = document.getElementById('training-queue');
    if (!el) return;
    const s = CoreEngine.gameState;
    let html = '<div class="sp-section"><h3>📋 徴兵・訓練キュー (装備在庫: ' + Math.floor(s.equipment || 0) + ' / 兵員: ' + Math.floor(s.manpower).toLocaleString() + ')</h3>';
    if (TrainingManager.queue.length === 0) {
      html += '<p style="font-size:12px;color:var(--text-secondary);">徴兵命令はありません。「この編成で徴兵」で師団を徴兵できます。</p>';
    }
    TrainingManager.queue.forEach(o => {
      html += '<div class="con-queue-item"><div class="cq-top"><span>' + (o.phase === 'gathering' ? '⏳ 資源待ち' : '🎓 訓練中') + ' — ' + o.name + ' (大隊' + o.count + ')</span>' +
        '<button class="army-btn abort" onclick="TrainingManager.cancel(' + o.id + ')">✕ 取消</button></div>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">' +
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
