/**
 * national-focus.js — 国家方針（National Focus）ツリー
 *
 * - game/eng/data/{TAG}_nf_batch*.json を解析（id/title/x/y/cost/effect/prerequisites）
 * - SVG でツリー描画：座標 (x,y)、前提条件の線引き、相互排他（mutually exclusive / group）
 * - 進行中の日数を管理。完了時に completion_reward（effect）を EffectEngine で実行
 * - すべてのノード・線にツールチップを紐付け
 */

import { el } from './util.js';
import { Tooltip } from './tooltip.js';
import { I18N } from './i18n.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const FOCUS_FILES = ['game/eng/data/ENG_nf_batch1.json',
  'game/eng/data/ENG_nf_batch2.json', 'game/eng/data/ENG_nf_batch3.json',
  'game/eng/data/ENG_nf_batch4.json', 'game/eng/data/ENG_nf_batch5.json',
  'game/eng/data/ENG_nf_batch6.json', 'game/eng/data/ENG_nf_batch7.json',
  'game/eng/data/ENG_nf_batch8.json', 'game/eng/data/ENG_nf_batch9.json',
  'game/eng/data/ENG_nf_batch10.json', 'game/eng/data/ENG_nf_batch11.json',
  'game/eng/data/ENG_nf_batch12.json', 'game/eng/data/ENG_nf_batch13.json',
  'game/eng/data/ENG_nf_batch14.json', 'game/eng/data/ENG_nf_batch15.json',
  'game/eng/data/ENG_nf_batch16.json'];

/** デフォルトフォーカスデータ（データファイル未取得時のフォールバック） */
const FALLBACK_FOCUSES = [
  { id: 'ger_rhineland', title: 'ラインラント軍事化', x: 100, y: 100, cost: 70, prerequisites: [], effect: 'add_political_power = 50', group: 'ger_rhineland' },
  { id: 'ger_anschluss', title: 'アンシュルス', x: 260, y: 100, cost: 70, prerequisites: [], effect: 'add_political_power = 50', group: 'ger_anschluss' },
  { id: 'ger_sudeten', title: 'ズデーテン合併', x: 420, y: 100, cost: 70, prerequisites: ['ger_anschluss'], effect: 'add_political_power = 50' },
  { id: 'ger_war_economy', title: '戦時経済へ移行', x: 100, y: 260, cost: 70, prerequisites: [], effect: 'add_stability = 5; add_war_support = 10' },
  { id: 'ger_total_war', title: '総力戦', x: 260, y: 260, cost: 70, prerequisites: ['ger_war_economy'], effect: 'add_political_power = 100' },
  { id: 'ger_nuclear', title: 'ウラン計画', x: 100, y: 420, cost: 140, prerequisites: ['ger_war_economy'], effect: 'nuclear_research_start = 1' },
];

export class NationalFocusManager {
  constructor(state, effectEngine) {
    this.state = state;
    this.effectEngine = effectEngine;
    this.nodes = {};       // id -> node
    this.tags = {};        // tag -> [nodes]
    this.loaded = false;
  }

  async load(tag = null) {
    const t = tag || this.state.playerTag;
    let all = [];
    try {
      const jsons = await Promise.all(FOCUS_FILES.map(async (u) => {
        try {
          const r = await fetch(u, { cache: 'no-cache' });
          return await r.json();
        } catch { return []; }
      }));
      all = jsons.flat();
    } catch { all = []; }
    if (!all.length) all = FALLBACK_FOCUSES;
    for (const n of all) this.nodes[n.id] = { ...n };
    this.tags[t] = all;
    this.loaded = true;
    return this;
  }

  nodesFor(tag) { return this.tags[tag] || []; }

  progressFor(tag) {
    if (!this.state.focus.progress[tag]) {
      this.state.focus.progress[tag] = {};
    }
    if (!this.state.focus.completed[tag]) {
      this.state.focus.completed[tag] = new Set();
    }
    return this.state.focus;
  }

  isCompleted(tag, focusId) {
    return this.state.focus.completed[tag]?.has(focusId) === true;
  }

  /** 前提条件が整っているか */
  canStart(focusId, tag) {
    const node = this.nodes[focusId];
    if (!node) return { ok: false, reason: 'unknown' };
    const prog = this.progressFor(tag);
    if (this.isCompleted(tag, focusId)) return { ok: false, reason: 'completed' };
    if (prog.active && prog.active.tag === tag && prog.active.focusId === focusId) {
      return { ok: false, reason: 'active' };
    }
    if (prog.active && prog.active.tag === tag) {
      return { ok: false, reason: 'another_active' };
    }
    for (const pre of node.prerequisites || []) {
      if (!this.isCompleted(tag, pre)) return { ok: false, reason: 'prerequisite' };
    }
    // 相互排他：同groupのいずれかが完了済みなら不可
    if (node.group) {
      const groupNodes = Object.values(this.nodes).filter((n) => n.group === node.group);
      for (const gn of groupNodes) {
        if (this.isCompleted(tag, gn.id)) return { ok: false, reason: 'exclusive' };
      }
    }
    return { ok: true };
  }

  /** フォーカスを開始 */
  start(focusId, tag) {
    const check = this.canStart(focusId, tag);
    if (!check.ok) return false;
    const node = this.nodes[focusId];
    this.state.focus.active = { focusId, tag, progressDays: 0, startDate: this.state.dateLabel };
    return true;
  }

