const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
let currentCategory = 'infantry';
let techData = {};

// LocalStorageから完了した技術を同期して復元
let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');

let researchSlots = [
  { id: 1, tech: null, remaining: 0, locked: false },
  { id: 2, tech: null, remaining: 0, locked: false },
  { id: 3, tech: null, remaining: 0, locked: false },
  { id: 4, tech: null, remaining: 0, locked: true },
  { id: 5, tech: null, remaining: 0, locked: true }
];

// LocalStorageから保存された日付とスピードを復元（なければ初期値）
let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

let isDragging = false, startX, startY, translateX = 0, translateY = 0;

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initPanAndZoom();
  initClock();
  initResearchSlots();
  await loadAllTechData();

  // ★他画面（生産やNFなど）からのストレージ変更をリアルタイム検知
  window.addEventListener('storage', (e) => {
    if (e.key === 'completedTechs') {
      completedTechs = JSON.parse(e.newValue || '[]');
      renderTree();
    }
    if (e.key === 'gameSpeed') {
      gameSpeed = parseInt(e.newValue || '0', 10);
      updateSpeedButtonUI();
    }
    if (e.key === 'gameDate') {
      gameDate = new Date(e.newValue);
      updateCalendarUI();
    }
  });

  // 定期ポーリングによる確実な同期
  setInterval(() => {
    const latestTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
    if (JSON.stringify(latestTechs) !== JSON.stringify(completedTechs)) {
      completedTechs = latestTechs;
      renderTree();
    }
  }, 1000);
});

async function loadAllTechData() {
  for (const cat of categories) {
    try {
      const res = await fetch(`./data/tech_${cat}.json`);
      if (res.ok) techData[cat] = await res.json();
    } catch (e) { console.error(e); }
  }
  renderTree();
}

function updateSpeedButtonUI() {
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
  if (gameSpeed === 0) {
    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) pauseBtn.classList.add('active');
  } else {
    const targetBtn = document.querySelector(`.speed-btn[data-speed="${gameSpeed}"]`);
    if (targetBtn) targetBtn.classList.add('active');
  }
}

function initClock() {
  // 初期スピードボタンの状態を反映
  updateSpeedButtonUI();

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const speedAttr = e.target.getAttribute('data-speed');
      gameSpeed = speedAttr !== null ? parseInt(speedAttr, 10) : 0;
      
      // LocalStorageに保存して生産や他画面と同期
      localStorage.setItem('gameSpeed', gameSpeed);
      updateSpeedButtonUI();
      runTick();
    });
  });

  // 日付表示の初期化
  updateCalendarUI();

  // HOI4風のメインループ（他画面と同期した速度間隔）
  const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };
  let gameTimer = null;

  function runTick() {
    if (gameTimer) clearInterval(gameTimer);
    gameSpeed = parseInt(localStorage.getItem('gameSpeed') || '0', 10);

    if (gameSpeed > 0) {
      gameTimer = setInterval(() => {
        // 他画面で進んだ日付をローカルストレージから取得して同期
        const savedDateStr = localStorage.getItem('gameDate');
        if (savedDateStr) {
          gameDate = new Date(savedDateStr);
        }

        // 1日進める
        gameDate.setDate(gameDate.getDate() + 1);
        localStorage.setItem('gameDate', gameDate.toISOString());
        updateCalendarUI();

        // 研究スロットの進行
        researchSlots.forEach(slot => {
          if (slot.tech && slot.remaining > 0) {
            slot.remaining -= 1; // 1日ずつ進行
            if (slot.remaining <= 0) completeResearch(slot);
            else updateSlotDisplay(slot);
          }
        });
      }, speedIntervals[gameSpeed] || 1000);
    }
  }

  if (gameSpeed > 0) {
    runTick();
  }
}

function updateCalendarUI() {
  const calEl = document.getElementById('calendar-display');
  if (calEl) {
    calEl.textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;
  }
}

// 研究スロットをクリックして研究を中断・変更する機能
function initResearchSlots() {
  document.querySelectorAll('.slot').forEach(slotEl => {
    slotEl.addEventListener('click', () => {
      const slotId = parseInt(slotEl.getAttribute('data-slot'), 10);
      const slot = researchSlots.find(s => s.id === slotId);
      
      if (!slot || slot.locked) return;

      if (slot.tech) {
        const confirmed = confirm(`「${slot.tech.title}」の研究を中断してスロットを空けますか？\n※これまでの研究進捗（日数）はリセットされます。`);
        if (confirmed) {
          slot.tech = null;
          slot.remaining = 0;
          updateSlotDisplay(slot);
        }
      }
    });
  });
}

