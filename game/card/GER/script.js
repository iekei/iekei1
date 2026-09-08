// --- 1. カードデータ ---
const leaders = [
  { 
    name: "アドルフ・ヒトラー", 
    rank: "SSR", 
    desc: "1934年のヒンデンブルク大統領死去に伴い大統領権限と首相職を統合し、絶対的な権力を握っていた最高指導者。", 
    imgUrl: "data/image/nazi/hitler.png",
    cutinUrl: "data/image/cut/hitler.png", // カットイン用画像パス
    color: "#8B0000" 
  },
  { 
    name: "ヘルマン・ゲーリング", 
    rank: "SSR", 
    desc: "ヒトラーの後継者筆頭（国家元首次席代理）。空軍総司令官や四カ年計画責任者を兼任し、党・軍・経済の広範囲で圧倒的な権力を持っていた人物。", 
    imgUrl: "data/image/nazi/hermann.png",
    cutinUrl: null,
    color: "#4682B4" 
  },
  { 
    name: "ハインリヒ・ヒムラー", 
    rank: "SR", 
    desc: "SS（親衛隊）全国指導者であり、1936年に全ドイツ警察長官を兼任。警察・治安組織を完璧に手中に収めており、クーデターや政変が起きた場合、暴力装置を背景に実権を握る筆頭候補。", 
    imgUrl: "data/image/nazi/himmler.png",
    cutinUrl: null,
    color: "#1A1A1A" 
  },
  { 
    name: "ルドルフ・ヘス", 
    rank: "SR", 
    desc: "総統代理（副総統）として党務の全般を統括していた人物。史実でもヒトラーに次ぐ「党の顔」であり、ヒトラー不在時には形式的に首班へ繰り上がる第一位の立場にいた。", 
    imgUrl: "data/image/nazi/hess.png",
    cutinUrl: null,
    color: "#556B2F" 
  },
  { 
    name: "ヨーゼフ・ゲッベルス", 
    rank: "SSR", 
    desc: "宣伝大臣兼ベルリン管区指導者。メディアと世論を完全に支配しており、政権の正当性を担保する発言力から、クーデター後の黒幕や指導者補佐・代行として擁立される可能性が高かった。", 
    imgUrl: "data/image/nazi/joseph.png",
    cutinUrl: null,
    color: "#A52A2A" 
  },
  { 
    name: "ルートヴィヒ・ベック", 
    rank: "SR", 
    desc: "陸軍参謀総長。1936年当時は軍部内で対外冒険政策への警戒感が強まりつつある時期であり、後にヒトラー暗殺計画（1944年）の最高指導者候補となったように、軍事クーデター成立時の暫定国家元首候補。", 
    imgUrl: "data/image/nazi/beck.png",
    color: "#2E8B57" 
  },
  { 
    name: "アルフレート・フーゲンベルク", 
    rank: "SR", 
    desc: "国家人民党（DNVP）の党首でメディア王。ナチス連立政権の成立に関与したが追いやられた。ナチス体制が内部崩壊した場合、軍部や旧貴族層が擁立し得る「旧体制派の保守指導者」の筆頭。", 
    imgUrl: "data/image/nazi/alfred.png",
    cutinUrl: null,
    color: "#708090" 
  },
  { 
    name: "オットー・シュトラッサー", 
    rank: "SR", 
    desc: "ナチス左派の指導者（1930年にヒトラーと対立して脱党し「黒い戦線」を結成）。反資本主義的なナチズムを掲げており、反ヒトラー派のナチス構成員や労働者層を巻き込んだクーデターが成功した場合の指導者候補。", 
    imgUrl: "data/image/nazi/otto.png",
    cutinUrl: null,
    color: "#B22222" 
  },
  // --- 【1936年 将軍カード】 ---
  { 
    id: "rommel",
    type: "general",
    name: "エルヴィン・ロンメル", 
    rank: "SSR", 
    desc: "1936年当時は歩兵学校教官（中佐）。後に「砂漠の狐」と謳われる機動戦術の天才将軍。", 
    imgUrl: "data/image/army/rommel.png",
    medalUrl: "data/image/kun/pour_le_merite.png",          // プール・ル・メリット勲章
    cutinUrl: "data/image/cut/rommel.png",
    cutinOffset: "center 30%",
    color: "#ffd700" 
  },
  { 
    id: "guderian",
    type: "general",
    name: "ハインツ・グデーリアン", 
    rank: "SSR", 
    desc: "快速部隊の創設者。1936年当時は第2装甲師団長を務め、電撃戦（戦車戦術）の基盤を確立した。", 
    imgUrl: "data/image/army/guderian.png",
    medalUrl: "data/image/kun/iron_cross.png",               // 鉄十字章
    cutinUrl: "data/image/cut/guderian.png",
    cutinOffset: "center 30%",
    color: "#ffd700" 
  },
  { 
    id: "mstein",
    type: "general",
    name: "エーリヒ・フォン・マンシュタイン", 
    rank: "SR", 
    desc: "1936年当時は参謀本部第1部長（少将）。フランス侵攻「マンシュタイン計画」を立案した最高峰の戦略家。", 
    imgUrl: "data/image/army/mstein.png",
    medalUrl: "data/image/kun/iron_cross.png",
    cutinUrl: null,
    color: "#c0c0c0" 
  },
  { 
    id: "rundstedt",
    type: "general",
    name: "ゲルト・フォン・ルントシュテット", 
    rank: "SSR", 
    desc: "1936年当時は歩兵大将・第1軍集団司令官。旧プロイセン軍人の伝統を体現する陸軍最長老格の一人。", 
    imgUrl: "data/image/army/rundstedt.png",
    medalUrl: "data/image/kun/iron_cross.png",               // 鉄十字章
    cutinUrl: "data/image/cut/rundstedt.png",
    cutinOffset: "center 25%",
    color: "#ffd700" 
  },
  { 
    id: "bock",
    type: "general",
    name: "フェードア・フォン・ボック", 
    rank: "SSR", 
    desc: "1936年当時は歩兵大将・第3軍集団司令官。厳格な規律を重んじ、第一次世界大戦時には最高勲章を授与された。", 
    imgUrl: "data/image/army/bock.png",
    medalUrl: "data/image/kun/pour_le_merite.png",          // プール・ル・メリット勲章
    cutinUrl: "data/image/cut/bock.png",
    cutinOffset: "center 30%",
    color: "#ffd700" 
  },
  { 
    id: "leeb",
    type: "general",
    name: "ヴィルヘルム・リッター・フォン・レープ", 
    rank: "SR", 
    desc: "1936年当時は砲兵大将・第2軍集団司令官。防御戦術の第一人者であり、科学的軍事研究にも注力した。", 
    imgUrl: "data/image/army/leeb.png",
    medalUrl: "data/image/kun/military_order_max_joseph.png", // マックス・ヨーゼフ軍事勲章
    cutinUrl: null,
    color: "#c0c0c0" 
  },
  { 
    id: "kluge",
    type: "general",
    name: "ギュンター・フォン・クルーゲ", 
    rank: "SR", 
    desc: "1936年当時は砲兵大将・第6軍管区司令官。のちに「聡明なハンス」と渾名される、機転と果断さに優れた指揮官。", 
    imgUrl: "data/image/army/kluge.png",
    medalUrl: "data/image/kun/iron_cross.png",
    cutinUrl: null,
    color: "#c0c0c0" 
  },
  { 
    id: "list",
    type: "general",
    name: "ヴィルヘルム・リスト", 
    rank: "SR", 
    desc: "1936年当時は歩兵大将・第4軍管区司令官。手堅く着実な用兵で周囲の信頼を得た実務派将軍。", 
    imgUrl: "data/image/army/list.png",
    medalUrl: "data/image/kun/iron_cross.png",
    cutinUrl: null,
    color: "#c0c0c0" 
  },
  { 
    id: "kesselring",
    type: "general",
    name: "アルベルト・ケッセルリンク", 
    rank: "SSR", 
    desc: "1936年当時は初代空軍参謀長。元は陸軍砲兵将校であり、統合軍的視点から陸空協同戦術を育成した。", 
    imgUrl: "data/image/army/kesselring.png",
    medalUrl: "data/image/kun/iron_cross.png",
    cutinUrl: "data/image/cut/kesselring.png",
    cutinOffset: "center 35%",
    color: "#ffd700" 
  },
    // --- 【資源カード】 ---
  { 
    id: "oil",
    type: "resource",
    name: "石油", 
    rank: "SR", 
    desc: "機械化部隊や航空・海軍の作戦行動に必須不可欠な黒い血。国内では石炭液化技術（合成石油）での補給も進められている最重要資源。", 
    imgUrl: "data/image/item/oil.png",
    color: "#c0c0c0" // シルバー
  },
  { 
    id: "coal",
    type: "resource",
    name: "石炭", 
    rank: "R", 
    desc: "国内（ルール地方など）で極めて豊富に採掘されるエネルギー源。工業生産・発電だけでなく、合成石油やゴムの原材料としても使われる。", 
    imgUrl: "data/image/item/coal.png",
    color: "#cd7f32" // ブロンズ
  },
  { 
    id: "steel",
    type: "resource",
    name: "鋼材", 
    rank: "R", 
    desc: "戦車、軍艦、火砲、建築などのあらゆる製造業を支える重工業の屋台骨。スウェーデン等からの鉄鉱石輸入が極めて重要な生命線となる。", 
    imgUrl: "data/image/item/steel.png",
    color: "#cd7f32" 
  },
  { 
    id: "tungsten",
    type: "resource",
    name: "タングステン", 
    rank: "SR", 
    desc: "戦車の主砲弾（徹甲弾）の弾芯や、精密機械加工を行う工作機械用の工具鋼に用いられる。極めて高い硬度を誇る大変希少なレアメタル。", 
    imgUrl: "data/image/item/tungsten.png",
    color: "#c0c0c0" 
  },
  { 
    id: "chromium",
    type: "resource",
    name: "クロム", 
    rank: "SR", 
    desc: "戦車や軍艦の装甲板、特殊ステンレス鋼などの製造に不可欠な金属。対腐食性と耐熱性を飛躍的に高める、輸入に深く依存する戦略物資。", 
    imgUrl: "data/image/item/chromium.png",
    color: "#c0c0c0" 
  },
  { 
    id: "aluminum",
    type: "resource",
    name: "アルミ", 
    rank: "R", 
    desc: "航空機（戦闘機や爆撃機など）の機体製造に大量消費される軽金属。主に輸入したボーキサイトから大量の電力を消費して精錬される。", 
    imgUrl: "data/image/item/aluminum.png",
    color: "#cd7f32" 
  },
  { 
    id: "rubber",
    type: "resource",
    name: "ゴム", 
    rank: "SR", 
    desc: "軍用車両のタイヤや各種電気機器の絶縁体に使用される必須物資。東南アジアからの輸入路断絶に備え、合成ゴム（ブナ）の製造が進められている。", 
    imgUrl: "data/image/item/rubber.png",
    color: "#c0c0c0" 
  }
];

