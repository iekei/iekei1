/** Shared touch/wheel navigation. Tap remains a click; a drag suppresses it. */
export function gestures(element, read, write, min = .4, max = 4) {
  let previous, moved = false;
  const sample = touches => {
    const rect = element.getBoundingClientRect(), a = touches[0], b = touches[1] || a;
    return { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top,
      distance: touches.length > 1 ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0, count: touches.length };
  };
  const zoom = (p, factor, dx = 0, dy = 0) => {
    const v = read(), scale = Math.max(min, Math.min(max, v.scale * factor)), ratio = scale / v.scale;
    write({ scale, x: p.x - (p.x - v.x) * ratio + dx, y: p.y - (p.y - v.y) * ratio + dy });
  };
  element.style.touchAction = 'none';
  element.addEventListener('touchstart', e => { previous = sample(e.touches); moved = false; }, { passive: true });
  element.addEventListener('touchmove', e => {
    const p = sample(e.touches);
    if (previous && previous.count === p.count) {
      const dx = p.x - previous.x, dy = p.y - previous.y;
      if (Math.hypot(dx, dy) > 2 || p.count > 1) moved = true;
      if (moved) { e.preventDefault(); zoom(previous, p.distance && previous.distance ? p.distance / previous.distance : 1, dx, dy); }
    }
    previous = p;
  }, { passive: false });
  element.addEventListener('touchend', e => { previous = e.touches.length ? sample(e.touches) : null; });
  element.addEventListener('touchcancel', () => { previous = null; moved = false; });
  element.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopImmediatePropagation(); moved = false; } }, true);
  element.addEventListener('wheel', e => {
    if (!e.ctrlKey && element.tagName.toLowerCase() !== 'svg') return;
    e.preventDefault(); const rect = element.getBoundingClientRect();
    zoom({ x: e.clientX - rect.left, y: e.clientY - rect.top }, Math.exp(-e.deltaY * .002));
  }, { passive: false });
}

export function enableTreeGestures(viewport) {
  let scale = 1;
  viewport.classList.add('tree-viewport');
  const apply = () => {
    const canvas = viewport.querySelector('.tree-stage');
    if (canvas) canvas.style.zoom = scale;
  };
  gestures(viewport, () => ({ scale, x: -viewport.scrollLeft, y: -viewport.scrollTop }), v => {
    scale = v.scale; apply(); viewport.scrollLeft = -v.x; viewport.scrollTop = -v.y;
  });
  new MutationObserver(apply).observe(viewport, { childList: true });
  return viewport;
}
