// js/community/backend.js — 動画共有バックエンド連携
// サーバーAPI (/api/) または GitHub API に動画を保存し、どのデバイスからでも視聴できるようにする

import * as github from './github-backend.js';
import * as firebase from './firebase-backend.js';
import { uploadFileToDrive, shareFilePublic, getDriveVideoUrl, isDriveConfigured } from '../editor/google-drive.js';

let backend = null; // 'shared' | 'firebase' | 'github' | 'local'
let dbInstance = null;

// ===== IndexedDB (フォールバック用) =====
const DB_NAME = 'mathclip_studio';
const DB_VERSION = 1;
const STORE_VIDEOS = 'videos';
const STORE_COMMENTS = 'comments';
const STORE_BLOBS = 'blobs';
const STORE_PLAYLISTS = 'playlists';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        const store = db.createObjectStore(STORE_VIDEOS, { keyPath: 'id' });
        store.createIndex('created_at', 'created_at');
      }
      if (!db.objectStoreNames.contains(STORE_COMMENTS)) {
        db.createObjectStore(STORE_COMMENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
        db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function idbPut(store, value) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(store, indexName) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(store, 'readonly');
    const req = indexName
      ? tx.objectStore(store).index(indexName).getAll()
      : tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ===== バックエンド初期化 =====
export async function initBackend() {
  // 1. サーバーAPI (Base44プレビュー等の動的環境)
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.ok) {
      backend = 'shared';
      console.log('[backend] 共有モード (サーバーAPI)');
      return 'shared';
    }
  } catch (e) {
    console.warn('[backend] サーバーAPIに接続できません', e);
  }
  // 2. Firebase (GitHub Pages等の静的環境・トークン不要)
  if (firebase.isFirebaseConfigured()) {
    try {
      await firebase.initFirebase();
      backend = 'firebase';
      console.log('[backend] Firebaseモード (Storage + Realtime DB)');
      return 'firebase';
    } catch (e) {
      console.warn('[backend] Firebase初期化に失敗', e);
    }
  }
  // 3. GitHub API (GitHub Pages等の静的環境・トークン必要)
  if (github.isGitHubConfigured()) {
    backend = 'github';
    console.log('[backend] GitHubモード (GitHub API)');
    return 'github';
  }
  // 4. ローカルフォールバック (IndexedDB)
  backend = 'local';
  await openDB();
  console.log('[backend] ローカルモード (IndexedDB)');
  return 'local';
}

export function getBackendMode() { return backend; }

