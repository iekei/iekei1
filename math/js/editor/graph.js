// js/editor/graph.js — 動的グラフ作成機能（数式パース・Canvas描画・アニメーション）

/**
 * 数式をコンパイルして関数を返す
 * @param {string} expr - 例: "y = sin(x)", "y = x^2 + 2x - 1"
 * @returns {Function|null} f(x) => number
 */
export function compileExpression(expr) {
  try {
    let body = (expr || '').replace(/^y\s*=\s*/, '').trim();
    if (!body) return null;

    // ^ → **
    body = body.replace(/\^/g, '**');

    // 暗黙の乗算: 2x → 2*x, 3(x+1) → 3*(x+1), )( → )*(
    body = body.replace(/(\d)\s*([a-zA-Z(])/g, '$1*$2');
    body = body.replace(/\)\s*([a-zA-Z(\d])/g, ')*$1');

    // 定数: pi → Math.PI
    body = body.replace(/\bpi\b/gi, 'Math.PI');

    // 関数を一括で Math.* に置換（長い名前から先に matching で重複回避）
    const funcMap = {
      log10: 'Math.log10', log2: 'Math.log2',
      asin: 'Math.asin', acos: 'Math.acos', atan: 'Math.atan',
      sinh: 'Math.sinh', cosh: 'Math.cosh', tanh: 'Math.tanh',
      sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan',
      exp: 'Math.exp', sqrt: 'Math.sqrt', cbrt: 'Math.cbrt',
      abs: 'Math.abs', floor: 'Math.floor', ceil: 'Math.ceil',
      round: 'Math.round', sign: 'Math.sign',
      min: 'Math.min', max: 'Math.max', pow: 'Math.pow',
      atan2: 'Math.atan2',
      log: 'Math.log10', // 一般対数（常用対数）
      ln: 'Math.log',   // 自然対数
    };
    const names = Object.keys(funcMap).sort((a, b) => b.length - a.length);
    const re = new RegExp(`\\b(${names.join('|')})\\b`, 'g');
    body = body.replace(re, (m) => funcMap[m]);

    // 定数 e → Math.E（関数置換後なので Math.exp の e は影響しない）
    body = body.replace(/\be\b/g, 'Math.E');

    const fn = new Function('x', `"use strict"; return (${body});`);

    // 妥当性チェック
    const test = fn(1);
    if (typeof test !== 'number') return null;
    return fn;
  } catch (e) {
    console.error('[graph] Expression compile error:', e);
    return null;
  }
}

/**
 * グリッド間隔の「きれいな」ステップを計算
 */
function niceStep(range) {
  const raw = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}

/**
 * 注釈を1つ描画
 */
function drawAnnotation(ctx, ann, toX, toY, scale) {
  ctx.save();
  switch (ann.type) {
    case 'text': {
      ctx.fillStyle = ann.color || '#ffffff';
      ctx.font = `${(ann.fontSize || 16) * scale}px "Noto Sans JP", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ann.text || '', toX(ann.x), toY(ann.y));
      break;
    }
    case 'point': {
      ctx.fillStyle = ann.color || '#f38ba8';
      ctx.beginPath();
      ctx.arc(toX(ann.x), toY(ann.y), (ann.size || 5) * scale, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'line': {
      ctx.strokeStyle = ann.color || '#a6adc8';
      ctx.lineWidth = (ann.width || 2) * scale;
      ctx.setLineDash(ann.dashed ? [6 * scale, 4 * scale] : []);
      ctx.beginPath();
      ctx.moveTo(toX(ann.x1), toY(ann.y1));
      ctx.lineTo(toX(ann.x2), toY(ann.y2));
      ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.strokeStyle = ann.color || '#f9e2af';
      ctx.fillStyle = ann.color || '#f9e2af';
      ctx.lineWidth = (ann.width || 2) * scale;
      ctx.beginPath();
      ctx.moveTo(toX(ann.x1), toY(ann.y1));
      ctx.lineTo(toX(ann.x2), toY(ann.y2));
      ctx.stroke();
      // 矢印の先端
      const dx = toX(ann.x2) - toX(ann.x1);
      const dy = toY(ann.y2) - toY(ann.y1);
      const angle = Math.atan2(dy, dx);
      const head = 10 * scale;
      ctx.beginPath();
      ctx.moveTo(toX(ann.x2), toY(ann.y2));
      ctx.lineTo(toX(ann.x2) - head * Math.cos(angle - 0.4), toY(ann.y2) - head * Math.sin(angle - 0.4));
      ctx.lineTo(toX(ann.x2) - head * Math.cos(angle + 0.4), toY(ann.y2) - head * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'region': {
      if (ann.points && ann.points.length >= 3) {
        ctx.fillStyle = ann.color || 'rgba(137, 180, 250, 0.2)';
        ctx.beginPath();
        ctx.moveTo(toX(ann.points[0].x), toY(ann.points[0].y));
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(toX(ann.points[i].x), toY(ann.points[i].y));
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

/**
 * グラフクリップをCanvasに描画（アニメーション付き）
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} clip - グラフクリップ
 * @param {number} localTime - クリップ内経過時間(秒)
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function drawGraph(ctx, clip, localTime, canvasW, canvasH) {
  const g = clip.graph || {};
  const fn = compileExpression(g.expression || '');

  const scale = canvasH / 360;
  const xRange = g.xRange || [-5, 5];
  const yRange = g.yRange || [-3, 3];

  // グラフをクリップ位置を中心に84%サイズで描画（移動・リサイズ対応）
  const graphW = canvasW * 0.84;
  const graphH = canvasH * 0.84;
  const cx = (clip.x ?? 0.5) * canvasW;
  const cy = (clip.y ?? 0.5) * canvasH;

  const pad = 0.08;
  const plotW = graphW * (1 - 2 * pad);
  const plotH = graphH * (1 - 2 * pad);
  const ox = cx - graphW / 2 + graphW * pad;
  const oy = cy - graphH / 2 + graphH * pad;

  const toX = (x) => ox + ((x - xRange[0]) / (xRange[1] - xRange[0])) * plotW;
  const toY = (y) => oy + plotH - ((y - yRange[0]) / (yRange[1] - yRange[0])) * plotH;

  // アニメーション進行
  const drawDur = g.drawDuration || 2;
  const axisDur = Math.min(0.5, drawDur * 0.25);
  const axisProgress = Math.min(1, localTime / axisDur);
  const curveProgress = axisProgress >= 1
    ? Math.min(1, (localTime - axisDur) / Math.max(0.1, drawDur - axisDur))
    : 0;

  ctx.save();

  // 全体の不透明度（フェードアニメーション等）
  const fx = clip.effects || {};
  let baseAlpha = fx.opacity ?? 1;
  const anim = fx.animation || 'none';
  const animDur = fx.animDuration || 0.5;
  if (anim === 'fade' && localTime < animDur) baseAlpha *= localTime / animDur;
  ctx.globalAlpha = Math.max(0, baseAlpha);

  // 位置・拡大縮小（cx/cyは上部で定義済み）
  const sc = fx.scale ?? 1;
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  ctx.translate(-cx, -cy);

  // --- グリッド ---
  if (g.showGrid !== false && axisProgress > 0) {
    ctx.strokeStyle = g.gridColor || '#313244';
    ctx.lineWidth = 1;
    ctx.globalAlpha = baseAlpha * axisProgress;
    const xStep = niceStep(xRange[1] - xRange[0]);
    for (let x = Math.ceil(xRange[0] / xStep) * xStep; x <= xRange[1]; x += xStep) {
      const px = toX(x);
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + plotH); ctx.stroke();
    }
    const yStep = niceStep(yRange[1] - yRange[0]);
    for (let y = Math.ceil(yRange[0] / yStep) * yStep; y <= yRange[1]; y += yStep) {
      const py = toY(y);
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + plotW, py); ctx.stroke();
    }
  }

  // --- 軸 ---
  if (axisProgress > 0) {
    ctx.strokeStyle = g.axisColor || '#a6adc8';
    ctx.lineWidth = 2 * scale;
    ctx.globalAlpha = baseAlpha * axisProgress;
    // X軸 (y=0)
    if (yRange[0] <= 0 && yRange[1] >= 0) {
      const py = toY(0);
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + plotW, py); ctx.stroke();
    }
    // Y軸 (x=0)
    if (xRange[0] <= 0 && xRange[1] >= 0) {
      const px = toX(0);
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + plotH); ctx.stroke();
    }
  }

  // --- 曲線 ---
  if (fn && curveProgress > 0) {
    ctx.strokeStyle = g.curveColor || '#89b4fa';
    ctx.lineWidth = (g.curveWidth || 3) * scale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = baseAlpha;

    const steps = 300;
    const drawSteps = Math.floor(steps * curveProgress);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= drawSteps; i++) {
      const x = xRange[0] + (i / steps) * (xRange[1] - xRange[0]);
      const y = fn(x);
      if (typeof y !== 'number' || !isFinite(y)) { started = false; continue; }
      const px = toX(x);
      const py = toY(Math.max(yRange[0] - 1, Math.min(yRange[1] + 1, y)));
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (!fn) {
    // 数式エラー表示
    ctx.fillStyle = '#f38ba8';
    ctx.font = `${18 * scale}px "Noto Sans JP", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('数式エラー', canvasW / 2, canvasH / 2);
  }

  // --- 注釈 ---
  if (curveProgress > 0) {
    ctx.globalAlpha = baseAlpha * curveProgress;
    for (const ann of (g.annotations || [])) {
      drawAnnotation(ctx, ann, toX, toY, scale);
    }
  }

  ctx.restore();
}
