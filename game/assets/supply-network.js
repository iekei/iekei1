/* ==========================================================
 * supply-network.js — SupplyNetwork: HOI4風 補給網・インフラ・補給ハブ
 * ----------------------------------------------------------
 * - 首都 (ArmyRoster.capitalProvince の州) を起点に、自国州の隣接グラフ (鉄道網) を
 *   インフラレベルで決まる輸送容量で辿り、各補給ハブへのスループットを計算する (最大ボトルネック経路)。
 * - 各補給ハブは範囲内 (ホップ数) の州へ補給を投射し、州の補給容量を決める。
 * - 州に駐留する師団の物資消費 (DivisionDesigner の大隊 sup 値) が容量を超えると、
 *   師団に補給切れペナルティ (移動速度低下 / 攻撃力低下 / 組織率上限低下) を適用する。
 * - 「補給」マップモードで鉄道・補給線・ハブを色分け描画 (緑=正常 / 黄=不足 / 赤=枯渇)。
 * - 建設ウィンドウにインフラ (0〜5) と補給ハブ (0〜3) の建設・アップグレード UI を追加。
 * ========================================================== */
'use strict';

class SupplyNetwork {
  static CONFIG = {
    capitalThroughput: 40,        // 首都ハブの基礎スループット
    hubThroughput: 12,            // 補給ハブ1レベルあたりのスループット
    railBase: 4,                  // インフラ0の鉄道容量
    railPerInfra: 4,              // インフラ1レベルあたりの鉄道容量 (Lv5 = 24)
    hubRange: 2,                  // ハブの投射範囲 (州ホップ数)。Lv3ハブは+1
    falloff: [1, 0.7, 0.45, 0.25],// 距離ごとの投射係数
    localPerInfra: 0.35,          // 州のインフラによるローカル補給
    defaultDivisionDemand: 0.8,   // 編成情報が無い師団の消費量
    lowRatio: 0.4,                // これ未満 = 枯渇 (red)、1未満 = 不足 (yellow)
    recomputeEvery: 24            // 再計算間隔 (tick = 1時間)
  };
  static STATUS = {
    ok:   { label: '正常',   color: '#3cc464', rgb: [52, 150, 80] },
    low:  { label: '不足',   color: '#e0c040', rgb: [170, 150, 50] },
    out:  { label: '枯渇',   color: '#e04a3c', rgb: [160, 55, 50] },
    idle: { label: '駐留なし', color: '#5f7a4a', rgb: [78, 100, 62] },
    none: { label: '補給網外', color: '#6a6a6a', rgb: [95, 95, 95] }
  };
  static PENALTY = {
    ok:  { attack: 1,    speedDivisor: 1, orgCap: 1 },
    low: { attack: 0.65, speedDivisor: 2, orgCap: 0.5 },
    out: { attack: 0.35, speedDivisor: 4, orgCap: 0.2 }
  };

  static stateInfo = new Map();   // sid -> {capacity, demand, ratio, status, infra, hub, divisions, sources}
  static hubs = [];               // [{sid, level, rail, throughput, status, path:[sid...], load, served:[sid...]}]
  static capitalSid = null;
  static dirty = true;
  static tickCount = 0;
  static lastComputedDay = -1;
  static installed = false;

  // ==========================================================
  // 初期化・フック
  // ==========================================================
  static init() {
    if (SupplyNetwork.installed) return;
    SupplyNetwork.installed = true;
    SupplyNetwork.installHooks();
    CoreEngine.registerTickCallback(() => SupplyNetwork.onTick());
    CoreEngine.log('🚚 補給網システム: 首都→鉄道→補給ハブの経路で物資が届きます。補給マップモードで確認できます。');
  }

