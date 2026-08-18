// 1. マップ初期化
const map = L.map('map', {
  center: [52.5, 25.0],
  zoom: 4,
  minZoom: 3,
  maxZoom: 7,
  worldCopyJump: true
});

// CartoDB Dark Matter（安定して高速読み込みされる暗色系世界地図タイル）
L.tileLayer('https://{s}[.basemaps.cartocdn.com/rastertiles/voyager/], {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// 状態管理
window.selectedCountry = 'SOV'; // 'SOV' | 'GER'
window.isAddDivisionMode = false;

// 支配国ごとの色とプロヴィンス境界線のスタイル設定
const countryStyles = {
  'SOV': {
    fillColor: '#e74c3c', // ソ連：赤色
    fillOpacity: 0.55,
    color: '#ffffff',     // くっきり見せるための白い境界線
    weight: 2.5,
    dashArray: null
  },
  'GER': {
    fillColor: '#2c3e50', // ドイツ：ダークブルーグレー
    fillOpacity: 0.7,
    color: '#d4af37',     // 区分線：ゴールド
    weight: 2.5,
    dashArray: null
  },
  'NONE': {
    fillColor: '#7f8c8d',
    fillOpacity: 0.2,
    color: '#bdc3c7',     // 未支配：グレーの破線
    weight: 2,
    dashArray: '4, 4'
  }
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配'
};

// 2. プロヴィンス（地区）データ定義
const provinces = [
  // --- ドイツ主要プロヴィンス ---
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

  // --- ソ連主要プロヴィンス ---
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

  // --- 緩衝地帯プロヴィンス ---
  {
    id: 'prov_warsaw',
    name: 'ワルシャワ地区',
    owner: 'NONE',
    resources: { 鉄: 40, 石炭: 60 },
    coords: [[51.8, 20.2], [52.8, 20.2], [52.8, 21.8], [51.8, 21.8]]
  }
];

// 海域プロヴィンス
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

// ツールチップ文字列生成
function getTooltipHTML(itemData, isSea) {
  const resHTML = Object.entries(itemData.resources)
    .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
    .join('');

  return `
    <div>
      <strong>${isSea ? '🌊' : '📌'} ${itemData.name}</strong><br/>
      支配権: <b>${countryNames[itemData.owner]}</b><br/>
      <div style="margin-top:4px;">${resHTML}</div>
    </div>
  `;
}

// プロヴィンス描画＆クリック占領ロジック
function renderProvince(data, isSea = false) {
  const style = countryStyles[data.owner] || countryStyles['NONE'];

  // ポリゴン（各プロヴィンス）作成
  const polygon = L.polygon(data.coords, {
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity,
    color: style.color,          // プロヴィンス境界線の色
    weight: style.weight,        // 境界線の太さ
    dashArray: style.dashArray,
    interactive: true
  }).addTo(map);

  polygon.itemData = data;

  // ツールチップ設定
  polygon.bindTooltip(() => getTooltipHTML(polygon.itemData, isSea), {
    className: 'hoi4-tooltip',
    sticky: true
  });

  // プロヴィンスをクリックした時の動作（支配権変更）
  polygon.on('click', (e) => {
    L.DomEvent.stopPropagation(e); // 地図自体のクリックイベント遮断
    if (window.isAddDivisionMode) return;

    // 選択中の国家へ支配権を変更
    polygon.itemData.owner = window.selectedCountry;

    // 新しいスタイル（ソ連＝赤色、ドイツ＝ダークグレー）を適用
    const newStyle = countryStyles[window.selectedCountry];
    polygon.setStyle({
      fillColor: newStyle.fillColor,
      fillOpacity: newStyle.fillOpacity,
      color: newStyle.color,
      weight: newStyle.weight,
      dashArray: newStyle.dashArray
    });

    // ツールチップ（支配国表示）も最新状態に更新
    polygon.setTooltipContent(getTooltipHTML(polygon.itemData, isSea));
  });
}

// 全プロヴィンスと海域をマップに表示
provinces.forEach(p => renderProvince(p, false));
seaZones.forEach(s => renderProvince(s, true));

// 3. 山脈・川の固定アイコン
function addTerrainIcon(latlng, iconSymbol, tooltipText) {
  const icon = L.divIcon({
    className: 'terrain-icon-marker',
    html: iconSymbol,
    iconSize: [24, 24]
  });
  const marker = L.marker(latlng, { icon: icon, interactive: true }).addTo(map);
  marker.bindTooltip(tooltipText, { className: 'hoi4-tooltip', sticky: true });
}

addTerrainIcon([58, 59], '⛰️', 'ウラル山脈 (要塞化地帯)');
addTerrainIcon([50, 30], '🌊', 'ドニエプル川 (渡河補正)');
addTerrainIcon([48.7, 44.5], '🌊', 'ヴォルガ川 (スターリングラード)');

L.polyline([[65, 59], [58, 59], [52, 57]], { color: '#e67e22', weight: 3, dashArray: '6, 6', interactive: false }).addTo(map);
L.polyline([[54, 30], [50, 30], [47, 33]], { color: '#3498db', weight: 3, interactive: false }).addTo(map);
L.polyline([[49.0, 44.5], [48.0, 44.8]], { color: '#3498db', weight: 4, interactive: false }).addTo(map);

// 4. 師団マーカー作成機能
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

  marker.bindTooltip(`第${Math.floor(Math.random() * 80) + 1}師団 (${countryNames[country]})`, {
    className: 'hoi4-tooltip',
    direction: 'top'
  });
}

// 初期師団配置
addDivision([55.7, 37.6], 'SOV');
addDivision([48.7, 44.5], 'SOV');
addDivision([52.5, 13.4], 'GER');

// マップクリック時の師団追加判定
map.on('click', function (e) {
  if (window.isAddDivisionMode) {
    addDivision(e.latlng, window.selectedCountry);
    toggleAddDivisionMode();
  }
});

// 5. UI切り替え制御
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
