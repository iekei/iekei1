// js/editor/google-drive.js — Googleドライブ連携 (OAuth 2.0 + Picker API)

const CONFIG_KEY = 'mathclip_gdrive_config';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

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

  const docs = await new Promise((resolve) => {
    const picker = new google.picker.PickerBuilder()
      .setDeveloperKey(apiKey)
      .setOAuthToken(token)
      .addView(new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES_AND_VIDEOS))
      .addView(new google.picker.DocsView(google.picker.ViewId.AUDIO))
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          resolve(data[google.picker.Response.DOCUMENTS] || []);
        } else if (action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
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
