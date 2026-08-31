let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
let techDataAll = {};

// 7種類の資源データ
let resources = JSON.parse(localStorage.getItem('resources') || JSON.stringify({
  石油: 500,
  石炭: 800,
  鋼材: 1000,
  アルミ: 500,
  クロム: 300,
  ゴム: 500,
  タングステン: 300
}));

// LocalStorageから生産ラインのデータを復元
let productionLines = JSON.parse(localStorage.getItem('productionLines') || '[]');
let showOldEquipment = false;

// LocalStorageから時間・スピードを復元
let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

// ==========================================
// 1. 親画面（window.opener）連携ヘルパー関数
// ==========================================
/**
 * 親画面（メイン画面）が開かれているか判定
 */
function isParentAvailable() {
  return window.opener && !window.opener.closed;
}

/**
 * 親画面のログ（setLogText）にメッセージを送信する
 */
function sendLogToParent(text) {
  if (isParentAvailable() && typeof window.opener.setLogText === 'function') {
    window.opener.setLogText(text);
  }
}

/**
 * 親画面の日付・ゲームスピードと同期する
 */
function syncWithParentDate() {
  if (isParentAvailable() && window.opener.currentDate) {
    gameDate = new Date(window.opener.currentDate);
    if (typeof window.opener.gameSpeed !== 'undefined') {
      gameSpeed = window.opener.gameSpeed;
    }
    updateCalendarUI();
  }
}

/**
 * 親画面からの直接呼び出し・再描画用グローバル関数
 */
window.refreshProductionView = function() {
  completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
  resources = JSON.parse(localStorage.getItem('resources') || JSON.stringify(resources));
  productionLines = JSON.parse(localStorage.getItem('productionLines') || '[]');
  syncWithParentDate();
  renderProductionView();
};

document.addEventListener('DOMContentLoaded', async () => {
  syncWithParentDate();
  await loadAllTechsForProduction();
  initProductionUIControls();
  initSharedClock();
  checkAllLinesShortage(); // 起動時にも資源不足をチェック
  renderProductionView();

  // 別タブ/親画面での LocalStorage 更新イベントを監視
  window.addEventListener('storage', (e) => {
    if (e.key === 'completedTechs' || e.key === 'resources' || e.key === 'productionLines') {
      window.refreshProductionView();
    }
  });

  // postMessage 経由の親画面命令受信処理
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SYNC_PRODUCTION') {
      window.refreshProductionView();
    }
  });

  setInterval(() => {
    const latestTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
    if (JSON.stringify(latestTechs) !== JSON.stringify(completedTechs)) {
      completedTechs = latestTechs;
      renderProductionView();
    }
  }, 1000);
});

async function loadAllTechsForProduction() {
  const categories = ['infantry', 'armor', 'artillery', 'naval', 'air', 'engineering', 'industry'];
  for (const cat of categories) {
    try {
      const res = await fetch(`../data/tech_${cat}.json`);
      if (res.ok) {
        const list = await res.json();
        list.forEach(tech => { 
          tech.category = cat;
          techDataAll[tech.id] = tech; 
        });
      }
    } catch (e) { console.error(e); }
  }
}

function initProductionUIControls() {
  const toggleOldBtn = document.getElementById('toggle-old-equip-btn');
  if (toggleOldBtn) {
    toggleOldBtn.addEventListener('click', () => {
      showOldEquipment = !showOldEquipment;
      toggleOldBtn.textContent = showOldEquipment ? '旧式装備を隠す' : '旧式装備を表示';
      renderAvailableTechs();
    });
  }
}

function saveProductionData() {
  localStorage.setItem('productionLines', JSON.stringify(productionLines));
  localStorage.setItem('resources', JSON.stringify(resources));
}

function renderProductionView() {
  checkAllLinesShortage();
  renderAvailableTechs();
  renderProductionLines();
  updateResourceDisplay();
  updateTotalStatsSummary();
}

// 各ラインの資源が足りているかを事前に判定する関数
function checkAllLinesShortage() {
  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;

    const resCost = getTechResourceCost(tech);
    let canProduce = true;

    for (const [resName, costPerFac] of Object.entries(resCost)) {
      const totalNeeded = costPerFac * line.factories;
      if ((resources[resName] || 0) < totalNeeded) {
        canProduce = false;
        break;
      }
    }

    line.isShortage = !canProduce;
  });
}

