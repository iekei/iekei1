/**
 * battle-plan.js — 作戦計画（前線 / 攻撃線 / 計画準備ボーナス / 自動実行）
 *
 * HOI4 の戦闘計画（Battle Plan）を再現するロジック層。DOM には依存しない。
 *
 *  - 前線 (Frontline): 自国（＋同盟国）のプロヴィンスのうち敵と隣接するものを並べた防御線。
 *    手動で塗ることも、自動生成することもできる。師団は前線に沿って自動配置される。
 *  - 攻撃線 (Offensive Line): 前線から敵領土の目標プロヴィンスへ引く矢印。
 *    経路探索（Dijkstra / 地形移動コスト）で経路を計算し、師団が自動で前進する。
 *  - 計画準備ボーナス: 前線で待機している間、時間経過で蓄積（上限 30%＋ドクトリン）。
 *    戦闘時の攻撃力・突破力に乗算され、実行中は徐々に消費（減衰）される。
 *  - 実行: `execute()` で AI が経路に沿って前進し、敵プロヴィンスでは自動戦闘を解決。
 *    勝利するとプロヴィンスを占領し、前線が前進する。
 *
 * データ構造:
 *   plan = {
 *     id, tag, name,
 *     frontline: string[],                 // 前線プロヴィンスID（順序つき）
 *     autoFront: boolean,
 *     divisions: string[],                 // 割当師団ID
 *     goals: [{ id, targetId, fromId, path: string[], done }],
 *     orders: { [divisionId]: { goalId, path, idx, progress, waiting } },
 *     planning: number,                    // 0..maxPlanningBonus
 *     stance: 'hold'|'prepare'|'advance',
 *     executing: boolean,
 *     createdAt, lastMessage,
 *   }
 */

import { PROVINCES, PROVINCE_BY_ID, neighbors, terrainInfo, moveSpeedMultiplier } from './map-data.js';
import { uid } from './util.js';

/* ============================ 定数 ============================ */

export const PLAN = {
  BASE_MAX_PLANNING: 0.30,     // 計画準備ボーナス上限（HOI4: +30%）
  PLANNING_GAIN_PER_DAY: 0.06, // 前線待機中の伸び（1日 +6%）
  PLANNING_DECAY_PER_DAY: 0.22,// 実行中の減衰
  MOVE_HOURS_BASE: 8,          // 平地1プロヴィンスの移動時間（時間）
  MAX_DIVISIONS: 24,
  SEA_CROSSING_KM: 900,        // これ以上の隔たりは陸路移動不可（海路扱い）
  MAX_GOALS: 4,
};

/** 兵科ごとの戦闘力係数 */
const DIVISION_POWER = {
  infantry: 18, armor: 28, artillery: 24, paratrooper: 12, marine: 15,
};

/** 兵科ごとの移動速度係数 */
const DIVISION_SPEED = {
  infantry: 1.0, armor: 1.35, artillery: 0.8, paratrooper: 1.0, marine: 0.9,
};

/* ============================ 幾何ユーティリティ ============================ */

const RAD = Math.PI / 180;

/** 2プロヴィンス間の概算距離（km） */
export function provinceDistanceKm(a, b) {
  if (!a || !b) return 0;
  if (Number.isFinite(a.lon) && Number.isFinite(a.lat) && Number.isFinite(b.lon) && Number.isFinite(b.lat)) {
    const dLat = (b.lat - a.lat) * RAD;
    const dLon = (b.lon - a.lon) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)) * 12;
}

/** 陸路として通行可能な隣接か（遠距離の飛び地リンクは海路＝陸軍不可） */
export function isLandLink(a, b) {
  const pa = PROVINCE_BY_ID[a], pb = PROVINCE_BY_ID[b];
  if (!pa || !pb) return false;
  return provinceDistanceKm(pa, pb) <= PLAN.SEA_CROSSING_KM;
}

