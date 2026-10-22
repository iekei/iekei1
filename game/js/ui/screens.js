import { enableTreeGestures } from './touch-viewport.js';
/** ui/screens.js — 各種画面レンダラー（前編: 研究/貿易/生産/建設/兵站/ディシジョン/政治パネル） */

import { el, img, imgChain, fmt, fmtPct, $ } from '../util.js';
import { I18N } from '../i18n.js';
import { NATIONS, MAJORS, RESOURCES, IDEOLOGIES, MINOR_STATES, nationFlag, nationName } from '../data/nations.js';
import { techIconUrl } from '../research.js';
import { EQUIPMENT_ITEMS } from '../data/equipment.js';

/* ================= 小パーツ ================= */

export function sectionTitle(text) { return el('div', 'section-title', text); }

export function statKV(k, v, cls = '') {
  return el('div', 'kv', `<span class="k">${k}</span><span class="v ${cls}">${v}</span>`);
}

export function led(cls) { return el('span', `led ${cls}`); }

/* ================= 研究画面 ================= */

export function renderResearchScreen(ctx) {
  return (body) => {
    const { state, research, mio } = ctx;
    body.innerHTML = '';
    // 国家タブ（7大国家）
    const tabs = el('div', 'screen-tabs');
    let currentNation = state.playerTag;
    let currentCat = 'infantry';
    const content = el('div', 'screen-content');
    body.appendChild(tabs);
    body.appendChild(content);
    // 注意: body は steel-body（スクロールあり）。タブは固定にするため構造を調整
    body.classList.add('col');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    tabs.style.flex = '0 0 auto';
    content.style.flex = '1 1 auto';
    content.style.overflow = 'auto';
    content.style.padding = '10px';

    const draw = () => {
      tabs.innerHTML = '';
      content.innerHTML = '';
      for (const tag of MAJORS) {
        const b = el('button', `screen-tab ${tag === currentNation ? 'active' : ''}`, nationName(tag));
        b.onclick = () => { currentNation = tag; draw(); };
        tabs.appendChild(b);
      }
      // カテゴリタブ（最後に MIO タブを追加）
      const catTabs = el('div', 'screen-tabs');
      for (const cat of [...research.categoryList(), 'mio']) {
        const icon = I18N.dict?.research?.category_icons?.[cat];
        const b = el('button', `screen-tab ${cat === currentCat ? 'active' : ''}`);
        if (icon) b.appendChild(img(icon, '', '', ''));
        b.appendChild(el('span', '', cat === 'mio' ? I18N.t('mio.title') : I18N.categoryName(cat)));
        b.onclick = () => { currentCat = cat; drawContent(); };
        catTabs.appendChild(b);
      }
      content.appendChild(catTabs);
      drawContent();
    };

    const drawContent = () => {
      // 既存のカテゴリタブ以外をクリア
      [...content.querySelectorAll(':scope > :not(.screen-tabs)')].forEach((n) => n.remove());
      const prog = research.progressFor(currentNation);
      const wrap = el('div', 'col');
      wrap.style.gap = '10px';

      // MIO タブ: 軍需産業体の管理（レベル/XP/アサイン/特性ツリー）
      if (currentCat === 'mio') {
        wrap.appendChild(renderMioPanel(ctx, currentNation));
        content.appendChild(wrap);
        return;
      }

      // 研究枠表示
      const slotsBox = el('div', 'steel-card');
      slotsBox.appendChild(sectionTitle(`${I18N.t('research.slots')}（${nationName(currentNation)}）`));
      const slotsRow = el('div', 'row');
      prog.active.forEach((a, i) => {
        const slot = el('div', 'steel-card grow');
        if (a) {
          const node = research.nodes[a.techId];
          const total = research.researchDays(a.techId, currentNation);
          const remain = research.daysRemaining(a.techId, currentNation, i);
          const pct = fmtPct(Math.min(1, a.progressDays / total));
          slot.innerHTML = `<b class="gold">${I18N.techName(a.techId, node?.title)}</b>`;
          slot.appendChild(el('div', 'dim small', `${I18N.t('research.researching')} / ${I18N.t('research.days_total', { days: total })}`));
          const bar = el('div', 'mil-bar mt8'); bar.appendChild(el('i', 'style="width:' + pct + '"')); bar.appendChild(el('b', '', pct));
          slot.appendChild(bar);
          slot.appendChild(el('div', 'mono good mt8', I18N.daysLeft(remain)));
          // MIOアサイン
          const mioRow = el('div', 'row mt8');
          const sel = el('select', 'steel-select');
          sel.innerHTML = `<option value="">${I18N.t('mio.unassign')}</option>` +
            mio.list(currentNation).map((m) => `<option value="${m.id}" ${a.mioId === m.id ? 'selected' : ''}>${I18N.mioName(m.id)} Lv${m.level}</option>`).join('');
          sel.onchange = () => { research.assignMio(currentNation, i, sel.value || null); drawContent(); };
          mioRow.appendChild(sel);
          const un = el('button', 'steel-btn', I18N.t('ui.cancel'));
          un.onclick = () => { research.unassign(currentNation, i); drawContent(); };
          mioRow.appendChild(un);
          slot.appendChild(mioRow);
        } else {
          slot.innerHTML = `<span class="dim">${I18N.t('research.slot_free')} #${i + 1}</span>`;
        }
        slotsRow.appendChild(slot);
      });
      slotsBox.appendChild(slotsRow);
      wrap.appendChild(slotsBox);

      // ツリーキャンバス
      const canvas = el('div', 'tech-canvas tree-stage');
      canvas.style.minHeight = '520px';
      const nodes = research.nodesOf(currentCat);
      // Dependency depth defines rows, not the cramped source x/y coordinates.
      const depth = new Map();
      const level = (n, visiting = new Set()) => {
        if (depth.has(n.id)) return depth.get(n.id);
        if (visiting.has(n.id)) return 0;
        const next = new Set(visiting).add(n.id);
        const parents = (n.prerequisites || []).map(id => nodes.find(p => p.id === id)).filter(Boolean);
        const d = parents.length ? 1 + Math.max(...parents.map(p => level(p, next))) : 0;
        depth.set(n.id, d); return d;
      };
      const rows = new Map(), positions = new Map();
      for (const n of nodes) { const d = level(n); if (!rows.has(d)) rows.set(d, []); rows.get(d).push(n); }
      for (const [d, row] of rows) row.sort((a,b) => (a.x || 0)-(b.x || 0)).forEach((n,i) => positions.set(n.id, [70+i*210, 60+d*160]));
      const W = Math.max(800, ...[...rows.values()].map(row => row.length*210+140));
      const H = Math.max(520, rows.size*160+120);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      canvas.style.position = 'relative';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.style.position = 'absolute';
      const pos = n => positions.get(n.id) || [0,0];
      for (const n of nodes) {
        for (const p of n.prerequisites || []) {
          const pn = research.nodes[p];
          if (!pn) continue;
          const [x1, y1] = pos(pn), [x2, y2] = pos(n);
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', x1 + 26); line.setAttribute('y1', y1 + 26);
          line.setAttribute('x2', x2 + 26); line.setAttribute('y2', y2 + 26);
          line.setAttribute('stroke', prog.researched.has(p) ? '#7ec850' : '#3a434d');
          line.setAttribute('stroke-width', '2');
          svg.appendChild(line);
        }
      }
      canvas.appendChild(svg);
      for (const n of nodes) {
        const [x, y] = pos(n);
        const done = prog.researched.has(n.id);
        const researching = prog.active.some((a) => a?.techId === n.id);
        const can = research.canResearch(n.id, currentNation);
        const node = el('div', `tech-node ${done ? 'done' : researching ? 'researching' : can ? '' : 'locked'}`);
        node.style.left = x + 'px'; node.style.top = y + 'px';
        node.title = I18N.techName(n.id, n.title);
        const catIcon = I18N.dict?.research?.category_icons?.[currentCat] || '';
        node.appendChild(imgChain([techIconUrl(n.asset_key), catIcon].filter(Boolean), I18N.techName(n.id, n.title), '', 'R'));
        node.appendChild(el('span', 'year-badge', `${n.year}`));
        node.appendChild(el('span', 'tech-label', I18N.techName(n.id, n.title)));
        node.onclick = () => showTechDetail(n, can, done, researching, prog, currentNation);
        canvas.appendChild(node);
      }
      const viewport = enableTreeGestures(el('div', 'research-viewport'));
      viewport.appendChild(canvas);
      wrap.appendChild(viewport);
      content.appendChild(wrap);
    };

    const showTechDetail = (n, can, done, researching, prog, nation) => {
      const existing = body.querySelector('.tech-detail');
      existing?.remove();
      const d = el('div', 'steel-card tech-detail');
      d.style.flex = '0 0 auto';
      d.innerHTML = `<h4>${I18N.techName(n.id, n.title)}（${n.year}年）</h4>`;
      d.appendChild(el('div', 'dim small', I18N.t('research.days_total', { days: research.researchDays(n.id, nation) })));
      d.appendChild(el('div', 'small mt8', I18N.techDesc(n.id)));
      const btnRow = el('div', 'row mt8');
      if (!done && !researching) {
        const start = el('button', 'steel-btn primary', I18N.t('research.start'));
        start.disabled = !can;
        start.title = can ? '' : I18N.t('research.cannot_start');
        start.onclick = () => {
          const freeSlot = prog.active.findIndex((a) => !a);
          if (freeSlot >= 0 && research.assign(nation, freeSlot, n.id)) drawContent();
        };
        btnRow.appendChild(start);
      } else if (researching) {
        btnRow.appendChild(el('span', 'badge gold', I18N.t('research.researching')));
      } else {
        btnRow.appendChild(el('span', 'badge green', '✓'));
      }
      // MIO一覧（アサイン可能な企業: タイプ対応）
      const mioList = mio.list(nation);
      if (mioList.length && !done) {
        const sel = el('select', 'steel-select');
        sel.innerHTML = `<option value="">${I18N.t('mio.assign_research')}</option>` +
          mioList.map((m) => `<option value="${m.id}">${I18N.mioName(m.id)}（${I18N.t(`mio.types.${m.type}`)}）Lv${m.level}</option>`).join('');
        sel.onchange = () => { if (sel.value) { mio.assignToResearch(sel.value, prog.active.findIndex((a) => a?.techId === n.id) >= 0 ? prog.active.findIndex((a) => a?.techId === n.id) : 0); } };
        btnRow.appendChild(sel);
      }
      d.appendChild(btnRow);
      body.appendChild(d);
    };

    draw();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('research')) drawContent(); });
  };
}

