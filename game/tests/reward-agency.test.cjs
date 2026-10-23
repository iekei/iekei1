"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function env() {
  const c = { console, window: null };
  c.window = c;
  vm.createContext(c);
  const run = (s) => vm.runInContext(s, c);
  const load = (f) => run(fs.readFileSync(path.join(root, f), "utf8"));
  load("assets/hoi4-effects-config.js");
  load("assets/completion-reward.js");
  return { c, run, load };
}
test("ordered AST retains repeats, quoted hashes/braces, state scopes and fractional percentages", () => {
  const { c } = env();
  const r = c.parseCompletionReward(
    'completion_reward = { # comment\n add_political_power = 10 add_political_power = -5 add_stability = 0.1 42 = { add_extra_state_shared_building_slots = 2 add_building_construction = { type = industrial_complex amount = 3 } } create_unit = { division = "Guard # { Elite }" location = 42 } }',
  );
  assert.equal(r.length, 6);
  assert.equal(r[2].value, 10);
  assert.equal(r[3].state, "42");
  assert.equal(r[4].building, "industrial_complex");
  assert.equal(r[5].division, "Guard # { Elite }");
  assert.throws(
    () => c.parseCompletionReward("add_political_power = {"),
    /閉じ括弧/,
  );
  assert.throws(() => c.parseCompletionReward("x = 2 }"), /余分/);
});
test("all requested reward commands mutate state and format detailed descriptions", () => {
  const { c } = env();
  const s = {
    country: "GER",
    politicalPower: 10,
    stability: 50,
    warSupport: 50,
    states: { 42: { owner: "POL", name: "Test" } },
  };
  const source = `add_political_power = 15 add_stability = -0.1 add_war_support = 0.2 add_ideas = spirit remove_ideas = old
set_politics = { ruling_party = fascism } puppet = HUN create_wargoal = { type = conquer target = FRA } add_to_faction = ITA give_guarantee = ENG transfer_state = 42
42 = { add_core_of = GER add_claim_by = GER add_extra_state_shared_building_slots = 2 add_building_construction = { type = infrastructure amount = 3 } }
add_offsite_building = { type = arms_factory level = 2 } add_equipment_to_stockpile = { type = infantry_equipment amount = 500 producer = GER }
add_tech_bonus = { target = armor bonus = 0.5 uses = 2 } create_unit = { division = "Guard" location = 42 } annex_country = { target = POL }`;
  for (const r of c.parseCompletionReward(source)) {
    assert.ok(c.CompletionReward.format(r)?.text, r.type);
    c.CompletionReward.apply(s, r);
  }
  assert.equal(s.politicalPower, 25);
  assert.equal(s.stability, 40);
  assert.equal(s.warSupport, 70);
  assert.equal(s.rulingParty, "fascism");
  assert.equal(s.states[42].owner, "GER");
  assert.equal(s.states[42].extraBuildingSlots, 2);
  assert.equal(s.states[42].buildings.infrastructure, 3);
  assert.ok(s.states[42].cores.includes("GER"));
  assert.equal(s.stockpile.infantry, 500);
  assert.equal(s.techBonuses[0].uses, 2);
  assert.equal(s.spawnedDivisions[0].template, "Guard");
  assert.equal(s.offsiteBuildings.arms_factory, 2);
  assert.equal(s.subjects.HUN.overlord, "GER");
  assert.ok(s.guarantees.includes("ENG"));
  assert.ok(s.annexedCountries.includes("POL"));
  const text = c.CompletionReward.format(
    c.parseCompletionReward(
      "add_building_construction = { type = arms_factory location = 42 amount = 4 }",
    )[0],
  ).text;
  assert.match(text, /42/);
  assert.match(text, /軍需工場/);
  assert.match(text, /4/);
});
test("unsupported conditionals do not grant hidden rewards and country scopes stay isolated", () => {
  const { c } = env(),
    s = { country: "GER", politicalPower: 0 };
  for (const r of c.parseCompletionReward(
    "if = { limit = { tag = GER } add_political_power = 999 } FRA = { add_political_power = 10 }",
  ))
    c.CompletionReward.apply(s, r);
  assert.equal(s.politicalPower, 0);
  assert.equal(s.countryEffects.FRA.politicalPower, 10);
  assert.equal(s.unappliedRewards.length, 1);
});
test("orthogonal routes avoid unrelated card rectangles in all seven real datasets", () => {
  const { c, load } = env();
  load("assets/focus-routing.js");
  for (const tag of ["ger", "eng", "fra", "usa", "jap", "ita", "sov"]) {
    const dir = path.join(root, tag, "data"),
      nodes = fs
        .readdirSync(dir)
        .filter((f) => /_nf_batch\d+\.json$/.test(f))
        .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f))));
    const minX = Math.min(...nodes.map((n) => n.x || 0)),
      minY = Math.min(...nodes.map((n) => n.y || 0));
    const pos = (n) => ({
      x: (n.x || 0) - minX + 50,
      y: (n.y || 0) - minY + 50,
    });
    const routes = c.FocusRouting.route(
      nodes,
      Object.fromEntries(nodes.map((n) => [n.id, n])),
      pos,
      140,
      78,
    );
    assert.equal(
      routes.length,
      nodes.reduce((n, f) => n + (f.prerequisites || []).length, 0),
      tag,
    );
    for (const route of routes) {
      const points = [...route.path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(
        (m) => ({ x: +m[1], y: +m[2] }),
      );
      for (let j = 1; j < points.length; j++) {
        const a = points[j - 1],
          b = points[j];
        assert.ok(a.x === b.x || a.y === b.y);
        for (const n of nodes) {
          if (n.id === route.parentId || n.id === route.childId) continue;
          const r = pos(n);
          const hit =
            a.x === b.x
              ? a.x > r.x &&
                a.x < r.x + 140 &&
                Math.max(a.y, b.y) > r.y &&
                Math.min(a.y, b.y) < r.y + 78
              : a.y > r.y &&
                a.y < r.y + 78 &&
                Math.max(a.x, b.x) > r.x &&
                Math.min(a.x, b.x) < r.x + 140;
          assert.equal(
            hit,
            false,
            tag +
              ": " +
              route.parentId +
              " -> " +
              route.childId +
              " through " +
              n.id,
          );
        }
      }
    }
  }
});
function agency() {
  const e = env();
  e.run(`
 var CoreEngine={gameState:{country:'GER',intel:{agency:'Agency',spies:2,level:2,roster:['a','b'],recruiting:[],assignments:[{kind:'idle'},{kind:'idle'}],targets:{}},strategy:{},ideology:'fascism'}};
 var day=0,GameTools={day:()=>day,escape:String,editing:()=>false},GameUI={notify(){},closeModal(){},openModal(){}},stock={infantry:1000,support_equipment:200};
 var ProductionManager={freeCivilian:()=>10-(CoreEngine.gameState.intel.branchProject?.factories||0),canConsume:n=>Object.entries(n).every(([k,v])=>stock[k]>=v),consume:n=>{for(const [k,v] of Object.entries(n))stock[k]-=v;}};
 var IntelOperations={ensure(){},target:tag=>CoreEngine.gameState.intel.targets[tag] ||= {network:100,revealUntil:0},tick(){},draw(){},counterPower:()=>0};
 var document={getElementById:()=>null};
 `);
  e.load("assets/intelligence-agency.js");
  return e;
}
test("agency branches reserve factories, complete daily, and cipher reveals expire at day 30", () => {
  const { run } = agency();
  assert.equal(run("AgencyUI.upgrade('cryptology')"), true);
  assert.equal(run("ProductionManager.freeCivilian()"), 5);
  assert.equal(run("AgencyUI.upgrade('defense')"), false);
  run(
    "for(let j=0;j<30;j++){day++;IntelOperations.tick();IntelOperations.tick();}",
  );
  assert.equal(run("CoreEngine.gameState.intel.branches.cryptology"), true);
  assert.equal(run("ProductionManager.freeCivilian()"), 10);
  run(
    "AgencyUI.target('POL');AgencyUI.decrypt();for(let j=0;j<60;j++){day++;IntelOperations.tick();}",
  );
  assert.equal(run("IntelOperations.target('POL').decoded"), true);
  assert.equal(run("AgencyUI.reveal()"), true);
  assert.equal(run("AgencyUI.combatBonus('POL')"), 0.15);
  assert.equal(run("AgencyUI.reveal()"), false);
  run("day+=30");
  assert.equal(run("AgencyUI.combatBonus('POL')"), 0);
});
test("operations reject duplicate agents, consume equipment once, run all phases and grant rewards", () => {
  const { run } = agency();
  run("AgencyUI.target('POL')");
  assert.equal(run("AgencyUI.start('steal',[0,0])"), false);
  assert.equal(run("stock.infantry"), 1000);
  assert.equal(run("AgencyUI.start('steal',[0,1])"), true);
  assert.equal(run("stock.infantry"), 500);
  assert.equal(run("AgencyUI.start('steal',[0,1])"), false);
  run("for(let j=0;j<75;j++)AgencyUI.daily(()=>0)");
  assert.equal(run("CoreEngine.gameState.intel.agencyOperation"), null);
  assert.equal(run("CoreEngine.gameState.techBonuses[0].bonus"), 0.5);
});
test("operation failure and capture persist agent restrictions", () => {
  const { run } = agency();
  run(
    "AgencyUI.target('POL');AgencyUI.start('sabotage',[0]);for(let j=0;j<75;j++)AgencyUI.daily(()=>.99)",
  );
  assert.equal(run("AgencyUI.person(0).status"), "captured");
  assert.equal(run("AgencyUI.select(0)"), undefined);
  run("CoreEngine.gameState.intel.assignments[0]={kind:'idle'}");
  assert.equal(run("AgencyUI.start('sabotage',[0])"), false);
});
