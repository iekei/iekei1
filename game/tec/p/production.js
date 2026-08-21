let completedTechs = JSON.parse(localStorage.getItem('completedTechs') || '[]');
let techDataAll = {};

// 資源データ
let resources = {
  cards: 10,
  steel: 500,
  aluminum: 300
};

let productionLines = [];
let maxFactories = 30; // 手動入力で変更可能な上限工場数
let showOldEquipment = false; // 旧式装備を表示するかどうか

// LocalStorageから時間・スピードを復元
let gameDate = localStorage.getItem('gameDate') ? new Date(localStorage.getItem('gameDate')) : new Date(1936, 0, 1);
let gameSpeed = localStorage.getItem('gameSpeed') ? parseInt(localStorage.getItem('gameSpeed'), 10) : 0;

document.addEventListener('DOMContentLoaded', async () => {
  await loadAllTechsForProduction();
  initProductionUIControls();
  initSharedClock();
  renderProductionView();

  // 別画面（研究ツリーなど）で研究が完了した際、自動でリアルタイム反映するための監視
  window.addEventListener('storage', (e) => {
    if (e.key === 'completedTechs') {
      completedTechs = JSON.parse(e.newValue || '[]');
      renderProductionView();
    }
  });

  // 定期ポーリングでもローカルストレージの完了技術をチェック（タブ間同期の確実化）
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
  // 工場上限入力のバインド
  const maxFacInput = document.getElementById('max-factories-input');
  if (maxFacInput) {
    maxFacInput.value = maxFactories;
    maxFacInput.addEventListener('change', (e) => {
      maxFactories = Math.max(1, parseInt(e.target.value) || 1);
      renderProductionLines();
    });
  }

  // 旧式表示切り替えボタンのバインド
  const toggleOldBtn = document.getElementById('toggle-old-equip-btn');
  if (toggleOldBtn) {
    toggleOldBtn.addEventListener('click', () => {
      showOldEquipment = !showOldEquipment;
      toggleOldBtn.textContent = showOldEquipment ? '旧式装備を隠す' : '旧式装備を表示';
      renderAvailableTechs();
    });
  }
}

function renderProductionView() {
  renderAvailableTechs();
  renderProductionLines();
  updateResourceDisplay();
  updateTotalStatsSummary();
}

// ==========================================
// 最新兵器フィルタリング & 旧式表示ロジック
// ==========================================
function renderAvailableTechs() {
  const container = document.getElementById('tech-list-to-produce');
  if (!container) return;
  container.innerHTML = '';

  if (completedTechs.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">まだ研究が完了している装備がありません。<br>研究ツリーで技術を完了させてください。</p>';
    return;
  }

  // 完了した技術オブジェクトのリスト
  const unlockedTechs = completedTechs.map(id => techDataAll[id]).filter(Boolean);

  // カテゴリごとに最高年代（またはそれに準ずる最新）を特定
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

    // 旧式表示がオフかつ最新でなければスキップ
    if (!showOldEquipment && !isLatest) return;

    const baseDailyRate = getBaseDailyRate(tech);
    const card = document.createElement('div');
    card.className = `item-card ${isLatest ? 'latest-equip' : 'old-equip'}`;
    card.innerHTML = `
      <div class="item-info">
        <h4>${tech.title} ${isLatest ? '<span class="badge-latest">最新</span>' : '<span class="badge-old">旧式</span>'}</h4>
        <p>基準生産速度: <b>${baseDailyRate.toFixed(2)}</b> 個/日 | 開発年: ${tech.year || 1936}年</p>
      </div>
      <button class="action-btn" onclick="startProductionLine('${tech.id}')">生産開始</button>
    `;

    // マウスオーバーツールチップ
    card.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    card.addEventListener('mouseleave', hideTooltip);

    container.appendChild(card);
  });
}

// 兵器カテゴリやタイプに応じた生産スピードの自動調整
function getBaseDailyRate(tech) {
  if (tech.base_daily_rate) return tech.base_daily_rate;
  const cat = tech.category;
  if (cat === 'infantry' || cat === 'artillery') return 2.5; // 歩兵・砲兵は速い
  if (cat === 'armor') {
    if (tech.title.includes('重') || tech.title.includes('駆逐')) return 0.8;
    return 1.2; // 軽・中戦車
  }
  if (cat === 'air') return 0.5; // 航空機
  if (cat === 'naval') return 0.05; // 艦艇は1工場で長期間（1年で約18個＝実質一隻等に換算）
  return 1.0;
}

function startProductionLine(techId) {
  const tech = techDataAll[techId];
  if (!tech) return;

  const currentTotalFac = getTotalUsedFactories();
  if (currentTotalFac >= maxFactories) {
    alert(`軍需工場の総割当数が上限(${maxFactories}個)に達しています！`);
    return;
  }

  productionLines.push({
    id: Date.now(),
    techId: techId,
    factories: 1,
    progress: 0,
    producedCount: 0
  });
  renderProductionLines();
}

function adjustFactories(lineId, delta) {
  const line = productionLines.find(l => l.id === lineId);
  if (!line) return;

  const currentTotal = getTotalUsedFactories();
  const newTotal = currentTotal + delta;

  if (delta > 0 && newTotal > maxFactories) {
    alert(`軍需工場の総割当数が上限(${maxFactories}個)に達しています！`);
    return;
  }
  if (line.factories + delta < 1) return;

  line.factories += delta;
  renderProductionLines();
}

