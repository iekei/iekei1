// ==========================================
// 1. 研究ツリーデータ構造 (HOI4 Wiki準拠)
// ==========================================
const researchData = {
  // --- 工学・原子核 (画像で表示されていたツリー) ---
  engineering: [
    {
      id: "electronic_mechanical_engineering",
      title: "電子機械工学",
      year: 1936,
      x: 180, y: 50,
      icon: "https://hoi4.paradoxwikis.com/images/1/1a/Electronic_mechanical_engineering.png",
      effects: ["研究速度: +3.0%", "暗号解読: +1.0"],
      prerequisites: []
    },
    {
      id: "radio",
      title: "無線",
      year: 1938,
      x: 100, y: 200,
      icon: "https://hoi4.paradoxwikis.com/images/c/c2/Radio.png",
      effects: ["増援増強率: +5.0%", "信頼度: +5.0%"],
      prerequisites: ["electronic_mechanical_engineering"]
    },
    {
      id: "mechanical_computing",
      title: "機械式計算機",
      year: 1938,
      x: 260, y: 200,
      icon: "https://hoi4.paradoxwikis.com/images/3/3d/Mechanical_computing.png",
      effects: ["研究速度: +4.0%"],
      prerequisites: ["electronic_mechanical_engineering"]
    },
    {
      id: "computing_machine",
      title: "計算機",
      year: 1940,
      x: 260, y: 440,
      icon: "https://hoi4.paradoxwikis.com/images/a/a2/Computing_machine.png",
      effects: ["研究速度: +5.0%"],
      prerequisites: ["mechanical_computing"]
    },
    // 原子核ツリー (右側の独立ライン)
    {
      id: "atomic_research",
      title: "原子核研究",
      year: 1940,
      x: 600, y: 440,
      icon: "https://hoi4.paradoxwikis.com/images/8/8c/Atomic_research.png",
      effects: ["原子炉建設可能", "研究速度: +10.0%"],
      prerequisites: []
    },
    {
      id: "experimental_rockets",
      title: "実験的ロケット",
      year: 1942,
      x: 750, y: 680,
      icon: "https://hoi4.paradoxwikis.com/images/2/23/Experimental_rockets.png",
      effects: ["ロケットサイト建設可能", "信頼度: +2.0%"],
      prerequisites: []
    }
  ],

  // --- 歩兵・支援 ---
  infantry: [
    {
      id: "infantry_weapons_1",
      title: "基本型歩兵装備",
      year: 1936,
      x: 200, y: 50,
      icon: "https://hoi4.paradoxwikis.com/images/d/df/Infantry_weapons_1.png",
      effects: ["対人攻撃: +3", "対物攻撃: +1", "防衛: +5"],
      prerequisites: []
    },
    {
      id: "infantry_weapons_2",
      title: "改良型歩兵装備",
      year: 1939,
      x: 200, y: 320,
      icon: "https://hoi4.paradoxwikis.com/images/f/f6/Infantry_weapons_2.png",
      effects: ["対人攻撃: +6", "対物攻撃: +2", "防衛: +8"],
      prerequisites: ["infantry_weapons_1"]
    },
    {
      id: "field_hospital_1",
      title: "野戦病院 I",
      year: 1936,
      x: 450, y: 50,
      icon: "https://hoi4.paradoxwikis.com/images/8/8b/Field_hospital_1.png",
      effects: ["衛生（救命率）: +20.0%", "経験値損失軽減: +10.0%"],
      prerequisites: []
    }
  ],

  // --- 装甲車輌 ---
  armor: [
    {
      id: "basic_light_tank",
      title: "基本型軽戦車",
      year: 1936,
      x: 250, y: 50,
      icon: "https://hoi4.paradoxwikis.com/images/2/28/Basic_light_tank.png",
      effects: ["装甲値: +10", "対人攻撃: +12", "移動速度: +10.0km/h"],
      prerequisites: []
    },
    {
      id: "basic_medium_tank",
      title: "基本型中戦車 (T-34等)",
      year: 1939,
      x: 250, y: 320,
      icon: "https://hoi4.paradoxwikis.com/images/0/07/Basic_medium_tank.png",
      effects: ["装甲値: +45", "対人攻撃: +25", "信頼度: +80.0%"],
      prerequisites: ["basic_light_tank"]
    }
  ]
};