/* ================= MIO管理パネル（研究画面MIOタブ） ================= */

function renderMioPanel(ctx, nation) {
  const { mio } = ctx;
  const wrap = el('div', 'col');
  wrap.style.gap = '10px';
  wrap.appendChild(sectionTitle(`${I18N.t('mio.title')}（${nationName(nation)}）`));

  const list = mio.list(nation);
  const grid = el('div', 'grid2');
  for (const m of list) {
    const card = el('div', 'steel-card col');
    card.style.gap = '6px';
    // ヘッダー: カード（ロゴ/モノグラム）+ 企業名 + レベル
    const head = el('div', 'row');
    const logo = el('div', 'commander-card');
    logo.style.width = '64px';
    const face = el('div', 'face');
    const mioCard = mio.cardFor(m.id);
    if (mioCard?.monogram) face.appendChild(el('span', 'initial', mioCard.monogram));
    else face.appendChild(el('span', 'initial', I18N.mioName(m.id).slice(0, 1)));
    logo.appendChild(face);
    logo.appendChild(el('div', 'cname', I18N.mioName(m.id)));
    head.appendChild(logo);
    const hcol = el('div', 'col grow');
    hcol.appendChild(el('b', 'gold', `${I18N.mioName(m.id)}　Lv${m.level}`));
    hcol.appendChild(el('span', 'small dim', `${I18N.t(`mio.types.${m.type}`)} / ${I18N.t('mio.xp')} ${m.xp}/${m.level * 100}`));
    const bar = el('div', 'mil-bar');
    bar.appendChild(el('i', `style="width:${fmtPct(m.xp / (m.level * 100))}"`));
    hcol.appendChild(bar);
    head.appendChild(hcol);
    card.appendChild(head);

    // アサイン状態
    const asg = m.assignment;
    card.appendChild(el('div', 'small mt8', asg
      ? `▶ ${asg.type === 'research' ? I18N.t('mio.assign_research') : I18N.t('mio.assign_production')} #${asg.ref + 1}`
      : I18N.t('ui.none')));

    // 特性ツリー（3段階: レベル解放で選択可能）
    card.appendChild(sectionTitle(I18N.t('mio.traits_title')));
    const tree = mio.traitTreeStatus(m.id);
    for (const tier of tree) {
      const row = el('div', 'row');
      row.style.flexWrap = 'wrap';
      for (const opt of tier.options) {
        const b = el('button', `steel-btn ${opt.chosen ? 'primary' : ''}`, opt.name);
        b.title = opt.desc;
        b.disabled = !tier.unlocked || opt.chosen;
        if (!tier.unlocked) b.title += '（レベル不足）';
        b.onclick = () => { if (mio.chooseTrait(m.id, tier.tier, tier.options.indexOf(opt))) { renderMioPanelRefresh(); } };
        row.appendChild(b);
      }
      card.appendChild(row);
    }
    grid.appendChild(card);
  }
  wrap.appendChild(grid);

  // 特性選択後は自身を再描画（世代ごとにクロージャが再生成される）
  const renderMioPanelRefresh = () => {
    if (!wrap.parentElement) return;
    wrap.replaceWith(renderMioPanel(ctx, nation));
  };
  return wrap;
}

