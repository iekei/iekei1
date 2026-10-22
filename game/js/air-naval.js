import { project, kmToPixels } from './geo.js';
/**
 * air-naval.js — 空軍・海軍作戦システム
 *
 * - 航空基地に航空機を配備し、空域に任務（制空権確保 / 近接航空支援 / 戦略爆撃）を割り当て
 * - 制空権（-100..100）を計算しマップオーバーレイで緑/黄/赤可視化。70%以上で空挺降下可能
 * - 艦隊を海域に配備し任務（哨戒 / 打撃群 / 船団護衛 / 通商破壊）を割り当て
 * - 制海権（-100..100）を計算・可視化。50%以上で強襲上陸可能
 * - 空挺降下ルート・強襲上陸ルートの描画と実行ロジック
 */

import { el } from './util.js';
import { Tooltip } from './tooltip.js';
import { I18N } from './i18n.js';
import { PROVINCE_BY_ID } from './map-data.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/** 空域定義 */
export const AIR_REGIONS = [
  { id: 'eur_west', name: '西ヨーロッパ空域', center: project(4, 51), radius: kmToPixels(1400), provinces: ['ger_berlin', 'ger_hamburg', 'ger_ruhr', 'fra_paris', 'eng_london'] },
  { id: 'eur_east', name: '東ヨーロッパ空域', center: project(30, 53), radius: kmToPixels(1600), provinces: ['sov_moscow', 'sov_kiev', 'pol_warsaw', 'ger_east_prussia', 'aus_vienna'] },
  { id: 'med', name: '地中海空域', center: project(18, 37), radius: kmToPixels(1300), provinces: ['ita_rome', 'ita_naples', 'tur_istanbul', 'egy_cairo'] },
  { id: 'east_asia', name: '東アジア空域', center: project(132, 35), radius: kmToPixels(2000), provinces: ['jap_tokyo', 'jap_osaka', 'chi_shanghai', 'jap_kyushu'] },
  { id: 'n_america', name: '北アメリカ空域', center: project(-95, 40), radius: kmToPixels(2300), provinces: ['usa_washington', 'usa_newyork', 'usa_chicago'] },
];

/** 海域定義 */
export const NAVAL_REGIONS = [
  { id: 'atlantic', name: '大西洋', center: project(-35, 35), radius: kmToPixels(3000) },
  { id: 'pacific', name: '太平洋', center: project(165, 20), radius: kmToPixels(3500) },
  { id: 'mediterranean', name: '地中海', center: project(18, 35), radius: kmToPixels(1300) },
  { id: 'north_sea', name: '北海', center: project(3, 58), radius: kmToPixels(900) },
];

// ↓ ここに export を追加しました
export const AIR_TYPE_INFO = {
  fighter: { name: '戦闘機', icon: '✈', color: '#5e9ec7', airCombat: 1.0 },
  cas: { name: '近接航空支援(CAS)', icon: '💣', color: '#d05038', groundSupport: 0.15 },
  strategic_bomber: { name: '戦略爆撃機', icon: '💥', color: '#a06ec8', strategic: 0.2 },
  transport: { name: '輸送機', icon: '🚁', color: '#e6c268', transport: 1.0 },
};

// ↓ ここにも念のため export を追加しました
export const NAVAL_TYPE_INFO = {
  fleet: { name: '主力艦隊', icon: '🚢', color: '#5e9ec7', power: 30 },
  task_force: { name: '機動部隊', icon: '🚢', color: '#7ec850', power: 20 },
  convoy: { name: '船団', icon: '🚢', color: '#a06ec8', power: 5 },
};

export class AirNavalManager {
  constructor(state, mapEngine) {
    this.state = state;
    this.map = mapEngine;
    // 空域・海域の制空/制海権値（-100..100）
    this.airSupremacy = {};   // regionId -> value
    this.navalSupremacy = {}; // regionId -> value
    // 描画用要素キャッシュ
    this.airIcons = new Map();   // airForceId -> <g>
    this.navalIcons = new Map(); // navalForceId -> <g>
    this.routeLayer = null;

    // mapEngine にレンダラを登録
    this.map.airNavalRenderer = () => this.renderAll();

    // ルートレイヤ（空挺・強襲上陸ルート）
    this.routeLayer = document.createElementNS(SVGNS, 'g');
    this.routeLayer.setAttribute('id', 'map-routes');
    this.map.svg.insertBefore(this.routeLayer, this.map.svg.firstChild);
  }

