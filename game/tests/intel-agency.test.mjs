/**
 * tests/intel-agency.test.mjs — 諜報機関（Agency & Espionage）の回帰テスト
 *
 * 実行: node --test game/tests/intel-agency.test.mjs
 * 依存: DOM 不要（localStorage だけスタブする）
 *
 * 対象:
 *   ・機関の設立（政治力消費）とエージェント枠
 *   ・アップグレードツリー（本部 / 暗号解読 / 潜入 / 特殊部隊）の前提と費用
 *   ・エージェントの雇用・任務割当・Tick 完了処理
 *   ・ネットワーク進捗 → インテルレベル → 政治/経済/軍事の解禁
 *   ・軍事情報による敵師団配置（推計）とマップ表示フラグ
 *   ・旧 API（recruit / assignMission / unassign / intelOn）互換とセーブ復元
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Bus } from '../js/util.js';
import { GameState } from '../js/state.js';
import { PROVINCES } from '../js/map-data.js';
import {
  AGENCY_BRANCHES, AGENCY_ESTABLISH_COST, OPERATIVE_HIRE_COST, INTEL_TIERS,
  AGENCY_BRANCHES as BRANCHES, // eslint-disable-line
  IntelManager, installIntelAgency, intelStateJSON, missionById, skillLabel, tierOf,
} from '../js/intel.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

function makeState({ pp = 500, tag = 'GER', clear = true } = {}) {
  if (clear) mem.clear();
  const state = new GameState();
  state.bus = new Bus();
  state.playerTag = tag;
  state.pp = pp;
  state.tickCount = 0;
  state.divisions = [];
  state.constructionQueue = [];
  return state;
}

function makeManager(opts) {
  const state = makeState(opts);
  const mgr = installIntelAgency(state);
  return { state, mgr };
}

/** 任務を即座に完了させる（日数分の Tick を進める） */
function finishMission(mgr, opId) {
  const op = mgr.operativeById(opId);
  const need = Math.ceil((op.mission?.daysLeft || 0) + 1) * 24;
  return mgr.tick(need);
}

/* ============================================================
 * 定義
 * ========================================================== */

test('定義: ミッション 6 種・ブランチ 4 系統・エージェント技能名', () => {
  const state = makeState();
  const mgr = installIntelAgency(state);
  assert.equal(mgr.missions().length, 6);
  assert.deepEqual(
    mgr.missions().map((m) => m.id).sort(),
    ['build_network', 'coup', 'decrypt', 'propaganda', 'sabotage', 'steal_tech'],
  );
  for (const m of mgr.missions()) {
    assert.ok(m.name && m.days > 0 && m.icon, `${m.id} の表示情報`);
  }
  assert.deepEqual(AGENCY_BRANCHES.map((b) => b.id), ['hq', 'crypto', 'infiltration', 'special_forces']);
  assert.equal(AGENCY_BRANCHES.length, BRANCHES.length);
  assert.deepEqual(INTEL_TIERS, ['political', 'economy', 'military']);
  assert.equal(skillLabel('spy_master'), '諜報長');
  assert.equal(missionById('coup').requiresBranch.special_forces, 2);
  assert.equal(tierOf(50, { political: 20, economy: 45, military: 70 }), 'economy');
  assert.equal(tierOf(10, { political: 20, economy: 45, military: 70 }), 'none');
});

/* ============================================================
 * 機関の設立
 * ========================================================== */

test('機関設立: 政治力を消費し、本部 Lv1・枠 2・初代エージェントを得る', () => {
  const { state, mgr } = makeManager({ pp: 120 });
  assert.equal(mgr.isEstablished(), false);
  assert.equal(mgr.operatives().length, 0, '未設立ではエージェントはいない');

  const chk = mgr.canEstablish();
  assert.equal(chk.ok, true);
  assert.equal(chk.cost, AGENCY_ESTABLISH_COST);

  const r = mgr.establish();
  assert.equal(r.ok, true);
  assert.equal(state.pp, 120 - AGENCY_ESTABLISH_COST);
  assert.equal(mgr.isEstablished(), true);
  assert.equal(mgr.branchLevels().hq, 1);
  assert.equal(mgr.slots(), 2);
  assert.equal(state.intel.slots, 2);
  assert.equal(mgr.operatives().length, 1, '設立時に 1 名配属');
  assert.equal(mgr.operatives()[0].templateId, 'skorzeny', '自国（GER）のエージェント');

  // 二重設立は不可
  const again = mgr.establish();
  assert.equal(again.ok, false);
  assert.match(again.reason, /既に/);
});

