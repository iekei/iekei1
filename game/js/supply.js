/**
 * supply.js — 補給網・インフラ・補給ハブ（Supply Network & Hubs）
 *
 *  ・州ごとのインフラ（0〜5）と補給ハブ（0〜3）を保持
 *  ・首都 → 鉄道網（PROVINCE_LINKS）→ 各補給ハブ の経路を探索し、
 *    経路のインフラ品質からスループットを算出
 *  ・補給ハブから周辺州へスループットを減衰分配し、州の補給容量を決定
 *  ・州内の師団の需要（物資消費量）が容量を上回ると補給不足ペナルティ
 *    （移動速度・戦闘力・組織力の低下）を師団へ適用
 *  ・建設キュー（インフラ / 補給ハブ）の予約・スロット管理
 *
 *  計算結果は state.supplyNetwork に保存され、マップの補給モードが参照する。
 */

import { PROVINCES, PROVINCE_LINKS, PROVINCE_BY_ID } from './map-data.js';
import { clamp, uid, store } from './util.js';

const STORE_KEY = 'hoi4.supplyNetwork.v1';
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

export const SUPPLY = {
  INFRA_MAX: 5,
  HUB_MAX: 3,
  BUILD_SLOTS: 3,
  // 補給ハブの分配距離（ホップ数）= BASE + level
  HUB_RANGE_BASE: 2,
  // 1 ホップごとのスループット減衰
  DECAY: 0.55,
  // インフラ 1 レベルあたりの現地調達（ハブなしでも僅かに供給）
  LOCAL_PER_INFRA: 0.8,
  // 首都は常に補給ハブとして扱う（最低レベル）
  CAPITAL_HUB_LEVEL: 3,
};

/** 補給状態（マップの色分けに使用） */
export const SUPPLY_STATUS_COLOR = {
  ok: '#7ec850',        // 緑: 正常
  low: '#e0b93e',       // 黄: 不足
  critical: '#d05038',  // 赤: 枯渇
  none: '#55606a',      // 灰: 補給網外（需要なし）
};

export const SUPPLY_STATUS_LABEL = {
  ok: '正常',
  low: '不足',
  critical: '枯渇',
  none: '補給網外',
};

/** 建設定義（工期はレベルに応じて延びる） */
export const SUPPLY_BUILDINGS = {
  infrastructure: {
    id: 'infrastructure',
    name: 'インフラ',
    maxLevel: SUPPLY.INFRA_MAX,
    icon: 'game/assets/icons/Upgrade_Railways.png',
    color: '#8fa85b',
    daysFor: (level) => 70 + 14 * level,
  },
  supply_hub: {
    id: 'supply_hub',
    name: '補給ハブ',
    maxLevel: SUPPLY.HUB_MAX,
    icon: 'game/assets/icons/Supply_hub.svg',
    color: '#e6c268',
    daysFor: (level) => 120 + 45 * level,
  },
};

/**
 * 補給比率（0..1）から師団ペナルティを算出。
 * ratio=1 で無補正、ratio=0 で 速度40% / 戦闘力30% / 組織率40% まで低下。
 */
export function supplyPenalties(ratio) {
  const r = clamp(Number(ratio) || 0, 0, 1);
  return {
    ratio: r,
    speed: r2(0.40 + 0.60 * r),
    combat: r2(0.30 + 0.70 * r),
    org: r2(0.40 + 0.60 * r),
    penaltyPct: Math.round((1 - r) * 100),
  };
}

/** 師団 1 個あたりの補給需要（物資消費量） */
export function divisionSupplyDemand(div, state) {
  if (!div) return 0;
  const direct = Number(div.stats?.supplyUse);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (div.templateId) {
    const tpl = (state?.divisionTemplates || []).find((t) => t.id === div.templateId);
    const v = Number(tpl?.stats?.supplyUse);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const byType = {
    infantry: 1.5, armor: 2.8, artillery: 2.2,
    paratrooper: 1.7, marine: 1.9,
  };
  return byType[div.type] || 1.6;
}

/** 幅優先探索（maxDepth で打ち切り） */
function bfs(adj, start, maxDepth = Infinity) {
  const dist = new Map();
  const prev = new Map();
  if (!start || !adj.has(start)) return { dist, prev };
  dist.set(start, 0);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const d = dist.get(cur);
    if (d >= maxDepth) continue;
    for (const next of adj.get(cur) || []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      prev.set(next, cur);
      queue.push(next);
    }
  }
  return { dist, prev };
}

