/**
 * tests/systems.test.mjs — 4システム（作戦計画 / 国家方針報酬 / 兵器設計 / ドクトリン）の回帰テスト
 *
 * 実行: node --test game/tests/systems.test.mjs
 * 依存: Node 18+（DOM 不要。ロジック層のみを検証する）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GameState } from '../js/state.js';
import { EffectEngine } from '../js/effects.js';
import { DoctrineManager } from '../js/doctrine.js';
import { EquipmentDesigner } from '../js/designers.js';
import { BattlePlanManager, orderFrontline, isLandLink } from '../js/battle-plan.js';
import { PROVINCE_BY_ID, PROVINCES } from '../js/map-data.js';
import { MAJOR_FOCUSES } from '../js/data/major-focuses.js';
import {
  DOCTRINE_TREES, DOCTRINE_ROUTES, aggregateDoctrineEffects, findDoctrineNode,
} from '../js/data/doctrines.js';
import {
  TANK_CHASSIS, TANK_MODULES, NAVAL_HULLS, NAVAL_MODULES, AIRFRAMES, AIR_MODULES,
  requirementsOf, calcTankStats,
} from '../js/data/equipment.js';
import { CombatSimulator } from '../js/combat.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// テスト間の分離: プロヴィンス所有国はモジュール共有のため、各テスト前に初期値へ戻す
const ORIGINAL_PROVINCE_TAGS = new Map(PROVINCES.map((p) => [p.id, p.tag]));
const readTechIds = () => {
  const dir = path.join(ROOT, 'game', 'eng', 'tec', 'data');
  const ids = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    for (const t of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) ids.add(t.id);
  }
  return ids;
};

/* ======================================================================
   0. データ整合性: 研究アンロックに使う技術IDが実在するか
   ====================================================================== */

test('兵器設計の requires はすべて実在する技術IDを参照する', () => {
  const techIds = readTechIds();
  const missing = [];
  const check = (kind, slot, id) => {
    const reqs = requirementsOf(kind, slot, id);
    for (const r of reqs) if (!techIds.has(r)) missing.push(`${kind}:${slot}:${id} -> ${r}`);
  };
  for (const c of TANK_CHASSIS) check('tank', 'chassis', c.id);
  for (const [slot, list] of Object.entries(TANK_MODULES)) for (const m of list) check('tank', slot, m.id);
  for (const h of NAVAL_HULLS) check('naval', 'hull', h.id);
  for (const [slot, list] of Object.entries(NAVAL_MODULES)) for (const m of list) check('naval', slot, m.id);
  for (const a of AIRFRAMES) check('air', 'airframe', a.id);
  for (const [slot, list] of Object.entries(AIR_MODULES)) for (const m of list) check('air', slot, m.id);
  assert.deepEqual(missing, [], `未知の技術ID: ${missing.join(', ')}`);
});

test('ドクトリンのアイコンと前提ノードが整合している', () => {
  for (const [branch, nodes] of Object.entries(DOCTRINE_TREES)) {
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      const iconPath = path.join(ROOT, n.icon);
      assert.ok(fs.existsSync(iconPath), `アイコンがありません: ${n.icon}`);
      assert.ok(DOCTRINE_ROUTES[branch].some((r) => r.id === n.route), `ルート未定義: ${n.id}`);
      for (const req of n.requires || []) {
        assert.ok(ids.has(req), `前提ノードが存在しません: ${n.id} -> ${req}`);
      }
    }
  }
});

/* ======================================================================
   1. 国家方針（National Focus）の完了報酬
   ====================================================================== */

function makeGame() {
  for (const p of PROVINCES) p.tag = ORIGINAL_PROVINCE_TAGS.get(p.id);
  const state = new GameState();
  state.playerTag = 'GER';
  state.date = { y: 1936, m: 1, d: 1, h: 0 };
  state.tickCount = 0;
  state.divisions = [];
  state.ensureDivisions('GER', 8);
  const doctrine = new DoctrineManager(state);
  state._doctrineMgr = doctrine;
  const effects = new EffectEngine(state);
  state._politicsMgr = { integrate: () => false, createPuppet: () => false };
  return { state, doctrine, effects };
}

test('全国家方針に completion_reward があり、EffectEngine で例外なく実行できる', () => {
  const { state, effects } = makeGame();
  const all = Object.values(MAJOR_FOCUSES).flat();
  assert.ok(all.length >= 63);
  for (const node of all) {
    assert.ok(node.completion_reward && typeof node.completion_reward === 'object', `${node.id} に completion_reward がない`);
    effects.execute(node.completion_reward, { focus: node.id, tag: node.tag });
  }
  assert.deepEqual(state.unhandledEffects || [], [], '未対応エフェクトがある');
});

