let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
let techDataAll = {};

// 資源データ
let resources = {
  cards: 10,
  steel: 500,
  aluminum: 300
};

// LocalStorageから生産ラインのデータを復元
let productionLines = JSON.parse(localStorage.getItem('productionLines') || '[]');
let showOldEquipment = false;

// LocalStorageから時間・スピードを復元
let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllTechsForProduction();
  initProductionUIControls();
  initSharedClock();
  renderProductionView();

  window.addEventListener('storage', (e) => {
    if (e.key === 'completedTechs') {
      completedTechs = JSON.parse(e.newValue || '[]');
      renderProductionView();
    }
  });

  setInterval(() => {
    const latestTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
    if (JSON.stringify(latestTechs) !== JSON.stringify(completedTechs)) {
      completedTechs = latestTechs;
      renderProductionView();
    }
  }, 1000);
});

async function loadAllTechsForProduction() {
  const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
  for (const cat of categories) {
    try {
      const res = await fetch(`../data/tech_${cat}.json`);
      if (res.ok) {
        const list = await res.json();
        list.forEach(tech => { 
          tech.category = cat;
          techDataAll[tech.id] = tech; 
        });
      }
    } catch (e) { console.error(e); }
  }
}

function initProductionUIControls() {
  const toggleOldBtn = document.getElementById('toggle-old-equip-btn');
  if (toggleOldBtn) {
    toggleOldBtn.addEventListener('click', () => {
      showOldEquipment = !showOldEquipment;
      toggleOldBtn.textContent = showOldEquipment ? '旧式装備を隠す' : '旧式装備を表示';
      renderAvailableTechs();
    });
  }
}

function saveProductionLines() {
  localStorage.setItem('productionLines', JSON.stringify(productionLines));
}

function renderProductionView() {
  renderAvailableTechs();
  renderProductionLines();
  updateResourceDisplay();
  updateTotalStatsSummary();
}

function renderAvailableTechs() {
  const container = document.getElementById('tech-list-to-produce');
  if (!container) return;
  container.innerHTML = '';

  if (completedTechs.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">まだ研究が完了している装備がありません。<br>研究ツリーで技術を完了させてください。</p>';
    return;
  }

  const unlockedTechs = completedTechs.map(id => techDataAll[id]).filter(Boolean);

  const latestTechsMap = {};
  unlockedTechs.forEach(tech => {
    const cat = tech.category || 'other';
    const year = tech.year || 1936;
    if (!latestTechsMap[cat] || year > latestTechsMap[cat].year) {
      latestTechsMap[cat] = { year: year };
    }
  });

  unlockedTechs.forEach(tech => {
    const cat = tech.category || 'other';
    const maxYearInCat = latestTechsMap[cat] ? latestTechsMap[cat].year : 1936;
    const isLatest = (tech.year || 1936) >= maxYearInCat;

    if (!showOldEquipment && !isLatest) return;

    const baseDailyRate = getBaseDailyRate(tech);
    const card = document.createElement('div');
    card.className = `item-card ${isLatest ? 'latest-equip' : 'old-equip'}`;
    card.innerHTML = `
      <div class="item-info">
        <h4>${tech.title} ${isLatest ? '<span class="badge-latest">最新</span>' : '<span class="badge-old">旧式</span>'}</h4>
        <p>1工場日産: <b>${Math.floor(baseDailyRate)}</b> 個/日 | 開発年: ${tech.year || 1936}年</p>
      </div>
      <button class="action-btn" onclick="startProductionLine('${tech.id}')">生産開始</button>
    `;

    card.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    card.addEventListener('mouseleave', hideTooltip);

    container.appendChild(card);
  });
}

function getBaseDailyRate(tech) {
  if (tech.base_daily_rate) return tech.base_daily_rate;
  if (tech.title.includes('AVS') || tech.title.includes('小銃') || tech.title.includes('歩兵')) return 10; // ご要望に合わせ歩兵等は10個/日に設定
  const cat = tech.category;
  if (cat === 'infantry' || cat === 'artillery') return 10;
  if (cat === 'armor') {
    if (tech.title.includes('重') || tech.title.includes('駆逐')) return 1;
    return 3;
  }
  if (cat === 'air') return 2;
  if (cat === 'naval') return 0.1;
  return 5;
}

