/**
 * ui/screens3.js — 新規追加画面レンダラ
 *
 *  renderFocusScreen / renderAirNavalScreen / renderGachaScreen /
 *  renderPeaceScreen / renderSpecialScreen / renderNukeScreen
 *  各画面は modals の render コールバックとして (body, modal) => void の形式。
 */

import { el, img } from '../util.js';
import { I18N } from '../i18n.js';
import { NATIONS, MAJORS, nationName } from '../data/nations.js';
import { AIR_REGIONS, NAVAL_REGIONS, AIR_TYPE_INFO, NAVAL_TYPE_INFO } from '../air-naval.js';
import { enableTreeGestures } from './touch-viewport.js';
import { PROVINCES } from '../map-data.js';

/* ================= 国家方針画面 ================= */

export function renderFocusScreen(ctx) {
  return (body) => {
    const { state, focusMgr } = ctx;
    body.innerHTML = '';
    body.style.padding = '10px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';

    let currentTag = state.playerTag;
    const treeWrap = el('div', 'focus-tree-wrap');
    treeWrap.style.flex = '1 1 auto';
    treeWrap.style.overflow = 'auto';
    body.appendChild(treeWrap);

    const tabs = el('div', 'screen-tabs');
    body.insertBefore(tabs, treeWrap);

    const info = el('div', 'steel-card');
    body.insertBefore(info, treeWrap);
    enableTreeGestures(treeWrap);
    const draw = () => {
      tabs.innerHTML = '';
      for (const tag of MAJORS) {
        const b = el('button', `screen-tab ${tag === currentTag ? 'active' : ''}`, nationName(tag));
        b.onclick = () => { currentTag = tag; draw(); };
        tabs.appendChild(b);
      }
      treeWrap.innerHTML = '';
      focusMgr.render(treeWrap, currentTag);

      // アクティブフォーカス表示
      const active = focusMgr.activeProgress(currentTag);
      info.innerHTML = '';
      info.style.flex = '0 0 auto';
      if (active) {
        const pct = Math.round(active.pct * 100);
        info.innerHTML = `
          <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);margin-bottom:4px">
            ${I18N.techName(active.node.id, active.node.title)} （${active.node.cost}日）
          </div>
          <div class="mil-bar" style="margin-top:4px"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7ec850,#4d7a2f)"></div></div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">残り${Math.ceil(active.daysLeft)}日</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${active.node.reward_description || active.node.effect || ''}</div>
        `;
      } else {
        info.innerHTML = `<div class="dim small">実行中の国家方針はありません。ツリーノードをクリックして開始してください。</div>`;
      }

    };

    draw();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('focus')) draw(); });
  };
}

/* ================= 空軍・海軍画面 ================= */