test('国家方針報酬: 政治力・工場・研究ボーナス・陸軍XP・宣戦事由', () => {
  const { state, doctrine, effects } = makeGame();
  const pp0 = state.pp;
  const civ0 = state.factories.civ;
  effects.execute(MAJOR_FOCUSES.GER[0].completion_reward, { focus: 'ger_focus_0' });
  assert.equal(state.pp, pp0 + 120);
  assert.equal(state.factories.civ, civ0 + 2);
  assert.ok(state.politics.spirits.some((s) => s.id === 'four_year_plan'));
  const rb = state.findResearchBonus('construction1', 'industry');
  assert.ok(rb && rb.reduction === 0.5, '工業研究 -50% のボーナスが付与されない');

  const xp0 = doctrine.xp('land');
  effects.execute(MAJOR_FOCUSES.GER[5].completion_reward, { focus: 'ger_focus_5' });
  assert.equal(doctrine.xp('land'), xp0 + 100);

  effects.execute(MAJOR_FOCUSES.GER[8].completion_reward, { focus: 'ger_focus_8' });
  assert.equal(state.warGoals.POL.justified, true);
});

test('国家方針報酬: 併合（Anschluss）で領土と工場を獲得する', () => {
  const { state, effects } = makeGame();
  const factories0 = state.factories.civ + state.factories.mil;
  assert.equal(PROVINCE_BY_ID.aus_vienna.tag, 'AUS');
  const ok = effects.annexCountry('AUS', { force: true });
  assert.equal(ok, true);
  assert.equal(PROVINCE_BY_ID.aus_vienna.tag, 'GER', 'オーストリアの州が移譲されていない');
  assert.ok(state.factories.civ + state.factories.mil > factories0);
  assert.ok(state.cores.has('AUS'));
});

test('研究ボーナスは研究日数を短縮し、完了時に消費される', () => {
  const { state, effects } = makeGame();
  effects.execute({ add_research_bonus: { scope: 'category', match: 'industry', reduction: 0.5, uses: 1 } });
  const bonus = state.findResearchBonus('construction1', 'industry');
  assert.ok(bonus);
  state.consumeResearchBonus(bonus.id);
  assert.equal(state.findResearchBonus('construction1', 'industry'), null, '使用済みボーナスが残っている');
});

/* ======================================================================
   2. 兵器設計（Equipment Designer）
   ====================================================================== */

test('研究状況に応じてモジュールがロックされ、研究後に装着できる', () => {
  const { state } = makeGame();
  state.researched = new Set(['basic_light_tank_chassis']);
  state.equipmentDesigns = { tank: [], naval: [], air: [] };
  const designer = new EquipmentDesigner(state);

  // 初期状態: 基本型中戦車は未研究
  assert.equal(designer.isUnlocked('tank', 'chassis', 'medium_1'), false);
  assert.equal(designer.setChassis('tank', 'medium_1').ok, false);
  assert.equal(designer.equip('tank', 'gun', 'medium_cannon').ok, false);
  const locked = designer.options('tank', 'gun').find((m) => m.id === 'medium_cannon');
  assert.equal(locked.unlocked, false);
  assert.ok(locked.lockedBy.includes('artillery1'));

  // 研究完了 → 解禁
  state.researched.add('basic_medium_tank_chassis');
  state.researched.add('artillery1');
  assert.equal(designer.setChassis('tank', 'medium_1').ok, true);
  const res = designer.equip('tank', 'gun', 'medium_cannon');
  assert.equal(res.ok, true);
  const stats = designer.tankStats();
  assert.ok(stats.softAttack > 0 && stats.productionCost > 0);
});

test('モジュール構成で最終ステータスが変化する', () => {
  const base = calcTankStats('medium_1', {});
  const heavy = calcTankStats('medium_1', {
    gun: 'heavy_cannon', turret: 'three_man_turret', suspension: 'torsion_bar',
    engine: 'diesel_engine', armor: 'sloped_armor', radio: 'improved_radio_set',
    special: ['smoke_launchers', 'additional_hmg'],
  });
  assert.ok(heavy.softAttack > base.softAttack, '主砲交換で対人攻撃力が上がる');
  assert.ok(heavy.hardAttack > base.hardAttack, '主砲交換で対装甲攻撃力が上がる');
  assert.ok(heavy.armor > base.armor, '装甲で装甲値が上がる');
  assert.ok(heavy.reliability >= 40 && heavy.reliability <= 97);
  assert.ok(heavy.productionCost > base.productionCost, '重装備で生産コストが上がる');
});