// ===== 動画アップロード =====
export async function uploadVideo(file, title, desc = '') {
  // Google Drive が設定済みの場合はDriveにアップロードしてメタデータのみ保存
  if (isDriveConfigured()) {
    return uploadDriveVideo(file, title, desc);
  }
  if (backend === 'shared') {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('description', desc);
    const res = await fetch('/api/videos', { method: 'POST', body: form });
    if (!res.ok) throw new Error('アップロードに失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.uploadVideo(file, title, desc);
  }
  if (backend === 'github') {
    return github.uploadVideo(file, title, desc);
  }
  // ローカルフォールバック
  const id = crypto.randomUUID();
  const created_at = Date.now();
  const blobId = 'blob_' + id;
  await idbPut(STORE_BLOBS, { id: blobId, blob: file });
  const video_url = URL.createObjectURL(file);
  const video = { id, title, description: desc, video_url, blob_id: blobId, likes: 0, views: 0, created_at };
  await idbPut(STORE_VIDEOS, video);
  return video;
}

// ===== Google Drive への動画アップロード =====
export async function uploadDriveVideo(file, title, desc = '') {
  // 1. Google Drive にファイルをアップロード
  const driveFile = await uploadFileToDrive(file);
  // 2. 公開設定（リンクを知る全員が閲覧可能）
  await shareFilePublic(driveFile.id);
  // 3. 再生用URLを生成
  const video_url = getDriveVideoUrl(driveFile.id);

  // 4. メタデータをバックエンドに保存
  if (backend === 'shared') {
    const res = await fetch('/api/videos/drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc, drive_file_id: driveFile.id, video_url }),
    });
    if (!res.ok) throw new Error('メタデータの保存に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.uploadDriveVideoMetadata(title, desc, driveFile.id, video_url);
  }
  if (backend === 'github') {
    return github.uploadDriveVideoMetadata(title, desc, driveFile.id, video_url);
  }
  // ローカルフォールバック
  const id = crypto.randomUUID();
  const video = { id, title, description: desc, drive_file_id: driveFile.id, video_url, source: 'gdrive', likes: 0, views: 0, created_at: Date.now() };
  await idbPut(STORE_VIDEOS, video);
  return video;
}

// ===== 動画一覧 =====
export async function getVideos() {
  if (backend === 'shared') {
    const res = await fetch('/api/videos');
    if (!res.ok) throw new Error('一覧取得に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.getVideos();
  }
  if (backend === 'github') {
    return github.getVideos();
  }
  const videos = await idbGetAll(STORE_VIDEOS);
  for (const v of videos) {
    if (v.blob_id && (!v.video_url || !v.video_url.startsWith('blob:'))) {
      const blobRecord = await idbGet(STORE_BLOBS, v.blob_id);
      if (blobRecord) v.video_url = URL.createObjectURL(blobRecord.blob);
    }
  }
  return videos.sort((a, b) => b.created_at - a.created_at);
}

// ===== 動画1件取得 =====
export async function getVideo(videoId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/videos/${videoId}`);
    if (!res.ok) throw new Error('動画取得に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.getVideo(videoId);
  }
  if (backend === 'github') {
    return github.getVideo(videoId);
  }
  const video = await idbGet(STORE_VIDEOS, videoId);
  if (video && video.blob_id) {
    const blobRecord = await idbGet(STORE_BLOBS, video.blob_id);
    if (blobRecord) video.video_url = URL.createObjectURL(blobRecord.blob);
  }
  return video;
}

// ===== 高評価 =====
export async function likeVideo(videoId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/videos/${videoId}/like`, { method: 'POST' });
    if (!res.ok) throw new Error('高評価に失敗しました');
    const data = await res.json();
    return data.likes;
  }
  if (backend === 'firebase') {
    return firebase.likeVideo(videoId);
  }
  if (backend === 'github') {
    return github.likeVideo(videoId);
  }
  const video = await idbGet(STORE_VIDEOS, videoId);
  if (!video) return 0;
  video.likes = (video.likes || 0) + 1;
  await idbPut(STORE_VIDEOS, video);
  return video.likes;
}

// ===== 視聴回数 =====
export async function incrementViews(videoId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/videos/${videoId}/views`, { method: 'POST' });
    if (!res.ok) throw new Error('視聴回数更新に失敗しました');
    const data = await res.json();
    return data.views;
  }
  if (backend === 'firebase') {
    return firebase.incrementViews(videoId);
  }
  if (backend === 'github') {
    return github.incrementViews(videoId);
  }
  const video = await idbGet(STORE_VIDEOS, videoId);
  if (!video) return 0;
  video.views = (video.views || 0) + 1;
  await idbPut(STORE_VIDEOS, video);
  return video.views;
}

// ===== コメント投稿 =====
export async function postComment(videoId, time, text, color = '#FFFFFF') {
  if (backend === 'shared') {
    const res = await fetch(`/api/videos/${videoId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, text, color }),
    });
    if (!res.ok) throw new Error('コメント投稿に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.postComment(videoId, time, text, color);
  }
  if (backend === 'github') {
    return github.postComment(videoId, time, text, color);
  }
  const comment = { id: crypto.randomUUID(), video_id: videoId, time, text, color, created_at: Date.now() };
  await idbPut(STORE_COMMENTS, comment);
  return comment;
}

