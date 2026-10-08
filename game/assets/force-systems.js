'use strict';

class ForceSystems {
  static data = [];
  static initialized = false;
  static lastOccupationDay = null;
  static subjectModalOpen = false;
  static AIRCRAFT_BASE_RANGE = 320;
  static AIR_RANGE_WARNING = '射程外: 兵器設計で増槽を装着するか、前線基地へ移転してください';
  static OCCUPATION_INTERVAL_DAYS = 14;
  static OCCUPATION_PROGRESS_PER_INTERVAL = 3;

  static async init() {
    if (ForceSystems.initialized) return;
    const response = await fetch('assets/doctrine_data.json');
    if (!response.ok) throw new Error('ドクトリン定義を読み込めません (' + response.status + ')');
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.doctrines) ||
        payload.doctrines.some(item => !item.id || !['army', 'navy', 'air'].includes(item.force) ||
          !item.title || !item.description || !item.icon || !item.effects)) {
      throw new Error('ドクトリン定義の形式が不正です。');
    }
    ForceSystems.data = payload.doctrines;
    ForceSystems.ensureState();
    ForceSystems.install();
    ForceSystems.initialized = true;
  }

  static ensureState() {
    const gs = CoreEngine.gameState;
    if (!Array.isArray(gs.puppets)) gs.puppets = [];
    gs.forceSystems ||= {};
    gs.forceSystems.doctrines ||= {};
    gs.forceSystems.occupations ||= {};
    gs.forceSystems.unifiedCountries ||= [];
    if (gs.forceSystems.lastOccupationDay === undefined) gs.forceSystems.lastOccupationDay = null;
    if (gs.country === 'JAP' && !gs.forceSystems.unifiedCountries.includes('MAN')) {
      const manchukuo = gs.puppets.find(item => (typeof item === 'string' ? item : item?.tag) === 'MAN');
      if (!manchukuo) gs.puppets.push({ tag: 'MAN', overlord: 'JAP', name: '満州国' });
    }
  }

  static install() {
    ForceSystems.ensureState();
    GameTools.window('force-doctrine', '📜 軍集団ドクトリン', () => ForceSystems.renderDoctrines(), 850);
    const flag = document.getElementById('player-flag');
    if (flag) {
      flag.title = '被支配国・占領地を管理';
      flag.setAttribute('aria-label', '被支配国・占領地を管理');
      flag.onclick = () => ForceSystems.openSubjects();
    }
    const closeModal = GameUI.closeModal.bind(GameUI);
    GameUI.closeModal = function () {
      ForceSystems.subjectModalOpen = false;
      return closeModal();
    };
    const openModal = GameUI.openModal.bind(GameUI);
    GameUI.openModal = function (title, bodyHtml) {
      ForceSystems.subjectModalOpen = title === '被支配国・占領地';
      return openModal(title, bodyHtml);
    };
    ForceSystems.patchCommanderSlots();
    ForceSystems.patchBattleBonuses();
    ForceSystems.patchAirRange();
    ForceSystems.patchAircraftDesign();
    ForceSystems.patchOccupationCapture();
    const onMapReady = BattlePlanManager.onMapReady.bind(BattlePlanManager);
    BattlePlanManager.onMapReady = function () {
      onMapReady();
      ForceSystems.initializeGroups();
      ForceSystems.syncOccupationSubjects(ForceSystems.currentDay());
    };
    CoreEngine.registerTickCallback(() => ForceSystems.onTick());
    if (MapRenderer.ready) ForceSystems.initializeGroups();
  }

  static groups(force) {
    if (force === 'army') return BattlePlanManager.armies || [];
    if (force === 'navy') return BattlePlanManager.navy || [];
    if (force === 'air') return BattlePlanManager.air || [];
    return [];
  }

  static forceLabel(force) {
    return ({ army: '陸軍', navy: '海軍', air: '空軍' })[force] || force;
  }

  static forceType(force) {
    return ({ army: 'army_leader', navy: 'navy_leader', air: 'air_leader' })[force] || null;
  }

  static cardType(card) {
    const explicit = card?.type;
    if (['army_leader', 'navy_leader', 'air_leader'].includes(explicit)) return explicit;
    const legacy = { general: 'army_leader', navy: 'navy_leader', air: 'air_leader' };
    return legacy[explicit] || null;
  }

  static commander(group) {
    return group?.commander || (group?.general ? {
      ...group.general,
      stats: group.general.stats || {}
    } : null);
  }

  static allGroups() {
    return ['army', 'navy', 'air'].flatMap(force =>
      ForceSystems.groups(force).map(group => ({ force, group })));
  }

  static assignedCardKey(card) {
    return String(card?.country || '') + ':' + String(card?.id || '');
  }

  static openCommander(force, groupId) {
    const group = ForceSystems.groups(force).find(item => String(item.id) === String(groupId));
    if (!group) return;
    const player = CoreEngine.gameState.country;
    const cards = (CardSystem.hiredCards || []).filter(card =>
      card.country === player && ForceSystems.cardType(card) === ForceSystems.forceType(force));
    let html = '<p class="force-help">雇用済みの' + ForceSystems.forceLabel(force) +
      '指揮官のみ割り当てできます。同一カードを複数の軍集団には配置できません。</p>';
    const current = ForceSystems.commander(group);
    if (current) {
      html += '<div class="force-commander-current"><b>現在:</b> ' +
        ForceSystems.escape(current.name || current.id) + ' <button onclick="ForceSystems.clearCommander(\'' +
        force + '\',\'' + ForceSystems.escapeAttr(group.id) + '\')">解任</button></div>';
    }
    if (!cards.length) html += '<p class="force-empty">割り当て可能な指揮官カードがありません。</p>';
    html += '<div class="force-card-list">' + cards.map(card => {
      const stats = ForceSystems.cardStats(card);
      const assignment = ForceSystems.allGroups().find(({ group: item }) =>
        ForceSystems.assignedCardKey(ForceSystems.commander(item)) === ForceSystems.assignedCardKey(card));
      const assignedHere = assignment?.group === group;
      const status = assignment
        ? 'Assigned: ' + (assignedHere ? 'この軍集団' : ForceSystems.escape(assignment.group.name || ForceSystems.forceLabel(assignment.force)))
        : '未配属';
      return '<button class="force-card-option" ' + (assignment ? 'disabled ' : '') +
        'onclick="ForceSystems.assignCommander(\'' + force + '\',\'' +
        ForceSystems.escapeAttr(group.id) + '\',\'' + ForceSystems.escapeAttr(card.id) + '\',\'' +
        ForceSystems.escapeAttr(card.country) + '\')"><b>' + ForceSystems.escape(card.name || card.id) +
        '</b><span>' + ForceSystems.escape(card.rank || 'R') + ' · 攻 ' + stats.attack +
        ' / 防 ' + stats.defense + ' / 技 ' + stats.skill + ' · ' + status + '</span></button>';
    }).join('') + '</div>';
    GameUI.openModal(ForceSystems.forceLabel(force) + '指揮官の配属 — ' +
      ForceSystems.escape(group.name || ('部隊 ' + group.id)), html);
  }

  static cardStats(card) {
    const source = card?.stats || card || {};
    return {
      attack: Math.max(0, Number(source.attack) || 0),
      defense: Math.max(0, Number(source.defense) || 0),
      skill: Math.max(0, Number(source.skill) || 0)
    };
  }

  static assignCommander(force, groupId, cardId, country) {
    const group = ForceSystems.groups(force).find(item => String(item.id) === String(groupId));
    const card = (CardSystem.hiredCards || []).find(item =>
      item.id === cardId && item.country === country && item.country === CoreEngine.gameState.country);
    if (!group || !card || ForceSystems.cardType(card) !== ForceSystems.forceType(force)) {
      GameUI.notify('この軍集団に割り当てられる指揮官カードではありません。', 'alert');
      return false;
    }
    const assigned = ForceSystems.allGroups().some(({ group: item }) =>
      item !== group && ForceSystems.assignedCardKey(ForceSystems.commander(item)) === ForceSystems.assignedCardKey(card));
    if (assigned) {
      GameUI.notify('この指揮官はすでに別の軍集団へ配属されています。', 'alert');
      return false;
    }
    const commander = {
      id: card.id,
      country: card.country,
      name: card.name || card.id,
      rank: card.rank || 'R',
      type: ForceSystems.cardType(card),
      stats: ForceSystems.cardStats(card)
    };
    group.commander = commander;
    if (force === 'army') group.general = commander;
    else group.general = null;
    MultiplayerManager.broadcast({ type: 'force_commander', force, id: group.id, commander });
    GameUI.closeModal();
    ForceSystems.refresh();
    return true;
  }

  static clearCommander(force, groupId) {
    const group = ForceSystems.groups(force).find(item => String(item.id) === String(groupId));
    if (!group) return;
    group.commander = null;
    if (force === 'army') group.general = null;
    MultiplayerManager.broadcast({ type: 'force_commander', force, id: group.id, commander: null });
    GameUI.closeModal();
    ForceSystems.refresh();
  }

  static patchCommanderSlots() {
    const manager = BattlePlanManager;
    manager.assignGeneral = armyId => ForceSystems.openCommander('army', armyId);
    manager.assignForceCommander = (force, id) => ForceSystems.openCommander(force, id);
    const addArmy = manager.addArmy.bind(manager);
    manager.addArmy = () => {
      const result = addArmy();
      ForceSystems.refresh();
      return result;
    };
    const originalPick = manager.pickGeneral?.bind(manager);
    if (originalPick) {
      manager.pickGeneral = (armyId, cardId) => {
        const card = (CardSystem.hiredCards || []).find(item => item.id === cardId);
        if (!card || ForceSystems.cardType(card) !== 'army_leader') return false;
        return ForceSystems.assignCommander('army', armyId, cardId, card.country);
      };
    }
  }

  static doctrine(force, group) {
    const id = CoreEngine.gameState.forceSystems.doctrines[group?.id];
    return ForceSystems.data.find(item => item.id === id && item.force === force) || null;
  }

  static bonuses(force, group) {
    const doctrine = ForceSystems.doctrine(force, group);
    const result = { ...(doctrine?.effects || {}) };
    const stats = ForceSystems.cardStats(ForceSystems.commander(group));
    result.leaderAttack = stats.attack / 100 + stats.skill / 200;
    result.leaderDefense = stats.defense / 100 + stats.skill / 200;
    return result;
  }

  static renderDoctrines() {
    const el = document.getElementById('force-doctrine-content');
    if (!el) return;
    ForceSystems.ensureState();
    const force = el.dataset.force || 'army';
    const groups = ForceSystems.groups(force);
    const groupId = el.dataset.groupId || (groups[0] ? String(groups[0].id) : '');
    const group = groups.find(item => String(item.id) === groupId) || groups[0];
    if (group) el.dataset.groupId = String(group.id);
    el.dataset.force = force;
    const selectedId = group ? CoreEngine.gameState.forceSystems.doctrines[group.id] || '' : '';
    let html = '<div class="force-doctrine-toolbar"><label>軍種 <select onchange="ForceSystems.setForce(this.value)">' +
      ['army', 'navy', 'air'].map(item => '<option value="' + item + '"' + (force === item ? ' selected' : '') +
        '>' + ForceSystems.forceLabel(item) + '</option>').join('') +
      '</select></label><label>軍集団 <select onchange="ForceSystems.setGroup(this.value)">' +
      (groups.length ? groups.map(item => '<option value="' + ForceSystems.escapeAttr(item.id) + '"' +
        (group === item ? ' selected' : '') + '>' + ForceSystems.escape(item.name || ('部隊 ' + item.id)) +
        '</option>').join('') : '<option value="">利用可能な軍集団はありません</option>') + '</select></label></div>';
    if (!group) {
      el.innerHTML = html + '<p class="force-empty">マップを読み込むと軍集団が利用できます。</p>';
      return;
    }
    const doctrines = ForceSystems.data.filter(item => item.force === force);
    html += '<p class="force-help">選択した軍集団だけに適用されます。効果は戦闘計算に反映されます。</p>' +
      '<div class="force-doctrine-grid">' + doctrines.map(item => {
        const chosen = item.id === selectedId;
        const stats = Object.entries(item.effects).map(([key, value]) =>
          '<span>' + ForceSystems.escape(ForceSystems.effectLabel(key)) + ' <b>' +
          (value < 0 ? '-' : '+') + Math.round(Math.abs(value) * 100) + '%</b></span>').join('');
        return '<article class="force-doctrine-card' + (chosen ? ' selected' : '') + '">' +
          '<img src="' + ForceSystems.escape(item.icon) + '" alt="" loading="lazy"><div><h3>' +
          ForceSystems.escape(item.title) + '</h3><p>' + ForceSystems.escape(item.description) +
          '</p><div class="force-doctrine-effects">' + stats + '</div><button onclick="ForceSystems.selectDoctrine(\'' +
          force + '\',\'' + ForceSystems.escapeAttr(group.id) + '\',\'' + ForceSystems.escapeAttr(item.id) +
          '\')">' + (chosen ? '適用中' : 'この教義を適用') + '</button></div></article>';
      }).join('') + '</div>';
    el.innerHTML = html;
  }

  static effectLabel(key) {
    return ({
      orgRecovery: '組織力回復', softAttack: 'ソフトアタック', hardAttack: 'ハードアタック',
      breakthrough: '突破', defense: '防御', visibility: '視認性低下',
      fleetAttack: '艦隊決戦火力', submarineAttack: '潜水艦攻撃力',
      antiSubmarine: '対潜哨戒', carrierSortie: '空母発艦率',
      airSuperiority: '制空権', casDamage: 'CAS威力',
      bombingAccuracy: '爆撃精度', dogfightEvasion: 'ドッグファイト回避',
      allWeather: '全天候飛行'
    })[key] || key;
  }

  static setForce(force) {
    const el = document.getElementById('force-doctrine-content');
    if (!['army', 'navy', 'air'].includes(force) || !el) return;
    el.dataset.force = force;
    el.dataset.groupId = String(ForceSystems.groups(force)[0]?.id || '');
    ForceSystems.renderDoctrines();
  }

  static setGroup(id) {
    const el = document.getElementById('force-doctrine-content');
    if (!el) return;
    el.dataset.groupId = String(id);
    ForceSystems.renderDoctrines();
  }

  static selectDoctrine(force, groupId, doctrineId) {
    const group = ForceSystems.groups(force).find(item => String(item.id) === String(groupId));
    const doctrine = ForceSystems.data.find(item => item.id === doctrineId && item.force === force);
    if (!group || !doctrine) return false;
    CoreEngine.gameState.forceSystems.doctrines[group.id] = doctrine.id;
    MultiplayerManager.broadcast({ type: 'force_doctrine', force, id: group.id, doctrineId });
    ForceSystems.renderDoctrines();
    BattlePlanManager.renderPanel();
    return true;
  }

  static patchBattleBonuses() {
    if (BattleManager._forceBonusesInstalled) return;
    const attackProfile = BattleManager.attackProfile.bind(BattleManager);
    BattleManager.attackProfile = army => {
      const result = attackProfile(army);
      const bonus = ForceSystems.bonuses('army', army);
      result.soft *= 1 + (Number(bonus.softAttack) || 0) + bonus.leaderAttack;
      result.hard *= 1 + (Number(bonus.hardAttack) || 0) +
        (Number(bonus.breakthrough) || 0) + bonus.leaderAttack;
      return result;
    };
    const calcAdvantage = BattleManager.calcOffensiveAdvantage.bind(BattleManager);
    BattleManager.calcOffensiveAdvantage = (army, state) => {
      const bonus = ForceSystems.bonuses('army', army);
      const advantage = calcAdvantage(army, state);
      const averageOrg = (army?.divisions || []).reduce((sum, division) =>
        sum + (Number(division.org) || 0), 0) / Math.max(1, army?.divisions?.length || 0);
      return Math.max(-1, Math.min(1, advantage +
        (Number(bonus.defense) || 0) * 0.25 +
        (Number(bonus.orgRecovery) || 0) * (averageOrg < 50 ? 0.04 : 0) +
        (Number(bonus.leaderDefense) || 0) * 0.25));
    };
    const tickArmy = OffensivePlanner.tickArmy.bind(OffensivePlanner);
    OffensivePlanner.tickArmy = army => {
      const before = (army?.divisions || []).map(division => Number(division.org) || 0);
      const result = tickArmy(army);
      const bonus = Number(ForceSystems.bonuses('army', army).orgRecovery) || 0;
      if (bonus > 0 && !BattleManager.battles.some(battle => battle.attackerArmyId === army?.id)) {
        army.divisions.forEach((division, index) => {
          const recovered = Math.max(0, (Number(division.org) || 0) - (before[index] || 0));
          division.org = Math.min(Number(division.maxOrg) || 100,
            (Number(division.org) || 0) + recovered * bonus);
        });
      }
      return result;
    };
    const supportBonus = BattleManager.supportBonus.bind(BattleManager);
    BattleManager.supportBonus = state => {
      let bonus = supportBonus(state);
      const stateId = Object.keys(MapRenderer.states || {}).find(id => MapRenderer.states[id] === state);
      const center = MapRenderer.stateCenter.get(String(stateId));
      [...(BattlePlanManager.navy || []), ...(BattlePlanManager.air || [])].forEach(unit => {
        if (!unit.executing || !unit.zone) return;
        if (!center || Math.hypot(unit.zone.x - center[0], unit.zone.y - center[1]) > 220) return;
        const groupForce = unit.type === 'air' ? 'air' : 'navy';
        const buffs = ForceSystems.bonuses(groupForce, unit);
        if (unit.type === 'air') {
          if (unit.mission === 'ground') bonus += Number(buffs.casDamage) || 0;
          if (unit.mission === 'air_sup') bonus += Number(buffs.airSuperiority) || 0;
          if (unit.mission === 'strategic') bonus += Number(buffs.bombingAccuracy) || 0;
          bonus += Number(buffs.allWeather) * 0.1 || 0;
          bonus += Number(buffs.dogfightEvasion) * 0.1 || 0;
        } else {
          if (unit.mission === 'strike' || unit.mission === 'shore') bonus += Number(buffs.fleetAttack) || 0;
          if (unit.mission === 'patrol') bonus += Number(buffs.antiSubmarine) || 0;
          if (unit.mission === 'escort') bonus += Number(buffs.visibility) * -1 || 0;
          bonus += Number(buffs.submarineAttack) * 0.1 || 0;
          if (unit.mission === 'strike' || unit.mission === 'shore') bonus += Number(buffs.carrierSortie) * 0.1 || 0;
        }
        bonus += (ForceSystems.cardStats(ForceSystems.commander(unit)).attack +
          ForceSystems.cardStats(ForceSystems.commander(unit)).skill) / 1000;
      });
      return Math.min(0.6, bonus);
    };
    const applyForceAction = BattlePlanManager.applyForceAction.bind(BattlePlanManager);
    BattlePlanManager.applyForceAction = unit => {
      applyForceAction(unit);
      const buffs = ForceSystems.bonuses(unit.type === 'air' ? 'air' : 'navy', unit);
      const leader = ForceSystems.cardStats(ForceSystems.commander(unit));
      if (unit.type === 'air' && unit.mission === 'air_sup') {
        CoreEngine.gameState.airSupremacy = Math.min(100,
          (Number(CoreEngine.gameState.airSupremacy) || 0) +
          0.3 * ((Number(buffs.airSuperiority) || 0) + leader.skill / 100));
      }
      if (unit.type === 'navy' && unit.mission === 'patrol') {
        CoreEngine.gameState.navalSupremacy = Math.min(100,
          (Number(CoreEngine.gameState.navalSupremacy) || 0) +
          0.3 * ((Number(buffs.antiSubmarine) || 0) + leader.skill / 100));
      }
    };
    const convoyDamage = BattlePlanManager.applyConvoyDamage.bind(BattlePlanManager);
    BattlePlanManager.applyConvoyDamage = (enemyTag, pressure) => {
      const strikePower = (BattlePlanManager.navy || []).reduce((total, unit) => {
        if (!unit.executing || unit.mission !== 'strike') return total;
        const buffs = ForceSystems.bonuses('navy', unit);
        const leader = ForceSystems.cardStats(ForceSystems.commander(unit));
        return total + (Number(buffs.fleetAttack) || 0) +
          (Number(buffs.submarineAttack) || 0) * 0.25 + leader.attack / 100;
      }, 0);
      return convoyDamage(enemyTag, Number(pressure) * (1 + strikePower));
    };
    BattleManager._forceBonusesInstalled = true;
  }

  static patchOccupationCapture() {
    const capture = OffensivePlanner.capture.bind(OffensivePlanner);
    OffensivePlanner.capture = (pid, owner, broadcast = true) => {
      const stateId = MapRenderer.stateOf(pid);
      const state = MapRenderer.states?.[stateId];
      const oldOwner = state?.owner;
      const result = capture(pid, owner, broadcast);
      if (result && owner === CoreEngine.gameState.country && oldOwner && oldOwner !== owner &&
          state?.owner === owner) {
        state.occupiedBy = owner;
        state.occupationCountry = oldOwner;
        const today = ForceSystems.currentDay();
        const records = CoreEngine.gameState.forceSystems.occupations;
        const record = records[oldOwner] ||= {
          progress: 0,
          nextDay: today + ForceSystems.OCCUPATION_INTERVAL_DAYS,
          stateIds: []
        };
        record.stateIds = [...new Set([...(record.stateIds || []), String(stateId)])];
        ForceSystems.refresh();
      }
      return result;
    };
  }

  static patchAirRange() {
    BattlePlanManager.airRange = unit => {
      const design = ForceSystems.aircraftDesign(unit);
      const dropTank = design?.modules?.fuel === 'drop_tank' || design?.modules?.fuel === 'long';
      const doctrine = ForceSystems.bonuses('air', unit);
      return Math.round(ForceSystems.AIRCRAFT_BASE_RANGE * (dropTank ? 1.9 : 1) *
        (1 + (Number(doctrine.allWeather) || 0) * 0.1));
    };
    BattlePlanManager.checkAirRange = (unit, target) => ForceSystems.targetsInRange(unit, target);
    BattlePlanManager.airTargetInRange = (unit, point) => {
      if (!BattlePlanManager.airWingReady(unit) || !point) return false;
      const width = MapRenderer.mapW;
      let dx = Math.abs(point[0] - unit.base[0]);
      if (width > 0) {
        dx %= width;
        dx = Math.min(dx, width - dx);
      }
      return Math.hypot(dx, point[1] - unit.base[1]) <= BattlePlanManager.airRange(unit);
    };
    const execute = BattlePlanManager.execute.bind(BattlePlanManager);
    BattlePlanManager.execute = id => {
      const unit = BattlePlanManager.air.find(item => String(item.id) === String(id));
      if (unit) {
        const assignedTarget = unit.area || unit.target || unit.zone;
        if (assignedTarget && !ForceSystems.targetsInRange(unit, assignedTarget)) {
          GameUI.notify(ForceSystems.AIR_RANGE_WARNING, 'alert');
          return false;
        }
      }
      return execute(id);
    };
    const endDrag = BattlePlanManager.endDrag.bind(BattlePlanManager);
    BattlePlanManager.endDrag = () => {
      if (BattlePlanManager.activeForce === 'air' && BattlePlanManager.dragMode === 'area' &&
          BattlePlanManager.dragPoints.length >= 2) {
        const [a] = BattlePlanManager.dragPoints;
        const b = BattlePlanManager.dragPoints[BattlePlanManager.dragPoints.length - 1];
        const area = { x1: Math.min(a[0], b[0]), y1: Math.min(a[1], b[1]),
          x2: Math.max(a[0], b[0]), y2: Math.max(a[1], b[1]) };
        if (!ForceSystems.targetsInRange(BattlePlanManager.selectedUnit(), area)) {
          BattlePlanManager.dragMode = null;
          BattlePlanManager.dragPoints = [];
          GameUI.notify(ForceSystems.AIR_RANGE_WARNING, 'alert');
          return false;
        }
      }
      return endDrag();
    };
  }

  static targetsInRange(unit, target) {
    if (!target) return false;
    if (Array.isArray(target)) return BattlePlanManager.airTargetInRange(unit, target);
    if (Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
      return BattlePlanManager.airTargetInRange(unit, [Number(target.x), Number(target.y)]);
    }
    if (['x1', 'y1', 'x2', 'y2'].every(key => Number.isFinite(Number(target[key])))) {
      return [
        [Number(target.x1), Number(target.y1)], [Number(target.x1), Number(target.y2)],
        [Number(target.x2), Number(target.y1)], [Number(target.x2), Number(target.y2)]
      ].every(point => BattlePlanManager.airTargetInRange(unit, point));
    }
    return false;
  }

  static aircraftDesign(unit) {
    return EquipmentDesigner.designs.find(item => item.id === unit?.designId && item.cat === 'plane') || null;
  }

  static patchAircraftDesign() {
    const designer = EquipmentDesigner;
    const stats = designer.stats.bind(designer);
    designer.stats = function (category) {
      const result = stats(category);
      if (category === 'plane' && ['drop_tank', 'long'].includes(this.draft.plane?.modules?.fuel)) {
        result.speed = Math.round((Number(result.speed) || 0) * 0.9);
        result.rangeBonus = 0.9;
        result.mobilityPenalty = 0.1;
      }
      return result;
    };
    const performance = designer.performance.bind(designer);
    designer.performance = function (category) {
      const result = performance(category);
      if (category === 'plane' && ['drop_tank', 'long'].includes(this.draft.plane?.modules?.fuel)) {
        result.speed = Math.round(result.speed * 0.9);
        result.rangeBonus = 0.9;
        result.overall = Math.max(0, Math.round(result.overall * 0.9));
      } else if (category === 'plane') result.rangeBonus = 0;
      return result;
    };
    const originalCost = designer.cost.bind(designer);
    designer.cost = function (category) {
      const cost = originalCost(category);
      return category === 'plane' && ['drop_tank', 'long'].includes(this.draft.plane?.modules?.fuel)
        ? Math.ceil(cost * 1.15) : cost;
    };
    const saveDesign = designer.saveDesign.bind(designer);
    designer.saveDesign = function () {
      const before = this.designs.length;
      const result = saveDesign();
      if (this.designs.length > before) {
        const design = this.designs[this.designs.length - 1];
        if (design.cat === 'plane' && ['drop_tank', 'long'].includes(design.modules?.fuel)) {
          design.rangeBonus = 0.9;
          design.mobilityPenalty = 0.1;
          design.productionCostMultiplier = 1.15;
          design.performance ||= {};
          design.performance.rangeBonus = 0.9;
          design.performance.mobilityPenalty = 0.1;
          if (typeof StrategySystems !== 'undefined') StrategySystems.registerDesign(design);
        }
      }
      return result;
    };
    ForceSystems.migrateAircraftDesigns();
  }

  static migrateAircraftDesigns() {
    (EquipmentDesigner.designs || []).forEach(design => {
      if (design.cat !== 'plane' || !['drop_tank', 'long'].includes(design.modules?.fuel)) return;
      design.rangeBonus = 0.9;
      design.mobilityPenalty = 0.1;
      design.productionCostMultiplier = 1.15;
      design.performance ||= {};
      design.performance.rangeBonus = 0.9;
      design.performance.mobilityPenalty = 0.1;
      if (typeof StrategySystems !== 'undefined') StrategySystems.registerDesign(design);
    });
  }

  static setAircraftDesign(unitId, designId) {
    const unit = BattlePlanManager.air.find(item => String(item.id) === String(unitId));
    if (!unit) return false;
    if (designId && !EquipmentDesigner.designs.some(item => item.id === designId && item.cat === 'plane')) {
      GameUI.notify('選択した航空機設計は見つかりません。', 'alert');
      return false;
    }
    unit.designId = designId || null;
    BattlePlanManager.renderPanel();
    return true;
  }

  static initializeGroups() {
    ForceSystems.ensureState();
    ForceSystems.migrateAircraftDesigns();
    const assigned = new Set();
    ['army', 'navy', 'air'].forEach(force => ForceSystems.groups(force).forEach(group => {
      if (!group.doctrineId && CoreEngine.gameState.forceSystems.doctrines[group.id]) {
        group.doctrineId = CoreEngine.gameState.forceSystems.doctrines[group.id];
      }
      const commander = ForceSystems.commander(group);
      if (commander) {
        const card = (CardSystem.hiredCards || []).find(item =>
          item.id === commander.id && item.country === (commander.country || CoreEngine.gameState.country));
        const key = ForceSystems.assignedCardKey(card || commander);
        if (!card || ForceSystems.cardType(card) !== ForceSystems.forceType(force) || assigned.has(key)) {
          group.commander = null;
          if (force === 'army') group.general = null;
        } else {
          assigned.add(key);
          group.commander = { ...commander, country: card.country,
            type: ForceSystems.cardType(card), stats: ForceSystems.cardStats(card) };
          if (force === 'army') group.general = group.commander;
        }
      }
    }));
    BattlePlanManager.renderPanel();
  }

  static onTick() {
    ForceSystems.ensureState();
    const today = Math.floor(Date.UTC(CoreEngine.gameState.date.getFullYear(),
      CoreEngine.gameState.date.getMonth(), CoreEngine.gameState.date.getDate()) / 86400000);
    const previous = CoreEngine.gameState.forceSystems.lastOccupationDay;
    if (previous === null || previous === undefined) {
      CoreEngine.gameState.forceSystems.lastOccupationDay = today;
      ForceSystems.syncOccupationSubjects(today);
      return;
    }
    if (today <= previous) return;
    CoreEngine.gameState.forceSystems.lastOccupationDay = today;
    ForceSystems.syncOccupationSubjects(today);
    Object.values(CoreEngine.gameState.forceSystems.occupations).forEach(record => {
      if (record.unified) return;
      while (today >= record.nextDay) {
        record.progress = Math.min(100, Number(record.progress || 0) + ForceSystems.OCCUPATION_PROGRESS_PER_INTERVAL);
        record.nextDay += ForceSystems.OCCUPATION_INTERVAL_DAYS;
      }
    });
    if (ForceSystems.subjectModalOpen) ForceSystems.renderSubjects();
  }

  static subjectStates(tag) {
    const player = CoreEngine.gameState.country;
    const forced = CoreEngine.gameState.forceSystems.occupations[tag]?.stateIds || [];
    return Object.entries(MapRenderer.states || {}).filter(([id, state]) =>
      (state.owner === tag && (state.puppetOf === player || state.overlord === player ||
        CoreEngine.gameState.puppets.some(item =>
          (typeof item === 'string' ? item : item?.tag) === tag))) ||
      (forced.includes(String(id)) && state.occupationCountry === tag && state.occupiedBy === player));
  }

  static subjectTags() {
    const player = CoreEngine.gameState.country;
    const tags = new Set((CoreEngine.gameState.puppets || []).map(item =>
      typeof item === 'string' ? item : item?.tag).filter(Boolean));
    Object.values(MapRenderer.states || {}).forEach(state => {
      if (state.owner !== player && (state.puppetOf === player || state.overlord === player)) tags.add(state.owner);
      if (state.occupiedBy === player && state.occupationCountry) tags.add(state.occupationCountry);
    });
    Object.entries(CoreEngine.gameState.forceSystems.occupations).forEach(([tag, record]) => {
      if (!record.unified) tags.add(tag);
    });
    return [...tags].filter(tag => tag !== player);
  }

  static syncOccupationSubjects(today) {
    Object.entries(CoreEngine.gameState.forceSystems.occupations).forEach(([tag, record]) => {
      (record.stateIds || []).forEach(id => {
        const state = MapRenderer.states?.[id];
        if (state?.owner === CoreEngine.gameState.country && !record.unified) {
          state.occupiedBy = CoreEngine.gameState.country;
          state.occupationCountry = tag;
        }
      });
    });
    ForceSystems.subjectTags().forEach(tag => {
      const states = ForceSystems.subjectStates(tag);
      if (!states.length) return;
      const record = CoreEngine.gameState.forceSystems.occupations[tag] ||= {
        progress: 0,
        nextDay: today + ForceSystems.OCCUPATION_INTERVAL_DAYS,
        stateIds: []
      };
      record.stateIds = [...new Set([...(record.stateIds || []), ...states.map(([id]) => String(id))])];
      if (!Number.isFinite(Number(record.nextDay))) record.nextDay = today + ForceSystems.OCCUPATION_INTERVAL_DAYS;
      if (!Number.isFinite(Number(record.progress))) record.progress = 0;
    });
  }

  static currentDay() {
    const date = CoreEngine.gameState.date;
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  }

  static countryName(tag) {
    const names = { MAN: '満州国', JAP: '日本', GER: 'ドイツ', POL: 'ポーランド', FRA: 'フランス', SOV: 'ソビエト連邦' };
    const item = typeof DiplomacyManager !== 'undefined'
      ? DiplomacyManager.countries?.find(country => country.id === tag)
      : null;
    return item?.name || names[tag] || tag;
  }

  static openSubjects() {
    ForceSystems.ensureState();
    ForceSystems.syncOccupationSubjects(ForceSystems.currentDay());
    ForceSystems.subjectModalOpen = true;
    GameUI.openModal('被支配国・占領地', ForceSystems.subjectMarkup());
  }

  static renderSubjects() {
    const el = document.getElementById(ForceSystems.subjectModalOpen ? 'generic-modal-body' : 'subjects-content');
    if (!el) return;
    el.innerHTML = ForceSystems.subjectMarkup();
  }

  static subjectMarkup() {
    const tags = ForceSystems.subjectTags();
    if (!tags.length) {
      return '<p class="force-empty">被支配国・占領地はありません。</p>';
    }
    const rows = tags.map(tag => {
      const record = CoreEngine.gameState.forceSystems.occupations[tag];
      const states = ForceSystems.subjectStates(tag);
      const factories = states.reduce((total, [, state]) => ({
        military: total.military + (Number(state.b?.arms_factory) || 0),
        civilian: total.civilian + (Number(state.b?.industrial_complex) || 0)
      }), { military: 0, civilian: 0 });
      const progress = Math.min(100, Number(record?.progress) || 0);
      return '<tr><td>' + DataFetcher.getCountryFlagImage(tag) + '</td><td>' +
        ForceSystems.escape(ForceSystems.countryName(tag)) + '</td><td>' + factories.military + ' / ' +
        factories.civilian + '</td><td><div class="subject-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        progress + '"><i style="width:' + progress + '%"></i></div><span>' + progress + '%</span></td><td><button ' +
        (progress < 100 ? 'disabled ' : '') + 'onclick="ForceSystems.unifyCountry(\'' +
        ForceSystems.escapeAttr(tag) + '\')">国家統一</button></td></tr>';
    }).join('');
    return '<p class="force-help">ゲーム内時間で14日ごとに統合進捗が3%上昇します。</p>' +
      '<div class="subject-table-wrap"><table class="subject-table"><thead><tr><th>国旗</th><th>国の名前</th>' +
      '<th>軍需工場数 / 民需工場数</th><th>占領度・統合進捗</th><th></th></tr></thead><tbody>' + rows +
      '</tbody></table></div>';
  }

  static unifyCountry(tag) {
    const record = CoreEngine.gameState.forceSystems.occupations[tag];
    if (!record || Number(record.progress) < 100 || record.unified) {
      GameUI.notify('国家統一には統合進捗100%が必要です。', 'alert');
      return false;
    }
    const player = CoreEngine.gameState.country;
    const states = ForceSystems.subjectStates(tag);
    if (!states.length) {
      GameUI.notify('統合対象の領土が見つかりません。', 'alert');
      return false;
    }
    const factories = { military: 0, civilian: 0, dockyards: 0 };
    const resources = {};
    states.forEach(([id, state]) => {
      factories.military += Number(state.b?.arms_factory) || 0;
      factories.civilian += Number(state.b?.industrial_complex) || 0;
      factories.dockyards += Number(state.b?.dockyard) || 0;
      Object.entries(state.resources || state.r || {}).forEach(([key, value]) => {
        if (Number(value) > 0) resources[key] = (resources[key] || 0) + Number(value);
      });
      state.owner = player;
      delete state.puppetOf;
      delete state.overlord;
      delete state.occupiedBy;
      delete state.occupationCountry;
      (state.provinces || []).forEach(pid => {
        if (CoreEngine.gameState.strategy) delete CoreEngine.gameState.strategy.provinceOwners[pid];
      });
      delete CoreEngine.gameState.strategy?.provinceOwners?.[id];
    });
    const gs = CoreEngine.gameState;
    gs.civilianFactories = (Number(gs.civilianFactories) || 0) + factories.civilian;
    gs.militaryFactories = (Number(gs.militaryFactories) || 0) + factories.military;
    gs.dockyards = (Number(gs.dockyards) || 0) + factories.dockyards;
    Object.entries(resources).forEach(([key, value]) => {
      if (key in (gs.resources || {})) gs.resources[key] += value;
    });
    record.unified = true;
    gs.forceSystems.unifiedCountries.push(tag);
    gs.puppets = (gs.puppets || []).filter(item =>
      (typeof item === 'string' ? item : item?.tag) !== tag);
    MapRenderer.invalidateModes();
    MultiplayerManager.broadcast({ type: 'country_unified', tag, owner: player });
    ForceSystems.renderSubjects();
    CoreEngine.renderStats();
    GameUI.notify(ForceSystems.countryName(tag) + 'を完全に統合しました。', 'success');
    return true;
  }

  static refresh() {
    BattlePlanManager.renderPanel();
    const doctrine = document.getElementById('force-doctrine-content');
    if (doctrine) ForceSystems.renderDoctrines();
  }

  static escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  static escapeAttr(value) {
    return ForceSystems.escape(value).replace(/`/g, '&#96;');
  }
}

if (typeof window !== 'undefined') window.ForceSystems = ForceSystems;
if (typeof module !== 'undefined') module.exports = ForceSystems;
