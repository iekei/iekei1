'use strict';
// 依存なしテスト: air-naval-design.js (BBA 機体設計 / MtG 艦艇設計 / 司令官カード / 作戦半径)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '../assets/air-naval-design.js'), 'utf8');

/**
 * モジュールを独立したコンテキストへ読み込み、グローバルを差し替えられるようにする。
 * (ゲーム本体と同じく AirForce / NavalForce 等を後から注入できる)
 */
function load(globals = {}) {
  const context = vm.createContext(Object.assign({
    console,
    Math,
    JSON,
    Date,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Set,
    Map,
    isFinite,
    parseInt,
    parseFloat
  }, globals));
  vm.runInContext(SOURCE + '\n;globalThis.__AND = AirNavalDesign;', context, { filename: 'air-naval-design.js' });
  return context;
}

function sandbox(globals = {}) {
  const ctx = load(globals);
  ctx.window = ctx;
  return { ctx, AND: ctx.__AND };
}

// ==========================================================
// BBA: 機体設計
// ==========================================================
test('air frames expose BBA slot counts and engine/payload caps', () => {
  const { AND } = sandbox();
  assert.deepEqual(Array.from(Object.keys(AND.FRAMES)), ['small', 'medium', 'large']);
  assert.equal(AND.FRAMES.small.slots.engine, 1);
  assert.equal(AND.FRAMES.large.slots.engine, 4);
  const small = AND.airStats('small', { engine: ['single'], weapon: ['heavy_mg'], aux: [] });
  const large = AND.airStats('large', { engine: ['quad'], weapon: ['bomb_rack_heavy'], aux: ['bombsight'] });
  assert.equal(small.speed > large.speed, true, '小型機の方が高速');
  assert.equal(large.payloadCap > small.payloadCap, true, '大型機の方がペイロード上限が高い');
});

test('发动机与载荷: 4発エンジンは大型機体のみ / ペイロード超過を検出', () => {
  const { AND } = sandbox();
  const quadSmall = AND.validateAir('small', { engine: ['quad'], weapon: ['heavy_mg'], aux: [] });
  assert.equal(quadSmall.ok, false);
  assert.ok(quadSmall.errors.some(e => e.includes('搭載できません')));
  const noEngine = AND.validateAir('medium', { engine: [], weapon: ['heavy_mg'], aux: [] });
  assert.equal(noEngine.ok, false);
  assert.ok(noEngine.errors.some(e => e.includes('エンジンは必須')));
  const smallHeavy = AND.validateAir('small', { engine: ['single'], weapon: ['bomb_rack_heavy'], aux: [] });
  assert.equal(smallHeavy.ok, false);
  const ok = AND.validateAir('large', { engine: ['quad'], weapon: ['bomb_rack_heavy'], aux: ['bombsight'] });
  assert.equal(ok.ok, true, ok.errors.join(','));
});

test('落下型増槽で作戦半径 km が伸び、防御装甲で速度が落ちる', () => {
  const { AND } = sandbox();
  const base = AND.airStats('small', { engine: ['single'], weapon: ['light_mg'], aux: [] });
  const tank = AND.airStats('small', { engine: ['single'], weapon: ['light_mg'], aux: ['drop_tank'] });
  assert.ok(tank.rangeKm > base.rangeKm, '増槽で航続距離 +');
  assert.ok(tank.speed <= base.speed, '増槽で速度は低下しない〜同等');
  const armored = AND.airStats('small', { engine: ['single'], weapon: ['light_mg'], aux: ['armor_plate'] });
  assert.ok(armored.defense > base.defense);
  assert.ok(armored.speed < base.speed);
});

test('任務はモジュールから動的導出: 機銃→制空 / 爆弾+ダイブブレーキ→CAS / 爆弾倉→戦略+核', () => {
  const { AND } = sandbox();
  const fighter = AND.airStats('small', { engine: ['single'], weapon: ['heavy_mg'], aux: [] });
  assert.deepEqual(Array.from(fighter.missions), ['air_sup']);
  const cas = AND.airStats('medium', { engine: ['twin'], weapon: ['bomb_rack_light'], aux: ['dive_brake'] });
  assert.ok(cas.missions.includes('ground'));
  assert.equal(cas.missions.includes('strategic'), false);
  const bomber = AND.airStats('large', { engine: ['quad'], weapon: ['bomb_rack_heavy'], aux: ['bombsight'] });
  assert.ok(bomber.missions.includes('strategic'));
  assert.equal(bomber.nuclear, false, '大型爆弾倉が無ければ核攻撃不可');
  const nuke = AND.airStats('large', { engine: ['quad'], weapon: ['bomb_bay_large'], aux: ['bombsight'] });
  assert.equal(nuke.nuclear, true);
  assert.ok(nuke.missions.includes('nuclear'));
  // 小型機体 + 大型爆弾倉は設計エラー
  const bad = AND.validateAir('small', { engine: ['single'], weapon: ['bomb_bay_large'], aux: [] });
  assert.equal(bad.ok, false);
});

