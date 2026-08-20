// ------------------------------------------
// グローバル状態管理
// ------------------------------------------
const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
let currentCategory = 'infantry';
let techData = {};

// ドラッグ & パン・ズーム管理用
let isDragging = false;
let startX, startY;
let translateX = 0;
let translateY = 0;
let scale = 1;

// 時計・ゲーム進行管理用
let gameDate = new Date(1936, 0, 1); // 1936年1月1日
let gameSpeed = 0; // 0 = ポーズ

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
      } else {
        console.error(`HTTP error! status: ${res.status} for tech_${cat}.json`);
      }
    } catch (e) {
      console.error(`Failed to load tech_${cat}.json`, e);
    }
  }
  renderTree();
}

// ------------------------------------------
// 2. タブ・UI制御
// ------------------------------------------
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      tabBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      currentCategory = e.target.getAttribute('data-cat');
      renderTree();
    });
  });
}

function initClock() {
  // スピードボタンのイベント設定
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const speed = e.target.getAttribute('data-speed');
      gameSpeed = speed ? parseInt(speed) : 0;
      
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  // 時計の更新（毎秒呼び出し）
  setInterval(() => {
    if (gameSpeed === 0) return;
    gameDate.setDate(gameDate.getDate() + gameSpeed);
    const display = document.getElementById('calendar-display');
    display.textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;
  }, 1000);
}

// ------------------------------------------
// 3. ツリーの描画
// ------------------------------------------
function renderTree() {
  const container = document.getElementById('tech-nodes');
  const svg = document.getElementById('svg-lines');
  
  container.innerHTML = '';
  svg.innerHTML = '';

  const list = techData[currentCategory] || [];
  const nodeMap = {};
  list.forEach(item => { nodeMap[item.id] = item; });

  list.forEach(tech => {
    const node = document.createElement('div');
    node.className = 'tech-node';
    node.id = `node-${tech.id}`;
    node.style.left = `${tech.x}px`;
    node.style.top = `${tech.y}px`;

    const svgContent = tech.svg || `<svg viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;

    node.innerHTML = `
      <div class="tech-icon-wrapper">${svgContent}</div>
      <div class="tech-title">${tech.title}</div>
    `;

    // クリックで研究開始
    node.addEventListener('click', () => startResearch(tech));

    // ツールチップイベント
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mouseleave', hideTooltip);

    container.appendChild(node);
  });

  list.forEach(tech => {
    if (tech.prerequisites && tech.prerequisites.length > 0) {
      tech.prerequisites.forEach(preId => {
        const parentNode = nodeMap[preId];
        if (parentNode) drawLine(parentNode, tech);
      });
    }
  });
}

// ------------------------------------------
// 4. 研究スロット割り当て処理
// ------------------------------------------
function startResearch(tech) {
  const slots = document.querySelectorAll('.slot:not(.locked)');
  for (let slot of slots) {
    const status = slot.querySelector('.slot-status');
    if (status.textContent === '空き') {
      status.textContent = `研究中: ${tech.title}`;
      status.style.color = '#e3b341';
      return;
    }
  }
  alert('空いている研究スロットがありません！');
}

// ------------------------------------------
// 5. 接続線・ツールチップ・パン操作
// ------------------------------------------
function drawLine(parent, child) {
  const svg = document.getElementById('svg-lines');
  const x1 = parent.x + 32;
  const y1 = parent.y + 64;
  const x2 = child.x + 32;
  const y2 = child.y;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const midY = y1 + (y2 - y1) / 2;
  path.setAttribute('d', `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`);
  path.setAttribute('class', 'tech-line');
  svg.appendChild(path);
}

function showTooltip(e, tech) {
  const tooltip = document.getElementById('tech-tooltip');
  document.getElementById('tooltip-title').textContent = tech.title;
  document.getElementById('tooltip-info').innerText = `開発年: ${tech.year}年 ${tech.designer ? '| 設計: ' + tech.designer : ''}`;
  
  const effects = document.getElementById('tooltip-effects');
  effects.innerHTML = '';
  if (tech.desc) effects.innerHTML += `<div style="font-size:12px; color:#8b949e; margin-bottom:8px;">${tech.desc}</div>`;
  if (tech.effects) tech.effects.forEach(eff => effects.innerHTML += `<div class="effect-item">• ${eff}</div>`);
  
  tooltip.classList.remove('hidden');
  const move = (evt) => {
    tooltip.style.left = `${evt.clientX + 15}px`;
    tooltip.style.top = `${evt.clientY + 15}px`;
  };
  move(e);
  e.target.addEventListener('mousemove', move);
}

function hideTooltip() { document.getElementById('tech-tooltip').classList.add('hidden'); }

function initPanAndZoom() {
  const container = document.getElementById('tree-container');
  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tech-node')) return;
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    container.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    document.getElementById('tree-viewport').style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  });
  window.addEventListener('mouseup', () => { isDragging = false; container.style.cursor = 'grab'; });
}

window.unlockResearchSlot = function(slotId) {
  const slotEl = document.querySelector(`.slot[data-slot="${slotId}"]`);
  if (slotEl) {
    slotEl.classList.remove('locked');
    slotEl.querySelector('.slot-status').textContent = '空き';
    slotEl.querySelector('.slot-status').style.color = '#3fb950';
  }
};
