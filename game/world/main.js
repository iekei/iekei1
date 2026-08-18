// 1. マップ初期化
const map = L.map('map', {
  center: [52.5, 25.0],
  zoom: 4,
  minZoom: 3,
  maxZoom: 7,
  worldCopyJump: true
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// 2. MapのSVGレイヤーにテクスチャ用パターン（SVG Pattern）を直接注入
map.whenReady(() => {
  const svg = map.getPanes().overlayPane.querySelector('svg');
  if (svg) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <!-- ソ連用 (赤のストライプ) -->
      <pattern id="pattern-sov" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#801212" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#aa1e1e" stroke-width="2" />
      </pattern>
      <!-- ドイツ用 (ダークグレーの交差ハッチング) -->
      <pattern id="pattern-ger" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="#1e2228" />
        <line x1="0" y1="0" x2="0" y2="10" stroke="#38414b" stroke-width="2" />
        <line x1="0" y1="0" x2="10" y2="0" stroke="#2a3038" stroke-width="2" />
      </pattern>
      <!-- 中立用 (ドットパターン) -->
      <pattern id="pattern-none" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#2d3748" />
        <circle cx="2" cy="2" r="1.5" fill="#4a5568" />
      </pattern>
    `;
    svg.appendChild(defs);
  }
});

// 状態管理
window.selectedCountry = 'SOV';
window.isAddDivisionMode = false;

const countryStyles = {
  'SOV': { fillColor: 'url(#pattern-sov)', color: '#ff3333', weight: 2.5, fillOpacity: 0.85 },
  'GER': { fillColor: 'url(#pattern-ger)', color: '#a0aec0', weight: 2.5, fillOpacity: 0.85 },
  'NONE': { fillColor: 'url(#pattern-none)', color: '#718096', weight: 2.0, fillOpacity: 0.7 }
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配'
};

// 3. 地区（プロヴィンス）データ
const provinces = [
  // ドイツ
  {
    id: 'prov_berlin',
    name: 'ベルリン (首都地区)',
    owner: 'GER',
    resources: { 鉄: 80, 工場: 12, アルミニウム: 20 },
    coords: [[52.1, 12.8], [52.8, 12.8], [52.8, 14.1], [52.1, 14.1]]
  },
  {
    id: 'prov_rhine',
    name: 'ラインラント / ルール工業地帯',
    owner: 'GER',
    resources: { 石炭: 250, 鉄: 120, 工場: 20 },
    coords: [[50.2, 6.2], [51.9, 6.2], [51.9, 8.2], [50.2, 8.2]]
  },
  {
    id: 'prov_bavaria',
    name: 'バイエルン地区',
    owner: 'GER',
    resources: { 鉄: 30, 木材: 50 },
    coords: [[47.3, 9.8], [49.7, 9.8], [49.7, 13.2], [47.3, 13.2]]
  },
  // ソ連
  {
    id: 'prov_moscow',
    name: 'モスクワ地区',
    owner: 'SOV',
    resources: { 鉄: 90, 工場: 15, クロム: 30 },
    coords: [[55.0, 36.2], [56.5, 36.2], [56.5, 38.8], [55.0, 38.8]]
  },
  {
    id: 'prov_stalingrad',
    name: 'スターリングラード地区',
    owner: 'SOV',
    resources: { 石油: 60, 鉄: 75, トラクター工場: 8 },
    coords: [[48.0, 43.8], [49.5, 43.8], [49.5, 45.5], [48.0, 45.5]]
  },
  {
    id: 'prov_leningrad',
    name: 'レニングラード地区',
    owner: 'SOV',
    resources: { 造船所: 10, 鉄: 50, 木材: 80 },
    coords: [[59.1, 29.2], [60.5, 29.2], [60.5, 31.2], [59.1, 31.2]]
  },
  {
    id: 'prov_kiev',
    name: 'キエフ地区 (ウクライナ)',
    owner: 'SOV',
    resources: { 食料: 200, 鉄: 65, 石炭: 90 },
    coords: [[49.8, 29.8], [51.2, 29.8], [51.2, 31.8], [49.8, 31.8]]
  },
  {
    id: 'prov_baku',
    name: 'バクー油田地区',
    owner: 'SOV',
    resources: { 石油: 300, クロム: 40 },
    coords: [[39.8, 48.8], [41.2, 48.8], [41.2, 50.8], [39.8, 50.8]]
  },
  // 緩衝地帯
  {
    id: 'prov_warsaw',
    name: 'ワルシャワ地区',
    owner: 'NONE',
    resources: { 鉄: 40, 石炭: 60 },
    coords: [[51.8, 20.2], [52.8, 20.2], [52.8, 21.8], [51.8, 21.8]]
  }
];

// 海域データ
const seaZones = [
  {
    id: 'sea_baltic',
    name: 'バルト海域',
    owner: 'GER',
    resources: { 通商路: '極めて重要', 制海権: 'ドイツ優位' },
    coords: [[54.0, 14.0], [60.0, 14.0], [60.0, 28.0], [54.0, 20.0]]
  },
  {
    id: 'sea_black',
    name: '黒海海域',
    owner: 'SOV',
    resources: { 通商路: '重要', 制海権: 'ソ連優位' },
    coords: [[41.0, 28.0], [46.5, 28.0], [46.5, 41.5], [41.0, 41.5]]
  }
];

// 4. ポリゴン更新と描画ロジック
function applyLayerStyle(polygon, owner) {
  const style = countryStyles[owner] || countryStyles['NONE'];
  polygon.setStyle({
    fillColor: style.fillColor,
    color: style.color,
    weight: style.weight,
    fillOpacity: style.fillOpacity,
    dashArray: owner === 'NONE' ? '4, 4' : null
  });
}

function setupClickAndHover(polygon, isSea = false) {
  // ツールチップ設定
  polygon.bindTooltip(() => {
    let resHTML = Object.entries(polygon.data.resources)
      .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
      .join('');

    return `
      <div>
        <strong>${isSea ? '🌊' : '📌'} ${polygon.data.name}</strong><br/>
        支配権: <b>${countryNames[polygon.data.owner]}</b><br/>
        <div style="margin-top:4px;">${resHTML}</div>
      </div>
    `;
  }, { className: 'hoi4-tooltip', sticky: true });

  // 占領（支配権変更）のクリック処理
  polygon.on('click', function(e) {
    L.DomEvent.stopPropagation(e); // イベント伝播防止
    if (window.isAddDivisionMode) return;

    polygon.data.owner = window.selectedCountry;
    applyLayerStyle(polygon, window.selectedCountry);
    polygon.refreshTooltip();
  });
}

// 陸上地区の描画
provinces.forEach(data => {
  const polygon = L.polygon(data.coords).addTo(map);
  polygon.data = data;
  applyLayerStyle(polygon, data.owner);
  setupClickAndHover(polygon, false);
});

// 海域の描画
seaZones.forEach(sea => {
  const polygon = L.polygon(sea.coords).addTo(map);
  polygon.data = sea;
  applyLayerStyle(polygon, sea.owner);
  setupClickAndHover(polygon, true);
});

// 5. 地形アイコンおよび突破矢印
function addTerrainIcon(latlng, iconSymbol, tooltipText) {
  const icon = L.divIcon({
    className: 'terrain-icon-marker',
    html: iconSymbol,
    iconSize: [24, 24]
  });
  const marker = L.marker(latlng, { icon: icon, interactive: true }).addTo(map);
  marker.bindTooltip(tooltipText, { className: 'hoi4-tooltip', sticky: true });
}

addTerrainIcon([58, 59], '⛰️', 'ウラル山脈 (高防衛補正)');
addTerrainIcon([50, 30], '🌊', 'ドニエプル川 (主要渡河ライン)');
addTerrainIcon([48.7, 44.5], '🌊', 'ヴォルガ川 (スターリングラード防衛線)');

L.polyline([[65, 59], [58, 59], [52, 57]], { color: '#e67e22', weight: 3, dashArray: '6, 6', interactive: false }).addTo(map);
L.polyline([[54, 30], [50, 30], [47, 33]], { color: '#3498db', weight: 3, interactive: false }).addTo(map);
L.polyline([[49.0, 44.5], [48.0, 44.8]], { color: '#3498db', weight: 4, interactive: false }).addTo(map);

// 6. UI操作ハンドラ
window.selectCountry = function(country) {
  window.selectedCountry = country;
  document.querySelectorAll('.country-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${country}`);
  if (activeBtn) activeBtn.classList.add('active');
};

window.toggleAddDivisionMode = function() {
  window.isAddDivisionMode = !window.isAddDivisionMode;
  const btn = document.getElementById('btn-add-div');
  if (window.isAddDivisionMode) {
    btn.style.background = '#e74c3c';
    btn.innerText = 'マップをクリックして配置...';
  } else {
    btn.style.background = '#2a343d';
    btn.innerText = '🪖 師団を新規配備';
  }
};
