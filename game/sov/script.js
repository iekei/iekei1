// ==========================================
// 1. ゲーム内時間 & 速度管理システム
// ==========================================
let currentDate = new Date(1936, 0, 1);
let gameSpeed = 0;
let gameTimer = null;

const speedIntervals = { 1: 2000, 2: 1200, 3: 700, 4: 350, 5: 120 };

const gameStats = {
  stability: 85,
  warSupport: 60,
  aggression: 42,
  politicalPower: 120
};

let allFocuses = [];
const focusMap = {};
const completedFocuses = new Set();
const lockedFocuses = new Set();

let activeFocus = null;
let focusDaysRemaining = 0;

// ローカライズデータを保持する辞書
let localizationMap = {};

// ★ 読み込ませたいローカライズファイル（.yml）のリスト
// ファイルを追加したい場合はここにファイル名を追加していくことで自動一括読み込みされます
const localisationFiles = [
  "focus_l_japanese.yml",
  "focus_l_japanese.yml",
  "focus_l_japanese.yml",
  "focus_l_japanese.yml",
  // 例: "parties_l_japanese.yml",
  // 例: "events_l_japanese.yml"
];

// すべての.ymlファイルを非同期で一括読み込みしてパースする関数
async function loadLocalisation() {
  try {
    // リストにあるすべてのファイルを並行してフェッチ
    const promises = localisationFiles.map(async (filename) => {
      const res = await fetch(`../data/localisation/japanese/${filename}`);
      if (!res.ok) {
        console.warn(`ローカライズファイルの読み込みスキップまたは未配置: ${filename}`);
        return "";
      }
      return await res.text();
    });

    const texts = await Promise.all(promises);

    // 取得したすべてのテキストをパースして localizationMap に統合
    texts.forEach(text => {
      if (!text) return;
      const lines = text.split('\n');
      lines.forEach(line => {
        // 形式: KEY:0 "日本語テキスト" を正規表現で抽出
        const match = line.match(/^\s*([A-Za-z0-9_]+):\d+\s+"(.*)"/);
        if (match) {
          const key = match[1];
          const val = match[2];
          localizationMap[key] = val;
        }
      });
    });

    console.log(`全ローカライズ読み込み完了: 合計 ${Object.keys(localizationMap).length} 件`);
  } catch (e) {
    console.log("ローカライズファイルの読み込みエラー:", e);
  }
}

function updateCalendarUI() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const d = currentDate.getDate();
  document.getElementById('calendar-display').textContent = `${y}年${m}月${d}日`;
}

function tickDay() {
  currentDate.setDate(currentDate.getDate() + 1);
  updateCalendarUI();

  localStorage.setItem('gameDate', currentDate.toISOString());
  localStorage.setItem('gameSpeed', gameSpeed);

  if (activeFocus) {
    focusDaysRemaining--;
    const activeNodeEl = document.querySelector(`.focus-node[data-id="${activeFocus.id}"]`);
    if (activeNodeEl) {
      const progressEl = activeNodeEl.querySelector('.focus-progress');
      if (progressEl) progressEl.textContent = `残り ${focusDaysRemaining}日`;
    }

    if (focusDaysRemaining <= 0) {
      completeActiveFocus();
    }
  }
}