function startResearch(tech) {
  if (completedTechs.includes(tech.id)) return;

  const isAlreadyResearching = researchSlots.some(slot => slot.tech && slot.tech.id === tech.id);
  if (isAlreadyResearching) {
    alert('この技術はすでに別のスロットで研究中です！');
    return;
  }

  if (tech.prerequisites?.some(id => !completedTechs.includes(id))) { 
    alert('前提技術が完了していません！'); 
    return; 
  }

  const slot = researchSlots.find(s => !s.locked && !s.tech);
  if (!slot) { 
    alert('空きスロットがありません！上のスロットをクリックして既存の研究を中断するか、空けてください。'); 
    return; 
  }

  slot.tech = tech; 
  slot.remaining = tech.research_time || 30;
  updateSlotDisplay(slot);
}

function completeResearch(slot) {
  if (!completedTechs.includes(slot.tech.id)) {
    completedTechs.push(slot.tech.id);
  }
  localStorage.setItem('completedTechs', JSON.stringify(completedTechs));

  const notifyArea = document.getElementById('notification-area');
  if (notifyArea) {
    const msg = document.createElement('div');
    msg.className = 'notify-msg';
    msg.textContent = `${slot.tech.title} 研究完了しました`;
    notifyArea.appendChild(msg);
    setTimeout(() => msg.remove(), 5000);
  }
  slot.tech = null; 
  slot.remaining = 0;
  updateSlotDisplay(slot); 
  renderTree();
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

function renderTree() {
  const container = document.getElementById('tech-nodes');
  const svg = document.getElementById('svg-lines');
  if (!container || !svg) return;
  container.innerHTML = ''; 
  svg.innerHTML = '';
  
  const list = techData[currentCategory] || [];
  const nodeMap = {};
  list.forEach(item => { nodeMap[item.id] = item; });

  list.forEach(tech => {
    const node = document.createElement('div');
    node.className = `tech-node ${completedTechs.includes(tech.id) ? 'completed' : ''}`;
    node.style.left = `${tech.x}px`; 
    node.style.top = `${tech.y}px`;
    
    const svgContent = tech.svg || `<svg viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
    node.innerHTML = `<div class="tech-icon-wrapper">${svgContent}</div><div class="tech-title">${tech.title}</div>`;
    
    node.addEventListener('click', () => startResearch(tech));
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

function drawLine(parent, child) {
  const svg = document.getElementById('svg-lines');
  if (!svg) return;
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
  if (!tooltip) return;
  document.getElementById('tooltip-title').textContent = tech.title;
  document.getElementById('tooltip-info').innerText = `開発年: ${tech.year}年 | 必要日数: ${tech.research_time || 30}日`;
  
  const descEl = document.getElementById('tooltip-desc');
  if (tech.desc && tech.desc.trim() !== '') {
    descEl.textContent = tech.desc;
    descEl.style.display = 'block';
  } else {
    descEl.style.display = 'none';
  }

  const effects = document.getElementById('tooltip-effects');
  if (effects) {
    effects.innerHTML = (tech.effects || []).map(eff => `<div class="effect-item">• ${eff}</div>`).join('');
  }
  
  tooltip.classList.remove('hidden');
  const move = (evt) => { 
    tooltip.style.left = `${evt.clientX + 15}px`; 
    tooltip.style.top = `${evt.clientY + 15}px`; 
  };
  move(e);
  e.currentTarget.addEventListener('mousemove', move);
}

function hideTooltip() { 
  const tooltip = document.getElementById('tech-tooltip');
  if (tooltip) tooltip.classList.add('hidden'); 
}

function initPanAndZoom() {
  const container = document.getElementById('tree-container');
  const viewport = document.getElementById('tree-viewport');
  if (!container || !viewport) return;
  
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
    viewport.style.transform = `translate(${translateX}px, ${translateY}px)`;
  });
  
  window.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
  });
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentCategory = e.target.getAttribute('data-cat');
    renderTree();
  }));
}
