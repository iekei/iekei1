'use strict';

// 師団・設計・国家方針・実験施設を既存のゲーム状態と同期する。
class StrategySystems {
  static installed = false;
  static SCIENTISTS = {
    land: [
      { name: 'フェルディナント・ポルシェ', expertise: '戦車設計', skill: 3 },
      { name: 'ハインツ・グデーリアン', expertise: '機甲戦術', skill: 2 },
      { name: '陸軍技術主任', expertise: '陸上兵器', skill: 1 }
    ],
    naval: [
      { name: 'エーリヒ・レーダー', expertise: '艦隊運用', skill: 3 },
      { name: '造船技師', expertise: '艦艇設計', skill: 2 },
      { name: '海軍技術主任', expertise: '海軍兵器', skill: 1 }
    ],
    air: [
      { name: '航空技術主任', expertise: '航空機設計', skill: 3 },
      { name: '飛行試験主任', expertise: '飛行試験', skill: 2 },
      { name: '航空研究員', expertise: '航空工学', skill: 1 }
    ],
    nuclear: [
      { name: 'J・ロバート・オッペンハイマー', expertise: '原子核物理学', skill: 3 },
      { name: 'エンリコ・フェルミ', expertise: '核物理学', skill: 2 },
      { name: '原子力研究員', expertise: '核化学', skill: 1 }
    ]
  };
  static FACILITIES = {
    land_experiment_facility: 'land',
    naval_experiment_facility: 'naval',
    air_experiment_facility: 'air',
    nuclear_experiment_facility: 'nuclear'
  };
  static PROJECTS = [
    { id: 'land_prototype', field: 'land', title: '次世代陸軍装備計画', cost: 20, technology: 'special_land_prototype' },
    { id: 'naval_prototype', field: 'naval', title: '先進艦艇試作計画', cost: 20, technology: 'special_naval_prototype' },
    { id: 'air_prototype', field: 'air', title: '高性能航空機計画', cost: 20, technology: 'special_air_prototype' },
    { id: 'nuclear_reactor_research', field: 'nuclear', title: '原子炉研究', cost: 20, technology: 'special_nuclear_reactor' },
    { id: 'nuclear_program', field: 'nuclear', title: '原子力研究計画', cost: 40, technology: 'special_nuclear_program', requires: 'nuclear_reactor_research' }
  ];

  static ensureState() {
    const s = CoreEngine.gameState;
    s.labState ||= { facilities: {}, scientists: [], points: { land: 0, naval: 0, air: 0, nuclear: 0 }, unlockedProjects: [], lastTickDay: null };
    s.designerState ||= { selectedByCategory: {}, blueprintCategory: 'infantry' };
    s.designerState.selectedByCategory ||= {};
    s.designerState.blueprintCategory ||= 'infantry';
    s.focusTreeState ||= {};
    s.countryState ||= { country: s.country };
    s.diplomacyState = { militaryAccess: s.militaryAccess || {}, atWar: s.atWar || [] };
    s.unitState = { armies: BattlePlanManager.armies, navy: BattlePlanManager.navy, air: BattlePlanManager.air };
    s.productionState = { lines: s.strategy?.production || [], stock: s.strategy?.economies?.[s.country]?.stock || {} };
    s.constructionQueue = ConstructionManager.queue;
    if (MapRenderer.ready && !s.labState.facilitiesMigrated) {
      Object.entries(MapRenderer.states || {}).forEach(([stateId, state]) => {
        if (state.owner !== s.country) return;
        const buildings = state.b || {};
        const facilities = s.labState.facilities;
        facilities[stateId] ||= {};
        Object.entries(StrategySystems.FACILITIES).forEach(([buildingId, field]) => {
          facilities[stateId][field] = Math.max(Number(facilities[stateId][field]) || 0, Number(buildings[buildingId]) || 0);
        });
      });
      s.labState.facilitiesMigrated = true;
    }
    return s.labState;
  }

  static init() {
    StrategySystems.ensureState();
    if (!StrategySystems.installed) {
      StrategySystems.patchFocusTree();
      StrategySystems.patchResearch();
      StrategySystems.patchDesigner();
      StrategySystems.patchEquipmentNeeds();
      StrategySystems.patchReadiness();
      CoreEngine.registerTickCallback(() => StrategySystems.tick());
      StrategySystems.installed = true;
    }
    GameTools.window('labs', '🧪 実験施設', () => StrategySystems.renderLabs(), 800);
    StrategySystems.renderLabs();
    StrategySystems.updateDesigner();
    StrategySystems.registerExistingDesigns();
    StrategySystems.syncFocusState();
  }

