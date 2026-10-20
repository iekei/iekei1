/**
 * ui/topbar.js — 最上段ステータスバー ＋ 2段目メインメニューボタン列
 *
 *  ① 最上段: 国旗【Q】/ 政治力 / 安定度 / 戦争協力度 / 徴兵可能人口 / 工場数 / 燃料 / 装備充足率 / 輸送船
 *            （右側）指揮力 / 陸軍XP / 海軍XP / 空軍XP / 核弾頭数 ＋ 日付・速度コントロール
 *  ② 2段目: メニューボタン（指定アイコン画像）＋ ショートカットキー
 *  keydown で対応画面をトグル開閉（Shift+Q, Shift+W, W, R, T, Y, U, I, Shift+E, Q）
 */

import { el, img, fmt, fmtPct } from '../util.js';
import { I18N } from '../i18n.js';

const TOP = 'game/assets/top';
const MENU = 'game/assets/top_menu';

/** メニュー定義（順序厳守） */
export const MENU_ITEMS = [
  { id: 'decisions',    key: 'Q', shift: true,  icon: `${MENU}/Decision_button_transparent.png`,     labelKey: 'menu.decisions' },
  { id: 'intel',        key: 'W', shift: true,  icon: `${MENU}/Intelligence_button_transparent.png`, labelKey: 'menu.intel' },
  { id: 'research',     key: 'W', shift: false, icon: `${MENU}/Research_button_transparent.png`,     labelKey: 'menu.research' },
  { id: null,           key: 'E', shift: false, icon: null,                                          labelKey: 'menu.dummy', dummy: true },
  { id: 'trade',        key: 'R', shift: false, icon: `${MENU}/Trade_button_transparent.png`,        labelKey: 'menu.trade' },
  { id: 'construction', key: 'T', shift: false, icon: `${MENU}/Construction_button_transparent.png`, labelKey: 'menu.construction' },
  { id: 'production',   key: 'Y', shift: false, icon: `${MENU}/Production_button_transparent.png`,   labelKey: 'menu.production' },
  { id: 'deployment',   key: 'U', shift: false, icon: `${MENU}/Deployment_button_transparent.png`,   labelKey: 'menu.deployment' },
  { id: 'logistics',    key: 'I', shift: false, icon: `${MENU}/Logistics_button_transparent.png`,    labelKey: 'menu.logistics' },
  { id: 'doctrine',     key: 'E', shift: true,  icon: `${MENU}/Officer_corps_button.png`,            labelKey: 'menu.doctrine', iconAlt: `${MENU}/Officer_corps_button.png` },
  { id: 'diplomacy',    key: null, shift: false, icon: `${MENU}/Diplomacy_button_transparent.png`,    labelKey: 'menu.diplomacy' },
];

export class TopBar {
  constructor(state, modals, politicsPanel) {
    this.state = state;
    this.modals = modals;
    this.politics = politicsPanel;
    this.root = el('div');
    this._build();
    this._bindKeys();
  }

  mount(parent) { parent.appendChild(this.root); }

