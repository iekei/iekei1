(function () {
  'use strict';
  const Designer = window.EquipmentDesigner;
  if (!Designer) return;
  const labels = { soft: '対人火力', hard: '対甲火力', fire: '対艦火力', armor: '装甲', 'armor+': '装甲', speed: '速度', 'speed+': '速度', aa: '対空火力', torp: '対艦火力' };
  const baseStats = { tank: { soft: 18, hard: 8, armor: 20, speed: 12, reliability: 82 }, ship: { fire: 20, armor: 25, speed: 18, reliability: 78 }, plane: { soft: 12, hard: 8, armor: 5, speed: 30, reliability: 84 } };
  const statValues = { how: { soft: 8 }, at: { hard: 10 }, aa: { aa: 8 }, steel: { armor: 8 }, slope: { armor: 13, reliability: -3 }, gas: { speed: 6 }, diesel: { speed: 9, reliability: 3 }, lgun: { fire: 12 }, tub: { torp: 10 }, radar: { reliability: 5 }, e1: { speed: 8 }, e2: { speed: 14, reliability: -4 }, mg: { soft: 7 }, rocket: { hard: 8 }, plate: { armor: 5, reliability: -2 } };
  const originalCost = Designer.cost.bind(Designer);
  Designer.cost = function (cat) { return originalCost(cat); };
  Designer.xpCost = function (cat) {
    const draft = this.draft[cat];
    const existing = this.designs.find(d => d.cat === cat && d.hullId === draft.hull);
    if (!draft.hull) return 10;
    if (!existing) return 10;
    const changes = Object.keys(this.DATA[cat].slots).filter(() => false).length;
    const changedSlots = this.DATA[cat].slots.filter(s => draft.modules[s.id] !== existing.modules?.[s.id]);
    return changedSlots.reduce((sum, slot) => sum + (slot.id === 'gun' ? 8 : 5), 0) || (draft.name !== existing.name ? 0 : 10);
  };
  Designer.stats = function (cat) {
    const result = { ...(baseStats[cat] || {}) };
    const draft = this.draft[cat];
    Object.values(draft.modules).forEach(id => Object.entries(statValues[id] || {}).forEach(([key, value]) => { result[key] = (result[key] || 0) + value; }));
    return result;
  };
  Designer.pickHull = function (hullId) {
    const hull = this.DATA[this.category].hulls.find(item => item.id === hullId);
    if (hull?.requires && !this.isUnlocked(hull)) {
      GameUI.notify(`研究が必要です: ${hull.requires}`, 'alert');
      return;
    }
    this.draft[this.category].hull = hullId;
    this.render();
  };
  Designer.isUnlocked = function (option) {
    if (!option.requires) return true;
    const requirements = Array.isArray(option.requires) ? option.requires : [option.requires];
    const manager = window.ResearchManager;
    return requirements.every(requirement => Boolean(manager?.completed?.includes?.(requirement) || manager?.isResearched?.(requirement)));
  };
  const originalPickModule = Designer.pickModule.bind(Designer);
  Designer.pickModule = function (slotId, optionId) {
    const option = this.DATA[this.category].slots.find(slot => slot.id === slotId)?.options.find(item => item.id === optionId);
    if (option && !this.isUnlocked(option)) {
      GameUI.notify(`研究が必要です: ${option.requires}`, 'alert');
      return;
    }
    originalPickModule(slotId, optionId);
  };
  Designer.saveDesign = function () {
    const cat = this.category, draft = this.draft[cat], data = this.DATA[cat], gs = CoreEngine.gameState;
    if (!draft.hull) return GameUI.notify('車体・船体・機体を選択してください。', 'alert');
    const cost = this.xpCost(cat), xp = Number(gs.xp[data.xpKey] || 0);
    if (xp < cost) return GameUI.notify(`${data.label}XPが不足しています（必要 ${cost} XP）。`, 'alert');
    const name = draft.name?.trim() || `${data.hulls.find(h => h.id === draft.hull).name} 設計案`;
    gs.xp[data.xpKey] = xp - cost;
    const design = { id: 'd' + Date.now(), cat, name, hullId: draft.hull, modules: { ...draft.modules }, cost, stats: data.slots.map(s => `${s.name}: ${s.options.find(o => o.id === draft.modules[s.id])?.name || '未装備'}`) };
    this.designs.push(design);
    CoreEngine.log(`兵器設計完了: ${name}（-${cost} XP）`);
    GameUI.notify(`設計を保存しました: ${name}`, 'success');
    MultiplayerManager.broadcast({ type: 'design', design });
    this.render();
  };
  Designer.render = function () {
    const el = document.getElementById('designer-content'); if (!el) return;
    const cat = this.category, data = this.DATA[cat], draft = this.draft[cat], gs = CoreEngine.gameState, stats = this.stats(cat), cost = this.xpCost(cat), xp = Number(gs.xp[data.xpKey] || 0);
    const country = gs.country || 'generic', hull = data.hulls.find(h => h.id === draft.hull);
    const image = { src: '/game/assets/blueprints/aircraft-blueprint.png', fallback: '/game/assets/blueprints/aircraft-blueprint.png' };
    const statRows = [['ICコスト', this.cost(cat)], ['対人火力', stats.soft || 0], ['対甲火力', stats.hard || 0], ['対艦火力', stats.fire || 0], ['装甲', stats.armor || 0], ['速度', stats.speed || 0], ['信頼性', `${Math.max(0, stats.reliability || 0)}%`]];
    if (cat === 'plane' && Number(this.performance(cat).rangeBonus) > 0) {
      statRows.push(['航続距離', '+' + Math.round(this.performance(cat).rangeBonus * 100) + '%']);
      statRows.push(['機動性ペナルティ', '-' + Math.round(this.performance(cat).mobilityPenalty * 100) + '%']);
    }
    el.innerHTML = `<div class="designer-shell"><div class="designer-tabs">${Object.entries(this.DATA).map(([key, value]) => `<button class="${key === cat ? 'active' : ''}" onclick="EquipmentDesigner.setCategory('${key}')">${value.label} · ${Math.floor(gs.xp[value.xpKey] || 0)} XP</button>`).join('')}</div><div class="designer-toolbar"><label for="design-name">設計名称</label><input id="design-name" value="${draft.name || ''}" placeholder="例: 一号戦車改" oninput="EquipmentDesigner.draft.${cat}.name=this.value"><span>国家: ${country}</span></div><div class="designer-grid"><section class="designer-card"><h3>兵器グラフィック</h3><div class="designer-preview"><img alt="${hull?.name || data.label}" src="${image.src}" onerror="this.onerror=null;this.src='${image.fallback}'"></div><h4>基礎車体 / 船体</h4><div class="designer-slots">${data.hulls.map(h => `<label class="designer-slot"><span><input type="radio" name="hull" ${draft.hull === h.id ? 'checked' : ''} onchange="EquipmentDesigner.pickHull('${h.id}')"> ${h.name}</span><strong>${h.cost} IC</strong></label>`).join('')}</div></section><section class="designer-card"><h3>モジュール構成</h3><div class="designer-slots">${data.slots.map(slot => `<label class="designer-slot"><span>${slot.name}</span><select onchange="EquipmentDesigner.pickModule('${slot.id}',this.value)"><option value="">未選択</option>${slot.options.map(option => { const unlocked = this.isUnlocked(option); return `<option value="${option.id}" ${draft.modules[slot.id] === option.id ? 'selected' : ''} ${unlocked ? '' : 'disabled'}>${unlocked ? '' : '🔒 '}${option.name} · ${option.cost} IC${unlocked ? '' : `（研究: ${Array.isArray(option.requires) ? option.requires.join(' / ') : option.requires}）`}</option>`; }).join('')}</select></label>`).join('')}</div><h3 style="margin-top:16px">性能</h3>${statRows.map(([label, value]) => `<div class="designer-stat"><span>${label}</span><strong>${value}</strong></div>`).join('')}</section></div><div class="designer-footer"><div class="designer-xp"><span>必要XP: <strong>${cost}</strong> / 所持XP: <strong>${Math.floor(xp)}</strong></span><meter min="0" max="100" value="${Math.min(100, xp)}"></meter></div><button class="designer-save" ${xp < cost ? 'disabled' : ''} onclick="EquipmentDesigner.saveDesign()">保存してXPを消費</button></div></div>`;
  };
})();