function startProductionLine(techId) {
  const tech = techDataAll[techId];
  if (!tech) return;

  productionLines.push({
    id: Date.now(),
    techId: techId,
    factories: 1,
    producedCount: 0
  });
  saveProductionLines();
  renderProductionLines();
}

function adjustFactories(lineId, delta) {
  const line = productionLines.find(l => l.id === lineId);
  if (!line) return;
  if (line.factories + delta < 1) return;

  line.factories += delta;
  saveProductionLines();
  renderProductionLines();
}

function removeLine(lineId) {
  productionLines = productionLines.filter(l => l.id !== lineId);
  saveProductionLines();
  renderProductionLines();
}

function getTotalUsedFactories() {
  return productionLines.reduce((sum, l) => sum + l.factories, 0);
}

function renderProductionLines() {
  const container = document.getElementById('production-lines-list');
  if (!container) return;
  container.innerHTML = '';
  
  const usedFacEl = document.getElementById('used-factories');
  if (usedFacEl) usedFacEl.textContent = getTotalUsedFactories();

  if (productionLines.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">稼働中の生産ラインはありません。</p>';
    updateTotalStatsSummary();
    return;
  }

  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;

    const baseRate = getBaseDailyRate(tech);
    const dailyOutput = Math.floor(baseRate * line.factories); // 1日あたりの生産量（切り捨て整数）

    const card = document.createElement('div');
    card.className = 'line-card';
    card.innerHTML = `
      <div class="line-details" style="flex: 1;">
        <strong>${tech.title}</strong>
        <div>生産ストック数: <b style="color: #3fb950; font-size: 15px;">${line.producedCount}</b> 個</div>
        <div style="font-size: 12px; color: #8b949e; margin-top: 2px;">1日あたりの生産量: <b>${dailyOutput}</b> 個 (工場数: ${line.factories})</div>
        <div class="factory-controls" style="margin-top: 6px;">
          工場割当: 
          <button onclick="adjustFactories(${line.id}, -1)">-</button>
          <span>${line.factories}</span>
          <button onclick="adjustFactories(${line.id}, 1)">+</button>
        </div>
      </div>
      <button class="action-btn danger" onclick="removeLine(${line.id})" style="margin-left: 10px;">廃止</button>
    `;

    card.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    card.addEventListener('mouseleave', hideTooltip);

    container.appendChild(card);
  });

  updateTotalStatsSummary();
}

