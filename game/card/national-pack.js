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

  var renderer;
  var pack;
  var rotationFrame;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 8);
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    var light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-3, 5, 8);
    scene.add(light);

    pack = new THREE.Group();
    scene.add(pack);
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 3.2, 0.16),
      new THREE.MeshPhysicalMaterial({
        color: config.color,
        roughness: 0.28,
        metalness: 0.12,
        clearcoat: 0.8
      })
    );
    pack.add(body);
    var logo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    logo.position.z = 0.09;
    pack.add(logo);
    new THREE.TextureLoader().load(config.icon, function (texture) {
      logo.material.map = texture;
      logo.material.needsUpdate = true;
    });

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