test('設計の保存とスロット上限（艦艇）', () => {
  const { state } = makeGame();
  state.researched = new Set(['early_ship_hull_light', 'sonar']);
  state.equipmentDesigns = { tank: [], naval: [], air: [] };
  const designer = new EquipmentDesigner(state);
  assert.equal(designer.setChassis('naval', 'destroyer_1').ok, true);
  // 駆逐艦の魚雷スロットは 2 まで
  designer.equip('naval', 'torpedo', 'torpedo_tubes');
  designer.equip('naval', 'torpedo', 'depth_charges');
  designer.equip('naval', 'torpedo', 'torpedo_tubes');
  assert.ok(designer.current.naval.modules.torpedo.length <= 2);
  const design = designer.saveNavalDesign('テスト駆逐艦');
  assert.equal(state.equipmentDesigns.naval.length, 1);
  assert.ok(design.stats.lightAttack > 0);
  assert.deepEqual(design.issues, []);
});

/* ======================================================================
   3. ドクトリン
   ====================================================================== */

test('ルートは相互排他で、選択後は他ルートのノードを取得できない', () => {
  const { state, doctrine } = makeGame();
  doctrine.addXP('land', 400);
  assert.deepEqual(doctrine.pickRoute('land', 'blitz'), { ok: true });

  const other = doctrine.canTake('land', 'land_mass_1');
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'route-locked');
  assert.equal(doctrine.canTake('land', 'land_blitz_1').ok, true);

  // ルート変更は不可逆
  assert.equal(doctrine.pickRoute('land', 'mass').ok, false);
});

test('XPを消費してノードを解禁し、グローバル補正が集計される', () => {
  const { state, doctrine } = makeGame();
  doctrine.pickRoute('land', 'gbp');
  doctrine.addXP('land', 800);
  const xp0 = doctrine.xp('land');
  const first = findDoctrineNode('land', 'land_gbp_1');
  const res = doctrine.take('land', 'land_gbp_1');
  assert.equal(res.ok, true);
  assert.equal(doctrine.xp('land'), xp0 - first.cost, 'XPが消費されていない');
  // 陸軍XP（state.xp.army）と共有されていること
  assert.equal(state.xp.army, doctrine.xp('land'));
  const eff = doctrine.effects('land');
  assert.ok(Math.abs(eff.defense - 0.10) < 1e-9, `防御補正が不正: ${eff.defense}`);
  assert.ok(Math.abs(eff.org - 0.10) < 1e-9);

  // 前提ノードが必要
  assert.equal(doctrine.canTake('land', 'land_gbp_3').reason, 'requires');
  doctrine.addXP('land', 400);
  assert.equal(doctrine.take('land', 'land_gbp_2a').ok, true);
  assert.equal(doctrine.take('land', 'land_gbp_2b').reason, 'exclusive');
  assert.equal(doctrine.take('land', 'land_gbp_3').ok, true);

  // 集計関数も同じ値を返す
  const agg = aggregateDoctrineEffects('land', doctrine.unlocked('land'));
  assert.ok(Math.abs(agg.defense - doctrine.effects('land').defense) < 1e-9);
});

test('ドクトリン補正は戦闘計算（組織力・攻撃力）に反映される', () => {
  const template = { name: '試験師団', stats: { softAttack: 30, hardAttack: 10, defense: 20, breakthrough: 10, maxOrg: 50, hp: 100, armor: 0, piercing: 10 } };
  const without = new CombatSimulator({ attacker: { template }, defender: { template }, terrain: 'plains', weather: 'clear', tactic: 'balanced' });
  const withDoc = new CombatSimulator({
    attacker: { template }, defender: { template }, terrain: 'plains', weather: 'clear', tactic: 'balanced',
    doctrine: { org: 0.2, soft: 0.5 }, planningBonus: 0.3,
  });
  assert.ok(withDoc.attacker.org > without.attacker.org);
  assert.ok(withDoc.attacker.soft > without.attacker.soft * 1.5);
});

/* ======================================================================
   4. 作戦計画
   ====================================================================== */

