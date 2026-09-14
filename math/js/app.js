// js/app.js — アプリ全体・状態管理

import { Timeline } from './editor/timeline.js';
import * as backend from './community/backend.js';
import { CommunityPlayer } from './community/player.js';

class App {
  constructor() {
    this.timeline = null;
    this.community = null;
    this.player = null;
    this.dirty = false;
    this.mathTags = [];
    this.uploads = [];
    this.draftKey = 'mathclip_draft';

    this._init();
  }

  async _init() {
    // Init backend
    const mode = await backend.initBackend();
    document.getElementById('backend-mode').textContent =
      mode === 'local' ? 'ローカルモード (IndexedDB)' : `${mode}モード`;

    // Load math tags
    await this._loadMathTags();

    // Init editor
    this.timeline = new Timeline(this);

    // Init community
    this.community = new Community(this);
    this.player = new CommunityPlayer(this);

    // Bind UI
    this._bindTabs();
    this._bindMaterialTabs();
    this._bindSearch();
    this._bindUpload();
    this._bindExport();
    this._bindBeforeUnload();

    // Restore draft
    await this._restoreDraft();

    // Render math grid
    this._renderMathGrid('');

    // Render community
    this.community.refreshGrid();
  }

  // ===== Tabs =====
  _bindTabs() {
    const editorBtn = document.getElementById('tab-editor');
    const commBtn = document.getElementById('tab-community');
    const exportBtn = document.getElementById('btn-export');

    editorBtn.addEventListener('click', () => this._switchTab('editor'));
    commBtn.addEventListener('click', () => this._switchTab('community'));

    this._switchTab('editor');
  }

  _switchTab(tab) {
    const editorView = document.getElementById('view-editor');
    const commView = document.getElementById('view-community');
    const exportBtn = document.getElementById('btn-export');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (tab === 'editor') {
      editorView.classList.remove('hidden');
      editorView.classList.add('flex');
      commView.classList.add('hidden');
      document.getElementById('tab-editor').classList.add('active');
      exportBtn.classList.remove('hidden');
    } else {
      editorView.classList.add('hidden');
      editorView.classList.remove('flex');
      commView.classList.remove('hidden');
      document.getElementById('tab-community').classList.add('active');
      exportBtn.classList.add('hidden');
      this.community.refreshGrid();
    }
  }

  // ===== Math Tags =====
  async _loadMathTags() {
    try {
      const res = await fetch('data/math_tags.json');
      this.mathTags = await res.json();
    } catch (e) {
      console.error('Failed to load math_tags.json', e);
      this.mathTags = [];
    }
  }

