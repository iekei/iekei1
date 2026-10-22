'use strict';

// HOI4 再現システム (作戦計画 / 国家方針報酬 / 兵器設計 / ドクトリン) の静的検証。
// ゲーム本体はブラウザ用のグローバルスクリプトなので、vm で読み込んで
// データ構造と計算ロジックだけを検証する。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function loadScripts(files, extra = {}) {
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    RegExp,
    Error,
    isFinite,
    Number,
    ...extra
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  files.forEach(file => vm.runInContext(read(file), sandbox, { filename: file }));
  return sandbox;
}

// 技術 ID の一覧 (全 TAG の tec/data を走査)
function knownTechIds() {
  const ids = new Set();
  for (const tag of fs.readdirSync(root)) {
    const dir = path.join(root, tag, 'tec', 'data');
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const list = Array.isArray(parsed) ? parsed : (parsed.technologies || []);
      list.forEach(tech => { if (tech && tech.id) ids.add(tech.id); });
    }
  }
  return ids;
}

function mapTags() {
  const states = JSON.parse(read('mapdata/states.json'));
  return new Set(Object.values(states).map(state => state && (state.owner || state.tag)).filter(Boolean));
}

/* ------------------------------ ドクトリン ------------------------------ */

test('doctrine data defines 42 nodes across land/naval/air with resolvable prerequisites', () => {
  const sandbox = loadScripts(['assets/doctrine-data.js']);
  const data = sandbox.window.DOCTRINE_DATA;
  assert.ok(data && data.branches, 'DOCTRINE_DATA must exist');
  const branches = Object.keys(data.branches);
  assert.deepEqual(branches.sort(), ['air', 'land', 'naval']);
  const nodes = branches.flatMap(key => data.branches[key].nodes);
  assert.equal(nodes.length, 42);
  assert.equal(new Set(nodes.map(node => node.id)).size, 42, 'node ids must be unique');

  for (const key of branches) {
    const branch = data.branches[key];
    assert.ok(branch.routes.length >= 3, key + ' must have at least 3 routes');
    for (const node of branch.nodes) {
      assert.ok(branch.routes.some(route => route.id === node.route), node.id + ' route must exist');
      assert.ok(Number(node.cost) >= 40, node.id + ' costs XP');
      assert.ok(fs.existsSync(path.join(root, node.icon)), node.id + ' icon must exist: ' + node.icon);
      for (const required of node.requires) {
        assert.ok(nodes.some(item => item.id === required), node.id + ' requires missing ' + required);
      }
    }
    for (const route of branch.routes) {
      assert.ok(fs.existsSync(path.join(root, route.icon)), route.icon + ' must exist');
    }
  }

  // 相互排他の分岐 (group) が存在する
  const groups = nodes.filter(node => node.group).map(node => node.group);
  assert.ok(groups.length >= 4, 'exclusive fork groups must exist');
});

/* ------------------------------ 国家方針報酬 ------------------------------ */

const KNOWN_REWARD_TYPES = new Set([
  'add_political_power', 'add_stability', 'add_war_support', 'add_command_power',
  'add_army_experience', 'add_navy_experience', 'add_air_experience', 'add_manpower',
  'add_ideas', 'remove_ideas', 'add_research_slot', 'add_tech_bonus',
  'add_building_construction', 'building', 'add_offsite_building',
  'annex_country', 'annex_target', 'occupy_country', 'create_wargoal', 'casus_belli',
  'add_world_tension', 'add_named_threat', 'add_threat', 'add_opinion'
]);

test('every national focus carries HOI4 completion rewards and a 70 day cost', () => {
  const tags = mapTags();
  let total = 0;
  for (const tag of ['ger', 'sov', 'usa', 'eng', 'fra', 'ita', 'jap']) {
    const dir = path.join(root, tag, 'data');
    const files = fs.readdirSync(dir).filter(file => /_nf_batch\d+\.json$/.test(file));
    assert.ok(files.length > 0, tag + ' focus batches must exist');
    for (const file of files) {
      const nodes = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const node of nodes) {
        total += 1;
        assert.equal(Number(node.cost), 70, node.id + ' must cost 70 days');
        assert.ok(Array.isArray(node.completion_rewards) && node.completion_rewards.length, node.id + ' needs rewards');
        for (const reward of node.completion_rewards) {
          assert.ok(KNOWN_REWARD_TYPES.has(reward.type), node.id + ' unknown reward ' + reward.type);
          if (reward.type === 'annex_country') {
            const list = Array.isArray(reward.country) ? reward.country : [reward.country];
            list.forEach(target => assert.ok(tags.has(target), node.id + ' annex target ' + target));
          }
          if (reward.type === 'create_wargoal') {
            assert.ok(tags.has(reward.target), node.id + ' wargoal target ' + reward.target);
            assert.notEqual(reward.target, tag.toUpperCase(), node.id + ' cannot target itself');
          }
          if (reward.type === 'add_building_construction') {
            assert.ok(['industrial_complex', 'arms_factory', 'dockyard', 'bunker', 'coastal_bunker'].includes(reward.building),
              node.id + ' building ' + reward.building);
            assert.ok(Number(reward.level) > 0);
          }
          if (reward.type === 'add_tech_bonus') {
            assert.equal(reward.bonus, 0.5, 'research bonus is 50%');
          }
        }
      }
    }
  }
  assert.ok(total >= 1300, 'all focuses processed: ' + total);
});

