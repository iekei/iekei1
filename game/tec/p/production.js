let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
let techDataAll = {};
let resources = JSON.parse(localStorage.getItem('resources') || JSON.stringify({
  石油: 500, アルミ: 500, ゴム: 500, タングステン: 300, 鋼材: 1000, クロム: 300, 石炭: 800
}));
let productionLines = JSON.parse(localStorage.getItem('productionLines') || '[]');
let tradeQueue = JSON.parse(localStorage.getItem('tradeQueue') || '[]');
let showOldEquipment = false;

let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllTechsForProduction();
  initProductionUIControls();
  initSharedClock();
  renderProductionView();

  // 他のタブ（研究・NFなど）からのストレージ変更をリアルタイム検知
  window.addEventListener('storage', (e) => {
    if (e.key === 'completedTechs') {
      completedTechs = JSON.parse(e.newValue || '[]');
      renderProductionView();
    }
    if (e.key === 'gameSpeed') {
      gameSpeed = parseInt(e.newValue || '0', 10);
      updateSpeedButtonUI();
    }
    if (e.key === 'gameDate') {
      gameDate = new Date(e.newValue);
      updateCalendarUI();
    }
  });

  // 定期ポーリングによる確実な同期
  setInterval(() => {
    const latestTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
    if (JSON.stringify(latestTechs) !== JSON.stringify(completedTechs)) {
      completedTechs = latestTechs;
      renderProductionView();
    }
  }, 1000);
});

// --- 資源輸入システム ---
function openImport(resName) {
  const panel = document.getElementById('import-panel');
  if (!panel) return;
  panel.style.display = 'block';
  document.getElementById('import-title').textContent = `輸入設定: ${resName}`;
  
  // 1936年時点の主要産出国データ例 (順不同から輸入量順などに拡張可能)
  const list = document.getElementById('country-list');
  list.innerHTML = `
    <div class="country-row" style="padding: 6px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
      <span>🇺🇸 アメリカ</span><span style="color: #8b949e;">産出量: <b>500</b></span>
    </div>
    <div class="country-row" style="padding: 6px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
      <span>🇩🇪 ドイツ</span><span style="color: #8b949e;">産出量: <b>400</b></span>
    </div>
    <div class="country-row" style="padding: 6px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
      <span>🇬🇧 イギリス</span><span style="color: #8b949e;">産出量: <b>300</b></span>
    </div>
  `;

  const slider = document.getElementById('import-slider');
  if (slider) {
    slider.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      document.getElementById('slider-value').textContent = val;
      document.getElementById('req-civ').textContent = Math.floor(val / 50);
      document.getElementById('req-convoy').textContent = Math.ceil(val / 50) * 5;
    };
  }

  const execBtn = document.getElementById('exec-import-btn');
  if (execBtn) {
    execBtn.onclick = () => {
      const amount = parseInt(slider.value, 10);
      const deliveryDate = new Date(gameDate);
      deliveryDate.setDate(deliveryDate.getDate() + 3);
      
      tradeQueue.push({ res: resName, amount: amount, deliveryDate: deliveryDate.toISOString() });
      localStorage.setItem('tradeQueue', JSON.stringify(tradeQueue));
      alert(`${resName} を ${amount} 輸入手配しました。3日後に到着します。`);
      panel.style.display = 'none';
    };
  }
}

// --- 技術データのロード ---
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
  renderAvailableTechs();
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

function saveProductionData() {
  localStorage.setItem('productionLines', JSON.stringify(productionLines));
  localStorage.setItem('resources', JSON.stringify(resources));
}

function renderProductionView() {
  renderAvailableTechs();
  renderProductionLines();
  updateResourceDisplay();
  updateTotalStatsSummary();
}

function getTechResourceCost(tech) {
  const cat = tech.category;
  if (cat === 'air') return { アルミ: 2, 石油: 1, 鋼材: 1 };
  if (cat === 'armor') return { 鋼材: 3, ゴム: 1, 石油: 1 };
  if (cat === 'naval') return { 鋼材: 6, クロム: 2, 石油: 2 };
  if (cat === 'artillery') return { 鋼材: 2, タングステン: 1 };
  return { 鋼材: 1, 石炭: 1 };
}

function renderAvailableTechs() {
  const container = document.getElementById('tech-list-to-produce');
  if (!container) return;
  container.innerHTML = '';

  if (completedTechs.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">まだ研究が完了している装備がありません。<br>研究ツリーで技術を完了させてください。</p>';
    return;
  }

  completedTechs.forEach(id => {
    const tech = techDataAll[id];
    if (!tech) return;

    const resCost = getTechResourceCost(tech);
    let costHtml = Object.entries(resCost).map(([resName, amt]) => {
      return `<span style="margin-right: 6px;"><img src="image/${resName}.png" class="res-icon-inline" alt="${resName}">${amt}</span>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <h4>${tech.title}</h4>
        <div style="font-size: 11px; color: #8b949e; margin-top: 4px;">必要資源(1日分/1工場あたり): ${costHtml}</div>
      </div>
      <button class="action-btn" onclick="startProductionLine('${tech.id}')">生産開始</button>
    `;
    container.appendChild(card);
  });
}

function getBaseDailyRate(tech) {
  if (tech.base_daily_rate) return tech.base_daily_rate;
  const cat = tech.category;
  if (cat === 'infantry' || cat === 'artillery') return 10;
  if (cat === 'armor') return 3;
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
    producedCount: 0,
    isShortage: false
  });
  saveProductionData();
  renderProductionLines();
}

