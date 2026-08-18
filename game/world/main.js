// 1. マップの初期化（無限ループ対応）
const map = L.map('map', {
  center: [30, 10],
  zoom: 3,
  minZoom: 2,
  maxZoom: 7,
  worldCopyJump: true
});

// ベースの暗黒世界地図タイル
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// 状態管理
let selectedCountry = 'SOV';
let isAddDivisionMode = false;

const countryColors = {
  'SOV': '#8b0000',
  'USA': '#1c39bb',
  'NONE': '#333333'
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'USA': 'アメリカ合衆国',
  'NONE': '中立/未支配'
};

// 2. 領土・海域データ
const territories = [
  {
    id: 'ter_moscow',
    name: 'モスクワ近郊',
    type: 'land',
    owner: 'SOV',
    resources: { 鉄: 45, アルミニウム: 12, 石油: 5 },
    coords: [[52, 30], [58, 30], [58, 42], [52, 42]]
  },
  {
    id: 'ter_urals',
    name: 'ウラル産業地帯',
    type: 'land',
    owner: 'SOV',
    resources: { 鉄: 120, クロム: 80, プレミアム資源: 15 },
    coords: [[50, 50], [62, 50], [62, 65], [50, 65]]
  },
  {
    id: 'ter_us_east',
    name: 'アメリカ東海岸',
    type: 'land',
    owner: 'USA',
    resources: { 石油: 90, 鉄: 60, ゴム: 10 },
    coords: [[30, -85], [45, -85], [45, -70], [30, -70]]
  },
  {
    id: 'sea_pacific_north',
    name: '北太平洋海域',
    type: 'sea',
    owner: 'USA',
    resources: { 漁獲量: '高', 通商路: '重要' },
    coords: [[20, 140], [50, 140], [50, -130], [20, -130]]
  }
];

// ポリゴン描画
territories.forEach(data => {
  const polygon = L.polygon(data.coords, {
    color: data.type === 'sea' ? '#3498db' : '#ffffff',
    weight: 1,
    fillColor: countryColors[data.owner],
    fillOpacity: data.type === 'sea' ? 0.3 : 0.5
  }).addTo(map);

  polygon.data = data;

  polygon.bindTooltip(() => {
    let resHTML = Object.entries(polygon.data.resources)
      .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
      .join('');

    return `
      <div>
        <strong>${polygon.data.name}</strong> (${polygon.data.type === 'sea' ? '海域' : '陸地'})<br/>
        支配国: <b>${countryNames[polygon.data.owner]}</b><br/>
        <div style="margin-top:4px;">${resHTML}</div>
      </div>
    `;
  }, { className: 'hoi4-tooltip', sticky: true });

  polygon.on('click', () => {
    if (isAddDivisionMode) return;
    polygon.data.owner = selectedCountry;
    polygon.setStyle({
      fillColor: countryColors[selectedCountry]
    });
  });
});

// 3. 地形 & 突破ライン
const river = L.polyline([
  [55, 37], [50, 40], [47, 39]
], { color: '#2ecc71', weight: 4, opacity: 0.8 }).addTo(map);
river.bindTooltip("大河川 (渡河攻撃にペナルティ -50%)", { className: 'hoi4-tooltip', sticky: true });

const mountain = L.polyline([
  [65, 59], [55, 60], [50, 58]
], { color: '#e67e22', weight: 6, dashArray: '5, 10' }).addTo(map);
mountain.bindTooltip("ウラル山脈 (移動コスト +200%)", { className: 'hoi4-tooltip', sticky: true });

const breakthroughArrow = L.polyline([
  [53, 28], [54, 33], [55, 37]
], { color: '#e74c3c', weight: 4, dashArray: '8, 8' }).addTo(map);
breakthroughArrow.bindTooltip("⚡ 装甲部隊の電撃戦・突破予測ルート", { className: 'hoi4-tooltip', sticky: true });

// 4. 師団マーカー機能
function createHelmetIcon() {
  return L.divIcon({
    className: 'helmet-marker',
    html: `🪖`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function addDivision(latlng, country) {
  const marker = L.marker(latlng, {
    icon: createHelmetIcon(),
    draggable: true
  }).addTo(map);

  marker.bindTooltip(`第${Math.floor(Math.random()*90)+1}師団 (${countryNames[country]})`, {
    className: 'hoi4-tooltip',
    direction: 'top'
  });
}

// 初期配置
addDivision([55, 37], 'SOV');
addDivision([38, -77], 'USA');

map.on('click', function(e) {
  if (isAddDivisionMode) {
    addDivision(e.latlng, selectedCountry);
    toggleAddDivisionMode();
  }
});

// 5. UI イベントハンドラ
function selectCountry(country) {
  selectedCountry = country;
  document.querySelectorAll('.country-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${country}`).classList.add('active');
}

function toggleAddDivisionMode() {
  isAddDivisionMode = !isAddDivisionMode;
  const btn = document.getElementById('btn-add-div');
  if (isAddDivisionMode) {
    btn.style.background = '#e74c3c';
    btn.innerText = 'マップをクリックして配置...';
  } else {
    btn.style.background = '#2a343d';
    btn.innerText = '🪖 師団を新規配備';
  }
}
