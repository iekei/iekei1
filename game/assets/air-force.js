/* ==========================================================
 * air-force.js — AirForce: HOI4風 航空戦・航空隊配備 (Air Wings & Missions)
 * ----------------------------------------------------------
 * - 「空軍」ウィンドウ: 備蓄航空機 (戦闘機 / CAS / 戦略爆撃機) を航空基地へ航空隊として配備・移動
 *   各航空隊は 機体数 / 練度 / 稼働率 を持つ
 * - 空域 (= 州) ごとの制空権: 自軍の制空任務機 vs 敵の推定航空戦力 から割合を算出
 * - 任務: 制空 (air_sup) / 近接航空支援 CAS (ground) / 戦略爆撃 (strategic)
 * - 戦闘連動: 戦闘中の州上空で CAS 任務中なら BattleManager の毎時計算にボーナス (制空権で減衰)
 * - 建設ウィンドウから航空基地 (Lv.0〜10) を拡張
 *
 * 既存の BattlePlanManager.air (航空集団) をそのまま航空隊データとして拡張する:
 *   { id, name, type:'air', baseStateId, base, aircraftType:'fighter'|'cas'|'bomber', aircraftCount,
 *     experience(0-100), readiness(0-100), mission, zone:{pid,x,y,sid,mission}, executing }
 * ========================================================== */
'use strict';

class AirForce {
  static AIRCRAFT = {
    fighter: { id: 'fighter', name: '戦闘機',     icon: '✈️', stockTypes: ['fighter_2', 'fighter'], airAttack: 1.0, groundAttack: 0.15, strategic: 0,   missions: ['air_sup', 'ground'] },
    cas:     { id: 'cas',     name: '近接支援機',  icon: '🛩️', stockTypes: ['cas'],                 airAttack: 0.2, groundAttack: 1.0,  strategic: 0.1, missions: ['ground'] },
    bomber:  { id: 'bomber',  name: '戦略爆撃機',  icon: '🛫', stockTypes: ['strat_bomber'],        airAttack: 0.3, groundAttack: 0.3,  strategic: 1.0, missions: ['strategic', 'ground'] }
  };
  static MISSIONS = {
    air_sup:   { id: 'air_sup',   label: '制空',         icon: '🛡️', color: '#5d93c2', desc: '空域の制空権を獲得し、敵機を撃墜します。' },
    ground:    { id: 'ground',    label: '近接航空支援', icon: '💥', color: '#e0a040', desc: '空域内の地上戦に直接ダメージを与えます (制空権で効果が変動)。' },
    strategic: { id: 'strategic', label: '戦略爆撃',     icon: '🏭', color: '#e04a3c', desc: '敵州のインフラ・工場を破壊します。' }
  };
  static CONFIG = {
    zoneRadius: 220,           // 空域の影響半径 (ワールド座標) — 既存の支援判定と同じ
    baseCapacityPerLevel: 100, // 航空基地1レベルあたりの収容機数
    maxBaseLevel: 10,
    readinessFlyPerHour: 0.12, // 任務中の稼働率低下 (/h)
    readinessRestPerHour: 0.5, // 待機中の回復 (/h)
    xpPerHour: 0.03,
    casPerPlane: 0.004,        // CAS 1機あたりの攻撃ボーナス (100機・制空確保で約+30%)
    casMax: 0.4,               // CAS ボーナス上限 (+40%)
    enemyPlanesPerDivision: 6, // 敵航空戦力の推定: 師団数×6
    enemyPlanesPerAirbase: 15  // + 航空基地レベル×15
  };
  static installed = false;
  static selectedWingId = null;
  static nextWingNo = 3;

  // ==========================================================
  // 初期化
  // ==========================================================
  static init() {
    if (AirForce.installed) return;
    AirForce.installed = true;
    AirForce.registerCatalog();
    if (typeof BattlePlanManager !== 'undefined') {
      BattlePlanManager.missions.air = Object.values(AirForce.MISSIONS).map(m => ({ id: m.id, label: m.label }));
      AirForce.installHooks();
    }
    CoreEngine.registerTickCallback(() => AirForce.onTick());
    CoreEngine.log('✈️ 空軍システム: 「空軍」ウィンドウで航空隊を基地へ配備し、空域をクリックして任務を与えてください。');
  }

  // 生産カタログに CAS / 戦略爆撃機を追加 (戦闘機と同じ航空機プール)
  static registerCatalog() {
    if (typeof ProductionManager === 'undefined') return;
    const C = ProductionManager.CATALOG;
    if (!C.cas) C.cas = { name: '近接支援機', rate: 0.45, resources: { aluminum: 9, rubber: 3 }, pool: 'military', technology: ['iw_small_airframe', 'basic_small_airframe'] };
    if (!C.strat_bomber) C.strat_bomber = { name: '戦略爆撃機', rate: 0.2, resources: { aluminum: 16, rubber: 4 }, pool: 'military', technology: ['iw_large_airframe', 'iw_medium_airframe', 'basic_large_airframe'] };
  }

  static ensureStock() {
    const s = CoreEngine.gameState;
    if (!s.strategy || typeof ProductionManager === 'undefined') return;
    const a = ProductionManager.account(s.country);
    if (!a.stock) return;
    if (!s.strategy.airInit) {
      a.stock.cas = Math.max(a.stock.cas || 0, 36);
      a.stock.strat_bomber = Math.max(a.stock.strat_bomber || 0, 12);
      s.strategy.airInit = true;
    }
    if (!s.strategy.enemyAir) s.strategy.enemyAir = {};
  }

