// import.js - 資源輸入システム

// 資源ごとの年代別主要産出国データ（1936～1950年代）
const importDatabase = {
  石油: {
    "1936〜1940": [{ country: "アメリカ", amount: 200 }, { "ソ連": 100 }, { country: "ベネズエラ", amount: 80 }],
    "1941〜1945": [{ country: "アメリカ", amount: 300 }, { country: "ベネズエラ", amount: 120 }, { "ソ連": 90 }],
    "1946〜1950": [{ country: "アメリカ", amount: 250 }, { country: "中東(イラン等)", amount: 150 }, { country: "ベネズエラ", amount: 100 }]
  },
  石炭: {
    "1936〜1940": [{ country: "アメリカ", amount: 300 }, { country: "ドイツ", amount: 200 }, { country: "イギリス", amount: 150 }],
    "1941〜1945": [{ country: "アメリカ", amount: 400 }, { country: "イギリス", amount: 180 }, { country: "ソ連", amount: 120 }],
    "1946〜1950": [{ country: "アメリカ", amount: 350 }, { country: "ドイツ", amount: 200 }, { country: "ポーランド", amount: 130 }]
  },
  鋼材: {
    "1936〜1940": [{ country: "アメリカ", amount: 300 }, { country: "ドイツ", amount: 200 }, { country: "ソ連", amount: 150 }],
    "1941〜1945": [{ country: "アメリカ", amount: 500 }, { country: "イギリス", amount: 200 }, { country: "ソ連", amount: 180 }],
    "1946〜1950": [{ country: "アメリカ", amount: 400 }, { country: "ソ連", amount: 250 }, { country: "イギリス", amount: 150 }]
  },
  アルミ: {
    "1936〜1940": [{ country: "アメリカ", amount: 150 }, { country: "ドイツ", amount: 120 }, { country: "カナダ", amount: 100 }],
    "1941〜1945": [{ country: "アメリカ", amount: 300 }, { country: "カナダ", amount: 250 }, { country: "イギリス", amount: 120 }],
    "1946〜1950": [{ country: "アメリカ", amount: 250 }, { country: "カナダ", amount: 200 }, { country: "ソ連", amount: 100 }]
  },
  クロム: {
    "1936〜1940": [{ country: "トルコ", amount: 120 }, { country: "ソ連", amount: 90 }, { country: "南アフリカ", amount: 80 }],
    "1941〜1945": [{ country: "トルコ", amount: 150 }, { country: "南アフリカ", amount: 120 }, { country: "ソ連", amount: 100 }],
    "1946〜1950": [{ country: "ソ連", amount: 150 }, { country: "南アフリカ", amount: 130 }, { country: "トルコ", amount: 100 }]
  },
  ゴム: {
    "1936〜1940": [{ country: "イギリス領マラヤ", amount: 200 }, { country: "オ領東インド", amount: 180 }, { country: "セイロン", amount: 70 }],
    "1941〜1945": [{ country: "ブラジル(天然/合成)", amount: 120 }, { country: "アメリカ(合成ゴム)", amount: 100 }, { country: "セイロン", amount: 80 }],
    "1946〜1950": [{ country: "イギリス領マラヤ", amount: 220 }, { country: "オランダ領東インド", amount: 180 }, { country: "アメリカ", amount: 150 }]
  },
  タングステン: {
    "1936〜1940": [{ country: "中国", amount: 120 }, { country: "ポルトガル", amount: 80 }, { country: "ボリビア", amount: 60 }],
    "1941〜1945": [{ country: "ポルトガル", amount: 100 }, { country: "ボリビア", amount: 90 }, { country: "中国", amount: 70 }],
    "1946〜1950": [{ country: "中国", amount: 130 }, { country: "ボリビア", amount: 80 }, { country: "ポルトガル", amount: 50 }]
  }
};

let currentSelectedResource = '石油';