/* ================= 貿易画面 ================= */

export function renderTradeScreen(ctx) {
  return (body) => {
    const { state, economy } = ctx;
    body.innerHTML = '';
    body.appendChild(sectionTitle(I18N.t('trade.summary')));

    const table = el('table', 'mil-table');
    table.innerHTML = `<thead><tr>
      <th>資源</th><th>${I18N.t('trade.stockpile')}</th><th>${I18N.t('trade.per_day')}</th>
      <th>${I18N.t('trade.import')}</th><th>${I18N.t('trade.rule')}</th>
    </tr></thead>`;
    const tbody = el('tbody');
    table.appendChild(tbody);
    body.appendChild(table);

    const draw = () => {
      tbody.innerHTML = '';
      for (const r of RESOURCES) {
        const tr = el('tr');
        const name = I18N.t(`resources.${r.id}`);
        const imp = state.trade.imports[r.id] || 0;
        const stock = state.stockpile[r.id] || 0;
        const perDay = imp * 1.2 - 2; // 概算
        tr.innerHTML = `<td>${name}</td><td class="mono">${fmt(stock)}</td><td class="mono ${perDay < 0 ? 'bad' : 'good'}">${perDay >= 0 ? '+' : ''}${perDay.toFixed(1)}</td>`;
        const td = el('td');
        const sel = el('select', 'steel-select');
        for (let v = 0; v <= 25; v += 1) {
          const o = el('option', '', String(v)); o.value = v;
          if (v === imp) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = () => { economy.setImport(r.id, Number(sel.value)); draw(); };
        td.appendChild(sel);
        tr.appendChild(td);
        const td2 = el('td', 'small dim');
        td2.textContent = `${I18N.t('trade.lent_factories', { n: Math.floor(imp / 8) })}`;
        tr.appendChild(td2);
        tbody.appendChild(tr);
      }
      // 貸出合計
      const tr = el('tr');
      tr.innerHTML = `<td colspan="5" class="gold">${I18N.t('trade.lent_factories', { n: economy.lentCivilianFactories() })} / ${I18N.t('economy.civilian')}: ${state.factories.civ}</td>`;
      tbody.appendChild(tr);
      // 不足警告
      const shortRes = RESOURCES.filter((r) => (state.stockpile[r.id] || 0) < 500);
      if (shortRes.length) {
        const warn = el('div', 'steel-card mt8');
        warn.style.borderLeft = '3px solid var(--red)';
        warn.innerHTML = `<b class="bad">⚠ ${I18N.t('trade.shortage')}</b><br><span class="small dim">${shortRes.map((r) => I18N.t(`resources.${r.id}`)).join(' / ')}</span>`;
        body.appendChild(warn);
      }
    };
    draw();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('trade')) draw(); });
  };
}

