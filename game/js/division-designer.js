/**
 * division-designer.js — 師団編成（Division Designer）データ層
 *
 *  ・初期テンプレート（歩兵 / 装甲 / 自動車化 / 山岳）
 *  ・テンプレートの永続化（localStorage + GameState）
 *  ・「変更を保存」で訓練・配備に反映するための保存処理
 *  ・訓練キュー（保存済みテンプレートから師団を編成し、時間経過で配備）
 *
 *  UI は ui/division-designer.js。本ファイルは DOM に依存しない。
 */

import { DivisionTemplate, GRID_W, GRID_H, SUPPORT_SLOTS, divisionType } from './division.js';
import { store, uid } from './util.js';
import { PROVINCES } from './map-data.js';

export const TEMPLATES_KEY = 'hoi4.divisionTemplates.v1';
export const TRAINING_KEY = 'hoi4.divisionTraining.v1';

/* ============================================================
 * 初期テンプレート
 * ========================================================== */

/** 5×5 グリッドを「列優先（HOI4 と同じく 1 列 2 大隊ずつ埋まる）」で作る */
function gridFromList(list) {
  const grid = new Array(GRID_W * GRID_H).fill(null);
  list.slice(0, GRID_W * GRID_H).forEach((id, i) => { grid[i] = id; });
  return grid;
}

function makeTemplate(name, battalions, supports = [], count = 0) {
  const t = new DivisionTemplate(name);
  t.grid = gridFromList(battalions);
  t.support = [...supports, ...new Array(SUPPORT_SLOTS).fill(null)].slice(0, SUPPORT_SLOTS);
  t.count = count;
  t._recalc();
  return t;
}

/** 既定テンプレート（初回起動時に GameState へ投入） */
export function defaultTemplates() {
  return [
    makeTemplate(
      '歩兵師団',
      ['infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry'],
      ['engineer', 'artillery_support'],
      0,
    ),
    makeTemplate(
      '装甲師団',
      ['medium_tank', 'medium_tank', 'medium_tank', 'medium_tank', 'medium_tank', 'motorized', 'motorized', 'motorized', 'motorized'],
      ['recon', 'engineer', 'maintenance', 'logistics'],
      0,
    ),
    makeTemplate(
      '自動車化師団',
      ['motorized', 'motorized', 'motorized', 'motorized', 'motorized', 'motorized', 'motorized', 'artillery', 'artillery'],
      ['engineer', 'logistics'],
      0,
    ),
    makeTemplate(
      '山岳師団',
      ['mountaineers', 'mountaineers', 'mountaineers', 'mountaineers', 'mountaineers', 'mountaineers', 'artillery', 'artillery', 'artillery'],
      ['engineer', 'artillery_support', 'field_hospital'],
      0,
    ),
  ];
}

/* ============================================================
 * 永続化
 * ========================================================== */

function sanitize(rawList) {
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (const raw of rawList) {
    try {
      const t = DivisionTemplate.fromJSON(raw);
      if (!t.name) t.name = '名称未設定師団';
      // 同一テンプレート内で支援中隊が重複していたら後ろを削除
      const seen = new Set();
      t.support = t.support.map((id) => {
        if (!id || seen.has(id)) return null;
        seen.add(id);
        return id;
      });
      t._recalc();
      out.push(t);
    } catch (e) {
      console.warn('[division-designer] テンプレートの読み込みに失敗', e);
    }
  }
  return out;
}

/** localStorage からテンプレートを読み込む（無ければ既定テンプレート） */
export function loadTemplates() {
  const saved = store.get(TEMPLATES_KEY, null);
  if (Array.isArray(saved)) {
    const list = sanitize(saved);
    if (list.length) return list;
  }
  return defaultTemplates();
}

