/** state.js — ゲーム状態（資源・生産・研究進捗・設計・外交など全般） */

import { Bus, uid } from './util.js';
import { NATIONS, MAJORS } from './data/nations.js';
import { EQUIPMENT_ITEMS } from './data/equipment.js';
import { PROVINCES } from './map-data.js';

const DAY_HOURS = 24;

export class GameState {
  constructor() {
    this.bus = new Bus();
    this.playerTag = 'GER';
    this.date = { y: 1936, m: 1, d: 1, h: 0 };
    this.tickCount = 0; // 1 tick = 1 時間
    this.speed = 1;
    this.paused = false;

    const nat = NATIONS[this.playerTag];
    const s = nat.start;
    this.pp = s.pp;                       // 政治力
    this.stability = s.stability;         // 安定度 %
    this.warSupport = s.warSupport;       // 戦争協力度 %
    this.manpower = s.manpower;           // 徴兵可能人口
    this.factories = { civ: s.civ, mil: s.mil, dock: s.dock };
    this.convoys = { used: Math.round(s.convoys * 0.2), total: s.convoys };
    this.commandPower = s.cp;
    this.nukes = s.nukes;
    this.xp = { ...s.xp };

    // 資源備蓄
    this.stockpile = {
      oil: 30000, rubber: 2000, steel: 40000, aluminum: 8000, tungsten: 6000, chromium: 4000,
      // 装備備蓄
      ...Object.fromEntries(Object.keys(EQUIPMENT_ITEMS).map((k) => [k, k.includes('equipment') || k.includes('gun') || k.includes('artillery') || k.includes('tank') || k.includes('bomber') || k.includes('fighter') || k.includes('destroyer') || k.includes('submarine') || k.includes('cruiser') || k.includes('battleship') || k.includes('carrier') || k.includes('train') ? 500 : 0])),
    };
    this.fuel = { stock: 8000, max: 50000 };

    // 研究（国家別進捗は research マネージャが保持。プレイヤー分のショートカット）
    this.research = { slots: 2, active: [null, null] }; // active[i] = {techId, progressDays, mioId}
    this.researched = new Set();

    // 生産ライン
    this.productionLines = [
      { id: uid('line'), item: 'infantry_equipment_1', factories: 15, efficiency: 0.10, mioId: null, kind: 'mil' },
      { id: uid('line'), item: 'artillery1', factories: 5, efficiency: 0.10, mioId: null, kind: 'mil' },
      { id: uid('line'), item: 'light_tank_equipment_1', factories: 8, efficiency: 0.10, mioId: null, kind: 'mil' },
      { id: uid('line'), item: 'fighter_equipment_1', factories: 12, efficiency: 0.10, mioId: null, kind: 'mil' },
      { id: uid('line'), item: 'destroyer_equipment_1', factories: 5, efficiency: 0.10, mioId: null, kind: 'dock' },
      { id: uid('line'), item: 'submarine_equipment_1', factories: 3, efficiency: 0.10, mioId: null, kind: 'dock' },
    ];
    this.shipProgress = {}; // lineId -> 建造中の艦の累積IC

    // 貿易:輸入量（資源8単位ごとに民需工場1つ貸出）
    this.trade = { imports: { oil: 8, rubber: 8, steel: 0, aluminum: 0, tungsten: 0, chromium: 0 } };

    // 建設キュー
    this.constructionQueue = []; // {id, type, state, progress, costDays}

    //師団テンプレート / 装備設計
    this.divisionTemplates = [];
    this.equipmentDesigns = { tank: [], naval: [], air: [] };

    // 指揮官カード配属（陸/海/空）
    this.commanders = { army: null, navy: null, air: null };
    this.cardCollection = [];

    // MIO
    this.mios = {}; // mioId -> {level, xp, traits:[], assignment:{type,ref}|null}

    // ドクトリン
    this.doctrine = {
      // XP は state.xp（army/navy/air）が正。ここは旧参照用のミラー。
      xp: { land: this.xp.army, naval: this.xp.navy, air: this.xp.air },
      unlocked: { land: new Set(), naval: new Set(), air: new Set() },
      assigned: { land: null, naval: null, air: null },
      route: { land: null, naval: null, air: null }, // 相互排他ルート（不可逆）
    };

    // 諜報
    this.intel = { operatives: [], slots: 2, intelValue: {} }; // intelValue[targetTag] = value

    // 外交
    this.diplomacy = { relations: {}, wars: new Set(), guarantees: new Set(), factions: [] };
    for (const tag of MAJORS) {
      if (tag === this.playerTag) continue;
      this.diplomacy.relations[tag] = tag === 'ENG' || tag === 'FRA' || tag === 'USA' ? 40 : tag === 'ITA' ? 70 : 10;
    }

    // 政治
    this.politics = {
      ideologySupport: { ...nat.ideologySupport },
      laws: { conscription: 'volunteer', economy: 'civilian' },
      ministers: [],
      spirits: nat.spirits.map((s) => ({ ...s })),
    };

    // 占領地・傀儡国（サンプル: オーストリア併合後のチェコスロバキア占領などを想定）
    this.occupations = [
      { tag: 'CZE', kind: 'occupied', compliance: 62, factories: 18, sinceDays: 120 },
      { tag: 'POL', kind: 'occupied', compliance: 35, factories: 12, sinceDays: 30 },
      { tag: 'HUN', kind: 'puppet', compliance: 80, factories: 8, sinceDays: 200 },
    ];

    // 戦争
    this.atWarWith = new Set();
    // 戦争目標（正当化中 / 完成）
    this.warGoals = {}; // tag -> { justified: boolean, at: string, wargoalType: string }
    // 陣営
    this.faction = null; // 'axis' | 'allies' | 'comintern' | null
    this.factions = {
      axis: { leader: 'GER', members: ['GER', 'ITA'], name: '枢軸国' },
      allies: { leader: 'ENG', members: ['ENG', 'FRA', 'USA'], name: '連合国' },
      comintern: { leader: 'SOV', members: ['SOV'], name: 'コミンテルン' },
    };
    this.worldTension = 0; // 世界緊張度 0..100

    // 空軍・海軍部隊（マップ展開用）
    this.airForces = [];   // {id, baseProvince, type:'fighter'|'cas'|'strategic_bomber'|'transport', count, region, mission}
    this.navalForces = []; // {id, region, type:'fleet'|'task_force'|'convoy', ships:[], mission:'patrol'|'strike'|'escort'|'raiding'}

    // 陸上戦闘表示用
    this.frontlines = [];     // [{provinceId, side:'attacker'|'defender'}]
    this.offensiveLines = []; // [{fromProvince, toProvince}]
    // 作戦計画（前線 / 攻撃線 / 計画準備ボーナス）。BattlePlanManager が管理
    this.battlePlans = [];
    // 研究ボーナス（国家方針の completion_reward などで付与。研究日数を短縮）
    this.researchBonuses = [];
    this.combatBubbles = [];  // [{id, province, attacker, defender, advantage:'green'|'yellow'|'red', hp}]
    this.paratrooperRoutes = []; // [{id, from, to, transportCount, airSupremacyOk}]
    this.navalInvasionRoutes = []; // [{id, fromPort, toProvince, navalSupremacyOk}]

    // 核開発状態
    this.nuclearResearched = false;

    // マップ上の師団配置
    this.divisions = []; // {id, provinceId, type:'infantry'|'armor'|'artillery'|'paratrooper'|'marine', name, org, hp, maxOrg, maxHp, supply:0-1, command:0-1, templateId}

    // 国家方針（National Focus）
    this.focus = {
      active: null,        // {focusId, tag, progressDays, startDate}
      progress: {},        // tag -> { focusId -> progressDays }
      completed: {},       // tag -> Set<focusId>
    };

    // 講和・戦勝点
    this.warScore = {};    // tag -> 戦勝点
    this.surrendered = new Set(); // 降伏国タグ

    // ユニット数（概算）
    this.units = { army: 96, navy: 62, air: 1200 };
  }

