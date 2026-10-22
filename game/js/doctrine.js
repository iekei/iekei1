/**
 * doctrine.js — ドクトリン（学説）マネージャ
 *
 * - 陸・海・空の3系統、各系統は相互排他ルート（HOI4 の doctrine tree）
 * - 研究枠ではなく「陸軍/海軍/空軍経験値（XP）」を消費してノードを解禁
 * - ルート選択は不可逆: 他ルートのノードは恒久的にロック
 * - 集計した効果を師団ステータス・戦闘計算・計画準備ボーナスへ適用
 */

import { I18N } from './i18n.js';
import { toast } from './util.js';
import {
  DOCTRINE_TREES, DOCTRINE_ROUTES, nodesOf, findDoctrineNode,
  aggregateDoctrineEffects, aggregateAllDoctrineEffects, routeStates,
} from './data/doctrines.js';

const BRANCHES = ['land', 'naval', 'air'];
const XP_KEY = { land: 'army', naval: 'navy', air: 'air' };

export class DoctrineManager {
  constructor(state) {
    this.state = state;
    // state.doctrine = { xp, unlocked, assigned, route } — route は後方互換のため遅延初期化
    if (!this.state.doctrine.route) this.state.doctrine.route = { land: null, naval: null, air: null };
  }

  branches() { return BRANCHES; }

  branchName(branch) { return I18N.t(`doctrine.branches.${branch}`); }

  /** ノード名（ja.json 優先、なければデータ内の name、最後に ID） */
  nodeName(nodeId) {
    const name = I18N.doctrineName(nodeId);
    if (name && name !== nodeId) return name;
    for (const branch of BRANCHES) {
      const n = findDoctrineNode(branch, nodeId);
      if (n?.name) return n.name;
    }
    return nodeId;
  }

