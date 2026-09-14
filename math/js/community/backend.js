// js/community/backend.js — Firebase/Supabase/IndexedDB 連携ロジック
// APIキー未設定時は自動的に IndexedDB ローカルデモモードにフォールバック

const DB_NAME = 'mathclip_studio';
const DB_VERSION = 1;
const STORE_VIDEOS = 'videos';
const STORE_COMMENTS = 'comments';
const STORE_BLOBS = 'blobs';

let backend = null; // 'firebase' | 'supabase' | 'local'
let dbInstance = null;

// ===== Backend detection =====
export async function initBackend() {
  // Check for Firebase config
  if (window.firebaseConfig || getEnv('FIREBASE_CONFIG')) {
    try {
      backend = 'firebase';
      // Dynamic Firebase init would go here — omitted for static deployment
      console.log('[backend] Firebase mode');
      return 'firebase';
    } catch (e) {
      console.warn('[backend] Firebase init failed, falling back', e);
    }
  }
  // Check for Supabase config
  if (getEnv('SUPABASE_URL') && getEnv('SUPABASE_ANON_KEY')) {
    try {
      backend = 'supabase';
      console.log('[backend] Supabase mode');
      return 'supabase';
    } catch (e) {
      console.warn('[backend] Supabase init failed, falling back', e);
    }
  }
  backend = 'local';
  await openDB();
  console.log('[backend] Local (IndexedDB) demo mode');
  return 'local';
}

export function getBackendMode() { return backend; }

function getEnv(key) {
  try { return (window.__env && window.__env[key]) || ''; } catch { return ''; }
}

// ===== IndexedDB =====
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
        const store = db.createObjectStore(STORE_COMMENTS, { keyPath: 'id' });
        store.createIndex('video_id', 'video_id');
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

// ===== Public API =====

/**
 * 動画をアップロード・登録
 * @param {File|Blob} file
 * @param {string} title
 * @param {string} desc
 * @returns {Promise<object>} 登録された動画オブジェクト
 */
export async function uploadVideo(file, title, desc = '') {
  const id = crypto.randomUUID();
  const created_at = Date.now();
  let video_url = '';

  if (backend === 'local') {
    // Store blob in IndexedDB
    const blobId = 'blob_' + id;
    await idbPut(STORE_BLOBS, { id: blobId, blob: file });
    video_url = URL.createObjectURL(file);
  } else {
    // Firebase/Supabase: upload to storage, get URL
    video_url = await uploadToCloud(file, id);
  }

  const video = {
    id,
    title,
    description: desc,
    video_url,
    blob_id: backend === 'local' ? 'blob_' + id : null,
    likes: 0,
    views: 0,
    created_at,
  };
  await idbPut(STORE_VIDEOS, video);
  return video;
}

/**
 * 動画一覧を取得(作成日降順)
 */
export async function getVideos() {
  const videos = await idbGetAll(STORE_VIDEOS);
  // Restore blob URLs if needed
  for (const v of videos) {
    if (v.blob_id && !v.video_url.startsWith('blob:')) {
      const blobRecord = await idbGet(STORE_BLOBS, v.blob_id);
      if (blobRecord) v.video_url = URL.createObjectURL(blobRecord.blob);
    }
  }
  return videos.sort((a, b) => b.created_at - a.created_at);
}

/**
 * 動画を1件取得
 */
export async function getVideo(videoId) {
  const video = await idbGet(STORE_VIDEOS, videoId);
  if (video && video.blob_id) {
    const blobRecord = await idbGet(STORE_BLOBS, video.blob_id);
    if (blobRecord) video.video_url = URL.createObjectURL(blobRecord.blob);
  }
  return video;
}

/**
 * 高評価(+1)
 */
export async function likeVideo(videoId) {
  const video = await idbGet(STORE_VIDEOS, videoId);
  if (!video) return 0;
  video.likes = (video.likes || 0) + 1;
  await idbPut(STORE_VIDEOS, video);
  return video.likes;
}

/**
 * 視聴回数(+1)
 */
export async function incrementViews(videoId) {
  const video = await idbGet(STORE_VIDEOS, videoId);
  if (!video) return 0;
  video.views = (video.views || 0) + 1;
  await idbPut(STORE_VIDEOS, video);
  return video.views;
}

/**
 * 弾幕コメントを投稿
 */
export async function postComment(videoId, time, text, color = '#FFFFFF') {
  const comment = {
    id: crypto.randomUUID(),
    video_id: videoId,
    time,
    text,
    color,
    created_at: Date.now(),
  };
  await idbPut(STORE_COMMENTS, comment);
  return comment;
}

/**
 * 動画の全コメントを時間順で取得
 */
export async function getComments(videoId) {
  const all = await idbGetAll(STORE_COMMENTS, 'video_id');
  return all
    .filter(c => c.video_id === videoId)
    .sort((a, b) => a.time - b.time);
}

// ===== Cloud upload stubs (activated when keys are present) =====
async function uploadToCloud(file, id) {
  // Firebase Storage or Supabase Storage upload
  // Implementation depends on configured backend
  throw new Error('Cloud upload not configured — add Firebase/Supabase keys');
}
