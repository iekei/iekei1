/* occupation.js — HOI4風「占領地管理・レジスタンス・鎮圧 (Resistance & Compliance)」
 *
 *  - 占領州 (自国が所有するが元の所有国が異なる非中核州) ごとに レジスタンス度 / 順応度 (0–100%) を持つ
 *  - レジスタンスが高いと: 占領地の工場利用率低下・インフラ損壊イベント・州内の師団への消耗ダメージ
 *    順応度が高いと: 非中核州の工場・資源の利用率と徴兵可能人口が増加
 *  - 占領政策 (地方自治 / 市民監視 / 秘密警察 / 戒厳令 / 強制労働 / 強制同化) を全体または州ごとに選択。
 *    政策に応じて鎮圧師団に必要な 歩兵装備 (または戦車=装甲車代替) と人的資源 が自動で割り当て・消費される
 *  - レジスタンス 50% 以上の州には地図上に赤い警報アイコンを表示
 */
class OccupationSystem {
  static LAWS = [
    { id: 'autonomy',   name: '地方自治',   icon: '🏘️', garrison: 0.25, resistTarget: 15, compliance: 0.18, output: 0.0,  mp: 1.0, desc: '現地政府に行政を委ねる。鎮圧コスト最小・順応度上昇が最も早いが、工場利用率は低い。' },
    { id: 'civilian',   name: '市民監視',   icon: '👁️', garrison: 0.5,  resistTarget: 25, compliance: 0.12, output: 0.1,  mp: 1.0, desc: '標準的な占領統治。バランス型。' },
    { id: 'police',     name: '秘密警察',   icon: '🕵️', garrison: 0.75, resistTarget: 20, compliance: 0.06, output: 0.15, mp: 0.8, desc: '抵抗組織を摘発。レジスタンス抑制に優れるが順応度は上がりにくい。' },
    { id: 'martial',    name: '戒厳令',     icon: '⚔️', garrison: 1.25, resistTarget: 35, compliance: 0.02, output: 0.2,  mp: 0.5, desc: '軍政下に置く。鎮圧師団が多く必要だが工場利用率は高い。順応度はほぼ上がらない。' },
    { id: 'forced',     name: '強制労働',   icon: '⛓️', garrison: 1.5,  resistTarget: 55, compliance: -0.05, output: 0.35, mp: 0.3, desc: '住民を労働に動員。工場・資源の利用率が最大だがレジスタンスが急増し順応度が低下する。' },
    { id: 'assimilate', name: '強制同化',   icon: '📣', garrison: 1.0,  resistTarget: 40, compliance: 0.25, output: 0.1,  mp: 1.5, desc: '住民を自国民として同化。順応度の上昇が非常に早く徴兵も増えるがレジスタンスは高め。' },
  ];
  static GARRISON_TYPES = {
    infantry: { name: '歩兵 (歩兵装備)', icon: '🪖', equip: 'infantry', equipPer: 30, mpPer: 500, suppress: 1.0, lossMult: 1.0 },
    armored:  { name: '装甲部隊 (戦車)', icon: '🛞', equip: 'tank', equipPer: 3, mpPer: 250, suppress: 1.3, lossMult: 0.5 },
  };
  static ALERT = 50;
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }
  static nameOf(tag) { return typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(tag) : tag; }

  // ------------------------------------------------------------------
  static init() {
    if (OccupationSystem.installed) return;
    OccupationSystem.installed = true;
    OccupationSystem.installUI();
    OccupationSystem.installHooks();
    CoreEngine.registerTickCallback(() => OccupationSystem.onTick());
    CoreEngine.log('🚩 占領地管理・レジスタンスシステムが有効になりました。');
  }
  static data() {
    const s = CoreEngine.gameState; if (!s.strategy) return null;
    const o = (s.strategy.occupation ||= { states: {}, defaultLaw: 'civilian', garrisonType: 'infantry', assigned: { equip: 0, mp: 0 }, losses: { equip: 0, mp: 0 }, events: [] });
    o.states ||= {}; o.assigned ||= { equip: 0, mp: 0 }; o.losses ||= { equip: 0, mp: 0 }; o.events ||= [];
    return o;
  }
  static installUI() {
    const root = document.getElementById('window-templates');
    if (root && !document.getElementById('tpl-occupation')) {
      const el = document.createElement('div');
      el.className = 'window-template pane-scroll'; el.id = 'tpl-occupation';
      el.dataset.title = '🚩 占領地管理 — Resistance & Compliance'; el.dataset.w = '1120'; el.dataset.h = '740';
      el.innerHTML = '<div id="occupation-content"></div>';
      root.appendChild(el);
    }
    if (typeof GameUI !== 'undefined' && !GameUI._occHooked) {
      GameUI._occHooked = true;
      const orig = GameUI.onWindowOpened.bind(GameUI);
      GameUI.onWindowOpened = (tab) => { orig(tab); if (tab === 'occupation') OccupationSystem.render(); };
    }
  }
  static installHooks() {
    // 政治画面に「占領地管理」ボタン
    if (typeof PoliticsSystem !== 'undefined' && !PoliticsSystem._occHooked) {
      PoliticsSystem._occHooked = true;
      const orig = PoliticsSystem.render.bind(PoliticsSystem);
      PoliticsSystem.render = () => {
        orig();
        const c = document.getElementById('politics-content'); if (!c || typeof c.insertAdjacentHTML !== 'function') return;
        const list = OccupationSystem.occupied(); const alerts = list.filter(([, st, d]) => d.resistance >= OccupationSystem.ALERT).length;
        c.insertAdjacentHTML('afterbegin', '<div class="oc-politics-bar"><button class="oc-btn primary" onclick="GameUI.switchTab(\'occupation\')">🚩 占領地管理 (Resistance &amp; Compliance) — 占領州 ' + list.length + '</button>' + (alerts ? '<span class="oc-alert-badge">⚠ レジスタンス警報 ' + alerts + ' 州</span>' : '') + '</div>');
      };
    } else if (typeof PoliticsManager !== 'undefined' && !PoliticsManager._occHooked) {
      PoliticsManager._occHooked = true;
      const orig = PoliticsManager.render.bind(PoliticsManager);
      PoliticsManager.render = () => { orig(); const c = document.getElementById('politics-content'); if (c && typeof c.insertAdjacentHTML === 'function') c.insertAdjacentHTML('afterbegin', '<div class="oc-politics-bar"><button class="oc-btn primary" onclick="GameUI.switchTab(\'occupation\')">🚩 占領地管理</button></div>'); };
    }
    // 工場利用率: 占領州の民需/軍需工場を順応度・レジスタンスに応じて加算
    if (typeof FactoryBudget !== 'undefined' && !FactoryBudget._occHooked) {
      FactoryBudget._occHooked = true;
      const orig = FactoryBudget.availableCivilian.bind(FactoryBudget);
      FactoryBudget.availableCivilian = (tag = CoreEngine.gameState.country) => orig(tag) + (tag === CoreEngine.gameState.country ? OccupationSystem.bonusFactories().civ : 0);
    }
    if (typeof ProductionManager !== 'undefined' && !ProductionManager._occHooked) {
      ProductionManager._occHooked = true;
      const orig = ProductionManager.capacity.bind(ProductionManager);
      ProductionManager.capacity = (pool) => orig(pool) + (pool === 'military' ? OccupationSystem.bonusFactories().mil : 0);
    }
    // 資源: 占領州の産出は利用率分のみ
    if (typeof TradeSystem !== 'undefined' && !TradeSystem._occHooked) {
      TradeSystem._occHooked = true;
      const orig = TradeSystem.production.bind(TradeSystem);
      TradeSystem.production = (tag) => {
        const out = orig(tag); if (tag !== CoreEngine.gameState.country) return out;
        OccupationSystem.occupied().forEach(([sid, , d]) => { const r = TradeSystem.stateResources(sid), u = OccupationSystem.utilization(d); TradeSystem.ORDER.forEach(k => { out[k] -= (r[k] || 0) * (1 - u); }); });
        TradeSystem.ORDER.forEach(k => { out[k] = Math.max(0, Math.round(out[k] * 10) / 10); });
        return out;
      };
    }
    // 徴兵可能人口: 順応度に応じて占領地から人的資源
    if (typeof PoliticsManager !== 'undefined' && !PoliticsManager._occHooked2) {
      PoliticsManager._occHooked2 = true;
      const orig = PoliticsManager.dailyManpowerGain.bind(PoliticsManager);
      PoliticsManager.dailyManpowerGain = () => orig() + OccupationSystem.manpowerBonus();
    }
    // 地図: 警報アイコン
    if (typeof BattlePlanManager !== 'undefined' && !BattlePlanManager._occHooked) {
      BattlePlanManager._occHooked = true;
      const orig = BattlePlanManager.drawOverlay.bind(BattlePlanManager);
      BattlePlanManager.drawOverlay = (ctx, cam, w2s) => { orig(ctx, cam, w2s); try { OccupationSystem.draw(ctx, w2s); } catch (e) { /* ignore */ } };
    }
  }

  // ------------------------------------------------------------------
  // 占領州の列挙・パラメータ
  // ------------------------------------------------------------------
  static isOccupied(sid, st) {
    const me = CoreEngine.gameState.country; st = st || MapRenderer.states[sid];
    return !!st && st.owner === me && !!st.initialOwner && st.initialOwner !== me && !(CoreEngine.gameState.strategy?.cores || []).includes(String(sid));
  }
  static entry(sid) {
    const o = OccupationSystem.data();
    return (o.states[sid] ||= { resistance: 10, compliance: 0, law: null, since: OccupationSystem.day(), garrison: 0 });
  }
  /** [sid, state, entry] の配列 */
  static occupied() {
    const list = [];
    Object.entries(MapRenderer.states || {}).forEach(([sid, st]) => { if (OccupationSystem.isOccupied(sid, st)) list.push([sid, st, OccupationSystem.entry(sid)]); });
    return list;
  }
  static lawOf(d) { const o = OccupationSystem.data(); return OccupationSystem.LAWS.find(l => l.id === (d.law || o.defaultLaw)) || OccupationSystem.LAWS[1]; }
  static size(st) { const b = st.b || {}; return Math.max(1, (st.provinces || []).length * 0.5 + (b.industrial_complex || 0) + (b.arms_factory || 0) + Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) * 0.5); }
  /** 必要鎮圧兵力 (単位: 鎮圧大隊相当) */
  static garrisonNeed(st, d) { return Math.round(OccupationSystem.lawOf(d).garrison * OccupationSystem.size(st) * 10) / 10; }
  /** 工場・資源の利用率 (0–1): 25% + 順応度×0.5% + 政策、レジスタンスで低下 */
  static utilization(d) { const law = OccupationSystem.lawOf(d); return Math.max(0, Math.min(1, (0.25 + d.compliance * 0.005 + law.output) * (1 - Math.max(0, d.resistance - 20) / 100))); }
  static bonusFactories() {
    const now = OccupationSystem.day();
    if (OccupationSystem._bfCache && OccupationSystem._bfCache.day === now && OccupationSystem._bfCache.n === Object.keys(OccupationSystem.data()?.states || {}).length) return OccupationSystem._bfCache.v;
    let civ = 0, mil = 0;
    OccupationSystem.occupied().forEach(([, st, d]) => { const u = OccupationSystem.utilization(d), b = st.b || {}; civ += (b.industrial_complex || 0) * u; mil += (b.arms_factory || 0) * u; });
    const v = { civ: Math.floor(civ), mil: Math.floor(mil), civRaw: civ, milRaw: mil };
    OccupationSystem._bfCache = { day: now, n: Object.keys(OccupationSystem.data()?.states || {}).length, v };
    return v;
  }
  static manpowerBonus() { let mp = 0; OccupationSystem.occupied().forEach(([, st, d]) => { mp += 15 * OccupationSystem.size(st) * (d.compliance / 100) * OccupationSystem.lawOf(d).mp * (1 - d.resistance / 150); }); return Math.max(0, Math.round(mp)); }
  static setDefaultLaw(id) { const o = OccupationSystem.data(); if (OccupationSystem.LAWS.some(l => l.id === id)) o.defaultLaw = id; OccupationSystem._bfCache = null; CoreEngine.log('🚩 占領政策 (全体) を「' + OccupationSystem.LAWS.find(l => l.id === id).name + '」に変更'); OccupationSystem.render(); }
  static setLaw(sid, id) { const d = OccupationSystem.entry(sid); d.law = id === 'default' ? null : id; OccupationSystem._bfCache = null; OccupationSystem.render(); }
  static setGarrisonType(t) { const o = OccupationSystem.data(); if (OccupationSystem.GARRISON_TYPES[t]) { OccupationSystem.releaseGarrison(); o.garrisonType = t; } OccupationSystem.render(); }
  static releaseGarrison() {
    const o = OccupationSystem.data(), s = CoreEngine.gameState, gt = OccupationSystem.GARRISON_TYPES[o.garrisonType] || OccupationSystem.GARRISON_TYPES.infantry;
    const stock = ProductionManager.account(s.country).stock;
    stock[gt.equip] = (stock[gt.equip] || 0) + o.assigned.equip; s.manpower = (s.manpower || 0) + o.assigned.mp;
    o.assigned = { equip: 0, mp: 0 };
    Object.values(o.states).forEach(d => { d.garrison = 0; });
  }

  // ------------------------------------------------------------------
  // 毎日の処理
  // ------------------------------------------------------------------
  static onTick() {
    const s = CoreEngine.gameState, o = OccupationSystem.data();
    if (!o || !MapRenderer.ready) return;
    const day = OccupationSystem.day(); if (o.lastDay === day) return; o.lastDay = day;
    Object.values(MapRenderer.states || {}).forEach(st => { st.initialOwner ||= st.owner; });
    const list = OccupationSystem.occupied();
    Object.keys(o.states).forEach(sid => { if (!list.some(([x]) => x === sid)) delete o.states[sid]; });  // 失った/併合済みの州
    if (!list.length) { if (o.assigned.equip || o.assigned.mp) OccupationSystem.releaseGarrison(); return; }
    const gt = OccupationSystem.GARRISON_TYPES[o.garrisonType] || OccupationSystem.GARRISON_TYPES.infantry;
    const stock = ProductionManager.account(s.country).stock;
    // 1) 鎮圧師団の自動割り当て: 必要量 − 配備済み を在庫・人的資源から補充
    const need = list.reduce((a, [, st, d]) => a + OccupationSystem.garrisonNeed(st, d), 0);
    const needEquip = Math.ceil(need * gt.equipPer), needMp = Math.ceil(need * gt.mpPer);
    const takeE = Math.max(0, Math.min(needEquip - o.assigned.equip, Math.floor(stock[gt.equip] || 0)));
    const takeM = Math.max(0, Math.min(needMp - o.assigned.mp, Math.floor(s.manpower || 0)));
    if (takeE > 0) { stock[gt.equip] -= takeE; o.assigned.equip += takeE; }
    if (takeM > 0) { s.manpower -= takeM; o.assigned.mp += takeM; }
    if (o.assigned.equip > needEquip) { stock[gt.equip] = (stock[gt.equip] || 0) + (o.assigned.equip - needEquip); o.assigned.equip = needEquip; }
    if (o.assigned.mp > needMp) { s.manpower += o.assigned.mp - needMp; o.assigned.mp = needMp; }
    const fill = need > 0 ? Math.min(o.assigned.equip / Math.max(1, needEquip), o.assigned.mp / Math.max(1, needMp)) : 1;   // 充足率
    o.fill = fill; o.need = need; o.needEquip = needEquip; o.needMp = needMp;
    let lossE = 0, lossM = 0;
    list.forEach(([sid, st, d]) => {
      const law = OccupationSystem.lawOf(d), gNeed = OccupationSystem.garrisonNeed(st, d);
      d.garrison = Math.round(gNeed * fill * 10) / 10;
      const atWarWithOrigin = (s.atWar || []).includes(st.initialOwner);
      // 2) レジスタンス: 目標値へ収束 (充足した鎮圧部隊が抑え込む)
      let target = law.resistTarget + (atWarWithOrigin ? 15 : 0) - d.compliance * 0.35 + (1 - fill) * 40 * law.garrison;
      if (typeof PeaceSystem !== 'undefined' && PeaceSystem.subject?.(st.initialOwner)?.overlord === s.country) target -= 10;   // 元の国が自国の属国
      target = Math.max(0, Math.min(100, target));
      d.resistance = Math.max(0, Math.min(100, d.resistance + Math.max(-1.5, Math.min(1.5, (target - d.resistance) * 0.04 * gt.suppress))));
      // 3) 順応度: 政策による上昇、レジスタンスが高いと伸び悩む
      d.compliance = Math.max(0, Math.min(100, d.compliance + law.compliance * (1 - d.resistance / 120)));
      // 4) 鎮圧師団の損耗 (レジスタンス比例)
      const lossRate = Math.max(0, d.resistance - 10) / 100 * 0.03 * gt.lossMult * d.garrison;
      lossE += lossRate * gt.equipPer; lossM += lossRate * gt.mpPer;
      // 5) 高レジスタンスの被害: インフラ損壊・師団消耗
      if (d.resistance >= OccupationSystem.ALERT) {
        if (Math.random() < (d.resistance - 40) / 100 * 0.08) {
          const b = (st.b ||= {});
          if ((b.infrastructure || 0) > 0 && Math.random() < 0.6) { b.infrastructure--; st.supply = Math.max(0, (st.supply || 0) - 1); OccupationSystem.event(sid, st, '🛤️ 破壊工作 — インフラが損壊 (−1)'); }
          else if ((b.industrial_complex || 0) + (b.arms_factory || 0) > 0 && Math.random() < 0.5) { if (b.arms_factory) b.arms_factory--; else b.industrial_complex--; OccupationSystem._bfCache = null; OccupationSystem.event(sid, st, '🏭 工場が襲撃され破壊された (−1)'); }
          else OccupationSystem.event(sid, st, '💥 鉄道・補給物資への襲撃 (補給 −)');
          MapRenderer.invalidateModes?.();
        }
        OccupationSystem.attrition(sid, d);
        if (!d.alerted) { d.alerted = true; GameUI.notify('⚠ ' + (st.name || '州' + sid) + ' のレジスタンスが ' + Math.round(d.resistance) + '% — 占領政策を見直してください', 'alert'); }
      } else if (d.resistance < OccupationSystem.ALERT - 10) d.alerted = false;
      // 6) 順応度 100% → 中核州化候補 (ボーナス最大)
    });
    // 損耗を反映 (装備・人的資源は翌日補充される)
    const lE = Math.min(o.assigned.equip, lossE), lM = Math.min(o.assigned.mp, lossM);
    o.assigned.equip -= lE; o.assigned.mp -= lM; o.losses.equip += lE; o.losses.mp += lM;
    OccupationSystem._bfCache = null;
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen?.('occupation')) OccupationSystem.render();
  }
  /** 州内の師団へ消耗ダメージ */
  static attrition(sid, d) {
    if (typeof BattlePlanManager === 'undefined') return;
    const dmg = (d.resistance - 40) / 100 * 3;   // 50%で0.3、100%で1.8 org/日
    (BattlePlanManager.armies || []).forEach(army => {
      (army.divisions || []).forEach(div => {
        const pid = div.pid || army.positionPid || MapRenderer.provinceAt?.(div.x, div.y);
        if (pid && String(MapRenderer.stateOf(pid)) === String(sid)) { div.org = Math.max(0, (div.org || 0) - dmg); div.occAttrition = OccupationSystem.day(); }
      });
    });
  }
  static event(sid, st, text) {
    const o = OccupationSystem.data();
    o.events.unshift({ day: OccupationSystem.day(), sid, text: (st.name || '州' + sid) + ': ' + text }); o.events = o.events.slice(0, 30);
    CoreEngine.log('🚩 ' + o.events[0].text);
  }

  // ------------------------------------------------------------------
  // 地図: 警報アイコン
  // ------------------------------------------------------------------
  static draw(ctx, w2s) {
    const o = OccupationSystem.data(); if (!o) return;
    const t = Date.now() / 400, period = MapRenderer.mapW * MapRenderer.cam.scale;
    OccupationSystem.occupied().forEach(([sid, , d]) => {
      if (d.resistance < OccupationSystem.ALERT) return;
      const c = MapRenderer.stateCenter.get(String(sid)); if (!c) return;
      const p = w2s(c[0], c[1]);
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t));
      for (let off = -1; off <= 1; off++) {
        const x = p[0] + off * period, y = p[1] - 14;
        if (x < -30 || x > MapRenderer.canvas.width + 30) continue;
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, 14 * pulse + 4, 0, Math.PI * 2); ctx.fillStyle = 'rgba(224,74,60,' + (0.25 * pulse) + ')'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = '#c0392b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, y + 1);
        ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ffd3cc'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3; ctx.strokeText(Math.round(d.resistance) + '%', x, y + 20); ctx.fillText(Math.round(d.resistance) + '%', x, y + 20);
        ctx.restore();
      }
    });
  }
  /** 州情報オーバーレイ用の1行 */
  static summaryLine(sid) {
    const st = MapRenderer.states[sid]; if (!st || !OccupationSystem.isOccupied(sid, st)) return '';
    const d = OccupationSystem.entry(sid), law = OccupationSystem.lawOf(d);
    const warn = d.resistance >= OccupationSystem.ALERT;
    return '<span style="font-size:11px;color:' + (warn ? '#ff8a7a' : '#c9b27a') + '">🚩 占領地 (' + OccupationSystem.esc(OccupationSystem.nameOf(st.initialOwner)) + ') ' + law.icon + law.name + ' ／ レジスタンス ' + Math.round(d.resistance) + '% ／ 順応度 ' + Math.round(d.compliance) + '% ／ 利用率 ' + Math.round(OccupationSystem.utilization(d) * 100) + '%' + (warn ? ' ⚠' : '') + '</span> <button class="map-info-build-btn" onclick="GameUI.switchTab(\'occupation\')">管理</button>';
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  static focusState(sid) {
    const st = MapRenderer.states[sid]; if (!st) return;
    const c = MapRenderer.stateCenter.get(String(sid));
    if (c && MapRenderer.cam && MapRenderer.canvas) { MapRenderer.cam.x = MapRenderer.canvas.width / 2 - c[0] * MapRenderer.cam.scale; MapRenderer.cam.y = MapRenderer.canvas.height / 2 - c[1] * MapRenderer.cam.scale; }
    const pid = (st.provinces || [])[0]; if (pid && MapRenderer.selectProvince) MapRenderer.selectProvince(pid);
    if (typeof WindowManager !== 'undefined' && WindowManager.minimize) WindowManager.minimize('occupation');
  }
  static gauge(v, color, label) { return '<div class="oc-gauge" title="' + label + ' ' + Math.round(v) + '%"><em style="width:' + Math.max(0, Math.min(100, v)) + '%;background:' + color + '"></em><span>' + Math.round(v) + '%</span></div>'; }
  static render() {
    const el = document.getElementById('occupation-content'); if (!el) return;
    const s = CoreEngine.gameState, o = OccupationSystem.data(); if (!o) return;
    const list = OccupationSystem.occupied().sort((a, b) => b[2].resistance - a[2].resistance);
    const gt = OccupationSystem.GARRISON_TYPES[o.garrisonType] || OccupationSystem.GARRISON_TYPES.infantry;
    const stock = ProductionManager.account(s.country).stock;
    const bf = OccupationSystem.bonusFactories(), mpB = OccupationSystem.manpowerBonus();
    const avgR = list.length ? list.reduce((a, x) => a + x[2].resistance, 0) / list.length : 0, avgC = list.length ? list.reduce((a, x) => a + x[2].compliance, 0) / list.length : 0;
    const alerts = list.filter(x => x[2].resistance >= OccupationSystem.ALERT).length;
    const fill = o.fill == null ? 1 : o.fill;
    let html = '<div class="oc-root"><div class="oc-head"><div class="oc-mark">🚩</div><div class="oc-title"><h3>占領地管理 <small>RESISTANCE &amp; COMPLIANCE</small></h3><p>占領州 <b>' + list.length + '</b> ／ 平均レジスタンス <b>' + Math.round(avgR) + '%</b> ／ 平均順応度 <b>' + Math.round(avgC) + '%</b>' + (alerts ? ' ／ <span class="oc-red">⚠ 警報 ' + alerts + ' 州</span>' : '') + '</p></div>' +
      '<div class="oc-kpis"><div class="oc-kpi"><small>占領地からの工場</small><b>+' + bf.civ + ' 民需 / +' + bf.mil + ' 軍需</b><span>利用率は順応度・政策で上昇</span></div><div class="oc-kpi"><small>占領地からの人的資源</small><b>+' + mpB + ' /日</b><span>順応度に比例</span></div><div class="oc-kpi' + (fill < 0.999 ? ' warn' : '') + '"><small>鎮圧師団の充足率</small><b>' + Math.round(fill * 100) + '%</b><span>必要 ' + (o.need || 0).toFixed(1) + ' 大隊相当</span></div></div></div>';
    // 全体設定
    html += '<div class="oc-panel"><div class="oc-row"><div class="oc-field"><label>占領政策 (全体の既定)</label><div class="oc-lawbtns">' + OccupationSystem.LAWS.map(l => '<button class="oc-law' + (o.defaultLaw === l.id ? ' on' : '') + '" title="' + OccupationSystem.esc(l.desc) + '" onclick="OccupationSystem.setDefaultLaw(\'' + l.id + '\')"><span>' + l.icon + '</span><b>' + l.name + '</b><small>鎮圧 ×' + l.garrison + ' ／ 順応 ' + (l.compliance > 0 ? '+' : '') + l.compliance + '/日</small></button>').join('') + '</div></div>' +
      '<div class="oc-field oc-garrison"><label>鎮圧師団の編成</label><select onchange="OccupationSystem.setGarrisonType(this.value)">' + Object.entries(OccupationSystem.GARRISON_TYPES).map(([k, g]) => '<option value="' + k + '"' + (o.garrisonType === k ? ' selected' : '') + '>' + g.icon + ' ' + g.name + ' — 装備 ' + g.equipPer + '・人員 ' + g.mpPer + ' / 大隊</option>').join('') + '</select>' +
        '<table class="oc-table"><tr><th>必要装備 (' + (ProductionManager.CATALOG?.[gt.equip]?.name || gt.equip) + ')</th><td>' + Math.round(o.assigned.equip) + ' / ' + (o.needEquip || 0) + ' <small>在庫 ' + Math.floor(stock[gt.equip] || 0) + '</small></td></tr><tr><th>必要人的資源</th><td>' + Math.round(o.assigned.mp).toLocaleString() + ' / ' + (o.needMp || 0).toLocaleString() + ' <small>予備 ' + Math.floor(s.manpower || 0).toLocaleString() + '</small></td></tr><tr><th>累計損耗</th><td>装備 ' + Math.round(o.losses.equip) + ' ／ 人員 ' + Math.round(o.losses.mp).toLocaleString() + '</td></tr></table>' +
        '<p class="oc-help">政策の鎮圧倍率 × 州の規模 で必要兵力が決まり、装備と人的資源が自動で割り当てられます。不足するとレジスタンスが上昇します。</p></div></div></div>';
    // 現在の政策の説明
    const cur = OccupationSystem.LAWS.find(l => l.id === o.defaultLaw);
    html += '<p class="oc-lawdesc">' + cur.icon + ' <b>' + cur.name + '</b> — ' + OccupationSystem.esc(cur.desc) + ' <span class="oc-mods">目標レジスタンス ' + cur.resistTarget + '% ／ 工場利用率 +' + Math.round(cur.output * 100) + '% ／ 徴兵 ×' + cur.mp + '</span></p>';
    // 州一覧
    if (!list.length) html += '<div class="oc-panel"><p class="oc-help">現在、占領している非中核州はありません。敵国の州を占領または講和会議で獲得すると、ここに表示されます。</p></div>';
    else {
      html += '<div class="oc-panel"><table class="oc-states"><thead><tr><th>州</th><th>元の所有国</th><th>レジスタンス</th><th>順応度</th><th>占領政策</th><th>鎮圧師団</th><th>工場 / 利用率</th><th></th></tr></thead><tbody>';
      list.forEach(([sid, st, d]) => {
        const law = OccupationSystem.lawOf(d), need = OccupationSystem.garrisonNeed(st, d), b = st.b || {}, u = OccupationSystem.utilization(d), warn = d.resistance >= OccupationSystem.ALERT;
        html += '<tr class="' + (warn ? 'warn' : '') + '"><td><b>' + (warn ? '<span class="oc-red">⚠</span> ' : '') + OccupationSystem.esc(st.name || '州' + sid) + '</b><small>' + (st.provinces || []).length + ' プロヴィンス ／ VP ' + Object.values(st.vp || {}).reduce((a, v) => a + Number(v || 0), 0) + '</small></td>' +
          '<td>' + OccupationSystem.esc(OccupationSystem.nameOf(st.initialOwner)) + ((s.atWar || []).includes(st.initialOwner) ? '<small class="oc-red">交戦中 (+15)</small>' : '') + '</td>' +
          '<td>' + OccupationSystem.gauge(d.resistance, warn ? '#e04a3c' : '#c9a44c', 'レジスタンス') + '</td><td>' + OccupationSystem.gauge(d.compliance, '#5aa0e0', '順応度') + '</td>' +
          '<td><select onchange="OccupationSystem.setLaw(\'' + sid + '\', this.value)"><option value="default"' + (!d.law ? ' selected' : '') + '>既定 (' + cur.name + ')</option>' + OccupationSystem.LAWS.map(l => '<option value="' + l.id + '"' + (d.law === l.id ? ' selected' : '') + '>' + l.icon + ' ' + l.name + '</option>').join('') + '</select></td>' +
          '<td>' + (d.garrison || 0).toFixed(1) + ' / ' + need.toFixed(1) + '<small>' + Math.round(need * gt.equipPer) + ' 装備・' + Math.round(need * gt.mpPer) + ' 人</small></td>' +
          '<td>🏭' + (b.industrial_complex || 0) + ' ⚙️' + (b.arms_factory || 0) + ' 🛤️' + (b.infrastructure || 0) + '<small>利用率 ' + Math.round(u * 100) + '%</small></td>' +
          '<td><button class="oc-btn small" onclick="OccupationSystem.focusState(\'' + sid + '\')">地図</button></td></tr>';
      });
      html += '</tbody></table></div>';
    }
    // イベントログ
    html += '<div class="oc-panel"><h4>最近の事件</h4><div class="oc-log">' + (o.events.length ? o.events.map(e => '<div><small>Day ' + e.day + '</small> ' + OccupationSystem.esc(e.text) + '</div>').join('') : '<span class="oc-help">事件はありません。</span>') + '</div></div>';
    html += '<p class="oc-help">レジスタンスが 50% を超えると地図に赤い警報が表示され、インフラ・工場の破壊工作や州内師団の消耗が発生します。順応度を高めるには「地方自治」「強制同化」が有効です。</p></div>';
    el.innerHTML = html;
  }
}
if (typeof window !== 'undefined') window.OccupationSystem = OccupationSystem;
