(function () {
  'use strict';
  // ==========================================================
  // assets/equipment-designer.js — 兵器設計 (Equipment Designer)
  // ----------------------------------------------------------
  // HOI4 の "Designer" を再現する UI/計算レイヤー。
  //  - 車体/船体/機体 (chassis / hull / airframe) は研究で解禁される
  //  - 各スロット (主砲・装甲・エンジン・無線 等) はドロップダウンで選択
  //  - 未研究のモジュールは選択不可 (🔒 + 必要技術名を表示)
  //  - 速度 / 信頼性 / 対人・対甲攻撃 / 生産コストを搭載モジュールから算出
  // ==========================================================
  const Designer = window.EquipmentDesigner;
  if (!Designer) return;

  // ---- 研究状態の参照 ----
  // ResearchManager.researchedTech (Set) を第一の情報源とする。
  function researchManager() {
    // このバンドルでは ResearchManager はグローバル class (window のプロパティではない)
    if (typeof ResearchManager !== 'undefined' && ResearchManager) return ResearchManager;
    return window.ResearchManager || null;
  }

  function researched(id) {
    const manager = researchManager();
    if (!manager) return false;
    const set = manager.researchedTech;
    if (set && typeof set.has === 'function') return set.has(id);
    if (set && Array.isArray(set)) return set.includes(id);
    if (typeof manager.isResearched === 'function') return manager.isResearched(id);
    return false;
  }

  function researchReady() {
    const manager = researchManager();
    if (!manager) return false;
    const set = manager.researchedTech;
    if (!set) return false;
    if (typeof set.has === 'function') return true;
    return Array.isArray(set);
  }

  function techLabel(requires) {
    const list = Array.isArray(requires) ? requires : [requires];
    return list.filter(Boolean).join(' / ');
  }

  // 前提技術をすべて研究済みか (研究データ未読込の間はロックしない)
  Designer.isUnlocked = function (option) {
    if (!option || !option.requires) return true;
    if (!researchReady()) return true;
    const list = Array.isArray(option.requires) ? option.requires : [option.requires];
    return list.every(id => researched(id));
  };

  // ---- 性能計算 ----
  const HULL_BASE_ARMOR = { tank: 10, ship: 20, plane: 4 };
  const CATEGORY_ATTACK = { tank: 1, ship: 1, plane: 1 };

  Designer.stats = function (cat) {
    const data = this.DATA[cat];
    const draft = this.draft[cat];
    const hull = data.hulls.find(item => item.id === draft.hull) || null;
    const modules = [];
    data.slots.forEach(slot => {
      const option = slot.options.find(item => item.id === draft.modules[slot.id]);
      if (option) modules.push({ slot: slot.id, ...option });
    });

    const weight = (hull?.weight || 0) + modules.reduce((sum, item) => sum + (item.weight || 0), 0);
    const power = modules.reduce((sum, item) => sum + (item.power || 0), 0);
    const engine = modules.find(item => item.engineCapacity);
    const capacity = engine?.engineCapacity || hull?.capacity || 0;
    const usedCapacity = modules.filter(item => item.id !== 'none').length;
    const overload = Math.max(0, usedCapacity - Math.max(1, capacity));

    const sum = key => modules.reduce((total, item) => total + (Number(item[key]) || 0), 0);

    // 速度: 車体基本速度 + エンジン出力 - 重量ペナルティ - 積載超過
    const baseSpeed = hull?.baseSpeed || 0;
    const rawSpeed = baseSpeed + sum('speed') + power * 0.35 - weight * (cat === 'plane' ? 0.6 : 0.45) - overload * 2.5;
    const speed = Math.max(1, Math.round(rawSpeed * 10) / 10);

    const armor = (HULL_BASE_ARMOR[cat] || 0) + sum('armor');
    const soft = Math.round((sum('soft') + (cat === 'plane' ? 0 : 6)) * CATEGORY_ATTACK[cat] * 10) / 10;
    const hard = Math.round((sum('hard') + (cat === 'plane' ? 0 : 3)) * CATEGORY_ATTACK[cat] * 10) / 10;
    const fire = Math.round(sum('attack') * 10) / 10;
    const defense = Math.round(sum('defense'));
    const piercing = Math.round(sum('piercing'));

    // 信頼性: 基本値 + モジュール補正 - 積載超過。0-100% にクランプ。
    const reliability = Math.max(0, Math.min(100,
      Math.round(70 + sum('reliability') + (engine ? 4 : -6) - overload * 9 - Math.max(0, weight - (hull?.weight || 0) * 2.2) * 0.4)));

    const cost = (hull?.cost || 0) + modules.reduce((total, item) => total + (Number(item.cost) || 0), 0);
    const rangeBonus = modules.find(item => item.range)?.range || 0;
    const mobilityPenalty = modules.find(item => item.agility)?.agility ? Math.abs(modules.find(item => item.agility).agility) : 0;

    const overall = Math.max(0, Math.round(
      (soft * 1.6 + hard * 1.4 + fire * 1.5 + armor * 1.1 + defense * 0.8 + Math.min(speed, 700) * 0.05) *
      (reliability / 100) - overload * 6 + piercing * 0.2
    ));

    return {
      hull, modules, weight, power, capacity, usedCapacity, overload,
      speed, armor, soft, hard, fire, defense, piercing, reliability, cost,
      rangeBonus, mobilityPenalty, overall
    };
  };

  // 旧 API 互換 (dlc.js の設計保存・生産連携から参照される)
  Designer.performance = function (cat) {
    const stats = this.stats(cat);
    return {
      weight: stats.weight, capacity: stats.capacity, usedCapacity: stats.usedCapacity,
      overload: stats.overload, power: stats.power, speed: stats.speed,
      attack: stats.fire || stats.soft, defense: stats.armor + stats.defense,
      overall: stats.overall, rangeBonus: stats.rangeBonus, mobilityPenalty: stats.mobilityPenalty,
      roles: stats.modules.map(item => item.role).filter(Boolean)
    };
  };

  // ---- 操作 ----
  Designer.pickHull = function (hullId) {
    const hull = this.DATA[this.category].hulls.find(item => item.id === hullId);
    if (!hull) return;
    if (!this.isUnlocked(hull)) {
      GameUI.notify('研究が必要です: ' + techLabel(hull.requires), 'alert');
      return;
    }
    this.draft[this.category].hull = hullId;
    this.render();
  };

  Designer.pickModule = function (slotId, optionId) {
    const slot = this.DATA[this.category].slots.find(item => item.id === slotId);
    const option = slot?.options.find(item => item.id === optionId);
    if (option && !this.isUnlocked(option)) {
      GameUI.notify('研究が必要です: ' + techLabel(option.requires), 'alert');
      return;
    }
    this.draft[this.category].modules[slotId] = optionId;
    this.render();
  };

  Designer.xpCost = function (cat) {
    const draft = this.draft[cat];
    if (!draft.hull) return 10;
    const existing = this.designs.find(item => item.cat === cat && item.hullId === draft.hull);
    if (!existing) return 10;
    const changed = this.DATA[cat].slots.filter(slot => draft.modules[slot.id] !== existing.modules?.[slot.id]);
    return changed.reduce((sum, slot) => sum + (slot.id === 'gun' ? 8 : 5), 0) || 0;
  };

  Designer.saveDesign = function () {
    const cat = this.category;
    const draft = this.draft[cat];
    const data = this.DATA[cat];
    const gs = CoreEngine.gameState;
    if (!draft.hull) { GameUI.notify('車体・船体・機体を選択してください。', 'alert'); return; }
    const hull = data.hulls.find(item => item.id === draft.hull);
    if (hull && !this.isUnlocked(hull)) { GameUI.notify('車体の研究が完了していません。', 'alert'); return; }
    const lockedModule = data.slots.some(slot => {
      const option = slot.options.find(item => item.id === draft.modules[slot.id]);
      return option && !this.isUnlocked(option);
    });
    if (lockedModule) { GameUI.notify('未研究のモジュールが含まれています。', 'alert'); return; }
    const cost = this.xpCost(cat);
    const xp = Number(gs.xp[data.xpKey] || 0);
    if (xp < cost) { GameUI.notify(data.label + 'XPが不足しています（必要 ' + cost + ' XP）。', 'alert'); return; }
    gs.xp[data.xpKey] = xp - cost;
    const stats = this.stats(cat);
    const name = (draft.name || '').trim() || (hull.name + ' 設計案');
    const design = {
      id: 'd' + Date.now(), cat, name, hullId: draft.hull,
      modules: { ...draft.modules }, cost, stats: stats,
      productionCostMultiplier: Math.max(1, Math.round(stats.cost / 10)),
      performance: this.performance(cat),
      lines: data.slots.map(slot => slot.name + ': ' + (slot.options.find(item => item.id === draft.modules[slot.id])?.name || '未装備'))
    };
    this.designs.push(design);
    CoreEngine.log('兵器設計完了: ' + name + '（生産コスト ' + stats.cost + ' IC / -' + cost + ' XP）');
    GameUI.notify('設計を保存しました: ' + name, 'success');
    MultiplayerManager.broadcast({ type: 'design', design: design });
    this.render();
  };

  // ---- 描画 ----
  Designer.render = function () {
    const el = document.getElementById('designer-content');
    if (!el) return;
    const cat = this.category;
    const data = this.DATA[cat];
    const draft = this.draft[cat];
    if (!draft) return;
    const gs = CoreEngine.gameState;
    const stats = this.stats(cat);
    const cost = this.xpCost(cat);
    const xp = Number(gs.xp[data.xpKey] || 0);
    const country = gs.country || 'generic';
    const ready = researchReady();

    const tabs = Object.entries(this.DATA).map(([key, value]) =>
      '<button class="' + (key === cat ? 'active' : '') + '" onclick="EquipmentDesigner.setCategory(\'' + key + '\')">' +
      value.label + ' · ' + Math.floor(gs.xp[value.xpKey] || 0) + ' XP</button>').join('');

    const hullOptions = data.hulls.map(hull => {
      const unlocked = this.isUnlocked(hull);
      return '<label class="designer-slot' + (draft.hull === hull.id ? ' selected' : '') + (unlocked ? '' : ' locked') + '">' +
        '<span><input type="radio" name="hull" ' + (draft.hull === hull.id ? 'checked' : '') + ' ' +
        (unlocked ? '' : 'disabled ') + 'onchange="EquipmentDesigner.pickHull(\'' + hull.id + '\')">' +
        (unlocked ? '' : '🔒 ') + hull.name + '<small>' + hull.baseSpeed + ' km/h · ' + hull.weight + 't · 枠' + hull.capacity + '</small></span>' +
        '<strong>' + hull.cost + ' IC</strong></label>';
    }).join('');

    const slotRows = data.slots.map(slot => {
      const options = slot.options.map(option => {
        const unlocked = this.isUnlocked(option);
        const selected = draft.modules[slot.id] === option.id;
        const penalty = option.speed ? ' 速度' + (option.speed > 0 ? '+' : '') + option.speed :
          option.soft ? ' 対人+' + option.soft : option.hard ? ' 対甲+' + option.hard :
            option.armor ? ' 装甲+' + option.armor : option.attack ? ' 火力+' + option.attack :
              option.power ? ' 出力+' + option.power : '';
        return '<option value="' + option.id + '"' + (selected ? ' selected' : '') + (unlocked ? '' : ' disabled') + '>' +
          (unlocked ? '' : '🔒 ') + option.name + ' · ' + option.cost + ' IC' + penalty +
          (unlocked ? '' : '（研究: ' + techLabel(option.requires) + '）') + '</option>';
      }).join('');
      return '<label class="designer-slot"><span>' + slot.name + '</span>' +
        '<select onchange="EquipmentDesigner.pickModule(\'' + slot.id + '\',this.value)">' +
        '<option value="">未選択</option>' + options + '</select></label>';
    }).join('');

    const statRows = [
      ['生産コスト', stats.cost + ' IC'],
      ['対人攻撃', stats.soft],
      ['対甲攻撃', stats.hard],
      [(cat === 'plane' ? '空中攻撃' : '対艦火力'), stats.fire],
      ['装甲', stats.armor],
      ['速度', stats.speed + (cat === 'plane' ? ' km/h' : ' km/h')],
      ['信頼性', Math.max(0, stats.reliability) + '%'],
      ['貫通', stats.piercing],
      ['重量', stats.weight + ' t'],
      ['モジュール枠', stats.usedCapacity + ' / ' + stats.capacity]
    ];
    if (cat === 'plane' && stats.rangeBonus > 0) {
      statRows.push(['航続距離', '+' + Math.round(stats.rangeBonus * 100) + '%']);
      statRows.push(['機動性', '-' + Math.round(stats.mobilityPenalty * 100) + '%']);
    }

    const imageSrc = 'assets/blueprints/aircraft-blueprint.png';
    const fallbackSrc = '/game/assets/blueprints/aircraft-blueprint.png';

    el.innerHTML = '<div class="designer-shell">' +
      '<div class="designer-tabs">' + tabs + '</div>' +
      '<div class="designer-toolbar"><label for="design-name">設計名称</label>' +
      '<input id="design-name" value="' + (draft.name || '') + '" placeholder="例: 一号戦車改" oninput="EquipmentDesigner.draft.' + cat + '.name=this.value">' +
      '<span>国家: ' + country + '</span></div>' +
      (ready ? '' : '<p class="designer-note">※ 研究データ読み込み前のため、全技術を仮に解放しています。</p>') +
      '<div class="designer-grid">' +
        '<section class="designer-card"><h3>兵器グラフィック</h3>' +
          '<div class="designer-preview"><img alt="' + (stats.hull?.name || data.label) + '" src="' + imageSrc + '" onerror="this.onerror=null;this.src=\'' + fallbackSrc + '\'"></div>' +
          '<h4>基礎車体 / 船体 / 機体</h4><div class="designer-slots">' + hullOptions + '</div>' +
        '</section>' +
        '<section class="designer-card"><h3>モジュール構成</h3><div class="designer-slots">' + slotRows + '</div>' +
          '<h3 style="margin-top:16px">性能</h3>' +
          statRows.map(([label, value]) => '<div class="designer-stat"><span>' + label + '</span><strong>' + value + '</strong></div>').join('') +
          (stats.overload ? '<p class="designer-warning">⚠ 積載超過 ' + stats.overload + ' 枠: 速度と信頼性が低下しています。</p>' : '') +
        '</section>' +
      '</div>' +
      '<div class="designer-footer"><div class="designer-xp">' +
        '<span>必要XP: <strong>' + cost + '</strong> / 所持XP: <strong>' + Math.floor(xp) + '</strong></span>' +
        '<meter min="0" max="100" value="' + Math.min(100, xp) + '"></meter></div>' +
        '<button class="designer-save" ' + (xp < cost || !draft.hull ? 'disabled' : '') + ' onclick="EquipmentDesigner.saveDesign()">保存してXPを消費</button>' +
      '</div>' +
      '<div class="designer-shell"><h3>設計一覧</h3>' +
        (this.designs.length ? this.designs.map(design =>
          '<div class="designer-saved"><strong>' + design.name + '</strong>' +
          '<small>' + (design.lines || []).join(' / ') + '</small>' +
          '<span>コスト ' + (design.stats?.cost ?? design.cost) + ' IC · 速度 ' + (design.stats?.speed ?? '-') +
          ' · 対人 ' + (design.stats?.soft ?? '-') + ' · 信頼性 ' + (design.stats?.reliability ?? '-') + '%</span></div>').join('')
          : '<small>まだ設計がありません。</small>') +
      '</div></div>';
  };
})();