// --- 2. Three.js 3Dグラフィックス初期化 ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 7.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 立体感を強調するためのリアルなソフト影（ShadowMap）設定
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// ライティング（雰囲気を出すために全体光量を少し落としたシネマティック調整）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const mainDirLight = new THREE.DirectionalLight(0xffffff, 0.65);
mainDirLight.position.set(-5, 7, 5); // 左上からの光源
mainDirLight.castShadow = true;
mainDirLight.shadow.mapSize.width = 1024;
mainDirLight.shadow.mapSize.height = 1024;
mainDirLight.shadow.camera.near = 0.5;
mainDirLight.shadow.camera.far = 15;
mainDirLight.shadow.bias = -0.001;
scene.add(mainDirLight);

const fillLight = new THREE.DirectionalLight(0xd0d5dd, 0.25);
fillLight.position.set(5, -2, 3);
scene.add(fillLight);

const pointLight = new THREE.PointLight(0xffffff, 0.5, 8);
pointLight.position.set(0, 0, 3);
scene.add(pointLight);

// 影を受けるための不可視の背面シャドウプレーン
const shadowPlaneGeo = new THREE.PlaneGeometry(20, 20);
const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.15 });
const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
shadowPlane.position.z = -0.5;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// --- 3. ギザギザ形状（袋カット用の鋸歯）作成ヘルパー ---
function createZigZagShape(width, height, teethCount, toothDepth) {
  const shape = new THREE.Shape();
  const halfW = width / 2;
  const toothWidth = width / teethCount;

  shape.moveTo(-halfW, 0);
  for (let i = 0; i < teethCount; i++) {
    const x1 = -halfW + i * toothWidth + toothWidth / 2;
    const y1 = toothDepth;
    const x2 = -halfW + (i + 1) * toothWidth;
    const y2 = 0;
    shape.lineTo(x1, y1);
    shape.lineTo(x2, y2);
  }
  shape.lineTo(halfW, -height);
  shape.lineTo(-halfW, -height);
  shape.closePath();

  return shape;
}

