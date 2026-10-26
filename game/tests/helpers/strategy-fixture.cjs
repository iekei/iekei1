"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
function fixture() {
  const nodes = new Map(),
    storage = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        innerHTML: "",
        textContent: "",
        value: "",
        style: {},
        dataset: {},
        children: [],
        listeners: {},
        offsetWidth: 300,
        offsetHeight: 260,
        clientWidth: 800,
        clientHeight: 600,
        scrollLeft: 0,
        scrollTop: 0,
        classList: {
          added: [],
          removed: [],
          add(name) {
            this.added.push(name);
          },
          remove(name) {
            this.removed.push(name);
          },
          toggle() {},
          contains() {
            return true;
          },
        },
        appendChild(child) {
          this.children.push(child);
        },
        replaceChildren() {
          this.children = [];
        },
        addEventListener(name, handler) {
          this.listeners[name] = handler;
        },
        setAttribute() {},
        querySelectorAll() {
          return [];
        },
        querySelector(sel) {
          return node(id + sel);
        },
      });
    return nodes.get(id);
  };
  const sandbox = {
    TopbarUI: { render() {} },
    console,
    Date,
    Math,
    innerWidth: 1280,
    innerHeight: 800,
    crypto: require("node:crypto").webcrypto,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout() {},
    requestAnimationFrame() {},
    document: {
      createTextNode: (text) => ({ textContent: text }),
      getElementById: node,
      querySelectorAll(selector) {
        return selector === 'input[name="move-division"]'
          ? sandbox.selectionInputs
          : [];
      },
      querySelector() {
        return null;
      },
      createElement() {
        return node(Math.random());
      },
      addEventListener() {},
      head: { appendChild() {} },
      body: { appendChild() {} },
    },
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
  };
  sandbox.structuredClone = structuredClone;
  sandbox.selectionInputs = [];
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  const ctx = vm.createContext(sandbox);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.trim())
    .join("\n");
  for (const file of [
    "asset-registry",
    "game-asset-data",
    "game-visuals",
    "hoi4-effects-config",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(root, "assets", file + ".js"), "utf8"),
      ctx,
      { filename: file + ".js" },
    );
  vm.runInContext(inline, ctx, { filename: "index.html:inline" });
  vm.runInContext(
    fs.readFileSync(path.join(root, "assets/division-designer.js"), "utf8"),
    ctx,
    { filename: "division-designer.js" },
  );
  for (const name of [
    "battle",
    "news",
    "ai",
    "training",
    "dlc",
    "strategy",
    "war-systems",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(root, name + ".js"), "utf8"),
      ctx,
      { filename: name + ".js" },
    );
  vm.runInContext(
    fs.readFileSync(path.join(root, "assets/strategy-systems.js"), "utf8"),
    ctx,
    { filename: "strategy-systems.js" },
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "assets/supply-network.js"), "utf8"),
    ctx,
    { filename: "supply-network.js" },
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "assets/air-force.js"), "utf8"),
    ctx,
    { filename: "air-force.js" },
  );
  vm.runInContext(
    fs.readFileSync(
      path.join(root, "assets/MultiplayerTimeManager.js"),
      "utf8",
    ),
    ctx,
    { filename: "MultiplayerTimeManager.js" },
  );
  const run = (source) => vm.runInContext(source, ctx);
  run(`
    MultiplayerTimeManager.init();StrategyGame.prepare();IntelOperations.ensure();DLC.ensureState();
    AIManager.state={focus:{},wars:[],doneEvents:[],spyDay:0};
    DiplomacyManager.countries=['POL','SOV','FRA','FIN','CHI','DEN'].map(id=>({id,name:id}));
    MapRenderer.ready=true;MapRenderer.canvas={width:1440,height:1000};MapRenderer.mapW=100;MapRenderer.mapH=100;
    MapRenderer.provinces={types:['land','sea'],terr:['plains','forest','mountain'],p:{}};
    MapRenderer.states={'1':{owner:'GER',name:'Home',provinces:[1,2],b:{}},'2':{owner:'POL',name:'Border',provinces:[3,4],b:{}},'3':{owner:'POL',name:'Goal',provinces:[5,6],b:{}}};
    MapRenderer.provNeighbors=new Map();MapRenderer.provCentroid=new Map();MapRenderer.provToState=new Map();MapRenderer.stateCenter=new Map();
    for(let p=1;p<=6;p++){MapRenderer.provinces.p[p]=[0,0,0,0,0,0];MapRenderer.provCentroid.set(p,[p*10,0]);MapRenderer.provNeighbors.set(p,new Set([p-1,p+1].filter(n=>n>=1&&n<=6)));MapRenderer.provToState.set(p,String(Math.ceil(p/2)));}
    MapRenderer.stateCenter=new Map([['1',[15,0]],['2',[35,0]],['3',[55,0]]]);
    MapRenderer.provinceAt=(x,y)=>{
      const mapW=MapRenderer.mapW||1, mapH=MapRenderer.mapH||1;
      const rawX=Math.floor(x), rawY=Math.floor(y);
      if(rawY<0||rawY>=mapH)return null;
      const wx=((rawX % mapW)+mapW)%mapW;
      return MapRenderer.idMap ? MapRenderer.idMap[rawY * mapW + wx] ?? null : Math.round(x/10);
    };
    const army={id:1,name:'Test Army',base:[10,0],positionPid:1,divisions:Array.from({length:8},(_,i)=>({id:i+1,org:60,maxOrg:60,x:10,y:0,comp:{infantry:6}})),frontline:[[20,0]],arrow:{from:[20,0],to:[60,0]},executing:false};
    BattlePlanManager.armies=[army];BattlePlanManager.selectedArmyId=1;
    CoreEngine.gameState.atWar=['POL'];CoreEngine.gameState.recruitQueue=[];TrainingManager.queue=CoreEngine.gameState.recruitQueue;
  `);
  return {
    run,
    node,
    ctx,
    load: (file) =>
      vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, {
        filename: file,
      }),
  };
}

module.exports = { fixture };
