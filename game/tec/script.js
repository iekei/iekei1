const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
let currentCategory = 'infantry';
let techData = {};
let completedTechs = [];
let researchSlots = [
  { id: 1, tech: null, remaining: 0, locked: false },
  { id: 2, tech: null, remaining: 0, locked: false },
  { id: 3, tech: null, remaining: 0, locked: false },
  { id: 4, tech: null, remaining: 0, locked: true },
  { id: 5, tech: null, remaining: 0, locked: true }
];

let gameDate = new Date(1936, 0, 1);
let gameSpeed = 0;
let isDragging = false, startX, startY, translateX = 0, translateY = 0, scale = 1;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPanAndZoom();
  initClock();
  loadAllTechData();
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
        if (slot.remaining <= 0) completeResearch(slot);
        else updateSlotDisplay(slot);
      }
    });
  }, 1000);
}

function startResearch(tech) {
  if (completedTechs.includes(tech.id)) return;
  if (tech.prerequisites?.some(id => !completedTechs.includes(id))) { alert('前提技術が完了していません！'); return; }
  const slot = researchSlots.find(s => !s.locked && !s.tech);
  if (!slot) { alert('空きスロットがありません！'); return; }
  slot.tech = tech; slot.remaining = tech.research_time || 30;
  updateSlotDisplay(slot);
}

function completeResearch(slot) {
  completedTechs.push(slot.tech.id);
  const notifyArea = document.getElementById('notification-area');
  const msg = document.createElement('div');
  msg.className = 'notify-msg';
  msg.textContent = `${slot.tech.title} 研究完了しました`;
  notifyArea.appendChild(msg);
  setTimeout(() => msg.remove(), 5000);
  slot.tech = null; slot.remaining = 0;
  updateSlotDisplay(slot); renderTree();
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
  container.innerHTML = ''; svg.innerHTML = '';
  (techData[currentCategory] || []).forEach(tech => {
    const node = document.createElement('div');
    node.className = `tech-node ${completedTechs.includes(tech.id) ? 'completed' : ''}`;
    node.style.left = `${tech.x}px`; node.style.top = `${tech.y}px`;
    node.innerHTML = `<div>${tech.svg}</div><div>${tech.title}</div>`;
    node.addEventListener('click', () => startResearch(tech));
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mouseleave', hideTooltip);
    container.appendChild(node);
  });
}

function showTooltip(e, tech) {
  const tooltip = document.getElementById('tech-tooltip');
  document.getElementById('tooltip-title').textContent = tech.title;
  document.getElementById('tooltip-info').innerText = `必要日数: ${tech.research_time}日`;
  document.getElementById('tooltip-effects').innerHTML = (tech.effects || []).map(eff => `<div>• ${eff}</div>`).join('');
  tooltip.classList.remove('hidden');
  const move = (evt) => { tooltip.style.left = `${evt.clientX + 15}px`; tooltip.style.top = `${evt.clientY + 15}px`; };
  move(e); e.currentTarget.addEventListener('mousemove', move);
}

function hideTooltip() { document.getElementById('tech-tooltip').classList.add('hidden'); }

function initPanAndZoom() {
  const container = document.getElementById('tree-container');
  const viewport = document.getElementById('tree-viewport');
  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('.tech-node')) return;
    isDragging = true; startX = e.clientX - translateX; startY = e.clientY - translateY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX; translateY = e.clientY - startY;
    viewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  });
  window.addEventListener('mouseup', () => isDragging = false);
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = Math.min(Math.max(scale + (e.deltaY > 0 ? -0.1 : 0.1), 0.5), 2);
    viewport.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }, { passive: false });
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentCategory = e.target.getAttribute('data-cat');
    renderTree();
  }));
}