/** 前線を描画・配置しやすい順序に並べる（西→東の最近傍チェーン） */
export function orderFrontline(provinceIds) {
  const list = [...new Set(provinceIds)].filter((id) => PROVINCE_BY_ID[id]);
  if (list.length <= 2) return list;
  const remaining = new Set(list);
  // 最も西（x が小さい）から開始
  let current = list.reduce((a, b) => (PROVINCE_BY_ID[a].x <= PROVINCE_BY_ID[b].x ? a : b));
  const ordered = [current];
  remaining.delete(current);
  while (remaining.size) {
    const cp = PROVINCE_BY_ID[current];
    let best = null, bestD = Infinity;
    for (const id of remaining) {
      const p = PROVINCE_BY_ID[id];
      const d = Math.hypot(p.x - cp.x, p.y - cp.y);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (!best) break;
    ordered.push(best);
    remaining.delete(best);
    current = best;
  }
  return ordered;
}

/* ============================ マネージャ ============================ */

export class BattlePlanManager {
  constructor(state, doctrine = null) {
    this.state = state;
    this.doctrine = doctrine;
    this.battles = new Map(); // key `${planId}:${provinceId}` -> battle
    if (!Array.isArray(state.battlePlans)) state.battlePlans = [];
    if (!Array.isArray(state.combatBubbles)) state.combatBubbles = [];
  }

  /* ---------- 陣営判定 ---------- */

  factionOf(tag) {
    for (const [id, f] of Object.entries(this.state.factions || {})) {
      if (f.members?.includes(tag)) return id;
    }
    return null;
  }

  isFriendlyTag(tag, planTag) {
    if (tag === planTag) return true;
    const a = this.factionOf(tag), b = this.factionOf(planTag);
    return Boolean(a && b && a === b);
  }

  isFriendlyProvince(provinceId, planTag) {
    const p = PROVINCE_BY_ID[provinceId];
    return Boolean(p && this.isFriendlyTag(p.tag, planTag));
  }

  /* ---------- プラン管理 ---------- */

  plans(tag = this.state.playerTag) {
    return (this.state.battlePlans || []).filter((p) => p.tag === tag);
  }

  getPlan(planId) {
    return (this.state.battlePlans || []).find((p) => p.id === planId) || null;
  }

  createPlan({ name = '第1軍集団 作戦計画', tag = this.state.playerTag } = {}) {
    const plan = {
      id: uid('plan'),
      tag,
      name,
      frontline: [],
      autoFront: true,
      divisions: [],
      goals: [],
      orders: {},
      planning: 0,
      stance: 'hold',
      executing: false,
      createdAt: this.state.dateLabel,
      lastMessage: '',
    };
    this.state.battlePlans.push(plan);
    if (plan.autoFront) this.autoFrontline(plan.id);
    // 利用可能な師団を前線へ自動配置（HOI4 の軍集団配属に相当）
    this._deploy(plan);
    this.state.bus.emit('battle-plan-created', plan);
    return plan;
  }

  removePlan(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return false;
    this._clearBattles(planId);
    this.state.battlePlans = this.state.battlePlans.filter((p) => p.id !== planId);
    return true;
  }

  /** 前線を自動生成（自国＋同盟国の、敵と隣接するプロヴィンス） */
  /** 敵と陸接している自国州（前線候補）を描画順で返す */
  borderProvinces(tag) {
    const ids = [];
    for (const p of PROVINCES) {
      // 自国（占領地含む）の州のみを前線とする。同盟国は独自の前線を持つ。
      if (p.tag !== tag) continue;
      const hasEnemyNeighbor = neighbors(p.id).some((nb) => {
        const np = PROVINCE_BY_ID[nb];
        return np && !this.isFriendlyTag(np.tag, tag) && isLandLink(p.id, nb);
      });
      if (hasEnemyNeighbor) ids.push(p.id);
    }
    return orderFrontline(ids);
  }

  autoFrontline(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return [];
    plan.frontline = this.borderProvinces(plan.tag);
    plan.autoFront = true;
    this.state.bus.emit('battle-plan-changed', plan);
    return plan.frontline;
  }

  /** 前線を手動設定（敵と隣接していなくてもよい） */
  setFrontline(planId, provinceIds, { auto = false } = {}) {
    const plan = this.getPlan(planId);
    if (!plan) return { ok: false, reason: 'unknown-plan' };
    const valid = provinceIds.filter((id) => {
      const p = PROVINCE_BY_ID[id];
      return p && p.tag === plan.tag;
    });
    plan.frontline = orderFrontline(valid);
    plan.autoFront = auto;
    // 前線から外れた師団の配置を更新
    this._deploy(plan);
    this.state.bus.emit('battle-plan-changed', plan);
    return { ok: true, frontline: plan.frontline };
  }

  /** 前線にプロヴィンスを追加/削除（マップ上でのドラッグ塗りに対応） */
  toggleFrontlineProvince(planId, provinceId) {
    const plan = this.getPlan(planId);
    if (!plan) return { ok: false, reason: 'unknown-plan' };
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return { ok: false, reason: 'unknown-province' };
    if (!this.isFriendlyProvince(provinceId, plan.tag)) return { ok: false, reason: 'not-owned' };
    const set = new Set(plan.frontline);
    if (set.has(provinceId)) set.delete(provinceId); else set.add(provinceId);
    plan.frontline = orderFrontline([...set]);
    plan.autoFront = false;
    this._deploy(plan);
    this.state.bus.emit('battle-plan-changed', plan);
    return { ok: true, frontline: plan.frontline };
  }

  /* ---------- 師団配置 ---------- */

  /** プレイヤーの師団を前線へ自動配置（攻撃線があれば目標方面へ重点配分） */
  _deploy(plan) {
    if (!plan.frontline.length) { plan.orders = {}; return; }
    const divisions = this._availableDivisions(plan);
    plan.divisions = divisions.map((d) => d.id);
    const sectors = plan.goals.length
      ? plan.goals.map((g) => g.fromId).filter(Boolean)
      : plan.frontline;
    const front = sectors.length ? sectors : plan.frontline;
    plan.orders = {};
    divisions.forEach((div, i) => {
      const provinceId = front[i % front.length];
      // 師団を前線プロヴィンスへ移動（すでに前線にいればそのまま）
      const p = PROVINCE_BY_ID[provinceId];
      if (p && this.isFriendlyTag(p.tag, plan.tag)) div.provinceId = provinceId;
      const goal = plan.goals[i % Math.max(1, plan.goals.length)] || null;
      const path = goal ? this._pathFrom(provinceId, goal.targetId, plan.tag) : [];
      plan.orders[div.id] = {
        goalId: goal?.id || null,
        path,
        idx: path[0] === provinceId ? 1 : 0,
        progress: 0,
        waiting: false,
      };
    });
    plan.stance = plan.goals.length ? 'prepare' : 'hold';
  }

  _availableDivisions(plan) {
    const all = (this.state.divisions || []).filter((d) => {
      const tag = d.tag || plan.tag;
      return this.isFriendlyTag(tag, plan.tag);
    });
    // 他のプランに割り当て済みの師団は除外
    const used = new Set();
    for (const other of this.plans(plan.tag)) {
      if (other.id === plan.id) continue;
      other.divisions.forEach((id) => used.add(id));
    }
    return all.filter((d) => !used.has(d.id)).slice(0, PLAN.MAX_DIVISIONS);
  }

  /** 師団を明示的に割り当て */
  assignDivisions(planId, divisionIds = null) {
    const plan = this.getPlan(planId);
    if (!plan) return { ok: false, reason: 'unknown-plan' };
    if (divisionIds) {
      plan.divisions = divisionIds.filter((id) => (this.state.divisions || []).some((d) => d.id === id));
      const front = plan.goals.map((g) => g.fromId).filter(Boolean);
      const sectors = front.length ? front : plan.frontline;
      plan.orders = {};
      plan.divisions.forEach((id, i) => {
        const div = this.state.divisions.find((d) => d.id === id);
        const provinceId = sectors[i % Math.max(1, sectors.length)] || div.provinceId;
        const goal = plan.goals[i % Math.max(1, plan.goals.length)] || null;
        if (PROVINCE_BY_ID[provinceId]) div.provinceId = provinceId;
        const path = goal ? this._pathFrom(provinceId, goal.targetId, plan.tag) : [];
        plan.orders[id] = {
          goalId: goal?.id || null,
          path,
          idx: path[0] === provinceId ? 1 : 0,
          progress: 0, waiting: false,
        };
      });
    } else {
      this._deploy(plan);
    }
    this.state.bus.emit('battle-plan-changed', plan);
    return { ok: true, divisions: plan.divisions };
  }

  /* ---------- 経路探索（Dijkstra） ---------- */

  /**
   * 前線プロヴィンスから目標までの経路を計算。
   * コスト = 地形移動コスト ×（敵領 1.4 / 中立 2.5）。海路リンクは通行不可。
   */
  findPath(fromId, toId, tag = this.state.playerTag) {
    if (!PROVINCE_BY_ID[fromId] || !PROVINCE_BY_ID[toId]) return { path: [], cost: Infinity };
    const dist = new Map([[fromId, 0]]);
    const prev = new Map();
    const visited = new Set();
    const queue = [[0, fromId]];
    while (queue.length) {
      // 単純な優先度つきキュー（ノード数が少ないため線形探索で十分）
      queue.sort((a, b) => a[0] - b[0]);
      const [cost, id] = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      if (id === toId) break;
      for (const nb of neighbors(id)) {
        if (visited.has(nb)) continue;
        if (!isLandLink(id, nb)) continue;
        const np = PROVINCE_BY_ID[nb];
        if (!np) continue;
        let w = terrainInfo(np.terrain).moveCost;
        if (!this.isFriendlyTag(np.tag, tag)) {
          w *= np.tag === tag ? 1 : 2.4; // 敵国・中立国通過は高コスト
        }
        const next = cost + w;
        if (next < (dist.get(nb) ?? Infinity)) {
          dist.set(nb, next);
          prev.set(nb, id);
          queue.push([next, nb]);
        }
      }
    }
    if (!dist.has(toId)) return { path: [], cost: Infinity };
    const path = [];
    let cur = toId;
    let guard = 0;
    while (cur && guard++ < 200) {
      path.unshift(cur);
      cur = prev.get(cur);
    }
    return { path, cost: dist.get(toId) };
  }

  _pathFrom(fromId, toId, tag) {
    const { path } = this.findPath(fromId, toId, tag);
    return path;
  }

  /* ---------- 攻撃線 ---------- */

  /** 攻撃線（目標）を追加。前線から最も近い地点を起点に経路を計算する */
  addGoal(planId, targetProvinceId) {
    const plan = this.getPlan(planId);
    if (!plan) return { ok: false, reason: 'unknown-plan' };
    const target = PROVINCE_BY_ID[targetProvinceId];
    if (!target) return { ok: false, reason: 'unknown-province' };
    if (this.isFriendlyProvince(targetProvinceId, plan.tag)) return { ok: false, reason: 'already-owned' };
    if (plan.goals.length >= PLAN.MAX_GOALS) return { ok: false, reason: 'too-many' };
    if (!plan.frontline.length) this.autoFrontline(planId);

    let best = null;
    for (const fromId of plan.frontline) {
      const { path, cost } = this.findPath(fromId, targetProvinceId, plan.tag);
      if (!path.length) continue;
      if (!best || cost < best.cost) best = { fromId, path, cost };
    }
    if (!best) return { ok: false, reason: 'no-path' };
    if (plan.goals.some((g) => g.targetId === targetProvinceId)) return { ok: false, reason: 'duplicate' };

    const goal = {
      id: uid('goal'),
      targetId: targetProvinceId,
      fromId: best.fromId,
      path: best.path,
      cost: best.cost,
      done: false,
      createdAt: this.state.dateLabel,
    };
    plan.goals.push(goal);
    plan.stance = plan.executing ? 'advance' : 'prepare';
    this._deploy(plan);
    this.state.bus.emit('battle-plan-changed', plan);
    return { ok: true, goal };
  }

  removeGoal(planId, goalId) {
    const plan = this.getPlan(planId);
    if (!plan) return false;
    plan.goals = plan.goals.filter((g) => g.id !== goalId);
    if (!plan.goals.length) { plan.executing = false; plan.stance = 'hold'; }
    this._deploy(plan);
    this.state.bus.emit('battle-plan-changed', plan);
    return true;
  }

  /* ---------- 実行 / 停止 ---------- */

  execute(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return { ok: false, reason: 'unknown-plan' };
    if (!plan.frontline.length) return { ok: false, reason: 'no-frontline' };
    if (!plan.goals.length) return { ok: false, reason: 'no-goals' };
    if (!plan.divisions.length) this._deploy(plan);
    plan.executing = true;
    plan.stance = 'advance';
    plan.lastMessage = '作戦実行中 — 攻撃線へ前進';
    // 経路を最新の前線に合わせて更新
    for (const [divId, order] of Object.entries(plan.orders)) {
      const goal = plan.goals.find((g) => g.id === order.goalId);
      const div = this.state.divisions.find((d) => d.id === divId);
      if (goal && div) {
        order.path = this._pathFrom(div.provinceId, goal.targetId, plan.tag);
        order.idx = order.path[0] === div.provinceId ? 1 : 0;
        order.progress = 0;
        order.waiting = false;
      }
    }
    this.state.bus.emit('battle-plan-executed', plan);
    return { ok: true, plan };
  }

  halt(planId) {
    const plan = this.getPlan(planId);
    if (!plan) return { ok: false, reason: 'unknown-plan' };
    plan.executing = false;
    plan.stance = plan.goals.length ? 'prepare' : 'hold';
    plan.lastMessage = '作戦停止 — 前線で待機';
    for (const order of Object.values(plan.orders)) { order.waiting = false; order.progress = 0; }
    this._clearBattles(planId);
    this.state.bus.emit('battle-plan-halted', plan);
    return { ok: true };
  }

  /* ---------- 計画準備ボーナス ---------- */

  maxPlanningBonus() {
    const base = this.doctrine?.maxPlanningBonus?.() ?? PLAN.BASE_MAX_PLANNING;
    return Math.min(0.60, base + (this.state.planningBonusMax || 0));
  }

  planningGainPerDay() {
    return PLAN.PLANNING_GAIN_PER_DAY * (this.doctrine?.planningSpeedMultiplier?.() ?? 1);
  }

  /** 計画準備ボーナス（0..max）。師団の戦闘力に乗算 */
  planningBonus(plan) { return plan?.planning || 0; }

  /* ---------- ティック ---------- */

  tick(hours) {
    const h = Number(hours) || 0;
    if (!h) return;
    const days = h / 24;
    for (const plan of this.plans(this.state.playerTag)) {
      // 前線の自動更新（占領で前線が前進する）
      if (plan.autoFront) {
        const border = this.borderProvinces(plan.tag);
        const same = border.length === plan.frontline.length
          && border.every((id, i) => plan.frontline[i] === id);
        if (!same) {
          plan.frontline = border;
          this._syncOrders(plan);
          this.state.bus.emit('battle-plan-changed', plan);
        }
      }
      // 計画準備
      if (plan.executing) {
        plan.planning = Math.max(0, plan.planning - PLAN.PLANNING_DECAY_PER_DAY * days);
      } else if (plan.frontline.length && plan.goals.length) {
        const cap = this.maxPlanningBonus();
        plan.planning = Math.min(cap, plan.planning + this.planningGainPerDay() * days);
        plan.stance = plan.stance === 'hold' ? 'prepare' : plan.stance;
      }
      if (!plan.executing) continue;
      this._advance(plan, h);
    }
    this._tickBattles(h);
  }

  /** 前線移動後に各師団の経路を振り直す */
  _syncOrders(plan) {
    for (const [divId, order] of Object.entries(plan.orders)) {
      const div = this.state.divisions.find((d) => d.id === divId);
      const goal = plan.goals.find((g) => g.id === order.goalId);
      if (!div || !goal) continue;
      if (!order.path || !order.path.length) {
        order.path = this._pathFrom(div.provinceId, goal.targetId, plan.tag);
        order.idx = 0;
      }
    }
  }

  /** 1時間ぶんの前進処理（友好州は移動、敵州は戦闘） */
  _advance(plan, hours) {
    for (const [divId, order] of Object.entries(plan.orders)) {
      const div = (this.state.divisions || []).find((d) => d.id === divId);
      if (!div || !order.path?.length) continue;

      // 経路の末尾に到達済みなら、次の目標へ振り直す
      if (order.idx >= order.path.length) {
        if (this._retarget(plan, div, order)) continue;
        continue;
      }
      const nextId = order.path[order.idx];
      const next = PROVINCE_BY_ID[nextId];
      if (!next) { order.idx += 1; continue; }

      // 既にその州にいる → 次へ
      if (div.provinceId === nextId) {
        order.idx += 1;
        order.progress = 0;
        continue;
      }

      const nextIsFriendly = this.isFriendlyProvince(nextId, plan.tag);
      const adjacent = neighbors(div.provinceId).includes(nextId) && isLandLink(div.provinceId, nextId);

      if (!adjacent) {
        // 経路が古い（前線が動いた等）→ 再計算してやり直す
        const goal = plan.goals.find((g) => g.id === order.goalId);
        if (goal) {
          const path = this._pathFrom(div.provinceId, goal.targetId, plan.tag);
          if (path.length >= 2) {
            order.path = path;
            order.idx = path[0] === div.provinceId ? 1 : 0;
          }
        }
        order.progress = 0;
        continue;
      }

      if (nextIsFriendly) {
        // 自国・同盟国領: 移動時間を消化して進軍（地形・速度の影響を受ける）
        const hoursNeeded = this._moveHours(div, next);
        order.progress += hours / Math.max(0.5, hoursNeeded);
        if (order.progress >= 1) {
          order.progress = 0;
          div.provinceId = nextId;
          order.idx += 1;
          div.org = Math.min(div.maxOrg || 50, (div.org || 0) + 1.5);
        }
        continue;
      }

      // 敵プロヴィンス: 戦闘を開始/継続（戦闘幅まで）
      const battleKey = `${plan.id}:${nextId}`;
      let battle = this.battles.get(battleKey);
      if (!battle) {
        const defense = this._defenseStrength(next);
        if (defense.org > 0) {
          battle = this._startBattle(plan, next, defense, div);
        }
      }
      if (battle) {
        if (!battle.attackerIds.includes(div.id) && battle.attackerIds.length < battle.width) {
          battle.attackerIds.push(div.id);
        }
        order.waiting = true;
      }
    }
  }

  /** 目標到達後、別の未達目標があれば経路を振り直す */
  _retarget(plan, div, order) {
    const open = plan.goals.filter((g) => !g.done);
    if (!open.length) return false;
    const goal = open[0];
    const path = this._pathFrom(div.provinceId, goal.targetId, plan.tag);
    if (path.length < 2) return false;
    order.goalId = goal.id;
    order.path = path;
    order.idx = path[0] === div.provinceId ? 1 : 0;
    order.progress = 0;
    order.waiting = false;
    return true;
  }

  _moveHours(div, province) {
    const terrain = terrainInfo(province.terrain);
    const speed = DIVISION_SPEED[div.type] || 1;
    // 補給不足ペナルティ（速度低下）を反映
    const supplySpeed = div.supplyPenalty?.speed ?? div.supply ?? 1;
    return (PLAN.MOVE_HOURS_BASE * terrain.moveCost) / Math.max(0.4, speed * supplySpeed);
  }

  /** 敵プロヴィンスの守備隊（VP・地形から算出） */
  _defenseStrength(province) {
    const vp = province.vp || 0;
    const terrain = terrainInfo(province.terrain);
    const power = (18 + vp * 2.6) * (1 + terrain.defense);
    const maxOrg = 70 + vp * 4;
    return { power: Math.round(power * 10) / 10, org: maxOrg, maxOrg, hp: 100 + vp * 5 };
  }

  _startBattle(plan, province, defense, firstDiv) {
    const key = `${plan.id}:${province.id}`;
    const terrain = terrainInfo(province.terrain);
    const battle = {
      id: `bp-${key.replace(/[^a-z0-9]/gi, '')}`,
      planId: plan.id,
      provinceId: province.id,
      attackerIds: firstDiv ? [firstDiv.id] : [],
      defenderTag: province.tag,
      defender: { ...defense },
      startedAt: this.state.tickCount || 0,
      hours: 0,
      advantage: 'yellow',
      // 戦闘幅（HOI4 の combat width 相当）: 地形が険しいほど同時投入数が減る
      width: Math.max(2, Math.round(terrain.width ?? 6)),
    };
    this.battles.set(key, battle);
    this._syncBubble(battle);
    this.state.bus.emit('battle-started', battle);
    return battle;
  }

  /** 攻撃側の戦闘力（計画準備ボーナス + ドクトリン） */
  _attackerPower(plan, battle) {
    let power = 0;
    // 戦闘幅を超える師団は予備として待機（攻撃力に寄与しない）
    for (const id of battle.attackerIds.slice(0, battle.width || 6)) {
      const div = this.state.divisions.find((d) => d.id === id);
      if (!div) continue;
      const base = DIVISION_POWER[div.type] || DIVISION_POWER.infantry;
      const orgRatio = 0.35 + 0.65 * Math.max(0, Math.min(1, (div.org || 0) / Math.max(1, div.maxOrg || 1)));
      // 補給不足ペナルティ（戦闘力低下）
      const supplyCombat = div.supplyPenalty?.combat ?? 1;
      power += base * orgRatio * supplyCombat * (1 + this.planningBonus(plan));
    }
    const effects = this.doctrine?.effects?.('land') || {};
    const spiritSoft = this.state.getModifier?.('soft') || 0;
    const spiritBreak = this.state.getModifier?.('breakthrough') || 0;
    const spiritOrg = this.state.getModifier?.('org') || 0;
    const bonus = (1 + (effects.soft || 0) * 0.5 + (effects.breakthrough || 0) * 0.5
      + (spiritSoft + spiritBreak) * 0.5) * (1 + spiritOrg * 0.5);
    return Math.max(1, power * bonus);
  }

  _tickBattles(hours) {
    for (const [key, battle] of [...this.battles.entries()]) {
      const plan = this.getPlan(battle.planId);
      if (!plan) { this.battles.delete(key); this._removeBubble(battle); continue; }
      const province = PROVINCE_BY_ID[battle.provinceId];
      const terrain = terrainInfo(province?.terrain);
      battle.hours += hours;

      const attackerPower = this._attackerPower(plan, battle);
      const defenderPower = battle.defender.power * (1 + terrain.defense);

      // 防御側の組織力・HPを削る
      const orgDamage = attackerPower * 0.0065 * hours / (1 + terrain.defense * 0.8);
      const hpDamage = orgDamage * 0.30;
      battle.defender.org = Math.max(0, battle.defender.org - orgDamage);
      battle.defender.hp = Math.max(0, battle.defender.hp - hpDamage);

      // 攻撃側の損耗（反撃）
      const playerDefense = this.state.getModifier?.('defense') || 0;
      const counter = defenderPower * 0.0035 * hours / (1 + playerDefense);
      for (const id of battle.attackerIds.slice(0, battle.width || 6)) {
        const div = this.state.divisions.find((d) => d.id === id);
        if (!div) continue;
        const share = counter / Math.max(1, battle.attackerIds.length);
        div.org = Math.max(0, (div.org || 0) - share);
        div.hp = Math.max(0, (div.hp || 0) - share * 0.3);
      }

      // 優勢度（マップの戦闘バブル色）
      const ratio = attackerPower / Math.max(1, defenderPower);
      battle.advantage = ratio > 1.35 ? 'green' : ratio < 0.75 ? 'red' : 'yellow';
      this._syncBubble(battle);

      // 防御側の崩壊 → 占領
      if (battle.defender.org <= 0) {
        this._capture(plan, province, battle);
        continue;
      }
      // 攻撃側の崩壊 → 撤退
      const alive = battle.attackerIds.some((id) => {
        const d = this.state.divisions.find((x) => x.id === id);
        return d && (d.org || 0) > 0;
      });
      if (!alive) {
        this.battles.delete(key);
        this._removeBubble(battle);
        plan.lastMessage = `${province.name} 攻略に失敗（攻撃側が撤退）`;
        for (const id of battle.attackerIds) {
          const order = plan.orders[id];
          if (order) { order.waiting = false; order.progress = 0; }
        }
        plan.planning = Math.max(0, plan.planning - 0.05);
        this.state.bus.emit('battle-lost', battle);
      }
    }
  }

  /** プロヴィンス占領 */
  _capture(plan, province, battle) {
    const key = `${plan.id}:${battle.provinceId}`;
    const oldTag = province.tag;
    province.tag = plan.tag;
    this.battles.delete(key);
    this._removeBubble(battle);

    // 攻撃側を前進させる
    for (const id of battle.attackerIds) {
      const div = this.state.divisions.find((d) => d.id === id);
      if (!div) continue;
      div.provinceId = province.id;
      div.org = Math.max(1, div.org - 0.5);
      const order = plan.orders[id];
      if (!order) continue;
      order.waiting = false;
      order.progress = 0;
      const goal = plan.goals.find((g) => g.id === order.goalId);
      order.path = goal ? this._pathFrom(province.id, goal.targetId, plan.tag) : [];
      order.idx = 1;
      if (goal && goal.targetId === province.id) goal.done = true;
    }

    plan.lastMessage = `${province.name} を占領（${oldTag} → ${plan.tag}）`;
    plan.goals.forEach((g) => { if (g.targetId === province.id) g.done = true; });

    // ドクトリン XP（HOI4 では戦闘で陸軍経験値が貯まる）
    this.doctrine?.addXP?.('land', 12);

    this.state.bus.emit('province-captured', { provinceId: province.id, from: oldTag, to: plan.tag, planId: plan.id });
    this.state.bus.emit('battle-plan-changed', plan);
  }

  _clearBattles(planId) {
    for (const [key, battle] of [...this.battles.entries()]) {
      if (battle.planId !== planId) continue;
      this.battles.delete(key);
      this._removeBubble(battle);
    }
  }

  /* ---------- マップの戦闘バブル同期 ---------- */

  _syncBubble(battle) {
    const province = PROVINCE_BY_ID[battle.provinceId];
    let bubble = this.state.combatBubbles.find((b) => b.id === battle.id);
    const data = {
      id: battle.id,
      province: battle.provinceId,
      attacker: this.state.playerTag,
      defender: battle.defenderTag,
      attackerName: `${battle.attackerIds.length}個師団`,
      defenderName: `${province?.name || battle.provinceId} 守備隊`,
      advantage: battle.advantage,
      intensity: Math.min(0.95, 0.25 + battle.hours / 120),
    };
    if (!bubble) { this.state.combatBubbles.push({ ...data }); }
    else Object.assign(bubble, data);
  }

  _removeBubble(battle) {
    const idx = this.state.combatBubbles.findIndex((b) => b.id === battle.id);
    if (idx >= 0) this.state.combatBubbles.splice(idx, 1);
  }

  /* ---------- ユーティリティ ---------- */

  /** 占領済みプロヴィンスを含む前線の表示用座標列 */
  frontlinePoints(plan) {
    return plan.frontline
      .map((id) => PROVINCE_BY_ID[id])
      .filter(Boolean)
      .map((p) => ({ id: p.id, x: p.x, y: p.y }));
  }

  /** 作戦の状態サマリ（UI用） */
  status(plan) {
    const cap = this.maxPlanningBonus();
    return {
      planning: plan.planning,
      planningPct: cap > 0 ? plan.planning / cap : 0,
      maxPlanning: cap,
      divisions: plan.divisions.length,
      goals: plan.goals.length,
      frontline: plan.frontline.length,
      battles: [...this.battles.values()].filter((b) => b.planId === plan.id).length,
      executing: plan.executing,
      stance: plan.stance,
      message: plan.lastMessage,
    };
  }

  /** 全プラン（他国含む）の前線・攻撃線を返す（描画用） */
  allPlans() { return this.state.battlePlans || []; }

  /** 指定師団の計画準備ボーナス（ツールチップ用） */
  bonusForDivision(divisionId) {
    for (const plan of this.allPlans()) {
      if (plan.divisions.includes(divisionId)) return this.planningBonus(plan);
    }
    return 0;
  }
}

export default BattlePlanManager;
