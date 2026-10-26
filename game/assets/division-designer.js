/* ==========================================================
 * division-designer.js — DivisionDesigner: HOI4風 師団編成・編集画面
 * ----------------------------------------------------------
 * 画面構成 (ウィンドウ "division" / 上部ナビ・軍集団パネルの「師団編成」から開く)
 *   左  : 師団テンプレート一覧 (選択 / 新規 / 複製 / 削除 / 名前変更)
 *   中央: 大隊マトリクス (5列×5行) + 支援中隊 (5スロット) + 配置パレット
 *   右  : 編成から即時計算される師団ステータス
 *   下  : 徴兵 (訓練地点・配備先軍集団) と訓練キュー
 *
 * データ:
 *   CoreEngine.gameState.divisionTemplates        = [{ id, name, grid[5][5] (大隊ID|null), support[5] (支援中隊ID|null) }]
 *   CoreEngine.gameState.activeDivisionTemplateId = 徴兵で使用するテンプレートID
 *   DivisionDesigner.grid                         = 旧API互換 (保存済みアクティブテンプレートの大隊定義 5×5)
 * ========================================================== */
'use strict';

class DivisionDesigner {
  // ---------- 旧API互換フィールド ----------
  static grid = Array(5).fill(null).map(() => Array(5).fill(null));
  static selectedBattalion = null;
  static specialBattalions = [];
  static presets = [];

  // ---------- 定数 ----------
  static COLS = 5;
  static ROWS = 5;
  static SUPPORT_SLOTS = 5;
  static CATEGORY_LABEL = { infantry: '歩兵', mobile: '機動', armor: '機甲', artillery: '砲兵', special: '特別', support: '支援' };

  // 戦列大隊 (category: 同じ列に混在できるのは同カテゴリのみ — HOI4準拠)
  // 値はHOI4 1936年基準の概算: sa=対人攻撃 ha=対戦車攻撃 def=防御 brk=突破 org=組織率 hp=耐久 spd=速度(km/h)
  // hard=装甲化率 arm=装甲 pierce=貫通 aa=対空 width=戦闘幅 mp=人的資源 sup=補給消費 ic=生産コスト
  static availableBattalions = [
    { id: 'infantry',    name: '歩兵',         icon: '🪖', category: 'infantry',  sa: 6,  ha: 1,  def: 22, brk: 3,  org: 60, hp: 25, spd: 4,   hard: 0,   arm: 0,  pierce: 1,  aa: 0,  width: 2, mp: 1000, sup: 0.06, ic: 50,  attack: 10, defense: 20 },
    { id: 'cavalry',     name: '騎兵',         icon: '🐎', category: 'infantry',  sa: 6,  ha: 1,  def: 20, brk: 4,  org: 70, hp: 25, spd: 6.4, hard: 0,   arm: 0,  pierce: 1,  aa: 0,  width: 2, mp: 1200, sup: 0.07, ic: 60,  attack: 10, defense: 18 },
    { id: 'marine',      name: '海兵隊',       icon: '⚓', category: 'infantry',  sa: 7,  ha: 1,  def: 24, brk: 4,  org: 60, hp: 25, spd: 4,   hard: 0,   arm: 0,  pierce: 1,  aa: 0,  width: 2, mp: 1000, sup: 0.07, ic: 60,  attack: 15, defense: 20, special: true },
    { id: 'mountaineer', name: '山岳兵',       icon: '⛰️', category: 'infantry',  sa: 6,  ha: 1,  def: 24, brk: 5,  org: 60, hp: 25, spd: 4,   hard: 0,   arm: 0,  pierce: 1,  aa: 0,  width: 2, mp: 1000, sup: 0.07, ic: 60,  attack: 14, defense: 24, special: true },
    { id: 'paratrooper', name: '空挺兵',       icon: '🪂', category: 'infantry',  sa: 6,  ha: 1,  def: 24, brk: 3,  org: 60, hp: 25, spd: 4,   hard: 0,   arm: 0,  pierce: 1,  aa: 0,  width: 2, mp: 1000, sup: 0.07, ic: 60,  attack: 12, defense: 18, special: true },
    { id: 'ranger',      name: 'レンジャー',   icon: '🌲', category: 'infantry',  sa: 7,  ha: 1,  def: 23, brk: 4,  org: 65, hp: 25, spd: 4,   hard: 0,   arm: 0,  pierce: 1,  aa: 0,  width: 2, mp: 1000, sup: 0.07, ic: 60,  attack: 14, defense: 22, special: true },
    { id: 'motorized',   name: '自動車化歩兵', icon: '🚚', category: 'mobile',    sa: 6,  ha: 1,  def: 22, brk: 4,  org: 60, hp: 25, spd: 12,  hard: 0.1, arm: 0,  pierce: 1,  aa: 0,  width: 2, mp: 1200, sup: 0.12, ic: 120, attack: 10, defense: 20 },
    { id: 'mechanized',  name: '機械化歩兵',   icon: '🛻', category: 'mobile',    sa: 7,  ha: 5,  def: 30, brk: 5,  org: 60, hp: 30, spd: 8,   hard: 0.5, arm: 15, pierce: 20, aa: 0,  width: 2, mp: 1200, sup: 0.17, ic: 250, attack: 14, defense: 26 },
    { id: 'light_armor', name: '軽戦車',       icon: '🛞', category: 'armor',     sa: 14, ha: 4,  def: 4,  brk: 30, org: 10, hp: 2,  spd: 10,  hard: 0.8, arm: 10, pierce: 15, aa: 0,  width: 2, mp: 500,  sup: 0.20, ic: 300, attack: 20, defense: 8 },
    { id: 'armor',       name: '中戦車',       icon: '🚜', category: 'armor',     sa: 16, ha: 12, def: 6,  brk: 36, org: 10, hp: 2,  spd: 8,   hard: 0.9, arm: 60, pierce: 65, aa: 0,  width: 2, mp: 500,  sup: 0.25, ic: 420, attack: 30, defense: 15 },
    { id: 'heavy_armor', name: '重戦車',       icon: '🏗️', category: 'armor',     sa: 16, ha: 15, def: 8,  brk: 30, org: 10, hp: 2,  spd: 5,   hard: 0.95,arm: 90, pierce: 85, aa: 0,  width: 2, mp: 500,  sup: 0.30, ic: 560, attack: 34, defense: 18 },
    { id: 'artillery',   name: '砲兵',         icon: '💥', category: 'artillery', sa: 25, ha: 2,  def: 10, brk: 6,  org: 0,  hp: 0.6,spd: 4,   hard: 0,   arm: 0,  pierce: 5,  aa: 0,  width: 3, mp: 500,  sup: 0.22, ic: 130, attack: 25, defense: 5 },
    { id: 'rocket_artillery', name: 'ロケット砲', icon: '🎆', category: 'artillery', sa: 30, ha: 1, def: 8, brk: 5, org: 0, hp: 0.6,spd: 4,   hard: 0,   arm: 0,  pierce: 4,  aa: 0,  width: 3, mp: 500,  sup: 0.24, ic: 140, attack: 28, defense: 4 },
    { id: 'anti_tank',   name: '対戦車砲',     icon: '🎯', category: 'artillery', sa: 4,  ha: 20, def: 4,  brk: 2,  org: 0,  hp: 0.6,spd: 4,   hard: 0,   arm: 0,  pierce: 75, aa: 0,  width: 1, mp: 500,  sup: 0.10, ic: 130, attack: 15, defense: 8 },
    { id: 'anti_air',    name: '対空砲',       icon: '🛡️', category: 'artillery', sa: 3,  ha: 7,  def: 4,  brk: 2,  org: 0,  hp: 0.6,spd: 4,   hard: 0,   arm: 0,  pierce: 35, aa: 19, width: 1, mp: 500,  sup: 0.10, ic: 110, attack: 8,  defense: 10 }
  ];