/** テンプレート配列を JSON で保存し、GameState と同期する */
export function persistTemplates(state, templates, { silent = false } = {}) {
  const json = templates.map((t) => t.toJSON());
  if (state) {
    state.divisionTemplates = templates;
    if (!silent) {
      state.bus?.emit('division-templates-changed', json);
      // 配備済み師団（このテンプレートを参照しているもの）の最大値を更新
      updateDeployedDivisions(state, templates);
    }
  }
  store.set(TEMPLATES_KEY, json);
  return json;
}

/** 地図・作戦計画が扱う兵科コードへ変換（mixed は装甲扱い） */
function deployType(tpl) {
  const t = divisionType(tpl);
  if (t === 'mixed') return 'armor';
  if (t === 'motorized') return 'infantry';
  if (t === 'empty') return 'infantry';
  return t;
}

/** 保存済みテンプレートを参照する配備済み師団のステータス上限を更新 */
function updateDeployedDivisions(state, templates) {
  if (!Array.isArray(state.divisions)) return;
  const byId = new Map(templates.map((t) => [t.id, t]));
  for (const div of state.divisions) {
    if (!div?.templateId) continue;
    const tpl = byId.get(div.templateId);
    if (!tpl || tpl.isEmpty) continue;
    div.type = deployType(tpl);
    div.maxOrg = tpl.stats.maxOrg;
    div.maxHp = tpl.stats.hp;
    div.org = Math.min(div.org ?? tpl.stats.maxOrg, div.maxOrg);
    div.hp = Math.min(div.hp ?? tpl.stats.hp, div.maxHp);
    div.stats = { ...tpl.stats };
  }
}

/** 新規テンプレートを作成してリストに追加 */
export function createTemplate(state, templates, name = null) {
  const n = (name || '新型師団').trim() || '新型師団';
  const t = new DivisionTemplate(n);
  // 空師団に歩兵 3 個を入れておくと編集しやすい
  t.add(0, 'infantry');
  t.add(1, 'infantry');
  t.add(2, 'infantry');
  templates.push(t);
  persistTemplates(state, templates, { silent: true });
  state?.bus?.emit('division-templates-changed', templates.map((x) => x.toJSON()));
  return t;
}

/**
 * 複製
 * source には未保存のドラフトを渡せる（元テンプレートは変更しない）
 */
export function duplicateTemplate(state, templates, tpl, source = null) {
  const base = source || tpl;
  const copy = base.clone(`${base.name}（複製）`);
  copy.id = uid('div');
  copy.count = 0;
  copy.grid = [...base.grid];
  copy.support = [...base.support];
  copy._recalc();
  const idx = templates.findIndex((t) => t.id === tpl.id);
  templates.splice(idx >= 0 ? idx + 1 : templates.length, 0, copy);
  persistTemplates(state, templates, { silent: true });
  state?.bus?.emit('division-templates-changed', templates.map((x) => x.toJSON()));
  return copy;
}

/** 削除（配備済み師団がある場合は削除不可） */
export function deleteTemplate(state, templates, tpl) {
  if (!tpl) return { ok: false, reason: 'テンプレートが選択されていません' };
  if ((tpl.count || 0) > 0) {
    return { ok: false, reason: `配備済みの師団が ${tpl.count} 個あるため削除できません` };
  }
  const idx = templates.findIndex((t) => t.id === tpl.id);
  if (idx < 0) return { ok: false, reason: 'テンプレートが見つかりません' };
  templates.splice(idx, 1);
  persistTemplates(state, templates, { silent: true });
  state?.bus?.emit('division-templates-changed', templates.map((x) => x.toJSON()));
  return { ok: true };
}

/** 保存（変更を保存ボタン） */
export function saveTemplate(state, templates, tpl) {
  if (!tpl) return { ok: false, reason: 'テンプレートが選択されていません' };
  if (tpl.isEmpty) return { ok: false, reason: '大隊が 1 個も配置されていません' };
  tpl.name = (tpl.name || '').trim() || '名称未設定師団';
  tpl._recalc();
  if (!templates.some((t) => t.id === tpl.id)) templates.push(tpl);
  persistTemplates(state, templates);
  return { ok: true, json: tpl.toJSON() };
}