  static installHooks() {
    // 1) マップ描画: 補給モード時にネットワークを重ねる
    if (typeof BattlePlanManager !== 'undefined' && !BattlePlanManager._supplyDrawHooked) {
      const original = BattlePlanManager.drawOverlay.bind(BattlePlanManager);
      BattlePlanManager.drawOverlay = (ctx, cam, w2s) => {
        if (MapRenderer.mode === 'supply') SupplyNetwork.draw(ctx, w2s);
        original(ctx, cam, w2s);
      };
      BattlePlanManager._supplyDrawHooked = true;
    }
    // 2) モードキャッシュ破棄 (領土変化・建設完了) で再計算
    if (typeof MapRenderer !== 'undefined' && !MapRenderer._supplyInvalidateHooked) {
      const original = MapRenderer.invalidateModes.bind(MapRenderer);
      MapRenderer.invalidateModes = () => { SupplyNetwork.dirty = true; original(); };
      MapRenderer._supplyInvalidateHooked = true;
    }
    // 3) 攻撃力ペナルティ
    if (typeof BattleManager !== 'undefined' && !BattleManager._supplyHooked) {
      const original = BattleManager.attackProfile.bind(BattleManager);
      BattleManager.attackProfile = (army) => {
        const p = original(army);
        const f = SupplyNetwork.armyAttackFactor(army);
        return { soft: p.soft * f, hard: p.hard * f };
      };
      BattleManager._supplyHooked = true;
    }
    // 4) 移動速度ペナルティ (補給不足の軍集団は行軍 tick を間引く)
    if (typeof OffensivePlanner !== 'undefined' && !OffensivePlanner._supplyHooked) {
      const original = OffensivePlanner.tickArmy.bind(OffensivePlanner);
      OffensivePlanner.tickArmy = (army) => {
        const divisor = SupplyNetwork.armySpeedDivisor(army);
        army._supplyTick = (army._supplyTick || 0) + 1;
        if (divisor > 1 && army.executing && army._supplyTick % divisor !== 0) {
          army.status = (army.status || '') .replace(/ \(補給切れ\)$/, '') + ' (補給切れ)';
          return;
        }
        if (army.status) army.status = army.status.replace(/ \(補給切れ\)$/, '');
        original(army);
      };
      OffensivePlanner._supplyHooked = true;
    }
    // 5) 建設ウィンドウに補給網セクションを追加
    if (typeof ConstructionManager !== 'undefined' && !ConstructionManager._supplyHooked) {
      const original = ConstructionManager.render.bind(ConstructionManager);
      ConstructionManager.render = () => { original(); SupplyNetwork.renderConstructionSection(); };
      ConstructionManager._supplyHooked = true;
    }
    // 6) 補給モードに切り替えたら即時再計算
    if (typeof MapRenderer !== 'undefined' && !MapRenderer._supplyModeHooked) {
      const original = MapRenderer.setMode.bind(MapRenderer);
      MapRenderer.setMode = (mode) => { original(mode); if (mode === 'supply') { SupplyNetwork.dirty = true; SupplyNetwork.ensure(); } };
      MapRenderer._supplyModeHooked = true;
    }
  }

  // ==========================================================
  // Tick
  // ==========================================================
  static onTick() {
    if (!MapRenderer.ready) return;
    SupplyNetwork.tickCount++;
    if (SupplyNetwork.dirty || SupplyNetwork.tickCount % SupplyNetwork.CONFIG.recomputeEvery === 0) SupplyNetwork.recompute();
    SupplyNetwork.applyPenalties();
  }

  static ensure() { if (SupplyNetwork.dirty && MapRenderer.ready) SupplyNetwork.recompute(); }

  // ==========================================================
  // ネットワーク計算
  // ==========================================================
  static player() { return CoreEngine.gameState.country; }
  static infraOf(st) { return Math.max(0, Math.min(5, Number(st?.b?.infrastructure) || 0)); }
  static hubLevelOf(st) { return Math.max(0, Math.min(3, Number(st?.b?.supply_hub) || 0)); }
  static railCapacity(a, b) {
    const c = SupplyNetwork.CONFIG;
    return c.railBase + c.railPerInfra * Math.min(SupplyNetwork.infraOf(a), SupplyNetwork.infraOf(b));
  }
  // 自国領、または軍事通行権のある国の州は補給線が通れる
  static passable(st) {
    if (!st) return false;
    const me = SupplyNetwork.player();
    return st.owner === me || CoreEngine.gameState.militaryAccess?.[st.owner] === true;
  }

