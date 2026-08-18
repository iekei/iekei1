// =========================================================
// 1. ソ連国家方針（NF）データ定義
// =========================================================
const WIKI_BASE = 'https://hoi4.paradoxwikis.com/images';

const focusTreeData = [
  // --- 政治・大粛清ライン ---
  {
    id: 'stalinism',
    title: 'スターリン主義の確立',
    x: 650, y: 60, days: 70,
    icon: `${WIKI_BASE}/3/33/Focus_SOV_inheritor_of_the_mantle_of_lenin.png`,
    prereq: [],
    effect: '政治力 +120, 安定度 +5%'
  },
  {
    id: 'great_purge',
    title: '大粛清',
    x: 650, y: 200, days: 70,
    icon: `${WIKI_BASE}/b/bc/Focus_SOV_behead_the_snake.png`,
    prereq: ['stalinism'],
    effect: '陸軍組織率低下, 政治的安定度確保'
  },
  {
    id: 'nkvd_primacy',
    title: 'NKVDの主導権確保',
    x: 520, y: 340, days: 70,
    icon: `${WIKI_BASE}/f/fa/Focus_SOV_nkvd_divisions.png`,
    prereq: ['great_purge'],
    effect: '国内スパイ検知率 +20%'
  },
  {
    id: 'cult_of_personality',
    title: '個人崇拝の強化',
    x: 780, y: 340, days: 70,
    icon: `${WIKI_BASE}/7/71/Focus_SOV_the_glory_of_the_red_army.png`,
    prereq: ['great_purge'],
    effect: '戦争協力度 +10%'
  },

  // --- 産業・五ヶ年計画ライン ---
  {
    id: 'five_year_plan',
    title: '第3次五ヶ年計画',
    x: 200, y: 60, days: 70,
    icon: `${WIKI_BASE}/0/00/Focus_SOV_third_five_year_plan.png`,
    prereq: [],
    effect: '民需工場 +2, 工場出力 +5%'
  },
  {
    id: 'industrial_expansion',
    title: 'ウラル重工業拠点',
    x: 100, y: 200, days: 70,
    icon: `${WIKI_BASE}/9/9f/Focus_SOV_develop_the_urals.png`,
    prereq: ['five_year_plan'],
    effect: '民需工場 +3'
  },
  {
    id: 'collectivization',
    title: '集団農場の近代化',
    x: 300, y: 200, days: 70,
    icon: `${WIKI_BASE}/0/04/Focus_SOV_collectivization_process.png`,
    prereq: ['five_year_plan'],
    effect: '適齢男性人口 +2%'
  },
  {
    id: 'magnitogorsk_combine',
    title: 'マグニトゴルスク',
    x: 100, y: 340, days: 70,
    icon: `${WIKI_BASE}/e/e1/Focus_SOV_found_the_cheryabinsk_tractor_plant.png`,
    prereq: ['industrial_expansion'],
    effect: '軍需工場 +2'
  },
  {
    id: 'siberian_development',
    title: 'シベリア開発',
    x: 300, y: 340, days: 70,
    icon: `${WIKI_BASE}/c/c4/Focus_SOV_trans_siberian_railway.png`,
    prereq: ['collectivization'],
    effect: 'インフラ整備 +10%'
  },
  {
    id: 'industry_relocation',
    title: '工場疎開計画',
    x: 200, y: 480, days: 70,
    icon: `${WIKI_BASE}/6/6e/Focus_SOV_move_industry_to_the_urals.png`,
    prereq: ['magnitogorsk_combine', 'siberian_development'],
    effect: 'ウラル以東への工場移転コスト軽減'
  },

  // --- 軍事・陸軍再編ライン ---
  {
    id: 'reorganize_red_army',
    title: '赤軍の近代化',
    x: 420, y: 480, days: 70,
    icon: `${WIKI_BASE}/7/7a/Focus_SOV_reorganize_the_red_army.png`,
    prereq: ['nkvd_primacy'],
    effect: '陸軍経験値 +50'
  },
  {
    id: 'tank_doctrine',
    title: '縦深戦術の確立',
    x: 320, y: 620, days: 70,
    icon: `${WIKI_BASE}/2/24/Focus_SOV_gosplan.png`,
    prereq: ['reorganize_red_army'],
    effect: '装甲師団速度 +10%'
  },
  {
    id: 'lessons_of_war',
    title: '戦争の教訓',
    x: 520, y: 620, days: 70,
    icon: `${WIKI_BASE}/a/a8/Focus_SOV_lessons_of_war.png`,
    prereq: ['reorganize_red_army'],
    effect: '大粛清ペナルティの解除'
  },
  {
    id: 't34_development',
    title: 'T-34中戦車開発',
    x: 320, y: 760, days: 70,
    icon: `${WIKI_BASE}/e/eb/Focus_SOV_t34.png`,
    prereq: ['tank_doctrine'],
    effect: '中戦車研究ボーナス +100%'
  },
  {
    id: 'supreme_command',
    title: 'スタフカ設立',
    x: 520, y: 760, days: 70,
    icon: `${WIKI_BASE}/a/a2/Focus_SOV_stavka.png`,
    prereq: ['lessons_of_war'],
    effect: '最高司令官補正強化'
  },

  // --- 外交・対外政策ライン ---
  {
    id: 'foreign_policy',
    title: 'コミンテルンの主導',
    x: 1100, y: 60, days: 70,
    icon: `${WIKI_BASE}/f/f9/Focus_SOV_comintern.png`,
    prereq: [],
    effect: '陣営影響力強化'
  },
  {
    id: 'anti_fascist_pact',
    title: '反ファシズム統一戦線',
    x: 980, y: 200, days: 70,
    icon: `${WIKI_BASE}/0/0e/Focus_SOV_anti_fascist_diplomacy.png`,
    prereq: ['foreign_policy'],
    effect: '民主主義国家との関係改善'
  },
  {
    id: 'claims_on_baltics',
    title: 'バルト諸国への請求',
    x: 1220, y: 200, days: 70,
    icon: `${WIKI_BASE}/0/0a/Focus_SOV_ultimatum_to_the_baltic_states.png`,
    prereq: ['foreign_policy'],
    effect: 'バルト諸国への領土主張'
  },
  {
    id: 'molotov_ribbentrop',
    title: '独ソ不可侵条約',
    x: 1100, y: 340, days: 70,
    icon: `${WIKI_BASE}/d/d2/Focus_SOV_molotov_ribbentrop_pact.png`,
    prereq: ['anti_fascist_pact', 'claims_on_baltics'],
    effect: 'ドイツとの不可侵条約締結'
  },
  {
    id: 'claim_finland',
    title: 'カレリア要求',
    x: 980, y: 480, days: 70,
    icon: `${WIKI_BASE}/0/00/Focus_SOV_claims_on_finland.png`,
    prereq: ['molotov_ribbentrop'],
    effect: 'フィンランドへの圧力'
  },
  {
    id: 'great_patriotic_war',
    title: '大祖国戦争',
    x: 1100, y: 620, days: 70,
    icon: `${WIKI_BASE}/c/c8/Focus_SOV_the_great_patriotic_war.png`,
    prereq: ['molotov_ribbentrop'],
    effect: '防衛戦争ボーナス大幅付与'
  }
];

