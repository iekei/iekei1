/**
 * image-loader.js
 * 大量画像の軽量・安全な読み込みシステム
 *
 * 機能:
 * 1. 遅延読み込み (Lazy Loading) — IntersectionObserver で画面内表示時にロード
 * 2. 動的ロード (Dynamic Load) — タブ/画面オープン時にカテゴリ単位でロード
 * 3. 事前読み込み (Preload) — トップバーなど必須UI画像を初期ロード
 * 4. キャッシュ制御 — in-memory Map + ブラウザキャッシュ + バージョンバスティング
 */

class ImageLoader {

  // in-memory キャッシュ (URL → { loaded: boolean, blob?: Blob })
  static cache = new Map();

  // 読み込み済みカテゴリ (重複ロード防止)
  static loadedCategories = new Set();

  // IntersectionObserver インスタンス (遅延読み込み用)
  static observer = null;

  // バージョン (キャッシュバスティング用 — アセット更新時に上げる)
  static VERSION = '1';

  // プレースホルダー画像 (1x1 transparent PNG data URI)
  static PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  // ── 初期化 ──
  static init() {
    // IntersectionObserver をセットアップ (遅延読み込み用)
    if ('IntersectionObserver' in window) {
      ImageLoader.observer = new IntersectionObserver(
        ImageLoader._onIntersect,
        { rootMargin: '50px', threshold: 0.01 }
      );
    }
  }

  // ── 1. 事前読み込み (Preload) ──
  // トップバーなど常に表示される必須UI画像を初期ロード
  static preload(urls) {
    if (!Array.isArray(urls)) urls = [urls];
    return Promise.all(urls.map(url => ImageLoader._loadImage(ImageLoader._cacheBust(url))));
  }

  // ── 2. 遅延読み込み (Lazy Loading) ──
  // <img> 要素に data-src を設定し、画面内に入ったら src をセット
  static observe(imgEl) {
    if (!imgEl || !imgEl.dataset.src) return;
    // すでに src が設定済みならスキップ
    if (imgEl.src && !imgEl.src.endsWith(ImageLoader.PLACEHOLDER)) return;

    // プレースホルダーをセット
    if (!imgEl.src) imgEl.src = ImageLoader.PLACEHOLDER;
    imgEl.loading = 'lazy'; // ネイティブ lazy loading も併用

    if (ImageLoader.observer) {
      ImageLoader.observer.observe(imgEl);
    } else {
      // IntersectionObserver 非対応環境は即時ロード
      ImageLoader._setSrc(imgEl);
    }
  }

  // 複数の <img> 要素を一括で監視
  static observeAll(selector) {
    const imgs = document.querySelectorAll(selector + ' img[data-src], ' + selector + '[data-src]');
    imgs.forEach(img => ImageLoader.observe(img));
  }

  // ── 3. 動的ロード (Dynamic Load) ──
  // タブ/画面オープン時にカテゴリ単位で画像をロード
  static loadCategory(categoryId, options = {}) {
    // 重複ロード防止 (一度ロードしたカテゴリはスキップ)
    if (ImageLoader.loadedCategories.has(categoryId) && !options.force) {
      return Promise.resolve();
    }
    ImageLoader.loadedCategories.add(categoryId);

    const cat = AssetRegistry.getCategory(categoryId);
    if (!cat) return Promise.resolve();

    // カテゴリ内の <img data-src> 要素をすべてアクティベート
    const container = options.container
      ? (typeof options.container === 'string' ? document.querySelector(options.container) : options.container)
      : document;
    if (!container) return Promise.resolve();

    const imgs = container.querySelectorAll('img[data-src]');
    const promises = [];
    imgs.forEach(img => {
      ImageLoader._setSrc(img);
      promises.push(ImageLoader._loadImage(ImageLoader._cacheBust(img.dataset.src)));
    });

    return Promise.all(promises);
  }

  // ── 4. キャッシュ制御 ──
  // 画像URLにバージョンパラメータを付与してブラウザキャッシュを制御
  static _cacheBust(url) {
    if (!url || url.startsWith('data:')) return url;
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'v=' + ImageLoader.VERSION;
  }

  // 画像をロードしてキャッシュに記録
  static _loadImage(url) {
    if (ImageLoader.cache.has(url)) {
      return Promise.resolve(ImageLoader.cache.get(url));
    }
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        ImageLoader.cache.set(url, { loaded: true });
        resolve({ loaded: true });
      };
      img.onerror = () => {
        ImageLoader.cache.set(url, { loaded: false });
        resolve({ loaded: false });
      };
      img.src = url;
    });
  }

  // <img> 要素の data-src を src に移動 (遅延ロード実行)
  static _setSrc(imgEl) {
    if (!imgEl || !imgEl.dataset.src) return;
    const url = ImageLoader._cacheBust(imgEl.dataset.src);
    imgEl.src = url;
    imgEl.removeAttribute('data-src');
  }

  // IntersectionObserver コールバック
  static _onIntersect(entries, observer) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        ImageLoader._setSrc(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }

  // ── ヘルパー: HTML生成 ──
  // 遅延読み込み対応の <img> タグを生成
  static lazyImg(src, alt, cls = '', attrs = {}) {
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => ' ' + k + '="' + v + '"').join('');
    return '<img src="' + ImageLoader.PLACEHOLDER + '" data-src="' + src + '"' +
      ' alt="' + (alt || '') + '" class="' + cls + '"' + attrStr + ' loading="lazy">';
  }

  // エラー時フォールバック付き <img> タグ (attrs は省略可能な追加属性)
  static lazyImgWithFallback(src, fallback, alt, cls = '', attrs = {}) {
    const attrStr = Object.entries(attrs || {})
      .map(([k, v]) => ' ' + k + '="' + v + '"').join('');
    return '<img src="' + ImageLoader.PLACEHOLDER + '" data-src="' + src + '"' +
      ' onerror="this.onerror=null;this.src=\'' + fallback + '\'"' +
      ' alt="' + (alt || '') + '" class="' + cls + '" loading="lazy"' + attrStr + '>';
  }

  // ── カテゴリ別動的ロードの登録 ──
  // タブオープン時に呼び出すコールバックを登録
  static tabLoadCallbacks = {};

  static onTabOpen(tabId, callback) {
    ImageLoader.tabLoadCallbacks[tabId] = callback;
  }

  static triggerTabLoad(tabId) {
    if (ImageLoader.tabLoadCallbacks[tabId]) {
      ImageLoader.tabLoadCallbacks[tabId]();
    }
  }
}

// グローバル公開
if (typeof window !== 'undefined') window.ImageLoader = ImageLoader;