  static syncState() {
    const s = CoreEngine.gameState;
    s.countryState = { country: s.country };
    s.diplomacyState = { militaryAccess: s.militaryAccess || {}, atWar: s.atWar || [] };
    s.unitState = { armies: BattlePlanManager.armies, navy: BattlePlanManager.navy, air: BattlePlanManager.air };
    s.productionState = { lines: s.strategy?.production || [], stock: s.strategy?.economies?.[s.country]?.stock || {} };
    s.constructionQueue = ConstructionManager.queue;
    StrategySystems.syncFocusState();
  }

  static syncFocusState() {
    if (typeof FocusTreeManager === 'undefined') return;
    CoreEngine.gameState.focusTreeState = FocusTreeManager.serializeStates();
  }

  static facilityCompleted(buildingId, stateId) {
    const field = StrategySystems.FACILITIES[buildingId];
    if (!field) return;
    const lab = StrategySystems.ensureState();
    lab.facilities[stateId] ||= {};
    const level = Number(MapRenderer.states?.[stateId]?.b?.[buildingId]) || 0;
    lab.facilities[stateId][field] = Math.max(Number(lab.facilities[stateId][field]) || 0, level);
    StrategySystems.renderLabs();
  }

  static canBuildNuclearReactor() {
    return StrategySystems.ensureState().unlockedProjects.includes('nuclear_reactor_research');
  }

  static ownedFacilities(field) {
    const lab = StrategySystems.ensureState();
    return Object.entries(lab.facilities).flatMap(([stateId, counts]) => {
      const count = Math.max(0, Math.floor(Number(counts[field]) || 0));
      const state = MapRenderer.states?.[stateId];
      return state?.owner === CoreEngine.gameState.country
        ? Array.from({ length: count }, (_, index) => ({ id: stateId + ':' + index, stateId, index, name: state.name || '州' + stateId }))
        : [];
    });
  }

  static hireScientist(field) {
    const lab = StrategySystems.ensureState();
    if (!StrategySystems.SCIENTISTS[field]) return false;
    const facilities = StrategySystems.ownedFacilities(field);
    const occupiedIds = new Set(lab.scientists.filter(person => person.field === field).map(person => person.facilityId));
    const facility = facilities.find(item => !occupiedIds.has(item.id));
    if (!facility) {
      GameUI.notify('対応する実験施設を建設してください（科学者1名につき施設1棟）。', 'alert');
      return false;
    }
    const cost = field === 'nuclear' ? 100 : 60;
    if (CoreEngine.gameState.politicalPower < cost) {
      GameUI.notify('政治力が不足しています（必要 ' + cost + '）。', 'alert');
      return false;
    }
    CoreEngine.gameState.politicalPower -= cost;
    const candidates = StrategySystems.SCIENTISTS[field];
    const used = new Set(lab.scientists.filter(person => person.field === field).map(person => person.name));
    const scientist = candidates.find(candidate => !used.has(candidate.name));
    if (!scientist) {
      GameUI.notify('この分野の科学者候補は全員雇用済みです。', 'alert');
      return false;
    }
    lab.scientists.push({
      id: 'scientist-' + Date.now() + '-' + lab.scientists.length,
      ...scientist, field, stateId: facility.stateId, facilityId: facility.id, days: 0
    });
    GameUI.notify(scientist.name + '（' + scientist.expertise + '）を' + facility.name + 'に配属しました。', 'success');
    StrategySystems.renderLabs();
    return true;
  }

  static assignScientist(scientistId, stateId) {
    const lab = StrategySystems.ensureState();
    const person = lab.scientists.find(candidate => candidate.id === scientistId);
    const facility = StrategySystems.ownedFacilities(person?.field).find(item => item.id === String(stateId));
    if (!person || !facility) {
      GameUI.notify('専門分野に対応する自国の実験施設を選択してください。', 'alert');
      return false;
    }
    const occupied = lab.scientists.some(candidate => candidate !== person && candidate.field === person.field && candidate.facilityId === String(stateId));
    if (occupied) {
      GameUI.notify('この施設には既に科学者が配属されています。', 'alert');
      return false;
    }
    person.stateId = facility.stateId;
    person.facilityId = facility.id;
    person.days = 0;
    StrategySystems.renderLabs();
    return true;
  }