// 装備ごとに適した資源と消費量（1工場・1日あたり）を自動割り当て
function getTechResourceCost(tech) {
  const title = tech.title || '';
  const cat = tech.category;

  if (cat === 'air') {
    return { アルミ: 2, 鋼材: 1, 石油: 1 };
  }
  if (cat === 'armor') {
    if (title.includes('重') || title.includes('駆逐') || title.includes('超重')) {
      return { 鋼材: 5, タングステン: 2, 石油: 1 };
    } else if (title.includes('軽') || title.includes('偵察')) {
      return { 鋼材: 2, ゴム: 1, 石油: 1 };
    }
    // 中戦車など標準
    return { 鋼材: 3, ゴム: 1, 石油: 1 };
  }
  if (cat === 'naval') {
    if (title.includes('戦艦') || title.includes('空母')) {
      return { 鋼材: 8, クロム: 3, 石油: 2 };
    }
    return { 鋼材: 5, クロム: 2, 石油: 1 };
  }
  if (cat === 'artillery') {
    return { 鋼材: 2, タングステン: 1 };
  }
  // 歩兵装備など
  return { 鋼材: 1, 石炭: 1 };
}

function renderAvailableTechs() {
  const container = document.getElementById('tech-list-to-produce');
  if (!container) return;
  container.innerHTML = '';

  if (completedTechs.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">まだ研究が完了している装備がありません。<br>研究ツリーで技術を完了させてください。</p>';
    return;
  }

  const unlockedTechs = completedTechs.map(id => techDataAll[id]).filter(Boolean);

  const latestTechsMap = {};
  unlockedTechs.forEach(tech => {
    const cat = tech.category || 'other';
    const year = tech.year || 1936;
    if (!latestTechsMap[cat] || year > latestTechsMap[cat].year) {
      latestTechsMap[cat] = { year: year };
    }
  });

  unlockedTechs.forEach(tech => {
    const cat = tech.category || 'other';
    const maxYearInCat = latestTechsMap[cat] ? latestTechsMap[cat].year : 1936;
    const isLatest = (tech.year || 1936) >= maxYearInCat;

    if (!showOldEquipment && !isLatest) return;

    const baseDailyRate = getBaseDailyRate(tech);
    const resCost = getTechResourceCost(tech);
    
    // 必要資源のアイコン付きHTML生成
    let costHtml = Object.entries(resCost).map(([resName, amt]) => {
      return `<span style="margin-right: 8px;"><img src="image/${resName}.png" class="res-icon-inline" alt="${resName}">${amt}</span>`;
    }).join('');

    const card = document.createElement('div');
    card.className = `item-card ${isLatest ? 'latest-equip' : 'old-equip'}`;
    card.innerHTML = `
      <div class="item-info">
        <h4>${tech.title} ${isLatest ? '<span class="badge-latest">最新</span>' : '<span class="badge-old">旧式</span>'}</h4>
        <p>1工場日産: <b>${Math.floor(baseDailyRate)}</b> 個/日 | 開発年: ${tech.year || 1936}年</p>
        <div style="font-size: 11px; color: #8b949e; margin-top: 4px;">必要資源(1日/1工場): ${costHtml}</div>
      </div>
      <button class="action-btn" onclick="startProductionLine('${tech.id}')">生産開始</button>
    `;

    card.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    card.addEventListener('mouseleave', hideTooltip);

    container.appendChild(card);
  });
}

function getBaseDailyRate(tech) {
  if (tech.base_daily_rate) return tech.base_daily_rate;
  if (tech.title.includes('AVS') || tech.title.includes('小銃') || tech.title.includes('歩兵')) return 10;
  const cat = tech.category;
  if (cat === 'infantry' || cat === 'artillery') return 10;
  if (cat === 'armor') {
    if (tech.title.includes('重') || tech.title.includes('駆逐')) return 1;
    return 3;
  }
  if (cat === 'air') return 2;
  if (cat === 'naval') return 0.1;
  return 5;
}

function startProductionLine(techId) {
  const tech = techDataAll[techId];
  if (!tech) return;

  productionLines.push({
    id: Date.now(),
    techId: techId,
    factories: 1,
    producedCount: 0,
    isShortage: false
  });
  saveProductionData();
  renderProductionView();

  sendLogToParent(`⚙️【生産開始】「${tech.title}」の軍需生産ラインを割り当てました（初期: 1工場）。`);
}

function adjustFactories(lineId, delta) {
  const line = productionLines.find(l => l.id === lineId);
  if (!line) return;
  if (line.factories + delta < 1) return;

  line.factories += delta;
  saveProductionData();
  renderProductionView();

  const tech = techDataAll[line.techId];
  const techTitle = tech ? tech.title : '不明な装備';
  sendLogToParent(`🏭【生産調整】「${techTitle}」の生産工場数を ${line.factories} 工場に変更しました。`);
}

function removeLine(lineId) {
  const line = productionLines.find(l => l.id === lineId);
  const tech = line ? techDataAll[line.techId] : null;

  productionLines = productionLines.filter(l => l.id !== lineId);
  saveProductionData();
  renderProductionView();

  if (tech) {
    sendLogToParent(`🗑️【生産停止】「${tech.title}」の生産ラインを解体・廃止しました。`);
  }
}

