// パス自動試行リスト
const batchFiles = [
  './data/nf_batch1.json',
  '../data/nf_batch1.json',
  'data/nf_batch1.json'
];

let allFocuses = [];
const focusMap = {};
const completedFocuses = new Set(); // 達成済みNFのIDを管理

// 現在のパラメータ状態 (初期値)
const gameStats = {
  stability: 85,
  warSupport: 60,
  aggression: 42,
  politicalPower: 120
};

// カテゴリ別グラフィックアイコン
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

// ステータスバー表示の更新
function updateStatusBarUI() {
  document.getElementById('val-stability').textContent = `${Math.min(100, Math.max(0, gameStats.stability))} / 100`;
  document.getElementById('val-war-support').textContent = `${Math.min(100, Math.max(0, gameStats.warSupport))} / 100`;
  document.getElementById('val-aggression').textContent = `${Math.min(100, Math.max(0, gameStats.aggression))} / 100`;
  document.getElementById('val-pp').textContent = `${Math.min(100, Math.max(0, gameStats.politicalPower))} / 100`;
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
    updateStatusBarUI();
  } catch (error) {
    nodesContainer.innerHTML = `
      <div style="color: #ff6b6b; padding: 20px; background: rgba(0,0,0,0.8); border: 2px solid red; margin: 20px;">
        ⚠️ 読み込みエラー:<br>${error.message}
      </div>`;
  }
}

// 4. 前提条件（prerequisites）の達成判定
function isUnlocked(nf) {
  // 親の条件が指定されていないルート要素は最初から開放
  if (!nf.prerequisites || nf.prerequisites.length === 0) {
    return true;
  }
  // prerequisite内のIDがすべてcompletedFocusesに含まれているかチェック
  return nf.prerequisites.every(parentId => completedFocuses.has(parentId));
}

// 5. NFテキストから効果を自動解析・適用
function applyFocusEffects(effectText) {
  if (!effectText) return;

  const lines = effectText.split('\n');
  lines.forEach(line => {
    const match = line.match(/([+-]?\d+(?:\.\d+)?)/);
    if (!match) return;
    
    const val = parseFloat(match[1]);

    if (line.includes('安定度')) {
      gameStats.stability += val;
    } else if (line.includes('戦争協力度')) {
      gameStats.warSupport += val;
    } else if (line.includes('政治力')) {
      gameStats.politicalPower += val;
    } else if (line.includes('緊張度') || line.includes('警戒度') || line.includes('攻撃力')) {
      gameStats.aggression += val;
    }
  });

  updateStatusBarUI();
}

// 6. ツリー＆直角線を描画
function renderTree() {
  const nodesContainer = document.getElementById('focus-nodes');
  const svgLines = document.getElementById('svg-lines');
  nodesContainer.innerHTML = '';
  svgLines.innerHTML = '';

  // ノード作成
  allFocuses.forEach(nf => {
    const node = document.createElement('div');
    node.className = 'focus-node';

    const unlocked = isUnlocked(nf);
    const completed = completedFocuses.has(nf.id);

    // クラスの付与
    if (completed) {
      node.classList.add('completed');
    } else if (!unlocked) {
      node.classList.add('locked');
    } else {
      node.classList.add('available');
    }

    node.style.left = `${nf.x}px`;
    node.style.top = `${nf.y}px`;

    const key = Object.keys(categoryIcons).find(k => nf.id.toUpperCase().includes(k)) || 'DEFAULT';
    const symbol = categoryIcons[key];

    node.innerHTML = `
      <div class="focus-symbol">${symbol}</div>
      <div class="focus-title">${nf.title}</div>
    `;

    // イベントリスナー
    node.addEventListener('mouseenter', (e) => showTooltip(e, nf));
    node.addEventListener('mousemove', (e) => moveTooltip(e));
    node.addEventListener('mouseleave', hideTooltip);

    // クリック達成処理
    node.addEventListener('click', () => {
      if (completedFocuses.has(nf.id)) return; // 既に達成済み

      if (!isUnlocked(nf)) {
        // ロック中の警告ログ表示
        const target = document.getElementById("typewriter-text");
        target.textContent = `【実行不可】前提となる国家方針が未達成です。`;
        return;
      }

      completedFocuses.add(nf.id);
      
      // 効果適用
      applyFocusEffects(nf.effect);

      // タイプライターログを更新
      const target = document.getElementById("typewriter-text");
      target.textContent = `【国家方針達成】${nf.title} を完了しました！`;

      // ロック状態・接続線を全再描画
      renderTree();
    });

    nodesContainer.appendChild(node);
  });

  // 接続線を描画
  allFocuses.forEach(nf => {
    if (nf.prerequisites && nf.prerequisites.length > 0) {
      nf.prerequisites.forEach(parentId => {
        const parent = focusMap[parentId];
        if (parent) {
          const parentCompleted = completedFocuses.has(parentId);
          drawOrthogonalLine(
            parent.x + 55, parent.y + 75,
            nf.x + 55, nf.y,
            svgLines,
            parentCompleted
          );
        }
      });
    }
  });
}

// HOI4風 直角パス描画
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

// ツールチップ処理
const tooltip = document.getElementById('nf-tooltip');

function showTooltip(e, nf) {
  let statusText = "";
  if (completedFocuses.has(nf.id)) {
    statusText = " 【達成済み】";
  } else if (!isUnlocked(nf)) {
    statusText = " 🔒【ロック中】";
  } else {
    statusText = " 🔓【選択可能】";
  }

  document.getElementById('tooltip-title').textContent = nf.title + statusText;
  document.getElementById('tooltip-time').textContent = `⏱️ 達成期間: ${nf.cost || 70} 日`;
  
  let effectMsg = nf.effect || "効果なし";
  if (!isUnlocked(nf)) {
    const missingParents = nf.prerequisites
      .filter(id => !completedFocuses.has(id))
      .map(id => focusMap[id] ? focusMap[id].title : id);
    effectMsg += `\n\n⚠️ 必要条件:\n・${missingParents.join('\n・')}`;
  }

  document.getElementById('tooltip-effect').textContent = effectMsg;
  
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
