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
    rank: "R", 
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
  }
];
// --- 2. 3Dシーン初期化 ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 7.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const pointLight = new THREE.PointLight(0xffffd0, 1.5, 10);
pointLight.position.set(0, 0, 2);
scene.add(pointLight);

// --- 3. パックテクスチャ生成 (マットホワイト＆ギザギザ加工) ---
function createPackBodyTexture(callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f5f5f7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 下端のギザギザ (鋸歯)
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  const teeth = 32;
  const toothWidth = canvas.width / teeth;
  const toothHeight = 16;
  ctx.moveTo(0, canvas.height);
  for (let i = 0; i <= teeth; i++) {
    const x = i * toothWidth;
    const y = (i % 2 === 0) ? canvas.height : canvas.height - toothHeight;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#d0d0d5';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

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

  ctx.fillStyle = '#f5f5f7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 上端のギザギザ (鋸歯)
  ctx.fillStyle = '#121212';
  ctx.beginPath();
  const teeth = 32;
  const toothWidth = canvas.width / teeth;
  const toothHeight = 16;
  ctx.moveTo(0, 0);
  for (let i = 0; i <= teeth; i++) {
    const x = i * toothWidth;
    const y = (i % 2 === 0) ? 0 : toothHeight;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(canvas.width, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#d0d0d5';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  return new THREE.CanvasTexture(canvas);
}

// --- 4. 動的カードテクスチャ生成 (角丸・立体色・自動改行) ---
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

function createCardTexture(leader, callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // 立体感のある背景グラデーション
  const bgGrad = ctx.createRadialGradient(256, 384, 50, 256, 384, 400);
  bgGrad.addColorStop(0, '#2a2e3d');
  bgGrad.addColorStop(0.7, '#12151e');
  bgGrad.addColorStop(1, '#080a0f');
  
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 24);
  ctx.stroke();

  const renderCardContent = (img) => {
    const imgX = 35, imgY = 85, imgW = 442, imgH = 440, radius = 16;

    ctx.save();
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, radius);
    ctx.clip();

    if (img) {
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
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(imgX, imgY, imgW, imgH);
      ctx.fillStyle = '#aaa';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NO IMAGE', 256, 300);
    }
    ctx.restore();

    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, imgX, imgY, imgW, imgH, radius);
    ctx.stroke();

    ctx.lineWidth = 14;
    ctx.strokeStyle = leader.color;
    drawRoundedRect(ctx, 12, 12, canvas.width - 24, canvas.height - 24, 28);
    ctx.stroke();

    ctx.fillStyle = leader.color;
    ctx.beginPath();
    ctx.arc(65, 65, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leader.rank, 65, 65);

    const textAreaX = 35, textAreaY = 545, textAreaW = 442, textAreaH = 185;
    const textAreaGrad = ctx.createLinearGradient(0, textAreaY, 0, textAreaY + textAreaH);
    textAreaGrad.addColorStop(0, 'rgba(20, 20, 28, 0.92)');
    textAreaGrad.addColorStop(1, 'rgba(5, 5, 10, 0.95)');

    ctx.fillStyle = textAreaGrad;
    drawRoundedRect(ctx, textAreaX, textAreaY, textAreaW, textAreaH, 12);
    ctx.fill();

    ctx.strokeStyle = leader.color;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, textAreaX, textAreaY, textAreaW, textAreaH, 12);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(leader.name, 256, 585);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(55, 600);
    ctx.lineTo(457, 600);
    ctx.stroke();

    ctx.fillStyle = '#dddddd';
    ctx.font = '19px sans-serif';
    ctx.textAlign = 'center';
    wrapText(ctx, leader.desc, 256, 630, 410, 26);

    callback(new THREE.CanvasTexture(canvas));
  };

  const img = new Image();
  img.src = leader.imgUrl;
  img.onload = () => renderCardContent(img);
  img.onerror = () => renderCardContent(null);
}

// --- 5. 3Dオブジェクト構築 ---
const mainGroup = new THREE.Group();
scene.add(mainGroup);

const packGroup = new THREE.Group();
mainGroup.add(packGroup);

const packBaseMat = new THREE.MeshPhysicalMaterial({ 
  color: 0xf2f2f5, 
  roughness: 0.45, 
  metalness: 0.05, 
  clearcoat: 0.3, 
  clearcoatRoughness: 0.4
});

const packBody = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.4, 0.12), packBaseMat);
packBody.position.set(0, -0.3, 0.1);
packGroup.add(packBody);

const packTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 0.12), packBaseMat);
packTop.position.set(0, 1.75, 0.1);
packGroup.add(packTop);

createPackBodyTexture((bodyTexture) => {
  const bodyFrontMat = new THREE.MeshPhysicalMaterial({ map: bodyTexture, roughness: 0.45, clearcoat: 0.3 });
  packBody.material = [packBaseMat, packBaseMat, packBaseMat, packBaseMat, bodyFrontMat, packBaseMat];
});

const topTexture = createPackTopTexture();
const topFrontMat = new THREE.MeshPhysicalMaterial({ map: topTexture, roughness: 0.45, clearcoat: 0.3 });
packTop.material = [packBaseMat, packBaseMat, packBaseMat, packBaseMat, topFrontMat, packBaseMat];

