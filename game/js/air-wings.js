/**
 * air-wings.js — 航空隊・航空基地・空域任務システム
 *
 *  ・航空隊（Air Wing）は「機種 / 機体数 / 練度 / 稼働率」を持ち、任意の航空基地へ配備・移動できる
 *  ・航空基地（Air Base）は州ごとに Lv0〜5。レベル×100 機まで収容でき、建設キューで拡張する
 *  ・戦略空域（AIR_REGIONS）ごとに「自軍 / 敵軍」の制空権割合を計算する
 *  ・任務：制空（Air Superiority）/ 近接航空支援（CAS）/ 戦略爆撃（Strategic Bombing）/ 訓練
 *      - CAS は戦闘中の州へ「直接ダメージ＋攻撃力ボーナス」を与える（battle-plan.js から参照）
 *      - 戦略爆撃は敵州のインフラ・航空基地・産業を破壊する
 *  ・1 時間 Tick で練度・稼働率の推移、消耗（損失）、爆撃を処理する
 *
 *  計算結果は state.airForces / state.airbases / state.airRegions に保持し、
 *  マップ（air-naval.js の空域オーバーレイ）と空軍画面（ui/air-ui.js）が参照する。
 */

import { PROVINCES, PROVINCE_BY_ID } from './map-data.js';
import { AIR_REGIONS } from './air-naval.js';
import { kmToPixels } from './geo.js';
import { clamp, uid, store } from './util.js';

const STORE_KEY = 'hoi4.airWings.v1';
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

/* ============================================================
 * 定義
 * ========================================================== */

/** 航空基地 */
export const AIRBASE = {
  MAX_LEVEL: 5,
  CAPACITY_PER_LEVEL: 100,
  /** 航空基地 Lv n → n+1 の基準工期（日） */
  daysFor: (level) => 45 + 20 * level,
};

/** 機種 */
export const AIR_WING_TYPES = {
  fighter: {
    id: 'fighter', name: '戦闘機', short: 'FIGHTER', icon: '✈', color: '#5e9ec7',
    stock: 'fighter_equipment_1',
    airAttack: 16, groundAttack: 2, strategic: 2,
    rangeKm: 1500, maintenance: 0.00042,
    desc: '制空任務の主力。敵戦闘機を撃墜し制空権を確保する。',
  },
  cas: {
    id: 'cas', name: '近接航空支援機', short: 'CAS', icon: '💣', color: '#d05038',
    stock: 'tac_bomber_equipment_1',
    airAttack: 6, groundAttack: 20, strategic: 3,
    rangeKm: 1000, maintenance: 0.00060,
    desc: '戦闘中の州を直接攻撃。地上戦の攻撃力と与ダメージを高める。',
  },
  strategic_bomber: {
    id: 'strategic_bomber', name: '戦略爆撃機', short: 'STRAT', icon: '💥', color: '#a06ec8',
    stock: 'strat_bomber_equipment_1',
    airAttack: 4, groundAttack: 5, strategic: 26,
    rangeKm: 2600, maintenance: 0.00072,
    desc: '敵のインフラ・航空基地・産業を破壊する。制空権がないと効果が落ちる。',
  },
};

export const AIR_WING_TYPE_IDS = Object.keys(AIR_WING_TYPES);

/** 任務 */
export const AIR_MISSIONS = {
  air_superiority: {
    id: 'air_superiority', name: '制空', icon: '🛡', color: '#5e9ec7',
    airWeight: 1.0, baseOnly: false,
    desc: '空域の制空権を争う。制空権が高いほど他任務の効率も上がる。',
  },
  cas: {
    id: 'cas', name: '近接航空支援', icon: '💣', color: '#d05038',
    airWeight: 0.35, baseOnly: false,
    desc: '戦闘中の地上部隊を直接支援。攻撃力ボーナスと直接ダメージを与える。',
  },
  strategic_bombing: {
    id: 'strategic_bombing', name: '戦略爆撃', icon: '💥', color: '#a06ec8',
    airWeight: 0.20, baseOnly: false,
    desc: '敵州のインフラ・航空基地・産業を破壊する。',
  },
  training: {
    id: 'training', name: '訓練', icon: '🎯', color: '#7ec850',
    airWeight: 0.40, baseOnly: true,
    desc: '練度を継続的に高める。戦闘・爆撃には参加しない（基地待機）。',
  },
};

