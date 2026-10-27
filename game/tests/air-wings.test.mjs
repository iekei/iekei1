/**
 * tests/air-wings.test.mjs — 航空隊・航空基地・空域任務（CAS / 戦略爆撃）の回帰テスト
 *
 * 実行: node --test game/tests/air-wings.test.mjs
 * 依存: DOM 不要（localStorage だけスタブする）
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Bus } from '../js/util.js';
import { GameState } from '../js/state.js';
import { PROVINCES, PROVINCE_BY_ID } from '../js/map-data.js';
import {
  AIRBASE, AIR_WING_TYPES, AIR_MISSIONS, ENEMY_AIR_POWER,
  AirWingManager, installAirWingSystem, wingStrength, supremacyStatus,
} from '../js/air-wings.js';
import { installSupplySystem } from '../js/supply.js';
import { BattlePlanManager } from '../js/battle-plan.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

function makeState({ withSupply = true, clear = true } = {}) {
  if (clear) mem.clear();
  const state = new GameState();
  state.bus = new Bus();
  state.divisions = [];
  state.constructionQueue = [];
  state.playerTag = 'GER';
  if (withSupply) installSupplySystem(state);
  return state;
}

const capitalBase = () => PROVINCES.find((p) => p.tag === 'GER' && p.capital).id;

/* ============================================================
 * 初期化・編成
 * ========================================================== */

test('初期化で首都に航空隊と航空基地が用意され、二重インストールされない', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  assert.ok(mgr instanceof AirWingManager);
  assert.equal(installAirWingSystem(state), mgr);

  const cap = capitalBase();
  assert.ok(mgr.airbaseLevel(cap) >= 3);
  const wings = mgr.wings();
  assert.equal(wings.length, 2);
  assert.deepEqual(wings.map((w) => w.type).sort(), ['cas', 'fighter']);
  for (const w of wings) {
    assert.equal(w.baseProvince, cap);
    assert.ok(w.count > 0);
    assert.ok(w.training >= 0 && w.training <= 100);
    assert.ok(w.readiness > 0 && w.readiness <= 100);
  }

  const sum = mgr.summary();
  assert.equal(sum.wings, 2);
  assert.equal(sum.aircraft, wings.reduce((n, w) => n + w.count, 0));
  assert.ok(sum.bases >= 1);
  assert.equal(Object.keys(state.airRegions).length, 5);
});

test('航空隊の編成は備蓄と基地容量の範囲で切り詰められる', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const cap = capitalBase();
  const stockBefore = mgr.availableAircraft('fighter');
  const free = mgr.baseFree(cap);
  assert.ok(free > 0);

  const r = mgr.createWing({ type: 'fighter', count: free + 500, baseProvince: cap });
  assert.equal(r.ok, true);
  assert.equal(r.wing.count, free, '空き容量までに制限');
  assert.equal(r.clamped, true);
  assert.equal(mgr.availableAircraft('fighter'), stockBefore - free, '備蓄から消費');
  assert.equal(mgr.usedCapacity(cap), sumCounts(mgr, cap));
  assert.ok(mgr.usedCapacity(cap) <= mgr.baseCapacity(cap));

  // 空き容量が無い基地では編成できない
  const full = mgr.createWing({ type: 'fighter', count: 10, baseProvince: cap });
  assert.equal(full.ok, false);
  assert.match(full.reason, /容量/);

  // 航空基地のない州では編成できない
  const noBase = PROVINCES.find((p) => p.tag === 'GER' && mgr.airbaseLevel(p.id) === 0);
  if (noBase) {
    const r2 = mgr.createWing({ type: 'fighter', count: 10, baseProvince: noBase.id });
    assert.equal(r2.ok, false);
    assert.match(r2.reason, /航空基地/);
  }

  // 他国の州は不可
  const foreign = PROVINCES.find((p) => p.tag !== 'GER');
  const r3 = mgr.createWing({ type: 'fighter', count: 10, baseProvince: foreign.id });
  assert.equal(r3.ok, false);
  assert.match(r3.reason, /自国/);
});

function sumCounts(mgr, provinceId) {
  return mgr.wings().filter((w) => w.baseProvince === provinceId).reduce((n, w) => n + w.count, 0);
}

test('航空隊は任意の自国航空基地へ移動でき、容量不足なら拒否される', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const cap = capitalBase();
  const ruhr = PROVINCE_BY_ID['ger_ruhr'];
  mgr.setAirbaseLevel(ruhr.id, 2);

  const wing = mgr.wings()[0];
  const moved = mgr.moveWing(wing.id, ruhr.id);
  assert.equal(moved.ok, true);
  assert.equal(wing.baseProvince, ruhr.id);
  assert.ok(wing.readiness < 100, '移動で稼働率が下がる');

  // 容量 200 を超える移動は不可
  mgr.setAirbaseLevel(ruhr.id, 1);
  const big = mgr.wings()[1];
  const denied = mgr.moveWing(big.id, ruhr.id);
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /容量/);

  // 自国以外へは移動できない
  const foreign = PROVINCES.find((p) => p.tag !== 'GER');
  const bad = mgr.moveWing(big.id, foreign.id);
  assert.equal(bad.ok, false);
});