export function renderAirNavalScreen(ctx) {
  return (body) => {
    const { state, airNaval, mapEngine } = ctx;
    body.innerHTML = '';
    body.style.padding = '10px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';

    const tabs = el('div', 'screen-tabs');
    let tab = 'air';
    const content = el('div');
    content.style.flex = '1 1 auto';
    content.style.overflow = 'auto';
    body.appendChild(tabs);
    body.appendChild(content);

    const drawAir = () => {
      content.innerHTML = '';
      content.appendChild(el('h4', '', I18N.t('airnaval.title_air')));
      // 航空機配備
      content.appendChild(el('div', 'small dim mb4', I18N.t('airnaval.deploy_hint')));
      const grid = el('div', 'grid3');
      for (const type of ['fighter', 'cas', 'strategic_bomber', 'transport']) {
        const info = AIR_TYPE_INFO[type];
        const card = el('div', 'steel-card');
        card.appendChild(el('b', '', info.name));
        const sel = el('select', 'steel-select mt4');
        for (let n = 1; n <= 5; n++) {
          const o = el('option', '', String(n)); sel.appendChild(o);
        }
        const btn = el('button', 'steel-btn primary mt4', I18N.t('airnaval.deploy'));
        btn.onclick = () => {
          const prov = mapEngine.playerCapital().id; // 首都基地に配備（デモ）
          airNaval.deployAir(prov, type, Number(sel.value));
          drawAir();
        };
        card.appendChild(sel); card.appendChild(btn);
        grid.appendChild(card);
      }
      content.appendChild(grid);

      // 既存航空一覧
      content.appendChild(el('h4', '', '配備済み航空機'));
      const list = el('div', 'col mt4');
      list.style.gap = '6px';
      for (const af of state.airForces) {
        const p = airNaval.map.byId[af.baseProvince];
        const info = AIR_TYPE_INFO[af.type] || AIR_TYPE_INFO.fighter;
        const row = el('div', 'steel-card row');
        row.appendChild(el('b', '', info.name));
        row.appendChild(el('span', 'dim small grow', `基地: ${p ? p.name : '?'} ×${af.count}`));
        const regSel = el('select', 'steel-select mt4');
        regSel.innerHTML = '<option value="">未割当</option>' +
          AIR_REGIONS.map((r) => `<option value="${r.id}" ${af.region === r.id ? 'selected' : ''}>${r.name}</option>`).join('');
        const misSel = el('select', 'steel-select mt4');
        misSel.innerHTML = `<option value="">なし</option>
          <option value="air_superiority" ${af.mission === 'air_superiority' ? 'selected' : ''}>制空権確保</option>
          <option value="cas" ${af.mission === 'cas' ? 'selected' : ''}>近接航空支援</option>
          <option value="strategic_bombing" ${af.mission === 'strategic_bombing' ? 'selected' : ''}>戦略爆撃</option>`;
        const go = el('button', 'steel-btn mt4', '割当');
        go.onclick = () => { airNaval.assignAirMission(af.id, regSel.value || null, misSel.value || null); drawAir(); };
        row.appendChild(regSel); row.appendChild(misSel); row.appendChild(go);
        list.appendChild(row);
      }
      content.appendChild(list);

      // 空域ごとの制空権
      content.appendChild(el('h4', '', '空域ごとの制空権'));
      const regGrid = el('div', 'grid3');
      for (const r of AIR_REGIONS) {
        const sup = airNaval.calcAirSupremacy(r.id);
        const level = airNaval.airSupremacyLevel(r.id);
        const color = level === 'green' ? '#7ec850' : level === 'yellow' ? '#e0b93e' : '#d05038';
        const card = el('div', 'steel-card');
        card.style.borderLeft = `3px solid ${color}`;
        card.appendChild(el('b', '', r.name));
        card.appendChild(el('div', 'small dim', `制空権 ${sup}%`));
        card.appendChild(el('div', `small mt4 ${level === 'green' ? 'good' : level === 'yellow' ? 'warn' : 'bad'}`, level === 'green' ? '優勢（空挺可）' : level === 'yellow' ? '均衡' : '劣勢'));
        regGrid.appendChild(card);
      }
      content.appendChild(regGrid);
    };

    const drawNaval = () => {
      content.innerHTML = '';
      content.appendChild(el('h4', '', I18N.t('airnaval.title_naval')));
      const grid = el('div', 'grid3');
      for (const type of ['fleet', 'task_force', 'convoy']) {
        const info = NAVAL_TYPE_INFO[type];
        const card = el('div', 'steel-card');
        card.appendChild(el('b', '', info.name));
        const btn = el('button', 'steel-btn primary mt4', I18N.t('airnaval.deploy'));
        btn.onclick = () => {
          const region = NAVAL_REGIONS[0].id;
          airNaval.deployNaval(region, type);
          drawNaval();
        };
        card.appendChild(btn);
        grid.appendChild(card);
      }
      content.appendChild(grid);

      content.appendChild(el('h4', '', '配備済み艦隊'));
      const list = el('div', 'col mt4');
      list.style.gap = '6px';
      for (const nf of state.navalForces) {
        const region = NAVAL_REGIONS.find((r) => r.id === nf.region);
        const info = NAVAL_TYPE_INFO[nf.type] || NAVAL_TYPE_INFO.fleet;
        const row = el('div', 'steel-card row');
        row.appendChild(el('b', '', info.name));
        row.appendChild(el('span', 'dim small grow', `海域: ${region ? region.name : '?'}`));
        const misSel = el('select', 'steel-select mt4');
        misSel.innerHTML = `<option value="">未割当</option>
          <option value="patrol" ${nf.mission === 'patrol' ? 'selected' : ''}>哨戒</option>
          <option value="strike" ${nf.mission === 'strike' ? 'selected' : ''}>打撃群</option>
          <option value="escort" ${nf.mission === 'escort' ? 'selected' : ''}>船団護衛</option>
          <option value="raiding" ${nf.mission === 'raiding' ? 'selected' : ''}>通商破壊</option>`;
        const go = el('button', 'steel-btn mt4', '割当');
        go.onclick = () => { airNaval.assignNavalMission(nf.id, misSel.value || null); drawNaval(); };
        row.appendChild(misSel); row.appendChild(go);
        list.appendChild(row);
      }
      content.appendChild(list);

      content.appendChild(el('h4', '', '海域ごとの制海権'));
      const regGrid = el('div', 'grid3');
      for (const r of NAVAL_REGIONS) {
        const sup = airNaval.calcNavalSupremacy(r.id);
        const level = airNaval.navalSupremacyLevel(r.id);
        const color = level === 'green' ? '#7ec850' : level === 'yellow' ? '#e0b93e' : '#d05038';
        const card = el('div', 'steel-card');
        card.style.borderLeft = `3px solid ${color}`;
        card.appendChild(el('b', '', r.name));
        card.appendChild(el('div', 'small dim', `制海権 ${sup}%`));
        card.appendChild(el('div', `small mt4 ${level === 'green' ? 'good' : level === 'yellow' ? 'warn' : 'bad'}`, level === 'green' ? '確保（上陸可）' : level === 'yellow' ? '均衡' : '喪失'));
        regGrid.appendChild(card);
      }
      content.appendChild(regGrid);
    };

    const draw = () => {
      [...tabs.querySelectorAll('.screen-tab')].forEach((n) => n.remove());
      for (const [id, label] of [['air', 'airnaval.tab_air'], ['naval', 'airnaval.tab_naval']]) {
        const b = el('button', `screen-tab ${tab === id ? 'active' : ''}`, I18N.t(label));
        b.onclick = () => { tab = id; draw(); };
        tabs.appendChild(b);
      }
      if (tab === 'air') drawAir(); else drawNaval();
    };

    // 空挺・強襲上陸ショートカット
    const shortcuts = el('div', 'steel-card row mt8');
    shortcuts.style.flexWrap = 'wrap';
    shortcuts.appendChild(el('b', 'gold', I18N.t('airnaval.shortcuts')));
    const paraBtn = el('button', 'steel-btn mt4', I18N.t('airnaval.paratrooper'));
    paraBtn.onclick = () => {
      const from = mapEngine.playerCapital().id;
      const to = 'ger_berlin'; // デモ目標
      const check = airNaval.canParatrooper(from, to);
      airNaval.drawParatrooperRoute(from, to, check.ok);
      if (check.ok) {
        if (airNaval.executeParatrooper(from, to)) toast(I18N.t('airnaval.para_done'), 'good');
      } else {
        toast(check.msg, 'bad');
      }
      draw();
    };
    shortcuts.appendChild(paraBtn);

    const invBtn = el('button', 'steel-btn mt4', I18N.t('airnaval.naval_invasion'));
    invBtn.onclick = () => {
      const from = 'eng_london';
      const to = 'fra_paris';
      const check = airNaval.canNavalInvasion(from, to);
      airNaval.drawNavalInvasionRoute(from, to, check.ok);
      if (check.ok) {
        if (airNaval.executeNavalInvasion(from, to)) toast(I18N.t('airnaval.inv_done'), 'good');
      } else {
        toast(check.msg, 'bad');
      }
      draw();
    };
    shortcuts.appendChild(invBtn);
    const clearBtn = el('button', 'steel-btn mt4', 'ルートクリア');
    clearBtn.onclick = () => { airNaval.clearRoutes(); };
    shortcuts.appendChild(clearBtn);
    body.appendChild(shortcuts);

    draw();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('airnaval')) draw(); });
  };
}

