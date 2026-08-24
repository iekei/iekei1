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

  // モーダルが開いている間、ゲーム時間に合わせて進捗表示を定期更新
  setInterval(() => {
    const overlay = document.getElementById('science-modal-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      updateScienceProgressUI();
    }
  }, 1000);
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

// 日数を「○年○ヶ月」などに変換するヘルパー
function formatScienceRemaining(totalDays) {
  if (totalDays <= 0) return '完了間近';
  const daysInYear = 360;
  const daysInMonth = 30;

  const years = Math.floor(totalDays / daysInYear);
  const months = Math.floor((totalDays % daysInYear) / daysInMonth);
  const days = Math.floor((totalDays % daysInYear) % daysInMonth);

  let result = [];
  if (years > 0) result.push(`${years}年`);
  if (months > 0 || years > 0) result.push(`${months}ヶ月`);
  if (result.length === 0) result.push(`${days}日`);

  return `残り: ${result.join('')}`;
}

// 現在進行中の研究スロットから、該当カテゴリの残り日数と進捗率を計算する
function getCategoryProgressInfo(catKey) {
  // script.js 側で管理されている researchSlots や hiredScientists を参照
  // 特別研究は一律2年（720日）で設定されているため、進行状況を算出
  if (typeof researchSlots === 'undefined') return null;

  // 雇用中の科学者ID
  const hiredId = hiredScientists[catKey];
  if (!hiredId) return null;

  // 該当カテゴリ（または現在進行中のスロットで、その特別研究に関連するもの）を探索
  // ここではシンプルに、雇用中でアクティブなスロットがあればその残日数を使用、
  // なければ一律720日（未着手）として扱います
  let activeSlot = researchSlots.find(s => s.tech && s.remaining > 0);
  
  const totalDays = 720; // 特別研究計画の一律期間
  let remaining = 720;
  
  if (activeSlot) {
    remaining = activeSlot.remaining;
  }

  const elapsed = Math.max(0, totalDays - remaining);
  const percent = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));

  return {
    remainingDays: remaining,
    percent: percent,
    timeText: formatScienceRemaining(remaining)
  };
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
      let projIconPath = sci.project_icon || 'image/tech_default.png';

      // 雇用中の場合の進捗情報
      let progressHtml = '';
      if (isHired) {
        const info = getCategoryProgressInfo(catKey) || { timeText: '残り: 2年0ヶ月', percent: 0 };
        const radius = 18;
        const circ = 2 * Math.PI * radius;
        const strokeDashoffset = circ - (info.percent / 100) * circ;

        progressHtml = `
          <div class="science-progress-badge" data-cat="${catKey}">
            <span class="science-time-left">${info.timeText}</span>
            <div class="science-progress-ring">
              <svg width="44" height="44">
                <circle cx="22" cy="22" r="${radius}" stroke="#30363d" stroke-width="4" fill="none"></circle>
                <circle cx="22" cy="22" r="${radius}" stroke="#3fb950" stroke-width="4" fill="none"
                  stroke-dasharray="${circ}" stroke-dashoffset="${strokeDashoffset}"
                  style="transition: stroke-dashoffset 0.5s ease; transform: rotate(-90deg); transform-origin: 50% 50%;">
                </circle>
              </svg>
              <div class="science-progress-text">${Math.round(info.percent)}%</div>
            </div>
          </div>
        `;
      }

      groupHtml += `
        <div class="science-card ${isHired ? 'hired' : ''}">
          <div class="science-card-header">
            <!-- 科学者肖像画 -->
            <img src="${sci.icon}" alt="${sci.name}" class="science-icon" onerror="this.onerror=null; this.src='image/tech_default.png';">
            
            <div class="science-name-group">
              <div class="science-name">${sci.name}</div>
              <div class="science-name-en">${sci.name_en}</div>
            </div>

            <!-- ★ 名前の右側余白に配置する残り時間＆円形グラフ -->
            ${progressHtml}
          </div>

          <!-- 大きく表示する特別研究アイコン用のコンテナ -->
          <div class="science-project-icon-container">
            <img src="${projIconPath}" alt="Project Icon" class="science-project-icon" onerror="this.onerror=null; this.src='image/tech_default.png';">
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

// モーダルが開いている間に数秒おきに数値をリアルタイム更新する関数
function updateScienceProgressUI() {
  document.querySelectorAll('.science-progress-badge').forEach(badge => {
    const catKey = badge.getAttribute('data-cat');
    const info = getCategoryProgressInfo(catKey);
    if (!info) return;

    const timeEl = badge.querySelector('.science-time-left');
    const textEl = badge.querySelector('.science-progress-text');
    const circleEl = badge.querySelector('circle:nth-child(2)');

    if (timeEl) timeEl.textContent = info.timeText;
    if (textEl) textEl.textContent = `${Math.round(info.percent)}%`;
    if (circleEl) {
      const radius = 18;
      const circ = 2 * Math.PI * radius;
      const strokeDashoffset = circ - (info.percent / 100) * circ;
      circleEl.style.strokeDashoffset = strokeDashoffset;
    }
  });
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