// --- 4. GER パック表紙テクスチャ生成 (高級マットホワイト仕様) ---
function createPackBodyTexture(callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // マットホワイトベース ＋ 左上光源からの反射グラデーション
  const packGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  packGrad.addColorStop(0, '#ffffff');
  packGrad.addColorStop(0.5, '#e6e8eb');
  packGrad.addColorStop(1, '#cbcfd6');
  ctx.fillStyle = packGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  const iconImg = new Image();
  iconImg.src = 'data/image/icon/nazi.png';
  iconImg.onload = () => {
    const size = 210;
    ctx.drawImage(iconImg, (canvas.width - size) / 2, (canvas.height - size) / 2 - 20, size, size);
    callback(new THREE.CanvasTexture(canvas));
  };
  iconImg.onerror = () => { callback(new THREE.CanvasTexture(canvas)); };
}

function createPackTopTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  const topGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  topGrad.addColorStop(0, '#ffffff');
  topGrad.addColorStop(1, '#d8dce2');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  return new THREE.CanvasTexture(canvas);
}

// --- 5. 動的カードテクスチャ描画 (角丸・立体色・改行・勲章合成・タイプ別枠線対応) ---
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const characters = text.split('');
  let line = '';
  let currentY = y;

  for (let n = 0; n < characters.length; n++) {
    const testLine = line + characters[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = characters[n];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}

// 指導者・将軍・資源に対応した多層アセット同期読み込み関数
function createCardTexture(leader, callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // 1. 立体感のある黒系ベースグラデーション
  const bgGrad = ctx.createRadialGradient(256, 384, 50, 256, 384, 400);
  bgGrad.addColorStop(0, '#2a2e3d');
  bgGrad.addColorStop(0.7, '#12151e');
  bgGrad.addColorStop(1, '#080a0f');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 非同期ロード対象アセットをキューイング
  const assetsToLoad = [];
  assetsToLoad.push({ key: "main", src: leader.imgUrl }); // メイン写真（偉人 / 将軍 / 資源）

  if (leader.type === "general" && leader.medalUrl) {
    assetsToLoad.push({ key: "medal", src: leader.medalUrl }); // 将軍の勲章
  }

  let loadedCount = 0;
  const loadedImages = {};

  assetsToLoad.forEach(asset => {
    const img = new Image();
    img.src = asset.src;
    img.onload = () => {
      loadedImages[asset.key] = img;
      loadedCount++;
      if (loadedCount === assetsToLoad.length) renderAll();
    };
    img.onerror = () => {
      loadedImages[asset.key] = null;
      loadedCount++;
      if (loadedCount === assetsToLoad.length) renderAll();
    };
  });

  // 全画像読み込み完了後に実行されるメインレンダリング処理
  function renderAll() {
    const mainImg = loadedImages["main"];
    const medalImg = loadedImages["medal"];

    // 1. 画像描画領域 (角丸切り抜き)
    const imgX = 35, imgY = 85, imgW = 442, imgH = 440, radius = 16;
    ctx.save();
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, radius);
    ctx.clip();

    if (mainImg) {
      const imgRatio = mainImg.width / mainImg.height;
      const boxRatio = imgW / imgH;
      let sW = mainImg.width, sH = mainImg.height, sX = 0, sY = 0;

      if (imgRatio > boxRatio) {
        sW = mainImg.height * boxRatio;
        sX = (mainImg.width - sW) / 2;
      } else {
        sH = mainImg.width / boxRatio;
        sY = (mainImg.height - sH) / 2;
      }
      ctx.drawImage(mainImg, sX, sY, sW, sH, imgX, imgY, imgW, imgH);
    } else {
      // フォールバック
      ctx.fillStyle = '#222';
      ctx.fillRect(imgX, imgY, imgW, imgH);
      ctx.fillStyle = '#aaa';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NO IMAGE', 256, 300);
    }
    ctx.restore();

    // 画像インナー枠
    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, radius);
    ctx.stroke();

    // 2. カード本体の外枠 (角丸フレーム)
    ctx.lineWidth = 14;
    ctx.strokeStyle = leader.color;
    drawRoundedRect(ctx, 12, 12, canvas.width - 24, canvas.height - 24, 28);
    ctx.stroke();

    // 二重の装飾線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 22, 22, canvas.width - 44, canvas.height - 44, 20);
    ctx.stroke();

    // --- 将軍カード特別仕様：勲章（Medal）枠への合成 ---
    if (leader.type === "general" && medalImg) {
      const medalW = 76;
      const medalH = 76;
      // カードの右上に、少し枠からはみ出すようにオーバーレイ配置
      const medalX = canvas.width - 110;
      const medalY = 32;

      // 勲章の後ろに豪華な光彩（ゴールドシャドウ）を付与
      ctx.save();
      ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
      ctx.shadowBlur = 12;
      ctx.drawImage(medalImg, medalX, medalY, medalW, medalH);
      ctx.restore();

      // 将軍カード枠装飾（勲章を額装する金リブ）
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.strokeRect(medalX - 4, medalY - 4, medalW + 8, medalH + 8);
    }

    // --- 資源カード特別仕様：無機質なスチール風追加枠線 ---
    if (leader.type === "resource") {
      ctx.strokeStyle = 'rgba(100, 110, 120, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 80, canvas.width - 60, canvas.height - 150);
    }

    // 3. 左上のレアリティバッジ
    ctx.fillStyle = leader.color;
    ctx.beginPath();
    ctx.arc(65, 65, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leader.rank, 65, 65);

    // 4. 下部インフォエリア (立体グラデーション＆角丸)
    const textAreaX = 35, textAreaY = 545, textAreaW = 442, textAreaH = 185;
    const textAreaGrad = ctx.createLinearGradient(0, textAreaY, 0, textAreaY + textAreaH);
    textAreaGrad.addColorStop(0, 'rgba(15, 17, 24, 0.94)');
    textAreaGrad.addColorStop(1, 'rgba(5, 5, 8, 0.97)');

    ctx.fillStyle = textAreaGrad;
    drawRoundedRect(ctx, textAreaX, textAreaY, textAreaW, textAreaH, 12);
    ctx.fill();

    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, textAreaX, textAreaY, textAreaW, textAreaH, 12);
    ctx.stroke();

    // 5. 分類（指導者 / 将軍 / 資源）のバッジラベル
    ctx.fillStyle = leader.color;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    let typeLabel = "指導者";
    if (leader.type === "general") typeLabel = "将軍";
    if (leader.type === "resource") typeLabel = "資源";
    ctx.fillText(`【${typeLabel}】`, 55, 580);

    // 6. 名前（太字・中央揃え）
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.fillText(leader.name, 256, 585);

    // 7. 説明文の回り込み自動改行
    ctx.fillStyle = '#dddddd';
    ctx.font = '19px sans-serif';
    wrapText(ctx, leader.desc, 256, 630, 410, 26);

    const texture = new THREE.CanvasTexture(canvas);
    callback(texture);
  }
}

