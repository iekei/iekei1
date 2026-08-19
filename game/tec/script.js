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
// 3. ミリタリー・技術SVGアイコン生成関数
// ------------------------------------------
function getTechSvgIcon(cat, id) {
  // 基本スタイル設定
  const stroke = "#58a6ff";
  const fill = "none";
  const sw = "2";

  // IDやカテゴリーに応じたSVG形状の定義
  if (id.includes('infantry') || id.includes('support')) {
    // 歩兵（クロスしたライフル）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 21l18-18"/>
      <path d="M3 3l18 18"/>
      <path d="M15 3h6v6"/>
      <path d="M9 21H3v-6"/>
    </svg>`;
  } else if (id.includes('hospital')) {
    // 野戦病院（赤十字）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z"/>
    </svg>`;
  } else if (cat === 'armor' || id.includes('tank')) {
    // 戦車（キャタピラと砲塔）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <rect x="2" y="13" width="20" height="7" rx="3.5"/>
      <path d="M6 13l2-6h8l2 6"/>
      <path d="M16 9h6"/>
    </svg>`;
  } else if (cat === 'artillery' || id.includes('artillery') || id.includes('anti')) {
    // 砲兵（大砲・対戦車砲）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <circle cx="7" cy="17" r="4"/>
      <path d="M9 14l11-8"/>
      <path d="M16 4l4 2"/>
      <path d="M12 18h9"/>
    </svg>`;
  } else if (cat === 'air' || id.includes('fighter') || id.includes('plane')) {
    // 航空機（飛行機）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <path d="M12 2v20M2 9h20M6 18h12"/>
    </svg>`;
  } else if (cat === 'naval' || id.includes('submarine') || id.includes('battleship')) {
    // 海軍（船・潜水艦）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <path d="M2 17l2 4h16l2-4H2z"/>
      <path d="M6 17V8l4-3h4l2 3v9"/>
      <path d="M12 3v2"/>
    </svg>`;
  } else if (cat === 'engineering' || id.includes('electronic') || id.includes('radio') || id.includes('computing')) {
    // 工学・電子（歯車 / 歯車と回路）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`;
  } else if (id.includes('atomic') || id.includes('rocket')) {
    // 原子力・ロケット（アトム）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <circle cx="12" cy="12" r="2"/>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(30 12 12)"/>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(150 12 12)"/>
    </svg>`;
  } else {
    // 産業・デフォルト（工場）
    return `<svg width="36" height="36" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}">
      <path d="M2 20h20"/>
      <path d="M6 20V10l4 3V10l4 3V6l6 4v10"/>
    </svg>`;
  }
}

// ------------------------------------------
// 4. ツリーの描画 (SVGアイコン挿入)
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

    // カテゴリとIDから動的にSVGアイコンを取得
    const iconSvg = getTechSvgIcon(currentCategory, tech.id);

    node.innerHTML = `
      <div class="tech-icon-wrapper">${iconSvg}</div>
      <div class="tech-title">${tech.title}</div>
    `;

    // ツールチップイベント
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mouseleave', hideTooltip);

    container.appendChild(node);
  });

  // 2. 依存関係の接続線描画
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
// 5. SVG接続線の描画
// ------------------------------------------
function drawLine(parent, child) {
  const svg = document.getElementById('svg-lines');
  
  const x1 = parent.x + 32;
  const y1 = parent.y + 64;
  const x2 = child.x + 32;
  const y2 = child.y;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const midY = y1 + (y2 - y1) / 2;
  const d = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

  path.setAttribute('d', d);
  path.setAttribute('class', 'tech-line');
  svg.appendChild(path);
}

// ------------------------------------------
// 6. ツールチップ制御
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
// 7. 画面ドラッグ（パン）操作の制御
// ------------------------------------------
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

// 外部連携用
window.unlockResearchSlot = function(slotId) {
  const slotEl = document.querySelector(`.slot[data-slot="${slotId}"]`);
  if (slotEl) {
    slotEl.classList.remove('locked');
    slotEl.querySelector('.slot-status').textContent = '空き';
    slotEl.querySelector('.slot-status').style.color = '#3fb950';
  }
};