  // 支援中隊 (支援スロット専用)
  static availableSupport = [
    { id: 'engineer',          name: '工兵中隊',       icon: '🔧', category: 'support', sa: 2,   ha: 0.2, def: 6, brk: 0.4, org: 0, hp: 2,   spd: 0, hard: 0, arm: 0, pierce: 1,  aa: 0,  width: 0, mp: 300, sup: 0.02, ic: 40,  bonus: '塹壕 +2 / 河川・要塞攻撃ペナルティ軽減', entrench: 2 },
    { id: 'recon',             name: '偵察中隊',       icon: '🔭', category: 'support', sa: 1.5, ha: 0.2, def: 1, brk: 0.5, org: 0, hp: 2,   spd: 0, hard: 0, arm: 0, pierce: 1,  aa: 0,  width: 0, mp: 300, sup: 0.02, ic: 40,  bonus: '偵察 +1 / 地形速度ペナルティ軽減', recon: 1 },
    { id: 'support_artillery', name: '支援砲兵',       icon: '💥', category: 'support', sa: 12.5,ha: 1,   def: 5, brk: 3,   org: 0, hp: 0.6, spd: 0, hard: 0, arm: 0, pierce: 5,  aa: 0,  width: 0, mp: 300, sup: 0.11, ic: 80,  bonus: '対人攻撃を強化 (戦闘幅を消費しない)' },
    { id: 'support_anti_tank', name: '支援対戦車',     icon: '🎯', category: 'support', sa: 2,   ha: 10,  def: 2, brk: 1,   org: 0, hp: 0.6, spd: 0, hard: 0, arm: 0, pierce: 37, aa: 0,  width: 0, mp: 300, sup: 0.05, ic: 80,  bonus: '貫通を強化' },
    { id: 'support_anti_air',  name: '支援対空',       icon: '🛡️', category: 'support', sa: 1.5, ha: 3.5, def: 2, brk: 1,   org: 0, hp: 0.6, spd: 0, hard: 0, arm: 0, pierce: 17, aa: 10, width: 0, mp: 300, sup: 0.05, ic: 70,  bonus: '敵航空優勢ペナルティ軽減' },
    { id: 'field_hospital',    name: '野戦病院',       icon: '🏥', category: 'support', sa: 0,   ha: 0,   def: 0, brk: 0,   org: 0, hp: 0,   spd: 0, hard: 0, arm: 0, pierce: 0,  aa: 0,  width: 0, mp: 300, sup: 0.03, ic: 60,  bonus: '経験値損失 -10% / 人的資源損失 -10%' },
    { id: 'logistics',         name: '兵站中隊',       icon: '📦', category: 'support', sa: 0,   ha: 0,   def: 0, brk: 0,   org: 0, hp: 0,   spd: 0, hard: 0, arm: 0, pierce: 0,  aa: 0,  width: 0, mp: 300, sup: -0.10,ic: 60, bonus: '補給消費 -10%' },
    { id: 'signal',            name: '通信中隊',       icon: '📡', category: 'support', sa: 0,   ha: 0,   def: 0, brk: 0,   org: 0, hp: 0,   spd: 0, hard: 0, arm: 0, pierce: 0,  aa: 0,  width: 0, mp: 300, sup: 0.02, ic: 60,  bonus: '主導権 +12% / 計画速度 +10%' },
    { id: 'maintenance',       name: '整備中隊',       icon: '🔩', category: 'support', sa: 0,   ha: 0,   def: 0, brk: 0,   org: 0, hp: 0,   spd: 0, hard: 0, arm: 0, pierce: 0,  aa: 0,  width: 0, mp: 300, sup: 0.02, ic: 60,  bonus: '信頼性 +5% / 装備鹵獲 +10%' },
    { id: 'military_police',   name: '憲兵中隊',       icon: '👮', category: 'support', sa: 0,   ha: 0,   def: 0, brk: 0,   org: 0, hp: 2,   spd: 0, hard: 0, arm: 0, pierce: 0,  aa: 0,  width: 0, mp: 300, sup: 0.02, ic: 40,  bonus: '鎮圧 +50%' }
  ];

  // 特別研究で解除される大隊 (旧APIと同じID)
  static SPECIAL_UNLOCKS = {
    boris_stechkin:      { id: 'jet_fighter',     name: 'ジェット戦闘機', icon: '✈️', category: 'special', sa: 30, ha: 18, def: 20, brk: 30, org: 30, hp: 10, spd: 12, hard: 0.6, arm: 20, pierce: 40, aa: 40, width: 2, mp: 400, sup: 0.30, ic: 600, attack: 40, defense: 20 },
    sergey_korolyov:     { id: 'v2_rocket',       name: 'V2ロケット',     icon: '🚀', category: 'special', sa: 60, ha: 10, def: 2,  brk: 10, org: 5,  hp: 1,  spd: 4,  hard: 0,   arm: 0,  pierce: 10, aa: 0,  width: 3, mp: 400, sup: 0.30, ic: 700, attack: 50, defense: 0 },
    igor_kurchatov:      { id: 'nuke_battalion',  name: '核部隊',         icon: '☢️', category: 'special', sa: 120,ha: 60, def: 10, brk: 40, org: 10, hp: 5,  spd: 4,  hard: 0,   arm: 0,  pierce: 50, aa: 0,  width: 4, mp: 800, sup: 0.40, ic: 1200, attack: 99, defense: 10 },
    vladimir_kotelnikov: { id: 'land_battleship', name: '陸上戦艦',       icon: '🛳️', category: 'special', sa: 40, ha: 35, def: 40, brk: 60, org: 50, hp: 60, spd: 4,  hard: 1,   arm: 150,pierce: 120,aa: 15, width: 4, mp: 900, sup: 0.50, ic: 1500, attack: 45, defense: 40 }
  };

  // 初期テンプレート (新規ゲーム)
  static DEFAULT_TEMPLATES = [
    { name: '歩兵師団',   cols: [['infantry','infantry','infantry','infantry','infantry'], ['infantry','infantry'], ['artillery','artillery']], support: ['engineer', 'recon', 'support_artillery'] },
    { name: '守備師団',   cols: [['infantry','infantry','infantry','infantry','infantry'], ['infantry','infantry','infantry','infantry','infantry']], support: ['engineer'] },
    { name: '装甲師団',   cols: [['armor','armor','armor','armor','armor'], ['armor', 'light_armor'], ['motorized','motorized','motorized'], ['motorized']], support: ['engineer', 'recon', 'maintenance', 'signal'] },
    { name: '山岳師団',   cols: [['mountaineer','mountaineer','mountaineer','mountaineer','mountaineer'], ['mountaineer','mountaineer'], ['artillery']], support: ['engineer', 'recon'] },
    { name: '海兵師団',   cols: [['marine','marine','marine','marine','marine'], ['marine','marine'], ['artillery']], support: ['engineer', 'support_artillery'] }
  ];

  // ---------- 編集状態 ----------
  static templates = [];
  static activeId = null;      // 徴兵に使う保存済みテンプレート
  static editingId = null;     // デザイナーで開いているテンプレート
  static draft = null;         // 編集中コピー
  static dirty = false;
  static selected = null;      // パレットで選択中の大隊/支援中隊 ID
  static paletteTab = 'battalion';
  static nextTemplateId = 1;

  // ==========================================================
  // 初期化 / 永続化
  // ==========================================================
  static init() {
    DivisionDesigner.registerIcons();
    DivisionDesigner.load();
  }