// =========================================================
// 2. ゲーム状態管理（時間 & NF進行度）
// =========================================================
let gameState = {
  date: new Date(1936, 0, 1),
  speed: 0, // 0: 停止, 1〜5: 速度レベル
  currentFocus: null,
  focusProgress: 0,
  completedFocuses: new Set(),
  stats: { stability: 85, warSupport: 60, aggression: 42, pp: 120 }
};

const SPEED_INTERVALS = { 0: null, 1: 1000, 2: 500, 3: 250, 4: 100, 5: 40 };
let timerId = null;

// =========================================================
// 3. UI ＆ タイプライター演出
// =========================================================
function updateCalendarDisplay() {
  const y = gameState.date.getFullYear();
  const m = gameState.date.getMonth() + 1;
  const d = gameState.date.getDate();
  document.getElementById('calendar-display').textContent = `${y}年${m}月${d}日`;
}

function typeLog(text) {
  const el = document.getElementById('typewriter-text');
  el.textContent = '';
  let i = 0;
  const interval = setInterval(() => {
    if (i < text.length) {
      el.textContent += text.charAt(i);
      i++;
    } else {
      clearInterval(interval);
    }
  }, 30);
}

// 時間進行メインループ
function tick() {
  // 1日進める
  gameState.date.setDate(gameState.date.getDate() + 1);
  updateCalendarDisplay();

  // 進行中の国家方針があれば進める
  if (gameState.currentFocus) {
    gameState.focusProgress++;
    const nodeData = focusTreeData.find(f => f.id === gameState.currentFocus);
    
    // 進捗バー更新
    const fillEl = document.querySelector(`#node-${nodeData.id} .progress-bar-fill`);
    if (fillEl) {
      const pct = (gameState.focusProgress / nodeData.days) * 100;
      fillEl.style.width = `${pct}%`;
    }

    // 完了判定
    if (gameState.focusProgress >= nodeData.days) {
      gameState.completedFocuses.add(nodeData.id);
      typeLog(`国家方針【${nodeData.title}】を完了しました！`);
      gameState.currentFocus = null;
      gameState.focusProgress = 0;
      updateNodesState();
      drawConnections();
    }
  }
}