  /** Tick: 1時間ぶん進行 */
  tick(tag, hours) {
    const prog = this.progressFor(tag);
    const active = prog.active;
    if (!active || active.tag !== tag) return;
    const node = this.nodes[active.focusId];
    if (!node) return;
    active.progressDays += hours / 24; // 1日 = 24時間
    if (active.progressDays >= node.cost) {
      this._complete(tag, active);
    }
  }

  _complete(tag, active) {
    const node = this.nodes[active.focusId];
    this.state.focus.completed[tag].add(active.focusId);
    // エフェクト実行（completion_reward）
    if (node.effect) {
      this.effectEngine.execute(node.effect, { focus: node.id, tag });
    }
    this.state.focus.active = null;
    this.state.bus.emit('focus-completed', { tag, focusId: active.focusId, node });
  }

  /** 現在アクティブなフォーカスの進行率 */
  activeProgress(tag) {
    const prog = this.progressFor(tag);
    const active = prog.active;
    if (!active || active.tag !== tag) return null;
    const node = this.nodes[active.focusId];
    if (!node) return null;
    return { node, pct: Math.min(1, active.progressDays / node.cost), daysLeft: Math.max(0, node.cost - active.progressDays) };
  }

  /** SVG ツリーを描画して container に追加 */
  render(container, tag) {
    container.innerHTML = '';
    const nodes = this.nodesFor(tag);
    if (!nodes.length) {
      container.appendChild(el('div', 'dim small', 'フォーカスデータがありません'));
      return;
    }

    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const scale = 2.6, pad = 60;
    const W = (maxX - minX + 140) * scale + pad * 2;
    const H = (maxY - minY + 140) * scale + pad * 2;

    const wrap = el('div', 'focus-wrap');
    wrap.style.position = 'relative';
    wrap.style.width = W + 'px';
    wrap.style.height = H + 'px';
    wrap.style.overflow = 'auto';
    container.appendChild(wrap);

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.style.position = 'absolute';
    svg.style.top = '0'; svg.style.left = '0';
    wrap.appendChild(svg);

    const prog = this.progressFor(tag);
    const completed = prog.completed[tag] || new Set();
    const active = prog.active;
    const pos = (n) => [pad + (n.x - minX) * scale, pad + (n.y - minY) * scale];

    // 線（前提条件）
    for (const n of nodes) {
      for (const preId of n.prerequisites || []) {
        const pn = this.nodes[preId];
        if (!pn) continue;
        const [x1, y1] = pos(pn), [x2, y2] = pos(n);
        const line = document.createElementNS(SVGNS, 'line');
        line.setAttribute('x1', x1 + 16); line.setAttribute('y1', y1 + 16);
        line.setAttribute('x2', x2 + 16); line.setAttribute('y2', y2 + 16);
        line.setAttribute('stroke', completed.has(preId) ? '#7ec850' : '#3a434d');
        line.setAttribute('stroke-width', '2');
        svg.appendChild(line);
      }
    }

    // ノード
    for (const n of nodes) {
      const [x, y] = pos(n);
      const done = completed.has(n.id);
      const isActive = active && active.tag === tag && active.focusId === n.id;
      const check = this.canStart(n.id, tag);
      const available = check.ok && !done && !isActive;

      const g = document.createElementNS(SVGNS, 'g');
      g.style.cursor = 'pointer';
      g.setAttribute('transform', `translate(${x},${y})`);

      // 相互排他グループの色付け
      let groupColor = '';
      if (n.group) {
        const h = hashStr(n.group);
        groupColor = `hsl(${h}, 70%, 55%)`;
      }

      const circle = document.createElementNS(SVGNS, 'circle');
      circle.setAttribute('r', 16);
      circle.setAttribute('fill', done ? '#14181d' : isActive ? '#1a1d24' : available ? '#161b21' : '#0e1114');
      circle.setAttribute('stroke', done ? '#7ec850' : isActive ? '#e6c268' : available ? '#3a434d' : '#2c343c');
      circle.setAttribute('stroke-width', done || isActive ? '3' : '2');
      if (groupColor) circle.setAttribute('stroke', groupColor);
      g.appendChild(circle);

      const text = document.createElementNS(SVGNS, 'text');
      text.setAttribute('x', 0); text.setAttribute('y', 4);
      text.setAttribute('fill', done ? '#7ec850' : isActive ? '#e6c268' : available ? '#d7dde2' : '#555');
      text.setAttribute('font-size', '10'); text.setAttribute('font-weight', '800');
      text.setAttribute('font-family', 'var(--mil-font)'); text.setAttribute('text-anchor', 'middle');
      text.textContent = n.id.slice(0, 4).toUpperCase();
      g.appendChild(text);

      // ツールチップ
      const tipHtml = `
        <div style="font-weight:800;letter-spacing:.06em;font-family:var(--mil-font);color:var(--gold);">${n.title}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">${n.effect || n.effect || ''}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">必要日数：${n.cost}日</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">状態：${done ? '完了' : isActive ? `進行中（${Math.round(active.progressDays)}/${n.cost}日）` : available ? '選択可能' : check.reason === 'exclusive' ? '相互排他' : '前提未完了'}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">前提：${(n.prerequisites || []).join(', ') || 'なし'}</div>
      `;
      Tooltip.bind(g, tipHtml, { kind: done ? 'good' : isActive ? 'info' : 'warn' });

      if (available || isActive) {
        g.addEventListener('click', () => {
          if (this.start(n.id, tag)) {
            this.render(container, tag);
            this.state.bus.emit('focus-started', { tag, focusId: n.id });
          }
        });
      }
      svg.appendChild(g);
    }

    Tooltip.attachAll(wrap);
    return wrap;
  }
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h % 360);
}

export default NationalFocusManager;
