/**
 * tests/supply.test.mjs — 補給網・インフラ・補給ハブの回帰テスト
 *
 * 実行: node --test game/tests/supply.test.mjs
 * 依存: DOM 不要（localStorage だけスタブする）
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Bus } from '../js/util.js';
import { GameState } from '../js/state.js';
import { PROVINCES, PROVINCE_BY_ID } from '../js/map-data.js';
import {
  SUPPLY, SUPPLY_BUILDINGS, SUPPLY_STATUS_COLOR, supplyPenalties,
  divisionSupplyDemand, SupplyManager, installSupplySystem, supplyLevelsJSON,
} from '../js/supply.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

function makeState() {
  const state = new GameState();
  state.bus = new Bus();
  state.divisions = [];
  state.constructionQueue = [];
  state.playerTag = 'GER';
  return state;
}

function addDivisions(state, provinceId, count, tag = 'GER', type = 'infantry') {
  for (let i = 0; i < count; i++) {
    state.divisions.push({
      id: `test-div-${provinceId}-${i}`,
      provinceId,
      tag,
      type,
      name: `テスト師団 ${i + 1}`,
      org: 50, maxOrg: 50, hp: 100, maxHp: 100, supply: 1,
    });
  }
  return state.divisions;
}

/* ============================================================
 * 初期化 / 既定値
 * ========================================================== */

test('初期化で全州にインフラ・補給ハブの既定値が入り、首都が補給源になる', () => {
  mem.clear();
  const state = makeState();
  const mgr = installSupplySystem(state);
  assert.ok(mgr instanceof SupplyManager);
  assert.equal(installSupplySystem(state), mgr, '二重インストールしない');

  const capital = PROVINCES.find((p) => p.tag === 'GER' && p.capital);
  assert.ok(capital, 'ドイツの首都が存在する');
  assert.equal(mgr.infra(capital.id), SUPPLY.INFRA_MAX);
  assert.ok(mgr.hubLevel(capital.id) >= SUPPLY.CAPITAL_HUB_LEVEL);

  for (const p of PROVINCES) {
    assert.ok(Number.isFinite(state.infrastructure[p.id]), p.id);
    assert.ok(Number.isFinite(state.supplyHubs[p.id]), p.id);
    assert.ok(mgr.infra(p.id) >= 0 && mgr.infra(p.id) <= SUPPLY.INFRA_MAX);
    assert.ok(mgr.hubLevel(p.id) >= 0 && mgr.hubLevel(p.id) <= SUPPLY.HUB_MAX);
  }

  const net = mgr.network();
  assert.equal(net.tag, 'GER');
  assert.equal(net.capitalId, capital.id);
  assert.ok(net.hubs.some((h) => h.provinceId === capital.id && h.isCapital));
  assert.ok(net.routes.length >= 1, '首都から補給ハブへの鉄道ルートができる');
  for (const route of net.routes) {
    assert.equal(route.from, capital.id);
    assert.ok(route.path[0] === capital.id, '経路は首都から始まる');
    assert.ok(route.path[route.path.length - 1] === route.to);
  }
  const ownCount = PROVINCES.filter((p) => p.tag === 'GER').length;
  assert.equal(Object.keys(net.provinces).length, ownCount);
  assert.equal(net.summary.hubs, net.hubs.length);
  assert.equal(net.summary.provinces, ownCount);
  for (const st of Object.values(net.provinces)) {
    assert.ok(st.capacity >= 0);
    assert.equal(st.demand, 0);
    assert.ok(['ok', 'none'].includes(st.status));
  }
});

test('補給網の状態色は 緑=正常 / 黄=不足 / 赤=枯渇 に対応する', () => {
  assert.equal(SUPPLY_STATUS_COLOR.ok, '#7ec850');
  assert.equal(SUPPLY_STATUS_COLOR.low, '#e0b93e');
  assert.equal(SUPPLY_STATUS_COLOR.critical, '#d05038');
});

/* ============================================================
 * 需要 / 容量 / ペナルティ
 * ========================================================== */

