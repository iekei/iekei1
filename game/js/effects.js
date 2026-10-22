/**
 * effects.js — HoI4 エフェクト・パーサーエンジン（completion_reward 実行）
 *
 * HoI4 スクリプト構文（`key = value` / `key = { ... }`）と、
 * JavaScript オブジェクト形式の completion_reward の両方を解釈して
 * ゲーム状態へ反映する。
 *
 * 対応ハンドラ（抜粋）:
 *   add_political_power / add_stability / add_war_support / add_command_power
 *   add_manpower / add_fuel / add_convoys
 *   add_civilian_factories / add_military_factories / add_dockyards
 *   add_research_bonus（研究時間短縮） / add_research_slot（研究枠 +1）
 *   add_doctrine_xp / add_army_xp / add_navy_xp / add_air_xp
 *   add_max_planning_bonus（計画準備ボーナス上限）
 *   add_ideas / add_country_spirit / remove_country_spirit
 *   annex / annex_country（併合） / puppet（傀儡化） / create_wargoal（宣戦事由）
 *   add_core / remove_core / add_equipment / add_opinion / add_world_tension
 *   add_offsite_building / add_building_construction
 *
 * 使用例:
 *   const fx = new EffectEngine(state);
 *   fx.execute({ add_political_power: 120, add_research_bonus: { category: 'armor', reduction: 0.5 } });
 *   fx.execute('add_political_power = 50; add_stability = 5');
 *   fx.annexCountry('AUS');
 */

import { toast } from './util.js';
import { I18N } from './i18n.js';
import { nationName, MINOR_STATES } from './data/nations.js';
import { PROVINCES } from './map-data.js';

const clampPct = (v) => Math.max(0, Math.min(100, v));

export class EffectEngine {
  constructor(state) {
    this.state = state;
    this.handlers = new Map();
    this._registerDefaultHandlers();
  }

  /* ================= ハンドラ登録 ================= */

  _registerDefaultHandlers() {
    const set = (key, fn) => this.handlers.set(key, fn);
    const amount = (val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const n = Number(val.value ?? val.amount ?? 0);
        return Number.isFinite(n) ? Math.trunc(n) : 0;
      }
      const n = Number(val);
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    };

    /* --- 工場・資源 --- */
    for (const [effect, type] of Object.entries({
      add_civilian_factories: 'civ', add_military_factories: 'mil', add_dockyards: 'dock',
    })) {
      set(effect, (ctx, val) => {
        this.state.factories[type] = Math.max(0, this.state.factories[type] + amount(val));
        this.state.bus.emit('economy-changed');
      });
    }

    set('add_fuel', (ctx, val) => {
      this.state.fuel.stock = Math.max(0, Math.min(this.state.fuel.max, this.state.fuel.stock + amount(val)));
    });
    set('add_convoys', (ctx, val) => {
      this.state.convoys.total = Math.max(this.state.convoys.used, this.state.convoys.total + amount(val));
    });
    set('add_equipment', (ctx, val) => {
      const obj = typeof val === 'object' && val ? val : { infantry_equipment_1: amount(val) };
      for (const [k, v] of Object.entries(obj)) {
        this.state.stockpile[k] = Math.max(0, (this.state.stockpile[k] || 0) + amount(v));
        this.state.bus.emit('stockpile', { key: k, amount: amount(v) });
      }
    });

    /* --- 政治力・安定度など --- */
    set('add_political_power', (ctx, val) => {
      const n = Number(val) || 0;
      this.state.pp = Math.max(0, this.state.pp + n);
      toast(`${I18N.t('topbar.political_power')} ${n >= 0 ? '+' : ''}${n}`, n > 0 ? 'good' : n < 0 ? 'bad' : 'info');
    });

