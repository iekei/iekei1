// 1. マップ初期化（無限ループ）
const map = L.map('map', {
  center: [52.5, 25.0],
  zoom: 4,
  minZoom: 3,
  maxZoom: 7,
  worldCopyJump: true
});

// HOI4風ダーク背景
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// 状態管理
let selectedCountry = 'SOV';
let isAddDivisionMode = false;

const countryColors = {
  'SOV': '#a81c1c', // 赤
  'GER': '#262626', // 黒
  'NONE': '#3a444d'
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配'
};

// 2. 地区（プロヴィンス）レベルのデータ定義
const provinces = [
  // --- ドイツ主要地区 ---
  {
    id: 'prov_berlin',
    name: 'ベルリン (首都地区)',
    owner: 'GER',
    resources: { 鉄: 80, 工場: 12, アルミニウム: 20 },
    coords: [[52.3, 13.0], [52.7, 13.0], [52.7, 13.8], [52.3, 13.8]]
  },
  {
    id: 'prov_rhine',
    name: 'ラインラント / ルール工業地帯',
    owner: 'GER',
    resources: { 石炭: 250, 鉄: 120, 工場: 20 },
    coords: [[50.5, 6.5], [51.8, 6.5], [51.8, 8.0], [50.5, 8.0]]
  },
  {
    id: 'prov_bavaria',
    name: 'バイエルン地区',
    owner: 'GER',
    resources: { 鉄: 30, 木材: 50 },
    coords: [[47.5, 10.0], [49.5, 10.0], [49.5, 13.0], [47.5, 13.0]]
  },

  // --- ソ連主要地区 ---
  {
    id: 'prov_moscow',
    name: 'モスクワ地区',
    owner: 'SOV',
    resources: { 鉄: 90, 工場: 15, クロム: 30 },
    coords: [[55.2, 36.5], [56.2, 36.5], [56.2, 38.5], [55.2, 38.5]]
  },
  {
    id: 'prov_stalingrad',
    name: 'スターリングラード地区',
    owner: 'SOV',
    resources: { 石油: 60, 鉄: 75, トラクター工場: 8 },
    coords: [[48.2, 44.0], [49.2, 44.0], [49.2, 45.2], [48.2, 45.2]]
  },
  {
    id: 'prov_leningrad',
    name: 'レニングラード地区',
    owner: 'SOV',
    resources: { 造船所: 10, 鉄: 50, 木材: 80 },
    coords: [[59.3, 29.5], [60.3, 29.5], [60.3, 31.0], [59.3, 31.0]]
  },
  {
    id: 'prov_kiev',
    name: 'キエフ地区 (ウライナ)',
    owner: 'SOV',
    resources: { 食料: 200, 鉄: 65, 石炭: 90 },
    coords: [[50.0, 30.0], [51.0, 30.0], [51.0, 31.5], [50.0, 31.5]]
  },
  {
    id: 'prov_baku',
    name: 'バクー油田地区',
    owner: 'SOV',
    resources: { 石油: 300, クロム: 40 },
    coords: [[40.0, 49.0], [41.0, 49.0], [41.0, 50.5], [40.0, 50.5]]
  },

  // --- ポーランド・緩衝地帯 ---
  {
    id: 'prov_warsaw',
    name: 'ワルシャワ地区',
    owner: 'NONE',
    resources: { 鉄: 40, 石炭: 60 },
    coords: [[52.0, 20.5], [52.6, 20.5], [52.6, 21.5], [52.0, 21.5]]
  }
];

// 海域データ（太平洋・バルト海など）
const seaZones = [
  {
    name: 'バルト海域',
    owner: 'GER',
    resources: { 通商路: '極めて重要', 制海権: 'ドイツ優位' },
    coords: [[54.0, 14.0], [60.0, 14.0], [60.0, 28.0], [54.0, 20.0]]
  },
  {
    name: '黒海海域',
    owner: 'SOV',
    resources: { 通商路: '重要', 制海権: 'ソ連優位' },
    coords: [[41.0, 28.0], [46.5, 28.0], [46.5, 41.5], [41.0, 41.5]]
  }
];

