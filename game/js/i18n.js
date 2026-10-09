/**
 * i18n.js — hoidesigner.com 準拠 日本語ローカライズシステム
 *
 * - game/locales/ja.json を辞書としてロード
 * - t(key, vars): ドット記法キー + {変数} プレースホルダ補間
 * - apply(root): data-i18n / data-i18n-title / data-i18n-placeholder / data-i18n-html を DOM へ適用
 * - techName / techDesc / equipName: 研究・装備名の日本語解決
 */

import { $$ } from './util.js';

export const I18N = {
  dict: {},
  loaded: false,
  defaultLocale: 'ja',

  /** 辞書ファイルを読み込む（パスは game/locales/ja.json 固定） */
  async init(url = 'game/locales/ja.json') {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      this.dict = await res.json();
    } catch (e) {
      console.warn('[i18n] 辞書の読み込みに失敗。キーをそのまま表示します。', e);
      this.dict = {};
    }
    this.loaded = true;
    this.apply();
    return this.dict;
  },

  /** ドット記法で辞書引き + {var} 補間。未定義ならキー自体を返す */
  t(key, vars = {}) {
    if (key == null) return '';
    let node = this.dict;
    for (const part of String(key).split('.')) {
      if (node == null || typeof node !== 'object') { node = undefined; break; }
      node = node[part];
    }
    let str = typeof node === 'string' ? node : (typeof node === 'number' ? String(node) : null);
    if (str == null) {
      // フォールバック: 末尾キーのみで再検索（後方互換）
      const flat = this._flat();
      str = flat[key] ?? key;
    }
    return str.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? vars[name] : m));
  },

  _flatCache: null,
  _flat() {
    if (this._flatCache) return this._flatCache;
    const out = {};
    const walk = (obj, prefix) => {
      for (const [k, v] of Object.entries(obj || {})) {
        if (typeof v === 'string') out[`${prefix}${k}`] = v;
        else if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
      }
    };
    walk(this.dict, '');
    return (this._flatCache = out);
  },

  /** 研究技術名（ja.json 優先、なければ英語タイトル） */
  techName(id, enTitle = '') {
    return this.dict?.research?.tech_names?.[id] || enTitle || id;
  },

  /** 研究技術の説明文 */
  techDesc(id, fallback = '') {
    return this.dict?.research?.tech_descs?.[id] || fallback || this.t('research.desc_default');
  },

  /** 研究カテゴリ名 */
  categoryName(id) {
    return this.dict?.research?.categories?.[id] || id;
  },

  /** 装備名 */
  equipName(key) {
    return this.dict?.equipment?.names?.[key] || key;
  },

  /** 大隊名 */
  battalionName(id) {
    return this.dict?.division?.battalions?.[id]?.name || id;
  },

  /** 支援中隊名 */
  supportName(id) {
    return this.dict?.division?.support?.[id]?.name || id;
  },

  /** MIO企業名 / 特性名 */
  mioName(id) { return this.dict?.mio?.companies?.[id]?.name || id; },
  mioTraitName(id) { return this.dict?.mio?.traits?.[id]?.name || id; },
  mioTraitDesc(id) { return this.dict?.mio?.traits?.[id]?.desc || ''; },

  /** ドクトリン名 */
  doctrineName(id) { return this.dict?.doctrine?.nodes?.[id]?.name || id; },
  doctrineDesc(id) { return this.dict?.doctrine?.nodes?.[id]?.desc || ''; },

  /** 地形名 */
  terrainName(id) { return this.dict?.simulator?.terrain?.[id] || id; },
  weatherName(id) { return this.dict?.simulator?.weather?.[id] || id; },
  tacticName(id)  { return this.dict?.simulator?.tactics?.[id] || id; },

  /** 日本語の「残り日数」表記（独自研究日数単位） */
  daysLeft(days) {
    return this.t('research.days_left', { days: Math.max(0, Math.ceil(days)) });
  },

  /** DOM へ辞書を適用する */
  apply(root = document) {
    $$('[data-i18n]', root).forEach((n) => { n.textContent = this.t(n.dataset.i18n); });
    $$('[data-i18n-html]', root).forEach((n) => { n.innerHTML = this.t(n.dataset.i18nHtml); });
    $$('[data-i18n-title]', root).forEach((n) => { n.title = this.t(n.dataset.i18nTitle); });
    $$('[data-i18n-placeholder]', root).forEach((n) => { n.placeholder = this.t(n.dataset.i18nPlaceholder); });
  },

  /** 与えられたキーの辞書を再適用したい要素を登録してまとめて反映（動的再描画用） */
  refresh(root = document) { this.apply(root); },
};

/** 利便性のためのエイリアス */
export const t = (key, vars) => I18N.t(key, vars);

export default I18N;
