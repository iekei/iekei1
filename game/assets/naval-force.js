/* naval-force.js — HOI4風「海戦・艦隊編成・通商破壊 (Naval Warfare & Fleets)」
 *
 *  - 艦艇: 建造済み (備蓄) の 戦艦 / 空母 / 巡洋艦 / 駆逐艦 / 潜水艦 を個艦として管理 (HP・火力・対空・魚雷・視界・燃料)
 *  - 任務部隊 (Task Force): BattlePlanManager.navy の艦隊ユニットを拡張 (ships[] / 母港 / 任務)。編成・分割・合流
 *  - 海域と任務: 哨戒 / 打撃群 / 通商破壊 / 輸送船護衛 (マップの海域クリックで割当)
 *  - 海戦: 敵艦隊 (交戦国の艦隊) と遭遇すると毎時 砲撃・魚雷・艦載機 の交戦。HP減少・撃沈ログ
 *  - 制海権: 海域ごとの自軍/敵軍戦力比。強襲上陸の可否 (BattlePlanManager.tryInvasion) に反映
 */
class NavalForce {
  static SHIPS = {
    battleship: { id: 'battleship', label: '戦艦',   short: 'BB', icon: '♜', stock: 'battleship', hp: 900, gun: 70, aa: 20, torpedo: 0,  spot: 10, fuel: 8,   speed: 28, capital: true },
    carrier:    { id: 'carrier',    label: '空母',   short: 'CV', icon: '🛳', stock: 'carrier',    hp: 600, gun: 6,  aa: 30, torpedo: 0,  spot: 30, fuel: 7,   speed: 30, capital: true, planes: 40 },
    cruiser:    { id: 'cruiser',    label: '巡洋艦', short: 'CL', icon: '⛴', stock: 'cruiser',    hp: 300, gun: 22, aa: 14, torpedo: 4,  spot: 18, fuel: 3,   speed: 32, capital: false },
    destroyer:  { id: 'destroyer',  label: '駆逐艦', short: 'DD', icon: '⚓', stock: 'destroyer',  hp: 120, gun: 8,  aa: 6,  torpedo: 10, spot: 14, fuel: 1,   speed: 36, capital: false, screen: true },
    submarine:  { id: 'submarine',  label: '潜水艦', short: 'SS', icon: '◉', stock: 'submarine',  hp: 80,  gun: 1,  aa: 0,  torpedo: 18, spot: 8,  fuel: 0.5, speed: 18, capital: false, sub: true },
  };
  static ORDER = ['carrier', 'battleship', 'cruiser', 'destroyer', 'submarine'];
  static MISSIONS = {
    patrol: { id: 'patrol', label: '哨戒',       icon: '🔭', desc: '海域を哨戒し敵艦隊を発見する。視界が高いほど早く発見。' },
    strike: { id: 'strike', label: '打撃群',     icon: '💥', desc: '哨戒が敵艦隊を発見すると出撃して砲撃戦を行う。' },
    raid:   { id: 'raid',   label: '通商破壊',   icon: '🐺', desc: '潜水艦などで敵の輸送船団を撃沈する。' },
    escort: { id: 'escort', label: '輸送船護衛', icon: '🛡️', desc: '自国の貿易・輸送船団を敵の通商破壊から守る。' },
  };
  static RADIUS = 300;        // 海域の影響半径 (px)
  static STRIKE_RANGE = 520;  // 打撃群の出撃距離
  static NAMES = { battleship: ['ビスマルク', 'ティルピッツ', 'シャルンホルスト', 'グナイゼナウ', '大和', '武蔵', '長門', 'フッド', 'アイオワ'], carrier: ['グラーフ・ツェッペリン', '赤城', '加賀', 'エンタープライズ', 'アーク・ロイヤル'], cruiser: ['プリンツ・オイゲン', 'ヒッパー', 'ブリュッヒャー', 'ケルン', '最上', '利根', 'ベルファスト'], destroyer: [], submarine: [] };
  static esc(s) { return typeof GameTools !== 'undefined' ? GameTools.escape(String(s ?? '')) : String(s ?? ''); }

  // ==========================================================
  // 初期化・フック
  // ==========================================================
  static init() {
    if (NavalForce.installed) return;
    NavalForce.installed = true;
    NavalForce.registerCatalog();
    if (typeof BattlePlanManager !== 'undefined') {
      BattlePlanManager.missions.navy = Object.values(NavalForce.MISSIONS).map(m => ({ id: m.id, label: m.label }));
      if (!BattlePlanManager.activeMission.navy || !NavalForce.MISSIONS[BattlePlanManager.activeMission.navy]) BattlePlanManager.activeMission.navy = 'patrol';
      NavalForce.installHooks();
    }
    CoreEngine.registerTickCallback(() => NavalForce.onTick());
    CoreEngine.log('⚓ 海軍システム: 「海軍」ウィンドウで艦艇を任務部隊に編成し、海域をクリックして任務を与えてください。');
  }
  static registerCatalog() {
    if (typeof ProductionManager === 'undefined') return;
    const C = ProductionManager.CATALOG;
    if (!C.cruiser) C.cruiser = { name: '巡洋艦', rate: 1 / 120, resources: { steel: 14, chromium: 4 }, pool: 'dockyard', technology: ['early_ship_hull_cruiser', 'early_ship_hull_light'] };
    if (!C.carrier) C.carrier = { name: '空母', rate: 1 / 300, resources: { steel: 20, chromium: 8, aluminum: 6 }, pool: 'dockyard', technology: ['early_ship_hull_carrier', 'early_ship_hull_heavy'] };
    if (ProductionManager.ICONS) { ProductionManager.ICONS.cruiser = '⛴'; ProductionManager.ICONS.carrier = '🛳'; }
  }
  static installHooks() {
    const B = BattlePlanManager;
    if (B._navalForceHooked) return;
    B._navalForceHooked = true;
    const origDraw = B.drawOverlay.bind(B);
    B.drawOverlay = (ctx, cam, w2s) => { origDraw(ctx, cam, w2s); NavalForce.draw(ctx, w2s); };
    const origZone = B.showZoneInfo.bind(B);
    B.showZoneInfo = (unit, pid) => { if (unit?.type !== 'navy') return origZone(unit, pid); NavalForce.openZoneModal(pid, unit); };
    const origPanel = B.renderPanel.bind(B);
    B.renderPanel = () => { origPanel(); if (typeof WindowManager !== 'undefined' && WindowManager.isOpen('navy')) NavalForce.render(); };
    // 旧ロジック (哨戒で制海権+、攻撃で船団撃沈) は本モジュールが置き換える
    const origAction = B.applyForceAction.bind(B);
    B.applyForceAction = (unit) => { if (unit.type === 'navy') return; origAction(unit); };
    const origComplete = B.completeForceMission.bind(B);
    B.completeForceMission = (unit) => {
      if (unit.type !== 'navy') return origComplete(unit);
      const gs = CoreEngine.gameState;
      gs.xp = gs.xp || {}; gs.xp.navy = Math.min(9999, (Number(gs.xp.navy) || 0) + 1);
      unit.executing = true; unit.progress = 0;   // 海軍任務は中止するまで継続
    };
    const origExecute = B.execute.bind(B);
    B.execute = (id) => {
      if (typeof id === 'string' && id.startsWith('nav')) {
        const tf = NavalForce.tf(id);
        if (tf && !tf.ships.length) { GameUI.notify('⚓ 任務部隊に艦艇が配属されていません。「海軍」ウィンドウで編成してください。', 'alert'); return; }
      }
      origExecute(id);
    };
    const origConvoy = B.applyConvoyDamage.bind(B);
    B.applyConvoyDamage = (tag, pressure) => origConvoy(tag, Number(pressure || 1) * (1 - NavalForce.escortCover()));
  }