// 3. 地区（プロヴィンス）ポリゴンの描画
provinces.forEach(data => {
  const polygon = L.polygon(data.coords, {
    color: '#d4af37', // 黄金色の境界線
    weight: 1.5,
    fillColor: countryColors[data.owner],
    fillOpacity: 0.65
  }).addTo(map);

  polygon.data = data;

  // ホバー時に「ベルリン」「スターリングラード」などの地区名と資源を表示
  polygon.bindTooltip(() => {
    let resHTML = Object.entries(polygon.data.resources)
      .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
      .join('');

    return `
      <div>
        <strong>📌 ${polygon.data.name}</strong><br/>
        支配国: <b>${countryNames[polygon.data.owner]}</b><br/>
        <div style="margin-top:4px;">${resHTML}</div>
      </div>
    `;
  }, { className: 'hoi4-tooltip', sticky: true });

  // 地区をクリックした際に選択中の国（ソ連/ドイツ）の領土へ切り替え
  polygon.on('click', () => {
    if (isAddDivisionMode) return;
    polygon.data.owner = selectedCountry;
    polygon.setStyle({
      fillColor: countryColors[selectedCountry]
    });
  });
});

// 海域ポリゴンの描画
seaZones.forEach(sea => {
  const polygon = L.polygon(sea.coords, {
    color: '#3498db',
    weight: 1,
    fillColor: countryColors[sea.owner],
    fillOpacity: 0.35
  }).addTo(map);

  polygon.data = sea;

  polygon.bindTooltip(() => {
    let resHTML = Object.entries(sea.resources)
      .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
      .join('');

    return `
      <div>
        <strong>🌊 ${sea.name}</strong><br/>
        支配権: <b>${countryNames[polygon.data.owner]}</b><br/>
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

// 4. 山脈・川へのアイコン配置および地形・突破予測ライン
function addTerrainIcon(latlng, iconSymbol, tooltipText) {
  const icon = L.divIcon({
    className: 'terrain-icon-marker',
    html: iconSymbol,
    iconSize: [24, 24]
  });
  const marker = L.marker(latlng, { icon: icon }).addTo(map);
  marker.bindTooltip(tooltipText, { className: 'hoi4-tooltip', sticky: true });
}

// 山脈
L.polyline([[65, 59], [58, 59], [52, 57]], { color: '#e67e22', weight: 4, dashArray: '6, 6' }).addTo(map);
addTerrainIcon([58, 59], '⛰️', 'ウラル山脈 (自然の要塞・高防衛補正)');

// 川
L.polyline([[54, 30], [50, 30], [47, 33]], { color: '#2ecc71', weight: 3 }).addTo(map);
addTerrainIcon([50, 30], '🌊', 'ドニエプル川 (主要渡河ライン)');

L.polyline([[49.0, 44.5], [48.0, 44.8]], { color: '#2ecc71', weight: 4 }).addTo(map);
addTerrainIcon([48.7, 44.5], '🌊', 'ヴォルガ川 (スターリングラード防衛線)');

// 電撃戦突破予測ルート (ベルリン ➡ スターリングラード / モスクワ)
const attackRoute = L.polyline([[52.5, 13.4], [52.3, 21.0], [55.7, 37.6]], { color: '#e74c3c', weight: 4, dashArray: '8, 8' }).addTo(map);
attackRoute.bindTooltip("⚡ 東部戦線攻勢ルート (ベルリン ➡ モスクワ)", { className: 'hoi4-tooltip', sticky: true });


// 5. 師団（ヘルメット）配置機能
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

  marker.bindTooltip(`第${Math.floor(Math.random()*80)+1}師団 (${countryNames[country]})`, {
    className: 'hoi4-tooltip',
    direction: 'top'
  });
}

// 主要地区への初期配置
addDivision([55.7, 37.6], 'SOV'); // モスクワ
addDivision([48.7, 44.5], 'SOV'); // スターリングラード
addDivision([52.5, 13.4], 'GER'); // ベルリン

map.on('click', function(e) {
  if (isAddDivisionMode) {
    addDivision(e.latlng, selectedCountry);
    toggleAddDivisionMode();
  }
});

// 6. UI制御
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
