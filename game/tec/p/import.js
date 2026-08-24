// import.js - 資源輸入システム (民需工場・輸送船の自己完結管理対応)

// --- 工場・輸送船のグローバル管理変数（未定義の場合ここで初期化） ---
if (typeof civilianFactories === 'undefined') {
  window.civilianFactories = 50; // 総民需工場数
}
if (typeof availableCivilianFactories === 'undefined') {
  window.availableCivilianFactories = 50; // 未使用の空き民需工場数
}
if (typeof convoys === 'undefined') {
  window.convoys = 100; // 総輸送船数
}
if (typeof availableConvoys === 'undefined') {
  window.availableConvoys = 100; // 未使用の空き輸送船数
}
if (typeof window.activeImports === 'undefined') {
  window.activeImports = []; // 進行中の輸入契約リスト
}

// 資源ごとの年代別主要産出国データ（国ごとの最大輸入上限 amount を設定）
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

// 初回読み込み時に import.css を動的にリンク
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

  if (document.getElementById('import-modal-overlay')) return;

  const overlayHtml = `
    <div id="import-modal-overlay" class="import-overlay hidden">
      <div class="import-modal-content">
        <div class="import-modal-header">
          <h3>資源輸入センター (対外貿易)</h3>
          <div class="import-global-status" id="import-global-status">
            <!-- 民需工場・輸送船の全体・残り数 -->
          </div>
          <button id="close-import-modal" class="close-btn">&times;</button>
        </div>
        <div class="import-resource-icons" id="import-resource-icons"></div>
        <div class="import-target-info" id="import-target-info"></div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  document.getElementById('close-import-modal').addEventListener('click', closeImportModal);
  document.getElementById('import-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'import-modal-overlay') closeImportModal();
  });

  renderImportIcons();
  updateGlobalStatus();
  renderImportDetails(currentSelectedResource);
}

function openImportModal() {
  initImportModal();
  updateGlobalStatus();
  document.getElementById('import-modal-overlay').classList.remove('hidden');
}

function closeImportModal() {
  const overlay = document.getElementById('import-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function updateGlobalStatus() {
  const statusContainer = document.getElementById('import-global-status');
  if (!statusContainer) return;

  statusContainer.innerHTML = `
    <div class="status-item"><img src="image/民需工場.png" alt="民需工場"> 民需: <span>${window.availableCivilianFactories}/${window.civilianFactories}</span></div>
    <div class="status-item"><img src="image/輸送船.png" alt="輸送船"> 輸送船: <span>${window.availableConvoys}/${window.convoys}</span></div>
  `;
}

function renderImportIcons() {
  const container = document.getElementById('import-resource-icons');
  if (!container) return;
  container.innerHTML = '';

  Object.keys(importDatabase).forEach(resName => {
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
    let countriesHtml = countries.map((item, index) => {
      const sliderId = `slider-${resName}-${eraName}-${index}`;
      const valId = `val-${resName}-${eraName}-${index}`;
      const civId = `civ-${resName}-${eraName}-${index}`;
      const convId = `conv-${resName}-${eraName}-${index}`;
      const maxAmount = item.amount;

      return `
        <div class="country-import-box">
          <div class="country-row-top">
            <span>🏳️ ${item.country} (上限: ${maxAmount})</span>
            <span class="import-amount-display"><strong id="${valId}">0</strong> / ${maxAmount}</span>
          </div>
          <div class="country-slider-row">
            <input type="range" id="${sliderId}" min="0" max="${maxAmount}" step="50" value="0" 
              oninput="onImportSliderChange('${resName}', '${eraName}', '${item.country}', ${maxAmount}, this.value, '${valId}', '${civId}', '${convId}')">
          </div>
          <div class="country-cost-row">
            <span>必要コスト: 民需工場 <strong id="${civId}">0</strong>個 / 輸送船 <strong id="${convId}">0</strong>隻</span>
            <button class="import-exec-btn" onclick="executeImport('${resName}', '${sliderId}', '${item.country}')">輸入契約を結ぶ</button>
          </div>
        </div>
      `;
    }).join('');

    const eraDiv = document.createElement('div');
    eraDiv.className = 'era-section';
    eraDiv.innerHTML = `
      <div class="era-title">📅 ${eraName}年代</div>
      ${countriesHtml}
    `;
    container.appendChild(eraDiv);
  }
}

// スライダー変更時の動的コスト計算（50刻み）
function onImportSliderChange(resName, eraName, country, maxAmount, val, valId, civId, convId) {
  const amount = parseInt(val, 10);
  document.getElementById(valId).textContent = amount;

  // 50資源あたり 民需工場2個、輸送船6隻
  const requiredCiv = (amount / 50) * 2;
  const requiredConv = (amount / 50) * 6;

  document.getElementById(civId).textContent = requiredCiv;
  document.getElementById(convId).textContent = requiredConv;
}

// 実行時のチェック＆定期輸入登録処理
function executeImport(resName, sliderId, countryName) {
  const slider = document.getElementById(sliderId);
  const amount = parseInt(slider.value, 10);

  if (amount <= 0) {
    alert("輸入する数量を50以上に設定してください。");
    return;
  }

  const requiredCiv = (amount / 50) * 2;
  const requiredConv = (amount / 50) * 6;

  // 不足判定（足りない方を動的に判定して表示）
  let missingItems = [];
  if (requiredCiv > window.availableCivilianFactories) missingItems.push("民需工場");
  if (requiredConv > window.availableConvoys) missingItems.push("輸送船");

  if (missingItems.length > 0) {
    alert(`${missingItems.join(" または ")}が足りません！`);
    return;
  }

  // リソースの消費と割り当て
  window.availableCivilianFactories -= requiredCiv;
  window.availableConvoys -= requiredConv;

  // 7日ごとの定期輸入リストに追加
  window.activeImports.push({
    resource: resName,
    amount: amount,
    country: countryName,
    civCost: requiredCiv,
    convCost: requiredConv,
    daysRemaining: 7
  });

  updateGlobalStatus();
  alert(`${countryName} から ${resName} を ${amount} の輸入契約を結びました！\n7日ごとに資源が供給されます。`);
  
  // スライダーをリセット
  slider.value = 0;
  slider.dispatchEvent(new Event('input'));
}

// 7日ごとの定期処理（ゲーム側のメインループなどから呼び出してください）
function processImportsTick() {
  if (typeof window.activeImports === 'undefined') return;

  window.activeImports.forEach(imp => {
    imp.daysRemaining--;
    if (imp.daysRemaining <= 0) {
      if (typeof resources !== 'undefined') {
        resources[imp.resource] = (resources[imp.resource] || 0) + imp.amount;
      }
      imp.daysRemaining = 7; // 7日ごとにリセット
    }
  });

  if (typeof saveProductionData === 'function') saveProductionData();
  if (typeof renderProductionView === 'function') renderProductionView();
}
