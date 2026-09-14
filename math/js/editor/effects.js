// js/editor/effects.js — YMM4風エフェクト & アニメーション処理

/**
 * Easing functions
 */
export const easings = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  // Quad
  easeInQuad: t => t * t,
  easeOutQuad: t => 1 - (1 - t) * (1 - t),
  easeInOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  // Cubic
  easeInCubic: t => t * t * t,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Quart
  easeInQuart: t => t * t * t * t,
  easeOutQuart: t => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: t => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  // Expo
  easeInExpo: t => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  easeOutExpo: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  // Back
  easeInBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
  easeOutBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  easeInOutBack: t => {
    const c = 2.5949095;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  // Bounce
  bounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeOutBounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInBounce: t => 1 - easings.easeOutBounce(1 - t),
  // Elastic
  easeInElastic: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3);
  },
  easeOutElastic: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
  },
  // Sine
  sine: t => 1 - Math.cos((t * Math.PI) / 2),
  easeInSine: t => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: t => Math.sin((t * Math.PI) / 2),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
};

export const easingNames = {
  linear: 'リニア',
  easeIn: 'イーズイン',
  easeOut: 'イーズアウト',
  easeInOut: 'イーズインアウト',
  easeInQuad: 'イーズイン (Quad)',
  easeOutQuad: 'イーズアウト (Quad)',
  easeInOutQuad: 'イーズインアウト (Quad)',
  easeInCubic: 'イーズイン (Cubic)',
  easeOutCubic: 'イーズアウト (Cubic)',
  easeInOutCubic: 'イーズインアウト (Cubic)',
  easeInQuart: 'イーズイン (Quart)',
  easeOutQuart: 'イーズアウト (Quart)',
  easeInOutQuart: 'イーズインアウト (Quart)',
  easeInExpo: 'イーズイン (Expo)',
  easeOutExpo: 'イーズアウト (Expo)',
  easeInOutExpo: 'イーズインアウト (Expo)',
  easeInBack: 'イーズイン (Back)',
  easeOutBack: 'イーズアウト (Back)',
  easeInOutBack: 'イーズインアウト (Back)',
  easeOutBounce: 'バウンスアウト',
  easeInBounce: 'バウンスイン',
  easeInElastic: 'エラスティックイン',
  easeOutElastic: 'エラスティックアウト',
  sine: 'サイン',
  easeInSine: 'サインイン',
  easeOutSine: 'サインアウト',
  easeInOutSine: 'サインインアウト',
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

  // ドロップシャドウ / 発光
  if (fx.glow && fx.glow > 0) {
    ctx.shadowColor = fx.glowColor || '#cba6f7';
    ctx.shadowBlur = fx.glow * (canvasH / 360);
  } else if (fx.shadow) {
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
 * Canvas に図形クリップを描画（矩形・円・三角・星）
 */
export function drawShapeClip(ctx, clip, state, canvasW, canvasH) {
  const fx = clip.effects || {};
  const shape = clip.shape || 'rect';
  const size = (fx.fontSize || 100) * (canvasH / 360);
  const px = (clip.x ?? 0.5) * canvasW + state.offsetX;
  const py = (clip.y ?? 0.5) * canvasH + state.offsetY;

  ctx.save();
  ctx.globalAlpha = Math.max(0, state.alpha);
  ctx.translate(px, py);
  if (state.rotation) ctx.rotate(state.rotation * Math.PI / 180);
  ctx.scale(state.scaleX, state.scaleY);

  // 発光
  if (fx.glow && fx.glow > 0) {
    ctx.shadowColor = fx.glowColor || '#cba6f7';
    ctx.shadowBlur = fx.glow * (canvasH / 360);
  }

  ctx.fillStyle = fx.color || '#89b4fa';
  ctx.strokeStyle = fx.strokeColor || '#000';
  ctx.lineWidth = (fx.stroke || 0) * 2 * (canvasH / 360);
  ctx.lineJoin = 'round';

  const w = size, h = size;

  switch (shape) {
    case 'rect':
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (fx.stroke > 0) ctx.strokeRect(-w / 2, -h / 2, w, h);
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
      ctx.fill();
      if (fx.stroke > 0) ctx.stroke();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      if (fx.stroke > 0) ctx.stroke();
      break;
    case 'star':
      ctx.beginPath();
      const spikes = 5;
      const outerR = w / 2, innerR = w / 4;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      if (fx.stroke > 0) ctx.stroke();
      break;
  }
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