    set('add_stability', (ctx, val) => { this.state.stability = clampPct(this.state.stability + (Number(val) || 0)); });
    set('set_stability', (ctx, val) => { this.state.stability = clampPct(Number(val) || 0); });
    set('add_war_support', (ctx, val) => { this.state.warSupport = clampPct(this.state.warSupport + (Number(val) || 0)); });
    set('set_war_support', (ctx, val) => { this.state.warSupport = clampPct(Number(val) || 0); });
    set('add_command_power', (ctx, val) => {
      this.state.commandPower = Math.max(0, Math.min(200, (this.state.commandPower || 0) + (Number(val) || 0)));
    });
    set('add_manpower', (ctx, val) => {
      this.state.manpower = Math.max(0, this.state.manpower + (Number(val) || 0));
    });
    set('add_world_tension', (ctx, val) => {
      this.state.worldTension = Math.max(0, Math.min(100, (this.state.worldTension || 0) + (Number(val) || 0)));
    });
    set('add_opinion', (ctx, val) => {
      // { target: 'ITA', amount: 20 } 形式
      if (val && typeof val === 'object') {
        const tag = String(val.target || val.tag || '');
        if (!tag) return;
        const rel = this.state.diplomacy.relations;
        rel[tag] = Math.max(-100, Math.min(100, (rel[tag] ?? 0) + (Number(val.amount) || 0)));
        this.state.bus.emit('diplomacy-changed', { tag });
      }
    });

    /* --- 国家的精神（ideas） --- */
    set('add_ideas', (ctx, val) => this._addSpirit(val));
    set('add_country_spirit', (ctx, val) => this._addSpirit(val));
    set('remove_country_spirit', (ctx, val) => {
      const id = typeof val === 'object' && val ? String(val.id) : String(val);
      this.state.politics.spirits = this.state.politics.spirits.filter((s) => s.id !== id);
      this.state.bus.emit('politics-changed');
    });

    /* --- 研究 --- */
    set('add_research_bonus', (ctx, val) => this._addResearchBonus(val));
    set('research_bonus', (ctx, val) => this._addResearchBonus(val));
    set('add_tech_bonus', (ctx, val) => this._addResearchBonus(val));
    set('add_research_slot', (ctx, val) => {
      const n = Math.max(1, amount(val) || 1);
      const prog = this.state._researchMgr?.progressFor?.(this.state.playerTag);
      if (prog) for (let i = 0; i < n; i++) prog.active.push(null);
      if (this.state.research) this.state.research.slots = (this.state.research.slots || 2) + n;
      toast(`研究枠 +${n}`, 'good');
      this.state.bus.emit('research-slots-changed', n);
    });

    /* --- ドクトリン XP --- */
    set('add_doctrine_xp', (ctx, val) => {
      if (val && typeof val === 'object') {
        for (const [branch, xp] of Object.entries(val)) this._grantDoctrineXP(branch, Number(xp) || 0);
      } else {
        this._grantDoctrineXP('land', Number(val) || 0);
      }
    });
    set('add_army_xp', (ctx, val) => this._grantDoctrineXP('land', Number(val) || 0));
    set('add_navy_xp', (ctx, val) => this._grantDoctrineXP('naval', Number(val) || 0));
    set('add_air_xp', (ctx, val) => this._grantDoctrineXP('air', Number(val) || 0));
    set('add_max_planning_bonus', (ctx, val) => {
      const n = val && typeof val === 'object' ? Number(val.value ?? val.amount ?? 0) : Number(val) || 0;
      this.state.planningBonusMax = Math.min(0.30, (this.state.planningBonusMax || 0) + n);
      toast(`計画準備ボーナス上限 +${Math.round(n * 100)}%`, 'good');
    });

    /* --- 領土・外交 --- */
    set('annex', (ctx, val) => {
      const tag = typeof val === 'object' && val ? String(val.tag || val.country || '') : String(val);
      this.annexCountry(tag, { force: true, ctx });
    });
    set('annex_country', (ctx, val) => {
      const tag = typeof val === 'object' && val ? String(val.tag || val.country || '') : String(val);
      this.annexCountry(tag, { force: true, ctx });
    });

    set('puppet', (ctx, val) => {
      const tag = typeof val === 'object' && val ? String(val.tag || val.country || '') : String(val);
      const mgr = this.state._politicsMgr;
      if (mgr && mgr.createPuppet(tag)) {
        toast(`${nationName(tag)} に傀儡政権を樹立しました`, 'info');
        this.state.bus.emit('territory-changed');
      } else {
        toast(`${nationName(tag)} の傀儡化条件を満たしていません`, 'bad');
      }
    });

    set('create_wargoal', (ctx, val) => {
      const obj = val && typeof val === 'object' ? val : { tag: String(val) };
      const tag = String(obj.tag || obj.target || '');
      if (!tag) return;
      if (!this.state.warGoals) this.state.warGoals = {};
      this.state.warGoals[tag] = {
        justified: true,
        at: this.state.dateLabel,
        type: obj.type || obj.wargoalType || 'conquest',
        source: ctx?.focus || 'effect',
      };
      if (obj.cost) this.state.pp = Math.max(0, this.state.pp - Number(obj.cost));
      toast(`${nationName(tag)} に対する宣戦事由を獲得しました`, 'info');
      this.state.bus.emit('diplomacy-changed', { tag });
    });

