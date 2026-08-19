// ==========================================
// 1. カレンダー & 時間管理システム
// ==========================================
let currentDate = new Date(1936, 0, 1);
let gameSpeed = 0;
let gameTimer = null;
const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };

// 研究スロット管理
const researchSlots = [
  { id: 1, techId: null, daysLeft: 0, totalDays: 0 },
  { id: 2, techId: null, daysLeft: 0, totalDays: 0 },
  { id: 3, techId: null, daysLeft: 0, totalDays: 0 }
];

const researchedTechs = new Set();
let techData = {};
let currentCategory = 'infantry';

function updateCalendarUI() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const d = currentDate.getDate();
  document.getElementById('calendar-display').textContent = `${y}年${m}月${d}日`;
}

function tickDay() {
  currentDate.setDate(currentDate.getDate() + 1);
  updateCalendarUI();

  // 研究進行処理
  researchSlots.forEach(slot => {
    if (slot.techId && slot.daysLeft > 0) {
      slot.daysLeft--;
      if (slot.daysLeft <= 0) {
        // 研究完了
        researchedTechs.add(slot.techId);
        slot.techId = null;
        renderTree();
      }
    }
  });

  updateSlotsUI();
  updateProgressBars();
}

function setGameSpeed(speed) {
  gameSpeed = speed;
  if (gameTimer) clearInterval(gameTimer);
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));

  if (speed === 0) {
    document.getElementById('btn-pause').classList.add('active');
  } else {
    const activeBtn = document.querySelector(`.speed-btn[data-speed="${speed}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    gameTimer = setInterval(tickDay, speedIntervals[speed]);
  }
}

// UI上のスロット更新
function updateSlotsUI() {
  researchSlots.forEach(slot => {
    const el = document.querySelector(`.slot[data-slot="${slot.id}"] .slot-status`);
    if (!el) return;
    if (slot.techId) {
      const tech = getTechById(slot.techId);
      el.textContent = `${tech ? tech.title : '研究中'} (${slot.daysLeft}日)`;
      el.style.color = '#e3b341';
    } else {
      el.textContent = '空き';
      el.style.color = '#3fb950';
    }
  });
}

function updateProgressBars() {
  researchSlots.forEach(slot => {
    if (slot.techId) {
      const nodeEl = document.querySelector(`.tech-node[data-id="${slot.techId}"]`);
      if (nodeEl) {
        let bar = nodeEl.querySelector('.tech-progress-bar');
        if (!bar) {
          bar = document.createElement('div');
          bar.className = 'tech-progress-bar';
          nodeEl.appendChild(bar);
        }
        const pct = ((slot.totalDays - slot.daysLeft) / slot.totalDays) * 100;
        bar.style.width = `${pct}%`;
      }
    }
  });
}

// ==========================================
// 2. ドラッグ & ホイール動作
// ==========================================
let offsetX = 0, offsetY = 0;
let isDragging = false, startX = 0, startY = 0;

const container = document.getElementById('tree-container');
const viewport = document.getElementById('tree-viewport');
const yearSidebar = document.getElementById('year-sidebar');

// ホイール：上下スクロール
container.addEventListener('wheel', (e) => {
  e.preventDefault();
  offsetY -= e.deltaY;
  offsetY = Math.min(0, Math.max(-1500, offsetY));
  updateTransform();
}, { passive: false });

// ドラッグ：左右・上下自由移動
container.addEventListener('mousedown', (e) => {
  if (e.target.closest('.tech-node')) return;
  isDragging = true;
  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  offsetX = e.clientX - startX;
  offsetY = e.clientY - startY;
  offsetX = Math.min(0, Math.max(-2500, offsetX));
  offsetY = Math.min(0, Math.max(-1500, offsetY));
  updateTransform();
});

window.addEventListener('mouseup', () => isDragging = false);

function updateTransform() {
  viewport.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  yearSidebar.style.transform = `translateY(${offsetY}px)`;
}

// ==========================================
// 3. データ読み込み & ツリー描画
// ==========================================
const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];

// ------------------------------------------
// データ読み込み関数（抜粋）
// ------------------------------------------
async function loadAllTechData() {
  for (const cat of categories) {
    try {
      // tec/index.html から見た relative path
      const res = await fetch(`./data/tech_${cat}.json`);
      if (res.ok) {
        techData[cat] = await res.json();
      } else {
        console.error(`HTTP error! status: ${res.status} for tech_${cat}.json`);
      }
    } catch (e) {
      console.error(`Failed to load tech_${cat}.json`, e);
    }
  }
  renderTree();
}

function getTechById(id) {
  for (const cat of categories) {
    if (techData[cat]) {
      const found = techData[cat].find(t => t.id === id);
      if (found) return found;
    }
  }
  return null;
}

function renderTree() {
  const nodesContainer = document.getElementById('tech-nodes');
  const svgLines = document.getElementById('svg-lines');
  nodesContainer.innerHTML = '';
  svgLines.innerHTML = '';

  const techList = techData[currentCategory] || [];
  const techMap = {};
  techList.forEach(t => techMap[t.id] = t);

  // ノード生成部分
const proxyIconUrl = tech.icon.startsWith('http') 
  ? `https://images.weserv.nl/?url=${encodeURIComponent(tech.icon)}`
  : tech.icon;

node.innerHTML = `
  <img src="${proxyIconUrl}" alt="">
  <div class="tech-title">${tech.title}</div>
`;
    // ツールチップ
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mousemove', moveTooltip);
    node.addEventListener('mouseleave', hideTooltip);

    // 研究開始クリック処理
    node.addEventListener('click', () => startResearch(tech));

    nodesContainer.appendChild(node);
  });

  // 接続線描画
  techList.forEach(tech => {
    if (tech.prerequisites && tech.prerequisites.length > 0) {
      tech.prerequisites.forEach(parentId => {
        const parent = techMap[parentId];
        if (parent) {
          const isParentDone = researchedTechs.has(parent.id);
          drawStepLine(parent.x + 32, parent.y + 64, tech.x + 32, tech.y, isParentDone);
        }
      });
    }
  });

  updateSlotsUI();
  updateProgressBars();
}