  static capitalState() {
    try {
      const pid = ArmyRoster.capitalProvince();
      const sid = pid ? MapRenderer.stateOf(pid) : null;
      if (sid && MapRenderer.states[sid]?.owner === SupplyNetwork.player()) return String(sid);
    } catch (e) { /* fall through */ }
    // フォールバック: 自国で最大VPの州
    let best = null, bestVp = -1;
    Object.entries(MapRenderer.states || {}).forEach(([sid, st]) => {
      if (st.owner !== SupplyNetwork.player()) return;
      const vp = Object.values(st.vp || {}).reduce((n, v) => n + Number(v || 0), 0);
      if (vp > bestVp) { bestVp = vp; best = sid; }
    });
    return best;
  }

  // 師団1個あたりの物資消費 (大隊構成から算出)
  static divisionDemand(d) {
    const comp = d?.comp;
    if (!comp || typeof DivisionDesigner === 'undefined') return SupplyNetwork.CONFIG.defaultDivisionDemand;
    let total = 0, n = 0;
    Object.entries(comp).forEach(([id, count]) => {
      const def = DivisionDesigner.def(id);
      total += (def ? def.sup : 0.06) * count; n += count;
    });
    if (!n) return SupplyNetwork.CONFIG.defaultDivisionDemand;
    return Math.max(0.2, +(total * 1.2).toFixed(2));   // 7/2歩兵 + 支援3 ≈ 1.1
  }

