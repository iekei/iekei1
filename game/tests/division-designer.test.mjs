/**
 * tests/division-designer.test.mjs — 師団編成 / Division Designer の回帰テスト
 *
 * 実行: node --test game/tests/division-designer.test.mjs
 * 依存: DOM 不要（localStorage だけスタブする）
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DivisionTemplate, GRID_W, GRID_H, SUPPORT_SLOTS, divisionType } from '../js/division.js';
import { BATTALIONS } from '../js/data/battalions.js';
import {
  TEMPLATES_KEY, defaultTemplates, loadTemplates, persistTemplates, saveTemplate,
  createTemplate, duplicateTemplate, deleteTemplate, canTrain, startTraining,
  cancelTraining, tickTraining, installDivisionDesigner,
} from '../js/division-designer.js';

/* localStorage スタブ（Node 18+） */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

function mockState(overrides = {}) {
  return {
    playerTag: 'GER',
    bus: { on: () => () => {}, emit: () => {} },
    manpower: 100000,
    stockpile: { infantry_equipment_1: 100000, artillery1: 100000 },
    divisions: [],
    divisionTemplates: [],
    trainingQueue: [],
    ...overrides,
  };
}

test('既定テンプレートは 5×5 / 1×5 の枠内に収まり、ステータスが計算される', () => {
  const list = defaultTemplates();
  assert.ok(list.length >= 4);
  for (const t of list) {
    assert.equal(t.grid.length, GRID_W * GRID_H);
    assert.equal(t.support.length, SUPPORT_SLOTS);
    assert.ok(t.battalionCount > 0);
    assert.ok(t.stats.maxOrg > 0);
    assert.ok(t.stats.softAttack > 0);
    assert.ok(t.stats.hp > 0);
    assert.ok(t.stats.trainDays >= 60);
    assert.equal(t.stats.orgRate, Math.min(120, Math.round((t.stats.maxOrg / 60) * 100)));
  }
  const inf = list.find((t) => t.name === '歩兵師団');
  assert.equal(inf.battalionCount, 9);
  assert.equal(inf.supportCount, 2);
  assert.equal(inf.stats.combatWidth, 18);
  assert.equal(divisionType(inf), 'infantry');
});

test('大隊の配置・削除・入替でステータスが即座に再計算される', () => {
  const t = new DivisionTemplate('テスト');
  assert.equal(t.isEmpty, true);
  assert.equal(t.stats.speed, 0);
  assert.equal(t.stats.orgRate, 0);

  const baseSoft = t.stats.softAttack;
  t.add(0, 'infantry');
  assert.ok(t.stats.softAttack > baseSoft);
  assert.equal(t.stats.maxOrg, 60);
  assert.equal(t.stats.manpower, 100);
  assert.equal(t.stats.speed, 4);

  const softWithInf = t.stats.softAttack;
  t.add(1, 'artillery');
  assert.ok(t.stats.softAttack > softWithInf);
  assert.ok(t.stats.trainDays > 60);

  t.remove(1);
  assert.equal(t.stats.softAttack, softWithInf);

  t.add(2, 'medium_tank');
  assert.ok(t.stats.hardAttack > 0);
  assert.ok(t.stats.armor > 0);
  assert.ok(t.stats.hardness > 40);

  t.clear();
  assert.equal(t.isEmpty, true);
  assert.equal(t.stats.hp, 0);
  assert.equal(t.stats.speed, 0);
});

test('支援中隊は組織力・攻撃力に乗算補正を与え、重複配置できない', () => {
  const t = new DivisionTemplate('支援テスト');
  for (let i = 0; i < 9; i++) t.add(i, 'infantry');
  const before = { ...t.stats };

  t.addSupport(0, 'engineer');
  assert.ok(t.stats.maxOrg > before.maxOrg);
  assert.equal(t.stats.supplyUse, before.supplyUse);

  t.addSupport(1, 'artillery_support');
  assert.ok(t.stats.softAttack > before.softAttack);

  // 同じ支援中隊を別スロットへ置くと移動（重複しない）
  t.addSupport(3, 'engineer');
  assert.equal(t.support.filter((x) => x === 'engineer').length, 1);
  assert.equal(t.support[0], null);
  assert.equal(t.support[3], 'engineer');

  t.removeSupport(3);
  assert.equal(t.supportCount, 1);
});