  // ==========================================================
  // 状態
  // ==========================================================
  static data() {
    const s = CoreEngine.gameState;
    if (!s.strategy) return null;
    const n = (s.strategy.naval ||= { ships: [], nextShip: 1, battles: [], log: [], enemy: {}, init: false });
    n.ships ||= []; n.battles ||= []; n.log ||= []; n.enemy ||= {};
    if (!n.init && typeof ProductionManager !== 'undefined') {
      const a = ProductionManager.account(s.country);
      if (a.stock) {
        a.stock.cruiser = Math.max(a.stock.cruiser || 0, 6);
        a.stock.carrier = Math.max(a.stock.carrier || 0, 1);
        a.stock.submarine = Math.max(a.stock.submarine || 0, 12);
        a.stock.battleship = Math.max(a.stock.battleship || 0, 2);
        n.init = true;
      }
    }
    NavalForce.syncShips(n);
    return n;
  }
  /** 備蓄 (建造済み艦艇数) と個艦リストを同期する */
  static syncShips(n) {
    if (typeof ProductionManager === 'undefined') return;
    const stock = ProductionManager.account(CoreEngine.gameState.country).stock || {};
    NavalForce.ORDER.forEach(type => {
      const def = NavalForce.SHIPS[type];
      const have = Math.floor(Number(stock[def.stock]) || 0);
      const list = n.ships.filter(sh => sh.type === type);
      for (let i = list.length; i < have; i++) n.ships.push(NavalForce.newShip(n, type));
      if (list.length > have) {
        let extra = list.length - have;
        [...list].reverse().forEach(sh => { if (extra > 0 && !sh.tf) { n.ships.splice(n.ships.indexOf(sh), 1); extra--; } });
        [...list].reverse().forEach(sh => { if (extra > 0 && n.ships.includes(sh)) { NavalForce.detach(sh); n.ships.splice(n.ships.indexOf(sh), 1); extra--; } });
      }
    });
    // 任務部隊側の整合
    NavalForce.tfs().forEach(tf => { tf.ships = tf.ships.filter(id => n.ships.some(sh => sh.id === id && sh.tf === tf.id)); });
  }
  static newShip(n, type) {
    const def = NavalForce.SHIPS[type], idx = n.nextShip++;
    const used = new Set(n.ships.map(sh => sh.name));
    const named = (NavalForce.NAMES[type] || []).find(nm => !used.has(nm));
    return { id: 'sh' + idx, type, name: named || def.label + ' ' + def.short + '-' + idx, hp: def.hp, maxHp: def.hp, xp: 0, tf: null, kills: 0 };
  }
  static ship(id) { return NavalForce.data()?.ships.find(sh => sh.id === id) || null; }
  static shipsOf(tf) { const n = NavalForce.data(); return tf.ships.map(id => n.ships.find(sh => sh.id === id)).filter(Boolean); }
  static reserve() { return NavalForce.data().ships.filter(sh => !sh.tf); }
  static detach(sh) { if (!sh.tf) return; const tf = NavalForce.tfRaw(sh.tf); if (tf) tf.ships = tf.ships.filter(id => id !== sh.id); sh.tf = null; }

  // ---- 任務部隊 ----
  static tfRaw(id) { return (BattlePlanManager.navy || []).find(u => u.id === id) || null; }
  static tfs() { return (BattlePlanManager.navy || []).map(u => NavalForce.normalize(u)); }
  static tf(id) { const u = NavalForce.tfRaw(id); return u ? NavalForce.normalize(u) : null; }
  static normalize(u) {
    u.ships ||= [];
    if (!u.mission || !NavalForce.MISSIONS[u.mission]) u.mission = 'patrol';
    if (u.zone && (!u.zone.mission || !NavalForce.MISSIONS[u.zone.mission])) u.zone.mission = u.mission;
    if (!u.baseStateId) { const b = NavalForce.ports()[0]; if (b) { u.baseStateId = b.sid; u.base = b.center.slice(); } }
    if (!Number.isFinite(u.detection)) u.detection = 0;
    return u;
  }
  static ports() {
    const player = CoreEngine.gameState.country, out = [];
    Object.entries(MapRenderer.states || {}).forEach(([sid, st]) => {
      if (st.owner !== player || !(st.b?.naval_base > 0)) return;
      const coast = (st.provinces || []).find(p => MapRenderer.provinces.p[p]?.[4]);
      const center = (coast && MapRenderer.provCentroid.get(coast)) || MapRenderer.stateCenter.get(String(sid));
      if (center) out.push({ sid: String(sid), name: st.name || '州' + sid, level: st.b.naval_base, center });
    });
    if (!out.length) {
      // 海軍基地が無い場合は沿岸州を仮の母港にする
      Object.entries(MapRenderer.states || {}).some(([sid, st]) => {
        if (st.owner !== player) return false;
        const coast = (st.provinces || []).find(p => MapRenderer.provinces.p[p]?.[4]);
        if (!coast) return false;
        out.push({ sid: String(sid), name: (st.name || '州' + sid) + ' (仮泊地)', level: 0, center: MapRenderer.provCentroid.get(coast) || MapRenderer.stateCenter.get(String(sid)) });
        return true;
      });
    }
    return out;
  }
  static createTF(name) {
    const navy = BattlePlanManager.navy;
    let n = 1; while (navy.some(u => u.id === 'nav' + n)) n++;
    const port = NavalForce.ports()[0];
    const u = { id: 'nav' + n, name: name || '第' + n + '任務部隊', type: 'navy', base: port ? port.center.slice() : [MapRenderer.mapW / 2, MapRenderer.mapH / 2], baseStateId: port?.sid || null, area: null, target: null, zone: null, mission: 'patrol', executing: false, progress: 0, strength: 100, ships: [], detection: 0 };
    navy.push(u);
    NavalForce.selected = u.id;
    NavalForce.render();
    return u;
  }
  static disbandTF(id) {
    const tf = NavalForce.tf(id); if (!tf) return;
    NavalForce.shipsOf(tf).forEach(sh => { sh.tf = null; });
    BattlePlanManager.navy = BattlePlanManager.navy.filter(u => u.id !== id);
    if (NavalForce.selected === id) NavalForce.selected = null;
    NavalForce.render();
  }
  static rename(id, name) { const tf = NavalForce.tfRaw(id); if (tf && name.trim()) tf.name = name.trim().slice(0, 24); }
  static select(id) { NavalForce.selected = id; NavalForce.render(); }
  static setMission(id, m) {
    const tf = NavalForce.tf(id); if (!tf || !NavalForce.MISSIONS[m]) return;
    tf.mission = m; if (tf.zone) tf.zone.mission = m;
    NavalForce.render();
  }
  static setPort(id, sid) {
    const tf = NavalForce.tf(id), p = NavalForce.ports().find(x => x.sid === String(sid)); if (!tf || !p) return;
    tf.baseStateId = p.sid; tf.base = p.center.slice();
    NavalForce.render();
  }
  /** 備蓄 → 任務部隊 (count>0) / 任務部隊 → 備蓄 (count<0) */
  static move(id, type, count) {
    const tf = NavalForce.tf(id); if (!tf || !NavalForce.SHIPS[type]) return;
    if (tf.executing) { GameUI.notify('任務中の部隊は編成できません。先に帰投させてください。', 'alert'); return; }
    const n = NavalForce.data();
    if (count > 0) {
      const pool = n.ships.filter(sh => !sh.tf && sh.type === type).slice(0, count);
      pool.forEach(sh => { sh.tf = tf.id; tf.ships.push(sh.id); });
    } else {
      const mine = NavalForce.shipsOf(tf).filter(sh => sh.type === type).slice(0, -count);
      mine.forEach(sh => { sh.tf = null; tf.ships = tf.ships.filter(x => x !== sh.id); });
    }
    NavalForce.render();
  }
  static moveShip(shipId, tfId) {
    const sh = NavalForce.ship(shipId); if (!sh) return;
    const from = sh.tf ? NavalForce.tf(sh.tf) : null;
    if (from?.executing) { GameUI.notify('任務中の部隊から艦艇を外せません。', 'alert'); return; }
    NavalForce.detach(sh);
    if (tfId) { const to = NavalForce.tf(tfId); if (to && !to.executing) { sh.tf = to.id; to.ships.push(sh.id); } }
    NavalForce.render();
  }
  static split(id) {
    const tf = NavalForce.tf(id); if (!tf || tf.ships.length < 2) return;
    if (tf.executing) { GameUI.notify('任務中の部隊は分割できません。', 'alert'); return; }
    const created = NavalForce.createTF(tf.name + ' 分遣隊');
    created.baseStateId = tf.baseStateId; created.base = tf.base.slice(); created.mission = tf.mission;
    const ships = NavalForce.shipsOf(tf);
    ships.slice(Math.ceil(ships.length / 2)).forEach(sh => { sh.tf = created.id; created.ships.push(sh.id); tf.ships = tf.ships.filter(x => x !== sh.id); });
    NavalForce.render();
  }
  static recall(id) {
    const tf = NavalForce.tf(id); if (!tf) return;
    BattlePlanManager.abort(id);
    NavalForce.data().battles.forEach(b => { b.tfIds = b.tfIds.filter(x => x !== id); });
    NavalForce.render();
  }
  static sortie(id) {
    const tf = NavalForce.tf(id); if (!tf) return;
    if (!tf.zone) { GameUI.notify('⚓ 先に海域を左クリックして任務海域を指定してください (海軍パネルで部隊を選択→マップの海域をクリック)。', 'alert'); return; }
    BattlePlanManager.execute(id);
    NavalForce.render();
  }
  static assignZone(id, pid) {
    const tf = NavalForce.tf(id); if (!tf || !pid) return;
    const c = MapRenderer.provCentroid.get(pid); if (!c) return;
    tf.zone = { pid, x: c[0], y: c[1], mission: tf.mission };
    tf.area = null; tf.target = null; tf.executing = false; tf.progress = 0;
    BattlePlanManager.execute(id);
    GameUI.closeModal?.();
    NavalForce.render();
  }