export const AIR_MISSION_IDS = Object.keys(AIR_MISSIONS);

/** 空域ごとの敵航空戦力（基準値） */
export const ENEMY_AIR_POWER = {
  eur_west: 300, eur_east: 420, med: 190, east_asia: 330, n_america: 140,
};

export const AIR_STATUS_COLOR = {
  green: '#7ec850', yellow: '#e0b93e', red: '#d05038',
};
export const AIR_STATUS_LABEL = {
  green: '優勢', yellow: '均衡', red: '劣勢',
};

/* ============================================================
 * ヘルパー
 * ========================================================== */

export function wingStrength(wing) {
  const count = Math.max(0, Number(wing?.count) || 0);
  const training = clamp(Number(wing?.training) || 0, 0, 100) / 100;
  const readiness = clamp(Number(wing?.readiness) || 0, 0, 100) / 100;
  return count * (0.45 + 0.55 * training) * (0.45 + 0.55 * readiness);
}

export function missionWeight(missionId) {
  return AIR_MISSIONS[missionId]?.airWeight ?? 0;
}

/** 機種×任務の制空権寄与 */
export function wingAirPower(wing) {
  const type = AIR_WING_TYPES[wing?.type];
  if (!type) return 0;
  return wingStrength(wing) * type.airAttack * missionWeight(wing.mission);
}

/** 空域の状態色 */
export function supremacyStatus(ownPct) {
  if (ownPct >= 65) return 'green';
  if (ownPct >= 45) return 'yellow';
  return 'red';
}

/* ============================================================
 * マネージャ
 * ========================================================== */

export class AirWingManager {
  constructor(state, opts = {}) {
    this.state = state;
    this.regions = AIR_REGIONS;
    this._cache = new Map();
    this._loaded = false;
    this.seed = opts.seed !== false;
    this.ensureState();
    this.load();
    if (!this._loaded && this.seed) this.seedForces();
    this.refresh();
  }

  /* ---------- 状態の初期化 / 保存 ---------- */

  ensureState() {
    const s = this.state;
    if (!Array.isArray(s.airForces)) s.airForces = [];
    if (!s.airbases || typeof s.airbases !== 'object') s.airbases = {};
    if (!Array.isArray(s.airBombings)) s.airBombings = [];
    // 州の工場数（戦略爆撃の目標）
    if (!s.industry || typeof s.industry !== 'object') s.industry = {};
    for (const p of PROVINCES) {
      if (!Number.isFinite(s.airbases[p.id])) s.airbases[p.id] = clamp(p.airbase || 0, 0, AIRBASE.MAX_LEVEL);
      if (!Number.isFinite(s.industry[p.id])) s.industry[p.id] = Math.max(0, Math.round((p.vp || 0) / 4));
    }
  }

  /** プレイヤー国の初期航空隊（セーブが無いときのみ） */
  seedForces() {
    const s = this.state;
    const owned = PROVINCES.filter((p) => p.tag === s.playerTag);
    const capital = owned.find((p) => p.capital) || owned[0];
    if (!capital) return;
    if (!this.wings().length) {
      this.createWing({ type: 'fighter', count: 120, baseProvince: capital.id, name: '第1戦闘航空団' });
      this.createWing({ type: 'cas', count: 60, baseProvince: capital.id, name: '第1地上攻撃航空団' });
    }
    // 主要基地の整備（プレイヤー首都は最低 Lv3）
    if ((s.airbases[capital.id] || 0) < 3) s.airbases[capital.id] = 3;
    this.state.bus?.emit('air-changed');
  }

  save() {
    const wings = this.wings().map((w) => ({
      id: w.id, tag: w.tag, name: w.name, type: w.type, count: w.count,
      baseProvince: w.baseProvince, region: w.region, mission: w.mission,
      training: Math.round((w.training || 0) * 10) / 10,
      readiness: Math.round((w.readiness || 0) * 10) / 10,
    }));
    store.set(STORE_KEY, { bases: { ...this.state.airbases }, wings });
  }

