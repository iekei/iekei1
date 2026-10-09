/** util.js — 共通ユーティリティ */

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** DOM 要素を素早く生成する */
export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

/** 3桁区切り数値フォーマット */
export const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

/** パーセント表示 */
export const fmtPct = (ratio, digits = 0) =>
  (ratio * 100).toFixed(digits).replace(/\.0$/, '') + '%';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const pad2 = (n) => String(n).padStart(2, '0');

let _uid = 0;
export function uid(prefix = 'id') { return `${prefix}-${++_uid}-${Math.random().toString(36).slice(2, 7)}`; }

/** 簡易イベントバス */
export class Bus {
  constructor() { this._map = new Map(); }
  on(ev, fn) {
    if (!this._map.has(ev)) this._map.set(ev, new Set());
    this._map.get(ev).add(fn);
    return () => this.off(ev, fn);
  }
  off(ev, fn) { this._map.get(ev)?.delete(fn); }
  emit(ev, ...args) { this._map.get(ev)?.forEach((fn) => { try { fn(...args); } catch (e) { console.error(e); } }); }
}

/** localStorage ラッパー（JSON） */
export const store = {
  get(key, dflt) {
    try { const v = localStorage.getItem(key); return v == null ? dflt : JSON.parse(v); }
    catch { return dflt; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/** 画像要素（読み込み失敗時は自動でフォールバック表示に置換） */
export function img(path, alt = '', cls = '', fallbackText = '?') {
  const n = el('img');
  n.alt = alt;
  if (cls) n.className = cls;
  n.loading = 'lazy';
  n.addEventListener('error', () => {
    n.replaceWith(Object.assign(el('span', 'mono dim'), { textContent: fallbackText, title: path }));
  });
  n.src = path;
  return n;
}

/** 複数候補パスを順に試す画像（全滅したらフォールバック文字） */
export function imgChain(paths, alt = '', cls = '', fallbackText = '?') {
  const n = el('img');
  n.alt = alt;
  if (cls) n.className = cls;
  n.loading = 'lazy';
  let i = 0;
  n.addEventListener('error', () => {
    i += 1;
    if (i < paths.length) n.src = paths[i];
    else n.replaceWith(Object.assign(el('span', 'mono dim'), { textContent: fallbackText, title: paths.join(' | ') }));
  });
  n.src = paths[0];
  return n;
}

/** ダイスロール (min..max の整数) */
export const dice = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/** 確率ロール (0..1 < p なら true) */
export const roll = (p) => Math.random() < p;

/** 配列から重み付き抽選 */
export function weightedPick(list, weightFn) {
  const total = list.reduce((s, x) => s + weightFn(x), 0);
  let r = Math.random() * total;
  for (const x of list) { r -= weightFn(x); if (r <= 0) return x; }
  return list[list.length - 1];
}

/** 深いマージ（設定上書き用） */
export function deepMerge(base, ...overs) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const o of overs) {
    for (const [k, v] of Object.entries(o || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = deepMerge(out[k], v);
      } else out[k] = v;
    }
  }
  return out;
}

/**簡易トースト通知 */
export function toast(message, kind = 'info') {
  const layer = $('#toast-layer');
  if (!layer) return;
  const t = el('div', `toast ${kind}`, message);
  layer.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 3200);
  setTimeout(() => t.remove(), 3700);
}
