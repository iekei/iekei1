/**
 * ui/intel-ui.js — 諜報機関（Agency & Espionage）専用ウィンドウ
 *
 *  ・機関タブ  : 政治力で諜報機関を設立 / アップグレードツリー（本部・暗号解読・潜入・特殊部隊）
 *  ・エージェント: 雇用・任務指示（ネットワーク構築 / プロパガンダ / 暗号解読支援 ほか）
 *  ・インテル  : 対象国ごとのインテルレベル・ネットワーク進捗・解禁された政治/経済/軍事情報
 */

import { el, fmt, img, toast } from '../util.js';
import { nationName } from '../data/nations.js';
import { PROVINCE_BY_ID } from '../map-data.js';
import {
  AGENCY_BRANCHES, AGENCY_ESTABLISH_COST, OPERATIVE_HIRE_COST,
  INTEL_TIER_COLOR, INTEL_TIER_ICON, INTEL_TIER_LABEL,
  skillLabel, missionById,
} from '../intel.js';

const nf = (n) => fmt(Number(n) || 0);
const pct = (n) => `${Math.round(Number(n) || 0)}%`;

function sectionTitle(text) { return el('div', 'section-title', text); }
function led(cls) { return el('span', `led ${cls}`); }

function bar(value, cls = '') {
  const b = el('div', `mil-bar intel-bar ${cls}`.trim());
  const fill = el('i');
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  b.appendChild(fill);
  const label = el('b', '', pct(value));
  b.appendChild(label);
  return b;
}

function tierBadge(tier) {
  const badge = el('span', `intel-tier-badge ${tier}`);
  badge.style.borderColor = INTEL_TIER_COLOR[tier];
  badge.style.color = INTEL_TIER_COLOR[tier];
  badge.appendChild(el('span', '', `${INTEL_TIER_ICON[tier]} ${INTEL_TIER_LABEL[tier]}`));
  return badge;
}

