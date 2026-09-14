// js/editor/effects-panel.js — モジュール化エフェクトパネル（追加・削除方式）

const EFFECT_DEFS = [
  { id: 'shadow',    name: '🌟 ドロップシャドウ', types: ['text', 'image', 'video', 'gb', 'shape', 'graph'] },
  { id: 'shake',     name: '📳 振動・揺れ',       types: ['text', 'image', 'video', 'gb', 'shape', 'graph'] },
  { id: 'pulse',     name: '💓 パルス',           types: ['text', 'image', 'video', 'gb', 'shape', 'graph'] },
  { id: 'rotation',  name: '🔄 回転',             types: ['text', 'image', 'video', 'gb', 'shape', 'graph'] },
  { id: 'chromakey', name: '🟢 クロマキー',       types: ['gb', 'video'] },
  { id: 'glow',      name: '✨ 発光',             types: ['text', 'shape'] },
];

export function getAvailableEffects(clip) {
  return EFFECT_DEFS.filter(e => e.types.includes(clip.type));
}

export function getAppliedEffects(clip) {
  const fx = clip.effects || (clip.effects = {});
  if (!fx.appliedEffects) {
    fx.appliedEffects = [];
    // Backward compat: auto-detect from old flat format
    if (fx.shadow) fx.appliedEffects.push('shadow');
    if (fx.shake > 0) fx.appliedEffects.push('shake');
    if (fx.pulse > 0) fx.appliedEffects.push('pulse');
    if (fx.rotation) fx.appliedEffects.push('rotation');
    if (fx.keyColor) fx.appliedEffects.push('chromakey');
  }
  return fx.appliedEffects;
}

export function renderEffectsSection(clip) {
  const applied = getAppliedEffects(clip);
  let html = '<div class="effects-section">';

  for (const effectId of applied) {
    html += _renderCard(clip, effectId);
  }

  const available = getAvailableEffects(clip).filter(e => !applied.includes(e.id));
  if (available.length > 0) {
    html += `
      <div class="effect-add-area">
        <button id="btn-add-effect" class="effect-add-btn">＋ エフェクトを追加</button>
        <div id="effect-menu" class="effect-menu hidden">
          ${available.map(e => `<button data-effect-id="${e.id}" class="effect-menu-item">${e.name}</button>`).join('')}
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}

function _renderCard(clip, effectId) {
  const fx = clip.effects;
  const def = EFFECT_DEFS.find(e => e.id === effectId);
  if (!def) return '';

  let inner = '';
  switch (effectId) {
    case 'shadow':
      inner = `<div class="prop-row"><label>有効</label><input type="checkbox" id="fx-shadow" ${fx.shadow ? 'checked' : ''} /></div>`;
      break;
    case 'shake':
      inner = `<div class="prop-row"><label>強度</label><input type="range" id="fx-shake" min="0" max="20" step="1" value="${fx.shake || 0}" /></div>`;
      break;
    case 'pulse':
      inner = `<div class="prop-row"><label>強度</label><input type="range" id="fx-pulse" min="0" max="1" step="0.05" value="${fx.pulse || 0}" /></div>`;
      break;
    case 'rotation':
      inner = `<div class="prop-row"><label>角度(度)</label><input type="range" id="fx-rotation" min="-180" max="180" step="1" value="${fx.rotation || 0}" /></div>`;
      break;
    case 'chromakey':
      inner = `
        <div class="prop-row"><label>キー色</label><input type="color" id="fx-keyColor" value="${fx.keyColor || '#00b140'}" /></div>
        <div class="prop-row"><label>しきい値</label><input type="range" id="fx-chromaThreshold" min="0" max="1" step="0.05" value="${fx.chromaThreshold ?? 0.4}" /></div>
        <div class="prop-row"><label>スピル抑制</label><input type="range" id="fx-chromaSpill" min="0" max="1" step="0.05" value="${fx.chromaSpill ?? 0.5}" /></div>`;
      break;
    case 'glow':
      inner = `
        <div class="prop-row"><label>強度</label><input type="range" id="fx-glow" min="0" max="30" step="1" value="${fx.glow || 0}" /></div>
        <div class="prop-row"><label>色</label><input type="color" id="fx-glowColor" value="${fx.glowColor || '#cba6f7'}" /></div>`;
      break;
  }

  return `
    <div class="effect-card" data-effect="${effectId}">
      <div class="effect-card-header">
        <span>${def.name}</span>
        <button class="effect-card-delete" data-effect-id="${effectId}" title="削除">🗑</button>
      </div>
      <div class="effect-card-body">${inner}</div>
    </div>`;
}

export function bindEffectEvents(timeline, clip) {
  const fx = clip.effects;

  // Add effect button + menu
  const addBtn = document.getElementById('btn-add-effect');
  const menu = document.getElementById('effect-menu');
  if (addBtn && menu) {
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    menu.querySelectorAll('.effect-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const effectId = item.dataset.effectId;
        const applied = getAppliedEffects(clip);
        if (!applied.includes(effectId)) {
          applied.push(effectId);
          _setDefaults(fx, effectId);
          timeline.app.markDirty();
          timeline.renderProperties();
        }
      });
    });
    setTimeout(() => {
      document.addEventListener('click', () => menu.classList.add('hidden'), { once: true });
    }, 0);
  }

  // Delete effect buttons
  document.querySelectorAll('.effect-card-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const effectId = btn.dataset.effectId;
      const applied = getAppliedEffects(clip);
      const idx = applied.indexOf(effectId);
      if (idx >= 0) applied.splice(idx, 1);
      _resetEffect(fx, effectId);
      timeline.app.markDirty();
      timeline.renderProperties();
    });
  });

  // Bind effect inputs
  const bind = (id, key, parse = parseFloat) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (el.type === 'checkbox') fx[key] = el.checked;
      else fx[key] = el.type === 'color' ? el.value : parse(el.value);
      timeline.app.markDirty();
      timeline.render();
    });
  };

  bind('fx-shadow', 'shadow');
  bind('fx-shake', 'shake');
  bind('fx-pulse', 'pulse');
  bind('fx-rotation', 'rotation');
  bind('fx-keyColor', 'keyColor', v => v);
  bind('fx-chromaThreshold', 'chromaThreshold');
  bind('fx-chromaSpill', 'chromaSpill');
  bind('fx-glow', 'glow');
  bind('fx-glowColor', 'glowColor', v => v);
}

function _setDefaults(fx, effectId) {
  switch (effectId) {
    case 'shadow': fx.shadow = true; break;
    case 'shake': fx.shake = 5; break;
    case 'pulse': fx.pulse = 0.3; break;
    case 'rotation': fx.rotation = 0; break;
    case 'chromakey': fx.keyColor = '#00b140'; fx.chromaThreshold = 0.4; fx.chromaSpill = 0.5; break;
    case 'glow': fx.glow = 10; fx.glowColor = '#cba6f7'; break;
  }
}

function _resetEffect(fx, effectId) {
  switch (effectId) {
    case 'shadow': fx.shadow = false; break;
    case 'shake': fx.shake = 0; break;
    case 'pulse': fx.pulse = 0; break;
    case 'rotation': fx.rotation = 0; break;
    case 'chromakey': delete fx.keyColor; delete fx.chromaThreshold; delete fx.chromaSpill; break;
    case 'glow': fx.glow = 0; delete fx.glowColor; break;
  }
}
