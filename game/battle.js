/* ==========================================================
 * battle.js — BattleManager: 戦闘シミュレーション & マップ戦闘マーカー
 * ----------------------------------------------------------
 * - 戦闘中のプロビンスに丸マーカーを描画 (優勢=緑 / 均等=黄 / 劣勢=赤)
 * - ホバーでツールチップ: 交戦国・戦況・残り日数
 * - 勝敗確定時にプロビンス占領 / 逆占領を反映
 * ========================================================== */
'use strict';

class BattleManager {
  static battles = [];
  static nextId = 1;
  static hoverId = null;

  // 将軍カードの階級別攻勢ボーナス (軍集団に割り当てた将軍が戦闘に影響する)
  static GENERAL_BONUS = { SSR: 0.12, SR: 0.07, R: 0.03 };

  static COLORS = {
    advantage: '#4ac46a',     // 優勢 (緑)
    even: '#e0c040',          // 均等 (黄)
    disadvantage: '#e05555'   // 劣勢 (赤)
  };

  // ---- 戦闘開始: 陸軍の攻撃作戦 ----
  static startOffensive(army, targetPid, targetStateId) {
    const st = MapRenderer.states[targetStateId];
    const pos = MapRenderer.provCentroid.get(targetPid) ||
      MapRenderer.stateCenter.get(String(targetStateId)) || army.base.slice();
    const b = {
      id: BattleManager.nextId++,
      kind: 'offensive',
      provId: targetPid,
      stateId: targetStateId,
      x: pos[0], y: pos[1],
      attacker: CoreEngine.gameState.country,
      defender: (st && st.owner) || '???',
      attackerArmyId: army.id,
      // プレイヤー視点の優勢度 (-1 〜 +1)
      advantage: BattleManager.calcOffensiveAdvantage(army, st),
      progress: 0,
      totalDays: 0
    };
    // 優勢ほど短く終わる: 3〜13日
    b.totalDays = Math.max(3, Math.round(3 + (1 - Math.abs(b.advantage)) * 10));
    BattleManager.battles.push(b);
    CoreEngine.log('⚔️ 戦闘開始: ' + (st ? st.name : '州' + targetStateId) + ' — ' + b.attacker + ' vs ' + b.defender + ' (約' + b.totalDays + '日)');
    GameUI.notify('⚔️ 戦闘開始: ' + (st ? st.name : '') + ' (約' + b.totalDays + '日)', 'alert');
    MultiplayerManager.broadcast({ type: 'battle_start', battle: BattleManager.serialize(b) });
    return b;
  }

  // ---- 戦闘開始: 敵軍の侵攻 (防衛戦) ----
  static startDefense(enemyTag, stateId) {
    const st = MapRenderer.states[stateId];
    if (!st) return null;
    const pos = MapRenderer.stateCenter.get(String(stateId));
    if (!pos) return null;
    const b = {
      id: BattleManager.nextId++,
      kind: 'defense',
      provId: null,
      stateId: stateId,
      x: pos[0], y: pos[1],
      attacker: enemyTag,
      defender: CoreEngine.gameState.country,
      attackerArmyId: null,
      advantage: BattleManager.calcDefenseAdvantage(stateId),
      progress: 0,
      totalDays: 0
    };
    b.totalDays = Math.max(3, Math.round(3 + (1 - Math.abs(b.advantage)) * 10));
    BattleManager.battles.push(b);
    CoreEngine.log('🛡️ 防衛戦開始: ' + st.name + ' — ' + enemyTag + '軍が侵攻中！');
    GameUI.notify('🛡️ ' + st.name + 'が敵軍に攻められています！', 'alert');
    MultiplayerManager.broadcast({ type: 'battle_start', battle: BattleManager.serialize(b) });
    return b;
  }

  static calcOffensiveAdvantage(army, st) {
    // 攻撃側: 平均組織力 / 防御側: 基礎戦力 + 要塞 + 補給ボーナス
    const org = army.divisions.reduce((s, d) => s + d.org, 0) / Math.max(1, army.divisions.length);
    const defense = 50 + (st && st.b ? (st.b.fort || 0) * 8 : 0) + (st && st.supply ? st.supply : 0) * 1.5;
    let adv = (org - defense) / 100;
    // 将軍カードの攻勢ボーナス (軍集団に割り当てられた将軍の階級で決まる)
    if (army.general && army.general.rank) adv += (BattleManager.GENERAL_BONUS[army.general.rank] || 0);
    // 海軍/空軍の行動支援: 周辺で任務実行中の部隊が戦闘を支援する
    adv += BattleManager.supportBonus(st);
    return Math.max(-1, Math.min(1, adv));
  }