// ==========================================================
// MtG: 艦艇設計
// ==========================================================
test('sea hulls cover 小型/大型/潜水艦 with slot modules', () => {
  const { AND } = sandbox();
  assert.deepEqual(Array.from(Object.keys(AND.HULLS)), ['small', 'large', 'sub']);
  assert.ok(AND.HULLS.small.slots.main >= 1);
  assert.ok(AND.HULLS.large.slots.deck >= 1);
  assert.ok(AND.HULLS.sub.slots.torp >= 1);
  const dd = AND.seaStats('small', { main: ['main_light'], torp: ['torpedo_tubes'], aa: ['aa_gun'], depth: ['depth_charges'], engine: ['engine_boiler'], radar: ['radar'] });
  const bb = AND.seaStats('large', { main: ['main_heavy'], secondary: ['secondary'], aa: ['aa_gun', 'aa_gun'], engine: ['engine_boiler'], radar: ['radar'] });
  assert.ok(bb.firepower > dd.firepower, '戦艦の火力が上');
  assert.ok(dd.torpedo > 0 && dd.asw > 0, '駆逐艦は魚雷と爆雷');
  const cv = AND.seaStats('large', { main: ['main_medium'], deck: ['flight_deck'], aa: ['aa_gun'] });
  assert.equal(cv.deck, 40, '飛行甲板で搭載機数');
});

test('海軍モジュール制限: 戦艦主砲は大型船体のみ / 飛行甲板は大型のみ / ソナーは潜水艦', () => {
  const { AND } = sandbox();
  const heavyOnSmall = AND.validateSea('small', { main: ['main_heavy'] });
  assert.equal(heavyOnSmall.ok, false);
  const deckOnSmall = AND.validateSea('small', { deck: ['flight_deck'] });
  assert.equal(deckOnSmall.ok, false);
  const ok = AND.validateSea('large', { main: ['main_heavy', 'main_medium'], deck: ['flight_deck'] });
  assert.equal(ok.ok, true, ok.errors.join(','));
  const sub = AND.seaStats('sub', { torp: ['torpedo_tubes', 'torpedo_tubes'], sonar: ['sonar'], engine: ['engine_boiler'] });
  assert.ok(sub.torpedo >= 44);
  assert.ok(sub.subDetection >= 24);
});

// ==========================================================
// 司令官カード
// ==========================================================
test('カードパックの将軍 traits がパッシブへ変換される', () => {
  const { AND } = sandbox();
  const dowding = AND.cardBonus({ id: 'dowding', branch: 'air', traits: ['air_commander', 'fighter_general'], stats: {} });
  assert.ok(dowding.superiority >= 0.3, '制空権補正が積み上がる');
  assert.ok(dowding.labels.length >= 1);
  const hartmann = AND.cardBonus({ id: 'hartmann', branch: 'air', traits: ['ace', 'fighter_ace'], stats: { attack: 1 } });
  assert.ok(hartmann.cas >= 0.3);
  const donitz = AND.cardBonus({ id: 'dönitz', branch: 'navy', traits: ['submarine_specialist', 'naval_commander'], stats: {} });
  assert.ok(donitz.subAttack >= 0.3, '潜水艦攻撃力 +30%');
  const raeder = AND.cardBonus({ id: 'raeder', branch: 'navy', traits: ['naval_commander'], stats: {} });
  assert.ok(raeder.retreat >= 0.15, '全艦退避速度 +15%');
  const tedder = AND.cardBonus({ id: 'tedder', branch: 'air', traits: ['air_commander'], stats: {} });
  assert.ok(tedder.rangeKm >= 100, '作戦半径 +100km');
  const cunningham = AND.cardBonus({ id: 'cunningham', branch: 'navy', traits: [], stats: {} });
  assert.ok(cunningham.detection >= 0.25, '哨戒発見率 +25%');
});

