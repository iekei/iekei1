/**
 * ui/supply-ui.js — 建設画面の「州インフラ・補給ハブ」パネル
 *
 *  ・州ごとのインフラ（0〜5）と補給ハブ（0〜3）
 *  ・建設スロット（最大 3）と建設予約 / 進捗 / 取り消し
 *  ・補給容量・需要・充足率・ペナルティの表示
 *  ・「マップで補給網を見る」でマップを補給モードへ切り替え
 */

import { el, img, fmt, toast } from '../util.js';
import { PROVINCES, PROVINCE_BY_ID, terrainInfo } from '../map-data.js';
import {
  SUPPLY, SUPPLY_BUILDINGS, SUPPLY_STATUS_COLOR, SUPPLY_STATUS_LABEL,
} from '../supply.js';

const STATUS_ORDER = { critical: 0, low: 1, ok: 2, none: 3 };

function sectionTitle(text) { return el('div', 'section-title', text); }
function led(cls) { return el('span', `led ${cls}`); }
const nf = (n) => Number(n || 0).toLocaleString('ja-JP');
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

function statusOf(supply, provinceId) {
  return supply.statusFor(provinceId) || null;
}

export function renderSupplyConstruction(ctx) {
  return (container) => {
    const state = ctx.state;
    const supply = ctx.supply || state?._supplyMgr;
    const economy = ctx.economy;
    container.classList.add('sup-panel');
    container.innerHTML = '';

    if (!state || !supply) {
      container.appendChild(el('div', 'sup-empty', '補給システムが初期化されていません'));
      return;
    }

    let filter = 'all';
    let lastQueueLen = -1;

    const root = el('div', 'sup-root');
    container.appendChild(root);
    const head = el('div', 'sup-head');
    const listWrap = el('div', 'sup-list-wrap');
    const cards = el('div', 'sup-cards');
    listWrap.appendChild(cards);
    const queueWrap = el('div', 'sup-queue-wrap');

    const ownedProvinces = () => PROVINCES.filter((p) => p.tag === state.playerTag);

    /* ============================================================
     * ヘッダー（首都・ハブ・状態サマリー）
     * ========================================================== */

    function mapModeButton() {
      const b = el('button', 'steel-btn primary sup-map-btn', '🗺 マップで補給網を見る');
      b.type = 'button';
      b.title = 'マップを補給モードに切り替え、補給網の色（緑/黄/赤）を確認します';
      b.addEventListener('click', () => {
        if (ctx.mapEngine?.setMode) {
          ctx.mapEngine.setMode('supply');
          ctx.modals?.close('construction');
          toast('マップを補給モードに切り替えました', 'info');
          try { ctx.mapEngine.update(); } catch { /* ignore */ }
        } else {
          toast('マップが初期化されていません', 'bad');
        }
      });
      return b;
    }

    function drawHead() {
      const net = supply.network();
      const sum = net?.summary || {};
      const owned = ownedProvinces();
      const avgInfra = owned.length
        ? r1(owned.reduce((s, p) => s + supply.infra(p.id), 0) / owned.length)
        : 0;
      const hubs = owned.filter((p) => supply.hasHub(p.id)).length;
      const capital = PROVINCES.find((p) => p.tag === state.playerTag && p.capital);

      head.innerHTML = '';
      const left = el('div', 'sup-head-left');
      const title = el('div', 'sup-title');
      title.appendChild(el('span', 'sup-title-main', '州のインフラ・補給ハブ'));
      title.appendChild(el('span', 'sup-title-sub', 'SUPPLY NETWORK ＆ HUBS'));
      left.appendChild(title);
      const chips = el('div', 'sup-chips');
      const chip = (label, value, cls = '') => {
        const c = el('div', `sup-chip ${cls}`);
        c.appendChild(el('span', 'k', label));
        c.appendChild(el('b', '', value));
        return c;
      };
      chips.appendChild(chip('首都', capital?.name || '—'));
      chips.appendChild(chip('平均インフラ', `Lv${avgInfra}`));
      chips.appendChild(chip('補給ハブ', `${hubs} 州`));
      chips.appendChild(chip('民需工場（空き）', `${economy?.availableCivilianFactories?.() ?? '—'} / ${state.factories?.civ ?? '—'}`));
      chips.appendChild(chip('建設中', `${(state.constructionQueue || []).length} 件`));
      left.appendChild(chips);
      head.appendChild(left);

      const right = el('div', 'sup-head-right');
      const statusBar = el('div', 'sup-status-bar');
      const addStatus = (status) => {
        const item = el('div', `sup-status-item ${status}`);
        item.appendChild(led(status === 'ok' ? 'green' : status === 'low' ? 'yellow' : 'red'));
        item.appendChild(el('span', '', SUPPLY_STATUS_LABEL[status]));
        item.appendChild(el('b', '', String(sum[status] || 0)));
        item.title = `補給状態「${SUPPLY_STATUS_LABEL[status]}」の州数`;
        return item;
      };
      statusBar.appendChild(addStatus('ok'));
      statusBar.appendChild(addStatus('low'));
      statusBar.appendChild(addStatus('critical'));
      right.appendChild(statusBar);
      const cap = el('div', 'sup-capacity');
      cap.appendChild(el('span', '', `総容量 ${sum.totalCapacity || 0}`));
      cap.appendChild(el('span', 'sep', '／'));
      cap.appendChild(el('span', '', `総需要 ${sum.totalDemand || 0}`));
      if (sum.unsuppliedDivisions) {
        cap.appendChild(el('span', 'sup-warn', `補給不足の師団 ${sum.unsuppliedDivisions}`));
      }
      right.appendChild(cap);
      right.appendChild(mapModeButton());
      head.appendChild(right);
    }

    /* ============================================================
     * フィルタ
     * ========================================================== */

    function drawToolbar() {
      const bar = el('div', 'sup-toolbar');
      const tabs = el('div', 'sup-filter');
      const mk = (id, label, title) => {
        const b = el('button', `sup-filter-btn${filter === id ? ' active' : ''}`, label);
        b.type = 'button';
        b.title = title;
        b.addEventListener('click', () => { filter = id; drawAll(); });
        return b;
      };
      tabs.appendChild(mk('all', '全州', '自国のすべての州'));
      tabs.appendChild(mk('shortage', '補給不足のみ', '容量が需要を下回っている州のみ'));
      tabs.appendChild(mk('hub', '補給ハブのみ', '補給ハブがある州のみ'));
      bar.appendChild(tabs);
      const hint = el('div', 'sup-toolbar-hint', `建設スロット: 1 州あたり最大 ${SUPPLY.BUILD_SLOTS} ／ インフラ Lv${SUPPLY.INFRA_MAX}・補給ハブ Lv${SUPPLY.HUB_MAX}`);
      bar.appendChild(hint);
      return bar;
    }

    /* ============================================================
     * 州カード
     * ========================================================== */

    function pips(level, max, kind) {
      const wrap = el('div', `sup-pips ${kind}`);
      for (let i = 0; i < max; i++) {
        const pip = el('span', `sup-pip${i < level ? ' on' : ''}`);
        if (i < level) pip.style.background = kind === 'hub' ? 'linear-gradient(180deg,#f0d48a,#9a7b3a)' : 'linear-gradient(180deg,#a8c072,#5d6d3c)';
        wrap.appendChild(pip);
      }
      return wrap;
    }

    function buildButton(province, type) {
      const def = SUPPLY_BUILDINGS[type];
      const level = type === 'infrastructure' ? supply.infra(province.id) : supply.hubLevel(province.id);
      const chk = supply.canBuild(province.id, type);
      const label = level >= def.maxLevel
        ? `${def.name} Lv${level}（最大）`
        : type === 'infrastructure'
          ? (level === 0 ? 'インフラ建設' : `インフラ Lv${level}→${level + 1}`)
          : (level === 0 ? '補給ハブ建設' : `ハブ Lv${level}→${level + 1}`);
      const b = el('button', `steel-btn sup-build-btn ${type === 'supply_hub' ? 'gold' : ''}`, label);
      b.type = 'button';
      if (!chk.ok) {
        b.disabled = true;
        b.title = chk.reason;
      } else {
        b.title = `工期 約${chk.days}日（民需工場を使用）／ 建設後に Lv${chk.targetLevel} へ`;
      }
      b.addEventListener('click', () => {
        const r = supply.enqueue(province.id, type);
        if (!r.ok) {
          toast(`${def.name}: ${r.reason}`, 'bad');
          return;
        }
        toast(`${province.name} の${def.name}建設を予約しました（約${r.days}日）`, 'good');
        drawAll();
      });
      return b;
    }

    function queueItem(order) {
      const row = el('div', 'sup-q');
      row.dataset.buildId = order.id;
      const top = el('div', 'sup-q-top');
      top.appendChild(el('span', 'sup-q-name', order.label || order.def?.name || order.type));
      top.appendChild(el('span', 'sup-q-days', `${Math.max(0, Math.ceil((order.days || 0) - (order.progress || 0)))} 日`));
      row.appendChild(top);
      const bar = el('div', 'mil-bar sup-q-bar');
      const fill = el('i', 'sup-q-fill');
      fill.style.width = `${Math.min(100, ((order.progress || 0) / (order.days || 1)) * 100)}%`;
      bar.appendChild(fill);
      const pct = el('b', 'sup-q-pct', `${Math.round(((order.progress || 0) / (order.days || 1)) * 100)}%`);
      bar.appendChild(pct);
      row.appendChild(bar);
      const cancel = el('button', 'sup-q-cancel', '✕');
      cancel.type = 'button';
      cancel.title = '建設を中止';
      cancel.addEventListener('click', () => {
        const r = supply.cancel(order.id);
        if (r.ok) {
          toast(`${order.label || order.type} の建設を中止しました`, 'info');
          drawAll();
        }
      });
      row.appendChild(cancel);
      return row;
    }

    function provinceCard(p) {
      const st = statusOf(supply, p.id);
      const status = st?.status || 'none';
      const color = SUPPLY_STATUS_COLOR[status] || SUPPLY_STATUS_COLOR.none;
      const card = el('div', `sup-card status-${status}`);
      card.style.setProperty('--sup-color', color);

      const top = el('div', 'sup-card-top');
      const nameWrap = el('div', 'sup-card-name');
      const name = el('div', 'sup-name', p.name);
      if (p.capital) name.appendChild(el('span', 'sup-capital-badge', '首都'));
      nameWrap.appendChild(name);
      const sub = el('div', 'sup-sub');
      sub.appendChild(el('span', '', `VP ${p.vp || 0}`));
      sub.appendChild(el('span', 'sep', '・'));
      sub.appendChild(el('span', '', terrainInfo(p.terrain).name));
      if (st?.hubSource && st.hubSource !== p.id) {
        sub.appendChild(el('span', 'sep', '・'));
        sub.appendChild(el('span', '', `供給元 ${PROVINCE_BY_ID[st.hubSource]?.name || st.hubSource}`));
      }
      nameWrap.appendChild(sub);
      top.appendChild(nameWrap);

      const badge = el('div', `sup-status-badge ${status}`);
      badge.appendChild(led(status === 'ok' ? 'green' : status === 'low' ? 'yellow' : status === 'critical' ? 'red' : 'off'));
      badge.appendChild(el('span', '', SUPPLY_STATUS_LABEL[status]));
      if (st && st.demand > 0) {
        badge.appendChild(el('b', '', `${Math.round(Math.min(1, st.ratio) * 100)}%`));
      }
      top.appendChild(badge);
      card.appendChild(top);

      /* レベル行 */
      const levels = el('div', 'sup-levels');
      const infraRow = el('div', 'sup-level-row');
      const infraLabel = el('div', 'sup-level-label');
      infraLabel.appendChild(el('span', '', 'インフラ'));
      infraLabel.appendChild(el('b', '', `${supply.infra(p.id)} / ${SUPPLY.INFRA_MAX}`));
      infraRow.appendChild(infraLabel);
      infraRow.appendChild(pips(supply.infra(p.id), SUPPLY.INFRA_MAX, 'infra'));
      infraRow.appendChild(buildButton(p, 'infrastructure'));
      levels.appendChild(infraRow);

      const hubRow = el('div', 'sup-level-row');
      const hubLabel = el('div', 'sup-level-label');
      hubLabel.appendChild(el('span', '', '補給ハブ'));
      hubLabel.appendChild(el('b', '', supply.hubLevel(p.id) > 0 ? `${supply.hubLevel(p.id)} / ${SUPPLY.HUB_MAX}` : 'なし'));
      hubRow.appendChild(hubLabel);
      hubRow.appendChild(pips(supply.hubLevel(p.id), SUPPLY.HUB_MAX, 'hub'));
      hubRow.appendChild(buildButton(p, 'supply_hub'));
      levels.appendChild(hubRow);
      card.appendChild(levels);

      /* 補給数値 */
      if (st) {
        const metrics = el('div', 'sup-metrics');
        const metric = (label, value, cls = '') => {
          const m = el('div', `sup-metric ${cls}`);
          m.appendChild(el('span', 'k', label));
          m.appendChild(el('b', '', value));
          return m;
        };
        metrics.appendChild(metric('容量', String(st.capacity)));
        metrics.appendChild(metric('需要', st.demand > 0 ? String(st.demand) : '—', st.demand > st.capacity ? 'bad' : ''));
        metrics.appendChild(metric('師団', String(st.divisions)));
        metrics.appendChild(metric('充足率', st.demand > 0 ? `${Math.round(Math.min(1, st.ratio) * 100)}%` : '—', st.status === 'critical' ? 'bad' : st.status === 'low' ? 'warn' : 'good'));
        card.appendChild(metrics);

        if (st.demand > 0 && st.ratio < 1) {
          const pen = st.penalties;
          const penalty = el('div', 'sup-penalty');
          penalty.appendChild(el('span', 'sup-penalty-title', '補給不足ペナルティ'));
          penalty.appendChild(el('span', '', `速度 -${Math.round((1 - pen.speed) * 100)}%`));
          penalty.appendChild(el('span', '', `戦闘力 -${Math.round((1 - pen.combat) * 100)}%`));
          penalty.appendChild(el('span', '', `組織率 -${Math.round((1 - pen.org) * 100)}%`));
          card.appendChild(penalty);
        }
      }

      /* 建設スロット + 予約 */
      const queued = supply.queueFor(p.id);
      const slotRow = el('div', 'sup-slots');
      slotRow.appendChild(el('span', 'sup-slot-label', `建設スロット ${queued.length} / ${SUPPLY.BUILD_SLOTS}`));
      const slotPips = el('div', 'sup-slot-pips');
      for (let i = 0; i < SUPPLY.BUILD_SLOTS; i++) {
        slotPips.appendChild(el('span', `sup-slot-pip${i < queued.length ? ' used' : ''}`));
      }
      slotRow.appendChild(slotPips);
      card.appendChild(slotRow);

      if (queued.length) {
        const q = el('div', 'sup-card-queue');
        for (const order of queued) q.appendChild(queueItem(order));
        card.appendChild(q);
      }
      return card;
    }

    function drawCards() {
      const owned = ownedProvinces().slice();
      const list = owned.filter((p) => {
        const st = statusOf(supply, p.id);
        if (filter === 'shortage') return st && st.demand > 0 && st.ratio < 1;
        if (filter === 'hub') return supply.hasHub(p.id);
        return true;
      });
      list.sort((a, b) => {
        const sa = statusOf(supply, a.id)?.status || 'none';
        const sb = statusOf(supply, b.id)?.status || 'none';
        const diff = (STATUS_ORDER[sa] ?? 9) - (STATUS_ORDER[sb] ?? 9);
        if (diff) return diff;
        if (a.capital !== b.capital) return a.capital ? -1 : 1;
        return (b.vp || 0) - (a.vp || 0);
      });
      cards.innerHTML = '';
      if (!list.length) {
        cards.appendChild(el('div', 'sup-empty', filter === 'shortage'
          ? '補給不足の州はありません（すべての州で容量が需要を満たしています）'
          : '対象となる州がありません'));
        return;
      }
      for (const p of list) cards.appendChild(provinceCard(p));
    }

    /* ============================================================
     * 全建設キュー（インフラ / ハブ以外も含む）
     * ========================================================== */

    function drawQueue() {
      queueWrap.innerHTML = '';
      const queue = state.constructionQueue || [];
      if (!queue.length) return;
      const headRow = el('div', 'sup-queue-head');
      headRow.appendChild(sectionTitle('建設キュー（全国）'));
      headRow.appendChild(el('span', 'sup-queue-count', `${queue.length} 件`));
      queueWrap.appendChild(headRow);
      const list = el('div', 'sup-queue-list');
      for (const order of queue) {
        const row = el('div', 'sup-queue-row');
        row.dataset.buildId = order.id;
        const label = order.provinceId
          ? order.label
          : (order.def?.name || order.type);
        const name = el('div', 'sup-queue-name', label);
        if (order.provinceId) {
          const p = PROVINCE_BY_ID[order.provinceId];
          if (p) name.title = `${p.name} / ${order.def?.name || order.type}`;
        }
        row.appendChild(name);
        const bar = el('div', 'mil-bar sup-queue-bar');
        const fill = el('i', 'sup-q-fill');
        fill.style.width = `${Math.min(100, ((order.progress || 0) / (order.days || 1)) * 100)}%`;
        bar.appendChild(fill);
        const pct = el('b', 'sup-q-pct', `${Math.round(((order.progress || 0) / (order.days || 1)) * 100)}%`);
        bar.appendChild(pct);
        row.appendChild(bar);
        const days = el('div', 'sup-queue-days', `残り ${Math.max(0, Math.ceil((order.days || 0) - (order.progress || 0)))} 日`);
        row.appendChild(days);
        if (order.provinceId) {
          const cancel = el('button', 'sup-q-cancel', '✕');
          cancel.type = 'button';
          cancel.title = '建設を中止';
          cancel.addEventListener('click', () => {
            const r = supply.cancel(order.id);
            if (r.ok) { toast('建設を中止しました', 'info'); drawAll(); }
          });
          row.appendChild(cancel);
        } else {
          row.appendChild(el('span', 'sup-queue-lock', '—'));
        }
        list.appendChild(row);
      }
      queueWrap.appendChild(list);
    }

    /* ============================================================
     * 進捗のライブ更新
     * ========================================================== */

    function updateProgressBars() {
      const queue = state.constructionQueue || [];
      if (queue.length !== lastQueueLen) {
        lastQueueLen = queue.length;
        drawAll();
        return;
      }
      const byId = new Map(queue.map((q) => [q.id, q]));
      for (const node of root.querySelectorAll('[data-build-id]')) {
        const order = byId.get(node.dataset.buildId);
        if (!order) continue;
        const pct = Math.min(100, ((order.progress || 0) / (order.days || 1)) * 100);
        const fill = node.querySelector('.sup-q-fill');
        if (fill) fill.style.width = `${pct}%`;
        const pctText = node.querySelector('.sup-q-pct');
        if (pctText) pctText.textContent = `${Math.round(pct)}%`;
        const days = node.querySelector('.sup-q-days, .sup-queue-days');
        if (days) {
          const left = Math.max(0, Math.ceil((order.days || 0) - (order.progress || 0)));
          days.textContent = days.classList.contains('sup-queue-days') ? `残り ${left} 日` : `${left} 日`;
        }
      }
    }

    function drawAll() {
      drawHead();
      root.innerHTML = '';
      root.appendChild(head);
      root.appendChild(drawToolbar());
      root.appendChild(listWrap);
      root.appendChild(queueWrap);
      drawCards();
      drawQueue();
      lastQueueLen = (state.constructionQueue || []).length;
    }

    drawAll();

    /* ライブ更新（モーダルが閉じたら自動停止） */
    const offs = [];
    if (state.bus?.on) {
      const refresh = () => { if (container.isConnected) drawAll(); };
      offs.push(state.bus.on('construction-completed', refresh));
      offs.push(state.bus.on('supply-buildings-changed', refresh));
      offs.push(state.bus.on('construction-queued', refresh));
      offs.push(state.bus.on('construction-cancelled', refresh));
      offs.push(state.bus.on('supply-changed', () => {
        if (!container.isConnected) return;
        // 状態が変わったらカードの色・数値だけ更新（スクロール位置を保持）
        drawCards();
        drawHead();
      }));
    }
    const timer = setInterval(() => {
      if (!container.isConnected) {
        clearInterval(timer);
        offs.forEach((off) => { try { off(); } catch { /* ignore */ } });
        return;
      }
      updateProgressBars();
    }, 1000);
  };
}
