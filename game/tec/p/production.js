let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
let techDataAll = {};
let resources = JSON.parse(localStorage.getItem('resources') || JSON.stringify({
  石油: 500, アルミ: 500, ゴム: 500, タングステン: 300, 鋼材: 1000, クロム: 300, 石炭: 800
}));
let productionLines = JSON.parse(localStorage.getItem('productionLines') || '[]');
let tradeQueue = JSON.parse(localStorage.getItem('tradeQueue') || '[]'); // 輸入注文キュー
let showOldEquipment = false;

let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllTechsForProduction();
  initProductionUIControls();
  initSharedClock();
  renderProductionView();
});

// --- 輸入システム関連 ---

function openImport(resName) {
  const panel = document.getElementById('import-panel');
  panel.style.display = 'block';
  document.getElementById('import-title').textContent = `輸入設定: ${resName}`;
  
  // 国リストの生成（仮データ）
  const list = document.getElementById('country-list');
  list.innerHTML = `
    <div class="country-row" style="padding: 5px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between;">
      <span>🇺🇸 アメリカ</span><span>産出量: 500</span>
    </div>
    <div class="country-row" style="padding: 5px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between;">
      <span>🇩🇪 ドイツ</span><span>産出量: 400</span>
    </div>
  `;

  const slider = document.getElementById('import-slider');
  slider.oninput = (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('slider-value').textContent = val;
    document.getElementById('req-civ').textContent = Math.floor(val / 50);
    document.getElementById('req-convoy').textContent = Math.ceil(val / 50) * 5;
  };

  document.getElementById('exec-import-btn').onclick = () => {
    const amount = parseInt(slider.value);
    const deliveryDate = new Date(gameDate);
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    
    tradeQueue.push({ res: resName, amount: amount, deliveryDate: deliveryDate.toISOString() });
    localStorage.setItem('tradeQueue', JSON.stringify(tradeQueue));
    alert(`${resName} を ${amount} 輸入手配しました。3日後に到着します。`);
    panel.style.display = 'none';
  };
}

// --- 既存の機能 ---

async function loadAllTechsForProduction() {
  const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
  for (const cat of categories) {
    try {
      const res = await fetch(`../data/tech_${cat}.json`);
      if (res.ok) {
        const list = await res.json();
        list.forEach(tech => { tech.category = cat; techDataAll[tech.id] = tech; });
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

  completedTechs.forEach(id => {
    const tech = techDataAll[id];
    if (!tech) return;
    const resCost = getTechResourceCost(tech);
    let costHtml = Object.entries(resCost).map(([resName, amt]) => {
      return `<span style="margin-right: 6px;"><img src="image/${resName}.png" class="res-icon-inline" alt="${resName}">${amt}</span>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `<h4>${tech.title}</h4><div>${costHtml}</div><button class="action-btn" onclick="startProductionLine('${tech.id}')">生産開始</button>`;
    container.appendChild(card);
  });
}

function startProductionLine(techId) {
  productionLines.push({ id: Date.now(), techId: techId, factories: 1, producedCount: 0, isShortage: false });
  saveProductionData();
  renderProductionLines();
}

function renderProductionLines() {
  const container = document.getElementById('production-lines-list');
  if (!container) return;
  container.innerHTML = '';
  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;
    const card = document.createElement('div');
    card.className = 'line-card';
    card.innerHTML = `<div>${tech.title} (工場: ${line.factories})</div><button onclick="removeLine(${line.id})">廃止</button>`;
    container.appendChild(card);
  });
}

function removeLine(lineId) {
  productionLines = productionLines.filter(l => l.id !== lineId);
  saveProductionData();
  renderProductionLines();
}

function updateResourceDisplay() {
  for (const [resName, val] of Object.entries(resources)) {
    const el = document.getElementById(`res-${resName}`);
    if (el) el.textContent = val;
  }
}

function initSharedClock() {
  setInterval(() => {
    if (gameSpeed === 0) return;

    // 1日進める
    gameDate.setDate(gameDate.getDate() + 1);
    
    // 3日後の輸入反映チェック
    tradeQueue = tradeQueue.filter(order => {
      if (new Date(order.deliveryDate) <= gameDate) {
        resources[order.res] = (resources[order.res] || 0) + order.amount;
        return false;
      }
      return true;
    });
    localStorage.setItem('tradeQueue', JSON.stringify(tradeQueue));

    // 生産処理（既存ロジック）
    productionLines.forEach(line => {
       // ... ここに既存の資源消費・生産処理を記述 ...
    });

    saveProductionData();
    renderProductionView();
    document.getElementById('calendar-display').textContent = gameDate.toLocaleDateString();
  }, 1000); // 速度に応じた間隔調整は既存ロジックを流用
}
