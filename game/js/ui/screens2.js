/** ui/screens2.js — 画面レンダラー（後編: 師団/戦車/艦艇/航空機設計・シミュレーター・ドクトリン・諜報・外交） */

import { el, img, fmt, fmtPct, $ } from '../util.js';
import { I18N } from '../i18n.js';
import { NATIONS, MAJORS, nationName, nationFlag } from '../data/nations.js';
import { BATTALIONS, SUPPORT_COMPANIES } from '../data/battalions.js';
import { DivisionTemplate, divisionType, GRID_W, GRID_H, SUPPORT_SLOTS } from '../division.js';
import { RARITY_COLORS, commanderEffects, COMMANDER_TRAITS } from '../data/cards.js';
import { renderDoctrineScreen } from './doctrine-ui.js';
import { CombatSimulator, TERRAIN_MODS, WEATHER_MODS, TACTICS } from '../combat.js';
import { renderTankDesigner, renderNavalDesigner, renderAirDesigner } from './designer-ui.js';
import { sectionTitle } from './screens.js';

/* ================= 師団編成（5×5＋1×5） ================= */

function renderDivisionDesigner(ctx) {
  return (body) => {
    const { state, designer } = ctx;
    body.innerHTML = '';
    if (!designer.current) designer.current = new DivisionTemplate('新型師団');
    const tpl = designer.current;

    const top = el('div', 'row mb8');
    const nameInput = el('input', 'steel-input', '');
    nameInput.value = tpl.name;
    nameInput.style.width = '220px';
    nameInput.onchange = () => { tpl.name = nameInput.value; };
    top.appendChild(nameInput);
    const saveBtn = el('button', 'steel-btn primary', I18N.t('equipment.designer.save_design'));
    saveBtn.onclick = () => {
      state.divisionTemplates.push(tpl.clone(tpl.name));
      toast(`${tpl.name} を保存しました`, 'good');
    };
    top.appendChild(saveBtn);
    const clearBtn = el('button', 'steel-btn', I18N.t('division.clear'));
    clearBtn.onclick = () => { tpl.clear(); drawAll(); };
    top.appendChild(clearBtn);
    // 全画面の師団編成（Division Designer）を開く
    const openDesignerBtn = el('button', 'steel-btn primary', `⊞ ${I18N.t('menu.division')}`);
    openDesignerBtn.title = '師団編成 / 編集画面を開く（J）';
    openDesignerBtn.onclick = () => ctx.modals.toggle('division', {});
    top.appendChild(openDesignerBtn);
    body.appendChild(top);

    const main = el('div', 'row');
    main.style.alignItems = 'flex-start';
    main.style.gap = '16px';

    // 左: 大隊ピッカー
    const picker = el('div', 'col');
    picker.style.maxWidth = '300px';
    picker.appendChild(sectionTitle('大隊'));
    const pickList = el('div', 'pick-list');
    let selected = 'infantry';
    const drawPicker = () => {
      pickList.innerHTML = '';
      for (const [id, b] of Object.entries(BATTALIONS)) {
        const item = el('div', `pick-item ${selected === id ? 'selected' : ''}`);
        item.appendChild(img(b.icon, I18N.battalionName(id), '', 'B'));
        item.appendChild(el('span', 'pname', I18N.battalionName(id)));
        item.appendChild(el('span', 'pmeta', `IC ${b.stats.ic}`));
        item.onclick = () => { selected = id; drawPicker(); };
        pickList.appendChild(item);
      }
      pickList.appendChild(sectionTitle(I18N.t('division.support_hint')));
      for (const [id, c] of Object.entries(SUPPORT_COMPANIES)) {
        const item = el('div', `pick-item ${selected === id ? 'selected' : ''}`);
        item.appendChild(img(c.icon, I18N.supportName(id), '', 'S'));
        item.appendChild(el('span', 'pname', I18N.supportName(id)));
        item.appendChild(el('span', 'pmeta', '支援'));
        item.onclick = () => { selected = id; drawPicker(); };
        pickList.appendChild(item);
      }
    };
    picker.appendChild(pickList);
    main.appendChild(picker);

    // 中央: 5×5グリッド + 1×5支援
    const center = el('div', 'col');
    const grid = el('div', 'div-grid');
    const supportRow = el('div', 'div-support-row');
    center.appendChild(grid);
    center.appendChild(supportRow);
    center.appendChild(el('div', 'small dim mt8', I18N.t('division.grid_hint')));
    main.appendChild(center);

    // 右: ステータス
    const stats = el('div', 'steel-card');
    stats.style.minWidth = '260px';
    stats.appendChild(sectionTitle('师団ステータス'));
    const statsBody = el('div', 'col');
    stats.appendChild(statsBody);
    main.appendChild(stats);
    body.appendChild(main);

    const drawGrid = () => {
      grid.innerHTML = '';
      for (let i = 0; i < GRID_W * GRID_H; i++) {
        const cell = el('div', `div-cell ${tpl.grid[i] ? 'filled' : ''}`);
        if (tpl.grid[i]) {
          const b = BATTALIONS[tpl.grid[i]];
          if (b) cell.appendChild(img(b.icon, I18N.battalionName(tpl.grid[i]), '', 'B'));
          const x = el('span', 'remove-x', '✕');
          x.onclick = (e) => { e.stopPropagation(); tpl.remove(i); drawAll(); };
          cell.appendChild(x);
          cell.title = I18N.battalionName(tpl.grid[i]);
        }
        cell.onclick = () => {
          if (BATTALIONS[selected]) tpl.toggle(i, selected);
          else if (SUPPORT_COMPANIES[selected]) { /* 支援は下段 */ }
          drawAll();
        };
        grid.appendChild(cell);
      }
      supportRow.innerHTML = '';
      for (let i = 0; i < SUPPORT_SLOTS; i++) {
        const cell = el('div', `div-cell ${tpl.support[i] ? 'filled' : ''}`);
        if (tpl.support[i]) {
          const c = SUPPORT_COMPANIES[tpl.support[i]];
          if (c) cell.appendChild(img(c.icon, I18N.supportName(tpl.support[i]), '', 'S'));
          cell.title = I18N.supportName(tpl.support[i]);
          const x = el('span', 'remove-x', '✕');
          x.onclick = (e) => { e.stopPropagation(); tpl.removeSupport(i); drawAll(); };
          cell.appendChild(x);
        }
        cell.onclick = () => {
          if (SUPPORT_COMPANIES[selected]) tpl.addSupport(i, selected);
          drawAll();
        };
        supportRow.appendChild(cell);
      }
    };

    const STAT_KEYS = ['org', 'hp', 'soft_attack', 'hard_attack', 'breakthrough', 'defense', 'piercing', 'armor', 'combat_width', 'supply', 'speed', 'ic', 'manpower'];
    const drawStats = () => {
      statsBody.innerHTML = '';
      const st = tpl.stats;
      const map = {
        org: st.maxOrg, hp: st.hp, soft_attack: st.softAttack, hard_attack: st.hardAttack,
        breakthrough: st.breakthrough, defense: st.defense, piercing: st.piercing, armor: st.armor,
        combat_width: st.combatWidth, supply: st.supplyUse, speed: st.speed, ic: st.ic, manpower: st.manpower,
      };
      for (const k of STAT_KEYS) {
        statsBody.appendChild(el('div', 'kv', `<span class="k">${I18N.t(`division.stats.${k}`)}</span><span class="v">${map[k]}</span>`));
      }
      statsBody.appendChild(el('div', 'kv', `<span class="k">師団タイプ</span><span class="v">${divisionType(tpl)}</span>`));
      const eqDiv = el('div', 'mt8 small');
      const eqEntries = Object.entries(tpl.equipment || {});
      eqDiv.innerHTML = `<b class="gold">${I18N.t('division.stats.equipment')}</b>`;
      if (!eqEntries.length) eqDiv.appendChild(el('div', 'dim', I18N.t('ui.none')));
      for (const [k, v] of eqEntries) eqDiv.appendChild(el('div', 'dim', `${I18N.equipName(k)} ×${v}`));
      statsBody.appendChild(eqDiv);
    };

    const drawAll = () => { drawPicker(); drawGrid(); drawStats(); };
    drawAll();
  };
}