export function renderIntelScreen(ctx) {
  return (body) => {
    const { state, intel: mgrRaw } = ctx;
    const mgr = mgrRaw || state?._intelMgr;
    body.innerHTML = '';
    body.style.padding = '10px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.classList.add('intel-screen');

    if (!mgr) {
      body.appendChild(el('div', 'intel-empty', '諜報システムが初期化されていません'));
      return;
    }

    let tab = 'agency';

    const root = el('div', 'intel-root');
    body.appendChild(root);

    const tabs = el('div', 'screen-tabs intel-tabs');
    body.insertBefore(tabs, root);

    const drawTabs = () => {
      tabs.innerHTML = '';
      const sum = mgr.summary();
      const defs = [
        ['agency', `機関${sum.established ? `（Lv${sum.branches.hq}）` : ''}`],
        ['agents', `エージェント ${sum.operatives}/${sum.slots}`],
        ['intel', `インテル（平均 ${sum.avgIntel}）`],
      ];
      for (const [id, label] of defs) {
        const b = el('button', `screen-tab${tab === id ? ' active' : ''}`, label);
        b.type = 'button';
        b.onclick = () => { if (tab === id) return; tab = id; draw(); };
        tabs.appendChild(b);
      }
    };

    const draw = () => {
      drawTabs();
      root.innerHTML = '';
      root.appendChild(header());
      if (tab === 'agency') root.appendChild(agencyTab());
      else if (tab === 'agents') root.appendChild(agentsTab());
      else root.appendChild(intelTab());
    };

    /* ------------------------------------------------------------
     * ヘッダー
     * ---------------------------------------------------------- */
    function header() {
      const sum = mgr.summary();
      const head = el('div', 'intel-head');
      const left = el('div', 'intel-head-left');
      const title = el('div', 'intel-title');
      title.appendChild(el('span', 'intel-title-main', '諜報機関'));
      title.appendChild(el('span', 'intel-title-sub', 'INTELLIGENCE AGENCY'));
      left.appendChild(title);

      const chips = el('div', 'intel-chips');
      const chip = (k, v, cls = '') => {
        const c = el('div', `intel-chip ${cls}`.trim());
        c.appendChild(el('span', 'k', k));
        c.appendChild(el('b', '', v));
        return c;
      };
      chips.appendChild(chip('政治力', nf(state.pp), state.pp >= 50 ? '' : 'bad'));
      chips.appendChild(chip('機関', sum.established ? `設立済（本部 Lv${sum.branches.hq}）` : '未設立', sum.established ? 'good' : 'bad'));
      chips.appendChild(chip('エージェント', `${sum.operatives} / ${sum.slots}`, sum.operatives >= sum.slots ? 'warn' : ''));
      chips.appendChild(chip('遂行中', `${sum.activeOps}`));
      chips.appendChild(chip('平均インテル', `${sum.avgIntel}`, sum.avgIntel >= 70 ? 'good' : sum.avgIntel >= 40 ? 'warn' : ''));
      chips.appendChild(chip('ネットワーク', `${sum.networks} か国`));
      left.appendChild(chips);
      head.appendChild(left);

      const right = el('div', 'intel-head-right');
      const status = el('div', 'intel-status-items');
      const mk = (label, n, cls) => {
        const s = el('span', `intel-status-item ${cls}`);
        s.appendChild(led(cls === 'green' ? 'green' : cls === 'yellow' ? 'yellow' : 'red'));
        s.appendChild(el('span', '', label));
        s.appendChild(el('b', '', String(n)));
        return s;
      };
      status.appendChild(mk('政治', sum.revealed.political, sum.revealed.political ? 'green' : 'red'));
      status.appendChild(mk('経済', sum.revealed.economy, sum.revealed.economy ? 'yellow' : 'red'));
      status.appendChild(mk('軍事', sum.revealed.military, sum.revealed.military ? 'green' : 'red'));
      right.appendChild(status);

      const btns = el('div', 'intel-head-btns');
      const mapBtn = el('button', 'steel-btn primary', '🗺 諜報マップ');
      mapBtn.type = 'button';
      mapBtn.title = 'マップを諜報モードにして、解禁済みの敵師団配置とネットワークを表示します';
      mapBtn.onclick = () => {
        ctx.mapEngine?.setMode?.('intel');
        ctx.modals?.close('intel');
      };
      const toggleBtn = el('button', `steel-btn${state.intel.showEnemyForces ? ' active' : ''}`, `敵師団の表示: ${state.intel.showEnemyForces ? 'ON' : 'OFF'}`);
      toggleBtn.title = '軍事情報を獲得した国の師団配置（推計）をマップに表示 / 非表示';
      toggleBtn.type = 'button';
      toggleBtn.onclick = () => {
        const on = mgr.toggleEnemyForces();
        toast(on ? 'マップに敵師団配置を表示します（軍事情報が必要）' : '敵師団配置の表示を停止しました', 'info');
        draw();
      };
      btns.appendChild(mapBtn);
      btns.appendChild(toggleBtn);
      right.appendChild(btns);
      head.appendChild(right);
      return head;
    }

    /* ------------------------------------------------------------
     * 機関タブ
     * ---------------------------------------------------------- */
    function agencyTab() {
      const wrap = el('div', 'intel-agency');
      const sum = mgr.summary();

      if (!sum.established) {
        const card = el('div', 'intel-establish');
        card.appendChild(el('div', 'intel-establish-title', '諜報機関を設立する'));
        card.appendChild(el('div', 'intel-establish-desc',
          `政治力 ${AGENCY_ESTABLISH_COST} を消費して諜報機関を設立します。設立するとエージェントの雇用、`
          + 'ネットワーク構築、暗号解読などの任務が解禁され、機関本部 Lv1 と 2 つのエージェント枠を得ます。'));
        const chk = mgr.canEstablish();
        const b = el('button', 'steel-btn primary intel-establish-btn',
          chk.ok ? `設立する（政治力 ${AGENCY_ESTABLISH_COST}）` : `設立できません（政治力 ${AGENCY_ESTABLISH_COST} 必要）`);
        b.type = 'button';
        if (!chk.ok) { b.disabled = true; b.title = chk.reason; }
        b.onclick = () => {
          const r = mgr.establish();
          if (!r.ok) { toast(r.reason, 'bad'); return; }
          toast(`諜報機関「${r.agency.name}」を設立しました（政治力 -${r.cost}）`, 'good');
          draw();
        };
        card.appendChild(b);
        if (!chk.ok && chk.reason) card.appendChild(el('div', 'intel-note', chk.reason));
        wrap.appendChild(card);
        wrap.appendChild(el('div', 'intel-note', 'ヒント: 政治力は時間経過で増加します（現在 ' + nf(state.pp) + '）。'));
        return wrap;
      }

      const info = el('div', 'intel-agency-summary');
      info.appendChild(el('b', '', mgr.agency()?.name || '諜報機関'));
      const parts = [
        `エージェント枠 ${sum.slots}`,
        `基礎インテル +${sum.branches.hq * 3}`,
        `解読速度 +${Math.round(sum.branches.crypto * 25)}%`,
        `ネットワーク構築 +${sum.branches.infiltration * 4}`,
      ].filter(Boolean);
      info.appendChild(el('span', 'intel-agency-summary-text', parts.join(' ・ ')));
      wrap.appendChild(info);

      const grid = el('div', 'intel-branches');
      for (const def of AGENCY_BRANCHES) grid.appendChild(branchCard(def));
      wrap.appendChild(grid);

      // 履歴
      const hist = el('div', 'intel-history');
      hist.appendChild(sectionTitle('最近の作戦'));
      const list = el('div', 'intel-history-list');
      const items = (state.intel.history || []).slice(0, 6);
      if (!items.length) list.appendChild(el('div', 'intel-empty small', 'まだ完了した作戦はありません'));
      for (const h of items) {
        const row = el('div', 'intel-history-row');
        const m = missionById(h.missionId);
        row.appendChild(el('span', 'ico', m?.icon || '•'));
        row.appendChild(el('span', 'name', `${m?.name || h.missionId} → ${nationName(h.target)}`));
        const bits = [];
        if (h.networkGain) bits.push(`ネットワーク +${h.networkGain}`);
        if (h.intelGain) bits.push(`インテル +${h.intelGain}`);
        if (h.decrypted) bits.push('暗号解読');
        if (h.coup) bits.push(h.coup.success ? 'クーデター成功' : 'クーデター失敗');
        row.appendChild(el('span', 'detail', bits.join(' ・ ')));
        list.appendChild(row);
      }
      hist.appendChild(list);
      wrap.appendChild(hist);
      return wrap;
    }

    function branchCard(def) {
      const lv = mgr.branchLevels()[def.id] || 0;
      const chk = mgr.canUpgrade(def.id);
      const card = el('div', `intel-branch${lv > 0 ? ' owned' : ''}`);
      const head = el('div', 'intel-branch-head');
      head.appendChild(el('span', 'intel-branch-icon', def.icon));
      const nameWrap = el('div', 'intel-branch-name');
      nameWrap.appendChild(el('b', '', def.name));
      const pips = el('div', 'intel-pips');
      for (let i = 0; i < def.maxLevel; i++) pips.appendChild(el('span', `intel-pip${i < lv ? ' on' : ''}`));
      nameWrap.appendChild(pips);
      head.appendChild(nameWrap);
      head.appendChild(el('span', 'intel-branch-level', `Lv${lv} / ${def.maxLevel}`));
      card.appendChild(head);

      card.appendChild(el('div', 'intel-branch-desc', def.desc));
      card.appendChild(el('div', 'intel-branch-effect', lv > 0 ? def.effectText(lv) : '未強化'));
      if (def.requires && lv === 0) {
        const req = Object.entries(def.requires).map(([id, l]) => `${AGENCY_BRANCHES.find((b) => b.id === id)?.name || id} Lv${l}`).join(' / ');
        card.appendChild(el('div', 'intel-branch-req', `前提: ${req}`));
      }

      if (lv < def.maxLevel) {
        const cost = def.costs[lv];
        const next = el('div', 'intel-branch-next');
        next.appendChild(el('span', 'k', '次レベル'));
        next.appendChild(el('span', '', def.effectText(lv + 1)));
        card.appendChild(next);
        const b = el('button', 'steel-btn primary intel-upgrade-btn', chk.ok ? `強化（政治力 ${cost}）` : `強化不可（${cost}）`);
        b.type = 'button';
        if (!chk.ok) { b.disabled = true; b.title = chk.reason; }
        b.onclick = () => {
          const r = mgr.upgradeBranch(def.id);
          if (!r.ok) { toast(r.reason, 'bad'); return; }
          toast(`${def.name} を Lv${r.level} へ強化しました（政治力 -${r.cost}）`, 'good');
          draw();
        };
        card.appendChild(b);
        if (!chk.ok && chk.reason) card.appendChild(el('div', 'intel-note', chk.reason));
      } else {
        card.appendChild(el('div', 'intel-branch-max', '最大レベル'));
      }
      return card;
    }

    /* ------------------------------------------------------------
     * エージェントタブ
     * ---------------------------------------------------------- */
    function agentsTab() {
      const wrap = el('div', 'intel-agents');
      if (!mgr.isEstablished()) {
        wrap.appendChild(el('div', 'intel-empty', '先に「機関」タブで諜報機関を設立してください（政治力 50）。'));
        return wrap;
      }

      wrap.appendChild(sectionTitle(`エージェント（${mgr.operatives().length} / ${mgr.slots()}）`));
      const list = el('div', 'intel-ops');
      if (!mgr.operatives().length) list.appendChild(el('div', 'intel-empty', 'エージェントがいません。下の一覧から雇用してください。'));
      for (const op of mgr.operatives()) list.appendChild(operativeCard(op));
      wrap.appendChild(list);

      wrap.appendChild(sectionTitle('雇用可能なエージェント'));
      const avail = el('div', 'intel-recruits');
      const hired = new Set(mgr.operatives().map((o) => o.templateId));
      const pool = mgr.availableOperatives().filter((t) => !hired.has(t.id));
      if (!pool.length) avail.appendChild(el('div', 'intel-empty small', '雇用できるエージェントがいません（全員雇用済み）。'));
      for (const tpl of pool) {
        const chk = mgr.canRecruit(tpl.id);
        const card = el('div', `intel-recruit${chk.ok ? '' : ' locked'}`);
        const face = el('div', 'intel-recruit-face');
        face.appendChild(img(tpl.portrait, tpl.name, '', tpl.name.slice(0, 1)));
        card.appendChild(face);
        const info = el('div', 'intel-recruit-info');
        info.appendChild(el('b', '', tpl.name));
        info.appendChild(el('span', 'intel-recruit-skill', `${skillLabel(tpl.skill)} Lv${tpl.skillValue}`));
        info.appendChild(el('span', 'intel-recruit-cost', `政治力 ${OPERATIVE_HIRE_COST}`));
        card.appendChild(info);
        const b = el('button', 'steel-btn primary intel-hire-btn', '雇用');
        b.type = 'button';
        if (!chk.ok) { b.disabled = true; b.title = chk.reason; }
        b.onclick = () => {
          const r = mgr.hire(tpl.id);
          if (!r.ok) { toast(r.reason, 'bad'); return; }
          toast(`${r.operative.name} を雇用しました（政治力 -${r.cost}）`, 'good');
          draw();
        };
        card.appendChild(b);
        avail.appendChild(card);
      }
      wrap.appendChild(avail);
      return wrap;
    }

    function operativeCard(op) {
      const card = el('div', 'intel-op');
      const face = el('div', 'intel-op-face');
      face.appendChild(img(op.portrait, op.name, '', op.name.slice(0, 1)));
      card.appendChild(face);

      const info = el('div', 'intel-op-info');
      const nameRow = el('div', 'intel-op-name');
      nameRow.appendChild(el('b', '', op.name));
      nameRow.appendChild(el('span', 'intel-op-skill', `${skillLabel(op.skill)} Lv${op.skillValue}`));
      info.appendChild(nameRow);

      if (op.mission) {
        const m = missionById(op.mission.missionId);
        const line = el('div', 'intel-op-mission');
        line.appendChild(el('span', 'ico', m?.icon || '•'));
        line.appendChild(el('span', '', `${m?.name || op.mission.missionId} → ${nationName(op.mission.target)}`));
        line.appendChild(el('span', 'intel-op-days', `残り ${Math.max(0, Math.ceil(op.mission.daysLeft))} 日`));
        info.appendChild(line);
        info.appendChild(bar(Math.round((op.mission.progress || 0) * 100)));
        const cancel = el('button', 'steel-btn intel-op-cancel', '任務を中止');
        cancel.type = 'button';
        cancel.onclick = () => { mgr.unassign(op.id); draw(); };
        info.appendChild(cancel);
      } else {
        const form = el('div', 'intel-op-form');
        const targetSel = el('select', 'steel-select');
        for (const t of mgr.targets()) {
          const data = mgr.intelData(t);
          const o = el('option', '', `${nationName(t)}（インテル ${data.level}）`);
          o.value = t;
          targetSel.appendChild(o);
        }
        const missionSel = el('select', 'steel-select');
        for (const m of mgr.missions()) {
          const avail = mgr.missionAvailable(m);
          const o = el('option', '', `${m.icon} ${m.name}${avail.ok ? '' : ' 🔒'}`);
          o.value = m.id;
          o.disabled = !avail.ok;
          o.title = avail.ok ? (m.desc || '') : avail.reason;
          missionSel.appendChild(o);
        }
        const detail = el('div', 'intel-op-detail', mgr.missions()[0]?.desc || '');
        missionSel.onchange = () => {
          const m = missionById(missionSel.value);
          const days = m ? mgr.missionDays(op, m) : 0;
          detail.textContent = m ? `${m.desc || ''}（所要 約${days}日）` : '';
        };
        const go = el('button', 'steel-btn primary', '任務を指示');
        go.type = 'button';
        go.onclick = () => {
          const r = mgr.assignMission(op.id, missionSel.value, targetSel.value);
          if (!r.ok) { toast(r.reason, 'bad'); return; }
          const m = missionById(r.mission.missionId);
          toast(`${op.name}: ${m.name}（${nationName(r.mission.target)}）を開始（約${r.days}日）`, 'good');
          draw();
        };
        form.appendChild(targetSel);
        form.appendChild(missionSel);
        form.appendChild(go);
        info.appendChild(form);
        info.appendChild(detail);
        const done = op.completed || 0;
        info.appendChild(el('div', 'intel-op-done', `完了した作戦: ${done}`));
      }
      card.appendChild(info);
      return card;
    }

    /* ------------------------------------------------------------
     * インテルタブ
     * ---------------------------------------------------------- */
    function intelTab() {
      const wrap = el('div', 'intel-targets');
      const thresholds = mgr.thresholds();
      const legend = el('div', 'intel-legend');
      for (const tier of ['political', 'economy', 'military']) {
        const row = el('span', 'intel-legend-item');
        row.appendChild(el('i', '', INTEL_TIER_ICON[tier]));
        row.appendChild(el('span', '', `${INTEL_TIER_LABEL[tier]} ≥ ${thresholds[tier]}`));
        row.style.color = INTEL_TIER_COLOR[tier];
        legend.appendChild(row);
      }
      wrap.appendChild(legend);

      const grid = el('div', 'intel-target-grid');
      for (const t of mgr.targets()) grid.appendChild(targetCard(mgr.intelData(t)));
      wrap.appendChild(grid);
      return wrap;
    }

    function targetCard(data) {
      const card = el('div', `intel-target tier-${data.tier}`);
      card.style.setProperty('--intel-color', data.tierColor);

      const head = el('div', 'intel-target-head');
      const nameWrap = el('div', 'intel-target-name');
      nameWrap.appendChild(el('b', '', data.name));
      nameWrap.appendChild(el('span', 'intel-target-tag', data.tag));
      head.appendChild(nameWrap);
      head.appendChild(tierBadge(data.tier));
      card.appendChild(head);

      const lv = el('div', 'intel-target-level');
      lv.appendChild(el('span', 'k', 'インテル'));
      lv.appendChild(bar(data.level));
      card.appendChild(lv);

      const net = el('div', 'intel-target-network');
      net.appendChild(el('span', 'k', 'ネットワーク'));
      net.appendChild(bar(data.network, 'network'));
      if (data.decrypted) net.appendChild(el('span', 'intel-target-decrypt', `🔐 解読 ×${data.decrypted}`));
      card.appendChild(net);

      const rows = el('div', 'intel-rows');
      rows.appendChild(infoRow('political', data.political, data));
      rows.appendChild(infoRow('economy', data.economy, data));
      rows.appendChild(infoRow('military', data.military, data));
      card.appendChild(rows);

      if (data.operatives) {
        card.appendChild(el('div', 'intel-target-ops', `この国で活動中のエージェント: ${data.operatives}`));
      }

      if (data.military) {
        const b = el('button', 'steel-btn intel-target-map', '🗺 師団配置をマップで見る');
        b.type = 'button';
        b.onclick = () => {
          ctx.mapEngine?.setMode?.('intel');
          ctx.modals?.close('intel');
          toast(`${data.name} の師団配置（推計）をマップに表示しています`, 'info');
        };
        card.appendChild(b);
      }
      return card;
    }

    function infoRow(kind, value, data) {
      const row = el('div', `intel-info-row ${kind}${value ? '' : ' locked'}`);
      const label = el('div', 'intel-info-label');
      label.appendChild(el('span', '', `${INTEL_TIER_ICON[kind]} ${INTEL_TIER_LABEL[kind]}`));
      row.appendChild(label);

      if (!value) {
        row.appendChild(el('span', 'intel-info-locked',
          `🔒 インテル ${data.thresholds[kind]} 以上で解禁（現在 ${data.level}）`));
        return row;
      }

      const body = el('div', 'intel-info-body');
      if (kind === 'political') {
        body.appendChild(el('span', '', `イデオロギー: ${value.ideology}`));
        body.appendChild(el('span', '', `指導者: ${value.leader}`));
        body.appendChild(el('span', '', `安定度 ${value.stability}% / 戦争協力度 ${value.warSupport}%`));
        body.appendChild(el('span', '', `政治力 ${value.pp}`));
      } else if (kind === 'economy') {
        body.appendChild(el('span', '', `工場 民需${value.civ} / 軍需${value.mil} / 造船${value.dock}（計${value.factories}）`));
        body.appendChild(el('span', '', `輸送船 ${value.convoys} / 人的資源 ${nf(value.manpower)}`));
      } else {
        body.appendChild(el('span', '', `師団 ${value.divisions} 個（推計） ・ 即応度 ${value.readiness}%`));
        body.appendChild(el('span', '', `工場 ${value.factories} / 空軍XP ${value.air} / 海軍XP ${value.navy}`));
        const chips = el('div', 'intel-force-chips');
        for (const f of value.forces.slice(0, 5)) {
          const chip = el('span', 'intel-force-chip');
          chip.appendChild(el('b', '', f.provinceName));
          chip.appendChild(el('span', '', `×${f.count}`));
          chips.appendChild(chip);
        }
        if (value.forces.length > 5) chips.appendChild(el('span', 'intel-force-chip more', `ほか ${value.forces.length - 5} 州`));
        body.appendChild(chips);
      }
      row.appendChild(body);
      return row;
    }

    draw();
    const timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      const active = document.activeElement;
      if (active && root.contains(active) && /^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test(active.tagName)) return;
      draw();
    }, 2500);
    const watcher = setInterval(() => {
      if (!root.isConnected) clearInterval(watcher);
    }, 1000);
  };
}

export default renderIntelScreen;
