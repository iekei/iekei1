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

// ------------------------------------------
// 初期化処理
// ------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPanAndZoom();
  loadAllTechData();
});

// ------------------------------------------
// 1. データ読み込み
// ------------------------------------------
async function loadAllTechData() {
  for (const cat of categories) {
    try {
      // tec/index.html から見た相対パス
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
// 2. タブ切り替え制御
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

// ------------------------------------------
// 3. ツリーの描画 (Weserv プロキシ対応)
// ------------------------------------------
function renderTree() {
  const container = document.getElementById('tech-nodes');
  const svg = document.getElementById('svg-lines');
  
  container.innerHTML = '';
  svg.innerHTML = '';

  const list = techData[currentCategory] || [];

  // IDマップの作成
  const nodeMap = {};
  list.forEach(item => {
    nodeMap[item.id] = item;
  });

  // 1. ノードの描画
  list.forEach(tech => {
    const node = document.createElement('div');
    node.className = 'tech-node';
    node.id = `node-${tech.id}`;
    node.style.left = `${tech.x}px`;
    node.style.top = `${tech.y}px`;

    // ----------------------------------------------------
    // weserv.nl プロキシの適用処理
    // 外部の http/https URL の場合はプロキシを通し、
    // ローカルパス (images/...) の場合はそのまま読み込みます。
    // ----------------------------------------------------
    let displayIconUrl = tech.icon || '';
    if (displayIconUrl.startsWith('http://') || displayIconUrl.startsWith('https://')) {
      displayIconUrl = `https://images.weserv.nl/?url=${encodeURIComponent(displayIconUrl)}`;
    }

    // alt="" にすることで画像が壊れてもテキストが枠外に溢れ出るのを防止
    node.innerHTML = `
      <img src="${displayIconUrl}" alt="" onerror="this.style.display='none';">
      <div class="tech-title">${tech.title}</div>
    `;

    // ツールチップイベント
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mouseleave', hideTooltip);

    container.appendChild(node);
  });

  // 2. 依存関係の矢印・接続線（SVG）の描画
  list.forEach(tech => {
    if (tech.prerequisites && tech.prerequisites.length > 0) {
      tech.prerequisites.forEach(preId => {
        const parentNode = nodeMap[preId];
        if (parentNode) {
          drawLine(parentNode, tech);
        }
      });
    }
  });
}

// ------------------------------------------
// 4. SVG接続線の描画
// ------------------------------------------
function drawLine(parent, child) {
  const svg = document.getElementById('svg-lines');
  
  // ノードの中心軸に合わせてオフセット調整 (ノードサイズ 64x64 想定)
  const x1 = parent.x + 32;
  const y1 = parent.y + 64;
  const x2 = child.x + 32;
  const y2 = child.y;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  
  // HOI4風のカギ型ルート描画 (クランク線)
  const midY = y1 + (y2 - y1) / 2;
  const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

  path.setAttribute('d', d);
  path.setAttribute('class', 'tech-line');
  svg.appendChild(path);
}

// ------------------------------------------
// 5. ツールチップの制御
// ------------------------------------------
function showTooltip(e, tech) {
  const tooltip = document.getElementById('tech-tooltip');
  const title = document.getElementById('tooltip-title');
  const info = document.getElementById('tooltip-info');
  const effects = document.getElementById('tooltip-effects');

  title.textContent = tech.title;
  info.textContent = `研究年: ${tech.year}年 | 必要日数: ${tech.research_time}日`;
  
  effects.innerHTML = '';
  if (tech.effects && tech.effects.length > 0) {
    tech.effects.forEach(eff => {
      const div = document.createElement('div');
      div.className = 'effect-item';
      div.textContent = `• ${eff}`;
      effects.appendChild(div);
    });
  }

  tooltip.classList.remove('hidden');

  // マウス位置に追従させる
  const updateTooltipPos = (evt) => {
    tooltip.style.left = `${evt.clientX + 15}px`;
    tooltip.style.top = `${evt.clientY + 15}px`;
  };

  updateTooltipPos(e);
  e.target.addEventListener('mousemove', updateTooltipPos);
}

function hideTooltip() {
  const tooltip = document.getElementById('tech-tooltip');
  tooltip.classList.add('hidden');
}

// ------------------------------------------
// 6. 画面ドラッグ（パン）操作の制御
// ------------------------------------------
function initPanAndZoom() {
  const container = document.getElementById('tree-container');
  const viewport = document.getElementById('tree-viewport');

  container.addEventListener('mousedown', (e) => {
    // ノード以外の部分を掴んだ場合のみドラッグ開始
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
    
    updateViewportTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
  });
}

function updateViewportTransform() {
  const viewport = document.getElementById('tree-viewport');
  viewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

// ------------------------------------------
// 外部・NF側からの連携用関数 (枠解放など)
// ------------------------------------------
window.unlockResearchSlot = function(slotId) {
  const slotEl = document.querySelector(`.slot[data-slot="${slotId}"]`);
  if (slotEl) {
    slotEl.classList.remove('locked');
    slotEl.querySelector('.slot-status').textContent = '空き';
    slotEl.querySelector('.slot-status').style.color = '#3fb950';
  }
};
