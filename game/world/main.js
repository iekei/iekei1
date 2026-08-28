// ===============================================
// HOI4風 世界マップシミュレーター
// プロヴィンス占領 + 師団配置 + 戦闘システム
// ===============================================

// 1. マップ初期化
const map = L.map('map', {
  center: [52.5, 25.0],
  zoom: 4,
  minZoom: 3,
  maxZoom: 7,
  worldCopyJump: true
});

// 暗色系マップタイル
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

// ===============================================
// 状態管理
// ===============================================
window.selectedCountry = 'SOV';
window.isAddDivisionMode = false;
window.allDivisions = [];
window.provinces = [];
window.selectedDivision = null;
window.draggedDivision = null;

// 支配国スタイル
const countryStyles = {
  'SOV': {
    fillColor: '#e74c3c',
    fillOpacity: 0.55,
    color: '#ffffff',
    weight: 1.5
  },
  'GER': {
    fillColor: '#2c3e50',
    fillOpacity: 0.7,
    color: '#d4af37',
    weight: 1.5
  },
  'NONE': {
    fillColor: '#34495e',
    fillOpacity: 0.25,
    color: '#7f8c8d',
    weight: 1
  }
};

const countryNames = {
  'SOV': 'ソビエト連邦',
  'GER': 'ナチス・ドイツ',
  'NONE': '中立・未支配'
};

const countryEmojis = {
  'SOV': '🔴',
  'GER': '⚫'
};

// ===============================================
// 2. リソース & プロヴィンス生成
// ===============================================
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

// 初期所有国決定
function getInitialOwner(isoCode) {
  const gerList = ['DEU', 'AUT', 'CZE', 'POL'];
  const sovList = ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU'];
  
  if (gerList.includes(isoCode)) return 'GER';
  if (sovList.includes(isoCode)) return 'SOV';
  return 'NONE';
}

// プロヴィンスツールチップ
function getTooltipHTML(name, owner, resources, garrisonCount) {
  const resHTML = Object.entries(resources)
    .map(([k, v]) => `<span class="resource-badge">${k}: ${v}</span>`)
    .join('');

  const garrisonText = garrisonCount > 0 
    ? `<br/>駐屯師団: <b>${garrisonCount}個</b>` 
    : '';

  return `
    <div>
      <strong>📌 ${name}</strong><br/>
      支配権: <b>${countryNames[owner]}</b>${garrisonText}<br/>
      <div style="margin-top:4px;">${resHTML}</div>
    </div>
  `;
}

// ===============================================
// 3. 師団クラス
// ===============================================
class Division {
  constructor(id, country, latlng, strength = 100) {
    this.id = id;
    this.country = country;
    this.latlng = latlng;
    this.strength = strength; // 0-100
    this.morale = 85;
    this.equipment = 80;
    this.position = latlng;
    this.isSelected = false;
    this.isDragging = false;
    this.marker = null;
    this.createMarker();
  }

  createMarker() {
    const html = `
      <div class="division-marker" data-division-id="${this.id}">
        <div class="division-number">${Math.floor(this.id) % 100}</div>
        <div class="division-country">${countryEmojis[this.country]}</div>
      </div>
    `;

    this.marker = L.marker(this.position, {
      icon: L.divIcon({
        className: `helmet-marker helmet-${this.country}`,
        html: html,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      }),
      draggable: true
    }).addTo(map);

    // ドラッグイベント
    this.marker.on('dragstart', () => {
      window.draggedDivision = this;
      this.marker.getElement().classList.add('dragging');
      document.body.style.cursor = 'grabbing';
    });

    this.marker.on('drag', (e) => {
      this.position = e.target.getLatLng();
    });

    this.marker.on('dragend', (e) => {
      this.position = e.target.getLatLng();
      this.marker.getElement().classList.remove('dragging');
      document.body.style.cursor = 'grab';
      window.draggedDivision = null;
    });

    // クリックで選択
    this.marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectDivision(this);
    });

    this.updateTooltip();
  }

  updateTooltip() {
    const html = `
      <div class="division-tooltip">
        <strong>第${Math.floor(this.id) % 100}師団</strong><br/>
        国家: ${countryNames[this.country]}<br/>
        戦力: ${this.strength.toFixed(1)}%<br/>
        士気: ${this.morale.toFixed(1)}%<br/>
        装備: ${this.equipment.toFixed(1)}%
      </div>
    `;
    this.marker.bindTooltip(html, {
      className: 'hoi4-tooltip',
      direction: 'top',
      sticky: false
    });
  }

  setSelected(selected) {
    this.isSelected = selected;
    if (selected) {
      this.marker.getElement().classList.add('selected');
    } else {
      this.marker.getElement().classList.remove('selected');
    }
  }

  takeDamage(damage) {
    this.strength = Math.max(0, this.strength - damage);
    this.morale = Math.max(0, this.morale - damage * 0.5);
    this.updateTooltip();
  }

  recoverStrength(amount) {
    this.strength = Math.min(100, this.strength + amount);
    this.morale = Math.min(100, this.morale + amount * 0.5);
    this.updateTooltip();
  }

  remove() {
    map.removeLayer(this.marker);
    window.allDivisions = window.allDivisions.filter(d => d.id !== this.id);
  }
}