/* ------------------------------ 効果適用 ------------------------------ */

test('effect config applies factories, war goals, research bonuses and annexation', () => {
  const annexCalls = [];
  const sandbox = loadScripts(['assets/hoi4-effects-config.js'], {
    CoreEngine: { gameState: {} },
    MapRenderer: { states: {}, annexCountry: tag => annexCalls.push(tag) },
    WarGoals: {
      grant: (tag, source, days) => { sandbox.lastGrant = { tag, source, days }; }
    },
    DiplomacyManager: { countries: [{ id: 'POL', relation: 0 }] },
    ProductionManager: { ensure: () => { sandbox.productionSynced = true; } },
    GameUI: { notify: () => {} }
  });
  const config = sandbox.window.HOI4EffectsConfig;
  const state = { politicalPower: 0, civilianFactories: 10, militaryFactories: 5, dockyards: 2 };

  config.applyEffect(state, { type: 'add_political_power', value: 120 });
  assert.equal(state.politicalPower, 120);

  config.applyEffect(state, { type: 'add_building_construction', building: 'industrial_complex', level: 3 });
  assert.equal(state.civilianFactories, 13);
  config.applyEffect(state, { type: 'add_building_construction', building: 'arms_factory', level: 2 });
  assert.equal(state.militaryFactories, 7);
  config.applyEffect(state, { type: 'add_building_construction', building: 'dockyard', level: 1 });
  assert.equal(state.dockyards, 3);
  assert.equal(sandbox.productionSynced, true);

  config.applyEffect(state, { type: 'create_wargoal', target: 'POL' });
  assert.deepEqual({ ...sandbox.lastGrant }, { tag: 'POL', source: 'focus', days: 120 });

  config.applyEffect(state, { type: 'add_tech_bonus', category: '陸軍', bonus: 0.5, uses: 1 });
  assert.equal(JSON.stringify(state.techBonuses[0]), JSON.stringify({ category: '陸軍', bonus: 0.5, uses: 1 }));

  config.applyEffect(state, { type: 'annex_country', country: ['AUS'] });
  assert.deepEqual(annexCalls, ['AUS']);
  assert.ok(state.annexedCountries.includes('AUS'));

  // 表示用フォーマット
  const formatted = config.formatEffect({ type: 'add_political_power', value: 120 });
  assert.match(formatted.text, /政治力/);
  assert.match(formatted.text, /120/);
  const wargoal = config.formatEffect({ type: 'create_wargoal', target: 'POL' });
  assert.match(wargoal.text, /戦争目標/);
});

/* ------------------------------ 兵器設計 ------------------------------ */