/* ================= 戦闘シミュレーター ================= */

function renderSimulator(ctx) {
  return (body) => {
    const { state, doctrine, intel, cards } = ctx;
    body.innerHTML = '';
    body.appendChild(sectionTitle(I18N.t('simulator.title')));

    // 設定パネル
    const cfg = el('div', 'grid3');
    const mkSelect = (label, options, get, set) => {
      const card = el('div', 'steel-card');
      card.appendChild(el('h4', '', label));
      const sel = el('select', 'steel-select');
      sel.style.width = '100%';
      for (const [id, name] of options) {
        const o = el('option', '', name); o.value = id; sel.appendChild(o);
      }
      sel.onchange = () => set(sel.value);
      card.appendChild(sel);
      return card;
    };
    const terrain = 'plains', weather = 'clear', tactic = 'balanced';
    let cfgTerrain = terrain, cfgWeather = weather, cfgTactic = tactic, cfgEntrench = true;
    cfg.appendChild(mkSelect(I18N.t('simulator.terrain'), Object.keys(TERRAIN_MODS).map((k) => [k, I18N.terrainName(k)]), null, (v) => { cfgTerrain = v; }));
    cfg.appendChild(mkSelect(I18N.t('simulator.weather'), Object.keys(WEATHER_MODS).map((k) => [k, I18N.weatherName(k)]), null, (v) => { cfgWeather = v; }));
    cfg.appendChild(mkSelect(I18N.t('simulator.tactic'), Object.keys(TACTICS).map((k) => [k, I18N.t(`simulator.tactics.${k}`) || I18N.tacticName(k)]), null, (v) => { cfgTactic = v; }));
    body.appendChild(cfg);

    const opts = el('div', 'row mt8');
    const entr = el('label', 'small', `<input type="checkbox" ${cfgEntrench ? 'checked' : ''}> ${I18N.t('simulator.entrenchment')}`);
    entr.querySelector('input').onchange = (e) => { cfgEntrench = e.target.checked; };
    opts.appendChild(entr);
    opts.appendChild(el('span', 'dim small', I18N.t('simulator.tick_info')));
    body.appendChild(opts);

    // 編成選択（保存済み師団テンプレート）
    const pickRow = el('div', 'row mt8');
    const templates = state.divisionTemplates.length ? state.divisionTemplates : [new DivisionTemplate('歩兵師団（デフォルト）')];
    if (templates.length === 1 && !state.divisionTemplates.length) {
      const d = templates[0];
      for (let i = 0; i < 9; i++) d.add(i, 'infantry');
      d.addSupport(0, 'engineer');
      d.addSupport(1, 'artillery_support');
    }
    let atkTpl = templates[0], defTpl = templates[0];
    const mkTplSelect = (label, get, set) => {
      const sel = el('select', 'steel-select');
      const fill = () => {
        sel.innerHTML = '';
        for (const t of templates) { const o = el('option', '', t.name); o.value = t.id; sel.appendChild(o); }
        sel.value = get().id;
      };
      sel.onchange = () => set(templates.find((t) => t.id === sel.value));
      fill();
      pickRow.appendChild(el('span', 'small dim', label));
      pickRow.appendChild(sel);
      return { fill };
    };
    const atkSel = mkTplSelect('攻撃側', () => atkTpl, (t) => { atkTpl = t; });
    const defSel = mkTplSelect('防御側', () => defTpl, (t) => { defTpl = t; });
    body.appendChild(pickRow);

    // 指揮官スロット（カード配属）
    const cmdRow = el('div', 'row mt8');
    cmdRow.style.flexWrap = 'wrap';
    const mkCommanderSlot = (branch, label) => {
      const wrap = el('div', 'col');
      wrap.style.alignItems = 'center';
      wrap.appendChild(el('span', 'small dim', label));
      const slot = el('div', `commander-slot ${state.commanders[branch] ? 'filled' : ''}`);
      const drawSlot = () => {
        slot.innerHTML = '';
        slot.classList.toggle('filled', !!state.commanders[branch]);
        const c = state.commanders[branch];
        if (c) {
          const card = el('div', 'commander-card');
          if (c.portrait) { const f = el('div', 'face'); f.appendChild(img(c.portrait, c.name)); card.appendChild(f); }
          else card.appendChild(el('div', 'face', `<span class="initial">${c.name.slice(0, 1)}</span>`));
          card.appendChild(el('div', 'cname', c.name));
          slot.appendChild(card);
        } else slot.textContent = '指揮官カードを選択';
      };
      slot.onclick = () => {
        //簡易: 保有カードから同ブランチカードを 순환アサイン
        const pool = cards.ofBranch(branch, state.playerTag);
        if (!pool.length) return;
        const cur = state.commanders[branch];
        const idx = cur ? pool.findIndex((p) => p.id === cur.id) : -1;
        state.commanders[branch] = pool[(idx + 1) % pool.length];
        drawSlot();
        toast(`${label}: ${state.commanders[branch].name} を配属`, 'info');
      };
      drawSlot();
      wrap.appendChild(slot);
      return wrap;
    };
    cmdRow.appendChild(mkCommanderSlot('army', '攻撃側指揮官'));
    cmdRow.appendChild(mkCommanderSlot('army', '防御側指揮官（同一可）'));
    body.appendChild(cmdRow);
    body.appendChild(el('div', 'small dim mt8', '指揮官スロットをクリックで保有カードを切替。カードの特性が戦闘に反映されます。'));

    // 戦闘画面
    const arena = el('div', 'grid2 mt12');
    arena.style.gridTemplateColumns = '1fr 1fr';
    body.appendChild(arena);
    const logBox = el('div', 'sim-log mt12');
    logBox.style.maxHeight = '180px';
    body.appendChild(logBox);
    const ctrl = el('div', 'row mt8');
    body.appendChild(ctrl);

    let sim = null, timer = null;
    const mkPanel = (side, tpl, commander) => {
      const card = el('div', 'steel-card col');
      card.appendChild(el('h4', '', side === 'attacker' ? I18N.t('simulator.attacker') : I18N.t('simulator.defender')));
      card.appendChild(el('b', 'gold', tpl.name));
      const orgBar = el('div', 'mil-bar sim-hpbar mt8'); orgBar.appendChild(el('i', 'style="width:100%"')); orgBar.appendChild(el('b', '', '組織力 100%'));
      const hpBar = el('div', 'mil-bar sim-hpbar mt8'); hpBar.appendChild(el('i', 'style="width:100%"')); hpBar.appendChild(el('b', '', '人員 100%'));
      card.appendChild(orgBar); card.appendChild(hpBar);
      card._orgBar = orgBar; card._hpBar = hpBar;
      return card;
    };

    const start = () => {
      if (timer) return;
      const atkIntel = intel.intelOn('GER') / 100; // デモ: 対独諜報価値を攻撃側ボーナスに
      // ドクトリン補正と計画準備ボーナスは CombatSimulator 側で適用される
      const landEff = doctrine.effects('land');
      const activePlan = (state.battlePlans || []).find((p) => p.tag === state.playerTag);
      sim = new CombatSimulator({
        attacker: { template: atkTpl, commander: state.commanders.army, intelBonus: atkIntel },
        defender: { template: defTpl, commander: null },
        terrain: cfgTerrain, weather: cfgWeather, tactic: cfgTactic, entrenchment: cfgEntrench,
        doctrine: landEff,
        planningBonus: activePlan ? activePlan.planning : 0,
      });
      const atkPanel = mkPanel('attacker', atkTpl, state.commanders.army);
      const defPanel = mkPanel('defender', defTpl, null);
      arena.innerHTML = '';
      arena.appendChild(atkPanel); arena.appendChild(defPanel);
      logBox.innerHTML = '';
      sim.bus.on('log', (line) => {
        const div = el('div', `line ${line.cls}`, `[T+${line.tick}h] ${line.text}`);
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
      });
      sim.start();
      // ログの先頭に開始ログが出るよう flush
      sim.bus.emit('log', { tick: 0, cls: 'event', text: '' }); // no-op guard
      timer = setInterval(() => {
        const cont = sim.step();
        const upd = (panel, c) => {
          const orgPct = fmtPct(c.org / c.maxOrg);
          const hpPct = fmtPct(c.hp / c.maxHp);
          panel._orgBar.querySelector('i').style.width = orgPct;
          panel._orgBar.querySelector('b').textContent = `組織力 ${orgPct}`;
          panel._orgBar.classList.toggle('warn', c.org / c.maxOrg < 0.5);
          panel._orgBar.classList.toggle('bad', c.org / c.maxOrg < 0.25);
          panel._hpBar.querySelector('i').style.width = hpPct;
          panel._hpBar.querySelector('b').textContent = `人員 ${hpPct}`;
          panel._hpBar.classList.toggle('bad', c.hp / c.maxHp < 0.5);
        };
        upd(atkPanel, sim.attacker);
        upd(defPanel, sim.defender);
        if (!cont) { clearInterval(timer); timer = null; }
      }, 700);
    };
    const reset = () => { if (timer) { clearInterval(timer); timer = null; } sim = null; arena.innerHTML = ''; logBox.innerHTML = ''; };

    const startBtn = el('button', 'steel-btn primary', I18N.t('simulator.start'));
    startBtn.onclick = start;
    const resetBtn = el('button', 'steel-btn', I18N.t('simulator.reset'));
    resetBtn.onclick = reset;
    ctrl.appendChild(startBtn); ctrl.appendChild(resetBtn);
  };
}