function getTotalUsedFactories() {
  return productionLines.reduce((sum, l) => sum + l.factories, 0);
}

function renderProductionLines() {
  const container = document.getElementById('production-lines-list');
  if (!container) return;
  container.innerHTML = '';
  
  const usedFacEl = document.getElementById('used-factories');
  if (usedFacEl) usedFacEl.textContent = getTotalUsedFactories();

  if (productionLines.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">稼働中の生産ラインはありません。</p>';
    updateTotalStatsSummary();
    return;
  }

  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;

    const baseRate = getBaseDailyRate(tech);
    const dailyOutput = Math.floor(baseRate * line.factories);
    const resCost = getTechResourceCost(tech);

    let costHtml = Object.entries(resCost).map(([resName, amt]) => {
      return `<span style="margin-right: 6px;"><img src="image/${resName}.png" class="res-icon-inline" alt="${resName}">${amt * line.factories}</span>`;
    }).join('');

    // 資源不足時の表示変更
    let statusText = `生産ストック数: <b style="color: #3fb950; font-size: 15px;">${line.producedCount}</b> 個`;
    if (line.isShortage) {
      statusText = `<span style="color: #f85149; font-weight: bold;">⚠️ 資源不足により生産不可</span>`;
    }

    const card = document.createElement('div');
    card.className = `line-card ${line.isShortage ? 'shortage-line' : ''}`;
    card.innerHTML = `
      <div class="line-details" style="flex: 1;">
        <strong>${tech.title}</strong>
        <div>${statusText}</div>
        <div style="font-size: 12px; color: #8b949e; margin-top: 2px;">1日生産量: <b>${dailyOutput}</b> 個 (工場数: ${line.factories})</div>
        <div style="font-size: 11px; color: #8b949e; margin-top: 2px;">消費資源(1日合計): ${costHtml}</div>
        <div class="factory-controls" style="margin-top: 6px;">
          工場割当: 
          <button onclick="adjustFactories(${line.id}, -1)">-</button>
          <span>${line.factories}</span>
          <button onclick="adjustFactories(${line.id}, 1)">+</button>
        </div>
      </div>
      <button class="action-btn danger" onclick="removeLine(${line.id})" style="margin-left: 10px;">廃止</button>
    `;

    card.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    card.addEventListener('mouseleave', hideTooltip);

    container.appendChild(card);
  });

  updateTotalStatsSummary();
}