test('補給比率に応じたペナルティ（移動・戦闘・組織）が段階的にかかる', () => {
  const full = supplyPenalties(1);
  assert.equal(full.speed, 1);
  assert.equal(full.combat, 1);
  assert.equal(full.org, 1);
  assert.equal(full.penaltyPct, 0);

  const half = supplyPenalties(0.5);
  assert.ok(half.speed < 1 && half.speed > 0.4);
  assert.ok(half.combat < 1 && half.combat >= 0.3);
  assert.ok(half.org < 1 && half.org >= 0.4);

  const none = supplyPenalties(0);
  assert.equal(none.speed, 0.4);
  assert.equal(none.combat, 0.3);
  assert.equal(none.org, 0.4);
  assert.equal(none.penaltyPct, 100);
});

test('師団の需要は編成の補給消費量から算出される', () => {
  const state = makeState();
  assert.equal(divisionSupplyDemand({ type: 'armor' }, state), 2.8);
  assert.equal(divisionSupplyDemand({ type: 'infantry', stats: { supplyUse: 4.2 } }, state), 4.2);
});

test('補給容量を超えた師団に組織力・戦闘力・移動速度のペナルティが適用される', () => {
  mem.clear();
  const state = makeState();
  const mgr = installSupplySystem(state);
  const target = 'ger_munich';
  const before = mgr.statusFor(target);
  assert.ok(before.capacity > 0);

  // 容量を大きく超える 40 個の師団を 1 州へ集中
  addDivisions(state, target, 40);
  mgr.tick(1);
  const after = mgr.statusFor(target);
  assert.ok(after.demand > after.capacity);
  assert.equal(after.status, 'critical');
  assert.ok(after.ratio < 0.5);

  const div = state.divisions[0];
  assert.ok(div.supplyRatio < 0.5, '供給比率が低下');
  assert.ok(div.supplyPenalty.speed < 0.7, '移動速度ペナルティ');
  assert.ok(div.supplyPenalty.combat < 0.65, '戦闘力ペナルティ');
  assert.ok(div.supplyPenalty.org < 0.7, '組織率ペナルティ');
  assert.ok(div.effectiveMaxOrg < 50, '組織力上限が切り下がる');
  assert.ok(div.org <= div.effectiveMaxOrg, '現在組織力も上限以下に抑えられる');
  assert.ok(mgr.network().summary.unsuppliedDivisions >= 1);

  // 師団を撤収すると容量が需要を満たし、組織力が回復する
  state.divisions = [];
  div.org = 10;
  state.divisions = [div];
  div.provinceId = 'ger_munich';
  // 1 個だけなら容量内
  const single = makeState();
  installSupplySystem(single);
  addDivisions(single, target, 1);
  single.divisions[0].org = 10;
  single._supplyMgr.tick(10);
  assert.equal(single.divisions[0].supplyStatus, 'ok');
  assert.ok(single.divisions[0].org > 10, '補給回復で組織力が回復');
});

test('補給ハブが少ない州では軍団集中で容量を超え、枯渇する', () => {
  mem.clear();
  const state = makeState();
  const mgr = installSupplySystem(state);
  // ハブをすべて除去し、首都もハブなしにする（現地調達のみ）
  for (const p of PROVINCES) state.supplyHubs[p.id] = 0;
  mgr.refresh();
  const net = mgr.network();
  for (const h of net.hubs) assert.ok(h.isCapital, '首都のみが供給源として残る');
  const target = 'ger_munich';
  addDivisions(state, target, 20);
  mgr.tick(1);
  const st = mgr.statusFor(target);
  assert.ok(st.status === 'critical' || st.status === 'low');
  assert.ok(st.demand > st.capacity);
  assert.ok(st.hubSource === net.capitalId || st.hubSource === null);
});

/* ============================================================
 * 建設 / インフラ / 補給ハブ
 * ========================================================== */