  static registerIcons() {
    if (typeof GameVisuals === 'undefined' || !GameVisuals.unitFiles) return;
    Object.assign(GameVisuals.unitFiles, {
      cavalry: 'unit_cavalry_icon.png', motorized: 'unit_motorized_icon.png', mechanized: 'unit_mechanized_icon.png',
      light_armor: 'unit_light_tank_icon.png', armor: 'unit_medium_tank_icon.png', heavy_armor: 'unit_heavy_armor_icon.png',
      artillery: 'unit_art_icon.png', rocket_artillery: 'unit_rocket_art_icon.png', anti_tank: 'unit_at_icon.png',
      marine: 'unit_marine_icon.png', paratrooper: 'unit_paratroop_icon.png',
      engineer: 'unit_engineer_icon.png', recon: 'unit_recon_icon.png', support_artillery: 'support_unit_art_icon.png',
      support_anti_tank: 'support_unit_at_icon.png', support_anti_air: 'support_unit_anti_air_icon.png',
      field_hospital: 'support_unit_field_hospital_icon.png', logistics: 'support_unit_logistics_company_icon.png',
      signal: 'support_unit_signal_company_icon.png', maintenance: 'support_unit_maintenance_company_icon.png',
      military_police: 'support_unit_military_police_icon.png', jet_fighter: 'unit_guided_missile_icon.png',
      v2_rocket: 'unit_guided_missile_icon.png', land_battleship: 'unit_land_cruiser_icon.png'
    });
  }

  // gameState からテンプレートを復元 (旧 divisionPresets も移行)
  static load() {
    const gs = CoreEngine.gameState;
    let list = Array.isArray(gs.divisionTemplates) ? gs.divisionTemplates : null;
    if (!list || !list.length) {
      list = DivisionDesigner.DEFAULT_TEMPLATES.map(t => DivisionDesigner.fromColumns(t.name, t.cols, t.support));
      (gs.divisionPresets || []).forEach(p => {
        if (!p || !Array.isArray(p.grid)) return;
        list.push({ id: 0, name: p.name || '旧プリセット', grid: p.grid.map(r => r.map(c => c ? c.id : null)), support: Array(5).fill(null) });
      });
    }
    DivisionDesigner.templates = list.map(t => DivisionDesigner.normalizeTemplate(t));
    DivisionDesigner.nextTemplateId = DivisionDesigner.templates.reduce((m, t) => Math.max(m, t.id), 0) + 1;
    DivisionDesigner.templates.forEach(t => { if (!t.id) t.id = DivisionDesigner.nextTemplateId++; });
    gs.divisionTemplates = DivisionDesigner.templates;
    DivisionDesigner.presets = DivisionDesigner.templates;   // 旧API互換
    const active = DivisionDesigner.templates.find(t => t.id === gs.activeDivisionTemplateId) || DivisionDesigner.templates[0];
    DivisionDesigner.activeId = active ? active.id : null;
    gs.activeDivisionTemplateId = DivisionDesigner.activeId;
    DivisionDesigner.openTemplate(DivisionDesigner.activeId, true);
    DivisionDesigner.syncLegacyGrid();
    if (document.getElementById('division-content')) DivisionDesigner.render();
  }

  static persist() {
    const gs = CoreEngine.gameState;
    gs.divisionTemplates = DivisionDesigner.templates;
    gs.activeDivisionTemplateId = DivisionDesigner.activeId;
    DivisionDesigner.presets = DivisionDesigner.templates;
    DivisionDesigner.syncLegacyGrid();
  }