  static unlockProject(projectId) {
    const project = StrategySystems.PROJECTS.find(item => item.id === projectId);
    const lab = StrategySystems.ensureState();
    if (!project || lab.unlockedProjects.includes(projectId)) return false;
    if ((lab.points[project.field] || 0) < project.cost) {
      GameUI.notify('実験ポイントが不足しています。', 'alert');
      return false;
    }
    if (project.requires && !lab.unlockedProjects.includes(project.requires)) {
      GameUI.notify('先に必要な研究計画を完了してください。', 'alert');
      return false;
    }
    lab.points[project.field] -= project.cost;
    lab.unlockedProjects.push(projectId);
    ResearchManager.researchedTech.add(project.technology);
    GameUI.notify('特別研究計画を解除しました: ' + project.title, 'success');
    StrategySystems.renderLabs();
    if (WindowManager.isOpen('construction')) ConstructionManager.render();
    return true;
  }

  static tick() {
    const lab = StrategySystems.ensureState();
    const day = GameTools.day();
    if (lab.lastTickDay === null) {
      lab.lastTickDay = day;
      return;
    }
    const elapsed = Math.max(0, day - lab.lastTickDay);
    if (!elapsed) return;
    lab.lastTickDay = day;
    lab.scientists.forEach(person => {
      const facility=StrategySystems.ownedFacilities(person.field).find(item=>item.id===person.facilityId);
      if(!facility) return;
      person.days = Math.max(0, Number(person.days) || 0) + elapsed;
      while (person.days >= 60) {
        person.days -= 60;
        const points = Math.max(1, Math.floor(Number(person.skill) || 1)) * 10;
        lab.points[person.field] = (lab.points[person.field] || 0) + points;
        CoreEngine.log(person.name + 'の実験により' + person.field + '実験ポイント+' + points);
      }
    });
    if (WindowManager.isOpen('labs')) StrategySystems.renderLabs();
    StrategySystems.syncState();
  }

  static renderLabs() {
    const el = document.getElementById('labs-content');
    if (!el) return;
    const lab = StrategySystems.ensureState();
    const labels = { land: '陸軍', naval: '海軍', air: '航空', nuclear: '原子力' };
    const fields = Object.keys(labels);
    let html = '<section class="lab-summary"><h3>🧪 実験施設・科学者</h3><p>専門科学者を配属すると、60日ごとにスキルレベル×10の実験ポイントを獲得します。研究員の候補は各分野で異なります。</p>';
    html += fields.map(field => {
      const facilities=StrategySystems.ownedFacilities(field);
      const scientists=lab.scientists.filter(person=>person.field===field);
      const availableScientist=StrategySystems.SCIENTISTS[field].some(candidate=>!scientists.some(person=>person.name===candidate.name));
      return '<div class="lab-points"><b>' + labels[field] + '実験ポイント</b><strong>' + Math.floor(lab.points[field] || 0) + '</strong><span>施設 ' + facilities.length + ' / 科学者 ' + scientists.length + ' · 次回 ' + scientists.reduce((sum,person)=>sum+Math.max(0,60-(Number(person.days)||0)),0) + '日以内</span>' + GameTools.button('専門科学者を雇用（政治力' + (field === 'nuclear' ? 100 : 60) + '）', "StrategySystems.hireScientist('" + field + "')", facilities.length <= scientists.length || !availableScientist) + '</div>';
    }).join('');
    html += '</section><section class="lab-projects"><h3>📐 特別研究計画</h3>';
    html += StrategySystems.PROJECTS.map(project => {
      const locked=project.requires&&!lab.unlockedProjects.includes(project.requires);
      return '<article class="lab-project"><b>' + project.title + '</b><span>必要 ' + project.cost + ' pt / ' + labels[project.field] + (locked?' · 前提研究が必要':'') + '</span>' + GameTools.button(lab.unlockedProjects.includes(project.id) ? '解除済み' : 'ポイントを消費して解除', "StrategySystems.unlockProject('" + project.id + "')", lab.unlockedProjects.includes(project.id) || locked || (lab.points[project.field] || 0) < project.cost) + '</article>';
    }).join('');
    html += '</section><section class="lab-scientists"><h3>所属科学者</h3>';
    html += lab.scientists.length ? lab.scientists.map(person => {
      const facilities = StrategySystems.ownedFacilities(person.field);
      const assignedFacility = facilities.find(item => item.id === person.facilityId) || facilities.find(item => item.stateId === String(person.stateId));
      const progress = Math.floor((Number(person.days) || 0) / 60 * 100);
      const rate=Math.max(1,Math.floor(Number(person.skill)||1))*10;
      return '<article class="lab-scientist"><b>' + person.name + ' · ' + labels[person.field] + ' · Lv.' + (person.skill||1) + ' · ' + person.expertise + '</b><span>次回獲得まで ' + Math.max(0, 60 - (Number(person.days) || 0)) + '日 / 次回 +' + rate + ' pt</span><progress max="100" value="' + progress + '"></progress><select aria-label="科学者の配属施設" onchange="StrategySystems.assignScientist(\'' + person.id + '\',this.value)">' + facilities.map(item => '<option value="' + item.id + '"' + (assignedFacility?.id === item.id ? ' selected' : '') + '>' + item.name + ' (' + (item.index + 1) + '号)</option>').join('') + '</select></article>';
    }).join('') : '<p>対応施設を建設し、専門科学者を雇用してください。</p>';
    el.innerHTML = html + '</section>';
  }

