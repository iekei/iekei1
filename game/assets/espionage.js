"use strict";
/* espionage.js — HOI4風「スパイ機関・諜報活動 (Agency & Espionage)」
 *
 * 既存の IntelOperations (strategy.js) / AgencyUI (intelligence-agency.js) の
 * データモデル (gameState.intel) を土台に、以下を追加する。
 *   1. 政治力で設立する諜報機関と、政治力制のアップグレードツリー
 *      (暗号解読チーム / 政府への潜入 / 軍への潜入 / 特殊部隊 / 防諜 / プロパガンダ局 / 現地採用 / 無線傍受網)
 *   2. 諜報員 (Operative) の雇用と任務: ネットワーク構築 / プロパガンダ / 暗号解読支援 / 防諜
 *   3. 対象国ごとのインテル (民政・陸軍・海軍・空軍 0〜100%)。
 *      レベルに応じて政治情報・工場数・師団配置 (地図上の師団マーカー) が段階的に可視化される。
 * UI は既存の「🕵️ 諜報」ウィンドウ (#intel-content) を置き換えて描画する。
 */
(function (g) {
  const TREE = [
    { id: 'cryptology',      name: '暗号解読チーム', icon: '🔐', pp: 40, days: 30, req: [],                   desc: '暗号解読支援任務を解禁。解読速度 +50%。解読完了で対象国の全インテル +25%。' },
    { id: 'gov_infiltration', name: '政府への潜入',  icon: '🏛️', pp: 50, days: 40, req: [],                   desc: '民政インテル獲得 +60%。安定度・国家方針・工場数の把握が早まる。' },
    { id: 'army_infiltration', name: '軍への潜入',   icon: '🎖️', pp: 50, days: 40, req: ['gov_infiltration'], desc: '陸軍インテル獲得 +60%。師団配置の地図表示が早まる。' },
    { id: 'special_forces',  name: '特殊部隊',       icon: '🥷', pp: 60, days: 45, req: ['army_infiltration'], desc: '任務の準備期間 −10日。諜報員上限 +1。作戦成功率 +15%。' },
    { id: 'counterintel',    name: '防諜部門',       icon: '🛡️', pp: 40, days: 30, req: [],                   desc: '防諜力 +1。自国内の敵諜報網の侵食を抑える。' },
    { id: 'propaganda_bureau', name: 'プロパガンダ局', icon: '📻', pp: 45, days: 30, req: ['gov_infiltration'], desc: 'プロパガンダ任務の効果 2倍。対象国の安定度・戦争協力度を低下させる。' },
    { id: 'local_recruit',   name: '現地採用',       icon: '🌍', pp: 50, days: 35, req: ['counterintel'],     desc: '諜報員上限 +1。雇用コスト −25%。' },
    { id: 'radio_intercept', name: '無線傍受網',     icon: '📡', pp: 60, days: 45, req: ['cryptology'],       desc: '全対象国の海軍・空軍インテルが毎日自動で増加。' },
  ];
  const MISSIONS = {
    idle:       { name: '待機',               icon: '⏸️', desc: '任務なし。' },
    network:    { name: 'ネットワークの構築', icon: '🕸️', desc: '対象国に諜報網を築く。全インテルの獲得源。' },
    propaganda: { name: 'プロパガンダ活動',   icon: '📻', desc: '対象国の安定度・戦争協力度を毎日低下させる (諜報網20%以上)。' },
    decrypt:    { name: '暗号解読支援',       icon: '🔐', desc: '対象国の暗号解読を加速する (暗号解読チーム・諜報網40%以上)。' },
    counter:    { name: '防諜',               icon: '🛡️', desc: '自国内で敵諜報員を摘発する。' },
  };
  const DOMAINS = [['civ', '民政', '🏛️'], ['army', '陸軍', '🪖'], ['navy', '海軍', '⚓'], ['air', '空軍', '✈️']];
  const TIERS = ['不明', '断片的', '基礎', '詳細', '完全'];
  const esc = (x) => (typeof GameTools !== 'undefined' ? GameTools.escape(String(x ?? '')) : String(x ?? ''));
  const gs = () => CoreEngine.gameState;
  const today = () => GameTools.day();
  const nameOf = (tag) => (typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.nameOf(tag) : tag);
  const notify = (m, k) => { if (typeof GameUI !== 'undefined' && GameUI.notify) GameUI.notify(m, k || 'alert'); };

  function ensure() {
    IntelOperations.ensure();
    const i = gs().intel;
    i.tree ||= { unlocked: {}, project: null };
    i.tab ||= 'agency';
    i.roster ||= [];
    i.recruiting ||= [];
    i.targets ||= {};
    return i;
  }
  function target(tag) {
    const t = IntelOperations.target(tag);
    t.intel ||= { civ: 0, army: 0, navy: 0, air: 0 };
    return t;
  }
  const has = (id) => !!ensure().tree.unlocked[id];
  const tier = (v) => (v >= 80 ? 4 : v >= 60 ? 3 : v >= 40 ? 2 : v >= 20 ? 1 : 0);
  const spyCap = (i) => (i.level || 0) * 2 + (has('special_forces') ? 1 : 0) + (has('local_recruit') ? 1 : 0);
  const hireCost = () => (has('local_recruit') ? 56 : 75);
  const prepDays = () => Math.max(10, 30 - (has('special_forces') ? 10 : 0));
  const targets = () => (typeof DiplomacyManager !== 'undefined' ? DiplomacyManager.countries : []).filter((c) => c.id !== gs().country);

  const Espionage = {
    TREE, MISSIONS, DOMAINS, TIERS, ensure, target, has, tier,
    get i() { return ensure(); },

    // ---------- 1. 機関の設立とアップグレード ----------
    found() {
      const s = gs(), i = ensure();
      if (i.agency || i.building) return false;
      if (s.politicalPower < 50) { notify('諜報機関の設立には政治力50が必要です。'); return false; }
      s.politicalPower -= 50;
      i.building = { days: 30, kind: 'create' };
      CoreEngine.log?.('🕵️ 諜報機関の設立を開始 (30日)');
      Espionage.render();
      return true;
    },
    upgradeAgency() {
      const s = gs(), i = ensure();
      if (!i.agency || i.building || i.level >= 5) return false;
      const cost = 100 * i.level;
      if (s.politicalPower < cost) { notify('機関拡張には政治力' + cost + 'が必要です。'); return false; }
      s.politicalPower -= cost;
      i.building = { days: 60, kind: 'upgrade' };
      Espionage.render();
      return true;
    },
    canUnlock(id) {
      const i = ensure(), def = TREE.find((t) => t.id === id);
      if (!def || !i.agency || i.tree.unlocked[id] || i.tree.project) return false;
      return def.req.every((r) => i.tree.unlocked[r]);
    },
    unlock(id) {
      const s = gs(), i = ensure(), def = TREE.find((t) => t.id === id);
      if (!Espionage.canUnlock(id)) return false;
      if (s.politicalPower < def.pp) { notify(def.name + ' には政治力' + def.pp + 'が必要です。'); return false; }
      s.politicalPower -= def.pp;
      i.tree.project = { id, days: def.days, total: def.days };
      CoreEngine.log?.('🕵️ 機関アップグレード開始: ' + def.name + ' (' + def.days + '日)');
      Espionage.render();
      return true;
    },

    // ---------- 2. 諜報員の雇用と任務 ----------
    hire(operativeId) {
      const s = gs(), i = ensure();
      if (!i.agency) return false;
      if (i.spies + i.recruiting.length >= spyCap(i)) { notify('諜報員の上限 (' + spyCap(i) + '名) に達しています。機関の拡張かツリーで上限を増やしてください。'); return false; }
      const cost = hireCost();
      if (s.politicalPower < cost) { notify('諜報員の雇用には政治力' + cost + 'が必要です。'); return false; }
      const used = [...i.roster, ...i.recruiting.map((r) => r.operativeId)];
      const choices = GameVisuals.operativeChoices(s.country, used);
      const person = (operativeId && choices.find((p) => p.id === operativeId)) || choices.find((p) => !p.country || p.country === s.country) || choices[0];
      if (!person) { notify('雇用できる候補者がいません。'); return false; }
      s.politicalPower -= cost;
      i.recruiting.push({ days: 30, operativeId: person.id });
      Espionage.render();
      return true;
    },
    candidate(id) { ensure().candidate = id; Espionage.render(); },
    assign(slot, kind, tag) {
      const s = gs(), i = ensure();
      slot = Number(slot);
      if (!(slot >= 0 && slot < i.spies) || !MISSIONS[kind]) return false;
      if (i.op?.slots?.includes(slot) || i.agencyOperation?.slots?.includes(slot)) { notify('この諜報員は作戦に参加中です。'); return false; }
      if (typeof AgencyUI !== 'undefined' && AgencyUI.person && AgencyUI.person(slot).status !== 'ready') { notify('この諜報員は負傷療養中です。'); return false; }
      tag = tag || i.selected;
      if (kind === 'counter') tag = s.country;
      else if (kind !== 'idle' && (!tag || tag === s.country)) { notify('対象国を選択してください。'); return false; }
      if (kind === 'propaganda' && target(tag).network < 20) { notify('プロパガンダ活動には対象国の諜報網20%以上が必要です。'); return false; }
      if (kind === 'decrypt') {
        if (!has('cryptology')) { notify('暗号解読支援には「暗号解読チーム」の整備が必要です。'); return false; }
        if (target(tag).network < 40) { notify('暗号解読支援には対象国の諜報網40%以上が必要です。'); return false; }
        const t = target(tag);
        if (!t.decoded) { t.cipherActive = true; t.cipherPoints ||= 0; t.cipherStrength ||= 600; }
      }
      i.assignments[slot] = kind === 'idle' ? { kind: 'idle', preparation: 0 } : { kind, target: tag, preparation: prepDays() };
      Espionage.render();
      return true;
    },
    select(tag) { if (/^[A-Z]{3}$/.test(tag)) { ensure().selected = tag; Espionage.render(); } },
    tab(t) { ensure().tab = t; Espionage.render(); },

    // ---------- 3. インテル ----------
    intel(tag) { return target(tag).intel; },
    level(tag) {
      const v = target(tag).intel;
      return tier((v.civ + v.army + v.navy + v.air) / 4);
    },
    /** 対象国の情報を、インテルレベルに応じて段階的に返す */
    report(tag) {
      const s = gs(), t = target(tag), v = t.intel, r = { tag, civ: {}, army: {}, navy: {}, air: {} };
      const pub = s.strategy?.publicCountries?.[tag];
      const def = (typeof CountryDossier !== 'undefined' && CountryDossier.LEADERS[tag]) || [null, nameOf(tag) + 'の指導者'];
      const fuzz = (n, acc) => { // 精度に応じて概数化
        if (acc >= 80) return String(n);
        const step = acc >= 60 ? 5 : acc >= 40 ? 10 : 20;
        const lo = Math.max(0, Math.floor(n / step) * step);
        return lo + '〜' + (lo + step);
      };
      if (v.civ >= 20) {
        r.civ['イデオロギー'] = (typeof WarGoals !== 'undefined' && WarGoals.IDEOLOGY?.[tag]) || '不明';
        r.civ['指導者'] = pub?.leader ? pub.leader : def[1];
      }
      if (v.civ >= 40) {
        const fx = s.countryEffects?.[tag];
        r.civ['安定度'] = Math.round(fx?.stability ?? 50) + '%';
        r.civ['戦争協力度'] = Math.round(fx?.warSupport ?? 50) + '%';
        let focus = pub?.focus;
        if (!focus && typeof AIManager !== 'undefined') { try { const ai = AIManager.aiOf(tag); focus = AIManager.focusList(tag)[ai.idx]?.name; } catch (e) { /* ignore */ } }
        r.civ['国家方針'] = focus || '不明';
      }
      if (v.civ >= 60) {
        const acc = ProductionManager.account(tag);
        r.civ['民需工場'] = fuzz(acc.civilian, v.civ);
        r.civ['軍需工場'] = fuzz(acc.military, v.civ);
        r.civ['造船所'] = fuzz(acc.dockyards, v.civ);
      }
      if (v.civ >= 80) {
        const st = Object.values(MapRenderer.states || {}).filter((x) => x.owner === tag);
        r.civ['州数'] = String(st.length);
        r.civ['インフラ合計'] = String(st.reduce((n, x) => n + (x.b?.infrastructure || 0), 0));
      }
      const f = IntelOperations.forces(tag);
      const divs = f.divisions.filter((d) => !d.defeated);
      if (v.army >= 20) r.army['師団数'] = fuzz(divs.length, v.army);
      if (v.army >= 40) {
        const byType = {};
        divs.forEach((d) => { byType[d.type || 'infantry'] = (byType[d.type || 'infantry'] || 0) + 1; });
        r.army['編成'] = Object.entries(byType).map(([k, n]) => k + '×' + n).join(', ') || '—';
      }
      if (v.army >= 50) r.army['配置'] = '地図上に師団マーカーを表示中';
      if (v.army >= 80) r.army['任務'] = '地図上に任務を表示中';
      if (v.navy >= 20) r.navy['艦隊数'] = String(f.navy.length);
      if (v.navy >= 40) r.navy['艦艇数 (推定)'] = fuzz(f.navy.reduce((n, x) => n + (x.count || 0), 0), v.navy);
      if (v.navy >= 60) r.navy['艦隊位置'] = '地図上に表示中';
      if (v.air >= 20) {
        const st = Object.values(MapRenderer.states || {}).filter((x) => x.owner === tag);
        r.air['航空基地'] = fuzz(st.reduce((n, x) => n + (x.b?.air_base || 0), 0), v.air);
      }
      if (v.air >= 40) {
        const planes = s.strategy?.enemyAir?.[tag]?.planes;
        r.air['航空機 (推定)'] = planes != null ? fuzz(Math.round(planes), v.air) : '不明';
      }
      if (v.air >= 60) r.air['制空戦力'] = '空域ウィンドウで正確な敵戦力を表示';
      return r;
    },
    /** 地図で師団配置を表示するか (陸軍インテル50%以上) */
    mapVisible(tag) { return target(tag).intel.army >= 50; },
    showsMissions(tag) { return target(tag).intel.army >= 80; },

    // ---------- 日次処理 ----------
    daily() {
      const s = gs(), i = ensure();
      // ツリー
      if (i.tree.project && --i.tree.project.days <= 0) {
        i.tree.unlocked[i.tree.project.id] = true;
        const def = TREE.find((t) => t.id === i.tree.project.id);
        CoreEngine.log?.('🕵️ 機関アップグレード完了: ' + (def?.name || i.tree.project.id));
        i.tree.project = null;
      }
      const civMul = has('gov_infiltration') ? 1.6 : 1, armyMul = has('army_infiltration') ? 1.6 : 1;
      const active = {};
      i.assignments.forEach((a, slot) => {
        if (!a || a.kind === 'idle' || a.preparation > 0 || !a.target) return;
        if (i.op?.slots?.includes(slot) || i.agencyOperation?.slots?.includes(slot)) return;
        if (typeof AgencyUI !== 'undefined' && AgencyUI.person && AgencyUI.person(slot).status !== 'ready') return;
        (active[a.target] ||= { network: 0, propaganda: 0, decrypt: 0 })[a.kind] = ((active[a.target] || {})[a.kind] || 0) + 1;
      });
      Object.entries(i.targets).forEach(([tag, t]) => {
        if (tag === s.country) return;
        target(tag);
        const v = t.intel, act = active[tag] || {}, net = t.network / 100;
        if (t.network > 0) {
          v.civ = Math.min(100, v.civ + 0.6 * net * civMul + 0.1 * (act.network || 0));
          v.army = Math.min(100, v.army + 0.5 * net * armyMul + 0.1 * (act.network || 0));
          v.navy = Math.min(100, v.navy + 0.3 * net);
          v.air = Math.min(100, v.air + 0.3 * net);
        }
        if (has('radio_intercept')) { v.navy = Math.min(100, v.navy + 0.3); v.air = Math.min(100, v.air + 0.3); }
        if (t.network < 10) DOMAINS.forEach(([k]) => { v[k] = Math.max(0, v[k] - 0.1); });
        // 暗号解読支援: 既存 AgencyUI の cipherPoints を加速 (AgencyUI 非搭載時は自前で進める)
        if (act.decrypt && !t.decoded) {
          t.cipherActive = true; t.cipherStrength ||= 600;
          t.cipherPoints = Math.min(t.cipherStrength, (t.cipherPoints || 0) + act.decrypt * (has('cryptology') ? 7.5 : 5));
          if (t.cipherPoints >= t.cipherStrength) { t.decoded = true; t.cipherActive = false; }
        }
        if (t.decoded && !t.decodedIntelBonus) {
          t.decodedIntelBonus = true;
          DOMAINS.forEach(([k]) => { v[k] = Math.min(100, v[k] + 25); });
          CoreEngine.log?.('🔐 ' + nameOf(tag) + ' の暗号解読に成功。全インテル +25%');
        }
        // プロパガンダ (プロパガンダ局で2倍)
        if (act.propaganda) {
          const fx = ((s.countryEffects ||= {})[tag] ||= { country: tag, stability: 50, warSupport: 50, popularity: {} });
          const amt = 0.08 * act.propaganda * (has('propaganda_bureau') ? 2 : 1);
          fx.stability = Math.max(0, (fx.stability ?? 50) - amt);
          fx.warSupport = Math.max(0, (fx.warSupport ?? 50) - amt);
        }
        // レベル到達通知
        const lv = Espionage.level(tag);
        if (lv > (t.notifiedLevel || 0)) { t.notifiedLevel = lv; notify('🕵️ ' + nameOf(tag) + ' のインテルレベルが「' + TIERS[lv] + '」に到達', 'success'); if (lv >= 2) BattlePlanManager._enemyDivTick = 0; }
      });
    },

    // ---------- 描画 ----------
    render() {
      const el = document.getElementById('intel-content');
      if (!el || !gs().strategy || (GameTools.editing && GameTools.editing('intel-content'))) return;
      const s = gs(), i = ensure();
      if (!i.selected || i.selected === s.country) i.selected = targets()[0]?.id || null;
      const pp = Math.floor(s.politicalPower || 0);
      let html = '<div class="esp-root">';
      html += '<div class="esp-header"><div class="esp-title"><div class="esp-mark">🕵️</div><div><h3>' + (i.agency ? esc(i.agency) : '諜報機関') + ' <small>AGENCY &amp; ESPIONAGE</small></h3>' +
        '<p>' + (i.agency ? '機関 Lv.' + i.level + ' ／ 諜報員 ' + i.spies + '/' + spyCap(i) + '名 ／ 防諜力 ' + IntelOperations.counterPower() : '未設立 — 政治力50で設立できます') + '</p></div></div>' +
        '<div class="esp-pp">🏛️ 政治力 <b>' + pp + '</b></div>' +
        '<div class="esp-tabs">' + [['agency', '🏢 機関'], ['operatives', '🕴️ 諜報員'], ['intel', '📊 インテル'], ['operations', '🎯 作戦']].map(([k, l]) =>
          '<button class="esp-tab' + (i.tab === k ? ' on' : '') + '" onclick="Espionage.tab(\'' + k + '\')">' + l + '</button>').join('') + '</div></div>';
      html += '<div class="esp-body">' + Espionage.sidebar() + '<div class="esp-main">';
      if (!i.agency) html += Espionage.renderFounding();
      else if (i.tab === 'operatives') html += Espionage.renderOperatives();
      else if (i.tab === 'intel') html += Espionage.renderIntel();
      else if (i.tab === 'operations') html += Espionage.renderOperations();
      else html += Espionage.renderAgency();
      html += '</div></div></div>';
      el.innerHTML = html;
    },
    sidebar() {
      const i = ensure(), s = gs();
      const list = targets().map((c) => {
        const t = target(c.id), lv = Espionage.level(c.id);
        const war = s.atWar?.includes(c.id);
        return '<div class="esp-country' + (i.selected === c.id ? ' selected' : '') + '" onclick="Espionage.select(\'' + c.id + '\')">' +
          '<div class="esp-country-head"><b>' + esc(c.name) + '</b>' + (war ? '<span class="esp-badge war">交戦中</span>' : '') + '<span class="esp-badge lv' + lv + '">' + TIERS[lv] + '</span></div>' +
          '<div class="esp-net"><em style="width:' + t.network.toFixed(0) + '%"></em><span>諜報網 ' + t.network.toFixed(0) + '%</span></div>' +
          '<div class="esp-dots">' + DOMAINS.map(([k, n, ic]) => '<span title="' + n + ' ' + Math.round(t.intel[k]) + '%">' + ic + '<i class="t' + tier(t.intel[k]) + '"></i></span>').join('') + '</div></div>';
      }).join('');
      return '<div class="esp-side"><div class="esp-side-title">対象国 <small>' + targets().length + 'か国</small></div>' + list + '</div>';
    },
    renderFounding() {
      const i = ensure();
      let html = '<div class="esp-section"><h4>諜報機関の設立</h4>';
      if (i.building) html += '<p>機関設立まで <b>' + i.building.days + '日</b></p><div class="esp-bar"><em style="width:' + ((30 - i.building.days) / 30 * 100) + '%"></em></div>';
      else html += '<p>政治力 <b>50</b> を消費して諜報機関を設立します (30日)。設立後、アップグレードツリーの整備と諜報員の雇用が可能になります。</p>' +
        '<button class="esp-btn primary" onclick="Espionage.found()">🏛️ 諜報機関を設立 (政治力 50)</button>';
      html += '</div><div class="esp-section"><h4>機関でできること</h4><ul class="esp-ul"><li><b>ネットワークの構築</b> — 対象国に諜報網を築き、民政・陸海空のインテルを得る。</li><li><b>プロパガンダ活動</b> — 対象国の安定度・戦争協力度を削る。</li><li><b>暗号解読支援</b> — 暗号を解読し、全インテルと戦闘効率にボーナス。</li><li><b>インテル</b> — レベルに応じて政治情報・工場数・師団配置 (地図表示) が透けて見える。</li></ul></div>';
      return html;
    },
    renderAgency() {
      const i = ensure(), s = gs();
      let html = '<div class="esp-section"><h4>機関レベル</h4><div class="esp-row"><span>Lv.' + i.level + ' / 5 — 諜報員上限 ' + spyCap(i) + '名</span>';
      if (i.building) html += '<span>' + (i.building.kind === 'create' ? '設立' : '拡張') + 'まで ' + i.building.days + '日</span>';
      else html += '<button class="esp-btn" ' + (i.level >= 5 ? 'disabled' : '') + ' onclick="Espionage.upgradeAgency()">⬆️ 機関を拡張 (政治力 ' + 100 * i.level + '・60日)</button>';
      html += '</div></div>';
      html += '<div class="esp-section"><h4>アップグレードツリー</h4>';
      if (i.tree.project) { const d = TREE.find((t) => t.id === i.tree.project.id); html += '<p class="esp-progress">⏳ ' + esc(d?.name) + ' 整備中 — 残り ' + i.tree.project.days + '日</p><div class="esp-bar"><em style="width:' + ((i.tree.project.total - i.tree.project.days) / i.tree.project.total * 100) + '%"></em></div>'; }
      html += '<div class="esp-tree">' + TREE.map((d) => {
        const done = i.tree.unlocked[d.id], can = Espionage.canUnlock(d.id), busy = i.tree.project?.id === d.id;
        const locked = !done && !can && !busy;
        return '<div class="esp-node' + (done ? ' done' : busy ? ' busy' : locked ? ' locked' : '') + '">' +
          '<div class="esp-node-head"><span class="esp-node-icon">' + d.icon + '</span><b>' + d.name + '</b>' + (done ? '<span class="esp-badge ok">整備済</span>' : '<span class="esp-badge">PP ' + d.pp + ' / ' + d.days + '日</span>') + '</div>' +
          '<p>' + d.desc + '</p>' + (d.req.length ? '<small>前提: ' + d.req.map((r) => TREE.find((t) => t.id === r)?.name).join(', ') + '</small>' : '') +
          (!done && !busy ? '<button class="esp-btn small" ' + (can && s.politicalPower >= d.pp ? '' : 'disabled') + ' onclick="Espionage.unlock(\'' + d.id + '\')">整備する</button>' : '') + '</div>';
      }).join('') + '</div></div>';
      return html;
    },
    renderOperatives() {
      const i = ensure(), s = gs();
      const used = [...i.roster, ...i.recruiting.map((r) => r.operativeId)];
      const choices = GameVisuals.operativeChoices(s.country, used);
      const cand = choices.find((p) => p.id === i.candidate) || choices[0];
      let html = '<div class="esp-section"><h4>諜報員の雇用 <small>' + i.spies + '+' + i.recruiting.length + ' / ' + spyCap(i) + '</small></h4><div class="esp-hire">' +
        (cand ? '<div class="esp-portrait">' + GameVisuals.person(cand) + '</div>' : '') +
        '<div><select onchange="Espionage.candidate(this.value)">' + choices.slice(0, 30).map((p) => '<option value="' + p.id + '"' + (p.id === cand?.id ? ' selected' : '') + '>' + esc(p.name) + (p.country ? ' (' + p.country + ')' : '') + '</option>').join('') + '</select>' +
        '<button class="esp-btn primary" onclick="Espionage.hire(\'' + (cand?.id || '') + '\')">🕴️ 雇用する (政治力 ' + hireCost() + '・30日)</button>' +
        (i.recruiting.length ? '<p>養成中: ' + i.recruiting.map((r) => esc(GameVisuals.operative(r.operativeId)?.name || '諜報員') + ' ' + r.days + '日').join(' / ') + '</p>' : '') + '</div></div></div>';
      html += '<div class="esp-section"><h4>諜報員と任務 <small>対象国: ' + esc(nameOf(i.selected)) + '</small></h4>';
      if (!i.spies) html += '<p class="sn-help">諜報員がいません。雇用して任務を割り当ててください。</p>';
      for (let slot = 0; slot < i.spies; slot++) {
        const a = i.assignments[slot] || { kind: 'idle', preparation: 0 }, p = GameVisuals.operative(i.roster[slot]);
        const inOp = i.op?.slots?.includes(slot) || i.agencyOperation?.slots?.includes(slot);
        const st = typeof AgencyUI !== 'undefined' && AgencyUI.person ? AgencyUI.person(slot) : { status: 'ready', level: 1 };
        const m = MISSIONS[a.kind] || { name: a.kind, icon: '❔' };
        html += '<div class="esp-op' + (a.kind !== 'idle' ? ' active' : '') + '">' + GameVisuals.person(p) + '<div class="esp-op-info"><b>' + esc(p?.name || '諜報員 ' + (slot + 1)) + '</b>' +
          '<div class="esp-op-status">' + (inOp ? '🎯 作戦参加中' : st.status === 'wounded' ? '🤕 負傷 (' + (st.days || 0) + '日)' : m.icon + ' ' + m.name + (a.target ? ' → ' + esc(nameOf(a.target)) : '') + (a.preparation > 0 ? ' (準備 ' + a.preparation + '日)' : a.kind !== 'idle' ? ' (実行中)' : '')) + '</div></div>' +
          '<div class="esp-op-actions">' + Object.entries(MISSIONS).map(([k, d]) => '<button class="esp-btn small' + (a.kind === k ? ' on' : '') + '" ' + (inOp ? 'disabled' : '') + ' title="' + esc(d.desc) + '" onclick="Espionage.assign(' + slot + ',\'' + k + '\')">' + d.icon + ' ' + d.name + '</button>').join('') + '</div></div>';
      }
      html += '</div>';
      return html;
    },
    renderIntel() {
      const i = ensure(), tag = i.selected;
      if (!tag) return '<div class="esp-section"><p>対象国がありません。</p></div>';
      const t = target(tag), r = Espionage.report(tag), lv = Espionage.level(tag);
      let html = '<div class="esp-section"><h4>' + esc(nameOf(tag)) + ' — インテルレベル <span class="esp-badge lv' + lv + '">' + TIERS[lv] + '</span></h4>' +
        '<div class="esp-net big"><em style="width:' + t.network.toFixed(0) + '%"></em><span>諜報網 ' + t.network.toFixed(1) + '%</span></div>' +
        '<div class="esp-domains">' + DOMAINS.map(([k, n, ic]) => '<div><span>' + ic + ' ' + n + '</span><div class="esp-bar"><em class="t' + tier(t.intel[k]) + '" style="width:' + t.intel[k].toFixed(0) + '%"></em></div><b>' + t.intel[k].toFixed(0) + '% ' + TIERS[tier(t.intel[k])] + '</b></div>').join('') + '</div>' +
        '<p class="sn-help">暗号解読: ' + (t.decoded ? '✅ 完了' : t.cipherActive ? Math.round(t.cipherPoints || 0) + ' / ' + (t.cipherStrength || 600) : '未着手') + (t.revealUntil > today() ? ' ／ 暗号暴露中 (残り ' + (t.revealUntil - today()) + '日)' : '') + '</p></div>';
      html += '<div class="esp-report">' + DOMAINS.map(([k, n, ic]) => {
        const rows = Object.entries(r[k]);
        return '<div class="esp-section"><h4>' + ic + ' ' + n + '情報</h4>' + (rows.length ? '<table class="esp-table">' + rows.map(([a, b]) => '<tr><th>' + esc(a) + '</th><td>' + esc(b) + '</td></tr>').join('') + '</table>' : '<p class="sn-help">インテル不足 (20%以上で断片情報)</p>') +
          '<small class="esp-thresholds">' + (k === 'civ' ? '20%: 体制・指導者 ／ 40%: 安定度・国家方針 ／ 60%: 工場数 ／ 80%: 州・インフラ' : k === 'army' ? '20%: 師団数 ／ 40%: 編成 ／ 50%: 地図に配置表示 ／ 80%: 任務表示' : k === 'navy' ? '20%: 艦隊数 ／ 40%: 艦艇数 ／ 60%: 地図に位置表示' : '20%: 航空基地 ／ 40%: 航空機数 ／ 60%: 正確な制空戦力') + '</small></div>';
      }).join('') + '</div>';
      html += '<div class="esp-actions"><button class="esp-btn" onclick="MapRenderer.centerOn && MapRenderer.centerOn(\'' + tag + '\')">🗺️ 地図で表示</button>' +
        (t.decoded && t.revealUntil <= today() && typeof AgencyUI !== 'undefined' ? '<button class="esp-btn primary" onclick="AgencyUI.reveal()">🔓 暗号を暴露 (30日間 戦闘効率 +15%)</button>' : '') +
        (typeof CountryDossier !== 'undefined' ? '<button class="esp-btn" onclick="CountryDossier.open(\'' + tag + '\')">🏛️ 政府情報</button>' : '') + '</div>';
      return html;
    },
    renderOperations() {
      const i = ensure(), tag = i.selected, t = tag ? target(tag) : null;
      let html = '<div class="esp-section"><h4>潜入作戦 <small>対象: ' + esc(nameOf(tag)) + '</small></h4>';
      if (typeof AgencyUI === 'undefined' || !AgencyUI.ops) return html + '<p>作戦モジュールが読み込まれていません。</p></div>';
      const op = i.agencyOperation;
      if (op) html += '<p>🎯 ' + esc(AgencyUI.ops[op.id]?.name || op.id) + ' → ' + esc(nameOf(op.target)) + ' — フェーズ ' + ['準備', '潜入', '実行', '脱出'][Math.min(3, op.phase)] + ' (' + op.days + '日経過)</p><button class="esp-btn" onclick="AgencyUI.cancel()">中止</button>';
      else html += '<div class="esp-tree">' + Object.entries(AgencyUI.ops).map(([id, d]) => '<div class="esp-node' + (t && t.network >= d.network ? '' : ' locked') + '"><div class="esp-node-head"><b>' + esc(d.name) + '</b><span class="esp-badge">諜報網 ' + d.network + '% / 諜報員 ' + d.agents + '名</span></div>' +
        '<button class="esp-btn small" ' + (t && t.network >= d.network ? '' : 'disabled') + ' onclick="AgencyUI.prepare(\'' + id + '\')">準備する</button></div>').join('') + '</div>';
      html += '<p class="sn-help">作戦成功率: ' + Math.round((0.65 + (has('special_forces') ? 0.15 : 0) + (i.branches?.operations ? 0.15 : 0)) * 100) + '%</p></div>';
      return html;
    },

    // ---------- 地図 ----------
    draw(ctx, project) {
      const s = gs(), day = today();
      Object.entries(s.intel?.targets || {}).forEach(([tag, t]) => {
        if (tag === s.country) return;
        target(tag);
        const f = (t.revealUntil > day || t.intel.navy >= 60) ? IntelOperations.forces(tag) : null;
        if (f) f.navy.forEach((n) => { const p = n.zone ? [n.zone.x, n.zone.y] : n.base; if (!p) return; const c = project(...p); ctx.fillStyle = '#e5c274'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('⚓ ' + tag + ' ' + (n.mission || '待機'), c[0], c[1]); });
        if (t.network <= 0 && Espionage.level(tag) === 0) return;
        const entry = Object.entries(MapRenderer.states || {}).find(([, st]) => st.owner === tag);
        const center = entry && MapRenderer.stateCenter.get(entry[0]);
        if (!center) return;
        const p = project(...center), lv = Espionage.level(tag);
        const label = '🕵️ ' + tag + ' 網' + t.network.toFixed(0) + '% ・情報 ' + TIERS[lv];
        ctx.save();
        ctx.font = 'bold 12px sans-serif';
        const w = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(10,14,18,0.75)'; ctx.fillRect(p[0] - w / 2, p[1] + 14, w, 18);
        ctx.strokeStyle = ['#666', '#8a7b4c', '#c9a44c', '#7fc46a', '#3cc464'][lv]; ctx.strokeRect(p[0] - w / 2, p[1] + 14, w, 18);
        ctx.fillStyle = '#e8e2c8'; ctx.textAlign = 'center'; ctx.fillText(label, p[0], p[1] + 27);
        ctx.restore();
      });
    },
    visibleDivisions() {
      if (!MapRenderer.ready || !gs().strategy) return [];
      const s = gs(), day = today(), result = [];
      const tags = new Set([...(s.atWar || [])]);
      Object.entries(s.intel?.targets || {}).forEach(([tag, t]) => { if (t.revealUntil > day || (t.intel && t.intel.army >= 50)) tags.add(tag); });
      tags.forEach((tag) => {
        if (tag === s.country) return;
        const t = target(tag), full = t.revealUntil > day || t.intel.army >= 50, missions = t.revealUntil > day || t.intel.army >= 80;
        const groups = new Map();
        IntelOperations.forces(tag).divisions.filter((d) => !d.defeated).forEach((d) => {
          const pid = d.pid || OffensivePlanner.nearest([d.x, d.y]);
          const visible = full || [...(MapRenderer.provNeighbors.get(pid) || [])].some((n) => MapRenderer.ownerOf(n) === s.country);
          if (!visible) return;
          if (!groups.has(pid)) groups.set(pid, { tag, sid: MapRenderer.stateOf(pid), x: d.x, y: d.y, count: 0, mission: missions ? (d.mission || '駐屯') : null, intel: true });
          groups.get(pid).count++;
        });
        result.push(...groups.values());
      });
      return result;
    },
    hasReveal() {
      const day = today();
      return Object.values(gs().intel?.targets || {}).some((t) => t.revealUntil > day || (t.intel && t.intel.army >= 50));
    },

    init() {
      if (Espionage._inited || typeof IntelOperations === 'undefined') return;
      Espionage._inited = true;
      // 既存ウィンドウを HOI4 風画面に置き換え
      const tpl = document.getElementById('tpl-intel');
      if (tpl) { tpl.dataset.title = '🕵️ 諜報機関 — Agency & Espionage'; tpl.dataset.w = '1180'; tpl.dataset.h = '760'; }
      const oldTick = IntelOperations.tick;
      IntelOperations.tick = function () {
        oldTick.call(this);
        const i = ensure(), day = today();
        if (i.espLastDay === day) return;
        i.espLastDay = day;
        Espionage.daily();
      };
      IntelOperations.render = () => Espionage.render();
      IntelOperations.draw = (ctx, project) => Espionage.draw(ctx, project);
      IntelOperations.visibleDivisions = () => Espionage.visibleDivisions();
      IntelOperations.hasReveal = () => Espionage.hasReveal();
      const oldCounter = IntelOperations.counterPower;
      IntelOperations.counterPower = () => oldCounter.call(IntelOperations) + (has('counterintel') ? 1 : 0);
      // 防諜: 敵の自国諜報網 (存在すれば) を侵食
      if (typeof AgencyUI !== 'undefined') {
        AgencyUI.combatBonus = (tag) => !tag || tag === gs().country ? 0 : ((gs().intel?.targets?.[tag]?.revealUntil || 0) > today() ? 0.15 : 0) + (target(tag).intel.army >= 80 ? 0.05 : 0);
      }
    },
  };
  g.Espionage = Espionage;
})(typeof window !== 'undefined' ? window : globalThis);
