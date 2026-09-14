// js/editor/timeline.js — タイムライン管理 & キャンバス描画ロジック

import { computeEffect, drawTextClip } from './effects.js';
import { chromakeyFrame } from './chromakey.js';
import { CanvasInteract } from './canvas-interact.js';
import { drawGraph } from './graph.js';

export class Timeline {
  constructor(app) {
    this.app = app;
    this.tracks = []; // [{ id, name, type, locked }]
    this.clips = [];  // 全クリップ
    this.duration = 30; // 秒
    this.currentTime = 0;
    this.playing = false;
    this.pxPerSec = 60;
    this.selectedClip = null;
    this.lastFrameTime = 0;

    this.canvas = document.getElementById('preview-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.rulerEl = document.getElementById('timeline-ruler');
    this.tracksEl = document.getElementById('timeline-tracks');
    this.playhead = null;

    this._setupCanvas();
    this._bindEvents();
    this.canvasInteract = new CanvasInteract(this);
    this.addTrack('Video 1');
    this.addTrack('Text 1');
    this.render();
  }

  _setupCanvas() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.floor(rect.width * window.devicePixelRatio);
      this.canvas.height = Math.floor(rect.height * window.devicePixelRatio);
    };
    resize();
    new ResizeObserver(resize).observe(this.canvas);
  }

  _bindEvents() {
    document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-stop').addEventListener('click', () => this.stop());
    document.getElementById('btn-add-track').addEventListener('click', () => {
      this.addTrack(`Track ${this.tracks.length + 1}`);
      this.render();
    });
    document.getElementById('btn-auto-seq').addEventListener('click', () => this._autoSequence());
    document.getElementById('btn-save-draft').addEventListener('click', () => this.app.saveDraft());

    const zoom = document.getElementById('zoom-slider');
    zoom.addEventListener('input', () => {
      this.pxPerSec = parseInt(zoom.value);
      this.render();
    });

    // Ruler click → seek
    this.rulerEl.addEventListener('mousedown', (e) => {
      const rect = this.rulerEl.getBoundingClientRect();
      const x = e.clientX - rect.left - 90; // track header width
      if (x < 0) return;
      this.seek(x / this.pxPerSec);
      const move = (ev) => {
        const x2 = ev.clientX - rect.left - 90;
        this.seek(Math.max(0, x2 / this.pxPerSec));
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  addTrack(name) {
    const id = crypto.randomUUID();
    this.tracks.push({ id, name: name || `Track ${this.tracks.length + 1}`, locked: false });
    return id;
  }

  addClip(clip) {
    clip.id = clip.id || crypto.randomUUID();
    if (clip.track === undefined) clip.track = this.tracks.length - 1;
    this.clips.push(clip);
    this.app.markDirty();
    this.render();
    this.selectClip(clip.id);
    return clip;
  }

  removeClip(id) {
    this.clips = this.clips.filter(c => c.id !== id);
    if (this.selectedClip?.id === id) this.selectedClip = null;
    this.app.markDirty();
    this.render();
    this.renderProperties();
  }

  selectClip(id) {
    this.selectedClip = this.clips.find(c => c.id === id) || null;
    this.render();
    this.renderProperties();
  }

  seek(time) {
    this.currentTime = Math.max(0, Math.min(this.duration, time));
    this.render();
    this._updateTimeDisplay();
  }

  togglePlay() {
    this.playing = !this.playing;
    document.getElementById('btn-play').textContent = this.playing ? '⏸ 一時停止' : '▶ 再生';
    if (this.playing) {
      this.lastFrameTime = performance.now();
      this._loop();
    } else {
      this._updateAudio();
    }
  }

  stop() {
    this.playing = false;
    document.getElementById('btn-play').textContent = '▶ 再生';
    this.currentTime = 0;
    this._updateAudio();
    this.render();
    this._updateTimeDisplay();
  }

  _loop() {
    if (!this.playing) return;
    const now = performance.now();
    const dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    this.currentTime += dt;
    if (this.currentTime >= this.duration) {
      this.currentTime = 0;
    }
    this._updateAudio();
    this.render();
    this._updateTimeDisplay();
    requestAnimationFrame(() => this._loop());
  }

  _updateTimeDisplay() {
    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const sec = (s % 60).toFixed(2).padStart(5, '0');
      return `${String(m).padStart(2, '0')}:${sec}`;
    };
    document.getElementById('time-display').textContent = `${fmt(this.currentTime)} / ${fmt(this.duration)}`;
  }

  /** 再生中のオーディオクリップの再生/停止・音量制御 */
  _updateAudio() {
    for (const clip of this.clips) {
      if (clip.type !== 'audio' || !clip._audio) continue;
      const audio = clip._audio;
      const localTime = this.currentTime - clip.start;
      const inRange = localTime >= 0 && localTime <= clip.duration;

      if (this.playing && inRange) {
        if (audio.paused) {
          try { audio.currentTime = localTime; } catch (e) {}
          audio.play().catch(() => {});
        }
        const fx = clip.effects || {};
        let vol = fx.volume ?? 1;
        if (fx.fadeIn > 0 && localTime < fx.fadeIn) vol *= localTime / fx.fadeIn;
        if (fx.fadeOut > 0 && localTime > clip.duration - fx.fadeOut) vol *= Math.max(0, (clip.duration - localTime) / fx.fadeOut);
        audio.volume = Math.max(0, Math.min(1, vol));
      } else {
        if (!audio.paused) audio.pause();
      }
    }
  }

  // ===== Rendering =====

  render() {
    this._renderRuler();
    this._renderTracks();
    this._renderCanvas();
    this.canvasInteract.update();
  }

  _renderRuler() {
    const el = this.rulerEl;
    el.innerHTML = '';
    const totalPx = this.duration * this.pxPerSec;
    el.style.width = (totalPx + 90) + 'px';
    const step = this.pxPerSec >= 80 ? 1 : this.pxPerSec >= 40 ? 2 : 5;
    for (let s = 0; s <= this.duration; s += step) {
      const tick = document.createElement('div');
      tick.className = 'ruler-tick major';
      tick.style.left = (90 + s * this.pxPerSec) + 'px';
      el.appendChild(tick);
      const label = document.createElement('span');
      label.className = 'ruler-label';
      label.style.left = (90 + s * this.pxPerSec) + 'px';
      label.textContent = `${s}s`;
      el.appendChild(label);
    }
    // Playhead on ruler
    let ph = el.querySelector('#playhead');
    if (!ph) {
      ph = document.createElement('div');
      ph.id = 'playhead';
      el.appendChild(ph);
    }
    ph.style.left = (90 + this.currentTime * this.pxPerSec) + 'px';
  }

  _renderTracks() {
    const el = this.tracksEl;
    el.innerHTML = '';
    el.style.width = (this.duration * this.pxPerSec + 90) + 'px';
    this.tracks.forEach((track, ti) => {
      const row = document.createElement('div');
      row.className = 'timeline-track';

      const header = document.createElement('div');
      header.className = 'timeline-track-header';
      header.innerHTML = `<span class="flex-1 truncate">${track.name}</span>`;
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.className = 'text-xs text-gray-500 hover:text-red-400 ml-1';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tracks.splice(ti, 1);
        this.clips = this.clips.filter(c => c.track !== ti);
        this.app.markDirty();
        this.render();
      });
      header.appendChild(delBtn);
      row.appendChild(header);

      // Clips on this track
      this.clips.filter(c => c.track === ti).forEach(clip => {
        const clipEl = this._createClipElement(clip);
        row.appendChild(clipEl);
      });

      // Playhead
      const ph = document.createElement('div');
      ph.id = 'playhead';
      ph.style.left = (90 + this.currentTime * this.pxPerSec) + 'px';
      row.appendChild(ph);

      el.appendChild(row);
    });
  }

  _createClipElement(clip) {
    const el = document.createElement('div');
    el.className = 'timeline-clip';
    if (this.selectedClip?.id === clip.id) el.classList.add('selected');
    const left = 90 + clip.start * this.pxPerSec;
    const width = clip.duration * this.pxPerSec;
    el.style.left = left + 'px';
    el.style.width = width + 'px';
    const colorMap = { text: '#89b4fa', video: '#a6e3a1', image: '#f9e2af', audio: '#f5c2e7', gb: '#00b140', graph: '#fab387' };
    el.style.background = colorMap[clip.type] || '#45475a';
    el.style.color = '#1e1e2e';
    el.textContent = clip.text || clip.name || clip.type;

    // Left/right resize handles
    const lh = document.createElement('div');
    lh.className = 'clip-handle left';
    const rh = document.createElement('div');
    rh.className = 'clip-handle right';
    el.appendChild(lh);
    el.appendChild(rh);

    // Click to select
    el.addEventListener('mousedown', (e) => {
      if (e.target === lh || e.target === rh) return;
      e.stopPropagation();
      this.selectClip(clip.id);
      // Drag to move
      const startX = e.clientX;
      const origStart = clip.start;
      const move = (ev) => {
        clip.start = Math.max(0, origStart + (ev.clientX - startX) / this.pxPerSec);
        this.app.markDirty();
        this.render();
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });

    // Resize handles
    const resize = (handle, e) => {
      e.stopPropagation();
      this.selectClip(clip.id);
      const startX = e.clientX;
      const origStart = clip.start;
      const origDur = clip.duration;
      const move = (ev) => {
        const delta = (ev.clientX - startX) / this.pxPerSec;
        if (handle === 'left') {
          clip.start = Math.max(0, origStart + delta);
          clip.duration = Math.max(0.1, origDur - delta);
        } else {
          clip.duration = Math.max(0.1, origDur + delta);
        }
        this.app.markDirty();
        this.render();
      };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    };
    lh.addEventListener('mousedown', (e) => resize('left', e));
    rh.addEventListener('mousedown', (e) => resize('right', e));

    return el;
  }

  _renderCanvas() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Draw clips sorted by track (bottom track = top layer visually? we draw bottom-to-top)
    const sorted = [...this.clips].sort((a, b) => a.track - b.track);
    for (const clip of sorted) {
      const localTime = this.currentTime - clip.start;
      if (localTime < 0 || localTime > clip.duration) continue;

      const state = computeEffect(clip, localTime);
      if (state.alpha <= 0) continue;

      if (clip.type === 'text') {
        drawTextClip(ctx, clip, state, w, h);
      } else if (clip.type === 'image' && clip._img) {
        this._drawMediaClip(ctx, clip, state, w, h, clip._img);
      } else if (clip.type === 'video' && clip._video) {
        const v = clip._video;
        if (this.playing) v.currentTime = localTime;
        this._drawMediaClip(ctx, clip, state, w, h, v);
      } else if (clip.type === 'gb' && clip._video) {
        const v = clip._video;
        if (this.playing) v.currentTime = localTime;
        const fx = clip.effects || {};
        const frame = chromakeyFrame(v, w, h, {
          keyColor: fx.keyColor || '#00b140',
          threshold: fx.chromaThreshold ?? 0.4,
          smooth: fx.chromaSmooth ?? 0.1,
          spill: fx.chromaSpill ?? 0.5,
        });
        ctx.save();
        ctx.globalAlpha = state.alpha;
        ctx.translate((clip.x ?? 0.5) * w + state.offsetX, (clip.y ?? 0.5) * h + state.offsetY);
        ctx.scale(state.scaleX, state.scaleY);
        ctx.drawImage(frame, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else if (clip.type === 'graph') {
        ctx.save();
        ctx.globalAlpha = state.alpha;
        drawGraph(ctx, clip, localTime, w, h);
        ctx.restore();
      }
    }
  }

  _drawMediaClip(ctx, clip, state, w, h, source) {
    ctx.save();
    ctx.globalAlpha = state.alpha;
    ctx.translate((clip.x ?? 0.5) * w + state.offsetX, (clip.y ?? 0.5) * h + state.offsetY);
    if (state.rotation) ctx.rotate(state.rotation * Math.PI / 180);
    ctx.scale(state.scaleX, state.scaleY);
    const sw = source.videoWidth || source.width;
    const sh = source.videoHeight || source.height;
    if (sw && sh) {
      const scale = Math.max(w / sw, h / sh);
      const dw = sw * scale, dh = sh * scale;
      ctx.drawImage(source, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
  }

  // ===== Auto Sequence =====

  _autoSequence() {
    if (!this.selectedClip || this.selectedClip.type !== 'text') {
      alert('数式テキストクリップを選択してから「自動段落アニメ」を押してください');
      return;
    }
    const formula = this.selectedClip.text;
    const { buildAutoSequence } = import('./effects.js');
    // Use dynamic import result synchronously is not possible, so inline:
    import('./effects.js').then(({ buildAutoSequence }) => {
      const clips = buildAutoSequence(formula, this.selectedClip.track, this.selectedClip.start, 1, this.selectedClip.effects?.animation || 'fade');
      // Remove original clip
      this.clips = this.clips.filter(c => c.id !== this.selectedClip.id);
      // Add sequence clips
      clips.forEach(c => this.clips.push(c));
      this.app.markDirty();
      this.render();
    });
  }

  // ===== Property Panel =====

  renderProperties() {
    const el = document.getElementById('property-content');
    const clip = this.selectedClip;
    if (!clip) {
      el.innerHTML = '<p class="text-gray-500 text-xs">オブジェクトを選択してください</p>';
      return;
    }
    const fx = clip.effects || (clip.effects = {});

    const animOpts = Object.entries({
      none: 'なし', fade: 'フェード', typing: 'タイピング', slide: 'スライド', scale: '拡大', drop: 'ドロップ'
    }).map(([k, v]) => `<option value="${k}" ${fx.animation === k ? 'selected' : ''}>${v}</option>`).join('');

    let html = `
      <div class="prop-row">
        <label>タイプ</label>
        <span class="text-xs">${clip.type}</span>
      </div>`;

    if (clip.type === 'text') {
      html += `
      <div class="prop-row">
        <label>テキスト</label>
        <textarea id="prop-text" rows="2">${clip.text || ''}</textarea>
      </div>`;
    }

    html += `
      <div class="prop-row">
        <label>X位置</label>
        <input type="range" id="prop-x" min="0" max="1" step="0.01" value="${clip.x ?? 0.5}" />
      </div>
      <div class="prop-row">
        <label>Y位置</label>
        <input type="range" id="prop-y" min="0" max="1" step="0.01" value="${clip.y ?? 0.5}" />
      </div>
      <div class="prop-row">
        <label>不透明度</label>
        <input type="range" id="prop-opacity" min="0" max="1" step="0.05" value="${fx.opacity ?? 1}" />
      </div>
      <div class="prop-row">
        <label>拡大縮小</label>
        <input type="range" id="prop-scale" min="0.1" max="3" step="0.05" value="${fx.scale ?? 1}" />
      </div>
      <div class="prop-row">
        <label>回転(度)</label>
        <input type="range" id="prop-rotation" min="-180" max="180" step="1" value="${fx.rotation || 0}" />
      </div>
      <div class="prop-row">
        <label>出現アニメ</label>
        <select id="prop-animation">${animOpts}</select>
      </div>
      <div class="prop-row">
        <label>アニメ時間(秒)</label>
        <input type="number" id="prop-animDuration" min="0.1" max="5" step="0.1" value="${fx.animDuration ?? 0.5}" />
      </div>
      <div class="prop-row">
        <label>フェードイン(秒)</label>
        <input type="number" id="prop-fadeIn" min="0" max="5" step="0.1" value="${fx.fadeIn || 0}" />
      </div>
      <div class="prop-row">
        <label>フェードアウト(秒)</label>
        <input type="number" id="prop-fadeOut" min="0" max="5" step="0.1" value="${fx.fadeOut || 0}" />
      </div>`;

    if (clip.type === 'text') {
      html += `
      <div class="prop-row">
        <label>文字色</label>
        <input type="color" id="prop-color" value="${fx.color || '#ffffff'}" />
      </div>
      <div class="prop-row">
        <label>フォントサイズ</label>
        <input type="number" id="prop-fontSize" min="8" max="200" step="1" value="${fx.fontSize || 48}" />
      </div>
      <div class="prop-row">
        <label>縁取り太さ</label>
        <input type="range" id="prop-stroke" min="0" max="10" step="0.5" value="${fx.stroke || 0}" />
      </div>
      <div class="prop-row">
        <label>縁取り色</label>
        <input type="color" id="prop-strokeColor" value="${fx.strokeColor || '#000000'}" />
      </div>
      <div class="prop-row">
        <label>ドロップシャドウ</label>
        <input type="checkbox" id="prop-shadow" ${fx.shadow ? 'checked' : ''} />
      </div>`;
    }

    html += `
      <div class="prop-row">
        <label>振動(揺れ)</label>
        <input type="range" id="prop-shake" min="0" max="20" step="1" value="${fx.shake || 0}" />
      </div>
      <div class="prop-row">
        <label>パルス(拡縮)</label>
        <input type="range" id="prop-pulse" min="0" max="1" step="0.05" value="${fx.pulse || 0}" />
      </div>`;

    if (clip.type === 'gb') {
      html += `
      <div class="prop-row">
        <label>クロマキー色</label>
        <input type="color" id="prop-keyColor" value="${fx.keyColor || '#00b140'}" />
      </div>
      <div class="prop-row">
        <label>キーしきい値</label>
        <input type="range" id="prop-chromaThreshold" min="0" max="1" step="0.05" value="${fx.chromaThreshold ?? 0.4}" />
      </div>
      <div class="prop-row">
        <label>スピル抑制</label>
        <input type="range" id="prop-chromaSpill" min="0" max="1" step="0.05" value="${fx.chromaSpill ?? 0.5}" />
      </div>`;
    }

    if (clip.type === 'audio') {
      html += `
      <div class="prop-row">
        <label>音量</label>
        <input type="range" id="prop-volume" min="0" max="1" step="0.05" value="${fx.volume ?? 1}" />
      </div>`;
    }

    if (clip.type === 'graph') {
      const g = clip.graph || (clip.graph = {});
      const xr = g.xRange || [-5, 5];
      const yr = g.yRange || [-3, 3];
      html += `
      <div class="prop-row">
        <label>数式</label>
        <input type="text" id="prop-graph-expr" value="${g.expression || ''}" />
      </div>
      <div class="flex gap-2">
        <div class="prop-row flex-1">
          <label>X最小</label>
          <input type="number" id="prop-graph-xmin" value="${xr[0]}" step="0.5" />
        </div>
        <div class="prop-row flex-1">
          <label>X最大</label>
          <input type="number" id="prop-graph-xmax" value="${xr[1]}" step="0.5" />
        </div>
      </div>
      <div class="flex gap-2">
        <div class="prop-row flex-1">
          <label>Y最小</label>
          <input type="number" id="prop-graph-ymin" value="${yr[0]}" step="0.5" />
        </div>
        <div class="prop-row flex-1">
          <label>Y最大</label>
          <input type="number" id="prop-graph-ymax" value="${yr[1]}" step="0.5" />
        </div>
      </div>
      <div class="prop-row">
        <label>曲線の色</label>
        <input type="color" id="prop-graph-color" value="${g.curveColor || '#89b4fa'}" />
      </div>
      <div class="prop-row">
        <label>描画アニメ時間(秒)</label>
        <input type="number" id="prop-graph-drawdur" value="${g.drawDuration ?? 2}" min="0.5" max="10" step="0.5" />
      </div>
      <div class="prop-row">
        <label>注釈追加</label>
        <select id="prop-ann-type">
          <option value="text">テキスト</option>
          <option value="point">点</option>
          <option value="line">補助線</option>
          <option value="arrow">ベクトル矢印</option>
        </select>
        <input type="text" id="prop-ann-text" placeholder="テキスト (例: 極大値)" />
        <div class="flex gap-1">
          <input type="number" id="prop-ann-x1" placeholder="x1" step="0.5" />
          <input type="number" id="prop-ann-y1" placeholder="y1" step="0.5" />
          <input type="number" id="prop-ann-x2" placeholder="x2" step="0.5" />
          <input type="number" id="prop-ann-y2" placeholder="y2" step="0.5" />
        </div>
        <input type="color" id="prop-ann-color" value="#f38ba8" />
        <button id="prop-ann-add" class="px-2 py-1 rounded bg-accent-soft text-accent text-xs">＋ 注釈を追加</button>
      </div>
      <div id="prop-ann-list" class="space-y-1"></div>`;
    }

    html += `
      <div class="prop-row">
        <label>開始(秒)</label>
        <input type="number" id="prop-start" min="0" step="0.1" value="${clip.start}" />
      </div>
      <div class="prop-row">
        <label>長さ(秒)</label>
        <input type="number" id="prop-duration" min="0.1" step="0.1" value="${clip.duration}" />
      </div>
      <button id="prop-delete" class="mt-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm w-full hover:bg-red-500/30">🗑 削除</button>`;

    el.innerHTML = html;
    this._bindPropertyEvents(clip);
  }

  _bindPropertyEvents(clip) {
    const fx = clip.effects;
    const bind = (id, key, target = clip, parse = parseFloat) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (el.type === 'checkbox') target[key] = el.checked;
        else target[key] = el.type === 'color' ? el.value : parse(el.value);
        this.app.markDirty();
        this.render();
      });
    };

    bind('prop-text', 'text', clip, v => v);
    bind('prop-x', 'x'); bind('prop-y', 'y');
    bind('prop-opacity', 'opacity', fx);
    bind('prop-scale', 'scale', fx);
    bind('prop-rotation', 'rotation', fx);
    bind('prop-animation', 'animation', fx, v => v);
    bind('prop-animDuration', 'animDuration', fx);
    bind('prop-fadeIn', 'fadeIn', fx);
    bind('prop-fadeOut', 'fadeOut', fx);
    bind('prop-color', 'color', fx, v => v);
    bind('prop-fontSize', 'fontSize', fx);
    bind('prop-stroke', 'stroke', fx);
    bind('prop-strokeColor', 'strokeColor', fx, v => v);
    bind('prop-shadow', 'shadow', fx);
    bind('prop-shake', 'shake', fx);
    bind('prop-pulse', 'pulse', fx);
    bind('prop-keyColor', 'keyColor', fx, v => v);
    bind('prop-chromaThreshold', 'chromaThreshold', fx);
    bind('prop-chromaSpill', 'chromaSpill', fx);
    bind('prop-start', 'start');
    bind('prop-duration', 'duration');

    // Audio
    bind('prop-volume', 'volume', fx);

    // Graph
    if (clip.type === 'graph') {
      const g = clip.graph || (clip.graph = {});
      const gbind = (id, key, target = g, parse = parseFloat) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
          target[key] = el.type === 'color' ? el.value : parse(el.value);
          this.app.markDirty();
          this.render();
        });
      };
      gbind('prop-graph-expr', 'expression', g, v => v);
      gbind('prop-graph-color', 'curveColor', g, v => v);
      gbind('prop-graph-drawdur', 'drawDuration', g);
      const xminEl = document.getElementById('prop-graph-xmin');
      const xmaxEl = document.getElementById('prop-graph-xmax');
      const yminEl = document.getElementById('prop-graph-ymin');
      const ymaxEl = document.getElementById('prop-graph-ymax');
      if (xminEl) xminEl.addEventListener('input', () => { g.xRange = [parseFloat(xminEl.value) || -5, g.xRange[1]]; this.app.markDirty(); this.render(); });
      if (xmaxEl) xmaxEl.addEventListener('input', () => { g.xRange = [g.xRange[0], parseFloat(xmaxEl.value) || 5]; this.app.markDirty(); this.render(); });
      if (yminEl) yminEl.addEventListener('input', () => { g.yRange = [parseFloat(yminEl.value) || -3, g.yRange[1]]; this.app.markDirty(); this.render(); });
      if (ymaxEl) ymaxEl.addEventListener('input', () => { g.yRange = [g.yRange[0], parseFloat(ymaxEl.value) || 3]; this.app.markDirty(); this.render(); });

      // Annotation add
      const annAdd = document.getElementById('prop-ann-add');
      if (annAdd) annAdd.addEventListener('click', () => {
        const type = document.getElementById('prop-ann-type').value;
        const text = document.getElementById('prop-ann-text').value || '';
        const x1 = parseFloat(document.getElementById('prop-ann-x1').value) || 0;
        const y1 = parseFloat(document.getElementById('prop-ann-y1').value) || 0;
        const x2 = parseFloat(document.getElementById('prop-ann-x2').value);
        const y2 = parseFloat(document.getElementById('prop-ann-y2').value);
        const color = document.getElementById('prop-ann-color').value || '#f38ba8';
        if (!g.annotations) g.annotations = [];
        if (type === 'text' || type === 'point') {
          g.annotations.push({ type, x: x1, y: y1, text, color });
        } else {
          g.annotations.push({ type, x1, y1, x2: x2 ?? x1 + 1, y2: y2 ?? y1, color });
        }
        document.getElementById('prop-ann-text').value = '';
        document.getElementById('prop-ann-x1').value = '';
        document.getElementById('prop-ann-y1').value = '';
        document.getElementById('prop-ann-x2').value = '';
        document.getElementById('prop-ann-y2').value = '';
        this.app.markDirty();
        this.render();
        this._renderAnnList(clip);
      });
      this._renderAnnList(clip);
    }

    const del = document.getElementById('prop-delete');
    if (del) del.addEventListener('click', () => this.removeClip(clip.id));
  }

  /** グラフ注釈リストをプロパティパネルに描画 */
  _renderAnnList(clip) {
    const el = document.getElementById('prop-ann-list');
    if (!el) return;
    const g = clip.graph || {};
    const anns = g.annotations || [];
    el.innerHTML = '';
    anns.forEach((ann, i) => {
      const item = document.createElement('div');
      item.className = 'ann-item';
      const label = ann.type === 'text' ? `📝 ${ann.text || ''} (${ann.x},${ann.y})`
        : ann.type === 'point' ? `● (${ann.x},${ann.y})`
        : ann.type === 'line' ? `─ (${ann.x1},${ann.y1})→(${ann.x2},${ann.y2})`
        : `→ (${ann.x1},${ann.y1})→(${ann.x2},${ann.y2})`;
      item.textContent = label;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.addEventListener('click', () => {
        g.annotations.splice(i, 1);
        this.app.markDirty();
        this.render();
        this._renderAnnList(clip);
      });
      item.appendChild(del);
      el.appendChild(item);
    });
  }

  // ===== Export =====

  getSerializableState() {
    return {
      tracks: this.tracks,
      duration: this.duration,
      clips: this.clips.map(c => {
        const { _img, _video, _audio, ...rest } = c;
        return rest;
      }),
    };
  }

  loadState(state) {
    this.tracks = state.tracks || [];
    this.clips = state.clips || [];
    this.duration = state.duration || 30;
    this.render();
  }
}