// --- 6. 3Dオブジェクト構築 (立体パック ＋ 上部ギザギザカッター部) ---
const mainGroup = new THREE.Group();
scene.add(mainGroup);

const packGroup = new THREE.Group();
mainGroup.add(packGroup);

// マットホワイトマテリアル設定
const packBaseMat = new THREE.MeshPhysicalMaterial({ 
  color: 0xffffff, 
  roughness: 0.45, 
  metalness: 0.05, 
  clearcoat: 0.25,
  clearcoatRoughness: 0.4
});

// パック本体（肉厚さを表現したキャストシャドウ対応）
const packBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.18), packBaseMat);
packBody.position.set(0, -0.3, 0.09);
packBody.castShadow = true;
packBody.receiveShadow = true;
packGroup.add(packBody);

// パック上部（開封時にスライド切断されるパーツ）
const packTopGroup = new THREE.Group();
packTopGroup.position.set(0, 1.4, 0.09);
packGroup.add(packTopGroup);

const topBlock = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.18), packBaseMat);
topBlock.position.set(0, 0.25, 0);
topBlock.castShadow = true;
topBlock.receiveShadow = true;
packTopGroup.add(topBlock);

// 3Dギザギザ形状の生成 (ExtrudeGeometryでギザギザの厚みを作成)
const toothShape = createZigZagShape(2.6, 0.3, 26, 0.12);
const extrudeSettings = { depth: 0.04, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 };
const toothGeo = new THREE.ExtrudeGeometry(toothShape, extrudeSettings);
toothGeo.center();