  // ---- 海軍/空軍の戦闘支援ボーナス (行動が陸戦に影響する) ----
  static supportBonus(st) {
    let bonus = 0;
    if (!MapRenderer.ready || !st) return 0;
    const sid = null;
    const centers = [];
    const stateCenter = MapRenderer.stateCenter.get(String(Object.keys(MapRenderer.states).find(k => MapRenderer.states[k] === st)) || '');
    [...(BattlePlanManager.navy || []), ...(BattlePlanManager.air || [])].forEach(u => {
      if (!u.executing || !u.zone) return;
      // 任務区域の海/空域と州の距離が近い (射程内) なら支援
      const d = stateCenter ? Math.hypot(u.zone.x - stateCenter[0], u.zone.y - stateCenter[1]) : Infinity;
      if (d > 220) return;
      if (u.type === 'air') {
        if (u.mission === 'ground') bonus += 0.15;        // 対地攻撃 = 近接航空支援
        else if (u.mission === 'air_sup') bonus += 0.05;  // 制空 = 航空優勢
        else if (u.mission === 'strategic') bonus += 0.05;
      } else {
        if (u.mission === 'strike' || u.mission === 'shore') bonus += 0.10;  // 艦砲射撃/海上攻撃
      }
    });
    return Math.min(0.3, bonus);
  }

  static calcDefenseAdvantage(stateId) {
    // 防衛側 (プレイヤー): 平均組織力 + 防衛ボーナス / 敵: 汎用戦力
    const allDivs = BattlePlanManager.armies.reduce((a, army) => a.concat(army.divisions), []);
    const org = allDivs.length ? allDivs.reduce((t, d) => t + d.org, 0) / allDivs.length : 40;
    const defense = org + 25; // 地形・要塞相当の防衛ボーナス
    // 割り当て済み将軍の防衛指揮ボーナス (最大の階級ボーナスの半分)
    const genBonus = Math.max(0, ...(BattlePlanManager.armies || []).map(a => a.general ? (BattleManager.GENERAL_BONUS[a.general.rank] || 0) : 0));
    const enemyPower = 60 + Math.random() * 20;
    return Math.max(-1, Math.min(1, (defense + genBonus * 50 - enemyPower) / 100));
  }

  static serialize(b) {
    return { id: b.id, kind: b.kind, stateId: b.stateId, provId: b.provId, x: b.x, y: b.y,
      attacker: b.attacker, defender: b.defender, advantage: b.advantage,
      progress: b.progress, totalDays: b.totalDays, attackerArmyId: b.attackerArmyId };
  }

  static deserialize(data) {
    if (BattleManager.battles.some(b => b.id === data.id)) return;
    BattleManager.battles.push(Object.assign({}, data));
    BattleManager.nextId = Math.max(BattleManager.nextId, data.id + 1);
  }

  // ---- 毎ゲーム日 (Tick) の戦闘進行 ----
  static onTick() {
    const resolved = [];
    BattleManager.battles.forEach(b => {
      b.progress += 1 / b.totalDays;
      // 戦況の揺らぎ (ダイスロール)
      b.advantage = Math.max(-1, Math.min(1, b.advantage + (Math.random() - 0.5) * 0.06));
      if (b.progress >= 1) resolved.push(b);
    });
    resolved.forEach(b => BattleManager.resolve(b));
  }