test('インフラと補給ハブの建設予約・スロット管理・完成処理', () => {
  mem.clear();
  const state = makeState();
  const mgr = installSupplySystem(state);
  const target = PROVINCES.find((p) => p.tag === 'GER' && !p.capital && mgr.infra(p.id) < SUPPLY.INFRA_MAX);
  assert.ok(target);
  const beforeInfra = mgr.infra(target.id);
  const beforeCapacity = mgr.statusFor(target.id).capacity;

  const reserved = mgr.enqueue(target.id, 'infrastructure');
  assert.equal(reserved.ok, true);
  assert.equal(state.constructionQueue.length, 1);
  assert.equal(state.constructionQueue[0].provinceId, target.id);
  assert.equal(state.constructionQueue[0].targetLevel, beforeInfra + 1);
  assert.ok(state.constructionQueue[0].days > 0);
  assert.equal(mgr.usedSlots(target.id), 1);

  // 同じ種別の二重予約は不可
  const duplicate = mgr.enqueue(target.id, 'infrastructure');
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.reason, /既に建設予約/);

  // 完成処理
  const order = state.constructionQueue.shift();
  const level = mgr.completeConstruction(order);
  assert.equal(level, beforeInfra + 1);
  assert.equal(mgr.infra(target.id), beforeInfra + 1);
  assert.ok(mgr.statusFor(target.id).capacity >= beforeCapacity, 'インフラ向上で容量が増える');

  // 補給ハブの建設
  const noHub = PROVINCES.find((p) => p.tag === 'GER' && !p.capital && mgr.hubLevel(p.id) === 0);
  if (noHub) {
    const hubOrder = mgr.enqueue(noHub.id, 'supply_hub');
    assert.equal(hubOrder.ok, true);
    mgr.completeConstruction(state.constructionQueue.shift());
    assert.equal(mgr.hubLevel(noHub.id), 1);
    assert.ok(mgr.network().hubs.some((h) => h.provinceId === noHub.id), '建設したハブが補給網に参加');
  }

  // 最大レベルは建設不可
  state.infrastructure[target.id] = SUPPLY.INFRA_MAX;
  mgr.refresh();
  const maxed = mgr.enqueue(target.id, 'infrastructure');
  assert.equal(maxed.ok, false);
  assert.match(maxed.reason, /最大レベル/);

  // 自国以外の州は建設不可
  const foreign = PROVINCES.find((p) => p.tag !== 'GER');
  const denied = mgr.enqueue(foreign.id, 'infrastructure');
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /自国/);
});

test('建設キャンセルで予約が取り消される', () => {
  mem.clear();
  const state = makeState();
  const mgr = installSupplySystem(state);
  const target = PROVINCES.find((p) => p.tag === 'GER' && !p.capital);
  const r = mgr.enqueue(target.id, 'supply_hub');
  assert.equal(r.ok, true);
  const cancel = mgr.cancel(r.order.id);
  assert.equal(cancel.ok, true);
  assert.equal(state.constructionQueue.length, 0);
  assert.equal(mgr.usedSlots(target.id), 0);
});

test('補給レベルは localStorage に保存され、別の GameState で復元される', () => {
  mem.clear();
  const state = makeState();
  const mgr = installSupplySystem(state);
  const target = 'ger_hamburg';
  mgr.setInfra(target, 5);
  mgr.setHub(target, 2);
  assert.equal(JSON.parse(mem.get('hoi4.supplyNetwork.v1')).infra[target], 5);

  const state2 = makeState();
  const mgr2 = installSupplySystem(state2);
  assert.equal(mgr2.infra(target), 5);
  assert.equal(mgr2.hubLevel(target), 2);
  const levels = supplyLevelsJSON(state2);
  assert.equal(levels.infrastructure[target], 5);
  assert.equal(levels.hubs[target], 2);
});

test('建設定義（最大レベル・工期）が妥当', () => {
  assert.equal(SUPPLY_BUILDINGS.infrastructure.maxLevel, 5);
  assert.equal(SUPPLY_BUILDINGS.supply_hub.maxLevel, 3);
  assert.ok(SUPPLY_BUILDINGS.infrastructure.daysFor(0) > 0);
  assert.ok(SUPPLY_BUILDINGS.supply_hub.daysFor(2) > SUPPLY_BUILDINGS.supply_hub.daysFor(0));
  assert.equal(PROVINCE_BY_ID['ger_berlin'].capital, true);
});