  get nation() { return NATIONS[this.playerTag]; }

  /* ================= 国家的精神・補正 ================= */

  /**
   * 国家的精神（ideas / country spirits）の modifiers を合算して返す。
   * 例: spirits: [{ id, name, desc, modifiers: { org: 0.05, researchBonus: 0.03 } }]
   */
  getModifier(key) {
    let sum = 0;
    for (const spirit of this.politics?.spirits || []) {
      const v = spirit?.modifiers?.[key];
      if (Number.isFinite(v)) sum += v;
    }
    return sum;
  }

  /* ================= 研究ボーナス ================= */

  /**
   * 研究時間短縮ボーナスを追加する。
   * @param {{scope:'tech'|'category'|'any', match?:string, reduction:number, uses?:number, label?:string}} bonus
   */
  addResearchBonus(bonus) {
    const entry = {
      id: `rb-${this.researchBonuses.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      scope: bonus.scope || 'any',
      match: bonus.match || null,
      reduction: Math.max(0, Math.min(0.95, Number(bonus.reduction) || 0)),
      uses: Number.isFinite(bonus.uses) ? bonus.uses : 1,
      label: bonus.label || '研究ボーナス',
      grantedAt: this.dateLabel,
    };
    this.researchBonuses.push(entry);
    this.bus.emit('research-bonus-added', entry);
    return entry;
  }

  /** 指定技術に適用できる研究ボーナス（未使用のもの）を探す */
  findResearchBonus(techId, category) {
    return this.researchBonuses.find((b) => {
      if (b.uses <= 0) return false;
      if (b.scope === 'tech') return b.match === techId;
      if (b.scope === 'category') return b.match === category;
      return true;
    }) || null;
  }

  /** ボーナスを使用済みにする（研究完了時に呼ぶ） */
  consumeResearchBonus(bonusId) {
    const b = this.researchBonuses.find((x) => x.id === bonusId);
    if (!b) return false;
    b.uses -= 1;
    return true;
  }

  /* ================= 師団の初期配置 ================= */

  /**
   * 指定国の師団を初期配置する（作戦計画・前線のデモ用）。
   * 既にその国の師団が存在する場合は何もしない。
   */
  ensureDivisions(tag = this.playerTag, count = 8) {
    const has = (this.divisions || []).some((d) => (d.tag || tag) === tag);
    if (has) return this.divisions;
    const owned = PROVINCES.filter((p) => p.tag === tag);
    const pool = owned.length ? owned : PROVINCES.filter((p) => p.tag === 'GER');
    if (!pool.length) return this.divisions;
    const types = ['infantry', 'infantry', 'armor', 'infantry', 'artillery', 'armor', 'infantry', 'infantry'];
    const names = { infantry: '歩兵師団', armor: '装甲師団', artillery: '砲兵師団' };
    for (let i = 0; i < count; i++) {
      const p = pool[Math.floor((i * pool.length) / count)] || pool[0];
      const type = types[i % types.length];
      this.divisions.push({
        id: `div-${tag}-${i + 1}`,
        provinceId: p.id,
        tag,
        type,
        name: `${names[type]} ${i + 1}`,
        org: 50, hp: 90, maxOrg: 50, maxHp: 100,
        supply: 0.9, command: 0.85,
      });
    }
    this.bus.emit('division-added', { tag });
    return this.divisions;
  }

  /** 日付をフォーマット */
  get dateLabel() {
    const p = (n) => String(n).padStart(2, '0');
    return `${this.date.y}年${p(this.date.m)}月${p(this.date.d)}日 ${p(this.date.h)}:00`;
  }

  get year() { return this.date.y; }

  /** 1 Tick（1時間）進める */
  advanceHour() {
    this.date.h += 1;
    if (this.date.h >= DAY_HOURS) {
      this.date.h = 0;
      this.date.d += 1;
      this.tickCount += 1;
      const dim = [31, (this.date.y % 4 === 0 ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][this.date.m - 1];
      if (this.date.d > dim) { this.date.d = 1; this.date.m += 1; }
      if (this.date.m > 12) { this.date.m = 1; this.date.y += 1; }
    } else {
      this.tickCount += 1;
    }
    this.bus.emit('hour', this);
  }

  /** 資源変更（通知付き） */
  addStockpile(key, amount) {
    this.stockpile[key] = Math.max(0, (this.stockpile[key] || 0) + amount);
    this.bus.emit('stockpile', { key, amount });
  }

  getEquipmentFulfillment(requiredEquipment = {}) {
    let req = 0, have = 0;
    for (const [k, v] of Object.entries(requiredEquipment)) { req += v; have += Math.min(this.stockpile[k] || 0, v); }
    return req > 0 ? have / req : 1;
  }

  /**師団テンプレートから必要装備量を集計 */
  requiredEquipment() {
    const req = {};
    for (const t of this.divisionTemplates) {
      for (const [k, v] of Object.entries(t.equipment || {})) req[k] = (req[k] || 0) + v * (t.count || 0);
    }
    return req;
  }

  changePlayer(tag) {
    if (!NATIONS[tag]) return;
    this.playerTag = tag;
    const nat = NATIONS[tag];
    this.politics.ideologySupport = { ...nat.ideologySupport };
    this.politics.spirits = nat.spirits.map((s) => ({ ...s }));
    this.bus.emit('player-changed', tag);
  }
}
