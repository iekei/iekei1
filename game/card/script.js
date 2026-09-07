// --- 1. リーダーデータ (指定の画像パスに変更) ---
const leaders = [
  { 
    name: "アドルフ・ヒトラー", 
    rank: "SSR", 
    desc: "ナチス・ドイツ最高指導者", 
    imgUrl: "data/image/nazi/hitler.png",
    color: "#ffd700" 
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

// ライティング (白パックのツヤ感を出す調整)
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const pointLight = new THREE.PointLight(0xffd700, 2, 10);
pointLight.position.set(0, 0, 2);
scene.add(pointLight);

// --- 3. パック表紙テクスチャ生成 (白いツヤ地 + 中央アイコン) ---
function createPackTexture(callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // 白ベースの背景グラデーション
  const grad = ctx.createLinearGradient(0, 0, 512, 768);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, '#f0f0f0');
  grad.addColorStop(1, '#e0e0e0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 金色の枠線
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  // 中央アイコンの読み込み (data/image/icon/nazi.png)
  const iconImg = new Image();
  iconImg.src = 'data/image/icon/nazi.png';
  
  iconImg.onload = () => {
    const size = 200;
    ctx.drawImage(iconImg, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
    callback(new THREE.CanvasTexture(canvas));
  };

  iconImg.onerror = () => {
    // 画像読み込み失敗時のフォールバック描画
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PACK', canvas.width / 2, canvas.height / 2);
    callback(new THREE.CanvasTexture(canvas));
  };
}

// --- 4. 動的カードテクスチャ生成関数 ---
function createCardTexture(leader, callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#111625';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = new Image();
  img.src = leader.imgUrl;

  img.onload = () => {
    const imgX = 30, imgY = 80, imgW = 452, imgH = 460;
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

    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 4;
    ctx.strokeRect(imgX, imgY, imgW, imgH);

    ctx.lineWidth = 16;
    ctx.strokeStyle = leader.color;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.fillStyle = leader.color;
    ctx.beginPath();
    ctx.arc(60, 60, 35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leader.rank, 60, 60);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(30, 555, 452, 175);
    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 555, 452, 175);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(leader.name, 256, 595);

    ctx.fillStyle = '#cccccc';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(leader.desc, 256, 650);

    callback(new THREE.CanvasTexture(canvas));
  };
}

// --- 5. 3Dオブジェクト構築 ---
const mainGroup = new THREE.Group();
scene.add(mainGroup);

const packGroup = new THREE.Group();
mainGroup.add(packGroup);

// ツヤ感のある白色マテリアル (MeshPhysicalMaterial)
const packMat = new THREE.MeshPhysicalMaterial({ 
  color: 0xffffff, 
  roughness: 0.1, 
  metalness: 0.1,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1
});

// パック本体 (下部)
const packBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 0.15), packMat);
packBody.position.set(0, -0.4, 0.1);
packGroup.add(packBody);

// パック切り取り部分 (上部)
const packTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.15), packMat);
packTop.position.set(0, 1.4, 0.1);
packGroup.add(packTop);

// 表紙テクスチャのアタッチ
createPackTexture((texture) => {
  const frontPackMat = new THREE.MeshPhysicalMaterial({ 
    map: texture, 
    roughness: 0.1, 
    clearcoat: 1.0 
  });
  // 前面にテクスチャを設定
  packBody.material = [packMat, packMat, packMat, packMat, frontPackMat, packMat];
  packTop.material = [packMat, packMat, packMat, packMat, frontPackMat, packMat];
});

// 発光する切り取り破線
const cutLineMat = new THREE.LineDashedMaterial({ 
  color: 0x00ffff, 
  dashSize: 0.1, 
  gapSize: 0.08,
  linewidth: 2 
});
const cutLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, 1.1, 0.18), new THREE.Vector3(1.3, 1.1, 0.18)]),
  cutLineMat
);
cutLine.computeLineDistances();
packGroup.add(cutLine);

// 当たり判定専用の不可視ヒットボックス
const cutHitBox = new THREE.Mesh(
  new THREE.BoxGeometry(2.8, 0.5, 0.5),
  new THREE.MeshBasicMaterial({ visible: false })
);
cutHitBox.position.set(0, 1.1, 0.18);
packGroup.add(cutHitBox);

// 3Dカードメッシュ
const cardGeo = new THREE.BoxGeometry(2.2, 3.2, 0.05);
const backMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.5, roughness: 0.5 });
let frontMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

const cardMaterials = [backMat, backMat, backMat, backMat, frontMat, backMat];
const card = new THREE.Mesh(cardGeo, cardMaterials);
card.position.set(0, -0.4, 0);
card.scale.set(0.9, 0.9, 0.9);
card.visible = false;
mainGroup.add(card);

// パーティクル
const particleCount = 80;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) particlePos[i] = (Math.random() - 0.5) * 8;
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({ size: 0.06, color: 0xffd700, transparent: true, opacity: 0 });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- 6. Raycasterによる当たり判定＆スワイプ処理 ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let isDragging = false, startX = 0, startY = 0, isOpened = false;
const instruction = document.getElementById('instruction');
const resultText = document.getElementById('result-text');
const resetBtn = document.getElementById('reset-btn');

function checkIntersection(clientX, clientY) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(cutHitBox);
  return intersects.length > 0;
}

function onPointerDown(e) {
  if (isOpened) return;
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);

  // 破線エリアをタップ/クリックした時のみスワイプを受け付ける
  if (checkIntersection(clientX, clientY)) {
    isDragging = true;
    startX = clientX;
    startY = clientY;
  }
}

function onPointerMove(e) {
  if (!isDragging || isOpened) return;
  const currentX = e.clientX || (e.touches && e.touches[0].clientX);
  const currentY = e.clientY || (e.touches && e.touches[0].clientY);
  const deltaX = currentX - startX;
  const deltaY = Math.abs(currentY - startY);

  if (Math.abs(deltaX) > 80 && deltaY < 60) {
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

// 描画ループ（破線の発光アニメーション含む）
function animate() {
  requestAnimationFrame(animate);

  // 破線の発光（シアン〜青系の脈動効果）
  if (!isOpened) {
    const time = Date.now() * 0.005;
    const glow = (Math.sin(time) + 1) / 2;
    cutLineMat.color.setHSL(0.5, 1.0, 0.3 + glow * 0.4);

    mainGroup.rotation.y = Math.sin(Date.now() * 0.0015) * 0.1;
    mainGroup.rotation.x = Math.cos(Date.now() * 0.001) * 0.05;
  } else if (card.visible) {
    card.rotation.y += 0.003;
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
