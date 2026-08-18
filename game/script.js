// ==========================================
// 1. ゲーム内時間 & 速度管理システム
// ==========================================
let currentDate = new Date(1936, 0, 1); // 1936年1月1日スタート
let gameSpeed = 0; // 0: 停止, 1~5: 各スピード
let gameTimer = null;

// スピードごとの更新間隔(ミリ秒)
const speedIntervals = {
  1: 2000,
  2: 1200,
  3: 700,
  4: 350,
  5: 120
};

// ゲームステータス
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

let activeFocus = null;      // 現在選択して進行中のNFオブジェクト
let focusDaysRemaining = 0;  // 選択中NFの残り日数

// 日付表示の更新
function updateCalendarUI() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;
  const d = currentDate.getDate();
  document.getElementById('calendar-display').textContent = `${y}年${m}月${d}日`;
}

// 時間を進めるメインループ (1日経過)
function tickDay() {
  currentDate.setDate(currentDate.getDate() + 1);
  updateCalendarUI();

  // NFの進行処理
  if (activeFocus) {
    focusDaysRemaining--;

    // 進行状況（残り日数）の画面リアルタイム反映
    const activeNodeEl = document.querySelector(`.focus-node[data-id="${activeFocus.id}"]`);
    if (activeNodeEl) {
      const progressEl = activeNodeEl.querySelector('.focus-progress');
      if (progressEl) {
        progressEl.textContent = `残り ${focusDaysRemaining}日`;
      }
    }

    // NF達成時の処理
    if (focusDaysRemaining <= 0) {
      completeActiveFocus();
    }
  }
}

// 速度変更
function setGameSpeed(speed) {
  gameSpeed = speed;
  if (gameTimer) clearInterval(gameTimer);

  // UIアクティブ状態の切替
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
// 2. NF進行 & 報酬適用
// ==========================================
function startFocus(nf) {
  if (activeFocus) {
    setLogText(`【変更】国家方針を「${nf.title}」に変更しました。`);
  } else {
    setLogText(`【国家方針開始】「${nf.title}」の実行を開始しました。（必要日数: ${nf.cost || 70}日）`);
  }

  activeFocus = nf;
  focusDaysRemaining = nf.cost || 70;
  renderTree();
}

function completeActiveFocus() {
  const completedNf = activeFocus;
  completedFocuses.add(completedNf.id);

  // 相互排他処理の適用
  if (completedNf.mutually_exclusive) {
    const targets = Array.isArray(completedNf.mutually_exclusive) 
      ? completedNf.mutually_exclusive 
      : [completedNf.mutually_exclusive];
    targets.forEach(id => lockedFocuses.add(id));
  }

  // 報酬の自動適用
  applyFocusEffects(completedNf.effect);

  // ログに報酬と達成を表示
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
  if (e.target.closest('.focus-node')) return; // ノードのクリックを優先
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

// マウスホイールでの拡大・縮小
container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const xs = (e.clientX - pointX) / scale;
  const ys = (e.clientY - pointY) / scale;
  const delta = -e.deltaY;

  if (delta > 0) {
    scale = Math.min(scale * 1.1, 2.5); // 最大 2.5倍
  } else {
    scale = Math.max(scale / 1.1, 0.3); // 最小 0.3倍
  }

  pointX = e.clientX - xs * scale;
  pointY = e.clientY - ys * scale;
  updateTransform();
});

// ==========================================
// 4. ツリー描画処理 & 安全対策
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

  // 1. ノードの描画
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

    // チェックマーク表示と時間テキストの切り替え
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

    // ツールチップイベント
    node.addEventListener('mouseenter', (e) => showTooltip(e, nf));
    node.addEventListener('mousemove', (e) => moveTooltip(e));
    node.addEventListener('mouseleave', hideTooltip);

    // クリック（国家方針選択）
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isCompleted) return;
      if (isLocked) {
        setLogText(`【不可】この国家方針は現在選択できません。前提条件または排他選択を確認してください。`);
        return;
      }
      startFocus(nf);
    });

    nodesContainer.appendChild(node);
  });

  // 2. 接続線の描画（右側などの線が途切れないよう安全ガードを実装）
  allFocuses.forEach(nf => {
    if (nf.prerequisites && Array.isArray(nf.prerequisites)) {
      nf.prerequisites.forEach(parentId => {
        const parent = focusMap[parentId];
        if (parent) {
          drawOrthogonalLine(
            parent.x + 55, parent.y + 75, // 親の下中央
            nf.x + 55, nf.y,               // 子の上中央
            svgLines,
            completedFocuses.has(parentId)
          );
        } else {
          console.warn(`[NF Line Warning] ノード "${nf.id}" (${nf.title}) の親ID "${parentId}" が見つかりません。JSONデータを確認してください。`);
        }
      });
    }

    // 排他線（赤破線）の描画
    if (nf.mutually_exclusive) {
      const targets = Array.isArray(nf.mutually_exclusive) ? nf.mutually_exclusive : [nf.mutually_exclusive];
      targets.forEach(targetId => {
        const targetNf = focusMap[targetId];
        if (targetNf && nf.id < targetId) { // 二重描画防止
          drawExclusiveLine(nf.x + 55, nf.y + 37, targetNf.x + 55, targetNf.y + 37, svgLines);
        }
      });
    }
  });
}

// HOI4風 直角線の描画
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

// 相互排他線（赤破線）の描画
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

// ツールチップ関数
const tooltip = document.getElementById('nf-tooltip');
function showTooltip(e, nf) {
  const isCompleted = completedFocuses.has(nf.id);
  const isActive = activeFocus && activeFocus.id === nf.id;
  const isLocked = lockedFocuses.has(nf.id) || !isUnlocked(nf);
  
  let status = isCompleted ? "【達成済み】" : (isActive ? "【実行中】" : (isLocked ? "🔒【選択不可】" : "🔓【選択可能】"));
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
// 5. 初期化 & イベントバインド
// ==========================================
document.getElementById('btn-pause').addEventListener('click', () => setGameSpeed(0));
document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const speed = parseInt(e.target.getAttribute('data-speed'), 10);
    setGameSpeed(speed);
  });
});

// パス試行リスト（データロード）
const batchFiles = [
  './data/nf_batch1.json',
  '../data/nf_batch1.json',
  'data/nf_batch1.json'
];

async function fetchWithFallback(paths) {
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  throw new Error(`JSONファイルが見つかりません:\n${paths.join('\n')}`);
}

async function init() {
  try {
    allFocuses = await fetchWithFallback(batchFiles);
  } catch (e) {
    console.error(e.message);
    // 取得失敗時のデモフォールバックデータ
    allFocuses = [
      { id: "NF_1", title: "産業基盤の強化", x: 300, y: 50, cost: 30, effect: "政治力 +20\n安定度 +5" },
      { id: "NF_2", title: "軍需工場の拡張", x: 200, y: 180, cost: 45, prerequisites: ["NF_1"], mutually_exclusive: ["NF_3"], effect: "戦争協力度 +10" },
      { id: "NF_3", title: "民需工場の建設", x: 400, y: 180, cost: 40, prerequisites: ["NF_1"], mutually_exclusive: ["NF_2"], effect: "安定度 +10" }
    ];
  }
  
  allFocuses.forEach(nf => focusMap[nf.id] = nf);
  updateCalendarUI();
  updateStatusBarUI();
  renderTree();
}

init();
