/** ui/modal.js — 統一スチールフレーム モーダルウィンドウ マネージャ */

import { el, $ } from '../util.js';
import { I18N } from '../i18n.js';

export class ModalManager {
  constructor() {
    this.layer = $('#modal-layer');
    this.stack = []; // {id, overlay, win, onClose, toggleId}
  }

  isOpen(id) { return this.stack.some((m) => m.id === id); }

  /** モーダルを開く。同じIDが開いていればトグル閉じ。 */
  toggle(id, { title = '', content = null, width = '', onClose = null, render = null } = {}) {
    if (this.isOpen(id)) { this.close(id); return false; }
    return this.open(id, { title, content, width, onClose, render });
  }

  open(id, { title = '', content = null, width = '', onClose = null, render = null } = {}) {
    // 同じトグルIDの他モーダルは閉じる（HOI4風: 画面は基本1つ）
    this.closeAll();

    const overlay = el('div', `modal-overlay ${width}`.trim());
    const frame = el('div', 'steel-frame');
    const inner = el('div', 'steel-inner');
    const titlebar = el('div', 'steel-titlebar');
    titlebar.appendChild(el('span', 'orn'));
    const titleEl = el('div', 'steel-title', title || id);
    titlebar.appendChild(titleEl);
    titlebar.appendChild(el('span', 'orn'));
    const closeBtn = el('button', 'steel-close', '✕');
    closeBtn.title = I18N.t('ui.close');
    closeBtn.addEventListener('click', () => this.close(id));
    titlebar.appendChild(closeBtn);
    const body = el('div', 'steel-body');
    inner.appendChild(titlebar);
    inner.appendChild(body);
    frame.appendChild(inner);
    overlay.appendChild(frame);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.close(id); });

    this.layer.appendChild(overlay);
    const modal = { id, overlay, win: frame, body, titleEl, onClose };
    this.stack.push(modal);

    if (render) render(body, modal);
    else if (content) body.appendChild(content);
    I18N.apply(body);

    // ESC で閉じる
    const onKey = (e) => { if (e.key === 'Escape') { this.close(id); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    modal._onKey = onKey;

    return true;
  }

  setTitle(id, title) {
    const m = this.stack.find((x) => x.id === id);
    if (m) m.titleEl.textContent = title;
  }

  /** body を再描画（タブ切替などで使用） */
  rerender(id, renderFn) {
    const m = this.stack.find((x) => x.id === id);
    if (!m) return;
    m.body.innerHTML = '';
    renderFn(m.body, m);
    I18N.apply(m.body);
  }

  close(id) {
    const idx = this.stack.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const [m] = this.stack.splice(idx, 1);
    if (m._onKey) document.removeEventListener('keydown', m._onKey);
    m.overlay.remove();
    try { m.onClose?.(); } catch (e) { console.error(e); }
  }

  closeAll() { [...this.stack].forEach((m) => this.close(m.id)); }

  get top() { return this.stack[this.stack.length - 1] || null; }
}