/* ============================================================
 * 空域の制空権
 * ========================================================== */

test('空域の制空権は自軍と敵軍の割合（合計100%）で表され、任務で上昇する', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const before = mgr.regionInfo('eur_west');
  assert.equal(before.ownPct + before.enemyPct, 100);
  assert.equal(before.enemyPower, mgr.enemyAirPower('eur_west'));
  assert.ok(ENEMY_AIR_POWER.eur_west > 0);

  for (const w of mgr.wings()) mgr.setMission(w.id, 'eur_west', 'air_superiority');
  const after = mgr.regionInfo('eur_west');
  assert.ok(after.ownPower > before.ownPower);
  assert.ok(after.ownPct > before.ownPct);
  assert.equal(after.ownPct + after.enemyPct, 100);
  assert.equal(after.supWings, 2);
  assert.equal(supremacyStatus(after.ownPct), after.status);
  assert.ok(['green', 'yellow', 'red'].includes(after.status));

  // 制空任務は訓練任務より制空権に寄与する
  const target = mgr.wings()[0];
  const asSup = wingStrength(target) * AIR_WING_TYPES[target.type].airAttack * AIR_MISSIONS.air_superiority.airWeight;
  mgr.setMission(target.id, 'eur_west', 'training');
  const trained = mgr.regionInfo('eur_west');
  assert.ok(trained.ownPower < after.ownPower);
  assert.ok(asSup > 0);

  // 任務解除で寄与が消える
  mgr.setMission(target.id, null, null);
  assert.equal(mgr.wings()[0].mission, null);
  assert.equal(mgr.wings()[0].region, null);
});

test('航空戦力の計算に練度・稼働率が反映される', () => {
  const wing = { count: 100, training: 100, readiness: 100 };
  const strong = wingStrength(wing);
  const weak = wingStrength({ ...wing, training: 0, readiness: 0 });
  assert.ok(strong > weak);
  assert.equal(Math.round(strong), 100);
  assert.ok(weak < 50);
});

/* ============================================================
 * CAS（戦闘連動）
 * ========================================================== */

test('CAS 任務の航空隊は射程内の戦闘に攻撃力ボーナスと直接ダメージを与える', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const casWing = mgr.wings().find((w) => w.type === 'cas');
  mgr.setAirbaseLevel('ger_ruhr', 2);
  assert.equal(mgr.moveWing(casWing.id, 'ger_ruhr').ok, true);
  assert.equal(mgr.setMission(casWing.id, 'eur_west', 'cas').ok, true);

  const support = mgr.battleSupport('fra_paris');
  assert.ok(support, 'パリはルール地方の CAS 射程内');
  assert.ok(support.bonus > 0 && support.bonus <= 0.30);
  assert.ok(support.damage > 0);
  assert.equal(support.wingCount, 1);
  assert.equal(support.ownPct + support.enemyPct, 100);

  // 射程外（モスクワ）には支援が届かない
  assert.equal(mgr.battleSupport('sov_moscow'), null);

  // 作戦計画の戦闘に反映される
  const bp = new BattlePlanManager(state);
  const plan = bp.createPlan({ name: 'CAS テスト' });
  const div = {
    id: 'div-cas-1', provinceId: 'ger_ruhr', tag: 'GER', type: 'infantry',
    name: 'テスト歩兵', org: 50, maxOrg: 50, hp: 100, maxHp: 100, supply: 1,
  };
  state.divisions.push(div);
  const paris = PROVINCE_BY_ID['fra_paris'];
  const battle = bp._startBattle(plan, paris, bp._defenseStrength(paris), div);

  const withoutCas = bp._attackerPower(plan, battle, null);
  const withCas = bp._attackerPower(plan, battle, support);
  assert.ok(withCas > withoutCas, 'CAS で攻撃力が上がる');
  const expected = withoutCas * (1 + support.bonus);
  assert.ok(Math.abs(withCas - expected) < 0.001);

  const orgBefore = battle.defender.org;
  bp.tick(1);
  assert.equal(battle.cas?.wingCount, 1);
  assert.ok(battle.defender.org < orgBefore, 'CAS の直接ダメージで防御側組織力が減る');
  assert.ok(battle.casDamage > 0);
  const bubble = state.combatBubbles.find((b) => b.province === 'fra_paris');
  assert.ok(bubble?.cas, '戦闘バブルに CAS 情報が載る');
});