  _bindMaterialTabs() {
    document.querySelectorAll('.mat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.matTab;
        document.querySelectorAll('.mat-tab').forEach(b => {
          b.classList.remove('active');
          b.classList.add('border-transparent');
          b.classList.remove('border-accent');
        });
        btn.classList.add('active');
        btn.classList.remove('border-transparent');
        btn.classList.add('border-accent');
        document.querySelectorAll('.mat-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById(`mat-${tab}`).classList.remove('hidden');
      });
    });
    this._renderGBGrid();
  }

  _bindSearch() {
    const input = document.getElementById('mat-search');
    input.addEventListener('input', () => this._renderMathGrid(input.value));
  }

  _renderMathGrid(query) {
    const grid = document.getElementById('mat-math');
    grid.innerHTML = '';
    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? this.mathTags.filter(t =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.tags.some(tag => tag.toLowerCase().includes(q))
        )
      : this.mathTags;

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="col-span-4 text-center text-gray-500 text-sm py-4">該当する素材がありません</p>';
      return;
    }

    filtered.forEach(tag => {
      const tile = document.createElement('div');
      tile.className = 'math-tile relative';
      tile.title = tag.name + ' (' + tag.tags.join(', ') + ')';
      tile.textContent = tag.symbol;
      tile.draggable = true;
      tile.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'math', symbol: tag.symbol, name: tag.name }));
      });
      tile.addEventListener('click', () => {
        this.timeline.addClip({
          type: 'text',
          text: tag.symbol,
          start: this.timeline.currentTime,
          duration: 3,
          x: 0.5, y: 0.5,
          effects: { fontSize: 64, color: '#ffffff', stroke: 2, strokeColor: '#000', animation: 'fade', animDuration: 0.5 },
        });
      });
      grid.appendChild(tile);
    });
  }

  _renderGBGrid() {
    const grid = document.getElementById('mat-gb');
    const gbItems = [
      { name: 'GB人物(立)', color: '#00b140' },
      { name: 'GBエフェクト', color: '#00a830' },
      { name: 'GB背景', color: '#009028' },
      { name: 'GB素材A', color: '#00b140' },
      { name: 'GB素材B', color: '#00a830' },
      { name: 'GB素材C', color: '#009028' },
    ];
    grid.innerHTML = '';
    gbItems.forEach(item => {
      const tile = document.createElement('div');
      tile.className = 'gb-tile';
      tile.textContent = item.name;
      tile.draggable = true;
      tile.addEventListener('click', () => {
        // GB素材は実ファイルがないためテキストプレースホルダとして配置
        this.timeline.addClip({
          type: 'text',
          text: item.name,
          start: this.timeline.currentTime,
          duration: 3,
          x: 0.5, y: 0.5,
          effects: {
            fontSize: 40, color: '#00ff00', stroke: 2, strokeColor: '#000',
            keyColor: '#00b140', chromaThreshold: 0.4, chromaSpill: 0.5,
            animation: 'fade', animDuration: 0.5,
          },
        });
      });
      grid.appendChild(tile);
    });
  }

  // ===== Upload =====
  _bindUpload() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this._handleFiles(e.target.files));

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-accent'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-accent'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-accent');
      this._handleFiles(e.dataTransfer.files);
    });
  }

  _handleFiles(files) {
    const list = document.getElementById('upload-list');
    [...files].forEach(file => {
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      const item = { id, file, url, name: file.name, type: this._detectType(file) };
      this.uploads.push(item);

      const el = document.createElement('div');
      el.className = 'flex items-center gap-2 p-2 rounded-lg bg-panel2 cursor-grab';
      el.draggable = true;
      const icon = item.type === 'video' ? '🎬' : item.type === 'image' ? '🖼' : '🎵';
      el.innerHTML = `<span>${icon}</span><span class="flex-1 truncate text-xs">${file.name}</span>`;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'upload', uploadId: id }));
      });
      el.addEventListener('click', () => this._addUploadClip(item));
      list.appendChild(el);
    });
  }

  _detectType(file) {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'file';
  }

  _addUploadClip(item) {
    const clip = {
      type: item.type,
      name: item.name,
      start: this.timeline.currentTime,
      duration: item.type === 'image' ? 5 : 10,
      x: 0.5, y: 0.5,
      effects: { opacity: 1, scale: 1, animation: 'fade', animDuration: 0.5 },
    };
    if (item.type === 'image') {
      const img = new Image();
      img.src = item.url;
      clip._img = img;
      img.onload = () => this.timeline.render();
    } else if (item.type === 'video') {
      const v = document.createElement('video');
      v.src = item.url;
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      clip._video = v;
      v.addEventListener('loadeddata', () => this.timeline.render());
    }
    this.timeline.addClip(clip);
  }

  // ===== Export =====
  _bindExport() {
    document.getElementById('btn-export').addEventListener('click', () => this._exportVideo());
  }

  async _exportVideo() {
    const canvas = this.timeline.canvas;
    const stream = canvas.captureStream(30);

    // Audio tracks (if any audio clips)
    // For simplicity, only video stream

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mathclip_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    // Play timeline from start
    this.timeline.stop();
    this.timeline.togglePlay();
    recorder.start();

    const totalMs = this.timeline.duration * 1000;
    setTimeout(() => {
      recorder.stop();
      this.timeline.stop();
    }, totalMs);

    alert(`動画を書き出しています...\n${this.timeline.duration}秒間再生完了後にダウンロードされます。`);
  }

  // ===== Draft Save / Restore =====
  markDirty() {
    this.dirty = true;
    this._scheduleAutosave();
  }

  _autosaveTimer = null;
  _scheduleAutosave() {
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => this.saveDraft(), 3000);
  }

  async saveDraft() {
    const state = this.timeline.getSerializableState();
    try {
      localStorage.setItem(this.draftKey, JSON.stringify({ ...state, savedAt: Date.now() }));
      this.dirty = false;
      console.log('[draft] Saved');
    } catch (e) {
      console.error('[draft] Save failed', e);
    }
  }

  async _restoreDraft() {
    try {
      const raw = localStorage.getItem(this.draftKey);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.tracks && state.clips) {
        this.timeline.loadState(state);
        console.log('[draft] Restored from', new Date(state.savedAt).toLocaleString());
      }
    } catch (e) {
      console.error('[draft] Restore failed', e);
    }
  }

  // ===== beforeunload =====
  _bindBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty) {
        e.preventDefault();
        e.returnValue = '動画編集を終了しますか？変更が保存されない可能性があります。';
        return e.returnValue;
      }
    });
  }
}