/** 探索木から経路を復元 */
function pathTo(prev, start, goal) {
  if (start === goal) return [start];
  const path = [];
  let cur = goal;
  let guard = 0;
  while (cur !== undefined && guard++ < 256) {
    path.push(cur);
    if (cur === start) return path.reverse();
    cur = prev.get(cur);
  }
  return [];
}

/* ============================================================
 * 初期データ
 * ========================================================== */

function defaultsForProvince(p) {
  const infra = p.capital ? 5 : clamp(1 + Math.floor((p.vp || 0) / 5), 1, 4);
  const hub = p.capital ? SUPPLY.CAPITAL_HUB_LEVEL : ((p.vp || 0) >= 8 ? 1 : 0);
  return { infra, hub };
}

function loadSaved() {
  const raw = store.get(STORE_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  return {
    infra: raw.infra && typeof raw.infra === 'object' ? raw.infra : {},
    hubs: raw.hubs && typeof raw.hubs === 'object' ? raw.hubs : {},
  };
}

function saveLevels(state) {
  store.set(STORE_KEY, {
    infra: state.infrastructure || {},
    hubs: state.supplyHubs || {},
  });
}

/* ============================================================
 * SupplyManager
 * ========================================================== */

export class SupplyManager {
  constructor(state) {
    this.state = state;
    this.tag = state.playerTag || 'GER';
    this._lastSig = '';
    this._bound = false;
    this._ensureData();
    this.recompute();
    this.applyPenalties(0);
    this._bind();
  }

  /* ---------- データ初期化 / 永続化 ---------- */

  _ensureData() {
    const s = this.state;
    const saved = loadSaved();
    if (!s.infrastructure || typeof s.infrastructure !== 'object') s.infrastructure = {};
    if (!s.supplyHubs || typeof s.supplyHubs !== 'object') s.supplyHubs = {};
    for (const p of PROVINCES) {
      const def = defaultsForProvince(p);
      if (!Number.isFinite(s.infrastructure[p.id])) {
        const savedLevel = saved?.infra?.[p.id];
        s.infrastructure[p.id] = Number.isFinite(savedLevel)
          ? clamp(Math.round(savedLevel), 0, SUPPLY.INFRA_MAX)
          : def.infra;
      }
      if (!Number.isFinite(s.supplyHubs[p.id])) {
        const savedLevel = saved?.hubs?.[p.id];
        s.supplyHubs[p.id] = Number.isFinite(savedLevel)
          ? clamp(Math.round(savedLevel), 0, SUPPLY.HUB_MAX)
          : def.hub;
      }
    }
    if (!Array.isArray(s.constructionQueue)) s.constructionQueue = [];
  }

  _bind() {
    if (this._bound) return;
    const bus = this.state.bus;
    if (!bus?.on) return;
    this._bound = true;
    bus.on('player-changed', (tag) => {
      this.tag = tag || this.state.playerTag;
      this.refresh();
    });
    bus.on('province-captured', () => this.refresh());
    bus.on('division-trained', () => this.refresh());
    bus.on('division-added', () => this.refresh());
  }

  /* ---------- レベル参照 ---------- */

  infra(provinceId) {
    return clamp(Math.round(this.state.infrastructure?.[provinceId] ?? 0), 0, SUPPLY.INFRA_MAX);
  }

  hubLevel(provinceId) {
    return clamp(Math.round(this.state.supplyHubs?.[provinceId] ?? 0), 0, SUPPLY.HUB_MAX);
  }

  hasHub(provinceId) {
    return this.hubLevel(provinceId) > 0;
  }

  setInfra(provinceId, level) {
    this.state.infrastructure[provinceId] = clamp(Math.round(level), 0, SUPPLY.INFRA_MAX);
    saveLevels(this.state);
    this.refresh();
  }

  setHub(provinceId, level) {
    this.state.supplyHubs[provinceId] = clamp(Math.round(level), 0, SUPPLY.HUB_MAX);
    saveLevels(this.state);
    this.refresh();
  }

  /** 州の建設情報（UI 用） */
  provinceInfo(provinceId) {
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return null;
    const net = this.network();
    const status = net?.provinces?.[provinceId] || null;
    return {
      province: p,
      infra: this.infra(provinceId),
      hub: this.hubLevel(provinceId),
      status,
      slotsUsed: this.usedSlots(provinceId),
      slotsMax: SUPPLY.BUILD_SLOTS,
      queue: this.queueFor(provinceId),
    };
  }

  /* ---------- 建設スロット / 予約 ---------- */

  queueFor(provinceId) {
    return (this.state.constructionQueue || []).filter((q) => q.provinceId === provinceId);
  }

  usedSlots(provinceId) {
    return this.queueFor(provinceId).length;
  }

  /** 建設可否判定 */
  canBuild(provinceId, type) {
    const p = PROVINCE_BY_ID[provinceId];
    const def = SUPPLY_BUILDINGS[type];
    if (!p) return { ok: false, reason: '州が見つかりません' };
    if (!def) return { ok: false, reason: '不明な建設種別です' };
    if (p.tag !== this.state.playerTag) return { ok: false, reason: '自国の州ではありません' };
    const level = type === 'infrastructure' ? this.infra(provinceId) : this.hubLevel(provinceId);
    if (level >= def.maxLevel) return { ok: false, reason: `${def.name}は最大レベルです`, level, max: def.maxLevel };
    if (this.usedSlots(provinceId) >= SUPPLY.BUILD_SLOTS) {
      return { ok: false, reason: `建設スロットが満杯です（${SUPPLY.BUILD_SLOTS}）`, level, max: def.maxLevel };
    }
    if (this.queueFor(provinceId).some((q) => q.type === type)) {
      return { ok: false, reason: `${def.name}は既に建設予約済みです`, level, max: def.maxLevel };
    }
    const civAvail = this.state._economyMgr?.availableCivilianFactories?.();
    if (Number.isFinite(civAvail) && civAvail <= 0) {
      return { ok: false, reason: '利用可能な民需工場がありません', level, max: def.maxLevel };
    }
    return {
      ok: true,
      level,
      targetLevel: level + 1,
      max: def.maxLevel,
      days: def.daysFor(level),
      slotsUsed: this.usedSlots(provinceId),
      slotsMax: SUPPLY.BUILD_SLOTS,
    };
  }

  /** 建設予約（state.constructionQueue に積む。進捗は EconomyManager.tick） */
  enqueue(provinceId, type) {
    const chk = this.canBuild(provinceId, type);
    if (!chk.ok) return chk;
    const p = PROVINCE_BY_ID[provinceId];
    const def = SUPPLY_BUILDINGS[type];
    const order = {
      id: uid('build'),
      type,
      provinceId,
      provinceName: p.name,
      targetLevel: chk.targetLevel,
      fromLevel: chk.level,
      progress: 0,
      days: chk.days,
      label: `${p.name} ${def.name} Lv${chk.targetLevel}`,
      def: { name: `${def.name}（${p.name}）`, days: chk.days },
      usesCiv: true,
    };
    this.state.constructionQueue.push(order);
    this.state.bus?.emit('construction-queued', order);
    return { ok: true, order, targetLevel: chk.targetLevel, days: chk.days };
  }

  cancel(orderId) {
    const q = this.state.constructionQueue || [];
    const idx = q.findIndex((o) => o.id === orderId);
    if (idx < 0) return { ok: false };
    const [order] = q.splice(idx, 1);
    this.state.bus?.emit('construction-cancelled', order);
    return { ok: true, order };
  }

  /** 建設完了（EconomyManager._completeConstruction から呼ばれる） */
  completeConstruction(order) {
    if (!order?.provinceId) return null;
    let level = null;
    if (order.type === 'infrastructure') {
      level = clamp(order.targetLevel ?? this.infra(order.provinceId) + 1, 0, SUPPLY.INFRA_MAX);
      this.state.infrastructure[order.provinceId] = level;
    } else if (order.type === 'supply_hub') {
      level = clamp(order.targetLevel ?? this.hubLevel(order.provinceId) + 1, 0, SUPPLY.HUB_MAX);
      this.state.supplyHubs[order.provinceId] = level;
    }
    if (level == null) return null;
    saveLevels(this.state);
    this.refresh();
    this.state.bus?.emit('supply-buildings-changed', {
      provinceId: order.provinceId, type: order.type, level,
    });
    return level;
  }

  /* ---------- 補給計算 ---------- */

  /** 自国所有州の隣接グラフ */
  _graph(tag) {
    const owned = new Set(PROVINCES.filter((p) => p.tag === tag).map((p) => p.id));
    const adj = new Map();
    for (const id of owned) adj.set(id, []);
    for (const [a, b] of PROVINCE_LINKS) {
      if (owned.has(a) && owned.has(b)) {
        adj.get(a).push(b);
        adj.get(b).push(a);
      }
    }
    return { owned, adj };
  }

  _capitalOf(tag) {
    return PROVINCES.find((p) => p.tag === tag && p.capital)
      || PROVINCES.filter((p) => p.tag === tag).sort((a, b) => (b.vp || 0) - (a.vp || 0))[0]
      || null;
  }

  /** 自軍師団を州ごとに集計 */
  _divisionsByProvince(tag) {
    const map = new Map();
    for (const div of this.state.divisions || []) {
      if (div.tag && div.tag !== tag) continue;
      const id = div.provinceId;
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(div);
    }
    return map;
  }

  /** 補給網を再計算して state.supplyNetwork を更新 */
  recompute() {
    this.tag = this.state.playerTag || this.tag || 'GER';
    const net = this._compute(this.tag);
    this._network = net;
    this.state.supplyNetwork = net;
    return net;
  }

  _compute(tag) {
    const { owned, adj } = this._graph(tag);
    const capital = this._capitalOf(tag);
    const provinces = {};
    const divisionsByProvince = this._divisionsByProvince(tag);
    const empty = {
      tag, capitalId: capital?.id || null, provinces: {}, hubs: [], routes: [], distribution: [],
      summary: { ok: 0, low: 0, critical: 0, none: 0, totalCapacity: 0, totalDemand: 0, unsuppliedDivisions: 0 },
      updatedAt: this.state.tickCount || 0,
    };
    if (!capital || !owned.size) return empty;

    // --- 1. 現地調達（インフラの副次効果）
    const local = new Map();
    for (const id of owned) local.set(id, this.infra(id) * SUPPLY.LOCAL_PER_INFRA);
    // 各州は「最も近い/強いハブ 1 つ」から供給を受ける（ハブの重複加算を防ぐ）
    const bestHubAmount = new Map();

    // --- 2. 首都からの鉄道網（BFS）
    const capBfs = bfs(adj, capital.id);

    // --- 3. 補給ハブ（首都もハブとして扱う）
    const hubIds = [...owned].filter((id) => this.hubLevel(id) > 0);
    if (!hubIds.includes(capital.id)) hubIds.unshift(capital.id);
    // 首都を先頭に、レベル降順で安定ソート
    hubIds.sort((a, b) => (a === capital.id ? -1 : b === capital.id ? 1 : this.hubLevel(b) - this.hubLevel(a)));

    const hubs = [];
    const routes = [];
    const suppliedBy = new Map(); // provinceId -> {hubId, amount, dist}
    for (const hubId of hubIds) {
      const isCapital = hubId === capital.id;
      const level = isCapital ? Math.max(SUPPLY.CAPITAL_HUB_LEVEL, this.hubLevel(hubId)) : this.hubLevel(hubId);
      const reachable = capBfs.dist.has(hubId);
      const path = isCapital
        ? [capital.id]
        : (reachable ? pathTo(capBfs.prev, capital.id, hubId) : []);

      // 経路の最低インフラ = 鉄道品質（ボトルネック）
      const pathInfra = path.length ? Math.min(...path.map((id) => this.infra(id))) : 0;
      const hubInfra = this.infra(hubId);
      const base = 4 + level * 5;
      const infraFactor = 0.55 + 0.09 * hubInfra;
      const routeFactor = 0.5 + 0.1 * pathInfra;
      const capitalBonus = isCapital ? 1.1 : 1;
      const throughput = reachable ? r1(base * infraFactor * routeFactor * capitalBonus) : 0;

      const range = SUPPLY.HUB_RANGE_BASE + level;
      const spread = reachable ? bfs(adj, hubId, range) : { dist: new Map(), prev: new Map() };
      let servedCount = 0;
      for (const [id, dist] of spread.dist) {
        const amount = throughput * Math.pow(SUPPLY.DECAY, dist);
        if (amount <= 0) continue;
        servedCount += 1;
        if (amount > (bestHubAmount.get(id) || 0)) {
          bestHubAmount.set(id, amount);
          suppliedBy.set(id, { hubId, amount, dist });
        }
      }

      const hub = {
        provinceId: hubId,
        name: PROVINCE_BY_ID[hubId]?.name || hubId,
        level,
        isCapital,
        reachable,
        disconnected: !reachable,
        path,
        pathInfra,
        hubInfra,
        throughput,
        range,
        servedCount,
        status: 'none',
      };
      hubs.push(hub);
      if (!isCapital) {
        routes.push({
          from: capital.id,
          to: hubId,
          path,
          level,
          throughput,
          disconnected: !reachable,
          status: 'none',
        });
      }
    }

    // --- 4. 需要 / 容量 / 状態
    const capacity = new Map();
    for (const id of owned) capacity.set(id, (local.get(id) || 0) + (bestHubAmount.get(id) || 0));
    let totalCapacity = 0;
    let totalDemand = 0;
    let unsuppliedDivisions = 0;
    const counts = { ok: 0, low: 0, critical: 0, none: 0 };
    for (const id of owned) {
      const divisions = divisionsByProvince.get(id) || [];
      const demand = r1(divisions.reduce((sum, d) => sum + divisionSupplyDemand(d, this.state), 0));
      const cap = r1(capacity.get(id) || 0);
      let ratio;
      if (demand > 0) ratio = cap / demand;
      else ratio = cap > 0 ? 1 : 0;
      ratio = Math.max(0, ratio);
      let status;
      if (demand <= 0) status = cap > 0 ? 'ok' : 'none';
      else if (ratio >= 1) status = 'ok';
      else if (ratio >= 0.5) status = 'low';
      else status = 'critical';
      counts[status] += 1;
      totalCapacity += cap;
      totalDemand += demand;
      if (demand > 0 && ratio < 1) unsuppliedDivisions += divisions.length;

      const source = suppliedBy.get(id) || null;
      provinces[id] = {
        provinceId: id,
        name: PROVINCE_BY_ID[id]?.name || id,
        tag,
        infra: this.infra(id),
        hubLevel: this.hubLevel(id),
        capacity: cap,
        demand,
        ratio: demand > 0 ? r2(Math.min(ratio, 9.99)) : (cap > 0 ? 1 : 0),
        status,
        divisions: divisions.length,
        hubSource: source?.hubId || null,
        distanceFromHub: source?.dist ?? null,
        penalties: supplyPenalties(demand > 0 ? Math.min(1, ratio) : 1),
      };
    }

    // --- 5. ハブ / 路線の状態（供給先の最悪値）
    for (const hub of hubs) {
      const targets = [...owned].filter((id) => suppliedBy.get(id)?.hubId === hub.provinceId);
      const statuses = targets.map((id) => provinces[id]?.status).filter(Boolean);
      let status;
      if (hub.disconnected || hub.throughput <= 0) status = 'critical';
      else if (statuses.includes('critical')) status = 'critical';
      else if (statuses.includes('low')) status = 'low';
      else status = 'ok';
      // ハブ州自身が枯渇している場合は赤
      if (hub.reachable && provinces[hub.provinceId]?.status === 'critical') status = 'critical';
      hub.status = status;
      hub.servedCount = targets.length;
    }
    for (const route of routes) {
      const hub = hubs.find((h) => h.provinceId === route.to);
      route.status = hub?.status || 'critical';
    }

    // --- 6. 分配線（ハブ → 供給州）
    const distribution = [];
    for (const [provinceId, src] of suppliedBy) {
      if (provinceId === src.hubId) continue;
      const a = PROVINCE_BY_ID[src.hubId];
      const b = PROVINCE_BY_ID[provinceId];
      if (!a || !b) continue;
      distribution.push({
        from: src.hubId,
        to: provinceId,
        status: provinces[provinceId]?.status || 'none',
        amount: r1(src.amount),
        dist: src.dist,
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      });
    }

    const net = {
      tag,
      capitalId: capital.id,
      provinces,
      hubs,
      routes,
      distribution,
      summary: {
        ...counts,
        totalCapacity: r1(totalCapacity),
        totalDemand: r1(totalDemand),
        unsuppliedDivisions,
        hubs: hubs.length,
        provinces: owned.size,
      },
      updatedAt: this.state.tickCount || 0,
    };
    return net;
  }

  network() { return this._network || this.recompute(); }

  /** 州の補給状態 */
  statusFor(provinceId) {
    return this.network()?.provinces?.[provinceId] || null;
  }

  /** 自国の補給サマリー */
  summary() {
    return this.network()?.summary || { ok: 0, low: 0, critical: 0, none: 0, totalCapacity: 0, totalDemand: 0, unsuppliedDivisions: 0, hubs: 0, provinces: 0 };
  }

  /* ---------- 師団へのペナルティ適用 ---------- */

  applyPenalties(hours = 0) {
    const net = this._network || this.recompute();
    const tag = this.tag;
    for (const div of this.state.divisions || []) {
      if (div.tag && div.tag !== tag) continue;
      const ps = net.provinces?.[div.provinceId];
      const ratio = ps && ps.demand > 0 ? Math.min(1, ps.ratio) : (ps ? 1 : 0);
      const pen = supplyPenalties(ratio);
      const maxOrg = Number(div.maxOrg) || 50;
      div.supplyRatio = r2(ratio);
      // 既存のマップ表示（充足度バー）が 0 を falsy で 100% と扱わないよう下限を置く
      div.supply = Math.max(0.05, r2(ratio));
      div.supplyStatus = ps?.status || 'critical';
      div.supplyCapacity = ps?.capacity ?? 0;
      div.supplyDemand = ps?.demand ?? 0;
      div.supplyPenalty = { speed: pen.speed, combat: pen.combat, org: pen.org, penaltyPct: pen.penaltyPct };
      div.effectiveMaxOrg = Math.max(1, Math.round(maxOrg * pen.org));
      if (ratio < 1) {
        // 組織力の上限を切り下げ（戦闘力・組織率の大幅低下）
        div.org = Math.min(Number(div.org) || 0, div.effectiveMaxOrg);
      } else if (hours > 0) {
        // 補給が回復したら組織力を徐々に回復
        div.org = Math.min(maxOrg, (Number(div.org) || 0) + 0.5 * hours);
      }
    }
  }

  /** 1 時間 Tick: 再計算 + ペナルティ + 状態変化の通知 */
  tick(hours = 1) {
    this.recompute();
    this.applyPenalties(hours);
    const net = this._network;
    const sig = [
      net.tag,
      net.capitalId,
      ...Object.entries(net.provinces).map(([id, p]) => `${id}:${p.status}:${Math.round(p.capacity)}:${Math.round(p.demand * 10)}`),
      ...(this.state.divisions || []).filter((d) => !d.tag || d.tag === net.tag)
        .map((d) => `${d.id}:${d.provinceId}:${d.supplyStatus}:${d.effectiveMaxOrg}:${Math.round(d.org || 0)}`),
    ].join('|');
    if (sig !== this._lastSig) {
      this._lastSig = sig;
      this.state.bus?.emit('supply-changed', net);
    }
    return net;
  }

  /** 強制再計算 + 即時反映（建設・占領・国家変更時） */
  refresh() {
    this.recompute();
    this.applyPenalties(0);
    this.state.bus?.emit('supply-changed', this._network);
    return this._network;
  }
}

/* ============================================================
 * インストール
 * ========================================================== */

/** GameState へ補給システムを 1 度だけ接続する */
export function installSupplySystem(state) {
  if (!state) return null;
  if (state._supplyMgr) return state._supplyMgr;
  const mgr = new SupplyManager(state);
  state._supplyMgr = mgr;
  return mgr;
}

/** デバッグ/テスト用: 現在のインフラ・ハブを JSON で返す */
export function supplyLevelsJSON(state) {
  return {
    infrastructure: { ...(state?.infrastructure || {}) },
    hubs: { ...(state?.supplyHubs || {}) },
  };
}