const packTooth = new THREE.Mesh(toothGeo, packBaseMat);
packTooth.position.set(0, 0.65, 0);
packTooth.castShadow = true;
packTooth.receiveShadow = true;
packTopGroup.add(packTooth);

// テクスチャのアタッチ
createPackBodyTexture((bodyTexture) => {
  const bodyFrontMat = new THREE.MeshPhysicalMaterial({ map: bodyTexture, roughness: 0.4, clearcoat: 0.25 });
  packBody.material = [packBaseMat, packBaseMat, packBaseMat, packBaseMat, bodyFrontMat, packBaseMat];
});

const topTexture = createPackTopTexture();
const topFrontMat = new THREE.MeshPhysicalMaterial({ map: topTexture, roughness: 0.4, clearcoat: 0.25 });
topBlock.material = [packBaseMat, packBaseMat, packBaseMat, packBaseMat, topFrontMat, packBaseMat];

// カット案内用の破線
const cutLineMat = new THREE.LineDashedMaterial({ 
  color: 0x444444, 
  dashSize: 0.08, 
  gapSize: 0.06,
  linewidth: 2 
});
const cutLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, 1.4, 0.19), new THREE.Vector3(1.3, 1.4, 0.19)]),
  cutLineMat
);
cutLine.computeLineDistances();
packGroup.add(cutLine);