  static installHooks() {
    // 航空機数の割当: 機種ごとの備蓄で判定
    if (!BattlePlanManager._airForceHooked) {
      BattlePlanManager.setAirWingAircraft = (unitId, requested) => AirForce.setCount(unitId, requested);
      const origDraw = BattlePlanManager.drawOverlay.bind(BattlePlanManager);
      BattlePlanManager.drawOverlay = (ctx, cam, w2s) => { origDraw(ctx, cam, w2s); AirForce.draw(ctx, w2s); };
      const origZone = BattlePlanManager.showZoneInfo.bind(BattlePlanManager);
      BattlePlanManager.showZoneInfo = (unit, pid) => {
        if (unit?.type !== 'air') return origZone(unit, pid);
        AirForce.openZoneModal(pid, unit);
      };
      const origPanel = BattlePlanManager.renderPanel.bind(BattlePlanManager);
      BattlePlanManager.renderPanel = () => { origPanel(); if (WindowManager.isOpen('airforce')) AirForce.render(); };
      BattlePlanManager._airForceHooked = true;
    }
    if (typeof ConstructionManager !== 'undefined' && !ConstructionManager._airForceHooked) {
      const original = ConstructionManager.render.bind(ConstructionManager);
      ConstructionManager.render = () => { original(); AirForce.renderConstructionSection(); };
      ConstructionManager._airForceHooked = true;
    }
  }

  // ==========================================================
  // 航空隊データ
  // ==========================================================
  static wings() { return (BattlePlanManager.air || []).map(w => AirForce.normalize(w)); }
  static wing(id) { const w = (BattlePlanManager.air || []).find(x => x.id === id); return w ? AirForce.normalize(w) : null; }
  static normalize(w) {
    if (!w.aircraftType) w.aircraftType = 'fighter';
    if (!Number.isFinite(w.experience)) w.experience = 20;
    if (!Number.isFinite(w.readiness)) w.readiness = 100;
    if (!Number.isFinite(w.aircraftCount)) w.aircraftCount = 0;
    if (!w.mission) w.mission = 'air_sup';
    return w;
  }
  static stockOf(type) {
    const def = AirForce.AIRCRAFT[type]; if (!def) return 0;
    const stock = ProductionManager.account(CoreEngine.gameState.country).stock || {};
    return def.stockTypes.reduce((n, t) => n + Math.floor(Number(stock[t]) || 0), 0);
  }
  static assignedOf(type, exceptId) {
    return AirForce.wings().filter(w => w.aircraftType === type && w.id !== exceptId).reduce((n, w) => n + (Number(w.aircraftCount) || 0), 0);
  }
  static availableOf(type, exceptId) { return Math.max(0, AirForce.stockOf(type) - AirForce.assignedOf(type, exceptId)); }
  static consumeStock(type, amount) {
    const def = AirForce.AIRCRAFT[type]; if (!def) return;
    const stock = ProductionManager.account(CoreEngine.gameState.country).stock || {};
    let left = amount;
    [...def.stockTypes].reverse().forEach(t => { const have = Math.floor(Number(stock[t]) || 0); const take = Math.min(have, left); stock[t] = have - take; left -= take; });
    if (ProductionManager.syncLocal) ProductionManager.syncLocal();
  }
  // 実効戦力 = 機数 × 稼働率 × 練度係数
  static effective(w) { return (Number(w.aircraftCount) || 0) * (w.readiness / 100) * (0.7 + 0.6 * (w.experience / 100)); }
  static baseCapacity(sid) { const st = MapRenderer.states?.[sid]; return (Number(st?.b?.air_base) || 0) * AirForce.CONFIG.baseCapacityPerLevel; }
  static baseLoad(sid) { return AirForce.wings().filter(w => String(w.baseStateId) === String(sid)).reduce((n, w) => n + (Number(w.aircraftCount) || 0), 0); }

  static createWing() {
    const base = BattlePlanManager.ownedAirbases()[0];
    const center = base ? MapRenderer.stateCenter.get(String(base[0])) : null;
    let no = AirForce.nextWingNo;
    while ((BattlePlanManager.air || []).some(w => w.id === 'air' + no)) no++;
    AirForce.nextWingNo = no + 1;
    const w = { id: 'air' + no, name: '第' + no + '航空隊', type: 'air', base: center ? center.slice() : null, baseStateId: base ? String(base[0]) : null,
      aircraftType: 'fighter', aircraftCount: 0, experience: 20, readiness: 100, range: 450, area: null, target: null, zone: null, mission: 'air_sup', executing: false, progress: 0, strength: 100 };
    BattlePlanManager.air.push(w);
    AirForce.selectedWingId = w.id;
    CoreEngine.log('✈️ ' + w.name + 'を編成しました。');
    AirForce.render();
  }
  static deleteWing(id) {
    const w = AirForce.wing(id); if (!w) return;
    if (!AirForce.confirm(w.name + 'を解隊しますか？ (機体は備蓄に戻ります)')) return;
    BattlePlanManager.air = BattlePlanManager.air.filter(x => x.id !== id);
    if (AirForce.selectedWingId === id) AirForce.selectedWingId = null;
    if (BattlePlanManager.selectedUnitId === id) BattlePlanManager.selectedUnitId = null;
    AirForce.render(); BattlePlanManager.renderPanel();
  }
  static confirm(msg) { return typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(msg) : true; }
  static rename(id, name) { const w = AirForce.wing(id); if (!w) return; const v = String(name || '').trim().slice(0, 30); if (v) w.name = v; AirForce.render(); }
  static select(id) { AirForce.selectedWingId = id; BattlePlanManager.selectedUnitId = id; AirForce.render(); }

