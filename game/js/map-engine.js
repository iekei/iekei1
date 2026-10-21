/**
 * map-engine.js — HoI4 風 戦略マップエンジン（SVG ベース）
 *
 * - プロヴィンス（州）を地形属性・所有国・航空/海軍基地レベル付きで描画
 *   地形補正（移動コスト・攻防バフ/デバフ）を描画・計算に反映
 * - 師団を NATO 風シンボルで描画。充足度バー（オレンジ）と指揮統制率バー（緑）をオーバーレイ
 * - 前線 (Frontline) / 攻撃線 (Offensive Line) をマップ上に描画
 * - 戦闘バブル（緑：攻撃側優勢 / 黄：均衡 / 赤：攻撃側劣勢）をリアルタイム可視化
 * - 州クリックで外交ウィンドウを開く（DiplomacyManager 連携）
 * - あらゆる要素に data-tip / Tooltip を紐付け
 */

import { el } from './util.js';
import { Tooltip } from './tooltip.js';
import { I18N } from './i18n.js';
import { PROVINCES, PROVINCE_LINKS, PROVINCE_BY_ID, neighbors, terrainInfo, moveSpeedMultiplier } from './map-data.js';
import { NATIONS, nationName, nationFlag } from './data/nations.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/** 兵科ごとの NATO 風シンボル（SVG path）と色 */
const UNIT_SYMBOLS = {
  infantry:   { symbol: 'I', color: '#7ec850', fill: '#1b2024' },
  armor:      { symbol: 'T', color: '#e6c268', fill: '#1b2024' },
  artillery:  { symbol: 'A', color: '#d05038', fill: '#1b2024' },
  paratrooper:{ symbol: 'P', color: '#5e9ec7', fill: '#1b2024' },
  marine:     { symbol: 'M', color: '#a06ec8', fill: '#1b2024' },
};

const NATION_COLORS = {
  GER: '#9a9a9a', SOV: '#c04a4a', USA: '#7a9bb5', ENG: '#b04a4a',
  ITA: '#5a9a5a', JAP: '#c8a24a', FRA: '#4a6a9a', POL: '#c8a0b0',
  CZE: '#7a9ab0', AUS: '#c8b060', TUR: '#5aa0a0', EGY: '#b08a4a',
  CHI: '#c8c060', SPA: '#c07a4a',
};

/** 戦闘バブルの色（優勢度） */
function advantageColor(adv) {
  if (adv === 'green') return '#7ec850';
  if (adv === 'yellow') return '#e0b93e';
  return '#d05038';
}

export class MapEngine {
  constructor(state, svgEl) {
    this.state = state;
    this.svg = svgEl;
    this.byId = PROVINCE_BY_ID;
    this.provinceEls = new Map(); // id -> <g>
    this.divisionLayer = null;
    this.frontlineLayer = null;
    this.combatLayer = null;
    this.airLayer = null;
    this.navalLayer = null;
    this.rangeLayer = null;
    this.capitalMarker = null;
    this.onProvinceClick = null; // (provinceId) => void 外部から設定
    this.divisionIcons = new Map(); // divisionId -> {g, symbol, bars}
    this.combatBubbles = new Map(); // bubbleId -> <g>
    this.airNavalRenderer = null; // () => void 外部（air-naval.js）から設定
    this._build();
  }

  _build() {
    const svg = this.svg;
    svg.innerHTML = '';

    // 背景グリッド（海）
    const grid = document.createElementNS(SVGNS, 'g');
    grid.setAttribute('id', 'map-grid');
    for (let x = 0; x <= 1200; x += 60) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', x); l.setAttribute('y1', 0);
      l.setAttribute('x2', x); l.setAttribute('y2', 640);
      l.setAttribute('stroke', '#161c22'); l.setAttribute('stroke-width', '1');
      grid.appendChild(l);
    }
    for (let y = 0; y <= 640; y += 60) {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', 0); l.setAttribute('y1', y);
      l.setAttribute('x2', 1200); l.setAttribute('y2', y);
      l.setAttribute('stroke', '#161c22'); l.setAttribute('stroke-width', '1');
      grid.appendChild(l);
    }
    svg.appendChild(grid);