function adjustFactories(lineId, delta) {
  const line = productionLines.find(l => l.id === lineId);
  if (!line) return;
  if (line.factories + delta < 1) return;
  line.factories += delta;
  saveProductionData();
  renderProductionLines();
}

function removeLine(lineId) {
  productionLines = productionLines.filter(l => l.id !== lineId);
  saveProductionData();
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
    const dailyOutput = Math.floor(baseRate * line.factories);

    let statusText = `生産数: <b style="color: #3fb950; font-size: 15px;">${line.producedCount}</b> 個`;
    if (line.isShortage) {
      statusText = `<span style="color: #f85149; font-weight: bold;">⚠️ 資源不足により生産停止中</span>`;
    }

    const card = document.createElement('div');
    card.className = `line-card ${line.isShortage ? 'shortage-line' : ''}`;
    card.innerHTML = `
      <div class="line-details" style="flex: 1;">
        <strong>${tech.title}</strong>
        <div>${statusText}</div>
        <div style="font-size: 12px; color: #8b949e; margin-top: 2px;">1日生産量: <b>${dailyOutput}</b> 個 (工場数: ${line.factories})</div>
        <div class="factory-controls" style="margin-top: 6px;">
          工場割当: 
          <button onclick="adjustFactories(${line.id}, -1)">-</button>
          <span>${line.factories}</span>
          <button onclick="adjustFactories(${line.id}, 1)">+</button>
        </div>
      </div>
      <button class="action-btn danger" onclick="removeLine(${line.id})" style="margin-left: 10px;">廃止</button>
    `;
    container.appendChild(card);
  });

  updateTotalStatsSummary();
}

function updateTotalStatsSummary() {
  const summaryContainer = document.getElementById('current-stats-summary');
  if (!summaryContainer) return;
  if (productionLines.length === 0) {
    summaryContainer.innerHTML = '<span style="color: #8b949e;">現在稼働中の生産ラインがありません</span>';
    return;
  }
  summaryContainer.innerHTML = `<span style="color: #58a6ff; font-size: 13px;">📦 稼働中生産ライン数: <b>${productionLines.length}</b> 枠</span>`;
}

function updateResourceDisplay() {
  for (const [resName, val] of Object.entries(resources)) {
    const el = document.getElementById(`res-${resName}`);
    if (el) el.textContent = val;
  }
}

function updateCalendarUI() {
  const calEl = document.getElementById('calendar-display');
  if (calEl) {
    calEl.textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;
  }
}

function updateSpeedButtonUI() {
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
  if (gameSpeed === 0) {
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) pauseBtn.classList.add('active');
  } else {
    const targetBtn = document.querySelector(`.speed-btn[data-speed="${gameSpeed}"]`);
    if (targetBtn) targetBtn.classList.add('active');
  }
}

// --- 共通クロック・全画面時間/速度連動システム ---
function initSharedClock() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const speedAttr = e.target.getAttribute('data-speed');
      gameSpeed = speedAttr !== null ? parseInt(speedAttr, 10) : 0;
      
      localStorage.setItem('gameSpeed', gameSpeed);
      updateSpeedButtonUI();
      runTick();
    });
  });

  updateCalendarUI();
  updateSpeedButtonUI();

  const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };
  let gameTimer = null;

  function runTick() {
    if (gameTimer) clearInterval(gameTimer);
    gameSpeed = parseInt(localStorage.getItem('gameSpeed') || '0', 10);

    if (gameSpeed > 0) {
      const interval = speedIntervals[gameSpeed] || 1000;
      gameTimer = setInterval(() => {
        // ローカルストレージから最新の日時と速度を同期取得
        const savedDateStr = localStorage.getItem('gameDate');
        if (savedDateStr) {
          gameDate = new Date(savedDateStr);
        }

        // 1日進行
        gameDate.setDate(gameDate.getDate() + 1);
        localStorage.setItem('gameDate', gameDate.toISOString());
        updateCalendarUI();

        // 3日後の輸入反映チェック
        tradeQueue = tradeQueue.filter(order => {
          if (new Date(order.deliveryDate) <= gameDate) {
            resources[order.res] = (resources[order.res] || 0) + order.amount;
            return false;
          }
          return true;
        });
        localStorage.setItem('tradeQueue', JSON.stringify(tradeQueue));

        // 生産と資源消費の処理
        productionLines.forEach(line => {
          const tech = techDataAll[line.techId];
          if (!tech) return;

          const resCost = getTechResourceCost(tech);
          let canProduce = true;

          for (const [resName, costPerFac] of Object.entries(resCost)) {
            const totalNeeded = costPerFac * line.factories;
            if ((resources[resName] || 0) < totalNeeded) {
              canProduce = false;
              break;
            }
          }

          if (canProduce) {
            for (const [resName, costPerFac] of Object.entries(resCost)) {
              resources[resName] -= costPerFac * line.factories;
            }
            line.isShortage = false;

            const baseRate = getBaseDailyRate(tech);
            const dailyProduced = Math.floor(baseRate * line.factories);
            line.producedCount += dailyProduced;
          } else {
            line.isShortage = true;
          }
        });

        saveProductionData();
        renderProductionView();
      }, interval);
    }
  }

  if (gameSpeed > 0) {
    runTick();
  }
}
