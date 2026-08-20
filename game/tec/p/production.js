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
  container.innerHTML = '';

  completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');

  if (completedTechs.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">まだ研究が完了している装備がありません。<br>研究ツリーで技術を完了させてください。</p>';
    return;
  }

  completedTechs.forEach(techId => {
    const tech = techDataAll[techId];
    if (!tech) return;

    // 1工場あたりの基本日産（例: AK-47なら1工場で1日あたり数個など、データまたはデフォルト値）
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
  container.innerHTML = '';
  document.getElementById('used-factories').textContent = getTotalUsedFactories();

  if (productionLines.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">稼働中の生産ラインはありません。</p>';
    return;
  }

  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;

    const baseRate = tech.base_daily_rate || 2;
    const currentDailyOutput = baseRate * line.factories; // 工場数に応じた1日あたりの生産量

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
          <div class="progress-bar-fill" style="width: ${line.progress}%"></div>
        </div>
      </div>
      <button class="action-btn danger" onclick="removeLine(${line.id})" style="margin-left: 10px;">廃止</button>
    `;
    container.appendChild(card);
  });
}

function updateResourceDisplay() {
  document.getElementById('res-steel').textContent = resources.steel;
  document.getElementById('res-aluminum').textContent = resources.aluminum;
  document.getElementById('res-cards').textContent = `${resources.cards}枚 (${resources.cards * 100})`;
}

// 研究ツリー側（index.html）と時間を完全同期する時計・処理
function initSharedClock() {
  setInterval(() => {
    // LocalStorageからメイン画面で進められた時間やスピード状態を読み込む（または同期させる）
    const savedDateStr = localStorage.getItem('gameDate');
    const speed = parseInt(localStorage.getItem('gameSpeed') || '0');

    if (speed === 0) return; // 停止中なら進めない

    let currentDate = savedDateStr ? new Date(savedDateStr) : new Date(1936, 0, 1);
    currentDate.setDate(currentDate.getDate() + speed);
    
    localStorage.setItem('gameDate', currentDate.toISOString());
    document.getElementById('calendar-display').textContent = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日`;

    // 1日経過ごとの生産進行処理
    productionLines.forEach(line => {
      const tech = techDataAll[line.techId];
      if (!tech) return;

      const baseRate = tech.base_daily_rate || 2;
      const dailyProduced = baseRate * line.factories * speed; // スピードと工場数に応じた日産分を加算
      
      line.progress += dailyProduced;
      // 100個たまったら1単位（完成品）としてカウント
      while (line.progress >= 100) {
        line.progress -= 100;
        line.producedCount += 1;
      }
    });
    renderProductionLines();
  }, 1000);
}
