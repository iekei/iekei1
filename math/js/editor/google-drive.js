// js/editor/google-drive.js — Googleドライブ連携 (OAuth 2.0 + Picker API)

const CONFIG_KEY = 'mathclip_gdrive_config';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** 設定（localStorage）を取得 */
export function getDriveConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch (e) {
    return {};
  }
}

/** 設定（localStorage）を保存 */
export function saveDriveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

/** APIキー & OAuthクライアントID が設定済みか */
export function isDriveConfigured() {
  const c = getDriveConfig();
  return !!(c.clientId && c.apiKey);
}

/** 外部スクリプトを重複読み込みせずに import する */
const _scripts = new Map();
function loadScript(src) {
  if (!_scripts.has(src)) {
    _scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`スクリプトの読み込みに失敗しました: ${src}`));
      document.head.appendChild(s);
    }));
  }
  return _scripts.get(src);
}

// ===== OAuth 2.0 (Google Identity Services) =====
let _accessToken = null;
let _tokenExpiresAt = 0;

/**
 * アクセストークンを取得（有効期限内ならキャッシュを再利用）
 * @param {string} clientId
 * @returns {Promise<string>} accessToken
 */
async function getAccessToken(clientId) {
  if (_accessToken && Date.now() < _tokenExpiresAt) return _accessToken;

  await loadScript('https://accounts.google.com/gsi/client');

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`Googleログインに失敗しました: ${resp.error}`));
          return;
        }
        _accessToken = resp.access_token;
        _tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        resolve(_accessToken);
      },
      error_callback: (err) => {
        reject(new Error(`Googleログインが中断されました: ${err.type || 'error'}`));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

// ===== Drive Picker =====

/**
 * GoogleドライブのPickerを開き、選択された動画/画像/音声ファイルを
 * CORS問題が発生しないよう Blob としてダウンロードして File で返す
 * @returns {Promise<File[]>} 選択されたファイル（キャンセル時は空配列）
 */
export async function pickFromGoogleDrive() {
  const { clientId, apiKey } = getDriveConfig();
  if (!clientId || !apiKey) {
    throw new Error('unconfigured');
  }

  const token = await getAccessToken(clientId);

  await loadScript('https://apis.google.com/js/api.js');
  await new Promise((resolve) => window.gapi.load('picker', resolve));

  // 特定フォルダ制限 (Folder Scoping): 設定されたフォルダID配下のみ表示
  const { folderId } = getDriveConfig();
  const MIME_FILTER = 'video/mp4,video/webm,image/png,image/jpeg,image/gif,audio/mp3,audio/wav,audio/m4a';

  const makeView = (viewId) => {
    const view = new google.picker.DocsView(viewId);
    if (folderId) {
      view.setParent(folderId);
    }
    view.setMimeTypes(MIME_FILTER);
    return view;
  };

  const docs = await new Promise((resolve) => {
    const builder = new google.picker.PickerBuilder()
      .setDeveloperKey(apiKey)
      .setOAuthToken(token)
      .addView(makeView(google.picker.ViewId.DOCS_IMAGES_AND_VIDEOS))
      .addView(makeView(google.picker.ViewId.AUDIO))
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          resolve(data[google.picker.Response.DOCUMENTS] || []);
        } else if (action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      });

    // フォルダID指定時はタイトルにフォルダ名を表示
    if (folderId) {
      builder.setTitle('Google Drive (指定フォルダ)');
    }

    const picker = builder.build();
    picker.setVisible(true);
  });

  if (docs.length === 0) return [];

  // API 経由で Blob としてダウンロード → blob: URL は同一扱いのため CORS 不要
  const files = await Promise.all(docs.map(async (doc) => {
    const id = doc[google.picker.Document.ID];
    const name = doc[google.picker.Document.NAME] || 'drive_file';
    const mime = doc[google.picker.Document.MIME_TYPE] || 'application/octet-stream';
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`「${name}」のダウンロードに失敗しました (${res.status})`);
    }
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type || mime });
  }));

  return files;
}

// ===== Google Drive への動画アップロード（コミュニティ投稿用）=====

/**
 * ファイルをGoogleドライブにアップロードする
 * @param {File} file アップロードするファイル
 * @returns {Promise<{id: string, name: string, mimeType: string}>}
 */
export async function uploadFileToDrive(file) {
  const { clientId } = getDriveConfig();
  if (!clientId) throw new Error('unconfigured');

  const token = await getAccessToken(clientId);

  const boundary = '-------' + Math.random().toString(36).slice(2);
  const metadata = { name: file.name, mimeType: file.type };

  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`アップロードに失敗しました (${res.status}): ${err}`);
  }
  const data = await res.json();
  return { id: data.id, name: data.name, mimeType: data.mimeType };
}

/**
 * ファイルを「リンクを知っている全員が閲覧可能」に設定する
 * @param {string} fileId Google Drive ファイルID
 */
export async function shareFilePublic(fileId) {
  const { clientId } = getDriveConfig();
  const token = await getAccessToken(clientId);

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`共有設定に失敗しました (${res.status}): ${err}`);
  }
  return res.json();
}

/**
 * Google Drive ファイルIDから再生可能なURLを生成する
 * @param {string} fileId Google Drive ファイルID
 * @returns {string} 動画再生用URL
 */
export function getDriveVideoUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
