// --- 1. 近現代リーダーデータ ---
// 任意の画像URL（または相対パス "images/hitler.png" など）を指定できます
const leaders = [
  { 
    name: "マハトマ・ガンディー", 
    rank: "SSR", 
    desc: "インド独立の父（非暴力・不服従）", 
    imgUrl: "https://upload.wikimedia.org/wikipedia/commons/7/7a/Mahatma-Gandhi-studio-1931.jpg",
    color: "#ffd700" // 金色
  },
  { 
    name: "ウインストン・チャーチル", 
    rank: "SR", 
    desc: "第二次大戦を率いたイギリス首相", 
    imgUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bc/Sir_Winston_Churchill_1945.jpg",
    color: "#c0c0c0" // 銀色
  },
  { 
    name: "シャルル・ド・ゴール", 
    rank: "R", 
    desc: "自由フランスを率いた陸軍軍人・大統領", 
    imgUrl: "https://upload.wikimedia.org/wikipedia/commons/5/58/Charles_de_Gaulle_1961.jpg",
    color: "#cd7f32" // 銅色
  }
];

// --- 2. 3Dシーン初期化 ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 7);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// ライティング
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const pointLight = new THREE.PointLight(0xffd700, 2, 10);
pointLight.position.set(0, 0, 2);
scene.add(pointLight);

// --- 3. 動的カードテクスチャ生成関数 (Canvasによる自動描画) ---
function createCardTexture(leader, callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // 1. ベース背景
  ctx.fillStyle = '#111625';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. 偉人画像描画
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = leader.imgUrl;

  img.onload = () => {
    const imgX = 30, imgY = 80, imgW = 452, imgH = 460;
    
    // アスペクト比維持処理
    const imgRatio = img.width / img.height;
    const boxRatio = imgW / imgH;
    let sW = img.width, sH = img.height, sX = 0, sY = 0;

    if (imgRatio > boxRatio) {
      sW = img.height * boxRatio;
      sX = (img.width - sW) / 2;
    } else {
      sH = img.width / boxRatio;
      sY = (img.height - sH) / 2;
    }

    ctx.drawImage(img, sX, sY, sW, sH, imgX, imgY, imgW, imgH);

    // 画像の内側枠線
    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 4;
    ctx.strokeRect(imgX, imgY, imgW, imgH);

    // 3. カード外枠フレーム
    ctx.lineWidth = 16;
    ctx.strokeStyle = leader.color;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    // 4. 左上のレア度バッジ
    ctx.fillStyle = leader.color;
    ctx.beginPath();
    ctx.arc(60, 60, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leader.rank, 60, 60);

    // 5. 下部テキストエリア
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(30, 555, 452, 175);
    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 555, 452, 175);

    // 6. 偉人の名前（太字）
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(leader.name, 256, 595);

    // 7. 説明文
    ctx.fillStyle = '#cccccc';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(leader.desc, 256, 650);

    // テクスチャ化して返却
    const texture = new THREE.CanvasTexture(canvas);
    callback(texture);
  };
}

// --- 4. 3Dオブジェクト構築 ---
const mainGroup = new THREE.Group();
scene.add(mainGroup);

const packGroup = new THREE.Group();
mainGroup.add(packGroup);

const packMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.4, roughness: 0.3 });

// パック本体 (下部)
const packBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 0.15), packMat);
packBody.position.set(0, -0.4, 0.1);
packGroup.add(packBody);

// パック切り取り部分 (上部)
const packTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.15), packMat);
packTop.position.set(0, 1.4, 0.1);
packGroup.add(packTop);

// 切り取り線
const cutLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, 1.1, 0.18), new THREE.Vector3(1.3, 1.1, 0.18)]),
  new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.1, gapSize: 0.1 })
);
cutLine.computeLineDistances();
packGroup.add(cutLine);

// 3Dカードメッシュ
const cardGeo = new THREE.BoxGeometry(2.2, 3.2, 0.05);
const backMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.5, roughness: 0.5 });
let frontMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

const cardMaterials = [
  backMat, backMat, backMat, backMat, frontMat, backMat
];

const card = new THREE.Mesh(cardGeo, cardMaterials);
card.position.set(0, -0.4, 0); // パック内部
card.scale.set(0.9, 0.9, 0.9);
card.visible = false;
mainGroup.add(card);