  _build() {
    const s = this.state;
    // ---------- Row 1: ステータスバー ----------
    const row1 = el('div', 'tb-row1');

    // 国旗【Q】
    const flagBtn = el('button', 'tb-flag');
    flagBtn.title = I18N.t('topbar.flag_hint');
    this.flagImg = img(s.nation.flag, s.nation.name);
    flagBtn.appendChild(this.flagImg);
    flagBtn.appendChild(el('span', 'kbd', 'Q'));
    flagBtn.addEventListener('click', () => this.politics.toggle());
    row1.appendChild(flagBtn);

    // ステータスチップ群（左側）
    this.statPP   = this._chip(row1, `${TOP}/Political_power.png`, 'PP');
    this.statStab = this._chip(row1, `${TOP}/Stability.png`, '%');
    this.statWS   = this._chip(row1, `${TOP}/War_support.png`, '%');
    this.statMP   = this._chip(row1, `${TOP}/Manpower.png`, '');
    this.statFac  = this._chip(row1, `${TOP}/Industrial_capacity.png`, '');
    this.statFuel = this._chip(row1, `${TOP}/Fuel.png`, '');
    this.fuelBar  = el('div', 'mil-bar mini-bar');
    this.fuelBar.appendChild(el('i'));
    this.statFuel.appendChild(this.fuelBar);
    // 装備充足率（専用アイコンなし: LEDで表示）
    this.statEquip = el('div', 'tb-stat');
    this.statEquip.appendChild(el('span', 'led green', ''));
    this.statEquip.appendChild(el('span', 'dim small', '装備'));
    this.equipVal = el('span', 'v', '--%');
    this.statEquip.appendChild(this.equipVal);
    row1.appendChild(this.statEquip);
    this.statConv = this._chip(row1, `${TOP}/Convoys.png`, '');

    row1.appendChild(el('div', 'tb-spacer'));

    // 右側ステータス群
    this.statCP   = this._chip(row1, `${TOP}/Command_power.png`, '');
    this.statAXP  = this._chip(row1, `${TOP}/Army_experience.png`, '');
    this.statNXP  = this._chip(row1, `${TOP}/Navy_experience.png`, '');
    this.statFXP  = this._chip(row1, `${TOP}/Air_experience.png`, '');
    this.statNuke = this._chip(row1, `${TOP}/Nuclear_bomb_availability.png`, '');

    row1.appendChild(el('div', 'tb-spacer'));

    // 日付 + 速度コントロール
    this.dateEl = el('div', 'tb-date', s.dateLabel);
    row1.appendChild(this.dateEl);
    const speeds = el('div', 'tb-speed');
    const pauseBtn = el('button', '', I18N.t('topbar.speed_pause'));
    pauseBtn.title = I18N.t('topbar.speed_hint');
    pauseBtn.addEventListener('click', () => this._onTogglePause(pauseBtn));
    speeds.appendChild(pauseBtn);
    this.speedBtns = {};
    for (const sp of [1, 2, 3, 4, 5]) {
      const b = el('button', sp === s.speed ? 'active' : '', I18N.t(`topbar.speed_${sp}`));
      b.addEventListener('click', () => this._onSpeed(sp));
      speeds.appendChild(b);
      this.speedBtns[sp] = b;
    }
    this.pauseBtn = pauseBtn;
    row1.appendChild(speeds);

    // ---------- Row 2: メニューボタン列 ----------
    const row2 = el('div', 'tb-row2');
    this.menuButtons = {};
    for (const item of MENU_ITEMS) {
      const btn = el('button', `tb-menu-btn${item.dummy ? ' disabled' : ''}`);
      if (item.icon) btn.appendChild(img(item.icon, '', '', '▣'));
      const label = el('span', '', I18N.t(item.labelKey));
      btn.appendChild(label);
      if (item.key) btn.appendChild(el('span', 'kbd', item.shift ? `Shift+${item.key}` : item.key));
      if (!item.dummy && item.id) {
        btn.addEventListener('click', () => this.toggleScreen(item.id));
        this.menuButtons[item.id] = btn;
      }
      row2.appendChild(btn);
    }

    // 埋め込み時（game/index.html の HOI4 大戦略レイヤー）だけ、
    // カードゲームへ戻るボタンをメニュー末尾に追加する。
    if (document.documentElement.classList.contains('hoi4-embedded')) {
      const back = el('button', 'tb-menu-btn tb-back-to-cards');
      back.type = 'button';
      back.title = '将軍カードゲームに戻る (Esc)';
      back.appendChild(el('span', 'tb-back-arrow', '←'));
      back.appendChild(el('span', '', '将軍カードゲーム'));
      back.addEventListener('click', () => {
        try { window.parent.postMessage({ type: 'hoi4:close' }, '*'); } catch { /* 親なし */ }
      });
      row2.appendChild(back);
    }

    this.root.appendChild(row1);
    this.root.appendChild(row2);
  }

  _chip(row, iconPath, suffix) {
    const chip = el('div', 'tb-stat');
    chip.appendChild(img(iconPath, '', '', '•'));
    const v = el('span', 'v', '0');
    chip.appendChild(v);
    chip._val = v;
    chip._suffix = suffix;
    row.appendChild(chip);
    return chip;
  }