  static setBase(id, sid) {
    const w = AirForce.wing(id); if (!w) return;
    if (!sid) { w.baseStateId = null; w.base = null; w.executing = false; AirForce.render(); return; }
    const cap = AirForce.baseCapacity(sid), load = AirForce.baseLoad(sid) - (String(w.baseStateId) === String(sid) ? w.aircraftCount : 0);
    if (load + w.aircraftCount > cap) GameUI.notify('⚠️ ' + (MapRenderer.states[sid]?.name || '基地') + 'の収容能力 (' + cap + '機) を超えます — 稼働率が低下します。', 'alert');
    const ok = BattlePlanManager.assignAirbase(id, sid);
    if (ok) { w.executing = false; w.progress = 0; w.zone = null; CoreEngine.log('✈️ ' + w.name + 'を' + (MapRenderer.states[sid]?.name || sid) + 'の航空基地へ移動しました。'); }
    AirForce.render();
  }
  static setType(id, type) {
    const w = AirForce.wing(id); if (!w || !AirForce.AIRCRAFT[type]) return;
    if (w.aircraftType === type) return;
    w.aircraftType = type; w.aircraftCount = 0; w.executing = false; w.progress = 0;
    const def = AirForce.AIRCRAFT[type];
    if (!def.missions.includes(w.mission)) w.mission = def.missions[0];
    AirForce.render();
  }
  static setCount(id, requested) {
    const w = AirForce.wing(id); if (!w) return false;
    const n = Math.floor(Number(requested));
    if (!Number.isFinite(n) || n < 0) return false;
    const avail = AirForce.availableOf(w.aircraftType, id);
    if (n > avail) { GameUI.notify('配備可能な' + AirForce.AIRCRAFT[w.aircraftType].name + 'は' + avail + '機です。', 'alert'); w.aircraftCount = avail; }
    else w.aircraftCount = n;
    if (!w.aircraftCount) { w.executing = false; w.progress = 0; }
    AirForce.render(); BattlePlanManager.renderPanel();
    return true;
  }
  static fillCount(id) { const w = AirForce.wing(id); if (!w) return; AirForce.setCount(id, w.aircraftCount + AirForce.availableOf(w.aircraftType, id)); }
  static setMission(id, mission) {
    const w = AirForce.wing(id); if (!w || !AirForce.MISSIONS[mission]) return;
    const def = AirForce.AIRCRAFT[w.aircraftType];
    if (!def.missions.includes(mission)) { GameUI.notify('⚠️ ' + def.name + 'は「' + AirForce.MISSIONS[mission].label + '」を実行できません。', 'alert'); AirForce.render(); return; }
    w.mission = mission;
    if (w.zone) w.zone.mission = mission;
    if (BattlePlanManager.selectedUnitId === id) BattlePlanManager.activeMission.air = mission;
    AirForce.render();
  }
  // 「空域を選ぶ」: 地図クリックで空域指定できるよう部隊を選択状態にする
  static pickZone(id) {
    const w = AirForce.wing(id); if (!w) return;
    if (!BattlePlanManager.airWingReady(w)) { GameUI.notify('航空基地と機体を配備してから空域を指定してください。', 'alert'); return; }
    BattlePlanManager.activeForce = 'air';
    BattlePlanManager.selectedUnitId = id;
    BattlePlanManager.activeMission.air = w.mission;
    ArmyRoster.moveTool = false; ArmyRoster.frontTool = false; BattlePlanManager.arrowTool = false;
    if (WindowManager.windows.get('airforce')) WindowManager.minimize('airforce');
    GameUI.notify('✈️ ' + w.name + ': マップ上の空域 (州) を左クリックして任務空域を指定してください (射程 ' + BattlePlanManager.airRange(w) + ')', 'success');
    BattlePlanManager.renderPanel();
  }
  static setZoneByState(id, sid) {
    const w = AirForce.wing(id); if (!w) return false;
    const c = MapRenderer.stateCenter.get(String(sid)); if (!c) return false;
    const st = MapRenderer.states[sid];
    const pid = st?.provinces?.find(p => OffensivePlanner.isLand(p)) || st?.provinces?.[0];
    if (!BattlePlanManager.airTargetInRange(w, c)) { GameUI.notify('射程外です。前線基地へ移動するか増槽を装着してください。', 'alert'); return false; }
    w.zone = { pid, x: c[0], y: c[1], sid: String(sid), mission: w.mission };
    w.area = null; w.target = null; w.executing = false; w.progress = 0;
    return true;
  }
  static start(id) {
    const w = AirForce.wing(id); if (!w) return;
    if (w.zone && !w.zone.sid) w.zone.sid = String(MapRenderer.stateOf(w.zone.pid) || '');
    BattlePlanManager.execute(id);
    AirForce.render();
  }
  static stop(id) { BattlePlanManager.abort(id); AirForce.render(); }