// キラキラ粒子
const particleCount = 80;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) particlePos[i] = (Math.random() - 0.5) * 8;
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({ size: 0.06, color: 0xffd700, transparent: true, opacity: 0 });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- 5. スワイプ / 開封処理 ---
let isDragging = false, startX = 0, startY = 0, isOpened = false;
const instruction = document.getElementById('instruction');
const resultText = document.getElementById('result-text');
const resetBtn = document.getElementById('reset-btn');

function onPointerDown(e) {
  if (isOpened) return;
  isDragging = true;
  startX = e.clientX || (e.touches && e.touches[0].clientX);
  startY = e.clientY || (e.touches && e.touches[0].clientY);
}

function onPointerMove(e) {
  if (!isDragging || isOpened) return;
  const currentX = e.clientX || (e.touches && e.touches[0].clientX);
  const currentY = e.clientY || (e.touches && e.touches[0].clientY);
  const deltaX = currentX - startX;
  const deltaY = Math.abs(currentY - startY);

  if (Math.abs(deltaX) > 100 && deltaY < 80) {
    isDragging = false;
    openPack(deltaX > 0 ? 1 : -1);
  }
}

function onPointerUp() { isDragging = false; }

window.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
window.addEventListener('touchstart', onPointerDown);
window.addEventListener('touchmove', onPointerMove);
window.addEventListener('touchend', onPointerUp);

function openPack(direction) {
  isOpened = true;
  instruction.style.display = 'none';

  const picked = leaders[Math.floor(Math.random() * leaders.length)];

  // テクスチャを生成してカード表面へセット
  createCardTexture(picked, (texture) => {
    cardMaterials[4] = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3 });
    card.material = cardMaterials;

    const tl = gsap.timeline({
      onComplete: () => {
        resultText.innerHTML = `<span style="color:${picked.color}">【${picked.rank}】${picked.name}</span><br><small>${picked.desc}</small>`;
        resetBtn.style.display = 'inline-block';
      }
    });

    cutLine.visible = false;
    tl.to(packTop.position, { x: direction * 4, y: 2.5, z: -2, duration: 0.6, ease: "power2.out" })
      .to(packTop.rotation, { z: -direction * Math.PI * 2, duration: 0.6 }, "<")
      .call(() => {
        card.visible = true;
        pointLight.color.setHex(picked.color);
      }, null, "-=0.2")
      .to(card.position, { y: 1.2, z: 0.3, duration: 0.6, ease: "power2.out" })
      .to(packBody.position, { y: -4, duration: 0.5, ease: "power2.in" }, "+=0.1")
      .to(card.position, { y: 0, z: 2, duration: 0.8, ease: "back.out(1.2)" }, "<")
      .to(card.scale, { x: 1, y: 1, z: 1, duration: 0.8 }, "<")
      .to(card.rotation, { y: Math.PI * 6, duration: 1.0, ease: "power2.inOut" }, "<")
      .to(particleMat, { opacity: 1, duration: 0.4 }, "<")
      .to(particles.rotation, { y: Math.PI, duration: 1.0 }, "<")
      .to(particleMat, { opacity: 0, duration: 0.6 });
  });
}

// リセット処理
resetBtn.addEventListener('click', () => {
  isOpened = false;
  resetBtn.style.display = 'none';
  instruction.style.display = 'block';
  resultText.innerText = '';

  packGroup.visible = true;
  packTop.position.set(0, 1.4, 0.1);
  packTop.rotation.set(0, 0, 0);
  packBody.position.set(0, -0.4, 0.1);
  cutLine.visible = true;

  card.visible = false;
  card.position.set(0, -0.4, 0);
  card.scale.set(0.9, 0.9, 0.9);
  card.rotation.set(0, 0, 0);
});

// 描画ループ
function animate() {
  requestAnimationFrame(animate);
  if (!isOpened) {
    mainGroup.rotation.y = Math.sin(Date.now() * 0.0015) * 0.1;
    mainGroup.rotation.x = Math.cos(Date.now() * 0.001) * 0.05;
  } else if (card.visible) {
    card.rotation.y += 0.003;
  }
  renderer.render(scene, camera);
}

animate();

// リサイズ対応
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
