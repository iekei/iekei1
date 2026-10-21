/**
 * tooltip.js — HoI4風 詳細ツールチップシステム
 *
 *  - data-tip / data-tip-html 属性を持つ要素にマウスホバーでツールチップ表示
 *  - Tooltip.bind(elem, htmlGetter) でプログラマティブに紐付け
 *  - 単一の固定ツールチップ層。マウス追従 + 画外クランプ
 *  - 要素ごとに "good/bad/warn/info" スタイルを適用可能
 */

import { el } from './util.js';

export const Tooltip = {
  container: null,
  visible: false,
  currentTarget: null,
  showDelay: 260,
  _timer: null,

  init() {
    if (this.container) return;
    const layer = el('div', 'tooltip-layer');
    layer.style.position = 'fixed';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '9999';
    layer.style.left = '0';
    layer.style.top = '0';
    layer.style.width = '100vw';
    layer.style.height = '100vh';
    document.body.appendChild(layer);

    const tip = el('div', 'tooltip');
    tip.style.position = 'absolute';
    tip.style.display = 'none';
    tip.style.maxWidth = '340px';
    tip.style.padding = '10px 12px';
    tip.style.fontSize = '12px';
    tip.style.lineHeight = '1.55';
    tip.style.color = '#d7dde2';
    tip.style.background = 'linear-gradient(180deg, #2b323a, #1a1f24)';
    tip.style.border = '1px solid #0b0e11';
    tip.style.borderLeft = '3px solid var(--gold-dim)';
    tip.style.borderRadius = '4px';
    tip.style.boxShadow = '0 8px 24px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.06)';
    tip.style.whiteSpace = 'pre-wrap';
    tip.style.wordBreak = 'break-word';
    tip.style.backdropFilter = 'blur(2px)';
    layer.appendChild(tip);

    this.container = layer;
    this.element = tip;

    this.container.addEventListener('mousemove', (e) => this._move(e));
    // タッチ/スクロールで即隠す
    window.addEventListener('scroll', () => this.hide(), true);
  },

  /** 要素にツールチップを紐付け。html は文字列または () => 文字列 の関数 */
  bind(target, html, opts = {}) {
    this.init();
    const elem = typeof target === 'string' ? document.querySelector(target) : target;
    if (!elem) return;
    const kind = opts.kind || '';
    const getHtml = typeof html === 'function' ? html : () => html;
    const show = (e) => {
      this._timer = setTimeout(() => this._show(elem, getHtml(elem), e, kind), this.showDelay);
    };
    const hide = () => {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this.hide();
    };
    elem.addEventListener('mouseenter', show);
    elem.addEventListener('focus', show);
    elem.addEventListener('mouseleave', hide);
    elem.addEventListener('blur', hide);
    // data-tip 属性による自動登録
    return () => {
      elem.removeEventListener('mouseenter', show);
      elem.removeEventListener('focus', show);
      elem.removeEventListener('mouseleave', hide);
      elem.removeEventListener('blur', hide);
    };
  },

  _show(target, html, e, kind) {
    if (!html) return;
    this.element.innerHTML = html;
    this.element.className = `tooltip ${kind}`.trim();
    this.element.style.display = 'block';
    this.visible = true;
    this._move(e);
  },

  hide() {
    if (!this.element) return;
    this.element.style.display = 'none';
    this.visible = false;
    this.currentTarget = null;
  },

  _move(e) {
    if (!this.visible) return;
    const el = this.element;
    const rect = el.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const x = Math.min(e.clientX + 14, window.innerWidth - w - 10);
    const y = Math.min(e.clientY + 20, window.innerHeight - h - 10);
    el.style.left = `${Math.max(10, x)}px`;
    el.style.top = `${Math.max(10, y)}px`;
    this.currentTarget = e.target;
  },

  /** data-tip / data-tip-html 属性を持つ全要素に自動紐付け（動的描画後に呼ぶ） */
  attachAll(root = document) {
    this.init();
    const attrEls = root.querySelectorAll('[data-tip]');
    attrEls.forEach((n) => {
      if (n._ttBound) return;
      n._ttBound = true;
      const html = n.getAttribute('data-tip');
      const kind = n.getAttribute('data-tip-kind') || '';
      this.bind(n, html, { kind });
    });
    const htmlEls = root.querySelectorAll('[data-tip-html]');
    htmlEls.forEach((n) => {
      if (n._ttHtmlBound) return;
      n._ttHtmlBound = true;
      // data-tip-html は JS で評価させるため key 形式を想定: "i18n.key" または生HTML
      const raw = n.getAttribute('data-tip-html');
      this.bind(n, () => {
        if (raw.startsWith('i18n:')) {
          const key = raw.slice(5);
          return I18N ? I18N.t(key) : key;
        }
        return raw;
      }, { kind: n.getAttribute('data-tip-kind') || '' });
    });
  },
};

export default Tooltip;
