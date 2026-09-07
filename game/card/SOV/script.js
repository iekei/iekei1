// --- 1. ソビエト連邦 リーダーデータ ---
const leaders = [
{ 
  name: "ヨシフ・スターリン", 
  rank: "SSR", 
  desc: "ソ連共産党書記長。急速な工業化と大粛清により絶対的な権力を確立し、独裁体制を敷いた最高指導者。", 
  imgUrl: "data/image/sov/stalin.png",
  cutinUrl: "data/image/cut/stalin.png", // カットイン用画像パス
  color: "#CC0000" 
},
{ 
  name: "ヴャチェスラフ・モロトフ", 
  rank: "SR", 
  desc: "人民委員会議議長（首相）。スターリンの忠実な最側近であり、外交と政権運営を支えた実質的ナンバー2。", 
  imgUrl: "data/image/sov/molotov.png",
  cutinUrl: null,
  color: "#8B0000" 
},
{ 
  name: "レオン・トロツキー", 
  rank: "SSR", 
  desc: "赤軍の創設者。国外追放後も永続革命論を掲げ、反スターリン派の象徴的指導者として影響力を持ち続けた。", 
  imgUrl: "data/image/sov/trotsky.png",
  cutinUrl: "data/image/cut/trotsky.png",
  cutinOffset: "center 75%",
  color: "#D2691E" 
},
{ 
  name: "ミハイル・トゥハチェフスキー", 
  rank: "SSR", 
  desc: "ソ連元帥。「赤軍のナポレオン」と称された戦略家。軍の近代化を推進し、軍事クーデターの指導者候補とされる。", 
  imgUrl: "data/image/sov/tukhachevsky.png",
  cutinUrl: "data/image/cut/tukhachevsky.png",
  cutinOffset: "center 10%",
  color: "#4B5320" 
},
{ 
  name: "ニコライ・イェジョフ", 
  rank: "SR", 
  desc: "内務人民委員（NKVD長官）。大粛清の実行者として秘密警察の暴力装置を掌握し、暗部から権力を振るった。", 
  imgUrl: "data/image/sov/yezhov.png",
  cutinUrl: null,
  color: "#2A2A2A" 
},
{ 
  name: "ニコライ・ブハーリン", 
  rank: "SR", 
  desc: "党の理論家にして右翼反対派の指導者。急進的な工業化に反対し、温和な経済政策の継続を訴えた。", 
  imgUrl: "data/image/sov/bukharin.png",
  cutinUrl: null,
  color: "#DAA520" 
},
{ 
  name: "セルゴ・オルジョニキゼ", 
  rank: "SR", 
  desc: "重工業人民委員。五カ年計画の重工業化を成功させた立役者であり、党内で屈指の人望を集めた重鎮。", 
  imgUrl: "data/image/sov/ordzhonikidze.png",
  cutinUrl: null,
  color: "#B8860B" 
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

const pointLight = new THREE.PointLight(0xffd700, 1.5, 10);
pointLight.position.set(0, 0, 2);
scene.add(pointLight);

// --- 3. ソ連パック表紙テクスチャ生成 (真紅×金のマットデザイン) ---
function createPackBodyTexture(callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');

  // 深みのある赤色ベース
  ctx.fillStyle = '#8b0000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 下端のギザギザ
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

  // 金色の装飾枠線
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  const iconImg = new Image();
  iconImg.src = 'data/image/icon/soviet.png';

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

  ctx.fillStyle = '#8b0000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  return new THREE.CanvasTexture(canvas);
}

// --- 4. 動的カードテクスチャ生成 ---
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

  const bgGrad = ctx.createRadialGradient(256, 384, 50, 256, 384, 400);
  bgGrad.addColorStop(0, '#3a1c1c');
  bgGrad.addColorStop(0.7, '#1a0808');
  bgGrad.addColorStop(1, '#080202');
  
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
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
    textAreaGrad.addColorStop(0, 'rgba(28, 15, 15, 0.92)');
    textAreaGrad.addColorStop(1, 'rgba(10, 5, 5, 0.95)');

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

    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
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
  color: 0x8b0000, 
  roughness: 0.45, 
  metalness: 0.1, 
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
  color: 0xffd700, 
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
const backMat = new THREE.MeshStandardMaterial({ color: 0x221111, metalness: 0.5, roughness: 0.5 });
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
// 引数に cutinOffset を追加
function playP5CutIn(cutinImgUrl, offset, onCompleteCallback) {
  const overlay = document.getElementById('cutin-overlay');
  const banner = document.getElementById('cutin-banner');
  const img = document.getElementById('cutin-img');

  img.src = cutinImgUrl;
  
  // 個別指定があればそれを使い、なければデフォルトの "center 30%"（目元位置）を使う
  img.style.objectPosition = offset || "center 30%";

  overlay.style.display = 'block';

  gsap.set(img, { transformOrigin: "center 35%" });

  const tl = gsap.timeline({
    onComplete: () => {
      overlay.style.display = 'none';
      if (onCompleteCallback) onCompleteCallback();
    }
  });

  tl.fromTo(banner, 
    { xPercent: 100, opacity: 0 }, 
    { xPercent: 0, opacity: 1, duration: 0.25, ease: "power4.out" }
  )
  .fromTo(img, 
    { scale: 2.2, x: 100 }, 
    { scale: 1.0, x: 0, duration: 0.3, ease: "back.out(1.4)" }, 
    "<"
  )
  .to(banner, { duration: 1.2 })
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
      // openPack 関数内の該当部分
      if (picked.rank === "SSR" && picked.cutinUrl) {
        tl.pause();
        // 割当オフセット値を第2引数として渡す
        playP5CutIn(picked.cutinUrl, picked.cutinOffset, () => {
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
      .to(particles.rotation, { y: Math.PI }, "<")
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
    cutLineMat.color.setHSL(0.12, 1.0, 0.3 + glow * 0.4);

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
