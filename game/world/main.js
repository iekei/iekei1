// 1. マップ初期化
const map = L.map('map', {
  center: [35.0, 30.0],
  zoom: 3,
  minZoom: 2,
  maxZoom: 10,
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
    fillOpacity: 0.6,
    color: '#ffffff',     // 白い境界線
    weight: 1.0
  },
  'GER': {
    fillColor: '#2c3e50', // ドイツ：ダークグレー
    fillOpacity: 0.75,
    color: '#d4af37',     // ゴールド境界線
    weight: 1.0
  },
  'NONE': {
    fillColor: '#34495e',
    fillOpacity: 0.25,
    color: '#7f8c8d',     // 中立・未支配地域：グレー境界線
    weight: 0.8
  }
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配地域'
};

// 資源生成関数
function generateRandomResources() {
  const types = ['鉄', '石油', '石炭', '軍需工場', '木材', 'クロム', 'アルミニウム'];
  const res = {};
  const count = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < count; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    res[t] = Math.floor(Math.random() * 40) + 10;
  }
  return res;
}

// 全世界対応の初期所有国判定（ISOコードベース）
function getInitialOwner(isoCode, adm0) {
  const gerList = ['DEU', 'AUT', 'CZE', 'POL'];
  const sovList = ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU', 'GEO', 'ARM', 'AZE', 'KAZ', 'TJK', 'TKM', 'UZB', 'KGZ'];
  
  if (gerList.includes(isoCode) || gerList.includes(adm0)) return 'GER';
  if (sovList.includes(isoCode) || sovList.includes(adm0)) return 'SOV';
  return 'NONE';
}

function getTooltipHTML(name, owner, resources) {
  const resHTML = Object.entries(resources)
    .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
    .join('');

  return `
    <div>
      <strong>📌 ${name} 地区</strong><br/>
      支配権: <b>${countryNames[owner]}</b><br/>
      <div style="margin-top:4px;">${resHTML}</div>
    </div>
  `;
}

// 2. 全世界の州・県・プロヴィンスデータを読み込み
fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      style: function(feature) {
        const iso = feature.properties.iso_a2 || '';
        const adm0 = feature.properties.adm0_a3 || '';
        const owner = getInitialOwner(iso, adm0);
        const style = countryStyles[owner] || countryStyles['NONE'];
        return {
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
          color: style.color,
          weight: style.weight
        };
      },
      onEachFeature: function(feature, layer) {
        const provName = feature.properties.name_ja || feature.properties.name || '未知の地区';
        const iso = feature.properties.iso_a2 || '';
        const adm0 = feature.properties.adm0_a3 || '';
        const initialOwner = getInitialOwner(iso, adm0);
        const resources = generateRandomResources();

        layer.provData = {
          name: provName,
          owner: initialOwner,
          resources: resources
        };

        layer.bindTooltip(() => getTooltipHTML(layer.provData.name, layer.provData.owner, layer.provData.resources), {
          className: 'hoi4-tooltip',
          sticky: true
        });

        // 📌 クリックイベントの競合解消
        layer.on('click', function(e) {
          L.DomEvent.stopPropagation(e); // イベント伝播を停止

          // 師団配備モードがONのときは、クリックしたプロヴィンスの場所に師団を置く
          if (window.isAddDivisionMode) {
            addDivision(e.latlng, window.selectedCountry);
            toggleAddDivisionMode();
            return;
          }

          // 通常時は選択中の国家の領土（赤 or 黒）に変更
          layer.provData.owner = window.selectedCountry;
          const newStyle = countryStyles[window.selectedCountry];
          layer.setStyle({
            fillColor: newStyle.fillColor,
            fillOpacity: newStyle.fillOpacity,
            color: newStyle.color,
            weight: newStyle.weight
          });
          layer.setTooltipContent(getTooltipHTML(layer.provData.name, layer.provData.owner, layer.provData.resources));
        });
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error('全世界プロヴィンスデータの読み込みに失敗しました:', err);
  });

// 3. マップ上に主要国の日本語ラベルを配置
function addCountryLabel(latlng, text) {
  const labelIcon = L.divIcon({
    className: 'country-name-label',
    html: `<div style="color: #ffffff; font-weight: bold; font-size: 13px; text-shadow: 1px 1px 3px #000, -1px -1px 3px #000; pointer-events: none; white-space: nowrap;">${text}</div>`,
    iconSize: [100, 20],
    iconAnchor: [50, 10]
  });
  L.marker(latlng, { icon: labelIcon, interactive: false }).addTo(map);
}

// 主要国の日本語国名ラベル
addCountryLabel([55.7, 37.6], '🇷🇺 ソビエト連邦');
addCountryLabel([52.5, 13.4], '🇩🇪 ドイツ国');
addCountryLabel([36.2, 138.2], '🇯🇵 日本');
addCountryLabel([38.0, -95.0], '🇺🇸 アメリカ合衆国');
addCountryLabel([51.5, -0.1], '🇬🇧 イギリス');
addCountryLabel([46.6, 2.2], '🇫🇷 フランス');
addCountryLabel([35.8, 104.1], '🇨🇳 中国');

// 山脈・要塞アイコン
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

// 初期師団配置
addDivision([55.7, 37.6], 'SOV');
addDivision([48.7, 44.5], 'SOV');
addDivision([52.5, 13.4], 'GER');

// マップ自体のクリック（海域やポリゴンの隙間用）
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