  load() {
    const data = store.get(STORE_KEY, null);
    if (!data) return false;
    if (data.bases && typeof data.bases === 'object') {
      for (const [pid, lv] of Object.entries(data.bases)) {
        if (PROVINCE_BY_ID[pid]) this.state.airbases[pid] = clamp(Math.round(lv), 0, AIRBASE.MAX_LEVEL);
      }
    }
    if (Array.isArray(data.wings)) {
      this.state.airForces = this.state.airForces.filter((w) => !AIR_WING_TYPES[w.type]);
      for (const w of data.wings) {
        if (!AIR_WING_TYPES[w.type]) continue;
        this.state.airForces.push({
          ...w,
          count: Math.max(0, Math.round(Number(w.count) || 0)),
          training: clamp(Number(w.training) || 40, 0, 100),
          readiness: clamp(Number(w.readiness) || 100, 0, 100),
        });
      }
    }
    this._loaded = true;
    return true;
  }

  /** 州の工場数（戦略爆撃で破壊される） */
  factoryCount(provinceId) {
    const v = this.state.industry?.[provinceId];
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  /* ---------- 航空基地 ---------- */

  airbaseLevel(provinceId) {
    const lv = this.state.airbases?.[provinceId];
    if (Number.isFinite(lv)) return clamp(Math.round(lv), 0, AIRBASE.MAX_LEVEL);
    return clamp(Math.round(PROVINCE_BY_ID[provinceId]?.airbase || 0), 0, AIRBASE.MAX_LEVEL);
  }

  baseCapacity(provinceId) {
    return this.airbaseLevel(provinceId) * AIRBASE.CAPACITY_PER_LEVEL;
  }

  usedCapacity(provinceId) {
    return this.wings()
      .filter((w) => w.baseProvince === provinceId)
      .reduce((sum, w) => sum + (Number(w.count) || 0), 0);
  }

  baseFree(provinceId) {
    return Math.max(0, this.baseCapacity(provinceId) - this.usedCapacity(provinceId));
  }

  setAirbaseLevel(provinceId, level) {
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return null;
    const lv = clamp(Math.round(level), 0, AIRBASE.MAX_LEVEL);
    this.state.airbases[provinceId] = lv;
    this.save();
    this.refresh();
    this.state.bus?.emit('airbase-changed', { provinceId, level: lv });
    return lv;
  }

  /** 航空基地の建設可否 */
  canBuildBase(provinceId) {
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return { ok: false, reason: '州が見つかりません' };
    if (p.tag !== this.state.playerTag) return { ok: false, reason: '自国の州ではありません' };
    const level = this.airbaseLevel(provinceId);
    if (level >= AIRBASE.MAX_LEVEL) return { ok: false, reason: `航空基地は最大レベルです（Lv${AIRBASE.MAX_LEVEL}）`, level };
    const queued = (this.state.constructionQueue || []).find((q) => q.type === 'air_base' && q.provinceId === provinceId);
    if (queued) return { ok: false, reason: '航空基地は既に建設予約済みです', level };
    const civAvail = this.state._economyMgr?.availableCivilianFactories?.();
    if (Number.isFinite(civAvail) && civAvail <= 0) return { ok: false, reason: '利用可能な民需工場がありません', level };
    return { ok: true, level, targetLevel: level + 1, days: AIRBASE.daysFor(level) };
  }

  /** 航空基地の建設予約（進捗は EconomyManager.tick） */
  enqueueBase(provinceId) {
    const chk = this.canBuildBase(provinceId);
    if (!chk.ok) return chk;
    const p = PROVINCE_BY_ID[provinceId];
    if (!Array.isArray(this.state.constructionQueue)) this.state.constructionQueue = [];
    const order = {
      id: uid('build'),
      type: 'air_base',
      provinceId,
      provinceName: p.name,
      targetLevel: chk.targetLevel,
      fromLevel: chk.level,
      progress: 0,
      days: chk.days,
      label: `${p.name} 航空基地 Lv${chk.targetLevel}`,
      def: { name: `航空基地（${p.name}）`, days: chk.days },
      usesCiv: true,
    };
    this.state.constructionQueue.push(order);
    this.state.bus?.emit('construction-queued', order);
    return { ok: true, order, days: chk.days, targetLevel: chk.targetLevel };
  }

  /** 建設完了（main.js の construction-completed から呼ばれる） */
  completeConstruction(order) {
    if (!order || order.type !== 'air_base' || !order.provinceId) return null;
    const level = this.setAirbaseLevel(order.provinceId, (order.targetLevel ?? this.airbaseLevel(order.provinceId) + 1));
    this.state.bus?.emit('air-buildings-changed', { provinceId: order.provinceId, level });
    return level;
  }

  /* ---------- 航空隊 ---------- */

  typeInfo(type) { return AIR_WING_TYPES[type] || null; }

  wings(tag = this.state.playerTag) {
    return (this.state.airForces || []).filter((w) => AIR_WING_TYPES[w.type] && (!w.tag || w.tag === tag));
  }

  wingById(id) {
    return (this.state.airForces || []).find((w) => w.id === id) || null;
  }

  /** 機体の備蓄数 */
  availableAircraft(type) {
    const info = AIR_WING_TYPES[type];
    if (!info) return 0;
    return Math.max(0, Math.floor(this.state.stockpile?.[info.stock] || 0));
  }

  /** 新規航空隊の編成 */
  createWing({ type, count = 100, baseProvince = null, name = null, region = null, mission = null } = {}) {
    const info = AIR_WING_TYPES[type];
    if (!info) return { ok: false, reason: '不明な機種です' };
    const p = PROVINCE_BY_ID[baseProvince];
    if (!p) return { ok: false, reason: '基地が指定されていません' };
    if (p.tag !== this.state.playerTag) return { ok: false, reason: '自国の基地ではありません' };
    const level = this.airbaseLevel(baseProvince);
    if (level < 1) return { ok: false, reason: `${p.name} に航空基地がありません（Lv1 以上が必要）` };
    const free = this.baseFree(baseProvince);
    if (free <= 0) return { ok: false, reason: `${p.name} の基地容量が満杯です（${this.usedCapacity(baseProvince)} / ${this.baseCapacity(baseProvince)}）` };
    const stock = this.availableAircraft(type);
    if (stock <= 0) return { ok: false, reason: `${info.name} の備蓄がありません（生産ラインで製造してください）` };
    const n = Math.max(1, Math.min(Math.round(Number(count) || 0), free, stock));
    this.state.stockpile[info.stock] = stock - n;

    const wing = {
      id: uid('wing'),
      tag: this.state.playerTag,
      name: name || `${info.name} 第${this.wings().length + 1}航空隊`,
      type,
      count: n,
      baseProvince,
      region: region || null,
      mission: mission || null,
      training: 35,
      readiness: 100,
      created: this.state.tickCount || 0,
    };
    this.state.airForces.push(wing);
    this.refresh();
    this.save();
    this.state.bus?.emit('air-changed', { reason: 'created', wing });
    return { ok: true, wing, clamped: n < (Number(count) || 0), requested: Number(count) || 0 };
  }

  /** 基地の移動 */
  moveWing(wingId, provinceId) {
    const wing = this.wingById(wingId);
    const p = PROVINCE_BY_ID[provinceId];
    if (!wing) return { ok: false, reason: '航空隊が見つかりません' };
    if (!p) return { ok: false, reason: '移動先が不正です' };
    if (p.tag !== this.state.playerTag) return { ok: false, reason: '自国の基地へしか移動できません' };
    if (this.airbaseLevel(provinceId) < 1) return { ok: false, reason: `${p.name} に航空基地がありません` };
    const free = this.baseFree(provinceId) + (wing.baseProvince === provinceId ? wing.count : 0);
    if (wing.count > free) return { ok: false, reason: `${p.name} の空き容量が不足しています（空き ${free} 機）` };
    wing.baseProvince = provinceId;
    wing.readiness = clamp((wing.readiness || 100) - 10, 30, 100);
    this.refresh();
    this.save();
    this.state.bus?.emit('air-changed', { reason: 'moved', wing });
    return { ok: true, wing };
  }

  /** 任務の割り当て（regionId / mission のどちらかを null にすると解除） */
  setMission(wingId, regionId, mission) {
    const wing = this.wingById(wingId);
    if (!wing) return { ok: false, reason: '航空隊が見つかりません' };
    if (!mission || !regionId) {
      wing.mission = null;
      wing.region = null;
      this.refresh(); this.save();
      this.state.bus?.emit('air-changed', { reason: 'mission', wing });
      return { ok: true, wing };
    }
    if (!AIR_MISSIONS[mission]) return { ok: false, reason: '不明な任務です' };
    if (!this.regionById(regionId)) return { ok: false, reason: '不明な空域です' };
    if (this.airbaseLevel(wing.baseProvince) < 1) return { ok: false, reason: '航空基地がないため出撃できません' };
    wing.region = regionId;
    wing.mission = mission;
    this.refresh(); this.save();
    this.state.bus?.emit('air-changed', { reason: 'mission', wing });
    return { ok: true, wing, region: this.regionInfo(regionId) };
  }

  /** 補充（備蓄から機体を追加） */
  reinforce(wingId, count = null) {
    const wing = this.wingById(wingId);
    if (!wing) return { ok: false, reason: '航空隊が見つかりません' };
    const info = AIR_WING_TYPES[wing.type];
    const free = this.baseFree(wing.baseProvince);
    const want = Math.max(1, Math.round(count ?? Math.max(10, Math.floor(this.baseCapacity(wing.baseProvince) * 0.2))));
    const n = Math.min(want, free, this.availableAircraft(wing.type));
    if (n <= 0) return { ok: false, reason: free <= 0 ? '基地の空き容量がありません' : '機体の備蓄がありません' };
    this.state.stockpile[info.stock] = this.availableAircraft(wing.type) - n;
    wing.count += n;
    wing.training = clamp((wing.training || 0) - 3, 0, 100);
    this.refresh(); this.save();
    this.state.bus?.emit('air-changed', { reason: 'reinforced', wing, count: n });
    return { ok: true, wing, count: n };
  }

  /** 解散（機体は備蓄へ戻る） */
  disband(wingId) {
    const idx = this.state.airForces.findIndex((w) => w.id === wingId);
    if (idx < 0) return { ok: false };
    const [wing] = this.state.airForces.splice(idx, 1);
    const info = AIR_WING_TYPES[wing.type];
    if (info) this.state.stockpile[info.stock] = this.availableAircraft(wing.type) + (wing.count || 0);
    this.refresh(); this.save();
    this.state.bus?.emit('air-changed', { reason: 'disbanded' });
    return { ok: true, returned: wing.count || 0 };
  }

  /* ---------- 空域 ---------- */

  regionById(regionId) {
    return this.regions.find((r) => r.id === regionId) || null;
  }

  /** 州 → 空域（未登録の州は最寄りの空域中心で判定） */
  regionForProvince(provinceId) {
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return null;
    const direct = this.regions.find((r) => (r.provinces || []).includes(provinceId));
    if (direct) return direct;
    let best = null;
    let bestD = Infinity;
    for (const r of this.regions) {
      const d = Math.hypot((r.center?.x || 0) - p.x, (r.center?.y || 0) - p.y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  /** 敵航空戦力（空域ごと。戦時はやや増強） */
  enemyAirPower(regionId) {
    const base = ENEMY_AIR_POWER[regionId] ?? 250;
    const atWar = (this.state.atWarWith?.size || 0) > 0;
    return Math.round(base * (atWar ? 1.15 : 0.9));
  }

  /** 空域の制空権情報（自軍/敵軍の割合） */
  regionInfo(regionId) {
    if (this._cache.has(regionId)) return this._cache.get(regionId);
    const region = this.regionById(regionId);
    if (!region) return null;
    const wings = this.wings().filter((w) => w.region === regionId && w.mission);
    let ownPower = 0;
    let casPower = 0;
    let strategicPower = 0;
    for (const w of wings) {
      const info = AIR_WING_TYPES[w.type];
      const power = wingAirPower(w);
      ownPower += power;
      if (w.mission === 'cas') casPower += wingStrength(w) * (info?.groundAttack || 0);
      if (w.mission === 'strategic_bombing') strategicPower += wingStrength(w) * (info?.strategic || 0);
    }
    const enemyPower = this.enemyAirPower(regionId);
    const total = ownPower + enemyPower;
    const ownPct = total > 0 ? (ownPower / total) * 100 : 0;
    const info = {
      id: regionId,
      name: region.name,
      center: region.center,
      radius: region.radius,
      provinces: region.provinces || [],
      ownPower: r1(ownPower),
      enemyPower: r1(enemyPower),
      ownPct: Math.round(ownPct),
      enemyPct: 100 - Math.round(ownPct),
      status: supremacyStatus(ownPct),
      signed: Math.round(ownPct * 2 - 100),
      wings: wings.map((w) => w.id),
      wingCount: wings.length,
      aircraft: wings.reduce((n, w) => n + (w.count || 0), 0),
      casPower: r1(casPower),
      strategicPower: r1(strategicPower),
      casWings: wings.filter((w) => w.mission === 'cas').length,
      stratWings: wings.filter((w) => w.mission === 'strategic_bombing').length,
      supWings: wings.filter((w) => w.mission === 'air_superiority').length,
    };
    this._cache.set(regionId, info);
    return info;
  }

  /** 制空権（-100..100, air-naval 互換） */
  supremacySigned(regionId) {
    return this.regionInfo(regionId)?.signed ?? -100;
  }

  /** 空域の地上支援（CAS）ボーナス（空域単位・UI 表示用） */
  casBonusForRegion(regionId) {
    const info = this.regionInfo(regionId);
    if (!info || !info.casPower) return 0;
    const ownShare = info.ownPct / 100;
    return Math.min(0.30, (info.casPower / 1600) * (0.45 + 0.55 * ownShare));
  }

  /** 全空域の要約 */
  allRegions() {
    return this.regions.map((r) => this.regionInfo(r.id));
  }

  /* ---------- 戦闘連動（CAS） ---------- */

  /** 基地から目標州までが機種の行動半径内か */
  inRange(wing, provinceId) {
    const base = PROVINCE_BY_ID[wing?.baseProvince];
    const target = PROVINCE_BY_ID[provinceId];
    const info = AIR_WING_TYPES[wing?.type];
    if (!base || !target || !info) return false;
    const d = Math.hypot(base.x - target.x, base.y - target.y);
    return d <= kmToPixels(info.rangeKm);
  }

  /**
   * 戦闘中の州への CAS 支援。
   * @returns {null|{regionId:string, wingCount:number, bonus:number, damage:number, ownPct:number, enemyPct:number, groundPower:number}}
   */
  battleSupport(provinceId) {
    const region = this.regionForProvince(provinceId);
    if (!region) return null;
    const info = this.regionInfo(region.id);
    const casWings = this.wings().filter((w) => w.mission === 'cas' && w.region === region.id && this.inRange(w, provinceId));
    if (!casWings.length) return null;
    let groundPower = 0;
    for (const w of casWings) groundPower += wingStrength(w) * (AIR_WING_TYPES[w.type]?.groundAttack || 0);
    if (groundPower <= 0) return null;
    const ownShare = (info?.ownPct ?? 0) / 100;
    const contested = 0.45 + 0.55 * ownShare;
    return {
      regionId: region.id,
      regionName: region.name,
      wingCount: casWings.length,
      aircraft: casWings.reduce((n, w) => n + (w.count || 0), 0),
      groundPower: r1(groundPower),
      bonus: Math.min(0.30, (groundPower / 1600) * contested),
      damage: Math.min(9, (groundPower / 320) * contested),
      ownPct: info?.ownPct ?? 0,
      enemyPct: info?.enemyPct ?? 100,
      contested: r1(contested),
    };
  }

  /** 指定州に配備されている航空隊 */
  wingsAt(provinceId) {
    return this.wings().filter((w) => w.baseProvince === provinceId);
  }

  /** 州の航空情報（UI 用） */
  provinceInfo(provinceId) {
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return null;
    const region = this.regionForProvince(provinceId);
    return {
      province: p,
      level: this.airbaseLevel(provinceId),
      maxLevel: AIRBASE.MAX_LEVEL,
      capacity: this.baseCapacity(provinceId),
      used: this.usedCapacity(provinceId),
      wings: this.wingsAt(provinceId),
      regionId: region?.id || null,
      regionName: region?.name || null,
      queued: (this.state.constructionQueue || []).find((q) => q.type === 'air_base' && q.provinceId === provinceId) || null,
      factories: this.factoryCount(provinceId),
    };
  }

  /* ---------- Tick ---------- */

  tick(hours = 1) {
    const h = Math.max(0, Number(hours) || 0);
    if (h <= 0) return { losses: 0, bombed: 0 };
    let losses = 0;
    let changed = false;

    for (const wing of this.wings()) {
      const info = AIR_WING_TYPES[wing.type];
      const active = Boolean(wing.mission && wing.region && wing.mission !== 'training');

      // 稼働率：出撃中は消耗し、待機で回復
      if (active) wing.readiness = clamp((wing.readiness ?? 100) - 0.22 * h, 30, 100);
      else wing.readiness = clamp((wing.readiness ?? 100) + 0.55 * h, 30, 100);

      // 練度：訓練で上昇、実戦で微増、待機で微減
      if (wing.mission === 'training') wing.training = clamp((wing.training ?? 0) + 0.9 * h, 0, 100);
      else if (active) wing.training = clamp((wing.training ?? 0) + 0.02 * h, 0, 100);
      else wing.training = clamp((wing.training ?? 0) - 0.03 * h, 20, 100);

      // 消耗（敵制空権が高いほど損失が増える）
      if (active) {
        const region = this.regionInfo(wing.region);
        const exposure = (region?.enemyPct ?? 100) / 100;
        const risk = wing.mission === 'air_superiority' ? 1.15 : wing.mission === 'cas' ? 0.9 : 0.6;
        wing._loss = (wing._loss || 0) + (wing.count || 0) * (info?.maintenance || 0.0005) * exposure * risk * h;
        const lost = Math.floor(wing._loss);
        if (lost > 0) {
          wing._loss -= lost;
          wing.count = Math.max(0, (wing.count || 0) - lost);
          losses += lost;
          changed = true;
        }
      }
      changed = true;
    }

    // 戦略爆撃（6 時間ごと）
    let bombed = 0;
    if ((this.state.tickCount || 0) % 6 === 0) {
      bombed = this.runStrategicBombing(h);
      if (bombed) changed = true;
    }

    if (changed) {
      this.refresh();
      if (losses || bombed) {
        this.save();
        this.state.bus?.emit('air-changed', { reason: 'tick', losses, bombed });
        if (losses) this.state.bus?.emit('air-losses', { losses });
      }
    }
    return { losses, bombed };
  }

  /** 戦略爆撃の実行。破壊した州数を返す */
  runStrategicBombing(hours = 6) {
    let bombed = 0;
    for (const region of this.regions) {
      const info = this.regionInfo(region.id);
      if (!info || info.strategicPower <= 0) continue;
      const ownShare = info.ownPct / 100;
      const targets = this.targetsInRegion(region);
      if (!targets.length) continue;
      const power = info.strategicPower * (0.35 + 0.65 * ownShare);
      const target = targets[0];
      if (this.bombProvince(target, power, hours)) bombed += 1;
    }
    return bombed;
  }

  /** 空域内の敵州（VP の高い順） */
  targetsInRegion(region) {
    const out = [];
    const seen = new Set();
    for (const pid of region.provinces || []) {
      const p = PROVINCE_BY_ID[pid];
      if (!p || seen.has(pid)) continue;
      seen.add(pid);
      if (p.tag !== this.state.playerTag) out.push(p);
    }
    return out.sort((a, b) => (b.vp || 0) - (a.vp || 0));
  }

  /**
   * 1 州への爆撃。100 の被害でインフラ（無ければ航空基地）が 1 段階破壊される。
   * @returns {boolean} レベルが破壊されたら true
   */
  bombProvince(province, power, hours = 6) {
    const dmg = power * 0.0011 * hours;
    province.airDamage = clamp((province.airDamage || 0) + dmg, 0, 100);
    // 工場被害はやや遅れて蓄積する
    province.factoryDamage = clamp((province.factoryDamage || 0) + dmg * 0.7, 0, 100);
    province.bombed = true;

    // 工場が先に限界へ達した場合は工場を破壊
    if (province.factoryDamage >= 100 && this.factoryCount(province.id) > 0) {
      province.factoryDamage = 0;
      this.state.industry[province.id] = this.factoryCount(province.id) - 1;
      province.bombCount = (province.bombCount || 0) + 1;
      const entry = {
        at: this.state.tickCount || 0,
        provinceId: province.id,
        provinceName: province.name,
        destroyed: 'factory',
        factories: this.state.industry[province.id],
        infra: this.state.infrastructure?.[province.id] ?? null,
        airbase: this.airbaseLevel(province.id),
      };
      this.state.airBombings.unshift(entry);
      if (this.state.airBombings.length > 40) this.state.airBombings.length = 40;
      this.state.bus?.emit('air-bombing', entry);
      return true;
    }

    if (province.airDamage < 100) return false;
    province.airDamage = 0;
    province.bombCount = (province.bombCount || 0) + 1;

    // インフラ → 航空基地の順に破壊
    let destroyed = null;
    const infra = this.state.infrastructure?.[province.id];
    if (Number.isFinite(infra) && infra > 0) {
      this.state.infrastructure[province.id] = infra - 1;
      this.state._supplyMgr?.refresh?.();
      destroyed = 'infrastructure';
    } else if (this.airbaseLevel(province.id) > 0) {
      this.setAirbaseLevel(province.id, this.airbaseLevel(province.id) - 1);
      destroyed = 'airbase';
    }
    const entry = {
      at: this.state.tickCount || 0,
      provinceId: province.id,
      provinceName: province.name,
      destroyed,
      infra: this.state.infrastructure?.[province.id] ?? null,
      airbase: this.airbaseLevel(province.id),
    };
    if (destroyed) {
      this.state.airBombings.unshift(entry);
      if (this.state.airBombings.length > 40) this.state.airBombings.length = 40;
      this.state.bus?.emit('air-bombing', entry);
      return true;
    }
    return false;
  }

  /* ---------- 集計 ---------- */

  refresh() {
    this._cache.clear();
    const regions = {};
    for (const r of this.regions) regions[r.id] = this.regionInfo(r.id);
    this.state.airRegions = regions;
    return regions;
  }

  summary() {
    const wings = this.wings();
    const aircraft = wings.reduce((n, w) => n + (w.count || 0), 0);
    const training = wings.length ? wings.reduce((n, w) => n + (w.training || 0), 0) / wings.length : 0;
    const readiness = wings.length ? wings.reduce((n, w) => n + (w.readiness || 0), 0) / wings.length : 0;
    const ownBases = PROVINCES.filter((p) => p.tag === this.state.playerTag && this.airbaseLevel(p.id) > 0);
    const regions = this.allRegions();
    return {
      wings: wings.length,
      aircraft,
      avgTraining: Math.round(training),
      avgReadiness: Math.round(readiness),
      bases: ownBases.length,
      baseLevels: ownBases.reduce((n, p) => n + this.airbaseLevel(p.id), 0),
      capacity: ownBases.reduce((n, p) => n + this.baseCapacity(p.id), 0),
      assigned: wings.filter((w) => w.mission).length,
      superiorityRegions: regions.filter((r) => r.status === 'green').length,
      contestedRegions: regions.filter((r) => r.status === 'yellow').length,
      lostRegions: regions.filter((r) => r.status === 'red').length,
      casWings: wings.filter((w) => w.mission === 'cas').length,
      stratWings: wings.filter((w) => w.mission === 'strategic_bombing').length,
      stock: Object.fromEntries(AIR_WING_TYPE_IDS.map((t) => [t, this.availableAircraft(t)])),
      bombings: this.state.airBombings?.length || 0,
    };
  }
}

/** ユーティリティ：空域情報の保存形式（デバッグ / テスト用） */
export function airStateJSON(state) {
  const wings = (state.airForces || []).filter((w) => AIR_WING_TYPES[w.type]);
  return {
    airbases: { ...(state.airbases || {}) },
    wings: wings.map((w) => ({
      id: w.id, type: w.type, count: w.count, baseProvince: w.baseProvince,
      region: w.region, mission: w.mission,
      training: Math.round(w.training || 0), readiness: Math.round(w.readiness || 0),
    })),
  };
}

/** インストール（main.js / テストから呼ぶ） */
export function installAirWingSystem(state, opts = {}) {
  if (state._airWingMgr) return state._airWingMgr;
  const mgr = new AirWingManager(state, opts);
  state._airWingMgr = mgr;
  state.airWings = mgr;
  return mgr;
}