// ==========================================
// 2. 状態管理 & 要素取得
// ==========================================
let currentCategory = 'engineering';
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let startX = 0, startY = 0;
const researchedTechs = new Set(["electronic_mechanical_engineering", "infantry_weapons_1"]);

const container = document.getElementById('tree-container');
const viewport = document.getElementById('tree-viewport');
const nodesContainer = document.getElementById('tech-nodes');
const svgLines = document.getElementById('svg-lines');
const yearSidebar = document.getElementById('year-sidebar');

// ==========================================
// 3. マウススクロール（縦移動） & ドラッグ（横移動）
// ==========================================

// 通常のマウスホイールで上下移動（要件通り）
container.addEventListener('wheel', (e) => {
  e.preventDefault();
  offsetY -= e.deltaY;
  
  // 上限・下限の制限（画面外に行きすぎないように）
  offsetY = Math.min(0, Math.max(-1200, offsetY));
  
  updateTransform();
}, { passive: false });

// マウスドラッグで横移動（および縦移動）
container.addEventListener('mousedown', (e) => {
  if (e.target.closest('.tech-node')) return;
  isDragging = true;
  startX = e.clientX - offsetX;
  startY = e.clientY - offsetY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  offsetX = e.clientX - startX;
  offsetY = e.clientY - startY;

  // 移動制限
  offsetX = Math.min(0, Math.max(-2000, offsetX));
  offsetY = Math.min(0, Math.max(-1200, offsetY));

  updateTransform();
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

function updateTransform() {
  viewport.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  // 左側の年数タイムラインもY方向に同期スクロール
  yearSidebar.style.transform = `translateY(${offsetY}px)`;
}

// ==========================================
// 4. カテゴリー切替 & ツリー描画
// ==========================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.getAttribute('data-cat');
    renderTree();
  });
});

function renderTree() {
  nodesContainer.innerHTML = '';
  svgLines.innerHTML = '';

  const techList = researchData[currentCategory] || [];
  const techMap = {};
  techList.forEach(t => techMap[t.id] = t);

  // 1. ノードの描画
  techList.forEach(tech => {
    const node = document.createElement('div');
    node.className = 'tech-node';
    if (researchedTechs.has(tech.id)) {
      node.classList.add('researched');
    }

    node.style.left = `${tech.x}px`;
    node.style.top = `${tech.y}px`;

    node.innerHTML = `
      <img src="${tech.icon}" alt="${tech.title}">
      <div class="tech-title">${tech.title}</div>
    `;

    // ツールチップイベント
    node.addEventListener('mouseenter', (e) => showTooltip(e, tech));
    node.addEventListener('mousemove', moveTooltip);
    node.addEventListener('mouseleave', hideTooltip);

    // クリックで研究完了切り替え
    node.addEventListener('click', () => {
      if (researchedTechs.has(tech.id)) {
        researchedTechs.delete(tech.id);
      } else {
        researchedTechs.add(tech.id);
      }
      renderTree();
    });

    nodesContainer.appendChild(node);
  });

  // 2. 接続線の描画 (HOI4風 カギ折れ線)
  techList.forEach(tech => {
    if (tech.prerequisites && tech.prerequisites.length > 0) {
      tech.prerequisites.forEach(parentId => {
        const parent = techMap[parentId];
        if (parent) {
          const isDone = researchedTechs.has(parent.id);
          drawStepLine(parent.x + 32, parent.y + 64, tech.x + 32, tech.y, isDone);
        }
      });
    }
  });
}

// カギ折れ（直角）描画
function drawStepLine(x1, y1, x2, y2, isActive) {
  const midY = y1 + (y2 - y1) / 2;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  
  // M:開始 -> V:垂直 -> H:水平 -> V:目的地
  const d = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
  
  path.setAttribute('d', d);
  path.setAttribute('class', isActive ? 'tech-line active' : 'tech-line');
  svgLines.appendChild(path);
}

// ==========================================
// 5. ツールチップ処理
// ==========================================
const tooltip = document.getElementById('tech-tooltip');

function showTooltip(e, tech) {
  document.getElementById('tooltip-title').textContent = tech.title;
  document.getElementById('tooltip-year').textContent = `基準年: ${tech.year}年`;

  const effectsContainer = document.getElementById('tooltip-effects');
  effectsContainer.innerHTML = '';
  tech.effects.forEach(eff => {
    const div = document.createElement('div');
    div.className = 'effect-item';
    div.textContent = `• ${eff}`;
    effectsContainer.appendChild(div);
  });

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
renderTree();
