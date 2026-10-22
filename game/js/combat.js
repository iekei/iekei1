/**
 * combat.js — 戦闘シミュレーター（hoidesigner.com/simulate 準拠）
 *
 * - 左右に攻撃側・防御側の編成、地形、指揮官、掘り込み設定パネル
 * - 1 Tick（1時間）ごとにダイスロール、攻撃 vs 防御/突破、地形ペナルティ
 * - 組織力/HPバーの削減アニメーションとリアルタイム日本語戦闘ログ
 */

import { I18N } from './i18n.js';
import { Bus, dice, roll, clamp } from './util.js';
import { commanderEffects } from './data/cards.js';

/** 地形ごとの戦闘補正: {attack, defense, speed} */
export const TERRAIN_MODS = {
  plains:    { attack: 0.00, defense: 0.00, name: 'plains' },
  forest:    { attack: -0.10, defense: 0.15, name: 'forest' },
  hills:     { attack: -0.10, defense: 0.15, name: 'hills' },
  mountains: { attack: -0.30, defense: 0.30, name: 'mountains' },
  urban:     { attack: -0.15, defense: 0.30, name: 'urban' },
  jungle:    { attack: -0.20, defense: 0.20, name: 'jungle' },
  desert:    { attack: 0.00, defense: -0.05, name: 'desert' },
  marsh:     { attack: -0.15, defense: 0.10, name: 'marsh' },
  river:     { attack: -0.20, defense: 0.10, name: 'river' },
  coastal:   { attack: -0.05, defense: 0.05, name: 'coastal' },
};

export const WEATHER_MODS = {
  clear: { attack: 0, name: 'clear' },
  rain: { attack: -0.05, name: 'rain' },
  snow: { attack: -0.10, name: 'snow' },
  storm: { attack: -0.15, name: 'storm' },
  fog: { attack: -0.05, name: 'fog' },
  blizzard: { attack: -0.20, name: 'blizzard' },
};

export const TACTICS = {
  balanced: { attack: 0, defense: 0, name: 'balanced' },
  aggressive: { attack: 0.15, defense: -0.10, name: 'aggressive' },
  cautious: { attack: -0.10, defense: 0.15, name: 'cautious' },
  encirclement: { attack: 0.10, defense: -0.05, name: 'encirclement' },
  breakthrough: { attack: 0.20, defense: -0.15, breakthroughBonus: 0.25, name: 'breakthrough' },
  delay: { attack: -0.20, defense: 0.25, name: 'delay' },
  guerrilla: { attack: -0.05, defense: 0.20, name: 'guerrilla' },
};

export const MAX_TICKS = 96; // 4日間で決着

export class CombatSimulator {
  constructor(config) {
    this.bus = new Bus();
    // {attacker:{template,commander,intelBonus}, defender:{...}, terrain, weather, tactic, entrenchment,
    //  doctrine: DoctrineManager.effects('land'), planningBonus: 0..0.6}
    this.cfg = config;
    this.tickCount = 0;
    this.ended = false;
    this.winner = null;
    this.log = [];
    this._initCombatants();
  }

  _initCombatants() {
    // ドクトリン補正（DoctrineManager.effects('land') の集計値）
    const doc = this.cfg.doctrine || {};
    const planning = this.cfg.planningBonus || 0;
    const mk = (side, cfg) => {
      const st = cfg.template?.stats || { softAttack: 10, hardAttack: 5, defense: 20, breakthrough: 10, maxOrg: 50, hp: 100, armor: 0, piercing: 10 };
      const eff = commanderEffects(cfg.commander);
      const terrain = TERRAIN_MODS[this.cfg.terrain] || TERRAIN_MODS.plains;
      const weather = WEATHER_MODS[this.cfg.weather] || WEATHER_MODS.clear;
      const tac = TACTICS[this.cfg.tactic] || TACTICS.balanced;
      const isAttacker = side === 'attacker';
      // 計画準備ボーナスは攻撃側の攻撃・突破にのみ乗る（HOI4 準拠）
      const planMul = isAttacker ? 1 + planning : 1;
      const entrench = this.cfg.entrenchment ? 0.15 + (doc.entrench || 0) : 0;
      return {
        side,
        name: cfg.template?.name || (isAttacker ? '攻撃側師団' : '防御側師団'),
        org: (st.maxOrg || st.org || 50) * (1 + (doc.org || 0)),
        maxOrg: (st.maxOrg || st.org || 50) * (1 + (doc.org || 0)),
        hp: st.hp || 100,
        maxHp: st.hp || 100,
        soft: (st.softAttack || 0) * (1 + (eff.softPct || 0) + (eff.hardPct || 0) + (doc.soft || 0)) * planMul * (1 + (isAttacker ? terrain.attack : terrain.defense) + weather.attack + (isAttacker ? tac.attack : tac.defense)),
        hard: (st.hardAttack || 0) * (1 + (eff.hardPct || 0) + (doc.hard || 0)) * planMul * (1 + (isAttacker ? terrain.attack : terrain.defense) + weather.attack + (isAttacker ? tac.attack : tac.defense)),
        defense: (st.defense || 0) * (1 + (eff.defensePct || 0) + (doc.defense || 0) + (isAttacker ? 0 : entrench)),
        breakthrough: (st.breakthrough || 0) * (1 + (eff.breakthroughPct || 0) + (doc.breakthrough || 0) + (tac.breakthroughBonus || 0)) * planMul,
        piercing: (st.piercing || 0) * (1 + (eff.piercingPct || 0) + (doc.piercing || 0)),
        armor: (st.armor || 0) * (1 + (eff.armorPct || 0) + (doc.armor || 0)),
        intelBonus: cfg.intelBonus || 0, // 諜報による優位
        entrenchment: !isAttacker && this.cfg.entrenchment,
        planningBonus: isAttacker ? planning : 0,
      };
    };
    this.attacker = mk('attacker', this.cfg.attacker || {});
    this.defender = mk('defender', this.cfg.defender || {});
    this.attacker.soft += this.attacker.intelBonus * 10;
    this.attacker.hard += this.attacker.intelBonus * 10;
  }

