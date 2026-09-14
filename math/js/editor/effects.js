// js/editor/effects.js — YMM4風エフェクト & アニメーション処理

/**
 * Easing functions
 */
export const easings = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  bounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

/**
 * 出現アニメーションタイプ
 */
export const animationTypes = {
  none: 'なし',
  fade: 'フェードイン',
  typing: 'タイピング風',
  slide: 'スライドイン',
  scale: '拡大出現',
  drop: 'ドロップ',
};

/**
 * クリップのエフェクト設定を適用し、描画用パラメータを計算
 * @param {object} clip - クリップオブジェクト
 * @param {number} localTime - クリップ内の経過時間(秒)
 * @returns {object} 描画用 transform/alpha/state
 */
export function computeEffect(clip, localTime) {
  const fx = clip.effects || {};
  const dur = clip.duration || 3;
  const inDur = fx.fadeIn || 0;
  const outDur = fx.fadeOut || 0;

  // --- Alpha (fade in/out) ---
  let alpha = fx.opacity ?? 1;
  if (inDur > 0 && localTime < inDur) {
    alpha *= easings.easeOut(localTime / inDur);
  }
  if (outDur > 0 && localTime > dur - outDur) {
    alpha *= easings.easeIn(Math.max(0, (dur - localTime) / outDur));
  }

  // --- 出現アニメーション ---
  const anim = fx.animation || 'none';
  const animDur = fx.animDuration || 0.5;
  let animProgress = 1;
  if (anim !== 'none' && animDur > 0) {
    animProgress = Math.min(1, localTime / animDur);
  }
  const e = easings[fx.animEasing || 'easeOut'](animProgress);

  let scaleX = fx.scale ?? 1, scaleY = fx.scale ?? 1;
  let offsetX = 0, offsetY = 0, rotation = fx.rotation || 0;
  let revealChars = -1; // -1 = full text

  switch (anim) {
    case 'fade':
      alpha *= animProgress;
      break;
    case 'typing':
      revealChars = Math.floor(animProgress * (clip.text?.length || 0));
      break;
    case 'slide':
      offsetX = (1 - e) * 200;
      break;
    case 'scale':
      scaleX *= e; scaleY *= e;
      break;
    case 'drop':
      offsetY = (1 - e) * -150;
      break;
  }

  // --- 振動(揺れ) ---
  if (fx.shake && fx.shake > 0) {
    const t = localTime * 30;
    offsetX += Math.sin(t) * fx.shake;
    offsetY += Math.cos(t * 1.3) * fx.shake;
  }

  // --- パルス(拡大縮小イージング) ---
  if (fx.pulse && fx.pulse > 0) {
    const p = 1 + Math.sin(localTime * 4) * fx.pulse * 0.15;
    scaleX *= p; scaleY *= p;
  }

  return { alpha, scaleX, scaleY, offsetX, offsetY, rotation, revealChars };
}

/**
 * Canvas にテキストクリップを描画（縁取り・ドロップシャドウ含む）
 */
export function drawTextClip(ctx, clip, state, canvasW, canvasH) {
  const fx = clip.effects || {};
  const text = clip.text || '';
  const displayText = state.revealChars >= 0 ? text.slice(0, state.revealChars) : text;
  if (!displayText) return;

  const fontSize = (fx.fontSize || 48) * (canvasH / 360);
  const fontFamily = fx.fontFamily || '"M PLUS 1p", "Noto Sans JP", sans-serif';
  ctx.font = `${fx.fontWeight || 700} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const px = (clip.x ?? 0.5) * canvasW + state.offsetX;
  const py = (clip.y ?? 0.5) * canvasH + state.offsetY;

  ctx.save();
  ctx.globalAlpha = Math.max(0, state.alpha);
  ctx.translate(px, py);
  if (state.rotation) ctx.rotate(state.rotation * Math.PI / 180);
  ctx.scale(state.scaleX, state.scaleY);

  // ドロップシャドウ
  if (fx.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8 * (canvasH / 360);
    ctx.shadowOffsetX = 3 * (canvasH / 360);
    ctx.shadowOffsetY = 3 * (canvasH / 360);
  }

  // 境界線(縁取り)
  if (fx.stroke && fx.stroke > 0) {
    ctx.strokeStyle = fx.strokeColor || '#000';
    ctx.lineWidth = fx.stroke * 2 * (canvasH / 360);
    ctx.lineJoin = 'round';
    ctx.strokeText(displayText, 0, 0);
    ctx.shadowColor = 'transparent';
  }

  // メイン文字
  ctx.fillStyle = fx.color || '#ffffff';
  ctx.fillText(displayText, 0, 0);
  ctx.restore();
}

/**
 * 数式を「=」や改行で分割し、各パートを1秒ずつずらした連続クリップ配列を生成
 * @param {string} formula - 例: "a²+b²=c²" または "y=mx+n\n(直線)"
 * @param {number} startTrack - 開始トラックindex
 * @param {number} startTime - 開始時刻(秒)
 * @param {number} interval - 出現間隔(秒)
 * @param {string} animType - アニメーション種別
 * @returns {Array} クリップ配列
 */
export function buildAutoSequence(formula, startTrack, startTime, interval = 1, animType = 'fade') {
  // 「=」で分割、さらに改行で分割
  const parts = formula.split(/[=\n]/).map(s => s.trim()).filter(Boolean);
  const clips = [];
  let t = startTime;
  parts.forEach((part, i) => {
    clips.push({
      id: crypto.randomUUID(),
      type: 'text',
      text: part,
      track: startTrack,
      start: t,
      duration: (parts.length - i) * interval + 2, // 後ろのパートほど長く残る
      x: 0.5, y: 0.5,
      effects: {
        animation: animType,
        animDuration: 0.5,
        animEasing: 'easeOut',
        fontSize: 48,
        color: '#ffffff',
        stroke: 2,
        strokeColor: '#000',
      },
    });
    t += interval;
  });
  return clips;
}