/* ============================================================
 * 訓練キュー
 * ========================================================== */

const r1 = (n) => Math.round(n * 10) / 10;

function loadTrainingQueue() {
  const q = store.get(TRAINING_KEY, []);
  return Array.isArray(q) ? q : [];
}

function persistTrainingQueue(state) {
  store.set(TRAINING_KEY, state.trainingQueue || []);
}

/** 装備・人的資源が揃っているか */
export function canTrain(state, tpl) {
  if (!tpl || tpl.isEmpty) return { ok: false, reason: '大隊が配置されていません', missing: [] };
  const st = tpl.stats;
  const missing = [];
  if ((state.manpower || 0) < st.manpower) {
    missing.push(`人的資源 ${Math.max(0, st.manpower - (state.manpower || 0)).toLocaleString('ja-JP')}`);
  }
  for (const [k, need] of Object.entries(tpl.equipment || {})) {
    const have = state.stockpile?.[k] || 0;
    if (have < need) missing.push(`装備 ${k} ×${Math.ceil(need - have)}`);
  }
  return { ok: missing.length === 0, missing, reason: missing.length ? '資源が不足しています' : '' };
}

/** 訓練開始（人的資源・装備を消費し、キューへ追加） */
export function startTraining(state, tpl) {
  if (!state) return { ok: false, reason: 'ゲーム状態が初期化されていません' };
  const check = canTrain(state, tpl);
  if (!check.ok) return check;
  state.trainingQueue = state.trainingQueue || loadTrainingQueue();
  if (state.trainingQueue.length >= 8) return { ok: false, reason: '訓練キューが満杯です（最大 8）', missing: [] };

  const st = tpl.stats;
  state.manpower = Math.max(0, (state.manpower || 0) - st.manpower);
  for (const [k, need] of Object.entries(tpl.equipment || {})) {
    state.stockpile[k] = Math.max(0, (state.stockpile[k] || 0) - need);
  }

  const order = {
    id: uid('train'),
    templateId: tpl.id,
    name: tpl.name,
    // 1 時間 Tick。90 日 = 2160 時間。
    daysRequired: Math.max(30, st.trainDays || 90),
    hoursRequired: Math.max(30, st.trainDays || 90) * 24,
    hours: 0,
    manpower: st.manpower,
    equipment: { ...(tpl.equipment || {}) },
    stats: { ...st },
    type: divisionType(tpl),
    startedAt: state.dateLabel || '',
  };
  state.trainingQueue.push(order);
  persistTrainingQueue(state);
  state.bus?.emit('division-training-queued', order);
  return { ok: true, order };
}

/** 訓練キャンセル（資源を全額返却） */
export function cancelTraining(state, orderId) {
  const q = state?.trainingQueue;
  if (!Array.isArray(q)) return { ok: false };
  const idx = q.findIndex((o) => o.id === orderId);
  if (idx < 0) return { ok: false };
  const [order] = q.splice(idx, 1);
  state.manpower = (state.manpower || 0) + (order.manpower || 0);
  for (const [k, v] of Object.entries(order.equipment || {})) {
    state.stockpile[k] = (state.stockpile[k] || 0) + v;
  }
  persistTrainingQueue(state);
  state.bus?.emit('division-training-cancelled', order);
  return { ok: true, order };
}

