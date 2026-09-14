// js/community/player.js — プレイヤー＆高評価処理

import * as backend from './backend.js';
import { DanmakuEngine } from './danmaku.js';

export class CommunityPlayer {
  constructor(app) {
    this.app = app;
    this.video = document.getElementById('player-video');
    this.canvas = document.getElementById('danmaku-canvas');
    this.danmaku = null;
    this.currentVideo = null;
    this._bind();
  }

  _bind() {
    document.getElementById('btn-back-grid').addEventListener('click', () => this.back());
    document.getElementById('btn-like').addEventListener('click', () => this.like());
    document.getElementById('btn-post-comment').addEventListener('click', () => this.postComment());
    document.getElementById('comment-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.postComment();
    });
  }

  async open(videoId) {
    const video = await backend.getVideo(videoId);
    if (!video) { alert('動画が見つかりません'); return; }
    this.currentVideo = video;

    document.getElementById('community-grid').classList.add('hidden');
    document.getElementById('community-player').classList.remove('hidden');

    document.getElementById('player-title').textContent = video.title;
    document.getElementById('player-views').textContent = `👁 ${video.views || 0} 回視聴`;
    document.getElementById('like-count').textContent = video.likes || 0;

    this.video.src = video.video_url;

    // Increment views
    const views = await backend.incrementViews(videoId);
    document.getElementById('player-views').textContent = `👁 ${views} 回視聴`;

    // Setup danmaku
    this.danmaku = new DanmakuEngine(this.canvas, this.video);
    const comments = await backend.getComments(videoId);
    this.danmaku.setComments(comments);

    this.video.addEventListener('play', () => this.danmaku.start(), { once: true });
    this.video.addEventListener('pause', () => this.danmaku?.stop());
    this.video.addEventListener('seeked', () => {
      this.danmaku?.stop();
      if (!this.video.paused) this.danmaku?.start();
    });
    this.video.play().catch(() => {});
  }

  back() {
    document.getElementById('community-player').classList.add('hidden');
    document.getElementById('community-grid').classList.remove('hidden');
    this.video.pause();
    this.danmaku?.stop();
    this.app.community.refreshGrid();
  }

  async like() {
    if (!this.currentVideo) return;
    const count = await backend.likeVideo(this.currentVideo.id);
    document.getElementById('like-count').textContent = count;
    const btn = document.getElementById('btn-like');
    btn.classList.add('scale-110');
    setTimeout(() => btn.classList.remove('scale-110'), 200);
  }

  async postComment() {
    const input = document.getElementById('comment-text');
    const colorInput = document.getElementById('comment-color');
    const text = input.value.trim();
    if (!text || !this.currentVideo) return;
    const color = colorInput.value;
    const time = this.video.currentTime;
    await backend.postComment(this.currentVideo.id, time, text, color);
    // Live display
    this.danmaku?.addLiveComment(text, color);
    input.value = '';
  }
}