test('equipment designer chassis and modules reference real technologies', () => {
  const sandbox = loadScripts(['dlc.js', 'assets/equipment-designer.js'], {
    document: { createElement: () => ({ style: {}, classList: { add: () => {} }, appendChild: () => {} }), head: { appendChild: () => {} }, getElementById: () => null },
    GameUI: { notify: () => {} },
    CoreEngine: { gameState: { xp: { army: 100, navy: 100, air: 100 }, country: 'GER', doctrine: [], doctrineRoutes: {} }, log: () => {} },
    MultiplayerManager: { broadcast: () => {} }
  });
  const Designer = sandbox.window.EquipmentDesigner;
  assert.ok(Designer && Designer.DATA);
  const techs = knownTechIds();
  const categories = Object.keys(Designer.DATA);
  assert.deepEqual(categories.sort(), ['plane', 'ship', 'tank']);

  let hullCount = 0;
  let moduleCount = 0;
  for (const [category, data] of Object.entries(Designer.DATA)) {
    assert.ok(data.hulls.length >= 5, category + ' needs chassis variety');
    for (const hull of data.hulls) {
      hullCount += 1;
      assert.ok(hull.requires && hull.requires.length, hull.name + ' must be gated by research');
      hull.requires.forEach(id => assert.ok(techs.has(id), hull.name + ' unknown tech ' + id));
    }
    for (const slot of data.slots) {
      assert.ok(slot.options.length >= 2, category + '/' + slot.id + ' needs options');
      for (const option of slot.options) {
        moduleCount += 1;
        (option.requires || []).forEach(id => assert.ok(techs.has(id), option.name + ' unknown tech ' + id));
      }
    }
  }
  assert.ok(hullCount >= 20, 'chassis/hull/airframe count: ' + hullCount);
  assert.ok(moduleCount >= 40, 'module count: ' + moduleCount);

  // 性能計算: モジュールを積むと攻撃力とコストが増える
  const originalResearched = sandbox.ResearchManager;
  sandbox.ResearchManager = { researchedTech: new Set(techs) };
  Designer.draft.tank = { hull: 'mt', modules: {} };
  const bare = Designer.stats('tank');
  Designer.draft.tank = { hull: 'mt', modules: { gun: 'long', armor: 'slope', engine: 'diesel' } };
  const armed = Designer.stats('tank');
  assert.ok(armed.cost > bare.cost, 'modules increase production cost');
  assert.ok(armed.soft > 0 && armed.hard > bare.hard, 'main gun adds hard attack');
  assert.ok(armed.armor > bare.armor, 'armor module adds armor');
  assert.ok(armed.reliability <= 100 && armed.reliability >= 0);
  assert.ok(armed.speed > 0);
  sandbox.ResearchManager = originalResearched;
});

/* ------------------------------ ドクトリンの進行 ------------------------------ */

test('doctrine XP spending locks exclusive routes and aggregates combat bonuses', () => {
  const sandbox = loadScripts(['assets/doctrine-data.js', 'dlc.js'], {
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {} }), head: { appendChild: () => {} } },
    GameUI: { notify: () => {} },
    GameTools: { escape: value => String(value ?? '') },
    MultiplayerManager: { broadcast: () => {} },
    CoreEngine: {
      gameState: { xp: { army: 500, navy: 0, air: 0 }, doctrine: [], doctrineRoutes: {}, cardModifiers: {} },
      log: () => {}
    }
  });
  const manager = sandbox.window.DoctrineManager;
  assert.ok(manager, 'DoctrineManager must be exported');

  // 1) ノード解禁: XP を消費し、最初のノードでルートが確定する
  assert.equal(manager.unlock('land_mass_1'), true);
  assert.equal(sandbox.CoreEngine.gameState.xp.army, 460);
  assert.deepEqual([...sandbox.CoreEngine.gameState.doctrine], ['land_mass_1']);
  assert.equal(sandbox.CoreEngine.gameState.doctrineRoutes.land, 'mass');

  // 2) 他ルートは永久ロック
  assert.equal(manager.unlock('land_blitz_1'), false);
  assert.equal(manager.statusOf(manager.node('land_blitz_1')), 'locked');

  // 3) 前提のないノードは取得不可 / 前提が揃えば取得できる
  assert.equal(manager.unlock('land_mass_3'), false);
  assert.equal(manager.unlock('land_mass_2'), true);
  assert.equal(manager.unlock('land_mass_3'), true);

  // 4) 効果はグローバル補正として集計される (org +5%, +5%, soft +10% ...)
  const bonuses = manager.bonuses('land');
  assert.equal(Math.round(bonuses.org * 100), 10);
  assert.equal(Math.round(bonuses.soft * 100), 20);
  assert.equal(bonuses.combatWidth, 2);
  assert.equal(manager.modifier('land', 'soft'), bonuses.soft);

  // 5) XP 不足なら取得できない
  sandbox.CoreEngine.gameState.xp.army = 0;
  assert.equal(manager.unlock('land_mass_4'), false);
});

test('doctrine exclusive fork groups allow only one of the two tier-2 nodes', () => {
  const sandbox = loadScripts(['assets/doctrine-data.js', 'dlc.js'], {
    document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {} }), head: { appendChild: () => {} } },
    GameUI: { notify: () => {} },
    GameTools: { escape: value => String(value ?? '') },
    MultiplayerManager: { broadcast: () => {} },
    CoreEngine: {
      gameState: { xp: { army: 500, navy: 0, air: 0 }, doctrine: [], doctrineRoutes: {}, cardModifiers: {} },
      log: () => {}
    }
  });
  const manager = sandbox.window.DoctrineManager;
  assert.equal(manager.unlock('land_blitz_1'), true);
  assert.equal(manager.unlock('land_blitz_2a'), true);
  assert.equal(manager.unlock('land_blitz_2b'), false, 'same group is exclusive');
  // anyRequires: true は「いずれか1つ」で解禁 (分岐のどちらを選んでも先へ進める)
  assert.equal(manager.unlock('land_blitz_3'), true);
});

