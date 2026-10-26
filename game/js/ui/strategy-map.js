import { project } from '../geo.js';
import { gestures } from './touch-viewport.js';
const NS = 'http://www.w3.org/2000/svg';
const colors = { GER:'#777f89', USA:'#597f9e', SOV:'#a54d4d', ENG:'#aa6868', JAP:'#b99b52', ITA:'#628a61', FRA:'#496ca0' };
const node = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); return n; };
export async function installMapUI(map) {
  const svg = map.svg;
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  let camera = { x: 0, y: 0, scale: 1 };
  gestures(svg, () => camera, v => {
    camera = v;
    const rect = svg.getBoundingClientRect(), unit = Math.min(rect.width / 1200, rect.height / 640);
    // Account for SVG letterboxing while keeping every overlay in the same coordinate space.
    const ox = (rect.width - 1200 * unit) / 2, oy = (rect.height - 640 * unit) / 2;
    svg.setAttribute('viewBox', `${(-v.x + ox * (v.scale - 1)) / unit / v.scale} ${(-v.y + oy * (v.scale - 1)) / unit / v.scale} ${1200/v.scale} ${640/v.scale}`);
  });
  const hud = document.getElementById('map-hud-top');
  const controls = document.createElement('div'); controls.className = 'map-controls'; controls.setAttribute('aria-label', 'マップ表示');
  const buttons = [];
  for (const [mode,label] of [['land','陸軍'],['naval','海軍'],['air','空軍'],['supply','補給']]) {
    const b = document.createElement('button'); b.className = 'steel-btn'; b.textContent = label;
    if (mode === 'supply') { b.title = '補給網・インフラ・補給ハブの状態を表示 (F2)'; b.dataset.supplyToggle = '1'; }
    b.onclick = () => setMode(mode); controls.append(b); buttons.push([mode,b]);
  }
  const setMode = mode => {
    map.mapMode = mode; svg.dataset.mode = mode;
    map.airLayer.style.display = mode === 'air' ? '' : 'none';
    map.navalLayer.style.display = mode === 'naval' ? '' : 'none';
    map.divisionLayer.style.display = (mode === 'land' || mode === 'supply') ? '' : 'none';
    if (map.supplyRouteLayer) map.supplyRouteLayer.style.display = mode === 'supply' ? '' : 'none';
    if (map.supplyLayer) map.supplyLayer.style.display = mode === 'supply' ? '' : 'none';
    buttons.forEach(([m,b]) => b.setAttribute('aria-pressed', String(mode === m)));
    const legend = document.getElementById('map-legend');
    if (mode === 'supply') {
      const net = map.supplyManager?.network?.();
      const sum = net?.summary || {};
      legend.innerHTML = [
        '<div class="map-legend-title">補給網</div>',
        '<div class="map-legend-row"><i class="map-legend-dot ok"></i>正常（緑）</div>',
        '<div class="map-legend-row"><i class="map-legend-dot low"></i>不足（黄）</div>',
        '<div class="map-legend-row"><i class="map-legend-dot critical"></i>枯渇（赤）</div>',
        '<div class="map-legend-row"><i class="map-legend-line"></i>鉄道（首都 → 補給ハブ）</div>',
        '<div class="map-legend-row"><i class="map-legend-line thin"></i>補給ハブの分配範囲</div>',
        `<div class="map-legend-note">補給ハブ ${sum.hubs || 0} / 州 ${sum.provinces || 0} — 容量 ${sum.totalCapacity || 0}・需要 ${sum.totalDemand || 0}</div>`,
      ].join('');
    } else {
      legend.textContent = { land:'陸軍：歴史国境・海岸線・師団', air:'空軍：空域・制空権・航空基地', naval:'海軍：海域・制海権・艦隊' }[mode] || '';
    }
    if (mode === 'supply') map.renderSupplyNetwork();
    if (map.airNavalRenderer) map.airNavalRenderer();
  };
  // 建設画面など外部から切り替えられるように公開
  map.setMode = setMode;
  map.mapModeButtons = buttons;
  for (const [cls,label] of [['show-borders','国境強調']]) {
    const b = document.createElement('button'); b.className = 'steel-btn'; b.textContent = label; b.setAttribute('aria-pressed','false');
    b.onclick = () => b.setAttribute('aria-pressed', String(svg.classList.toggle(cls))); controls.append(b);
  }
  const reset = document.createElement('button'); reset.className = 'steel-btn'; reset.textContent = '表示リセット';
  reset.onclick = () => { camera = { x:0, y:0, scale:1 }; svg.setAttribute('viewBox','0 0 1200 640'); }; controls.append(reset);
  hud.append(controls); setMode('land');
  try {
    const response = await fetch(new URL('../../data/maps/world-1936.geojson', import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const layer = node('g', { id:'map-territories' }), borders = node('g', { class:'country-borders', 'pointer-events':'none' });
    const geometryPath = geometry => {
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
      return polygons.map(polygon => polygon.map(ring => {
        let last;
        return ring.map(([lon,lat],i) => {
          if (last !== undefined) { while (lon-last>180) lon-=360; while (lon-last< -180) lon+=360; }
          last=lon; const p=project(lon,lat); return `${i?'L':'M'}${p.x},${p.y}`;
        }).join(' ')+'Z';
      }).join(' ')).join(' ');
    };
    for (const [index,feature] of data.features.entries()) {
      const p = feature.properties, d = geometryPath(feature.geometry);
      if (!d) continue;
      const group = node('g', { class:'historical-country' });
      for (const offset of [-1200,0,1200]) {
        const path = node('path', { d, transform:`translate(${offset},0)`, fill: colors[p.tag] || '#697e72', class:'country-area', 'fill-rule':'evenodd', 'data-country':index });
        const title=node('title',{}); title.textContent=`${p.name} — 1936年初頭（復元・概略）`; path.append(title);
        path.addEventListener('click', () => {
          const province=Object.values(map.byId).find(province => province.tag === p.tag);
          if (province && map.onProvinceClick) map.onProvinceClick(province.id);
        });
        group.append(path);
      }
      layer.append(group);
    }
    svg.insertBefore(layer, document.getElementById('map-links')); layer.append(borders);
    document.getElementById('map-links').style.display = 'none';
  } catch (error) {
    const status = document.createElement('div'); status.className = 'map-chip'; status.textContent = `地図データを読み込めません。都市表示を継続します (${error.message})`; hud.append(status);
  }
}
