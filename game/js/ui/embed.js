/**
 * ui/embed.js — game/index.html の「HOI4 大戦略」レイヤーに埋め込まれた際のブリッジ
 *
 * ゲーム本体（hoi4.html）は単独でも動く。?embed=1 が付いているときだけ、
 * 親ページ（game/index.html）とpostMessageで連携する。
 *
 *   親 → iframe : { type: 'hoi4:visibility', visible: boolean }
 *                 → 画面を閉じている間は時間進行を自動で一時停止し、再表示で再開
 *   親 → iframe : { type: 'hoi4:close' }   （現状は iframe 側からは送らない）
 *   iframe → 親 : { type: 'hoi4:ready' }   読み込み完了（親のスピナーを即時解除）
 *   iframe → 親 : { type: 'hoi4:close' }   Esc / 戻るボタンでカードゲームへ
 *
 * 注意: 自動停止は「親が止めた場合」だけ再開する。ユーザーが自分で
 * 一時停止していた場合は、閉じて開き直しても停止したままを維持する。
 */

export function initEmbedBridge() {
  const params = new URLSearchParams(location.search);
  if (params.get('embed') !== '1') return false;

  document.documentElement.classList.add('hoi4-embedded');

  let pausedByParent = false;
  let pendingVisibility = null;

  const post = (payload) => {
    try { window.parent.postMessage(payload, '*'); } catch { /* 親が存在しない */ }
  };

  const applyVisibility = (visible) => {
    const engine = window.GAME && window.GAME.engine;
    if (!engine) { pendingVisibility = visible; return; }

    if (!visible) {
      if (!engine.state.paused) {
        pausedByParent = true;
        engine.pause();
      }
    } else if (pausedByParent) {
      pausedByParent = false;
      engine.resume();
    }
  };

  window.addEventListener('message', (ev) => {
    if (ev.source !== window.parent || !ev.data) return;
    if (ev.data.type === 'hoi4:visibility') applyVisibility(ev.data.visible !== false);
  });

  // HOI4 側のウィンドウ/政治パネルが開いていないときだけ Esc で親画面を閉じる。
  // このリスナーは起動時に登録されるため、モーダル側の Esc ハンドラより先に走る。
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || ev.defaultPrevented) return;
    if (document.querySelector('.modal-overlay')) return;
    if (document.querySelector('#politics-panel.open')) return;
    if (document.querySelector('#generic-modal-overlay:not(.hidden)')) return;
    post({ type: 'hoi4:close' });
  });

  window.addEventListener('hoi4:ready', () => {
    if (pendingVisibility !== null) {
      const visible = pendingVisibility;
      pendingVisibility = null;
      applyVisibility(visible);
    }
    post({ type: 'hoi4:ready' });
  });

  return true;
}
