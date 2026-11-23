/**
 * High-performance HTML5 Canvas Drawing Engine for Scratchpad.
 * Uses tiled CanvasPattern for O(1) paper rendering, theme-adaptive ink color mapping,
 * and reusable offscreen compositing for smooth 60–120fps drawing.
 */

export const PAPER_COLORS = {
  dark: {
    bg: '#0f1115',
    dot: 'rgba(255, 255, 255, 0.13)',
    line: 'rgba(255, 255, 255, 0.065)',
  },
  light: {
    bg: '#ffffff',
    dot: 'rgba(15, 23, 42, 0.17)',
    line: 'rgba(15, 23, 42, 0.08)',
  },
};

// Paired dark <-> light ink palette (Excalidraw / tldraw style)
const DARK_TO_LIGHT_MAP = {
  '#f8fafc': '#1e1e1e',
  '#f4f4f6': '#1e1e1e',
  '#ffffff': '#1e1e1e',
  '#fafafa': '#1e1e1e',
  '#94a3b8': '#868e96',
  '#ff6b6b': '#e03131',
  '#ffa94d': '#f08c00',
  '#ffd43b': '#eab308',
  '#51cf66': '#2f9e44',
  '#20c997': '#099268',
  '#4dabf7': '#1971c2',
  '#38bdf8': '#0ea5e9',
  '#f06595': '#e64980',
};

const LIGHT_TO_DARK_MAP = {
  '#1e1e1e': '#f8fafc',
  '#111827': '#f8fafc',
  '#0f172a': '#f8fafc',
  '#18181b': '#f8fafc',
  '#000000': '#f8fafc',
  '#111111': '#f8fafc',
  '#868e96': '#94a3b8',
  '#e03131': '#ff6b6b',
  '#f08c00': '#ffa94d',
  '#eab308': '#ffd43b',
  '#2f9e44': '#51cf66',
  '#099268': '#20c997',
  '#1971c2': '#4dabf7',
  '#0ea5e9': '#38bdf8',
  '#e64980': '#f06595',
};

function parseHexRgb(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return null;
  let clean = hex.slice(1).trim();
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return null;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Dynamically adapts stroke ink colors so notes written in Dark Mode remain
 * crisp and legible in Light Mode (and vice versa), without mutating saved data.
 */
export function resolveStrokeColor(color, darkMode, tool = 'pen') {
  if (!color || tool === 'eraser' || tool === 'highlighter') return color;
  const lower = color.toLowerCase();

  if (darkMode && LIGHT_TO_DARK_MAP[lower]) {
    return LIGHT_TO_DARK_MAP[lower];
  }
  if (!darkMode && DARK_TO_LIGHT_MAP[lower]) {
    return DARK_TO_LIGHT_MAP[lower];
  }

  const rgb = parseHexRgb(lower);
  if (!rgb) return color;
  const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];

  if (!darkMode && luminance > 228) {
    return '#1e1e1e';
  }
  if (darkMode && luminance < 40) {
    return '#f8fafc';
  }
  return color;
}

// Reusable offscreen stroke buffer to avoid per-frame GPU texture allocations
let sharedStrokeCanvas = null;

function getStrokeBuffer(pixelW, pixelH) {
  if (!sharedStrokeCanvas) {
    sharedStrokeCanvas = document.createElement('canvas');
  }
  const w = Math.max(1, pixelW);
  const h = Math.max(1, pixelH);
  if (sharedStrokeCanvas.width !== w || sharedStrokeCanvas.height !== h) {
    sharedStrokeCanvas.width = w;
    sharedStrokeCanvas.height = h;
  } else {
    const sCtx = sharedStrokeCanvas.getContext('2d');
    sCtx.setTransform(1, 0, 0, 1, 0, 0);
    sCtx.clearRect(0, 0, w, h);
  }
  return sharedStrokeCanvas;
}

/**
 * Draws paper background (blank, dotted, grid, ruled) in O(1) using a tiled CanvasPattern
 * transformed into world space so it scales & pans instantaneously at 120fps.
 */
