// special/science.js - 特別研究計画・科学者雇用システム

let scienceData = null;
let hiredScientists = JSON.parse(localStorage.getItem('hiredScientists')) || {};

// 初期化およびDOM挿入
async function initScienceSystem() {
  ensureScienceCSSLoaded();
  if (document.getElementById('science-modal-overlay')) return;

  const overlayHtml = `
    <div id="science-modal-overlay" class="science-overlay hidden">
      <div class="science-modal-content">
        <div class="science-modal-header">
          <h3>特別研究計画 (主任科学者配属)</h3>
          <button id="close-science-modal" class="close-btn">&times;</button>
        </div>
        <div class="science-modal-body" id="science-list-container">
          <p class="loading-text">科学者データをロード中...</p>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  document.getElementById('close-science-modal').addEventListener('click', closeScienceModal);
  document.getElementById('science-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'science-modal-overlay') closeScienceModal();
  });

  await loadScienceJSON();
}

function ensureScienceCSSLoaded() {
  const cssId = 'science-css-link';
  if (!document.getElementById(cssId)) {
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = 'special/science.css';
    document.head.appendChild(link);
  }
}

async function loadScienceJSON() {
  try {
    const res = await fetch('special/data/science.json');
    if (res.ok) {
      scienceData = await res.json();
      renderScienceList();
    } else {
      document.getElementById('science-list-container').innerHTML = '<p class="error-text">科学者データの読み込みに失敗しました。</p>';
    }
  } catch (e) {
    console.error(e);
    document.getElementById('science-list-container').innerHTML = '<p class="error-text">科学者データの取得中にエラーが発生しました。</p>';
  }
}

function openScienceModal() {
  initScienceSystem().then(() => {
    document.getElementById('science-modal-overlay').classList.remove('hidden');
    renderScienceList();
  });
}

function closeScienceModal() {
  const overlay = document.getElementById('science-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function renderScienceList() {
  const container = document.getElementById('science-list-container');
  if (!container || !scienceData) return;

  container.innerHTML = '';

  const categoriesMap = {};
  scienceData.scientists.forEach(sci => {
    if (!categoriesMap[sci.category]) {
      categoriesMap[sci.category] = { name: sci.category_name, items: [] };
    }
    categoriesMap[sci.category].items.push(sci);
  });

  for (const [catKey, group] of Object.entries(categoriesMap)) {
    let groupHtml = `
      <div class="science-category-section">
        <h4 class="science-cat-title">📁 ${group.name}</h4>
        <div class="science-cards-grid">
    `;

    group.items.forEach(sci => {
      const isHired = hiredScientists[catKey] === sci.id;
      
      groupHtml += `
        <div class="science-card ${isHired ? 'hired' : ''}">
          <div class="science-card-header">
            <img src="${sci.icon}" alt="${sci.name}" class="science-icon" onerror="this.onerror=null; this.src='image/tech_default.png';">
            <div class="science-name-group">
              <div class="science-name">${sci.name}</div>
              <div class="science-name-en">${sci.name_en}</div>
            </div>
          </div>
          <div class="science-desc">
            <p><strong>概要:</strong> ${sci.overview}</p>
            <p><strong>制作兵器:</strong> ${sci.weapons}</p>
          </div>
          <button class="hire-btn ${isHired ? 'hired-btn' : ''}" onclick="toggleHireScience('${catKey}', '${sci.id}')">
            ${isHired ? '雇用中 (解任する)' : '雇用する'}
          </button>
        </div>
      `;
    });

    groupHtml += `</div></div>`;
    container.insertAdjacentHTML('beforeend', groupHtml);
  }
}

function toggleHireScience(categoryKey, sciId) {
  if (hiredScientists[categoryKey] === sciId) {
    delete hiredScientists[categoryKey];
  } else {
    hiredScientists[categoryKey] = sciId;
  }

  localStorage.setItem('hiredScientists', JSON.stringify(hiredScientists));
  renderScienceList();
}