/* ================= ドクトリン画面 ================= */

/* ================= 諜報機関画面 ================= */

function renderIntelScreen(ctx) {
  return (body) => {
    const { state, intel } = ctx;
    body.innerHTML = '';
    body.appendChild(sectionTitle(`${I18N.t('intel.operatives')}（スロット ${intel.operatives().length}/${state.intel.slots}）`));

    const draw = () => {
      body.innerHTML = '';
      body.appendChild(sectionTitle(`${I18N.t('intel.operatives')}（スロット ${intel.operatives().length}/${state.intel.slots}）`));
      const row = el('div', 'row');
      row.style.flexWrap = 'wrap';
      for (const op of intel.operatives()) {
        const card = el('div', 'steel-card col');
        card.style.width = '200px';
        const face = el('div', 'center');
        face.appendChild(img(op.portrait, op.name, 'style="width:72px;height:72px;object-fit:cover;border:1px solid var(--gold-dim)"', op.name.slice(0, 1)));
        card.appendChild(face);
        card.appendChild(el('b', 'gold center', op.name));
        card.appendChild(el('div', 'small dim center', `${I18N.t(`intel.skills.${op.skill}`)} Lv${op.skillValue}`));
        if (op.mission) {
          const m = intel.missions().find((m) => m.id === op.mission.missionId);
          const pct = fmtPct(1 - op.mission.daysLeft / op.mission.totalDays);
          card.appendChild(el('div', 'small mt8', `${I18N.t(`intel.missions.${op.mission.missionId}.name`)} → ${nationName(op.mission.target)}`));
          const bar = el('div', 'mil-bar mt8');
          bar.appendChild(el('i', `style="width:${pct}"`));
          bar.appendChild(el('b', '', pct));
          card.appendChild(bar);
          const cancel = el('button', 'steel-btn mt8', I18N.t('ui.cancel'));
          cancel.onclick = () => { intel.unassign(op.id); draw(); };
          card.appendChild(cancel);
        } else {
          const sel = el('select', 'steel-select mt8');
          sel.innerHTML = `<option value="">${I18N.t('intel.idle')}</option>` +
            intel.missions().map((m) => `<option value="${m.id}">${I18N.t(`intel.missions.${m.id}.name`)}</option>`).join('');
          const targetSel = el('select', 'steel-select mt8');
          for (const t of intel.targets()) targetSel.appendChild(Object.assign(el('option', '', nationName(t)), { value: t }));
          const go = el('button', 'steel-btn primary mt8', I18N.t('ui.confirm'));
          go.onclick = () => { if (sel.value) { intel.assignMission(op.id, sel.value, targetSel.value); draw(); } };
          card.appendChild(sel); card.appendChild(targetSel); card.appendChild(go);
        }
        row.appendChild(card);
      }
      body.appendChild(row);

      // 雇用可能リスト
      body.appendChild(sectionTitle(I18N.t('intel.recruit')));
      const avail = el('div', 'row');
      avail.style.flexWrap = 'wrap';
      for (const t of intel.availableOperatives()) {
        if (intel.operatives().some((o) => o.templateId === t.id)) continue;
        const card = el('div', 'commander-card');
        const face = el('div', 'face');
        if (t.portrait) face.appendChild(img(t.portrait, t.name));
        else face.appendChild(el('span', 'initial', t.name.slice(0, 1)));
        card.appendChild(face);
        card.appendChild(el('div', 'cname', t.name));
        card.appendChild(el('div', 'ctrait', I18N.t(`intel.skills.${t.skill}`)));
        card.title = I18N.t('intel.recruit_cost', { pp: 50 });
        card.onclick = () => { if (intel.recruit(t.id)) draw(); };
        avail.appendChild(card);
      }
      body.appendChild(avail);
      //諜報価値
      body.appendChild(sectionTitle(I18N.t('intel.intel_value')));
      const iv = el('div', 'col');
      for (const t of intel.targets()) {
        iv.appendChild(el('div', 'kv', `<span class="k">${nationName(t)}</span><span class="v">${intel.intelOn(t)}</span>`));
      }
      body.appendChild(iv);
    };
    draw();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('intel')) draw(); });
  };
}