export function drawPaperBackground(ctx, width, height, panX, panY, zoom, paperStyle, darkMode) {
  const palette = darkMode ? PAPER_COLORS.dark : PAPER_COLORS.light;

  ctx.save();
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  if (!paperStyle || paperStyle === 'blank') {
    ctx.restore();
    return;
  }

  const spacing = paperStyle === 'ruled' ? 32 : 24;
  const tile = document.createElement('canvas');
  tile.width = spacing;
  tile.height = spacing;
  const tCtx = tile.getContext('2d');

  if (paperStyle === 'dotted') {
    tCtx.fillStyle = palette.dot;
    tCtx.beginPath();
    tCtx.arc(spacing / 2, spacing / 2, Math.max(0.85, 1.15 / Math.sqrt(zoom)), 0, Math.PI * 2);
    tCtx.fill();
  } else if (paperStyle === 'grid') {
    tCtx.strokeStyle = palette.line;
    tCtx.lineWidth = Math.max(0.5, 1 / zoom);
    tCtx.beginPath();
    tCtx.moveTo(0, 0);
    tCtx.lineTo(spacing, 0);
    tCtx.moveTo(0, 0);
    tCtx.lineTo(0, spacing);
    tCtx.stroke();
  } else if (paperStyle === 'ruled') {
    tCtx.strokeStyle = palette.line;
    tCtx.lineWidth = Math.max(0.5, 1 / zoom);
    tCtx.beginPath();
    tCtx.moveTo(0, spacing - 0.5);
    tCtx.lineTo(spacing, spacing - 0.5);
    tCtx.stroke();
  }

  const pattern = ctx.createPattern(tile, 'repeat');
  if (pattern) {
    ctx.scale(zoom, zoom);
    ctx.translate(panX, panY);
    ctx.fillStyle = pattern;
    ctx.fillRect(-panX, -panY, width / zoom, height / zoom);
  }

  ctx.restore();
}

/**
 * Draws a single incremental quadratic segment for ultra-low-latency live ink rendering.
 */
