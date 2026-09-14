// js/community/backend.js — 動画共有バックエンド連携
// サーバーAPI (/api/) または GitHub API に動画を保存し、どのデバイスからでも視聴できるようにする

import * as github from './github-backend.js';

let backend = null; // 'shared' | 'github' | 'local'
let dbInstance = null;

// ===== IndexedDB (フォールバック用) =====
const DB_NAME = 'mathclip_studio';
const DB_VERSION = 1;
const STORE_VIDEOS = 'videos';
const STORE_COMMENTS = 'comments';
const STORE_BLOBS = 'blobs';

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
  // 2. GitHub API (GitHub Pages等の静的環境)
  if (github.isGitHubConfigured()) {
    backend = 'github';
    console.log('[backend] GitHubモード (GitHub API)');
    return 'github';
  }
  // 3. ローカルフォールバック (IndexedDB)
  backend = 'local';
  await openDB();
  console.log('[backend] ローカルモード (IndexedDB)');
  return 'local';
}

export function getBackendMode() { return backend; }

// ===== 動画アップロード =====
export async function uploadVideo(file, title, desc = '') {
  if (backend === 'shared') {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('description', desc);
    const res = await fetch('/api/videos', { method: 'POST', body: form });
    if (!res.ok) throw new Error('アップロードに失敗しました');
    return res.json();
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

// ===== 動画一覧 =====
export async function getVideos() {
  if (backend === 'shared') {
    const res = await fetch('/api/videos');
    if (!res.ok) throw new Error('一覧取得に失敗しました');
    return res.json();
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
  if (backend === 'github') {
    return github.getComments(videoId);
  }
  const all = await idbGetAll(STORE_COMMENTS, 'video_id');
  return all.filter(c => c.video_id === videoId).sort((a, b) => a.time - b.time);
}
