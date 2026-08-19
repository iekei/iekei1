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
// 3. ツリーの描画 (JSON内のSVGアイコン表示対応)
// ------------------------------------------
function renderTree() {
  const container = document.getElementById('tech-nodes');
  const svg = document.getElementById('svg-lines');
  
  container.innerHTML = '';
  svg.innerHTML = '';

  const list = techData[currentCategory] || [];

  const nodeMap = {};
  list.forEach(item => { nodeMap[item.id] = item; });

  // 1. ノードの描画
  list.forEach(tech => {
    const node = document.createElement('div');
    node.className = 'tech-node';
    node.id = `node-${tech.id}`;
    node.style.left = `${tech.x}px`;
    node.style.top = `${tech.y}px`;

    // JSON内の svg 文字列を読み込み、無い場合はデフォルトの四角形枠を表示
    const svgContent = tech.svg || `<svg viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;

    node.innerHTML = `
      <div class="tech-icon-wrapper">${svgContent}</div>
      <div class="tech-title">${tech.title}</div>
    `;

    // ツールチップイベント
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mouseleave', hideTooltip);

    container.appendChild(node);
  });

  // 2. 依存関係の接続線（SVG）の描画
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
  
  // HOI4風のカギ型ルート描画
  const midY = y1 + (y2 - y1) / 2;
  const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

  path.setAttribute('d', d);
  path.setAttribute('class', 'tech-line');
  svg.appendChild(path);
}

// ------------------------------------------
// 5. ツールチップの制御 (設計者・信頼度・説明の表示)
// ------------------------------------------
function showTooltip(e, tech) {
  const tooltip = document.getElementById('tech-tooltip');
  const title = document.getElementById('tooltip-title');
  const info = document.getElementById('tooltip-info');
  const effects = document.getElementById('tooltip-effects');

  // タイトル設定
  title.textContent = tech.title;
  
  // 開発年、設計者、信頼度（配備状態）を表示
  let subInfo = `開発年: ${tech.year}年`;
  if (tech.designer) subInfo += ` | 設計: ${tech.designer}`;
  if (tech.reliability) subInfo += `\n状態: ${tech.reliability}`;
  info.innerText = subInfo;
  
  effects.innerHTML = '';

  // 銃器の説明文がある場合はスタイルを整えて追加
  if (tech.desc) {
    const descDiv = document.createElement('div');
    descDiv.style.fontSize = '12px';
    descDiv.style.color = '#8b949e';
    descDiv.style.marginBottom = '8px';
    descDiv.style.lineHeight = '1.4';
    descDiv.style.borderBottom = '1px solid #30363d';
    descDiv.style.paddingBottom = '6px';
    descDiv.textContent = tech.desc;
    effects.appendChild(descDiv);
  }

  // ステータス効果（対人攻撃、機動力など）のリストを表示
  if (tech.effects && tech.effects.length > 0) {
    tech.effects.forEach(eff => {
      const div = document.createElement('div');
      div.className = 'effect-item';
      div.textContent = `• ${eff}`;
      effects.appendChild(div);
    });
  }

  tooltip.classList.remove('hidden');

  // マウスカーソルに追従させる処理
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
// 7. 外部・NF（国家方針）側からの連携用関数
// ------------------------------------------
window.unlockResearchSlot = function(slotId) {
  const slotEl = document.querySelector(`.slot[data-slot="${slotId}"]`);
  if (slotEl) {
    slotEl.classList.remove('locked');
    slotEl.querySelector('.slot-status').textContent = '空き';
    slotEl.querySelector('.slot-status').style.color = '#3fb950';
  }
};