// スワイプ操作の判定領域（大きめに設定した不可視ボックス）
const cutHitBox = new THREE.Mesh(
  new THREE.BoxGeometry(3.0, 0.9, 0.6),
  new THREE.MeshBasicMaterial({ visible: false })
);
cutHitBox.position.set(0, 1.75, 0.1);
packGroup.add(cutHitBox);

// 3Dカード
const cardGeo = new THREE.BoxGeometry(2.2, 3.2, 0.05);
let backMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
let frontMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

const cardMaterials = [backMat, backMat, backMat, backMat, frontMat, backMat];
const card = new THREE.Mesh(cardGeo, cardMaterials);
card.position.set(0, -0.3, 0);
card.scale.set(0.9, 0.9, 0.9);
card.castShadow = true;
card.receiveShadow = true;
card.visible = false;
mainGroup.add(card);

// パーティクルシステム
const particleCount = 80;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) particlePos[i] = (Math.random() - 0.5) * 8;
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({ size: 0.06, color: 0xffffff, transparent: true, opacity: 0 });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- 7. ペルソナ5風カットイン再生 ---
function playP5CutIn(cutinImgUrl, offset, onCompleteCallback) {
  const overlay = document.getElementById('cutin-overlay');
  const banner = document.getElementById('cutin-banner');
  const img = document.getElementById('cutin-img');

  img.src = cutinImgUrl;
  const pos = offset || "center 30%";
  img.style.objectPosition = pos;

  overlay.style.display = 'block';
  gsap.set(img, { transformOrigin: pos });

  const tl = gsap.timeline({
    onComplete: () => {
      overlay.style.display = 'none';
      if (onCompleteCallback) onCompleteCallback();
    }
  });

  tl.fromTo(banner, { xPercent: 100, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.25, ease: "power4.out" })
    .fromTo(img, { scale: 2.2, x: 100 }, { scale: 1.0, x: 0, duration: 0.3, ease: "back.out(1.4)" }, "<")
    .to(banner, { duration: 1.2 })
    .to(banner, { xPercent: -100, opacity: 0, duration: 0.2, ease: "power3.in" });
}

// --- 8. イベント・スワイプ & 開封後カード自由回転処理 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let isDragging = false;
let startX = 0, startY = 0;
let isOpened = false;
let isCardInteractable = false;

let isCardDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let cardVelocity = { x: 0, y: 0 };