/* ================= 外交画面 ================= */

function renderDiplomacyScreen(ctx) {
  return (body) => {
    const { state, diplomacy } = ctx;
    body.innerHTML = '';
    let selected = diplomacy._selected || diplomacy.others()[0];
    diplomacy._selected = null;
    const main = el('div', 'row');
    main.style.alignItems = 'flex-start';
    main.style.gap = '14px';

    // 国家リスト
    const list = el('div', 'col');
    list.style.minWidth = '200px';
    list.style.gap = '4px';
    const drawList = () => {
      list.innerHTML = '';
      for (const tag of diplomacy.others()) {
        const p = diplomacy.profile(tag);
        const item = el('div', `pick-item ${selected === tag ? 'selected' : ''}`);
        item.appendChild(img(p.flag, p.name, 'style="width:26px;height:17px;object-fit:cover"', 'F'));
        item.appendChild(el('span', 'pname', p.name));
        item.appendChild(el('span', 'pmeta', `${diplomacy.relations(tag)}`));
        if (diplomacy.isAtWar(tag)) item.appendChild(el('span', 'badge red', '戦争中'));
        item.onclick = () => { selected = tag; drawList(); drawProfile(); };
        list.appendChild(item);
      }
    };

    // プロファイル
    const prof = el('div', 'steel-card grow');
    const drawProfile = () => {
      prof.innerHTML = '';
      const p = diplomacy.profile(selected);
      prof.appendChild(el('h4', '', p.name));
      const row = el('div', 'row mt8');
      row.appendChild(img(p.flag, p.name, 'style="width:48px;height:30px;object-fit:cover;border:1px solid #000"'));
      const col = el('div', 'col');
      col.appendChild(el('div', 'kv', `<span class="k">指導者</span><span class="v">${p.leader.name}</span>`));
      col.appendChild(el('div', 'kv', `<span class="k">イデオロギー</span><span class="v">${I18N.t(`politics.${p.ideology}`)}</span>`));
      col.appendChild(el('div', 'kv', `<span class="k">関係値</span><span class="v ${p.relations < 0 ? 'bad' : p.relations > 50 ? 'good' : ''}">${p.relations}</span>`));
      col.appendChild(el('div', 'kv', `<span class="k">状態</span><span class="v ${p.atWar ? 'bad' : ''}">${p.atWar ? I18N.t('diplomacy.at_war') : I18N.t('diplomacy.peace')}</span>`));
      row.appendChild(col);
      prof.appendChild(row);

      prof.appendChild(sectionTitle(I18N.t('diplomacy.actions')));
      const acts = el('div', 'col');
      acts.style.gap = '6px';
      const mkBtn = (label, cost, fn, danger = false) => {
        const b = el('button', `steel-btn ${danger ? 'danger' : ''}`, cost != null ? `${label}（${cost} PP）` : label);
        b.onclick = () => { if (fn()) { drawList(); drawProfile(); } };
        acts.appendChild(b);
      };
      mkBtn(I18N.t('diplomacy.atache.name'), 10, () => diplomacy.sendAttache(selected));
      mkBtn(I18N.t('diplomacy.improve.name'), 25, () => diplomacy.improveRelations(selected));
      mkBtn(I18N.t('diplomacy.justify.name'), 100, () => diplomacy.justifyWarGoal(selected));
      mkBtn(I18N.t('diplomacy.guarantee.name'), 25, () => diplomacy.guarantee(selected));
      if (diplomacy.isAtWar(selected)) mkBtn('講和する', 10, () => diplomacy.makePeace(selected));
      else mkBtn(I18N.t('diplomacy.declare_war.name'), `${I18N.t('diplomacy.war_support_cost', { cost: 25 })}`, () => diplomacy.declareWar(selected), true);
      prof.appendChild(acts);
    };

    main.appendChild(list);
    main.appendChild(prof);
    body.appendChild(main);
    drawList();
    drawProfile();
    ctx.onTickScreens.push(() => { if (ctx.modals.isOpen('diplomacy')) { drawList(); drawProfile(); } });
  };
}

