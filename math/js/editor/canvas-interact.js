// js/editor/canvas-interact.js — プレビューキャンバス上で素材をドラッグ移動・拡大縮小

import { computeEffect } from './effects.js';

export class CanvasInteract {
  constructor(timeline) {
    this.timeline = timeline;
    this.canvas = timeline.canvas;
    this.overlay = document.getElementById('preview-overlay');
    this.box = null;
    this.handles = [];
    this.dragging = null;
    this._currentClipId = null;
  }

  /** render()から毎フレーム呼ばれる — 選択中クリップの操作ボックスを更新 */
  update() {
    const clip = this.timeline.selectedClip;

    // 再生中、または選択なし、または現在時刻で非表示 → 非表示
    if (!clip || this.timeline.playing) {
      this._clear();
      return;
    }
    const localTime = this.timeline.currentTime - clip.start;
    if (localTime < 0 || localTime > clip.duration) {
      this._clear();
      return;
    }

    // クリップが変わったら再構築
    if (this._currentClipId !== clip.id) {
      this._clear();
      this._currentClipId = clip.id;
    }

    this._render(clip);
  }

  _clear() {
    if (this.overlay) this.overlay.innerHTML = '';
    this.overlay.style.pointerEvents = 'none';
    this.box = null;
    this.handles = [];
    this._currentClipId = null;
  }

  /** 選択クリップの表示領域バウンディングボックス(CSS px)を計算 */
  _getBBox(clip) {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const w = canvas.width, h = canvas.height;
    const sx = rect.width / w;   // canvas→display 横倍率
    const sy = rect.height / h;  // canvas→display 縦倍率
    const state = computeEffect(clip, this.timeline.currentTime - clip.start);

    const cx = (clip.x ?? 0.5) * w + state.offsetX;
    const cy = (clip.y ?? 0.5) * h + state.offsetY;

    let bw, bh;
    if (clip.type === 'text') {
      const fx = clip.effects || {};
      const fontSize = (fx.fontSize || 48) * (h / 360);
      const ctx = this.timeline.ctx;
      ctx.font = `${fx.fontWeight || 700} ${fontSize}px "${fx.fontFamily || 'M PLUS 1p'}", "Noto Sans JP", sans-serif`;
      const displayText = state.revealChars >= 0 ? (clip.text || '').slice(0, state.revealChars) : (clip.text || '');
      bw = Math.max(ctx.measureText(displayText).width, 20) * state.scaleX;
      bh = fontSize * 1.3 * state.scaleY;
    } else {
      const source = clip._img || clip._video;
      const sw = source?.videoWidth || source?.naturalWidth || source?.width || 16;
      const sh = source?.videoHeight || source?.naturalHeight || source?.height || 9;
      const coverScale = Math.max(w / sw, h / sh);
      bw = sw * coverScale * state.scaleX;
      bh = sh * coverScale * state.scaleY;
    }

    return {
      x: cx * sx - (bw * sx) / 2,
      y: cy * sy - (bh * sy) / 2,
      w: bw * sx,
      h: bh * sy,
    };
  }

  _render(clip) {
    const bbox = this._getBBox(clip);
    if (bbox.w < 4 || bbox.h < 4) { this._clear(); return; }

    this.overlay.style.pointerEvents = 'auto';

    if (!this.box) {
      this.box = document.createElement('div');
      this.box.className = 'clip-select-box';
      this.overlay.appendChild(this.box);

      for (const pos of ['nw', 'ne', 'sw', 'se']) {
        const handle = document.createElement('div');
        handle.className = `clip-resize-handle clip-resize-${pos}`;
        handle.dataset.handle = pos;
        this.box.appendChild(handle);
        this.handles.push(handle);
      }

      this._bindEvents();
    }

    this.box.style.left = bbox.x + 'px';
    this.box.style.top = bbox.y + 'px';
    this.box.style.width = bbox.w + 'px';
    this.box.style.height = bbox.h + 'px';
  }

  _bindEvents() {
    // ボックス本体をドラッグ → 移動
    this.box.addEventListener('mousedown', (e) => {
      if (e.target.dataset.handle) return;
      e.preventDefault();
      e.stopPropagation();
      const clip = this.timeline.selectedClip;
      const rect = this.canvas.getBoundingClientRect();
      this.dragging = {
        type: 'move',
        startX: e.clientX,
        startY: e.clientY,
        origX: clip.x ?? 0.5,
        origY: clip.y ?? 0.5,
        rectW: rect.width,
        rectH: rect.height,
      };
      this._startDrag();
    });

    // ハンドルドラッグ → 拡大縮小
    this.handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const clip = this.timeline.selectedClip;
        const fx = clip.effects || (clip.effects = {});
        this.dragging = {
          type: 'resize',
          handle: handle.dataset.handle,
          startX: e.clientX,
          startY: e.clientY,
          origScale: fx.scale ?? 1,
        };
        this._startDrag();
      });
    });
  }

  _startDrag() {
    const onMove = (e) => {
      const clip = this.timeline.selectedClip;
      if (!clip || !this.dragging) return;
      const d = this.dragging;

      if (d.type === 'move') {
        const dx = (e.clientX - d.startX) / d.rectW;
        const dy = (e.clientY - d.startY) / d.rectH;
        clip.x = Math.max(0, Math.min(1, d.origX + dx));
        clip.y = Math.max(0, Math.min(1, d.origY + dy));
      } else if (d.type === 'resize') {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        // 角ごとに外向きドラッグで拡大
        let delta = 0;
        switch (d.handle) {
          case 'nw': delta = (-dx - dy) / 200; break;
          case 'ne': delta = (dx - dy) / 200; break;
          case 'sw': delta = (-dx + dy) / 200; break;
          case 'se': delta = (dx + dy) / 200; break;
        }
        const fx = clip.effects || (clip.effects = {});
        fx.scale = Math.max(0.1, Math.min(5, d.origScale + delta));
      }

      this.timeline.app.markDirty();
      this.timeline.render();
      // プロパティパネルの値をリアルタイム更新
      const xIn = document.getElementById('prop-x');
      const yIn = document.getElementById('prop-y');
      const sIn = document.getElementById('prop-scale');
      if (xIn) xIn.value = clip.x;
      if (yIn) yIn.value = clip.y;
      if (sIn) sIn.value = clip.effects?.scale ?? 1;
    };

    const onUp = () => {
      this.dragging = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      // ドラッグ終了後にプロパティパネル完全更新
      this.timeline.renderProperties();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