  // ---- 戦闘結果の確定 → 占領 / 逆占領 ----
  static resolve(b) {
    const s = CoreEngine.gameState;
    BattleManager.battles = BattleManager.battles.filter(x => x.id !== b.id);
    const st = MapRenderer.states[b.stateId];
    const name = st ? st.name : '州' + b.stateId;
    const army = b.attackerArmyId ? BattlePlanManager.armies.find(a => a.id === b.attackerArmyId) : null;

    // 師団に損害
    if (army) {
      army.divisions.forEach(d => { d.org = Math.max(0, d.org - 12); });
      army.executing = false;
      army.progress = 0;
    }

    if (b.advantage >= 0.1) {
      // 優勢で終了 → 戦闘地のプロビンスを占領
      if (b.kind === 'offensive') {
        if (MapRenderer.captureState(b.stateId, b.attacker)) {
          s.manpower = Math.max(0, (s.manpower || 0) - 5000 * (army ? army.divisions.length : 1));
          s.warSupport = Math.min(100, s.warSupport + 3);
          CoreEngine.log('🏆 ' + name + 'を占領しました！ (' + b.attacker + ' 勝利)');
          GameUI.notify('🏆 ' + name + ' を占領！', 'success');
          if (typeof ConstructionManager !== 'undefined') ConstructionManager.selectState(b.stateId);
        }
        // ---- 攻撃チェーン: 勝つと戦線が広がり、次の州へ段階的に進撃する ----
        if (army && Array.isArray(army.chain) && army.chain.length > 0) {
          army.chain = army.chain.filter(sid => sid !== b.stateId);
          // 組織力が尽きたら進撃停止 (待機して回復)
          if (army.chain.length === 0 || army.divisions.every(d => d.org <= 10)) {
            if (army.chain.length === 0) {
              army.executing = false;
              army.chain = null;
              CoreEngine.log('🎯 ' + army.name + 'の攻撃作戦を完了: 目標地点に到達しました！');
              GameUI.notify('🎯 ' + army.name + ': 作戦目標達成！', 'success');
            } else {
              army.executing = false;
              CoreEngine.log('⏸️ ' + army.name + ': 組織力回復のため進撃を一時停止 (再度作戦開始で再進撃)');
              GameUI.notify('⏸️ 組織力が低下 — 一時停止中 (再開で次の州へ)', 'alert');
            }
          } else {
            const nextSid = army.chain[0];
            const nextSt = MapRenderer.states[nextSid];
            if (nextSt && CoreEngine.gameState.atWar.includes(nextSt.owner)) {
              army.progress = 0;
              BattleManager.startOffensive(army, (nextSt.provinces && nextSt.provinces[0]) || b.provId, nextSid);
              CoreEngine.log('➡️ 戦線が広がりました: ' + army.name + 'が ' + (nextSt.name || '州' + nextSid) + 'へ進撃中 (' + army.chain.length + '州残り)');
              return;   // チェーン進撃中は後続処理をスキップ
            }
          }
        } else if (army) {
          army.executing = false;
        }
      } else {
        CoreEngine.log('🛡️ ' + name + 'の防衛に成功！敵軍を撃退しました。');
        GameUI.notify('🛡️ ' + name + ' 防衛成功！', 'success');
        s.warSupport = Math.min(100, s.warSupport + 2);
      }
    } else if (b.advantage <= -0.1) {
      // 劣勢で終了 → 逆に占領される
      if (b.kind === 'offensive') {
        // 攻撃が失敗: チェーンを放棄して待機に戻る (戦線は広がらない)
        if (army) { army.chain = null; army.executing = false; }
        const loseSid = army ? BattleManager.nearestOwnState(army.base) : null;
        if (loseSid && MapRenderer.captureState(loseSid, b.defender)) {
          const lost = MapRenderer.states[loseSid];
          CoreEngine.log('💥 攻勢失敗 — ' + (lost ? lost.name : '') + 'を' + b.defender + 'に占領されました！');
          GameUI.notify('💥 劣勢: ' + (lost ? lost.name : '') + 'を占領されました！', 'alert');
        } else {
          CoreEngine.log('💥 攻勢失敗 — ' + name + 'で敗退しました。');
          GameUI.notify('💥 攻勢失敗: ' + name, 'alert');
        }
      } else {
        // 防衛戦敗北 → その州を占領される
        if (MapRenderer.captureState(b.stateId, b.attacker)) {
          CoreEngine.log('💥 ' + name + 'が' + b.attacker + 'に占領されました！');
          GameUI.notify('💥 ' + name + 'が占領されました！', 'alert');
        }
      }
    } else {
      // 均等 → 一時休戦 (領土変動なし)
      CoreEngine.log('⚖️ ' + name + 'の戦闘は膠着状態で終了しました。');
      GameUI.notify('⚖️ ' + name + ': 膠着状態 — 領土変動なし', 'alert');
    }
    MultiplayerManager.broadcast({ type: 'battle_end', battleId: b.id, state: b.stateId, advantage: b.advantage, kind: b.kind });
    BattlePlanManager.renderPanel();
    CoreEngine.renderStats();
  }

  static nearestOwnState(fromPt) {
    const player = CoreEngine.gameState.country;
    let best = null, bestD = Infinity;
    Object.entries(MapRenderer.states).forEach(([sid, st]) => {
      if (st.owner !== player) return;
      const c = MapRenderer.stateCenter.get(String(sid));
      if (!c) return;
      const d = Math.hypot(c[0] - fromPt[0], c[1] - fromPt[1]);
      if (d < bestD) { bestD = d; best = sid; }
    });
    return best;
  }