  // ---- 部隊ステータス ----
  static stats(tf) {
    const ships = NavalForce.shipsOf(tf), out = { count: ships.length, hp: 0, maxHp: 0, gun: 0, aa: 0, torpedo: 0, spot: 0, fuel: 0, planes: 0, speed: 99, subs: 0, screens: 0, capitals: 0 };
    ships.forEach(sh => {
      const d = NavalForce.SHIPS[sh.type], f = sh.hp / sh.maxHp;
      out.hp += sh.hp; out.maxHp += sh.maxHp; out.gun += d.gun * f; out.aa += d.aa * f; out.torpedo += d.torpedo * f; out.spot += d.spot; out.fuel += d.fuel; out.planes += (d.planes || 0) * f; out.speed = Math.min(out.speed, d.speed);
      if (d.sub) out.subs++; else if (d.screen) out.screens++; else out.capitals++;
    });
    if (!ships.length) out.speed = 0;
    out.power = out.gun + out.torpedo + out.aa * 0.5 + out.planes * 1.2;
    return out;
  }
  static enemyStats(fleet) {
    const out = { count: fleet.ships.length, hp: 0, maxHp: 0, gun: 0, aa: 0, torpedo: 0, spot: 0, planes: 0, screens: 0 };
    fleet.ships.forEach(sh => { const d = NavalForce.SHIPS[sh.type], f = sh.hp / sh.maxHp; out.hp += sh.hp; out.maxHp += sh.maxHp; out.gun += d.gun * f; out.aa += d.aa * f; out.torpedo += d.torpedo * f; out.spot += d.spot; out.planes += (d.planes || 0) * f; if (d.screen) out.screens++; });
    out.power = out.gun + out.torpedo + out.aa * 0.5 + out.planes * 1.2;
    return out;
  }

  // ==========================================================
  // 敵艦隊
  // ==========================================================
  static enemyFleets() {
    const s = CoreEngine.gameState, n = NavalForce.data(); if (!n) return [];
    const out = [];
    (s.atWar || []).forEach(tag => {
      if (tag === s.country) return;
      let forces; try { forces = IntelOperations.forces(tag); } catch (e) { return; }
      (forces?.navy || []).forEach(src => {
        let f = n.enemy[src.id];
        if (!f) {
          const count = Math.max(2, Number(src.count) || 10), ships = [];
          for (let i = 0; i < count; i++) {
            const type = i % 10 === 0 ? 'battleship' : i % 10 < 3 ? 'cruiser' : i % 10 < 8 ? 'destroyer' : 'submarine';
            const d = NavalForce.SHIPS[type]; ships.push({ id: src.id + '-' + i, type, hp: d.hp, maxHp: d.hp });
          }
          if (count >= 15) { const d = NavalForce.SHIPS.carrier; ships.push({ id: src.id + '-cv', type: 'carrier', hp: d.hp, maxHp: d.hp }); }
          f = n.enemy[src.id] = { id: src.id, tag, name: src.name || tag + '艦隊', ships, detected: 0, x: src.base?.[0] || 0, y: src.base?.[1] || 0, base: src.base ? src.base.slice() : null, drift: Math.random() * Math.PI * 2 };
        }
        if (!f.ships.length) return;
        f.tag = tag;
        out.push(f);
      });
    });
    return out;
  }
  static enemyPower(x, y, radius = NavalForce.RADIUS) {
    return NavalForce.enemyFleets().filter(f => Math.hypot(f.x - x, f.y - y) <= radius).reduce((n, f) => n + NavalForce.enemyStats(f).power, 0);
  }

  // ==========================================================
  // 制海権
  // ==========================================================
  static inZone(tf, x, y, radius = NavalForce.RADIUS) { return !!(tf.executing && tf.zone && Math.hypot(tf.zone.x - x, tf.zone.y - y) <= radius); }
  static superiority(x, y) {
    const weights = { patrol: 1, strike: 1, escort: 0.6, raid: 0.3 };
    const ownTfs = NavalForce.tfs().filter(tf => NavalForce.inZone(tf, x, y));
    const own = ownTfs.reduce((n, tf) => n + NavalForce.stats(tf).power * (weights[tf.mission] || 1), 0);
    const enemy = NavalForce.enemyPower(x, y);
    const percent = own + enemy > 0 ? Math.round(own / (own + enemy) * 100) : 0;
    const level = own + enemy === 0 ? 'none' : percent >= 75 ? 'secured' : percent >= 50 ? 'advantage' : percent >= 25 ? 'contested' : 'lost';
    return { own: Math.round(own), enemy: Math.round(enemy), percent, level, tfs: ownTfs };
  }
  static LEVELS = { none: { label: '艦隊なし', color: '#8a9096' }, secured: { label: '制海権確保', color: '#3cc464' }, advantage: { label: '優勢', color: '#9ccc50' }, contested: { label: '拮抗', color: '#e0c040' }, lost: { label: '制海権喪失', color: '#e04a3c' } };
  static superiorityAt(pid) { const c = MapRenderer.provCentroid.get(pid); return c ? NavalForce.superiority(c[0], c[1]) : NavalForce.superiority(-1e9, -1e9); }
  /** 強襲上陸用: 上陸目標 (沿岸プロビンス) 近海の制海権 % */
  static invasionSuperiority(pid) { return NavalForce.superiorityAt(pid).percent; }
  static escortCover() {
    const n = NavalForce.tfs().filter(tf => tf.executing && tf.mission === 'escort').reduce((t, tf) => t + NavalForce.stats(tf).screens + NavalForce.stats(tf).capitals * 0.5, 0);
    return Math.min(0.8, n * 0.08);
  }