  // training.js など旧APIが参照する 5×5 定義グリッドを保存済みアクティブテンプレートから再構築
  static syncLegacyGrid() {
    const t = DivisionDesigner.activeTemplate();
    DivisionDesigner.grid = Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => {
      const id = t?.grid?.[y]?.[x];
      const def = id && DivisionDesigner.def(id);
      return def ? { ...def } : null;
    }));
  }

  static normalizeTemplate(t) {
    const grid = Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => {
      const v = t.grid?.[y]?.[x];
      const id = v && typeof v === 'object' ? v.id : v;
      return id && DivisionDesigner.def(id) && DivisionDesigner.def(id).category !== 'support' ? id : null;
    }));
    const support = Array(5).fill(null).map((_, i) => {
      const id = t.support?.[i];
      return id && DivisionDesigner.def(id)?.category === 'support' ? id : null;
    });
    return { id: Number(t.id) || 0, name: String(t.name || '無名師団'), grid, support };
  }

  static fromColumns(name, cols, support) {
    const grid = Array(5).fill(null).map(() => Array(5).fill(null));
    cols.forEach((col, x) => col.forEach((id, y) => { if (x < 5 && y < 5) grid[y][x] = id; }));
    const sup = Array(5).fill(null).map((_, i) => support?.[i] || null);
    return { id: 0, name, grid, support: sup };
  }

  static clone(t) { return JSON.parse(JSON.stringify(t)); }
  static confirm(msg) { return typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(msg) : true; }

  // ==========================================================
  // 定義検索
  // ==========================================================
  static allBattalions() { return [...DivisionDesigner.availableBattalions, ...DivisionDesigner.specialBattalions]; }
  static def(id) {
    return DivisionDesigner.allBattalions().find(b => b.id === id) || DivisionDesigner.availableSupport.find(s => s.id === id) || null;
  }
  static activeTemplate() { return DivisionDesigner.templates.find(t => t.id === DivisionDesigner.activeId) || null; }

  // 保存済みアクティブテンプレートの構成 { id: 個数 } (支援中隊を含む) — 徴兵・補充が使用
  static activeComposition() {
    const t = DivisionDesigner.activeTemplate();
    if (t) return DivisionDesigner.compositionOf(t);
    // テンプレート未初期化時は旧API互換の grid から算出
    const comp = {};
    DivisionDesigner.grid.forEach(row => row.forEach(c => { if (c) comp[c.id] = (comp[c.id] || 0) + 1; }));
    return comp;
  }
  static compositionOf(t) {
    const comp = {};
    if (!t) return comp;
    t.grid.forEach(row => row.forEach(id => { if (id) comp[id] = (comp[id] || 0) + 1; }));
    t.support.forEach(id => { if (id) comp[id] = (comp[id] || 0) + 1; });
    return comp;
  }

  static unlockSpecialBattalion(sciId) {
    const batt = DivisionDesigner.SPECIAL_UNLOCKS[sciId];
    if (batt && !DivisionDesigner.specialBattalions.find(b => b.id === batt.id)) {
      DivisionDesigner.specialBattalions.push({ ...batt });
      GameUI.notify('特別大隊解除: ' + batt.name + '！', 'success');
      if (document.getElementById('dd-root')) DivisionDesigner.render();
    }
  }

  // ==========================================================
  // テンプレート操作 (左ペイン)
  // ==========================================================
  static openTemplate(id, silent) {
    if (!silent && DivisionDesigner.dirty && !DivisionDesigner.confirm('未保存の変更があります。破棄して切り替えますか？')) return;
    const t = DivisionDesigner.templates.find(x => x.id === id) || DivisionDesigner.templates[0];
    DivisionDesigner.editingId = t ? t.id : null;
    DivisionDesigner.draft = t ? DivisionDesigner.clone(t) : null;
    DivisionDesigner.dirty = false;
    if (!silent) DivisionDesigner.render();
  }

  static newTemplate() {
    if (DivisionDesigner.dirty && !DivisionDesigner.confirm('未保存の変更があります。破棄して新規作成しますか？')) return;
    const t = { id: DivisionDesigner.nextTemplateId++, name: '新規師団 ' + DivisionDesigner.templates.length, grid: Array(5).fill(null).map(() => Array(5).fill(null)), support: Array(5).fill(null) };
    DivisionDesigner.templates.push(t);
    DivisionDesigner.persist();
    DivisionDesigner.openTemplate(t.id, true);
    CoreEngine.log('📐 師団テンプレート「' + t.name + '」を作成しました。');
    DivisionDesigner.render();
  }

  static duplicateTemplate(id) {
    const src = DivisionDesigner.templates.find(x => x.id === id);
    if (!src) return;
    const t = DivisionDesigner.clone(src);
    t.id = DivisionDesigner.nextTemplateId++;
    t.name = src.name + ' (複製)';
    DivisionDesigner.templates.splice(DivisionDesigner.templates.indexOf(src) + 1, 0, t);
    DivisionDesigner.persist();
    DivisionDesigner.openTemplate(t.id, true);
    GameUI.notify('📋 「' + src.name + '」を複製しました', 'success');
    DivisionDesigner.render();
  }

  static deleteTemplate(id) {
    const t = DivisionDesigner.templates.find(x => x.id === id);
    if (!t) return;
    if (DivisionDesigner.templates.length <= 1) { GameUI.notify('最後のテンプレートは削除できません。', 'alert'); return; }
    if (!DivisionDesigner.confirm('テンプレート「' + t.name + '」を削除しますか？')) return;
    DivisionDesigner.templates = DivisionDesigner.templates.filter(x => x.id !== id);
    if (DivisionDesigner.activeId === id) DivisionDesigner.activeId = DivisionDesigner.templates[0].id;
    DivisionDesigner.persist();
    if (DivisionDesigner.editingId === id) DivisionDesigner.openTemplate(DivisionDesigner.activeId, true);
    CoreEngine.log('🗑️ 師団テンプレート「' + t.name + '」を削除しました。');
    DivisionDesigner.render();
  }

  static setActive(id) {
    if (!DivisionDesigner.templates.find(x => x.id === id)) return;
    DivisionDesigner.activeId = id;
    DivisionDesigner.persist();
    GameUI.notify('⚔️ 徴兵テンプレート: ' + DivisionDesigner.activeTemplate().name, 'success');
    DivisionDesigner.render();
  }

  static renameDraft(name) {
    if (!DivisionDesigner.draft) return;
    const v = String(name || '').trim().slice(0, 40);
    if (!v || v === DivisionDesigner.draft.name) return;
    DivisionDesigner.draft.name = v;
    DivisionDesigner.dirty = true;
    DivisionDesigner.render();
  }

  // 「変更を保存」: 下書きをテンプレート配列 (JSON) に書き戻し、徴兵用テンプレートに設定
  static saveChanges() {
    const d = DivisionDesigner.draft;
    if (!d) return;
    const idx = DivisionDesigner.templates.findIndex(x => x.id === d.id);
    const saved = DivisionDesigner.clone(d);
    if (idx >= 0) DivisionDesigner.templates[idx] = saved; else DivisionDesigner.templates.push(saved);
    DivisionDesigner.activeId = saved.id;
    DivisionDesigner.dirty = false;
    DivisionDesigner.persist();
    CoreEngine.log('💾 師団テンプレート「' + saved.name + '」を保存しました (大隊' + DivisionDesigner.lineCount(saved) + ' / 支援' + saved.support.filter(Boolean).length + ')。');
    GameUI.notify('💾 「' + saved.name + '」を保存 — 今後の徴兵に反映されます', 'success');
    DivisionDesigner.render();
  }

  static discardChanges() {
    if (!DivisionDesigner.dirty) return;
    DivisionDesigner.openTemplate(DivisionDesigner.editingId, true);
    DivisionDesigner.render();
  }

  static exportJSON() {
    const json = JSON.stringify(DivisionDesigner.templates, null, 2);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(json).then(() => GameUI.notify('📤 テンプレートJSONをクリップボードにコピーしました', 'success')).catch(() => prompt('テンプレートJSON:', json));
    else prompt('テンプレートJSON:', json);
  }

  static lineCount(t) { return t.grid.reduce((n, r) => n + r.filter(Boolean).length, 0); }

  // ==========================================================
  // グリッド操作 (中央ペイン)
  // ==========================================================
  static select(id) {
    DivisionDesigner.selected = DivisionDesigner.selected === id ? null : id;
    DivisionDesigner.selectedBattalion = DivisionDesigner.selected ? DivisionDesigner.def(DivisionDesigner.selected) : null;
    DivisionDesigner.render();
  }

  static setPaletteTab(tab) { DivisionDesigner.paletteTab = tab; DivisionDesigner.render(); }

  static columnCategory(x, ignoreY = -1) {
    for (let y = 0; y < 5; y++) {
      if (y === ignoreY) continue;
      const id = DivisionDesigner.draft.grid[y][x];
      if (id) return DivisionDesigner.def(id)?.category || null;
    }
    return null;
  }

  // 配置可否チェック (HOI4: 1列(連隊)は同一カテゴリのみ)
  static canPlace(id, x, y) {
    const def = DivisionDesigner.def(id);
    if (!def) return { ok: false, reason: '不明な大隊です' };
    if (def.category === 'support') return { ok: false, reason: '支援中隊は支援スロットにのみ配置できます' };
    const cat = DivisionDesigner.columnCategory(x, y);
    if (cat && cat !== def.category) return { ok: false, reason: '第' + (x + 1) + '連隊は' + DivisionDesigner.CATEGORY_LABEL[cat] + '専用です (' + def.name + 'は' + DivisionDesigner.CATEGORY_LABEL[def.category] + ')' };
    if (def.special && DivisionDesigner.specialLimitExceeded(id, x, y)) return { ok: false, reason: '特殊部隊 (海兵・山岳・空挺・レンジャー) は師団内で1種類のみ混在できます' };
    return { ok: true };
  }

  static specialLimitExceeded(id, x, y) {
    const kinds = new Set();
    DivisionDesigner.draft.grid.forEach((row, yy) => row.forEach((c, xx) => {
      if (xx === x && yy === y) return;
      const d = c && DivisionDesigner.def(c);
      if (d?.special) kinds.add(d.id);
    }));
    kinds.add(id);
    return kinds.size > 1;
  }

  static clickCell(x, y) {
    const d = DivisionDesigner.draft; if (!d) return;
    const cur = d.grid[y][x];
    const sel = DivisionDesigner.selected && DivisionDesigner.def(DivisionDesigner.selected);
    if (sel && sel.category !== 'support') {
      if (cur === sel.id) { d.grid[y][x] = null; }
      else {
        const r = DivisionDesigner.canPlace(sel.id, x, y);
        if (!r.ok) { GameUI.notify('⚠️ ' + r.reason, 'alert'); return; }
        d.grid[y][x] = sel.id;
      }
    } else if (cur) {
      d.grid[y][x] = null;
    } else {
      GameUI.notify('左のパレットから大隊を選択するか、ドラッグして配置してください。');
      return;
    }
    DivisionDesigner.markDirty();
  }

  static removeCell(x, y) {
    if (!DivisionDesigner.draft?.grid[y][x]) return;
    DivisionDesigner.draft.grid[y][x] = null;
    DivisionDesigner.markDirty();
  }

  static clickSupport(i) {
    const d = DivisionDesigner.draft; if (!d) return;
    const cur = d.support[i];
    const sel = DivisionDesigner.selected && DivisionDesigner.def(DivisionDesigner.selected);
    if (sel && sel.category === 'support') {
      if (cur === sel.id) d.support[i] = null;
      else {
        if (d.support.some((s, j) => j !== i && s === sel.id)) { GameUI.notify('⚠️ 同じ支援中隊は1つまでです', 'alert'); return; }
        d.support[i] = sel.id;
      }
    } else if (sel) {
      GameUI.notify('⚠️ 戦列大隊は支援スロットに配置できません', 'alert'); return;
    } else if (cur) {
      d.support[i] = null;
    } else {
      GameUI.notify('「支援中隊」タブから中隊を選択して配置してください。');
      return;
    }
    DivisionDesigner.markDirty();
  }

  static removeSupport(i) {
    if (!DivisionDesigner.draft?.support[i]) return;
    DivisionDesigner.draft.support[i] = null;
    DivisionDesigner.markDirty();
  }

  static clearDraft() {
    if (!DivisionDesigner.draft) return;
    DivisionDesigner.draft.grid = Array(5).fill(null).map(() => Array(5).fill(null));
    DivisionDesigner.draft.support = Array(5).fill(null);
    DivisionDesigner.markDirty();
  }

  static markDirty() {
    DivisionDesigner.dirty = true;
    DivisionDesigner.render();
  }

  // 旧API互換
  static selectBattalion(id) { DivisionDesigner.select(id); }
  static toggleCell(x, y) { DivisionDesigner.clickCell(x, y); }
  static clearGrid() { DivisionDesigner.clearDraft(); }
  static savePreset() { DivisionDesigner.saveChanges(); }
  static loadPreset(i) { const t = DivisionDesigner.templates[i]; if (t) DivisionDesigner.openTemplate(t.id); }
  static deletePreset(i) { const t = DivisionDesigner.templates[i]; if (t) DivisionDesigner.deleteTemplate(t.id); }

  // ---------- ドラッグ&ドロップ ----------
  static dragData = null;
  static onDragStart(ev, src) {
    DivisionDesigner.dragData = src;   // {kind:'palette'|'cell'|'support', id, x, y, i}
    try { ev.dataTransfer.setData('text/plain', src.id); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { /* ignore */ }
    ev.currentTarget.classList.add('dd-dragging');
  }
  static onDragEnd(ev) { ev.currentTarget.classList.remove('dd-dragging'); document.querySelectorAll('.dd-dragover').forEach(el => el.classList.remove('dd-dragover')); }
  static onDragOver(ev) { ev.preventDefault(); ev.currentTarget.classList.add('dd-dragover'); }
  static onDragLeave(ev) { ev.currentTarget.classList.remove('dd-dragover'); }

  static dropOnCell(ev, x, y) {
    ev.preventDefault();
    const src = DivisionDesigner.dragData; DivisionDesigner.dragData = null;
    const d = DivisionDesigner.draft; if (!src || !d) return;
    const def = DivisionDesigner.def(src.id);
    if (!def || def.category === 'support') { GameUI.notify('⚠️ 支援中隊は支援スロットへ配置してください', 'alert'); return; }
    if (src.kind === 'cell') {
      if (src.x === x && src.y === y) return;
      const target = d.grid[y][x];
      // 入れ替え: 双方の列カテゴリを検証
      const a = DivisionDesigner.canPlaceSwap(src.id, x, y, src.x, src.y, target);
      if (!a.ok) { GameUI.notify('⚠️ ' + a.reason, 'alert'); return; }
      d.grid[src.y][src.x] = target || null;
      d.grid[y][x] = src.id;
    } else {
      const r = DivisionDesigner.canPlace(src.id, x, y);
      if (!r.ok) { GameUI.notify('⚠️ ' + r.reason, 'alert'); return; }
      d.grid[y][x] = src.id;
    }
    DivisionDesigner.markDirty();
  }

  static canPlaceSwap(id, x, y, sx, sy, targetId) {
    const d = DivisionDesigner.draft;
    const backup = d.grid.map(r => r.slice());
    d.grid[sy][sx] = null; d.grid[y][x] = null;
    let r = DivisionDesigner.canPlace(id, x, y);
    if (r.ok) { d.grid[y][x] = id; if (targetId) r = DivisionDesigner.canPlace(targetId, sx, sy); }
    d.grid = backup;
    return r;
  }

  static dropOnSupport(ev, i) {
    ev.preventDefault();
    const src = DivisionDesigner.dragData; DivisionDesigner.dragData = null;
    const d = DivisionDesigner.draft; if (!src || !d) return;
    const def = DivisionDesigner.def(src.id);
    if (!def || def.category !== 'support') { GameUI.notify('⚠️ 戦列大隊は支援スロットに配置できません', 'alert'); return; }
    if (src.kind === 'support') {
      const t = d.support[i]; d.support[i] = src.id; d.support[src.i] = t || null;
    } else {
      if (d.support.some((s, j) => j !== i && s === src.id)) { GameUI.notify('⚠️ 同じ支援中隊は1つまでです', 'alert'); return; }
      d.support[i] = src.id;
    }
    DivisionDesigner.markDirty();
  }

  static dropOnTrash(ev) {
    ev.preventDefault();
    const src = DivisionDesigner.dragData; DivisionDesigner.dragData = null;
    const d = DivisionDesigner.draft; if (!src || !d) return;
    if (src.kind === 'cell') d.grid[src.y][src.x] = null;
    else if (src.kind === 'support') d.support[src.i] = null;
    else return;
    DivisionDesigner.markDirty();
  }

  // ==========================================================
  // ステータス計算 (HOI4準拠の集計ルール)
  // ==========================================================
  static calculateStats(template) {
    const t = template || DivisionDesigner.draft || DivisionDesigner.activeTemplate();
    const mods = CoreEngine.gameState.cardModifiers || {};
    const line = [], support = [];
    if (t) {
      t.grid.forEach(row => row.forEach(id => { const d = id && DivisionDesigner.def(id); if (d) line.push(d); }));
      t.support.forEach(id => { const d = id && DivisionDesigner.def(id); if (d) support.push(d); });
    }
    const all = [...line, ...support];
    const s = { count: line.length, supportCount: support.length, sa: 0, ha: 0, def: 0, brk: 0, hp: 0, aa: 0, width: 0, mp: 0, sup: 0, ic: 0,
      org: 0, spd: 0, hard: 0, arm: 0, pierce: 0, entrench: 0, recon: 0, categories: {}, comp: {} };
    let orgSum = 0, hardSum = 0, armSum = 0, pierceSum = 0, armMax = 0, pierceMax = 0, spdMin = Infinity;
    all.forEach(d => {
      let def = d.def, brk = d.brk, spd = d.spd;
      if (d.category === 'infantry') def *= 1 + (mods.infantryDefense || 0);
      if (d.category === 'armor') { brk *= 1 + (mods.armorBreakthrough || 0); spd *= 1 + (mods.armorSpeed || 0); }
      s.sa += d.sa; s.ha += d.ha; s.def += def; s.brk += brk; s.hp += d.hp; s.aa += d.aa;
      s.width += d.width; s.mp += d.mp; s.sup += d.sup; s.ic += d.ic;
      orgSum += d.org; armSum += d.arm; pierceSum += d.pierce;
      armMax = Math.max(armMax, d.arm); pierceMax = Math.max(pierceMax, d.pierce);
      s.entrench += d.entrench || 0; s.recon += d.recon || 0;
      s.comp[d.id] = (s.comp[d.id] || 0) + 1;
      if (d.category !== 'support') {
        hardSum += d.hard; spdMin = Math.min(spdMin, spd);
        s.categories[d.category] = (s.categories[d.category] || 0) + 1;
      }
    });
    const n = all.length;
    s.org = n ? orgSum / n : 0;                                   // 組織率 = 全部隊 (支援含む) の平均
    s.spd = line.length ? spdMin : 0;                             // 速度 = 最も遅い戦列大隊
    s.hard = line.length ? hardSum / line.length : 0;             // 装甲化率 = 戦列大隊の平均
    s.arm = n ? 0.3 * armMax + 0.7 * (armSum / n) : 0;            // 装甲 = 最大×0.3 + 平均×0.7
    s.pierce = n ? 0.4 * pierceMax + 0.6 * (pierceSum / n) : 0;   // 貫通 = 最大×0.4 + 平均×0.6
    if (support.some(d => d.id === 'logistics')) s.sup *= 0.9;
    s.sup = Math.max(0, s.sup);
    s.trainDays = DivisionDesigner.trainDaysFor(s.comp, line.length);
    s.equipment = typeof TrainingManager !== 'undefined' && TrainingManager.equipmentNeedsFor ? TrainingManager.equipmentNeedsFor(s.comp) : {};
    s.manpowerNeed = line.length * 10000;                          // training.js と同じ徴兵人員
    // 旧API互換 (攻撃/防御の簡易値)
    s.attack = Math.round(s.sa + s.ha); s.defense = Math.round(s.def);
    s.valid = DivisionDesigner.validate(t, s);
    return s;
  }

  static trainDaysFor(comp, count) {
    if (!count) return 0;
    return Math.min(150, Math.round(60 +
      ((comp.armor || 0) + (comp.heavy_armor || 0)) * 9 + (comp.light_armor || 0) * 6 + (comp.mechanized || 0) * 5 +
      ((comp.artillery || 0) + (comp.rocket_artillery || 0)) * 5 +
      (comp.jet_fighter || 0) * 7 + (comp.v2_rocket || 0) * 7 + (comp.nuke_battalion || 0) * 10 + (comp.land_battleship || 0) * 8));
  }

  static validate(t, s) {
    const issues = [];
    if (!t) return { ok: false, issues: ['テンプレートがありません'] };
    if (!s.count) issues.push('戦列大隊が1つもありません');
    if (s.width > 50) issues.push('戦闘幅が50を超えています (前線で超過ペナルティ)');
    const specialKinds = Object.keys(s.comp).filter(id => DivisionDesigner.def(id)?.special);
    if (specialKinds.length > 1) issues.push('特殊部隊は1種類のみ混在できます');
    if (s.count && s.org < 20) issues.push('組織率が低すぎます (20未満) — 歩兵/機動大隊を増やしてください');
    return { ok: !issues.length, issues };
  }

  // ==========================================================
  // 描画
  // ==========================================================
  static esc(v) { return typeof GameTools !== 'undefined' ? GameTools.escape(v) : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  static fmt(v, digits = 1) { return Number(v || 0).toLocaleString('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: 0 }); }

  static iconHtml(def) {
    const img = typeof GameVisuals !== 'undefined' && GameVisuals.unit ? GameVisuals.unit(def) : '';
    return '<span class="dd-icon" data-cat="' + def.category + '">' + img + '<span class="dd-emoji">' + def.icon + '</span></span>';
  }

  static tooltip(def) {
    const lines = [def.name + ' [' + DivisionDesigner.CATEGORY_LABEL[def.category] + ']',
      '対人 ' + def.sa + ' / 対戦車 ' + def.ha + ' / 防御 ' + def.def + ' / 突破 ' + def.brk,
      '組織率 ' + def.org + ' / 耐久 ' + def.hp + (def.category !== 'support' ? ' / 速度 ' + def.spd + 'km/h' : ''),
      '装甲 ' + def.arm + ' / 貫通 ' + def.pierce + ' / 装甲化率 ' + Math.round(def.hard * 100) + '%',
      '戦闘幅 ' + def.width + ' / 人的資源 ' + def.mp + ' / 生産コスト ' + def.ic + ' / 補給 ' + def.sup];
    if (def.bonus) lines.push('効果: ' + def.bonus);
    return lines.join('\n');
  }

  static render() {
    const container = document.getElementById('division-content');
    if (!container) return;
    if (!DivisionDesigner.templates.length) DivisionDesigner.load();
    if (!DivisionDesigner.draft) DivisionDesigner.openTemplate(DivisionDesigner.activeId, true);
    const d = DivisionDesigner.draft;
    const stats = DivisionDesigner.calculateStats(d);

    container.innerHTML =
      '<div class="dd-root" id="dd-root">' +
        DivisionDesigner.renderHeader(d, stats) +
        '<div class="dd-body">' +
          DivisionDesigner.renderTemplateList() +
          DivisionDesigner.renderCenter(d) +
          DivisionDesigner.renderStats(stats) +
        '</div>' +
        DivisionDesigner.renderFooter(stats) +
        '<div id="training-queue" class="dd-queue"></div>' +
      '</div>';
    if (typeof TrainingManager !== 'undefined' && TrainingManager.renderQueue) TrainingManager.renderQueue();
  }

  static renderHeader(d, stats) {
    const isActive = d && d.id === DivisionDesigner.activeId;
    return '<div class="dd-header">' +
      '<div class="dd-title"><span class="dd-title-mark">✚</span><div><h3>師団編成 <small>DIVISION DESIGNER</small></h3>' +
      '<p>大隊を5連隊×5大隊のマトリクスに配置し、支援中隊を最大5つ追加します。保存するとテンプレートが徴兵に反映されます。</p></div></div>' +
      '<div class="dd-name">' +
        '<label>テンプレート名</label>' +
        '<input id="dd-name-input" type="text" maxlength="40" value="' + DivisionDesigner.esc(d?.name || '') + '" onchange="DivisionDesigner.renameDraft(this.value)" onkeydown="if(event.key===\'Enter\'){this.blur();}">' +
        (DivisionDesigner.dirty ? '<span class="dd-badge dirty">● 未保存</span>' : (isActive ? '<span class="dd-badge active">★ 徴兵中テンプレート</span>' : '<span class="dd-badge">保存済</span>')) +
      '</div>' +
      '<div class="dd-actions">' +
        '<button class="dd-btn ghost" onclick="DivisionDesigner.clearDraft()" title="編成をすべて空にします">🧹 クリア</button>' +
        '<button class="dd-btn ghost" onclick="DivisionDesigner.discardChanges()"' + (DivisionDesigner.dirty ? '' : ' disabled') + '>↶ 変更を破棄</button>' +
        '<button class="dd-btn primary" onclick="DivisionDesigner.saveChanges()"' + (DivisionDesigner.dirty || !isActive ? '' : ' disabled') + ' title="テンプレートJSONを更新し、徴兵に反映します">💾 変更を保存</button>' +
      '</div>' +
    '</div>';
  }

  static renderTemplateList() {
    let html = '<aside class="dd-templates"><div class="dd-pane-title">師団テンプレート <span>' + DivisionDesigner.templates.length + '</span></div><div class="dd-template-list">';
    DivisionDesigner.templates.forEach(t => {
      const st = DivisionDesigner.calculateStats(t);
      const editing = t.id === DivisionDesigner.editingId;
      const active = t.id === DivisionDesigner.activeId;
      const lead = Object.entries(st.categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'infantry';
      const leadDef = DivisionDesigner.allBattalions().find(b => b.category === lead) || DivisionDesigner.availableBattalions[0];
      html += '<div class="dd-template' + (editing ? ' editing' : '') + (active ? ' active' : '') + '" onclick="DivisionDesigner.openTemplate(' + t.id + ')" title="クリックで編集">' +
        '<div class="dd-template-icon">' + DivisionDesigner.iconHtml(leadDef) + '</div>' +
        '<div class="dd-template-info"><b>' + (active ? '★ ' : '') + DivisionDesigner.esc(t.name) + '</b>' +
        '<small>大隊 ' + st.count + ' / 支援 ' + st.supportCount + ' / 幅 ' + DivisionDesigner.fmt(st.width, 0) + '</small>' +
        '<small>対人 ' + DivisionDesigner.fmt(st.sa, 0) + ' · 防御 ' + DivisionDesigner.fmt(st.def, 0) + ' · 組織 ' + DivisionDesigner.fmt(st.org, 0) + '</small></div>' +
        '<div class="dd-template-tools" onclick="event.stopPropagation()">' +
          '<button title="このテンプレートで徴兵する" onclick="DivisionDesigner.setActive(' + t.id + ')"' + (active ? ' disabled' : '') + '>★</button>' +
          '<button title="複製" onclick="DivisionDesigner.duplicateTemplate(' + t.id + ')">⧉</button>' +
          '<button title="削除" class="danger" onclick="DivisionDesigner.deleteTemplate(' + t.id + ')">✕</button>' +
        '</div></div>';
    });
    html += '</div><div class="dd-template-actions">' +
      '<button class="dd-btn" onclick="DivisionDesigner.newTemplate()">＋ 新規作成</button>' +
      '<button class="dd-btn ghost" onclick="DivisionDesigner.duplicateTemplate(DivisionDesigner.editingId)">⧉ 複製</button>' +
      '<button class="dd-btn ghost" onclick="DivisionDesigner.exportJSON()" title="全テンプレートをJSONで書き出し">{ } JSON</button>' +
    '</div></aside>';
    return html;
  }

  static renderCenter(d) {
    const sel = DivisionDesigner.selected;
    // ---- パレット ----
    const tab = DivisionDesigner.paletteTab;
    const list = tab === 'support' ? DivisionDesigner.availableSupport : DivisionDesigner.allBattalions();
    let palette = '<div class="dd-palette"><div class="dd-tabs">' +
      '<button class="' + (tab === 'battalion' ? 'on' : '') + '" onclick="DivisionDesigner.setPaletteTab(\'battalion\')">大隊</button>' +
      '<button class="' + (tab === 'support' ? 'on' : '') + '" onclick="DivisionDesigner.setPaletteTab(\'support\')">支援中隊</button></div>' +
      '<div class="dd-palette-list">';
    let lastCat = null;
    list.forEach(b => {
      if (tab !== 'support' && b.category !== lastCat) { lastCat = b.category; palette += '<div class="dd-palette-cat" data-cat="' + b.category + '">' + DivisionDesigner.CATEGORY_LABEL[b.category] + '</div>'; }
      const isSpecial = DivisionDesigner.specialBattalions.some(sb => sb.id === b.id);
      palette += '<div class="dd-palette-item' + (sel === b.id ? ' selected' : '') + '" draggable="true" data-cat="' + b.category + '" title="' + DivisionDesigner.esc(DivisionDesigner.tooltip(b)) + '"' +
        ' onclick="DivisionDesigner.select(\'' + b.id + '\')"' +
        ' ondragstart="DivisionDesigner.onDragStart(event,{kind:\'palette\',id:\'' + b.id + '\'})" ondragend="DivisionDesigner.onDragEnd(event)">' +
        DivisionDesigner.iconHtml(b) + '<div class="dd-palette-text"><b>' + DivisionDesigner.esc(b.name) + (isSpecial ? ' <i class="dd-star">★</i>' : '') + '</b>' +
        '<small>' + (b.category === 'support' ? DivisionDesigner.esc(b.bonus || '') : '攻 ' + b.sa + '/' + b.ha + ' 防 ' + b.def + ' 突 ' + b.brk + ' 組 ' + b.org) + '</small></div></div>';
    });
    palette += '</div><div class="dd-trash" ondragover="DivisionDesigner.onDragOver(event)" ondragleave="DivisionDesigner.onDragLeave(event)" ondrop="DivisionDesigner.dropOnTrash(event)">🗑 ここへドラッグで削除<br><small>右クリック / 空選択で左クリックでも削除</small></div></div>';

    // ---- 支援中隊列 ----
    let supportCol = '<div class="dd-support"><div class="dd-col-head">支援中隊</div>';
    for (let i = 0; i < DivisionDesigner.SUPPORT_SLOTS; i++) {
      const id = d?.support[i]; const def = id && DivisionDesigner.def(id);
      supportCol += '<div class="dd-cell support' + (def ? ' filled' : '') + (sel && DivisionDesigner.def(sel)?.category === 'support' && !def ? ' target' : '') + '"' +
        (def ? ' draggable="true" ondragstart="DivisionDesigner.onDragStart(event,{kind:\'support\',id:\'' + id + '\',i:' + i + '})" ondragend="DivisionDesigner.onDragEnd(event)" title="' + DivisionDesigner.esc(DivisionDesigner.tooltip(def)) + '"' : '') +
        ' onclick="DivisionDesigner.clickSupport(' + i + ')" oncontextmenu="event.preventDefault();DivisionDesigner.removeSupport(' + i + ')"' +
        ' ondragover="DivisionDesigner.onDragOver(event)" ondragleave="DivisionDesigner.onDragLeave(event)" ondrop="DivisionDesigner.dropOnSupport(event,' + i + ')">' +
        (def ? DivisionDesigner.iconHtml(def) + '<span class="dd-cell-name">' + DivisionDesigner.esc(def.name) + '</span><button class="dd-cell-x" onclick="event.stopPropagation();DivisionDesigner.removeSupport(' + i + ')">✕</button>' : '<span class="dd-slot-no">S' + (i + 1) + '</span>') +
        '</div>';
    }
    supportCol += '</div>';

    // ---- 大隊グリッド (5列×5行) ----
    let grid = '<div class="dd-grid-wrap"><div class="dd-col-heads">';
    for (let x = 0; x < DivisionDesigner.COLS; x++) {
      const cat = d ? DivisionDesigner.columnCategory(x) : null;
      grid += '<div class="dd-col-head" data-cat="' + (cat || '') + '">第' + (x + 1) + '連隊' + (cat ? '<small>' + DivisionDesigner.CATEGORY_LABEL[cat] + '</small>' : '<small>空</small>') + '</div>';
    }
    grid += '</div><div class="dd-grid">';
    const selDef = sel && DivisionDesigner.def(sel);
    for (let y = 0; y < DivisionDesigner.ROWS; y++) {
      for (let x = 0; x < DivisionDesigner.COLS; x++) {
        const id = d?.grid[y][x]; const def = id && DivisionDesigner.def(id);
        const targetable = selDef && selDef.category !== 'support' && !def && DivisionDesigner.canPlace(selDef.id, x, y).ok;
        grid += '<div class="dd-cell' + (def ? ' filled' : '') + (targetable ? ' target' : '') + '" data-cat="' + (def ? def.category : '') + '"' +
          (def ? ' draggable="true" ondragstart="DivisionDesigner.onDragStart(event,{kind:\'cell\',id:\'' + id + '\',x:' + x + ',y:' + y + '})" ondragend="DivisionDesigner.onDragEnd(event)" title="' + DivisionDesigner.esc(DivisionDesigner.tooltip(def)) + '"' : '') +
          ' onclick="DivisionDesigner.clickCell(' + x + ',' + y + ')" oncontextmenu="event.preventDefault();DivisionDesigner.removeCell(' + x + ',' + y + ')"' +
          ' ondragover="DivisionDesigner.onDragOver(event)" ondragleave="DivisionDesigner.onDragLeave(event)" ondrop="DivisionDesigner.dropOnCell(event,' + x + ',' + y + ')">' +
          (def ? DivisionDesigner.iconHtml(def) + '<span class="dd-cell-name">' + DivisionDesigner.esc(def.name) + '</span><button class="dd-cell-x" onclick="event.stopPropagation();DivisionDesigner.removeCell(' + x + ',' + y + ')">✕</button>' : '<span class="dd-slot-no">' + (y + 1) + '</span>') +
          '</div>';
      }
    }
    grid += '</div><p class="dd-hint">' + (selDef ? '選択中: <b>' + DivisionDesigner.esc(selDef.name) + '</b> — 配置先をクリック (同じ大隊をクリックで解除 / ' + (selDef.category === 'support' ? '支援スロットのみ' : '1連隊は同一カテゴリのみ') + ')' : '大隊を選択またはドラッグしてマトリクスに配置します。各連隊 (列) は同じカテゴリの大隊のみ編成できます。') + '</p></div>';

    return '<main class="dd-center">' + palette + '<div class="dd-matrix">' + supportCol + grid + '</div></main>';
  }

  static renderStats(s) {
    const bar = (v, max, cls) => '<i class="dd-bar"><em class="' + cls + '" style="width:' + Math.max(0, Math.min(100, v / max * 100)) + '%"></em></i>';
    const row = (label, value, opts = {}) => '<div class="dd-stat"><span>' + label + '</span>' + (opts.bar || '') + '<b class="' + (opts.cls || '') + '">' + value + '</b></div>';
    const mods = CoreEngine.gameState.cardModifiers || {};
    const pct = v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
    let html = '<aside class="dd-stats"><div class="dd-pane-title">師団ステータス <span>' + (s.count ? '大隊 ' + s.count + ' / 支援 ' + s.supportCount : '未編成') + '</span></div>' +
      (s.valid.ok ? '<div class="dd-valid ok">✔ 編成は有効です</div>' : '<div class="dd-valid ng">' + s.valid.issues.map(i => '⚠ ' + DivisionDesigner.esc(i)).join('<br>') + '</div>') +
      '<div class="dd-stat-group"><h4>戦闘</h4>' +
      row('対人攻撃 (Soft Attack)', DivisionDesigner.fmt(s.sa), { bar: bar(s.sa, 400, 'red'), cls: 'red' }) +
      row('対戦車攻撃 (Hard Attack)', DivisionDesigner.fmt(s.ha), { bar: bar(s.ha, 150, 'orange'), cls: 'orange' }) +
      row('防御 (Defense)', DivisionDesigner.fmt(s.def), { bar: bar(s.def, 500, 'green'), cls: 'green' }) +
      row('突破 (Breakthrough)', DivisionDesigner.fmt(s.brk), { bar: bar(s.brk, 400, 'gold'), cls: 'gold' }) +
      row('対空攻撃', DivisionDesigner.fmt(s.aa)) +
      '</div><div class="dd-stat-group"><h4>耐久</h4>' +
      row('組織率 (Organization)', DivisionDesigner.fmt(s.org), { bar: bar(s.org, 70, 'blue'), cls: 'blue' }) +
      row('耐久力 (HP)', DivisionDesigner.fmt(s.hp)) +
      row('装甲化率 (Hardness)', Math.round(s.hard * 100) + '%') +
      row('装甲 (Armor)', DivisionDesigner.fmt(s.arm)) +
      row('貫通 (Piercing)', DivisionDesigner.fmt(s.pierce)) +
      (s.entrench ? row('塹壕', '+' + s.entrench) : '') + (s.recon ? row('偵察', '+' + s.recon) : '') +
      '</div><div class="dd-stat-group"><h4>機動・幅</h4>' +
      row('移動速度', DivisionDesigner.fmt(s.spd) + ' km/h', { cls: s.spd >= 8 ? 'green' : '' }) +
      row('戦闘幅 (Combat Width)', DivisionDesigner.fmt(s.width, 0), { bar: bar(s.width, 50, s.width > 50 ? 'red' : 'gold'), cls: s.width > 50 ? 'red' : '' }) +
      row('補給消費', DivisionDesigner.fmt(s.sup, 2)) +
      '</div><div class="dd-stat-group"><h4>コスト</h4>' +
      row('人的資源 (編成)', DivisionDesigner.fmt(s.mp, 0)) +
      row('徴兵人員 (本ゲーム)', DivisionDesigner.fmt(s.manpowerNeed, 0)) +
      row('生産コスト (IC)', DivisionDesigner.fmt(s.ic, 0)) +
      Object.entries(s.equipment || {}).map(([type, amount]) => row('装備: ' + DivisionDesigner.esc(DivisionDesigner.equipmentName(type)), DivisionDesigner.fmt(amount, 0))).join('') +
      row('訓練期間', s.trainDays ? s.trainDays + '日 (約' + Math.round(s.trainDays / 30) + 'ヶ月)' : '—', { cls: 'blue' }) +
      '</div>';
    const modRows = [];
    if (mods.armorBreakthrough) modRows.push(row('機甲突破ボーナス', pct(mods.armorBreakthrough), { cls: 'gold' }));
    if (mods.armorSpeed) modRows.push(row('機甲速度ボーナス', pct(mods.armorSpeed), { cls: 'gold' }));
    if (mods.infantryDefense) modRows.push(row('歩兵防御ボーナス', pct(mods.infantryDefense), { cls: 'gold' }));
    if (modRows.length) html += '<div class="dd-stat-group"><h4>適用中の補正 (カード)</h4>' + modRows.join('') + '</div>';
    html += '</aside>';
    return html;
  }

  static equipmentName(type) {
    const cat = typeof ProductionManager !== 'undefined' && ProductionManager.CATALOG ? ProductionManager.CATALOG[type] : null;
    return cat?.name || type;
  }

  // 徴兵 (訓練地点 / 配備先) — TrainingManager と連携
  static renderFooter(stats) {
    if (typeof TrainingManager === 'undefined') return '';
    const active = DivisionDesigner.activeTemplate();
    let stateOptions = '', armyOptions = '';
    try {
      const trainingStates = TrainingManager.availableTrainingStates();
      const capitalState = String(MapRenderer.stateOf(ArmyRoster.capitalProvince()) || '');
      if (!trainingStates.some(([id]) => id === TrainingManager.trainingStateId))
        TrainingManager.trainingStateId = trainingStates.some(([id]) => id === capitalState) ? capitalState : (trainingStates[0]?.[0] || '');
      stateOptions = trainingStates.map(([id, state]) => '<option value="' + id + '"' + (id === TrainingManager.trainingStateId ? ' selected' : '') + '>' + DivisionDesigner.esc(state.name || ('州' + id)) + '</option>').join('');
      armyOptions = (BattlePlanManager.armies || []).map(a => '<option value="' + a.id + '"' + (TrainingManager.targetArmyId === a.id ? ' selected' : '') + '>' + DivisionDesigner.esc(a.name) + ' (師団' + a.divisions.length + ')</option>').join('');
    } catch (e) { /* マップ未読込など */ }
    return '<div class="dd-footer">' +
      '<div class="dd-footer-info"><b>徴兵テンプレート:</b> ' + (active ? '★ ' + DivisionDesigner.esc(active.name) : '未設定') +
      (DivisionDesigner.dirty ? ' <span class="dd-badge dirty">編集中の変更は保存後に反映</span>' : '') + '</div>' +
      '<label>訓練地点 <select id="recruit-training-state" onchange="TrainingManager.trainingStateId=this.value">' + stateOptions + '</select></label>' +
      '<label>配備先 <select id="recruit-target-army" onchange="TrainingManager.targetArmyId = this.value ? parseInt(this.value) : null"><option value="">未所属師団として配備</option>' + armyOptions + '</select></label>' +
      '<button class="dd-btn primary" onclick="TrainingManager.recruit()"' + (active && DivisionDesigner.lineCount(active) ? '' : ' disabled') + '>📝 このテンプレートで徴兵</button>' +
    '</div>';
  }
}

window.DivisionDesigner = DivisionDesigner;