test('司令官スロットは雇用済みカードのみ・系統違いを拒否する', () => {
  const calls = [];
  const { ctx, AND } = sandbox({
    CoreEngine: { gameState: { country: 'GER', strategy: {}, atWar: [] }, log: (t) => calls.push(t) },
    GameUI: { notify: () => {}, closeModal: () => {} },
    CardSystem: { hiredCards: [
      { id: 'dowding', name: 'ダウディング', branch: 'air', traits: ['fighter_general'], stats: {} },
      { id: 'dönitz', name: 'デーニッツ', branch: 'navy', traits: ['submarine_specialist'], stats: {} }
    ] }
  });
  assert.equal(AND.commanderPool('air').length, 1);
  assert.equal(AND.commanderPool('navy').length, 1);
  assert.equal(AND.assignCommander('air', 'air1', 'dönitz'), false, '海軍将軍は空軍スロットに置けない');
  assert.equal(AND.assignCommander('air', 'air1', 'dowding'), true);
  const data = AND.data();
  assert.equal(data.cmd.air.air1, 'dowding');
  assert.equal(AND.assignCommander('air', 'air1', null), true);
  assert.equal(AND.data().cmd.air.air1, undefined);
  assert.ok(calls.some(line => line.includes('司令官')));
});

// ==========================================================
// 作戦半径と任務効率
// ==========================================================
test('作戦半径: km → px 変換と、空域が円外へ出た割合による効率低下', () => {
  const { AND } = sandbox({
    CoreEngine: { gameState: { country: 'GER', strategy: {} } },
    AirForce: { CONFIG: { zoneRadius: 220 } },
    MapRenderer: { mapW: 4000 }
  });
  const wing = {
    id: 'air1', aircraftType: 'fighter', aircraftCount: 50, readiness: 100, experience: 0,
    base: [1000, 1000], zone: { x: 1100, y: 1000, pid: 1, sid: '1' }
  };
  const infoIn = AND.rangeInfo(wing);
  assert.equal(infoIn.factor, 1);
  assert.equal(infoIn.coverage, 1);
  assert.ok(Math.abs(AND.rangePx(wing) - AND.rangeKm(wing) * (450 / 1400)) < 0.001);
  // 半径のはるか外
  const far = { ...wing, zone: { x: 2500, y: 1000, pid: 2, sid: '2' } };
  const infoOut = AND.rangeInfo(far);
  assert.ok(infoOut.factor < 1);
  assert.equal(infoOut.factor >= 0.15, true);
  assert.ok(AND.efficiency(far) < 1);
  // 増槽設計で半径が伸び、同じ空域が圏内になる
  const d = AND.data();
  const design = AND.saveDesign('air', '長距離型', 'small', { engine: ['single'], weapon: ['light_mg'], aux: ['drop_tank'] });
  d.wing.air1 = design.key;
  assert.ok(AND.rangePx(wing) > infoIn.radius);
});

// ==========================================================
// 海軍ステータス補正
// ==========================================================
test('設計と提督が任務部隊ステータスへ反映される (魚雷/視界/速力)', () => {
  const ships = [{ id: 's1', type: 'submarine', hp: 80, maxHp: 80 }, { id: 's2', type: 'submarine', hp: 80, maxHp: 80 }];
  const tf = { id: 'nav1', ships: ['s1', 's2'], base: [0, 0], zone: null, mission: 'raid', executing: false };
  const { ctx, AND } = sandbox({
    CoreEngine: { gameState: { country: 'GER', strategy: {} } },
    NavalForce: {
      SHIPS: { submarine: { sub: true, label: '潜水艦' } },
      shipsOf: () => ships,
      tf: () => tf,
      tfs: () => [tf]
    },
    CardSystem: { hiredCards: [{ id: 'dönitz', name: 'デーニッツ', branch: 'navy', traits: ['submarine_specialist'], stats: {} }] }
  });
  const base = { count: 2, hp: 160, maxHp: 160, gun: 2, aa: 0, torpedo: 36, spot: 16, fuel: 1, planes: 0, speed: 18, subs: 2, screens: 0, capitals: 0 };
  const withCmd = (() => {
    AND.assignCommander('navy', 'nav1', 'dönitz');
    const mods = AND.seaMods(tf);
    return { mods, out: Object.assign({}, base, { torpedo: base.torpedo * mods.torpedo, spot: base.spot * mods.spot, speed: base.speed + mods.speed }) };
  })();
  assert.ok(withCmd.mods.torpedo >= 1.3, '潜水艦攻撃 +30%');
  assert.ok(withCmd.out.torpedo > base.torpedo);
  assert.ok(withCmd.out.speed > base.speed, '機関・ボイラーで速力 +');
  assert.ok(withCmd.mods.spot >= 1, 'レーダー/司令官で視界 +');
});