test('機関設立: 政治力不足なら拒否される', () => {
  const { state, mgr } = makeManager({ pp: 20 });
  const chk = mgr.canEstablish();
  assert.equal(chk.ok, false);
  assert.match(chk.reason, /政治力/);
  const r = mgr.establish();
  assert.equal(r.ok, false);
  assert.equal(state.pp, 20, '政治力は消費されない');
  assert.equal(mgr.isEstablished(), false);
});

/* ============================================================
 * アップグレードツリー
 * ========================================================== */

test('アップグレード: 前提 Lv と費用、本部レベルでエージェント枠が増える', () => {
  const { state, mgr } = makeManager({ pp: 1000 });
  mgr.establish();

  // 前提: 本部 Lv1 が無いと暗号解読は強化できない → 一旦本部を落として検証
  state.intel.agency.branches.hq = 0;
  const blocked = mgr.canUpgrade('crypto');
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /機関本部 Lv1/);
  state.intel.agency.branches.hq = 1;

  const before = state.pp;
  const up = mgr.upgradeBranch('crypto');
  assert.equal(up.ok, true);
  assert.equal(up.level, 1);
  assert.equal(up.cost, 50);
  assert.equal(state.pp, before - 50);
  assert.equal(mgr.branchLevels().crypto, 1);

  // 本部 Lv2 → 枠 3
  const slotsBefore = mgr.slots();
  const hq = mgr.upgradeBranch('hq');
  assert.equal(hq.ok, true);
  assert.equal(mgr.slots(), slotsBefore + 1);
  assert.equal(state.intel.slots, mgr.slots());

  // 最大レベルを超える強化は不可
  state.intel.agency.branches.special_forces = 2;
  assert.equal(mgr.canUpgrade('special_forces').ok, false);
  assert.match(mgr.canUpgrade('special_forces').reason, /最大/);
});

test('アップグレード: 政治力不足・未設立では強化できない', () => {
  const { state, mgr } = makeManager({ pp: 500 });
  assert.equal(mgr.canUpgrade('hq').ok, false, '未設立');
  mgr.establish();
  state.pp = 5;
  const chk = mgr.canUpgrade('hq');
  assert.equal(chk.ok, false);
  assert.match(chk.reason, /政治力/);
});

/* ============================================================
 * エージェント
 * ========================================================== */

test('雇用: 費用・枠上限・重複雇用の制御', () => {
  const { state, mgr } = makeManager({ pp: 500 });
  mgr.establish(); // 枠 2 / 1 名配属済み

  const before = state.pp;
  const hired = mgr.hire('bazna');
  assert.equal(hired.ok, true);
  assert.equal(state.pp, before - OPERATIVE_HIRE_COST);
  assert.equal(mgr.operatives().length, 2);

  const over = mgr.canRecruit('baker');
  assert.equal(over.ok, false);
  assert.match(over.reason, /枠/);

  // 枠を増やしても同名の二重雇用は不可
  state.pp = 500;
  mgr.upgradeBranch('hq');
  assert.equal(mgr.slots(), 3);
  const dup = mgr.hire('bazna');
  assert.equal(dup.ok, false);
  assert.match(dup.reason, /既に/);
});

test('任務: 割当・所要日数・Tick 完了でネットワークとインテルが伸びる', () => {
  const { state, mgr } = makeManager({ pp: 500 });
  mgr.establish();
  const op = mgr.operatives()[0];

  const days = mgr.missionDays(op, missionById('build_network'));
  assert.ok(days >= 5 && days <= 30, `所要日数 ${days}`);

  const assign = mgr.assignMission(op.id, 'build_network', 'SOV');
  assert.equal(assign.ok, true);
  assert.equal(assign.days, days);
  assert.equal(op.mission.target, 'SOV');
  assert.equal(mgr.canAssign(op.id, 'decrypt', 'SOV').ok, false, '任務中の再割当は不可');

  mgr.tick(24 * 3);
  assert.ok(op.mission.progress > 0 && op.mission.progress < 1, '進捗が反映される');

  const res = finishMission(mgr, op.id);
  assert.equal(res.completed, 1);
  assert.equal(op.mission, null);
  assert.ok(state.intel.networks.SOV > 0, 'ネットワークが構築される');
  assert.ok(state.intel.intelValue.SOV > 0, 'インテル値が加算される');
  assert.equal(state.intel.history.length, 1);
  assert.equal(state.intel.history[0].target, 'SOV');
  assert.equal(state.intel.history[0].missionId, 'build_network');
});

