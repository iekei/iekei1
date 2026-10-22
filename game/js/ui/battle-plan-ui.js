/**
 * ui/battle-plan-ui.js — 作戦計画のマップ操作 UI
 *
 * - マップ左に作戦計画パネル（軍集団・計画準備ボーナス・実行ボタン）を表示
 * - 「前線を引く」モード: 自国プロヴィンスをクリック／ドラッグで前線に追加・削除
 * - 「攻撃線を引く」モード: 敵プロヴィンスをクリックすると、前線から経路探索して
 *   攻撃線（矢印）を追加
 * - 実行中は進捗・戦闘数・計画準備ボーナスの残量をライブ表示
 * - 実際の前線/矢印の描画は map-engine.renderBattlePlans() が行う
 */

import { el } from '../util.js';
import { I18N } from '../i18n.js';
import { PROVINCE_BY_ID, neighbors } from '../map-data.js';

const MODES = {
  idle: '前線または攻撃線を選択してください',
  frontline: '自国プロヴィンスをクリック／ドラッグして前線を設定（クリックで追加・削除）',
  goal: '敵プロヴィンスをクリックして攻撃線を追加（前線から自動で経路を計算）',
};

export class BattlePlanUI {
  constructor({ mapEngine, battlePlan, state, doctrine, modals = null }) {
    this.map = mapEngine;
    this.bp = battlePlan;
    this.state = state;
    this.doctrine = doctrine;
    this.modals = modals;
    this.mode = 'idle';
    this.planId = null;
    this.painting = false;
    this.painted = new Set();
    this.pointerOrigin = null;
    this.panel = null;
    this._installPanel();
    this._installMapHandlers();
    mapEngine.planController = this;
    const plans = this.bp.plans();
    if (!plans.length) {
      const p = this.bp.createPlan({ name: '第1軍集団 作戦計画' });
      this.planId = p.id;
    } else {
      this.planId = plans[0].id;
    }
    this.render();
  }

  get plan() { return this.bp.getPlan(this.planId); }

  /* ================= パネル ================= */

  _installPanel() {
    const host = document.getElementById('map-view') || document.body;
    const panel = el('aside', 'plan-panel');
    panel.setAttribute('aria-label', '作戦計画');
    host.appendChild(panel);
    this.panel = panel;
  }

  _button(label, cls, onClick, title = '') {
    const b = el('button', `steel-btn ${cls}`.trim(), label);
    b.type = 'button';
    if (title) b.title = title;
    b.onclick = onClick;
    return b;
  }

  setMode(mode) {
    this.mode = this.mode === mode ? 'idle' : mode;
    this.map.svg.classList.toggle('plan-mode-frontline', this.mode === 'frontline');
    this.map.svg.classList.toggle('plan-mode-goal', this.mode === 'goal');
    this.render();
  }