function drawStepLine(x1, y1, x2, y2, isActive) {
  const midY = y1 + (y2 - y1) / 2;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
  path.setAttribute('d', d);
  path.setAttribute('class', isActive ? 'tech-line active' : 'tech-line');
  document.getElementById('svg-lines').appendChild(path);
}

function startResearch(tech) {
  if (researchedTechs.has(tech.id)) return;
  if (researchSlots.some(s => s.techId === tech.id)) return;

  // 前提条件チェック
  if (tech.prerequisites) {
    const hasParents = tech.prerequisites.every(id => researchedTechs.has(id));
    if (!hasParents) {
      alert('前提技術が研究されていません！');
      return;
    }
  }

  // 空きスロット検索
  const freeSlot = researchSlots.find(s => s.techId === null);
  if (!freeSlot) {
    alert('利用可能な研究スロットがありません！');
    return;
  }

  const days = tech.research_time || 170;
  freeSlot.techId = tech.id;
  freeSlot.daysLeft = days;
  freeSlot.totalDays = days;

  renderTree();
}

// ==========================================
// 4. イベントリレー & 初期化
// ==========================================
document.getElementById('btn-pause').addEventListener('click', () => setGameSpeed(0));
document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
  btn.addEventListener('click', (e) => setGameSpeed(parseInt(e.target.getAttribute('data-speed'), 10)));
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.getAttribute('data-cat');
    renderTree();
  });
});

const tooltip = document.getElementById('tech-tooltip');
function showTooltip(e, tech) {
  document.getElementById('tooltip-title').textContent = tech.title;
  document.getElementById('tooltip-info').textContent = `基準年: ${tech.year}年 | 研究時間: ${tech.research_time || 170}日`;

  const effEl = document.getElementById('tooltip-effects');
  effEl.innerHTML = '';
  (tech.effects || []).forEach(eff => {
    const div = document.createElement('div');
    div.className = 'effect-item';
    div.textContent = `• ${eff}`;
    effEl.appendChild(div);
  });

  tooltip.classList.remove('hidden');
  moveTooltip(e);
}

function moveTooltip(e) {
  tooltip.style.left = `${e.clientX + 15}px`;
  tooltip.style.top = `${e.clientY + 15}px`;
}

function hideTooltip() { tooltip.classList.add('hidden'); }

loadAllTechData();
