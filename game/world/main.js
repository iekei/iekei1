// 1. マップ初期化（無限ループ）
const map = L.map('map', {
  center: [52.5, 25.0], // ヨーロッパ・ソ連領域を中心に設定
  zoom: 4,
  minZoom: 3,
  maxZoom: 7,
  worldCopyJump: true
});

// HOI4風のダーク背景地図
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// 状態管理
let selectedCountry = 'SOV';
let isAddDivisionMode = false;

// 国家ごとの配色（ソ連：赤、ドイツ：黒/ダークグレー、その他：中立色）
const countryColors = {
  'SOV': '#a81c1c',
  'GER': '#262626',
  'NONE': '#3a444d'
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配'
};

// 2. 1936年プロヴィンス資源データ（各国家・領域に対応）
const provinceDataMap = {
  "SOV": { name: "ソ連本土 (ロシア・ウクライナ)", owner: "SOV", resources: { 石油: 120, 鉄: 180, アルミニウム: 45, クロム: 90 } },
  "DEU": { name: "ドイツ本土 (ベルリン・ルビジ)", owner: "GER", resources: { 鉄: 140, 石炭: 210, アルミニウム: 30 } },
  "POL": { name: "ポーランド領 (1936年)", owner: "NONE", resources: { 鉄: 35, 石炭: 50, ゴム: 5 } },
  "FRA": { name: "フランス領", owner: "NONE", resources: { 鉄: 85, アルミニウム: 40 } },
  "FIN": { name: "フィンランド領", owner: "NONE", resources: { クロム: 25, 木材: 100 } },
  "ROU": { name: "ルーマニア領 (プロエシュティ)", owner: "NONE", resources: { 石油: 95, 鉄: 15 } }
};

// 太平洋・バルト海などの海域データ
const seaZones = [
  {
    name: 'バルト海域',
    owner: 'GER',
    resources: { 通商路: '極めて重要', 制海権: 'ドイツ優位' },
    coords: [[54, 14], [60, 14], [60, 30], [54, 20]]
  },
  {
    name: '黒海海域',
    owner: 'SOV',
    resources: { 通商路: '重要', 制海権: 'ソ連優位' },
    coords: [[41, 28], [47, 28], [47, 42], [41, 42]]
  }
];

let geoJsonLayer;

// 3. 正確な国境線（GeoJSON）の取得とプロヴィンス描画
fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
  .then(res => res.json())
  .then(data => {
    geoJsonLayer = L.geoJSON(data, {
      style: (feature) => {
        const id = feature.id;
        let owner = 'NONE';
        if (id === 'SOV') owner = 'SOV';
        else if (id === 'DEU') owner = 'GER';

        return {
          fillColor: countryColors[owner],
          weight: 1.5,
          opacity: 1,
          color: '#556677', // 正確な境界線
          fillOpacity: 0.6
        };
      },
      onEachFeature: (feature, layer) => {
        const id = feature.id;
        let pInfo = provinceDataMap[id] || {
          name: feature.properties.name,
          owner: 'NONE',
          resources: { 資源量: '小規模' }
        };

        layer.provinceOwner = pInfo.owner;

        // 全プロヴィンスにマウスカーソルを合わせたら資源量を表示
        layer.bindTooltip(() => {
          let resHTML = Object.entries(pInfo.resources)
            .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
            .join('');

          return `
            <div>
              <strong>${pInfo.name}</strong><br/>
              支配国: <b>${countryNames[layer.provinceOwner]}</b><br/>
              <div style="margin-top:4px;">${resHTML}</div>
            </div>
          `;
        }, { className: 'hoi4-tooltip', sticky: true });

        // クリックで支配国（ソ連/ドイツ）の塗替え
        layer.on('click', () => {
          if (isAddDivisionMode) return;
          layer.provinceOwner = selectedCountry;
          layer.setStyle({
            fillColor: countryColors[selectedCountry]
          });
        });
      }
    }).addTo(map);
  });

// 海域ポリゴンの描画
seaZones.forEach(sea => {
  const polygon = L.polygon(sea.coords, {
    color: '#3498db',
    weight: 1,
    fillColor: countryColors[sea.owner],
    fillOpacity: 0.35
  }).addTo(map);

  polygon.provinceOwner = sea.owner;

  polygon.bindTooltip(() => {
    let resHTML = Object.entries(sea.resources)
      .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
      .join('');

    return `
      <div>
        <strong>${sea.name}</strong> (海域)<br/>
        支配権: <b>${countryNames[polygon.provinceOwner]}</b><br/>
        <div style="margin-top:4px;">${resHTML}</div>
      </div>
    `;
  }, { className: 'hoi4-tooltip', sticky: true });

  polygon.on('click', () => {
    if (isAddDivisionMode) return;
    polygon.provinceOwner = selectedCountry;
    polygon.setStyle({
      fillColor: countryColors[selectedCountry]
    });
  });
});

// 4. 山脈・川へのアイコン配置および地形・突破予測ライン

// アイコン付与ヘルパー関数
function addTerrainIcon(latlng, iconSymbol, tooltipText) {
  const icon = L.divIcon({
    className: 'terrain-icon-marker',
    html: iconSymbol,
    iconSize: [24, 24]
  });
  const marker = L.marker(latlng, { icon: icon }).addTo(map);
  marker.bindTooltip(tooltipText, { className: 'hoi4-tooltip', sticky: true });
}

// 山脈 (ウラル山脈 & カルパティア山脈)
const uralMountains = L.polyline([[65, 59], [58, 59], [52, 57]], { color: '#e67e22', weight: 4, dashArray: '6, 6' }).addTo(map);
addTerrainIcon([58, 59], '⛰️', 'ウラル山脈 (自然の要塞・極めて高い突破コスト)');

const carpathians = L.polyline([[49, 19], [47, 25], [45, 26]], { color: '#e67e22', weight: 4, dashArray: '6, 6' }).addTo(map);
addTerrainIcon([47, 23], '⛰️', 'カルパティア山脈 (防衛ライン)');

// 川 (ドニエプル川 & ヴォルガ川)
const dneiperRiver = L.polyline([[54, 30], [50, 30], [47, 33]], { color: '#2ecc71', weight: 3 }).addTo(map);
addTerrainIcon([50, 30], '🌊', 'ドニエプル川 (主要渡河ライン・渡河ペナルティ)');

const volgaRiver = L.polyline([[57, 32], [55, 49], [48, 44]], { color: '#2ecc71', weight: 3 }).addTo(map);
addTerrainIcon([53, 45], '🌊', 'ヴォルガ川 (最終防衛線)');

// 電撃戦突破予測ルート (赤破線矢印)
const barbarossaRoute = L.polyline([[52, 21], [53, 27], [55, 37]], { color: '#e74c3c', weight: 4, dashArray: '8, 8' }).addTo(map);
barbarossaRoute.bindTooltip("⚡ バルバロッサ作戦: モスクワ中央突破予測ルート", { className: 'hoi4-tooltip', sticky: true });


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

// 1936年初期配置
addDivision([55.7, 37.6], 'SOV'); // モスクワ
addDivision([52.5, 13.4], 'GER'); // ベルリン

map.on('click', function(e) {
  if (isAddDivisionMode) {
    addDivision(e.latlng, selectedCountry);
    toggleAddDivisionMode();
  }
});

// 6. UI制御ハンドラ
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