  /** ノード説明 */
  nodeDesc(nodeId) {
    const desc = I18N.doctrineDesc(nodeId);
    if (desc) return desc;
    for (const branch of BRANCHES) {
      const n = findDoctrineNode(branch, nodeId);
      if (n?.desc) return n.desc;
      if (n?.effects) {
        return Object.entries(n.effects)
          .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`)
          .join(' / ');
      }
    }
    return '';
  }

  nodes(branch) { return nodesOf(branch); }

  routes(branch) { return DOCTRINE_ROUTES[branch] || []; }

  selectedRoute(branch) { return this.state.doctrine.route[branch] || null; }

  routeStates(branch) {
    return routeStates(branch, this.selectedRoute(branch), this.unlocked(branch));
  }

  /** 系統の経験値。state.xp（army/navy/air）を正とし、doctrine.xp はミラー */
  xp(branch) {
    const key = XP_KEY[branch];
    const live = this.state.xp?.[key];
    if (Number.isFinite(live)) return live;
    return this.state.doctrine.xp[branch] || 0;
  }

  /** 経験値を両方のストアへ書き込む */
  _setXP(branch, value) {
    const v = Math.max(0, Math.round(value * 10) / 10);
    this.state.doctrine.xp[branch] = v;
    const key = XP_KEY[branch];
    if (this.state.xp && key in this.state.xp) this.state.xp[key] = v;
    return v;
  }

  unlocked(branch) {
    if (!this.state.doctrine.unlocked[branch]) this.state.doctrine.unlocked[branch] = new Set();
    return this.state.doctrine.unlocked[branch];
  }

  /* ================= ルート選択 ================= */

  /** ルート選択（不可逆）。既にノードを取得済みの場合は変更不可 */
  pickRoute(branch, routeId) {
    if (!this.routes(branch).some((r) => r.id === routeId)) return { ok: false, reason: 'unknown-route' };
    const current = this.selectedRoute(branch);
    if (current === routeId) return { ok: false, reason: 'already' };
    if (current) return { ok: false, reason: 'locked', current };
    if (this.unlocked(branch).size > 0) return { ok: false, reason: 'progress' };
    this.state.doctrine.route[branch] = routeId;
    const route = this.routes(branch).find((r) => r.id === routeId);
    toast(`${this.branchName(branch)}ドクトリン: 「${route.name}」を選択しました（他ルートはロック）`, 'good');
    this.state.bus.emit('doctrine-route-selected', { branch, routeId });
    this.state.bus.emit('doctrine-changed', { branch, routeId });
    return { ok: true };
  }

  /* ================= 取得判定 ================= */

  /** 取得可能か（前提充足・相互排他・ルート・XP） */
  canTake(branch, nodeId) {
    const node = findDoctrineNode(branch, nodeId);
    if (!node) return { ok: false, reason: 'unknown' };
    const un = this.unlocked(branch);
    if (un.has(nodeId)) return { ok: false, reason: 'taken' };
    const route = this.selectedRoute(branch);
    if (route && node.route !== route) return { ok: false, reason: 'route-locked', selectedRoute: route };
    if (this.xp(branch) < node.cost) return { ok: false, reason: 'xp', needed: node.cost, have: this.xp(branch) };
    if (node.group && [...un].some((id) => findDoctrineNode(branch, id)?.group === node.group)) {
      return { ok: false, reason: 'exclusive' };
    }
    const reqs = node.requires || [];
    if (reqs.length) {
      const satisfied = node.anyRequires
        ? reqs.some((r) => un.has(r))
        : reqs.every((r) => un.has(r));
      if (!satisfied) return { ok: false, reason: 'requires', missing: reqs.filter((r) => !un.has(r)) };
    }
    return { ok: true };
  }

  take(branch, nodeId) {
    const check = this.canTake(branch, nodeId);
    if (!check.ok) return check;
    const node = findDoctrineNode(branch, nodeId);
    // ルート未選択なら、このノードのルートを自動選択（HOI4 と同じ挙動）
    if (!this.selectedRoute(branch)) {
      this.state.doctrine.route[branch] = node.route;
      this.state.bus.emit('doctrine-route-selected', { branch, routeId: node.route });
    }
    this._setXP(branch, this.xp(branch) - node.cost);
    this.unlocked(branch).add(nodeId);
    toast(`${this.nodeName(nodeId)} を習得しました（${this.branchName(branch)} XP -${node.cost}）`, 'good');
    this.state.bus.emit('doctrine-changed', { branch, nodeId });
    return { ok: true, node };
  }

  /** 経験値の付与（戦闘・訓練・国家方針報酬などから） */
  addXP(branch, amount) {
    if (!BRANCHES.includes(branch) || !Number.isFinite(amount) || amount === 0) return 0;
    const before = this.xp(branch);
    const total = this._setXP(branch, before + amount);
    this.state.bus.emit('doctrine-xp', { branch, amount, total });
    return total - before;
  }

  /* ================= 効果 ================= */

  effects(branch) {
    return aggregateDoctrineEffects(branch, this.unlocked(branch));
  }

  /** 全系統の合算効果 */
  allEffects() {
    return aggregateAllDoctrineEffects(this.state.doctrine);
  }

  /**
   * 師団ステータスへドクトリン補正を適用（乗算系）
   * @param {{softAttack,hardAttack,defense,breakthrough,armor,piercing,maxOrg}} stats
   * @param {'land'|'land'} branch
   */
  applyToDivisionStats(stats, branch = 'land') {
    const e = this.effects(branch);
    const mul = (v, k) => Math.round((v || 0) * (1 + (e[k] || 0)) * 10) / 10;
    return {
      ...stats,
      softAttack: mul(stats.softAttack, 'soft'),
      hardAttack: mul(stats.hardAttack, 'hard'),
      defense: mul(stats.defense, 'defense'),
      breakthrough: mul(stats.breakthrough, 'breakthrough'),
      armor: mul(stats.armor, 'armor'),
      piercing: mul(stats.piercing, 'piercing'),
      maxOrg: Math.round((stats.maxOrg ?? stats.org ?? 0) * (1 + (e.org || 0)) * 10) / 10,
    };
  }

  /** 計画準備ボーナスの上限（基本 30% + ドクトリン） */
  maxPlanningBonus() {
    const e = this.effects('land');
    return Math.min(0.60, 0.30 + (e.maxPlanning || 0));
  }

  /** 計画準備の伸び率（基本 1.0 + ドクトリン） */
  planningSpeedMultiplier() {
    return 1 + (this.effects('land').planningSpeed || 0);
  }

  /** 集計効果の表示用配列 */
  effectSummary(branch) {
    return Object.entries(this.effects(branch))
      .filter(([, v]) => Math.abs(v) > 1e-9)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }

  /** 軍集団（グループ）への割り当て: プレースホルダとして1グループ保持 */
  assign(branch, groupName) { this.state.doctrine.assigned[branch] = groupName; }

  /* ================= Tick ================= */

  /** Tick: 経験値の獲得（訓練・戦闘の代替として時間経過で蓄積） */
  tick(branch, hours) {
    // 1日あたり +1.2 XP（陸軍は師団数に応じて微増）。戦闘・方針報酬が主な収入源。
    const divisions = (this.state.divisions || []).filter((d) => !d.tag || d.tag === this.state.playerTag).length;
    const perDay = branch === 'land' ? 1.2 + divisions * 0.02 : 0.8;
    const before = this.xp(branch);
    const total = this._setXP(branch, before + (hours / 24) * perDay);
    if (total !== before) this.state.bus.emit('doctrine-xp', { branch, amount: total - before, total });
  }
}

export default DoctrineManager;
