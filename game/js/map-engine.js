import { kmToPixels } from './geo.js';
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

import { installMapUI } from './ui/strategy-map.js';
import { el } from './util.js';
import { Tooltip } from './tooltip.js';
import { I18N } from './i18n.js';
import { PROVINCES, PROVINCE_LINKS, PROVINCE_BY_ID, neighbors, terrainInfo, moveSpeedMultiplier } from './map-data.js';
import { NATIONS, nationName, nationFlag } from './data/nations.js';
import { SUPPLY_STATUS_COLOR, SUPPLY_STATUS_LABEL } from './supply.js';

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

/** 師団の補給バー色（緑＝正常 / 黄＝不足 / 赤＝枯渇） */
function supplyBarColor(div) {
  const ratio = Number(div?.supplyRatio ?? div?.supply ?? 1);
  if (ratio >= 1) return '#7ec850';
  if (ratio >= 0.5) return '#e0b93e';
  return '#d05038';
}

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
    this.supplyManager = null;    // SupplyManager（main.js から接続）
    this.airWingManager = null;   // AirWingManager（main.js から接続）
    this.intelManager = null;     // IntelManager（main.js から接続）
    this.onIntelTargetClick = null; // (tag) => void 外部から設定
    this.intelLayer = null;
    this.intelMarkers = new Map(); // tag -> <g>
    this._build();
    this.mapMode = 'land';
    this.mapReady = installMapUI(this);
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

    // 補給ルートレイヤ（州ノードの下に描画）
    this.supplyRouteLayer = document.createElementNS(SVGNS, 'g');
    this.supplyRouteLayer.setAttribute('id', 'map-supply-routes');
    this.supplyRouteLayer.style.display = 'none';
    svg.appendChild(this.supplyRouteLayer);

    // 前線レイヤ
    this.frontlineLayer = document.createElementNS(SVGNS, 'g');
    this.frontlineLayer.setAttribute('id', 'map-frontlines');
    svg.appendChild(this.frontlineLayer);

    // 攻撃線レイヤ
    this.offensiveLayer = document.createElementNS(SVGNS, 'g');
    this.offensiveLayer.setAttribute('id', 'map-offensive');
    svg.appendChild(this.offensiveLayer);

    // 作戦計画レイヤ（前線ポリライン・攻撃線矢印・計画準備表示）
    this.planLayer = document.createElementNS(SVGNS, 'g');
    this.planLayer.setAttribute('id', 'map-battle-plans');
    svg.appendChild(this.planLayer);

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

    // 諜報レイヤ（インテル・ネットワーク・敵師団推計）
    this.intelLayer = document.createElementNS(SVGNS, 'g');
    this.intelLayer.setAttribute('id', 'map-intel');
    this.intelLayer.style.display = 'none';
    svg.appendChild(this.intelLayer);
    // 毎フレーム再生成されるためイベントは委譲で受ける
    this.intelLayer.addEventListener('click', (e) => {
      const g = e.target.closest ? e.target.closest('[data-intel-tag]') : null;
      if (!g) return;
      e.stopPropagation();
      const tag = g.dataset.intelTag;
      this.state.bus?.emit('intel-target-selected', { tag });
      if (this.onIntelTargetClick) this.onIntelTargetClick(tag);
    });

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

    // 補給ハブ / 州の補給状態マーカー（最前面・補給モード時のみ表示）
    this.supplyLayer = document.createElementNS(SVGNS, 'g');
    this.supplyLayer.setAttribute('id', 'map-supply');
    this.supplyLayer.style.display = 'none';
    svg.appendChild(this.supplyLayer);

    // 州クリック → 作戦計画モードならUIが処理、それ以外は外交
    svg.addEventListener('click', (e) => {
      const g = e.target.closest ? e.target.closest('.map-province') : null;
      if (!g) return;
      const id = g.dataset.province;
      if (!id) return;
      // 作戦計画モード（前線/攻撃線）中は外交を開かない
      if (this.planController?.mode && this.planController.mode !== 'idle') {
        this.planController.handleClick(id);
        return;
      }
      if (this.onProvinceClick) this.onProvinceClick(id);
    });
  }

  /** プロヴィンス所有国の変更をマップ色へ反映（占領時） */
  refreshProvinceColors() {
    for (const p of PROVINCES) {
      const g = this.provinceEls.get(p.id);
      if (!g) continue;
      const circle = g.querySelector('circle');
      if (!circle) continue;
      const color = NATION_COLORS[p.tag] || '#555';
      if (circle.getAttribute('fill') !== color) circle.setAttribute('fill', color);
    }
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
    if ((this.airWingManager?.airbaseLevel?.(p.id) ?? p.airbase ?? 0) > 0) {
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
    const tipHtml = () => {
      const supplyTip = this._supplyTooltip(p);
      return `
      <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">${p.name}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${nationName(p.tag)}（${nat?.ideology || '-'}）</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">地形：${I18N.terrainName(p.terrain) || t.name}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">航空基地Lv${this.airWingManager?.airbaseLevel?.(p.id) ?? (p.airbase || 0)} / 海軍基地Lv${p.naval || 0}</div>
      ${this._airTooltip(p)}
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">VP: ${p.vp || 0}${p.capital ? '（首都）' : ''}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">移動コスト：${moveSpeedMultiplier(p.terrain).toFixed(2)}x</div>
      ${supplyTip}
      `;
    };
    Tooltip.bind(g, tipHtml, { kind: 'info' });

    svg.appendChild(g);
    this.provinceEls.set(p.id, g);
  }

  /* ================= 更新 ================= */

  update() {
    this._updateCapital();
    this.refreshProvinceColors();
    this.renderDivisions();
    this.renderFrontlines();
    this.renderBattlePlans();
    this.renderCombatBubbles();
    if (this.mapMode === 'supply') this.renderSupplyNetwork();
    if (this.mapMode === 'intel') this.renderIntelOverlay();
    if (this.airNavalRenderer) this.airNavalRenderer();
    Tooltip.attachAll(this.svg);
  }

  _updateCapital() {
    this._capital = PROVINCES.find((p) => p.tag === this.state.playerTag) || PROVINCES[0];
    this.capitalMarker.setAttribute('cx', this._capital.x);
    this.capitalMarker.setAttribute('cy', this._capital.y);
  }

  playerCapital() { return this._capital || PROVINCES[0]; }

  /* ================= 航空隊 ================= */

  /** AirWingManager を接続（main.js から） */
  setAirWingManager(mgr) {
    this.airWingManager = mgr;
    return this;
  }

  /** 州ツールチップ用の航空情報 */
  _airTooltip(p) {
    const mgr = this.airWingManager;
    if (!mgr) return '';
    const info = mgr.provinceInfo?.(p.id);
    if (!info) return '';
    const region = info.regionId ? mgr.regionInfo(info.regionId) : null;
    const label = { fighter: '戦闘機', cas: 'CAS', strategic_bomber: '戦略爆撃機' };
    const lines = [];
    if (info.level > 0) {
      lines.push(`<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">航空基地：Lv${info.level}（${info.used} / ${info.capacity} 機）</div>`);
    } else if (info.queued) {
      lines.push(`<div style="font-size:11px;color:#e0b93e;margin-top:2px;">航空基地：建設中（Lv${info.queued.targetLevel}）</div>`);
    }
    if (info.wings.length) {
      const byType = {};
      for (const w of info.wings) byType[w.type] = (byType[w.type] || 0) + w.count;
      lines.push(`<div style="font-size:11px;color:#5e9ec7;margin-top:2px;">配備：${Object.entries(byType).map(([t, n]) => `${label[t] || t} ×${n}`).join(' / ')}</div>`);
    }
    if (region) {
      lines.push(`<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">空域：${region.name}（自軍 ${region.ownPct}% / 敵軍 ${region.enemyPct}%）</div>`);
    }
    lines.push(`<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">工場：${mgr.factoryCount(p.id)}</div>`);
    if (p.airDamage > 0 || p.factoryDamage > 0) {
      lines.push(`<div style="font-size:11px;color:#e08a6a;margin-top:2px;">爆撃被害：施設 ${Math.round(p.airDamage || 0)}% / 工場 ${Math.round(p.factoryDamage || 0)}%</div>`);
    }
    return lines.join('');
  }

  /* ================= 諜報（インテル・敵師団推計） ================= */

  /** IntelManager を接続（main.js から） */
  setIntelManager(mgr) {
    this.intelManager = mgr;
    if (this.mapMode === 'intel') this.renderIntelOverlay();
    return this;
  }

  /**
   * 諜報オーバーレイを描画する。
   *  ・ネットワーク構築済みの国  : 首都にネットワーク進行度リング（インテル段階色）
   *  ・軍事情報（intelTier='military'）獲得国 : 各州に敵師団配置（推計）バッジ
   */
  renderIntelOverlay() {
    const layer = this.intelLayer;
    const mgr = this.intelManager;
    if (!layer) return;
    layer.innerHTML = '';
    this.intelMarkers.clear();
    if (!mgr || this.mapMode !== 'intel') return;

    const showForces = this.state?.intel?.showEnemyForces !== false;
    const tierColor = { none: '#55606a', political: '#e0b93e', economy: '#5e9ec7', military: '#d05038' };
    const tierLabel = { none: '情報なし', political: '政治情報', economy: '経済情報', military: '軍事情報' };

    for (const tag of mgr.targets()) {
      const data = mgr.intelData(tag);
      if (!data) continue;
      const capital = PROVINCES.find((p) => p.tag === tag && p.capital)
        || PROVINCES.find((p) => p.tag === tag);
      if (!capital) continue;
      const color = tierColor[data.tier] || '#55606a';

      // ネットワーク進捗リング（首都）
      if (data.network > 0 || data.tier !== 'none') {
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('data-intel-tag', tag);
        g.setAttribute('class', 'map-intel-network');
        g.style.cursor = 'pointer';
        const r = 20;
        const ringBg = document.createElementNS(SVGNS, 'circle');
        ringBg.setAttribute('cx', capital.x);
        ringBg.setAttribute('cy', capital.y);
        ringBg.setAttribute('r', r);
        ringBg.setAttribute('fill', 'none');
        ringBg.setAttribute('stroke', '#0b0e11');
        ringBg.setAttribute('stroke-width', '4');
        ringBg.setAttribute('opacity', '.55');
        g.appendChild(ringBg);

        const arc = document.createElementNS(SVGNS, 'circle');
        const c = 2 * Math.PI * r;
        arc.setAttribute('cx', capital.x);
        arc.setAttribute('cy', capital.y);
        arc.setAttribute('r', r);
        arc.setAttribute('fill', 'none');
        arc.setAttribute('stroke', color);
        arc.setAttribute('stroke-width', '2.5');
        arc.setAttribute('stroke-dasharray', `${(c * Math.max(0.02, data.network / 100)).toFixed(1)} ${c.toFixed(1)}`);
        arc.setAttribute('transform', `rotate(-90 ${capital.x} ${capital.y})`);
        arc.setAttribute('opacity', data.network > 0 ? '1' : '.35');
        g.appendChild(arc);

        const label = document.createElementNS(SVGNS, 'text');
        label.setAttribute('x', capital.x);
        label.setAttribute('y', capital.y + 3);
        label.setAttribute('fill', color);
        label.setAttribute('font-size', '9');
        label.setAttribute('font-weight', '800');
        label.setAttribute('font-family', 'var(--mil-font)');
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('pointer-events', 'none');
        label.textContent = `${data.level}`;
        g.appendChild(label);

        Tooltip.bind(g, () => `
          <div style="font-weight:700;letter-spacing:.06em;color:${color};font-family:var(--mil-font);">${data.name} — ${tierLabel[data.tier]}</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">インテル ${data.level} / 100 ・ ネットワーク ${Math.round(data.network)}%</div>
          <div style="font-size:11px;color:var(--text-dim);">政治 ${data.political ? '公開' : '🔒'} ・ 経済 ${data.economy ? '公開' : '🔒'} ・ 軍事 ${data.military ? '公開' : '🔒'}</div>
          ${data.military ? `<div style="font-size:11px;color:#d05038;margin-top:2px;">師団 ${data.military.divisions} 個（推計）</div>` : ''}
          <div style="font-size:10px;color:#8b96a0;margin-top:3px;">クリックで諜報画面を開く</div>
        `, { kind: 'info' });
        layer.appendChild(g);
        this.intelMarkers.set(tag, g);
      }

      // 敵師団配置（軍事情報のみ）
      if (!showForces || !data.military) continue;
      for (const f of data.military.forces) {
        const prov = PROVINCE_BY_ID[f.provinceId];
        if (!prov) continue;
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('data-intel-tag', tag);
        g.setAttribute('class', 'map-intel-forces');
        g.style.cursor = 'pointer';
        const w = 26;
        const h = 14;
        const bx = prov.x - w / 2;
        const by = prov.y + 14;
        const bg = document.createElementNS(SVGNS, 'rect');
        bg.setAttribute('x', bx);
        bg.setAttribute('y', by);
        bg.setAttribute('rx', 2);
        bg.setAttribute('width', w);
        bg.setAttribute('height', h);
        bg.setAttribute('fill', '#1b2024');
        bg.setAttribute('stroke', '#d05038');
        bg.setAttribute('stroke-width', '1.2');
        bg.setAttribute('opacity', '0.94');
        g.appendChild(bg);

        const icon = document.createElementNS(SVGNS, 'text');
        icon.setAttribute('x', bx + 5);
        icon.setAttribute('y', by + 10.5);
        icon.setAttribute('fill', '#d05038');
        icon.setAttribute('font-size', '8');
        icon.setAttribute('font-weight', '800');
        icon.setAttribute('text-anchor', 'middle');
        icon.setAttribute('pointer-events', 'none');
        icon.textContent = { infantry: 'I', armor: 'T', artillery: 'A', garrison: 'G' }[f.type] || '?';
        g.appendChild(icon);

        const txt = document.createElementNS(SVGNS, 'text');
        txt.setAttribute('x', bx + w - 6);
        txt.setAttribute('y', by + 10.5);
        txt.setAttribute('fill', '#f0d8d0');
        txt.setAttribute('font-size', '9');
        txt.setAttribute('font-weight', '800');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-family', 'var(--mil-font)');
        txt.setAttribute('pointer-events', 'none');
        txt.textContent = f.count;
        g.appendChild(txt);

        Tooltip.bind(g, () => `
          <div style="font-weight:700;color:#d05038;font-family:var(--mil-font);">敵師団配置（推計）</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${prov.name} ／ ${data.name}</div>
          <div style="font-size:11px;margin-top:2px;">${f.count} 個（戦力充足 ${Math.round(f.strength * 100)}%）</div>
          <div style="font-size:10px;color:#8b96a0;margin-top:3px;">軍事情報による推計値（実際の配置とは異なります）</div>
        `, { kind: 'info' });
        layer.appendChild(g);
      }
    }
  }

  /* ================= 補給網 ================= */

  /** SupplyManager を接続（main.js から） */
  setSupplyManager(mgr) {
    this.supplyManager = mgr;
    if (this.mapMode === 'supply') this.renderSupplyNetwork();
    return this;
  }

  /** 州ツールチップ用の補給情報 */
  _supplyTooltip(p) {
    const mgr = this.supplyManager;
    if (!mgr) return '';
    const infra = mgr.infra(p.id);
    const hub = mgr.hubLevel(p.id);
    const st = mgr.statusFor(p.id);
    const rows = [];
    rows.push(`<div style="font-size:11px;color:#8fa85b;margin-top:4px;">インフラ Lv${infra} / 補給ハブ ${hub > 0 ? `Lv${hub}` : 'なし'}</div>`);
    if (!st) {
      rows.push(`<div style="font-size:11px;color:#8b96a0;">補給網：対象外（自国州ではありません）</div>`);
      return rows.join('');
    }
    const color = SUPPLY_STATUS_COLOR[st.status] || '#8b96a0';
    const pct = st.demand > 0 ? `${Math.round(Math.min(1, st.ratio) * 100)}%` : '—';
    rows.push(`<div style="font-size:11px;color:${color};margin-top:2px;">補給：${SUPPLY_STATUS_LABEL[st.status] || st.status}（充足率 ${pct}）</div>`);
    rows.push(`<div style="font-size:11px;color:var(--text-dim);">容量 ${st.capacity} / 需要 ${st.demand}（師団 ${st.divisions} 個）</div>`);
    if (st.demand > 0 && st.ratio < 1) {
      const pen = st.penalties;
      rows.push(`<div style="font-size:11px;color:#d05038;margin-top:2px;">補給不足ペナルティ：速度 -${Math.round((1 - pen.speed) * 100)}% / 戦闘力 -${Math.round((1 - pen.combat) * 100)}% / 組織率 -${Math.round((1 - pen.org) * 100)}%</div>`);
    }
    return rows.join('');
  }

  /** 補給モードの描画（首都 → ハブの鉄道網 + ハブからの分配 + 状態マーカー） */
  renderSupplyNetwork() {
    const routeLayer = this.supplyRouteLayer;
    const markerLayer = this.supplyLayer;
    if (!routeLayer || !markerLayer) return;
    routeLayer.innerHTML = '';
    markerLayer.innerHTML = '';
    const active = this.mapMode === 'supply';
    routeLayer.style.display = active ? '' : 'none';
    markerLayer.style.display = active ? '' : 'none';
    if (!active) return;
    const net = this.supplyManager?.network();
    if (!net) return;

    const colorOf = (status) => SUPPLY_STATUS_COLOR[status] || SUPPLY_STATUS_COLOR.none;
    const pathPoints = (ids) => ids.map((id) => this.byId[id]).filter(Boolean);
    const pointsAttr = (list) => list.map((p) => `${p.x},${p.y}`).join(' ');

    // --- 分配線（ハブ → 州）: 細い線
    for (const d of net.distribution || []) {
      const a = this.byId[d.from];
      const b = this.byId[d.to];
      if (!a || !b) continue;
      const line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', a.x);
      line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x);
      line.setAttribute('y2', b.y);
      line.setAttribute('stroke', colorOf(d.status));
      line.setAttribute('stroke-width', '1.1');
      line.setAttribute('stroke-opacity', d.status === 'ok' ? '0.38' : '0.7');
      line.setAttribute('stroke-dasharray', '3 5');
      line.classList.add('supply-distribution');
      routeLayer.appendChild(line);
    }

    // --- 主要鉄道（首都 → 補給ハブ）: 太い線 + 流れる破線
    for (const r of net.routes || []) {
      const pts = pathPoints(r.path || []);
      if (pts.length < 2) continue;
      const color = colorOf(r.status);
      const g = document.createElementNS(SVGNS, 'g');
      g.classList.add('supply-route-group');
      const under = document.createElementNS(SVGNS, 'polyline');
      under.setAttribute('points', pointsAttr(pts));
      under.setAttribute('fill', 'none');
      under.setAttribute('stroke', '#070a0c');
      under.setAttribute('stroke-width', String(6 + Math.min(3, r.level)));
      under.setAttribute('stroke-opacity', '0.75');
      under.setAttribute('stroke-linecap', 'round');
      g.appendChild(under);
      const line = document.createElementNS(SVGNS, 'polyline');
      line.setAttribute('points', pointsAttr(pts));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', String(2.4 + Math.min(2, r.level * 0.6)));
      line.setAttribute('stroke-opacity', '0.92');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      line.setAttribute('stroke-dasharray', '10 6');
      line.classList.add('supply-route');
      g.appendChild(line);
      g.style.pointerEvents = 'auto';
      const hub = net.hubs.find((h) => h.provinceId === r.to);
      const names = pathPoints(r.path || []).map((p) => p.name).join(' → ');
      Tooltip.bind(g, () => `
        <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">${hub?.name || r.to} 補給線</div>
        <div style="font-size:11px;color:${color};margin-top:2px;">状態：${SUPPLY_STATUS_LABEL[r.status] || r.status}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">経路：${names || '鉄道網未接続'}</div>
        <div style="font-size:11px;color:var(--text-dim);">スループット：${r.throughput} / ハブLv${r.level}</div>
        <div style="font-size:11px;color:var(--text-dim);">鉄道品質（経路最低インフラ）：Lv${hub?.pathInfra ?? 0}</div>
      `, { kind: r.status === 'critical' ? 'bad' : r.status === 'low' ? 'warn' : 'good' });
      routeLayer.appendChild(g);
    }

    // --- 州の補給状態リング
    for (const st of Object.values(net.provinces || {})) {
      const p = this.byId[st.provinceId];
      if (!p) continue;
      const color = colorOf(st.status);
      const ring = document.createElementNS(SVGNS, 'circle');
      ring.setAttribute('cx', p.x);
      ring.setAttribute('cy', p.y);
      ring.setAttribute('r', p.capital ? 20 : 17);
      ring.setAttribute('fill', color);
      ring.setAttribute('fill-opacity', st.status === 'ok' ? '0.06' : '0.13');
      ring.setAttribute('stroke', color);
      ring.setAttribute('stroke-width', '1.2');
      ring.setAttribute('stroke-opacity', st.status === 'ok' ? '0.45' : '0.85');
      ring.style.pointerEvents = 'none';
      markerLayer.appendChild(ring);

      // 不足・枯渇の州には充足率バッジを表示
      if (st.status === 'low' || st.status === 'critical') {
        const bg = document.createElementNS(SVGNS, 'rect');
        bg.setAttribute('x', p.x - 16);
        bg.setAttribute('y', p.y - (p.capital ? 32 : 29));
        bg.setAttribute('width', 32);
        bg.setAttribute('height', 12);
        bg.setAttribute('rx', 2);
        bg.setAttribute('fill', '#0b0e11');
        bg.setAttribute('fill-opacity', '0.9');
        bg.setAttribute('stroke', color);
        bg.setAttribute('stroke-width', '1');
        bg.style.pointerEvents = 'none';
        markerLayer.appendChild(bg);
        const txt = document.createElementNS(SVGNS, 'text');
        txt.setAttribute('x', p.x);
        txt.setAttribute('y', p.y - (p.capital ? 23 : 20));
        txt.setAttribute('fill', color);
        txt.setAttribute('font-size', '9');
        txt.setAttribute('font-weight', '800');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-family', 'var(--mil-font)');
        txt.textContent = st.demand > 0 ? `${Math.round(Math.min(1, st.ratio) * 100)}%` : '—';
        txt.style.pointerEvents = 'none';
        markerLayer.appendChild(txt);
      }
    }

    // --- 補給ハブのマーカー
    for (const hub of net.hubs || []) {
      const p = this.byId[hub.provinceId];
      if (!p) continue;
      const color = colorOf(hub.status);
      const g = document.createElementNS(SVGNS, 'g');
      g.classList.add('supply-hub');
      g.style.cursor = 'help';
      const halo = document.createElementNS(SVGNS, 'circle');
      halo.setAttribute('cx', p.x);
      halo.setAttribute('cy', p.y);
      halo.setAttribute('r', 14);
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', color);
      halo.setAttribute('stroke-width', '1');
      halo.setAttribute('stroke-opacity', '0.55');
      halo.setAttribute('stroke-dasharray', '3 3');
      g.appendChild(halo);
      const body = document.createElementNS(SVGNS, 'circle');
      body.setAttribute('cx', p.x);
      body.setAttribute('cy', p.y);
      body.setAttribute('r', 9);
      body.setAttribute('fill', '#141a1f');
      body.setAttribute('stroke', color);
      body.setAttribute('stroke-width', '2');
      g.appendChild(body);
      const txt = document.createElementNS(SVGNS, 'text');
      txt.setAttribute('x', p.x);
      txt.setAttribute('y', p.y + 3.5);
      txt.setAttribute('fill', color);
      txt.setAttribute('font-size', '9');
      txt.setAttribute('font-weight', '900');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-family', 'var(--mil-font)');
      txt.textContent = hub.isCapital ? '★' : String(hub.level);
      g.appendChild(txt);
      const label = document.createElementNS(SVGNS, 'text');
      label.setAttribute('x', p.x);
      label.setAttribute('y', p.y + (p.capital ? 34 : 32));
      label.setAttribute('fill', color);
      label.setAttribute('font-size', '8');
      label.setAttribute('font-weight', '700');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = hub.isCapital ? '首都 補給源' : `補給ハブ Lv${hub.level}`;
      label.style.pointerEvents = 'none';
      g.appendChild(label);
      g.style.pointerEvents = 'auto';
      Tooltip.bind(g, () => `
        <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">${hub.name}${hub.isCapital ? '（首都）' : ' 補給ハブ'}</div>
        <div style="font-size:11px;color:${color};margin-top:2px;">状態：${SUPPLY_STATUS_LABEL[hub.status] || hub.status}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">レベル：Lv${hub.level} / スループット ${hub.throughput}</div>
        <div style="font-size:11px;color:var(--text-dim);">分配範囲：${hub.range} 州 / 供給州数 ${hub.servedCount}</div>
        <div style="font-size:11px;color:var(--text-dim);">経路インフラ：Lv${hub.pathInfra} / ハブ州インフラ：Lv${hub.hubInfra}</div>
        ${hub.disconnected ? '<div style="font-size:11px;color:#d05038;">首都からの鉄道網が未接続</div>' : ''}
      `, { kind: hub.status === 'critical' ? 'bad' : hub.status === 'low' ? 'warn' : 'good' });
      markerLayer.appendChild(g);
    }

    Tooltip.attachAll(this.svg);
  }

  /* ================= 師団描画 ================= */

  renderDivisions() {
    this.divisionLayer.innerHTML = '';
    this.divisionIcons.clear();
    // 同一州に複数師団がいる場合はリング状に展開（カウンターの重なり防止）
    const stacks = new Map();

    for (const div of this.state.divisions) {
      const p = this.byId[div.provinceId];
      if (!p) continue;

      const idx = stacks.get(p.id) || 0;
      stacks.set(p.id, idx + 1);
      const ring = Math.floor(idx / 6);
      const spread = idx === 0 ? 0 : 20 + ring * 10;
      const ang = (idx % 6) * (Math.PI * 2 / 6) - Math.PI / 2 + ring * 0.5;
      const px = p.x + Math.cos(ang) * spread;
      const py = p.y + Math.sin(ang) * spread;

      const sym = UNIT_SYMBOLS[div.type] || UNIT_SYMBOLS.infantry;
      const g = document.createElementNS(SVGNS, 'g');
      g.classList.add('map-division');
      g.setAttribute('data-division', div.id);
      g.style.cursor = 'pointer';

      // 外円（所属国色の縁取り）
      const outer = document.createElementNS(SVGNS, 'circle');
      outer.setAttribute('cx', px);
      outer.setAttribute('cy', py);
      outer.setAttribute('r', 14);
      outer.setAttribute('fill', 'none');
      outer.setAttribute('stroke', NATION_COLORS[div.tag || this.state.playerTag] || '#fff');
      outer.setAttribute('stroke-width', '2');
      outer.setAttribute('stroke-opacity', '0.9');
      g.appendChild(outer);

      // 内円（兵科色）
      const inner = document.createElementNS(SVGNS, 'circle');
      inner.setAttribute('cx', px);
      inner.setAttribute('cy', py);
      inner.setAttribute('r', 11);
      inner.setAttribute('fill', sym.fill);
      inner.setAttribute('stroke', sym.color);
      inner.setAttribute('stroke-width', '1.5');
      g.appendChild(inner);

      // シンボル文字
      const symText = document.createElementNS(SVGNS, 'text');
      symText.setAttribute('x', px);
      symText.setAttribute('y', py + 4);
      symText.setAttribute('fill', sym.color);
      symText.setAttribute('font-size', '11');
      symText.setAttribute('font-weight', '900');
      symText.setAttribute('font-family', 'var(--mil-font)');
      symText.setAttribute('text-anchor', 'middle');
      symText.textContent = sym.symbol;
      g.appendChild(symText);

      // 充足度バー（オレンジ）— 背景
      const supBg = document.createElementNS(SVGNS, 'rect');
      supBg.setAttribute('x', px - 22);
      supBg.setAttribute('y', py + 18);
      supBg.setAttribute('width', 44);
      supBg.setAttribute('height', 5);
      supBg.setAttribute('fill', '#0e1114');
      supBg.setAttribute('stroke', '#0b0e11');
      supBg.setAttribute('stroke-width', '0.5');
      g.appendChild(supBg);
      const supFill = document.createElementNS(SVGNS, 'rect');
      supFill.setAttribute('x', px - 22);
      supFill.setAttribute('y', py + 18);
      supFill.setAttribute('width', Math.max(1, 44 * (div.supply ?? 1)));
      supFill.setAttribute('height', 5);
      supFill.setAttribute('fill', supplyBarColor(div)); // 緑/黄/赤（補給状態）
      supFill.setAttribute('stroke', '#0b0e11');
      supFill.setAttribute('stroke-width', '0.5');
      g.appendChild(supFill);

      // 指揮統制率バー（緑）
      const cmdBg = document.createElementNS(SVGNS, 'rect');
      cmdBg.setAttribute('x', px - 22);
      cmdBg.setAttribute('y', py + 25);
      cmdBg.setAttribute('width', 44);
      cmdBg.setAttribute('height', 5);
      cmdBg.setAttribute('fill', '#0e1114');
      cmdBg.setAttribute('stroke', '#0b0e11');
      cmdBg.setAttribute('stroke-width', '0.5');
      g.appendChild(cmdBg);
      const cmdFill = document.createElementNS(SVGNS, 'rect');
      cmdFill.setAttribute('x', px - 22);
      cmdFill.setAttribute('y', py + 25);
      cmdFill.setAttribute('width', Math.max(1, 44 * (div.command || 1)));
      cmdFill.setAttribute('height', 5);
      cmdFill.setAttribute('fill', '#7ec850'); // 緑
      cmdFill.setAttribute('stroke', '#0b0e11');
      cmdFill.setAttribute('stroke-width', '0.5');
      g.appendChild(cmdFill);

      // ラベル（師団名・タイプ）
      const lbl = document.createElementNS(SVGNS, 'text');
      lbl.setAttribute('x', px);
      lbl.setAttribute('y', py - 16);
      lbl.setAttribute('fill', '#d7dde2');
      lbl.setAttribute('font-size', '9.5');
      lbl.setAttribute('font-weight', '700');
      lbl.setAttribute('font-family', 'var(--mil-font)');
      lbl.setAttribute('text-anchor', 'middle');
      lbl.textContent = div.name || I18N.t(`division.types.${div.type}` || div.type);
      g.appendChild(lbl);

      // 充足・指揮値テキスト
      const valTxt = document.createElementNS(SVGNS, 'text');
      valTxt.setAttribute('x', px);
      valTxt.setAttribute('y', py + 34);
      valTxt.setAttribute('fill', '#8b96a0');
      valTxt.setAttribute('font-size', '8.5');
      valTxt.setAttribute('text-anchor', 'middle');
      valTxt.textContent = `補給 ${Math.round((div.supplyRatio ?? div.supply ?? 1) * 100)}% / 指揮 ${Math.round((div.command || 1) * 100)}%`;
      g.appendChild(valTxt);

      // 計画準備ボーナス（作戦計画に配属されている場合）
      const plan = (this.state.battlePlans || []).find((bp) => (bp.divisions || []).includes(div.id));
      const planningLine = plan
        ? `<div style="font-size:11px;color:#e6c268;margin-top:2px;">作戦計画：${plan.name}（計画準備 +${(plan.planning * 100).toFixed(1)}%）</div>`
        : '';
      // ツールチップ
      const tipHtml = `
        <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">${div.name || div.type}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">所在地：${p.name}（${I18N.terrainName(p.terrain) || terrainInfo(p.terrain).name}）</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">兵科：${I18N.t(`division.types.${div.type}`) || div.type}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">組織力：${Math.round(div.org || 0)} / ${div.maxOrg || 0}${div.effectiveMaxOrg ? `（補給上限 ${div.effectiveMaxOrg}）` : ''}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">人員：${Math.round(div.hp || 0)} / ${div.maxHp || 0}</div>
        <div style="font-size:11px;color:${supplyBarColor(div)};margin-top:2px;">補給：${Math.round((div.supplyRatio ?? div.supply ?? 1) * 100)}%（容量 ${div.supplyCapacity ?? '—'} / 需要 ${div.supplyDemand ?? '—'}）</div>
        ${div.supplyPenalty && div.supplyPenalty.penaltyPct > 0 ? `<div style="font-size:11px;color:#d05038;margin-top:2px;">補給不足：速度 -${Math.round((1 - div.supplyPenalty.speed) * 100)}% / 戦闘力 -${Math.round((1 - div.supplyPenalty.combat) * 100)}% / 組織率 -${Math.round((1 - div.supplyPenalty.org) * 100)}%</div>` : ''}
        <div style="font-size:11px;color:#7ec850;margin-top:2px;">指揮統制率：${Math.round((div.command || 1) * 100)}%</div>
        ${planningLine}
      `;
      Tooltip.bind(g, tipHtml, { kind: 'info' });

      this.divisionLayer.appendChild(g);
      this.divisionIcons.set(div.id, { g, supFill, cmdFill, valTxt, x: px, y: py });
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
      icon.supFill.setAttribute('width', Math.max(1, 44 * (div.supply ?? 1)));
      icon.supFill.setAttribute('fill', supplyBarColor(div));
      icon.cmdFill.setAttribute('width', Math.max(1, 44 * (div.command || 1)));
      if (icon.valTxt) {
        icon.valTxt.textContent = `補給 ${Math.round((div.supplyRatio ?? div.supply ?? 1) * 100)}% / 指揮 ${Math.round((div.command || 1) * 100)}%`;
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

  /* ================= 作戦計画（前線・攻撃線） ================= */

  /** 前線ポリライン・攻撃線矢印・計画準備表示を描画 */
  renderBattlePlans() {
    if (!this.planLayer) return;
    this.planLayer.innerHTML = '';
    const plans = this.state.battlePlans || [];
    if (!plans.length) return;

    this._ensurePlanDefs();

    for (const plan of plans) {
      const isPlayer = plan.tag === this.state.playerTag;
      const color = isPlayer ? '#e6c268' : '#d05038';
      const tag = plan.tag;

      /* --- 前線: 前線州を結ぶポリライン --- */
      const pts = (plan.frontline || [])
        .map((id) => this.byId[id])
        .filter(Boolean);
      if (pts.length === 1) {
        const ring = document.createElementNS(SVGNS, 'circle');
        ring.setAttribute('cx', pts[0].x); ring.setAttribute('cy', pts[0].y);
        ring.setAttribute('r', 16);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', color);
        ring.setAttribute('stroke-width', '3');
        ring.classList.add('plan-frontline');
        this.planLayer.appendChild(ring);
      } else if (pts.length > 1) {
        const poly = document.createElementNS(SVGNS, 'polyline');
        poly.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', color);
        poly.setAttribute('stroke-width', '4');
        poly.setAttribute('stroke-linecap', 'round');
        poly.setAttribute('stroke-linejoin', 'round');
        poly.setAttribute('opacity', '0.9');
        poly.classList.add('plan-frontline');
        if (plan.executing) poly.classList.add('advancing');
        this.planLayer.appendChild(poly);

        // 前線州のマーカー（陣地）
        for (const p of pts) {
          const dot = document.createElementNS(SVGNS, 'rect');
          dot.setAttribute('x', p.x - 7); dot.setAttribute('y', p.y - 7);
          dot.setAttribute('width', 14); dot.setAttribute('height', 14);
          dot.setAttribute('transform', `rotate(45 ${p.x} ${p.y})`);
          dot.setAttribute('fill', color);
          dot.setAttribute('fill-opacity', '0.18');
          dot.setAttribute('stroke', color);
          dot.setAttribute('stroke-width', '1.5');
          this.planLayer.appendChild(dot);
        }
      }

      /* --- 計画準備ボーナスのラベル（前線中央） --- */
      if (pts.length) {
        const mid = pts[Math.floor(pts.length / 2)];
        const cap = this.battlePlan?.maxPlanningBonus?.() ?? 0.30;
        const pct = Math.round(Math.min(plan.planning / cap, 1) * 100);
        const label = document.createElementNS(SVGNS, 'g');
        label.classList.add('plan-label-group');
        const bg = document.createElementNS(SVGNS, 'rect');
        const w = 128, h = 26;
        bg.setAttribute('x', mid.x - w / 2);
        bg.setAttribute('y', mid.y - 46);
        bg.setAttribute('width', w);
        bg.setAttribute('height', h);
        bg.setAttribute('rx', 4);
        bg.setAttribute('fill', '#0b0e11');
        bg.setAttribute('fill-opacity', '0.85');
        bg.setAttribute('stroke', color);
        bg.setAttribute('stroke-width', '1');
        bg.setAttribute('stroke-opacity', '0.6');
        label.appendChild(bg);

        const txt = document.createElementNS(SVGNS, 'text');
        txt.setAttribute('x', mid.x);
        txt.setAttribute('y', mid.y - 33);
        txt.setAttribute('fill', color);
        txt.setAttribute('font-size', '9.5');
        txt.setAttribute('font-weight', '800');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-family', 'var(--mil-font)');
        txt.textContent = `${plan.executing ? '実行中' : '準備'} ${pct}%`;
        label.appendChild(txt);

        const barBg = document.createElementNS(SVGNS, 'rect');
        barBg.setAttribute('x', mid.x - w / 2 + 8);
        barBg.setAttribute('y', mid.y - 28);
        barBg.setAttribute('width', w - 16);
        barBg.setAttribute('height', 4);
        barBg.setAttribute('fill', '#1b2127');
        label.appendChild(barBg);
        const barFill = document.createElementNS(SVGNS, 'rect');
        barFill.setAttribute('x', mid.x - w / 2 + 8);
        barFill.setAttribute('y', mid.y - 28);
        barFill.setAttribute('width', Math.max(0, (w - 16) * (plan.planning / cap)));
        barFill.setAttribute('height', 4);
        barFill.setAttribute('fill', color);
        label.appendChild(barFill);
        this.planLayer.appendChild(label);
      }

      /* --- 攻撃線: 経路に沿った矢印 --- */
      for (const goal of plan.goals || []) {
        const pathPts = (goal.path || []).map((id) => this.byId[id]).filter(Boolean);
        if (pathPts.length < 2) continue;
        const d = pathPts
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
          .join(' ');
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', goal.done ? '#7ec850' : color);
        path.setAttribute('stroke-width', '3');
        path.setAttribute('stroke-dasharray', '10 6');
        path.setAttribute('stroke-opacity', '0.95');
        path.setAttribute('marker-end', `url(#plan-arrow-${isPlayer ? 'player' : 'enemy'})`);
        path.classList.add('plan-arrow');
        if (plan.executing) path.classList.add('advancing');
        this.planLayer.appendChild(path);

        // 目標マーカー
        const target = pathPts[pathPts.length - 1];
        const marker = document.createElementNS(SVGNS, 'g');
        const ring = document.createElementNS(SVGNS, 'circle');
        ring.setAttribute('cx', target.x); ring.setAttribute('cy', target.y);
        ring.setAttribute('r', 18);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', goal.done ? '#7ec850' : color);
        ring.setAttribute('stroke-width', '2');
        ring.setAttribute('stroke-dasharray', '4 4');
        marker.appendChild(ring);
        const cross1 = document.createElementNS(SVGNS, 'line');
        cross1.setAttribute('x1', target.x - 6); cross1.setAttribute('y1', target.y - 6);
        cross1.setAttribute('x2', target.x + 6); cross1.setAttribute('y2', target.y + 6);
        cross1.setAttribute('stroke', goal.done ? '#7ec850' : color);
        cross1.setAttribute('stroke-width', '2');
        marker.appendChild(cross1);
        const cross2 = document.createElementNS(SVGNS, 'line');
        cross2.setAttribute('x1', target.x + 6); cross2.setAttribute('y1', target.y - 6);
        cross2.setAttribute('x2', target.x - 6); cross2.setAttribute('y2', target.y + 6);
        cross2.setAttribute('stroke', goal.done ? '#7ec850' : color);
        cross2.setAttribute('stroke-width', '2');
        marker.appendChild(cross2);
        this.planLayer.appendChild(marker);
      }

      /* --- 進軍中の師団の軌跡（デバッグ用の淡い線） --- */
      void tag;
    }
    Tooltip.attachAll(this.svg);
  }

  _ensurePlanDefs() {
    if (this.svg.querySelector('#plan-arrow-player')) return;
    const defs = document.createElementNS(SVGNS, 'defs');
    const mk = (id, fill) => {
      const marker = document.createElementNS(SVGNS, 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('markerWidth', '12');
      marker.setAttribute('markerHeight', '12');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '4');
      marker.setAttribute('orient', 'auto');
      marker.setAttribute('markerUnits', 'userSpaceOnUse');
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', 'M0,0 L0,8 L10,4 z');
      path.setAttribute('fill', fill);
      marker.appendChild(path);
      defs.appendChild(marker);
    };
    mk('plan-arrow-player', '#e6c268');
    mk('plan-arrow-enemy', '#d05038');
    this.svg.insertBefore(defs, this.svg.firstChild);
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

      // CAS 支援中マーカー（航空機アイコン）
      if (cb.cas) {
        const air = document.createElementNS(SVGNS, 'text');
        air.setAttribute('x', p.x + r - 2);
        air.setAttribute('y', p.y - r + 2);
        air.setAttribute('fill', '#ffd76a');
        air.setAttribute('font-size', '13');
        air.setAttribute('font-weight', '900');
        air.setAttribute('text-anchor', 'middle');
        air.setAttribute('class', 'cas-marker');
        air.textContent = '✈';
        g.appendChild(air);
      }

      // ツールチップ
      const tipHtml = `
        <div style="font-weight:700;letter-spacing:.08em;font-family:var(--mil-font);color:var(--gold);">戦闘：${p.name}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">攻撃側：${cb.attackerName || '—'} / 防御側：${cb.defenderName || '—'}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">地形：${I18N.terrainName(p.terrain) || terrainInfo(p.terrain).name}</div>
        <div style="font-size:11px;color:${advantageColor(cb.advantage || 'yellow')};margin-top:2px;">状況：${cb.advantage === 'green' ? '攻撃側優勢' : cb.advantage === 'red' ? '防御側優勢' : '均衡'}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">戦闘強度：${Math.round((cb.intensity || 0) * 100)}%</div>
        ${cb.cas ? `<div style="font-size:11px;color:#ffd76a;margin-top:3px;">近接航空支援：+${Math.round((cb.cas.bonus || 0) * 100)}%（${cb.cas.aircraft || 0} 機・航空隊 ${cb.cas.wingCount || 0}）</div>
        <div style="font-size:11px;color:#ffd76a;">CAS 与ダメージ：${(cb.cas.damage || 0).toFixed(1)} / 時</div>` : ''}
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
    const px = kmToPixels(rangeKm);
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