// ===== コメント一覧 =====
export async function getComments(videoId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/videos/${videoId}/comments`);
    if (!res.ok) throw new Error('コメント取得に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.getComments(videoId);
  }
  if (backend === 'github') {
    return github.getComments(videoId);
  }
  const all = await idbGetAll(STORE_COMMENTS, 'video_id');
  return all.filter(c => c.video_id === videoId).sort((a, b) => a.time - b.time);
}

// ===== 再生リスト一覧 =====
export async function getPlaylists() {
  if (backend === 'shared') {
    const res = await fetch('/api/playlists');
    if (!res.ok) throw new Error('再生リスト取得に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.getPlaylists();
  }
  if (backend === 'github') {
    return github.getPlaylists();
  }
  const playlists = await idbGetAll(STORE_PLAYLISTS);
  return playlists.sort((a, b) => b.created_at - a.created_at);
}

// ===== 再生リスト作成 =====
export async function createPlaylist(name, description = '') {
  if (backend === 'shared') {
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error('再生リスト作成に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.createPlaylist(name, description);
  }
  if (backend === 'github') {
    return github.createPlaylist(name, description);
  }
  const playlist = { id: crypto.randomUUID(), name, description, video_ids: [], created_at: Date.now() };
  await idbPut(STORE_PLAYLISTS, playlist);
  return playlist;
}

// ===== 再生リスト1件取得 =====
export async function getPlaylist(playlistId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/playlists/${playlistId}`);
    if (!res.ok) throw new Error('再生リスト取得に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.getPlaylist(playlistId);
  }
  if (backend === 'github') {
    return github.getPlaylist(playlistId);
  }
  return idbGet(STORE_PLAYLISTS, playlistId);
}

// ===== 再生リストに動画追加 =====
export async function addVideoToPlaylist(playlistId, videoId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/playlists/${playlistId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId }),
    });
    if (!res.ok) throw new Error('動画追加に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.addVideoToPlaylist(playlistId, videoId);
  }
  if (backend === 'github') {
    return github.addVideoToPlaylist(playlistId, videoId);
  }
  const playlist = await idbGet(STORE_PLAYLISTS, playlistId);
  if (!playlist) throw new Error('再生リストが見つかりません');
  if (!playlist.video_ids.includes(videoId)) {
    playlist.video_ids.push(videoId);
    await idbPut(STORE_PLAYLISTS, playlist);
  }
  return playlist;
}

// ===== 再生リストから動画削除 =====
export async function removeVideoFromPlaylist(playlistId, videoId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/playlists/${playlistId}/videos/${videoId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('動画削除に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.removeVideoFromPlaylist(playlistId, videoId);
  }
  if (backend === 'github') {
    return github.removeVideoFromPlaylist(playlistId, videoId);
  }
  const playlist = await idbGet(STORE_PLAYLISTS, playlistId);
  if (!playlist) throw new Error('再生リストが見つかりません');
  playlist.video_ids = playlist.video_ids.filter(vid => vid !== videoId);
  await idbPut(STORE_PLAYLISTS, playlist);
  return playlist;
}

// ===== 再生リスト削除 =====
export async function deletePlaylist(playlistId) {
  if (backend === 'shared') {
    const res = await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('再生リスト削除に失敗しました');
    return res.json();
  }
  if (backend === 'firebase') {
    return firebase.deletePlaylist(playlistId);
  }
  if (backend === 'github') {
    return github.deletePlaylist(playlistId);
  }
  const playlist = await idbGet(STORE_PLAYLISTS, playlistId);
  if (playlist) {
    const tx = dbInstance.transaction(STORE_PLAYLISTS, 'readwrite');
    tx.objectStore(STORE_PLAYLISTS).delete(playlistId);
    await new Promise(r => tx.oncomplete = r);
  }
  return playlist;
}