test('任務: 特殊部隊 Lv で破壊工作/技術窃取/クーデターが解禁される', () => {
  const { state, mgr } = makeManager({ pp: 2000 });
  mgr.establish();
  const op = mgr.operatives()[0];

  for (const id of ['sabotage', 'steal_tech', 'coup']) {
    const chk = mgr.canAssign(op.id, id, 'FRA');
    assert.equal(chk.ok, false, `${id} は未解禁`);
    assert.match(chk.reason, /特殊部隊/);
  }

  mgr.upgradeBranch('special_forces');
  for (const id of ['sabotage', 'steal_tech']) {
    assert.equal(mgr.missionAvailable(missionById(id)).ok, true, `${id} 解禁`);
  }
  assert.equal(mgr.missionAvailable(missionById('coup')).ok, false, 'クーデターは Lv2');
  mgr.upgradeBranch('special_forces');
  assert.equal(mgr.missionAvailable(missionById('coup')).ok, true);
});

test('任務: 暗号解読は暗号解読チーム Lv1 が必要で、解読数がインテルを押し上げる', () => {
  const { state, mgr } = makeManager({ pp: 2000 });
  mgr.establish();
  const op = mgr.operatives()[0];
  assert.equal(mgr.missionAvailable(missionById('decrypt')).ok, false);

  mgr.upgradeBranch('crypto');
  assert.equal(mgr.assignMission(op.id, 'decrypt', 'ENG').ok, true);
  finishMission(mgr, op.id);

  assert.equal(state.intel.decrypted.ENG, 1);
  assert.ok(mgr.intelLevel('ENG') > 0);
  // 暗号解読で軍事情報の閾値が下がる
  assert.ok(mgr.thresholds().military < 70);
});

test('任務中止: unassign で待機状態に戻る（旧 API 互換）', () => {
  const { mgr } = makeManager({ pp: 500 });
  mgr.establish();
  const op = mgr.operatives()[0];
  mgr.assignMission(op.id, 'propaganda', 'ITA');
  assert.ok(op.mission);
  const r = mgr.unassign(op.id);
  assert.equal(r.ok, true);
  assert.equal(r.hadMission, true);
  assert.equal(op.mission, null);
});

/* ============================================================
 * インテルと情報優位
 * ========================================================== */

test('インテル: ネットワーク 0 では政治情報すら見えず、進むと段階的に解禁される', () => {
  const { state, mgr } = makeManager({ pp: 500 });
  mgr.establish();

  const none = mgr.intelData('SOV');
  assert.equal(none.tier, 'none');
  assert.equal(none.political, null);
  assert.equal(none.economy, null);
  assert.equal(none.military, null);
  assert.equal(mgr.hasIntel('SOV', 'political'), false);

  // 政治情報の閾値までネットワークを積む
  state.intel.networks.SOV = 30;
  const pol = mgr.intelData('SOV');
  assert.equal(pol.tier, 'political');
  assert.ok(pol.political);
  assert.equal(pol.political.stability > 0, true);
  assert.equal(pol.economy, null, '経済情報はまだ見えない');

  // 経済情報
  state.intel.networks.SOV = 70;
  const eco = mgr.intelData('SOV');
  assert.equal(eco.tier, 'economy');
  assert.ok(eco.economy);
  assert.ok(eco.economy.factories > 0);
  assert.deepEqual(mgr.intelData('SOV').military, null);

  // 軍事情報
  state.intel.networks.SOV = 100;
  state.intel.intelValue.SOV = 30;
  const mil = mgr.intelData('SOV');
  assert.equal(mil.tier, 'military');
  assert.ok(mil.military, '軍事情報が解禁');
  assert.ok(mil.military.divisions > 0);
  assert.equal(mil.military.forces.length > 0, true);
  assert.equal(mgr.hasIntel('SOV', 'military'), true);
  assert.equal(mgr.hasIntel('SOV', 'political'), true, '上位段階は下位を含む');
});