const instruction = document.getElementById('instruction');
const resultText = document.getElementById('result-text');
const resetBtn = document.getElementById('reset-btn');

function checkIntersection(clientX, clientY, targetObj) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(targetObj, true);
  return intersects.length > 0;
}

function onPointerDown(e) {
  const clientX = e.clientX || (e.touches && e.touches.clientX);
  const clientY = e.clientY || (e.touches && e.touches.clientY);

  if (!isOpened) {
    if (checkIntersection(clientX, clientY, cutHitBox)) {
      isDragging = true;
      startX = clientX;
      startY = clientY;
    }
  } else if (isCardInteractable) {
    if (checkIntersection(clientX, clientY, card)) {
      isCardDragging = true;
      previousMousePosition = { x: clientX, y: clientY };
      cardVelocity = { x: 0, y: 0 };
    }
  }
}

function onPointerMove(e) {
  const clientX = e.clientX || (e.touches && e.touches.clientX);
  const clientY = e.clientY || (e.touches && e.touches.clientY);

  if (isDragging && !isOpened) {
    const deltaX = clientX - startX;
    const deltaY = Math.abs(clientY - startY);

    if (Math.abs(deltaX) > 60 && deltaY < 80) {
      isDragging = false;
      openPack(deltaX > 0 ? 1 : -1);
    }
  } else if (isCardDragging && isCardInteractable) {
    const deltaMove = {
      x: clientX - previousMousePosition.x,
      y: clientY - previousMousePosition.y
    };

    const deltaRotationQuaternion = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(
        deltaMove.y * 0.01,
        deltaMove.x * 0.01,
        0,
        'XYZ'
      ));

    card.quaternion.multiplyQuaternions(deltaRotationQuaternion, card.quaternion);

    cardVelocity = {
      x: deltaMove.x * 0.008,
      y: deltaMove.y * 0.008
    };

    previousMousePosition = { x: clientX, y: clientY };
  }
}

function onPointerUp() {
  isDragging = false;
  isCardDragging = false;
}

window.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
window.addEventListener('touchstart', onPointerDown);
window.addEventListener('touchmove', onPointerMove);
window.addEventListener('touchend', onPointerUp);

// 開封処理（カードタイプの同期読み込みプロセスに更新）
function openPack(direction) {
  isOpened = true;
  instruction.style.display = 'none';

  // ガチャ抽選
  const picked = leaders[Math.floor(Math.random() * leaders.length)];
  unlockCard(picked.id);

  // 裏面・表面テクスチャを同期生成
  createCardBackTexture(picked, (backTexture) => {
    cardMaterials[1] = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.3 });

    createCardTexture(picked, (frontTexture) => {
      cardMaterials[2] = new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.3 });
      card.material = cardMaterials;

      const tl = gsap.timeline({
        onComplete: () => {
          resultText.innerHTML = `<span style="color:${picked.color === "#222222" ? "#333333" : picked.color}">【${picked.rank}】${picked.name}</span><br><small>${picked.desc}</small>`;
          resetBtn.style.display = 'inline-block';
          isCardInteractable = true;
          instruction.innerText = "カードをドラッグして3D回転！";
          instruction.style.display = 'block';
        }
      });

      cutLine.visible = false;

      // 上部パーツとギザギザ部分を同時に吹き飛ばす
      tl.to(packTopGroup.position, { x: direction * 4, y: 3.2, z: -2, duration: 0.6, ease: "power2.out" })
        .to(packTopGroup.rotation, { z: -direction * Math.PI * 2, duration: 0.6 }, "<")
        .call(() => {
          // SSRかつカットイン情報がある場合のみ、ペルソナ演出を割り込ませる
          if (picked.rank === "SSR" && picked.cutinUrl) {
            tl.pause();
            playP5CutIn(picked.cutinUrl, picked.cutinOffset, () => {
              tl.resume();
            });
          }

          card.visible = true;
        }, null, "-=0.2")
        .to(card.position, { y: 1.3, z: 0.3, duration: 0.6, ease: "power2.out" })
        .to(packBody.position, { y: -4.5, duration: 0.5, ease: "power2.in" }, "+=0.1")
        .to(card.position, { y: 0, z: 2, duration: 0.8, ease: "back.out(1.2)" }, "<")
        .to(card.scale, { x: 1, y: 1, z: 1, duration: 0.8 }, "<")
        .to(card.rotation, { y: Math.PI * 6, duration: 1.0, ease: "power2.inOut" }, "<")
        .to(particleMat, { opacity: 1, duration: 0.4 }, "<")
        .to(particles.rotation, { y: Math.PI }, "<")
        .to(particleMat, { opacity: 0, duration: 0.6 });
    });
  });
}

