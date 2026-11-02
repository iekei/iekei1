/* automation-manager.js — 初心者向け「選択式AIアシスト」
 *
 * game/index.html 専用。設定は CoreEngine.gameState.countries[TAG].automation に
 * 国別保存する。実行は常に「ローカルで操作中の自国」だけ。他国のフラグは同期・保存
 * しても絶対に実行しない。前線/攻撃線/移動/攻撃などの軍事作戦APIは呼ばない。
 */
(function () {
  'use strict';

  const FEATURES = [
    { key: 'production', icon: '🏭', label: '生産', desc: '不足している装備を優先し、軍需工場・造船所を生産ラインへ配分します。' },
    { key: 'design', icon: '🛠️', label: '装備設計', desc: '研究済みの最新モジュールで、戦車・航空機・艦船の設計案を保存します。' },
    { key: 'focus', icon: '🎯', label: '国家方針', desc: '空き方針スロットに、選択可能な方針を自動で選びます。' },
    { key: 'division', icon: '📐', label: '師団テンプレート', desc: '陸軍XPを使い、徴兵テンプレートに支援中隊などを追加します。' },
    { key: 'recruitment', icon: '🎓', label: '徴兵・配置', desc: '兵員と装備が足りるときだけ訓練を開始し、完了後に予備へ配置します。' },
    { key: 'research', icon: '🔬', label: '研究', desc: '空いている研究スロットに、前提条件を満たす技術を割り当てます。' }
  ];
  const KEYS = FEATURES.map(f => f.key);
  const DEFAULTS = Object.freeze({ production: false, design: false, focus: false, division: false, recruitment: false, research: false });
  const MANUAL_ONLY = Object.freeze(['frontline', 'offensiveLine', 'attack', 'movement', 'navalInvasion', 'airdrop', 'declareWar']);
  const TAG_RE = /^[A-Z0-9]{3}$/;
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const finite = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 方針完了報酬に含まれる「軍事・外交の自動実行」は禁止。経済/研究/建設系だけ許可。
  const BLOCKED_REWARD_TYPES = new Set([
    'declare_war', 'declare_war_on', 'create_wargoal', 'add_wargoal', 'give_wargoal', 'casus_belli',
    'annex_country', 'annex_target', 'occupy_country', 'puppet', 'release_puppet', 'civil_war',
    'start_civil_war', 'add_to_faction', 'join_faction', 'give_guarantee', 'guarantee',
    'send_equipment', 'send_expeditionary_force', 'expeditionary_force', 'lend_lease',
    'frontline', 'offensive_line', 'attack', 'move', 'movement', 'naval_invasion', 'airdrop',
    'add_ace', 'promote_leader', 'transfer_navy', 'transfer_air'
  ]);
  const BLOCKED_EFFECT_RE = /declare_war|create_wargoal|add_wargoal|annex|occupy_country|puppet|civil_war|naval_invasion|airdrop|frontline|offensive|attack|move_to|宣戦|戦争目標|併合|占領|傀儡|侵攻|上陸|降下|攻撃線|前線/i;

  class AutomationManager {
    static FEATURES = FEATURES;
    static KEYS = KEYS;
    static DEFAULTS = DEFAULTS;
    static MANUAL_ONLY = MANUAL_ONLY;
    static started = false;
    static tickRegistered = false;
    static lastCountry = null;
    static errors = Object.create(null);

    // ---------- 国別状態 ----------
    static state() {
      return (typeof CoreEngine !== 'undefined' && CoreEngine.gameState) ? CoreEngine.gameState : null;
    }
    static validTag(tag) { return typeof tag === 'string' && TAG_RE.test(tag); }
    static normalizeSettings(raw) {
      const out = { ...DEFAULTS };
      if (!raw || typeof raw !== 'object') return out;
      KEYS.forEach(key => { out[key] = raw[key] === true; });
      return out;
    }
    static ensureCountry(tag, state = AutomationManager.state()) {
      if (!state || !AutomationManager.validTag(tag)) return null;
      if (!state.countries || typeof state.countries !== 'object' || Array.isArray(state.countries)) state.countries = {};
      let record = state.countries[tag];
      if (!record || typeof record !== 'object' || Array.isArray(record)) record = state.countries[tag] = {};
      record.tag = tag;
      record.automation = AutomationManager.normalizeSettings(record.automation);
      record.automationRevision = Math.max(0, Math.floor(finite(record.automationRevision)));
      if (!record.automationMeta || typeof record.automationMeta !== 'object') record.automationMeta = {};
      const meta = record.automationMeta;
      if (!meta.lastRun || typeof meta.lastRun !== 'object') meta.lastRun = {};
      if (!meta.fingerprints || typeof meta.fingerprints !== 'object') meta.fingerprints = {};
      if (!Array.isArray(meta.log)) meta.log = [];
      return record;
    }
    static settings(tag, state = AutomationManager.state()) {
      const record = AutomationManager.ensureCountry(tag, state);
      return record ? record.automation : { ...DEFAULTS };
    }
    static restoreCountries(saved, activeTag, state = AutomationManager.state()) {
      if (!state) return {};
      const next = {};
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        Object.keys(saved).forEach(tag => {
          if (!AutomationManager.validTag(tag)) return;
          const src = saved[tag] || {};
          next[tag] = {
            tag,
            automation: AutomationManager.normalizeSettings(src.automation),
            automationRevision: Math.max(0, Math.floor(finite(src.automationRevision))),
            automationMeta: src.automationMeta && typeof src.automationMeta === 'object' ? clone(src.automationMeta) : {}
          };
        });
      }
      state.countries = next;
      AutomationManager.ensureCountry(activeTag || state.country, state);
      return state.countries;
    }
    static serializeCountry(tag, state = AutomationManager.state()) {
      const record = AutomationManager.ensureCountry(tag, state);
      if (!record) return null;
      return { country: tag, automation: { ...record.automation }, revision: record.automationRevision };
    }
    static serializeAll(state = AutomationManager.state()) {
      if (!state || !state.countries) return {};
      return Object.fromEntries(Object.keys(state.countries)
        .filter(tag => AutomationManager.validTag(tag))
        .map(tag => [tag, AutomationManager.serializeCountry(tag, state)]));
    }

    // ---------- 設定変更（自国のみ） ----------
    static setLocalFeature(key, enabled, tag) {
      const state = AutomationManager.state();
      if (!state || !KEYS.includes(key)) return false;
      const target = tag || state.country;
      // ゲーム開始前の国家選択画面では、選択中の国だけを設定できる。
      if (AutomationManager.started && target !== state.country) return false;
      const record = AutomationManager.ensureCountry(target, state);
      if (!record) return false;
      const value = enabled === true;
      if (record.automation[key] === value) return true;
      record.automation[key] = value;
      record.automationRevision = AutomationManager.nextRevision(record.automationRevision);
      AutomationManager.publish(target);
      AutomationManager.renderAll();
      return true;
    }
    static preset(tag, enabled) {
      const state = AutomationManager.state();
      const target = tag || (state && state.country);
      if (!state || !AutomationManager.validTag(target)) {
        AutomationManager.notify('先に国家を選択してください。', 'alert');
        return false;
      }
      if (AutomationManager.started && target !== state.country) return false;
      const record = AutomationManager.ensureCountry(target, state);
      const value = enabled === true;
      let changed = false;
      KEYS.forEach(key => { if (record.automation[key] !== value) { record.automation[key] = value; changed = true; } });
      if (changed) {
        record.automationRevision = AutomationManager.nextRevision(record.automationRevision);
        AutomationManager.publish(target);
      }
      AutomationManager.renderAll();
      return true;
    }
    static nextRevision(current) {
      return Math.max(Math.floor(finite(current)) + 1, Date.now());
    }

    // ---------- マルチプレイ同期（設定データのみ。実行はしない） ----------
    static message(tag, state = AutomationManager.state()) {
      const payload = AutomationManager.serializeCountry(tag, state);
      return payload ? { type: 'automation_settings', ...payload } : null;
    }
    static publish(tag) {
      const state = AutomationManager.state();
      const target = tag || (state && state.country);
      if (typeof MultiplayerManager === 'undefined' || !MultiplayerManager.connected) return false;
      const msg = AutomationManager.message(target, state);
      if (!msg) return false;
      try { MultiplayerManager.broadcast(msg); return true; } catch (error) { return false; }
    }
    static sendSnapshot(conn) {
      const state = AutomationManager.state();
      if (!conn || typeof conn.send !== 'function' || !state || !state.countries) return;
      Object.keys(state.countries).forEach(tag => {
        if (tag === state.country) return;
        const msg = AutomationManager.message(tag, state);
        if (msg) { try { conn.send(msg); } catch (error) { /* noop */ } }
      });
    }
    static mergeRemote(payload, senderCountry) {
      const state = AutomationManager.state();
      if (!state || !payload || payload.country !== senderCountry) return false;
      if (!AutomationManager.validTag(senderCountry) || senderCountry === state.country) return false;
      const revision = Math.floor(finite(payload.revision));
      const record = AutomationManager.ensureCountry(senderCountry, state);
      if (!record || revision <= record.automationRevision) return false;
      record.automation = AutomationManager.normalizeSettings(payload.automation);
      record.automationRevision = revision;
      record.remote = true;
      AutomationManager.renderAll();
      return true;
    }
    static receiveMessage(data, fromPeer) {
      if (!data || data.type !== 'automation_settings') return false;
      const state = AutomationManager.state();
      if (typeof MultiplayerManager === 'undefined' || !state || !MultiplayerManager.connected) return true;
      const tag = data.country;
      if (!AutomationManager.validTag(tag) || tag === state.country) return true; // 自国設定は remote から上書きしない
      if (MultiplayerManager.isHost) {
        const assigned = (MultiplayerManager.remoteCountries || {})[fromPeer]
          || (state.strategy && state.strategy.peers ? state.strategy.peers[fromPeer] : null)
          || AutomationManager.lobbyTag(fromPeer);
        if (assigned !== tag) return true; // 他国になりすました設定は破棄
        if (!AutomationManager.mergeRemote(data, tag)) return true;
        const clean = AutomationManager.message(tag, state);
        try { MultiplayerManager.broadcast(clean); } catch (error) { /* noop */ }
      } else {
        if (fromPeer !== MultiplayerManager.roomId) return true; // ゲストはホスト経由だけ信頼
        AutomationManager.mergeRemote(data, tag);
      }
      return true;
    }
    static lobbyTag(peerId) {
      try {
        if (typeof MPHub === 'undefined') return null;
        const pid = MPHub.peerToPlayer ? MPHub.peerToPlayer[peerId] : null;
        const roster = typeof MPHub.roster === 'function' ? MPHub.roster() : null;
        const entry = roster && roster.players ? roster.players[pid || peerId] : null;
        return entry ? entry.tag : null;
      } catch (error) { return null; }
    }

    // ---------- 初期化 / メインループ ----------
    static init(state) {
      const s = state || AutomationManager.state();
      if (!s) return null;
      AutomationManager.ensureCountry(s.country, s);
      AutomationManager.started = true;
      AutomationManager.lastCountry = s.country;
      AutomationManager.installWindow();
      AutomationManager.renderAll();
      if (!AutomationManager.tickRegistered && typeof CoreEngine !== 'undefined' && typeof CoreEngine.registerTickCallback === 'function') {
        CoreEngine.registerTickCallback(() => AutomationManager.onTick());
        AutomationManager.tickRegistered = true;
      }
      return AutomationManager;
    }
    static onCountryChanged(tag) {
      AutomationManager.lastCountry = tag || null;
      AutomationManager.renderAll();
    }
    static dayNumber(state) {
      const d = state && state.date instanceof Date ? state.date : new Date();
      return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    }
    static onTick(force = false) {
      const state = AutomationManager.state();
      if (!AutomationManager.started || !state) return;
      if (state.paused && !force) return;
      const tag = state.country;
      const record = AutomationManager.ensureCountry(tag, state);
      if (!record) return;
      if (AutomationManager.lastCountry !== tag) {
        AutomationManager.lastCountry = tag;
        AutomationManager.renderAll();
      }
      // 他国レコードは走査しない。自国の有効フラグだけを実行する。
      KEYS.forEach(key => {
        if (record.automation[key] !== true) return;
        try {
          AutomationManager.runFeature(key, state, record);
        } catch (error) {
          const day = AutomationManager.dayNumber(state);
          const errKey = tag + ':' + key;
          if (AutomationManager.errors[errKey] !== day) {
            AutomationManager.errors[errKey] = day;
            console.warn('[AutomationManager] ' + key + ' failed:', error);
          }
        }
      });
    }
    static runFeature(key, state, record) {
      const day = AutomationManager.dayNumber(state);
      const meta = record.automationMeta;
      const cooldown = { production: 1, design: 7, division: 30, recruitment: 1 }[key] || 0;
      if (cooldown && meta.lastRun[key] != null && day - meta.lastRun[key] < cooldown) return;
      let acted = false;
      if (key === 'focus') acted = AutomationManager.autoFocus(state, record);
      else if (key === 'research') acted = AutomationManager.autoResearch(state, record);
      else if (key === 'production') acted = AutomationManager.autoProduction(state, record);
      else if (key === 'design') acted = AutomationManager.autoDesign(state, record);
      else if (key === 'division') acted = AutomationManager.autoDivision(state, record);
      else if (key === 'recruitment') acted = AutomationManager.autoRecruitment(state, record);
      if (cooldown) meta.lastRun[key] = day;
      if (acted) AutomationManager.renderAll();
    }
    static note(record, key, message) {
      if (!record || !record.automationMeta) return;
      const log = record.automationMeta.log;
      const state = AutomationManager.state();
      const date = state && state.date instanceof Date ? state.date.toISOString().slice(0, 10) : '';
      log.unshift({ key, message, date });
      if (log.length > 12) log.length = 12;
      try { if (typeof CoreEngine !== 'undefined' && CoreEngine.log) CoreEngine.log('🤖 ' + message); } catch (error) { /* noop */ }
    }
    static notify(message, type) {
      try { if (typeof GameUI !== 'undefined' && GameUI.notify) GameUI.notify(message, type || 'info'); } catch (error) { /* noop */ }
    }

    // ---------- 1) 国家方針 ----------
    static focusHasMilitaryReward(focus) {
      if (!focus) return true;
      let rewards = [];
      try {
        if (typeof FocusTreeManager !== 'undefined' && typeof FocusTreeManager.normalizeCompletionRewards === 'function') {
          rewards = FocusTreeManager.normalizeCompletionRewards(focus);
        }
      } catch (error) { rewards = []; }
      if (rewards.some(reward => reward && BLOCKED_REWARD_TYPES.has(String(reward.type || '').toLowerCase()))) return true;
      const text = [focus.effect, focus.completion_reward, focus.completion_rewards, focus.desc, focus.description]
        .map(value => typeof value === 'string' ? value : '').join(' ');
      return BLOCKED_EFFECT_RE.test(text);
    }
    static autoFocus(state) {
      if (typeof FocusTreeManager === 'undefined') return false;
      const manager = FocusTreeManager;
      if (manager.currentCountry !== state.country) return false;
      if (manager.autocomplete || manager.noChecks) return false; // チートモードは利用しない
      if (!Array.isArray(manager.focuses) || !manager.focuses.length || manager.activeFocus) return false;
      const candidates = manager.focuses.filter(focus => {
        if (!focus || !focus.id) return false;
        if (typeof manager.getFocusBlockReason === 'function' && manager.getFocusBlockReason(focus)) return false;
        if (typeof manager.isFocusAvailable === 'function' && !manager.isFocusAvailable(focus)) return false;
        return !AutomationManager.focusHasMilitaryReward(focus);
      });
      if (!candidates.length) return false;
      candidates.sort((a, b) => {
        const ai = f => finite(f.ai_will_do && (f.ai_will_do.factor ?? f.ai_will_do), finite(f.ai_will_do, 0));
        return ai(b) - ai(a) || finite(a.cost, 70) - finite(b.cost, 70) || String(a.id).localeCompare(String(b.id));
      });
      const chosen = candidates[0];
      manager.selectFocus(chosen.id);
      const record = AutomationManager.ensureCountry(state.country, state);
      AutomationManager.note(record, 'focus', '国家方針「' + (manager.localizedTitle ? manager.localizedTitle(chosen) : chosen.id) + '」を開始しました。');
      return true;
    }

    // ---------- 2) 研究 ----------
    static researchCandidates(state) {
      const manager = ResearchManager;
      const active = new Set(Object.values(manager.researching || {}).map(slot => slot && slot.techId).filter(Boolean));
      const out = [];
      Object.values(manager.techData || {}).forEach(list => {
        (Array.isArray(list) ? list : []).forEach(tech => {
          if (!tech || !tech.id || manager.researchedTech.has(tech.id) || active.has(tech.id)) return;
          if (Array.isArray(tech.prerequisites) && !tech.prerequisites.every(id => manager.researchedTech.has(id))) return;
          const penalty = manager.researchPenalty ? manager.researchPenalty(tech) : { percent: 0 };
          if (finite(penalty.percent) > 50) return; // 初心者アシストは極端な先取りを避ける
          out.push({ tech, penalty: finite(penalty.percent) });
        });
      });
      const priority = tech => {
        const id = String(tech.id || '');
        const cats = Array.isArray(tech.categories) ? tech.categories.join(' ') : String(tech.category || '');
        if (/industry|construction|production|machine|synthetic|excavation|電子|工業|建設/.test(id + cats)) return 0;
        if (/infantry|weapon|artillery|support|engine|radio|歩兵|火砲|支援/.test(id + cats)) return 1;
        if (/doctrine|land_doctrine|ドクトリン/.test(id + cats)) return 2;
        if (/tank|armor|fighter|airframe|ship|naval|戦車|航空|艦/.test(id + cats)) return 3;
        return 4;
      };
      out.sort((a, b) => priority(a.tech) - priority(b.tech)
        || a.penalty - b.penalty
        || finite(a.tech.research_time, 100) - finite(b.tech.research_time, 100)
        || String(a.tech.id).localeCompare(String(b.tech.id)));
      return out.map(entry => entry.tech);
    }
    static autoResearch(state) {
      if (typeof ResearchManager === 'undefined') return false;
      const manager = ResearchManager;
      if (manager.currentCountry && manager.currentCountry !== state.country) return false;
      const slots = clamp(Math.floor(finite(state.researchSlots, 3)), 1, 5);
      const empty = [];
      for (let i = 1; i <= slots; i++) if (!manager.researching || !manager.researching[i]) empty.push(i);
      if (!empty.length) return false;
      const candidates = AutomationManager.researchCandidates(state);
      if (!candidates.length) return false;
      let acted = false;
      for (const slot of empty) {
        const tech = candidates.shift();
        if (!tech) break;
        const before = manager.researching && manager.researching[slot];
        manager.selectTech(tech);
        if (!before && manager.researching && manager.researching[slot]) {
          acted = true;
          const record = AutomationManager.ensureCountry(state.country, state);
          AutomationManager.note(record, 'research', '研究スロット' + slot + 'に「' + (tech.title || tech.id) + '」を設定しました。');
        }
      }
      return acted;
    }

    // ---------- 3) 生産 ----------
    static equipmentDemand(state) {
      const need = {};
      const add = (obj, mult = 1) => Object.entries(obj || {}).forEach(([key, value]) => { need[key] = finite(need[key]) + finite(value) * mult; });
      try {
        if (typeof DivisionDesigner !== 'undefined' && typeof TrainingManager !== 'undefined') {
          const comp = DivisionDesigner.activeComposition ? DivisionDesigner.activeComposition() : null;
          const req = comp ? TrainingManager.requirements(comp) : null;
          if (req) add(req.equipmentNeeds, 2); // 次に編成する師団の最低備蓄
        }
      } catch (error) { /* noop */ }
      try { if (typeof TrainingLogistics !== 'undefined' && TrainingLogistics.demand) add(TrainingLogistics.demand()); } catch (error) { /* noop */ }
      return need;
    }
    static autoProduction(state) {
      if (typeof ProductionManager === 'undefined' || !state.strategy) return false;
      const manager = ProductionManager;
      if (typeof manager.ensure === 'function') manager.ensure();
      const account = manager.account(state.country);
      const stock = account.stock || {};
      const demand = AutomationManager.equipmentDemand(state);
      const lines = state.strategy.production || (state.strategy.production = []);
      const managedLand = ['infantry', 'infantry_2', 'artillery', 'artillery_2', 'support_equipment', 'tank', 'tank_2', 'fighter', 'fighter_2'];
      const managedSea = ['convoys', 'destroyer', 'submarine'];
      const unlocked = type => typeof manager.isUnlocked === 'function' && manager.isUnlocked(type);
      const stockOf = type => (manager.inventoryTypes ? manager.inventoryTypes(type) : [type]).reduce((sum, key) => sum + finite(stock[key]), 0);
      const deficit = type => Math.max(0, finite(demand[type]) - stockOf(type));
      let changed = false;

      const allocatePool = (types, pool) => {
        const capacity = Math.max(0, Math.floor(finite(manager.capacity ? manager.capacity(pool) : (pool === 'dockyard' ? state.dockyards : state.militaryFactories))));
        const availableTypes = types.filter(unlocked);
        if (!availableTypes.length || capacity <= 0) return;
        const unmanagedUsed = lines.filter(line => line && !types.includes(line.type) && manager.CATALOG[line.type] && manager.CATALOG[line.type].pool === pool)
          .reduce((sum, line) => sum + Math.max(0, Math.floor(finite(line.factories))), 0);
        let free = Math.max(0, capacity - unmanagedUsed);
        if (free <= 0) return;
        const weights = availableTypes.map(type => {
          const base = pool === 'dockyard' ? 1 : 2;
          return { type, weight: base + Math.min(20, deficit(type) / 100) };
        });
        // 歩兵装備が完全に止まらないように最低1工場を確保する。
        if (pool === 'military' && availableTypes.includes('infantry') && free >= availableTypes.length) {
          weights.find(w => w.type === 'infantry').weight += 4;
        }
        const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0) || 1;
        const allocation = new Map();
        let assigned = 0;
        weights.forEach(item => {
          const n = Math.floor(free * item.weight / totalWeight);
          allocation.set(item.type, n);
          assigned += n;
        });
        weights.sort((a, b) => b.weight - a.weight);
        for (let i = 0; assigned < free && weights.length; i = (i + 1) % weights.length) {
          const type = weights[i].type;
          allocation.set(type, allocation.get(type) + 1);
          assigned++;
        }
        availableTypes.forEach(type => {
          if (!lines.some(line => line.type === type)) {
            if (typeof manager.addLine === 'function') manager.addLine(type);
            else lines.push({ type, factories: 0, progress: 0, produced: 0, priority: 0 });
          }
        });
        availableTypes.forEach(type => {
          const target = allocation.get(type) || 0;
          const line = lines.find(item => item.type === type);
          if (!line || Math.floor(finite(line.factories)) === target) return;
          if (typeof manager.allocate === 'function') {
            if (manager.allocate(type, target)) changed = true;
          } else { line.factories = target; changed = true; }
        });
      };
      allocatePool(managedLand, 'military');
      allocatePool(managedSea, 'dockyard');
      if (changed) {
        const record = AutomationManager.ensureCountry(state.country, state);
        AutomationManager.note(record, 'production', '不足装備に合わせて工場・造船所を再配分しました。');
      }
      return changed;
    }

    // ---------- 4) 装備設計 ----------
    static researchReady(state) {
      if (typeof ResearchManager === 'undefined') return false;
      if (ResearchManager.currentCountry && ResearchManager.currentCountry !== state.country) return false;
      const data = ResearchManager.techData;
      return !!(data && typeof data === 'object' && Object.keys(data).length > 0);
    }
    static moduleScore(cat, option) {
      if (!option || option.id === 'none') return 0;
      const attack = finite(option.attack) + finite(option.soft) * 0.7 + finite(option.hard);
      const defense = finite(option.defense) + finite(option.armor) * 0.6;
      const mobility = finite(option.speed) * (cat === 'plane' ? 3 : 1.5) + finite(option.engineCapacity);
      const reliability = finite(option.reliability) * 0.6;
      const penalty = finite(option.cost) * 0.25 + finite(option.weight) * 2.5 + finite(option.piercing) * -0.05;
      return attack * 1.2 + defense + mobility + reliability - penalty;
    }
    static bestDesignDraft(cat) {
      if (typeof EquipmentDesigner === 'undefined') return null;
      const designer = EquipmentDesigner;
      const data = designer.DATA && designer.DATA[cat];
      if (!data || !Array.isArray(data.hulls)) return null;
      const unlocked = option => typeof designer.isUnlocked === 'function' ? designer.isUnlocked(option) : true;
      const compatible = (hull, option) => typeof designer.isModuleCompatible === 'function' ? designer.isModuleCompatible(cat, hull, option) : true;
      const hulls = data.hulls.filter(unlocked);
      let best = null;
      hulls.forEach(hull => {
        const modules = {};
        let valid = true;
        data.slots.forEach(slot => {
          const options = (slot.options || []).filter(option => option.id !== 'none' && unlocked(option) && compatible(hull, option));
          options.sort((a, b) => AutomationManager.moduleScore(cat, b) - AutomationManager.moduleScore(cat, a));
          const chosen = options[0];
          if (chosen && (slot.required || AutomationManager.moduleScore(cat, chosen) > 0)) modules[slot.id] = chosen.id;
          else if (slot.required) valid = false;
          else modules[slot.id] = '';
        });
        if (!valid) return;
        const draft = { hull: hull.id, modules, name: 'AI ' + hull.name };
        const backupDraft = designer.draft ? designer.draft[cat] : undefined;
        const backupCategory = designer.category;
        try {
          if (!designer.draft) designer.draft = {};
          designer.draft[cat] = draft;
          designer.category = cat;
          const validation = typeof designer.validation === 'function' ? designer.validation(cat) : { valid: true };
          if (!validation || validation.valid !== true) return;
          const stats = typeof designer.stats === 'function' ? designer.stats(cat) : null;
          if (!stats || finite(stats.overload) > 0) return;
          const score = finite(stats.overall) + finite(stats.reliability) * 0.2 - finite(stats.cost) * 0.05;
          if (!best || score > best.score) best = { cat, draft, score, fingerprint: hull.id + '|' + data.slots.map(slot => modules[slot.id] || '-').join(',') };
        } finally {
          if (designer.draft) {
            if (backupDraft === undefined) delete designer.draft[cat];
            else designer.draft[cat] = backupDraft;
          }
          designer.category = backupCategory;
        }
      });
      return best;
    }
    static autoDesign(state) {
      if (typeof EquipmentDesigner === 'undefined') return false;
      if (!AutomationManager.researchReady(state)) return false; // 研究データ未読込時のプレビュー解放で設計しない
      const designer = EquipmentDesigner;
      if (typeof designer.saveDesign !== 'function') return false;
      const record = AutomationManager.ensureCountry(state.country, state);
      const meta = record.automationMeta;
      if (!meta.designs) meta.designs = {};
      const categories = ['tank', 'plane', 'ship'];
      for (const cat of categories) {
        const candidate = AutomationManager.bestDesignDraft(cat);
        if (!candidate) continue;
        const cost = typeof designer.xpCost === 'function' ? designer.xpCost(cat) : 20;
        const xp = typeof designer.xpAvailable === 'function' ? designer.xpAvailable(cat) : finite(state.xp && state.xp[(designer.DATA[cat] || {}).xpKey]);
        if (xp < cost) continue;
        const existing = (designer.designs || []).filter(design => design && design.cat === cat);
        const bestExisting = existing.reduce((max, design) => Math.max(max, finite(design.performance && design.performance.overall, finite(design.stats && design.stats.overall))), -Infinity);
        if (meta.designs[cat] === candidate.fingerprint) continue;
        if (existing.length && candidate.score <= bestExisting + 1) continue;
        const backupDraft = designer.draft ? designer.draft[cat] : undefined;
        const backupCategory = designer.category;
        let saved = null;
        try {
          if (!designer.draft) designer.draft = {};
          designer.draft[cat] = clone(candidate.draft);
          designer.category = cat;
          saved = designer.saveDesign();
        } finally {
          if (designer.draft) {
            if (backupDraft === undefined) delete designer.draft[cat];
            else designer.draft[cat] = backupDraft;
          }
          designer.category = backupCategory;
        }
        if (saved) {
          saved.country = state.country;
          saved.automated = true;
          meta.designs[cat] = candidate.fingerprint;
          AutomationManager.note(record, 'design', (designer.DATA[cat] ? designer.DATA[cat].label : cat) + 'の自動設計「' + saved.name + '」を保存しました。');
          return true; // XPを一度に使い切らないよう、1回の処理で1設計だけ
        }
      }
      return false;
    }

    // ---------- 5) 師団テンプレート ----------
    static armyXp(state) {
      if (state.xp && Number.isFinite(Number(state.xp.army))) return Number(state.xp.army);
      return finite(state.armyExperience);
    }
    static spendArmyXp(state, amount) {
      if (state.xp && Number.isFinite(Number(state.xp.army))) state.xp.army = Math.max(0, Number(state.xp.army) - amount);
      if (Number.isFinite(Number(state.armyExperience))) state.armyExperience = Math.max(0, Number(state.armyExperience) - amount);
    }
    static autoDivision(state) {
      if (typeof DivisionDesigner === 'undefined') return false;
      const designer = DivisionDesigner;
      if (designer.currentCountry && designer.currentCountry !== state.country) return false;
      if (designer.dirty) return false; //  players の下書きは絶対に上書きしない
      try { if (typeof WindowManager !== 'undefined' && WindowManager.isOpen && WindowManager.isOpen('division')) return false; } catch (error) { /* noop */ }
      const template = typeof designer.activeTemplate === 'function' ? designer.activeTemplate() : null;
      if (!template || !Array.isArray(template.support)) return false;
      const xp = AutomationManager.armyXp(state);
      const cost = 5;
      if (xp < cost) return false;
      const record = AutomationManager.ensureCountry(state.country, state);
      const meta = record.automationMeta;
      const priority = ['engineer', 'recon', 'support_artillery', 'logistics', 'maintenance', 'signal', 'field_hospital', 'support_anti_air', 'support_anti_tank'];
      const candidate = clone(template);
      let added = null;
      for (const id of priority) {
        if (candidate.support.includes(id)) continue;
        const emptyIndex = candidate.support.findIndex(slot => !slot);
        if (emptyIndex < 0) break;
        const def = typeof designer.def === 'function' ? designer.def(id) : null;
        if (!def || def.category !== 'support') continue;
        candidate.support[emptyIndex] = id;
        added = id;
        break;
      }
      // 旧式騎兵は歩兵へ置き換える（編成枠は増やさない）。
      if (!added) {
        outer: for (let y = 0; y < candidate.grid.length; y++) {
          for (let x = 0; x < candidate.grid[y].length; x++) {
            if (candidate.grid[y][x] === 'cavalry') { candidate.grid[y][x] = 'infantry'; added = 'infantry'; break outer; }
          }
        }
      }
      if (!added) return false;
      const fingerprint = JSON.stringify(candidate.grid) + '|' + candidate.support.join(',');
      if (meta.divisionFingerprint === fingerprint) return false;
      if (typeof designer.stats === 'function' && typeof designer.validate === 'function') {
        const stats = designer.stats(candidate);
        const validation = designer.validate(candidate, stats);
        if (!validation || validation.ok !== true) return false;
      }
      const index = designer.templates.findIndex(item => item.id === template.id);
      if (index < 0) return false;
      AutomationManager.spendArmyXp(state, cost);
      designer.templates[index] = candidate;
      if (typeof designer.persist === 'function') designer.persist();
      meta.divisionFingerprint = fingerprint;
      const def = typeof designer.def === 'function' ? designer.def(added) : null;
      AutomationManager.note(record, 'division', 'テンプレート「' + template.name + '」を改良しました（' + (def ? def.name : added) + ' / 陸軍XP -' + cost + '）。');
      return true;
    }

    // ---------- 6) 徴兵・配置 ----------
    static autoRecruitment(state) {
      if (typeof TrainingManager === 'undefined' || typeof ProductionManager === 'undefined') return false;
      if (!state.strategy || !Array.isArray(TrainingManager.queue)) return false;
      const maxQueue = Math.min(10, typeof TrainingLogistics !== 'undefined' ? finite(TrainingLogistics.MAX_QUEUE, 10) : 10);
      if (TrainingManager.queue.length >= Math.min(maxQueue, 5)) return false; // 自動化は控えめに最大5件
      const template = typeof DivisionDesigner !== 'undefined' && typeof DivisionDesigner.activeTemplate === 'function' ? DivisionDesigner.activeTemplate() : null;
      const comp = template && typeof DivisionDesigner.compositionOf === 'function' ? DivisionDesigner.compositionOf(template) : { infantry: 6 };
      const req = TrainingManager.requirements(comp);
      if (!req || !req.count) return false;
      if (['ranger', 'mountaineer', 'paratrooper', 'marine'].some(key => req.comp[key]) && typeof ArmyRoster !== 'undefined' && ArmyRoster.specialCount && ArmyRoster.specialCount() >= 5) return false;
      if (finite(state.manpower) < req.manpowerNeed) return false;
      if (typeof ProductionManager.canConsume === 'function' && !ProductionManager.canConsume(req.equipmentNeeds || {})) return false;
      let stateId = null;
      try {
        if (typeof TrainingLogistics !== 'undefined' && TrainingLogistics.coreStates) stateId = (TrainingLogistics.coreStates()[0] || [])[0];
      } catch (error) { /* noop */ }
      if (!stateId && TrainingManager.availableTrainingStates) stateId = (TrainingManager.availableTrainingStates()[0] || [])[0];
      if (!stateId || (TrainingManager.trainingProvince && !TrainingManager.trainingProvince(String(stateId)))) return false;
      const before = TrainingManager.queue.length;
      // 配属先は常に null。前線・軍集団への自動配属は行わない。
      TrainingManager.recruit({ targetArmyId: null, trainingStateId: String(stateId), template });
      if (TrainingManager.queue.length <= before) return false;
      const record = AutomationManager.ensureCountry(state.country, state);
      AutomationManager.note(record, 'recruitment', '兵員・装備が揃ったため「' + (template ? template.name : '歩兵師団') + '」の訓練を開始しました（配置は予備）。');
      return true;
    }

    // ---------- UI ----------
    static installWindow() {
      try {
        if (typeof GameTools !== 'undefined' && typeof GameTools.window === 'function') {
          GameTools.window('automation', '🤖 AIアシスト', () => AutomationManager.renderWindow(), 760);
        }
      } catch (error) { /* noop */ }
    }
    static toggleHtml(tag, context) {
      const settings = AutomationManager.settings(tag);
      return FEATURES.map(feature => {
        const id = 'automation-' + context + '-' + feature.key;
        const checked = settings[feature.key] ? ' checked' : '';
        const handler = context === 'start'
          ? 'AutomationManager.setLocalFeature(\'' + feature.key + '\', this.checked, StartScreen.selected)'
          : 'AutomationManager.setLocalFeature(\'' + feature.key + '\', this.checked)';
        return '<label class="automation-option" for="' + id + '">' +
          '<input type="checkbox" id="' + id + '" data-automation-key="' + feature.key + '"' + checked + ' onchange="' + handler + '">' +
          '<span class="automation-option-icon" aria-hidden="true">' + feature.icon + '</span>' +
          '<span class="automation-option-text"><strong>' + escapeHtml(feature.label) + '</strong><small>' + escapeHtml(feature.desc) + '</small></span>' +
          '<span class="automation-switch" aria-hidden="true"></span></label>';
      }).join('');
    }
    static renderStartOptions(tag) {
      const box = document.getElementById('start-automation-options');
      const label = document.getElementById('start-automation-country');
      if (!box) return;
      if (!AutomationManager.validTag(tag)) {
        box.innerHTML = '<p class="automation-empty">国家を選択すると、国ごとにAIアシストを設定できます。</p>';
        if (label) label.textContent = '設定は選択した国家ごとに保存されます。';
        return;
      }
      AutomationManager.ensureCountry(tag);
      if (label) label.textContent = tag + ' のAIアシスト設定（この国だけに適用）';
      box.innerHTML = AutomationManager.toggleHtml(tag, 'start');
    }
    static renderWindow() {
      const el = document.getElementById('automation-content');
      if (!el) return;
      const state = AutomationManager.state();
      if (!state) { el.innerHTML = '<p>ゲームが初期化されていません。</p>'; return; }
      const tag = state.country;
      const record = AutomationManager.ensureCountry(tag, state);
      const enabled = KEYS.filter(key => record.automation[key]).length;
      const log = (record.automationMeta.log || []).slice(0, 8);
      el.innerHTML =
        '<div class="automation-window">' +
        '<div class="automation-window-head"><div><h3>🤖 AIアシスト — ' + escapeHtml(tag) + '</h3>' +
        '<p>必要な項目だけONにできます。設定はこの国専用で、セーブ・マルチプレイに同期されます。</p></div>' +
        '<span class="automation-count">' + enabled + ' / ' + KEYS.length + ' 有効</span></div>' +
        '<div class="automation-presets"><button type="button" class="automation-btn" onclick="AutomationManager.preset(null, true)">おすすめをすべてON</button>' +
        '<button type="button" class="automation-btn ghost" onclick="AutomationManager.preset(null, false)">すべてOFF</button></div>' +
        '<div class="automation-grid">' + AutomationManager.toggleHtml(tag, 'game') + '</div>' +
        '<div class="automation-manual-note"><strong>⚔️ 軍事作戦は常に手動です</strong><span>前線の作成、攻撃線、師団の移動、攻撃、上陸・空挺はAIアシストの対象外です。国家方針も戦争・併合・侵攻につながるものは自動選択しません。</span></div>' +
        '<section class="automation-log"><h4>最近の自動処理</h4>' +
        (log.length ? '<ul>' + log.map(entry => '<li><span>' + escapeHtml(entry.date || '') + '</span>' + escapeHtml(entry.message) + '</li>').join('') + '</ul>' : '<p>まだ自動処理はありません。</p>') +
        '</section></div>';
    }
    static renderAll() {
      try {
        const state = AutomationManager.state();
        if (!AutomationManager.started && typeof StartScreen !== 'undefined' && StartScreen.selected) {
          AutomationManager.renderStartOptions(StartScreen.selected);
        }
        if (AutomationManager.started) AutomationManager.renderWindow();
        if (state && typeof AlertManager !== 'undefined' && AlertManager.instance && typeof AlertManager.instance.requestUpdate === 'function') {
          AlertManager.instance.requestUpdate();
        }
      } catch (error) { /* noop */ }
    }
  }

  if (typeof window !== 'undefined') window.AutomationManager = AutomationManager;
})();