test('保存で JSON が更新され、再読込しても編成が復元される', () => {
  mem.clear();
  const state = mockState();
  const templates = defaultTemplates();
  state.divisionTemplates = templates;
  const t = templates[0];

  t.add(9, 'light_tank');
  t.addSupport(4, 'logistics');
  const r = saveTemplate(state, templates, t);
  assert.equal(r.ok, true);
  assert.ok(r.json.grid.includes('light_tank'));

  const raw = JSON.parse(mem.get(TEMPLATES_KEY));
  assert.equal(raw.length, templates.length);
  assert.ok(raw[0].grid.includes('light_tank'));
  assert.ok(raw[0].support.includes('logistics'));

  const loaded = loadTemplates();
  assert.equal(loaded.length, templates.length);
  assert.equal(loaded[0].name, '歩兵師団');
  assert.ok(loaded[0].grid.includes('light_tank'));
  assert.ok(loaded[0].support.includes('logistics'));

  // 空師団は保存できない
  const empty = new DivisionTemplate('空');
  const bad = saveTemplate(state, templates, empty);
  assert.equal(bad.ok, false);
});

test('新規作成・複製・削除（配備済みは削除不可）', () => {
  mem.clear();
  const state = mockState();
  const templates = defaultTemplates();
  state.divisionTemplates = templates;

  const created = createTemplate(state, templates, 'テスト新編');
  assert.ok(templates.some((t) => t.id === created.id));
  assert.equal(created.battalionCount, 3);

  const copy = duplicateTemplate(state, templates, templates[0]);
  assert.notEqual(copy.id, templates[0].id);
  assert.equal(copy.battalionCount, templates[0].battalionCount);
  assert.equal(copy.count, 0);

  templates[0].count = 3;
  const denied = deleteTemplate(state, templates, templates[0]);
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /配備済み/);

  const ok = deleteTemplate(state, templates, copy);
  assert.equal(ok.ok, true);
  assert.ok(!templates.some((t) => t.id === copy.id));
});

test('訓練開始で資源を消費し、時間経過で師団が配備される', () => {
  mem.clear();
  const state = mockState();
  const t = new DivisionTemplate('訓練師団');
  for (let i = 0; i < 9; i++) t.add(i, 'infantry');
  t._recalc();
  state.divisionTemplates = [t];

  const check = canTrain(state, t);
  assert.equal(check.ok, true);

  const beforeManpower = state.manpower;
  const beforeEquip = state.stockpile.infantry_equipment_1;
  const started = startTraining(state, t);
  assert.equal(started.ok, true);
  assert.equal(state.trainingQueue.length, 1);
  assert.equal(state.manpower, beforeManpower - t.stats.manpower);
  assert.equal(state.stockpile.infantry_equipment_1, beforeEquip - t.equipment.infantry_equipment_1);

  const order = state.trainingQueue[0];
  assert.equal(order.hoursRequired, t.stats.trainDays * 24);

  for (let i = 0; i < order.hoursRequired; i++) tickTraining(state);
  assert.equal(state.trainingQueue.length, 0);
  assert.equal(state.divisions.length, 1);
  assert.equal(state.divisions[0].templateId, t.id);
  assert.equal(t.count, 1);
  assert.equal(state.divisions[0].maxOrg, t.stats.maxOrg);
});

test('資源不足では訓練できず、中止すると資源が返却される', () => {
  mem.clear();
  const poor = mockState({ manpower: 10, stockpile: { infantry_equipment_1: 0 } });
  const t = new DivisionTemplate('高価な師団');
  for (let i = 0; i < 9; i++) t.add(i, 'infantry');
  t._recalc();
  poor.divisionTemplates = [t];
  assert.equal(canTrain(poor, t).ok, false);
  assert.equal(startTraining(poor, t).ok, false);

  const state = mockState();
  state.divisionTemplates = [t];
  const start = startTraining(state, t);
  assert.equal(start.ok, true);
  const mpAfterStart = state.manpower;
  const canceled = cancelTraining(state, start.order.id);
  assert.equal(canceled.ok, true);
  assert.equal(state.trainingQueue.length, 0);
  assert.equal(state.manpower, mpAfterStart + t.stats.manpower);
  assert.equal(state.divisions.length, 0);
});

test('installDivisionDesigner はテンプレートを読み込み、hour Tick に接続する', () => {
  mem.clear();
  let hourHandler = null;
  const state = mockState({
    divisionTemplates: [],
    bus: { on: (ev, fn) => { if (ev === 'hour') hourHandler = fn; return () => { hourHandler = null; }; }, emit: () => {} },
  });
  installDivisionDesigner(state);
  assert.ok(Array.isArray(state.divisionTemplates));
  assert.ok(state.divisionTemplates.length > 0);
  assert.ok(Array.isArray(state.trainingQueue));
  assert.equal(typeof hourHandler, 'function');

  // 二重インストールしてもハンドラが増えない
  const first = hourHandler;
  installDivisionDesigner(state);
  assert.equal(hourHandler, first);

  // BATTALIONS の全定義に対して stat が数値であること
  for (const [id, b] of Object.entries(BATTALIONS)) {
    assert.equal(typeof b.stats.org, 'number', id);
    assert.ok(b.stats.width > 0, id);
  }
});