  render() {
    const panel = this.panel;
    if (!panel) return;
    panel.innerHTML = '';

    const head = el('div', 'plan-head');
    head.appendChild(el('span', 'plan-title', '作戦計画'));
    const collapse = this._button(panel.classList.contains('collapsed') ? '▸' : '▾', 'plan-collapse', () => {
      panel.classList.toggle('collapsed');
      this.render();
    }, 'パネルの折りたたみ');
    head.appendChild(collapse);
    panel.appendChild(head);

    if (panel.classList.contains('collapsed')) return;

    const plans = this.bp.plans();
    if (!plans.length) this.planId = this.bp.createPlan({ name: '第1軍集団 作戦計画' }).id;
    if (!plans.some((p) => p.id === this.planId)) this.planId = plans[0]?.id || this.planId;
    const plan = this.plan;
    if (!plan) return;

    /* --- 軍集団選択 --- */
    const selRow = el('div', 'plan-row');
    const sel = el('select', 'steel-select plan-select');
    for (const p of plans) {
      const o = el('option', '', p.name);
      o.value = p.id;
      sel.appendChild(o);
    }
    sel.value = plan.id;
    sel.onchange = () => { this.planId = sel.value; this.render(); this.map.renderBattlePlans(); };
    selRow.appendChild(sel);
    selRow.appendChild(this._button('＋', '', () => {
      const p = this.bp.createPlan({ name: `第${plans.length + 1}軍集団 作戦計画` });
      this.planId = p.id;
      this.render();
    }, '新しい作戦計画'));
    panel.appendChild(selRow);

    const status = this.bp.status(plan);

    /* --- 計画準備ボーナス --- */
    const bonus = el('div', 'plan-bonus');
    const bonusHead = el('div', 'plan-bonus-head');
    bonusHead.appendChild(el('span', 'plan-label', '計画準備ボーナス'));
    bonusHead.appendChild(el('span', 'plan-bonus-val', `${(status.planning * 100).toFixed(1)}% / ${(status.maxPlanning * 100).toFixed(0)}%`));
    bonus.appendChild(bonusHead);
    const bar = el('div', 'plan-bar');
    const fill = el('i');
    fill.style.width = `${Math.min(100, status.planningPct * 100)}%`;
    bar.appendChild(fill);
    bonus.appendChild(bar);
    bonus.appendChild(el('div', 'plan-hint', plan.goals.length
      ? (plan.executing ? '実行中: ボーナスは消費されています' : '前線で待機中 — 時間経過でボーナスが増加します')
      : '攻撃線を引くと計画準備が始まります'));
    panel.appendChild(bonus);

    /* --- ステータス --- */
    const stats = el('div', 'plan-stats');
    const stat = (k, v, cls = '') => el('div', `plan-stat ${cls}`, `<span class="k">${k}</span><span class="v">${v}</span>`);
    stats.appendChild(stat('前線', `${status.frontline} 州`));
    stats.appendChild(stat('攻撃線', `${status.goals} 本`));
    stats.appendChild(stat('師団', `${status.divisions} 個`));
    stats.appendChild(stat('交戦中', `${status.battles} 件`, status.battles ? 'hot' : ''));
    panel.appendChild(stats);

    /* --- モードボタン --- */
    const modes = el('div', 'plan-modes');
    const frontBtn = this._button('前線を引く', `plan-mode-btn ${this.mode === 'frontline' ? 'active' : ''}`, () => this.setMode('frontline'));
    frontBtn.setAttribute('aria-pressed', String(this.mode === 'frontline'));
    const goalBtn = this._button('攻撃線を引く', `plan-mode-btn ${this.mode === 'goal' ? 'active' : ''}`, () => this.setMode('goal'));
    goalBtn.setAttribute('aria-pressed', String(this.mode === 'goal'));
    modes.appendChild(frontBtn);
    modes.appendChild(goalBtn);
    panel.appendChild(modes);
    panel.appendChild(el('div', 'plan-hint', MODES[this.mode]));

    /* --- 操作ボタン --- */
    const actions = el('div', 'plan-actions');
    actions.appendChild(this._button('前線を自動生成', '', () => {
      this.bp.autoFrontline(plan.id);
      this.bp.assignDivisions(plan.id);
      this.render();
      this.map.renderBattlePlans();
    }, '敵と隣接する自国州から前線を自動生成'));
    actions.appendChild(this._button('師団を配属', '', () => {
      this.bp.assignDivisions(plan.id);
      this.render();
      this.map.update();
    }, '利用可能な師団を前線に配置'));

    const execBtn = this._button(plan.executing ? '計画を停止' : '計画実行', plan.executing ? 'danger' : 'primary', () => {
      if (plan.executing) {
        this.bp.halt(plan.id);
      } else {
        const res = this.bp.execute(plan.id);
        if (!res.ok) {
          const msg = res.reason === 'no-goals' ? '攻撃線がありません。先に攻撃線を引いてください。'
            : res.reason === 'no-frontline' ? '前線がありません。前線を設定してください。' : '実行できません';
          this.flash(msg, true);
        }
      }
      this.render();
      this.map.renderBattlePlans();
    }, 'AIが経路に沿って師団を前進させます');
    execBtn.classList.add('plan-exec');
    actions.appendChild(execBtn);
    panel.appendChild(actions);

    /* --- 攻撃線リスト --- */
    if (plan.goals.length) {
      const list = el('div', 'plan-goals');
      list.appendChild(el('div', 'plan-label', '攻撃線'));
      for (const g of plan.goals) {
        const target = PROVINCE_BY_ID[g.targetId];
        const row = el('div', `plan-goal ${g.done ? 'done' : ''}`);
        row.appendChild(el('span', 'plan-goal-name', target?.name || g.targetId));
        row.appendChild(el('span', 'plan-goal-meta', `${(PROVINCE_BY_ID[g.fromId]?.name || '')} → ${g.path.length}州`));
        const del = this._button('✕', 'plan-goal-del', (e) => {
          e.stopPropagation();
          this.bp.removeGoal(plan.id, g.id);
          this.render();
          this.map.renderBattlePlans();
        }, '攻撃線を削除');
        row.appendChild(del);
        list.appendChild(row);
      }
      panel.appendChild(list);
    }

    /* --- メッセージ --- */
    const msg = el('div', 'plan-message');
    msg.textContent = plan.lastMessage || '';
    panel.appendChild(msg);

    // 国土の再描画が必要な場合（占領）に備えて色を更新
    this.map.refreshProvinceColors?.();
  }