// リセット処理
resetBtn.addEventListener('click', () => {
  isOpened = false;
  isCardInteractable = false;
  resetBtn.style.display = 'none';
  instruction.innerText = 'パック上部をスワイプして開封！';
  instruction.style.display = 'block';
  resultText.innerText = '';

  packGroup.visible = true;
  packTopGroup.position.set(0, 1.4, 0.09);
  packTopGroup.rotation.set(0, 0, 0);
  packBody.position.set(0, -0.3, 0.09);
  cutLine.visible = true;

  card.visible = false;
  card.position.set(0, -0.3, 0);
  card.scale.set(0.9, 0.9, 0.9);
  card.quaternion.set(0, 0, 0, 1);
  cardVelocity = { x: 0, y: 0 };
});

// --- 9. 光源 ON / OFF 切り替え処理 ---
let isLightOn = true;
const lightBtn = document.getElementById('light-btn');

lightBtn.addEventListener('click', () => {
  isLightOn = !isLightOn;
  mainDirLight.visible = isLightOn;
  fillLight.visible = isLightOn;
  pointLight.visible = isLightOn;
  
  ambientLight.intensity = isLightOn ? 0.4 : 0.15;

  lightBtn.innerText = `光源: ${isLightOn ? 'ON' : 'OFF'}`;
  lightBtn.classList.toggle('off', !isLightOn);
});

// --- 10. 図鑑モーダル処理 (未解放解放式) ---
const zukanBtn = document.getElementById('zukan-btn');
const zukanModal = document.getElementById('zukan-modal');
const zukanCloseBtn = document.getElementById('zukan-close-btn');
const zukanGrid = document.getElementById('zukan-grid');

function renderZukan() {
  zukanGrid.innerHTML = '';
  leaders.forEach(leader => {
    const isUnlocked = unlockedCards.includes(leader.id);
    const cardEl = document.createElement('div');
    cardEl.className = `zukan-card ${isUnlocked ? 'unlocked' : 'locked'}`;

    if (isUnlocked) {
      cardEl.style.borderColor = leader.color;
      cardEl.innerHTML = `
        <img src="${leader.imgUrl}" alt="${leader.name}">
        <div class="card-info" style="border-top:2px solid ${leader.color}">
          ${leader.rank} ${leader.name}
        </div>
      `;
    } else {
      cardEl.innerHTML = `
        <div class="question-mark">?</div>
        <div class="card-info">まだ出してないカードは？</div>
      `;
    }
    zukanGrid.appendChild(cardEl);
  });
}

zukanBtn.addEventListener('click', () => {
  renderZukan();
  zukanModal.style.display = 'flex';
});

zukanCloseBtn.addEventListener('click', () => {
  zukanModal.style.display = 'none';
});

// --- 11. メインレンダリングループ ---
function animate() {
  requestAnimationFrame(animate);

  if (!isOpened) {
    const time = Date.now() * 0.005;
    const glow = (Math.sin(time) + 1) / 2;
    cutLineMat.color.setHSL(0, 0, 0.2 + glow * 0.4);

    mainGroup.rotation.y = Math.sin(Date.now() * 0.0015) * 0.08;
    mainGroup.rotation.x = Math.cos(Date.now() * 0.001) * 0.04;
  } else if (card.visible && isCardInteractable) {
    // 開封後の慣性付きドラッグ回転
    if (!isCardDragging) {
      if (Math.abs(cardVelocity.x) > 0.0001 || Math.abs(cardVelocity.y) > 0.0001) {
        const deltaRotationQuaternion = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(
            cardVelocity.y,
            cardVelocity.x,
            0,
            'XYZ'
          ));
        card.quaternion.multiplyQuaternions(deltaRotationQuaternion, card.quaternion);

        cardVelocity.x *= 0.95;
        cardVelocity.y *= 0.95;
      }
    }
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});