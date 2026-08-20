// ------------------------------------------
// グローバル状態管理
// ------------------------------------------
const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
let currentCategory = 'infantry';
let techData = {};
let completedTechs = []; // 完了した技術IDを保持
let researchSlots = [
  { id: 1, tech: null, remaining: 0, locked: false },
  { id: 2, tech: null, remaining: 0, locked: false },
  { id: 3, tech: null, remaining: 0, locked: false },
  { id: 4, tech: null, remaining: 0, locked: true },
  { id: 5, tech: null, remaining: 0, locked: true }
];

// ドラッグ & パン・ズーム管理用
let isDragging = false;
let startX, startY;
let translateX = 0;
let translateY = 0;
let scale = 1;

// 時計・ゲーム進行管理用
let gameDate = new Date(1936, 0, 1);
let gameSpeed = 0; 

// ------------------------------------------
// 初期化処理
// ------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPanAndZoom();
  initClock();
  loadAllTechData();
});

// ------------------------------------------
// 1. データ読み込み
// ------------------------------------------
async function loadAllTechData() {
  for (const cat of categories) {
    try {
      const res = await fetch(`./data/tech_${cat}.json`);
      if (res.ok) {
        techData[cat] = await res.json();
      }
    } catch (e) { console.error(e); }
  }
  renderTree();
}

// ------------------------------------------
// 2. 時計・研究タイマー
// ------------------------------------------
function initClock() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      gameSpeed = parseInt(e.target.getAttribute('data-speed')) || 0;
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  setInterval(() => {
    if (gameSpeed === 0) return;
    gameDate.setDate(gameDate.getDate() + gameSpeed);
    document.getElementById('calendar-display').textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;

    researchSlots.forEach(slot => {
      if (slot.tech && slot.remaining > 0) {
        slot.remaining -= gameSpeed;
        if (slot.remaining <= 0) {
          completeResearch(slot);
        } else {
          updateSlotDisplay(slot);
        }
      }
    });
  }, 1000);
}

// ------------------------------------------
// 3. 研究ロジック
// ------------------------------------------
function startResearch(tech) {
  if (completedTechs.includes(tech.id)) return;
  if (tech.prerequisites && tech.prerequisites.length > 0) {
    const missing = tech.prerequisites.filter(id => !completedTechs.includes(id));
    if (missing.length > 0) {
      alert('前提技術が完了していません！');
      return;
    }
  }

  const slot = researchSlots.find(s => !s.locked && !s.tech);
  if (!slot) {
    alert('空いている研究スロットがありません！');
    return;
  }

  slot.tech = tech;
  slot.remaining = tech.research_time || 30;
  updateSlotDisplay(slot);
}

function completeResearch(slot) {
  completedTechs.push(slot.tech.id);
  const completedName = slot.tech.title;
  
  // 完了通知
  const notifyArea = document.createElement('div');
  notifyArea.textContent = `[完了] ${completedName} 研究完了しました`;
  notifyArea.style.color = '#3fb950';
  document.body.prepend(notifyArea); // 画面上部に表示
  setTimeout(() => notifyArea.remove(), 5000);
  
  slot.tech = null;
  slot.remaining = 0;
  updateSlotDisplay(slot);
  renderTree(); // 完了したらノードの状態を更新（色を変えるため）
}

function updateSlotDisplay(slot) {
  const el = document.querySelector(`.slot[data-slot="${slot.id}"] .slot-status`);
  if (!el) return;
  if (slot.tech) {
    el.textContent = `研究中: ${slot.tech.title} (${Math.ceil(slot.remaining)}日)`;
    el.style.color = '#e3b341';
  } else {
    el.textContent = slot.locked ? '🔒 NFで解放' : '空き';
    el.style.color = slot.locked ? '#8b949e' : '#3fb950';
  }
}

// ------------------------------------------
// 4. UI制御・描画
// ------------------------------------------
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentCategory = e.target.getAttribute('data-cat');
      renderTree();
    });
  });
}

function renderTree() {
  const container = document.getElementById('tech-nodes');
  const svg = document.getElementById('svg-lines');
  container.innerHTML = '';
  svg.innerHTML = '';
  
  const list = techData[currentCategory] || [];
  list.forEach(tech => {
    const node = document.createElement('div');
    node.className = `tech-node ${completedTechs.includes(tech.id) ? 'completed' : ''}`;
    node.style.left = `${tech.x}px`;
    node.style.top = `${tech.y}px`;
    node.innerHTML = `<div class="tech-icon-wrapper">${tech.svg}</div><div class="tech-title">${tech.title}</div>`;
    
    node.addEventListener('click', () => startResearch(tech));
    container.appendChild(node);
  });
}

function initPanAndZoom() {
  const container = document.getElementById('tree-container');
  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tech-node')) return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    document.getElementById('tree-viewport').style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  });
  window.addEventListener('mouseup', () => isDragging = false);
}

window.unlockResearchSlot = function(slotId) {
  const slot = researchSlots.find(s => s.id === slotId);
  if (slot) {
    slot.locked = false;
    updateSlotDisplay(slot);
  }
};