test('前線の自動生成と順序付け', () => {
  const { state } = makeGame();
  const bp = new BattlePlanManager(state, new DoctrineManager(state));
  const plan = bp.createPlan({ name: 'テスト計画' });
  assert.ok(plan.frontline.length >= 2, `前線が生成されない: ${plan.frontline}`);
  // 前線は自国（GER）の州のみ
  assert.ok(plan.frontline.every((id) => PROVINCE_BY_ID[id].tag === 'GER'),
    `前線に自国以外が含まれる: ${plan.frontline.map((id) => `${id}:${PROVINCE_BY_ID[id].tag}`)}`);
  // 前線は敵と隣接している
  const ordered = orderFrontline(plan.frontline);
  assert.deepEqual(ordered.sort(), [...plan.frontline].sort());
});

test('攻撃線の経路探索（Dijkstra）と海路リンクの除外', () => {
  const { state } = makeGame();
  const bp = new BattlePlanManager(state, new DoctrineManager(state));
  const plan = bp.createPlan();
  bp.autoFrontline(plan.id);
  const res = bp.addGoal(plan.id, 'pol_warsaw');
  assert.equal(res.ok, true, `攻撃線が引けない: ${res.reason}`);
  assert.equal(res.goal.path[0], res.goal.fromId);
  assert.equal(res.goal.path[res.goal.path.length - 1], 'pol_warsaw');
  // 経路上の全リンクが陸路
  for (let i = 0; i < res.goal.path.length - 1; i++) {
    assert.ok(isLandLink(res.goal.path[i], res.goal.path[i + 1]), '海路リンクが経路に含まれている');
  }
  // 大洋を隔てた地域（日本）へは陸路で到達できない
  const tokyo = bp.addGoal(plan.id, 'jap_tokyo');
  assert.equal(tokyo.ok, false);
  assert.equal(tokyo.reason, 'no-path');
});

test('計画準備ボーナスは時間経過で増加し、実行中は減衰する', () => {
  const { state } = makeGame();
  const doctrine = new DoctrineManager(state);
  const bp = new BattlePlanManager(state, doctrine);
  const plan = bp.createPlan();
  bp.assignDivisions(plan.id);
  bp.addGoal(plan.id, 'pol_warsaw');

  bp.tick(24 * 3); // 3日
  const afterPrepare = plan.planning;
  assert.ok(afterPrepare > 0.1, `計画準備が増えない: ${afterPrepare}`);
  assert.ok(afterPrepare <= bp.maxPlanningBonus() + 1e-9);

  bp.execute(plan.id);
  bp.tick(24);
  assert.ok(plan.planning < afterPrepare, '実行中に計画準備が減衰しない');
});

test('計画実行でAIが前進し、敵州を占領して前線が進む', () => {
  const { state } = makeGame();
  const doctrine = new DoctrineManager(state);
  const bp = new BattlePlanManager(state, doctrine);
  const plan = bp.createPlan();
  bp.assignDivisions(plan.id);
  const goal = bp.addGoal(plan.id, 'pol_warsaw');
  assert.equal(goal.ok, true);
  const xp0 = doctrine.xp('land');

  bp.tick(24 * 5); // 計画準備
  assert.equal(bp.execute(plan.id).ok, true);

  // 最大 240 日ぶんシミュレーション
  for (let i = 0; i < 240 * 24 && PROVINCE_BY_ID.pol_warsaw.tag !== 'GER'; i++) {
    bp.tick(1);
  }
  assert.equal(PROVINCE_BY_ID.pol_warsaw.tag, 'GER', 'ワルシャワが占領されていない');
  assert.ok(doctrine.xp('land') > xp0, '占領で陸軍XPが得られていない');
  assert.equal(state.divisions.filter((d) => d.provinceId === 'pol_warsaw').length > 0, true);

  // 占領した州が新しい前線として自動的に追加される（autoFront）
  bp.tick(1);
  assert.ok(plan.frontline.includes('pol_warsaw'), `前線が前進していない: ${plan.frontline}`);
});

test('作戦停止で戦闘が解除され、師団が待機に戻る', () => {
  const { state } = makeGame();
  const bp = new BattlePlanManager(state, new DoctrineManager(state));
  const plan = bp.createPlan();
  bp.assignDivisions(plan.id);
  bp.addGoal(plan.id, 'pol_warsaw');
  bp.execute(plan.id);
  bp.tick(24 * 10);
  bp.halt(plan.id);
  assert.equal(bp.battles.size, 0);
  assert.equal(plan.executing, false);
  assert.equal(state.combatBubbles.length, 0);
});