// ===============================================
// 4. GeoJSONプロヴィンス読み込み
// ===============================================
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
        const provName = feature.properties.NAME_JA || feature.properties.NAME || '未知の地区';
        const initialOwner = getInitialOwner(feature.properties.ADM0_A3);
        const resources = generateRandomResources();

        // プロヴィンスデータ
        const provData = {
          name: provName,
          owner: initialOwner,
          resources: resources,
          garrisonDivisions: [],
          layer: layer
        };

        layer.provData = provData;
        window.provinces.push(provData);

        // ツールチップ
        layer.bindTooltip(() => 
          getTooltipHTML(
            layer.provData.name, 
            layer.provData.owner, 
            layer.provData.resources,
            layer.provData.garrisonDivisions.length
          ), {
          className: 'hoi4-tooltip',
          sticky: true
        });

        // クリックで領土切り替え
        layer.on('click', function(e) {
          L.DomEvent.stopPropagation(e);
          if (window.isAddDivisionMode) return;
          if (window.draggedDivision) {
            // ドラッグ終了時：師団をプロヴィンスに配置
            simulateCombat(window.draggedDivision, layer.provData);
            return;
          }

          // 通常クリック：領土切り替え
          layer.provData.owner = window.selectedCountry;
          const newStyle = countryStyles[window.selectedCountry];
          layer.setStyle({
            fillColor: newStyle.fillColor,
            fillOpacity: newStyle.fillOpacity,
            color: newStyle.color,
            weight: newStyle.weight
          });

          layer.setTooltipContent(
            getTooltipHTML(
              layer.provData.name,
              layer.provData.owner,
              layer.provData.resources,
              layer.provData.garrisonDivisions.length
            )
          );

          showNotification(`${layer.provData.name} を占領しました！`);
        });

        // ドロップゾーン（プロヴィンス）
        layer.on('mouseover', function(e) {
          if (window.draggedDivision) {
            layer.setStyle({ fillOpacity: 0.8 });
          }
        });

        layer.on('mouseout', function(e) {
          if (!window.draggedDivision) {
            layer.setStyle({ fillOpacity: countryStyles[layer.provData.owner]?.fillOpacity || 0.5 });
          }
        });

        layer.on('drop', function(e) {
          console.log('drop on province:', layer.provData.name);
        });
      }
    }).addTo(map);
  })
  .catch(err => console.error('GeoJSONの読み込みに失敗:', err));

// ===============================================
// 5. 戦闘シミュレーション
// ===============================================
function simulateCombat(attackerDivision, defenderProvince) {
  const defenderDivisions = defenderProvince.garrisonDivisions;

  // 防衛側がいない場合：無血占領
  if (defenderDivisions.length === 0) {
    defenderProvince.garrisonDivisions.push(attackerDivision);
    defenderProvince.owner = attackerDivision.country;
    defenderProvince.layer.setStyle(countryStyles[attackerDivision.country]);
    
    showNotification(`${defenderProvince.name} を無血占領しました！`);
    showCombatResult({
      attacker: attackerDivision,
      defender: null,
      result: 'victory',
      casualties: 0
    });
    return;
  }

  // 防衛側が存在：戦闘計算
  const defenderDivision = defenderDivisions[0];

  // 戦力計算
  let attackerPower = attackerDivision.strength * (attackerDivision.morale / 100);
  let defenderPower = defenderDivision.strength * (defenderDivision.morale / 100);

  // サイコロ判定（±20%）
  const attackerRoll = (Math.random() * 0.4 + 0.8); // 0.8 ~ 1.2
  const defenderRoll = (Math.random() * 0.4 + 0.8);

  attackerPower *= attackerRoll;
  defenderPower *= defenderRoll;

  // 被害計算
  let result, casualtyRate;
  if (attackerPower > defenderPower) {
    result = 'victory';
    casualtyRate = 0.15; // 攻撃側被害15%
    defenderDivision.takeDamage(30);
    attackerDivision.takeDamage(8);
    
    // 勝者が領土奪取
    defenderProvince.owner = attackerDivision.country;
    defenderProvince.garrisonDivisions = [attackerDivision];
    defenderProvince.layer.setStyle(countryStyles[attackerDivision.country]);
    
  } else if (defenderPower > attackerPower * 1.2) {
    result = 'defeat';
    casualtyRate = 0.35; // 攻撃側被害35%
    defenderDivision.takeDamage(15);
    attackerDivision.takeDamage(35);
    
  } else {
    result = 'draw';
    casualtyRate = 0.25;
    defenderDivision.takeDamage(20);
    attackerDivision.takeDamage(20);
  }

  // 通知表示
  showCombatResult({
    attacker: attackerDivision,
    defender: defenderDivision,
    result: result,
    casualties: Math.round(casualtyRate * 100)
  });
}