  _log(cls, text) {
    const line = { tick: this.tickCount, cls, text };
    this.log.push(line);
    this.bus.emit('log', line);
  }

  start() {
    this._log('event', I18N.t('simulator.log.start', {
      terrain: I18N.terrainName(this.cfg.terrain),
      weather: I18N.weatherName(this.cfg.weather),
    }));
    if (this.cfg.entrenchment) this._log('event', I18N.t('simulator.log.entrench_bonus'));
  }

  /** 1 Tick（1時間）の戦闘処理。戻り値: 継続可否 */
  step() {
    if (this.ended) return false;
    this.tickCount += 1;

    // 攻撃側 → 防御側
    this._attack(this.attacker, this.defender, 'attack');
    if (this.ended) return false;
    // 防御側 → 攻撃側（反撃）
    if (this.defender.org > 0) this._attack(this.defender, this.attacker, 'defend');
    if (this.ended) return false;

    // 組織力自然回復（小量）
    for (const c of [this.attacker, this.defender]) {
      c.org = Math.min(c.maxOrg, c.org + 0.4);
    }

    this.bus.emit('tick', { tick: this.tickCount, attacker: this.attacker, defender: this.defender });
    if (this.tickCount >= MAX_TICKS) {
      this.ended = true;
      this.winner = null;
      this._log('event', I18N.t('simulator.log.draw'));
      this.bus.emit('end', { winner: null });
      return false;
    }
    return true;
  }

  _attack(from, to, cls) {
    // 攻撃値 vs 防御/突破
    const defRoll = dice(1, 4) / 2; // 防御側ダイス（低いほど防御側有利）
    const atkRoll = dice(1, 4) / 2 + 1; // 攻撃側ダイス
    const useBreakthrough = from.breakthrough > to.defense;
    const attackPower = (from.soft * 0.6 + from.hard * 0.4) * atkRoll;
    const defensePower = (useBreakthrough ? from.breakthrough : to.defense) * defRoll;
    const ratio = attackPower / Math.max(1, defensePower);
    const baseDmg = Math.max(1, ratio * 5);
    // 装甲優位なら貫通ボーナス
    const armorDiff = from.piercing - to.armor;
    const piercingBonus = armorDiff > 0 ? 1 + Math.min(0.5, armorDiff / 200) : 1;
    const orgDmg = baseDmg * piercingBonus;
    const hpDmg = orgDmg * 0.35;

    to.org = Math.max(0, to.org - orgDmg);
    to.hp = Math.max(0, to.hp - hpDmg);

    this._log(cls, I18N.t(`simulator.log.${cls === 'attack' ? 'attack' : 'defend'}`, {
      dice: `${atkRoll.toFixed(1)} vs ${defRoll.toFixed(1)}`,
      dmg: hpDmg.toFixed(1),
      dmgOrg: orgDmg.toFixed(1),
    }) + (useBreakthrough ? ' ' + I18N.t('simulator.log.breakthrough') : ''));

    if (to.org <= 0) {
      this.ended = true;
      this.winner = from.side;
      this._log('event', I18N.t('simulator.log.retreat', {
        side: I18N.t(`simulator.log.side_${to.side}`),
      }));
      this._log('event', I18N.t('simulator.log.win', {
        side: I18N.t(`simulator.log.side_${from.side}`),
        ac: Math.round(100 - (this.attacker.hp / this.attacker.maxHp) * 100),
        dc: Math.round(100 - (this.defender.hp / this.defender.maxHp) * 100),
      }));
      this.bus.emit('end', { winner: from.side, attacker: this.attacker, defender: this.defender });
    }
  }
}
