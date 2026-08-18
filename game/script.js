// 試行するパスの候補リスト（上から順に試します）
const batchFiles = [
  './data/nf_batch1.json',   // game/data/nf_batch1.json を試す
  '../data/nf_batch1.json',  // 1つ上の階層 data/nf_batch1.json を試す
  'data/nf_batch1.json'      // ルートからの相対を試す
];

let allFocuses = [];
const focusMap = {};

// fetchを複数のパスで試す汎用関数
async function fetchWithFallback(paths) {
  for (const path of paths) {
    try {
      const res = await fetch(path);
      if (res.ok) {
        console.log(`成功したパス: ${path}`);
        return await res.json();
      }
    } catch (e) {
      // 次のパスを試す
    }
  }
  throw new Error(`以下のすべてのパスでJSONが見つかりませんでした:\n${paths.join('\n')}`);
}

async function loadAllFocusTrees() {
  const nodesContainer = document.getElementById('focus-nodes');
  
  try {
    // パスを順番に試してデータを取得
    const data = await fetchWithFallback(batchFiles);
    
    allFocuses = data;

    if (!allFocuses || allFocuses.length === 0) {
      nodesContainer.innerHTML = '<p style="color:red; padding:20px;">JSONデータは読み込めましたが、中身が空です。</p>';
      return;
    }

    allFocuses.forEach(nf => {
      focusMap[nf.id] = nf;
    });

    renderTree();

  } catch (error) {
    // 万が一失敗した場合、真っ暗にせず画面に理由を出力する
    nodesContainer.innerHTML = `
      <div style="color: #ff6b6b; padding: 30px; font-family: sans-serif; background: rgba(0,0,0,0.8); border: 2px solid red; margin: 20px;">
        <h2>⚠️ データの読み込みエラー</h2>
        <pre style="white-space: pre-wrap;">${error.message}</pre>
        <hr>
        <p>【確認手順】</p>
        <ul>
          <li>GitHub上の <code>data/nf_batch1.json</code> が <code>game/</code> フォルダの中にあるか、その外にあるか確認してください。</li>
        </ul>
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

    // アイコン用簡易テキスト（IDから生成）
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