function removeLine(lineId) {
  productionLines = productionLines.filter(l => l.id !== lineId);
  renderProductionLines();
}

function getTotalUsedFactories() {
  return productionLines.reduce((sum, l) => sum + l.factories, 0);
}

// ==========================================
// 生産ライン & 現在のステータス合計計算
// ==========================================
function renderProductionLines() {
  const container = document.getElementById('production-lines-list');
  if (!container) return;
  container.innerHTML = '';
  
  const usedFacEl = document.getElementById('used-factories');
  if (usedFacEl) usedFacEl.textContent = getTotalUsedFactories();
  const maxFacDisplay = document.getElementById('max-factories-display');
  if (maxFacDisplay) maxFacDisplay.textContent = maxFactories;

  if (productionLines.length === 0) {
    container.innerHTML = '<p style="color: #8b949e; font-size: 13px;">稼働中の生産ラインはありません。</p>';
    updateTotalStatsSummary();
    return;
  }

  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (!tech) return;

    const baseRate = getBaseDailyRate(tech);
    const currentDailyOutput = baseRate * line.factories;

    const card = document.createElement('div');
    card.className = 'line-card';
    card.innerHTML = `
      <div class="line-details" style="flex: 1;">
        <strong>${tech.title}</strong>
        <div>生産数: <b>${line.producedCount}</b> 個 (1日あたり: <b>${currentDailyOutput.toFixed(2)}</b> 個)</div>
        <div class="factory-controls">
          工場 (${line.factories}個): 
          <button onclick="adjustFactories(${line.id}, -1)">-</button>
          <button onclick="adjustFactories(${line.id}, 1)">+</button>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${Math.min(100, line.progress)}%"></div>
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

// 現在生産中の装備から攻撃力等のステータスを自動集計して表示
function updateTotalStatsSummary() {
  const summaryContainer = document.getElementById('current-stats-summary');
  if (!summaryContainer) return;

  // 生産中のユニークな装備を抽出（重複はまとめる、または最新のものを優先）
  const activeTechs = {};
  productionLines.forEach(line => {
    const tech = techDataAll[line.techId];
    if (tech) {
      activeTechs[tech.id] = tech;
    }
  });

  const techsList = Object.values(activeTechs);
  if (techsList.length === 0) {
    summaryContainer.innerHTML = '<span style="color: #8b949e;">現在稼働中の生産ラインがありません（ステータス 0）</span>';
    return;
  }

  // ステータス項目の自動合算・抽出
  let totalAttack = 0;
  let totalDefense = 0;
  let totalArmor = 0;
  let effectsSummary = [];

  techsList.forEach(tech => {
    // techの effects や専用プロパティから数値を探す
    if (tech.effects && Array.isArray(tech.effects)) {
      tech.effects.forEach(eff => {
        effectsSummary.push(eff);
        const matchNum = eff.match(/([+-]?\d+(?:\.\d+)?)/);
        if (matchNum) {
          const val = parseFloat(matchNum[1]);
          if (eff.includes('攻撃') || eff.includes('火力')) totalAttack += val;
          if (eff.includes('防御')) totalDefense += val;
          if (eff.includes('装甲')) totalArmor += val;
        }
      });
    }
  });

  summaryContainer.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px; color: #58a6ff;">📊 現在生産中装備の総合ステータス効果:</div>
    <div style="font-size: 12px; color: #c9d1d9;">
      稼働ライン種類: ${techsList.length}種 | 
      推計総攻撃力ボーナス: +${totalAttack.toFixed(1)} | 
      総防御力ボーナス: +${totalDefense.toFixed(1)}
    </div>
  `;
}

// ==========================================
// ツールチップ機能
// ==========================================
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
  const steelEl = document.getElementById('res-steel');
  const alumEl = document.getElementById('res-aluminum');
  const cardsEl = document.getElementById('res-cards');
  
  if (steelEl) steelEl.textContent = resources.steel;
  if (alumEl) alumEl.textContent = resources.aluminum;
  if (cardsEl) cardsEl.textContent = `${resources.cards}枚 (${resources.cards * 100})`;
}

function updateCalendarUI() {
  const calEl = document.getElementById('calendar-display');
  if (calEl) {
    calEl.textContent = `${gameDate.getFullYear()}年${gameDate.getMonth() + 1}月${gameDate.getDate()}日`;
  }
}

// ==========================================
// 国家方針・研究画面と完全に同期する時計システム
// ==========================================
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
      runTick();
    });
  });

  // 一時停止ボタンのハンドラ
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      gameSpeed = 0;
      localStorage.setItem('gameSpeed', 0);
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      pauseBtn.classList.add('active');
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
        const savedDateStr = localStorage.getItem('gameDate');
        if (savedDateStr) {
          gameDate = new Date(savedDateStr);
        }

        // 1日進める
        gameDate.setDate(gameDate.getDate() + 1);
        localStorage.setItem('gameDate', gameDate.toISOString());
        updateCalendarUI();

        // 生産ラインの進行処理
        productionLines.forEach(line => {
          const tech = techDataAll[line.techId];
          if (!tech) return;

          const baseRate = getBaseDailyRate(tech);
          const dailyProduced = baseRate * line.factories;
          
          line.progress += dailyProduced;
          while (line.progress >= 100) {
            line.progress -= 100;
            line.producedCount += 1;
          }
        });
        renderProductionLines();
      }, interval);
    }
  }

  if (gameSpeed > 0) {
    runTick();
  }
}