    // リンク線（陸路接続）
    const linkLayer = document.createElementNS(SVGNS, 'g');
    linkLayer.setAttribute('id', 'map-links');
    for (const [a, b] of PROVINCE_LINKS) {
      const pa = this.byId[a], pb = this.byId[b];
      if (!pa || !pb) continue;
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', pa.x); l.setAttribute('y1', pa.y);
      l.setAttribute('x2', pb.x); l.setAttribute('y2', pb.y);
      l.setAttribute('stroke', '#2a323a'); l.setAttribute('stroke-width', '1.5');
      l.setAttribute('opacity', '0.5');
      linkLayer.appendChild(l);
    }
    svg.appendChild(linkLayer);

    // 前線レイヤ
    this.frontlineLayer = document.createElementNS(SVGNS, 'g');
    this.frontlineLayer.setAttribute('id', 'map-frontlines');
    svg.appendChild(this.frontlineLayer);

    // 攻撃線レイヤ
    this.offensiveLayer = document.createElementNS(SVGNS, 'g');
    this.offensiveLayer.setAttribute('id', 'map-offensive');
    svg.appendChild(this.offensiveLayer);

    // 州ノード
    for (const p of PROVINCES) {
      this._createProvinceNode(svg, p);
    }

    // 師団レイヤ
    this.divisionLayer = document.createElementNS(SVGNS, 'g');
    this.divisionLayer.setAttribute('id', 'map-divisions');
    svg.appendChild(this.divisionLayer);

    // 戦闘バブルレイヤ
    this.combatLayer = document.createElementNS(SVGNS, 'g');
    this.combatLayer.setAttribute('id', 'map-combat');
    svg.appendChild(this.combatLayer);

    // 航空・海軍レイヤ
    this.airLayer = document.createElementNS(SVGNS, 'g');
    this.airLayer.setAttribute('id', 'map-air');
    svg.appendChild(this.airLayer);
    this.navalLayer = document.createElementNS(SVGNS, 'g');
    this.navalLayer.setAttribute('id', 'map-naval');
    svg.appendChild(this.navalLayer);

    // 航空射程レイヤ
    this.rangeLayer = document.createElementNS(SVGNS, 'g');
    this.rangeLayer.setAttribute('id', 'map-airrange');
    svg.appendChild(this.rangeLayer);

    // 首都マーカー
    this.capitalMarker = document.createElementNS(SVGNS, 'circle');
    this.capitalMarker.setAttribute('r', 16);
    this.capitalMarker.setAttribute('fill', 'none');
    this.capitalMarker.setAttribute('stroke', '#e6c268');
    this.capitalMarker.setAttribute('stroke-width', '2.5');
    this.capitalMarker.setAttribute('stroke-dasharray', '5 5');
    svg.appendChild(this.capitalMarker);
    this._updateCapital();

