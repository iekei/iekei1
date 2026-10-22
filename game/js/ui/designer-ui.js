/**
 * ui/designer-ui.js — 兵器設計（Equipment Designer）画面
 *
 * HOI4 の装備設計画面を再現:
 *  - 左: ベース（車体/船体/機体）選択。未研究のベースはロック表示
 *  - 中: スロット（主砲/砲塔/懸架/エンジン/装甲/無線/特殊）。モジュールをドラッグ＆ドロップで装着
 *        クリックでも装着/解除できる（タッチ・キーボード操作のフォールバック）
 *  - 右: 最終ステータス（ベース値との差分つき）と設計の保存
 *  - 研究済みでないモジュールはロックされ、必要技術名をツールチップ表示
 */

import { el, img } from '../util.js';
import { I18N } from '../i18n.js';
import { sectionTitle } from './screens.js';
import {
  TANK_CHASSIS, TANK_MODULES, TANK_SLOTS,
  NAVAL_HULLS, NAVAL_MODULES, navalSlotCaps,
  AIRFRAMES, AIR_MODULES, AIR_SLOTS,
  calcTankStats, calcNavalStats, calcAirStats,
} from '../data/equipment.js';

const SVGNS = 'http://www.w3.org/2000/svg';

const KIND_META = {
  tank: {
    chassisLabel: 'シャシー',
    chassisList: TANK_CHASSIS,
    chassisKey: 'chassisId',
    chassisKeyName: 'chassis',
    slots: TANK_SLOTS,
    modules: TANK_MODULES,
    calc: calcTankStats,
    base: (c) => c,
    statDefs: [
      ['softAttack', '対人攻撃力'], ['hardAttack', '対装甲攻撃力'], ['breakthrough', '突破力'],
      ['defense', '防御力'], ['piercing', '貫通力'], ['armor', '装甲'],
      ['maxSpeed', '最高速度 (km/h)'], ['reliability', '信頼性 (%)'],
      ['productionCost', '生産コスト (IC)'], ['fuelUsePerHour', '燃料/時'], ['weight', '重量 (t)'],
    ],
  },
  naval: {
    chassisLabel: '船体',
    chassisList: NAVAL_HULLS,
    chassisKey: 'hullId',
    chassisKeyName: 'hull',
    slots: [
      { id: 'main_battery', label: '主砲', type: 'multi' },
      { id: 'secondary', label: '副砲', type: 'multi' },
      { id: 'anti_air', label: '対空砲', type: 'multi' },
      { id: 'torpedo', label: '魚雷・爆雷', type: 'multi' },
      { id: 'electronics', label: '電子装備', type: 'multi' },
      { id: 'engine', label: '機関', type: 'multi' },
      { id: 'armor', label: '装甲', type: 'multi' },
      { id: 'special', label: '特殊装備', type: 'multi' },
    ],
    modules: NAVAL_MODULES,
    calc: calcNavalStats,
    base: (c) => c,
    statDefs: [
      ['lightAttack', '軽攻撃力'], ['heavyAttack', '重攻撃力'], ['antiAir', '対空火力'],
      ['torpedo', '魚雷'], ['antiSub', '対潜'], ['armor', '装甲'], ['hp', '耐久'],
      ['speed', '速力 (kt)'], ['range', '航続距離'], ['visibility', '発見されやすさ'],
      ['productionCost', '生産コスト (IC)'], ['weight', '排水量 (t)'],
    ],
  },
  air: {
    chassisLabel: '機体',
    chassisList: AIRFRAMES,
    chassisKey: 'airframeId',
    chassisKeyName: 'airframe',
    slots: AIR_SLOTS,
    modules: AIR_MODULES,
    calc: calcAirStats,
    base: (c) => c,
    statDefs: [
      ['speed', '速度 (km/h)'], ['agility', '機動性'], ['range', '航続距離 (km)'],
      ['attack', '空対空攻撃'], ['bombing', '爆撃'], ['navalAttack', '雷撃/対艦'],
      ['hp', '耐久'], ['detection', '探知'], ['cost', '生産コスト (IC)'],
    ],
  },
};

const MODULE_LABEL = (id) => {
  const key = `equipment.modules.${id}`;
  const t = I18N.t(key);
  return t === key ? id.replace(/_/g, ' ') : t;
};

function statLabel(kind, key, fallback) {
  return fallback;
}

