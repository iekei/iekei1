/**
 * ui/division-designer.js — 師団編成 / 編集（Division Designer）画面
 *
 *  左   : テンプレート一覧（選択・新規・複製・削除）＋ 大隊パレット
 *  中央 : 5×5 大隊グリッド ＋ 1×5 支援中隊スロット ＋ 訓練キュー
 *  右   : リアルタイム統計（攻撃 / 防御 / 組織 / 機動 / コスト）
 *
 *  操作方法
 *    ・パレットで大隊を選択 → グリッドのスロットをクリックで配置
 *    ・同じ大隊をもう一度クリック / 右クリック / ✕ で削除
 *    ・ドラッグ＆ドロップで配置・入れ替え（パレット → スロット、スロット → スロット）
 *    ・支援中隊は下段の 1×5 スロットにのみ配置可能
 *    ・「変更を保存」でテンプレート JSON を更新し、訓練・配備に反映
 */

import { el, img, toast } from '../util.js';
import { I18N } from '../i18n.js';
import { BATTALIONS, SUPPORT_COMPANIES } from '../data/battalions.js';
import {
  GRID_W, GRID_H, SUPPORT_SLOTS, MAX_BATTALIONS,
  DivisionTemplate, divisionType, DIVISION_TYPE_LABELS, divisionTypeIcon,
} from '../division.js';
import {
  installDivisionDesigner, saveTemplate, createTemplate, duplicateTemplate, deleteTemplate,
  canTrain, startTraining, cancelTraining, trainingProgress, trainingDaysLeft,
} from '../division-designer.js';

/* ============================================================
 * 画面内の一時状態（モーダルを閉じても編集内容を保持）
 * ========================================================== */

const UI_STATE = new WeakMap();

function getUI(state) {
  let ui = UI_STATE.get(state);
  if (!ui) {
    ui = {
      selectedId: null,
      paletteTab: 'battalion',
      brush: { kind: 'battalion', id: 'infantry' },
      drafts: new Map(), // templateId -> { draft, baseline }
      drag: null,
      deleteArmedId: null,
    };
    UI_STATE.set(state, ui);
  }
  return ui;
}

const nf = (n) => Number(n || 0).toLocaleString('ja-JP');
const ri = (n) => Math.round(Number(n) || 0);
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const statText = (v) => (Math.abs(v) >= 100 ? nf(ri(v)) : (Math.round(v * 10) / 10).toString());

function snapshot(tpl) {
  return {
    name: tpl.name,
    grid: [...tpl.grid],
    support: [...tpl.support],
    stats: { ...tpl.stats },
  };
}

function signature(t) {
  return JSON.stringify([t.name, t.grid, t.support]);
}

function ensureDraft(ui, tpl) {
  let entry = ui.drafts.get(tpl.id);
  if (!entry) {
    entry = {
      draft: DivisionTemplate.fromJSON(tpl.toJSON()),
      baseline: snapshot(tpl),
    };
    ui.drafts.set(tpl.id, entry);
  }
  return entry;
}

const isDirty = (ui, tpl) => {
  const entry = ui.drafts.get(tpl.id);
  return entry ? signature(entry.draft) !== signature(entry.baseline) : false;
};

/* ============================================================
 * 統計表示の定義
 * ========================================================== */

const STAT_GROUPS = [
  {
    title: '攻撃',
    rows: [
      { key: 'softAttack', label: '対人攻撃', scale: 300, tone: 'soft', tip: '非装甲目標への攻撃力' },
      { key: 'hardAttack', label: '対装甲攻撃', scale: 220, tone: 'hard', tip: '装甲目標への攻撃力' },
      { key: 'breakthrough', label: '突破', scale: 220, tone: 'soft', tip: '攻撃時の防御力' },
    ],
  },
  {
    title: '防御・装甲',
    rows: [
      { key: 'defense', label: '防御', scale: 300, tone: 'def', tip: '防御時の戦闘力' },
      { key: 'piercing', label: '貫通', scale: 140, tone: 'hard', tip: '敵装甲を貫通する能力' },
      { key: 'armor', label: '装甲', scale: 120, tone: 'def', tip: '装甲値。貫通されにくくなる' },
      { key: 'hardness', label: '硬度', scale: 100, unit: '%', tone: 'def', tip: '高いほど対装甲攻撃で狙われる' },
    ],
  },
  {
    title: '組織・機動',
    rows: [
      { key: 'maxOrg', label: '組織力', scale: 70, tone: 'org', tip: '戦闘継続能力。支援中隊の補正込み' },
      { key: 'hp', label: '人員（HP）', scale: 300, tone: 'org', tip: '師団の耐久力' },
      { key: 'combatWidth', label: '戦闘幅', scale: 40, tone: 'org', tip: '戦場を占有する幅' },
      { key: 'speed', label: '移動速度', scale: 12, unit: ' km/h', tone: 'speed', tip: '最も遅い大隊に合わせる' },
      { key: 'supplyUse', label: '補給消費', scale: 3, tone: 'speed', tip: '1 日あたりの補給物資' },
    ],
  },
  {
    title: 'コスト',
    rows: [
      { key: 'ic', label: '生産コスト（IC）', scale: 80, tone: 'cost', tip: '師団 1 個あたりの工場コスト' },
      { key: 'manpower', label: '人的資源', scale: 3000, tone: 'cost', tip: '訓練に必要な兵員' },
      { key: 'trainDays', label: '訓練日数', scale: 180, unit: ' 日', tone: 'cost', tip: '編成の複雑さに応じて変動' },
    ],
  },
];

const TONE_CLASS = { soft: 'tone-soft', hard: 'tone-hard', def: 'tone-def', org: 'tone-org', speed: 'tone-speed', cost: 'tone-cost' };