const cutLineMat = new THREE.LineDashedMaterial({ 
  color: 0x00e5ff, 
  dashSize: 0.1, 
  gapSize: 0.08,
  linewidth: 2 
});
const cutLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.25, 1.4, 0.17), new THREE.Vector3(1.25, 1.4, 0.17)]),
  cutLineMat
);
cutLine.computeLineDistances();
packGroup.add(cutLine);

const cutHitBox = new THREE.Mesh(
  new THREE.BoxGeometry(2.7, 0.6, 0.5),
  new THREE.MeshBasicMaterial({ visible: false })
);
cutHitBox.position.set(0, 1.4, 0.17);
packGroup.add(cutHitBox);

const cardGeo = new THREE.BoxGeometry(2.2, 3.2, 0.05);
const backMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.5, roughness: 0.5 });
let frontMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

const cardMaterials = [backMat, backMat, backMat, backMat, frontMat, backMat];
const card = new THREE.Mesh(cardGeo, cardMaterials);
card.position.set(0, -0.3, 0);
card.scale.set(0.9, 0.9, 0.9);
card.visible = false;
mainGroup.add(card);

const particleCount = 80;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount * 3; i++) particlePos[i] = (Math.random() - 0.5) * 8;
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({ size: 0.06, color: 0xffd700, transparent: true, opacity: 0 });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- 6. ペルソナ5風カットイン再生機能 (右スライドイン＆表示時間長め) ---
function playP5CutIn(cutinImgUrl, onCompleteCallback) {
  const overlay = document.getElementById('cutin-overlay');
  const banner = document.getElementById('cutin-banner');
  const img = document.getElementById('cutin-img');

  img.src = cutinImgUrl;
  overlay.style.display = 'block';

  const tl = gsap.timeline({
    onComplete: () => {
      overlay.style.display = 'none';
      if (onCompleteCallback) onCompleteCallback();
    }
  });

  // 1. 画面右外 (xPercent: 100) から中央へ一気にスライドイン
  tl.fromTo(banner, 
    { xPercent: 100, opacity: 0 }, 
    { xPercent: 0, opacity: 1, duration: 0.25, ease: "power4.out" }
  )
  .fromTo(img, 
    { scale: 2.2, x: 100 }, 
    { scale: 1.0, x: 0, duration: 0.3, ease: "back.out(1.4)" }, 
    "<"
  )
  // 2. 表示時間のキープ (1.2秒間)
  .to(banner, { duration: 1.2 })
  // 3. 画面左外 (xPercent: -100) へ切り抜けるようにスライドアウト
  .to(banner, { xPercent: -100, opacity: 0, duration: 0.2, ease: "power3.in" });
}

// --- 7. Raycaster & スワイプ処理 ---
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

    tl.to(packTop.position, { x: direction * 4, y: 3.0, z: -2, duration: 0.6, ease: "power2.out" })
      .to(packTop.rotation, { z: -direction * Math.PI * 2, duration: 0.6 }, "<")
      .call(() => {
        if (picked.rank === "SSR" && picked.cutinUrl) {
          tl.pause();
          playP5CutIn(picked.cutinUrl, () => {
            tl.resume();
          });
        }

        card.visible = true;
        pointLight.color.setHex(picked.color);
      }, null, "-=0.2")
      .to(card.position, { y: 1.3, z: 0.3, duration: 0.6, ease: "power2.out" })
      .to(packBody.position, { y: -4.5, duration: 0.5, ease: "power2.in" }, "+=0.1")
      .to(card.position, { y: 0, z: 2, duration: 0.8, ease: "back.out(1.2)" }, "<")
      .to(card.scale, { x: 1, y: 1, z: 1, duration: 0.8 }, "<")
      .to(card.rotation, { y: Math.PI * 6, duration: 1.0, ease: "power2.inOut" }, "<")
      .to(particleMat, { opacity: 1, duration: 0.4 }, "<")
      .to(particles.rotation, { y: Math.PI, duration: 1.0 }, "<")
      .to(particleMat, { opacity: 0, duration: 0.6 });
  });
}

resetBtn.addEventListener('click', () => {
  isOpened = false;
  resetBtn.style.display = 'none';
  instruction.style.display = 'block';
  resultText.innerText = '';

  packGroup.visible = true;
  packTop.position.set(0, 1.75, 0.1);
  packTop.rotation.set(0, 0, 0);
  packBody.position.set(0, -0.3, 0.1);
  cutLine.visible = true;

  card.visible = false;
  card.position.set(0, -0.3, 0);
  card.scale.set(0.9, 0.9, 0.9);
  card.rotation.set(0, 0, 0);
});

function animate() {
  requestAnimationFrame(animate);

  if (!isOpened) {
    const time = Date.now() * 0.005;
    const glow = (Math.sin(time) + 1) / 2;
    cutLineMat.color.setHSL(0.5, 1.0, 0.3 + glow * 0.4);

    mainGroup.rotation.y = Math.sin(Date.now() * 0.0015) * 0.08;
    mainGroup.rotation.x = Math.cos(Date.now() * 0.001) * 0.04;
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