  static patchFocusTree() {
    const manager = FocusTreeManager;
    const originalBuildGroups = manager.buildExclusiveGroups.bind(manager);
    manager.buildExclusiveGroups = function () {
      manager.focuses.forEach(focus => {
        focus.prerequisites ||= [];
        focus.exclusiveWith ||= focus.mutually_exclusive || [];
        focus.mutually_exclusive ||= focus.exclusiveWith;
      });
      originalBuildGroups();
    };
    const originalInit = manager.init.bind(manager);
    manager.init = async function (country) {
      await originalInit(country);
      StrategySystems.addExclusiveBranches();
      StrategySystems.syncFocusState();
    };
    const originalRender = manager.render.bind(manager);
    manager.render = function () {
      originalRender();
      const nodes = document.querySelectorAll('.focus-node[data-focus-id]');
      nodes.forEach(node => {
        const focus = manager.focusMap[node.dataset.focusId];
        if (!focus) return;
        const state = manager.stateFor();
        const locked = state.locked.has(focus.id);
        const active = state.activeFocus === focus.id;
        const complete = state.completed.has(focus.id);
        const remaining = active ? Math.max(0, manager.focusDaysTotal - manager.focusProgress) : Number(focus.cost || 70);
        const badge = document.createElement('span');
        badge.className = 'focus-state-badge';
        badge.textContent = locked ? '🔒 封鎖' : complete ? '完了' : active ? '実行中' : manager.isFocusAvailable(focus) ? '未着手' : '前提待ち';
        if (locked) badge.setAttribute('aria-label', '排他選択により封鎖');
        const meta = document.createElement('small');
        meta.className = 'focus-meta';
        meta.textContent = '残り ' + remaining + '日 · ' + String(focus.effect || '効果なし');
        node.append(badge, meta);
      });
      StrategySystems.syncFocusState();
    };
    StrategySystems.addExclusiveBranches();
  }

