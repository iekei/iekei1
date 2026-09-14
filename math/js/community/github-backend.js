// js/community/github-backend.js — GitHub API を使った動画共有バックエンド
// GitHub Pages (静的ホスティング) 環境で、リポジトリ自体をデータストレージとして使い
// どのデバイスからでも動画を共有・視聴できるようにする

const CONFIG_KEY = 'mathclip_community_config';
const API_BASE = 'https://api.github.com';
const DATA_PATH = 'math/data/community';
const VIDEO_DIR = `${DATA_PATH}/videos`;
const VIDEOS_FILE = `${DATA_PATH}/videos.json`;
const COMMENTS_FILE = `${DATA_PATH}/comments.json`;

// ===== 設定（localStorage）=====
export function getCommunityConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; }
  catch { return {}; }
}

export function saveCommunityConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function isGitHubConfigured() {
  const c = getCommunityConfig();
  return !!(c.token && c.owner && c.repo);
}

function cfg() { return getCommunityConfig(); }

function rawBase() {
  const c = cfg();
  const branch = c.branch || 'main';
  return `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${branch}`;
}

function videoRawUrl(filename) {
  return `${rawBase()}/${VIDEO_DIR}/${filename}`;
}

// ===== GitHub API 共通 =====

async function ghGetFile(path) {
  const c = cfg();
  const branch = c.branch || 'main';
  const url = `${API_BASE}/repos/${c.owner}/${c.repo}/contents/${path}?ref=${branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API GET ${path}: ${res.status}`);
  return res.json();
}

async function ghPutFile(path, base64Content, message, sha) {
  const c = cfg();
  const branch = c.branch || 'main';
  const url = `${API_BASE}/repos/${c.owner}/${c.repo}/contents/${path}`;
  const body = { message, content: base64Content, branch };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub API PUT ${path}: ${res.status} ${err.message || ''}`);
  }
  return res.json();
}

// JSON ファイルの読み書き
async function ghGetJSON(path, fallback) {
  const file = await ghGetFile(path);
  if (!file) return fallback;
  const json = atob(file.content.replace(/\n/g, ''));
  return JSON.parse(json);
}

function encodeJSON(data) {
  const json = JSON.stringify(data, null, 2);
  return btoa(unescape(encodeURIComponent(json)));
}

// 競合リトライ付き JSON 更新
async function ghUpdateJSON(path, updater, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const file = await ghGetFile(path);
    const data = file ? JSON.parse(atob(file.content.replace(/\n/g, ''))) : [];
    const newData = updater(data);
    const base64 = encodeJSON(newData);
    try {
      await ghPutFile(path, base64, message, file?.sha);
      return newData;
    } catch (e) {
      if (i === retries - 1) throw e;
      // SHA 競合 → 再取得してリトライ
    }
  }
}

// ArrayBuffer → base64（チャンク分割で大きいファイルも対応）
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function extForFile(file) {
  const match = file.name.match(/\.([a-z0-9]+)$/i);
  if (match) return match[1].toLowerCase();
  const map = { 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/ogg': 'ogv', 'video/quicktime': 'mov' };
  return map[file.type] || 'mp4';
}

// ===== 公開API =====

export async function uploadVideo(file, title, desc = '') {
  // GitHub Contents API の上限は100MB（base64込で実質~75MB）
  const MAX_SIZE = 50 * 1024 * 1024; // 50MB
  if (file.size > MAX_SIZE) {
    throw new Error(`ファイルサイズが大きすぎます (${(file.size / 1024 / 1024).toFixed(1)}MB)。GitHubモードの上限は50MBです。`);
  }

  const id = crypto.randomUUID();
  const ext = extForFile(file);
  const filename = `${id}.${ext}`;
  const filePath = `${VIDEO_DIR}/${filename}`;

  // 動画ファイルをリポジトリに保存
  const arrayBuffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  await ghPutFile(filePath, base64, `Upload video: ${title}`);

  // メタデータを更新
  const video = {
    id,
    title: title.trim() || '無題',
    description: desc.trim(),
    filename,
    likes: 0,
    views: 0,
    created_at: Date.now(),
  };
  await ghUpdateJSON(VIDEOS_FILE, (videos) => [...videos, video], `Add video metadata: ${title}`);

  return { ...video, video_url: videoRawUrl(filename) };
}

export async function getVideos() {
  const videos = await ghGetJSON(VIDEOS_FILE, []);
  return videos
    .sort((a, b) => b.created_at - a.created_at)
    .map(v => ({ ...v, video_url: videoRawUrl(v.filename) }));
}

export async function getVideo(videoId) {
  const videos = await ghGetJSON(VIDEOS_FILE, []);
  const v = videos.find(x => x.id === videoId);
  if (!v) return null;
  return { ...v, video_url: videoRawUrl(v.filename) };
}

export async function likeVideo(videoId) {
  const videos = await ghUpdateJSON(VIDEOS_FILE, (list) => {
    const v = list.find(x => x.id === videoId);
    if (v) v.likes = (v.likes || 0) + 1;
    return list;
  }, `Like video: ${videoId}`);
  const v = videos.find(x => x.id === videoId);
  return v ? v.likes : 0;
}

export async function incrementViews(videoId) {
  const videos = await ghUpdateJSON(VIDEOS_FILE, (list) => {
    const v = list.find(x => x.id === videoId);
    if (v) v.views = (v.views || 0) + 1;
    return list;
  }, `View video: ${videoId}`);
  const v = videos.find(x => x.id === videoId);
  return v ? v.views : 0;
}

export async function postComment(videoId, time, text, color = '#FFFFFF') {
  const comment = {
    id: crypto.randomUUID(),
    video_id: videoId,
    time: Number(time) || 0,
    text: text.trim(),
    color,
    created_at: Date.now(),
  };
  await ghUpdateJSON(COMMENTS_FILE, (list) => [...list, comment], `Add comment to ${videoId}`);
  return comment;
}

export async function getComments(videoId) {
  const comments = await ghGetJSON(COMMENTS_FILE, []);
  return comments
    .filter(c => c.video_id === videoId)
    .sort((a, b) => a.time - b.time);
}