  /* ================= ショートカット ================= */

  _bindKeys() {
    this._keyHandler = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toUpperCase();
      // Q: 政治パネル（Shiftなし）
      if (key === 'Q' && !e.shiftKey) { e.preventDefault(); this.politics.toggle(); return; }
      for (const item of MENU_ITEMS) {
        if (!item.id || !item.key) continue;
        if (key === item.key && e.shiftKey === !!item.shift) {
          e.preventDefault();
          this.toggleScreen(item.id);
          return;
        }
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  toggleScreen(id) {
    const opened = this.modals.toggle(id, {});
    this._syncMenuState();
    return opened;
  }

  _syncMenuState() {
    for (const [id, btn] of Object.entries(this.menuButtons)) {
      btn.classList.toggle('open', this.modals.isOpen(id));
    }
  }

  _onSpeed(sp) {
    this.state.speed = sp;
    this.state.paused = false;
    this._syncSpeedUI();
    this.state.bus.emit('speed-changed', sp);
  }

  _onTogglePause(btn) {
    this.state.paused = !this.state.paused;
    this._syncSpeedUI();
    this.state.bus.emit('pause-changed', this.state.paused);
  }

  _syncSpeedUI() {
    for (const [sp, b] of Object.entries(this.speedBtns)) b.classList.toggle('active', !this.state.paused && this.state.speed === Number(sp));
    this.pauseBtn.classList.toggle('active', this.state.paused);
  }

  onSpeedChanged() { this._syncSpeedUI(); }

  /* ================= 表示更新 ================= */

  update(economy) {
    const s = this.state;
    const set = (chip, val, cls = '') => {
      chip._val.textContent = val;
      chip._val.className = `v ${cls}`;
    };
    set(this.statPP, fmt(s.pp));
    set(this.statStab, `${Math.round(s.stability)}%`, s.stability < 50 ? 'bad' : s.stability < 75 ? 'warn' : 'good');
    set(this.statWS, `${Math.round(s.warSupport)}%`, s.warSupport > 75 ? 'good' : '');
    set(this.statMP, fmt(s.manpower));
    set(this.statFac, `${s.factories.civ + s.factories.mil + s.factories.dock}`);
    const fuelDays = economy && economy._fuelConsumptionPerDay() > 0 ? Math.round(s.fuel.stock / economy._fuelConsumptionPerDay()) : 999;
    set(this.statFuel, I18N.t('topbar.fuel_days', { days: fuelDays }), fuelDays < 15 ? 'bad' : fuelDays < 40 ? 'warn' : '');
    const fill = this.fuelBar.querySelector('i');
    if (fill) fill.style.width = fmtPct(Math.min(1, s.fuel.stock / s.fuel.max));
    this.fuelBar.classList.toggle('bad', fuelDays < 15);
    this.fuelBar.classList.toggle('warn', fuelDays >= 15 && fuelDays < 40);
    const eq = economy ? economy.equipmentFulfillment() : 1;
    this.equipVal.textContent = fmtPct(eq);
    this.equipVal.className = `v ${eq > 0.9 ? 'good' : eq > 0.6 ? 'warn' : 'bad'}`;
    this.statEquip.querySelector('.led').className = `led ${eq > 0.9 ? 'green' : eq > 0.6 ? 'yellow' : 'red'}`;
    set(this.statConv, `${s.convoys.used} / ${s.convoys.total}`);
    set(this.statCP, fmt(Math.round(s.commandPower)));
    set(this.statAXP, fmt(Math.round(s.xp.army)));
    set(this.statNXP, fmt(Math.round(s.xp.navy)));
    set(this.statFXP, fmt(Math.round(s.xp.air)));
    set(this.statNuke, fmt(s.nukes), s.nukes > 0 ? 'warn' : '');
    this.dateEl.textContent = s.dateLabel;
    // 国旗更新（国家変更時）
    if (this.flagImg && this.flagImg.src && !this.flagImg.src.endsWith(s.nation.flag)) {
      this.flagImg.src = s.nation.flag;
    }
  }
}
