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

function updateCalendarUI() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const d = currentDate.getDate();
  document.getElementById('calendar-display').textContent = `${y}年${m}月${d}日`;
}

function tickDay() {
  currentDate.setDate(currentDate.getDate() + 1);
  updateCalendarUI();

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
  if (activeFocus) {
    setLogText(`【変更】国家方針を「${nf.title}」に変更しました。`);
  } else {
    setLogText(`【国家方針開始】「${nf.title}」の実行を開始。（必要日数: ${nf.cost || 70}日）`);
  }

  activeFocus = nf;
  focusDaysRemaining = nf.cost || 70;
  renderTree();
}

function completeActiveFocus() {
  const completedNf = activeFocus;
  completedFocuses.add(completedNf.id);

  // 相互排他（片方を選択したらもう片方をロックする処理）
  if (completedNf.mutually_exclusive) {
    const targets = Array.isArray(completedNf.mutually_exclusive) 
      ? completedNf.mutually_exclusive 
      : [completedNf.mutually_exclusive];
    targets.forEach(id => lockedFocuses.add(id));
  }

  applyFocusEffects(completedNf.effect);

  const effectClean = completedNf.effect ? completedNf.effect.replace(/\n/g, ' / ') : '特記事項なし';
  setLogText(`🎉【国家方針完了】「${completedNf.title}」を達成！ 報酬: [ ${effectClean} ]`);

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
// 4. HOI4風 枝分かれ描画 & 排他分岐レンダリング
// ==========================================
function isUnlocked(nf) {
  if (lockedFocuses.has(nf.id)) return false;
  if (!nf.prerequisites || nf.prerequisites.length === 0) return true;
  // 前提NFのいずれか、または全て達成しているか確認
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

    node.innerHTML = `
      ${checkMarkHtml}
      <div class="focus-symbol">⭐</div>
      <div class="focus-title">${nf.title}</div>
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

  // 2. HOI4本家風：1つの親から分岐する「木の枝」配線を描画
  const parentGroups = {};

  allFocuses.forEach(nf => {
    if (nf.prerequisites && Array.isArray(nf.prerequisites)) {
      nf.prerequisites.forEach(parentId => {
        if (!parentGroups[parentId]) parentGroups[parentId] = [];
        parentGroups[parentId].push(nf);
      });
    }
  });

  // 各親ノードからの分岐を一括処理
  Object.keys(parentGroups).forEach(parentId => {
    const parent = focusMap[parentId];
    if (!parent) return;

    const children = parentGroups[parentId];
    const parentX = parent.x + 55; // カードの中央
    const parentY = parent.y + 75; // カードの底部
    const isParentDone = completedFocuses.has(parentId);

    if (children.length === 1) {
      // 1対1の直角接続
      const child = children[0];
      drawOrthogonalLine(parentX, parentY, child.x + 55, child.y, svgLines, isParentDone);
    } else {
      // 1対多の「T字・木の枝」配線
      const childMinX = Math.min(...children.map(c => c.x + 55));
      const childMaxX = Math.max(...children.map(c => c.x + 55));
      const minChildY = Math.min(...children.map(c => c.y));
      const branchY = parentY + (minChildY - parentY) / 2; // 中間高さ

      // ① 親からの垂直なメイン幹
      drawDirectLine(parentX, parentY, parentX, branchY, svgLines, isParentDone);

      // ② 左右へ広がる水平な枝
      const hMinX = Math.min(parentX, childMinX);
      const hMaxX = Math.max(parentX, childMaxX);
      drawDirectLine(hMinX, branchY, hMaxX, branchY, svgLines, isParentDone);

      // ③ 水平枝から各子ノードへの垂直線
      children.forEach(child => {
        const childX = child.x + 55;
        drawDirectLine(childX, branchY, childX, child.y, svgLines, isParentDone);
      });
    }
  });

  // 3. 相互排他マーク（赤破線＆両矢印）の描画
  allFocuses.forEach(nf => {
    if (nf.mutually_exclusive) {
      const targets = Array.isArray(nf.mutually_exclusive) ? nf.mutually_exclusive : [nf.mutually_exclusive];
      targets.forEach(targetId => {
        const targetNf = focusMap[targetId];
        if (targetNf && nf.id < targetId) { // 重複描画防止
          drawExclusiveLine(nf.x + 55, nf.y + 37, targetNf.x + 55, targetNf.y + 37, svgLines);
        }
      });
    }
  });
}

// 直線描画ヘルパー
function drawDirectLine(x1, y1, x2, y2, svg, isActive) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('class', isActive ? 'nf-line active' : 'nf-line');
  svg.appendChild(line);
}

// クランク型直角線描画
function drawOrthogonalLine(x1, y1, x2, y2, svg, isActive) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const midY = y1 + (y2 - y1) / 2;
  const d = (x1 === x2)
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

  path.setAttribute('d', d);
  path.setAttribute('class', isActive ? 'nf-line active' : 'nf-line');
  svg.appendChild(path);
}

// 排他接続線（赤い点線）
function drawExclusiveLine(x1, y1, x2, y2, svg) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  line.setAttribute('class', 'nf-exclusive-line');
  svg.appendChild(line);
}

// ステータス効果適用
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

// ツールチップ表示
const tooltip = document.getElementById('nf-tooltip');
function showTooltip(e, nf) {
  const isCompleted = completedFocuses.has(nf.id);
  const isActive = activeFocus && activeFocus.id === nf.id;
  const isLocked = lockedFocuses.has(nf.id) || !isUnlocked(nf);
  
  let status = isCompleted ? "【達成済み】" : (isActive ? "【実行中】" : (isLocked ? "🔒【選択不可/排他】" : "🔓【選択可能】"));
  document.getElementById('tooltip-title').textContent = `${nf.title} ${status}`;
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
// 5. 初期化 & バッチファイルの複数読み込み処理
// ==========================================
document.getElementById('btn-pause').addEventListener('click', () => setGameSpeed(0));
document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const speed = parseInt(e.target.getAttribute('data-speed'), 10);
    setGameSpeed(speed);
  });
});

// 今後 batch2 や batch3 を追加する場合はこの配列に追加します
const batchFiles = [
  './data/nf_batch1.json',
  './data/nf_batch2.json' // トロツキー版などを追加可能（存在しなくても自動スキップ）
];

async function loadAllBatches() {
  let loadedData = [];
  for (const path of batchFiles) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const json = await res.json();
        loadedData = loadedData.concat(json);
        console.log(`[Loaded] ${path}`);
      }
    } catch (e) {
      // ファイルが存在しない場合はスルー
    }
  }
  return loadedData;
}

async function init() {
  const data = await loadAllBatches();
  
  if (data.length > 0) {
    allFocuses = data;
  } else {
    // データがない場合のフォールバック（動作テスト用）
    allFocuses = [
      { id: "SOV_center", title: "党中央の再編", x: 600, y: 50, cost: 70, effect: "政治力 +50" },
      { id: "SOV_stalin", title: "スターリン派の強固化", x: 400, y: 180, cost: 70, prerequisites: ["SOV_center"], mutually_exclusive: ["SOV_trotsky"], effect: "安定度 +10" },
      { id: "SOV_trotsky", title: "トロツキーの帰還", x: 800, y: 180, cost: 70, prerequisites: ["SOV_center"], mutually_exclusive: ["SOV_stalin"], effect: "戦争協力度 +15" }
    ];
  }
  
  allFocuses.forEach(nf => focusMap[nf.id] = nf);
  updateCalendarUI();
  updateStatusBarUI();
  renderTree();
}

init();