    set('add_core', (ctx, val) => {
      const tag = typeof val === 'object' && val ? String(val.tag || val.country || '') : String(val);
      if (!this.state.cores) this.state.cores = new Set();
      this.state.cores.add(tag);
    });
    set('remove_core', (ctx, val) => {
      const tag = typeof val === 'object' && val ? String(val.tag || val.country || '') : String(val);
      this.state.cores?.delete(tag);
    });

    set('add_offsite_building', (ctx, val) => {
      toast(`建設開始（離島建設）: ${val}`, 'info');
      this.state.bus.emit('construction-requested', { type: String(val) });
    });
    set('add_building_construction', (ctx, val) => {
      toast(`建設着工: ${val}`, 'info');
      this.state.bus.emit('construction-requested', { type: String(val) });
    });

    /* --- 互換用の no-op --- */
    for (const k of ['change_variable', 'set_variable', 'set_controller', 'set_country_flag', 'clamp_temperature', 'custom_effect_tooltip', 'hidden_effect']) {
      set(k, () => { /* 汎用（プレースホルダ） */ });
    }
  }

  /* ================= 内部ヘルパ ================= */

  _grantDoctrineXP(branch, xp) {
    if (!xp) return;
    const key = { land: 'land', naval: 'naval', air: 'air', army: 'land', navy: 'naval' }[branch] || 'land';
    const mgr = this.state._doctrineMgr;
    if (mgr?.addXP) { mgr.addXP(key, xp); return; }
    if (this.state.doctrine?.xp) {
      this.state.doctrine.xp[key] = Math.max(0, (this.state.doctrine.xp[key] || 0) + xp);
    }
    toast(`${I18N.t(`doctrine.branches.${key}`)}経験値 +${xp}`, 'good');
  }

  _addResearchBonus(val) {
    let entry;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const scope = val.scope || (val.tech ? 'tech' : val.category ? 'category' : 'any');
      entry = this.state.addResearchBonus?.({
        scope,
        match: val.tech || val.category || val.match || null,
        reduction: Number(val.reduction ?? val.amount ?? val.bonus ?? 0.5),
        uses: Number.isFinite(val.uses) ? val.uses : 1,
        label: val.label || '研究ボーナス',
      });
    } else {
      entry = this.state.addResearchBonus?.({ scope: 'any', reduction: Number(val) || 0.5, uses: 1 });
    }
    if (entry) {
      toast(`研究ボーナス獲得: ${entry.scope === 'tech' ? entry.match : entry.scope === 'category' ? I18N.categoryName(entry.match) : 'すべて'} の研究時間 -${Math.round(entry.reduction * 100)}%`, 'good');
      this.state.bus.emit('research-bonus-added', entry);
    }
    return entry;
  }

  _addSpirit(val) {
    let spirit;
    if (val && typeof val === 'object') {
      spirit = {
        id: String(val.id || val.name || 'idea'),
        name: val.name || I18N.dict?.ideas?.[val.id] || String(val.id || '国家的精神'),
        desc: val.desc || val.description || '',
        modifiers: val.modifiers || {},
      };
    } else {
      const id = String(val);
      spirit = { id, name: I18N.dict?.ideas?.[id] || id, desc: '', modifiers: {} };
    }
    if (!this.state.politics.spirits.some((s) => s.id === spirit.id)) {
      this.state.politics.spirits.push(spirit);
      toast(`国家的精神を獲得: ${spirit.name}`, 'good');
      this.state.bus.emit('politics-changed');
    }
  }

  /**
   * 国家の併合。
   * @param {string} tag 併合する国
   * @param {{force?:boolean, ctx?:object}} opts force=true は国家方針報酬（アンシュルス等）向け
   * @returns {boolean}
   */
  annexCountry(tag, { force = false } = {}) {
    const state = this.state;
    if (!tag || tag === state.playerTag) return false;
    const provinces = PROVINCES.filter((p) => p.tag === tag);
    const minor = MINOR_STATES[tag];
    const occ = (state.occupations || []).find((o) => o.tag === tag);

    // 占領地として存在する場合は占領度条件（force なら無視）
    if (occ && occ.compliance < 100 && !force) {
      toast(`${nationName(tag)} の併合条件を満たしていません（占領度100%必要）`, 'bad');
      return false;
    }
    if (!provinces.length && !minor && !occ) {
      toast(`${nationName(tag)} は併合できません（データなし）`, 'bad');
      return false;
    }

    // 1. 領土の移譲
    for (const p of provinces) p.tag = state.playerTag;
    // 2. 工場の獲得（民需・軍需の半分ずつ）
    const factories = occ?.factories ?? minor?.factories ?? Math.max(4, provinces.length * 3);
    state.factories.mil += Math.floor(factories * 0.5);
    state.factories.civ += Math.ceil(factories * 0.5);
    // 3. 占領地リストから除去し、コア化
    state.occupations = (state.occupations || []).filter((o) => o.tag !== tag);
    if (!state.cores) state.cores = new Set();
    state.cores.add(tag);
    // 4. 戦争状態・戦争目標を整理
    state.atWarWith?.delete?.(tag);
    if (state.warGoals) delete state.warGoals[tag];

    toast(`${nationName(tag)} を併合しました（${provinces.length}州 / 工場 +${factories}）`, 'good');
    state.bus.emit('territory-changed', { tag, kind: 'annex' });
    state.bus.emit('territory-annexed', { tag });
    return true;
  }

  /* ================= パーサー ================= */

  set(key, fn) { this.handlers.set(key, fn); }

  has(key) { return this.handlers.has(String(key).toLowerCase()); }

  /** 単一エフェクト文をパース: "key = value" / "key = { ... }" */
  parseEffect(text) {
    text = String(text).trim();
    if (!text) return null;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/s.exec(text);
    if (!m) return null;
    const key = m[1].toLowerCase();
    const rest = m[2].trim();
    if (rest.startsWith('{') && rest.endsWith('}')) {
      return { key, block: this.parseBlock(rest.slice(1, -1)) };
    }
    return { key, value: rest };
  }

  /** ブロック内をセミコロン/改行で分割し波括弧を考慮してトークン化 */
  parseBlock(text) {
    const effects = [];
    let buf = '', depth = 0, inQuote = false, quoteChar = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuote) {
        buf += ch;
        if (ch === quoteChar) inQuote = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; buf += ch; continue; }
      if (ch === '{') { depth++; buf += ch; continue; }
      if (ch === '}') { depth--; buf += ch; continue; }
      if (depth === 0 && (ch === ';' || ch === '\n')) {
        const t = buf.trim();
        if (t) effects.push(t);
        buf = '';
        continue;
      }
      buf += ch;
    }
    const t = buf.trim();
    if (t) effects.push(t);
    return effects.map((e) => this.parseEffect(e)).filter(Boolean);
  }

  /** エフェクト文字列 / 配列 / オブジェクトを順次実行 */
  execute(effects, ctx = {}) {
    if (!effects) return;
    if (typeof effects === 'string') {
      for (const effect of this.parseBlock(effects)) {
        if (effect.key === 'completion_reward' && effect.block) effect.block.forEach((sub) => this._run(sub, ctx));
        else this._run(effect, ctx);
      }
      this.state.bus.emit('effects-executed'); return;
    }
    const list = Array.isArray(effects)
      ? effects
      : (effects.key || effects.block)
        ? [effects]
        : Object.entries(effects).map(([key, value]) => ({ key, value }));
    for (const item of list) {
      if (typeof item === 'string') {
        const parsed = this.parseEffect(item);
        if (parsed) this._run(parsed, ctx);
      } else if (item && item.block) {
        // ハンドラが登録されているブロックは値をそのまま渡す（add_ideas など）
        if (this.handlers.has(item.key)) this._run({ key: item.key, value: item.block }, ctx);
        else for (const sub of item.block) this._run(sub, ctx);
      } else if (item && item.key) {
        this._run(item, ctx);
      }
    }
    this.state.bus.emit('effects-executed');
  }

  _run(parsed, ctx) {
    if (!parsed?.key) return;
    const fn = this.handlers.get(String(parsed.key).toLowerCase());
    if (!fn) {
      // 未対応エフェクトは静かに記録（デバッグ用）
      (this.state.unhandledEffects ||= []).push(parsed.key);
      return;
    }
    try { fn(ctx, parsed.value); } catch (e) { console.error('[effects]', parsed.key, e); }
  }
}

export default EffectEngine;
