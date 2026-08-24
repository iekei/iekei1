// import.js - 資源輸入システム (ソ連視点・1936年当時版)

// 資源ごとの年代別主要産出国データ（1936～1950年代 / ソ連除外・当時基準）
const importDatabase = {
  石油: {
    "1936〜1940": [{ country: "アメリカ", amount: 200 }, { country: "ベネズエラ", amount: 100 }, { country: "オランダ領東インド", amount: 70 }],
    "1941〜1945": [{ country: "アメリカ", amount: 300 }, { country: "ベネズエラ", amount: 140 }, { country: "イラン", amount: 80 }],
    "1946〜1950": [{ country: "アメリカ", amount: 250 }, { country: "中東(イラン等)", amount: 160 }, { country: "ベネズエラ", amount: 110 }]
  },
  石炭: {
    "1936〜1940": [{ country: "アメリカ", amount: 300 }, { country: "ドイツ", amount: 220 }, { country: "イギリス", amount: 150 }],
    "1941〜1945": [{ country: "アメリカ", amount: 400 }, { country: "イギリス", amount: 180 }, { country: "ドイツ(占領地含む)", amount: 100 }],
    "1946〜1950": [{ country: "アメリカ", amount: 350 }, { country: "ポーランド", amount: 150 }, { country: "イギリス", amount: 130 }]
  },
  鋼材: {
    "1936〜1940": [{ country: "アメリカ", amount: 300 }, { country: "ドイツ", amount: 220 }, { country: "イギリス", amount: 140 }],
    "1941〜1945": [{ country: "アメリカ", amount: 500 }, { country: "イギリス", amount: 200 }, { country: "カナダ", amount: 110 }],
    "1946〜1950": [{ country: "アメリカ", amount: 400 }, { country: "イギリス", amount: 160 }, { country: "フランス", amount: 100 }]
  },
  アルミ: {
    "1936〜1940": [{ country: "アメリカ", amount: 150 }, { country: "ドイツ", amount: 130 }, { country: "カナダ", amount: 100 }],
    "1941〜1945": [{ country: "アメリカ", amount: 320 }, { country: "カナダ", amount: 270 }, { country: "イギリス", amount: 120 }],
    "1946〜1950": [{ country: "アメリカ", amount: 260 }, { country: "カナダ", amount: 210 }, { country: "フランス", amount: 90 }]
  },
  クロム: {
    "1936〜1940": [{ country: "トルコ", amount: 130 }, { country: "南アフリカ連邦 (イギリス領)", amount: 90 }, { country: "南ローデシア (イギリス領)", amount: 70 }],
    "1941〜1945": [{ country: "トルコ", amount: 160 }, { country: "南アフリカ連邦 (イギリス領)", amount: 130 }, { country: "南ローデシア (イギリス領)", amount: 80 }],
    "1946〜1950": [{ country: "南アフリカ連邦 (イギリス領)", amount: 140 }, { country: "トルコ", amount: 110 }, { country: "南ローデシア (イギリス領)", amount: 90 }]
  },
  ゴム: {
    "1936〜1940": [{ country: "イギリス領マラヤ", amount: 210 }, { country: "オランダ領東インド", amount: 190 }, { country: "セイロン (イギリス領)", amount: 70 }],
    "1941〜1945": [{ country: "ブラジル", amount: 130 }, { country: "アメリカ (合成ゴム)", amount: 110 }, { country: "セイロン (イギリス領)", amount: 80 }],
    "1946〜1950": [{ country: "イギリス領マラヤ", amount: 230 }, { country: "オランダ領東インド", amount: 190 }, { country: "アメリカ", amount: 150 }]
  },
  タングステン: {
    "1936〜1940": [{ country: "中華民国", amount: 130 }, { country: "ポルトガル", amount: 90 }, { country: "ボリビア", amount: 60 }],
    "1941〜1945": [{ country: "ポルトガル", amount: 110 }, { country: "ボリビア", amount: 100 }, { country: "スペイン", amount: 70 }],
    "1946〜1950": [{ country: "中華民国", amount: 140 }, { country: "ボリビア", amount: 90 }, { country: "ポルトガル", amount: 50 }]
  }
};

let currentSelectedResource = '石油';

// 初回読み込み時に import.css を動的にリンクする処理
function ensureImportCSSLoaded() {
  const cssId = 'import-css-link';
  if (!document.getElementById(cssId)) {
    const link = document.createElement('link');
    link.id = cssId;
    link.rel = 'stylesheet';
    link.href = 'import.css';
    document.head.appendChild(link);
  }
}

function initImportModal() {
  ensureImportCSSLoaded();

  // すでに存在していなければDOMを挿入
  if (document.getElementById('import-modal-overlay')) return;

  const overlayHtml = `
    <div id="import-modal-overlay" class="import-overlay hidden">
      <div class="import-modal-content">
        <div class="import-modal-header">
          <h3>資源輸入センター (対外貿易)</h3>
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
        <span>🏳️ ${item.country} (輸入量目安: +${item.amount})</span>
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