  // ==========================================================
  // 毎時処理
  // ==========================================================
  static onTick() {
    const s = CoreEngine.gameState, n = NavalForce.data();
    if (!n || !MapRenderer.ready) return;
    const hour = s.date instanceof Date ? s.date.getHours() : 0;
    const day = typeof GameTools !== 'undefined' ? GameTools.day() : 0;
    const fleets = NavalForce.enemyFleets();
    // 敵艦隊の漂泊 (基地周辺を周回)
    fleets.forEach(f => { if (!f.base) return; f.drift += 0.02; f.x = f.base[0] + Math.cos(f.drift) * 110; f.y = f.base[1] + Math.sin(f.drift) * 70; if (f.detected > 0) f.detected--; });
    const tfs = NavalForce.tfs();
    // 港での修理
    tfs.forEach(tf => { if (!tf.executing) NavalForce.shipsOf(tf).forEach(sh => { sh.hp = Math.min(sh.maxHp, sh.hp + sh.maxHp * 0.01); }); });
    n.ships.forEach(sh => { if (!sh.tf) sh.hp = Math.min(sh.maxHp, sh.hp + sh.maxHp * 0.01); });
    // 燃料
    if (hour === 0 && Number.isFinite(s.fuel)) {
      const use = tfs.filter(tf => tf.executing).reduce((t, tf) => t + NavalForce.stats(tf).fuel, 0);
      s.fuel = Math.max(0, s.fuel - use);
      if (use > 0 && s.fuel <= 0) tfs.forEach(tf => { if (tf.executing) { NavalForce.recall(tf.id); NavalForce.logEvent('⛽ 燃料枯渇: ' + tf.name + ' が帰投'); } });
    }
    // 任務ごとの処理
    const inBattle = new Set(n.battles.flatMap(b => b.tfIds));
    tfs.forEach(tf => {
      if (!tf.executing || !tf.zone || !tf.ships.length) return;
      const st = NavalForce.stats(tf);
      if (tf.mission === 'patrol') {
        fleets.forEach(f => {
          if (Math.hypot(f.x - tf.zone.x, f.y - tf.zone.y) > NavalForce.RADIUS) return;
          const spot = st.spot * 0.012 * (1 + (f.ships.length / 20));
          f.detectProgress = (f.detectProgress || 0) + spot;
          if (f.detectProgress >= 100) { f.detectProgress = 0; if (!f.detected) NavalForce.logEvent('🔭 ' + tf.name + ' が ' + f.name + ' (' + f.ships.length + '隻) を発見'); f.detected = 48; NavalForce.callStrike(f); }
        });
      }
      if (tf.mission === 'strike' && !inBattle.has(tf.id)) {
        const f = fleets.find(f => f.detected > 0 && Math.hypot(f.x - tf.zone.x, f.y - tf.zone.y) <= NavalForce.STRIKE_RANGE);
        if (f) { NavalForce.callStrike(f); inBattle.add(tf.id); }
      }
      if (tf.mission === 'raid' && !inBattle.has(tf.id) && (s.atWar || []).length) {
        const tag = s.atWar.find(t => t !== s.country);
        const acc = ProductionManager.account(tag), conv = Math.floor(Number(acc.stock?.convoys ?? 0) || 0);
        const escorts = fleets.filter(f => Math.hypot(f.x - tf.zone.x, f.y - tf.zone.y) <= NavalForce.RADIUS).reduce((t, f) => t + NavalForce.enemyStats(f).screens, 0);
        const chance = Math.min(0.5, st.torpedo * 0.004 / (1 + escorts * 0.25));
        if (conv > 0 && Math.random() < chance) {
          const sunk = Math.min(conv, 1 + Math.floor(Math.random() * Math.max(1, st.subs / 3)));
          acc.stock.convoys = conv - sunk; n.convoySunk = (n.convoySunk || 0) + sunk;
          NavalForce.logEvent('🐺 ' + tf.name + ' が ' + tag + ' の輸送船 ' + sunk + '隻を撃沈 (累計 ' + n.convoySunk + ')');
          NavalForce.shipsOf(tf).forEach(sh => { sh.xp = Math.min(100, sh.xp + 0.5); });
        } else if (escorts > 0 && Math.random() < 0.03 * escorts) {
          const sub = NavalForce.shipsOf(tf).filter(sh => NavalForce.SHIPS[sh.type].sub)[0] || NavalForce.shipsOf(tf)[0];
          if (sub) { sub.hp -= 25 + Math.random() * 20; if (sub.hp <= 0) NavalForce.sinkOwn(sub, tf, '敵護衛艦の爆雷攻撃'); else NavalForce.logEvent('💣 ' + tf.name + ' の ' + sub.name + ' が敵護衛に爆雷攻撃を受けた (HP ' + Math.round(sub.hp) + ')'); }
        }
      }
      // 敵の優勢艦隊に哨戒/護衛部隊が襲われる
      if (!inBattle.has(tf.id) && ['patrol', 'escort'].includes(tf.mission) && Math.random() < 0.015) {
        const f = fleets.find(f => Math.hypot(f.x - tf.zone.x, f.y - tf.zone.y) <= NavalForce.RADIUS && NavalForce.enemyStats(f).power > st.power * 1.2);
        if (f) NavalForce.startBattle([tf], f, tf.zone.pid, '敵艦隊の襲撃');
      }
    });
    // 海戦進行
    n.battles.slice().forEach(b => NavalForce.battleTick(b));
    // 制海権 (互換用グローバル値): 自軍任務海域の最大値
    const zones = tfs.filter(tf => tf.executing && tf.zone);
    s.navalSupremacy = zones.length ? Math.max(...zones.map(tf => NavalForce.superiority(tf.zone.x, tf.zone.y).percent)) : Math.max(0, (s.navalSupremacy || 0) - 0.5);
    if (hour === 0) { n.ships.forEach(sh => { if (sh.tf && NavalForce.tf(sh.tf)?.executing) sh.xp = Math.min(100, sh.xp + 0.3); }); }
    if (typeof WindowManager !== 'undefined' && WindowManager.isOpen('navy') && (hour % 3 === 0 || n.battles.length)) NavalForce.render();
    n.lastDay = day;
  }
  static callStrike(fleet) {
    const strikers = NavalForce.tfs().filter(tf => tf.executing && tf.mission === 'strike' && tf.ships.length && !NavalForce.data().battles.some(b => b.tfIds.includes(tf.id)) &&
      Math.hypot((tf.zone?.x ?? tf.base[0]) - fleet.x, (tf.zone?.y ?? tf.base[1]) - fleet.y) <= NavalForce.STRIKE_RANGE);
    if (!strikers.length) return;
    const existing = NavalForce.data().battles.find(b => b.enemyId === fleet.id);
    if (existing) { strikers.forEach(tf => { if (!existing.tfIds.includes(tf.id)) existing.tfIds.push(tf.id); }); return; }
    NavalForce.startBattle(strikers, fleet, null, '打撃群出撃');
  }
  static startBattle(tfs, fleet, pid, reason) {
    const n = NavalForce.data();
    const b = { id: 'nb' + Date.now().toString(36) + Math.floor(Math.random() * 1e3), enemyId: fleet.id, enemyTag: fleet.tag, enemyName: fleet.name, tfIds: tfs.map(t => t.id), x: fleet.x, y: fleet.y, pid: pid || tfs[0].zone?.pid || null, hours: 0, dealt: 0, taken: 0, sunkEnemy: 0, sunkOwn: 0, log: [], result: null };
    n.battles.push(b);
    NavalForce.logEvent('⚔️ 海戦発生: ' + tfs.map(t => t.name).join('・') + ' vs ' + fleet.name + ' (' + reason + ')', b);
    GameUI.notify('⚓ 海戦発生！ ' + fleet.name + ' と交戦開始', 'alert');
    return b;
  }
  static battleTick(b) {
    const n = NavalForce.data(), s = CoreEngine.gameState;
    const fleet = n.enemy[b.enemyId];
    const tfs = b.tfIds.map(id => NavalForce.tf(id)).filter(tf => tf && tf.ships.length);
    b.tfIds = tfs.map(t => t.id);
    if (!fleet || !fleet.ships.length || !tfs.length) { return NavalForce.endBattle(b, !fleet || !fleet.ships.length ? 'victory' : 'defeat'); }
    b.hours++;
    const own = tfs.flatMap(tf => NavalForce.shipsOf(tf)), ownStat = tfs.reduce((o, tf) => { const st = NavalForce.stats(tf); Object.keys(st).forEach(k => { o[k] = (o[k] || 0) + st[k]; }); return o; }, {});
    const en = NavalForce.enemyStats(fleet);
    const doctrine = typeof DoctrineManager !== 'undefined' ? (DoctrineManager.bonuses('naval') || {}) : {};
    const hit = 0.32 * (1 + (doctrine.navalHit || 0)), xpAvg = own.reduce((t, sh) => t + sh.xp, 0) / Math.max(1, own.length) / 100;
    // 自軍 → 敵: 砲撃 / 魚雷 / 艦載機
    const gunDmg = ownStat.gun * hit * (1 + xpAvg * 0.3);
    const torpDmg = ownStat.torpedo * 0.5 * (1 + (doctrine.submarineAttack || 0)) * (1 + xpAvg * 0.3);
    const airDmg = ownStat.planes * 1.4 / (1 + en.aa / 60);
    const pick = (ships, capitalOnly) => {
      const pool = ships.filter(sh => sh.hp > 0 && (!capitalOnly || NavalForce.SHIPS[sh.type].capital || sh.type === 'cruiser'));
      const list = pool.length ? pool : ships.filter(sh => sh.hp > 0);
      if (!list.length) return null;
      const w = list.map(sh => NavalForce.SHIPS[sh.type].screen ? 3 : NavalForce.SHIPS[sh.type].sub ? 0.6 : 1), total = w.reduce((a, c) => a + c, 0);
      let r = Math.random() * total; for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; } return list[list.length - 1];
    };
    const apply = (ships, dmg, capitalOnly, onSink) => {
      let left = dmg, dealt = 0;
      while (left > 0.5) {
        const t = pick(ships, capitalOnly); if (!t) break;
        const d = Math.min(left, 20 + Math.random() * 30); t.hp -= d; left -= d; dealt += d;
        if (t.hp <= 0) onSink(t);
      }
      return dealt;
    };
    b.dealt += apply(fleet.ships, gunDmg, false, (t) => NavalForce.sinkEnemy(t, fleet, b, '砲撃'));
    b.dealt += apply(fleet.ships, torpDmg, true, (t) => NavalForce.sinkEnemy(t, fleet, b, '魚雷'));
    if (airDmg > 0) b.dealt += apply(fleet.ships, airDmg, false, (t) => NavalForce.sinkEnemy(t, fleet, b, '艦載機'));
    // 敵 → 自軍
    const eGun = en.gun * 0.3, eTorp = en.torpedo * 0.45, eAir = en.planes * 1.2 / (1 + ownStat.aa / 60);
    const sinkOwn = (t) => { const tf = NavalForce.tf(t.tf); NavalForce.sinkOwn(t, tf, b.enemyName, b); };
    b.taken += apply(own, eGun, false, sinkOwn);
    b.taken += apply(own, eTorp, true, sinkOwn);
    if (eAir > 0) b.taken += apply(own, eAir, false, sinkOwn);
    if (b.hours % 2 === 0 || b.hours === 1) b.log.unshift(NavalForce.stamp() + ' 交戦 ' + b.hours + 'h: 与ダメージ ' + Math.round(gunDmg + torpDmg + airDmg) + ' / 被ダメージ ' + Math.round(eGun + eTorp + eAir) + (airDmg > 0 ? ' (艦載機 ' + Math.round(airDmg) + ')' : ''));
    b.log = b.log.slice(0, 40);
    // 終了判定
    const ownAlive = own.filter(sh => sh.hp > 0), enAlive = fleet.ships.filter(sh => sh.hp > 0);
    if (!enAlive.length) return NavalForce.endBattle(b, 'victory');
    if (!ownAlive.length) return NavalForce.endBattle(b, 'defeat');
    const ownRatio = ownAlive.reduce((t, sh) => t + sh.hp / sh.maxHp, 0) / ownAlive.length, enRatio = enAlive.reduce((t, sh) => t + sh.hp / sh.maxHp, 0) / enAlive.length;
    if (ownRatio < 0.35) return NavalForce.endBattle(b, 'retreat');
    if (enRatio < 0.3 || b.hours >= 14) return NavalForce.endBattle(b, enRatio < 0.3 ? 'enemy_retreat' : 'disengage');
    if (typeof BattlePlanManager !== 'undefined') BattlePlanManager._navalDirty = true;
  }
  static sinkEnemy(t, fleet, b, how) {
    fleet.ships = fleet.ships.filter(x => x !== t);
    b.sunkEnemy++;
    const d = NavalForce.SHIPS[t.type];
    NavalForce.logEvent('🔥 撃沈: 敵' + d.label + ' (' + fleet.name + ') を' + how + 'で撃沈', b);
    const own = b.tfIds.flatMap(id => NavalForce.shipsOf(NavalForce.tf(id) || { ships: [] })); const hero = own[Math.floor(Math.random() * own.length)]; if (hero) { hero.kills++; hero.xp = Math.min(100, hero.xp + 5); }
    // 敵の worldForces 艦数も減らす (艦隊の規模表示との整合)
    try { const src = IntelOperations.forces(fleet.tag).navy.find(x => x.id === fleet.id); if (src && src.count > 0) src.count--; } catch (e) { /* ignore */ }
  }
  static sinkOwn(t, tf, by, b) {
    const n = NavalForce.data(), d = NavalForce.SHIPS[t.type];
    NavalForce.detach(t);
    n.ships = n.ships.filter(x => x !== t);
    const stock = ProductionManager.account(CoreEngine.gameState.country).stock;
    if (stock) { stock[d.stock] = Math.max(0, Math.floor(Number(stock[d.stock]) || 0) - 1); ProductionManager.syncLocal?.(); }
    if (b) b.sunkOwn++;
    NavalForce.logEvent('🪦 喪失: ' + d.label + '「' + t.name + '」' + (tf ? ' (' + tf.name + ')' : '') + ' が ' + by + ' により沈没', b);
    GameUI.notify('⚓ ' + d.label + '「' + t.name + '」が沈没しました', 'alert');
  }
  static endBattle(b, result) {
    const n = NavalForce.data();
    b.result = result;
    const label = { victory: '勝利 — 敵艦隊を全滅', defeat: '敗北 — 部隊全滅', retreat: '撤退 — 損害過大のため離脱', enemy_retreat: '勝利 — 敵艦隊が退却', disengage: '引き分け — 交戦終了' }[result] || result;
    NavalForce.logEvent('🏁 海戦終了 (' + b.enemyName + '): ' + label + ' ／ 撃沈 ' + b.sunkEnemy + ' 喪失 ' + b.sunkOwn, b);
    GameUI.notify('⚓ 海戦終了: ' + label, result.startsWith('victory') || result === 'enemy_retreat' ? 'success' : 'alert');
    if (result === 'retreat' || result === 'defeat') b.tfIds.forEach(id => { const tf = NavalForce.tf(id); if (tf) { tf.executing = false; tf.progress = 0; } });
    if (['victory', 'enemy_retreat'].includes(result)) { const gs = CoreEngine.gameState; gs.xp = gs.xp || {}; gs.xp.navy = Math.min(9999, (Number(gs.xp.navy) || 0) + 5); gs.warSupport = Math.min(100, (gs.warSupport || 0) + 1); }
    const fleet = n.enemy[b.enemyId]; if (fleet && result === 'enemy_retreat' && fleet.base) { fleet.detected = 0; }
    n.history = [b, ...(n.history || [])].slice(0, 12);
    n.battles = n.battles.filter(x => x !== b);
    BattlePlanManager.renderPanel();
  }
  static stamp() { const d = CoreEngine.gameState.date; return d instanceof Date ? (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':00' : ''; }
  static logEvent(msg, b) {
    const n = NavalForce.data(); if (!n) return;
    n.log.unshift(NavalForce.stamp() + ' ' + msg); n.log = n.log.slice(0, 60);
    if (b) { b.log.unshift(NavalForce.stamp() + ' ' + msg); b.log = b.log.slice(0, 40); }
    CoreEngine.log(msg);
  }

  // ==========================================================
  // 地図描画
  // ==========================================================
  static draw(ctx, w2s) {
    const n = NavalForce.data(); if (!n) return;
    ctx.save();
    ctx.textAlign = 'center';
    // 任務海域の制海権
    NavalForce.tfs().forEach(tf => {
      if (!tf.executing || !tf.zone) return;
      const sup = NavalForce.superiority(tf.zone.x, tf.zone.y), lv = NavalForce.LEVELS[sup.level];
      const p = w2s(tf.zone.x, tf.zone.y);
      ctx.font = 'bold 11px sans-serif';
      const label = '⚓ ' + NavalForce.MISSIONS[tf.mission].label + ' ' + tf.ships.length + '隻 ・制海 ' + sup.percent + '%';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(8,18,30,0.78)'; ctx.fillRect(p[0] - w / 2, p[1] + 20, w, 16);
      ctx.strokeStyle = lv.color; ctx.strokeRect(p[0] - w / 2, p[1] + 20, w, 16);
      ctx.fillStyle = '#dfe9f5'; ctx.fillText(label, p[0], p[1] + 32);
    });
    // 発見済みの敵艦隊
    NavalForce.enemyFleets().forEach(f => {
      if (!f.detected) return;
      const p = w2s(f.x, f.y);
      ctx.fillStyle = 'rgba(224,74,60,0.9)'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText('⚓ ' + f.tag + ' ' + f.ships.length + '隻 (発見)', p[0], p[1] - 6);
      ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fill();
    });
    // 海戦
    n.battles.forEach(b => {
      const p = w2s(b.x, b.y);
      ctx.strokeStyle = 'rgba(255,120,60,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 14 + (b.hours % 3) * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd27a'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('💥 海戦 ' + b.hours + 'h  撃沈' + b.sunkEnemy + '/喪失' + b.sunkOwn, p[0], p[1] + 30);
    });
    ctx.restore();
  }

  // ==========================================================
  // UI
  // ==========================================================
  static render() {
    const el = document.getElementById('navy-content'); if (!el) return;
    if (typeof GameTools !== 'undefined' && GameTools.editing && GameTools.editing('navy-content')) return;
    const n = NavalForce.data(); if (!n) { el.innerHTML = '<p>ゲーム開始後に利用できます。</p>'; return; }
    const tfs = NavalForce.tfs(), s = CoreEngine.gameState;
    if (!NavalForce.selected || !tfs.some(t => t.id === NavalForce.selected)) NavalForce.selected = tfs[0]?.id || null;
    const ports = NavalForce.ports();
    const reserve = NavalForce.reserve();
    const totalShips = n.ships.length, atSea = tfs.filter(t => t.executing).reduce((a, t) => a + t.ships.length, 0);
    const html = '<div class="nf-root">' +
      '<div class="nf-header"><div class="nf-title"><div class="nf-mark">⚓</div><div><h3>海軍 <small>NAVAL WARFARE &amp; FLEETS</small></h3><p>艦艇 ' + totalShips + '隻 ／ 出撃中 ' + atSea + '隻 ／ 任務部隊 ' + tfs.length + ' ／ 海軍基地 ' + ports.filter(p => p.level > 0).length + ' ／ 燃料 ' + Math.floor(s.fuel || 0) + ' ／ 制海権(最大) ' + Math.round(s.navalSupremacy || 0) + '%</p></div></div>' +
      '<div class="nf-actions"><button class="dd-btn" onclick="NavalForce.createTF()">＋ 任務部隊を新設</button><button class="dd-btn" onclick="GameUI.switchTab(\'production\')">🏭 艦艇の建造</button></div></div>' +
      '<div class="nf-body">' +
      '<div class="nf-side">' + NavalForce.renderReserve(reserve) + NavalForce.renderPorts(ports) + '</div>' +
      '<div class="nf-main">' + (tfs.length ? tfs.map(tf => NavalForce.renderTF(tf, ports, reserve)).join('') : '<p class="sn-help">任務部隊がありません。「任務部隊を新設」で編成を始めてください。</p>') + '</div>' +
      '<div class="nf-side right">' + NavalForce.renderZones(tfs) + NavalForce.renderBattles(n) + '</div>' +
      '</div></div>';
    el.innerHTML = html;
  }
  static renderReserve(reserve) {
    let html = '<div class="dd-pane-title">予備艦艇 (母港待機)</div><div class="nf-stock">';
    NavalForce.ORDER.forEach(type => {
      const d = NavalForce.SHIPS[type], list = reserve.filter(sh => sh.type === type);
      html += '<div class="nf-stock-row"><span class="nf-ship-icon">' + d.icon + '</span><div><b>' + d.label + ' <small>' + d.short + '</small></b><small>HP' + d.hp + ' 砲' + d.gun + ' 対空' + d.aa + ' 魚雷' + d.torpedo + ' 視界' + d.spot + ' 燃料' + d.fuel + '/日</small></div><b class="nf-count">' + list.length + '</b></div>';
    });
    html += '</div><p class="sn-help">艦艇は「生産」で建造すると予備に加わります。任務部隊カードの ＋/− で配属します。</p>';
    return html;
  }
  static renderPorts(ports) {
    return '<div class="dd-pane-title">海軍基地</div>' + (ports.length ? ports.map(p => '<div class="nf-port"><b>⚓ ' + NavalForce.esc(p.name) + '</b><small>Lv.' + p.level + ' ／ 在泊 ' + NavalForce.tfs().filter(tf => tf.baseStateId === p.sid && !tf.executing).length + '部隊</small>' +
      '<button class="af-mini" onclick="ConstructionManager.selectState(\'' + p.sid + '\');GameUI.switchTab(\'construction\')">🏗️ 拡張</button></div>').join('') : '<p class="sn-help">海軍基地がありません。沿岸州に建設してください。</p>');
  }
  static renderTF(tf, ports, reserve) {
    const st = NavalForce.stats(tf), ships = NavalForce.shipsOf(tf), m = NavalForce.MISSIONS[tf.mission];
    const n = NavalForce.data(), battle = n.battles.find(b => b.tfIds.includes(tf.id));
    const zoneName = tf.zone ? (typeof WarSystems !== 'undefined' ? WarSystems.provinceName(tf.zone.pid) : '海域 ' + tf.zone.pid) : null;
    const sup = tf.zone ? NavalForce.superiority(tf.zone.x, tf.zone.y) : null;
    let html = '<div class="nf-tf' + (NavalForce.selected === tf.id ? ' selected' : '') + (tf.executing ? ' sailing' : '') + (battle ? ' battle' : '') + '" onclick="NavalForce.select(\'' + tf.id + '\');BattlePlanManager.activeForce=\'navy\';BattlePlanManager.selectedUnitId=\'' + tf.id + '\'">' +
      '<div class="nf-tf-head"><span class="nf-tf-icon">' + m.icon + '</span><input class="nf-name" value="' + NavalForce.esc(tf.name) + '" onchange="NavalForce.rename(\'' + tf.id + '\',this.value)" onclick="event.stopPropagation()">' +
      '<span class="nf-status' + (tf.executing ? ' on' : '') + (battle ? ' fight' : '') + '">' + (battle ? '⚔️ 交戦中 ' + battle.hours + 'h' : tf.executing ? '出撃中: ' + m.label + (zoneName ? ' @' + NavalForce.esc(zoneName) : '') : '在泊') + '</span></div>' +
      '<div class="nf-tf-grid">' +
      '<label>任務<select onchange="NavalForce.setMission(\'' + tf.id + '\',this.value)" onclick="event.stopPropagation()">' + Object.values(NavalForce.MISSIONS).map(x => '<option value="' + x.id + '"' + (x.id === tf.mission ? ' selected' : '') + '>' + x.icon + ' ' + x.label + '</option>').join('') + '</select></label>' +
      '<label>母港<select onchange="NavalForce.setPort(\'' + tf.id + '\',this.value)" onclick="event.stopPropagation()">' + ports.map(p => '<option value="' + p.sid + '"' + (p.sid === tf.baseStateId ? ' selected' : '') + '>' + NavalForce.esc(p.name) + ' Lv' + p.level + '</option>').join('') + '</select></label>' +
      '<label>任務海域<b>' + (zoneName ? NavalForce.esc(zoneName) : '<span class="sn-help">未指定 — 部隊を選択してマップの海域をクリック</span>') + '</b></label>' +
      '<label>制海権<b style="color:' + (sup ? NavalForce.LEVELS[sup.level].color : '#8a9096') + '">' + (sup ? sup.percent + '% (' + NavalForce.LEVELS[sup.level].label + ')' : '—') + '</b></label>' +
      '</div>' +
      '<p class="nf-mission-desc">' + m.desc + '</p>' +
      '<div class="nf-comp">' + NavalForce.ORDER.map(type => {
        const d = NavalForce.SHIPS[type], cnt = ships.filter(sh => sh.type === type).length, avail = reserve.filter(sh => sh.type === type).length;
        return '<div class="nf-comp-row"><span>' + d.icon + ' ' + d.label + '</span><div class="nf-comp-ctl"><button class="af-mini" ' + (cnt ? '' : 'disabled') + ' onclick="event.stopPropagation();NavalForce.move(\'' + tf.id + '\',\'' + type + '\',-1)">−</button><b>' + cnt + '</b><button class="af-mini" ' + (avail ? '' : 'disabled') + ' onclick="event.stopPropagation();NavalForce.move(\'' + tf.id + '\',\'' + type + '\',1)">＋</button><button class="af-mini" ' + (avail ? '' : 'disabled') + ' title="予備を全て配属" onclick="event.stopPropagation();NavalForce.move(\'' + tf.id + '\',\'' + type + '\',99)">全</button></div></div>';
      }).join('') + '</div>' +
      '<div class="nf-stats">' + [['耐久', Math.round(st.hp) + '/' + st.maxHp], ['火力', Math.round(st.gun)], ['対空', Math.round(st.aa)], ['魚雷', Math.round(st.torpedo)], ['視界', Math.round(st.spot)], ['燃料/日', st.fuel.toFixed(1)], ['艦載機', Math.round(st.planes)], ['速力', st.speed + 'kt']].map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' +
      (ships.length ? '<div class="nf-ships">' + ships.map(sh => { const d = NavalForce.SHIPS[sh.type], pct = Math.round(sh.hp / sh.maxHp * 100); return '<div class="nf-ship' + (pct < 40 ? ' dmg' : '') + '" title="' + NavalForce.esc(sh.name) + ' ' + d.label + ' HP ' + Math.round(sh.hp) + '/' + sh.maxHp + ' 練度 ' + Math.round(sh.xp) + ' 撃沈 ' + sh.kills + '"><span>' + d.icon + ' ' + NavalForce.esc(sh.name) + '</span><em><i style="width:' + pct + '%"></i></em><small>' + pct + '%' + (sh.kills ? ' ★' + sh.kills : '') + '</small>' + (!tf.executing ? '<button class="af-mini" onclick="event.stopPropagation();NavalForce.moveShip(\'' + sh.id + '\',null)" title="予備へ戻す">×</button>' : '') + '</div>'; }).join('') + '</div>' : '<p class="sn-help">艦艇が配属されていません。</p>') +
      (battle ? '<div class="nf-battle-live"><b>⚔️ ' + NavalForce.esc(battle.enemyName) + ' と交戦中</b> 与ダメージ ' + Math.round(battle.dealt) + ' ／ 被ダメージ ' + Math.round(battle.taken) + ' ／ 撃沈 ' + battle.sunkEnemy + ' ／ 喪失 ' + battle.sunkOwn + '<div class="nf-log small">' + battle.log.slice(0, 5).map(l => '<div>' + NavalForce.esc(l) + '</div>').join('') + '</div></div>' : '') +
      '<div class="nf-tf-foot">' +
      (tf.executing ? '<button class="dd-btn" onclick="event.stopPropagation();NavalForce.recall(\'' + tf.id + '\')">⏎ 帰投</button>' : '<button class="dd-btn primary" ' + (tf.ships.length && tf.zone ? '' : 'disabled') + ' onclick="event.stopPropagation();NavalForce.sortie(\'' + tf.id + '\')">⚓ 出撃</button>') +
      '<button class="dd-btn" ' + (tf.ships.length >= 2 && !tf.executing ? '' : 'disabled') + ' onclick="event.stopPropagation();NavalForce.split(\'' + tf.id + '\')">✂ 分割</button>' +
      (tf.zone ? '<button class="dd-btn" onclick="event.stopPropagation();NavalForce.openZoneModal(' + tf.zone.pid + ')">🌊 海域情報</button>' : '') +
      '<button class="dd-btn danger" onclick="event.stopPropagation();NavalForce.disbandTF(\'' + tf.id + '\')">解隊</button>' +
      '</div></div>';
    return html;
  }
  static renderZones(tfs) {
    const seen = new Map();
    tfs.forEach(tf => { if (tf.zone && tf.executing && !seen.has(tf.zone.pid)) seen.set(tf.zone.pid, tf.zone); });
    let html = '<div class="dd-pane-title">任務海域と制海権</div>';
    if (!seen.size) html += '<p class="sn-help">出撃中の部隊がありません。</p>';
    seen.forEach((z, pid) => {
      const sup = NavalForce.superiority(z.x, z.y), lv = NavalForce.LEVELS[sup.level];
      const name = typeof WarSystems !== 'undefined' ? WarSystems.provinceName(pid) : '海域 ' + pid;
      html += '<div class="nf-zone" onclick="NavalForce.openZoneModal(' + pid + ')"><b>🌊 ' + NavalForce.esc(name) + '</b><div class="af-sup"><em style="width:' + sup.percent + '%"></em><span>' + sup.percent + '% ' + lv.label + '</span></div><small>自軍 ' + sup.own + ' vs 敵 ' + sup.enemy + ' ／ ' + sup.tfs.map(t => NavalForce.esc(t.name)).join('・') + '</small></div>';
    });
    const fleets = NavalForce.enemyFleets().filter(f => f.detected);
    html += '<div class="dd-pane-title">発見した敵艦隊</div>' + (fleets.length ? fleets.map(f => { const es = NavalForce.enemyStats(f); return '<div class="nf-zone enemy"><b>⚓ ' + NavalForce.esc(f.name) + ' (' + f.tag + ')</b><small>' + f.ships.length + '隻 ／ 戦力 ' + Math.round(es.power) + ' ／ 接触維持 ' + f.detected + 'h</small></div>'; }).join('') : '<p class="sn-help">哨戒任務で敵艦隊を捜索してください。</p>');
    return html;
  }
  static renderBattles(n) {
    let html = '<div class="dd-pane-title">海戦ログ</div><div class="nf-log">' + (n.log.length ? n.log.slice(0, 25).map(l => '<div>' + NavalForce.esc(l) + '</div>').join('') : '<span class="sn-help">まだ記録がありません。</span>') + '</div>';
    if (n.history?.length) html += '<div class="dd-pane-title">過去の海戦</div>' + n.history.slice(0, 6).map(b => '<div class="nf-zone"><b>' + NavalForce.esc(b.enemyName) + '</b><small>' + b.hours + 'h ／ 撃沈 ' + b.sunkEnemy + ' 喪失 ' + b.sunkOwn + ' ／ ' + ({ victory: '勝利', defeat: '敗北', retreat: '撤退', enemy_retreat: '敵退却', disengage: '引き分け' })[b.result] + '</small></div>').join('');
    return html;
  }
  static summaryLine(sid) {
    const st = MapRenderer.states[sid]; if (!st) return '';
    const lv = Number(st.b?.naval_base) || 0;
    const coast = (st.provinces || []).find(p => MapRenderer.provinces.p[p]?.[4]);
    if (!lv && !coast) return '';
    const sup = coast ? NavalForce.superiorityAt(coast) : null;
    return '<span style="font-size:11px;color:#6fb3e0">⚓ 海軍基地 Lv.' + lv + (sup && sup.level !== 'none' ? ' ／ 近海制海権 ' + sup.percent + '%' : '') + '</span> <button class="map-info-build-btn" onclick="GameUI.switchTab(\'navy\')">⚓ 艦隊管理</button>';
  }
  static seaOverlay(pid) {
    const sup = NavalForce.superiorityAt(pid), lv = NavalForce.LEVELS[sup.level];
    return '<br><span style="font-size:11px;color:' + lv.color + '">⚓ 制海権 ' + (sup.level === 'none' ? 'なし' : sup.percent + '% (' + lv.label + ')') + '</span> <button class="map-info-build-btn" onclick="NavalForce.openZoneModal(' + pid + ')">🌊 海域・艦隊管理</button>';
  }
  static openZoneModal(pid, unit) {
    if (!pid) return;
    const c = MapRenderer.provCentroid.get(pid); if (!c) return;
    const n = NavalForce.data();
    const sup = NavalForce.superiority(c[0], c[1]), lv = NavalForce.LEVELS[sup.level];
    const name = typeof WarSystems !== 'undefined' ? WarSystems.provinceName(pid) : '海域 ' + pid;
    const tfs = NavalForce.tfs();
    const here = tfs.filter(tf => tf.zone && Math.hypot(tf.zone.x - c[0], tf.zone.y - c[1]) <= NavalForce.RADIUS);
    const fleets = NavalForce.enemyFleets().filter(f => Math.hypot(f.x - c[0], f.y - c[1]) <= NavalForce.RADIUS);
    const battles = n.battles.filter(b => Math.hypot(b.x - c[0], b.y - c[1]) <= NavalForce.RADIUS);
    const html = '<div class="af-modal">' +
      '<div class="af-modal-head"><span>🌊</span><div><h3>海域: ' + NavalForce.esc(name) + '</h3><small>海域ID ' + pid + ' ／ 影響半径内の部隊 ' + here.length + ' ／ 敵艦隊 ' + fleets.filter(f => f.detected).length + ' (発見済)' + '</small></div></div>' +
      '<div class="af-modal-sup"><div class="af-sup big"><em style="width:' + sup.percent + '%"></em><span>' + (sup.level === 'none' ? '艦隊が展開していません' : '自軍 ' + sup.percent + '% ／ 敵軍 ' + (100 - sup.percent) + '%') + '</span></div>' +
      '<div class="af-modal-row"><span>状態</span><b style="color:' + lv.color + '">' + lv.label + '</b></div><div class="af-modal-row"><span>自軍戦力 / 敵戦力</span><b>' + sup.own + ' / ' + sup.enemy + '</b></div><div class="af-modal-row"><span>強襲上陸</span><b>' + (sup.percent >= 25 ? '✅ 可能 (制海権25%以上)' : '❌ 不可 (制海権25%未満)') + '</b></div></div>' +
      (battles.length ? '<div class="af-modal-list"><h4>⚔️ 進行中の海戦</h4>' + battles.map(b => '<div><b>' + NavalForce.esc(b.enemyName) + '</b> ' + b.hours + 'h ／ 撃沈 ' + b.sunkEnemy + ' 喪失 ' + b.sunkOwn + '<div class="nf-log small">' + b.log.slice(0, 4).map(l => '<div>' + NavalForce.esc(l) + '</div>').join('') + '</div></div>').join('') + '</div>' : '') +
      '<div class="af-modal-list"><h4>展開中の任務部隊</h4>' + (here.length ? here.map(tf => '<div>' + NavalForce.MISSIONS[tf.mission].icon + ' ' + NavalForce.esc(tf.name) + ' — ' + NavalForce.MISSIONS[tf.mission].label + ' ' + tf.ships.length + '隻' + (tf.executing ? '' : ' (在泊)') + '</div>').join('') : '<div class="sn-help">なし</div>') + '</div>' +
      '<div class="af-modal-list"><h4>敵艦隊 (半径内)</h4>' + (fleets.length ? fleets.map(f => '<div>' + (f.detected ? '🔴 ' : '❔ ') + NavalForce.esc(f.name) + ' ' + (f.detected ? f.ships.length + '隻 ／ 戦力 ' + Math.round(NavalForce.enemyStats(f).power) : '未発見 (哨戒で捜索 ' + Math.round(f.detectProgress || 0) + '%)') + '</div>').join('') : '<div class="sn-help">敵艦隊の反応なし</div>') + '</div>' +
      '<div class="af-modal-list"><h4>この海域に任務部隊を派遣</h4>' + (tfs.length ? tfs.map(tf => '<div class="nf-dispatch"><span>' + NavalForce.esc(tf.name) + ' (' + tf.ships.length + '隻)</span>' + Object.values(NavalForce.MISSIONS).map(m => '<button class="af-mini' + (tf.zone?.pid === pid && tf.mission === m.id && tf.executing ? ' on' : '') + '" ' + (tf.ships.length ? '' : 'disabled') + ' onclick="NavalForce.setMission(\'' + tf.id + '\',\'' + m.id + '\');NavalForce.assignZone(\'' + tf.id + '\',' + pid + ')">' + m.icon + ' ' + m.label + '</button>').join('') + '</div>').join('') : '<div class="sn-help">任務部隊がありません。</div>') + '</div>' +
      '<div class="af-modal-actions"><button class="dd-btn" onclick="GameUI.closeModal();GameUI.switchTab(\'navy\')">⚓ 海軍ウィンドウ</button><button class="dd-btn" onclick="GameUI.closeModal()">閉じる</button></div></div>';
    GameUI.openModal('🌊 海域情報 — ' + name, html);
  }
}
if (typeof window !== 'undefined') window.NavalForce = NavalForce;
