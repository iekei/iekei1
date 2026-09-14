// js/editor/theme.js — ライト/ダークモード切り替え

const THEME_KEY = 'mathclip_theme';

/**
 * テーマを初期化（LocalStorageから復元 + トグルボタン登録）
 */
export function initTheme() {
  // 早期適用は HTML 内のインラインスクリプトで行う
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);

  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
    });
  }
}

function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('light', 'dark');
  html.classList.add(theme);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    btn.title = theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え';
  }
}