  // プレイ可能な7か国それぞれに、独立して選べる政治・経済・軍事の分岐を加える。
  static addExclusiveBranches() {
    const manager = FocusTreeManager;
    const country = manager.currentCountry;
    const themes = {
      GER: [
        { key: 'leadership', a: '皇帝復権を目指す', b: '党国家体制を強化する', effectA: '政治力 +80、安定度 +5', effectB: '戦争協力度 +10、陸軍経験値 +10' },
        { key: 'economy', a: '四カ年計画を拡張する', b: '消費財経済を優先する', effectA: '軍需工場 +2、政治力 +30', effectB: '民需工場 +2、安定度 +5' },
        { key: 'foreign_policy', a: '東方進出を準備する', b: '欧州協調外交を進める', effectA: '陸軍経験値 +20、戦争協力度 +5', effectB: '政治力 +70、安定度 +5' }
      ],
      SOV: [
        { key: 'leadership', a: '中央集権を強化する', b: '党内協調を回復する', effectA: '政治力 +70、安定度 +5', effectB: '安定度 +12、戦争協力度 +5' },
        { key: 'economy', a: '重工業を最優先する', b: '農業と生活水準を改善する', effectA: '軍需工場 +2、陸軍経験値 +10', effectB: '民需工場 +2、安定度 +8' },
        { key: 'military', a: '赤軍の大改革を行う', b: '将校団の伝統を維持する', effectA: '陸軍経験値 +25、戦争協力度 +5', effectB: '政治力 +60、安定度 +5' }
      ],
      JAP: [
        { key: 'kodoha', idA: 'jap_kodoha_support', idB: 'jap_kodoha_purge', a: '皇道派を支持', b: '皇道派の粛清', effectA: '政治力 +100、安定度 +5', effectB: '安定度 +10、戦争協力度 +5' },
        { key: 'service', a: '陸軍主導の国防を進める', b: '海軍主導の国防を進める', effectA: '陸軍経験値 +20、軍需工場 +1', effectB: '海軍経験値 +20、造船所 +1' },
        { key: 'strategy', a: '北方資源圏を確保する', b: '南方資源圏へ進出する', effectA: '陸軍経験値 +15、政治力 +40', effectB: '海軍経験値 +15、戦争協力度 +8' }
      ],
      USA: [
        { key: 'economy', a: 'ニューディールを拡大する', b: '企業主導の回復を進める', effectA: '民需工場 +2、安定度 +5', effectB: '軍需工場 +2、政治力 +40' },
        { key: 'foreign_policy', a: '連合国支援を拡大する', b: '大陸防衛を優先する', effectA: '戦争協力度 +10、政治力 +50', effectB: '安定度 +8、軍需工場 +1' },
        { key: 'military', a: '欧州戦域を最優先する', b: '太平洋戦域を最優先する', effectA: '陸軍経験値 +15、政治力 +35', effectB: '海軍経験値 +20、造船所 +1' }
      ],
      ENG: [
        { key: 'empire', a: '帝国連邦を強化する', b: '自治領の自立を認める', effectA: '政治力 +60、戦争協力度 +5', effectB: '安定度 +10、民需工場 +1' },
        { key: 'defense', a: '大陸への関与を深める', b: '本土と帝国の防衛に徹する', effectA: '陸軍経験値 +15、軍需工場 +1', effectB: '安定度 +8、造船所 +1' },
        { key: 'service', a: '王立空軍を拡充する', b: '海軍優勢を維持する', effectA: '空軍経験値 +20、軍需工場 +1', effectB: '海軍経験値 +20、造船所 +1' }
      ],
      FRA: [
        { key: 'politics', a: '共和制の統一を図る', b: '強力な執政権を確立する', effectA: '安定度 +10、政治力 +40', effectB: '戦争協力度 +8、政治力 +35' },
        { key: 'army', a: 'マジノ線を拡張する', b: '機動戦 doctrine を採用する', effectA: '軍需工場 +1、安定度 +5', effectB: '陸軍経験値 +20、戦争協力度 +5' },
        { key: 'foreign_policy', a: 'イギリスとの協調を強める', b: '大陸同盟を再編する', effectA: '政治力 +60、海軍経験値 +10', effectB: '陸軍経験値 +15、安定度 +5' }
      ],
      ITA: [
        { key: 'leadership', a: '王権の影響力を保つ', b: '党の権力を一元化する', effectA: '安定度 +8、政治力 +40', effectB: '戦争協力度 +10、陸軍経験値 +10' },
        { key: 'foreign_policy', a: '地中海の覇権を追求する', b: 'バルカン半島を重視する', effectA: '海軍経験値 +20、造船所 +1', effectB: '陸軍経験値 +15、政治力 +35' },
        { key: 'military', a: '陸軍の近代化を優先する', b: '艦隊の増強を優先する', effectA: '陸軍経験値 +20、軍需工場 +1', effectB: '海軍経験値 +20、造船所 +1' }
      ]
    };
    const defaults = [
      { key: 'government', a: country + 'の議会政治を強化する', b: country + 'の中央政府を強化する', effectA: '政治力 +50、安定度 +5', effectB: '戦争協力度 +5、政治力 +35' },
      { key: 'economy', a: '民需産業を優先する', b: '軍需産業を優先する', effectA: '民需工場 +1、安定度 +5', effectB: '軍需工場 +1、陸軍経験値 +10' },
      { key: 'military', a: '陸軍の近代化を進める', b: '海空軍の拡張を進める', effectA: '陸軍経験値 +15、戦争協力度 +5', effectB: '海軍経験値 +10、空軍経験値 +10' }
    ];
    const selectedThemes = themes[country] || defaults;
    const existing = manager.focuses;
    const parent = existing.find(focus => !(focus.prerequisites || []).length);
    const x = Math.max(160, ...existing.map(focus => Number(focus.x) || 0)) + 220;
    const baseY = parent ? Number(parent.y) || 120 : 120;
    const created = [];
    selectedThemes.forEach((theme, index) => {
      const idA = theme.idA || (country.toLowerCase() + '_exclusive_' + theme.key + '_a');
      const idB = theme.idB || (country.toLowerCase() + '_exclusive_' + theme.key + '_b');
      if (manager.focusMap[idA] || manager.focusMap[idB]) return;
      const prereqs = parent ? [parent.id] : [];
      const y = baseY + index * 230;
      const makeRewards = (side, fallback) => {
        const rewards = [];
        const values = String(side || fallback).matchAll(/(政治力|安定度|戦争協力度|陸軍経験値|海軍経験値|空軍経験値|民需工場|軍需工場|造船所)\s*\+(\d+)/g);
        const types = {
          '政治力': 'add_political_power', '安定度': 'add_stability', '戦争協力度': 'add_war_support',
          '陸軍経験値': 'add_army_experience', '海軍経験値': 'add_navy_experience', '空軍経験値': 'add_air_experience',
          '民需工場': 'industrial_complex', '軍需工場': 'arms_factory', '造船所': 'dockyard'
        };
        for (const match of values) {
          const type = types[match[1]];
          if (['industrial_complex', 'arms_factory', 'dockyard'].includes(type)) {
            rewards.push({ type: 'add_building_construction', building: type, level: Number(match[2]) });
          } else if (type) rewards.push({ type, value: Number(match[2]) });
        }
        return rewards;
      };
      const a = {
        id: idA, title: theme.a, x, y, cost: 70, prerequisites: prereqs,
        exclusiveWith: [idB], mutually_exclusive: [idB], effect: theme.effectA,
        completion_rewards: makeRewards(theme.effectA)
      };
      const b = {
        id: idB, title: theme.b, x, y: y + 100, cost: 70, prerequisites: prereqs,
        exclusiveWith: [idA], mutually_exclusive: [idA], effect: theme.effectB,
        completion_rewards: makeRewards(theme.effectB)
      };
      created.push(a, b);
    });
    if (!created.length) return;
    manager.focuses.push(...created);
    created.forEach(focus => { manager.focusMap[focus.id] = focus; });
    manager.buildExclusiveGroups();
    manager.restoreLegacyBranchChoice(country);
    manager.render();
  }