/** 配備（訓練完了した師団を前線へ） */
function deployDivision(state, order) {
  const tag = state.playerTag || 'GER';
  const owned = (state.divisions || []).filter((d) => (d.tag || tag) === tag);
  const provinces = PROVINCES.filter((p) => p.tag === tag);
  const provinceId = owned[0]?.provinceId ?? provinces[0]?.id ?? PROVINCES[0]?.id ?? null;
  const type = order.type === 'mixed' ? 'armor'
    : (order.type && order.type !== 'empty' ? order.type : 'infantry');

  const tpl = (state.divisionTemplates || []).find((t) => t.id === order.templateId);
  if (tpl) tpl.count = (tpl.count || 0) + 1;

  const num = owned.filter((d) => d.templateId === order.templateId).length + 1;
  const div = {
    id: `div-${tag}-t${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`,
    provinceId,
    tag,
    type,
    name: `${order.name} ${num}`,
    templateId: order.templateId,
    org: order.stats?.maxOrg ?? 50,
    hp: order.stats?.hp ?? 90,
    maxOrg: order.stats?.maxOrg ?? 50,
    maxHp: order.stats?.hp ?? 100,
    softAttack: order.stats?.softAttack ?? 0,
    hardAttack: order.stats?.hardAttack ?? 0,
    defense: order.stats?.defense ?? 0,
    breakthrough: order.stats?.breakthrough ?? 0,
    speed: order.stats?.speed ?? 0,
    supply: 0.9,
    command: 0.85,
    stats: order.stats ? { ...order.stats } : null,
  };
  if (!Array.isArray(state.divisions)) state.divisions = [];
  state.divisions.push(div);

  const templates = state.divisionTemplates || [];
  if (templates.length) persistTemplates(state, templates, { silent: true });
  state.bus?.emit('division-added', { tag, division: div });
  state.bus?.emit('division-trained', { division: div, templateId: order.templateId });
  return div;
}

/** 1 時間ごとの訓練進行（GameState の 'hour' イベントで呼ばれる） */
export function tickTraining(state) {
  const q = state?.trainingQueue;
  if (!Array.isArray(q) || !q.length) return;
  let changed = false;
  let shouldPersist = false;
  for (let i = q.length - 1; i >= 0; i--) {
    const order = q[i];
    order.hours = (order.hours || 0) + 1;
    changed = true;
    // localStorage への書き込みは 1 日 1 回 + 完了時に限定（毎時書き込みを避ける）
    if (order.hours % 24 === 0) shouldPersist = true;
    if (order.hours >= (order.hoursRequired || 2160)) {
      q.splice(i, 1);
      deployDivision(state, order);
      shouldPersist = true;
    }
  }
  if (changed && shouldPersist) persistTrainingQueue(state);
}

/**
 * ゲーム起動時に 1 度だけ呼ぶ。
 * テンプレートの読み込みと 'hour' Tick の接続を行う。
 */
export function installDivisionDesigner(state) {
  if (!state) return;
  if (!Array.isArray(state.divisionTemplates) || !state.divisionTemplates.length) {
    const hadSaved = Array.isArray(store.get(TEMPLATES_KEY, null));
    state.divisionTemplates = loadTemplates();
    // 初回起動時は既定テンプレートを保存して ID を固定する
    // （訓練キューがテンプレート ID を参照するため）
    if (!hadSaved) persistTemplates(state, state.divisionTemplates, { silent: true });
  }
  if (!Array.isArray(state.trainingQueue)) state.trainingQueue = loadTrainingQueue();
  if (state._ddInstalled) return;
  state._ddInstalled = true;
  // save 時に GameState と localStorage を同期（他画面からの編集にも追従）
  state.bus.on('division-templates-changed', (json) => {
    if (Array.isArray(json)) store.set(TEMPLATES_KEY, json);
  });
  // 時間経過で訓練を進行（画面を閉じていても進む）
  state.bus.on('hour', () => tickTraining(state));
}

/** 訓練進捗（0..1） */
export function trainingProgress(order) {
  if (!order) return 0;
  return Math.max(0, Math.min(1, (order.hours || 0) / (order.hoursRequired || 1)));
}

/** 残り日数 */
export function trainingDaysLeft(order) {
  if (!order) return 0;
  return Math.max(0, Math.ceil(((order.hoursRequired || 0) - (order.hours || 0)) / 24));
}

/** デバッグ/外部連携用: 現在のテンプレート JSON を取得 */
export function templatesJSON(state) {
  return (state?.divisionTemplates || []).map((t) => t.toJSON());
}

export { r1 };