function setSpeed(speed) {
  gameState.speed = speed;
  if (timerId) clearInterval(timerId);

  // ボタンアクティブ表示切替
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  if (speed === 0) {
    document.getElementById('btn-pause').classList.add('active');
  } else {
    const btn = document.querySelector(`.speed-btn[data-speed="${speed}"]`);
    if (btn) btn.classList.add('active');
    timerId = setInterval(tick, SPEED_INTERVALS[speed]);
  }
}

// =========================================================
// 4. ツリーレンダリング ＆ ライン自動描画
// =========================================================
function renderTree() {
  const container = document.getElementById('focus-nodes');
  container.innerHTML = '';

  focusTreeData.forEach(focus => {
    const node = document.createElement('div');
    node.id = `node-${focus.id}`;
    node.className = 'focus-node';
    node.style.left = `${focus.x}px`;
    node.style.top = `${focus.y}px`;

    node.innerHTML = `
      <img src="${focus.icon}" alt="${focus.title}" onerror="this.src='https://hoi4.paradoxwikis.com/images/8/87/Goal_unknown.png'">
      <div class="node-title">${focus.title}</div>
      <div class="progress-bar-container"><div class="progress-bar-fill"></div></div>
    `;

    // クリックイベント (選択)
    node.addEventListener('click', () => selectFocus(focus.id));

    // ツールチップ表示
    node.addEventListener('mouseenter', (e) => showTooltip(e, focus));
    node.addEventListener('mouseleave', hideTooltip);

    container.appendChild(node);
  });

  updateNodesState();
  drawConnections();
}

function updateNodesState() {
  focusTreeData.forEach(focus => {
    const node = document.getElementById(`node-${focus.id}`);
    const isCompleted = gameState.completedFocuses.has(focus.id);
    const isInProgress = gameState.currentFocus === focus.id;
    const prereqMet = focus.prereq.every(reqId => gameState.completedFocuses.has(reqId));

    node.classList.remove('locked', 'in-progress', 'completed');

    if (isCompleted) {
      node.classList.add('completed');
    } else if (isInProgress) {
      node.classList.add('in-progress');
    } else if (!prereqMet) {
      node.classList.add('locked');
    }
  });
}