test('インテル: 陥落（軍事情報）で敵師団配置が州へ配分される', () => {
  const { state, mgr } = makeManager({ pp: 500 });
  mgr.establish();
  state.intel.networks.SOV = 100;
  state.intel.intelValue.SOV = 30;

  const forces = mgr.enemyForces('SOV');
  const sovProvinces = PROVINCES.filter((p) => p.tag === 'SOV');
  assert.ok(forces.length > 0);
  assert.ok(forces.length <= sovProvinces.length);
  for (const f of forces) {
    assert.match(f.id, /^ef-SOV-/);
    assert.ok(sovProvinces.some((p) => p.id === f.provinceId), '対象国州のみ');
    assert.ok(f.count > 0);
    assert.ok(f.strength > 0 && f.strength <= 1.2);
    assert.ok(f.provinceName);
  }
  // 合計は対象国の工業力から算出した総数と一致する
  const nat = forces.reduce((n, f) => n + f.count, 0);
  const military = mgr.enemyMilitary('SOV');
  assert.equal(military.divisions, nat);
  assert.ok(military.factories > 0);
  assert.equal(mgr.enemyForces('SOV'), forces, 'キャッシュされる');
});

test('インテル: 敵師団表示フラグと全体サマリー', () => {
  const { state, mgr } = makeManager({ pp: 500 });
  mgr.establish();
  assert.equal(state.intel.showEnemyForces, true);
  assert.equal(mgr.toggleEnemyForces(), false);
  assert.equal(state.intel.showEnemyForces, false);
  assert.equal(mgr.toggleEnemyForces(), true);

  state.intel.networks.SOV = 80;
  const sum = mgr.summary();
  assert.equal(sum.established, true);
  assert.equal(sum.operatives, 1);
  assert.equal(sum.slots, mgr.slots());
  assert.ok(sum.avgIntel >= 0);
  assert.deepEqual(Object.keys(sum.revealed), ['political', 'economy', 'military']);
  assert.equal(sum.revealed.political, 1);
  assert.equal(mgr.intelOverview().length, mgr.targets().length);
});

/* ============================================================
 * 旧 API 互換・保存
 * ========================================================== */

test('旧 API 互換: recruit / assignMission / intelOn / targets / missions', () => {
  const { mgr } = makeManager({ pp: 500 });
  mgr.establish();

  const boss = mgr.recruit('bazna');
  assert.ok(boss && boss.id, 'recruit はエージェントを返す');
  const task = mgr.assignMission(boss.id, 'build_network', 'FRA');
  assert.equal(task.ok, true);
  assert.equal(typeof mgr.intelOn('FRA'), 'number');
  assert.equal(mgr.network('FRA'), 0);
  assert.equal(mgr.targets().includes('GER'), false, '自国は対象外');
  assert.equal(mgr.missions().length, 6);
  assert.equal(mgr.agencySummary().established, true);
});

test('保存: localStorage へ保存され、新しいマネージャで復元される', () => {
  const { state, mgr } = makeManager({ pp: 500 });
  mgr.establish();
  mgr.upgradeBranch('crypto');
  mgr.assignMission(mgr.operatives()[0].id, 'build_network', 'SOV');
  mgr.save();

  const json = intelStateJSON(state);
  assert.equal(json.agency.branches.crypto, 1);
  assert.equal(json.operatives.length, 1);
  assert.ok(json.operatives[0].mission);

  const state2 = new GameState();
  state2.bus = new Bus();
  state2.playerTag = 'GER';
  const mgr2 = installIntelAgency(state2);
  assert.equal(mgr2.isEstablished(), true);
  assert.equal(mgr2.branchLevels().crypto, 1);
  assert.equal(mgr2.operatives().length, 1);
  assert.equal(mgr2.operatives()[0].mission.target, 'SOV');
  assert.equal(installIntelAgency(state2), mgr2, '二重インストールしない');
});
