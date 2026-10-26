/* trade-resources.js — HOI4風「貿易・資源・民需工場 (Trade & Resources)」
 *
 *  1. 6大資源 (石油/鉄/アルミ/タングステン/ゴム/クロム) を州ごとに産出 (国別プロファイル×州IDの決定論的ハッシュ) し自国領土で合計
 *  2. 生産ラインの資源コストに対して不足分だけ「生産効率」を低下 (旧ロジックの完全停止を置き換え)、警告表示
 *  3. 貿易画面: 各国の余剰・輸出可能量を一覧し、民需工場 (1工場 = 8資源) を割り当てて輸入。
 *     輸出側は民需工場の使用権を得る (FactoryBudget に反映)。AI も自国の不足資源をプレイヤーから輸入する (双方向)。
 */
class TradeSystem {
  static RESOURCES = {
    oil:      { id: 'oil',      name: '石油',       icon: '🛢', color: '#5a5a5a', img: '石油.png' },
    steel:    { id: 'steel',    name: '鉄',         icon: '⛓', color: '#8a9aa8', img: '鋼材.png' },
    aluminum: { id: 'aluminum', name: 'アルミニウム', icon: '▰', color: '#b9c4cc', img: 'アルミ.png' },
    tungsten: { id: 'tungsten', name: 'タングステン', icon: '◆', color: '#c9a44c', img: 'タングステン.png' },
    rubber:   { id: 'rubber',   name: 'ゴム',       icon: '◉', color: '#6f8f4f', img: 'ゴム.png' },
    chromium: { id: 'chromium', name: 'クロム',     icon: '⬟', color: '#7fb3d5', img: 'クロム.png' },
  };
  static IMG_DIR = 'ger/tec/p/image/';
  static EXTRA_IMG = { factory: '民需工場.png', convoy: '輸送船.png', coal: '石炭.png' };
  /** 資源アイコン (<img>)。k は資源ID または EXTRA_IMG のキー */
  static icon(k, size = 18) {
    const file = TradeSystem.RESOURCES[k]?.img || TradeSystem.EXTRA_IMG[k];
    const name = TradeSystem.RESOURCES[k]?.name || ({ factory: '民需工場', convoy: '輸送船', coal: '石炭' })[k] || k;
    if (!file) return '<i class="tr-ic">' + (TradeSystem.RESOURCES[k]?.icon || '◆') + '</i>';
    return '<img class="tr-ic" src="' + TradeSystem.IMG_DIR + encodeURIComponent(file) + '" alt="' + name + '" title="' + name + '" width="' + size + '" height="' + size + '" decoding="async" onerror="this.outerHTML=\'<i class=&quot;tr-ic&quot;>' + (TradeSystem.RESOURCES[k]?.icon || '🏭') + '</i>\'">';
  }
  static ORDER = ['oil', 'steel', 'aluminum', 'tungsten', 'rubber', 'chromium'];
  static UNIT = 8;   // 民需工場1 = 資源8
  // 国別の総産出 (1日あたり) プロファイル。未記載国は default
  static PROFILE = {
    GER: { steel: 26, aluminum: 14, tungsten: 2, oil: 2, chromium: 0, rubber: 0 },
    SOV: { steel: 30, oil: 24, aluminum: 12, chromium: 14, tungsten: 6, rubber: 0 },
    USA: { steel: 60, oil: 60, aluminum: 30, tungsten: 12, chromium: 6, rubber: 2 },
    ENG: { steel: 36, aluminum: 8, chromium: 6, oil: 4, tungsten: 2, rubber: 2 },
    FRA: { steel: 22, aluminum: 14, tungsten: 4, oil: 1, chromium: 0, rubber: 0 },
    ITA: { steel: 6, aluminum: 6, oil: 1, chromium: 0, tungsten: 0, rubber: 0 },
    JAP: { steel: 10, aluminum: 4, oil: 1, chromium: 1, tungsten: 1, rubber: 0 },
    POL: { steel: 8, aluminum: 1, oil: 1, chromium: 0, tungsten: 0, rubber: 0 },
    ROM: { oil: 20, steel: 2, aluminum: 2, tungsten: 0, chromium: 0, rubber: 0 },
    HUN: { aluminum: 10, steel: 3, oil: 1, tungsten: 0, chromium: 0, rubber: 0 },
    SWE: { steel: 40, oil: 0, aluminum: 2, tungsten: 2, chromium: 0, rubber: 0 },
    TUR: { chromium: 24, steel: 2, oil: 1, aluminum: 0, tungsten: 0, rubber: 0 },
    YUG: { aluminum: 10, chromium: 6, steel: 3, oil: 0, tungsten: 0, rubber: 0 },
    SPR: { tungsten: 14, steel: 6, aluminum: 0, oil: 0, chromium: 0, rubber: 0 },
    POR: { tungsten: 16, steel: 1, aluminum: 0, oil: 0, chromium: 0, rubber: 0 },
    CHI: { tungsten: 24, steel: 6, aluminum: 2, oil: 0, chromium: 0, rubber: 0 },
    MAN: { steel: 8, aluminum: 2, oil: 1, tungsten: 0, chromium: 0, rubber: 0 },
    HOL: { rubber: 20, oil: 14, steel: 2, aluminum: 2, tungsten: 0, chromium: 0 },
    BEL: { steel: 8, aluminum: 2, rubber: 2, oil: 0, tungsten: 0, chromium: 0 },
    NOR: { aluminum: 6, steel: 4, oil: 0, tungsten: 0, chromium: 0, rubber: 0 },
    FIN: { steel: 2, chromium: 2, aluminum: 0, oil: 0, tungsten: 0, rubber: 0 },
    BRA: { rubber: 10, steel: 6, aluminum: 2, oil: 1, tungsten: 0, chromium: 0 },
    MEX: { oil: 18, steel: 2, aluminum: 0, tungsten: 0, chromium: 0, rubber: 0 },
    VEN: { oil: 26, steel: 0, aluminum: 0, tungsten: 0, chromium: 0, rubber: 0 },
    PER: { oil: 4, steel: 2, tungsten: 2, aluminum: 0, chromium: 0, rubber: 0 },
    CHL: { steel: 4, aluminum: 0, oil: 0, tungsten: 0, chromium: 0, rubber: 0 },
    ARG: { steel: 3, oil: 3, aluminum: 0, tungsten: 0, chromium: 0, rubber: 0 },
    SIA: { rubber: 10, tungsten: 4, steel: 0, aluminum: 0, oil: 0, chromium: 0 },
    PHI: { chromium: 6, rubber: 2, steel: 0, aluminum: 0, oil: 0, tungsten: 0 },
    RAJ: { steel: 10, chromium: 4, rubber: 2, aluminum: 2, oil: 1, tungsten: 0 },
    AST: { steel: 10, tungsten: 2, aluminum: 2, oil: 0, chromium: 0, rubber: 0 },
    CAN: { steel: 10, aluminum: 10, oil: 4, tungsten: 0, chromium: 0, rubber: 0 },
    SAF: { chromium: 16, steel: 6, oil: 0, aluminum: 0, tungsten: 0, rubber: 0 },
    PRS: { oil: 20, steel: 0, aluminum: 0, tungsten: 0, chromium: 0, rubber: 0 },
    IRQ: { oil: 14, steel: 0, aluminum: 0, tungsten: 0, chromium: 0, rubber: 0 },
    GRE: { chromium: 4, aluminum: 2, steel: 1, oil: 0, tungsten: 0, rubber: 0 },
    CZE: { steel: 10, aluminum: 2, tungsten: 1, oil: 0, chromium: 0, rubber: 0 },
    AUS: { steel: 6, aluminum: 2, oil: 0, tungsten: 0, chromium: 0, rubber: 0 },
    default: { steel: 4, aluminum: 1, oil: 1, tungsten: 0, chromium: 0, rubber: 0 },
  };
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }

  // ==========================================================
  // 初期化・フック
  // ==========================================================
  static init() {
    if (TradeSystem.installed) return;
    TradeSystem.installed = true;
    TradeSystem.installHooks();
    CoreEngine.registerTickCallback(() => TradeSystem.onTick());
    const tpl = document.getElementById('tpl-trade');
    if (tpl) { tpl.dataset.title = '📦 貿易・資源 — Trade & Resources'; tpl.dataset.w = '1180'; tpl.dataset.h = '760'; }
    CoreEngine.log('📦 貿易システム: 州ごとの資源産出と民需工場による輸入 (1工場=8資源) が有効になりました。');
  }
  static installHooks() {
    // 貿易画面
    if (typeof TradeManager !== 'undefined') TradeManager.render = () => TradeSystem.render();
    // 民需工場: 輸入で使用、輸出で獲得
    if (typeof FactoryBudget !== 'undefined' && !FactoryBudget._tradeHooked) {
      FactoryBudget._tradeHooked = true;
      const orig = FactoryBudget.availableCivilian.bind(FactoryBudget);
      FactoryBudget.availableCivilian = (tag = CoreEngine.gameState.country) => Math.max(0, orig(tag) + TradeSystem.factoryDelta(tag));
    }
    if (typeof ProductionManager !== 'undefined' && !ProductionManager._tradeHooked) {
      ProductionManager._tradeHooked = true;
      // 生産 tick: 資源不足は停止ではなく効率低下に
      ProductionManager.tick = () => TradeSystem.productionTick();
      const origRender = ProductionManager.render.bind(ProductionManager);
      ProductionManager.render = () => { origRender(); TradeSystem.decorateProduction(); };
    }
    if (typeof ConstructionManager !== 'undefined' && !ConstructionManager._tradeHooked) {
      ConstructionManager._tradeHooked = true;
      const origRender = ConstructionManager.render.bind(ConstructionManager);
      ConstructionManager.render = () => { origRender(); TradeSystem.injectHeader('construction-content'); };
    }
  }

  // ==========================================================
  // 州の資源産出 (決定論的)
  // ==========================================================
  static hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  static stateResources(sid) {
    const st = MapRenderer.states?.[sid]; if (!st) return {};
    if (st.res) return st.res;
    const owner = st.initialOwner || st.owner || 'default';
    if (!st.initialOwner) st.initialOwner = owner;
    const profile = TradeSystem.PROFILE[owner] || TradeSystem.PROFILE.default;
    const siblings = Object.entries(MapRenderer.states).filter(([, x]) => (x.initialOwner || x.owner) === owner);
    const weights = siblings.map(([id]) => 0.3 + TradeSystem.hash(owner + ':' + id) * 1.4);
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    const myW = weights[siblings.findIndex(([id]) => String(id) === String(sid))] || 1;
    const res = {};
    TradeSystem.ORDER.forEach(k => {
      const total = profile[k] || 0; if (!total) return;
      // 資源ごとに偏在させる (特定の州に集中)
      const focus = TradeSystem.hash(k + ':' + owner + ':' + sid);
      const v = total * myW / totalW * (focus > 0.55 ? 1.8 : focus > 0.25 ? 0.7 : 0.1) * (siblings.length <= 2 ? 1.1 : 1);
      if (v >= 0.5) res[k] = Math.round(v);
    });
    st.res = res;
    return res;
  }
  static production(tag) {
    const out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0]));
    Object.entries(MapRenderer.states || {}).forEach(([sid, st]) => {
      if (st.owner !== tag) return;
      const r = TradeSystem.stateResources(sid);
      TradeSystem.ORDER.forEach(k => { out[k] += r[k] || 0; });
    });
    return out;
  }
  /** 生産ラインの資源需要 (1日あたり) */
  static demand(tag) {
    const s = CoreEngine.gameState, out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0]));
    if (tag === s.country) {
      (s.strategy?.production || []).forEach(line => {
        const def = ProductionManager.CATALOG[line.type]; if (!def) return;
        Object.entries(def.resources).forEach(([k, v]) => { if (out[k] != null) out[k] += v * (Number(line.factories) || 0) / 7; });
      });
      return out;
    }
    // AI: 産出の一部 + 軍需工場に比例した需要 (決定論的)
    const prod = TradeSystem.production(tag), acc = ProductionManager.account(tag);
    const war = (s.atWar || []).includes(tag) ? 1 : 0;
    TradeSystem.ORDER.forEach(k => {
      const base = { steel: 0.9, aluminum: 0.35, oil: 0.3, tungsten: 0.25, chromium: 0.3, rubber: 0.25 }[k];
      out[k] = Math.round((prod[k] * (0.45 + TradeSystem.hash(tag + k) * 0.3) + (acc.military || 15) * base * (1 + 0.3 * war)) * 10) / 10;
    });
    return out;
  }
  static deals() { const s = CoreEngine.gameState; if (!s.strategy) return []; return (s.strategy.trades ||= []); }
  static imports(tag) { const out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0])); TradeSystem.deals().forEach(d => { if (d.buyer === tag) out[d.resource] += d.amount; }); return out; }
  static exports(tag) { const out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0])); TradeSystem.deals().forEach(d => { if (d.seller === tag) out[d.resource] += d.amount; }); return out; }
  /** 輸出可能量 (余剰) */
  static surplus(tag) {
    const p = TradeSystem.production(tag), d = TradeSystem.demand(tag), ex = TradeSystem.exports(tag), im = TradeSystem.imports(tag);
    return Object.fromEntries(TradeSystem.ORDER.map(k => [k, Math.max(0, Math.floor(p[k] + im[k] - d[k] - ex[k]))]));
  }
  static balance(tag) {
    const p = TradeSystem.production(tag), d = TradeSystem.demand(tag), ex = TradeSystem.exports(tag), im = TradeSystem.imports(tag);
    return Object.fromEntries(TradeSystem.ORDER.map(k => [k, { production: p[k], imports: im[k], exports: ex[k], demand: d[k], net: p[k] + im[k] - ex[k] - d[k] }]));
  }
  static factoryDelta(tag) { return TradeSystem.deals().reduce((n, d) => n + (d.seller === tag ? d.factories : 0) - (d.buyer === tag ? d.factories : 0), 0); }

  // ==========================================================
  // 取引
  // ==========================================================
  static canTrade(a, b) {
    if (a === b) return false;
    if (typeof MarketManager !== 'undefined' && MarketManager.atWar) { try { if (MarketManager.atWar(a, b)) return false; } catch (e) { /* ignore */ } }
    return true;
  }
  static deal(buyer, seller, resource) { return TradeSystem.deals().find(d => d.buyer === buyer && d.seller === seller && d.resource === resource) || null; }
  /** 輸入量を units (8単位) 増減 */
  static adjust(seller, resource, delta) {
    const s = CoreEngine.gameState, me = s.country;
    if (!TradeSystem.RESOURCES[resource] || !TradeSystem.canTrade(me, seller)) { GameUI.notify('この国とは取引できません (交戦中)。', 'alert'); return false; }
    const existing = TradeSystem.deal(me, seller, resource);
    const current = existing ? existing.amount : 0;
    const next = Math.max(0, current + delta * TradeSystem.UNIT);
    if (next > current) {
      const available = TradeSystem.surplus(seller)[resource] + (existing ? existing.amount : 0);
      if (next > available) { GameUI.notify(DiplomacyManager.nameOf(seller) + ' の' + TradeSystem.RESOURCES[resource].name + '輸出可能量が不足しています (余剰 ' + available + ')。', 'alert'); return false; }
      const needFactories = next / TradeSystem.UNIT - (existing ? existing.factories : 0);
      if (ProductionManager.freeCivilian() < needFactories) { GameUI.notify('空き民需工場が不足しています (必要 ' + needFactories + ')。', 'alert'); return false; }
      if (typeof ConvoyManager !== 'undefined' && !existing && !ConvoyManager.consumeForTrade(2)) return false;
    }
    TradeSystem.setDeal(me, seller, resource, next);
    CoreEngine.log('📦 ' + DiplomacyManager.nameOf(seller) + ' から ' + TradeSystem.RESOURCES[resource].name + ' ' + next + '/日 を輸入 (民需工場 ' + next / TradeSystem.UNIT + ')');
    TradeSystem.render(); TradeSystem.refreshHeaders();
    return true;
  }
  static setDeal(buyer, seller, resource, amount) {
    const deals = TradeSystem.deals();
    const idx = deals.findIndex(d => d.buyer === buyer && d.seller === seller && d.resource === resource);
    if (amount <= 0) { if (idx >= 0) deals.splice(idx, 1); return; }
    const d = { buyer, seller, resource, amount, factories: amount / TradeSystem.UNIT, since: typeof GameTools !== 'undefined' ? GameTools.day() : 0 };
    if (idx >= 0) deals[idx] = d; else deals.push(d);
  }
  static cancelExport(buyer, resource) {
    TradeSystem.setDeal(buyer, CoreEngine.gameState.country, resource, 0);
    (CoreEngine.gameState.strategy.tradeBlock ||= {})[buyer + ':' + resource] = (typeof GameTools !== 'undefined' ? GameTools.day() : 0) + 60;
    CoreEngine.log('📦 ' + DiplomacyManager.nameOf(buyer) + ' への ' + TradeSystem.RESOURCES[resource].name + ' 輸出契約を破棄しました。');
    TradeSystem.render(); TradeSystem.refreshHeaders();
  }
  static setExportPolicy(v) { CoreEngine.gameState.strategy.exportPolicy = v; TradeSystem.render(); }
  /** AI の輸入行動 (毎日): 不足国がプレイヤーや他国の余剰を買う */
  static aiTrade() {
    const s = CoreEngine.gameState, me = s.country, day = typeof GameTools !== 'undefined' ? GameTools.day() : 0;
    const policy = s.strategy.exportPolicy || 'limited';   // free / limited / closed
    const tags = (typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.countries : []).map(c => c.id);
    const mySurplus = TradeSystem.surplus(me);
    tags.forEach(tag => {
      if (TradeSystem.hash(tag + day) > 0.35) return;   // 1日に全部の国が動くわけではない
      const bal = TradeSystem.balance(tag);
      TradeSystem.ORDER.forEach(k => {
        const existing = TradeSystem.deal(tag, me, k);
        if (bal[k].net >= 0 && !existing) return;
        if (bal[k].net >= TradeSystem.UNIT && existing) { TradeSystem.setDeal(tag, me, k, existing.amount - TradeSystem.UNIT); return; }
        if (bal[k].net >= 0) return;
        if (policy === 'closed' || !TradeSystem.canTrade(tag, me)) return;
        if ((s.strategy.tradeBlock || {})[tag + ':' + k] > day) return;
        const cap = policy === 'free' ? 1 : 0.5;
        const room = Math.floor(mySurplus[k] * cap / TradeSystem.UNIT) * TradeSystem.UNIT;
        if (room < TradeSystem.UNIT) return;
        const want = Math.min(room, Math.ceil(-bal[k].net / TradeSystem.UNIT) * TradeSystem.UNIT);
        const next = Math.min(room + (existing ? existing.amount : 0), (existing ? existing.amount : 0) + want);
        if (next > (existing ? existing.amount : 0)) {
          TradeSystem.setDeal(tag, me, k, next);
          mySurplus[k] -= next - (existing ? existing.amount : 0);
          if (!existing) { CoreEngine.log('📦 ' + DiplomacyManager.nameOf(tag) + ' が ' + TradeSystem.RESOURCES[k].name + ' ' + next + '/日 の輸入契約を締結 — 民需工場 ' + next / TradeSystem.UNIT + ' の使用権を獲得'); GameUI.notify('📦 ' + DiplomacyManager.nameOf(tag) + ' と' + TradeSystem.RESOURCES[k].name + 'の輸出契約 (+民需工場 ' + next / TradeSystem.UNIT + ')', 'success'); }
        }
      });
    });
    // 契約の妥当性 (交戦・余剰消滅)
    TradeSystem.deals().slice().forEach(d => {
      if (!TradeSystem.canTrade(d.buyer, d.seller)) { TradeSystem.setDeal(d.buyer, d.seller, d.resource, 0); CoreEngine.log('📦 交戦により貿易契約が失効: ' + d.buyer + ' ⇄ ' + d.seller + ' ' + TradeSystem.RESOURCES[d.resource].name); return; }
      if (d.seller !== me) {
        const avail = TradeSystem.surplus(d.seller)[d.resource] + d.amount;
        if (avail < d.amount) { const next = Math.floor(avail / TradeSystem.UNIT) * TradeSystem.UNIT; TradeSystem.setDeal(d.buyer, d.seller, d.resource, next); if (d.buyer === me) GameUI.notify('📦 ' + DiplomacyManager.nameOf(d.seller) + ' の余剰減少により ' + TradeSystem.RESOURCES[d.resource].name + ' 輸入が ' + next + '/日 に縮小', 'alert'); }
      }
    });
  }

  // ==========================================================
  // 毎時/毎日処理
  // ==========================================================
  static onTick() {
    const s = CoreEngine.gameState; if (!s.strategy || !MapRenderer.ready) return;
    const day = typeof GameTools !== 'undefined' ? GameTools.day() : 0;
    if (s.strategy.tradeLastDay === day) return;
    s.strategy.tradeLastDay = day;
    // 供給: 産出 + 輸入 − 輸出 を備蓄へ (備蓄上限 = 30日分 or 300)
    const bal = TradeSystem.balance(s.country);
    TradeSystem.ORDER.forEach(k => {
      const supply = bal[k].production + bal[k].imports - bal[k].exports;
      const cap = Math.max(300, supply * 30);
      s.resources[k] = Math.min(cap, Math.max(0, (Number(s.resources[k]) || 0) + supply));
    });
    TradeSystem.aiTrade();
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen('trade')) TradeSystem.render();
    TradeSystem.refreshHeaders();
  }
  /** ProductionManager.tick の置き換え: 資源不足 → 効率低下 */
  static productionTick() {
    const s = CoreEngine.gameState, a = ProductionManager.account(s.country), used = { military: 0, dockyard: 0 };
    a.civilian = s.civilianFactories; a.military = s.militaryFactories; a.dockyards = s.dockyards; a.construction = ConstructionManager.queue.reduce((n, q) => n + q.factories, 0);
    const law = PoliticsManager.currentLaw('economy');
    const sabotage = (s.countryEffects?.[s.country]?.sabotageUntil || 0) > GameTools.day() ? 0.75 : 1;
    for (const line of s.strategy.production) {
      const def = ProductionManager.CATALOG[line.type];
      if (!def || (line.type === 'battleship' && ProductionManager.treatyLimited())) continue;
      const count = Math.max(0, Math.min(line.factories, ProductionManager.capacity(def.pool) - used[def.pool])); used[def.pool] += count;
      const need = Object.fromEntries(Object.entries(def.resources).map(([k, v]) => [k, v * count / 7]));
      let ratio = 1;
      line.shortage = [];
      Object.entries(need).forEach(([k, v]) => { if (v <= 0) return; const have = Math.max(0, Number(s.resources[k]) || 0); const r = Math.min(1, have / v); if (r < 0.999) line.shortage.push(k); ratio = Math.min(ratio, r); });
      // 効率: 充足率 100% → 1.0、不足時は 充足率×0.5 (最低 10%)
      line.efficiency = ratio >= 0.999 ? 1 : Math.max(0.1, ratio * 0.5);
      if (!count) { line.efficiency = 0; continue; }
      Object.entries(need).forEach(([k, v]) => { s.resources[k] = Math.max(0, (Number(s.resources[k]) || 0) - v * Math.min(1, ratio)); });
      line.progress = (line.progress || 0) + def.rate * count * (1 + (law.factoryOutput || 0)) * sabotage * line.efficiency;
      const whole = Math.floor(line.progress + 1e-9); line.progress -= whole; line.produced = (line.produced || 0) + whole; a.stock[line.type] = (a.stock[line.type] || 0) + whole;
    }
    ProductionManager.syncLocal();
    if (WindowManager.isOpen('production')) ProductionManager.render();
  }

  // ==========================================================
  // UI: ヘッダー (生産・建設) / 生産カードの効率表示
  // ==========================================================
  static headerHTML() {
    const s = CoreEngine.gameState; if (!s.strategy) return '';
    const bal = TradeSystem.balance(s.country);
    return '<div class="tr-header" onclick="GameUI.switchTab(\'trade\')" title="クリックで貿易画面へ">' + TradeSystem.ORDER.map(k => {
      const r = TradeSystem.RESOURCES[k], b = bal[k], net = Math.round(b.net);
      const cls = net < 0 ? 'neg' : net > 0 ? 'pos' : '';
      return '<span class="tr-chip ' + cls + '" title="' + r.name + ': 産出 ' + b.production + ' + 輸入 ' + b.imports + ' − 輸出 ' + b.exports + ' − 需要 ' + b.demand.toFixed(1) + ' ／ 備蓄 ' + Math.floor(s.resources[k] || 0) + '">' + TradeSystem.icon(k, 18) + r.name + ' <b>' + (net > 0 ? '+' : '') + net + '</b></span>';
    }).join('') + '<span class="tr-chip go">📦 貿易 ›</span></div>';
  }
  static injectHeader(contentId) {
    const el = document.getElementById(contentId); if (!el) return;
    let bar = el.querySelector(':scope > .tr-header');
    const html = TradeSystem.headerHTML(); if (!html) return;
    if (bar) { bar.outerHTML = html; } else { el.insertAdjacentHTML('afterbegin', html); }
  }
  static refreshHeaders() {
    if (typeof WindowManager === 'undefined') return;
    if (WindowManager.isOpen('production')) TradeSystem.injectHeader('production-content');
    if (WindowManager.isOpen('construction')) TradeSystem.injectHeader('construction-content');
  }
  static decorateProduction() {
    TradeSystem.injectHeader('production-content');
    const el = document.getElementById('production-content'); if (!el) return;
    const s = CoreEngine.gameState, lines = s.strategy?.production || [];
    const byName = Object.fromEntries(Object.entries(ProductionManager.CATALOG).map(([k, d]) => [d.name, k]));
    el.querySelectorAll('.production-card').forEach(card => {
      const strong = card.querySelector('.production-item strong'); if (!strong) return;
      const type = byName[strong.textContent.replace('（条約制限）', '').trim()]; if (!type) return;
      const line = lines.find(l => l.type === type); if (!line || !(line.factories > 0)) return;
      const costs = card.querySelector('.production-costs'); if (!costs) return;
      const stop = costs.querySelector('strong[role="status"]'); if (stop) stop.remove();
      const eff = line.efficiency == null ? 1 : line.efficiency;
      const short = (line.shortage || []).map(k => TradeSystem.icon(k, 14) + TradeSystem.RESOURCES[k]?.name).join(' ');
      const shortText = (line.shortage || []).map(k => TradeSystem.RESOURCES[k]?.name).join(' ');
      costs.insertAdjacentHTML('beforeend', '<span class="tr-eff ' + (eff < 0.999 ? 'warn' : 'ok') + '" title="' + (eff < 0.999 ? '資源不足: ' + shortText + ' — 貿易で輸入してください' : '資源充足') + '">' + (eff < 0.999 ? '⚠ ' : '✔ ') + '生産効率 ' + Math.round(eff * 100) + '%' + (eff < 0.999 ? ' (不足: ' + short + ')' : '') + '</span>');
      card.classList.toggle('tr-short', eff < 0.999);
    });
  }
  static summaryLine(sid) {
    const r = TradeSystem.stateResources(sid);
    const parts = TradeSystem.ORDER.filter(k => r[k]).map(k => TradeSystem.icon(k, 14) + ' ' + TradeSystem.RESOURCES[k].name + ' ' + r[k]);
    return '<span style="font-size:11px;color:#c9b27a">⛏️ 資源: ' + (parts.length ? parts.join(' ／ ') : 'なし') + '</span>';
  }

  // ==========================================================
  // UI: 貿易画面
  // ==========================================================
  static render() {
    const el = document.getElementById('trade-content'); if (!el || !CoreEngine.gameState.strategy) return;
    if (typeof GameTools !== 'undefined' && GameTools.editing && GameTools.editing('trade-content')) return;
    const s = CoreEngine.gameState, me = s.country, bal = TradeSystem.balance(me);
    const free = ProductionManager.freeCivilian(), delta = TradeSystem.factoryDelta(me);
    const policy = s.strategy.exportPolicy || 'limited';
    const filter = TradeSystem.filter || 'all';
    let html = '<div class="tr-root"><div class="tr-head"><div class="tr-title"><div class="tr-mark">📦</div><div><h3>貿易・資源 <small>TRADE &amp; RESOURCES</small></h3><p>民需工場 1 = 資源 8/日。輸入は空き民需工場を使い、輸出すると相手の民需工場の使用権を得ます。 空き民需工場 <b>' + free + '</b>' + (delta ? ' (貿易による増減 ' + (delta > 0 ? '+' : '') + delta + ')' : '') + '</p></div></div>' +
      '<div class="tr-policy">輸出方針 <select onchange="TradeSystem.setExportPolicy(this.value)">' + [['free', '自由貿易 (余剰を全て輸出可)'], ['limited', '輸出制限 (余剰の50%まで)'], ['closed', '閉鎖経済 (輸出しない)']].map(([v, l]) => '<option value="' + v + '"' + (policy === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div></div>';
    // 自国の収支
    html += '<div class="tr-section"><h4>自国の資源収支 (1日あたり)</h4><table class="tr-table"><thead><tr><th>資源</th><th>産出</th><th>輸入</th><th>輸出</th><th>需要</th><th>収支</th><th>備蓄</th><th></th></tr></thead><tbody>' + TradeSystem.ORDER.map(k => {
      const r = TradeSystem.RESOURCES[k], b = bal[k], net = Math.round(b.net * 10) / 10;
      return '<tr class="' + (net < 0 ? 'neg' : '') + '"><td>' + TradeSystem.icon(k, 20) + ' ' + r.name + '</td><td>' + b.production + '</td><td class="pos">' + (b.imports ? '+' + b.imports : '—') + '</td><td class="neg">' + (b.exports ? '−' + b.exports : '—') + '</td><td>' + b.demand.toFixed(1) + '</td><td><b class="' + (net < 0 ? 'neg' : 'pos') + '">' + (net > 0 ? '+' : '') + net + '</b></td><td>' + Math.floor(s.resources[k] || 0) + '</td><td>' + (net < 0 ? '<button class="tr-btn small" onclick="TradeSystem.filter=\'' + k + '\';TradeSystem.render()">輸入先を探す</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
    // 契約
    const myImports = TradeSystem.deals().filter(d => d.buyer === me), myExports = TradeSystem.deals().filter(d => d.seller === me);
    html += '<div class="tr-cols"><div class="tr-section"><h4>輸入契約 <small>民需工場 ' + myImports.reduce((n, d) => n + d.factories, 0) + ' 使用</small></h4>' + (myImports.length ? myImports.map(d => '<div class="tr-deal"><span>' + TradeSystem.icon(d.resource, 16) + ' ' + TradeSystem.esc(DiplomacyManager.nameOf(d.seller)) + ' → ' + TradeSystem.RESOURCES[d.resource].name + ' <b>' + d.amount + '</b>/日</span><span>🏭' + d.factories + '</span><button class="tr-btn small" onclick="TradeSystem.adjust(\'' + d.seller + '\',\'' + d.resource + '\',-1)">−8</button><button class="tr-btn small" onclick="TradeSystem.adjust(\'' + d.seller + '\',\'' + d.resource + '\',1)">+8</button></div>').join('') : '<p class="sn-help">輸入契約はありません。</p>') + '</div>' +
      '<div class="tr-section"><h4>輸出契約 <small>民需工場 +' + myExports.reduce((n, d) => n + d.factories, 0) + ' 獲得</small></h4>' + (myExports.length ? myExports.map(d => '<div class="tr-deal"><span>' + TradeSystem.icon(d.resource, 16) + ' ' + TradeSystem.esc(DiplomacyManager.nameOf(d.buyer)) + ' ← ' + TradeSystem.RESOURCES[d.resource].name + ' <b>' + d.amount + '</b>/日</span><span>🏭+' + d.factories + '</span><button class="tr-btn small danger" onclick="TradeSystem.cancelExport(\'' + d.buyer + '\',\'' + d.resource + '\')">破棄</button></div>').join('') : '<p class="sn-help">各国は不足資源を自国の余剰から自動で輸入します (輸出方針で制御)。</p>') + '</div></div>';
    // 世界の輸出市場
    const countries = (typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.countries : []).map(c => ({ ...c, surplus: TradeSystem.surplus(c.id), deals: TradeSystem.deals().filter(d => d.buyer === me && d.seller === c.id) }))
      .filter(c => filter === 'all' ? (TradeSystem.ORDER.some(k => c.surplus[k] >= TradeSystem.UNIT) || c.deals.length) : (c.surplus[filter] >= TradeSystem.UNIT || c.deals.some(d => d.resource === filter)))
      .sort((a, b) => (filter === 'all' ? TradeSystem.ORDER.reduce((n, k) => n + b.surplus[k], 0) - TradeSystem.ORDER.reduce((n, k) => n + a.surplus[k], 0) : b.surplus[filter] - a.surplus[filter]));
    html += '<div class="tr-section"><h4>世界の輸出市場 <small>' + countries.length + 'か国</small><span class="tr-filter">' + ['all', ...TradeSystem.ORDER].map(k => '<button class="tr-btn small' + (filter === k ? ' on' : '') + '" onclick="TradeSystem.filter=\'' + k + '\';TradeSystem.render()">' + (k === 'all' ? '全て' : TradeSystem.icon(k, 14) + ' ' + TradeSystem.RESOURCES[k].name) + '</button>').join('') + '</span></h4>' +
      '<table class="tr-table market"><thead><tr><th>国</th>' + TradeSystem.ORDER.map(k => '<th>' + TradeSystem.icon(k, 18) + ' ' + TradeSystem.RESOURCES[k].name + '</th>').join('') + '</tr></thead><tbody>' +
      (countries.length ? countries.map(c => {
        const war = !TradeSystem.canTrade(me, c.id);
        return '<tr' + (war ? ' class="war"' : '') + '><td><b>' + TradeSystem.esc(c.name) + '</b>' + (war ? '<small>交戦中</small>' : '<small>' + c.id + (c.relation != null ? ' ／ 関係 ' + c.relation : '') + '</small>') + '</td>' + TradeSystem.ORDER.map(k => {
          const d = c.deals.find(x => x.resource === k), cur = d ? d.amount : 0, avail = c.surplus[k];
          if (!avail && !cur) return '<td class="dim">—</td>';
          return '<td><div class="tr-cell"><small>余剰 ' + avail + '</small><div class="tr-ctl"><button class="tr-btn small" ' + (cur ? '' : 'disabled') + ' onclick="TradeSystem.adjust(\'' + c.id + '\',\'' + k + '\',-1)">−</button><b' + (cur ? ' class="pos"' : '') + '>' + cur + '</b><button class="tr-btn small" ' + (avail >= TradeSystem.UNIT && !war ? '' : 'disabled') + ' onclick="TradeSystem.adjust(\'' + c.id + '\',\'' + k + '\',1)">＋</button></div>' + (cur ? '<small>' + TradeSystem.icon('factory', 12) + ' ' + cur / TradeSystem.UNIT + '</small>' : '') + '</div></td>';
        }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="7" class="sn-help">条件に合う輸出国がありません。</td></tr>') + '</tbody></table></div>';
    // 自国の州別産出
    const states = Object.entries(MapRenderer.states || {}).filter(([, st]) => st.owner === me).map(([sid, st]) => [sid, st, TradeSystem.stateResources(sid)]).filter(([, , r]) => Object.keys(r).length);
    html += '<div class="tr-section"><h4>自国領の資源産出 (州別)</h4><div class="tr-states">' + (states.length ? states.map(([sid, st, r]) => '<div class="tr-state" onclick="ConstructionManager.selectState(\'' + sid + '\')"><b>' + TradeSystem.esc(st.name || '州' + sid) + '</b>' + TradeSystem.ORDER.filter(k => r[k]).map(k => '<span>' + TradeSystem.icon(k, 18) + r[k] + '</span>').join('') + '</div>').join('') : '<p class="sn-help">資源を産出する州がありません。</p>') + '</div></div></div>';
    el.innerHTML = html;
  }
}
if (typeof window !== 'undefined') window.TradeSystem = TradeSystem;