function selectFocus(id) {
  const focus = focusTreeData.find(f => f.id === id);
  if (gameState.completedFocuses.has(id)) return;
  
  const prereqMet = focus.prereq.every(reqId => gameState.completedFocuses.has(reqId));
  if (!prereqMet) {
    typeLog(`前提条件が満たされていないため【${focus.title}】を選択できません。`);
    return;
  }

  if (gameState.currentFocus === id) return;

  // 前の進行度リセット
  if (gameState.currentFocus) {
    const prevFill = document.querySelector(`#node-${gameState.currentFocus} .progress-bar-fill`);
    if (prevFill) prevFill.style.width = '0%';
  }

  gameState.currentFocus = id;
  gameState.focusProgress = 0;
  typeLog(`国家方針【${focus.title}】の着手を開始しました（必要日数: ${focus.days}日）`);
  updateNodesState();
}

// 直角接続ラインの描画
function drawConnections() {
  const svg = document.getElementById('svg-lines');
  svg.innerHTML = '';

  const NODE_WIDTH = 160;
  const NODE_HEIGHT = 80;

  focusTreeData.forEach(focus => {
    if (!focus.prereq || focus.prereq.length === 0) return;

    focus.prereq.forEach(reqId => {
      const parent = focusTreeData.find(f => f.id === reqId);
      if (!parent) return;

      const parentCompleted = gameState.completedFocuses.has(parent.id);
      const childCompleted = gameState.completedFocuses.has(focus.id);

      // 始点（親ノードの下中央）
      const x1 = parent.x + NODE_WIDTH / 2;
      const y1 = parent.y + NODE_HEIGHT;
      // 終点（子ノードの上中央）
      const x2 = focus.x + NODE_WIDTH / 2;
      const y2 = focus.y;

      const midY = y1 + (y2 - y1) / 2;

      // 段階的な直角ライン (SVG Path)
      const pathData = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', `tree-line ${(parentCompleted && childCompleted) ? 'completed' : ''}`);

      svg.appendChild(path);
    });
  });
}

// =========================================================
// 5. ツールチップ処理
// =========================================================
const tooltip = document.getElementById('nf-tooltip');

function showTooltip(e, focus) {
  document.getElementById('tooltip-title').textContent = focus.title;
  document.getElementById('tooltip-time').textContent = `必要期間: ${focus.days} 日`;
  document.getElementById('tooltip-effect').textContent = `【完了時効果】\n${focus.effect}`;

  tooltip.classList.remove('hidden');
  moveTooltip(e);
}

function moveTooltip(e) {
  tooltip.style.left = `${e.pageX + 15}px`;
  tooltip.style.top = `${e.pageY + 15}px`;
}

function hideTooltip() {
  tooltip.classList.add('hidden');
}

document.addEventListener('mousemove', (e) => {
  if (!tooltip.classList.contains('hidden')) {
    moveTooltip(e);
  }
});

// =========================================================
// 6. パン & ズーム (ドラッグ移動・ホイール拡大縮小)
// =========================================================
let scale = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

const viewport = document.getElementById('tree-viewport');
const container = document.getElementById('tree-container');

function updateTransform() {
  viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

container.addEventListener('mousedown', (e) => {
  if (e.target.closest('.focus-node')) return; // ノードクリック時はドラッグしない
  isDragging = true;
  startX = e.clientX - panX;
  startY = e.clientY - panY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  panX = e.clientX - startX;
  panY = e.clientY - startY;
  updateTransform();
});

window.addEventListener('mouseup', () => { isDragging = false; });

container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = 0.1;
  if (e.deltaY < 0) {
    scale = Math.min(scale + zoomFactor, 1.8);
  } else {
    scale = Math.max(scale - zoomFactor, 0.4);
  }
  updateTransform();
}, { passive: false });

// =========================================================
// 7. 初期化処理
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  renderTree();
  updateCalendarDisplay();

  // 速度ボタンのイベントバインド
  document.getElementById('btn-pause').addEventListener('click', () => setSpeed(0));
  document.querySelectorAll('.speed-btn[data-speed]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const speed = parseInt(e.target.getAttribute('data-speed'), 10);
      setSpeed(speed);
    });
  });

  typeLog("1936年1月1日 - ソビエト社会主義共和国連邦、最高指導部会議を開始。");
});