  // ==========================================================
  // 制空権計算
  // ==========================================================
  static zoneSid(w) {
    if (!w.zone) return null;
    if (!w.zone.sid) w.zone.sid = String(MapRenderer.stateOf(w.zone.pid) || '');
    return w.zone.sid || null;
  }
  static inZone(w, sid) {
    if (!w.zone) return false;
    if (String(AirForce.zoneSid(w)) === String(sid)) return true;
    const c = MapRenderer.stateCenter.get(String(sid));
    return !!c && Math.hypot(w.zone.x - c[0], w.zone.y - c[1]) <= AirForce.CONFIG.zoneRadius;
  }
  static ownAirPower(sid) {
    return AirForce.wings().filter(w => w.executing && AirForce.inZone(w, sid)).reduce((n, w) => {
      const def = AirForce.AIRCRAFT[w.aircraftType];
      const weight = w.mission === 'air_sup' ? def.airAttack : def.airAttack * 0.4;
      return n + AirForce.effective(w) * weight;
    }, 0);
  }
  // 敵航空戦力の推定: 半径内の敵国州にある航空基地と敵師団数から算出 (損耗で減少)
  static enemyAirPower(sid) {
    const s = CoreEngine.gameState, me = s.country;
    const c = MapRenderer.stateCenter.get(String(sid)); if (!c) return { power: 0, tags: [] };
    const enemies = new Set(s.atWar || []);
    if (!enemies.size) return { power: 0, tags: [] };
    let power = 0; const tags = new Set();
    Object.entries(MapRenderer.states || {}).forEach(([id, st]) => {
      if (!enemies.has(st.owner) || st.owner === me) return;
      const cc = MapRenderer.stateCenter.get(String(id)); if (!cc) return;
      if (Math.hypot(cc[0] - c[0], cc[1] - c[1]) > AirForce.CONFIG.zoneRadius) return;
      const base = Number(st.b?.air_base) || 0;
      if (base > 0) { power += base * AirForce.CONFIG.enemyPlanesPerAirbase; tags.add(st.owner); }
    });
    // 師団数ベースの戦力 (国全体の推定値を基地数で按分)
    enemies.forEach(tag => {
      const strength = AirForce.enemyStrength(tag);
      const bases = Object.values(MapRenderer.states).filter(st => st.owner === tag && Number(st.b?.air_base) > 0).length || 1;
      const near = Object.entries(MapRenderer.states).filter(([id, st]) => st.owner === tag && Number(st.b?.air_base) > 0 && (() => { const cc = MapRenderer.stateCenter.get(String(id)); return cc && Math.hypot(cc[0] - c[0], cc[1] - c[1]) <= AirForce.CONFIG.zoneRadius; })()).length;
      if (near) { power += strength * (near / bases); tags.add(tag); }
    });
    return { power, tags: [...tags] };
  }
  static enemyStrength(tag) {
    const s = CoreEngine.gameState;
    s.strategy.enemyAir ||= {};
    if (!s.strategy.enemyAir[tag]) {
      const divisions = (typeof StrategyGame !== 'undefined' && StrategyGame.INITIAL?.[tag]) || 20;
      s.strategy.enemyAir[tag] = { planes: divisions * AirForce.CONFIG.enemyPlanesPerDivision };
    }
    return Math.max(0, s.strategy.enemyAir[tag].planes);
  }
  static superiority(sid) {
    const own = AirForce.ownAirPower(sid);
    const enemy = AirForce.enemyAirPower(sid);
    const total = own + enemy.power;
    const ratio = total > 0 ? own / total : 0.5;
    return { own, enemy: enemy.power, enemyTags: enemy.tags, ratio, percent: Math.round(ratio * 100), contested: total > 0,
      level: total <= 0 ? 'none' : ratio >= 0.75 ? 'dominant' : ratio >= 0.5 ? 'advantage' : ratio >= 0.25 ? 'contested' : 'lost' };
  }
  static LEVELS = { none: { label: '未争奪', color: '#8a9aaa' }, dominant: { label: '制空権確保', color: '#3cc464' }, advantage: { label: '優勢', color: '#9ccc50' }, contested: { label: '拮抗', color: '#e0c040' }, lost: { label: '制空権喪失', color: '#e04a3c' } };

  // 戦闘への CAS ボーナス (攻撃側がプレイヤーなら攻撃力、防御側がプレイヤーなら防御力を強化)
  static casBonus(battle) {
    if (!battle || !MapRenderer.ready) return 0;
    const sid = battle.stateId != null ? String(battle.stateId) : String(MapRenderer.stateOf(battle.provId) || '');
    if (!sid) return 0;
    const cas = AirForce.wings().filter(w => w.executing && w.mission === 'ground' && AirForce.inZone(w, sid));
    if (!cas.length) return 0;
    const raw = cas.reduce((n, w) => n + AirForce.effective(w) * AirForce.AIRCRAFT[w.aircraftType].groundAttack, 0) * AirForce.CONFIG.casPerPlane;
    const sup = AirForce.superiority(sid);
    const doctrine = typeof DoctrineManager !== 'undefined' && DoctrineManager.modifier ? (Number(DoctrineManager.modifier('air', 'groundAttack')) || 0) : 0;
    const bonus = Math.min(AirForce.CONFIG.casMax, raw * (0.25 + 0.75 * sup.ratio) * (1 + doctrine));
    battle.casBonus = +bonus.toFixed(3);
    battle.casWings = cas.map(w => w.name);
    return bonus;
  }

  // ==========================================================
  // Tick (1時間)
  // ==========================================================
  static onTick() {
    if (!MapRenderer.ready) return;
    AirForce.ensureStock();
    const s = CoreEngine.gameState;
    const hour = (AirForce._hour = (AirForce._hour || 0) + 1);
    const wings = AirForce.wings();
    const losses = {};
    wings.forEach(w => {
      const flying = w.executing && w.aircraftCount > 0 && w.zone;
      const cap = AirForce.baseCapacity(w.baseStateId), load = AirForce.baseLoad(w.baseStateId);
      const over = cap > 0 && load > cap ? cap / load : 1;
      if (flying) {
        w.readiness = Math.max(5, w.readiness - AirForce.CONFIG.readinessFlyPerHour / Math.max(0.3, over));
        w.experience = Math.min(100, w.experience + AirForce.CONFIG.xpPerHour);
        if (w.readiness <= 10) { w.executing = false; w.progress = 0; GameUI.notify('✈️ ' + w.name + 'は稼働率低下のため基地へ帰還しました。', 'alert'); }
      } else {
        w.readiness = Math.min(100 * over, w.readiness + AirForce.CONFIG.readinessRestPerHour);
      }
    });
    // 1日1回: 空戦損耗・戦略爆撃
    if (hour % 24 === 0) {
      const zones = new Map();
      wings.forEach(w => { if (w.executing && w.zone) { const sid = AirForce.zoneSid(w); if (sid) { if (!zones.has(sid)) zones.set(sid, []); zones.get(sid).push(w); } } });
      zones.forEach((list, sid) => {
        const sup = AirForce.superiority(sid);
        if (!sup.contested) return;
        const enemyShare = 1 - sup.ratio;
        list.forEach(w => {
          const def = AirForce.AIRCRAFT[w.aircraftType];
          const aa = Number(MapRenderer.states[sid]?.b?.anti_air_building) || 0;
          let rate = 0.006 * enemyShare * (w.mission === 'air_sup' ? 1 : 1.6) * (1 - w.experience / 250);
          if (w.mission !== 'air_sup' && MapRenderer.states[sid]?.owner !== s.country) rate += aa * 0.0015;
          const lost = Math.min(w.aircraftCount, Math.round(w.aircraftCount * rate + (Math.random() < (w.aircraftCount * rate % 1) ? 1 : 0)));
          if (lost > 0) { w.aircraftCount -= lost; AirForce.consumeStock(w.aircraftType, lost); losses[w.name] = (losses[w.name] || 0) + lost; }
          // 敵機撃墜 (制空任務の戦闘機)
          if (w.mission === 'air_sup' && sup.enemyTags.length) {
            const kills = AirForce.effective(w) * def.airAttack * 0.01 * (0.5 + sup.ratio);
            sup.enemyTags.forEach(tag => { const e = s.strategy.enemyAir[tag]; if (e) e.planes = Math.max(0, e.planes - kills / sup.enemyTags.length); });
          }
          if (w.mission === 'strategic') {
            if (typeof AirNavalDesign !== 'undefined') AirNavalDesign.strategicStrike(w, sid, sup);
            else AirForce.strategicBombing(w, sid, sup);
          }
          w.experience = Math.min(100, w.experience + 0.5);
        });
        // 国家の制空権指標 (核攻撃条件などで参照) を空域の平均に寄せる
        s.airSupremacy = Math.round(Math.max(0, Math.min(100, (s.airSupremacy || 0) * 0.7 + sup.percent * 0.3)));
      });
      Object.entries(losses).forEach(([name, n]) => CoreEngine.log('✈️ ' + name + ': 空戦・対空砲で' + n + '機を喪失'));
      if (WindowManager.isOpen('airforce')) AirForce.render();
    }
  }