test('CAS の効果は制空権が高いほど大きい', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const casWing = mgr.wings().find((w) => w.type === 'cas');
  mgr.setAirbaseLevel('ger_ruhr', 2);
  mgr.moveWing(casWing.id, 'ger_ruhr');
  mgr.setMission(casWing.id, 'eur_west', 'cas');
  const weak = mgr.battleSupport('fra_paris');

  // 制空任務の航空隊を大量に追加して制空権を上げる
  for (const w of mgr.wings()) {
    if (w.type === 'fighter') mgr.setMission(w.id, 'eur_west', 'air_superiority');
  }
  mgr.setAirbaseLevel('ger_ruhr', 5);
  mgr.state.stockpile.fighter_equipment_1 = 5000;
  for (let i = 0; i < 4; i++) mgr.createWing({ type: 'fighter', count: 100, baseProvince: 'ger_ruhr' });
  for (const w of mgr.wings()) {
    if (w.type === 'fighter') mgr.setMission(w.id, 'eur_west', 'air_superiority');
  }
  const strong = mgr.battleSupport('fra_paris');
  assert.ok(strong.ownPct > weak.ownPct);
  assert.ok(strong.damage >= weak.damage);
});

/* ============================================================
 * 戦略爆撃
 * ========================================================== */

test('戦略爆撃は敵州のインフラを破壊し、履歴を残す', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  state.stockpile.strat_bomber_equipment_1 = 5000;
  mgr.setAirbaseLevel(capitalBase(), 5);
  const r = mgr.createWing({ type: 'strategic_bomber', count: 200, baseProvince: capitalBase() });
  assert.equal(r.ok, true);
  assert.equal(mgr.setMission(r.wing.id, 'eur_east', 'strategic_bombing').ok, true);

  const info = mgr.regionInfo('eur_east');
  assert.ok(info.strategicPower > 0);
  const moscow = PROVINCE_BY_ID['sov_moscow'];
  delete moscow.airDamage;
  delete moscow.factoryDamage;
  const infraBefore = state.infrastructure[moscow.id];
  assert.ok(infraBefore > 0);

  let bombed = 0;
  for (let i = 0; i < 80 && !bombed; i++) {
    state.tickCount += 6;
    bombed = mgr.tick(6).bombed;
    if (bombed) break;
  }
  assert.ok(bombed >= 1, '戦略爆撃で目標が破壊される');
  const destroyed = state.airBombings[0];
  assert.ok(['infrastructure', 'factory', 'airbase'].includes(destroyed.destroyed));
  const target = PROVINCE_BY_ID[destroyed.provinceId];
  assert.ok([state.infrastructure[target.id], mgr.airbaseLevel(target.id)].some((v) => Number.isFinite(v)));
  assert.ok(state.infrastructure[moscow.id] <= infraBefore);

  // 制空権が無い空域では爆撃力が落ちる（係数に反映される）
  assert.ok(info.ownPct < 100);
  assert.ok(mgr.regionInfo('eur_east').strategicPower > 0);
});

test('爆撃被害が 100% に達するとレベルが 1 段階破壊される', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const moscow = PROVINCE_BY_ID['sov_moscow'];
  delete moscow.airDamage;
  delete moscow.factoryDamage;
  const infraBefore = state.infrastructure[moscow.id];
  const factoriesBefore = mgr.factoryCount(moscow.id);
  const hit = mgr.bombProvince(moscow, 2000, 6);
  assert.equal(hit, false);
  assert.ok(moscow.airDamage > 0);
  assert.ok(moscow.factoryDamage > 0);
  // さらに爆撃して破壊まで
  let destroyed = false;
  for (let i = 0; i < 100 && !destroyed; i++) destroyed = mgr.bombProvince(moscow, 2000, 6);
  assert.equal(destroyed, true);
  assert.ok(
    state.infrastructure[moscow.id] < infraBefore || mgr.factoryCount(moscow.id) < factoriesBefore,
    'インフラか工場のどちらかが破壊される',
  );
  assert.ok(state.airBombings.length >= 1);

  // 工場も破壊できる
  let factoryHit = state.airBombings.some((b) => b.destroyed === 'factory');
  for (let i = 0; i < 200 && !factoryHit; i++) {
    factoryHit = mgr.bombProvince(moscow, 2000, 6);
    if (factoryHit) factoryHit = state.airBombings.some((b) => b.destroyed === 'factory');
  }
  assert.equal(factoryHit, true, '戦略爆撃で工場が破壊される');
});

/* ============================================================
 * Tick（練度 / 稼働率 / 消耗）
 * ========================================================== */