  flash(text, bad = false) {
    if (!this.panel) return;
    let box = this.panel.querySelector('.plan-flash');
    if (!box) { box = el('div', 'plan-flash'); this.panel.appendChild(box); }
    box.textContent = text;
    box.classList.toggle('bad', bad);
    box.classList.add('show');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => box.classList.remove('show'), 2800);
  }

  /* ================= マップ操作 ================= */

  _provinceFromEvent(e) {
    const target = e.target?.closest?.('.map-province');
    return target?.dataset?.province || null;
  }

  _installMapHandlers() {
    const svg = this.map.svg;

    const onDown = (e) => {
      if (this.mode === 'idle') return;
      const id = this._provinceFromEvent(e);
      if (!id) return;
      e.stopPropagation();
      const plan = this.plan;
      if (!plan) return;

      if (this.mode === 'frontline') {
        this.painting = true;
        this.painted = new Set([id]);
        const res = this.bp.toggleFrontlineProvince(plan.id, id);
        if (!res.ok) this.flash(res.reason === 'not-owned' ? '自国のプロヴィンスのみ前線に設定できます' : '設定できません', true);
        this.render();
        this.map.renderBattlePlans();
      } else if (this.mode === 'goal') {
        this.pointerOrigin = id;
        this.painting = true;
        this.painted = new Set([id]);
        const res = this.bp.addGoal(plan.id, id);
        if (!res.ok) {
          const msg = res.reason === 'already-owned' ? '自国領には攻撃線を引けません'
            : res.reason === 'no-path' ? '陸路で到達できる経路がありません'
            : res.reason === 'too-many' ? '攻撃線は最大4本です'
            : res.reason === 'duplicate' ? '既に同じ目標の攻撃線があります' : '攻撃線を追加できません';
          this.flash(msg, true);
        } else {
          this.map.highlightProvince?.(id, '#e6c268');
        }
        this.render();
        this.map.renderBattlePlans();
      }
    };

    // ドラッグで前線を塗る / 攻撃線を伸ばす
    const onOver = (e) => {
      if (!this.painting) return;
      const id = this._provinceFromEvent(e);
      if (!id || this.painted.has(id)) return;
      this.painted.add(id);
      const plan = this.plan;
      if (!plan) return;

      if (this.mode === 'frontline') {
        const res = this.bp.setFrontline(plan.id, [...plan.frontline, id]);
        if (!res.ok) return;
        this.render();
        this.map.renderBattlePlans();
        return;
      }

      // 攻撃線モード: ドラッグした敵州を順に目標へ追加（最大本数まで）
      if (this.mode === 'goal') {
        if (this.bp.isFriendlyProvince(id, plan.tag)) return;
        if (plan.goals.length >= 4) return;
        const res = this.bp.addGoal(plan.id, id);
        if (res.ok) {
          this.map.highlightProvince?.(id, '#e6c268');
          this.render();
          this.map.renderBattlePlans();
        }
      }
    };

    const onUp = () => { this.painting = false; this.pointerOrigin = null; };

    svg.addEventListener('pointerdown', onDown, true);
    svg.addEventListener('pointermove', onOver);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointerleave', onUp);

    // マウスが離れた場所で終了した場合
    window.addEventListener('pointerup', onUp);
  }

  /** マップの州クリックを横取り（外交ウィンドウを開かない） */
  handleClick(provinceId) {
    if (this.mode === 'idle') return false;
    if (this.mode === 'goal') {
      const plan = this.plan;
      if (!plan) return false;
      if (this.bp.isFriendlyProvince(provinceId, plan.tag)) {
        // 前線州を起点確認のみ
        this.flash('前線州を起点に、敵プロヴィンスをクリックしてください');
        return true;
      }
      // クリックでも攻撃線を追加（ドラッグ/タッチ/キーボード操作のフォールバック）
      const res = this.bp.addGoal(plan.id, provinceId);
      if (!res.ok && res.reason !== 'duplicate') {
        const msg = res.reason === 'already-owned' ? '自国領には攻撃線を引けません'
          : res.reason === 'no-path' ? '陸路で到達できる経路がありません'
          : res.reason === 'too-many' ? '攻撃線は最大4本です' : '攻撃線を追加できません';
        this.flash(msg, true);
      }
      this.render();
      this.map.renderBattlePlans();
      return true;
    }
    if (this.mode === 'frontline') {
      const plan = this.plan;
      if (!plan) return true;
      if (!this.bp.isFriendlyProvince(provinceId, plan.tag)) {
        this.flash('自国（同盟国）のプロヴィンスを選択してください', true);
        return true;
      }
      return true;
    }
    return false;
  }

  /** Tick 毎の更新（パネルの再描画とマップ再描画） */
  update() {
    this.render();
    this.map.renderBattlePlans();
  }
}

export function installBattlePlanUI(opts) {
  return new BattlePlanUI(opts);
}

export default installBattlePlanUI;