  static patchResearch() {
    const originalTick = ResearchManager.onTick.bind(ResearchManager);
    const rules = [
      { re: /infantry_equipment_2|infantry_weapons2|歩兵装備.*(?:II|2)/i, old: 'infantry', next: 'infantry_2', name: '歩兵装備 II', rate: 12, resources: { steel: 8 } },
      { re: /artillery2|artillery_equipment_2|野砲.*(?:II|2)/i, old: 'artillery', next: 'artillery_2', name: '改良型野砲', rate: 2.4, resources: { steel: 12, tungsten: 3 } },
      { re: /basic_medium_tank|medium_tank_equipment_2|戦車.*(?:II|2)/i, old: 'tank', next: 'tank_2', name: '改良型戦車', rate: 1.2, resources: { steel: 15, tungsten: 5, chromium: 10 } },
      { re: /fighter2|fighter_equipment_2|戦闘機.*(?:II|2)/i, old: 'fighter', next: 'fighter_2', name: '改良型戦闘機', rate: 0.6, resources: { aluminum: 11, rubber: 3 } }
    ];
    ResearchManager.onTick = function () {
      const before = new Set(ResearchManager.researchedTech);
      originalTick();
      for (const id of ResearchManager.researchedTech) {
        if (before.has(id)) continue;
        const tech = ResearchManager.findTech(id);
        const label = String(id + ' ' + (tech?.title || ''));
        const rule = rules.find(candidate => candidate.re.test(label));
        if (rule) StrategySystems.upgradeProduction(rule);
      }
    };
  }

  static upgradeProduction(rule) {
    const catalog = ProductionManager.CATALOG;
    catalog[rule.next] = { name: rule.name, rate: rule.rate, resources: rule.resources, pool: catalog[rule.old].pool };
    const lines = CoreEngine.gameState.strategy.production;
    const old = lines.find(line => line.type === rule.old);
    if (!old) return;
    const replacement = lines.find(line => line.type === rule.next);
    if (replacement) {
      replacement.factories += old.factories;
      replacement.progress = Math.max(Number(replacement.progress) || 0, Number(old.progress) || 0);
      replacement.produced = (Number(replacement.produced) || 0) + (Number(old.produced) || 0);
      if (old.priority !== undefined) replacement.priority = old.priority;
      lines.splice(lines.indexOf(old), 1);
    } else {
      old.type = rule.next;
      old.progress = Number(old.progress) || 0;
    }
    Object.values(CoreEngine.gameState.strategy.economies || {}).forEach(account => { account.stock[rule.next] ||= 0; });
    ProductionManager.render();
    GameUI.notify('研究完了により生産ラインを自動更新: ' + rule.name, 'success');
  }

