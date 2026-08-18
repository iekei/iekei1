// 1. マップ初期化
const map = L.map('map', {
  center: [52.5, 25.0],
  zoom: 4,
  minZoom: 2,
  maxZoom: 10,
  worldCopyJump: true
});

// 暗色系マップタイル（CartoDB Dark Matter）
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(map);

// 状態管理
window.selectedCountry = 'SOV'; // 'SOV' | 'GER'
window.isAddDivisionMode = false;

// 支配国ごとの境界線・塗りつぶしスタイル
const countryStyles = {
  'SOV': {
    fillColor: '#e74c3c', // ソ連：赤色
    fillOpacity: 0.6,
    color: '#ffffff',     // 白い境界線（地区の目を際立たせる）
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
    color: '#7f8c8d',     // 未支配・中立：グレー境界線
    weight: 0.8
  }
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配'
};

// 仮想リソース生成関数（プロヴィンス用）
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

// 初期所有国の推定設定（ISO国コードベース）
function getInitialOwner(isoCode) {
  const gerList = ['DEU', 'AUT', 'CZE', 'POL'];
  const sovList = ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU', 'GEO', 'ARM', 'AZE', 'KAZ'];
  
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
      <strong>📌 ${name} 地区</strong><br/>
      支配権: <b>${countryNames[owner]}</b><br/>
      <div style="margin-top:4px;">${resHTML}</div>
    </div>
  `;
}

// 2. 州・都道府県レベル（Admin-1）のGeoJSONデータを取得して細分化プロヴィンス化
// Natural Earth の Admin-1（州・県・地方レベルの境界線データ）
fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      style: function(feature) {
        const countryCode = feature.properties.iso_a2 || feature.properties.adm0_a3;
        const owner = getInitialOwner(countryCode);
        const style = countryStyles[owner] || countryStyles['NONE'];
        return {
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
          color: style.color,
          weight: style.weight
        };
      },
      onEachFeature: function(feature, layer) {
        // 州・県・都市の名称（日本語表記があれば優先、なければ英語）
        const provName = feature.properties.name_ja || feature.properties.name || '未知の地区';
        const countryCode = feature.properties.iso_a2 || feature.properties.adm0_a3;
        const initialOwner = getInitialOwner(countryCode);
        const resources = generateRandomResources();

        // レイヤーにプロヴィンス情報を保持
        layer.provData = {
          name: provName,
          owner: initialOwner,
          resources: resources
        };

        // ツールチップ追加（マウスオーバーで地区名と資源を表示）
        layer.bindTooltip(() => getTooltipHTML(layer.provData.name, layer.provData.owner, layer.provData.resources), {
          className: 'hoi4-tooltip',
          sticky: true
        });

        // 📌 クリックした地区（ベルリン、スターリングラード、各都道府県など）のみを塗り替え
        layer.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          if (window.isAddDivisionMode) return;

          // 支配国を更新
          layer.provData.owner = window.selectedCountry;

          // クリックされたポリゴンの色を切り替え（ソ連＝赤 / ドイツ＝黒）
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
    console.error('細分化プロヴィンスデータの読み込みに失敗しました:', err);
  });

// 3. 主要拠点の固定アイコン（要塞・河川）
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
