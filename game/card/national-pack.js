(function () {
  'use strict';

  var config = window.cardNationConfig;
  if (!config || !Array.isArray(config.leaders) || !config.leaders.length) {
    throw new Error('国家カードの設定を読み込めませんでした');
  }

  document.body.classList.add('national-pack');
  document.body.style.setProperty('--nation-color', config.color);
  var container = document.getElementById('canvas-container');
  var instruction = document.getElementById('instruction');
  var resultText = document.getElementById('result-text');
  var resetButton = document.getElementById('reset-btn');
  var zukanGrid = document.getElementById('zukan-grid');
  var unlockedKey = config.id.toLowerCase() + '_unlocked_cards';
  var unlockedCards = JSON.parse(localStorage.getItem(unlockedKey) || '[]');

  function unlockCard(id) {
    if (!unlockedCards.includes(id)) {
      unlockedCards.push(id);
      localStorage.setItem(unlockedKey, JSON.stringify(unlockedCards));
    }
  }

  window.unlockCard = unlockCard;

  function renderZukan() {
    zukanGrid.innerHTML = '';
    leaders.forEach(function (leader) {
      var unlocked = unlockedCards.includes(leader.id);
      var element = document.createElement('div');
      element.className = 'zukan-card ' + (unlocked ? 'unlocked' : 'locked');
      element.style.setProperty('--card-frame-color', CardFrames.colorOf(leader));
      element.innerHTML = '<img src="' + leader.imgUrl + '" alt="' + (unlocked ? leader.name : '') + '">' +
        '<div class="' + (unlocked ? 'card-info' : 'lock-label') + '">' +
        (unlocked ? leader.rank + ' ' + leader.name : '未獲得') + '</div>';
      CardFrames.decorateZukan(element, leader);
      zukanGrid.appendChild(element);
    });
  }

  document.getElementById('zukan-btn').addEventListener('click', function () {
    renderZukan();
    document.getElementById('zukan-modal').style.display = 'flex';
  });
  document.getElementById('zukan-close-btn').addEventListener('click', function () {
    document.getElementById('zukan-modal').style.display = 'none';
  });
  document.getElementById('zukan-modal').addEventListener('click', function (event) {
    if (event.target.id === 'zukan-modal') event.currentTarget.style.display = 'none';
  });

  function showCard(leader) {
    resultText.innerHTML = '';
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'drawn-card';
    card.style.setProperty('--card-frame-color', CardFrames.colorOf(leader));
    var image = document.createElement('img');
    image.src = leader.imgUrl;
    image.alt = leader.name;
    var category = document.createElement('span');
    category.className = 'drawn-category';
    category.textContent = CardFrames.labelOf(leader);
    var name = document.createElement('strong');
    name.textContent = leader.rank + ' ' + leader.name;
    var hint = document.createElement('small');
    hint.textContent = 'カードを選んで詳細・クイズを見る';
    card.append(image, category, name, hint);
    card.addEventListener('click', function () {
      if (typeof window.openCardDetail === 'function') window.openCardDetail(leader);
    });
    resultText.appendChild(card);
    instruction.textContent = 'カードを選ぶと詳細やクイズを確認できます';
    resetButton.style.display = 'inline-block';
  }

  function createZigZagShape(width, height, teethCount, toothDepth) {
    var shape = new THREE.Shape();
    var halfWidth = width / 2;
    var toothWidth = width / teethCount;
    shape.moveTo(-halfWidth, 0);
    for (var i = 0; i < teethCount; i++) {
      shape.lineTo(-halfWidth + i * toothWidth + toothWidth / 2, toothDepth);
      shape.lineTo(-halfWidth + (i + 1) * toothWidth, 0);
    }
    shape.lineTo(halfWidth, -height);
    shape.lineTo(-halfWidth, -height);
    shape.closePath();
    return shape;
  }

  function createPackBodyTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    var context = canvas.getContext('2d');
    var gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.45, config.color);
    gradient.addColorStop(1, config.color);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255,255,255,.9)';
    context.lineWidth = 8;
    context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
    context.strokeStyle = 'rgba(255,255,255,.5)';
    context.lineWidth = 4;
    context.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);

    var texture = new THREE.CanvasTexture(canvas);
    var icon = new Image();
    icon.onload = function () {
      var size = 210;
      context.drawImage(icon, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
      texture.needsUpdate = true;
    };
    icon.onerror = function () {
      console.error('国家パックのアイコンを読み込めませんでした:', config.icon);
    };
    icon.src = config.icon;
    return texture;
  }

  function createPackTopTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    var context = canvas.getContext('2d');
    var gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#e8e8ed');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#333';
    context.lineWidth = 8;
    context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
    return new THREE.CanvasTexture(canvas);
  }

  var renderer;
  var pack;
  var rotationFrame;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 8);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(-3, 5, 8);
    light.castShadow = true;
    scene.add(light);
    scene.add(new THREE.DirectionalLight(0xd0d5dd, 0.35));

    pack = new THREE.Group();
    scene.add(pack);
    var packBaseMaterial = new THREE.MeshPhysicalMaterial({
      color: config.color,
      roughness: 0.45,
      metalness: 0.05,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4
    });
    var packBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.18), packBaseMaterial);
    packBody.position.set(0, -0.3, 0.09);
    packBody.castShadow = true;
    packBody.receiveShadow = true;
    pack.add(packBody);

    var bodyFrontMaterial = new THREE.MeshPhysicalMaterial({
      map: createPackBodyTexture(),
      roughness: 0.4,
      clearcoat: 0.25
    });
    packBody.material = [packBaseMaterial, packBaseMaterial, packBaseMaterial, packBaseMaterial, bodyFrontMaterial, packBaseMaterial];

    var topGroup = new THREE.Group();
    topGroup.position.set(0, 1.4, 0.09);
    pack.add(topGroup);
    var topBlock = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.18), packBaseMaterial);
    topBlock.position.y = 0.25;
    topBlock.castShadow = true;
    topGroup.add(topBlock);
    var topFrontMaterial = new THREE.MeshPhysicalMaterial({
      map: createPackTopTexture(),
      roughness: 0.4,
      clearcoat: 0.25
    });
    topBlock.material = [packBaseMaterial, packBaseMaterial, packBaseMaterial, packBaseMaterial, topFrontMaterial, packBaseMaterial];

    var toothGeometry = new THREE.ExtrudeGeometry(
      createZigZagShape(2.6, 0.3, 26, 0.12),
      { depth: 0.04, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 }
    );
    toothGeometry.center();
    var tooth = new THREE.Mesh(toothGeometry, packBaseMaterial);
    tooth.position.set(0, 0.65, 0);
    tooth.castShadow = true;
    topGroup.add(tooth);

    var cutLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, 1.4, 0.19), new THREE.Vector3(1.3, 1.4, 0.19)]),
      new THREE.LineDashedMaterial({ color: 0x333333, dashSize: 0.08, gapSize: 0.06 })
    );
    cutLine.computeLineDistances();
    pack.add(cutLine);

    var shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.15 })
    );
    shadowPlane.position.z = -0.5;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    function animate() {
      rotationFrame = requestAnimationFrame(animate);
      if (!pack.userData.opening) pack.rotation.y = Math.sin(Date.now() / 1500) * 0.12;
      renderer.render(scene, camera);
    }
    animate();
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  } catch (error) {
    console.error('カードパックの3D表示を初期化できませんでした:', error);
    instruction.textContent = '3D表示を利用できませんが、購入ボタンから開封できます';
  }

  function openPack(count) {
    count = count || 1;
    var cost = count * 100;
    if (!window.CardShop || !window.CardShop.spendCoins(cost)) {
      instruction.textContent = 'コインが足りません！クイズで獲得できます';
      return;
    }
    var leader = leaders[Math.floor(Math.random() * leaders.length)];
    unlockCard(leader.id);
    showCard(leader);
    if (pack && window.gsap) {
      pack.userData.opening = true;
      window.gsap.to(pack.rotation, {
        y: Math.PI * 2,
        duration: 0.8,
        onComplete: function () {
          pack.rotation.y = 0;
          pack.userData.opening = false;
        }
      });
    }
    if (window.CardShop) window.CardShop.updateCoinDisplay();
  }

  window.openPack = openPack;

  resetButton.addEventListener('click', function () {
    resultText.innerHTML = '';
    instruction.textContent = 'パックを購入して開封！';
    resetButton.style.display = 'none';
  });
  document.getElementById('light-btn').addEventListener('click', function (event) {
    if (!renderer) return;
    var off = event.currentTarget.classList.toggle('off');
    event.currentTarget.textContent = '光源: ' + (off ? 'OFF' : 'ON');
    renderer.domElement.style.filter = off ? 'brightness(.7)' : '';
  });

  window.addEventListener('beforeunload', function () {
    if (rotationFrame) cancelAnimationFrame(rotationFrame);
  });
})();
