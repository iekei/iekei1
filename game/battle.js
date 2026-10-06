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
  static startOffensive(army, targetPid, targetStateId, options = {}) {
    if (!army.divisions.length || BattleManager.battles.some(b => b.attackerArmyId === army.id)) return null;
    const owner = MapRenderer.ownerOf(targetPid);
    if (!CoreEngine.gameState.atWar.includes(owner)) return null;
    if (!options.invasion && !options.airdrop && !(MapRenderer.provNeighbors.get(army.positionPid) || new Set()).has(targetPid)) return null;
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
      defender: owner,
      invasion: !!options.invasion, airdrop: !!options.airdrop,
      attackerArmyId: army.id,
      // プレイヤー視点の優勢度 (-1 〜 +1)
      advantage: BattleManager.calcOffensiveAdvantage(army, st),
      softAttack: BattleManager.attackProfile(army).soft,
      hardAttack: BattleManager.attackProfile(army).hard,
      defense: BattleManager.defenseProfile(st).defense,
      breakthrough: BattleManager.defenseProfile(st).breakthrough,
      hitChance: 0.2,
      damage: 0,
      progress: 0,
      totalDays: 0
    };
    // 優勢ほど短く終わる: 3〜13日
    b.totalDays = OffensivePlanner.duration(army, targetPid, Math.max(3, Math.round(3 + (1 - Math.abs(b.advantage)) * 10)));
    if (options.invasion && army.divisions.some(d => d.comp?.marine)) b.totalDays = Math.max(2, Math.round(b.totalDays * 0.65));
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
    const pid = st.provinces.find(p => MapRenderer.ownerOf(p) === CoreEngine.gameState.country && [...(MapRenderer.provNeighbors.get(p) || [])].some(n => MapRenderer.ownerOf(n) === enemyTag));
    if (!pid || BattleManager.battles.some(b => b.provId === pid)) return null;
    const pos = MapRenderer.provCentroid.get(pid);
    if (!pos) return null;
    const b = {
      id: BattleManager.nextId++,
      kind: 'defense',
      provId: pid,
      stateId: stateId,
      x: pos[0], y: pos[1],
      attacker: enemyTag,
      defender: CoreEngine.gameState.country,
      attackerArmyId: null,
      advantage: BattleManager.calcDefenseAdvantage(stateId),
      softAttack: 30,
      hardAttack: 12,
      defense: 60,
      breakthrough: 35,
      hitChance: 0.2,
      damage: 0,
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

  static attackProfile(army) {
    const count = Math.max(1, army?.divisions?.length || 1);
    const tech = BattleManager.totalFirepower();
    const mods = CoreEngine.gameState.cardModifiers || {};
    const soft = count * (35 + tech * 0.55 + (mods.softAttack || 0));
    const hard = count * (12 + tech * 0.25 + (mods.hardAttack || mods.armorBreakthrough || 0));
    return { soft, hard };
  }

  static defenseProfile(st) {
    const fort = st && st.b ? (st.b.fort || 0) * 8 : 0;
    const supply = (st && st.supply ? st.supply : 0) * 1.5;
    return { defense: 50 + fort + supply, breakthrough: 35 + fort * 0.5 };
  }

  static calcOffensiveAdvantage(army, st) {
    // HOI4式の火力対防御比較。防御を超えた射撃は命中率を倍化する。
    const org = army.divisions.reduce((s, d) => s + d.org, 0) / Math.max(1, army.divisions.length);
    const attack = BattleManager.attackProfile(army);
    const defensive = BattleManager.defenseProfile(st);
    const ratio = (attack.soft + attack.hard * 0.6) / Math.max(1, defensive.defense + defensive.breakthrough);
    const firepowerBonus = Math.max(-0.25, Math.min(0.55, (ratio - 0.8) * 0.45));
    let adv = (org + Math.min(25, army.divisions.length * 1.2) - defensive.defense) / 100 + firepowerBonus;
    // 将軍カードの攻勢ボーナス (軍集団に割り当てられた将軍の階級で決まる)
    if (army.general && army.general.rank) adv += (BattleManager.GENERAL_BONUS[army.general.rank] || 0);
    // 海軍/空軍の行動支援: 周辺で任務実行中の部隊が戦闘を支援する
    adv += BattleManager.supportBonus(st);
    return Math.max(-1, Math.min(1, adv));
  }

  // ---- 研究済み技術の合計火力を計算 (戦闘の優劣に影響) ----
  static totalFirepower() {
    if (typeof ResearchManager === 'undefined' || !ResearchManager.researchedTech) return 0;
    let total = 0;
    if (typeof ResearchI18n !== 'undefined' && ResearchManager.techData) {
      for (const [cat, techs] of Object.entries(ResearchManager.techData)) {
        techs.forEach(tech => {
          if (ResearchManager.researchedTech.has(tech.id) && tech.firepower) {
            total += tech.firepower;
          }
        });
      }
    }
    return total;
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
      progress: b.progress, totalDays: b.totalDays, attackerArmyId: b.attackerArmyId, invasion: b.invasion, airdrop: b.airdrop, preparation:b.preparation };
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
      if(b.preparation>0){b.preparation--;return;}
      const attackValue = b.softAttack + b.hardAttack * 0.6;
      const defenseValue = Math.max(1, b.defense + b.breakthrough);
      const exceeded = attackValue > defenseValue;
      b.hitChance = exceeded ? 0.4 : 0.2;
      b.damage = Math.max(0, attackValue / defenseValue) * b.hitChance * 2;
      b.progress += (1 / (b.totalDays * 24)) * Math.max(0.55, Math.min(2.5, b.damage));
      // 火力優勢が戦況の揺らぎより強く反映される
      b.advantage = Math.max(-1, Math.min(1, b.advantage + (b.damage - 0.35) * 0.025 + (Math.random() - 0.5) * 0.012));
      if (b.progress >= 1) resolved.push(b);
    });
    resolved.forEach(b => BattleManager.resolve(b));
    BattleManager.checkEncirclement();
  }

  // ---- 包囲判定: 自国州が陸路で他の自国州に到達できない場合、
  //      その州の師団は消滅し、州は包囲した敵国に占領される ----
  static checkEncirclement() {
    if (!MapRenderer.ready) return;
    // Disconnected colonies and landing bridgeheads are not instant defeats.
    // Only troops actually in an enemy-controlled pocket lose organization.
    BattlePlanManager.armies.forEach(army => {
      if (army.positionPid && MapRenderer.ownerOf(army.positionPid) !== CoreEngine.gameState.country) {
        army.divisions.forEach(d => { d.org = Math.max(0, d.org - 2); });
        army.executing = false;
        army.status = '補給路切断';
      }
    });
  }

  // ---- 戦闘結果の確定 → 占領 / 逆占領 ----
  static resolve(b) {
    BattleManager.battles = BattleManager.battles.filter(x => x.id !== b.id);
    BattleManager.applyEquipmentLosses(b);
    if (b.kind === 'offensive') OffensivePlanner.result(b);
    else if (b.advantage <= -0.1) OffensivePlanner.capture(b.provId, b.attacker);
    else CoreEngine.log('🛡️ 防衛戦終了: プロビンス ' + b.provId + 'を維持しました。');
    MultiplayerManager.broadcast({ type: 'battle_end', battleId: b.id, state: b.stateId, advantage: b.advantage, kind: b.kind });
    BattlePlanManager.renderPanel();
    CoreEngine.renderStats();
  }

  static applyEquipmentLosses(battle) {
    const attackerArmy = (BattlePlanManager.armies || []).find(army => army.id === battle.attackerArmyId);
    const affected = battle.kind === 'offensive'
      ? (attackerArmy?.divisions || [])
      : ArmyRoster.all().filter(division => Number(division.pid) === Number(battle.provId));
    const loss = 2 + Math.floor(Math.random() * 4) +
      (battle.defender === CoreEngine.gameState.country && battle.advantage < 0 ? 2 : 0);
    affected.forEach(division => {
      const current = Number.isFinite(division.equipmentStrength) ? division.equipmentStrength : 100;
      division.equipmentStrength = Math.max(0, current - loss);
    });
    return affected.length;
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
        return st && st.provinces.some(p=>MapRenderer.ownerOf(p)===player && [...(MapRenderer.provNeighbors.get(p)||[])].some(n=>MapRenderer.ownerOf(n)===enemy));
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
        '<div class="bt-title" style="color:' + color + '">' + (b.invasion ? '🌊 強襲上陸: ' : '⚔️ 戦闘: ') + name + '</div>' +
        '<div class="bt-line">' + DataFetcher.getCountryFlagImage(b.attacker) + ' ' + b.attacker + ' vs ' +
        DataFetcher.getCountryFlagImage(b.defender) + ' ' + b.defender + '</div>' +
        '<div class="bt-line">戦況: <span style="color:' + color + ';font-weight:bold;">' +
        BattleManager.statusLabel(b) + '</span> (' + Math.round(Math.abs(b.advantage) * 100) + '%)</div>' +
        '<div class="bt-line">火力: <b>' + Math.round(b.softAttack || 0) + '</b> / 対甲 <b>' + Math.round(b.hardAttack || 0) + '</b> vs 防御 <b>' + Math.round(b.defense || 0) + '</b></div>' +
        '<div class="bt-line">命中率: <b style="color:' + (b.hitChance >= 0.4 ? '#4ac46a' : '#e0c040') + '">' + Math.round((b.hitChance || 0.2) * 100) + '%</b>　ダメージ指数: <b>' + (b.damage || 0).toFixed(2) + '</b></div>' +
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