/** 支援中隊の補正値を見やすく整形（塹壕などは実数、それ以外は %） */
const COUNT_MODS = new Set(['entrench', 'suppression']);
function formatMods(mod) {
  return Object.entries(mod || {}).map(([k, v]) => {
    const label = MOD_LABELS[k] || k;
    if (COUNT_MODS.has(k)) return `${label} +${v}`;
    return `${label} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  });
}

const BATTALION_GROUPS = [
  { title: '歩兵', type: 'infantry' },
  { title: '機甲', type: 'armor' },
  { title: '砲兵・支援火器', type: 'artillery' },
];

/* ============================================================
 * レンダラー
 * ========================================================== */

export function renderDivisionDesignerScreen(ctx) {
  return (body) => {
    const state = ctx.state;
    if (!state) return;
    installDivisionDesigner(state);

    // テンプレートが空（外部から list が空にされた等）なら既定を復元
    if (!state.divisionTemplates?.length) {
      state.divisionTemplates = [new DivisionTemplate('歩兵師団')];
      state.divisionTemplates[0].add(0, 'infantry');
      state.divisionTemplates[0].add(1, 'infantry');
      state.divisionTemplates[0].add(2, 'infantry');
    }

    const ui = getUI(state);
    const templates = state.divisionTemplates;
    if (!ui.selectedId || !templates.some((t) => t.id === ui.selectedId)) {
      ui.selectedId = templates[0]?.id || null;
    }

    body.classList.add('dd-host');
    body.innerHTML = '';

    /* ---------------- ヘッダー ---------------- */
    const root = el('div', 'dd-root');
    const head = el('div', 'dd-head');
    const headLeft = el('div', 'dd-head-left');
    const emblem = el('div', 'dd-emblem');
    const emblemImg = el('div', 'dd-emblem-img');
    emblem.appendChild(emblemImg);
    emblem.appendChild(el('span', 'dd-emblem-x', ''));
    headLeft.appendChild(emblem);
    const titleWrap = el('div', 'dd-title-wrap');
    titleWrap.appendChild(el('div', 'dd-title', '師団編成'));
    titleWrap.appendChild(el('div', 'dd-subtitle', 'DIVISION DESIGNER ／ 陸軍編成'));
    headLeft.appendChild(titleWrap);

    const headMid = el('div', 'dd-head-mid');
    const nameField = el('label', 'dd-name-field');
    nameField.appendChild(el('span', 'dd-name-label', 'テンプレート名'));
    const nameInput = el('input', 'steel-input dd-name');
    nameInput.type = 'text';
    nameInput.maxLength = 28;
    nameInput.spellcheck = false;
    nameField.appendChild(nameInput);
    headMid.appendChild(nameField);
    const typePill = el('div', 'dd-type-pill');
    headMid.appendChild(typePill);
    const dirtyFlag = el('div', 'dd-dirty-flag');
    dirtyFlag.appendChild(el('span', 'dd-dirty-dot'));
    dirtyFlag.appendChild(el('span', 'dd-dirty-text', '未保存の変更'));
    headMid.appendChild(dirtyFlag);
    headMid.appendChild(el('div', 'dd-head-count'));

    const headRight = el('div', 'dd-head-right');
    const revertBtn = el('button', 'steel-btn icon-only dd-revert', '↺');
    revertBtn.type = 'button';
    revertBtn.title = '未保存の変更を破棄して保存済みの編成に戻す';
    headRight.appendChild(revertBtn);
    const saveBtn = el('button', 'steel-btn primary dd-save', '変更を保存');
    saveBtn.type = 'button';
    saveBtn.title = '編成を JSON に保存し、今後の訓練・配備へ反映します';
    headRight.appendChild(saveBtn);
    const fullBtn = el('button', 'steel-btn icon-only dd-full-btn', '⛶');
    fullBtn.type = 'button';
    fullBtn.title = '全画面表示の切り替え';
    headRight.appendChild(fullBtn);

    head.appendChild(headLeft);
    head.appendChild(headMid);
    head.appendChild(headRight);
    root.appendChild(head);

    /* ---------------- 3 カラム ---------------- */
    const bodyEl = el('div', 'dd-body');

    /* ---- 左: テンプレート一覧 ---- */
    const left = el('div', 'dd-col dd-left');

    const tplPanel = el('section', 'dd-panel dd-tpl-panel');
    const tplPanelHead = el('div', 'dd-panel-head');
    const tplHeadTitle = el('div', 'dd-panel-title', '師団テンプレート');
    tplPanelHead.appendChild(tplHeadTitle);
    const tplCount = el('span', 'dd-panel-count');
    tplPanelHead.appendChild(tplCount);
    tplPanel.appendChild(tplPanelHead);
    const tplList = el('div', 'dd-tpl-list');
    tplPanel.appendChild(tplList);
    const tplActions = el('div', 'dd-tpl-actions');
    const newBtn = el('button', 'steel-btn dd-mini-btn', '＋ 新規');
    newBtn.type = 'button';
    const dupBtn = el('button', 'steel-btn dd-mini-btn', '⧉ 複製');
    dupBtn.type = 'button';
    const delBtn = el('button', 'steel-btn danger dd-mini-btn', '🗑 削除');
    delBtn.type = 'button';
    tplActions.appendChild(newBtn);
    tplActions.appendChild(dupBtn);
    tplActions.appendChild(delBtn);
    tplPanel.appendChild(tplActions);
    left.appendChild(tplPanel);

    /* ---- 左: 大隊パレット ---- */
    const palette = el('section', 'dd-panel dd-palette');
    const palHead = el('div', 'dd-panel-head');
    palHead.appendChild(el('div', 'dd-panel-title', '利用可能な大隊'));
    const eraserBtn = el('button', 'dd-eraser-btn', '⌫ 消去');
    eraserBtn.type = 'button';
    eraserBtn.title = '消去モード（スロットをクリックして削除）';
    palHead.appendChild(eraserBtn);
    palette.appendChild(palHead);
    const palTabs = el('div', 'dd-tabs');
    const tabBatt = el('button', 'dd-tab active', '大隊');
    tabBatt.type = 'button';
    const tabSupp = el('button', 'dd-tab', '支援中隊');
    tabSupp.type = 'button';
    palTabs.appendChild(tabBatt);
    palTabs.appendChild(tabSupp);
    palette.appendChild(palTabs);
    const palHint = el('div', 'dd-pal-hint', '選択 → クリックで配置 ／ ドラッグ＆ドロップ');
    palette.appendChild(palHint);
    const palList = el('div', 'dd-palette-list');
    palette.appendChild(palList);
    left.appendChild(palette);

    /* ---- 中央 ---- */
    const center = el('div', 'dd-col dd-center');

    const gridPanel = el('section', 'dd-panel dd-grid-panel');
    const gridHead = el('div', 'dd-panel-head');
    gridHead.appendChild(el('div', 'dd-panel-title', '大隊グリッド'));
    const gridCount = el('span', 'dd-panel-count');
    gridHead.appendChild(gridCount);
    gridPanel.appendChild(gridHead);

    const gridStage = el('div', 'dd-grid-stage');
    const grid = el('div', 'dd-grid');
    gridStage.appendChild(grid);
    gridPanel.appendChild(gridStage);

    const supportHead = el('div', 'dd-support-head');
    supportHead.appendChild(el('span', 'dd-support-label', '支援中隊'));
    supportHead.appendChild(el('span', 'dd-support-sub', '最大 5 スロット'));
    gridPanel.appendChild(supportHead);
    const supportRow = el('div', 'dd-support-row');
    gridPanel.appendChild(supportRow);

    const hintRow = el('div', 'dd-hint-row');
    hintRow.appendChild(el('span', 'dd-hint', 'クリックで配置 ／ 右クリック・✕で削除 ／ ドラッグで入れ替え'));
    const clearBtn = el('button', 'steel-btn dd-mini-btn', '編成をクリア');
    clearBtn.type = 'button';
    hintRow.appendChild(clearBtn);
    gridPanel.appendChild(hintRow);
    center.appendChild(gridPanel);

    /* ---- 中央: 訓練キュー ---- */
    const trainingPanel = el('section', 'dd-panel dd-training');
    center.appendChild(trainingPanel);

    /* ---- 右: ステータス ---- */
    const right = el('div', 'dd-col dd-right');
    const statsPanel = el('section', 'dd-panel dd-stats');
    const statsHead = el('div', 'dd-panel-head');
    statsHead.appendChild(el('div', 'dd-panel-title', '師団ステータス'));
    const live = el('span', 'dd-live');
    live.appendChild(el('span', 'led green'));
    live.appendChild(el('span', '', 'LIVE'));
    statsHead.appendChild(live);
    statsPanel.appendChild(statsHead);
    const statsBody = el('div', 'dd-stats-body');
    statsPanel.appendChild(statsBody);
    right.appendChild(statsPanel);

    bodyEl.appendChild(left);
    bodyEl.appendChild(center);
    bodyEl.appendChild(right);
    root.appendChild(bodyEl);
    body.appendChild(root);

    /* ============================================================
     * 基本参照
     * ========================================================== */

    const getTpl = () => templates.find((t) => t.id === ui.selectedId) || templates[0] || null;
    let entry = null;
    let draft = null;
    let baseline = null;

    function bindDraft() {
      const tpl = getTpl();
      if (!tpl) { entry = null; draft = null; baseline = null; return; }
      entry = ensureDraft(ui, tpl);
      draft = entry.draft;
      baseline = entry.baseline;
      nameInput.value = draft.name;
    }

    const dirtyNow = () => {
      const tpl = getTpl();
      return tpl ? isDirty(ui, tpl) : false;
    };

    /* ============================================================
     * ヘッダー
     * ========================================================== */

    function drawHeader() {
      if (!draft) {
        emblemImg.innerHTML = '';
        emblemImg.appendChild(img('game/assets/land_units/unit_infantry_icon.png', '', '', '▦'));
        typePill.textContent = '未編成';
        typePill.className = 'dd-type-pill empty';
        nameInput.value = '';
        dirtyFlag.classList.remove('show');
        saveBtn.disabled = true;
        revertBtn.disabled = true;
        headMid.querySelector('.dd-head-count').textContent = '';
        return;
      }
      const type = divisionType(draft);
      const icon = divisionTypeIcon(type);
      emblemImg.innerHTML = '';
      if (icon) emblemImg.appendChild(img(icon, DIVISION_TYPE_LABELS[type] || ''));
      else emblemImg.appendChild(el('span', 'dd-emblem-none', '▦'));
      typePill.textContent = DIVISION_TYPE_LABELS[type] || type;
      typePill.className = `dd-type-pill type-${type}`;
      const dirty = dirtyNow();
      dirtyFlag.classList.toggle('show', dirty);
      saveBtn.disabled = !dirty || draft.isEmpty;
      saveBtn.classList.toggle('pulse', dirty && !draft.isEmpty);
      revertBtn.disabled = !dirty;
      const tpl = getTpl();
      headMid.querySelector('.dd-head-count').textContent =
        `大隊 ${draft.battalionCount}/${MAX_BATTALIONS}　支援 ${draft.supportCount}/${SUPPORT_SLOTS}　配備 ${nf(tpl?.count || 0)}`;
    }

    /* ============================================================
     * テンプレート一覧
     * ========================================================== */

    function drawTemplateList() {
      tplList.innerHTML = '';
      tplCount.textContent = `${templates.length} 件`;
      if (!templates.length) {
        tplList.appendChild(el('div', 'dd-empty-note', 'テンプレートがありません。「＋ 新規」から作成してください。'));
        return;
      }
      for (const tpl of templates) {
        const item = el('div', `dd-tpl${tpl.id === ui.selectedId ? ' selected' : ''}`);
        item.tabIndex = 0;
        // 未保存の編集内容があれば一覧にもリアルタイムで反映する
        const entry = ui.drafts.get(tpl.id);
        const view = entry?.draft || tpl;
        const type = divisionType(view);
        const icon = el('div', 'dd-tpl-icon');
        const iconPath = divisionTypeIcon(type);
        if (iconPath) icon.appendChild(img(iconPath, view.name, '', '▦'));
        item.appendChild(icon);

        const main = el('div', 'dd-tpl-main');
        const top = el('div', 'dd-tpl-top');
        top.appendChild(el('span', 'dd-tpl-name', view.name));
        if (isDirty(ui, tpl)) top.appendChild(el('span', 'dd-tpl-dirty', '●'));
        main.appendChild(top);
        const meta = el('div', 'dd-tpl-meta');
        meta.appendChild(el('span', '', DIVISION_TYPE_LABELS[type] || ''));
        meta.appendChild(el('span', 'sep', '・'));
        meta.appendChild(el('span', '', `大隊 ${view.battalionCount}`));
        meta.appendChild(el('span', 'sep', '・'));
        meta.appendChild(el('span', '', `配備 ${nf(tpl.count || 0)}`));
        main.appendChild(meta);
        item.appendChild(main);

        const vals = el('div', 'dd-tpl-vals');
        vals.appendChild(el('span', '', `ORG ${view.stats.maxOrg}`));
        vals.appendChild(el('span', '', `SPD ${r1(view.stats.speed)}`));
        item.appendChild(vals);

        item.addEventListener('click', () => {
          if (ui.selectedId === tpl.id) return;
          ui.selectedId = tpl.id;
          ui.deleteArmedId = null;
          resetDeleteButton();
          bindDraft();
          drawAll();
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
        });
        tplList.appendChild(item);
      }
    }

    /* ============================================================
     * パレット
     * ========================================================== */

    function paletteItem(kind, id, data) {
      const selected = ui.brush.kind === kind && ui.brush.id === id;
      const btn = el('div', `dd-pick${selected ? ' selected' : ''}`);
      btn.draggable = true;
      btn.tabIndex = 0;
      btn.dataset.kind = kind;
      btn.dataset.id = id;
      const icon = el('div', 'dd-pick-icon');
      icon.appendChild(img(data.icon, '', '', kind === 'battalion' ? 'B' : 'S'));
      btn.appendChild(icon);

      const main = el('div', 'dd-pick-main');
      main.appendChild(el('div', 'dd-pick-name', kind === 'battalion' ? I18N.battalionName(id) : I18N.supportName(id)));
      const meta = el('div', 'dd-pick-meta');
      if (kind === 'battalion') {
        const s = data.stats;
        meta.textContent = `対人 ${s.soft} ・ 対装 ${s.hard} ・ 突破 ${s.bt} ・ 組織 ${s.org} ・ 幅 ${s.width}`;
        btn.title = `${I18N.battalionName(id)}\n対人攻撃 ${s.soft} / 対装甲攻撃 ${s.hard} / 防御 ${s.def} / 突破 ${s.bt}\n貫通 ${s.piercing} / 装甲 ${s.armor} / 戦闘幅 ${s.width} / 速度 ${s.speed}\n補給 ${s.supply} / 生産コスト ${s.ic} IC / 人員 ${nf(s.manpower)}`;
      } else {
        const mods = formatMods(data.mod);
        meta.textContent = mods.length ? mods.slice(0, 2).join(' ・ ') : '師団支援';
        btn.title = `${I18N.supportName(id)}\n${mods.join('\n') || '師団全体を支援'}`;
      }
      main.appendChild(meta);
      btn.appendChild(main);

      const apply = () => {
        ui.brush = { kind, id };
        ui.deleteArmedId = null;
        markPalette();
        drawGrid();
      };
      btn.addEventListener('click', apply);
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
      });
      btn.addEventListener('dragstart', (e) => {
        ui.drag = { kind, id };
        try {
          e.dataTransfer.setData('text/plain', JSON.stringify({ kind, id }));
          e.dataTransfer.effectAllowed = 'copy';
        } catch { /* Safari */ }
        btn.classList.add('dragging');
      });
      btn.addEventListener('dragend', () => { ui.drag = null; btn.classList.remove('dragging'); });
      return btn;
    }

    function drawPalette() {
      palList.innerHTML = '';
      tabBatt.classList.toggle('active', ui.paletteTab === 'battalion');
      tabSupp.classList.toggle('active', ui.paletteTab === 'support');
      if (ui.paletteTab === 'battalion') {
        for (const group of BATTALION_GROUPS) {
          const items = Object.entries(BATTALIONS).filter(([, b]) => b.type === group.type);
          if (!items.length) continue;
          const gh = el('div', 'dd-pal-group');
          gh.appendChild(el('span', '', group.title));
          gh.appendChild(el('span', 'dd-pal-group-count', `${items.length}`));
          palList.appendChild(gh);
          for (const [id, b] of items) palList.appendChild(paletteItem('battalion', id, b));
        }
      } else {
        const gh = el('div', 'dd-pal-group');
        gh.appendChild(el('span', '', '支援中隊（1×5）'));
        gh.appendChild(el('span', 'dd-pal-group-count', `${Object.keys(SUPPORT_COMPANIES).length}`));
        palList.appendChild(gh);
        for (const [id, c] of Object.entries(SUPPORT_COMPANIES)) palList.appendChild(paletteItem('support', id, c));
      }
      markPalette();
    }

    function markPalette() {
      for (const n of palList.querySelectorAll('.dd-pick')) {
        const on = n.dataset.kind === ui.brush.kind && n.dataset.id === ui.brush.id;
        n.classList.toggle('selected', on);
      }
      eraserBtn.classList.toggle('active', ui.brush.kind === 'eraser');
    }

    /* ============================================================
     * グリッド
     * ========================================================== */

    function applyGridCell(i) {
      if (!draft) return;
      if (ui.brush.kind === 'eraser') {
        draft.remove(i);
      } else if (ui.brush.kind === 'battalion') {
        if (draft.grid[i] === ui.brush.id) draft.remove(i);
        else draft.add(i, ui.brush.id);
      } else {
        toast('支援中隊は下段の支援スロットに配置してください', 'info');
        return;
      }
      afterEdit();
    }

    function applySupportSlot(i) {
      if (!draft) return;
      if (ui.brush.kind === 'eraser') {
        draft.removeSupport(i);
      } else if (ui.brush.kind === 'support') {
        if (draft.support[i] === ui.brush.id) draft.removeSupport(i);
        else draft.addSupport(i, ui.brush.id);
      } else {
        toast('支援スロットには支援中隊のみ配置できます', 'info');
        return;
      }
      afterEdit();
    }

    function dropOnGrid(i, e) {
      e.preventDefault();
      if (!draft) return;
      let p = ui.drag;
      if (!p) {
        try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { p = null; }
      }
      if (!p) return;
      if (p.kind === 'battalion') {
        draft.add(i, p.id);
        ui.brush = { kind: 'battalion', id: p.id };
        markPalette();
      } else if (p.kind === 'support') {
        toast('支援中隊は下段の支援スロットに配置してください', 'info');
        return;
      } else if (p.kind === 'cell') {
        if (p.index === i) return;
        const tmp = draft.grid[i];
        draft.grid[i] = draft.grid[p.index];
        draft.grid[p.index] = tmp;
        draft._recalc();
      }
      ui.drag = null;
      afterEdit();
    }

    function dropOnSupport(i, e) {
      e.preventDefault();
      if (!draft) return;
      let p = ui.drag;
      if (!p) {
        try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { p = null; }
      }
      if (!p) return;
      if (p.kind === 'support') {
        draft.addSupport(i, p.id);
        ui.brush = { kind: 'support', id: p.id };
        markPalette();
      } else if (p.kind === 'battalion') {
        toast('大隊は中央のグリッドに配置してください', 'info');
        return;
      } else if (p.kind === 'support-slot') {
        if (p.index === i) return;
        const tmp = draft.support[i];
        draft.support[i] = draft.support[p.index];
        draft.support[p.index] = tmp;
        draft._recalc();
      }
      ui.drag = null;
      afterEdit();
    }

    function drawGrid() {
      grid.innerHTML = '';
      supportRow.innerHTML = '';
      if (!draft) {
        gridCount.textContent = '';
        return;
      }
      gridCount.textContent = `大隊 ${draft.battalionCount} / ${MAX_BATTALIONS}`;
      for (let i = 0; i < GRID_W * GRID_H; i++) {
        const id = draft.grid[i];
        const b = id ? BATTALIONS[id] : null;
        const cell = el('div', `dd-cell${id ? ' filled' : ''}`);
        cell.dataset.index = i;
        if (b) {
          cell.classList.add(`btype-${b.type}`);
          const icon = img(b.icon, I18N.battalionName(id), '', 'B');
          icon.draggable = false;
          cell.appendChild(icon);
          cell.appendChild(el('span', 'dd-cell-name', I18N.battalionName(id).replace('大隊', '')));
          const x = el('span', 'dd-cell-x', '✕');
          x.title = '削除';
          x.addEventListener('click', (e) => {
            e.stopPropagation();
            draft.remove(i);
            afterEdit();
          });
          cell.appendChild(x);
          cell.title = `${I18N.battalionName(id)}\n対人 ${b.stats.soft} / 対装 ${b.stats.hard} / 突破 ${b.stats.bt} / 防御 ${b.stats.def}\nドラッグで移動・入れ替え`;
          cell.draggable = true;
          cell.addEventListener('dragstart', (e) => {
            ui.drag = { kind: 'cell', index: i };
            try {
              e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'cell', index: i }));
              e.dataTransfer.effectAllowed = 'move';
            } catch { /* ignore */ }
            cell.classList.add('dragging');
          });
          cell.addEventListener('dragend', () => { ui.drag = null; cell.classList.remove('dragging'); });
        } else {
          cell.appendChild(el('span', 'dd-cell-plus', '+'));
          cell.title = 'クリックで大隊を配置';
        }
        cell.addEventListener('click', () => applyGridCell(i));
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!id) return;
          draft.remove(i);
          afterEdit();
        });
        cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (e) => { cell.classList.remove('drag-over'); dropOnGrid(i, e); });
        grid.appendChild(cell);
      }

      for (let i = 0; i < SUPPORT_SLOTS; i++) {
        const id = draft.support[i];
        const c = id ? SUPPORT_COMPANIES[id] : null;
        const cell = el('div', `dd-sup-cell${id ? ' filled' : ''}`);
        cell.dataset.index = i;
        const label = el('span', 'dd-sup-index', `${i + 1}`);
        cell.appendChild(label);
        if (c) {
          const icon = img(c.icon, I18N.supportName(id), '', 'S');
          icon.draggable = false;
          cell.appendChild(icon);
          const nameEl = el('span', 'dd-sup-name', I18N.supportName(id).replace('中隊', ''));
          cell.appendChild(nameEl);
          const x = el('span', 'dd-cell-x', '✕');
          x.title = '削除';
          x.addEventListener('click', (e) => {
            e.stopPropagation();
            draft.removeSupport(i);
            afterEdit();
          });
          cell.appendChild(x);
          const mods = formatMods(c.mod).join(' ・ ');
          cell.title = `${I18N.supportName(id)}${mods ? `\n${mods}` : ''}`;
          cell.draggable = true;
          cell.addEventListener('dragstart', (e) => {
            ui.drag = { kind: 'support-slot', index: i };
            try {
              e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'support-slot', index: i }));
              e.dataTransfer.effectAllowed = 'move';
            } catch { /* ignore */ }
          });
          cell.addEventListener('dragend', () => { ui.drag = null; });
        } else {
          cell.appendChild(el('span', 'dd-sup-empty', '支援なし'));
          cell.title = 'クリックで支援中隊を配置';
        }
        cell.addEventListener('click', () => applySupportSlot(i));
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!id) return;
          draft.removeSupport(i);
          afterEdit();
        });
        cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (e) => { cell.classList.remove('drag-over'); dropOnSupport(i, e); });
        supportRow.appendChild(cell);
      }
    }

    /* ============================================================
     * ステータス（リアルタイム計算）
     * ========================================================== */

    function statDelta(v, base, key) {
      const d = (Number(v) || 0) - (Number(base?.[key]) || 0);
      if (Math.abs(d) < 0.05) return null;
      return d;
    }

    function drawStats() {
      statsBody.innerHTML = '';
      if (!draft) {
        statsBody.appendChild(el('div', 'dd-empty-note', 'テンプレートを選択してください'));
        return;
      }
      const st = draft.stats;
      const base = baseline?.stats || {};

      /* 組織率ヒーロー */
      const hero = el('div', 'dd-org-hero');
      const ring = el('div', 'dd-org-ring');
      const pct = Math.max(0, Math.min(120, st.orgRate || 0));
      ring.style.setProperty('--p', String(pct));
      ring.appendChild(el('b', '', `${st.maxOrg}`));
      ring.appendChild(el('small', '', '組織力'));
      hero.appendChild(ring);
      const heroInfo = el('div', 'dd-org-info');
      const rateRow = el('div', 'dd-org-rate');
      rateRow.appendChild(el('span', '', '組織率'));
      const rateDelta = statDelta(st.orgRate, base, 'orgRate');
      rateRow.appendChild(el('b', '', `${st.orgRate}%`));
      if (rateDelta != null) rateRow.appendChild(el('i', `dd-delta ${rateDelta > 0 ? 'up' : 'down'}`, `${rateDelta > 0 ? '+' : ''}${r1(rateDelta)}`));
      heroInfo.appendChild(rateRow);
      heroInfo.appendChild(el('div', 'dd-org-note', `満編成（組織力 60）比 ／ 大隊 ${draft.battalionCount} 個`));
      const chips = el('div', 'dd-hero-chips');
      chips.appendChild(el('span', '', `戦闘幅 ${st.combatWidth}`));
      chips.appendChild(el('span', '', `速度 ${r1(st.speed)}`));
      chips.appendChild(el('span', '', `補給 ${st.supplyUse}`));
      heroInfo.appendChild(chips);
      hero.appendChild(heroInfo);
      statsBody.appendChild(hero);

      /* グループ */
      for (const group of STAT_GROUPS) {
        const g = el('div', 'dd-stat-group');
        g.appendChild(el('div', 'dd-stat-group-title', group.title));
        for (const row of group.rows) {
          const v = Number(st[row.key]) || 0;
          const line = el('div', 'dd-stat-row');
          const top = el('div', 'dd-stat-top');
          top.appendChild(el('span', 'dd-stat-k', row.label));
          const valWrap = el('span', 'dd-stat-v');
          valWrap.appendChild(el('b', '', `${statText(v)}${row.unit || ''}`));
          const d = statDelta(v, base, row.key);
          if (d != null) valWrap.appendChild(el('i', `dd-delta ${d > 0 ? 'up' : 'down'}`, `${d > 0 ? '+' : '-'}${statText(Math.abs(d))}`));
          top.appendChild(valWrap);
          line.appendChild(top);
          const bar = el('div', 'dd-stat-bar');
          const fill = el('i', TONE_CLASS[row.tone] || '');
          fill.style.width = v > 0 ? `${Math.max(2, Math.min(100, (v / row.scale) * 100))}%` : '0%';
          bar.appendChild(fill);
          line.appendChild(bar);
          line.title = row.tip || '';
          g.appendChild(line);
        }
        statsBody.appendChild(g);
      }

      /* 必要装備 */
      const equip = el('div', 'dd-equip');
      const eqHead = el('div', 'dd-stat-group-title', '必要装備（師団 1 個）');
      equip.appendChild(eqHead);
      const entries = Object.entries(draft.equipment || {});
      if (!entries.length) {
        equip.appendChild(el('div', 'dd-empty-note', '大隊を配置すると必要装備が表示されます'));
      } else {
        for (const [k, v] of entries) {
          const stock = state.stockpile?.[k] || 0;
          const rowEl = el('div', 'dd-equip-row');
          rowEl.appendChild(el('span', 'dd-equip-k', I18N.equipName(k)));
          rowEl.appendChild(el('span', `dd-equip-v${stock < v ? ' short' : ''}`, `×${nf(v)}`));
          rowEl.title = `備蓄 ${nf(stock)}${stock < v ? '（不足）' : ''}`;
          equip.appendChild(rowEl);
        }
        const total = el('div', 'dd-equip-total');
        total.appendChild(el('span', '', '装備合計'));
        total.appendChild(el('b', '', nf(st.equipmentTotal)));
        equip.appendChild(total);
      }
      statsBody.appendChild(equip);

      /* 編成サマリー */
      const summary = el('div', 'dd-summary');
      summary.appendChild(el('div', 'dd-stat-group-title', '編成内訳'));
      const comp = draft.composition();
      const compEntries = Object.entries(comp);
      if (!compEntries.length) summary.appendChild(el('div', 'dd-empty-note', '未編成'));
      for (const [id, count] of compEntries) {
        const rowEl = el('div', 'dd-equip-row');
        rowEl.appendChild(el('span', 'dd-equip-k', I18N.battalionName(id)));
        rowEl.appendChild(el('span', 'dd-equip-v', `×${count}`));
        summary.appendChild(rowEl);
      }
      const supEntries = draft.supports;
      for (const id of supEntries) {
        const rowEl = el('div', 'dd-equip-row support');
        rowEl.appendChild(el('span', 'dd-equip-k', I18N.supportName(id)));
        rowEl.appendChild(el('span', 'dd-equip-v', '支援'));
        summary.appendChild(rowEl);
      }
      statsBody.appendChild(summary);
    }

    /* ============================================================
     * 訓練キュー
     * ========================================================== */

    function drawTraining() {
      trainingPanel.innerHTML = '';
      if (!draft) return;
      const pq = el('div', 'dd-panel-head');
      pq.appendChild(el('div', 'dd-panel-title', '訓練・配備'));
      const tpl = getTpl();
      pq.appendChild(el('span', 'dd-panel-count', `配備済み ${nf(tpl?.count || 0)} 個`));
      trainingPanel.appendChild(pq);

      const bodyBox = el('div', 'dd-train-body');
      const cost = el('div', 'dd-train-cost');
      const c1 = el('div', 'dd-train-cost-item');
      c1.appendChild(el('span', 'k', '人的資源'));
      c1.appendChild(el('b', '', nf(draft.stats.manpower)));
      const c2 = el('div', 'dd-train-cost-item');
      c2.appendChild(el('span', 'k', '装備'));
      c2.appendChild(el('b', '', nf(draft.stats.equipmentTotal)));
      const c3 = el('div', 'dd-train-cost-item');
      c3.appendChild(el('span', 'k', '訓練'));
      c3.appendChild(el('b', '', `${draft.stats.trainDays} 日`));
      cost.appendChild(c1);
      cost.appendChild(c2);
      cost.appendChild(c3);
      bodyBox.appendChild(cost);

      const check = canTrain(state, draft);
      const btnRow = el('div', 'dd-train-actions');
      const trainBtn = el('button', 'steel-btn primary dd-train-btn', 'この編成で訓練開始');
      trainBtn.type = 'button';
      trainBtn.disabled = !check.ok;
      if (!check.ok) {
        trainBtn.title = draft.isEmpty ? '大隊を配置してください' : `不足: ${check.missing.join(' / ')}`;
      }
      trainBtn.addEventListener('click', () => {
        const tplNow = getTpl();
        if (!tplNow) return;
        if (dirtyNow()) {
          toast('未保存の変更があります。先に「変更を保存」してください', 'bad');
          return;
        }
        const r = startTraining(state, tplNow);
        if (!r.ok) {
          toast(`訓練を開始できません: ${r.reason}`, 'bad');
          return;
        }
        toast(`「${r.order.name}」の訓練を開始しました（${r.order.daysRequired} 日）`, 'good');
        drawAll();
      });
      btnRow.appendChild(trainBtn);
      if (!check.ok && !draft.isEmpty) {
        btnRow.appendChild(el('span', 'dd-train-missing', `不足: ${check.missing.join(' ／ ')}`));
      }
      bodyBox.appendChild(btnRow);

      const queue = state.trainingQueue || [];
      const qHead = el('div', 'dd-queue-head');
      qHead.appendChild(el('span', '', '訓練キュー'));
      qHead.appendChild(el('span', 'dd-queue-count', `${queue.length} / 8`));
      bodyBox.appendChild(qHead);
      const qList = el('div', 'dd-queue-list');
      if (!queue.length) {
        qList.appendChild(el('div', 'dd-empty-note', '訓練中の師団はありません'));
      }
      for (const order of queue) {
        const p = trainingProgress(order);
        const row = el('div', 'dd-queue-item');
        const top = el('div', 'dd-queue-top');
        top.appendChild(el('span', 'dd-queue-name', order.name));
        top.appendChild(el('span', 'dd-queue-days', `残り ${trainingDaysLeft(order)} 日`));
        row.appendChild(top);
        const bar = el('div', 'mil-bar');
        const fill = el('i');
        fill.style.width = `${Math.max(1, p * 100)}%`;
        bar.appendChild(fill);
        const pct = el('b', '', `${Math.round(p * 100)}%`);
        bar.appendChild(pct);
        row.appendChild(bar);
        const cancel = el('button', 'dd-queue-cancel', '✕');
        cancel.type = 'button';
        cancel.title = '訓練を中止（資源を返却）';
        cancel.addEventListener('click', () => {
          const r = cancelTraining(state, order.id);
          if (r.ok) {
            toast(`「${order.name}」の訓練を中止しました（資源を返却）`, 'info');
            drawAll();
          }
        });
        row.appendChild(cancel);
        qList.appendChild(row);
      }
      bodyBox.appendChild(qList);
      trainingPanel.appendChild(bodyBox);
    }

    /* ============================================================
     * 更新
     * ========================================================== */

    function afterEdit() {
      if (!draft) return;
      drawGrid();
      drawStats();
      drawHeader();
      drawTemplateList();
      drawTraining();
    }

    function drawAll() {
      if (!draft) {
        // テンプレートが 1 つも無い
        drawHeader();
        drawTemplateList();
        drawPalette();
        grid.innerHTML = '';
        supportRow.innerHTML = '';
        statsBody.innerHTML = '';
        trainingPanel.innerHTML = '';
        return;
      }
      drawHeader();
      drawTemplateList();
      drawPalette();
      drawGrid();
      drawStats();
      drawTraining();
    }

    /* ============================================================
     * ヘッダー / 左パネルの操作
     * ========================================================== */

    nameInput.addEventListener('input', () => {
      if (!draft) return;
      draft.name = nameInput.value;
      drawHeader();
      drawTemplateList();
    });
    nameInput.addEventListener('blur', () => {
      if (!draft) return;
      const trimmed = nameInput.value.trim() || '名称未設定師団';
      if (trimmed !== nameInput.value) nameInput.value = trimmed;
      draft.name = trimmed;
      drawHeader();
      drawTemplateList();
    });

    revertBtn.addEventListener('click', () => {
      const tpl = getTpl();
      if (!tpl || !draft) return;
      entry.draft = DivisionTemplate.fromJSON(tpl.toJSON());
      entry.baseline = snapshot(tpl);
      draft = entry.draft;
      baseline = entry.baseline;
      ui.drafts.set(tpl.id, entry);
      nameInput.value = draft.name;
      drawAll();
      toast('未保存の変更を破棄しました', 'info');
    });

    saveBtn.addEventListener('click', () => {
      const tpl = getTpl();
      if (!tpl || !draft) return;
      if (draft.isEmpty) {
        toast('大隊が 1 個も配置されていません', 'bad');
        return;
      }
      // ドラフトを保存対象のテンプレートへ反映
      tpl.name = nameInput.value.trim() || '名称未設定師団';
      tpl.grid = [...draft.grid];
      tpl.support = [...draft.support];
      tpl._recalc();
      const r = saveTemplate(state, templates, tpl);
      if (!r.ok) {
        toast(`保存できません: ${r.reason}`, 'bad');
        return;
      }
      // ベースライン更新（差分表示をリセット）
      entry.baseline = snapshot(tpl);
      entry.draft = DivisionTemplate.fromJSON(tpl.toJSON());
      draft = entry.draft;
      baseline = entry.baseline;
      ui.drafts.set(tpl.id, entry);
      toast(`「${tpl.name}」を保存しました（訓練・配備に反映）`, 'good');
      drawAll();
    });

    newBtn.addEventListener('click', () => {
      const tpl = createTemplate(state, templates, `新型師団 ${templates.length + 1}`);
      ui.selectedId = tpl.id;
      ui.deleteArmedId = null;
      resetDeleteButton();
      bindDraft();
      drawAll();
      nameInput.focus();
      nameInput.select();
      toast('新しい師団テンプレートを作成しました', 'info');
    });

    dupBtn.addEventListener('click', () => {
      const tpl = getTpl();
      if (!tpl) return;
      // 未保存の編集内容も複製する（元テンプレートは変更しない）
      const copy = duplicateTemplate(state, templates, tpl, draft);
      ui.selectedId = copy.id;
      ui.deleteArmedId = null;
      resetDeleteButton();
      bindDraft();
      drawAll();
      toast(`「${copy.name}」を複製しました`, 'good');
    });

    function resetDeleteButton() {
      delBtn.classList.remove('armed');
      delBtn.textContent = '🗑 削除';
    }

    delBtn.addEventListener('click', () => {
      const tpl = getTpl();
      if (!tpl) return;
      if (ui.deleteArmedId !== tpl.id) {
        ui.deleteArmedId = tpl.id;
        delBtn.classList.add('armed');
        delBtn.textContent = '削除を確定';
        setTimeout(() => {
          if (ui.deleteArmedId === tpl.id) {
            ui.deleteArmedId = null;
            resetDeleteButton();
          }
        }, 3200);
        return;
      }
      const r = deleteTemplate(state, templates, tpl);
      ui.deleteArmedId = null;
      resetDeleteButton();
      if (!r.ok) {
        toast(`削除できません: ${r.reason}`, 'bad');
        return;
      }
      ui.drafts.delete(tpl.id);
      if (!templates.length) {
        const nt = createTemplate(state, templates, '新型師団');
        ui.selectedId = nt.id;
      } else {
        ui.selectedId = templates[0].id;
      }
      bindDraft();
      drawAll();
      toast(`「${tpl.name}」を削除しました`, 'info');
    });

    clearBtn.addEventListener('click', () => {
      if (!draft) return;
      draft.clear();
      afterEdit();
      toast('編成をクリアしました（保存するまで確定しません）', 'info');
    });

    tabBatt.addEventListener('click', () => {
      if (ui.paletteTab === 'battalion') return;
      ui.paletteTab = 'battalion';
      if (ui.brush.kind !== 'battalion') ui.brush = { kind: 'battalion', id: 'infantry' };
      drawPalette();
      drawGrid();
    });
    tabSupp.addEventListener('click', () => {
      if (ui.paletteTab === 'support') return;
      ui.paletteTab = 'support';
      if (ui.brush.kind !== 'support') ui.brush = { kind: 'support', id: 'engineer' };
      drawPalette();
      drawGrid();
    });
    eraserBtn.addEventListener('click', () => {
      if (ui.brush.kind === 'eraser') {
        ui.brush = { kind: ui.paletteTab, id: ui.paletteTab === 'battalion' ? 'infantry' : 'engineer' };
      } else {
        ui.brush = { kind: 'eraser' };
      }
      markPalette();
      drawGrid();
    });

    fullBtn.addEventListener('click', () => {
      const overlay = body.closest('.modal-overlay');
      if (overlay) {
        overlay.classList.toggle('dd-max');
        fullBtn.classList.toggle('active', overlay.classList.contains('dd-max'));
        fullBtn.title = overlay.classList.contains('dd-max') ? '通常サイズに戻す' : '全画面表示';
      } else {
        root.classList.toggle('dd-expanded');
        fullBtn.classList.toggle('active', root.classList.contains('dd-expanded'));
      }
    });

    // Ctrl/Cmd + S で保存
    const onKey = (e) => {
      if (!body.isConnected) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saveBtn.disabled) saveBtn.click();
      }
    };
    document.addEventListener('keydown', onKey);

    /* ============================================================
     * 訓練の進行に合わせた再描画
     * ========================================================== */

    const onQueued = () => { if (body.isConnected) { drawTraining(); drawHeader(); } };
    const onCancelled = onQueued;
    const onTrained = ({ division }) => {
      if (!body.isConnected) return;
      toast(`師団「${division.name}」が配備されました`, 'good');
      drawAll();
    };
    const offs = [
      state.bus.on('division-training-queued', onQueued),
      state.bus.on('division-training-cancelled', onCancelled),
      state.bus.on('division-trained', onTrained),
    ];

    let lastQueueSig = '';
    const timer = setInterval(() => {
      if (!body.isConnected) {
        clearInterval(timer);
        document.removeEventListener('keydown', onKey);
        offs.forEach((off) => { try { off(); } catch { /* ignore */ } });
        return;
      }
      const q = state.trainingQueue || [];
      const sig = q.map((o) => `${o.id}:${o.hours || 0}`).join('|');
      if (sig !== lastQueueSig) {
        lastQueueSig = sig;
        drawTraining();
      }
    }, 1000);

    /* ============================================================
     * 初期描画
     * ========================================================== */
    bindDraft();
    drawAll();
  };
}

/* 支援中隊の補正ラベル */
const MOD_LABELS = {
  org: '組織力',
  soft: '対人攻撃',
  hard: '対装甲攻撃',
  defense: '防御',
  speed: '速度',
  armor: '装甲',
  supply: '補給',
  entrench: '塹壕',
  hp_recovery: 'HP回復',
  reliability: '信頼性',
  stability: '安定度',
  suppression: '治安維持',
  air_defense: '対空防御',
};
