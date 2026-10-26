/**
 * ui/air-ui.js — 空軍画面 / 空域情報ウィンドウ / マップ州パネル（建設ボタン）
 *
 *  ・renderAirForceScreen(ctx)  : トップバー「空軍」から開く全画面。航空隊の編成・移動・任務・補充
 *  ・renderAirRegionBody(ctx, regionId) : 空域クリック時の制空権ウィンドウ
 *  ・openAirRegionModal(ctx, regionId)   : 上記をモーダルで開く
 *  ・installProvincePanel(ctx)  : マップ上で自国州をクリックしたときの州パネル（航空基地の建設ボタン）
 */

import { el, fmt, toast } from '../util.js';
import { PROVINCES, PROVINCE_BY_ID, terrainInfo } from '../map-data.js';
import {
  AIRBASE, AIR_WING_TYPES, AIR_WING_TYPE_IDS, AIR_MISSIONS, AIR_MISSION_IDS,
  AIR_STATUS_LABEL,
} from '../air-wings.js';

const nf = (n) => fmt(Number(n) || 0);
const pct = (n) => `${Math.round(Number(n) || 0)}%`;

/* ============================================================
 * 共通部品
 * ========================================================== */

function sectionTitle(text) { return el('div', 'section-title', text); }
function led(cls) { return el('span', `led ${cls}`); }

function typeInfo(type) { return AIR_WING_TYPES[type] || { name: type, icon: '✈', color: '#8b96a0' }; }

function pips(level, max, cls = '') {
  const wrap = el('div', `air-pips ${cls}`.trim());
  for (let i = 0; i < max; i++) {
    const pip = el('span', `air-pip${i < level ? ' on' : ''}`);
    if (i < level) pip.style.background = 'linear-gradient(180deg,#9fd0ee,#3f7fa6)';
    wrap.appendChild(pip);
  }
  return wrap;
}