/* ================= カードガチャ画面 ================= */

export function renderGachaScreen(ctx) {
  return (body) => {
    body.classList.add('gacha-embed');
    const frame = document.createElement('iframe');
    frame.src = 'game/card/index.html';
    frame.title = 'カードパック・ガチャ';
    frame.className = 'gacha-frame';
    body.replaceChildren(frame);

  };
}

/* ================= 講和会議画面 ================= */

export function renderPeaceScreen(ctx) {
  return (body) => {
    const { state, peace, diplomacy } = ctx;
    body.innerHTML = '';
    body.style.padding = '10px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';

    if (!peace.isOpen()) {
      body.appendChild(el('div', 'dim small', I18N.t('peace.not_open')));
      return;
    }

    const target = peace.openTarget;
    const tNat = NATIONS[target];
    body.appendChild(el('h4', '', `${I18N.t('peace.conference_with')} ${nationName(target)}`));
    body.appendChild(el('div', 'small dim mb4', `合計戦勝点：${peace.totalScore()}`));

    body.appendChild(el('h4', '', I18N.t('peace.participants')));
    const partList = el('div', 'col');
    partList.style.gap = '4px';
    for (const p of peace.participants()) {
      partList.appendChild(el('div', 'kv', `<span class="k">${p.name}</span><span class="v">${p.score}</span>`));
    }
    body.appendChild(partList);

    body.appendChild(el('h4', '', I18N.t('peace.actions')));
    const grid = el('div', 'grid3');
    const myScore = state.warScore[state.playerTag] || 0;
    const actions = [
      { id: 'annex', label: I18N.t('peace.annex'), cost: 50 },
      { id: 'puppet', label: I18N.t('peace.puppet'), cost: 30 },
      { id: 'liberate', label: I18N.t('peace.liberate'), cost: 20 },
    ];
    // 降伏国の主要プロヴィンスを対象に（デモ：最初の1州）
    const provs = tNat ? [] : [];
    for (const act of actions) {
      const card = el('div', 'steel-card');
      card.appendChild(el('b', '', act.label));
      card.appendChild(el('div', 'small dim', `コスト: ${act.cost} 戦勝点`));
      const btn = el('button', 'steel-btn primary mt4', I18N.t('ui.confirm'));
      btn.disabled = myScore < act.cost;
      btn.onclick = () => {
        const mine = PROVINCES.find((p) => p.tag === target);
        if (mine) peace.takeState(mine.id, act.id);
      };
      card.appendChild(btn);
      grid.appendChild(card);
    }
    body.appendChild(grid);

    const closeBtn = el('button', 'steel-btn danger mt8', I18N.t('ui.close'));
    closeBtn.onclick = () => { peace.close(); ctx.modals.close('peace'); };
    body.appendChild(closeBtn);
  };
}

