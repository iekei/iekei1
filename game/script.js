// 読み込みたいファイルの一覧（ここで50個ごとのファイルを指定）
const batchFiles = [
  'data/nf_batch1.json',
  'data/nf_batch2.json',
  'data/nf_batch3.json'
];

let allFocuses = [];
const focusMap = {};

// すべてのNFデータを取得して統合する関数
async function loadAllFocusTrees() {
  try {
    const promises = batchFiles.map(file => fetch(file).then(res => res.json()));
    const results = await Promise.all(promises);
    
    // 全バッチのデータを一つの配列に結合
    allFocuses = results.flat();

    // Map化して高速アクセスを可能にする
    allFocuses.forEach(nf => {
      focusMap[nf.id] = nf;
    });

    // 描画実行
    renderTree();
  } catch (error) {
    console.error("NFデータの読み込みに失敗しました:", error);
  }
}

// NFノードと前提条件の接続線を描画
function renderTree() {
  const nodesContainer = document.getElementById('focus-nodes');
  const svgLines = document.getElementById('svg-lines');

  nodesContainer.innerHTML = '';
  svgLines.innerHTML = '';

  // 1. ノードの描画
  allFocuses.forEach(nf => {
    const node = document.createElement('div');
    node.className = 'focus-node';
    node.id = `node-${nf.id}`;
    node.style.left = `${nf.x}px`;
    node.style.top = `${nf.y}px`;

    node.innerHTML = `
      <img src="${nf.icon}" alt="${nf.title}">
      <div class="focus-title">${nf.title}</div>
    `;

    nodesContainer.appendChild(node);
  });

  // 2. 接続線 (Prerequisites) の描画
  allFocuses.forEach(nf => {
    if (nf.prerequisites && nf.prerequisites.length > 0) {
      nf.prerequisites.forEach(parentId => {
        const parent = focusMap[parentId];
        if (parent) {
          drawLine(parent.x + 60, parent.y + 70, nf.x + 60, nf.y, svgLines);
        }
      });
    }
  });
}

// SVG直線を描画するヘルパー
function drawLine(x1, y1, x2, y2, svg) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  svg.appendChild(line);
}

// 初期化実行
loadAllFocusTrees();