function statBar(value, max = 100, cls = '') {
  const bar = el('div', `mil-bar air-stat-bar ${cls}`.trim());
  const fill = el('i');
  fill.style.width = `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  bar.appendChild(fill);
  const b = el('b', '', pct(value));
  bar.appendChild(b);
  return bar;
}

function statusBadge(status) {
  const badge = el('span', `air-status-badge ${status}`);
  badge.appendChild(led(status === 'green' ? 'green' : status === 'yellow' ? 'yellow' : 'red'));
  badge.appendChild(el('span', '', AIR_STATUS_LABEL[status] || status));
  return badge;
}

/** 自軍/敵軍の制空権バー */
function supremacyBar(ownPct, height = 14) {
  const wrap = el('div', 'air-sup-bar');
  wrap.style.height = `${height}px`;
  const own = el('i', 'own');
  own.style.width = `${Math.max(0, Math.min(100, ownPct))}%`;
  const enemy = el('i', 'enemy');
  enemy.style.width = `${100 - Math.max(0, Math.min(100, ownPct))}%`;
  wrap.appendChild(own);
  wrap.appendChild(enemy);
  const ownLabel = el('span', 'air-sup-own', `自軍 ${Math.round(ownPct)}%`);
  const enemyLabel = el('span', 'air-sup-enemy', `敵軍 ${Math.round(100 - ownPct)}%`);
  wrap.appendChild(ownLabel);
  wrap.appendChild(enemyLabel);
  return wrap;
}

function ownedProvinces(state) {
  return PROVINCES.filter((p) => p.tag === state.playerTag);
}

/** 航空基地を持つ（または建設できる）自国州 */
function ownBases(state, mgr) {
  return ownedProvinces(state)
    .filter((p) => mgr.airbaseLevel(p.id) > 0)
    .sort((a, b) => mgr.airbaseLevel(b.id) - mgr.airbaseLevel(a.id) || (b.vp || 0) - (a.vp || 0));
}

/* ============================================================
 * 空軍画面
 * ========================================================== */

export function renderAirForceScreen(ctx) {
  return (body) => {
    const { state, modals } = ctx;
    const mgr = ctx.airWings || state?._airWingMgr;
    body.innerHTML = '';
    body.style.padding = '10px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.classList.add('air-screen');

    if (!mgr) {
      body.appendChild(el('div', 'air-empty', '航空隊システムが初期化されていません'));
      return;
    }

    let filter = 'all';

    const root = el('div', 'air-root');
    body.appendChild(root);

    const draw = () => {
      root.innerHTML = '';
      root.appendChild(headBar());
      const grid = el('div', 'air-grid');
      grid.appendChild(wingsColumn());
      grid.appendChild(regionsColumn());
      root.appendChild(grid);
    };

    /* ---------- ヘッダー ---------- */
    function headBar() {
      const sum = mgr.summary();
      const head = el('div', 'air-head');
      const left = el('div', 'air-head-left');
      const title = el('div', 'air-title');
      title.appendChild(el('span', 'air-title-main', '空軍'));
      title.appendChild(el('span', 'air-title-sub', 'AIR FORCE COMMAND'));
      left.appendChild(title);
      const chips = el('div', 'air-chips');
      const chip = (k, v, cls = '') => {
        const c = el('div', `air-chip ${cls}`.trim());
        c.appendChild(el('span', 'k', k));
        c.appendChild(el('b', '', v));
        return c;
      };
      chips.appendChild(chip('総機数', `${nf(sum.aircraft)} 機`));
      chips.appendChild(chip('航空隊', `${sum.wings}`));
      chips.appendChild(chip('練度', pct(sum.avgTraining), sum.avgTraining >= 70 ? 'good' : sum.avgTraining >= 45 ? 'warn' : 'bad'));
      chips.appendChild(chip('稼働率', pct(sum.avgReadiness), sum.avgReadiness >= 80 ? 'good' : sum.avgReadiness >= 55 ? 'warn' : 'bad'));
      chips.appendChild(chip('航空基地', `${sum.bases} 州 / Lv${sum.baseLevels}`, ''));
      chips.appendChild(chip('空域 優勢', `${sum.superiorityRegions} / 均衡 ${sum.contestedRegions} / 劣勢 ${sum.lostRegions}`));
      left.appendChild(chips);
      head.appendChild(left);

      const right = el('div', 'air-head-right');
      const status = el('div', 'air-status-items');
      const mk = (label, n, status) => {
        const s = el('span', `air-status-item ${status}`);
        s.appendChild(led(status === 'green' ? 'green' : status === 'yellow' ? 'yellow' : 'red'));
        s.appendChild(el('span', '', label));
        s.appendChild(el('b', '', String(n)));
        return s;
      };
      status.appendChild(mk('優勢', sum.superiorityRegions, 'green'));
      status.appendChild(mk('均衡', sum.contestedRegions, 'yellow'));
      status.appendChild(mk('劣勢', sum.lostRegions, 'red'));
      right.appendChild(status);

      const stock = el('div', 'air-stock');
      for (const t of AIR_WING_TYPE_IDS) {
        const info = AIR_WING_TYPES[t];
        const s = el('span', 'air-stock-item');
        s.style.borderColor = info.color;
        s.appendChild(el('span', 'ico', info.icon));
        s.appendChild(el('span', '', `${info.name} ${nf(mgr.availableAircraft(t))}`));
        stock.appendChild(s);
      }
      right.appendChild(stock);

      const btns = el('div', 'air-head-btns');
      const airMap = el('button', 'steel-btn primary', '🗺 空域マップ（空軍モード）');
      airMap.type = 'button';
      airMap.onclick = () => {
        ctx.mapEngine?.setMode?.('air');
        modals?.close('airforce');
      };
      const reinforceAll = el('button', 'steel-btn', '⤒ 全航空隊を補充');
      reinforceAll.type = 'button';
      reinforceAll.onclick = () => {
        let n = 0;
        for (const w of mgr.wings()) {
          const r = mgr.reinforce(w.id);
          if (r.ok) n += r.count;
        }
        toast(n > 0 ? `航空隊を ${n} 機補充しました` : '補充できる機体がありません', n > 0 ? 'good' : 'info');
        draw();
      };
      btns.appendChild(airMap);
      btns.appendChild(reinforceAll);
      right.appendChild(btns);
      head.appendChild(right);
      return head;
    }

    /* ---------- 航空隊 ---------- */
    function createForm() {
      const box = el('div', 'air-create');
      const typeSel = el('select', 'steel-select');
      for (const t of AIR_WING_TYPE_IDS) {
        const o = el('option', '', `${AIR_WING_TYPES[t].name}（備蓄 ${nf(mgr.availableAircraft(t))}）`);
        o.value = t;
        typeSel.appendChild(o);
      }
      const count = el('input', 'steel-input');
      count.type = 'number';
      count.min = '10';
      count.max = '200';
      count.step = '10';
      count.value = '100';
      count.style.width = '76px';

      const baseSel = el('select', 'steel-select');
      const bases = ownedProvinces(state);
      for (const p of bases) {
        const lv = mgr.airbaseLevel(p.id);
        const free = mgr.baseFree(p.id);
        const o = el('option', '', `${p.name} Lv${lv}（空き ${free} 機）`);
        o.value = p.id;
        if (lv < 1 || free <= 0) o.disabled = true;
        baseSel.appendChild(o);
      }
      const go = el('button', 'steel-btn primary', '編成');
      go.type = 'button';
      go.onclick = () => {
        const r = mgr.createWing({
          type: typeSel.value,
          count: Number(count.value) || 100,
          baseProvince: baseSel.value,
        });
        if (!r.ok) { toast(`編成できません: ${r.reason}`, 'bad'); return; }
        toast(`${r.wing.name} を編成しました（${r.wing.count} 機）${r.clamped ? ' ※基地容量/備蓄の上限に合わせて調整' : ''}`, 'good');
        draw();
      };
      box.appendChild(el('span', 'air-create-label', '新規航空隊'));
      box.appendChild(typeSel);
      box.appendChild(count);
      box.appendChild(baseSel);
      box.appendChild(go);
      return box;
    }

    function wingsColumn() {
      const wrap = el('section', 'air-col air-col-wings');
      const head = el('div', 'air-section-head');
      head.appendChild(sectionTitle('航空隊'));
      const tabs = el('div', 'air-filter');
      for (const [id, label] of [['all', '全航空隊'], ['fighter', '戦闘機'], ['cas', 'CAS'], ['strat', '戦略爆撃'], ['idle', '未割当']]) {
        const b = el('button', `air-filter-btn${filter === id ? ' active' : ''}`, label);
        b.type = 'button';
        b.onclick = () => { filter = id; draw(); };
        tabs.appendChild(b);
      }
      head.appendChild(tabs);
      wrap.appendChild(head);
      wrap.appendChild(createForm());

      const list = el('div', 'air-wings');
      const all = mgr.wings();
      const shown = all.filter((w) => {
        if (filter === 'all') return true;
        if (filter === 'strat') return w.type === 'strategic_bomber';
        if (filter === 'idle') return !w.mission;
        return w.type === filter;
      });
      if (!shown.length) {
        list.appendChild(el('div', 'air-empty', '該当する航空隊がありません。上のフォームで編成してください。'));
      }
      for (const w of shown) list.appendChild(wingCard(w));
      wrap.appendChild(list);
      return wrap;
    }

    function wingCard(w) {
      const info = typeInfo(w.type);
      const card = el('div', 'air-wing');
      card.style.setProperty('--air-color', info.color);

      const head = el('div', 'air-wing-head');
      head.appendChild(el('span', 'air-wing-icon', info.icon));
      const nameWrap = el('div', 'air-wing-name');
      nameWrap.appendChild(el('div', 'air-wing-title', w.name || info.name));
      const sub = el('div', 'air-wing-sub');
      sub.appendChild(el('span', '', info.name));
      sub.appendChild(el('span', 'sep', '・'));
      sub.appendChild(el('span', '', `基地 ${PROVINCE_BY_ID[w.baseProvince]?.name || '—'}`));
      if (w.region) {
        sub.appendChild(el('span', 'sep', '・'));
        sub.appendChild(el('span', '', mgr.regionById(w.region)?.name || w.region));
      }
      nameWrap.appendChild(sub);
      head.appendChild(nameWrap);
      const count = el('div', 'air-wing-count');
      count.appendChild(el('b', '', `${nf(w.count)}`));
      count.appendChild(el('span', '', '機'));
      head.appendChild(count);
      card.appendChild(head);

      // 任務バッジ
      const mission = w.mission ? AIR_MISSIONS[w.mission] : null;
      const mRow = el('div', 'air-wing-missions');
      const badge = el('span', `air-mission-badge${mission ? '' : ' idle'}`);
      if (mission) badge.style.borderColor = mission.color;
      badge.appendChild(el('span', '', `${mission ? mission.icon : '·'} ${mission ? mission.name : '待機'}`));
      mRow.appendChild(badge);
      if (w.region) mRow.appendChild(el('span', 'air-wing-region', mgr.regionById(w.region)?.name || w.region));
      card.appendChild(mRow);

      // 練度 / 稼働率
      const stats = el('div', 'air-wing-stats');
      const stat = (label, value) => {
        const row = el('div', 'air-wing-stat');
        row.appendChild(el('span', 'k', label));
        row.appendChild(statBar(value, 100, value >= 70 ? 'good' : value >= 45 ? 'warn' : 'bad'));
        return row;
      };
      stats.appendChild(stat('練度', w.training || 0));
      stats.appendChild(stat('稼働率', w.readiness ?? 100));
      card.appendChild(stats);

      // 任務割当
      const assign = el('div', 'air-wing-assign');
      const regSel = el('select', 'steel-select');
      const empty = el('option', '', '空域を選択');
      empty.value = '';
      regSel.appendChild(empty);
      for (const r of mgr.allRegions()) {
        const o = el('option', '', `${r.name}（自軍 ${r.ownPct}%）`);
        o.value = r.id;
        if (w.region === r.id) o.selected = true;
        regSel.appendChild(o);
      }
      const misSel = el('select', 'steel-select');
      const none = el('option', '', '任務なし');
      none.value = '';
      misSel.appendChild(none);
      for (const m of AIR_MISSION_IDS) {
        const o = el('option', '', `${AIR_MISSIONS[m].icon} ${AIR_MISSIONS[m].name}`);
        o.value = m;
        if (w.mission === m) o.selected = true;
        misSel.appendChild(o);
      }
      const apply = el('button', 'steel-btn primary', '任務適用');
      apply.type = 'button';
      apply.onclick = () => {
        const r = mgr.setMission(w.id, regSel.value || null, misSel.value || null);
        if (!r.ok) { toast(`任務を割り当てできません: ${r.reason}`, 'bad'); return; }
        toast(r.wing.mission
          ? `${r.wing.name} に「${AIR_MISSIONS[r.wing.mission].name}」を割り当てました`
          : `${r.wing.name} の任務を解除しました`, 'good');
        draw();
      };
      assign.appendChild(regSel);
      assign.appendChild(misSel);
      assign.appendChild(apply);
      card.appendChild(assign);

      // 移動 / 補充 / 解散
      const ops = el('div', 'air-wing-ops');
      const baseSel = el('select', 'steel-select');
      for (const p of ownBases(state, mgr)) {
        const o = el('option', '', `${p.name} Lv${mgr.airbaseLevel(p.id)}（空き ${mgr.baseFree(p.id)}）`);
        o.value = p.id;
        if (w.baseProvince === p.id) o.selected = true;
        baseSel.appendChild(o);
      }
      const move = el('button', 'steel-btn', '移動');
      move.type = 'button';
      move.title = '選択した航空基地へ移動します';
      move.onclick = () => {
        const r = mgr.moveWing(w.id, baseSel.value);
        if (!r.ok) { toast(`移動できません: ${r.reason}`, 'bad'); return; }
        toast(`${r.wing.name} を ${PROVINCE_BY_ID[r.wing.baseProvince].name} へ移動しました`, 'good');
        draw();
      };
      const reinf = el('button', 'steel-btn', '補充');
      reinf.type = 'button';
      reinf.onclick = () => {
        const r = mgr.reinforce(w.id);
        if (!r.ok) { toast(`補充できません: ${r.reason}`, 'bad'); return; }
        toast(`${r.wing.name} に ${r.count} 機を補充しました`, 'good');
        draw();
      };
      const train = el('button', 'steel-btn', '訓練');
      train.type = 'button';
      train.disabled = w.mission === 'training';
      train.onclick = () => {
        const region = w.region || mgr.regionForProvince(w.baseProvince)?.id;
        const r = mgr.setMission(w.id, region, 'training');
        if (!r.ok) { toast(`訓練を開始できません: ${r.reason}`, 'bad'); return; }
        toast(`${w.name} は訓練任務に就きました（練度が上昇します）`, 'good');
        draw();
      };
      const disband = el('button', 'steel-btn danger', '解散');
      disband.type = 'button';
      disband.onclick = () => {
        const r = mgr.disband(w.id);
        if (!r.ok) return;
        toast(`${w.name} を解散しました（${r.returned} 機を備蓄へ）`, 'info');
        draw();
      };
      ops.appendChild(baseSel);
      ops.appendChild(move);
      ops.appendChild(reinf);
      ops.appendChild(train);
      ops.appendChild(disband);
      card.appendChild(ops);
      return card;
    }

    /* ---------- 空域 / 航空基地 ---------- */
    function regionsColumn() {
      const wrap = el('section', 'air-col air-col-regions');
      const head = el('div', 'air-section-head');
      head.appendChild(sectionTitle('戦略空域の制空権'));
      head.appendChild(el('span', 'air-hint', 'マップの空域クリックでも同じ情報を開けます'));
      wrap.appendChild(head);

      const list = el('div', 'air-regions');
      for (const r of mgr.allRegions()) list.appendChild(regionCard(r));
      wrap.appendChild(list);

      const baseHead = el('div', 'air-section-head');
      baseHead.appendChild(sectionTitle('航空基地'));
      const addBase = el('button', 'steel-btn', '＋ 建設画面へ');
      addBase.type = 'button';
      addBase.onclick = () => {
        modals?.close('airforce');
        modals?.toggle('construction', {});
      };
      baseHead.appendChild(addBase);
      wrap.appendChild(baseHead);
      wrap.appendChild(baseList());
      return wrap;
    }

    function regionCard(r) {
      const card = el('div', `air-region status-${r.status}`);
      const top = el('div', 'air-region-top');
      top.appendChild(el('b', '', r.name));
      top.appendChild(statusBadge(r.status));
      card.appendChild(top);
      card.appendChild(supremacyBar(r.ownPct));
      const meta = el('div', 'air-region-meta');
      meta.appendChild(el('span', '', `航空隊 ${r.wingCount}（${nf(r.aircraft)} 機）`));
      meta.appendChild(el('span', 'sep', '・'));
      meta.appendChild(el('span', '', `制空 ${r.supWings} / CAS ${r.casWings} / 爆撃 ${r.stratWings}`));
      card.appendChild(meta);
      const bonus = el('div', 'air-region-bonus');
      bonus.appendChild(el('span', 'k', 'CAS 支援'));
      bonus.appendChild(el('b', '', `+${Math.round(mgr.casBonusForRegion(r.id) * 100)}%`));
      if (r.strategicPower > 0) {
        bonus.appendChild(el('span', 'sep', '・'));
        bonus.appendChild(el('span', 'k', '戦略爆撃力'));
        bonus.appendChild(el('b', '', nf(r.strategicPower)));
      }
      card.appendChild(bonus);
      const btn = el('button', 'steel-btn mt4', '空域の詳細');
      btn.type = 'button';
      btn.onclick = () => openAirRegionModal(ctx, r.id);
      card.appendChild(btn);
      return card;
    }

    function baseList() {
      const list = el('div', 'air-bases');
      const bases = ownedProvinces(state)
        .slice()
        .sort((a, b) => mgr.airbaseLevel(b.id) - mgr.airbaseLevel(a.id) || (b.vp || 0) - (a.vp || 0));
      for (const p of bases) {
        const lv = mgr.airbaseLevel(p.id);
        const used = mgr.usedCapacity(p.id);
        const cap = mgr.baseCapacity(p.id);
        const queens = (state.constructionQueue || []).find((q) => q.type === 'air_base' && q.provinceId === p.id);
        const row = el('div', `air-base${lv === 0 ? ' empty' : ''}`);
        const left = el('div', 'air-base-left');
        const nameRow = el('div', 'air-base-name');
        nameRow.appendChild(el('span', '', p.name));
        if (lv > 0) nameRow.appendChild(el('b', '', `Lv${lv}`));
        else nameRow.appendChild(el('span', 'air-base-none', '基地なし'));
        left.appendChild(nameRow);
        left.appendChild(pips(lv, AIRBASE.MAX_LEVEL, 'base'));
        const capBar = el('div', 'air-base-cap');
        capBar.appendChild(el('span', '', `収容 ${used} / ${cap} 機`));
        const bar = el('div', 'mil-bar air-base-bar');
        const fill = el('i');
        fill.style.width = `${cap > 0 ? Math.min(100, (used / cap) * 100) : 0}%`;
        bar.appendChild(fill);
        capBar.appendChild(bar);
        left.appendChild(capBar);
        row.appendChild(left);

        const right = el('div', 'air-base-right');
        if (queens) {
          const q = el('div', 'air-base-queue');
          const bar2 = el('div', 'mil-bar');
          const f2 = el('i');
          f2.style.width = `${Math.min(100, ((queens.progress || 0) / (queens.days || 1)) * 100)}%`;
          bar2.appendChild(f2);
          q.appendChild(el('span', '', `建設中 Lv${queens.targetLevel}（残り ${Math.max(0, Math.ceil((queens.days || 0) - (queens.progress || 0)))} 日）`));
          q.appendChild(bar2);
          right.appendChild(q);
        } else {
          const chk = mgr.canBuildBase(p.id);
          const b = el('button', 'steel-btn air-base-build', lv >= AIRBASE.MAX_LEVEL ? `Lv${lv}（最大）` : (lv === 0 ? '航空基地 建設' : `Lv${lv} → ${lv + 1}`));
          b.type = 'button';
          if (!chk.ok) { b.disabled = true; b.title = chk.reason; }
          else b.title = `工期 約${chk.days}日（民需工場を使用）`;
          b.onclick = () => {
            const r = mgr.enqueueBase(p.id);
            if (!r.ok) { toast(`建設できません: ${r.reason}`, 'bad'); return; }
            toast(`${p.name} の航空基地建設を予約しました（約${r.days}日）`, 'good');
            draw();
          };
          right.appendChild(b);
        }
        row.appendChild(right);
        list.appendChild(row);
      }
      return list;
    }

    draw();
    // 開いている間は 1 秒ごとに進捗・練度を更新
    const timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      // 操作中（セレクトや入力）は再描画しない
      const active = document.activeElement;
      if (active && root.contains(active) && /^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(active.tagName)) return;
      if (body.isConnected) draw();
    }, 2500);
    const offs = [
      state.bus?.on('air-changed', () => { if (root.isConnected) draw(); }),
      state.bus?.on('airbase-changed', () => { if (root.isConnected) draw(); }),
      state.bus?.on('construction-queued', () => { if (root.isConnected) draw(); }),
      state.bus?.on('construction-completed', () => { if (root.isConnected) draw(); }),
    ].filter(Boolean);
    // 画面が閉じられたら監視を止める
    const watcher = setInterval(() => {
      if (!root.isConnected) {
        clearInterval(timer); clearInterval(watcher);
        for (const off of offs) { try { off(); } catch { /* ignore */ } }
      }
    }, 1000);
  };
}

/* ============================================================
 * 空域情報ウィンドウ
 * ========================================================== */

export function renderAirRegionBody(ctx, regionId) {
  return (body) => {
    const { state } = ctx;
    const mgr = ctx.airWings || state?._airWingMgr;
    body.innerHTML = '';
    body.classList.add('air-region-modal');
    if (!mgr) { body.appendChild(el('div', 'air-empty', '航空隊システムが初期化されていません')); return; }

    const draw = () => {
      body.innerHTML = '';
      const r = mgr.regionInfo(regionId);
      if (!r) { body.appendChild(el('div', 'air-empty', '空域が見つかりません')); return; }

      const head = el('div', 'air-region-window-head');
      const titleWrap = el('div', '');
      titleWrap.appendChild(el('div', 'air-region-window-title', r.name));
      const meta = el('div', 'air-region-window-meta');
      meta.appendChild(statusBadge(r.status));
      meta.appendChild(el('span', 'air-region-window-pct', `自軍 ${r.ownPct}% / 敵軍 ${r.enemyPct}%`));
      titleWrap.appendChild(meta);
      head.appendChild(titleWrap);
      body.appendChild(head);

      body.appendChild(supremacyBar(r.ownPct, 20));

      const stats = el('div', 'air-region-stats');
      const stat = (k, v, cls = '') => {
        const c = el('div', `air-region-stat ${cls}`.trim());
        c.appendChild(el('span', 'k', k));
        c.appendChild(el('b', '', v));
        return c;
      };
      stats.appendChild(stat('航空戦力（自軍）', nf(r.ownPower)));
      stats.appendChild(stat('航空戦力（敵軍）', nf(r.enemyPower)));
      stats.appendChild(stat('航空隊', `${r.wingCount}（${nf(r.aircraft)} 機）`));
      stats.appendChild(stat('CAS 支援', `+${Math.round(mgr.casBonusForRegion(regionId) * 100)}%`, r.casWings ? 'good' : ''));
      stats.appendChild(stat('戦略爆撃力', nf(r.strategicPower), r.stratWings ? 'warn' : ''));
      stats.appendChild(stat('任務内訳', `制空 ${r.supWings} / CAS ${r.casWings} / 爆撃 ${r.stratWings}`));
      body.appendChild(stats);

      body.appendChild(el('div', 'air-region-window-note',
        `制空権が高いほど CAS・戦略爆撃の効果が上がります。現在の地上支援係数は ${Math.round((0.45 + 0.55 * (r.ownPct / 100)) * 100)}% です。`));

      // この空域の航空隊
      body.appendChild(sectionTitle('この空域の航空隊'));
      const wings = mgr.wings().filter((w) => w.region === regionId);
      const list = el('div', 'air-region-wings');
      if (!wings.length) {
        list.appendChild(el('div', 'air-empty', 'この空域に任務中の航空隊はありません。'));
      }
      for (const w of wings) {
        const info = typeInfo(w.type);
        const row = el('div', 'air-region-wing');
        row.style.setProperty('--air-color', info.color);
        row.appendChild(el('span', 'air-wing-icon', info.icon));
        const nm = el('div', 'air-region-wing-name');
        nm.appendChild(el('b', '', w.name || info.name));
        nm.appendChild(el('span', 'air-region-wing-sub', `${info.name} ・ ${PROVINCE_BY_ID[w.baseProvince]?.name || '—'} ・ ${nf(w.count)} 機`));
        row.appendChild(nm);
        const misSel = el('select', 'steel-select');
        for (const m of AIR_MISSION_IDS) {
          const o = el('option', '', AIR_MISSIONS[m].name);
          o.value = m;
          if (w.mission === m) o.selected = true;
          misSel.appendChild(o);
        }
        misSel.onchange = () => {
          const res = mgr.setMission(w.id, regionId, misSel.value);
          if (!res.ok) toast(`変更できません: ${res.reason}`, 'bad');
          else toast(`${w.name}: ${AIR_MISSIONS[misSel.value].name}`, 'good');
          draw();
        };
        row.appendChild(misSel);
        const detach = el('button', 'steel-btn danger', '解除');
        detach.type = 'button';
        detach.onclick = () => { mgr.setMission(w.id, null, null); draw(); };
        row.appendChild(detach);
        list.appendChild(row);
      }
      body.appendChild(list);

      // 未割当の航空隊をこの空域へ
      const idle = mgr.wings().filter((w) => !w.region);
      if (idle.length) {
        body.appendChild(sectionTitle('この空域へ割り当てる'));
        const assignBox = el('div', 'air-region-assign');
        const wingSel = el('select', 'steel-select');
        for (const w of idle) {
          const o = el('option', '', `${w.name || typeInfo(w.type).name}（${nf(w.count)} 機 / 基地 ${PROVINCE_BY_ID[w.baseProvince]?.name || '—'}）`);
          o.value = w.id;
          wingSel.appendChild(o);
        }
        const misSel2 = el('select', 'steel-select');
        for (const m of AIR_MISSION_IDS) {
          const o = el('option', '', `${AIR_MISSIONS[m].icon} ${AIR_MISSIONS[m].name}`);
          o.value = m;
          misSel2.appendChild(o);
        }
        const go = el('button', 'steel-btn primary', '割当');
        go.type = 'button';
        go.onclick = () => {
          const res = mgr.setMission(wingSel.value, regionId, misSel2.value);
          if (!res.ok) toast(`割当できません: ${res.reason}`, 'bad');
          else toast(`「${AIR_MISSIONS[misSel2.value].name}」を割り当てました`, 'good');
          draw();
        };
        assignBox.appendChild(wingSel);
        assignBox.appendChild(misSel2);
        assignBox.appendChild(go);
        body.appendChild(assignBox);
      }

      // 空域内の州
      body.appendChild(sectionTitle('空域内の州'));
      const provList = el('div', 'air-region-provinces');
      for (const pid of r.provinces) {
        const p = PROVINCE_BY_ID[pid];
        if (!p) continue;
        const row = el('div', 'air-region-province');
        row.appendChild(el('b', '', p.name));
        row.appendChild(el('span', 'dim small', p.tag === state.playerTag ? '自国' : p.tag));
        row.appendChild(el('span', 'small dim', `VP ${p.vp || 0} ・ 航空基地 Lv${mgr.airbaseLevel(p.id)} ・ 工場 ${mgr.factoryCount(p.id)}`));
        if (p.airDamage > 0 || p.factoryDamage > 0) {
          row.appendChild(el('span', 'small', `爆撃被害 施設 ${Math.round(p.airDamage || 0)}% / 工場 ${Math.round(p.factoryDamage || 0)}%`)).style.color = '#e08a6a';
        }
        provList.appendChild(row);
      }
      body.appendChild(provList);

      const foot = el('div', 'air-region-foot');
      const airBtn = el('button', 'steel-btn primary', '空軍画面を開く');
      airBtn.type = 'button';
      airBtn.onclick = () => {
        ctx.modals?.close('airregion');
        ctx.modals?.toggle('airforce', {});
      };
      const mapBtn = el('button', 'steel-btn', 'マップで空域を見る');
      mapBtn.type = 'button';
      mapBtn.onclick = () => {
        ctx.mapEngine?.setMode?.('air');
        ctx.modals?.close('airregion');
      };
      foot.appendChild(mapBtn);
      foot.appendChild(airBtn);
      body.appendChild(foot);
    };

    draw();
    const off = state.bus?.on('air-changed', () => {
      const active = document.activeElement;
      if (active && body.contains(active) && /^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(active.tagName)) return;
      if (body.isConnected) draw();
    });
    const watcher = setInterval(() => {
      if (!body.isConnected) { clearInterval(watcher); try { off?.(); } catch { /* ignore */ } }
    }, 1000);
  };
}

/** 空域情報ウィンドウをモーダルで開く */
export function openAirRegionModal(ctx, regionId) {
  const mgr = ctx.airWings || ctx.state?._airWingMgr;
  const region = mgr?.regionById?.(regionId);
  if (!ctx.modals) return false;
  ctx.modals.open('airregion', {
    title: region ? `空域：${region.name}` : '空域情報',
    width: 'wide',
    render: renderAirRegionBody(ctx, regionId),
  });
  return true;
}

/* ============================================================
 * マップ州パネル（建設ボタン）
 * ========================================================== */

export function installProvincePanel(ctx) {
  const host = document.getElementById('map-view') || document.body;
  const root = el('div', 'province-panel');
  root.style.display = 'none';
  host.appendChild(root);

  let current = null;

  const supply = () => ctx.supply || ctx.state?._supplyMgr;
  const air = () => ctx.airWings || ctx.state?._airWingMgr;

  function close() {
    current = null;
    root.style.display = 'none';
    root.innerHTML = '';
  }

  function open(provinceId) {
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return;
    current = provinceId;
    root.innerHTML = '';
    root.style.display = '';
    const isOwn = p.tag === ctx.state.playerTag;
    const mgr = supply();
    const airMgr = air();
    const region = airMgr?.regionForProvince?.(p.id) || null;

    /* ヘッダー */
    const head = el('div', 'prov-head');
    const title = el('div', 'prov-title');
    title.appendChild(el('span', 'prov-name', p.name));
    if (p.capital) title.appendChild(el('span', 'prov-capital', '首都'));
    title.appendChild(el('span', 'prov-tag', isOwn ? '自国' : p.tag));
    head.appendChild(title);
    const x = el('button', 'prov-close', '✕');
    x.type = 'button';
    x.title = '閉じる';
    x.onclick = close;
    head.appendChild(x);
    root.appendChild(head);

    const meta = el('div', 'prov-meta');
    meta.appendChild(el('span', '', `VP ${p.vp || 0}`));
    meta.appendChild(el('span', 'sep', '・'));
    meta.appendChild(el('span', '', terrainInfo(p.terrain)?.name || p.terrain));
    if (region) {
      meta.appendChild(el('span', 'sep', '・'));
      meta.appendChild(el('span', '', region.name));
    }
    root.appendChild(meta);

    /* 建設行 */
    const rows = el('div', 'prov-rows');
    const buildRow = ({ label, level, max, note, disabled, disabledReason, onClick }) => {
      const row = el('div', 'prov-row');
      const top = el('div', 'prov-row-top');
      top.appendChild(el('span', 'prov-row-label', label));
      top.appendChild(el('b', 'prov-row-level', max ? `${level} / ${max}` : `${level}`));
      row.appendChild(top);
      if (max) row.appendChild(pips(level, max));
      if (note) row.appendChild(el('div', 'prov-row-note', note));
      if (!isOwn) return row;
      const b = el('button', 'steel-btn prov-build', disabled ? '建設不可' : '建設');
      b.type = 'button';
      if (disabled) { b.disabled = true; b.title = disabledReason || ''; }
      b.onclick = () => {
        onClick?.();
        open(provinceId);
      };
      row.appendChild(b);
      return row;
    };

    if (mgr) {
      const infra = mgr.infra(p.id);
      const chk = mgr.canBuild(p.id, 'infrastructure');
      rows.appendChild(buildRow({
        label: 'インフラ', level: infra, max: 5,
        note: `現地調達 +${(infra * 0.8).toFixed(1)}`,
        disabled: !chk.ok, disabledReason: chk.reason,
        onClick: () => {
          const r = mgr.enqueue(p.id, 'infrastructure');
          toast(r.ok ? `${p.name} のインフラ建設を予約しました（約${r.days}日）` : `建設できません: ${r.reason}`, r.ok ? 'good' : 'bad');
        },
      }));
      const hub = mgr.hubLevel(p.id);
      const chkHub = mgr.canBuild(p.id, 'supply_hub');
      rows.appendChild(buildRow({
        label: '補給ハブ', level: hub, max: 3,
        note: hub > 0 ? '補給源として機能中' : '未建設（現地調達のみ）',
        disabled: !chkHub.ok, disabledReason: chkHub.reason,
        onClick: () => {
          const r = mgr.enqueue(p.id, 'supply_hub');
          toast(r.ok ? `${p.name} の補給ハブ建設を予約しました（約${r.days}日）` : `建設できません: ${r.reason}`, r.ok ? 'good' : 'bad');
        },
      }));
    }

    if (airMgr) {
      const lv = airMgr.airbaseLevel(p.id);
      const used = airMgr.usedCapacity(p.id);
      const cap = airMgr.baseCapacity(p.id);
      const queued = airMgr.provinceInfo(p.id)?.queued;
      const chk = airMgr.canBuildBase(p.id);
      rows.appendChild(buildRow({
        label: '航空基地', level: lv, max: AIRBASE.MAX_LEVEL,
        note: queued
          ? `建設中 → Lv${queued.targetLevel}（残り ${Math.max(0, Math.ceil((queued.days || 0) - (queued.progress || 0)))} 日）`
          : (lv > 0 ? `収容 ${used} / ${cap} 機` : '航空隊の配備には Lv1 以上が必要'),
        disabled: !chk.ok || Boolean(queued), disabledReason: queued ? '建設中です' : chk.reason,
        onClick: () => {
          const r = airMgr.enqueueBase(p.id);
          toast(r.ok ? `${p.name} の航空基地建設を予約しました（約${r.days}日）` : `建設できません: ${r.reason}`, r.ok ? 'good' : 'bad');
        },
      }));
    }
    root.appendChild(rows);

    /* 産業・被害 */
    if (airMgr) {
      const info = airMgr.provinceInfo(p.id);
      const ind = el('div', 'prov-meta');
      ind.appendChild(el('span', '', `工場 ${info.factories}`));
      ind.appendChild(el('span', 'sep', '・'));
      ind.appendChild(el('span', '', `航空基地 Lv${info.level}（${info.used}/${info.capacity} 機）`));
      if ((p.airDamage || 0) + (p.factoryDamage || 0) > 0) {
        ind.appendChild(el('span', 'sep', '・'));
        const dmg = el('span', 'prov-damage', `爆撃被害 施設 ${Math.round(p.airDamage || 0)}% / 工場 ${Math.round(p.factoryDamage || 0)}%`);
        ind.appendChild(dmg);
      }
      root.appendChild(ind);
    }

    /* 配備中の航空隊 */
    if (airMgr) {
      const wings = airMgr.wingsAt(p.id);
      if (wings.length) {
        const wl = el('div', 'prov-wings');
        wl.appendChild(el('div', 'prov-wings-title', `配備中の航空隊（${wings.length}）`));
        for (const w of wings) {
          const info = typeInfo(w.type);
          const row = el('div', 'prov-wing');
          row.style.setProperty('--air-color', info.color);
          row.appendChild(el('span', 'air-wing-icon', info.icon));
          row.appendChild(el('span', 'prov-wing-name', w.name || info.name));
          row.appendChild(el('span', 'prov-wing-count', `×${nf(w.count)}`));
          const mission = w.mission ? AIR_MISSIONS[w.mission] : null;
          const badge = el('span', 'prov-wing-mission', mission ? `${mission.icon} ${mission.name}` : '待機');
          if (mission) badge.style.color = mission.color;
          row.appendChild(badge);
          wl.appendChild(row);
        }
        root.appendChild(wl);
      }
    }

    /* フッター */
    const foot = el('div', 'prov-foot');
    const airBtn = el('button', 'steel-btn primary', '空軍画面');
    airBtn.type = 'button';
    airBtn.onclick = () => { ctx.modals?.toggle('airforce', {}); };
    const buildBtn = el('button', 'steel-btn', '建設画面');
    buildBtn.type = 'button';
    buildBtn.onclick = () => { ctx.modals?.toggle('construction', {}); };
    foot.appendChild(buildBtn);
    foot.appendChild(airBtn);
    root.appendChild(foot);

    // マップ更新（位置合わせ不要・CSS で固定表示）
    ctx.mapEngine?.update?.();
  }

  function refresh() { if (current) open(current); }

  return {
    open,
    close,
    refresh,
    get provinceId() { return current; },
    root,
    destroy() { close(); root.remove(); },
  };
}

/* ============================================================
 * 他画面から使う行パーツ（建設画面の州カード用）
 * ========================================================== */

/**
 * 航空基地の建設行（supply-ui の州カードに差し込む）
 * @returns {HTMLElement|null}
 */
export function airbaseRow(ctx, province, onChange = null) {
  const state = ctx.state;
  const mgr = ctx.airWings || state?._airWingMgr;
  if (!mgr) return null;
  const lv = mgr.airbaseLevel(province.id);
  const used = mgr.usedCapacity(province.id);
  const cap = mgr.baseCapacity(province.id);
  const row = el('div', 'sup-level-row');
  const label = el('div', 'sup-level-label');
  label.appendChild(el('span', '', '航空基地'));
  label.appendChild(el('b', '', lv > 0 ? `${lv} / ${AIRBASE.MAX_LEVEL}` : 'なし'));
  row.appendChild(label);
  row.appendChild(pips(lv, AIRBASE.MAX_LEVEL, 'base'));
  const chk = mgr.canBuildBase(province.id);
  const b = el('button', 'steel-btn sup-build-btn air-build-btn',
    lv >= AIRBASE.MAX_LEVEL ? `航空基地 Lv${lv}（最大）` : (lv === 0 ? '航空基地建設' : `基地 Lv${lv}→${lv + 1}`));
  b.type = 'button';
  if (!chk.ok) { b.disabled = true; b.title = chk.reason; }
  else b.title = `工期 約${chk.days}日 / 完成後 ${cap + AIRBASE.CAPACITY_PER_LEVEL} 機収容（現在 ${used} 機配備）`;
  b.addEventListener('click', () => {
    const r = mgr.enqueueBase(province.id);
    if (!r.ok) { toast(`航空基地: ${r.reason}`, 'bad'); return; }
    toast(`${province.name} の航空基地建設を予約しました（約${r.days}日）`, 'good');
    onChange?.();
  });
  row.appendChild(b);
  return row;
}

export default renderAirForceScreen;
