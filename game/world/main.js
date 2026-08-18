// 1. マップ初期化
const map = L.map('map', {
  center: [52.5, 25.0],
  zoom: 4,
  minZoom: 3,
  maxZoom: 7,
  worldCopyJump: true
});

// 暗色系マップタイル（CartoDB Dark Matter）
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// 状態管理
window.selectedCountry = 'SOV'; // 'SOV' | 'GER'
window.isAddDivisionMode = false;

// 支配国ごとの境界線・塗りつぶしスタイル
const countryStyles = {
  'SOV': {
    fillColor: '#e74c3c', // ソ連：赤色
    fillOpacity: 0.55,
    color: '#ffffff',     // 白い境界線
    weight: 1.5
  },
  'GER': {
    fillColor: '#2c3e50', // ドイツ：ダークグレー
    fillOpacity: 0.7,
    color: '#d4af37',     // ゴールド境界線
    weight: 1.5
  },
  'NONE': {
    fillColor: '#34495e',
    fillOpacity: 0.25,
    color: '#7f8c8d',     // 中立：グレー境界線
    weight: 1
  }
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配'
};

// 仮想リソース生成関数（プロヴィンス用）
function generateRandomResources() {
  const types = ['鉄', '石油', '石炭', '工場', '木材', 'クロム', 'アルミニウム'];
  const res = {};
  const count = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < count; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    res[t] = Math.floor(Math.random() * 50) + 10;
  }
  return res;
}

// 初期所有国の推定設定（ISO国コードベース）
function getInitialOwner(isoCode) {
  const gerList = ['DEU', 'AUT', 'CZE', 'POL'];
  const sovList = ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU'];
  
  if (gerList.includes(isoCode)) return 'GER';
  if (sovList.includes(isoCode)) return 'SOV';
  return 'NONE';
}

// ツールチップ文字列生成
function getTooltipHTML(name, owner, resources) {
  const resHTML = Object.entries(resources)
    .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
    .join('');

  return `
    <div>
      <strong>📌 ${name}</strong><br/>
      支配権: <b>${countryNames[owner]}</b><br/>
      <div style="margin-top:4px;">${resHTML}</div>
    </div>
  `;
}

// 2. 正確な境界線GeoJSONデータの読み込みとプロヴィンス生成
// 世界の行政区分（国・州単位）GeoJSONを取得して全プロヴィンス化
fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      style: function(feature) {
        const owner = getInitialOwner(feature.properties.ADM0_A3);
        const style = countryStyles[owner] || countryStyles['NONE'];
        return {
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
          color: style.color,
          weight: style.weight
        };
      },
      onEachFeature: function(feature, layer) {
        // プロヴィンス情報の初期化
        const provName = feature.properties.NAME_JA || feature.properties.NAME || '未知の地区';
        const initialOwner = getInitialOwner(feature.properties.ADM0_A3);
        const resources = generateRandomResources();

        // レイヤーにデータを保持
        layer.provData = {
          name: provName,
          owner: initialOwner,
          resources: resources
        };

        // ツールチップ追加
        layer.bindTooltip(() => getTooltipHTML(layer.provData.name, layer.provData.owner, layer.provData.resources), {
          className: 'hoi4-tooltip',
          sticky: true
        });

        // 📌 クリックで領土切り替え（全プロヴィンス対応）
        layer.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          if (window.isAddDivisionMode) return;

          // 支配国の変更
          layer.provData.owner = window.selectedCountry;

          // スタイル（赤 / 黒）を即座に適用
          const newStyle = countryStyles[window.selectedCountry];
          layer.setStyle({
            fillColor: newStyle.fillColor,
            fillOpacity: newStyle.fillOpacity,
            color: newStyle.color,
            weight: newStyle.weight
          });

          // ツールチップ表示を更新
          layer.setTooltipContent(getTooltipHTML(layer.provData.name, layer.provData.owner, layer.provData.resources));
        });
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error('GeoJSONの読み込みに失敗しました:', err);
  });

// 3. 山脈・川・重要ポイントの固定アイコン
function addTerrainIcon(latlng, iconSymbol, tooltipText) {
  const icon = L.divIcon({
    className: 'terrain-icon-marker',
    html: iconSymbol,
    iconSize: [24, 24]
  });
  const marker = L.marker(latlng, { icon: icon, interactive: true }).addTo(map);
  marker.bindTooltip(tooltipText, { className: 'hoi4-tooltip', sticky: true });
}

addTerrainIcon([58, 59], '⛰️', 'ウラル山脈 (天然の要塞)');
addTerrainIcon([50, 30], '🌊', 'ドニエプル川 (重要渡河ライン)');
addTerrainIcon([48.7, 44.5], '🌊', 'ヴォルガ川 (スターリングラード)');

// 4. 師団配置機能
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

addDivision([55.7, 37.6], 'SOV');
addDivision([48.7, 44.5], 'SOV');
addDivision([52.5, 13.4], 'GER');

map.on('click', function (e) {
  if (window.isAddDivisionMode) {
    addDivision(e.latlng, window.selectedCountry);
    toggleAddDivisionMode();
  }
});

// 5. UI操作
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
