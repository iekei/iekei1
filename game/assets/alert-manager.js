/* alert-manager.js — HOI4風「重要事項アラート」
 *
 * game/index.html 専用。CoreEngine.gameState と既存の各Managerを読み取り専用で
 * 評価し、画面上部のアラート列を増分更新する。ゲーム状態やセーブデータは変更しない。
 *
 * 組み込み: initGame() の全Manager初期化後に AlertManager.init() を呼ぶ。
 * - CoreEngine.registerTickCallback() で毎Tickに変更通知を受け取る
 * - 高速Tickでも評価は最大4回/秒に間引く（DOM再描画はアクティブ項目の差分のみ）
 * - 一時停止中も250ms間隔で監視し、画面操作・セーブロード直後の解消を反映する
 */
(function () {
  'use strict';

  const SEVERITY_LABEL = { critical: '重要', warning: '推奨' };
  const NUMBER = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });

  // 表示用の短縮ラベルとインラインSVG。外部画像・ネットワーク読み込みは不要。
  const DEFINITIONS = [
    { id: 'focus', label: '国家方針', icon: '<path d="M5 21V4m0 1h11l-2 3 2 3H5"/><path d="M3 21h6"/>' },
    { id: 'research', label: '研究', icon: '<path d="M9 3h6m-5 0v6l-5 8a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-8V3"/><path d="M7.5 14h9"/>' },
    { id: 'factories', label: '工場', icon: '<path d="M3 21V9l6 3V9l6 3V5h6v16Z"/><path d="M6 17h1m4 0h1m4 0h1"/>' },
    { id: 'training', label: '訓練', icon: '<path d="M4 14a8 8 0 0 1 16 0"/><path d="M2 14h20v3H2Z"/><path d="M12 6v8m-4 7h8"/>' },
    { id: 'obsolete', label: '旧式兵器', icon: '<path d="M20 7a8 8 0 0 0-14-2L4 7"/><path d="M4 3v4h4"/><path d="M4 17a8 8 0 0 0 14 2l2-2"/><path d="M20 21v-4h-4"/><circle cx="12" cy="12" r="2.5"/>' },
    { id: 'unassigned', label: '未配置', icon: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 8h4m-2-2v4m-2 10v-2a5 5 0 0 1 4-4.9"/>' },
    { id: 'decisions', label: '決断', icon: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6m-6 4h6m-6 4h3"/>' },
    { id: 'shortage', label: '装備不足', icon: '<path d="M12 3 2.5 20h19Z"/><path d="M12 9v5m0 3v.5"/>' }
  ];
  const DEF_BY_ID = Object.fromEntries(DEFINITIONS.map(d => [d.id, d]));

  // 同種兵器の世代関係。ProductionManager.CATALOG に実在する型だけを使う。
  const UPGRADES = {
    rifle_old: 'infantry',
    infantry: 'infantry_2',
    artillery: 'artillery_2',
    tank: 'tank_2',
    fighter: 'fighter_2'
  };

  const finite = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const nonNegative = value => Math.max(0, finite(value));
  const escapeText = value => String(value ?? '');

  class AlertManager {
    static instance = null;
    static DEFINITIONS = DEFINITIONS;
    static UPGRADES = UPGRADES;

    /** ゲーム起動時に一度だけ呼ぶ。同じstateへの再呼び出しは多重登録しない。 */
    static init(state) {
      if (AlertManager.instance && !AlertManager.instance.destroyed &&
          (!state || AlertManager.instance.state === state)) {
        AlertManager.instance.requestUpdate();
        return AlertManager.instance;
      }
      if (AlertManager.instance) AlertManager.instance.destroy();
      const manager = new AlertManager(state || CoreEngine.gameState);
      AlertManager.instance = manager;
      manager.start();
      return manager;
    }

    constructor(state, options = {}) {
      this.state = state;
      this.intervalMs = Math.max(50, finite(options.intervalMs, 250));
      this.now = options.now || (() => Date.now());
      this.active = new Map();
      this.entries = new Map();
      this.failedRules = new Set();
      this.destroyed = false;
      this.pending = null;
      this.timer = null;
      this.lastUpdate = -Infinity;
      this.tooltipId = null;
      this.lastAnnouncement = null;
      this.container = options.container || document.getElementById('alert-container');
      this.list = options.list || document.getElementById('alert-list');
      this.totalEl = document.getElementById('alert-total');
      this.emptyEl = document.getElementById('alert-empty');
      this.announcer = document.getElementById('alert-announcer');
      this.tooltip = null;
      this._handlers = [];
      this._tickHandler = () => this.requestUpdate();
      this._pollHandler = () => this.requestUpdate();
      this._visibilityHandler = () => { if (!document.hidden) this.requestUpdate(); };
    }

    /* ---------------- 起動・監視 ---------------- */

    start() {
      if (!this.container || !this.list) return;
      this._buildTooltip();
      this._bindUI();
      this.container.hidden = false;
      this.update();
      if (typeof CoreEngine !== 'undefined' && CoreEngine.registerTickCallback) {
        CoreEngine.registerTickCallback(this._tickHandler);
      }
      this.timer = setInterval(this._pollHandler, this.intervalMs);
      this._listen(document, 'visibilitychange', this._visibilityHandler);
      this._listen(window, 'resize', () => this.hideTooltip());
      this._listen(window, 'blur', () => this.hideTooltip());
      this._listen(document, 'scroll', () => this.hideTooltip(), true);
      this._listen(document, 'keydown', event => {
        if (event.key === 'Escape') this.hideTooltip();
      });
    }

    destroy() {
      this.destroyed = true;
      if (this.pending !== null) clearTimeout(this.pending);
      if (this.timer !== null) clearInterval(this.timer);
      this.pending = null;
      this.timer = null;
      this.hideTooltip();
      for (const [target, type, handler, capture] of this._handlers) {
        target.removeEventListener(type, handler, capture);
      }
      this._handlers = [];
      for (const { button } of this.entries.values()) button.remove();
      this.entries.clear();
      this.active.clear();
      if (this.tooltip) this.tooltip.remove();
      if (this.container) this.container.hidden = true;
      if (this.announcer) this.announcer.textContent = '';
      if (AlertManager.instance === this) AlertManager.instance = null;
    }

    /** 毎Tick / 定期監視の入口。高頻度呼び出しは1件に合流させる。 */
    requestUpdate() {
      if (this.destroyed || this.pending !== null || document.hidden) return;
      const wait = Math.max(0, this.intervalMs - (this.now() - this.lastUpdate));
      this.pending = setTimeout(() => {
        this.pending = null;
        if (!this.destroyed && !document.hidden) this.update();
      }, wait);
    }

    /** stateを評価してUIを差分更新する。テストや画面操作から直接呼んでもよい。 */
    update() {
      if (this.destroyed) return [];
      this.lastUpdate = this.now();
      const alerts = this.evaluate(this.state);
      this.render(alerts);
      return alerts;
    }

    /** 8条件を独立評価する。1条件の失敗が他の通知を巻き込まないようにする。 */
    evaluate(state = this.state) {
      if (!state || !state.strategy || !state.country) return [];
      const checks = [
        ['focus', () => this.checkFocus(state)],
        ['research', () => this.checkResearch(state)],
        ['factories', () => this.checkFactories(state)],
        ['training', () => this.checkTraining(state)],
        ['obsolete', () => this.checkObsolete(state)],
        ['unassigned', () => this.checkUnassigned(state)],
        ['decisions', () => this.checkDecisions(state)],
        ['shortage', () => this.checkShortage(state)]
      ];
      const result = [];
      for (const [id, check] of checks) {
        try {
          const alert = check();
          if (alert && alert.count > 0) result.push({ id, ...alert });
        } catch (error) {
          if (!this.failedRules.has(id)) {
            this.failedRules.add(id);
            console.error('[AlertManager] ' + id + ' の評価に失敗しました:', error);
          }
        }
      }
      return result;
    }

    makeAlert(id, severity, count, title, details, actionLabel, screen, payload = {}) {
      return { id, severity, count: Math.max(0, Math.floor(count)), title, details, actionLabel, screen, payload };
    }

    /* ---------------- 1. 国家方針 ---------------- */

    checkFocus(state) {
      if (typeof FocusTreeManager === 'undefined') return null;
      const mgr = FocusTreeManager;
      // 選択国のツリー読み込み完了前に「未設定」と誤通知しない。
      if (mgr.currentCountry !== state.country || !mgr.focuses?.length) return null;
      if (mgr.activeFocus) return null;
      const available = mgr.focuses.filter(f => !mgr.getFocusBlockReason(f)).length;
      // 全完了・排他ロックなどで選択できる方針が無い場合は操作不能な通知を出さない。
      if (!available) return null;
      return this.makeAlert('focus', 'warning', 1, '国家方針が未設定です',
        ['進行中の国家方針がありません。', '選択可能な方針: ' + available + '件'],
        '国家方針ツリーを開く', 'focus');
    }

    /* ---------------- 2. 研究枠 ---------------- */

    checkResearch(state) {
      if (typeof ResearchManager === 'undefined') return null;
      const mgr = ResearchManager;
      if (!mgr.techData || !Object.keys(mgr.techData).length) return null;
      const slots = Math.max(0, Math.min(5, Math.floor(nonNegative(state.researchSlots))));
      let free = 0;
      for (let i = 1; i <= slots; i++) if (!mgr.researching?.[i]) free++;
      if (!free) return null;
      const researched = mgr.researchedTech || new Set();
      const hasCandidate = Object.values(mgr.techData).some(list =>
        (list || []).some(tech => !researched.has(tech.id) &&
          (tech.prerequisites || []).every(id => researched.has(id))));
      if (!hasCandidate) return null;
      return this.makeAlert('research', 'warning', free, '研究枠が空いています',
        ['使用可能な研究スロット: ' + slots + ' / 空き: ' + free,
          '新しい技術の研究を開始できます。'],
        '研究画面を開く', 'research');
    }

    /* ---------------- 3. 未割り当て工場・造船所 ---------------- */

    productionLines(state) {
      return Array.isArray(state.strategy?.production) ? state.strategy.production : [];
    }

    checkFactories(state) {
      if (typeof ProductionManager === 'undefined') return null;
      const assigned = { military: 0, dockyard: 0 };
      for (const line of this.productionLines(state)) {
        const def = ProductionManager.CATALOG[line?.type];
        if (!def || !Object.prototype.hasOwnProperty.call(assigned, def.pool)) continue;
        assigned[def.pool] += nonNegative(line.factories);
      }
      // freeCivilian() は建設・貿易・市場契約・諜報・特殊計画などの既存予約を差し引く。
      const civilian = Math.floor(nonNegative(ProductionManager.freeCivilian(state.country)));
      const military = Math.max(0, Math.floor(nonNegative(ProductionManager.capacity('military'))) - Math.floor(assigned.military));
      const dockyard = Math.max(0, Math.floor(nonNegative(ProductionManager.capacity('dockyard'))) - Math.floor(assigned.dockyard));
      const total = civilian + military + dockyard;
      if (!total) return null;
      const details = [
        '民需工場: ' + civilian + '個空き（建設・貿易・特殊計画の予約を除く）',
        '軍需工場: ' + military + '個空き',
        '造船所: ' + dockyard + '個空き'
      ];
      const industrial = military + dockyard > 0;
      return this.makeAlert('factories', 'warning', total, '工場・造船所に空きがあります', details,
        industrial ? '生産画面を開く' : '建設画面を開く',
        industrial ? 'production' : 'construction', { civilian, military, dockyard });
    }

    /* ---------------- 4. 徴兵・訓練キュー ---------------- */

    activeTrainingQueue(state) {
      const queue = Array.isArray(state.recruitQueue) ? state.recruitQueue
        : (typeof TrainingManager !== 'undefined' && Array.isArray(TrainingManager.queue) ? TrainingManager.queue : []);
      return queue.filter(order => order && !order.done);
    }

    checkTraining(state) {
      if (typeof TrainingManager === 'undefined' || typeof DivisionDesigner === 'undefined' ||
          typeof ProductionManager === 'undefined') return null;
      if (this.activeTrainingQueue(state).length) return null;
      const comp = DivisionDesigner.activeComposition?.();
      const req = comp && TrainingManager.requirements(comp);
      if (!req || req.count <= 0) return null;
      const special = ['ranger', 'mountaineer', 'paratrooper', 'marine'].some(id => req.comp[id]);
      if (special && typeof ArmyRoster !== 'undefined' && ArmyRoster.specialCount() >= 5) return null;
      if (nonNegative(state.manpower) < req.manpowerNeed) return null;
      if (!ProductionManager.canConsume(req.equipmentNeeds || {})) return null;
      const template = DivisionDesigner.activeTemplate?.();
      return this.makeAlert('training', 'warning', 1, '師団の訓練が行われていません',
        ['徴兵・訓練キューが空です。兵員と装備は揃っています。',
          'テンプレート: ' + escapeText(template?.name || '現在の編成'),
          '必要兵員 ' + NUMBER.format(req.manpowerNeed) + ' / 装備 ' + NUMBER.format(req.equipNeed)],
        '徴兵・訓練画面を開く', 'training');
    }

    /* ---------------- 5. 旧式兵器の生産 ---------------- */

    latestUpgrade(type) {
      if (typeof ProductionManager === 'undefined') return null;
      const upgrades = Object.assign({}, UPGRADES,
        typeof TrainingLogistics !== 'undefined' ? TrainingLogistics.UPGRADES : null);
      let current = type;
      let next = upgrades[current];
      const seen = new Set([current]);
      while (next && !seen.has(next) && ProductionManager.CATALOG[next] && ProductionManager.isUnlocked(next)) {
        seen.add(next);
        current = next;
        next = upgrades[current];
      }
      return current === type ? null : current;
    }

    checkObsolete(state) {
      if (typeof ProductionManager === 'undefined') return null;
      const outdated = [];
      for (const line of this.productionLines(state)) {
        if (!line || nonNegative(line.factories) <= 0) continue;
        const def = ProductionManager.CATALOG[line.type];
        if (!def) continue;
        const upgrade = this.latestUpgrade(line.type);
        if (!upgrade) continue;
        outdated.push({ old: def.name, next: ProductionManager.CATALOG[upgrade].name });
      }
      if (!outdated.length) return null;
      const details = outdated.slice(0, 4).map(item => item.old + ' → ' + item.next + '（研究済み）');
      if (outdated.length > 4) details.push('ほか ' + (outdated.length - 4) + 'ライン');
      return this.makeAlert('obsolete', 'warning', outdated.length, '旧式兵器を生産しています', details,
        '生産ラインを見直す', 'production');
    }

    /* ---------------- 6. 未配置・無命令の師団 ---------------- */

    hasArmyOrder(army) {
      const invasion = army.invasion && army.invasion.status !== 'failed' ? army.invasion : null;
      return !!(army.executing || army.holdOrder || army.exercising || army.order || army.mission ||
        army.route?.length || army.frontline?.length || army.arrow || invasion ||
        army.offensiveLine?.pids?.length || army.areaPlan?.frontier?.length ||
        army.areaPlan?.goals?.length || army.garrisonOrder);
    }

    checkUnassigned(state) {
      if (typeof MapRenderer === 'undefined' || !MapRenderer.ready ||
          typeof BattlePlanManager === 'undefined') return null;
      const reserves = Array.isArray(state.strategy.reserves) ? state.strategy.reserves : [];
      const counted = new Set();
      const reserveDivisions = reserves.filter(d => d && !d.defeated);
      reserveDivisions.forEach(d => counted.add(d));
      const idleArmies = [];
      for (const army of BattlePlanManager.armies || []) {
        if (!army?.divisions?.length || army.general || army.commander || this.hasArmyOrder(army)) continue;
        const divisions = army.divisions.filter(d => d && !d.defeated && !counted.has(d));
        if (!divisions.length) continue;
        divisions.forEach(d => counted.add(d));
        idleArmies.push({ id: army.id, name: army.name || '軍集団', count: divisions.length });
      }
      const total = counted.size;
      if (!total) return null;
      const details = [];
      if (reserveDivisions.length) details.push('予備（軍への配属なし）: ' + reserveDivisions.length + '個師団');
      for (const army of idleArmies.slice(0, 3)) details.push(army.name + ': 司令官・命令なし ' + army.count + '個師団');
      if (idleArmies.length > 3) details.push('ほか ' + (idleArmies.length - 3) + '軍');
      const atWar = (state.atWar || []).length > 0;
      const reserveCount = reserveDivisions.length;
      return this.makeAlert('unassigned', atWar ? 'critical' : 'warning', total,
        '未配置の師団が' + total + '個あります', details,
        reserveCount ? '師団の配属を開く' : '司令官の配属を開く', 'deployment',
        { reserveCount, armyId: idleArmies[0]?.id ?? null });
    }

    /* ---------------- 7. 実行可能な決断・法律・政権交代 ---------------- */

    availableDecisions(state) {
      if (typeof DecisionManager === 'undefined' || !state.strategy.decisions) return [];
      const pp = nonNegative(state.politicalPower);
      return DecisionManager.DEFS.filter(def => {
        if (pp < def.cost || DecisionManager.available(def)) return false;
        if (!def.target) return true;
        // 対象選択が必要な決断は、実際に要求可能な他国がいる時だけ通知する。
        if (typeof WarGoals === 'undefined' || typeof DiplomacyManager === 'undefined') return false;
        return (DiplomacyManager.countries || []).some(c =>
          WarGoals.validTarget(c.id) && !WarGoals.restriction(c.id));
      });
    }

    availableLawChanges(state) {
      if (typeof PoliticsSystem === 'undefined' || !PoliticsSystem.LAWS) return [];
      const pp = nonNegative(state.politicalPower);
      const changes = [];
      for (const [kind, def] of Object.entries(PoliticsSystem.LAWS)) {
        const current = state.laws?.[kind];
        const options = (def.list || []).filter(law => law.id !== current &&
          pp >= law.cost && !PoliticsSystem.lawBlocker(kind, law));
        if (options.length) changes.push({ kind, name: def.name, options });
      }
      return changes;
    }

    availableGovernments(state) {
      if (typeof PoliticsSystem === 'undefined' || nonNegative(state.politicalPower) < 100) return [];
      const ruling = state.ideology || (typeof WarGoals !== 'undefined' ? WarGoals.ideology() : null);
      return Object.entries(state.parties || {})
        .filter(([id, share]) => id !== ruling && nonNegative(share) > 50 && PoliticsSystem.PARTIES[id])
        .map(([id]) => ({ id, name: PoliticsSystem.PARTIES[id].name }));
    }

    checkDecisions(state) {
      const decisions = this.availableDecisions(state);
      const laws = this.availableLawChanges(state);
      const governments = this.availableGovernments(state);
      const total = decisions.length + laws.length + governments.length;
      if (!total) return null;
      const details = ['政治力: ' + NUMBER.format(Math.floor(nonNegative(state.politicalPower)))];
      decisions.slice(0, 3).forEach(def => details.push('決断: ' + def.name + '（PP' + def.cost + '）'));
      if (decisions.length > 3) details.push('ほか ' + (decisions.length - 3) + '件の決断');
      laws.forEach(change => details.push(change.name + ': ' + change.options[0].name +
        (change.options.length > 1 ? ' ほか' + (change.options.length - 1) + '案' : '') + '（PP' + change.options[0].cost + '）'));
      governments.forEach(gov => details.push('政権交代: ' + gov.name + '（PP100）'));
      const screen = decisions.length ? 'decisions' : 'politics';
      return this.makeAlert('decisions', 'warning', total, '実行可能な決断・政治変更があります', details,
        decisions.length ? 'ディシジョン画面を開く' : '政治画面を開く', screen,
        { decisions: decisions.length, laws: laws.length, governments: governments.length });
    }

    /* ---------------- 8. 装備の生産不足 ---------------- */

    hasProducingLine(state, equipmentType) {
      if (typeof ProductionManager === 'undefined') return false;
      const accepted = new Set(ProductionManager.inventoryTypes(equipmentType));
      return this.productionLines(state).some(line => line && accepted.has(line.type) &&
        nonNegative(line.factories) > 0 && ProductionManager.CATALOG[line.type]);
    }

    equipmentDemand(state) {
      const demand = new Map();
      const add = (needs, source) => {
        for (const [type, amount] of Object.entries(needs || {})) {
          const n = nonNegative(amount);
          if (!n) continue;
          const entry = demand.get(type) || { amount: 0, training: 0, reinforcement: 0 };
          entry.amount += n;
          entry[source]++;
          demand.set(type, entry);
        }
      };
      // 装備待ちの徴兵命令。訓練開始時に装備は消費済みなので training 行は含めない。
      for (const order of this.activeTrainingQueue(state)) {
        if (order.phase === 'training') continue;
        const needs = order.equipmentNeeds ||
          (typeof TrainingManager !== 'undefined' && order.comp ? TrainingManager.equipmentNeedsFor(order.comp) : null);
        add(needs, 'training');
      }
      // 前線・予備を問わず、装備充足率が100%未満の実在師団の補充要求。
      if (typeof ArmyRoster !== 'undefined' && typeof TrainingManager !== 'undefined') {
        for (const division of ArmyRoster.all()) {
          if (!division?.comp || division.defeated) continue;
          const strength = Number.isFinite(division.equipmentStrength) ? division.equipmentStrength : 100;
          if (strength >= 100) continue;
          add(TrainingManager.equipmentNeedsFor(division.comp, 100 - strength), 'reinforcement');
        }
      }
      return demand;
    }

    checkShortage(state) {
      if (typeof ProductionManager === 'undefined') return null;
      const stock = state.strategy.economies?.[state.country]?.stock || {};
      const missing = [];
      for (const [type, entry] of this.equipmentDemand(state)) {
        if (this.hasProducingLine(state, type)) continue;
        const available = ProductionManager.inventoryTypes(type)
          .reduce((sum, key) => sum + nonNegative(stock[key]), 0);
        const sources = [];
        if (entry.training) sources.push('徴兵待ち ' + entry.training);
        if (entry.reinforcement) sources.push('補充待ち ' + entry.reinforcement);
        missing.push({ type, amount: entry.amount, available, sources: sources.join('・') });
      }
      if (!missing.length) return null;
      const details = missing.slice(0, 4).map(item =>
        (ProductionManager.CATALOG[item.type]?.name || item.type) + ': 必要 ' + NUMBER.format(Math.ceil(item.amount)) +
        ' / 在庫 ' + NUMBER.format(Math.floor(item.available)) + '（' + item.sources + '）');
      if (missing.length > 4) details.push('ほか ' + (missing.length - 4) + '種類');
      details.push('生産ラインが無い、または工場が割り当てられていません。');
      return this.makeAlert('shortage', 'critical', missing.length, '必要な装備の生産ラインがありません', details,
        '生産画面を開く', 'production');
    }

    /* ---------------- UI（差分描画・ツールチップ・操作） ---------------- */

    _listen(target, type, handler, capture = false) {
      target.addEventListener(type, handler, capture);
      this._handlers.push([target, type, handler, capture]);
    }

    _buildTooltip() {
      const tip = document.createElement('div');
      tip.id = 'alert-tooltip';
      tip.className = 'alert-tooltip';
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      const severity = document.createElement('span');
      severity.className = 'alert-tooltip-severity';
      const title = document.createElement('strong');
      title.className = 'alert-tooltip-title';
      const details = document.createElement('ul');
      details.className = 'alert-tooltip-details';
      const action = document.createElement('span');
      action.className = 'alert-tooltip-action';
      tip.append(severity, title, details, action);
      document.body.appendChild(tip);
      this.tooltip = tip;
      this.tooltipParts = { severity, title, details, action };
    }

    _bindUI() {
      this._listen(this.list, 'click', event => {
        const button = event.target.closest?.('.alert-button');
        if (button && this.list.contains(button)) this.activate(button.dataset.alertId);
      });
      this._listen(this.list, 'mouseover', event => {
        const button = event.target.closest?.('.alert-button');
        if (button && this.list.contains(button)) this.showTooltip(button.dataset.alertId);
      });
      this._listen(this.list, 'mouseout', event => {
        const button = event.target.closest?.('.alert-button');
        if (button && !button.contains(event.relatedTarget)) this.hideTooltip();
      });
      this._listen(this.list, 'focusin', event => {
        const button = event.target.closest?.('.alert-button');
        if (button && this.list.contains(button)) this.showTooltip(button.dataset.alertId);
      });
      this._listen(this.list, 'focusout', event => {
        const button = event.target.closest?.('.alert-button');
        if (button && !button.contains(event.relatedTarget)) this.hideTooltip();
      });
      this._listen(this.list, 'pointerdown', event => {
        // タッチではツールチップを残さず、タップで対応画面を開く。
        if (event.pointerType === 'touch') this.hideTooltip();
      });
    }

    _createButton(alert) {
      const def = DEF_BY_ID[alert.id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'alert-button';
      button.dataset.alertId = alert.id;
      const icon = document.createElement('span');
      icon.className = 'alert-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + def.icon + '</svg>';
      const badge = document.createElement('span');
      badge.className = 'alert-badge';
      badge.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'alert-label';
      label.textContent = def.label;
      button.append(icon, badge, label);
      return { button, icon, badge, label, alert: null };
    }

    render(alerts) {
      if (!this.container || !this.list) return;
      const next = new Map(alerts.map(alert => [alert.id, alert]));
      const focused = document.activeElement;
      let focusRemoved = false;

      // 解消したアラートだけ削除する。
      for (const [id, entry] of this.entries) {
        if (next.has(id)) continue;
        if (this.tooltipId === id) this.hideTooltip();
        if (focused === entry.button || entry.button.contains(focused)) focusRemoved = true;
        entry.button.remove();
        this.entries.delete(id);
      }

      // 定義順を維持し、既存ノードは再利用する。
      let index = 0;
      for (const alert of alerts) {
        let entry = this.entries.get(alert.id);
        if (!entry) {
          entry = this._createButton(alert);
          this.entries.set(alert.id, entry);
        }
        const { button, badge } = entry;
        const previous = entry.alert;
        if (!previous || previous.severity !== alert.severity) {
          button.classList.toggle('is-critical', alert.severity === 'critical');
          button.classList.toggle('is-warning', alert.severity !== 'critical');
        }
        if (!previous || previous.count !== alert.count) badge.textContent = alert.count > 99 ? '99+' : String(alert.count);
        if (!previous || previous.title !== alert.title || previous.count !== alert.count || previous.severity !== alert.severity) {
          button.setAttribute('aria-label', SEVERITY_LABEL[alert.severity] + ': ' + alert.title + '（' + alert.count + '件）');
        }
        const current = this.list.children[index];
        if (current !== button) this.list.insertBefore(button, current || null);
        entry.alert = alert;
        index++;
      }

      this.active = next;
      this.container.classList.toggle('is-clear', alerts.length === 0);
      this.container.dataset.count = String(alerts.length);
      if (this.totalEl) {
        this.totalEl.textContent = String(alerts.length);
        this.totalEl.hidden = alerts.length === 0;
      }
      if (this.emptyEl) this.emptyEl.hidden = alerts.length > 0;

      // ホバー/フォーカス中の説明は、同じノード内で最新化する。
      if (this.tooltipId) {
        if (next.has(this.tooltipId)) this.showTooltip(this.tooltipId);
        else this.hideTooltip();
      }
      if (focusRemoved) {
        const replacement = this.list.children[Math.min(index - 1, this.list.children.length - 1)];
        if (replacement) replacement.focus();
        else this.container.focus?.();
      }
      this._announce(alerts);
    }

    _announce(alerts) {
      if (!this.announcer) return;
      // 件数の増減ではなく、項目の出現・解消・重要度変化だけを読み上げに回す。
      const signature = alerts.map(a => a.id + ':' + a.severity).join('|');
      if (signature === this.lastAnnouncement) return;
      this.lastAnnouncement = signature;
      this.announcer.textContent = alerts.length
        ? '重要なアラート ' + alerts.length + '件: ' + alerts.map(a => a.title).join('、')
        : '対応が必要なアラートはありません。';
    }

    showTooltip(id) {
      const alert = this.active.get(id);
      const entry = this.entries.get(id);
      if (!alert || !entry || !this.tooltip) return;
      if (this.tooltipId && this.tooltipId !== id) {
        this.entries.get(this.tooltipId)?.button.removeAttribute('aria-describedby');
      }
      this.tooltipId = id;
      const { severity, title, details, action } = this.tooltipParts;
      const severityText = SEVERITY_LABEL[alert.severity];
      if (severity.textContent !== severityText) severity.textContent = severityText;
      severity.className = 'alert-tooltip-severity ' + (alert.severity === 'critical' ? 'is-critical' : 'is-warning');
      if (title.textContent !== alert.title) title.textContent = alert.title;
      const lines = alert.details || [];
      while (details.children.length > lines.length) details.lastChild.remove();
      lines.forEach((line, index) => {
        let item = details.children[index];
        if (!item) {
          item = document.createElement('li');
          details.appendChild(item);
        }
        if (item.textContent !== line) item.textContent = line;
      });
      const actionText = 'クリック / Enter: ' + alert.actionLabel;
      if (action.textContent !== actionText) action.textContent = actionText;
      this.tooltip.hidden = false;
      entry.button.setAttribute('aria-describedby', this.tooltip.id);
      this._positionTooltip(entry.button);
    }

    _positionTooltip(button) {
      const rect = button.getBoundingClientRect();
      const width = this.tooltip.offsetWidth || 320;
      const height = this.tooltip.offsetHeight || 180;
      const margin = 8;
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      let top = rect.bottom + margin;
      if (top + height > window.innerHeight - margin) top = rect.top - height - margin;
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
      this.tooltip.style.left = left + 'px';
      this.tooltip.style.top = top + 'px';
    }

    hideTooltip() {
      if (this.tooltipId) this.entries.get(this.tooltipId)?.button.removeAttribute('aria-describedby');
      this.tooltipId = null;
      if (this.tooltip) this.tooltip.hidden = true;
    }

    /** アラートから既存のゲーム画面・配属モーダルを開く。 */
    activate(id) {
      if (this.destroyed) return;
      this.hideTooltip();
      this.update();
      const alert = this.active.get(id);
      if (!alert) return; // 操作直前に条件が解消した場合
      try {
        if (id === 'unassigned') this._openDeployment(alert);
        else this._openScreen(alert.screen);
      } catch (error) {
        console.error('[AlertManager] 画面を開けませんでした:', error);
        if (typeof GameUI !== 'undefined') GameUI.notify('対応する画面を開けませんでした。', 'alert');
      }
      this.requestUpdate();
    }

    _openScreen(screen) {
      if (!screen || typeof GameUI === 'undefined') return;
      GameUI.switchTab(screen);
      // 既存ウィンドウの再表示・最小化解除でも最新状態を描画する。
      GameUI.onWindowOpened?.(screen);
    }

    _openDeployment(alert) {
      if (typeof BattlePlanManager === 'undefined' || typeof ArmyRoster === 'undefined') return;
      BattlePlanManager.setForce?.('army');
      if (alert.payload.reserveCount > 0) {
        let target = BattlePlanManager.selectedArmy?.();
        if (!target || target.executing) {
          target = (BattlePlanManager.armies || []).find(army => !army.executing) || null;
        }
        if (!target) {
          BattlePlanManager.addArmy();
          target = BattlePlanManager.selectedArmy?.();
        }
        if (target) BattlePlanManager.selectArmy(target.id);
        ArmyRoster.assignModal();
      } else if (alert.payload.armyId !== null) {
        BattlePlanManager.selectArmy(alert.payload.armyId);
        BattlePlanManager.assignGeneral(alert.payload.armyId);
      }
    }
  }

  window.AlertManager = AlertManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = AlertManager;
})();
