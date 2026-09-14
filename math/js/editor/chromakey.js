// js/editor/chromakey.js — クロマキー(グリーンスクリーン)キーイング処理

/**
 * Canvas のピクセルデータから指定色を透過する
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement|HTMLVideoElement|ImageBitmap} source
 * @param {object} opts
 * @param {string} opts.keyColor - キー色 "#00FF00"
 * @param {number} opts.threshold - 色距離しきい値(0-1)
 * @param {number} opts.smooth - エッジスムージング(0-1)
 * @param {number} opts.spill - スピル抑制(0-1)
 */
export function applyChromakey(ctx, source, opts = {}) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.drawImage(source, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const [kr, kg, kb] = hexToRgb(opts.keyColor || '#00ff00');
  const threshold = (opts.threshold ?? 0.4) * 441.67; // max RGB distance ≈ 441.67
  const smooth = opts.smooth ?? 0.1;
  const spill = opts.spill ?? 0.5;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2);

    if (dist < threshold) {
      // 完全透過
      data[i + 3] = 0;
    } else if (dist < threshold + smooth * 100) {
      // エッジ: 距離に応じて半透明
      const a = (dist - threshold) / (smooth * 100);
      data[i + 3] = Math.min(255, Math.max(0, a * 255));
      // スピル抑制: 緑成分を赤/青の平均に近づける
      if (spill > 0) {
        const avg = (r + b) / 2;
        data[i + 1] = g + (avg - g) * spill;
      }
    } else if (spill > 0) {
      // スピル抑制(非透過領域も緑かぶりを補正)
      const greenExcess = g - (r + b) / 2;
      if (greenExcess > 20) {
        data[i + 1] = g - greenExcess * spill * 0.5;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * CSS filter文字列を生成(軽量クロマキー代替)
 */
export function chromaKeyCSSFilter(opts = {}) {
  const threshold = opts.threshold ?? 0.4;
  // chromakey: 緑を透過する近似フィルタ
  return `hue-rotate(${opts.hue || 0}deg) saturate(${1 + (opts.saturation || 0)})`;
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

/**
 * オフスクリーンキャンバスでクロマキー処理済みフレームを取得
 * (毎フレーム呼び出し用 — sourceがvideoの場合)
 */
export function chromakeyFrame(source, w, h, opts) {
  const off = getOffscreen(w, h);
  const octx = off.getContext('2d');
  octx.clearRect(0, 0, w, h);
  applyChromakey(octx, source, opts);
  return off;
}

const offscreenCache = new Map();
function getOffscreen(w, h) {
  const key = `${w}x${h}`;
  let c = offscreenCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    offscreenCache.set(key, c);
  }
  return c;
}