/* ============================ 画面本体 ============================ */

function renderDesigner(ctx, kind) {
  return (body) => {
    const { equipDesigner: designer, state } = ctx;
    const meta = KIND_META[kind];
    body.innerHTML = '';
    let dragPayload = null;

    const cur = () => designer.current[kind];
    const baseId = () => cur()[meta.chassisKey];
    const baseItem = () => meta.chassisList.find((c) => c.id === baseId());

    /* ---------- レイアウト ---------- */
    const main = el('div', 'eqd-layout');
    const left = el('div', 'eqd-col eqd-bases');
    const mid = el('div', 'eqd-col eqd-slots-col');
    const right = el('div', 'eqd-col eqd-stats-col steel-card');

    left.appendChild(sectionTitle(meta.chassisLabel));
    const baseList = el('div', 'pick-list eqd-base-list');
    left.appendChild(baseList);
    left.appendChild(el('div', 'small dim mt8', '研究が完了したベースのみ選択できます。'));

    mid.appendChild(sectionTitle('モジュールスロット'));
    const slotsWrap = el('div', 'eqd-slots');
    mid.appendChild(slotsWrap);

    const paletteWrap = el('div', 'eqd-palette');
    mid.appendChild(paletteWrap);

    right.appendChild(sectionTitle(I18N.t('equipment.designer.stats_preview')));
    const issueBox = el('div', 'eqd-issues');
    const statsBox = el('div', 'eqd-stat-list');
    right.appendChild(issueBox);
    right.appendChild(statsBox);

    const saveRow = el('div', 'row mt8');
    const nameInput = el('input', 'steel-input');
    nameInput.placeholder = I18N.t('equipment.designer.design_name');
    nameInput.style.flex = '1 1 auto';
    const saveBtn = el('button', 'steel-btn primary', I18N.t('equipment.designer.save_design'));
    saveBtn.onclick = () => {
      const design = kind === 'tank' ? designer.saveTankDesign(nameInput.value)
        : kind === 'naval' ? designer.saveNavalDesign(nameInput.value) : designer.saveAirDesign(nameInput.value);
      nameInput.value = '';
      flash(`設計「${design.name}」を保存しました`);
      drawSavedList();
    };
    saveRow.appendChild(nameInput);
    saveRow.appendChild(saveBtn);
    right.appendChild(saveRow);

    right.appendChild(sectionTitle('保存済み設計'));
    const savedList = el('div', 'eqd-saved');
    right.appendChild(savedList);

    main.appendChild(left);
    main.appendChild(mid);
    main.appendChild(right);
    body.appendChild(main);

    const flashBox = el('div', 'eqd-flash');
    body.insertBefore(flashBox, main);
    const flash = (msg, bad = false) => {
      flashBox.textContent = msg;
      flashBox.classList.toggle('bad', bad);
      flashBox.classList.add('show');
      clearTimeout(flash._t);
      flash._t = setTimeout(() => flashBox.classList.remove('show'), 2600);
    };

    /* ---------- ベース（シャシー） ---------- */
    const drawBases = () => {
      baseList.innerHTML = '';
      for (const item of designer.chassisOptions(kind)) {
        const row = el('div', `pick-item eqd-base ${item.id === baseId() ? 'selected' : ''} ${item.unlocked ? '' : 'locked'}`);
        row.appendChild(img(item.icon, item.name, 'eqd-base-icon', 'B'));
        const txt = el('div', 'eqd-base-txt');
        txt.appendChild(el('span', 'pname', item.name));
        txt.appendChild(el('span', 'pmeta', `${item.year}年${item.tier ? ` / ${item.tier}` : ''}${item.role ? ` / ${item.role}` : ''}`));
        if (!item.unlocked) txt.appendChild(el('span', 'eqd-lockline', `🔒 研究: ${item.lockedBy.join(', ')}`));
        row.appendChild(txt);
        row.onclick = () => {
          const res = designer.setChassis(kind, item.id);
          if (!res.ok) { flash(`研究が必要です: ${(res.requires || []).join(', ')}`, true); return; }
          drawAll();
        };
        baseList.appendChild(row);
      }
    };

    /* ---------- スロット ---------- */
    const slotCaps = () => (kind === 'naval' ? navalSlotCaps(baseId()) : {});

    const installedOf = (slot) => {
      const v = cur().modules[slot];
      if (Array.isArray(v)) return v;
      return v ? [v] : [];
    };

    const slotMax = (slotDef) => {
      if (kind === 'naval') return slotCaps()[slotDef.id] ?? 0;
      return slotDef.type === 'multi' ? (slotDef.max ?? 2) : 1;
    };

    const drawSlots = () => {
      slotsWrap.innerHTML = '';
      for (const slotDef of meta.slots) {
        const max = slotMax(slotDef);
        const installed = installedOf(slotDef.id);
        const zone = el('div', `eqd-slot ${installed.length ? 'filled' : ''} ${max === 0 ? 'disabled' : ''}`);
        zone.dataset.slot = slotDef.id;

        const head = el('div', 'eqd-slot-head');
        head.appendChild(el('span', 'eqd-slot-name', slotDef.label));
        head.appendChild(el('span', 'eqd-slot-cap', `${installed.length}/${max}`));
        zone.appendChild(head);

        const items = el('div', 'eqd-slot-items');
        if (!installed.length) {
          items.appendChild(el('span', 'eqd-slot-empty', max === 0 ? 'この船体では使用不可' : 'ドロップまたはクリックで装着'));
        }
        for (const id of installed) {
          const chip = el('button', 'eqd-chip installed');
          chip.type = 'button';
          chip.appendChild(el('span', 'eqd-chip-name', MODULE_LABEL(id)));
          chip.title = slotDef.type === 'single'
            ? 'クリックで取り外し（別のモジュールを選ぶと置き換え）'
            : 'クリックで取り外す';
          if (slotDef.type !== 'single') chip.appendChild(el('span', 'eqd-chip-x', '✕'));
          chip.onclick = () => {
            // 単選スロット（主砲・砲塔など）は空にできない: 置き換えのみ許可
            if (slotDef.type === 'single') {
              flash('このスロットは必須です。別のモジュールを選ぶと置き換えます。');
              return;
            }
            designer.unequip(kind, slotDef.id, id);
            drawAll();
          };
          items.appendChild(chip);
        }
        zone.appendChild(items);

        // ドラッグ＆ドロップ（HTML5 DnD）
        if (max > 0) {
          zone.addEventListener('dragover', (e) => {
            if (!dragPayload || dragPayload.slot !== slotDef.id) return;
            e.preventDefault();
            zone.classList.add('dragover');
          });
          zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
          zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            if (!dragPayload || dragPayload.slot !== slotDef.id) return;
            const res = designer.equip(kind, slotDef.id, dragPayload.id);
            if (!res.ok) flash(`研究が必要です: ${(res.requires || []).join(', ')}`, true);
            drawAll();
          });
        }
        slotsWrap.appendChild(zone);
      }
    };

    /* ---------- モジュールパレット ---------- */
    const drawPalette = () => {
      paletteWrap.innerHTML = '';
      const head = el('div', 'eqd-palette-head');
      head.appendChild(sectionTitle('研究済みモジュール'));
      const search = el('input', 'steel-input eqd-search');
      search.placeholder = 'モジュール検索…';
      head.appendChild(search);
      paletteWrap.appendChild(head);

      const groups = el('div', 'eqd-palette-groups');
      paletteWrap.appendChild(groups);

      const redraw = () => {
        groups.innerHTML = '';
        const q = (search.value || '').trim().toLowerCase();
        for (const slotDef of meta.slots) {
          if (slotMax(slotDef) === 0) continue;
          const opts = designer.options(kind, slotDef.id);
          if (!opts.length) continue;
          const group = el('div', 'eqd-palette-group');
          group.appendChild(el('div', 'eqd-palette-title', slotDef.label));
          const chips = el('div', 'eqd-palette-chips');
          for (const mod of opts) {
            const label = MODULE_LABEL(mod.id);
            if (q && !label.toLowerCase().includes(q) && !mod.id.includes(q)) continue;
            const chip = el('button', `eqd-chip ${mod.unlocked ? '' : 'locked'}`);
            chip.type = 'button';
            chip.dataset.module = mod.id;
            chip.dataset.slot = slotDef.id;
            chip.appendChild(el('span', 'eqd-chip-name', label));
            if (mod.unlocked) {
              chip.draggable = true;
              chip.addEventListener('dragstart', (e) => {
                dragPayload = { kind, slot: slotDef.id, id: mod.id };
                chip.classList.add('dragging');
                try { e.dataTransfer.setData('text/plain', `${slotDef.id}:${mod.id}`); } catch { /* older browsers */ }
                e.dataTransfer.effectAllowed = 'copy';
              });
              chip.addEventListener('dragend', () => { chip.classList.remove('dragging'); dragPayload = null; });
              chip.onclick = () => { designer.equip(kind, slotDef.id, mod.id); drawAll(); };
              chip.title = 'ドラッグまたはクリックで装着';
            } else {
              chip.appendChild(el('span', 'eqd-chip-lock', '🔒'));
              chip.title = `研究が必要: ${mod.lockedBy.join(', ')}`;
              chip.onclick = () => flash(`「${label}」は未研究です（必要: ${mod.lockedBy.join(', ')}）`, true);
            }
            chips.appendChild(chip);
          }
          if (!chips.children.length) continue;
          group.appendChild(chips);
          groups.appendChild(group);
        }
        if (!groups.children.length) groups.appendChild(el('div', 'dim small', '該当するモジュールがありません'));
      };
      search.oninput = redraw;
      redraw();
    };

    /* ---------- ステータス ---------- */
    const drawStats = () => {
      const stats = designer.stats(kind);
      const baseStats = meta.calc(baseId(), {});
      statsBox.innerHTML = '';
      if (!stats) { statsBox.appendChild(el('div', 'dim', '—')); return; }

      // ステータスは「ベース値 → 設計値（差分）」で表示
      for (const [key, label] of meta.statDefs) {
        const v = stats[key];
        if (v === undefined) continue;
        const baseV = baseStats?.[key];
        const row = el('div', 'eqd-stat');
        row.appendChild(el('span', 'eqd-stat-k', label));
        row.appendChild(el('span', 'eqd-stat-v', String(v)));
        if (baseV !== undefined && baseV !== v) {
          const d = typeof v === 'number' ? v - baseV : 0;
          const good = key === 'productionCost' || key === 'weight' || key === 'visibility' || key === 'fuelUsePerHour' ? d < 0 : d > 0;
          row.appendChild(el('span', `eqd-stat-d ${good ? 'good' : 'bad'}`, `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}`));
        }
        statsBox.appendChild(row);
      }
      if (stats.amphibious) statsBox.appendChild(el('div', 'badge gold mt8', '浮航可能'));
      if (stats.hasDropTank) statsBox.appendChild(el('div', 'badge gold mt8', `増槽装備: 航続 ${stats.range} km`));

      const v = designer.validate(kind);
      issueBox.innerHTML = '';
      if (!v.ok) {
        for (const issue of v.issues) issueBox.appendChild(el('div', 'eqd-issue', `⚠ ${issue}`));
      } else {
        issueBox.appendChild(el('div', 'eqd-issue ok', '✓ 設計は研究状況と一致しています'));
      }
    };

    /* ---------- 保存済み設計 ---------- */
    const drawSavedList = () => {
      savedList.innerHTML = '';
      const list = state.equipmentDesigns?.[kind] || [];
      if (!list.length) { savedList.appendChild(el('div', 'dim small', 'まだ設計がありません')); return; }
      for (const d of list.slice(-6).reverse()) {
        const row = el('div', 'eqd-saved-row');
        row.appendChild(el('span', 'eqd-saved-name', d.name));
        row.appendChild(el('span', 'eqd-saved-meta', `${Math.round(d.stats?.productionCost ?? 0)} IC`));
        row.onclick = () => {
          const baseKey = meta.chassisKey;
          cur()[baseKey] = d[baseKey];
          cur().modules = JSON.parse(JSON.stringify(d.modules));
          drawAll();
          flash(`「${d.name}」を読み込みました`);
        };
        savedList.appendChild(row);
      }
    };

    const drawAll = () => {
      drawBases();
      drawSlots();
      drawPalette();
      drawStats();
      drawSavedList();
    };
    drawAll();
  };
}

export const renderTankDesigner = (ctx) => renderDesigner(ctx, 'tank');
export const renderNavalDesigner = (ctx) => renderDesigner(ctx, 'naval');
export const renderAirDesigner = (ctx) => renderDesigner(ctx, 'air');

export default { renderTankDesigner, renderNavalDesigner, renderAirDesigner };