function initImportModal() {
  // すでに存在していなければDOMを挿入
  if (document.getElementById('import-modal-overlay')) return;

  const overlayHtml = `
    <div id="import-modal-overlay" class="import-overlay hidden">
      <div class="import-modal-content">
        <div class="import-modal-header">
          <h3>資源輸入センター</h3>
          <button id="close-import-modal" class="close-btn">&times;</button>
        </div>
        <div class="import-resource-icons" id="import-resource-icons">
          <!-- アイコンが動的に入る -->
        </div>
        <div class="import-target-info" id="import-target-info">
          <!-- 選択した資源の年代別産出国リスト -->
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  // スタイル適用
  const style = document.createElement('style');
  style.innerHTML = `
    .import-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center;
      align-items: center; z-index: 9999;
    }
    .import-overlay.hidden { display: none; }
    .import-modal-content {
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      width: 500px; padding: 20px; color: #c9d1d9; font-family: sans-serif;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .import-modal-header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #30363d; padding-bottom: 10px; margin-bottom: 15px;
    }
    .import-modal-header h3 { margin: 0; font-size: 16px; color: #58a6ff; }
    .close-btn { background: none; border: none; color: #8b949e; font-size: 20px; cursor: pointer; }
    .close-btn:hover { color: #f85149; }
    .import-resource-icons {
      display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap;
    }
    .import-icon-btn {
      background: #21262d; border: 1px solid #30363d; border-radius: 6px; padding: 8px;
      cursor: pointer; display: flex; flex-direction: column; align-items: center; width: 55px;
    }
    .import-icon-btn.active { border-color: #58a6ff; background: #1f6feb33; }
    .import-icon-btn img { width: 24px; height: 24px; object-fit: contain; margin-bottom: 4px; }
    .import-icon-btn span { font-size: 10px; color: #c9d1d9; }
    .era-section {
      background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
      padding: 10px; margin-bottom: 10px; font-size: 13px;
    }
    .era-title { font-weight: bold; color: #58a6ff; margin-bottom: 6px; }
    .country-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 0; border-bottom: 1px dashed #21262d;
    }
    .country-row:last-child { border-bottom: none; }
    .import-exec-btn {
      background: #238636; color: white; border: none; padding: 4px 10px;
      border-radius: 4px; cursor: pointer; font-size: 11px;
    }
    .import-exec-btn:hover { background: #2ea043; }
  `;
  document.head.appendChild(style);

  // イベント設定
  document.getElementById('close-import-modal').addEventListener('click', closeImportModal);
  document.getElementById('import-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'import-modal-overlay') closeImportModal();
  });

  renderImportIcons();
  renderImportDetails(currentSelectedResource);
}

function openImportModal() {
  initImportModal();
  document.getElementById('import-modal-overlay').classList.remove('hidden');
}

function closeImportModal() {
  const overlay = document.getElementById('import-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function renderImportIcons() {
  const container = document.getElementById('import-resource-icons');
  if (!container) return;
  container.innerHTML = '';

  const resList = Object.keys(importDatabase);
  resList.forEach(resName => {
    const btn = document.createElement('button');
    btn.className = `import-icon-btn ${resName === currentSelectedResource ? 'active' : ''}`;
    btn.innerHTML = `
      <img src="image/${resName}.png" alt="${resName}">
      <span>${resName}</span>
    `;
    btn.addEventListener('click', () => {
      currentSelectedResource = resName;
      renderImportIcons();
      renderImportDetails(resName);
    });
    container.appendChild(btn);
  });
}

function renderImportDetails(resName) {
  const container = document.getElementById('import-target-info');
  if (!container) return;
  container.innerHTML = '';

  const eras = importDatabase[resName];
  for (const [eraName, countries] of Object.entries(eras)) {
    let countriesHtml = countries.map(item => `
      <div class="country-row">
        <span>🏳️ ${item.country} (産出量目安: +${item.amount})</span>
        <button class="import-exec-btn" onclick="executeImport('${resName}', ${item.amount})">輸入する</button>
      </div>
    `).join('');

    const eraDiv = document.createElement('div');
    eraDiv.className = 'era-section';
    eraDiv.innerHTML = `
      <div class="era-title">📅 ${eraName}年代</div>
      ${countriesHtml}
    `;
    container.appendChild(eraDiv);
  }
}

function executeImport(resName, amount) {
  if (typeof resources !== 'undefined') {
    resources[resName] = (resources[resName] || 0) + amount;
    if (typeof saveProductionData === 'function') saveProductionData();
    if (typeof renderProductionView === 'function') renderProductionView();
    alert(`${resName}を ${amount} 輸入しました！`);
  }
}
