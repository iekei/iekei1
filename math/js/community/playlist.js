// js/community/playlist.js — 再生リスト管理（UI + 連続再生）

import * as backend from './backend.js';

export class PlaylistManager {
  constructor(app) {
    this.app = app;
    this.playlists = [];
    this.currentPlaylist = null;
    this.playlistVideos = [];
    this.playIndex = 0;
    this._bind();
  }

  _bind() {
    // サブタブ切り替え
    document.getElementById('subtab-videos').addEventListener('click', () => this._switchSubtab('videos'));
    document.getElementById('subtab-playlists').addEventListener('click', () => this._switchSubtab('playlists'));

    // 再生リスト作成モーダル
    document.getElementById('btn-create-playlist').addEventListener('click', () => this._openCreateModal());
    document.getElementById('playlist-cancel').addEventListener('click', () => this._closeCreateModal());
    document.getElementById('playlist-create').addEventListener('click', () => this._submitCreate());
    document.getElementById('playlist-modal').addEventListener('click', (e) => {
      if (e.target.id === 'playlist-modal') this._closeCreateModal();
    });

    // 再生リスト詳細
    document.getElementById('btn-back-playlists').addEventListener('click', () => this._backToGrid());
    document.getElementById('btn-play-playlist').addEventListener('click', () => this._playFromStart());
    document.getElementById('btn-delete-playlist').addEventListener('click', () => this._deleteCurrent());

    // プレイヤーからリストに追加
    document.getElementById('btn-add-to-playlist').addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleAddDropdown(e.currentTarget);
    });
    document.addEventListener('click', () => {
      document.getElementById('add-to-playlist-dropdown').classList.add('hidden');
    });
  }

  _switchSubtab(tab) {
    document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('community-grid').classList.add('hidden');
    document.getElementById('playlist-grid-view').classList.add('hidden');
    document.getElementById('playlist-detail-view').classList.add('hidden');
    document.getElementById('community-player').classList.add('hidden');

    if (tab === 'videos') {
      document.getElementById('subtab-videos').classList.add('active');
      document.getElementById('community-grid').classList.remove('hidden');
      this.app.community.refreshGrid();
    } else {
      document.getElementById('subtab-playlists').classList.add('active');
      document.getElementById('playlist-grid-view').classList.remove('hidden');
      this.refreshPlaylists();
    }
  }

  // ===== 再生リスト一覧 =====
  async refreshPlaylists() {
    const grid = document.getElementById('playlist-grid');
    grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">読み込み中...</p>';
    try {
      this.playlists = await backend.getPlaylists();
    } catch (e) {
      grid.innerHTML = `<p class="text-red-400 col-span-full text-center py-8">取得に失敗しました: ${e.message}</p>`;
      return;
    }
    if (this.playlists.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <p class="text-gray-500 text-lg mb-2">📋 再生リストがありません</p>
          <p class="text-gray-600 text-sm">「再生リスト作成」ボタンから新しいリストを作成できます</p>
        </div>`;
      return;
    }
    grid.innerHTML = '';
    for (const p of this.playlists) {
      const card = document.createElement('div');
      card.className = 'playlist-card';
      card.innerHTML = `
        <div class="playlist-thumb">
          <span>📋</span>
          <span class="playlist-count">${p.video_ids.length} 本</span>
        </div>
        <div class="p-3">
          <h3 class="font-bold text-sm truncate">${this._esc(p.name)}</h3>
          <p class="text-xs text-dim mt-1 truncate">${this._esc(p.description) || '説明なし'}</p>
        </div>`;
      card.addEventListener('click', () => this.openPlaylist(p.id));
      grid.appendChild(card);
    }
  }

  // ===== 再生リスト詳細 =====
  async openPlaylist(playlistId) {
    document.getElementById('playlist-grid-view').classList.add('hidden');
    document.getElementById('playlist-detail-view').classList.remove('hidden');

    const playlist = await backend.getPlaylist(playlistId);
    if (!playlist) { alert('再生リストが見つかりません'); return; }
    this.currentPlaylist = playlist;

    document.getElementById('playlist-detail-name').textContent = playlist.name;
    document.getElementById('playlist-detail-desc').textContent = playlist.description || '';

    // 動画一覧を取得
    const allVideos = await backend.getVideos();
    this.playlistVideos = playlist.video_ids
      .map(vid => allVideos.find(v => v.id === vid))
      .filter(Boolean);

    this._renderPlaylistVideos();
  }

  _renderPlaylistVideos() {
    const container = document.getElementById('playlist-videos');
    container.innerHTML = '';
    if (this.playlistVideos.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-8">動画が追加されていません</p>';
      return;
    }
    this.playlistVideos.forEach((v, i) => {
      const item = document.createElement('div');
      item.className = 'playlist-item';
      const date = new Date(v.created_at).toLocaleDateString('ja-JP');
      item.innerHTML = `
        <span class="text-dim text-sm w-6 text-center">${i + 1}</span>
        <video src="${v.video_url}" muted preload="metadata" class="playlist-item-thumb"></video>
        <div class="playlist-item-info">
          <h4>${this._esc(v.title)}</h4>
          <span>👁 ${v.views || 0} · ${date}</span>
        </div>
        <button class="playlist-item-delete" title="リストから削除">✕</button>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('playlist-item-delete')) return;
        this._playAt(i);
      });
      item.querySelector('.playlist-item-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await backend.removeVideoFromPlaylist(this.currentPlaylist.id, v.id);
        this.currentPlaylist.video_ids = this.currentPlaylist.video_ids.filter(vid => vid !== v.id);
        this.playlistVideos.splice(i, 1);
        this._renderPlaylistVideos();
      });
      container.appendChild(item);
    });
  }

  _backToGrid() {
    document.getElementById('playlist-detail-view').classList.add('hidden');
    document.getElementById('playlist-grid-view').classList.remove('hidden');
    this.currentPlaylist = null;
    this.refreshPlaylists();
  }

  // ===== 連続再生 =====
  _playFromStart() { this._playAt(0); }

  async _playAt(index) {
    if (index < 0 || index >= this.playlistVideos.length) return;
    this.playIndex = index;

    // プレイヤーを表示
    document.getElementById('playlist-detail-view').classList.add('hidden');
    document.getElementById('community-grid').classList.add('hidden');
    document.getElementById('playlist-grid-view').classList.add('hidden');
    document.getElementById('community-player').classList.remove('hidden');

    const video = this.playlistVideos[index];
    await this.app.player.open(video.id);

    // 再生終了時に次の動画へ
    const videoEl = document.getElementById('player-video');
    const onEnded = () => {
      videoEl.removeEventListener('ended', onEnded);
      this._playAt(index + 1);
    };
    videoEl.addEventListener('ended', onEnded);
  }

  // ===== 再生リスト作成モーダル =====
  _openCreateModal() {
    document.getElementById('playlist-modal').classList.remove('hidden');
    document.getElementById('playlist-modal').classList.add('flex');
    document.getElementById('playlist-name').focus();
  }

  _closeCreateModal() {
    document.getElementById('playlist-modal').classList.add('hidden');
    document.getElementById('playlist-modal').classList.remove('flex');
    document.getElementById('playlist-name').value = '';
    document.getElementById('playlist-desc').value = '';
  }

  async _submitCreate() {
    const name = document.getElementById('playlist-name').value.trim();
    const desc = document.getElementById('playlist-desc').value.trim();
    if (!name) { alert('リスト名を入力してください'); return; }

    const btn = document.getElementById('playlist-create');
    btn.textContent = '作成中...';
    btn.disabled = true;
    try {
      await backend.createPlaylist(name, desc);
      this._closeCreateModal();
      this.refreshPlaylists();
    } catch (e) {
      alert('再生リストの作成に失敗しました: ' + e.message);
    } finally {
      btn.textContent = '作成';
      btn.disabled = false;
    }
  }

  // ===== 再生リスト削除 =====
  async _deleteCurrent() {
    if (!this.currentPlaylist) return;
    if (!confirm(`再生リスト「${this.currentPlaylist.name}」を削除しますか？`)) return;
    try {
      await backend.deletePlaylist(this.currentPlaylist.id);
      this._backToGrid();
    } catch (e) {
      alert('削除に失敗しました: ' + e.message);
    }
  }

  // ===== プレイヤーからリストに追加 =====
  async _toggleAddDropdown(btnEl) {
    if (!this.app.player.currentVideo) return;
    const dropdown = document.getElementById('add-to-playlist-dropdown');
    if (!dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      return;
    }

    // リストを取得
    try {
      this.playlists = await backend.getPlaylists();
    } catch (e) {
      alert('再生リストの取得に失敗しました: ' + e.message);
      return;
    }

    dropdown.innerHTML = '';
    if (this.playlists.length === 0) {
      dropdown.innerHTML = '<div class="px-4 py-3 text-sm text-dim">再生リストがありません。「再生リスト」タブから作成してください。</div>';
    } else {
      this.playlists.forEach(p => {
        const item = document.createElement('div');
        item.className = 'px-4 py-2 text-sm cursor-pointer hover:bg-surface flex items-center justify-between gap-2';
        const inList = p.video_ids.includes(this.app.player.currentVideo.id);
        item.innerHTML = `<span class="truncate">${this._esc(p.name)}</span>${inList ? '<span class="text-xs text-accent2 shrink-0">✓ 追加済み</span>' : ''}`;
        if (!inList) {
          item.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              await backend.addVideoToPlaylist(p.id, this.app.player.currentVideo.id);
              dropdown.classList.add('hidden');
              alert(`「${p.name}」に追加しました`);
            } catch (err) {
              alert('追加に失敗しました: ' + err.message);
            }
          });
        }
        dropdown.appendChild(item);
      });
    }

    // ボタンの下に配置
    const rect = btnEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.classList.remove('hidden');
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
}
