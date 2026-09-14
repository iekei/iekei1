// js/editor/keyboard.js — キーボードショートカット & ヘルプモーダル

export class KeyboardShortcuts {
  constructor(app) {
    this.app = app;
    this.clipboard = null;
    this._bind();
  }

  _isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
  }

  _bind() {
    document.addEventListener('keydown', (e) => this._handle(e));
  }

  _handle(e) {
    const tl = this.app.timeline;
    if (!tl) return;
    const isMac = navigator.platform.includes('Mac');
    const ctrl = isMac ? e.metaKey : e.ctrlKey;
    const inputFocused = this._isInputFocused();

    // Space: play/pause (suppress when typing in inputs)
    if (e.code === 'Space' && !inputFocused) {
      e.preventDefault();
      tl.togglePlay();
      return;
    }

    // Delete/Backspace: delete selected clip (suppress in inputs)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inputFocused) {
      e.preventDefault();
      if (tl.selectedClip) tl.removeClip(tl.selectedClip.id);
      return;
    }

    // Arrow keys: move playhead (suppress in inputs)
    if (!inputFocused) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        tl.seek(tl.currentTime - (e.shiftKey ? 1 : 0.1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        tl.seek(tl.currentTime + (e.shiftKey ? 1 : 0.1));
        return;
      }
    }

    // Undo: Ctrl+Z / Cmd+Z
    if (ctrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      this.app.undoRedo?.undo();
      return;
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z / Cmd+Shift+Z
    if ((ctrl && (e.key === 'y' || e.key === 'Y')) || (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
      e.preventDefault();
      this.app.undoRedo?.redo();
      return;
    }

    // Copy: Ctrl+C / Cmd+C (suppress in inputs)
    if (ctrl && (e.key === 'c' || e.key === 'C') && !inputFocused) {
      e.preventDefault();
      if (tl.selectedClip) {
        const clip = tl.selectedClip;
        this.clipboard = {
          data: JSON.parse(JSON.stringify(clip, (k, v) => k.startsWith('_') ? undefined : v)),
          media: { _img: clip._img, _video: clip._video, _audio: clip._audio },
        };
      }
      return;
    }

    // Paste: Ctrl+V / Cmd+V (suppress in inputs)
    if (ctrl && (e.key === 'v' || e.key === 'V') && !inputFocused) {
      e.preventDefault();
      if (this.clipboard) {
        const clip = {
          ...JSON.parse(JSON.stringify(this.clipboard.data)),
          ...this.clipboard.media,
        };
        clip.id = crypto.randomUUID();
        clip.start = tl.currentTime;
        clip.track = tl.tracks.length - 1;
        tl.addClip(clip);
      }
      return;
    }
  }
}

/** ショートカットヘルプモーダルの初期化 */
export function initShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  const btn = document.getElementById('btn-shortcuts');
  const closeBtn = document.getElementById('shortcuts-close');
  if (!modal || !btn) return;

  btn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  });
  closeBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  });
}