    // 州クリック → 外交
    svg.addEventListener('click', (e) => {
      const g = e.target.closest ? e.target.closest('.map-province') : null;
      if (g && this.onProvinceClick) {
        const id = g.dataset.province;
        if (id) this.onProvinceClick(id);
      }
    });
  }

  /** 1プロヴィンスの SVG グループを作成 */
  _createProvinceNode(svg, p) {
    const g = document.createElementNS(SVGNS, 'g');
    g.classList.add('map-province');
    g.setAttribute('data-province', p.id);
    g.style.cursor = 'pointer';

    // 塗りつぶし：所有国色（地形で明暗を変える）
    const t = terrainInfo(p.terrain);
    const base = NATION_COLORS[p.tag] || '#555';
    const terrainShade = t.color || '#555';
    // 国色＋地形でブレンドした擬似色（シンプルに国色をベースに地形名をタイトルに）
    const fillColor = base;

    const circle = document.createElementNS(SVGNS, 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', p.capital ? 12 : 10);
    circle.setAttribute('fill', fillColor);
    circle.setAttribute('fill-opacity', '0.75');
    circle.setAttribute('stroke', '#0b0e11');
    circle.setAttribute('stroke-width', '1.5');
    g.appendChild(circle);

    // 地形バッジ（小さいテキスト）
    const terrLabel = document.createElementNS(SVGNS, 'text');
    terrLabel.setAttribute('x', p.x);
    terrLabel.setAttribute('y', p.y + (p.capital ? 16 : 14));
    terrLabel.setAttribute('fill', '#8b96a0');
    terrLabel.setAttribute('font-size', '8');
    terrLabel.setAttribute('text-anchor', 'middle');
    terrLabel.setAttribute('font-family', 'var(--mil-font)');
    terrLabel.textContent = t.name;
    g.appendChild(terrLabel);

    // 州名ラベル
    const nameLabel = document.createElementNS(SVGNS, 'text');
    nameLabel.setAttribute('x', p.x + 14);
    nameLabel.setAttribute('y', p.y + 4);
    nameLabel.setAttribute('fill', '#d7dde2');
    nameLabel.setAttribute('font-size', '10.5');
    nameLabel.setAttribute('font-weight', '700');
    nameLabel.setAttribute('font-family', 'var(--mil-font)');
    nameLabel.textContent = p.name;
    g.appendChild(nameLabel);

    // 戦略価値（VP）バッジ
    if (p.vp && p.vp > 0) {
      const vp = document.createElementNS(SVGNS, 'circle');
      vp.setAttribute('cx', p.x + 9);
      vp.setAttribute('cy', p.y - 9);
      vp.setAttribute('r', 6);
      vp.setAttribute('fill', '#d05038');
      vp.setAttribute('stroke', '#0b0e11');
      vp.setAttribute('stroke-width', '1');
      g.appendChild(vp);
      const vpText = document.createElementNS(SVGNS, 'text');
      vpText.setAttribute('x', p.x + 9);
      vpText.setAttribute('y', p.y - 6);
      vpText.setAttribute('fill', '#fff');
      vpText.setAttribute('font-size', '9');
      vpText.setAttribute('text-anchor', 'middle');
      vpText.setAttribute('font-weight', '800');
      vpText.textContent = p.vp;
      g.appendChild(vpText);
    }

    // 航空基地レベルインジケータ
    if (p.airbase && p.airbase > 0) {
      const ab = document.createElementNS(SVGNS, 'circle');
      ab.setAttribute('cx', p.x - 9);
      ab.setAttribute('cy', p.y - 9);
      ab.setAttribute('r', 5);
      ab.setAttribute('fill', '#5e9ec7');
      ab.setAttribute('stroke', '#0b0e11');
      ab.setAttribute('stroke-width', '1');
      g.appendChild(ab);
    }

    // ツールチップ（地形・所有国・基地レベル）
    const nat = NATIONS[p.tag];
    const tipHtml = `
      <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">${p.name}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${nationName(p.tag)}（${nat?.ideology || '-'}）</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">地形：${I18N.terrainName(p.terrain) || t.name}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">航空基地Lv${p.airbase || 0} / 海軍基地Lv${p.naval || 0}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">VP: ${p.vp || 0}${p.capital ? '（首都）' : ''}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">移動コスト：${moveSpeedMultiplier(p.terrain).toFixed(2)}x</div>
    `;
    Tooltip.bind(g, tipHtml, { kind: 'info' });

    svg.appendChild(g);
    this.provinceEls.set(p.id, g);
  }

  /* ================= 更新 ================= */

  update() {
    this._updateCapital();
    this.renderDivisions();
    this.renderFrontlines();
    this.renderCombatBubbles();
    if (this.airNavalRenderer) this.airNavalRenderer();
    Tooltip.attachAll(this.svg);
  }

  _updateCapital() {
    this._capital = PROVINCES.find((p) => p.tag === this.state.playerTag) || PROVINCES[0];
    this.capitalMarker.setAttribute('cx', this._capital.x);
    this.capitalMarker.setAttribute('cy', this._capital.y);
  }

  playerCapital() { return this._capital || PROVINCES[0]; }

  /* ================= 師団描画 ================= */

  renderDivisions() {
    this.divisionLayer.innerHTML = '';
    this.divisionIcons.clear();

    for (const div of this.state.divisions) {
      const p = this.byId[div.provinceId];
      if (!p) continue;

      const sym = UNIT_SYMBOLS[div.type] || UNIT_SYMBOLS.infantry;
      const g = document.createElementNS(SVGNS, 'g');
      g.classList.add('map-division');
      g.setAttribute('data-division', div.id);
      g.style.cursor = 'pointer';

      // 外円（所属国色の縁取り）
      const outer = document.createElementNS(SVGNS, 'circle');
      outer.setAttribute('cx', p.x);
      outer.setAttribute('cy', p.y);
      outer.setAttribute('r', 14);
      outer.setAttribute('fill', 'none');
      outer.setAttribute('stroke', NATION_COLORS[this.state.playerTag] || '#fff');
      outer.setAttribute('stroke-width', '2');
      outer.setAttribute('stroke-opacity', '0.9');
      g.appendChild(outer);

      // 内円（兵科色）
      const inner = document.createElementNS(SVGNS, 'circle');
      inner.setAttribute('cx', p.x);
      inner.setAttribute('cy', p.y);
      inner.setAttribute('r', 11);
      inner.setAttribute('fill', sym.fill);
      inner.setAttribute('stroke', sym.color);
      inner.setAttribute('stroke-width', '1.5');
      g.appendChild(inner);

      // シンボル文字
      const symText = document.createElementNS(SVGNS, 'text');
      symText.setAttribute('x', p.x);
      symText.setAttribute('y', p.y + 4);
      symText.setAttribute('fill', sym.color);
      symText.setAttribute('font-size', '11');
      symText.setAttribute('font-weight', '900');
      symText.setAttribute('font-family', 'var(--mil-font)');
      symText.setAttribute('text-anchor', 'middle');
      symText.textContent = sym.symbol;
      g.appendChild(symText);

      // 充足度バー（オレンジ）— 背景
      const supBg = document.createElementNS(SVGNS, 'rect');
      supBg.setAttribute('x', p.x - 22);
      supBg.setAttribute('y', p.y + 18);
      supBg.setAttribute('width', 44);
      supBg.setAttribute('height', 5);
      supBg.setAttribute('fill', '#0e1114');
      supBg.setAttribute('stroke', '#0b0e11');
      supBg.setAttribute('stroke-width', '0.5');
      g.appendChild(supBg);
      const supFill = document.createElementNS(SVGNS, 'rect');
      supFill.setAttribute('x', p.x - 22);
      supFill.setAttribute('y', p.y + 18);
      supFill.setAttribute('width', Math.max(1, 44 * (div.supply || 1)));
      supFill.setAttribute('height', 5);
      supFill.setAttribute('fill', '#e6a23c'); // オレンジ
      supFill.setAttribute('stroke', '#0b0e11');
      supFill.setAttribute('stroke-width', '0.5');
      g.appendChild(supFill);

      // 指揮統制率バー（緑）
      const cmdBg = document.createElementNS(SVGNS, 'rect');
      cmdBg.setAttribute('x', p.x - 22);
      cmdBg.setAttribute('y', p.y + 25);
      cmdBg.setAttribute('width', 44);
      cmdBg.setAttribute('height', 5);
      cmdBg.setAttribute('fill', '#0e1114');
      cmdBg.setAttribute('stroke', '#0b0e11');
      cmdBg.setAttribute('stroke-width', '0.5');
      g.appendChild(cmdBg);
      const cmdFill = document.createElementNS(SVGNS, 'rect');
      cmdFill.setAttribute('x', p.x - 22);
      cmdFill.setAttribute('y', p.y + 25);
      cmdFill.setAttribute('width', Math.max(1, 44 * (div.command || 1)));
      cmdFill.setAttribute('height', 5);
      cmdFill.setAttribute('fill', '#7ec850'); // 緑
      cmdFill.setAttribute('stroke', '#0b0e11');
      cmdFill.setAttribute('stroke-width', '0.5');
      g.appendChild(cmdFill);

      // ラベル（師団名・タイプ）
      const lbl = document.createElementNS(SVGNS, 'text');
      lbl.setAttribute('x', p.x);
      lbl.setAttribute('y', p.y - 16);
      lbl.setAttribute('fill', '#d7dde2');
      lbl.setAttribute('font-size', '9.5');
      lbl.setAttribute('font-weight', '700');
      lbl.setAttribute('font-family', 'var(--mil-font)');
      lbl.setAttribute('text-anchor', 'middle');
      lbl.textContent = div.name || I18N.t(`division.types.${div.type}` || div.type);
      g.appendChild(lbl);

      // 充足・指揮値テキスト
      const valTxt = document.createElementNS(SVGNS, 'text');
      valTxt.setAttribute('x', p.x);
      valTxt.setAttribute('y', p.y + 34);
      valTxt.setAttribute('fill', '#8b96a0');
      valTxt.setAttribute('font-size', '8.5');
      valTxt.setAttribute('text-anchor', 'middle');
      valTxt.textContent = `充足 ${Math.round((div.supply || 1) * 100)}% / 指揮 ${Math.round((div.command || 1) * 100)}%`;
      g.appendChild(valTxt);

      // ツールチップ
      const tipHtml = `
        <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">${div.name || div.type}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">所在地：${p.name}（${I18N.terrainName(p.terrain) || terrainInfo(p.terrain).name}）</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">兵科：${I18N.t(`division.types.${div.type}`) || div.type}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">組織力：${Math.round(div.org || 0)} / ${div.maxOrg || 0}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">人員：${Math.round(div.hp || 0)} / ${div.maxHp || 0}</div>
        <div style="font-size:11px;color:#e6a23c;margin-top:2px;">充足度：${Math.round((div.supply || 1) * 100)}%</div>
        <div style="font-size:11px;color:#7ec850;margin-top:2px;">指揮統制率：${Math.round((div.command || 1) * 100)}%</div>
      `;
      Tooltip.bind(g, tipHtml, { kind: 'info' });

      this.divisionLayer.appendChild(g);
      this.divisionIcons.set(div.id, { g, supFill, cmdFill, valTxt, x: p.x, y: p.y });
    }

    Tooltip.attachAll(this.svg);
  }

  /** 師団の充足・指揮ステータスを更新（ティックごと） */
  updateDivision(divId, patch) {
    const div = this.state.divisions.find((d) => d.id === divId);
    if (!div) return;
    Object.assign(div, patch);
    const icon = this.divisionIcons.get(divId);
    if (icon) {
      icon.supFill.setAttribute('width', Math.max(1, 44 * (div.supply || 1)));
      icon.cmdFill.setAttribute('width', Math.max(1, 44 * (div.command || 1)));
      if (icon.valTxt) {
        icon.valTxt.textContent = `充足 ${Math.round((div.supply || 1) * 100)}% / 指揮 ${Math.round((div.command || 1) * 100)}%`;
      }
    }
  }

  /* ================= 前線・攻撃線 ================= */

  renderFrontlines() {
    this.frontlineLayer.innerHTML = '';
    this.offensiveLayer.innerHTML = '';

    // 前線：プレイヤー所有州と敵所有州が隣接する境界線を太線で描く
    const playerTag = this.state.playerTag;
    const drawn = new Set();
    for (const p of PROVINCES) {
      if (p.tag !== playerTag) continue;
      for (const nb of neighbors(p.id)) {
        const np = this.byId[nb];
        if (!np || np.tag === playerTag) continue;
        const key = [p.id, nb].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const line = document.createElementNS(SVGNS, 'line');
        line.setAttribute('x1', p.x); line.setAttribute('y1', p.y);
        line.setAttribute('x2', np.x); line.setAttribute('y2', np.y);
        line.setAttribute('stroke', '#d05038');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-dasharray', '8 6');
        line.setAttribute('opacity', '0.85');
        this.frontlineLayer.appendChild(line);
      }
    }

    // 攻撃線（state.offensiveLines から）
    for (const ol of this.state.offensiveLines || []) {
      const a = this.byId[ol.from], b = this.byId[ol.to];
      if (!a || !b) continue;
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('stroke', '#e6c268');
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('stroke-dasharray', '6 4');
      line.setAttribute('marker-end', 'url(#offensive-arrow)');
      this.offensiveLayer.appendChild(line);
    }
    // 矢印マーカー定義（1回だけ）
    if (!document.getElementById('offensive-arrow')) {
      const defs = document.createElementNS(SVGNS, 'defs');
      const marker = document.createElementNS(SVGNS, 'marker');
      marker.setAttribute('id', 'offensive-arrow');
      marker.setAttribute('markerWidth', '10'); marker.setAttribute('markerHeight', '10');
      marker.setAttribute('refX', '8'); marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
      path.setAttribute('fill', '#e6c268');
      marker.appendChild(path);
      defs.appendChild(marker);
      this.svg.insertBefore(defs, this.svg.firstChild);
    }
  }

  /* ================= 戦闘バブル ================= */

  renderCombatBubbles() {
    this.combatLayer.innerHTML = '';
    this.combatBubbles.clear();

    for (const cb of this.state.combatBubbles || []) {
      const p = this.byId[cb.province];
      if (!p) continue;
      const g = document.createElementNS(SVGNS, 'g');
      g.classList.add('combat-bubble');
      g.setAttribute('data-bubble', cb.id);

      const r = 16 + Math.min(12, cb.intensity || 0);
      const circle = document.createElementNS(SVGNS, 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', advantageColor(cb.advantage || 'yellow'));
      circle.setAttribute('fill-opacity', '0.85');
      circle.setAttribute('stroke', '#0b0e11');
      circle.setAttribute('stroke-width', '2');
      g.appendChild(circle);

      // 交差マーク（戦闘中）
      const cross = document.createElementNS(SVGNS, 'text');
      cross.setAttribute('x', p.x);
      cross.setAttribute('y', p.y + 5);
      cross.setAttribute('fill', '#0b0e11');
      cross.setAttribute('font-size', '13');
      cross.setAttribute('font-weight', '900');
      cross.setAttribute('font-family', 'var(--mil-font)');
      cross.setAttribute('text-anchor', 'middle');
      cross.textContent = '⚔';
      g.appendChild(cross);

      // 優勢度ラベル
      const advTxt = document.createElementNS(SVGNS, 'text');
      advTxt.setAttribute('x', p.x);
      advTxt.setAttribute('y', p.y + r + 14);
      advTxt.setAttribute('fill', advantageColor(cb.advantage || 'yellow'));
      advTxt.setAttribute('font-size', '10');
      advTxt.setAttribute('font-weight', '800');
      advTxt.setAttribute('text-anchor', 'middle');
      advTxt.textContent = cb.advantage === 'green' ? '攻撃側優勢'
        : cb.advantage === 'red' ? '防御側優勢' : '均衡';
      g.appendChild(advTxt);

      // ツールチップ
      const tipHtml = `
        <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">戦闘：${p.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">攻撃側：${cb.attackerName || '—'} / 防御側：${cb.defenderName || '—'}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">地形：${I18N.terrainName(p.terrain) || terrainInfo(p.terrain).name}</div>
        <div style="font-size:11px;color:${advantageColor(cb.advantage || 'yellow')};margin-top:2px;">状況：${cb.advantage === 'green' ? '攻撃側優勢' : cb.advantage === 'red' ? '防御側優勢' : '均衡'}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">戦闘強度：${Math.round((cb.intensity || 0) * 100)}%</div>
      `;
      Tooltip.bind(g, tipHtml, { kind: cb.advantage === 'red' ? 'bad' : cb.advantage === 'green' ? 'good' : 'warn' });

      this.combatLayer.appendChild(g);
      this.combatBubbles.set(cb.id, g);
    }

    Tooltip.attachAll(this.svg);
  }

  /** 戦闘バブルを追加・更新 */
  setCombatBubble(id, { province, attacker, defender, advantage, intensity = 0.5, attackerName, defenderName }) {
    let cb = this.state.combatBubbles.find((c) => c.id === id);
    if (!cb) {
      cb = { id, province, attacker, defender, advantage, intensity, attackerName, defenderName };
      this.state.combatBubbles.push(cb);
    } else {
      Object.assign(cb, { province, attacker, defender, advantage, intensity, attackerName, defenderName });
    }
    this.renderCombatBubbles();
  }

  removeCombatBubble(id) {
    const idx = this.state.combatBubbles.findIndex((c) => c.id === id);
    if (idx >= 0) this.state.combatBubbles.splice(idx, 1);
    this.renderCombatBubbles();
  }

  /* ================= 航空射程 ================= */

  showAirRange(center, rangeKm, hasDropTank = false) {
    this.rangeLayer.innerHTML = '';
    if (!rangeKm) return;
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

  /* ================= 地形補正計算ヘルパ ================= */

  /** 指定プロヴィンスでの攻撃側・防御側補正を取得 */
  terrainCombatMods(terrainId, isAttacker) {
    const t = terrainInfo(terrainId);
    return {
      attack: isAttacker ? t.attack : 0,
      defense: isAttacker ? 0 : t.defense,
      moveCost: t.moveCost,
      name: t.name,
    };
  }

  /** 2プロヴィンス間の移動コスト（地形ベース） */
  movementCost(fromId, toId) {
    const pf = this.byId[fromId], pt = this.byId[toId];
    if (!pf || !pt) return 1;
    // 到着先の地形コストを基本にする
    return terrainInfo(pt.terrain).moveCost;
  }

  /** プロヴィンス要素を取得（外部からハイライト等に利用） */
  provinceElement(provinceId) {
    return this.provinceEls.get(provinceId) || null;
  }

  /** 省略：ハイライト */
  highlightProvince(provinceId, color = '#e6c268') {
    const g = this.provinceEls.get(provinceId);
    if (!g) return;
    const circle = g.querySelector('circle');
    if (circle) {
      const orig = circle.getAttribute('fill');
      circle.setAttribute('fill', color);
      circle.setAttribute('fill-opacity', '0.9');
      setTimeout(() => { circle.setAttribute('fill', orig); circle.setAttribute('fill-opacity', '0.75'); }, 1200);
    }
  }
}

export default MapEngine;
