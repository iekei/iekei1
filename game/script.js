// パス自動試行リスト
const batchFiles = [
  './data/nf_batch1.json',
  '../data/nf_batch1.json',
  'data/nf_batch1.json'
];

let allFocuses = [];
const focusMap = {};

// カテゴリ別グラフィックアイコン（視覚的シンボル）
const categoryIcons = {
  IND: "🏭", AGR: "🌾", INF: "🛤️", MIL: "🎖️",
  PURGE: "⚔️", CENTER: "🚩", NKVD: "🕵️", CULT: "🏛️",
  ARMY: "🪖", TANK: "⚙️", AIR: "✈️", NAVY: "⚓",
  DIP: "📜", WAR: "🔴", DEFAULT: "⭐"
};

// タイプライター用ログデータ
const typewriterLogs = [
  "第3次5ヵ年計画が進行中...",
  "モスクワにて秘密警察のパトロールが強化されました。",
  "ウラル山脈東部での新工場の建設が承認されました。",
  "赤軍の装備近代化プロセスが開始されました。",
  "国境付近の緊迫度が高まっています..."
];

let logIndex = 0;
let charIndex = 0;

// 1. タイプライターアニメーション
function typeWriter() {
  const target = document.getElementById("typewriter-text");
  const currentLog = typewriterLogs[logIndex];

  if (charIndex < currentLog.length) {
    target.textContent += currentLog.charAt(charIndex);
    charIndex++;
    setTimeout(typeWriter, 80);
  } else {
    setTimeout(() => {
      target.textContent = "";
      charIndex = 0;
      logIndex = (logIndex + 1) % typewriterLogs.length;
      typeWriter();
    }, 3000);
  }
}

// 2. パスフォールバック付きデータ取得
async function fetchWithFallback(paths) {
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  throw new Error(`ファイルが見つかりません:\n${paths.join('\n')}`);
}

// 3. データ読み込みと構築
async function loadAllFocusTrees() {
  const nodesContainer = document.getElementById('focus-nodes');
  
  try {
    allFocuses = await fetchWithFallback(batchFiles);
    allFocuses.forEach(nf => focusMap[nf.id] = nf);
    renderTree();
  } catch (error) {
    nodesContainer.innerHTML = `
      <div style="color: #ff6b6b; padding: 20px; background: rgba(0,0,0,0.8); border: 2px solid red; margin: 20px;">
        ⚠️ 読み込みエラー:<br>${error.message}
      </div>`;
  }
}

// 4. ツリー＆直角線を描画
function renderTree() {
  const nodesContainer = document.getElementById('focus-nodes');
  const svgLines = document.getElementById('svg-lines');
  nodesContainer.innerHTML = '';
  svgLines.innerHTML = '';

  // ノード作成
  allFocuses.forEach(nf => {
    const node = document.createElement('div');
    node.className = 'focus-node';
    node.style.left = `${nf.x}px`;
    node.style.top = `${nf.y}px`;

    // 視覚的アイコン判定
    const key = Object.keys(categoryIcons).find(k => nf.id.toUpperCase().includes(k)) || 'DEFAULT';
    const symbol = categoryIcons[key];

    node.innerHTML = `
      <div class="focus-symbol">${symbol}</div>
      <div class="focus-title">${nf.title}</div>
    `;

    // ホバー時ツールチップイベント
    node.addEventListener('mouseenter', (e) => showTooltip(e, nf));
    node.addEventListener('mousemove', (e) => moveTooltip(e));
    node.addEventListener('mouseleave', hideTooltip);

    nodesContainer.appendChild(node);
  });

  // 直角（ツリー状）の接続線を描画
  allFocuses.forEach(nf => {
    if (nf.prerequisites && nf.prerequisites.length > 0) {
      nf.prerequisites.forEach(parentId => {
        const parent = focusMap[parentId];
        if (parent) {
          drawOrthogonalLine(
            parent.x + 55, parent.y + 75,
            nf.x + 55, nf.y,
            svgLines
          );
        }
      });
    }
  });
}

// HOI4風 直角（ツリー型）パス描画
function drawOrthogonalLine(x1, y1, x2, y2, svg) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const midY = y1 + (y2 - y1) / 2;
  
  // Straight line or Step line
  const d = (x1 === x2)
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

  path.setAttribute('d', d);
  path.setAttribute('class', 'nf-line');
  svg.appendChild(path);
}

// ツールチップ処理
const tooltip = document.getElementById('nf-tooltip');

function showTooltip(e, nf) {
  document.getElementById('tooltip-title').textContent = nf.title;
  document.getElementById('tooltip-time').textContent = `⏱️ 達成期間: ${nf.cost || 70} 日`;
  document.getElementById('tooltip-effect').textContent = nf.effect || "・政治力: +150\n・国家の安定度: +5\n・研究速度: +5.0%";
  
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

// 初期化実行
typeWriter();
loadAllFocusTrees();
