(function () {
  'use strict';
  // ==========================================================
  // assets/equipment-designer.js — HOI4風 兵器設計 (Equipment Designer)
  // ----------------------------------------------------------
  // ・車体/船体/機体（Chassis）を選び、スロットへモジュールを装着
  // ・研究済み技術のみ選択可能（ResearchManager.researchedTech）
  // ・右パネルで最終ステータスをリアルタイム再計算（改善=緑 / 悪化=赤）
  // ・陸軍/海軍/空軍 XP を消費して派生型（Variant）として保存
  // ・主砲/エンジンの必須チェック、小型機体への大型爆弾など装備制限
  //
  // データ本体は dlc.js の EquipmentDesigner.DATA を利用し、
  // このファイルで UI 用メタデータ（必須スロット・サイズ制限・倍率）を付与する。
  // ==========================================================
  const Designer = typeof window !== 'undefined' ? window.EquipmentDesigner : null;
  if (!Designer || !Designer.DATA) return;

  const DATA = Designer.DATA;
  const CATEGORIES = ['tank', 'ship', 'plane'];

  const CATEGORY_META = {
    tank: {
      label: '戦車', service: '陸軍', xpKey: 'army', xpCost: 20, icon: '🚜',
      chassisLabel: '車体', blueprintLabel: '装甲車両 設計図',
      hint: '主砲とエンジンは必須。装甲・足回りで速度と信頼性が変化します。'
    },
    ship: {
      label: '艦船', service: '海軍', xpKey: 'navy', xpCost: 20, icon: '⚓',
      chassisLabel: '船体', blueprintLabel: '艦艇 設計図',
      hint: '主砲と機関は必須。大口径砲は巡洋艦以上の船体にしか搭載できません。'
    },
    plane: {
      label: '航空機', service: '空軍', xpKey: 'air', xpCost: 20, icon: '✈️',
      chassisLabel: '機体', blueprintLabel: '航空機 設計図',
      hint: 'エンジンと武装は必須。小型機体には大型爆弾を搭載できません。'
    }
  };

  const SLOT_INFO = {
    tank: {
      gun: { required: true, icon: '🎯', desc: '主砲は必須スロットです。口径と砲身長で対人・対装甲攻撃、貫通力が決まります。' },
      turret: { icon: '🔰', desc: '砲塔を換装します。大型砲塔は火力と装甲が上がりますが、信頼性が下がります。' },
      armor: { icon: '🛡️', desc: '装甲材を選択します。装甲値が上がるほど重量と生産コストが増えます。' },
      engine: { required: true, icon: '⚙️', desc: 'エンジンは必須スロットです。出力と速度、信頼性に影響します。' },
      radio: { icon: '📡', desc: '無線機を搭載します。攻撃力と信頼性が向上します。' },
      suspension: { icon: '🛞', desc: '足回りを選択します。速度と信頼性が変化します。' }
    },
    ship: {
      gun: { required: true, icon: '🎯', desc: '主砲は必須スロットです。大口径主砲は巡洋艦以上の船体にのみ搭載できます。' },
      torp: { icon: '🐟', desc: '魚雷発射管を搭載します。対艦攻撃力が大きく向上します。' },
      armor: { icon: '🛡️', desc: '船体装甲を選択します。重装甲は防御力と引き換えに速度を失います。' },
      radar: { icon: '📡', desc: '電装・レーダーを搭載します。対空攻撃と信頼性が向上します。' },
      engine: { required: true, icon: '⚙️', desc: '機関は必須スロットです。出力が速力に直結します。' }
    },
    plane: {
      engine: { required: true, icon: '⚙️', desc: 'エンジンは必須スロットです。出力と速度、信頼性に影響します。' },
      weapon: { required: true, icon: '💣', desc: '武装は必須スロットです。任務に合わせて機銃・爆弾・魚雷を選びます。' },
      fuel: { icon: '⛽', desc: '燃料タンクや防弾装備を選択します。増槽は航続距離を伸ばしますが機動性が下がります。' }
    }
  };

  const STAT_DEFS = {
    maxSpeed: { label: '最高速度', short: '速度', unit: ' km/h', better: 'up', decimals: 1 },
    softAttack: { label: '対人攻撃', short: '対人', unit: '', better: 'up', decimals: 0 },
    hardAttack: { label: '対装甲攻撃', short: '対装甲', unit: '', better: 'up', decimals: 0 },
    piercing: { label: '貫通', short: '貫通', unit: '', better: 'up', decimals: 0 },
    armor: { label: '装甲', short: '装甲', unit: '', better: 'up', decimals: 0 },
    airAttack: { label: '対空攻撃', short: '対空', unit: '', better: 'up', decimals: 0 },
    airDefense: { label: '防御', short: '防御', unit: '', better: 'up', decimals: 0 },
    agility: { label: '機動性', short: '機動', unit: '', better: 'up', decimals: 0 },
    range: { label: '航続距離', short: '航続', unit: ' km', better: 'up', decimals: 0 },
    reliability: { label: '信頼性', short: '信頼', unit: '%', better: 'up', decimals: 0 },
    cost: { label: '生産コスト', short: 'コスト', unit: ' IC', better: 'down', decimals: 1 }
  };

  const CATEGORY_STATS = {
    tank: ['maxSpeed', 'softAttack', 'hardAttack', 'piercing', 'armor', 'reliability', 'cost'],
    ship: ['maxSpeed', 'hardAttack', 'airAttack', 'armor', 'reliability', 'cost'],
    plane: ['maxSpeed', 'airAttack', 'softAttack', 'hardAttack', 'agility', 'range', 'airDefense', 'reliability', 'cost']
  };

  // カテゴリごとの呼称（戦車は対人/対装甲、航空機は対地/対艦）
  const STAT_LABEL_OVERRIDE = {
    ship: { hardAttack: '対艦攻撃' },
    plane: { softAttack: '対地攻撃', hardAttack: '対艦攻撃' }
  };
  const STAT_SHORT_OVERRIDE = {
    ship: { hardAttack: '対艦' },
    plane: { softAttack: '対地', hardAttack: '対艦' }
  };

  function statLabel(cat, key) {
    const override = STAT_LABEL_OVERRIDE[cat] || {};
    return override[key] || (STAT_DEFS[key] ? STAT_DEFS[key].label : key);
  }

  function statShort(cat, key) {
    const override = STAT_SHORT_OVERRIDE[cat] || {};
    return override[key] || (STAT_DEFS[key] ? STAT_DEFS[key].short : key);
  }

  const SPEED = {
    tank: { power: 0.25, weight: 0.35, overload: 2.4, reliability: 2.2 },
    ship: { power: 0.12, weight: 0.06, overload: 0.7, reliability: 1.6 },
    plane: { power: 0.50, weight: 6.0, overload: 18, reliability: 1.8 }
  };

  const SIZE_RANK = {
    plane: { small: 1, medium: 2, large: 3 }
  };
  const SIZE_LABEL = {
    tank: { light: '軽量', medium: '中量', heavy: '重量', superheavy: '超重' },
    ship: { light: '小型', cruiser: '巡洋', capital: '主力' },
    plane: { small: '小型', medium: '中型', large: '大型' }
  };

  // モジュール固有の倍率・追加効果（HOI4の「+X%」系を再現）
  const MODULE_EXTRA = {
    tank: {
      composite: { mult: { maxSpeed: -0.03 } },
      turbine: { mult: { reliability: -0.03 } }
    },
    ship: {
      heavy: { mult: { maxSpeed: -0.06 } },
      lgun: { mult: { maxSpeed: -0.03 } },
      radar2: { add: { airAttack: 2 } }
    },
    plane: {
      drop_tank: { add: { range: 450 }, mult: { agility: -0.08 } },
      heavy_bomb: { mult: { agility: -0.15 } },
      plate: { add: { airDefense: 8 }, mult: { agility: -0.06 } },
      torpedo: { add: { hardAttack: 8 } },
      cannon: { add: { airAttack: 2 } }
    }
  };

  // 装備制限（カテゴリ別）
  const MODULE_RULES = {
    tank: {
      heavy: {
        minWeight: 28,
        reason: '重榴弾砲は重戦車以上の車体でのみ運用できます（車体重量 28t 以上）。'
      },
      composite: {
        minWeight: 28,
        reason: '複合装甲は重戦車以上の車体でのみ搭載できます（車体重量 28t 以上）。'
      },
      turbine: {
        minWeight: 28,
        reason: 'ガスタービンは重戦車以上の大型車体でのみ搭載できます（車体重量 28t 以上）。'
      }
    },
    ship: {
      lgun: {
        minWeight: 20,
        reason: 'この船体には大口径主砲を搭載できません。巡洋艦以上の船体が必要です。'
      },
      heavy: {
        minWeight: 20,
        reason: '重装甲は巡洋艦以上の船体でのみ搭載できます。'
      }
    },
    plane: {
      heavy_bomb: {
        minSize: 'medium',
        reason: '小型機体には大型爆弾を搭載できません。中型機体以上の機体が必要です。'
      }
    }
  };

  // 初期から使える基本モジュール（必須スロットが埋まらない状態を防ぐ）
  const EARLY_MODULES = {
    tank: {
      gun: { id: 'basic_gun', name: '37mm 初期戦車砲', cost: 4, weight: 1.5, power: 1, soft: 6, hard: 4, piercing: 25, requires: [] }
    },
    ship: {
      gun: { id: 'basic_gun', name: '12cm 初期甲板砲', cost: 4, weight: 2, power: 1, attack: 8, requires: [] }
    },
    plane: {
      weapon: { id: 'mg_basic', name: '7.7mm 初期機銃', cost: 3, weight: 0.5, soft: 3, attack: 6, requires: [] }
    }
  };

  // ---- utilities ----
  const esc = (value) => String(value == null ? '' : value)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const round1 = (value) => Math.round(num(value) * 10) / 10;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function researchManager() {
    if (typeof ResearchManager !== 'undefined' && ResearchManager) return ResearchManager;
    if (typeof window !== 'undefined' && window.ResearchManager) return window.ResearchManager;
    return null;
  }

  function researchReady() {
    const manager = researchManager();
    const set = manager && manager.researchedTech;
    if (!set || (typeof set.has !== 'function' && !Array.isArray(set))) return false;
    const size = typeof set.size === 'number' ? set.size : Array.isArray(set) ? set.length : 0;
    if (size > 0) return true;
    // 研究データ未読込（空Setのまま）の間はプレビューとして全技術を解放する
    const data = manager.techData;
    return !!(data && typeof data === 'object' && Object.keys(data).length > 0);
  }

  function isResearched(techId) {
    if (!techId) return true;
    if (!researchReady()) return true; // 研究データ読み込み前はプレビュー扱い
    const set = researchManager().researchedTech;
    return typeof set.has === 'function' ? set.has(techId) : set.includes(techId);
  }

  function requiresOf(option) {
    if (!option || !option.requires) return [];
    return Array.isArray(option.requires) ? option.requires.filter(Boolean) : [option.requires];
  }

  function techName(id) {
    const manager = researchManager();
    try {
      const tech = manager && typeof manager.findTech === 'function' ? manager.findTech(id) : null;
      if (tech && tech.title) return tech.title;
    } catch (error) { /* noop */ }
    return id;
  }

  function techNames(option) {
    return requiresOf(option).map(techName).join(' / ');
  }

  function notify(message, type) {
    try {
      if (typeof GameUI !== 'undefined' && GameUI && typeof GameUI.notify === 'function') {
        GameUI.notify(message, type || 'alert');
      }
    } catch (error) { /* noop */ }
  }

  function log(message) {
    try {
      if (typeof CoreEngine !== 'undefined' && CoreEngine && typeof CoreEngine.log === 'function') CoreEngine.log(message);
    } catch (error) { /* noop */ }
  }

  function broadcast(payload) {
    try {
      if (typeof MultiplayerManager !== 'undefined' && MultiplayerManager && typeof MultiplayerManager.broadcast === 'function') {
        MultiplayerManager.broadcast(payload);
      }
    } catch (error) { /* noop */ }
  }

  function gameState() {
    if (typeof CoreEngine !== 'undefined' && CoreEngine && CoreEngine.gameState) return CoreEngine.gameState;
    return null;
  }

  function fmt(value, decimals) {
    const places = decimals == null ? 0 : decimals;
    if (places <= 0) return String(Math.round(num(value)));
    return (Math.round(num(value) * 10) / 10).toFixed(places);
  }

  function signed(value, decimals) {
    const n = num(value);
    return (n > 0 ? '+' : '') + fmt(n, decimals);
  }

  // ---- データの拡張 ----
  function installEarlyModules() {
    CATEGORIES.forEach(cat => {
      const additions = EARLY_MODULES[cat];
      if (!additions) return;
      const data = DATA[cat];
      Object.keys(additions).forEach(slotId => {
        const slot = data.slots.find(item => item.id === slotId);
        if (!slot) return;
        const module = additions[slotId];
        if (!slot.options.some(option => option.id === module.id)) slot.options.unshift(module);
      });
    });
  }

  function prepareData() {
    installEarlyModules();
    CATEGORIES.forEach(cat => {
      const data = DATA[cat];
      if (!data) return;
      data.slots.forEach(slot => {
        const info = (SLOT_INFO[cat] || {})[slot.id] || {};
        slot.required = !!info.required;
        slot.icon = info.icon || '▫';
        slot.desc = info.desc || '装着するモジュールを選択してください。';
        slot.options.forEach(option => {
          option.slot = slot.id;
          const rule = (MODULE_RULES[cat] || {})[option.id];
          if (rule) option.restriction = Object.assign({}, rule);
        });
      });
      // ベース（車体/船体/機体）にも基本ステータス・サイズ・スロット構成を持たせる
      data.hulls.forEach(hull => {
        hull.baseStats = hullBase(cat, hull);
        hull.size = hullSize(cat, hull);
        hull.slots = data.slots.map(slot => ({ id: slot.id, name: slot.name, required: !!slot.required }));
      });
    });
    Designer.CATEGORY_META = CATEGORY_META;
    Designer.STAT_DEFS = STAT_DEFS;
    Designer.CATEGORY_STATS = CATEGORY_STATS;
  }
  prepareData();

  // ---- 車体の素性能 ----
  function hullSize(cat, hull) {
    const weight = num(hull && hull.weight);
    if (cat === 'plane') {
      const req = requiresOf(hull).join(' ');
      if (req.includes('large_airframe')) return 'large';
      if (req.includes('medium_airframe')) return 'medium';
      if (req.includes('small_airframe')) return 'small';
      if (num(hull && hull.capacity) >= 6) return 'large';
      if (num(hull && hull.capacity) >= 4) return 'medium';
      return 'small';
    }
    if (cat === 'ship') {
      if (weight < 20) return 'light';
      if (weight < 40) return 'cruiser';
      return 'capital';
    }
    if (weight < 15) return 'light';
    if (weight < 28) return 'medium';
    if (weight < 45) return 'heavy';
    return 'superheavy';
  }

  function hullBase(cat, hull) {
    const weight = num(hull && hull.weight);
    const speed = num(hull && hull.baseSpeed);
    const cost = num(hull && hull.cost);
    if (cat === 'ship') {
      return {
        maxSpeed: speed, reliability: 80, softAttack: 1, hardAttack: 3, piercing: 8,
        armor: Math.round(5 + weight * 0.5), airAttack: 0, airDefense: 0,
        agility: 0, range: 0, cost: cost, weight: weight, hp: 80 + weight * 6, power: 0
      };
    }
    if (cat === 'plane') {
      return {
        maxSpeed: speed, reliability: 68, softAttack: 0, hardAttack: 0, piercing: 0,
        armor: 0, airAttack: 1, airDefense: 4,
        agility: Math.max(18, Math.round(58 - weight * 0.7)),
        range: Math.round(450 + weight * 35), cost: cost, weight: weight,
        hp: 8 + weight * 1.5, power: 0
      };
    }
    return {
      maxSpeed: speed, reliability: 72, softAttack: 2, hardAttack: 1, piercing: 4,
      armor: Math.round(8 + weight * 0.6), airAttack: 0, airDefense: 0,
      agility: 0, range: 0, cost: cost, weight: weight, hp: 20 + weight * 2, power: 0
    };
  }

  function maxWeightFor(cat, hull) {
    const weight = num(hull && hull.weight);
    if (cat === 'ship') return round1(weight * 1.7 + 8);
    if (cat === 'plane') return round1(weight * 2.0 + 2);
    return round1(weight * 2.3 + 6);
  }

  function buildModuleEffect(cat, option) {
    const add = {};
    const mult = {};
    const addStat = (key, value) => {
      if (!key || !Number.isFinite(Number(value)) || Number(value) === 0) return;
      add[key] = num(add[key]) + Number(value);
    };
    const multStat = (key, value) => {
      if (!key || !Number.isFinite(Number(value)) || Number(value) === 0) return;
      mult[key] = (mult[key] == null ? 1 : mult[key]) * (1 + Number(value));
    };

    addStat('softAttack', option.soft);
    addStat('hardAttack', option.hard);
    addStat('armor', option.armor);
    addStat('piercing', option.piercing);
    addStat('maxSpeed', option.speed);
    addStat('reliability', option.reliability);
    addStat('range', option.range);
    addStat('agility', option.agility);

    if (option.attack) {
      addStat(cat === 'plane' ? 'airAttack' : 'hardAttack', option.attack);
    }
    if (option.defense) {
      addStat(cat === 'plane' ? 'airDefense' : cat === 'ship' ? 'airAttack' : 'armor', option.defense);
    }

    const extra = (MODULE_EXTRA[cat] || {})[option.id];
    if (extra) {
      Object.keys(extra.add || {}).forEach(key => addStat(key, extra.add[key]));
      Object.keys(extra.mult || {}).forEach(key => multStat(key, extra.mult[key]));
    }
    return { add: add, mult: mult };
  }

  function moduleRestriction(cat, hull, option) {
    if (!option || !hull) return null;
    const rule = option.restriction || (MODULE_RULES[cat] || {})[option.id];
    if (!rule) return null;
    if (rule.minSize) {
      const ranks = SIZE_RANK[cat] || {};
      const hullRank = ranks[hullSize(cat, hull)] || 99;
      const minRank = ranks[rule.minSize] || 99;
      if (hullRank < minRank) return rule.reason;
    }
    if (rule.minWeight && num(hull.weight) < rule.minWeight) return rule.reason;
    return null;
  }

  function selectedModules(cat, draft) {
    const data = DATA[cat];
    const modules = [];
    data.slots.forEach(slot => {
      const id = draft && draft.modules ? draft.modules[slot.id] : null;
      if (!id || id === 'none') return;
      const option = slot.options.find(item => item.id === id);
      if (option && option.id !== 'none') modules.push(Object.assign({}, option, { _slot: slot.id }));
    });
    return modules;
  }

  function calculate(cat, hull, modules) {
    const base = hullBase(cat, hull);
    const stats = Object.assign({}, base);
    const mult = {};
    let weight = base.weight;
    let power = 0;

    (modules || []).forEach(option => {
      if (!option) return;
      weight += num(option.weight);
      power += num(option.power);
      const effect = buildModuleEffect(cat, option);
      Object.keys(effect.add).forEach(key => { stats[key] = num(stats[key]) + effect.add[key]; });
      Object.keys(effect.mult).forEach(key => {
        mult[key] = (mult[key] == null ? 1 : mult[key]) * effect.mult[key];
      });
    });

    const maxWeight = maxWeightFor(cat, hull);
    const overload = Math.max(0, weight - maxWeight);
    const speed = SPEED[cat] || SPEED.tank;

    let maxSpeed = num(stats.maxSpeed) + power * speed.power
      - Math.max(0, weight - base.weight) * speed.weight
      - overload * speed.overload;
    if (mult.maxSpeed) maxSpeed *= mult.maxSpeed;
    stats.maxSpeed = Math.max(1, round1(maxSpeed));

    ['softAttack', 'hardAttack', 'piercing', 'armor', 'airAttack', 'airDefense', 'agility', 'range', 'reliability']
      .forEach(key => {
        if (mult[key]) stats[key] = num(stats[key]) * mult[key];
      });

    stats.reliability = clamp(num(stats.reliability) - overload * speed.reliability, 0, 100);
    stats.softAttack = round1(stats.softAttack);
    stats.hardAttack = round1(stats.hardAttack);
    stats.piercing = Math.round(num(stats.piercing));
    stats.armor = Math.round(num(stats.armor));
    stats.airAttack = Math.round(num(stats.airAttack));
    stats.airDefense = Math.round(num(stats.airDefense));
    stats.agility = Math.round(num(stats.agility));
    stats.range = Math.round(num(stats.range));
    stats.reliability = Math.round(num(stats.reliability));
    stats.cost = round1(base.cost + (modules || []).reduce((sum, item) => sum + num(item.cost), 0));
    stats.weight = round1(weight);
    stats.maxWeight = round1(maxWeight);
    stats.overload = round1(overload);
    stats.power = Math.round(power);
    stats.base = base;

    const combat = stats.softAttack * 0.9 + stats.hardAttack * 1.0 + stats.airAttack * 0.8
      + stats.piercing * 0.25 + stats.armor * 0.7 + stats.airDefense * 0.5;
    const mobility = cat === 'plane'
      ? stats.maxSpeed * 0.08 + stats.agility * 0.8 + stats.range * 0.02
      : stats.maxSpeed * 1.4;
    stats.overall = clamp(Math.round((combat * (stats.reliability / 100) + mobility) * 0.7), 0, 100);
    return stats;
  }

  function chassisById(cat, id) {
    const data = DATA[cat];
    return (data && data.hulls.find(hull => hull.id === id)) || null;
  }

  function firstUnlockedHull(cat) {
    const data = DATA[cat];
    const unlocked = data.hulls.filter(hull => Designer.isUnlocked(hull));
    return unlocked[0] || data.hulls[0] || null;
  }

  function defaultModuleForSlot(cat, hull, slot) {
    const candidates = slot.options.filter(option => option.id !== 'none'
      && Designer.isUnlocked(option) && !moduleRestriction(cat, hull, option));
    if (!candidates.length) return '';
    return candidates[0].id;
  }

  function defaultName(cat, hull) {
    return hull ? hull.name + ' 設計案' : CATEGORY_META[cat].label + ' 設計案';
  }

  function installedCount(cat, draft) {
    const data = DATA[cat];
    return data.slots.filter(slot => draft.modules && draft.modules[slot.id]).length;
  }

  // ---- 公開 API ----
  Designer.ensureDraft = function (cat) {
    if (!DATA[cat]) return null;
    if (!this.draft) this.draft = {};
    if (!this.draft[cat]) this.draft[cat] = { hull: null, modules: {}, name: '' };
    const draft = this.draft[cat];
    if (!draft.modules) draft.modules = {};
    let hull = chassisById(cat, draft.hull);
    if (!hull) {
      hull = firstUnlockedHull(cat);
      draft.hull = hull ? hull.id : null;
    }
    const data = DATA[cat];
    data.slots.forEach(slot => {
      const current = draft.modules[slot.id];
      if (current === 'none') {
        // 旧UIの「装備なし」は空スロットとして扱う
        draft.modules[slot.id] = slot.required ? defaultModuleForSlot(cat, hull, slot) : '';
        return;
      }
      const exists = current && slot.options.some(option => option.id === current);
      if (!exists) draft.modules[slot.id] = slot.required ? defaultModuleForSlot(cat, hull, slot) : '';
    });
    if (!draft.name) draft.name = defaultName(cat, hull);
    return draft;
  };

  Designer.isUnlocked = function (option) {
    if (!option) return false;
    return requiresOf(option).every(isResearched);
  };

  Designer.techLabel = function (option) {
    return techNames(option);
  };

  Designer.isModuleCompatible = function (cat, hull, option) {
    return !moduleRestriction(cat, hull, option);
  };

  Designer.getHull = function (cat, id) {
    return chassisById(cat, id || (this.draft[cat] && this.draft[cat].hull));
  };

  Designer.stats = function (cat) {
    const data = DATA[cat];
    const draft = this.draft && this.draft[cat];
    const hull = chassisById(cat, draft && draft.hull) || null;
    if (!data || !hull) {
      return {
        hull: null, modules: [], weight: 0, capacity: 0, usedCapacity: 0, overload: 0,
        speed: 0, armor: 0, soft: 0, hard: 0, fire: 0, defense: 0, piercing: 0,
        reliability: 0, cost: 0, power: 0, rangeBonus: 0, mobilityPenalty: 0, overall: 0
      };
    }
    const modules = selectedModules(cat, draft);
    const stats = calculate(cat, hull, modules);
    const base = stats.base;
    return Object.assign(stats, {
      hull: hull,
      modules: modules,
      usedCapacity: modules.length,
      capacity: hull.capacity,
      speed: stats.maxSpeed,
      soft: stats.softAttack,
      hard: stats.hardAttack,
      fire: stats.airAttack,
      defense: stats.airDefense + stats.armor,
      rangeBonus: base.range ? Math.round(((stats.range - base.range) / base.range) * 100) / 100 : 0,
      mobilityPenalty: base.agility ? Math.round(((base.agility - stats.agility) / base.agility) * 100) / 100 : 0
    });
  };

  Designer.baseStats = function (cat) {
    const draft = this.draft[cat];
    const hull = chassisById(cat, draft && draft.hull);
    if (!hull) return null;
    return calculate(cat, hull, []);
  };

  Designer.performance = function (cat) {
    const stats = this.stats(cat);
    const hull = stats.hull;
    return {
      weight: stats.weight,
      capacity: hull ? hull.capacity : 0,
      usedCapacity: stats.usedCapacity,
      overload: stats.overload,
      power: stats.power,
      speed: stats.maxSpeed,
      attack: Math.round(stats.softAttack + stats.hardAttack + stats.airAttack),
      defense: Math.round(stats.armor + stats.airDefense),
      overall: stats.overall,
      rangeBonus: stats.rangeBonus,
      mobilityPenalty: stats.mobilityPenalty,
      roles: stats.modules.map(item => item.role).filter(Boolean)
    };
  };

  Designer.baseXpCost = function (cat) {
    return (CATEGORY_META[cat] || CATEGORY_META.tank).xpCost;
  };

  Designer.xpCost = function (cat) {
    return this.baseXpCost(cat);
  };

  // ForceSystems が「増槽で +15%」を適用できるよう、コスト計算は cost() を経由する
  Designer.cost = function (cat) {
    return this.baseXpCost(cat);
  };

  Designer.xpAvailable = function (cat) {
    const state = gameState();
    const key = (DATA[cat] && DATA[cat].xpKey) || (CATEGORY_META[cat] && CATEGORY_META[cat].xpKey) || 'army';
    // XP は 1日 +0.2 と小数で貯まるため、小数第1位まで返す（切り捨てると増加が見えなくなる）
    const raw = Math.max(0, num(state && state.xp ? state.xp[key] : 0));
    return Math.round(raw * 10) / 10;
  };

  Designer.validation = function (cat) {
    const data = DATA[cat];
    const draft = this.draft[cat];
    const errors = [];
    const warnings = [];
    if (!data || !draft || !draft.hull) {
      return { valid: false, errors: [CATEGORY_META[cat].chassisLabel + 'を選択してください。'], warnings: warnings };
    }
    const hull = chassisById(cat, draft.hull);
    if (!hull) return { valid: false, errors: [CATEGORY_META[cat].chassisLabel + 'が見つかりません。'], warnings: warnings };
    if (!this.isUnlocked(hull)) {
      errors.push('「' + hull.name + '」は未研究です（要研究: ' + techNames(hull) + '）。');
    }
    data.slots.forEach(slot => {
      const id = draft.modules[slot.id];
      if (!id) {
        if (slot.required) errors.push('「' + slot.name + '」は必須スロットです。空にできません。');
        return;
      }
      const option = slot.options.find(item => item.id === id);
      if (!option) {
        errors.push('「' + slot.name + '」のモジュールが見つかりません。');
        return;
      }
      if (!this.isUnlocked(option)) {
        errors.push('「' + option.name + '」は未研究です（要研究: ' + techNames(option) + '）。');
      }
      const reason = moduleRestriction(cat, hull, option);
      if (reason) errors.push(reason);
    });
    const stats = this.stats(cat);
    if (stats.overload > 0) {
      warnings.push('重量超過 ' + fmt(stats.overload, 1) + ' t：最高速度と信頼性が低下しています。');
    }
    if (stats.reliability < 35) {
      warnings.push('信頼性が ' + stats.reliability + '% まで低下しています。生産効率に注意してください。');
    }
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  };

  Designer.pickHull = function (hullId) {
    const cat = this.category;
    const data = DATA[cat];
    const hull = chassisById(cat, hullId);
    if (!hull) return false;
    if (!this.isUnlocked(hull)) {
      notify('研究が必要です: ' + techNames(hull), 'alert');
      return false;
    }
    const draft = this.ensureDraft(cat);
    const previousHull = chassisById(cat, draft.hull);
    const previousDefault = defaultName(cat, previousHull);
    draft.hull = hull.id;
    data.slots.forEach(slot => {
      if (slot.required && !draft.modules[slot.id]) {
        draft.modules[slot.id] = defaultModuleForSlot(cat, hull, slot);
      }
    });
    if (!draft.name || draft.name === previousDefault) draft.name = defaultName(cat, hull);
    this.render();
    return true;
  };

  Designer.pickModule = function (slotId, optionId) {
    const cat = this.category;
    const data = DATA[cat];
    const slot = data.slots.find(item => item.id === slotId);
    if (!slot) return false;
    const draft = this.ensureDraft(cat);
    const hull = chassisById(cat, draft.hull);
    if (!optionId || optionId === '__none__' || optionId === 'none') {
      if (slot.required) {
        notify('「' + slot.name + '」は必須スロットです。空にできません。', 'alert');
        return false;
      }
      draft.modules[slot.id] = '';
      this.render();
      return true;
    }
    const option = slot.options.find(item => item.id === optionId);
    if (!option) return false;
    if (!this.isUnlocked(option)) {
      notify('研究が必要です: ' + techNames(option), 'alert');
      return false;
    }
    const reason = hull ? moduleRestriction(cat, hull, option) : null;
    if (reason) {
      notify(reason, 'alert');
      return false;
    }
    draft.modules[slot.id] = option.id;
    this.render();
    return true;
  };

  Designer.clearSlot = function (slotId) {
    return this.pickModule(slotId, '');
  };

  Designer.setCategory = function (cat) {
    if (!DATA[cat]) return;
    this.category = cat;
    this.ensureDraft(cat);
    this.render();
  };

  Designer.currentName = function () {
    const draft = this.draft[this.category];
    const hull = chassisById(this.category, draft && draft.hull);
    const typed = draft && draft.name ? String(draft.name).trim() : '';
    return typed || defaultName(this.category, hull);
  };

  Designer.saveDesign = function () {
    const cat = this.category;
    const data = DATA[cat];
    const draft = this.ensureDraft(cat);
    const hull = chassisById(cat, draft.hull);
    if (!hull) {
      notify(CATEGORY_META[cat].chassisLabel + 'を選択してください。', 'alert');
      return null;
    }
    const validation = this.validation(cat);
    if (!validation.valid) {
      notify(validation.errors[0], 'alert');
      this.render();
      return null;
    }
    const cost = this.cost(cat);
    const xp = this.xpAvailable(cat);
    if (xp < cost) {
      notify(CATEGORY_META[cat].service + 'XPが不足しています（必要 ' + cost + ' / 所持 ' + xp + '）。', 'alert');
      this.render();
      return null;
    }
    const state = gameState();
    if (!state) {
      notify('ゲーム状態が初期化されていません。', 'alert');
      return null;
    }
    if (!state.xp) state.xp = { army: 0, navy: 0, air: 0 };
    const stats = this.stats(cat);
    const performance = this.performance(cat);
    const name = this.currentName();
    const design = {
      id: 'd' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      cat: cat,
      name: name,
      hullId: hull.id,
      modules: Object.assign({}, draft.modules),
      cost: cost,
      stats: stats,
      productionCostMultiplier: Math.max(1, Math.round(stats.cost / 10)),
      performance: performance,
      lines: data.slots.map(slot => {
        const option = slot.options.find(item => item.id === draft.modules[slot.id]);
        return slot.name + ': ' + (option ? option.name : '未装備');
      }),
      createdAt: state.date instanceof Date && !Number.isNaN(state.date.getTime()) ? state.date.toISOString() : null
    };
    const rawXp = Number(state.xp[data.xpKey] || 0);
    state.xp[data.xpKey] = Math.max(0, rawXp - cost);
    this.designs.push(design);
    this._savedFlash = design.id;
    log('🛠️ ' + CATEGORY_META[cat].label + '設計完了: ' + name + '（生産コスト ' + stats.cost + ' IC / -' + cost + ' ' + CATEGORY_META[cat].service + 'XP）');
    notify('設計を保存しました: ' + name + '（-' + cost + ' ' + CATEGORY_META[cat].service + 'XP）', 'success');
    broadcast({ type: 'design', design: design });
    this.render();
    return design;
  };

  Designer.loadDesign = function (id) {
    const design = (this.designs || []).find(item => String(item.id) === String(id));
    if (!design || !DATA[design.cat]) return false;
    this.category = design.cat;
    const draft = this.ensureDraft(design.cat);
    if (chassisById(design.cat, design.hullId)) draft.hull = design.hullId;
    draft.modules = {};
    DATA[design.cat].slots.forEach(slot => {
      const moduleId = design.modules ? design.modules[slot.id] : '';
      if (moduleId && slot.options.some(option => option.id === moduleId)) draft.modules[slot.id] = moduleId;
      else if (slot.required) draft.modules[slot.id] = defaultModuleForSlot(design.cat, chassisById(design.cat, draft.hull), slot);
      else draft.modules[slot.id] = '';
    });
    draft.name = / 改$/.test(design.name || '') ? design.name : (design.name || '') + ' 改';
    this.render();
    return true;
  };

  Designer.produceDesign = function (id) {
    const design = (this.designs || []).find(item => String(item.id) === String(id));
    if (!design) return false;
    // セーブデータから復元した設計は生産カタログに未登録のことがあるため、ここで補完する
    try {
      const catalog = typeof ProductionManager !== 'undefined' && ProductionManager ? ProductionManager.CATALOG : null;
      if (catalog && typeof StrategySystems !== 'undefined' && StrategySystems
        && typeof StrategySystems.registerDesign === 'function'
        && (!design.productionType || !catalog[design.productionType])) {
        StrategySystems.registerDesign(design);
      }
    } catch (error) { /* noop */ }
    if (typeof this.equipDesign === 'function') {
      this.equipDesign(design.id);
      return true;
    }
    return false;
  };

  // ==========================================================
  // モーダル（スロットのモジュール選択）
  // ==========================================================
  function effectChips(cat, option) {
    const effect = buildModuleEffect(cat, option);
    const chips = [];
    Object.keys(effect.add).forEach(key => {
      const def = STAT_DEFS[key];
      if (!def || !effect.add[key]) return;
      const value = effect.add[key];
      const good = def.better === 'up' ? value > 0 : value < 0;
      chips.push({
        text: statShort(cat, key) + ' ' + signed(value, def.decimals) + (def.unit || ''),
        tone: good ? 'good' : 'bad'
      });
    });
    Object.keys(effect.mult).forEach(key => {
      const def = STAT_DEFS[key];
      if (!def || !effect.mult[key]) return;
      const factor = effect.mult[key];
      const good = def.better === 'up' ? factor > 1 : factor < 1;
      chips.push({ text: statShort(cat, key) + ' ×' + factor.toFixed(2), tone: good ? 'good' : 'bad' });
    });
    if (num(option.weight)) chips.push({ text: '重量 ' + fmt(option.weight, 1) + ' t', tone: 'neutral' });
    if (num(option.cost)) chips.push({ text: fmt(option.cost, 1) + ' IC', tone: 'gold' });
    return chips;
  }

  function chipsHtml(chips, limit) {
    const list = limit ? chips.slice(0, limit) : chips;
    return list.map(chip => '<span class="eqd-chip ' + chip.tone + '">' + esc(chip.text) + '</span>').join('');
  }

  Designer.slotPickerHtml = function (slotId) {
    const cat = this.category;
    const data = DATA[cat];
    const draft = this.ensureDraft(cat);
    const hull = chassisById(cat, draft.hull);
    const slot = data.slots.find(item => item.id === slotId);
    if (!slot || !hull) return '';
    const meta = CATEGORY_META[cat];
    const selectedId = draft.modules[slot.id] || '';
    const options = slot.options.filter(option => option.id !== 'none');
    const cards = options.map(option => {
      const selected = selectedId === option.id;
      const unlocked = this.isUnlocked(option);
      const reason = moduleRestriction(cat, hull, option);
      const blocked = !unlocked || !!reason;
      const chips = effectChips(cat, option);
      const lockLine = !unlocked
        ? '<span class="eqd-lock-line">🔒 要研究: ' + esc(techNames(option)) + '</span>'
        : reason
          ? '<span class="eqd-lock-line danger">⚠ ' + esc(reason) + '</span>'
          : '';
      return '' +
        '<button type="button" class="eqd-module' + (selected ? ' selected' : '') + (blocked ? ' blocked' : '') + '" ' +
        'data-eqd-pick="' + esc(option.id) + '"' + (blocked ? ' aria-disabled="true"' : '') + ' title="' + esc(option.name) + '">' +
        '<span class="eqd-module-top"><b>' + esc(option.name) + '</b>' +
        (selected ? '<span class="eqd-module-check">✓ 装備中</span>' : '') + '</span>' +
        '<span class="eqd-module-chips">' + chipsHtml(chips) + '</span>' +
        lockLine +
        '</button>';
    }).join('');

    const noneCard = !slot.required ? '' +
      '<button type="button" class="eqd-module eqd-module-none' + (!selectedId ? ' selected' : '') + '" data-eqd-pick="__none__">' +
      '<span class="eqd-module-top"><b>装備を外す</b>' + (!selectedId ? '<span class="eqd-module-check">✓ 未装着</span>' : '') + '</span>' +
      '<span class="eqd-module-chips"><span class="eqd-chip neutral">このスロットを空にします</span></span>' +
      '</button>' : '';

    return '' +
      '<div class="eqd-modal" role="dialog" aria-modal="true" aria-labelledby="eqd-modal-title" tabindex="-1">' +
      '<header class="eqd-modal-head">' +
      '<span class="eqd-modal-icon">' + esc(slot.icon) + '</span>' +
      '<div class="eqd-modal-title"><span class="eqd-kicker">' + esc(meta.label) + ' / モジュール換装</span>' +
      '<h3 id="eqd-modal-title">' + esc(slot.name) + (slot.required ? ' <em>必須</em>' : '') + '</h3>' +
      '<p>' + esc(slot.desc) + '</p></div>' +
      '<button type="button" class="eqd-modal-close" data-eqd-close aria-label="閉じる">✕</button>' +
      '</header>' +
      '<div class="eqd-modal-body">' + noneCard + cards + '</div>' +
      '<p class="eqd-modal-alert" role="alert" aria-live="assertive" hidden></p>' +
      '<footer class="eqd-modal-foot"><span>' + esc(hull.name) + ' に装着可能なモジュール</span>' +
      '<span class="eqd-modal-legend"><i>🔒</i> 未研究 <i>⚠</i> 装備制限</span></footer>' +
      '</div>';
  };

  function showModalAlert(overlay, message) {
    const alert = overlay.querySelector('.eqd-modal-alert');
    if (!alert) return;
    alert.textContent = message;
    alert.hidden = false;
  }

  function lockMessageOf(button) {
    const line = button.querySelector('.eqd-lock-line');
    if (!line) return 'このモジュールは現在装着できません。研究状況と装備制限を確認してください。';
    return line.textContent.replace(/^[\s🔒⚠]+/, '').trim();
  }

  Designer.openSlotPicker = function (slotId) {
    const html = this.slotPickerHtml(slotId);
    if (!html || typeof document === 'undefined' || !document.body) return;
    this.closeSlotPicker();
    const overlay = document.createElement('div');
    overlay.className = 'eqd-modal-overlay';
    overlay.id = 'eqd-modal-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    this._modalSlot = slotId;

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-eqd-close]')) {
        this.closeSlotPicker();
        return;
      }
      const pick = event.target.closest('[data-eqd-pick]');
      if (!pick) return;
      if (pick.getAttribute('aria-disabled') === 'true') {
        showModalAlert(overlay, lockMessageOf(pick));
        return;
      }
      const optionId = pick.getAttribute('data-eqd-pick');
      const ok = this.pickModule(slotId, optionId);
      if (ok) this.closeSlotPicker();
      else showModalAlert(overlay, 'このモジュールは現在装着できません。研究状況と装備制限を確認してください。');
    });

    this._modalKeyHandler = (event) => {
      if (event.key === 'Escape') this.closeSlotPicker();
    };
    document.addEventListener('keydown', this._modalKeyHandler);
    const dialog = overlay.querySelector('.eqd-modal');
    if (dialog && typeof dialog.focus === 'function') dialog.focus();
  };

  Designer.closeSlotPicker = function () {
    if (typeof document === 'undefined') return;
    const slotId = this._modalSlot;
    const overlay = document.getElementById('eqd-modal-overlay');
    if (overlay) overlay.remove();
    if (this._modalKeyHandler) {
      document.removeEventListener('keydown', this._modalKeyHandler);
      this._modalKeyHandler = null;
    }
    this._modalSlot = null;
    // ダイアログを閉じたら、操作していたスロットへフォーカスを戻す
    if (slotId) {
      const slot = document.querySelector('[data-eqd-slot="' + slotId + '"]');
      if (slot && typeof slot.focus === 'function') {
        try { slot.focus({ preventScroll: true }); } catch (error) { slot.focus(); }
      }
    }
  };

  // ==========================================================
  // 設計図（シルエット SVG）
  // ==========================================================
  function blueprintFrame(cat, title, subtitle, content, extraClass) {
    return '' +
      '<svg class="eqd-svg ' + (extraClass || '') + '" viewBox="0 0 560 260" role="img" aria-label="' + esc(title) + ' の設計図">' +
      '<defs><pattern id="eqd-grid-' + cat + '" width="28" height="28" patternUnits="userSpaceOnUse">' +
      '<path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(111,168,201,.12)" stroke-width="1"/></pattern></defs>' +
      '<rect width="560" height="260" fill="url(#eqd-grid-' + cat + ')"/>' +
      '<g class="eqd-bp-frame"><path d="M16 16 H544 V244 H16 Z"/><path d="M16 34 H36 M16 16 V34 M524 244 H544 M544 226 V244"/></g>' +
      content +
      '<text class="eqd-bp-title" x="28" y="34">' + esc(title) + '</text>' +
      '<text class="eqd-bp-sub" x="532" y="34" text-anchor="end">' + esc(subtitle) + '</text>' +
      '<text class="eqd-bp-scale" x="532" y="232" text-anchor="end">SCALE 1:35 · ' + esc(CATEGORY_META[cat].blueprintLabel) + '</text>' +
      '</svg>';
  }

  function tankBlueprint(hull, modules) {
    const bySlot = {};
    modules.forEach(module => { bySlot[module._slot] = module; });
    const gunId = bySlot.gun && bySlot.gun.id;
    const barrel = { basic_gun: 76, how: 88, at: 104, long: 124, heavy: 112 }[gunId] || 82;
    const largeTurret = bySlot.turret && (bySlot.turret.id === 'large' || bySlot.turret.id === 'oscillating');
    const turret = largeTurret
      ? '<path d="M206 132 L230 96 L354 96 L374 132 Z"/>'
      : '<path d="M226 132 L246 100 L338 100 L360 132 Z"/>';
    const gunStart = largeTurret ? 366 : 352;
    const gunY = 111;
    const wheels = bySlot.suspension && bySlot.suspension.id === 'torsion' ? 9 : 8;
    const wheelStart = 156;
    const wheelStep = 34;
    const wheelMarks = Array.from({ length: wheels }, (_, index) => {
      const cx = wheelStart + index * wheelStep;
      return '<circle cx="' + cx + '" cy="181" r="13"/>';
    }).join('');
    const armorLine = bySlot.armor
      ? '<path class="eqd-accent" d="M132 161 H330 V191"/>' +
        (bySlot.armor.id === 'composite' || bySlot.armor.id === 'welded' ? '<path class="eqd-accent faint" d="M140 168 H322 V188"/>' : '')
      : '';
    const radio = bySlot.radio
      ? '<path class="eqd-accent" d="M174 112 V82 M174 82 l14 -9 M188 73 v12"/>'
      : '';
    const engine = bySlot.engine
      ? '<g class="eqd-accent"><path d="M132 148 v-18 M140 148 v-18 M148 148 v-18 M156 148 v-18"/></g>'
      : '';
    const content = '' +
      '<line class="eqd-bp-ground" x1="62" y1="207" x2="500" y2="207"/>' +
      '<g class="eqd-bp-dim"><path d="M112 229 H464 M112 224 v10 M464 224 v10"/><text x="288" y="242" text-anchor="middle">全長 ' + fmt(4.6 + num(hull.weight) * 0.055, 1) + ' m</text></g>' +
      '<g class="eqd-ink">' +
      '<path d="M128 158 H438 Q464 158 464 181 Q464 204 438 204 H150 Q112 204 112 181 Q112 158 128 158 Z"/>' +
      wheelMarks +
      '<circle cx="117" cy="181" r="16"/><circle cx="460" cy="181" r="16"/>' +
      '<path d="M118 158 L448 158 L430 130 L258 130 L232 114 L142 114 Z"/>' +
      turret +
      '<rect x="' + gunStart + '" y="' + gunY + '" width="' + barrel + '" height="7" rx="2"/>' +
      '<rect x="' + (gunStart + barrel) + '" y="' + (gunY - 4) + '" width="12" height="15" rx="2"/>' +
      '<path d="M132 150 v-12 M142 130 h220"/>' +
      '</g>' +
      radio + engine + armorLine +
      '<circle class="eqd-accent-dot" cx="286" cy="116" r="4"/>';
    return blueprintFrame('tank', hull.name,
      fmt(hull.baseSpeed, 0) + ' km/h · ' + fmt(hull.weight, 0) + ' t', content, 'eqd-svg-tank');
  }

  function shipBlueprint(hull, modules) {
    const bySlot = {};
    modules.forEach(module => { bySlot[module._slot] = module; });
    const gunId = bySlot.gun && bySlot.gun.id;
    const bigGun = gunId === 'lgun';
    const carrier = hull.id === 'cv' || hull.id === 'cv2';
    const turretSize = bigGun ? 22 : 15;
    const turrets = carrier
      ? '<g class="eqd-accent"><path d="M210 148 H350 M220 140 V148 M340 140 V148"/></g>'
      : '<g class="eqd-ink">' +
        '<path d="M' + (402 - turretSize) + ' 150 h' + (turretSize * 2) + ' l-8 -18 h-' + (turretSize * 2 - 16) + ' z"/>' +
        '<rect x="' + (402 - turretSize + 7) + '" y="126" width="' + (bigGun ? 46 : 34) + '" height="5" rx="2"/>' +
        '<path d="M' + (146 - turretSize) + ' 150 h' + (turretSize * 2) + ' l-8 -16 h-' + (turretSize * 2 - 16) + ' z"/>' +
        '</g>';
    const torp = bySlot.torp
      ? '<g class="eqd-accent"><rect x="292" y="154" width="42" height="7" rx="3"/><rect x="296" y="161" width="34" height="4" rx="2"/></g>'
      : '';
    const radar = bySlot.radar
      ? '<g class="eqd-accent"><path d="M318 96 v-28 M306 76 h24"/><path d="M306 68 q12 -10 24 0"/></g>'
      : '';
    const armor = bySlot.armor
      ? '<path class="eqd-accent" d="M90 160 H472" />' +
        (bySlot.armor.id === 'heavy' ? '<path class="eqd-accent faint" d="M94 166 H468"/>' : '')
      : '';
    const funnel = bySlot.engine && bySlot.engine.id === 'diesel'
      ? '<path class="eqd-ink" d="M314 150 V112 H338 V150"/><path class="eqd-accent faint" d="M326 112 v-14"/>'
      : '<path class="eqd-ink" d="M308 150 V104 H340 V150"/><path class="eqd-ink" d="M312 104 h24"/><path class="eqd-accent faint" d="M324 104 v-16"/>';
    const content = '' +
      '<line class="eqd-bp-ground" x1="54" y1="199" x2="510" y2="199"/>' +
      '<g class="eqd-bp-dim"><path d="M72 232 H500 M72 227 v10 M500 227 v10"/><text x="286" y="245" text-anchor="middle">全長 ' + fmt(70 + num(hull.weight) * 2.1, 0) + ' m</text></g>' +
      '<g class="eqd-ink">' +
      '<path d="M72 152 L500 152 L468 190 Q448 203 416 203 H122 Q92 203 82 184 Z"/>' +
      '<path d="M72 152 H500"/>' +
      '<path d="M230 152 V114 H292 V152 M240 114 V100 H282 V114"/>' +
      '<path d="M180 152 V136 H212 V152"/>' +
      funnel +
      turrets + torp + armor + radar +
      '<path d="M116 176 H456" class="eqd-faint"/>' +
      '<circle cx="244" cy="132" r="3"/><circle cx="260" cy="132" r="3"/><circle cx="276" cy="132" r="3"/>' +
      '</g>' +
      '<text class="eqd-bp-note" x="304" y="220">' + esc(carrier ? 'FLIGHT DECK' : 'MAIN BATTERY') + '</text>';
    return blueprintFrame('ship', hull.name,
      fmt(hull.baseSpeed, 0) + ' kn · ' + fmt(hull.weight, 0) + ' t', content, 'eqd-svg-ship');
  }

  function planeBlueprint(hull, modules) {
    const bySlot = {};
    modules.forEach(module => { bySlot[module._slot] = module; });
    const size = hullSize('plane', hull);
    const span = size === 'large' ? 43 : size === 'medium' ? 55 : 65;
    const wingTop = 130 - span;
    const wingBottom = 130 + span;
    const weaponId = bySlot.weapon && bySlot.weapon.id;
    const bombs = [];
    if (weaponId === 'bomb' || weaponId === 'heavy_bomb') {
      const rx = weaponId === 'heavy_bomb' ? 11 : 8;
      bombs.push('<ellipse class="eqd-accent" cx="310" cy="' + (130 - span + 12) + '" rx="' + rx + '" ry="' + (rx * 1.9) + '"/>');
      bombs.push('<ellipse class="eqd-accent" cx="310" cy="' + (130 + span - 12) + '" rx="' + rx + '" ry="' + (rx * 1.9) + '"/>');
    }
    if (weaponId === 'torpedo') {
      bombs.push('<ellipse class="eqd-accent" cx="300" cy="148" rx="10" ry="24"/>');
    }
    const guns = (weaponId === 'mg' || weaponId === 'cannon' || weaponId === 'mg_basic')
      ? '<g class="eqd-accent"><path d="M342 ' + (130 - span + 18) + ' h26 M342 ' + (130 + span - 18) + ' h26"/></g>'
      : '';
    const dropTank = bySlot.fuel && bySlot.fuel.id === 'drop_tank'
      ? '<g class="eqd-accent"><ellipse cx="276" cy="150" rx="17" ry="7"/><path d="M276 143 v-6"/></g>'
      : '';
    const armor = bySlot.fuel && bySlot.fuel.id === 'plate'
      ? '<g class="eqd-accent faint"><path d="M322 120 h40 M322 126 h40 M322 132 h40"/></g>'
      : '';
    const engineId = bySlot.engine && bySlot.engine.id;
    const propSize = engineId === 'e3' ? 18 : engineId === 'e2' ? 15 : 12;
    const content = '' +
      '<line class="eqd-bp-ground" x1="74" y1="130" x2="492" y2="130" stroke-dasharray="4 7"/>' +
      '<g class="eqd-bp-dim"><path d="M150 238 H452 M150 233 v10 M452 233 v10"/><text x="300" y="251" text-anchor="middle">全幅 ' + fmt(8 + span * 0.07, 1) + ' m</text></g>' +
      '<g class="eqd-ink">' +
      '<path d="M138 122 Q180 112 250 112 L420 118 Q446 120 452 130 Q446 140 420 142 L250 148 Q180 148 138 138 Z"/>' +
      '<path d="M' + (280 - span) + ' 124 Q' + (300 - span) + ' ' + wingTop + ' ' + (334 - span) + ' ' + wingTop +
      ' L350 ' + wingTop + ' L350 124 Z"/>' +
      '<path d="M' + (280 - span) + ' 136 Q' + (300 - span) + ' ' + wingBottom + ' ' + (334 - span) + ' ' + wingBottom +
      ' L350 ' + wingBottom + ' L350 136 Z"/>' +
      '<path d="M146 124 L114 104 L100 106 L124 128 Z M146 136 L114 156 L100 154 L124 132 Z"/>' +
      '<path d="M170 120 L162 100 L180 100 L188 120 Z M170 140 L162 160 L180 160 L188 140 Z"/>' +
      '<path d="M330 118 L350 108 L392 118 M330 142 L350 152 L392 142"/>' +
      '<circle cx="454" cy="130" r="' + propSize + '"/>' +
      '<path d="M' + (454 + propSize) + ' 130 h10"/>' +
      '<circle cx="342" cy="130" r="9"/>' +
      '</g>' + bombs + guns + dropTank + armor +
      '<text class="eqd-bp-note" x="372" y="96">' + esc(engineId ? 'ENGINE' : 'ENGINE') + '</text>';
    return blueprintFrame('plane', hull.name,
      fmt(hull.baseSpeed, 0) + ' km/h · ' + fmt(hull.weight, 0) + ' t', content, 'eqd-svg-plane');
  }

  function blueprintSvg(cat, hull, modules) {
    if (cat === 'ship') return shipBlueprint(hull, modules);
    if (cat === 'plane') return planeBlueprint(hull, modules);
    return tankBlueprint(hull, modules);
  }

  // ==========================================================
  // 画面描画
  // ==========================================================
  function renderTabs(cat) {
    const currentXp = {};
    CATEGORIES.forEach(key => { currentXp[key] = Designer.xpAvailable(key); });
    return '<div class="eqd-tabs" role="tablist">' + CATEGORIES.map(key => {
      const meta = CATEGORY_META[key];
      const designs = (Designer.designs || []).filter(design => design.cat === key).length;
      return '' +
        '<button type="button" role="tab" aria-selected="' + (key === cat) + '" class="eqd-tab' + (key === cat ? ' active' : '') + '" data-eqd-cat="' + key + '">' +
        '<span class="eqd-tab-icon">' + meta.icon + '</span>' +
        '<span class="eqd-tab-text"><b>' + meta.label + '</b>' +
        '<small data-eqd-xp="' + key + '">' + meta.service + 'XP ' + currentXp[key] + (designs ? ' · 設計 ' + designs : '') + '</small></span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function renderChassisList(cat, data, draft) {
    return '<div class="eqd-panel eqd-chassis-panel">' +
      '<div class="eqd-panel-head"><h3>' + CATEGORY_META[cat].chassisLabel + 'を選択</h3><span>研究で解禁</span></div>' +
      '<div class="eqd-chassis-list">' + data.hulls.map(hull => {
        const active = draft.hull === hull.id;
        const unlocked = Designer.isUnlocked(hull);
        const size = hullSize(cat, hull);
        const base = hull.baseStats || {};
        const baseTitle = '基本: 速度 ' + fmt(hull.baseSpeed, 0) + ' / 装甲 ' + fmt(base.armor, 0) +
          ' / 信頼性 ' + fmt(base.reliability, 0) + '% / コスト ' + fmt(hull.cost, 1) + ' IC';
        return '' +
          '<button type="button" class="eqd-chassis' + (active ? ' active' : '') + (unlocked ? '' : ' locked') + '" ' +
          'data-eqd-chassis="' + esc(hull.id) + '"' + (unlocked ? '' : ' aria-disabled="true"') + ' title="' +
          esc(unlocked ? hull.name + ' — ' + baseTitle : '要研究: ' + techNames(hull)) + '">' +
          '<span class="eqd-chassis-top"><b>' + esc(hull.name) + '</b>' +
          '<span class="eqd-size">' + esc((SIZE_LABEL[cat] || {})[size] || '') + '</span></span>' +
          '<span class="eqd-chassis-stats">速度 ' + fmt(hull.baseSpeed, 0) + ' · 重量 ' + fmt(hull.weight, 0) +
          't · ' + data.slots.length + '枠 · ' + fmt(hull.cost, 1) + ' IC</span>' +
          (unlocked
            ? '<span class="eqd-chassis-state">' + (active ? '✓ 選択中' : '研究済み') + '</span>'
            : '<span class="eqd-chassis-lock">🔒 要研究: ' + esc(techNames(hull)) + '</span>') +
          '</button>';
      }).join('') + '</div></div>';
  }

  function renderSaved(cat) {
    const designs = (Designer.designs || []).filter(design => design.cat === cat);
    return '<div class="eqd-panel eqd-saved-panel">' +
      '<div class="eqd-panel-head"><h3>保存済み設計</h3><span>' + designs.length + ' 件</span></div>' +
      (designs.length ? '<div class="eqd-saved-list">' + designs.slice().reverse().map(design => {
        const overall = design.performance && design.performance.overall != null
          ? design.performance.overall
          : design.stats && design.stats.overall != null ? design.stats.overall : '—';
        const cost = design.stats && design.stats.cost != null ? fmt(design.stats.cost, 1) + ' IC' : '—';
        const flashed = Designer._savedFlash === design.id;
        return '' +
          '<div class="eqd-saved-item' + (flashed ? ' flash' : '') + '" title="' +
          esc(Array.isArray(design.lines) ? design.lines.join(' / ') : '') + '">' +
          '<div class="eqd-saved-title"><b>' + esc(design.name) + '</b><small>' + cost + ' · 総合 ' + overall + '</small></div>' +
          '<div class="eqd-saved-actions">' +
          '<button type="button" data-eqd-load="' + esc(design.id) + '" title="この設計を読み込む">読込</button>' +
          '<button type="button" data-eqd-produce="' + esc(design.id) + '" title="装備生産画面へ">生産</button>' +
          '</div></div>';
      }).join('') + '</div>'
        : '<p class="eqd-empty-note">まだ設計がありません。<br>モジュールを組んで「経験値を消費して保存」を押してください。</p>') +
      '</div>';
  }

  function slotSummary(cat, slot, option, hull) {
    if (!option) {
      return slot.required
        ? '<span class="eqd-slot-empty danger">未装着 — 必須スロットです</span>'
        : '<span class="eqd-slot-empty">未装着（任意）</span>';
    }
    const chips = effectChips(cat, option);
    const reason = moduleRestriction(cat, hull, option);
    if (reason) return '<span class="eqd-slot-empty danger">⚠ ' + esc(reason) + '</span>';
    if (!Designer.isUnlocked(option)) return '<span class="eqd-slot-empty danger">🔒 要研究: ' + esc(techNames(option)) + '</span>';
    return '<span class="eqd-slot-chips">' + chipsHtml(chips, 3) + '</span>';
  }

  function renderSlots(cat, data, draft, hull) {
    const installed = installedCount(cat, draft);
    return '<div class="eqd-slot-section">' +
      '<div class="eqd-section-head"><h3>モジュールスロット</h3>' +
      '<span>' + installed + ' / ' + data.slots.length + ' 装着 · <i class="eqd-required-mark">★</i> 必須</span></div>' +
      '<div class="eqd-slots">' + data.slots.map(slot => {
        const optionId = draft.modules[slot.id];
        const option = optionId ? slot.options.find(item => item.id === optionId) : null;
        const reason = option ? moduleRestriction(cat, hull, option) : null;
        const locked = option ? !Designer.isUnlocked(option) : false;
        const bad = !option ? slot.required : (locked || !!reason);
        return '' +
          '<button type="button" class="eqd-slot' + (option ? ' filled' : ' empty') + (bad ? ' invalid' : '') + (slot.required ? ' required' : '') + '" ' +
          'data-eqd-slot="' + esc(slot.id) + '" aria-label="' + esc(slot.name + 'を換装') + '">' +
          '<span class="eqd-slot-icon">' + esc(slot.icon) + '</span>' +
          '<span class="eqd-slot-main"><span class="eqd-slot-name">' + esc(slot.name) +
          (slot.required ? ' <i class="eqd-required-mark" title="必須スロット">★</i>' : '') + '</span>' +
          '<span class="eqd-slot-module">' + esc(option ? option.name : '—') + '</span>' +
          slotSummary(cat, slot, option, hull) + '</span>' +
          '<span class="eqd-slot-chevron">›</span>' +
          '</button>';
      }).join('') + '</div></div>';
  }

  function deltaClass(key, delta) {
    if (!delta || Math.abs(delta) < 0.001) return 'same';
    const def = STAT_DEFS[key];
    if (!def) return 'same';
    const improved = def.better === 'down' ? delta < 0 : delta > 0;
    return improved ? 'up' : 'down';
  }

  function renderStats(cat, data, draft, hull, stats, baseStats) {
    const overallDelta = stats.overall - baseStats.overall;
    const overallClass = overallDelta > 0 ? 'up' : overallDelta < 0 ? 'down' : 'same';
    const rating = stats.overall >= 80 ? '優秀' : stats.overall >= 62 ? '良好' : stats.overall >= 45 ? '標準' : '試作';
    const rows = CATEGORY_STATS[cat].map(key => {
      const def = STAT_DEFS[key];
      const value = stats[key];
      const base = baseStats[key];
      const delta = round1(value - base);
      const cls = deltaClass(key, delta);
      const deltaText = Math.abs(delta) < 0.001 ? '±0' : signed(delta, def.decimals);
      return '' +
        '<div class="eqd-stat" title="ベース値: ' + fmt(base, def.decimals) + (def.unit || '') + '">' +
        '<span class="eqd-stat-label">' + statLabel(cat, key) + '</span>' +
        '<span class="eqd-stat-value ' + cls + '">' + fmt(value, def.decimals) + '<small>' + esc(def.unit || '') + '</small></span>' +
        '<span class="eqd-stat-delta ' + cls + '">' + (cls === 'up' ? '▲ ' : cls === 'down' ? '▼ ' : '') + deltaText + '</span>' +
        '</div>';
    }).join('');

    const validation = Designer.validation(cat);
    const required = data.slots.filter(slot => slot.required);
    const requiredHtml = required.map(slot => {
      const option = slot.options.find(item => item.id === draft.modules[slot.id]);
      const ok = !!option && Designer.isUnlocked(option) && !moduleRestriction(cat, hull, option);
      return '<span class="eqd-req ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓' : '✕') + ' ' + esc(slot.name) + '</span>';
    }).join('');

    const issues = validation.errors.map(message => '<div class="eqd-issue error">⚠ ' + esc(message) + '</div>')
      .concat(validation.warnings.map(message => '<div class="eqd-issue warn">⚠ ' + esc(message) + '</div>'));

    const weightPct = stats.maxWeight ? clamp(stats.weight / stats.maxWeight * 100, 0, 100) : 0;

    return '<div class="eqd-panel eqd-stat-panel">' +
      '<div class="eqd-panel-head"><h3>最終ステータス</h3><span>基準: 素の' + CATEGORY_META[cat].chassisLabel + '</span></div>' +
      '<div class="eqd-overall">' +
      '<div class="eqd-overall-top"><span>総合性能</span><strong class="' + overallClass + '">' + stats.overall +
      '<small class="' + overallClass + '">' + (overallDelta > 0 ? '▲ +' + overallDelta : overallDelta < 0 ? '▼ ' + overallDelta : '±0') + '</small></strong></div>' +
      '<div class="eqd-overall-bar"><i style="width:' + stats.overall + '%"></i></div>' +
      '<span class="eqd-overall-rating">' + rating + '</span>' +
      '</div>' +
      '<div class="eqd-stat-rows">' + rows + '</div>' +
      '<div class="eqd-weight-row"><span>重量</span><b class="' + (stats.overload > 0 ? 'over' : '') + '">' +
      fmt(stats.weight, 1) + ' / ' + fmt(stats.maxWeight, 1) + ' t</b></div>' +
      '<div class="eqd-weight-bar"><i class="' + (stats.overload > 0 ? 'over' : '') + '" style="width:' + weightPct + '%"></i></div>' +
      '<div class="eqd-required-row"><span>必須:</span>' + requiredHtml + '</div>' +
      '<div class="eqd-issues">' + (issues.length ? issues.join('') : '<div class="eqd-issue ok">✔ 設計要件を満たしています</div>') + '</div>' +
      '</div>';
  }

  function saveHint(cat, validation, xp, cost) {
    const meta = CATEGORY_META[cat];
    if (validation.errors.length) return validation.errors[0];
    if (xp < cost) {
      const need = Math.round((cost - xp) * 10) / 10;
      return meta.service + 'XPが不足しています（あと ' + need + ' 必要）。';
    }
    return meta.service + 'XPを ' + cost + ' 消費して派生型として保存します。';
  }

  function renderSavePanel(cat, validation) {
    const cost = Designer.cost(cat);
    const xp = Designer.xpAvailable(cat);
    const meta = CATEGORY_META[cat];
    const disabled = !validation.valid || xp < cost;
    const pct = cost ? clamp(xp / cost * 100, 0, 100) : 0;
    return '<div class="eqd-panel eqd-save-panel">' +
      '<div class="eqd-save-head"><span class="eqd-kicker">VARIANT SAVE</span><h3>派生型として保存</h3></div>' +
      '<div class="eqd-xp-row"><span>必要 ' + meta.service + 'XP</span><b>' + cost + '</b></div>' +
      '<div class="eqd-xp-row"><span>所持 ' + meta.service + 'XP</span><b id="eqd-xp-owned">' + xp + '</b></div>' +
      '<div class="eqd-xpbar"><i id="eqd-xpbar-fill" style="width:' + pct + '%"></i></div>' +
      '<button type="button" class="eqd-save-btn" id="eqd-save-btn" data-eqd-save' + (disabled ? ' disabled' : '') + '>' +
      '経験値を消費して保存</button>' +
      '<p class="eqd-save-hint' + (validation.errors.length ? ' error' : xp < cost ? ' warn' : '') + '" id="eqd-save-hint">' +
      esc(saveHint(cat, validation, xp, cost)) + '</p>' +
      '<p class="eqd-save-note">保存した設計は「装備生産」画面から生産できます。</p>' +
      '</div>';
  }

  function renderStagebar(cat, hull, draft) {
    return '<div class="eqd-stagebar">' +
      '<label class="eqd-name-field"><span>設計名称</span>' +
      '<input id="eqd-design-name" type="text" maxlength="48" value="' + esc(draft.name || '') + '" placeholder="' + esc(defaultName(cat, hull)) + '" autocomplete="off"></label>' +
      '<div class="eqd-stage-tags">' +
      '<span class="eqd-tag">' + esc(hull.name) + '</span>' +
      '<span class="eqd-tag dim">' + esc((SIZE_LABEL[cat] || {})[hullSize(cat, hull)] || '') + '</span>' +
      '<span class="eqd-tag dim">' + CATEGORY_META[cat].service + '設計</span>' +
      '</div></div>';
  }

  Designer.render = function () {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('designer-content');
    if (!host) return;
    const cat = DATA[this.category] ? this.category : 'tank';
    this.category = cat;
    const data = DATA[cat];
    const draft = this.ensureDraft(cat);
    const hull = chassisById(cat, draft.hull);
    if (!hull) {
      host.innerHTML = '<div class="eqd-error">車体データを読み込めませんでした。</div>';
      return;
    }
    const stats = this.stats(cat);
    const baseStats = this.baseStats(cat);
    const validation = this.validation(cat);
    const meta = CATEGORY_META[cat];
    const modules = selectedModules(cat, draft);
    const sameCategory = this._lastRenderCategory === cat;
    const previousScroll = {
      left: sameCategory && host.querySelector('.eqd-left') ? host.querySelector('.eqd-left').scrollTop : 0,
      center: sameCategory && host.querySelector('.eqd-center') ? host.querySelector('.eqd-center').scrollTop : 0,
      right: sameCategory && host.querySelector('.eqd-right') ? host.querySelector('.eqd-right').scrollTop : 0
    };

    const html = '' +
      '<div class="eqd" data-eqd-cat="' + cat + '">' +
      '<header class="eqd-top"><div class="eqd-brand"><span class="eqd-kicker">EQUIPMENT DESIGNER</span><h2>兵器設計</h2></div>' +
      renderTabs(cat) +
      '<div class="eqd-top-note"><span class="eqd-country">' + esc((gameState() && gameState().country) || '---') + '</span>' +
      '<small>研究済みモジュールのみ装着可能</small></div></header>' +
      '<div class="eqd-body">' +
      '<aside class="eqd-col eqd-left">' + renderChassisList(cat, data, draft) + renderSaved(cat) + '</aside>' +
      '<main class="eqd-col eqd-center">' +
      renderStagebar(cat, hull, draft) +
      '<div class="eqd-blueprint">' + blueprintSvg(cat, hull, modules) +
      '<div class="eqd-bp-caption"><span>' + esc(hull.name) + '</span><span>' + esc(meta.hint) + '</span></div></div>' +
      renderSlots(cat, data, draft, hull) +
      '</main>' +
      '<aside class="eqd-col eqd-right">' +
      renderStats(cat, data, draft, hull, stats, baseStats) +
      renderSavePanel(cat, validation) +
      '</aside>' +
      '</div></div>';

    host.innerHTML = html;
    this._savedFlash = null;
    this._lastRenderCategory = cat;

    const leftCol = host.querySelector('.eqd-left');
    const centerCol = host.querySelector('.eqd-center');
    const rightCol = host.querySelector('.eqd-right');
    if (leftCol) leftCol.scrollTop = previousScroll.left;
    if (centerCol) centerCol.scrollTop = previousScroll.center;
    if (rightCol) rightCol.scrollTop = previousScroll.right;

    const rootEl = host.querySelector('.eqd');
    if (rootEl) {
      rootEl.addEventListener('click', (event) => {
        const categoryButton = event.target.closest('[data-eqd-cat]');
        if (categoryButton && categoryButton.classList.contains('eqd-tab')) {
          this.setCategory(categoryButton.getAttribute('data-eqd-cat'));
          return;
        }
        const chassisButton = event.target.closest('[data-eqd-chassis]');
        if (chassisButton) {
          this.pickHull(chassisButton.getAttribute('data-eqd-chassis'));
          return;
        }
        const slotButton = event.target.closest('[data-eqd-slot]');
        if (slotButton) {
          this.openSlotPicker(slotButton.getAttribute('data-eqd-slot'));
          return;
        }
        const saveButton = event.target.closest('[data-eqd-save]');
        if (saveButton) {
          this.saveDesign();
          return;
        }
        const loadButton = event.target.closest('[data-eqd-load]');
        if (loadButton) {
          this.loadDesign(loadButton.getAttribute('data-eqd-load'));
          return;
        }
        const produceButton = event.target.closest('[data-eqd-produce]');
        if (produceButton) {
          this.produceDesign(produceButton.getAttribute('data-eqd-produce'));
        }
      });

      const nameInput = rootEl.querySelector('#eqd-design-name');
      if (nameInput) {
        nameInput.addEventListener('input', () => {
          const current = this.ensureDraft(this.category);
          current.name = nameInput.value;
        });
      }
    }
  };

  Designer.updateLive = function () {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('designer-content');
    if (!host || !host.querySelector('.eqd')) return;
    const cat = this.category;
    CATEGORIES.forEach(key => {
      const label = host.querySelector('[data-eqd-xp="' + key + '"]');
      if (!label) return;
      const designs = (this.designs || []).filter(design => design.cat === key).length;
      label.textContent = CATEGORY_META[key].service + 'XP ' + this.xpAvailable(key) + (designs ? ' · 設計 ' + designs : '');
    });
    const cost = this.cost(cat);
    const xp = this.xpAvailable(cat);
    const validation = this.validation(cat);
    const owned = host.querySelector('#eqd-xp-owned');
    if (owned) owned.textContent = xp;
    const fill = host.querySelector('#eqd-xpbar-fill');
    if (fill) fill.style.width = clamp(cost ? xp / cost * 100 : 0, 0, 100) + '%';
    const button = host.querySelector('#eqd-save-btn');
    if (button) button.disabled = !validation.valid || xp < cost;
    const hint = host.querySelector('#eqd-save-hint');
    if (hint) {
      hint.textContent = saveHint(cat, validation, xp, cost);
      hint.classList.toggle('error', validation.errors.length > 0);
      hint.classList.toggle('warn', validation.errors.length === 0 && xp < cost);
    }
  };

  Designer.onTick = function () {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('designer-content');
    if (!host || !host.querySelector('.eqd')) return;
    const win = host.closest && host.closest('.os-window');
    if (!win) return;
    const now = Date.now();
    if (this._lastLive && now - this._lastLive < 700) return;
    this._lastLive = now;
    this.updateLive();
  };

  Designer.onResearchChange = function () {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('designer-content');
    if (!host || !host.querySelector('.eqd')) return;
    if (!host.closest || !host.closest('.os-window')) return;
    this.closeSlotPicker();
    this.render();
    notify('研究状況が更新されました。新しいモジュールが解禁された可能性があります。', 'success');
  };

  // ---- 既存システムとの連携 ----
  function installHooks() {
    if (Designer.__eqdHooksInstalled) return;
    Designer.__eqdHooksInstalled = true;

    // XP の増加に合わせて保存ボタンだけを軽量更新
    try {
      if (typeof CoreEngine !== 'undefined' && CoreEngine && typeof CoreEngine.registerTickCallback === 'function') {
        CoreEngine.registerTickCallback(() => Designer.onTick());
      }
    } catch (error) { /* noop */ }

    // 研究完了時に設計画面を更新（アンロックされたモジュールを即時反映）
    try {
      if (typeof ResearchManager !== 'undefined' && ResearchManager && !ResearchManager.__eqdHooked) {
        ResearchManager.__eqdHooked = true;
        let lastSize = ResearchManager.researchedTech && ResearchManager.researchedTech.size != null
          ? ResearchManager.researchedTech.size : 0;
        const onTick = ResearchManager.onTick;
        if (typeof onTick === 'function') {
          ResearchManager.onTick = function () {
            const result = onTick.apply(this, arguments);
            const size = this.researchedTech && this.researchedTech.size != null ? this.researchedTech.size : 0;
            if (size !== lastSize) {
              lastSize = size;
              Designer.onResearchChange();
            }
            return result;
          };
        }
        const init = ResearchManager.init;
        if (typeof init === 'function') {
          ResearchManager.init = async function () {
            const result = await init.apply(this, arguments);
            lastSize = this.researchedTech && this.researchedTech.size != null ? this.researchedTech.size : 0;
            Designer.onResearchChange();
            return result;
          };
        }
      }
    } catch (error) { /* noop */ }
  }
  installHooks();

  // 既存の設計一覧との互換用
  if (!Array.isArray(Designer.designs)) Designer.designs = [];
  if (!Designer.draft || !Designer.draft.tank) {
    Designer.draft = { tank: { hull: null, modules: {}, name: '' }, ship: { hull: null, modules: {}, name: '' }, plane: { hull: null, modules: {}, name: '' } };
  }
  CATEGORIES.forEach(cat => Designer.ensureDraft(cat));
})();