  static strategicBombing(w, sid, sup) {
    const st = MapRenderer.states[sid];
    if (!st || st.owner === CoreEngine.gameState.country || !(CoreEngine.gameState.atWar || []).includes(st.owner)) return;
    const power = AirForce.effective(w) * AirForce.AIRCRAFT[w.aircraftType].strategic * (0.3 + 0.7 * sup.ratio);
    const chance = Math.min(0.9, power / 60);
    if (Math.random() > chance) return;
    const targets = ['infrastructure', 'arms_factory', 'industrial_complex', 'air_base', 'supply_hub'].filter(k => Number(st.b?.[k]) > 0);
    if (!targets.length) return;
    const key = targets[Math.floor(Math.random() * targets.length)];
    st.b[key] -= 1;
    const names = { infrastructure: 'インフラ', arms_factory: '軍需工場', industrial_complex: '民需工場', air_base: '航空基地', supply_hub: '補給ハブ' };
    CoreEngine.log('🏭 ' + w.name + 'の戦略爆撃: ' + st.name + 'の' + names[key] + 'を破壊 (Lv.' + (st.b[key] + 1) + '→' + st.b[key] + ')');
    GameUI.notify('🏭 戦略爆撃成功: ' + st.name + ' ' + names[key] + ' -1', 'success');
    MapRenderer.invalidateModes();
  }

  // ==========================================================
  // マップ描画: 任務中の航空隊の空域と制空権
  // ==========================================================
  static stateRGB(sid) {
    const st = MapRenderer.states?.[sid];
    if (!st) return null;
    const has = AirForce.wings().some(w => w.executing && AirForce.inZone(w, sid));
    if (!has) return null;
    const sup = AirForce.superiority(sid);
    const lv = AirForce.LEVELS[sup.level];
    const hex = lv.color.replace('#', '');
    return [parseInt(hex.slice(0, 2), 16) * 0.75 | 0, parseInt(hex.slice(2, 4), 16) * 0.75 | 0, parseInt(hex.slice(4, 6), 16) * 0.75 | 0];
  }
  static draw(ctx, w2s) {
    if (!MapRenderer.ready) return;
    const wings = AirForce.wings().filter(w => w.zone && (w.executing || w.id === BattlePlanManager.selectedUnitId));
    if (!wings.length) return;
    const scale = MapRenderer.cam.scale, time = Date.now() / 1000;
    ctx.save();
    const drawn = new Set();
    wings.forEach(w => {
      const m = AirForce.MISSIONS[w.mission] || AirForce.MISSIONS.air_sup;
      const s = w2s(w.zone.x, w.zone.y);
      const r = AirForce.CONFIG.zoneRadius * scale;
      ctx.strokeStyle = m.color; ctx.lineWidth = w.executing ? 2 : 1; ctx.setLineDash(w.executing ? [10, 6] : [3, 6]); ctx.lineDashOffset = -(time * 12) % 16;
      ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.08; ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      // 基地→空域の航路
      if (w.base) { const b = w2s(w.base[0], w.base[1]); ctx.strokeStyle = m.color; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(s[0], s[1]); ctx.stroke(); ctx.setLineDash([]); }
      const sid = AirForce.zoneSid(w);
      if (sid && !drawn.has(sid)) {
        drawn.add(sid);
        const sup = AirForce.superiority(sid);
        const lv = AirForce.LEVELS[sup.level];
        const text = '✈ 制空 ' + sup.percent + '%';
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(s[0] - tw / 2, s[1] - 30, tw, 16);
        ctx.strokeStyle = lv.color; ctx.lineWidth = 1; ctx.strokeRect(s[0] - tw / 2, s[1] - 30, tw, 16);
        ctx.fillStyle = lv.color; ctx.fillText(text, s[0], s[1] - 22);
        // 制空権バー
        ctx.fillStyle = '#5a1f1f'; ctx.fillRect(s[0] - tw / 2, s[1] - 13, tw, 3);
        ctx.fillStyle = lv.color; ctx.fillRect(s[0] - tw / 2, s[1] - 13, tw * sup.ratio, 3);
      }
      // 任務アイコン
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = m.color; ctx.fillText(m.icon, s[0], s[1]);
    });
    ctx.restore();
  }

  // ==========================================================
  // UI: 空軍ウィンドウ
  // ==========================================================
  static esc(v) { return typeof GameTools !== 'undefined' ? GameTools.escape(v) : String(v ?? ''); }
  static bar(v, color) { return '<i class="af-bar"><em style="width:' + Math.max(0, Math.min(100, v)) + '%;background:' + color + '"></em></i>'; }

