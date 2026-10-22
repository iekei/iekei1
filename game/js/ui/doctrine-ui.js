/**
 * ui/doctrine-ui.js — ドクトリンツリー画面
 *
 * - 陸軍 / 海軍 / 空軍 のタブ。XP（陸軍経験値など）を消費してノードを解禁
 * - ルート（人的資源波／機動戦／大規模戦計画／優勢火力 …）は相互排他。
 *   ひとつ選ぶと他ルートはロックされる（不可逆）。
 * - ツリーは SVG の接続線 + HTML ノードで描画。アイコンは
 *   game/assets/doctrine/{land,naval,air}/*.png を <img> で読み込む。
 * - 取得済み効果はグローバル補正として右下に集計表示される。
 */

import { el, img } from '../util.js';
import { I18N } from '../i18n.js';
import { sectionTitle } from './screens.js';
import {
  DOCTRINE_ROUTES, DOCTRINE_EFFECT_LABELS, formatDoctrineEffect,
} from '../data/doctrines.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const NODE_W = 96;
const NODE_H = 108;
const COL_W = 178;
const ROW_H = 132;
const PAD = 56;

export function renderDoctrineScreen(ctx) {
  return (body) => {
    const { state, doctrine } = ctx;
    body.innerHTML = '';
    let branch = 'land';
    let selectedNodeId = null;
    let treeHost = null;

    const tabs = el('div', 'screen-tabs doc-tabs');
    const content = el('div', 'col doc-content');
    content.style.gap = '12px';
    body.appendChild(tabs);
    body.appendChild(content);

    /* ---------- ヘッダー（XP・ルート選択） ---------- */
    const drawTabs = () => {
      tabs.innerHTML = '';
      for (const b of doctrine.branches()) {
        const route = doctrine.selectedRoute(b);
        const routeName = route ? (DOCTRINE_ROUTES[b].find((r) => r.id === route)?.name || route) : 'ルート未選択';
        const btn = el('button', `screen-tab ${branch === b ? 'active' : ''}`);
        btn.appendChild(el('span', 'doc-tab-name', I18N.t(`doctrine.branches.${b}`)));
        btn.appendChild(el('span', 'doc-tab-xp', `XP ${Math.floor(doctrine.xp(b))}`));
        btn.appendChild(el('span', 'doc-tab-route', routeName));
        btn.onclick = () => { branch = b; selectedNodeId = null; drawAll(); };
        tabs.appendChild(btn);
      }
    };

    const drawXPBar = (branchId) => {
      const wrap = el('div', 'doc-xp');
      const xp = doctrine.xp(branchId);
      const nodes = doctrine.nodes(branchId);
      const cheapest = Math.min(...nodes.filter((n) => !doctrine.unlocked(branchId).has(n.id)).map((n) => n.cost));
      const target = Number.isFinite(cheapest) ? cheapest : 1;
      wrap.appendChild(el('span', 'doc-xp-label', `${I18N.t(`doctrine.branches.${branchId}`)}経験値`));
      const bar = el('div', 'doc-xp-bar');
      const fill = el('i');
      fill.style.width = `${Math.min(100, (xp / target) * 100)}%`;
      bar.appendChild(fill);
      wrap.appendChild(bar);
      wrap.appendChild(el('span', 'doc-xp-val', `${Math.floor(xp)} XP`));

      // 軍事演習: 政治力 25 → XP +30（HOI4 の演習に相当）
      const drill = el('button', 'steel-btn doc-drill', `演習（PP 25 → XP +30）`);
      drill.disabled = state.pp < 25;
      drill.onclick = () => {
        if (state.pp < 25) return;
        state.pp -= 25;
        doctrine.addXP(branchId, 30);
        drawAll();
      };
      wrap.appendChild(drill);
      return wrap;
    };

    const drawRoutes = () => {
      const wrap = el('div', 'doc-routes');
      wrap.appendChild(el('div', 'doc-section-label', 'ドクトリンルート（選択は不可逆）'));
      const selected = doctrine.selectedRoute(branch);
      const grid = el('div', 'doc-route-grid');
      for (const route of DOCTRINE_ROUTES[branch]) {
        const states = doctrine.routeStates(branch);
        const st = states.find((r) => r.id === route.id);
        const card = el('div', `doc-route ${st.selected ? 'selected' : ''} ${st.locked ? 'locked' : ''}`);
        card.style.setProperty('--route-color', route.color);
        const head = el('div', 'doc-route-head');
        head.appendChild(img(route.icon, route.name, 'doc-route-icon', '◈'));
        const titles = el('div', 'doc-route-titles');
        titles.appendChild(el('div', 'doc-route-name', route.name));
        titles.appendChild(el('div', 'doc-route-meta', `${st.taken}/${st.total} 習得`));
        head.appendChild(titles);
        card.appendChild(head);
        card.appendChild(el('div', 'doc-route-desc', route.desc));
        const actions = el('div', 'doc-route-actions');
        if (st.selected) actions.appendChild(el('span', 'badge gold', '選択中'));
        else if (st.locked) actions.appendChild(el('span', 'badge red', 'ロック'));
        else {
          const btn = el('button', 'steel-btn primary', 'このルートを選択');
          btn.onclick = () => {
            const res = doctrine.pickRoute(branch, route.id);
            if (!res.ok) {
              const msg = res.reason === 'progress' ? '既に習得済みノードがあるため変更できません'
                : res.reason === 'locked' ? 'ルートは既に選択済みです（不可逆）' : '選択できませんでした';
              flash(msg, true);
              return;
            }
            flash(`ルート「${route.name}」を選択しました。他のルートはロックされました。`);
            drawAll();
          };
          actions.appendChild(btn);
        }
        card.appendChild(actions);
        grid.appendChild(card);
      }
      wrap.appendChild(grid);
      void selected;
      return wrap;
    };

    /* ---------- ツリー描画 ---------- */
    const drawTree = () => {
      const nodes = doctrine.nodes(branch);
      const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const cols = Math.max(...xs) - minX + 1;
      const rows = Math.max(...ys) - minY + 1;
      const W = cols * COL_W + PAD * 2;
      const H = rows * ROW_H + PAD * 2;

      treeHost.innerHTML = '';
      const canvas = el('div', 'tech-canvas doc-canvas');
      canvas.style.width = `${Math.max(W, 520)}px`;
      canvas.style.height = `${H}px`;
      canvas.style.position = 'relative';

      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      svg.classList.add('doc-links');
      canvas.appendChild(svg);

      const pos = (n) => ({
        x: PAD + (n.x - minX) * COL_W + NODE_W / 2,
        y: PAD + (n.y - minY) * ROW_H + 34,
      });

      const un = doctrine.unlocked(branch);
      const selectedRoute = doctrine.selectedRoute(branch);

      // 接続線（直交ルーティング）
      for (const n of nodes) {
        for (const reqId of n.requires || []) {
          const parent = nodes.find((x) => x.id === reqId);
          if (!parent) continue;
          const a = pos(parent), b = pos(n);
          const midY = (a.y + b.y) / 2;
          const d = `M ${a.x} ${a.y + 30} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y - 34}`;
          const path = document.createElementNS(SVGNS, 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          const parentTaken = un.has(parent.id);
          const routeLocked = selectedRoute && n.route !== selectedRoute;
          path.setAttribute('stroke', routeLocked ? '#252b31' : parentTaken ? '#7ec850' : '#3a434d');
          path.setAttribute('stroke-width', parentTaken ? '2.5' : '2');
          if (routeLocked) path.setAttribute('stroke-dasharray', '4 5');
          svg.appendChild(path);
        }
      }

      // ノード
      for (const n of nodes) {
        const { x, y } = pos(n);
        const taken = un.has(n.id);
        const check = doctrine.canTake(branch, n.id);
        const routeLocked = selectedRoute ? n.route !== selectedRoute : false;
        const stateCls = taken ? 'taken' : routeLocked ? 'route-locked' : check.ok ? 'available' : 'locked';
        const route = DOCTRINE_ROUTES[branch].find((r) => r.id === n.route);
        const node = el('button', `doc-node ${stateCls} ${selectedNodeId === n.id ? 'focused' : ''}`);
        node.type = 'button';
        node.style.left = `${x - NODE_W / 2}px`;
        node.style.top = `${y - 34}px`;
        node.style.width = `${NODE_W}px`;
        node.style.height = `${NODE_H}px`;
        node.style.setProperty('--route-color', route?.color || '#8b96a0');
        node.setAttribute('aria-pressed', String(taken));
        node.title = `${doctrine.nodeName(n.id)}（${n.cost} XP）`;

        const iconWrap = el('div', 'doc-node-icon');
        iconWrap.appendChild(img(n.icon, doctrine.nodeName(n.id), '', '◈'));
        if (routeLocked) iconWrap.appendChild(el('span', 'doc-node-lock', '🔒'));
        node.appendChild(iconWrap);
        node.appendChild(el('div', 'doc-node-name', doctrine.nodeName(n.id)));
        const badges = el('div', 'doc-node-badges');
        badges.appendChild(el('span', `doc-cost ${check.ok && !taken ? 'affordable' : ''}`, `${n.cost} XP`));
        if (taken) badges.appendChild(el('span', 'doc-state-taken', '習得済'));
        else if (routeLocked) badges.appendChild(el('span', 'doc-state-locked', '他ルート'));
        node.appendChild(badges);

        node.onclick = (e) => {
          e.stopPropagation();
          selectedNodeId = n.id;
          renderTreeInPlace();
          drawTreeDetail();
        };
        canvas.appendChild(node);
      }

      treeHost.appendChild(canvas);
      return canvas;
    };

    /** ツリーを現在のDOM位置へ再描画（ノード選択時） */
    const renderTreeInPlace = () => {
      if (!treeHost) return;
      drawTree();
    };

    /* ---------- ノード詳細 ---------- */
    const detailHost = el('div', 'doc-detail-host');
    const drawTreeDetail = () => {
      detailHost.innerHTML = '';
      const n = doctrine.nodes(branch).find((x) => x.id === selectedNodeId);
      if (!n) {
        detailHost.appendChild(el('div', 'doc-detail-empty', 'ノードを選択すると詳細と習得ボタンが表示されます。'));
        return;
      }
      const check = doctrine.canTake(branch, n.id);
      const taken = doctrine.unlocked(branch).has(n.id);
      const route = DOCTRINE_ROUTES[branch].find((r) => r.id === n.route);
      const card = el('div', 'steel-card doc-detail');
      const head = el('div', 'doc-detail-head');
      head.appendChild(img(n.icon, doctrine.nodeName(n.id), 'doc-detail-icon', '◈'));
      const titles = el('div', 'col');
      titles.appendChild(el('div', 'doc-detail-title', doctrine.nodeName(n.id)));
      titles.appendChild(el('div', 'doc-detail-sub', `${route?.name || n.route} ・ Tier ${n.tier + 1} ・ ${n.cost} XP`));
      head.appendChild(titles);
      card.appendChild(head);
      card.appendChild(el('div', 'doc-detail-desc', doctrine.nodeDesc(n.id) || '—'));

      const effs = Object.entries(n.effects || {});
      if (effs.length) {
        const list = el('div', 'doc-effect-list');
        for (const [k, v] of effs) {
          list.appendChild(el('span', `doc-effect ${v < 0 ? 'neg' : 'pos'}`, `${DOCTRINE_EFFECT_LABELS[k] || k} ${formatDoctrineEffect(k, v)}`));
        }
        card.appendChild(list);
      }

      if ((n.requires || []).length) {
        card.appendChild(el('div', 'small dim mt8', `前提: ${n.requires.map((r) => doctrine.nodeName(r)).join(' / ')}${n.anyRequires ? '（いずれか）' : ''}`));
      }

      const act = el('div', 'row mt8');
      if (taken) {
        act.appendChild(el('span', 'badge green', '習得済み'));
      } else {
        const btn = el('button', 'steel-btn primary', `習得する（${n.cost} XP）`);
        btn.disabled = !check.ok;
        if (!check.ok) {
          btn.textContent = check.reason === 'xp' ? `XP不足（必要 ${check.needed}）`
            : check.reason === 'requires' ? '前提ノードが未習得'
            : check.reason === 'exclusive' ? '相互排他のノードを習得済み'
            : check.reason === 'route-locked' ? '他ルートを選択済み（ロック）'
            : '習得できません';
        }
        btn.onclick = () => {
          const res = doctrine.take(branch, n.id);
          if (!res.ok) { flash('習得条件を満たしていません', true); return; }
          flash(`「${doctrine.nodeName(n.id)}」を習得しました`);
          drawAll();
        };
        act.appendChild(btn);
      }
      card.appendChild(act);
      detailHost.appendChild(card);
    };

    /* ---------- 集計効果 ---------- */
    const drawSummary = () => {
      const wrap = el('div', 'doc-summary steel-card');
      wrap.appendChild(sectionTitle('現在のドクトリン補正（全軍）'));
      const entries = doctrine.effectSummary(branch);
      if (!entries.length) {
        wrap.appendChild(el('div', 'dim small', 'まだ補正はありません。ノードを習得すると全軍に永続ボーナスが付与されます。'));
        return wrap;
      }
      const grid = el('div', 'doc-summary-grid');
      for (const [k, v] of entries) {
        grid.appendChild(el('div', `doc-summary-item ${v < 0 ? 'neg' : 'pos'}`,
          `<span class="k">${DOCTRINE_EFFECT_LABELS[k] || k}</span><span class="v">${formatDoctrineEffect(k, v)}</span>`));
      }
      wrap.appendChild(grid);
      const org = doctrine.effects(branch).org || 0;
      wrap.appendChild(el('div', 'small dim mt8', `組織力ボーナスは師団の最大組織力に乗算されます（現在 ${Math.round(org * 100)}%）。`));
      return wrap;
    };

    /* ---------- フラッシュ ---------- */
    let flashTimer = null;
    const flashBox = el('div', 'doc-flash');
    const flash = (msg, bad = false) => {
      flashBox.textContent = msg;
      flashBox.classList.toggle('bad', bad);
      flashBox.classList.add('show');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => flashBox.classList.remove('show'), 3000);
    };

    const drawAll = () => {
      drawTabs();
      content.innerHTML = '';
      content.appendChild(flashBox);
      content.appendChild(drawXPBar(branch));
      content.appendChild(drawRoutes());
      const treeRow = el('div', 'doc-tree-row');
      const treeScroll = el('div', 'doc-tree-scroll');
      treeHost = treeScroll;
      drawTree();
      treeRow.appendChild(treeScroll);
      treeRow.appendChild(drawSummary());
      content.appendChild(treeRow);
      content.appendChild(detailHost);
      drawTreeDetail();
    };

    drawAll();

    // Tick 毎の軽量更新（開いているときのみ）
    let lastTickDraw = 0;
    const tickDraw = () => {
      if (!ctx.modals?.isOpen?.('doctrine')) return;
      const now = Date.now();
      if (now - lastTickDraw < 1200) return;
      lastTickDraw = now;
      // 詳細を開いていないときだけ全体を再描画（フォーカス喪失を避ける）
      if (document.activeElement && content.contains(document.activeElement)) return;
      drawAll();
    };
    ctx.onTickScreens.push(tickDraw);
  };
}

export default renderDoctrineScreen;