/* ================= 生産画面 ================= */

export function renderProductionScreen(ctx) {
  return (body) => {
    const { state, economy, mio } = ctx;
    body.innerHTML = '';
    body.appendChild(sectionTitle(`${I18N.t('production.lines')} — ${I18N.t('economy.military')}: ${economy.usedMilFactories()}/${economy.totalMilFactories()} ・ ${I18N.t('economy.dockyard')}: ${economy.usedDockyards()}/${economy.totalDockyards()}`));
    body.appendChild(el('div', 'small dim mb8', I18N.t('production.efficiency_hint')));

    const list = el('div', 'col');
    list.style.gap = '8px';
    body.appendChild(list);

    const draw = () => {
      list.innerHTML = '';
      for (const line of economy.lines()) {
        const item = EQUIPMENT_ITEMS[line.item];
        if (!item) continue;
        const card = el('div', 'steel-card');
        const head = el('div', 'row');
        head.appendChild(img(`game/assets/technology/${line.item}.png`, item.name, '', 'M'));
        head.appendChild(el('b', 'grow', `${item.name}`));
        // 装備変更セレクト
        const sel = el('select', 'steel-select');
        for (const [id, it] of Object.entries(EQUIPMENT_ITEMS)) {
          const o = el('option', '', it.name); o.value = id;
          if (id === line.item) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = () => { economy.changeEquipment(line.id, sel.value); draw(); };
        head.appendChild(sel);
        card.appendChild(head);

        const ctl = el('div', 'row mt8');
        const minus = el('button', 'steel-btn icon-only', '－');
        const plus = el('button', 'steel-btn icon-only', '＋');
        const num = el('span', 'mono', `${line.factories}`);
        minus.onclick = () => { economy.setFactories(line.id, line.factories - 1); draw(); };
        plus.onclick = () => { economy.setFactories(line.id, line.factories + 1); draw(); };
        ctl.appendChild(minus); ctl.appendChild(num); ctl.appendChild(plus);
        ctl.appendChild(el('span', 'dim small', `${line.kind === 'dock' ? I18N.t('economy.dockyard') : I18N.t('economy.military')}`));
        // MIOアサイン
        const mioSel = el('select', 'steel-select');
        mioSel.innerHTML = `<option value="">MIO: ${I18N.t('ui.none')}</option>` +
          mio.list().map((m) => `<option value="${m.id}" ${line.mioId === m.id ? 'selected' : ''}>${I18N.mioName(m.id)} Lv${m.level}</option>`).join('');
        mioSel.onchange = () => { economy.assignMio(line.id, mioSel.value || null); mio.assignToProduction(mioSel.value, line.id); draw(); };
        ctl.appendChild(mioSel);
        const del = el('button', 'steel-btn danger icon-only', '✕');
        del.onclick = () => { economy.removeLine(line.id); draw(); };
        ctl.appendChild(del);
        card.appendChild(ctl);

        // 効率バー
        const eff = el('div', 'mil-bar mt8');
        const effPct = fmtPct(line.efficiency);
        eff.appendChild(el('i', `style="width:${effPct}"`));
        eff.appendChild(el('b', '', `${I18N.t('production.efficiency')} ${effPct}`));
        card.appendChild(eff);

        // 艦船の場合は1隻ごとの建造進捗
        if (item.isShip) {
          const prog = state.shipProgress[line.id] || 0;
          const pct = fmtPct(Math.min(1, prog / item.ic));
          const bar = el('div', 'mil-bar mt8');
          bar.appendChild(el('i', `style="width:${pct}"`));
          bar.appendChild(el('b', '', `${I18N.t('production.ship_progress')} ${pct}`));
          card.appendChild(bar);
          card.appendChild(el('div', 'small dim mt8', `${I18N.t('production.in_production', { n: fmt(state.stockpile[line.item] || 0) })}`));
        } else {
          card.appendChild(el('div', 'small dim mt8', `${I18N.t('production.daily_output', { n: (line.factories * line.efficiency * item.output).toFixed(2) })} / ${fmt(state.stockpile[line.item] || 0)}`));
        }
        list.appendChild(card);
      }
      // 新規ライン追加
      const addCard = el('div', 'steel-card row');
      const sel = el('select', 'steel-select');
      for (const [id, it] of Object.entries(EQUIPMENT_ITEMS)) {
        const o = el('option', '', it.name); o.value = id; sel.appendChild(o);
      }
      const kindSel = el('select', 'steel-select');
      kindSel.innerHTML = `<option value="mil">${I18N.t('economy.military')}</option><option value="dock">${I18N.t('economy.dockyard')}</option>`;
      const add = el('button', 'steel-btn primary', '＋ ' + I18N.t('production.lines'));
      add.onclick = () => { economy.addLine(sel.value, kindSel.value, 1); draw(); };
      addCard.appendChild(sel); addCard.appendChild(kindSel); addCard.appendChild(add);
      list.appendChild(addCard);
    };
    draw();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('production')) draw(); });
  };
}

