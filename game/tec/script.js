// --- 研究画面用スクリプト (tec/script.js) ---

let completedTechs = [];
let allTechsMap = {}; // 全カテゴリの技術データをIDで引き出せるように保持
let currentCategory = 'infantry';

// ローカルストレージから完了した研究をロード
function loadCompletedTechs() {
  try {
    const raw = localStorage.getItem('completedTechs');
    if (raw) {
      const parsed = JSON.parse(raw);
      completedTechs = parsed.map(item => String(typeof item === 'object' && item !== null ? (item.id || item.techId) : item)).filter(Boolean);
    } else {
      completedTechs = [];
    }
  } catch (e) {
    completedTechs = [];
  }
}

// 完了した研究をローカルストレージに保存し、他画面（生産画面など）へ即時通知
function saveCompletedTechs() {
  const unique = Array.from(new Set(completedTechs.map(String)));
  localStorage.setItem('completedTechs', JSON.stringify(unique));
  window.dispatchEvent(new Event('storage'));
}

// 全カテゴリの技術データ（JSON）をロード
async function loadAllTechsData() {
  const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
  for (const cat of categories) {
    try {
      const res = await fetch(`data/tech_${cat}.json`);
      if (res.ok) {
        const list = await res.json();
        list.forEach(tech => {
          const uniqueId = String(tech.id || tech.techId);
          if (uniqueId) {
            tech.category = cat;
            allTechsMap[uniqueId] = tech;
          }
        });
      }
    } catch (e) {
      console.error(`Failed to load data/tech_${cat}.json`, e);
    }
  }
  renderResearchTree();
}

// 研究を完了させる（テスト用・クリック時に呼ばれる関数）
window.completeTech = function(techId) {
  const strId = String(techId);
  if (!completedTechs.includes(strId)) {
    completedTechs.push(strId);
    saveCompletedTechs();
    console.log(`研究完了: ${strId}`);
    renderResearchTree();
  }
};

// 研究ツリーのUIを描画する関数
async function renderResearchTree() {
  const container = document.getElementById('tech-tree-content');
  if (!container) return;
  container.innerHTML = '';

  // 選択されたカテゴリに該当する技術を抽出し、画面に表示
  const filteredTechs = Object.values(allTechsMap).filter(tech => tech.category === currentCategory);

  if (filteredTechs.length === 0) {
    container.innerHTML = `<p style="color: #8b949e; padding: 20px;">このカテゴリの技術データが読み込まれていないか、存在しません。</p>`;
    return;
  }

  filteredTechs.forEach(tech => {
    const techId = String(tech.id || tech.techId);
    const isCompleted = completedTechs.includes(techId);

    const card = document.createElement('div');
    card.className = `tech-card ${isCompleted ? 'completed' : 'available'}`;
    card.style.cssText = "background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;";
    
    card.innerHTML = `
      <div>
        <h3 style="margin: 0 0 5px 0; color: #f0f6fc; font-size: 16px;">${tech.title || tech.name || techId}</h3>
        <p style="margin: 0; font-size: 12px; color: #8b949e;">ステータス: <span style="color: ${isCompleted ? '#3fb950' : '#d29922'};">${isCompleted ? '研究完了' : '未研究'}</span></p>
      </div>
      <div>
        ${isCompleted 
          ? '<span style="color: #3fb950; font-weight: bold; font-size: 14px;">✔ 完了済</span>' 
          : `<button onclick="completeTech('${techId}')" style="background: #238636; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">研究する</button>`
        }
      </div>
    `;
    container.appendChild(card);
  });
}

// カテゴリタブの切り替えイベント初期化
function initTabs() {
  const tabs = document.querySelectorAll('.cat-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      tabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      currentCategory = e.target.getAttribute('data-category');
      renderResearchTree();
    });
  });
}

// 初期化処理
document.addEventListener('DOMContentLoaded', async () => {
  loadCompletedTechs();
  initTabs();
  await loadAllTechsData();
});
