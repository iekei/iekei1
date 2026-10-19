/**
 * ui/map.js — 戦略マップビュー
 *  - 簡易SVGマップ（主要国の首都・前線・航空射程サークル）
 *  - showAirRange(): 航空機の出撃可能エリア（射程円）を可視化
 */

import { el } from '../util.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/** 大陸風の地形ノード（x,y は viewBox 1200x640 内） */
const PROVINCES = [
  { id: 'berlin', name: 'ベルリン', x: 560, y: 220, tag: 'GER' },
  { id: 'paris', name: 'パリ', x: 380, y: 300, tag: 'FRA' },
  { id: 'london', name: 'ロンドン', x: 300, y: 210, tag: 'ENG' },
  { id: 'rome', name: 'ローマ', x: 520, y: 400, tag: 'ITA' },
  { id: 'madrid', name: 'マドリード', x: 220, y: 420, tag: 'SPA' },
  { id: 'warsaw', name: 'ワルシャワ', x: 700, y: 240, tag: 'POL' },
  { id: 'prague', name: 'プラハ', x: 640, y: 280, tag: 'CZE' },
  { id: 'vienna', name: 'ウィーン', x: 660, y: 320, tag: 'AUS' },
  { id: 'moscow', name: 'モスクワ', x: 1020, y: 160, tag: 'SOV' },
  { id: 'kiev', name: 'キエフ', x: 860, y: 260, tag: 'SOV' },
  { id: 'washington', name: 'ワシントン', x: 120, y: 280, tag: 'USA' },
  { id: 'newyork', name: 'ニューヨーク', x: 160, y: 250, tag: 'USA' },
  { id: 'tokyo', name: '東京', x: 1080, y: 330, tag: 'JAP' },
  { id: 'osaka', name: '大阪', x: 1100, y: 360, tag: 'JAP' },
  { id: 'shanghai', name: '上海', x: 980, y: 380, tag: 'CHI' },
  { id: 'istanbul', name: 'イスタンブール', x: 760, y: 400, tag: 'TUR' },
  { id: 'cairo', name: 'カイロ', x: 700, y: 520, tag: 'EGY' },
  { id: 'delhi', name: 'デリー', x: 900, y: 460, tag: 'RAJ' },
  { id: 'saigon', name: 'サイゴン', x: 960, y: 480, tag: 'JAP' },
];

const LINKS = [
  ['berlin', 'paris'], ['berlin', 'warsaw'], ['berlin', 'prague'], ['berlin', 'vienna'], ['berlin', 'rome'],
  ['paris', 'london'], ['paris', 'madrid'], ['london', 'warsaw'], ['warsaw', 'prague'], ['warsaw', 'kiev'],
  ['prague', 'vienna'], ['vienna', 'rome'], ['rome', 'istanbul'], ['kiev', 'moscow'], ['moscow', 'istanbul'],
  ['tokyo', 'osaka'], ['osaka', 'shanghai'], ['shanghai', 'saigon'], ['saigon', 'delhi'], ['cairo', 'istanbul'],
  ['washington', 'newyork'], ['newyork', 'london'],
];

const NATION_COLORS = { GER: '#9a9a9a', FRA: '#4a6a9a', ENG: '#b04a4a', ITA: '#5a9a5a', POL: '#c8a0b0', CZE: '#7a9ab0', AUS: '#c8b060', SOV: '#c04a4a', USA: '#7a9bb5', JAP: '#c8a24a', CHI: '#c8c060', TUR: '#5aa0a0', EGY: '#b08a4a', RAJ: '#8a6ab0', SPA: '#c07a4a' };

export class MapView {
  constructor(state) {
    this.state = state;
    this.svg = document.getElementById('map-svg');
    this.hud = document.getElementById('map-hud-top');
    this.rangeLayer = null;
    this._build();
  }

