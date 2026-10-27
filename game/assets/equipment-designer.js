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

  function moduleImageFile(cat, slot, option) {
    if (option.asset_key || option.icon_key) return (option.asset_key || option.icon_key).replace(/\.png$/, '');
    const index = Math.max(0, slot.options.filter(o => o.id !== 'none').indexOf(option));
    const tier = Math.min(4, index + 1);
    if (slot.id === 'engine') return (cat === 'plane' ? 'bba_tech_engines_' : 'nsb_engine_tech_') + tier;
    if (slot.id === 'armor' || slot.id === 'turret') return 'nsb_armor_tech_' + tier;
    if (slot.id === 'radio' || slot.id === 'radar') return 'radio';
    if (slot.id === 'gun') return cat === 'ship' ? 'Basic_heavy_battery' : 'artillery_equipment';
    if (slot.id === 'weapon') return 'bba_tech_aa_cannon_1';
    return 'electronic_mechanical_engineering';
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
        '<img class="eqd-module-image" src="assets/technology/' + encodeURIComponent(moduleImageFile(cat, slot, option)) + '.png" alt="' + esc(option.name) + '" loading="lazy" onerror="this.hidden=true">' +
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
      '<div class="eqd-modal-split">' +
      '<div class="eqd-modal-body">' + noneCard + cards + '</div>' +
      '<aside class="eqd-modal-preview"><span class="eqd-kicker">設計図プレビュー</span>' +
      '<div class="eqd-modal-preview-svg" data-eqd-preview>' + this.previewSvg(cat, hull.id) + '</div>' +
      '<p class="eqd-modal-preview-name" data-eqd-preview-name>' + esc(slot.name + ': ' + (selectedId ? ((slot.options.find(o => o.id === selectedId) || {}).name || selectedId) : '未装着')) + '</p>' +
      '<small>カーソルを合わせると設計図が切り替わります</small></aside>' +
      '</div>' +
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

    const previewOption = (pick) => {
      const optionId = pick ? pick.getAttribute('data-eqd-pick') : null;
      const draft = this.ensureDraft(this.category);
      const overrides = {};
      let label;
      if (!optionId) {
        label = null;
      } else if (optionId === '__none__') {
        overrides[slotId] = '';
        label = '未装着';
      } else {
        overrides[slotId] = optionId;
        label = pick.getAttribute('title') || optionId;
      }
      const svg = this.previewSvg(this.category, draft.hull, overrides);
      const pane = overlay.querySelector('[data-eqd-preview]');
      if (pane) pane.innerHTML = svg;
      const name = overlay.querySelector('[data-eqd-preview-name]');
      if (name) name.textContent = (label == null ? '現在の装備' : label);
      this.setBlueprintPreview(optionId ? svg : null, label || '');
    };
    overlay.addEventListener('mouseover', (event) => {
      const pick = event.target.closest && event.target.closest('[data-eqd-pick]');
      if (pick) previewOption(pick);
    });
    overlay.addEventListener('focusin', (event) => {
      const pick = event.target.closest && event.target.closest('[data-eqd-pick]');
      if (pick) previewOption(pick);
    });
    overlay.addEventListener('mouseleave', () => previewOption(null));

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
    this.setBlueprintPreview(null);
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

  // ==========================================================
  // 設計図: 車体/船体/機体 + 各モジュールごとにパーツ描画が切り替わる
  // ==========================================================
  function slotMap(modules) { const m = {}; modules.forEach(module => { m[module._slot] = module; }); return m; }
  function callout(x, y, tx, ty, label, anchor) {
    return '<g class="eqd-callout"><path d="M' + x + ' ' + y + ' L' + tx + ' ' + ty + '"/><circle cx="' + x + '" cy="' + y + '" r="2.2"/>' +
      '<text x="' + (tx + (anchor === 'end' ? -4 : 4)) + '" y="' + (ty + 3) + '" text-anchor="' + (anchor || 'start') + '">' + esc(label) + '</text></g>';
  }

  // ---------- 戦車 ----------
  const TANK_HULLS = {
    lt:  { len: 250, h: 34, top: 150, wheels: 5, wr: 11, sloped: false, note: 'LIGHT' },
    ilt: { len: 262, h: 36, top: 148, wheels: 5, wr: 11, sloped: true,  note: 'LIGHT MkII' },
    mt:  { len: 300, h: 42, top: 142, wheels: 6, wr: 12, sloped: false, note: 'MEDIUM' },
    imt: { len: 310, h: 44, top: 140, wheels: 6, wr: 12, sloped: true,  note: 'MEDIUM MkII' },
    amt: { len: 318, h: 42, top: 142, wheels: 7, wr: 11, sloped: true,  note: 'ADV. MEDIUM' },
    mbt: { len: 330, h: 40, top: 144, wheels: 7, wr: 12, sloped: true,  note: 'MAIN BATTLE' },
    ht:  { len: 326, h: 56, top: 130, wheels: 8, wr: 12, sloped: false, note: 'HEAVY' },
    iht: { len: 336, h: 58, top: 128, wheels: 8, wr: 12, sloped: true,  note: 'HEAVY MkII' },
    sht: { len: 380, h: 70, top: 118, wheels: 9, wr: 13, sloped: false, note: 'SUPER HEAVY' }
  };
  function tankBlueprint(hull, modules) {
    const by = slotMap(modules);
    const H = TANK_HULLS[hull.id] || TANK_HULLS.mt;
    const cx = 290, left = cx - H.len / 2, right = cx + H.len / 2, top = H.top, bottom = top + H.h, ground = 207;
    const wheelY = bottom + 16;
    // --- 車体 ---
    const glacis = H.sloped ? 'L' + (right - 10) + ' ' + top + ' L' + (right + 6) + ' ' + (bottom - 6) : 'L' + right + ' ' + top + ' L' + right + ' ' + (bottom - 6);
    const hullPath = '<path d="M' + left + ' ' + (bottom - 6) + ' L' + (left + 14) + ' ' + top + ' ' + glacis + ' L' + right + ' ' + bottom + ' L' + left + ' ' + bottom + ' Z"/>' +
      '<path class="eqd-faint" d="M' + (left + 14) + ' ' + (bottom - 2) + ' H' + (right - 10) + '"/>';
    // --- 足回り ---
    const susp = by.suspension && by.suspension.id;
    const n = H.wheels, step = (H.len - 70) / Math.max(1, n - 1), ws = left + 35;
    let running = '<path d="M' + (left + 12) + ' ' + (wheelY + H.wr + 4) + ' H' + (right - 12) + ' M' + (left + 12) + ' ' + (wheelY - H.wr - 3) + ' H' + (right - 12) + '"/>' +
      '<circle cx="' + (left + 10) + '" cy="' + (wheelY - 6) + '" r="' + (H.wr + 1) + '"/><circle cx="' + (right - 10) + '" cy="' + (wheelY - 8) + '" r="' + (H.wr + 2) + '"/>';
    for (let i = 0; i < n; i++) {
      const x = ws + i * step;
      running += '<circle cx="' + x + '" cy="' + wheelY + '" r="' + H.wr + '"/><circle cx="' + x + '" cy="' + wheelY + '" r="' + (H.wr * 0.45) + '"/>';
      if (susp === 'torsion') running += '<path class="eqd-accent" d="M' + x + ' ' + (wheelY - H.wr) + ' l6 -12 h-12"/>';
    }
    if (susp === 'bogie') { for (let i = 0; i + 1 < n; i += 2) { const x1 = ws + i * step, x2 = ws + (i + 1) * step; running += '<path class="eqd-accent" d="M' + x1 + ' ' + (wheelY - H.wr - 2) + ' L' + ((x1 + x2) / 2) + ' ' + (wheelY - H.wr - 14) + ' L' + x2 + ' ' + (wheelY - H.wr - 2) + ' M' + ((x1 + x2) / 2 - 5) + ' ' + (wheelY - H.wr - 14) + ' h10 M' + ((x1 + x2) / 2) + ' ' + (wheelY - H.wr - 14) + ' v-6"/>'; } }
    else if (!susp) running += '<path class="eqd-accent faint" d="M' + (ws) + ' ' + (wheelY - H.wr - 6) + ' H' + (ws + (n - 1) * step) + '"/>';
    // --- 砲塔 ---
    const tur = by.turret && by.turret.id;
    const tw = tur === 'large' ? 150 : tur === 'oscillating' ? 128 : 112, th = tur === 'large' ? 40 : 32, tx = cx - tw / 2 + 10, ty = top - th;
    let turret;
    if (tur === 'large') turret = '<path d="M' + tx + ' ' + top + ' L' + (tx + 14) + ' ' + ty + ' H' + (tx + tw - 8) + ' L' + (tx + tw + 10) + ' ' + top + ' Z"/><rect x="' + (tx + 30) + '" y="' + (ty - 8) + '" width="34" height="8" rx="2"/>';
    else if (tur === 'oscillating') turret = '<path d="M' + tx + ' ' + top + ' L' + (tx + 10) + ' ' + (ty + 14) + ' H' + (tx + tw) + ' L' + (tx + tw + 8) + ' ' + top + ' Z"/><path d="M' + (tx + 24) + ' ' + (ty + 14) + ' L' + (tx + 34) + ' ' + ty + ' H' + (tx + tw - 10) + ' L' + (tx + tw + 2) + ' ' + (ty + 14) + '"/><circle class="eqd-accent" cx="' + (tx + tw - 4) + '" cy="' + (ty + 14) + '" r="4"/>';
    else if (tur === 'std') turret = '<path d="M' + tx + ' ' + top + ' Q' + (tx + 6) + ' ' + ty + ' ' + (tx + 30) + ' ' + ty + ' H' + (tx + tw - 14) + ' Q' + (tx + tw + 4) + ' ' + (ty + 6) + ' ' + (tx + tw + 6) + ' ' + top + ' Z"/><circle cx="' + (tx + 40) + '" cy="' + (ty + 4) + '" r="6"/>';
    else turret = '<path class="eqd-faint" stroke-dasharray="4 4" d="M' + tx + ' ' + top + ' L' + (tx + 12) + ' ' + (ty + 8) + ' H' + (tx + tw - 10) + ' L' + (tx + tw + 4) + ' ' + top + ' Z"/>';
    const gunY = ty + th * 0.45, gunX = tx + tw + (tur === 'large' ? 10 : 6);
    // --- 主砲 ---
    const gun = by.gun && by.gun.id;
    const G = { basic_gun: { len: 70, d: 5, brake: 0, mantlet: 10 }, how: { len: 54, d: 10, brake: 0, mantlet: 16 }, at: { len: 110, d: 6, brake: 1, mantlet: 12 }, long: { len: 150, d: 6, brake: 2, mantlet: 14 }, heavy: { len: 120, d: 11, brake: 2, mantlet: 20 } }[gun] || { len: 0 };
    let gunSvg = '';
    if (G.len) {
      gunSvg = '<rect x="' + (gunX - 4) + '" y="' + (gunY - G.mantlet / 2) + '" width="12" height="' + G.mantlet + '" rx="3"/><rect x="' + (gunX + 8) + '" y="' + (gunY - G.d / 2) + '" width="' + G.len + '" height="' + G.d + '" rx="1.5"/>';
      if (gun === 'at' || gun === 'long') gunSvg += '<rect x="' + (gunX + 8) + '" y="' + (gunY - G.d / 2 - 2) + '" width="' + (G.len * 0.35) + '" height="' + (G.d + 4) + '" rx="2"/>';
      if (G.brake === 1) gunSvg += '<rect x="' + (gunX + 8 + G.len) + '" y="' + (gunY - G.d / 2 - 3) + '" width="10" height="' + (G.d + 6) + '" rx="2"/>';
      if (G.brake === 2) gunSvg += '<rect x="' + (gunX + 8 + G.len) + '" y="' + (gunY - G.d / 2 - 4) + '" width="14" height="' + (G.d + 8) + '" rx="2"/><path d="M' + (gunX + 12 + G.len) + ' ' + (gunY - G.d / 2 - 4) + ' v-4 M' + (gunX + 18 + G.len) + ' ' + (gunY - G.d / 2 - 4) + ' v-4"/>';
      if (gun === 'how' || gun === 'heavy') gunSvg += '<path d="M' + (gunX + 8 + G.len) + ' ' + (gunY - G.d / 2) + ' l6 -3 v' + (G.d + 6) + ' l-6 -3"/>';
    }
    // --- 装甲 ---
    const arm = by.armor && by.armor.id; let armor = '';
    if (arm === 'steel') armor = '<path class="eqd-accent" d="M' + (left + 16) + ' ' + (top + 6) + ' H' + (right - 14) + '"/>' + '<g class="eqd-accent faint">' + Array.from({ length: 6 }, (_, i) => '<circle cx="' + (left + 30 + i * (H.len - 60) / 5) + '" cy="' + (top + 12) + '" r="1.5"/>').join('') + '</g>';
    else if (arm === 'slope') armor = '<path class="eqd-accent" d="M' + (right - 12) + ' ' + top + ' L' + (right + 4) + ' ' + (bottom - 8) + ' M' + (right - 20) + ' ' + (top + 4) + ' L' + (right - 4) + ' ' + (bottom - 8) + '"/><path class="eqd-accent faint" d="M' + (left + 14) + ' ' + top + ' L' + left + ' ' + (bottom - 6) + '"/>';
    else if (arm === 'welded') armor = '<g class="eqd-accent"><path d="M' + (left + 60) + ' ' + top + ' V' + bottom + ' M' + (cx) + ' ' + top + ' V' + bottom + ' M' + (right - 60) + ' ' + top + ' V' + bottom + '"/><path class="faint" stroke-dasharray="2 3" d="M' + (left + 16) + ' ' + (top + H.h / 2) + ' H' + (right - 12) + '"/></g>';
    else if (arm === 'composite') armor = '<g class="eqd-accent"><path d="M' + (left + 16) + ' ' + (top + 5) + ' H' + (right - 14) + ' M' + (left + 16) + ' ' + (top + 10) + ' H' + (right - 14) + '"/><path class="faint" d="M' + (left + 30) + ' ' + (top + 5) + ' l6 5 M' + (left + 70) + ' ' + (top + 5) + ' l6 5 M' + (left + 110) + ' ' + (top + 5) + ' l6 5 M' + (left + 150) + ' ' + (top + 5) + ' l6 5"/></g>';
    // --- エンジン (後部 = 左) ---
    const eng = by.engine && by.engine.id; let engine = '';
    const ex = left + 20, ey = top + 8;
    if (eng === 'gas') engine = '<g class="eqd-accent"><rect x="' + ex + '" y="' + ey + '" width="36" height="' + (H.h - 16) + '" rx="2"/><path d="M' + (ex + 8) + ' ' + ey + ' v-6 M' + (ex + 18) + ' ' + ey + ' v-6 M' + (ex + 28) + ' ' + ey + ' v-6"/></g>';
    else if (eng === 'diesel') engine = '<g class="eqd-accent"><rect x="' + ex + '" y="' + ey + '" width="44" height="' + (H.h - 16) + '" rx="2"/><path d="M' + (ex + 6) + ' ' + ey + ' v-6 M' + (ex + 14) + ' ' + ey + ' v-6 M' + (ex + 22) + ' ' + ey + ' v-6 M' + (ex + 30) + ' ' + ey + ' v-6 M' + (ex + 38) + ' ' + ey + ' v-6"/><path d="M' + (left + 2) + ' ' + (top + 10) + ' h-10 v8"/></g>';
    else if (eng === 'high') engine = '<g class="eqd-accent"><rect x="' + ex + '" y="' + ey + '" width="50" height="' + (H.h - 16) + '" rx="2"/><path d="M' + (ex + 6) + ' ' + (ey + 4) + ' h38 M' + (ex + 6) + ' ' + (ey + 10) + ' h38"/><path d="M' + (left + 2) + ' ' + (top + 8) + ' h-12 v6 M' + (left + 2) + ' ' + (top + 18) + ' h-12 v6"/></g>';
    else if (eng === 'turbine') engine = '<g class="eqd-accent"><circle cx="' + (ex + 22) + '" cy="' + (ey + (H.h - 16) / 2) + '" r="' + Math.min(14, (H.h - 16) / 2) + '"/><path d="M' + (ex + 22) + ' ' + (ey + (H.h - 16) / 2 - 10) + ' v20 M' + (ex + 12) + ' ' + (ey + (H.h - 16) / 2) + ' h20"/><path d="M' + (ex + 44) + ' ' + ey + ' h20 M' + (ex + 44) + ' ' + (ey + 5) + ' h20 M' + (ex + 44) + ' ' + (ey + 10) + ' h20"/><path d="M' + (left + 2) + ' ' + (top + 6) + ' h-16 v14 h16"/></g>';
    // --- 無線 ---
    const rad = by.radio && by.radio.id; let radio = '';
    if (rad === 'radio1') radio = '<path class="eqd-accent" d="M' + (tx + 14) + ' ' + ty + ' v-26 l4 -4"/>';
    else if (rad === 'radio2') radio = '<path class="eqd-accent" d="M' + (tx + 14) + ' ' + ty + ' v-30 l4 -4 M' + (tx + tw - 16) + ' ' + ty + ' v-22 M' + (tx + tw - 22) + ' ' + (ty - 22) + ' h12"/>';
    // --- 注釈 ---
    let notes = '';
    if (by.gun) notes += callout(gunX + 8 + G.len * 0.6, gunY, 470, 60, by.gun.name);
    if (by.turret) notes += callout(tx + tw / 2, ty + 4, 300, 56, by.turret.name, 'end');
    if (by.engine) notes += callout(ex + 20, ey + 6, 60, 72, by.engine.name);
    if (by.armor) notes += callout(right - 30, top + 6, 500, 232, by.armor.name, 'end');
    if (by.suspension) notes += callout(ws + step, wheelY + H.wr, 70, 236, by.suspension.name);
    if (by.radio) notes += callout(tx + 14, ty - 20, 120, 50, by.radio.name);
    const content = '' +
      '<line class="eqd-bp-ground" x1="40" y1="' + (wheelY + H.wr + 6) + '" x2="540" y2="' + (wheelY + H.wr + 6) + '"/>' +
      '<g class="eqd-bp-dim"><path d="M' + left + ' 229 H' + right + ' M' + left + ' 224 v10 M' + right + ' 224 v10"/><text x="' + cx + '" y="242" text-anchor="middle">全長 ' + fmt(4.2 + num(hull.weight) * 0.06 + (G.len || 0) * 0.012, 1) + ' m · ' + H.note + '</text></g>' +
      '<g class="eqd-ink">' + hullPath + running + turret + gunSvg + '</g>' +
      armor + engine + radio + notes;
    return blueprintFrame('tank', hull.name, fmt(hull.baseSpeed, 0) + ' km/h · ' + fmt(hull.weight, 0) + ' t', content, 'eqd-svg-tank');
  }

  // ---------- 艦船 ----------
  const SHIP_HULLS = {
    dd: { len: 330, free: 44, deck: 160, sheer: 10, type: 'dd', note: 'DESTROYER' }, dd2: { len: 350, free: 46, deck: 158, sheer: 12, type: 'dd', note: 'DESTROYER MkII' },
    cl: { len: 400, free: 52, deck: 154, sheer: 12, type: 'cl', note: 'CRUISER' }, cl2: { len: 420, free: 54, deck: 152, sheer: 14, type: 'cl', note: 'CRUISER MkII' },
    bb: { len: 450, free: 60, deck: 150, sheer: 14, type: 'bb', note: 'BATTLESHIP' }, bb2: { len: 470, free: 62, deck: 148, sheer: 16, type: 'bb', note: 'BATTLESHIP MkII' },
    cv: { len: 460, free: 66, deck: 140, sheer: 6, type: 'cv', note: 'CARRIER' }, cv2: { len: 480, free: 68, deck: 138, sheer: 6, type: 'cv', note: 'CARRIER MkII' },
    ss: { len: 300, free: 26, deck: 170, sheer: 4, type: 'ss', note: 'SUBMARINE' }, ss2: { len: 330, free: 28, deck: 168, sheer: 4, type: 'ss', note: 'SUBMARINE MkII' }
  };
  function shipBlueprint(hull, modules) {
    const by = slotMap(modules);
    const H = SHIP_HULLS[hull.id] || SHIP_HULLS.dd;
    const cx = 286, left = cx - H.len / 2, right = cx + H.len / 2, deck = H.deck, water = 199, keel = deck + H.free;
    const sub = H.type === 'ss', cv = H.type === 'cv';
    // --- 船体 ---
    let body;
    if (sub) body = '<path d="M' + left + ' ' + (deck + 12) + ' Q' + (left + 20) + ' ' + deck + ' ' + (left + 60) + ' ' + deck + ' H' + (right - 40) + ' Q' + (right) + ' ' + (deck + 4) + ' ' + (right + 2) + ' ' + (deck + 14) + ' Q' + right + ' ' + keel + ' ' + (right - 40) + ' ' + keel + ' H' + (left + 40) + ' Q' + left + ' ' + keel + ' ' + left + ' ' + (deck + 12) + ' Z"/><path class="eqd-faint" stroke-dasharray="3 4" d="M' + (left + 10) + ' ' + (deck + 14) + ' H' + (right - 10) + '"/>';
    else body = '<path d="M' + left + ' ' + (deck + H.sheer) + ' L' + (left + 10) + ' ' + deck + ' H' + (right - 40) + ' L' + right + ' ' + (deck + H.sheer / 2) + ' L' + (right - 24) + ' ' + keel + ' Q' + (right - 60) + ' ' + (keel + 6) + ' ' + (right - 90) + ' ' + (keel + 6) + ' H' + (left + 50) + ' Q' + (left + 14) + ' ' + (keel + 2) + ' ' + (left + 6) + ' ' + (keel - 14) + ' Z"/><path d="M' + (left + 10) + ' ' + deck + ' H' + (right - 40) + '"/>' +
      '<path class="eqd-faint" d="M' + (left + 20) + ' ' + (deck + 16) + ' H' + (right - 46) + '"/>' + (H.type !== 'dd' ? '<path class="eqd-faint" d="M' + (left + 30) + ' ' + (deck + 28) + ' H' + (right - 60) + '"/>' : '');
    // --- 上部構造 ---
    let sup = '';
    const bx = cx - 30;
    if (cv) sup = '<path d="M' + (left + 30) + ' ' + deck + ' V' + (deck - 10) + ' H' + (right - 20) + ' V' + deck + '"/><path d="M' + (cx + 70) + ' ' + (deck - 10) + ' V' + (deck - 46) + ' H' + (cx + 110) + ' V' + (deck - 10) + ' M' + (cx + 80) + ' ' + (deck - 46) + ' V' + (deck - 60) + ' H' + (cx + 100) + ' V' + (deck - 46) + '"/>' +
      '<g class="eqd-accent">' + [0, 1, 2, 3].map(i => '<path d="M' + (left + 60 + i * 50) + ' ' + (deck - 12) + ' l10 -6 l10 6 M' + (left + 70 + i * 50) + ' ' + (deck - 18) + ' v-6"/>').join('') + '</g><text class="eqd-bp-note" x="' + (left + 60) + '" y="' + (deck - 24) + '">FLIGHT DECK</text>';
    else if (sub) sup = '<path d="M' + (cx - 26) + ' ' + deck + ' V' + (deck - 30) + ' H' + (cx + 26) + ' V' + deck + '"/><path d="M' + (cx + 6) + ' ' + (deck - 30) + ' V' + (deck - 52) + ' M' + (cx - 10) + ' ' + (deck - 30) + ' V' + (deck - 44) + '"/><path class="eqd-accent faint" d="M' + (cx - 60) + ' ' + (deck - 4) + ' H' + (cx - 30) + ' M' + (cx + 30) + ' ' + (deck - 4) + ' H' + (cx + 70) + '"/>';
    else {
      const levels = H.type === 'bb' ? 4 : H.type === 'cl' ? 3 : 2;
      let y = deck; for (let i = 0; i < levels; i++) { const w = 84 - i * 16, h = 14; sup += '<path d="M' + (bx + i * 8) + ' ' + y + ' V' + (y - h) + ' H' + (bx + i * 8 + w) + ' V' + y + '"/>'; y -= h; }
      sup += '<path d="M' + (bx + levels * 8 + 10) + ' ' + y + ' V' + (y - 20) + '"/>';
      if (hull.id.endsWith('2')) sup += '<path d="M' + (bx - 30) + ' ' + deck + ' V' + (deck - 12) + ' H' + bx + '"/>';
    }
    // --- 機関 (煙突) ---
    const eng = by.engine && by.engine.id; let funnel = '';
    if (!sub) {
      const fx = cv ? cx + 112 : bx + 100;
      if (eng === 'steam') funnel = '<g class="eqd-ink"><path d="M' + fx + ' ' + (deck - (cv ? 10 : 0)) + ' V' + (deck - 46) + ' l4 -6 h18 l4 6 V' + (deck - (cv ? 10 : 0)) + '"/><path d="M' + (fx + 36) + ' ' + (deck - (cv ? 10 : 0)) + ' V' + (deck - 42) + ' l4 -6 h16 l4 6 V' + (deck - (cv ? 10 : 0)) + '"/></g><path class="eqd-accent faint" d="M' + (fx + 13) + ' ' + (deck - 54) + ' q6 -8 0 -16 M' + (fx + 48) + ' ' + (deck - 50) + ' q6 -8 0 -16"/>';
      else if (eng === 'diesel') funnel = '<g class="eqd-ink"><path d="M' + fx + ' ' + (deck - (cv ? 10 : 0)) + ' V' + (deck - 38) + ' l10 -6 h14 V' + (deck - (cv ? 10 : 0)) + '"/></g><path class="eqd-accent faint" d="M' + (fx + 14) + ' ' + (deck - 46) + ' v-8"/><g class="eqd-accent"><rect x="' + (bx + 20) + '" y="' + (deck + 10) + '" width="40" height="' + Math.max(10, H.free - 20) + '" rx="2"/><path d="M' + (bx + 26) + ' ' + (deck + 14) + ' h28 M' + (bx + 26) + ' ' + (deck + 20) + ' h28"/></g>';
      else funnel = '<path class="eqd-faint" stroke-dasharray="4 4" d="M' + fx + ' ' + deck + ' V' + (deck - 40) + ' H' + (fx + 24) + ' V' + deck + '"/>';
    } else funnel = eng ? '<g class="eqd-accent"><rect x="' + (left + 40) + '" y="' + (deck + 8) + '" width="60" height="' + (H.free - 16) + '" rx="3"/>' + (eng === 'diesel' ? '<path d="M' + (left + 48) + ' ' + (deck + 12) + ' h44 M' + (left + 48) + ' ' + (deck + 18) + ' h44"/>' : '<circle cx="' + (left + 70) + '" cy="' + (deck + H.free / 2) + '" r="6"/>') + '</g>' : '';
    // --- 主砲 ---
    const gun = by.gun && by.gun.id; let guns = '';
    const turret = (x, size, barrels, blen) => '<path d="M' + (x - size) + ' ' + deck + ' h' + (size * 2) + ' l-' + (size * 0.35) + ' -' + (size * 0.9) + ' h-' + (size * 1.3) + ' z"/>' + Array.from({ length: barrels }, (_, i) => '<rect x="' + (x - size * 0.5 + i * (size * 1.1 / Math.max(1, barrels - 1)) * (barrels > 1 ? 1 : 0) - 1) + '" y="' + (deck - size * 0.9 - 6 - i * 0) + '" width="' + blen + '" height="4" rx="1.5" transform="rotate(-8 ' + x + ' ' + (deck - size * 0.9) + ')"/>').join('');
    if (!sub && !cv) {
      if (gun === 'lgun') guns = '<g class="eqd-ink">' + turret(right - 70, 22, 3, 46) + turret(right - 130, 22, 3, 46) + turret(left + 70, 22, 3, 46) + '</g>';
      else if (gun === 'ddgun') guns = '<g class="eqd-ink">' + turret(right - 60, 13, 1, 30) + turret(left + 60, 13, 1, 30) + (H.type !== 'dd' ? turret(left + 110, 13, 1, 30) : '') + '</g>';
      else if (gun === 'aa') guns = '<g class="eqd-ink">' + [right - 60, right - 100, left + 60, left + 100, cx + 60].map(x => '<path d="M' + (x - 6) + ' ' + deck + ' h12 l-3 -8 h-6 z M' + x + ' ' + (deck - 8) + ' l6 -14 M' + (x + 2) + ' ' + (deck - 8) + ' l6 -14"/>').join('') + '</g>';
      else if (gun === 'basic_gun') guns = '<g class="eqd-ink">' + turret(right - 60, 10, 1, 24) + turret(left + 60, 10, 1, 24) + '</g>';
    } else if (cv && gun) guns = '<g class="eqd-ink">' + [left + 44, right - 30].map(x => '<path d="M' + (x - 5) + ' ' + (deck - 10) + ' v-6 h10 v6 M' + x + ' ' + (deck - 16) + ' l4 -10"/>').join('') + '</g>';
    else if (sub && gun) guns = '<g class="eqd-ink"><path d="M' + (cx - 60) + ' ' + deck + ' v-8 h14 v8 M' + (cx - 53) + ' ' + (deck - 8) + ' l22 -6"/></g>';
    // --- 魚雷 ---
    const torp = by.torp && by.torp.id; let torps = '';
    const tubes = torp === 'tub' ? 3 : torp === 'tub2' ? 4 : torp === 'tub3' ? 4 : 0;
    if (tubes) {
      if (sub) torps = '<g class="eqd-accent">' + Array.from({ length: tubes }, (_, i) => '<rect x="' + (right - 60) + '" y="' + (deck + 10 + i * 7) + '" width="54" height="5" rx="2.5"/>').join('') + (torp === 'tub3' ? '<path d="M' + (right - 70) + ' ' + (deck + 10) + ' v' + (tubes * 7) + ' M' + (right - 74) + ' ' + (deck + 10) + ' v' + (tubes * 7) + '"/>' : '') + '</g>';
      else torps = '<g class="eqd-accent">' + Array.from({ length: tubes }, (_, i) => '<rect x="' + (cx + 20 + i * 3) + '" y="' + (deck - 12 + i * 3) + '" width="' + (torp === 'tub3' ? 56 : 44) + '" height="5" rx="2.5" transform="rotate(-6 ' + (cx + 40) + ' ' + (deck - 6) + ')"/>').join('') + '<path d="M' + (cx + 40) + ' ' + deck + ' v-8"/></g>';
    }
    // --- 装甲 ---
    const arm = by.armor && by.armor.id; let armor = '';
    if (arm === 'light') armor = '<path class="eqd-accent" d="M' + (left + 30) + ' ' + (water - 6) + ' H' + (right - 40) + '"/>';
    else if (arm === 'heavy') armor = '<g class="eqd-accent"><path d="M' + (left + 30) + ' ' + (water - 10) + ' H' + (right - 40) + ' M' + (left + 30) + ' ' + (water + 4) + ' H' + (right - 40) + '"/><path class="faint" d="' + Array.from({ length: 10 }, (_, i) => 'M' + (left + 40 + i * (H.len - 80) / 9) + ' ' + (water - 10) + ' v14 ').join('') + '"/></g>';
    // --- 電装 ---
    const radar = by.radar && by.radar.id; let mast = '';
    const mx = sub ? cx + 6 : cv ? cx + 90 : bx + 40, my = sub ? deck - 52 : cv ? deck - 60 : deck - (H.type === 'bb' ? 76 : H.type === 'cl' ? 62 : 48);
    if (radar === 'radar') mast = '<g class="eqd-accent"><path d="M' + mx + ' ' + my + ' v-22 M' + (mx - 12) + ' ' + (my - 22) + ' h24"/><path d="M' + (mx - 12) + ' ' + (my - 30) + ' q12 -10 24 0"/></g>';
    else if (radar === 'radar2') mast = '<g class="eqd-accent"><path d="M' + mx + ' ' + my + ' v-30 M' + (mx - 16) + ' ' + (my - 30) + ' h32 M' + (mx - 8) + ' ' + (my - 16) + ' h16"/><path d="M' + (mx - 16) + ' ' + (my - 38) + ' q16 -12 32 0 M' + (mx - 8) + ' ' + (my - 22) + ' q8 -6 16 0"/><circle cx="' + mx + '" cy="' + (my - 42) + '" r="2"/></g>';
    else mast = '<path class="eqd-ink" d="M' + mx + ' ' + my + ' v-14"/>';
    // --- 注釈 ---
    let notes = '';
    if (by.gun) notes += callout(sub ? cx - 53 : cv ? right - 30 : right - 70, deck - 12, 520, 64, by.gun.name, 'end');
    if (by.engine) notes += callout(sub ? left + 70 : (cv ? cx + 124 : bx + 112), sub ? deck + 14 : deck - 30, 90, 66, by.engine.name);
    if (by.torp && tubes) notes += callout(sub ? right - 30 : cx + 40, sub ? deck + 14 : deck - 10, 470, 110, by.torp.name);
    if (by.armor) notes += callout(cx, water - 8, 500, 236, by.armor.name, 'end');
    if (by.radar) notes += callout(mx, my - 24, 60, 50, by.radar.name);
    const content = '' +
      '<line class="eqd-bp-ground" x1="40" y1="' + water + '" x2="530" y2="' + water + '"/>' +
      '<g class="eqd-bp-dim"><path d="M' + left + ' 232 H' + right + ' M' + left + ' 227 v10 M' + right + ' 227 v10"/><text x="' + cx + '" y="245" text-anchor="middle">全長 ' + fmt(60 + num(hull.weight) * 2.2, 0) + ' m · ' + H.note + '</text></g>' +
      '<g class="eqd-ink">' + body + sup + '</g>' + funnel + guns + torps + armor + mast + notes;
    return blueprintFrame('ship', hull.name, fmt(hull.baseSpeed, 0) + ' kn · ' + fmt(hull.weight, 0) + ' t', content, 'eqd-svg-ship');
  }

  // ---------- 航空機 ----------
  const PLANE_HULLS = {
    fighter:   { span: 62, len: 300, engines: 1, canopy: 'razor', tail: 'single', gear: false, note: 'FIGHTER' },
    fighter2:  { span: 66, len: 310, engines: 1, canopy: 'bubble', tail: 'single', gear: false, note: 'FIGHTER MkII' },
    fighter3:  { span: 68, len: 330, engines: 1, canopy: 'bubble', tail: 'single', gear: false, note: 'ADV. FIGHTER', swept: true },
    cas:       { span: 74, len: 320, engines: 1, canopy: 'long', tail: 'single', gear: true, gull: true, note: 'CAS' },
    bomber:    { span: 90, len: 350, engines: 2, canopy: 'glass', tail: 'twin', gear: false, note: 'TAC. BOMBER' },
    strategic: { span: 110, len: 390, engines: 4, canopy: 'glass', tail: 'single', gear: false, note: 'STRAT. BOMBER' },
    naval:     { span: 80, len: 330, engines: 1, canopy: 'long', tail: 'single', gear: false, fold: true, hook: true, note: 'CARRIER ATTACK' }
  };
  function planeBlueprint(hull, modules) {
    const by = slotMap(modules);
    const H = PLANE_HULLS[hull.id] || PLANE_HULLS.fighter;
    const cy = 130, nose = 296 + H.len / 2, tail = 296 - H.len / 2, fw = H.engines >= 2 ? 10 : 8;
    const wingRoot = nose - H.len * 0.52, wingTip = wingRoot + (H.swept ? 60 : 40), chordRoot = H.engines >= 4 ? 52 : H.engines === 2 ? 44 : 34, chordTip = chordRoot * 0.55;
    const top = cy - H.span, bottom = cy + H.span;
    // --- 機体 ---
    let body = '<path d="M' + tail + ' ' + (cy - 4) + ' Q' + (tail + 60) + ' ' + (cy - fw) + ' ' + (nose - 40) + ' ' + (cy - fw - 2) + ' Q' + nose + ' ' + (cy - fw / 2) + ' ' + nose + ' ' + cy + ' Q' + nose + ' ' + (cy + fw / 2) + ' ' + (nose - 40) + ' ' + (cy + fw + 2) + ' Q' + (tail + 60) + ' ' + (cy + fw) + ' ' + tail + ' ' + (cy + 4) + ' Z"/>';
    // 主翼 (上下対称)
    const wing = (s) => '<path d="M' + wingRoot + ' ' + (cy + s * fw) + ' L' + (wingTip + (H.gull ? 10 : 0)) + ' ' + (cy + s * H.span) + ' L' + (wingTip + chordTip + (H.gull ? 10 : 0)) + ' ' + (cy + s * H.span) + ' Q' + (wingRoot + chordRoot + 6) + ' ' + (cy + s * (H.span * 0.5)) + ' ' + (wingRoot + chordRoot) + ' ' + (cy + s * fw) + ' Z"/>' +
      (H.gull ? '<path class="eqd-faint" d="M' + (wingRoot + 6) + ' ' + (cy + s * (fw + 14)) + ' L' + (wingRoot + chordRoot - 4) + ' ' + (cy + s * (fw + 14)) + '"/>' : '') +
      (H.fold ? '<path class="eqd-accent" stroke-dasharray="3 3" d="M' + (wingRoot + 14) + ' ' + (cy + s * (H.span * 0.55)) + ' L' + (wingRoot + chordRoot + 2) + ' ' + (cy + s * (H.span * 0.55)) + '"/>' : '');
    body += wing(-1) + wing(1);
    // 尾翼
    const tailSpan = H.span * 0.38;
    if (H.tail === 'twin') body += '<path d="M' + (tail + 2) + ' ' + (cy - 4) + ' L' + (tail + 22) + ' ' + (cy - tailSpan) + ' L' + (tail + 44) + ' ' + (cy - tailSpan) + ' L' + (tail + 40) + ' ' + (cy - fw) + ' Z M' + (tail + 2) + ' ' + (cy + 4) + ' L' + (tail + 22) + ' ' + (cy + tailSpan) + ' L' + (tail + 44) + ' ' + (cy + tailSpan) + ' L' + (tail + 40) + ' ' + (cy + fw) + ' Z"/><rect x="' + (tail + 18) + '" y="' + (cy - tailSpan - 4) + '" width="8" height="8" rx="1"/><rect x="' + (tail + 18) + '" y="' + (cy + tailSpan - 4) + '" width="8" height="8" rx="1"/>';
    else body += '<path d="M' + (tail + 2) + ' ' + (cy - 4) + ' L' + (tail + 14) + ' ' + (cy - tailSpan) + ' L' + (tail + 40) + ' ' + (cy - tailSpan) + ' L' + (tail + 44) + ' ' + (cy - fw) + ' Z M' + (tail + 2) + ' ' + (cy + 4) + ' L' + (tail + 14) + ' ' + (cy + tailSpan) + ' L' + (tail + 40) + ' ' + (cy + tailSpan) + ' L' + (tail + 44) + ' ' + (cy + fw) + ' Z"/><path d="M' + (tail + 8) + ' ' + (cy - 3) + ' H' + (tail + 40) + ' M' + (tail + 8) + ' ' + (cy + 3) + ' H' + (tail + 40) + '"/>';
    if (H.hook) body += '<path class="eqd-accent" d="M' + (tail + 30) + ' ' + cy + ' h-22 l-4 4"/>';
    // 風防
    const ccx = H.engines >= 2 ? nose - 30 : wingRoot + chordRoot + 10;
    if (H.canopy === 'bubble') body += '<ellipse cx="' + ccx + '" cy="' + cy + '" rx="20" ry="' + (fw - 1) + '"/>';
    else if (H.canopy === 'razor') body += '<path d="M' + (ccx - 16) + ' ' + (cy - fw + 2) + ' H' + (ccx + 16) + ' M' + (ccx - 16) + ' ' + (cy + fw - 2) + ' H' + (ccx + 16) + ' M' + (ccx - 12) + ' ' + (cy - fw + 2) + ' V' + (cy + fw - 2) + '"/>';
    else if (H.canopy === 'long') body += '<rect x="' + (ccx - 26) + '" y="' + (cy - fw + 2) + '" width="52" height="' + (fw * 2 - 4) + '" rx="4"/><path d="M' + (ccx - 10) + ' ' + (cy - fw + 2) + ' V' + (cy + fw - 2) + ' M' + (ccx + 6) + ' ' + (cy - fw + 2) + ' V' + (cy + fw - 2) + '"/>';
    else body += '<path d="M' + (nose - 36) + ' ' + (cy - fw) + ' Q' + (nose - 6) + ' ' + (cy - 4) + ' ' + (nose - 6) + ' ' + cy + ' Q' + (nose - 6) + ' ' + (cy + 4) + ' ' + (nose - 36) + ' ' + (cy + fw) + '"/><path d="M' + (nose - 30) + ' ' + (cy - fw + 2) + ' V' + (cy + fw - 2) + ' M' + (nose - 20) + ' ' + (cy - fw + 3) + ' V' + (cy + fw - 3) + '"/><rect x="' + (wingRoot + chordRoot + 8) + '" y="' + (cy - fw + 2) + '" width="22" height="' + (fw * 2 - 4) + '" rx="3"/>';
    if (H.gear) body += '<path class="eqd-accent" d="M' + (wingRoot + 10) + ' ' + (cy - 22) + ' l-10 -6 M' + (wingRoot + 10) + ' ' + (cy + 22) + ' l-10 6"/><circle class="eqd-accent" cx="' + (wingRoot - 2) + '" cy="' + (cy - 30) + '" r="4"/><circle class="eqd-accent" cx="' + (wingRoot - 2) + '" cy="' + (cy + 30) + '" r="4"/>';
    // --- エンジン ---
    const eng = by.engine && by.engine.id;
    const prop = eng === 'e3' ? 20 : eng === 'e2' ? 16 : eng === 'e1' ? 13 : 10;
    const engineAt = (x, y, nacelle) => {
      let g = '';
      if (nacelle) g += '<rect x="' + (x - 44) + '" y="' + (y - 7) + '" width="46" height="14" rx="6"/>';
      if (eng === 'e3') g += '<rect x="' + (x - 10) + '" y="' + (y - 9) + '" width="12" height="18" rx="3"/><path class="eqd-accent" d="M' + (x - 24) + ' ' + (y - 11) + ' h14 v-4 h-14 z"/>';
      else if (eng === 'e2') g += '<rect x="' + (x - 10) + '" y="' + (y - 9) + '" width="12" height="18" rx="4"/><path class="eqd-accent" d="M' + (x - 8) + ' ' + (y - 5) + ' h6 M' + (x - 8) + ' ' + y + ' h6 M' + (x - 8) + ' ' + (y + 5) + ' h6"/>';
      else if (eng === 'e1') g += '<rect x="' + (x - 10) + '" y="' + (y - 7) + '" width="12" height="14" rx="4"/>';
      else g += '<rect class="eqd-faint" stroke-dasharray="3 3" x="' + (x - 10) + '" y="' + (y - 7) + '" width="12" height="14" rx="4"/>';
      g += '<path d="M' + (x + 2) + ' ' + y + ' h6"/><path d="M' + (x + 8) + ' ' + (y - prop) + ' v' + (prop * 2) + '"/><circle cx="' + (x + 8) + '" cy="' + y + '" r="3"/>';
      if (eng === 'e3') g += '<path d="M' + (x + 8) + ' ' + (y - prop) + ' l-4 ' + prop + ' l4 ' + prop + ' l4 -' + prop + ' z" class="eqd-faint"/>';
      return g;
    };
    let engines = '';
    if (H.engines === 1) engines = engineAt(nose - 6, cy, false);
    else { const ys = H.engines === 2 ? [-0.42, 0.42] : [-0.72, -0.38, 0.38, 0.72]; ys.forEach(k => { engines += engineAt(wingRoot + chordRoot + 10, cy + k * H.span, true); }); }
    // --- 武装 ---
    const wep = by.weapon && by.weapon.id; let weapons = '';
    const gx = wingRoot + chordRoot;
    if (wep === 'mg_basic') weapons = '<g class="eqd-accent"><path d="M' + gx + ' ' + (cy - 20) + ' h16 M' + gx + ' ' + (cy + 20) + ' h16"/></g>';
    else if (wep === 'mg') weapons = '<g class="eqd-accent"><path d="' + [-34, -26, -18, 18, 26, 34].map(d => 'M' + gx + ' ' + (cy + d) + ' h20 ').join('') + '"/></g>';
    else if (wep === 'cannon') weapons = '<g class="eqd-accent"><rect x="' + gx + '" y="' + (cy - 30) + '" width="30" height="4" rx="2"/><rect x="' + gx + '" y="' + (cy + 26) + '" width="30" height="4" rx="2"/><path d="M' + (gx + 30) + ' ' + (cy - 30) + ' h8 M' + (gx + 30) + ' ' + (cy + 30) + ' h8 M' + (nose - 4) + ' ' + cy + ' h22"/></g>';
    else if (wep === 'bomb') weapons = '<g class="eqd-accent">' + [-0.5, 0.5].map(k => '<ellipse cx="' + (wingRoot + 16) + '" cy="' + (cy + k * H.span) + '" rx="7" ry="15"/><path d="M' + (wingRoot + 16) + ' ' + (cy + k * H.span - 15) + ' l-4 -5 h8 z"/>').join('') + '</g>';
    else if (wep === 'heavy_bomb') weapons = '<g class="eqd-accent">' + [-0.45, 0.45].map(k => '<ellipse cx="' + (wingRoot + 18) + '" cy="' + (cy + k * H.span) + '" rx="10" ry="22"/><path d="M' + (wingRoot + 18) + ' ' + (cy + k * H.span - 22) + ' l-5 -6 h10 z"/>').join('') + '<ellipse cx="' + (wingRoot + 4) + '" cy="' + cy + '" rx="9" ry="20"/></g>';
    else if (wep === 'torpedo') weapons = '<g class="eqd-accent"><rect x="' + (wingRoot - 30) + '" y="' + (cy - 6) + '" width="90" height="12" rx="6"/><path d="M' + (wingRoot - 30) + ' ' + (cy - 10) + ' v20 M' + (wingRoot - 24) + ' ' + (cy - 12) + ' v24"/></g>';
    // --- 燃料 / 防弾 ---
    const fuel = by.fuel && by.fuel.id; let extra = '';
    if (fuel === 'drop_tank') extra = '<g class="eqd-accent">' + [-0.6, 0.6].map(k => '<ellipse cx="' + (wingRoot + 20) + '" cy="' + (cy + k * H.span) + '" rx="8" ry="20"/><path d="M' + (wingRoot + 20) + ' ' + (cy + k * H.span - 20) + ' v-6"/>').join('') + '</g>';
    else if (fuel === 'plate') extra = '<g class="eqd-accent faint"><path d="M' + (ccx - 24) + ' ' + (cy - fw - 4) + ' h48 M' + (ccx - 24) + ' ' + (cy + fw + 4) + ' h48"/><path d="' + Array.from({ length: 6 }, (_, i) => 'M' + (ccx - 20 + i * 8) + ' ' + (cy - fw - 4) + ' l4 -4 ').join('') + '"/></g>';
    // --- 注釈 ---
    let notes = '';
    if (by.engine) notes += callout(H.engines === 1 ? nose - 4 : wingRoot + chordRoot + 10, H.engines === 1 ? cy - 8 : cy - H.span * 0.42, 500, 58, by.engine.name, 'end');
    if (by.weapon) notes += callout(wep === 'torpedo' ? wingRoot + 10 : gx + 10, wep === 'torpedo' ? cy : cy + 26, 470, 218, by.weapon.name, 'end');
    if (by.fuel && fuel !== 'none') notes += callout(fuel === 'drop_tank' ? wingRoot + 20 : ccx, fuel === 'drop_tank' ? cy - H.span * 0.6 : cy - fw - 4, 80, 58, by.fuel.name);
    notes += callout(tail + 30, cy - tailSpan + 4, 70, 212, H.note + ' AIRFRAME');
    const content = '' +
      '<line class="eqd-bp-ground" x1="60" y1="' + cy + '" x2="520" y2="' + cy + '" stroke-dasharray="4 7"/>' +
      '<g class="eqd-bp-dim"><path d="M540 ' + top + ' V' + bottom + ' M535 ' + top + ' h10 M535 ' + bottom + ' h10"/><text x="548" y="' + cy + '" text-anchor="middle" transform="rotate(90 548 ' + cy + ')">全幅 ' + fmt(7 + H.span * 0.14, 1) + ' m</text></g>' +
      '<g class="eqd-bp-dim"><path d="M' + tail + ' 244 H' + nose + ' M' + tail + ' 239 v10 M' + nose + ' 239 v10"/><text x="' + (tail + nose) / 2 + '" y="257" text-anchor="middle">全長 ' + fmt(5 + H.len * 0.034, 1) + ' m · ' + H.engines + ' ENGINE</text></g>' +
      '<g class="eqd-ink">' + body + engines + '</g>' + weapons + extra + notes;
    return blueprintFrame('plane', hull.name, fmt(hull.baseSpeed, 0) + ' km/h · ' + fmt(hull.weight, 0) + ' t', content, 'eqd-svg-plane');
  }

  function blueprintSvg(cat, hull, modules) {
    if (cat === 'ship') return shipBlueprint(hull, modules);
    if (cat === 'plane') return planeBlueprint(hull, modules);
    return tankBlueprint(hull, modules);
  }
  Designer.blueprintSvg = blueprintSvg;

  // ----------------------------------------------------------
  // プレビュー: 車体・モジュールにマウスを乗せた時点で設計図を差し替える
  // ----------------------------------------------------------
  Designer.previewSvg = function (cat, hullId, overrides) {
    cat = cat || this.category;
    const draft = this.ensureDraft(cat);
    const hull = chassisById(cat, hullId || draft.hull);
    if (!hull) return '';
    const merged = { modules: Object.assign({}, draft.modules || {}, overrides || {}) };
    return blueprintSvg(cat, hull, selectedModules(cat, merged));
  };

  Designer.setBlueprintPreview = function (svg, label) {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('designer-content');
    const box = host && host.querySelector('.eqd-blueprint');
    if (!box) return;
    const current = box.querySelector('svg');
    if (svg) {
      if (!box._eqdOriginal) box._eqdOriginal = current ? current.outerHTML : '';
      if (current) current.outerHTML = svg;
      else box.insertAdjacentHTML('afterbegin', svg);
      if (box.classList) box.classList.add('previewing');
      let tag = box.querySelector('.eqd-bp-preview-tag');
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'eqd-bp-preview-tag';
        box.appendChild(tag);
      }
      tag.textContent = 'プレビュー: ' + (label || '');
    } else {
      if (box._eqdOriginal != null) {
        if (current) current.outerHTML = box._eqdOriginal;
        box._eqdOriginal = null;
      }
      if (box.classList) box.classList.remove('previewing');
      const tag = box.querySelector('.eqd-bp-preview-tag');
      if (tag) tag.remove();
    }
  };

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
      rootEl.addEventListener('mouseover', (event) => {
        const chassisButton = event.target.closest && event.target.closest('[data-eqd-chassis]');
        if (!chassisButton) return;
        const hullId = chassisButton.getAttribute('data-eqd-chassis');
        const draft = this.ensureDraft(this.category);
        if (hullId === draft.hull) { this.setBlueprintPreview(null); return; }
        const hull = chassisById(this.category, hullId);
        this.setBlueprintPreview(this.previewSvg(this.category, hullId), hull ? hull.name : hullId);
      });
      rootEl.addEventListener('mouseout', (event) => {
        const chassisButton = event.target.closest && event.target.closest('[data-eqd-chassis]');
        if (!chassisButton) return;
        const to = event.relatedTarget;
        if (to && to.closest && to.closest('[data-eqd-chassis]') === chassisButton) return;
        this.setBlueprintPreview(null);
      });
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