function updateTotalStatsSummary() {
  const summaryContainer = document.getElementById('current-stats-summary');
  if (!summaryContainer) return;

  const activeTechsMap = {};
  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (tech) {
      activeTechsMap[tech.category || 'other'] = tech;
    }
  });

  const activeTechs = Object.values(activeTechsMap);
  if (activeTechs.length === 0) {
    summaryContainer.innerHTML = '<span style="color: #8b949e;">現在稼働中の生産ラインがありません</span>';
    return;
  }

  let totalAntiInfantry = 0;
  let totalAntiArmor = 0;
  let totalMobility = 0;
  let totalSurvivability = 0;

  activeTechs.forEach(tech => {
    if (tech.effects && Array.isArray(tech.effects)) {
      tech.effects.forEach(eff => {
        const matchNum = eff.match(/([+-]?\d+(?:\.\d+)?)/);
        const val = matchNum ? parseFloat(matchNum[1]) : 5;
        if (eff.includes('対人') || eff.includes('攻撃')) totalAntiInfantry += val;
        if (eff.includes('対物') || eff.includes('貫通') || eff.includes('装甲')) totalAntiArmor += val;
        if (eff.includes('機動') || eff.includes('速度')) totalMobility += val;
        if (eff.includes('防御') || eff.includes('生存') || eff.includes('信頼')) totalSurvivability += val;
      });
    } else {
      totalAntiInfantry += 10;
      totalMobility += 5;
      totalSurvivability += 5;
    }
  });

  const totalAttack = totalAntiInfantry + totalAntiArmor;

  summaryContainer.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 6px; color: #58a6ff; font-size: 13px;">📊 現在生産中装備の総合ステータス</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px; color: #c9d1d9;">
      <div>⚔️ 総合攻撃力: <b>+${totalAttack.toFixed(0)}</b></div>
      <div>🎯 対人/対物攻撃: <b>+${totalAntiInfantry.toFixed(0)} / +${totalAntiArmor.toFixed(0)}</b></div>
      <div>🏃 機動力: <b>+${totalMobility.toFixed(0)}</b></div>
      <div>🛡️ 生存力(防御): <b>+${totalSurvivability.toFixed(0)}</b></div>
    </div>
  `;
}

function showTooltip(e, tech) {
  let tooltip = document.getElementById('production-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'production-tooltip';
    tooltip.className = 'custom-tooltip hidden';
    document.body.appendChild(tooltip);
  }

  const effectsHtml = (tech.effects || []).map(eff => `<div>• ${eff}</div>`).join('');
  tooltip.innerHTML = `
    <div style="font-weight: bold; border-bottom: 1px solid #30363d; margin-bottom: 4px; padding-bottom: 2px;">${tech.title} (${tech.year || 1936}年)</div>
    <div style="font-size: 11px; color: #8b949e; margin-bottom: 4px;">${tech.desc || '詳細データなし'}</div>
    <div style="font-size: 11px; color: #3fb950;">${effectsHtml || '特殊効果なし'}</div>
  `;

  tooltip.classList.remove('hidden');
  moveTooltip(e);
  e.currentTarget.addEventListener('mousemove', moveTooltip);
}

function moveTooltip(e) {
  const tooltip = document.getElementById('production-tooltip');
  if (tooltip) {
    tooltip.style.left = `${e.clientX + 15}px`;
    tooltip.style.top = `${e.clientY + 15}px`;
  }
}

function hideTooltip() {
  const tooltip = document.getElementById('production-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

function updateResourceDisplay() {
  const steelEl = document.getElementById('res-steel');
  const alumEl = document.getElementById('res-aluminum');
  const cardsEl = document.getElementById('res-cards');
  
  if (steelEl) steelEl.textContent = resources.steel;
  if (alumEl) alumEl.textContent = resources.aluminum;
  if (cardsEl) cardsEl.textContent = `${resources.cards}枚 (${resources.cards * 100})`;
}

function updateCalendarUI() {
  const calEl = document.getElementById('calendar-display');
  if (calEl) {
    calEl.textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;
  }
}

// 速度変更ボタン・時間同期システム（1日経過するごとに生産数を直接加算）
function initSharedClock() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    const speed = parseInt(btn.getAttribute('data-speed'), 10);
    if (speed === gameSpeed) {
      btn.classList.add('active');
    } else if (gameSpeed === 0 && btn.id === 'btn-pause') {
      btn.classList.add('active');
    }

    btn.addEventListener('click', (e) => {
      gameSpeed = parseInt(e.target.getAttribute('data-speed'), 10) || 0;
      localStorage.setItem('gameSpeed', gameSpeed);

      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      runTick();
    });
  });

  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      gameSpeed = 0;
      localStorage.setItem('gameSpeed', 0);
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      pauseBtn.classList.add('active');
      runTick();
    });
  }

  updateCalendarUI();

  const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };
  let gameTimer = null;

  function runTick() {
    if (gameTimer) clearInterval(gameTimer);
    gameSpeed = parseInt(localStorage.getItem('gameSpeed') || '0', 10);

    if (gameSpeed > 0) {
      const interval = speedIntervals[gameSpeed] || 1000;
      gameTimer = setInterval(() => {
        const savedDateStr = localStorage.getItem('gameDate');
        if (savedDateStr) {
          gameDate = new Date(savedDateStr);
        }

        // 1日進める
        gameDate.setDate(gameDate.getDate() + 1);
        localStorage.setItem('gameDate', gameDate.toISOString());
        updateCalendarUI();

        // 1日進んだタイミングで、各生産ラインの日産量をそのまま生産数ストックに加算
        productionLines.forEach(line => {
          const tech = techDataAll[line.techId];
          if (!tech) return;

          const baseRate = getBaseDailyRate(tech);
          const dailyProduced = Math.floor(baseRate * line.factories);
          
          line.producedCount += dailyProduced; // 1日経つごとに日産量がまるごと増える
        });

        saveProductionLines();
        renderProductionLines();
      }, interval);
    }
  }

  if (gameSpeed > 0) {
    runTick();
  }
}