function updateTotalStatsSummary() {
  const summaryContainer = document.getElementById('current-stats-summary');
  if (!summaryContainer) return;

  const activeTechsMap = {};
  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (tech && !line.isShortage) {
      activeTechsMap[tech.category || 'other'] = tech;
    }
  });

  const activeTechs = Object.values(activeTechsMap);
  if (activeTechs.length === 0) {
    summaryContainer.innerHTML = '<span style="color: #8b949e;">現在稼働中の生産ラインがありません（または資源不足）</span>';
    return;
  }

  let totalAntiInfantry = 0;
  let totalAntiArmor = 0;
  let totalMobility = 0;
  let totalSurvivability = 0;

  activeTechs.forEach(tech => {
    if (tech.effects && Array.isArray(tech.effects)) {
      tech.effects.forEach(eff => {
        const matchNum = eff.match(/([+-]?\d+(?:\.\d+)?)/);
        const val = matchNum ? parseFloat(matchNum[1]) : 5;
        if (eff.includes('対人') || eff.includes('攻撃')) totalAntiInfantry += val;
        if (eff.includes('対物') || eff.includes('貫通') || eff.includes('装甲')) totalAntiArmor += val;
        if (eff.includes('機動') || eff.includes('速度')) totalMobility += val;
        if (eff.includes('防御') || eff.includes('生存') || eff.includes('信頼')) totalSurvivability += val;
      });
    } else {
      totalAntiInfantry += 10;
      totalMobility += 5;
      totalSurvivability += 5;
    }
  });

  const totalAttack = totalAntiInfantry + totalAntiArmor;

  summaryContainer.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 6px; color: #58a6ff; font-size: 13px;">📊 現在生産中装備の総合ステータス</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px; color: #c9d1d9;">
      <div>⚔️ 総合攻撃力: <b>+${totalAttack.toFixed(0)}</b> (対人: ${totalAntiInfantry.toFixed(0)} / 対物: ${totalAntiArmor.toFixed(0)})</div>
      <div>🏃 機動力: <b>+${totalMobility.toFixed(0)}</b></div>
      <div>🛡️ 生存力(防御): <b>+${totalSurvivability.toFixed(0)}</b></div>
      <div>📦 稼働中の最新系統数: <b>${activeTechs.length}</b> 種</div>
    </div>
  `;
}

function showTooltip(e, tech) {
  let tooltip = document.getElementById('production-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'production-tooltip';
    tooltip.className = 'custom-tooltip hidden';
    document.body.appendChild(tooltip);
  }

  const effectsHtml = (tech.effects || []).map(eff => `<div>• ${eff}</div>`).join('');
  tooltip.innerHTML = `
    <div style="font-weight: bold; border-bottom: 1px solid #30363d; margin-bottom: 4px; padding-bottom: 2px;">${tech.title} (${tech.year || 1936}年)</div>
    <div style="font-size: 11px; color: #8b949e; margin-bottom: 4px;">${tech.desc || '詳細データなし'}</div>
    <div style="font-size: 11px; color: #3fb950;">${effectsHtml || '特殊効果なし'}</div>
  `;

  tooltip.classList.remove('hidden');
  moveTooltip(e);
  e.currentTarget.addEventListener('mousemove', moveTooltip);
}

function moveTooltip(e) {
  const tooltip = document.getElementById('production-tooltip');
  if (tooltip) {
    tooltip.style.left = `${e.clientX + 15}px`;
    tooltip.style.top = `${e.clientY + 15}px`;
  }
}

function hideTooltip() {
  const tooltip = document.getElementById('production-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

function updateResourceDisplay() {
  for (const [resName, val] of Object.entries(resources)) {
    const el = document.getElementById(`res-${resName}`);
    if (el) el.textContent = val;
  }
}

function updateCalendarUI() {
  const calEl = document.getElementById('calendar-display');
  if (calEl) {
    calEl.textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;
  }
}

function initSharedClock() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    const speed = parseInt(btn.getAttribute('data-speed'), 10);
    if (speed === gameSpeed) {
      btn.classList.add('active');
    } else if (gameSpeed === 0 && btn.id === 'btn-pause') {
      btn.classList.add('active');
    }

    btn.addEventListener('click', (e) => {
      gameSpeed = parseInt(e.target.getAttribute('data-speed'), 10) || 0;
      localStorage.setItem('gameSpeed', gameSpeed);

      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      // 親画面のスピードも同期変更
      if (isParentAvailable() && typeof window.opener.setGameSpeed === 'function') {
        window.opener.setGameSpeed(gameSpeed);
      }

      runTick();
    });
  });

  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      gameSpeed = 0;
      localStorage.setItem('gameSpeed', 0);
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      pauseBtn.classList.add('active');

      if (isParentAvailable() && typeof window.opener.setGameSpeed === 'function') {
        window.opener.setGameSpeed(0);
      }

      runTick();
    });
  }

  updateCalendarUI();

  const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };
  let gameTimer = null;

  function runTick() {
    if (gameTimer) clearInterval(gameTimer);
    gameSpeed = parseInt(localStorage.getItem('gameSpeed') || '0', 10);

    if (gameSpeed > 0) {
      const interval = speedIntervals[gameSpeed] || 1000;
      gameTimer = setInterval(() => {
        // 親画面が開いていれば日付を親画面から最新同期
        if (isParentAvailable() && window.opener.currentDate) {
          gameDate = new Date(window.opener.currentDate);
        } else {
          const savedDateStr = localStorage.getItem('gameDate');
          if (savedDateStr) {
            gameDate = new Date(savedDateStr);
          }
          gameDate.setDate(gameDate.getDate() + 1);
          localStorage.setItem('gameDate', gameDate.toISOString());
        }

        updateCalendarUI();

        // 各生産ラインの資源消費チェック＆生産処理
        productionLines.forEach(line => {
          const tech = techDataAll[line.techId];
          if (!tech) return;

          const resCost = getTechResourceCost(tech);
          let canProduce = true;

          // 工場数に応じた総消費量をチェック
          for (const [resName, costPerFac] of Object.entries(resCost)) {
            const totalNeeded = costPerFac * line.factories;
            if ((resources[resName] || 0) < totalNeeded) {
              canProduce = false;
              break;
            }
          }

          if (canProduce) {
            // 資源を実際に消費する
            for (const [resName, costPerFac] of Object.entries(resCost)) {
              resources[resName] -= costPerFac * line.factories;
            }
            line.isShortage = false;

            // 生産物をカウント
            const baseRate = getBaseDailyRate(tech);
            const dailyProduced = Math.floor(baseRate * line.factories);
            line.producedCount += dailyProduced;
          } else {
            // 資源不足により生産不可（新たに不足した場合に親画面へ警告ログ）
            if (!line.isShortage) {
              sendLogToParent(`⚠️【資源不足】「${tech.title}」の生産が資源不足により停止しました。`);
            }
            line.isShortage = true;
          }
        });

        saveProductionData();
        renderProductionView();
      }, interval);
    }
  }

  if (gameSpeed > 0) {
    runTick();
  }
}