test('訓練任務で練度が上がり、出撃中は稼働率が下がり、待機で回復する', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const wing = mgr.wings()[0];
  const training0 = wing.training;

  mgr.setMission(wing.id, 'eur_west', 'training');
  mgr.tick(20);
  assert.ok(wing.training > training0, '訓練で練度上昇');
  assert.ok(wing.readiness >= 99, '待機任務なので稼働率は維持');

  mgr.setMission(wing.id, 'eur_west', 'air_superiority');
  const ready0 = wing.readiness;
  mgr.tick(30);
  assert.ok(wing.readiness < ready0, '出撃で稼働率低下');

  mgr.setMission(wing.id, null, null);
  const ready1 = wing.readiness;
  mgr.tick(30);
  assert.ok(wing.readiness > ready1, '待機で稼働率回復');
});

test('敵制空権が高い空域では航空機の損失が出る', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  // 敵が圧倒的に強い空域で制空任務
  const wing = mgr.wings()[0];
  mgr.setMission(wing.id, 'eur_east', 'air_superiority');
  const count0 = wing.count;
  let losses = 0;
  for (let i = 0; i < 40; i++) losses += mgr.tick(6).losses;
  assert.ok(losses > 0, '損失が発生する');
  assert.ok(wing.count < count0);
  assert.ok(losses >= 1);
});

/* ============================================================
 * 航空基地の建設
 * ========================================================== */

test('航空基地は建設キューで Lv を上げられ、完成時に収容力が増える', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const hamburg = PROVINCE_BY_ID['ger_hamburg'];
  const before = mgr.airbaseLevel(hamburg.id);
  assert.ok(before < AIRBASE.MAX_LEVEL);

  const chk = mgr.canBuildBase(hamburg.id);
  assert.equal(chk.ok, true);
  assert.equal(chk.targetLevel, before + 1);
  assert.ok(chk.days > 0);

  const queued = mgr.enqueueBase(hamburg.id);
  assert.equal(queued.ok, true);
  assert.equal(state.constructionQueue.length, 1);
  assert.equal(state.constructionQueue[0].type, 'air_base');
  assert.equal(state.constructionQueue[0].provinceId, hamburg.id);
  assert.equal(state.constructionQueue[0].usesCiv, true);

  // 二重予約は不可
  const dup = mgr.enqueueBase(hamburg.id);
  assert.equal(dup.ok, false);
  assert.match(dup.reason, /既に建設予約/);

  const capacityBefore = mgr.baseCapacity(hamburg.id);
  const order = state.constructionQueue.shift();
  assert.equal(mgr.completeConstruction(order), before + 1);
  assert.equal(mgr.airbaseLevel(hamburg.id), before + 1);
  assert.equal(mgr.baseCapacity(hamburg.id), capacityBefore + AIRBASE.CAPACITY_PER_LEVEL);

  // 最大レベルでは建設不可
  mgr.setAirbaseLevel(hamburg.id, AIRBASE.MAX_LEVEL);
  const maxed = mgr.enqueueBase(hamburg.id);
  assert.equal(maxed.ok, false);
  assert.match(maxed.reason, /最大/);

  // 他国は建設不可
  const foreign = PROVINCES.find((p) => p.tag !== 'GER');
  assert.equal(mgr.canBuildBase(foreign.id).ok, false);
});

/* ============================================================
 * 保存
 * ========================================================== */

test('航空隊・航空基地の状態は localStorage に保存され復元される', () => {
  const state = makeState();
  const mgr = installAirWingSystem(state);
  const cap = capitalBase();
  mgr.setAirbaseLevel('ger_munich', 4);
  const wing = mgr.wings()[0];
  mgr.setMission(wing.id, 'eur_west', 'air_superiority');
  wing.training = 77;
  mgr.save();

  const state2 = makeState({ clear: false });
  const mgr2 = installAirWingSystem(state2);
  assert.equal(mgr2.airbaseLevel('ger_munich'), 4);
  const restored = mgr2.wings();
  assert.equal(restored.length, 2);
  const same = restored.find((w) => w.id === wing.id);
  assert.ok(same, '同じ ID の航空隊が復元される');
  assert.equal(same.mission, 'air_superiority');
  assert.equal(same.region, 'eur_west');
  assert.equal(Math.round(same.training), 77);
  assert.equal(same.count, wing.count);
});

/* ============================================================
 * 表示ラベル
 * ========================================================== */

test('制空権の状態ラベルは 65% / 45% で切り替わる', () => {
  assert.equal(supremacyStatus(80), 'green');
  assert.equal(supremacyStatus(65), 'green');
  assert.equal(supremacyStatus(64), 'yellow');
  assert.equal(supremacyStatus(45), 'yellow');
  assert.equal(supremacyStatus(44), 'red');
  assert.equal(AIRBASE.MAX_LEVEL, 5);
  assert.equal(AIRBASE.CAPACITY_PER_LEVEL, 100);
});