export function renderLiveSegment(ctx, pts, stroke, darkMode = true) {
  if (!pts || pts.length === 0) return;

  const tool = stroke.tool || 'pen';
  const baseWidth = stroke.width || 2.5;
  const resolvedColor = resolveStrokeColor(stroke.color, darkMode, tool);

  ctx.save();
  ctx.lineCap = tool === 'highlighter' ? 'butt' : 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = resolvedColor;
  ctx.fillStyle = resolvedColor;
  ctx.globalAlpha =
    tool === 'highlighter'
      ? stroke.opacity ?? 0.36
      : tool === 'pencil'
      ? stroke.opacity ?? 0.78
      : stroke.opacity ?? 1;

  if (stroke.isGlow) {
    ctx.shadowBlur = baseWidth * 1.6;
    ctx.shadowColor = resolvedColor;
  }

  const len = pts.length;
  if (len === 1) {
    const r = Math.max(0.6, (baseWidth * (pts[0].p || 0.75)) / 2);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (len === 2) {
    const p0 = pts[0];
    const p1 = pts[1];
    const avgP = Math.max(0.2, Math.min(1.5, ((p0.p ?? 0.75) + (p1.p ?? 0.75)) / 2));
    const widthFactor = tool === 'pencil' ? 0.65 + avgP * 0.55 : 0.45 + avgP * 0.85;
    ctx.lineWidth = tool === 'highlighter' ? baseWidth : Math.max(0.6, baseWidth * widthFactor);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const p0 = pts[len - 3];
  const p1 = pts[len - 2];
  const p2 = pts[len - 1];
  const mid1X = (p0.x + p1.x) / 2;
  const mid1Y = (p0.y + p1.y) / 2;
  const mid2X = (p1.x + p2.x) / 2;
  const mid2Y = (p1.y + p2.y) / 2;

  const avgP = Math.max(0.2, Math.min(1.5, ((p1.p ?? 0.75) + (p2.p ?? 0.75)) / 2));
  const widthFactor = tool === 'pencil' ? 0.65 + avgP * 0.55 : 0.45 + avgP * 0.85;
  ctx.lineWidth = tool === 'highlighter' ? baseWidth : Math.max(0.6, baseWidth * widthFactor);

  ctx.beginPath();
  ctx.moveTo(mid1X, mid1Y);
  ctx.quadraticCurveTo(p1.x, p1.y, mid2X, mid2Y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders a complete stroke with smooth quadratic midpoint curves.
 * Uses a single continuous path whenever pressure is uniform or opacity < 1 (Pencil/Highlighter)
 * so round line caps never overlap and create dot artifacts even at 500% zoom.
 */
export function renderStroke(ctx, stroke, darkMode = true) {
  if (!stroke || !stroke.points || stroke.points.length === 0) return;

  const pts = stroke.points;
  const tool = stroke.tool || 'pen';
  const baseWidth = stroke.width || 2.5;
  const resolvedColor = resolveStrokeColor(stroke.color, darkMode, tool);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.globalAlpha = 1;
  } else if (tool === 'highlighter') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = resolvedColor;
    ctx.fillStyle = resolvedColor;
    ctx.globalAlpha = stroke.opacity ?? 0.36;
    ctx.lineCap = 'butt';
  } else if (tool === 'pencil') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = resolvedColor;
    ctx.fillStyle = resolvedColor;
    ctx.globalAlpha = stroke.opacity ?? 0.78;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = resolvedColor;
    ctx.fillStyle = resolvedColor;
    ctx.globalAlpha = stroke.opacity ?? 1;
  }

  if (stroke.isGlow && tool !== 'eraser') {
    ctx.shadowBlur = baseWidth * 1.6;
    ctx.shadowColor = resolvedColor;
  } else {
    ctx.shadowBlur = 0;
  }

  if (stroke.strokeStyle === 'dashed' && tool !== 'eraser') {
    ctx.setLineDash([Math.max(4, baseWidth * 2.8), Math.max(4, baseWidth * 2.1)]);
  } else if (stroke.strokeStyle === 'dotted' && tool !== 'eraser') {
    ctx.setLineDash([0.5, Math.max(4, baseWidth * 2.1)]);
  }

  if (pts.length === 1) {
    const r = Math.max(0.5, (baseWidth * (pts[0].p || 0.75)) / 2);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (stroke.isShape || pts.length === 2) {
    const strokeW =
      tool === 'highlighter'
        ? baseWidth
        : Math.max(0.6, baseWidth * ((pts[0].p + pts[pts.length - 1].p) / 2));

    ctx.beginPath();
    ctx.lineWidth = strokeW;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (stroke.fill && stroke.isShape && pts.length > 3 && !stroke.arrowHeads) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fill();
      ctx.restore();
    }
    ctx.stroke();

    // Render crisp tldraw-style solid arrowheads cleanly on top of shaft
    if (stroke.arrowHeads && pts.length >= 2) {
      ctx.setLineDash([]);
      const drawHead = (tip, tail) => {
        const segLen = Math.hypot(tip.x - tail.x, tip.y - tail.y);
        if (segLen < 2) return;
        const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
        const headLen = Math.min(26, Math.max(10, strokeW * 4.2));
        const spread = Math.PI / 5.5;
        ctx.beginPath();
        ctx.moveTo(tip.x - headLen * Math.cos(angle - spread), tip.y - headLen * Math.sin(angle - spread));
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(tip.x - headLen * Math.cos(angle + spread), tip.y - headLen * Math.sin(angle + spread));
        ctx.stroke();
      };

      if (stroke.arrowHeads === 'end' || stroke.arrowHeads === 'both') {
        drawHead(pts[pts.length - 1], pts[pts.length - 2]);
      }
      if (stroke.arrowHeads === 'both') {
        drawHead(pts[0], pts[1]);
      }
      if (stroke.arrowHeads === 'axes' && pts.length >= 3) {
        drawHead(pts[0], pts[1]);
        drawHead(pts[pts.length - 1], pts[pts.length - 2]);
      }
    }

    ctx.restore();
    return;
  }

  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i].p ?? 0.75;
    if (p < minP) minP = p;
    if (p > maxP) maxP = p;
  }
  const hasVariablePressure = maxP - minP > 0.06 && tool !== 'highlighter' && tool !== 'pencil';

  // Single continuous smooth quadratic path: zero overlapping caps / zero dot artifacts
  if (!hasVariablePressure) {
    const avgP = (minP + maxP) / 2;
    const widthFactor = tool === 'pencil' ? 0.65 + avgP * 0.55 : 0.45 + avgP * 0.85;
    ctx.lineWidth = tool === 'highlighter' ? baseWidth : Math.max(0.6, baseWidth * widthFactor);

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  let prevMidX = pts[0].x;
  let prevMidY = pts[0].y;

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;

    const avgPressure = Math.max(0.2, Math.min(1.5, ((prev.p ?? 0.75) + (curr.p ?? 0.75)) / 2));
    ctx.lineWidth = Math.max(0.6, baseWidth * (0.45 + avgPressure * 0.85));

    ctx.beginPath();
    ctx.moveTo(prevMidX, prevMidY);
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.stroke();

    prevMidX = midX;
    prevMidY = midY;
  }

  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.moveTo(prevMidX, prevMidY);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws selection handles or lock badge around an image in world coordinates.
 */
