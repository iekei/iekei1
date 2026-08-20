// LocalStorage等から研究完了データを受け取る想定（ここではデモ用にサンプル保持も用意）
let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '["ak47", "fighter1"]');
let techDataAll = {};

// 資源データ（資源カード1枚 = 100資源）
let resources = {
  cards: 10,       // 資源カード 10枚 = 1000資源プール
  steel: 500,
  aluminum: 300
};

// 生産ライン（最大5ライン）
let productionLines = [];
const MAX_FACTORIES = 30;
const MAX_LINES = 5;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllTechsForProduction();
  initProductionClock();
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
    } catch (e) { }
  }
  // テスト用ダミーデータ（もしメインツリーから未連携の場合）
  if (!techDataAll['ak47']) {
    techDataAll['ak47'] = { id: 'ak47', title: 'AK-47', base_cost: 20, resource_type: 'steel', resource_cost: 2 };
  }
  if (!techDataAll['fighter1']) {
    techDataAll['fighter1'] = { id: 'fighter1', title: '戦闘機 I型', base_cost: 50, resource_type: 'aluminum', resource_cost: 4 };
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

  completedTechs.forEach(techId => {
    const tech = techDataAll[techId];
    if (!tech) return;

    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="item-info">
        <h4>${tech.title}</h4>
        <p>必要資源: ${tech.resource_cost || 2} (${tech.resource_type || '鋼鉄'}) / 日</p>
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
  // すでに同じラインがあれば追加しない等の制限はお好みで
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

  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;

    // 1日あたりの生産量計算 (例: 工場数に応じて速度アップ、基準コストに基づく進捗)
    const card = document.createElement('div');
    card.className = 'line-card';
    card.innerHTML = `
      <div class="line-details" style="flex: 1;">
        <strong>${tech.title}</strong>
        <div>生産数: <b>${line.producedCount}</b> 機/丁</div>
        <div class="factory-controls">
          工場: 
          <button onclick="adjustFactories(${line.id}, -1)">-</button>
          <span>${line.factories}</span>
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

// ゲーム内時間の連動（簡易シミュレーション）
let prodDate = new Date(1936, 0, 1);
function initProductionClock() {
  setInterval(() => {
    prodDate.setDate(prodDate.getDate() + 1);
    document.getElementById('calendar-display').textContent = `${prodDate.getFullYear()}年${prodDate.getMonth() + 1}月${prodDate.getDate()}日`;

    // 生産処理の進行
    productionLines.forEach(line => {
      // 工場数に応じた進捗加算 (1工場につき一日あたり20%進むなど)
      const speedRate = line.factories * 20; 
      line.progress += speedRate;
      if (line.progress >= 100) {
        line.progress = 0;
        line.producedCount += 1;
      }
    });
    renderProductionLines();
  }, 1000);
}
