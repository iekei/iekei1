// 読み込むJSONバッチファイルのリスト
const batchFiles = [
  './data/nf_batch1.json'
];

let allFocuses = [];
const focusMap = {};

async function loadAllFocusTrees() {
  const nodesContainer = document.getElementById('focus-nodes');
  
  try {
    // 複数JSONファイルの並行取得
    const promises = batchFiles.map(file => 
      fetch(file).then(res => {
        if (!res.ok) {
          throw new Error(`ファイルが見つかりません: ${file} (Status: ${res.status})`);
        }
        return res.json();
      })
    );

    const results = await Promise.all(promises);
    
    // データを統合
    allFocuses = results.flat();

    if (allFocuses.length === 0) {
      nodesContainer.innerHTML = '<p style="color:red; padding:20px;">データが空です。</p>';
      return;
    }

    allFocuses.forEach(nf => {
      focusMap[nf.id] = nf;
    });

    renderTree();

  } catch (error) {
    console.error("NFデータの読み込みエラー:", error);
    // 画面にエラー理由を表示して「真っ暗」を防ぐ
    nodesContainer.innerHTML = `
      <div style="color: #ff6b6b; padding: 40px; font-family: monospace;">
        <h2>エラーが発生しました</h2>
        <p>${error.message}</p>
        <p>※ './data/nf_batch1.json' のパスやファイル名が正しいか確認してください。</p>
      </div>
    `;
  }
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
    node.id = `node-${nf.id}`;
    node.style.left = `${nf.x}px`;
    node.style.top = `${nf.y}px`;

    // 簡略版アイコン表示（画像フォールバック付き）
    const shortText = nf.id.replace('sov_', '').slice(0, 4).toUpperCase();

    node.innerHTML = `
      <div class="focus-icon-box">${shortText}</div>
      <div class="focus-title">${nf.title}</div>
    `;

    nodesContainer.appendChild(node);
  });

  // 2. 接続線を描画
  allFocuses.forEach(nf => {
    if (nf.prerequisites && nf.prerequisites.length > 0) {
      nf.prerequisites.forEach(parentId => {
        const parent = focusMap[parentId];
        if (parent) {
          // 親ノードの下中央から、子ノードの上中央へ線を引く
          drawLine(
            parent.x + 65, parent.y + 80,
            nf.x + 65, nf.y,
            svgLines
          );
        }
      });
    }
  });
}

function drawLine(x1, y1, x2, y2, svg) {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
  svg.appendChild(line);
}

// 実行
loadAllFocusTrees();
