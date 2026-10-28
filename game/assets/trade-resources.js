/* trade-resources.js — HOI4風「貿易・資源・民需工場 (Trade & Resources)」
 *
 *  1. 6大資源 (石油/鉄/アルミ/タングステン/ゴム/クロム) を州ごとに産出し、自国が支配 (owner) する州の合計を
 *     「自国の基礎生産量」とする。生産ライン (軍需工場) ごとに資源コストが発生し、毎時 (毎フレーム) 消費する。
 *  2. 供給 (自国生産 + 実効輸入、さらに備蓄) が需要に対して不足すると、資源の使用量で重み付けした
 *     生産効率が不足割合に応じて低下する (最大 −80%)。不足資源のアイコンは赤く点滅して警告する。
 *  3. 貿易は「民需工場 1 = 資源 8/日」。輸入すると自国の民需工場が相手国の使用枠へ移転 (ロック) され、
 *     輸出すると相手国の民需工場の使用権を得る。海上貿易は輸送船 (Convoy) を自動で割り当て、不足すると
 *     貿易効率 (= 実効輸入量) が低下する。
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
  static UNIT = 8;              // 民需工場 1 = 資源 8/日 (HOI4 基本レート)
  static CONVOY_PER_UNIT = 1;   // 海外貿易: 資源 8/日 ごとに輸送船 1 隻を割り当て
  static MAX_PENALTY = 0.8;     // 資源不足による生産効率ペナルティの上限 (−80%)
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
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  static num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  static round(v, d = 1) { const p = Math.pow(10, d); return Math.round(TradeSystem.num(v) * p) / p; }
  static day() { return typeof GameTools !== 'undefined' ? GameTools.day() : 0; }

  // ==========================================================
  // 初期化・フック
  // ==========================================================
  static init() {
    if (TradeSystem.installed) return;
    TradeSystem.installed = true;
    TradeSystem.installHooks();
    CoreEngine.registerTickCallback(() => TradeSystem.onTick());
    const tpl = document.getElementById('tpl-trade');
    if (tpl) { tpl.dataset.title = '📦 貿易・資源 — Trade & Resources'; tpl.dataset.w = '1240'; tpl.dataset.h = '820'; }
    CoreEngine.log('📦 貿易システム: 6大資源・生産ラインの資源消費・民需工場 (1工場=8資源)・輸送船が有効になりました。');
  }
  static installHooks() {
    // 貿易画面 (ResourceManager / TradeManager の両方から呼ばれる)
    if (typeof TradeManager !== 'undefined') TradeManager.render = () => TradeSystem.render();
    // 毎時の再描画はスライダー操作を妨げるので、1日1回 + 操作中はスキップ
    if (typeof ResourceManager !== 'undefined' && !ResourceManager._tradeHooked) {
      ResourceManager._tradeHooked = true;
      ResourceManager.onTick = () => {
        if (typeof GameUI === 'undefined' || GameUI.currentTab !== 'trade') return;
        const el = document.getElementById('trade-content');
        if (el && el.contains(document.activeElement)) return;
        if (TradeSystem._renderedDay === TradeSystem.day()) return;
        TradeSystem.render();
      };
    }
    // 民需工場: 輸入で使用、輸出で獲得 (相手国の使用枠へ移転)
    if (typeof FactoryBudget !== 'undefined' && !FactoryBudget._tradeHooked) {
      FactoryBudget._tradeHooked = true;
      const orig = FactoryBudget.availableCivilian.bind(FactoryBudget);
      // 輸入 = 民需工場を相手の使用枠へ移転 (delta < 0) / 輸出 = 相手の民需工場の使用権を獲得 (delta > 0)
      FactoryBudget.availableCivilian = (tag = CoreEngine.gameState.country) => Math.max(0, orig(tag) + TradeSystem.factoryDelta(tag));
    }
    if (typeof ProductionManager !== 'undefined' && !ProductionManager._tradeHooked) {
      ProductionManager._tradeHooked = true;
      // 生産 tick: 資源不足は停止ではなく「生産効率の低下」に
      ProductionManager.tick = () => TradeSystem.productionTick();
      const origRender = ProductionManager.render.bind(ProductionManager);
      ProductionManager.render = () => { origRender(); TradeSystem.decorateProduction(); };
    }
    // ロード / マルチプレイ同期で州の所有者が変わったら資源キャッシュを捨てる
    if (typeof StrategyGame !== 'undefined' && typeof StrategyGame.apply === 'function' && !StrategyGame._tradeHooked) {
      StrategyGame._tradeHooked = true;
      const origApply = StrategyGame.apply.bind(StrategyGame);
      StrategyGame.apply = (data) => { origApply(data); TradeSystem.invalidate(); };
    }
    if (typeof ConstructionManager !== 'undefined' && !ConstructionManager._tradeHooked) {
      ConstructionManager._tradeHooked = true;
      const origRender = ConstructionManager.render.bind(ConstructionManager);
      ConstructionManager.render = () => { origRender(); TradeSystem.injectHeader('construction-content'); };
    }
  }

  // ==========================================================
  // 州ごとの資源産出 (決定論的)
  // ==========================================================
  static hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
  static states() { return (typeof MapRenderer !== 'undefined' && MapRenderer.states) || {}; }
  /** 同じ (初期) 所有者の州グループ = 資源配分の重み付け単位 */
  static ownerGroup(owner) {
    const cache = TradeSystem.ensureCache();
    cache.groups ||= {};
    if (cache.groups[owner]) return cache.groups[owner];
    const ids = [], weights = {};
    let total = 0;
    Object.entries(TradeSystem.states()).forEach(([id, st]) => {
      if ((st.initialOwner || st.owner) !== owner) return;
      ids.push(id);
      const w = 0.3 + TradeSystem.hash(owner + ':' + id) * 1.4;
      weights[id] = w; total += w;
    });
    return (cache.groups[owner] = { ids, weights, total: total || 1, count: ids.length });
  }
  /**
   * 国内の州へ資源を配分する (国ごとの合計は PROFILE の総生産量に一致)。
   * 資源は特定の州に偏在させ、決定論的に配分する。
   */
  static ownerResources(owner) {
    const cache = TradeSystem.ensureCache();
    cache.ownerRes ||= {};
    if (cache.ownerRes[owner]) return cache.ownerRes[owner];
    const group = TradeSystem.ownerGroup(owner);
    const profile = TradeSystem.PROFILE[owner] || TradeSystem.PROFILE.default;
    const out = {};
    group.ids.forEach(id => { out[id] = {}; });
    TradeSystem.ORDER.forEach(k => {
      const total = profile[k] || 0;
      if (!total) return;
      // 資源ごとの偏在 (特定の州に集中させる)
      const weights = group.ids.map(id => {
        const focus = TradeSystem.hash(k + ':' + owner + ':' + id);
        return (group.weights[id] / group.total) * (focus > 0.55 ? 2.4 : focus > 0.25 ? 1 : 0.15);
      });
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      group.ids.forEach((id, i) => {
        const v = Math.round(total * weights[i] / sum);
        if (v >= 1) out[id][k] = v;
      });
    });
    return (cache.ownerRes[owner] = out);
  }
  static stateResources(sid) {
    const st = TradeSystem.states()[sid]; if (!st) return {};
    if (st.res) return st.res;
    const owner = st.initialOwner || st.owner || 'default';
    if (!st.initialOwner) st.initialOwner = owner;
    return (st.res = TradeSystem.ownerResources(owner)[sid] || {});
  }
  /** 自国が支配 (Controller) している州の産出合計 = 基礎生産量 (1日あたり) */
  static production(tag) {
    TradeSystem.ensureCache();
    if (TradeSystem._cache.prod[tag]) return TradeSystem._cache.prod[tag];
    const out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0]));
    Object.entries(TradeSystem.states()).forEach(([sid, st]) => {
      if (st.owner !== tag) return;
      const r = TradeSystem.stateResources(sid);
      TradeSystem.ORDER.forEach(k => { out[k] += r[k] || 0; });
    });
    TradeSystem._cache.prod[tag] = out;
    return out;
  }

  // ---- キャッシュ (毎日 / 取引変更時に破棄) ----
  static ensureCache() {
    const day = TradeSystem.day();
    if (!TradeSystem._cache || TradeSystem._cacheDay !== day) {
      TradeSystem._cacheDay = day;
      TradeSystem._cache = { prod: {}, demand: {}, bal: {}, surplus: {} };
      TradeSystem._land = null;
    }
    return TradeSystem._cache;
  }
  static invalidate() { TradeSystem._cache = null; TradeSystem._cacheDay = null; TradeSystem._land = null; }

  // ==========================================================
  // 陸路 / 海路 (輸送船が必要か)
  // ==========================================================
  static landConnected(a, b) {
    if (a === b) return true;
    TradeSystem.ensureCache();
    TradeSystem._land ||= {};
    const key = a + '>' + b;
    if (TradeSystem._land[key] != null) return TradeSystem._land[key];
    let result = false;
    const neighbors = typeof MapRenderer !== 'undefined' ? MapRenderer.provNeighbors : null;
    const ownerOf = typeof MapRenderer !== 'undefined' && typeof MapRenderer.ownerOf === 'function' ? (pid) => MapRenderer.ownerOf(pid) : null;
    if (neighbors && ownerOf) {
      const all = TradeSystem.states();
      for (const sid of Object.keys(all)) {
        const st = all[sid];
        if (!st || st.owner !== a) continue;
        for (const pid of st.provinces || []) {
          const list = neighbors.get(pid) || neighbors.get(Number(pid));
          if (!list) continue;
          for (const n of list) {
            if (ownerOf(n) === b) { result = true; break; }
          }
          if (result) break;
        }
        if (result) break;
      }
    }
    TradeSystem._land[key] = result;
    TradeSystem._land[b + '>' + a] = result;
    return result;
  }
  /** 海上貿易か (陸続きでなければ輸送船が必要) */
  static overseas(a, b) { return !TradeSystem.landConnected(a, b); }

  // ==========================================================
  // 生産ラインの資源需要 (1工場あたり / 1日)
  // ==========================================================
  /** 1 工場 (生産ライン) あたりの資源コスト。例: 戦車 = 鉄2 / タングステン0.7 / クロム1.4 */
  static lineCost(type) {
    const def = typeof ProductionManager !== 'undefined' ? ProductionManager.CATALOG[type] : null;
    if (!def) return {};
    const out = {};
    Object.entries(def.resources || {}).forEach(([k, v]) => { if (TradeSystem.ORDER.includes(k)) out[k] = TradeSystem.round(v / 7, 2); });
    return out;
  }
  static demandLines(tag = CoreEngine.gameState.country) {
    const s = CoreEngine.gameState;
    const lines = tag === s.country ? (s.strategy?.production || []) : [];
    const used = { military: 0, dockyard: 0 };   // 生産ラインは工場プールの上限までしか稼働しない
    return lines.map(line => {
      const def = ProductionManager.CATALOG[line.type];
      if (!def) return null;
      const factories = Math.max(0, TradeSystem.num(line.factories));
      const pool = def.pool || 'military';
      const active = Math.max(0, Math.min(factories, ProductionManager.capacity(pool) - used[pool]));
      used[pool] += active;
      const perFactory = TradeSystem.lineCost(line.type);
      const total = {};
      Object.entries(perFactory).forEach(([k, v]) => { total[k] = v * active; });
      return {
        type: line.type, name: def.name, factories, active, perFactory, total,
        efficiency: line.efficiency == null ? 1 : line.efficiency,
        shortage: line.shortage || []
      };
    }).filter(Boolean);
  }
  /** 生産ラインの資源需要 (1日あたり) */
  static demand(tag) {
    TradeSystem.ensureCache();
    if (TradeSystem._cache.demand[tag]) return TradeSystem._cache.demand[tag];
    const s = CoreEngine.gameState, out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0]));
    if (tag === s.country) {
      TradeSystem.demandLines(tag).forEach(line => {
        Object.entries(line.total).forEach(([k, v]) => { out[k] += v; });
      });
    } else {
      // AI: 産出の一部 + 軍需工場に比例した需要 (決定論的)
      const prod = TradeSystem.production(tag);
      const acc = typeof ProductionManager !== 'undefined' ? ProductionManager.account(tag) : { military: 15 };
      const war = (s.atWar || []).includes(tag) ? 1 : 0;
      TradeSystem.ORDER.forEach(k => {
        const base = { steel: 0.9, aluminum: 0.35, oil: 0.3, tungsten: 0.25, chromium: 0.3, rubber: 0.25 }[k];
        out[k] = TradeSystem.round(prod[k] * (0.45 + TradeSystem.hash(tag + k) * 0.3) + (acc.military || 15) * base * (1 + 0.3 * war), 1);
      });
    }
    TradeSystem._cache.demand[tag] = out;
    return out;
  }

  // ==========================================================
  // 輸送船 (Convoy)
  // ==========================================================
  static convoyAvailable(tag) {
    const s = CoreEngine.gameState;
    const national = Math.max(0, Math.floor(TradeSystem.num(s.convoys)));
    if (typeof ProductionManager === 'undefined') return national;
    const acc = ProductionManager.account(tag);
    const raw = acc?.stock?.convoys;
    const stock = Number.isFinite(Number(raw)) ? Math.max(0, Math.floor(Number(raw))) : null;
    // 生産アカウント未初期化 (建国直後) は国家の輸送船備蓄を使う
    if (stock == null || (stock === 0 && !acc.initialized && national > 0)) return national;
    return stock;
  }
  /** 海上貿易に必要な輸送船 (買い手が用意する) */
  static convoysNeeded(tag) {
    return TradeSystem.deals().reduce((n, d) => {
      if (d.buyer !== tag) return n;
      if (!TradeSystem.overseas(d.buyer, d.seller)) return n;
      return n + Math.ceil(TradeSystem.num(d.amount) / TradeSystem.UNIT) * TradeSystem.CONVOY_PER_UNIT;
    }, 0);
  }
  static convoyInfo(tag = CoreEngine.gameState.country) {
    const needed = TradeSystem.convoysNeeded(tag);
    const available = TradeSystem.convoyAvailable(tag);
    const efficiency = needed <= 0 ? 1 : Math.max(0, Math.min(1, available / needed));
    return { needed, available, shortage: Math.max(0, needed - available), efficiency, ratio: efficiency };
  }

  // ==========================================================
  // 需給 (輸入 / 輸出 / 収支)
  // ==========================================================
  static deals() { const s = CoreEngine.gameState; if (!s.strategy) return []; return (s.strategy.trades ||= []); }
  static deal(buyer, seller, resource) { return TradeSystem.deals().find(d => d.buyer === buyer && d.seller === seller && d.resource === resource) || null; }
  static imports(tag) { const out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0])); TradeSystem.deals().forEach(d => { if (d.buyer === tag) out[d.resource] += TradeSystem.num(d.amount); }); return out; }
  static exports(tag) { const out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0])); TradeSystem.deals().forEach(d => { if (d.seller === tag) out[d.resource] += TradeSystem.num(d.amount); }); return out; }
  /** 輸送船不足を反映した実効輸入量 */
  static importsEffective(tag) {
    const eff = tag === CoreEngine.gameState.country ? TradeSystem.convoyInfo(tag).efficiency : 1;
    const out = Object.fromEntries(TradeSystem.ORDER.map(k => [k, 0]));
    TradeSystem.deals().forEach(d => { if (d.buyer === tag) out[d.resource] += TradeSystem.num(d.amount) * eff; });
    return out;
  }
  /**
   * 輸出可能量 (余剰プール)。
   *  自国  : 生産 + 実効輸入 − 需要 − 輸出 (自国防衛分を差し引いた本当の余り)
   *  他国  : 生産の 35% を輸出市場へ放出 (AI の国内消費は残り 65% とみなす)
   */
  static surplus(tag) {
    const s = CoreEngine.gameState, ex = TradeSystem.exports(tag);
    if (tag !== s.country) {
      const p = TradeSystem.production(tag);
      // 他国は生産の 40% を輸出市場へ (最低でも民需工場 1 = 8 を 1 枠)
      return Object.fromEntries(TradeSystem.ORDER.map(k => {
        const sellable = p[k] >= TradeSystem.UNIT ? Math.max(TradeSystem.UNIT, Math.floor(p[k] * 0.4 / TradeSystem.UNIT) * TradeSystem.UNIT) : 0;
        return [k, Math.max(0, sellable - ex[k])];
      }));
    }
    const d = TradeSystem.demand(tag), im = TradeSystem.importsEffective(tag);
    const p = TradeSystem.production(tag);
    return Object.fromEntries(TradeSystem.ORDER.map(k => [k, Math.max(0, Math.floor(p[k] + im[k] - d[k] - ex[k]))]));
  }
  /**
   * 需給の内訳 (1日あたり)
   *  production : 自国の基礎生産量
   *  imports    : 輸入量 (契約値) / importsEffective: 輸送船効率を反映した実効輸入量
   *  exports    : 輸出量
   *  usable     : 実質利用可能量 = 生産 + 実効輸入 − 輸出
   *  demand     : 生産ラインの消費量
   *  net        : 収支 = usable − demand
   */
  static balance(tag) {
    TradeSystem.ensureCache();
    const s = CoreEngine.gameState;
    const p = TradeSystem.production(tag), d = TradeSystem.demand(tag), ex = TradeSystem.exports(tag);
    const im = TradeSystem.imports(tag), imEff = TradeSystem.importsEffective(tag);
    return Object.fromEntries(TradeSystem.ORDER.map(k => {
      const usable = p[k] + imEff[k] - ex[k];
      // 備蓄は不足を補える (備蓄が尽きて初めて生産効率が落ちる)
      const stock = tag === s.country ? Math.max(0, TradeSystem.num(s.resources[k])) : 0;
      const covered = usable + Math.min(stock, Math.max(0, d[k] - usable));
      return [k, {
        production: p[k], imports: im[k], importsEffective: imEff[k], exports: ex[k], demand: d[k],
        need: d[k], stock, usable, net: usable - d[k],
        ratio: d[k] > 0.001 ? Math.max(0, Math.min(1, covered / d[k])) : 1
      }];
    }));
  }
  /** 資源ごとの充足率 (不足割合 → 生産効率ペナルティの元) */
  static resourceRatios(tag = CoreEngine.gameState.country) {
    const bal = TradeSystem.balance(tag), out = {};
    TradeSystem.ORDER.forEach(k => { out[k] = bal[k].ratio; });
    return out;
  }
  /** 資源ごとの生産効率 (不足割合 × 最大 −80%) */
  static resourceEfficiency(ratio) {
    if (ratio == null || ratio >= 0.999) return 1;
    return Math.max(1 - TradeSystem.MAX_PENALTY, 1 - TradeSystem.MAX_PENALTY * (1 - Math.max(0, ratio)));
  }
  /**
   * 生産ラインの生産効率: 消費する資源ごとの効率を、1工場あたりの使用量で重み付けして平均する。
   * (鉄は足りているがクロムが 0 → クロムを使用する分だけ効率が落ちる)
   */
  static lineEfficiency(perFactory, ratios) {
    let weight = 0, sum = 0;
    Object.entries(perFactory).forEach(([k, v]) => {
      if (!(v > 0)) return;
      weight += v;
      sum += v * TradeSystem.resourceEfficiency(ratios[k]);
    });
    return weight > 0 ? sum / weight : 1;
  }
  static factoryDelta(tag) { return TradeSystem.deals().reduce((n, d) => n + (d.seller === tag ? TradeSystem.num(d.factories) : 0) - (d.buyer === tag ? TradeSystem.num(d.factories) : 0), 0); }
  /** 輸入で使用中の民需工場数 */
  static importFactories(tag = CoreEngine.gameState.country) { return TradeSystem.deals().filter(d => d.buyer === tag).reduce((n, d) => n + TradeSystem.num(d.factories), 0); }

  // ==========================================================
  // 取引
  // ==========================================================
  static canTrade(a, b) {
    if (a === b) return false;
    if (typeof MarketManager !== 'undefined' && MarketManager.atWar) { try { if (MarketManager.atWar(a, b)) return false; } catch (e) { /* ignore */ } }
    return true;
  }
  static freeFactories(tag = CoreEngine.gameState.country) {
    const free = typeof ProductionManager !== 'undefined' ? ProductionManager.freeCivilian() : 0;
    return free + TradeSystem.importFactories(tag);
  }
  /** 輸入量を units (8単位) 増減 */
  static adjust(seller, resource, delta) {
    const existing = TradeSystem.deal(CoreEngine.gameState.country, seller, resource);
    const current = existing ? TradeSystem.num(existing.amount) : 0;
    return TradeSystem.setDealAmount(seller, resource, current + delta * TradeSystem.UNIT);
  }
  /**
   * 輸入量を amount (資源/日) に設定する。
   * ・8 の倍数に丸める (民需工場 1 = 資源 8)
   * ・相手の余剰プール / 空き民需工場を超える要求は自動で上限まで丸める
   * ・新規の海上貿易は輸送船を自動割り当て (不足なら効率低下)
   */
  static setDealAmount(seller, resource, amount) {
    const s = CoreEngine.gameState, me = s.country;
    if (!TradeSystem.RESOURCES[resource]) return false;
    if (!TradeSystem.canTrade(me, seller)) { GameUI.notify('この国とは取引できません (交戦中)。', 'alert'); return false; }
    const existing = TradeSystem.deal(me, seller, resource);
    const current = existing ? TradeSystem.num(existing.amount) : 0;
    let next = Math.max(0, Math.round(TradeSystem.num(amount) / TradeSystem.UNIT) * TradeSystem.UNIT);
    // 相手の余剰プール (現在の契約分は戻る)
    if (next > 0) {
      const avail = TradeSystem.surplus(seller)[resource] + current;
      const maxUnits = Math.floor(avail / TradeSystem.UNIT) * TradeSystem.UNIT;
      if (next > maxUnits) {
        GameUI.notify(DiplomacyManager.nameOf(seller) + ' の' + TradeSystem.RESOURCES[resource].name + '輸出可能量 (余剰 ' + TradeSystem.surplus(seller)[resource] + ') を超えています — ' + maxUnits + '/日 までに調整しました。', 'alert');
        next = Math.max(0, maxUnits);
      }
      // 空き民需工場 (現在の契約分は解放される)
      const freeUnits = Math.floor(TradeSystem.freeFactories(me) * TradeSystem.UNIT);
      if (next > freeUnits) {
        if (freeUnits !== next) GameUI.notify('空き民需工場が不足しています (必要 ' + Math.ceil(next / TradeSystem.UNIT) + '／空き ' + Math.floor(freeUnits / TradeSystem.UNIT) + ')。', 'alert');
        next = Math.floor(freeUnits / TradeSystem.UNIT) * TradeSystem.UNIT;
      }
    }
    if (next === current) { TradeSystem.render(); return false; }
    TradeSystem.setDeal(me, seller, resource, next);
    if (next > 0) {
      const info = TradeSystem.convoyInfo(me);
      const sea = TradeSystem.overseas(me, seller);
      CoreEngine.log('📦 ' + DiplomacyManager.nameOf(seller) + ' から ' + TradeSystem.RESOURCES[resource].name + ' ' + next + '/日 を輸入 (民需工場 ' + (next / TradeSystem.UNIT) + (sea ? '・海上輸送' : '・陸路') + ')');
      if (sea && info.shortage > 0) GameUI.notify('🚢 輸送船が不足しています (必要 ' + info.needed + ' / 保有 ' + info.available + ') — 貿易効率 ' + Math.round(info.efficiency * 100) + '%', 'alert');
    } else {
      CoreEngine.log('📦 ' + DiplomacyManager.nameOf(seller) + ' からの ' + TradeSystem.RESOURCES[resource].name + '輸入契約を解除しました。');
    }
    TradeSystem.render(); TradeSystem.refreshHeaders();
    return true;
  }
  static setDeal(buyer, seller, resource, amount) {
    const deals = TradeSystem.deals();
    const idx = deals.findIndex(d => d.buyer === buyer && d.seller === seller && d.resource === resource);
    if (amount <= 0) { if (idx >= 0) deals.splice(idx, 1); TradeSystem.invalidate(); return; }
    const d = {
      buyer, seller, resource, amount,
      factories: amount / TradeSystem.UNIT,
      sea: TradeSystem.overseas(buyer, seller),
      since: TradeSystem.day()
    };
    if (idx >= 0) deals[idx] = d; else deals.push(d);
    TradeSystem.invalidate();
  }
  static cancelExport(buyer, resource) {
    TradeSystem.setDeal(buyer, CoreEngine.gameState.country, resource, 0);
    (CoreEngine.gameState.strategy.tradeBlock ||= {})[buyer + ':' + resource] = TradeSystem.day() + 60;
    CoreEngine.log('📦 ' + DiplomacyManager.nameOf(buyer) + ' への ' + TradeSystem.RESOURCES[resource].name + ' 輸出契約を破棄しました。');
    TradeSystem.render(); TradeSystem.refreshHeaders();
  }
  static setExportPolicy(v) { CoreEngine.gameState.strategy.exportPolicy = v; TradeSystem.render(); }
  static setFilter(k) { TradeSystem.filter = k; TradeSystem.render(); }
  static toggleAll() { TradeSystem.showAll = !TradeSystem.showAll; TradeSystem.render(); }
  /** スライダー操作中のプレビュー (再描画せずに数値だけ更新) */
  static previewSlider(el) {
    const cell = el.closest ? el.closest('.tr-cell') : null;
    if (!cell) return;
    const amt = cell.querySelector('.tr-num'), fac = cell.querySelector('.tr-fac b');
    if (amt) amt.value = String(Number(el.value || 0) * TradeSystem.UNIT);
    if (fac) fac.textContent = String(Number(el.value || 0));
  }
  static commitSlider(seller, resource, units) { return TradeSystem.setDealAmount(seller, resource, Number(units) * TradeSystem.UNIT); }
  /** 輸入の妥結 (輸送船の消耗: 極低確率で 1 隻喪失) */
  static convoyAttrition() {
    const me = CoreEngine.gameState.country;
    const routes = TradeSystem.deals().filter(d => d.buyer === me && TradeSystem.overseas(d.buyer, d.seller));
    routes.forEach(d => {
      if (Math.random() < 1 / 120) {
        if (typeof ConvoyManager !== 'undefined' && ConvoyManager.consumeForTrade) ConvoyManager.consumeForTrade(1);
      }
    });
  }
  /** AI の輸入行動 (毎日): 不足国がプレイヤーや他国の余剰を買う */
  static aiTrade() {
    const s = CoreEngine.gameState, me = s.country, day = TradeSystem.day();
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
          if (!existing) {
            CoreEngine.log('📦 ' + DiplomacyManager.nameOf(tag) + ' が ' + TradeSystem.RESOURCES[k].name + ' ' + next + '/日 の輸入契約を締結 — 民需工場 ' + next / TradeSystem.UNIT + ' の使用権を獲得');
            GameUI.notify('📦 ' + DiplomacyManager.nameOf(tag) + ' と' + TradeSystem.RESOURCES[k].name + 'の輸出契約 (+民需工場 ' + next / TradeSystem.UNIT + ')', 'success');
          }
        }
      });
    });
    // 契約の妥当性 (交戦・余剰消滅)
    TradeSystem.deals().slice().forEach(d => {
      if (!TradeSystem.canTrade(d.buyer, d.seller)) {
        TradeSystem.setDeal(d.buyer, d.seller, d.resource, 0);
        CoreEngine.log('📦 交戦により貿易契約が失効: ' + d.buyer + ' ⇄ ' + d.seller + ' ' + TradeSystem.RESOURCES[d.resource].name);
        return;
      }
      if (d.seller !== me) {
        const avail = TradeSystem.surplus(d.seller)[d.resource] + d.amount;
        if (avail < d.amount) {
          const next = Math.floor(avail / TradeSystem.UNIT) * TradeSystem.UNIT;
          TradeSystem.setDeal(d.buyer, d.seller, d.resource, next);
          if (d.buyer === me) GameUI.notify('📦 ' + DiplomacyManager.nameOf(d.seller) + ' の余剰減少により ' + TradeSystem.RESOURCES[d.resource].name + ' 輸入が ' + next + '/日 に縮小', 'alert');
        }
      }
    });
    TradeSystem.invalidate();
  }

  // ==========================================================
  // 毎時 (毎フレーム) / 毎日処理
  // ==========================================================
  static onTick() {
    const s = CoreEngine.gameState; if (!s.strategy || !MapRenderer.ready) return;
    const me = s.country, day = TradeSystem.day();
    // 供給: 生産 + 実効輸入 − 輸出 を毎時 (1/24) ずつ備蓄へ加算する
    const bal = TradeSystem.balance(me);
    const frac = 1 / 24;
    TradeSystem.ORDER.forEach(k => {
      const supply = bal[k].production + bal[k].importsEffective - bal[k].exports;
      const cap = Math.max(300, (bal[k].production + bal[k].importsEffective) * 30);
      s.resources[k] = Math.min(cap, Math.max(0, TradeSystem.num(s.resources[k]) + supply * frac));
    });
    if (s.strategy.tradeLastDay !== day) {
      s.strategy.tradeLastDay = day;
      TradeSystem.aiTrade();
      TradeSystem.convoyAttrition();
      TradeSystem.invalidate();
      TradeSystem.reportShortage(me);
      if (typeof WindowManager !== 'undefined' && WindowManager.isOpen('trade')) TradeSystem.render();
    }
    TradeSystem.refreshHeaders();
  }
  /** 1日1回、次の不足資源を通知 (貿易画面への誘導) */
  static reportShortage(tag = CoreEngine.gameState.country) {
    const bal = TradeSystem.balance(tag);
    const short = TradeSystem.ORDER.filter(k => bal[k].need > 0 && bal[k].ratio < 0.999);
    if (!short.length) { TradeSystem.lastShortageKey = ''; return; }
    const key = short.join(',');
    if (key === TradeSystem.lastShortageKey) return;
    TradeSystem.lastShortageKey = key;
    const names = short.map(k => TradeSystem.RESOURCES[k].name).join('・');
    const penalty = Math.round((1 - Math.min(...short.map(k => bal[k].ratio))) * TradeSystem.MAX_PENALTY * 100);
    CoreEngine.log('⚠ 資源不足: ' + names + ' — 生産効率が最大 −' + penalty + '% 低下しています。貿易画面で輸入してください。');
    GameUI.notify('⚠ ' + names + ' が不足 — 生産効率 −' + penalty + '% (貿易画面で輸入)', 'alert');
  }
  /** ProductionManager.tick の置き換え: 資源不足 → 生産効率の低下 (最大 −80%) */
  static productionTick() {
    const s = CoreEngine.gameState, me = s.country;
    if (!s.strategy) return;
    const a = ProductionManager.account(me), used = { military: 0, dockyard: 0 };
    a.civilian = s.civilianFactories; a.military = s.militaryFactories; a.dockyards = s.dockyards;
    a.construction = ConstructionManager.queue.reduce((n, q) => n + q.factories, 0);
    const law = PoliticsManager.currentLaw('economy');
    const sabotage = (s.countryEffects?.[me]?.sabotageUntil || 0) > TradeSystem.day() ? 0.75 : 1;
    // 資源ごとの充足率 (自国生産 + 実効輸入 − 輸出) / 需要
    const ratios = TradeSystem.resourceRatios(me);
    TradeSystem.lastRatios = ratios;
    for (const line of s.strategy.production) {
      const def = ProductionManager.CATALOG[line.type];
      if (!def || (line.type === 'battleship' && ProductionManager.treatyLimited())) continue;
      const count = Math.max(0, Math.min(line.factories, ProductionManager.capacity(def.pool) - used[def.pool]));
      used[def.pool] += count;
      // 毎時の消費量 = (1日あたりの資源コスト) / 24
      const perTick = Object.fromEntries(Object.entries(def.resources).map(([k, v]) => [k, v * count / 7 / 24]));
      // 資源不足 → 不足割合に応じた効率低下 (最大 −80%)
      line.shortage = Object.keys(perTick).filter(k => (ratios[k] == null ? 1 : ratios[k]) < 0.999);
      line.efficiency = TradeSystem.lineEfficiency(perTick, ratios);
      if (!count) { line.efficiency = 0; line.shortage = []; continue; }
      // 実際に生産した分 (= 生産効率) だけ資源を消費する
      Object.entries(perTick).forEach(([k, v]) => {
        s.resources[k] = Math.max(0, TradeSystem.num(s.resources[k]) - v * line.efficiency);
      });
      line.progress = TradeSystem.num(line.progress) + def.rate * count * (1 + (law.factoryOutput || 0)) * sabotage * line.efficiency;
      const whole = Math.floor(line.progress + 1e-9);
      line.progress -= whole;
      line.produced = TradeSystem.num(line.produced) + whole;
      a.stock[line.type] = TradeSystem.num(a.stock[line.type]) + whole;
    }
    ProductionManager.syncLocal();
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen('production')) ProductionManager.render();
  }

  // ==========================================================
  // ヘッダー (生産・建設) / 生産カードの効率表示
  // ==========================================================
  static headerHTML() {
    const s = CoreEngine.gameState; if (!s.strategy || !MapRenderer.ready) return '';
    const bal = TradeSystem.balance(s.country);
    const convoy = TradeSystem.convoyInfo(s.country);
    return '<div class="tr-header" onclick="GameUI.switchTab(\'trade\')" title="クリックで貿易画面へ">' +
      TradeSystem.ORDER.map(k => {
        const r = TradeSystem.RESOURCES[k], b = bal[k], net = Math.round(b.net);
        const short = b.ratio < 0.999;
        const cls = short ? 'short' : net < 0 ? 'neg' : net > 0 ? 'pos' : '';
        return '<span class="tr-chip ' + cls + '" title="' + r.name + ': 生産 ' + b.production + ' + 輸入 ' + TradeSystem.round(b.importsEffective) + ' − 輸出 ' + b.exports + ' − 需要 ' + TradeSystem.round(b.demand) + ' ／ 収支 ' + TradeSystem.round(b.net) + ' ／ 備蓄 ' + Math.floor(TradeSystem.num(s.resources[k])) + (short ? ' ／ ⚠ 不足' : '') + '">' +
          TradeSystem.icon(k, 18) + r.name + ' <b>' + (net > 0 ? '+' : '') + net + '</b>' + (short ? '<em class="tr-blink">⚠</em>' : '') + '</span>';
      }).join('') +
      (convoy.shortage > 0 ? '<span class="tr-chip short">' + TradeSystem.icon('convoy', 16) + '🚢 不足 <b>' + convoy.shortage + '</b></span>' : '') +
      '<span class="tr-chip go">📦 貿易 ›</span></div>';
  }
  static injectHeader(contentId) {
    const el = document.getElementById(contentId); if (!el) return;
    const html = TradeSystem.headerHTML(); if (!html) return;
    const bar = el.querySelector(':scope > .tr-header');
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
  /** 6大資源の需給サマリー */
  static summary(tag = CoreEngine.gameState.country) {
    const bal = TradeSystem.balance(tag);
    return TradeSystem.ORDER.map(k => {
      const b = bal[k], r = TradeSystem.RESOURCES[k];
      const ratio = b.ratio;
      const penalty = ratio >= 0.999 ? 0 : Math.round((1 - ratio) * TradeSystem.MAX_PENALTY * 100);
      return { key: k, name: r.name, ...b, ratio, penalty, short: ratio < 0.999 };
    });
  }
  static flowRow(label, value, cls) { return '<span class="tr-k">' + label + '</span><b class="' + (cls || '') + '">' + value + '</b>'; }

  static render() {
    const el = document.getElementById('trade-content'); if (!el || !CoreEngine.gameState.strategy) return;
    if (!MapRenderer.ready) { el.innerHTML = '<div class="tr-root"><p class="sn-help">地図データを読み込み中です…</p></div>'; return; }
    if (typeof GameTools !== 'undefined' && GameTools.editing && GameTools.editing('trade-content')) return;
    const s = CoreEngine.gameState, me = s.country;
    const stats = TradeSystem.summary(me);
    const convoy = TradeSystem.convoyInfo(me);
    const free = typeof ProductionManager !== 'undefined' ? ProductionManager.freeCivilian() : 0;
    const delta = TradeSystem.factoryDelta(me);
    const policy = s.strategy.exportPolicy || 'limited';
    const lines = TradeSystem.demandLines(me);
    const filter = TradeSystem.filter || 'all';
    if (TradeSystem.showAll == null) TradeSystem.showAll = true;

    let html = '<div class="tr-root">';

    // ---- ヘッダー ----
    html += '<div class="tr-head"><div class="tr-title"><div class="tr-mark">📦</div><div>' +
      '<h3>貿易・資源 <small>TRADE &amp; RESOURCES</small></h3>' +
      '<p>民需工場 <b>1</b> = 資源 <b>8</b>/日。輸入は自国の民需工場を相手国の使用枠へ移転し、輸出すると相手の民需工場の使用権を得ます。</p>' +
      '</div></div><div class="tr-policy"><span class="tr-free">' + TradeSystem.icon('factory', 16) + ' 空き民需工場 <b>' + free + '</b>' + (delta ? ' <small>(貿易 ' + (delta > 0 ? '+' : '') + delta + ')</small>' : '') + '</span>' +
      '<label>輸出方針 <select onchange="TradeSystem.setExportPolicy(this.value)">' +
      [['free', '自由貿易 (余剰を全て輸出可)'], ['limited', '輸出制限 (余剰の50%まで)'], ['closed', '閉鎖経済 (輸出しない)']]
        .map(([v, l]) => '<option value="' + v + '"' + (policy === v ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></label></div></div>';

    // ---- 上部サマリーバー: 6大資源 ----
    html += '<div class="tr-section"><h4>📊 6大資源の需給 <small>1日あたり ／ 赤い点滅 = 不足</small>' +
      '<span class="tr-filter"><button class="tr-btn small' + (filter === 'all' ? ' on' : '') + '" onclick="TradeSystem.setFilter(\'all\')">全て</button>' +
      TradeSystem.ORDER.map(k => '<button class="tr-btn small' + (filter === k ? ' on' : '') + '" onclick="TradeSystem.setFilter(\'' + k + '\')">' + TradeSystem.icon(k, 14) + '</button>').join('') +
      '</span></h4><div class="tr-summary">' +
      stats.map(x => '<div class="tr-res' + (x.short ? ' short' : '') + (filter !== 'all' && filter !== x.key ? ' dim' : '') + '">' +
        '<div class="tr-res-head">' + TradeSystem.icon(x.key, 22) + '<b>' + x.name + '</b><span class="tr-res-stock">備蓄 ' + Math.floor(TradeSystem.num(s.resources[x.key])) + '</span></div>' +
        '<div class="tr-res-flow">' +
          TradeSystem.flowRow('総生産', TradeSystem.round(x.production), '') +
          TradeSystem.flowRow('輸入', '+' + TradeSystem.round(x.importsEffective) + (x.imports > x.importsEffective ? ' / ' + TradeSystem.round(x.imports) : ''), 'pos') +
          TradeSystem.flowRow('輸出', '−' + TradeSystem.round(x.exports), 'neg') +
          TradeSystem.flowRow('実質利用可能量', TradeSystem.round(x.usable), '') +
          TradeSystem.flowRow('消費', '−' + TradeSystem.round(x.demand), '') +
          TradeSystem.flowRow('収支', (x.net >= 0 ? '+' : '') + TradeSystem.round(x.net), x.net >= 0 ? 'pos' : 'neg') +
        '</div>' +
        (x.short ? '<div class="tr-warn">' + TradeSystem.icon(x.key, 14) + ' 不足 — 生産効率 −' + x.penalty + '%</div>' : '<div class="tr-ok">✔ 充足</div>') +
        '</div>').join('') + '</div></div>';

    // ---- 生産ラインの資源消費 + 輸送船 ----
    html += '<div class="tr-cols"><div class="tr-section"><h4>🏭 生産ラインの資源消費 <small>1工場あたり / 1日</small></h4>' +
      (lines.length
        ? '<table class="tr-table tr-lines"><thead><tr><th>生産ライン</th><th>工場</th><th>1工場あたり</th><th>消費 / 日</th><th>生産効率</th></tr></thead><tbody>' +
          lines.map(line => {
            const total = Object.entries(line.total).filter(([, v]) => v > 0).map(([k, v]) => '<span class="tr-tag">' + TradeSystem.icon(k, 14) + TradeSystem.round(v) + '</span>').join(' ') || '<span class="tr-none">—</span>';
            const per = Object.entries(line.perFactory).map(([k, v]) => '<span class="tr-tag">' + TradeSystem.icon(k, 14) + TradeSystem.round(v, 2) + '</span>').join(' ');
            const short = line.shortage.map(k => TradeSystem.icon(k, 14)).join('');
            const eff = Math.round(line.efficiency * 100);
            return '<tr' + (line.shortage.length ? ' class="short"' : '') + '><td>' + TradeSystem.esc(line.name) + '</td>' +
              '<td title="' + (line.active !== line.factories ? 'プール上限のため ' + line.active + ' 工場のみ稼働' : '') + '">' + line.active +
              (line.active !== line.factories ? ' <small>/ ' + line.factories + '</small>' : '') + '</td><td class="tr-tags">' + (per || '—') + '</td><td class="tr-tags">' + total + '</td>' +
              '<td><b class="' + (eff >= 100 ? 'pos' : 'neg') + '">' + (line.active ? eff + '%' : '—') + '</b>' + (short ? ' <span class="tr-blink">' + short + '</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table>'
        : '<p class="sn-help">生産ラインがありません。生産画面で軍需工場を割り当ててください。</p>') + '</div>' +

      '<div class="tr-section"><h4>🚢 輸送船と貿易効率</h4>' +
      '<div class="tr-convoy' + (convoy.shortage ? ' short' : '') + '">' + TradeSystem.icon('convoy', 26) +
        '<div class="tr-convoy-main"><b>必要 ' + convoy.needed + ' 隻 / 保有 ' + convoy.available + ' 隻</b>' +
        '<small>海上貿易 ' + TradeSystem.deals().filter(d => d.buyer === me && TradeSystem.overseas(d.buyer, d.seller)).length + ' 件 ／ 陸路 ' + TradeSystem.deals().filter(d => d.buyer === me && !TradeSystem.overseas(d.buyer, d.seller)).length + ' 件</small></div>' +
        '<div class="tr-convoy-eff"><small>貿易効率</small><b class="' + (convoy.efficiency >= 0.999 ? 'pos' : 'neg') + '">' + Math.round(convoy.efficiency * 100) + '%</b></div></div>' +
      '<div class="tr-bar"><i style="width:' + Math.round(convoy.efficiency * 100) + '%" class="' + (convoy.efficiency >= 0.999 ? 'ok' : 'warn') + '"></i></div>' +
      '<p class="sn-help">' + (convoy.shortage
        ? '⚠ 輸送船が ' + convoy.shortage + ' 隻不足しています。海上貿易の実効輸入量が ' + Math.round(convoy.efficiency * 100) + '% に低下します (生産画面で輸送船を建造してください)。'
        : '海を隔てた貿易には資源 8/日 ごとに輸送船 1 隻を自動で割り当てます。陸続きの国は輸送船不要です。') +
      '</p><div class="tr-inline"><button class="tr-btn small" onclick="GameUI.switchTab(\'production\')">🏭 生産画面 (輸送船の建造)</button>' +
      '<button class="tr-btn small" onclick="GameUI.switchTab(\'construction\')">🏗️ 建設画面</button></div></div></div>';

    // ---- 契約一覧 ----
    const myImports = TradeSystem.deals().filter(d => d.buyer === me), myExports = TradeSystem.deals().filter(d => d.seller === me);
    html += '<div class="tr-cols"><div class="tr-section"><h4>📥 輸入契約 <small>' + myImports.length + ' 件 ／ 民需工場 ' + TradeSystem.round(myImports.reduce((n, d) => n + TradeSystem.num(d.factories), 0)) + ' 使用</small></h4>' +
      (myImports.length ? myImports.map(d => {
        const sea = TradeSystem.overseas(d.buyer, d.seller);
        return '<div class="tr-deal">' + TradeSystem.icon(d.resource, 18) + '<span class="tr-deal-name">' + TradeSystem.esc(DiplomacyManager.nameOf(d.seller)) + ' → <b>' + TradeSystem.RESOURCES[d.resource].name + ' ' + TradeSystem.round(d.amount) + '</b>/日</span>' +
          '<span class="tr-deal-factory">' + TradeSystem.icon('factory', 14) + d.factories + '</span>' +
          '<span class="tr-deal-sea" title="' + (sea ? '海上輸送: 輸送船 ' + Math.ceil(d.amount / TradeSystem.UNIT) + ' 隻' : '陸路輸送: 輸送船不要') + '">' + (sea ? '🚢' + Math.ceil(d.amount / TradeSystem.UNIT) : '🛤️') + '</span>' +
          '<button class="tr-btn small" onclick="TradeSystem.adjust(\'' + d.seller + '\',\'' + d.resource + '\',-1)">−8</button>' +
          '<button class="tr-btn small" onclick="TradeSystem.adjust(\'' + d.seller + '\',\'' + d.resource + '\',1)">+8</button>' +
          '<button class="tr-btn small danger" onclick="TradeSystem.setDealAmount(\'' + d.seller + '\',\'' + d.resource + '\',0)">解約</button></div>';
      }).join('') : '<p class="sn-help">輸入契約はありません。下の国家別一覧から輸入量を設定してください。</p>') + '</div>' +
      '<div class="tr-section"><h4>📤 輸出契約 <small>' + myExports.length + ' 件 ／ 民需工場 +' + TradeSystem.round(myExports.reduce((n, d) => n + TradeSystem.num(d.factories), 0)) + ' 獲得</small></h4>' +
      '<div class="tr-pool" style="margin-bottom:4px">輸出余剰 (相手国が輸入可能): ' + (TradeSystem.ORDER.map(k => { const v = TradeSystem.surplus(me)[k]; return v > 0 ? TradeSystem.icon(k, 14) + ' ' + TradeSystem.RESOURCES[k].name + ' <b>' + v + '</b>' : ''; }).filter(Boolean).join(' ／ ') || 'なし — 生産を増やすか輸入を減らしてください') + '</div>' +
      (myExports.length ? myExports.map(d => '<div class="tr-deal">' + TradeSystem.icon(d.resource, 18) + '<span class="tr-deal-name">' + TradeSystem.esc(DiplomacyManager.nameOf(d.buyer)) + ' ← <b>' + TradeSystem.RESOURCES[d.resource].name + ' ' + TradeSystem.round(d.amount) + '</b>/日</span>' +
        '<span class="tr-deal-factory pos">' + TradeSystem.icon('factory', 14) + '+' + d.factories + '</span>' +
        '<button class="tr-btn small danger" onclick="TradeSystem.cancelExport(\'' + d.buyer + '\',\'' + d.resource + '\')">破棄</button></div>').join('')
        : '<p class="sn-help">各国は不足資源を自国の余剰から自動で輸入します (上の輸出方針で制御)。 輸出すると相手国の民需工場の使用権を獲得します。</p>') + '</div></div>';

    // ---- 国家別一覧 (全国家) ----
    const countries = (typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.countries : []).map(c => {
      const surplus = TradeSystem.surplus(c.id);
      const deals = TradeSystem.deals().filter(d => d.buyer === me && d.seller === c.id);
      const totalSurplus = TradeSystem.ORDER.reduce((n, k) => n + surplus[k], 0);
      return { ...c, surplus, deals, totalSurplus, war: !TradeSystem.canTrade(me, c.id) };
    }).filter(c => {
      // 資源フィルタ中は、その資源を売れる国 / 契約中の国のみ
      if (filter !== 'all' && (c.surplus[filter] >= TradeSystem.UNIT || c.deals.some(d => d.resource === filter))) return true;
      if (filter !== 'all') return false;
      if (!TradeSystem.showAll) return c.totalSurplus >= TradeSystem.UNIT || c.deals.length;
      return true;
    }).sort((a, b) => (b.deals.length ? 1 : 0) - (a.deals.length ? 1 : 0) ||
      (filter === 'all' ? Number(b.totalSurplus >= TradeSystem.UNIT) - Number(a.totalSurplus >= TradeSystem.UNIT) || b.totalSurplus - a.totalSurplus : b.surplus[filter] - a.surplus[filter]) ||
      a.id.localeCompare(b.id));

    const freeUnits = Math.max(0, Math.floor(TradeSystem.freeFactories(me)));
    html += '<div class="tr-section"><h4>🌍 国家別 貿易一覧 <small>全 ' + countries.length + ' か国 ／ 余剰プールと民需工場割当</small>' +
      '<span class="tr-filter"><button class="tr-btn small' + (TradeSystem.showAll ? ' on' : '') + '" onclick="TradeSystem.toggleAll()">' + (TradeSystem.showAll ? '全国家を表示中' : '余剰のある国のみ') + '</button></span></h4>' +
      '<div class="tr-market-wrap"><table class="tr-table tr-market"><thead><tr><th class="tr-country-col">国家</th>' +
      TradeSystem.ORDER.map(k => '<th class="' + (filter === k ? 'on' : '') + '">' + TradeSystem.icon(k, 18) + '<span>' + TradeSystem.RESOURCES[k].name + '</span></th>').join('') +
      '<th>民需工場</th></tr></thead><tbody>' +
      countries.map(c => {
        const myFactories = c.deals.reduce((n, d) => n + TradeSystem.num(d.factories), 0);
        return '<tr' + (c.war ? ' class="war"' : '') + '><td class="tr-country-col"><b>' + TradeSystem.esc(c.name) + '</b><small>' + c.id + (c.war ? ' ／ ⚔ 交戦中' : '') + (TradeSystem.overseas(me, c.id) ? ' ／ 🚢 海上' : ' ／ 🛤️ 陸路') + '</small></td>' +
          TradeSystem.ORDER.map(k => {
            const d = c.deals.find(x => x.resource === k);
            const cur = d ? TradeSystem.round(d.amount) : 0;
            const avail = c.surplus[k];
            const maxUnits = Math.floor((avail + cur) / TradeSystem.UNIT);
            const curUnits = Math.round(cur / TradeSystem.UNIT);
            if (!avail && !cur) return '<td class="tr-empty">' + TradeSystem.icon(k, 14) + '<span class="tr-none">0</span></td>';
            return '<td class="tr-cell' + (cur ? ' active' : '') + '">' +
              '<div class="tr-pool">余剰 <b>' + avail + '</b></div>' +
              '<input type="range" class="tr-range" min="0" max="' + maxUnits + '" step="1" value="' + curUnits + '" ' + (c.war ? 'disabled' : '') +
                ' aria-label="' + TradeSystem.esc(c.name + ' ' + TradeSystem.RESOURCES[k].name + ' 輸入量') + '"' +
                ' oninput="TradeSystem.previewSlider(this)" onchange="TradeSystem.commitSlider(\'' + c.id + '\',\'' + k + '\',this.value)">' +
              '<div class="tr-amount"><input type="number" class="tr-num" min="0" max="' + (avail + cur) + '" step="' + TradeSystem.UNIT + '" value="' + cur + '" ' + (c.war ? 'disabled' : '') +
                ' aria-label="' + TradeSystem.esc(c.name + ' ' + TradeSystem.RESOURCES[k].name + ' 購入量') + '"' +
                ' onchange="TradeSystem.setDealAmount(\'' + c.id + '\',\'' + k + '\',this.value)">' +
              '<span class="tr-fac" title="割り当てる民需工場">' + TradeSystem.icon('factory', 12) + '<b>' + curUnits + '</b></span></div></td>';
          }).join('') +
          '<td class="tr-factory-total">' + TradeSystem.icon('factory', 16) + '<b>' + (myFactories || '—') + '</b></td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<p class="sn-help">スライダー / 数値 = 資源の購入量 (<b>8 単位 = 民需工場 1</b>)。余剰プールを超える要求は自動で上限まで調整されます。 空き民需工場: <b>' + freeUnits + '</b> (輸入で使用中: ' + TradeSystem.round(TradeSystem.importFactories(me)) + ')。</p></div>';

    // ---- 自国の州別産出 ----
    const owned = Object.entries(TradeSystem.states()).filter(([, st]) => st.owner === me)
      .map(([sid, st]) => [sid, st, TradeSystem.stateResources(sid)])
      .filter(([, , r]) => Object.keys(r).length);
    html += '<div class="tr-section"><h4>⛏️ 自国領の資源産出 (州別) <small>' + owned.length + ' 州</small></h4><div class="tr-states">' +
      (owned.length ? owned.map(([sid, st, r]) => '<div class="tr-state" onclick="ConstructionManager.selectState(\'' + sid + '\')"><b>' + TradeSystem.esc(st.name || '州' + sid) + '</b>' +
        TradeSystem.ORDER.filter(k => r[k]).map(k => '<span>' + TradeSystem.icon(k, 18) + r[k] + '</span>').join('') + '</div>').join('')
        : '<p class="sn-help">資源を産出する州がありません。</p>') + '</div></div>';

    html += '</div>';
    el.innerHTML = html;
    TradeSystem._renderedDay = TradeSystem.day();
  }
}
if (typeof window !== 'undefined') window.TradeSystem = TradeSystem;