/* ================= 建設画面 ================= */

export function renderConstructionScreen(ctx) {
  return (body) => {
    const { state, economy } = ctx;
    body.innerHTML = '';
    body.appendChild(sectionTitle(I18N.t('construction.queue')));
    body.appendChild(el('div', 'small dim mb8', `${I18N.t('economy.civilian')}: ${economy.availableCivilianFactories()} ${I18N.t('ui.available') || ''} / ${state.factories.civ}`));

    const kinds = [
      ['civilian_factory', 'construction.civilian_factory'],
      ['military_factory', 'construction.military_factory'],
      ['dockyard', 'construction.dockyard'],
      ['infrastructure', 'construction.infrastructure'],
      ['fuel_silo', 'construction.fuel_silo'],
      ['naval_base', 'construction.naval_base'],
    ];
    const grid = el('div', 'grid3');
    for (const [type, key] of kinds) {
      const card = el('div', 'steel-card center');
      card.appendChild(el('b', 'gold', I18N.t(key)));
      const btn = el('button', 'steel-btn primary mt8', I18N.t('construction.build'));
      btn.onclick = () => { economy.enqueueConstruction(type); draw(); };
      card.appendChild(btn);
      grid.appendChild(card);
    }
    body.appendChild(grid);

    const list = el('div', 'col mt12');
    body.appendChild(list);
    const draw = () => {
      list.innerHTML = '';
      if (!state.constructionQueue.length) {
        list.appendChild(el('div', 'dim small', I18N.t('ui.no_data')));
        return;
      }
      for (const q of state.constructionQueue) {
        const card = el('div', 'steel-card');
        card.appendChild(el('b', '', `${I18N.t(q.def.name)} #${q.id.slice(-4)}`));
        const bar = el('div', 'mil-bar mt8');
        const pct = fmtPct(Math.min(1, q.progress / q.days));
        bar.appendChild(el('i', `style="width:${pct}"`));
        bar.appendChild(el('b', '', `${I18N.t('construction.progress')} ${pct}`));
        card.appendChild(bar);
        const cancel = el('button', 'steel-btn danger mt8', I18N.t('ui.cancel'));
        cancel.onclick = () => { economy.removeConstruction(q.id); draw(); };
        card.appendChild(cancel);
        list.appendChild(card);
      }
    };
    draw();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('construction')) draw(); });
  };
}

