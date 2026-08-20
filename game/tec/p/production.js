let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
let techDataAll = {};

// 資源データ（資源カード1枚 = 100資源）
let resources = {
  cards: 10,
  steel: 500,
  aluminum: 300
};

let productionLines = [];
const MAX_FACTORIES = 30;
const MAX_LINES = 5;

// LocalStorageから保存された日付とスピードを復元（なければ初期値）
let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllTechsForProduction();
  initSharedClock();
  renderProductionView();
});

async function loadAllTechsForProduction() {
  const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
  for (const cat of categories) {
    try {
      const res = await fetch(`../data/tech_${cat}.json`);
      if (res.ok) {
        const list = await res.json();
        list.forEach(tech => { techDataAll[tech.id] = tech; });
      }
    } catch (e) { console.error(e); }
  }
  renderProductionView();
}

function renderProductionView() {
  renderAvailableTechs();
  renderProductionLines();
  updateResourceDisplay();
}

function renderAvailableTechs() {
  const container = document.getElementById('tech-list-to-produce');
  if (!container) return;
  container.innerHTML = '';

  completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');

  if (completedTechs.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">まだ研究が完了している装備がありません。<br>研究ツリーで技術を完了させてください。</p>';
    return;
  }

  completedTechs.forEach(techId => {
    const tech = techDataAll[techId];
    if (!tech) return;

    const baseDailyRate = tech.base_daily_rate || 2; 
    const resType = tech.resource_type || '鋼鉄';
    const resCost = tech.resource_cost || 2;

    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <h4>${tech.title}</h4>
        <p>1工場あたりの日産: <b>${baseDailyRate}</b> 個/日 | 必要資源: ${resCost} (${resType})</p>
      </div>
      <button class="action-btn" onclick="startProductionLine('${tech.id}')">生産開始</button>
    `;
    container.appendChild(card);
  });
}

function startProductionLine(techId) {
  if (productionLines.length >= MAX_LINES) {
    alert('生産ラインは最大5つまでです！');
    return;
  }
  
  productionLines.push({
    id: Date.now(),
    techId: techId,
    factories: 1,
    progress: 0,
    producedCount: 0
  });
  renderProductionLines();
}

function adjustFactories(lineId, delta) {
  const line = productionLines.find(l => l.id === lineId);
  if (!line) return;

  const currentTotal = getTotalUsedFactories();
  const newTotal = currentTotal + delta;

  if (delta > 0 && newTotal > MAX_FACTORIES) {
    alert('軍需工場の総割当数が上限(30個)に達しています！');
    return;
  }
  if (line.factories + delta < 1) return;

  line.factories += delta;
  renderProductionLines();
}

function removeLine(lineId) {
  productionLines = productionLines.filter(l => l.id !== lineId);
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
    return;
  }

  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;

    const baseRate = tech.base_daily_rate || 2;
    const currentDailyOutput = baseRate * line.factories;

    const card = document.createElement('div');
    card.className = 'line-card';
    card.innerHTML = `
      <div class="line-details" style="flex: 1;">
        <strong>${tech.title}</strong>
        <div>生産数: <b>${line.producedCount}</b> 個 (1日あたり: <b>${currentDailyOutput.toFixed(1)}</b> 個)</div>
        <div class="factory-controls">
          工場 (${line.factories}個): 
          <button onclick="adjustFactories(${line.id}, -1)">-</button>
          <button onclick="adjustFactories(${line.id}, 1)">+</button>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${Math.min(100, line.progress)}%"></div>
        </div>
      </div>
      <button class="action-btn danger" onclick="removeLine(${line.id})" style="margin-left: 10px;">廃止</button>
    `;
    container.appendChild(card);
  });
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

// 国家方針・研究画面と完全に同期する時計・時間管理システム
function initSharedClock() {
  // スピードボタンの初期状態とイベントの設定
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

  updateCalendarUI();

  const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };
  let gameTimer = null;

  function runTick() {
    if (gameTimer) clearInterval(gameTimer);
    
    // LocalStorageから最新のスピード状態を再取得
    gameSpeed = parseInt(localStorage.getItem('gameSpeed') || '0', 10);

    if (gameSpeed > 0) {
      const interval = speedIntervals[gameSpeed] || 1000;
      gameTimer = setInterval(() => {
        // 他画面で進められた可能性も考慮してLocalStorageから最新の日付をロード
        const savedDateStr = localStorage.getItem('gameDate');
        if (savedDateStr) {
          gameDate = new Date(savedDateStr);
        }

        // 1日進める
        gameDate.setDate(gameDate.getDate() + 1);
        localStorage.setItem('gameDate', gameDate.toISOString());
        updateCalendarUI();

        // 生産ラインの進行処理（1日ごとの生産量を加算）
        productionLines.forEach(line => {
          const tech = techDataAll[line.techId];
          if (!tech) return;

          const baseRate = tech.base_daily_rate || 2;
          const dailyProduced = baseRate * line.factories;
          
          line.progress += dailyProduced;
          while (line.progress >= 100) {
            line.progress -= 100;
            line.producedCount += 1;
          }
        });
        renderProductionLines();
      }, interval);
    }
  }

  if (gameSpeed > 0) {
    runTick();
  }
}