test('equipment designer enforces mandatory slots, size limits and XP spending', () => {
  const techs = knownTechIds();
  const notified = [];
  const sandbox = loadScripts(['dlc.js', 'assets/equipment-designer.js'], {
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild: () => {} }),
      head: { appendChild: () => {} }
    },
    GameUI: { notify: (message, type) => notified.push({ message, type }) },
    CoreEngine: {
      gameState: { xp: { army: 100, navy: 100, air: 100 }, country: 'GER', date: new Date(1941, 0, 1) },
      log: () => {}
    },
    MultiplayerManager: { broadcast: () => {} }
  });
  const Designer = sandbox.window.EquipmentDesigner;
  sandbox.ResearchManager = { researchedTech: new Set(techs) };

  // 必須スロットは初期状態で自動装着され、空にはできない
  Designer.setCategory('tank');
  assert.ok(Designer.draft.tank.modules.gun, 'main gun is pre-installed');
  assert.ok(Designer.draft.tank.modules.engine, 'engine is pre-installed');
  assert.equal(Designer.pickModule('gun', ''), false);
  assert.match(notified[notified.length - 1].message, /必須スロット/);

  // 小型機体には大型爆弾を積めない / 中型機体なら積める
  Designer.setCategory('plane');
  Designer.pickHull('fighter');
  assert.equal(Designer.pickModule('weapon', 'heavy_bomb'), false);
  assert.match(notified[notified.length - 1].message, /小型機体には大型爆弾/);
  Designer.pickHull('bomber');
  assert.equal(Designer.pickModule('weapon', 'heavy_bomb'), true);
  assert.equal(Designer.validation('plane').valid, true);

  // 保存で対応する軍種の XP を消費する / XP 不足なら保存できない
  const before = sandbox.CoreEngine.gameState.xp.air;
  const design = Designer.saveDesign();
  assert.ok(design && design.id);
  assert.equal(sandbox.CoreEngine.gameState.xp.air, before - 20);
  sandbox.CoreEngine.gameState.xp.air = 0;
  assert.equal(Designer.saveDesign(), null);
  assert.match(notified[notified.length - 1].message, /XPが不足/);
});

test('military XP accrues at exactly +0.2 per day per service', () => {
  const sandbox = loadScripts(['dlc.js'], {
    document: {
      getElementById: () => null,
      createElement: () => ({ style: {}, appendChild: () => {} }),
      head: { appendChild: () => {} }
    },
    GameUI: { notify: () => {}, switchTab: () => {} },
    WindowManager: { topWindow: () => null },
    CoreEngine: {
      gameState: {
        date: new Date(1936, 0, 1),
        xp: { army: 0, navy: 0, air: 0 },
        atWar: [],
        country: 'GER',
        cardModifiers: {}
      },
      log: () => {},
      registerTickCallback: () => {}
    },
    MultiplayerManager: { broadcast: () => {} }
  });
  const DLC = sandbox.window.DLC;
  assert.ok(DLC, 'DLC must be exposed for inspection');
  assert.equal(DLC.XP_PER_DAY, 0.2);

  // 1時間Tick × 24 = ちょうど 1日 +0.2 XP（平時）
  const gs = { date: new Date(1936, 0, 1, 0), xp: { army: 0, navy: 0, air: 0 }, atWar: [] };
  for (let hour = 0; hour < 24; hour++) {
    gs.date = new Date(1936, 0, 1, hour);
    DLC.accrueExperienceXP(gs);
  }
  for (const key of ['army', 'navy', 'air']) {
    assert.ok(Math.abs(gs.xp[key] - 0.2) < 1e-9, key + ' XP after one day: ' + gs.xp[key]);
  }

  // 同じ時刻の再Tickでは二重加算しない
  const before = gs.xp.army;
  DLC.accrueExperienceXP(gs);
  assert.equal(gs.xp.army, before);

  // 戦時でも増加量は 1日 +0.2 のまま
  for (let hour = 0; hour < 24; hour++) {
    gs.date = new Date(1936, 0, 2, hour);
    gs.atWar = ['SOV'];
    DLC.accrueExperienceXP(gs);
  }
  assert.ok(Math.abs(gs.xp.army - 0.4) < 1e-9, 'wartime rate stays 0.2/day: ' + gs.xp.army);

  // トップバー表示用の旧フィールドも同期される
  assert.equal(gs.armyExperience, gs.xp.army);
  assert.equal(gs.navyExperience, gs.xp.navy);
  assert.equal(gs.airExperience, gs.xp.air);
});