function setGameSpeed(speed) {
  gameSpeed = speed;
  if (gameTimer) clearInterval(gameTimer);

  localStorage.setItem('gameSpeed', gameSpeed);
  document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));

  if (speed === 0) {
    document.getElementById('btn-pause').classList.add('active');
  } else {
    const activeBtn = document.querySelector(`.speed-btn[data-speed="${speed}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    gameTimer = setInterval(tickDay, speedIntervals[speed]);
  }
}

// ==========================================
// 2. NF進行 & 排他ロック・報酬適用
// ==========================================
function startFocus(nf) {
  const title = localizationMap[nf.id] || nf.title || nf.id;
  if (activeFocus) {
    setLogText(`【変更】国家方針を「${title}」に変更しました。`);
  } else {
    setLogText(`【国家方針開始】「${title}」の実行を開始。（必要日数: ${nf.cost || 70}日）`);
  }

  activeFocus = nf;
  focusDaysRemaining = nf.cost || 70;
  renderTree();
}

function completeActiveFocus() {
  const completedNf = activeFocus;
  completedFocuses.add(completedNf.id);

  if (completedNf.mutually_exclusive) {
    const targets = Array.isArray(completedNf.mutually_exclusive) 
      ? completedNf.mutually_exclusive 
      : [completedNf.mutually_exclusive];
    targets.forEach(id => lockedFocuses.add(id));
  }

  applyFocusEffects(completedNf.effect);

  const title = localizationMap[completedNf.id] || completedNf.title || completedNf.id;
  const effectClean = completedNf.effect ? completedNf.effect.replace(/\n/g, ' / ') : '特記事項なし';
  setLogText(`🎉【国家方針完了】「${title}」を達成！ 報酬: [ ${effectClean} ]`);

  activeFocus = null;
  focusDaysRemaining = 0;
  renderTree();
}

function setLogText(text) {
  const target = document.getElementById("typewriter-text");
  if (target) target.textContent = text;
}

// ==========================================
// 3. ズーム & パン（ドラッグ移動）機能
// ==========================================
let scale = 1;
let pointX = 0;
let pointY = 0;
let startX = 0;
let startY = 0;
let isDragging = false;

const container = document.getElementById('tree-container');
const viewport = document.getElementById('tree-viewport');

function updateTransform() {
  viewport.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
}

container.addEventListener('mousedown', (e) => {
  if (e.target.closest('.focus-node')) return;
  isDragging = true;
  startX = e.clientX - pointX;
  startY = e.clientY - pointY;
  container.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  pointX = e.clientX - startX;
  pointY = e.clientY - startY;
  updateTransform();
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  container.style.cursor = 'grab';
});

container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const xs = (e.clientX - pointX) / scale;
  const ys = (e.clientY - pointY) / scale;
  const delta = -e.deltaY;

  if (delta > 0) {
    scale = Math.min(scale * 1.1, 2.5);
  } else {
    scale = Math.max(scale / 1.1, 0.3);
  }

  pointX = e.clientX - xs * scale;
  pointY = e.clientY - ys * scale;
  updateTransform();
});

// ==========================================
// 4. 本家HOI4風：幹・枝描画システム
// ==========================================
function isUnlocked(nf) {
  if (lockedFocuses.has(nf.id)) return false;
  if (!nf.prerequisites || nf.prerequisites.length === 0) return true;
  return nf.prerequisites.every(parentId => completedFocuses.has(parentId));
}

function renderTree() {
  const nodesContainer = document.getElementById('focus-nodes');
  const svgLines = document.getElementById('svg-lines');
  nodesContainer.innerHTML = '';
  svgLines.innerHTML = '';

  // 1. ノードを描画
  allFocuses.forEach(nf => {
    const node = document.createElement('div');
    node.className = 'focus-node';
    node.setAttribute('data-id', nf.id);

    const isCompleted = completedFocuses.has(nf.id);
    const isLocked = lockedFocuses.has(nf.id) || !isUnlocked(nf);
    const isActive = activeFocus && activeFocus.id === nf.id;

    if (isCompleted) {
      node.classList.add('completed');
    } else if (isActive) {
      node.classList.add('in-progress');
    } else if (isLocked) {
      node.classList.add('locked');
      if (lockedFocuses.has(nf.id)) node.classList.add('mutually-blocked');
    } else {
      node.classList.add('available');
    }

    node.style.left = `${nf.x}px`;
    node.style.top = `${nf.y}px`;

    const checkMarkHtml = isCompleted ? `<div class="check-mark">✔</div>` : '';
    const progressTextHtml = isActive 
      ? `<div class="focus-progress">残り ${focusDaysRemaining}日</div>` 
      : `<div class="focus-cost">${nf.cost || 70}日</div>`;

    // 日本語ローカライズがあれば優先して適用、なければJSONのタイトルやIDを表示
    const displayName = localizationMap[nf.id] || nf.title || nf.id;
    
    // アイコン画像のパス設定 & ファイル名揺れ・互換サフィックスの吸収処理
    let iconHtml = `<div class="focus-symbol">⭐</div>`;
    const rawIcon = nf.icon || nf.iconPath;
    
    if (rawIcon) {
      let fileName = rawIcon.split('/').pop().split('\\').pop();
      fileName = fileName.replace(/\.[^/.]+$/, "");
      if (fileName.startsWith('GFX_')) {
        fileName = fileName.slice(4);
      }
      
      // 互換用サフィックスを削除
      fileName = fileName.replace(/_ccp_2d_sov_compatibility$/, "");

      // ファイル名の揺れ（alt → alternative など）をここで吸収・経由
      const filenameOverrides = {
        "SOV_the_glory_of_the_red_army_alt": "SOV_the_glory_of_the_red_army_alternative"
      };
      if (filenameOverrides[fileName]) {
        fileName = filenameOverrides[fileName];
      }

      iconHtml = `<img class="focus-icon" src="/iekei1/game/data/image/goals/focus_${fileName}_result.png" alt="" onerror="this.style.display='none'">`;
    }

    node.innerHTML = `
      ${checkMarkHtml}
      ${iconHtml}
      <div class="focus-title">${displayName}</div>
      ${progressTextHtml}
    `;

    node.addEventListener('mouseenter', (e) => showTooltip(e, nf));
    node.addEventListener('mousemove', (e) => moveTooltip(e));
    node.addEventListener('mouseleave', hideTooltip);

    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isCompleted) return;
      if (isLocked) {
        setLogText(`【選択不可】前提条件を満たしていないか、反対の分岐を選択済みです。`);
        return;
      }
      startFocus(nf);
    });

    nodesContainer.appendChild(node);
  });

  // 2. 親ごとにグループ化してHOI4風の「横幹線＋下分岐」を描画
  const parentGroups = {};

  allFocuses.forEach(nf => {
    if (nf.prerequisites && Array.isArray(nf.prerequisites)) {
      nf.prerequisites.forEach(parentId => {
        if (!parentGroups[parentId]) parentGroups[parentId] = [];
        parentGroups[parentId].push(nf);
      });
    }
  });

  Object.keys(parentGroups).forEach(parentId => {
    const parent = focusMap[parentId];
    if (!parent) return;

    const children = parentGroups[parentId];
    const parentX = parent.x + 55; // ノード中央
    const parentY = parent.y + 75; // ノード底面
    const isParentDone = completedFocuses.has(parentId);

    if (children.length === 1) {
      const child = children[0];
      const childX = child.x + 55;
      const childY = child.y;

      if (parentX === childX) {
        drawDirectLine(parentX, parentY, childX, childY, svgLines, isParentDone);
      } else {
        const midY = parentY + (childY - parentY) / 2;
        drawDirectLine(parentX, parentY, parentX, midY, svgLines, isParentDone);
        drawDirectLine(parentX, midY, childX, midY, svgLines, isParentDone);
        drawDirectLine(childX, midY, childX, childY, svgLines, isParentDone);
      }
    } else {
      const childXs = children.map(c => c.x + 55);
      const minChildX = Math.min(...childXs);
      const maxChildX = Math.max(...childXs);
      const minChildY = Math.min(...children.map(c => c.y));
      
      const branchY = parentY + Math.max(20, (minChildY - parentY) / 2);

      drawDirectLine(parentX, parentY, parentX, branchY, svgLines, isParentDone);

      const mainLineLeft = Math.min(parentX, minChildX);
      const mainLineRight = Math.max(parentX, maxChildX);
      drawDirectLine(mainLineLeft, branchY, mainLineRight, branchY, svgLines, isParentDone);

      children.forEach(child => {
        const childX = child.x + 55;
        drawDirectLine(childX, branchY, childX, child.y, svgLines, isParentDone);
      });
    }
  });

  // 3. 排他選択の赤破線描画
  allFocuses.forEach(nf => {
    if (nf.mutually_exclusive) {
      const targets = Array.isArray(nf.mutually_exclusive) ? nf.mutually_exclusive : [nf.mutually_exclusive];
      targets.forEach(targetId => {
        const targetNf = focusMap[targetId];
        if (targetNf && nf.id < targetId) {
          drawExclusiveLine(nf.x + 55, nf.y + 37, targetNf.x + 55, targetNf.y + 37, svgLines);
        }
      });
    }
  });
}

function drawDirectLine(x1, y1, x2, y2, svg, isActive) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('class', isActive ? 'nf-line active' : 'nf-line');
  svg.appendChild(line);
}

function drawExclusiveLine(x1, y1, x2, y2, svg) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('class', 'nf-exclusive-line');
  svg.appendChild(line);
}

function applyFocusEffects(effectText) {
  if (!effectText) return;
  const lines = effectText.split('\n');
  lines.forEach(line => {
    const match = line.match(/([+-]?\d+(?:\.\d+)?)/);
    if (!match) return;
    const val = parseFloat(match[1]);

    if (line.includes('安定度')) gameStats.stability += val;
    else if (line.includes('戦争協力度')) gameStats.warSupport += val;
    else if (line.includes('政治力')) gameStats.politicalPower += val;
    else if (line.includes('攻撃力') || line.includes('緊張度')) gameStats.aggression += val;
  });
  updateStatusBarUI();
}

function updateStatusBarUI() {
  document.getElementById('val-stability').textContent = `${Math.min(100, Math.max(0, gameStats.stability))} / 100`;
  document.getElementById('val-war-support').textContent = `${Math.min(100, Math.max(0, gameStats.warSupport))} / 100`;
  document.getElementById('val-aggression').textContent = `${Math.min(100, Math.max(0, gameStats.aggression))} / 100`;
  document.getElementById('val-pp').textContent = `${Math.min(100, Math.max(0, gameStats.politicalPower))} / 100`;
}

const tooltip = document.getElementById('nf-tooltip');
function showTooltip(e, nf) {
  const isCompleted = completedFocuses.has(nf.id);
  const isActive = activeFocus && activeFocus.id === nf.id;
  const isLocked = lockedFocuses.has(nf.id) || !isUnlocked(nf);
  
  const titleName = localizationMap[nf.id] || nf.title || nf.id;
  let status = isCompleted ? "【達成済み】" : (isActive ? "【実行中】" : (isLocked ? "🔒【選択不可/排他】" : "🔓【選択可能】"));
  
  document.getElementById('tooltip-title').textContent = `${titleName} ${status}`;
  document.getElementById('tooltip-time').textContent = `⏱️ 必要時間: ${isActive ? focusDaysRemaining + "日 (進行中)" : (nf.cost || 70) + "日"}`;
  document.getElementById('tooltip-effect').textContent = nf.effect || "効果なし";
  
  tooltip.classList.remove('hidden');
  moveTooltip(e);
}

function moveTooltip(e) {
  tooltip.style.left = `${e.clientX + 15}px`;
  tooltip.style.top = `${e.clientY + 15}px`;
}

function hideTooltip() {
  tooltip.classList.add('hidden');
}

// ==========================================
// 5. 初期化 & ローカライズ・soviet.json 読み込み処理
// ==========================================
document.getElementById('btn-pause').addEventListener('click', () => setGameSpeed(0));
document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const speed = parseInt(e.target.getAttribute('data-speed'), 10);
    setGameSpeed(speed);
  });
});

async function init() {
  // 1. ローカライズ（複数の .yml）の読み込みを並行実行してマップにマージ
  await loadLocalisation();

  let rawData = [];

  try {
    const res = await fetch('./data/soviet.json');
    if (res.ok) {
      rawData = await res.json();
    } else {
      console.warn("soviet.jsonの読み込みに失敗しました。");
    }
  } catch (e) {
    console.error("fetchエラー:", e);
  }

  // フォールバック（データがない場合）
  if (rawData.length === 0) {
    rawData = [
      { id: "SOV_1936", title: "1936年計画", x: 4, y: 0, cost: 70, effect: "政治力 +50" },
      { id: "SOV_stalin", title: "スターリン主義", relative_position_id: "SOV_1936", offsetX: -1, offsetY: 1, cost: 70, prerequisites: ["SOV_1936"], effect: "安定度 +10" }
    ];
  }

  // 座標のピクセル換算
  const GRID_SIZE_X = 220; 
  const GRID_SIZE_Y = 130; 

  const tempMap = {};
  rawData.forEach(nf => tempMap[nf.id] = nf);

  // 相対座標・絶対座標の解決
  rawData.forEach(nf => {
    if (nf.relative_position_id && tempMap[nf.relative_position_id]) {
      const parent = tempMap[nf.relative_position_id];
      nf.x = parent.x + (nf.offsetX || 0) * GRID_SIZE_X;
      nf.y = parent.y + (nf.offsetY || 0) * GRID_SIZE_Y;
    } else {
      nf.x = (nf.offsetX !== undefined ? nf.offsetX : (nf.x || 4)) * GRID_SIZE_X;
      nf.y = (nf.offsetY !== undefined ? nf.offsetY : (nf.y || 0)) * GRID_SIZE_Y;
    }
  });

  allFocuses = rawData;
  allFocuses.forEach(nf => focusMap[nf.id] = nf);

  updateCalendarUI();
  updateStatusBarUI();
  renderTree();
}

init();