// ===== Community (grid + upload modal) =====
class Community {
  constructor(app) {
    this.app = app;
    this._bind();
  }

  _bind() {
    document.getElementById('btn-upload-video').addEventListener('click', () => {
      document.getElementById('upload-modal').classList.remove('hidden');
      document.getElementById('upload-modal').classList.add('flex');
    });
    document.getElementById('upload-cancel').addEventListener('click', () => this._closeModal());
    document.getElementById('upload-submit').addEventListener('click', () => this._submitUpload());
  }

  _closeModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    document.getElementById('upload-modal').classList.remove('flex');
    document.getElementById('upload-title').value = '';
    document.getElementById('upload-desc').value = '';
    document.getElementById('upload-file').value = '';
  }

  async _submitUpload() {
    const title = document.getElementById('upload-title').value.trim() || '無題';
    const desc = document.getElementById('upload-desc').value.trim();
    const fileInput = document.getElementById('upload-file');
    const file = fileInput.files[0];
    if (!file) { alert('動画ファイルを選択してください'); return; }

    const btn = document.getElementById('upload-submit');
    btn.textContent = '投稿中...';
    btn.disabled = true;

    try {
      await backend.uploadVideo(file, title, desc);
      this._closeModal();
      this.refreshGrid();
    } catch (e) {
      alert('投稿に失敗しました: ' + e.message);
    } finally {
      btn.textContent = '投稿する';
      btn.disabled = false;
    }
  }

  async refreshGrid() {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">読み込み中...</p>';
    const videos = await backend.getVideos();
    if (videos.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <p class="text-gray-500 text-lg mb-2">📺 投稿された動画がありません</p>
          <p class="text-gray-600 text-sm">「動画を投稿」ボタンから動画をアップロードするか、エディタで編集した動画を書き出して投稿してください</p>
        </div>`;
      return;
    }
    grid.innerHTML = '';
    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'video-card';
      const date = new Date(v.created_at).toLocaleDateString('ja-JP');
      card.innerHTML = `
        <div class="video-thumb">
          <video src="${v.video_url}" muted preload="metadata" class="w-full h-full object-cover"></video>
        </div>
        <div class="p-3">
          <h3 class="font-bold text-sm truncate">${this._esc(v.title)}</h3>
          <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>👁 ${v.views || 0}</span>
            <span>👍 ${v.likes || 0}</span>
            <span class="ml-auto">${date}</span>
          </div>
        </div>`;
      card.addEventListener('click', () => this.app.player.open(v.id));
      grid.appendChild(card);
    });
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
  window.__app = new App();
});
