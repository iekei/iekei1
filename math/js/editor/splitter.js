// js/editor/splitter.js — リサイズ可能ドッキングレイアウト

export class Splitter {
  constructor() {
    this.storageKey = 'mathclip_layout';
    this.defaults = { leftWidth: 256, rightWidth: 320, timelineHeight: 192 };
    this._restore();
    this._bind();
  }

  _restore() {
    let layout = this.defaults;
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) layout = { ...this.defaults, ...JSON.parse(saved) };
    } catch (e) { /* use defaults */ }
    this._apply(layout);
  }

  _apply(layout) {
    const lp = document.getElementById('property-panel');
    const rp = document.getElementById('material-panel');
    const tl = document.getElementById('timeline-section');
    if (lp) lp.style.width = layout.leftWidth + 'px';
    if (rp) rp.style.width = layout.rightWidth + 'px';
    if (tl) tl.style.height = layout.timelineHeight + 'px';
  }

  _save(layout) {
    localStorage.setItem(this.storageKey, JSON.stringify(layout));
  }

  _saveCurrent() {
    const lp = document.getElementById('property-panel');
    const rp = document.getElementById('material-panel');
    const tl = document.getElementById('timeline-section');
    this._save({
      leftWidth: lp ? lp.offsetWidth : this.defaults.leftWidth,
      rightWidth: rp ? rp.offsetWidth : this.defaults.rightWidth,
      timelineHeight: tl ? tl.offsetHeight : this.defaults.timelineHeight,
    });
  }

  reset() {
    this._apply(this.defaults);
    this._save(this.defaults);
  }

  _bind() {
    // Left splitter (property | center) — drag right = wider left panel
    this._bindBar('splitter-left', true, (delta) => {
      const panel = document.getElementById('property-panel');
      if (!panel || panel.classList.contains('collapsed')) return;
      const w = Math.max(180, Math.min(500, panel.offsetWidth + delta));
      panel.style.width = w + 'px';
    });

    // Right splitter (center | material) — drag right = narrower right panel
    this._bindBar('splitter-right', true, (delta) => {
      const panel = document.getElementById('material-panel');
      if (!panel || panel.classList.contains('collapsed')) return;
      const w = Math.max(180, Math.min(500, panel.offsetWidth - delta));
      panel.style.width = w + 'px';
    });

    // Bottom splitter (top row | timeline) — drag up = taller timeline
    this._bindBar('splitter-bottom', false, (delta) => {
      const tl = document.getElementById('timeline-section');
      if (!tl || tl.classList.contains('collapsed')) return;
      const h = Math.max(150, Math.min(600, tl.offsetHeight - delta));
      tl.style.height = h + 'px';
    });
  }

  _bindBar(id, isVertical, onDelta) {
    const bar = document.getElementById(id);
    if (!bar) return;
    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let last = isVertical ? e.clientX : e.clientY;
      const onMove = (ev) => {
        const current = isVertical ? ev.clientX : ev.clientY;
        const delta = current - last;
        last = current;
        onDelta(delta);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        this._saveCurrent();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    });
  }
}
