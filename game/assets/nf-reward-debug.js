'use strict';

(() => {
  const state = { entries: [] };
  const isTextField = target => target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
  const stringify = value => {
    try { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
    catch { return String(value); }
  };
  const add = (message, data) => {
    state.entries.push({ time: new Date().toLocaleTimeString('ja-JP'), message, data });
    if (state.entries.length > 100) state.entries.shift();
    render();
  };
  const render = () => {
    const output = document.getElementById('nf-reward-debug-output');
    if (!output) return;
    output.textContent = state.entries.length
      ? state.entries.map(entry => `[${entry.time}] ${entry.message}${entry.data === undefined ? '' : `\n${stringify(entry.data)}`}`).join('\n\n')
      : 'まだログはありません。国家方針ツリーを読み込むか、方針を完了してください。';
    output.scrollTop = output.scrollHeight;
  };
  const open = () => {
    const panel = document.getElementById('nf-reward-debug');
    if (!panel) return;
    panel.hidden = false;
    render();
    document.getElementById('nf-reward-debug-close')?.focus();
  };
  const toggle = () => {
    const panel = document.getElementById('nf-reward-debug');
    if (panel) panel.hidden = !panel.hidden;
    if (panel && !panel.hidden) render();
  };
  const init = () => {
    const panel = document.createElement('section');
    panel.id = 'nf-reward-debug';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'nf-reward-debug-title');
    panel.innerHTML = `<div class="nf-reward-debug-card"><header><h2 id="nf-reward-debug-title">completion_reward 確認ログ</h2><button type="button" id="nf-reward-debug-close" aria-label="閉じる">×</button></header><p>「/」で開閉。国家方針の読み込み・完了時に取得した報酬を表示します。</p><pre id="nf-reward-debug-output"></pre><footer><button type="button" id="nf-reward-debug-clear">ログを消去</button><button type="button" id="nf-reward-debug-refresh">現在の状態を確認</button></footer></div>`;
    const style = document.createElement('style');
    style.textContent = `#nf-reward-debug{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:18px;font-family:system-ui,sans-serif}#nf-reward-debug[hidden]{display:none}.nf-reward-debug-card{width:min(760px,96vw);max-height:min(78vh,680px);display:flex;flex-direction:column;background:#17212a;color:#e8edf0;border:1px solid #7897a5;box-shadow:0 12px 40px #000;border-radius:4px}.nf-reward-debug-card header,.nf-reward-debug-card footer{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #38515d}.nf-reward-debug-card footer{border:0;border-top:1px solid #38515d;justify-content:flex-end;gap:8px}.nf-reward-debug-card h2{font-size:16px;margin:0;color:#f1c75b}.nf-reward-debug-card p{font-size:12px;margin:0;padding:10px 14px;color:#b5c4ca}.nf-reward-debug-card button{background:#263943;color:#fff;border:1px solid #7897a5;padding:6px 10px;cursor:pointer}.nf-reward-debug-card button:hover{background:#38515d}.nf-reward-debug-card header button{font-size:20px;padding:0 8px;border:0}.nf-reward-debug-card pre{margin:0 14px 14px;padding:12px;min-height:220px;overflow:auto;white-space:pre-wrap;background:#0b1115;color:#b9f2c8;font:12px/1.5 ui-monospace,SFMono-Regular,monospace}`;
    document.head.appendChild(style); document.body.appendChild(panel);
    document.getElementById('nf-reward-debug-close').addEventListener('click', () => { panel.hidden = true; });
    document.getElementById('nf-reward-debug-clear').addEventListener('click', () => { state.entries.length = 0; render(); });
    document.getElementById('nf-reward-debug-refresh').addEventListener('click', () => add('現在の NFRewardLoader 状態', { ready: window.NFRewardLoaderReady === true, cacheCountries: [...(window.NFRewardLoader?.cache?.keys?.() || [])] }));
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !isTextField(event.target)) { event.preventDefault(); toggle(); }
      if (event.key === 'Escape' && !panel.hidden) panel.hidden = true;
    });
    window.addEventListener('nf-reward-debug', event => add(event.detail?.message || 'イベント', event.detail?.data));
    add('デバッグウィンドウを初期化しました');
    window.NFRewardDebug = { add, open };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
