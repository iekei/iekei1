// js/community/firebase-backend.js — Firebase を使った動画共有バックエンド
// GitHub Pages (静的ホスティング) 環境で、Firebase Storage + Realtime Database を使い
// どのデバイスからでも動画を共有・視聴できるようにする（トークン・アカウント不要）

const CONFIG_KEY = 'mathclip_firebase_config';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.0';

let _app = null;
let _storage = null;
let _db = null;
// Cached SDK functions
let _uploadBytesResumable, _getDownloadURL, _sRef;
let _dbRef, _dbGet, _dbSet, _dbUpdate, _dbPush, _dbRemove;

// ===== 設定（localStorage）=====
export function getFirebaseConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; }
  catch { return {}; }
}

export function saveFirebaseConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function isFirebaseConfigured() {
  const c = getFirebaseConfig();
  return !!(c.apiKey && c.databaseURL && c.storageBucket);
}

// ===== Firebase 初期化（SDK を遅延ロード）=====
export async function initFirebase() {
  if (_app) return;
  const config = getFirebaseConfig();
  if (!config.apiKey) throw new Error('Firebase設定がありません');

  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  const sMod = await import(`${SDK}/firebase-storage.js`);
  const dMod = await import(`${SDK}/firebase-database.js`);

  _app = initializeApp(config);
  _storage = sMod.getStorage(_app);
  _db = dMod.getDatabase(_app);

  _uploadBytesResumable = sMod.uploadBytesResumable;
  _getDownloadURL = sMod.getDownloadURL;
  _sRef = sMod.ref;
  _dbRef = dMod.ref;
  _dbGet = dMod.get;
  _dbSet = dMod.set;
  _dbUpdate = dMod.update;
  _dbPush = dMod.push;
  _dbRemove = dMod.remove;
}

// ===== ヘルパー =====
function extForFile(file) {
  const match = file.name.match(/\.([a-z0-9]+)$/i);
  if (match) return match[1].toLowerCase();
  const map = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/ogg': 'ogv', 'video/quicktime': 'mov' };
  return map[file.type] || 'mp4';
}

// ===== 公開API =====

export async function uploadVideo(file, title, desc = '', onProgress = null) {
  await initFirebase();

  const id = crypto.randomUUID();
  const ext = extForFile(file);
  const filename = `${id}.${ext}`;
  const storagePath = `videos/${filename}`;

  // Storage に動画ファイルをアップロード
  const storageRef = _sRef(_storage, storagePath);
  const uploadTask = _uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'video/mp4',
  });

  await new Promise((resolve, reject) => {
    uploadTask.on('state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      resolve,
    );
  });

  const video_url = await _getDownloadURL(uploadTask.snapshot.ref);

  // Realtime Database にメタデータを保存
  const video = {
    id,
    title: title.trim() || '無題',
    description: desc.trim(),
    filename,
    video_url,
    likes: 0,
    views: 0,
    created_at: Date.now(),
  };
  await _dbSet(_dbRef(_db, `videos/${id}`), video);

  return video;
}

export async function getVideos() {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, 'videos'));
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.values(data).sort((a, b) => b.created_at - a.created_at);
}

export async function getVideo(videoId) {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, `videos/${videoId}`));
  if (!snapshot.exists()) return null;
  return snapshot.val();
}

export async function likeVideo(videoId) {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, `videos/${videoId}`));
  if (!snapshot.exists()) return 0;
  const video = snapshot.val();
  const likes = (video.likes || 0) + 1;
  await _dbUpdate(_dbRef(_db, `videos/${videoId}`), { likes });
  return likes;
}

export async function incrementViews(videoId) {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, `videos/${videoId}`));
  if (!snapshot.exists()) return 0;
  const video = snapshot.val();
  const views = (video.views || 0) + 1;
  await _dbUpdate(_dbRef(_db, `videos/${videoId}`), { views });
  return views;
}

export async function postComment(videoId, time, text, color = '#FFFFFF') {
  await initFirebase();
  const comment = {
    video_id: videoId,
    time: Number(time) || 0,
    text: text.trim(),
    color,
    created_at: Date.now(),
  };
  const newRef = await _dbPush(_dbRef(_db, `comments/${videoId}`), comment);
  return { id: newRef.key, ...comment };
}

export async function getComments(videoId) {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, `comments/${videoId}`));
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.entries(data)
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => a.time - b.time);
}

// ===== Google Drive 動画メタデータ保存（ファイル本体はDriveに保存）=====
export async function uploadDriveVideoMetadata(title, desc, driveFileId, videoUrl) {
  await initFirebase();
  const id = crypto.randomUUID();
  const video = {
    id,
    title: title.trim() || '無題',
    description: desc.trim(),
    drive_file_id: driveFileId,
    video_url: videoUrl,
    source: 'gdrive',
    likes: 0,
    views: 0,
    created_at: Date.now(),
  };
  await _dbSet(_dbRef(_db, `videos/${id}`), video);
  return video;
}

// ===== 再生リスト =====

export async function getPlaylists() {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, 'playlists'));
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  return Object.values(data).sort((a, b) => b.created_at - a.created_at);
}

export async function createPlaylist(name, description = '') {
  await initFirebase();
  const playlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description.trim(),
    video_ids: [],
    created_at: Date.now(),
  };
  await _dbSet(_dbRef(_db, `playlists/${playlist.id}`), playlist);
  return playlist;
}

export async function getPlaylist(playlistId) {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, `playlists/${playlistId}`));
  if (!snapshot.exists()) return null;
  return snapshot.val();
}

export async function addVideoToPlaylist(playlistId, videoId) {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, `playlists/${playlistId}`));
  if (!snapshot.exists()) throw new Error('再生リストが見つかりません');
  const playlist = snapshot.val();
  if (!playlist.video_ids) playlist.video_ids = [];
  if (!playlist.video_ids.includes(videoId)) playlist.video_ids.push(videoId);
  await _dbUpdate(_dbRef(_db, `playlists/${playlistId}`), { video_ids: playlist.video_ids });
  return playlist;
}

export async function removeVideoFromPlaylist(playlistId, videoId) {
  await initFirebase();
  const snapshot = await _dbGet(_dbRef(_db, `playlists/${playlistId}`));
  if (!snapshot.exists()) throw new Error('再生リストが見つかりません');
  const playlist = snapshot.val();
  playlist.video_ids = (playlist.video_ids || []).filter(vid => vid !== videoId);
  await _dbUpdate(_dbRef(_db, `playlists/${playlistId}`), { video_ids: playlist.video_ids });
  return playlist;
}

export async function deletePlaylist(playlistId) {
  await initFirebase();
  await _dbRemove(_dbRef(_db, `playlists/${playlistId}`));
  return { ok: true };
}