  static patchDesigner() {
    const originalSave = EquipmentDesigner.saveDesign.bind(EquipmentDesigner);
    EquipmentDesigner.saveDesign = function () {
      const before = this.designs.length;
      const result = originalSave();
      if (this.designs.length > before) {
        const design = this.designs[this.designs.length - 1];
        StrategySystems.registerDesign(design);
      }
      return result;
    };
    const originalRender = EquipmentDesigner.render.bind(EquipmentDesigner);
    EquipmentDesigner.render = function () {
      originalRender();
      StrategySystems.updateDesigner();
    };
  }

  static registerExistingDesigns() {
    (EquipmentDesigner.designs || []).forEach(design => StrategySystems.registerDesign(design));
  }

  static registerDesign(design) {
    if (!design || !design.id || !design.cat) return;
    if (!EquipmentDesigner.designs.some(item => item.id === design.id)) EquipmentDesigner.designs.push(design);
    const type = design.productionType || ('design_' + String(design.id).replace(/[^a-zA-Z0-9_-]/g, ''));
    design.productionType = type;
    const catalog = ProductionManager.CATALOG;
    const category = design.cat;
    const costMultiplier = Math.max(1, Number(design.productionCostMultiplier) || 1);
    const resources = category === 'ship' ? { steel: 12, chromium: 3 } :
      category === 'plane' ? { aluminum: 10, rubber: 3 } : { steel: 14, tungsten: 5, chromium: 8 };
    catalog[type] = {
      name: design.name,
      rate: (category === 'ship' ? 1 / 80 : category === 'plane' ? 0.35 : 0.5) / costMultiplier,
      resources: Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, value * costMultiplier])),
      pool: category === 'ship' ? 'dockyard' : 'military',
      designId: design.id,
      designCategory: category
    };
    Object.values(CoreEngine.gameState.strategy.economies || {}).forEach(account => {
      account.stock ||= {};
      account.stock[type] ||= 0;
    });
    ProductionManager.render();
    StrategySystems.updateDesigner();
  }

  static selectDesign(category, type) {
    StrategySystems.ensureState();
    const design = EquipmentDesigner.designs.find(item => item.productionType === type && item.cat === category);
    if (type && !design) return false;
    CoreEngine.gameState.designerState.selectedByCategory[category] = type || '';
    StrategySystems.updateDesigner();
    return true;
  }

  static patchEquipmentNeeds() {
    const original = TrainingManager.equipmentNeedsFor.bind(TrainingManager);
    TrainingManager.equipmentNeedsFor = function (comp, missingPercent = 100) {
      const needs = original(comp, missingPercent);
      const selected = CoreEngine.gameState.designerState.selectedByCategory || {};
      [
        { category: 'tank', source: 'tank' },
        { category: 'plane', source: 'fighter' }
      ].forEach(({ category, source }) => {
        const designType = selected[category];
        if (!designType || !needs[source]) return;
        needs[designType] = (needs[designType] || 0) + needs[source];
        delete needs[source];
      });
      return needs;
    };
  }

  static patchReadiness() {
    const originalTick = TrainingManager.onTick.bind(TrainingManager);
    TrainingManager.onTick = function () {
      originalTick();
      const gs = CoreEngine.gameState;
      const day = GameTools.day();
      if (gs.strategy.readinessDay === day) return;
      gs.strategy.readinessDay = day;
      const stock = ProductionManager.account(gs.country).stock;
      ArmyRoster.all().forEach(division => {
        if (!division.comp) return;
        const needs = division.equipmentNeeds || TrainingManager.equipmentNeedsFor(division.comp);
        const reserveRatio = Math.min(1, ...Object.entries(needs).map(([type, amount]) => {
          const reserve = Math.max(1, Number(amount) * 0.05);
          return Math.max(0, Number(stock[type]) || 0) / reserve;
        }));
        if (reserveRatio < 1) division.equipmentStrength = Math.max(0, (Number(division.equipmentStrength) || 100) - (1 - reserveRatio) * 0.25);
      });
      BattlePlanManager.renderPanel();
    };
  }

  static blueprintSvg(category) {
    const designs = {
      infantry: ['小銃設計図', 'M1903 / 38式'],
      artillery: ['野砲設計図', '75 mm FIELD GUN'],
      tank: ['装甲車両設計図', 'TANK / DRIVE / ARMOR'],
      ship: ['艦艇設計図', 'HULL / GUN / ENGINE'],
      plane: ['航空機設計図', 'WING / ENGINE / WEAPON']
    };
    const [title, subtitle] = designs[category] || designs.infantry;
    const shape = category === 'ship'
      ? '<path d="M80 145h260l-35 38H125zM135 140l35-46h72l35 46M195 94V67h8v27"/>'
      : category === 'plane'
        ? '<path d="M205 55l16 70 92 37v17l-94-20-8 55h-15l-8-55-94 20v-17l92-37 16-70z"/>'
        : category === 'tank'
          ? '<path d="M95 145h180l35 27H76zM130 145v-40h90l35 40M205 105h105v-10h-95M117 176a19 19 0 1 0 38 0m24 0a19 19 0 1 0 38 0m24 0a19 19 0 1 0 38 0"/>'
          : category === 'artillery'
            ? '<path d="M100 160h150m-80 0 100-75m-80 75 15 36m-63-36-15 36m120-95 60-13"/>'
            : '<path d="M130 80h78v122h-78zM145 80V55h48v25m-15 0v-25m-32 50h48m-48 30h48m-48 30h48"/> ';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 240"><rect width="420" height="240" fill="#101b20"/><g stroke="#557b72" stroke-width="1" opacity=".35">' +
      Array.from({ length: 11 }, (_, i) => '<path d="M' + (i * 42) + ' 0v240M0 ' + (i * 24) + 'h420"/>').join('') +
      '</g><g fill="none" stroke="#a8c9b3" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' + shape + '</g><text x="18" y="28" fill="#e0c36c" font-size="15" font-family="sans-serif">' + title + '</text><text x="18" y="222" fill="#9eb9ad" font-size="11" font-family="monospace">' + subtitle + '</text><text x="338" y="222" fill="#78968c" font-size="10" font-family="monospace">1936 / R&amp;D</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  static updateDesigner() {
    const content = document.getElementById('designer-content');
    if (!content) return;
    StrategySystems.ensureState();
    const designer = CoreEngine.gameState.designerState;
    let controls = document.getElementById('design-equipment-choice');
    if (!controls) {
      controls = document.createElement('section');
      controls.id = 'design-equipment-choice';
      controls.className = 'design-equipment-choice';
      content.appendChild(controls);
    }
    const choices = ['infantry', 'artillery', 'tank', 'ship', 'plane'];
    const categories = { infantry: '歩兵銃', artillery: '野戦砲', tank: '戦車', ship: '艦艇', plane: '航空機' };
    const active = designer.blueprintCategory || EquipmentDesigner.category || 'infantry';
    const designSelectors = ['tank', 'plane'].map(category => {
      const designs = EquipmentDesigner.designs.filter(item => item.cat === category && item.productionType);
      if (!designs.length) return '';
      const label = category === 'tank' ? '戦車' : '航空機';
      return '<label>師団編成で使用する' + label + '設計 <select onchange="StrategySystems.selectDesign(\'' + category + '\',this.value)"><option value="">標準装備</option>' +
        designs.map(item => '<option value="' + item.productionType + '"' + (designer.selectedByCategory[category] === item.productionType ? ' selected' : '') + '>' + GameTools.escape(item.name) + '（在庫 ' + Math.floor(ProductionManager.account(CoreEngine.gameState.country).stock[item.productionType] || 0) + '）</option>').join('') +
        '</select></label>';
    }).join('');
    controls.innerHTML = '<label>ブループリント <select onchange="StrategySystems.setBlueprint(this.value)">' + choices.map(key => '<option value="' + key + '"' + (active === key ? ' selected' : '') + '>' + categories[key] + '</option>').join('') + '</select></label>' +
      '<p>設計兵器は対応する生産ラインで備蓄した後に師団へ配備されます。設計だけでは在庫・戦闘ボーナスを得ません。</p>' +
      designSelectors;
    const image = content.querySelector('.designer-preview img');
    if (image) {
      image.src = StrategySystems.blueprintSvg(active);
      image.alt = categories[active] + 'の設計図';
      image.onerror = null;
    }
  }

  static setBlueprint(category) {
    if (!['infantry', 'artillery', 'tank', 'ship', 'plane'].includes(category)) return;
    StrategySystems.ensureState();
    CoreEngine.gameState.designerState.blueprintCategory = category;
    StrategySystems.updateDesigner();
  }
}

window.StrategySystems = StrategySystems;