  _build() {
    const svg = this.svg;
    svg.innerHTML = '';
    // 海（背景グリッド）
    const grid = document.createElementNS(SVGNS, 'g');
    for (let x = 0; x <= 1200; x += 60) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', x); l.setAttribute('y1', 0); l.setAttribute('x2', x); l.setAttribute('y2', 640);
      l.setAttribute('stroke', '#161c22'); l.setAttribute('stroke-width', '1');
      grid.appendChild(l);
    }
    for (let y = 0; y <= 640; y += 60) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', 0); l.setAttribute('y1', y); l.setAttribute('x2', 1200); l.setAttribute('y2', y);
      l.setAttribute('stroke', '#161c22'); l.setAttribute('stroke-width', '1');
      grid.appendChild(l);
    }
    svg.appendChild(grid);

    // リンク（戦線候補）
    const byId = Object.fromEntries(PROVINCES.map((p) => [p.id, p]));
    for (const [a, b] of LINKS) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', byId[a].x); l.setAttribute('y1', byId[a].y);
      l.setAttribute('x2', byId[b].x); l.setAttribute('y2', byId[b].y);
      l.setAttribute('stroke', '#2a323a'); l.setAttribute('stroke-width', '2');
      svg.appendChild(l);
    }

    // 州ノード
    for (const p of PROVINCES) {
      const g = document.createElementNS(SVGNS, 'g');
      g.style.cursor = 'pointer';
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', 10);
      c.setAttribute('fill', NATION_COLORS[p.tag] || '#555');
      c.setAttribute('stroke', '#0b0e11'); c.setAttribute('stroke-width', '2');
      g.appendChild(c);
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', p.x + 14); t.setAttribute('y', p.y + 4);
      t.setAttribute('fill', '#8b96a0'); t.setAttribute('font-size', '11');
      t.textContent = p.name;
      g.appendChild(t);
      const title = document.createElementNS(SVGNS, 'title');
      title.textContent = `${p.name}（${p.tag}）`;
      g.appendChild(title);
      svg.appendChild(g);
    }

    // 射程レイヤ
    this.rangeLayer = document.createElementNS(SVGNS, 'g');
    svg.appendChild(this.rangeLayer);

    // プレイヤー首都マーカー
    this.capitalMarker = document.createElementNS(SVGNS, 'circle');
    this.capitalMarker.setAttribute('r', 16);
    this.capitalMarker.setAttribute('fill', 'none');
    this.capitalMarker.setAttribute('stroke', '#e6c268');
    this.capitalMarker.setAttribute('stroke-width', '2');
    this.capitalMarker.setAttribute('stroke-dasharray', '4 4');
    svg.appendChild(this.capitalMarker);
    this._updateCapital();

    // HUD
    this.hud.innerHTML = '';
    const chip = el('div', 'map-chip');
    chip.innerHTML = `<b>${this.state.nation.name}</b>　${this.state.dateLabel}`;
    this.hud.appendChild(chip);
    this.hudChip = chip;
  }

  _updateCapital() {
    const cap = PROVINCES.find((p) => p.tag === this.state.playerTag) || PROVINCES[0];
    this.capitalMarker.setAttribute('cx', cap.x);
    this.capitalMarker.setAttribute('cy', cap.y);
    this._capital = cap;
  }

  playerCapital() { return this._capital || PROVINCES[0]; }

  /**
   * 航空射程の可視化（増槽装着時は射程拡大）
   * @param center {x,y} @param rangeKm 航続距離
   */
  showAirRange(center, rangeKm, hasDropTank = false) {
    this.rangeLayer.innerHTML = '';
    if (!rangeKm) return;
    // マップ上の 1km を単純スケール: 1000km ≈ 260px
    const px = Math.max(20, (rangeKm / 1000) * 260);
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', center.x); c.setAttribute('cy', center.y); c.setAttribute('r', px);
    c.setAttribute('fill', hasDropTank ? 'rgba(230,194,104,0.10)' : 'rgba(94,158,199,0.10)');
    c.setAttribute('stroke', hasDropTank ? '#e6c268' : '#5e9ec7');
    c.setAttribute('stroke-width', '2');
    c.setAttribute('stroke-dasharray', '8 6');
    this.rangeLayer.appendChild(c);
    const label = document.createElementNS(SVGNS, 'text');
    label.setAttribute('x', center.x + px * 0.5);
    label.setAttribute('y', center.y - px * 0.5);
    label.setAttribute('fill', hasDropTank ? '#e6c268' : '#5e9ec7');
    label.setAttribute('font-size', '13');
    label.setAttribute('font-weight', 'bold');
    label.textContent = `出撃可能半径 ${rangeKm} km${hasDropTank ? '（増槽装備）' : ''}`;
    this.rangeLayer.appendChild(label);
  }

  clearAirRange() { if (this.rangeLayer) this.rangeLayer.innerHTML = ''; }

  update() {
    if (this.hudChip) this.hudChip.innerHTML = `<b>${this.state.nation.name}</b>　${this.state.dateLabel}`;
    if (!this._capital || this._capital.tag !== this.state.playerTag) this._updateCapital();
  }
}