/* ================= 配備（兵器設計/展開）統合画面 ================= */

export function renderDeploymentScreen(ctx) {
  return (body) => {
    body.innerHTML = '';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    const tabs = el('div', 'screen-tabs');
    let tab = 'division';
    const content = el('div', 'screen-content');
    content.style.flex = '1 1 auto';
    content.style.overflow = 'auto';
    content.style.padding = '10px';
    body.appendChild(tabs);
    body.appendChild(content);

    // 海軍/空軍 指揮官スロット（UIヘッダー）
    const cmdHeader = el('div', 'row mt8');
    cmdHeader.style.flexWrap = 'wrap';
    const mkSlot = (branch, label) => {
      const wrap = el('div', 'row');
      wrap.appendChild(el('span', 'small dim', label));
      const slot = el('div', `commander-slot ${ctx.state.commanders[branch] ? 'filled' : ''}`);
      slot.style.width = '72px'; slot.style.height = '92px';
      const drawSlot = () => {
        slot.innerHTML = '';
        slot.classList.toggle('filled', !!ctx.state.commanders[branch]);
        const c = ctx.state.commanders[branch];
        if (c) {
          const card = el('div', 'commander-card');
          card.style.width = '100%';
          const face = el('div', 'face');
          if (c.portrait) face.appendChild(img(c.portrait, c.name));
          else face.appendChild(el('span', 'initial', c.name.slice(0, 1)));
          card.appendChild(face);
          card.appendChild(el('div', 'cname', c.name));
          slot.appendChild(card);
        } else slot.textContent = '空き';
      };
      slot.onclick = () => {
        const pool = ctx.cards.ofBranch(branch, ctx.state.playerTag);
        if (!pool.length) { toast(`${label}: 所持カードがありません`, 'info'); return; }
        const cur = ctx.state.commanders[branch];
        const idx = cur ? pool.findIndex((p) => p.id === cur.id) : -1;
        ctx.state.commanders[branch] = pool[(idx + 1) % pool.length];
        drawSlot();
      };
      drawSlot();
      wrap.appendChild(slot);
      return wrap;
    };
    cmdHeader.appendChild(mkSlot('navy', I18N.t('deployment.navy_commander')));
    cmdHeader.appendChild(mkSlot('air', I18N.t('deployment.air_commander')));
    cmdHeader.appendChild(el('span', 'small dim', I18N.t('deployment.assign_hint')));
    tabs.appendChild(cmdHeader);

    const tabDefs = [
      ['division', 'deployment.tabs.division'],
      ['tank', 'deployment.tabs.tank'],
      ['naval', 'deployment.tabs.naval'],
      ['air', 'deployment.tabs.air'],
      ['sim', 'deployment.tabs.sim'],
    ];
    const renderers = {
      division: renderDivisionDesigner(ctx),
      tank: renderTankDesigner(ctx),
      naval: renderNavalDesigner(ctx),
      air: renderAirDesigner(ctx),
      sim: renderSimulator(ctx),
    };
    const draw = () => {
      [...tabs.querySelectorAll('.screen-tab')].forEach((n) => n.remove());
      for (const [id, key] of tabDefs) {
        const b = el('button', `screen-tab ${tab === id ? 'active' : ''}`, I18N.t(key));
        b.onclick = () => { tab = id; draw(); };
        tabs.appendChild(b);
      }
      content.innerHTML = '';
      renderers[tab](content);
      I18N.apply(content);
    };
    draw();
  };
}

export { renderDoctrineScreen, renderIntelScreen, renderDiplomacyScreen };