export function renderImageOverlay(ctx, img, isSelected, zoom) {
  if (!img.locked && !isSelected) return;

  ctx.save();
  if (img.locked) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.strokeRect(img.x, img.y, img.width, img.height);
    ctx.setLineDash([]);

    const badgeSize = 22 / zoom;
    const bx = img.x + img.width - badgeSize - 6 / zoom;
    const by = img.y + 6 / zoom;

    ctx.fillStyle = 'rgba(17, 18, 20, 0.78)';
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeSize, badgeSize, 5 / zoom);
    ctx.fill();

    const cx = bx + badgeSize / 2;
    const cy = by + badgeSize / 2;
    const lw = badgeSize * 0.44;
    const lh = badgeSize * 0.34;

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6 / zoom;
    ctx.beginPath();
    ctx.arc(cx, cy - lh * 0.32, lw * 0.38, Math.PI, 0);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(cx - lw / 2, cy - lh * 0.15, lw, lh * 1.05, 2 / zoom);
    ctx.fill();
  } else if (isSelected) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.strokeRect(img.x, img.y, img.width, img.height);
    ctx.setLineDash([]);

    const handleSize = 9 / zoom;
    const corners = [
      [img.x, img.y],
      [img.x + img.width, img.y],
      [img.x, img.y + img.height],
      [img.x + img.width, img.y + img.height],
    ];
    corners.forEach(([hx, hy]) => {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.8 / zoom;
      ctx.beginPath();
      ctx.roundRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize, 2.5 / zoom);
      ctx.fill();
      ctx.stroke();
    });
  }
  ctx.restore();
}

/**
 * Renders a complete page (paper + images + strokes) into a target canvas context.
 */
export function renderPageToContext(
  ctx,
  page,
  width,
  height,
  {
    panX = 0,
    panY = 0,
    zoom = 1,
    dpr = 1,
    darkMode = true,
    includePaper = true,
    imageCache = {},
    selectedElementId = null,
    activeStroke = null,
    onImageLoad = null,
  }
) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (includePaper) {
    drawPaperBackground(ctx, width, height, panX, panY, zoom, page?.paperStyle || 'dotted', darkMode);
  }

  if (!page) {
    ctx.restore();
    return;
  }

  // Draw images directly onto main canvas
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(panX, panY);

  if (Array.isArray(page.images)) {
    page.images.forEach((img) => {
      let imgObj = imageCache[img.id];
      if (!imgObj) {
        imgObj = new Image();
        imgObj.src = img.src;
        if (onImageLoad) imgObj.onload = onImageLoad;
        imageCache[img.id] = imgObj;
      }
      if (imgObj.complete && imgObj.naturalWidth > 0) {
        ctx.drawImage(imgObj, img.x, img.y, img.width, img.height);
        renderImageOverlay(ctx, img, selectedElementId === img.id, zoom);
      }
    });
  }
  ctx.restore();

  const hasStrokes = (Array.isArray(page.strokes) && page.strokes.length > 0) || Boolean(activeStroke);
  if (!hasStrokes) {
    ctx.restore();
    return;
  }

  // Reuse shared offscreen buffer so erasers erase only strokes, never paper or images
  const strokeCanvas = getStrokeBuffer(Math.round(width * dpr), Math.round(height * dpr));
  const sCtx = strokeCanvas.getContext('2d');
  sCtx.save();
  sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sCtx.scale(zoom, zoom);
  sCtx.translate(panX, panY);

  if (Array.isArray(page.strokes)) {
    for (let i = 0; i < page.strokes.length; i++) {
      renderStroke(sCtx, page.strokes[i], darkMode);
    }
  }
  if (activeStroke) {
    renderStroke(sCtx, activeStroke, darkMode);
  }
  sCtx.restore();

  ctx.drawImage(strokeCanvas, 0, 0, width, height);
  ctx.restore();
}

/**
 * Light exponential smoothing that removes micro-jitter without introducing trailing cursor lag.
 */
export function smoothPoint(prev, next, factor = 0.14) {
  if (!prev) return next;
  return {
    x: prev.x + (next.x - prev.x) * (1 - factor),
    y: prev.y + (next.y - prev.y) * (1 - factor),
    p: prev.p + (next.p - prev.p) * 0.5,
  };
}
