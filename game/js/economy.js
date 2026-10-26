/**
 * economy.js — 経済マネージャ（生産・貿易・燃料・建設）
 *
 * - 生産ライン: 工場割り当て [-/+], 生産効率（初期10%から時間経過で成長）
 * - 装備変更時の効率ペナルティ（効率を40%に低下）
 * - MIOアサインによる生産効率バフ
 * - 造船所ライン: 1隻ごとの建造進捗（%）
 * - 貿易: 資源8単位につき民需工場1つを貸出。資源不足時は減速ペナルティ
 * - 建設キュー（民需/軍需工場・造船所・インフラ等）
 */

import { I18N } from './i18n.js';
import { uid, clamp } from './util.js';
import { EQUIPMENT_ITEMS } from './data/equipment.js';
import { RESOURCES } from './data/nations.js';

const DAY_HOURS = 24;

export class EconomyManager {
  constructor(state, mio) {
    this.state = state;
    this.mio = mio;
  }

  /* ================= 生産ライン ================= */

  lines() { return this.state.productionLines; }

  addLine(item, kind = 'mil', factories = 1) {
    const line = { id: uid('line'), item, factories, efficiency: 0.10, mioId: null, kind };
    this.state.productionLines.push(line);
    this.state.shipProgress[line.id] = 0;
    return line;
  }

  removeLine(id) {
    this.state.productionLines = this.state.productionLines.filter((l) => l.id !== id);
    delete this.state.shipProgress[id];
  }

  setFactories(id, n) {
    const line = this.state.productionLines.find((l) => l.id === id);
    if (!line) return;
    const pool = line.kind === 'dock' ? this.state.factories.dock : this.state.factories.mil;
    const usedByOthers = this.state.productionLines.filter((l) => l.id !== id && l.kind === line.kind).reduce((s, l) => s + l.factories, 0);
    line.factories = clamp(Math.round(n), 0, Math.max(0, pool - usedByOthers));
  }

  /** 装備変更（効率ペナルティ: 現在効率の40%に低下） */
  changeEquipment(id, item) {
    const line = this.state.productionLines.find((l) => l.id === id);
    if (!line || line.item === item) return;
    line.item = item;
    line.efficiency = Math.min(line.efficiency, 0.4) * 0.4 + 0.04; // 上限40%×40%+基本4%
    delete this.state.shipProgress[id];
    this.state.shipProgress[id] = 0;
    this.state.bus.emit('line-changed', { id, item });
  }

  assignMio(lineId, mioId) {
    const line = this.state.productionLines.find((l) => l.id === lineId);
    if (line) line.mioId = mioId;
  }

  totalMilFactories() { return this.state.factories.mil; }
  totalDockyards() { return this.state.factories.dock; }
  usedMilFactories() { return this.state.productionLines.filter((l) => l.kind === 'mil').reduce((s, l) => s + l.factories, 0); }
  usedDockyards() { return this.state.productionLines.filter((l) => l.kind === 'dock').reduce((s, l) => s + l.factories, 0); }

  /* ================= 貿易 ================= */

  /** 貸出中の民需工場数（資源8単位ごとに1つ） */
  lentCivilianFactories() {
    return RESOURCES.reduce((s, r) => s + Math.floor((this.state.trade.imports[r.id] || 0) / 8), 0);
  }

  availableCivilianFactories() {
    return Math.max(0, this.state.factories.civ - this.lentCivilianFactories() - this.constructionCivUsage());
  }

  /** 建設に従事している民需工場数（全建設プロジェクトで 1 つずつ使用） */
  constructionCivUsage() {
    return this.state.constructionQueue.filter((q) => q.usesCiv !== false).length;
  }

  setImport(resource, amount) {
    this.state.trade.imports[resource] = clamp(Math.round(amount), 0, 25);
  }

  /* ================= 建設 ================= */

  enqueueConstruction(type) {
    const defs = {
      civilian_factory: { name: '建設.civilian_factory', civ: 1, mil: 0, days: 180 },
      military_factory: { name: '建設.military_factory', civ: 0, mil: 1, days: 180 },
      dockyard: { name: '建設.dockyard', civ: 0, mil: 0, dock: 1, days: 240 },
      infrastructure: { name: '建設.infrastructure', civ: 0, mil: 0, days: 90 },
      fuel_silo: { name: '建設.fuel_silo', civ: 0, mil: 0, days: 120 },
      naval_base: { name: '建設.naval_base', civ: 0, mil: 0, days: 150 },
    };
    const def = defs[type];
    if (!def) return null;
    const q = { id: uid('build'), type, progress: 0, days: def.days, def, usesCiv: true };
    this.state.constructionQueue.push(q);
    return q;
  }

  removeConstruction(id) {
    this.state.constructionQueue = this.state.constructionQueue.filter((q) => q.id !== id);
  }

  /* ================= Tick ================= */