// 戦闘結果表示
function showCombatResult(battleInfo) {
  const resultText = {
    'victory': '🎖️ 勝利！敵を撃破し領土を奪取しました',
    'defeat': '❌ 敗北！敵の防御に阻止されました',
    'draw': '⚔️ 激戦！互いに被害を受けました'
  };

  const message = `
    ${resultText[battleInfo.result]}
    攻撃側: 第${Math.floor(battleInfo.attacker.id) % 100}師団 (戦力: ${battleInfo.attacker.strength.toFixed(1)}%)
    ${battleInfo.defender ? `防衛側: 第${Math.floor(battleInfo.defender.id) % 100}師団 (戦力: ${battleInfo.defender.strength.toFixed(1)}%)` : ''}
    被害: ${battleInfo.casualties}%
  `;

  showNotification(message);
  updateDivisionsPanel();
}

// ===============================================
// 6. UI操作
// ===============================================

// 師団作成
function createDivision(latlng, country) {
  const id = Date.now() + Math.random();
  const division = new Division(id, country, latlng, 100);
  window.allDivisions.push(division);
  updateDivisionsPanel();
}

// 師団選択
function selectDivision(division) {
  if (window.selectedDivision) {
    window.selectedDivision.setSelected(false);
  }
  window.selectedDivision = division;
  division.setSelected(true);
  updateDivisionsPanel();
}

// UI更新
window.selectCountry = function(country) {
  window.selectedCountry = country;
  document.querySelectorAll('.country-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${country}`).classList.add('active');
};

window.toggleAddDivisionMode = function() {
  window.isAddDivisionMode = !window.isAddDivisionMode;
  const btn = document.getElementById('btn-add-div');
  if (window.isAddDivisionMode) {
    btn.style.background = '#e74c3c';
    btn.innerText = 'マップをクリックして配置...';
    map.dragging.disable();
  } else {
    btn.style.background = '#2a343d';
    btn.innerText = '🪖 師団を新規配備';
    map.dragging.enable();
  }
};

// マップクリックで師団配置
map.on('click', function(e) {
  if (window.isAddDivisionMode) {
    createDivision(e.latlng, window.selectedCountry);
    showNotification(`第${window.allDivisions.length}師団を配置しました`);
    updateDivisionsPanel();
  }
});

// ===============================================
// 7. 師団パネル更新
// ===============================================
function updateDivisionsPanel() {
  const panel = document.getElementById('divisions-panel');
  if (!panel) return;

  let html = '<div class="divisions-list">';
  
  window.allDivisions.forEach(div => {
    const barColor = div.strength > 50 ? '#27ae60' : div.strength > 25 ? '#f39c12' : '#e74c3c';
    const selected = div === window.selectedDivision ? 'selected-div' : '';
    
    html += `
      <div class="division-item ${selected}" onclick="selectDivision(window.allDivisions.find(d => d.id === ${div.id}))">
        <div class="div-header">
          <span>第${Math.floor(div.id) % 100}師団</span>
          <span class="div-country">${countryEmojis[div.country]}</span>
        </div>
        <div class="div-stat">
          <span>戦力:</span>
          <div class="stat-bar">
            <div class="stat-fill" style="width: ${div.strength}%; background: ${barColor};"></div>
          </div>
          <span>${div.strength.toFixed(0)}%</span>
        </div>
        <div class="div-actions">
          <button onclick="window.allDivisions.find(d => d.id === ${div.id}).recoverStrength(20); updateDivisionsPanel();">🔧補給</button>
          <button onclick="window.allDivisions.find(d => d.id === ${div.id}).remove(); updateDivisionsPanel();">🗑️削除</button>
        </div>
      </div>
    `;
  });

  html += '</div>';
  panel.innerHTML = html;
}

// 初期師団配置
createDivision([55.7, 37.6], 'SOV');
createDivision([48.7, 44.5], 'SOV');
createDivision([52.5, 13.4], 'GER');

// ===============================================
// 8. 通知システム
// ===============================================
function showNotification(message) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.classList.add('show');
  }, 10);

  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}