  static render() {
    const el = document.getElementById('airforce-content');
    if (!el) return;
    AirForce.ensureStock();
    const wings = AirForce.wings();
    if (!AirForce.selectedWingId && wings.length) AirForce.selectedWingId = wings[0].id;
    const bases = MapRenderer.ready ? BattlePlanManager.ownedAirbases() : [];
    let html = '<div class="af-root">' +
      '<div class="af-header"><div class="af-title"><span class="af-mark">✈</span><div><h3>空軍 <small>AIR WINGS &amp; MISSIONS</small></h3><p>備蓄航空機を航空基地へ航空隊として配備し、空域 (州) をクリックして 制空 / 近接航空支援 / 戦略爆撃 を命じます。</p></div></div>' +
      '<div class="af-actions"><button class="dd-btn primary" onclick="AirForce.createWing()">＋ 航空隊を新設</button><button class="dd-btn ghost" onclick="MapRenderer.setMode(\'air\')">🗺 制空マップ</button></div></div>' +
      '<div class="af-body">';
    // --- 左: 備蓄 + 基地 ---
    html += '<aside class="af-side"><div class="dd-pane-title">備蓄航空機</div><div class="af-stock">';
    Object.values(AirForce.AIRCRAFT).forEach(def => {
      const total = AirForce.stockOf(def.id), used = AirForce.assignedOf(def.id);
      html += '<div class="af-stock-row"><span>' + def.icon + ' ' + def.name + '</span>' + AirForce.bar(total ? used / total * 100 : 0, '#5d93c2') + '<b>' + (total - used) + ' <small>/ ' + total + '</small></b></div>';
    });
    html += '<p class="sn-help">生産ラインで 戦闘機 / 近接支援機 / 戦略爆撃機 を生産すると備蓄が増えます。</p></div>' +
      '<div class="dd-pane-title">航空基地 <span>' + bases.length + '</span></div><div class="af-bases">';
    if (!bases.length) html += '<p class="sn-help">航空基地がありません。建設ウィンドウで「航空基地」を建設してください。</p>';
    bases.forEach(([sid, st]) => {
      const cap = AirForce.baseCapacity(sid), load = AirForce.baseLoad(sid);
      const over = load > cap;
      html += '<div class="af-base' + (over ? ' over' : '') + '"><div><b>' + AirForce.esc(st.name) + '</b> <small>Lv.' + st.b.air_base + '</small></div>' +
        AirForce.bar(cap ? load / cap * 100 : 0, over ? '#e04a3c' : '#c9a44c') + '<small>' + load + ' / ' + cap + '機' + (over ? ' ⚠ 過密' : '') + '</small>' +
        '<button class="af-mini" onclick="ConstructionManager.selectState(\'' + sid + '\');GameUI.switchTab(\'construction\')">拡張</button></div>';
    });
    html += '</div></aside>';
    // --- 中央: 航空隊 ---
    html += '<main class="af-main"><div class="dd-pane-title">航空隊 <span>' + wings.length + '</span></div><div class="af-wings">';
    if (!wings.length) html += '<p class="sn-help">航空隊がありません。「＋ 航空隊を新設」で編成してください。</p>';
    wings.forEach(w => html += AirForce.renderWing(w, bases));
    html += '</div></main>';
    // --- 右: 空域状況 ---
    html += '<aside class="af-side right"><div class="dd-pane-title">空域・制空権</div><div class="af-zones">';
    const zoneSids = [...new Set(wings.filter(w => w.zone).map(w => AirForce.zoneSid(w)).filter(Boolean))];
    if (!zoneSids.length) html += '<p class="sn-help">任務空域がありません。航空隊の「空域を選ぶ」からマップ上の州をクリックしてください。</p>';
    zoneSids.forEach(sid => html += AirForce.renderZoneCard(sid));
    const battles = (typeof BattleManager !== 'undefined' ? BattleManager.battles : []).filter(b => b.casBonus > 0);
    if (battles.length) {
      html += '<div class="dd-pane-title">CAS 支援中の戦闘</div>';
      battles.forEach(b => html += '<div class="af-zone"><b>' + AirForce.esc(MapRenderer.states[b.stateId]?.name || '州' + b.stateId) + '</b><small>' + (b.casWings || []).join(', ') + '</small><div class="af-zone-row"><span>攻撃ボーナス</span><b style="color:#e0a040">+' + Math.round(b.casBonus * 100) + '%</b></div></div>');
    }
    html += '</div></aside></div></div>';
    el.innerHTML = html;
  }