  tick(hours) {
    const s = this.state;
    const dayFrac = hours / DAY_HOURS;

    // --- 貿易: 輸入資源の入荷（1日あたり輸入量×係数）
    for (const r of RESOURCES) {
      const imp = s.trade.imports[r.id] || 0;
      if (imp > 0) s.addStockpile(r.id, imp * 1.2 * dayFrac);
    }

    // --- 生産ライン
    for (const line of s.productionLines) {
      const item = EQUIPMENT_ITEMS[line.item];
      if (!item) continue;
      // 効率成長: 初期10%から時間経過で成長（毎日+2%相当の漸増、上限100%）
      if (line.efficiency < 1.0) {
        line.efficiency = Math.min(1.0, line.efficiency + (1 - line.efficiency) * 0.02 * dayFrac + 0.002 * dayFrac);
      }
      const mioBonus = 1 + this.mio.productionEfficiencyBonus(line.mioId);
      const costMult = this.mio.productionCostMultiplier(line.mioId);
      // 国家的精神などによる生産効率補正（例: 四カ年計画 factoryOutput +5%）
      const spiritOutput = 1 + ((s.getModifier?.('factoryOutput') || 0) + (s.getModifier?.('productionEfficiency') || 0));
      const shortage = this._shortagePenalty(item);
      const output = line.factories * line.efficiency * item.output * mioBonus * spiritOutput * shortage * dayFrac;
      s.addStockpile(line.item, output);

      // 資源消費
      for (const [res, n] of Object.entries(item.resources || {})) {
        s.addStockpile(res, -n * line.factories * item.output * dayFrac * 0.5);
      }

      // 艦船の建造進捗（1隻ごとにICが貯まる）
      if (item.isShip) {
        const icPerDay = line.factories * line.efficiency * item.ic * mioBonus * shortage;
        let progress = (s.shipProgress[line.id] || 0) + icPerDay * dayFrac;
        while (progress >= item.ic) {
          progress -= item.ic;
          this._completeShip(item);
        }
        s.shipProgress[line.id] = progress;
      }
    }

    // --- 建設キュー進行（民需工場は建設にも使われる）
    const civAvail = this.availableCivilianFactories();
    // 民需工場が多いほど建設が速い（0.5x〜1.5x）
    const buildSpeed = Math.min(1.5, 0.5 + Math.max(0, civAvail) * 0.12);
    for (const q of s.constructionQueue) {
      const speed = q.type === 'civilian_factory'
        ? Math.min(1, civAvail > 0 ? 2 : 0.2)
        : buildSpeed;
      q.progress += dayFrac * speed;
      if (q.progress >= q.days) this._completeConstruction(q);
    }
    if (s.constructionQueue.length) {
      this.state.constructionQueue = s.constructionQueue.filter((q) => q.progress < q.days);
    }

    // --- 燃料: 石油備蓄から転換 / 消費
    const consumption = this._fuelConsumptionPerDay() * dayFrac;
    s.fuel.stock = clamp(s.fuel.stock - consumption, 0, s.fuel.max);
    // 石油→燃料転換（備蓄が潤沢なほど効率良く補給）
    if (s.fuel.stock < s.fuel.max * 0.8 && (s.stockpile.oil || 0) > 1000) {
      const convert = Math.min(120 * dayFrac, s.fuel.max - s.fuel.stock, s.stockpile.oil * 0.01);
      s.fuel.stock += convert;
      s.addStockpile('oil', -convert * 0.5);
    }

    // --- コンボイ使用率の概算更新
    s.convoys.used = Math.min(s.convoys.total, Math.round(Object.values(s.trade.imports).reduce((a, b) => a + b, 0) / 2));
  }

  _completeShip(item) {
    this.state.units.navy += 1;
    this.state.bus.emit('ship-completed', { item });
  }

  _fuelConsumptionPerDay() {
    // 摩托化・戦車・航空機・艦船の概算
    return 30 + this.state.units.army * 0.05 + this.state.units.air * 0.02 + this.state.units.navy * 0.1;
  }

  /** 資源不足による減速ペナルティ（資源備蓄が必要量を下回ると低下） */
  _shortagePenalty(item) {
    let worst = 1;
    for (const [res, n] of Object.entries(item.resources || {})) {
      const stock = this.state.stockpile[res] || 0;
      const needPerDay = n * 2; // 概算の日間必要量
      if (stock < needPerDay * 7) {
        worst = Math.min(worst, Math.max(0.3, 0.5 + stock / (needPerDay * 14)));
      }
    }
    return worst;
  }

  _completeConstruction(q) {
    const s = this.state;
    if (q.type === 'civilian_factory') s.factories.civ += 1;
    else if (q.type === 'military_factory') s.factories.mil += 1;
    else if (q.type === 'dockyard') s.factories.dock += 1;
    else if (q.type === 'fuel_silo') s.fuel.max += 10000;
    // 州のインフラ / 補給ハブ（SupplyManager がレベルを更新して補給網を再計算）
    if (q.provinceId) s._supplyMgr?.completeConstruction(q);
    s.bus.emit('construction-completed', q);
  }

  /** 全軍の装備充足率（0..1） */
  equipmentFulfillment() {
    const req = this.state.requiredEquipment();
    const entries = Object.entries(req);
    if (!entries.length) {
      // デフォルト:師団1つぶんの歩兵装備を必要量とみなす簡易評価
      return this.state.stockpile.infantry_equipment_1 > 1000 ? 1 : this.state.stockpile.infantry_equipment_1 / 1000;
    }
    return this.state.getEquipmentFulfillment(req);
  }
}
