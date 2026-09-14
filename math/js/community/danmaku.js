// js/community/danmaku.js — 弾幕コメント描画エンジン(ニコニコ動画風)

export class DanmakuEngine {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = video;
    this.comments = [];      // 全コメント
    this.activeLanes = [];   // 表示中コメント
    this.lanes = [];         // レーン管理
    this.maxLanes = 12;
    this.lastTime = 0;
    this.running = false;
    this.lastVideoTime = -1;

    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas);
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  setComments(comments) {
    this.comments = [...comments].sort((a, b) => a.time - b.time);
    this._commentIdx = 0;
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.lastVideoTime = -1;
    this._commentIdx = 0;
    this.activeLanes = [];
    this.lanes = new Array(this.maxLanes).fill(null);
    this._loop();
  }

  stop() {
    this.running = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const vTime = this.video.currentTime;

    // Detect seek (time jumped backward)
    if (this.lastVideoTime >= 0 && vTime < this.lastVideoTime - 0.5) {
      this.activeLanes = [];
      this.lanes = new Array(this.maxLanes).fill(null);
      this._commentIdx = 0;
    }
    this.lastVideoTime = vTime;

    // Spawn new comments
    while (this._commentIdx < this.comments.length && this.comments[this._commentIdx].time <= vTime) {
      const c = this.comments[this._commentIdx];
      if (c.time >= vTime - 0.3) {
        this._spawn(c);
      }
      this._commentIdx++;
    }

    // Update & draw
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const cw = this.canvas.width / window.devicePixelRatio;
    const ch = this.canvas.height / window.devicePixelRatio;

    this.activeLanes = this.activeLanes.filter(d => {
      d.x -= d.speed * dt;
      if (d.x + d.width < -10) {
        if (this.lanes[d.lane] === d) this.lanes[d.lane] = null;
        return false;
      }
      // Draw
      this.ctx.font = `bold ${d.fontSize}px "Noto Sans JP", sans-serif`;
      this.ctx.textBaseline = 'top';
      // Outline
      this.ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      this.ctx.lineWidth = 3;
      this.ctx.lineJoin = 'round';
      this.ctx.strokeText(d.text, d.x, d.y);
      // Fill
      this.ctx.fillStyle = d.color;
      this.ctx.fillText(d.text, d.x, d.y);
      return true;
    });

    requestAnimationFrame(() => this._loop());
  }

  _spawn(comment) {
    const cw = this.canvas.width / window.devicePixelRatio;
    const ch = this.canvas.height / window.devicePixelRatio;
    const fontSize = 22;
    this.ctx.font = `bold ${fontSize}px "Noto Sans JP", sans-serif`;
    const textWidth = this.ctx.measureText(comment.text).width;
    const speed = (textWidth + cw + 100) / 8; // ~8秒で横断

    // Find free lane
    let lane = -1;
    for (let i = 0; i < this.maxLanes; i++) {
      const existing = this.lanes[i];
      if (!existing || existing.x + existing.width < cw - 50) {
        lane = i;
        break;
      }
    }
    if (lane === -1) lane = Math.floor(Math.random() * this.maxLanes);

    const d = {
      text: comment.text,
      color: comment.color || '#FFFFFF',
      x: cw,
      y: 8 + lane * (fontSize + 6),
      width: textWidth,
      fontSize,
      speed,
      lane,
    };
    this.activeLanes.push(d);
    this.lanes[lane] = d;
  }

  /** 手動でコメントを追加(リアルタイム投稿用) */
  addLiveComment(text, color = '#FFFFFF') {
    this._spawn({ text, color });
  }
}