/* ================= 国家方針/補給画面 ================= */

export function renderLogisticsScreen(ctx) {
  return (body) => {
    const { state } = ctx;
    body.innerHTML = '';
    body.appendChild(sectionTitle(I18N.t('politics.spirits')));
    const spirits = el('div', 'col');
    spirits.style.gap = '6px';
    for (const sp of state.politics.spirits) {
      const card = el('div', 'steel-card row');
      card.appendChild(el('b', 'gold', sp.name));
      card.appendChild(el('span', 'dim small grow', sp.desc || ''));
      spirits.appendChild(card);
    }
    body.appendChild(spirits);

    body.appendChild(sectionTitle('補給状況'));
    const table = el('table', 'mil-table');
    table.innerHTML = `<thead><tr><th>項目</th><th>値</th><th>状態</th></tr></thead>`;
    const tbody = el('tbody');
    const rows = [
      ['徴兵可能人口', fmt(state.manpower), state.manpower > 1e6 ? 'good' : 'warn'],
      ['燃料備蓄', `${fmt(state.fuel.stock)} / ${fmt(state.fuel.max)}`, state.fuel.stock < state.fuel.max * 0.3 ? 'bad' : 'good'],
      ['輸送船稼働率', `${state.convoys.used} / ${state.convoys.total}`, state.convoys.used > state.convoys.total * 0.8 ? 'warn' : 'good'],
      ['工場稼働', `民需 ${state.factories.civ} / 軍需 ${state.factories.mil} / 造船 ${state.factories.dock}`, ''],
      ['師団数', `${state.units.army}`, ''],
      ['艦船数', `${state.units.navy}`, ''],
      ['航空機数', `${state.units.air}`, ''],
    ];
    for (const [k, v, cls] of rows) {
      const tr = el('tr');
      tr.innerHTML = `<td>${k}</td><td class="mono ${cls}">${v}</td><td>${cls ? led(cls === 'good' ? 'green' : cls === 'warn' ? 'yellow' : 'red') : ''}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    body.appendChild(table);
  };
}

/* ================= ディシジョン画面 ================= */

export function renderDecisionsScreen(ctx) {
  return (body) => {
    const { state } = ctx;
    body.innerHTML = '';
    body.appendChild(sectionTitle('国家ディシジョン'));
    const decisions = [
      { id: 'mobilize', name: '経済の動員', cost: 50, desc: '軍需工場+2、戦争協力度+5%', run: () => { state.factories.mil += 2; state.warSupport = Math.min(100, state.warSupport + 5); } },
      { id: 'war_economy', name: '戦時経済への移行', cost: 100, desc: '民需工場-4、軍需工場+4', run: () => { state.factories.civ = Math.max(0, state.factories.civ - 4); state.factories.mil += 4; } },
      { id: 'nuclear_program', name: '核開発計画の開始', cost: 150, desc: '原子力研究にブースト（研究枠+1相当の効果）', run: () => { state.research.slots = Math.min(4, state.research.slots + 0); } },
      { id: 'autarky', name: '自給自足政策', cost: 75, desc: '貿易依存低下（輸入ペナルティ減少）', run: () => {} },
    ];
    const grid = el('div', 'grid2');
    for (const d of decisions) {
      const card = el('div', 'steel-card');
      card.appendChild(el('h4', '', d.name));
      card.appendChild(el('div', 'small dim', d.desc));
      const btn = el('button', 'steel-btn primary mt8', `${I18N.t('ui.confirm')}（${d.cost} PP）`);
      btn.disabled = state.pp < d.cost;
      btn.onclick = () => { if (state.pp >= d.cost) { state.pp -= d.cost; d.run(); card.replaceWith(el('div', 'steel-card', `<b class="good">✓ ${d.name} を実行しました</b>`)); } };
      card.appendChild(btn);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  };
}

/* ================= 自国政治スライドパネル ================= */

export class PoliticsPanel {
  constructor(state) {
    this.state = state;
    this.root = $('#politics-panel');
    this.scrim = $('#politics-scrim');
    this.open_ = false;
    this.tab = 'government';
    this.scrim.addEventListener('click', () => this.toggle(false));
  }

  toggle(force) {
    this.open_ = force !== undefined ? force : !this.open_;
    this.root.classList.toggle('open', this.open_);
    this.scrim.classList.toggle('hidden', !this.open_);
    if (this.open_) this.render();
  }

  render() {
    const s = this.state;
    const nat = s.nation;
    this.root.innerHTML = '';
    const frame = el('div', 'steel-frame');
    const inner = el('div', 'steel-inner');
    const titlebar = el('div', 'steel-titlebar');
    titlebar.appendChild(el('span', 'orn'));
    titlebar.appendChild(el('div', 'steel-title', I18N.t('politics.title')));
    titlebar.appendChild(el('span', 'orn'));
    const closeBtn = el('button', 'steel-close', '✕');
    closeBtn.onclick = () => this.toggle(false);
    titlebar.appendChild(closeBtn);
    inner.appendChild(titlebar);
    const body = el('div', 'steel-body');
    inner.appendChild(body);
    frame.appendChild(inner);
    this.root.appendChild(frame);

    // ヘッダー: 国旗・国名・指導者
    const header = el('div', 'steel-card col');
    header.style.alignItems = 'center';
    header.style.textAlign = 'center';
    header.appendChild(img(nat.flag, nat.name, 'style="width:64px;height:40px;object-fit:cover;border:1px solid #000"'));
    header.appendChild(el('div', 'gold', `font-family:var(--mil-font);font-weight:700;letter-spacing:.1em;margin-top:6px`, nat.name));
    const leaderRow = el('div', 'row mt8');
    if (nat.leader.portrait) {
      leaderRow.appendChild(img(nat.leader.portrait, nat.leader.name, 'style="width:44px;height:44px;object-fit:cover;border:1px solid var(--gold-dim)"'));
    }
    const lr = el('div', 'col');
    lr.appendChild(el('b', '', nat.leader.name));
    lr.appendChild(el('span', 'dim small', I18N.t(`politics.${nat.ideology}`)));
    leaderRow.appendChild(lr);
    header.appendChild(leaderRow);
    body.appendChild(header);

    // タブ
    const tabs = el('div', 'screen-tabs');
    for (const [id, label] of [['government', 'government'], ['occupation', 'occupation']]) {
      const b = el('button', `screen-tab ${this.tab === id ? 'active' : ''}`, I18N.t(`politics.tabs.${label}`));
      b.onclick = () => { this.tab = id; this.render(); };
      tabs.appendChild(b);
    }
    body.appendChild(tabs);

    if (this.tab === 'government') this._renderGovernment(body, s, nat);
    else this._renderOccupation(body, s);
    I18N.apply(body);
  }

  _renderGovernment(body, s, nat) {
    // イデオロギー支持率円グラフ（SVGドーナツ）
    body.appendChild(sectionTitle(I18N.t('politics.ideology_support')));
    const pie = el('div', 'row');
    pie.style.justifyContent = 'center';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', 140); svg.setAttribute('height', 140);
    let angle = -90;
    const r = 50, cx = 70, cy = 70;
    for (const ide of IDEOLOGIES) {
      const val = s.politics.ideologySupport[ide.id] || 0;
      const a0 = (angle * Math.PI) / 180, a1 = ((angle + val * 3.6) * Math.PI) / 180;
      angle += val * 3.6;
      const large = val > 50 ? 1 : 0;
      const path = document.createElementNS(svgNS, 'path');
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      path.setAttribute('d', `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`);
      path.setAttribute('fill', ide.color);
      path.setAttribute('stroke', '#0b0e11');
      svg.appendChild(path);
    }
    pie.appendChild(svg);
    const legend = el('div', 'col');
    for (const ide of IDEOLOGIES) {
      const row = el('div', 'kv');
      row.innerHTML = `<span class="k"><span class="led" style="color:${ide.color};box-shadow:0 0 6px ${ide.color}"></span> ${I18N.t(`politics.${ide.id}`)}</span><span class="v">${s.politics.ideologySupport[ide.id] || 0}%</span>`;
      legend.appendChild(row);
    }
    pie.appendChild(legend);
    body.appendChild(pie);

    // 法律
    body.appendChild(sectionTitle(I18N.t('politics.laws')));
    const lawBox = el('div', 'grid2');
    const lawDefs = [
      ['conscription', ['volunteer', 'limited', 'extensive', 'service_by_requirement']],
      ['economy', ['civilian', 'low', 'medium', 'high']],
    ];
    for (const [kind, options] of lawDefs) {
      const card = el('div', 'steel-card');
      card.appendChild(el('h4', '', kind === 'conscription' ? '徴兵法' : '経済法'));
      const sel = el('select', 'steel-select');
      sel.style.width = '100%';
      for (const o of options) {
        const op = el('option', '', I18N.t(`politics.${kind}.${o}`)); op.value = o;
        if (s.politics.laws[kind] === o) op.selected = true;
        sel.appendChild(op);
      }
      sel.onchange = () => ctx_politics_changeLaw(this.state, kind, sel.value);
      card.appendChild(sel);
      card.appendChild(el('div', 'small dim mt8', `${I18N.t('politics.pp_cost', { pp: 50 })}`));
      lawBox.appendChild(card);
    }
    body.appendChild(lawBox);

    // 閣僚
    body.appendChild(sectionTitle(I18N.t('politics.ministers')));
    const minBox = el('div', 'col');
    minBox.style.gap = '6px';
    if (!s.politics.ministers.length) minBox.appendChild(el('div', 'dim small', I18N.t('ui.no_data')));
    for (const m of s.politics.ministers) {
      minBox.appendChild(el('div', 'steel-card row', `<b>${m.name}</b><span class="dim small grow">${m.appointedAt}</span>`));
    }
    const appointRow = el('div', 'row mt8');
    const input = el('input', 'steel-input', '');
    input.placeholder = '閣僚名';
    const btn = el('button', 'steel-btn primary', `${I18N.t('politics.appoint')}（50 PP）`);
    btn.onclick = () => { if (input.value && ctx_politics_appoint(this.state, input.value)) input.value = ''; };
    appointRow.appendChild(input); appointRow.appendChild(btn);
    minBox.appendChild(appointRow);
    body.appendChild(minBox);

    // 国家的精神
    body.appendChild(sectionTitle(I18N.t('politics.spirits')));
    const sp = el('div', 'col');
    sp.style.gap = '6px';
    for (const spirit of s.politics.spirits) {
      sp.appendChild(el('div', 'steel-card row', `<b class="gold">${spirit.name}</b><span class="dim small grow">${spirit.desc || ''}</span>`));
    }
    body.appendChild(sp);
  }

  _renderOccupation(body, s) {
    body.appendChild(sectionTitle(I18N.t('politics.occupation.title')));
    body.appendChild(el('div', 'small dim mb8', I18N.t('politics.occupation.tick_info')));
    const table = el('table', 'mil-table');
    table.innerHTML = `<thead><tr><th>${I18N.t('politics.occupation.col_names.0')}</th><th>${I18N.t('politics.occupation.col_names.1')}</th><th>${I18N.t('politics.occupation.col_names.2')}</th><th>${I18N.t('politics.occupation.col_names.3')}</th><th></th></tr></thead>`;
    const tbody = el('tbody');
    table.appendChild(tbody);
    for (const occ of s.occupations) {
      const minor = MINOR_STATES[occ.tag] || {};
      const tr = el('tr');
      const tdFlag = el('td'); tdFlag.appendChild(img(nationFlag(occ.tag), '', 'style="width:28px;height:18px;object-fit:cover"', '◆'));
      tr.appendChild(tdFlag);
      tr.appendChild(el('td', '', `${nationName(occ.tag)}${occ.kind === 'puppet' ? '（傀儡）' : ''}`));
      tr.appendChild(el('td', 'mono', String(occ.factories)));
      const tdBar = el('td');
      const bar = el('div', 'mil-bar');
      bar.style.width = '120px';
      bar.appendChild(el('i', `style="width:${occ.compliance}%"`));
      bar.appendChild(el('b', '', `${occ.compliance}%`));
      tdBar.appendChild(bar);
      tr.appendChild(tdBar);
      const tdBtn = el('td');
      if (occ.compliance >= 100) {
        const annex = el('button', 'steel-btn primary', I18N.t('politics.occupation.integrate'));
        annex.title = I18N.t('politics.occupation.integrate_hint');
        annex.onclick = () => { ctx_politics_integrate(this.state, occ.tag); };
        tdBtn.appendChild(annex);
      } else if (occ.kind === 'occupied' && occ.compliance >= 50) {
        const pup = el('button', 'steel-btn', I18N.t('politics.occupation.puppet'));
        pup.onclick = () => { ctx_politics_puppet(this.state, occ.tag); };
        tdBtn.appendChild(pup);
      } else {
        tdBtn.textContent = '統合中…';
        tdBtn.className = 'dim small';
      }
      tr.appendChild(tdBtn);
      tbody.appendChild(tr);
    }
    body.appendChild(table);
  }
}

/* 政治操作ブリッジ（マネージャへ委譲） */
function ctx_politics_changeLaw(state, kind, lawId) {
  state._politicsMgr?.changeLaw(kind, lawId);
  state.bus.emit('politics-panel-refresh');
}
function ctx_politics_appoint(state, name) {
  const ok = state._politicsMgr?.appointMinister(name);
  if (ok) state.bus.emit('politics-panel-refresh');
  return ok;
}
function ctx_politics_integrate(state, tag) {
  const ok = state._politicsMgr?.integrate(tag);
  if (ok) state.bus.emit('politics-panel-refresh');
  return ok;
}
function ctx_politics_puppet(state, tag) {
  const ok = state._politicsMgr?.createPuppet(tag);
  if (ok) state.bus.emit('politics-panel-refresh');
  return ok;
}