  static renderWing(w, bases) {
    const def = AirForce.AIRCRAFT[w.aircraftType];
    const sel = w.id === AirForce.selectedWingId;
    const ready = BattlePlanManager.airWingReady(w);
    const zoneName = w.zone ? (MapRenderer.states[AirForce.zoneSid(w)]?.name || ('プロビンス ' + w.zone.pid)) : null;
    const avail = AirForce.availableOf(w.aircraftType, w.id);
    const m = AirForce.MISSIONS[w.mission] || AirForce.MISSIONS.air_sup;
    const sup = w.zone && AirForce.zoneSid(w) ? AirForce.superiority(AirForce.zoneSid(w)) : null;
    return '<div class="af-wing' + (sel ? ' selected' : '') + (w.executing ? ' flying' : '') + '" data-wing-id="' + w.id + '" onclick="AirForce.select(\'' + w.id + '\')">' +
      '<div class="af-wing-head"><span class="af-wing-icon">' + def.icon + '</span>' +
      '<input class="af-name" value="' + AirForce.esc(w.name) + '" onclick="event.stopPropagation()" onchange="AirForce.rename(\'' + w.id + '\',this.value)">' +
      '<span class="af-status ' + (w.executing ? 'on' : '') + '">' + (w.executing ? m.icon + ' ' + m.label + '中' : ready ? '待機' : '未配備') + '</span>' +
      '<button class="af-mini danger" onclick="event.stopPropagation();AirForce.deleteWing(\'' + w.id + '\')" title="解隊">✕</button></div>' +
      '<div class="af-wing-grid" onclick="event.stopPropagation()">' +
      '<label>基地<select onchange="AirForce.setBase(\'' + w.id + '\',this.value)"><option value="">未配備</option>' + bases.map(([sid, st]) => '<option value="' + sid + '"' + (String(sid) === String(w.baseStateId) ? ' selected' : '') + '>' + AirForce.esc(st.name) + ' (Lv.' + st.b.air_base + ' ' + AirForce.baseLoad(sid) + '/' + AirForce.baseCapacity(sid) + ')</option>').join('') + '</select></label>' +
      '<label>機種<select onchange="AirForce.setType(\'' + w.id + '\',this.value)">' + Object.values(AirForce.AIRCRAFT).map(d => '<option value="' + d.id + '"' + (d.id === w.aircraftType ? ' selected' : '') + '>' + d.icon + ' ' + d.name + ' (' + AirForce.availableOf(d.id, w.id) + ')</option>').join('') + '</select></label>' +
      '<label>機体数<span class="af-count"><input type="number" min="0" max="' + (w.aircraftCount + avail) + '" value="' + w.aircraftCount + '" onchange="AirForce.setCount(\'' + w.id + '\',this.value)"><button class="af-mini" onclick="AirForce.fillCount(\'' + w.id + '\')" title="配備可能な全機を割り当て">最大</button></span></label>' +
      '<label>任務<select onchange="AirForce.setMission(\'' + w.id + '\',this.value)">' + Object.values(AirForce.MISSIONS).map(x => '<option value="' + x.id + '"' + (x.id === w.mission ? ' selected' : '') + ((typeof AirNavalDesign !== 'undefined' ? AirNavalDesign.missionAllowed(w, x.id) : def.missions.includes(x.id)) ? '' : ' disabled') + '>' + x.icon + ' ' + x.label + '</option>').join('') + '</select></label>' +
      '</div>' +
      (typeof AirNavalDesign !== 'undefined' ? AirNavalDesign.wingSlotHTML(w) : '') +
      '<div class="af-wing-stats" onclick="event.stopPropagation()">' +
      '<div><span>練度</span>' + AirForce.bar(w.experience, '#c9a44c') + '<b>' + Math.round(w.experience) + '%</b></div>' +
      '<div><span>稼働率</span>' + AirForce.bar(w.readiness, w.readiness > 50 ? '#7fa84f' : '#e04a3c') + '<b>' + Math.round(w.readiness) + '%</b></div>' +
      '<div><span>稼働機数</span><i></i><b>' + Math.round(w.aircraftCount * w.readiness / 100) + ' / ' + w.aircraftCount + '</b></div>' +
      '<div><span>実効戦力</span><i></i><b>' + AirForce.effective(w).toFixed(0) + '</b></div>' +
      '</div>' +
      '<div class="af-wing-foot" onclick="event.stopPropagation()">' +
      '<span class="af-zone-label">空域: ' + (zoneName ? '<b>' + AirForce.esc(zoneName) + '</b>' + (sup ? ' <span style="color:' + AirForce.LEVELS[sup.level].color + '">制空 ' + sup.percent + '%</span>' : '') : '<i>未指定</i>') + ' <small>射程 ' + BattlePlanManager.airRange(w) + '</small></span>' +
      '<button class="dd-btn ghost" onclick="AirForce.pickZone(\'' + w.id + '\')"' + (ready ? '' : ' disabled') + '>🎯 空域を選ぶ</button>' +
      (w.executing ? '<button class="dd-btn" onclick="AirForce.stop(\'' + w.id + '\')">■ 任務中止</button>' : '<button class="dd-btn primary" onclick="AirForce.start(\'' + w.id + '\')"' + (ready && w.zone ? '' : ' disabled') + '>▶ 任務開始</button>') +
      '</div></div>';
  }

  static renderZoneCard(sid) {
    const st = MapRenderer.states[sid];
    const sup = AirForce.superiority(sid);
    const lv = AirForce.LEVELS[sup.level];
    const here = AirForce.wings().filter(w => AirForce.zoneSid(w) === String(sid));
    return '<div class="af-zone" onclick="AirForce.openZoneModal(null,null,\'' + sid + '\')"><b>☁️ ' + AirForce.esc(st?.name || '州' + sid) + '</b>' +
      '<div class="af-sup"><em style="width:' + sup.percent + '%"></em><span>' + sup.percent + '%</span></div>' +
      '<div class="af-zone-row"><span style="color:' + lv.color + '">' + lv.label + '</span><small>自軍 ' + sup.own.toFixed(0) + ' / 敵 ' + sup.enemy.toFixed(0) + (sup.enemyTags.length ? ' (' + sup.enemyTags.join(',') + ')' : '') + '</small></div>' +
      '<small>' + here.map(w => (AirForce.MISSIONS[w.mission]?.icon || '') + ' ' + AirForce.esc(w.name) + (w.executing ? '' : ' (待機)')).join(' / ') + '</small></div>';
  }

