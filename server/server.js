// server/server.js — 動画共有バックエンド API
// 投稿された動画をサーバーに保存し、どのデバイスからでも視聴できるようにする

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const VIDEOS_JSON = path.join(DATA_DIR, 'videos.json');
const COMMENTS_JSON = path.join(DATA_DIR, 'comments.json');
const PLAYLISTS_JSON = path.join(DATA_DIR, 'playlists.json');

// ディレクトリとファイルを準備
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getVideos() { return readJSON(VIDEOS_JSON, []); }
function saveVideos(v) { writeJSON(VIDEOS_JSON, v); }
function getComments() { return readJSON(COMMENTS_JSON, []); }
function saveComments(c) { writeJSON(COMMENTS_JSON, c); }
function getPlaylists() { return readJSON(PLAYLISTS_JSON, []); }
function savePlaylists(p) { writeJSON(PLAYLISTS_JSON, p); }

// 拡張子を MIME タイプから判定
function extForMime(mime) {
  const map = {
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
  };
  return map[mime] || 'webm';
}

const app = express();
app.use(express.json());

// multer: メモリに貯めずディスクへ直接書き出し
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const id = randomUUID();
      const ext = extForMime(file.mimetype);
      cb(null, `${id}.${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// ===== ヘルスチェック =====
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'shared' });
});

// ===== 動画一覧 =====
app.get('/api/videos', (_req, res) => {
  const videos = getVideos()
    .sort((a, b) => b.created_at - a.created_at)
    .map(v => ({ ...v, video_url: `/api/videos/${v.id}/file` }));
  res.json(videos);
});

// ===== 動画アップロード =====
app.post('/api/videos', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
  const title = (req.body.title || '無題').trim();
  const description = (req.body.description || '').trim();
  const id = path.basename(req.file.filename, path.extname(req.file.filename));

  const video = {
    id,
    title,
    description,
    filename: req.file.filename,
    video_url: `/api/videos/${id}/file`,
    likes: 0,
    views: 0,
    created_at: Date.now(),
  };
  const videos = getVideos();
  videos.push(video);
  saveVideos(videos);
  res.status(201).json(video);
});

// ===== 動画1件取得 =====
app.get('/api/videos/:id', (req, res) => {
  const video = getVideos().find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: '見つかりません' });
  res.json({ ...video, video_url: `/api/videos/${video.id}/file` });
});

// ===== 動画ファイル配信（ストリーミング対応） =====
app.get('/api/videos/:id/file', (req, res) => {
  const video = getVideos().find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: '見つかりません' });
  const filePath = path.join(UPLOAD_DIR, video.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'ファイルがありません' });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Range リクエスト対応（動画シーク用）
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    res.status(206).set({
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/*',
    });
    stream.pipe(res);
  } else {
    res.set({ 'Content-Length': fileSize, 'Content-Type': 'video/*' });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ===== 高評価 =====
app.post('/api/videos/:id/like', (req, res) => {
  const videos = getVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: '見つかりません' });
  video.likes = (video.likes || 0) + 1;
  saveVideos(videos);
  res.json({ likes: video.likes });
});

// ===== 視聴回数 =====
app.post('/api/videos/:id/views', (req, res) => {
  const videos = getVideos();
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: '見つかりません' });
  video.views = (video.views || 0) + 1;
  saveVideos(videos);
  res.json({ views: video.views });
});

// ===== コメント投稿 =====
app.post('/api/videos/:id/comments', (req, res) => {
  const { time, text, color } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'コメントが空です' });
  const comment = {
    id: randomUUID(),
    video_id: req.params.id,
    time: Number(time) || 0,
    text: text.trim(),
    color: color || '#FFFFFF',
    created_at: Date.now(),
  };
  const comments = getComments();
  comments.push(comment);
  saveComments(comments);
  res.status(201).json(comment);
});

// ===== コメント一覧 =====
app.get('/api/videos/:id/comments', (req, res) => {
  const comments = getComments()
    .filter(c => c.video_id === req.params.id)
    .sort((a, b) => a.time - b.time);
  res.json(comments);
});

// ===== Google Drive 動画メタデータ登録（ファイル本体はDriveに保存）=====
app.post('/api/videos/drive', (req, res) => {
  const { title, description, drive_file_id, video_url } = req.body;
  if (!drive_file_id || !video_url) return res.status(400).json({ error: 'DriveファイルIDとURLが必要です' });
  const id = randomUUID();
  const video = {
    id,
    title: (title || '無題').trim(),
    description: (description || '').trim(),
    drive_file_id,
    video_url,
    source: 'gdrive',
    likes: 0,
    views: 0,
    created_at: Date.now(),
  };
  const videos = getVideos();
  videos.push(video);
  saveVideos(videos);
  res.status(201).json(video);
});

// ===== 再生リスト一覧 =====
app.get('/api/playlists', (_req, res) => {
  const playlists = getPlaylists().sort((a, b) => b.created_at - a.created_at);
  res.json(playlists);
});

// ===== 再生リスト作成 =====
app.post('/api/playlists', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'リスト名が必要です' });
  const playlist = {
    id: randomUUID(),
    name: name.trim(),
    description: (description || '').trim(),
    video_ids: [],
    created_at: Date.now(),
  };
  const playlists = getPlaylists();
  playlists.push(playlist);
  savePlaylists(playlists);
  res.status(201).json(playlist);
});

// ===== 再生リスト1件取得 =====
app.get('/api/playlists/:id', (req, res) => {
  const playlist = getPlaylists().find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: '見つかりません' });
  res.json(playlist);
});

// ===== 再生リストに動画追加 =====
app.post('/api/playlists/:id/videos', (req, res) => {
  const { video_id } = req.body;
  if (!video_id) return res.status(400).json({ error: '動画IDが必要です' });
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: '見つかりません' });
  if (!playlist.video_ids.includes(video_id)) {
    playlist.video_ids.push(video_id);
    savePlaylists(playlists);
  }
  res.json(playlist);
});

// ===== 再生リストから動画削除 =====
app.delete('/api/playlists/:id/videos/:videoId', (req, res) => {
  const playlists = getPlaylists();
  const playlist = playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: '見つかりません' });
  playlist.video_ids = playlist.video_ids.filter(vid => vid !== req.params.videoId);
  savePlaylists(playlists);
  res.json(playlist);
});

// ===== 再生リスト削除 =====
app.delete('/api/playlists/:id', (req, res) => {
  const playlists = getPlaylists();
  const idx = playlists.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '見つかりません' });
  const [deleted] = playlists.splice(idx, 1);
  savePlaylists(playlists);
  res.json(deleted);
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] 動画共有API起動: http://0.0.0.0:${PORT}`);
});
