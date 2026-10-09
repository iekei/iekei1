/** state.js — ゲーム状態（資源・生産・研究進捗・設計・外交など全般） */

import { Bus, uid } from './util.js';
import { NATIONS, MAJORS } from './data/nations.js';
import { EQUIPMENT_ITEMS } from './data/equipment.js';

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
    this.doctrine = { xp: { land: 0, naval: 0, air: 0 }, unlocked: { land: new Set(), naval: new Set(), air: new Set() }, assigned: { land: null, naval: null, air: null } };

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

    // ユニット数（概算）
    this.units = { army: 96, navy: 62, air: 1200 };
  }

  get nation() { return NATIONS[this.playerTag]; }

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