test('強襲上陸の必要制海権は MtG 準拠の 50%', () => {
  const { AND } = sandbox();
  assert.equal(AND.INVASION_SUPREMACY, 50);
});

// ==========================================================
// 補給切れ / 通商破壊
// ==========================================================
test('輸送船枯渇または制海権喪失で補給切れ状態になる', () => {
  const tf = { id: 'nav1', ships: [], zone: { x: 0, y: 0 }, executing: true };
  const state = { country: 'GER', atWar: ['GER', 'ENG'], strategy: {}, warSupport: 50 };
  const { ctx, AND } = sandbox({
    CoreEngine: { gameState: state, log: () => {} },
    TradeSystem: { convoyInfo: () => ({ efficiency: 0.05 }) },
    NavalForce: { tfs: () => [tf], superiority: () => ({ percent: 10 }), logEvent: () => {} },
    BattlePlanManager: { armies: [{ id: 'a1', divisions: [{ org: 40 }], executing: true }] },
    GameTools: { day: () => 3 },
    GameUI: { notify: () => {} }
  });
  const status = AND.supplyStatus();
  assert.equal(status.cut, true);
  assert.ok(status.reason.includes('輸送船') || status.reason.includes('制海権'));
  AND.applySupplyCut();
  assert.ok(state.strategy.airnaval.cut === true);
  // 戦争していなければ補給は止まらない
  state.atWar = ['GER'];
  const peace = AND.supplyStatus();
  assert.equal(peace.cut, false);
});

// ==========================================================
// 実行時フック (AirForce / BattlePlanManager / 核攻撃)
// ==========================================================
function gameStubs(overrides = {}) {
  const wing = {
    id: 'air1', type: 'air', name: '第1航空隊', aircraftType: 'fighter', aircraftCount: 100,
    readiness: 100, experience: 100, base: [1000, 1000], zone: { x: 1050, y: 1000, pid: 1, sid: '1' },
    mission: 'air_sup', executing: true, progress: 0
  };
  const gs = {
    country: 'GER', strategy: {}, atWar: ['GER', 'ENG'], nuclearStockpile: 2,
    stability: 50, warSupport: 50
  };
  const AirForce = {
    CONFIG: { zoneRadius: 220, casMax: 0.4 },
    MISSIONS: { air_sup: { id: 'air_sup', label: '制空' }, ground: { id: 'ground', label: 'CAS' }, strategic: { id: 'strategic', label: '戦略爆撃' } },
    AIRCRAFT: { fighter: { missions: ['air_sup', 'ground'] } },
    wings: () => [wing],
    wing: () => wing,
    zoneSid: () => '1',
    inZone: () => true,
    effective: (w) => w.aircraftCount * (w.readiness / 100) * (0.7 + 0.6 * (w.experience / 100)),
    superiority: () => ({ own: 100, enemy: 100, ratio: 0.5, percent: 50, level: 'advantage', enemyTags: [] }),
    casBonus: () => 0.2,
    strategicBombing: () => true,
    setMission: () => true,
    render: () => {},
    draw: () => {}
  };
  const BattlePlanManager = {
    selectedUnitId: 'air1', activeMission: { air: 'air_sup' }, missions: { air: [] },
    airRange: () => 450, renderPanel: () => {}, air: [wing]
  };
  const globals = {
    CoreEngine: { gameState: gs, registerTickCallback: () => {}, log: () => {} },
    AirForce, BattlePlanManager,
    MapRenderer: {
      ready: true, mapW: 4000, states: { '1': { name: 'テスト州', b: { infrastructure: 2, arms_factory: 1 }, owner: 'ENG' } },
      stateOf: () => '1', invalidateModes: () => {}, addNukeEffectAtState: () => {},
      cam: { scale: 1 }
    },
    GameUI: { notify: () => {}, closeModal: () => {} },
    GameTools: { escape: (v) => String(v), day: () => 1 },
    CardSystem: { hiredCards: [{ id: 'dowding', name: 'ダウディング', branch: 'air', traits: ['fighter_general'], stats: {} }] }
  };
  Object.assign(globals, overrides);
  return { globals, wing, AirForce, BattlePlanManager, gs };
}