  /* ================= 航空 ================= */

  /** 航空機をプロヴィンス基地に配備 */
  deployAir(provinceId, type, count = 1) {
    const p = PROVINCE_BY_ID[provinceId];
    if (!p) return false;
    if ((p.airbase || 0) < 1) { /* 基地なしでも仮配備は許可（ペナルティ扱い） */ }
    const id = `air-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
    this.state.airForces.push({
      id, baseProvince: provinceId, type, count,
      region: null, mission: null, morale: 100,
    });
    this.state.bus.emit('air-changed');
    return true;
  }

  /** 空域に任務を割り当て */
  assignAirMission(airForceId, regionId, mission) {
    const af = this.state.airForces.find((a) => a.id === airForceId);
    const region = AIR_REGIONS.find((r) => r.id === regionId);
    if (!af || !region) return false;
    af.region = regionId;
    af.mission = mission; // 'air_superiority' | 'cas' | 'strategic_bombing' | null
    this.state.bus.emit('air-changed');
    this._recalcAirSupremacy();
    return true;
  }

  /** 制空権を再計算（簡易：味方航空戦力 - 想定敵戦力） */
  _recalcAirSupremacy() {
    for (const region of AIR_REGIONS) {
      let power = 0;
      for (const af of this.state.airForces) {
        if (af.region !== region.id) continue;
        const info = AIR_TYPE_INFO[af.type];
        if (!info) continue;
        // 制空権確保任務のみが制空権に寄与
        const w = af.mission === 'air_superiority' ? 1.0 : 0.25;
        power += af.count * (info.airCombat || 0) * w * (af.morale / 100);
      }
      // 敵戦力は定数（デモ用: 各空域に固定値）
      const enemy = { eur_west: 40, eur_east: 60, med: 30, east_asia: 50, n_america: 10 }[region.id] || 30;
      const max = Math.max(power + enemy, 1);
      this.airSupremacy[region.id] = Math.round(((power - enemy) / max) * 100);
    }
  }

  calcAirSupremacy(regionId) { return this.airSupremacy[regionId] ?? 0; }

  airSupremacyLevel(regionId) {
    const v = this.calcAirSupremacy(regionId);
    if (v >= 70) return 'green';
    if (v >= 30) return 'yellow';
    return 'red';
  }

  /** 陸戦への空支援バフ（CAS 任務がある空域のみ） */
  airSupportBuff(regionId) {
    let buff = 0;
    for (const af of this.state.airForces) {
      if (af.region !== regionId) continue;
      if (af.mission === 'cas') buff += 0.10 * (af.count / 100);
      if (af.mission === 'strategic_bombing') buff += 0.03;
    }
    return Math.min(0.5, buff);
  }

  /* ================= 海軍 ================= */

  /** 艦隊を海域に配備 */
  deployNaval(regionId, type, ships = []) {
    const region = NAVAL_REGIONS.find((r) => r.id === regionId);
    if (!region) return false;
    const id = `nav-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`;
    this.state.navalForces.push({ id, region: regionId, type, ships, mission: null });
    this.state.bus.emit('naval-changed');
    return true;
  }

  assignNavalMission(navalForceId, mission) {
    const nf = this.state.navalForces.find((n) => n.id === navalForceId);
    if (!nf) return false;
    nf.mission = mission; // 'patrol' | 'strike' | 'escort' | 'raiding'
    this.state.bus.emit('naval-changed');
    this._recalcNavalSupremacy();
    return true;
  }

  _recalcNavalSupremacy() {
    for (const region of NAVAL_REGIONS) {
      let power = 0;
      for (const nf of this.state.navalForces) {
        if (nf.region !== region.id) continue;
        const info = NAVAL_TYPE_INFO[nf.type];
        if (!info) continue;
        const w = { patrol: 0.8, strike: 1.2, escort: 0.6, raiding: 1.0 }[nf.mission || 'patrol'] || 0.8;
        power += info.power * w;
      }
      const enemy = { atlantic: 40, pacific: 50, mediterranean: 25, north_sea: 30 }[region.id] || 30;
      const max = Math.max(power + enemy, 1);
      this.navalSupremacy[region.id] = Math.round(((power - enemy) / max) * 100);
    }
  }

  calcNavalSupremacy(regionId) { return this.navalSupremacy[regionId] ?? 0; }

  navalSupremacyLevel(regionId) {
    const v = this.calcNavalSupremacy(regionId);
    if (v >= 50) return 'green';
    if (v >= 20) return 'yellow';
    return 'red';
  }

  /* ================= 空挺降下 ================= */

  /** 空挺降下ルートを開始可能か判定 */
  canParatrooper(fromProvinceId, toProvinceId) {
    const from = PROVINCE_BY_ID[fromProvinceId];
    const to = PROVINCE_BY_ID[toProvinceId];
    if (!from || !to) return { ok: false, msg: 'プロヴィンス不正' };
    const transport = this.state.airForces.find((a) => a.type === 'transport' && a.baseProvince === fromProvinceId && a.count > 0);
    if (!transport) return { ok: false, msg: '出発基地に輸送機が配備されていません' };
    // 目標空域の制空権が70%以上必要（簡易：最も近い空域を使用）
    const region = this._nearestAirRegion(to);
    const sup = region ? this.calcAirSupremacy(region.id) : -100;
    if (sup < 70) return { ok: false, msg: `制空権不足（${sup}%、70%以上必要）` };
    return { ok: true };
  }

  executeParatrooper(fromProvinceId, toProvinceId) {
    const check = this.canParatrooper(fromProvinceId, toProvinceId);
    if (!check.ok) return false;
    const transport = this.state.airForces.find((a) => a.type === 'transport' && a.baseProvince === fromProvinceId);
    transport.count = Math.max(0, transport.count - 1);
    // 降下部隊を目標に配置
    this.state.divisions.push({
      id: `para-${Date.now()}`,
      provinceId: toProvinceId,
      type: 'paratrooper',
      name: '空挺師団',
      org: 60, hp: 60, maxOrg: 60, maxHp: 60,
      supply: 0.6, command: 0.8,
    });
    this.state.bus.emit('division-added');
    this.map.highlightProvince(toProvinceId);
    return true;
  }

  /* ================= 強襲上陸 ================= */

  canNavalInvasion(fromPortId, toProvinceId) {
    const to = PROVINCE_BY_ID[toProvinceId];
    if (!to || (to.naval || 0) < 1) return { ok: false, msg: '目標に港（海軍基地）がありません' };
    // 最寄り海域の制海権が50%以上
    const region = this._nearestNavalRegion(to);
    const sup = region ? this.calcNavalSupremacy(region.id) : -100;
    if (sup < 50) return { ok: false, msg: `制海権不足（${sup}%、50%以上必要）` };
    return { ok: true };
  }

  executeNavalInvasion(fromPortId, toProvinceId) {
    const check = this.canNavalInvasion(fromPortId, toProvinceId);
    if (!check.ok) return false;
    // 上陸部隊を配置
    this.state.divisions.push({
      id: `inv-${Date.now()}`,
      provinceId: toProvinceId,
      type: 'marine',
      name: '海兵隊',
      org: 50, hp: 50, maxOrg: 50, maxHp: 50,
      supply: 0.7, command: 0.7,
    });
    this.state.bus.emit('division-added');
    this.map.highlightProvince(toProvinceId);
    return true;
  }

  /* ================= 描画 ================= */

  renderAll() {
    this._recalcAirSupremacy();
    this._recalcNavalSupremacy();
    this.renderAirOverlay();
    this.renderAirIcons();
    this.renderNavalOverlay();
    this.renderNavalIcons();
  }

  renderAirOverlay() {
    // 既存オーバーレイをクリア（routeLayer 以外の air オーバーレイは map の airLayer で管理）
    this.map.airLayer.innerHTML = '';
    for (const region of AIR_REGIONS) {
      const level = this.airSupremacyLevel(region.id);
      const color = level === 'green' ? '#7ec850' : level === 'yellow' ? '#e0b93e' : '#d05038';
      const circle = document.createElementNS(SVGNS, 'circle');
      circle.setAttribute('cx', region.center.x);
      circle.setAttribute('cy', region.center.y);
      circle.setAttribute('r', region.radius);
      circle.setAttribute('fill', color);
      circle.setAttribute('fill-opacity', '0.10');
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('stroke-dasharray', '10 8');
      this.map.airLayer.appendChild(circle);

      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('x', region.center.x);
      label.setAttribute('y', region.center.y - region.radius - 8);
      label.setAttribute('fill', color);
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '800');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', 'var(--mil-font)');
      label.textContent = `${region.name} 制空権 ${this.calcAirSupremacy(region.id)}%`;
      this.map.airLayer.appendChild(label);

      // ツールチップ
      const tip = `
        <div style="font-weight:800;letter-spacing:.06em;font-family:var(--mil-font);color:var(--gold);">${region.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">制空権：<span style="color:${color};font-weight:800">${this.calcAirSupremacy(region.id)}%</span></div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">レベル：${level === 'green' ? '優勢（空挺可能）' : level === 'yellow' ? '均衡' : '劣勢'}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">陸戦支援バフ：${(this.airSupportBuff(region.id) * 100).toFixed(0)}%</div>
      `;
      Tooltip.bind(circle, tip, { kind: level === 'red' ? 'bad' : level === 'green' ? 'good' : 'warn' });
    }
    Tooltip.attachAll(this.map.airLayer);
  }

  renderAirIcons() {
    this.map.airLayer.innerHTML += ''; // オーバーレイ保持のためここでは上書きしない（airLayer に追加）
    // 航空機アイコンは基地プロヴィンス位置に描画（airLayer の最後に追加）
    for (const af of this.state.airForces) {
      const p = PROVINCE_BY_ID[af.baseProvince];
      if (!p) continue;
      const info = AIR_TYPE_INFO[af.type] || AIR_TYPE_INFO.fighter;
      let g = this.airIcons.get(af.id);
      if (!g) {
        g = document.createElementNS(SVGNS, 'g');
        g.classList.add('map-air-icon');
        this.map.airLayer.appendChild(g);
        this.airIcons.set(af.id, g);
      }
      g.setAttribute('transform', `translate(${p.x - 14},${p.y - 14})`);
      g.innerHTML = '';
      // 円背景
      const bg = document.createElementNS(SVGNS, 'circle');
      bg.setAttribute('cx', 14); bg.setAttribute('cy', 14); bg.setAttribute('r', 14);
      bg.setAttribute('fill', '#0e1114'); bg.setAttribute('stroke', info.color);
      bg.setAttribute('stroke-width', '2');
      g.appendChild(bg);
      // アイコン文字
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', 14); t.setAttribute('y', 18);
      t.setAttribute('fill', info.color); t.setAttribute('font-size', '15');
      t.setAttribute('font-weight', '900'); t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-family', 'var(--mil-font)');
      t.textContent = info.icon;
      g.appendChild(t);
      // 台数ラベル
      const n = document.createElementNS(SVGNS, 'text');
      n.setAttribute('x', 14); n.setAttribute('y', 32);
      n.setAttribute('fill', '#d7dde2'); n.setAttribute('font-size', '9');
      n.setAttribute('text-anchor', 'middle');
      n.textContent = `×${af.count}`;
      g.appendChild(n);

      const tip = `
        <div style="font-weight:800;letter-spacing:.06em;font-family:var(--mil-font);color:var(--gold);">${info.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">基地：${p.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">台数：${af.count}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">任務：${af.mission ? I18N.t(`air.missions.${af.mission}`) || af.mission : '未割当'}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">空域：${af.region ? AIR_REGIONS.find((r) => r.id === af.region)?.name : 'なし'}</div>
      `;
      Tooltip.bind(g, tip, { kind: 'info' });
    }
    Tooltip.attachAll(this.map.airLayer);
  }

  renderNavalOverlay() {
    this.map.navalLayer.innerHTML = '';
    for (const region of NAVAL_REGIONS) {
      const level = this.navalSupremacyLevel(region.id);
      const color = level === 'green' ? '#7ec850' : level === 'yellow' ? '#e0b93e' : '#d05038';
      const circle = document.createElementNS(SVGNS, 'circle');
      circle.setAttribute('cx', region.center.x);
      circle.setAttribute('cy', region.center.y);
      circle.setAttribute('r', region.radius);
      circle.setAttribute('fill', color);
      circle.setAttribute('fill-opacity', '0.10');
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('stroke-dasharray', '10 8');
      this.map.navalLayer.appendChild(circle);

      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('x', region.center.x);
      label.setAttribute('y', region.center.y - region.radius - 8);
      label.setAttribute('fill', color);
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '800');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', 'var(--mil-font)');
      label.textContent = `${region.name} 制海権 ${this.calcNavalSupremacy(region.id)}%`;
      this.map.navalLayer.appendChild(label);

      const tip = `
        <div style="font-weight:800;letter-spacing:.06em;font-family:var(--mil-font);color:var(--gold);">${region.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">制海権：<span style="color:${color};font-weight:800">${this.calcNavalSupremacy(region.id)}%</span></div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">レベル：${level === 'green' ? '確保（強襲上陸可能）' : level === 'yellow' ? '均衡' : '喪失'}</div>
      `;
      Tooltip.bind(circle, tip, { kind: level === 'red' ? 'bad' : level === 'green' ? 'good' : 'warn' });
    }
    Tooltip.attachAll(this.map.navalLayer);
  }

  renderNavalIcons() {
    for (const nf of this.state.navalForces) {
      const region = NAVAL_REGIONS.find((r) => r.id === nf.region);
      if (!region) continue;
      const info = NAVAL_TYPE_INFO[nf.type] || NAVAL_TYPE_INFO.fleet;
      let g = this.navalIcons.get(nf.id);
      if (!g) {
        g = document.createElementNS(SVGNS, 'g');
        g.classList.add('map-naval-icon');
        this.map.navalLayer.appendChild(g);
        this.navalIcons.set(nf.id, g);
      }
      g.setAttribute('transform', `translate(${region.center.x - 14},${region.center.y - 14})`);
      g.innerHTML = '';
      const bg = document.createElementNS(SVGNS, 'circle');
      bg.setAttribute('cx', 14); bg.setAttribute('cy', 14); bg.setAttribute('r', 14);
      bg.setAttribute('fill', '#0e1114'); bg.setAttribute('stroke', info.color);
      bg.setAttribute('stroke-width', '2');
      g.appendChild(bg);
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', 14); t.setAttribute('y', 18);
      t.setAttribute('fill', info.color); t.setAttribute('font-size', '15');
      t.setAttribute('font-weight', '900'); t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-family', 'var(--mil-font)');
      t.textContent = info.icon;
      g.appendChild(t);

      const tip = `
        <div style="font-weight:800;letter-spacing:.06em;font-family:var(--mil-font);color:var(--gold);">${info.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">海域：${region.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">任務：${nf.mission || '未割当'}</div>
      `;
      Tooltip.bind(g, tip, { kind: 'info' });
    }
    Tooltip.attachAll(this.map.navalLayer);
  }

  /* ================= ルート描画（空挺・強襲上陸） ================= */

  /** 空挺ルートを描画（一時的） */
  drawParatrooperRoute(fromProvinceId, toProvinceId, valid) {
    this.clearRoutes();
    const from = PROVINCE_BY_ID[fromProvinceId];
    const to = PROVINCE_BY_ID[toProvinceId];
    if (!from || !to) return;
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
    line.setAttribute('stroke', valid ? '#7ec850' : '#d05038');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-dasharray', '10 6');
    line.setAttribute('marker-end', 'url(#route-arrow)');
    this.routeLayer.appendChild(line);
    this._ensureRouteArrow();
  }

  /** 強襲上陸ルートを描画 */
  drawNavalInvasionRoute(fromPortId, toProvinceId, valid) {
    this.clearRoutes();
    const from = PROVINCE_BY_ID[fromPortId];
    const to = PROVINCE_BY_ID[toProvinceId];
    if (!from || !to) return;
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
    line.setAttribute('stroke', valid ? '#7ec850' : '#d05038');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-dasharray', '10 6');
    line.setAttribute('marker-end', 'url(#route-arrow)');
    this.routeLayer.appendChild(line);
    this._ensureRouteArrow();
  }

  clearRoutes() { this.routeLayer.innerHTML = ''; }

  _ensureRouteArrow() {
    if (document.getElementById('route-arrow')) return;
    const defs = document.createElementNS(SVGNS, 'defs');
    const marker = document.createElementNS(SVGNS, 'marker');
    marker.setAttribute('id', 'route-arrow');
    marker.setAttribute('markerWidth', '10'); marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '8'); marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
    path.setAttribute('fill', '#e6c268');
    marker.appendChild(path);
    defs.appendChild(marker);
    this.map.svg.insertBefore(defs, this.map.svg.firstChild);
  }

  _nearestAirRegion(province) {
    let best = null, bestD = Infinity;
    for (const r of AIR_REGIONS) {
      const d = Math.hypot(province.x - r.center.x, province.y - r.center.y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  _nearestNavalRegion(province) {
    let best = null, bestD = Infinity;
    for (const r of NAVAL_REGIONS) {
      const d = Math.hypot(province.x - r.center.x, province.y - r.center.y);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }
}

export default AirNavalManager;