  // ---- AI軍の攻勢 (攻撃チェーン): 各交戦国は「前線に接する州」から1州ずつ
  //      段階的に進撃する。飛び地への跳躍は禁止。勝つ (防衛失敗) と次の州へ
  //      自動的に進撃する (戦闘が解決した翌日に前線の次の州へ再開)。 ----
  static maybeEnemyOffensive() {
    if (!MapRenderer.ready) return;
    const s = CoreEngine.gameState;
    if (!s.atWar || s.atWar.length === 0) return;
    if (BattleManager.battles.length >= 6) return;
    MapRenderer.buildStateAdjacency();
    const player = s.country;
    s.atWar.forEach(enemy => {
      // 各AI国は1正面ずつ (現在進行中の戦闘が解決してから次の州へ進撃)
      if (BattleManager.battles.some(b => b.attacker === enemy)) return;
      // 前線 = 自国防衛州のうち敵領に陸路で接する州のみ (飛び地は攻めない)
      const frontier = Object.keys(MapRenderer.states).filter(sid => {
        const st = MapRenderer.states[sid];
        if (!st || st.owner !== player) return false;
        return [...(MapRenderer.stateAdjacency.get(String(sid)) || [])]
          .some(n => MapRenderer.states[n] && MapRenderer.states[n].owner === enemy);
      });
      if (!frontier.length) return;
      const sid = frontier[Math.floor(Math.random() * frontier.length)];
      BattleManager.startDefense(enemy, sid);
    });
  }

  // ---- 描画: 戦闘マーカー (丸) ----
  static draw(ctx, worldToScreen) {
    if (!MapRenderer.ready) return;
    BattleManager.battles.forEach(b => {
      const s = worldToScreen(b.x, b.y);
      if (s[0] < -40 || s[1] < -40 || s[0] > ctx.canvas.width + 40 || s[1] > ctx.canvas.height + 40) return;
      const color = BattleManager.colorOf(b);
      const pulse = 9 + Math.sin(Date.now() / 250 + b.id) * 2.5;
      // 外周 (戦況色)
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s[0], s[1], pulse, 0, Math.PI * 2);
      ctx.stroke();
      // 進捗リング
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(s[0], s[1], pulse + 4, -Math.PI / 2, -Math.PI / 2 + Math.min(1, b.progress) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // 残り日数ラベル
      const label = '⚔' + BattleManager.daysLeft(b) + '日';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(s[0] - tw / 2 - 3, s[1] + pulse + 5, tw + 6, 13);
      ctx.fillStyle = color;
      ctx.fillText(label, s[0], s[1] + pulse + 15);
    });
  }

  static colorOf(b) {
    if (b.advantage >= 0.15) return BattleManager.COLORS.advantage;      // 優勢 → 緑
    if (b.advantage <= -0.15) return BattleManager.COLORS.disadvantage;  // 劣勢 → 赤
    return BattleManager.COLORS.even;                                    // 均等 → 黄
  }

  static statusLabel(b) {
    if (b.advantage >= 0.15) return '優勢';
    if (b.advantage <= -0.15) return '劣勢';
    return '均等';
  }

  static daysLeft(b) {
    return Math.max(1, Math.ceil((1 - Math.min(1, b.progress)) * b.totalDays));
  }

  static battleAtScreen(sx, sy) {
    let best = null, bestD = 18;
    BattleManager.battles.forEach(b => {
      const s = MapRenderer.worldToScreen(b.x, b.y);
      const d = Math.hypot(s[0] - sx, s[1] - sy);
      if (d < bestD) { bestD = d; best = b; }
    });
    return best;
  }

  // ---- ツールチップ (ホバー) ----
  static handleHover(sx, sy) {
    const tip = document.getElementById('battle-tooltip');
    if (!tip) return;
    const b = MapRenderer.ready ? BattleManager.battleAtScreen(sx, sy) : null;
    if (!b) {
      if (BattleManager.hoverId !== null) { tip.classList.add('hidden'); BattleManager.hoverId = null; }
      return;
    }
    if (BattleManager.hoverId !== b.id) {
      BattleManager.hoverId = b.id;
      const st = MapRenderer.states[b.stateId];
      const name = st ? st.name : '州' + b.stateId;
      const color = BattleManager.colorOf(b);
      tip.innerHTML =
        '<div class="bt-title" style="color:' + color + '">⚔️ 戦闘: ' + name + '</div>' +
        '<div class="bt-line">' + DataFetcher.getCountryFlag(b.attacker) + ' ' + b.attacker + ' vs ' +
        DataFetcher.getCountryFlag(b.defender) + ' ' + b.defender + '</div>' +
        '<div class="bt-line">戦況: <span style="color:' + color + ';font-weight:bold;">' +
        BattleManager.statusLabel(b) + '</span> (' + Math.round(Math.abs(b.advantage) * 100) + '%)</div>' +
        '<div class="bt-line">残り約 <span style="color:var(--text-gold);font-weight:bold;">' + BattleManager.daysLeft(b) + '</span> 日で決着予定</div>' +
        '<div class="bt-line" style="color:var(--text-secondary);font-size:10px;">' +
        (b.kind === 'offensive' ? '勝てば占領 / 負ければ逆に占領される' : '勝てば防衛成功 / 負ければ占領される') + '</div>';
      tip.classList.remove('hidden');
    }
    tip.style.left = (sx + 18) + 'px';
    tip.style.top = (sy + 18) + 'px';
  }
}

window.BattleManager = BattleManager;