test('AirForce フック: 司令官/設計が実効戦力・制空権・作戦半径へ即時反映', () => {
  const { globals, wing, AirForce, BattlePlanManager, gs } = gameStubs();
  const { AND } = sandbox(globals);
  const plain = AirForce.effective(wing);
  assert.ok(Math.abs(plain - 130) < 1e-6, '100機 × 稼働率1.0 × 練度1.3');
  AND.init();
  assert.equal(AirForce.MISSIONS.nuclear.id, 'nuclear');
  assert.ok(BattlePlanManager.missions.air.some(m => m.id === 'nuclear'));
  // 司令官 (制空権 +15%)
  AND.assignCommander('air', 'air1', 'dowding');
  const sup = AirForce.superiority('1');
  assert.ok(sup.own > 100, '自軍戦力が補正される');
  assert.ok(sup.percent > 50, '制空権 % が上がる');
  // 設計 (増槽) → 作戦半径 px が伸びる
  const before = BattlePlanManager.airRange(wing);
  const design = AND.saveDesign('air', '長距離戦闘機', 'small', { engine: ['single'], weapon: ['light_mg'], aux: ['drop_tank'] });
  AND.data().wing.air1 = design.key;
  const after = BattlePlanManager.airRange(wing);
  assert.ok(after > before, before + ' → ' + after);
  // 空域が圏外 → 実効戦力が落ちる
  wing.zone = { x: 1000 + after * 3, y: 1000, pid: 9, sid: '9' };
  assert.ok(AirForce.effective(wing) < plain + 1e-6);
});

test('核攻撃: 大型爆弾倉 + 核備蓄 + 制空権75% を満たすと実行できる', () => {
  const { globals, wing, gs } = gameStubs();
  const { AND } = sandbox(globals);
  AND.init();
  assert.equal(AND.nukeStatus(wing).ok, false, '初期設計では核攻撃不可');
  const design = AND.saveDesign('air', '核攻撃機', 'large', { engine: ['quad'], weapon: ['bomb_bay_large'], aux: ['bombsight'] });
  AND.data().wing.air1 = design.key;
  globals.AirForce.superiority = () => ({ own: 100, enemy: 10, ratio: 0.9, percent: 90, level: 'dominant', enemyTags: ['ENG'] });
  const status = AND.nukeStatus(wing);
  assert.equal(status.ok, true, JSON.stringify(status.requires));
  assert.equal(AND.launchNuke(wing), true);
  assert.equal(gs.nuclearStockpile, 1);
  assert.ok(globals.MapRenderer.states['1'].b.infrastructure <= 1);
});

test('戦略爆撃はインフラ/工場/要塞/原子炉を破壊対象にする', () => {
  const { globals, wing } = gameStubs();
  const { AND } = sandbox(globals);
  globals.MapRenderer.states['1'].b = { infrastructure: 3, bunker: 2, nuclear_reactor: 1 };
  const before = Object.values(globals.MapRenderer.states['1'].b).reduce((a, b) => a + b, 0);
  // 戦略爆撃機の設計を適用し、十分な戦力を渡して確率判定を回避
  const design = AND.saveDesign('air', '重爆', 'large', { engine: ['quad'], weapon: ['bomb_rack_heavy'], aux: ['bombsight'] });
  AND.data().wing.air1 = design.key;
  wing.aircraftCount = 400;
  let destroyed = false;
  for (let i = 0; i < 40 && !destroyed; i++) {
    destroyed = AND.strategicStrike(wing, '1', { ratio: 0.9 });
  }
  const after = Object.values(globals.MapRenderer.states['1'].b).reduce((a, b) => a + b, 0);
  assert.equal(destroyed, true);
  assert.ok(after < before);
});

// ==========================================================
// 既存「兵器設計」画面との連携 (画面の重複を作らない)
// ==========================================================
test('設計モーダルから既存の兵器設計画面を該当カテゴリで開ける', () => {
  const calls = [];
  const { AND } = sandbox({
    CoreEngine: { gameState: { country: 'GER', strategy: {} } },
    EquipmentDesigner: { setCategory: (c) => calls.push(['cat', c]), render: () => calls.push(['render']) },
    GameUI: { closeModal: () => calls.push(['close']), switchTab: (t) => calls.push(['tab', t]) }
  });
  assert.equal(AND.openEquipmentDesigner('air'), true);
  assert.deepEqual(Array.from(calls.find(c => c[0] === 'cat') || []), ['cat', 'plane']);
  assert.ok(calls.some(c => c[0] === 'tab' && c[1] === 'designer'), '兵器設計タブへ移動');
  calls.length = 0;
  AND.openEquipmentDesigner('sea');
  assert.deepEqual(Array.from(calls.find(c => c[0] === 'cat') || []), ['cat', 'ship']);
});
