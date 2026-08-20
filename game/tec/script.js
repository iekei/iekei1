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
      }
    } catch (e) {
      console.error(`Failed to load tech_${cat}.json`, e);
    }
  }
  renderTree();
}

// ------------------------------------------
// 2. 時計・研究タイマー・速度コントロール
// ------------------------------------------
function initClock() {
  // ポーズボタン（btn-pause）と速度ボタン（data-speed）の制御
  const speedBtns = document.querySelectorAll('.speed-btn');
  speedBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      speedBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      if (e.target.id === 'btn-pause') {
        gameSpeed = 0;
      } else {
        gameSpeed = parseInt(e.target.getAttribute('data-speed')) || 0;
      }
    });
  });

  // 時間経過のループ（1秒ごと）
  setInterval(() => {
    if (gameSpeed === 0) return;
    
    // 日付を進める
    gameDate.setDate(gameDate.getDate() + gameSpeed);
    document.getElementById('calendar-display').textContent = 
      `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;

    // 研究スロットのカウントダウン進行
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
  // すでに完了している場合
  if (completedTechs.includes(tech.id)) return;

  // 前提技術のチェック
  if (tech.prerequisites && tech.prerequisites.length > 0) {
    const missing = tech.prerequisites.filter(id => !completedTechs.includes(id));
    if (missing.length > 0) {
      alert('前提技術が完了していません！');
      return;
    }
  }

  // 空きスロットの検索
  const slot = researchSlots.find(s => !s.locked && !s.tech);
  if (!slot) {
    alert('空いている研究スロットがありません！');
    return;
  }

  slot.tech = tech;
  slot.remaining = tech.research_time || 30; // JSONの research_time を流用
  updateSlotDisplay(slot);
}

function completeResearch(slot) {
  completedTechs.push(slot.tech.id);
  const techName = slot.tech.title;
  
  // 完了通知の表示（時間と研究枠の間に、兵器名＋研究完了しましたと表示）
  const notifyArea = document.getElementById('notification-area');
  if (notifyArea) {
    const msg = document.createElement('div');
    msg.className = 'notify-msg';
    msg.textContent = `${techName} 研究完了しました`;
    notifyArea.appendChild(msg);
    setTimeout(() => msg.remove(), 5000); // 5秒後に消える
  }
  
  slot.tech = null;
  slot.remaining = 0;
  updateSlotDisplay(slot);
  renderTree(); // ツリーの状態（完了済みグレーアウト等）を更新
}

function updateSlotDisplay(slot) {
  const slotEl = document.querySelector(`.slot[data-slot="${slot.id}"]`);
  if (!slotEl) return;
  const statusEl = slotEl.querySelector('.slot-status');
  
  if (slot.tech) {
    statusEl.textContent = `研究中: ${slot.tech.title} (${Math.ceil(slot.remaining)}日)`;
    statusEl.style.color = '#e3b341';
  } else {
    statusEl.textContent = slot.locked ? '🔒 NFで解放' : '空き';
    statusEl.style.color = slot.locked ? '#8b949e' : '#3fb950';
  }
}

// ------------------------------------------
// 4. ツリー描画 & ツールチップ
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
  const nodeMap = {};
  list.forEach(item => { nodeMap[item.id] = item; });

  // ノードの描画
  list.forEach(tech => {
    const node = document.createElement('div');
    node.className = `tech-node ${completedTechs.includes(tech.id) ? 'completed' : ''}`;
    node.id = `node-${tech.id}`;
    node.style.left = `${tech.x}px`;
    node.style.top = `${tech.y}px`;

    const svgContent = tech.svg || `<svg viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;

    node.innerHTML = `
      <div class="tech-icon-wrapper">${svgContent}</div>
      <div class="tech-title">${tech.title}</div>
    `;

    // イベント設定
    node.addEventListener('click', () => startResearch(tech));
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mouseleave', hideTooltip);

    container.appendChild(node);
  });

  // 接続線描画
  list.forEach(tech => {
    if (tech.prerequisites && tech.prerequisites.length > 0) {
      tech.prerequisites.forEach(preId => {
        const parentNode = nodeMap[preId];
        if (parentNode) drawLine(parentNode, tech);
      });
    }
  });
}

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

// ツールチップ表示
function showTooltip(e, tech) {
  const tooltip = document.getElementById('tech-tooltip');
  if (!tooltip) return;

  document.getElementById('tooltip-title').textContent = tech.title;
  document.getElementById('tooltip-info').innerText = `開発年: ${tech.year}年 | 必要日数: ${tech.research_time || 30}日`;
  
  const effects = document.getElementById('tooltip-effects');
  effects.innerHTML = '';
  if (tech.desc) {
    const descDiv = document.createElement('div');
    descDiv.style.fontSize = '12px';
    descDiv.style.color = '#8b949e';
    descDiv.style.marginBottom = '4px';
    descDiv.textContent = tech.desc;
    effects.appendChild(descDiv);
  }
  if (tech.effects && tech.effects.length > 0) {
    tech.effects.forEach(eff => {
      const div = document.createElement('div');
      div.className = 'effect-item';
      div.textContent = `• ${eff}`;
      effects.appendChild(div);
    });
  }

  tooltip.classList.remove('hidden');
  
  const moveTooltip = (evt) => {
    tooltip.style.left = `${evt.clientX + 15}px`;
    tooltip.style.top = `${evt.clientY + 15}px`;
  };
  moveTooltip(e);
  e.currentTarget.addEventListener('mousemove', moveTooltip);
}

function hideTooltip() {
  const tooltip = document.getElementById('tech-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

// ------------------------------------------
// 5. ドラッグ & パン・ズーム
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
    document.getElementById('tree-viewport').style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    const container = document.getElementById('tree-container');
    if (container) container.style.cursor = 'grab';
  });
}

// 外部（NFなど）からのスロット解放用
window.unlockResearchSlot = function(slotId) {
  const slot = researchSlots.find(s => s.id === slotId);
  if (slot) {
    slot.locked = false;
    updateSlotDisplay(slot);
  }
};