  // 空域 (州) の制空権ウィンドウ — マップの空域クリック / 州情報の「空域情報」ボタン
  static openZoneModal(pid, unit, sidArg) {
    const sid = sidArg ? String(sidArg) : String(MapRenderer.stateOf(pid) || '');
    const st = MapRenderer.states[sid];
    if (!st) { GameUI.notify('陸上の空域 (州) を選択してください。', 'alert'); return; }
    if (unit && pid) { unit.zone.sid = sid; }
    const sup = AirForce.superiority(sid);
    const lv = AirForce.LEVELS[sup.level];
    const own = AirForce.wings().filter(w => AirForce.inZone(w, sid));
    const battles = (typeof BattleManager !== 'undefined' ? BattleManager.battles : []).filter(b => String(b.stateId) === sid);
    const name = typeof WarSystems !== 'undefined' && pid ? WarSystems.provinceName(pid) : st.name;
    const html = '<div class="af-modal">' +
      '<div class="af-modal-head"><span>☁️</span><div><h3>空域: ' + AirForce.esc(st.name) + '</h3><small>' + AirForce.esc(name) + ' / 所有: ' + AirForce.esc(st.owner || '無所属') + ' / 航空基地 Lv.' + (Number(st.b?.air_base) || 0) + ' / 対空砲 Lv.' + (Number(st.b?.anti_air_building) || 0) + '</small></div></div>' +
      '<div class="af-modal-sup"><div class="af-sup big"><em style="width:' + sup.percent + '%"></em><span>自軍 ' + sup.percent + '% ／ 敵軍 ' + (100 - sup.percent) + '%</span></div>' +
      '<div class="af-modal-row"><b style="color:' + lv.color + '">' + lv.label + '</b><span>自軍航空戦力 ' + sup.own.toFixed(0) + ' / 敵推定 ' + sup.enemy.toFixed(0) + (sup.enemyTags.length ? ' (' + sup.enemyTags.join(', ') + ')' : ' (敵なし)') + '</span></div></div>' +
      '<div class="af-modal-list"><h4>この空域の航空隊</h4>' + (own.length ? own.map(w => '<div class="af-zone-row"><span>' + AirForce.AIRCRAFT[w.aircraftType].icon + ' ' + AirForce.esc(w.name) + ' ×' + w.aircraftCount + '</span><b>' + (AirForce.MISSIONS[w.mission]?.label || w.mission) + (w.executing ? '' : ' (待機)') + '</b></div>').join('') : '<small>なし</small>') + '</div>' +
      (battles.length ? '<div class="af-modal-list"><h4>⚔️ 進行中の戦闘</h4>' + battles.map(b => '<div class="af-zone-row"><span>' + b.attacker + ' → ' + b.defender + ' (' + Math.round(b.progress * 100) + '%)</span><b style="color:#e0a040">CAS +' + Math.round((b.casBonus || 0) * 100) + '%</b></div>').join('') + '</div>' : '') +
      '<div class="af-modal-actions">' +
      (unit ? '<button class="army-btn" onclick="GameUI.closeModal();AirForce.start(\'' + unit.id + '\')">▶ ' + AirForce.esc(unit.name) + ' をこの空域で任務開始 (' + (AirForce.MISSIONS[unit.zone?.mission || unit.mission]?.label || '') + ')</button>' : '') +
      '<button class="army-btn" style="background:var(--bg-panel-light)" onclick="GameUI.closeModal();GameUI.switchTab(\'airforce\')">✈️ 空軍ウィンドウ</button>' +
      '</div></div>';
    GameUI.openModal('✈️ 空域情報 — ' + st.name, html);
  }

  // 州情報オーバーレイ用の1行
  static summaryLine(sid) {
    if (!MapRenderer.ready) return '';
    const sup = AirForce.superiority(sid);
    const lv = AirForce.LEVELS[sup.level];
    return '<span style="font-size:11px;color:' + lv.color + '">✈️ 制空権 ' + sup.percent + '% (' + lv.label + ')</span> <button class="map-info-build-btn" onclick="AirForce.openZoneModal(null,null,\'' + sid + '\')">☁️ 空域情報</button>';
  }

  // 建設ウィンドウ: 航空基地の拡張
  static renderConstructionSection() {
    const container = document.getElementById('construction-content');
    if (!container) return;
    let section = document.getElementById('airbase-section');
    if (!section) {
      section = document.createElement('div'); section.id = 'airbase-section';
      const anchor = document.getElementById('supply-network-section') || container.querySelector('.con-state-card');
      if (anchor && anchor.parentNode === container) anchor.insertAdjacentElement('afterend', section); else container.appendChild(section);
    }
    const sid = ConstructionManager.selectedStateId ? String(ConstructionManager.selectedStateId) : null;
    const st = sid ? MapRenderer.states[sid] : null;
    if (!st || st.owner !== CoreEngine.gameState.country) { section.innerHTML = ''; return; }
    const level = Number(st.b?.air_base) || 0;
    const queued = (ConstructionManager.queue || []).filter(q => String(q.stateId) === sid && q.building === 'air_base').length;
    const cap = AirForce.baseCapacity(sid), load = AirForce.baseLoad(sid);
    const wings = AirForce.wings().filter(w => String(w.baseStateId) === sid);
    section.innerHTML = '<div class="sp-section sn-section"><h3>✈️ 航空基地 (Air Base) <button class="sn-mode-btn" onclick="GameUI.switchTab(\'airforce\')">✈ 空軍ウィンドウ</button></h3>' +
      '<div class="sn-state"><div class="sn-rows"><div class="sn-row"><span>✈️ 航空基地</span>' + SupplyNetworkPips(level, AirForce.CONFIG.maxBaseLevel) + '<b>Lv.' + level + '/' + AirForce.CONFIG.maxBaseLevel + '</b>' +
      (queued ? '<small>+' + queued + ' 建設中</small>' : '') +
      '<button class="con-build-btn" onclick="ConstructionManager.selectedStateId=\'' + sid + '\';ConstructionManager.enqueue(\'air_base\')"' + (level + queued >= AirForce.CONFIG.maxBaseLevel ? ' disabled' : '') + '>' + (level ? '拡張' : '建設') + ' (240日)</button></div></div>' +
      '<div class="sn-stats"><div><span>収容能力</span><b>' + cap + '機 (Lv×' + AirForce.CONFIG.baseCapacityPerLevel + ')</b></div><div><span>駐留機数</span><b' + (load > cap ? ' style="color:#e04a3c"' : '') + '>' + load + '機' + (load > cap ? ' ⚠ 過密 (稼働率低下)' : '') + '</b></div>' +
      '<div><span>駐留航空隊</span><b>' + (wings.length ? wings.map(w => AirForce.esc(w.name)).join(', ') : 'なし') + '</b></div><div><span>制空権</span><b>' + AirForce.superiority(sid).percent + '%</b></div></div></div></div>';
    function SupplyNetworkPips(l, max) { return typeof SupplyNetwork !== 'undefined' ? SupplyNetwork.pips(l, max, 'infra') : ''; }
  }
}

window.AirForce = AirForce;