/* ================= 特別研究画面 ================= */

export function renderSpecialScreen(ctx) {
  return (body) => {
    const { state, special } = ctx;
    body.innerHTML = '';
    body.style.padding = '10px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';

    body.appendChild(el('h4', '', I18N.t('special.title')));
    body.appendChild(el('div', 'small dim mb4', I18N.t('special.hint')));

    const grid = el('div', 'grid3');
    for (const proj of Object.values(special.projects)) {
      const sci = special.scientists.find((s) => s.id === proj.assignedScientistId);
      const card = el('div', 'steel-card');
      card.appendChild(el('b', '', proj.name));
      card.appendChild(el('div', 'small dim', proj.desc));
      if (proj.completed) {
        card.appendChild(el('div', 'badge green mt4', I18N.t('special.completed')));
      } else if (!proj.assignedScientistId) {
        card.appendChild(el('div', 'small mt4', I18N.t('special.no_scientist')));
        const sel = el('select', 'steel-select mt4');
        for (const s of special.scientists) {
          if (s.category !== proj.category) continue;
          const o = el('option', '', s.name); o.value = s.id; sel.appendChild(o);
        }
        const go = el('button', 'steel-btn primary mt4', I18N.t('special.assign'));
        go.onclick = () => { special.assignScientist(proj.id, sel.value); draw(); };
        card.appendChild(sel); card.appendChild(go);
      } else {
        const pct = Math.round(special.progressPct(proj.id) * 100);
        card.appendChild(el('div', `small`, `担当: ${sci ? sci.name : '?'}`));
        const bar = el('div', 'mil-bar mt4');
        bar.appendChild(el('i', `style="width:${pct}%"`));
        bar.appendChild(el('b', '', `${pct}%`));
        card.appendChild(bar);
        card.appendChild(el('div', 'small dim', I18N.t('special.in_progress')));
      }
      grid.appendChild(card);
    }
    body.appendChild(grid);

    const draw = () => { grid.innerHTML = ''; /* re-render above */ };
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('special')) { /* 再描画は内容が重いため省略 */ } });
  };
}

/* ================= 核攻撃画面 ================= */

export function renderNukeScreen(ctx) {
  return (body) => {
    const { state, nukes, mapEngine } = ctx;
    body.innerHTML = '';
    body.style.padding = '10px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';

    body.appendChild(el('h4', '', I18N.t('nukes.title')));
    body.appendChild(el('div', `small dim mb4 ${(state.nukes || 0) > 0 ? 'good' : 'bad'}`,
      `核弾頭: ${state.nukes || 0}   核開発: ${state.nuclearResearched ? I18N.t('nukes.researched') : I18N.t('nukes.not_researched')}`));

    body.appendChild(el('h4', '', I18N.t('nukes.targets')));
    const list = el('div', 'col');
    list.style.gap = '6px';
    const draw = () => {
      list.innerHTML = '';
      const importMapData = () => import('../map-data.js').then(({ PROVINCES }) => {
        for (const p of PROVINCES) {
          const check = nukes.canNuke(p.id);
          const card = el('div', `steel-card row ${check.ok ? '' : 'opacity-50'}`);
          card.style.opacity = check.ok ? '1' : '0.55';
          card.appendChild(el('b', '', p.name));
          card.appendChild(el('span', 'dim small grow', `${nationName(p.tag)} ・ ${check.ok ? I18N.t('nukes.ready') : check.msg}`));
          const btn = el('button', 'steel-btn danger mt4', I18N.t('nukes.launch'));
          btn.disabled = !check.ok;
          btn.onclick = () => { if (nukes.executeNuke(p.id)) draw(); };
          card.appendChild(btn);
          list.appendChild(card);
        }
      });
      importMapData();
    };
    draw();

    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('nukes')) draw(); });
  };
}
