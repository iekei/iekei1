/**
 * effects.js — HoI4 エフェクト・パーサーエンジン
 *
 * HoI4 スクリプト構文を解釈し、JavaScript / ゲーム状態内で実行する共通関数。
 * 対応構文:
 *   key = value                                   単純代算
 *   key = { subkey = value; ... }                 ブロック（セミコロン区切り）
 *
 * 標準ハンドラ:
 *   add_political_power, add_stability, add_war_support,
 *   add_ideas, add_country_spirit, remove_country_spirit,
 *   annex, puppet, create_wargoal, add_offsite_building,
 *   set_stability, set_war_support, add_command_power, add_manpower,
 *   add_building_construction, add_core, remove_core, change_variable
 *
 * 使用例:
 *   const fx = new EffectEngine(state);
 *   fx.execute('add_political_power = 50; add_stability = 5');
 *   fx.execute('annex = CZE');
 */

import { toast } from './util.js';
import { I18N } from './i18n.js';
import { nationName } from './data/nations.js';

export class EffectEngine {
  constructor(state) {
    this.state = state;
    this.handlers = new Map();
    this._registerDefaultHandlers();
  }

  _registerDefaultHandlers() {
    const set = (k, fn) => this.handlers.set(k, fn);

    const amount = val => { const n = Number(val); return Number.isFinite(n) ? Math.trunc(n) : 0; };
    for (const [effect, type] of Object.entries({ add_civilian_factories:'civ', add_military_factories:'mil', add_dockyards:'dock' })) {
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

    set('add_political_power', (ctx, val) => {
      const n = Number(val) || 0;
      this.state.pp = Math.max(0, this.state.pp + n);
      toast(`${I18N.t('topbar.political_power')} ${n >= 0 ? '+' : ''}${n}`, n > 0 ? 'good' : n < 0 ? 'bad' : 'info');
    });

    set('add_stability', (ctx, val) => {
      const n = Number(val) || 0;
      this.state.stability = clampPct(this.state.stability + n);
    });

    set('set_stability', (ctx, val) => {
      this.state.stability = clampPct(Number(val) || 0);
    });

    set('add_war_support', (ctx, val) => {
      const n = Number(val) || 0;
      this.state.warSupport = clampPct(this.state.warSupport + n);
    });

    set('set_war_support', (ctx, val) => {
      this.state.warSupport = clampPct(Number(val) || 0);
    });

    set('add_command_power', (ctx, val) => {
      const n = Number(val) || 0;
      this.state.commandPower = Math.max(0, Math.min(200, (this.state.commandPower || 0) + n));
    });

    set('add_manpower', (ctx, val) => {
      const n = Number(val) || 0;
      this.state.manpower = Math.max(0, this.state.manpower + n);
    });

    set('add_ideas', (ctx, val) => this._addSpirit(String(val), true));
    set('add_country_spirit', (ctx, val) => this._addSpirit(String(val), true));

    set('remove_country_spirit', (ctx, val) => {
      const id = String(val);
      this.state.politics.spirits = this.state.politics.spirits.filter((s) => s.id !== id);
    });

    set('annex', (ctx, val) => {
      const tag = String(val);
      const mgr = this.state._politicsMgr;
      if (mgr && mgr.integrate(tag)) {
        toast(`${nationName(tag)} を併合・コア化しました`, 'good');
        this.state.bus.emit('territory-changed');
      } else {
        toast(`${nationName(tag)} の併合条件を満たしていません（占領度100%必要）`, 'bad');
      }
    });

    set('puppet', (ctx, val) => {
      const tag = String(val);
      const mgr = this.state._politicsMgr;
      if (mgr && mgr.createPuppet(tag)) {
        toast(`${nationName(tag)} に傀儡政権を樹立しました`, 'info');
        this.state.bus.emit('territory-changed');
      } else {
        toast(`${nationName(tag)} の傀儡化条件を満たしていません`, 'bad');
      }
    });

    set('create_wargoal', (ctx, val) => {
      const tag = String(val);
      if (!this.state.diplomacy.warGoals) this.state.diplomacy.warGoals = {};
      this.state.diplomacy.warGoals[tag] = { justified: true, at: this.state.dateLabel };
      const wgCost = 100;
      if (this.state.pp >= wgCost) {
        this.state.pp -= wgCost;
      }
      toast(`${nationName(tag)} に対する戦争目標を正当化しました（${wgCost} PP）`, 'info');
      this.state.bus.emit('diplomacy-changed', { tag });
    });

    set('add_offsite_building', (ctx, val) => {
      toast(`建設開始（離島建設）: ${val}`, 'info');
      this.state.bus.emit('construction-requested', { type: String(val) });
    });

    set('add_building_construction', (ctx, val) => {
      toast(`建設着工: ${val}`, 'info');
      this.state.bus.emit('construction-requested', { type: String(val) });
    });

    set('add_core', (ctx, val) => {
      const tag = String(val);
      if (!this.state.cores) this.state.cores = new Set();
      this.state.cores.add(tag);
    });

    set('remove_core', (ctx, val) => {
      const tag = String(val);
      if (this.state.cores) this.state.cores.delete(tag);
    });

    set('change_variable', () => { /* 汎用変数（プレースホルダ） */ });
    set('set_variable', () => { });
    set('set_controller', () => { });
  }

  _addSpirit(id, notify = true) {
    if (!this.state.politics.spirits.find((s) => s.id === id)) {
      this.state.politics.spirits.push({
        id,
        name: id,
        desc: (I18N.dict?.ideas?.[id] || I18N.t(`ideas.${id}`)) || id,
      });
      if (notify) toast(`国家的精神を獲得: ${id}`, 'good');
      this.state.bus.emit('politics-changed');
    }
  }

  set(key, fn) { this.handlers.set(key, fn); }

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

  /** エフェクト文字列または配列を順次実行 */
  execute(effects, ctx = {}) {
    if (!effects) return;
    // Accept HOI-style completion_reward = { ... }, plain reward objects and legacy strings.
    if (typeof effects === 'string') {
      const parsed = this.parseBlock(effects);
      for (const effect of parsed) {
        if (effect.key === 'completion_reward' && effect.block) effect.block.forEach(sub => this._run(sub, ctx));
        else this._run(effect, ctx);
      }
      this.state.bus.emit('effects-executed'); return;
    }
    const list = Array.isArray(effects) ? effects : effects.key || effects.block ? [effects] : Object.entries(effects).map(([key,value]) => ({key,value}));
    for (const item of list) {
      if (typeof item === 'string') {
        const parsed = this.parseEffect(item);
        if (parsed) this._run(parsed, ctx);
      } else if (item && item.block) {
        for (const sub of item.block) this._run(sub, ctx);
      } else if (item && item.key) {
        this._run(item, ctx);
      }
    }
    this.state.bus.emit('effects-executed');
  }

  _run(parsed, ctx) {
    const fn = this.handlers.get(parsed.key);
    if (fn) {
      try { fn(ctx, parsed.value); } catch (e) { console.error('[effects]', parsed.key, e); }
    }
  }
}

function clampPct(v) { return Math.max(0, Math.min(100, v)); }

export default EffectEngine;
