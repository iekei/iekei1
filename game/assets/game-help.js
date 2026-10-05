(() => {
  const init = () => {
    const toggle = document.getElementById('game-help-toggle');
    const panel = document.getElementById('game-help');
    const close = document.getElementById('game-help-close');
    if (!toggle || !panel || !close) return;
    const setOpen = (open) => { panel.hidden = !open; toggle.hidden = open; toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => setOpen(true));
    close.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) setOpen(false); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