  // 州ごとの駐留師団 (自国)
  static divisionsByState() {
    const map = new Map();
    const push = (d, pid) => {
      const sid = pid ? String(MapRenderer.stateOf(Number(pid)) || '') : '';
      if (!sid) return;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid).push(d);
    };
    (BattlePlanManager.armies || []).forEach(a => a.divisions.forEach(d => push(d, (a.executing ? a.positionPid : d.pid) || a.positionPid || d.pid)));
    (CoreEngine.gameState.strategy?.reserves || []).forEach(d => push(d, d.pid));
    return map;
  }

  static recompute() {
    SupplyNetwork.dirty = false;
    const states = MapRenderer.states || {};
    const adj = MapRenderer.buildStateAdjacency();
    const cfg = SupplyNetwork.CONFIG;
    const me = SupplyNetwork.player();
    const capital = SupplyNetwork.capitalState();
    SupplyNetwork.capitalSid = capital;
    const info = new Map();
    const hubs = [];
    const troops = SupplyNetwork.divisionsByState();

    // --- 1) 首都からの最大ボトルネック経路 (widest path) ---
    const width = new Map(), prev = new Map();
    if (capital) {
      width.set(capital, Infinity);
      const open = [capital];
      const done = new Set();
      while (open.length) {
        open.sort((a, b) => width.get(b) - width.get(a));
        const cur = open.shift();
        if (done.has(cur)) continue;
        done.add(cur);
        (adj.get(cur) || new Set()).forEach(next => {
          const st = states[next];
          if (!SupplyNetwork.passable(st)) return;
          const w = Math.min(width.get(cur), SupplyNetwork.railCapacity(states[cur], st));
          if (w > (width.get(next) || 0)) { width.set(next, w); prev.set(next, cur); if (!done.has(next)) open.push(next); }
        });
      }
    }
    const pathTo = sid => { const p = [sid]; let c = sid; while (prev.has(c)) { c = prev.get(c); p.unshift(c); } return p; };

    // --- 2) ハブ (首都 + 補給ハブ建設済み州) のスループット ---
    Object.entries(states).forEach(([sid, st]) => {
      if (st.owner !== me) return;
      const level = SupplyNetwork.hubLevelOf(st);
      const isCapital = sid === capital;
      if (!level && !isCapital) return;
      const rail = isCapital ? Infinity : (width.get(sid) || 0);
      const own = isCapital ? cfg.capitalThroughput + cfg.hubThroughput * level : cfg.hubThroughput * level;
      const throughput = Math.min(own, rail);
      hubs.push({ sid, level: isCapital ? Math.max(level, 3) : level, isCapital, rail: isCapital ? own : rail, throughput, path: isCapital ? [sid] : pathTo(sid),
        range: cfg.hubRange + (level >= 3 ? 1 : 0), connected: isCapital || rail > 0, served: [], load: 0 });
    });

    // --- 3) ハブから範囲内の州へ投射 ---
    const potential = new Map();   // sid -> [{hub, factor}]
    hubs.forEach(hub => {
      if (!hub.connected || hub.throughput <= 0) return;
      const dist = new Map([[hub.sid, 0]]);
      const queue = [hub.sid];
      while (queue.length) {
        const cur = queue.shift();
        const d = dist.get(cur);
        if (d >= hub.range) continue;
        (adj.get(cur) || new Set()).forEach(next => {
          if (dist.has(next) || states[next]?.owner !== me) return;
          dist.set(next, d + 1); queue.push(next);
        });
      }
      dist.forEach((d, sid) => {
        if (!potential.has(sid)) potential.set(sid, []);
        potential.get(sid).push({ hub, d, factor: cfg.falloff[d] ?? 0.1 });
        hub.served.push(sid);
      });
    });

    // --- 4) 州の容量・需要 ---
    Object.entries(states).forEach(([sid, st]) => {
      if (st.owner !== me) return;
      const infra = SupplyNetwork.infraOf(st);
      const divisions = troops.get(sid) || [];
      const demand = divisions.reduce((n, d) => n + SupplyNetwork.divisionDemand(d), 0);
      const sources = (potential.get(sid) || []).sort((a, b) => a.d - b.d);
      const infraMul = 0.7 + 0.1 * infra;
      sources.forEach(s => { s.contribution = s.hub.throughput * s.factor * infraMul; });
      const projected = sources.reduce((n, s) => n + s.contribution, 0);
      const local = infra * cfg.localPerInfra + (Number(st.supply) || 0) * 0.1;
      // 需要を各ハブへ寄与率に応じて配分 (後で過負荷なら按分)
      if (projected > 0 && demand > 0) sources.forEach(s => { s.hub.load += demand * (s.contribution / projected); });
      info.set(sid, { sid, infra, hub: SupplyNetwork.hubLevelOf(st), isCapital: sid === capital, divisions, demand, local, projected, capacity: projected + local,
        _sources: sources, sources: sources.map(s => ({ sid: s.hub.sid, d: s.d })), status: 'idle', ratio: Infinity });
    });
    // ハブ過負荷の按分 (各ハブの寄与分だけ縮小)
    info.forEach(i => {
      let delivered = 0;
      i._sources.forEach(s => { delivered += s.contribution * Math.min(1, s.hub.load > 0 ? s.hub.throughput / s.hub.load : 1); });
      i.projected = +delivered.toFixed(2);
      i.capacity = i.local + delivered;
      delete i._sources;
      i.capacity = +i.capacity.toFixed(2);
      if (i.demand > 0) {
        i.ratio = i.capacity / i.demand;
        i.status = i.ratio >= 1 ? 'ok' : i.ratio >= cfg.lowRatio ? 'low' : 'out';
      } else i.status = i.sources.length || i.isCapital ? 'idle' : 'none';
    });
    hubs.forEach(h => {
      const r = h.throughput > 0 ? h.throughput / Math.max(h.load, 0.001) : 0;
      h.status = !h.connected || h.throughput <= 0 ? 'out' : h.load === 0 ? 'idle' : r >= 1 ? 'ok' : r >= cfg.lowRatio ? 'low' : 'out';
    });

    SupplyNetwork.stateInfo = info;
    SupplyNetwork.hubs = hubs;
    // 師団に状態を記録
    info.forEach(i => i.divisions.forEach(d => { d.supplyStatus = i.status === 'idle' || i.status === 'none' ? 'ok' : i.status; d.supplyRatio = i.ratio; }));
    if (MapRenderer.mode === 'supply') MapRenderer.modeCache.supply = null;
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen('construction')) SupplyNetwork.renderConstructionSection();
  }

  // ==========================================================
  // ペナルティ
  // ==========================================================
  static divisionPenalty(d) { return SupplyNetwork.PENALTY[d?.supplyStatus] || SupplyNetwork.PENALTY.ok; }
  static armyStatus(army) {
    const divs = army?.divisions || [];
    if (divs.some(d => d.supplyStatus === 'out')) return 'out';
    if (divs.some(d => d.supplyStatus === 'low')) return 'low';
    return 'ok';
  }
  static armyAttackFactor(army) {
    const divs = army?.divisions || [];
    if (!divs.length) return 1;
    return divs.reduce((n, d) => n + SupplyNetwork.divisionPenalty(d).attack, 0) / divs.length;
  }
  static armySpeedDivisor(army) { return SupplyNetwork.PENALTY[SupplyNetwork.armyStatus(army)].speedDivisor; }

  static applyPenalties() {
    let notified = SupplyNetwork._notifiedTick && SupplyNetwork.tickCount - SupplyNetwork._notifiedTick < 24 * 3;
    SupplyNetwork.stateInfo.forEach(i => {
      if (i.status !== 'low' && i.status !== 'out') return;
      const pen = SupplyNetwork.PENALTY[i.status];
      i.divisions.forEach(d => {
        const maxOrg = Number(d.maxOrg) || 60;
        const cap = maxOrg * pen.orgCap;
        if (d.org > cap) d.org = Math.max(cap, d.org - 1.5);          // 組織率は上限まで徐々に低下
        if (i.status === 'out' && Number(d.equipmentStrength ?? 100) > 30) d.equipmentStrength = Math.max(30, (d.equipmentStrength ?? 100) - 0.05);
      });
      if (i.status === 'out' && !notified) {
        GameUI.notify('🚚 ' + (MapRenderer.states[i.sid]?.name || '州' + i.sid) + 'の師団が補給切れです (需要 ' + i.demand.toFixed(1) + ' / 供給 ' + i.capacity.toFixed(1) + ')', 'alert');
        SupplyNetwork._notifiedTick = SupplyNetwork.tickCount;
        notified = true;
      }
    });
  }

  // ==========================================================
  // マップ描画
  // ==========================================================
  static stateRGB(sid) {
    const i = SupplyNetwork.stateInfo.get(String(sid));
    if (!i) return null;
    if (i.status === 'idle') {
      // 駐留なし: 容量に応じた緑の濃淡
      const t = Math.min(1, i.capacity / 12);
      return [60 - t * 10 | 0, 90 + t * 70 | 0, 60];
    }
    return SupplyNetwork.STATUS[i.status].rgb;
  }

  static draw(ctx, w2s) {
    SupplyNetwork.ensure();
    const center = sid => MapRenderer.stateCenter.get(String(sid)) || MapRenderer.stateCenter.get(Number(sid));
    const scale = MapRenderer.cam.scale;
    const time = Date.now() / 1000;
    ctx.save();
    ctx.lineCap = 'round';
    // --- 鉄道 (首都→ハブ経路) ---
    const drawnEdges = new Set();
    SupplyNetwork.hubs.forEach(hub => {
      const color = SupplyNetwork.STATUS[hub.status]?.color || '#888';
      for (let i = 1; i < hub.path.length; i++) {
        const key = [hub.path[i - 1], hub.path[i]].sort().join('-');
        if (drawnEdges.has(key)) continue;
        drawnEdges.add(key);
        const a = center(hub.path[i - 1]), b = center(hub.path[i]);
        if (!a || !b) continue;
        const cap = SupplyNetwork.railCapacity(MapRenderer.states[hub.path[i - 1]], MapRenderer.states[hub.path[i]]);
        const sa = w2s(a[0], a[1]), sb = w2s(b[0], b[1]);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2 + cap * 0.35 + 2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 2 + cap * 0.35;
        ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
        // 枕木風の破線 (鉄道) — 流れアニメーション
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 9]); ctx.lineDashOffset = -(time * 20) % 12;
        ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    // --- 補給線 (ハブ→投射先の州) ---
    SupplyNetwork.stateInfo.forEach(i => {
      if (!i.sources.length || i.sources[0].sid === i.sid) return;
      const src = i.sources[0];
      const a = center(src.sid), b = center(i.sid);
      if (!a || !b) return;
      const status = i.status === 'idle' || i.status === 'none' ? null : i.status;
      const sa = w2s(a[0], a[1]), sb = w2s(b[0], b[1]);
      ctx.strokeStyle = status ? SupplyNetwork.STATUS[status].color : 'rgba(120,200,140,0.35)';
      ctx.lineWidth = status ? 2.2 : 1;
      ctx.setLineDash(status ? [6, 4] : [2, 6]); ctx.lineDashOffset = -(time * 15) % 10;
      ctx.beginPath(); ctx.moveTo(sa[0], sa[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
      ctx.setLineDash([]);
    });
    // --- 州ラベル (駐留州: 需要/供給) ---
    if (scale >= 0.45) {
      ctx.font = 'bold ' + Math.max(9, Math.min(13, 10 * scale + 4)) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      SupplyNetwork.stateInfo.forEach(i => {
        if (!i.divisions.length) return;
        const c = center(i.sid); if (!c) return;
        const s = w2s(c[0], c[1]);
        const text = i.divisions.length + '師団 ' + i.demand.toFixed(1) + '/' + i.capacity.toFixed(1);
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(s[0] - w / 2, s[1] + 14, w, 15);
        ctx.strokeStyle = SupplyNetwork.STATUS[i.status].color; ctx.lineWidth = 1; ctx.strokeRect(s[0] - w / 2, s[1] + 14, w, 15);
        ctx.fillStyle = SupplyNetwork.STATUS[i.status].color; ctx.fillText(text, s[0], s[1] + 21.5);
      });
    }
    // --- ハブマーカー ---
    SupplyNetwork.hubs.forEach(hub => {
      const c = center(hub.sid); if (!c) return;
      const s = w2s(c[0], c[1]);
      const size = hub.isCapital ? 18 : 14;
      const color = SupplyNetwork.STATUS[hub.status]?.color || '#888';
      ctx.fillStyle = '#15181a'; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.rect(s[0] - size / 2, s[1] - size / 2, size, size); ctx.fill(); ctx.stroke();
      // 箱アイコン
      ctx.fillStyle = color;
      ctx.fillRect(s[0] - size * 0.28, s[1] - size * 0.22, size * 0.56, size * 0.44);
      ctx.fillStyle = '#15181a'; ctx.fillRect(s[0] - size * 0.06, s[1] - size * 0.22, size * 0.12, size * 0.44);
      if (hub.isCapital) { ctx.fillStyle = '#e3c06a'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', s[0], s[1] - size / 2 - 6); }
      // レベルピップ
      for (let l = 0; l < 3; l++) {
        ctx.fillStyle = l < hub.level ? color : 'rgba(255,255,255,0.15)';
        ctx.fillRect(s[0] - 7 + l * 5, s[1] + size / 2 + 2, 4, 3);
      }
      if (scale >= 0.45) {
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#d6d9d2';
        ctx.fillText((hub.isCapital ? '首都 ' : 'ハブ ') + hub.throughput.toFixed(0) + (hub.connected ? '' : ' (未接続)'), s[0], s[1] + size / 2 + 7);
      }
    });
    ctx.restore();
  }

  // ==========================================================
  // 建設ウィンドウ: インフラ・補給ハブ UI
  // ==========================================================
  static esc(v) { return typeof GameTools !== 'undefined' ? GameTools.escape(v) : String(v ?? ''); }
  static pips(level, max, cls) {
    let h = '<span class="sn-pips">';
    for (let i = 0; i < max; i++) h += '<i class="' + (i < level ? 'on ' + (cls || '') : '') + '"></i>';
    return h + '</span>';
  }
  static queuedCount(sid, building) { return (ConstructionManager.queue || []).filter(q => String(q.stateId) === String(sid) && q.building === building).length; }

  static renderConstructionSection() {
    const container = document.getElementById('construction-content');
    if (!container) return;
    SupplyNetwork.ensure();
    let section = document.getElementById('supply-network-section');
    if (!section) {
      section = document.createElement('div');
      section.id = 'supply-network-section';
      const card = container.querySelector('.con-state-card');
      if (card && card.parentNode === container) card.insertAdjacentElement('afterend', section); else container.appendChild(section);
    }
    const me = SupplyNetwork.player();
    const sid = ConstructionManager.selectedStateId ? String(ConstructionManager.selectedStateId) : null;
    const st = sid ? MapRenderer.states[sid] : null;
    let html = '<div class="sp-section sn-section"><h3>🚚 補給網・インフラ・補給ハブ <button class="sn-mode-btn" onclick="MapRenderer.setMode(\'supply\')">🗺 補給マップモード</button></h3>';
    if (st && st.owner === me) {
      const i = SupplyNetwork.stateInfo.get(sid);
      const infra = SupplyNetwork.infraOf(st), hub = SupplyNetwork.hubLevelOf(st);
      const qInfra = SupplyNetwork.queuedCount(sid, 'infrastructure'), qHub = SupplyNetwork.queuedCount(sid, 'supply_hub');
      const status = i ? SupplyNetwork.STATUS[i.status] : SupplyNetwork.STATUS.none;
      const hubEntry = SupplyNetwork.hubs.find(h => h.sid === sid);
      html += '<div class="sn-state">' +
        '<div class="sn-state-head"><b>' + SupplyNetwork.esc(st.name) + '</b>' + (i?.isCapital ? ' <span class="sn-tag gold">★ 首都</span>' : '') +
        ' <span class="sn-tag" style="color:' + status.color + ';border-color:' + status.color + '">' + status.label + '</span></div>' +
        '<div class="sn-rows">' +
        '<div class="sn-row"><span>🛤️ インフラ</span>' + SupplyNetwork.pips(infra, 5, 'infra') + '<b>Lv.' + infra + '/5</b>' +
          (qInfra ? '<small>+' + qInfra + ' 建設中</small>' : '') +
          '<button class="con-build-btn" onclick="SupplyNetwork.enqueue(\'' + sid + '\',\'infrastructure\')"' + (infra + qInfra >= 5 ? ' disabled' : '') + '>' + (infra ? 'アップグレード' : '建設') + ' (200日)</button></div>' +
        '<div class="sn-row"><span>📦 補給ハブ</span>' + SupplyNetwork.pips(hub, 3, 'hub') + '<b>Lv.' + hub + '/3</b>' +
          (qHub ? '<small>+' + qHub + ' 建設中</small>' : '') +
          '<button class="con-build-btn" onclick="SupplyNetwork.enqueue(\'' + sid + '\',\'supply_hub\')"' + (hub + qHub >= 3 ? ' disabled' : '') + '>' + (hub ? 'アップグレード' : '建設') + ' (400日)</button></div>' +
        '</div>';
      if (i) {
        html += '<div class="sn-stats">' +
          '<div><span>補給容量</span><b style="color:' + status.color + '">' + i.capacity.toFixed(1) + '</b></div>' +
          '<div><span>駐留師団の消費</span><b>' + i.demand.toFixed(1) + ' (' + i.divisions.length + '師団)</b></div>' +
          '<div><span>ローカル補給</span><b>' + i.local.toFixed(1) + '</b></div>' +
          '<div><span>ハブ投射</span><b>' + i.projected.toFixed(1) + '</b></div>' +
          '<div><span>供給元</span><b>' + (i.sources.length ? i.sources.slice(0, 3).map(s => SupplyNetwork.esc(MapRenderer.states[s.sid]?.name || s.sid) + (s.d ? ' (' + s.d + 'ホップ)' : '')).join(', ') : '補給網外') + '</b></div>' +
          (hubEntry ? '<div><span>鉄道スループット</span><b>' + (hubEntry.isCapital ? '首都 ' : '') + hubEntry.throughput.toFixed(0) + ' / 鉄道容量 ' + (Number.isFinite(hubEntry.rail) ? hubEntry.rail.toFixed(0) : '∞') + (hubEntry.connected ? '' : ' — ⚠ 首都と未接続') + '</b></div>' : '') +
          '</div>';
        if (i.status === 'low' || i.status === 'out') {
          const p = SupplyNetwork.PENALTY[i.status];
          html += '<div class="sn-warn">⚠ 補給' + status.label + ': 攻撃力 ×' + p.attack + ' / 移動速度 1/' + p.speedDivisor + ' / 組織率上限 ' + Math.round(p.orgCap * 100) + '%。インフラ強化・補給ハブ建設・師団の分散で解消できます。</div>';
        }
      }
      html += '</div>';
    } else {
      html += '<p class="sn-help">マップで自国の州を選択すると、インフラ (0〜5) と補給ハブ (0〜3) の建設・アップグレードができます。</p>';
    }
    // 概況: ハブ一覧 + 補給不足の州
    const problems = [...SupplyNetwork.stateInfo.values()].filter(i => i.status === 'low' || i.status === 'out').sort((a, b) => a.ratio - b.ratio);
    html += '<div class="sn-overview"><div class="sn-col"><h4>📦 補給ハブ (' + SupplyNetwork.hubs.length + ')</h4>';
    if (!SupplyNetwork.hubs.length) html += '<p class="sn-help">ハブがありません。首都が見つからない可能性があります。</p>';
    SupplyNetwork.hubs.slice(0, 12).forEach(h => {
      const stt = SupplyNetwork.STATUS[h.status];
      html += '<div class="sn-item" onclick="SupplyNetwork.focusState(\'' + h.sid + '\')"><i style="background:' + stt.color + '"></i><span>' + (h.isCapital ? '★ ' : '') + SupplyNetwork.esc(MapRenderer.states[h.sid]?.name || h.sid) + ' Lv.' + h.level + '</span><b>' + h.throughput.toFixed(0) + (h.connected ? '' : ' 未接続') + ' / 負荷 ' + h.load.toFixed(1) + '</b></div>';
    });
    html += '</div><div class="sn-col"><h4>⚠ 補給不足の州 (' + problems.length + ')</h4>';
    if (!problems.length) html += '<p class="sn-help ok">すべての駐留師団に補給が行き渡っています。</p>';
    problems.slice(0, 12).forEach(i => {
      const stt = SupplyNetwork.STATUS[i.status];
      html += '<div class="sn-item" onclick="SupplyNetwork.focusState(\'' + i.sid + '\')"><i style="background:' + stt.color + '"></i><span>' + SupplyNetwork.esc(MapRenderer.states[i.sid]?.name || i.sid) + ' (' + i.divisions.length + '師団)</span><b>' + i.demand.toFixed(1) + ' / ' + i.capacity.toFixed(1) + '</b></div>';
    });
    html += '</div></div></div>';
    section.innerHTML = html;
  }

  static enqueue(sid, building) {
    ConstructionManager.selectedStateId = sid;
    ConstructionManager.enqueue(building);
    SupplyNetwork.dirty = true;
  }

  static focusState(sid) {
    ConstructionManager.selectState(sid);
    const c = MapRenderer.stateCenter.get(String(sid)) || MapRenderer.stateCenter.get(Number(sid));
    if (c && MapRenderer.canvas) {
      const scale = Math.max(MapRenderer.cam.scale, 0.8);
      MapRenderer.cam.scale = scale;
      MapRenderer.cam.x = MapRenderer.canvas.width / 2 - c[0] * scale;
      MapRenderer.cam.y = MapRenderer.canvas.height / 2 - c[1] * scale;
      if (MapRenderer.clampCameraY) MapRenderer.clampCameraY();
    }
    MapRenderer.setMode('supply');
    ConstructionManager.render();
  }

  // 州情報オーバーレイ用の1行サマリ
  static summaryLine(sid) {
    SupplyNetwork.ensure();
    const i = SupplyNetwork.stateInfo.get(String(sid));
    if (!i) return '';
    const s = SupplyNetwork.STATUS[i.status];
    return '<span style="font-size:11px;color:' + s.color + '">🚚 補給 ' + s.label + ' — 供給 ' + i.capacity.toFixed(1) + ' / 需要 ' + i.demand.toFixed(1) + ' | 🛤️ Lv.' + i.infra + ' 📦 Lv.' + i.hub + '</span>';
  }

  // セーブ/ロード用: 建物レベルと補給値 (州ごと)
  static collectBuildings() {
    const out = {};
    Object.entries(MapRenderer.states || {}).forEach(([sid, st]) => { if (st.b) out[sid] = { b: { ...st.b }, supply: st.supply }; });
    return out;
  }
  static applyBuildings(data) {
    if (!data) return;
    Object.entries(data).forEach(([sid, v]) => { const st = MapRenderer.states?.[sid]; if (st && v) { st.b = { ...(v.b || {}) }; if (v.supply != null) st.supply = v.supply; } });
    SupplyNetwork.dirty = true;
  }
}

window.SupplyNetwork = SupplyNetwork;
